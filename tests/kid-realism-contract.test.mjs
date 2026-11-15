import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

// Kid-realism contract: the game promises NASA-grade science numbers wrapped in a
// forgiving management layer for 7-12 year olds (docs/game-design/
// HUMAN_FRONTIER_2050_GAME_SETUP.md, docs/architecture/CONSTRAINTS.md §3).
// These tests pin the science backbone to real-world measured ranges, pin the
// management layer to the GDD, and prove no single Sol (or single event choice)
// can unfairly destroy a kid's campaign.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadModules() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/schemas/contracts.ts';
        export * from './src/domain/spaceWeather.ts';
        export * from './src/domain/endSolResolver.ts';
        export * from './src/domain/invariants.ts';
        export * from './src/simulation/campaignRunner.ts';
        export * from './src/simulation/policies.ts';
        export * from './src/simulation/replay.ts';
      `,
      resolveDir: rootDir,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text, 'utf8').toString('base64')}`);
}

const core = await loadModules();
const bundle = core.loadContentBundle();
const balance = bundle.balance;
const campaign = bundle.campaign;

function quietState(overrides = {}) {
  return core.createInitialGameState(bundle, { seed: 205099, spaceWeatherOverride: 'quiet', ...overrides });
}

/** Resolve one Sol with a minimal committed plan (no tasks, WRS optional). */
function resolveOneSol(state, { wrsEnabled = false, mreTargets = [] } = {}) {
  const prepared = {
    ...state,
    dailyPlan: {
      sol: state.clock.sol,
      status: 'committed',
      wrsEnabled,
      powerPriority: ['eclss', 'wrs', 'fabricator', 'rover'],
      mreTargets,
    },
  };
  return core.resolveSol(prepared, bundle, 'commit');
}

function finiteAndNonNegative(resources) {
  for (const [key, value] of Object.entries(resources)) {
    if (typeof value !== 'number') continue;
    assert.ok(Number.isFinite(value), `${key} must be finite, got ${value}`);
    assert.ok(value >= 0, `${key} must never go negative, got ${value}`);
  }
}

test('GDD contract: balance.json carries the documented 4 storages + MRE/Medkit ledger', () => {
  assert.deepEqual(
    { battery: [balance.storages.batteryKWh.initial, balance.storages.batteryKWh.max],
      oxygen: [balance.storages.oxygenKWh ?? balance.storages.oxygenKg.initial, balance.storages.oxygenKg.max],
      water: [balance.storages.waterL.initial, balance.storages.waterL.max],
      parts: [balance.storages.partsKg.initial, balance.storages.partsKg.max] },
    { battery: [40, 60], oxygen: [70, 120], water: [80, 160], parts: [16, 60] }
  );
  assert.deepEqual([balance.consumables.mrePacks.initial, balance.consumables.mrePacks.max, balance.consumables.mrePacks.satietyRestore], [24, 60, 75]);
  assert.deepEqual([balance.consumables.medkits.initial, balance.consumables.medkits.max], [2, 6]);
  // Round-number UI tiers from GDD §3.2 (kids read these numbers directly).
  for (const max of Object.values(balance.storages).map((s) => s.max)) {
    assert.equal(max % 20, 0, `storage max ${max} should stay on a round kid-readable tier`);
  }
});

test('GDD contract: power & ECLSS numbers match the design doc exactly', () => {
  assert.equal(balance.power.fissionKWhPerSol, 8);
  assert.equal(balance.power.essentialLoadKWh, 12);
  assert.deepEqual(balance.power.solarByLevelKWh, { '1': 24, '2': 30, '3': 36 });
  assert.deepEqual(balance.power.blackoutPenalty, { healthDelta: -10, moraleDelta: -15 });
  assert.equal(balance.eclss.oxygenKgPerCrewPerSol, 0.85);
  assert.equal(balance.eclss.waterLPerCrewPerSol, 2.5);
  assert.deepEqual(balance.eclss.wrsByLevel['1'], { recoveryRate: 0.9, powerKWh: 4, maxBatchL: 20 });
  assert.deepEqual(balance.eclss.wrsByLevel['2'], { recoveryRate: 0.95, powerKWh: 4, maxBatchL: 20 });
  assert.deepEqual(balance.eclss.wrsByLevel['3'], { recoveryRate: 0.95, powerKWh: 3, maxBatchL: 20 });
  // Cargo: 80 kg = 4 slots x 20 kg, 4-Sol transit, radio 1.3 s (GDD §3.3).
  assert.deepEqual([balance.logistics.maxSlots, balance.logistics.slotWeightKg, balance.logistics.maxPayloadKg], [4, 20, 80]);
  assert.equal(balance.logistics.transitSols, 4);
  assert.equal(balance.logistics.radioLatencyMs, 1300);
  const grants = Object.fromEntries(balance.logistics.packs.map((pack) => [pack.id, pack.grant]));
  assert.deepEqual(grants, {
    'oxygen-pack': { oxygenKg: 20 },
    'water-pack': { waterL: 25 },
    'food-med-pack': { mrePacks: 10, medkits: 1 },
    'power-parts-pack': { batteryKWh: 25, partsKg: 6 },
  });
});

test('GDD contract: crew FSM thresholds match the Satiety/Health/Morale state machines', () => {
  assert.deepEqual(
    { drain: balance.crew.satietyDrainPerSol, injured: balance.crew.injuredBelowHealth,
      fitRecover: balance.crew.fitRecoverAtHealth, tired: balance.crew.tiredBelowMorale,
      normalRecover: balance.crew.normalRecoverAtMorale, rest: [balance.crew.restMoraleGain, balance.crew.restHealthGain],
      care: [balance.crew.medicalCareMoraleGain, balance.crew.medicalCareHealthGain],
      hungry: balance.crew.hungryMoraleDelta, starving: [balance.crew.starvingHealthDelta, balance.crew.starvingMoraleDelta] },
    { drain: 25, injured: 50, fitRecover: 65, tired: 30, normalRecover: 45, rest: [30, 5],
      care: [15, 10], hungry: -5, starving: [-15, -10] }
  );
  assert.deepEqual([balance.systems.maxLevel, balance.systems.repairPartsCost], [3, 2]);
  assert.deepEqual(balance.systems.upgradePartsByTargetLevel, { '2': 4, '3': 8 });
});

test('GDD contract: 32-Sol game tree, golden Sol 7, forgiving defeat rules and S/A/B rubric', () => {
  assert.equal(campaign.id, 'moon-32');
  assert.equal(campaign.targetSol, 32);
  assert.deepEqual(campaign.milestones.lunarDay, { startSol: 1, endSol: 14 });
  assert.deepEqual(campaign.milestones.lunarNight, { startSol: 15, endSol: 28 });
  assert.deepEqual(campaign.milestones.lunarDawn, { startSol: 29, endSol: 32 });
  assert.equal(campaign.milestones.goldenCrisisSol, 7);
  assert.equal(campaign.milestones.recommendedLastCargoSol, 10);
  assert.deepEqual(campaign.victory, { reachSol: 32, minActiveCrew: 2, requirePositiveOxygen: true, requirePositiveWater: true });
  // Forgiving for kids: O2 must be empty 1 full Sol, water 2 full Sols, and the
  // crew must actually drop below 2 active members before defeat.
  assert.deepEqual(campaign.defeat, { minActiveCrew: 2, o2ZeroConsecutiveSols: 1, waterZeroConsecutiveSols: 2 });
  assert.deepEqual(campaign.ranking.S, { minFitCrew: 4, minExpeditions: 3 });
  assert.deepEqual(campaign.ranking.A, { minActiveCrew: 3, minExpeditions: 2 });
});

test('GDD contract: the three rover expeditions match the window/threat/reward table', () => {
  assert.equal(campaign.expeditions.length, 3);
  const byId = Object.fromEntries(campaign.expeditions.map((exp) => [exp.id, exp]));
  assert.deepEqual(
    byId['lunar-crater'],
    { id: 'lunar-crater', name: 'Lunar Crater Core Survey', windowStartSol: 1, windowEndSol: 4, durationSols: 3,
      launchPowerKWh: 4, threat: 'steep-terrain-crater', rewardSample: 'crater_core_sample',
      mitigationOptions: [{ allOf: ['core_drill'] }], rewards: { partsKg: 0, batteryKWh: 0, oxygenKg: 0, waterL: 0, science: 20 } }
  );
  assert.deepEqual(byId['regolith-field'].mitigationOptions.map((o) => o.allOf), [['dust_shield'], ['radio_repeater']]);
  assert.deepEqual(byId['polar-psr'].mitigationOptions.map((o) => o.allOf), [['cryo_thermal_rig'], ['solar_lantern']]);
  assert.equal(byId['polar-psr'].mitigationOptions[1].requirements.minBatteryKWh, 20);
  assert.equal(byId['polar-psr'].rewards.waterL, 20);
  for (const exp of campaign.expeditions) {
    assert.equal(exp.durationSols, 3, 'every rover trip is a fixed 3-Sol journey');
    assert.equal(exp.launchPowerKWh, 4);
    assert.ok(exp.windowEndSol - exp.windowStartSol + 1 >= exp.durationSols, `${exp.id} window must fit its trip`);
  }
});

test('NASA realism: life-support rates stay inside measured real-world ranges', () => {
  // Real crewmember: ~0.84 kg O2/day, ~2.5-3 L water/day (NASA life-support data).
  assert.ok(balance.eclss.oxygenKgPerCrewPerSol >= 0.8 && balance.eclss.oxygenKgPerCrewPerSol <= 0.9, 'O2 per crew per Sol');
  assert.ok(balance.eclss.waterLPerCrewPerSol >= 2.0 && balance.eclss.waterLPerCrewPerSol <= 3.5, 'water per crew per Sol');
  // ISS Water Recovery System reaches ~90-93%; WRS Lv2/3 at 95% is a fair stretch.
  for (const wrs of Object.values(balance.eclss.wrsByLevel)) {
    assert.ok(wrs.recoveryRate >= 0.85 && wrs.recoveryRate <= 0.97, 'WRS recovery within real-world range');
  }
  // Physiologically sane: greywater (2.2 L) < drinking water (2.5 L); the rest is
  // respiration/perspiration losses, exactly like real habitat accounting.
  assert.ok(balance.eclss.wasteWaterGeneratedPerCrewPerSol < balance.eclss.waterLPerCrewPerSol);
  assert.ok(balance.eclss.wasteWaterGeneratedPerCrewPerSol > balance.eclss.waterLPerCrewPerSol * 0.7);
  // Lunar surface GCR background ~0.3-0.4 mGy/day (LRO / Chang'e measurements).
  assert.ok(balance.donkiProbability.backgroundMgyPerSol >= 0.2 && balance.donkiProbability.backgroundMgyPerSol <= 0.8);
  // Earth-Moon one-way radio ~1.28 s; the game displays 1.3 s.
  assert.ok(balance.logistics.radioLatencyMs >= 1200 && balance.logistics.radioLatencyMs <= 1400);
  // Cargo transit: real landers need ~2-3 days; 4 Sols is honest and forgiving.
  assert.ok(balance.logistics.transitSols >= 2 && balance.logistics.transitSols <= 10);
  // Lunar night is ~14.75 Earth days; the campaign uses 14 Sols (Sol 15-28).
  const nightSols = campaign.milestones.lunarNight.endSol - campaign.milestones.lunarNight.startSol + 1;
  assert.ok(nightSols >= 13 && nightSols <= 15, 'lunar night length');
});

test('NASA realism: Diviner thermal catalog is physical and honestly labeled observed', () => {
  const env = bundle.catalog.environment;
  assert.equal(env.provenance, 'observed');
  assert.ok(env.source.includes('Diviner'), 'thermal model must cite the LRO Diviner dataset');
  const t = env.temperatureC;
  assert.ok(t.nightMinC < t.meanC && t.meanC < t.dayMaxC, 'thermal ordering');
  assert.ok(t.nightMinC > -210, 'polar night floor stays above the 40 K PSR physical floor');
  assert.ok(t.dayMaxC < 130, 'day peak below the ~127 C equatorial noon maximum');
  assert.ok(t.fitR2 >= 0.9, 'harmonic fit quality is disclosed and strong');
  assert.ok(t.shapeExponentK > 0.05 && t.shapeExponentK < 3, 'sin-elevation exponent in a sane range');
  // Diviner diurnal cycle ~655.7 h (27.32 d); anything 650-710 h is lunar-true.
  assert.ok(env.diurnalCycleHours >= 650 && env.diurnalCycleHours <= 710);
  // Airless world: no dust opacity, and the catalog says so.
  assert.equal(env.dustTauMean, 0);
  assert.match(env.dustNote, /vacuum/i);
  assert.equal(env.earthMoonCommsDelaySec.roundTripDisplaySec, 1.3);
});

test('NASA realism: hazard probabilities are capped and protection is monotone', () => {
  const p = balance.donkiProbability;
  // Shelter protection strictly improves with airlock level; dust shield adds a little.
  const levels = ['1', '2', '3'].map((k) => p.crewShelterProtectionByLevel[k]);
  assert.ok(levels[0] < levels[1] && levels[1] < levels[2], 'shelter protection monotone in level');
  assert.ok(levels.every((v) => v > 0 && v < 1));
  assert.ok(p.dustShieldRadiationBonus > 0 && p.dustShieldRadiationBonus < 0.3);
  // Worst-case storm: injury and system degrade stay under the kid-friendly caps
  // the resolver clamps to (0.6 injury, 0.45 system degrade).
  const extreme = { level: 'extreme', radiationRiskIndex: 1, hardwareStressIndex: 1, solarPenaltyPct: 0.3, commsNoiseIndex: 1, date: '2026-01-01', notifications: { headline: null } };
  for (const difficulty of Object.keys(campaign.difficultyProfiles)) {
    const mult = campaign.difficultyProfiles[difficulty].weatherRiskMultiplier;
    const risk = core.computeCrewWeatherRisk(extreme, balance, mult, 1, 0, false);
    assert.ok(risk.stormInjuryProb <= 0.6, `${difficulty} storm injury capped at 60%`);
    assert.ok(risk.stormSystemDegradeProb <= 0.45, `${difficulty} storm degrade capped at 45%`);
    assert.ok(risk.radiationDoseMgy > 0 && Number.isFinite(risk.radiationDoseMgy));
    // Even a worst storm Sol is a bad day, not a campaign-ender.
    assert.ok(risk.radiationDoseMgy < 25, 'single-Sol dose stays under the chronic threshold');
    const rover = core.computeRoverRiskProb(extreme, balance, mult, { threatBlocked: false, isGeologistOperating: false });
    assert.ok(rover > 0 && rover <= 0.92, 'rover risk bounded');
    const blocked = core.computeRoverRiskProb(extreme, balance, mult, { threatBlocked: true, isGeologistOperating: true });
    assert.ok(blocked < rover, 'mitigation + the Geologist strictly reduce rover risk');
  }
  // Repairs never become a coin flip worse than 45% even in an extreme storm.
  const repair = core.computeRepairSuccessProb(extreme, balance, 1.25, { isEngineerAssigned: false });
  assert.ok(repair >= p.repairMinSuccessProb - 1e-9, 'repair floor honored');
  assert.ok(repair <= 1);
});

test('Kid-safety: the worst possible Sol still leaves the crew alive and resources whole', () => {
  // Worst case: extreme storm, blackout, everyone starving, no MREs, damaged systems.
  const worst = quietState({ donkiProfileId: bundle.donki.samples.find((s) => s.summary.stormOrExtremeSols.length > 0)?.id });
  const stormSol = bundle.donki.samples.flatMap((s) => s.summary.stormOrExtremeSols)[0] ?? 16;
  const battered = {
    ...worst,
    clock: { sol: stormSol, phase: 'rationing', resolutionIndex: stormSol - 1 },
    dailyPlan: { sol: stormSol, status: 'committed', wrsEnabled: false, powerPriority: ['eclss', 'wrs', 'fabricator', 'rover'], mreTargets: [] },
    resources: { ...worst.resources, batteryKWh: 0, mrePacks: 0, oxygenKg: 30, waterL: 20 },
    systems: Object.fromEntries(Object.entries(worst.systems).map(([id, sys]) => [id, { ...sys, integrity: 0.3 }])),
    crew: Object.fromEntries(Object.entries(worst.crew).map(([id, crew]) => [id, { ...crew, satiety: 0, health: 60, morale: 60 }])),
  };
  const out = core.resolveSol(battered, bundle, 'commit');
  finiteAndNonNegative(out.nextState.resources);
  for (const crew of Object.values(out.nextState.crew)) {
    for (const key of ['health', 'morale', 'satiety']) {
      assert.ok(Number.isFinite(crew[key]) && crew[key] >= 0, `${key} finite and non-negative`);
    }
    // One terrible Sol cannot evacuate anyone from healthy-start vitals:
    // documented worst chain is starving(-15) + blackout(-10) + rad burn(-8) + chronic(-1).
    assert.ok(crew.health >= 60 - 35, `health swing bounded (got ${crew.health})`);
    assert.ok(crew.morale >= 60 - 35, `morale swing bounded (got ${crew.morale})`);
  }
  // The campaign is still running: a single bad Sol is survivable, defeat needs streaks.
  assert.equal(out.nextState.campaign.status, 'active', 'a single worst-case Sol must not end the campaign');
});

test('Kid-safety: hunger FSM follows the GDD diagram exactly (4 Sols from full to starving, MRE rescues)', () => {
  let state = quietState();
  state = { ...state, clock: { sol: 1, phase: 'rationing', resolutionIndex: 0 } };
  const seen = [];
  for (let sol = 1; sol <= 4; sol += 1) {
    const out = resolveOneSol({ ...state, clock: { sol, phase: 'rationing', resolutionIndex: sol - 1 } });
    state = out.nextState;
    seen.push(state.crew.cmd.satiety);
  }
  // 100 -> 75 -> 50 -> 25 (hungry) -> 0 (starving): matches GDD FSM (-25/Sol).
  assert.deepEqual(seen, [75, 50, 25, 0]);
  assert.equal(state.crew.cmd.hungerState, 'starving');
  assert.equal(state.crew.cmd.health, 80 - 15, 'starving costs exactly -15 health per GDD');
  // One MRE from starving: +75 restores to 75, then the same-Sol -25 drain lands
  // at 50 -> 'ok', exactly the GDD "Starving -> Ok" rescue edge.
  const fed = resolveOneSol({ ...state, clock: { sol: 5, phase: 'rationing', resolutionIndex: 4 } }, { mreTargets: ['cmd'] });
  assert.equal(fed.nextState.crew.cmd.satiety, 50);
  assert.equal(fed.nextState.crew.cmd.hungerState, 'ok');
  assert.equal(fed.nextState.resources.mrePacks, balance.consumables.mrePacks.initial - 1);
});

test('Kid-safety: injured crew needs real recovery (hysteresis 50/65) and cannot be insta-killed', () => {
  let state = quietState();
  const start = {
    ...state,
    clock: { sol: 1, phase: 'rationing', resolutionIndex: 0 },
    crew: { ...state.crew, eng: { ...state.crew.eng, health: 55, condition: 'injured' } },
  };
  // 55 -> rest +5 -> 60: still injured (< 65 recovery bar) even though > 50.
  const out1 = resolveOneSol({ ...start, crew: { ...start.crew, eng: { ...start.crew.eng, assignedTask: { type: 'rest' } } } });
  assert.equal(out1.nextState.crew.eng.health, 60);
  assert.equal(out1.nextState.crew.eng.condition, 'injured', 'hysteresis keeps injured until the 65 bar');
  // From 60, rest again -> 65: now fit.
  const out2 = resolveOneSol({ ...out1.nextState, clock: { sol: 2, phase: 'rationing', resolutionIndex: 1 }, crew: { ...out1.nextState.crew, eng: { ...out1.nextState.crew.eng, assignedTask: { type: 'rest' } } } });
  assert.equal(out2.nextState.crew.eng.health, 65);
  assert.equal(out2.nextState.crew.eng.condition, 'fit');
  // Health clamps at 0 but a quiet Sol cannot push below zero.
  const dying = { ...start, crew: { ...start.crew, eng: { ...start.crew.eng, health: 3, condition: 'injured' } } };
  const out3 = resolveOneSol(dying);
  assert.ok(out3.nextState.crew.eng.health >= 0);
});

test('Kid-safety: water ledger conserves mass across WRS on and off', () => {
  const state = quietState();
  const prepared = {
    ...state,
    clock: { sol: 2, phase: 'rationing', resolutionIndex: 1 },
    resources: { ...state.resources, waterL: 60, wasteWaterL: 30 },
  };
  const use = 4 * balance.eclss.waterLPerCrewPerSol;
  const grey = 4 * balance.eclss.wasteWaterGeneratedPerCrewPerSol;

  const off = resolveOneSol(prepared, { wrsEnabled: false });
  assert.equal(off.nextState.resources.waterL, 60 - use, 'WRS off: pure consumption');
  assert.equal(off.nextState.resources.wasteWaterL, 30 + grey, 'greywater accumulates');

  const on = resolveOneSol(prepared, { wrsEnabled: true });
  const wrs = balance.eclss.wrsByLevel['1'];
  const processed = Math.min(30 + grey, wrs.maxBatchL);
  const recovered = on.summary.wrsRecoveredWaterL;
  // Recycler integrity decays slightly with thermal cycling, so recovery sits at
  // or just under the nominal 90% batch recovery.
  assert.ok(recovered > 0 && recovered <= processed * wrs.recoveryRate + 1e-9);
  assert.equal(on.nextState.resources.waterL, 60 - use + recovered);
  assert.equal(on.nextState.resources.wasteWaterL, Math.round((30 + grey - processed) * 100) / 100);
  // Recovery can never exceed the batch, even at Lv3 95%.
  assert.ok(recovered <= processed * 0.95 + 1e-9);
});

test('Kid-safety: quiet-Sol resolution is fully deterministic (same input, identical summary)', () => {
  const state = quietState();
  const prepared = { ...state, clock: { sol: 3, phase: 'rationing', resolutionIndex: 2 } };
  const a = core.resolveSol(prepared, bundle, 'commit');
  const b = core.resolveSol(structuredClone(prepared), bundle, 'commit');
  assert.deepEqual(a.summary, b.summary);
  assert.deepEqual(a.nextState, b.nextState);
});

test('Kid-safety: event catalog stays human-scale - no single choice can nuke a run', () => {
  const events = JSON.parse(JSON.stringify(bundle.events));
  assert.ok(events.length >= 18 && events.length <= 24, 'release gate: 18-24 events');
  const crewDeltas = [];
  const resourceDeltas = [];
  const wears = [];
  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (node.kind === 'crew') {
      for (const key of ['healthDelta', 'moraleDelta', 'satietyDelta']) {
        if (typeof node[key] === 'number') crewDeltas.push(node[key]);
      }
    }
    if (node.kind === 'resource' && typeof node.delta === 'number') resourceDeltas.push(node.delta);
    if (node.kind === 'equipment-wear' && typeof node.wear === 'number') wears.push(node.wear);
    for (const value of Object.values(node)) collect(value);
  };
  collect(events);
  // GDD tier philosophy: small, readable, human-scale numbers.
  for (const delta of crewDeltas) assert.ok(Math.abs(delta) <= 30, `crew delta ${delta} within the 5/10/20/30 tier family`);
  for (const delta of resourceDeltas) assert.ok(Math.abs(delta) <= 25, `resource delta ${delta} stays small`);
  for (const delta of resourceDeltas) assert.ok(Number.isInteger(delta), `resource delta ${delta} is a whole number kids can read`);
  for (const wear of wears) assert.ok([25, 50].includes(wear), `equipment wear ${wear} matches the 50%/25% rover-wear family`);
  // Known doc drift: 5 choices use +/-8 or +/-6 morale instead of the GDD's strict
  // 5/10/20/30 tier table. Human-scale and fine for kids, but the GDD table is stale.
  const offTier = crewDeltas.filter((d) => d % 5 !== 0);
  assert.ok(offTier.length <= 5, `only the 5 documented off-tier morale deltas may exist (got ${offTier.length})`);
});

test('Robustness smoke: policies across seeds and difficulties never NaN, go negative, or soft-lock', () => {
  const runs = [];
  const queue = [
    ...[['balanced', 205099], ['balanced', 42], ['random-valid', 205099]].flatMap(([policyId, seed]) =>
      ['cadet', 'standard'].map((difficulty) => [policyId, seed, difficulty])
    ),
  ];
  for (const [policyId, seed, difficulty] of queue) {
    const run = core.runCampaign(bundle, { seed, difficulty, runId: `smoke:${policyId}:${seed}:${difficulty}` }, core.createPolicy(policyId, seed % 2 === 0 ? 'A' : 'B'));
    runs.push({ seed, difficulty, policyId, run });
  }
  for (const { seed, difficulty, policyId, run } of runs) {
    assert.equal(run.status, 'completed', `${policyId}/${seed}/${difficulty} errored: ${run.error}`);
    assert.ok(['victory', 'defeat'].includes(run.metrics.outcome), `${policyId}/${seed}/${difficulty} must terminate`);
    finiteAndNonNegative(run.metrics.finalResources);
    for (const [key, value] of Object.entries(run.metrics.resourceMinima)) {
      assert.ok(Number.isFinite(value) && value >= 0, `${policyId}/${seed}/${difficulty} minimum ${key}=${value}`);
    }
    assert.equal(core.validateStateInvariants(run.state, bundle), null, `${policyId}/${seed}/${difficulty} invariants`);
    // Every recorded Sol summary is internally consistent and finite.
    for (const summary of run.state.history.summaries) {
      finiteAndNonNegative(summary.checkpoint.resources);
      assert.ok(Number.isFinite(summary.powerGeneratedKWh) && summary.powerGeneratedKWh >= 0);
      assert.ok(Number.isFinite(summary.surfaceTempC));
      assert.ok(summary.checkpoint.resources.batteryKWh <= balance.storages.batteryKWh.max + 1e-6);
      assert.ok(summary.checkpoint.resources.oxygenKg <= balance.storages.oxygenKg.max + 1e-6);
      assert.ok(summary.checkpoint.resources.waterL <= balance.storages.waterL.max + 1e-6);
    }
    // Lunar night physics held the whole way: zero solar generation, every night Sol.
    const nightSummaries = run.state.history.summaries.filter((summary) => summary.isLunarNight);
    assert.equal(nightSummaries.length, 14, `${policyId}/${seed}/${difficulty} lunar night length`);
    assert.ok(nightSummaries.every((summary) => summary.checkpoint.solarGeneratedKWh === 0));
    // Replay identity: the recorded trace reproduces the exact final state.
    assert.deepEqual(core.replayCampaign(JSON.parse(JSON.stringify(run.trace)), bundle), run.state);
  }
  // The campaign must stay winnable, not just survivable: baseline cadet still wins.
  const win = runs.find((entry) => entry.policyId === 'balanced' && entry.seed === 205099 && entry.difficulty === 'cadet');
  assert.equal(win.run.metrics.outcome, 'victory');
  assert.equal(win.run.metrics.completedSols, 32);
});
