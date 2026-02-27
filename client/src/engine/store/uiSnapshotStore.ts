import type { EngineRuntimeSnapshot } from '../types';

type Listener = () => void;

const createInitialSnapshot = (): EngineRuntimeSnapshot => ({
  tick: 0,
  lastFrameInfo: null,
  world: {
    predictedPosition: null,
    viewport: null,
    tables: {},
  },
  ui: {
    connected: false,
    loading: true,
    uiTables: {},
  },
});

export class UiSnapshotStore {
  private snapshot: EngineRuntimeSnapshot = createInitialSnapshot();

  private readonly listeners = new Set<Listener>();

  getSnapshot = (): EngineRuntimeSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setSnapshot = (next: EngineRuntimeSnapshot): void => {
    this.snapshot = next;
    this.emit();
  };

  updateSnapshot = (updater: (current: EngineRuntimeSnapshot) => EngineRuntimeSnapshot): void => {
    this.snapshot = updater(this.snapshot);
    this.emit();
  };

  reset = (): void => {
    this.snapshot = createInitialSnapshot();
    this.emit();
  };

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

