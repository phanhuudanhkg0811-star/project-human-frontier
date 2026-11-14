import { create } from 'zustand';
import { playSfx, type SfxName } from '../audio/sfx.ts';
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
  readonly lastEffects: readonly DomainEffect[];
  readonly lastError: DomainError | null;
  dispatch: (command: GameCommand) => Promise<DispatchResult>;
  resetCampaign: (options?: NewGameOptions) => Promise<void>;
  dismissError: () => void;
}

const EFFECT_SFX: Partial<Record<DomainEffect['type'], SfxName>> = {
  'event-resolved': 'click',
  'cargo-ordered': 'radio',
  'rover-scheduled': 'launch',
  'sol-resolved': 'endSol',
};

function playEffectSfx(command: GameCommand, prev: GameState, next: GameState, effects: readonly DomainEffect[]): void {
  if (next.events.activeEventId && !prev.events.activeEventId) playSfx('alert');
  if (command.type === 'fabricator/queue') {
    playSfx(command.action === 'upgrade' ? 'upgrade' : 'repair');
    return;
  }
  for (const e of effects) {
    const name = EFFECT_SFX[e.type];
    if (name) playSfx(name, name === 'launch' ? 0.8 : 0.6);
  }
}

const bundle = loadContentBundle();
const bootLoad = loadGameState(bundle);
const initialGameState =
  bootLoad.status === 'ok' ? bootLoad.state : createInitialGameState(bundle);
const initialSaveError = bootLoad.status === 'error' ? bootLoad.error : null;

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
    if (res.ok) {
      playEffectSfx(command, current.gameState, res.state, res.effects);
      const saveRes = saveGameState(res.state);
      set({
        gameState: res.state,
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
        lastError: res.error,
        runtime: { ...current.runtime, error: res.error },
      });
    }
    return res;
  },

  resetCampaign: async (options = {}) => {
    clearSavedGame();
    const fresh = createInitialGameState(bundle, options);
    const saveRes = saveGameState(fresh);
    set({
      gameState: fresh,
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
}));

/** Adapter exposing `useGameStore` via the headless `GamePort` contract. */
export const ZustandGamePort: GamePort = {
  getSnapshot: () => useGameStore.getState().gameState,
  dispatch: (command) => useGameStore.getState().dispatch(command),
  subscribe: (listener) => useGameStore.subscribe(listener),
  getRuntimeState: () => useGameStore.getState().runtime,
  reset: () => useGameStore.getState().resetCampaign(),
};
