import { describe, expect, it } from 'vitest';

import {
  boundContext,
  classifySelection,
  contextTriggerPolicy,
  selectionSettleDelay,
} from './selection';

describe('Chrome selection policy', () => {
  it('preserves the beginning and conclusion of oversized selections', () => {
    const source = `${'A'.repeat(7_000)}${'Z'.repeat(3_000)}`;
    const bounded = boundContext(source);

    expect([...bounded]).toHaveLength(8_000);
    expect(bounded.startsWith('A'.repeat(100))).toBe(true);
    expect(bounded.endsWith('Z'.repeat(100))).toBe(true);
    expect(bounded).toContain('[Middle of selection omitted locally]');
  });

  it('distinguishes social posts, articles, and ordinary selections', () => {
    expect(classifySelection(true, true, 40)).toBe('SOCIAL_POST');
    expect(classifySelection(false, true, 40)).toBe('ARTICLE_TEXT');
    expect(classifySelection(false, false, 700)).toBe('ARTICLE_TEXT');
    expect(classifySelection(false, false, 40)).toBe('SELECTED_TEXT');
  });

  it('waits longer for large selections to settle', () => {
    expect(selectionSettleDelay(false, 40)).toBe(300);
    expect(selectionSettleDelay(false, 700)).toBe(500);
    expect(selectionSettleDelay(false, 2_000)).toBe(700);
    expect(selectionSettleDelay(true, 40)).toBe(650);
  });

  it('observes only deliberate selections, never editor input or paste', () => {
    expect(contextTriggerPolicy('SELECTION')).toBe('OBSERVE_SELECTION');
    expect(contextTriggerPolicy('EDITOR_INPUT')).toBe('IGNORE');
    expect(contextTriggerPolicy('PASTE')).toBe('IGNORE');
  });
});
