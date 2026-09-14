import { requestLoopback, type Control } from '../../utils/loopback';

const connectButton = document.querySelector<HTMLButtonElement>('#connect');
const showButton = document.querySelector<HTMLButtonElement>('#show');
const statusDot = document.querySelector<HTMLElement>('#status-dot');
const statusTitle = document.querySelector<HTMLElement>('#status-title');
const statusDetail = document.querySelector<HTMLElement>('#status-detail');

function setStatus(state: 'connecting' | 'connected' | 'offline', detail: string) {
  if (!statusDot || !statusTitle || !statusDetail || !connectButton || !showButton) return;
  statusDot.dataset.state = state;
  statusTitle.textContent =
    state === 'connected'
      ? 'Desktop connected'
      : state === 'offline'
        ? 'Desktop unavailable'
        : 'Connecting to desktop';
  statusDetail.textContent = detail;
  connectButton.hidden = state === 'connected';
  connectButton.disabled = state === 'connecting';
  showButton.disabled = state !== 'connected';
}

async function connect() {
  setStatus('connecting', 'Checking the private local bridge.');
  try {
    const message = await requestLoopback('/control');
    if (message.type !== 'CONTROL') throw new Error('INVALID_CONTROL');
    const control: Control = {
      monitoringEnabled: message.monitoringEnabled,
      xEnabled: message.xEnabled,
    };
    await chrome.runtime.sendMessage({ type: 'POP_LOOPBACK_GRANTED', control });
    setStatus(
      'connected',
      control.monitoringEnabled && control.xEnabled
        ? 'X assistance is ready.'
        : 'Connected. Enable monitoring and X in POP.',
    );
  } catch {
    setStatus('offline', 'Start POP, then try again.');
  }
}

connectButton?.addEventListener('click', () => void connect());
showButton?.addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'POP_SHOW' }).then(() => window.close());
});

void connect();
