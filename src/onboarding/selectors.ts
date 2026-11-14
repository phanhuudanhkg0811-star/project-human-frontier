import type { GameState, SolPhase, UiState } from '../types/index.ts';
import { TOUR_VERSION } from './persistence.ts';
import { getTourStepById, MOON_SOL1_TOUR_STEPS } from './tours/moonSol1Tour.ts';
import type { OnboardingState } from './types.ts';

const PHASE_ORDER: Readonly<Record<SolPhase, number>> = {
  briefing: 0,
  engineering: 1,
  comms: 2,
  rationing: 3,
  resolving: 4,
  debrief: 5,
  terminal: 6,
};

export function canStartGuidedSol1(gameState: GameState, onboarding: OnboardingState): boolean {
  if (gameState.campaign.status !== 'active') return false;
  if (gameState.clock.sol !== 1) return false;
  if (gameState.clock.phase === 'terminal') return false;
  if (onboarding.tourVersion !== TOUR_VERSION) return false;
  return onboarding.sol1GuideStatus === 'unseen' || onboarding.sol1GuideStatus === 'active';
}

export function getResumeStepId(onboarding: OnboardingState, gameState: GameState): string | null {
  if (onboarding.tourVersion !== TOUR_VERSION) return null;
  if (onboarding.activeTour !== 'sol1' || onboarding.sol1GuideStatus !== 'active') return null;
  if (gameState.campaign.status !== 'active' || gameState.clock.phase === 'terminal') return null;
  if (gameState.clock.sol > 1 && gameState.clock.phase !== 'debrief') return null;

  const currentPhaseRank = PHASE_ORDER[gameState.clock.phase];
  const savedStep = getTourStepById(onboarding.activeStepId);

  if (gameState.clock.phase === 'debrief') {
    return 'sol1-debrief-brief';
  }

  if (savedStep && PHASE_ORDER[savedStep.phase] >= currentPhaseRank) {
    return savedStep.stepId;
  }

  const nextForPhase = MOON_SOL1_TOUR_STEPS.find(
    (step) => PHASE_ORDER[step.phase] >= currentPhaseRank
  );
  return nextForPhase?.stepId ?? null;
}

export function shouldUsePracticeOverview(
  gameState: GameState,
  onboarding: OnboardingState
): boolean {
  if (onboarding.tourVersion !== TOUR_VERSION) return true;
  if (gameState.campaign.status !== 'active') return true;
  return gameState.clock.sol > 1;
}

export function canTriggerContextualHints(
  gameState: GameState,
  uiState: Pick<UiState, 'activeModal' | 'reducedMotion'>,
  onboarding: OnboardingState
): boolean {
  if (!onboarding.contextualHintsEnabled) return false;
  if (onboarding.activeTour !== null || onboarding.sol1GuideStatus === 'active') return false;
  if (uiState.activeModal !== null) return false;
  if (gameState.campaign.status !== 'active') return false;
  if (
    gameState.clock.phase === 'resolving' ||
    gameState.clock.phase === 'debrief' ||
    gameState.clock.phase === 'terminal'
  ) {
    return false;
  }
  return true;
}
