import { deriveRoll } from './prng.ts';
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

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function isLunarNightSol(sol: number, campaign: CampaignConfig): boolean {
  return sol >= campaign.milestones.lunarNight.startSol && sol <= campaign.milestones.lunarNight.endSol;
}

function computeSurfaceTempC(sol: number, bundle: ContentBundle): number {
  const thermal = bundle.catalog.environment.temperatureC;
  const night = isLunarNightSol(sol, bundle.campaign);
  if (night) {
    const progress = (sol - bundle.campaign.milestones.lunarNight.startSol) / 13;
    const dip = Math.sin(progress * Math.PI);
    return round2(thermal.meanC + (thermal.nightMinC - thermal.meanC) * (0.6 + 0.4 * dip));
  }
  const dayLen = 14;
  const dayPhase = clamp((sol <= 14 ? sol : sol - 28) / dayLen, 0, 1);
  return round2(thermal.meanC + (thermal.dayMaxC - thermal.meanC) * (0.65 + 0.35 * Math.sin(dayPhase * Math.PI)));
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
  let aggregatedProb = baselineRepairProb;
  let allRepairsSucceeded = true;

  if (repairWorkers.length > 0) {
    let probSum = 0;
    for (const worker of repairWorkers) {
      const sysId = worker.assignedTask!.targetSystemId!;
      const taskProb = computeRepairSuccessProb(weather, bundle.balance, diffMult, {
        isAlexAssigned: worker.id === 'eng',
      });
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
  powerGeneratedKWh: number;
  powerConsumedKWh: number;
  unmetLoads: PowerConsumerId[];
  blackout: boolean;
  wrsRecoveredWaterL: number;
} {
  const sol = state.clock.sol;
  const isNight = isLunarNightSol(sol, bundle.campaign);
  const solarPenalty = computeWeatherPowerPenalty(weather, isNight);
  const solarSys = systems.solar;
  const baseSolar = bundle.balance.power.solarByLevelKWh[String(solarSys.level) as '1' | '2' | '3'];
  const solarKWh = isNight ? 0 : round2(baseSolar * solarSys.integrity * (1 - solarPenalty));
  const fissionKWh = bundle.balance.power.fissionKWhPerSol;
  const powerGeneratedKWh = round2(fissionKWh + solarKWh);

  let availableKWh = round2(state.resources.batteryKWh + powerGeneratedKWh);
  let consumedKWh = 0;
  const unmetLoads: PowerConsumerId[] = [];
  let blackout = false;
  let wrsRan = false;
  let fabricatorRan = false;

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
      if (availableKWh + 1e-6 >= need) {
        availableKWh = round2(availableKWh - need);
        consumedKWh = round2(consumedKWh + need);
        fabricatorRan = true;
      } else {
        unmetLoads.push('fabricator');
      }
    }
  }

  const s = bundle.balance.storages;
  const nextBattery = clamp(round2(availableKWh), 0, s.batteryKWh.max);

  const livingCrewCount = Object.values(state.crew).filter((c) => c.condition !== 'evacuated').length;
  const airlockLeak = systems.airlock.integrity < 1.0 ? bundle.balance.eclss.airlockDegradedLeakO2Kg : 0;
  const oxygenUse = round2(livingCrewCount * bundle.balance.eclss.oxygenKgPerCrewPerSol + airlockLeak);
  const nextOxygen = clamp(round2(state.resources.oxygenKg - oxygenUse), 0, s.oxygenKg.max);

  const waterUse = round2(livingCrewCount * bundle.balance.eclss.waterLPerCrewPerSol);
  const processedWaste = wrsRan ? Math.min(state.resources.wasteWaterL, wrsCfg.maxBatchL) : 0;
  const wrsRecoveredWaterL = round2(processedWaste * wrsCfg.recoveryRate);
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
    powerGeneratedKWh,
    powerConsumedKWh: consumedKWh,
    unmetLoads,
    blackout,
    wrsRecoveredWaterL,
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
  const isMedicFit = nextCrew.doc.condition === 'fit';
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

    // Medkit consumption
    let usedMedkit = false;
    if (state.dailyPlan.medkitTargets.includes(crewId) && resources.medkits > 0) {
      resources = { ...resources, medkits: resources.medkits - 1 };
      const baseHeal =
        resources.medkitLevel === 2
          ? bundle.balance.consumables.medkits.healLv2
          : bundle.balance.consumables.medkits.healLv1;
      const medicExtra = isMedicFit ? bundle.balance.consumables.medkits.medicBonus : 0;
      health = clamp(health + baseHeal + medicExtra, 0, 100);
      usedMedkit = true;
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
    if (radBurnTriggered) {
      health = clamp(health - 8, 0, 100);
    }

    const condition = usedMedkit && health > 0
      ? 'fit'
      : deriveCrewCondition(
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
  bundle: ContentBundle
): {
  rover: GameState['rover'];
  equipment: Record<EquipmentId, EquipmentItemState>;
  resources: GameState['resources'];
  roverIncidentProb: number;
  roverIncidentTriggered: boolean;
  note: string | null;
} {
  const equipment: Record<EquipmentId, EquipmentItemState> = { ...state.equipment };
  let resources = { ...resourcesIn };

  if (state.rover.status === 'idle' || state.rover.status === 'broken' || !state.rover.expeditionId) {
    return {
      rover: state.rover,
      equipment,
      resources,
      roverIncidentProb: 0,
      roverIncidentTriggered: false,
      note: null,
    };
  }

  const exp = bundle.campaign.expeditions.find((e) => e.id === state.rover.expeditionId);
  const diffMult = bundle.campaign.difficultyProfiles[state.campaign.difficulty].weatherRiskMultiplier;
  const threatBlocked = Boolean(
    exp && exp.requiredEquipment.every((req) => state.rover.equippedItems.includes(req))
  );
  const elenaOperating = Object.values(state.crew).some(
    (c) => c.id === 'geo' && c.condition !== 'evacuated' && c.assignedTask?.type === 'rover-operate'
  );

  const roverIncidentProb = computeRoverRiskProb(weather, bundle.balance, diffMult, {
    threatBlocked,
    isElenaOperating: elenaOperating,
  });
  const roll = deriveRoll(state.campaign.seed, state.clock.sol, 'rover-hazard');
  const roverIncidentTriggered = roll < roverIncidentProb;

  const nextRemaining = Math.max(0, state.rover.solsRemaining - 1);
  if (nextRemaining > 0) {
    const nextStatus = nextRemaining === 2 ? 'exploring' : 'returning';
    return {
      rover: { ...state.rover, status: nextStatus, solsRemaining: nextRemaining },
      equipment,
      resources,
      roverIncidentProb,
      roverIncidentTriggered,
      note: roverIncidentTriggered
        ? 'Nhiễu bão mặt trời DONKI làm chậm nhẹ đường truyền Rover.'
        : null,
    };
  }

  // Expedition returning to base on this End-Sol
  const wear = elenaOperating ? 25 : 50;
  for (const eqId of state.rover.equippedItems) {
    const prev = equipment[eqId];
    const nextDur = clamp(prev.durability - (roverIncidentTriggered ? wear + 25 : wear), 0, 100);
    equipment[eqId] = {
      ...prev,
      durability: nextDur,
      state: deriveEquipmentCondition(nextDur),
      reservedForRover: false,
    };
  }

  const s = bundle.balance.storages;
  if (exp) {
    resources = {
      ...resources,
      partsKg: clamp(round2(resources.partsKg + exp.rewards.partsKg), 0, s.partsKg.max),
      oxygenKg: clamp(round2(resources.oxygenKg + exp.rewards.oxygenKg), 0, s.oxygenKg.max),
      waterL: clamp(round2(resources.waterL + exp.rewards.waterL), 0, s.waterL.max),
      batteryKWh: clamp(round2(resources.batteryKWh + exp.rewards.batteryKWh), 0, s.batteryKWh.max),
    };
  }

  const samplesCollected =
    exp && !state.rover.samplesCollected.includes(exp.rewardSample)
      ? [...state.rover.samplesCollected, exp.rewardSample]
      : state.rover.samplesCollected;
  const completedExpeditions =
    exp && !state.rover.completedExpeditions.includes(exp.id)
      ? [...state.rover.completedExpeditions, exp.id]
      : state.rover.completedExpeditions;

  return {
    rover: {
      status: 'idle',
      expeditionId: null,
      solsRemaining: 0,
      equippedItems: [],
      samplesCollected,
      completedExpeditions,
    },
    equipment,
    resources,
    roverIncidentProb,
    roverIncidentTriggered,
    note: exp ? `Rover hoàn tất thám hiểm "${exp.name}", thu về mẫu ${exp.rewardSample}.` : null,
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
  const sol = state.clock.sol;
  const weather = getSolWeather(
    bundle.donki,
    state.campaign.donkiProfileId,
    sol,
    state.campaign.spaceWeatherOverride
  );
  const isNight = isLunarNightSol(sol, bundle.campaign);
  const surfaceTempC = computeSurfaceTempC(sol, bundle);
  const startRes = state.resources;

  // Tier 1: Cargo arrival + crew engineering repairs/upgrades
  const afterCargo = applyCargoArrival(state, bundle);
  const repairOut = resolveRepairAndUpgradeTasks(afterCargo.state, weather, bundle);

  // Tier 2: Power grid load shedding + ECLSS + WRS
  const eclssOut = resolvePowerAndEclss(afterCargo.state, repairOut.systems, weather, bundle);

  // Fabricator progression using Tier 2 power confirmation
  let nextResources = eclssOut.resources;
  let nextEquipment: Record<EquipmentId, EquipmentItemState> = { ...state.equipment };
  let nextFabricator = state.fabricator;
  const fabNotes: string[] = [];
  if (state.fabricator.activeJob && eclssOut.fabricatorCompleted) {
    const remaining = state.fabricator.activeJob.solsRemaining - 1;
    if (remaining <= 0) {
      const done = finalizeFabricatorJob(
        { ...afterCargo.state, resources: nextResources, equipment: nextEquipment },
        state.fabricator.activeJob,
        bundle
      );
      nextResources = done.resources;
      nextEquipment = done.equipment;
      nextFabricator = { usedThisSol: false, activeJob: null };
      fabNotes.push(done.note);
    } else {
      nextFabricator = {
        usedThisSol: false,
        activeJob: { ...state.fabricator.activeJob, solsRemaining: remaining },
      };
    }
  } else if (!state.fabricator.activeJob) {
    nextFabricator = { usedThisSol: false, activeJob: null };
  } else {
    nextFabricator = { usedThisSol: false, activeJob: state.fabricator.activeJob };
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
  const roverOut = resolveRoverTick(
    { ...afterCargo.state, crew: crewOut.crew, equipment: nextEquipment },
    nextResources,
    weather,
    bundle
  );
  nextResources = roverOut.resources;
  nextEquipment = roverOut.equipment;

  // Tier 5: Victory / Defeat streaks
  const oxygenZeroStreak = nextResources.oxygenKg <= 0 ? nextResources.oxygenZeroStreak + 1 : 0;
  const waterZeroStreak = nextResources.waterL <= 0 ? nextResources.waterZeroStreak + 1 : 0;
  nextResources = { ...nextResources, oxygenZeroStreak, waterZeroStreak };

  const activeCrewCount = Object.values(crewOut.crew).filter((c) => c.condition !== 'evacuated').length;
  let campaignStatus = state.campaign.status;
  let endReason: string | null = state.campaign.endReason;

  if (activeCrewCount < bundle.campaign.defeat.minActiveCrew) {
    campaignStatus = 'defeat';
    endReason = 'Đội phi hành gia dưới ngưỡng an toàn tối thiểu (< 2 người hoạt động).';
  } else if (oxygenZeroStreak >= bundle.campaign.defeat.o2ZeroConsecutiveSols) {
    campaignStatus = 'defeat';
    endReason = 'Cạn kiệt dưỡng khí O₂ trong kho (0 kg).';
  } else if (waterZeroStreak >= bundle.campaign.defeat.waterZeroConsecutiveSols) {
    campaignStatus = 'defeat';
    endReason = 'Cạn kiệt nước sạch 2 Sol liên tiếp.';
  } else if (sol >= state.campaign.targetSol) {
    campaignStatus = 'victory';
    endReason = 'Hoàn thành xuất sắc 32 Sol sinh tồn tại Căn cứ Mặt Trăng Artemis!';
  }

  const highlights: string[] = [
    ...(afterCargo.note ? [afterCargo.note] : []),
    ...repairOut.notes,
    ...fabNotes,
    ...crewOut.notes,
    ...(roverOut.note ? [roverOut.note] : []),
  ];

  const weatherOutcome: SpaceWeatherOutcome = {
    profileId: state.campaign.donkiProfileId,
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

  const summary: SolSummary = {
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
    briefId: pickBriefId(weather, isNight, eclssOut.wrsRecoveredWaterL, bundle),
    highlights,
  };

  const isTerminal = campaignStatus === 'victory' || campaignStatus === 'defeat';

  const nextState: GameState = {
    ...state,
    revision: mode === 'commit' ? state.revision + 1 : state.revision,
    campaign: {
      ...state.campaign,
      status: campaignStatus,
      endReason,
    },
    clock: {
      sol: state.clock.sol,
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
              {
                sol,
                phase: 'debrief',
                code: 'SOL_RESOLVED',
                message: `Kết thúc Sol ${sol}: Pin ${nextResources.batteryKWh} kWh, O₂ ${nextResources.oxygenKg} kg, Nước ${nextResources.waterL} L.`,
              },
            ],
          }
        : state.history,
  };

  return { nextState, summary };
}
