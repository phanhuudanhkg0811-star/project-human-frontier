import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSimulation } from '../scripts/load-simulation.mjs';

const core = await loadSimulation();
const bundle = core.loadContentBundle();
const options = { seed: 205099, difficulty: 'cadet', runId: 'reference-run-identity' };
const baseline = core.runCampaign(bundle, options, core.baselinePolicy);

test('P1 baseline completes 32 Sol with legal commands and exactly replays its recorded identity', () => {
  assert.equal(baseline.status, 'completed', baseline.error);
  assert.equal(baseline.state.campaign.status, 'victory');
  assert.equal(baseline.metrics.completedSols, 32);
  assert.equal(baseline.metrics.completedExpeditions, 0);
  assert.equal(baseline.metrics.rejectedCommands, 0);
  assert.deepEqual(core.replayCampaign(JSON.parse(JSON.stringify(baseline.trace)), bundle), baseline.state);
  assert.equal(baseline.trace.initialState.campaign.runId, options.runId);
  const repeat = core.runCampaign(bundle, options, core.baselinePolicy);
  assert.deepEqual(repeat.trace, baseline.trace);
});

test('Replay rejects changed commands, initial identity, checkpoints, outcome and content', () => {
  const change = (mutate) => {
    const trace = structuredClone(baseline.trace);
    mutate(trace);
    return trace;
  };
  assert.throws(() => core.replayCampaign(change((t) => { t.steps[0].command = { type: 'sol/end' }; }), bundle), /mismatch/);
  assert.throws(() => core.replayCampaign(change((t) => { t.initialState.campaign.runId = 'another-run'; }), bundle), /checksum/);
  assert.throws(() => core.replayCampaign(change((t) => { t.steps[3].stateHash = 'tampered'; }), bundle), /checksum/);
  assert.throws(() => core.replayCampaign(change((t) => { t.expectedOutcome = 'defeat'; }), bundle), /outcome/);
  const otherBundle = structuredClone(bundle);
  otherBundle.balance.power.fissionKWhPerSol = 9;
  assert.throws(() => core.replayCampaign(baseline.trace, otherBundle), /content checksum/);
  assert.throws(() => core.replayCampaign(change((t) => { t.initialState.modelVersion = 'unknown-model'; }), bundle), /version mismatch/);
});

test('Repeated rejected commands are recorded and budget exhaustion is a simulation error, not defeat', () => {
  const run = core.runCampaign(bundle, options, { id: 'stuck-policy', nextCommand: () => ({ type: 'sol/end' }) }, 3);
  assert.equal(run.status, 'simulation-error');
  assert.match(run.error, /budget exhausted/);
  assert.equal(run.state.campaign.status, 'active');
  assert.equal(run.trace.steps.length, 3);
  assert.equal(run.metrics.rejectedCommands, 3);
  assert.ok(run.trace.steps.every((step) => !step.ok && step.stateHash === run.trace.initialHash));
  assert.deepEqual(core.replayCampaign(run.trace, bundle), run.trace.initialState);
});

test('Policy snapshots cannot modify engine state/content; restarts and absent commands are diagnosed', () => {
  const originalBundle = structuredClone(bundle);
  const run = core.runCampaign(bundle, options, {
    id: 'mutating-policy',
    nextCommand(state, content) {
      state.resources.waterL = 0;
      content.campaign.targetSol = 1;
      return null;
    },
  });
  assert.equal(run.status, 'simulation-error');
  assert.match(run.error, /no next command/);
  assert.equal(run.trace.finalHash, run.trace.initialHash);
  assert.deepEqual(bundle, originalBundle);
  const restart = core.runCampaign(bundle, options, { id: 'restart-policy', nextCommand: () => ({ type: 'game/start' }) });
  assert.equal(restart.status, 'simulation-error');
  assert.match(restart.error, /cannot restart/);
  assert.equal(restart.trace.steps.length, 0);
});
