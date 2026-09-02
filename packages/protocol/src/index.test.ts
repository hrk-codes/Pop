import { describe, expect, it } from 'vitest';

import { parseProtocolEnvelope } from './index';

describe('protocol envelope', () => {
  it('accepts a bounded Chrome context message', () => {
    const envelope = parseProtocolEnvelope({
      version: 1,
      id: '9fd4929d-07c8-4ce5-bd38-1d9566f77ad0',
      source: 'CHROME',
      type: 'CONTEXT',
      timestamp: 1,
      payload: {
        kind: 'X_DRAFT',
        text: 'Building POP in public.',
        applicationId: 'chrome',
        domain: 'x.com',
        observedAt: 1,
      },
    });

    expect(envelope.type).toBe('CONTEXT');
  });

  it('rejects unknown versions and oversized text', () => {
    expect(() =>
      parseProtocolEnvelope({
        version: 99,
        id: crypto.randomUUID(),
        source: 'CHROME',
        type: 'CONTEXT',
        timestamp: 1,
        payload: {
          kind: 'X_DRAFT',
          text: 'x'.repeat(12_001),
          applicationId: 'chrome',
          domain: 'x.com',
          observedAt: 1,
        },
      }),
    ).toThrow();
  });
});
