/**
 * useWallTargeting - Wall edge targeting for placement and repair.
 *
 * Finds the wall cell and edge closest to the mouse when Repair Hammer is equipped.
 * Used for wall placement (new walls) and repair (existing walls). Detects which
 * edge (N, E, S, W) the mouse is nearest for correct placement orientation.
 *
 * Responsibilities:
 * 1. EDGE DETECTION: getWallBounds computes hitbox per edge type. Mouse must be
 *    within WALL_CLICK_THRESHOLD (24px) of the edge for targeting.
 *
 * 2. TARGETED WALL: Returns targetedWall, targetTileX, targetTileY. Integrates
 *    with useBuildingManager for placement mode and placement validation.
 *
 * 3. DISTANCE CHECK: Same BUILDING_PLACEMENT_MAX_DISTANCE (128px) as foundations.
 */

import { useState, useEffect, useMemo } from 'react';
import { DbConnection } from '../generated';
import { FOUNDATION_TILE_SIZE, foundationCellToWorldCenter } from '../config/gameConfig';

const BUILDING_PLACEMENT_MAX_DISTANCE = 128.0;
const BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED = BUILDING_PLACEMENT_MAX_DISTANCE * BUILDING_PLACEMENT_MAX_DISTANCE;
const WALL_CLICK_THRESHOLD = 24; // Pixels - how close mouse needs to be to wall edge

interface WallTargetingState {
  targetedWall: any | null; // WallCell type
  targetTileX: number | null;
  targetTileY: number | null;
}

/**
 * Calculate wall bounds based on edge type
 */
function getWallBounds(wall: any, tileCenterX: number, tileCenterY: number): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const halfTile = FOUNDATION_TILE_SIZE / 2;
  const WALL_THICKNESS = 4; // For north/south walls
  const EAST_WEST_WALL_THICKNESS = 12; // For east/west walls
  const NORTH_SOUTH_WALL_HEIGHT = FOUNDATION_TILE_SIZE; // 1 tile tall
  
  switch (wall.edge) {
    case 0: // North (top edge) - extends upward 1 tile
      return {
        minX: tileCenterX - halfTile,
        maxX: tileCenterX + halfTile,
        minY: tileCenterY - FOUNDATION_TILE_SIZE - NORTH_SOUTH_WALL_HEIGHT + WALL_THICKNESS / 2,
        maxY: tileCenterY - FOUNDATION_TILE_SIZE + WALL_THICKNESS / 2,
      };
    case 1: // East (right edge)
      return {
        minX: tileCenterX + halfTile - EAST_WEST_WALL_THICKNESS / 2,
        maxX: tileCenterX + halfTile + EAST_WEST_WALL_THICKNESS / 2,
        minY: tileCenterY - halfTile,
        maxY: tileCenterY + halfTile,
      };
    case 2: // South (bottom edge) - extends upward 1 tile from bottom
      return {
        minX: tileCenterX - halfTile,
        maxX: tileCenterX + halfTile,
        minY: tileCenterY + halfTile - NORTH_SOUTH_WALL_HEIGHT,
        maxY: tileCenterY + halfTile + WALL_THICKNESS / 2,
      };
    case 3: // West (left edge)
      return {
        minX: tileCenterX - halfTile - EAST_WEST_WALL_THICKNESS / 2,
        maxX: tileCenterX - halfTile + EAST_WEST_WALL_THICKNESS / 2,
        minY: tileCenterY - halfTile,
        maxY: tileCenterY + halfTile,
      };
    case 4: // DiagNE_SW
    case 5: // DiagNW_SE
      // For diagonal walls, check distance to diagonal line
      return {
        minX: tileCenterX - halfTile,
        maxX: tileCenterX + halfTile,
        minY: tileCenterY - halfTile,
        maxY: tileCenterY + halfTile,
      };
    default:
      return {
        minX: tileCenterX - halfTile,
        maxX: tileCenterX + halfTile,
        minY: tileCenterY - halfTile,
        maxY: tileCenterY + halfTile,
      };
  }
}

/**
 * Check if point is within wall bounds (with threshold)
 */
function isPointNearWall(
  wall: any,
  tileCenterX: number,
  tileCenterY: number,
  mouseX: number,
  mouseY: number
): boolean {
  const bounds = getWallBounds(wall, tileCenterX, tileCenterY);
  
  // For diagonal walls, check distance to diagonal line
  if (wall.edge === 4 || wall.edge === 5) {
    const dx = mouseX - tileCenterX;
    const dy = mouseY - tileCenterY;
    
    let distToDiagonal: number;
    if (wall.edge === 4) {
      // DiagNE_SW: line from (tileCenterX - halfTile, tileCenterY - halfTile) to (tileCenterX + halfTile, tileCenterY + halfTile)
      // Distance to line: |dx - dy| / sqrt(2)
      distToDiagonal = Math.abs(dx - dy) / Math.sqrt(2);
    } else {
      // DiagNW_SE: line from (tileCenterX - halfTile, tileCenterY + halfTile) to (tileCenterX + halfTile, tileCenterY - halfTile)
      // Distance to line: |dx + dy| / sqrt(2)
      distToDiagonal = Math.abs(dx + dy) / Math.sqrt(2);
    }
    
    return distToDiagonal <= WALL_CLICK_THRESHOLD;
  }
  
  // For cardinal walls, check if point is within bounds (expanded by threshold)
  const expandedBounds = {
    minX: bounds.minX - WALL_CLICK_THRESHOLD,
    maxX: bounds.maxX + WALL_CLICK_THRESHOLD,
    minY: bounds.minY - WALL_CLICK_THRESHOLD,
    maxY: bounds.maxY + WALL_CLICK_THRESHOLD,
  };
  
  return (
    mouseX >= expandedBounds.minX &&
    mouseX <= expandedBounds.maxX &&
    mouseY >= expandedBounds.minY &&
    mouseY <= expandedBounds.maxY
  );
}

export function useWallTargeting(
  connection: DbConnection | null,
  localPlayerX: number,
  localPlayerY: number,
  worldMouseX: number | null,
  worldMouseY: number | null,
  hasRepairHammer: boolean
): WallTargetingState {
  const [targetedWall, setTargetedWall] = useState<any | null>(null);
  const [targetTileX, setTargetTileX] = useState<number | null>(null);
  const [targetTileY, setTargetTileY] = useState<number | null>(null);

  // Find closest wall to mouse position
  const targetingResult = useMemo(() => {
    if (!connection || !hasRepairHammer || worldMouseX === null || worldMouseY === null) {
      return { wall: null, tileX: null, tileY: null };
    }

    // Convert mouse position to foundation cell coordinates (96px grid)
    const mouseCellX = Math.floor(worldMouseX / FOUNDATION_TILE_SIZE);
    const mouseCellY = Math.floor(worldMouseY / FOUNDATION_TILE_SIZE);

    // Find all walls within range
    let closestWall: any | null = null;
    let closestDistanceSq = Infinity;
    let closestTileX = mouseCellX;
    let closestTileY = mouseCellY;

    for (const wall of connection.db.wallCell.iter()) {
      if (wall.isDestroyed) continue;

      // Convert foundation cell to world coordinates (center of foundation cell)
      const { x: tileWorldX, y: tileWorldY } = foundationCellToWorldCenter(wall.cellX, wall.cellY);

      // Check distance from player
      const dx = tileWorldX - localPlayerX;
      const dy = tileWorldY - localPlayerY;
      const distSqFromPlayer = dx * dx + dy * dy;

      if (distSqFromPlayer > BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED) {
        continue; // Too far from player
      }

      // Check if mouse is near this wall's edge
      if (isPointNearWall(wall, tileWorldX, tileWorldY, worldMouseX, worldMouseY)) {
        // Calculate distance from mouse to wall center for prioritization
        const dxFromMouse = tileWorldX - worldMouseX;
        const dyFromMouse = tileWorldY - worldMouseY;
        const distSqFromMouse = dxFromMouse * dxFromMouse + dyFromMouse * dyFromMouse;

        if (distSqFromMouse < closestDistanceSq) {
          closestDistanceSq = distSqFromMouse;
          closestWall = wall;
          closestTileX = wall.cellX;
          closestTileY = wall.cellY;
        }
      }
    }

    if (closestWall) {
      return {
        wall: closestWall,
        tileX: closestTileX,
        tileY: closestTileY,
      };
    }

    return { wall: null, tileX: null, tileY: null };
  }, [connection, hasRepairHammer, worldMouseX, worldMouseY, localPlayerX, localPlayerY]);

  // Update state when targeting result changes
  useEffect(() => {
    setTargetedWall(targetingResult.wall);
    setTargetTileX(targetingResult.tileX);
    setTargetTileY(targetingResult.tileY);
  }, [targetingResult]);

  return {
    targetedWall,
    targetTileX,
    targetTileY,
  };
}

