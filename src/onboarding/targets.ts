import type { TourTargetId } from './types.ts';

export const TOUR_TARGET_IDS = {
  TITLE_NEW_MISSION: 'title-new-mission',
  TITLE_CONTINUE: 'title-continue',
  TITLE_HOW_TO_PLAY: 'title-how-to-play',
  TELEMETRY_BAR: 'telemetry-bar',
  COCKPIT_WINDOW: 'cockpit-window',
  COCKPIT_CREW_STAGE: 'cockpit-crew-stage',
  COCKPIT_FABRICATOR: 'cockpit-fabricator',
  OPEN_BRIEFING: 'open-briefing',
  WEATHER_STATUS: 'weather-status',
  TELEMETRY_DONKI: 'telemetry-donki',
  EVENT_CHOICE: 'event-choice',
  STARLOG_CONFIRM: 'starlog-confirm',
  OPEN_CREW: 'open-crew',
  CREW_ASSIGNMENT: 'crew-assignment',
  OPEN_SYSTEMS: 'open-systems',
  SYSTEMS_PANEL: 'systems-panel',
  OPEN_COMMS: 'open-comms',
  OPEN_ROVER: 'open-rover',
  OPEN_END_SOL: 'open-end-sol',
  PRIMARY_PHASE_CTA: 'primary-phase-cta',
  RESOURCE_FORECAST: 'resource-forecast',
  END_SOL: 'end-sol',
  DEBRIEF_BRIEF: 'debrief-brief',
  HUD_TUTORIAL_TRIGGER: 'hud-tutorial-trigger',
} as const satisfies Record<string, TourTargetId>;

export const COCKPIT_DISCOVERY_TARGET_IDS: readonly TourTargetId[] = [
  TOUR_TARGET_IDS.COCKPIT_WINDOW,
  TOUR_TARGET_IDS.TELEMETRY_BAR,
  TOUR_TARGET_IDS.COCKPIT_CREW_STAGE,
  TOUR_TARGET_IDS.COCKPIT_FABRICATOR,
];

export const ALL_TOUR_TARGET_IDS: readonly TourTargetId[] = [
  TOUR_TARGET_IDS.TITLE_NEW_MISSION,
  TOUR_TARGET_IDS.TITLE_CONTINUE,
  TOUR_TARGET_IDS.TITLE_HOW_TO_PLAY,
  TOUR_TARGET_IDS.OPEN_BRIEFING,
  TOUR_TARGET_IDS.WEATHER_STATUS,
  TOUR_TARGET_IDS.TELEMETRY_DONKI,
  TOUR_TARGET_IDS.EVENT_CHOICE,
  TOUR_TARGET_IDS.STARLOG_CONFIRM,
  TOUR_TARGET_IDS.OPEN_CREW,
  TOUR_TARGET_IDS.CREW_ASSIGNMENT,
  TOUR_TARGET_IDS.OPEN_SYSTEMS,
  TOUR_TARGET_IDS.SYSTEMS_PANEL,
  TOUR_TARGET_IDS.OPEN_COMMS,
  TOUR_TARGET_IDS.OPEN_ROVER,
  TOUR_TARGET_IDS.OPEN_END_SOL,
  TOUR_TARGET_IDS.PRIMARY_PHASE_CTA,
  TOUR_TARGET_IDS.RESOURCE_FORECAST,
  TOUR_TARGET_IDS.END_SOL,
  TOUR_TARGET_IDS.DEBRIEF_BRIEF,
  TOUR_TARGET_IDS.HUD_TUTORIAL_TRIGGER,
];

export function tourSelector(targetId: TourTargetId): string {
  return `[data-tour="${targetId}"]`;
}

export const TOUR_SELECTORS: Readonly<Record<TourTargetId, string>> = Object.freeze({
  'title-new-mission': '[data-tour="title-new-mission"]',
  'title-continue': '[data-tour="title-continue"]',
  'title-how-to-play': '[data-tour="title-how-to-play"]',
  'telemetry-bar': '[data-tour="telemetry-bar"]',
  'cockpit-window': '[data-tour="cockpit-window"]',
  'cockpit-crew-stage': '[data-tour="cockpit-crew-stage"]',
  'cockpit-fabricator': '[data-tour="cockpit-fabricator"]',
  'open-briefing': '[data-tour="open-briefing"]',
  'weather-status': '[data-tour="weather-status"]',
  'telemetry-donki': '[data-tour="telemetry-donki"]',
  'event-choice': '[data-tour="event-choice"]',
  'starlog-confirm': '[data-tour="starlog-confirm"]',
  'open-crew': '[data-tour="open-crew"]',
  'crew-assignment': '[data-tour="crew-assignment"]',
  'open-systems': '[data-tour="open-systems"]',
  'systems-panel': '[data-tour="systems-panel"]',
  'open-comms': '[data-tour="open-comms"]',
  'open-rover': '[data-tour="open-rover"]',
  'open-end-sol': '[data-tour="open-end-sol"]',
  'primary-phase-cta': '[data-tour="primary-phase-cta"]',
  'resource-forecast': '[data-tour="resource-forecast"]',
  'end-sol': '[data-tour="end-sol"]',
  'debrief-brief': '[data-tour="debrief-brief"]',
  'hud-tutorial-trigger': '[data-tour="hud-tutorial-trigger"]',
});

export function tourAttr(targetId: TourTargetId): { readonly 'data-tour': TourTargetId } {
  return { 'data-tour': targetId };
}
