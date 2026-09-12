import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import { companionMachine } from './machine';

describe('living POP state', () => {
  it('moves from attention to streamed speech deterministically', () => {
    const actor = createActor(companionMachine).start();
    actor.send({ type: 'CONTEXT_READY' });
    expect(actor.getSnapshot().context.expression).toBe('attentive');
    actor.send({ type: 'REQUEST' });
    expect(actor.getSnapshot().context.expression).toBe('thinking');
    actor.send({ type: 'CHUNK' });
    expect(actor.getSnapshot().context.expression).toBe('speaking');
    actor.stop();
  });
});
