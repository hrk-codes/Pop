import type { ContextKind } from '@pop/protocol';

const MAX_CONTEXT_CHARACTERS = 8000;

export function boundContext(text: string): string {
  const characters = [...text];
  if (characters.length <= MAX_CONTEXT_CHARACTERS) return text;

  const omission = '\n\n[Middle of selection omitted locally]\n\n';
  const omissionLength = [...omission].length;
  const available = MAX_CONTEXT_CHARACTERS - omissionLength;
  const headLength = Math.floor(available * 0.68);
  return `${characters.slice(0, headLength).join('')}${omission}${characters
    .slice(characters.length - (available - headLength))
    .join('')}`;
}

export function classifySelection(
  xPage: boolean,
  insideArticle: boolean,
  textLength: number,
): ContextKind {
  if (xPage) return insideArticle ? 'SOCIAL_POST' : 'SELECTED_TEXT';
  return insideArticle || textLength >= 600 ? 'ARTICLE_TEXT' : 'SELECTED_TEXT';
}

export function selectionSettleDelay(editable: boolean, selectedCharacters: number): number {
  if (editable) return 650;
  if (selectedCharacters >= 1_500) return 700;
  if (selectedCharacters >= 600) return 500;
  return 300;
}
