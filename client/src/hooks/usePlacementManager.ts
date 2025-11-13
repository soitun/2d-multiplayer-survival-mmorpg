import { useState, useCallback, useRef, useEffect } from 'react';
import { DbConnection, ItemDefinition } from '../generated'; // Import connection type and ItemDefinition
import { TILE_SIZE } from '../config/gameConfig';
import { isSeedItemValid, requiresWaterPlacement } from '../utils/plantsUtils';
import { HEARTH_HEIGHT, HEARTH_RENDER_Y_OFFSET } from '../utils/renderers/hearthRenderingUtils'; // For Matron's Chest placement adjustment

// Minimum distance between planted seeds (in pixels)
const MIN_SEED_DISTANCE = 20;

// Type for the information needed to start placement
export interface PlacementItemInfo {
  itemDefId: bigint;
  itemName: string;
  iconAssetName: string;
  instanceId: bigint;
}

// Type for the state managed by the hook
export interface PlacementState {
  isPlacing: boolean;
  placementInfo: PlacementItemInfo | null;
  placementError: string | null;
}

// Type for the functions returned by the hook
export interface PlacementActions {
  startPlacement: (itemInfo: PlacementItemInfo) => void;
  cancelPlacement: () => void;
  attemptPlacement: (worldX: number, worldY: number, isPlacementTooFar?: boolean) => void;
}

/**
 * Gets tile type from compressed chunk data (matching GameCanvas.tsx logic)
 * Returns tile type tag string or null if not found
 */
function getTileTypeFromChunkData(connection: DbConnection | null, tileX: number, tileY: number): string | null {
  if (!connection) return null;
  
  // Default chunk size (typically 8 tiles per chunk)
  let chunkSize = 8;
  
  // Try to find chunk size from any chunk data
  for (const chunk of connection.db.worldChunkData.iter()) {
    if (chunk.chunkSize) {
      chunkSize = chunk.chunkSize;
      break;
    }
  }
  
  // Calculate which chunk this tile belongs to (matching GameCanvas.tsx logic)
  const chunkX = Math.floor(tileX / chunkSize);
  const chunkY = Math.floor(tileY / chunkSize);
  
  // Look up the compressed chunk data using the same key format as GameCanvas
  const chunkKey = `${chunkX},${chunkY}`;
  
  // Find chunk by iterating (since we don't have the chunkCacheRef)
  for (const chunk of connection.db.worldChunkData.iter()) {
    if (chunk.chunkX === chunkX && chunk.chunkY === chunkY) {
      // Calculate local tile position within the chunk (matching GameCanvas.tsx logic)
      const localX = tileX % chunkSize;
      const localY = tileY % chunkSize;
      
      // Handle negative mod (for negative tile coordinates)
      const localTileX = localX < 0 ? localX + chunkSize : localX;
      const localTileY = localY < 0 ? localY + chunkSize : localY;
      
      // Use chunk.chunkSize (which may differ from default) for index calculation
      const actualChunkSize = chunk.chunkSize || chunkSize;
      const tileIndex = localTileY * actualChunkSize + localTileX;
      
      // Check bounds and extract tile type
      if (tileIndex >= 0 && tileIndex < chunk.tileTypes.length) {
        const tileTypeU8 = chunk.tileTypes[tileIndex];
        // Convert Uint8 to tile type tag (matching server-side enum)
        switch (tileTypeU8) {
          case 0: return 'Grass';
          case 1: return 'Dirt';
          case 2: return 'DirtRoad';
          case 3: return 'Sea';
          case 4: return 'Beach';
          case 5: return 'Sand';
          default: return 'Grass';
        }
      }
      break; // Found the chunk, no need to continue
    }
  }
  
  return null; // No compressed data found for this position
}

/**
 * Converts world pixel coordinates to tile coordinates
 */
function worldPosToTileCoords(worldX: number, worldY: number): { tileX: number; tileY: number } {
  const TILE_SIZE = 48; // pixels per tile (matches server TILE_SIZE_PX and GameCanvas.tsx)
  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);
  return { tileX, tileY };
}

/**
 * Checks if a world position is on a water tile (Sea type).
 * Uses compressed chunk data for efficient lookup.
 * Returns true if the position is on water.
 */
function isPositionOnWater(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) {
    return false; // If no connection, allow placement (fallback)
  }

  const { tileX, tileY } = worldPosToTileCoords(worldX, worldY);
  
  // Use compressed chunk data lookup
  const tileType = getTileTypeFromChunkData(connection, tileX, tileY);
  const isWater = tileType === 'Sea';
  
  console.log(`[WaterCheck] Tile at (${tileX}, ${tileY}): type=${tileType}, isWater=${isWater}`);
  
  if (tileType === null) {
    console.log(`[WaterCheck] No chunk data found for tile (${tileX}, ${tileY}), assuming not water`);
  }
  
  return isWater;
}

/**
 * Calculates the distance to the nearest shore (non-water tile) from a water position.
 * Returns distance in pixels, or -1 if position is not on water.
 */
function calculateShoreDistance(connection: DbConnection | null, worldX: number, worldY: number): number {
  if (!connection) {
    console.log('[ShoreDistance] No connection, returning -1');
    return -1;
  }
  
  const TILE_SIZE = 48; // pixels per tile (matches server TILE_SIZE_PX and GameCanvas.tsx)
  const MAX_SEARCH_RADIUS_PIXELS = 200.0; // Matching server-side limit (20 meters = 200 pixels)
  const MAX_SEARCH_RADIUS_TILES = Math.ceil(MAX_SEARCH_RADIUS_PIXELS / TILE_SIZE); // ~5 tiles
  
  const { tileX: centerTileX, tileY: centerTileY } = worldPosToTileCoords(worldX, worldY);
  console.log(`[ShoreDistance] Searching from tile (${centerTileX}, ${centerTileY}), max radius: ${MAX_SEARCH_RADIUS_TILES} tiles`);
  
  // First verify we're on water
  if (!isPositionOnWater(connection, worldX, worldY)) {
    console.log('[ShoreDistance] Not on water, returning -1');
    return -1; // Not on water
  }
  
  // Search outward in concentric circles to find nearest non-water tile
  // Limit search to MAX_SEARCH_RADIUS_TILES to match server-side 500 pixel limit
  for (let radius = 1; radius <= MAX_SEARCH_RADIUS_TILES; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        // Only check tiles on the perimeter of the current radius
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        
        const checkTileX = centerTileX + dx;
        const checkTileY = centerTileY + dy;
        
        // Find this tile using compressed chunk data
        const checkTileType = getTileTypeFromChunkData(connection, checkTileX, checkTileY);
        
        // If this tile is not water, we found shore
        if (checkTileType !== null && checkTileType !== 'Sea') {
          const distancePixels = radius * TILE_SIZE;
          const finalDistance = Math.min(distancePixels, MAX_SEARCH_RADIUS_PIXELS);
          console.log(`[ShoreDistance] Found shore at tile (${checkTileX}, ${checkTileY}), type=${checkTileType}, radius ${radius} tiles = ${distancePixels}px, final: ${finalDistance}px`);
          // Cap at MAX_SEARCH_RADIUS_PIXELS to match server behavior
          return finalDistance;
        }
      }
    }
  }
  
  const result = MAX_SEARCH_RADIUS_PIXELS + 1;
  console.log(`[ShoreDistance] No shore found within ${MAX_SEARCH_RADIUS_TILES} tiles, returning ${result}px`);
  return result; // Beyond max search radius
}

/**
 * Checks if Reed Rhizome placement is valid (water within 20m of shore).
 * Returns true if placement should be blocked.
 */
function isReedRhizomePlacementBlocked(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) {
    console.log('[ReedRhizome] No connection, allowing placement');
    return false;
  }
  
  // Reed Rhizomes must be on water
  const isOnWater = isPositionOnWater(connection, worldX, worldY);
  console.log(`[ReedRhizome] Position (${worldX.toFixed(1)}, ${worldY.toFixed(1)}) - isOnWater: ${isOnWater}`);
  
  if (!isOnWater) {
    console.log('[ReedRhizome] BLOCKED: Not on water');
    return true; // Block if not on water
  }
  
  // Reed Rhizomes must be within 50m (500 pixels) of shore - MATCHING SERVER-SIDE LIMIT
  const shoreDistance = calculateShoreDistance(connection, worldX, worldY);
  const MAX_SHORE_DISTANCE = 200.0; // 50 meters = 500 pixels (matching server-side constant)
  
  console.log(`[ReedRhizome] Shore distance: ${shoreDistance.toFixed(1)}px, Max: ${MAX_SHORE_DISTANCE}px`);
  
  if (shoreDistance < 0 || shoreDistance > MAX_SHORE_DISTANCE) {
    console.log(`[ReedRhizome] BLOCKED: Too far from shore (distance: ${shoreDistance.toFixed(1)}px)`);
    return true; // Block if too far from shore
  }
  
  console.log('[ReedRhizome] VALID: Placement allowed');
  return false; // Valid placement
}

/**
 * Checks if placement should be blocked due to water tiles.
 * This applies to shelters, camp fires, lanterns, stashes, wooden storage boxes, sleeping bags, and most seeds.
 * Reed Rhizomes have special handling and require water instead.
 */
function isWaterPlacementBlocked(connection: DbConnection | null, placementInfo: PlacementItemInfo | null, worldX: number, worldY: number): boolean {
  if (!connection || !placementInfo) {
    return false;
  }

  // Special case: Seeds that require water placement (like Reed Rhizome)
  if (requiresWaterPlacement(placementInfo.itemName)) {
    return isReedRhizomePlacementBlocked(connection, worldX, worldY);
  }

  // List of items that cannot be placed on water
  const waterBlockedItems = ['Camp Fire', 'Furnace', 'Lantern', 'Wooden Storage Box', 'Sleeping Bag', 'Stash', 'Shelter', 'Reed Rain Collector', "Matron's Chest"]; // ADDED: Furnace, Matron's Chest
  
  // Seeds that don't require water (most seeds) cannot be planted on water
  const isSeedButNotWaterSeed = isSeedItemValid(placementInfo.itemName) && !requiresWaterPlacement(placementInfo.itemName);
  
  if (waterBlockedItems.includes(placementInfo.itemName) || isSeedButNotWaterSeed) {
    return isPositionOnWater(connection, worldX, worldY);
  }
  
  return false;
}

/**
 * Checks if a seed placement is too close to existing planted seeds.
 * Returns true if the placement should be blocked.
 */
function isSeedPlacementTooClose(connection: DbConnection | null, placementInfo: PlacementItemInfo | null, worldX: number, worldY: number): boolean {
  // Client-side validation removed - let players experiment freely!
  // The server-side crowding penalty system will handle optimization naturally
  return false;
}

export const usePlacementManager = (connection: DbConnection | null): [PlacementState, PlacementActions] => {
  const [placementInfo, setPlacementInfo] = useState<PlacementItemInfo | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);

  const isPlacing = placementInfo !== null;

  // Helper function to check if the currently placed item still exists and has quantity > 0
  const checkPlacementItemStillExists = useCallback(() => {
    if (!connection || !placementInfo) return true;
    
    // Find the item instance we're currently placing
    for (const item of connection.db.inventoryItem.iter()) {
      if (BigInt(item.instanceId) === placementInfo.instanceId) {
        return item.quantity > 0;
      }
    }
    
    // Item not found, cancel placement
    return false;
  }, [connection, placementInfo]);

  // --- Start Placement --- 
  const startPlacement = useCallback((itemInfo: PlacementItemInfo) => {
    // console.log(`[PlacementManager] Starting placement for: ${itemInfo.itemName} (ID: ${itemInfo.itemDefId})`);
    setPlacementInfo(itemInfo);
    setPlacementError(null); // Clear errors on new placement start
  }, []);

  // --- Cancel Placement --- 
  const cancelPlacement = useCallback(() => {
    if (placementInfo) { // Only log if actually cancelling
      // console.log("[PlacementManager] Cancelling placement mode.");
      setPlacementInfo(null);
      setPlacementError(null);
    }
  }, [placementInfo]); // Depend on placementInfo to check if cancelling is needed

  // Effect to auto-cancel placement when seed stack runs out
  useEffect(() => {
    if (!isPlacing || !placementInfo || !connection) return;
    
    // Only apply this logic to seeds
          // Dynamic seed detection using plant utils - no more hardcoding!
      if (!isSeedItemValid(placementInfo.itemName)) return;
    
    // Check if the item still exists by directly examining the inventory
    let itemFound = false;
    for (const item of connection.db.inventoryItem.iter()) {
      if (BigInt(item.instanceId) === placementInfo.instanceId && item.quantity > 0) {
        itemFound = true;
        break;
      }
    }
    
    if (!itemFound) {
      console.log(`[PlacementManager] Seed stack empty, auto-cancelling placement for: ${placementInfo.itemName}`);
      cancelPlacement();
    }
  }, [isPlacing, placementInfo, connection, cancelPlacement, connection?.db.inventoryItem]);

  // --- Attempt Placement --- 
  const attemptPlacement = useCallback((worldX: number, worldY: number, isPlacementTooFar?: boolean) => {
    if (!connection || !placementInfo) {
      console.warn("[PlacementManager] Attempted placement with no connection or no item selected.");
      return;
    }

    // Check if the item still exists before attempting placement (especially important for seeds)
    if (!checkPlacementItemStillExists()) {
      console.log(`[PlacementManager] Item no longer exists, cancelling placement for: ${placementInfo.itemName}`);
      cancelPlacement();
      return;
    }

    // console.log(`[PlacementManager] Attempting to place ${placementInfo.itemName} at (${worldX}, ${worldY})`);
    setPlacementError(null); // Clear previous error

    // Check for distance restriction first
    if (isPlacementTooFar) {
      // setPlacementError("Too far away");
      return; // Don't proceed with placement
    }

    // Check for water placement restriction
    if (isWaterPlacementBlocked(connection, placementInfo, worldX, worldY)) {
      // setPlacementError("Cannot place on water");
      return; // Don't proceed with placement
    }

    // Check for seed proximity restriction
    if (isSeedPlacementTooClose(connection, placementInfo, worldX, worldY)) {
      // setPlacementError("Too close to other seeds");
      return; // Don't proceed with placement
    }

    try {
      // --- Reducer Mapping Logic --- 
      // This needs to be expanded as more placeable items are added
      switch (placementInfo.itemName) {
        case 'Camp Fire':
          // console.log(`[PlacementManager] Calling placeCampfire reducer with instance ID: ${placementInfo.instanceId}`);
          connection.reducers.placeCampfire(placementInfo.instanceId, worldX, worldY);
          // Note: We don't call cancelPlacement here. 
          // App.tsx's handleCampfireInsert callback will call it upon success.
          break;
        case 'Furnace': // ADDED: Furnace placement support
          // console.log(`[PlacementManager] Calling placeFurnace reducer with instance ID: ${placementInfo.instanceId}`);
          connection.reducers.placeFurnace(placementInfo.instanceId, worldX, worldY);
          // Note: We don't call cancelPlacement here. 
          // App.tsx's handleFurnaceInsert callback will call it upon success.
          break;
        case 'Lantern':
          // console.log(`[PlacementManager] Calling placeLantern reducer with instance ID: ${placementInfo.instanceId}`);
          connection.reducers.placeLantern(placementInfo.instanceId, worldX, worldY);
          // Note: We don't call cancelPlacement here. 
          // App.tsx's handleLanternInsert callback will call it upon success.
          break;
        case 'Wooden Storage Box':
          // console.log(`[PlacementManager] Calling placeWoodenStorageBox reducer with instance ID: ${placementInfo.instanceId}`);
          connection.reducers.placeWoodenStorageBox(placementInfo.instanceId, worldX, worldY);
          // Assume App.tsx will have a handleWoodenStorageBoxInsert similar to campfire
          break;
        case 'Sleeping Bag':
          // console.log(`[PlacementManager] Calling placeSleepingBag reducer with instance ID: ${placementInfo.instanceId}`);
          connection.reducers.placeSleepingBag(placementInfo.instanceId, worldX, worldY);
          // Assume App.tsx needs a handleSleepingBagInsert callback to cancel placement on success
          break;
        case 'Stash':
          // console.log(`[PlacementManager] Calling placeStash reducer with instance ID: ${placementInfo.instanceId}`);
          connection.reducers.placeStash(placementInfo.instanceId, worldX, worldY);
          // Assume App.tsx will need a handleStashInsert callback to cancel placement on success
          break;
        case 'Shelter':
          // console.log(`[PlacementManager] Calling placeShelter reducer with instance ID: ${placementInfo.instanceId}`);
          connection.reducers.placeShelter(placementInfo.instanceId, worldX, worldY);
          // Assume App.tsx will need a handleShelterInsert callback (added in useSpacetimeTables)
          // which should call cancelPlacement on success.
          break;
        case 'Reed Rain Collector':
          // console.log(`[PlacementManager] Calling placeRainCollector reducer with instance ID: ${placementInfo.instanceId}`);
          connection.reducers.placeRainCollector(placementInfo.instanceId, worldX, worldY);
          // Assume App.tsx will need a handleRainCollectorInsert callback to cancel placement on success
          break;
        case "Matron's Chest":
          // Adjust Y coordinate to account for entity rendering offset
          // Entity renders at: drawY = posY - HEARTH_HEIGHT - HEARTH_RENDER_Y_OFFSET
          // To center visual on cursor, we need: posY = cursorY + HEARTH_HEIGHT/2 + HEARTH_RENDER_Y_OFFSET
          const adjustedHearthY = worldY + HEARTH_HEIGHT / 2 + HEARTH_RENDER_Y_OFFSET;
          // console.log(`[PlacementManager] Calling placeHomesteadHearth reducer with instance ID: ${placementInfo.instanceId}, adjusted Y: ${worldY} -> ${adjustedHearthY}`);
          connection.reducers.placeHomesteadHearth(placementInfo.instanceId, worldX, adjustedHearthY);
          // Note: We don't call cancelPlacement here.
          // App.tsx's handleHomesteadHearthInsert callback will call it upon success.
          break;
        default:
          // Check if it's a plantable seed using dynamic detection
          if (isSeedItemValid(placementInfo.itemName)) {
            console.log(`[PlacementManager] Calling plantSeed reducer with instance ID: ${placementInfo.instanceId}`);
            connection.reducers.plantSeed(placementInfo.instanceId, worldX, worldY);
            // Note: Don't auto-cancel placement for seeds - let the system check if there are more seeds
            // The placement will be cancelled externally when the stack is empty or user switches slots
          } else {
            console.error(`[PlacementManager] Unknown item type for placement: ${placementInfo.itemName}`);
            setPlacementError(`Cannot place item: Unknown type '${placementInfo.itemName}'.`);
            // Optionally call cancelPlacement here if placement is impossible?
            // cancelPlacement(); 
          }
          break;
      }
    } catch (err: any) {
      console.error('[PlacementManager] Failed to call placement reducer (client-side error):', err);
      const errorMessage = err?.message || "Failed to place item. Check logs.";
      // Set error state managed by the hook
      setPlacementError(`Placement failed: ${errorMessage}`); 
      // Do NOT cancel placement on error, let user retry or cancel manually
    }
  }, [connection, placementInfo, checkPlacementItemStillExists, cancelPlacement]); // Dependencies

  // Consolidate state and actions for return
  const placementState: PlacementState = { isPlacing, placementInfo, placementError };
  const placementActions: PlacementActions = { startPlacement, cancelPlacement, attemptPlacement };

  return [placementState, placementActions];
};