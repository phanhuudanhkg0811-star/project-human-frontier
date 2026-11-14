import { create } from 'zustand';
import { onboardingDriver } from '../onboarding/driverAdapter.ts';
import {
  createDefaultOnboardingState,
  readOnboardingState,
  TOUR_VERSION,
  writeOnboardingState,
} from '../onboarding/persistence.ts';
import { MOON_SOL1_STEP_IDS } from '../onboarding/tours/moonSol1Tour.ts';
import type { IntroStatus, OnboardingState, TourId } from '../onboarding/types.ts';
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
  setIntroStatus: (status: IntroStatus) => void;
  startTour: (tourId?: TourId, stepId?: string | null) => void;
  setActiveStepId: (stepId: string | null) => void;
  skipTour: () => void;
  completeTour: () => void;
  replayOnboarding: () => void;
  resetOnboarding: () => void;
  setContextualHintsEnabled: (enabled: boolean) => void;
  dismissHint: (hintId: string) => void;
  recordHintShown: (hintId: string, sol: number) => void;
  dismissOnboardingNotice: () => void;
}

const persistedPrefs = readPersistedUiPrefs();
const initialOnboardingDecode = readOnboardingState(undefined, persistedPrefs.tutorialCompleted);

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
  onboarding: initialOnboardingDecode.state,
  onboardingNoticeCode: initialOnboardingDecode.noticeCode,
  toasts: [],
};

function commitOnboarding(next: OnboardingState): { onboarding: OnboardingState } {
  writeOnboardingState(next);
  return { onboarding: next };
}

export const useUiStore = create<UiState & UiStoreActions>((set) => ({
  ...initialUiState,
  resetCampaignUi: () => {
    onboardingDriver.destroy('campaign-reset');
    set((s) => {
      const nextOnboarding: OnboardingState = {
        ...s.onboarding,
        activeTour: null,
        activeStepId: null,
        sol1GuideStatus:
          s.onboarding.sol1GuideStatus === 'active' ? 'unseen' : s.onboarding.sol1GuideStatus,
      };
      writeOnboardingState(nextOnboarding);
      return {
        activeModal: null,
        selectedCrewId: 'cmd',
        selectedSystemId: 'solar',
        selectedEquipmentIds: [],
        tutorialStep: 0,
        toasts: [],
        onboarding: nextOnboarding,
      };
    });
  },
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
  setIntroStatus: (introStatus) =>
    set((s) => commitOnboarding({ ...s.onboarding, introStatus })),
  startTour: (tourId = 'sol1', stepId = MOON_SOL1_STEP_IDS[0]) =>
    set((s) => {
      const validStep =
        stepId && MOON_SOL1_STEP_IDS.includes(stepId) ? stepId : MOON_SOL1_STEP_IDS[0];
      return commitOnboarding({
        ...s.onboarding,
        tourVersion: TOUR_VERSION,
        activeTour: tourId,
        activeStepId: validStep,
        sol1GuideStatus: 'active',
      });
    }),
  setActiveStepId: (stepId) =>
    set((s) => {
      if (s.onboarding.activeTour === null) return s;
      const validStep = stepId && MOON_SOL1_STEP_IDS.includes(stepId) ? stepId : s.onboarding.activeStepId;
      return commitOnboarding({
        ...s.onboarding,
        activeStepId: validStep,
      });
    }),
  skipTour: () => {
    onboardingDriver.destroy('skip');
    set((s) =>
      commitOnboarding({
        ...s.onboarding,
        activeTour: null,
        activeStepId: null,
        sol1GuideStatus: 'skipped',
      })
    );
  },
  completeTour: () => {
    onboardingDriver.destroy('done');
    set((s) => {
      writePersistedUiPrefs({ ...s, tutorialCompleted: true });
      return {
        tutorialCompleted: true,
        ...commitOnboarding({
          ...s.onboarding,
          activeTour: null,
          activeStepId: null,
          sol1GuideStatus: 'completed',
        }),
      };
    });
  },
  replayOnboarding: () => {
    onboardingDriver.destroy('replaced');
    set((s) =>
      commitOnboarding({
        ...s.onboarding,
        activeTour: 'sol1',
        activeStepId: MOON_SOL1_STEP_IDS[0],
        sol1GuideStatus: 'active',
      })
    );
  },
  resetOnboarding: () => {
    onboardingDriver.destroy('campaign-reset');
    set((s) => {
      const resetState = createDefaultOnboardingState();
      writePersistedUiPrefs({ ...s, tutorialCompleted: false });
      writeOnboardingState(resetState);
      return {
        tutorialCompleted: false,
        tutorialStep: 0,
        onboarding: resetState,
        onboardingNoticeCode: null,
      };
    });
  },
  setContextualHintsEnabled: (contextualHintsEnabled) =>
    set((s) => commitOnboarding({ ...s.onboarding, contextualHintsEnabled })),
  dismissHint: (hintId) =>
    set((s) => {
      if (!hintId || s.onboarding.dismissedHintIds.includes(hintId)) return s;
      return commitOnboarding({
        ...s.onboarding,
        dismissedHintIds: [...s.onboarding.dismissedHintIds, hintId],
      });
    }),
  recordHintShown: (hintId, sol) =>
    set((s) => {
      if (!hintId) return s;
      const safeSol = Math.max(1, Math.floor(sol));
      return commitOnboarding({
        ...s.onboarding,
        hintLastShownSol: {
          ...s.onboarding.hintLastShownSol,
          [hintId]: safeSol,
        },
        hintShowCounts: {
          ...s.onboarding.hintShowCounts,
          [hintId]: (s.onboarding.hintShowCounts[hintId] ?? 0) + 1,
        },
      });
    }),
  dismissOnboardingNotice: () => set({ onboardingNoticeCode: null }),
}));
