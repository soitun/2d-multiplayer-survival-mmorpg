import { useState, useCallback, useRef, useEffect } from 'react';
import { DbConnection, ItemDefinition } from '../generated'; // Import connection type and ItemDefinition
import { TILE_SIZE } from '../config/gameConfig';
import { isSeedItemValid, requiresWaterPlacement, requiresBeachPlacement, requiresAlpinePlacement, requiresTundraPlacement, isPineconeBlockedOnBeach, isBirchCatkinBlockedOnAlpine, requiresTemperateOnlyPlacement } from '../utils/plantsUtils';
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
          case 12: return 'TundraGrass'; // Grassy patches in tundra biome
          case 13: return 'Tilled'; // Tilled soil for farming (uses Dirt graphics)
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
 * Checks if a world position is on a water tile (Sea or HotSpringWater type).
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
  // Match both regular water (Sea) and hot spring water - consistent with placementRenderingUtils
  const isWater = tileType === 'Sea' || tileType === 'HotSpringWater';
  
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
 * Check if a position is on alpine tiles (for alpine-restricted plants)
 */
function isPositionOnAlpine(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) {
    return false;
  }

  const { tileX, tileY } = worldPosToTileCoords(worldX, worldY);
  const tileType = getTileTypeFromChunkData(connection, tileX, tileY);
  return tileType === 'Alpine';
}

/**
 * Check if a position is on tundra tiles (for tundra-restricted plants)
 * Includes both Tundra and TundraGrass tile types
 */
function isPositionOnTundra(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) {
    return false;
  }

  const { tileX, tileY } = worldPosToTileCoords(worldX, worldY);
  const tileType = getTileTypeFromChunkData(connection, tileX, tileY);
  return tileType === 'Tundra' || tileType === 'TundraGrass';
}

/**
 * Check if a position is on shore (land tile adjacent to water)
 * Returns true if the position is NOT on water AND has at least one adjacent water tile.
 * Used for fish trap placement validation.
 */
function isPositionOnShore(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) {
    return false;
  }

  // Must NOT be on water itself
  if (isPositionOnWater(connection, worldX, worldY)) {
    return false;
  }
  
  const { tileX, tileY } = worldPosToTileCoords(worldX, worldY);
  
  // Check 8 adjacent tiles for water
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      
      const checkTileX = tileX + dx;
      const checkTileY = tileY + dy;
      
      // Get tile type from chunk data
      const tileType = getTileTypeFromChunkData(connection, checkTileX, checkTileY);
      if (tileType === 'Sea' || tileType === 'HotSpringWater') {
        return true; // Found adjacent water - this is a shore position
      }
    }
  }
  
  return false; // No adjacent water tiles found
}

/**
 * Check if fish trap placement is blocked (not on shore)
 * Fish traps must be placed on land adjacent to water.
 */
function isFishTrapPlacementBlocked(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) return false;
  
  // Fish traps must be on shore (land adjacent to water)
  if (!isPositionOnShore(connection, worldX, worldY)) {
    return true; // Block if not on shore
  }
  
  return false; // Valid placement
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
 * Checks if Seaweed Frond placement is valid (any water tile, no shore restriction).
 * Returns true if placement should be blocked.
 * No snorkeling required - just needs to be on water.
 */
function isSeaweedFrondPlacementBlocked(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) {
    console.log('[SeaweedFrond] No connection, allowing placement');
    return false;
  }
  
  // Seaweed Fronds can be planted on any water tile (no shore restriction)
  const isOnWater = isPositionOnWater(connection, worldX, worldY);
  console.log(`[SeaweedFrond] Position (${worldX.toFixed(1)}, ${worldY.toFixed(1)}) - isOnWater: ${isOnWater}`);
  
  if (!isOnWater) {
    console.log('[SeaweedFrond] BLOCKED: Not on water');
    return true; // Block if not on water
  }
  
  // No snorkeling required - just need to be on water
  console.log('[SeaweedFrond] VALID: Placement allowed on water tile');
  return false; // Valid placement on client side
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
 * Checks if alpine plant placement is valid (alpine tiles only).
 * Used for: Lichen Spores, Moss Spores, Arctic Poppy Seeds, Arctic Hairgrass Seeds
 * Returns true if placement should be blocked.
 */
function isAlpinePlacementBlocked(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) return false;
  
  // Alpine plants must be on alpine tiles
  if (!isPositionOnAlpine(connection, worldX, worldY)) {
    return true; // Block if not on alpine
  }
  
  return false; // Valid placement
}

/**
 * Checks if tundra plant placement is valid (tundra tiles only).
 * Used for: Crowberry Seeds, Fireweed Seeds
 * Returns true if placement should be blocked.
 */
function isTundraPlacementBlocked(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) return false;
  
  // Tundra plants must be on tundra or tundra grass tiles
  if (!isPositionOnTundra(connection, worldX, worldY)) {
    return true; // Block if not on tundra
  }
  
  return false; // Valid placement
}

/**
 * Checks if Pinecone (conifer tree seed) placement is blocked.
 * Pinecones cannot be planted on beach tiles - conifers don't grow in sandy, salt-spray environments.
 * Returns true if placement should be blocked.
 */
function isPineconePlacementBlocked(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) return false;
  
  // Pinecones cannot be planted on beach tiles
  if (isPositionOnBeach(connection, worldX, worldY)) {
    return true; // Block if on beach
  }
  
  return false; // Valid placement
}

/**
 * Checks if Birch Catkin (deciduous tree seed) placement is blocked.
 * Birch Catkins cannot be planted on alpine tiles - deciduous trees can't grow on rocky alpine terrain.
 * Returns true if placement should be blocked.
 */
function isBirchCatkinPlacementBlocked(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) return false;
  
  // Birch Catkins cannot be planted on alpine tiles
  if (isPositionOnAlpine(connection, worldX, worldY)) {
    return true; // Block if on alpine
  }
  
  return false; // Valid placement
}

/**
 * Checks if temperate-only tree seed placement is blocked.
 * Crab Apple Seeds and Hazelnuts can only be planted on temperate tiles (grass/forest).
 * Returns true if placement should be blocked (on beach, alpine, or tundra).
 */
function isTemperatePlacementBlocked(connection: DbConnection | null, worldX: number, worldY: number): boolean {
  if (!connection) return false;
  
  // Temperate-only plants cannot be on beach, alpine, or tundra tiles
  const isBeach = isPositionOnBeach(connection, worldX, worldY);
  const isAlpine = isPositionOnAlpine(connection, worldX, worldY);
  const isTundra = isPositionOnTundra(connection, worldX, worldY);
  
  if (isBeach || isAlpine || isTundra) {
    return true; // Block if on non-temperate tiles
  }
  
  return false; // Valid placement on temperate tiles (grass/forest)
}

/**
 * Checks if placement should be blocked due to water tiles or terrain restrictions.
 * This applies to shelters, camp fires, lanterns, stashes, wooden storage boxes, sleeping bags, and most seeds.
 * Reed Rhizomes have special handling and require water near shore.
 * Seaweed Fronds have special handling and require water (no shore restriction).
 * Beach Lyme Grass Seeds and Scurvy Grass Seeds have special handling and require beach tiles.
 * Pinecone (conifer) cannot be planted on beach tiles.
 * Birch Catkin (deciduous) cannot be planted on alpine tiles.
 */
function isWaterPlacementBlocked(connection: DbConnection | null, placementInfo: PlacementItemInfo | null, worldX: number, worldY: number): boolean {
  if (!connection || !placementInfo) {
    return false;
  }

  const itemNameLower = placementInfo.itemName.toLowerCase().trim();
  
  console.log(`[WaterPlacement] Checking item: "${placementInfo.itemName}" (lower: "${itemNameLower}")`);

  // Special case: Seaweed Frond - must be on water (no shore restriction, no snorkeling required)
  const isSeaweedItem = itemNameLower.includes('seaweed') || itemNameLower.includes('frond');
  console.log(`[WaterPlacement] isSeaweedItem: ${isSeaweedItem}`);
  
  if (isSeaweedItem) {
    const result = isSeaweedFrondPlacementBlocked(connection, worldX, worldY);
    console.log(`[WaterPlacement] Seaweed placement blocked: ${result}`);
    return result;
  }

  // Special case: Reed Rhizome - must be on water NEAR shore
  if (requiresWaterPlacement(placementInfo.itemName)) {
    return isReedRhizomePlacementBlocked(connection, worldX, worldY);
  }

  // Special case: Seeds that require beach placement (like Beach Lyme Grass Seeds)
  if (requiresBeachPlacement(placementInfo.itemName)) {
    return isBeachLymeGrassPlacementBlocked(connection, worldX, worldY);
  }

  // Special case: Seeds that require alpine placement (Lichen Spores, Moss Spores, Arctic Poppy Seeds, Arctic Hairgrass Seeds)
  if (requiresAlpinePlacement(placementInfo.itemName)) {
    return isAlpinePlacementBlocked(connection, worldX, worldY);
  }

  // Special case: Seeds that require tundra placement (Crowberry Seeds, Fireweed Seeds)
  if (requiresTundraPlacement(placementInfo.itemName)) {
    return isTundraPlacementBlocked(connection, worldX, worldY);
  }

  // Special case: Pinecone (conifer tree seed) - cannot be planted on beach tiles
  if (isPineconeBlockedOnBeach(placementInfo.itemName)) {
    if (isPineconePlacementBlocked(connection, worldX, worldY)) {
      console.log('[WaterPlacement] Pinecone blocked: Cannot plant on beach tiles');
      return true;
    }
  }

  // Special case: Birch Catkin (deciduous tree seed) - cannot be planted on alpine tiles
  if (isBirchCatkinBlockedOnAlpine(placementInfo.itemName)) {
    if (isBirchCatkinPlacementBlocked(connection, worldX, worldY)) {
      console.log('[WaterPlacement] Birch Catkin blocked: Cannot plant on alpine tiles');
      return true;
    }
  }

  // Special case: Crab Apple Seeds and Hazelnuts - temperate only (grass/forest)
  if (requiresTemperateOnlyPlacement(placementInfo.itemName)) {
    if (isTemperatePlacementBlocked(connection, worldX, worldY)) {
      console.log('[WaterPlacement] Temperate seed blocked: Cannot plant on beach, alpine, or tundra tiles');
      return true;
    }
  }

  // Special case: Fish Trap - must be placed on shore (land adjacent to water)
  if (placementInfo.itemName === 'Fish Trap') {
    const blocked = isFishTrapPlacementBlocked(connection, worldX, worldY);
    if (blocked) {
      console.log('[WaterPlacement] Fish Trap blocked: Must be placed on shore (land adjacent to water)');
    }
    return blocked;
  }

  // List of items that cannot be placed on water
  const waterBlockedItems = ['Camp Fire', 'Furnace', 'Barbecue', 'Lantern', 'Ancestral Ward', 'Signal Disruptor', 'Memory Resonance Beacon', 'Wooden Storage Box', 'Large Wooden Storage Box', 'Pantry', 'Sleeping Bag', 'Stash', 'Shelter', 'Reed Rain Collector', "Matron's Chest", 'Repair Bench', 'Cooking Station', "Babushka's Surprise", "Matriarch's Wrath"];
  
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
 * Checks if a seed placement is blocked because there's already a seed on this tile.
 * Returns true if the placement should be blocked (one seed per tile rule).
 */
function isSeedPlacementOnOccupiedTile(connection: DbConnection | null, placementInfo: PlacementItemInfo | null, worldX: number, worldY: number): boolean {
  if (!connection || !placementInfo) return false;
  
  // Only check for seed items
  if (!isSeedItemValid(placementInfo.itemName)) return false;
  
  const TILE_SIZE_LOCAL = 48; // pixels per tile
  const targetTileX = Math.floor(worldX / TILE_SIZE_LOCAL);
  const targetTileY = Math.floor(worldY / TILE_SIZE_LOCAL);
  
  // Check if any planted seed exists on this tile
  for (const seed of connection.db.plantedSeed.iter()) {
    const seedTileX = Math.floor(seed.posX / TILE_SIZE_LOCAL);
    const seedTileY = Math.floor(seed.posY / TILE_SIZE_LOCAL);
    
    if (seedTileX === targetTileX && seedTileY === targetTileY) {
      return true; // Tile is occupied
    }
  }
  
  return false; // Tile is free
}

// Collision radii for different storage box types (must match server wooden_storage_box.rs)
const STORAGE_BOX_COLLISION_RADII: { [key: number]: number } = {
  0: 18,   // BOX_TYPE_NORMAL
  1: 48,   // BOX_TYPE_LARGE
  2: 48,   // BOX_TYPE_REFRIGERATOR
  3: 64,   // BOX_TYPE_COMPOST
  4: 18,   // BOX_TYPE_BACKPACK
  5: 96,   // BOX_TYPE_REPAIR_BENCH
  6: 48,   // BOX_TYPE_COOKING_STATION
  7: 64,   // BOX_TYPE_SCARECROW
  8: 18,   // BOX_TYPE_MILITARY_RATION
  9: 72,   // BOX_TYPE_MINE_CART
  10: 48,  // BOX_TYPE_FISH_TRAP
  11: 60,  // BOX_TYPE_WILD_BEEHIVE
  12: 100, // BOX_TYPE_PLAYER_BEEHIVE
};

// Map item names to box types for collision radius lookup
const ITEM_NAME_TO_BOX_TYPE: { [key: string]: number } = {
  'Wooden Storage Box': 0,
  'Large Wooden Storage Box': 1,
  'Pantry': 2,
  'Compost': 3,
  'Repair Bench': 5,
  'Cooking Station': 6,
  'Scarecrow': 7,
  'Fish Trap': 10,
  'Wooden Beehive': 12,
};

// Storage box Y offset for visual center calculation (must match server)
const BOX_COLLISION_Y_OFFSET = 52.0;
const BEEHIVE_EXTRA_Y_OFFSET = 100.0; // Additional offset for beehives

/**
 * Checks if a storage box placement would collide with existing storage boxes.
 * Returns true if placement should be blocked due to collision.
 */
function isStorageBoxCollision(
  connection: DbConnection | null,
  placementInfo: PlacementItemInfo | null,
  worldX: number,
  worldY: number
): boolean {
  if (!connection || !placementInfo) return false;
  
  // Check if this item is a storage box type
  const boxType = ITEM_NAME_TO_BOX_TYPE[placementInfo.itemName];
  if (boxType === undefined) return false; // Not a storage box
  
  // Get collision radius for the new box
  const newBoxRadius = STORAGE_BOX_COLLISION_RADII[boxType] || 18;
  
  // Check against all existing storage boxes
  for (const box of connection.db.woodenStorageBox.iter()) {
    if (box.isDestroyed) continue;
    
    // Get collision radius for the existing box
    const existingRadius = STORAGE_BOX_COLLISION_RADII[box.boxType] || 18;
    
    // Account for visual center offset
    const existingYOffset = box.boxType === 12 // BOX_TYPE_PLAYER_BEEHIVE
      ? BOX_COLLISION_Y_OFFSET + BEEHIVE_EXTRA_Y_OFFSET
      : BOX_COLLISION_Y_OFFSET;
    const existingVisualY = box.posY - existingYOffset;
    
    // Calculate distance between centers
    const dx = box.posX - worldX;
    const dy = existingVisualY - worldY;
    const distSq = dx * dx + dy * dy;
    
    // Minimum distance = sum of both radii
    const minDistance = newBoxRadius + existingRadius;
    const minDistanceSq = minDistance * minDistance;
    
    if (distSq < minDistanceSq) {
      return true; // Collision detected
    }
  }
  
  return false; // No collision
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
  
  // Check monument parts (unified table for fishing village, shipwreck, whale bone graveyard)
  // NOTE: MonumentType is a tagged union with a `tag` property (e.g., { tag: 'FishingVillage' })
  const FISHING_VILLAGE_RESTRICTION_RADIUS = 800.0;
  const FISHING_VILLAGE_RESTRICTION_RADIUS_SQ = FISHING_VILLAGE_RESTRICTION_RADIUS * FISHING_VILLAGE_RESTRICTION_RADIUS;
  const SHIPWRECK_RESTRICTION_RADIUS = 1500.0; // 2.5x monument::clearance::SHIPWRECK (600 * 2.5)
  const SHIPWRECK_RESTRICTION_RADIUS_SQ = SHIPWRECK_RESTRICTION_RADIUS * SHIPWRECK_RESTRICTION_RADIUS;
  const WHALE_BONE_GRAVEYARD_RESTRICTION_RADIUS = 800.0;
  const WHALE_BONE_GRAVEYARD_RESTRICTION_RADIUS_SQ = WHALE_BONE_GRAVEYARD_RESTRICTION_RADIUS * WHALE_BONE_GRAVEYARD_RESTRICTION_RADIUS;
  
  for (const part of connection.db.monumentPart.iter()) {
    // Only check against the center piece for the exclusion zone
    if (part.isCenter) {
      const dx = worldX - part.worldX;
      const dy = worldY - part.worldY;
      const distanceSq = dx * dx + dy * dy;
      
      // Use different restriction radius based on monument type
      let restrictionRadiusSq: number;
      switch (part.monumentType?.tag) {
        case 'Shipwreck':
          restrictionRadiusSq = SHIPWRECK_RESTRICTION_RADIUS_SQ;
          break;
        case 'FishingVillage':
          restrictionRadiusSq = FISHING_VILLAGE_RESTRICTION_RADIUS_SQ;
          break;
        case 'WhaleBoneGraveyard':
          restrictionRadiusSq = WHALE_BONE_GRAVEYARD_RESTRICTION_RADIUS_SQ;
          break;
        default:
          restrictionRadiusSq = FISHING_VILLAGE_RESTRICTION_RADIUS_SQ; // Default fallback
      }
      
      if (distanceSq <= restrictionRadiusSq) {
        return true; // Blocked by monument
      }
    }
  }
  
  // Check asphalt tiles (compound areas - cannot place anything)
  const tileAtX = Math.floor(worldX / TILE_SIZE);
  const tileAtY = Math.floor(worldY / TILE_SIZE);
  const tileTypeAtPosition = getTileTypeFromChunkData(connection, tileAtX, tileAtY);
  if (tileTypeAtPosition === 'Asphalt') {
    return true; // Cannot place on asphalt/compound areas
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
      // Play monument-specific error sound based on item type
      if (isSeedItemValid(placementInfo.itemName)) {
        console.log('[PlacementManager] Client-side validation: Cannot plant in protected monument zone, playing planting monument error sound');
        playImmediateSound('error_planting_monument', 1.0);
      } else {
        console.log('[PlacementManager] Client-side validation: Cannot place in protected monument zone, playing monument error sound');
        playImmediateSound('error_foundation_monument', 1.0);
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

    // Check for one-seed-per-tile restriction
    if (isSeedPlacementOnOccupiedTile(connection, placementInfo, worldX, worldY)) {
      console.log('[PlacementManager] Client-side validation: Tile already has a seed, playing error sound');
      playImmediateSound('error_seed_occupied', 1.0);
      return; // Don't proceed with placement
    }

    // Check for storage box collision (prevents placing boxes on top of each other)
    if (isStorageBoxCollision(connection, placementInfo, worldX, worldY)) {
      console.log('[PlacementManager] Client-side validation: Storage box collision detected, playing error sound');
      playImmediateSound('construction_placement_error', 1.0);
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
          // Regular lanterns: 56px tall sprite, rendered at posY - 56 - 6
          // For cursor at center: server needs posY = cursorY + 34 (56/2 + 6)
          connection.reducers.placeLantern(placementInfo.instanceId, worldX, worldY + 34, 0);
          break;
        case 'Ancestral Ward':
          // Wards: 256px tall sprites, rendered at posY - 256 - 6
          // For cursor at center: server needs posY = cursorY + 134 (256/2 + 6)
          connection.reducers.placeLantern(placementInfo.instanceId, worldX, worldY + 134, 1);
          break;
        case 'Signal Disruptor':
          // Same offset as Ancestral Ward
          connection.reducers.placeLantern(placementInfo.instanceId, worldX, worldY + 134, 2);
          break;
        case 'Memory Resonance Beacon':
          // Same offset as Ancestral Ward
          connection.reducers.placeLantern(placementInfo.instanceId, worldX, worldY + 134, 3);
          break;
        case 'Tallow Steam Turret':
          // Turrets: 256px tall sprites, rendered at posY - 256 - 6
          // For cursor at center: server needs posY = cursorY + 134 (256/2 + 6)
          connection.reducers.placeTurret(placementInfo.instanceId, worldX, worldY + 134);
          break;
        case 'Wooden Storage Box':
        case 'Large Wooden Storage Box':
        case 'Pantry':
        case 'Compost':
        case 'Fish Trap':
        case 'Wooden Beehive':
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
        case "Babushka's Surprise":
        case "Matriarch's Wrath": {
          // Explosive placement - player places explosive which starts fuse countdown
          // DEBUG: Calculate expected chunk index for the placement position
          const CHUNK_SIZE_TILES = 16;
          const TILE_SIZE_PX = 48;
          const WORLD_WIDTH_CHUNKS = 38;
          const placementTileX = Math.floor(worldX / TILE_SIZE_PX);
          const placementTileY = Math.floor(worldY / TILE_SIZE_PX);
          const placementChunkX = Math.floor(placementTileX / CHUNK_SIZE_TILES);
          const placementChunkY = Math.floor(placementTileY / CHUNK_SIZE_TILES);
          const expectedChunkIndex = placementChunkY * WORLD_WIDTH_CHUNKS + placementChunkX;
          console.log(`[PlacementManager] Calling placeExplosive at PIXEL (${worldX.toFixed(1)}, ${worldY.toFixed(1)})`);
          console.log(`[PlacementManager] → Tile: (${placementTileX}, ${placementTileY}), Chunk: (${placementChunkX}, ${placementChunkY}), Expected chunk_index: ${expectedChunkIndex}`);
          connection.reducers.placeExplosive(placementInfo.instanceId, worldX, worldY);
          // Placement cancelled when PlacedExplosive entity is inserted
          break;
        }
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
        case 'Cooking Station':
          connection.reducers.placeCookingStation(placementInfo.instanceId, worldX, worldY);
          // Placement will be cancelled when the WoodenStorageBox (boxType=6) is inserted
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