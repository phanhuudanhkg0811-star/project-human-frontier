import type {
  GameState,
  PowerConsumerId,
  RoverMissionResult,
  SystemId,
} from '../types/index.ts';

export interface DebriefPowerBalance {
  readonly generatedKWh: number;
  readonly consumedKWh: number;
  readonly solarKWh: number | null;
  readonly fissionKWh: number | null;
  readonly batteryOverflowKWh: number | null;
  readonly essentialUnmetKWh: number | null;
  readonly wrsRecoveredL: number;
  readonly wrsProcessedL: number | null;
  readonly blackout: boolean;
  readonly unmetLoads: readonly PowerConsumerId[];
}

export interface DebriefAlertBadge {
  readonly id: string;
  readonly tone: 'critical' | 'warning' | 'info' | 'positive';
  readonly labelKey: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface RichDebriefBreakdown {
  readonly sol: number;
  readonly power: DebriefPowerBalance;
  readonly alerts: readonly DebriefAlertBadge[];
  readonly hasAnomalies: boolean;
  readonly stormDegradedSystem: SystemId | null;
  readonly roverIncidentTriggered: boolean;
  readonly repairRollOk: boolean | null;
  readonly roverSettledToday: readonly RoverMissionResult[];
  readonly crewNeedingCareCount: number;
  readonly crewStarvingCount: number;
  readonly priorityHighlights: readonly string[];
  readonly allHighlights: readonly string[];
  readonly hasExtraDetails: boolean;
}

/**
 * Pure presentation selector summarizing resolved Sol telemetry for NightCutsceneModal.
 * Keeps quiet Sols uncluttered while surfacing power load shedding, DONKI damage,
 * rover outcomes, and unclipped highlights when anomalies happen.
 */
export function selectRichDebriefBreakdown(state: GameState): RichDebriefBreakdown | null {
  const summary = state.debrief.lastSummary;
  if (!summary) return null;

  const checkpoint = summary.checkpoint;
  const crewList = Object.values(checkpoint?.crew ?? state.crew);
  const crewNeedingCareCount = crewList.filter(
    (c) => c.condition === 'injured'
  ).length;
  const crewStarvingCount = crewList.filter(
    (c) => c.condition !== 'evacuated' && c.hungerState === 'starving'
  ).length;

  const roverSettledToday = state.rover.missionHistory.filter(
    (entry) => entry.settledSol === summary.sol
  );

  const alerts: DebriefAlertBadge[] = [];

  if (summary.blackout) {
    alerts.push({
      id: 'blackout',
      tone: 'critical',
      labelKey: 'night.alert.blackout',
    });
  } else if (summary.unmetLoads.length > 0) {
    alerts.push({
      id: 'load-shed',
      tone: 'warning',
      labelKey: 'night.alert.loadShed',
      params: { loads: summary.unmetLoads.map((id) => id.toUpperCase()).join(', ') },
    });
  }

  if (summary.weather.stormDegradedSystem) {
    alerts.push({
      id: 'storm-damage',
      tone: 'warning',
      labelKey: 'night.alert.stormDamage',
      params: { system: summary.weather.stormDegradedSystem.toUpperCase() },
    });
  }

  if (summary.weather.repairRollOk === false) {
    alerts.push({
      id: 'repair-fail',
      tone: 'warning',
      labelKey: 'night.alert.repairFail',
    });
  }

  if (summary.weather.roverIncidentTriggered) {
    alerts.push({
      id: 'rover-incident',
      tone: 'warning',
      labelKey: 'night.alert.roverIncident',
    });
  }

  for (const mission of roverSettledToday) {
    alerts.push({
      id: `rover-${mission.expeditionId}`,
      tone: mission.outcome === 'completed' ? 'positive' : 'critical',
      labelKey:
        mission.outcome === 'completed'
          ? 'night.alert.roverCompleted'
          : 'night.alert.roverFailed',
      params: { id: mission.expeditionId },
    });
  }

  if (crewStarvingCount > 0) {
    alerts.push({
      id: 'crew-starving',
      tone: 'critical',
      labelKey: 'night.alert.crewStarving',
      params: { count: crewStarvingCount },
    });
  } else if (crewNeedingCareCount > 0) {
    alerts.push({
      id: 'crew-care',
      tone: 'warning',
      labelKey: 'night.alert.crewCare',
      params: { count: crewNeedingCareCount },
    });
  }

  const allHighlights = summary.highlights;
  const priorityHighlights = allHighlights.slice(0, 3);
  const hasAnomalies = alerts.length > 0 || allHighlights.length > 3;

  return {
    sol: summary.sol,
    power: {
      generatedKWh: summary.powerGeneratedKWh,
      consumedKWh: summary.powerConsumedKWh,
      solarKWh: checkpoint ? checkpoint.solarGeneratedKWh : null,
      fissionKWh: checkpoint ? checkpoint.fissionGeneratedKWh : null,
      batteryOverflowKWh: checkpoint ? checkpoint.batteryOverflowKWh : null,
      essentialUnmetKWh: checkpoint ? checkpoint.essentialUnmetKWh : null,
      wrsRecoveredL: summary.wrsRecoveredWaterL,
      wrsProcessedL: checkpoint ? checkpoint.wrsProcessedWasteWaterL : null,
      blackout: summary.blackout,
      unmetLoads: summary.unmetLoads,
    },
    alerts,
    hasAnomalies,
    stormDegradedSystem: summary.weather.stormDegradedSystem,
    roverIncidentTriggered: summary.weather.roverIncidentTriggered,
    repairRollOk: summary.weather.repairRollOk,
    roverSettledToday,
    crewNeedingCareCount,
    crewStarvingCount,
    priorityHighlights,
    allHighlights,
    hasExtraDetails:
      allHighlights.length > 3 ||
      alerts.length > 0 ||
      checkpoint !== null,
  };
}
