/**
 * Building Placement Manager Hook
 * 
 * Handles building-specific placement logic (foundations, walls, doors).
 * Separate from item placement because:
 * - No item consumption (hammer must be equipped)
 * - Uses cell/tile coordinates instead of world pixel coordinates
 * - Has modes (foundation, wall, doorframe, door)
 * - Has shape/edge/facing parameters that cycle with mouse wheel
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { DbConnection } from '../generated';
import { TILE_SIZE } from '../config/gameConfig';
import { playImmediateSound } from './useSoundSystem';

// Building placement modes
export enum BuildingMode {
  None = 'none',
  Foundation = 'foundation',
  Wall = 'wall',
  DoorFrame = 'doorframe',
  Door = 'door',
}

// Foundation shapes (matching server-side FoundationShape enum)
export enum FoundationShape {
  Empty = 0,
  Full = 1,
  TriNW = 2,  // Triangle pointing NW
  TriNE = 3,  // Triangle pointing NE
  TriSE = 4,  // Triangle pointing SE
  TriSW = 5,  // Triangle pointing SW
}

// Building edges (matching server-side BuildingEdge enum)
export enum BuildingEdge {
  N = 0,      // North (top)
  E = 1,      // East (right)
  S = 2,      // South (bottom)
  W = 3,      // West (left)
  DiagNE_SW = 4,  // Diagonal NE-SW (only for triangles)
  DiagNW_SE = 5,  // Diagonal NW-SE (only for triangles)
}

// Building facing (matching server-side BuildingFacing enum)
export enum BuildingFacing {
  Interior = 0,
  Exterior = 1,
}

// Building tiers (matching server-side BuildingTier enum)
export enum BuildingTier {
  Wood = 0,
  Stone = 1,
  Metal = 2,
}

// Building placement state
export interface BuildingPlacementState {
  isBuilding: boolean;
  mode: BuildingMode;
  foundationShape: FoundationShape;
  buildingEdge: BuildingEdge;
  buildingFacing: BuildingFacing;
  buildingTier: BuildingTier;
  placementError: string | null;
}

// Building placement actions
export interface BuildingPlacementActions {
  startBuildingMode: (mode: BuildingMode, tier?: BuildingTier, initialShape?: FoundationShape) => void;
  cancelBuildingMode: () => void;
  cycleFoundationShape: (direction: 'next' | 'prev') => void;
  rotateTriangleShape: () => void; // ADDED: Rotate triangle shapes (TriNW -> TriNE -> TriSE -> TriSW -> TriNW)
  cycleBuildingEdge: (direction: 'next' | 'prev') => void;
  toggleBuildingFacing: () => void;
  attemptPlacement: (worldX: number, worldY: number) => void;
}

// Helper: Convert world pixel coordinates to tile coordinates
function worldPosToTileCoords(worldX: number, worldY: number): { tileX: number; tileY: number } {
  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);
  return { tileX, tileY };
}

// Helper: Check if player has Blueprint equipped
function playerHasBlueprint(connection: DbConnection | null): boolean {
  if (!connection) return false;
  
  // Find active equipment for local player
  // Note: We'll need to get local player identity from props/context
  // For now, return false - this will be checked server-side anyway
  return false; // Client-side check is optimistic, server validates
}

// Helper: Validate foundation placement distance
function isFoundationPlacementTooFar(
  connection: DbConnection | null,
  cellX: number,
  cellY: number,
  playerX: number,
  playerY: number
): boolean {
  if (!connection) return false;
  
  const BUILDING_PLACEMENT_MAX_DISTANCE = 128.0;
  const BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED = BUILDING_PLACEMENT_MAX_DISTANCE * BUILDING_PLACEMENT_MAX_DISTANCE;
  
  // Convert cell coordinates to world pixel coordinates (center of tile)
  const worldX = (cellX * TILE_SIZE) + (TILE_SIZE / 2);
  const worldY = (cellY * TILE_SIZE) + (TILE_SIZE / 2);
  
  const dx = worldX - playerX;
  const dy = worldY - playerY;
  const distSq = dx * dx + dy * dy;
  
  return distSq > BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED;
}

/**
 * Predict the best triangle foundation shape based on surrounding foundations
 * Returns the suggested shape, or null if no clear pattern
 * 
 * Logic:
 * - If adjacent to a triangle foundation, suggest complementary shape to form a full square
 * - If adjacent to a full foundation, suggest triangle that creates smooth corner/edge
 * - Prioritize cardinal directions (N, E, S, W) for "continuing" patterns
 */
function predictTriangleShape(
  connection: DbConnection | null,
  cellX: number,
  cellY: number
): FoundationShape | null {
  if (!connection) return null;
  
  // Get all adjacent foundations (cardinal + diagonal)
  const adjacentFoundations = new Map<string, { x: number; y: number; shape: FoundationShape }>();
  
  for (const foundation of connection.db.foundationCell.iter()) {
    if (foundation.isDestroyed) continue;
    
    const dx = foundation.cellX - cellX;
    const dy = foundation.cellY - cellY;
    
    // Check if adjacent (cardinal or diagonal, within 1 cell)
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx !== 0 || dy !== 0)) {
      const key = `${foundation.cellX},${foundation.cellY}`;
      adjacentFoundations.set(key, {
        x: foundation.cellX,
        y: foundation.cellY,
        shape: foundation.shape as FoundationShape
      });
    }
  }
  
  if (adjacentFoundations.size === 0) {
    return null; // No adjacent foundations
  }
  
  // Priority 1: Check for triangle foundations that we can complement to form full squares
  // If there's a triangle adjacent, suggest the complementary triangle
  const triangleComplements = new Map<FoundationShape, FoundationShape>([
    [FoundationShape.TriNW, FoundationShape.TriSE], // NW triangle -> SE triangle forms full square
    [FoundationShape.TriNE, FoundationShape.TriSW], // NE triangle -> SW triangle forms full square
    [FoundationShape.TriSE, FoundationShape.TriNW], // SE triangle -> NW triangle forms full square
    [FoundationShape.TriSW, FoundationShape.TriNE], // SW triangle -> NE triangle forms full square
  ]);
  
  for (const adj of adjacentFoundations.values()) {
    if (adj.shape >= FoundationShape.TriNW && adj.shape <= FoundationShape.TriSW) {
      // Found a triangle foundation - check if we can complement it
      const dx = adj.x - cellX;
      const dy = adj.y - cellY;
      
      // Only complement if we're diagonally adjacent (forming a square)
      if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
        const complement = triangleComplements.get(adj.shape);
        if (complement) {
          return complement;
        }
      }
    }
  }
  
  // Priority 2: Check cardinal directions for full foundations (N, E, S, W)
  // When placing next to a full foundation, suggest triangle that creates smooth corner/edge
  const cardinalSuggestions: FoundationShape[] = [];
  
  // North (y - 1): If foundation above, suggest triangle that fills bottom
  const north = adjacentFoundations.get(`${cellX},${cellY - 1}`);
  if (north && north.shape === FoundationShape.Full) {
    // Foundation above - suggest triangle that fills bottom-left or bottom-right
    // Prefer based on other adjacent foundations
    const west = adjacentFoundations.get(`${cellX - 1},${cellY}`);
    const east = adjacentFoundations.get(`${cellX + 1},${cellY}`);
    if (west) {
      cardinalSuggestions.push(FoundationShape.TriNE); // Fill top-right, leaving bottom-left
    } else if (east) {
      cardinalSuggestions.push(FoundationShape.TriNW); // Fill top-left, leaving bottom-right
    } else {
      cardinalSuggestions.push(FoundationShape.TriNE); // Default: fill top-right
    }
  }
  
  // East (x + 1): If foundation to the right, suggest triangle that fills left
  const east = adjacentFoundations.get(`${cellX + 1},${cellY}`);
  if (east && east.shape === FoundationShape.Full) {
    const north = adjacentFoundations.get(`${cellX},${cellY - 1}`);
    const south = adjacentFoundations.get(`${cellX},${cellY + 1}`);
    if (north) {
      cardinalSuggestions.push(FoundationShape.TriSW); // Fill bottom-left, leaving top-right
    } else if (south) {
      cardinalSuggestions.push(FoundationShape.TriNW); // Fill top-left, leaving bottom-right
    } else {
      cardinalSuggestions.push(FoundationShape.TriSW); // Default: fill bottom-left
    }
  }
  
  // South (y + 1): If foundation below, suggest triangle that fills top
  const south = adjacentFoundations.get(`${cellX},${cellY + 1}`);
  if (south && south.shape === FoundationShape.Full) {
    const west = adjacentFoundations.get(`${cellX - 1},${cellY}`);
    const east = adjacentFoundations.get(`${cellX + 1},${cellY}`);
    if (west) {
      cardinalSuggestions.push(FoundationShape.TriSE); // Fill bottom-right, leaving top-left
    } else if (east) {
      cardinalSuggestions.push(FoundationShape.TriSW); // Fill bottom-left, leaving top-right
    } else {
      cardinalSuggestions.push(FoundationShape.TriSE); // Default: fill bottom-right
    }
  }
  
  // West (x - 1): If foundation to the left, suggest triangle that fills right
  const west = adjacentFoundations.get(`${cellX - 1},${cellY}`);
  if (west && west.shape === FoundationShape.Full) {
    const north = adjacentFoundations.get(`${cellX},${cellY - 1}`);
    const south = adjacentFoundations.get(`${cellX},${cellY + 1}`);
    if (north) {
      cardinalSuggestions.push(FoundationShape.TriSE); // Fill bottom-right, leaving top-left
    } else if (south) {
      cardinalSuggestions.push(FoundationShape.TriNE); // Fill top-right, leaving bottom-left
    } else {
      cardinalSuggestions.push(FoundationShape.TriSE); // Default: fill bottom-right
    }
  }
  
  // If we have cardinal suggestions, return the most common one
  if (cardinalSuggestions.length > 0) {
    const counts = new Map<FoundationShape, number>();
    for (const shape of cardinalSuggestions) {
      counts.set(shape, (counts.get(shape) || 0) + 1);
    }
    
    let maxCount = 0;
    let mostCommon: FoundationShape | null = null;
    for (const [shape, count] of counts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = shape;
      }
    }
    
    return mostCommon || cardinalSuggestions[0];
  }
  
  // Priority 3: Fallback to diagonal complement logic (original behavior)
  const diagonalSuggestions: FoundationShape[] = [];
  const diagonalMap = new Map<string, FoundationShape>([
    [`${cellX - 1},${cellY - 1}`, FoundationShape.TriSE], // NW -> suggest SE
    [`${cellX + 1},${cellY - 1}`, FoundationShape.TriSW], // NE -> suggest SW
    [`${cellX + 1},${cellY + 1}`, FoundationShape.TriNW], // SE -> suggest NW
    [`${cellX - 1},${cellY + 1}`, FoundationShape.TriNE], // SW -> suggest NE
  ]);
  
  for (const [key, suggestedShape] of diagonalMap.entries()) {
    if (adjacentFoundations.has(key)) {
      diagonalSuggestions.push(suggestedShape);
    }
  }
  
  if (diagonalSuggestions.length > 0) {
    // Return most common, or first if tie
    const counts = new Map<FoundationShape, number>();
    for (const shape of diagonalSuggestions) {
      counts.set(shape, (counts.get(shape) || 0) + 1);
    }
    
    let maxCount = 0;
    let mostCommon: FoundationShape | null = null;
    for (const [shape, count] of counts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = shape;
      }
    }
    
    return mostCommon || diagonalSuggestions[0];
  }
  
  return null; // No clear pattern
}

// Helper: Check if foundation position is already occupied
function isFoundationPositionOccupied(
  connection: DbConnection | null,
  cellX: number,
  cellY: number,
  shape: FoundationShape
): boolean {
  if (!connection) return false;
  
  // Check if there's already a foundation at this cell
  for (const foundation of connection.db.foundationCell.iter()) {
    if (foundation.cellX === cellX && foundation.cellY === cellY && !foundation.isDestroyed) {
      // Check if shapes overlap
      const existingShape = foundation.shape as FoundationShape;
      if (existingShape === shape) {
        return true; // Same shape = overlap
      }
      // Different shapes also overlap (can't have multiple foundations on same cell)
      return true;
    }
  }
  
  return false;
}

export const useBuildingManager = (
  connection: DbConnection | null,
  localPlayerX: number,
  localPlayerY: number,
  activeEquipments?: Map<string, any>, // ADDED: To check for hammer
  itemDefinitions?: Map<string, any>, // ADDED: To check for hammer
  localPlayerId?: string, // ADDED: To check for hammer
  worldMouseX?: number | null, // ADDED: Current mouse position for triangle prediction
  worldMouseY?: number | null // ADDED: Current mouse position for triangle prediction
): [BuildingPlacementState, BuildingPlacementActions] => {
  const [mode, setMode] = useState<BuildingMode>(BuildingMode.None);
  const [foundationShape, setFoundationShape] = useState<FoundationShape>(FoundationShape.Full);
  const [buildingEdge, setBuildingEdge] = useState<BuildingEdge>(BuildingEdge.N);
  const [buildingFacing, setBuildingFacing] = useState<BuildingFacing>(BuildingFacing.Exterior);
  const [buildingTier, setBuildingTier] = useState<BuildingTier>(BuildingTier.Wood);
  const [placementError, setPlacementError] = useState<string | null>(null);
  
  // Track manually set shape (when R is pressed) to prevent auto-prediction from overriding
  const manuallySetShapeRef = useRef<FoundationShape | null>(null);
  const lastPredictedTileRef = useRef<{ tileX: number; tileY: number } | null>(null);

  const isBuilding = mode !== BuildingMode.None;

  // ADDED: Register reducer callback to handle errors
  useEffect(() => {
    if (!connection) return;

    const handlePlaceFoundationResult = (ctx: any, cellX: bigint, cellY: bigint, shape: number, tier: number) => {
      console.log('[BuildingManager] placeFoundation reducer result:', ctx.event?.status);
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Failed to place foundation';
        console.error('[BuildingManager] placeFoundation failed:', errorMsg);
        console.log('[BuildingManager] Failed placement details:', { cellX, cellY, shape, tier, errorMsg });
        setPlacementError(errorMsg);
        // Play error sound for immediate feedback
        playImmediateSound('construction_placement_error', 1.0);
      } else if (ctx.event?.status?.tag === 'Committed') {
        console.log('[BuildingManager] placeFoundation succeeded!');
        setPlacementError(null);
        // Sound is now played server-side for all players to hear
      }
    };

    connection.reducers.onPlaceFoundation(handlePlaceFoundationResult);

    return () => {
      connection.reducers.removeOnPlaceFoundation(handlePlaceFoundationResult);
    };
  }, [connection]);

  // ADDED: Cancel building mode if hammer is unequipped
  useEffect(() => {
    if (!isBuilding) return;
    
    // Check if hammer is still equipped
    const hasBlueprint = (() => {
      if (!localPlayerId || !activeEquipments || !itemDefinitions) return false;
      const equipment = activeEquipments.get(localPlayerId);
      if (!equipment?.equippedItemDefId) return false;
      const itemDef = itemDefinitions.get(String(equipment.equippedItemDefId));
      return itemDef?.name === 'Blueprint';
    })();
    
    if (!hasBlueprint) {
      console.log('[BuildingManager] Blueprint unequipped, canceling building mode');
      setMode(BuildingMode.None);
      setPlacementError(null);
    }
  }, [isBuilding, localPlayerId, activeEquipments, itemDefinitions]);

  // Start building mode
  const startBuildingMode = useCallback((newMode: BuildingMode, tier?: BuildingTier, initialShape?: FoundationShape) => {
    console.log('[BuildingManager] startBuildingMode called:', newMode, tier, initialShape);
    setMode(newMode);
    if (tier !== undefined) {
      setBuildingTier(tier);
    }
    setPlacementError(null);
    
    // Reset manual override when starting new mode
    manuallySetShapeRef.current = null;
    lastPredictedTileRef.current = null;
    
    // Reset to defaults for the mode
    if (newMode === BuildingMode.Foundation) {
      if (initialShape !== undefined) {
        setFoundationShape(initialShape);
        console.log('[BuildingManager] Set foundation shape to', initialShape);
        // If starting with a triangle, mark it as manually set initially
        if (initialShape >= FoundationShape.TriNW && initialShape <= FoundationShape.TriSW) {
          manuallySetShapeRef.current = initialShape;
        }
      } else {
        setFoundationShape(FoundationShape.Full);
        console.log('[BuildingManager] Set foundation shape to Full');
      }
    } else if (newMode === BuildingMode.Wall || newMode === BuildingMode.DoorFrame) {
      setBuildingEdge(BuildingEdge.N);
      setBuildingFacing(BuildingFacing.Exterior);
    }
  }, []);

  // Cancel building mode
  const cancelBuildingMode = useCallback(() => {
    setMode(BuildingMode.None);
    setPlacementError(null);
  }, []);

  // Cycle foundation shape (Full -> TriNW -> TriNE -> TriSE -> TriSW -> Full)
  // Note: This is kept for mouse wheel cycling, but R key uses rotateTriangleShape instead
  const cycleFoundationShape = useCallback((direction: 'next' | 'prev') => {
    setFoundationShape(prev => {
      const shapes = [
        FoundationShape.Full,
        FoundationShape.TriNW,
        FoundationShape.TriNE,
        FoundationShape.TriSE,
        FoundationShape.TriSW,
      ];
      const currentIndex = shapes.indexOf(prev);
      if (currentIndex === -1) return FoundationShape.Full;
      
      if (direction === 'next') {
        const nextIndex = (currentIndex + 1) % shapes.length;
        const newShape = shapes[nextIndex];
        manuallySetShapeRef.current = newShape; // Mark as manually set
        return newShape;
      } else {
        const prevIndex = (currentIndex - 1 + shapes.length) % shapes.length;
        const newShape = shapes[prevIndex];
        manuallySetShapeRef.current = newShape; // Mark as manually set
        return newShape;
      }
    });
  }, []);

  // Rotate triangle shape (TriNW -> TriNE -> TriSE -> TriSW -> TriNW)
  const rotateTriangleShape = useCallback(() => {
    setFoundationShape(prev => {
      // Only rotate if current shape is a triangle
      const triangleShapes = [
        FoundationShape.TriNW,
        FoundationShape.TriNE,
        FoundationShape.TriSE,
        FoundationShape.TriSW,
      ];
      
      if (!triangleShapes.includes(prev)) {
        // If not a triangle, start with TriNW
        const newShape = FoundationShape.TriNW;
        manuallySetShapeRef.current = newShape; // Mark as manually set
        return newShape;
      }
      
      const currentIndex = triangleShapes.indexOf(prev);
      const nextIndex = (currentIndex + 1) % triangleShapes.length;
      const newShape = triangleShapes[nextIndex];
      manuallySetShapeRef.current = newShape; // Mark as manually set to prevent auto-prediction from overriding
      return newShape;
    });
  }, []);

  // Cycle building edge (N -> E -> S -> W -> N for cardinal, or include diagonals for triangles)
  const cycleBuildingEdge = useCallback((direction: 'next' | 'prev') => {
    setBuildingEdge(prev => {
      // Cardinal edges only for now (walls on full foundations)
      const cardinalEdges = [
        BuildingEdge.N,
        BuildingEdge.E,
        BuildingEdge.S,
        BuildingEdge.W,
      ];
      const currentIndex = cardinalEdges.indexOf(prev);
      if (currentIndex === -1) return BuildingEdge.N;
      
      if (direction === 'next') {
        const nextIndex = (currentIndex + 1) % cardinalEdges.length;
        return cardinalEdges[nextIndex];
      } else {
        const prevIndex = (currentIndex - 1 + cardinalEdges.length) % cardinalEdges.length;
        return cardinalEdges[prevIndex];
      }
    });
  }, []);

  // Toggle building facing (Interior <-> Exterior)
  const toggleBuildingFacing = useCallback(() => {
    setBuildingFacing(prev => 
      prev === BuildingFacing.Interior ? BuildingFacing.Exterior : BuildingFacing.Interior
    );
  }, []);

  // Attempt placement
  const attemptPlacement = useCallback((worldX: number, worldY: number) => {
    if (!connection || !isBuilding) {
      console.warn('[BuildingManager] Attempted placement with no connection or not in building mode.');
      return;
    }

    setPlacementError(null);

    // Convert world coordinates to tile coordinates
    const { tileX, tileY } = worldPosToTileCoords(worldX, worldY);

    try {
      if (mode === BuildingMode.Foundation) {
        // Check client-side validation
        if (isFoundationPlacementTooFar(connection, tileX, tileY, localPlayerX, localPlayerY)) {
          setPlacementError('Too far away');
          playImmediateSound('construction_placement_error', 1.0);
          return;
        }

        if (isFoundationPositionOccupied(connection, tileX, tileY, foundationShape)) {
          console.log('[BuildingManager] Client-side validation: Position already occupied at', { tileX, tileY });
          setPlacementError('Position already occupied');
          playImmediateSound('construction_placement_error', 1.0);
          return;
        }

        // Call server reducer
        console.log('[BuildingManager] Calling placeFoundation reducer:', { tileX, tileY, shape: foundationShape, tier: buildingTier });
        try {
          connection.reducers.placeFoundation(
            BigInt(tileX),
            BigInt(tileY),
            foundationShape as number, // FoundationShape enum value (0-5)
            buildingTier as number // BuildingTier enum value (0-2)
          );
          console.log('[BuildingManager] placeFoundation reducer called successfully');
        } catch (err) {
          console.error('[BuildingManager] Error calling placeFoundation reducer:', err);
          setPlacementError(`Failed to call reducer: ${err}`);
          playImmediateSound('construction_placement_error', 1.0);
        }
        
        // Note: Don't cancel building mode - allow continuous placement
        // App.tsx callback will handle success/error feedback
      } else {
        console.warn(`[BuildingManager] Placement not implemented for mode: ${mode}`);
        setPlacementError(`Placement not implemented for ${mode}`);
      }
    } catch (err: any) {
      console.error('[BuildingManager] Failed to call placement reducer:', err);
      setPlacementError(err?.message || 'Failed to place building piece');
    }
  }, [connection, isBuilding, mode, foundationShape, buildingTier, localPlayerX, localPlayerY]);

  // ADDED: Auto-predict triangle shape based on surrounding foundations
  useEffect(() => {
    // Only predict when:
    // 1. In building mode
    // 2. Mode is Foundation
    // 3. Current shape is a triangle (or we're starting triangle mode)
    // 4. Mouse position is available
    // 5. Shape hasn't been manually set (via R key or wheel)
    if (!isBuilding || mode !== BuildingMode.Foundation) return;
    if (!worldMouseX || !worldMouseY || !connection) return;
    
    // Only predict for triangle shapes
    const isTriangle = foundationShape >= FoundationShape.TriNW && foundationShape <= FoundationShape.TriSW;
    if (!isTriangle && foundationShape !== FoundationShape.Full) return;
    
    // Skip if shape was manually set
    if (manuallySetShapeRef.current !== null) {
      // Check if we've moved to a different tile - allow prediction again
      const { tileX, tileY } = worldPosToTileCoords(worldMouseX, worldMouseY);
      const lastTile = lastPredictedTileRef.current;
      
      if (lastTile && lastTile.tileX === tileX && lastTile.tileY === tileY) {
        // Still on same tile, keep manual override
        return;
      }
      
      // Moved to new tile, clear manual override for this tile
      manuallySetShapeRef.current = null;
    }
    
    const { tileX, tileY } = worldPosToTileCoords(worldMouseX, worldMouseY);
    
    // Check if we've already predicted for this tile
    const lastTile = lastPredictedTileRef.current;
    if (lastTile && lastTile.tileX === tileX && lastTile.tileY === tileY) {
      return; // Already predicted for this tile
    }
    
    // Only predict if we're in triangle mode (shape is a triangle)
    if (!isTriangle) return;
    
    // Predict the best triangle shape
    const predictedShape = predictTriangleShape(connection, tileX, tileY);
    
    if (predictedShape !== null) {
      console.log('[BuildingManager] Auto-predicting triangle shape:', predictedShape, 'at tile', { tileX, tileY });
      setFoundationShape(predictedShape);
      lastPredictedTileRef.current = { tileX, tileY };
    } else {
      // No clear pattern, but we're in triangle mode - default to TriNW
      setFoundationShape(FoundationShape.TriNW);
      lastPredictedTileRef.current = { tileX, tileY };
    }
  }, [isBuilding, mode, foundationShape, worldMouseX, worldMouseY, connection]);

  // Building state
  const buildingState: BuildingPlacementState = {
    isBuilding,
    mode,
    foundationShape,
    buildingEdge,
    buildingFacing,
    buildingTier,
    placementError,
  };

  // Building actions
  const buildingActions: BuildingPlacementActions = {
    startBuildingMode,
    cancelBuildingMode,
    cycleFoundationShape,
    rotateTriangleShape, // ADDED: Rotate triangle shapes
    cycleBuildingEdge,
    toggleBuildingFacing,
    attemptPlacement,
  };

  return [buildingState, buildingActions];
};

