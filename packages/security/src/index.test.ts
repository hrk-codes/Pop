import { describe, expect, it } from 'vitest';

import { classifySensitiveText, redactForLog } from './index';

describe('sensitive text', () => {
  it('blocks likely API keys', () => {
    expect(classifySensitiveText('api_key=secret-value-123456789').blocked).toBe(true);
  });

  it('keeps ordinary writing available', () => {
    expect(classifySensitiveText('Please improve this project update.').blocked).toBe(false);
    expect(redactForLog('token: secret-value-123456789')).toContain('[REDACTED]');
  });
});
