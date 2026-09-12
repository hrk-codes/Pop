import type { ContextState } from '@pop/context';

export type AssistanceIntent =
  'EXPLAIN_CODE' | 'REVIEW_CODE' | 'EXPLAIN_TEXT' | 'IMPROVE_WRITING' | 'DRAFT_REPLY' | 'SUMMARIZE';

export interface IntentCandidate {
  intent: AssistanceIntent;
  confidence: number;
  reasons: readonly string[];
}

export interface SuggestionCandidate extends IntentCandidate {
  label: string;
  priority: number;
}

export function generateIntentCandidates(context: ContextState): readonly IntentCandidate[] {
  switch (context.observation.kind) {
    case 'SELECTED_CODE':
      return [
        { intent: 'EXPLAIN_CODE', confidence: 0.95, reasons: ['CODE_SELECTION'] },
        { intent: 'REVIEW_CODE', confidence: 0.86, reasons: ['CODE_SELECTION'] },
      ];
    case 'SELECTED_TEXT':
    case 'ARTICLE_TEXT':
      return [
        { intent: 'EXPLAIN_TEXT', confidence: 0.85, reasons: ['TEXT_SELECTION'] },
        { intent: 'SUMMARIZE', confidence: 0.8, reasons: ['READING_CONTEXT'] },
      ];
    case 'DRAFT_TEXT':
    case 'SEARCH_QUERY':
      return [{ intent: 'IMPROVE_WRITING', confidence: 0.95, reasons: ['ACTIVE_DRAFT'] }];
    case 'SOCIAL_POST':
    case 'CONVERSATION':
      return [
        { intent: 'DRAFT_REPLY', confidence: 0.9, reasons: ['REPLY_CONTEXT'] },
        { intent: 'SUMMARIZE', confidence: 0.78, reasons: ['READING_CONTEXT'] },
        { intent: 'EXPLAIN_TEXT', confidence: 0.74, reasons: ['READING_CONTEXT'] },
      ];
  }
}

const LABELS: Readonly<Record<AssistanceIntent, string>> = {
  EXPLAIN_CODE: 'Explain code',
  REVIEW_CODE: 'Review code',
  EXPLAIN_TEXT: 'Explain text',
  IMPROVE_WRITING: 'Improve writing',
  DRAFT_REPLY: 'Draft replies',
  SUMMARIZE: 'Summarize',
};

export function choosePrimarySuggestion(context: ContextState): SuggestionCandidate | null {
  const [candidate] = [...generateIntentCandidates(context)].sort(
    (a, b) => b.confidence - a.confidence,
  );
  if (!candidate || candidate.confidence < 0.7) return null;

  return {
    ...candidate,
    label: LABELS[candidate.intent],
    priority: Math.round(candidate.confidence * 100),
  };
}
