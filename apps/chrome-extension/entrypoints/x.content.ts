import type { ContextKind, ContextObservation } from '@pop/protocol';
import { buildConversationTranscript, type ConversationTurn } from '../utils/conversation';
import { isPrivateWebHost, isXHost } from '../utils/page-policy';
import {
  boundContext,
  classifySelection,
  contextTriggerPolicy,
  type ContextTrigger,
  selectionSettleDelay,
} from '../utils/selection';

type Control = { monitoringEnabled: boolean; xEnabled: boolean; webEnabled: boolean };

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  excludeMatches: [
    '*://*.1password.com/*',
    '*://accounts.google.com/*',
    '*://account.microsoft.com/*',
    '*://*.bitwarden.com/*',
    '*://*.lastpass.com/*',
    '*://login.live.com/*',
    '*://mail.google.com/*',
    '*://myaccount.google.com/*',
    '*://outlook.live.com/*',
    '*://outlook.office.com/*',
    '*://passwords.google.com/*',
    '*://*.paypal.com/*',
    '*://photos.google.com/*',
  ],
  runAt: 'document_idle',
  main() {
    let control: Control = { monitoringEnabled: false, xEnabled: false, webEnabled: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastFingerprint = '';
    let lastUrl = location.href;
    const xPage = () => isXHost(location.hostname);
    const enabled = () =>
      control.monitoringEnabled &&
      !isPrivateWebHost(location.hostname) &&
      (xPage() ? control.xEnabled : control.webEnabled);

    function xThreadUri(): string | undefined {
      const statusId = location.pathname.match(/\/status\/(\d+)/)?.[1];
      return statusId ? `https://x.com/i/status/${statusId}` : undefined;
    }

    function ownXHandle(): string | undefined {
      const profile = document.querySelector<HTMLAnchorElement>(
        'a[data-testid="AppTabBar_Profile_Link"]',
      );
      const segment = profile?.getAttribute('href')?.split('/').filter(Boolean)[0];
      return segment ? `@${decodeURIComponent(segment)}`.toLowerCase() : undefined;
    }

    function selectedTextWithin(range: Range, element: Element): string {
      try {
        if (!range.intersectsNode(element)) return '';
        const elementRange = document.createRange();
        elementRange.selectNodeContents(element);
        const intersection = document.createRange();
        const start =
          range.compareBoundaryPoints(Range.START_TO_START, elementRange) > 0
            ? range
            : elementRange;
        const end =
          range.compareBoundaryPoints(Range.END_TO_END, elementRange) < 0 ? range : elementRange;
        intersection.setStart(start.startContainer, start.startOffset);
        intersection.setEnd(end.endContainer, end.endOffset);
        return intersection.toString().trim();
      } catch {
        return '';
      }
    }

    function xConversation(selection: Selection): string | null {
      if (selection.rangeCount === 0 || !xThreadUri()) return null;
      const range = selection.getRangeAt(0);
      const selfHandle = ownXHandle();
      const turns: ConversationTurn[] = [];
      const seen = new Set<string>();

      for (const article of document.querySelectorAll<HTMLElement>(
        'article[data-testid="tweet"]',
      )) {
        const tweetText = article.querySelector<HTMLElement>('[data-testid="tweetText"]');
        if (!tweetText) continue;
        const text = selectedTextWithin(range, tweetText);
        if (text.length < 2) continue;

        const userName = article.querySelector<HTMLElement>('[data-testid="User-Name"]');
        const labels = [...(userName?.querySelectorAll<HTMLElement>('span') ?? [])]
          .map((span) => span.innerText.trim())
          .filter(Boolean);
        const authorHandle = labels.find((label) => label.startsWith('@'));
        const authorName = labels.find(
          (label) => !label.startsWith('@') && label !== '·' && !/^\d+[smhdwy]$/.test(label),
        );
        const statusLink = article
          .querySelector<HTMLTimeElement>('a[href*="/status/"] time')
          ?.closest<HTMLAnchorElement>('a');
        const identity = statusLink?.href ?? `${authorHandle ?? ''}:${text}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        turns.push({
          authorName,
          authorHandle,
          text,
          isSelf: Boolean(selfHandle && authorHandle && selfHandle === authorHandle.toLowerCase()),
        });
      }

      return buildConversationTranscript(turns)?.text ?? null;
    }

    function observationFor(kind: ContextKind, text: string): ContextObservation | null {
      if (!enabled() || text.length < 2) return null;
      const bounded = boundContext(text);
      return {
        kind,
        platformId: xPage() ? 'X' : 'WEB',
        text: bounded,
        applicationId: 'chrome',
        domain: location.hostname,
        title: document.title.slice(0, 300),
        documentUri: xPage() ? xThreadUri() : undefined,
        observedAt: Date.now(),
      };
    }
    function selectedObservation(): ContextObservation | null {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';
      if (!text || !selection?.anchorNode) return null;
      const conversation = xPage() ? xConversation(selection) : null;
      if (conversation) return observationFor('CONVERSATION', conversation);
      const node =
        selection.anchorNode instanceof Element
          ? selection.anchorNode
          : selection.anchorNode.parentElement;
      const article = node?.closest('article, main, [role="main"]');
      const kind = classifySelection(xPage(), Boolean(article), text.length);
      return observationFor(kind, text);
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
    function inspectSelection() {
      globalThis.clearTimeout(timer);
      const selectedCharacters = window.getSelection()?.toString().trim().length ?? 0;
      if (!selectedCharacters) return;
      const settleDelay = selectionSettleDelay(false, selectedCharacters);
      timer = globalThis.setTimeout(() => {
        if (!enabled()) return;
        const observation = selectedObservation();
        if (observation) emit(observation.kind, observation.text);
      }, settleDelay);
    }

    function handleContextTrigger(trigger: ContextTrigger) {
      globalThis.clearTimeout(timer);
      if (contextTriggerPolicy(trigger) === 'IGNORE') return;
      void refreshControl().then(inspectSelection);
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
        inspectSelection();
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
          typeof value.xEnabled === 'boolean' &&
          typeof value.webEnabled === 'boolean'
        ) {
          applyControl(value);
        }
      } catch {
        applyControl({ monitoringEnabled: false, xEnabled: false, webEnabled: false });
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
    document.addEventListener('beforeinput', () => handleContextTrigger('EDITOR_INPUT'), true);
    document.addEventListener('input', () => handleContextTrigger('EDITOR_INPUT'), true);
    document.addEventListener('paste', () => handleContextTrigger('PASTE'), true);
    document.addEventListener('selectionchange', () => {
      if (!window.getSelection()?.toString().trim()) {
        globalThis.clearTimeout(timer);
        lastFingerprint = '';
        return;
      }
      handleContextTrigger('SELECTION');
    });
    document.addEventListener(
      'mouseup',
      () => {
        if (window.getSelection()?.toString().trim()) {
          handleContextTrigger('SELECTION');
        }
      },
      true,
    );
    document.addEventListener(
      'keyup',
      () => {
        if (window.getSelection()?.toString().trim()) {
          handleContextTrigger('SELECTION');
        }
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
