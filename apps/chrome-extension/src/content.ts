import type { ContextKind, ContextObservation } from '@pop/protocol';

import type { ContentMessage } from './messages';
import { platformForHostname } from './platforms';

const platform = platformForHostname(location.hostname);
let timer: number | undefined;
let latestDraft = '';
let latestTarget: HTMLElement | null = null;
let previousFingerprint = '';
let cueHost: HTMLElement | null = null;

function isSensitiveField(element: HTMLElement): boolean {
  const input = element instanceof HTMLInputElement ? element : null;
  const type = input?.type.toLowerCase();
  const autocomplete = input?.autocomplete.toLowerCase() ?? '';
  const label =
    `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('name') ?? ''}`.toLowerCase();
  return (
    type === 'password' ||
    ['current-password', 'new-password', 'cc-number', 'cc-csc', 'cc-exp'].includes(autocomplete) ||
    /password|passcode|security code|card number|cvv|cvc/.test(label) ||
    Boolean(element.closest('form')?.querySelector('input[type="password"]'))
  );
}

function editableFrom(element: EventTarget | null): HTMLElement | null {
  if (!(element instanceof HTMLElement)) return null;
  const editable = element.closest<HTMLElement>(
    'textarea, input[type="text"], input[type="search"], [contenteditable="true"], [role="textbox"]',
  );
  return editable && !isSensitiveField(editable) ? editable : null;
}

function editableText(element: HTMLElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value.trim();
  }
  return element.innerText.trim();
}

function positionCue(target: HTMLElement): void {
  if (!cueHost) return;
  const bounds = target.getBoundingClientRect();
  cueHost.style.left = `${Math.max(8, Math.min(innerWidth - 42, bounds.right - 34))}px`;
  cueHost.style.top = `${Math.max(8, Math.min(innerHeight - 42, bounds.bottom + 6))}px`;
}

function showCue(target: HTMLElement): void {
  if (!cueHost) {
    cueHost = document.createElement('div');
    cueHost.id = 'pop-context-cue';
    cueHost.style.cssText =
      'all:initial;position:fixed;z-index:2147483647;width:32px;height:32px;display:grid;place-items:center;';
    const shadow = cueHost.attachShadow({ mode: 'closed' });
    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Open POP';
    button.setAttribute('aria-label', 'Open POP suggestion');
    button.textContent = 'P';
    button.style.cssText =
      'all:initial;box-sizing:border-box;width:30px;height:30px;display:grid;place-items:center;border:2px solid #fff;border-radius:50%;background:#ef5b4c;color:#fff;box-shadow:0 3px 12px rgba(20,24,22,.24);font:700 12px system-ui;cursor:pointer;';
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const message: ContentMessage = { type: 'POP_OPEN_UI' };
      void chrome.runtime.sendMessage(message);
    });
    shadow.append(button);
    document.documentElement.append(cueHost);
  }
  positionCue(target);
  cueHost.hidden = false;
}

function hideCue(): void {
  if (cueHost) cueHost.hidden = true;
}

function emit(kind: ContextKind, text: string, target?: HTMLElement): void {
  if (!platform || text.length < 2) return;
  const fingerprint = `${platform.id}:${kind}:${text}`;
  if (fingerprint === previousFingerprint) return;
  previousFingerprint = fingerprint;
  const observation: ContextObservation = {
    kind,
    platformId: platform.id,
    text: text.slice(0, 12_000),
    applicationId: 'chrome',
    domain: location.hostname.toLowerCase(),
    title: document.title.slice(0, 300),
    observedAt: Date.now(),
  };
  const message: ContentMessage = { type: 'POP_CONTEXT', observation };
  if (target) showCue(target);
  void chrome.runtime.sendMessage(message).catch(() => hideCue());
}

function draftKind(target: HTMLElement): ContextKind {
  if (platform?.id === 'GOOGLE' && target.matches('[name="q"], textarea[name="q"]')) {
    return 'SEARCH_QUERY';
  }
  return 'DRAFT_TEXT';
}

function selectionKind(element: Element | null): ContextKind {
  if (platform?.id === 'X' && element?.closest('article')) return 'SOCIAL_POST';
  if (platform?.id === 'WHATSAPP' || platform?.id === 'CHATGPT' || platform?.id === 'CLAUDE') {
    return 'CONVERSATION';
  }
  return 'ARTICLE_TEXT';
}

function observeMeaningfulContext(event?: Event): void {
  const editable = editableFrom(event?.target ?? document.activeElement);
  if (editable) {
    latestTarget = editable;
    latestDraft = editableText(editable);
  }
  globalThis.clearTimeout(timer);
  timer = globalThis.setTimeout(() => {
    const focused = editableFrom(document.activeElement) ?? latestTarget;
    const draft = focused ? editableText(focused) || latestDraft : latestDraft;
    if (focused && draft) {
      emit(draftKind(focused), draft, focused);
      latestDraft = '';
      return;
    }

    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!text || !selection?.anchorNode) return;
    const element =
      selection.anchorNode instanceof Element
        ? selection.anchorNode
        : selection.anchorNode.parentElement;
    emit(selectionKind(element), text, element instanceof HTMLElement ? element : undefined);
  }, 650);
}

document.addEventListener('input', observeMeaningfulContext, true);
document.addEventListener('selectionchange', observeMeaningfulContext);
document.addEventListener('focusout', () => {
  window.setTimeout(() => {
    if (document.activeElement !== latestTarget) {
      latestTarget = null;
      latestDraft = '';
      hideCue();
    }
  }, 150);
});
window.addEventListener(
  'scroll',
  () => {
    if (latestTarget && !cueHost?.hidden) positionCue(latestTarget);
  },
  true,
);
