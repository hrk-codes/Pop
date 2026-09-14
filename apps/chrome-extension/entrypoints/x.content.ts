import type { ContextKind, ContextObservation } from '@pop/protocol';

type Control = { monitoringEnabled: boolean; xEnabled: boolean };

export default defineContentScript({
  matches: ['https://x.com/*'],
  runAt: 'document_idle',
  main() {
    let control: Control = { monitoringEnabled: false, xEnabled: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let bridge: chrome.runtime.Port | null = null;
    let lastFingerprint = '';
    let lastUrl = location.href;
    const enabled = () => control.monitoringEnabled && control.xEnabled;

    function sensitive(element: HTMLElement): boolean {
      const field = element instanceof HTMLInputElement ? element : null;
      const label =
        `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('name') ?? ''}`.toLowerCase();
      return (
        field?.type === 'password' ||
        /password|passcode|security code|card number|cvv|cvc/.test(label)
      );
    }
    function editable(element: EventTarget | null): HTMLElement | null {
      if (!(element instanceof HTMLElement)) return null;
      const target = element.closest<HTMLElement>(
        '[data-testid="tweetTextarea_0"], [role="textbox"], textarea',
      );
      return target && !sensitive(target) ? target : null;
    }
    function textOf(element: HTMLElement): string {
      return (element instanceof HTMLTextAreaElement ? element.value : element.innerText).trim();
    }
    function emit(kind: ContextKind, text: string) {
      if (!enabled() || text.length < 2) return;
      const bounded = [...text].slice(0, 8000).join('');
      const fingerprint = `${kind}:${bounded}`;
      if (fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      const observation: ContextObservation = {
        kind,
        platformId: 'X',
        text: bounded,
        applicationId: 'chrome',
        domain: 'x.com',
        title: document.title.slice(0, 300),
        observedAt: Date.now(),
      };
      void chrome.runtime.sendMessage({ type: 'POP_CONTEXT', observation }).catch(() => {
        if (lastFingerprint === fingerprint) lastFingerprint = '';
        bridge = null;
        connectBridge();
      });
    }
    function inspect(event?: Event) {
      globalThis.clearTimeout(timer);
      const candidate =
        editable(event?.target ?? document.activeElement) ?? editable(document.activeElement);
      timer = globalThis.setTimeout(
        () => {
          if (!enabled()) return;
          const draft =
            editable(event?.target ?? document.activeElement) ?? editable(document.activeElement);
          if (draft) {
            const text = textOf(draft);
            if (text) emit('DRAFT_TEXT', text);
            return;
          }
          const selection = window.getSelection();
          const text = selection?.toString().trim() ?? '';
          if (!text || !selection?.anchorNode) return;
          const node =
            selection.anchorNode instanceof Element
              ? selection.anchorNode
              : selection.anchorNode.parentElement;
          emit(node?.closest('article') ? 'SOCIAL_POST' : 'SELECTED_TEXT', text);
        },
        candidate ? 850 : 550,
      );
    }

    function applyControl(value: Control) {
      const wasEnabled = enabled();
      control = value;
      if (!enabled()) {
        globalThis.clearTimeout(timer);
        lastFingerprint = '';
      } else if (!wasEnabled) {
        inspect();
      }
    }

    async function refreshControl() {
      try {
        const value = (await chrome.runtime.sendMessage({
          type: 'POP_GET_CONTROL',
        })) as Control;
        if (
          value &&
          typeof value.monitoringEnabled === 'boolean' &&
          typeof value.xEnabled === 'boolean'
        ) {
          applyControl(value);
        }
      } catch {
        applyControl({ monitoringEnabled: false, xEnabled: false });
      }
    }

    function connectBridge() {
      if (bridge) return;
      globalThis.clearTimeout(reconnectTimer);
      try {
        bridge = chrome.runtime.connect({ name: 'pop-x-context' });
      } catch {
        reconnectTimer = globalThis.setTimeout(connectBridge, 1_000);
        return;
      }
      const currentBridge = bridge;
      currentBridge.onMessage.addListener((message: unknown) => {
        if (
          typeof message === 'object' &&
          message &&
          (message as { type?: string }).type === 'POP_CONTROL'
        ) {
          applyControl((message as { control: Control }).control);
        }
      });
      currentBridge.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        if (bridge === currentBridge) bridge = null;
        applyControl({ monitoringEnabled: false, xEnabled: false });
        reconnectTimer = globalThis.setTimeout(connectBridge, 1_000);
      });
      currentBridge.postMessage({ type: 'POP_GET_CONTROL' });
    }

    connectBridge();
    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (
        typeof message === 'object' &&
        message &&
        (message as { type?: string }).type === 'POP_CONTROL'
      ) {
        applyControl((message as { control: Control }).control);
      }
    });
    document.addEventListener(
      'input',
      (event) => {
        void refreshControl().then(() => inspect(event));
      },
      true,
    );
    document.addEventListener('selectionchange', (event) => {
      if (!window.getSelection()?.toString().trim() && !editable(document.activeElement)) {
        lastFingerprint = '';
      }
      void refreshControl().then(() => inspect(event));
    });
    document.addEventListener(
      'mouseup',
      (event) => {
        void refreshControl().then(() => inspect(event));
      },
      true,
    );
    document.addEventListener(
      'keyup',
      (event) => {
        void refreshControl().then(() => inspect(event));
      },
      true,
    );
    void refreshControl();
    globalThis.setInterval(() => {
      if (!bridge) connectBridge();
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastFingerprint = '';
        globalThis.clearTimeout(timer);
      }
      void refreshControl();
    }, 2_000);
  },
});
