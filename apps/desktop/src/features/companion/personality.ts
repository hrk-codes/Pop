import type { ExpressionState } from './machine';

export type CompanionMood =
  | 'playful'
  | 'mischievous'
  | 'excited'
  | 'dramatic'
  | 'impatient'
  | 'silly'
  | 'curious'
  | 'encouraging'
  | 'sleepy'
  | 'privacy';

export type IdleGesture = 'bounce' | 'peek' | 'squint' | 'tilt';
export type IdleMood = Exclude<CompanionMood, 'privacy'>;

export interface CompanionMoment {
  id: string;
  text: string;
  mood: CompanionMood;
  lifetimeMs: number;
}

export interface IdleBehaviorStatus {
  personalityEnabled: boolean;
  monitoringEnabled: boolean;
  suspended: boolean;
  privacyPaused: boolean;
  hasContext: boolean;
  workActive: boolean;
  expression: ExpressionState;
}

const AMBIENT_MOMENTS: readonly CompanionMoment[] = [
  {
    id: 'tea-negotiation',
    text: 'Tiny question: are we getting tea, or am I expected to power this operation on pure enthusiasm?',
    mood: 'mischievous',
    lifetimeMs: 12_000,
  },
  {
    id: 'next-move',
    text: "What are we making next? Point me at something interesting and I'll try to be useful.",
    mood: 'curious',
    lifetimeMs: 11_000,
  },
  {
    id: 'momentum',
    text: "You've got a nice rhythm going. I'll keep watch for the next useful selection.",
    mood: 'encouraging',
    lifetimeMs: 10_000,
  },
  {
    id: 'bored',
    text: 'I may be getting slightly bored over here. Give me a sentence, a post, or a suspicious piece of code.',
    mood: 'sleepy',
    lifetimeMs: 12_000,
  },
  {
    id: 'music-break',
    text: "This feels like a one-song break moment. Your call; I'm not touching the play button without permission.",
    mood: 'playful',
    lifetimeMs: 12_000,
  },
  {
    id: 'focus-check',
    text: 'Still on the same mission, or did the mission quietly change while I was blinking?',
    mood: 'curious',
    lifetimeMs: 11_000,
  },
  {
    id: 'dramatic-silence',
    text: 'This silence is becoming very dramatic. I have blinked at least twice and nobody has given me a mission.',
    mood: 'dramatic',
    lifetimeMs: 12_000,
  },
  {
    id: 'tiny-deadline',
    text: "I have invented a deadline: show me something interesting before my next blink. It's extremely official.",
    mood: 'impatient',
    lifetimeMs: 12_000,
  },
  {
    id: 'found-something',
    text: 'Wait, are we building again? Excellent. I was almost forced to entertain myself.',
    mood: 'excited',
    lifetimeMs: 10_000,
  },
];

export const WELCOME_MOMENT: CompanionMoment = {
  id: 'welcome',
  text: "I'm awake. You work; I'll watch only the places you've allowed.",
  mood: 'encouraging',
  lifetimeMs: 9_000,
};

export const GOODBYE_MOMENT: CompanionMoment = {
  id: 'goodbye',
  text: "Monitoring is off. I'll stop looking and take a tiny nap.",
  mood: 'sleepy',
  lifetimeMs: 8_000,
};

export const PRIVACY_MOMENT: CompanionMoment = {
  id: 'privacy',
  text: 'Private space detected. I paused monitoring and cleared the active context.',
  mood: 'privacy',
  lifetimeMs: 8_000,
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export function canRunIdleBehavior(status: IdleBehaviorStatus): boolean {
  return Boolean(
    status.personalityEnabled &&
    status.monitoringEnabled &&
    !status.suspended &&
    !status.privacyPaused &&
    !status.hasContext &&
    !status.workActive &&
    ['idle', 'attentive'].includes(status.expression),
  );
}

export function responseLifetimeMs(text: string, kind: 'task' | 'companion' | 'error'): number {
  if (kind === 'companion') return clamp(7_000 + text.length * 35, 9_000, 14_000);
  if (kind === 'error') return 16_000;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const explicitLines = Math.max(1, text.split(/\r?\n/).length);
  const wrappedLines = Math.max(1, Math.ceil(text.length / 48));
  const visibleLines = Math.max(explicitLines, wrappedLines);

  // Give short answers a quick exit while preserving comfortable reading time for dense results.
  return clamp(7_000 + words * 260 + visibleLines * 700, 10_000, 90_000);
}

export function nextAmbientDelayMs(random: () => number = Math.random): number {
  return 75_000 + Math.floor(random() * 75_001);
}

export function nextIdleGestureDelayMs(random: () => number = Math.random): number {
  return 6_000 + Math.floor(random() * 8_001);
}

export function nextIdleGesture(
  previous: IdleGesture | null,
  random: () => number = Math.random,
): IdleGesture {
  const gestures: readonly IdleGesture[] = ['bounce', 'peek', 'squint', 'tilt'];
  const candidates = gestures.filter((gesture) => gesture !== previous);
  return candidates[Math.floor(random() * candidates.length)] ?? 'peek';
}

export function nextIdleMood(
  previous: IdleMood | null,
  random: () => number = Math.random,
): IdleMood {
  const moods: readonly IdleMood[] = [
    'playful',
    'mischievous',
    'excited',
    'dramatic',
    'impatient',
    'silly',
    'curious',
  ];
  const candidates = moods.filter((mood) => mood !== previous);
  return candidates[Math.floor(random() * candidates.length)] ?? 'silly';
}

export function nextCompanionMoment(
  previousId: string | null,
  random: () => number = Math.random,
): CompanionMoment {
  const candidates = AMBIENT_MOMENTS.filter((moment) => moment.id !== previousId);
  return candidates[Math.floor(random() * candidates.length)] ?? AMBIENT_MOMENTS[0]!;
}
