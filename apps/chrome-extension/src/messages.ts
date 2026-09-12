import type { ContextObservation, PlatformId } from '@pop/protocol';

export type ContentMessage =
  { type: 'POP_CONTEXT'; observation: ContextObservation } | { type: 'POP_OPEN_UI' };
export type PopupMessage =
  | { type: 'POP_PAIR'; pairingCode: string }
  | { type: 'POP_STATUS' }
  | {
      type: 'POP_PLATFORM_CHANGED';
      platformId: Exclude<PlatformId, 'VSCODE' | 'CURSOR'>;
      enabled: boolean;
    };

export interface AdapterStatus {
  state: 'DISCONNECTED' | 'CONNECTING' | 'PAIRING_REQUIRED' | 'CONNECTED' | 'ERROR';
  detail?: string;
}
