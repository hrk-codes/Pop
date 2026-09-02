const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:gsk|sk)-[a-z0-9_-]{16,}\b/i,
  /\bgh[oprsu]_[a-z0-9]{20,}\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:password|api[_ -]?key|secret|token)\s*[:=]\s*\S+/i,
];

export interface SensitiveDataResult {
  blocked: boolean;
  reason?: 'POTENTIAL_SECRET';
}

export function classifySensitiveText(text: string): SensitiveDataResult {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text))
    ? { blocked: true, reason: 'POTENTIAL_SECRET' }
    : { blocked: false };
}

export function redactForLog(text: string): string {
  return SECRET_PATTERNS.reduce((value, pattern) => value.replace(pattern, '[REDACTED]'), text);
}
