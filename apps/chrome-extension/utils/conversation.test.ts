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

    expect([...(transcript?.text ?? '')].length).toBeLessThanOrEqual(8_000);
    expect(transcript?.text).toContain('Opening context');
    expect(transcript?.text.endsWith('Z'.repeat(100))).toBe(true);
    expect(transcript?.context.turns.at(-1)?.text.startsWith('Latest turn')).toBe(true);
  });

  it('keeps the newest target when more than thirty posts are selected', () => {
    const turns = [
      { text: 'Root post', isSelf: false },
      ...Array.from({ length: 30 }, (_, index) => ({
        text: `Middle ${index}`,
        isSelf: index % 2 === 0,
      })),
      { text: 'Actual newest reply', isSelf: false },
    ];
    const transcript = buildConversationTranscript(turns);
    expect(transcript?.context.turns[0].text).toBe('Root post');
    expect(transcript?.context.turns.at(-1)?.text).toBe('Actual newest reply');
    expect(transcript?.context.replyTargetIndex).toBe((transcript?.turnCount ?? 0) - 1);
  });

  it('flags a last reply addressed to a different branch', () => {
    const transcript = buildConversationTranscript([
      { authorHandle: '@root', text: 'Root post', isSelf: false },
      { authorHandle: '@other', text: 'Another reply', isSelf: false },
      {
        authorHandle: '@third',
        replyingToHandle: '@root',
        text: 'Different branch',
        isSelf: false,
      },
    ]);
    expect(transcript?.context.ambiguous).toBe(true);
  });
});
