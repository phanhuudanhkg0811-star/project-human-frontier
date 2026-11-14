import test from 'node:test';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import { simulationRoot } from '../scripts/load-simulation.mjs';

async function loadPhase16ContractBundle() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/config/releaseMeta.ts';
        export * from './src/i18n/dictionaries.ts';
        export * from './src/store/uiStore.ts';
        export * from './src/components/common/ErrorBoundary.tsx';
        export * from './src/components/common/SafeImage.tsx';
        export * from './src/components/modals/AboutCreditsModal.tsx';
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

const mod = await loadPhase16ContractBundle();

test('Phase 1.6 releaseMeta preserves Save v4 compatibility and exposes bilingual attributions', () => {
  assert.equal(mod.RELEASE_META.releaseVersion, '1.6.0-moon32');
  assert.equal(mod.RELEASE_META.schemaVersion, 4);
  assert.equal(mod.RELEASE_META.saveAppVersion, '1.4.0');
  assert.ok(mod.NASA_DATA_SOURCES.length >= 3);
  assert.ok(mod.THIRD_PARTY_CREDITS.length >= 3);

  for (const item of [...mod.NASA_DATA_SOURCES, ...mod.THIRD_PARTY_CREDITS]) {
    assert.ok(item.name.trim().length > 0);
    assert.ok(item.detailVi.trim().length > 0);
    assert.ok(item.detailEn.trim().length > 0);
  }
});

test('Phase 1.6 contract components and about modal state work safely under Node', () => {
  assert.equal(typeof mod.ErrorBoundary, 'function');
  assert.equal(typeof mod.SafeImage, 'function');
  assert.equal(typeof mod.AboutCreditsModal, 'function');

  mod.useUiStore.getState().openModal('about');
  assert.equal(mod.useUiStore.getState().activeModal, 'about');
  mod.useUiStore.getState().closeModal();
  assert.equal(mod.useUiStore.getState().activeModal, null);
});

test('Phase 1.6 errorBoundary and about i18n keys exist cleanly in VI and EN', () => {
  const requiredKeys = [
    'errorBoundary.eyebrow',
    'errorBoundary.title',
    'errorBoundary.description',
    'errorBoundary.exportSave',
    'errorBoundary.reload',
    'errorBoundary.resetSave',
    'about.title',
    'about.eyebrow',
    'about.versionHeading',
    'about.releaseLabel',
    'about.schemaLabel',
    'about.contentLabel',
    'about.modelLabel',
    'about.catalogLabel',
    'about.nasaHeading',
    'about.creditsHeading',
    'about.privacyNote',
    'about.exportSaveBtn',
  ];

  for (const key of requiredKeys) {
    assert.ok(mod.dictionaries.vi[key]?.trim().length > 0, `Missing VI key: ${key}`);
    assert.ok(mod.dictionaries.en[key]?.trim().length > 0, `Missing EN key: ${key}`);
  }
});
