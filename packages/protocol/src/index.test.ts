import { describe, expect, it } from 'vitest';

import { parseProtocolEnvelope, PROTOCOL_VERSION } from './index';

describe('protocol envelope', () => {
  it('accepts a bounded Chrome context message', () => {
    const envelope = parseProtocolEnvelope({
      version: PROTOCOL_VERSION,
      id: '9fd4929d-07c8-4ce5-bd38-1d9566f77ad0',
      source: 'CHROME',
      type: 'CONTEXT',
      timestamp: 1,
      payload: {
        kind: 'DRAFT_TEXT',
        platformId: 'X',
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
          kind: 'DRAFT_TEXT',
          platformId: 'X',
          text: 'x'.repeat(8_001),
          applicationId: 'chrome',
          domain: 'x.com',
          observedAt: 1,
        },
      }),
    ).toThrow();
  });

  it('accepts a heartbeat without pairing credentials', () => {
    const envelope = parseProtocolEnvelope({
      version: PROTOCOL_VERSION,
      id: crypto.randomUUID(),
      source: 'CHROME',
      type: 'HEARTBEAT',
      timestamp: 1,
      payload: {},
    });

    expect(envelope.type).toBe('HEARTBEAT');
  });
});
