import { describe, expect, it } from 'vitest';

import { assistanceErrorText } from './assistance-errors';

describe('assistanceErrorText', () => {
  it('distinguishes temporary rate limits from configuration and quota failures', () => {
    expect(assistanceErrorText('GROQ_RATE_LIMITED:8')).toContain('Wait 8 seconds');
    expect(assistanceErrorText('GROQ_RATE_LIMITED:125')).toContain('about 3 minutes');
    expect(assistanceErrorText('GROQ_AUTH_FAILED')).toContain('API key');
    expect(assistanceErrorText('GROQ_QUOTA_EXHAUSTED')).toContain('usage or billing');
    expect(assistanceErrorText('GROQ_INVALID_REQUEST')).toContain('request format');
    expect(assistanceErrorText('GROQ_UNAVAILABLE')).toContain('temporarily busy');
  });

  it('keeps unexpected status codes visible without exposing arbitrary error bodies', () => {
    expect(assistanceErrorText('GROQ_REQUEST_REJECTED:418')).toContain('error 418');
    expect(assistanceErrorText('GROQ_REQUEST_400')).toContain('error 400');
    expect(assistanceErrorText('server echoed private source text')).not.toContain(
      'private source',
    );
    expect(assistanceErrorText({ message: 'private source' })).not.toContain('private source');
    expect(assistanceErrorText('GROQ_RATE_LIMITED:NaN')).not.toContain('Wait');
  });

  it('silences cancelled work and preserves actionable selection errors', () => {
    expect(assistanceErrorText('REQUEST_CANCELLED')).toBe('');
    expect(assistanceErrorText('STALE_CONTEXT')).toContain('Select it again');
    expect(assistanceErrorText('TASK_CONTEXT_MISMATCH')).toContain('selection changed');
  });
});
