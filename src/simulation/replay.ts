import { canonicalStringify } from '../domain/canonicalJson.ts';
import { dispatchDomainCommand } from '../domain/orchestrator.ts';
import { sha256Hex } from '../domain/prng.ts';
import { assertGameState } from '../domain/invariants.ts';
import { validateGameCommand, validateGameStateStructure } from '../schemas/contracts.ts';
import type { ContentBundle, GameCommand, GameState } from '../types/index.ts';

export interface ReplayStep {
  readonly command: GameCommand;
  readonly ok: boolean;
  readonly errorCode: string | null;
  readonly stateHash: string;
}
export interface CampaignReplay {
  readonly replayVersion: 1;
  readonly policy: string;
  readonly coverage: 'full-campaign' | 'from-snapshot';
  readonly provenance: {
    readonly buildId: string | null;
    readonly contentHash: string;
    readonly rankingVersion: string;
  };
  readonly initialState: GameState;
  readonly initialHash: string;
  readonly steps: readonly ReplayStep[];
  readonly finalHash: string;
  readonly expectedOutcome: GameState['campaign']['status'];
}
export const stateHash = (state: GameState): string => sha256Hex(canonicalStringify(state));
export const contentHash = (bundle: ContentBundle): string => sha256Hex(canonicalStringify(bundle));

/** Replay real commands from the exact recorded identity; never normalizes away runId. */
export function replayCampaign(input: unknown, bundle: ContentBundle): GameState {
  if (!input || typeof input !== 'object') throw new Error('Replay must be an object.');
  const trace = input as CampaignReplay;
  if (trace.replayVersion !== 1 || typeof trace.policy !== 'string' || !Array.isArray(trace.steps)
    || !['full-campaign', 'from-snapshot'].includes(trace.coverage)) {
    throw new Error('Unsupported replay contract.');
  }
  if (!trace.provenance || trace.provenance.contentHash !== contentHash(bundle)) {
    throw new Error('Replay content checksum mismatch.');
  }
  let state = validateGameStateStructure(structuredClone(trace.initialState));
  if (trace.coverage === 'full-campaign' && (state.clock.sol !== 1 || state.history.summaries.length > 0)) throw new Error('Full campaign replay must begin at Sol 1.');
  if (state.contentVersion !== bundle.balance.contentVersion || state.modelVersion !== bundle.balance.modelVersion
    || state.catalogVersion !== bundle.catalog.catalogVersion) throw new Error('Replay version mismatch.');
  assertGameState(state, bundle);
  if (stateHash(state) !== trace.initialHash) throw new Error('Initial replay checksum mismatch.');
  for (const [index, step] of trace.steps.entries()) {
    if (!step || typeof step.ok !== 'boolean' || typeof step.stateHash !== 'string' || (step.errorCode !== null && typeof step.errorCode !== 'string')) throw new Error(`Invalid replay step ${index}.`);
    const command = validateGameCommand(step.command);
    if (command.type === 'game/start') throw new Error('Replay cannot replace the recorded campaign.');
    const result = dispatchDomainCommand(state, command, bundle);
    const code = result.ok ? null : result.error.code;
    if (result.ok !== step.ok || code !== step.errorCode) throw new Error(`Command result mismatch at step ${index}.`);
    state = result.state;
    assertGameState(state, bundle);
    if (stateHash(state) !== step.stateHash) throw new Error(`State checksum mismatch at step ${index}.`);
  }
  if (stateHash(state) !== trace.finalHash) throw new Error('Final replay checksum mismatch.');
  if (state.campaign.status !== trace.expectedOutcome) throw new Error('Final replay outcome mismatch.');
  return state;
}
