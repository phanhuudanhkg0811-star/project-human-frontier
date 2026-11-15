import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

// Contract between the cockpit UI and the authoritative domain reducer.
// Every button the UI enables must be a command the engine accepts, and every
// command the engine accepts must actually do something visible on screen.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadModules() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/schemas/contracts.ts';
        export * from './src/domain/selectors.ts';
        export * from './src/domain/orchestrator.ts';
        export * from './src/domain/endSolResolver.ts';
        export * from './src/domain/invariants.ts';
        export * from './src/domain/spaceWeather.ts';
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

function engineeringState(overrides = {}) {
  const base = core.createInitialGameState(bundle, { seed: 4242, spaceWeatherOverride: 'quiet' });
  return {
    ...base,
    clock: { sol: 3, phase: 'engineering', resolutionIndex: 2 },
    dailyPlan: { ...base.dailyPlan, sol: 3 },
    ...overrides,
  };
}

test('engine: repairing a system already at 100% is rejected instead of wasting Parts', () => {
  const state = engineeringState();
  assert.equal(state.systems.solar.integrity, 1);
  const rejected = core.dispatchDomainCommand(
    state,
    { type: 'crew/assign', crewId: 'eng', task: 'repair-system', targetSystemId: 'solar' },
    bundle
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'E_PLAN_INVALID');
  assert.equal(rejected.state.resources.partsKg, state.resources.partsKg, 'no Parts spent on a rejected repair');

  const damaged = {
    ...state,
    systems: { ...state.systems, solar: { ...state.systems.solar, integrity: 0.5, status: 'degraded' } },
  };
  const accepted = core.dispatchDomainCommand(
    damaged,
    { type: 'crew/assign', crewId: 'eng', task: 'repair-system', targetSystemId: 'solar' },
    bundle
  );
  assert.equal(accepted.ok, true);
  assert.equal(accepted.state.resources.partsKg, state.resources.partsKg - bundle.balance.systems.repairPartsCost);
});

test('engine: medical-care must target a stationed crew member', () => {
  const state = engineeringState();
  const withEvacuated = {
    ...state,
    crew: { ...state.crew, geo: { ...state.crew.geo, condition: 'evacuated' } },
  };
  const rejected = core.dispatchDomainCommand(
    withEvacuated,
    { type: 'crew/assign', crewId: 'doc', task: 'medical-care', targetCrewId: 'geo' },
    bundle
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'E_PLAN_INVALID');

  const missingTarget = core.dispatchDomainCommand(
    withEvacuated,
    { type: 'crew/assign', crewId: 'doc', task: 'medical-care' },
    bundle
  );
  assert.equal(missingTarget.ok, false);
  assert.equal(missingTarget.error.code, 'E_PLAN_INVALID');

  const accepted = core.dispatchDomainCommand(
    withEvacuated,
    { type: 'crew/assign', crewId: 'doc', task: 'medical-care', targetCrewId: 'cmd' },
    bundle
  );
  assert.equal(accepted.ok, true);
  assert.equal(accepted.state.crew.doc.assignedTask?.type, 'medical-care');
  assert.equal(accepted.state.crew.doc.assignedTask?.targetCrewId, 'cmd');
});

test('engine: radio ticks are a no-op until the reply is actually due', () => {
  const state = engineeringState({ clock: { sol: 3, phase: 'comms', resolutionIndex: 2 } });
  const sent = core.dispatchDomainCommand(
    state,
    { type: 'comms/send-radio', id: 'tx-test', message: 'ping', nowMs: 1_000 },
    bundle
  );
  assert.equal(sent.ok, true);

  const early = core.dispatchDomainCommand(sent.state, { type: 'comms/tick-radio', nowMs: 1_400 }, bundle);
  assert.equal(early.ok, true);
  assert.equal(early.state, sent.state, 'unchanged tick must return the same state object');
  assert.equal(early.state.revision, sent.state.revision, 'revision must not churn on no-op ticks');

  const dueAt = sent.state.logistics.radioMessages[0].replyReadyAtMs;
  const due = core.dispatchDomainCommand(sent.state, { type: 'comms/tick-radio', nowMs: dueAt }, bundle);
  assert.equal(due.ok, true);
  assert.equal(due.state.logistics.radioMessages[0].status, 'reply-received');
  assert.equal(due.state.revision, sent.state.revision + 1);
});
