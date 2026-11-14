import { resolveSol } from './endSolResolver.ts';
import {
  computeCrewWeatherRisk,
  computeRepairSuccessProb,
  computeRoverRiskProb,
  computeWeatherPowerPenalty,
  getSolWeather,
  type WeatherOutlook,
} from './spaceWeather.ts';
import type {
  ContentBundle,
  CrewId,
  CrewMemberState,
  ForecastPoint,
  GameState,
  Permission,
  SolSummary,
  SystemId,
} from '../types/index.ts';

/** List crew members eligible for tasks today (excludes evacuated). */
export function selectAvailableCrew(state: GameState): readonly CrewMemberState[] {
  return Object.values(state.crew).filter((c) => c.condition !== 'evacuated' && c.assignedTask === null);
}

/** Check whether the player can advance from the current phase to the next phase. */
export function selectCanAdvancePhase(state: GameState): Permission {
  if (state.campaign.status !== 'active') {
    return { allowed: false, code: 'E_PHASE_INVALID', message: 'Chiến dịch đã kết thúc.' };
  }
  if (state.clock.phase === 'briefing' && state.events.activeEventId !== null) {
    return { allowed: false, code: 'E_EVENT_PENDING', message: 'Hãy xử lý sự kiện Morning Briefing trước.' };
  }
  if (state.clock.phase === 'rationing' || state.clock.phase === 'debrief' || state.clock.phase === 'resolving') {
    return { allowed: false, code: 'E_PHASE_INVALID', message: 'Dùng nút Chốt ngày (End-Sol) hoặc Tiếp tục ở pha này.' };
  }
  return { allowed: true };
}

/** Check permission to assign a system repair task given resources & crew health. */
export function selectCanRepair(state: GameState, systemId: SystemId, bundle: ContentBundle): Permission {
  const sys = state.systems[systemId];
  if (sys.integrity >= 1.0) {
    return { allowed: false, code: 'E_SYSTEM_NOMINAL', message: 'Hệ thống đang hoạt động 100%.' };
  }
  if (state.resources.partsKg < bundle.balance.systems.repairPartsCost) {
    return {
      allowed: false,
      code: 'E_INSUFFICIENT_RESOURCE',
      message: `Cần ${bundle.balance.systems.repairPartsCost} kg Phụ tùng.`,
    };
  }
  const hasWorker = Object.values(state.crew).some((c) => c.condition === 'fit' && c.assignedTask === null);
  if (!hasWorker) {
    return { allowed: false, code: 'E_NO_FIT_CREW', message: 'Không có phi hành gia rảnh và Fit để sửa hệ thống.' };
  }
  return { allowed: true };
}

/** Explain all current blocking conditions before End-Sol or phase advance. */
export function selectBlockingReasons(state: GameState): readonly string[] {
  const reasons: string[] = [];
  if (state.clock.phase === 'briefing' && state.events.activeEventId !== null) {
    reasons.push('Chưa chọn phương án xử lý Sự kiện đầu ngày.');
  }
  if (state.clock.phase === 'debrief' && state.debrief.pendingDismiss) {
    reasons.push('Hãy xác nhận báo cáo End-Sol để sang ngày mới.');
  }
  const starvingCrew = Object.values(state.crew).filter((c) => c.condition !== 'evacuated' && c.hungerState === 'starving');
  if (starvingCrew.length > 0) {
    reasons.push(`Cảnh báo đói lả: ${starvingCrew.map((c) => c.name).join(', ')} cần phát MRE.`);
  }
  return reasons;
}

/** Resource Predictor for tonight — invokes the authoritative Pure TS End-Sol resolver in `preview` mode. */
export function selectResourceForecast(state: GameState, bundle: ContentBundle): SolSummary {
  return resolveSol(state, bundle, 'preview').summary;
}

/** Multi-Sol (up to 5 Sols) resource trend using repeated `preview` calls with zero side effects. */
export function selectFiveSolResourceTrend(state: GameState, bundle: ContentBundle, horizonSols = 5): readonly ForecastPoint[] {
  const points: ForecastPoint[] = [];
  let cursor = state;
  const maxSteps = Math.min(horizonSols, Math.max(0, state.campaign.targetSol - state.clock.sol + 1));

  for (let i = 0; i < maxSteps; i += 1) {
    const { nextState, summary } = resolveSol(cursor, bundle, 'preview');
    points.push({
      sol: summary.sol,
      batteryKWh: nextState.resources.batteryKWh,
      oxygenKg: nextState.resources.oxygenKg,
      waterL: nextState.resources.waterL,
      partsKg: nextState.resources.partsKg,
      isLunarNight: summary.isLunarNight,
      weatherLevel: summary.weather.level,
    });
    if (nextState.campaign.status !== 'active' || nextState.clock.sol >= nextState.campaign.targetSol) {
      break;
    }
    const nextSol = nextState.clock.sol + 1;
    cursor = {
      ...nextState,
      clock: { sol: nextSol, phase: 'rationing', resolutionIndex: nextState.clock.resolutionIndex },
      dailyPlan: {
        ...nextState.dailyPlan,
        sol: nextSol,
        status: 'draft',
        mreTargets: [],
        medkitTargets: [],
      },
    };
  }
  return points;
}

/** Expose current Sol NASA DONKI space weather probability outlook for HUD & Engineering previews. */
export function selectWeatherOutlook(state: GameState, bundle: ContentBundle, crewId?: CrewId): WeatherOutlook {
  const sol = state.clock.sol;
  const weather = getSolWeather(
    bundle.donki,
    state.campaign.donkiProfileId,
    sol,
    state.campaign.spaceWeatherOverride
  );
  const diffMult = bundle.campaign.difficultyProfiles[state.campaign.difficulty].weatherRiskMultiplier;
  const isNight = sol >= bundle.campaign.milestones.lunarNight.startSol && sol <= bundle.campaign.milestones.lunarNight.endSol;
  const repairSuccessProb = computeRepairSuccessProb(weather, bundle.balance, diffMult, {
    isAlexAssigned: crewId === 'eng' || state.crew.eng.assignedTask?.type === 'repair-system',
  });
  const roverIncidentProb = computeRoverRiskProb(weather, bundle.balance, diffMult, {
    threatBlocked: state.rover.equippedItems.length > 0,
    isElenaOperating: crewId === 'geo' || state.crew.geo.assignedTask?.type === 'rover-operate',
  });
  const crewWeatherRisk = computeCrewWeatherRisk(
    weather,
    bundle.balance,
    diffMult,
    state.systems.airlock.level,
    state.systems.airlock.integrity,
    state.equipment.dust_shield.owned && state.equipment.dust_shield.durability > 0
  );
  return {
    sol,
    date: weather.date,
    level: weather.level,
    repairSuccessProb,
    roverIncidentProb,
    crewWeatherRisk,
    solarPenaltyPct: computeWeatherPowerPenalty(weather, isNight),
    headline: weather.notifications.headline,
  };
}

/** Evaluate Moon 32 survival & expedition milestones for UI HUD/Progression panels. */
export function selectMissionProgress(state: GameState, bundle: ContentBundle) {
  const livingCrew = Object.values(state.crew).filter((c) => c.condition !== 'evacuated').length;
  const checks = [
    {
      id: 'sol-14-day',
      label: 'Vượt qua Ban ngày Mặt Trăng (Sol 1–14)',
      met: state.clock.sol > bundle.campaign.milestones.lunarDay.endSol || state.campaign.status === 'victory',
      currentText: `Sol ${state.clock.sol}`,
      targetText: 'Sol 15',
    },
    {
      id: 'sol-28-night',
      label: 'Sống sót qua Đêm Trăng (Sol 15–28)',
      met: state.clock.sol > bundle.campaign.milestones.lunarNight.endSol || state.campaign.status === 'victory',
      currentText: `Pin ${state.resources.batteryKWh} kWh`,
      targetText: 'Qua Sol 28',
    },
    {
      id: 'crew-alive',
      label: 'Duy trì tối thiểu 2 phi hành gia hoạt động',
      met: livingCrew >= bundle.campaign.victory.minActiveCrew,
      currentText: `${livingCrew}/4 người`,
      targetText: '≥ 2 người',
    },
    {
      id: 'samples-collected',
      label: 'Thu thập mẫu khoa học Rover',
      met: state.rover.samplesCollected.length >= 1,
      currentText: `${state.rover.samplesCollected.length}/3 mẫu`,
      targetText: '≥ 1 mẫu',
    },
    {
      id: 'target-sol-32',
      label: 'Chạm đích Chiến dịch Artemis (Sol 32)',
      met: state.campaign.status === 'victory',
      currentText: `Sol ${state.clock.sol}/32`,
      targetText: 'Sol 32',
    },
  ];
  return {
    targetSol: state.campaign.targetSol,
    isLunarNight:
      state.clock.sol >= bundle.campaign.milestones.lunarNight.startSol &&
      state.clock.sol <= bundle.campaign.milestones.lunarNight.endSol,
    livingCrew,
    checks,
  };
}
