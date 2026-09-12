import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type AdapterSource = 'CHROME';
export type PlatformId = 'X';
export type ContextKind = 'DRAFT_TEXT' | 'SOCIAL_POST' | 'ARTICLE_TEXT' | 'SELECTED_TEXT';
export type AssistanceTask =
  'EXPLAIN_TEXT' | 'IMPROVE_WRITING' | 'DRAFT_REPLY' | 'SUMMARIZE' | 'SHORTEN';

export interface ContextObservation {
  kind: ContextKind;
  platformId: PlatformId;
  text: string;
  applicationId: string;
  domain?: string;
  title?: string;
  observedAt: number;
}

export interface ActiveContext {
  source: AdapterSource;
  observation: ContextObservation;
  acceptedAt: number;
  expiresAt: number;
}

export interface RuntimeSnapshot {
  permissions: { monitoringEnabled: boolean; platforms: Record<PlatformId, boolean> };
  connectedAdapters: AdapterSource[];
  currentContext: ActiveContext | null;
  providerConfigured: boolean;
}

export interface AssistanceResponse {
  requestId: string;
  provider: string;
  model: string;
  outputs: string[];
  createdAt: number;
}

export interface AssistanceStarted {
  requestId: string;
  task: string;
  provider: string;
  model: string;
}

export interface AssistanceChunk {
  requestId: string;
  delta: string;
}
export interface AssistanceComplete extends AssistanceStarted {
  output: string;
}

export interface WritingAnalysis {
  original: string;
  corrected: string;
  issues: Array<{ message: string; start: number; end: number; replacement?: string }>;
  elapsedMs: number;
  engine: string;
}

export interface ProviderHealth {
  configured: boolean;
  reachable: boolean;
}
export interface CompanionPreferences {
  avatarSize: 56 | 76 | 104;
}

export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export function getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
  if (!isTauriRuntime())
    return Promise.resolve({
      permissions: { monitoringEnabled: false, platforms: { X: false } },
      connectedAdapters: [],
      currentContext: null,
      providerConfigured: false,
    });
  return invoke('get_runtime_snapshot');
}

export function getCompanionPreferences(): Promise<CompanionPreferences> {
  if (!isTauriRuntime()) return Promise.resolve({ avatarSize: 76 });
  return invoke('get_companion_preferences');
}

export function saveAvatarSize(value: number): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke('set_avatar_size', { value });
}

export function updateMonitoring(value: boolean): Promise<RuntimeSnapshot> {
  return invoke('set_monitoring', { value });
}

export function updatePlatformPermission(
  platformId: PlatformId,
  value: boolean,
): Promise<RuntimeSnapshot> {
  return invoke('set_platform_permission', { platformId, value });
}

export function checkProvider(): Promise<ProviderHealth> {
  return invoke('provider_health');
}

export function checkWriting(): Promise<WritingAnalysis> {
  return invoke('check_writing');
}

export function requestAssistance(task: AssistanceTask, tone: string): Promise<AssistanceResponse> {
  return invoke('run_assistance', { task, tone });
}

export function onRuntimeUpdate(handler: (snapshot: RuntimeSnapshot) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen<RuntimeSnapshot>('pop://runtime-updated', (event) => handler(event.payload));
}

export function onCloudActivity(handler: (active: boolean) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen<boolean>('pop://cloud-activity', (event) => handler(event.payload));
}

export function onAssistanceStarted(
  handler: (value: AssistanceStarted) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen<AssistanceStarted>('pop://assistance-started', (event) => handler(event.payload));
}

export function onAssistanceChunk(handler: (value: AssistanceChunk) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen<AssistanceChunk>('pop://assistance-chunk', (event) => handler(event.payload));
}

export function onAssistanceComplete(
  handler: (value: AssistanceComplete) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen<AssistanceComplete>('pop://assistance-complete', (event) => handler(event.payload));
}
