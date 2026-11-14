import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { loadSimulation, simulationRoot } from '../scripts/load-simulation.mjs';

async function loadPhase21Bundle() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/onboarding/types.ts';
        export * from './src/onboarding/targets.ts';
        export * from './src/onboarding/persistence.ts';
        export * from './src/onboarding/selectors.ts';
        export * from './src/onboarding/tours/moonSol1Tour.ts';
        export * from './src/onboarding/driverAdapter.ts';
        export * from './src/store/uiStore.ts';
        export * from './src/i18n/dictionaries.ts';
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
    dump: () => Object.fromEntries(map.entries()),
  };
}

function readContractJson() {
  const mdPath = path.join(
    simulationRoot,
    'docs/plan/second-phase/PHASE_2_0_ONBOARDING_CONTRACT.md'
  );
  const md = fs.readFileSync(mdPath, 'utf8');
  const match = md.match(/```json\s*\n([\s\S]*?)\n```/);
  assert.ok(match, 'Contract JSON snapshot must exist');
  return JSON.parse(match[1]);
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const core = await loadSimulation();
const p21 = await loadPhase21Bundle();
const contract = readContractJson();

test('Phase 2.1 persistence decode/migration handles missing, legacy tutorial, Phase 1 save, corrupt JSON, and future versions', () => {
  const freshStorage = createMemoryStorage();
  const fresh = p21.readOnboardingState(freshStorage, false);
  assert.equal(fresh.migrated, false);
  assert.equal(fresh.resetToDefault, false);
  assert.equal(fresh.noticeCode, null);
  assert.equal(fresh.state.onboardingVersion, p21.ONBOARDING_SCHEMA_VERSION);
  assert.equal(fresh.state.tourVersion, p21.TOUR_VERSION);
  assert.equal(fresh.state.introStatus, 'unseen');
  assert.equal(fresh.state.sol1GuideStatus, 'unseen');

  const legacyTutorialStorage = createMemoryStorage();
  const migratedTutorial = p21.readOnboardingState(legacyTutorialStorage, true);
  assert.equal(migratedTutorial.migrated, true);
  assert.equal(migratedTutorial.state.introStatus, 'completed');
  assert.equal(migratedTutorial.state.sol1GuideStatus, 'completed');
  assert.equal(migratedTutorial.noticeCode, null);
  assert.ok(legacyTutorialStorage.getItem(p21.ONBOARDING_STORAGE_KEY));

  const legacySavePayload = '{"schemaVersion":4,"saved":true}';
  const legacySaveStorage = createMemoryStorage({
    [p21.PHASE1_SAVE_STORAGE_KEY]: legacySavePayload,
  });
  const migratedSave = p21.readOnboardingState(legacySaveStorage, false);
  assert.equal(migratedSave.migrated, true);
  assert.equal(migratedSave.state.introStatus, 'completed');
  assert.equal(migratedSave.state.sol1GuideStatus, 'unseen');
  assert.equal(legacySaveStorage.getItem(p21.PHASE1_SAVE_STORAGE_KEY), legacySavePayload);

  const corruptStorage = createMemoryStorage({
    [p21.ONBOARDING_STORAGE_KEY]: '{not-valid-json',
    [p21.PHASE1_SAVE_STORAGE_KEY]: legacySavePayload,
  });
  const corrupt = p21.readOnboardingState(corruptStorage, false);
  assert.equal(corrupt.resetToDefault, true);
  assert.equal(corrupt.noticeCode, 'E_ONBOARDING_CORRUPT');
  assert.equal(corrupt.state.introStatus, 'unseen');
  assert.equal(corruptStorage.getItem(p21.PHASE1_SAVE_STORAGE_KEY), legacySavePayload);

  const futureVersion = p21.decodeOnboardingState(
    JSON.stringify({
      ...p21.createDefaultOnboardingState(),
      onboardingVersion: 99,
    })
  );
  assert.equal(futureVersion.resetToDefault, true);
  assert.equal(futureVersion.noticeCode, 'E_ONBOARDING_VERSION');

  const unknownTour = p21.decodeOnboardingState(
    JSON.stringify({
      ...p21.createDefaultOnboardingState(),
      tourVersion: 'moon-sol1-v99',
    })
  );
  assert.equal(unknownTour.resetToDefault, true);
  assert.equal(unknownTour.noticeCode, 'E_ONBOARDING_VERSION');

  const unknownStep = p21.decodeOnboardingState(
    JSON.stringify({
      ...p21.createDefaultOnboardingState(),
      activeTour: 'sol1',
      activeStepId: 'removed-legacy-step',
      sol1GuideStatus: 'active',
    })
  );
  assert.equal(unknownStep.resetToDefault, false);
  assert.equal(unknownStep.state.activeStepId, 'sol1-open-briefing');
});

test('Phase 2.1 uiStore onboarding actions are idempotent and resetCampaignUi preserves skip/completed preferences', () => {
  p21.useUiStore.getState().resetOnboarding();
  assert.equal(p21.useUiStore.getState().onboarding.sol1GuideStatus, 'unseen');

  p21.useUiStore.getState().setIntroStatus('completed');
  p21.useUiStore.getState().startTour('sol1', 'sol1-weather-status');
  assert.equal(p21.useUiStore.getState().onboarding.activeTour, 'sol1');
  assert.equal(p21.useUiStore.getState().onboarding.activeStepId, 'sol1-weather-status');
  assert.equal(p21.useUiStore.getState().onboarding.sol1GuideStatus, 'active');

  p21.useUiStore.getState().setActiveStepId('sol1-crew-assignment');
  assert.equal(p21.useUiStore.getState().onboarding.activeStepId, 'sol1-crew-assignment');

  // Interrupting active tour on campaign reset clears activeTour/activeStepId.
  p21.useUiStore.getState().resetCampaignUi();
  assert.equal(p21.useUiStore.getState().onboarding.activeTour, null);
  assert.equal(p21.useUiStore.getState().onboarding.activeStepId, null);
  assert.equal(p21.useUiStore.getState().onboarding.introStatus, 'completed');

  // Skipping/completing must survive resetCampaignUi() (new campaign / game/start).
  p21.useUiStore.getState().startTour('sol1');
  p21.useUiStore.getState().skipTour();
  p21.useUiStore.getState().skipTour();
  assert.equal(p21.useUiStore.getState().onboarding.sol1GuideStatus, 'skipped');
  p21.useUiStore.getState().resetCampaignUi();
  assert.equal(p21.useUiStore.getState().onboarding.sol1GuideStatus, 'skipped');

  p21.useUiStore.getState().replayOnboarding();
  assert.equal(p21.useUiStore.getState().onboarding.activeTour, 'sol1');
  assert.equal(p21.useUiStore.getState().onboarding.activeStepId, 'sol1-open-briefing');
  assert.equal(p21.useUiStore.getState().onboarding.sol1GuideStatus, 'active');

  p21.useUiStore.getState().completeTour();
  p21.useUiStore.getState().completeTour();
  assert.equal(p21.useUiStore.getState().onboarding.sol1GuideStatus, 'completed');
  assert.equal(p21.useUiStore.getState().tutorialCompleted, true);
  p21.useUiStore.getState().resetCampaignUi();
  assert.equal(p21.useUiStore.getState().onboarding.sol1GuideStatus, 'completed');

  p21.useUiStore.getState().dismissHint('hint-sol15-load-shedding');
  p21.useUiStore.getState().dismissHint('hint-sol15-load-shedding');
  assert.deepEqual(p21.useUiStore.getState().onboarding.dismissedHintIds, [
    'hint-sol15-load-shedding',
  ]);
  p21.useUiStore.getState().setContextualHintsEnabled(false);
  p21.useUiStore.getState().resetCampaignUi();
  assert.equal(p21.useUiStore.getState().onboarding.contextualHintsEnabled, false);
  assert.deepEqual(p21.useUiStore.getState().onboarding.dismissedHintIds, [
    'hint-sol15-load-shedding',
  ]);

  p21.useUiStore.getState().resetOnboarding();
});

test('Phase 2.1 targets, moonSol1Tour steps, and i18n VI/EN copies match Phase 2.0 contract snapshot', () => {
  assert.deepEqual(p21.ALL_TOUR_TARGET_IDS, contract.dataTourTargets);
  assert.equal(p21.MOON_SOL1_TOUR_STEPS.length, contract.guidedSol1Steps.length);

  for (let i = 0; i < contract.guidedSol1Steps.length; i += 1) {
    const expected = contract.guidedSol1Steps[i];
    const actual = p21.MOON_SOL1_TOUR_STEPS[i];
    assert.equal(actual.stepId, expected.stepId);
    assert.equal(actual.targetId, expected.target);
    assert.equal(actual.phase, expected.phase);
    assert.equal(actual.decorationOnly, false);
    assert.equal(actual.testEvent, expected.testEvent);

    const viTitle = p21.dictionaries.vi[actual.titleKey];
    const enTitle = p21.dictionaries.en[actual.titleKey];
    const viBody = p21.dictionaries.vi[actual.bodyKey];
    const enBody = p21.dictionaries.en[actual.bodyKey];
    assert.equal(viTitle, expected.title.vi);
    assert.equal(enTitle, expected.title.en);
    assert.equal(viBody, expected.body.vi);
    assert.equal(enBody, expected.body.en);
    assert.ok(wordCount(viBody) <= contract.copyLimits.guidedPopoverMaxWords);
    assert.ok(wordCount(enBody) <= contract.copyLimits.guidedPopoverMaxWords);
  }
});

test('Phase 2.1 selectors gate Guided Sol 1 start/resume, practice overview, and contextual hints cleanly', () => {
  const bundle = core.loadContentBundle();
  const sol1Briefing = core.createInitialGameState(bundle, { seed: 205099, difficulty: 'cadet' });
  const onboardingActive = {
    ...p21.createDefaultOnboardingState(),
    activeTour: 'sol1',
    activeStepId: 'sol1-open-briefing',
    sol1GuideStatus: 'active',
  };

  assert.equal(p21.canStartGuidedSol1(sol1Briefing, onboardingActive), true);
  assert.equal(p21.getResumeStepId(onboardingActive, sol1Briefing), 'sol1-open-briefing');
  assert.equal(p21.shouldUsePracticeOverview(sol1Briefing, onboardingActive), false);
  assert.equal(
    p21.canTriggerContextualHints(sol1Briefing, { activeModal: null, reducedMotion: false }, onboardingActive),
    false
  );

  // Saved in briefing step, but game already advanced to engineering -> reconciles to Sol 1 engineering step.
  const sol1Engineering = {
    ...sol1Briefing,
    clock: { ...sol1Briefing.clock, phase: 'engineering' },
  };
  assert.equal(p21.getResumeStepId(onboardingActive, sol1Engineering), 'sol1-crew-assignment');

  // After Sol 1, Guided Sol 1 cannot auto-start and tutorial falls back to Practice Overview.
  const sol2Briefing = {
    ...sol1Briefing,
    clock: { ...sol1Briefing.clock, sol: 2, phase: 'briefing' },
  };
  const idleOnboarding = p21.createDefaultOnboardingState();
  assert.equal(p21.canStartGuidedSol1(sol2Briefing, idleOnboarding), false);
  assert.equal(p21.getResumeStepId(onboardingActive, sol2Briefing), null);
  assert.equal(p21.shouldUsePracticeOverview(sol2Briefing, idleOnboarding), true);
  assert.equal(
    p21.canTriggerContextualHints(sol2Briefing, { activeModal: null, reducedMotion: false }, idleOnboarding),
    true
  );
  assert.equal(
    p21.canTriggerContextualHints(
      sol2Briefing,
      { activeModal: 'starlog', reducedMotion: false },
      idleOnboarding
    ),
    false
  );
});

test('Phase 2.1 driverAdapter enforces single instance, fallback/missing-target safety, reducedMotion, and cleanup', async () => {
  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  const prevHTMLElement = globalThis.HTMLElement;

  class FakeElement {
    constructor(tourId) {
      this.dataset = { tour: tourId };
      this.isConnected = true;
      this.focused = false;
    }
    hasAttribute() {
      return false;
    }
    getBoundingClientRect() {
      return { width: 100, height: 44, top: 0, left: 0 };
    }
    closest() {
      return null;
    }
    focus() {
      this.focused = true;
    }
  }

  const domNodes = new Map([
    ['[data-tour="primary-phase-cta"]', new FakeElement('primary-phase-cta')],
    ['[data-tour="telemetry-donki"]', new FakeElement('telemetry-donki')],
  ]);
  const triggerBtn = new FakeElement('trigger');
  const dispatchedEvents = [];

  globalThis.HTMLElement = FakeElement;
  globalThis.document = {
    body: { tagName: 'BODY' },
    activeElement: triggerBtn,
    querySelector: (selector) => domNodes.get(selector) ?? null,
    querySelectorAll: () => [],
  };
  globalThis.window = {
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    dispatchEvent: (event) => {
      dispatchedEvents.push(event);
      return true;
    },
  };

  try {
    const backendRecords = [];
    const adapter = p21.createDriverAdapter((config) => {
      const state = { active: false, destroyed: 0, index: 0, config };
      const instance = {
        isActive: () => state.active,
        drive: (index = 0) => {
          state.active = true;
          state.index = index;
          config.steps[index]?.onHighlightStarted?.(null);
        },
        moveTo: (index) => {
          state.index = index;
          config.steps[index]?.onHighlightStarted?.(null);
        },
        destroy: () => {
          state.active = false;
          state.destroyed += 1;
        },
      };
      backendRecords.push(state);
      return instance;
    });

    const stepChanges = [];
    const dismissReasons = [];

    // Primary 'open-briefing' is missing, so step 0 must fall back to 'primary-phase-cta' cleanly!
    const started = await adapter.start({
      tourId: 'sol1',
      steps: p21.MOON_SOL1_TOUR_STEPS.slice(0, 2),
      reducedMotion: true,
      resolveText: (step) => ({
        title: p21.dictionaries.en[step.titleKey],
        description: p21.dictionaries.en[step.bodyKey],
      }),
      onStepChange: (stepId, targetId) => stepChanges.push({ stepId, targetId }),
      onDismiss: (reason) => dismissReasons.push(reason),
    });

    assert.equal(started, true);
    assert.equal(adapter.isActive(), true);
    assert.equal(adapter.getActiveStepId(), 'sol1-open-briefing');
    assert.deepEqual(stepChanges[0], {
      stepId: 'sol1-open-briefing',
      targetId: 'primary-phase-cta',
    });
    assert.equal(backendRecords[0].config.animate, false);
    assert.equal(backendRecords[0].config.smoothScroll, false);
    assert.equal(dispatchedEvents[0]?.type, 'onboarding:test:sol1-open-briefing');

    // Starting a second tour destroys the first backend instance (single instance invariant).
    await adapter.resume({
      tourId: 'sol1',
      steps: p21.MOON_SOL1_TOUR_STEPS.slice(0, 2),
      startStepId: 'sol1-weather-status',
      reducedMotion: false,
      resolveText: (step) => ({
        title: p21.dictionaries.en[step.titleKey],
        description: p21.dictionaries.en[step.bodyKey],
      }),
      onStepChange: (stepId, targetId) => stepChanges.push({ stepId, targetId }),
      onDismiss: (reason) => dismissReasons.push(reason),
    });

    assert.equal(backendRecords.length, 2);
    assert.equal(backendRecords[0].destroyed, 1);
    assert.equal(adapter.getActiveStepId(), 'sol1-weather-status');
    assert.equal(backendRecords[1].config.animate, true);

    adapter.destroy('unmount');
    adapter.destroy('unmount');
    assert.equal(adapter.isActive(), false);
    assert.equal(adapter.getActiveStepId(), null);
    assert.equal(backendRecords[1].destroyed, 1);
    assert.deepEqual(dismissReasons, ['unmount']);
    assert.equal(triggerBtn.focused, true);

    // Missing all targets gracefully ends without throwing.
    domNodes.clear();
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (msg) => warnings.push(String(msg));
    try {
      const missingResult = await adapter.start({
        tourId: 'sol1',
        steps: [
          {
            ...p21.MOON_SOL1_TOUR_STEPS[0],
            waitForElementMs: 0,
          },
        ],
        reducedMotion: true,
        resolveText: (step) => ({
          title: step.stepId,
          description: step.stepId,
        }),
      });
      assert.equal(missingResult, false);
      assert.equal(adapter.isActive(), false);
      assert.ok(warnings.length >= 1);
    } finally {
      console.warn = origWarn;
    }
  } finally {
    globalThis.document = prevDocument;
    globalThis.window = prevWindow;
    globalThis.HTMLElement = prevHTMLElement;
  }
});

test('Phase 2.1 determinism invariant: mutating OnboardingState never changes GameState checksum or replay trace', () => {
  const bundle = core.loadContentBundle();
  const options = { seed: 205099, difficulty: 'cadet', runId: 'p21-hash-invariant' };

  p21.useUiStore.getState().resetOnboarding();
  const runUnseen = core.runCampaign(bundle, options, core.baselinePolicy);

  p21.useUiStore.getState().setIntroStatus('completed');
  p21.useUiStore.getState().startTour('sol1', 'sol1-crew-assignment');
  p21.useUiStore.getState().dismissHint('hint-critical-forecast');
  const runActive = core.runCampaign(bundle, options, core.baselinePolicy);

  p21.useUiStore.getState().completeTour();
  const runCompleted = core.runCampaign(bundle, options, core.baselinePolicy);

  assert.equal(runUnseen.trace.initialHash, runActive.trace.initialHash);
  assert.equal(runUnseen.trace.finalHash, runActive.trace.finalHash);
  assert.equal(runUnseen.trace.finalHash, runCompleted.trace.finalHash);
  assert.deepEqual(runUnseen.trace, runCompleted.trace);

  p21.useUiStore.getState().resetOnboarding();
});
