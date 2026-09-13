import { PROTOCOL_VERSION, type ContextObservation, type ProtocolEnvelope } from '@pop/protocol';

type Control = { monitoringEnabled: boolean; xEnabled: boolean };
type ContentMessage =
  { type: 'POP_CONTEXT'; observation: ContextObservation } | { type: 'POP_GET_CONTROL' };

export default defineBackground(() => {
  const reconnectAlarm = 'pop-native-reconnect';
  let port: chrome.runtime.Port | null = null;
  let control: Control = { monitoringEnabled: false, xEnabled: false };
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
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
    void chrome.tabs.query({ url: 'https://x.com/*' }).then((tabs) => {
      for (const tab of tabs)
        if (tab.id)
          void chrome.tabs
            .sendMessage(tab.id, { type: 'POP_CONTROL', control })
            .catch(() => undefined);
    });
  }
  function connect() {
    if (port) return;
    globalThis.clearTimeout(reconnectTimer);
    try {
      port = chrome.runtime.connectNative('dev.pop.companion');
    } catch {
      reconnectTimer = globalThis.setTimeout(connect, 3000);
      return;
    }
    port.onMessage.addListener((message: unknown) => {
      if (typeof message !== 'object' || message === null) return;
      const value = message as Record<string, unknown>;
      if (
        value.type === 'CONTROL' &&
        typeof value.monitoringEnabled === 'boolean' &&
        typeof value.xEnabled === 'boolean'
      ) {
        control = { monitoringEnabled: value.monitoringEnabled, xEnabled: value.xEnabled };
        broadcastControl();
        for (const item of pending.splice(0)) port?.postMessage(item);
      }
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      port = null;
      control = { monitoringEnabled: false, xEnabled: false };
      broadcastControl();
      reconnectTimer = globalThis.setTimeout(connect, 3000);
    });
  }
  function send(message: ProtocolEnvelope) {
    if (!port) {
      pending.push(message);
      pending.splice(0, Math.max(0, pending.length - 8));
      connect();
      return;
    }
    port.postMessage(message);
  }

  chrome.runtime.onMessage.addListener((message: ContentMessage, sender, respond) => {
    connect();
    if (message.type === 'POP_GET_CONTROL') {
      respond(control);
      return true;
    }
    if (
      message.type === 'POP_CONTEXT' &&
      sender.tab?.url?.startsWith('https://x.com/') &&
      control.monitoringEnabled &&
      control.xEnabled
    ) {
      send(envelope({ type: 'CONTEXT', payload: message.observation }));
    }
    return false;
  });
  chrome.action.onClicked.addListener(() =>
    send(envelope({ type: 'UI_COMMAND', payload: { command: 'SHOW' } })),
  );
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== reconnectAlarm) return;
    if (port) send(envelope({ type: 'HEARTBEAT', payload: {} }));
    else connect();
  });
  void chrome.alarms.create(reconnectAlarm, { periodInMinutes: 0.5 });
  connect();
});
