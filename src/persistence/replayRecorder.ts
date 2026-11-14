import { canonicalStringify } from '../domain/canonicalJson.ts';
import { sha256Hex } from '../domain/prng.ts';
import { contentHash, replayCampaign, stateHash, type CampaignReplay } from '../simulation/replay.ts';
import type { ContentBundle, DispatchResult, GameCommand, GameState } from '../types/index.ts';
import type { StorageLike } from './saveAdapter.ts';

export const REPLAY_STORAGE_KEY = 'human-frontier:moon32:replay-v1';
export function startRecording(state: GameState, bundle: ContentBundle, fullCampaign = state.clock.sol === 1 && state.revision === 0): CampaignReplay {
  return { replayVersion: 1, policy: 'human-player',
    coverage: fullCampaign ? 'full-campaign' : 'from-snapshot',
    provenance: { buildId: null, contentHash: contentHash(bundle), rankingVersion: bundle.campaign.ranking.version },
    initialState: structuredClone(state), initialHash: stateHash(state), steps: [], finalHash: stateHash(state), expectedOutcome: state.campaign.status };
}
export function recordCommand(trace: CampaignReplay, command: GameCommand, result: DispatchResult, bundle: ContentBundle): CampaignReplay {
  if (command.type === 'game/start') return result.ok ? startRecording(result.state, bundle, true) : trace;
  return { ...trace, steps: [...trace.steps, { command: JSON.parse(canonicalStringify(command)), ok: result.ok,
    errorCode: result.ok ? null : result.error.code, stateHash: stateHash(result.state) }],
    finalHash: stateHash(result.state), expectedOutcome: result.state.campaign.status };
}
export function loadRecording(state: GameState, bundle: ContentBundle, storage: StorageLike | null): CampaignReplay {
  try {
    const raw = storage?.getItem(REPLAY_STORAGE_KEY);
    if (raw) {
      const envelope = JSON.parse(raw);
      if (envelope.checksum === sha256Hex(canonicalStringify(envelope.trace)) && envelope.trace.finalHash === stateHash(state)) {
        replayCampaign(envelope.trace, bundle);
        return envelope.trace;
      }
    }
  } catch { /* A missing or old recorder cannot invalidate an otherwise valid save. */ }
  return startRecording(state, bundle);
}
export function saveRecording(trace: CampaignReplay, storage: StorageLike | null): void {
  try { storage?.setItem(REPLAY_STORAGE_KEY, JSON.stringify({ trace, checksum: sha256Hex(canonicalStringify(trace)) })); }
  catch { /* Gameplay/save remain usable if recording storage is denied or full. */ }
}
