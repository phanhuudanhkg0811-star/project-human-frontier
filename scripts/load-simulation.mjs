import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

export const simulationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function loadSimulation() {
  const result = await esbuild.build({ stdin: { contents: `
    export * from './src/simulation/campaignRunner.ts';
    export * from './src/simulation/replay.ts';
    export * from './src/simulation/policies.ts';
    export * from './src/schemas/contracts.ts';
    export * from './src/domain/campaignEvaluator.ts';
    export * from './src/domain/campaignSelectors.ts';
    export * from './src/domain/endSolResolver.ts';
    export * from './src/domain/orchestrator.ts';
    export * from './src/domain/invariants.ts';
    export * from './src/persistence/saveAdapter.ts';
    export * from './src/persistence/replayRecorder.ts';
  `, loader: 'ts', resolveDir: simulationRoot }, bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
