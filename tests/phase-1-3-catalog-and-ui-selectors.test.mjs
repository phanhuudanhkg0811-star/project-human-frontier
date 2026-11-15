import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import esbuild from 'esbuild';
import { loadCatalogInputs, validateEventCatalog } from '../scripts/validate-events-catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputs = await loadCatalogInputs(root);
const compiled = await esbuild.build({
  stdin: { contents: `
    export * from './src/schemas/contracts.ts';
    export * from './src/domain/eventSelectors.ts';
    export * from './src/domain/selectors.ts';
    export * from './src/domain/endSolResolver.ts';
    export * from './src/config/releaseMeta.ts';
    export * from './src/components/EventPriorityBanner.tsx';
    export * from './src/components/eventPresentation.ts';
    export * from './src/components/DynamicSTEMBrief.tsx';
    export * from './src/components/SystemControls.tsx';
    export * from './src/components/modals/StarlogModal.tsx';
    export * from './src/components/modals/EndOfDayModal.tsx';
    export * from './src/components/modals/NightCutsceneModal.tsx';
    export * from './src/components/modals/AboutCreditsModal.tsx';
    export * from './src/store/gameStore.ts';
    export { createElement } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';
  `, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', target: 'es2022',
  plugins: [{
    name: 'isolated-ui-store',
    setup(build) {
      build.onResolve({ filter: /store\/gameStore\.ts$/ }, () => ({ path: 'ui-fixture-store', namespace: 'test-fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'test-fixture' }, () => ({
        contents: 'let snapshot; export function useGameStore() { return snapshot; } export function setGameStoreSnapshot(value) { snapshot = value; }',
        loader: 'js',
      }));
    },
  }],
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  createRequire(import.meta.url), loaded, loaded.exports,
);
const core = loaded.exports;
const bundle = core.loadContentBundle();
const initialState = () => core.createInitialGameState(bundle, { runId: 'ui-qa-fixture', seed: 7070 });
const eventFixture = (overrides = {}) => ({ ...structuredClone(bundle.events[0]), id: 'qa-event', ...overrides });
const choiceFixture = (overrides = {}) => ({ id: 'qa-choice', label: 'Lựa chọn kiểm tra', effects: [], log: 'Đã chọn.', ...overrides });
const validate = (events, overrides = {}) => validateEventCatalog({ ...inputs, events, ...overrides });
const withEvent = (event, state = initialState()) => ({
  state: { ...state, events: { ...state.events, activeEventId: event.id,
    activeEvent: { eventId: event.id, triggeredAtSol: state.clock.sol, deadlineSol: state.clock.sol, context: {} } } },
  content: { ...bundle, events: [event] },
});
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
const render = (component, props) => core.renderToStaticMarkup(core.createElement(component, props));
function renderWithState(component, fixture) {
  core.setGameStoreSnapshot({ gameState: fixture.state, bundle: fixture.content, dispatch: async () => { throw new Error('SSR must not dispatch'); }, resetCampaign() {} });
  try {
    return render(component, { onClose() {} });
  } finally {
    core.setGameStoreSnapshot(null);
  }
}

test('Phase 1.4 system UI quotes the next queued upgrade level, including engineer discount', () => {
  const state = initialState();
  const queued = { ...state, clock: { ...state.clock, phase: 'engineering' }, crew: { ...state.crew,
    cmd: { ...state.crew.cmd, assignedTask: { type: 'upgrade-system', targetSystemId: 'solar', partsSpent: 4 } } } };
  const html = renderWithState(core.SystemControls, { state: queued, content: bundle });
  assert.match(html, /Upgrade \(7P\)/);
});

test('Catalog QA: bundled schema, references and actual event art files pass', () => {
  const report = validate(inputs.events);
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.equal(report.coverage.count, inputs.events.length);
  assert.equal(report.coverage.bySol.length, 32);
  assert.match(report.coverage.note, /does not prove reachability/);
});

test('Catalog release gate accepts 18–24 events and rejects incomplete or oversized catalogs', () => {
  for (const count of [4, 18, 24, 25]) {
    const events = Array.from({ length: count }, (_, i) => eventFixture({ id: `qa-${i}` }));
    const report = validate(events, { release: true });
    assert.equal(report.ok, count >= 18 && count <= 24);
    if (!report.ok) assert.ok(report.errors.some((error) => error.field === 'length'));
  }
});

for (const [label, makeEvent] of [
  ['zero weight', () => eventFixture({ weight: 0 })],
  ['empty trigger', () => eventFixture({ when: [{}] })],
  ['sol combined with solMin', () => eventFixture({ when: [{ sol: 7, solMin: 7 }] })],
  ['unknown effect', () => eventFixture({ choices: [choiceFixture({ effects: [{ kind: 'invent-resource' }] })] })],
  ['unknown art ID', () => eventFixture({ art: 'unregistered-art' })],
]) {
  test(`Catalog schema rejects ${label}`, () => {
    const result = validate([makeEvent()]);
    assert.equal(result.ok, false);
    assert.ok(result.errors.every((error) => error.field && error.message));
  });
}

test('Catalog cross-field validation catches reversed Sol and resource bounds', () => {
  const result = validate([eventFixture({ when: [{ solMin: 9, solMax: 2 }, { minResource: { waterL: 20 }, maxResource: { waterL: 5 } }] })]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.message.includes('solMin')));
  assert.ok(result.errors.some((error) => error.message.includes('waterL')));
});

test('Catalog rejects duplicate event and per-event choice IDs, but permits choice IDs in different events', () => {
  assert.equal(validate([eventFixture(), eventFixture()]).ok, false);
  assert.equal(validate([eventFixture({ choices: [choiceFixture(), choiceFixture()] })]).ok, false);
  assert.equal(validate([eventFixture({ id: 'one' }), eventFixture({ id: 'two' })]).ok, true);
});

test('Catalog Science Brief references reject missing IDs and accept null', () => {
  assert.equal(validate([eventFixture({ scienceBriefId: null })]).ok, true);
  const result = validate([eventFixture({ scienceBriefId: 'missing-brief' })]);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].field, 'scienceBriefId');
  assert.equal(validate([eventFixture()], { briefs: [...inputs.briefs, inputs.briefs[0]] }).ok, false);
});

test('Catalog verifies manifest mappings and real files separately from schema art enum', () => {
  const event = eventFixture();
  assert.equal(validate([event], { artManifest: {} }).ok, false);
  const report = validate([event], { assetExists: () => false });
  assert.equal(report.ok, false);
  assert.match(report.errors[0].message, /Image file does not exist/);
  assert.equal(inputs.assetExists('/assets/../../package.json'), false);
});

test('Catalog validates follow-ups in both choice and expiry effects', () => {
  const next = eventFixture({ id: 'next' });
  const effect = { kind: 'schedule-follow-up', eventId: 'next', delaySols: 1 };
  const first = eventFixture({ choices: [choiceFixture({ effects: [effect] })], onExpireEffects: [effect] });
  assert.equal(validate([first, next]).ok, true);
  const result = validate([first]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.field.includes('choices[0].effects')));
  assert.ok(result.errors.some((error) => error.field.includes('onExpireEffects')));
});

test('Catalog resolves choiceMade, eventSeen and eventNotSeen references', () => {
  const source = eventFixture({ id: 'source' });
  const follower = eventFixture({ when: [{ choiceMade: { eventId: 'source', choiceId: source.choices[0].id } }, { eventSeen: 'source' }, { eventNotSeen: 'source' }] });
  assert.equal(validate([source, follower]).ok, true);
  follower.when[0].choiceMade.choiceId = 'missing-choice';
  assert.equal(validate([source, follower]).ok, false);
  assert.equal(validate([eventFixture({ when: [{ eventSeen: 'missing' }, { eventNotSeen: 'missing' }] })]).errors.length, 2);
});

test('Coverage respects AND within a condition, OR across conditions, and Lunar Night bounds', () => {
  const event = eventFixture({ when: [{ solMin: 10, solMax: 16, isLunarNight: true }, { sol: 29 }] });
  const { coverage } = validate([event]);
  assert.deepEqual(coverage.bySol.filter((row) => row.eventIds.length).map((row) => row.sol), [15, 16, 29]);
});

test('Validator CLI returns JSON and rejects unknown options without changing catalogs', () => {
  const cli = path.join(root, 'scripts/validate-events-catalog.mjs');
  const run = spawnSync(process.execPath, [cli, '--json'], { encoding: 'utf8', cwd: root });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).coverage.count, inputs.events.length);
  assert.equal(spawnSync(process.execPath, [cli, '--unknown'], { encoding: 'utf8', cwd: root }).status, 2);
});

test('ActiveEvent selector handles no active event, missing definitions, legacy fallback and saved deadline', () => {
  const state = initialState();
  assert.equal(core.selectActiveEventView({ ...state, events: { ...state.events, activeEvent: null, activeEventId: null } }, bundle), null);
  assert.equal(core.selectActiveEventView(state, { ...bundle, events: [] }), null);
  const legacy = { ...state, events: { ...state.events, activeEvent: null } };
  const fallback = core.selectActiveEventView(legacy, bundle);
  assert.equal(fallback.deadlineSol, state.clock.sol + (fallback.event.deadlineOffsetSols ?? 0));
  const saved = { ...state, events: { ...state.events, activeEvent: { ...state.events.activeEvent, deadlineSol: 4 } } };
  assert.equal(core.selectActiveEventView(saved, bundle).deadlineSol, 4);
});

test('Active event metadata and inclusive deadline labels remain consistent', () => {
  const event = eventFixture({ mandatory: false, priority: 45 });
  const fixture = withEvent(event);
  const view = core.selectActiveEventView(fixture.state, fixture.content);
  assert.equal(view.mandatory, false);
  assert.equal(view.priority, 45);
  assert.equal(view.solsToDeadline, 0);
  assert.match(core.eventDeadlineText(view, 1), /Hạn hôm nay/);
  assert.match(core.eventDeadlineText(view, 2), /Đã quá hạn/);
  assert.match(core.eventDeadlineText({ ...view, deadlineSol: 3, solsToDeadline: 2 }, 1), /còn 2 Sol/);
});

test('Choice selector blocks missing/damaged equipment, missing flags, and unavailable crew', () => {
  const choice = choiceFixture({ requiresEquipment: 'dust_shield', requiresFlag: 'ready', requiresCrew: { crewId: 'geo', requireFit: true, requireFree: true } });
  const fixture = withEvent(eventFixture({ choices: [choice] }));
  const geo = fixture.state.crew.geo;
  fixture.state.crew = { ...fixture.state.crew, geo: { ...geo, condition: 'injured', assignedTask: { type: 'rest' } } };
  const preview = core.selectEventChoicePreviews(fixture.state, 'qa-event', fixture.content)[0];
  assert.equal(preview.allowed, false);
  assert.ok(preview.blockedReasons.length >= 4);
  fixture.state.crew.geo = { ...geo, condition: 'evacuated', assignedTask: null };
  assert.ok(core.selectEventChoicePreviews(fixture.state, 'qa-event', fixture.content)[0].blockedReasons.some((reason) => reason.includes('rời trạm')));
  fixture.state.crew.geo = geo;
  fixture.state.events = { ...fixture.state.events, flags: { ready: true } };
  fixture.state.equipment = { ...fixture.state.equipment, dust_shield: { ...fixture.state.equipment.dust_shield, owned: true, state: 'damaged', durability: 0 } };
  assert.equal(core.selectEventChoicePreviews(fixture.state, 'qa-event', fixture.content)[0].allowed, false);
  fixture.state.equipment.dust_shield = { ...fixture.state.equipment.dust_shield, state: 'good', durability: 100 };
  assert.equal(core.selectEventChoicePreviews(fixture.state, 'qa-event', fixture.content)[0].allowed, true);
});

test('Choice selector sums resource/science deltas and handles exact resource boundaries without mutation', () => {
  const fixture = withEvent(eventFixture({ choices: [choiceFixture({ effects: [
    { kind: 'resource', resource: 'partsKg', delta: -2 }, { kind: 'resource', resource: 'partsKg', delta: -3 },
    { kind: 'science', delta: 2 }, { kind: 'science', delta: 3 },
    { kind: 'crew', target: 'all', healthDelta: -5 },
    { kind: 'system-integrity', systemId: 'airlock', delta: -0.2 },
    { kind: 'equipment-wear', equipmentId: 'core_drill', wear: 50 },
    { kind: 'plan-override', wrsEnabled: false },
  ] })] }));
  fixture.state.resources = { ...fixture.state.resources, partsKg: 5 };
  const before = JSON.stringify(fixture);
  deepFreeze(fixture);
  const preview = core.selectEventChoicePreviews(fixture.state, 'qa-event', fixture.content)[0];
  assert.equal(preview.allowed, true);
  assert.equal(preview.resourceDeltas.partsKg, -5);
  assert.equal(preview.scienceDelta, 5);
  assert.ok(preview.effectsSummary.some((text) => text.includes('airlock')));
  assert.ok(preview.effectsSummary.some((text) => text.includes('core_drill')));
  assert.equal(JSON.stringify(fixture), before);
  const poorState = { ...fixture.state, resources: { ...fixture.state.resources, partsKg: 4 } };
  assert.equal(core.selectEventChoicePreviews(poorState, 'qa-event', fixture.content)[0].allowed, false);
  assert.deepEqual(core.selectEventChoicePreviews(poorState, 'unknown', fixture.content), []);
});

test('Dynamic debrief selects context brief, preserves metrics, and handles empty/fallback states', () => {
  const state = initialState();
  assert.deepEqual(core.selectDynamicDebrief(state, bundle), { summary: null, context: null, scienceBrief: null });
  const summary = core.resolveSol(state, bundle, 'preview').summary;
  assert.equal(summary.debriefContext.evidenceType, 'simulated');
  const context = { briefId: bundle.briefs[1].id, reasonTag: 'water-tradeoff', sourceEventId: bundle.events[0].id,
    sourceChoiceId: bundle.events[0].choices[0].id, evidenceType: 'simulated', metricHighlights: [{ key: 'waterL', label: 'Nước sạch', delta: 9, unit: 'L' }] };
  const resolvedState = { ...state, debrief: { pendingDismiss: true, lastSummary: { ...summary, debriefContext: context } } };
  const view = core.selectDynamicDebrief(deepFreeze(resolvedState), bundle);
  assert.equal(view.scienceBrief.id, context.briefId);
  assert.equal(view.context.metricHighlights[0].delta, 9);
  const fallbackState = { ...state, debrief: { pendingDismiss: false, lastSummary: { ...summary, briefId: 'missing', debriefContext: null } } };
  assert.equal(core.selectDynamicDebrief(fallbackState, bundle).scienceBrief.id, bundle.briefs[0].id);
  assert.equal(core.selectDynamicDebrief(fallbackState, { ...bundle, briefs: [] }).scienceBrief, null);
  const html = render(core.DynamicSTEMBrief, { view, bundle });
  assert.match(html, /Completed Sol 1 Report/);
  assert.match(html, /Simulation Output/);
  assert.match(html, /Observed Data/);
  assert.match(html, /Clean Water/);
  assert.doesNotMatch(html, /Nước sạch/);
  assert.match(html, /\+9/);
  assert.match(html, new RegExp(`href="${view.scienceBrief.sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.ok(html.includes(bundle.events[0].choices[0].labelEn ?? bundle.events[0].choices[0].label));
  assert.match(render(core.DynamicSTEMBrief, { view: { summary: null }, bundle }), /No End-Sol report yet/);
});

test('Banner renders category, priority, inclusive deadline and a keyboard-operable button', () => {
  assert.equal(render(core.EventPriorityBanner, { view: null, currentSol: 1, onOpen() {} }), '');
  const fixture = withEvent(eventFixture({ category: 'crisis', priority: 100 }));
  const view = core.selectActiveEventView(fixture.state, fixture.content);
  const html = render(core.EventPriorityBanner, { view, currentSol: 1, onOpen() {} });
  assert.match(html, /hail-event-priority--crisis/);
  assert.match(html, /Priority 100/);
  assert.match(html, /Mandatory/);
  assert.match(html, /Due today/);
  assert.match(html, /<button type="button"/);
});

test('Starlog uses event.art and permits optional choices in engineering while showing blocked reasons', () => {
  const event = eventFixture({ art: 'solar-particle', mandatory: false, choices: [choiceFixture(), choiceFixture({ id: 'blocked', requiresFlag: 'missing' })] });
  const fixture = withEvent(event);
  fixture.state.clock = { ...fixture.state.clock, phase: 'engineering' };
  const html = renderWithState(core.StarlogModal, fixture);
  assert.match(html, /PH_EVT_SOLAR_PARTICLE_BASE_V01.webp/);
  assert.match(html, /Optional/);
  assert.match(html, /Requires condition: missing/);
  assert.match(html, /<button type="button" class="hail-btn hail-choice-card">Select: Lựa chọn kiểm tra<\/button>/);
  assert.match(html, /disabled="" aria-describedby="event-choice-blocked-reasons"/);
  fixture.state.clock = { ...fixture.state.clock, phase: 'debrief' };
  const closedHtml = renderWithState(core.StarlogModal, fixture);
  assert.match(closedHtml, /no longer accepting choices/);
});

test('EndOfDay distinguishes completed reports from the current resource forecast', () => {
  const state = initialState();
  const summary = core.resolveSol(state, bundle, 'preview').summary;
  const fixture = { state: { ...state, clock: { ...state.clock, sol: 2, phase: 'rationing' },
    dailyPlan: { ...state.dailyPlan, sol: 2 }, debrief: { pendingDismiss: false, lastSummary: summary } }, content: bundle };
  const html = renderWithState(core.EndOfDayModal, fixture);
  assert.match(html, /End Sol 2/);
  assert.match(html, /Completed Sol 1 Report/);
  assert.match(html, /End-Sol 2 Forecast/);
  assert.match(html, /MRE\d+/);
});

test('About renders NASA attribution URLs as safe external links', () => {
  const html = render(core.AboutCreditsModal, { onClose() {} });
  for (const item of core.NASA_DATA_SOURCES) {
    assert.match(html, new RegExp(`href="${item.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  }
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test('Post End-Sol screen renders Dynamic STEM Brief from context rather than the old summary brief', () => {
  const state = initialState();
  const summary = core.resolveSol(state, bundle, 'preview').summary;
  const brief = bundle.briefs.find((item) => item.id !== summary.briefId);
  const fixture = { state: { ...state, clock: { ...state.clock, phase: 'debrief' }, debrief: {
    pendingDismiss: true, lastSummary: { ...summary, debriefContext: {
      briefId: brief.id, reasonTag: 'test', sourceEventId: bundle.events[0].id,
      sourceChoiceId: bundle.events[0].choices[0].id, evidenceType: 'simulated',
      metricHighlights: [{ key: 'waterL', label: 'Nước sạch', delta: 9, unit: 'L' }],
    } },
  } }, content: bundle };
  const html = renderWithState(core.NightCutsceneModal, fixture);
  assert.ok(html.includes(brief.titleEn ?? brief.title));
  assert.match(html, /Simulation Output/);
  assert.match(html, /Choice taken:/);
  assert.match(html, /Clean Water/);
  assert.doesNotMatch(html, /Nước sạch/);
  assert.match(html, /\+9 L/);
});

// These executable contract checks document gaps owned by Core. Remove TODO once branch 1 merges.
const corePending = !fs.existsSync(path.join(root, 'src/domain/eventEngine.ts'));
test('Core integration: optional event permits leaving briefing', { todo: corePending && 'Awaiting branch 1 eventEngine and phase guards.' }, () => {
  const fixture = withEvent(eventFixture({ mandatory: false }));
  assert.equal(core.selectCanAdvancePhase(fixture.state, fixture.content).allowed, true);
});

test('Core integration: preview explains rover, assignment, follow-up and extra-power effects', { todo: corePending && 'Awaiting branch 1 eventSelectors completion.' }, () => {
  const effects = [
    { kind: 'rover-action', action: 'fail-expedition', expeditionId: 'regolith-field' },
    { kind: 'assign-task', crewId: 'geo', task: 'emergency-response' },
    { kind: 'schedule-follow-up', eventId: 'later', delaySols: 1 },
    { kind: 'plan-override', extraPowerCostKWh: 2 },
  ];
  for (const effect of effects) {
    const fixture = withEvent(eventFixture({ choices: [choiceFixture({ effects: [effect] })] }));
    const preview = core.selectEventChoicePreviews(fixture.state, 'qa-event', fixture.content)[0];
    const hasStructuredDelta =
      Object.keys(preview.resourceDeltas).length > 0 || preview.scienceDelta !== 0;
    assert.ok(
      preview.effectsSummary.length > 0 || hasStructuredDelta,
      `Missing preview for ${effect.kind}`
    );
  }
  const powerFixture = withEvent(
    eventFixture({ choices: [choiceFixture({ effects: [{ kind: 'plan-override', extraPowerCostKWh: 2 }] })] })
  );
  const powerPreview = core.selectEventChoicePreviews(powerFixture.state, 'qa-event', powerFixture.content)[0];
  assert.equal(powerPreview.resourceDeltas.batteryKWh, -2);
  assert.equal(powerPreview.effectsSummary.length, 0);
});
