import { dictionaries } from '../i18n/dictionaries.ts';
import type { Locale } from '../i18n/types.ts';
import { useUiStore } from '../store/uiStore.ts';
import type { ActiveModalType, GameState } from '../types/index.ts';
import { onboardingDriver } from './driverAdapter.ts';
import {
  canStartCockpitTour,
  getResumeStepId,
} from './selectors.ts';
import {
  COCKPIT_DISCOVERY_STEPS,
} from './tours/cockpitDiscoveryTour.ts';
import {
  getNextTourStepId,
  getTourStepById,
  MOON_SOL1_TOUR_STEPS,
} from './tours/moonSol1Tour.ts';
import type { OnboardingState, TourId, TourStepDefinition } from './types.ts';

export interface AutoTourPlan {
  readonly tourId: TourId | null;
  readonly startStepId: string | null;
}

export type Sol1ProgressionResult =
  | { readonly action: 'none' }
  | { readonly action: 'advance'; readonly completedStepId: string; readonly nextStepId: string }
  | { readonly action: 'complete'; readonly completedStepId: string };

export function evaluateAutoStartTour(
  gameState: GameState,
  onboarding: OnboardingState,
  hasSaveError: boolean
): AutoTourPlan {
  if (hasSaveError || gameState.campaign.status !== 'active' || gameState.clock.phase === 'terminal') {
    return { tourId: null, startStepId: null };
  }

  if (onboarding.activeTour === 'cockpit' && canStartCockpitTour(gameState, onboarding)) {
    return {
      tourId: 'cockpit',
      startStepId: getResumeStepId(onboarding, gameState) ?? COCKPIT_DISCOVERY_STEPS[0].stepId,
    };
  }

  if (canStartCockpitTour(gameState, onboarding)) {
    return {
      tourId: 'cockpit',
      startStepId: COCKPIT_DISCOVERY_STEPS[0].stepId,
    };
  }

  return { tourId: null, startStepId: null };
}

export function resolveSol1StepProgression(
  activeStepId: string | null,
  gameState: GameState,
  activeModal: ActiveModalType,
  opts?: { readonly justClosedComms?: boolean }
): Sol1ProgressionResult {
  const step = getTourStepById(activeStepId);
  if (!step || !step.isCompleted) {
    return { action: 'none' };
  }
  if (step.stepId === 'sol1-open-comms') {
    if (!opts?.justClosedComms) {
      return { action: 'none' };
    }
  } else if (!step.isCompleted(gameState, { activeModal })) {
    return { action: 'none' };
  }
  const nextStepId = getNextTourStepId(step.stepId);
  if (nextStepId) {
    return { action: 'advance', completedStepId: step.stepId, nextStepId };
  }
  return { action: 'complete', completedStepId: step.stepId };
}

export function canSol1StepAdvance(
  step: TourStepDefinition,
  gameState: GameState,
  activeModal: ActiveModalType
): boolean {
  if (step.allowContinueWithoutAction) return true;
  if (step.stepId === 'sol1-open-comms') {
    return activeModal === 'comms' || activeModal === 'expedition';
  }
  return Boolean(step.isCompleted?.(gameState, { activeModal }));
}

const MODAL_TARGET_BY_STEP: Readonly<Record<string, ActiveModalType>> = {
  'sol1-weather-status': 'starlog',
  'sol1-event-choice': 'starlog',
  'sol1-crew-assignment': 'character',
  'sol1-systems-panel': 'menu',
  'sol1-resource-forecast': 'end',
  'sol1-end-sol': 'end',
};

export function doesStepMatchOpenModal(
  activeStepId: string | null,
  activeModal: ActiveModalType
): boolean {
  if (!activeStepId || !activeModal) return false;
  return MODAL_TARGET_BY_STEP[activeStepId] === activeModal;
}

const COCKPIT_MODAL_BY_STEP: Record<string, ActiveModalType | null> = {
  'cockpit-context': null,
  'cockpit-stats': null,
  'cockpit-crew': null,
  'cockpit-crew-panel': 'character',
  'cockpit-briefing-panel': 'starlog',
  'cockpit-systems-fab': null,
  'cockpit-systems-panel': 'menu',
  'cockpit-fabricator-panel': 'crafting',
  'cockpit-comms-rover': 'comms',
  'cockpit-rover-panel': 'expedition',
  'cockpit-console-cta': null,
};

const COCKPIT_MODAL_FRAME_BY_STEP: Record<string, string | null> = {
  'cockpit-systems-panel': 'menu',
  'cockpit-fabricator-panel': 'crafting',
  'cockpit-comms-rover': 'comms',
  'cockpit-rover-panel': 'expedition',
};

export function syncModalForTourStep(tourId: TourId, stepId: string): boolean {
  const ui = useUiStore.getState();
  if (tourId === 'cockpit') {
    const expectedModal = COCKPIT_MODAL_BY_STEP[stepId] ?? null;
    if (expectedModal === null) {
      if (ui.activeModal === null) return false;
      ui.closeModal();
      return true;
    }
    if (ui.activeModal === expectedModal) return false;
    ui.openModal(expectedModal);
    return true;
  }
  if (ui.activeModal === null) return false;
  if (stepId === 'sol1-open-comms' && (ui.activeModal === 'comms' || ui.activeModal === 'expedition')) {
    return false;
  }
  const expectedModal = MODAL_TARGET_BY_STEP[stepId] ?? null;
  if (expectedModal !== ui.activeModal) {
    ui.closeModal();
    return true;
  }
  return false;
}

function shouldWaitForSol1PrimaryTarget(stepId: string): boolean {
  if (stepId === 'sol1-open-comms') {
    const modal = useUiStore.getState().activeModal;
    return modal === 'comms' || modal === 'expedition';
  }
  const expectedModal = MODAL_TARGET_BY_STEP[stepId];
  if (!expectedModal) return true;
  return useUiStore.getState().activeModal === expectedModal;
}

async function prepareStepEnvironment(tourId: TourId, stepId: string): Promise<void> {
  const closed = syncModalForTourStep(tourId, stepId);
  if (closed && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  }
}

export function launchCockpitDiscoveryTourDriver(params: {
  readonly startStepId?: string | null;
  readonly locale: Locale;
  readonly reducedMotion: boolean;
  readonly canChainSol1: boolean;
  readonly onStepAnnounce?: (text: string) => void;
}): Promise<boolean> {
  const dict = dictionaries[params.locale];
  return onboardingDriver.start({
    tourId: 'cockpit',
    steps: COCKPIT_DISCOVERY_STEPS,
    startStepId: params.startStepId ?? COCKPIT_DISCOVERY_STEPS[0].stepId,
    reducedMotion: params.reducedMotion,
    progressText: dict['onboarding.popover.progress'],
    canAdvanceStep: () => true,
    resolveSelectorOverride: (step) => {
      const frameType = COCKPIT_MODAL_FRAME_BY_STEP[step.stepId];
      return frameType ? `[data-tour-modal-frame="${frameType}"]` : null;
    },
    onBeforeStepMove: (step) => prepareStepEnvironment('cockpit', step.stepId),
    resolveText: (step) => ({
      title: dict[step.titleKey] ?? step.stepId,
      description: dict[step.bodyKey] ?? '',
      nextBtnText: dict['onboarding.popover.next'],
      prevBtnText: dict['onboarding.popover.prev'],
      doneBtnText: params.canChainSol1
        ? dict['onboarding.cockpit.doneToSol1']
        : dict['onboarding.popover.done'],
      closeBtnLabel: dict['onboarding.popover.skip'],
    }),
    onStepChange: (stepId) => {
      syncModalForTourStep('cockpit', stepId);
      const ui = useUiStore.getState();
      if (ui.onboarding.activeTour === 'cockpit') {
        ui.setActiveStepId(stepId);
      }
      const title = dict[`onboarding.cockpit.${stepId}.title`];
      if (title && params.onStepAnnounce) {
        params.onStepAnnounce(title);
      }
    },
    onComplete: () => {
      useUiStore.getState().closeModal();
      useUiStore.getState().completeCockpitTour(params.canChainSol1 ? 'to-sol1' : 'done');
    },
    onDismiss: (reason) => {
      if (reason === 'skip' || reason === 'escape') {
        useUiStore.getState().closeModal();
        useUiStore.getState().skipCockpitTour();
      }
    },
  });
}

export function launchSol1TourDriver(params: {
  readonly startStepId?: string | null;
  readonly locale: Locale;
  readonly reducedMotion: boolean;
  readonly isOverview: boolean;
  readonly canAdvanceStep?: (step: TourStepDefinition) => boolean;
  readonly onStepAnnounce?: (text: string) => void;
}): Promise<boolean> {
  const dict = dictionaries[params.locale];
  return onboardingDriver.start({
    tourId: 'sol1',
    steps: MOON_SOL1_TOUR_STEPS,
    startStepId: params.startStepId ?? MOON_SOL1_TOUR_STEPS[0].stepId,
    reducedMotion: params.reducedMotion,
    progressText: dict['onboarding.popover.progress'],
    canAdvanceStep: (step) => params.isOverview || Boolean(params.canAdvanceStep?.(step)),
    shouldWaitForTarget: (step) => shouldWaitForSol1PrimaryTarget(step.stepId),
    resolveElementOverride: (step) => {
      if (step.stepId !== 'sol1-open-comms' || typeof document === 'undefined') return null;
      const modal = useUiStore.getState().activeModal;
      if (modal !== 'comms' && modal !== 'expedition') return null;
      return document.querySelector(
        '[data-tour-modal-frame="comms"], [data-tour-modal-frame="expedition"]'
      );
    },
    onBeforeStepMove: (step) => prepareStepEnvironment('sol1', step.stepId),
    resolveText: (step) => ({
      title: dict[step.titleKey] ?? step.stepId,
      description: dict[step.bodyKey] ?? '',
      nextBtnText: dict['onboarding.popover.next'],
      prevBtnText: dict['onboarding.popover.prev'],
      doneBtnText: dict['onboarding.popover.done'],
      closeBtnLabel: dict['onboarding.popover.skip'],
    }),
    onStepChange: (stepId) => {
      syncModalForTourStep('sol1', stepId);
      const ui = useUiStore.getState();
      if (ui.onboarding.activeTour === 'sol1') {
        ui.setActiveStepId(stepId);
      }
      const title = dict[`onboarding.sol1.${stepId}.title`];
      if (title && params.onStepAnnounce) {
        params.onStepAnnounce(title);
      }
    },
    onComplete: () => {
      useUiStore.getState().completeTour();
    },
    onDismiss: (reason) => {
      if (reason === 'skip' || reason === 'escape') {
        useUiStore.getState().skipTour();
      }
    },
  });
}
