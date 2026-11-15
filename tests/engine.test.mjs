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

test('P0 science content and Rover sites stay aligned with the South Polar runtime catalogs', () => {
  const bundle = core.loadContentBundle();
  const thermal = bundle.catalog.environment.temperatureC;
  const lunarBrief = bundle.briefs.find((brief) => brief.id === 'brief-lunar-cycle');
  const deepNightEvent = bundle.events.find((event) => event.id === 'evt-emergency-load-shed');

  assert.ok(lunarBrief.content.includes(thermal.nightMinC.toFixed(2)));
  assert.ok(lunarBrief.content.includes(thermal.dayMaxC.toFixed(2)));
  assert.ok(lunarBrief.source.includes(thermal.fitR2.toFixed(4)));
  assert.ok(deepNightEvent.title.includes(thermal.nightMinC.toFixed(1)));
  assert.ok(deepNightEvent.prompt.includes(thermal.nightMinC.toFixed(1)));

  const moonRadiusKm = 1737.4;
  const outpost = { latitudeDeg: -89.45, longitudeDegEast: -137.3 };
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const distanceFromOutpostKm = (location) => {
    const lat1 = toRad(outpost.latitudeDeg);
    const lat2 = toRad(location.latitudeDeg);
    const deltaLon = toRad(location.longitudeDegEast - outpost.longitudeDegEast);
    const centralAngle = Math.acos(
      Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
    );
    return moonRadiusKm * centralAngle;
  };

  for (const site of bundle.lunarSites) {
    assert.ok(site.representativeLocation.latitudeDeg < -88.5, `${site.expeditionId} must remain at the South Pole`);
    assert.ok(distanceFromOutpostKm(site.representativeLocation) <= 50, `${site.expeditionId} must be within Rover range`);
    assert.equal(site.representativeLocation.provenance, 'assumption');
    assert.equal(site.mappingProvenance, 'assumption');
    assert.doesNotMatch(site.representativeLocation.name, /Apollo 11|Apollo 15/i);
  }
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
  assert.equal(afterSol1.debrief.lastSummary.checkpoint.wrsProcessedWasteWaterL, 8.8);
  assert.equal(afterSol1.debrief.lastSummary.wrsRecoveredWaterL, 7.9);
  assert.equal(afterSol1.resources.waterL, 75.9); // 78 - 10 crew use + 7.9 reclaimed from same-Sol greywater
  assert.equal(afterSol1.resources.wasteWaterL, 0);
  assert.equal(afterSol1.crew.cmd.satiety, 75);

  // Dismiss debrief -> Sol 2 briefing
  assert.equal((await port.dispatch({ type: 'debrief/dismiss' })).ok, true);
  assert.equal(port.getSnapshot().clock.sol, 2);
  assert.equal(port.getSnapshot().clock.phase, 'briefing');
  core.assertGameState(port.getSnapshot(), bundle);
});

test('Golden Sol 7 matches 25.0L/2.0kWh (Save Rover) vs 41.9L/0.0kWh (same-Sol WRS ON)', () => {
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
  assert.equal(outB.summary.checkpoint.wrsProcessedWasteWaterL, 18.8);
  assert.equal(outB.summary.wrsRecoveredWaterL, 16.9);
  assert.equal(outB.nextState.resources.waterL, 41.9);
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

  // Verify probability ordering: engineer > non-engineer on repair; BlockThreat/Dmitri (geologist) lowers Rover incident risk
  const mayWeather16 = core.getSolWeather(bundle.donki, 'may-2024-xstorm', 16);
  const quietWeather = core.getSolWeather(bundle.donki, 'may-2024-xstorm', 16, 'quiet');
  const repairEngineer = core.computeRepairSuccessProb(mayWeather16, bundle.balance, 1.0, { isEngineerAssigned: true });
  const repairOther = core.computeRepairSuccessProb(mayWeather16, bundle.balance, 1.0, { isEngineerAssigned: false });
  assert.ok(repairEngineer > repairOther);
  assert.ok(repairOther < 1.0);
  assert.equal(core.computeRepairSuccessProb(quietWeather, bundle.balance, 1.0, { isEngineerAssigned: false }), 1.0);

  const roverBlocked = core.computeRoverRiskProb(mayWeather16, bundle.balance, 1.0, {
    threatBlocked: true,
    isGeologistOperating: true,
  });
  const roverUnblocked = core.computeRoverRiskProb(mayWeather16, bundle.balance, 1.0, {
    threatBlocked: false,
    isGeologistOperating: false,
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

  // Unassign upgrade refunds exact Parts (3 with engineer discount, 4 without); blocked in rationing
  let upgSt = core.dispatchDomainCommand(
    { ...base, clock: { sol: 3, phase: 'engineering', resolutionIndex: 2 }, dailyPlan: { ...base.dailyPlan, sol: 3 }, resources: { ...base.resources, partsKg: 10 } },
    { type: 'crew/assign', crewId: 'eng', task: 'upgrade-system', targetSystemId: 'solar' },
    bundle
  ).state;
  assert.equal(upgSt.resources.partsKg, 7); // 10 - (4 - 1 engineer discount)
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

test('SaveEnvelope v1 migrates to v4 without inventing historical operators and rewrites storage', () => {
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
  assert.equal(loaded.state.schemaVersion, 4);
  assert.equal(loaded.state.campaign.sciencePoints, 20);
  assert.equal(loaded.state.rover.missionHistory[0].launchOperatorCrewId, null);
  assert.equal(loaded.state.events.activeEvent?.eventId, 'sol1-arrival-check');
  assert.equal(JSON.parse(storage.getItem(core.SAVE_STORAGE_KEY)).schemaVersion, 4);
});

test('SaveEnvelope v2 migrates to v4 preserving resolved events and active event deadline', () => {
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
  assert.equal(loaded.state.schemaVersion, 4);
  assert.equal(loaded.state.events.activeEventId, 'sol3-airlock-seal-alert');
  assert.equal(loaded.state.events.activeEvent?.deadlineSol, 3);
  assert.deepEqual(loaded.state.events.resolvedEventIds, ['sol1-arrival-check']);
  assert.equal(loaded.state.events.occurrenceHistory.length, 1);
  assert.equal(JSON.parse(storage.getItem(core.SAVE_STORAGE_KEY)).schemaVersion, 4);
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

// ---------------------------------------------------------------------------
// Internal mechanics depth (modelVersion 1.4.1-ts-mechanics)
// Interface is unchanged: these tests only observe GameState/SolSummary output.
// ---------------------------------------------------------------------------

function variant(base, overrides) {
  return {
    ...base,
    ...overrides,
    clock: { ...base.clock, ...(overrides.clock ?? {}) },
    dailyPlan: { ...base.dailyPlan, ...(overrides.dailyPlan ?? {}) },
    resources: { ...base.resources, ...(overrides.resources ?? {}) },
    systems: { ...base.systems, ...(overrides.systems ?? {}) },
    crew: { ...base.crew, ...(overrides.crew ?? {}) },
    equipment: { ...base.equipment, ...(overrides.equipment ?? {}) },
  };
}

function committedPlan(sol, extra = {}) {
  return {
    sol,
    status: 'committed',
    wrsEnabled: false,
    powerPriority: ['eclss', 'wrs', 'fabricator', 'rover'],
    mreTargets: [],
    ...extra,
  };
}

test('Diviner lunar thermal curve peaks at midday and bottoms out at lunar night', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 11, spaceWeatherOverride: 'quiet' });
  const thermal = bundle.catalog.environment.temperatureC;

  const tempAt = (sol, overrides = {}) =>
    core.resolveSol(
      variant(base, {
        clock: { sol, phase: 'rationing', resolutionIndex: sol - 1 },
        dailyPlan: committedPlan(sol),
        ...overrides,
      }),
      bundle,
      'preview'
    ).summary.surfaceTempC;

  const round2 = (n) => Math.round(n * 100) / 100;
  assert.equal(tempAt(8), round2(thermal.dayMaxC), 'midday of the 28-Sol cycle must hit the Diviner day maximum');
  assert.equal(tempAt(15), round2(thermal.nightMinC), 'lunar nightfall must hit the Diviner night minimum');
  assert.equal(tempAt(22), round2(thermal.nightMinC), 'deep lunar night stays at the night minimum');
  assert.ok(tempAt(3) > tempAt(2), 'temperature rises monotonically after sunrise');
  assert.ok(tempAt(12) < tempAt(8), 'temperature falls after midday toward sunset');
});

test('Battery applies round-trip efficiency, caps at max, and self-discharges on idle nights', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 12, spaceWeatherOverride: 'quiet' });
  const solar3 = { id: 'solar', level: 3, integrity: 1, status: 'nominal' };

  // Night Sol: no solar, fission 8, battery 40, essential load 12, no WRS.
  const night = core.resolveSol(
    variant(base, {
      clock: { sol: 15, phase: 'rationing', resolutionIndex: 14 },
      dailyPlan: committedPlan(15),
      resources: { batteryKWh: 40 },
    }),
    bundle,
    'preview'
  );
  assert.equal(night.summary.resourceDeltas.batteryKWh, -4.07, '4 kWh load + 0.2% self-discharge');
  assert.equal(night.nextState.resources.batteryKWh, 35.93);

  // Day Sol with a low battery: net charge is derated by round-trip losses.
  const day = core.resolveSol(
    variant(base, {
      clock: { sol: 2, phase: 'rationing', resolutionIndex: 1 },
      dailyPlan: committedPlan(2),
      resources: { batteryKWh: 10 },
      systems: { solar: solar3 },
    }),
    bundle,
    'preview'
  );
  // Polar days are cold (-130 C at Sol 2), so solar derating clamps at +2%
  // instead of losing to heat; net charge is higher than equatorial data.
  // Round-trip efficiency + self-discharge still apply to the net charge.
  assert.equal(day.summary.resourceDeltas.batteryKWh, 31.22);
  assert.ok(day.summary.resourceDeltas.batteryKWh < 32.0, 'round-trip efficiency must lose energy on net charge');

  // Battery never exceeds its storage cap.
  const capped = core.resolveSol(
    variant(base, {
      clock: { sol: 2, phase: 'rationing', resolutionIndex: 1 },
      dailyPlan: committedPlan(2),
      resources: { batteryKWh: 59 },
      systems: { solar: solar3 },
    }),
    bundle,
    'preview'
  );
  assert.equal(capped.nextState.resources.batteryKWh, bundle.balance.storages.batteryKWh.max);
  assert.ok(capped.nextState.resources.batteryKWh <= bundle.balance.storages.batteryKWh.max);
});

test('Airlock leak scales with lost integrity and a degraded scrubber raises O2 consumption', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 13, spaceWeatherOverride: 'quiet' });
  const o2Delta = (airlockIntegrity, scrubberIntegrity = 1) =>
    core.resolveSol(
      variant(base, {
        clock: { sol: 3, phase: 'rationing', resolutionIndex: 2 },
        dailyPlan: committedPlan(3),
        systems: {
          airlock: { id: 'airlock', level: 1, integrity: airlockIntegrity, status: airlockIntegrity >= 0.85 ? 'nominal' : 'degraded' },
          scrubber: { id: 'scrubber', level: 1, integrity: scrubberIntegrity, status: scrubberIntegrity >= 0.85 ? 'nominal' : 'degraded' },
        },
      }),
      bundle,
      'preview'
    ).summary.resourceDeltas.oxygenKg;

  // 4 crew * 0.85 kg
  assert.equal(o2Delta(1.0), -3.4);
  // 50% airlock integrity -> 1.0 kg * 0.5 = 0.5 kg leak
  assert.equal(o2Delta(0.5), -3.9);
  // 20% lost integrity -> 0.2 kg leak (proportional, not flat)
  assert.equal(o2Delta(0.8), -3.6);
  // 50% scrubber integrity -> +7.5% O2 use
  assert.equal(o2Delta(1.0, 0.5), -3.66);
  assert.ok(o2Delta(1.0, 0.5) < o2Delta(1.0), 'a degraded scrubber must cost extra O2');
});

test('WRS recovery is proportional to recycler integrity', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 14, spaceWeatherOverride: 'quiet' });
  const sol7 = (recyclerIntegrity) =>
    core.resolveSol(
      variant(base, {
        clock: { sol: 7, phase: 'rationing', resolutionIndex: 6 },
        dailyPlan: committedPlan(7, { wrsEnabled: true }),
        resources: { batteryKWh: 8, wasteWaterL: 10, waterL: 35 },
        systems: {
          solar: { id: 'solar', level: 1, integrity: 0, status: 'offline' },
          recycler: {
            id: 'recycler',
            level: 1,
            integrity: recyclerIntegrity,
            status: recyclerIntegrity >= 0.85 ? 'nominal' : 'degraded',
          },
        },
      }),
      bundle,
      'preview'
    );

  const healthy = sol7(1.0);
  assert.equal(healthy.summary.checkpoint.wrsProcessedWasteWaterL, 18.8);
  assert.equal(healthy.summary.wrsRecoveredWaterL, 16.9, 'existing and same-Sol greywater recover at 90%');
  assert.equal(healthy.summary.resourceDeltas.waterL, 6.9);
  assert.equal(healthy.nextState.resources.wasteWaterL, 0);

  const half = sol7(0.5);
  assert.equal(half.summary.wrsRecoveredWaterL, 8.4, 'half integrity halves same-batch recovery');
  assert.equal(half.summary.resourceDeltas.waterL, -1.6);
  assert.ok(half.nextState.resources.waterL < healthy.nextState.resources.waterL);
});

test('Five-Sol forecast auto-issues MREs before crew would become hungry and exposes remaining stock', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 15, spaceWeatherOverride: 'quiet' });
  const state = variant(base, {
    clock: { sol: 1, phase: 'rationing', resolutionIndex: 0 },
    dailyPlan: committedPlan(1),
  });

  const trend = core.selectFiveSolResourceTrend(state, bundle, 5);
  assert.deepEqual(trend.map((point) => point.mrePacks), [24, 24, 20, 20, 16]);
  assert.equal(trend.length, 5);
});

test('Continuous wear degrades systems every Sol and storm hardware stress accelerates it', () => {
  const bundle = core.loadContentBundle();
  const quiet = core.createInitialGameState(bundle, { seed: 15, spaceWeatherOverride: 'quiet' });
  const quietOut = core.resolveSol(
    variant(quiet, {
      clock: { sol: 3, phase: 'rationing', resolutionIndex: 2 },
      dailyPlan: committedPlan(3),
    }),
    bundle,
    'preview'
  );
  for (const id of ['solar', 'recycler', 'scrubber', 'airlock', 'fabricator']) {
    assert.equal(quietOut.nextState.systems[id].integrity, 0.997, `${id} wears 0.003 per quiet Sol`);
    assert.equal(quietOut.nextState.systems[id].status, 'nominal');
  }

  const storm = core.createInitialGameState(bundle, { seed: 15, donkiProfileId: 'may-2024-xstorm' });
  const stormOut = core.resolveSol(
    variant(storm, {
      clock: { sol: 16, phase: 'rationing', resolutionIndex: 15 },
      dailyPlan: committedPlan(16),
    }),
    bundle,
    'preview'
  );
  const quietWear = 1 - quietOut.nextState.systems.recycler.integrity;
  const stormWear = 1 - (stormOut.nextState.systems.recycler.integrity ?? 1);
  assert.ok(stormWear >= quietWear, 'storm wear must be at least the quiet-Sol baseline');
  assert.ok(stormOut.summary.weather.hardwareStressIndex > 0, 'fixture Sol must carry hardware stress');
});

test('Chronic radiation dose applies thresholded health penalties', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 16, spaceWeatherOverride: 'quiet' });
  const withDose = (dose) => {
    const crew = Object.fromEntries(
      Object.entries(base.crew).map(([id, member]) => [id, { ...member, radiationMgy: dose, health: 100 }])
    );
    return core.resolveSol(
      variant(base, {
        clock: { sol: 3, phase: 'rationing', resolutionIndex: 2 },
        dailyPlan: committedPlan(3),
        crew,
      }),
      bundle,
      'preview'
    ).nextState.crew;
  };

  // Quiet Sol adds background GCR dose, so compare against the no-dose baseline.
  const clean = withDose(0).cmd.health;
  const first = withDose(30).cmd.health;
  const second = withDose(70).cmd.health;
  assert.equal(first, clean - 0.5, '>= 25 mGy costs 0.5 health per Sol');
  assert.equal(second, clean - 1.0, '>= 60 mGy costs 1.0 health per Sol');
  assert.equal(withDose(30).eng.health, first, 'penalty applies to every crew member');
});

test('Rover mitigation needs remaining durability and operator health scales incident risk', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, {
    seed: 17,
    donkiProfileId: 'may-2024-xstorm',
  });
  const mission = {
    expeditionId: 'regolith-field',
    status: 'exploring',
    scheduledSol: 5,
    launchedSol: 5,
    statusEnteredSol: 6,
    expectedReturnSol: 9,
    launchOperatorCrewId: 'cmd',
    recoveryOperatorCrewId: null,
    equippedItems: ['dust_shield'],
    travelTicksCompleted: 2,
    signalLostSols: 0,
    resumeStatus: null,
    recoveryDelaySols: 0,
    incidents: [],
  };

  const riskFor = (durability, health) =>
    core.resolveSol(
      variant(base, {
        clock: { sol: 16, phase: 'rationing', resolutionIndex: 15 },
        dailyPlan: committedPlan(16),
        rover: { activeMission: mission, missionHistory: [] },
        equipment: {
          dust_shield: {
            ...base.equipment.dust_shield,
            owned: true,
            durability,
            state: durability > 0 ? 'good' : 'damaged',
          },
        },
        crew: { cmd: { ...base.crew.cmd, health } },
      }),
      bundle,
      'preview'
    ).summary.weather.roverIncidentProb;

  const pristine = riskFor(100, 100);
  const broken = riskFor(0, 100);
  const injured = riskFor(100, 50);

  assert.ok(pristine < 0.1, 'an intact mitigation item keeps storm risk low');
  assert.ok(broken > pristine * 5, 'a spent mitigation item must stop blocking the threat');
  assert.ok(injured > pristine, 'an injured operator raises incident risk');
  assert.ok(injured <= pristine * 1.25, 'operator health factor is capped at 1.25x');
});

test('Repair success scales with crew health without breaking deterministic quiet repairs', () => {
  const bundle = core.loadContentBundle();
  const repairState = (seed, health, quiet) => {
    const base = quiet
      ? core.createInitialGameState(bundle, { seed, spaceWeatherOverride: 'quiet' })
      : core.createInitialGameState(bundle, { seed, donkiProfileId: 'may-2024-xstorm' });
    return variant(base, {
      clock: { sol: quiet ? 3 : 16, phase: 'rationing', resolutionIndex: quiet ? 2 : 15 },
      dailyPlan: committedPlan(quiet ? 3 : 16),
      systems: { airlock: { id: 'airlock', level: 1, integrity: 0.5, status: 'degraded' } },
      crew: {
        eng: {
          ...base.crew.eng,
          health,
          assignedTask: { type: 'repair-system', targetSystemId: 'airlock' },
        },
      },
    });
  };

  // Quiet Sols are deterministic for every health value.
  const quietOut = core.resolveSol(repairState(1, 40, true), bundle, 'preview');
  assert.equal(quietOut.summary.weather.repairSuccessProb, 1);
  assert.equal(quietOut.summary.weather.repairRollOk, true);

  // Under a storm, healthy crews succeed at least as often as injured crews.
  const successCount = (health) => {
    let ok = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const out = core.resolveSol(repairState(seed, health, false), bundle, 'preview');
      if (out.summary.weather.repairRollOk) ok += 1;
    }
    return ok;
  };
  const healthy = successCount(100);
  const injured = successCount(50);
  const fragile = successCount(20);
  assert.ok(healthy >= injured, 'injured crews cannot repair more often than healthy crews');
  assert.ok(injured >= fragile, 'lower health cannot improve repair odds');
  assert.ok(healthy > fragile, 'health must materially change storm repair odds');
});

test('Fabricator refuses to run below minimum integrity', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 18, spaceWeatherOverride: 'quiet' });
  const job = {
    action: 'craft',
    itemId: 'medkit',
    startedSol: 3,
    solsRemaining: 2,
    partsSpent: 2,
    waterSpent: 2,
    batteryReserved: 4,
  };
  const runAt = (integrity) =>
    core.resolveSol(
      variant(base, {
        clock: { sol: 3, phase: 'rationing', resolutionIndex: 2 },
        dailyPlan: committedPlan(3),
        fabricator: { usedThisSol: false, activeJob: job },
        systems: {
          fabricator: {
            id: 'fabricator',
            level: 1,
            integrity,
            status: integrity >= 0.85 ? 'nominal' : 'degraded',
          },
        },
      }),
      bundle,
      'preview'
    );

  const healthy = runAt(1.0);
  assert.equal(healthy.summary.unmetLoads.includes('fabricator'), false);
  assert.equal(healthy.nextState.fabricator.activeJob.solsRemaining, 1);

  const broken = runAt(0.3);
  assert.equal(broken.summary.unmetLoads.includes('fabricator'), true);
  assert.equal(broken.nextState.fabricator.activeJob.solsRemaining, 2, 'no progress while fabricator is unreliable');
});

test('Recycling and re-crafting upgraded equipment resets it to level 1', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 1818, spaceWeatherOverride: 'quiet' });
  const upgradedDrill = { ...base.equipment.core_drill, level: 2 };
  const jobFor = (action) => ({
    action,
    itemId: 'core_drill',
    startedSol: 3,
    solsRemaining: 1,
    partsSpent: 0,
    waterSpent: 0,
    batteryReserved: 0,
  });
  const run = (action, equipment) =>
    core.resolveSol(
      variant(base, {
        clock: { sol: 3, phase: 'rationing', resolutionIndex: 2 },
        dailyPlan: committedPlan(3),
        equipment: { core_drill: equipment },
        fabricator: { usedThisSol: false, activeJob: jobFor(action) },
      }),
      bundle,
      'preview'
    ).nextState.equipment.core_drill;

  const recycled = run('recycle', upgradedDrill);
  assert.equal(recycled.owned, false);
  assert.equal(recycled.level, 1);

  const crafted = run('craft', { ...recycled, level: 2 });
  assert.equal(crafted.owned, true);
  assert.equal(crafted.level, 1);
  assert.equal(crafted.durability, 100);
});

test('Medkit healing respects the 65 Health recovery threshold', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 1919 });
  const injured = {
    ...base,
    clock: { sol: 1, phase: 'engineering', resolutionIndex: 0 },
    crew: { ...base.crew, cmd: { ...base.crew.cmd, health: 20, condition: 'injured' } },
  };
  const healed = core.dispatchDomainCommand(
    injured,
    { type: 'crew/use-medkit', targetCrewId: 'cmd' },
    bundle
  );
  assert.equal(healed.ok, true);
  assert.equal(healed.state.crew.cmd.health, 50);
  assert.equal(healed.state.crew.cmd.condition, 'injured');
});

test('Preview and commit remain byte-identical under the new physics', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 19, spaceWeatherOverride: 'quiet' });
  const state = variant(base, {
    clock: { sol: 7, phase: 'rationing', resolutionIndex: 6 },
    dailyPlan: committedPlan(7, { wrsEnabled: true }),
    resources: { batteryKWh: 8, wasteWaterL: 10, waterL: 35 },
    systems: {
      solar: { id: 'solar', level: 1, integrity: 0, status: 'offline' },
      recycler: { id: 'recycler', level: 1, integrity: 0.5, status: 'degraded' },
      scrubber: { id: 'scrubber', level: 1, integrity: 0.5, status: 'degraded' },
      airlock: { id: 'airlock', level: 1, integrity: 0.5, status: 'degraded' },
    },
  });

  const preview = core.resolveSol(state, bundle, 'preview');
  const commit = core.resolveSol(state, bundle, 'commit');

  assert.deepEqual(preview.summary, commit.summary);
  assert.deepEqual(preview.nextState.resources, commit.nextState.resources);
  assert.deepEqual(preview.nextState.systems, commit.nextState.systems);
  assert.deepEqual(preview.nextState.crew, commit.nextState.crew);
  assert.deepEqual(preview.nextState.fabricator, commit.nextState.fabricator);
  assert.deepEqual(preview.nextState.rover, commit.nextState.rover);
  // Only bookkeeping fields (revision/history/debrief clock) may differ in preview.
  assert.equal(preview.nextState.revision, commit.nextState.revision - 1);
  assert.equal(preview.nextState.history.summaries.length, commit.nextState.history.summaries.length - 1);
  assert.equal(
    core.sha256Hex(core.canonicalStringify({ summary: preview.summary, resources: preview.nextState.resources })),
    core.sha256Hex(core.canonicalStringify({ summary: commit.summary, resources: commit.nextState.resources }))
  );
});

test('selectStormTargets distributes storm stress across all 5 station systems including fabricator', () => {
  const hit = new Set();
  for (let sol = 1; sol <= 40; sol += 1) {
    hit.add(core.selectStormTargets(205001, sol));
  }
  for (const sys of ['solar', 'recycler', 'scrubber', 'airlock', 'fabricator']) {
    assert.ok(hit.has(sys), `Expected storm target candidate "${sys}" to be reachable`);
  }
});
