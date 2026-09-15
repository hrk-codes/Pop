import type { AssistanceTask, ContextKind } from '../runtime/runtime-client';

export type CompanionTask = AssistanceTask | 'CHECK_WRITING';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type ActionItem = { task?: CompanionTask };

export function actionsFor(kind?: ContextKind): Record<Direction, ActionItem> {
  if (kind === 'DRAFT_TEXT') {
    return {
      up: { task: 'CHECK_WRITING' },
      down: { task: 'IMPROVE_WRITING' },
      right: { task: 'SHORTEN' },
      left: {},
    };
  }
  if (kind === 'SOCIAL_POST' || kind === 'SELECTED_TEXT' || kind === 'ARTICLE_TEXT') {
    return {
      up: { task: 'EXPLAIN_TEXT' },
      down: { task: 'DRAFT_REPLY' },
      right: { task: 'SUMMARIZE' },
      left: {},
    };
  }
  return {
    up: { task: 'EXPLAIN_TEXT' },
    down: { task: 'EXPLAIN_TEXT' },
    right: { task: 'SUMMARIZE' },
    left: {},
  };
}

export function automaticTaskFor(kind?: ContextKind): CompanionTask | null {
  if (kind === 'DRAFT_TEXT') return 'CHECK_WRITING';
  if (kind === 'SOCIAL_POST' || kind === 'ARTICLE_TEXT' || kind === 'SELECTED_TEXT')
    return 'EXPLAIN_TEXT';
  return null;
}
