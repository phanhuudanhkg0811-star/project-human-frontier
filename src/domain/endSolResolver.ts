import { buildDebriefContext, resolveExpiredEventAtEndSol } from './eventEngine.ts';
import { deriveRoll } from './prng.ts';
import { campaignReasonText, evaluateCampaign } from './campaignEvaluator.ts';
import {
  computeCrewWeatherRisk,
  computeRepairSuccessProb,
  computeRoverRiskProb,
  computeWeatherPowerPenalty,
  getSolWeather,
  selectStormTargets,
} from './spaceWeather.ts';
import type {
  CampaignConfig,
  ContentBundle,
  CrewCondition,
  CrewId,
  CrewMemberState,
  DonkiSolEntry,
  EquipmentCondition,
  EquipmentId,
  EquipmentItemState,
  FabricatorJob,
  GameState,
  HungerState,
  PowerConsumerId,
  SolSummary,
  SpaceWeatherOutcome,
  StationSystemState,
  SystemId,
} from '../types/index.ts';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Internal physics constants.
 *
 * These are deliberately NOT in balance.json: adding fields would change the
 * ContentBundle/BalanceConfig interface and therefore the save contract. They
 * are calibrated (not "realistic") so the 32-Sol envelope in
 * tests/phase-1-4-simulation.test.mjs still reaches victory.
 */
const BATTERY_SELF_DISCHARGE_PER_SOL = 0.002; // fraction of stored energy per Sol
const BATTERY_ROUND_TRIP_EFFICIENCY = 0.96; // applies only to net charging
const SOLAR_TEMP_DERATE_PER_C = 0.0015; // panel efficiency vs. ambient temperature
const SOLAR_TEMP_DERATE_MIN = 0.88;
const SOLAR_TEMP_DERATE_MAX = 1.02;
const SYSTEM_WEAR_BASE_PER_SOL = 0.003; // integrity lost per Sol to thermal cycling
const SYSTEM_WEAR_STORM_PER_INDEX = 0.01; // extra wear per unit hardwareStressIndex
const SYSTEM_WEAR_FLOOR = 0.05;
const SCRUBBER_O2_PENALTY = 0.15; // extra O2 consumption at zero scrubber integrity
const REPAIR_HEALTH_FLOOR = 0.75; // repair success multiplier at zero health
const REPAIR_HEALTH_WEIGHT = 0.25;
const CHRONIC_DOSE_FIRST_MGY = 25;
const CHRONIC_DOSE_SECOND_MGY = 60;
const CHRONIC_DOSE_FIRST_PENALTY = 0.5; // health per Sol
const CHRONIC_DOSE_SECOND_PENALTY = 1.0;
const ROVER_OPERATOR_HEALTH_WEIGHT = 0.25; // risk multiplier per missing health point
const LUNAR_CYCLE_SOLS = 28; // 14 Sol day + 14 Sol night in the Moon-32 campaign

function isLunarNightSol(sol: number, campaign: CampaignConfig): boolean {
  return sol >= campaign.milestones.lunarNight.startSol && sol <= campaign.milestones.lunarNight.endSol;
}

/**
 * Representative surface temperature for the Sol, from the Diviner-calibrated
 * airless-surface form T = night + (day - night) * max(0, sin el)^0.25.
 * The campaign window is a 28-Sol lunar cycle starting at sunrise.
 */
function computeSurfaceTempC(sol: number, bundle: ContentBundle): number {
  const thermal = bundle.catalog.environment.temperatureC;
  const phase = ((((sol - 1) % LUNAR_CYCLE_SOLS) + LUNAR_CYCLE_SOLS) % LUNAR_CYCLE_SOLS) / LUNAR_CYCLE_SOLS;
  const sunElevation = phase < 0.5 ? Math.sin(Math.PI * (phase / 0.5)) : 0;
  const surface = thermal.nightMinC + (thermal.dayMaxC - thermal.nightMinC) * Math.pow(sunElevation, 0.25);
  return round2(surface);
}

function deriveSystemStatus(integrity: number): StationSystemState['status'] {
  if (integrity >= 0.85) return 'nominal';
  if (integrity > 0) return 'degraded';
  return 'offline';
}

function deriveEquipmentCondition(durability: number): EquipmentCondition {
  if (durability > 50) return 'good';
  if (durability > 0) return 'worn';
  return 'damaged';
}

function deriveHungerState(satiety: number): HungerState {
  if (satiety <= 0) return 'starving';
  if (satiety <= 25) return 'hungry';
  return 'ok';
}

function deriveCrewCondition(health: number, prev: CrewCondition, fitThreshold: number, injuredThreshold: number): CrewCondition {
  if (health <= 0) return 'evacuated';
  if (health < injuredThreshold) return 'injured';
  if (prev === 'injured' && health < fitThreshold) return 'injured';
  return 'fit';
}

function applyCargoArrival(state: GameState, bundle: ContentBundle): { state: GameState; note: string | null } {
  const activeOrder = state.logistics.activeOrder;
  const currentSol = state.clock.sol;
  const nextCooldown = Math.max(0, state.logistics.padCooldownSols - 1);

  if (!activeOrder || activeOrder.arrivalSol > currentSol) {
    if (nextCooldown === state.logistics.padCooldownSols) return { state, note: null };
    return {
      state: { ...state, logistics: { ...state.logistics, padCooldownSols: nextCooldown } },
      note: null,
    };
  }

  let res = { ...state.resources };
  const s = bundle.balance.storages;
  const c = bundle.balance.consumables;
  for (const pack of bundle.balance.logistics.packs) {
    const count = activeOrder.slots[pack.id] ?? 0;
    if (count <= 0) continue;
    if (pack.grant.oxygenKg) res.oxygenKg = clamp(round2(res.oxygenKg + pack.grant.oxygenKg * count), 0, s.oxygenKg.max);
    if (pack.grant.waterL) res.waterL = clamp(round2(res.waterL + pack.grant.waterL * count), 0, s.waterL.max);
    if (pack.grant.batteryKWh) res.batteryKWh = clamp(round2(res.batteryKWh + pack.grant.batteryKWh * count), 0, s.batteryKWh.max);
    if (pack.grant.partsKg) res.partsKg = clamp(round2(res.partsKg + pack.grant.partsKg * count), 0, s.partsKg.max);
    if (pack.grant.mrePacks) res.mrePacks = clamp(res.mrePacks + pack.grant.mrePacks * count, 0, c.mrePacks.max);
    if (pack.grant.medkits) res.medkits = clamp(res.medkits + pack.grant.medkits * count, 0, c.medkits.max);
  }

  return {
    state: {
      ...state,
      resources: res,
      logistics: {
        ...state.logistics,
        activeOrder: null,
        padCooldownSols: bundle.balance.logistics.padCooldownSols,
      },
    },
    note: 'Tàu hàng tiếp tế từ Trái Đất đã hạ cánh an toàn.',
  };
}

function resolveRepairAndUpgradeTasks(
  state: GameState,
  weather: DonkiSolEntry,
  bundle: ContentBundle
): {
  systems: Readonly<Record<SystemId, StationSystemState>>;
  repairSuccessProb: number;
  repairRollOk: boolean;
  notes: string[];
} {
  const diffMult = bundle.campaign.difficultyProfiles[state.campaign.difficulty].weatherRiskMultiplier;
  const crewList = (['cmd', 'eng', 'doc', 'geo'] as const)
    .map((id) => state.crew[id])
    .filter((c) => c.condition !== 'evacuated' && c.assignedTask !== null);

  const repairWorkers = crewList.filter((c) => c.assignedTask?.type === 'repair-system' && c.assignedTask.targetSystemId);
  const upgradeWorkers = crewList.filter((c) => c.assignedTask?.type === 'upgrade-system' && c.assignedTask.targetSystemId);

  const baselineRepairProb = computeRepairSuccessProb(weather, bundle.balance, diffMult, {
    isAlexAssigned: repairWorkers.some((w) => w.id === 'eng'),
  });

  const systems: Record<SystemId, StationSystemState> = { ...state.systems };
  const notes: string[] = [];

  // Continuous wear: thermal cycling every Sol plus storm hardware stress.
  // Applied before repairs so a repaired system ends the Sol at full integrity.
  const wear =
    SYSTEM_WEAR_BASE_PER_SOL + weather.hardwareStressIndex * SYSTEM_WEAR_STORM_PER_INDEX;
  for (const systemId of ['solar', 'recycler', 'scrubber', 'airlock', 'fabricator'] as const) {
    const system = systems[systemId];
    if (system.integrity <= 0 || system.status === 'offline') continue;
    const integrity = clamp(round4(system.integrity - wear), SYSTEM_WEAR_FLOOR, 1);
    systems[systemId] = { ...system, integrity, status: deriveSystemStatus(integrity) };
  }

  let aggregatedProb = baselineRepairProb;
  let allRepairsSucceeded = true;

  if (repairWorkers.length > 0) {
    let probSum = 0;
    for (const worker of repairWorkers) {
      const sysId = worker.assignedTask!.targetSystemId!;
      const fitness = clamp(
        REPAIR_HEALTH_FLOOR + REPAIR_HEALTH_WEIGHT * (worker.health / 100),
        REPAIR_HEALTH_FLOOR,
        1
      );
      const baseProb = computeRepairSuccessProb(weather, bundle.balance, diffMult, {
        isAlexAssigned: worker.id === 'eng',
      });
      // Health degrades the *storm penalty*, not the quiet-Sol baseline, so a
      // healthy crew still completes routine repairs deterministically.
      const taskProb = clamp(1 - (1 - baseProb) / fitness, 0, 1);
      probSum += taskProb;
      const taskRoll = deriveRoll(state.campaign.seed, state.clock.sol, `repair:${worker.id}:${sysId}`);
      const ok = taskRoll <= taskProb;
      if (!ok) allRepairsSucceeded = false;

      const target = systems[sysId];
      const nextIntegrity = ok ? 1.0 : clamp(round2(target.integrity + 0.35), 0, 1);
      systems[sysId] = {
        ...target,
        integrity: nextIntegrity,
        status: nextIntegrity >= 0.85 ? 'nominal' : nextIntegrity > 0 ? 'degraded' : 'offline',
      };
      notes.push(
        ok
          ? `${worker.name} sửa ${sysId} hoàn chỉnh (${Math.round(nextIntegrity * 100)}%).`
          : `Bão hạt DONKI làm gián đoạn: ${worker.name} chỉ khắc phục được một phần ${sysId} (${Math.round(nextIntegrity * 100)}%).`
      );
    }
    aggregatedProb = Math.round((probSum / repairWorkers.length) * 10000) / 10000;
  }

  for (const worker of upgradeWorkers) {
    const sysId = worker.assignedTask!.targetSystemId!;
    const target = systems[sysId];
    if (target.level < bundle.balance.systems.maxLevel) {
      systems[sysId] = {
        ...target,
        level: (target.level + 1) as 1 | 2 | 3,
      };
      notes.push(`${worker.name} nâng cấp ${sysId} lên Cấp ${systems[sysId].level}.`);
    } else {
      notes.push(`${worker.name}: ${sysId} đã đạt cấp tối đa Lv${bundle.balance.systems.maxLevel}.`);
    }
  }

  return {
    systems,
    repairSuccessProb: aggregatedProb,
    repairRollOk: allRepairsSucceeded,
    notes,
  };
}

function finalizeFabricatorJob(
  state: GameState,
  job: FabricatorJob,
  bundle: ContentBundle
): {
  resources: GameState['resources'];
  equipment: Record<EquipmentId, EquipmentItemState>;
  note: string;
} {
  let resources = { ...state.resources };
  const equipment: Record<EquipmentId, EquipmentItemState> = { ...state.equipment };
  let note = `3D Fabricator hoàn tất ${job.action} ${job.itemId}.`;

  if (job.itemId === 'mre_pack') {
    if (job.action === 'craft') {
      resources = { ...resources, mrePacks: clamp(resources.mrePacks + 1, 0, bundle.balance.consumables.mrePacks.max) };
    }
    return { resources, equipment, note };
  }

  if (job.itemId === 'medkit') {
    if (job.action === 'craft') {
      resources = { ...resources, medkits: clamp(resources.medkits + 1, 0, bundle.balance.consumables.medkits.max) };
    } else if (job.action === 'upgrade') {
      resources = { ...resources, medkitLevel: 2 };
      note = '3D Fabricator đã nâng cấp công thức Medkit lên Cấp 2 (+50 Health).';
    }
    return { resources, equipment, note };
  }

  const eqId = job.itemId;
  const current = equipment[eqId];
  if (job.action === 'craft' || job.action === 'repair') {
    equipment[eqId] = { ...current, owned: true, durability: 100, state: 'good' };
  } else if (job.action === 'upgrade') {
    equipment[eqId] = { ...current, owned: true, level: 2 };
  } else if (job.action === 'recycle') {
    const recipe = bundle.recipes.items.find((r) => r.id === eqId);
    const refund = Math.ceil((recipe?.craftCost.partsKg ?? 2) * bundle.recipes.rules.recycleReturnRate);
    resources = {
      ...resources,
      partsKg: clamp(round2(resources.partsKg + refund), 0, bundle.balance.storages.partsKg.max),
    };
    equipment[eqId] = { ...current, owned: false, durability: 0, state: 'damaged', reservedForRover: false };
    note = `Đã tái chế ${eqId}, thu hồi +${refund} kg Phụ tùng.`;
  }

  return { resources, equipment, note };
}

function resolvePowerAndEclss(
  state: GameState,
  systems: Readonly<Record<SystemId, StationSystemState>>,
  weather: DonkiSolEntry,
  bundle: ContentBundle
): {
  resources: GameState['resources'];
  fabricatorCompleted: boolean;
  roverLaunchPowered: boolean;
  powerGeneratedKWh: number;
  powerConsumedKWh: number;
  unmetLoads: PowerConsumerId[];
  blackout: boolean;
  wrsRecoveredWaterL: number;
  wrsProcessedWasteWaterL: number;
  solarGeneratedKWh: number;
  fissionGeneratedKWh: number;
  batteryOverflowKWh: number;
  essentialUnmetKWh: number;
} {
  const sol = state.clock.sol;
  const isNight = isLunarNightSol(sol, bundle.campaign);
  const solarPenalty = computeWeatherPowerPenalty(weather, isNight);
  const solarSys = systems.solar;
  const baseSolar = bundle.balance.power.solarByLevelKWh[String(solarSys.level) as '1' | '2' | '3'];
  const ambientTempC = computeSurfaceTempC(sol, bundle);
  const thermalDerate = clamp(
    1 - SOLAR_TEMP_DERATE_PER_C * (ambientTempC - 25),
    SOLAR_TEMP_DERATE_MIN,
    SOLAR_TEMP_DERATE_MAX
  );
  const solarKWh = isNight
    ? 0
    : round2(baseSolar * solarSys.integrity * (1 - solarPenalty) * thermalDerate);
  const fissionKWh = bundle.balance.power.fissionKWhPerSol;
  const powerGeneratedKWh = round2(fissionKWh + solarKWh);

  let availableKWh = round2(state.resources.batteryKWh + powerGeneratedKWh);
  let consumedKWh = 0;
  const unmetLoads: PowerConsumerId[] = [];
  let blackout = false;
  const essentialUnmetKWh = Math.max(0, round2(bundle.balance.power.essentialLoadKWh - availableKWh));
  let wrsRan = false;
  let fabricatorRan = false;
  let roverLaunchPowered = false;

  const activeJob = state.fabricator.activeJob;
  const recycler = systems.recycler;
  const wrsCfg = bundle.balance.eclss.wrsByLevel[String(recycler.level) as '1' | '2' | '3'];
  const canRunWrs =
    state.dailyPlan.wrsEnabled &&
    state.resources.wasteWaterL > 0 &&
    recycler.integrity > 0 &&
    recycler.status !== 'offline';

  // Constitutional safety rule: Essential Life Support (eclss, 12 kWh) is ALWAYS protected & served FIRST.
  // Player powerPriority only governs load-shedding order among non-essential loads (wrs, fabricator, rover).
  const essentialNeed = bundle.balance.power.essentialLoadKWh;
  if (availableKWh + 1e-6 >= essentialNeed) {
    availableKWh = round2(availableKWh - essentialNeed);
    consumedKWh = round2(consumedKWh + essentialNeed);
  } else {
    consumedKWh = round2(consumedKWh + availableKWh);
    availableKWh = 0;
    blackout = true;
    unmetLoads.push('eclss');
  }

  for (const consumer of state.dailyPlan.powerPriority) {
    if (consumer === 'eclss') {
      continue;
    } else if (consumer === 'wrs' && canRunWrs) {
      if (availableKWh + 1e-6 >= wrsCfg.powerKWh) {
        availableKWh = round2(availableKWh - wrsCfg.powerKWh);
        consumedKWh = round2(consumedKWh + wrsCfg.powerKWh);
        wrsRan = true;
      } else {
        unmetLoads.push('wrs');
      }
    } else if (consumer === 'fabricator' && activeJob && systems.fabricator.status !== 'offline') {
      const need = activeJob.batteryReserved;
      if (systems.fabricator.integrity < 0.35) {
        unmetLoads.push('fabricator');
      } else if (availableKWh + 1e-6 >= need) {
        availableKWh = round2(availableKWh - need);
        consumedKWh = round2(consumedKWh + need);
        fabricatorRan = true;
      } else {
        unmetLoads.push('fabricator');
      }
    } else if (consumer === 'rover' && state.rover.activeMission?.status === 'scheduled') {
      const expedition = bundle.campaign.expeditions.find(
        (entry) => entry.id === state.rover.activeMission?.expeditionId
      );
      const launchOperator = state.crew[state.rover.activeMission.launchOperatorCrewId];
      const operatorReady =
        launchOperator.condition === 'fit' &&
        launchOperator.hungerState !== 'starving' &&
        launchOperator.morale >= bundle.balance.crew.tiredBelowMorale &&
        (launchOperator.assignedTask === null || launchOperator.assignedTask.type === 'rover-operate');
      const need = expedition?.launchPowerKWh ?? 0;
      if (operatorReady && availableKWh + 1e-6 >= need) {
        availableKWh = round2(availableKWh - need);
        consumedKWh = round2(consumedKWh + need);
        roverLaunchPowered = true;
      } else {
        unmetLoads.push('rover');
      }
    }
  }

  const s = bundle.balance.storages;
  const startBatteryKWh = state.resources.batteryKWh;
  let storedKWh = availableKWh;
  if (storedKWh > startBatteryKWh) {
    // Only the net charge is subject to round-trip losses; discharge losses are
    // already represented by the load ledger.
    storedKWh = startBatteryKWh + (storedKWh - startBatteryKWh) * BATTERY_ROUND_TRIP_EFFICIENCY;
  }
  const nextBattery = round2(
    clamp(storedKWh * (1 - BATTERY_SELF_DISCHARGE_PER_SOL), 0, s.batteryKWh.max)
  );

  const livingCrewCount = Object.values(state.crew).filter((c) => c.condition !== 'evacuated').length;
  const airlockLeak =
    systems.airlock.integrity < 1
      ? round2(bundle.balance.eclss.airlockDegradedLeakO2Kg * (1 - systems.airlock.integrity))
      : 0;
  const scrubberPenalty = 1 + SCRUBBER_O2_PENALTY * (1 - systems.scrubber.integrity);
  const oxygenUse = round2(
    (livingCrewCount * bundle.balance.eclss.oxygenKgPerCrewPerSol + airlockLeak) * scrubberPenalty
  );
  const nextOxygen = clamp(round2(state.resources.oxygenKg - oxygenUse), 0, s.oxygenKg.max);

  const waterUse = round2(livingCrewCount * bundle.balance.eclss.waterLPerCrewPerSol);
  const processedWaste = wrsRan ? Math.min(state.resources.wasteWaterL, wrsCfg.maxBatchL) : 0;
  const wrsRecoveredWaterL = Math.round(
    processedWaste * wrsCfg.recoveryRate * clamp(systems.recycler.integrity, 0, 1) * 10
  ) / 10;
  const nextWater = clamp(round2(state.resources.waterL - waterUse + wrsRecoveredWaterL), 0, s.waterL.max);

  const newGreywater = round2(livingCrewCount * bundle.balance.eclss.wasteWaterGeneratedPerCrewPerSol);
  const nextWasteWater = clamp(
    round2(state.resources.wasteWaterL - processedWaste + newGreywater),
    0,
    s.wasteWaterL.max
  );

  return {
    resources: {
      ...state.resources,
      batteryKWh: nextBattery,
      oxygenKg: nextOxygen,
      waterL: nextWater,
      wasteWaterL: nextWasteWater,
    },
    fabricatorCompleted: Boolean(activeJob && fabricatorRan),
    roverLaunchPowered,
    powerGeneratedKWh,
    powerConsumedKWh: consumedKWh,
    unmetLoads,
    blackout,
    wrsRecoveredWaterL,
    wrsProcessedWasteWaterL: processedWaste,
    solarGeneratedKWh: solarKWh,
    fissionGeneratedKWh: fissionKWh,
    batteryOverflowKWh: Math.max(0, round2(availableKWh - s.batteryKWh.max)),
    essentialUnmetKWh,
  };
}

function resolveCrewAndWeather(
  state: GameState,
  systems: Record<SystemId, StationSystemState>,
  resourcesIn: GameState['resources'],
  blackout: boolean,
  weather: DonkiSolEntry,
  bundle: ContentBundle
): {
  crew: Record<CrewId, CrewMemberState>;
  resources: GameState['resources'];
  systems: Record<SystemId, StationSystemState>;
  radiationDoseMgy: number;
  stormDegradedSystem: SystemId | null;
  notes: string[];
} {
  let resources = { ...resourcesIn };
  const nextSystems = { ...systems };
  const notes: string[] = [];
  const diffMult = bundle.campaign.difficultyProfiles[state.campaign.difficulty].weatherRiskMultiplier;

  const crewRisk = computeCrewWeatherRisk(
    weather,
    bundle.balance,
    diffMult,
    nextSystems.airlock.level,
    nextSystems.airlock.integrity,
    state.equipment.dust_shield.owned && state.equipment.dust_shield.durability > 0
  );

  const nextCrew: Record<CrewId, CrewMemberState> = { ...state.crew };
  const medicDoingCare =
    nextCrew.doc.condition !== 'evacuated' && nextCrew.doc.assignedTask?.type === 'medical-care';
  const careTargetId = nextCrew.doc.assignedTask?.targetCrewId;

  const radRoll = deriveRoll(state.campaign.seed, state.clock.sol, 'crew-rad');
  const radBurnTriggered = radRoll < crewRisk.stormInjuryProb;
  if (radBurnTriggered) {
    notes.push('Cảnh báo DONKI SEP/X-Flare: Phi hành đoàn chịu ảnh hưởng bức xạ mức cao (-8 Health).');
  }

  let stormDegradedSystem: SystemId | null = null;
  const sysRoll = deriveRoll(state.campaign.seed, state.clock.sol, 'sys-storm');
  if (sysRoll < crewRisk.stormSystemDegradeProb) {
    stormDegradedSystem = selectStormTargets(state.campaign.seed, state.clock.sol);
    const targetSys = nextSystems[stormDegradedSystem];
    const nextIntegrity = clamp(round2(targetSys.integrity - 0.2), 0, 1);
    nextSystems[stormDegradedSystem] = {
      ...targetSys,
      integrity: nextIntegrity,
      status: nextIntegrity >= 0.85 ? 'nominal' : nextIntegrity > 0 ? 'degraded' : 'offline',
    };
    notes.push(`Xung kích DONKI IPS/CME làm suy giảm nhẹ hệ thống ${stormDegradedSystem}.`);
  }

  for (const crewId of ['cmd', 'eng', 'doc', 'geo'] as const) {
    const member = nextCrew[crewId];
    if (member.condition === 'evacuated') {
      nextCrew[crewId] = { ...member, assignedTask: null };
      continue;
    }

    let health = member.health;
    let morale = member.morale;
    let satiety = member.satiety;
    let radiationMgy = round2(member.radiationMgy + crewRisk.radiationDoseMgy);

    // MRE consumption
    if (state.dailyPlan.mreTargets.includes(crewId) && resources.mrePacks > 0) {
      resources = { ...resources, mrePacks: resources.mrePacks - 1 };
      satiety = clamp(satiety + bundle.balance.consumables.mrePacks.satietyRestore, 0, 100);
    }

    // Crew task rest / medical-care
    if (member.assignedTask?.type === 'rest') {
      morale = clamp(morale + bundle.balance.crew.restMoraleGain, 0, 100);
      health = clamp(health + bundle.balance.crew.restHealthGain, 0, 100);
    }
    if (medicDoingCare && careTargetId === crewId) {
      morale = clamp(morale + bundle.balance.crew.medicalCareMoraleGain, 0, 100);
      health = clamp(health + bundle.balance.crew.medicalCareHealthGain, 0, 100);
    }

    // Daily hunger drain & penalties
    satiety = clamp(satiety - bundle.balance.crew.satietyDrainPerSol, 0, 100);
    const hungerState = deriveHungerState(satiety);
    if (hungerState === 'hungry') {
      morale = clamp(morale + bundle.balance.crew.hungryMoraleDelta, 0, 100);
    } else if (hungerState === 'starving') {
      health = clamp(health + bundle.balance.crew.starvingHealthDelta, 0, 100);
      morale = clamp(morale + bundle.balance.crew.starvingMoraleDelta, 0, 100);
    }

    if (blackout) {
      health = clamp(health + bundle.balance.power.blackoutPenalty.healthDelta, 0, 100);
      morale = clamp(morale + bundle.balance.power.blackoutPenalty.moraleDelta, 0, 100);
    }

    if (crewRisk.stormMoralePenalty !== 0) {
      const immune = member.id === 'cmd' && member.assignedTask?.type === 'emergency-response';
      if (!immune) {
        morale = clamp(morale + crewRisk.stormMoralePenalty, 0, 100);
      }
    }
    const chronicPenalty =
      radiationMgy >= CHRONIC_DOSE_SECOND_MGY
        ? CHRONIC_DOSE_SECOND_PENALTY
        : radiationMgy >= CHRONIC_DOSE_FIRST_MGY
          ? CHRONIC_DOSE_FIRST_PENALTY
          : 0;
    if (chronicPenalty > 0) {
      health = clamp(health - chronicPenalty, 0, 100);
    }
    if (radBurnTriggered) {
      health = clamp(health - 8, 0, 100);
    }

    const condition = deriveCrewCondition(
      health,
      member.condition,
      bundle.balance.crew.fitRecoverAtHealth,
      bundle.balance.crew.injuredBelowHealth
    );

    nextCrew[crewId] = {
      ...member,
      health,
      morale,
      satiety,
      hungerState,
      condition,
      radiationMgy,
      assignedTask: null,
    };
  }

  return {
    crew: nextCrew,
    resources,
    systems: nextSystems,
    radiationDoseMgy: crewRisk.radiationDoseMgy,
    stormDegradedSystem,
    notes,
  };
}

function resolveRoverTick(
  state: GameState,
  resourcesIn: GameState['resources'],
  weather: DonkiSolEntry,
  bundle: ContentBundle,
  roverLaunchPowered: boolean
): {
  rover: GameState['rover'];
  equipment: Record<EquipmentId, EquipmentItemState>;
  resources: GameState['resources'];
  sciencePoints: number;
  roverIncidentProb: number;
  roverIncidentTriggered: boolean;
  note: string | null;
} {
  const equipment: Record<EquipmentId, EquipmentItemState> = { ...state.equipment };
  let resources = { ...resourcesIn };
  const mission = state.rover.activeMission;

  if (!mission || mission.status === 'completed' || mission.status === 'failed') {
    return {
      rover: state.rover,
      equipment,
      resources,
      sciencePoints: state.campaign.sciencePoints,
      roverIncidentProb: 0,
      roverIncidentTriggered: false,
      note: null,
    };
  }

  const exp = bundle.campaign.expeditions.find((e) => e.id === mission.expeditionId);
  if (!exp) {
    return {
      rover: state.rover,
      equipment,
      resources,
      sciencePoints: state.campaign.sciencePoints,
      roverIncidentProb: 0,
      roverIncidentTriggered: false,
      note: 'Không tìm thấy expedition config cho nhiệm vụ Rover đang hoạt động.',
    };
  }

  const releaseEquipment = (wear: number) => {
    for (const eqId of mission.equippedItems) {
      const prev = equipment[eqId];
      const nextDur = clamp(prev.durability - wear, 0, 100);
      equipment[eqId] = {
        ...prev,
        durability: nextDur,
        state: deriveEquipmentCondition(nextDur),
        reservedForRover: false,
      };
    }
  };

  const settle = (
    outcome: 'completed' | 'failed',
    note: string,
    wear: number,
    settlementMission = mission
  ) => {
    const alreadySettled = state.rover.missionHistory.some((result) => result.expeditionId === settlementMission.expeditionId);
    if (alreadySettled) {
      return {
        rover: state.rover,
        equipment,
        resources,
        sciencePoints: state.campaign.sciencePoints,
        roverIncidentProb: 0,
        roverIncidentTriggered: false,
        note: null,
      };
    }

    releaseEquipment(wear);
    if (outcome === 'completed') {
      const caps = bundle.balance.storages;
      resources = {
        ...resources,
        partsKg: clamp(round2(resources.partsKg + exp.rewards.partsKg), 0, caps.partsKg.max),
        oxygenKg: clamp(round2(resources.oxygenKg + exp.rewards.oxygenKg), 0, caps.oxygenKg.max),
        waterL: clamp(round2(resources.waterL + exp.rewards.waterL), 0, caps.waterL.max),
        batteryKWh: clamp(round2(resources.batteryKWh + exp.rewards.batteryKWh), 0, caps.batteryKWh.max),
      };
    }

    const terminalMission = { ...settlementMission, status: outcome, statusEnteredSol: state.clock.sol } as const;
    const result = {
      expeditionId: settlementMission.expeditionId,
      outcome,
      launchedSol: settlementMission.launchedSol,
      settledSol: state.clock.sol,
      rewardSampleGranted: outcome === 'completed' ? exp.rewardSample : null,
      scienceGranted: outcome === 'completed' ? exp.rewards.science : 0,
      launchOperatorCrewId: settlementMission.launchOperatorCrewId,
      recoveryOperatorCrewId: settlementMission.recoveryOperatorCrewId,
      equippedItems: settlementMission.equippedItems,
      incidents: settlementMission.incidents,
    } as const;

    return {
      rover: {
        activeMission: terminalMission,
        missionHistory: [...state.rover.missionHistory, result],
      },
      equipment,
      resources,
      sciencePoints: state.campaign.sciencePoints + result.scienceGranted,
      roverIncidentProb: 0,
      roverIncidentTriggered: false,
      note,
    };
  };

  if (mission.status === 'scheduled') {
    if (!roverLaunchPowered) {
      const incidents = mission.incidents.some(
        (incident) => incident.kind === 'power-delay' && incident.occurredSol === state.clock.sol
      )
        ? mission.incidents
        : [
            ...mission.incidents,
            {
              kind: 'power-delay' as const,
              occurredSol: state.clock.sol,
              summary: 'Power ledger không cấp đủ 4 kWh hoặc người trực phóng không sẵn sàng.',
            },
          ];
      if (state.clock.sol >= exp.windowEndSol) {
        const failedMission = { ...mission, incidents };
        return settle(
          'failed',
          `Cửa sổ ${exp.name} đã đóng trước khi Rover nhận đủ điều kiện phóng.`,
          0,
          failedMission
        );
      }
      return {
        rover: { ...state.rover, activeMission: { ...mission, incidents } },
        equipment,
        resources,
        sciencePoints: state.campaign.sciencePoints,
        roverIncidentProb: 0,
        roverIncidentTriggered: false,
        note: 'Thiếu điện hoặc người trực: lịch phóng Rover được giữ sang Sol kế tiếp.',
      };
    }

    return {
      rover: {
        ...state.rover,
        activeMission: {
          ...mission,
          status: 'outbound',
          launchedSol: state.clock.sol,
          statusEnteredSol: state.clock.sol,
          expectedReturnSol: state.clock.sol + 2,
          travelTicksCompleted: 1,
        },
      },
      equipment,
      resources,
      sciencePoints: state.campaign.sciencePoints,
      roverIncidentProb: 0,
      roverIncidentTriggered: false,
      note: `Rover đã được cấp ${exp.launchPowerKWh} kWh và rời trạm tới ${exp.name}.`,
    };
  }

  if (mission.status === 'signal-lost') {
    const lostSols = mission.signalLostSols + 1;
    if (lostSols >= 2) {
      const incidents = [
        ...mission.incidents,
        { kind: 'signal-timeout' as const, occurredSol: state.clock.sol, summary: 'Mất tín hiệu quá 2 Sol.' },
      ];
      const timedOutState = {
        ...state,
        rover: { ...state.rover, activeMission: { ...mission, signalLostSols: lostSols, incidents } },
      };
      const timedOutMission = timedOutState.rover.activeMission!;
      releaseEquipment(75);
      return {
        rover: {
          activeMission: { ...timedOutMission, status: 'failed', statusEnteredSol: state.clock.sol },
          missionHistory: [
            ...state.rover.missionHistory,
            {
              expeditionId: mission.expeditionId,
              outcome: 'failed',
              launchedSol: mission.launchedSol,
              settledSol: state.clock.sol,
              rewardSampleGranted: null,
              scienceGranted: 0,
              launchOperatorCrewId: mission.launchOperatorCrewId,
              recoveryOperatorCrewId: mission.recoveryOperatorCrewId,
              equippedItems: mission.equippedItems,
              incidents,
            },
          ],
        },
        equipment,
        resources,
        sciencePoints: state.campaign.sciencePoints,
        roverIncidentProb: 0,
        roverIncidentTriggered: false,
        note: 'Rover mất tín hiệu quá 2 Sol; nhiệm vụ thất bại và thiết bị được thu hồi ở trạng thái hư hao.',
      };
    }
    return {
      rover: { ...state.rover, activeMission: { ...mission, signalLostSols: lostSols } },
      equipment,
      resources,
      sciencePoints: state.campaign.sciencePoints,
      roverIncidentProb: 0,
      roverIncidentTriggered: false,
      note: `Rover vẫn mất tín hiệu (${lostSols}/2 Sol).`,
    };
  }

  const isEligibleRecoveryCrew = (crewId: CrewId): boolean => {
    const crew = state.crew[crewId];
    return (
      crew.condition === 'fit' &&
      crew.hungerState !== 'starving' &&
      crew.morale >= bundle.balance.crew.tiredBelowMorale &&
      (crew.assignedTask === null || crew.assignedTask.type === 'rover-operate')
    );
  };

  if (mission.status === 'recovery-pending') {
    const selected = mission.recoveryOperatorCrewId;
    const recoveryCrewId = selected && isEligibleRecoveryCrew(selected)
      ? selected
      : (Object.keys(state.crew) as CrewId[]).find(isEligibleRecoveryCrew) ?? null;
    if (recoveryCrewId) {
      const recoveryMission = { ...mission, recoveryOperatorCrewId: recoveryCrewId };
      const wear = recoveryCrewId === 'geo' ? 25 : 50;
      return settle(
        'completed',
        `Rover đã thu hồi trễ bởi ${state.crew[recoveryCrewId].name}; nhận ${exp.rewardSample}.`,
        wear,
        recoveryMission
      );
    }
    const incidents = [
      ...mission.incidents,
      { kind: 'recovery-timeout' as const, occurredSol: state.clock.sol, summary: 'Không có crew đủ điều kiện sau một grace Sol.' },
    ];
    releaseEquipment(75);
    return {
      rover: {
        activeMission: { ...mission, status: 'failed', statusEnteredSol: state.clock.sol, recoveryDelaySols: 1, incidents },
        missionHistory: [
          ...state.rover.missionHistory,
          {
            expeditionId: mission.expeditionId,
            outcome: 'failed',
            launchedSol: mission.launchedSol,
            settledSol: state.clock.sol,
            rewardSampleGranted: null,
            scienceGranted: 0,
            launchOperatorCrewId: mission.launchOperatorCrewId,
            recoveryOperatorCrewId: null,
            equippedItems: mission.equippedItems,
            incidents,
          },
        ],
      },
      equipment,
      resources,
      sciencePoints: state.campaign.sciencePoints,
      roverIncidentProb: 0,
      roverIncidentTriggered: false,
      note: 'Không có crew thu hồi sau một grace Sol; nhiệm vụ thất bại an toàn.',
    };
  }

  const diffMult = bundle.campaign.difficultyProfiles[state.campaign.difficulty].weatherRiskMultiplier;
  const threatBlocked = exp.mitigationOptions.some(
    (option) =>
      option.allOf.every(
        (required) => mission.equippedItems.includes(required) && equipment[required].durability > 0
      ) &&
      (option.requirements?.minBatteryKWh === undefined || resources.batteryKWh >= option.requirements.minBatteryKWh)
  );

  const savedBySol7Boost =
    mission.expeditionId === 'regolith-field' && Boolean(state.events.flags.sol7_saved_rover);
  const operatorHealth = state.crew[mission.launchOperatorCrewId]?.health ?? 100;
  const operatorRiskFactor = clamp(
    1 + ROVER_OPERATOR_HEALTH_WEIGHT * (1 - operatorHealth / 100),
    1,
    1.25
  );
  const roverIncidentProb = savedBySol7Boost
    ? 0
    : round4(
        clamp(
          computeRoverRiskProb(weather, bundle.balance, diffMult, {
            threatBlocked,
            isElenaOperating:
              mission.launchOperatorCrewId === 'geo' || mission.recoveryOperatorCrewId === 'geo',
          }) * operatorRiskFactor,
          0.005,
          0.92
        )
      );
  const roll = deriveRoll(state.campaign.seed, state.clock.sol, `rover-hazard:${mission.expeditionId}`);
  const roverIncidentTriggered = !savedBySol7Boost && roll < roverIncidentProb;

  if (roverIncidentTriggered) {
    const incident = {
      kind: threatBlocked ? 'donki-storm' as const : 'unmitigated-threat' as const,
      occurredSol: state.clock.sol,
      summary: threatBlocked ? 'Nhiễu DONKI làm mất liên lạc Rover.' : `Hiểm họa ${exp.threat} không được khắc chế.`,
    };
    return {
      rover: {
        ...state.rover,
        activeMission: {
          ...mission,
          status: 'signal-lost',
          statusEnteredSol: state.clock.sol,
          signalLostSols: 0,
          resumeStatus: mission.status,
          incidents: [...mission.incidents, incident],
        },
      },
      equipment,
      resources,
      sciencePoints: state.campaign.sciencePoints,
      roverIncidentProb,
      roverIncidentTriggered,
      note: incident.summary,
    };
  }

  const nextTicks = mission.travelTicksCompleted + 1;
  if (nextTicks < exp.durationSols) {
    return {
      rover: {
        ...state.rover,
        activeMission: { ...mission, status: 'exploring', statusEnteredSol: state.clock.sol, travelTicksCompleted: nextTicks },
      },
      equipment,
      resources,
      sciencePoints: state.campaign.sciencePoints,
      roverIncidentProb,
      roverIncidentTriggered,
      note: null,
    };
  }

  const selected = mission.recoveryOperatorCrewId;
  const recoveryCrewId = selected && isEligibleRecoveryCrew(selected)
    ? selected
    : (Object.keys(state.crew) as CrewId[]).find(isEligibleRecoveryCrew) ?? null;
  if (!recoveryCrewId) {
    return {
      rover: {
        ...state.rover,
        activeMission: {
          ...mission,
          status: 'recovery-pending',
          statusEnteredSol: state.clock.sol,
          travelTicksCompleted: nextTicks,
          recoveryDelaySols: 1,
        },
      },
      equipment,
      resources,
      sciencePoints: state.campaign.sciencePoints,
      roverIncidentProb,
      roverIncidentTriggered,
      note: 'Rover đã tới điểm thu hồi nhưng chưa có crew đủ điều kiện; bắt đầu grace Sol.',
    };
  }

  const completedMission = { ...mission, recoveryOperatorCrewId: recoveryCrewId, travelTicksCompleted: nextTicks };
  const wear = recoveryCrewId === 'geo' ? 25 : 50;
  releaseEquipment(wear);
  resources = {
    ...resources,
    partsKg: clamp(round2(resources.partsKg + exp.rewards.partsKg), 0, bundle.balance.storages.partsKg.max),
    oxygenKg: clamp(round2(resources.oxygenKg + exp.rewards.oxygenKg), 0, bundle.balance.storages.oxygenKg.max),
    waterL: clamp(round2(resources.waterL + exp.rewards.waterL), 0, bundle.balance.storages.waterL.max),
    batteryKWh: clamp(round2(resources.batteryKWh + exp.rewards.batteryKWh), 0, bundle.balance.storages.batteryKWh.max),
  };
  return {
    rover: {
      activeMission: { ...completedMission, status: 'completed', statusEnteredSol: state.clock.sol },
      missionHistory: [
        ...state.rover.missionHistory,
        {
          expeditionId: mission.expeditionId,
          outcome: 'completed',
          launchedSol: mission.launchedSol,
          settledSol: state.clock.sol,
          rewardSampleGranted: exp.rewardSample,
          scienceGranted: exp.rewards.science,
          launchOperatorCrewId: mission.launchOperatorCrewId,
          recoveryOperatorCrewId: recoveryCrewId,
          equippedItems: mission.equippedItems,
          incidents: mission.incidents,
        },
      ],
    },
    equipment,
    resources,
    sciencePoints: state.campaign.sciencePoints + exp.rewards.science,
    roverIncidentProb,
    roverIncidentTriggered,
    note: `Rover hoàn tất "${exp.name}"; ${state.crew[recoveryCrewId].name} thu hồi ${exp.rewardSample}.`,
  };
}

function pickBriefId(weather: DonkiSolEntry, isNight: boolean, wrsRecovered: number, bundle: ContentBundle): string {
  const byTag = (tag: string) => bundle.briefs.find((b) => b.tags.includes(tag))?.id;
  if (weather.level === 'storm' || weather.level === 'extreme') {
    return byTag('donki-storm') ?? bundle.briefs[0].id;
  }
  if (isNight) {
    return byTag('lunar-night') ?? bundle.briefs[0].id;
  }
  if (wrsRecovered > 0) {
    return byTag('wrs') ?? bundle.briefs[0].id;
  }
  return byTag('baseline') ?? bundle.briefs[0].id;
}

export interface ResolveSolOutput {
  readonly nextState: GameState;
  readonly summary: SolSummary;
}

/**
 * Single authoritative End-Sol & Forecast resolver.
 * Both `commit` (advancing a Sol) and `preview` (Resource Predictor UI / 5-Sol trend) execute this exact function.
 */
export function resolveSol(
  state: GameState,
  bundle: ContentBundle,
  mode: 'commit' | 'preview'
): ResolveSolOutput {
  const expiredOut = resolveExpiredEventAtEndSol(state, bundle);
  const workingState = expiredOut.state;
  const sol = workingState.clock.sol;
  const weather = getSolWeather(
    bundle.donki,
    workingState.campaign.donkiProfileId,
    sol,
    workingState.campaign.spaceWeatherOverride
  );
  const isNight = isLunarNightSol(sol, bundle.campaign);
  const surfaceTempC = computeSurfaceTempC(sol, bundle);
  const startRes = state.resources;

  // Tier 1: Cargo arrival + crew engineering repairs/upgrades
  const afterCargo = applyCargoArrival(workingState, bundle);
  const repairOut = resolveRepairAndUpgradeTasks(afterCargo.state, weather, bundle);

  // Tier 2: Power grid load shedding + ECLSS + WRS
  const eclssOut = resolvePowerAndEclss(afterCargo.state, repairOut.systems, weather, bundle);

  // Fabricator progression using Tier 2 power confirmation
  let nextResources = eclssOut.resources;
  let nextEquipment: Record<EquipmentId, EquipmentItemState> = { ...workingState.equipment };
  let nextFabricator = workingState.fabricator;
  const fabNotes: string[] = [];
  if (workingState.fabricator.activeJob && eclssOut.fabricatorCompleted) {
    const remaining = workingState.fabricator.activeJob.solsRemaining - 1;
    if (remaining <= 0) {
      const done = finalizeFabricatorJob(
        { ...afterCargo.state, resources: nextResources, equipment: nextEquipment },
        workingState.fabricator.activeJob,
        bundle
      );
      nextResources = done.resources;
      nextEquipment = done.equipment;
      nextFabricator = { usedThisSol: false, activeJob: null };
      fabNotes.push(done.note);
    } else {
      nextFabricator = {
        usedThisSol: false,
        activeJob: { ...workingState.fabricator.activeJob, solsRemaining: remaining },
      };
    }
  } else if (!workingState.fabricator.activeJob) {
    nextFabricator = { usedThisSol: false, activeJob: null };
  } else {
    nextFabricator = { usedThisSol: false, activeJob: workingState.fabricator.activeJob };
    fabNotes.push('Thiếu điện: 3D Fabricator tạm hoãn chu kỳ in sang Sol kế tiếp.');
  }

  // Tier 3: Rationing + Crew FSM + DONKI crew/system risks
  const crewOut = resolveCrewAndWeather(
    afterCargo.state,
    { ...repairOut.systems },
    nextResources,
    eclssOut.blackout,
    weather,
    bundle
  );
  nextResources = crewOut.resources;

  // Tier 4: Rover tick + DONKI rover risk
  const roverCrew = Object.fromEntries(
    (Object.keys(crewOut.crew) as CrewId[]).map((id) => [
      id,
      { ...crewOut.crew[id], assignedTask: afterCargo.state.crew[id].assignedTask },
    ])
  ) as Record<CrewId, CrewMemberState>;
  const roverOut = resolveRoverTick(
    { ...afterCargo.state, crew: roverCrew, equipment: nextEquipment },
    nextResources,
    weather,
    bundle,
    eclssOut.roverLaunchPowered
  );
  nextResources = roverOut.resources;
  nextEquipment = roverOut.equipment;

  // Tier 5: Victory / Defeat streaks
  const oxygenZeroStreak = nextResources.oxygenKg <= 0 ? nextResources.oxygenZeroStreak + 1 : 0;
  const waterZeroStreak = nextResources.waterL <= 0 ? nextResources.waterZeroStreak + 1 : 0;
  nextResources = { ...nextResources, oxygenZeroStreak, waterZeroStreak };

  const outcome = evaluateCampaign({ ...workingState, resources: nextResources, crew: crewOut.crew, rover: roverOut.rover }, bundle.campaign, sol);
  const campaignStatus = outcome.status;
  const endReason = campaignReasonText(outcome.reasonCode, bundle.campaign);

  const highlights: string[] = [
    ...(expiredOut.expiredNote ? [expiredOut.expiredNote] : []),
    ...(afterCargo.note ? [afterCargo.note] : []),
    ...repairOut.notes,
    ...fabNotes,
    ...crewOut.notes,
    ...(roverOut.note ? [roverOut.note] : []),
  ];

  const weatherOutcome: SpaceWeatherOutcome = {
    profileId: workingState.campaign.donkiProfileId,
    solDate: weather.date,
    level: weather.level,
    solarPenaltyPct: computeWeatherPowerPenalty(weather, isNight),
    radiationRiskIndex: weather.radiationRiskIndex,
    commsNoiseIndex: weather.commsNoiseIndex,
    hardwareStressIndex: weather.hardwareStressIndex,
    repairSuccessProb: repairOut.repairSuccessProb,
    repairRollOk: repairOut.repairRollOk,
    roverIncidentProb: roverOut.roverIncidentProb,
    roverIncidentTriggered: roverOut.roverIncidentTriggered,
    radiationDoseMgy: crewOut.radiationDoseMgy,
    stormDegradedSystem: crewOut.stormDegradedSystem,
    headline: weather.notifications.headline,
  };

  const baseBriefId = pickBriefId(weather, isNight, eclssOut.wrsRecoveredWaterL, bundle);
  const summaryWithoutContext: Omit<SolSummary, 'debriefContext'> = {
    checkpoint: {
      resources: nextResources, crew: crewOut.crew, systems: crewOut.systems,
      completedExpeditions: roverOut.rover.missionHistory.filter((mission) => mission.outcome === 'completed').length,
      sciencePoints: roverOut.sciencePoints,
      wrsProcessedWasteWaterL: eclssOut.wrsProcessedWasteWaterL,
      solarGeneratedKWh: eclssOut.solarGeneratedKWh, fissionGeneratedKWh: eclssOut.fissionGeneratedKWh,
      batteryOverflowKWh: eclssOut.batteryOverflowKWh, essentialUnmetKWh: eclssOut.essentialUnmetKWh,
    },
    sol,
    isLunarNight: isNight,
    surfaceTempC,
    powerGeneratedKWh: eclssOut.powerGeneratedKWh,
    powerConsumedKWh: eclssOut.powerConsumedKWh,
    unmetLoads: eclssOut.unmetLoads,
    blackout: eclssOut.blackout,
    wrsRecoveredWaterL: eclssOut.wrsRecoveredWaterL,
    resourceDeltas: {
      batteryKWh: round2(nextResources.batteryKWh - startRes.batteryKWh),
      oxygenKg: round2(nextResources.oxygenKg - startRes.oxygenKg),
      waterL: round2(nextResources.waterL - startRes.waterL),
      partsKg: round2(nextResources.partsKg - startRes.partsKg),
      mrePacks: nextResources.mrePacks - startRes.mrePacks,
      medkits: nextResources.medkits - startRes.medkits,
    },
    weather: weatherOutcome,
    briefId: baseBriefId,
    highlights,
  };

  const debriefContext = buildDebriefContext(workingState, nextResources, summaryWithoutContext, bundle);
  const summary: SolSummary = {
    ...summaryWithoutContext,
    briefId: debriefContext.briefId,
    debriefContext,
  };

  const isTerminal = campaignStatus === 'victory' || campaignStatus === 'defeat';

  const nextState: GameState = {
    ...workingState,
    revision: mode === 'commit' ? state.revision + 1 : state.revision,
    campaign: {
      ...workingState.campaign,
      status: campaignStatus,
      outcome,
      sciencePoints: roverOut.sciencePoints,
      endReason,
    },
    clock: {
      sol: workingState.clock.sol,
      phase: isTerminal ? 'terminal' : 'debrief',
      resolutionIndex: mode === 'commit' ? state.clock.resolutionIndex + 1 : state.clock.resolutionIndex,
    },
    resources: nextResources,
    systems: crewOut.systems,
    crew: crewOut.crew,
    equipment: nextEquipment,
    fabricator: nextFabricator,
    rover: roverOut.rover,
    logistics: afterCargo.state.logistics,
    debrief: {
      pendingDismiss: !isTerminal,
      lastSummary: summary,
    },
    history:
      mode === 'commit'
        ? {
            summaries: [...state.history.summaries, summary],
            logs: [
              ...state.history.logs,
              ...(expiredOut.expiredNote
                ? [
                    {
                      sol,
                      phase: 'rationing' as const,
                      code: 'EVENT_EXPIRED',
                      message: expiredOut.expiredNote,
                    },
                  ]
                : []),
              {
                sol,
                phase: 'debrief' as const,
                code: 'SOL_RESOLVED',
                message: `Kết thúc Sol ${sol}: Pin ${nextResources.batteryKWh} kWh, O₂ ${nextResources.oxygenKg} kg, Nước ${nextResources.waterL} L.`,
              },
            ],
          }
        : state.history,
  };

  return { nextState, summary };
}
