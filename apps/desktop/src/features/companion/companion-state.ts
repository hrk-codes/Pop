export type CompanionMode = 'tiny' | 'compact' | 'expanded';

export interface CompanionDimensions {
  width: number;
  height: number;
}

export const COMPANION_DIMENSIONS: Record<CompanionMode, CompanionDimensions> = {
  tiny: { width: 112, height: 112 },
  compact: { width: 324, height: 168 },
  expanded: { width: 368, height: 528 },
};

export function getMonitoringCopy(monitoring: boolean) {
  return monitoring
    ? {
        title: 'Ready for approved context',
        detail: 'No integrations connected yet.',
      }
    : {
        title: 'Private by default',
        detail: 'Context collection is stopped.',
      };
}

export function getNextExpandedMode(mode: CompanionMode): CompanionMode {
  return mode === 'expanded' ? 'compact' : 'expanded';
}
