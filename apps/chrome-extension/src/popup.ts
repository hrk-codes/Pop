import type { AdapterStatus, PopupMessage } from './messages';

const statusElement = document.querySelector<HTMLParagraphElement>('#status')!;
const form = document.querySelector<HTMLFormElement>('#pair-form')!;
const input = document.querySelector<HTMLInputElement>('#pairing-code')!;

function render(status: AdapterStatus): void {
  statusElement.textContent =
    status.state === 'CONNECTED'
      ? 'Connected to POP Core'
      : (status.detail ?? status.state.toLowerCase().replaceAll('_', ' '));
  form.hidden = status.state === 'CONNECTED';
}

void chrome.runtime.sendMessage<PopupMessage, AdapterStatus>({ type: 'POP_STATUS' }).then(render);
chrome.runtime.onMessage.addListener((message: { type?: string; status?: AdapterStatus }) => {
  if (message.type === 'POP_STATUS_CHANGED' && message.status) render(message.status);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const pairingCode = input.value.trim();
  if (!/^\d{6}$/.test(pairingCode)) return;
  void chrome.runtime.sendMessage<PopupMessage>({ type: 'POP_PAIR', pairingCode });
  render({ state: 'CONNECTING' });
});
