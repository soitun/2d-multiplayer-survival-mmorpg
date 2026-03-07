import type { FrameInfo } from '../hooks/useGameLoop';
import { UiSnapshotStore } from './store/uiSnapshotStore';
import type { EngineRuntimeIntent, EngineRuntimeSnapshot, RuntimeEngineConfig } from './types';

type FrameCallback = (frameInfo: FrameInfo) => void;
type StateUpdater<T> = T | ((current: T) => T);

const DELTA_TIME_MIN_MS = 0.1;
const DELTA_TIME_MAX_MS = 100;
const ACCUMULATOR_CAP_MULTIPLIER = 4;

export class RuntimeEngine {
  private readonly snapshotStore = new UiSnapshotStore();

  private frameCallback: FrameCallback | null = null;
  private requestId = 0;
  private running = false;
  private frameCount = 0;
  private lastTime = 0;
  private accumulator = 0;
  private fpsCounter = { frames: 0, lastSecond: 0 };
  private currentFps = 60;
  private config: Required<RuntimeEngineConfig> = {
    targetFPS: 60,
    maxFrameTime: 33,
    enableProfiling: false,
  };

  configure(config: RuntimeEngineConfig): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  start(config?: RuntimeEngineConfig): void {
    if (config) {
      this.configure(config);
    }
    if (this.running) {
      return;
    }

    this.running = true;
    const now = performance.now();
    this.lastTime = now;
    this.frameCount = 0;
    this.accumulator = 0;
    this.fpsCounter = { frames: 0, lastSecond: Math.floor(now / 1000) };
    this.requestId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.requestId);
    this.requestId = 0;
  }

  setFrameCallback(callback: FrameCallback | null): void {
    this.frameCallback = callback;
  }

  dispatch(intent: EngineRuntimeIntent): void {
    if (intent.type === 'movement/setDirection') {
      this.updateInputState('movementDirection', intent.direction);
      return;
    }

    if (intent.type === 'interaction/setTarget') {
      this.updateUiState('interactionTarget', intent.target);
      return;
    }

    if (intent.type === 'ui/openPanel') {
      this.updateUiState('openPanel', intent.panel);
      return;
    }

    if (intent.type === 'ui/closePanel') {
      this.updateUiState('openPanel', (current) => (current === intent.panel ? null : current));
      return;
    }

    if (intent.type === 'runtime/setConnectionState') {
      this.snapshotStore.updateSnapshot((current) => ({
        ...current,
        ui: {
          ...current.ui,
          connected: intent.connected,
          loading: intent.loading ?? current.ui.loading,
        },
      }));
      return;
    }

    // Keep dispatch no-op for intents not fully migrated yet.
    this.snapshotStore.updateSnapshot((current) => current);
  }

  getSnapshot = (): EngineRuntimeSnapshot => this.snapshotStore.getSnapshot();

  subscribe = (listener: () => void): (() => void) => this.snapshotStore.subscribe(listener);

  updateSnapshot = (updater: (current: EngineRuntimeSnapshot) => EngineRuntimeSnapshot): void => {
    this.snapshotStore.updateSnapshot(updater);
  };

  ensureWorldTable<T>(key: string, initialValue: T): void {
    this.snapshotStore.updateSnapshot((current) => {
      if (key in current.world.tables) {
        return current;
      }
      return {
        ...current,
        world: {
          ...current.world,
          tables: {
            ...current.world.tables,
            [key]: initialValue,
          },
        },
      };
    });
  }

  updateWorldTable<T>(key: string, updater: (current: T | undefined) => T): void {
    this.snapshotStore.updateSnapshot((current) => ({
      ...current,
      world: {
        ...current.world,
        tables: {
          ...current.world.tables,
          [key]: updater(current.world.tables[key] as T | undefined),
        },
      },
    }));
  }

  ensureUiTable<T>(key: string, initialValue: T): void {
    this.snapshotStore.updateSnapshot((current) => {
      if (key in current.ui.uiTables) {
        return current;
      }
      return {
        ...current,
        ui: {
          ...current.ui,
          uiTables: {
            ...current.ui.uiTables,
            [key]: initialValue,
          },
        },
      };
    });
  }

  updateUiTable<T>(key: string, updater: (current: T | undefined) => T): void {
    this.snapshotStore.updateSnapshot((current) => ({
      ...current,
      ui: {
        ...current.ui,
        uiTables: {
          ...current.ui.uiTables,
          [key]: updater(current.ui.uiTables[key] as T | undefined),
        },
      },
    }));
  }

  updateWorldState<T>(key: string, updater: StateUpdater<T>): void {
    this.snapshotStore.updateSnapshot((current) => ({
      ...current,
      world: {
        ...current.world,
        runtimeState: {
          ...current.world.runtimeState,
          [key]: this.resolveUpdater(updater, current.world.runtimeState[key] as T),
        },
      },
    }));
  }

  updateUiState<T>(key: string, updater: StateUpdater<T>): void {
    this.snapshotStore.updateSnapshot((current) => ({
      ...current,
      ui: {
        ...current.ui,
        state: {
          ...current.ui.state,
          [key]: this.resolveUpdater(updater, current.ui.state[key] as T),
        },
      },
    }));
  }

  updateFrameState<T>(key: keyof EngineRuntimeSnapshot['frame'], updater: StateUpdater<T>): void {
    this.snapshotStore.updateSnapshot((current) => ({
      ...current,
      frame: {
        ...current.frame,
        [key]: this.resolveUpdater(updater, current.frame[key] as T),
      },
    }));
  }

  updateInputState<T>(key: keyof EngineRuntimeSnapshot['input'], updater: StateUpdater<T>): void {
    this.snapshotStore.updateSnapshot((current) => ({
      ...current,
      input: {
        ...current.input,
        [key]: this.resolveUpdater(updater, current.input[key] as T),
      },
    }));
  }

  setConnection(connection: unknown | null, identityHex: string | null): void {
    this.snapshotStore.updateSnapshot((current) => ({
      ...current,
      connection: {
        connection,
        identityHex,
      },
    }));
  }

  setWorldViewport(viewport: EngineRuntimeSnapshot['world']['viewport']): void {
    this.snapshotStore.updateSnapshot((current) => ({
      ...current,
      world: {
        ...current.world,
        viewport,
      },
    }));
  }

  setPredictedPosition(predictedPosition: EngineRuntimeSnapshot['world']['predictedPosition']): void {
    this.snapshotStore.updateSnapshot((current) => ({
      ...current,
      world: {
        ...current.world,
        predictedPosition,
      },
    }));
  }

  setWorldChunkDataMap(chunkDataMap: EngineRuntimeSnapshot['world']['chunkDataMap']): void {
    this.snapshotStore.updateSnapshot((current) => ({
      ...current,
      world: {
        ...current.world,
        chunkDataMap,
      },
    }));
  }

  updateWorldDerived<T>(key: string, updater: StateUpdater<T>): void {
    this.snapshotStore.updateSnapshot((current) => ({
      ...current,
      world: {
        ...current.world,
        derived: {
          ...current.world.derived,
          [key]: this.resolveUpdater(updater, current.world.derived[key] as T),
        },
      },
    }));
  }

  private resolveUpdater<T>(updater: StateUpdater<T>, current: T): T {
    return typeof updater === 'function'
      ? (updater as (value: T) => T)(current)
      : updater;
  }

  private loop = (currentTime: number): void => {
    if (!this.running) return;

    const targetIntervalMs =
      this.config.targetFPS > 0 ? 1000 / this.config.targetFPS : 0;
    const accumulatorCap =
      targetIntervalMs > 0
        ? targetIntervalMs * ACCUMULATOR_CAP_MULTIPLIER
        : DELTA_TIME_MAX_MS;
    const rawDelta = currentTime - this.lastTime;
    this.lastTime = currentTime;

    this.accumulator = Math.min(this.accumulator + rawDelta, accumulatorCap);

    // Uncapped mode: render/update on every RAF for smoother high-refresh motion.
    const callbackDeltaMs =
      targetIntervalMs > 0 ? this.accumulator : rawDelta;
    if (targetIntervalMs > 0 && this.accumulator < targetIntervalMs) {
      this.requestId = requestAnimationFrame(this.loop);
      return;
    }

    if (targetIntervalMs > 0) {
      this.accumulator = 0;
    }

    this.frameCount += 1;
    const deltaTime = Math.max(
      DELTA_TIME_MIN_MS,
      Math.min(callbackDeltaMs, DELTA_TIME_MAX_MS)
    );

    const currentSecond = Math.floor(currentTime / 1000);
    if (currentSecond !== this.fpsCounter.lastSecond) {
      this.currentFps = this.fpsCounter.frames;
      this.fpsCounter = { frames: 0, lastSecond: currentSecond };
    }
    this.fpsCounter.frames += 1;

    const frameInfo: FrameInfo = {
      deltaTime,
      frameCount: this.frameCount,
      fps: this.currentFps,
    };

    if (this.frameCallback) {
      try {
        this.frameCallback(frameInfo);
      } catch (error) {
        console.error('[RuntimeEngine] Frame callback failed:', error);
      }
    }

    this.snapshotStore.updateSnapshot((current) => ({
      ...current,
      tick: current.tick + 1,
      lastFrameInfo: frameInfo,
    }));

    this.requestId = requestAnimationFrame(this.loop);
  };
}

export const runtimeEngine = new RuntimeEngine();

