import { create } from 'zustand';
import { onboardingDriver } from '../onboarding/driverAdapter.ts';
import {
  clampIntroSceneIndex,
  clearIntroSessionScene,
  writeIntroSessionScene,
} from '../onboarding/introScenes.ts';
import {
  createDefaultOnboardingState,
  readOnboardingState,
  TOUR_VERSION,
  writeOnboardingState,
} from '../onboarding/persistence.ts';
import {
  createDefaultNarrativeState,
  readNarrativeState,
  writeNarrativeState,
  type MilestonePresentationId,
  type NarrativeState,
} from '../onboarding/narrativePersistence.ts';
import { COCKPIT_DISCOVERY_STEP_IDS } from '../onboarding/tours/cockpitDiscoveryTour.ts';
import { MOON_SOL1_STEP_IDS } from '../onboarding/tours/moonSol1Tour.ts';
import type { IntroStatus, OnboardingState, TourId } from '../onboarding/types.ts';
import type {
  ActiveModalType,
  CrewId,
  EquipmentId,
  IntroMode,
  SystemId,
  ToastMessage,
  UiState,
} from '../types/index.ts';

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

type TourReturnOrigin = 'title' | 'cockpit' | null;

interface TourLaunchOptions {
  readonly returnToTutorialOrigin?: TourReturnOrigin;
}

let returnToTutorialOrigin: TourReturnOrigin = null;
let pendingTutorialReopenOnSandboxExit = false;

function takeTutorialReturnPatch(): Partial<Pick<UiState, 'appScreen' | 'activeModal'>> {
  const origin = returnToTutorialOrigin;
  returnToTutorialOrigin = null;
  pendingTutorialReopenOnSandboxExit = origin !== null;
  return origin ? { appScreen: origin, activeModal: 'tutorial' } : {};
}

interface UiStoreActions {
  enterTitleScreen: () => void;
  openIntro: (mode: IntroMode, returnScreen: 'title' | 'cockpit', startIndex?: number) => void;
  setIntroSceneIndex: (index: number) => void;
  finishIntroToSetup: (outcome: 'completed' | 'skipped') => void;
  enterCockpit: () => void;
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
  startCockpitTour: (stepId?: string | null, options?: TourLaunchOptions) => void;
  completeCockpitTour: (nextAction?: 'to-sol1' | 'done') => void;
  skipCockpitTour: () => void;
  startTour: (tourId?: TourId, stepId?: string | null) => void;
  setActiveStepId: (stepId: string | null) => void;
  skipTour: () => void;
  completeTour: () => void;
  replayOnboarding: (options?: TourLaunchOptions) => void;
  resetOnboarding: () => void;
  consumePendingTutorialReopen: () => boolean;
  setContextualHintsEnabled: (enabled: boolean) => void;
  dismissHint: (hintId: string) => void;
  snoozeHintForSol: (hintId: string, sol: number, severityKey?: string) => void;
  recordHintShown: (hintId: string, sol: number, severityKey?: string) => void;
  dismissOnboardingNotice: () => void;
  markMilestoneShown: (milestoneId: MilestonePresentationId, runKey: string) => void;
  resetNarrativeMilestones: () => void;
}

const persistedPrefs = readPersistedUiPrefs();
const initialOnboardingDecode = readOnboardingState(undefined, persistedPrefs.tutorialCompleted);
const initialNarrativeState = readNarrativeState();

const initialUiState: UiState = {
  appScreen: 'title',
  introMode: 'first-run',
  introReturnScreen: 'title',
  introSceneIndex: 0,
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
  narrative: initialNarrativeState,
  toasts: [],
};

function commitOnboarding(next: OnboardingState): { onboarding: OnboardingState } {
  writeOnboardingState(next);
  return { onboarding: next };
}

function commitNarrative(next: NarrativeState): { narrative: NarrativeState } {
  writeNarrativeState(next);
  return { narrative: next };
}

export const useUiStore = create<UiState & UiStoreActions>((set) => ({
  ...initialUiState,
  enterTitleScreen: () => {
    onboardingDriver.destroy('unmount');
    clearIntroSessionScene();
    set({ appScreen: 'title', activeModal: null });
  },
  openIntro: (mode, returnScreen, startIndex = 0) => {
    onboardingDriver.destroy('unmount');
    const safeIndex = clampIntroSceneIndex(startIndex);
    writeIntroSessionScene(safeIndex, mode, returnScreen);
    set({
      appScreen: 'intro',
      introMode: mode,
      introReturnScreen: returnScreen,
      introSceneIndex: safeIndex,
      activeModal: null,
    });
  },
  setIntroSceneIndex: (index) =>
    set((s) => {
      const safeIndex = clampIntroSceneIndex(index);
      writeIntroSessionScene(safeIndex, s.introMode, s.introReturnScreen);
      return { introSceneIndex: safeIndex };
    }),
  finishIntroToSetup: (outcome) => {
    clearIntroSessionScene();
    set((s) => {
      const nextStatus: IntroStatus =
        s.onboarding.introStatus === 'completed' ? 'completed' : outcome;
      const onboardingUpdate = commitOnboarding({
        ...s.onboarding,
        introStatus: nextStatus,
      });
      if (s.introMode === 'first-run') {
        return {
          ...onboardingUpdate,
          appScreen: 'title',
          introSceneIndex: 0,
          activeModal: 'launch',
        };
      }
      return {
        ...onboardingUpdate,
        appScreen: s.introReturnScreen,
        introSceneIndex: 0,
        activeModal: null,
      };
    });
  },
  enterCockpit: () => {
    clearIntroSessionScene();
    set({ appScreen: 'cockpit', activeModal: null });
  },
  resetCampaignUi: () => {
    onboardingDriver.destroy('campaign-reset');
    returnToTutorialOrigin = null;
    pendingTutorialReopenOnSandboxExit = false;
    set((s) => {
      const nextOnboarding: OnboardingState = {
        onboardingVersion: s.onboarding.onboardingVersion,
        introStatus: s.onboarding.introStatus,
        cockpitTourStatus: 'unseen',
        tourVersion: s.onboarding.tourVersion,
        activeTour: null,
        activeStepId: null,
        sol1GuideStatus:
          s.onboarding.sol1GuideStatus === 'active' ? 'unseen' : s.onboarding.sol1GuideStatus,
        contextualHintsEnabled: s.onboarding.contextualHintsEnabled,
        dismissedHintIds: s.onboarding.dismissedHintIds,
        hintLastShownSol: {},
        hintShowCounts: {},
      };
      writeOnboardingState(nextOnboarding);
      const resetNarrative = createDefaultNarrativeState();
      writeNarrativeState(resetNarrative);
      return {
        activeModal: null,
        selectedCrewId: 'cmd',
        selectedSystemId: 'solar',
        selectedEquipmentIds: [],
        tutorialStep: 0,
        toasts: [],
        onboarding: nextOnboarding,
        narrative: resetNarrative,
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
  startCockpitTour: (stepId = COCKPIT_DISCOVERY_STEP_IDS[0], options) => {
    onboardingDriver.destroy('replaced');
    returnToTutorialOrigin = options?.returnToTutorialOrigin ?? null;
    pendingTutorialReopenOnSandboxExit = false;
    set((s) => {
      const validStep =
        stepId && COCKPIT_DISCOVERY_STEP_IDS.includes(stepId)
          ? stepId
          : COCKPIT_DISCOVERY_STEP_IDS[0];
      return {
        appScreen: 'cockpit',
        activeModal: null,
        ...commitOnboarding({
          ...s.onboarding,
          tourVersion: TOUR_VERSION,
          activeTour: 'cockpit',
          activeStepId: validStep,
          cockpitTourStatus:
            s.onboarding.cockpitTourStatus === 'completed' ? 'completed' : 'active',
        }),
      };
    });
  },
  completeCockpitTour: (nextAction = 'done') => {
    returnToTutorialOrigin = null;
    pendingTutorialReopenOnSandboxExit = false;
    set((s) => {
      if (nextAction === 'to-sol1') {
        return commitOnboarding({
          ...s.onboarding,
          tourVersion: TOUR_VERSION,
          cockpitTourStatus: 'completed',
          activeTour: 'sol1',
          activeStepId: MOON_SOL1_STEP_IDS[0],
          sol1GuideStatus: 'active',
        });
      }
      return commitOnboarding({
        ...s.onboarding,
        cockpitTourStatus: 'completed',
        activeTour: null,
        activeStepId: null,
      });
    });
  },
  skipCockpitTour: () => {
    onboardingDriver.destroy('skip');
    const returnPatch = takeTutorialReturnPatch();
    set((s) => ({
      ...commitOnboarding({
        ...s.onboarding,
        cockpitTourStatus:
          s.onboarding.cockpitTourStatus === 'completed' ? 'completed' : 'skipped',
        activeTour: null,
        activeStepId: null,
      }),
      ...returnPatch,
    }));
  },
  startTour: (tourId = 'sol1', stepId = null) => {
    returnToTutorialOrigin = null;
    pendingTutorialReopenOnSandboxExit = false;
    set((s) => {
      if (tourId === 'cockpit') {
        const validCockpitStep =
          stepId && COCKPIT_DISCOVERY_STEP_IDS.includes(stepId)
            ? stepId
            : COCKPIT_DISCOVERY_STEP_IDS[0];
        return commitOnboarding({
          ...s.onboarding,
          tourVersion: TOUR_VERSION,
          activeTour: 'cockpit',
          activeStepId: validCockpitStep,
          cockpitTourStatus:
            s.onboarding.cockpitTourStatus === 'completed' ? 'completed' : 'active',
        });
      }
      const validStep =
        stepId && MOON_SOL1_STEP_IDS.includes(stepId) ? stepId : MOON_SOL1_STEP_IDS[0];
      return commitOnboarding({
        ...s.onboarding,
        tourVersion: TOUR_VERSION,
        activeTour: 'sol1',
        activeStepId: validStep,
        sol1GuideStatus: 'active',
      });
    });
  },
  setActiveStepId: (stepId) =>
    set((s) => {
      if (s.onboarding.activeTour === null || !stepId) return s;
      const validPool =
        s.onboarding.activeTour === 'cockpit' ? COCKPIT_DISCOVERY_STEP_IDS : MOON_SOL1_STEP_IDS;
      const validStep = validPool.includes(stepId) ? stepId : s.onboarding.activeStepId;
      return commitOnboarding({
        ...s.onboarding,
        activeStepId: validStep,
      });
    }),
  skipTour: () => {
    onboardingDriver.destroy('skip');
    const returnPatch = takeTutorialReturnPatch();
    set((s) => {
      if (s.onboarding.activeTour === 'cockpit') {
        return {
          ...commitOnboarding({
            ...s.onboarding,
            activeTour: null,
            activeStepId: null,
            cockpitTourStatus:
              s.onboarding.cockpitTourStatus === 'completed' ? 'completed' : 'skipped',
          }),
          ...returnPatch,
        };
      }
      return {
        ...commitOnboarding({
          ...s.onboarding,
          activeTour: null,
          activeStepId: null,
          sol1GuideStatus: 'skipped',
        }),
        ...returnPatch,
      };
    });
  },
  completeTour: () => {
    onboardingDriver.destroy('done');
    returnToTutorialOrigin = null;
    pendingTutorialReopenOnSandboxExit = false;
    set((s) => {
      if (s.onboarding.activeTour === 'cockpit') {
        return commitOnboarding({
          ...s.onboarding,
          activeTour: null,
          activeStepId: null,
          cockpitTourStatus: 'completed',
        });
      }
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
  replayOnboarding: (options) => {
    onboardingDriver.destroy('replaced');
    returnToTutorialOrigin = options?.returnToTutorialOrigin ?? null;
    pendingTutorialReopenOnSandboxExit = false;
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
    returnToTutorialOrigin = null;
    pendingTutorialReopenOnSandboxExit = false;
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
  consumePendingTutorialReopen: () => {
    const pending = pendingTutorialReopenOnSandboxExit;
    pendingTutorialReopenOnSandboxExit = false;
    return pending;
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
  snoozeHintForSol: (hintId, sol, severityKey) =>
    set((s) => {
      if (!hintId) return s;
      const safeSol = Math.max(1, Math.floor(sol));
      const nextSnoozed = {
        ...(s.onboarding.hintSnoozedSol ?? {}),
        [hintId]: safeSol,
      };
      const nextSeverity = severityKey
        ? { ...(s.onboarding.hintLastSeverity ?? {}), [hintId]: severityKey }
        : s.onboarding.hintLastSeverity;
      return commitOnboarding({
        ...s.onboarding,
        hintSnoozedSol: nextSnoozed,
        ...(nextSeverity && Object.keys(nextSeverity).length > 0 ? { hintLastSeverity: nextSeverity } : {}),
      });
    }),
  recordHintShown: (hintId, sol, severityKey) =>
    set((s) => {
      if (!hintId) return s;
      const safeSol = Math.max(1, Math.floor(sol));
      const nextSeverity = severityKey
        ? { ...(s.onboarding.hintLastSeverity ?? {}), [hintId]: severityKey }
        : s.onboarding.hintLastSeverity;
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
        ...(nextSeverity && Object.keys(nextSeverity).length > 0 ? { hintLastSeverity: nextSeverity } : {}),
      });
    }),
  dismissOnboardingNotice: () => set({ onboardingNoticeCode: null }),
  markMilestoneShown: (milestoneId, runKey) =>
    set((s) => {
      if (!milestoneId || !runKey) return s;
      const isSameRun = s.narrative.runKey === null || s.narrative.runKey === runKey;
      const baseShown = isSameRun ? s.narrative.shownMilestoneIds : [];
      if (isSameRun && s.narrative.runKey === runKey && baseShown.includes(milestoneId)) {
        return s;
      }
      const nextShown = baseShown.includes(milestoneId) ? baseShown : [...baseShown, milestoneId];
      return commitNarrative({
        ...s.narrative,
        runKey,
        shownMilestoneIds: nextShown,
      });
    }),
  resetNarrativeMilestones: () =>
    set(() => commitNarrative(createDefaultNarrativeState())),
}));
