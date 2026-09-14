import { useMachine } from '@xstate/react';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
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
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { PopAvatar } from './features/companion/PopAvatar';
import {
  actionsFor,
  automaticTaskFor,
  type CompanionTask,
  type Direction,
} from './features/companion/intent';
import { companionMachine, type ExpressionState } from './features/companion/machine';
import { speechDimensions } from './features/companion/speech';
import {
  hideCurrentSurface,
  resizeAvatarSurface,
  showSurface,
  startWindowDrag,
  toggleMenu,
} from './features/companion/window';
import {
  checkProvider,
  checkWriting,
  getCompanionPreferences,
  getRuntimeSnapshot,
  isTauriRuntime,
  onAssistanceChunk,
  onAssistanceComplete,
  onAssistanceStarted,
  onCloudActivity,
  onRuntimeUpdate,
  requestAssistance,
  resizeSpeechSurface,
  saveAvatarSize,
  suspendToTray,
  updateMonitoring,
  updatePlatformPermission,
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

function appListen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen<T>(event, (message) => handler(message.payload));
}

const EMPTY_RUNTIME: RuntimeSnapshot = {
  permissions: { monitoringEnabled: false, platforms: { X: false } },
  connectedAdapters: [],
  currentContext: null,
  providerConfigured: false,
  suspended: false,
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
  const [state, send] = useMachine(companionMachine);
  const [resultReady, setResultReady] = useState(false);
  const lastTask = useRef<CompanionTask | null>(null);
  const automaticTimer = useRef<number | undefined>(undefined);
  const automaticFingerprint = useRef('');
  const contextFingerprint = useRef('');
  const variantCounts = useRef<Partial<Record<CompanionTask, number>>>({});
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const activateRef = useRef<(direction: Direction) => void>(() => undefined);
  const clickTimer = useRef<number | undefined>(undefined);
  const actions = useMemo(
    () => actionsFor(runtime.currentContext?.observation.kind),
    [runtime.currentContext?.observation.kind],
  );
  const assistanceEnabled = Boolean(
    runtime.permissions.monitoringEnabled && runtime.permissions.platforms.X && !runtime.suspended,
  );

  const runTask = useCallback(
    async (task: CompanionTask) => {
      lastTask.current = task;
      setResultReady(false);
      send({ type: 'REQUEST' });
      await showSurface('speech');
      try {
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
        send({ type: 'FAIL' });
        const message = errorText(error);
        if (message) await emit('pop://assistance-failed', message);
      }
    },
    [send],
  );

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const cleanups: Array<() => void> = [];
    void getRuntimeSnapshot().then(setRuntime);
    void getCompanionPreferences().then((preferences) => setSize(preferences.avatarSize));
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
      const fingerprint = `${context.observation.kind}:${context.observation.text}`;
      if (fingerprint !== contextFingerprint.current) {
        contextFingerprint.current = fingerprint;
        variantCounts.current = {};
        void emit('pop://context-changed');
      }
      const task = automaticTaskFor(context.observation.kind);
      const enabled =
        snapshot.permissions.monitoringEnabled &&
        snapshot.permissions.platforms.X &&
        !snapshot.suspended;
      if (enabled && task && fingerprint !== automaticFingerprint.current) {
        automaticFingerprint.current = fingerprint;
        automaticTimer.current = window.setTimeout(() => void runTask(task), 180);
      }
    }).then((cleanup) => cleanups.push(cleanup));
    void onCloudActivity((active) => send({ type: active ? 'REQUEST' : 'STREAM_END' })).then(
      (cleanup) => cleanups.push(cleanup),
    );
    void onAssistanceChunk(() => send({ type: 'CHUNK' })).then((cleanup) => cleanups.push(cleanup));
    void onAssistanceComplete(() => {
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
      activateRef.current(direction);
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen<number>('pop://avatar-size', (value) => {
      if ([56, 76, 104].includes(value)) {
        setSize(value as AvatarSize);
        void saveAvatarSize(value);
      }
    }).then((cleanup) => cleanups.push(cleanup));
    return () => {
      window.clearTimeout(automaticTimer.current);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [runTask, send]);

  useEffect(() => {
    void resizeAvatarSurface(size);
  }, [size]);

  function activate(direction: Direction) {
    if (!assistanceEnabled) return;
    window.clearTimeout(automaticTimer.current);
    if (!runtime.currentContext) {
      void showSurface('speech');
      void emit(
        'pop://assistance-failed',
        runtime.connectedAdapters.includes('CHROME')
          ? 'Select text in an X post or type in an X draft, then try again.'
          : 'The X adapter is offline. Reload the POP extension and the X tab.',
      );
      return;
    }
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
    const action = actions[direction];
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

  const expression: ExpressionState =
    runtime.permissions.monitoringEnabled && !runtime.suspended
      ? state.context.expression
      : 'sleeping';
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
          <PopAvatar expression={expression} size={size} />
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
  const [history, setHistory] = useState<ResultPayload[]>([]);
  const [index, setIndex] = useState(0);
  const [stream, setStream] = useState('');
  const [streamMeta, setStreamMeta] = useState<Omit<ResultPayload, 'output'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<SpeechAnchor>({ side: 'right', tailY: 70 });
  const historyRef = useRef<ResultPayload[]>([]);
  const active = stream || history[index]?.output || '';
  const visibleText = error || active || 'Thinking...';
  const dimensions = speechDimensions(visibleText);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    void onAssistanceStarted((payload) => {
      setStream('');
      setError(null);
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
      setError(value);
      setStream('');
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen('pop://context-changed', () => {
      setHistory([]);
      historyRef.current = [];
      setIndex(0);
      setStream('');
      setError(null);
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
    void resizeSpeechSurface(dimensions.width, dimensions.height);
  }, [dimensions.height, dimensions.width]);

  const responseKey = streamMeta?.requestId ?? history[index]?.requestId ?? error ?? 'thinking';

  return (
    <main
      className={`speech-surface speech-surface--tail-${anchor.side}`}
      style={{ '--speech-tail-y': `${anchor.tailY}px` } as CSSProperties}
    >
      <div className="speech-tail" />
      <article className="speech-bubble" aria-live="polite" key={responseKey}>
        <div className="speech-copy">
          {error ? <p className="speech-error">{error}</p> : <p>{active || 'Thinking...'}</p>}
        </div>
        <footer>
          <button
            disabled={!active}
            onClick={() => active && navigator.clipboard.writeText(active)}
            title="Copy response"
            type="button"
          >
            <Copy size={16} />
          </button>
          <button
            onClick={() => void emit('pop://variant-requested')}
            title="New variant"
            type="button"
          >
            <RefreshCw size={16} />
          </button>
          <span>{history.length ? `${index + 1}/${history.length}` : ''}</span>
          <button
            onClick={() => {
              void hideCurrentSurface();
              void emit('pop://speech-collapsed');
            }}
            title="Collapse response"
            type="button"
          >
            <Minus size={16} />
          </button>
          <button onClick={() => void hideCurrentSurface()} title="Close response" type="button">
            <X size={16} />
          </button>
        </footer>
      </article>
    </main>
  );
}

function MenuSurface() {
  const [runtime, setRuntime] = useState(EMPTY_RUNTIME);
  const [section, setSection] = useState<string | null>(null);
  const [health, setHealth] = useState<'idle' | 'checking' | 'ready' | 'failed'>('idle');
  useEffect(() => {
    void getRuntimeSnapshot().then(setRuntime);
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
  const rows = [
    { id: 'ai', label: 'AI', icon: <Sparkles size={18} />, detail: 'Local + Groq' },
    {
      id: 'personality',
      label: 'Personality',
      icon: <Palette size={18} />,
      detail: 'Motion and greetings',
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
  const xStatus = runtime.suspended
    ? 'Paused in the system tray'
    : !runtime.permissions.monitoringEnabled
      ? 'Monitoring is off'
      : !runtime.permissions.platforms.X
        ? 'X access is off'
        : !adapterConnected
          ? 'Extension bridge offline'
          : runtime.currentContext
            ? `${runtime.currentContext.observation.kind.replaceAll('_', ' ').toLowerCase()} ready`
            : runtime.lastContextError
              ? runtime.lastContextError.replaceAll('_', ' ').toLowerCase()
              : 'Connected, waiting for X context';
  return (
    <main className="menu-surface">
      <header>
        <PopAvatar expression="idle" size={34} />
        <div>
          <strong>POP</strong>
          <span>Private X companion</span>
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
                ? 'Ready for approved context'
                : 'POP is resting'}
            </small>
          </span>
          <input
            checked={runtime.permissions.monitoringEnabled}
            onChange={(event) => void updateMonitoring(event.target.checked).then(setRuntime)}
            type="checkbox"
          />
        </label>
        <div className="menu-group x-assistance">
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
              ) : runtime.currentContext?.observation.kind === 'SOCIAL_POST' ? (
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
              ) : runtime.currentContext ? (
                <>
                  <button onClick={() => void triggerAvatarAction('up')} type="button">
                    Explain
                  </button>
                  <button onClick={() => void triggerAvatarAction('right')} type="button">
                    Summarize
                  </button>
                </>
              ) : (
                <span>Select a post or pause in an X draft to reveal actions.</span>
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
            {section === row.id && (
              <div className="submenu">
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
                  <span>
                    <Eye size={15} />
                    State-based expressions on
                  </span>
                )}
                {row.id === 'privacy' && (
                  <button
                    onClick={() => void updateMonitoring(false).then(setRuntime)}
                    type="button"
                  >
                    <EyeOff size={15} />
                    Stop and clear context
                  </button>
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
      <footer>
        <span>{adapterConnected ? 'X adapter connected' : 'X adapter offline'}</span>
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
