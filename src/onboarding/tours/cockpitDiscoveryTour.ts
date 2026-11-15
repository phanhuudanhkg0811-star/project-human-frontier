import { TOUR_TARGET_IDS } from '../targets.ts';
import type { TourStepDefinition } from '../types.ts';

export const COCKPIT_DISCOVERY_STEPS: readonly TourStepDefinition[] = [
  {
    stepId: 'cockpit-context',
    targetId: TOUR_TARGET_IDS.COCKPIT_WINDOW,
    fallbackTargetId: TOUR_TARGET_IDS.TELEMETRY_BAR,
    phase: 'any',
    decorationOnly: false,
    side: 'bottom',
    waitForElementMs: 1200,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.cockpit.cockpit-context.title',
    bodyKey: 'onboarding.cockpit.cockpit-context.body',
    testEvent: 'onboarding:test:cockpit-context',
  },
  {
    stepId: 'cockpit-stats',
    targetId: TOUR_TARGET_IDS.TELEMETRY_BAR,
    fallbackTargetId: TOUR_TARGET_IDS.TELEMETRY_DONKI,
    phase: 'any',
    decorationOnly: false,
    side: 'bottom',
    waitForElementMs: 1200,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.cockpit.cockpit-stats.title',
    bodyKey: 'onboarding.cockpit.cockpit-stats.body',
    testEvent: 'onboarding:test:cockpit-stats',
  },
  {
    stepId: 'cockpit-crew',
    targetId: TOUR_TARGET_IDS.COCKPIT_CREW_STAGE,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_CREW,
    phase: 'any',
    decorationOnly: false,
    side: 'top',
    waitForElementMs: 1200,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.cockpit.cockpit-crew.title',
    bodyKey: 'onboarding.cockpit.cockpit-crew.body',
    testEvent: 'onboarding:test:cockpit-crew',
  },
  {
    stepId: 'cockpit-systems-fab',
    targetId: TOUR_TARGET_IDS.COCKPIT_FABRICATOR,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_SYSTEMS,
    phase: 'any',
    decorationOnly: false,
    side: 'right',
    waitForElementMs: 1200,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.cockpit.cockpit-systems-fab.title',
    bodyKey: 'onboarding.cockpit.cockpit-systems-fab.body',
    testEvent: 'onboarding:test:cockpit-systems-fab',
  },
  {
    stepId: 'cockpit-crew-panel',
    targetId: TOUR_TARGET_IDS.CREW_ASSIGNMENT,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_CREW,
    phase: 'any',
    decorationOnly: false,
    side: 'top',
    waitForElementMs: 1500,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.cockpit.cockpit-crew-panel.title',
    bodyKey: 'onboarding.cockpit.cockpit-crew-panel.body',
    testEvent: 'onboarding:test:cockpit-crew-panel',
  },
  {
    stepId: 'cockpit-briefing-panel',
    targetId: TOUR_TARGET_IDS.WEATHER_STATUS,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_BRIEFING,
    phase: 'any',
    decorationOnly: false,
    side: 'bottom',
    waitForElementMs: 1500,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.cockpit.cockpit-briefing-panel.title',
    bodyKey: 'onboarding.cockpit.cockpit-briefing-panel.body',
    testEvent: 'onboarding:test:cockpit-briefing-panel',
  },
  {
    stepId: 'cockpit-systems-panel',
    targetId: TOUR_TARGET_IDS.SYSTEMS_PANEL,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_SYSTEMS,
    phase: 'any',
    decorationOnly: false,
    side: 'right',
    waitForElementMs: 1500,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.cockpit.cockpit-systems-panel.title',
    bodyKey: 'onboarding.cockpit.cockpit-systems-panel.body',
    testEvent: 'onboarding:test:cockpit-systems-panel',
  },
  {
    stepId: 'cockpit-fabricator-panel',
    targetId: TOUR_TARGET_IDS.COCKPIT_FABRICATOR,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_SYSTEMS,
    phase: 'any',
    decorationOnly: false,
    side: 'right',
    waitForElementMs: 1500,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.cockpit.cockpit-fabricator-panel.title',
    bodyKey: 'onboarding.cockpit.cockpit-fabricator-panel.body',
    testEvent: 'onboarding:test:cockpit-fabricator-panel',
  },
  {
    stepId: 'cockpit-comms-rover',
    targetId: TOUR_TARGET_IDS.OPEN_COMMS,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_ROVER,
    phase: 'any',
    decorationOnly: false,
    side: 'left',
    waitForElementMs: 1500,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.cockpit.cockpit-comms-rover.title',
    bodyKey: 'onboarding.cockpit.cockpit-comms-rover.body',
    testEvent: 'onboarding:test:cockpit-comms-rover',
  },
  {
    stepId: 'cockpit-rover-panel',
    targetId: TOUR_TARGET_IDS.OPEN_ROVER,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_COMMS,
    phase: 'any',
    decorationOnly: false,
    side: 'left',
    waitForElementMs: 1500,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.cockpit.cockpit-rover-panel.title',
    bodyKey: 'onboarding.cockpit.cockpit-rover-panel.body',
    testEvent: 'onboarding:test:cockpit-rover-panel',
  },
  {
    stepId: 'cockpit-console-cta',
    targetId: TOUR_TARGET_IDS.PRIMARY_PHASE_CTA,
    fallbackTargetId: TOUR_TARGET_IDS.OPEN_END_SOL,
    phase: 'any',
    decorationOnly: false,
    side: 'top',
    waitForElementMs: 1200,
    allowContinueWithoutAction: true,
    titleKey: 'onboarding.cockpit.cockpit-console-cta.title',
    bodyKey: 'onboarding.cockpit.cockpit-console-cta.body',
    testEvent: 'onboarding:test:cockpit-console-cta',
  },
];

export const COCKPIT_DISCOVERY_STEP_IDS: readonly string[] = COCKPIT_DISCOVERY_STEPS.map(
  (step) => step.stepId
);

export function getCockpitStepById(stepId: string | null | undefined): TourStepDefinition | null {
  if (!stepId) return null;
  return COCKPIT_DISCOVERY_STEPS.find((step) => step.stepId === stepId) ?? null;
}

export function getNextCockpitStepId(stepId: string | null | undefined): string | null {
  if (!stepId) return null;
  const idx = COCKPIT_DISCOVERY_STEPS.findIndex((step) => step.stepId === stepId);
  if (idx < 0 || idx >= COCKPIT_DISCOVERY_STEPS.length - 1) return null;
  return COCKPIT_DISCOVERY_STEPS[idx + 1].stepId;
}
