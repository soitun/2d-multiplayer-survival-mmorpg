import type { EngineRuntimeSnapshot } from '../types';

type Listener = () => void;

const createInitialSnapshot = (): EngineRuntimeSnapshot => ({
  tick: 0,
  lastFrameInfo: null,
  connection: {
    connection: null,
    identityHex: null,
  },
  world: {
    predictedPosition: null,
    viewport: null,
    tables: {},
    chunkDataMap: null,
    runtimeState: {},
    derived: {},
  },
  frame: {
    renderAlpha: 1,
    visibleEntities: {},
    remotePlayerPositions: new Map(),
    canvas: {
      maskCanvas: null,
      overlayRgba: 'transparent',
    },
  },
  input: {
    movementDirection: { x: 0, y: 0 },
    sprinting: false,
    isAutoWalking: false,
    isAutoAttacking: false,
    isActivelyHolding: false,
    isCrouching: false,
    currentJumpOffsetY: 0,
    interactionProgress: null,
    optimisticProjectiles: new Map(),
    processInputsAndActions: null,
  },
  ui: {
    connected: false,
    loading: true,
    uiTables: {},
    state: {},
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

