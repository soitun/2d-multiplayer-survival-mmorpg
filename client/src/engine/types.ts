import type { FrameInfo } from '../hooks/useGameLoop';

export interface EngineConnectionSnapshot {
  connection: unknown | null;
  identityHex: string | null;
}

export interface EngineWorldSnapshot {
  predictedPosition: { x: number; y: number } | null;
  viewport: { minX: number; minY: number; maxX: number; maxY: number } | null;
  tables: Record<string, unknown>;
  chunkDataMap: Map<string, unknown> | null;
  runtimeState: Record<string, unknown>;
  derived: Record<string, unknown>;
}

export interface EngineFrameSnapshot {
  renderAlpha: number;
  visibleEntities: Record<string, unknown>;
  remotePlayerPositions: Map<string, { x: number; y: number }>;
  canvas: {
    maskCanvas: HTMLCanvasElement | null;
    overlayRgba: string;
  };
}

export interface EngineInputSnapshot {
  movementDirection: { x: number; y: number };
  sprinting: boolean;
  isAutoWalking: boolean;
  isAutoAttacking: boolean;
  isActivelyHolding: boolean;
  isCrouching: boolean;
  currentJumpOffsetY: number;
  interactionProgress: unknown | null;
  optimisticProjectiles: Map<string, unknown>;
  processInputsAndActions: (() => void) | null;
}

export interface EngineUiSnapshot {
  connected: boolean;
  loading: boolean;
  uiTables: Record<string, unknown>;
  state: Record<string, unknown>;
}

export interface EngineRuntimeSnapshot {
  tick: number;
  lastFrameInfo: FrameInfo | null;
  connection: EngineConnectionSnapshot;
  world: EngineWorldSnapshot;
  frame: EngineFrameSnapshot;
  input: EngineInputSnapshot;
  ui: EngineUiSnapshot;
}

export type EngineRuntimeIntent =
  | { type: 'movement/setDirection'; direction: { x: number; y: number } }
  | { type: 'ui/openPanel'; panel: string }
  | { type: 'ui/closePanel'; panel: string }
  | { type: 'interaction/setTarget'; target: { type: string; id: string } | null }
  | { type: 'runtime/setConnectionState'; connected: boolean; loading?: boolean }
  | { type: 'runtime/custom'; name: string; payload?: unknown };

export interface RuntimeEngineConfig {
  targetFPS?: number;
  maxFrameTime?: number;
  enableProfiling?: boolean;
}

export interface RuntimeFramePipelineConfig {
  fixedSimulationEnabled: boolean;
  fixedSimulationDtMs: number;
  maxSimulationStepsPerFrame: number;
}

export interface RuntimeFramePipeline {
  prepareFrame?: (frameInfo: FrameInfo) => void;
  processInputs?: () => void;
  stepSimulation?: (dtMs: number) => void;
  renderFrame?: (renderAlpha: number) => void;
  getConfig?: () => RuntimeFramePipelineConfig;
}

