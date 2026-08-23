import { useEffect, useState } from 'react';
import {
  AppWindow,
  ChevronRight,
  CircleOff,
  EyeOff,
  GripHorizontal,
  Maximize2,
  MessageCircleMore,
  Minimize2,
  Radio,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

import popMark from './assets/pop-mark-ui.png';
import { MonitoringSwitch } from './components/MonitoringSwitch';
import { getMonitoringCopy, getNextExpandedMode } from './features/companion/companion-state';
import { useCompanionStore } from './features/companion/store';
import { hideCompanion, resizeCompanion, startWindowDrag } from './features/companion/window';

type ExpandedTab = 'status' | 'privacy';

export function App() {
  const mode = useCompanionStore((state) => state.mode);
  const monitoring = useCompanionStore((state) => state.monitoring);
  const setMode = useCompanionStore((state) => state.setMode);
  const setMonitoring = useCompanionStore((state) => state.setMonitoring);
  const [activeTab, setActiveTab] = useState<ExpandedTab>('status');
  const monitoringCopy = getMonitoringCopy(monitoring);

  useEffect(() => {
    void resizeCompanion(mode);
  }, [mode]);

  if (mode === 'tiny') {
    return (
      <main className="tiny-companion" data-testid="tiny-companion">
        <button
          aria-label="Drag POP"
          className="tiny-companion__drag"
          onMouseDown={() => void startWindowDrag()}
          title="Drag POP"
          type="button"
        >
          <GripHorizontal aria-hidden="true" size={16} strokeWidth={2} />
        </button>
        <button
          aria-label="Open compact POP"
          className="tiny-companion__face"
          onClick={() => setMode('compact')}
          title="Open POP"
          type="button"
        >
          <img alt="" src={popMark} />
          <span
            aria-label={monitoring ? 'Monitoring on' : 'Monitoring off'}
            className={`presence-dot ${monitoring ? 'presence-dot--on' : ''}`}
          />
        </button>
      </main>
    );
  }

  return (
    <main className={`companion companion--${mode}`} data-testid="pop-companion">
      <header className="titlebar">
        <button
          aria-label="Drag POP"
          className="brand-drag"
          onMouseDown={() => void startWindowDrag()}
          title="Drag POP"
          type="button"
        >
          <img alt="" className="brand-mark" src={popMark} />
          <span className="brand-copy">
            <strong>POP</strong>
            <small>{monitoring ? 'Monitoring on' : 'Monitoring off'}</small>
          </span>
          <GripHorizontal aria-hidden="true" className="drag-grip" size={16} />
        </button>

        <div className="window-actions">
          <button
            aria-label={mode === 'expanded' ? 'Use compact mode' : 'Expand POP'}
            className="icon-button"
            onClick={() => setMode(getNextExpandedMode(mode))}
            title={mode === 'expanded' ? 'Compact' : 'Expand'}
            type="button"
          >
            {mode === 'expanded' ? (
              <Minimize2 aria-hidden="true" size={16} />
            ) : (
              <Maximize2 aria-hidden="true" size={16} />
            )}
          </button>
          <button
            aria-label="Hide POP"
            className="icon-button"
            onClick={() => void hideCompanion()}
            title="Hide to tray"
            type="button"
          >
            <X aria-hidden="true" size={17} />
          </button>
        </div>
      </header>

      {mode === 'compact' ? (
        <section className="compact-content" aria-live="polite">
          <div className={`status-orb ${monitoring ? 'status-orb--active' : ''}`}>
            {monitoring ? (
              <Radio aria-hidden="true" size={19} />
            ) : (
              <ShieldCheck aria-hidden="true" size={19} />
            )}
          </div>
          <div className="compact-copy">
            <strong>{monitoringCopy.title}</strong>
            <span>{monitoringCopy.detail}</span>
          </div>
          <MonitoringSwitch checked={monitoring} onChange={setMonitoring} />
          <button
            aria-label="Open POP details"
            className="details-button"
            onClick={() => setMode('expanded')}
            title="Open details"
            type="button"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </section>
      ) : (
        <section className="expanded-content">
          <div className="monitoring-row" aria-live="polite">
            <div
              className={`status-orb status-orb--large ${monitoring ? 'status-orb--active' : ''}`}
            >
              {monitoring ? (
                <Radio aria-hidden="true" size={21} />
              ) : (
                <ShieldCheck aria-hidden="true" size={21} />
              )}
            </div>
            <div>
              <span className="eyebrow">Monitoring</span>
              <strong>{monitoring ? 'On' : 'Off'}</strong>
            </div>
            <MonitoringSwitch checked={monitoring} onChange={setMonitoring} />
          </div>

          <div aria-label="Expanded view" className="segmented-control" role="tablist">
            <button
              aria-selected={activeTab === 'status'}
              className={activeTab === 'status' ? 'is-selected' : ''}
              onClick={() => setActiveTab('status')}
              role="tab"
              type="button"
            >
              Status
            </button>
            <button
              aria-selected={activeTab === 'privacy'}
              className={activeTab === 'privacy' ? 'is-selected' : ''}
              onClick={() => setActiveTab('privacy')}
              role="tab"
              type="button"
            >
              Privacy
            </button>
          </div>

          {activeTab === 'status' ? (
            <div className="tab-panel" role="tabpanel">
              <div className="context-heading">
                <div>
                  <span className="eyebrow">Current context</span>
                  <h1>{monitoringCopy.title}</h1>
                </div>
                <Sparkles aria-hidden="true" className="accent-icon" size={20} />
              </div>

              <dl className="status-list">
                <div>
                  <dt>
                    <AppWindow aria-hidden="true" size={17} />
                    Application
                  </dt>
                  <dd>None connected</dd>
                </div>
                <div>
                  <dt>
                    <MessageCircleMore aria-hidden="true" size={17} />
                    Suggestion
                  </dt>
                  <dd>Waiting for an approved source</dd>
                </div>
              </dl>

              <div className="empty-state">
                <CircleOff aria-hidden="true" size={22} />
                <div>
                  <strong>No context available</strong>
                  <span>VS Code and Chrome adapters are not connected yet.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="tab-panel" role="tabpanel">
              <div className="context-heading">
                <div>
                  <span className="eyebrow">What POP can see</span>
                  <h1>Nothing outside POP</h1>
                </div>
                <EyeOff aria-hidden="true" className="accent-icon" size={20} />
              </div>

              <div className="privacy-list">
                <div>
                  <span className="privacy-state privacy-state--allowed">Local</span>
                  <p>
                    <strong>Companion controls</strong>
                    <small>Mode and monitoring state for this session</small>
                  </p>
                </div>
                <div>
                  <span className="privacy-state">Blocked</span>
                  <p>
                    <strong>Application content</strong>
                    <small>No adapter or foreground access is active</small>
                  </p>
                </div>
                <div>
                  <span className="privacy-state">Blocked</span>
                  <p>
                    <strong>Screen, files, microphone</strong>
                    <small>Unavailable in this phase</small>
                  </p>
                </div>
              </div>
            </div>
          )}

          <footer className="expanded-footer">
            <span>Local shell</span>
            <button onClick={() => setMode('tiny')} type="button">
              Tiny mode
            </button>
          </footer>
        </section>
      )}
    </main>
  );
}
