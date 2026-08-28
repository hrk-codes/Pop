import { useEffect, useState } from 'react';
import {
  AppWindow,
  ChevronRight,
  CloudOff,
  Database,
  EyeOff,
  GripHorizontal,
  Maximize2,
  MessageCircleOff,
  Minimize2,
  MonitorCheck,
  PanelTopClose,
  ShieldCheck,
  X,
} from 'lucide-react';

import popMark from './assets/pop-mark-ui.png';
import { getNextExpandedMode } from './features/companion/companion-state';
import { useCompanionStore } from './features/companion/store';
import { hideCompanion, resizeCompanion, startWindowDrag } from './features/companion/window';

type ExpandedTab = 'overview' | 'privacy';

export function App() {
  const mode = useCompanionStore((state) => state.mode);
  const setMode = useCompanionStore((state) => state.setMode);
  const [activeTab, setActiveTab] = useState<ExpandedTab>('overview');

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
          <span aria-label="POP is running" className="presence-dot presence-dot--local" />
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
            <small>Desktop shell preview</small>
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
          <div className="status-orb status-orb--active">
            <MonitorCheck aria-hidden="true" size={19} />
          </div>
          <div className="compact-copy">
            <strong>Desktop shell is running</strong>
            <span>Context and AI are not connected.</span>
          </div>
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
          <div className="runtime-summary" aria-live="polite">
            <div className="status-orb status-orb--large status-orb--active">
              <MonitorCheck aria-hidden="true" size={21} />
            </div>
            <div>
              <span className="eyebrow">Current build</span>
              <strong>V0.1 desktop shell</strong>
              <small>Running locally</small>
            </div>
            <span className="status-badge status-badge--ready">Ready</span>
          </div>

          <div aria-label="Expanded view" className="segmented-control" role="tablist">
            <button
              aria-selected={activeTab === 'overview'}
              className={activeTab === 'overview' ? 'is-selected' : ''}
              onClick={() => setActiveTab('overview')}
              role="tab"
              type="button"
            >
              Overview
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

          {activeTab === 'overview' ? (
            <div className="tab-panel" role="tabpanel">
              <div className="context-heading">
                <div>
                  <span className="eyebrow">Build status</span>
                  <h1>What works right now</h1>
                </div>
                <PanelTopClose aria-hidden="true" className="accent-icon" size={20} />
              </div>

              <dl className="status-list">
                <div>
                  <dt>
                    <AppWindow aria-hidden="true" size={17} />
                    Window and tray
                  </dt>
                  <dd>
                    <span className="status-badge status-badge--ready">Working</span>
                  </dd>
                </div>
                <div>
                  <dt>
                    <MessageCircleOff aria-hidden="true" size={17} />
                    Context and AI
                  </dt>
                  <dd>
                    <span className="status-badge">Not built</span>
                  </dd>
                </div>
                <div>
                  <dt>
                    <ShieldCheck aria-hidden="true" size={17} />
                    Safe actions
                  </dt>
                  <dd>
                    <span className="status-badge">Design only</span>
                  </dd>
                </div>
                <div>
                  <dt>
                    <Database aria-hidden="true" size={17} />
                    Memory
                  </dt>
                  <dd>
                    <span className="status-badge">Design only</span>
                  </dd>
                </div>
              </dl>

              <div className="build-note">
                <strong>No assistant response is available yet.</strong>
                <span>POP cannot inspect apps or call Groq in this build.</span>
              </div>
            </div>
          ) : (
            <div className="tab-panel" role="tabpanel">
              <div className="context-heading">
                <div>
                  <span className="eyebrow">Privacy status</span>
                  <h1>Nothing leaves this device</h1>
                </div>
                <EyeOff aria-hidden="true" className="accent-icon" size={20} />
              </div>

              <dl className="status-list privacy-status-list">
                <div>
                  <dt>
                    <AppWindow aria-hidden="true" size={17} />
                    This POP window
                  </dt>
                  <dd>
                    <span className="status-badge status-badge--local">Local</span>
                  </dd>
                </div>
                <div>
                  <dt>
                    <EyeOff aria-hidden="true" size={17} />
                    Apps and browser
                  </dt>
                  <dd>No access</dd>
                </div>
                <div>
                  <dt>
                    <ShieldCheck aria-hidden="true" size={17} />
                    Screen, files, microphone
                  </dt>
                  <dd>No access</dd>
                </div>
                <div>
                  <dt>
                    <CloudOff aria-hidden="true" size={17} />
                    Cloud requests
                  </dt>
                  <dd>None</dd>
                </div>
              </dl>

              <div className="build-note build-note--privacy">
                <strong>Your Groq key is not used yet.</strong>
                <span>There is no provider or persistent memory runtime.</span>
              </div>
            </div>
          )}

          <footer className="expanded-footer">
            <span>v0.1 Phase 1</span>
            <button onClick={() => setMode('tiny')} type="button">
              Tiny mode
            </button>
          </footer>
        </section>
      )}
    </main>
  );
}
