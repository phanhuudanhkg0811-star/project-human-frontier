import { create } from 'zustand';
import { useUiStore } from './uiStore.ts';
import { loadRecording, recordCommand, saveRecording, startRecording } from '../persistence/replayRecorder.ts';
import type { CampaignReplay } from '../simulation/replay.ts';
import { dispatchDomainCommand } from '../domain/orchestrator.ts';
import { clearSavedGame, loadGameState, saveGameState } from '../persistence/saveAdapter.ts';
import { createInitialGameState, loadContentBundle, type NewGameOptions } from '../schemas/contracts.ts';
import type {
  ContentBundle,
  DispatchResult,
  DomainEffect,
  DomainError,
  GameCommand,
  GamePort,
  GameState,
  SimulationRuntimeState,
} from '../types/index.ts';

interface SandboxSnapshot {
  readonly gameState: GameState;
  readonly replayTrace: CampaignReplay;
  readonly hasSavedCampaign: boolean;
  readonly lastSavedAt: string | null;
  readonly saveRecoveryError: DomainError | null;
  readonly migrationNotice: string | null;
  readonly originScreen: 'title' | 'cockpit' | null;
}

let sandboxSnapshot: SandboxSnapshot | null = null;

interface GameStoreModel {
  readonly bundle: ContentBundle;
  readonly gameState: GameState;
  readonly runtime: SimulationRuntimeState;
  readonly hasSavedCampaign: boolean;
  readonly lastSavedAt: string | null;
  readonly saveRecoveryError: DomainError | null;
  readonly migrationNotice: string | null;
  readonly replayTrace: CampaignReplay;
  readonly lastEffects: readonly DomainEffect[];
  readonly lastError: DomainError | null;
  readonly tutorialSandboxActive: boolean;
  readonly sandboxOriginScreen: 'title' | 'cockpit' | null;
  dispatch: (command: GameCommand) => Promise<DispatchResult>;
  resetCampaign: (options?: NewGameOptions) => Promise<void>;
  clearCorruptedSaveForNewMission: () => void;
  enterSol1Sandbox: (originScreen?: 'title' | 'cockpit') => void;
  exitSol1Sandbox: () => 'title' | 'cockpit' | null;
  dismissError: () => void;
  dismissMigrationNotice: () => void;
}

const bundle = loadContentBundle();
const bootLoad = loadGameState(bundle);
const initialGameState =
  bootLoad.status === 'ok' ? bootLoad.state : createInitialGameState(bundle);
const initialHasSavedCampaign = bootLoad.status === 'ok';
const initialLastSavedAt = bootLoad.status === 'ok' ? bootLoad.envelope.savedAt : null;
const initialSaveError = bootLoad.status === 'error' ? bootLoad.error : null;
const recordingStorage = (() => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } })();

export const useGameStore = create<GameStoreModel>((set, get) => ({
  bundle,
  gameState: initialGameState,
  runtime: {
    status: initialSaveError ? 'error' : 'ready',
    loadedModelVersion: bundle.balance.modelVersion,
    loadedCatalogVersion: bundle.catalog.catalogVersion,
    error: initialSaveError,
  },
  hasSavedCampaign: initialHasSavedCampaign,
  lastSavedAt: initialLastSavedAt,
  saveRecoveryError: initialSaveError,
  migrationNotice: bootLoad.status === 'ok' ? bootLoad.migrationNotice : null,
  replayTrace: loadRecording(initialGameState, bundle, recordingStorage),
  lastEffects: [],
  lastError: null,

  tutorialSandboxActive: false,
  sandboxOriginScreen: null,

  dispatch: async (command) => {
    const current = get();
    if (current.tutorialSandboxActive) {
      const res = dispatchDomainCommand(current.gameState, command, current.bundle);
      const replayTrace = recordCommand(current.replayTrace, command, res, current.bundle);
      if (res.ok) {
        set({
          gameState: res.state,
          replayTrace,
          lastEffects: res.effects,
          lastError: null,
          runtime: {
            ...current.runtime,
            status: 'ready',
            error: null,
          },
        });
      } else {
        set({
          replayTrace,
          lastError: res.error,
          runtime: {
            ...current.runtime,
            status: 'ready',
            error: res.error,
          },
        });
      }
      return res;
    }

    if (current.saveRecoveryError && command.type !== 'game/start') {
      const blocked: DispatchResult = {
        ok: false,
        state: current.gameState,
        error: current.saveRecoveryError,
      };
      set({ lastError: current.saveRecoveryError });
      return blocked;
    }

    const res = dispatchDomainCommand(current.gameState, command, current.bundle);
    const replayTrace = recordCommand(current.replayTrace, command, res, current.bundle);
    saveRecording(replayTrace, recordingStorage);
    if (res.ok) {
      if (command.type === 'game/start') useUiStore.getState().resetCampaignUi();
      const saveRes = saveGameState(res.state);
      set({
        gameState: res.state,
        replayTrace,
        hasSavedCampaign: saveRes.ok ? true : current.hasSavedCampaign,
        lastSavedAt: saveRes.ok ? new Date().toISOString() : current.lastSavedAt,
        ...(command.type === 'game/start' ? { migrationNotice: null } : {}),
        lastEffects: res.effects,
        lastError: saveRes.ok ? null : saveRes.error,
        saveRecoveryError: null,
        runtime: {
          ...current.runtime,
          status: 'ready',
          error: saveRes.ok ? null : saveRes.error,
        },
      });
    } else {
      set({
        replayTrace,
        lastError: res.error,
        runtime: { ...current.runtime, error: res.error },
      });
    }
    return res;
  },

  resetCampaign: async (options = {}) => {
    sandboxSnapshot = null;
    clearSavedGame();
    const fresh = createInitialGameState(bundle, options);
    const replayTrace = startRecording(fresh, bundle);
    saveRecording(replayTrace, recordingStorage);
    useUiStore.getState().resetCampaignUi();
    const saveRes = saveGameState(fresh);
    set({
      gameState: fresh,
      replayTrace,
      tutorialSandboxActive: false,
      sandboxOriginScreen: null,
      hasSavedCampaign: saveRes.ok,
      lastSavedAt: saveRes.ok ? new Date().toISOString() : null,
      migrationNotice: null,
      saveRecoveryError: null,
      lastError: saveRes.ok ? null : saveRes.error,
      lastEffects: [],
      runtime: {
        status: 'ready',
        loadedModelVersion: bundle.balance.modelVersion,
        loadedCatalogVersion: bundle.catalog.catalogVersion,
        error: saveRes.ok ? null : saveRes.error,
      },
    });
  },

  clearCorruptedSaveForNewMission: () => {
    sandboxSnapshot = null;
    clearSavedGame();
    const fresh = createInitialGameState(bundle);
    const replayTrace = startRecording(fresh, bundle);
    saveRecording(replayTrace, recordingStorage);
    useUiStore.getState().resetCampaignUi();
    set({
      gameState: fresh,
      replayTrace,
      tutorialSandboxActive: false,
      sandboxOriginScreen: null,
      hasSavedCampaign: false,
      lastSavedAt: null,
      migrationNotice: null,
      saveRecoveryError: null,
      lastError: null,
      lastEffects: [],
      runtime: {
        status: 'ready',
        loadedModelVersion: bundle.balance.modelVersion,
        loadedCatalogVersion: bundle.catalog.catalogVersion,
        error: null,
      },
    });
  },

  enterSol1Sandbox: (originScreen = 'cockpit') => {
    const current = get();
    if (!sandboxSnapshot) {
      sandboxSnapshot = {
        gameState: current.gameState,
        replayTrace: current.replayTrace,
        hasSavedCampaign: current.hasSavedCampaign,
        lastSavedAt: current.lastSavedAt,
        saveRecoveryError: current.saveRecoveryError,
        migrationNotice: current.migrationNotice,
        originScreen,
      };
    }
    const sandboxState = createInitialGameState(current.bundle, {
      seed: 205001,
      difficulty: 'cadet',
    });
    const sandboxTrace = startRecording(sandboxState, current.bundle);
    set({
      gameState: sandboxState,
      replayTrace: sandboxTrace,
      tutorialSandboxActive: true,
      sandboxOriginScreen: sandboxSnapshot.originScreen,
      saveRecoveryError: null,
      migrationNotice: null,
      lastEffects: [],
      lastError: null,
      runtime: {
        ...current.runtime,
        status: 'ready',
        error: null,
      },
    });
  },

  exitSol1Sandbox: () => {
    const snapshot = sandboxSnapshot;
    sandboxSnapshot = null;
    if (!snapshot) {
      if (get().tutorialSandboxActive) {
        set({ tutorialSandboxActive: false, sandboxOriginScreen: null });
      }
      return null;
    }
    const current = get();
    set({
      gameState: snapshot.gameState,
      replayTrace: snapshot.replayTrace,
      hasSavedCampaign: snapshot.hasSavedCampaign,
      lastSavedAt: snapshot.lastSavedAt,
      saveRecoveryError: snapshot.saveRecoveryError,
      migrationNotice: snapshot.migrationNotice,
      tutorialSandboxActive: false,
      sandboxOriginScreen: null,
      lastEffects: [],
      lastError: null,
      runtime: {
        ...current.runtime,
        status: snapshot.saveRecoveryError ? 'error' : 'ready',
        error: snapshot.saveRecoveryError,
      },
    });
    return snapshot.originScreen;
  },

  dismissError: () => set({ lastError: null }),
  dismissMigrationNotice: () => set({ migrationNotice: null }),
}));

/** Adapter exposing `useGameStore` via the headless `GamePort` contract. */
export const ZustandGamePort: GamePort = {
  getSnapshot: () => useGameStore.getState().gameState,
  dispatch: (command) => useGameStore.getState().dispatch(command),
  subscribe: (listener) => useGameStore.subscribe(listener),
  getRuntimeState: () => useGameStore.getState().runtime,
  reset: () => useGameStore.getState().resetCampaign(),
};
