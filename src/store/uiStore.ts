import { create } from 'zustand';
import type { ActiveModalType, CrewId, EquipmentId, SystemId, ToastMessage, UiState } from '../types/index.ts';

export const UI_PREFS_STORAGE_KEY = 'phf_ui_prefs_v1';

interface PersistedUiPrefs {
  readonly locale: 'vi' | 'en';
  readonly reducedMotion: boolean;
  readonly audioMuted: boolean;
  readonly tutorialCompleted: boolean;
}

const DEFAULT_PERSISTED_PREFS: PersistedUiPrefs = {
  locale: 'vi',
  reducedMotion: false,
  audioMuted: false,
  tutorialCompleted: false,
};

function readPersistedUiPrefs(): PersistedUiPrefs {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return DEFAULT_PERSISTED_PREFS;
  }
  try {
    const raw = window.localStorage.getItem(UI_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PERSISTED_PREFS;
    const parsed = JSON.parse(raw) as Partial<PersistedUiPrefs> | null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PERSISTED_PREFS;
    return {
      locale: parsed.locale === 'en' ? 'en' : 'vi',
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : false,
      audioMuted: typeof parsed.audioMuted === 'boolean' ? parsed.audioMuted : false,
      tutorialCompleted: typeof parsed.tutorialCompleted === 'boolean' ? parsed.tutorialCompleted : false,
    };
  } catch {
    return DEFAULT_PERSISTED_PREFS;
  }
}

function writePersistedUiPrefs(state: Pick<UiState, 'locale' | 'reducedMotion' | 'audioMuted' | 'tutorialCompleted'>): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    const payload: PersistedUiPrefs = {
      locale: state.locale,
      reducedMotion: state.reducedMotion,
      audioMuted: state.audioMuted,
      tutorialCompleted: state.tutorialCompleted,
    };
    window.localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota / privacy mode errors cleanly.
  }
}

interface UiStoreActions {
  resetCampaignUi: () => void;
  openModal: (modal: ActiveModalType) => void;
  closeModal: () => void;
  selectCrew: (crewId: CrewId | null) => void;
  selectSystem: (systemId: SystemId | null) => void;
  toggleRoverEquipment: (eqId: EquipmentId) => void;
  clearRoverEquipment: () => void;
  toggleDevPanel: () => void;
  setLocale: (locale: 'vi' | 'en') => void;
  setReducedMotion: (reducedMotion: boolean) => void;
  toggleAudioMute: () => void;
  setAudioMuted: (audioMuted: boolean) => void;
  setTutorialStep: (step: number) => void;
  completeTutorial: () => void;
  resetTutorial: () => void;
  pushToast: (tone: ToastMessage['tone'], text: string) => void;
  dismissToast: (id: string) => void;
}

const persistedPrefs = readPersistedUiPrefs();

const initialUiState: UiState = {
  activeModal: null,
  selectedCrewId: 'cmd',
  selectedSystemId: 'solar',
  selectedEquipmentIds: [],
  devPanelOpen: false,
  locale: persistedPrefs.locale,
  reducedMotion: persistedPrefs.reducedMotion,
  audioMuted: persistedPrefs.audioMuted,
  tutorialCompleted: persistedPrefs.tutorialCompleted,
  tutorialStep: 0,
  toasts: [],
};

export const useUiStore = create<UiState & UiStoreActions>((set) => ({
  ...initialUiState,
  resetCampaignUi: () =>
    set({
      activeModal: null,
      selectedCrewId: 'cmd',
      selectedSystemId: 'solar',
      selectedEquipmentIds: [],
      tutorialStep: 0,
      toasts: [],
    }),
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
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
  setLocale: (locale) =>
    set((s) => {
      writePersistedUiPrefs({ ...s, locale });
      return { locale };
    }),
  setReducedMotion: (reducedMotion) =>
    set((s) => {
      writePersistedUiPrefs({ ...s, reducedMotion });
      return { reducedMotion };
    }),
  toggleAudioMute: () =>
    set((s) => {
      const audioMuted = !s.audioMuted;
      writePersistedUiPrefs({ ...s, audioMuted });
      return { audioMuted };
    }),
  setAudioMuted: (audioMuted) =>
    set((s) => {
      writePersistedUiPrefs({ ...s, audioMuted });
      return { audioMuted };
    }),
  setTutorialStep: (step) =>
    set({
      tutorialStep: Number.isFinite(step) ? Math.max(0, Math.floor(step)) : 0,
    }),
  completeTutorial: () =>
    set((s) => {
      writePersistedUiPrefs({ ...s, tutorialCompleted: true });
      return { tutorialCompleted: true, tutorialStep: 0, activeModal: null };
    }),
  resetTutorial: () =>
    set((s) => {
      writePersistedUiPrefs({ ...s, tutorialCompleted: false });
      return { tutorialCompleted: false, tutorialStep: 0 };
    }),
  pushToast: (tone, text) =>
    set((s) => ({
      toasts: [...s.toasts.slice(-4), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tone, text }],
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
