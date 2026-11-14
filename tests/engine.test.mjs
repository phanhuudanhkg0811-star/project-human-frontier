import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadBundleModules() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/schemas/contracts.ts';
        export * from './src/domain/canonicalJson.ts';
        export * from './src/domain/prng.ts';
        export * from './src/domain/invariants.ts';
        export * from './src/domain/spaceWeather.ts';
        export * from './src/domain/endSolResolver.ts';
        export * from './src/domain/orchestrator.ts';
        export * from './src/domain/selectors.ts';
        export * from './src/domain/eventSelectors.ts';
        export * from './src/persistence/saveAdapter.ts';
        export * from './src/store/mockGamePort.ts';
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

  const code = result.outputFiles[0].text;
  const encoded = Buffer.from(code, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

const core = await loadBundleModules();

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

test('Static catalogs validate cleanly including 3x32-day NASA DONKI samples and Diviner thermal', () => {
  const bundle = core.loadContentBundle();
  assert.equal(bundle.campaign.id, 'moon-32');
  assert.equal(bundle.campaign.targetSol, 32);
  assert.equal(bundle.catalog.environment.dustTauMean, 0);
  assert.equal(bundle.donki.samples.length, 3);
  assert.equal(bundle.lunarSites.length, 3);
  assert.equal(bundle.crewPhysiology.recordCount, 72);
  assert.equal(
    bundle.crewPhysiology.convertedMeanMgyPerDay,
    bundle.crewPhysiology.absorbedDoseRateUGyPerHour.mean * 24 / 1000
  );
  assert.match(bundle.crewPhysiology.caveat, /orbital/i);

  for (const sample of bundle.donki.samples) {
    assert.equal(sample.solCount, 32);
    assert.equal(sample.sols.length, 32);
    assert.ok(sample.summary.totalFlares > 20, `${sample.id} should contain flares`);
    assert.ok(sample.summary.totalCmes > 20, `${sample.id} should contain CMEs`);
    assert.ok(sample.summary.stormOrExtremeSols.length >= 5, `${sample.id} should contain storm Sols`);
    const edCount = sample.sols.reduce((sum, entry) => sum + entry.cme.earthDirectedCount, 0);
    assert.ok(edCount > 0, `${sample.id} should detect non-zero Earth-Moon sector CMEs`);
    // Strictly 32 consecutive UTC calendar days
    for (let i = 1; i < sample.sols.length; i += 1) {
      const prevMs = Date.parse(`${sample.sols[i - 1].date}T00:00:00Z`);
      const curMs = Date.parse(`${sample.sols[i].date}T00:00:00Z`);
      assert.equal(curMs - prevMs, 86_400_000, `${sample.id} non-consecutive at Sol ${i + 1}`);
    }
  }

  // Known NIST SHA-256 test vector
  assert.equal(
    core.sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );

  // Corrupted DONKI, Balance, Events, and nested GameState must fail deep schema validation
  assert.throws(() =>
    core.validateDonkiCatalog({ samples: [{ id: 'bad', sols: [{ sol: 1 }] }] })
  );
  assert.throws(() => core.validateBalanceConfig({ contentVersion: '1', modelVersion: '1', catalogVersion: '1', storages: {}, power: {}, eclss: {}, donkiProbability: {} }));
  assert.throws(() => core.validateEventsCatalog([{ id: 'x', title: 't', choices: [{}] }]));
  const sampleState = core.createInitialGameState(bundle, { seed: 1 });
  assert.throws(() =>
    core.validateGameStateStructure({
      ...sampleState,
      crew: { ...sampleState.crew, cmd: { ...sampleState.crew.cmd, health: 'not-a-number' } },
    })
  );

  // New Game generates distinct runIds when runId omitted
  const ng1 = core.createInitialGameState(bundle, { seed: 55 });
  const ng2 = core.createInitialGameState(bundle, { seed: 55 });
  assert.notEqual(ng1.campaign.runId, ng2.campaign.runId);
});

test('Golden Sol 1 full lifecycle through MockGamePort preserves Option A/B invariants', async () => {
  const bundle = core.loadContentBundle();
  const port = new core.MockGamePort({ seed: 205001, spaceWeatherOverride: 'quiet' }, bundle);

  // Guard: cannot advance briefing while mandatory Sol 1 event pending
  const blockedAdv = await port.dispatch({ type: 'phase/advance' });
  assert.equal(blockedAdv.ok, false);
  assert.equal(blockedAdv.error.code, 'E_PHASE_INVALID');

  // Resolve Sol 1 event (hold parts)
  const evRes = await port.dispatch({
    type: 'event/resolve',
    eventId: 'sol1-arrival-check',
    choiceId: 'hold-parts',
  });
  assert.equal(evRes.ok, true);

  // briefing -> engineering
  assert.equal((await port.dispatch({ type: 'phase/advance' })).ok, true);

  // Queue 3D Fabricator for 1 MRE Pack (0 crew slot, 2 Parts + 2 L Water + 4 kWh)
  const fabRes = await port.dispatch({
    type: 'fabricator/queue',
    action: 'craft',
    itemId: 'mre_pack',
  });
  assert.equal(fabRes.ok, true);
  assert.equal(port.getSnapshot().resources.partsKg, 14);
  assert.equal(port.getSnapshot().resources.waterL, 78);

  // Second fabricator command in same Sol must fail
  const fabDup = await port.dispatch({
    type: 'fabricator/queue',
    action: 'craft',
    itemId: 'sealant_tape',
  });
  assert.equal(fabDup.ok, false);

  // engineering -> comms -> rationing
  assert.equal((await port.dispatch({ type: 'phase/advance' })).ok, true);
  assert.equal((await port.dispatch({ type: 'comms/send-radio', id: 'tx-1', message: 'Check telemetry', nowMs: 1000 })).ok, true);
  assert.equal((await port.dispatch({ type: 'comms/tick-radio', nowMs: 5000 })).ok, true);
  assert.equal(port.getSnapshot().logistics.radioMessages[0].status, 'reply-received');

  // Order 80kg cargo (4 slots)
  assert.equal((await port.dispatch({ type: 'comms/order-cargo', slots: { 'water-pack': 2, 'power-parts-pack': 2 } })).ok, true);
  assert.equal((await port.dispatch({ type: 'phase/advance' })).ok, true);
  assert.equal(port.getSnapshot().clock.phase, 'rationing');

  // Predictor preview matches committed sol/end identically
  const previewBeforeEnd = core.selectResourceForecast(port.getSnapshot(), bundle);
  const endRes = await port.dispatch({ type: 'sol/end' });
  assert.equal(endRes.ok, true);

  const afterSol1 = port.getSnapshot();
  assert.equal(afterSol1.clock.phase, 'debrief');
  assert.equal(afterSol1.debrief.lastSummary.resourceDeltas.oxygenKg, previewBeforeEnd.resourceDeltas.oxygenKg);
  assert.equal(afterSol1.debrief.lastSummary.resourceDeltas.waterL, previewBeforeEnd.resourceDeltas.waterL);
  assert.equal(afterSol1.resources.mrePacks, 25); // 24 + 1 crafted MRE
  assert.equal(afterSol1.resources.oxygenKg, 66.6); // 70 - 3.4
  assert.equal(afterSol1.resources.waterL, 68); // 78 (2L used by fab) - 10 (4*2.5) = 68, 0 wasteWater initially
  assert.equal(afterSol1.crew.cmd.satiety, 75);

  // Dismiss debrief -> Sol 2 briefing
  assert.equal((await port.dispatch({ type: 'debrief/dismiss' })).ok, true);
  assert.equal(port.getSnapshot().clock.sol, 2);
  assert.equal(port.getSnapshot().clock.phase, 'briefing');
  core.assertGameState(port.getSnapshot(), bundle);
});

test('Golden Sol 7 Option A matches 25.0L/2.0kWh (Save Rover) vs 34.0L/0.0kWh (WRS 90% ON)', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 777, spaceWeatherOverride: 'quiet' });
  const sol7Fixture = {
    ...base,
    clock: { sol: 7, phase: 'rationing', resolutionIndex: 6 },
    dailyPlan: {
      sol: 7,
      status: 'committed',
      wrsEnabled: false,
      powerPriority: ['eclss', 'wrs', 'fabricator', 'rover'],
      mreTargets: [],
    },
    systems: {
      ...base.systems,
      solar: { id: 'solar', level: 1, integrity: 0, status: 'offline' }, // Solar out on Sol 7 crisis -> only Fission +8 + Battery +8
    },
    resources: {
      ...base.resources,
      batteryKWh: 8,
      wasteWaterL: 10,
      waterL: 35,
    },
    events: {
      activeEventId: null,
      activeEvent: null,
      resolvedEventIds: [],
      occurrenceHistory: [],
      flags: {},
      pendingFollowUps: [],
    },
  };

  // Branch A: Save Rover (-2 kWh) + WRS OFF
  const branchAInput = {
    ...sol7Fixture,
    resources: { ...sol7Fixture.resources, batteryKWh: 6 }, // after -2 kWh rover emergency choice
    dailyPlan: { ...sol7Fixture.dailyPlan, wrsEnabled: false },
  };
  const outA = core.resolveSol(branchAInput, bundle, 'commit');
  assert.equal(outA.nextState.resources.waterL, 25);
  assert.equal(outA.nextState.resources.batteryKWh, 2);

  // Branch B: WRS ON (90% recovery, -4 kWh)
  const branchBInput = {
    ...sol7Fixture,
    dailyPlan: { ...sol7Fixture.dailyPlan, wrsEnabled: true },
  };
  const outB = core.resolveSol(branchBInput, bundle, 'commit');
  assert.equal(outB.nextState.resources.waterL, 34);
  assert.equal(outB.nextState.resources.batteryKWh, 0);
});

test('DONKI Space Weather probabilities are 100% deterministic and scale with storm severity', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, {
    seed: 90210,
    donkiProfileId: 'may-2024-xstorm',
  });
  const stormSol16 = {
    ...base,
    clock: { sol: 16, phase: 'rationing', resolutionIndex: 15 },
    dailyPlan: {
      sol: 16,
      status: 'committed',
      wrsEnabled: true,
      powerPriority: ['eclss', 'wrs', 'fabricator', 'rover'],
      mreTargets: [],
    },
    systems: {
      ...base.systems,
      airlock: { id: 'airlock', level: 1, integrity: 0.5, status: 'degraded' },
    },
    crew: {
      ...base.crew,
      eng: { ...base.crew.eng, assignedTask: { type: 'repair-system', targetSystemId: 'airlock' } },
    },
    rover: {
      ...base.rover,
      status: 'exploring',
      expeditionId: 'lunar-crater',
      solsRemaining: 2,
      equippedItems: ['core_drill'],
    },
    resources: { ...base.resources, wasteWaterL: 8.8 },
  };

  // Run 100 times -> exact canonical hash match
  const firstHash = core.sha256Hex(core.canonicalStringify(core.resolveSol(stormSol16, bundle, 'preview')));
  for (let i = 0; i < 100; i += 1) {
    const h = core.sha256Hex(core.canonicalStringify(core.resolveSol(stormSol16, bundle, 'preview')));
    assert.equal(h, firstHash);
  }

  // Verify probability ordering: Alex > non-Alex on repair; BlockThreat/Elena lowers Rover incident risk
  const mayWeather16 = core.getSolWeather(bundle.donki, 'may-2024-xstorm', 16);
  const quietWeather = core.getSolWeather(bundle.donki, 'may-2024-xstorm', 16, 'quiet');
  const repairAlex = core.computeRepairSuccessProb(mayWeather16, bundle.balance, 1.0, { isAlexAssigned: true });
  const repairOther = core.computeRepairSuccessProb(mayWeather16, bundle.balance, 1.0, { isAlexAssigned: false });
  assert.ok(repairAlex > repairOther);
  assert.ok(repairOther < 1.0);
  assert.equal(core.computeRepairSuccessProb(quietWeather, bundle.balance, 1.0, { isAlexAssigned: false }), 1.0);

  const roverBlocked = core.computeRoverRiskProb(mayWeather16, bundle.balance, 1.0, {
    threatBlocked: true,
    isElenaOperating: true,
  });
  const roverUnblocked = core.computeRoverRiskProb(mayWeather16, bundle.balance, 1.0, {
    threatBlocked: false,
    isElenaOperating: false,
  });
  assert.ok(roverUnblocked > roverBlocked * 5);

  // Airlock storm shelter Lv3 + Dust Shield reduce crew radiation dose vs Lv1,
  // and quiet Sol still applies non-zero GCR background radiation
  const radLv1 = core.computeCrewWeatherRisk(mayWeather16, bundle.balance, 1.0, 1, 1.0, false);
  const radLv3 = core.computeCrewWeatherRisk(mayWeather16, bundle.balance, 1.0, 3, 1.0, true);
  assert.ok(radLv3.radiationDoseMgy < radLv1.radiationDoseMgy);
  const quietRisk = core.computeCrewWeatherRisk(quietWeather, bundle.balance, 1.0, 1, 1.0, false);
  assert.ok(quietRisk.radiationDoseMgy > 0, 'GCR background radiation must apply on quiet Sols');
  assert.equal(quietRisk.stormInjuryProb, 0);
});

test('Load shedding cuts WRS before triggering ECLSS blackout even with inverted powerPriority, and Starving bans Rover', async () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 42, spaceWeatherOverride: 'quiet' });

  // Available = 6 (battery) + 8 (fission) + 0 (lunar night Sol 15) = 14 kWh -> Essential 12 must run BEFORE WRS & Fabricator!
  const shedState = {
    ...base,
    clock: { sol: 15, phase: 'rationing', resolutionIndex: 14 },
    dailyPlan: {
      sol: 15,
      status: 'committed',
      wrsEnabled: true,
      powerPriority: ['wrs', 'fabricator', 'eclss', 'rover'],
      mreTargets: [],
    },
    fabricator: {
      usedThisSol: true,
      activeJob: {
        action: 'craft',
        itemId: 'mre_pack',
        startedSol: 15,
        solsRemaining: 1,
        partsSpent: 2,
        waterSpent: 2,
        batteryReserved: 4,
      },
    },
    resources: { ...base.resources, batteryKWh: 6, wasteWaterL: 10 },
  };
  const shedOut = core.resolveSol(shedState, bundle, 'commit');
  assert.equal(shedOut.summary.blackout, false, 'Essential 12 kWh must never be starved by WRS/Fabricator priority');
  assert.deepEqual(shedOut.summary.unmetLoads, ['wrs', 'fabricator']);
  assert.equal(shedOut.summary.wrsRecoveredWaterL, 0);

  // Starving ban check
  const starvingState = {
    ...base,
    clock: { sol: 4, phase: 'comms', resolutionIndex: 3 },
    crew: {
      ...base.crew,
      cmd: { ...base.crew.cmd, satiety: 0, hungerState: 'starving' },
      eng: { ...base.crew.eng, satiety: 0, hungerState: 'starving' },
      doc: { ...base.crew.doc, satiety: 0, hungerState: 'starving' },
      geo: { ...base.crew.geo, satiety: 0, hungerState: 'starving' },
    },
  };
  const res = core.dispatchDomainCommand(
    starvingState,
    { type: 'rover/schedule', expeditionId: 'lunar-crater', equipmentIds: ['core_drill'], launchOperatorCrewId: 'geo' },
    bundle
  );
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'E_PLAN_INVALID');
});

test('Multi-task repair/upgrade, crew/unassign refund, fabricator/cancel anti-exploit & boundary validation', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 3030, spaceWeatherOverride: 'quiet' });
  let st = {
    ...base,
    clock: { sol: 3, phase: 'engineering', resolutionIndex: 2 },
    dailyPlan: { ...base.dailyPlan, sol: 3 },
    systems: {
      ...base.systems,
      solar: { id: 'solar', level: 1, integrity: 0.5, status: 'degraded' },
      airlock: { id: 'airlock', level: 1, integrity: 0.5, status: 'degraded' },
    },
    resources: { ...base.resources, partsKg: 30 },
  };

  // Assign 2 simultaneous repairs + 1 upgrade in engineering
  let r = core.dispatchDomainCommand(st, { type: 'crew/assign', crewId: 'eng', task: 'repair-system', targetSystemId: 'solar' }, bundle);
  assert.equal(r.ok, true);
  st = r.state;
  r = core.dispatchDomainCommand(st, { type: 'crew/assign', crewId: 'cmd', task: 'repair-system', targetSystemId: 'airlock' }, bundle);
  assert.equal(r.ok, true);
  st = r.state;
  r = core.dispatchDomainCommand(st, { type: 'crew/assign', crewId: 'doc', task: 'upgrade-system', targetSystemId: 'recycler' }, bundle);
  assert.equal(r.ok, true);
  st = r.state;
  assert.equal(st.resources.partsKg, 22); // 30 - 2 - 2 - 4

  // Resolve Sol 3 -> BOTH repairs + upgrade must resolve!
  const endOut = core.resolveSol(
    { ...st, clock: { ...st.clock, phase: 'rationing' }, dailyPlan: { ...st.dailyPlan, status: 'committed' } },
    bundle,
    'commit'
  );
  assert.equal(endOut.nextState.systems.solar.integrity, 1);
  assert.equal(endOut.nextState.systems.airlock.integrity, 1);
  assert.equal(endOut.nextState.systems.recycler.level, 2);

  // Unassign upgrade refunds exact Parts (3 with Alex discount, 4 without); blocked in rationing
  let upgSt = core.dispatchDomainCommand(
    { ...base, clock: { sol: 3, phase: 'engineering', resolutionIndex: 2 }, dailyPlan: { ...base.dailyPlan, sol: 3 }, resources: { ...base.resources, partsKg: 10 } },
    { type: 'crew/assign', crewId: 'eng', task: 'upgrade-system', targetSystemId: 'solar' },
    bundle
  ).state;
  assert.equal(upgSt.resources.partsKg, 7); // 10 - (4 - 1 Alex discount)
  const blockedUnassign = core.dispatchDomainCommand(
    { ...upgSt, clock: { ...upgSt.clock, phase: 'rationing' } },
    { type: 'crew/unassign', crewId: 'eng' },
    bundle
  );
  assert.equal(blockedUnassign.ok, false);
  assert.equal(blockedUnassign.error.code, 'E_PHASE_INVALID');
  const okUnassign = core.dispatchDomainCommand(upgSt, { type: 'crew/unassign', crewId: 'eng' }, bundle);
  assert.equal(okUnassign.ok, true);
  assert.equal(okUnassign.state.resources.partsKg, 10);

  // Fabricator cancel: same-Sol keeps usedThisSol=true + 100% refund; multi-Sol refunds 50%; rationing rejected
  const fabQueueRes = core.dispatchDomainCommand(
    { ...base, clock: { sol: 3, phase: 'engineering', resolutionIndex: 2 }, dailyPlan: { ...base.dailyPlan, sol: 3 }, resources: { ...base.resources, partsKg: 20, waterL: 50 } },
    { type: 'fabricator/queue', action: 'craft', itemId: 'medkit' },
    bundle
  );
  assert.equal(fabQueueRes.ok, true);
  const fabQueued = fabQueueRes.state;
  const blockedCancelPhase = core.dispatchDomainCommand(
    { ...fabQueued, clock: { ...fabQueued.clock, phase: 'rationing' } },
    { type: 'fabricator/cancel' },
    bundle
  );
  assert.equal(blockedCancelPhase.ok, false);

  const sameSolCancel = core.dispatchDomainCommand(fabQueued, { type: 'fabricator/cancel' }, bundle);
  assert.equal(sameSolCancel.ok, true);
  assert.equal(sameSolCancel.state.resources.partsKg, 20);
  assert.equal(sameSolCancel.state.fabricator.usedThisSol, true);
  const reQueueBlocked = core.dispatchDomainCommand(
    sameSolCancel.state,
    { type: 'fabricator/queue', action: 'craft', itemId: 'mre_pack' },
    bundle
  );
  assert.equal(reQueueBlocked.ok, false);

  // Multi-Sol job progressed (startedSol=2, current sol=3) -> 50% refund (parts: 17 + 3 = 20)
  const multiSolCancel = core.dispatchDomainCommand(
    { ...fabQueued, fabricator: { usedThisSol: false, activeJob: { ...fabQueued.fabricator.activeJob, startedSol: 2, partsSpent: 6, waterSpent: 4 } } },
    { type: 'fabricator/cancel' },
    bundle
  );
  assert.equal(multiSolCancel.ok, true);
  assert.equal(multiSolCancel.state.resources.partsKg, 20); // 17 + 3 (50% of 6)

  // Command boundary rejects invalid cargo slots and invalid power consumers
  const badCargo = core.dispatchDomainCommand(
    { ...base, clock: { sol: 3, phase: 'comms', resolutionIndex: 2 } },
    { type: 'comms/order-cargo', slots: { 'bad-pack': 1, 'water-pack': -1 } },
    bundle
  );
  assert.equal(badCargo.ok, false);
  assert.equal(badCargo.error.code, 'E_PLAN_INVALID');

  const badPrio = core.dispatchDomainCommand(
    { ...base, clock: { sol: 3, phase: 'rationing', resolutionIndex: 2 } },
    { type: 'rationing/set-power-priority', order: ['eclss', 'wrs', 'fake-load', 'rover'] },
    bundle
  );
  assert.equal(badPrio.ok, false);
  assert.equal(badPrio.error.code, 'E_PLAN_INVALID');
});

test('SaveEnvelope v2 verifies full envelope checksum, version lock, and storage error safety', () => {
  const bundle = core.loadContentBundle();
  const storage = createMemoryStorage();
  const state = core.createInitialGameState(bundle, { seed: 1234 });

  assert.equal(core.saveGameState(state, storage, '2026-11-14T12:00:00Z').ok, true);
  const loaded = core.loadGameState(bundle, storage);
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.state.campaign.seed, 1234);

  // Tamper state inside save JSON
  const rawObj = JSON.parse(storage.getItem(core.SAVE_STORAGE_KEY));
  rawObj.state.resources.waterL = 159;
  storage.setItem(core.SAVE_STORAGE_KEY, JSON.stringify(rawObj));
  assert.equal(core.loadGameState(bundle, storage).error.code, 'E_SAVE_CORRUPTED');

  // Tamper envelope metadata (savedAt) without recomputing checksum -> caught!
  const validEnv = core.buildSaveEnvelope(state, '2026-11-14T12:00:00Z');
  storage.setItem(core.SAVE_STORAGE_KEY, JSON.stringify({ ...validEnv, savedAt: '2099-01-01T00:00:00Z' }));
  assert.equal(core.loadGameState(bundle, storage).error.code, 'E_SAVE_CORRUPTED');

  // Validly re-signed envelope with mismatched contentVersion / modelVersion / appVersion
  const badModel = { ...state, modelVersion: '0.9.0-old' };
  storage.setItem(core.SAVE_STORAGE_KEY, JSON.stringify(core.buildSaveEnvelope(badModel, '2026-11-14T12:00:00Z')));
  assert.equal(core.loadGameState(bundle, storage).error.code, 'E_MODEL_MISMATCH');

  const badContent = { ...state, contentVersion: '0.1.0-old' };
  storage.setItem(core.SAVE_STORAGE_KEY, JSON.stringify(core.buildSaveEnvelope(badContent, '2026-11-14T12:00:00Z')));
  assert.equal(core.loadGameState(bundle, storage).error.code, 'E_CONTRACT_MISMATCH');

  // Storage throwing QuotaExceededError never crashes dispatch/save
  const quotaStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {},
  };
  const writeErr = core.saveGameState(state, quotaStorage, '2026-11-14T12:00:00Z');
  assert.equal(writeErr.ok, false);
  assert.equal(writeErr.error.code, 'E_SAVE_CORRUPTED');
});

test('Phase 1.2 Rover uses the power ledger, completes exactly three ticks, grants rewards once, and frees Rover after debrief', () => {
  const bundle = core.loadContentBundle();
  let state = core.createInitialGameState(bundle, { seed: 205001, spaceWeatherOverride: 'quiet' });
  state = {
    ...state,
    clock: { sol: 1, phase: 'comms', resolutionIndex: 0 },
    dailyPlan: { ...state.dailyPlan, sol: 1 },
  };

  let result = core.dispatchDomainCommand(state, {
    type: 'rover/schedule',
    expeditionId: 'lunar-crater',
    equipmentIds: ['core_drill'],
    launchOperatorCrewId: 'geo',
  }, bundle);
  assert.equal(result.ok, true);
  state = result.state;
  assert.equal(state.rover.activeMission.status, 'scheduled');
  assert.equal(state.equipment.core_drill.reservedForRover, true);

  const endSol = () => core.resolveSol({
    ...state,
    clock: { ...state.clock, phase: 'rationing' },
    dailyPlan: { ...state.dailyPlan, status: 'committed' },
  }, bundle, 'commit').nextState;
  const nextSol = () => {
    const dismissed = core.dispatchDomainCommand(state, { type: 'debrief/dismiss' }, bundle);
    assert.equal(dismissed.ok, true);
    state = dismissed.state;
  };

  state = endSol();
  assert.equal(state.rover.activeMission.status, 'outbound');
  assert.equal(state.rover.activeMission.travelTicksCompleted, 1);
  assert.equal(state.debrief.lastSummary.unmetLoads.includes('rover'), false);
  nextSol();

  state = endSol();
  assert.equal(state.rover.activeMission.status, 'exploring');
  assert.equal(state.rover.activeMission.travelTicksCompleted, 2);
  nextSol();

  const recovery = core.dispatchDomainCommand(
    { ...state, clock: { ...state.clock, phase: 'engineering' } },
    { type: 'rover/set-recovery-operator', crewId: 'geo' },
    bundle
  );
  assert.equal(recovery.ok, true);
  state = recovery.state;
  state = endSol();
  assert.equal(state.rover.activeMission.status, 'completed');
  assert.equal(state.rover.missionHistory.length, 1);
  assert.equal(state.rover.missionHistory[0].rewardSampleGranted, 'crater_core_sample');
  assert.equal(state.campaign.sciencePoints, 20);
  assert.equal(state.equipment.core_drill.durability, 75);
  assert.equal(state.equipment.core_drill.reservedForRover, false);

  nextSol();
  assert.equal(state.rover.activeMission, null);
  assert.equal(state.rover.missionHistory.length, 1);
  assert.equal(core.selectRoverSamples(state).length, 1);
});

test('Phase 1.2 deadline failure, OR mitigation, immediate Medkit, and signal recovery are deterministic', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 1001, spaceWeatherOverride: 'quiet' });
  assert.equal(core.selectMitigationSatisfied(base, bundle, 'regolith-field', ['dust_shield']), true);
  assert.equal(core.selectMitigationSatisfied(base, bundle, 'regolith-field', ['radio_repeater']), true);
  assert.equal(core.selectMitigationSatisfied(base, bundle, 'regolith-field', []), false);

  const injured = {
    ...base,
    clock: { sol: 1, phase: 'engineering', resolutionIndex: 0 },
    crew: { ...base.crew, cmd: { ...base.crew.cmd, health: 20, condition: 'injured' } },
  };
  const healed = core.dispatchDomainCommand(injured, {
    type: 'crew/use-medkit', targetCrewId: 'cmd', administeredByCrewId: 'doc',
  }, bundle);
  assert.equal(healed.ok, true);
  assert.equal(healed.state.crew.cmd.health, 70);
  assert.equal(healed.state.crew.cmd.condition, 'fit');
  assert.equal(healed.state.crew.doc.assignedTask.type, 'medical-care');
  assert.equal(healed.state.resources.medkits, 1);
  const healedEndSol = core.resolveSol({
    ...healed.state,
    clock: { ...healed.state.clock, phase: 'rationing' },
    dailyPlan: { ...healed.state.dailyPlan, status: 'committed' },
  }, bundle, 'commit').nextState;
  assert.equal(healedEndSol.crew.cmd.health, 70, 'Medkit administration must not double-apply regular medical-care healing');

  let deadline = {
    ...base,
    clock: { sol: 4, phase: 'comms', resolutionIndex: 3 },
    dailyPlan: { ...base.dailyPlan, sol: 4 },
    resources: { ...base.resources, batteryKWh: 0 },
    systems: { ...base.systems, solar: { ...base.systems.solar, integrity: 0, status: 'offline' } },
  };
  const scheduled = core.dispatchDomainCommand(deadline, {
    type: 'rover/schedule', expeditionId: 'lunar-crater', equipmentIds: ['core_drill'], launchOperatorCrewId: 'geo',
  }, bundle);
  assert.equal(scheduled.ok, true);
  deadline = core.resolveSol({
    ...scheduled.state,
    clock: { ...scheduled.state.clock, phase: 'rationing' },
    dailyPlan: { ...scheduled.state.dailyPlan, status: 'committed' },
  }, bundle, 'commit').nextState;
  assert.equal(deadline.rover.activeMission.status, 'failed');
  assert.equal(deadline.rover.missionHistory[0].outcome, 'failed');
  assert.equal(deadline.equipment.core_drill.reservedForRover, false);

  const lost = {
    ...base,
    clock: { sol: 2, phase: 'engineering', resolutionIndex: 1 },
    dailyPlan: { ...base.dailyPlan, sol: 2 },
    equipment: { ...base.equipment, core_drill: { ...base.equipment.core_drill, reservedForRover: true } },
    rover: {
      activeMission: {
        expeditionId: 'lunar-crater', status: 'signal-lost', scheduledSol: 1, launchedSol: 1,
        statusEnteredSol: 1, expectedReturnSol: 3, launchOperatorCrewId: 'geo', recoveryOperatorCrewId: null,
        equippedItems: ['core_drill'], travelTicksCompleted: 1, signalLostSols: 1,
        resumeStatus: 'outbound', recoveryDelaySols: 0, incidents: [],
      },
      missionHistory: [],
    },
  };
  const recovered = core.dispatchDomainCommand(lost, { type: 'rover/recover-signal' }, bundle);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.state.rover.activeMission.status, 'outbound');
  assert.equal(recovered.state.rover.activeMission.expectedReturnSol, 4);

  const timedOut = core.resolveSol({
    ...lost,
    clock: { ...lost.clock, phase: 'rationing' },
    dailyPlan: { ...lost.dailyPlan, status: 'committed' },
  }, bundle, 'commit').nextState;
  assert.equal(timedOut.rover.activeMission.status, 'failed');
  assert.equal(timedOut.rover.missionHistory[0].outcome, 'failed');
  assert.equal(timedOut.equipment.core_drill.reservedForRover, false);

  const occupiedCrew = Object.fromEntries(Object.entries(base.crew).map(([id, crew]) => [id, {
    ...crew, assignedTask: { type: 'rest' },
  }]));
  const recoveryPending = {
    ...base,
    clock: { sol: 3, phase: 'rationing', resolutionIndex: 2 },
    dailyPlan: { ...base.dailyPlan, sol: 3, status: 'committed' },
    crew: occupiedCrew,
    equipment: { ...base.equipment, core_drill: { ...base.equipment.core_drill, reservedForRover: true } },
    rover: {
      activeMission: {
        expeditionId: 'lunar-crater', status: 'recovery-pending', scheduledSol: 1, launchedSol: 1,
        statusEnteredSol: 2, expectedReturnSol: 2, launchOperatorCrewId: 'geo', recoveryOperatorCrewId: null,
        equippedItems: ['core_drill'], travelTicksCompleted: 3, signalLostSols: 0,
        resumeStatus: null, recoveryDelaySols: 1, incidents: [],
      },
      missionHistory: [],
    },
  };
  const recoveryFailed = core.resolveSol(recoveryPending, bundle, 'commit').nextState;
  assert.equal(recoveryFailed.rover.activeMission.status, 'failed');
  assert.equal(recoveryFailed.rover.activeMission.incidents.at(-1).kind, 'recovery-timeout');

  const cancellable = core.dispatchDomainCommand(
    { ...base, clock: { sol: 1, phase: 'comms', resolutionIndex: 0 } },
    { type: 'rover/schedule', expeditionId: 'lunar-crater', equipmentIds: ['core_drill'], launchOperatorCrewId: 'geo' },
    bundle
  );
  assert.equal(cancellable.ok, true);
  const cancelled = core.dispatchDomainCommand(cancellable.state, { type: 'rover/cancel-schedule' }, bundle);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.state.rover.activeMission, null);
  assert.equal(cancelled.state.equipment.core_drill.reservedForRover, false);
  assert.equal(cancelled.state.crew.geo.assignedTask, null);
});

test('SaveEnvelope v1 migrates to v3 without inventing historical operators and rewrites storage', () => {
  const bundle = core.loadContentBundle();
  const storage = createMemoryStorage();
  const current = core.createInitialGameState(bundle, { seed: 5050 });
  const { sciencePoints: _sciencePoints, ...legacyCampaign } = current.campaign;
  const legacyState = {
    ...current,
    schemaVersion: 1,
    campaign: legacyCampaign,
    dailyPlan: { ...current.dailyPlan, medkitTargets: [] },
    rover: {
      status: 'idle', expeditionId: null, solsRemaining: 0, equippedItems: [],
      samplesCollected: ['crater_core_sample'], completedExpeditions: ['lunar-crater'],
    },
    events: {
      activeEventId: 'sol1-arrival-check',
      resolvedEventIds: [],
    },
  };
  const unsigned = {
    schemaVersion: 1,
    savedAt: '2026-11-14T12:00:00Z',
    appVersion: '1.1.0',
    contentVersion: current.contentVersion,
    modelVersion: current.modelVersion,
    catalogVersion: current.catalogVersion,
    state: legacyState,
  };
  storage.setItem(core.SAVE_STORAGE_KEY, JSON.stringify({ ...unsigned, checksum: core.computeEnvelopeChecksum(unsigned) }));
  const loaded = core.loadGameState(bundle, storage);
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.state.schemaVersion, 3);
  assert.equal(loaded.state.campaign.sciencePoints, 20);
  assert.equal(loaded.state.rover.missionHistory[0].launchOperatorCrewId, null);
  assert.equal(loaded.state.events.activeEvent?.eventId, 'sol1-arrival-check');
  assert.equal(JSON.parse(storage.getItem(core.SAVE_STORAGE_KEY)).schemaVersion, 3);
});

test('SaveEnvelope v2 migrates to v3 preserving resolved events and active event deadline', () => {
  const bundle = core.loadContentBundle();
  const storage = createMemoryStorage();
  const current = core.createInitialGameState(bundle, { seed: 6060 });
  const v2State = {
    ...current,
    schemaVersion: 2,
    clock: { sol: 3, phase: 'comms', resolutionIndex: 2 },
    dailyPlan: { ...current.dailyPlan, sol: 3 },
    events: {
      activeEventId: 'sol3-airlock-seal-alert',
      resolvedEventIds: ['sol1-arrival-check'],
    },
  };
  const unsigned = {
    schemaVersion: 2,
    savedAt: '2026-11-14T13:00:00Z',
    appVersion: '1.2.0',
    contentVersion: current.contentVersion,
    modelVersion: current.modelVersion,
    catalogVersion: current.catalogVersion,
    state: v2State,
  };
  storage.setItem(core.SAVE_STORAGE_KEY, JSON.stringify({ ...unsigned, checksum: core.computeEnvelopeChecksum(unsigned) }));
  const loaded = core.loadGameState(bundle, storage);
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.state.schemaVersion, 3);
  assert.equal(loaded.state.events.activeEventId, 'sol3-airlock-seal-alert');
  assert.equal(loaded.state.events.activeEvent?.deadlineSol, 3);
  assert.deepEqual(loaded.state.events.resolvedEventIds, ['sol1-arrival-check']);
  assert.equal(loaded.state.events.occurrenceHistory.length, 1);
  assert.equal(JSON.parse(storage.getItem(core.SAVE_STORAGE_KEY)).schemaVersion, 3);
});

test('Phase 1.3 contract selectors and events catalog validation work end-to-end', () => {
  const bundle = core.loadContentBundle();
  const state = core.createInitialGameState(bundle, { seed: 7070 });
  const activeView = core.selectActiveEventView(state, bundle);
  assert.ok(activeView);
  assert.equal(activeView.event.id, 'sol1-arrival-check');
  assert.equal(activeView.event.art, 'tech-fault');
  assert.equal(activeView.priority, 90);
  assert.equal(activeView.mandatory, true);
  const previews = core.selectEventChoicePreviews(state, 'sol1-arrival-check', bundle);
  assert.equal(previews.length, 2);
  assert.equal(previews[0].allowed, true);

  assert.throws(
    () =>
      core.validateEventsCatalog([
        {
          ...bundle.events[0],
          when: [{ sol: 1, solMin: 1 }],
        },
      ]),
    /cannot combine sol with solMin\/solMax/
  );
});
