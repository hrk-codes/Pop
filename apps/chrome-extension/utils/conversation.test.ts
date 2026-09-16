import { describe, expect, it } from 'vitest';

import { buildConversationTranscript } from './conversation';

describe('X conversation transcript', () => {
  it('orders the root, user reply, and latest other-person turn', () => {
    const transcript = buildConversationTranscript([
      { authorHandle: '@author', text: 'Original post', isSelf: false },
      { authorHandle: '@me', text: 'My earlier reply', isSelf: true },
      { authorHandle: '@author', text: 'Their latest question?', isSelf: false },
    ]);

    expect(transcript?.turnCount).toBe(3);
    expect(transcript?.text).toContain('TURN 1 | ROOT | @author');
    expect(transcript?.text).toContain('TURN 2 | YOU | @me');
    expect(transcript?.text).toContain('TURN 3 | OTHER | @author');
    expect(transcript?.text.endsWith('Their latest question?')).toBe(true);
  });

  it('does not treat a single post or the user own final turn as a reply target', () => {
    expect(buildConversationTranscript([{ text: 'One selected post', isSelf: false }])).toBeNull();
    expect(
      buildConversationTranscript([
        { text: 'Original post', isSelf: false },
        { text: 'My latest reply', isSelf: true },
      ]),
    ).toBeNull();
  });

  it('keeps the opening and latest turn when a thread exceeds the context limit', () => {
    const transcript = buildConversationTranscript([
      { text: `Opening context ${'A'.repeat(5_000)}`, isSelf: false },
      { text: `Middle turn ${'M'.repeat(5_000)}`, isSelf: true },
      { text: `Latest turn ${'Z'.repeat(5_000)}`, isSelf: false },
    ]);

    expect([...(transcript?.text ?? '')]).toHaveLength(8_000);
    expect(transcript?.text).toContain('Opening context');
    expect(transcript?.text).toContain('[Middle of selection omitted locally]');
    expect(transcript?.text.endsWith('Z'.repeat(100))).toBe(true);
  });
});
