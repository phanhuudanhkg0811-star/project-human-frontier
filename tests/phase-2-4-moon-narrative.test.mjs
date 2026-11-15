import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { simulationRoot } from '../scripts/load-simulation.mjs';

async function loadPhase24Bundle() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/onboarding/narrativePersistence.ts';
        export * from './src/onboarding/selectors.ts';
        export * from './src/domain/narrativeSelectors.ts';
        export * from './src/domain/campaignSelectors.ts';
        export * from './src/domain/campaignEvaluator.ts';
        export * from './src/domain/orchestrator.ts';
        export * from './src/domain/canonicalJson.ts';
        export * from './src/domain/prng.ts';
        export * from './src/simulation/campaignRunner.ts';
        export * from './src/simulation/policies.ts';
        export * from './src/store/gameStore.ts';
        export * from './src/store/uiStore.ts';
        export * from './src/i18n/dictionaries.ts';
        export * from './src/i18n/useI18n.ts';
        export * from './src/schemas/contracts.ts';
      `,
      loader: 'ts',
      resolveDir: simulationRoot,
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  );
}

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const p24 = await loadPhase24Bundle();
const bundle = p24.loadContentBundle();

test('Phase 2.4 milestone triggers read directly from campaign config and suppress during tours, sandbox, or past saves', () => {
  const base = p24.createInitialGameState(bundle, { seed: 205024, difficulty: 'standard' });
  const narrative = p24.createDefaultNarrativeState();

  const defaultGuard = {
    tutorialSandboxActive: false,
    hasSaveError: false,
    activeTour: null,
    activeModal: null,
    cockpitTourStatus: 'completed',
    sol1GuideStatus: 'completed',
  };

  // Sol 1 arrival shows when no tour/sandbox is active and cockpit tour is not unseen/active
  const sol1 = p24.selectPendingCockpitMilestone(base, bundle, narrative, defaultGuard);
  assert.equal(sol1?.id, 'moon-sol1-arrival');
  assert.equal(sol1?.provenance, 'observed');

  // Suppressed while tour is active, cockpit tour is unseen, or tutorial sandbox is active
  assert.equal(
    p24.selectPendingCockpitMilestone(base, bundle, narrative, { ...defaultGuard, activeTour: 'cockpit' }),
    null
  );
  assert.equal(
    p24.selectPendingCockpitMilestone(base, bundle, narrative, { ...defaultGuard, cockpitTourStatus: 'unseen' }),
    null
  );
  assert.equal(
    p24.selectPendingCockpitMilestone(base, bundle, narrative, { ...defaultGuard, tutorialSandboxActive: true }),
    null
  );

  // Custom campaign config drives Sol 7 / Sol 15 / Sol 29 triggers dynamically
  const customBundle = structuredClone(bundle);
  customBundle.campaign.milestones.goldenCrisisSol = 6;
  customBundle.campaign.milestones.lunarNight.startSol = 16;
  customBundle.campaign.milestones.lunarNight.endSol = 27;
  customBundle.campaign.milestones.lunarDawn.startSol = 28;

  const atSol = (sol) => ({ ...base, clock: { ...base.clock, sol, phase: 'briefing' } });

  assert.equal(
    p24.selectPendingCockpitMilestone(atSol(7), customBundle, narrative, defaultGuard),
    null
  );
  assert.equal(
    p24.selectPendingCockpitMilestone(atSol(6), customBundle, narrative, defaultGuard)?.id,
    'moon-sol7-golden-crisis'
  );
  assert.equal(
    p24.selectPendingCockpitMilestone(atSol(16), customBundle, narrative, defaultGuard)?.id,
    'moon-sol15-lunar-sunset'
  );
  assert.equal(
    p24.selectPendingCockpitMilestone(atSol(28), customBundle, narrative, defaultGuard)?.id,
    'moon-sol29-lunar-sunrise'
  );

  // Loading an old save at Sol 18 never backfills Sol 1 / Sol 7 / Sol 15 milestones
  assert.equal(
    p24.selectPendingCockpitMilestone(atSol(18), bundle, narrative, defaultGuard),
    null
  );
});

test('Phase 2.4 narrative persistence triggers once across reload, fails closed on corrupt data, and resets on new run without changing GameState hash', async () => {
  const mem = createMemoryStorage();
  assert.deepEqual(p24.readNarrativeState(mem), p24.createDefaultNarrativeState());

  // Corrupt JSON & unknown schema version fail closed
  mem.setItem(p24.NARRATIVE_STORAGE_KEY, '{corrupt');
  assert.equal(p24.decodeNarrativeState(mem.getItem(p24.NARRATIVE_STORAGE_KEY)).resetToDefault, true);
  assert.deepEqual(p24.readNarrativeState(mem), p24.createDefaultNarrativeState());

  mem.setItem(
    p24.NARRATIVE_STORAGE_KEY,
    JSON.stringify({ narrativeVersion: 99, runKey: 'abc', shownMilestoneIds: ['moon-sol1-arrival'] })
  );
  assert.equal(p24.decodeNarrativeState(mem.getItem(p24.NARRATIVE_STORAGE_KEY)).resetToDefault, true);

  // Mark Sol 7 milestone shown on uiStore -> survives decode/reload, resets on resetCampaignUi
  const ui = p24.useUiStore;
  ui.getState().resetNarrativeMilestones();

  const sol7State = {
    ...p24.createInitialGameState(bundle, { seed: 205077, difficulty: 'standard' }),
    clock: { sol: bundle.campaign.milestones.goldenCrisisSol, phase: 'briefing' },
  };
  const hashBefore = p24.sha256Hex(p24.canonicalStringify(sol7State));
  const guard = {
    tutorialSandboxActive: false,
    hasSaveError: false,
    activeTour: null,
    activeModal: null,
    cockpitTourStatus: 'completed',
    sol1GuideStatus: 'completed',
  };

  const pending = p24.selectPendingCockpitMilestone(sol7State, bundle, ui.getState().narrative, guard);
  assert.equal(pending?.id, 'moon-sol7-golden-crisis');

  // Dismissing / skipping milestone does not mutate GameState or skip events
  ui.getState().markMilestoneShown(pending.id, pending.runKey);
  assert.equal(p24.sha256Hex(p24.canonicalStringify(sol7State)), hashBefore);
  assert.equal(
    p24.selectPendingCockpitMilestone(sol7State, bundle, ui.getState().narrative, guard),
    null
  );

  // Persisted JSON decodes identically across simulated reload
  const encoded = JSON.stringify(ui.getState().narrative);
  const decoded = p24.decodeNarrativeState(encoded);
  assert.equal(decoded.resetToDefault, false);
  assert.equal(
    p24.selectPendingCockpitMilestone(sol7State, bundle, decoded.state, guard),
    null
  );

  // Replay same seed / game/start calls resetCampaignUi which clears shownMilestoneIds
  ui.getState().resetCampaignUi();
  const afterReset = p24.selectPendingCockpitMilestone(sol7State, bundle, ui.getState().narrative, guard);
  assert.equal(afterReset?.id, 'moon-sol7-golden-crisis');

  // Contextual hints are blocked while a milestone presentation is active
  assert.equal(
    p24.canTriggerContextualHints(
      sol7State,
      { activeModal: null, reducedMotion: false },
      ui.getState().onboarding,
      { milestoneActive: true }
    ),
    false
  );
});

test('Phase 2.4 Sol 7 dual-branch debrief detects save-rover-link vs prioritize-wrs accurately', () => {
  const runRover = p24.runCampaign(
    bundle,
    { seed: 205099, difficulty: 'cadet' },
    p24.createPolicy('balanced', 'A')
  );
  const roverBranch = p24.selectSol7DebriefBranch(runRover.state, bundle);
  assert.equal(roverBranch?.branch, 'saved-rover');
  assert.equal(roverBranch?.choiceId, 'save-rover-link');
  assert.equal(roverBranch?.goldenCrisisSol, bundle.campaign.milestones.goldenCrisisSol);
  assert.equal(roverBranch?.followUpSolMin, 9);

  const runWrs = p24.runCampaign(
    bundle,
    { seed: 205099, difficulty: 'cadet' },
    p24.createPolicy('balanced', 'B')
  );
  const wrsBranch = p24.selectSol7DebriefBranch(runWrs.state, bundle);
  assert.equal(wrsBranch?.branch, 'prioritized-wrs');
  assert.equal(wrsBranch?.choiceId, 'prioritize-wrs');
  assert.equal(wrsBranch?.followUpSolMin, 8);
});

test('Phase 2.4 Report Card insights reflect real metrics for Victory S/A/B and all Defeat causes with VI/EN parity', () => {
  const runS = p24.runCampaign(
    bundle,
    { seed: 205099, difficulty: 'cadet' },
    p24.createPolicy('balanced', 'A')
  );
  const insightsS = p24.selectCampaignInsights(runS.state, bundle);
  assert.equal(insightsS.status, 'victory');
  assert.equal(insightsS.rank, 'S');
  assert.equal(insightsS.provenance, 'simulated');
  assert.ok(insightsS.causes.length >= 2 && insightsS.causes.length <= 3);
  assert.ok(insightsS.recommendations.length >= 2 && insightsS.recommendations.length <= 3);
  assert.equal(insightsS.causes[0].code, 'report.cause.victoryS');

  const runA = p24.runCampaign(
    bundle,
    { seed: 205099, difficulty: 'cadet' },
    p24.createPolicy('balanced', 'B')
  );
  const insightsA = p24.selectCampaignInsights(runA.state, bundle);
  assert.equal(insightsA.status, 'victory');
  assert.equal(insightsA.rank, 'A');
  assert.equal(insightsA.causes[0].code, 'report.cause.victoryA');

  const base = p24.createInitialGameState(bundle, { seed: 205050, difficulty: 'standard' });
  const defeatStates = [
    {
      expectedCode: 'report.cause.defeatOxygen',
      state: {
        ...base,
        clock: { sol: 17, phase: 'terminal' },
        resources: { ...base.resources, oxygenKg: 0, oxygenZeroStreak: 1 },
        campaign: {
          ...base.campaign,
          status: 'defeat',
          outcome: p24.evaluateCampaign(
            { ...base, resources: { ...base.resources, oxygenKg: 0, oxygenZeroStreak: 1 } },
            bundle.campaign,
            17
          ),
        },
      },
    },
    {
      expectedCode: 'report.cause.defeatWater',
      state: {
        ...base,
        clock: { sol: 19, phase: 'terminal' },
        resources: { ...base.resources, waterL: 0, waterZeroStreak: 2 },
        campaign: {
          ...base.campaign,
          status: 'defeat',
          outcome: p24.evaluateCampaign(
            { ...base, resources: { ...base.resources, waterL: 0, waterZeroStreak: 2 } },
            bundle.campaign,
            19
          ),
        },
      },
    },
    {
      expectedCode: 'report.cause.defeatCrew',
      state: (() => {
        const collapsedCrew = Object.fromEntries(
          Object.entries(base.crew).map(([id, c], idx) => [
            id,
            { ...c, condition: idx === 0 ? 'fit' : 'evacuated' },
          ])
        );
        return {
          ...base,
          clock: { sol: 21, phase: 'terminal' },
          crew: collapsedCrew,
          campaign: {
            ...base.campaign,
            status: 'defeat',
            outcome: p24.evaluateCampaign({ ...base, crew: collapsedCrew }, bundle.campaign, 21),
          },
        };
      })(),
    },
  ];

  for (const scenario of defeatStates) {
    const ins = p24.selectCampaignInsights(scenario.state, bundle);
    assert.equal(ins.status, 'defeat');
    assert.equal(ins.rank, null);
    assert.equal(ins.causes[0].code, scenario.expectedCode);
    assert.ok(ins.causes.length >= 2 && ins.causes.length <= 3);
    assert.ok(ins.recommendations.length >= 2 && ins.recommendations.length <= 3);

    for (const item of [...ins.causes, ...ins.recommendations]) {
      for (const locale of ['vi', 'en']) {
        const text = p24.translate(locale, item.code, item.params);
        assert.notEqual(text, item.code, `Missing ${locale} key for ${item.code}`);
        assert.ok(!/\{[a-zA-Z0-9_]+\}/.test(text), `Unresolved token in ${locale} ${item.code}: ${text}`);
      }
    }
  }
});

test('Phase 2.4 UI components wire milestone modal, Sol 7 framing, Sol 12 readiness gap, and terminal Return to Title', () => {
  const viewportSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/HailGameViewport.tsx'),
    'utf8'
  );
  const starlogSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/modals/StarlogModal.tsx'),
    'utf8'
  );
  const nightSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/modals/NightCutsceneModal.tsx'),
    'utf8'
  );
  const reportSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/CampaignReportCard.tsx'),
    'utf8'
  );

  assert.match(viewportSrc, /MilestonePresentationModal/);
  assert.match(viewportSrc, /selectPendingCockpitMilestone/);
  assert.match(starlogSrc, /goldenCrisisBadge/);
  assert.match(nightSrc, /selectSol7DebriefBranch/);
  assert.match(nightSrc, /selectCampaignInsights/);
  assert.match(nightSrc, /onReturnTitle/);
  assert.match(nightSrc, /enterTitleScreen/);
  assert.match(reportSrc, /NightReadinessChecklist/);
  assert.match(reportSrc, /report\.causesTitle/);
  assert.match(reportSrc, /report\.recommendationsTitle/);
});
