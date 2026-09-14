export type CompanionMood = 'playful' | 'curious' | 'encouraging' | 'sleepy' | 'privacy';

export interface CompanionMoment {
  id: string;
  text: string;
  mood: CompanionMood;
  lifetimeMs: number;
}

const AMBIENT_MOMENTS: readonly CompanionMoment[] = [
  {
    id: 'tea-negotiation',
    text: 'Tiny question: are we getting tea, or am I expected to power this operation on pure enthusiasm?',
    mood: 'playful',
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

export function responseLifetimeMs(text: string, kind: 'task' | 'companion' | 'error'): number {
  if (kind === 'companion') return clamp(7_000 + text.length * 35, 9_000, 14_000);
  if (kind === 'error') return 16_000;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return clamp(24_000 + words * 360, 30_000, 120_000);
}

export function nextAmbientDelayMs(random: () => number = Math.random): number {
  return 180_000 + Math.floor(random() * 180_001);
}

export function nextCompanionMoment(
  previousId: string | null,
  random: () => number = Math.random,
): CompanionMoment {
  const candidates = AMBIENT_MOMENTS.filter((moment) => moment.id !== previousId);
  return candidates[Math.floor(random() * candidates.length)] ?? AMBIENT_MOMENTS[0]!;
}
