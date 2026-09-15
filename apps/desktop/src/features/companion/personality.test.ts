import { describe, expect, it } from 'vitest';

import {
  canRunIdleBehavior,
  nextAmbientDelayMs,
  nextCompanionMoment,
  nextIdleGesture,
  nextIdleGestureDelayMs,
  nextIdleMood,
  responseLifetimeMs,
} from './personality';

describe('POP personality timing', () => {
  it('keeps task responses readable without leaving them open forever', () => {
    const short = responseLifetimeMs('A short answer.\nOne useful detail.', 'task');
    const detailed = responseLifetimeMs('word '.repeat(120), 'task');

    expect(short).toBe(10_000);
    expect(detailed).toBeGreaterThan(short);
    expect(responseLifetimeMs('word '.repeat(500), 'task')).toBe(90_000);
  });

  it('keeps companion chatter brief', () => {
    expect(responseLifetimeMs('Tea?', 'companion')).toBe(9_000);
  });

  it('spaces spoken ambient moments without making POP feel absent', () => {
    expect(nextAmbientDelayMs(() => 0)).toBe(75_000);
    expect(nextAmbientDelayMs(() => 1)).toBe(150_001);
  });

  it('does not immediately repeat the same moment', () => {
    const first = nextCompanionMoment(null, () => 0);
    expect(nextCompanionMoment(first.id, () => 0).id).not.toBe(first.id);
  });

  it('uses frequent but non-repeating gestures only for the idle loop', () => {
    expect(nextIdleGestureDelayMs(() => 0)).toBe(6_000);
    expect(nextIdleGestureDelayMs(() => 1)).toBe(14_001);
    expect(nextIdleGesture('bounce', () => 0)).not.toBe('bounce');
    expect(nextIdleMood('playful', () => 0)).not.toBe('playful');
  });

  it('allows gaze and gestures only while POP is genuinely idle', () => {
    const idle = {
      personalityEnabled: true,
      monitoringEnabled: true,
      suspended: false,
      privacyPaused: false,
      hasContext: false,
      workActive: false,
      expression: 'idle' as const,
    };
    expect(canRunIdleBehavior(idle)).toBe(true);
    expect(canRunIdleBehavior({ ...idle, workActive: true })).toBe(false);
    expect(canRunIdleBehavior({ ...idle, hasContext: true })).toBe(false);
    expect(canRunIdleBehavior({ ...idle, privacyPaused: true })).toBe(false);
    expect(canRunIdleBehavior({ ...idle, expression: 'speaking' })).toBe(false);
  });
});
