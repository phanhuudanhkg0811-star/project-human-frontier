import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { simulationRoot } from '../scripts/load-simulation.mjs';

async function loadPhase22Bundle() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/onboarding/introScenes.ts';
        export * from './src/store/uiStore.ts';
        export * from './src/store/gameStore.ts';
        export * from './src/i18n/dictionaries.ts';
        export * from './src/persistence/saveAdapter.ts';
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

const p22 = await loadPhase22Bundle();
const contract = readContractJson();

test('Phase 2.2 INTRO_SCENES matches frozen contract storyboard, duration budget, and VI/EN copy', () => {
  assert.equal(p22.INTRO_SCENES.length, contract.intro.scenes.length);
  assert.equal(p22.INTRO_TOTAL_DURATION_SEC, 75);
  assert.ok(p22.INTRO_TOTAL_DURATION_SEC >= contract.intro.minDurationSec);
  assert.ok(p22.INTRO_TOTAL_DURATION_SEC <= contract.intro.maxDurationSec);

  for (let idx = 0; idx < p22.INTRO_SCENES.length; idx += 1) {
    const actual = p22.INTRO_SCENES[idx];
    const expected = contract.intro.scenes[idx];
    assert.equal(actual.id, expected.id);
    assert.equal(actual.durationSec, expected.durationSec);

    const viTitle = p22.dictionaries.vi[actual.titleKey];
    const viBody = p22.dictionaries.vi[actual.bodyKey];
    const enTitle = p22.dictionaries.en[actual.titleKey];
    const enBody = p22.dictionaries.en[actual.bodyKey];

    const joinVi = viTitle.endsWith('!') ? `${viTitle} ${viBody}` : `${viTitle}. ${viBody}`;
    const joinEn = enTitle.endsWith('!') ? `${enTitle} ${enBody}` : `${enTitle}. ${enBody}`;
    assert.equal(joinVi, expected.vi);
    assert.equal(joinEn, expected.en);
  }
});

test('Phase 2.2 intro session storage handles reload recovery safely without creating campaign saves', () => {
  const memSession = createMemoryStorage();
  assert.equal(p22.readIntroSessionScene(memSession), null);

  p22.writeIntroSessionScene(3, 'first-run', 'title', memSession);
  assert.deepEqual(p22.readIntroSessionScene(memSession), {
    sceneIndex: 3,
    mode: 'first-run',
    returnScreen: 'title',
  });

  // Clamping out-of-range scene indices safely
  p22.writeIntroSessionScene(99, 'replay', 'cockpit', memSession);
  assert.deepEqual(p22.readIntroSessionScene(memSession), {
    sceneIndex: p22.INTRO_SCENES.length - 1,
    mode: 'replay',
    returnScreen: 'cockpit',
  });

  // Corrupt JSON does not throw
  memSession.setItem(p22.INTRO_SESSION_STORAGE_KEY, '{not-valid-json');
  assert.equal(p22.readIntroSessionScene(memSession), null);

  p22.clearIntroSessionScene(memSession);
  assert.equal(memSession.getItem(p22.INTRO_SESSION_STORAGE_KEY), null);
});

test('Phase 2.2 Title -> Intro (Complete/Skip) -> Mission Setup -> Cockpit transitions leave zero dirty save before game/start', async () => {
  const store = p22.useUiStore;
  store.getState().resetOnboarding();
  store.getState().enterTitleScreen();

  assert.equal(store.getState().appScreen, 'title');
  assert.equal(p22.useGameStore.getState().hasSavedCampaign, false);

  // First-run: New Mission launches Intro -> Skip hands off to Mission Setup
  store.getState().openIntro('first-run', 'title', 0);
  assert.equal(store.getState().appScreen, 'intro');
  assert.equal(store.getState().introSceneIndex, 0);

  store.getState().setIntroSceneIndex(2);
  assert.equal(store.getState().introSceneIndex, 2);

  store.getState().finishIntroToSetup('skipped');
  assert.equal(store.getState().appScreen, 'title');
  assert.equal(store.getState().activeModal, 'launch');
  assert.equal(store.getState().onboarding.introStatus, 'skipped');
  assert.equal(p22.useGameStore.getState().hasSavedCampaign, false);

  // Complete also reaches the identical Mission Setup contract and upgrades introStatus
  store.getState().openIntro('first-run', 'title', 0);
  store.getState().setIntroSceneIndex(5);
  store.getState().finishIntroToSetup('completed');
  assert.equal(store.getState().appScreen, 'title');
  assert.equal(store.getState().activeModal, 'launch');
  assert.equal(store.getState().onboarding.introStatus, 'completed');
  assert.equal(p22.useGameStore.getState().hasSavedCampaign, false);

  // Replay from Cockpit returns to Cockpit, never touches GameState or downgrades introStatus
  store.getState().enterCockpit();
  assert.equal(store.getState().appScreen, 'cockpit');

  const beforeGameState = p22.useGameStore.getState().gameState;
  store.getState().openIntro('replay', 'cockpit', 0);
  assert.equal(store.getState().appScreen, 'intro');
  store.getState().finishIntroToSetup('skipped');
  assert.equal(store.getState().appScreen, 'cockpit');
  assert.equal(store.getState().activeModal, null);
  assert.equal(store.getState().onboarding.introStatus, 'completed');
  assert.deepEqual(p22.useGameStore.getState().gameState, beforeGameState);

  // Ensure game/start works cleanly from Title -> Mission Setup -> Cockpit and updates hasSavedCampaign in gameStore
  const bundle = p22.loadContentBundle();
  const res = await p22.useGameStore.getState().dispatch({
    type: 'game/start',
    donkiProfileId: bundle.donki.samples[0].id,
    difficulty: 'standard',
    seed: 2050,
  });
  assert.equal(res.ok, true);
  p22.useUiStore.getState().enterCockpit();
  assert.equal(p22.useUiStore.getState().appScreen, 'cockpit');

  // Corrupt save preserves raw bytes fail-closed; clearCorruptedSaveForNewMission resets error cleanly
  const corruptStorage = createMemoryStorage({
    [p22.SAVE_STORAGE_KEY]: '{"schemaVersion":4,"corrupted":true',
  });
  const badLoad = p22.loadGameState(bundle, corruptStorage);
  assert.equal(badLoad.status, 'error');
  assert.equal(
    corruptStorage.getItem(p22.SAVE_STORAGE_KEY),
    '{"schemaVersion":4,"corrupted":true'
  );

  p22.useGameStore.getState().clearCorruptedSaveForNewMission();
  assert.equal(p22.useGameStore.getState().hasSavedCampaign, false);
  assert.equal(p22.useGameStore.getState().saveRecoveryError, null);
  assert.equal(p22.useGameStore.getState().lastSavedAt, null);

  store.getState().resetOnboarding();
  store.getState().enterTitleScreen();
});

test('Phase 2.2 TitleScreen, IntroCinematic, and App preserve accessibility, audio gate, and lazy loading contracts', () => {
  const appSrc = fs.readFileSync(path.join(simulationRoot, 'src/App.tsx'), 'utf8');
  const titleSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/onboarding/TitleScreen.tsx'),
    'utf8'
  );
  const introSrc = fs.readFileSync(
    path.join(simulationRoot, 'src/components/onboarding/IntroCinematic.tsx'),
    'utf8'
  );
  const cssSrc = fs.readFileSync(path.join(simulationRoot, 'src/hail.css'), 'utf8');

  // App lazy-loads Title -> Intro -> Cockpit & modals
  assert.match(appSrc, /lazyNamed.*IntroCinematic/s);
  assert.match(appSrc, /lazyNamed.*HailGameViewport/s);
  assert.match(appSrc, /appScreen === 'title'/);
  assert.match(appSrc, /appScreen === 'intro'/);
  assert.match(appSrc, /appScreen === 'cockpit'/);

  // TitleScreen binds required data-tour targets & fail-closed Save Recovery alert
  assert.match(titleSrc, /TOUR_TARGET_IDS\.TITLE_CONTINUE/);
  assert.match(titleSrc, /TOUR_TARGET_IDS\.TITLE_NEW_MISSION/);
  assert.match(titleSrc, /TOUR_TARGET_IDS\.TITLE_HOW_TO_PLAY/);
  assert.match(titleSrc, /role="alert"/);
  assert.match(titleSrc, /clearCorruptedSaveForNewMission/);
  assert.ok(!/useEffect\([^)]*startMusic/.test(titleSrc), 'TitleScreen must not autoplay music on mount');

  // IntroCinematic preserves role="region", SR DOM order (controls before aria-hidden visual), reduced-motion, and Escape skip
  assert.match(introSrc, /role="region"/);
  assert.match(introSrc, /<h2 className="phf-intro-heading">/);
  assert.match(introSrc, /phf-intro-visual" aria-hidden="true"/);
  const h2Pos = introSrc.indexOf('<h2 className="phf-intro-heading">');
  const controlsPos = introSrc.indexOf('phf-intro-controls');
  const visualPos = introSrc.indexOf('phf-intro-visual');
  assert.ok(h2Pos > 0 && controlsPos > h2Pos && visualPos > controlsPos);
  assert.match(introSrc, /prefers-reduced-motion: reduce/);
  assert.match(introSrc, /event\.key === 'Escape'/);
  assert.match(cssSrc, /\.phf-intro-visual\s*\{\s*order:\s*-1;/);
});
