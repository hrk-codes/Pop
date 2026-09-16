import { describe, expect, it } from 'vitest';

import { actionsFor, automaticTaskFor } from './intent';

describe('POP intent routing', () => {
  it('automatically chooses an action that matches each context', () => {
    expect(automaticTaskFor('DRAFT_TEXT')).toBe('CHECK_WRITING');
    expect(automaticTaskFor('SOCIAL_POST')).toBe('EXPLAIN_TEXT');
    expect(automaticTaskFor('CONVERSATION')).toBe('EXPLAIN_TEXT');
    expect(automaticTaskFor('SELECTED_TEXT')).toBe('EXPLAIN_TEXT');
    expect(automaticTaskFor('ARTICLE_TEXT')).toBe('EXPLAIN_TEXT');
  });

  it('uses the selected automatic response mode without changing directional actions', () => {
    expect(automaticTaskFor('SOCIAL_POST', 'EXPLAIN')).toBe('EXPLAIN_TEXT');
    expect(automaticTaskFor('SOCIAL_POST', 'REPLY')).toBe('DRAFT_REPLY');
    expect(automaticTaskFor('SOCIAL_POST', 'EXPLAIN_AND_REPLY')).toBe('EXPLAIN_TEXT');
    expect(actionsFor('SOCIAL_POST').up.task).toBe('EXPLAIN_TEXT');
    expect(actionsFor('SOCIAL_POST').down.task).toBe('DRAFT_REPLY');
  });

  it('routes Down to a reply for any selected X content', () => {
    expect(actionsFor('SOCIAL_POST').down.task).toBe('DRAFT_REPLY');
    expect(actionsFor('CONVERSATION').down.task).toBe('DRAFT_REPLY');
    expect(actionsFor('SELECTED_TEXT').down.task).toBe('DRAFT_REPLY');
    expect(actionsFor('ARTICLE_TEXT').down.task).toBe('DRAFT_REPLY');
  });
});
