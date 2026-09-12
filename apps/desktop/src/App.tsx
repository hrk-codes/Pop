import { useMachine } from '@xstate/react';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Bot,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  Gauge,
  Minus,
  MessageCircle,
  Monitor,
  MoreHorizontal,
  Palette,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { PopAvatar } from './features/companion/PopAvatar';
import { companionMachine, type ExpressionState } from './features/companion/machine';
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
  getRuntimeSnapshot,
  isTauriRuntime,
  onAssistanceChunk,
  onAssistanceComplete,
  onAssistanceStarted,
  onCloudActivity,
  onRuntimeUpdate,
  requestAssistance,
  saveAvatarSize,
  updateMonitoring,
  updatePlatformPermission,
  type AssistanceTask,
  type ContextKind,
  type RuntimeSnapshot,
} from './features/runtime/runtime-client';

type AvatarSize = 56 | 76 | 104;
type Direction = 'up' | 'down' | 'left' | 'right';
type ActionItem = { label: string; task?: AssistanceTask | 'CHECK_WRITING'; icon: ReactNode };
type ResultPayload = {
  requestId: string;
  output: string;
  task: string;
  provider: string;
  model: string;
};

function appListen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen<T>(event, (message) => handler(message.payload));
}

const EMPTY_RUNTIME: RuntimeSnapshot = {
  permissions: { monitoringEnabled: false, platforms: { X: false } },
  connectedAdapters: [],
  currentContext: null,
  providerConfigured: false,
};

function errorText(error: unknown): string {
  return typeof error === 'string'
    ? error.replaceAll('_', ' ').toLowerCase()
    : 'POP could not complete that request.';
}

function actionsFor(kind?: ContextKind): Record<Direction, ActionItem> {
  if (kind === 'DRAFT_TEXT') {
    return {
      up: { label: 'Grammar', task: 'CHECK_WRITING', icon: <Check size={14} /> },
      down: { label: 'Improve', task: 'IMPROVE_WRITING', icon: <Sparkles size={14} /> },
      right: { label: 'Shorten', task: 'SHORTEN', icon: <Minus size={14} /> },
      left: { label: 'More', icon: <MoreHorizontal size={14} /> },
    };
  }
  return {
    up: { label: 'Explain', task: 'EXPLAIN_TEXT', icon: <Bot size={14} /> },
    down: { label: 'Reply', task: 'DRAFT_REPLY', icon: <MessageCircle size={14} /> },
    right: { label: 'Summarize', task: 'SUMMARIZE', icon: <Gauge size={14} /> },
    left: { label: 'More', icon: <MoreHorizontal size={14} /> },
  };
}

function AvatarSurface() {
  const [runtime, setRuntime] = useState(EMPTY_RUNTIME);
  const [size, setSize] = useState<AvatarSize>(76);
  const [state, send] = useMachine(companionMachine);
  const [resultReady, setResultReady] = useState(false);
  const [lastTask, setLastTask] = useState<AssistanceTask | 'CHECK_WRITING' | null>(null);
  const actions = useMemo(
    () => actionsFor(runtime.currentContext?.observation.kind),
    [runtime.currentContext?.observation.kind],
  );
  const contextReady = Boolean(runtime.currentContext && runtime.permissions.monitoringEnabled);

  const runTask = useCallback(
    async (task: AssistanceTask | 'CHECK_WRITING') => {
      setLastTask(task);
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
          await requestAssistance(task, 'natural');
        }
      } catch (error) {
        send({ type: 'FAIL' });
        await emit('pop://assistance-failed', errorText(error));
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
      setRuntime(snapshot);
      setResultReady(false);
      void emit('pop://context-changed');
      send(snapshot.currentContext ? { type: 'CONTEXT_READY' } : { type: 'RESET' });
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
      if (lastTask) void runTask(lastTask);
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen<number>('pop://avatar-size', (value) => {
      if ([56, 76, 104].includes(value)) {
        setSize(value as AvatarSize);
        void saveAvatarSize(value);
      }
    }).then((cleanup) => cleanups.push(cleanup));
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [lastTask, runTask, send]);

  useEffect(() => {
    void resizeAvatarSurface(size, contextReady);
  }, [contextReady, size]);

  function activate(direction: Direction) {
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

  function onWheel(event: React.WheelEvent) {
    event.preventDefault();
    const sizes: AvatarSize[] = [56, 76, 104];
    const next = Math.max(0, Math.min(2, sizes.indexOf(size) + (event.deltaY < 0 ? 1 : -1)));
    setSize(sizes[next]!);
    void saveAvatarSize(sizes[next]!);
  }

  const expression: ExpressionState = runtime.permissions.monitoringEnabled
    ? state.context.expression
    : 'sleeping';
  return (
    <main
      className={`avatar-surface ${contextReady ? 'avatar-surface--ready' : ''}`}
      onKeyDown={(event) => {
        const direction = (
          { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const
        )[event.key as 'ArrowUp'];
        if (direction && contextReady) {
          event.preventDefault();
          activate(direction);
        }
      }}
      onWheel={onWheel}
      tabIndex={0}
    >
      {contextReady && (
        <div className="context-actions" aria-label="POP actions">
          {(Object.keys(actions) as Direction[]).map((direction) => {
            const action = actions[direction];
            const label =
              resultReady && direction === 'left'
                ? 'Previous'
                : resultReady && direction === 'right'
                  ? 'Next'
                  : action.label;
            return (
              <button
                className={`context-action context-action--${direction}`}
                key={direction}
                onClick={() => activate(direction)}
                type="button"
              >
                {direction === 'left' || direction === 'right' ? null : action.icon}
                {label}
              </button>
            );
          })}
        </div>
      )}
      <button
        className="avatar-button"
        onDoubleClick={() => void toggleMenu()}
        onPointerDown={(event) => {
          if (event.detail === 1) void startWindowDrag();
        }}
        style={{ width: size, height: size }}
        title="Drag POP. Double-click for settings. Scroll to resize."
        type="button"
      >
        <PopAvatar expression={expression} size={size} />
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
  const historyRef = useRef<ResultPayload[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const active = stream || history[index]?.output || '';

  const scheduleCollapse = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void hideCurrentSurface();
      void emit('pop://speech-collapsed');
    }, 10_000);
  }, []);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    void onAssistanceStarted((payload) => {
      setStream('');
      setError(null);
      setStreamMeta(payload);
      window.clearTimeout(timer.current);
      void showSurface('speech');
    }).then((cleanup) => cleanups.push(cleanup));
    void onAssistanceChunk((payload) => setStream((value) => value + payload.delta)).then(
      (cleanup) => cleanups.push(cleanup),
    );
    void onAssistanceComplete((payload) => {
      setHistory((items) => {
        const next = [...items, payload].slice(-5);
        setIndex(next.length - 1);
        return next;
      });
      setStream('');
      setStreamMeta(null);
      scheduleCollapse();
    }).then((cleanup) => cleanups.push(cleanup));
    void appListen<string>('pop://assistance-failed', (value) => {
      setError(value);
      setStream('');
      scheduleCollapse();
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
      scheduleCollapse();
    }).then((cleanup) => cleanups.push(cleanup));
    return () => {
      window.clearTimeout(timer.current);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [scheduleCollapse]);

  return (
    <main
      className="speech-surface"
      onMouseEnter={() => window.clearTimeout(timer.current)}
      onMouseLeave={scheduleCollapse}
    >
      <div className="speech-tail" />
      <article className="speech-bubble" aria-live="polite">
        <div className="speech-copy">
          {error ? <p className="speech-error">{error}</p> : <p>{active || 'Thinking...'}</p>}
          {streamMeta && (
            <span>
              {streamMeta.provider} · {streamMeta.model}
            </span>
          )}
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
  return (
    <main className="menu-surface">
      <header>
        <PopAvatar expression="idle" size={34} />
        <div>
          <strong>POP</strong>
          <span>Private X companion</span>
        </div>
        <button onClick={() => void hideCurrentSurface()} title="Close menu" type="button">
          <X size={17} />
        </button>
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
        <label className="menu-row">
          <MessageCircle size={18} />
          <span>
            <strong>X assistance</strong>
            <small>Selections and drafts only</small>
          </span>
          <input
            checked={runtime.permissions.platforms.X}
            onChange={(event) =>
              void updatePlatformPermission('X', event.target.checked).then(setRuntime)
            }
            type="checkbox"
          />
        </label>
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
        <span>
          {runtime.connectedAdapters.includes('CHROME')
            ? 'X adapter connected'
            : 'X adapter offline'}
        </span>
        <button onClick={() => void hideSurface('avatar')} title="Hide POP to tray" type="button">
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
