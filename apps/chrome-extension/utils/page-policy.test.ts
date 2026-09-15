import { describe, expect, it } from 'vitest';

import { isPrivateWebHost, isXHost, supportedPage } from './page-policy';

describe('browser page policy', () => {
  it('recognizes X without trusting lookalike hosts', () => {
    expect(isXHost('x.com')).toBe(true);
    expect(isXHost('mobile.x.com')).toBe(true);
    expect(isXHost('x.com.example.org')).toBe(false);
  });

  it('blocks known private domains and unsupported schemes', () => {
    expect(isPrivateWebHost('mail.google.com')).toBe(true);
    expect(isPrivateWebHost('vault.bitwarden.com')).toBe(true);
    expect(supportedPage('chrome://settings')).toBeNull();
    expect(supportedPage('https://mail.google.com/mail/u/0')).toBeNull();
  });

  it('accepts ordinary documentation pages', () => {
    expect(supportedPage('https://www.ibm.com/docs/example')?.hostname).toBe('www.ibm.com');
  });
});
