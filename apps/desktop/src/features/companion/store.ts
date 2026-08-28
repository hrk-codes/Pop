import { create } from 'zustand';

import type { CompanionMode } from './companion-state';

interface CompanionStore {
  mode: CompanionMode;
  setMode: (mode: CompanionMode) => void;
}

export const useCompanionStore = create<CompanionStore>((set) => ({
  mode: 'expanded',
  setMode: (mode) => set({ mode }),
}));
