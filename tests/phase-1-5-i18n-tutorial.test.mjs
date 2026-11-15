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
        export * from './src/audio/soundEngine.ts';
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
    assert.match(brief.sourceUrl, /^https:\/\//, `${brief.id} missing HTTPS sourceUrl`);
  }
});

test('Phase 1.5 catalogs include bilingual English fields for recipes, crew, logistics packs, and difficulties', () => {
  const bundle = mod.loadContentBundle();
  for (const item of bundle.recipes.items) {
    assert.ok(
      typeof item.effectSummaryEn === 'string' && item.effectSummaryEn.trim().length > 0,
      `recipe ${item.id} missing effectSummaryEn`
    );
  }
  for (const member of bundle.crewCatalog) {
    assert.ok(
      typeof member.perkDescriptionEn === 'string' && member.perkDescriptionEn.trim().length > 0,
      `crew ${member.id} missing perkDescriptionEn`
    );
  }
  for (const pack of bundle.balance.logistics.packs) {
    assert.ok(typeof pack.nameEn === 'string' && pack.nameEn.trim().length > 0, `pack ${pack.id} missing nameEn`);
    assert.ok(typeof pack.summaryEn === 'string' && pack.summaryEn.trim().length > 0, `pack ${pack.id} missing summaryEn`);
  }
  for (const diff of Object.values(bundle.campaign.difficultyProfiles)) {
    assert.ok(typeof diff.labelEn === 'string' && diff.labelEn.trim().length > 0, `difficulty ${diff.id} missing labelEn`);
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
  assert.equal(store.getState().locale, 'en');
  assert.equal(store.getState().audioMuted, false);
  assert.equal(store.getState().tutorialCompleted, false);

  store.getState().setLocale('vi');
  store.getState().toggleAudioMute();
  store.getState().setTutorialStep(3);
  store.getState().openModal('tutorial');

  assert.equal(store.getState().locale, 'vi');
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
  assert.equal(store.getState().locale, 'vi');
  assert.equal(store.getState().audioMuted, true);
  assert.equal(store.getState().tutorialCompleted, true);

  store.getState().resetTutorial();
  store.getState().setLocale('en');
  store.getState().setAudioMuted(false);
  assert.equal(store.getState().tutorialCompleted, false);
});

test('Phase 1.5 procedural audio contract is a safe no-op without browser Web Audio', () => {
  assert.doesNotThrow(() => {
    mod.syncAmbientAudio({ isLunarNight: true, weatherLevel: 'extreme', muted: true });
    mod.playSfx('alert');
    mod.playSfx('victory');
    mod.disposeSoundEngine();
  });
});

test('Phase 1.5 localizeDomainText translates engine errors, Sol logs, CAPCOM replies, and event logs in EN mode', () => {
  const bundle = mod.loadContentBundle();
  const sampleErr = 'Trọng phải Fit và rảnh để trực tiếp dùng Medkit.';
  assert.equal(mod.localizeDomainText(sampleErr, 'vi', bundle), sampleErr);
  assert.equal(
    mod.localizeDomainText(sampleErr, 'en', bundle),
    'Trọng must be Fit and idle to directly administer a Medkit.'
  );

  const solLog = 'Kết thúc Sol 1: Pin 60 kWh, O₂ 66.6 kg, Nước 70 L.';
  assert.equal(
    mod.localizeDomainText(solLog, 'en', bundle),
    'End of Sol 1: Battery 60 kWh, O₂ 66.6 kg, Water 70 L.'
  );

  const initLog = 'Artemis Lunar Base đi vào vận hành. Chuẩn bị cho chu kỳ 32 Sol và Đêm Trăng sắp tới.';
  assert.match(mod.localizeDomainText(initLog, 'en', bundle), /^Artemis Lunar Base commissioned/);

  const firstEvent = bundle.events[0];
  const firstChoice = firstEvent.choices[0];
  assert.equal(mod.localizeDomainText(firstChoice.log, 'en', bundle), firstChoice.logEn);

  const expiredNote = `Sự kiện "${firstEvent.title}" đã quá hạn ở cuối Sol 3.`;
  assert.equal(
    mod.localizeDomainText(expiredNote, 'en', bundle),
    `Event "${firstEvent.titleEn}" expired at the end of Sol 3.`
  );
});
