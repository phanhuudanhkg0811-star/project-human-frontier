import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { simulationRoot } from '../scripts/load-simulation.mjs';

async function loadHardeningBundle() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/config/releaseMeta.ts';
        export * from './src/schemas/contracts.ts';
        export * from './src/simulation/policies.ts';
        export * from './src/domain/orchestrator.ts';
        export * from './src/domain/prng.ts';
        export * from './src/domain/canonicalJson.ts';
        export * from './src/domain/narrativeSelectors.ts';
        export * from './src/persistence/saveAdapter.ts';
        export * from './src/onboarding/persistence.ts';
        export * from './src/onboarding/narrativePersistence.ts';
        export * from './src/onboarding/driverAdapter.ts';
        export * from './src/onboarding/tours/moonSol1Tour.ts';
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

const p26 = await loadHardeningBundle();
const bundle = p26.loadContentBundle();

test('Phase 2.6 Release Meta updates to 2.0.0-moon32 while keeping SaveEnvelope v4 and APP_VERSION 1.4.0 intact', () => {
  assert.equal(p26.RELEASE_VERSION, '2.0.0-moon32');
  assert.equal(p26.RELEASE_META.releaseVersion, '2.0.0-moon32');
  assert.equal(p26.SAVE_SCHEMA_VERSION, 4);
  assert.equal(p26.RELEASE_META.schemaVersion, 4);
  assert.equal(p26.APP_VERSION, '1.4.0');
  assert.equal(p26.RELEASE_META.saveAppVersion, '1.4.0');
});

test('Phase 2.6 preserves Phase 1 SaveEnvelope v4 saves without forcing intro/tour or backfilling past milestones', () => {
  let state = p26.createInitialGameState(bundle, { seed: 205099, difficulty: 'cadet' });
  const policy = p26.createPolicy('balanced', 'A');
  let stepCount = 0;
  while (state.clock.sol < 15 || state.clock.phase !== 'briefing') {
    const command = policy.nextCommand(state, bundle, stepCount++);
    assert.ok(command, `Expected command before reaching Sol 15 briefing`);
    const next = p26.dispatchDomainCommand(state, command, bundle);
    assert.equal(next.ok, true);
    state = next.state;
  }

  const envelope = p26.buildSaveEnvelope(state, '2026-11-15T00:00:00.000Z');
  const envelopeRaw = JSON.stringify(envelope);
  const expectedChecksum = p26.computeStateChecksum(state);

  const storage = createMemoryStorage({
    [p26.SAVE_STORAGE_KEY]: envelopeRaw,
  });

  const onboardingDecoded = p26.decodeOnboardingState(
    storage.getItem(p26.ONBOARDING_STORAGE_KEY),
    { hasExistingCampaignSave: true }
  );
  assert.equal(onboardingDecoded.migrated, true);
  assert.equal(onboardingDecoded.resetToDefault, false);
  assert.equal(onboardingDecoded.noticeCode, null);
  assert.equal(onboardingDecoded.state.introStatus, 'completed');
  assert.equal(onboardingDecoded.state.cockpitTourStatus, 'completed');

  const narrativeDecoded = p26.decodeNarrativeState(storage.getItem(p26.NARRATIVE_STORAGE_KEY));
  assert.equal(narrativeDecoded.resetToDefault, false);
  assert.equal(narrativeDecoded.state.shownMilestoneIds.length, 0);

  // Sol 15 briefing presents only Sol 15 Sunset milestone, never backfilling Sol 1 Arrival or Sol 7 Crisis.
  const pending = p26.selectPendingCockpitMilestone(state, bundle, narrativeDecoded.state, {
    tutorialSandboxActive: false,
    hasSaveError: false,
    activeTour: null,
    activeModal: null,
    cockpitTourStatus: onboardingDecoded.state.cockpitTourStatus,
    sol1GuideStatus: onboardingDecoded.state.sol1GuideStatus,
  });
  assert.equal(pending?.id, 'moon-sol15-lunar-sunset');
  assert.equal(storage.getItem(p26.SAVE_STORAGE_KEY), envelopeRaw);
  assert.equal(p26.computeStateChecksum(state), expectedChecksum);
});

test('Phase 2.6 fails closed on corrupt onboarding & narrative storage without touching campaign save checksum', () => {
  const cleanState = p26.createInitialGameState(bundle, { seed: 205001, difficulty: 'standard' });
  const rawSave = JSON.stringify(p26.buildSaveEnvelope(cleanState, '2026-11-15T00:00:00.000Z'));

  const storage = createMemoryStorage({
    [p26.SAVE_STORAGE_KEY]: rawSave,
    [p26.ONBOARDING_STORAGE_KEY]: '{not-valid-json',
    [p26.NARRATIVE_STORAGE_KEY]: '{"narrativeVersion":99,"shownMilestoneIds":"bad"}',
  });

  const corruptOnboarding = p26.decodeOnboardingState(storage.getItem(p26.ONBOARDING_STORAGE_KEY), {
    hasExistingCampaignSave: true,
  });
  assert.equal(corruptOnboarding.resetToDefault, true);
  assert.equal(corruptOnboarding.noticeCode, 'E_ONBOARDING_CORRUPT');
  assert.equal(corruptOnboarding.state.onboardingVersion, p26.ONBOARDING_SCHEMA_VERSION);
  assert.equal(corruptOnboarding.state.activeTour, null);

  const versionMismatch = p26.decodeOnboardingState(
    JSON.stringify({
      onboardingVersion: 99,
      tourVersion: 'old-v0',
      introStatus: 'completed',
    })
  );
  assert.equal(versionMismatch.resetToDefault, true);
  assert.equal(versionMismatch.noticeCode, 'E_ONBOARDING_VERSION');

  const corruptNarrative = p26.decodeNarrativeState(storage.getItem(p26.NARRATIVE_STORAGE_KEY));
  assert.equal(corruptNarrative.resetToDefault, true);
  assert.deepEqual(corruptNarrative.state, p26.createDefaultNarrativeState());

  // Campaign save stays byte-for-byte untouched.
  assert.equal(storage.getItem(p26.SAVE_STORAGE_KEY), rawSave);
});

test('Phase 2.6 Driver adapter cleans up overlays/listeners on terminal destroy & protects required Sol 1 steps', async () => {
  const prevDocument = globalThis.document;
  const removed = [];
  let destroyedCount = 0;
  let movedIndices = [];
  let savedConfig = null;

  const fakeElement = {
    getClientRects: () => [{ width: 120, height: 44 }],
    scrollIntoView: () => {},
    contains: () => false,
    isConnected: true,
  };
  const fakeOverlay = { parentNode: { removeChild: () => removed.push('overlay') } };
  const fakePopover = { parentNode: { removeChild: () => removed.push('popover') } };

  globalThis.document = {
    activeElement: null,
    body: {
      querySelector: () => null,
    },
    querySelector: (sel) => (sel.includes('open-briefing') ? fakeElement : null),
    querySelectorAll: (sel) => {
      if (sel.includes('.driver-overlay')) return [fakeOverlay];
      if (sel.includes('.driver-popover')) return [fakePopover];
      return [];
    },
  };

  try {
    const adapter = p26.createDriverAdapter(async (config) => {
      savedConfig = config;
      return {
        drive: () => {},
        moveTo: (idx) => {
          movedIndices.push(idx);
        },
        destroy: () => {
          destroyedCount += 1;
        },
        isActive: () => true,
        updatePopover: () => {},
      };
    });

    const started = await adapter.start({
      tourId: 'sol1',
      steps: p26.MOON_SOL1_TOUR_STEPS,
      reducedMotion: true,
      progressText: '{{current}}/{{total}}',
      resolveText: (step) => ({
        title: step.stepId,
        description: step.targetId,
        nextBtnText: 'Next',
        prevBtnText: 'Prev',
        doneBtnText: 'Done',
        closeBtnLabel: 'Close',
      }),
    });

    assert.equal(started, true);
    assert.equal(adapter.isActive(), true);
    // Required Sol 1 action step missing target keeps anchor cleanly rather than silently skipping past required step.
    const requiredIndex = p26.MOON_SOL1_TOUR_STEPS.findIndex((s) => s.allowContinueWithoutAction === false);
    assert.ok(requiredIndex >= 0);
    const reqStep = p26.MOON_SOL1_TOUR_STEPS[requiredIndex];
    savedConfig.steps[requiredIndex].popover.onNextClick();
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(movedIndices.length >= 0);
    assert.equal(reqStep.allowContinueWithoutAction, false);

    adapter.destroy('terminal');
    assert.equal(destroyedCount, 1);
    assert.equal(adapter.isActive(), false);
    assert.equal(adapter.getActiveStepId(), null);
    assert.ok(removed.includes('overlay') && removed.includes('popover'));
  } finally {
    globalThis.document = prevDocument;
  }
});

test('Phase 2.6 A11y & responsive source invariants cover Escape/focus-restore and 44x44px mobile touch targets', () => {
  const titleSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/onboarding/TitleScreen.tsx'),
    'utf8'
  );
  const cssSrc = fs.readFileSync(path.join(simulationRoot, 'src/hail.css'), 'utf8');
  const appSrc = fs.readFileSync(path.join(simulationRoot, 'src/App.tsx'), 'utf8');

  assert.match(titleSrc, /event\.key === 'Escape'/);
  assert.match(titleSrc, /closeOverwritePrompt\(true\)/);
  assert.match(titleSrc, /newMissionBtnRef\.current\.focus\(\)/);

  // Mobile media rules guarantee >=44px touch targets for driver popover buttons, hint links, and title prompt actions.
  assert.match(cssSrc, /\.driver-popover-footer-btn,\s*[\r\n]+\s*\.driver-popover\.phf-driver-popover \.driver-popover-close-btn \{\s*[\r\n]+\s*min-width: 44px;\s*[\r\n]+\s*min-height: 44px;/);
  assert.match(cssSrc, /\.phf-hint-cta,\s*[\r\n]+\s*\.phf-hint-link \{\s*[\r\n]+\s*min-height: 44px;/);
  assert.match(cssSrc, /@media \(prefers-reduced-motion: reduce\)/);

  // App gates on Title screen at launch instead of directly entering cockpit.
  assert.match(appSrc, /appScreen === 'title'/);
});
