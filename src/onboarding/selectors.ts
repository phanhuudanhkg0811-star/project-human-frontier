import type { ContentBundle, GameState, SolPhase, UiState } from '../types/index.ts';
import {
  CONTEXTUAL_HINT_RULES,
  createHintEvalContext,
  parseSeverityRank,
} from './hintsCatalog.ts';
import { TOUR_VERSION } from './persistence.ts';
import {
  COCKPIT_DISCOVERY_STEP_IDS,
  getCockpitStepById,
} from './tours/cockpitDiscoveryTour.ts';
import { getTourStepById, MOON_SOL1_TOUR_STEPS } from './tours/moonSol1Tour.ts';
import type { ContextualHintView, OnboardingState } from './types.ts';

const PHASE_ORDER: Readonly<Record<SolPhase, number>> = {
  briefing: 0,
  engineering: 1,
  comms: 2,
  rationing: 3,
  resolving: 4,
  debrief: 5,
  terminal: 6,
};

function phaseRank(phase: SolPhase | 'any'): number {
  return phase === 'any' ? 0 : PHASE_ORDER[phase];
}

export function canStartCockpitTour(gameState: GameState, onboarding: OnboardingState): boolean {
  if (gameState.campaign.status !== 'active') return false;
  if (gameState.clock.sol !== 1 || gameState.clock.phase === 'terminal') return false;
  if (onboarding.tourVersion !== TOUR_VERSION) return false;
  if (onboarding.activeTour === 'sol1' || onboarding.sol1GuideStatus === 'active') return false;
  return onboarding.cockpitTourStatus === 'unseen' || onboarding.cockpitTourStatus === 'active';
}

export function canStartGuidedSol1(gameState: GameState, onboarding: OnboardingState): boolean {
  if (gameState.campaign.status !== 'active') return false;
  if (gameState.clock.sol !== 1) return false;
  if (gameState.clock.phase === 'terminal') return false;
  if (onboarding.tourVersion !== TOUR_VERSION) return false;
  return onboarding.sol1GuideStatus === 'unseen' || onboarding.sol1GuideStatus === 'active';
}

export function getResumeStepId(onboarding: OnboardingState, gameState: GameState): string | null {
  if (onboarding.tourVersion !== TOUR_VERSION) return null;
  if (gameState.campaign.status !== 'active' || gameState.clock.phase === 'terminal') return null;

  if (onboarding.activeTour === 'cockpit') {
    const savedCockpitStep = getCockpitStepById(onboarding.activeStepId);
    return savedCockpitStep ? savedCockpitStep.stepId : COCKPIT_DISCOVERY_STEP_IDS[0];
  }

  if (onboarding.activeTour !== 'sol1' || onboarding.sol1GuideStatus !== 'active') return null;
  if (gameState.clock.sol > 1 && gameState.clock.phase !== 'debrief') return null;

  const currentPhaseRank = PHASE_ORDER[gameState.clock.phase];
  const savedStep = getTourStepById(onboarding.activeStepId);

  if (gameState.clock.phase === 'debrief') {
    return 'sol1-debrief-brief';
  }

  if (savedStep && phaseRank(savedStep.phase) >= currentPhaseRank) {
    return savedStep.stepId;
  }

  const nextForPhase = MOON_SOL1_TOUR_STEPS.find(
    (step) => phaseRank(step.phase) >= currentPhaseRank
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
  onboarding: OnboardingState,
  opts?: { readonly milestoneActive?: boolean; readonly tutorialSandboxActive?: boolean }
): boolean {
  if (!onboarding.contextualHintsEnabled) return false;
  if (opts?.milestoneActive || opts?.tutorialSandboxActive) return false;
  if (
    onboarding.activeTour !== null ||
    onboarding.cockpitTourStatus === 'active' ||
    onboarding.sol1GuideStatus === 'active'
  ) {
    return false;
  }
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

export function selectActiveContextualHint(
  gameState: GameState,
  bundle: ContentBundle,
  uiState: Pick<UiState, 'activeModal' | 'reducedMotion'>,
  onboarding: OnboardingState,
  opts?: { readonly milestoneActive?: boolean; readonly tutorialSandboxActive?: boolean }
): ContextualHintView | null {
  if (!canTriggerContextualHints(gameState, uiState, onboarding, opts)) {
    return null;
  }
  // Avoid competing with automatic Sol 1 first-run onboarding launch.
  if (gameState.clock.sol === 1 && onboarding.cockpitTourStatus === 'unseen') {
    return null;
  }

  const sol = gameState.clock.sol;
  const evalCtx = createHintEvalContext(gameState, bundle);

  for (const rule of CONTEXTUAL_HINT_RULES) {
    if (rule.allowNeverRemindAgain && onboarding.dismissedHintIds.includes(rule.id)) {
      continue;
    }

    const match = rule.evaluate(evalCtx);
    if (!match) continue;

    const priorSeverityKey = onboarding.hintLastSeverity?.[rule.id];
    const priorSeverityRank = parseSeverityRank(priorSeverityKey);
    const escalatedFromPrior =
      !rule.allowNeverRemindAgain &&
      priorSeverityKey !== undefined &&
      match.severityRank > priorSeverityRank &&
      priorSeverityKey !== match.severityKey;

    if (!escalatedFromPrior) {
      if (onboarding.hintSnoozedSol?.[rule.id] === sol) {
        continue;
      }
      const lastShownSol = onboarding.hintLastShownSol[rule.id];
      if (
        rule.cooldownSols > 0 &&
        lastShownSol !== undefined &&
        lastShownSol < sol &&
        sol - lastShownSol < rule.cooldownSols
      ) {
        continue;
      }
      const showCount = onboarding.hintShowCounts[rule.id] ?? 0;
      if (showCount >= rule.maxShows && lastShownSol !== sol) {
        continue;
      }
    }

    return {
      id: rule.id,
      category: rule.category,
      priority: rule.priority,
      severityKey: match.severityKey,
      severityRank: match.severityRank,
      escalatedFromPrior,
      allowNeverRemindAgain: rule.allowNeverRemindAgain,
      titleKey: rule.titleKey,
      bodyKey: match.bodyKeyOverride ?? rule.bodyKey,
      ...(escalatedFromPrior && match.reasonKey ? { reasonKey: match.reasonKey } : {}),
      params: match.params,
      ctaTargetId: match.ctaTargetOverride ?? rule.ctaTargetId,
      fallbackTargetId: match.fallbackTargetOverride ?? rule.fallbackTargetId,
      ctaPanel: match.ctaPanelOverride ?? rule.ctaPanel,
      ctaLabelKey: rule.ctaLabelKey,
    };
  }

  return null;
}
