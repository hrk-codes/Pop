import { PROTOCOL_VERSION, type ContextObservation, type ProtocolEnvelope } from '@pop/protocol';
import {
  requestLoopback,
  type Control,
  type LoopbackServerMessage as ServerMessage,
} from '../utils/loopback';
import { isXHost, supportedPage } from '../utils/page-policy';

type ContentMessage =
  | { type: 'POP_CONTEXT'; observation: ContextObservation }
  | {
      type: 'POP_ACTION';
      direction: 'up' | 'down' | 'left' | 'right';
      observation: ContextObservation;
    }
  | { type: 'POP_GET_CONTROL' };
type PopupMessage = { type: 'POP_LOOPBACK_GRANTED'; control: Control } | { type: 'POP_SHOW' };
type Transport = 'native' | 'loopback' | null;

export default defineBackground(() => {
  const reconnectAlarm = 'pop-native-reconnect';
  let port: chrome.runtime.Port | null = null;
  let nativeReady = false;
  let transport: Transport = null;
  let control: Control = { monitoringEnabled: false, xEnabled: false, webEnabled: false };
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let loopbackSync: Promise<void> | null = null;
  let flushingLoopback = false;
  let lastNativeError = '';
  const pending: ProtocolEnvelope[] = [];

  function envelope(message: Pick<ProtocolEnvelope, 'type' | 'payload'>): ProtocolEnvelope {
    return {
      version: PROTOCOL_VERSION,
      id: crypto.randomUUID(),
      source: 'CHROME',
      timestamp: Date.now(),
      ...message,
    } as ProtocolEnvelope;
  }

  function broadcastControl() {
    void chrome.tabs
      .query({ url: ['http://*/*', 'https://*/*'] })
      .then((tabs) => {
        for (const tab of tabs)
          if (tab.id)
            void chrome.tabs
              .sendMessage(tab.id, { type: 'POP_CONTROL', control })
              .catch(() => undefined);
      })
      .catch(() => undefined);
  }

  function acceptControl(value: unknown, source: Exclude<Transport, null>): boolean {
    if (typeof value !== 'object' || value === null) return false;
    const message = value as Partial<ServerMessage>;
    if (
      message.type !== 'CONTROL' ||
      typeof message.monitoringEnabled !== 'boolean' ||
      typeof message.xEnabled !== 'boolean' ||
      typeof message.webEnabled !== 'boolean'
    ) {
      return false;
    }
    if (source === 'native' || transport !== 'native') transport = source;
    control = {
      monitoringEnabled: message.monitoringEnabled,
      xEnabled: message.xEnabled,
      webEnabled: message.webEnabled,
    };
    broadcastControl();
    return true;
  }

  async function flushPendingToLoopback() {
    if (flushingLoopback || transport !== 'loopback') return;
    flushingLoopback = true;
    try {
      while (pending.length && transport === 'loopback') {
        const item = pending[0];
        await requestLoopback('/message', {
          method: 'POST',
          body: JSON.stringify(item),
        });
        if (pending[0]?.id === item.id) pending.shift();
      }
    } catch {
      if (transport === 'loopback') {
        transport = null;
        control = { monitoringEnabled: false, xEnabled: false, webEnabled: false };
        broadcastControl();
      }
    } finally {
      flushingLoopback = false;
    }
  }

  function syncLoopback() {
    if (loopbackSync) return loopbackSync;
    loopbackSync = requestLoopback('/control')
      .then((value) => {
        if (acceptControl(value, 'loopback')) void flushPendingToLoopback();
      })
      .catch(() => {
        if (!nativeReady) {
          transport = null;
          control = { monitoringEnabled: false, xEnabled: false, webEnabled: false };
          broadcastControl();
        }
      })
      .finally(() => {
        loopbackSync = null;
      });
    return loopbackSync;
  }

  function connectNative() {
    if (port) return;
    globalThis.clearTimeout(reconnectTimer);
    try {
      port = chrome.runtime.connectNative('dev.pop.companion');
    } catch (error) {
      lastNativeError = error instanceof Error ? error.message : 'Native messaging unavailable';
      console.warn(`POP native bridge unavailable: ${lastNativeError}`);
      reconnectTimer = globalThis.setTimeout(connectNative, 3_000);
      void syncLoopback();
      return;
    }
    port.onMessage.addListener((message: unknown) => {
      if (acceptControl(message, 'native')) {
        nativeReady = true;
        for (const item of pending.splice(0)) port?.postMessage(item);
      }
    });
    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message ?? 'Native host disconnected';
      if (error !== lastNativeError) {
        lastNativeError = error;
        console.warn(`POP native bridge unavailable: ${error}`);
      }
      port = null;
      nativeReady = false;
      if (transport === 'native') transport = null;
      reconnectTimer = globalThis.setTimeout(connectNative, 3_000);
      void syncLoopback();
    });
  }

  function send(message: ProtocolEnvelope) {
    if (transport === 'native' && nativeReady && port) {
      port.postMessage(message);
      return;
    }
    pending.push(message);
    pending.splice(0, Math.max(0, pending.length - 8));
    connectNative();
    void syncLoopback().then(flushPendingToLoopback);
  }

  function handleContentMessage(
    message: ContentMessage,
    senderUrl: string | undefined,
    respond: (value: Control) => void,
  ) {
    connectNative();
    void syncLoopback();
    if (message.type === 'POP_GET_CONTROL') {
      respond(control);
      return;
    }
    const sender = senderUrl ? supportedPage(senderUrl) : null;
    const expectedPlatform = sender && isXHost(sender.hostname) ? 'X' : 'WEB';
    const permitted = Boolean(
      sender &&
      control.monitoringEnabled &&
      (expectedPlatform === 'X' ? control.xEnabled : control.webEnabled),
    );
    const validObservation =
      message.observation.platformId === expectedPlatform &&
      message.observation.domain === sender?.hostname;
    if (message.type === 'POP_CONTEXT' && permitted && validObservation) {
      send(envelope({ type: 'CONTEXT', payload: message.observation }));
      return;
    }
    if (message.type === 'POP_ACTION' && permitted && validObservation) {
      send(envelope({ type: 'CONTEXT', payload: message.observation }));
      send(
        envelope({
          type: 'UI_COMMAND',
          payload: { command: message.direction.toUpperCase() as 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' },
        }),
      );
    }
  }

  chrome.runtime.onMessage.addListener(
    (message: ContentMessage | PopupMessage, sender, respond) => {
      if (message.type === 'POP_LOOPBACK_GRANTED' && sender.id === chrome.runtime.id) {
        if (acceptControl({ type: 'CONTROL', ...message.control }, 'loopback')) {
          void flushPendingToLoopback();
        }
        return false;
      }
      if (message.type === 'POP_SHOW' && sender.id === chrome.runtime.id) {
        send(envelope({ type: 'UI_COMMAND', payload: { command: 'SHOW' } }));
        return false;
      }
      if (
        message.type === 'POP_GET_CONTROL' ||
        message.type === 'POP_CONTEXT' ||
        message.type === 'POP_ACTION'
      ) {
        handleContentMessage(message, sender.tab?.url, respond);
        return message.type === 'POP_GET_CONTROL';
      }
      return false;
    },
  );
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== reconnectAlarm) return;
    if (transport === 'native' && nativeReady) {
      send(envelope({ type: 'HEARTBEAT', payload: {} }));
    } else {
      connectNative();
      void syncLoopback();
    }
  });
  void chrome.alarms.create(reconnectAlarm, { periodInMinutes: 0.5 });
  connectNative();
  void syncLoopback();
});
