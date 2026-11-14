import { dispatchDomainCommand } from '../domain/orchestrator.ts';
import { assertGameState } from '../domain/invariants.ts';
import { canonicalStringify } from '../domain/canonicalJson.ts';
import { selectEventChoicePreviews } from '../domain/eventSelectors.ts';
import { createInitialGameState, type NewGameOptions } from '../schemas/contracts.ts';
import { contentHash, stateHash, type CampaignReplay, type ReplayStep } from './replay.ts';
import type { ContentBundle, GameCommand, GameState } from '../types/index.ts';

export interface CampaignPolicy {
  readonly id: string;
  readonly branchPreference?: 'A' | 'B';
  nextCommand(state: GameState, bundle: ContentBundle, decisionIndex: number): GameCommand | null;
}
export interface CampaignRun {
  readonly status: 'completed' | 'simulation-error';
  readonly error: string | null;
  readonly state: GameState;
  readonly trace: CampaignReplay;
  readonly metrics: {
    readonly seed: number;
    readonly difficulty: string;
    readonly donkiProfileId: string;
    readonly completedSols: number;
    readonly outcome: string;
    readonly reason: string | null;
    readonly reasonCode: string | null;
    readonly rank: string | null;
    readonly requestedBranch: string | null;
    readonly actualBranch: string | null;
    readonly rejectedCommands: number;
    readonly completedExpeditions: number;
    readonly blackouts: number;
    readonly resourceMinima: Readonly<Record<string, number>>;
    readonly finalResources: GameState['resources'];
    readonly finalCrew: GameState['crew'];
    readonly finalSystems: GameState['systems'];
  };
}

/** Executes the current gameplay contract without changing resources, clock or events directly. */
export function runCampaign(bundle: ContentBundle, options: NewGameOptions, policy: CampaignPolicy, commandBudgetPerSol = 128, buildId: string | null = null): CampaignRun {
  if (!Number.isInteger(commandBudgetPerSol) || commandBudgetPerSol < 1) throw new Error('Invalid command budget.');
  const seed = options.seed ?? 205099;
  const base = createInitialGameState(bundle, { ...options, seed, runId: options.runId ?? 'simulation:defaults' });
  const initial = createInitialGameState(bundle, { ...options, seed,
    runId: options.runId ?? `simulation:${policy.id}:${seed}:${base.campaign.difficulty}:${base.campaign.donkiProfileId}` });
  let state = initial;
  const steps: ReplayStep[] = [];
  let error: string | null = null;
  let commandsThisSol = 0;
  const minima: Record<string, number> = {};
  const measure = () => {
    for (const key of ['batteryKWh', 'oxygenKg', 'waterL', 'partsKg', 'mrePacks', 'medkits'] as const) {
      minima[key] = Math.min(minima[key] ?? Infinity, state.resources[key]);
    }
  };
  measure();
  try {
    assertGameState(state, bundle);
    while (state.campaign.status === 'active') {
      if (++commandsThisSol > commandBudgetPerSol) throw new Error(`Command budget exhausted at Sol ${state.clock.sol}.`);
      // Policies receive an isolated snapshot; a faulty bot cannot mutate the live engine state.
      const command = policy.nextCommand(structuredClone(state), structuredClone(bundle), steps.length);
      if (!command) throw new Error(`Policy has no next command at Sol ${state.clock.sol}/${state.clock.phase}.`);
      if (command.type === 'game/start') throw new Error('Policy cannot restart a campaign.');
      const beforeSol = state.clock.sol;
      const beforeHash = steps.at(-1)?.stateHash ?? stateHash(initial);
      const result = dispatchDomainCommand(state, command, bundle);
      state = result.state;
      const nextHash = stateHash(state);
      steps.push({ command: JSON.parse(canonicalStringify(command)) as GameCommand,
        ok: result.ok, errorCode: result.ok ? null : result.error.code, stateHash: nextHash });
      assertGameState(state, bundle);
      if (!result.ok && nextHash !== beforeHash) throw new Error(`Rejected command mutated state at command ${steps.length - 1}.`);
      measure();
      if (state.clock.sol !== beforeSol) commandsThisSol = 0;
    }
  } catch (cause) {
    error = `Command ${steps.length}, Sol ${state.clock.sol}/${state.clock.phase}: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
  return {
    status: error ? 'simulation-error' : 'completed', error, state,
    trace: { replayVersion: 1, policy: policy.id, coverage: 'full-campaign', initialState: initial,
      provenance: { buildId, contentHash: contentHash(bundle), rankingVersion: bundle.campaign.ranking.version },
      initialHash: stateHash(initial), steps, finalHash: stateHash(state), expectedOutcome: state.campaign.status },
    metrics: { seed: state.campaign.seed, difficulty: state.campaign.difficulty, donkiProfileId: state.campaign.donkiProfileId,
      completedSols: state.history.summaries.length, outcome: state.campaign.status, reason: state.campaign.endReason,
      reasonCode: state.campaign.outcome?.reasonCode ?? null, rank: state.campaign.outcome?.rank ?? null,
      requestedBranch: policy.branchPreference ?? null,
      actualBranch: state.events.occurrenceHistory.find((event) => event.eventId === 'sol7-golden-comms-crisis')?.choiceId ?? null,
      rejectedCommands: steps.filter((step) => !step.ok).length,
      completedExpeditions: state.rover.missionHistory.filter((mission) => mission.outcome === 'completed').length,
      blackouts: state.history.summaries.filter((summary) => summary.blackout).length, resourceMinima: minima,
      finalResources: state.resources, finalCrew: state.crew, finalSystems: state.systems },
  };
}

/** Baseline strategy from the existing Phase 1.3 32-Sol test. Not a claim of balanced gameplay. */
export const baselinePolicy: CampaignPolicy = {
  id: 'phase-1-3-baseline',
  nextCommand(state, bundle) {
    const phase = state.clock.phase;
    if (phase === 'briefing' && state.events.activeEventId) {
      const choice = selectEventChoicePreviews(state, state.events.activeEventId, bundle).find((preview) => preview.allowed);
      return choice ? { type: 'event/resolve', eventId: state.events.activeEventId, choiceId: choice.choice.id } : null;
    }
    if (phase === 'briefing' || phase === 'engineering') return { type: 'phase/advance' };
    if (phase === 'comms') {
      const sol = state.clock.sol;
      if (!state.logistics.activeOrder && state.logistics.padCooldownSols === 0 && sol <= 26) {
        return { type: 'comms/order-cargo', slots: sol >= 10 && sol <= 22
          ? { 'water-pack': 2, 'power-parts-pack': 1, 'food-med-pack': 1 }
          : { 'water-pack': 2, 'oxygen-pack': 1, 'food-med-pack': 1 } };
      }
      return { type: 'phase/advance' };
    }
    if (phase === 'rationing') {
      const night = state.clock.sol >= bundle.campaign.milestones.lunarNight.startSol && state.clock.sol <= bundle.campaign.milestones.lunarNight.endSol;
      const wrs = state.resources.batteryKWh >= 20 || !night;
      if (state.dailyPlan.wrsEnabled !== wrs) return { type: 'rationing/set-wrs', enabled: wrs };
      for (const id of ['cmd', 'eng', 'doc', 'geo'] as const) {
        if (state.crew[id].condition !== 'evacuated' && state.crew[id].satiety <= 50
          && !state.dailyPlan.mreTargets.includes(id) && state.dailyPlan.mreTargets.length < state.resources.mrePacks) {
          return { type: 'rationing/toggle-mre', crewId: id, enabled: true };
        }
      }
      return { type: 'sol/end' };
    }
    return phase === 'debrief' ? { type: 'debrief/dismiss' } : null;
  },
};
