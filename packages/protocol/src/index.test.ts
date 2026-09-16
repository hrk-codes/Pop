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

  it('accepts a generic web selection with source metadata', () => {
    const envelope = parseProtocolEnvelope({
      version: PROTOCOL_VERSION,
      id: crypto.randomUUID(),
      source: 'CHROME',
      type: 'CONTEXT',
      timestamp: 1,
      payload: {
        kind: 'ARTICLE_TEXT',
        platformId: 'WEB',
        text: 'LoRA updates a small trainable adapter while the base model stays frozen.',
        applicationId: 'chrome',
        domain: 'www.ibm.com',
        title: 'Low-rank adaptation fine tuning',
        observedAt: 1,
      },
    });

    expect(envelope.type).toBe('CONTEXT');
  });

  it('accepts a bounded X conversation with a stable thread URI', () => {
    const envelope = parseProtocolEnvelope({
      version: PROTOCOL_VERSION,
      id: crypto.randomUUID(),
      source: 'CHROME',
      type: 'CONTEXT',
      timestamp: 1,
      payload: {
        kind: 'CONVERSATION',
        platformId: 'X',
        text: '[POP_THREAD_CONTEXT_V1]\n\nTURN 1 | ROOT\nCONTENT:\nA post\n\nTURN 2 | OTHER\nCONTENT:\nA reply',
        applicationId: 'chrome',
        domain: 'x.com',
        title: 'Thread on X',
        documentUri: 'https://x.com/i/status/123',
        observedAt: 1,
      },
    });

    expect(envelope.type).toBe('CONTEXT');
    if (envelope.type === 'CONTEXT') {
      expect(envelope.payload.kind).toBe('CONVERSATION');
      expect(envelope.payload.documentUri).toBe('https://x.com/i/status/123');
    }
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

  it('accepts an arrow action from the approved adapter', () => {
    const envelope = parseProtocolEnvelope({
      version: PROTOCOL_VERSION,
      id: crypto.randomUUID(),
      source: 'CHROME',
      type: 'UI_COMMAND',
      timestamp: 1,
      payload: { command: 'DOWN' },
    });

    expect(envelope.type).toBe('UI_COMMAND');
  });
});
