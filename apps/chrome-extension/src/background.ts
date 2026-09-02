import { PROTOCOL_VERSION, type ContextObservation, type ProtocolEnvelope } from '@pop/protocol';

import type { AdapterStatus, ContentMessage, PopupMessage } from './messages';

const CORE_URL = 'ws://127.0.0.1:17831';
let socket: WebSocket | null = null;
let status: AdapterStatus = { state: 'DISCONNECTED' };
let reconnectTimer: number | undefined;
const pendingContexts: ContextObservation[] = [];

function setStatus(next: AdapterStatus): void {
  status = next;
  void chrome.runtime.sendMessage({ type: 'POP_STATUS_CHANGED', status }).catch(() => undefined);
}

async function credentials(): Promise<{ pairingCode?: string; sessionToken?: string }> {
  return chrome.storage.local.get(['pairingCode', 'sessionToken']);
}

async function register(): Promise<void> {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const stored = await credentials();
  if (!stored.pairingCode && !stored.sessionToken) {
    setStatus({ state: 'PAIRING_REQUIRED' });
    socket.close();
    return;
  }

  const envelope: ProtocolEnvelope = {
    version: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    source: 'CHROME',
    type: 'REGISTER',
    timestamp: Date.now(),
    payload: stored.sessionToken
      ? { sessionToken: stored.sessionToken }
      : { pairingCode: stored.pairingCode! },
  };
  socket.send(JSON.stringify(envelope));
}

function sendContext(observation: ContextObservation): void {
  if (!socket || socket.readyState !== WebSocket.OPEN || status.state !== 'CONNECTED') {
    pendingContexts.splice(0, pendingContexts.length, observation);
    connect();
    return;
  }

  const envelope: ProtocolEnvelope = {
    version: PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    source: 'CHROME',
    type: 'CONTEXT',
    timestamp: Date.now(),
    payload: observation,
  };
  socket.send(JSON.stringify(envelope));
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
      for (const context of pendingContexts.splice(0)) sendContext(context);
    } else if (response.type === 'ACK') {
      setStatus({ state: 'CONNECTED' });
    } else if (response.type === 'ERROR') {
      setStatus({ state: 'ERROR', detail: String(response.message ?? 'Connection rejected.') });
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
  (message: ContentMessage | PopupMessage, _sender, sendResponse) => {
    if (message.type === 'POP_CONTEXT') sendContext(message.observation);
    if (message.type === 'POP_PAIR') {
      void chrome.storage.local.set({ pairingCode: message.pairingCode }).then(() => {
        socket?.close();
        socket = null;
        connect();
      });
    }
    if (message.type === 'POP_STATUS') sendResponse(status);
    return message.type === 'POP_STATUS';
  },
);

connect();
