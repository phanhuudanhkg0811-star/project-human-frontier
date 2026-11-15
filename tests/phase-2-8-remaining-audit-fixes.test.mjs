import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiled = await esbuild.build({
  stdin: { contents: `
    export * from './src/schemas/contracts.ts';
    export * from './src/domain/eventSelectors.ts';
    export * from './src/domain/eventEngine.ts';
    export * from './src/domain/orchestrator.ts';
    export * from './src/domain/spaceWeather.ts';
    export * from './src/components/modals/MissionDialog.tsx';
    export { createElement } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';
  `, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', target: 'es2022',
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  createRequire(import.meta.url), loaded, loaded.exports,
);
const core = loaded.exports;
const bundle = core.loadContentBundle();
const initialState = () => core.createInitialGameState(bundle, { runId: 'audit-fixture', seed: 7070 });

test('Event choice previews list each resource delta exactly once (no effectsSummary echo)', () => {
  for (const event of bundle.events) {
    const previews = core.selectEventChoicePreviews(initialState(), event.id, bundle);
    for (const pv of previews) {
      for (const key of Object.keys(pv.resourceDeltas)) {
        assert.ok(
          !pv.effectsSummary.some((line) => line.startsWith(`${key}:`)),
          `${event.id}/${pv.choice.id}: resource ${key} appears in both resourceDeltas and effectsSummary`
        );
      }
      assert.ok(
        !pv.effectsSummary.some((line) => line.startsWith('Science:')),
        `${event.id}/${pv.choice.id}: science delta echoed in effectsSummary`
      );
    }
  }
});

test('Every set-flag in the event catalog has a consumer (flagSet/flagNotSet/flagEquals/requiresFlag)', () => {
  const events = JSON.parse(fs.readFileSync(path.join(root, 'src/data/events.json'), 'utf8'));
  const written = new Map();
  const read = new Set();
  for (const event of events) {
    for (const cond of event.when ?? []) {
      for (const key of ['flagSet', 'flagNotSet']) if (cond[key]) read.add(cond[key]);
      if (cond.flagEquals) read.add(cond.flagEquals.key);
    }
    for (const choice of event.choices ?? []) {
      if (choice.requiresFlag) read.add(choice.requiresFlag);
      for (const eff of choice.effects ?? []) {
        if (eff.kind === 'set-flag') written.set(`${event.id}/${choice.id}`, eff.key);
      }
    }
  }
  // Flags may also be consumed in code (evaluators/reports), e.g. narrativeSelectors reads
  // state.events.flags.<key> — scan domain/simulation sources for those references.
  for (const dir of ['src/domain', 'src/simulation']) {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      if (!name.endsWith('.ts')) continue;
      const text = fs.readFileSync(path.join(root, dir, name), 'utf8');
      for (const match of text.matchAll(/flags(?:\.([A-Za-z_]\w*)|\[['"]([^'"]+)['"]\])/g)) {
        read.add(match[1] ?? match[2]);
      }
    }
  }
  for (const [site, key] of written) {
    assert.ok(read.has(key), `set-flag "${key}" at ${site} is write-only: give it a consumer or delete it`);
  }
});

test('Earlier decisions unlock later event choices (flag consumers are playable)', () => {
  const base = initialState();
  const withFlags = (flags) => ({
    ...base,
    events: { ...base.events, flags: { ...base.events.flags, ...flags } },
  });
  const allowedIds = (state, eventId) =>
    core.selectEventChoicePreviews(state, eventId, bundle)
      .filter((pv) => pv.allowed)
      .map((pv) => pv.choice.id);

  for (const [flag, eventId] of [
    ['sensors_calibrated', 'sol2-solar-particles'],
    ['airlock_sealed', 'evt-mid-night-resupply'],
    ['cargo_beacon_ready', 'evt-sol31-final-inspection'],
    ['sunset_battery_boosted', 'evt-emergency-load-shed'],
    ['pipes_insulated', 'evt-emergency-load-shed'],
  ]) {
    const without = allowedIds(base, eventId);
    const with_ = allowedIds(withFlags({ [flag]: true }), eventId);
    const unlocked = with_.filter((id) => !without.includes(id));
    assert.equal(
      unlocked.length, 1,
      `${flag} must unlock exactly one additional choice in ${eventId} (unlocked: ${unlocked.join(',') || 'none'})`
    );
  }

  // Sol 14's two branches are mutually exclusive, so Sol 22 offers exactly one bonus path.
  const boosted = allowedIds(withFlags({ sunset_battery_boosted: true }), 'evt-emergency-load-shed');
  const insulated = allowedIds(withFlags({ pipes_insulated: true }), 'evt-emergency-load-shed');
  const overlap = boosted.filter((id) => insulated.includes(id));
  assert.equal(overlap.length, 2, 'only the two baseline Sol 22 choices are shared');
});

const signalLostState = () => {
  const base = initialState();
  return {
    ...base,
    clock: { ...base.clock, sol: 3, phase: 'engineering' },
    dailyPlan: { ...base.dailyPlan, sol: 3 },
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
        equippedItems: [],
        travelTicksCompleted: 1,
        signalLostSols: 1,
        resumeStatus: 'outbound',
        recoveryDelaySols: 0,
        incidents: [],
      },
    },
  };
};

test('rover/recover-signal costs 2 kWh battery and refuses without enough battery', () => {
  const charged = signalLostState();
  const ok = core.dispatchDomainCommand(
    { ...charged, resources: { ...charged.resources, batteryKWh: 10 } },
    { type: 'rover/recover-signal' },
    bundle
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.state.resources.batteryKWh, 8);

  const poor = signalLostState();
  const denied = core.dispatchDomainCommand(
    { ...poor, resources: { ...poor.resources, batteryKWh: 1 } },
    { type: 'rover/recover-signal' },
    bundle
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_INSUFFICIENT_RESOURCE');
  assert.equal(denied.state.resources.batteryKWh, 1);
});

test('rover/clear-recovery-operator frees the assigned operator', () => {
  const base = initialState();
  const mission = {
    expeditionId: 'lunar-crater',
    status: 'exploring',
    scheduledSol: 1,
    launchedSol: 1,
    statusEnteredSol: 3,
    expectedReturnSol: 5,
    launchOperatorCrewId: 'geo',
    recoveryOperatorCrewId: 'eng',
    equippedItems: [],
    travelTicksCompleted: 2,
    signalLostSols: 0,
    resumeStatus: null,
    recoveryDelaySols: 0,
    incidents: [],
  };
  const busy = {
    ...base,
    clock: { ...base.clock, sol: 5, phase: 'engineering' },
    dailyPlan: { ...base.dailyPlan, sol: 5 },
    crew: { ...base.crew, eng: { ...base.crew.eng, assignedTask: { type: 'rover-operate' } } },
    rover: { ...base.rover, activeMission: mission },
  };
  const cleared = core.dispatchDomainCommand(busy, { type: 'rover/clear-recovery-operator' }, bundle);
  assert.equal(cleared.ok, true);
  assert.equal(cleared.state.rover.activeMission.recoveryOperatorCrewId, null);
  assert.equal(cleared.state.crew.eng.assignedTask, null);

  const unassigned = { ...busy, rover: { ...busy.rover, activeMission: { ...mission, recoveryOperatorCrewId: null } } };
  const noop = core.dispatchDomainCommand(unassigned, { type: 'rover/clear-recovery-operator' }, bundle);
  assert.equal(noop.ok, false);
});

test('DONKI storms can degrade the 3D Fabricator like any other system (P2)', () => {
  const targets = new Set();
  for (let seed = 0; seed < 40; seed++) {
    for (let sol = 1; sol <= 32; sol++) {
      targets.add(core.selectStormTargets(seed, sol));
    }
  }
  for (const systemId of ['solar', 'recycler', 'scrubber', 'airlock', 'fabricator']) {
    assert.ok(targets.has(systemId), `storm targets never hit ${systemId}`);
  }
});

const sol7State = (rover) => {
  const base = initialState();
  return {
    ...base,
    clock: { ...base.clock, sol: 7, phase: 'briefing' },
    events: { ...base.events, activeEventId: null, activeEvent: null, pendingFollowUps: [] },
    rover,
  };
};

const outboundMission = {
  expeditionId: 'regolith-field',
  status: 'outbound',
  scheduledSol: 6,
  launchedSol: 6,
  statusEnteredSol: 6,
  expectedReturnSol: 8,
  launchOperatorCrewId: 'geo',
  recoveryOperatorCrewId: null,
  equippedItems: [],
  incidents: [],
  signalLostSols: 0,
  recoveryDelaySols: 0,
  resumeStatus: null,
};

test('Sol 7 crisis adapts to Rover state instead of assuming an active expedition', () => {
  const idle = core.selectNextSolEvent(sol7State({ activeMission: null, missionHistory: [] }), bundle).activeEvent;
  assert.ok(idle, 'Sol 7 must always have an event');
  const idleEvent = bundle.events.find((event) => event.id === idle.eventId);
  assert.ok(idleEvent?.mandatory, 'Sol 7 event stays mandatory');
  assert.ok(
    !idleEvent.choices.some((choice) => choice.effects.some((eff) => eff.kind === 'rover-action')),
    'station-only Sol 7 variant must not carry rover-action effects that silently no-op'
  );

  const travelling = core.selectNextSolEvent(
    sol7State({ activeMission: outboundMission, missionHistory: [] }),
    bundle
  ).activeEvent;
  assert.equal(travelling?.eventId, 'sol7-golden-comms-crisis');
});

