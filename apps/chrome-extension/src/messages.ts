import type { ContextObservation } from '@pop/protocol';

export type ContentMessage = { type: 'POP_CONTEXT'; observation: ContextObservation };
export type PopupMessage = { type: 'POP_PAIR'; pairingCode: string } | { type: 'POP_STATUS' };

export interface AdapterStatus {
  state: 'DISCONNECTED' | 'CONNECTING' | 'PAIRING_REQUIRED' | 'CONNECTED' | 'ERROR';
  detail?: string;
}
