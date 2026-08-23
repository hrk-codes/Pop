import { create } from 'zustand';

import type { CompanionMode } from './companion-state';

interface CompanionStore {
  mode: CompanionMode;
  monitoring: boolean;
  setMode: (mode: CompanionMode) => void;
  setMonitoring: (monitoring: boolean) => void;
}

export const useCompanionStore = create<CompanionStore>((set) => ({
  mode: 'compact',
  monitoring: false,
  setMode: (mode) => set({ mode }),
  setMonitoring: (monitoring) => set({ monitoring }),
}));
