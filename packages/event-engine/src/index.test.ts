import { describe, expect, it } from 'vitest';

import { choosePrimarySuggestion } from './index';

describe('suggestion engine', () => {
  it('offers writing help for an X draft', () => {
    const suggestion = choosePrimarySuggestion({
      eventId: 'event-1',
      source: 'CHROME',
      activity: 'WRITING',
      createdAt: 1,
      expiresAt: 2,
      observation: {
        kind: 'X_DRAFT',
        text: 'i build pop today',
        applicationId: 'chrome',
        domain: 'x.com',
        observedAt: 1,
      },
    });

    expect(suggestion?.intent).toBe('IMPROVE_WRITING');
  });
});
