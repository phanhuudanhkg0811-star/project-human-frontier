export const INTRO_SESSION_STORAGE_KEY = 'phf_intro_session_v1';

export type IntroVisualKey =
  | 'outpost'
  | 'crew'
  | 'resources'
  | 'rover'
  | 'night'
  | 'command';

export interface IntroSceneDefinition {
  readonly id:
    | 'intro-outpost-2050'
    | 'intro-crew-habitat'
    | 'intro-finite-resources'
    | 'intro-rover-science'
    | 'intro-lunar-night'
    | 'intro-take-command';
  readonly durationSec: number;
  readonly idea: string;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly visualKey: IntroVisualKey;
}

export const INTRO_SCENES: readonly IntroSceneDefinition[] = [
  {
    id: 'intro-outpost-2050',
    durationSec: 12,
    idea: 'Year 2050 Lunar South Pole outpost',
    titleKey: 'intro.scenes.intro-outpost-2050.title',
    bodyKey: 'intro.scenes.intro-outpost-2050.body',
    visualKey: 'outpost',
  },
  {
    id: 'intro-crew-habitat',
    durationSec: 12,
    idea: 'Four astronauts in closed-loop habitat',
    titleKey: 'intro.scenes.intro-crew-habitat.title',
    bodyKey: 'intro.scenes.intro-crew-habitat.body',
    visualKey: 'crew',
  },
  {
    id: 'intro-finite-resources',
    durationSec: 12,
    idea: 'Finite O2, water, food, and battery power',
    titleKey: 'intro.scenes.intro-finite-resources.title',
    bodyKey: 'intro.scenes.intro-finite-resources.body',
    visualKey: 'resources',
  },
  {
    id: 'intro-rover-science',
    durationSec: 12,
    idea: 'Rover surveys crater, regolith field, and PSR',
    titleKey: 'intro.scenes.intro-rover-science.title',
    bodyKey: 'intro.scenes.intro-rover-science.body',
    visualKey: 'rover',
  },
  {
    id: 'intro-lunar-night',
    durationSec: 14,
    idea: 'Lunar Night begins at Sol 15 with 0 solar',
    titleKey: 'intro.scenes.intro-lunar-night.title',
    bodyKey: 'intro.scenes.intro-lunar-night.body',
    visualKey: 'night',
  },
  {
    id: 'intro-take-command',
    durationSec: 13,
    idea: 'Player takes command for 32 Sols',
    titleKey: 'intro.scenes.intro-take-command.title',
    bodyKey: 'intro.scenes.intro-take-command.body',
    visualKey: 'command',
  },
];

export const INTRO_TOTAL_DURATION_SEC = INTRO_SCENES.reduce(
  (sum, scene) => sum + scene.durationSec,
  0
);

export type IntroSessionMode = 'first-run' | 'replay';
export type IntroSessionReturnScreen = 'title' | 'cockpit';

export interface IntroSessionState {
  readonly sceneIndex: number;
  readonly mode: IntroSessionMode;
  readonly returnScreen: IntroSessionReturnScreen;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function resolveSessionStorage(explicit?: StorageLike | null): StorageLike | null {
  if (explicit !== undefined) return explicit;
  if (typeof window === 'undefined') return null;
  try {
    return typeof window.sessionStorage === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function clampIntroSceneIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(INTRO_SCENES.length - 1, Math.max(0, Math.floor(index)));
}

export function readIntroSessionScene(explicit?: StorageLike | null): IntroSessionState | null {
  const storage = resolveSessionStorage(explicit);
  if (!storage) return null;
  try {
    const raw = storage.getItem(INTRO_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<IntroSessionState> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const mode: IntroSessionMode = parsed.mode === 'replay' ? 'replay' : 'first-run';
    const returnScreen: IntroSessionReturnScreen =
      parsed.returnScreen === 'cockpit' ? 'cockpit' : 'title';
    return {
      sceneIndex: clampIntroSceneIndex(typeof parsed.sceneIndex === 'number' ? parsed.sceneIndex : 0),
      mode,
      returnScreen,
    };
  } catch {
    return null;
  }
}

export function writeIntroSessionScene(
  sceneIndex: number,
  mode: IntroSessionMode,
  returnScreen: IntroSessionReturnScreen,
  explicit?: StorageLike | null
): void {
  const storage = resolveSessionStorage(explicit);
  if (!storage) return;
  try {
    const payload: IntroSessionState = {
      sceneIndex: clampIntroSceneIndex(sceneIndex),
      mode,
      returnScreen,
    };
    storage.setItem(INTRO_SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or restricted-mode errors.
  }
}

export function clearIntroSessionScene(explicit?: StorageLike | null): void {
  const storage = resolveSessionStorage(explicit);
  if (!storage) return;
  try {
    storage.removeItem(INTRO_SESSION_STORAGE_KEY);
  } catch {
    // Ignore restricted-mode errors.
  }
}
