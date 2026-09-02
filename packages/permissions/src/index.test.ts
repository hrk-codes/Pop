import { describe, expect, it } from 'vitest';

import { evaluateContextPermission } from './index';

const observation = {
  kind: 'X_DRAFT' as const,
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
        allowedDomains: ['x.com'],
        allowedContextKinds: ['X_DRAFT'],
      }).decision,
    ).toBe('ALLOW');
  });
});
