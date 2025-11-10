/**
 * Foundation Targeting Hook
 * 
 * Finds and targets nearby foundations when Repair Hammer is equipped.
 * Snaps to the closest foundation tile within range.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { DbConnection, FoundationCell } from '../generated';
import { TILE_SIZE } from '../config/gameConfig';

const BUILDING_PLACEMENT_MAX_DISTANCE = 128.0;
const BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED = BUILDING_PLACEMENT_MAX_DISTANCE * BUILDING_PLACEMENT_MAX_DISTANCE;

interface FoundationTargetingState {
  targetedFoundation: FoundationCell | null;
  targetTileX: number | null;
  targetTileY: number | null;
}

export const useFoundationTargeting = (
  connection: DbConnection | null,
  localPlayerX: number,
  localPlayerY: number,
  worldMouseX: number | null,
  worldMouseY: number | null,
  hasRepairHammer: boolean
): FoundationTargetingState => {
  const [targetedFoundation, setTargetedFoundation] = useState<FoundationCell | null>(null);
  const [targetTileX, setTargetTileX] = useState<number | null>(null);
  const [targetTileY, setTargetTileY] = useState<number | null>(null);

  // Find closest foundation to mouse position
  const targetingResult = useMemo(() => {
    if (!connection || !hasRepairHammer || worldMouseX === null || worldMouseY === null) {
      return { foundation: null, tileX: null, tileY: null };
    }

    // Convert mouse position to tile coordinates
    const mouseTileX = Math.floor(worldMouseX / TILE_SIZE);
    const mouseTileY = Math.floor(worldMouseY / TILE_SIZE);

    // Find all foundations within range
    let closestFoundation: FoundationCell | null = null;
    let closestDistanceSq = Infinity;
    let closestTileX = mouseTileX;
    let closestTileY = mouseTileY;

    for (const foundation of connection.db.foundationCell.iter()) {
      if (foundation.isDestroyed) continue;

      // Convert foundation cell to world coordinates (center of tile)
      const foundationWorldX = (foundation.cellX * TILE_SIZE) + (TILE_SIZE / 2);
      const foundationWorldY = (foundation.cellY * TILE_SIZE) + (TILE_SIZE / 2);

      // Check distance from player
      const dx = foundationWorldX - localPlayerX;
      const dy = foundationWorldY - localPlayerY;
      const distSqFromPlayer = dx * dx + dy * dy;

      if (distSqFromPlayer > BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED) {
        continue; // Too far from player
      }

      // Check distance from mouse (snap to closest foundation)
      const dxFromMouse = foundationWorldX - worldMouseX;
      const dyFromMouse = foundationWorldY - worldMouseY;
      const distSqFromMouse = dxFromMouse * dxFromMouse + dyFromMouse * dyFromMouse;

      if (distSqFromMouse < closestDistanceSq) {
        closestDistanceSq = distSqFromMouse;
        closestFoundation = foundation;
        closestTileX = foundation.cellX;
        closestTileY = foundation.cellY;
      }
    }

    // Only return foundation if it's within reasonable mouse distance (snap threshold)
    const SNAP_THRESHOLD_SQUARED = (TILE_SIZE * 1.5) * (TILE_SIZE * 1.5); // 1.5 tiles
    if (closestFoundation && closestDistanceSq <= SNAP_THRESHOLD_SQUARED) {
      return {
        foundation: closestFoundation,
        tileX: closestTileX,
        tileY: closestTileY,
      };
    }

    return { foundation: null, tileX: null, tileY: null };
  }, [connection, hasRepairHammer, worldMouseX, worldMouseY, localPlayerX, localPlayerY]);

  // Update state when targeting result changes
  useEffect(() => {
    setTargetedFoundation(targetingResult.foundation);
    setTargetTileX(targetingResult.tileX);
    setTargetTileY(targetingResult.tileY);
  }, [targetingResult]);

  return {
    targetedFoundation,
    targetTileX,
    targetTileY,
  };
};

