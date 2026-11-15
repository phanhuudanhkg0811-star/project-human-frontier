import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiled = await esbuild.build({
  stdin: { contents: `
    export * from './src/schemas/contracts.ts';
    export * from './src/domain/eventSelectors.ts';
    export * from './src/domain/eventEngine.ts';
    export * from './src/domain/orchestrator.ts';
    export * from './src/domain/spaceWeather.ts';
    export * from './src/components/modals/MissionDialog.tsx';
    export { createElement } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';
  `, resolveDir: root, loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', target: 'es2022',
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  createRequire(import.meta.url), loaded, loaded.exports,
);
const core = loaded.exports;
const bundle = core.loadContentBundle();
const initialState = () => core.createInitialGameState(bundle, { runId: 'audit-fixture', seed: 7070 });

test('Event choice previews list each resource delta exactly once (no effectsSummary echo)', () => {
  for (const event of bundle.events) {
    const previews = core.selectEventChoicePreviews(initialState(), event.id, bundle);
    for (const pv of previews) {
      for (const key of Object.keys(pv.resourceDeltas)) {
        assert.ok(
          !pv.effectsSummary.some((line) => line.startsWith(`${key}:`)),
          `${event.id}/${pv.choice.id}: resource ${key} appears in both resourceDeltas and effectsSummary`
        );
      }
      assert.ok(
        !pv.effectsSummary.some((line) => line.startsWith('Science:')),
        `${event.id}/${pv.choice.id}: science delta echoed in effectsSummary`
      );
    }
  }
});
