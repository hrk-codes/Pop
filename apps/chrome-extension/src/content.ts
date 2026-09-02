import type { ContextObservation } from '@pop/protocol';

import type { ContentMessage } from './messages';

let timer: number | undefined;
let previousFingerprint = '';
let latestDraft = '';

function emit(observation: ContextObservation): void {
  const fingerprint = `${observation.kind}:${observation.text}`;
  if (fingerprint === previousFingerprint) return;
  previousFingerprint = fingerprint;
  const message: ContentMessage = { type: 'POP_CONTEXT', observation };
  void chrome.runtime.sendMessage(message).catch(() => undefined);
}

function activeDraft(): string {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return '';
  const composer = active.closest<HTMLElement>(
    '[data-testid="tweetTextarea_0"], [data-testid^="tweetTextarea_"]',
  );
  if (!composer || composer.getAttribute('contenteditable') !== 'true') return '';
  return composer.innerText.trim();
}

function selectedPost(): string {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? '';
  if (!text || !selection?.anchorNode) return '';
  const element =
    selection.anchorNode instanceof Element
      ? selection.anchorNode
      : selection.anchorNode.parentElement;
  const article = element?.closest('article');
  return article ? text : '';
}

function observeMeaningfulContext(event?: Event): void {
  const target = event?.target;
  if (target instanceof HTMLElement) {
    const composer = target.closest<HTMLElement>(
      '[data-testid="tweetTextarea_0"], [data-testid^="tweetTextarea_"]',
    );
    if (composer?.getAttribute('contenteditable') === 'true') {
      latestDraft = composer.innerText.trim();
    }
  }
  globalThis.clearTimeout(timer);
  timer = globalThis.setTimeout(() => {
    const draft = activeDraft() || latestDraft;
    if (draft) {
      emit({
        kind: 'X_DRAFT',
        text: draft,
        applicationId: 'chrome',
        domain: location.hostname.toLowerCase(),
        title: document.title,
        observedAt: Date.now(),
      });
      latestDraft = '';
      return;
    }

    const selected = selectedPost();
    if (selected) {
      emit({
        kind: 'X_POST',
        text: selected,
        applicationId: 'chrome',
        domain: location.hostname.toLowerCase(),
        title: document.title,
        observedAt: Date.now(),
      });
    }
  }, 700);
}

document.addEventListener('input', observeMeaningfulContext, true);
document.addEventListener('selectionchange', observeMeaningfulContext);
