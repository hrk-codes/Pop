import type { ContextKind, ContextObservation } from '@pop/protocol';

type Control = { monitoringEnabled: boolean; xEnabled: boolean };

const MAX_CONTEXT_CHARACTERS = 8000;

function boundContext(text: string): string {
  const characters = [...text];
  if (characters.length <= MAX_CONTEXT_CHARACTERS) return text;

  const omission = '\n\n[Middle of selection omitted locally]\n\n';
  const omissionLength = [...omission].length;
  const available = MAX_CONTEXT_CHARACTERS - omissionLength;
  const headLength = Math.floor(available * 0.68);
  return `${characters.slice(0, headLength).join('')}${omission}${characters
    .slice(characters.length - (available - headLength))
    .join('')}`;
}

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
    function observationFor(kind: ContextKind, text: string): ContextObservation | null {
      if (!enabled() || text.length < 2) return null;
      const bounded = boundContext(text);
      return {
        kind,
        platformId: 'X',
        text: bounded,
        applicationId: 'chrome',
        domain: 'x.com',
        title: document.title.slice(0, 300),
        observedAt: Date.now(),
      };
    }
    function selectedObservation(): ContextObservation | null {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';
      if (!text || !selection?.anchorNode) return null;
      const node =
        selection.anchorNode instanceof Element
          ? selection.anchorNode
          : selection.anchorNode.parentElement;
      return observationFor(node?.closest('article') ? 'SOCIAL_POST' : 'SELECTED_TEXT', text);
    }
    function emit(kind: ContextKind, text: string) {
      const observation = observationFor(kind, text);
      if (!observation) return;
      const fingerprint = `${observation.kind}:${observation.text}`;
      if (fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      void chrome.runtime.sendMessage({ type: 'POP_CONTEXT', observation }).catch(() => {
        if (lastFingerprint === fingerprint) lastFingerprint = '';
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
          const observation = selectedObservation();
          if (observation) emit(observation.kind, observation.text);
        },
        candidate ? 650 : 360,
      );
    }

    function requestAction(
      direction: 'up' | 'down' | 'left' | 'right',
      observation: ContextObservation,
    ) {
      const message = { type: 'POP_ACTION' as const, direction, observation };
      void chrome.runtime.sendMessage(message).catch(() => undefined);
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
    document.addEventListener(
      'keydown',
      (event) => {
        if (
          !enabled() ||
          event.defaultPrevented ||
          event.repeat ||
          event.isComposing ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        ) {
          return;
        }
        const direction = (
          {
            ArrowUp: 'up',
            ArrowDown: 'down',
            ArrowLeft: 'left',
            ArrowRight: 'right',
          } as const
        )[event.key as 'ArrowUp'];
        const observation = selectedObservation();
        if (!direction || !observation) return;
        event.preventDefault();
        event.stopPropagation();
        requestAction(direction, observation);
      },
      true,
    );
    void refreshControl();
    globalThis.setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastFingerprint = '';
        globalThis.clearTimeout(timer);
      }
      void refreshControl();
    }, 2_000);
  },
});
