import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSimulation, simulationRoot } from '../scripts/load-simulation.mjs';

const mod = await loadSimulation();
const bundle = mod.loadContentBundle();
const base = mod.createInitialGameState(bundle, { runId: 'test-fixes', seed: 205099 });

test('Fabricator 3D blocks when integrity < 0.35, checks batteryKWh, and calculates 2-Sol battery properly', () => {

  // 1. Degraded fabricator (< 0.35) is blocked
  const degradedState = {
    ...base,
    clock: { ...base.clock, phase: 'engineering' },
    systems: {
      ...base.systems,
      fabricator: { ...base.systems.fabricator, integrity: 0.3, status: 'degraded' },
    },
  };
  const craftDegraded = mod.dispatchDomainCommand(degradedState, {
    type: 'fabricator/queue',
    action: 'craft',
    itemId: 'medkit',
  }, bundle);
  assert.equal(craftDegraded.ok, false);
  assert.equal(craftDegraded.error.code, 'E_PLAN_INVALID');
  assert.ok(craftDegraded.error.message.includes('35%'));

  // 2. Insufficient battery is blocked
  const nominalState = {
    ...base,
    clock: { ...base.clock, phase: 'engineering' },
    resources: { ...base.resources, batteryKWh: 0.5 }, // medkit needs 2 kWh per Sol
  };
  const craftNoPower = mod.dispatchDomainCommand(nominalState, {
    type: 'fabricator/queue',
    action: 'craft',
    itemId: 'medkit',
  }, bundle);
  assert.equal(craftNoPower.ok, false);
  assert.equal(craftNoPower.error.code, 'E_INSUFFICIENT_RESOURCE');

  // 3. 2-Sol crafting reserves batteryPerSol (2 kWh for Medkit instead of 4 kWh)
  const craftSuccess = mod.dispatchDomainCommand({
    ...base,
    clock: { ...base.clock, phase: 'engineering' },
  }, {
    type: 'fabricator/queue',
    action: 'craft',
    itemId: 'medkit',
  }, bundle);
  assert.equal(craftSuccess.ok, true);
  assert.equal(craftSuccess.state.fabricator.activeJob.batteryReserved, 2);
  assert.equal(craftSuccess.state.fabricator.activeJob.solsRemaining, 2);
});

test('Rover: recover-signal validates state invariants', () => {

  const lostState = {
    ...base,
    clock: { ...base.clock, sol: 3, phase: 'engineering' },
    dailyPlan: { ...base.dailyPlan, sol: 3 },
    equipment: { ...base.equipment, core_drill: { ...base.equipment.core_drill, reservedForRover: true } },
    rover: {
      ...base.rover,
      activeMission: {
        expeditionId: 'lunar-crater',
        status: 'signal-lost',
        scheduledSol: 1,
        launchedSol: 1,
        statusEnteredSol: 2,
        expectedReturnSol: 3,
        launchOperatorCrewId: 'geo',
        recoveryOperatorCrewId: null,
        equippedItems: ['core_drill'],
        travelTicksCompleted: 1,
        signalLostSols: 1,
        resumeStatus: 'outbound',
        recoveryDelaySols: 0,
        incidents: [],
      },
    },
  };
  const recovered = mod.dispatchDomainCommand(lostState, { type: 'rover/recover-signal' }, bundle);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.state.rover.activeMission.status, 'outbound');
});

test('Rover: missed launch clears schedule and unhangs launchOperator', () => {

  // Schedule mission on Sol 1
  const scheduled = mod.dispatchDomainCommand({
    ...base,
    clock: { ...base.clock, phase: 'comms' },
  }, {
    type: 'rover/schedule',
    expeditionId: 'lunar-crater',
    equipmentIds: ['core_drill'],
    launchOperatorCrewId: 'geo',
  }, bundle);
  assert.equal(scheduled.ok, true);
  assert.equal(scheduled.state.equipment.core_drill.reservedForRover, true);

  // Deplete power so launch is unpowered
  const unpoweredState = {
    ...scheduled.state,
    resources: { ...scheduled.state.resources, batteryKWh: 0 },
    systems: { ...scheduled.state.systems, solar: { ...scheduled.state.systems.solar, integrity: 0, status: 'offline' } },
    dailyPlan: { ...scheduled.state.dailyPlan, status: 'committed' },
  };
  const resolved = mod.resolveSol(unpoweredState, bundle, 'commit').nextState;

  // Active mission cancelled, equipment unreserved, operator freed
  assert.equal(resolved.rover.activeMission, null);
  assert.equal(resolved.equipment.core_drill.reservedForRover, false);
});

test('Rover: fallback recovery prioritizes Dmitri (geo) for 25% wear over Ryan (cmd) 50% wear', () => {

  const exploringState = {
    ...base,
    clock: { sol: 3, phase: 'rationing', resolutionIndex: 2 },
    dailyPlan: { ...base.dailyPlan, sol: 3, status: 'committed' },
    equipment: { ...base.equipment, core_drill: { ...base.equipment.core_drill, durability: 100, reservedForRover: true } },
    rover: {
      ...base.rover,
      activeMission: {
        expeditionId: 'lunar-crater',
        status: 'exploring',
        scheduledSol: 1,
        launchedSol: 1,
        statusEnteredSol: 2,
        expectedReturnSol: 3,
        launchOperatorCrewId: 'geo',
        recoveryOperatorCrewId: null, // No explicit operator set; fallback will trigger
        equippedItems: ['core_drill'],
        travelTicksCompleted: 2,
        signalLostSols: 0,
        resumeStatus: null,
        recoveryDelaySols: 0,
        incidents: [],
      },
    },
  };
  const resolved = mod.resolveSol(exploringState, bundle, 'commit').nextState;
  assert.equal(resolved.rover.activeMission.status, 'completed');
  assert.equal(resolved.rover.activeMission.recoveryOperatorCrewId, 'geo'); // Dmitri selected, not Ryan!
  assert.equal(resolved.equipment.core_drill.durability, 75); // 25% wear, not 50%!
});

test('Rover: set-recovery-operator and unassign release old operator tasks cleanly', () => {

  const readyForRecoveryState = {
    ...base,
    clock: { sol: 3, phase: 'engineering', resolutionIndex: 2 },
    dailyPlan: { ...base.dailyPlan, sol: 3 },
    equipment: { ...base.equipment, core_drill: { ...base.equipment.core_drill, reservedForRover: true } },
    rover: {
      ...base.rover,
      activeMission: {
        expeditionId: 'lunar-crater',
        status: 'exploring',
        scheduledSol: 1,
        launchedSol: 1,
        statusEnteredSol: 2,
        expectedReturnSol: 3,
        launchOperatorCrewId: 'geo',
        recoveryOperatorCrewId: null,
        equippedItems: ['core_drill'],
        travelTicksCompleted: 2,
        signalLostSols: 0,
        resumeStatus: null,
        recoveryDelaySols: 0,
        incidents: [],
      },
    },
  };

  // 1. Assign Dmitri ('geo') as recovery operator
  const step1 = mod.dispatchDomainCommand(readyForRecoveryState, {
    type: 'rover/set-recovery-operator',
    crewId: 'geo',
  }, bundle);
  assert.equal(step1.ok, true);
  assert.equal(step1.state.crew.geo.assignedTask?.type, 'rover-operate');

  // 2. Change to Ryan ('cmd'): Dmitri's task must be released to null!
  const step2 = mod.dispatchDomainCommand(step1.state, {
    type: 'rover/set-recovery-operator',
    crewId: 'cmd',
  }, bundle);
  assert.equal(step2.ok, true);
  assert.equal(step2.state.crew.geo.assignedTask, null);
  assert.equal(step2.state.crew.cmd.assignedTask?.type, 'rover-operate');
  assert.equal(step2.state.rover.activeMission.recoveryOperatorCrewId, 'cmd');

  // 3. Unassign Ryan ('cmd') via crew/unassign: task freed and activeMission recovery cleared!
  const step3 = mod.dispatchDomainCommand(step2.state, {
    type: 'crew/unassign',
    crewId: 'cmd',
  }, bundle);
  assert.equal(step3.ok, true);
  assert.equal(step3.state.crew.cmd.assignedTask, null);
  assert.equal(step3.state.rover.activeMission.recoveryOperatorCrewId, null);
});

test('Sol 22 event math: Choice 1 removes erroneous +2 kWh, Choice 2 forces wrsEnabled: true', () => {
  const events = JSON.parse(fs.readFileSync(path.join(simulationRoot, 'src/data/events.json'), 'utf-8'));
  const sol22 = events.find((e) => e.id === 'evt-emergency-load-shed');
  assert.ok(sol22);

  const choice1 = sol22.choices.find((c) => c.id === 'divert-wrs-power');
  assert.ok(choice1);
  assert.equal(choice1.effects.some((eff) => eff.kind === 'resource' && eff.resource === 'batteryKWh'), false);
  assert.equal(choice1.effects.some((eff) => eff.kind === 'plan-override' && eff.wrsEnabled === false), true);

  const choice2 = sol22.choices.find((c) => c.id === 'burn-battery-reserve');
  assert.ok(choice2);
  assert.equal(choice2.effects.some((eff) => eff.kind === 'plan-override' && eff.wrsEnabled === true), true);
  assert.equal(choice2.effects.some((eff) => eff.kind === 'resource' && eff.resource === 'batteryKWh' && eff.delta === -4), true);
});

test('NASA briefs & RadLab: removes Scrubber/ and notes 0.316 mGy/day vs 0.38 mGy/Sol', () => {
  const briefs = JSON.parse(fs.readFileSync(path.join(simulationRoot, 'src/data/nasa-briefs.json'), 'utf-8'));
  const radBrief = briefs.find((b) => b.id === 'brief-donki-sep-flare');
  assert.ok(radBrief);
  assert.equal(radBrief.content.includes('Scrubber/'), false);
  assert.equal(radBrief.contentEn.includes('Scrubber'), false);
  assert.equal(radBrief.content.includes('0.316 mGy/ngày'), true);
  assert.equal(radBrief.content.includes('0.38 mGy/Sol'), true);
});

test('Intro Contract, Sol 3 -> Sol 18 airlock flag, Sol 9 aftermath, and requireFree: true', () => {
  const events = JSON.parse(fs.readFileSync(path.join(simulationRoot, 'src/data/events.json'), 'utf-8'));

  // Sol 3 follow up delay is 15 Sols
  const sol3 = events.find((e) => e.id === 'sol3-airlock-seal-alert');
  const ignoreChoice = sol3.choices.find((c) => c.id === 'ignore-leak');
  const followUpEff = ignoreChoice.effects.find((eff) => eff.kind === 'schedule-follow-up');
  assert.equal(followUpEff.delaySols, 15);

  // Sol 18 requires airlock_dusty flag
  const sol18 = events.find((e) => e.id === 'evt-cryo-seal-crack');
  assert.equal(sol18.when[0].flagSet, 'airlock_dusty');

  // Sol 9 aftermath condition 1 triggers with sol7_saved_rover alone
  const sol9 = events.find((e) => e.id === 'evt-rover2-aftermath');
  assert.equal(sol9.when[0].flagSet, 'sol7_saved_rover');
  assert.equal(sol9.when[0].roverExpeditionId, undefined);

  // All choices with requiresCrew have requireFree: true
  for (const ev of events) {
    for (const choice of ev.choices) {
      if (choice.requiresCrew) {
        assert.equal(choice.requiresCrew.requireFree, true, `Event ${ev.id} choice ${choice.id} missing requireFree`);
      }
    }
  }
});

test('CAPCOM replies dynamically by phase and isCompatibleAppVersion accepts compatible semvers', () => {

  // Day phase reply (Sol 5)
  const dayState = {
    ...base,
    clock: { ...base.clock, sol: 5, phase: 'comms' },
    logistics: {
      ...base.logistics,
      radioMessages: [
        {
          id: 'tx-1',
          sentSol: 5,
          prompt: 'Telemetry test',
          status: 'transmitting',
          reply: null,
          replyReadyAtMs: 100,
        },
      ],
    },
  };
  const dayTick = mod.dispatchDomainCommand(dayState, { type: 'comms/tick-radio', nowMs: 200 }, bundle);
  assert.equal(dayTick.ok, true);
  assert.ok(dayTick.state.logistics.radioMessages[0].reply.includes('Đêm Trăng Sol 15'));

  // Night phase reply (Sol 20)
  const nightState = {
    ...base,
    clock: { ...base.clock, sol: 20, phase: 'comms' },
    logistics: {
      ...base.logistics,
      radioMessages: [
        {
          id: 'tx-2',
          sentSol: 20,
          prompt: 'Night check',
          status: 'transmitting',
          reply: null,
          replyReadyAtMs: 100,
        },
      ],
    },
  };
  const nightTick = mod.dispatchDomainCommand(nightState, { type: 'comms/tick-radio', nowMs: 200 }, bundle);
  assert.equal(nightTick.ok, true);
  assert.ok(nightTick.state.logistics.radioMessages[0].reply.includes('lò Fission'));

  // Dawn phase reply (Sol 30)
  const dawnState = {
    ...base,
    clock: { ...base.clock, sol: 30, phase: 'comms' },
    logistics: {
      ...base.logistics,
      radioMessages: [
        {
          id: 'tx-3',
          sentSol: 30,
          prompt: 'Dawn check',
          status: 'transmitting',
          reply: null,
          replyReadyAtMs: 100,
        },
      ],
    },
  };
  const dawnTick = mod.dispatchDomainCommand(dawnState, { type: 'comms/tick-radio', nowMs: 200 }, bundle);
  assert.equal(dawnTick.ok, true);
  assert.ok(dawnTick.state.logistics.radioMessages[0].reply.includes('Bình minh Sol 29'));

  // isCompatibleAppVersion testing
  assert.equal(mod.isCompatibleAppVersion('1.4.0', '1.4.0'), true);
  assert.equal(mod.isCompatibleAppVersion('1.4.1', '1.4.0'), true);
  assert.equal(mod.isCompatibleAppVersion('1.3.0', '1.4.0'), true);
  assert.equal(mod.isCompatibleAppVersion('2.0.0', '1.4.0'), true);
  assert.equal(mod.isCompatibleAppVersion('0.1.0', '1.4.0'), false);
});

test('P2 #1 RadLab CRaTER dataset drives runtime surface radiation baseline (0.316 * 1.20228 = 0.38 mGy/Sol)', () => {
  const defaultState = mod.createInitialGameState(bundle, {
    runId: 'test-radlab-default',
    seed: 205001,
    difficulty: 'standard',
    donkiProfileId: 'may-2024-extreme',
  });
  const doubledPhysiology = {
    ...bundle.crewPhysiology,
    convertedMeanMgyPerDay: bundle.crewPhysiology.convertedMeanMgyPerDay * 2,
  };
  const doubledBundle = { ...bundle, crewPhysiology: doubledPhysiology };

  const defaultRes = mod.resolveSol(defaultState, bundle);
  const doubledRes = mod.resolveSol(defaultState, doubledBundle);
  const defaultSol1 = defaultRes.summary;
  const doubledSol1 = doubledRes.summary;

  assert.ok(defaultSol1 && doubledSol1);
  assert.ok(
    doubledSol1.weather.radiationDoseMgy > defaultSol1.weather.radiationDoseMgy,
    `Expected RadLab orbital dose increase to raise runtime dose (${doubledSol1.weather.radiationDoseMgy} vs ${defaultSol1.weather.radiationDoseMgy})`
  );
  assert.ok(
    doubledRes.nextState.crew.cmd.radiationMgy > defaultRes.nextState.crew.cmd.radiationMgy,
    'Expected crew cumulative radiationMgy to reflect updated RadLab baseline'
  );
});

test('P2 #2 & #3 NASA briefs explain solarPenaltyPct shunt derating, indoor scrubber dust, and MRE/Medkit abstraction', () => {
  const briefs = JSON.parse(fs.readFileSync(path.join(simulationRoot, 'src/data/nasa-briefs.json'), 'utf-8'));
  const radBrief = briefs.find((b) => b.id === 'brief-donki-sep-flare');
  const dustBrief = briefs.find((b) => b.id === 'brief-regolith-isru');
  const mfgBrief = briefs.find((b) => b.id === 'brief-in-space-mfg');

  assert.ok(radBrief && dustBrief && mfgBrief);
  assert.match(radBrief.contentEn, /solarPenaltyPct, not dust clouds/i);
  assert.match(dustBrief.contentEn, /tracked indoors on EVA suits/i);
  assert.match(mfgBrief.contentEn, /gameplay abstraction/i);
});
