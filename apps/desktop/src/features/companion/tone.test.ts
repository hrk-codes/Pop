import { describe, expect, it } from 'vitest';

import { DEFAULT_REPLY_VOICE_PROFILE, replyVoiceSummary } from './tone';

describe('reply voice profile', () => {
  it('describes the default without overstating personalization', () => {
    expect(replyVoiceSummary(DEFAULT_REPLY_VOICE_PROFILE)).toBe('Natural voice');
  });

  it('surfaces the strongest selected traits and personal wording', () => {
    expect(
      replyVoiceSummary({
        warmth: 'WARM',
        directness: 'DIRECT',
        energy: 'LIVELY',
        humor: 'PLAYFUL',
        flavor: 'WITTY',
        note: 'Use simple words.',
      }),
    ).toBe('Funny · Warm');

    expect(
      replyVoiceSummary({
        ...DEFAULT_REPLY_VOICE_PROFILE,
        note: 'Use simple words.',
      }),
    ).toBe('Personal wording');
  });
});
