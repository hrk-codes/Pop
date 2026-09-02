import type { ContextState } from '@pop/context';

export type AssistanceIntent =
  'EXPLAIN_CODE' | 'EXPLAIN_TEXT' | 'IMPROVE_WRITING' | 'DRAFT_X_REPLY';

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
      return [{ intent: 'EXPLAIN_CODE', confidence: 0.95, reasons: ['CODE_SELECTION'] }];
    case 'SELECTED_TEXT':
      return [{ intent: 'EXPLAIN_TEXT', confidence: 0.85, reasons: ['TEXT_SELECTION'] }];
    case 'X_DRAFT':
      return [{ intent: 'IMPROVE_WRITING', confidence: 0.95, reasons: ['ACTIVE_X_DRAFT'] }];
    case 'X_POST':
      return [{ intent: 'DRAFT_X_REPLY', confidence: 0.9, reasons: ['VISIBLE_X_POST'] }];
  }
}

const LABELS: Readonly<Record<AssistanceIntent, string>> = {
  EXPLAIN_CODE: 'Explain code',
  EXPLAIN_TEXT: 'Explain text',
  IMPROVE_WRITING: 'Improve writing',
  DRAFT_X_REPLY: 'Draft replies',
};

export function choosePrimarySuggestion(context: ContextState): SuggestionCandidate | null {
  const [candidate] = generateIntentCandidates(context);
  if (!candidate || candidate.confidence < 0.7) return null;

  return {
    ...candidate,
    label: LABELS[candidate.intent],
    priority: Math.round(candidate.confidence * 100),
  };
}
