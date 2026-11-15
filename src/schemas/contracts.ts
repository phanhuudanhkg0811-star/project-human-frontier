import balanceRaw from '../data/balance.json';
import campaignRaw from '../data/campaign-moon32.json';
import crewRaw from '../data/crew.json';
import donkiRaw from '../data/donki-space-weather.json';
import eventsRaw from '../data/events.json';
import initialStateRaw from '../data/initial-state.json';
import lunarSitesRaw from '../data/lunar-sites.json';
import crewPhysiologyRaw from '../data/crew-physiology.json';
import briefsRaw from '../data/nasa-briefs.json';
import recipesRaw from '../data/recipes.json';
import catalogRaw from '../data/simulation-catalog.json';
import type {
  BalanceConfig,
  CampaignConfig,
  CampaignStatus,
  CargoPackId,
  ContentBundle,
  CrewCondition,
  CrewPhysiologyDataset,
  CrewId,
  CrewProfileConfig,
  CrewTaskType,
  DifficultyId,
  DonkiCatalog,
  DonkiLevel,
  EquipmentCondition,
  EquipmentId,
  EventArtId,
  EventNode,
  EventRepeatPolicy,
  EventResourceKey,
  ExpeditionId,
  FabricatorAction,
  GameCommand,
  GameState,
  HungerState,
  ItemId,
  LunarSiteConfig,
  PowerConsumerId,
  ProvenanceTag,
  RecipeCatalog,
  RoverTimelineStage,
  SaveEnvelope,
  ScienceBrief,
  SimulationCatalog,
  SolPhase,
  SystemId,
  SystemStatus,
} from '../types/index.ts';

const SYSTEM_IDS: readonly SystemId[] = ['solar', 'recycler', 'scrubber', 'airlock', 'fabricator'];
const CREW_IDS: readonly CrewId[] = ['cmd', 'eng', 'doc', 'geo'];
const EQUIPMENT_IDS: readonly EquipmentId[] = [
  'core_drill',
  'sealant_tape',
  'solar_lantern',
  'dust_shield',
  'radio_repeater',
  'cryo_thermal_rig',
];
const ITEM_IDS: readonly ItemId[] = ['mre_pack', 'medkit', ...EQUIPMENT_IDS];
const CARGO_PACK_IDS: readonly CargoPackId[] = [
  'oxygen-pack',
  'water-pack',
  'food-med-pack',
  'power-parts-pack',
];
const POWER_CONSUMER_IDS: readonly PowerConsumerId[] = ['eclss', 'wrs', 'fabricator', 'rover'];
const EXPEDITION_IDS: readonly ExpeditionId[] = ['lunar-crater', 'regolith-field', 'polar-psr'];
const DONKI_LEVELS: readonly DonkiLevel[] = ['quiet', 'moderate', 'storm', 'extreme'];
const PROVENANCE_TAGS: readonly ProvenanceTag[] = ['observed', 'inferred', 'assumption', 'simulated'];
const SOL_PHASES: readonly SolPhase[] = [
  'briefing',
  'engineering',
  'comms',
  'rationing',
  'resolving',
  'debrief',
  'terminal',
];
const CAMPAIGN_STATUSES: readonly CampaignStatus[] = ['not-started', 'active', 'victory', 'defeat'];
const DIFFICULTIES: readonly DifficultyId[] = ['cadet', 'standard', 'hardcore'];
const CREW_CONDITIONS: readonly CrewCondition[] = ['fit', 'injured', 'evacuated'];
const HUNGER_STATES: readonly HungerState[] = ['ok', 'hungry', 'starving'];
const SYSTEM_STATUSES: readonly SystemStatus[] = ['nominal', 'degraded', 'offline'];
const EQUIPMENT_CONDITIONS: readonly EquipmentCondition[] = ['good', 'worn', 'damaged'];
const FABRICATOR_ACTIONS: readonly FabricatorAction[] = ['craft', 'upgrade', 'repair', 'recycle'];
const CREW_TASK_TYPES: readonly CrewTaskType[] = [
  'repair-system',
  'upgrade-system',
  'rover-operate',
  'emergency-response',
  'medical-care',
  'rest',
];
const ROVER_MISSION_STATUSES = [
  'scheduled',
  'outbound',
  'exploring',
  'signal-lost',
  'recovery-pending',
  'completed',
  'failed',
] as const;
const ROVER_TRAVEL_STATUSES = ['outbound', 'exploring'] as const;
const ROVER_INCIDENT_KINDS = [
  'donki-storm',
  'unmitigated-threat',
  'power-delay',
  'signal-timeout',
  'recovery-timeout',
] as const;
const EVENT_ART_IDS: readonly EventArtId[] = [
  'tech-fault',
  'airlock-leak',
  'solar-particle',
  'robot-signal-loss',
];
const EVENT_REPEAT_POLICIES: readonly EventRepeatPolicy[] = ['once', 'cooldown', 'repeatable'];
const EVENT_RESOURCE_KEYS: readonly EventResourceKey[] = [
  'batteryKWh',
  'oxygenKg',
  'waterL',
  'partsKg',
  'mrePacks',
  'medkits',
];
const ROVER_TIMELINE_STAGES: readonly RoverTimelineStage[] = [
  'available',
  'scheduled',
  'launching',
  'outbound',
  'exploring',
  'signal-lost',
  'returning',
  'completed',
  'failed',
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function assertRecord(v: unknown, label: string): Record<string, unknown> {
  if (!isRecord(v)) throw new Error(`Expected object at "${label}"`);
  return v;
}

function assertArray(v: unknown, label: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`Expected array at "${label}"`);
  return v;
}

function assertFiniteNum(v: unknown, label: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new Error(`Invalid number [${min}..${max}] at "${label}"`);
  }
  return v;
}

function assertInt(v: unknown, label: string, min = -Infinity, max = Infinity): number {
  const n = assertFiniteNum(v, label, min, max);
  if (!Number.isInteger(n)) throw new Error(`Expected integer at "${label}"`);
  return n;
}

function assertString(v: unknown, label: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`Invalid non-empty string at "${label}"`);
  }
  return v;
}

function assertNullableString(v: unknown, label: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`Expected string|null at "${label}"`);
  return v;
}

function assertBool(v: unknown, label: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`Expected boolean at "${label}"`);
  return v;
}

function assertEnum<T extends string>(v: unknown, allowed: readonly T[], label: string): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    throw new Error(`Invalid enum "${String(v)}" at "${label}"`);
  }
  return v as T;
}

function assertStringArray(v: unknown, label: string): string[] {
  return assertArray(v, label).map((item, idx) => {
    if (typeof item !== 'string') throw new Error(`Expected string at "${label}[${idx}]"`);
    return item;
  });
}

function assertStorageCap(v: unknown, label: string): void {
  const obj = assertRecord(v, label);
  const initial = assertFiniteNum(obj.initial, `${label}.initial`, 0);
  const max = assertFiniteNum(obj.max, `${label}.max`, initial);
  assertFiniteNum(obj.warnBelow, `${label}.warnBelow`, 0, max);
}

function addOneDayUtc(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function validateBalanceConfig(input: unknown): BalanceConfig {
  const b = assertRecord(input, 'balance');
  assertString(b.contentVersion, 'balance.contentVersion');
  assertString(b.modelVersion, 'balance.modelVersion');
  assertString(b.catalogVersion, 'balance.catalogVersion');

  const storages = assertRecord(b.storages, 'balance.storages');
  for (const key of ['batteryKWh', 'oxygenKg', 'waterL', 'partsKg', 'wasteWaterL']) {
    assertStorageCap(storages[key], `balance.storages.${key}`);
  }

  const cons = assertRecord(b.consumables, 'balance.consumables');
  const mre = assertRecord(cons.mrePacks, 'balance.consumables.mrePacks');
  assertInt(mre.initial, 'mrePacks.initial', 0);
  assertInt(mre.max, 'mrePacks.max', mre.initial as number);
  assertFiniteNum(mre.satietyRestore, 'mrePacks.satietyRestore', 1, 100);
  assertFiniteNum(mre.massKgApprox, 'mrePacks.massKgApprox', 0.01);
  assertFiniteNum(mre.warnBelow, 'mrePacks.warnBelow', 0, mre.max as number);

  const med = assertRecord(cons.medkits, 'balance.consumables.medkits');
  assertInt(med.initial, 'medkits.initial', 0);
  assertInt(med.max, 'medkits.max', med.initial as number);
  assertFiniteNum(med.healLv1, 'medkits.healLv1', 1, 100);
  assertFiniteNum(med.healLv2, 'medkits.healLv2', 1, 100);
  assertFiniteNum(med.medicBonus, 'medkits.medicBonus', 0, 100);

  const power = assertRecord(b.power, 'balance.power');
  assertFiniteNum(power.fissionKWhPerSol, 'power.fissionKWhPerSol', 0);
  assertFiniteNum(power.essentialLoadKWh, 'power.essentialLoadKWh', 0);
  const solarLv = assertRecord(power.solarByLevelKWh, 'power.solarByLevelKWh');
  for (const k of ['1', '2', '3']) assertFiniteNum(solarLv[k], `solarByLevelKWh.${k}`, 0);
  const bp = assertRecord(power.blackoutPenalty, 'power.blackoutPenalty');
  assertFiniteNum(bp.healthDelta, 'blackoutPenalty.healthDelta', -100, 0);
  assertFiniteNum(bp.moraleDelta, 'blackoutPenalty.moraleDelta', -100, 0);

  const eclss = assertRecord(b.eclss, 'balance.eclss');
  assertFiniteNum(eclss.oxygenKgPerCrewPerSol, 'eclss.oxygenKgPerCrewPerSol', 0);
  assertFiniteNum(eclss.waterLPerCrewPerSol, 'eclss.waterLPerCrewPerSol', 0);
  assertFiniteNum(eclss.wasteWaterGeneratedPerCrewPerSol, 'eclss.wasteWaterGeneratedPerCrewPerSol', 0);
  assertFiniteNum(eclss.airlockDegradedLeakO2Kg, 'eclss.airlockDegradedLeakO2Kg', 0);
  const wrsLv = assertRecord(eclss.wrsByLevel, 'eclss.wrsByLevel');
  for (const k of ['1', '2', '3']) {
    const cfg = assertRecord(wrsLv[k], `eclss.wrsByLevel.${k}`);
    assertFiniteNum(cfg.recoveryRate, `wrs.${k}.recoveryRate`, 0.01, 1);
    assertFiniteNum(cfg.powerKWh, `wrs.${k}.powerKWh`, 0);
    assertFiniteNum(cfg.maxBatchL, `wrs.${k}.maxBatchL`, 0);
  }

  const crew = assertRecord(b.crew, 'balance.crew');
  for (const key of [
    'satietyDrainPerSol',
    'injuredBelowHealth',
    'fitRecoverAtHealth',
    'tiredBelowMorale',
    'normalRecoverAtMorale',
    'restMoraleGain',
    'restHealthGain',
    'medicalCareMoraleGain',
    'medicalCareHealthGain',
    'hungryMoraleDelta',
    'starvingHealthDelta',
    'starvingMoraleDelta',
  ]) {
    assertFiniteNum(crew[key], `balance.crew.${key}`, -100, 100);
  }

  const sys = assertRecord(b.systems, 'balance.systems');
  assertInt(sys.maxLevel, 'systems.maxLevel', 1, 3);
  assertFiniteNum(sys.repairPartsCost, 'systems.repairPartsCost', 0);
  const upg = assertRecord(sys.upgradePartsByTargetLevel, 'systems.upgradePartsByTargetLevel');
  assertFiniteNum(upg['2'], 'upgradeParts.2', 0);
  assertFiniteNum(upg['3'], 'upgradeParts.3', 0);

  const logi = assertRecord(b.logistics, 'balance.logistics');
  assertInt(logi.maxSlots, 'logistics.maxSlots', 1, 10);
  assertFiniteNum(logi.slotWeightKg, 'logistics.slotWeightKg', 1);
  assertFiniteNum(logi.maxPayloadKg, 'logistics.maxPayloadKg', 1);
  assertInt(logi.transitSols, 'logistics.transitSols', 1);
  assertInt(logi.padCooldownSols, 'logistics.padCooldownSols', 0);
  assertFiniteNum(logi.radioLatencyMs, 'logistics.radioLatencyMs', 0);
  assertFiniteNum(logi.groundProcessingMs, 'logistics.groundProcessingMs', 0);
  const packs = assertArray(logi.packs, 'logistics.packs');
  if (packs.length === 0) throw new Error('logistics.packs must not be empty');
  for (const [idx, pkRaw] of packs.entries()) {
    const pk = assertRecord(pkRaw, `logistics.packs[${idx}]`);
    assertEnum(pk.id, CARGO_PACK_IDS, `packs[${idx}].id`);
    assertString(pk.name, `packs[${idx}].name`);
    assertFiniteNum(pk.weightKg, `packs[${idx}].weightKg`, 1);
    assertString(pk.summary, `packs[${idx}].summary`);
    const grant = assertRecord(pk.grant, `packs[${idx}].grant`);
    for (const [gk, gv] of Object.entries(grant)) {
      assertEnum(gk, ['oxygenKg', 'waterL', 'mrePacks', 'medkits', 'batteryKWh', 'partsKg'] as const, `grant.${gk}`);
      assertFiniteNum(gv, `packs[${idx}].grant.${gk}`, 0);
    }
  }

  const dp = assertRecord(b.donkiProbability, 'balance.donkiProbability');
  assertFiniteNum(dp.repairBaseSuccessProb, 'donkiProbability.repairBaseSuccessProb', 0, 1);
  assertFiniteNum(dp.repairHardwareStressWeight, 'donkiProbability.repairHardwareStressWeight', 0, 2);
  assertFiniteNum(dp.repairAlexBonus, 'donkiProbability.repairAlexBonus', 0, 1);
  assertFiniteNum(dp.repairMinSuccessProb, 'donkiProbability.repairMinSuccessProb', 0, 1);
  assertFiniteNum(dp.roverBaseIncidentProb, 'donkiProbability.roverBaseIncidentProb', 0, 1);
  assertFiniteNum(dp.roverStressWeight, 'donkiProbability.roverStressWeight', 0, 2);
  assertFiniteNum(dp.roverBlockedMultiplier, 'donkiProbability.roverBlockedMultiplier', 0, 1);
  assertFiniteNum(dp.roverElenaMultiplier, 'donkiProbability.roverElenaMultiplier', 0, 1);
  assertFiniteNum(dp.crewHighRadiationThreshold, 'donkiProbability.crewHighRadiationThreshold', 0, 1);
  const shelterLv = assertRecord(dp.crewShelterProtectionByLevel, 'donkiProbability.crewShelterProtectionByLevel');
  for (const k of ['1', '2', '3']) assertFiniteNum(shelterLv[k], `crewShelterProtectionByLevel.${k}`, 0, 1);
  assertFiniteNum(dp.dustShieldRadiationBonus, 'donkiProbability.dustShieldRadiationBonus', 0, 0.5);
  assertFiniteNum(dp.backgroundMgyPerSol, 'donkiProbability.backgroundMgyPerSol', 0);
  assertFiniteNum(dp.stormPeakExtraMgy, 'donkiProbability.stormPeakExtraMgy', 0);
  assertFiniteNum(dp.stormSystemDegradeChance, 'donkiProbability.stormSystemDegradeChance', 0, 1);

  return b as unknown as BalanceConfig;
}

export function validateCrewCatalog(input: unknown): readonly CrewProfileConfig[] {
  const root = assertRecord(input, 'crewCatalog');
  const crew = assertArray(root.crew, 'crewCatalog.crew');
  if (crew.length !== 4) throw new Error('crew.json must contain 4 crew members');
  const seen = new Set<string>();
  for (const [idx, rawMember] of crew.entries()) {
    const m = assertRecord(rawMember, `crew[${idx}]`);
    const id = assertEnum(m.id, CREW_IDS, `crew[${idx}].id`);
    assertString(m.name, `crew[${idx}].name`);
    assertString(m.roleTag, `crew[${idx}].roleTag`);
    assertString(m.perkId, `crew[${idx}].perkId`);
    assertString(m.perkDescription, `crew[${idx}].perkDescription`);
    assertFiniteNum(m.initialHealth, `crew[${idx}].initialHealth`, 1, 100);
    assertFiniteNum(m.initialMorale, `crew[${idx}].initialMorale`, 0, 100);
    assertFiniteNum(m.initialSatiety, `crew[${idx}].initialSatiety`, 0, 100);
    assertEnum(m.initialCondition, CREW_CONDITIONS, `crew[${idx}].initialCondition`);
    assertEnum(m.initialHungerState, HUNGER_STATES, `crew[${idx}].initialHungerState`);
    assertFiniteNum(m.initialRadiationMgy, `crew[${idx}].initialRadiationMgy`, 0);
    seen.add(id);
  }
  for (const reqId of CREW_IDS) {
    if (!seen.has(reqId)) throw new Error(`Missing required crew id: ${reqId}`);
  }
  return crew as unknown as readonly CrewProfileConfig[];
}

function validateRecipeCost(v: unknown, label: string): void {
  const c = assertRecord(v, label);
  assertFiniteNum(c.partsKg, `${label}.partsKg`, 0);
  assertFiniteNum(c.waterL, `${label}.waterL`, 0);
  assertFiniteNum(c.batteryKWh, `${label}.batteryKWh`, 0);
  assertInt(c.durationSols, `${label}.durationSols`, 1, 10);
}

export function validateRecipeCatalog(input: unknown): RecipeCatalog {
  const root = assertRecord(input, 'recipes');
  assertString(root.contentVersion, 'recipes.contentVersion');
  const rules = assertRecord(root.rules, 'recipes.rules');
  assertInt(rules.maxQueueCommandsPerSol, 'recipes.rules.maxQueueCommandsPerSol', 1);
  assertInt(rules.crewSlotsRequired, 'recipes.rules.crewSlotsRequired', 0);
  validateRecipeCost(rules.repairCost, 'recipes.rules.repairCost');
  assertFiniteNum(rules.recycleReturnRate, 'recipes.rules.recycleReturnRate', 0, 1);
  assertInt(rules.recycleDurationSols, 'recipes.rules.recycleDurationSols', 1);

  const items = assertArray(root.items, 'recipes.items');
  if (items.length !== 8) throw new Error('recipes.json must contain 8 items (2 consumables + 6 equipment)');
  const seen = new Set<string>();
  for (const [idx, rawItem] of items.entries()) {
    const it = assertRecord(rawItem, `recipes.items[${idx}]`);
    const id = assertEnum(it.id, ITEM_IDS, `recipes.items[${idx}].id`);
    assertString(it.name, `recipes.items[${idx}].name`);
    assertEnum(it.category, ['consumable', 'equipment'] as const, `recipes.items[${idx}].category`);
    assertEnum(it.rack, ['UL', 'LR'] as const, `recipes.items[${idx}].rack`);
    assertInt(it.requiredFabricatorLevel, `recipes.items[${idx}].requiredFabricatorLevel`, 1, 3);
    validateRecipeCost(it.craftCost, `recipes.items[${idx}].craftCost`);
    if (it.upgradeCost !== null) validateRecipeCost(it.upgradeCost, `recipes.items[${idx}].upgradeCost`);
    assertString(it.effectSummary, `recipes.items[${idx}].effectSummary`);
    assertNullableString(it.blockThreat, `recipes.items[${idx}].blockThreat`);
    seen.add(id);
  }
  for (const req of ITEM_IDS) {
    if (!seen.has(req)) throw new Error(`Missing recipe item "${req}"`);
  }
  return root as unknown as RecipeCatalog;
}

export function validateCampaignConfig(input: unknown): CampaignConfig {
  const c = assertRecord(input, 'campaign');
  assertString(c.contentVersion, 'campaign.contentVersion');
  if (c.id !== 'moon-32' || c.planet !== 'moon' || c.targetSol !== 32) {
    throw new Error('campaign-moon32.json must lock id=moon-32, planet=moon, targetSol=32');
  }
  assertString(c.title, 'campaign.title');

  const ms = assertRecord(c.milestones, 'campaign.milestones');
  for (const k of ['lunarDay', 'lunarNight', 'lunarDawn']) {
    const span = assertRecord(ms[k], `milestones.${k}`);
    const s = assertInt(span.startSol, `milestones.${k}.startSol`, 1, 32);
    assertInt(span.endSol, `milestones.${k}.endSol`, s, 32);
  }
  assertInt(ms.goldenCrisisSol, 'milestones.goldenCrisisSol', 1, 32);
  assertInt(ms.recommendedLastCargoSol, 'milestones.recommendedLastCargoSol', 1, 32);

  const vic = assertRecord(c.victory, 'campaign.victory');
  assertInt(vic.reachSol, 'victory.reachSol', 1, 32);
  assertInt(vic.minActiveCrew, 'victory.minActiveCrew', 1, 4);
  assertBool(vic.requirePositiveOxygen, 'victory.requirePositiveOxygen');
  assertBool(vic.requirePositiveWater, 'victory.requirePositiveWater');
  if (vic.reachSol !== c.targetSol) throw new Error('Victory reachSol must equal campaign targetSol.');
  const training = assertRecord(c.training, 'campaign.training');
  assertInt(training.reportSol, 'training.reportSol', 1, Number(c.targetSol) - 1);
  assertInt(training.minActiveCrew, 'training.minActiveCrew', 1, 4);
  assertInt(training.minExpeditions, 'training.minExpeditions', 0, 3);
  const ranking = assertRecord(c.ranking, 'campaign.ranking');
  assertString(ranking.version, 'ranking.version');
  const rankS = assertRecord(ranking.S, 'ranking.S');
  const rankA = assertRecord(ranking.A, 'ranking.A');
  assertInt(rankS.minFitCrew, 'ranking.S.minFitCrew', Number(vic.minActiveCrew), 4);
  assertInt(rankA.minActiveCrew, 'ranking.A.minActiveCrew', Number(vic.minActiveCrew), Number(rankS.minFitCrew));
  assertInt(rankS.minExpeditions, 'ranking.S.minExpeditions', 0, 3);
  assertInt(rankA.minExpeditions, 'ranking.A.minExpeditions', 0, Number(rankS.minExpeditions));

  const def = assertRecord(c.defeat, 'campaign.defeat');
  assertInt(def.minActiveCrew, 'defeat.minActiveCrew', 1, 4);
  assertInt(def.o2ZeroConsecutiveSols, 'defeat.o2ZeroConsecutiveSols', 1);
  assertInt(def.waterZeroConsecutiveSols, 'defeat.waterZeroConsecutiveSols', 1);

  const diffs = assertRecord(c.difficultyProfiles, 'campaign.difficultyProfiles');
  for (const d of DIFFICULTIES) {
    const prof = assertRecord(diffs[d], `difficultyProfiles.${d}`);
    assertEnum(prof.id, DIFFICULTIES, `difficultyProfiles.${d}.id`);
    assertString(prof.label, `difficultyProfiles.${d}.label`);
    assertFiniteNum(prof.weatherRiskMultiplier, `difficultyProfiles.${d}.weatherRiskMultiplier`, 0.1, 3);
    assertFiniteNum(prof.eventSeverityMultiplier, `difficultyProfiles.${d}.eventSeverityMultiplier`, 0.1, 3);
  }

  const exps = assertArray(c.expeditions, 'campaign.expeditions');
  if (exps.length === 0) throw new Error('campaign.expeditions must not be empty');
  for (const [idx, rawExp] of exps.entries()) {
    const e = assertRecord(rawExp, `expeditions[${idx}]`);
    assertEnum(e.id, EXPEDITION_IDS, `expeditions[${idx}].id`);
    assertString(e.name, `expeditions[${idx}].name`);
    const ws = assertInt(e.windowStartSol, `expeditions[${idx}].windowStartSol`, 1, 32);
    assertInt(e.windowEndSol, `expeditions[${idx}].windowEndSol`, ws, 32);
    assertInt(e.durationSols, `expeditions[${idx}].durationSols`, 1, 10);
    assertFiniteNum(e.launchPowerKWh, `expeditions[${idx}].launchPowerKWh`, 0);
    assertString(e.threat, `expeditions[${idx}].threat`);
    const options = assertArray(e.mitigationOptions, `expeditions[${idx}].mitigationOptions`);
    if (options.length === 0) throw new Error(`expeditions[${idx}].mitigationOptions must not be empty`);
    options.forEach((rawOption, optionIdx) => {
      const option = assertRecord(rawOption, `expeditions[${idx}].mitigationOptions[${optionIdx}]`);
      const allOf = assertArray(option.allOf, `expeditions[${idx}].mitigationOptions[${optionIdx}].allOf`);
      if (allOf.length === 0) throw new Error('mitigation option allOf must not be empty');
      allOf.forEach((eqId, eqIdx) => assertEnum(eqId, EQUIPMENT_IDS, `mitigationOptions[${optionIdx}].allOf[${eqIdx}]`));
      if (option.requirements !== undefined) {
        const req = assertRecord(option.requirements, `mitigationOptions[${optionIdx}].requirements`);
        if (req.minBatteryKWh !== undefined) assertFiniteNum(req.minBatteryKWh, 'requirements.minBatteryKWh', 0);
      }
    });
    assertString(e.rewardSample, `expeditions[${idx}].rewardSample`);
    const rew = assertRecord(e.rewards, `expeditions[${idx}].rewards`);
    for (const rk of ['partsKg', 'batteryKWh', 'oxygenKg', 'waterL', 'science']) {
      assertFiniteNum(rew[rk], `expeditions[${idx}].rewards.${rk}`, 0);
    }
  }
  return c as unknown as CampaignConfig;
}

export function validateSimulationCatalog(input: unknown): SimulationCatalog {
  const root = assertRecord(input, 'simulationCatalog');
  assertString(root.catalogVersion, 'simulationCatalog.catalogVersion');
  assertString(root.modelVersion, 'simulationCatalog.modelVersion');

  const camp = assertRecord(root.campaign, 'simulationCatalog.campaign');
  if (camp.id !== 'moon-32' || camp.planet !== 'moon') {
    throw new Error('simulationCatalog.campaign must target moon-32');
  }
  assertInt(camp.targetSol, 'simulationCatalog.campaign.targetSol', 32, 32);
  assertEnum(camp.provenance, PROVENANCE_TAGS, 'simulationCatalog.campaign.provenance');

  const env = assertRecord(root.environment, 'simulationCatalog.environment');
  assertString(env.source, 'environment.source');
  assertEnum(env.provenance, PROVENANCE_TAGS, 'environment.provenance');
  assertFiniteNum(env.diurnalCycleHours, 'environment.diurnalCycleHours', 1);
  const temp = assertRecord(env.temperatureC, 'environment.temperatureC');
  for (const tk of ['meanC', 'amplitudeC', 'dayMaxC', 'nightMinC', 'noiseSdC']) {
    assertFiniteNum(temp[tk], `temperatureC.${tk}`);
  }
  assertFiniteNum(temp.fitR2, 'temperatureC.fitR2', 0, 1);
  assertEnum(temp.provenance, PROVENANCE_TAGS, 'temperatureC.provenance');
  assertFiniteNum(env.dustTauMean, 'environment.dustTauMean', 0, 0);
  assertString(env.dustNote, 'environment.dustNote');

  const rad = assertRecord(env.radiationBaselineMgyPerSol, 'environment.radiationBaselineMgyPerSol');
  assertFiniteNum(rad.nominalBackgroundMgy, 'radiationBaseline.nominalBackgroundMgy', 0);
  assertFiniteNum(rad.shelterReductionPct, 'radiationBaseline.shelterReductionPct', 0, 1);
  assertEnum(rad.provenance, PROVENANCE_TAGS, 'radiationBaseline.provenance');

  const comms = assertRecord(env.earthMoonCommsDelaySec, 'environment.earthMoonCommsDelaySec');
  assertFiniteNum(comms.oneWaySec, 'commsDelay.oneWaySec', 0);
  assertFiniteNum(comms.roundTripDisplaySec, 'commsDelay.roundTripDisplaySec', 0);
  assertEnum(comms.provenance, PROVENANCE_TAGS, 'commsDelay.provenance');

  const bp = assertRecord(root.baselineProvenance, 'simulationCatalog.baselineProvenance');
  for (const [k, v] of Object.entries(bp)) {
    assertEnum(v, PROVENANCE_TAGS, `baselineProvenance.${k}`);
  }
  return root as unknown as SimulationCatalog;
}

export function validateDonkiCatalog(input: unknown): DonkiCatalog {
  const root = assertRecord(input, 'donkiCatalog');
  assertString(root.catalogVersion, 'donki.catalogVersion');
  assertString(root.generatedAtUtc, 'donki.generatedAtUtc');
  assertString(root.source, 'donki.source');
  assertStringArray(root.endpointsUsed, 'donki.endpointsUsed');
  assertEnum(root.provenance, PROVENANCE_TAGS, 'donki.provenance');
  assertEnum(root.derivedIndicesProvenance, PROVENANCE_TAGS, 'donki.derivedIndicesProvenance');

  const samples = assertArray(root.samples, 'donki.samples');
  if (samples.length < 3) throw new Error('donki-space-weather.json must contain at least 3 samples');

  for (const [sIdx, rawSample] of samples.entries()) {
    const sample = assertRecord(rawSample, `donki.samples[${sIdx}]`);
    const sampleId = assertString(sample.id, `donki.samples[${sIdx}].id`);
    assertString(sample.name, `donki.samples[${sampleId}].name`);
    assertString(sample.description, `donki.samples[${sampleId}].description`);
    const startDate = assertString(sample.startDate, `donki.${sampleId}.startDate`);
    assertString(sample.endDate, `donki.${sampleId}.endDate`);
    assertInt(sample.solCount, `donki.${sampleId}.solCount`, 32, 32);
    assertEnum(sample.provenance, PROVENANCE_TAGS, `donki.${sampleId}.provenance`);
    assertRecord(sample.summary, `donki.${sampleId}.summary`);

    const sols = assertArray(sample.sols, `donki.${sampleId}.sols`);
    if (sols.length !== 32) throw new Error(`DONKI sample "${sampleId}" must contain 32 Sols`);

    let expectedDate = startDate;
    for (let i = 0; i < sols.length; i += 1) {
      const entry = assertRecord(sols[i], `donki.${sampleId}.sols[${i}]`);
      assertInt(entry.sol, `donki.${sampleId}.sols[${i}].sol`, i + 1, i + 1);
      const entryDate = assertString(entry.date, `donki.${sampleId}.sols[${i}].date`);
      if (entryDate !== expectedDate) {
        throw new Error(`DONKI sample "${sampleId}" non-consecutive date at Sol ${i + 1}: expected ${expectedDate}, got ${entryDate}`);
      }
      expectedDate = addOneDayUtc(expectedDate);

      assertEnum(entry.level, DONKI_LEVELS, `donki.${sampleId}.sols[${i}].level`);
      assertFiniteNum(entry.radiationRiskIndex, `donki.${sampleId}.sols[${i}].radiationRiskIndex`, 0, 1);
      assertFiniteNum(entry.commsNoiseIndex, `donki.${sampleId}.sols[${i}].commsNoiseIndex`, 0, 1);
      assertFiniteNum(entry.hardwareStressIndex, `donki.${sampleId}.sols[${i}].hardwareStressIndex`, 0, 1);
      assertFiniteNum(entry.solarPenaltyPct, `donki.${sampleId}.sols[${i}].solarPenaltyPct`, 0, 0.35);

      const flares = assertRecord(entry.flares, 'entry.flares');
      assertInt(flares.count, 'flares.count', 0);
      assertNullableString(flares.maxClass, 'flares.maxClass');
      assertStringArray(flares.ids, 'flares.ids');

      const cme = assertRecord(entry.cme, 'entry.cme');
      assertInt(cme.count, 'cme.count', 0);
      assertFiniteNum(cme.maxSpeedKms, 'cme.maxSpeedKms', 0);
      assertFiniteNum(cme.maxHalfAngle, 'cme.maxHalfAngle', 0);
      assertInt(cme.earthDirectedCount, 'cme.earthDirectedCount', 0);
      assertStringArray(cme.ids, 'cme.ids');

      const sep = assertRecord(entry.sep, 'entry.sep');
      assertInt(sep.count, 'sep.count', 0);
      assertStringArray(sep.ids, 'sep.ids');

      const ips = assertRecord(entry.ips, 'entry.ips');
      assertInt(ips.count, 'ips.count', 0);
      assertStringArray(ips.ids, 'ips.ids');

      const notif = assertRecord(entry.notifications, 'entry.notifications');
      assertInt(notif.count, 'notifications.count', 0);
      assertStringArray(notif.types, 'notifications.types');
      assertNullableString(notif.headline, 'notifications.headline');
    }
  }
  return root as unknown as DonkiCatalog;
}

function validateEventEffect(rawEff: unknown, label: string): void {
  const eff = assertRecord(rawEff, label);
  const kind = assertString(eff.kind, `${label}.kind`);
  switch (kind) {
    case 'resource':
      assertEnum(eff.resource, EVENT_RESOURCE_KEYS, `${label}.resource`);
      assertFiniteNum(eff.delta, `${label}.delta`);
      break;
    case 'science':
      assertInt(eff.delta, `${label}.delta`);
      break;
    case 'crew':
      assertEnum(eff.target, ['cmd', 'eng', 'doc', 'geo', 'all'] as const, `${label}.target`);
      if (eff.healthDelta !== undefined) assertFiniteNum(eff.healthDelta, `${label}.healthDelta`);
      if (eff.moraleDelta !== undefined) assertFiniteNum(eff.moraleDelta, `${label}.moraleDelta`);
      if (eff.satietyDelta !== undefined) assertFiniteNum(eff.satietyDelta, `${label}.satietyDelta`);
      break;
    case 'equipment-wear':
      assertEnum(eff.equipmentId, EQUIPMENT_IDS, `${label}.equipmentId`);
      assertFiniteNum(eff.wear, `${label}.wear`, 0, 100);
      break;
    case 'system-integrity':
      assertEnum(eff.systemId, SYSTEM_IDS, `${label}.systemId`);
      assertFiniteNum(eff.delta, `${label}.delta`, -1, 1);
      break;
    case 'plan-override':
      if (eff.wrsEnabled !== undefined) assertBool(eff.wrsEnabled, `${label}.wrsEnabled`);
      if (eff.extraPowerCostKWh !== undefined) assertFiniteNum(eff.extraPowerCostKWh, `${label}.extraPowerCostKWh`, 0);
      break;
    case 'set-flag':
      assertString(eff.key, `${label}.key`);
      if (typeof eff.value !== 'boolean' && typeof eff.value !== 'string' && (typeof eff.value !== 'number' || !Number.isFinite(eff.value))) {
        throw new Error(`Invalid flag value at "${label}.value"`);
      }
      break;
    case 'clear-flag':
      assertString(eff.key, `${label}.key`);
      break;
    case 'assign-task':
      assertEnum(eff.crewId, CREW_IDS, `${label}.crewId`);
      assertEnum(eff.task, CREW_TASK_TYPES, `${label}.task`);
      if (eff.targetSystemId !== undefined) assertEnum(eff.targetSystemId, SYSTEM_IDS, `${label}.targetSystemId`);
      if (eff.targetCrewId !== undefined) assertEnum(eff.targetCrewId, CREW_IDS, `${label}.targetCrewId`);
      break;
    case 'rover-action':
      assertEnum(eff.action, ['continue-expedition', 'fail-expedition', 'recover-signal', 'delay-1-sol'] as const, `${label}.action`);
      if (eff.expeditionId !== undefined) assertEnum(eff.expeditionId, EXPEDITION_IDS, `${label}.expeditionId`);
      break;
    case 'schedule-follow-up':
      assertString(eff.eventId, `${label}.eventId`);
      assertInt(eff.delaySols, `${label}.delaySols`, 1, 31);
      break;
    default:
      throw new Error(`Unsupported EventEffect.kind "${kind}" at "${label}"`);
  }
}

export function validateEventsCatalog(input: unknown): readonly EventNode[] {
  const list = assertArray(input, 'events');
  if (list.length === 0) throw new Error('events.json must be non-empty');
  const seenIds = new Set<string>();
  for (const [idx, rawEv] of list.entries()) {
    const ev = assertRecord(rawEv, `events[${idx}]`);
    const id = assertString(ev.id, `events[${idx}].id`);
    if (seenIds.has(id)) throw new Error(`Duplicate event id "${id}"`);
    seenIds.add(id);
    assertString(ev.title, `events[${idx}].title`);
    if (ev.titleEn !== undefined) assertString(ev.titleEn, `events[${idx}].titleEn`);
    assertEnum(ev.category, ['ops', 'hazard', 'crisis', 'milestone'] as const, `events[${idx}].category`);
    assertEnum(ev.art, EVENT_ART_IDS, `events[${idx}].art`);
    assertInt(ev.priority, `events[${idx}].priority`, 1, 100);
    assertInt(ev.weight, `events[${idx}].weight`, 1, 1_000_000);
    assertEnum(ev.repeatPolicy, EVENT_REPEAT_POLICIES, `events[${idx}].repeatPolicy`);
    if (ev.cooldownSols !== undefined) assertInt(ev.cooldownSols, `events[${idx}].cooldownSols`, 1, 32);
    if (ev.deadlineOffsetSols !== undefined) assertInt(ev.deadlineOffsetSols, `events[${idx}].deadlineOffsetSols`, 0, 31);
    assertNullableString(ev.scienceBriefId, `events[${idx}].scienceBriefId`);
    assertBool(ev.mandatory, `events[${idx}].mandatory`);
    assertString(ev.prompt, `events[${idx}].prompt`);
    if (ev.promptEn !== undefined) assertString(ev.promptEn, `events[${idx}].promptEn`);

    const when = assertArray(ev.when, `events[${idx}].when`);
    if (when.length === 0) throw new Error(`events[${idx}].when must not be empty`);
    for (const [wIdx, rawW] of when.entries()) {
      const w = assertRecord(rawW, `events[${idx}].when[${wIdx}]`);
      if (Object.keys(w).length === 0) throw new Error(`events[${idx}].when[${wIdx}] must have at least one condition field`);
      if (w.sol !== undefined && (w.solMin !== undefined || w.solMax !== undefined)) {
        throw new Error(`events[${idx}].when[${wIdx}] cannot combine sol with solMin/solMax`);
      }
      if (w.sol !== undefined) assertInt(w.sol, 'when.sol', 1, 32);
      if (w.solMin !== undefined) assertInt(w.solMin, 'when.solMin', 1, 32);
      if (w.solMax !== undefined) assertInt(w.solMax, 'when.solMax', 1, 32);
      if (w.solMin !== undefined && w.solMax !== undefined && (w.solMin as number) > (w.solMax as number)) {
        throw new Error(`events[${idx}].when[${wIdx}] solMin cannot exceed solMax`);
      }
      if (w.isLunarNight !== undefined) assertBool(w.isLunarNight, 'when.isLunarNight');
      if (w.flagSet !== undefined) assertString(w.flagSet, 'when.flagSet');
      if (w.flagNotSet !== undefined) assertString(w.flagNotSet, 'when.flagNotSet');
      if (w.flagEquals !== undefined) {
        const fe = assertRecord(w.flagEquals, 'when.flagEquals');
        assertString(fe.key, 'when.flagEquals.key');
        if (typeof fe.value !== 'boolean' && typeof fe.value !== 'string' && (typeof fe.value !== 'number' || !Number.isFinite(fe.value))) {
          throw new Error('Invalid when.flagEquals.value');
        }
      }
      if (w.choiceMade !== undefined) {
        const cm = assertRecord(w.choiceMade, 'when.choiceMade');
        assertString(cm.eventId, 'when.choiceMade.eventId');
        assertString(cm.choiceId, 'when.choiceMade.choiceId');
      }
      if (w.eventSeen !== undefined) assertString(w.eventSeen, 'when.eventSeen');
      if (w.eventNotSeen !== undefined) assertString(w.eventNotSeen, 'when.eventNotSeen');
      if (w.roverExpeditionId !== undefined) assertEnum(w.roverExpeditionId, EXPEDITION_IDS, 'when.roverExpeditionId');
      if (w.roverStatus !== undefined) assertEnum(w.roverStatus, ROVER_TIMELINE_STAGES, 'when.roverStatus');
      if (w.systemIntegrityBelow !== undefined) {
        const sib = assertRecord(w.systemIntegrityBelow, 'when.systemIntegrityBelow');
        assertEnum(sib.id, SYSTEM_IDS, 'when.systemIntegrityBelow.id');
        assertFiniteNum(sib.maxIntegrity, 'when.systemIntegrityBelow.maxIntegrity', 0, 1);
      }
      for (const boundKey of ['minResource', 'maxResource'] as const) {
        if (w[boundKey] !== undefined) {
          const bound = assertRecord(w[boundKey], `when.${boundKey}`);
          if (Object.keys(bound).length === 0) throw new Error(`when.${boundKey} must not be empty`);
          for (const [rk, rv] of Object.entries(bound)) {
            assertEnum(rk, EVENT_RESOURCE_KEYS, `when.${boundKey}.${rk}`);
            assertFiniteNum(rv, `when.${boundKey}.${rk}`, 0);
          }
        }
      }
      if (w.crewCondition !== undefined) {
        const cc = assertRecord(w.crewCondition, 'when.crewCondition');
        if (cc.crewId !== undefined) assertEnum(cc.crewId, CREW_IDS, 'when.crewCondition.crewId');
        assertEnum(cc.condition, CREW_CONDITIONS, 'when.crewCondition.condition');
      }
    }

    const choices = assertArray(ev.choices, `events[${idx}].choices`);
    if (choices.length === 0) throw new Error(`events[${idx}].choices must not be empty`);
    const seenChoices = new Set<string>();
    for (const [cIdx, rawChoice] of choices.entries()) {
      const ch = assertRecord(rawChoice, `events[${idx}].choices[${cIdx}]`);
      const cid = assertString(ch.id, 'choice.id');
      if (seenChoices.has(cid)) throw new Error(`Duplicate choice id "${cid}" in event "${id}"`);
      seenChoices.add(cid);
      assertString(ch.label, 'choice.label');
      if (ch.labelEn !== undefined) assertString(ch.labelEn, 'choice.labelEn');
      if (ch.requiresEquipment !== undefined) {
        assertEnum(ch.requiresEquipment, EQUIPMENT_IDS, 'choice.requiresEquipment');
      }
      if (ch.requiresFlag !== undefined) assertString(ch.requiresFlag, 'choice.requiresFlag');
      if (ch.requiresCrew !== undefined) {
        const rc = assertRecord(ch.requiresCrew, 'choice.requiresCrew');
        assertEnum(rc.crewId, CREW_IDS, 'choice.requiresCrew.crewId');
        if (rc.requireFree !== undefined) assertBool(rc.requireFree, 'choice.requiresCrew.requireFree');
        if (rc.requireFit !== undefined) assertBool(rc.requireFit, 'choice.requiresCrew.requireFit');
      }
      const effects = assertArray(ch.effects, `events[${idx}].choices[${cIdx}].effects`);
      effects.forEach((rawEff, eIdx) =>
        validateEventEffect(rawEff, `events[${idx}].choices[${cIdx}].effects[${eIdx}]`)
      );
      assertString(ch.log, 'choice.log');
      if (ch.logEn !== undefined) assertString(ch.logEn, 'choice.logEn');
    }

    if (ev.onExpireEffects !== undefined) {
      const expireEffs = assertArray(ev.onExpireEffects, `events[${idx}].onExpireEffects`);
      expireEffs.forEach((rawEff, eIdx) =>
        validateEventEffect(rawEff, `events[${idx}].onExpireEffects[${eIdx}]`)
      );
    }
  }
  return list as unknown as readonly EventNode[];
}

export function validateScienceBriefs(input: unknown): readonly ScienceBrief[] {
  const list = assertArray(input, 'briefs');
  if (list.length < 3) throw new Error('nasa-briefs.json must contain at least 3 briefs');
  for (const [idx, rawBrief] of list.entries()) {
    const b = assertRecord(rawBrief, `briefs[${idx}]`);
    assertString(b.id, `briefs[${idx}].id`);
    const tags = assertStringArray(b.tags, `briefs[${idx}].tags`);
    if (tags.length === 0) throw new Error(`briefs[${idx}].tags must not be empty`);
    assertString(b.title, `briefs[${idx}].title`);
    if (b.titleEn !== undefined) assertString(b.titleEn, `briefs[${idx}].titleEn`);
    assertString(b.content, `briefs[${idx}].content`);
    if (b.contentEn !== undefined) assertString(b.contentEn, `briefs[${idx}].contentEn`);
    assertString(b.source, `briefs[${idx}].source`);
    assertEnum(b.provenance, PROVENANCE_TAGS, `briefs[${idx}].provenance`);
  }
  return list as unknown as readonly ScienceBrief[];
}

export function validateLunarSites(input: unknown): readonly LunarSiteConfig[] {
  const sites = assertArray(input, 'lunarSites');
  if (sites.length !== 3) throw new Error('lunar-sites.json must contain exactly 3 sites');
  const seen = new Set<string>();
  for (const [idx, rawSite] of sites.entries()) {
    const site = assertRecord(rawSite, `lunarSites[${idx}]`);
    const expeditionId = assertEnum(site.expeditionId, EXPEDITION_IDS, `lunarSites[${idx}].expeditionId`);
    seen.add(expeditionId);
    const location = assertRecord(site.representativeLocation, `lunarSites[${idx}].representativeLocation`);
    assertString(location.name, 'representativeLocation.name');
    assertFiniteNum(location.latitudeDeg, 'representativeLocation.latitudeDeg', -90, 90);
    assertFiniteNum(location.longitudeDegEast, 'representativeLocation.longitudeDegEast', -180, 180);
    const bbox = assertArray(location.bbox, 'representativeLocation.bbox');
    if (bbox.length !== 4) throw new Error('representativeLocation.bbox must contain 4 numbers');
    bbox.forEach((value, bboxIdx) => assertFiniteNum(value, `representativeLocation.bbox[${bboxIdx}]`, -180, 180));
    assertEnum(location.provenance, PROVENANCE_TAGS, 'representativeLocation.provenance');
    assertString(location.source, 'representativeLocation.source');
    assertEnum(site.mappingProvenance, PROVENANCE_TAGS, 'site.mappingProvenance');
    for (const key of ['terrain', 'thermal'] as const) {
      const product = assertRecord(site[key], `lunarSites[${idx}].${key}`);
      assertString(product.productId, `${key}.productId`);
      if (key === 'terrain') assertString(product.datasetReleaseId, `${key}.datasetReleaseId`);
      assertString(product.layerId, `${key}.layerId`);
      assertString(product.unit, `${key}.unit`);
      assertEnum(product.provenance, PROVENANCE_TAGS, `${key}.provenance`);
      assertString(product.source, `${key}.source`);
    }
    assertString(site.gameplayNote, 'site.gameplayNote');
  }
  if (seen.size !== EXPEDITION_IDS.length) throw new Error('lunar-sites.json must cover every expedition');
  return sites as unknown as readonly LunarSiteConfig[];
}

export function validateCrewPhysiology(input: unknown): CrewPhysiologyDataset {
  const data = assertRecord(input, 'crewPhysiology');
  assertString(data.datasetId, 'crewPhysiology.datasetId');
  assertString(data.instrumentId, 'crewPhysiology.instrumentId');
  assertString(data.trajectory, 'crewPhysiology.trajectory');
  assertString(data.queryUrl, 'crewPhysiology.queryUrl');
  const period = assertRecord(data.sampledPeriod, 'crewPhysiology.sampledPeriod');
  assertString(period.startInclusive, 'sampledPeriod.startInclusive');
  assertString(period.endExclusive, 'sampledPeriod.endExclusive');
  assertInt(data.recordCount, 'crewPhysiology.recordCount', 1);
  const dose = assertRecord(data.absorbedDoseRateUGyPerHour, 'crewPhysiology.absorbedDoseRateUGyPerHour');
  assertFiniteNum(dose.mean, 'absorbedDoseRateUGyPerHour.mean', 0);
  assertFiniteNum(dose.min, 'absorbedDoseRateUGyPerHour.min', 0);
  assertFiniteNum(dose.max, 'absorbedDoseRateUGyPerHour.max', 0);
  assertFiniteNum(data.convertedMeanMgyPerDay, 'crewPhysiology.convertedMeanMgyPerDay', 0);
  assertString(data.conversionFormula, 'crewPhysiology.conversionFormula');
  assertString(data.sha256, 'crewPhysiology.sha256');
  assertEnum(data.provenance, PROVENANCE_TAGS, 'crewPhysiology.provenance');
  assertString(data.caveat, 'crewPhysiology.caveat');
  assertString(data.source, 'crewPhysiology.source');
  return data as unknown as CrewPhysiologyDataset;
}

function validateLifeSupportSnapshot(s: Record<string, unknown>): void {
  const res = assertRecord(s.resources, 'state.resources');
  for (const rk of ['batteryKWh', 'oxygenKg', 'waterL', 'partsKg', 'wasteWaterL']) {
    assertFiniteNum(res[rk], `resources.${rk}`, 0);
  }
  assertInt(res.mrePacks, 'resources.mrePacks', 0);
  assertInt(res.medkits, 'resources.medkits', 0);
  if (res.medkitLevel !== 1 && res.medkitLevel !== 2) throw new Error('resources.medkitLevel must be 1|2');
  assertInt(res.waterZeroStreak, 'resources.waterZeroStreak', 0);
  assertInt(res.oxygenZeroStreak, 'resources.oxygenZeroStreak', 0);

  const systems = assertRecord(s.systems, 'state.systems');
  for (const sysId of SYSTEM_IDS) {
    const sys = assertRecord(systems[sysId], `systems.${sysId}`);
    if (sys.id !== sysId) throw new Error(`systems.${sysId}.id mismatch`);
    assertInt(sys.level, `systems.${sysId}.level`, 1, 3);
    assertFiniteNum(sys.integrity, `systems.${sysId}.integrity`, 0, 1);
    assertEnum(sys.status, SYSTEM_STATUSES, `systems.${sysId}.status`);
  }

  const crew = assertRecord(s.crew, 'state.crew');
  for (const crewId of CREW_IDS) {
    const m = assertRecord(crew[crewId], `crew.${crewId}`);
    if (m.id !== crewId) throw new Error(`crew.${crewId}.id mismatch`);
    assertString(m.name, `crew.${crewId}.name`);
    assertString(m.roleTag, `crew.${crewId}.roleTag`);
    assertFiniteNum(m.health, `crew.${crewId}.health`, 0, 100);
    assertFiniteNum(m.morale, `crew.${crewId}.morale`, 0, 100);
    assertFiniteNum(m.satiety, `crew.${crewId}.satiety`, 0, 100);
    assertEnum(m.condition, CREW_CONDITIONS, `crew.${crewId}.condition`);
    assertEnum(m.hungerState, HUNGER_STATES, `crew.${crewId}.hungerState`);
    assertFiniteNum(m.radiationMgy, `crew.${crewId}.radiationMgy`, 0);
    if (m.assignedTask !== null) {
      const task = assertRecord(m.assignedTask, `crew.${crewId}.assignedTask`);
      assertEnum(task.type, CREW_TASK_TYPES, `crew.${crewId}.assignedTask.type`);
      if (task.targetSystemId !== undefined) assertEnum(task.targetSystemId, SYSTEM_IDS, 'assignedTask.targetSystemId');
      if (task.targetCrewId !== undefined) assertEnum(task.targetCrewId, CREW_IDS, 'assignedTask.targetCrewId');
      if (task.partsSpent !== undefined) assertFiniteNum(task.partsSpent, 'assignedTask.partsSpent', 0);
    }
  }

}

export function validateGameStateStructure(input: unknown): GameState {
  const s = assertRecord(input, 'state');
  if (s.schemaVersion !== 4) throw new Error('GameState schemaVersion must be 4');
  assertString(s.contentVersion, 'state.contentVersion');
  assertString(s.modelVersion, 'state.modelVersion');
  assertString(s.catalogVersion, 'state.catalogVersion');
  assertInt(s.revision, 'state.revision', 0);

  const camp = assertRecord(s.campaign, 'state.campaign');
  if (camp.id !== 'moon-32' || camp.planet !== 'moon') throw new Error('Invalid campaign id/planet');
  assertString(camp.runId, 'campaign.runId');
  assertEnum(camp.status, CAMPAIGN_STATUSES, 'campaign.status');
  assertEnum(camp.difficulty, DIFFICULTIES, 'campaign.difficulty');
  assertFiniteNum(camp.seed, 'campaign.seed');
  assertString(camp.donkiProfileId, 'campaign.donkiProfileId');
  if (camp.spaceWeatherOverride !== undefined && camp.spaceWeatherOverride !== 'quiet') {
    throw new Error('Invalid campaign.spaceWeatherOverride');
  }
  assertInt(camp.targetSol, 'campaign.targetSol', 1, 32);
  assertInt(camp.sciencePoints, 'campaign.sciencePoints', 0);
  assertNullableString(camp.endReason, 'campaign.endReason');
  if (camp.outcome !== null) {
    const outcome = assertRecord(camp.outcome, 'campaign.outcome');
    assertEnum(outcome.status, ['active', 'victory', 'defeat'] as const, 'outcome.status');
    if (outcome.reasonCode !== null) assertEnum(outcome.reasonCode, ['moon-victory', 'crew-collapse', 'oxygen-depleted', 'water-depleted', 'final-requirements-unmet', 'legacy-outcome'] as const, 'outcome.reasonCode');
    if (outcome.rank !== null) assertEnum(outcome.rank, ['S', 'A', 'B'] as const, 'outcome.rank');
    assertNullableString(outcome.rankingVersion, 'outcome.rankingVersion');
    assertArray(outcome.requirements, 'outcome.requirements').forEach((rawRequirement) => {
      const requirement = assertRecord(rawRequirement, 'outcome.requirement');
      assertString(requirement.id, 'requirement.id');
      assertBool(requirement.met, 'requirement.met');
      assertFiniteNum(requirement.actual, 'requirement.actual');
      assertFiniteNum(requirement.target, 'requirement.target');
    });
    if (outcome.status !== camp.status) throw new Error('Outcome must match campaign status.');
    if (outcome.status !== 'victory' && outcome.rank !== null) throw new Error('Only victory may have a rank.');
  }

  const clock = assertRecord(s.clock, 'state.clock');
  assertInt(clock.sol, 'clock.sol', 1, 32);
  assertEnum(clock.phase, SOL_PHASES, 'clock.phase');
  assertInt(clock.resolutionIndex, 'clock.resolutionIndex', 0);

  validateLifeSupportSnapshot(s);

  const equipment = assertRecord(s.equipment, 'state.equipment');
  for (const eqId of EQUIPMENT_IDS) {
    const eq = assertRecord(equipment[eqId], `equipment.${eqId}`);
    if (eq.id !== eqId) throw new Error(`equipment.${eqId}.id mismatch`);
    assertBool(eq.owned, `equipment.${eqId}.owned`);
    if (eq.level !== 1 && eq.level !== 2) throw new Error(`equipment.${eqId}.level must be 1|2`);
    assertFiniteNum(eq.durability, `equipment.${eqId}.durability`, 0, 100);
    assertEnum(eq.state, EQUIPMENT_CONDITIONS, `equipment.${eqId}.state`);
    assertBool(eq.reservedForRover, `equipment.${eqId}.reservedForRover`);
  }

  const fab = assertRecord(s.fabricator, 'state.fabricator');
  assertBool(fab.usedThisSol, 'fabricator.usedThisSol');
  if (fab.activeJob !== null) {
    const job = assertRecord(fab.activeJob, 'fabricator.activeJob');
    assertEnum(job.action, FABRICATOR_ACTIONS, 'activeJob.action');
    assertEnum(job.itemId, ITEM_IDS, 'activeJob.itemId');
    assertInt(job.startedSol, 'activeJob.startedSol', 1, 32);
    assertInt(job.solsRemaining, 'activeJob.solsRemaining', 1, 10);
    assertFiniteNum(job.partsSpent, 'activeJob.partsSpent', 0);
    assertFiniteNum(job.waterSpent, 'activeJob.waterSpent', 0);
    assertFiniteNum(job.batteryReserved, 'activeJob.batteryReserved', 0);
  }

  const dp = assertRecord(s.dailyPlan, 'state.dailyPlan');
  assertInt(dp.sol, 'dailyPlan.sol', 1, 32);
  assertEnum(dp.status, ['draft', 'committed'] as const, 'dailyPlan.status');
  assertBool(dp.wrsEnabled, 'dailyPlan.wrsEnabled');
  const prio = assertArray(dp.powerPriority, 'dailyPlan.powerPriority');
  if (prio.length !== 4) throw new Error('dailyPlan.powerPriority must have 4 elements');
  prio.forEach((p, idx) => assertEnum(p, POWER_CONSUMER_IDS, `dailyPlan.powerPriority[${idx}]`));
  if (new Set(prio).size !== 4) throw new Error('dailyPlan.powerPriority must contain unique consumers');
  assertArray(dp.mreTargets, 'dailyPlan.mreTargets').forEach((id, idx) => assertEnum(id, CREW_IDS, `mreTargets[${idx}]`));

  const rover = assertRecord(s.rover, 'state.rover');
  const validateIncidents = (value: unknown, label: string) => {
    assertArray(value, label).forEach((rawIncident, idx) => {
      const incident = assertRecord(rawIncident, `${label}[${idx}]`);
      assertEnum(incident.kind, ROVER_INCIDENT_KINDS, `${label}[${idx}].kind`);
      assertInt(incident.occurredSol, `${label}[${idx}].occurredSol`, 1, 32);
      assertString(incident.summary, `${label}[${idx}].summary`);
    });
  };
  if (rover.activeMission !== null) {
    const mission = assertRecord(rover.activeMission, 'rover.activeMission');
    assertEnum(mission.expeditionId, EXPEDITION_IDS, 'activeMission.expeditionId');
    assertEnum(mission.status, ROVER_MISSION_STATUSES, 'activeMission.status');
    assertInt(mission.scheduledSol, 'activeMission.scheduledSol', 1, 32);
    if (mission.launchedSol !== null) assertInt(mission.launchedSol, 'activeMission.launchedSol', 1, 32);
    assertInt(mission.statusEnteredSol, 'activeMission.statusEnteredSol', 1, 32);
    if (mission.expectedReturnSol !== null) assertInt(mission.expectedReturnSol, 'activeMission.expectedReturnSol', 1, 40);
    assertEnum(mission.launchOperatorCrewId, CREW_IDS, 'activeMission.launchOperatorCrewId');
    if (mission.recoveryOperatorCrewId !== null) assertEnum(mission.recoveryOperatorCrewId, CREW_IDS, 'activeMission.recoveryOperatorCrewId');
    assertArray(mission.equippedItems, 'activeMission.equippedItems').forEach((id, idx) => assertEnum(id, EQUIPMENT_IDS, `activeMission.equippedItems[${idx}]`));
    assertInt(mission.travelTicksCompleted, 'activeMission.travelTicksCompleted', 0, 3);
    assertInt(mission.signalLostSols, 'activeMission.signalLostSols', 0, 3);
    if (mission.resumeStatus !== null) assertEnum(mission.resumeStatus, ROVER_TRAVEL_STATUSES, 'activeMission.resumeStatus');
    assertInt(mission.recoveryDelaySols, 'activeMission.recoveryDelaySols', 0, 1);
    validateIncidents(mission.incidents, 'activeMission.incidents');
  }
  assertArray(rover.missionHistory, 'rover.missionHistory').forEach((rawResult, idx) => {
    const result = assertRecord(rawResult, `rover.missionHistory[${idx}]`);
    assertEnum(result.expeditionId, EXPEDITION_IDS, `missionHistory[${idx}].expeditionId`);
    assertEnum(result.outcome, ['completed', 'failed'] as const, `missionHistory[${idx}].outcome`);
    if (result.launchedSol !== null) assertInt(result.launchedSol, `missionHistory[${idx}].launchedSol`, 1, 32);
    assertInt(result.settledSol, `missionHistory[${idx}].settledSol`, 1, 40);
    assertNullableString(result.rewardSampleGranted, `missionHistory[${idx}].rewardSampleGranted`);
    assertInt(result.scienceGranted, `missionHistory[${idx}].scienceGranted`, 0);
    if (result.launchOperatorCrewId !== null) assertEnum(result.launchOperatorCrewId, CREW_IDS, `missionHistory[${idx}].launchOperatorCrewId`);
    if (result.recoveryOperatorCrewId !== null) assertEnum(result.recoveryOperatorCrewId, CREW_IDS, `missionHistory[${idx}].recoveryOperatorCrewId`);
    assertArray(result.equippedItems, `missionHistory[${idx}].equippedItems`).forEach((id, eqIdx) => assertEnum(id, EQUIPMENT_IDS, `missionHistory[${idx}].equippedItems[${eqIdx}]`));
    validateIncidents(result.incidents, `missionHistory[${idx}].incidents`);
  });

  const events = assertRecord(s.events, 'state.events');
  assertNullableString(events.activeEventId, 'events.activeEventId');
  if (events.activeEvent !== null) {
    const ae = assertRecord(events.activeEvent, 'events.activeEvent');
    assertString(ae.eventId, 'activeEvent.eventId');
    assertInt(ae.triggeredAtSol, 'activeEvent.triggeredAtSol', 1, 32);
    assertInt(ae.deadlineSol, 'activeEvent.deadlineSol', 1, 64);
    const ctx = assertRecord(ae.context, 'activeEvent.context');
    for (const [ck, cv] of Object.entries(ctx)) {
      if (typeof cv !== 'boolean' && typeof cv !== 'string' && (typeof cv !== 'number' || !Number.isFinite(cv))) {
        throw new Error(`Invalid activeEvent.context.${ck}`);
      }
    }
  }
  assertStringArray(events.resolvedEventIds, 'events.resolvedEventIds');
  assertArray(events.occurrenceHistory, 'events.occurrenceHistory').forEach((rawOcc, idx) => {
    const occ = assertRecord(rawOcc, `events.occurrenceHistory[${idx}]`);
    assertString(occ.eventId, `occurrenceHistory[${idx}].eventId`);
    assertInt(occ.triggeredSol, `occurrenceHistory[${idx}].triggeredSol`, 1, 32);
    assertInt(occ.settledSol, `occurrenceHistory[${idx}].settledSol`, 1, 64);
    assertEnum(occ.outcome, ['resolved', 'expired'] as const, `occurrenceHistory[${idx}].outcome`);
    assertNullableString(occ.choiceId, `occurrenceHistory[${idx}].choiceId`);
  });
  const flags = assertRecord(events.flags, 'events.flags');
  for (const [fk, fv] of Object.entries(flags)) {
    if (typeof fv !== 'boolean' && typeof fv !== 'string' && (typeof fv !== 'number' || !Number.isFinite(fv))) {
      throw new Error(`Invalid events.flags.${fk}`);
    }
  }
  assertArray(events.pendingFollowUps, 'events.pendingFollowUps').forEach((rawFu, idx) => {
    const fu = assertRecord(rawFu, `events.pendingFollowUps[${idx}]`);
    assertString(fu.eventId, `pendingFollowUps[${idx}].eventId`);
    assertInt(fu.triggerSol, `pendingFollowUps[${idx}].triggerSol`, 1, 64);
    assertString(fu.sourceEventId, `pendingFollowUps[${idx}].sourceEventId`);
    assertString(fu.sourceChoiceId, `pendingFollowUps[${idx}].sourceChoiceId`);
  });

  const logi = assertRecord(s.logistics, 'state.logistics');
  if (logi.activeOrder !== null) {
    const ord = assertRecord(logi.activeOrder, 'logistics.activeOrder');
    assertString(ord.id, 'activeOrder.id');
    assertInt(ord.orderedAtSol, 'activeOrder.orderedAtSol', 1, 32);
    assertInt(ord.arrivalSol, 'activeOrder.arrivalSol', 1, 40);
    const slots = assertRecord(ord.slots, 'activeOrder.slots');
    for (const [sk, sv] of Object.entries(slots)) {
      assertEnum(sk, CARGO_PACK_IDS, `activeOrder.slots.${sk}`);
      assertInt(sv, `activeOrder.slots.${sk}`, 0, 10);
    }
  }
  assertInt(logi.padCooldownSols, 'logistics.padCooldownSols', 0);
  assertArray(logi.radioMessages, 'logistics.radioMessages').forEach((rm, idx) => {
    const msg = assertRecord(rm, `radioMessages[${idx}]`);
    assertString(msg.id, 'radioMessage.id');
    assertInt(msg.sentSol, 'radioMessage.sentSol', 1, 32);
    if (typeof msg.prompt !== 'string') throw new Error('radioMessage.prompt must be string');
    assertEnum(msg.status, ['transmitting', 'reply-received'] as const, 'radioMessage.status');
    assertNullableString(msg.reply, 'radioMessage.reply');
    assertFiniteNum(msg.replyReadyAtMs, 'radioMessage.replyReadyAtMs', 0);
  });

  const debrief = assertRecord(s.debrief, 'state.debrief');
  assertBool(debrief.pendingDismiss, 'debrief.pendingDismiss');
  const validateSummary = (value: unknown) => {
    const summary = assertRecord(value, 'SolSummary');
    assertInt(summary.sol, 'summary.sol', 1, 32);
    assertBool(summary.isLunarNight, 'summary.isLunarNight');
    assertBool(summary.blackout, 'summary.blackout');
    for (const key of ['powerGeneratedKWh', 'powerConsumedKWh', 'wrsRecoveredWaterL']) assertFiniteNum(summary[key], `summary.${key}`, 0);
    if (summary.checkpoint !== null) {
      const checkpoint = assertRecord(summary.checkpoint, 'summary.checkpoint');
      validateLifeSupportSnapshot(checkpoint);
      for (const key of ['wrsProcessedWasteWaterL', 'solarGeneratedKWh', 'fissionGeneratedKWh', 'batteryOverflowKWh', 'essentialUnmetKWh']) assertFiniteNum(checkpoint[key], `checkpoint.${key}`, 0);
      assertInt(checkpoint.completedExpeditions, 'checkpoint.completedExpeditions', 0, 3);
      assertInt(checkpoint.sciencePoints, 'checkpoint.sciencePoints', 0);
      if (Number(summary.wrsRecoveredWaterL) > Number(checkpoint.wrsProcessedWasteWaterL) + 0.01) throw new Error('WRS cannot recover more than processed water.');
    }
  };
  if (debrief.lastSummary !== null) validateSummary(debrief.lastSummary);

  const hist = assertRecord(s.history, 'state.history');
  assertArray(hist.summaries, 'history.summaries').forEach(validateSummary);
  assertArray(hist.logs, 'history.logs');

  return s as unknown as GameState;
}

export function validateSaveEnvelopeStructure(input: unknown): SaveEnvelope {
  const env = assertRecord(input, 'saveEnvelope');
  if (env.schemaVersion !== 4) throw new Error('Unsupported save schemaVersion');
  assertString(env.savedAt, 'save.savedAt');
  assertString(env.appVersion, 'save.appVersion');
  assertString(env.contentVersion, 'save.contentVersion');
  assertString(env.modelVersion, 'save.modelVersion');
  assertString(env.catalogVersion, 'save.catalogVersion');
  assertString(env.checksum, 'save.checksum');
  validateGameStateStructure(env.state);
  return env as unknown as SaveEnvelope;
}

export function validateGameCommand(input: unknown): GameCommand {
  const cmd = assertRecord(input, 'command');
  const type = assertString(cmd.type, 'command.type');

  switch (type) {
    case 'game/start':
      if (cmd.seed !== undefined) assertFiniteNum(cmd.seed, 'command.seed');
      if (cmd.difficulty !== undefined) assertEnum(cmd.difficulty, DIFFICULTIES, 'command.difficulty');
      if (cmd.donkiProfileId !== undefined) assertString(cmd.donkiProfileId, 'command.donkiProfileId');
      if (cmd.spaceWeatherOverride !== undefined && cmd.spaceWeatherOverride !== 'quiet') {
        throw new Error('Invalid spaceWeatherOverride');
      }
      return cmd as unknown as GameCommand;

    case 'phase/advance':
    case 'fabricator/cancel':
    case 'rover/cancel-schedule':
    case 'rover/recover-signal':
    case 'sol/end':
    case 'debrief/dismiss':
      return cmd as unknown as GameCommand;

    case 'event/resolve':
      assertString(cmd.eventId, 'command.eventId');
      assertString(cmd.choiceId, 'command.choiceId');
      return cmd as unknown as GameCommand;

    case 'crew/assign':
      assertEnum(cmd.crewId, CREW_IDS, 'command.crewId');
      assertEnum(cmd.task, CREW_TASK_TYPES, 'command.task');
      if (cmd.targetSystemId !== undefined) assertEnum(cmd.targetSystemId, SYSTEM_IDS, 'command.targetSystemId');
      if (cmd.targetCrewId !== undefined) assertEnum(cmd.targetCrewId, CREW_IDS, 'command.targetCrewId');
      return cmd as unknown as GameCommand;

    case 'crew/unassign':
      assertEnum(cmd.crewId, CREW_IDS, 'command.crewId');
      return cmd as unknown as GameCommand;

    case 'fabricator/queue':
      assertEnum(cmd.action, FABRICATOR_ACTIONS, 'command.action');
      assertEnum(cmd.itemId, ITEM_IDS, 'command.itemId');
      return cmd as unknown as GameCommand;

    case 'comms/send-radio':
      assertString(cmd.id, 'command.id');
      assertString(cmd.message, 'command.message');
      if (cmd.nowMs !== undefined) assertFiniteNum(cmd.nowMs, 'command.nowMs', 0);
      return cmd as unknown as GameCommand;

    case 'comms/tick-radio':
      assertFiniteNum(cmd.nowMs, 'command.nowMs', 0);
      return cmd as unknown as GameCommand;

    case 'comms/order-cargo': {
      const slots = assertRecord(cmd.slots, 'command.slots');
      for (const [k, v] of Object.entries(slots)) {
        assertEnum(k, CARGO_PACK_IDS, `command.slots.${k}`);
        assertInt(v, `command.slots.${k}`, 0, 10);
      }
      return cmd as unknown as GameCommand;
    }

    case 'rover/schedule': {
      assertEnum(cmd.expeditionId, EXPEDITION_IDS, 'command.expeditionId');
      assertEnum(cmd.launchOperatorCrewId, CREW_IDS, 'command.launchOperatorCrewId');
      const eqs = assertArray(cmd.equipmentIds, 'command.equipmentIds');
      eqs.forEach((id, idx) => assertEnum(id, EQUIPMENT_IDS, `command.equipmentIds[${idx}]`));
      if (new Set(eqs).size !== eqs.length) throw new Error('Duplicate equipmentIds in rover/schedule');
      return cmd as unknown as GameCommand;
    }

    case 'rover/set-recovery-operator':
      assertEnum(cmd.crewId, CREW_IDS, 'command.crewId');
      return cmd as unknown as GameCommand;

    case 'crew/use-medkit':
      assertEnum(cmd.targetCrewId, CREW_IDS, 'command.targetCrewId');
      if (cmd.administeredByCrewId !== undefined) assertEnum(cmd.administeredByCrewId, CREW_IDS, 'command.administeredByCrewId');
      return cmd as unknown as GameCommand;

    case 'rationing/set-wrs':
      assertBool(cmd.enabled, 'command.enabled');
      return cmd as unknown as GameCommand;

    case 'rationing/set-power-priority': {
      const order = assertArray(cmd.order, 'command.order');
      if (order.length !== 4) throw new Error('command.order must contain 4 power consumers');
      order.forEach((id, idx) => assertEnum(id, POWER_CONSUMER_IDS, `command.order[${idx}]`));
      if (new Set(order).size !== 4) throw new Error('command.order must contain 4 distinct power consumers');
      return cmd as unknown as GameCommand;
    }

    case 'rationing/toggle-mre':
      assertEnum(cmd.crewId, CREW_IDS, 'command.crewId');
      if (cmd.enabled !== undefined) assertBool(cmd.enabled, 'command.enabled');
      return cmd as unknown as GameCommand;

    default:
      throw new Error(`Unsupported command type: ${type}`);
  }
}

let cachedBundle: ContentBundle | null = null;
let runCounter = 0;

function generateRunId(seed: number): string {
  runCounter += 1;
  const uuid =
    typeof globalThis !== 'undefined' &&
    'crypto' in globalThis &&
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}-${runCounter}`;
  return `run-moon32-${seed}-${uuid}`;
}

/** Load and validate the bundled static JSON configs and NASA DONKI/Diviner catalogs. */
export function loadContentBundle(): ContentBundle {
  if (cachedBundle) return cachedBundle;
  cachedBundle = {
    balance: validateBalanceConfig(balanceRaw),
    crewCatalog: validateCrewCatalog(crewRaw),
    recipes: validateRecipeCatalog(recipesRaw),
    campaign: validateCampaignConfig(campaignRaw),
    catalog: validateSimulationCatalog(catalogRaw),
    donki: validateDonkiCatalog(donkiRaw),
    events: validateEventsCatalog(eventsRaw),
    briefs: validateScienceBriefs(briefsRaw),
    lunarSites: validateLunarSites(lunarSitesRaw),
    crewPhysiology: validateCrewPhysiology(crewPhysiologyRaw),
  };
  return cachedBundle;
}

export interface NewGameOptions {
  readonly runId?: string;
  readonly seed?: number;
  readonly difficulty?: DifficultyId;
  readonly donkiProfileId?: string;
  readonly spaceWeatherOverride?: 'quiet';
}

/** Build a fresh canonical Sol 1 GameState initialized from static JSON templates. */
export function createInitialGameState(
  bundle: ContentBundle = loadContentBundle(),
  options: NewGameOptions = {}
): GameState {
  const base = validateGameStateStructure(structuredClone(initialStateRaw));
  const donkiProfileId =
    options.donkiProfileId && bundle.donki.samples.some((s) => s.id === options.donkiProfileId)
      ? options.donkiProfileId
      : base.campaign.donkiProfileId;
  const seed = options.seed ?? base.campaign.seed;

  return {
    ...base,
    contentVersion: bundle.balance.contentVersion,
    modelVersion: bundle.balance.modelVersion,
    catalogVersion: bundle.catalog.catalogVersion,
    campaign: {
      ...base.campaign,
      runId: options.runId ?? generateRunId(seed),
      seed,
      difficulty: options.difficulty ?? base.campaign.difficulty,
      donkiProfileId,
      ...(options.spaceWeatherOverride ? { spaceWeatherOverride: options.spaceWeatherOverride } : {}),
    },
  };
}
