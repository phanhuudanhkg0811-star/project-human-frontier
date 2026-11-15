import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { simulationRoot } from '../scripts/load-simulation.mjs';

async function loadPhase23Bundle() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/onboarding/types.ts';
        export * from './src/onboarding/targets.ts';
        export * from './src/onboarding/persistence.ts';
        export * from './src/onboarding/selectors.ts';
        export * from './src/onboarding/tours/cockpitDiscoveryTour.ts';
        export * from './src/onboarding/tours/moonSol1Tour.ts';
        export * from './src/onboarding/tourController.ts';
        export * from './src/onboarding/driverAdapter.ts';
        export * from './src/store/gameStore.ts';
        export * from './src/store/uiStore.ts';
        export * from './src/i18n/dictionaries.ts';
        export * from './src/schemas/contracts.ts';
        export * from './src/domain/orchestrator.ts';
        export * from './src/domain/selectors.ts';
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

const p23 = await loadPhase23Bundle();

test('Phase 2.3 Cockpit Discovery Tour covers context, stats, crew, interior panels, equipment, comms/rover, and CTA with valid targets & VI/EN parity', () => {
  assert.equal(p23.COCKPIT_DISCOVERY_STEPS.length, 11);
  const expectedStepIds = [
    'cockpit-context',
    'cockpit-stats',
    'cockpit-crew',
    'cockpit-systems-fab',
    'cockpit-crew-panel',
    'cockpit-briefing-panel',
    'cockpit-systems-panel',
    'cockpit-fabricator-panel',
    'cockpit-comms-rover',
    'cockpit-rover-panel',
    'cockpit-console-cta',
  ];
  assert.deepEqual(p23.COCKPIT_DISCOVERY_STEP_IDS, expectedStepIds);

  const validTargetValues = new Set(Object.values(p23.TOUR_TARGET_IDS));
  for (const step of p23.COCKPIT_DISCOVERY_STEPS) {
    assert.ok(validTargetValues.has(step.targetId), `Invalid target ${step.targetId}`);
    if (step.fallbackTargetId) {
      assert.ok(validTargetValues.has(step.fallbackTargetId), `Invalid fallback ${step.fallbackTargetId}`);
    }
    assert.ok(p23.dictionaries.vi[step.titleKey]?.length > 0, `Missing VI title ${step.titleKey}`);
    assert.ok(p23.dictionaries.en[step.titleKey]?.length > 0, `Missing EN title ${step.titleKey}`);
    assert.ok(p23.dictionaries.vi[step.bodyKey]?.length > 0, `Missing VI body ${step.bodyKey}`);
    assert.ok(p23.dictionaries.en[step.bodyKey]?.length > 0, `Missing EN body ${step.bodyKey}`);
  }

  const telemetrySrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/hud/TelemetryTopBar.tsx'),
    'utf8'
  );
  const viewportSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/HailGameViewport.tsx'),
    'utf8'
  );
  const dialogSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/modals/MissionDialog.tsx'),
    'utf8'
  );
  const nightSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/modals/NightCutsceneModal.tsx'),
    'utf8'
  );

  assert.match(telemetrySrc, /TOUR_TARGET_IDS\.TELEMETRY_BAR/);
  assert.match(viewportSrc, /TOUR_TARGET_IDS\.COCKPIT_WINDOW/);
  assert.match(viewportSrc, /TOUR_TARGET_IDS\.COCKPIT_CREW_STAGE/);
  assert.match(viewportSrc, /TOUR_TARGET_IDS\.COCKPIT_FABRICATOR/);
  assert.match(dialogSrc, /is-tour-modeless/);
  assert.match(dialogSrc, /dialog\.show\(\)/);
  assert.match(nightSrc, /is-tour-modeless/);
  assert.match(nightSrc, /el\.show\(\)/);

  // Guard Driver.js progress template & high-specificity dark theme + non-overlapping footer rules
  assert.equal(p23.dictionaries.vi['onboarding.popover.progress'], '{{current}} / {{total}}');
  assert.equal(p23.dictionaries.en['onboarding.popover.progress'], '{{current}} / {{total}}');
  const cssSrc = fs.readFileSync(path.join(simulationRoot, 'src/hail.css'), 'utf8');
  assert.match(cssSrc, /\.driver-popover\.phf-driver-popover\s*\{/);
  assert.match(cssSrc, /\.driver-popover\.phf-driver-popover\s+\.driver-popover-progress-text\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(cssSrc, /\.driver-popover\.phf-driver-popover\s+\.driver-popover-footer\s+\.driver-popover-footer-btn\s*\{[\s\S]*white-space:\s*nowrap/);
  const adapterSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/onboarding/driverAdapter.ts'),
    'utf8'
  );
  assert.match(adapterSrc, /allowPageInteraction:\s*false/);
});

test('Phase 2.3 Cockpit Discovery chains smoothly into Sol 1, Skip stays non-destructive, and Phase 1 / Sol 2+ saves are never forced into tours', () => {
  const bundle = p23.loadContentBundle();
  const sol1State = p23.createInitialGameState(bundle, { seed: 205001, difficulty: 'standard' });
  const store = p23.useUiStore;
  store.getState().resetOnboarding();

  // First-run Sol 1 briefing -> auto-starts Cockpit Discovery tour
  const plan1 = p23.evaluateAutoStartTour(sol1State, store.getState().onboarding, false);
  assert.deepEqual(plan1, { tourId: 'cockpit', startStepId: 'cockpit-context' });

  store.getState().startCockpitTour();
  assert.equal(store.getState().onboarding.activeTour, 'cockpit');
  assert.equal(store.getState().onboarding.cockpitTourStatus, 'active');

  // Chain completion -> transitions cleanly to Sol 1 interactive tour
  store.getState().completeCockpitTour('to-sol1');
  assert.equal(store.getState().onboarding.cockpitTourStatus, 'completed');
  assert.equal(store.getState().onboarding.activeTour, 'sol1');
  assert.equal(store.getState().onboarding.activeStepId, 'sol1-open-briefing');
  assert.equal(store.getState().onboarding.sol1GuideStatus, 'active');

  // Replay Cockpit Tour and skip -> keeps already 'completed' status intact
  store.getState().startCockpitTour('cockpit-crew');
  assert.equal(store.getState().onboarding.activeStepId, 'cockpit-crew');
  store.getState().skipCockpitTour();
  assert.equal(store.getState().onboarding.activeTour, null);
  assert.equal(store.getState().onboarding.cockpitTourStatus, 'completed');

  // Save with error blocks auto-start fail-closed
  store.getState().resetOnboarding();
  const errPlan = p23.evaluateAutoStartTour(sol1State, store.getState().onboarding, true);
  assert.deepEqual(errPlan, { tourId: null, startStepId: null });

  // Phase 1 save migration without onboarding JSON skips auto-tour on Continue
  const migrated = p23.decodeOnboardingState(null, { hasExistingCampaignSave: true });
  assert.equal(migrated.state.cockpitTourStatus, 'completed');

  // Sol 2 state never auto-starts Cockpit or Sol 1 tour
  const sol2State = { ...sol1State, clock: { ...sol1State.clock, sol: 2 } };
  const sol2Plan = p23.evaluateAutoStartTour(sol2State, store.getState().onboarding, false);
  assert.deepEqual(sol2Plan, { tourId: null, startStepId: null });

  // Backwards-compatible decode of Phase 2.1 stored JSON (missing cockpitTourStatus)
  const legacyV21 = p23.decodeOnboardingState(
    JSON.stringify({
      onboardingVersion: 1,
      introStatus: 'completed',
      tourVersion: 'moon-sol1-v1',
      activeTour: null,
      activeStepId: null,
      sol1GuideStatus: 'skipped',
      contextualHintsEnabled: true,
      dismissedHintIds: [],
      hintLastShownSol: {},
      hintShowCounts: {},
    })
  );
  assert.equal(legacyV21.noticeCode, null);
  assert.equal(legacyV21.state.cockpitTourStatus, 'completed');

  // After Cockpit Discovery completes, never auto-start forced Guided Sol 1
  store.getState().resetOnboarding();
  store.getState().startCockpitTour();
  store.getState().completeCockpitTour('done');
  assert.equal(store.getState().onboarding.cockpitTourStatus, 'completed');
  assert.equal(store.getState().onboarding.activeTour, null);
  assert.deepEqual(
    p23.evaluateAutoStartTour(sol1State, store.getState().onboarding, false),
    { tourId: null, startStepId: null }
  );

  const tutorialSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/modals/TutorialModal.tsx'),
    'utf8'
  );
  const viewportSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/HailGameViewport.tsx'),
    'utf8'
  );
  assert.doesNotMatch(tutorialSrc, /onboarding\.controls\.replay/);
  assert.match(tutorialSrc, /enterSol1Sandbox/);
  assert.match(tutorialSrc, /onboarding\.cockpit\.replayCockpit/);
  assert.match(viewportSrc, /canChainSol1:\s*false/);
  assert.match(viewportSrc, /onboarding\.activeTour\s*!==\s*null/);

  // Every New Mission resets cockpitTourStatus back to 'unseen' so player gets 1 skippable tour per mission
  store.getState().resetCampaignUi();
  assert.equal(store.getState().onboarding.cockpitTourStatus, 'unseen');
  store.getState().skipCockpitTour();
  assert.equal(store.getState().onboarding.cockpitTourStatus, 'skipped');
  assert.deepEqual(
    p23.evaluateAutoStartTour(sol1State, store.getState().onboarding, false),
    { tourId: null, startStepId: null }
  );
  store.getState().resetCampaignUi();
  assert.equal(store.getState().onboarding.cockpitTourStatus, 'unseen');
  assert.deepEqual(
    p23.evaluateAutoStartTour(sol1State, store.getState().onboarding, false),
    { tourId: 'cockpit', startStepId: 'cockpit-context' }
  );

  store.getState().resetOnboarding();
});

test('Phase 2.3 Guided Sol 1 progression follows real domain actions across all phases and tolerates rejections', () => {
  const bundle = p23.loadContentBundle();
  let state = p23.createInitialGameState(bundle, { seed: 205002, difficulty: 'cadet' });
  const startRes = p23.dispatchDomainCommand(
    state,
    { type: 'game/start', donkiProfileId: bundle.donki.samples[0].id, difficulty: 'cadet', seed: 205002 },
    bundle
  );
  assert.equal(startRes.ok, true);
  state = startRes.state;

  // Step 1: briefing modal closed -> stays on sol1-open-briefing
  assert.deepEqual(p23.resolveSol1StepProgression('sol1-open-briefing', state, null), {
    action: 'none',
  });
  // Opening starlog completes step 1 -> step 2 (weather-status)
  assert.deepEqual(p23.resolveSol1StepProgression('sol1-open-briefing', state, 'starlog'), {
    action: 'advance',
    completedStepId: 'sol1-open-briefing',
    nextStepId: 'sol1-weather-status',
  });
  assert.equal(p23.doesStepMatchOpenModal('sol1-weather-status', 'starlog'), true);

  // Attempting phase/advance while mandatory event pending fails -> step 3 stays incomplete
  const blockedAdvance = p23.dispatchDomainCommand(state, { type: 'phase/advance' }, bundle);
  assert.equal(blockedAdvance.ok, false);
  assert.deepEqual(p23.resolveSol1StepProgression('sol1-event-choice', state, 'starlog'), {
    action: 'none',
  });

  // Resolving Sol 1 event advances step 3 -> step 4 (crew-assignment)
  const event = bundle.events.find((e) => e.id === state.events.activeEventId);
  assert.ok(event);
  const resolved = p23.dispatchDomainCommand(
    state,
    { type: 'event/resolve', eventId: event.id, choiceId: event.choices[0].id },
    bundle
  );
  assert.equal(resolved.ok, true);
  state = resolved.state;
  assert.deepEqual(p23.resolveSol1StepProgression('sol1-event-choice', state, 'starlog'), {
    action: 'advance',
    completedStepId: 'sol1-event-choice',
    nextStepId: 'sol1-crew-assignment',
  });

  // Advance to engineering and assign crew rest -> completes step 4 -> step 5 (systems-panel)
  state = p23.dispatchDomainCommand(state, { type: 'phase/advance' }, bundle).state;
  state = p23.dispatchDomainCommand(
    state,
    { type: 'crew/assign', crewId: 'eng', task: 'rest' },
    bundle
  ).state;
  assert.deepEqual(p23.resolveSol1StepProgression('sol1-crew-assignment', state, 'character'), {
    action: 'advance',
    completedStepId: 'sol1-crew-assignment',
    nextStepId: 'sol1-systems-panel',
  });
  assert.equal(p23.doesStepMatchOpenModal('sol1-systems-panel', 'menu'), true);

  // Advance to comms and open comms modal -> stays open with Next enabled, then closing comms advances to step 7
  state = p23.dispatchDomainCommand(state, { type: 'phase/advance' }, bundle).state;
  const step6 = p23.MOON_SOL1_TOUR_STEPS.find((s) => s.stepId === 'sol1-open-comms');
  assert.ok(step6);
  assert.equal(p23.canSol1StepAdvance(step6, state, null), false);
  assert.equal(p23.canSol1StepAdvance(step6, state, 'comms'), true);
  assert.deepEqual(p23.resolveSol1StepProgression('sol1-open-comms', state, 'comms'), {
    action: 'none',
  });
  assert.deepEqual(
    p23.resolveSol1StepProgression('sol1-open-comms', state, null, { justClosedComms: true }),
    {
      action: 'advance',
      completedStepId: 'sol1-open-comms',
      nextStepId: 'sol1-resource-forecast',
    }
  );

  // Advance to rationing and pull End-Sol lever -> completes step 8 -> step 9 (debrief-brief)
  state = p23.dispatchDomainCommand(state, { type: 'phase/advance' }, bundle).state;
  state = p23.dispatchDomainCommand(state, { type: 'sol/end' }, bundle).state;
  assert.equal(state.clock.phase, 'debrief');
  assert.deepEqual(p23.resolveSol1StepProgression('sol1-end-sol', state, 'end'), {
    action: 'advance',
    completedStepId: 'sol1-end-sol',
    nextStepId: 'sol1-debrief-brief',
  });

  // Dismissing debrief transitions to Sol 2 briefing -> completes Guided Sol 1 tour
  state = p23.dispatchDomainCommand(state, { type: 'debrief/dismiss' }, bundle).state;
  assert.equal(state.clock.sol, 2);
  assert.deepEqual(p23.resolveSol1StepProgression('sol1-debrief-brief', state, null), {
    action: 'complete',
    completedStepId: 'sol1-debrief-brief',
  });

  // Stepping between mismatched modal contexts closes stale modals before highlighting cockpit buttons
  const store = p23.useUiStore;
  store.getState().openModal('starlog');
  assert.equal(p23.syncModalForTourStep('sol1', 'sol1-event-choice'), false);
  assert.equal(store.getState().activeModal, 'starlog');
  assert.equal(p23.syncModalForTourStep('sol1', 'sol1-crew-assignment'), true);
  assert.equal(store.getState().activeModal, null);

  store.getState().openModal('character');
  assert.equal(p23.syncModalForTourStep('sol1', 'sol1-crew-assignment'), false);
  assert.equal(store.getState().activeModal, 'character');
  assert.equal(p23.syncModalForTourStep('sol1', 'sol1-systems-panel'), true);
  assert.equal(store.getState().activeModal, null);

  store.getState().openModal('menu');
  assert.equal(p23.syncModalForTourStep('cockpit', 'cockpit-crew'), true);
  assert.equal(store.getState().activeModal, null);
});

test('Phase 2.3 Replay Sol 1 runs inside an ephemeral sandbox without mutating saved campaign and advances briefing to engineering for Crew step 4', async () => {
  const gameStore = p23.useGameStore;
  const uiStore = p23.useUiStore;
  const bundle = gameStore.getState().bundle;

  // Prepare a real campaign and progress it past Sol 1 into Sol 2
  await gameStore.getState().resetCampaign({ seed: 205099, difficulty: 'standard' });
  const initialEventId = gameStore.getState().gameState.events.activeEventId;
  assert.ok(initialEventId);
  const initialEvent = bundle.events.find((e) => e.id === initialEventId);
  assert.ok(initialEvent);
  await gameStore.getState().dispatch({
    type: 'event/resolve',
    eventId: initialEvent.id,
    choiceId: initialEvent.choices[0].id,
  });
  await gameStore.getState().dispatch({ type: 'phase/advance' });
  await gameStore.getState().dispatch({
    type: 'crew/assign',
    crewId: 'eng',
    task: 'rest',
  });
  await gameStore.getState().dispatch({ type: 'phase/advance' });
  await gameStore.getState().dispatch({ type: 'phase/advance' });
  await gameStore.getState().dispatch({ type: 'sol/end' });
  await gameStore.getState().dispatch({ type: 'debrief/dismiss' });

  const realCampaignBeforeSandbox = structuredClone(gameStore.getState().gameState);
  assert.equal(realCampaignBeforeSandbox.clock.sol, 2);
  const realTraceLengthBefore = gameStore.getState().replayTrace.steps.length;

  // Spy on localStorage writes to verify zero persistence during sandbox
  const storageWrites = [];
  const priorLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: (k, v) => storageWrites.push(['setItem', k, v]),
      removeItem: (k) => storageWrites.push(['removeItem', k]),
      clear: () => storageWrites.push(['clear']),
    },
  });

  try {
    gameStore.getState().enterSol1Sandbox('cockpit');
    uiStore.getState().replayOnboarding();

    const sandboxStart = gameStore.getState();
    assert.equal(sandboxStart.tutorialSandboxActive, true);
    assert.equal(sandboxStart.sandboxOriginScreen, 'cockpit');
    assert.equal(sandboxStart.gameState.clock.sol, 1);
    assert.equal(sandboxStart.gameState.clock.phase, 'briefing');
    assert.equal(
      Object.values(sandboxStart.gameState.crew).every((m) => m.assignedTask === null),
      true
    );
    assert.equal(
      p23.shouldUsePracticeOverview(sandboxStart.gameState, uiStore.getState().onboarding),
      false
    );

    // Step 3: resolve mandatory Sol 1 event -> triggers briefing -> engineering unlock for Crew Step 4
    const sandboxEventId = sandboxStart.gameState.events.activeEventId;
    assert.ok(sandboxEventId);
    const sandboxEvent = bundle.events.find((e) => e.id === sandboxEventId);
    assert.ok(sandboxEvent);
    const evRes = await gameStore.getState().dispatch({
      type: 'event/resolve',
      eventId: sandboxEvent.id,
      choiceId: sandboxEvent.choices[0].id,
    });
    assert.equal(evRes.ok, true);
    assert.deepEqual(
      p23.resolveSol1StepProgression('sol1-event-choice', gameStore.getState().gameState, 'starlog'),
      {
        action: 'advance',
        completedStepId: 'sol1-event-choice',
        nextStepId: 'sol1-crew-assignment',
      }
    );

    assert.equal(
      p23.selectCanAdvancePhase(gameStore.getState().gameState, bundle).allowed,
      true
    );
    const advRes = await gameStore.getState().dispatch({ type: 'phase/advance' });
    assert.equal(advRes.ok, true);
    assert.equal(gameStore.getState().gameState.clock.phase, 'engineering');

    // Step 4: crew assignment succeeds without skipping
    const assignRes = await gameStore.getState().dispatch({
      type: 'crew/assign',
      crewId: 'eng',
      task: 'rest',
    });
    assert.equal(assignRes.ok, true);
    assert.deepEqual(
      p23.resolveSol1StepProgression('sol1-crew-assignment', gameStore.getState().gameState, 'character'),
      {
        action: 'advance',
        completedStepId: 'sol1-crew-assignment',
        nextStepId: 'sol1-systems-panel',
      }
    );

    // Ensure sandbox mutations did not touch localStorage
    const gameStorageWrites = storageWrites.filter(
      ([, key]) => typeof key === 'string' && !key.includes('onboarding')
    );
    assert.equal(gameStorageWrites.length, 0);

    // Discard sandbox & restore exact Sol 2 campaign
    const origin = gameStore.getState().exitSol1Sandbox();
    assert.equal(origin, 'cockpit');
    assert.equal(gameStore.getState().tutorialSandboxActive, false);
    assert.deepEqual(gameStore.getState().gameState, realCampaignBeforeSandbox);
    assert.equal(gameStore.getState().replayTrace.steps.length, realTraceLengthBefore);
  } finally {
    if (priorLocalStorageDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', priorLocalStorageDescriptor);
    } else {
      delete globalThis.localStorage;
    }
    await gameStore.getState().resetCampaign();
    uiStore.getState().resetOnboarding();
  }
});

test('Phase 2.3 driverAdapter Step 3 -> Step 4 lands on sol1-crew-assignment via open-crew fallback and never skips required steps to Step 5', async () => {
  const priorDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const presentTargets = new Set([
    '[data-tour="open-briefing"]',
    '[data-tour="event-choice"]',
    '[data-tour="open-crew"]',
    '[data-tour="open-systems"]',
    '[data-tour="open-comms"]',
  ]);
  const makeMockEl = (selector) => ({
    selector,
    isConnected: true,
    hasAttribute: () => false,
    getBoundingClientRect: () => ({ width: 40, height: 24, top: 0, left: 0, right: 40, bottom: 24 }),
    scrollIntoView: () => {},
  });

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: { isConnected: true },
      activeElement: null,
      querySelector: (selector) => (presentTargets.has(selector) ? makeMockEl(selector) : null),
      querySelectorAll: () => [],
    },
  });

  try {
    const movedIndices = [];
    const popoverPatches = [];
    let commsModalOpen = false;
    let currentIdx = -1;
    let active = false;
    let recordedConfig = null;
    const adapter = p23.createDriverAdapter(async (config) => {
      recordedConfig = config;
      return {
        drive: (startIdx = 0) => {
          active = true;
          currentIdx = startIdx;
          movedIndices.push(startIdx);
          config.steps[startIdx]?.onHighlightStarted?.(null);
          config.steps[startIdx]?.onHighlighted?.(null);
        },
        moveTo: (idx) => {
          currentIdx = idx;
          movedIndices.push(idx);
          config.steps[idx]?.onHighlightStarted?.(null);
          config.steps[idx]?.onHighlighted?.(null);
        },
        updatePopover: (patch) => {
          popoverPatches.push(patch);
        },
        destroy: () => {
          active = false;
          config.onDestroyed?.();
        },
        isActive: () => active,
        getActiveIndex: () => currentIdx,
      };
    });

    const stepChanges = [];
    const started = await adapter.start({
      tourId: 'sol1',
      startStepId: 'sol1-event-choice',
      locale: 'vi',
      reducedMotion: true,
      steps: p23.MOON_SOL1_TOUR_STEPS,
      canAdvanceStep: (step) =>
        step.stepId === 'sol1-open-comms' ? commsModalOpen : Boolean(step.allowContinueWithoutAction),
      shouldWaitForTarget: (step) =>
        step.stepId === 'sol1-open-comms' ? commsModalOpen : step.targetId !== 'crew-assignment',
      resolveElementOverride: (step) =>
        step.stepId === 'sol1-open-comms' && commsModalOpen
          ? document.querySelector('[data-tour-modal-frame="comms"]')
          : null,
      resolveText: (step) => ({
        title: step.stepId,
        description: step.stepId,
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Done',
        closeBtnLabel: 'Close',
      }),
      onStepChange: (stepId, usedTargetId) => {
        stepChanges.push([stepId, usedTargetId]);
      },
    });
    assert.equal(started, true);
    assert.equal(adapter.getActiveStepId(), 'sol1-event-choice');

    // Moving from Step 3 (sol1-event-choice) -> Step 4 (sol1-crew-assignment) while Character modal is closed
    // must land on Step 4 (index 3) via open-crew fallback, NOT jump to Step 5 (index 4).
    const moved = adapter.move('sol1-crew-assignment');
    assert.equal(moved, true);
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.equal(adapter.getActiveStepId(), 'sol1-crew-assignment');
    assert.equal(currentIdx, 3);
    assert.deepEqual(stepChanges[stepChanges.length - 1], ['sol1-crew-assignment', 'open-crew']);
    assert.equal(movedIndices.includes(4), false);

    // Even if open-crew were temporarily unmounted mid-transition, allowContinueWithoutAction: false
    // must keep the tour anchored on Step 4 instead of skipping to Step 5.
    presentTargets.delete('[data-tour="open-crew"]');
    adapter.move('sol1-crew-assignment');
    await new Promise((resolve) => setTimeout(resolve, 460));
    assert.equal(adapter.getActiveStepId(), 'sol1-crew-assignment');
    assert.equal(currentIdx, 3);
    assert.equal(movedIndices.includes(4), false);
    // Step 6: when CAPCOM/Rover is closed -> targets open-comms without Next;
    // once CAPCOM/Rover opens -> switches spotlight onto comms modal frame and unlocks Next.
    let activeStepElement = null;
    adapter.move('sol1-open-comms');
    await new Promise((resolve) => setTimeout(resolve, 25));
    activeStepElement = recordedConfig.steps[5].element();
    assert.equal(adapter.getActiveStepId(), 'sol1-open-comms');
    assert.equal(activeStepElement.selector, '[data-tour="open-comms"]');
    assert.deepEqual(stepChanges[stepChanges.length - 1], ['sol1-open-comms', 'open-comms']);
    assert.deepEqual(popoverPatches[popoverPatches.length - 1], { showButtons: ['previous', 'close'] });

    commsModalOpen = true;
    presentTargets.add('[data-tour-modal-frame="comms"]');
    adapter.move('sol1-open-comms');
    await new Promise((resolve) => setTimeout(resolve, 25));
    activeStepElement = recordedConfig.steps[5].element();
    assert.equal(activeStepElement.selector, '[data-tour-modal-frame="comms"]');
    assert.deepEqual(popoverPatches[popoverPatches.length - 1], {
      showButtons: ['previous', 'next', 'close'],
    });
    assert.ok(recordedConfig);
    adapter.destroy('done');
  } finally {
    if (priorDocumentDescriptor) {
      Object.defineProperty(globalThis, 'document', priorDocumentDescriptor);
    } else {
      delete globalThis.document;
    }
  }
});

test('Phase 2.3 pressing Close (skip) on tours launched from How to Play returns directly to TutorialModal', () => {
  const uiStore = p23.useUiStore;
  const gameStore = p23.useGameStore;

  try {
    // 1. Replay Sol 1 launched from Title Screen -> skip returns to Title + opens TutorialModal
    uiStore.getState().enterTitleScreen();
    gameStore.getState().enterSol1Sandbox('title');
    uiStore.getState().enterCockpit();
    uiStore.getState().replayOnboarding({ returnToTutorialOrigin: 'title' });
    assert.equal(uiStore.getState().appScreen, 'cockpit');

    uiStore.getState().skipTour();
    assert.equal(uiStore.getState().appScreen, 'title');
    assert.equal(uiStore.getState().activeModal, 'tutorial');
    assert.equal(uiStore.getState().onboarding.activeTour, null);
    assert.equal(uiStore.getState().consumePendingTutorialReopen(), true);
    assert.equal(uiStore.getState().consumePendingTutorialReopen(), false);
    assert.equal(gameStore.getState().exitSol1Sandbox(), 'title');

    // 2. Replay Sol 1 launched from Cockpit -> skip stays on Cockpit + opens TutorialModal
    uiStore.getState().enterCockpit();
    uiStore.getState().replayOnboarding({ returnToTutorialOrigin: 'cockpit' });
    uiStore.getState().skipTour();
    assert.equal(uiStore.getState().appScreen, 'cockpit');
    assert.equal(uiStore.getState().activeModal, 'tutorial');
    assert.equal(uiStore.getState().consumePendingTutorialReopen(), true);

    // 3. Cockpit Discovery Tour launched from Title Screen -> skipCockpitTour returns to Title + TutorialModal
    uiStore.getState().enterTitleScreen();
    uiStore.getState().startCockpitTour(undefined, { returnToTutorialOrigin: 'title' });
    assert.equal(uiStore.getState().appScreen, 'cockpit');
    uiStore.getState().skipCockpitTour();
    assert.equal(uiStore.getState().appScreen, 'title');
    assert.equal(uiStore.getState().activeModal, 'tutorial');

    // 4. Normal completion does NOT force TutorialModal back open
    uiStore.getState().enterCockpit();
    uiStore.getState().replayOnboarding({ returnToTutorialOrigin: 'cockpit' });
    uiStore.getState().completeTour();
    assert.equal(uiStore.getState().activeModal, null);
    assert.equal(uiStore.getState().consumePendingTutorialReopen(), false);

    // 5. Plain replayOnboarding() without Tutorial origin keeps activeModal null on skip
    uiStore.getState().replayOnboarding();
    uiStore.getState().skipTour();
    assert.equal(uiStore.getState().activeModal, null);
  } finally {
    uiStore.getState().resetOnboarding();
    uiStore.getState().enterTitleScreen();
  }
});
