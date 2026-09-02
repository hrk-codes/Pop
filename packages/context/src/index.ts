import type { AdapterSource, ContextObservation } from '@pop/protocol';

export type Activity = 'READING' | 'WRITING' | 'CODING' | 'UNKNOWN';

export interface RawEvent {
  id: string;
  source: AdapterSource;
  observation: ContextObservation;
  receivedAt: number;
}

export interface ContextState {
  eventId: string;
  source: AdapterSource;
  activity: Activity;
  observation: ContextObservation;
  createdAt: number;
  expiresAt: number;
}

export const DEFAULT_CONTEXT_TTL_MS = 120_000;

export function classifyActivity(observation: ContextObservation): Activity {
  switch (observation.kind) {
    case 'X_DRAFT':
      return 'WRITING';
    case 'SELECTED_CODE':
      return 'CODING';
    case 'SELECTED_TEXT':
    case 'X_POST':
      return 'READING';
  }
}

export function reduceContextEvent(event: RawEvent, ttlMs = DEFAULT_CONTEXT_TTL_MS): ContextState {
  return {
    eventId: event.id,
    source: event.source,
    activity: classifyActivity(event.observation),
    observation: event.observation,
    createdAt: event.receivedAt,
    expiresAt: event.receivedAt + ttlMs,
  };
}

export function isContextFresh(state: ContextState, now: number): boolean {
  return now < state.expiresAt;
}

export function contextMatchesTarget(a: ContextState, b: ContextState): boolean {
  return (
    a.observation.applicationId === b.observation.applicationId &&
    a.observation.domain === b.observation.domain &&
    a.observation.documentUri === b.observation.documentUri
  );
}
