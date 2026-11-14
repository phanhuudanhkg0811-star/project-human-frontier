import { dispatchDomainCommand } from '../domain/orchestrator.ts';
import { createInitialGameState, loadContentBundle, type NewGameOptions } from '../schemas/contracts.ts';
import type { ContentBundle, DispatchResult, GameCommand, GamePort, GameState, SimulationRuntimeState } from '../types/index.ts';

/** Headless / mock-compatible GamePort powered by the authoritative Pure TS orchestrator. */
export class MockGamePort implements GamePort {
  private readonly bundle: ContentBundle;
  private readonly initialOptions: NewGameOptions;
  private state: GameState;
  private readonly listeners = new Set<() => void>();
  private runtime: SimulationRuntimeState;

  constructor(options: NewGameOptions = {}, bundle: ContentBundle = loadContentBundle()) {
    this.bundle = bundle;
    this.initialOptions = options;
    this.state = createInitialGameState(bundle, options);
    this.runtime = {
      status: 'ready',
      loadedModelVersion: bundle.balance.modelVersion,
      loadedCatalogVersion: bundle.catalog.catalogVersion,
      error: null,
    };
  }

  getSnapshot(): GameState {
    return this.state;
  }

  getRuntimeState(): SimulationRuntimeState {
    return this.runtime;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async dispatch(command: GameCommand): Promise<DispatchResult> {
    const result = dispatchDomainCommand(this.state, command, this.bundle);
    if (result.ok) {
      this.state = result.state;
      this.runtime = { ...this.runtime, error: null };
      for (const listener of this.listeners) {
        listener();
      }
    } else {
      this.runtime = { ...this.runtime, error: result.error };
    }
    return result;
  }

  async reset(): Promise<void> {
    this.state = createInitialGameState(this.bundle, this.initialOptions);
    this.runtime = { ...this.runtime, error: null };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
