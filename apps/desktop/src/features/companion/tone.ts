import type { ReplyVoiceProfile } from '../runtime/runtime-client';

export const DEFAULT_REPLY_VOICE_PROFILE: ReplyVoiceProfile = {
  warmth: 'BALANCED',
  directness: 'BALANCED',
  energy: 'NATURAL',
  humor: 'LIGHT',
  flavor: 'NATURAL',
  note: '',
};

export const VOICE_DIMENSIONS = [
  {
    key: 'warmth',
    label: 'Warmth',
    options: [
      ['RESERVED', 'Reserved'],
      ['BALANCED', 'Balanced'],
      ['WARM', 'Warm'],
    ],
  },
  {
    key: 'directness',
    label: 'Directness',
    options: [
      ['GENTLE', 'Gentle'],
      ['BALANCED', 'Balanced'],
      ['DIRECT', 'Direct'],
    ],
  },
  {
    key: 'energy',
    label: 'Energy',
    options: [
      ['CALM', 'Calm'],
      ['NATURAL', 'Natural'],
      ['LIVELY', 'Lively'],
    ],
  },
  {
    key: 'humor',
    label: 'Humor',
    options: [
      ['NONE', 'None'],
      ['LIGHT', 'Light'],
      ['PLAYFUL', 'Playful'],
    ],
  },
  {
    key: 'flavor',
    label: 'Style',
    options: [
      ['NATURAL', 'Natural'],
      ['WITTY', 'Funny'],
      ['DRY', 'Dry'],
      ['BOLD', 'Bold'],
      ['CHAOTIC', 'Chaotic'],
      ['CRINGE', 'Cringe'],
    ],
  },
] as const;

export function replyVoiceSummary(profile: ReplyVoiceProfile): string {
  const flavor =
    profile.flavor === 'WITTY'
      ? 'Funny'
      : profile.flavor === 'DRY'
        ? 'Dry'
        : profile.flavor === 'BOLD'
          ? 'Bold'
          : profile.flavor === 'CHAOTIC'
            ? 'Chaotic'
            : profile.flavor === 'CRINGE'
              ? 'Cringe'
              : null;
  const traits = [
    flavor,
    profile.warmth === 'WARM' ? 'Warm' : profile.warmth === 'RESERVED' ? 'Reserved' : null,
    profile.directness === 'DIRECT' ? 'Direct' : profile.directness === 'GENTLE' ? 'Gentle' : null,
    profile.energy === 'LIVELY' ? 'Lively' : profile.energy === 'CALM' ? 'Calm' : null,
    profile.humor === 'PLAYFUL' ? 'Playful' : profile.humor === 'NONE' ? 'No humor' : null,
  ].filter(Boolean);

  if (profile.note.trim() && traits.length === 0) traits.push('Personal wording');
  return traits.length > 0 ? traits.slice(0, 2).join(' · ') : 'Natural voice';
}
