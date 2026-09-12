import type { ContextKind, ContextObservation } from '@pop/protocol';

type Control = { monitoringEnabled: boolean; xEnabled: boolean };

export default defineContentScript({
  matches: ['https://x.com/*'],
  runAt: 'document_idle',
  main() {
    let control: Control = { monitoringEnabled: false, xEnabled: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
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
      void chrome.runtime.sendMessage({ type: 'POP_CONTEXT', observation });
    }
    function inspect(event?: Event) {
      globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(() => {
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
      }, 500);
    }

    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (
        typeof message === 'object' &&
        message &&
        (message as { type?: string }).type === 'POP_CONTROL'
      ) {
        control = (message as { control: Control }).control;
        if (!enabled()) {
          globalThis.clearTimeout(timer);
          lastFingerprint = '';
        }
      }
    });
    void chrome.runtime.sendMessage({ type: 'POP_GET_CONTROL' }).then((value: Control) => {
      control = value;
    });
    document.addEventListener('input', inspect, true);
    document.addEventListener('selectionchange', inspect);
    globalThis.setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastFingerprint = '';
        globalThis.clearTimeout(timer);
      }
    }, 750);
  },
});
