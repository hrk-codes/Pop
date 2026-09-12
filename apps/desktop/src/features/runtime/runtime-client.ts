import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type AdapterSource = 'CHROME' | 'VSCODE';
export type PlatformId =
  'X' | 'GOOGLE' | 'YOUTUBE' | 'WHATSAPP' | 'CHATGPT' | 'CLAUDE' | 'VSCODE' | 'CURSOR';
export type ContextKind =
  | 'DRAFT_TEXT'
  | 'SOCIAL_POST'
  | 'SEARCH_QUERY'
  | 'CONVERSATION'
  | 'ARTICLE_TEXT'
  | 'SELECTED_TEXT'
  | 'SELECTED_CODE';
export type AssistanceTask =
  'EXPLAIN_CODE' | 'REVIEW_CODE' | 'EXPLAIN_TEXT' | 'IMPROVE_WRITING' | 'DRAFT_REPLY' | 'SUMMARIZE';
export type SuggestionTask = AssistanceTask | 'CHECK_WRITING';

export interface ContextObservation {
  kind: ContextKind;
  platformId: PlatformId;
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

export interface SuggestionOption {
  task: SuggestionTask;
  label: string;
  confidence: number;
  reason: string;
  local: boolean;
}

export interface RuntimeSnapshot {
  pairingCode: string;
  permissions: {
    monitoringEnabled: boolean;
    platforms: Record<PlatformId, boolean>;
  };
  connectedAdapters: AdapterSource[];
  currentContext: ActiveContext | null;
  suggestions: SuggestionOption[];
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

export interface WritingIssue {
  message: string;
  start: number;
  end: number;
  replacement?: string;
}

export interface WritingAnalysis {
  original: string;
  corrected: string;
  issues: WritingIssue[];
  elapsedMs: number;
  engine: string;
}

export interface ProviderHealth {
  configured: boolean;
  reachable: boolean;
}

export interface LearnedHabit {
  id: string;
  label: string;
  evidenceCount: number;
  confidence: number;
  updatedAt: number;
}

export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export async function getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>('get_runtime_snapshot');
}

export async function updateMonitoring(value: boolean): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>('set_monitoring', { value });
}

export async function updatePlatformPermission(
  platformId: PlatformId,
  value: boolean,
): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>('set_platform_permission', { platformId, value });
}

export async function refreshPairingCode(): Promise<string> {
  return invoke<string>('regenerate_pairing_code');
}

export async function checkProvider(): Promise<ProviderHealth> {
  return invoke<ProviderHealth>('provider_health');
}

export async function checkWriting(): Promise<WritingAnalysis> {
  return invoke<WritingAnalysis>('check_writing');
}

export async function getLearnedHabits(): Promise<LearnedHabit[]> {
  return invoke<LearnedHabit[]>('get_learned_habits');
}

export async function recordCopyPreference(
  task: string,
  tone: string,
  outputChars: number,
): Promise<LearnedHabit[]> {
  return invoke<LearnedHabit[]>('record_copy_preference', { task, tone, outputChars });
}

export async function forgetLearnedHabit(id: string): Promise<LearnedHabit[]> {
  return invoke<LearnedHabit[]>('forget_habit', { id });
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
