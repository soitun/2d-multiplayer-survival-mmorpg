/**
 * Throttled viewport sync - updates server with visible world bounds for cloud generation.
 * Only sends updates when >500ms passed OR camera moved >200px to reduce websocket traffic.
 */

import { useEffect, useRef } from 'react';
import { getViewBounds } from '../config/gameConfig';

const VIEWPORT_UPDATE_INTERVAL_MS = 500;
const VIEWPORT_MOVE_THRESHOLD_SQ = 40000; // 200px * 200px

type Connection = { reducers: { updateViewport: (minX: number, minY: number, maxX: number, maxY: number) => void } } | null;

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
      try {
        connection.reducers.updateViewport(viewBounds.minX, viewBounds.minY, viewBounds.maxX, viewBounds.maxY);
      } catch (error) {
        console.error('[useViewportSync] Failed to update viewport on server:', error);
      }
    }
  }, [connection, cameraOffsetX, cameraOffsetY, canvasWidth, canvasHeight]);
}
