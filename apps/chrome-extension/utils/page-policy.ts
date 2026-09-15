const PRIVATE_WEB_DOMAINS = [
  '1password.com',
  'accounts.google.com',
  'account.microsoft.com',
  'bitwarden.com',
  'lastpass.com',
  'login.live.com',
  'mail.google.com',
  'myaccount.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'passwords.google.com',
  'paypal.com',
  'photos.google.com',
] as const;

function matchesDomain(hostname: string, expected: string): boolean {
  return hostname === expected || hostname.endsWith(`.${expected}`);
}

export function isXHost(hostname: string): boolean {
  return matchesDomain(hostname.toLowerCase(), 'x.com');
}

export function isPrivateWebHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return PRIVATE_WEB_DOMAINS.some((domain) => matchesDomain(normalized, domain));
}

export function supportedPage(urlValue: string): URL | null {
  try {
    const url = new URL(urlValue);
    if (!['http:', 'https:'].includes(url.protocol) || isPrivateWebHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}
