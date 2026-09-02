import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronRight,
  Clipboard,
  Cloud,
  Code2,
  Copy,
  Globe2,
  GripHorizontal,
  LoaderCircle,
  Maximize2,
  Minimize2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

import popMark from './assets/pop-mark-ui.png';
import { getNextExpandedMode } from './features/companion/companion-state';
import { useCompanionStore } from './features/companion/store';
import { hideCompanion, resizeCompanion, startWindowDrag } from './features/companion/window';
import {
  checkProvider,
  getRuntimeSnapshot,
  isTauriRuntime,
  onCloudActivity,
  onRuntimeUpdate,
  refreshPairingCode,
  requestAssistance,
  updatePermission,
  type AssistanceResponse,
  type AssistanceTask,
  type ContextKind,
  type RuntimeSnapshot,
} from './features/runtime/runtime-client';

type ExpandedTab = 'assist' | 'connect' | 'privacy';
type HealthState = 'idle' | 'checking' | 'ready' | 'failed';

const TASKS: Record<ContextKind, AssistanceTask> = {
  X_DRAFT: 'IMPROVE_WRITING',
  X_POST: 'DRAFT_X_REPLY',
  SELECTED_CODE: 'EXPLAIN_CODE',
  SELECTED_TEXT: 'EXPLAIN_TEXT',
};

const EMPTY_RUNTIME: RuntimeSnapshot = {
  pairingCode: '------',
  permissions: { monitoringEnabled: false, xAllowed: false, vscodeAllowed: false },
  connectedAdapters: [],
  currentContext: null,
  suggestion: null,
  providerConfigured: false,
};

function errorText(error: unknown): string {
  return typeof error === 'string'
    ? error.replaceAll('_', ' ')
    : 'POP could not complete that request.';
}

function contextLabel(kind?: ContextKind): string {
  if (kind === 'X_DRAFT') return 'X draft';
  if (kind === 'X_POST') return 'X post';
  if (kind === 'SELECTED_CODE') return 'Selected code';
  if (kind === 'SELECTED_TEXT') return 'Selected text';
  return 'No context';
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
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentTask = runtime.currentContext
    ? TASKS[runtime.currentContext.observation.kind]
    : null;
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
    void onRuntimeUpdate((snapshot) => setRuntime(snapshot)).then((unlisten) =>
      cleanup.push(unlisten),
    );
    void onCloudActivity(setCloudActive).then((unlisten) => cleanup.push(unlisten));
    return () => {
      disposed = true;
      cleanup.forEach((unlisten) => unlisten());
    };
  }, []);

  async function changePermission(
    key: 'monitoring_enabled' | 'x_allowed' | 'vscode_allowed',
    value: boolean,
  ): Promise<void> {
    setError(null);
    try {
      setRuntime(await updatePermission(key, value));
      setResponse(null);
    } catch (nextError) {
      setError(errorText(nextError));
    }
  }

  async function runTask(): Promise<void> {
    if (!currentTask) return;
    setError(null);
    setResponse(null);
    setCloudActive(true);
    try {
      setResponse(await requestAssistance(currentTask, tone));
    } catch (nextError) {
      setError(errorText(nextError));
    } finally {
      setCloudActive(false);
    }
  }

  async function copyOutput(output: string, index: number): Promise<void> {
    await navigator.clipboard.writeText(output);
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
              {runtime.currentContext
                ? contextLabel(runtime.currentContext.observation.kind)
                : 'Private desktop copilot'}
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
            <strong>
              {runtime.currentContext ? runtime.suggestion : 'Waiting for approved context'}
            </strong>
            <span>
              {connected
                ? `${runtime.connectedAdapters.join(' + ')} connected`
                : 'Pair Chrome or VS Code'}
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
                    : 'Waiting locally'}
              </strong>
              <small>{runtime.providerConfigured ? 'Groq configured' : 'Groq key missing'}</small>
            </div>
            <span
              className={`status-badge ${runtime.permissions.monitoringEnabled ? 'status-badge--ready' : ''}`}
            >
              {runtime.permissions.monitoringEnabled ? 'On' : 'Off'}
            </span>
          </div>

          <div className="segmented-control segmented-control--three" role="tablist">
            {(['assist', 'connect', 'privacy'] as const).map((tab) => (
              <button
                className={activeTab === tab ? 'is-selected' : ''}
                key={tab}
                onClick={() => setActiveTab(tab)}
                role="tab"
                type="button"
              >
                {tab === 'assist' ? 'Assist' : tab === 'connect' ? 'Connect' : 'Privacy'}
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
                  <span>Expires automatically in two minutes</span>
                </div>
              ) : (
                <div className="empty-state">
                  <ShieldCheck size={20} />
                  <strong>No approved context</strong>
                  <span>POP has not received a selection or X draft.</span>
                </div>
              )}
              <div className="assist-controls">
                <label>
                  <span>Tone</span>
                  <select value={tone} onChange={(event) => setTone(event.target.value)}>
                    <option value="natural">Natural</option>
                    <option value="concise">Concise</option>
                    <option value="friendly">Friendly</option>
                    <option value="professional">Professional</option>
                  </select>
                </label>
                <button
                  className="primary-button"
                  disabled={!currentTask || !runtime.providerConfigured || cloudActive}
                  onClick={() => void runTask()}
                  type="button"
                >
                  {cloudActive ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {runtime.suggestion ?? 'Select context first'}
                </button>
              </div>
              {response?.outputs.map((output, index) => (
                <article className="result-item" key={`${response.requestId}-${index}`}>
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
                    Chrome / x.com
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
                    VS Code
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
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="tab-panel scroll-panel" role="tabpanel">
              <div className="context-heading">
                <div>
                  <span className="eyebrow">Permission center</span>
                  <h1>Deny by default</h1>
                </div>
                <ShieldCheck className="accent-icon" size={20} />
              </div>
              <div className="permission-list">
                <label>
                  <span>
                    <strong>Monitoring</strong>
                    <small>Accept authorized adapter events</small>
                  </span>
                  <input
                    checked={runtime.permissions.monitoringEnabled}
                    onChange={(event) =>
                      void changePermission('monitoring_enabled', event.target.checked)
                    }
                    type="checkbox"
                  />
                </label>
                <label>
                  <span>
                    <strong>x.com</strong>
                    <small>Drafts and selected posts only</small>
                  </span>
                  <input
                    checked={runtime.permissions.xAllowed}
                    onChange={(event) => void changePermission('x_allowed', event.target.checked)}
                    type="checkbox"
                  />
                </label>
                <label>
                  <span>
                    <strong>VS Code</strong>
                    <small>Explicit selected code only</small>
                  </span>
                  <input
                    checked={runtime.permissions.vscodeAllowed}
                    onChange={(event) =>
                      void changePermission('vscode_allowed', event.target.checked)
                    }
                    type="checkbox"
                  />
                </label>
              </div>
              <div className="privacy-note">
                <ShieldCheck size={17} />
                <span>
                  POP previews and copies. It never posts to X, clicks buttons, or reuses approval.
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
            <span>Core protocol v1</span>
            <strong>{cloudActive ? 'Cloud active' : 'Local idle'}</strong>
          </footer>
        </section>
      )}
    </main>
  );
}
