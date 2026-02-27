/**
 * useViewportSync - Throttled viewport bounds sync to server for cloud generation.
 *
 * Sends the visible world bounds (minX, minY, maxX, maxY) to the server via
 * updateViewport reducer. Used for cloud spawning and other viewport-dependent
 * server logic. Throttles updates to reduce WebSocket traffic.
 *
 * Responsibilities:
 * 1. BOUNDS COMPUTATION: getViewBounds converts camera offset + canvas size to
 *    world coordinates. Passed to updateViewport reducer.
 *
 * 2. THROTTLING: Only sends when >VIEWPORT_UPDATE_INTERVAL_MS (500ms) passed OR
 *    camera moved >VIEWPORT_MOVE_THRESHOLD (200px). Prevents rapid re-subscriptions.
 *
 * 3. DEPENDENCIES: Re-runs when connection, cameraOffsetX/Y, or canvas size changes.
 */

import { useEffect, useRef } from 'react';
import { gameConfig, getViewBounds } from '../config/gameConfig';

const VIEWPORT_UPDATE_INTERVAL_MS = 500;
const VIEWPORT_MOVE_THRESHOLD_SQ = 40000; // 200px * 200px
const VIEWPORT_PREFETCH_MARGIN_CHUNKS = 2;
const VIEWPORT_PREFETCH_MARGIN_PX = gameConfig.chunkSizePx * VIEWPORT_PREFETCH_MARGIN_CHUNKS;

type Connection = { reducers: { updateViewport: (args: { minX: number; minY: number; maxX: number; maxY: number }) => void } } | null;

export function useViewportSync(
  connection: Connection,
  cameraOffsetX: number,
  cameraOffsetY: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  const lastUpdateRef = useRef<number>(0);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!connection) return;

    const now = Date.now();
    const timeDiff = now - lastUpdateRef.current;

    let distSq = 0;
    if (lastPosRef.current) {
      const dx = cameraOffsetX - lastPosRef.current.x;
      const dy = cameraOffsetY - lastPosRef.current.y;
      distSq = dx * dx + dy * dy;
    } else {
      distSq = Infinity;
    }

    if (timeDiff > VIEWPORT_UPDATE_INTERVAL_MS || distSq > VIEWPORT_MOVE_THRESHOLD_SQ) {
      lastUpdateRef.current = now;
      lastPosRef.current = { x: cameraOffsetX, y: cameraOffsetY };

      const viewBounds = getViewBounds(cameraOffsetX, cameraOffsetY, canvasWidth, canvasHeight);
      const expandedBounds = {
        minX: viewBounds.minX - VIEWPORT_PREFETCH_MARGIN_PX,
        minY: viewBounds.minY - VIEWPORT_PREFETCH_MARGIN_PX,
        maxX: viewBounds.maxX + VIEWPORT_PREFETCH_MARGIN_PX,
        maxY: viewBounds.maxY + VIEWPORT_PREFETCH_MARGIN_PX,
      };
      try {
        connection.reducers.updateViewport(expandedBounds);
      } catch (error) {
        console.error('[useViewportSync] Failed to update viewport on server:', error);
      }
    }
  }, [connection, cameraOffsetX, cameraOffsetY, canvasWidth, canvasHeight]);
}