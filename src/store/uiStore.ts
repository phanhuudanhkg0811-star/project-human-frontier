import { create } from 'zustand';
import { playSfx } from '../audio/sfx.ts';
import type { ActiveModalType, CrewId, EquipmentId, SystemId, ToastMessage, UiState } from '../types/index.ts';

interface UiStoreActions {
  openModal: (modal: ActiveModalType) => void;
  closeModal: () => void;
  selectCrew: (crewId: CrewId | null) => void;
  selectSystem: (systemId: SystemId | null) => void;
  toggleRoverEquipment: (eqId: EquipmentId) => void;
  clearRoverEquipment: () => void;
  toggleDevPanel: () => void;
  setLocale: (locale: 'vi' | 'en') => void;
  pushToast: (tone: ToastMessage['tone'], text: string) => void;
  dismissToast: (id: string) => void;
}

const initialUiState: UiState = {
  activeModal: null,
  selectedCrewId: 'cmd',
  selectedSystemId: 'solar',
  selectedEquipmentIds: [],
  devPanelOpen: false,
  locale: 'vi',
  reducedMotion: false,
  toasts: [],
};

export const useUiStore = create<UiState & UiStoreActions>((set) => ({
  ...initialUiState,
  openModal: (modal) => {
    playSfx(modal === 'comms' ? 'radioOn' : 'open');
    set({ activeModal: modal });
  },
  closeModal: () => {
    playSfx('click', 0.4);
    set({ activeModal: null });
  },
  selectCrew: (crewId) => set({ selectedCrewId: crewId }),
  selectSystem: (systemId) => set({ selectedSystemId: systemId }),
  toggleRoverEquipment: (eqId) =>
    set((s) => {
      const exists = s.selectedEquipmentIds.includes(eqId);
      if (exists) {
        return { selectedEquipmentIds: s.selectedEquipmentIds.filter((id) => id !== eqId) };
      }
      if (s.selectedEquipmentIds.length >= 3) {
        return s;
      }
      return { selectedEquipmentIds: [...s.selectedEquipmentIds, eqId] };
    }),
  clearRoverEquipment: () => set({ selectedEquipmentIds: [] }),
  toggleDevPanel: () => set((s) => ({ devPanelOpen: !s.devPanelOpen })),
  setLocale: (locale) => set({ locale }),
  pushToast: (tone, text) =>
    set((s) => ({
      toasts: [...s.toasts.slice(-4), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tone, text }],
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
