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

interface GameStoreModel {
  readonly bundle: ContentBundle;
  readonly gameState: GameState;
  readonly runtime: SimulationRuntimeState;
  readonly saveRecoveryError: DomainError | null;
  readonly migrationNotice: string | null;
  readonly replayTrace: CampaignReplay;
  readonly lastEffects: readonly DomainEffect[];
  readonly lastError: DomainError | null;
  dispatch: (command: GameCommand) => Promise<DispatchResult>;
  resetCampaign: (options?: NewGameOptions) => Promise<void>;
  dismissError: () => void;
  dismissMigrationNotice: () => void;
}

const bundle = loadContentBundle();
const bootLoad = loadGameState(bundle);
const initialGameState =
  bootLoad.status === 'ok' ? bootLoad.state : createInitialGameState(bundle);
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
  saveRecoveryError: initialSaveError,
  migrationNotice: bootLoad.status === 'ok' ? bootLoad.migrationNotice : null,
  replayTrace: loadRecording(initialGameState, bundle, recordingStorage),
  lastEffects: [],
  lastError: null,

  dispatch: async (command) => {
    const current = get();
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
    clearSavedGame();
    const fresh = createInitialGameState(bundle, options);
    const replayTrace = startRecording(fresh, bundle);
    saveRecording(replayTrace, recordingStorage);
    useUiStore.getState().resetCampaignUi();
    const saveRes = saveGameState(fresh);
    set({
      gameState: fresh,
      replayTrace,
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
