import { useState, useCallback, useRef, useEffect } from 'react';
import { DbConnection, ItemDefinition } from '../generated'; // Import connection type and ItemDefinition
import { TILE_SIZE } from '../config/gameConfig';
import { isSeedItemValid, requiresWaterPlacement, requiresBeachPlacement } from '../utils/plantsUtils';
import { HEARTH_HEIGHT, HEARTH_RENDER_Y_OFFSET } from '../utils/renderers/hearthRenderingUtils'; // For Matron's Chest placement adjustment
import { playImmediateSound } from './useSoundSystem';

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
        // Convert Uint8 to tile type tag (matching server-side enum in lib.rs TileType::to_u8)
        switch (tileTypeU8) {
          case 0: return 'Grass';
          case 1: return 'Dirt';
          case 2: return 'DirtRoad';
          case 3: return 'Sea';
          case 4: return 'Beach';
          case 5: return 'Sand';
          case 6: return 'HotSpringWater';
          case 7: return 'Quarry';
          case 8: return 'Asphalt';
          case 9: return 'Forest';
          case 10: return 'Tundra';
          case 11: return 'Alpine';
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
 * Checks if a world position is on a beach tile (Beach type).
 * Uses compressed chunk data for efficient lookup.
 * Returns true if the position is on a beach.
 */
function isPositionOnBeach(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) {
    return false; // If no connection, allow placement (fallback)
  }

  const { tileX, tileY } = worldPosToTileCoords(worldX, worldY);
  
  // Use compressed chunk data lookup
  const tileType = getTileTypeFromChunkData(connection, tileX, tileY);
  return tileType === 'Beach';
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
 * Checks if Beach Lyme Grass Seeds placement is valid (beach tiles only).
 * Returns true if placement should be blocked.
 */
function isBeachLymeGrassPlacementBlocked(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) return false;
  
  // Beach Lyme Grass Seeds must be on beach tiles
  if (!isPositionOnBeach(connection, worldX, worldY)) {
    return true; // Block if not on beach
  }
  
  return false; // Valid placement
}

/**
 * Checks if placement should be blocked due to water tiles.
 * This applies to shelters, camp fires, lanterns, stashes, wooden storage boxes, sleeping bags, and most seeds.
 * Reed Rhizomes have special handling and require water instead.
 * Beach Lyme Grass Seeds and Scurvy Grass Seeds have special handling and require beach tiles.
 */
function isWaterPlacementBlocked(connection: DbConnection | null, placementInfo: PlacementItemInfo | null, worldX: number, worldY: number): boolean {
  if (!connection || !placementInfo) {
    return false;
  }

  // Special case: Seeds that require water placement (like Reed Rhizome)
  if (requiresWaterPlacement(placementInfo.itemName)) {
    return isReedRhizomePlacementBlocked(connection, worldX, worldY);
  }

  // Special case: Seeds that require beach placement (like Beach Lyme Grass Seeds)
  if (requiresBeachPlacement(placementInfo.itemName)) {
    return isBeachLymeGrassPlacementBlocked(connection, worldX, worldY);
  }

  // List of items that cannot be placed on water
  const waterBlockedItems = ['Camp Fire', 'Furnace', 'Barbecue', 'Lantern', 'Wooden Storage Box', 'Large Wooden Storage Box', 'Refrigerator', 'Sleeping Bag', 'Stash', 'Shelter', 'Reed Rain Collector', "Matron's Chest", 'Repair Bench']; // ADDED: Furnace, Barbecue, Matron's Chest, Large Wooden Storage Box, Refrigerator, Repair Bench
  
  // Seeds that don't require water or beach (most seeds) cannot be planted on water
  const isSeedButNotSpecialSeed = isSeedItemValid(placementInfo.itemName) && 
                                   !requiresWaterPlacement(placementInfo.itemName) && 
                                   !requiresBeachPlacement(placementInfo.itemName);
  
  if (waterBlockedItems.includes(placementInfo.itemName) || isSeedButNotSpecialSeed) {
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

/**
 * Checks if placement is blocked due to monument zones (ALK stations, rune stones, hot springs, quarries).
 * Returns true if placement should be blocked.
 */
function isMonumentZonePlacementBlocked(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) {
    return false; // If no connection, allow placement (fallback)
  }

  // Check ALK stations (same logic as server-side)
  const ALK_STATION_BUILDING_RESTRICTION_MULTIPLIER_CENTRAL = 7.0;
  const ALK_STATION_BUILDING_RESTRICTION_MULTIPLIER_SUBSTATION = 3.0;
  
  for (const station of connection.db.alkStation.iter()) {
    if (!station.isActive) continue;
    
    const dx = worldX - station.worldPosX;
    const dy = worldY - station.worldPosY;
    const distanceSq = dx * dx + dy * dy;
    
    const multiplier = station.stationId === 0 
      ? ALK_STATION_BUILDING_RESTRICTION_MULTIPLIER_CENTRAL
      : ALK_STATION_BUILDING_RESTRICTION_MULTIPLIER_SUBSTATION;
    const restrictionRadius = station.interactionRadius * multiplier;
    const restrictionRadiusSq = restrictionRadius * restrictionRadius;
    
    if (distanceSq <= restrictionRadiusSq) {
      return true; // Blocked by ALK station
    }
  }
  
  // Check rune stones (800px radius)
  const MONUMENT_PLACEMENT_RESTRICTION_RADIUS = 800.0;
  const MONUMENT_PLACEMENT_RESTRICTION_RADIUS_SQ = MONUMENT_PLACEMENT_RESTRICTION_RADIUS * MONUMENT_PLACEMENT_RESTRICTION_RADIUS;
  
  for (const runeStone of connection.db.runeStone.iter()) {
    const dx = worldX - runeStone.posX;
    const dy = worldY - runeStone.posY;
    const distanceSq = dx * dx + dy * dy;
    
    if (distanceSq <= MONUMENT_PLACEMENT_RESTRICTION_RADIUS_SQ) {
      return true; // Blocked by rune stone
    }
  }
  
  // Check hot springs and quarries (800px radius)
  // We check tiles around the position
  const TILE_SIZE = 48;
  const checkRadiusTiles = Math.ceil(MONUMENT_PLACEMENT_RESTRICTION_RADIUS / TILE_SIZE) + 1;
  const centerTileX = Math.floor(worldX / TILE_SIZE);
  const centerTileY = Math.floor(worldY / TILE_SIZE);
  
  for (let dy = -checkRadiusTiles; dy <= checkRadiusTiles; dy++) {
    for (let dx = -checkRadiusTiles; dx <= checkRadiusTiles; dx++) {
      const checkTileX = centerTileX + dx;
      const checkTileY = centerTileY + dy;
      
      const tileType = getTileTypeFromChunkData(connection, checkTileX, checkTileY);
      
      if (tileType === 'HotSpringWater' || tileType === 'Quarry') {
        const tileCenterX = checkTileX * TILE_SIZE + TILE_SIZE / 2;
        const tileCenterY = checkTileY * TILE_SIZE + TILE_SIZE / 2;
        const tdx = worldX - tileCenterX;
        const tdy = worldY - tileCenterY;
        const distanceSq = tdx * tdx + tdy * tdy;
        
        if (distanceSq <= MONUMENT_PLACEMENT_RESTRICTION_RADIUS_SQ) {
          return true; // Blocked by hot spring or quarry
        }
      }
    }
  }
  
  return false; // Not blocked
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

  // Register reducer callback to handle planting errors
  useEffect(() => {
    console.log('[PlacementManager] useEffect running, connection:', connection ? 'exists' : 'null');
    if (!connection) {
      console.log('[PlacementManager] No connection, skipping callback registration');
      return;
    }
    
    console.log('[PlacementManager] Connection exists, checking reducers:', {
      hasReducers: !!connection.reducers,
      hasOnPlantSeed: typeof connection.reducers?.onPlantSeed === 'function'
    });

    const handlePlantSeedResult = (ctx: any, itemInstanceId: bigint, plantPosX: number, plantPosY: number) => {
      console.log('[PlacementManager] plantSeed callback triggered:', { 
        itemInstanceId, 
        plantPosX, 
        plantPosY,
        eventStatus: ctx.event?.status,
        fullCtx: ctx
      });
      
      // Check for failed status - try multiple ways to access it
      const status = ctx.event?.status;
      const isFailed = status?.tag === 'Failed' || status === 'Failed' || (status && typeof status === 'object' && 'Failed' in status);
      
      if (isFailed) {
        // Try to get error message from different possible structures
        let errorMsg = 'Failed to plant seed';
        if (status?.tag === 'Failed' && status?.value) {
          errorMsg = status.value;
        } else if (status?.Failed) {
          errorMsg = status.Failed;
        } else if (typeof status === 'string' && status !== 'Committed') {
          errorMsg = status;
        } else if (status && typeof status === 'object') {
          // Try to extract error message from status object
          const statusKeys = Object.keys(status);
          console.log('[PlacementManager] Status object keys:', statusKeys);
          if (statusKeys.length > 0) {
            errorMsg = String(status[statusKeys[0]] || errorMsg);
          }
        }
        
        console.error('[PlacementManager] plantSeed failed:', errorMsg, 'Full status:', status);
        
        // Check for any tile type validation errors that should play error_planting sound
        // This includes errors about planting in water, on beach tiles, or other tile restrictions
        const errorMsgLower = errorMsg.toLowerCase();
        const isPlantingLocationError = 
          errorMsgLower.includes('can only be planted') || // All tile type restrictions (water, beach, etc.)
          errorMsgLower.includes('cannot be planted on water') || // Normal plants on water tiles
          errorMsgLower.includes('must be planted'); // Distance/placement requirements (e.g., "must be planted within X meters")
        
        console.log('[PlacementManager] Error check:', {
          errorMsg,
          errorMsgLower,
          isPlantingLocationError,
          matches: {
            canOnlyBePlanted: errorMsgLower.includes('can only be planted'),
            cannotBePlantedOnWater: errorMsgLower.includes('cannot be planted on water'),
            mustBePlanted: errorMsgLower.includes('must be planted')
          }
        });
        
        if (isPlantingLocationError) {
          console.log('[PlacementManager] Playing error_planting sound for tile type error:', errorMsg);
          try {
            playImmediateSound('error_planting', 1.0);
            console.log('[PlacementManager] playImmediateSound called successfully');
          } catch (error) {
            console.error('[PlacementManager] Error calling playImmediateSound:', error);
          }
        } else {
          console.log('[PlacementManager] Not a tile type error, skipping error_planting sound:', errorMsg);
        }
      } else {
        console.log('[PlacementManager] plantSeed succeeded or status not Failed:', status);
      }
    };

    const handlePlaceHomesteadHearthResult = (ctx: any, itemInstanceId: bigint, worldX: number, worldY: number) => {
      console.log('[PlacementManager] placeHomesteadHearth callback triggered:', { 
        itemInstanceId, 
        worldX, 
        worldY,
        eventStatus: ctx.event?.status,
      });
      
      // Check for failed status
      const status = ctx.event?.status;
      const isFailed = status?.tag === 'Failed' || status === 'Failed' || (status && typeof status === 'object' && 'Failed' in status);
      
      if (isFailed) {
        // Try to get error message from different possible structures
        let errorMsg = 'Failed to place Matron\'s Chest';
        if (status?.tag === 'Failed' && status?.value) {
          errorMsg = status.value;
        } else if (status?.Failed) {
          errorMsg = status.Failed;
        } else if (typeof status === 'string' && status !== 'Committed') {
          errorMsg = status;
        } else if (status && typeof status === 'object') {
          const statusKeys = Object.keys(status);
          if (statusKeys.length > 0) {
            errorMsg = String(status[statusKeys[0]] || errorMsg);
          }
        }
        
        console.error('[PlacementManager] placeHomesteadHearth failed:', errorMsg);
        
        // Check if error is related to foundation placement (the main validation error)
        const errorMsgLower = errorMsg.toLowerCase();
        const isFoundationPlacementError = 
          errorMsgLower.includes('must be placed on a foundation') ||
          errorMsgLower.includes('cannot place matron\'s chest on a wall') ||
          errorMsgLower.includes('too far away to place matron\'s chest');
        
        if (isFoundationPlacementError) {
          console.log('[PlacementManager] Playing error_chest_placement sound for foundation placement error:', errorMsg);
          try {
            playImmediateSound('error_chest_placement', 1.0);
            console.log('[PlacementManager] playImmediateSound called successfully');
          } catch (error) {
            console.error('[PlacementManager] Error calling playImmediateSound:', error);
          }
        }
      }
    };

    console.log('[PlacementManager] Registering plantSeed reducer callback');
    connection.reducers.onPlantSeed(handlePlantSeedResult);
    console.log('[PlacementManager] plantSeed reducer callback registered successfully');

    console.log('[PlacementManager] Registering placeHomesteadHearth reducer callback');
    connection.reducers.onPlaceHomesteadHearth(handlePlaceHomesteadHearthResult);
    console.log('[PlacementManager] placeHomesteadHearth reducer callback registered successfully');

    return () => {
      console.log('[PlacementManager] Removing plantSeed reducer callback');
      connection.reducers.removeOnPlantSeed(handlePlantSeedResult);
      console.log('[PlacementManager] Removing placeHomesteadHearth reducer callback');
      connection.reducers.removeOnPlaceHomesteadHearth(handlePlaceHomesteadHearthResult);
    };
  }, [connection]);

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

    // Check for monument zone restriction
    if (isMonumentZonePlacementBlocked(connection, worldX, worldY)) {
      // setPlacementError("Cannot place in monument zones");
      // Play error sound for monument zone placement
      if (isSeedItemValid(placementInfo.itemName)) {
        console.log('[PlacementManager] Client-side validation: Cannot plant in monument zones, playing error sound');
        playImmediateSound('error_planting', 1.0);
      } else {
        console.log('[PlacementManager] Client-side validation: Cannot place in monument zones, playing error sound');
        playImmediateSound('error_chest_placement', 1.0);
      }
      return; // Don't proceed with placement
    }

    // Check for water placement restriction
    if (isWaterPlacementBlocked(connection, placementInfo, worldX, worldY)) {
      // setPlacementError("Cannot place on water");
      // Play error sound for invalid tile type placement
      if (isSeedItemValid(placementInfo.itemName)) {
        console.log('[PlacementManager] Client-side validation: Invalid tile type for planting, playing error sound');
        playImmediateSound('error_planting', 1.0);
      }
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
        case 'Barbecue': // ADDED: Barbecue placement support
          // console.log(`[PlacementManager] Calling placeBarbecue reducer with instance ID: ${placementInfo.instanceId}`);
          connection.reducers.placeBarbecue(placementInfo.instanceId, worldX, worldY);
          // Note: We don't call cancelPlacement here. 
          // App.tsx's handleBarbecueInsert callback will call it upon success.
          break;
        case 'Lantern':
          // console.log(`[PlacementManager] Calling placeLantern reducer with instance ID: ${placementInfo.instanceId}`);
          connection.reducers.placeLantern(placementInfo.instanceId, worldX, worldY);
          // Note: We don't call cancelPlacement here. 
          // App.tsx's handleLanternInsert callback will call it upon success.
          break;
        case 'Wooden Storage Box':
        case 'Large Wooden Storage Box':
        case 'Refrigerator':
        case 'Compost':
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
        case 'Repair Bench':
          connection.reducers.placeRepairBench(placementInfo.instanceId, worldX, worldY);
          // Placement will be cancelled when the WoodenStorageBox (boxType=5) is inserted
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
        case 'Cerametal Field Cauldron Mk. II':
          // Find nearest heat source (campfire or fumarole) to snap to
          let nearestHeatSource: any = null;
          let nearestDistance = Infinity;
          let heatSourceType: 'campfire' | 'fumarole' | null = null;
          const HEAT_SOURCE_SNAP_DISTANCE = 200; // Maximum distance to snap to heat source (increased for easier placement)
          
          // Check campfires
          for (const campfire of connection.db.campfire.iter()) {
            const dx = worldX - campfire.posX;
            const dy = worldY - campfire.posY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < nearestDistance && distance < HEAT_SOURCE_SNAP_DISTANCE) {
              nearestDistance = distance;
              nearestHeatSource = campfire;
              heatSourceType = 'campfire';
            }
          }
          
          // Check fumaroles (always-on heat sources)
          for (const fumarole of connection.db.fumarole.iter()) {
            const dx = worldX - fumarole.posX;
            const dy = worldY - fumarole.posY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < nearestDistance && distance < HEAT_SOURCE_SNAP_DISTANCE) {
              nearestDistance = distance;
              nearestHeatSource = fumarole;
              heatSourceType = 'fumarole';
            }
          }
          
          if (nearestHeatSource && heatSourceType) {
            if (heatSourceType === 'campfire') {
              // Check if campfire already has a broth pot
              if (nearestHeatSource.attachedBrothPotId !== null && nearestHeatSource.attachedBrothPotId !== undefined) {
                console.log('[PlacementManager] Campfire already has a broth pot attached');
                playImmediateSound('error_field_cauldron_placement', 1.0);
                return;
              }
              
              console.log(`[PlacementManager] Placing broth pot on campfire ${nearestHeatSource.id}`);
              connection.reducers.placeBrothPotOnCampfire(placementInfo.instanceId, nearestHeatSource.id);
            } else if (heatSourceType === 'fumarole') {
              // Check if fumarole already has a broth pot
              const existingPotOnFumarole = Array.from(connection.db.brothPot.iter()).find(
                pot => pot.attachedToFumaroleId === nearestHeatSource.id && !pot.isDestroyed
              );
              
              if (existingPotOnFumarole) {
                console.log('[PlacementManager] Fumarole already has a broth pot attached');
                playImmediateSound('error_field_cauldron_placement', 1.0);
                return;
              }
              
              console.log(`[PlacementManager] Placing broth pot on fumarole ${nearestHeatSource.id} [ALWAYS-ON HEAT]`);
              connection.reducers.placeBrothPotOnFumarole(placementInfo.instanceId, nearestHeatSource.id);
            }
          } else {
            console.log('[PlacementManager] No heat source (campfire or fumarole) nearby to place broth pot');
            playImmediateSound('error_field_cauldron_placement', 1.0);
          }
          break;
        case 'Wood Door':
        case 'Metal Door': {
          // Door placement requires finding the nearest foundation edge (N/S only)
          const FOUNDATION_TILE_SIZE = 96;
          let nearestFoundation: any = null;
          let nearestDistance = Infinity;
          
          // Find closest foundation cell
          for (const foundation of connection.db.foundationCell.iter()) {
            if (foundation.isDestroyed) continue;
            
            // Calculate foundation center position
            const foundationCenterX = foundation.cellX * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
            const foundationCenterY = foundation.cellY * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
            
            const dx = worldX - foundationCenterX;
            const dy = worldY - foundationCenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Only consider foundations within interaction range
            if (distance < nearestDistance && distance < FOUNDATION_TILE_SIZE * 1.5) {
              nearestDistance = distance;
              nearestFoundation = foundation;
            }
          }
          
          if (!nearestFoundation) {
            console.log('[PlacementManager] No foundation nearby for door placement');
            playImmediateSound('error_chest_placement', 1.0);
            return;
          }
          
          // Determine which edge (North=0, South=2) based on cursor Y position relative to foundation
          const foundationCenterY = nearestFoundation.cellY * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
          const edge = worldY < foundationCenterY ? 0 : 2; // 0 = North, 2 = South
          
          // Check for existing wall or door on this edge
          let hasWallOnEdge = false;
          let hasDoorOnEdge = false;
          
          for (const wall of connection.db.wallCell.iter()) {
            if (wall.cellX === nearestFoundation.cellX && 
                wall.cellY === nearestFoundation.cellY && 
                wall.edge === edge && 
                !wall.isDestroyed) {
              hasWallOnEdge = true;
              break;
            }
          }
          
          for (const door of connection.db.door.iter()) {
            if (door.cellX === nearestFoundation.cellX && 
                door.cellY === nearestFoundation.cellY && 
                door.edge === edge) {
              hasDoorOnEdge = true;
              break;
            }
          }
          
          if (hasWallOnEdge || hasDoorOnEdge) {
            console.log(`[PlacementManager] Edge ${edge === 0 ? 'North' : 'South'} already has wall or door`);
            playImmediateSound('error_chest_placement', 1.0);
            return;
          }
          
          // Determine door type (0 = Wood, 1 = Metal)
          const doorType = placementInfo.itemName === 'Wood Door' ? 0 : 1;
          
          console.log(`[PlacementManager] Placing ${placementInfo.itemName} on foundation (${nearestFoundation.cellX}, ${nearestFoundation.cellY}) edge ${edge === 0 ? 'North' : 'South'}`);
          connection.reducers.placeDoor(
            BigInt(nearestFoundation.cellX),
            BigInt(nearestFoundation.cellY),
            worldX,
            worldY,
            doorType
          );
          break;
        }
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