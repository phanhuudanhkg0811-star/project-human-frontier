import { COCKPIT_DISCOVERY_STEP_IDS } from './tours/cockpitDiscoveryTour.ts';
import { MOON_SOL1_STEP_IDS } from './tours/moonSol1Tour.ts';
import type {
  CockpitTourStatus,
  IntroStatus,
  OnboardingDecodeResult,
  OnboardingState,
  Sol1GuideStatus,
  TourId,
} from './types.ts';

export const ONBOARDING_STORAGE_KEY = 'phf_onboarding_v1';
export const ONBOARDING_SCHEMA_VERSION = 1;
export const TOUR_VERSION = 'moon-sol1-v1' as const;
export const PHASE1_SAVE_STORAGE_KEY = 'human-frontier:moon32:save-v1';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}

export interface DecodeOnboardingContext {
  readonly legacyTutorialCompleted?: boolean;
  readonly hasExistingCampaignSave?: boolean;
}

const VALID_INTRO_STATUSES: ReadonlySet<IntroStatus> = new Set(['unseen', 'skipped', 'completed']);
const VALID_TOUR_IDS: ReadonlySet<TourId> = new Set(['cockpit', 'sol1']);
const VALID_SOL1_STATUSES: ReadonlySet<Sol1GuideStatus> = new Set([
  'unseen',
  'active',
  'skipped',
  'completed',
]);
const VALID_COCKPIT_STATUSES: ReadonlySet<CockpitTourStatus> = new Set([
  'unseen',
  'active',
  'skipped',
  'completed',
]);
const VALID_COCKPIT_STEPS: ReadonlySet<string> = new Set(COCKPIT_DISCOVERY_STEP_IDS);
const VALID_SOL1_STEPS: ReadonlySet<string> = new Set(MOON_SOL1_STEP_IDS);

export function createDefaultOnboardingState(): OnboardingState {
  return {
    onboardingVersion: ONBOARDING_SCHEMA_VERSION,
    introStatus: 'unseen',
    cockpitTourStatus: 'unseen',
    tourVersion: TOUR_VERSION,
    activeTour: null,
    activeStepId: null,
    sol1GuideStatus: 'unseen',
    contextualHintsEnabled: true,
    dismissedHintIds: [],
    hintLastShownSol: {},
    hintShowCounts: {},
  };
}

function getSafeBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  return window.localStorage;
}

function sanitizeNumberRecord(input: unknown): Record<string, number> | null {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof k !== 'string' || typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      return null;
    }
    out[k] = Math.floor(v);
  }
  return out;
}

function sanitizeStringRecord(input: unknown): Record<string, string> | null {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof k !== 'string' || typeof v !== 'string' || v.length === 0) {
      return null;
    }
    out[k] = v;
  }
  return out;
}

export function decodeOnboardingState(
  raw: string | null,
  context: DecodeOnboardingContext = {}
): OnboardingDecodeResult {
  const base = createDefaultOnboardingState();

  if (raw === null) {
    if (context.legacyTutorialCompleted) {
      return {
        state: {
          ...base,
          introStatus: 'completed',
          cockpitTourStatus: 'completed',
          sol1GuideStatus: 'completed',
        },
        migrated: true,
        resetToDefault: false,
        noticeCode: null,
      };
    }
    if (context.hasExistingCampaignSave) {
      return {
        state: {
          ...base,
          introStatus: 'completed',
          cockpitTourStatus: 'completed',
          sol1GuideStatus: 'unseen',
        },
        migrated: true,
        resetToDefault: false,
        noticeCode: null,
      };
    }
    return {
      state: base,
      migrated: false,
      resetToDefault: false,
      noticeCode: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      state: base,
      migrated: false,
      resetToDefault: true,
      noticeCode: 'E_ONBOARDING_CORRUPT',
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      state: base,
      migrated: false,
      resetToDefault: true,
      noticeCode: 'E_ONBOARDING_CORRUPT',
    };
  }

  const record = parsed as Record<string, unknown>;

  if (
    typeof record.onboardingVersion !== 'number' ||
    !Number.isInteger(record.onboardingVersion) ||
    record.onboardingVersion !== ONBOARDING_SCHEMA_VERSION
  ) {
    return {
      state: base,
      migrated: false,
      resetToDefault: true,
      noticeCode: 'E_ONBOARDING_VERSION',
    };
  }

  if (record.tourVersion !== TOUR_VERSION) {
    return {
      state: base,
      migrated: false,
      resetToDefault: true,
      noticeCode: 'E_ONBOARDING_VERSION',
    };
  }

  if (!VALID_INTRO_STATUSES.has(record.introStatus as IntroStatus)) {
    return {
      state: base,
      migrated: false,
      resetToDefault: true,
      noticeCode: 'E_ONBOARDING_CORRUPT',
    };
  }

  if (record.activeTour !== null && !VALID_TOUR_IDS.has(record.activeTour as TourId)) {
    return {
      state: base,
      migrated: false,
      resetToDefault: true,
      noticeCode: 'E_ONBOARDING_CORRUPT',
    };
  }

  if (!VALID_SOL1_STATUSES.has(record.sol1GuideStatus as Sol1GuideStatus)) {
    return {
      state: base,
      migrated: false,
      resetToDefault: true,
      noticeCode: 'E_ONBOARDING_CORRUPT',
    };
  }

  if (typeof record.contextualHintsEnabled !== 'boolean') {
    return {
      state: base,
      migrated: false,
      resetToDefault: true,
      noticeCode: 'E_ONBOARDING_CORRUPT',
    };
  }

  if (
    !Array.isArray(record.dismissedHintIds) ||
    !record.dismissedHintIds.every((id) => typeof id === 'string' && id.length > 0)
  ) {
    return {
      state: base,
      migrated: false,
      resetToDefault: true,
      noticeCode: 'E_ONBOARDING_CORRUPT',
    };
  }

  if (record.activeStepId !== null && typeof record.activeStepId !== 'string') {
    return {
      state: base,
      migrated: false,
      resetToDefault: true,
      noticeCode: 'E_ONBOARDING_CORRUPT',
    };
  }

  const hintLastShownSol = sanitizeNumberRecord(record.hintLastShownSol);
  const hintShowCounts = sanitizeNumberRecord(record.hintShowCounts);
  const hintSnoozedSol = sanitizeNumberRecord(record.hintSnoozedSol);
  const hintLastSeverity = sanitizeStringRecord(record.hintLastSeverity);
  if (!hintLastShownSol || !hintShowCounts || !hintSnoozedSol || !hintLastSeverity) {
    return {
      state: base,
      migrated: false,
      resetToDefault: true,
      noticeCode: 'E_ONBOARDING_CORRUPT',
    };
  }

  if (
    record.cockpitTourStatus !== undefined &&
    !VALID_COCKPIT_STATUSES.has(record.cockpitTourStatus as CockpitTourStatus)
  ) {
    return {
      state: base,
      migrated: false,
      resetToDefault: true,
      noticeCode: 'E_ONBOARDING_CORRUPT',
    };
  }

  const activeTour = record.activeTour as TourId | null;
  let sol1GuideStatus = record.sol1GuideStatus as Sol1GuideStatus;
  let cockpitTourStatus: CockpitTourStatus =
    (record.cockpitTourStatus as CockpitTourStatus | undefined) ??
    (sol1GuideStatus !== 'unseen' ? 'completed' : 'unseen');
  let activeStepId = record.activeStepId as string | null;

  if (activeTour === null) {
    activeStepId = null;
    if (sol1GuideStatus === 'active') {
      sol1GuideStatus = 'unseen';
    }
    if (cockpitTourStatus === 'active') {
      cockpitTourStatus = 'unseen';
    }
  } else if (activeTour === 'cockpit') {
    if (!activeStepId || !VALID_COCKPIT_STEPS.has(activeStepId)) {
      activeStepId = COCKPIT_DISCOVERY_STEP_IDS[0];
    }
  } else if (!activeStepId || !VALID_SOL1_STEPS.has(activeStepId)) {
    activeStepId = MOON_SOL1_STEP_IDS[0];
  }

  return {
    state: {
      onboardingVersion: ONBOARDING_SCHEMA_VERSION,
      introStatus: record.introStatus as IntroStatus,
      cockpitTourStatus,
      tourVersion: TOUR_VERSION,
      activeTour,
      activeStepId,
      sol1GuideStatus,
      contextualHintsEnabled: record.contextualHintsEnabled,
      dismissedHintIds: [...new Set(record.dismissedHintIds as string[])],
      hintLastShownSol,
      hintShowCounts,
      ...(Object.keys(hintSnoozedSol).length > 0 ? { hintSnoozedSol } : {}),
      ...(Object.keys(hintLastSeverity).length > 0 ? { hintLastSeverity } : {}),
    },
    migrated: false,
    resetToDefault: false,
    noticeCode: null,
  };
}

export function writeOnboardingState(
  state: OnboardingState,
  storage: StorageLike | null = getSafeBrowserStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota / privacy mode errors cleanly.
  }
}

export function readOnboardingState(
  storage: StorageLike | null = getSafeBrowserStorage(),
  legacyTutorialCompleted = false
): OnboardingDecodeResult {
  if (!storage) {
    return decodeOnboardingState(null, { legacyTutorialCompleted, hasExistingCampaignSave: false });
  }

  let raw: string | null = null;
  let hasExistingCampaignSave = false;
  try {
    raw = storage.getItem(ONBOARDING_STORAGE_KEY);
    hasExistingCampaignSave = storage.getItem(PHASE1_SAVE_STORAGE_KEY) !== null;
  } catch {
    return {
      state: createDefaultOnboardingState(),
      migrated: false,
      resetToDefault: false,
      noticeCode: null,
    };
  }

  const result = decodeOnboardingState(raw, {
    legacyTutorialCompleted,
    hasExistingCampaignSave,
  });

  if (result.migrated || result.resetToDefault) {
    writeOnboardingState(result.state, storage);
  }

  return result;
}
