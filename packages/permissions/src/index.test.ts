import { describe, expect, it } from 'vitest';

import { evaluateContextPermission } from './index';

const observation = {
  kind: 'DRAFT_TEXT' as const,
  platformId: 'X' as const,
  text: 'A draft',
  applicationId: 'chrome',
  domain: 'x.com',
  observedAt: 1,
};

describe('permission engine', () => {
  it('denies by default', () => {
    expect(
      evaluateContextPermission('CHROME', observation, {
        monitoringEnabled: false,
        allowedApplications: [],
        allowedPlatforms: [],
        allowedDomains: [],
        allowedContextKinds: [],
      }),
    ).toEqual({ decision: 'DENY', reason: 'MONITORING_DISABLED' });
  });

  it('allows only an explicitly configured source and domain', () => {
    expect(
      evaluateContextPermission('CHROME', observation, {
        monitoringEnabled: true,
        allowedApplications: ['chrome'],
        allowedPlatforms: ['X'],
        allowedDomains: ['x.com'],
        allowedContextKinds: ['DRAFT_TEXT'],
      }).decision,
    ).toBe('ALLOW');
  });
});
