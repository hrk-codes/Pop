import { describe, expect, it } from 'vitest';

import { nextAmbientDelayMs, nextCompanionMoment, responseLifetimeMs } from './personality';

describe('POP personality timing', () => {
  it('keeps task responses readable without leaving them open forever', () => {
    expect(responseLifetimeMs('A short answer.', 'task')).toBe(30_000);
    expect(responseLifetimeMs('word '.repeat(500), 'task')).toBe(120_000);
  });

  it('keeps companion chatter brief', () => {
    expect(responseLifetimeMs('Tea?', 'companion')).toBe(9_000);
  });

  it('spaces ambient moments several minutes apart', () => {
    expect(nextAmbientDelayMs(() => 0)).toBe(180_000);
    expect(nextAmbientDelayMs(() => 1)).toBe(360_001);
  });

  it('does not immediately repeat the same moment', () => {
    const first = nextCompanionMoment(null, () => 0);
    expect(nextCompanionMoment(first.id, () => 0).id).not.toBe(first.id);
  });
});
