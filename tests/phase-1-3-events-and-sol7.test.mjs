import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadCoreModules() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/schemas/contracts.ts';
        export * from './src/domain/canonicalJson.ts';
        export * from './src/domain/prng.ts';
        export * from './src/domain/invariants.ts';
        export * from './src/domain/spaceWeather.ts';
        export * from './src/domain/eventEngine.ts';
        export * from './src/domain/eventSelectors.ts';
        export * from './src/domain/endSolResolver.ts';
        export * from './src/domain/orchestrator.ts';
        export * from './src/domain/selectors.ts';
        export * from './src/persistence/saveAdapter.ts';
      `,
      resolveDir: rootDir,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  const code = result.outputFiles[0].text;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
  return import(dataUrl);
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

const core = await loadCoreModules();

test('Phase 1.3 catalog contains 23 VI/EN events with valid references and Deck 1-4 coverage', () => {
  const bundle = core.loadContentBundle();
  assert.equal(bundle.events.length, 23);
  assert.ok(bundle.briefs.length >= 10);

  const eventIds = new Set(bundle.events.map((e) => e.id));
  assert.equal(eventIds.size, 23);

  const writtenFlags = new Set();
  const readFlags = new Set();
  for (const ev of bundle.events) {
    for (const cond of ev.when) {
      if (cond.flagSet) readFlags.add(cond.flagSet);
      if (cond.flagUnset) readFlags.add(cond.flagUnset);
    }
    for (const ch of ev.choices) {
      for (const eff of ch.effects) {
        if (eff.kind === 'set-flag') writtenFlags.add(eff.key);
      }
    }
  }
  for (const key of readFlags) {
    assert.ok(writtenFlags.has(key), `Event trigger reads unwritten flag "${key}"`);
  }

  const briefIds = new Set(bundle.briefs.map((b) => b.id));
  for (const ev of bundle.events) {
    assert.ok(ev.title.length > 0 && ev.titleEn && ev.titleEn.length > 0, `Missing VI/EN title on ${ev.id}`);
    assert.ok(ev.prompt.length > 0 && ev.promptEn && ev.promptEn.length > 0, `Missing VI/EN prompt on ${ev.id}`);
    assert.ok(briefIds.has(ev.scienceBriefId), `Unknown scienceBriefId "${ev.scienceBriefId}" on ${ev.id}`);

    for (const ch of ev.choices) {
      assert.ok(ch.label.length > 0 && ch.labelEn && ch.labelEn.length > 0, `Missing VI/EN label on ${ev.id}.${ch.id}`);
      assert.ok(ch.log.length > 0 && ch.logEn && ch.logEn.length > 0, `Missing VI/EN log on ${ev.id}.${ch.id}`);
      for (const eff of ch.effects) {
        if (eff.kind === 'schedule-follow-up') {
          assert.ok(
            eventIds.has(eff.eventId),
            `Follow-up target "${eff.eventId}" in ${ev.id}.${ch.id} does not exist in events.json`
          );
        }
      }
    }
  }
});

test('Phase 1.3 eventEngine enforces AND/OR trigger rules, priority + sorted ID RNG, repeatPolicy, and atomic rollback', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 424242 });

  // 1. Atomic rollback: if second effect in a choice fails, first effect must NOT leak into state
  const atomicEvent = {
    ...bundle.events[0],
    id: 'test-atomic-event',
    when: [{ sol: 1 }],
    choices: [
      {
        id: 'fail-second-effect',
        label: 'Cộng nước rồi trừ 999 Phụ tùng',
        labelEn: 'Add water then spend 999 Parts',
        effects: [
          { kind: 'resource', resource: 'waterL', delta: 20 },
          { kind: 'resource', resource: 'partsKg', delta: -999 },
        ],
        log: 'Không bao giờ tới đây',
        logEn: 'Should never succeed',
      },
    ],
  };
  const customBundle = { ...bundle, events: [atomicEvent] };
  const startState = {
    ...base,
    events: {
      ...base.events,
      activeEventId: 'test-atomic-event',
      activeEvent: { eventId: 'test-atomic-event', triggeredAtSol: 1, deadlineSol: 1, context: {} },
    },
  };
  const failedRes = core.dispatchDomainCommand(
    startState,
    { type: 'event/resolve', eventId: 'test-atomic-event', choiceId: 'fail-second-effect' },
    customBundle
  );
  assert.equal(failedRes.ok, false);
  assert.equal(failedRes.error.code, 'E_INSUFFICIENT_RESOURCE');
  assert.equal(failedRes.state.resources.waterL, base.resources.waterL);
  assert.equal(failedRes.state.events.activeEventId, 'test-atomic-event');

  // 2. Priority + sorted ID tie-breaking independence from JSON order
  const evA = {
    ...bundle.events[0],
    id: 'evt-alpha',
    priority: 80,
    weight: 50,
    repeatPolicy: 'repeatable',
    when: [{ sol: 2 }],
  };
  const evB = {
    ...bundle.events[0],
    id: 'evt-beta',
    priority: 80,
    weight: 50,
    repeatPolicy: 'repeatable',
    when: [{ sol: 2 }],
  };
  const sol2State = {
    ...base,
    clock: { sol: 2, phase: 'briefing', resolutionIndex: 1 },
    dailyPlan: { ...base.dailyPlan, sol: 2 },
    events: { ...base.events, activeEventId: null, activeEvent: null },
  };
  const pickOrder1 = core.selectNextSolEvent(sol2State, { ...bundle, events: [evA, evB] });
  const pickOrder2 = core.selectNextSolEvent(sol2State, { ...bundle, events: [evB, evA] });
  assert.equal(pickOrder1.activeEvent?.eventId, pickOrder2.activeEvent?.eventId);

  // 3. Cooldown repeatPolicy blocks re-trigger before lastSettledSol + cooldownSols
  const cooldownEv = {
    ...bundle.events[0],
    id: 'evt-cooldown-test',
    priority: 99,
    weight: 100,
    repeatPolicy: 'cooldown',
    cooldownSols: 3,
    when: [{ solMin: 1, solMax: 10 }],
  };
  const afterSettledAtSol2 = {
    ...sol2State,
    clock: { sol: 4, phase: 'briefing', resolutionIndex: 3 },
    dailyPlan: { ...sol2State.dailyPlan, sol: 4 },
    events: {
      activeEventId: null,
      activeEvent: null,
      resolvedEventIds: ['evt-cooldown-test'],
      occurrenceHistory: [
        {
          eventId: 'evt-cooldown-test',
          triggeredSol: 2,
          settledSol: 2,
          outcome: 'resolved',
          choiceId: 'hold-parts',
        },
      ],
      flags: {},
      pendingFollowUps: [],
    },
  };
  assert.equal(core.canEventRepeat(afterSettledAtSol2, cooldownEv), false);
  const atSol5 = {
    ...afterSettledAtSol2,
    clock: { sol: 5, phase: 'briefing', resolutionIndex: 4 },
    dailyPlan: { ...afterSettledAtSol2.dailyPlan, sol: 5 },
  };
  assert.equal(core.canEventRepeat(atSol5, cooldownEv), true);
});

test('Phase 1.3 mandatory events preempt deferred optional events without dropping expiration effects', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 303030 });

  // Sol 2 has non-mandatory `sol2-solar-particles` with deadlineOffsetSols: 1 (deadlineSol = 3)
  const sol2State = {
    ...base,
    clock: { sol: 2, phase: 'briefing', resolutionIndex: 1 },
    dailyPlan: { ...base.dailyPlan, sol: 2 },
    events: {
      activeEventId: 'sol2-solar-particles',
      activeEvent: {
        eventId: 'sol2-solar-particles',
        triggeredAtSol: 2,
        deadlineSol: 3,
        context: {},
      },
      resolvedEventIds: ['sol1-arrival-check'],
      occurrenceHistory: [
        {
          eventId: 'sol1-arrival-check',
          triggeredSol: 1,
          settledSol: 1,
          outcome: 'resolved',
          choiceId: 'hold-parts',
        },
      ],
      flags: {},
      pendingFollowUps: [],
    },
  };

  // Can advance from briefing -> engineering -> comms -> rationing without resolving immediately
  assert.equal(core.selectCanAdvancePhase(sol2State, bundle).allowed, true);
  const eng = core.dispatchDomainCommand(sol2State, { type: 'phase/advance' }, bundle);
  assert.equal(eng.ok, true);
  assert.equal(eng.state.clock.phase, 'engineering');
  assert.equal(eng.state.events.activeEventId, 'sol2-solar-particles');

  const comms = core.dispatchDomainCommand(eng.state, { type: 'phase/advance' }, bundle);
  const rat = core.dispatchDomainCommand(comms.state, { type: 'phase/advance' }, bundle);
  assert.equal(rat.state.clock.phase, 'rationing');

  // End Sol 2: deadlineSol is 3, so the optional event remains active during Debrief.
  const endSol2 = core.dispatchDomainCommand(rat.state, { type: 'sol/end' }, bundle);
  assert.equal(endSol2.ok, true);
  assert.equal(endSol2.state.events.activeEventId, 'sol2-solar-particles');

  // Starting Sol 3 must not let the open optional event hide the mandatory Airlock alert.
  const startSol3 = core.dispatchDomainCommand(endSol2.state, { type: 'debrief/dismiss' }, bundle);
  assert.equal(startSol3.ok, true);
  assert.equal(startSol3.state.clock.sol, 3);
  assert.equal(startSol3.state.events.activeEventId, 'sol3-airlock-seal-alert');
  const expiredEntry = startSol3.state.events.occurrenceHistory.find(
    (occ) => occ.eventId === 'sol2-solar-particles'
  );
  assert.ok(expiredEntry);
  assert.equal(expiredEntry.outcome, 'expired');
  assert.equal(expiredEntry.settledSol, 3);
  assert.equal(startSol3.state.crew.cmd.health, endSol2.state.crew.cmd.health - 5);
  assert.equal(startSol3.state.crew.cmd.morale, endSol2.state.crew.cmd.morale - 5);
});

test('Crew injury hysteresis is identical for event health effects', () => {
  const bundle = core.loadContentBundle();
  const base = core.createInitialGameState(bundle, { seed: 404040 });
  const injured = {
    ...base,
    crew: {
      ...base.crew,
      cmd: { ...base.crew.cmd, health: 20, condition: 'injured' },
    },
  };

  const at50 = core.applyEventEffectsAtomic(
    injured,
    [{ kind: 'crew', target: 'cmd', healthDelta: 30 }],
    bundle,
    { mode: 'choice', sourceEventId: 'test-hysteresis', sourceChoiceId: 'heal-to-50' }
  );
  assert.equal(at50.ok, true);
  assert.equal(at50.state.crew.cmd.health, 50);
  assert.equal(at50.state.crew.cmd.condition, 'injured');

  const at64 = core.applyEventEffectsAtomic(
    at50.state,
    [{ kind: 'crew', target: 'cmd', healthDelta: 14 }],
    bundle,
    { mode: 'choice', sourceEventId: 'test-hysteresis', sourceChoiceId: 'heal-to-64' }
  );
  assert.equal(at64.ok, true);
  assert.equal(at64.state.crew.cmd.condition, 'injured');

  const at65 = core.applyEventEffectsAtomic(
    at64.state,
    [{ kind: 'crew', target: 'cmd', healthDelta: 1 }],
    bundle,
    { mode: 'choice', sourceEventId: 'test-hysteresis', sourceChoiceId: 'heal-to-65' }
  );
  assert.equal(at65.ok, true);
  assert.equal(at65.state.crew.cmd.condition, 'fit');
});

test('Golden Sol 7 fixture: Choice A (25.0L / 2.0kWh + Regolith completes Sol 8) vs Choice B (41.9L / 0.0kWh + Regolith fails + Save/Reload)', () => {
  const bundle = core.loadContentBundle();
  const fixturePath = path.join(rootDir, 'tests', 'fixtures', 'sol7-save-rover.json');
  const rawFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  // Preserve the Phase 1.3 golden fixture as a legacy save; only migrate its contract.
  const sol7State = core.migrateSaveV3ToV4(rawFixture, bundle);
  core.assertGameState(sol7State, bundle);

  // Verify Golden Sol 7 initial conditions
  assert.equal(sol7State.clock.sol, 7);
  assert.equal(sol7State.resources.waterL, 35);
  assert.equal(sol7State.resources.wasteWaterL, 10);
  assert.equal(sol7State.resources.batteryKWh, 8);
  assert.equal(sol7State.events.activeEventId, 'sol7-golden-comms-crisis');
  assert.equal(core.selectAvailableCrew(sol7State).length, 1);
  assert.equal(core.selectAvailableCrew(sol7State)[0].id, 'geo');

  // --- BRANCH A: Save Rover Link (-2 kWh Battery, WRS OFF) ---
  const resA = core.dispatchDomainCommand(
    sol7State,
    { type: 'event/resolve', eventId: 'sol7-golden-comms-crisis', choiceId: 'save-rover-link' },
    bundle
  );
  assert.equal(resA.ok, true);
  assert.equal(resA.state.resources.batteryKWh, 6);
  assert.equal(resA.state.dailyPlan.wrsEnabled, false);
  assert.equal(resA.state.events.flags.sol7_saved_rover, true);

  const aEng = core.dispatchDomainCommand(resA.state, { type: 'phase/advance' }, bundle);
  const aComms = core.dispatchDomainCommand(aEng.state, { type: 'phase/advance' }, bundle);
  const aRat = core.dispatchDomainCommand(aComms.state, { type: 'phase/advance' }, bundle);
  const aEndSol7 = core.dispatchDomainCommand(aRat.state, { type: 'sol/end' }, bundle);
  assert.equal(aEndSol7.ok, true);
  assert.equal(aEndSol7.state.resources.waterL, 25);
  assert.equal(aEndSol7.state.resources.batteryKWh, 2);
  assert.equal(aEndSol7.state.rover.activeMission?.expeditionId, 'regolith-field');
  assert.equal(aEndSol7.state.rover.activeMission?.status, 'exploring');
  assert.equal(aEndSol7.state.rover.activeMission?.travelTicksCompleted, 2);
  assert.ok(aEndSol7.state.debrief.lastSummary?.debriefContext);
  assert.equal(aEndSol7.state.debrief.lastSummary?.debriefContext?.reasonTag, 'event-choice');

  // Advance through Sol 8 -> Regolith Field completes at End of Sol 8, and follow-up triggers on Sol 9
  const aSol8Start = core.dispatchDomainCommand(aEndSol7.state, { type: 'debrief/dismiss' }, bundle);
  assert.equal(aSol8Start.ok, true);
  assert.equal(aSol8Start.state.clock.sol, 8);
  const aSol8Eng = core.dispatchDomainCommand(aSol8Start.state, { type: 'phase/advance' }, bundle);
  const aSol8Comms = core.dispatchDomainCommand(aSol8Eng.state, { type: 'phase/advance' }, bundle);
  const aSol8Rat = core.dispatchDomainCommand(aSol8Comms.state, { type: 'phase/advance' }, bundle);
  const aEndSol8 = core.dispatchDomainCommand(aSol8Rat.state, { type: 'sol/end' }, bundle);
  assert.equal(aEndSol8.ok, true, aEndSol8.error?.message);
  assert.ok(core.selectCompletedExpeditions(aEndSol8.state).includes('regolith-field'));
  assert.ok(core.selectRoverSamples(aEndSol8.state).includes('regolith_mineral_sample'));

  const aSol9Start = core.dispatchDomainCommand(aEndSol8.state, { type: 'debrief/dismiss' }, bundle);
  assert.equal(aSol9Start.ok, true);
  assert.equal(aSol9Start.state.events.activeEventId, 'evt-rover2-aftermath');

  // --- BRANCH B: WRS processes 10.0 L stored + 8.8 L same-Sol greywater -> 41.9 L water, Regolith fails ---
  const resB = core.dispatchDomainCommand(
    sol7State,
    { type: 'event/resolve', eventId: 'sol7-golden-comms-crisis', choiceId: 'prioritize-wrs' },
    bundle
  );
  assert.equal(resB.ok, true);
  assert.equal(resB.state.dailyPlan.wrsEnabled, true);
  assert.equal(resB.state.events.flags.sol7_prioritized_station, true);
  assert.equal(resB.state.rover.activeMission, null);
  assert.equal(
    resB.state.rover.missionHistory.find((m) => m.expeditionId === 'regolith-field')?.outcome,
    'failed'
  );

  const bEng = core.dispatchDomainCommand(resB.state, { type: 'phase/advance' }, bundle);
  const bComms = core.dispatchDomainCommand(bEng.state, { type: 'phase/advance' }, bundle);
  const bRat = core.dispatchDomainCommand(bComms.state, { type: 'phase/advance' }, bundle);
  const bEndSol7 = core.dispatchDomainCommand(bRat.state, { type: 'sol/end' }, bundle);
  assert.equal(bEndSol7.ok, true);
  assert.equal(bEndSol7.state.debrief.lastSummary?.checkpoint.wrsProcessedWasteWaterL, 18.8);
  assert.equal(bEndSol7.state.debrief.lastSummary?.wrsRecoveredWaterL, 16.9);
  assert.equal(bEndSol7.state.resources.waterL, 41.9);
  assert.equal(bEndSol7.state.resources.batteryKWh, 0);

  // Save & Reload round-trip on Branch B
  const storage = createMemoryStorage();
  const saved = core.saveGameState(bEndSol7.state, storage, '2026-11-14T16:00:00Z');
  assert.equal(saved.ok, true);
  const loaded = core.loadGameState(bundle, storage);
  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.envelope.schemaVersion, 4);
  assert.equal(loaded.state.resources.waterL, 41.9);
  assert.equal(loaded.state.resources.batteryKWh, 0);
  assert.equal(loaded.state.events.flags.sol7_prioritized_station, true);
});

test('Deterministic 32-Sol Moon campaign replay reaches Lunar Night, Sunrise, and Sol 32 Victory with identical state checksum', () => {
  const bundle = core.loadContentBundle();

  function runCampaign(seed) {
    let state = core.createInitialGameState(bundle, { seed, difficulty: 'cadet' });
    const seenEvents = [];

    for (let sol = 1; sol <= 32; sol += 1) {
      assert.equal(state.clock.sol, sol);

      // Resolve active event at briefing if any
      if (state.events.activeEventId) {
        const activeId = state.events.activeEventId;
        seenEvents.push({ sol, eventId: activeId });
        const previews = core.selectEventChoicePreviews(state, activeId, bundle);
        const allowedChoice = previews.find((p) => p.allowed) ?? previews[0];
        const resolved = core.dispatchDomainCommand(
          state,
          { type: 'event/resolve', eventId: activeId, choiceId: allowedChoice.choice.id },
          bundle
        );
        assert.equal(resolved.ok, true, `Failed resolving ${activeId} on Sol ${sol}`);
        state = resolved.state;
      }

      // Briefing -> Engineering
      let step = core.dispatchDomainCommand(state, { type: 'phase/advance' }, bundle);
      assert.equal(step.ok, true);
      state = step.state;

      // Engineering -> Comms
      step = core.dispatchDomainCommand(state, { type: 'phase/advance' }, bundle);
      assert.equal(step.ok, true);
      state = step.state;

      // Order cargo resupply when available to sustain water/battery/MRE through Lunar Night
      if (state.logistics.activeOrder === null && state.logistics.padCooldownSols === 0 && sol <= 26) {
        const cargoSlots =
          sol >= 10 && sol <= 22
            ? { 'water-pack': 2, 'power-parts-pack': 1, 'food-med-pack': 1 }
            : { 'water-pack': 2, 'oxygen-pack': 1, 'food-med-pack': 1 };
        const cargoRes = core.dispatchDomainCommand(
          state,
          { type: 'comms/order-cargo', slots: cargoSlots },
          bundle
        );
        assert.equal(cargoRes.ok, true);
        state = cargoRes.state;
      }

      // Comms -> Rationing
      step = core.dispatchDomainCommand(state, { type: 'phase/advance' }, bundle);
      assert.equal(step.ok, true);
      state = step.state;

      // Rationing: enable WRS only when battery is comfortable, feed hungry crew
      const wrsWanted = state.resources.batteryKWh >= 20 || !core.selectMissionProgress(state, bundle).isLunarNight;
      step = core.dispatchDomainCommand(state, { type: 'rationing/set-wrs', enabled: wrsWanted }, bundle);
      assert.equal(step.ok, true);
      state = step.state;

      for (const crewId of ['cmd', 'eng', 'doc', 'geo']) {
        if (
          state.crew[crewId].satiety <= 50 &&
          state.dailyPlan.mreTargets.length < state.resources.mrePacks
        ) {
          const mreStep = core.dispatchDomainCommand(
            state,
            { type: 'rationing/toggle-mre', crewId, enabled: true },
            bundle
          );
          if (mreStep.ok) state = mreStep.state;
        }
      }

      // End Sol
      const ended = core.dispatchDomainCommand(state, { type: 'sol/end' }, bundle);
      assert.equal(ended.ok, true, `Failed ending Sol ${sol}`);
      state = ended.state;

      if (sol < 32) {
        assert.equal(state.campaign.status, 'active', `Unexpected early end on Sol ${sol}: ${state.campaign.endReason}`);
        const dismissed = core.dispatchDomainCommand(state, { type: 'debrief/dismiss' }, bundle);
        assert.equal(dismissed.ok, true);
        state = dismissed.state;
      }
    }

    return { state, seenEvents, checksum: core.computeStateChecksum(state) };
  }

  const run1 = runCampaign(205099);
  const run2 = runCampaign(205099);

  assert.equal(run1.state.campaign.status, 'victory');
  assert.equal(
    core.computeStateChecksum({ ...run1.state, campaign: { ...run1.state.campaign, runId: 'fixed' } }),
    core.computeStateChecksum({ ...run2.state, campaign: { ...run2.state.campaign, runId: 'fixed' } })
  );
  assert.deepEqual(run1.seenEvents, run2.seenEvents);

  const seenIds = new Set(run1.seenEvents.map((e) => e.eventId));
  for (const milestoneId of [
    'sol1-arrival-check',
    'sol7-station-water-balance',
    'evt-sol10-last-cargo-window',
    'evt-sol14-sunset-warning',
    'sol15-lunar-nightfall',
    'evt-sol29-sunrise-surge',
    'evt-sol32-mission-end',
  ]) {
    assert.ok(seenIds.has(milestoneId), `Expected milestone event "${milestoneId}" to trigger during 32-Sol run`);
  }

  const cryoSeal = bundle.events.find((e) => e.id === 'evt-cryo-seal-crack');
  assert.ok(cryoSeal && cryoSeal.when.some((w) => w.flagSet === 'airlock_dusty'));
  assert.equal(
    core.evaluateTriggerCondition(
      { ...run1.state, clock: { ...run1.state.clock, sol: 18 }, events: { ...run1.state.events, flags: {} } },
      cryoSeal.when[0],
      bundle
    ),
    false
  );
  assert.equal(
    core.evaluateTriggerCondition(
      { ...run1.state, clock: { ...run1.state.clock, sol: 18 }, events: { ...run1.state.events, flags: { airlock_dusty: true } } },
      cryoSeal.when[0],
      bundle
    ),
    true
  );
});
