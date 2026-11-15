import {
  buildNarrativeRunKey,
  type MilestonePresentationId,
  type NarrativeState,
} from '../onboarding/narrativePersistence.ts';
import type { CockpitTourStatus, Sol1GuideStatus, TourId } from '../onboarding/types.ts';
import type { ActiveModalType, ContentBundle, GameState, ProvenanceTag } from '../types/index.ts';
import { selectCampaignReport } from './campaignSelectors.ts';

export type MilestonePresentationKind = 'arrival' | 'golden-crisis' | 'lunar-sunset' | 'lunar-sunrise';

export interface PendingMilestonePresentation {
  readonly id: MilestonePresentationId;
  readonly sol: number;
  readonly runKey: string;
  readonly kind: MilestonePresentationKind;
  /** Provenance of state-dependent chips and campaign framing. */
  readonly provenance: ProvenanceTag;
  /** Provenance of the separately rendered science note. */
  readonly scienceProvenance: ProvenanceTag;
  readonly sourceRef: string;
  readonly titleKey: string;
  readonly subtitleKey: string;
  readonly bodyKey: string;
  readonly scienceNoteKey: string;
  readonly scienceNoteParams?: Readonly<Record<string, string | number>>;
  readonly chips: ReadonlyArray<{ readonly labelKey: string; readonly value: string }>;
}

export interface MilestoneVisibilityGuard {
  readonly tutorialSandboxActive: boolean;
  readonly hasSaveError: boolean;
  readonly activeTour: TourId | null;
  readonly activeModal: ActiveModalType;
  readonly cockpitTourStatus: CockpitTourStatus;
  readonly sol1GuideStatus: Sol1GuideStatus;
}

export interface Sol7DebriefBranchSummary {
  readonly goldenCrisisSol: number;
  readonly branch: 'saved-rover' | 'prioritized-wrs' | 'unknown';
  readonly choiceId: string | null;
  readonly followUpSolMin: number;
  readonly followUpSolMax: number;
}

export interface CampaignInsightItem {
  readonly code: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface CampaignInsightsView {
  readonly status: 'victory' | 'defeat';
  readonly rank: 'S' | 'A' | 'B' | null;
  readonly resolvedSol: number;
  readonly activeCrew: number;
  readonly fitCrew: number;
  readonly completedExpeditions: number;
  readonly totalExpeditions: number;
  readonly blackouts: number;
  readonly sciencePoints: number;
  readonly provenance: ProvenanceTag;
  readonly causes: readonly CampaignInsightItem[];
  readonly recommendations: readonly CampaignInsightItem[];
}

export function selectPendingCockpitMilestone(
  state: GameState,
  bundle: ContentBundle,
  narrative: NarrativeState,
  guard: MilestoneVisibilityGuard
): PendingMilestonePresentation | null {
  if (
    guard.tutorialSandboxActive ||
    guard.hasSaveError ||
    guard.activeTour !== null ||
    guard.activeModal !== null
  ) {
    return null;
  }

  if (state.campaign.status !== 'active' || state.clock.phase !== 'briefing') {
    return null;
  }

  const sol = state.clock.sol;
  const { milestones } = bundle.campaign;
  const runKey = buildNarrativeRunKey(state.campaign);
  const shownForRun =
    narrative.runKey === null || narrative.runKey === runKey
      ? narrative.shownMilestoneIds
      : [];

  let candidateId: MilestonePresentationId | null = null;
  if (sol === 1) {
    if (
      guard.cockpitTourStatus !== 'unseen' &&
      guard.cockpitTourStatus !== 'active' &&
      guard.sol1GuideStatus !== 'active'
    ) {
      candidateId = 'moon-sol1-arrival';
    }
  } else if (sol === milestones.goldenCrisisSol) {
    candidateId = 'moon-sol7-golden-crisis';
  } else if (sol === milestones.lunarNight.startSol) {
    candidateId = 'moon-sol15-lunar-sunset';
  } else if (sol === milestones.lunarDawn.startSol) {
    candidateId = 'moon-sol29-lunar-sunrise';
  }

  if (!candidateId || shownForRun.includes(candidateId)) {
    return null;
  }

  const activeCrew = Object.values(state.crew).filter((c) => c.condition !== 'evacuated').length;

  switch (candidateId) {
    case 'moon-sol1-arrival':
      return {
        id: candidateId,
        sol,
        runKey,
        kind: 'arrival',
        provenance: 'simulated',
        scienceProvenance: 'inferred',
        sourceRef: 'NASA Artemis South Pole Concept & HIDH',
        titleKey: 'milestone.sol1.title',
        subtitleKey: 'milestone.sol1.subtitle',
        bodyKey: 'milestone.sol1.body',
        scienceNoteKey: 'milestone.sol1.science',
        chips: [
          { labelKey: 'milestone.chip.target', value: `Sol ${bundle.campaign.targetSol}` },
          { labelKey: 'milestone.chip.crew', value: `${activeCrew}/4` },
          { labelKey: 'milestone.chip.nightStart', value: `Sol ${milestones.lunarNight.startSol}` },
        ],
      };

    case 'moon-sol7-golden-crisis':
      return {
        id: candidateId,
        sol,
        runKey,
        kind: 'golden-crisis',
        provenance: 'simulated',
        scienceProvenance: 'inferred',
        sourceRef: 'NASA ECLSS & Deep Space Network Telemetry',
        titleKey: 'milestone.sol7.title',
        subtitleKey: 'milestone.sol7.subtitle',
        bodyKey: 'milestone.sol7.body',
        scienceNoteKey: 'milestone.sol7.science',
        chips: [
          { labelKey: 'milestone.chip.battery', value: `${state.resources.batteryKWh} kWh` },
          { labelKey: 'milestone.chip.water', value: `${state.resources.waterL} L` },
          {
            labelKey: 'milestone.chip.rover',
            value: (state.rover.activeMission?.status ?? 'available').toUpperCase(),
          },
        ],
      };

    case 'moon-sol15-lunar-sunset':
      return {
        id: candidateId,
        sol,
        runKey,
        kind: 'lunar-sunset',
        provenance: 'simulated',
        scienceProvenance: bundle.catalog.environment.temperatureC.provenance,
        sourceRef: `NASA LRO Diviner GCP polar cell (R² = ${bundle.catalog.environment.temperatureC.fitR2.toFixed(4)})`,
        titleKey: 'milestone.sol15.title',
        subtitleKey: 'milestone.sol15.subtitle',
        bodyKey: 'milestone.sol15.body',
        scienceNoteKey: 'milestone.sol15.science',
        scienceNoteParams: {
          nightMin: bundle.catalog.environment.temperatureC.nightMinC.toFixed(1),
        },
        chips: [
          { labelKey: 'milestone.chip.solar', value: '0 kWh' },
          { labelKey: 'milestone.chip.fission', value: `+${bundle.balance.power.fissionKWhPerSol} kWh` },
          { labelKey: 'milestone.chip.battery', value: `${state.resources.batteryKWh} kWh` },
          { labelKey: 'milestone.chip.duration', value: `Sol ${milestones.lunarNight.startSol}–${milestones.lunarNight.endSol}` },
        ],
      };

    case 'moon-sol29-lunar-sunrise': {
      const avgIntegrityPct = Math.round(
        (Object.values(state.systems).reduce((sum, sys) => sum + sys.integrity, 0) /
          Object.values(state.systems).length) *
          100
      );
      return {
        id: candidateId,
        sol,
        runKey,
        kind: 'lunar-sunrise',
        provenance: 'simulated',
        scienceProvenance: bundle.catalog.environment.temperatureC.provenance,
        sourceRef: 'NASA LRO Polar Illumination & Diviner',
        titleKey: 'milestone.sol29.title',
        subtitleKey: 'milestone.sol29.subtitle',
        bodyKey: 'milestone.sol29.body',
        scienceNoteKey: 'milestone.sol29.science',
        chips: [
          { labelKey: 'milestone.chip.crew', value: `${activeCrew}/4` },
          { labelKey: 'milestone.chip.systems', value: `${avgIntegrityPct}%` },
          { labelKey: 'milestone.chip.remaining', value: `Sol ${sol}–${bundle.campaign.targetSol}` },
        ],
      };
    }
  }
}

export function selectSol7DebriefBranch(
  state: GameState,
  bundle: ContentBundle
): Sol7DebriefBranchSummary | null {
  const goldenSol = bundle.campaign.milestones.goldenCrisisSol;
  const occ = [...state.events.occurrenceHistory]
    .reverse()
    .find((entry) => entry.eventId === 'sol7-golden-comms-crisis');

  const savedRover = Boolean(state.events.flags.sol7_saved_rover) || occ?.choiceId === 'save-rover-link';
  const prioritizedWrs =
    Boolean(state.events.flags.sol7_prioritized_station) || occ?.choiceId === 'prioritize-wrs';

  if (!occ && !savedRover && !prioritizedWrs) {
    return null;
  }

  const branch: Sol7DebriefBranchSummary['branch'] = savedRover
    ? 'saved-rover'
    : prioritizedWrs
      ? 'prioritized-wrs'
      : 'unknown';

  const crisisEvent = bundle.events.find((e) => e.id === 'sol7-golden-comms-crisis');
  const chosenChoice = crisisEvent?.choices.find((c) => c.id === occ?.choiceId);
  const followUpEffect = chosenChoice?.effects.find((eff) => eff.kind === 'schedule-follow-up');
  const delay = followUpEffect?.kind === 'schedule-follow-up' ? followUpEffect.delaySols : 1;

  return {
    goldenCrisisSol: goldenSol,
    branch,
    choiceId: occ?.choiceId ?? null,
    followUpSolMin: goldenSol + delay,
    followUpSolMax: goldenSol + 3,
  };
}

export function selectCampaignInsights(
  state: GameState,
  bundle: ContentBundle
): CampaignInsightsView {
  const report = selectCampaignReport(state, bundle);
  const outcome = report.outcome;
  const status: 'victory' | 'defeat' = state.campaign.status === 'victory' ? 'victory' : 'defeat';
  const resolvedSol =
    state.history.summaries[state.history.summaries.length - 1]?.sol ?? state.clock.sol;
  const activeCrew = report.crew.filter((c) => c.condition !== 'evacuated').length;
  const fitCrew = report.crew.filter((c) => c.condition === 'fit').length;
  const injuredCrew = report.crew.filter((c) => c.condition === 'injured').length;
  const evacuatedCrew = report.crew.filter((c) => c.condition === 'evacuated').length;
  const completedExpeditions = new Set(
    report.expeditions.filter((m) => m.outcome === 'completed').map((m) => m.expeditionId)
  ).size;
  const totalExpeditions = bundle.campaign.expeditions.length;
  const degradedSystems = report.systems.filter((s) => s.integrity < 0.75);
  const minIntegrity = report.systems.reduce((min, s) => Math.min(min, s.integrity), 1);

  const causes: CampaignInsightItem[] = [];

  if (status === 'defeat') {
    const reason = outcome?.reasonCode;
    if (reason === 'oxygen-depleted') {
      causes.push({
        code: 'report.cause.defeatOxygen',
        params: { sol: resolvedSol, streak: state.resources.oxygenZeroStreak },
      });
    } else if (reason === 'water-depleted') {
      causes.push({
        code: 'report.cause.defeatWater',
        params: { sol: resolvedSol, streak: state.resources.waterZeroStreak },
      });
    } else if (reason === 'crew-collapse') {
      causes.push({
        code: 'report.cause.defeatCrew',
        params: { active: activeCrew, min: bundle.campaign.defeat.minActiveCrew },
      });
    } else if (reason === 'final-requirements-unmet') {
      causes.push({
        code: 'report.cause.defeatFinalReq',
        params: {
          oxygen: report.resources.oxygenKg,
          water: report.resources.waterL,
          active: activeCrew,
        },
      });
    } else {
      causes.push({ code: 'report.cause.defeatLegacy', params: { sol: resolvedSol } });
    }
  } else if (outcome?.rank === 'S') {
    causes.push({
      code: 'report.cause.victoryS',
      params: { fit: fitCrew, expeditions: completedExpeditions, total: totalExpeditions },
    });
  } else if (outcome?.rank === 'A') {
    causes.push({
      code: 'report.cause.victoryA',
      params: {
        active: activeCrew,
        expeditions: completedExpeditions,
        sCrew: bundle.campaign.ranking.S.minFitCrew,
        sExp: bundle.campaign.ranking.S.minExpeditions,
      },
    });
  } else {
    causes.push({
      code: 'report.cause.victoryB',
      params: {
        active: activeCrew,
        expeditions: completedExpeditions,
        aExp: bundle.campaign.ranking.A.minExpeditions,
      },
    });
  }

  if (report.blackouts > 0) {
    causes.push({
      code: 'report.cause.blackouts',
      params: { blackouts: report.blackouts },
    });
  } else if (degradedSystems.length > 0) {
    causes.push({
      code: 'report.cause.systemsWear',
      params: { count: degradedSystems.length, minPct: Math.round(minIntegrity * 100) },
    });
  } else if (report.wrs.efficiency !== null) {
    causes.push({
      code: 'report.cause.wrsStats',
      params: {
        pct: Math.round(report.wrs.efficiency * 100),
        recovered: report.wrs.recoveredL.toFixed(1),
      },
    });
  } else {
    causes.push({
      code: 'report.cause.powerStable',
      params: { science: report.sciencePoints },
    });
  }

  if (evacuatedCrew > 0 || injuredCrew > 0) {
    causes.push({
      code: 'report.cause.crewHealth',
      params: { fit: fitCrew, injured: injuredCrew, evacuated: evacuatedCrew },
    });
  } else if (completedExpeditions < totalExpeditions) {
    causes.push({
      code: 'report.cause.expeditionsPartial',
      params: {
        completed: completedExpeditions,
        total: totalExpeditions,
        science: report.sciencePoints,
      },
    });
  } else {
    causes.push({
      code: 'report.cause.expeditionsAll',
      params: {
        completed: completedExpeditions,
        total: totalExpeditions,
        science: report.sciencePoints,
      },
    });
  }

  const recommendations: CampaignInsightItem[] = [];
  const pushRec = (code: string, params?: Readonly<Record<string, string | number>>) => {
    if (recommendations.length >= 3) return;
    if (recommendations.some((r) => r.code === code)) return;
    recommendations.push({ code, params });
  };

  if (outcome?.reasonCode === 'oxygen-depleted' || report.resources.oxygenKg < 10) {
    pushRec('report.rec.oxygenCargo', {
      lastCargoSol: bundle.campaign.milestones.recommendedLastCargoSol,
    });
  }
  if (
    outcome?.reasonCode === 'water-depleted' ||
    report.resources.waterL < 10 ||
    (report.wrs.efficiency !== null && report.wrs.efficiency < 0.75)
  ) {
    pushRec('report.rec.waterWrs', {
      nightSol: bundle.campaign.milestones.lunarNight.startSol,
    });
  }
  if (report.blackouts > 0) {
    pushRec('report.rec.powerPriority', {
      nightSol: bundle.campaign.milestones.lunarNight.startSol,
    });
  }
  if (outcome?.reasonCode === 'crew-collapse' || evacuatedCrew > 0 || injuredCrew > 0) {
    pushRec('report.rec.crewCare');
  }
  if (completedExpeditions < bundle.campaign.ranking.S.minExpeditions) {
    pushRec('report.rec.roverTargets', {
      target: bundle.campaign.ranking.S.minExpeditions,
    });
  }
  if (degradedSystems.length > 0) {
    pushRec('report.rec.systemRepairs');
  }

  // Ensure at least 2-3 actionable recommendations even for strong runs.
  pushRec('report.rec.nightChecklist', {
    lastCargoSol: bundle.campaign.milestones.recommendedLastCargoSol,
    nightSol: bundle.campaign.milestones.lunarNight.startSol,
  });
  pushRec('report.rec.nextChallenge');

  return {
    status,
    rank: outcome?.rank ?? null,
    resolvedSol,
    activeCrew,
    fitCrew,
    completedExpeditions,
    totalExpeditions,
    blackouts: report.blackouts,
    sciencePoints: report.sciencePoints,
    provenance: 'simulated',
    causes: causes.slice(0, 3),
    recommendations: recommendations.slice(0, 3),
  };
}
