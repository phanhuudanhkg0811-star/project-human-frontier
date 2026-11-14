import test from 'node:test';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import { simulationRoot } from '../scripts/load-simulation.mjs';

async function loadSaveRecoveryBundle() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/persistence/saveAdapter.ts';
        export * from './src/schemas/contracts.ts';
        export * from './src/domain/orchestrator.ts';
        export * from './src/i18n/domainText.ts';
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

const mod = await loadSaveRecoveryBundle();
const bundle = mod.loadContentBundle();

test('Phase 1.6 save recovery fails closed on corrupt JSON and tampered checksum while preserving original bytes', () => {
  assert.deepEqual(mod.loadGameState(bundle, createMemoryStorage()), { status: 'empty' });
  assert.deepEqual(mod.loadGameState(bundle, null), { status: 'empty' });

  const corruptRaw = '{bad-json: "moon32-corrupt-payload"';
  const corruptStorage = createMemoryStorage({ [mod.SAVE_STORAGE_KEY]: corruptRaw });
  const corruptRes = mod.loadGameState(bundle, corruptStorage);
  assert.equal(corruptRes.status, 'error');
  assert.equal(corruptRes.error.code, 'E_SAVE_CORRUPTED');
  assert.equal(corruptRes.error.recoverable, true);
  assert.equal(corruptStorage.getItem(mod.SAVE_STORAGE_KEY), corruptRaw);

  const fresh = mod.createInitialGameState(bundle, { difficulty: 'cadet', seed: 205066 });
  const validEnvelope = mod.buildSaveEnvelope(fresh, '2026-11-14T12:00:00.000Z');
  const tamperedRaw = JSON.stringify({
    ...validEnvelope,
    checksum: '0'.repeat(64),
  });
  const tamperedStorage = createMemoryStorage({ [mod.SAVE_STORAGE_KEY]: tamperedRaw });
  const tamperedRes = mod.loadGameState(bundle, tamperedStorage);
  assert.equal(tamperedRes.status, 'error');
  assert.equal(tamperedRes.error.code, 'E_SAVE_CORRUPTED');
  assert.equal(tamperedStorage.getItem(mod.SAVE_STORAGE_KEY), tamperedRaw);

  const unsupportedRaw = JSON.stringify({
    ...validEnvelope,
    schemaVersion: 99,
  });
  const unsupportedStorage = createMemoryStorage({ [mod.SAVE_STORAGE_KEY]: unsupportedRaw });
  const unsupportedRes = mod.loadGameState(bundle, unsupportedStorage);
  assert.equal(unsupportedRes.status, 'error');
  assert.equal(unsupportedRes.error.code, 'E_CONTRACT_MISMATCH');
  assert.equal(unsupportedStorage.getItem(mod.SAVE_STORAGE_KEY), unsupportedRaw);
});

test('Phase 1.6 legacy v3 save upgrades to v4 safely, keeps pre-v4 backup, and clean reset recovers', () => {
  const stateV4 = mod.createInitialGameState(bundle, { difficulty: 'cadet', seed: 205077 });
  const stateV3 = {
    ...stateV4,
    schemaVersion: 3,
    campaign: {
      ...stateV4.campaign,
      outcome: null,
    },
  };
  const unsignedV3 = {
    schemaVersion: 3,
    savedAt: '2026-11-14T10:00:00.000Z',
    appVersion: mod.APP_VERSION,
    contentVersion: stateV3.contentVersion,
    modelVersion: stateV3.modelVersion,
    catalogVersion: stateV3.catalogVersion,
    state: stateV3,
  };
  const v3Raw = JSON.stringify({
    ...unsignedV3,
    checksum: mod.computeEnvelopeChecksum(unsignedV3),
  });

  const storage = createMemoryStorage({ [mod.SAVE_STORAGE_KEY]: v3Raw });
  const migratedRes = mod.loadGameState(bundle, storage);
  assert.equal(
    migratedRes.status,
    'ok',
    migratedRes.status === 'error' ? `${migratedRes.error.code}: ${migratedRes.error.message}` : undefined
  );
  assert.equal(migratedRes.state.schemaVersion, 4);
  assert.equal(migratedRes.envelope.appVersion, mod.APP_VERSION);
  assert.ok(typeof migratedRes.migrationNotice === 'string' && migratedRes.migrationNotice.length > 0);
  assert.equal(storage.getItem(`${mod.SAVE_STORAGE_KEY}:pre-v4`), v3Raw);

  mod.clearSavedGame(storage);
  assert.equal(storage.getItem(mod.SAVE_STORAGE_KEY), null);
  const resetState = mod.createInitialGameState(bundle, { difficulty: 'standard', seed: 205088 });
  const saveOk = mod.saveGameState(resetState, storage, '2026-11-14T12:05:00.000Z');
  assert.equal(saveOk.ok, true);
  const reloaded = mod.loadGameState(bundle, storage);
  assert.equal(
    reloaded.status,
    'ok',
    reloaded.status === 'error' ? `${reloaded.error.code}: ${reloaded.error.message}` : undefined
  );
  assert.equal(reloaded.state.clock.sol, 1);
  assert.equal(reloaded.state.campaign.seed, 205088);
  assert.equal(reloaded.state.campaign.difficulty, 'standard');
});

test('Phase 1.6 localizeDomainText translates common Vietnamese domain errors and status lines cleanly in EN', () => {
  assert.equal(
    mod.localizeDomainText('Hệ thống đang hoạt động 100%.', 'en', bundle),
    'System is already operating at 100%.'
  );
  assert.equal(
    mod.localizeDomainText('Hệ thống đang hoạt động 100%.', 'vi', bundle),
    'Hệ thống đang hoạt động 100%.'
  );
});
