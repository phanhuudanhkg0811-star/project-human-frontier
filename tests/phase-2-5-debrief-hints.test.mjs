import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';
import { simulationRoot } from '../scripts/load-simulation.mjs';

async function loadPhase25Bundle() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export * from './src/domain/debriefSelectors.ts';
        export * from './src/onboarding/hintsCatalog.ts';
        export * from './src/onboarding/selectors.ts';
        export * from './src/onboarding/persistence.ts';
        export * from './src/onboarding/targets.ts';
        export * from './src/domain/orchestrator.ts';
        export * from './src/domain/canonicalJson.ts';
        export * from './src/domain/prng.ts';
        export * from './src/store/uiStore.ts';
        export * from './src/i18n/dictionaries.ts';
        export * from './src/i18n/useI18n.ts';
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

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function formatTemplate(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

const p25 = await loadPhase25Bundle();
const bundle = p25.loadContentBundle();

test('Phase 2.5 Conditional Rich Debrief stays clean on calm Sols and surfaces full breakdown on anomalies', () => {
  const base = p25.createInitialGameState(bundle, { seed: 205025, difficulty: 'standard' });
  assert.equal(p25.selectRichDebriefBreakdown(base), null);

  const hashBefore = p25.sha256Hex(p25.canonicalStringify(base));

  const calmSummary = {
    checkpoint: {
      resources: base.resources,
      crew: base.crew,
      systems: base.systems,
      completedExpeditions: 0,
      sciencePoints: 0,
      wrsProcessedWasteWaterL: 8.8,
      solarGeneratedKWh: 18,
      fissionGeneratedKWh: 8,
      batteryOverflowKWh: 1.5,
      essentialUnmetKWh: 0,
    },
    sol: 2,
    isLunarNight: false,
    surfaceTempC: -32,
    powerGeneratedKWh: 26,
    powerConsumedKWh: 20,
    unmetLoads: [],
    blackout: false,
    wrsRecoveredWaterL: 7.9,
    resourceDeltas: {
      batteryKWh: 4.5,
      oxygenKg: -0.4,
      waterL: -1.1,
      partsKg: 0,
      mrePacks: -4,
      medkits: 0,
    },
    weather: {
      profileId: base.campaign.donkiProfileId,
      solDate: '2050-05-02',
      level: 'quiet',
      solarPenaltyPct: 0,
      radiationRiskIndex: 0.1,
      commsNoiseIndex: 0,
      hardwareStressIndex: 0,
      repairSuccessProb: 0.95,
      repairRollOk: null,
      roverIncidentProb: 0.05,
      roverIncidentTriggered: false,
      radiationDoseMgy: 0.4,
      stormDegradedSystem: null,
      headline: 'Nominal solar activity',
    },
    briefId: 'brief-wrs-eclss',
    debriefContext: null,
    highlights: ['All subsystems operated within expected bands.'],
  };

  const calmState = {
    ...base,
    debrief: { pendingDismiss: true, lastSummary: calmSummary },
  };
  const calmBreakdown = p25.selectRichDebriefBreakdown(calmState);
  assert.equal(calmBreakdown?.alerts.length, 0);
  assert.equal(calmBreakdown?.hasAnomalies, false);
  assert.equal(calmBreakdown?.power.solarKWh, 18);
  assert.equal(calmBreakdown?.power.fissionKWh, 8);

  const stormState = {
    ...base,
    rover: {
      ...base.rover,
      missionHistory: [
        {
          expeditionId: 'lunar-crater',
          outcome: 'completed',
          launchedSol: 2,
          settledSol: 5,
          rewardSampleGranted: 'crater_core_sample',
          note: 'Sample returned',
        },
      ],
    },
    debrief: {
      pendingDismiss: true,
      lastSummary: {
        ...calmSummary,
        sol: 5,
        unmetLoads: ['wrs', 'fabricator'],
        weather: {
          ...calmSummary.weather,
          level: 'X',
          stormDegradedSystem: 'solar',
          repairRollOk: false,
          roverIncidentTriggered: true,
        },
        highlights: ['Line 1', 'Line 2', 'Line 3', 'Line 4 must stay in breakdown'],
      },
    },
  };

  const stormBreakdown = p25.selectRichDebriefBreakdown(stormState);
  assert.equal(stormBreakdown?.hasAnomalies, true);
  assert.ok(stormBreakdown?.alerts.some((a) => a.id === 'load-shed'));
  assert.ok(stormBreakdown?.alerts.some((a) => a.id === 'storm-damage'));
  assert.ok(stormBreakdown?.alerts.some((a) => a.id === 'repair-fail'));
  assert.ok(stormBreakdown?.alerts.some((a) => a.id === 'rover-incident'));
  assert.ok(stormBreakdown?.alerts.some((a) => a.id === 'rover-lunar-crater'));
  assert.equal(stormBreakdown?.priorityHighlights.length, 3);
  assert.equal(stormBreakdown?.allHighlights.length, 4);
  assert.equal(p25.sha256Hex(p25.canonicalStringify(base)), hashBefore);
});

test('Phase 2.5 Contextual Hints rule engine covers P1 catalog, debrief follow-up, guards, and fallback targets', () => {
  const base = p25.createInitialGameState(bundle, { seed: 205025, difficulty: 'standard' });
  const baseOnboarding = {
    ...p25.createDefaultOnboardingState(),
    cockpitTourStatus: 'completed',
    sol1GuideStatus: 'completed',
  };
  const uiClear = { activeModal: null, reducedMotion: false };

  // Suppressed during tour, modal, milestone, sandbox, disabled toggle, or debrief/terminal
  assert.equal(
    p25.selectActiveContextualHint(base, bundle, { activeModal: 'starlog', reducedMotion: false }, baseOnboarding),
    null
  );
  assert.equal(
    p25.selectActiveContextualHint(base, bundle, uiClear, { ...baseOnboarding, activeTour: 'sol1' }),
    null
  );
  assert.equal(
    p25.selectActiveContextualHint(base, bundle, uiClear, { ...baseOnboarding, contextualHintsEnabled: false }),
    null
  );
  assert.equal(
    p25.selectActiveContextualHint(base, bundle, uiClear, baseOnboarding, { milestoneActive: true }),
    null
  );
  assert.equal(
    p25.selectActiveContextualHint(base, bundle, uiClear, baseOnboarding, { tutorialSandboxActive: true }),
    null
  );
  assert.equal(
    p25.selectActiveContextualHint({ ...base, clock: { ...base.clock, phase: 'debrief' } }, bundle, uiClear, baseOnboarding),
    null
  );

  // 1) Aftermath load shedding from prior Sol Debrief triggers next morning
  const aftermathState = {
    ...base,
    clock: { sol: 4, phase: 'engineering', resolutionIndex: 3 },
    events: { ...base.events, activeEventId: null, activeEvent: null },
    debrief: {
      pendingDismiss: false,
      lastSummary: {
        checkpoint: null,
        sol: 3,
        isLunarNight: false,
        surfaceTempC: -30,
        powerGeneratedKWh: 12,
        powerConsumedKWh: 18,
        unmetLoads: ['wrs'],
        blackout: false,
        wrsRecoveredWaterL: 0,
        resourceDeltas: { batteryKWh: -5, oxygenKg: -1, waterL: -5, partsKg: 0, mrePacks: -4, medkits: 0 },
        weather: {
          profileId: base.campaign.donkiProfileId,
          solDate: '2050-05-03',
          level: 'quiet',
          solarPenaltyPct: 0,
          radiationRiskIndex: 0.1,
          commsNoiseIndex: 0,
          hardwareStressIndex: 0,
          repairSuccessProb: 0.9,
          repairRollOk: null,
          roverIncidentProb: 0.05,
          roverIncidentTriggered: false,
          radiationDoseMgy: 0.4,
          stormDegradedSystem: null,
          headline: 'Quiet',
        },
        briefId: 'brief-wrs-eclss',
        debriefContext: null,
        highlights: [],
      },
    },
  };
  const aftermathHint = p25.selectActiveContextualHint(aftermathState, bundle, uiClear, baseOnboarding);
  assert.equal(aftermathHint?.id, 'hint-aftermath-load-shed');
  assert.equal(aftermathHint?.params.loads, 'WRS');
  assert.ok(aftermathHint?.fallbackTargetId);

  // 2) Sol 15 first lunar night explains load shedding (higher than aftermath? no, 82 vs 85, aftermath skips sol === lunarNight.startSol)
  const sol15State = {
    ...aftermathState,
    clock: { sol: bundle.campaign.milestones.lunarNight.startSol, phase: 'briefing', resolutionIndex: 14 },
  };
  const sol15Hint = p25.selectActiveContextualHint(sol15State, bundle, uiClear, baseOnboarding);
  assert.equal(sol15Hint?.id, 'hint-sol15-first-night-loadshed');

  // 3) Critical resource forecast triggers above Sol 15 / workflow hints
  const lowO2State = {
    ...sol15State,
    resources: { ...base.resources, oxygenKg: 3.5 },
  };
  const o2Hint = p25.selectActiveContextualHint(lowO2State, bundle, uiClear, baseOnboarding);
  assert.equal(o2Hint?.id, 'hint-resource-critical-forecast');
  assert.equal(o2Hint?.allowNeverRemindAgain, false);

  // 4) End-Sol critical forecast outranks everything in rationing
  const rationingZeroO2 = {
    ...base,
    clock: { sol: 6, phase: 'rationing', resolutionIndex: 5 },
    events: { ...base.events, activeEventId: null, activeEvent: null },
    resources: { ...base.resources, oxygenKg: 1.0 },
  };
  const endSolHint = p25.selectActiveContextualHint(rationingZeroO2, bundle, uiClear, baseOnboarding);
  assert.equal(endSolHint?.id, 'hint-end-sol-critical');
  assert.equal(endSolHint?.ctaTargetId, 'open-end-sol');
  assert.equal(endSolHint?.fallbackTargetId, 'primary-phase-cta');

  // 5) Rover signal-lost attention
  const roverLostState = {
    ...base,
    clock: { sol: 5, phase: 'comms', resolutionIndex: 4 },
    events: { ...base.events, activeEventId: null, activeEvent: null },
    rover: {
      ...base.rover,
      activeMission: {
        expeditionId: 'lunar-crater',
        status: 'signal-lost',
        scheduledSol: 2,
        travelTicksCompleted: 1,
        signalLostSols: 1,
        recoveryDelaySols: 0,
        operatorCrewId: 'geo',
        equippedItems: [],
        incidents: [],
      },
    },
  };
  const roverHint = p25.selectActiveContextualHint(roverLostState, bundle, uiClear, baseOnboarding);
  assert.equal(roverHint?.id, 'hint-rover-attention');
  assert.equal(roverHint?.bodyKey, 'hints.roverAttention.bodySignalLost');

  // 6) Cargo near recommendedLastCargoSol (low enough to warrant cargo before night, above 3-Sol crisis)
  const cargoLateState = {
    ...base,
    clock: { sol: 11, phase: 'briefing', resolutionIndex: 10 },
    events: { ...base.events, activeEventId: null, activeEvent: null },
    resources: { ...base.resources, oxygenKg: 13.5, waterL: 24 },
    logistics: { activeOrder: null, history: [] },
  };
  const cargoHint = p25.selectActiveContextualHint(cargoLateState, bundle, uiClear, baseOnboarding);
  assert.equal(cargoHint?.id, 'hint-cargo-late-before-night');
});

test('Phase 2.5 anti-spam: same-Sol snooze, cooldown, maxShows, persistence decode, and severity escalation', () => {
  const ui = p25.useUiStore;
  ui.getState().resetOnboarding();
  ui.getState().completeCockpitTour('done');
  const base = p25.createInitialGameState(bundle, { seed: 205025, difficulty: 'standard' });
  const uiClear = { activeModal: null, reducedMotion: false };

  const sol5Engineer = {
    ...base,
    clock: { sol: 5, phase: 'engineering', resolutionIndex: 4 },
    events: { ...base.events, activeEventId: null, activeEvent: null },
    systems: {
      ...base.systems,
      solar: { ...base.systems.solar, integrity: 0.6 },
    },
  };

  // Shows hint-crew-unassigned-engineering initially
  const first = p25.selectActiveContextualHint(sol5Engineer, bundle, uiClear, ui.getState().onboarding);
  assert.equal(first?.id, 'hint-crew-unassigned-engineering');

  // Recording exposure does NOT self-hide mid-Sol
  ui.getState().recordHintShown(first.id, 5, first.severityKey);
  assert.equal(
    p25.selectActiveContextualHint(sol5Engineer, bundle, uiClear, ui.getState().onboarding)?.id,
    'hint-crew-unassigned-engineering'
  );

  // Snooze hides for rest of Sol 5 & survives encode/decode
  ui.getState().snoozeHintForSol(first.id, 5, first.severityKey);
  assert.equal(p25.selectActiveContextualHint(sol5Engineer, bundle, uiClear, ui.getState().onboarding), null);

  const decoded = p25.decodeOnboardingState(JSON.stringify(ui.getState().onboarding));
  assert.equal(decoded.resetToDefault, false);
  assert.equal(p25.selectActiveContextualHint(sol5Engineer, bundle, uiClear, decoded.state), null);

  // Cooldown = 2 blocks Sol 6, then permits Sol 7
  const sol6Engineer = { ...sol5Engineer, clock: { sol: 6, phase: 'engineering', resolutionIndex: 5 } };
  assert.equal(p25.selectActiveContextualHint(sol6Engineer, bundle, uiClear, ui.getState().onboarding), null);
  const sol7Engineer = { ...sol5Engineer, clock: { sol: 7, phase: 'engineering', resolutionIndex: 6 } };
  assert.equal(
    p25.selectActiveContextualHint(sol7Engineer, bundle, uiClear, ui.getState().onboarding)?.id,
    'hint-crew-unassigned-engineering'
  );

  // Permanent dismiss removes workflow hint completely
  ui.getState().dismissHint('hint-crew-unassigned-engineering');
  assert.equal(p25.selectActiveContextualHint(sol7Engineer, bundle, uiClear, ui.getState().onboarding), null);

  // Critical safety hint ignores dismissHint AND re-triggers on severity escalation even same Sol
  ui.getState().dismissHint('hint-resource-critical-forecast');
  const lowO2 = { ...sol5Engineer, resources: { ...base.resources, oxygenKg: 3.5 } };
  const warnHint = p25.selectActiveContextualHint(lowO2, bundle, uiClear, ui.getState().onboarding);
  assert.equal(warnHint?.id, 'hint-resource-critical-forecast');
  assert.equal(warnHint?.severityKey, 'r2:o2-low');

  ui.getState().snoozeHintForSol(warnHint.id, 5, warnHint.severityKey);
  assert.equal(p25.selectActiveContextualHint(lowO2, bundle, uiClear, ui.getState().onboarding), null);

  // Oxygen drops further to fatal -> escalates cleanly with reason
  const fatalO2 = { ...sol5Engineer, resources: { ...base.resources, oxygenKg: 1.5 } };
  const escalated = p25.selectActiveContextualHint(fatalO2, bundle, uiClear, ui.getState().onboarding);
  assert.equal(escalated?.id, 'hint-resource-critical-forecast');
  assert.equal(escalated?.severityKey, 'r3:o2-fatal');
  assert.equal(escalated?.escalatedFromPrior, true);
  assert.equal(escalated?.reasonKey, 'hints.reason.o2Worsened');

  // Corrupt hintSnoozedSol fails closed cleanly
  const corrupt = p25.decodeOnboardingState(
    JSON.stringify({
      ...p25.createDefaultOnboardingState(),
      hintSnoozedSol: { bad: -5 },
    })
  );
  assert.equal(corrupt.resetToDefault, true);
  assert.equal(corrupt.noticeCode, 'E_ONBOARDING_CORRUPT');
});

test('Phase 2.5 VI/EN hint copy budget (<= 35 words) and UI component wiring hold cleanly', () => {
  const dicts = p25.dictionaries;
  for (const rule of p25.CONTEXTUAL_HINT_RULES) {
    for (const locale of ['vi', 'en']) {
      const title = dicts[locale][rule.titleKey];
      const body = dicts[locale][rule.bodyKey];
      assert.ok(title && title.length > 0, `Missing ${locale} title for ${rule.id}`);
      assert.ok(body && body.length > 0, `Missing ${locale} body for ${rule.id}`);
      assert.ok(
        wordCount(formatTemplate(body, { sol: 15, endSol: 28, metric: 'O₂', value: '2 kg', loads: 'WRS', left: 1, count: 2, solsLeft: 1, nightSol: 15, transit: 4, arrival: 15, expedition: 'Lunar Crater' })) <= 35,
        `Hint body too long (${locale}) for ${rule.id}: ${body}`
      );
      assert.ok(dicts[locale][rule.ctaLabelKey], `Missing CTA label ${rule.ctaLabelKey} in ${locale}`);
    }
  }

  const nightSrc = fs.readFileSync(path.join(simulationRoot, 'src/components/modals/NightCutsceneModal.tsx'), 'utf8');
  assert.ok(nightSrc.includes('selectRichDebriefBreakdown'));
  assert.ok(nightSrc.includes('phf-night-breakdown-toggle'));

  const viewportSrc = fs.readFileSync(path.join(simulationRoot, 'src/components/HailGameViewport.tsx'), 'utf8');
  assert.ok(viewportSrc.includes('ContextualHintBanner'));
  assert.ok(viewportSrc.includes('selectActiveContextualHint'));
});
