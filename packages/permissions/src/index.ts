import type { AdapterSource, ContextObservation } from '@pop/protocol';

export interface PermissionSettings {
  monitoringEnabled: boolean;
  allowedApplications: readonly string[];
  allowedDomains: readonly string[];
  allowedContextKinds: readonly ContextObservation['kind'][];
}

export type PermissionDecision =
  | { decision: 'ALLOW'; reason: 'EXPLICIT_POLICY' }
  | {
      decision: 'DENY';
      reason:
        | 'MONITORING_DISABLED'
        | 'APPLICATION_DENIED'
        | 'DOMAIN_DENIED'
        | 'CONTEXT_KIND_DENIED'
        | 'SOURCE_MISMATCH';
    };

export const defaultPermissionSettings: PermissionSettings = {
  monitoringEnabled: false,
  allowedApplications: [],
  allowedDomains: [],
  allowedContextKinds: [],
};

export function evaluateContextPermission(
  source: AdapterSource,
  observation: ContextObservation,
  settings: PermissionSettings,
): PermissionDecision {
  if (!settings.monitoringEnabled) return { decision: 'DENY', reason: 'MONITORING_DISABLED' };

  const expectedApplication = source === 'CHROME' ? 'chrome' : 'vscode';
  if (observation.applicationId !== expectedApplication) {
    return { decision: 'DENY', reason: 'SOURCE_MISMATCH' };
  }

  if (!settings.allowedApplications.includes(observation.applicationId)) {
    return { decision: 'DENY', reason: 'APPLICATION_DENIED' };
  }

  if (!settings.allowedContextKinds.includes(observation.kind)) {
    return { decision: 'DENY', reason: 'CONTEXT_KIND_DENIED' };
  }

  if (source === 'CHROME') {
    const normalizedDomain = observation.domain?.toLowerCase();
    if (!normalizedDomain || !settings.allowedDomains.includes(normalizedDomain)) {
      return { decision: 'DENY', reason: 'DOMAIN_DENIED' };
    }
  }

  return { decision: 'ALLOW', reason: 'EXPLICIT_POLICY' };
}
