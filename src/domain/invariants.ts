import type { ContentBundle, DomainError, GameState, SystemId, CrewId, EquipmentId } from '../types/index.ts';

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

/** Validate core constitutional invariants on a GameState snapshot (returns first DomainError or null). */
export function validateStateInvariants(state: GameState, bundle: ContentBundle): DomainError | null {
  const makeErr = (message: string): DomainError => ({
    code: 'E_STATE_INVALID',
    message,
    recoverable: false,
  });

  if (state.schemaVersion !== 2) return makeErr('Invalid schemaVersion');
  if (!Number.isInteger(state.revision) || state.revision < 0) return makeErr('revision must be a non-negative integer');
  if (!Number.isInteger(state.clock.resolutionIndex) || state.clock.resolutionIndex < 0) {
    return makeErr('resolutionIndex must be a non-negative integer');
  }

  if (state.campaign.status === 'active') {
    if (!Number.isInteger(state.clock.sol) || state.clock.sol < 1 || state.clock.sol > state.campaign.targetSol) {
      return makeErr(`Active campaign sol out of bounds: ${state.clock.sol}`);
    }
  }

  const r = state.resources;
  const numericResources: Array<[string, number]> = [
    ['batteryKWh', r.batteryKWh],
    ['oxygenKg', r.oxygenKg],
    ['waterL', r.waterL],
    ['partsKg', r.partsKg],
    ['wasteWaterL', r.wasteWaterL],
    ['mrePacks', r.mrePacks],
    ['medkits', r.medkits],
  ];
  for (const [name, val] of numericResources) {
    if (!Number.isFinite(val) || val < 0) {
      return makeErr(`Resource "${name}" must be finite and non-negative (got ${val})`);
    }
  }

  if (r.batteryKWh > bundle.balance.storages.batteryKWh.max + 1e-6) {
    return makeErr(`batteryKWh (${r.batteryKWh}) exceeds max capacity (${bundle.balance.storages.batteryKWh.max})`);
  }
  if (r.oxygenKg > bundle.balance.storages.oxygenKg.max + 1e-6) {
    return makeErr(`oxygenKg (${r.oxygenKg}) exceeds max capacity (${bundle.balance.storages.oxygenKg.max})`);
  }
  if (r.waterL > bundle.balance.storages.waterL.max + 1e-6) {
    return makeErr(`waterL (${r.waterL}) exceeds max capacity (${bundle.balance.storages.waterL.max})`);
  }
  if (r.partsKg > bundle.balance.storages.partsKg.max + 1e-6) {
    return makeErr(`partsKg (${r.partsKg}) exceeds max capacity (${bundle.balance.storages.partsKg.max})`);
  }

  for (const sysId of SYSTEM_IDS) {
    const sys = state.systems[sysId];
    if (sys.level < 1 || sys.level > bundle.balance.systems.maxLevel) {
      return makeErr(`System "${sysId}" level out of range: ${sys.level}`);
    }
    if (!Number.isFinite(sys.integrity) || sys.integrity < 0 || sys.integrity > 1) {
      return makeErr(`System "${sysId}" integrity out of range [0..1]: ${sys.integrity}`);
    }
  }

  for (const crewId of CREW_IDS) {
    const c = state.crew[crewId];
    if (!Number.isFinite(c.health) || c.health < 0 || c.health > 100) {
      return makeErr(`Crew "${crewId}" health out of range: ${c.health}`);
    }
    if (!Number.isFinite(c.morale) || c.morale < 0 || c.morale > 100) {
      return makeErr(`Crew "${crewId}" morale out of range: ${c.morale}`);
    }
    if (!Number.isFinite(c.satiety) || c.satiety < 0 || c.satiety > 100) {
      return makeErr(`Crew "${crewId}" satiety out of range: ${c.satiety}`);
    }
    if (c.condition === 'evacuated' && c.assignedTask !== null) {
      return makeErr(`Evacuated crew "${crewId}" cannot hold an assigned task`);
    }
  }

  if (state.dailyPlan.sol !== state.clock.sol) {
    return makeErr(`dailyPlan.sol (${state.dailyPlan.sol}) !== clock.sol (${state.clock.sol})`);
  }

  // Unique MRE target list
  if (new Set(state.dailyPlan.mreTargets).size !== state.dailyPlan.mreTargets.length) {
    return makeErr('Duplicate crew IDs in dailyPlan.mreTargets');
  }
  // Equipment durability bounds & exact Rover reservation consistency
  const activeItems = new Set(state.rover.activeMission?.equippedItems ?? []);
  for (const eqId of EQUIPMENT_IDS) {
    const eq = state.equipment[eqId];
    if (!Number.isFinite(eq.durability) || eq.durability < 0 || eq.durability > 100) {
      return makeErr(`Equipment "${eqId}" durability out of bounds: ${eq.durability}`);
    }
    if (eq.reservedForRover !== activeItems.has(eqId)) {
      return makeErr(`Equipment "${eqId}" reservation does not match activeMission`);
    }
  }

  const active = state.rover.activeMission;
  if (active) {
    if (active.equippedItems.length > 3 || new Set(active.equippedItems).size !== active.equippedItems.length) {
      return makeErr('activeMission equipment must be unique and limited to 3 items');
    }
    if (active.status === 'scheduled' && active.launchedSol !== null) {
      return makeErr('Scheduled mission cannot have launchedSol');
    }
    if (active.status !== 'scheduled' && active.launchedSol === null) {
      return makeErr(`Mission status "${active.status}" requires launchedSol`);
    }
    if (active.status === 'signal-lost' && active.resumeStatus === null) {
      return makeErr('signal-lost mission requires resumeStatus');
    }
  }

  const resultIds = state.rover.missionHistory.map((m) => m.expeditionId);
  if (new Set(resultIds).size !== resultIds.length) {
    return makeErr('Each expedition may be settled only once');
  }
  if (
    active &&
    resultIds.includes(active.expeditionId) &&
    active.status !== 'completed' &&
    active.status !== 'failed'
  ) {
    return makeErr('Non-terminal active expedition already exists in missionHistory');
  }
  const scienceGranted = state.rover.missionHistory.reduce((sum, result) => sum + result.scienceGranted, 0);
  if (state.campaign.sciencePoints !== scienceGranted) {
    return makeErr('campaign.sciencePoints must equal settled mission science grants');
  }

  // Unique radio message IDs & sample IDs
  const radioIds = state.logistics.radioMessages.map((m) => m.id);
  if (new Set(radioIds).size !== radioIds.length) {
    return makeErr('Duplicate radio message IDs detected');
  }

  return null;
}

/** Throw if any constitutional invariant fails (used in tests and post-transition guards). */
export function assertGameState(state: GameState, bundle: ContentBundle): void {
  const err = validateStateInvariants(state, bundle);
  if (err) {
    throw new Error(`[${err.code}] ${err.message}`);
  }
}
