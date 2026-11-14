import { TOUR_TARGET_IDS } from '../targets.ts';
import type { TourStepDefinition } from '../types.ts';

export const MOON_SOL1_TOUR_STEPS: readonly TourStepDefinition[] = [
  {
    stepId: 'sol1-open-briefing',
    targetId: TOUR_TARGET_IDS.OPEN_BRIEFING,
    fallbackTargetId: TOUR_TARGET_IDS.PRIMARY_PHASE_CTA,
    phase: 'briefing',
    decorationOnly: false,
    side: 'top',
    waitForElementMs: 1200,
    allowContinueWithoutAction: false,
    titleKey: 'onboarding.sol1.sol1-open-briefing.title',
    bodyKey: 'onboarding.sol1.sol1-open-briefing.body',
    testEvent: 'onboarding:test:sol1-open-briefing',
    isCompleted: (_state, ui) => ui.activeModal === 'starlog',
  },
  {
    stepId: 'sol1-weather-status',
    targetId: TOUR_TARGET_IDS.WEATHER_STATUS,
    fallbackTargetId: TOUR_TARGET_IDS.TELEMETRY_DONKI,
    phase: 'briefing',
    decorationOnly: false,
    side: 'bottom',
    waitForElementMs: 1500,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.sol1.sol1-weather-status.title',
    bodyKey: 'onboarding.sol1.sol1-weather-status.body',
    testEvent: 'onboarding:test:sol1-weather-status',
  },
  {
    stepId: 'sol1-event-choice',
    targetId: TOUR_TARGET_IDS.EVENT_CHOICE,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_BRIEFING,
    phase: 'briefing',
    decorationOnly: false,
    side: 'top',
    waitForElementMs: 1500,
    allowContinueWithoutAction: false,
    titleKey: 'onboarding.sol1.sol1-event-choice.title',
    bodyKey: 'onboarding.sol1.sol1-event-choice.body',
    testEvent: 'onboarding:test:sol1-event-choice',
    isCompleted: (state) => state.events.activeEventId === null,
  },
  {
    stepId: 'sol1-crew-assignment',
    targetId: TOUR_TARGET_IDS.CREW_ASSIGNMENT,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_CREW,
    phase: 'engineering',
    decorationOnly: false,
    side: 'bottom',
    waitForElementMs: 1500,
    allowContinueWithoutAction: false,
    titleKey: 'onboarding.sol1.sol1-crew-assignment.title',
    bodyKey: 'onboarding.sol1.sol1-crew-assignment.body',
    testEvent: 'onboarding:test:sol1-crew-assignment',
    isCompleted: (state) => Object.values(state.crew).some((member) => member.assignedTask !== null),
  },
  {
    stepId: 'sol1-systems-panel',
    targetId: TOUR_TARGET_IDS.SYSTEMS_PANEL,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_SYSTEMS,
    phase: 'engineering',
    decorationOnly: false,
    side: 'top',
    waitForElementMs: 1500,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.sol1.sol1-systems-panel.title',
    bodyKey: 'onboarding.sol1.sol1-systems-panel.body',
    testEvent: 'onboarding:test:sol1-systems-panel',
  },
  {
    stepId: 'sol1-open-comms',
    targetId: TOUR_TARGET_IDS.OPEN_COMMS,
    fallbackTargetId: TOUR_TARGET_IDS.PRIMARY_PHASE_CTA,
    phase: 'comms',
    decorationOnly: false,
    side: 'top',
    waitForElementMs: 1200,
    allowContinueWithoutAction: false,
    titleKey: 'onboarding.sol1.sol1-open-comms.title',
    bodyKey: 'onboarding.sol1.sol1-open-comms.body',
    testEvent: 'onboarding:test:sol1-open-comms',
    isCompleted: (_state, ui) => ui.activeModal === 'comms' || ui.activeModal === 'expedition',
  },
  {
    stepId: 'sol1-resource-forecast',
    targetId: TOUR_TARGET_IDS.RESOURCE_FORECAST,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_END_SOL,
    phase: 'rationing',
    decorationOnly: false,
    side: 'top',
    waitForElementMs: 1500,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.sol1.sol1-resource-forecast.title',
    bodyKey: 'onboarding.sol1.sol1-resource-forecast.body',
    testEvent: 'onboarding:test:sol1-resource-forecast',
  },
  {
    stepId: 'sol1-end-sol',
    targetId: TOUR_TARGET_IDS.END_SOL,
    fallbackTargetId: TOUR_TARGET_IDS.PRIMARY_PHASE_CTA,
    phase: 'rationing',
    decorationOnly: false,
    side: 'left',
    waitForElementMs: 1500,
    allowContinueWithoutAction: false,
    titleKey: 'onboarding.sol1.sol1-end-sol.title',
    bodyKey: 'onboarding.sol1.sol1-end-sol.body',
    testEvent: 'onboarding:test:sol1-end-sol',
    isCompleted: (state) => state.clock.phase === 'debrief' || state.clock.sol > 1,
  },
  {
    stepId: 'sol1-debrief-brief',
    targetId: TOUR_TARGET_IDS.DEBRIEF_BRIEF,
    fallbackTargetId: TOUR_TARGET_IDS.HUD_TUTORIAL_TRIGGER,
    phase: 'debrief',
    decorationOnly: false,
    side: 'top',
    waitForElementMs: 1800,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.sol1.sol1-debrief-brief.title',
    bodyKey: 'onboarding.sol1.sol1-debrief-brief.body',
    testEvent: 'onboarding:test:sol1-debrief-brief',
    isCompleted: (state) => state.clock.sol >= 2 && state.clock.phase !== 'debrief',
  },
];

export const MOON_SOL1_STEP_IDS: readonly string[] = MOON_SOL1_TOUR_STEPS.map((step) => step.stepId);

export function getTourStepById(stepId: string | null | undefined): TourStepDefinition | null {
  if (!stepId) return null;
  return MOON_SOL1_TOUR_STEPS.find((step) => step.stepId === stepId) ?? null;
}

export function getTourStepIndex(stepId: string | null | undefined): number {
  if (!stepId) return -1;
  return MOON_SOL1_TOUR_STEPS.findIndex((step) => step.stepId === stepId);
}

export function getNextTourStepId(stepId: string | null | undefined): string | null {
  const index = getTourStepIndex(stepId);
  if (index < 0 || index >= MOON_SOL1_TOUR_STEPS.length - 1) return null;
  return MOON_SOL1_TOUR_STEPS[index + 1].stepId;
}

export function getPreviousTourStepId(stepId: string | null | undefined): string | null {
  const index = getTourStepIndex(stepId);
  if (index <= 0) return null;
  return MOON_SOL1_TOUR_STEPS[index - 1].stepId;
}
