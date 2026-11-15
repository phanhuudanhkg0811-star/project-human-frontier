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

const sol7State = (rover) => {
  const base = initialState();
  return {
    ...base,
    clock: { ...base.clock, sol: 7, phase: 'briefing' },
    events: { ...base.events, activeEventId: null, activeEvent: null, pendingFollowUps: [] },
    rover,
  };
};

const outboundMission = {
  expeditionId: 'regolith-field',
  status: 'outbound',
  scheduledSol: 6,
  launchedSol: 6,
  statusEnteredSol: 6,
  expectedReturnSol: 8,
  launchOperatorCrewId: 'geo',
  recoveryOperatorCrewId: null,
  equippedItems: [],
  incidents: [],
  signalLostSols: 0,
  recoveryDelaySols: 0,
  resumeStatus: null,
};

test('Sol 7 crisis adapts to Rover state instead of assuming an active expedition', () => {
  const idle = core.selectNextSolEvent(sol7State({ activeMission: null, missionHistory: [] }), bundle).activeEvent;
  assert.ok(idle, 'Sol 7 must always have an event');
  const idleEvent = bundle.events.find((event) => event.id === idle.eventId);
  assert.ok(idleEvent?.mandatory, 'Sol 7 event stays mandatory');
  assert.ok(
    !idleEvent.choices.some((choice) => choice.effects.some((eff) => eff.kind === 'rover-action')),
    'station-only Sol 7 variant must not carry rover-action effects that silently no-op'
  );

  const travelling = core.selectNextSolEvent(
    sol7State({ activeMission: outboundMission, missionHistory: [] }),
    bundle
  ).activeEvent;
  assert.equal(travelling?.eventId, 'sol7-golden-comms-crisis');
});

