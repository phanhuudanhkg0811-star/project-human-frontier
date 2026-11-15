import { selectNightReadiness } from '../domain/campaignSelectors.ts';
import {
  selectAvailableCrew,
  selectFiveSolResourceTrend,
  selectMitigationSatisfied,
  selectResourceForecast,
} from '../domain/selectors.ts';
import type {
  ContentBundle,
  EquipmentId,
  ForecastPoint,
  GameState,
  SolSummary,
} from '../types/index.ts';
import type {
  ContextualHintCategory,
  HintCtaPanel,
  TourTargetId,
} from './types.ts';

export interface HintEvaluationContext {
  readonly state: GameState;
  readonly bundle: ContentBundle;
  readonly getForecast: () => SolSummary;
  readonly getThreeSolTrend: () => readonly ForecastPoint[];
}

export interface HintMatchResult {
  readonly severityRank: number;
  readonly severityKey: string;
  readonly reasonKey?: string;
  readonly bodyKeyOverride?: string;
  readonly ctaPanelOverride?: HintCtaPanel;
  readonly ctaTargetOverride?: TourTargetId;
  readonly fallbackTargetOverride?: TourTargetId;
  readonly params: Readonly<Record<string, string | number>>;
}

export interface ContextualHintRule {
  readonly id: string;
  readonly category: ContextualHintCategory;
  readonly priority: number;
  readonly cooldownSols: number;
  readonly maxShows: number;
  readonly allowNeverRemindAgain: boolean;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly ctaTargetId: TourTargetId;
  readonly fallbackTargetId?: TourTargetId;
  readonly ctaPanel: HintCtaPanel;
  readonly ctaLabelKey: string;
  readonly evaluate: (ctx: HintEvaluationContext) => HintMatchResult | null;
}

export function parseSeverityRank(severityKey: string | undefined): number {
  if (!severityKey) return 0;
  const match = /^r(\d+):/.exec(severityKey);
  return match ? Number(match[1]) : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function getPriorSolSummary(state: GameState): SolSummary | null {
  const summary = state.debrief.lastSummary;
  if (!summary || summary.sol !== state.clock.sol - 1) return null;
  return summary;
}

const UNSORTED_HINT_RULES: readonly ContextualHintRule[] = [
  {
    id: 'hint-end-sol-critical',
    category: 'critical-safety',
    priority: 100,
    cooldownSols: 1,
    maxShows: 99,
    allowNeverRemindAgain: false,
    titleKey: 'hints.endSolCritical.title',
    bodyKey: 'hints.endSolCritical.body',
    ctaTargetId: 'open-end-sol',
    fallbackTargetId: 'primary-phase-cta',
    ctaPanel: 'end',
    ctaLabelKey: 'hints.cta.openEndSol',
    evaluate: ({ state, getForecast }) => {
      if (state.clock.phase !== 'rationing') return null;
      const forecast = getForecast();
      const nextRes = forecast.checkpoint?.resources;
      const nextO2 = nextRes ? nextRes.oxygenKg : round1(state.resources.oxygenKg + forecast.resourceDeltas.oxygenKg);
      const nextWater = nextRes ? nextRes.waterL : round1(state.resources.waterL + forecast.resourceDeltas.waterL);
      const nextBattery = nextRes ? nextRes.batteryKWh : round1(state.resources.batteryKWh + forecast.resourceDeltas.batteryKWh);

      if (nextO2 <= 0) {
        return {
          severityRank: 3,
          severityKey: 'r3:o2-zero',
          reasonKey: 'hints.reason.o2Worsened',
          params: { metric: 'O₂', value: `${nextO2} kg` },
        };
      }
      if (nextWater <= 0) {
        return {
          severityRank: 3,
          severityKey: 'r3:water-zero',
          reasonKey: 'hints.reason.waterWorsened',
          params: { metric: 'H₂O', value: `${nextWater} L` },
        };
      }
      if (forecast.blackout) {
        return {
          severityRank: 2,
          severityKey: 'r2:blackout',
          reasonKey: 'hints.reason.powerWorsened',
          params: { metric: 'ECLSS', value: `${nextBattery} kWh` },
        };
      }
      return null;
    },
  },
  {
    id: 'hint-resource-critical-forecast',
    category: 'critical-safety',
    priority: 95,
    cooldownSols: 1,
    maxShows: 99,
    allowNeverRemindAgain: false,
    titleKey: 'hints.resourceCritical.title',
    bodyKey: 'hints.resourceCritical.body',
    ctaTargetId: 'open-systems',
    fallbackTargetId: 'telemetry-bar',
    ctaPanel: 'menu',
    ctaLabelKey: 'hints.cta.openSystems',
    evaluate: ({ state, getThreeSolTrend }) => {
      if (state.clock.sol < 2) return null;
      const { oxygenKg, waterL, batteryKWh } = state.resources;
      if (oxygenKg <= 4.0) {
        return {
          severityRank: oxygenKg <= 2.0 ? 3 : 2,
          severityKey: oxygenKg <= 2.0 ? 'r3:o2-fatal' : 'r2:o2-low',
          reasonKey: 'hints.reason.o2Worsened',
          ctaPanelOverride: 'comms',
          ctaTargetOverride: 'open-comms',
          params: { metric: 'O₂', value: `${round1(oxygenKg)} kg` },
        };
      }
      if (waterL <= 6.0) {
        return {
          severityRank: waterL <= 3.0 ? 3 : 2,
          severityKey: waterL <= 3.0 ? 'r3:water-fatal' : 'r2:water-low',
          reasonKey: 'hints.reason.waterWorsened',
          params: { metric: 'H₂O', value: `${round1(waterL)} L` },
        };
      }
      if (batteryKWh <= 5.0) {
        return {
          severityRank: batteryKWh <= 2.0 ? 3 : 2,
          severityKey: batteryKWh <= 2.0 ? 'r3:bat-fatal' : 'r2:bat-low',
          reasonKey: 'hints.reason.powerWorsened',
          params: { metric: 'Battery', value: `${round1(batteryKWh)} kWh` },
        };
      }
      const trend = getThreeSolTrend();
      const deficitPoint = trend.find((p) => p.oxygenKg <= 0 || p.waterL <= 0 || p.batteryKWh <= 0);
      if (!deficitPoint) return null;
      const metric =
        deficitPoint.oxygenKg <= 0 ? 'O₂' : deficitPoint.waterL <= 0 ? 'H₂O' : 'Battery';
      return {
        severityRank: 1,
        severityKey: `r1:trend-${metric.toLowerCase()}`,
        params: { metric, value: `Sol ${deficitPoint.sol}` },
      };
    },
  },
  {
    id: 'hint-mandatory-event-deadline',
    category: 'critical-safety',
    priority: 90,
    cooldownSols: 1,
    maxShows: 6,
    allowNeverRemindAgain: false,
    titleKey: 'hints.eventDeadline.title',
    bodyKey: 'hints.eventDeadline.body',
    ctaTargetId: 'open-briefing',
    fallbackTargetId: 'primary-phase-cta',
    ctaPanel: 'starlog',
    ctaLabelKey: 'hints.cta.openBriefing',
    evaluate: ({ state, bundle }) => {
      const active = state.events.activeEvent;
      if (!active) return null;
      const def = bundle.events.find((e) => e.id === active.eventId);
      const solsLeft = Math.max(0, active.deadlineSol - state.clock.sol);
      const isMandatoryBriefing = Boolean(def?.mandatory && state.clock.phase === 'briefing');
      if (!isMandatoryBriefing && solsLeft > 1) return null;

      return {
        severityRank: solsLeft === 0 ? 2 : 1,
        severityKey: solsLeft === 0 ? 'r2:deadline-now' : 'r1:mandatory',
        reasonKey: 'hints.reason.deadlineCloser',
        params: { sol: active.deadlineSol, left: solsLeft },
      };
    },
  },
  {
    id: 'hint-aftermath-load-shed',
    category: 'debrief-followup',
    priority: 85,
    cooldownSols: 2,
    maxShows: 4,
    allowNeverRemindAgain: true,
    titleKey: 'hints.aftermathLoadShed.title',
    bodyKey: 'hints.aftermathLoadShed.body',
    ctaTargetId: 'open-systems',
    fallbackTargetId: 'open-end-sol',
    ctaPanel: 'menu',
    ctaLabelKey: 'hints.cta.openSystems',
    evaluate: ({ state, bundle }) => {
      const prev = getPriorSolSummary(state);
      if (!prev) return null;
      if (state.clock.sol === bundle.campaign.milestones.lunarNight.startSol) return null;
      if (!prev.blackout && prev.unmetLoads.length === 0) return null;
      const loads =
        prev.unmetLoads.length > 0
          ? prev.unmetLoads.map((id) => id.toUpperCase()).join(', ')
          : 'ECLSS';
      return {
        severityRank: prev.blackout ? 2 : 1,
        severityKey: prev.blackout ? 'r2:prev-blackout' : 'r1:prev-shed',
        params: { sol: prev.sol, loads },
      };
    },
  },
  {
    id: 'hint-sol15-first-night-loadshed',
    category: 'educational',
    priority: 82,
    cooldownSols: 1,
    maxShows: 1,
    allowNeverRemindAgain: true,
    titleKey: 'hints.sol15LoadShed.title',
    bodyKey: 'hints.sol15LoadShed.body',
    ctaTargetId: 'open-systems',
    fallbackTargetId: 'open-end-sol',
    ctaPanel: 'menu',
    ctaLabelKey: 'hints.cta.openSystems',
    evaluate: ({ state, bundle }) => {
      const nightStart = bundle.campaign.milestones.lunarNight.startSol;
      if (state.clock.sol !== nightStart || state.clock.sol < 2) return null;
      return {
        severityRank: 1,
        severityKey: 'r1:lunar-night',
        params: {
          sol: nightStart,
          endSol: bundle.campaign.milestones.lunarNight.endSol,
        },
      };
    },
  },
  {
    id: 'hint-sol13-14-night-readiness',
    category: 'workflow',
    priority: 80,
    cooldownSols: 1,
    maxShows: 2,
    allowNeverRemindAgain: true,
    titleKey: 'hints.nightReadiness.title',
    bodyKey: 'hints.nightReadiness.body',
    ctaTargetId: 'open-systems',
    fallbackTargetId: 'open-comms',
    ctaPanel: 'menu',
    ctaLabelKey: 'hints.cta.openSystems',
    evaluate: ({ state, bundle }) => {
      const nightStart = bundle.campaign.milestones.lunarNight.startSol;
      if (state.clock.sol < Math.max(2, nightStart - 2) || state.clock.sol >= nightStart) {
        return null;
      }
      const readiness = selectNightReadiness(state, bundle);
      if (readiness.warnings.length === 0) return null;
      return {
        severityRank: 1,
        severityKey: `r1:gap-${readiness.warnings.length}`,
        params: {
          count: readiness.warnings.length,
          nightSol: nightStart,
          solsLeft: nightStart - state.clock.sol,
        },
      };
    },
  },
  {
    id: 'hint-rover-attention',
    category: 'debrief-followup',
    priority: 75,
    cooldownSols: 2,
    maxShows: 4,
    allowNeverRemindAgain: true,
    titleKey: 'hints.roverAttention.title',
    bodyKey: 'hints.roverAttention.body',
    ctaTargetId: 'open-rover',
    fallbackTargetId: 'open-comms',
    ctaPanel: 'expedition',
    ctaLabelKey: 'hints.cta.openRover',
    evaluate: ({ state, bundle }): HintMatchResult | null => {
      const mission = state.rover.activeMission;
      if (mission?.status === 'signal-lost') {
        return {
          severityRank: 2,
          severityKey: 'r2:signal-lost',
          bodyKeyOverride: 'hints.roverAttention.bodySignalLost',
          params: { expedition: mission.expeditionId },
        };
      }

      const prev = getPriorSolSummary(state);
      if (prev?.weather.roverIncidentTriggered) {
        return {
          severityRank: 1,
          severityKey: 'r1:prev-incident',
          bodyKeyOverride: 'hints.roverAttention.bodyIncident',
          params: { sol: prev.sol },
        };
      }

      if (state.clock.phase === 'comms' && !mission) {
        const availableExp = bundle.campaign.expeditions.find(
          (exp) =>
            state.clock.sol >= exp.windowStartSol &&
            state.clock.sol <= exp.windowEndSol &&
            !state.rover.missionHistory.some((r) => r.expeditionId === exp.id)
        );
        if (!availableExp) return null;
        const ownedGear = (Object.keys(state.equipment) as EquipmentId[]).filter(
          (id) => state.equipment[id].owned && state.equipment[id].durability > 0
        );
        const gearReady = selectMitigationSatisfied(state, bundle, availableExp.id, ownedGear);
        const hasOp = selectAvailableCrew(state).length > 0;
        if (gearReady && hasOp) return null;
        return {
          severityRank: 1,
          severityKey: 'r1:rover-prep',
          params: { expedition: availableExp.name },
        };
      }

      return null;
    },
  },
  {
    id: 'hint-cargo-late-before-night',
    category: 'workflow',
    priority: 70,
    cooldownSols: 2,
    maxShows: 2,
    allowNeverRemindAgain: true,
    titleKey: 'hints.cargoLate.title',
    bodyKey: 'hints.cargoLate.body',
    ctaTargetId: 'open-comms',
    fallbackTargetId: 'primary-phase-cta',
    ctaPanel: 'comms',
    ctaLabelKey: 'hints.cta.openComms',
    evaluate: ({ state, bundle }) => {
      const lastSafeSol = bundle.campaign.milestones.recommendedLastCargoSol;
      const nightStart = bundle.campaign.milestones.lunarNight.startSol;
      if (state.clock.sol < lastSafeSol || state.clock.sol >= nightStart) return null;
      if (state.logistics.activeOrder !== null) return null;
      if (state.resources.oxygenKg >= 14 && state.resources.waterL >= 22) return null;

      return {
        severityRank: 1,
        severityKey: 'r1:cargo-window',
        params: {
          sol: state.clock.sol,
          transit: bundle.balance.logistics.transitSols,
          arrival: state.clock.sol + bundle.balance.logistics.transitSols,
        },
      };
    },
  },
  {
    id: 'hint-crew-unassigned-engineering',
    category: 'workflow',
    priority: 60,
    cooldownSols: 2,
    maxShows: 3,
    allowNeverRemindAgain: true,
    titleKey: 'hints.crewUnassigned.title',
    bodyKey: 'hints.crewUnassigned.body',
    ctaTargetId: 'open-crew',
    fallbackTargetId: 'primary-phase-cta',
    ctaPanel: 'character',
    ctaLabelKey: 'hints.cta.openCrew',
    evaluate: ({ state }) => {
      if (state.clock.sol < 2 || state.clock.phase !== 'engineering') return null;
      const freeCrew = selectAvailableCrew(state);
      if (freeCrew.length === 0) return null;

      const damagedSystem = Object.values(state.systems).some((s) => s.integrity < 0.85);
      const strainedCrew = Object.values(state.crew).some(
        (c) => c.condition !== 'evacuated' && (c.health < 75 || c.radiationMgy >= 30)
      );
      if (!damagedSystem && !strainedCrew) return null;

      return {
        severityRank: 1,
        severityKey: 'r1:idle-crew',
        params: { count: freeCrew.length },
      };
    },
  },
];

export const CONTEXTUAL_HINT_RULES: readonly ContextualHintRule[] = [...UNSORTED_HINT_RULES].sort(
  (a, b) => b.priority - a.priority
);

export function createHintEvalContext(
  state: GameState,
  bundle: ContentBundle
): HintEvaluationContext {
  let cachedForecast: SolSummary | null = null;
  let cachedTrend: readonly ForecastPoint[] | null = null;
  return {
    state,
    bundle,
    getForecast: () => {
      if (!cachedForecast) {
        cachedForecast = selectResourceForecast(state, bundle);
      }
      return cachedForecast;
    },
    getThreeSolTrend: () => {
      if (!cachedTrend) {
        cachedTrend = selectFiveSolResourceTrend(state, bundle, 3);
      }
      return cachedTrend;
    },
  };
}
