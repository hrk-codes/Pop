import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type AdapterSource = 'CHROME';
export type PlatformId = 'X' | 'WEB';
export type ContextKind =
  'DRAFT_TEXT' | 'SOCIAL_POST' | 'CONVERSATION' | 'ARTICLE_TEXT' | 'SELECTED_TEXT';
export type AssistanceTask =
  'EXPLAIN_TEXT' | 'IMPROVE_WRITING' | 'DRAFT_REPLY' | 'SUMMARIZE' | 'SHORTEN';

export interface ContextObservation {
  kind: ContextKind;
  platformId: PlatformId;
  text: string;
  applicationId: string;
  domain?: string;
  title?: string;
  documentUri?: string;
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
  suspended: boolean;
  privacyPaused: boolean;
  privacyReason: string | null;
  lastContextError: string | null;
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
export type AutomaticResponseMode = 'EXPLAIN' | 'REPLY' | 'EXPLAIN_AND_REPLY';
export interface ReplyVoiceProfile {
  warmth: 'RESERVED' | 'BALANCED' | 'WARM';
  directness: 'GENTLE' | 'BALANCED' | 'DIRECT';
  energy: 'CALM' | 'NATURAL' | 'LIVELY';
  humor: 'NONE' | 'LIGHT' | 'PLAYFUL';
  flavor: 'NATURAL' | 'WITTY' | 'DRY' | 'BOLD' | 'CHAOTIC' | 'CRINGE';
  note: string;
}
export interface CompanionPreferences {
  avatarSize: 56 | 76 | 104;
  personalityEnabled: boolean;
  automaticResponseMode: AutomaticResponseMode;
  replyVoiceProfile: ReplyVoiceProfile;
}

export interface CompanionAwareness {
  gazeX: number;
  gazeY: number;
  idleMs: number;
}

export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export function getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
  if (!isTauriRuntime())
    return Promise.resolve({
      permissions: { monitoringEnabled: false, platforms: { X: false, WEB: false } },
      connectedAdapters: [],
      currentContext: null,
      providerConfigured: false,
      suspended: false,
      privacyPaused: false,
      privacyReason: null,
      lastContextError: null,
    });
  return invoke('get_runtime_snapshot');
}

export function getCompanionPreferences(): Promise<CompanionPreferences> {
  if (!isTauriRuntime())
    return Promise.resolve({
      avatarSize: 76,
      personalityEnabled: true,
      automaticResponseMode: 'EXPLAIN_AND_REPLY',
      replyVoiceProfile: {
        warmth: 'BALANCED',
        directness: 'BALANCED',
        energy: 'NATURAL',
        humor: 'LIGHT',
        flavor: 'NATURAL',
        note: '',
      },
    });
  return invoke('get_companion_preferences');
}

export function saveAvatarSize(value: number): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke('set_avatar_size', { value });
}

export function savePersonalityEnabled(value: boolean): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke('set_personality_enabled', { value });
}

export function saveAutomaticResponseMode(value: AutomaticResponseMode): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke('set_automatic_response_mode', { value });
}

export function saveReplyVoiceProfile(value: ReplyVoiceProfile): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke('set_reply_voice_profile', { value });
}

export function getCompanionAwareness(): Promise<CompanionAwareness> {
  if (!isTauriRuntime()) return Promise.resolve({ gazeX: 0, gazeY: 0, idleMs: 0 });
  return invoke('get_companion_awareness');
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

export function suspendToTray(): Promise<RuntimeSnapshot> {
  return invoke('suspend_to_tray');
}

export function checkProvider(): Promise<ProviderHealth> {
  return invoke('provider_health');
}

export function checkWriting(): Promise<WritingAnalysis> {
  return invoke('check_writing');
}

export function requestAssistance(
  task: AssistanceTask,
  tone: string,
  variant: number,
): Promise<AssistanceResponse> {
  return invoke('run_assistance', { task, tone, variant });
}

export function resizeSpeechSurface(width: number, height: number): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  return invoke('resize_speech_surface', { width, height });
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
