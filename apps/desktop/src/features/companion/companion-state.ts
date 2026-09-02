export type CompanionMode = 'tiny' | 'compact' | 'expanded';

export interface CompanionDimensions {
  width: number;
  height: number;
}

export const COMPANION_DIMENSIONS: Record<CompanionMode, CompanionDimensions> = {
  tiny: { width: 112, height: 112 },
  compact: { width: 324, height: 168 },
  expanded: { width: 438, height: 720 },
};

export function getNextExpandedMode(mode: CompanionMode): CompanionMode {
  return mode === 'expanded' ? 'compact' : 'expanded';
}
