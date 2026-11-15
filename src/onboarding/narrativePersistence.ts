import type { StorageLike } from './persistence.ts';

export const NARRATIVE_STORAGE_KEY = 'phf_narrative_v1';
export const NARRATIVE_SCHEMA_VERSION = 1;

export type MilestonePresentationId =
  | 'moon-sol1-arrival'
  | 'moon-sol7-golden-crisis'
  | 'moon-sol15-lunar-sunset'
  | 'moon-sol29-lunar-sunrise';

export const VALID_MILESTONE_IDS: ReadonlySet<MilestonePresentationId> = new Set([
  'moon-sol1-arrival',
  'moon-sol7-golden-crisis',
  'moon-sol15-lunar-sunset',
  'moon-sol29-lunar-sunrise',
]);

export interface NarrativeState {
  readonly narrativeVersion: number;
  readonly runKey: string | null;
  readonly shownMilestoneIds: readonly MilestonePresentationId[];
}

export interface NarrativeDecodeResult {
  readonly state: NarrativeState;
  readonly resetToDefault: boolean;
}

export function createDefaultNarrativeState(): NarrativeState {
  return {
    narrativeVersion: NARRATIVE_SCHEMA_VERSION,
    runKey: null,
    shownMilestoneIds: [],
  };
}

export function buildNarrativeRunKey(campaign: {
  readonly seed: number;
  readonly difficulty: string;
  readonly donkiProfileId: string;
  readonly spaceWeatherOverride?: string | null;
}): string {
  return `${campaign.seed}:${campaign.difficulty}:${campaign.donkiProfileId}:${campaign.spaceWeatherOverride ?? 'auto'}`;
}

function getSafeBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  return window.localStorage;
}

export function decodeNarrativeState(raw: string | null): NarrativeDecodeResult {
  const base = createDefaultNarrativeState();
  if (raw === null) {
    return { state: base, resetToDefault: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: base, resetToDefault: true };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { state: base, resetToDefault: true };
  }

  const record = parsed as Record<string, unknown>;
  if (
    typeof record.narrativeVersion !== 'number' ||
    !Number.isInteger(record.narrativeVersion) ||
    record.narrativeVersion !== NARRATIVE_SCHEMA_VERSION
  ) {
    return { state: base, resetToDefault: true };
  }

  if (record.runKey !== null && typeof record.runKey !== 'string') {
    return { state: base, resetToDefault: true };
  }

  if (!Array.isArray(record.shownMilestoneIds)) {
    return { state: base, resetToDefault: true };
  }

  const deduped: MilestonePresentationId[] = [];
  for (const id of record.shownMilestoneIds) {
    if (typeof id !== 'string') {
      return { state: base, resetToDefault: true };
    }
    if (VALID_MILESTONE_IDS.has(id as MilestonePresentationId) && !deduped.includes(id as MilestonePresentationId)) {
      deduped.push(id as MilestonePresentationId);
    }
  }

  return {
    state: {
      narrativeVersion: NARRATIVE_SCHEMA_VERSION,
      runKey: record.runKey as string | null,
      shownMilestoneIds: deduped,
    },
    resetToDefault: false,
  };
}

export function readNarrativeState(storage: StorageLike | null = getSafeBrowserStorage()): NarrativeState {
  if (!storage) return createDefaultNarrativeState();
  try {
    return decodeNarrativeState(storage.getItem(NARRATIVE_STORAGE_KEY)).state;
  } catch {
    return createDefaultNarrativeState();
  }
}

export function writeNarrativeState(
  state: NarrativeState,
  storage: StorageLike | null = getSafeBrowserStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(NARRATIVE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or private-mode errors safely.
  }
}
