import type { AdapterSource, ContextObservation, PlatformId } from '@pop/protocol';

export interface PermissionSettings {
  monitoringEnabled: boolean;
  allowedApplications: readonly string[];
  allowedPlatforms: readonly PlatformId[];
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
        | 'PLATFORM_DENIED'
        | 'DOMAIN_DENIED'
        | 'CONTEXT_KIND_DENIED'
        | 'SOURCE_MISMATCH';
    };

export const defaultPermissionSettings: PermissionSettings = {
  monitoringEnabled: false,
  allowedApplications: [],
  allowedPlatforms: [],
  allowedDomains: [],
  allowedContextKinds: [],
};

export function evaluateContextPermission(
  source: AdapterSource,
  observation: ContextObservation,
  settings: PermissionSettings,
): PermissionDecision {
  if (!settings.monitoringEnabled) return { decision: 'DENY', reason: 'MONITORING_DISABLED' };

  const sourceMatches =
    source === 'CHROME'
      ? observation.applicationId === 'chrome'
      : ['vscode', 'cursor'].includes(observation.applicationId);
  if (!sourceMatches) {
    return { decision: 'DENY', reason: 'SOURCE_MISMATCH' };
  }

  if (!settings.allowedApplications.includes(observation.applicationId)) {
    return { decision: 'DENY', reason: 'APPLICATION_DENIED' };
  }

  if (!settings.allowedPlatforms.includes(observation.platformId)) {
    return { decision: 'DENY', reason: 'PLATFORM_DENIED' };
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
