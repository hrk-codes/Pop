import {
  PROTOCOL_VERSION,
  type ContextObservation,
  type PlatformId,
  type ProtocolEnvelope,
} from '@pop/protocol';

import type { AdapterStatus, ContentMessage, PopupMessage } from './messages';
import { BROWSER_PLATFORMS, platformForHostname } from './platforms';

const CORE_URL = 'ws://127.0.0.1:17831';
const CONTENT_SCRIPT_IDS = BROWSER_PLATFORMS.map((platform) => `pop-${platform.id.toLowerCase()}`);
let socket: WebSocket | null = null;
let status: AdapterStatus = { state: 'DISCONNECTED' };
let reconnectTimer: number | undefined;
const pendingEnvelopes: ProtocolEnvelope[] = [];

function setStatus(next: AdapterStatus): void {
  status = next;
  void chrome.runtime.sendMessage({ type: 'POP_STATUS_CHANGED', status }).catch(() => undefined);
}

function envelope(
  message:
    | { type: 'CONTEXT'; payload: ContextObservation }
    | {
        type: 'PLATFORM_PERMISSION';
        payload: {
          platformId: Exclude<PlatformId, 'VSCODE' | 'CURSOR'>;
          enabled: boolean;
        };
      }
    | { type: 'UI_COMMAND'; payload: { command: 'SHOW' } },
): ProtocolEnvelope {
  return {
    version: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    source: 'CHROME',
    timestamp: Date.now(),
    ...message,
  } as ProtocolEnvelope;
}

function sendOrQueue(message: ProtocolEnvelope): void {
  if (!socket || socket.readyState !== WebSocket.OPEN || status.state !== 'CONNECTED') {
    pendingEnvelopes.push(message);
    pendingEnvelopes.splice(0, Math.max(0, pendingEnvelopes.length - 12));
    connect();
    return;
  }
  socket.send(JSON.stringify(message));
}

async function credentials(): Promise<{ pairingCode?: string; sessionToken?: string }> {
  return chrome.storage.local.get(['pairingCode', 'sessionToken']);
}

async function replacePairingCredential(pairingCode: string): Promise<void> {
  await chrome.storage.local.remove('sessionToken');
  await chrome.storage.local.set({ pairingCode });
  socket?.close();
  socket = null;
  connect();
}

async function recoverExpiredSession(): Promise<void> {
  await chrome.storage.local.remove('sessionToken');
  const stored = await credentials();
  if (!stored.pairingCode) {
    setStatus({ state: 'PAIRING_REQUIRED' });
    socket?.close();
    return;
  }
  socket?.close();
  socket = null;
  connect();
}

async function register(): Promise<void> {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const stored = await credentials();
  if (!stored.pairingCode && !stored.sessionToken) {
    setStatus({ state: 'PAIRING_REQUIRED' });
    socket.close();
    return;
  }
  const registration: ProtocolEnvelope = {
    version: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    source: 'CHROME',
    type: 'REGISTER',
    timestamp: Date.now(),
    payload: stored.sessionToken
      ? { sessionToken: stored.sessionToken }
      : { pairingCode: stored.pairingCode! },
  };
  socket.send(JSON.stringify(registration));
}

async function hasPlatformAccess(origin: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [origin] });
}

async function syncRegisteredScripts(): Promise<void> {
  await chrome.scripting
    .unregisterContentScripts({ ids: CONTENT_SCRIPT_IDS })
    .catch(() => undefined);
  for (const platform of BROWSER_PLATFORMS) {
    if (!(await hasPlatformAccess(platform.origin))) continue;
    await chrome.scripting.registerContentScripts([
      {
        id: `pop-${platform.id.toLowerCase()}`,
        matches: [platform.origin],
        js: ['content.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
  }
}

async function syncCorePlatformPermissions(): Promise<void> {
  for (const platform of BROWSER_PLATFORMS) {
    sendOrQueue(
      envelope({
        type: 'PLATFORM_PERMISSION',
        payload: { platformId: platform.id, enabled: await hasPlatformAccess(platform.origin) },
      }),
    );
  }
}

function connect(): void {
  if (
    socket &&
    (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
  )
    return;
  globalThis.clearTimeout(reconnectTimer);
  setStatus({ state: 'CONNECTING' });
  socket = new WebSocket(CORE_URL);

  socket.addEventListener('open', () => void register());
  socket.addEventListener('message', (event) => {
    let message: unknown;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      setStatus({ state: 'ERROR', detail: 'POP Core returned invalid data.' });
      return;
    }
    if (typeof message !== 'object' || message === null) return;
    const response = message as Record<string, unknown>;
    if (response.type === 'REGISTERED' && typeof response.sessionToken === 'string') {
      void chrome.storage.local.set({ sessionToken: response.sessionToken });
      void chrome.storage.local.remove('pairingCode');
      setStatus({ state: 'CONNECTED' });
      for (const pending of pendingEnvelopes.splice(0)) sendOrQueue(pending);
      void syncCorePlatformPermissions();
    } else if (response.type === 'ACK') {
      setStatus({ state: 'CONNECTED' });
    } else if (response.type === 'ERROR') {
      const code = typeof response.code === 'string' ? response.code : 'REQUEST_REJECTED';
      setStatus({ state: 'ERROR', detail: code.replaceAll('_', ' ').toLowerCase() });
      if (code === 'INVALID_SESSION_TOKEN') {
        void recoverExpiredSession();
      } else if (code === 'UNSUPPORTED_PROTOCOL_VERSION') {
        void chrome.storage.local.remove(['sessionToken', 'pairingCode']);
      }
    }
  });
  socket.addEventListener('close', () => {
    if (status.state !== 'PAIRING_REQUIRED') setStatus({ state: 'DISCONNECTED' });
    reconnectTimer = globalThis.setTimeout(connect, 3_000);
  });
  socket.addEventListener('error', () =>
    setStatus({ state: 'ERROR', detail: 'POP Core is offline.' }),
  );
}

chrome.runtime.onMessage.addListener(
  (message: ContentMessage | PopupMessage, sender, sendResponse) => {
    if (message.type === 'POP_CONTEXT') {
      const senderUrl = sender.tab?.url;
      if (!senderUrl) return false;
      const platform = platformForHostname(new URL(senderUrl).hostname);
      if (!platform || platform.id !== message.observation.platformId) return false;
      sendOrQueue(envelope({ type: 'CONTEXT', payload: message.observation }));
    }
    if (message.type === 'POP_OPEN_UI') {
      if (sender.tab?.url)
        sendOrQueue(envelope({ type: 'UI_COMMAND', payload: { command: 'SHOW' } }));
    }
    if (message.type === 'POP_PAIR') {
      if (sender.url !== chrome.runtime.getURL('popup.html')) return false;
      void replacePairingCredential(message.pairingCode);
    }
    if (message.type === 'POP_PLATFORM_CHANGED') {
      if (sender.url !== chrome.runtime.getURL('popup.html')) return false;
      void syncRegisteredScripts().then(() =>
        sendOrQueue(
          envelope({
            type: 'PLATFORM_PERMISSION',
            payload: { platformId: message.platformId, enabled: message.enabled },
          }),
        ),
      );
    }
    if (message.type === 'POP_STATUS') sendResponse(status);
    return message.type === 'POP_STATUS';
  },
);

chrome.runtime.onInstalled.addListener(() => void syncRegisteredScripts());
chrome.runtime.onStartup.addListener(() => void syncRegisteredScripts());
void syncRegisteredScripts();
connect();
