import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSimulation } from '../scripts/load-simulation.mjs';
const core = await loadSimulation();
const bundle = core.loadContentBundle();
const base = core.createInitialGameState(bundle, { runId: 'campaign-boundary', seed: 205099 });
const evaluate = (state, sol = 32) => core.evaluateCampaign(state, bundle.campaign, sol);
const withCrew = (active, fit = active) => ({ ...base, crew: Object.fromEntries(Object.entries(base.crew).map(([id, crew], index) =>
  [id, { ...crew, condition: index < fit ? 'fit' : index < active ? 'injured' : 'evacuated' }])) });
const withExpeditions = (state, count) => ({ ...state, rover: { ...state.rover, missionHistory: bundle.campaign.expeditions.slice(0, count).map((expedition) => ({ expeditionId: expedition.id, outcome: 'completed' })) } });

test('Campaign terminal boundaries prioritize defeat and require positive final life support', () => {
  assert.equal(evaluate(base, 31).status, 'active');
  assert.equal(evaluate(base).status, 'victory');
  assert.equal(evaluate(withCrew(1)).reasonCode, 'crew-collapse');
  assert.equal(evaluate(withCrew(2)).status, 'victory');
  const oxygen = { ...base, resources: { ...base.resources, oxygenKg: 0, oxygenZeroStreak: 1 } };
  assert.equal(evaluate(oxygen).reasonCode, 'oxygen-depleted');
  const water = { ...base, resources: { ...base.resources, waterL: 0, waterZeroStreak: 1 } };
  assert.equal(evaluate(water, 31).status, 'active');
  assert.equal(evaluate(water).reasonCode, 'final-requirements-unmet');
  assert.equal(evaluate({ ...water, resources: { ...water.resources, waterZeroStreak: 2 } }, 31).reasonCode, 'water-depleted');
});

test('Highest eligible S/A/B rank uses the configured rubric and never ranks defeats', () => {
  assert.equal(evaluate(withExpeditions(withCrew(4), 3)).rank, 'S');
  assert.equal(evaluate(withExpeditions(withCrew(4, 3), 3)).rank, 'A');
  assert.equal(evaluate(withExpeditions(withCrew(3), 2)).rank, 'A');
  assert.equal(evaluate(withExpeditions(withCrew(3), 1)).rank, 'B');
  assert.equal(evaluate(withExpeditions(withCrew(2), 3)).rank, 'B');
  assert.equal(evaluate(withExpeditions(withCrew(1), 3)).rank, null);
  assert.equal(evaluate(withExpeditions(base, 3), 31).rank, null);
});

test('Preview and commit share outcome, WRS denominator and Lunar Night solar ledger', () => {
  for (const sol of [14, 15, 28, 29, 32]) {
    const state = { ...base, clock: { ...base.clock, sol, phase: 'rationing' }, dailyPlan: { ...base.dailyPlan, sol },
      resources: { ...base.resources, wasteWaterL: 7 } };
    const preview = core.resolveSol(state, bundle, 'preview');
    const commit = core.resolveSol(state, bundle, 'commit');
    assert.deepEqual(preview.nextState.campaign.outcome, commit.nextState.campaign.outcome);
    assert.deepEqual(preview.summary, commit.summary);
    assert.equal(commit.summary.checkpoint.wrsProcessedWasteWaterL, 7);
    assert.equal(commit.summary.wrsRecoveredWaterL, 6.3);
    assert.equal(commit.summary.checkpoint.fissionGeneratedKWh, 8);
    assert.equal(commit.summary.checkpoint.solarGeneratedKWh === 0, sol >= 15 && sol <= 28);
  }
});

test('Sol 12 training snapshot remains historical, non-terminal, and legacy metrics stay unknown', () => {
  const run = core.runCampaign(bundle, { seed: 205099 }, core.baselinePolicy);
  const report = core.selectTrainingReport(run.state, bundle);
  assert.equal(report.sol, 12);
  assert.equal(report.checkpoint.completedExpeditions, 0);
  const altered = { ...run.state, resources: { ...run.state.resources, waterL: 1 }, crew: withCrew(1).crew };
  assert.deepEqual(core.selectTrainingReport(altered, bundle), report);
  const legacy = structuredClone(run.state);
  legacy.history.summaries = legacy.history.summaries.map((summary) => ({ ...summary, checkpoint: null }));
  assert.deepEqual(core.selectTrainingReport(legacy, bundle).checks.map((check) => check.met), [null, null]);
  assert.equal(core.selectCampaignReport(legacy, bundle).wrs.efficiency, null);
  let completed = 0;
  const index = run.trace.steps.findIndex((step) => step.command.type === 'sol/end' && ++completed === bundle.campaign.training.reportSol);
  const prefix = { ...run.trace, steps: run.trace.steps.slice(0, index + 1), finalHash: run.trace.steps[index].stateHash, expectedOutcome: 'active' };
  assert.equal(core.replayCampaign(prefix, bundle).campaign.status, 'active');
});

function storageFor(envelope) {
  const map = new Map([[core.SAVE_STORAGE_KEY, JSON.stringify(envelope)]]);
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
}
test('Valid v3 active/terminal saves migrate without inventing history, retain original bytes, and continue', () => {
  const run = core.runCampaign(bundle, { seed: 205099 }, core.baselinePolicy);
  for (const source of [base, run.state]) {
    const state = structuredClone(source);
    state.schemaVersion = 3;
    delete state.campaign.outcome;
    for (const summary of state.history.summaries) delete summary.checkpoint;
    if (state.debrief.lastSummary) delete state.debrief.lastSummary.checkpoint;
    state.contentVersion = '1.1.0-moon32'; state.modelVersion = '1.1.0-ts-donki';
    const unsigned = { schemaVersion: 3, savedAt: '2026-11-14T00:00:00Z', appVersion: '1.3.0', contentVersion: state.contentVersion, modelVersion: state.modelVersion, catalogVersion: state.catalogVersion, state };
    const envelope = { ...unsigned, checksum: core.computeEnvelopeChecksum(unsigned) };
    const storage = storageFor(envelope);
    const original = storage.getItem(core.SAVE_STORAGE_KEY);
    const loaded = core.loadGameState(bundle, storage);
    assert.equal(loaded.status, 'ok', loaded.error?.message);
    assert.equal(loaded.state.schemaVersion, 4);
    assert.match(loaded.migrationNotice, /Phase 1.4/);
    assert.deepEqual(loaded.state.resources, source.resources);
    assert.deepEqual(loaded.state.crew, source.crew);
    assert.deepEqual(loaded.state.rover, source.rover);
    assert.deepEqual(loaded.state.events, source.events);
    assert.equal(loaded.state.campaign.status, source.campaign.status);
    assert.ok(loaded.state.history.summaries.every((summary) => summary.checkpoint === null));
    assert.equal(storage.getItem(`${core.SAVE_STORAGE_KEY}:pre-v4`), original);
    assert.equal(core.loadGameState(bundle, storage).migrationNotice, null);
    if (source.campaign.status === 'active') assert.equal(core.dispatchDomainCommand(loaded.state, core.baselinePolicy.nextCommand(loaded.state, bundle, 0), bundle).ok, true);
    else assert.equal(loaded.state.campaign.outcome.reasonCode, 'legacy-outcome');
  }
});

test('Corrupted/unsupported saves remain intact and terminal commands cannot mutate state', () => {
  const envelope = core.buildSaveEnvelope(base);
  const corrupted = { ...envelope, checksum: 'invalid' };
  const storage = storageFor(corrupted);
  assert.equal(core.loadGameState(bundle, storage).status, 'error');
  assert.equal(storage.getItem(core.SAVE_STORAGE_KEY), JSON.stringify(corrupted));
  const run = core.runCampaign(bundle, { seed: 205099 }, core.baselinePolicy);
  for (const command of [{ type: 'phase/advance' }, { type: 'sol/end' }, { type: 'debrief/dismiss' }]) {
    const result = core.dispatchDomainCommand(run.state, command, bundle);
    assert.equal(result.ok, false);
    assert.deepEqual(result.state, run.state);
  }
  assert.equal(core.dispatchDomainCommand(run.state, { type: 'game/start', seed: 7 }, bundle).ok, true);
});

test('Full campaigns prove both actual Sol 7 branches, three/two expeditions, and distinct natural defeats', () => {
  for (const [branch, completed, rank] of [['A', 3, 'S'], ['B', 2, 'A']]) {
    const run = core.runCampaign(bundle, { seed: 205099, difficulty: 'cadet' }, core.createPolicy('balanced', branch));
    assert.equal(run.status, 'completed', run.error);
    assert.equal(run.metrics.outcome, 'victory');
    assert.equal(run.metrics.completedExpeditions, completed);
    assert.equal(run.metrics.rank, rank);
    assert.equal(run.metrics.actualBranch, branch === 'A' ? 'save-rover-link' : 'prioritize-wrs');
    assert.ok(run.state.history.summaries.filter((summary) => summary.isLunarNight).every((summary) => summary.checkpoint.solarGeneratedKWh === 0));
    assert.equal(run.state.history.summaries.filter((summary) => summary.isLunarNight).length, 14);
    assert.deepEqual(core.replayCampaign(run.trace, bundle), run.state);
  }
  const reasons = [];
  for (const reason of ['oxygen', 'water']) {
    const run = core.runCampaign(bundle, { seed: 205099, difficulty: 'cadet' }, core.createDefeatPolicy(reason));
    assert.equal(run.status, 'completed', run.error);
    assert.equal(run.metrics.outcome, 'defeat');
    assert.equal(run.metrics.reasonCode, `${reason}-depleted`);
    assert.deepEqual(core.replayCampaign(run.trace, bundle), run.state);
    reasons.push(run.metrics.reasonCode);
  }
  assert.equal(new Set(reasons).size, 2);
});

test('Upgrade cancellation preserves level-dependent pricing; craft cancellation cannot mint resources', () => {
  let state = { ...base, clock: { ...base.clock, phase: 'engineering' }, events: { ...base.events, activeEvent: null, activeEventId: null } };
  const dispatch = (command) => {
    const result = core.dispatchDomainCommand(state, command, bundle);
    if (result.ok) state = result.state;
    return result;
  };
  const before = state.resources.partsKg;
  assert.equal(dispatch({ type: 'crew/assign', crewId: 'eng', task: 'upgrade-system', targetSystemId: 'solar' }).ok, true);
  assert.equal(dispatch({ type: 'crew/assign', crewId: 'cmd', task: 'upgrade-system', targetSystemId: 'solar' }).ok, true);
  const rejected = dispatch({ type: 'crew/unassign', crewId: 'eng' });
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.state, state);
  assert.equal(dispatch({ type: 'crew/unassign', crewId: 'cmd' }).ok, true);
  assert.equal(dispatch({ type: 'crew/unassign', crewId: 'eng' }).ok, true);
  assert.equal(state.resources.partsKg, before);
  const resources = structuredClone(state.resources);
  assert.equal(dispatch({ type: 'fabricator/queue', itemId: 'mre_pack', action: 'craft' }).ok, true);
  assert.equal(dispatch({ type: 'fabricator/cancel' }).ok, true);
  assert.deepEqual(state.resources, resources);
  assert.equal(dispatch({ type: 'fabricator/cancel' }).ok, false);
  assert.equal(dispatch({ type: 'fabricator/queue', itemId: 'mre_pack', action: 'craft' }).ok, false);
});

test('Persistent recorder reloads exact command history, labels partial sessions and resets campaign identity', () => {
  let trace = core.startRecording(base, bundle);
  const command = core.baselinePolicy.nextCommand(base, bundle, 0);
  const result = core.dispatchDomainCommand(base, command, bundle);
  trace = core.recordCommand(trace, command, result, bundle);
  const storage = storageFor({});
  core.saveRecording(trace, storage);
  assert.deepEqual(core.loadRecording(result.state, bundle, storage), trace);
  assert.deepEqual(core.replayCampaign(trace, bundle), result.state);
  const partial = core.loadRecording(result.state, bundle, null);
  assert.equal(partial.coverage, 'from-snapshot');
  const restarted = core.dispatchDomainCommand(result.state, { type: 'game/start', seed: 9 }, bundle);
  const newTrace = core.recordCommand(trace, { type: 'game/start', seed: 9 }, restarted, bundle);
  assert.equal(newTrace.steps.length, 0);
  assert.equal(newTrace.coverage, 'full-campaign');
  assert.equal(newTrace.initialState.campaign.seed, 9);
  assert.notEqual(newTrace.initialState.campaign.runId, trace.initialState.campaign.runId);
});

test('Greywater/consumable capacity and integer invariants reject corrupted resource snapshots', () => {
  for (const [key, value] of [['wasteWaterL', 81], ['mrePacks', 61], ['medkits', 7], ['mrePacks', .5], ['medkits', NaN]]) {
    const state = { ...base, resources: { ...base.resources, [key]: value } };
    assert.equal(core.validateStateInvariants(state, bundle)?.code, 'E_STATE_INVALID', key);
  }
});
