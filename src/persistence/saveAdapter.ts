import { canonicalStringify } from '../domain/canonicalJson.ts';
import { validateStateInvariants } from '../domain/invariants.ts';
import { sha256Hex } from '../domain/prng.ts';
import { validateGameStateStructure, validateSaveEnvelopeStructure } from '../schemas/contracts.ts';
import type {
  ContentBundle,
  CrewId,
  DomainError,
  EquipmentId,
  ExpeditionId,
  GameState,
  RoverMissionResult,
  SaveEnvelope,
} from '../types/index.ts';

// Keep the legacy key so Phase 1.1/1.2 saves are discovered and upgraded in place.
export const SAVE_STORAGE_KEY = 'human-frontier:moon32:save-v1';
export const APP_VERSION = '1.4.0';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface ChecksumEnvelope {
  readonly schemaVersion: number;
  readonly savedAt: string;
  readonly appVersion: string;
  readonly contentVersion: string;
  readonly modelVersion: string;
  readonly catalogVersion: string;
  readonly state: unknown;
  readonly checksum?: string;
}

interface LegacyRoverState {
  readonly status?: 'idle' | 'outbound' | 'exploring' | 'returning' | 'broken';
  readonly expeditionId?: ExpeditionId | null;
  readonly solsRemaining?: number;
  readonly equippedItems?: readonly EquipmentId[];
  readonly samplesCollected?: readonly string[];
  readonly completedExpeditions?: readonly ExpeditionId[];
}

interface LegacyEventStateV2 {
  readonly activeEventId?: string | null;
  readonly resolvedEventIds?: readonly string[];
}

type LegacyGameStateV2 = Omit<GameState, 'schemaVersion' | 'events'> & {
  readonly schemaVersion: 2;
  readonly events: LegacyEventStateV2;
};

type LegacyGameState = Omit<LegacyGameStateV2, 'schemaVersion' | 'campaign' | 'dailyPlan' | 'rover'> & {
  readonly schemaVersion: 1;
  readonly campaign: Omit<GameState['campaign'], 'sciencePoints'>;
  readonly dailyPlan: GameState['dailyPlan'] & { readonly medkitTargets?: readonly CrewId[] };
  readonly rover: LegacyRoverState;
};

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) return globalThis.localStorage;
  } catch {
    return null;
  }
  return null;
}

export type SaveEnvelopeUnsigned = Omit<SaveEnvelope, 'checksum'>;

export function computeStateChecksum(state: GameState): string {
  return sha256Hex(canonicalStringify(state));
}

export function computeEnvelopeChecksum(envelope: ChecksumEnvelope): string {
  return sha256Hex(canonicalStringify({
    schemaVersion: envelope.schemaVersion,
    savedAt: envelope.savedAt,
    appVersion: envelope.appVersion,
    contentVersion: envelope.contentVersion,
    modelVersion: envelope.modelVersion,
    catalogVersion: envelope.catalogVersion,
    state: envelope.state,
  }));
}

export function buildSaveEnvelope(state: GameState, nowIso = new Date().toISOString()): SaveEnvelope {
  const unsigned: SaveEnvelopeUnsigned = {
    schemaVersion: 4,
    savedAt: nowIso,
    appVersion: APP_VERSION,
    contentVersion: state.contentVersion,
    modelVersion: state.modelVersion,
    catalogVersion: state.catalogVersion,
    state,
  };
  return { ...unsigned, checksum: computeEnvelopeChecksum(unsigned) };
}

export function migrateSaveV1ToV2(legacy: LegacyGameState, bundle: ContentBundle): GameState {
  const oldRover = legacy.rover;
  const completed = oldRover.completedExpeditions ?? [];
  const expeditionById = new Map(bundle.campaign.expeditions.map((entry) => [entry.id, entry]));
  const missionHistory: RoverMissionResult[] = completed.map((id) => {
    const expedition = expeditionById.get(id);
    return {
      expeditionId: id,
      outcome: 'completed',
      launchedSol: null,
      settledSol: Math.max(1, legacy.clock.sol),
      rewardSampleGranted: expedition?.rewardSample ?? null,
      scienceGranted: expedition?.rewards.science ?? 0,
      launchOperatorCrewId: null,
      recoveryOperatorCrewId: null,
      equippedItems: [],
      incidents: [],
    };
  });

  const equipment = { ...legacy.equipment };
  let activeMission: GameState['rover']['activeMission'] = null;
  const activeExpedition = oldRover.expeditionId ? expeditionById.get(oldRover.expeditionId) : undefined;
  const oldStatus = oldRover.status ?? 'idle';
  const activeItems = oldRover.equippedItems ?? [];

  if (activeExpedition && !completed.includes(activeExpedition.id) && ['outbound', 'exploring', 'returning'].includes(oldStatus)) {
    const assignedOperator = (Object.keys(legacy.crew) as CrewId[]).find(
      (id) => legacy.crew[id].assignedTask?.type === 'rover-operate'
    );
    const launchOperatorCrewId: CrewId = assignedOperator ?? 'geo';
    const travelTicksCompleted = oldStatus === 'returning' ? 2 : 1;
    activeMission = {
      expeditionId: activeExpedition.id,
      status: oldStatus === 'outbound' ? 'outbound' : 'exploring',
      scheduledSol: Math.max(1, legacy.clock.sol - travelTicksCompleted + 1),
      launchedSol: Math.max(1, legacy.clock.sol - travelTicksCompleted + 1),
      statusEnteredSol: legacy.clock.sol,
      expectedReturnSol: legacy.clock.sol + (3 - travelTicksCompleted),
      launchOperatorCrewId,
      recoveryOperatorCrewId: null,
      equippedItems: activeItems,
      travelTicksCompleted,
      signalLostSols: 0,
      resumeStatus: null,
      recoveryDelaySols: 0,
      incidents: [],
    };
  } else if (activeExpedition && oldStatus === 'broken' && !completed.includes(activeExpedition.id)) {
    missionHistory.push({
      expeditionId: activeExpedition.id,
      outcome: 'failed',
      launchedSol: null,
      settledSol: legacy.clock.sol,
      rewardSampleGranted: null,
      scienceGranted: 0,
      launchOperatorCrewId: null,
      recoveryOperatorCrewId: null,
      equippedItems: activeItems,
      incidents: [{ kind: 'signal-timeout', occurredSol: legacy.clock.sol, summary: 'Migrated from legacy broken Rover state.' }],
    });
  }

  for (const id of Object.keys(equipment) as EquipmentId[]) {
    equipment[id] = { ...equipment[id], reservedForRover: Boolean(activeMission?.equippedItems.includes(id)) };
  }

  const sciencePoints = missionHistory.reduce((sum, result) => sum + result.scienceGranted, 0);
  const migratedV2: LegacyGameStateV2 = {
    ...legacy,
    schemaVersion: 2,
    contentVersion: bundle.balance.contentVersion,
    modelVersion: bundle.balance.modelVersion,
    catalogVersion: bundle.catalog.catalogVersion,
    campaign: { ...legacy.campaign, sciencePoints },
    dailyPlan: {
      sol: legacy.dailyPlan.sol,
      status: legacy.dailyPlan.status,
      wrsEnabled: legacy.dailyPlan.wrsEnabled,
      powerPriority: legacy.dailyPlan.powerPriority,
      mreTargets: legacy.dailyPlan.mreTargets,
    },
    equipment,
    rover: { activeMission, missionHistory },
  };
  return migrateSaveV2ToV3(migratedV2, bundle);
}

export function migrateSaveV2ToV3(legacy: LegacyGameStateV2, bundle: ContentBundle): GameState {
  const rawEvents = legacy.events ?? {};
  const activeEventId = typeof rawEvents.activeEventId === 'string' && rawEvents.activeEventId.length > 0
    ? rawEvents.activeEventId
    : null;
  const matchedEvent = activeEventId ? bundle.events.find((e) => e.id === activeEventId) : undefined;
  const activeEvent = activeEventId
    ? {
        eventId: activeEventId,
        triggeredAtSol: legacy.clock.sol,
        deadlineSol: legacy.clock.sol + (matchedEvent?.deadlineOffsetSols ?? 0),
        context: {},
      }
    : null;
  const resolvedEventIds = [...new Set(rawEvents.resolvedEventIds ?? [])];
  const occurrenceHistory = resolvedEventIds.map((eventId) => ({
    eventId,
    triggeredSol: 1,
    settledSol: Math.max(1, legacy.clock.sol),
    outcome: 'resolved' as const,
    choiceId: null,
  }));

  const upgradeSummary = (summary: GameState['debrief']['lastSummary']) =>
    summary
      ? {
          ...summary,
          debriefContext: summary.debriefContext ?? null,
          checkpoint: null,
        }
      : null;

  const migrated: GameState = {
    ...legacy,
    schemaVersion: 4,
    campaign: { ...legacy.campaign, outcome: legacyOutcome(legacy.campaign) },
    contentVersion: bundle.balance.contentVersion,
    modelVersion: bundle.balance.modelVersion,
    catalogVersion: bundle.catalog.catalogVersion,
    events: {
      activeEventId,
      activeEvent,
      resolvedEventIds,
      occurrenceHistory,
      flags: {},
      pendingFollowUps: [],
    },
    debrief: {
      ...legacy.debrief,
      lastSummary: upgradeSummary(legacy.debrief.lastSummary),
    },
    history: {
      ...legacy.history,
      summaries: legacy.history.summaries.map((s) => upgradeSummary(s)!),
    },
  };
  return validateGameStateStructure(migrated);
}

function legacyOutcome(campaign: GameState['campaign']): GameState['campaign']['outcome'] {
  if (campaign.status !== 'victory' && campaign.status !== 'defeat') return null;
  return { status: campaign.status, reasonCode: 'legacy-outcome', requirements: [], rank: null, rankingVersion: null };
}

/** Keep original terminal results; new metrics start at the first Sol resolved after migration. */
export function migrateSaveV3ToV4(input: unknown, bundle: ContentBundle): GameState {
  if (!input || typeof input !== 'object' || (input as { schemaVersion?: number }).schemaVersion !== 3) throw new Error('Expected GameState v3.');
  const legacy = input as GameState;
  const upgrade = (summary: GameState['debrief']['lastSummary']) => summary ? { ...summary, checkpoint: null } : null;
  return validateGameStateStructure({ ...legacy, schemaVersion: 4,
    contentVersion: bundle.balance.contentVersion, modelVersion: bundle.balance.modelVersion, catalogVersion: bundle.catalog.catalogVersion,
    campaign: { ...legacy.campaign, outcome: legacyOutcome(legacy.campaign) },
    debrief: { ...legacy.debrief, lastSummary: upgrade(legacy.debrief.lastSummary) },
    history: { ...legacy.history, summaries: legacy.history.summaries.map((summary) => upgrade(summary)) },
  });
}

export type SaveWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: DomainError };

export type LoadSaveResult =
  | { readonly status: 'empty' }
  | { readonly status: 'ok'; readonly state: GameState; readonly envelope: SaveEnvelope; readonly migrationNotice: string | null }
  | { readonly status: 'error'; readonly error: DomainError };

export function saveGameState(state: GameState, storage: StorageLike | null = getDefaultStorage(), nowIso?: string): SaveWriteResult {
  if (!storage) return { ok: false, error: { code: 'E_SAVE_CORRUPTED', message: 'Trình duyệt không hỗ trợ localStorage.', recoverable: true } };
  try {
    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(buildSaveEnvelope(state, nowIso)));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: { code: 'E_SAVE_CORRUPTED', message: `Không thể ghi Save: ${error instanceof Error ? error.message : String(error)}`, recoverable: true } };
  }
}

function loadError(code: DomainError['code'], message: string): LoadSaveResult {
  return { status: 'error', error: { code, message, recoverable: true } };
}

function readRawEnvelope(parsed: unknown): ChecksumEnvelope {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('SaveEnvelope phải là object.');
  const value = parsed as Record<string, unknown>;
  for (const key of ['schemaVersion', 'savedAt', 'appVersion', 'contentVersion', 'modelVersion', 'catalogVersion', 'state', 'checksum']) {
    if (!(key in value)) throw new Error(`SaveEnvelope thiếu trường ${key}.`);
  }
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3 && value.schemaVersion !== 4) {
    throw new Error('Unsupported save schemaVersion.');
  }
  for (const key of ['savedAt', 'appVersion', 'contentVersion', 'modelVersion', 'catalogVersion', 'checksum']) {
    if (typeof value[key] !== 'string') throw new Error(`SaveEnvelope.${key} không hợp lệ.`);
  }
  return value as unknown as ChecksumEnvelope;
}

export function loadGameState(bundle: ContentBundle, storage: StorageLike | null = getDefaultStorage()): LoadSaveResult {
  if (!storage) return { status: 'empty' };
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_STORAGE_KEY);
  } catch {
    return { status: 'empty' };
  }
  if (!raw) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return loadError('E_SAVE_CORRUPTED', 'File Save JSON bị hỏng.');
  }

  let rawEnvelope: ChecksumEnvelope;
  try {
    rawEnvelope = readRawEnvelope(parsed);
  } catch (error) {
    return loadError('E_CONTRACT_MISMATCH', error instanceof Error ? error.message : 'SaveEnvelope không hợp lệ.');
  }
  if (rawEnvelope.checksum !== computeEnvelopeChecksum(rawEnvelope)) return loadError('E_SAVE_CORRUPTED', 'Checksum SaveEnvelope không khớp.');
  const sourceState = rawEnvelope.state as {
    schemaVersion?: number; contentVersion?: string; modelVersion?: string; catalogVersion?: string;
  } | null;
  if (!sourceState || sourceState.schemaVersion !== rawEnvelope.schemaVersion || sourceState.contentVersion !== rawEnvelope.contentVersion || sourceState.modelVersion !== rawEnvelope.modelVersion || sourceState.catalogVersion !== rawEnvelope.catalogVersion) return loadError('E_CONTRACT_MISMATCH', 'Metadata save không khớp state.');
  if (rawEnvelope.schemaVersion < 4) {
    // Explicit source versions, rather than rewriting arbitrary future/unknown saves.
    if (![bundle.balance.contentVersion, '1.1.0-moon32'].includes(rawEnvelope.contentVersion)) return loadError('E_CONTRACT_MISMATCH', 'Không nhận diện content của save cũ.');
    if (![bundle.balance.modelVersion, '1.1.0-ts-donki'].includes(rawEnvelope.modelVersion)) return loadError('E_MODEL_MISMATCH', 'Không nhận diện model của save cũ.');
    if (rawEnvelope.catalogVersion !== bundle.catalog.catalogVersion) return loadError('E_CATALOG_MISMATCH', 'Không nhận diện catalog của save cũ.');
  }

  let state: GameState;
  let migrated = false;
  try {
    if (rawEnvelope.schemaVersion === 1) {
      state = migrateSaveV1ToV2(rawEnvelope.state as LegacyGameState, bundle);
      migrated = true;
    } else if (rawEnvelope.schemaVersion === 2) {
      state = migrateSaveV2ToV3(rawEnvelope.state as LegacyGameStateV2, bundle);
      migrated = true;
    } else if (rawEnvelope.schemaVersion === 3) {
      state = migrateSaveV3ToV4(rawEnvelope.state, bundle);
      migrated = true;
    } else {
      const envelope = validateSaveEnvelopeStructure(parsed);
      if (envelope.appVersion !== APP_VERSION) return loadError('E_CONTRACT_MISMATCH', `Phiên bản ứng dụng không khớp (Save: ${envelope.appVersion}, App: ${APP_VERSION}).`);
      state = envelope.state;
    }
  } catch (error) {
    return loadError('E_CONTRACT_MISMATCH', error instanceof Error ? error.message : 'Không thể migrate/validate Save.');
  }

  if (state.contentVersion !== bundle.balance.contentVersion) return loadError('E_CONTRACT_MISMATCH', 'Phiên bản content không khớp.');
  if (state.modelVersion !== bundle.balance.modelVersion) return loadError('E_MODEL_MISMATCH', 'Phiên bản simulation không khớp.');
  if (state.catalogVersion !== bundle.catalog.catalogVersion) return loadError('E_CATALOG_MISMATCH', 'Phiên bản catalog không khớp.');
  const invariantError = validateStateInvariants(state, bundle);
  if (invariantError) return { status: 'error', error: { ...invariantError, recoverable: true } };

  const envelope = buildSaveEnvelope(state, migrated ? new Date().toISOString() : rawEnvelope.savedAt);
  if (migrated) {
    try {
      // Preserve the exact original before rewriting the main slot.
      storage.setItem(`${SAVE_STORAGE_KEY}:pre-v4`, raw);
      storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      // The migrated state is usable for this session even if rewrite is denied.
    }
  }
  return { status: 'ok', state, envelope, migrationNotice: migrated ? `Đã nâng cấp save v${rawEnvelope.schemaVersion} lên v4. Tiếp tục theo luật Phase 1.4; báo cáo lịch sử thiếu dữ liệu được ghi rõ. Bản gốc đã được giữ nếu bộ nhớ trình duyệt cho phép.` : null };
}

export function clearSavedGame(storage: StorageLike | null = getDefaultStorage()): void {
  try {
    storage?.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // Ignore storage denial errors when clearing.
  }
}
