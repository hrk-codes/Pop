import { boundContext } from './selection';

export interface ConversationTurn {
  postId?: string;
  authorName?: string;
  authorHandle?: string;
  replyingToHandle?: string;
  text: string;
  isSelf: boolean;
}

export interface ConversationTranscript {
  text: string;
  turnCount: number;
  context: {
    turns: Array<{
      postId?: string;
      authorHandle?: string;
      replyingToHandle?: string;
      text: string;
      role: 'ROOT' | 'YOU' | 'OTHER';
    }>;
    replyTargetIndex: number;
    ambiguous: boolean;
  };
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

export function buildConversationTranscript(
  turns: readonly ConversationTurn[],
): ConversationTranscript | null {
  const allTurns = turns
    .map((turn) => ({
      postId: turn.postId,
      authorName: clean(turn.authorName),
      authorHandle: clean(turn.authorHandle),
      replyingToHandle: clean(turn.replyingToHandle),
      text: turn.text.trim(),
      isSelf: turn.isSelf,
    }))
    .filter((turn) => turn.text.length >= 2);

  const normalized = allTurns.length > 30 ? [allTurns[0], ...allTurns.slice(-29)] : allTurns;

  if (normalized.length < 2 || normalized.at(-1)?.isSelf) return null;

  // Preserve the root and target. Middle turns may be removed, never the target's point.
  normalized[0].text = [...normalized[0].text].slice(0, 1_800).join('');
  normalized[normalized.length - 1].text = [...normalized.at(-1)!.text].slice(0, 3_000).join('');
  for (let index = 1; index < normalized.length - 1; index += 1) {
    normalized[index].text = [...normalized[index].text].slice(0, 900).join('');
  }
  while (
    normalized.reduce((sum, turn) => sum + [...turn.text].length, 0) > 7_800 &&
    normalized.length > 2
  ) {
    normalized.splice(1, 1);
  }

  const last = normalized.at(-1)!;
  const previous = normalized.at(-2)!;
  const replyTo = last.replyingToHandle?.toLowerCase();
  const previousHandle = previous.authorHandle?.toLowerCase();
  const ambiguous = Boolean(replyTo && previousHandle && replyTo !== previousHandle);

  const formatted = normalized.map((turn, index) => {
    const role = index === 0 ? 'ROOT' : turn.isSelf ? 'YOU' : 'OTHER';
    const identity = [turn.authorName, turn.authorHandle].filter(Boolean).join(' ');
    return `TURN ${index + 1} | ${role}${identity ? ` | ${identity}` : ''}\nCONTENT:\n${turn.text}`;
  });
  const transcript = [
    '[POP_THREAD_CONTEXT_V1]',
    'ORDER: oldest to newest',
    'REPLY_TARGET: the final OTHER turn',
    ...formatted,
  ].join('\n\n');

  return {
    text: boundContext(transcript),
    turnCount: normalized.length,
    context: {
      turns: normalized.map((turn, index) => ({
        postId: turn.postId,
        authorHandle: turn.authorHandle,
        replyingToHandle: turn.replyingToHandle,
        text: turn.text,
        role: index === 0 ? 'ROOT' : turn.isSelf ? 'YOU' : 'OTHER',
      })),
      replyTargetIndex: normalized.length - 1,
      ambiguous,
    },
  };
}
