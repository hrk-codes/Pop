import { assign, createMachine } from 'xstate';

export type ExpressionState =
  | 'sleeping'
  | 'idle'
  | 'attentive'
  | 'thinking'
  | 'speaking'
  | 'success'
  | 'playful'
  | 'mischievous'
  | 'excited'
  | 'dramatic'
  | 'impatient'
  | 'silly'
  | 'curious'
  | 'encouraging'
  | 'uncertain'
  | 'blocked'
  | 'privacy';

export const companionMachine = createMachine({
  types: {} as {
    context: { expression: ExpressionState };
    events:
      | { type: 'RESET' }
      | { type: 'CONTEXT_READY' }
      | { type: 'REQUEST' }
      | { type: 'CHUNK' }
      | { type: 'STREAM_END' }
      | { type: 'SUCCESS' }
      | { type: 'FAIL' };
  },
  context: { expression: 'idle' },
  initial: 'idle',
  states: {
    idle: {
      entry: assign({ expression: 'idle' }),
      on: { CONTEXT_READY: 'attentive', REQUEST: 'thinking' },
    },
    attentive: {
      entry: assign({ expression: 'attentive' }),
      on: { REQUEST: 'thinking', RESET: 'idle' },
    },
    thinking: {
      entry: assign({ expression: 'thinking' }),
      on: { CHUNK: 'speaking', SUCCESS: 'success', FAIL: 'blocked', RESET: 'idle' },
    },
    speaking: {
      entry: assign({ expression: 'speaking' }),
      on: { SUCCESS: 'success', STREAM_END: 'attentive', FAIL: 'blocked', RESET: 'idle' },
    },
    success: {
      entry: assign({ expression: 'success' }),
      after: { 1800: 'attentive' },
      on: { REQUEST: 'thinking', RESET: 'idle' },
    },
    blocked: {
      entry: assign({ expression: 'blocked' }),
      after: { 2400: 'attentive' },
      on: { REQUEST: 'thinking', RESET: 'idle' },
    },
  },
});
