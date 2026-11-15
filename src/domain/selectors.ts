import eventsCatalogJson from '../data/events.json' with { type: 'json' };
import { resolveSol } from './endSolResolver.ts';
import {
  computeCrewWeatherRisk,
  computeRadLabSurfaceBaselineMgy,
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
  CrewTaskType,
  EquipmentId,
  ExpeditionId,
  ForecastPoint,
  GameState,
  Permission,
  RoverTimelineStage,
  SolSummary,
  SystemId,
} from '../types/index.ts';

/** List crew members eligible for tasks today (excludes evacuated). */
export function selectAvailableCrew(state: GameState): readonly CrewMemberState[] {
  return Object.values(state.crew).filter((c) => c.condition !== 'evacuated' && c.assignedTask === null);
}

/**
 * Mirror of the `crew/assign` reducer gate so the cockpit can disable a task
 * before a child clicks it and gets an error toast.
 */
export function selectCanAssignTask(
  state: GameState,
  crewId: CrewId,
  task: CrewTaskType,
  bundle: ContentBundle
): Permission {
  if (state.clock.phase !== 'engineering' && state.clock.phase !== 'comms') {
    return { allowed: false, code: 'E_PHASE_INVALID', message: 'Chỉ phân công trong pha Kỹ thuật hoặc Liên lạc.' };
  }
  const member = state.crew[crewId];
  if (member.condition === 'evacuated') {
    return { allowed: false, code: 'E_PLAN_INVALID', message: `${member.name} đã rời trạm.` };
  }
  if (member.assignedTask !== null) {
    return { allowed: false, code: 'E_PLAN_INVALID', message: `${member.name} đã nhận nhiệm vụ trong Sol này.` };
  }
  if (member.condition === 'injured' && task !== 'rest' && task !== 'medical-care') {
    return { allowed: false, code: 'E_PLAN_INVALID', message: `${member.name} đang bị thương, chỉ có thể Rest hoặc Medical Care.` };
  }
  const isTired = member.morale < bundle.balance.crew.tiredBelowMorale;
  if (isTired && (task === 'rover-operate' || task === 'emergency-response')) {
    return { allowed: false, code: 'E_PLAN_INVALID', message: `${member.name} đang mệt, không thể trực Rover hoặc xử lý khẩn cấp.` };
  }
  if (member.hungerState === 'starving' && task === 'rover-operate') {
    return { allowed: false, code: 'E_PLAN_INVALID', message: `${member.name} đang đói lả, bị cấm vận hành Rover.` };
  }
  return { allowed: true };
}

/** Mirror of the private `canOperateRover` engine rule used by schedule / recovery. */
export function selectCanOperateRover(state: GameState, crewId: CrewId, bundle: ContentBundle): boolean {
  const crew = state.crew[crewId];
  return (
    crew.condition === 'fit' &&
    crew.hungerState !== 'starving' &&
    crew.morale >= bundle.balance.crew.tiredBelowMorale &&
    crew.assignedTask === null
  );
}

export function selectCompletedExpeditions(state: GameState): readonly ExpeditionId[] {
  return state.rover.missionHistory
    .filter((result) => result.outcome === 'completed')
    .map((result) => result.expeditionId);
}

export function selectRoverSamples(state: GameState): readonly string[] {
  return state.rover.missionHistory.flatMap((result) =>
    result.outcome === 'completed' && result.rewardSampleGranted ? [result.rewardSampleGranted] : []
  );
}

export function selectRoverStatus(state: GameState): RoverTimelineStage {
  const status = state.rover.activeMission?.status;
  if (!status) return 'available';
  return status === 'recovery-pending' ? 'returning' : status;
}

export function selectRoverRemainingSols(state: GameState): number {
  const mission = state.rover.activeMission;
  if (!mission || mission.status === 'completed' || mission.status === 'failed') return 0;
  return Math.max(0, 3 - mission.travelTicksCompleted + mission.signalLostSols + mission.recoveryDelaySols);
}

export function selectRoverProgressPct(state: GameState): number {
  const mission = state.rover.activeMission;
  if (!mission) return 0;
  if (mission.status === 'completed') return 100;
  return Math.round((Math.min(3, mission.travelTicksCompleted) / 3) * 100);
}

export function selectRoverTimeline(state: GameState): readonly RoverTimelineStage[] {
  const current = selectRoverStatus(state);
  const base: RoverTimelineStage[] = ['available', 'scheduled', 'launching', 'outbound', 'exploring'];
  if (current === 'signal-lost') base.push('signal-lost');
  base.push('returning', current === 'failed' ? 'failed' : 'completed');
  return base;
}

export function selectMitigationSatisfied(
  state: GameState,
  bundle: ContentBundle,
  expeditionId: ExpeditionId,
  equipmentIds: readonly EquipmentId[]
): boolean {
  const expedition = bundle.campaign.expeditions.find((entry) => entry.id === expeditionId);
  return Boolean(
    expedition?.mitigationOptions.some(
      (option) =>
        option.allOf.every((id) => equipmentIds.includes(id)) &&
        (option.requirements?.minBatteryKWh === undefined ||
          state.resources.batteryKWh >= option.requirements.minBatteryKWh)
    )
  );
}

export function selectCanScheduleExpedition(
  state: GameState,
  bundle: ContentBundle,
  expeditionId: ExpeditionId
): Permission {
  const expedition = bundle.campaign.expeditions.find((entry) => entry.id === expeditionId);
  if (!expedition) return { allowed: false, code: 'E_EXPEDITION_UNKNOWN', message: 'Expedition không tồn tại.' };
  if (state.clock.phase !== 'comms') return { allowed: false, code: 'E_PHASE_INVALID', message: 'Cần ở pha Liên lạc.' };
  if (state.rover.activeMission) return { allowed: false, code: 'E_ROVER_BUSY', message: 'Rover đang bận.' };
  if (state.rover.missionHistory.some((result) => result.expeditionId === expeditionId)) {
    return { allowed: false, code: 'E_EXPEDITION_SETTLED', message: 'Expedition đã được giải quyết.' };
  }
  if (state.clock.sol < expedition.windowStartSol || state.clock.sol > expedition.windowEndSol) {
    return { allowed: false, code: 'E_WINDOW_CLOSED', message: `Cửa sổ Sol ${expedition.windowStartSol}-${expedition.windowEndSol}.` };
  }
  return { allowed: true };
}

function isActiveEventMandatory(state: GameState, bundle?: ContentBundle): boolean {
  const activeId = state.events.activeEventId;
  if (!activeId) return false;
  const fromBundle = bundle?.events.find((e) => e.id === activeId);
  if (fromBundle) return fromBundle.mandatory;
  const ctxMandatory = state.events.activeEvent?.context?.mandatory;
  if (typeof ctxMandatory === 'boolean') return ctxMandatory;
  const fromStatic = (eventsCatalogJson as ReadonlyArray<{ id: string; mandatory?: boolean }>).find(
    (e) => e.id === activeId
  );
  return fromStatic?.mandatory ?? true;
}

/** Check whether the player can advance from the current phase to the next phase. */
export function selectCanAdvancePhase(state: GameState, bundle?: ContentBundle): Permission {
  if (state.campaign.status !== 'active') {
    return { allowed: false, code: 'E_PHASE_INVALID', message: 'Chiến dịch đã kết thúc.' };
  }
  if (state.clock.phase === 'briefing' && isActiveEventMandatory(state, bundle)) {
    return { allowed: false, code: 'E_EVENT_PENDING', message: 'Hãy xử lý sự kiện Morning Briefing bắt buộc trước.' };
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
export function selectBlockingReasons(state: GameState, bundle?: ContentBundle): readonly string[] {
  const reasons: string[] = [];
  if (state.clock.phase === 'briefing' && isActiveEventMandatory(state, bundle)) {
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

function selectForecastMreTargets(state: GameState, bundle: ContentBundle): CrewId[] {
  const hungryAfterDrainAtOrBelow = bundle.balance.crew.satietyDrainPerSol + 25;
  return (Object.keys(state.crew) as CrewId[])
    .filter((crewId) => {
      const crew = state.crew[crewId];
      return crew.condition !== 'evacuated' && crew.satiety <= hungryAfterDrainAtOrBelow;
    })
    .sort((a, b) => state.crew[a].satiety - state.crew[b].satiety || a.localeCompare(b))
    .slice(0, state.resources.mrePacks);
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
      mrePacks: nextState.resources.mrePacks,
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
        mreTargets: selectForecastMreTargets(nextState, bundle),
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
    isEngineerAssigned: crewId === 'eng' || state.crew.eng.assignedTask?.type === 'repair-system',
  });
  const roverIncidentProb = computeRoverRiskProb(weather, bundle.balance, diffMult, {
    threatBlocked: state.rover.activeMission
      ? selectMitigationSatisfied(state, bundle, state.rover.activeMission.expeditionId, state.rover.activeMission.equippedItems)
      : false,
    isGeologistOperating: crewId === 'geo' || state.crew.geo.assignedTask?.type === 'rover-operate',
  });
  const crewWeatherRisk = computeCrewWeatherRisk(
    weather,
    bundle.balance,
    diffMult,
    state.systems.airlock.level,
    state.systems.airlock.integrity,
    state.equipment.dust_shield.owned && state.equipment.dust_shield.durability > 0,
    bundle.crewPhysiology
  );
  const radlabBaselineMgyPerSol = computeRadLabSurfaceBaselineMgy(
    bundle.crewPhysiology,
    bundle.balance.donkiProbability.radlabSurfaceScaleFactor
  );
  return {
    sol,
    date: weather.date,
    level: weather.level,
    repairSuccessProb,
    roverIncidentProb,
    crewWeatherRisk,
    radlabBaselineMgyPerSol,
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
      targetText: `Sol ${bundle.campaign.milestones.lunarNight.startSol}`,
    },
    {
      id: 'sol-28-night',
      label: 'Sống sót qua Đêm Trăng (Sol 15–28)',
      met: state.clock.sol > bundle.campaign.milestones.lunarNight.endSol || state.campaign.status === 'victory',
      currentText: `Pin ${state.resources.batteryKWh} kWh`,
      targetText: `Qua Sol ${bundle.campaign.milestones.lunarNight.endSol}`,
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
      met: selectRoverSamples(state).length >= 1,
      currentText: `${selectRoverSamples(state).length}/3 mẫu`,
      targetText: '≥ 1 mẫu',
    },
    {
      id: 'target-sol-32',
      label: 'Chạm đích Chiến dịch Artemis (Sol 32)',
      met: state.campaign.status === 'victory',
      currentText: `Sol ${state.clock.sol}/${bundle.campaign.targetSol}`,
      targetText: `Sol ${bundle.campaign.targetSol}`,
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
