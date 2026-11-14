import test from 'node:test';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import { simulationRoot } from '../scripts/load-simulation.mjs';

async function loadUiAndI18nBundle() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/i18n/dictionaries.ts';
        export * from './src/i18n/useI18n.ts';
        export * from './src/store/uiStore.ts';
        export * from './src/data/tutorialSteps.ts';
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
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const mod = await loadUiAndI18nBundle();

function extractPlaceholders(value) {
  return [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
}

test('Phase 1.5 i18n dictionaries maintain 100% VI/EN key parity, non-empty strings, and token parity', () => {
  const viKeys = Object.keys(mod.dictionaries.vi).sort();
  const enKeys = Object.keys(mod.dictionaries.en).sort();

  assert.deepEqual(enKeys, viKeys, 'EN dictionary keys must match VI dictionary keys 1:1');

  for (const key of viKeys) {
    const viVal = mod.dictionaries.vi[key];
    const enVal = mod.dictionaries.en[key];
    assert.ok(typeof viVal === 'string' && viVal.trim().length > 0, `VI key "${key}" must be non-empty`);
    assert.ok(typeof enVal === 'string' && enVal.trim().length > 0, `EN key "${key}" must be non-empty`);
    assert.deepEqual(
      extractPlaceholders(enVal),
      extractPlaceholders(viVal),
      `Placeholder tokens must match between VI and EN for key "${key}"`
    );
  }
});

test('Phase 1.5 translate() interpolates tokens and falls back safely, and E2E VI labels stay intact', () => {
  assert.equal(mod.translate('vi', 'common.closeDialog'), 'Đóng cửa sổ');
  assert.equal(mod.translate('en', 'common.closeDialog'), 'Close dialog');
  assert.equal(mod.translate('vi', 'endDay.endSolBtn', { sol: 7 }), 'Gạt cần Chốt Sol 7 (End-Sol)');
  assert.equal(mod.translate('en', 'endDay.endSolBtn', { sol: 7 }), 'Pull End-Sol 7 Lever');
  assert.equal(mod.translate('en', 'nonexistent.key'), 'nonexistent.key');

  assert.equal(mod.pickText('Tiêu đề VI', 'English Title', 'en'), 'English Title');
  assert.equal(mod.pickText('Tiêu đề VI', 'English Title', 'vi'), 'Tiêu đề VI');
  assert.equal(mod.pickText('Tiêu đề VI', '   ', 'en'), 'Tiêu đề VI');
});

test('Phase 1.5 NASA science briefs include bilingual titleEn and contentEn for all 10 entries', () => {
  const bundle = mod.loadContentBundle();
  assert.equal(bundle.briefs.length, 10);
  for (const brief of bundle.briefs) {
    assert.ok(typeof brief.titleEn === 'string' && brief.titleEn.trim().length > 0, `${brief.id} missing titleEn`);
    assert.ok(typeof brief.contentEn === 'string' && brief.contentEn.trim().length > 0, `${brief.id} missing contentEn`);
  }
});

test('Phase 1.5 tutorialSteps covers 5 complete bilingual onboarding steps', () => {
  assert.equal(mod.TUTORIAL_STEPS.length, 5);
  mod.TUTORIAL_STEPS.forEach((step, idx) => {
    assert.equal(step.stepNumber, idx + 1);
    for (const loc of ['vi', 'en']) {
      assert.ok(step.title[loc].trim().length > 0);
      assert.ok(step.cockpitArea[loc].trim().length > 0);
      assert.ok(step.summary[loc].trim().length > 0);
      assert.ok(step.stemTip[loc].trim().length > 0);
      assert.ok(Array.isArray(step.checklist[loc]) && step.checklist[loc].length >= 2);
    }
  });
});

test('Phase 1.5 useUiStore works safely under Node without window and preserves prefs across resetCampaignUi', () => {
  const store = mod.useUiStore;
  assert.equal(store.getState().locale, 'vi');
  assert.equal(store.getState().audioMuted, false);
  assert.equal(store.getState().tutorialCompleted, false);

  store.getState().setLocale('en');
  store.getState().toggleAudioMute();
  store.getState().setTutorialStep(3);
  store.getState().openModal('tutorial');

  assert.equal(store.getState().locale, 'en');
  assert.equal(store.getState().audioMuted, true);
  assert.equal(store.getState().tutorialStep, 3);
  assert.equal(store.getState().activeModal, 'tutorial');

  store.getState().completeTutorial();
  assert.equal(store.getState().tutorialCompleted, true);
  assert.equal(store.getState().tutorialStep, 0);
  assert.equal(store.getState().activeModal, null);

  store.getState().setTutorialStep(-4);
  assert.equal(store.getState().tutorialStep, 0);

  store.getState().openModal('starlog');
  store.getState().resetCampaignUi();
  assert.equal(store.getState().activeModal, null);
  assert.equal(store.getState().locale, 'en');
  assert.equal(store.getState().audioMuted, true);
  assert.equal(store.getState().tutorialCompleted, true);

  store.getState().resetTutorial();
  store.getState().setLocale('vi');
  store.getState().setAudioMuted(false);
  assert.equal(store.getState().tutorialCompleted, false);
});
