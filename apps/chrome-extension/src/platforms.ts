import type { PlatformId } from '@pop/protocol';

export interface BrowserPlatform {
  id: Exclude<PlatformId, 'VSCODE' | 'CURSOR'>;
  label: string;
  origin: string;
  hostname: string;
}

export const BROWSER_PLATFORMS: readonly BrowserPlatform[] = [
  { id: 'X', label: 'X', origin: 'https://x.com/*', hostname: 'x.com' },
  { id: 'GOOGLE', label: 'Google', origin: 'https://www.google.com/*', hostname: 'www.google.com' },
  {
    id: 'YOUTUBE',
    label: 'YouTube',
    origin: 'https://www.youtube.com/*',
    hostname: 'www.youtube.com',
  },
  {
    id: 'WHATSAPP',
    label: 'WhatsApp Web',
    origin: 'https://web.whatsapp.com/*',
    hostname: 'web.whatsapp.com',
  },
  { id: 'CHATGPT', label: 'ChatGPT', origin: 'https://chatgpt.com/*', hostname: 'chatgpt.com' },
  { id: 'CLAUDE', label: 'Claude', origin: 'https://claude.ai/*', hostname: 'claude.ai' },
] as const;

export function platformForHostname(hostname: string): BrowserPlatform | undefined {
  return BROWSER_PLATFORMS.find((platform) => platform.hostname === hostname.toLowerCase());
}
