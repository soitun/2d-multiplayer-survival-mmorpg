import type { FrameInfo } from '../hooks/useGameLoop';

export interface EngineWorldSnapshot {
  predictedPosition: { x: number; y: number } | null;
  viewport: { minX: number; minY: number; maxX: number; maxY: number } | null;
  tables: Record<string, unknown>;
}

export interface EngineUiSnapshot {
  connected: boolean;
  loading: boolean;
  uiTables: Record<string, unknown>;
}

export interface EngineRuntimeSnapshot {
  tick: number;
  lastFrameInfo: FrameInfo | null;
  world: EngineWorldSnapshot;
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

