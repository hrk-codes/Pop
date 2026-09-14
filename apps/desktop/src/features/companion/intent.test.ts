import { describe, expect, it } from 'vitest';

import { actionsFor, automaticTaskFor } from './intent';

describe('POP intent routing', () => {
  it('automatically chooses an action that matches each context', () => {
    expect(automaticTaskFor('DRAFT_TEXT')).toBe('CHECK_WRITING');
    expect(automaticTaskFor('SOCIAL_POST')).toBe('EXPLAIN_TEXT');
    expect(automaticTaskFor('SELECTED_TEXT')).toBe('EXPLAIN_TEXT');
    expect(automaticTaskFor('ARTICLE_TEXT')).toBe('EXPLAIN_TEXT');
  });

  it('offers replies only for social posts', () => {
    expect(actionsFor('SOCIAL_POST').down.task).toBe('DRAFT_REPLY');
    expect(actionsFor('SELECTED_TEXT').down.task).toBe('EXPLAIN_TEXT');
    expect(actionsFor('ARTICLE_TEXT').down.task).toBe('EXPLAIN_TEXT');
  });
});
