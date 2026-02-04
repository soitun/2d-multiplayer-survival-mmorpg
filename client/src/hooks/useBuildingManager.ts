/**
 * Building Placement Manager Hook
 * 
 * Handles building-specific placement logic (foundations, walls, doors).
 * Separate from item placement because:
 * - No item consumption (hammer must be equipped)
 * - Uses cell/tile coordinates instead of world pixel coordinates
 * - Has modes (foundation, wall, door)
 * - Has shape/edge/facing parameters that cycle with mouse wheel
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { DbConnection } from '../generated';
import { TILE_SIZE, FOUNDATION_TILE_SIZE, worldPixelsToFoundationCell, foundationCellToWorldCenter } from '../config/gameConfig';
import { playImmediateSound } from './useSoundSystem';
import { getTileTypeFromChunkData } from '../utils/renderers/placementRenderingUtils';

// Building placement modes
export enum BuildingMode {
  None = 'none',
  Foundation = 'foundation',
  Wall = 'wall',
  Door = 'door',
  Fence = 'fence',
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
  Twig = 0,
  Wood = 1,
  Stone = 2,
  Metal = 3,
}

// Building placement state
// Note: Fence edge is now determined dynamically by mouse position (same as walls)
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
  
  // Convert cell coordinates to world pixel coordinates (center of foundation cell)
  const { x: worldX, y: worldY } = foundationCellToWorldCenter(cellX, cellY);
  
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
  
  // Get all foundations at the same cell AND adjacent cells
  const sameCellFoundations: { x: number; y: number; shape: FoundationShape }[] = [];
  const adjacentFoundations = new Map<string, { x: number; y: number; shape: FoundationShape }>();
  
  // Define triangle complements map
  const triangleComplements = new Map<FoundationShape, FoundationShape>([
    [FoundationShape.TriNW, FoundationShape.TriSE], // NW triangle -> SE triangle forms full square
    [FoundationShape.TriNE, FoundationShape.TriSW], // NE triangle -> SW triangle forms full square
    [FoundationShape.TriSE, FoundationShape.TriNW], // SE triangle -> NW triangle forms full square
    [FoundationShape.TriSW, FoundationShape.TriNE], // SW triangle -> NE triangle forms full square
  ]);
  
  for (const foundation of connection.db.foundationCell.iter()) {
    if (foundation.isDestroyed) continue;
    
    const dx = foundation.cellX - cellX;
    const dy = foundation.cellY - cellY;
    
    // Check if same cell
    if (dx === 0 && dy === 0) {
      sameCellFoundations.push({
        x: foundation.cellX,
        y: foundation.cellY,
        shape: foundation.shape as FoundationShape
      });
    }
    
    // Check if adjacent (cardinal or diagonal, within 1 cell)
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx !== 0 || dy !== 0)) {
      const key = `${foundation.cellX},${foundation.cellY}`;
      if (!adjacentFoundations.has(key)) {
        adjacentFoundations.set(key, {
          x: foundation.cellX,
          y: foundation.cellY,
          shape: foundation.shape as FoundationShape
        });
      }
    }
  }
  
  // Priority 0: Check if there's already a triangle at this exact cell that we can complement
  for (const sameCell of sameCellFoundations) {
    if (sameCell.shape >= FoundationShape.TriNW && sameCell.shape <= FoundationShape.TriSW) {
      const complement = triangleComplements.get(sameCell.shape);
      if (complement) {
        return complement; // Suggest complementary triangle for same cell
      }
    }
  }
  
  if (adjacentFoundations.size === 0 && sameCellFoundations.length === 0) {
    return null; // No adjacent or same-cell foundations
  }
  
  // Check diagonally adjacent triangles for complementing (forming squares across cells)
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
  
  // Priority 1.5: Check cardinal directions for TRIANGLE foundations (follow curves/patterns)
  // When placing next to a triangle foundation, suggest a shape that continues the curve/pattern
  // This detects diagonal edges (hypotenuses) and matches them to continue smooth curves
  const curveSuggestions: FoundationShape[] = [];
  
  // Helper: Get triangle foundation at a given offset
  const getTriangleAt = (dx: number, dy: number): FoundationShape | null => {
    const key = `${cellX + dx},${cellY + dy}`;
    const adj = adjacentFoundations.get(key);
    if (adj && adj.shape >= FoundationShape.TriNW && adj.shape <= FoundationShape.TriSW) {
      return adj.shape;
    }
    return null;
  };
  
  // Check cardinal directions for triangles and suggest shapes that continue the pattern
  const triangleNorth = getTriangleAt(0, -1);
  const triangleSouth = getTriangleAt(0, 1);
  const triangleEast = getTriangleAt(1, 0);
  const triangleWest = getTriangleAt(-1, 0);
  
  // Pattern continuation logic: match the diagonal edge that connects the two cells
  // When placing adjacent to a triangle, we want to continue the diagonal line smoothly
  // This means matching the edge that would form a continuous diagonal curve
  
  // INVERTED: Fill the space closest to existing foundations by suggesting complementary triangles
  // When placing next to a triangle, suggest the COMPLEMENTARY triangle to fill the space
  if (triangleNorth !== null) {
    // Triangle to the north - suggest complementary to fill space closest
    if (triangleNorth === FoundationShape.TriNW) {
      // TriNW above → fill space → TriSE (complementary)
      curveSuggestions.push(FoundationShape.TriSE);
    } else if (triangleNorth === FoundationShape.TriNE) {
      // TriNE above → fill space → TriSW (complementary)
      curveSuggestions.push(FoundationShape.TriSW);
    } else if (triangleNorth === FoundationShape.TriSE) {
      // TriSE above → fill space → TriNW (complementary)
      curveSuggestions.push(FoundationShape.TriNW);
    } else if (triangleNorth === FoundationShape.TriSW) {
      // TriSW above → fill space → TriNE (complementary)
      curveSuggestions.push(FoundationShape.TriNE);
    }
  }
  
  if (triangleSouth !== null) {
    // Triangle to the south - suggest complementary to fill space closest
    if (triangleSouth === FoundationShape.TriNW) {
      // TriNW below → fill space → TriSE (complementary)
      curveSuggestions.push(FoundationShape.TriSE);
    } else if (triangleSouth === FoundationShape.TriNE) {
      // TriNE below → fill space → TriSW (complementary)
      curveSuggestions.push(FoundationShape.TriSW);
    } else if (triangleSouth === FoundationShape.TriSE) {
      // TriSE below → fill space → TriNW (complementary)
      curveSuggestions.push(FoundationShape.TriNW);
    } else if (triangleSouth === FoundationShape.TriSW) {
      // TriSW below → fill space → TriNE (complementary)
      curveSuggestions.push(FoundationShape.TriNE);
    }
  }
  
  if (triangleEast !== null) {
    // Triangle to the east - suggest complementary to fill space closest
    if (triangleEast === FoundationShape.TriNW) {
      // TriNW to right → fill space → TriSE (complementary)
      curveSuggestions.push(FoundationShape.TriSE);
    } else if (triangleEast === FoundationShape.TriNE) {
      // TriNE to right → fill space → TriSW (complementary)
      curveSuggestions.push(FoundationShape.TriSW);
    } else if (triangleEast === FoundationShape.TriSE) {
      // TriSE to right → fill space → TriNW (complementary)
      curveSuggestions.push(FoundationShape.TriNW);
    } else if (triangleEast === FoundationShape.TriSW) {
      // TriSW to right → fill space → TriNE (complementary)
      curveSuggestions.push(FoundationShape.TriNE);
    }
  }
  
  if (triangleWest !== null) {
    // Triangle to the west - suggest complementary to fill space closest
    if (triangleWest === FoundationShape.TriNW) {
      // TriNW to left → fill space → TriSE (complementary)
      curveSuggestions.push(FoundationShape.TriSE);
    } else if (triangleWest === FoundationShape.TriNE) {
      // TriNE to left → fill space → TriSW (complementary)
      curveSuggestions.push(FoundationShape.TriSW);
    } else if (triangleWest === FoundationShape.TriSE) {
      // TriSE to left → fill space → TriNW (complementary)
      curveSuggestions.push(FoundationShape.TriNW);
    } else if (triangleWest === FoundationShape.TriSW) {
      // TriSW to left → fill space → TriNE (complementary)
      curveSuggestions.push(FoundationShape.TriNE);
    }
  }
  
  // Priority 2: Check cardinal directions for full foundations (N, E, S, W)
  // BUT only if we don't have triangle curve suggestions (triangles take priority for curves)
  // When placing next to a full foundation, suggest triangle that creates smooth corner/edge
  // The triangle should form a corner that "follows" the existing structure
  const cardinalSuggestions: FoundationShape[] = [];
  
  // Helper: Check if there's a foundation at a given offset
  const hasFoundation = (dx: number, dy: number): boolean => {
    const key = `${cellX + dx},${cellY + dy}`;
    const adj = adjacentFoundations.get(key);
    return adj !== undefined && adj.shape === FoundationShape.Full;
  };
  
  // Check all 4 cardinal directions and determine best corner
  const hasNorth = hasFoundation(0, -1);
  const hasSouth = hasFoundation(0, 1);
  const hasEast = hasFoundation(1, 0);
  const hasWest = hasFoundation(-1, 0);
  
  // Determine corner based on adjacent foundations
  // When two foundations meet, fill the INSIDE corner (where they meet)
  if (hasNorth && hasEast) {
    // Foundation above and to right → meet at top-right → fill INSIDE corner → TriNE (top-right)
    cardinalSuggestions.push(FoundationShape.TriNE);
  } else if (hasNorth && hasWest) {
    // Foundation above and to left → meet at top-left → fill INSIDE corner → TriNW (top-left)
    cardinalSuggestions.push(FoundationShape.TriNW);
  } else if (hasSouth && hasEast) {
    // Foundation below and to right → meet at bottom-right → fill INSIDE corner → TriSE (bottom-right)
    cardinalSuggestions.push(FoundationShape.TriSE);
  } else if (hasSouth && hasWest) {
    // Foundation below and to left → meet at bottom-left → fill INSIDE corner → TriSW (bottom-left)
    cardinalSuggestions.push(FoundationShape.TriSW);
  } else if (hasNorth) {
    // Only foundation above → fill top corner (where foundation is) → prefer right → TriNE
    cardinalSuggestions.push(FoundationShape.TriNE);
  } else if (hasSouth) {
    // Only foundation below → fill bottom corner (where foundation is) → prefer right → TriSE
    cardinalSuggestions.push(FoundationShape.TriSE);
  } else if (hasEast) {
    // Only foundation to right → fill right corner (where foundation is) → prefer top → TriNE
    cardinalSuggestions.push(FoundationShape.TriNE);
  } else if (hasWest) {
    // Only foundation to left → fill left corner (where foundation is) → prefer top → TriNW
    cardinalSuggestions.push(FoundationShape.TriNW);
  }
  
  // PRIORITY: Curve suggestions (triangles) take precedence over corner filling (full foundations)
  // If we have curve suggestions, prioritize them (they follow existing patterns)
  if (curveSuggestions.length > 0) {
    // Return most common suggestion (if multiple triangles suggest the same shape)
    const counts = new Map<FoundationShape, number>();
    for (const shape of curveSuggestions) {
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
    
    return mostCommon || curveSuggestions[0];
  }
  
  // If we have cardinal suggestions (for full foundations), return the first one (most specific)
  // Only used when there are no triangle curve suggestions
  if (cardinalSuggestions.length > 0) {
    return cardinalSuggestions[0];
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
  
  // IMPORTANT: Check ALL foundations at this cell - there might be two complementary triangles already
  let foundComplementary = false;
  let foundOverlap = false;
  let foundationCount = 0;
  
  // Check if there's already a foundation at this cell
  for (const foundation of connection.db.foundationCell.iter()) {
    if (foundation.cellX === cellX && foundation.cellY === cellY && !foundation.isDestroyed) {
      foundationCount++;
      const existingShape = foundation.shape as FoundationShape;
      
      // Check if shapes are compatible
      // Same shape = overlap
      if (existingShape === shape) {
        return true; // Occupied
      }
      
      // Full foundation overlaps with anything
      if (existingShape === FoundationShape.Full || shape === FoundationShape.Full) {
        return true; // Occupied
      }
      
      // Complementary triangles can be placed together
      const isComplementary = (
        (existingShape === FoundationShape.TriNW && shape === FoundationShape.TriSE) ||
        (existingShape === FoundationShape.TriSE && shape === FoundationShape.TriNW) ||
        (existingShape === FoundationShape.TriNE && shape === FoundationShape.TriSW) ||
        (existingShape === FoundationShape.TriSW && shape === FoundationShape.TriNE)
      );
      
      if (isComplementary) {
        foundComplementary = true; // Mark that we found a complementary triangle
      } else {
        // Non-complementary triangles overlap
        foundOverlap = true; // Mark that we found an overlap
      }
    }
  }
  
  // If we found an overlap, block placement
  if (foundOverlap) {
    return true; // Occupied
  }
  
  // If there are already 2 foundations at this cell (two complementary triangles forming a full square),
  // block any further placement
  if (foundationCount >= 2) {
    return true; // Already have two triangles forming a full square
  }
  
  // If we found a complementary triangle and no overlaps, allow placement
  // (This handles the case where we're adding the second triangle to form a full square)
  // If no foundations found at all, allow placement
  return false; // Not occupied
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
  const [buildingTier, setBuildingTier] = useState<BuildingTier>(BuildingTier.Twig);
  const [placementError, setPlacementError] = useState<string | null>(null);
  
  // Track manually set shape (when R is pressed) to prevent auto-prediction from overriding
  const manuallySetShapeRef = useRef<FoundationShape | null>(null);
  const lastPredictedTileRef = useRef<{ tileX: number; tileY: number } | null>(null);
  const foundationShapeRef = useRef<FoundationShape>(FoundationShape.Full); // Track current shape to avoid dependency issues

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
        // Play appropriate error sound based on error type (immediate client-side feedback)
        // Server-side sound won't play because the transaction rolls back
        if (errorMsg.includes('Not enough')) {
          playImmediateSound('error_resources', 1.0);
        } else if (errorMsg.includes('rune stone') || errorMsg.includes('monument')) {
          playImmediateSound('error_foundation_monument', 1.0);
        } else {
          playImmediateSound('construction_placement_error', 1.0);
        }
      } else if (ctx.event?.status?.tag === 'Committed') {
        console.log('[BuildingManager] placeFoundation succeeded!');
        setPlacementError(null);
        // Sound is now played server-side for all players to hear
      }
    };

    const handlePlaceWallResult = (ctx: any, cellX: bigint, cellY: bigint, worldX: number, worldY: number, tier: number) => {
      console.log('[BuildingManager] placeWall reducer result:', ctx.event?.status);
      if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Failed to place wall';
        console.error('[BuildingManager] placeWall failed:', errorMsg);
        console.log('[BuildingManager] Failed wall placement details:', { cellX, cellY, worldX, worldY, tier, errorMsg });
        setPlacementError(errorMsg);
        // Play error_resources sound for resource errors (immediate client-side feedback)
        // Server-side sound won't play because the transaction rolls back
        if (errorMsg.includes('Not enough')) {
          playImmediateSound('error_resources', 1.0);
        } else {
          playImmediateSound('construction_placement_error', 1.0);
        }
      } else if (ctx.event?.status?.tag === 'Committed') {
        console.log('[BuildingManager] placeWall succeeded!');
        setPlacementError(null);
        // Sound is now played server-side for all players to hear
      }
    };

    connection.reducers.onPlaceFoundation(handlePlaceFoundationResult);
    connection.reducers.onPlaceWall(handlePlaceWallResult);

    return () => {
      connection.reducers.removeOnPlaceFoundation(handlePlaceFoundationResult);
      connection.reducers.removeOnPlaceWall(handlePlaceWallResult);
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
        foundationShapeRef.current = initialShape;
        console.log('[BuildingManager] Set foundation shape to', initialShape);
        // If starting with a triangle, mark it as manually set initially
        if (initialShape >= FoundationShape.TriNW && initialShape <= FoundationShape.TriSW) {
          manuallySetShapeRef.current = initialShape;
        }
      } else {
        setFoundationShape(FoundationShape.Full);
        foundationShapeRef.current = FoundationShape.Full;
        console.log('[BuildingManager] Set foundation shape to Full');
      }
    } else if (newMode === BuildingMode.Wall) {
      setBuildingEdge(BuildingEdge.N);
      setBuildingFacing(BuildingFacing.Exterior);
    } else if (newMode === BuildingMode.Fence) {
      // Fences don't need special initialization
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
        foundationShapeRef.current = newShape;
        return newShape;
      } else {
        const prevIndex = (currentIndex - 1 + shapes.length) % shapes.length;
        const newShape = shapes[prevIndex];
        manuallySetShapeRef.current = newShape; // Mark as manually set
        foundationShapeRef.current = newShape;
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
        foundationShapeRef.current = newShape;
        return newShape;
      }
      
      const currentIndex = triangleShapes.indexOf(prev);
      const nextIndex = (currentIndex + 1) % triangleShapes.length;
      const newShape = triangleShapes[nextIndex];
      manuallySetShapeRef.current = newShape; // Mark as manually set to prevent auto-prediction from overriding
      foundationShapeRef.current = newShape;
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

    // Convert world coordinates to foundation cell coordinates (96px grid)
    const { cellX, cellY } = worldPixelsToFoundationCell(worldX, worldY);

    try {
      if (mode === BuildingMode.Foundation) {
        // Check client-side validation
        if (isFoundationPlacementTooFar(connection, cellX, cellY, localPlayerX, localPlayerY)) {
          setPlacementError('Too far away');
          playImmediateSound('construction_placement_error', 1.0);
          return;
        }

        // Check if position is on water (foundations cannot be placed on water tiles)
        // Convert foundation cell to world tile for water check
        const { x: foundationCenterX, y: foundationCenterY } = foundationCellToWorldCenter(cellX, cellY);
        const { tileX, tileY } = worldPosToTileCoords(foundationCenterX, foundationCenterY);
        const tileType = getTileTypeFromChunkData(connection, tileX, tileY);
        if (tileType === 'Sea') {
          setPlacementError('Cannot place foundation on water');
          playImmediateSound('construction_placement_error', 1.0);
          return;
        }

        // Check if position has grass (foundations cannot be placed on grass - must clear first)
        // With split tables: grass (static) + grassState (is_alive)
        const FOUNDATION_SIZE = 96; // Foundation is 96x96 pixels
        const foundationMinX = foundationCenterX - FOUNDATION_SIZE / 2;
        const foundationMaxX = foundationCenterX + FOUNDATION_SIZE / 2;
        const foundationMinY = foundationCenterY - FOUNDATION_SIZE / 2;
        const foundationMaxY = foundationCenterY + FOUNDATION_SIZE / 2;
        
        let hasGrassBlockingPlacement = false;
        for (const grass of connection.db.grass.iter()) {
          // Look up is_alive from grassState table (split tables)
          const grassState = connection.db.grassState.grassId.find(grass.id);
          const isAlive = grassState?.isAlive ?? false;
          if (isAlive &&
              grass.posX >= foundationMinX && grass.posX <= foundationMaxX &&
              grass.posY >= foundationMinY && grass.posY <= foundationMaxY) {
            hasGrassBlockingPlacement = true;
            break;
          }
        }
        
        if (hasGrassBlockingPlacement) {
          setPlacementError('Cannot place foundation on grass. Clear the grass first.');
          playImmediateSound('construction_placement_error', 1.0);
          return;
        }

        if (isFoundationPositionOccupied(connection, cellX, cellY, foundationShape)) {
          console.log('[BuildingManager] Client-side validation: Position already occupied at', { cellX, cellY });
          setPlacementError('Position already occupied');
          playImmediateSound('construction_placement_error', 1.0);
          return;
        }

        // Call server reducer
        console.log('[BuildingManager] Calling placeFoundation reducer:', { cellX, cellY, shape: foundationShape, tier: buildingTier });
        try {
          connection.reducers.placeFoundation(
            BigInt(cellX),
            BigInt(cellY),
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
      } else if (mode === BuildingMode.Wall) {
        // Wall placement logic
        // Check client-side validation
        if (isFoundationPlacementTooFar(connection, cellX, cellY, localPlayerX, localPlayerY)) {
          setPlacementError('Too far away');
          playImmediateSound('construction_placement_error', 1.0);
          return;
        }

        // Check if there's a foundation at this cell (walls require a foundation)
        let hasFoundation = false;
        for (const foundation of connection.db.foundationCell.iter()) {
          if (foundation.cellX === cellX && foundation.cellY === cellY && !foundation.isDestroyed) {
            hasFoundation = true;
            break;
          }
        }

        if (!hasFoundation) {
          setPlacementError('Walls require a foundation');
          playImmediateSound('construction_placement_error', 1.0);
          return;
        }

        // Call server reducer - server will determine edge and facing from world coordinates
        console.log('[BuildingManager] Calling placeWall reducer:', { cellX, cellY, worldX, worldY, tier: buildingTier });
        try {
          connection.reducers.placeWall(
            BigInt(cellX),
            BigInt(cellY),
            worldX,
            worldY,
            buildingTier as number // BuildingTier enum value (0-3)
          );
          console.log('[BuildingManager] placeWall reducer called successfully');
        } catch (err) {
          console.error('[BuildingManager] Error calling placeWall reducer:', err);
          setPlacementError(`Failed to call reducer: ${err}`);
          playImmediateSound('construction_placement_error', 1.0);
        }
        
        // Note: Don't cancel building mode - allow continuous placement
      } else if (mode === BuildingMode.Fence) {
        // Fence placement logic - now uses 96px foundation cell grid (same as walls)
        // Convert world position to foundation cell coordinates (96px grid)
        const { cellX, cellY } = worldPixelsToFoundationCell(worldX, worldY);
        
        // Determine edge based on mouse position relative to cell center (same as walls)
        const cellCenterX = cellX * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
        const cellCenterY = cellY * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
        const edgeDx = worldX - cellCenterX;
        const edgeDy = worldY - cellCenterY;
        const absEdgeDx = Math.abs(edgeDx);
        const absEdgeDy = Math.abs(edgeDy);
        
        // Determine edge: N=0, E=1, S=2, W=3
        let edge: number;
        if (absEdgeDy > absEdgeDx) {
          edge = edgeDy < 0 ? 0 : 2; // North or South
        } else {
          edge = edgeDx < 0 ? 3 : 1; // West or East
        }
        
        // Check placement distance from player (use edge position, not cell center)
        let edgePosX: number, edgePosY: number;
        switch (edge) {
          case 0: edgePosX = cellCenterX; edgePosY = cellY * FOUNDATION_TILE_SIZE; break; // North
          case 1: edgePosX = (cellX + 1) * FOUNDATION_TILE_SIZE; edgePosY = cellCenterY; break; // East
          case 2: edgePosX = cellCenterX; edgePosY = (cellY + 1) * FOUNDATION_TILE_SIZE; break; // South
          case 3: edgePosX = cellX * FOUNDATION_TILE_SIZE; edgePosY = cellCenterY; break; // West
          default: edgePosX = cellCenterX; edgePosY = cellCenterY;
        }
        
        const dx = edgePosX - localPlayerX;
        const dy = edgePosY - localPlayerY;
        const distSq = dx * dx + dy * dy;
        const MAX_DISTANCE_SQ = 128 * 128; // Same as other building pieces
        
        if (distSq > MAX_DISTANCE_SQ) {
          setPlacementError('Too far away');
          playImmediateSound('construction_placement_error', 1.0);
          return;
        }
        
        // Check if there's already a fence at this edge
        let hasExistingFence = false;
        for (const fence of connection.db.fence.iter()) {
          if (fence.cellX === cellX && fence.cellY === cellY && fence.edge === edge && !fence.isDestroyed) {
            hasExistingFence = true;
            break;
          }
        }
        
        if (hasExistingFence) {
          setPlacementError('A fence already exists at this edge');
          playImmediateSound('construction_placement_error', 1.0);
          return;
        }
        
        // Call server reducer
        console.log('[BuildingManager] Calling placeFence reducer:', { cellX, cellY, edge });
        try {
          connection.reducers.placeFence(
            BigInt(cellX),
            BigInt(cellY),
            edge
          );
          console.log('[BuildingManager] placeFence reducer called successfully');
        } catch (err) {
          console.error('[BuildingManager] Error calling placeFence reducer:', err);
          setPlacementError(`Failed to call reducer: ${err}`);
          playImmediateSound('construction_placement_error', 1.0);
        }
        
        // Note: Don't cancel building mode - allow continuous placement
      } else {
        console.warn(`[BuildingManager] Placement not implemented for mode: ${mode}`);
        setPlacementError(`Placement not implemented for ${mode}`);
      }
    } catch (err: any) {
      console.error('[BuildingManager] Failed to call placement reducer:', err);
      setPlacementError(err?.message || 'Failed to place building piece');
    }
  }, [connection, isBuilding, mode, foundationShape, buildingTier, localPlayerX, localPlayerY]);

  // PERFORMANCE FIX: Compute foundation cell coordinates with memoization
  // The key insight: we only need to re-predict when the CELL changes, not on every pixel move
  // Mouse moves ~60 times/sec but cell only changes every 96 pixels
  const currentCellRef = useRef<{ cellX: number; cellY: number } | null>(null);
  
  // ADDED: Auto-predict triangle shape based on surrounding foundations
  // PERFORMANCE FIX: Use a ref-based approach to avoid running expensive prediction on every mouse pixel move
  useEffect(() => {
    // Only predict when:
    // 1. In building mode
    // 2. Mode is Foundation
    // 3. Mouse position is available
    if (!isBuilding || mode !== BuildingMode.Foundation) return;
    if (!worldMouseX || !worldMouseY || !connection) return;
    
    // Update ref to current shape
    foundationShapeRef.current = foundationShape;
    
    // Convert world pixel coordinates to foundation cell coordinates (96px grid)
    const { cellX, cellY } = worldPixelsToFoundationCell(worldMouseX, worldMouseY);
    
    // PERFORMANCE FIX: Skip if we're still in the same cell - this is the key optimization!
    // Mouse moves constantly but cells only change every 96 pixels
    const currentCell = currentCellRef.current;
    if (currentCell && currentCell.cellX === cellX && currentCell.cellY === cellY) {
      // Same cell, no need to re-run expensive prediction logic
      return;
    }
    
    // Update current cell ref
    currentCellRef.current = { cellX, cellY };
    
    // Check if we've moved to a different foundation cell
    const lastTile = lastPredictedTileRef.current;
    const tileChanged = !lastTile || lastTile.tileX !== cellX || lastTile.tileY !== cellY;
    
    // Skip if shape was manually set AND we're still on the same tile
    if (manuallySetShapeRef.current !== null && !tileChanged) {
      // Still on same tile with manual override, don't predict
      return;
    }
    
    // If we moved to a new tile, clear manual override
    if (tileChanged && manuallySetShapeRef.current !== null) {
      // PERFORMANCE FIX: Removed console.log that ran on cell change
      manuallySetShapeRef.current = null;
    }
    
    // Only predict for triangle shapes - check current shape
    const currentShape = foundationShapeRef.current;
    const isTriangle = currentShape >= FoundationShape.TriNW && currentShape <= FoundationShape.TriSW;
    
    // If not a triangle and not full, skip (but allow if we're starting triangle mode)
    if (!isTriangle && currentShape !== FoundationShape.Full) {
      // Not in triangle mode yet, but if tile changed and we're in foundation mode, 
      // we might want to switch to triangle mode - but for now, skip
      return;
    }
    
    // Only predict if we're in triangle mode (shape is a triangle)
    if (!isTriangle) return;
    
    // Always re-predict when foundation cell changes (foundations might have changed)
    // Predict the best triangle shape using foundation cell coordinates
    const predictedShape = predictTriangleShape(connection, cellX, cellY);
    
    if (predictedShape !== null) {
      // PERFORMANCE FIX: Removed console.log that ran on every prediction
      // Update if prediction is different from current shape OR if foundation cell changed
      if (predictedShape !== currentShape || tileChanged) {
        setFoundationShape(predictedShape);
        foundationShapeRef.current = predictedShape;
      }
      lastPredictedTileRef.current = { tileX: cellX, tileY: cellY };
    } else {
      // No clear pattern, but we're in triangle mode - default to TriNW if not already set
      if (currentShape !== FoundationShape.TriNW || tileChanged) {
        // PERFORMANCE FIX: Removed console.log that ran on every default assignment
        setFoundationShape(FoundationShape.TriNW);
        foundationShapeRef.current = FoundationShape.TriNW;
      }
      lastPredictedTileRef.current = { tileX: cellX, tileY: cellY };
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

