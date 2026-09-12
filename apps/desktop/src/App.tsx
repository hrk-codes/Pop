import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Clipboard,
  Cloud,
  Code2,
  Copy,
  Brain,
  Globe2,
  GripHorizontal,
  LoaderCircle,
  Maximize2,
  Minimize2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import popMark from './assets/pop-mark-ui.png';
import { getNextExpandedMode } from './features/companion/companion-state';
import { useCompanionStore } from './features/companion/store';
import { hideCompanion, resizeCompanion, startWindowDrag } from './features/companion/window';
import {
  checkProvider,
  checkWriting,
  forgetLearnedHabit,
  getLearnedHabits,
  getRuntimeSnapshot,
  isTauriRuntime,
  onCloudActivity,
  onRuntimeUpdate,
  refreshPairingCode,
  recordCopyPreference,
  requestAssistance,
  updateMonitoring,
  updatePlatformPermission,
  type AssistanceResponse,
  type ContextKind,
  type LearnedHabit,
  type PlatformId,
  type RuntimeSnapshot,
  type SuggestionOption,
  type WritingAnalysis,
} from './features/runtime/runtime-client';

type ExpandedTab = 'assist' | 'connect' | 'privacy' | 'memory';
type HealthState = 'idle' | 'checking' | 'ready' | 'failed';

const PLATFORMS: Array<{
  id: PlatformId;
  label: string;
  scope: string;
  adapter: 'browser' | 'editor';
}> = [
  { id: 'X', label: 'X', scope: 'Drafts and selected posts', adapter: 'browser' },
  {
    id: 'GOOGLE',
    label: 'Google',
    scope: 'Search queries and selected results',
    adapter: 'browser',
  },
  { id: 'YOUTUBE', label: 'YouTube', scope: 'Comments and selected text', adapter: 'browser' },
  {
    id: 'WHATSAPP',
    label: 'WhatsApp Web',
    scope: 'Drafts and selected messages',
    adapter: 'browser',
  },
  { id: 'CHATGPT', label: 'ChatGPT', scope: 'Drafts and selected responses', adapter: 'browser' },
  { id: 'CLAUDE', label: 'Claude', scope: 'Drafts and selected responses', adapter: 'browser' },
  { id: 'VSCODE', label: 'VS Code', scope: 'Stable code selections', adapter: 'editor' },
  { id: 'CURSOR', label: 'Cursor', scope: 'Stable code selections', adapter: 'editor' },
];

const EMPTY_PLATFORMS = Object.fromEntries(PLATFORMS.map(({ id }) => [id, false])) as Record<
  PlatformId,
  boolean
>;

const EMPTY_RUNTIME: RuntimeSnapshot = {
  pairingCode: '------',
  permissions: { monitoringEnabled: false, platforms: EMPTY_PLATFORMS },
  connectedAdapters: [],
  currentContext: null,
  suggestions: [],
  suggestion: null,
  providerConfigured: false,
};

function errorText(error: unknown): string {
  return typeof error === 'string'
    ? error.replaceAll('_', ' ')
    : 'POP could not complete that request.';
}

function contextLabel(kind?: ContextKind): string {
  const labels: Partial<Record<ContextKind, string>> = {
    DRAFT_TEXT: 'Writing draft',
    SOCIAL_POST: 'Selected post',
    SEARCH_QUERY: 'Search query',
    CONVERSATION: 'Conversation',
    ARTICLE_TEXT: 'Page selection',
    SELECTED_TEXT: 'Selected text',
    SELECTED_CODE: 'Selected code',
  };
  return kind ? (labels[kind] ?? 'Current context') : 'No context yet';
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function App() {
  const mode = useCompanionStore((state) => state.mode);
  const setMode = useCompanionStore((state) => state.setMode);
  const [activeTab, setActiveTab] = useState<ExpandedTab>('assist');
  const [runtime, setRuntime] = useState<RuntimeSnapshot>(EMPTY_RUNTIME);
  const [loading, setLoading] = useState(true);
  const [cloudActive, setCloudActive] = useState(false);
  const [health, setHealth] = useState<HealthState>('idle');
  const [tone, setTone] = useState('natural');
  const [response, setResponse] = useState<AssistanceResponse | null>(null);
  const [writing, setWriting] = useState<WritingAnalysis | null>(null);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [resultTask, setResultTask] = useState<string | null>(null);
  const [habits, setHabits] = useState<LearnedHabit[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contextPreview = useMemo(() => {
    const text = runtime.currentContext?.observation.text ?? '';
    return text.length > 360 ? `${text.slice(0, 360)}...` : text;
  }, [runtime.currentContext]);

  useEffect(() => {
    void resizeCompanion(mode);
  }, [mode]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      setLoading(false);
      setError('Open POP through the Tauri desktop runtime.');
      return;
    }

    let disposed = false;
    const cleanup: Array<() => void> = [];
    void getRuntimeSnapshot()
      .then((snapshot) => {
        if (!disposed) setRuntime(snapshot);
      })
      .catch((nextError: unknown) => {
        if (!disposed) setError(errorText(nextError));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    void getLearnedHabits().then((items) => {
      if (!disposed) setHabits(items);
    });
    void onRuntimeUpdate((snapshot) => {
      setRuntime(snapshot);
      setResponse(null);
      setWriting(null);
    }).then((unlisten) => cleanup.push(unlisten));
    void onCloudActivity(setCloudActive).then((unlisten) => cleanup.push(unlisten));
    return () => {
      disposed = true;
      cleanup.forEach((unlisten) => unlisten());
    };
  }, []);

  async function changeMonitoring(value: boolean): Promise<void> {
    setError(null);
    try {
      setRuntime(await updateMonitoring(value));
    } catch (nextError) {
      setError(errorText(nextError));
    }
  }

  async function changePlatform(platformId: PlatformId, value: boolean): Promise<void> {
    setError(null);
    try {
      setRuntime(await updatePlatformPermission(platformId, value));
    } catch (nextError) {
      setError(errorText(nextError));
    }
  }

  async function runTask(option: SuggestionOption): Promise<void> {
    setError(null);
    setResponse(null);
    setWriting(null);
    setActiveTask(option.task);
    try {
      if (option.task === 'CHECK_WRITING') {
        setWriting(await checkWriting());
      } else {
        setResponse(await requestAssistance(option.task, tone));
      }
      setResultTask(option.task);
    } catch (nextError) {
      setError(errorText(nextError));
    } finally {
      setActiveTask(null);
    }
  }

  async function copyOutput(output: string, index: number): Promise<void> {
    await navigator.clipboard.writeText(output);
    if (resultTask) {
      try {
        setHabits(await recordCopyPreference(resultTask, tone, output.length));
      } catch {
        // Copy remains useful even if optional preference learning is unavailable.
      }
    }
    setCopied(index);
    window.setTimeout(() => setCopied(null), 1_500);
  }

  async function verifyProvider(): Promise<void> {
    setHealth('checking');
    setError(null);
    try {
      const result = await checkProvider();
      setHealth(result.configured && result.reachable ? 'ready' : 'failed');
    } catch (nextError) {
      setHealth('failed');
      setError(errorText(nextError));
    }
  }

  if (mode === 'tiny') {
    return (
      <main className="tiny-companion" data-testid="tiny-companion">
        <button
          className="tiny-companion__drag"
          onMouseDown={() => void startWindowDrag()}
          title="Drag POP"
          type="button"
        >
          <GripHorizontal aria-hidden="true" size={16} />
        </button>
        <button
          className="tiny-companion__face"
          onClick={() => setMode('compact')}
          title="Open POP"
          type="button"
        >
          <img alt="" src={popMark} />
          <span className={`presence-dot ${runtime.currentContext ? 'presence-dot--local' : ''}`} />
        </button>
      </main>
    );
  }

  const connected = runtime.connectedAdapters.length > 0;
  const currentPlatform = runtime.currentContext?.observation.platformId;

  return (
    <main className={`companion companion--${mode}`} data-testid="pop-companion">
      <header className="titlebar">
        <button
          className="brand-drag"
          onMouseDown={() => void startWindowDrag()}
          title="Drag POP"
          type="button"
        >
          <img alt="" className="brand-mark" src={popMark} />
          <span className="brand-copy">
            <strong>POP</strong>
            <small>
              {currentPlatform ? `${currentPlatform} context` : 'Private desktop copilot'}
            </small>
          </span>
          <GripHorizontal aria-hidden="true" className="drag-grip" size={16} />
        </button>
        <div className="window-actions">
          <button
            className="icon-button"
            onClick={() => setMode(getNextExpandedMode(mode))}
            title={mode === 'expanded' ? 'Compact' : 'Expand'}
            type="button"
          >
            {mode === 'expanded' ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            className="icon-button"
            onClick={() => void hideCompanion()}
            title="Hide to tray"
            type="button"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      {mode === 'compact' ? (
        <section className="compact-content" aria-live="polite">
          <div className={`status-orb ${runtime.currentContext ? 'status-orb--active' : ''}`}>
            {runtime.currentContext ? <Sparkles size={19} /> : <ShieldCheck size={19} />}
          </div>
          <div className="compact-copy">
            <strong>{runtime.suggestion ?? `${greeting()}, POP is ready`}</strong>
            <span>
              {connected
                ? `${runtime.connectedAdapters.join(' + ')} connected`
                : 'Connect a source'}
            </span>
          </div>
          <button
            className="details-button"
            onClick={() => setMode('expanded')}
            title="Open details"
            type="button"
          >
            <ChevronRight size={18} />
          </button>
        </section>
      ) : (
        <section className="expanded-content">
          <div className="runtime-summary" aria-live="polite">
            <div
              className={`status-orb status-orb--large ${runtime.currentContext ? 'status-orb--active' : ''}`}
            >
              {cloudActive ? <LoaderCircle className="spin" size={21} /> : <Sparkles size={21} />}
            </div>
            <div>
              <span className="eyebrow">Live runtime</span>
              <strong>
                {loading
                  ? 'Starting POP Core'
                  : runtime.currentContext
                    ? 'Context ready'
                    : greeting()}
              </strong>
              <small>
                {connected
                  ? `${runtime.connectedAdapters.join(' + ')} connected`
                  : 'No adapter connected'}
              </small>
            </div>
            <span
              className={`status-badge ${runtime.permissions.monitoringEnabled ? 'status-badge--ready' : ''}`}
            >
              {runtime.permissions.monitoringEnabled ? 'On' : 'Off'}
            </span>
          </div>

          <div className="segmented-control segmented-control--four" role="tablist">
            {(['assist', 'connect', 'privacy', 'memory'] as const).map((tab) => (
              <button
                className={activeTab === tab ? 'is-selected' : ''}
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                type="button"
              >
                {tab === 'assist'
                  ? 'Assist'
                  : tab === 'connect'
                    ? 'Connect'
                    : tab === 'privacy'
                      ? 'Platforms'
                      : 'Memory'}
              </button>
            ))}
          </div>

          {activeTab === 'assist' && (
            <div className="tab-panel scroll-panel" role="tabpanel">
              <div className="context-heading">
                <div>
                  <span className="eyebrow">Current context</span>
                  <h1>{contextLabel(runtime.currentContext?.observation.kind)}</h1>
                </div>
                {runtime.currentContext?.source === 'VSCODE' ? (
                  <Code2 className="accent-icon" size={20} />
                ) : (
                  <Globe2 className="accent-icon" size={20} />
                )}
              </div>
              {runtime.currentContext ? (
                <div className="context-preview">
                  <p>{contextPreview}</p>
                  <span>Temporary context, expires automatically</span>
                </div>
              ) : (
                <div className="empty-state">
                  <ShieldCheck size={20} />
                  <strong>Nothing is being analyzed</strong>
                  <span>
                    Turn monitoring on, allow a platform, then select text or pause in a supported
                    field.
                  </span>
                </div>
              )}

              {runtime.suggestions.length > 0 && (
                <div className="assist-controls">
                  <label>
                    <span>Response tone</span>
                    <select value={tone} onChange={(event) => setTone(event.target.value)}>
                      <option value="natural">Natural</option>
                      <option value="concise">Concise</option>
                      <option value="friendly">Friendly</option>
                      <option value="professional">Professional</option>
                    </select>
                  </label>
                  <div className="suggestion-actions">
                    {runtime.suggestions.map((option) => (
                      <button
                        className={
                          option === runtime.suggestions[0] ? 'primary-button' : 'secondary-button'
                        }
                        disabled={
                          activeTask !== null || (!option.local && !runtime.providerConfigured)
                        }
                        key={option.task}
                        onClick={() => void runTask(option)}
                        title={option.reason}
                        type="button"
                      >
                        {activeTask === option.task ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <Sparkles size={16} />
                        )}
                        {option.label}
                        {option.local && <small>Local</small>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {writing && (
                <article className="result-item">
                  <span className="result-meta">
                    {writing.issues.length} issue{writing.issues.length === 1 ? '' : 's'} ·{' '}
                    {writing.engine} · {writing.elapsedMs} ms
                  </span>
                  <p>{writing.corrected}</p>
                  <button
                    onClick={() => void copyOutput(writing.corrected, 0)}
                    title="Copy correction"
                    type="button"
                  >
                    {copied === 0 ? <Check size={15} /> : <Copy size={15} />}
                    {copied === 0 ? 'Copied' : 'Copy'}
                  </button>
                </article>
              )}

              {response?.outputs.map((output, index) => (
                <article className="result-item" key={`${response.requestId}-${index}`}>
                  <span className="result-meta">
                    {response.provider} · {response.model}
                  </span>
                  <p>{output}</p>
                  <button
                    onClick={() => void copyOutput(output, index)}
                    title="Copy result"
                    type="button"
                  >
                    {copied === index ? <Check size={15} /> : <Copy size={15} />}
                    {copied === index ? 'Copied' : 'Copy'}
                  </button>
                </article>
              ))}
            </div>
          )}

          {activeTab === 'connect' && (
            <div className="tab-panel scroll-panel" role="tabpanel">
              <div className="context-heading">
                <div>
                  <span className="eyebrow">Local adapters</span>
                  <h1>Connect a source</h1>
                </div>
                <Clipboard className="accent-icon" size={20} />
              </div>
              <div className="pairing-code">
                <span>Pairing code</span>
                <strong>{runtime.pairingCode}</strong>
                <button
                  onClick={() => void refreshPairingCode()}
                  title="New pairing code"
                  type="button"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
              <dl className="status-list">
                <div>
                  <dt>
                    <Globe2 size={17} />
                    Chrome
                  </dt>
                  <dd>
                    <span
                      className={`status-badge ${runtime.connectedAdapters.includes('CHROME') ? 'status-badge--ready' : ''}`}
                    >
                      {runtime.connectedAdapters.includes('CHROME') ? 'Connected' : 'Offline'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>
                    <Code2 size={17} />
                    VS Code / Cursor
                  </dt>
                  <dd>
                    <span
                      className={`status-badge ${runtime.connectedAdapters.includes('VSCODE') ? 'status-badge--ready' : ''}`}
                    >
                      {runtime.connectedAdapters.includes('VSCODE') ? 'Connected' : 'Offline'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>
                    <Cloud size={17} />
                    Groq
                  </dt>
                  <dd>
                    <button
                      className="text-button"
                      onClick={() => void verifyProvider()}
                      type="button"
                    >
                      {health === 'checking'
                        ? 'Checking'
                        : health === 'ready'
                          ? 'Reachable'
                          : health === 'failed'
                            ? 'Unavailable'
                            : 'Test'}
                    </button>
                  </dd>
                </div>
              </dl>
              <div className="privacy-note">
                <ShieldCheck size={17} />
                <span>
                  Pairing is local. Codes expire after five minutes and are replaced after
                  successful use.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="tab-panel scroll-panel" role="tabpanel">
              <div className="context-heading">
                <div>
                  <span className="eyebrow">Permission center</span>
                  <h1>Choose where POP helps</h1>
                </div>
                <ShieldCheck className="accent-icon" size={20} />
              </div>
              <div className="permission-list">
                <label className="permission-master">
                  <span>
                    <strong>Monitoring</strong>
                    <small>Accept meaningful events from allowed platforms</small>
                  </span>
                  <input
                    checked={runtime.permissions.monitoringEnabled}
                    onChange={(event) => void changeMonitoring(event.target.checked)}
                    type="checkbox"
                  />
                </label>
                {PLATFORMS.map((platform) => (
                  <label key={platform.id}>
                    <span>
                      <strong>{platform.label}</strong>
                      <small>{platform.scope}</small>
                    </span>
                    <input
                      checked={runtime.permissions.platforms[platform.id] ?? false}
                      onChange={(event) => void changePlatform(platform.id, event.target.checked)}
                      type="checkbox"
                    />
                  </label>
                ))}
              </div>
              <div className="privacy-note">
                <ShieldCheck size={17} />
                <span>
                  POP never reads passwords, posts, clicks, types, sends, or executes actions.
                  Browser access must also be granted in the Chrome extension.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="tab-panel scroll-panel" role="tabpanel">
              <div className="context-heading">
                <div>
                  <span className="eyebrow">Local personalization</span>
                  <h1>What POP has learned</h1>
                </div>
                <Brain className="accent-icon" size={20} />
              </div>
              {habits.length === 0 ? (
                <div className="empty-state">
                  <Brain size={20} />
                  <strong>No learned habits yet</strong>
                  <span>
                    Copy a few results and POP will learn aggregate tone and length preferences.
                  </span>
                </div>
              ) : (
                <div className="habit-list">
                  {habits.map((habit) => (
                    <article key={habit.id}>
                      <span>
                        <strong>{habit.label}</strong>
                        <small>
                          {habit.evidenceCount} signal{habit.evidenceCount === 1 ? '' : 's'} ·{' '}
                          {Math.round(habit.confidence * 100)}% confidence
                        </small>
                      </span>
                      <button
                        onClick={() => void forgetLearnedHabit(habit.id).then(setHabits)}
                        title="Forget this habit"
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
              <div className="privacy-note">
                <ShieldCheck size={17} />
                <span>
                  Only task, tone, coarse length, and counts are stored. Drafts, messages, generated
                  answers, and code are never saved as memory.
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <footer className="expanded-footer">
            <span>Core protocol v2</span>
            <strong>{cloudActive ? 'Cloud active' : 'Local first'}</strong>
          </footer>
        </section>
      )}
    </main>
  );
}
