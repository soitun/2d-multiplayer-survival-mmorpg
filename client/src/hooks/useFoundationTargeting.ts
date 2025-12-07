/**
 * Generic Building Tile Targeting Hook
 * 
 * Finds and targets nearby building tiles when Repair Hammer is equipped.
 * Works with any building tile type (foundations, walls, doorframes, etc.).
 * Snaps to the closest tile within range.
 * 
 * PERFORMANCE FIX: Removed redundant useState + useEffect pattern that caused
 * infinite re-render loops. Now returns useMemo result directly.
 */

import { useMemo } from 'react';
import { DbConnection } from '../generated';
import { FOUNDATION_TILE_SIZE, foundationCellToWorldCenter } from '../config/gameConfig';

const BUILDING_PLACEMENT_MAX_DISTANCE = 128.0;
const BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED = BUILDING_PLACEMENT_MAX_DISTANCE * BUILDING_PLACEMENT_MAX_DISTANCE;

/**
 * Generic interface for any targetable building tile
 */
export interface TargetableBuildingTile {
  id: bigint;
  cellX: number;
  cellY: number;
  isDestroyed?: boolean;
}

interface BuildingTileTargetingState<T extends TargetableBuildingTile> {
  targetedTile: T | null;
  targetTileX: number | null;
  targetTileY: number | null;
}

/**
 * Generic hook for targeting any building tile type
 * @param getTiles Function that returns an iterable of tiles from the connection
 * @param connection Database connection
 * @param localPlayerX Player X position
 * @param localPlayerY Player Y position
 * @param worldMouseX Mouse X position in world coordinates
 * @param worldMouseY Mouse Y position in world coordinates
 * @param hasRepairHammer Whether Repair Hammer is equipped
 */
export function useBuildingTileTargeting<T extends TargetableBuildingTile>(
  getTiles: (connection: DbConnection) => Iterable<T>,
  connection: DbConnection | null,
  localPlayerX: number,
  localPlayerY: number,
  worldMouseX: number | null,
  worldMouseY: number | null,
  hasRepairHammer: boolean
): BuildingTileTargetingState<T> {
  // Find closest tile to mouse position
  // PERFORMANCE: Return useMemo result directly - no need for useState + useEffect
  // which was causing infinite re-render loops due to object reference comparison
  return useMemo(() => {
    if (!connection || !hasRepairHammer || worldMouseX === null || worldMouseY === null) {
      return { targetedTile: null, targetTileX: null, targetTileY: null };
    }

    // Convert mouse position to foundation cell coordinates (96px grid)
    const mouseCellX = Math.floor(worldMouseX / FOUNDATION_TILE_SIZE);
    const mouseCellY = Math.floor(worldMouseY / FOUNDATION_TILE_SIZE);

    // Find all tiles within range
    let closestTile: T | null = null;
    let closestDistanceSq = Infinity;
    let closestTileX = mouseCellX;
    let closestTileY = mouseCellY;

    for (const tile of getTiles(connection)) {
      if (tile.isDestroyed) continue;

      // Convert foundation cell to world coordinates (center of foundation cell)
      const { x: tileWorldX, y: tileWorldY } = foundationCellToWorldCenter(tile.cellX, tile.cellY);

      // Check distance from player
      const dx = tileWorldX - localPlayerX;
      const dy = tileWorldY - localPlayerY;
      const distSqFromPlayer = dx * dx + dy * dy;

      if (distSqFromPlayer > BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED) {
        continue; // Too far from player
      }

      // Check distance from mouse (snap to closest tile)
      const dxFromMouse = tileWorldX - worldMouseX;
      const dyFromMouse = tileWorldY - worldMouseY;
      const distSqFromMouse = dxFromMouse * dxFromMouse + dyFromMouse * dyFromMouse;

      if (distSqFromMouse < closestDistanceSq) {
        closestDistanceSq = distSqFromMouse;
        closestTile = tile;
        closestTileX = tile.cellX;
        closestTileY = tile.cellY;
      }
    }

    // Only return tile if it's within reasonable mouse distance (snap threshold)
    const SNAP_THRESHOLD_SQUARED = (FOUNDATION_TILE_SIZE * 1.5) * (FOUNDATION_TILE_SIZE * 1.5); // 1.5 foundation cells
    if (closestTile && closestDistanceSq <= SNAP_THRESHOLD_SQUARED) {
      return {
        targetedTile: closestTile,
        targetTileX: closestTileX,
        targetTileY: closestTileY,
      };
    }

    return { targetedTile: null, targetTileX: null, targetTileY: null };
  }, [getTiles, connection, hasRepairHammer, worldMouseX, worldMouseY, localPlayerX, localPlayerY]);
}

/**
 * Foundation-specific targeting hook (convenience wrapper)
 * Returns the same interface as before for backward compatibility
 */
export const useFoundationTargeting = (
  connection: DbConnection | null,
  localPlayerX: number,
  localPlayerY: number,
  worldMouseX: number | null,
  worldMouseY: number | null,
  hasRepairHammer: boolean
) => {
  const result = useBuildingTileTargeting(
    (conn) => conn.db.foundationCell.iter(),
    connection,
    localPlayerX,
    localPlayerY,
    worldMouseX,
    worldMouseY,
    hasRepairHammer
  );
  
  // Map to old interface for backward compatibility
  return {
    targetedFoundation: result.targetedTile,
    targetTileX: result.targetTileX,
    targetTileY: result.targetTileY,
  };
};
