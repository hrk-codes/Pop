import { describe, expect, it } from 'vitest';

import { isContextFresh, reduceContextEvent } from './index';

describe('context state', () => {
  it('classifies and expires a draft deterministically', () => {
    const state = reduceContextEvent(
      {
        id: 'event-1',
        source: 'CHROME',
        receivedAt: 1_000,
        observation: {
          kind: 'X_DRAFT',
          text: 'Today I built POP.',
          applicationId: 'chrome',
          domain: 'x.com',
          observedAt: 990,
        },
      },
      500,
    );

    expect(state.activity).toBe('WRITING');
    expect(isContextFresh(state, 1_499)).toBe(true);
    expect(isContextFresh(state, 1_500)).toBe(false);
  });
});
