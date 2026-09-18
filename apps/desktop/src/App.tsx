import { useMachine } from '@xstate/react';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  Minus,
  MessageCircle,
  Monitor,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
} from 'react';

import { PopAvatar, type WorkExpressionStyle } from './features/companion/PopAvatar';
import {
  actionsFor,
  automaticTaskFor,
  type CompanionTask,
  type Direction,
} from './features/companion/intent';
import { companionMachine, type ExpressionState } from './features/companion/machine';
import {
  GOODBYE_MOMENT,
  WELCOME_MOMENT,
  canRunIdleBehavior,
  nextAmbientDelayMs,
  nextCompanionMoment,
  nextIdleGesture,
  nextIdleGestureDelayMs,
  nextIdleMood,
  responseLifetimeMs,
  type CompanionMoment,
  type CompanionMood,
  type IdleGesture,
  type IdleMood,
} from './features/companion/personality';
import {
  SPEECH_CONTENT_INSET,
  preferredSpeechWidth,
  replacementLayoutText,
  responseDragPreview,
  speechDimensions,
} from './features/companion/speech';
import {
  DEFAULT_REPLY_VOICE_PROFILE,
  VOICE_DIMENSIONS,
  replyVoiceSummary,
} from './features/companion/tone';
import {
  hideCurrentSurface,
  hideSurface,
  resizeAvatarSurface,
  showSurface,
  startWindowDrag,
  toggleMenu,
} from './features/companion/window';
import {
  checkProvider,
  checkWriting,
  getCompanionPreferences,
  getCompanionAwareness,
  getRuntimeSnapshot,
  isTauriRuntime,
  onAssistanceChunk,
  onAssistanceComplete,
  onAssistanceStarted,
  onCloudActivity,
  onRuntimeUpdate,
  requestAssistance,
  resizeSpeechSurface,
  saveAutomaticResponseMode,
  saveAvatarSize,
  savePersonalityEnabled,
  saveReplyVoiceProfile,
  suspendToTray,
  updateMonitoring,
  updatePlatformPermission,
  type AutomaticResponseMode,
  type ReplyVoiceProfile,
  type RuntimeSnapshot,
} from './features/runtime/runtime-client';

type AvatarSize = 56 | 76 | 104;
type ResultPayload = {
  requestId: string;
  output: string;
  task: string;
  provider: string;
  model: string;
};
type SpeechAnchor = { side: 'left' | 'right'; tailY: number };

const EXPRESSION_PREVIEWS: readonly ExpressionState[] = [
  'sleeping',
  'idle',
  'attentive',
  'thinking',
  'speaking',
  'success',
  'playful',
  'mischievous',
  'excited',
  'dramatic',
  'impatient',
  'silly',
  'curious',
  'encouraging',
  'uncertain',
  'blocked',
  'privacy',
];
const GESTURE_PREVIEWS: readonly IdleGesture[] = ['bounce', 'peek', 'squint', 'tilt'];

function previewValue<T extends string>(key: string, allowed: readonly T[]): T | null {
  if (isTauriRuntime()) return null;
  const value = new URLSearchParams(location.search).get(key);
  return allowed.includes(value as T) ? (value as T) : null;
}

function appListen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen<T>(event, (message) => handler(message.payload));
}

const EMPTY_RUNTIME: RuntimeSnapshot = {
  permissions: { monitoringEnabled: false, platforms: { X: false, WEB: false } },
  connectedAdapters: [],
  currentContext: null,
  providerConfigured: false,
  suspended: false,
  privacyPaused: false,
  privacyReason: null,
  lastContextError: null,
};

function errorText(error: unknown): string {
  if (typeof error !== 'string') return "I couldn't finish that thought. Try the same arrow again.";
  const friendly: Record<string, string> = {
    GROQ_RESPONSE_EMPTY: 'I lost that thought before I could say it. Try the same arrow again.',
    GROQ_REQUEST_FAILED:
      "I couldn't reach the writing service. I'll be ready when the connection is back.",
    GROQ_STREAM_INVALID: 'The response was interrupted. Try the same arrow once more.',
    GROQ_STREAM_CHUNK_INVALID: 'The response was interrupted. Try the same arrow once more.',
    REQUEST_CANCELLED: '',
    STALE_CONTEXT: 'That selection expired. Select it again and I will pick it up.',
    TASK_CONTEXT_MISMATCH: 'That selection changed. Select the text again, then use the arrow.',
  };
  if (friendly[error] !== undefined) return friendly[error];
  if (error.startsWith('GROQ_REQUEST_')) {
    return "The writing service didn't accept that request. Try again in a moment.";
  }
  return "I couldn't finish that thought. Try the same arrow again.";
}

function AvatarSurface() {
  const [runtime, setRuntime] = useState(EMPTY_RUNTIME);
  const [size, setSize] = useState<AvatarSize>(76);
  const [personalityEnabled, setPersonalityEnabled] = useState(true);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [ambientMood, setAmbientMood] = useState<CompanionMood | null>(null);
  const [idleMood, setIdleMood] = useState<IdleMood | null>(null);
  const [idleGesture, setIdleGesture] = useState<IdleGesture | null>(null);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [state, send] = useMachine(companionMachine);
  const [workActive, setWorkActive] = useState(false);
  const [workStyle, setWorkStyle] = useState<WorkExpressionStyle>('thoughtful');
  const [resultReady, setResultReady] = useState(false);
  const lastTask = useRef<CompanionTask | null>(null);
  const automaticTimer = useRef<number | undefined>(undefined);
  const automaticFingerprint = useRef('');
  const contextFingerprint = useRef('');
  const variantCounts = useRef<Partial<Record<CompanionTask, number>>>({});
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const activateRef = useRef<(direction: Direction, snapshot?: RuntimeSnapshot) => void>(
    () => undefined,
  );
  const clickTimer = useRef<number | undefined>(undefined);
  const chatterTimer = useRef<number | undefined>(undefined);
  const moodTimer = useRef<number | undefined>(undefined);
  const gestureTimer = useRef<number | undefined>(undefined);
  const gestureClearTimer = useRef<number | undefined>(undefined);
  const runtimeRef = useRef(runtime);
  const personalityEnabledRef = useRef(personalityEnabled);
  const automaticResponseModeRef = useRef<AutomaticResponseMode>('EXPLAIN_AND_REPLY');
  const previousMonitoring = useRef<boolean | null>(null);
  const lastMomentId = useRef<string | null>(null);
  const lastIdleGesture = useRef<IdleGesture | null>(null);
  const lastIdleMood = useRef<IdleMood | null>(null);
  const lastWorkAt = useRef(Date.now());
  const idleBehaviorEnabled = canRunIdleBehavior({
    personalityEnabled,
    monitoringEnabled: runtime.permissions.monitoringEnabled,
    suspended: runtime.suspended,
    privacyPaused: runtime.privacyPaused,
    hasContext: Boolean(runtime.currentContext),
    workActive,
    expression: state.context.expression,
  });

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  useEffect(() => {
    personalityEnabledRef.current = personalityEnabled;
  }, [personalityEnabled]);

  const shareCompanionMoment = useCallback((moment: CompanionMoment) => {
    if (!personalityEnabledRef.current) return;
    lastMomentId.current = moment.id;
    setIdleMood(null);
    setAmbientMood(moment.mood);
    window.clearTimeout(moodTimer.current);
    moodTimer.current = window.setTimeout(() => setAmbientMood(null), moment.lifetimeMs);
    void emit('pop://companion-message', moment);
  }, []);

  const runTask = useCallback(
    async (task: CompanionTask) => {
      lastWorkAt.current = Date.now();
      setWorkActive(true);
      setWorkStyle(
        task === 'DRAFT_REPLY'
          ? 'friendly'
          : task === 'IMPROVE_WRITING' || task === 'CHECK_WRITING' || task === 'SHORTEN'
            ? 'focused'
            : 'thoughtful',
      );
      setIdleGesture(null);
      setIdleMood(null);
      setGaze({ x: 0, y: 0 });
      lastTask.current = task;
      setResultReady(false);
      send({ type: 'REQUEST' });
      try {
        await showSurface('speech');
        if (task === 'CHECK_WRITING') {
          const result = await checkWriting();
          await emit<ResultPayload>('pop://assistance-complete', {
            requestId: crypto.randomUUID(),
            output: result.corrected,
            task,
            provider: 'local',
            model: result.engine,
          });
        } else {
          const variant = variantCounts.current[task] ?? 0;
          variantCounts.current[task] = (variant + 1) % 21;
          await requestAssistance(task, 'natural', variant);
        }
      } catch (error) {
        if (error === 'REQUEST_CANCELLED') return;
        if (error === 'PRIVACY_GUARD_ACTIVE') {
          await hideSurface('speech');
          return;
        }
        send({ type: 'FAIL' });
        const message = errorText(error);
        if (message) await emit('pop://assistance-failed', message);
      } finally {
        setWorkActive(false);
      }
    },
    [send],
  );

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const cleanups: Array<() => void> = [];
    void getRuntimeSnapshot().then(setRuntime);
    void getCompanionPreferences().then((preferences) => {
      setSize(preferences.avatarSize);
      setPersonalityEnabled(preferences.personalityEnabled);
      automaticResponseModeRef.current = preferences.automaticResponseMode;
      setPreferencesReady(true);
    });
    void onRuntimeUpdate((snapshot) => {
      window.clearTimeout(automaticTimer.current);
      setRuntime(snapshot);
      setResultReady(false);
      send(snapshot.currentContext ? { type: 'CONTEXT_READY' } : { type: 'RESET' });
      const context = snapshot.currentContext;
      if (!context) {
        if (contextFingerprint.current) void emit('pop://context-changed');
        contextFingerprint.current = '';
        variantCounts.current = {};
        automaticFingerprint.current = '';
        return;
      }
      const fingerprint = `${context.observation.platformId}:${context.observation.domain ?? ''}:${context.observation.kind}:${context.observation.text}`;
      if (fingerprint !== contextFingerprint.current) {
        contextFingerprint.current = fingerprint;
        variantCounts.current = {};
        void emit('pop://context-changed');
      }
      const task = automaticTaskFor(context.observation.kind, automaticResponseModeRef.current);
      const enabled =
        snapshot.permissions.monitoringEnabled &&
        snapshot.currentContext !== null &&
        snapshot.permissions.platforms[snapshot.currentContext.observation.platformId] &&
        !snapshot.suspended &&
        !snapshot.privacyPaused;
      if (enabled && task && fingerprint !== automaticFingerprint.current) {
        automaticFingerprint.current = fingerprint;
        automaticTimer.current = window.setTimeout(() => void runTask(task), 180);
      }
    }).then((cleanup) => cleanups.push(cleanup));
    void onCloudActivity((active) => {
      setWorkActive(active);
      send({ type: active ? 'REQUEST' : 'STREAM_END' });
    }).then((cleanup) => cleanups.push(cleanup));
    void onAssistanceChunk(() => send({ type: 'CHUNK' })).then((cleanup) => cleanups.push(cleanup));
    void onAssistanceComplete(() => {
      setWorkActive(false);
      setResultReady(true);
      send({ type: 'SUCCESS' });
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen('pop://speech-collapsed', () => setResultReady(true)).then((cleanup) =>
      cleanups.push(cleanup),
    );
    void appListen('pop://variant-requested', () => {
      if (lastTask.current) void runTask(lastTask.current);
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen<Direction>('pop://avatar-action', (direction) => {
      void getRuntimeSnapshot().then((snapshot) => {
        setRuntime(snapshot);
        activateRef.current(direction, snapshot);
      });
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen<number>('pop://avatar-size', (value) => {
      if ([56, 76, 104].includes(value)) {
        setSize(value as AvatarSize);
        void saveAvatarSize(value);
      }
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen<boolean>('pop://personality-updated', (value) => {
      setPersonalityEnabled(value);
      if (!value) {
        setAmbientMood(null);
        setIdleMood(null);
      }
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen<AutomaticResponseMode>('pop://automatic-response-mode-updated', (value) => {
      automaticResponseModeRef.current = value;
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen('pop://companion-now', () => {
      shareCompanionMoment(nextCompanionMoment(lastMomentId.current));
    }).then((cleanup) => cleanups.push(cleanup));
    return () => {
      window.clearTimeout(automaticTimer.current);
      window.clearTimeout(moodTimer.current);
      window.clearTimeout(gestureTimer.current);
      window.clearTimeout(gestureClearTimer.current);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [runTask, send, shareCompanionMoment]);

  useEffect(() => {
    if (!preferencesReady) return;
    const monitoring = runtime.permissions.monitoringEnabled && !runtime.suspended;
    if (previousMonitoring.current === null) {
      previousMonitoring.current = monitoring;
      if (monitoring) shareCompanionMoment(WELCOME_MOMENT);
    } else if (monitoring !== previousMonitoring.current) {
      shareCompanionMoment(monitoring ? WELCOME_MOMENT : GOODBYE_MOMENT);
      previousMonitoring.current = monitoring;
    }
  }, [
    preferencesReady,
    runtime.permissions.monitoringEnabled,
    runtime.suspended,
    shareCompanionMoment,
  ]);

  useEffect(() => {
    if (!isTauriRuntime() || !personalityEnabled) return;
    let cancelled = false;
    const schedule = (delay: number) => {
      window.clearTimeout(chatterTimer.current);
      chatterTimer.current = window.setTimeout(async () => {
        const snapshot = runtimeRef.current;
        const eligible =
          snapshot.permissions.monitoringEnabled &&
          !snapshot.suspended &&
          !snapshot.privacyPaused &&
          !snapshot.currentContext &&
          Date.now() - lastWorkAt.current > 45_000;
        const awareness = eligible ? await getCompanionAwareness().catch(() => null) : null;
        if (cancelled) return;
        if (awareness && awareness.idleMs >= 10_000 && awareness.idleMs < 8 * 60_000) {
          shareCompanionMoment(nextCompanionMoment(lastMomentId.current));
          schedule(nextAmbientDelayMs());
        } else {
          schedule(30_000);
        }
      }, delay);
    };
    schedule(nextAmbientDelayMs());
    return () => {
      cancelled = true;
      window.clearTimeout(chatterTimer.current);
    };
  }, [personalityEnabled, shareCompanionMoment]);

  useEffect(() => {
    window.clearTimeout(gestureTimer.current);
    window.clearTimeout(gestureClearTimer.current);
    if (!idleBehaviorEnabled) {
      setIdleGesture(null);
      setIdleMood(null);
      return;
    }
    let cancelled = false;
    const schedule = (delay: number) => {
      gestureTimer.current = window.setTimeout(() => {
        if (cancelled) return;
        const gesture = nextIdleGesture(lastIdleGesture.current);
        const mood = nextIdleMood(lastIdleMood.current);
        lastIdleGesture.current = gesture;
        lastIdleMood.current = mood;
        setIdleGesture(gesture);
        setIdleMood(mood);
        gestureClearTimer.current = window.setTimeout(() => {
          setIdleGesture(null);
          setIdleMood(null);
        }, 1_850);
        schedule(nextIdleGestureDelayMs());
      }, delay);
    };
    schedule(2_500);
    return () => {
      cancelled = true;
      window.clearTimeout(gestureTimer.current);
      window.clearTimeout(gestureClearTimer.current);
    };
  }, [idleBehaviorEnabled]);

  useEffect(() => {
    if (!isTauriRuntime() || !idleBehaviorEnabled) {
      setGaze({ x: 0, y: 0 });
      return;
    }
    let polling = false;
    const updateGaze = async () => {
      if (polling) return;
      polling = true;
      try {
        const awareness = await getCompanionAwareness();
        setGaze({ x: awareness.gazeX, y: awareness.gazeY });
      } catch {
        setGaze({ x: 0, y: 0 });
      } finally {
        polling = false;
      }
    };
    void updateGaze();
    const timer = window.setInterval(() => void updateGaze(), 180);
    return () => window.clearInterval(timer);
  }, [idleBehaviorEnabled]);

  useEffect(() => {
    void resizeAvatarSurface(size);
  }, [size]);

  function activate(direction: Direction, snapshot: RuntimeSnapshot = runtime) {
    const enabled = Boolean(
      snapshot.permissions.monitoringEnabled && !snapshot.suspended && !snapshot.privacyPaused,
    );
    if (!enabled) return;
    window.clearTimeout(automaticTimer.current);
    if (!snapshot.currentContext) {
      void showSurface('speech');
      void emit(
        'pop://assistance-failed',
        snapshot.connectedAdapters.includes('CHROME')
          ? 'Select text on an approved Chrome page, then try again.'
          : 'The Chrome adapter is offline. Reload the POP extension and this tab.',
      );
      return;
    }
    if (!snapshot.permissions.platforms[snapshot.currentContext.observation.platformId]) return;
    if (resultReady && direction === 'left') {
      void emit('pop://navigate-result', 'previous');
      void showSurface('speech');
      return;
    }
    if (resultReady && direction === 'right') {
      void emit('pop://navigate-result', 'next');
      void showSurface('speech');
      return;
    }
    const action = actionsFor(snapshot.currentContext.observation.kind)[direction];
    if (action.task) void runTask(action.task);
    else void toggleMenu();
  }
  activateRef.current = activate;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const direction = (
        { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const
      )[event.key as 'ArrowUp'];
      if (!direction) return;
      event.preventDefault();
      activateRef.current(direction);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(clickTimer.current);
    };
  }, []);

  function onWheel(event: React.WheelEvent) {
    event.preventDefault();
    const sizes: AvatarSize[] = [56, 76, 104];
    const next = Math.max(0, Math.min(2, sizes.indexOf(size) + (event.deltaY < 0 ? 1 : -1)));
    setSize(sizes[next]!);
    void saveAvatarSize(sizes[next]!);
  }

  function beginPointerGesture(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    dragOrigin.current = { x: event.screenX, y: event.screenY };
  }

  function continuePointerGesture(event: React.PointerEvent<HTMLButtonElement>) {
    const origin = dragOrigin.current;
    if (!origin || dragging.current || (event.buttons & 1) === 0) return;
    if (Math.hypot(event.screenX - origin.x, event.screenY - origin.y) < 5) return;
    dragging.current = true;
    dragOrigin.current = null;
    void startWindowDrag().finally(() => {
      dragging.current = false;
    });
  }

  function endPointerGesture() {
    dragOrigin.current = null;
  }

  function directionFromClick(event: React.MouseEvent<HTMLButtonElement>): Direction {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    const deadZone = Math.min(bounds.width, bounds.height) * 0.18;
    if (Math.hypot(x, y) < deadZone) return 'down';
    if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'left' : 'right';
    return y < 0 ? 'up' : 'down';
  }

  function activateFromClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (event.detail !== 1 || dragging.current) return;
    const direction = directionFromClick(event);
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => activateRef.current(direction), 280);
  }

  function openMenuFromDoubleClick() {
    window.clearTimeout(clickTimer.current);
    void toggleMenu();
  }

  const activeMood = ambientMood ?? idleMood;
  const ambientExpression: ExpressionState | null =
    activeMood === 'sleepy' ? 'sleeping' : activeMood;
  const expression: ExpressionState = runtime.privacyPaused
    ? 'privacy'
    : runtime.permissions.monitoringEnabled && !runtime.suspended
      ? ambientExpression && ['idle', 'attentive'].includes(state.context.expression)
        ? ambientExpression
        : state.context.expression
      : 'sleeping';
  const previewExpression = previewValue('expression', EXPRESSION_PREVIEWS);
  const previewGesture = previewValue('gesture', GESTURE_PREVIEWS);
  return (
    <main className="avatar-surface" onWheel={onWheel} tabIndex={0}>
      <button
        aria-label="POP assistant"
        className="avatar-button"
        onClick={activateFromClick}
        onDoubleClick={openMenuFromDoubleClick}
        onPointerCancel={endPointerGesture}
        onPointerDown={beginPointerGesture}
        onPointerMove={continuePointerGesture}
        onPointerUp={endPointerGesture}
        style={{ width: size, height: size }}
        title="POP"
        type="button"
      >
        <span>
          <PopAvatar
            expression={previewExpression ?? expression}
            gaze={
              previewExpression
                ? { x: 0.85, y: -0.35 }
                : idleBehaviorEnabled
                  ? gaze
                  : { x: 0, y: 0 }
            }
            gesture={previewGesture ?? (ambientMood ? null : idleGesture)}
            size={size}
            workStyle={workStyle}
          />
        </span>
      </button>
      {resultReady && (
        <button
          aria-label="Open POP response"
          className="result-dot"
          onClick={() => void showSurface('speech')}
          type="button"
        />
      )}
    </main>
  );
}

function SpeechSurface() {
  const browserPreview = !isTauriRuntime();
  const previewParams = browserPreview ? new URLSearchParams(location.search) : null;
  const previewText = previewParams?.get('preview') ?? '';
  const previewCompanion = previewParams?.get('kind') === 'companion';
  const [history, setHistory] = useState<ResultPayload[]>([]);
  const [index, setIndex] = useState(0);
  const [stream, setStream] = useState('');
  const [streamMeta, setStreamMeta] = useState<Omit<ResultPayload, 'output'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<SpeechAnchor>({ side: 'right', tailY: 70 });
  const [measuredTextHeight, setMeasuredTextHeight] = useState(0);
  const [copied, setCopied] = useState(false);
  const [draggingResponse, setDraggingResponse] = useState(false);
  const [contextSequence, setContextSequence] = useState(0);
  const [companionMessage, setCompanionMessage] = useState<
    (CompanionMoment & { startedAt: number }) | null
  >(null);
  const historyRef = useRef<ResultPayload[]>([]);
  const measureRef = useRef<HTMLParagraphElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const dismissTimer = useRef<number | undefined>(undefined);
  const previousResponse = history[index]?.output ?? '';
  const active = stream || companionMessage?.text || previousResponse || previewText;
  const visibleText = error || active || 'Thinking...';
  const layoutText = streamMeta
    ? replacementLayoutText(previousResponse, visibleText)
    : visibleText;
  const preferredWidth = preferredSpeechWidth(layoutText);
  const dimensions = speechDimensions(layoutText, measuredTextHeight);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    void onAssistanceStarted((payload) => {
      setStream('');
      setError(null);
      setCopied(false);
      setCompanionMessage(null);
      setStreamMeta(payload);
      void showSurface('speech');
    }).then((cleanup) => cleanups.push(cleanup));
    void onAssistanceChunk((payload) => {
      setError(null);
      setStream((value) => value + payload.delta);
    }).then((cleanup) => cleanups.push(cleanup));
    void onAssistanceComplete((payload) => {
      setError(null);
      setHistory((items) => {
        const next = [...items, payload].slice(-5);
        setIndex(next.length - 1);
        return next;
      });
      setStream('');
      setStreamMeta(null);
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen<string>('pop://assistance-failed', (value) => {
      setCompanionMessage(null);
      setError(value);
      setStream('');
      setStreamMeta(null);
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen<CompanionMoment>('pop://companion-message', (value) => {
      setCompanionMessage({ ...value, startedAt: Date.now() });
      setError(null);
      setStream('');
      setStreamMeta(null);
      void showSurface('speech');
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen<boolean>('pop://personality-updated', (value) => {
      if (!value) {
        setCompanionMessage(null);
        void hideCurrentSurface();
      }
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen('pop://context-changed', () => {
      setHistory([]);
      historyRef.current = [];
      setIndex(0);
      setContextSequence((value) => value + 1);
      setStream('');
      setError(null);
      setCompanionMessage(null);
      void hideCurrentSurface();
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen<'previous' | 'next'>('pop://navigate-result', (direction) => {
      setIndex((current) => {
        if (direction === 'previous') return Math.max(0, current - 1);
        if (current < historyRef.current.length - 1) return current + 1;
        void emit('pop://variant-requested');
        return current;
      });
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen<SpeechAnchor>('pop://surface-anchor', setAnchor).then((cleanup) =>
      cleanups.push(cleanup),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      const direction = (
        { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const
      )[event.key as 'ArrowUp'];
      if (!direction) return;
      event.preventDefault();
      void emit('pop://avatar-action', direction);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useLayoutEffect(() => {
    const measured = Math.ceil(measureRef.current?.getBoundingClientRect().height ?? 0);
    if (measured > 0 && measured !== measuredTextHeight) setMeasuredTextHeight(measured);
  }, [layoutText, measuredTextHeight, preferredWidth]);

  useEffect(() => {
    void resizeSpeechSurface(dimensions.width, dimensions.height);
  }, [dimensions.height, dimensions.width]);

  useEffect(
    () => () => {
      window.clearTimeout(copyTimer.current);
      window.clearTimeout(dismissTimer.current);
    },
    [],
  );

  const isCompanion = Boolean(companionMessage) || previewCompanion;
  const speechKind = isCompanion ? 'companion' : error ? 'error' : 'task';
  const lifetimeMs = companionMessage?.lifetimeMs ?? responseLifetimeMs(visibleText, speechKind);
  const lifetimeKey =
    companionMessage?.startedAt ?? history[index]?.requestId ?? error ?? streamMeta?.requestId;

  const dismissSpeech = useCallback(() => {
    setCompanionMessage(null);
    void hideCurrentSurface();
  }, []);

  const restartDismissTimer = useCallback(() => {
    window.clearTimeout(dismissTimer.current);
    dismissTimer.current = window.setTimeout(dismissSpeech, lifetimeMs);
  }, [dismissSpeech, lifetimeMs]);

  useEffect(() => {
    if (browserPreview || streamMeta || (!active && !error)) return;
    restartDismissTimer();
    return () => window.clearTimeout(dismissTimer.current);
  }, [active, browserPreview, error, lifetimeKey, restartDismissTimer, streamMeta]);

  async function copyResponse() {
    if (!active) return;
    await navigator.clipboard.writeText(active);
    setCopied(true);
    restartDismissTimer();
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1_400);
  }

  function startResponseDrag(event: ReactDragEvent<HTMLDivElement>) {
    if (!active || error || isCompanion || streamMeta) {
      event.preventDefault();
      return;
    }

    const response = active.trim();
    if (!response) {
      event.preventDefault();
      return;
    }

    window.clearTimeout(dismissTimer.current);
    setDraggingResponse(true);
    event.dataTransfer.clearData();
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', response);

    const dragImage = document.createElement('div');
    dragImage.className = 'speech-drag-preview';
    dragImage.textContent = responseDragPreview(response);
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, 20, 18);
    window.setTimeout(() => dragImage.remove(), 0);
  }

  function finishResponseDrag() {
    setDraggingResponse(false);
    restartDismissTimer();
  }

  const activeTask = streamMeta?.task ?? history[index]?.task ?? '';
  const bubbleKind = isCompanion
    ? 'companion'
    : activeTask === 'DRAFT_REPLY'
      ? 'reply'
      : 'explanation';
  const responseIsDraggable = Boolean(active && !error && !isCompanion && !streamMeta);
  const isReplacingResponse = Boolean(streamMeta && stream && previousResponse);
  const bubbleKey = companionMessage?.startedAt ?? error ?? `task-${contextSequence}`;
  const responseTextKey = streamMeta?.requestId ?? history[index]?.requestId ?? 'thinking';

  return (
    <main
      className={`speech-surface speech-surface--tail-${anchor.side}${browserPreview ? ' speech-surface--preview' : ''}`}
      style={
        {
          '--speech-tail-y': `${anchor.tailY}px`,
          width: browserPreview ? `${dimensions.width}px` : undefined,
          height: browserPreview ? `${dimensions.height}px` : undefined,
        } as CSSProperties
      }
    >
      <p
        aria-hidden="true"
        className="speech-measurer"
        ref={measureRef}
        style={{ width: preferredWidth - SPEECH_CONTENT_INSET }}
      >
        {layoutText}
      </p>
      <div className="speech-tail" />
      <article
        className={`speech-bubble speech-bubble--${bubbleKind}${streamMeta ? ' speech-bubble--generating' : ''}`}
        aria-live="polite"
        key={bubbleKey}
      >
        <div
          className={`speech-copy${responseIsDraggable ? ' speech-copy--draggable' : ''}${draggingResponse ? ' speech-copy--dragging' : ''}`}
          draggable={responseIsDraggable}
          onDragEnd={finishResponseDrag}
          onDragStart={startResponseDrag}
          title={responseIsDraggable ? 'Drag response into a text field' : undefined}
        >
          {isReplacingResponse ? (
            <p aria-hidden="true" className="speech-response speech-response--outgoing">
              {previousResponse}
            </p>
          ) : null}
          {error ? (
            <p className="speech-error">{error}</p>
          ) : (
            <p
              className={`speech-response${stream ? ' speech-response--incoming' : ''}`}
              key={responseTextKey}
            >
              {active || 'Thinking...'}
            </p>
          )}
        </div>
        {isCompanion ? (
          <footer className="speech-actions speech-actions--companion">
            <span className="speech-companion-label">
              <Sparkles size={12} /> POP
            </span>
            <button
              aria-label="Close message"
              onClick={dismissSpeech}
              title="Close message"
              type="button"
            >
              <X size={14} />
            </button>
          </footer>
        ) : (
          <footer className="speech-actions">
            <div className="speech-action-group">
              <button
                aria-label="Copy response"
                className={copied ? 'speech-action--success' : undefined}
                disabled={!active}
                onClick={() => void copyResponse()}
                title={copied ? 'Copied' : 'Copy response'}
                type="button"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <button
                aria-label="Generate another response"
                onClick={() => {
                  restartDismissTimer();
                  void emit('pop://variant-requested');
                }}
                title="New variant"
                type="button"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <span className="speech-position">
              {history.length ? `${index + 1}/${history.length}` : ''}
            </span>
            <div className="speech-action-group">
              <button
                aria-label="Collapse response"
                onClick={() => {
                  void hideCurrentSurface();
                  void emit('pop://speech-collapsed');
                }}
                title="Collapse response"
                type="button"
              >
                <Minus size={14} />
              </button>
              <button
                aria-label="Close response"
                onClick={dismissSpeech}
                title="Close response"
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          </footer>
        )}
        <span
          aria-hidden="true"
          className="speech-lifetime"
          style={{ animationDuration: `${lifetimeMs}ms` }}
        />
      </article>
    </main>
  );
}

function MenuSurface() {
  const [runtime, setRuntime] = useState(EMPTY_RUNTIME);
  const [section, setSection] = useState<string | null>(null);
  const [health, setHealth] = useState<'idle' | 'checking' | 'ready' | 'failed'>('idle');
  const [personalityEnabled, setPersonalityEnabled] = useState(true);
  const [automaticResponseMode, setAutomaticResponseMode] =
    useState<AutomaticResponseMode>('EXPLAIN_AND_REPLY');
  const [replyVoiceProfile, setReplyVoiceProfile] = useState<ReplyVoiceProfile>(
    DEFAULT_REPLY_VOICE_PROFILE,
  );
  const [voiceDraft, setVoiceDraft] = useState<ReplyVoiceProfile>(DEFAULT_REPLY_VOICE_PROFILE);
  const [voiceSaveState, setVoiceSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  useEffect(() => {
    void getRuntimeSnapshot().then(setRuntime);
    void getCompanionPreferences().then((preferences) => {
      setPersonalityEnabled(preferences.personalityEnabled);
      setAutomaticResponseMode(preferences.automaticResponseMode);
      setReplyVoiceProfile(preferences.replyVoiceProfile);
      setVoiceDraft(preferences.replyVoiceProfile);
    });
    let cleanup: (() => void) | undefined;
    void onRuntimeUpdate(setRuntime).then((value) => (cleanup = value));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void hideCurrentSurface();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cleanup?.();
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  async function providerCheck() {
    setHealth('checking');
    try {
      const result = await checkProvider();
      setHealth(result.configured && result.reachable ? 'ready' : 'failed');
    } catch {
      setHealth('failed');
    }
  }
  async function triggerAvatarAction(direction: Direction) {
    await hideCurrentSurface();
    await emit('pop://avatar-action', direction);
  }
  async function updateAutomaticResponseOption(option: 'EXPLAIN' | 'REPLY', enabled: boolean) {
    const explainEnabled = automaticResponseMode !== 'REPLY';
    const replyEnabled = automaticResponseMode !== 'EXPLAIN';
    const nextExplain = option === 'EXPLAIN' ? enabled : explainEnabled;
    const nextReply = option === 'REPLY' ? enabled : replyEnabled;
    if (!nextExplain && !nextReply) return;
    const nextMode: AutomaticResponseMode = nextExplain
      ? nextReply
        ? 'EXPLAIN_AND_REPLY'
        : 'EXPLAIN'
      : 'REPLY';
    if (nextMode === automaticResponseMode) return;
    const previousMode = automaticResponseMode;
    setAutomaticResponseMode(nextMode);
    try {
      await saveAutomaticResponseMode(nextMode);
      if (isTauriRuntime()) await emit('pop://automatic-response-mode-updated', nextMode);
    } catch {
      setAutomaticResponseMode(previousMode);
    }
  }
  async function applyReplyVoiceProfile() {
    const normalized = {
      ...voiceDraft,
      note: voiceDraft.note.replace(/\s+/g, ' ').trim(),
    };
    setVoiceSaveState('saving');
    try {
      await saveReplyVoiceProfile(normalized);
      setVoiceDraft(normalized);
      setReplyVoiceProfile(normalized);
      setVoiceSaveState('saved');
    } catch {
      setVoiceSaveState('error');
    }
  }
  const automaticResponseDetail =
    automaticResponseMode === 'EXPLAIN'
      ? 'Explain automatically'
      : automaticResponseMode === 'REPLY'
        ? 'Reply automatically'
        : 'Explain first';
  const rows = [
    {
      id: 'automatic-response',
      label: 'Selection response',
      icon: <MessageCircle size={18} />,
      detail: automaticResponseDetail,
    },
    { id: 'ai', label: 'AI', icon: <Sparkles size={18} />, detail: 'Local + Groq' },
    {
      id: 'personality',
      label: 'Personality',
      icon: <Palette size={18} />,
      detail: personalityEnabled ? 'Playful moments on' : 'Quiet mode',
    },
    {
      id: 'tone',
      label: 'Tone',
      icon: <Sparkles size={18} />,
      detail: replyVoiceSummary(replyVoiceProfile),
    },
    {
      id: 'privacy',
      label: 'Privacy',
      icon: <ShieldCheck size={18} />,
      detail: 'No raw history saved',
    },
    { id: 'app', label: 'App', icon: <Settings size={18} />, detail: 'Size and window controls' },
  ];
  const adapterConnected = runtime.connectedAdapters.includes('CHROME');
  const xStatus = runtime.privacyPaused
    ? 'Privacy shield active'
    : runtime.suspended
      ? 'Paused in the system tray'
      : !runtime.permissions.monitoringEnabled
        ? 'Monitoring is off'
        : !runtime.permissions.platforms.X
          ? 'X access is off'
          : !adapterConnected
            ? 'Extension bridge offline'
            : runtime.currentContext?.observation.platformId === 'X'
              ? `${runtime.currentContext.observation.kind.replaceAll('_', ' ').toLowerCase()} ready`
              : runtime.lastContextError
                ? runtime.lastContextError.replaceAll('_', ' ').toLowerCase()
                : 'Connected, waiting for X context';
  const webStatus = runtime.privacyPaused
    ? 'Privacy shield active'
    : runtime.suspended
      ? 'Paused in the system tray'
      : !runtime.permissions.monitoringEnabled
        ? 'Monitoring is off'
        : !runtime.permissions.platforms.WEB
          ? 'Web reading is off'
          : !adapterConnected
            ? 'Extension bridge offline'
            : runtime.currentContext?.observation.platformId === 'WEB'
              ? `${runtime.currentContext.observation.kind.replaceAll('_', ' ').toLowerCase()} ready`
              : runtime.lastContextError
                ? runtime.lastContextError.replaceAll('_', ' ').toLowerCase()
                : 'Connected, waiting for a selection';
  return (
    <main className="menu-surface">
      <header>
        <PopAvatar expression="idle" size={34} />
        <div>
          <strong>POP</strong>
          <span>Private desktop companion</span>
        </div>
        <div className="window-actions">
          <button onClick={() => void suspendToTray()} title="Minimize POP to tray" type="button">
            <Minus size={17} />
          </button>
          <button onClick={() => void hideCurrentSurface()} title="Close menu" type="button">
            <X size={17} />
          </button>
        </div>
      </header>
      <div className="menu-list">
        <label className="menu-row">
          <Monitor size={18} />
          <span>
            <strong>Monitoring</strong>
            <small>
              {runtime.permissions.monitoringEnabled
                ? runtime.privacyPaused
                  ? 'Paused on a private surface'
                  : 'Ready for approved context'
                : 'POP is resting'}
            </small>
          </span>
          <input
            checked={runtime.permissions.monitoringEnabled}
            onChange={(event) => void updateMonitoring(event.target.checked).then(setRuntime)}
            type="checkbox"
          />
        </label>
        <div className="menu-group source-assistance">
          <div className="menu-row">
            <MessageCircle size={18} />
            <button
              className="menu-disclosure"
              onClick={() => setSection(section === 'x' ? null : 'x')}
              type="button"
            >
              <span>
                <strong>X assistance</strong>
                <small>{xStatus}</small>
              </span>
            </button>
            <input
              aria-label="Allow X assistance"
              checked={runtime.permissions.platforms.X}
              onChange={(event) =>
                void updatePlatformPermission('X', event.target.checked).then(setRuntime)
              }
              type="checkbox"
            />
            <button
              aria-label="Show X actions"
              className="menu-chevron"
              onClick={() => setSection(section === 'x' ? null : 'x')}
              type="button"
            >
              <ChevronRight className={section === 'x' ? 'rotate' : ''} size={17} />
            </button>
          </div>
          {section === 'x' && (
            <div className="submenu context-actions">
              {runtime.currentContext?.observation.kind === 'DRAFT_TEXT' ? (
                <>
                  <button onClick={() => void triggerAvatarAction('up')} type="button">
                    Check grammar
                  </button>
                  <button onClick={() => void triggerAvatarAction('down')} type="button">
                    Improve writing
                  </button>
                  <button onClick={() => void triggerAvatarAction('right')} type="button">
                    Shorten
                  </button>
                </>
              ) : runtime.currentContext?.observation.kind === 'SOCIAL_POST' ||
                runtime.currentContext?.observation.kind === 'CONVERSATION' ? (
                <>
                  <button onClick={() => void triggerAvatarAction('up')} type="button">
                    Explain
                  </button>
                  <button onClick={() => void triggerAvatarAction('down')} type="button">
                    Draft reply
                  </button>
                  <button onClick={() => void triggerAvatarAction('right')} type="button">
                    Summarize
                  </button>
                </>
              ) : runtime.currentContext?.observation.platformId === 'X' ? (
                <>
                  <button onClick={() => void triggerAvatarAction('up')} type="button">
                    Explain
                  </button>
                  <button onClick={() => void triggerAvatarAction('right')} type="button">
                    Summarize
                  </button>
                </>
              ) : (
                <span>Select text on X or another approved Chrome page to reveal actions.</span>
              )}
            </div>
          )}
        </div>
        <div className="menu-group source-assistance">
          <div className="menu-row">
            <BookOpen size={18} />
            <button
              className="menu-disclosure"
              onClick={() => setSection(section === 'web' ? null : 'web')}
              type="button"
            >
              <span>
                <strong>Chrome reading</strong>
                <small>{webStatus}</small>
              </span>
            </button>
            <input
              aria-label="Allow selected text from Chrome"
              checked={runtime.permissions.platforms.WEB}
              onChange={(event) =>
                void updatePlatformPermission('WEB', event.target.checked).then(setRuntime)
              }
              type="checkbox"
            />
            <button
              aria-label="Show Chrome reading actions"
              className="menu-chevron"
              onClick={() => setSection(section === 'web' ? null : 'web')}
              type="button"
            >
              <ChevronRight className={section === 'web' ? 'rotate' : ''} size={17} />
            </button>
          </div>
          {section === 'web' && (
            <div className="submenu context-actions">
              {runtime.currentContext?.observation.platformId === 'WEB' ? (
                <>
                  <button onClick={() => void triggerAvatarAction('up')} type="button">
                    Explain
                  </button>
                  <button onClick={() => void triggerAvatarAction('down')} type="button">
                    Respond
                  </button>
                  <button onClick={() => void triggerAvatarAction('right')} type="button">
                    Summarize
                  </button>
                </>
              ) : (
                <span>Select text on a normal Chrome page to reveal actions.</span>
              )}
            </div>
          )}
        </div>
        {rows.map((row) => (
          <div className="menu-group" key={row.id}>
            <button
              className="menu-row"
              onClick={() => setSection(section === row.id ? null : row.id)}
              type="button"
            >
              {row.icon}
              <span>
                <strong>{row.label}</strong>
                <small>{row.detail}</small>
              </span>
              <ChevronRight className={section === row.id ? 'rotate' : ''} size={17} />
            </button>
            {section === row.id && row.id !== 'tone' && (
              <div className="submenu">
                {row.id === 'automatic-response' && (
                  <div className="response-mode-options">
                    <label className="submenu-toggle">
                      <span>
                        <BookOpen size={15} />
                        Explain
                      </span>
                      <input
                        aria-label="Automatically explain selections"
                        checked={automaticResponseMode !== 'REPLY'}
                        onChange={(event) =>
                          void updateAutomaticResponseOption('EXPLAIN', event.target.checked)
                        }
                        type="checkbox"
                      />
                    </label>
                    <label className="submenu-toggle">
                      <span>
                        <MessageCircle size={15} />
                        Reply
                      </span>
                      <input
                        aria-label="Automatically draft replies"
                        checked={automaticResponseMode !== 'EXPLAIN'}
                        onChange={(event) =>
                          void updateAutomaticResponseOption('REPLY', event.target.checked)
                        }
                        type="checkbox"
                      />
                    </label>
                  </div>
                )}
                {row.id === 'ai' && (
                  <button onClick={() => void providerCheck()} type="button">
                    <Cloud size={15} />
                    {health === 'checking'
                      ? 'Checking...'
                      : health === 'ready'
                        ? 'Groq connected'
                        : health === 'failed'
                          ? 'Groq unavailable'
                          : 'Check Groq'}
                  </button>
                )}
                {row.id === 'personality' && (
                  <>
                    <label className="submenu-toggle">
                      <span>
                        <Eye size={15} />
                        Playful check-ins
                      </span>
                      <input
                        checked={personalityEnabled}
                        onChange={(event) => {
                          const value = event.target.checked;
                          setPersonalityEnabled(value);
                          void savePersonalityEnabled(value);
                          void emit('pop://personality-updated', value);
                        }}
                        type="checkbox"
                      />
                    </label>
                    {personalityEnabled && (
                      <button
                        onClick={async () => {
                          await hideCurrentSurface();
                          await emit('pop://companion-now');
                        }}
                        type="button"
                      >
                        <Sparkles size={15} />
                        Speak now
                      </button>
                    )}
                  </>
                )}
                {row.id === 'privacy' && (
                  <>
                    <span>
                      <ShieldCheck size={15} />
                      {runtime.privacyPaused ? 'Private surface blocked' : 'Privacy shield ready'}
                    </span>
                    <button
                      onClick={() => void updateMonitoring(false).then(setRuntime)}
                      type="button"
                    >
                      <EyeOff size={15} />
                      Stop and clear context
                    </button>
                  </>
                )}
                {row.id === 'app' && (
                  <div className="size-control">
                    {([56, 76, 104] as AvatarSize[]).map((value) => (
                      <button
                        key={value}
                        onClick={() => void emit('pop://avatar-size', value)}
                        type="button"
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {section === 'tone' && (
        <aside aria-label="Reply tone" className="tone-editor">
          <header>
            <button
              aria-label="Back to POP menu"
              onClick={() => {
                setVoiceDraft(replyVoiceProfile);
                setVoiceSaveState('idle');
                setSection(null);
              }}
              title="Back"
              type="button"
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              <strong>Tone</strong>
              <small>Reply in your voice</small>
            </span>
          </header>
          <div className="tone-editor-body">
            {VOICE_DIMENSIONS.map((dimension) => (
              <fieldset key={dimension.key}>
                <legend>{dimension.label}</legend>
                <div className="tone-segments">
                  {dimension.options.map(([value, label]) => (
                    <button
                      aria-pressed={voiceDraft[dimension.key] === value}
                      key={value}
                      onClick={() => {
                        setVoiceDraft(
                          (current) =>
                            ({ ...current, [dimension.key]: value }) as ReplyVoiceProfile,
                        );
                        setVoiceSaveState('idle');
                      }}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            ))}
            <label className="tone-note">
              <span>
                My wording
                <small>{voiceDraft.note.length}/180</small>
              </span>
              <textarea
                maxLength={180}
                onChange={(event) => {
                  setVoiceDraft((current) => ({ ...current, note: event.target.value }));
                  setVoiceSaveState('idle');
                }}
                placeholder="Simple words, say bro naturally, never sound corporate..."
                rows={3}
                value={voiceDraft.note}
              />
            </label>
          </div>
          <footer>
            <button
              aria-label="Reset tone"
              onClick={() => {
                setVoiceDraft(DEFAULT_REPLY_VOICE_PROFILE);
                setVoiceSaveState('idle');
              }}
              title="Reset tone"
              type="button"
            >
              <RotateCcw size={15} />
            </button>
            <span className={`tone-save-status tone-save-status--${voiceSaveState}`}>
              {voiceSaveState === 'saved'
                ? 'Saved'
                : voiceSaveState === 'error'
                  ? 'Could not save'
                  : ''}
            </span>
            <button
              className="tone-apply"
              disabled={voiceSaveState === 'saving'}
              onClick={() => void applyReplyVoiceProfile()}
              type="button"
            >
              <Check size={15} />
              {voiceSaveState === 'saving' ? 'Saving' : 'Apply'}
            </button>
          </footer>
        </aside>
      )}
      <footer>
        <span>{adapterConnected ? 'Chrome adapter connected' : 'Chrome adapter offline'}</span>
        <button onClick={() => void suspendToTray()} title="Minimize POP to tray" type="button">
          <Minus size={16} />
        </button>
      </footer>
    </main>
  );
}

export function App() {
  const label = isTauriRuntime()
    ? getCurrentWindow().label
    : (new URLSearchParams(location.search).get('surface') ?? 'avatar');
  if (label === 'speech') return <SpeechSurface />;
  if (label === 'menu') return <MenuSurface />;
  return <AvatarSurface />;
}
