import type { AdapterStatus, PopupMessage } from './messages';
import { BROWSER_PLATFORMS } from './platforms';

const statusElement = document.querySelector<HTMLParagraphElement>('#status')!;
const versionElement = document.querySelector<HTMLElement>('#version')!;
const form = document.querySelector<HTMLFormElement>('#pair-form')!;
const input = document.querySelector<HTMLInputElement>('#pairing-code')!;
const platformSection = document.querySelector<HTMLElement>('#platform-section')!;
const platformList = document.querySelector<HTMLElement>('#platform-list')!;

versionElement.textContent = `v${chrome.runtime.getManifest().version}`;

function render(status: AdapterStatus): void {
  statusElement.textContent =
    status.state === 'CONNECTED'
      ? 'Connected to POP Core'
      : (status.detail ?? status.state.toLowerCase().replaceAll('_', ' '));
  form.hidden = status.state === 'CONNECTED';
  platformSection.hidden = status.state !== 'CONNECTED';
}

async function renderPlatforms(): Promise<void> {
  platformList.replaceChildren();
  for (const platform of BROWSER_PLATFORMS) {
    const label = document.createElement('label');
    const name = document.createElement('span');
    const toggle = document.createElement('input');
    name.textContent = platform.label;
    toggle.type = 'checkbox';
    toggle.checked = await chrome.permissions.contains({ origins: [platform.origin] });
    toggle.addEventListener('change', async () => {
      toggle.disabled = true;
      if (toggle.checked) {
        await chrome.permissions.request({ origins: [platform.origin] });
      } else {
        await chrome.permissions.remove({ origins: [platform.origin] });
      }
      const enabled = await chrome.permissions.contains({ origins: [platform.origin] });
      toggle.checked = enabled;
      toggle.disabled = false;
      const message: PopupMessage = {
        type: 'POP_PLATFORM_CHANGED',
        platformId: platform.id,
        enabled,
      };
      await chrome.runtime.sendMessage(message);
    });
    label.append(name, toggle);
    platformList.append(label);
  }
}

void chrome.runtime
  .sendMessage<PopupMessage, AdapterStatus>({ type: 'POP_STATUS' })
  .then((next) => {
    render(next);
    return renderPlatforms();
  });
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
