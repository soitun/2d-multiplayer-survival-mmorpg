/**
 * Fence Targeting Hook
 * 
 * Finds and targets nearby fences when Repair Hammer is equipped.
 * Detects which fence is closest to the mouse position.
 */

import { useState, useEffect, useMemo } from 'react';
import { DbConnection, Fence } from '../generated';

const BUILDING_PLACEMENT_MAX_DISTANCE = 128.0;
const BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED = BUILDING_PLACEMENT_MAX_DISTANCE * BUILDING_PLACEMENT_MAX_DISTANCE;
const FENCE_CLICK_THRESHOLD = 32; // Pixels - how close mouse needs to be to fence

// Foundation cell size (96px) - same as walls
const FOUNDATION_SIZE = 96;

interface FenceTargetingState {
  targetedFence: Fence | null;
}

/**
 * Calculate fence bounds based on edge type
 * Edge: 0 = North, 1 = East, 2 = South, 3 = West
 */
function getFenceBounds(fence: Fence): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const halfEdge = FOUNDATION_SIZE / 2;
  const FENCE_THICKNESS = 24; // Visual thickness
  
  // Fences are positioned at posX, posY (center of the fence)
  const fenceX = fence.posX;
  const fenceY = fence.posY;
  
  // Edge 0 (North) and 2 (South) are horizontal, Edge 1 (East) and 3 (West) are vertical
  if (fence.edge === 0 || fence.edge === 2) {
    // Horizontal fence: spans cell width, thin in Y
    return {
      minX: fenceX - halfEdge,
      maxX: fenceX + halfEdge,
      minY: fenceY - FENCE_THICKNESS / 2,
      maxY: fenceY + FENCE_THICKNESS / 2,
    };
  } else {
    // Vertical fence: thin in X, spans cell height
    return {
      minX: fenceX - FENCE_THICKNESS / 2,
      maxX: fenceX + FENCE_THICKNESS / 2,
      minY: fenceY - halfEdge,
      maxY: fenceY + halfEdge,
    };
  }
}

/**
 * Check if point is within fence bounds (with threshold)
 */
function isPointNearFence(
  fence: Fence,
  mouseX: number,
  mouseY: number
): boolean {
  const bounds = getFenceBounds(fence);
  
  // Expand bounds by threshold for easier clicking
  const expandedBounds = {
    minX: bounds.minX - FENCE_CLICK_THRESHOLD,
    maxX: bounds.maxX + FENCE_CLICK_THRESHOLD,
    minY: bounds.minY - FENCE_CLICK_THRESHOLD,
    maxY: bounds.maxY + FENCE_CLICK_THRESHOLD,
  };
  
  return (
    mouseX >= expandedBounds.minX &&
    mouseX <= expandedBounds.maxX &&
    mouseY >= expandedBounds.minY &&
    mouseY <= expandedBounds.maxY
  );
}

/**
 * Calculate distance from point to fence center
 */
function getDistanceToFenceSq(fence: Fence, mouseX: number, mouseY: number): number {
  const dx = fence.posX - mouseX;
  const dy = fence.posY - mouseY;
  return dx * dx + dy * dy;
}

export function useFenceTargeting(
  connection: DbConnection | null,
  localPlayerX: number,
  localPlayerY: number,
  worldMouseX: number | null,
  worldMouseY: number | null,
  hasRepairHammer: boolean
): FenceTargetingState {
  const [targetedFence, setTargetedFence] = useState<Fence | null>(null);

  // Find closest fence to mouse position
  const targetingResult = useMemo(() => {
    if (!connection || !hasRepairHammer || worldMouseX === null || worldMouseY === null) {
      return { fence: null };
    }

    // Find all fences within range
    let closestFence: Fence | null = null;
    let closestDistanceSq = Infinity;

    for (const fence of connection.db.fence.iter()) {
      if (fence.isDestroyed) continue;
      // Monument fences (e.g. compound perimeter) cannot be targeted for destroy/upgrade
      if (fence.isMonument) continue;

      // Check distance from player to fence
      const dx = fence.posX - localPlayerX;
      const dy = fence.posY - localPlayerY;
      const distSqFromPlayer = dx * dx + dy * dy;

      if (distSqFromPlayer > BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED) {
        continue; // Too far from player
      }

      // Check if mouse is near this fence
      if (isPointNearFence(fence, worldMouseX, worldMouseY)) {
        // Calculate distance from mouse to fence for prioritization
        const distSqFromMouse = getDistanceToFenceSq(fence, worldMouseX, worldMouseY);

        if (distSqFromMouse < closestDistanceSq) {
          closestDistanceSq = distSqFromMouse;
          closestFence = fence;
        }
      }
    }

    if (closestFence) {
      return { fence: closestFence };
    }

    return { fence: null };
  }, [connection, hasRepairHammer, worldMouseX, worldMouseY, localPlayerX, localPlayerY]);

  // Update state when targeting result changes
  useEffect(() => {
    setTargetedFence(targetingResult.fence);
  }, [targetingResult]);

  return {
    targetedFence,
  };
}
