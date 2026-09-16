import { boundContext } from './selection';

export interface ConversationTurn {
  authorName?: string;
  authorHandle?: string;
  text: string;
  isSelf: boolean;
}

export interface ConversationTranscript {
  text: string;
  turnCount: number;
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

export function buildConversationTranscript(
  turns: readonly ConversationTurn[],
): ConversationTranscript | null {
  const normalized = turns
    .map((turn) => ({
      authorName: clean(turn.authorName),
      authorHandle: clean(turn.authorHandle),
      text: turn.text.trim(),
      isSelf: turn.isSelf,
    }))
    .filter((turn) => turn.text.length >= 2);

  if (normalized.length < 2 || normalized.at(-1)?.isSelf) return null;

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

  return { text: boundContext(transcript), turnCount: normalized.length };
}
