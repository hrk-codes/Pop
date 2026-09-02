import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type AdapterSource = 'CHROME' | 'VSCODE';
export type ContextKind = 'SELECTED_TEXT' | 'SELECTED_CODE' | 'X_POST' | 'X_DRAFT';
export type AssistanceTask = 'EXPLAIN_CODE' | 'EXPLAIN_TEXT' | 'IMPROVE_WRITING' | 'DRAFT_X_REPLY';

export interface ContextObservation {
  kind: ContextKind;
  text: string;
  applicationId: string;
  domain?: string;
  title?: string;
  language?: string;
  capturedAt: number;
}

export interface ActiveContext {
  source: AdapterSource;
  observation: ContextObservation;
  acceptedAt: number;
  expiresAt: number;
}

export interface RuntimeSnapshot {
  pairingCode: string;
  permissions: {
    monitoringEnabled: boolean;
    xAllowed: boolean;
    vscodeAllowed: boolean;
  };
  connectedAdapters: AdapterSource[];
  currentContext: ActiveContext | null;
  suggestion: string | null;
  providerConfigured: boolean;
}

export interface AssistanceResponse {
  requestId: string;
  provider: string;
  model: string;
  outputs: string[];
  createdAt: number;
}

export interface ProviderHealth {
  configured: boolean;
  reachable: boolean;
}

export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export async function getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>('get_runtime_snapshot');
}

export async function updatePermission(
  key: 'monitoring_enabled' | 'x_allowed' | 'vscode_allowed',
  value: boolean,
): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>('set_permission', { key, value });
}

export async function refreshPairingCode(): Promise<string> {
  return invoke<string>('regenerate_pairing_code');
}

export async function checkProvider(): Promise<ProviderHealth> {
  return invoke<ProviderHealth>('provider_health');
}

export async function requestAssistance(
  task: AssistanceTask,
  tone: string,
): Promise<AssistanceResponse> {
  return invoke<AssistanceResponse>('run_assistance', { task, tone });
}

export async function onRuntimeUpdate(
  handler: (snapshot: RuntimeSnapshot) => void,
): Promise<UnlistenFn> {
  return listen<RuntimeSnapshot>('pop://runtime-updated', (event) => handler(event.payload));
}

export async function onCloudActivity(handler: (active: boolean) => void): Promise<UnlistenFn> {
  return listen<boolean>('pop://cloud-activity', (event) => handler(event.payload));
}
