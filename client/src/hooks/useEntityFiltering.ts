import { useMemo, useCallback } from 'react';
import { gameConfig, FOUNDATION_TILE_SIZE } from '../config/gameConfig';
import {
  Player as SpacetimeDBPlayer,
  Tree as SpacetimeDBTree,
  Stone as SpacetimeDBStone,
  Campfire as SpacetimeDBCampfire,
  Furnace as SpacetimeDBFurnace, // ADDED: Furnace import
  Lantern as SpacetimeDBLantern,
  HomesteadHearth as SpacetimeDBHomesteadHearth, // ADDED: Homestead Hearth import
  HarvestableResource as SpacetimeDBHarvestableResource,
  DroppedItem as SpacetimeDBDroppedItem,
  WoodenStorageBox as SpacetimeDBWoodenStorageBox,
  SleepingBag as SpacetimeDBSleepingBag,
  PlayerCorpse as SpacetimeDBPlayerCorpse,
  Stash as SpacetimeDBStash,
  Projectile as SpacetimeDBProjectile,
  Shelter as SpacetimeDBShelter,
  Cloud as SpacetimeDBCloud,
  PlantedSeed as SpacetimeDBPlantedSeed,
  RainCollector as SpacetimeDBRainCollector,
  WildAnimal as SpacetimeDBWildAnimal,
  ViperSpittle as SpacetimeDBViperSpittle,
  AnimalCorpse as SpacetimeDBAnimalCorpse,
  Barrel as SpacetimeDBBarrel, // ADDED Barrel type
  FoundationCell as SpacetimeDBFoundationCell, // ADDED: Building foundations
  WallCell as SpacetimeDBWallCell, // ADDED: Building walls
  // Grass as SpacetimeDBGrass // Will use InterpolatedGrassData instead
} from '../generated';
import {
  isPlayer, isTree, isStone, isCampfire, isHarvestableResource, isDroppedItem, isWoodenStorageBox,
  isSleepingBag,
  isStash,
  isPlayerCorpse,
  isGrass, // Type guard might need adjustment or can work if structure is similar enough
  isShelter, // ADDED Shelter type guard import (will be created in typeGuards.ts)
  isRainCollector, // ADDED RainCollector type guard import
  isWildAnimal, // ADDED WildAnimal type guard import
  isAnimalCorpse, // ADDED AnimalCorpse type guard import
  isBarrel, // ADDED Barrel type guard import
  isLantern, // ADDED Lantern type guard import
  isSeaStack // ADDED SeaStack type guard import
} from '../utils/typeGuards';
import { InterpolatedGrassData } from './useGrassInterpolation'; // Import InterpolatedGrassData

export interface ViewportBounds {
  viewMinX: number;
  viewMaxX: number;
  viewMinY: number;
  viewMaxY: number;
}

interface EntityFilteringResult {
  visibleHarvestableResources: SpacetimeDBHarvestableResource[];
  visibleDroppedItems: SpacetimeDBDroppedItem[];
  visibleCampfires: SpacetimeDBCampfire[];
  visibleFurnaces: SpacetimeDBFurnace[]; // ADDED: Furnaces
  visibleHomesteadHearths: SpacetimeDBHomesteadHearth[]; // ADDED: Homestead Hearths
  visiblePlayers: SpacetimeDBPlayer[];
  visibleTrees: SpacetimeDBTree[];
  visibleStones: SpacetimeDBStone[];
  visibleWoodenStorageBoxes: SpacetimeDBWoodenStorageBox[];
  visibleSleepingBags: SpacetimeDBSleepingBag[];
  visibleProjectiles: SpacetimeDBProjectile[];
  visibleHarvestableResourcesMap: Map<string, SpacetimeDBHarvestableResource>;
  visibleCampfiresMap: Map<string, SpacetimeDBCampfire>;
  visibleFurnacesMap: Map<string, SpacetimeDBFurnace>; // ADDED: Furnaces map
  visibleLanternsMap: Map<string, SpacetimeDBLantern>;
  visibleHomesteadHearthsMap: Map<string, SpacetimeDBHomesteadHearth>; // ADDED: Homestead Hearths map
  visibleDroppedItemsMap: Map<string, SpacetimeDBDroppedItem>;
  visibleBoxesMap: Map<string, SpacetimeDBWoodenStorageBox>;
  visibleProjectilesMap: Map<string, SpacetimeDBProjectile>;
  visiblePlayerCorpses: SpacetimeDBPlayerCorpse[];
  visiblePlayerCorpsesMap: Map<string, SpacetimeDBPlayerCorpse>;
  visibleStashes: SpacetimeDBStash[];
  visibleStashesMap: Map<string, SpacetimeDBStash>;
  visibleSleepingBagsMap: Map<string, SpacetimeDBSleepingBag>;
  visibleTreesMap: Map<string, SpacetimeDBTree>;
  groundItems: (SpacetimeDBSleepingBag)[];
  ySortedEntities: YSortedEntityType[];
  visibleGrass: InterpolatedGrassData[]; // Use InterpolatedGrassData
  visibleGrassMap: Map<string, InterpolatedGrassData>; // Use InterpolatedGrassData
  visibleShelters: SpacetimeDBShelter[]; // ADDED
  visibleSheltersMap: Map<string, SpacetimeDBShelter>; // ADDED
  visibleLanterns: SpacetimeDBLantern[];
  visiblePlantedSeeds: SpacetimeDBPlantedSeed[];
  visiblePlantedSeedsMap: Map<string, SpacetimeDBPlantedSeed>; // ADDED
  visibleClouds: SpacetimeDBCloud[]; // ADDED
  visibleRainCollectors: SpacetimeDBRainCollector[];
  visibleRainCollectorsMap: Map<string, SpacetimeDBRainCollector>;
  visibleWildAnimals: SpacetimeDBWildAnimal[]; // ADDED
  visibleWildAnimalsMap: Map<string, SpacetimeDBWildAnimal>; // ADDED
  visibleViperSpittles: SpacetimeDBViperSpittle[]; // ADDED
  visibleViperSpittlesMap: Map<string, SpacetimeDBViperSpittle>; // ADDED
  visibleAnimalCorpses: SpacetimeDBAnimalCorpse[]; // ADDED
  visibleAnimalCorpsesMap: Map<string, SpacetimeDBAnimalCorpse>; // ADDED
  visibleBarrels: SpacetimeDBBarrel[]; // ADDED
  visibleBarrelsMap: Map<string, SpacetimeDBBarrel>; // ADDED
  visibleSeaStacks: any[]; // ADDED
  visibleSeaStacksMap: Map<string, any>; // ADDED
  visibleFoundationCells: SpacetimeDBFoundationCell[]; // ADDED: Building foundations
  visibleFoundationCellsMap: Map<string, SpacetimeDBFoundationCell>; // ADDED: Building foundations map
  visibleWallCells: SpacetimeDBWallCell[]; // ADDED: Building walls
  visibleWallCellsMap: Map<string, SpacetimeDBWallCell>; // ADDED: Building walls map
}

// Define a unified entity type for sorting
export type YSortedEntityType =
  | { type: 'player'; entity: SpacetimeDBPlayer }
  | { type: 'tree'; entity: SpacetimeDBTree }
  | { type: 'stone'; entity: SpacetimeDBStone }
  | { type: 'wooden_storage_box'; entity: SpacetimeDBWoodenStorageBox }
  | { type: 'player_corpse'; entity: SpacetimeDBPlayerCorpse }
  | { type: 'stash'; entity: SpacetimeDBStash }
  | { type: 'harvestable_resource'; entity: SpacetimeDBHarvestableResource }
  | { type: 'campfire'; entity: SpacetimeDBCampfire }
  | { type: 'furnace'; entity: SpacetimeDBFurnace } // ADDED: Furnace type
  | { type: 'lantern'; entity: SpacetimeDBLantern }
  | { type: 'homestead_hearth'; entity: SpacetimeDBHomesteadHearth } // ADDED: Homestead Hearth type
  | { type: 'dropped_item'; entity: SpacetimeDBDroppedItem }
  | { type: 'projectile'; entity: SpacetimeDBProjectile }
  | { type: 'shelter'; entity: SpacetimeDBShelter }
  | { type: 'grass'; entity: InterpolatedGrassData }
  | { type: 'planted_seed'; entity: SpacetimeDBPlantedSeed }
  | { type: 'rain_collector'; entity: SpacetimeDBRainCollector }
  | { type: 'wild_animal'; entity: SpacetimeDBWildAnimal }
  | { type: 'viper_spittle'; entity: SpacetimeDBViperSpittle }
  | { type: 'animal_corpse'; entity: SpacetimeDBAnimalCorpse }
  | { type: 'barrel'; entity: SpacetimeDBBarrel }
  | { type: 'sea_stack'; entity: any } // Server-provided sea stack entities
  | { type: 'sleeping_bag'; entity: SpacetimeDBSleepingBag } // ADDED: Sleeping bags
  | { type: 'foundation_cell'; entity: SpacetimeDBFoundationCell } // ADDED: Building foundations
  | { type: 'wall_cell'; entity: SpacetimeDBWallCell }; // ADDED: Building walls

// ===== HELPER FUNCTIONS FOR Y-SORTING =====
const getEntityY = (item: YSortedEntityType, timestamp: number): number => {
  const { entity, type } = item;
  switch (type) {
    case 'player':
      // Player Y position: use positionY (foot position) + 48 to get head/center
      // This ensures players always render above foundations and walls on the same tile
      // Add a larger offset to ensure players on foundations render above them, even with rounding issues
      // Increased from 0.5 to 2.0 to handle edge cases where player positionY might be slightly below tile edge
      const player = entity as SpacetimeDBPlayer;
      // CRITICAL: Players use positionY, not posY. This must match their actual world Y coordinate.
      const playerY = player.positionY;
      // Only check for truly invalid values - 0 is a valid Y coordinate
      if (playerY === undefined || playerY === null || (typeof playerY === 'number' && isNaN(playerY))) {
        console.error('[getEntityY] Player has invalid positionY:', {
          identity: player.identity?.toHexString(),
          positionX: player.positionX,
          positionY: player.positionY,
          hasPosY: 'posY' in player,
          posY: (player as any).posY,
          playerKeys: Object.keys(player)
        });
        // Use a reasonable fallback based on positionX if available, otherwise use 0
        // This ensures players still sort correctly relative to each other
        return (player.positionX !== undefined ? player.positionX : 0) + 1000000; // Large offset to put invalid players at bottom
      }
      // Return the actual Y position - this should be the world Y coordinate
      return playerY + 48 + 2.0;
    case 'tree':
    case 'stone':
    case 'wooden_storage_box':
    case 'stash':
    case 'campfire':
    case 'furnace':
    case 'lantern':
    case 'homestead_hearth': // ADDED: Homestead Hearth (same as campfire)
    case 'planted_seed':
    case 'dropped_item':
    case 'harvestable_resource':
    case 'rain_collector':
    case 'animal_corpse':
    case 'player_corpse':
    case 'wild_animal':
    case 'barrel':
    case 'sleeping_bag':
      // CRITICAL FIX: Use actual Y position for proper depth sorting relative to players
      // The +10000 offset was causing everything to always render above players
      // Now placeables sort correctly based on their actual world Y position
      return entity.posY;
    case 'foundation_cell': {
      // Foundation cells use cell coordinates - convert to world pixel Y
      // Use top edge of tile (cellY * 48) to ensure foundations render below players
      // Players standing on foundations will have positionY at or near the top edge
      const foundation = entity as SpacetimeDBFoundationCell;
      return foundation.cellY * 48; // TILE_SIZE = 48, use top edge for Y-sorting
    }
    case 'wall_cell': {
      const wall = entity as SpacetimeDBWallCell;
      const FOUNDATION_TILE_SIZE = 96;
      const baseY = wall.cellY * FOUNDATION_TILE_SIZE;
      const isTriangle = wall.foundationShape >= 2 && wall.foundationShape <= 5;
      
      if (isTriangle) {
        // Triangle walls extend upward (top triangle B is moved up one tile) and are slanted
        // Use foundation CENTER for base Y-sorting, comparator will handle direction-based sorting
        // This allows proper sorting from both north and south approaches
        return baseY + FOUNDATION_TILE_SIZE / 2; // Center of foundation cell
      } else if (wall.edge === 0) {
        // North walls: Use bottom edge position (same as south walls) for consistent Y-sorting
        // When player approaches from south (below), their Y is higher, so wall renders before (below) player
        // Special case handling in comparator ensures correct rendering when player is north of wall
        const bottomEdgeY = baseY + FOUNDATION_TILE_SIZE;
        return bottomEdgeY; // Bottom edge of foundation cell (same as south walls)
      } else if (wall.edge === 2) {
        // South walls: Use actual bottom edge position for proper Y-sorting
        // When player approaches from below (south), wall should render below player based on Y position
        // Special case handling in comparator will ensure correct rendering when player is on tile
        const bottomEdgeY = baseY + FOUNDATION_TILE_SIZE;
        return bottomEdgeY; // Bottom edge of foundation cell
      } else {
        // East/west walls: render ABOVE north walls (closer to viewer in 3/4 perspective)
        // Use higher Y value to ensure they render after north walls
        const bottomEdgeY = baseY + FOUNDATION_TILE_SIZE;
        return bottomEdgeY + 20000; // Higher than north walls to render on top
      }
    }
    case 'grass':
      return entity.serverPosY;
    case 'projectile': {
      const startTime = Number(entity.startTime.microsSinceUnixEpoch / 1000n);
      const elapsedSeconds = (timestamp - startTime) / 1000.0;
      return entity.startPosY + entity.velocityY * elapsedSeconds;
    }
    case 'viper_spittle': {
      const startTime = Number(entity.startTime.microsSinceUnixEpoch / 1000n);
      const elapsedSeconds = (timestamp - startTime) / 1000.0;
      return entity.startPosY + entity.velocityY * elapsedSeconds;
    }
    case 'sea_stack':
      return entity.posY;
    case 'shelter':
      return entity.posY - 100;
    default:
      return 0;
  }
};

const getEntityPriority = (item: YSortedEntityType): number => {
  switch (item.type) {
    case 'sea_stack': return 1;
    case 'tree': return 2;
    case 'stone': return 3;
    case 'wild_animal': return 4;
    case 'wooden_storage_box': return 5;
    case 'stash': return 6;
    case 'campfire': return 7;
    case 'furnace': return 7.5;
    case 'lantern': return 8;
    case 'homestead_hearth': return 7.2; // ADDED: Homestead Hearth (between furnace and lantern)
    case 'grass': return 9;
    case 'planted_seed': return 10;
    case 'dropped_item': return 11;
    case 'harvestable_resource': return 12;
    case 'sleeping_bag': return 13; // Render after dropped items, before barrels
    case 'barrel': return 15;
    case 'rain_collector': return 18;
    case 'foundation_cell': return 0.5; // ADDED: Foundations render early (ground level)
    case 'wall_cell': {
      const wall = item.entity as SpacetimeDBWallCell;
      if (wall.edge === 0 || wall.edge === 2) {
        // North/south walls render above players but below east/west walls
        return 22; // Render after players (priority 21)
      } else {
        // East/west walls render ABOVE north walls (closer to viewer in 3/4 perspective)
        return 23; // Higher priority than north walls (22) to render on top
      }
    }
    case 'projectile': return 19;
    case 'viper_spittle': return 19;
    case 'animal_corpse': return 20;
    case 'player_corpse': return 20;
    case 'player': return 21;
    case 'shelter': return 25;
    default: return 0;
  }
};

// Helper function to check if a player is on the same tile as a foundation/wall
const isPlayerOnSameTileAsBuilding = (
  player: SpacetimeDBPlayer,
  building: SpacetimeDBFoundationCell | SpacetimeDBWallCell
): boolean => {
  const TILE_SIZE = 48;
  // Convert player position to tile coordinates (using floor to match server-side logic)
  const playerTileX = Math.floor(player.positionX / TILE_SIZE);
  const playerTileY = Math.floor(player.positionY / TILE_SIZE);
  
  // Foundation cells use 96px grid (2x world tiles)
  // A foundation cell at (cellX, cellY) covers world tiles:
  // X: cellX * 2 to cellX * 2 + 1
  // Y: cellY * 2 to cellY * 2 + 1
  const foundationCellWorldTileMinX = building.cellX * 2;
  const foundationCellWorldTileMaxX = building.cellX * 2 + 1;
  const foundationCellWorldTileMinY = building.cellY * 2;
  const foundationCellWorldTileMaxY = building.cellY * 2 + 1;
  
  // Check if player is within the foundation cell's world tile range
  const isOnSameTile = playerTileX >= foundationCellWorldTileMinX && 
                       playerTileX <= foundationCellWorldTileMaxX &&
                       playerTileY >= foundationCellWorldTileMinY && 
                       playerTileY <= foundationCellWorldTileMaxY;
  
  return isOnSameTile;
};

// Check if player is on the same tile OR adjacent to a wall (for Y-sorting purposes)
const isPlayerNearWall = (
  player: SpacetimeDBPlayer,
  wall: SpacetimeDBWallCell
): boolean => {
  const TILE_SIZE = 48;
  const FOUNDATION_TILE_SIZE = 96;
  const playerTileX = Math.floor(player.positionX / TILE_SIZE);
  const playerTileY = Math.floor(player.positionY / TILE_SIZE);
  
  const foundationCellWorldTileMinX = wall.cellX * 2;
  const foundationCellWorldTileMaxX = wall.cellX * 2 + 1;
  const foundationCellWorldTileMinY = wall.cellY * 2;
  const foundationCellWorldTileMaxY = wall.cellY * 2 + 1;
  
  // Check if player is on the foundation tile
  const isOnSameTile = playerTileX >= foundationCellWorldTileMinX && 
                       playerTileX <= foundationCellWorldTileMaxX &&
                       playerTileY >= foundationCellWorldTileMinY && 
                       playerTileY <= foundationCellWorldTileMaxY;
  
  if (isOnSameTile) return true;
  
  // For north walls (edge 0): check if player is on the tile directly south of foundation
  // The wall foundation is one tile north of where the player is standing
  if (wall.edge === 0) {
    // Player is south of foundation: check if player is on tiles south of foundation's bottom edge
    const southTileMinY = foundationCellWorldTileMaxY + 1;
    const southTileMaxY = foundationCellWorldTileMaxY + 2; // Foundation is 2 tiles tall
    return playerTileX >= foundationCellWorldTileMinX && 
           playerTileX <= foundationCellWorldTileMaxX &&
           playerTileY >= southTileMinY && 
           playerTileY <= southTileMaxY;
  }
  
  // For south walls (edge 2): check if player is on the tile directly north of foundation
  if (wall.edge === 2) {
    const northTileMinY = foundationCellWorldTileMinY - 2; // Foundation is 2 tiles tall
    const northTileMaxY = foundationCellWorldTileMinY - 1;
    return playerTileX >= foundationCellWorldTileMinX && 
           playerTileX <= foundationCellWorldTileMaxX &&
           playerTileY >= northTileMinY && 
           playerTileY <= northTileMaxY;
  }
  
  return false;
};



// ===== PERFORMANCE OPTIMIZATION CONSTANTS =====
const PERFORMANCE_MODE = {
  // Frame-based throttling for different entity types
  TREE_UPDATE_INTERVAL: 3,          // Update trees every 3 frames
  STONE_UPDATE_INTERVAL: 5,         // Update stones every 5 frames  
  RESOURCE_UPDATE_INTERVAL: 2,      // Update resources every 2 frames
  DECORATION_UPDATE_INTERVAL: 10,   // Update decorations every 10 frames
  
  // Distance-based culling (squared for performance) - MUCH LESS AGGRESSIVE
  TREE_CULL_DISTANCE_SQ: 2000 * 2000,      // 2000px radius (much larger)
  STONE_CULL_DISTANCE_SQ: 1800 * 1800,     // 1800px radius (much larger)
  RESOURCE_CULL_DISTANCE_SQ: 1600 * 1600,  // 1600px radius (much larger)
  DECORATION_CULL_DISTANCE_SQ: 1400 * 1400, // 1400px radius (much larger)
  
  // Entity count limiting - MUCH HIGHER LIMITS
  MAX_TREES_PER_FRAME: 200,        // Increased from 50 to 200
  MAX_STONES_PER_FRAME: 100,       // Increased from 30 to 100
  MAX_RESOURCES_PER_FRAME: 80,     // Increased from 25 to 80
  MAX_DECORATIONS_PER_FRAME: 150,  // Increased from 20 to 150
  
  // Emergency mode thresholds - MUCH HIGHER BEFORE EMERGENCY
  EMERGENCY_TOTAL_ENTITIES: 800,   // Increased from 200 to 500
  EMERGENCY_FPS_THRESHOLD: 30,     // Increased from 45 to 30
  
  // Viewport expansion for conservative culling - MUCH LARGER BUFFER
  VIEWPORT_EXPANSION_FACTOR: 2.5,  // Increased from 1.5 to 2.5 (show 2.5x viewport size)
  EMERGENCY_MAX_TREES: 100,
  EMERGENCY_MAX_RESOURCES: 40,
  EMERGENCY_MAX_DECORATIONS: 50,
};

// Frame counter for throttling
let frameCounter = 0;

// Cache for pre-filtered entities to avoid recalculation
const entityCache = new Map<string, {
  entities: any[];
  lastUpdateFrame: number;
  lastPlayerX: number;
  lastPlayerY: number;
}>();

// ===== PERFORMANCE LOGGING SYSTEM =====
// REMOVED: Performance logging system to reduce overhead

// ===== ENTITY COUNTING HELPERS =====
function countEntitiesInRadius(
  entities: any[],
  playerPos: { x: number; y: number },
  radius: number
): { total: number; nearby: number } {
  const radiusSq = radius * radius;
  let nearby = 0;
  
  entities.forEach(entity => {
    const dx = entity.posX - playerPos.x;
    const dy = entity.posY - playerPos.y;
    if (dx * dx + dy * dy <= radiusSq) {
      nearby++;
    }
  });
  
  return { total: entities.length, nearby };
}

// Helper function to get player position for distance calculations
function getPlayerPosition(players: Map<string, SpacetimeDBPlayer>): { x: number; y: number } | null {
  if (!players || players.size === 0) return null;
  
  // Try to find the local player or use the first available player
  const firstPlayer = Array.from(players.values())[0];
  return firstPlayer ? { x: firstPlayer.positionX, y: firstPlayer.positionY } : null;
}

// Optimized distance-based filtering
function filterEntitiesByDistance<T extends { posX: number; posY: number }>(
  entities: T[],
  playerPos: { x: number; y: number },
  maxDistanceSq: number,
  maxCount: number
): T[] {
  if (entities.length === 0) return entities;
  
  // Calculate distances and filter
  const withDistance = entities
    .map(entity => {
      const dx = entity.posX - playerPos.x;
      const dy = entity.posY - playerPos.y;
      return { entity, distanceSq: dx * dx + dy * dy };
    })
    .filter(item => item.distanceSq <= maxDistanceSq)
    .sort((a, b) => a.distanceSq - b.distanceSq) // Sort by distance (closest first)
    .slice(0, maxCount) // Limit count
    .map(item => item.entity);
  
  return withDistance;
}

// Cached entity filtering with frame-based throttling
function getCachedFilteredEntities<T extends { posX: number; posY: number }>(
  entities: Map<string, T> | undefined,
  cacheKey: string,
  updateInterval: number,
  maxDistanceSq: number,
  maxCount: number,
  playerPos: { x: number; y: number } | null,
  additionalFilter?: (entity: T) => boolean
): T[] {
  if (!entities || !playerPos) return [];
  
  const cache = entityCache.get(cacheKey);
  
  // Check if we can use cached results
  if (cache && 
      (frameCounter - cache.lastUpdateFrame) < updateInterval &&
      Math.abs(cache.lastPlayerX - playerPos.x) < 100 &&
      Math.abs(cache.lastPlayerY - playerPos.y) < 100) {
    return cache.entities;
  }
  
  // Need to update cache
  let entityArray = Array.from(entities.values());
  
  // Apply additional filter if provided
  if (additionalFilter) {
    entityArray = entityArray.filter(additionalFilter);
  }
  
  // Apply distance-based filtering
  const filteredEntities = filterEntitiesByDistance(
    entityArray,
    playerPos,
    maxDistanceSq,
    maxCount
  );
  
  // Update cache
  entityCache.set(cacheKey, {
    entities: filteredEntities,
    lastUpdateFrame: frameCounter,
    lastPlayerX: playerPos.x,
    lastPlayerY: playerPos.y
  });
  
  return filteredEntities;
}

export function useEntityFiltering(
  players: Map<string, SpacetimeDBPlayer>,
  trees: Map<string, SpacetimeDBTree>,
  stones: Map<string, SpacetimeDBStone>,
  campfires: Map<string, SpacetimeDBCampfire>,
  furnaces: Map<string, SpacetimeDBFurnace>, // ADDED: Furnaces parameter
  lanterns: Map<string, SpacetimeDBLantern>,
  homesteadHearths: Map<string, SpacetimeDBHomesteadHearth>, // ADDED: Homestead Hearths parameter
  harvestableResources: Map<string, SpacetimeDBHarvestableResource>,
  droppedItems: Map<string, SpacetimeDBDroppedItem>,
  woodenStorageBoxes: Map<string, SpacetimeDBWoodenStorageBox>,
  sleepingBags: Map<string, SpacetimeDBSleepingBag>,
  playerCorpses: Map<string, SpacetimeDBPlayerCorpse>,
  stashes: Map<string, SpacetimeDBStash>,
  cameraOffsetX: number,
  cameraOffsetY: number,
  canvasWidth: number,
  canvasHeight: number,
  grass: Map<string, InterpolatedGrassData>, // Use InterpolatedGrassData
  projectiles: Map<string, SpacetimeDBProjectile>,
  shelters: Map<string, SpacetimeDBShelter>, // ADDED shelters argument
  clouds: Map<string, SpacetimeDBCloud>, // ADDED clouds argument
  plantedSeeds: Map<string, SpacetimeDBPlantedSeed>,
  rainCollectors: Map<string, SpacetimeDBRainCollector>,
  wildAnimals: Map<string, SpacetimeDBWildAnimal>, // ADDED wildAnimals argument
  viperSpittles: Map<string, SpacetimeDBViperSpittle>, // ADDED viperSpittles argument
  animalCorpses: Map<string, SpacetimeDBAnimalCorpse>, // ADDED animalCorpses argument
  barrels: Map<string, SpacetimeDBBarrel>, // ADDED barrels argument
  seaStacks: Map<string, any>, // ADDED sea stacks argument
  foundationCells: Map<string, SpacetimeDBFoundationCell>, // ADDED: Building foundations
  wallCells: Map<string, SpacetimeDBWallCell>, // ADDED: Building walls
  isTreeFalling?: (treeId: string) => boolean // NEW: Check if tree is falling
): EntityFilteringResult {
  // Increment frame counter for throttling
  frameCounter++;
  
  // Get player position for distance calculations
  const playerPos = getPlayerPosition(players);
  
  // Emergency mode removed

  // Get frame time for stable calculations across the function
  const currentTime = Date.now();

  // Only update timestamp every second to prevent constant re-renders
  const stableTimestamp = useMemo(() => {
    const now = Date.now();
    return Math.floor(now / 1000) * 1000; // Round to nearest second
  }, [Math.floor(Date.now() / 1000)]);
  // Removed debug log that was causing excessive console output

  // Calculate viewport bounds
  const getViewportBounds = useCallback((): ViewportBounds => {
    const buffer = gameConfig.tileSize * 3; // Increased from 2 to 3 for better coverage
    const viewMinX = -cameraOffsetX - buffer;
    const viewMaxX = -cameraOffsetX + canvasWidth + buffer;
    const viewMinY = -cameraOffsetY - buffer;
    const viewMaxY = -cameraOffsetY + canvasHeight + buffer;
    return { viewMinX, viewMaxX, viewMinY, viewMaxY };
  }, [cameraOffsetX, cameraOffsetY, canvasWidth, canvasHeight]);

  // Entity visibility check
  const isEntityInView = useCallback((entity: any, bounds: ViewportBounds, timestamp: number): boolean => {
    let x: number | undefined;
    let y: number | undefined;
    let width: number = gameConfig.tileSize;
    let height: number = gameConfig.tileSize;

    if (isPlayer(entity)) {
      x = entity.positionX;
      y = entity.positionY;
      width = 64; // Approx player size
      height = 64;
    } else if (isTree(entity)) {
      x = entity.posX;
      y = entity.posY;
      width = 240; // Increased from 96 to 240 to account for larger tree visuals and shadows
      height = 320; // Increased from 128 to 320 to account for taller tree visuals
    } else if (isStone(entity)) {
      x = entity.posX;
      y = entity.posY;
      width = 64;
      height = 64;
    } else if (isCampfire(entity)) {
      x = entity.posX;
      y = entity.posY;
      width = 64;
      height = 64;
    } else if ((entity as any).fuelInventoryId !== undefined && (entity as any).isBurning !== undefined) {
      // Handle furnaces - same dimensions as campfires for visibility check
      x = (entity as any).posX;
      y = (entity as any).posY;
      width = 144; // Doubled from 72 to 144 to match rendering size
      height = 144; // Doubled from 72 to 144 to match rendering size
    } else if (isLantern(entity)) {
      // Handle lanterns using proper type guard
      x = entity.posX;
      y = entity.posY;
      width = 48;
      height = 56;
    } else if ((entity as any).id !== undefined && (entity as any).posX !== undefined && (entity as any).posY !== undefined && (entity as any).slotInstanceId0 !== undefined) {
      // Handle homestead hearths - check for slotInstanceId0 field (unique to hearths)
      x = (entity as any).posX;
      y = (entity as any).posY;
      width = 96; // HEARTH_WIDTH
      height = 96; // HEARTH_HEIGHT
    } else if (isHarvestableResource(entity)) {
      x = entity.posX;
      y = entity.posY;
      width = 32;
      height = 32;
    } else if (isWoodenStorageBox(entity)) {
      x = entity.posX;
      y = entity.posY;
      width = 64;
      height = 64;
    } else if (isSleepingBag(entity)) {
      x = entity.posX;
      y = entity.posY;
      width = 64;
      height = 32;
    } else if (isStash(entity)) {
      x = entity.posX;
      y = entity.posY;
      width = 32;
      height = 32;
    } else if ((entity as any).startPosX !== undefined && (entity as any).startPosY !== undefined) {
      // Handle projectiles - calculate current position based on time
      const projectile = entity as any;
      const startTime = Number(projectile.startTime.microsSinceUnixEpoch / 1000n);
      const elapsedSeconds = (timestamp - startTime) / 1000.0;
      x = projectile.startPosX + projectile.velocityX * elapsedSeconds;
      y = projectile.startPosY + projectile.velocityY * elapsedSeconds;
      width = 32;
      height = 32;
    } else if (isShelter(entity)) {
      x = entity.posX;
      y = entity.posY;
      width = 384; // Based on SHELTER_RENDER_WIDTH
      height = 384; // Based on SHELTER_RENDER_HEIGHT
    } else if (isGrass(entity)) {
      // After isGrass, entity could be SpacetimeDBGrass or InterpolatedGrassData
      if ('serverPosX' in entity && typeof entity.serverPosX === 'number') { // It's InterpolatedGrassData
        x = entity.serverPosX;
        y = (entity as any).serverPosY;
      } else { // It's SpacetimeDBGrass (should ideally not happen if input is always InterpolatedGrassData)
        x = (entity as any).posX;
        y = (entity as any).posY;
      }
      width = 48;
      height = 48;
    } else if ((entity as any).posX !== undefined && (entity as any).seedType !== undefined) {
      // Handle planted seeds - check for seed-specific properties
      x = (entity as any).posX;
      y = (entity as any).posY;
      width = 24; // Small seed size
      height = 24;
    } else if (isWildAnimal(entity)) {
      x = entity.posX;
      y = entity.posY;
      // All wild animals now use the same square dimensions for consistency
      width = 96;
      height = 96;
    } else if ((entity as any).viperId !== undefined && (entity as any).startPosX !== undefined) {
      // Handle viper spittles - calculate current position based on time
      const spittle = entity as any;
      const startTime = Number(spittle.startTime.microsSinceUnixEpoch / 1000n);
      const elapsedSeconds = (timestamp - startTime) / 1000.0;
      x = spittle.startPosX + spittle.velocityX * elapsedSeconds;
      y = spittle.startPosY + spittle.velocityY * elapsedSeconds;
      width = 24; // Small spittle size
      height = 24;
    } else if (isAnimalCorpse(entity)) {
      // Handle animal corpses
      x = entity.posX;
      y = entity.posY;
      width = 96; // Same size as wild animals
      height = 96;
    } else if (isBarrel(entity)) {
      // Handle barrels
      x = entity.posX;
      y = entity.posY;
      width = 48; // Barrel width
      height = 48; // Barrel height
    } else if (isSeaStack(entity)) {
      // Handle sea stacks - they're large tall structures like trees but bigger
      x = entity.posX;
      y = entity.posY;
      width = 400; // Sea stacks are large - use the same as BASE_WIDTH in rendering
      height = 600; // Sea stacks are tall - generous height for Y-sorting visibility
    } else {
      return false; // Unknown entity type
    }

    if (x === undefined || y === undefined) return false;

    // AABB overlap check
    return (
      x + width / 2 > bounds.viewMinX &&
      x - width / 2 < bounds.viewMaxX &&
      y + height / 2 > bounds.viewMinY &&
      y - height / 2 < bounds.viewMaxY
    );
  }, []);

  // Get viewport bounds
  const viewBounds = useMemo(() => getViewportBounds(), [getViewportBounds]);

  // PERFORMANCE: Use cached filtering for expensive entity types
  let cachedVisibleTrees = useMemo(() => {
    if (!playerPos) return [];
    
    return getCachedFilteredEntities(
      trees,
      'trees',
      PERFORMANCE_MODE.TREE_UPDATE_INTERVAL,
      PERFORMANCE_MODE.TREE_CULL_DISTANCE_SQ,
      PERFORMANCE_MODE.MAX_TREES_PER_FRAME,
      playerPos,
      (tree) => {
        // Include tree if it has health OR if it's currently falling
        const isFalling = isTreeFalling ? isTreeFalling(tree.id.toString()) : false;
        return (tree.health > 0 || isFalling) && isEntityInView(tree, viewBounds, stableTimestamp);
      }
    );
  }, [trees, playerPos, viewBounds, stableTimestamp, frameCounter, isTreeFalling]);

  let cachedVisibleStones = useMemo(() => {
    if (!playerPos) return [];
    
    return getCachedFilteredEntities(
      stones,
      'stones',
      PERFORMANCE_MODE.STONE_UPDATE_INTERVAL,
      PERFORMANCE_MODE.STONE_CULL_DISTANCE_SQ,
      PERFORMANCE_MODE.MAX_STONES_PER_FRAME,
      playerPos,
      (stone) => stone.health > 0 && isEntityInView(stone, viewBounds, stableTimestamp)
    );
  }, [stones, playerPos, viewBounds, stableTimestamp, frameCounter]);

  let cachedVisibleResources = useMemo(() => {
    if (!playerPos) return [];
    
    return getCachedFilteredEntities(
      harvestableResources,
      'resources',
      PERFORMANCE_MODE.RESOURCE_UPDATE_INTERVAL,
      PERFORMANCE_MODE.RESOURCE_CULL_DISTANCE_SQ,
      PERFORMANCE_MODE.MAX_RESOURCES_PER_FRAME,
      playerPos,
      (resource) => (resource.respawnAt === null || resource.respawnAt === undefined) && 
                    isEntityInView(resource, viewBounds, stableTimestamp)
    );
  }, [harvestableResources, playerPos, viewBounds, stableTimestamp, frameCounter]);

  // Use cached results instead of original filtering
  let visibleTrees = cachedVisibleTrees;
  const visibleStones = cachedVisibleStones;
  let visibleHarvestableResources = cachedVisibleResources;

  // Keep original filtering for less expensive entity types
  const visibleDroppedItems = useMemo(() => 
    // Check source map
          droppedItems ? Array.from(droppedItems.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp))
    : [],
    [droppedItems, isEntityInView, viewBounds, stableTimestamp]
  );

  const visibleCampfires = useMemo(() => 
    // Check source map
          campfires ? Array.from(campfires.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp) && !e.isDestroyed)
    : [],
    [campfires, isEntityInView, viewBounds, stableTimestamp]
  );

  const visibleFurnaces = useMemo(() => 
    // Check source map - same filtering as campfires
          furnaces ? Array.from(furnaces.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp) && !e.isDestroyed)
    : [],
    [furnaces, isEntityInView, viewBounds, stableTimestamp]
  );

  const visibleLanterns = useMemo(() => {
    if (!lanterns) return [];
    
    const allLanterns = Array.from(lanterns.values());
    const visibleFiltered = allLanterns.filter(e => isEntityInView(e, viewBounds, stableTimestamp) && !e.isDestroyed);
    
    return visibleFiltered;
  }, [lanterns, isEntityInView, viewBounds, stableTimestamp]);

  const visibleHomesteadHearths = useMemo(() => 
    // Check source map - same filtering as campfires
          homesteadHearths ? Array.from(homesteadHearths.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp) && !e.isDestroyed)
    : [],
    [homesteadHearths, isEntityInView, viewBounds, stableTimestamp]
  );

  const visiblePlayers = useMemo(() => {
    if (!players) return [];
    return Array.from(players.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp));
  }, [players, isEntityInView, viewBounds, stableTimestamp]);

  const visibleWoodenStorageBoxes = useMemo(() => 
    // Check source map
          woodenStorageBoxes ? Array.from(woodenStorageBoxes.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp))
    : [],
    [woodenStorageBoxes, isEntityInView, viewBounds, stableTimestamp]
  );
  
  const visibleSleepingBags = useMemo(() => 
    // Check source map
    sleepingBags ? Array.from(sleepingBags.values())
      .filter(e => isEntityInView(e, viewBounds, stableTimestamp))
      : []
    ,[sleepingBags, isEntityInView, viewBounds, stableTimestamp]
  );

  const visiblePlayerCorpses = useMemo(() => 
    // Add check: If playerCorpses is undefined or null, return empty array
    playerCorpses ? Array.from(playerCorpses.values())
      .filter(e => isEntityInView(e, viewBounds, stableTimestamp))
      : []
    ,[playerCorpses, isEntityInView, viewBounds, stableTimestamp]
  );

  const visibleStashes = useMemo(() => 
    stashes ? Array.from(stashes.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp))
    : [],
    [stashes, isEntityInView, viewBounds, stableTimestamp]
  );

  const visibleProjectiles = useMemo(() => {
    const projectilesArray = Array.from(projectiles.values());
    
    // For projectiles, use minimal filtering to ensure they're always visible in production
    // Skip complex timing calculations that could cause issues with network latency
    const filtered = projectilesArray.filter(projectile => {
      // Simple bounds check using start position (no timing calculations)
      const startX = projectile.startPosX;
      const startY = projectile.startPosY;
      
      // Very generous bounds check - if the projectile started anywhere near the viewport,
      // let it through (it will be properly positioned in the render function)
      const margin = 1000; // Large margin to account for projectile travel
      return (
        startX > viewBounds.viewMinX - margin &&
        startX < viewBounds.viewMaxX + margin &&
        startY > viewBounds.viewMinY - margin &&
        startY < viewBounds.viewMaxY + margin
      );
    });
    
    // Debug logging for projectiles
    if (projectilesArray.length > 0 || filtered.length > 0) {
      console.log(`🏹 [FILTERING] Total projectiles: ${projectilesArray.length}, Visible: ${filtered.length}`);
      if (filtered.length > 0) {
        console.log(`🏹 [FILTERING] Visible projectile IDs:`, filtered.map(p => p.id));
      }
    }
    
    return filtered;
  }, [projectiles, viewBounds]);

  // PERFORMANCE: More aggressive grass culling
  let visibleGrass = useMemo(() => {
    if (!grass || !playerPos) return [];
    
    return Array.from(grass.values()).filter(e => 
      e.health > 0 && isEntityInView(e, viewBounds, stableTimestamp)
    );
  }, [grass, playerPos, viewBounds, stableTimestamp, frameCounter]);

  // ADDED: Filter visible shelters
  const visibleShelters = useMemo(() => {
    const filtered = shelters ? Array.from(shelters.values()).filter(e => !e.isDestroyed && isEntityInView(e, viewBounds, stableTimestamp)) : [];
    // console.log('[useEntityFiltering] Filtered visibleShelters count:', filtered.length, filtered); // DEBUG LOG 2
    return filtered;
  }, [shelters, isEntityInView, viewBounds, stableTimestamp]);

  const visibleClouds = useMemo(() => 
    clouds ? Array.from(clouds.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp))
    : [],
    [clouds, isEntityInView, viewBounds, stableTimestamp]
  );

  const visiblePlantedSeeds = useMemo(() => {
    if (!plantedSeeds) return [];
    
    // Convert to array and filter
    const seedsArray = Array.from(plantedSeeds.values());
    const filtered = seedsArray.filter(e => isEntityInView(e, viewBounds, stableTimestamp));
    
    return filtered;
  }, [plantedSeeds, plantedSeeds?.size, isEntityInView, viewBounds, stableTimestamp]);

  const visibleRainCollectors = useMemo(() => 
    rainCollectors ? Array.from(rainCollectors.values()).filter(e => !e.isDestroyed && isEntityInView(e, viewBounds, stableTimestamp))
    : [],
    [rainCollectors, isEntityInView, viewBounds, stableTimestamp]
  );

  const visibleWildAnimals = useMemo(() => {
    if (!wildAnimals) return [];
    
    // CRITICAL FIX: Add generous padding for animals to prevent disappearing during chunk transitions
    // Animals can move quickly between chunks, so we need to show them even if they're slightly
    // outside the normal viewport bounds during transitions
    const animalPadding = 200; // Generous padding for fast-moving animals
    
    return Array.from(wildAnimals.values()).filter(e => {
      // Always show animals that are alive (health > 0)
      // This ensures animals transitioning between chunks remain visible
      if (e.health <= 0) return false;
      
      // Check viewport with generous padding for animals
      const paddedBounds = {
        viewMinX: viewBounds.viewMinX - animalPadding,
        viewMaxX: viewBounds.viewMaxX + animalPadding,
        viewMinY: viewBounds.viewMinY - animalPadding,
        viewMaxY: viewBounds.viewMaxY + animalPadding,
      };
      
      return isEntityInView(e, paddedBounds, stableTimestamp);
    });
  }, [wildAnimals, isEntityInView, viewBounds, stableTimestamp]);

  const visibleViperSpittles = useMemo(() => 
    viperSpittles ? Array.from(viperSpittles.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp))
    : [],
    [viperSpittles, isEntityInView, viewBounds, stableTimestamp]
  );

  const visibleAnimalCorpses = useMemo(() => {
    const result = animalCorpses ? Array.from(animalCorpses.values()).filter(e => {
      const inView = isEntityInView(e, viewBounds, stableTimestamp);
      // Convert microseconds to milliseconds for proper comparison
      const despawnTimeMs = Number(e.despawnAt.__timestamp_micros_since_unix_epoch__ / 1000n);
              const notDespawned = stableTimestamp < despawnTimeMs; // Check if current time is before despawn time
      return inView && notDespawned;
    }) : [];
    // console.log(`🦴 [ANIMAL CORPSE FILTERING] Total corpses: ${animalCorpses?.size || 0}, Visible after filtering: ${result.length}, IDs: [${result.map(c => c.id).join(', ')}]`);
    return result;
  }, [animalCorpses, isEntityInView, viewBounds, stableTimestamp]);

  const visibleBarrels = useMemo(() => 
    barrels ? Array.from(barrels.values()).filter(e => 
      !e.respawnAt && isEntityInView(e, viewBounds, stableTimestamp) // Don't show if respawning (destroyed)
    ) : [],
    [barrels, isEntityInView, viewBounds, stableTimestamp]
  );

  const visibleSeaStacks = useMemo(() => 
    seaStacks ? Array.from(seaStacks.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp))
    : [],
    [seaStacks, isEntityInView, viewBounds, stableTimestamp]
  );

  // ADDED: Filter visible foundation cells
  // CRITICAL FIX: Depend on foundationCells.size to ensure recalculation when subscription data loads
  const visibleFoundationCells = useMemo(() => {
    if (!foundationCells || typeof foundationCells.values !== 'function') return [];
    
    // Foundation cells use cell coordinates - need custom viewport check
    return Array.from(foundationCells.values()).filter(foundation => {
      if (foundation.isDestroyed) return false;
      
      // Convert foundation cell coordinates to world pixel coordinates (center of foundation cell)
      const worldX = (foundation.cellX * 96) + 48; // FOUNDATION_TILE_SIZE = 96
      const worldY = (foundation.cellY * 96) + 48;
      
      // Check if foundation is in viewport
      return worldX >= viewBounds.viewMinX && worldX <= viewBounds.viewMaxX &&
             worldY >= viewBounds.viewMinY && worldY <= viewBounds.viewMaxY;
    });
  }, [foundationCells, foundationCells?.size, viewBounds, stableTimestamp]);

  // Extract wall map size BEFORE useMemo to ensure React detects changes
  const wallMapSize = wallCells?.size || 0;
  
  // ADDED: Filter visible wall cells
  // CRITICAL FIX: Depend on wallMapSize to ensure recalculation when subscription data loads
  const visibleWallCells = useMemo(() => {
    if (!wallCells || typeof wallCells.values !== 'function') return [];
    
    // Wall cells use foundation cell coordinates - need custom viewport check
    // North/south walls extend beyond foundation boundaries (2 tiles tall), so need extra padding
    const FOUNDATION_TILE_SIZE = 96;
    const padding = 50; // Extra padding to catch walls on edges
    const northSouthWallHeight = FOUNDATION_TILE_SIZE * 2; // North/south walls are 2 foundation cells tall
    
    return Array.from(wallCells.values()).filter(wall => {
      if (wall.isDestroyed) return false;
      
      // Convert foundation cell coordinates to world pixel coordinates (center of foundation cell)
      const worldX = (wall.cellX * FOUNDATION_TILE_SIZE) + 48;
      const worldY = (wall.cellY * FOUNDATION_TILE_SIZE) + 48;
      
      // North/south walls extend beyond foundation boundaries (both extend upward)
      if (wall.edge === 0 || wall.edge === 2) {
        // Both north and south walls extend upward for isometric depth
        // North wall: extends from top edge upward
        // South wall: extends from bottom edge upward
        const foundationTopY = wall.cellY * FOUNDATION_TILE_SIZE;
        const foundationBottomY = foundationTopY + FOUNDATION_TILE_SIZE;
        
        if (wall.edge === 0) {
          // North wall - extends upward from top edge
          const minY = foundationTopY - northSouthWallHeight; // Top of wall extends upward
          const maxY = foundationTopY; // Bottom of wall is at foundation top
          return worldX >= viewBounds.viewMinX - padding && worldX <= viewBounds.viewMaxX + padding &&
                 maxY >= viewBounds.viewMinY - padding && minY <= viewBounds.viewMaxY + padding;
        } else {
          // South wall - extends upward from bottom edge
          const minY = foundationBottomY - northSouthWallHeight; // Top of wall (extends upward from bottom)
          const maxY = foundationBottomY; // Bottom of wall is at foundation bottom
          return worldX >= viewBounds.viewMinX - padding && worldX <= viewBounds.viewMaxX + padding &&
                 maxY >= viewBounds.viewMinY - padding && minY <= viewBounds.viewMaxY + padding;
        }
      } else {
        // East/west walls - standard padding
      return worldX >= viewBounds.viewMinX - padding && worldX <= viewBounds.viewMaxX + padding &&
             worldY >= viewBounds.viewMinY - padding && worldY <= viewBounds.viewMaxY + padding;
      }
    });
  }, [wallCells, wallMapSize, viewBounds, stableTimestamp]);

  const visibleHarvestableResourcesMap = useMemo(() => 
    new Map(visibleHarvestableResources.map(hr => [hr.id.toString(), hr])), 
    [visibleHarvestableResources]
  );

  const visibleCampfiresMap = useMemo(() => 
    new Map(visibleCampfires.map(c => [c.id.toString(), c])), 
    [visibleCampfires]
  );

  const visibleFurnacesMap = useMemo(() => 
    new Map(visibleFurnaces.map(f => [f.id.toString(), f])), 
    [visibleFurnaces]
  );

  const visibleLanternsMap = useMemo(() => 
    new Map(visibleLanterns.map(l => [l.id.toString(), l])), 
    [visibleLanterns]
  );

  const visibleHomesteadHearthsMap = useMemo(() => 
    new Map(visibleHomesteadHearths.map(h => [h.id.toString(), h])), 
    [visibleHomesteadHearths]
  ); 

  const visibleDroppedItemsMap = useMemo(() => 
    new Map(visibleDroppedItems.map(i => [i.id.toString(), i])), 
    [visibleDroppedItems]
  );
  
  const visibleBoxesMap = useMemo(() => 
    new Map(visibleWoodenStorageBoxes.map(b => [b.id.toString(), b])), 
    [visibleWoodenStorageBoxes]
  );

    const visiblePlantedSeedsMap = useMemo(() => 
    new Map(visiblePlantedSeeds.map(p => [p.id.toString(), p])), 
    [visiblePlantedSeeds]
  );

  const visibleRainCollectorsMap = useMemo(() => 
    new Map(visibleRainCollectors.map(r => [r.id.toString(), r])), 
    [visibleRainCollectors]
  );

  const visibleWildAnimalsMap = useMemo(() => 
    new Map(visibleWildAnimals.map(w => [w.id.toString(), w])), 
    [visibleWildAnimals]
  );

  const visibleProjectilesMap = useMemo(() => 
    new Map(visibleProjectiles.map(p => [p.id.toString(), p])), 
    [visibleProjectiles]
  );

  const visiblePlayerCorpsesMap = useMemo(() => {
    const map = new Map<string, SpacetimeDBPlayerCorpse>();
    visiblePlayerCorpses.forEach(c => map.set(c.id.toString(), c));
    return map;
  }, [visiblePlayerCorpses]);

  const visibleStashesMap = useMemo(() => new Map(visibleStashes.map(st => [st.id.toString(), st])), [visibleStashes]);

  const visibleSleepingBagsMap = useMemo(() => 
    new Map(visibleSleepingBags.map(sl => [sl.id.toString(), sl])), 
    [visibleSleepingBags]
  );

  const visibleTreesMap = useMemo(() => {
    const map = new Map<string, SpacetimeDBTree>();
    visibleTrees.forEach(e => map.set(e.id.toString(), e));
    return map;
  }, [visibleTrees]);

  const visibleStonesMap = useMemo(() => {
    const map = new Map<string, SpacetimeDBStone>();
    visibleStones.forEach(e => map.set(e.id.toString(), e));
    return map;
  }, [visibleStones]);

  const visibleWoodenStorageBoxesMap = useMemo(() => {
    const map = new Map<string, SpacetimeDBWoodenStorageBox>();
    visibleWoodenStorageBoxes.forEach(e => map.set(e.id.toString(), e));
    return map;
  }, [visibleWoodenStorageBoxes]);

  const groundItems = useMemo(() => visibleSleepingBags, [visibleSleepingBags]);

  const visibleGrassMap = useMemo(() => 
    new Map(visibleGrass.map(g => [g.id.toString(), g])),
    [visibleGrass]
  ); // visibleGrass is now InterpolatedGrassData[]

  // ADDED: Map for visible shelters
  const visibleSheltersMap = useMemo(() =>
    new Map(visibleShelters.map(s => [s.id.toString(), s])),
    [visibleShelters]
  );

  // ADDED: Map for visible viper spittles
  const visibleViperSpittlesMap = useMemo(() =>
    new Map(visibleViperSpittles.map(v => [v.id.toString(), v])),
    [visibleViperSpittles]
  );

  // ADDED: Map for visible animal corpses
  const visibleAnimalCorpsesMap = useMemo(() =>
    new Map(visibleAnimalCorpses.map(a => [a.id.toString(), a])),
    [visibleAnimalCorpses]
  );

  // ADDED: Map for visible barrels
  const visibleBarrelsMap = useMemo(() =>
    new Map(visibleBarrels.map(b => [b.id.toString(), b])),
    [visibleBarrels]
  );

  // ADDED: Map for visible sea stacks
  const visibleSeaStacksMap = useMemo(() =>
    new Map(visibleSeaStacks.map(s => [s.id.toString(), s])),
    [visibleSeaStacks]
  );

  // ADDED: Map for visible foundation cells
  const visibleFoundationCellsMap = useMemo(() =>
    new Map(visibleFoundationCells.map(f => [f.id.toString(), f])),
    [visibleFoundationCells]
  );

  // ADDED: Map for visible wall cells
  const visibleWallCellsMap = useMemo(() =>
    new Map(visibleWallCells.map(w => [w.id.toString(), w])),
    [visibleWallCells]
  );

  // ===== CACHED Y-SORTING WITH DIRTY FLAG SYSTEM =====
  // Cache for Y-sorted entities to avoid recalculating every frame
  const ySortedCache = useMemo(() => ({
    entities: [] as YSortedEntityType[],
    lastUpdateFrame: -1,
    lastEntityCounts: {} as Record<string, number>,
    lastFoundationMapSize: 0, // Track foundation map size separately
    lastWallMapSize: 0, // Track wall map size separately
    isDirty: true
  }), []);
  
  // Helper to check if entity counts changed significantly
  const hasEntityCountChanged = useCallback((newCounts: Record<string, number>) => {
    const oldCounts = ySortedCache.lastEntityCounts;
    for (const [key, count] of Object.entries(newCounts)) {
      if (Math.abs((oldCounts[key] || 0) - count) > 2) { // Only resort if count changed by more than 2
        return true;
      }
    }
    return false;
  }, [ySortedCache]);

  // Y-sorted entities with PERFORMANCE OPTIMIZED sorting
  // CRITICAL: Force recalculation when map sizes change (subscription data loads)
  // Note: wallMapSize is already extracted above
  const foundationMapSize = foundationCells?.size || 0;
  const playerMapSize = players?.size || 0;
  
  const ySortedEntities = useMemo(() => {
    // Calculate current entity counts
    const currentEntityCounts = {
      players: visiblePlayers.length,
      trees: visibleTrees.length,
      stones: visibleStones.length,
      boxes: visibleWoodenStorageBoxes.length,
      campfires: visibleCampfires.length,
      furnaces: visibleFurnaces.length,
      lanterns: visibleLanterns.length,
      homesteadHearths: visibleHomesteadHearths.length, // ADDED: Homestead Hearths count
      droppedItems: visibleDroppedItems.length,
      projectiles: visibleProjectiles.length,
      shelters: visibleShelters.length,
      grass: visibleGrass.length,
      plantedSeeds: visiblePlantedSeeds.length,
      rainCollectors: visibleRainCollectors.length,
      wildAnimals: visibleWildAnimals.length,
      viperSpittles: visibleViperSpittles.length,
      animalCorpses: visibleAnimalCorpses.length,
      barrels: visibleBarrels.length,
      seaStacks: visibleSeaStacks.length,
      foundationCells: visibleFoundationCells.length,
      harvestableResources: visibleHarvestableResources.length,
      playerCorpses: visiblePlayerCorpses.length,
      stashes: visibleStashes.length,
      wallCells: visibleWallCells.length
    };
    
    const totalEntities = Object.values(currentEntityCounts).reduce((sum, count) => sum + count, 0);
    
    // Early exit if no entities
    if (totalEntities === 0) return [];
    
    // CRITICAL FIX: Force re-sort when foundation/wall data first loads OR when player data loads
    // This fixes the issue where players render below tiles on initial login
    // because player data loads before foundation/wall data (or vice versa)
    const foundationsJustLoaded = visibleFoundationCells.length > 0 && 
      (!ySortedCache.lastEntityCounts || ySortedCache.lastEntityCounts.foundationCells === 0);
    const wallsJustLoaded = visibleWallCells.length > 0 && 
      (!ySortedCache.lastEntityCounts || ySortedCache.lastEntityCounts.wallCells === 0);
    const playersJustLoaded = visiblePlayers.length > 0 && 
      (!ySortedCache.lastEntityCounts || ySortedCache.lastEntityCounts.players === 0);
    
    // CRITICAL FIX: Also check if player data loaded AFTER foundations/walls were already present
    // This handles the case where foundations load first, then player loads later
    const foundationsWerePresent = ySortedCache.lastEntityCounts && 
      (ySortedCache.lastEntityCounts.foundationCells || 0) > 0;
    const wallsWerePresent = ySortedCache.lastEntityCounts && 
      (ySortedCache.lastEntityCounts.wallCells || 0) > 0;
    const playerJustLoadedWithTilesPresent = playersJustLoaded && (foundationsWerePresent || wallsWerePresent);
    
    // CRITICAL FIX: Check if we now have BOTH players AND foundations/walls present,
    // but the cache was calculated when one was missing. This handles race conditions
    // where data loads in different orders on login.
    const hasPlayersNow = visiblePlayers.length > 0;
    const hasTilesNow = visibleFoundationCells.length > 0 || visibleWallCells.length > 0;
    const hadPlayersBefore = ySortedCache.lastEntityCounts && (ySortedCache.lastEntityCounts.players || 0) > 0;
    const hadTilesBefore = ySortedCache.lastEntityCounts && 
      ((ySortedCache.lastEntityCounts.foundationCells || 0) > 0 || 
       (ySortedCache.lastEntityCounts.wallCells || 0) > 0);
    
    // CRITICAL FIX: Force recalculation when wall count increases (new wall placed)
    const wallCountIncreased = ySortedCache.lastEntityCounts && 
      visibleWallCells.length > (ySortedCache.lastEntityCounts.wallCells || 0);
    
    // CRITICAL FIX: Force recalculation when foundation count increases (new foundation placed)
    const foundationCountIncreased = ySortedCache.lastEntityCounts && 
      visibleFoundationCells.length > (ySortedCache.lastEntityCounts.foundationCells || 0);
    const bothPresentNowButNotBefore = hasPlayersNow && hasTilesNow && (!hadPlayersBefore || !hadTilesBefore);
    
    // CRITICAL FIX: When we have both players and tiles, ALWAYS re-sort every frame
    // This fixes the subscription timing issue where foundation/wall data loads asynchronously
    // via chunk subscriptions after the initial sort, causing players to render below tiles
    // The cache prevents re-sorting when data arrives, so we disable caching in this case
    const hasBothPlayersAndTiles = hasPlayersNow && hasTilesNow;
    
    // Check if we need to resort
    const needsResort = ySortedCache.isDirty || 
                       (frameCounter - ySortedCache.lastUpdateFrame) > 10 || // Force resort every 10 frames
                       hasEntityCountChanged(currentEntityCounts) ||
                       foundationsJustLoaded || // Force resort when foundations first load
                       wallsJustLoaded || // Force resort when walls first load
                       wallCountIncreased || // CRITICAL: Force resort when new wall is placed
                       foundationCountIncreased || // CRITICAL: Force resort when new foundation is placed
                       playerJustLoadedWithTilesPresent || // Force resort when player loads with tiles already present
                       bothPresentNowButNotBefore || // Force resort when both players and tiles are now present but weren't both before
                       hasBothPlayersAndTiles; // CRITICAL: Always resort when both are present (disables cache)
    
    // CRITICAL FIX: Disable cache when we have both players and tiles
    // This ensures correct sorting when subscription data loads asynchronously
    // Only use cache if we DON'T have both players and tiles AND nothing else requires resorting
    if (!needsResort && ySortedCache.entities.length > 0) {
      // Use cached result - huge performance gain!
      return ySortedCache.entities;
    }
    
    // PERFORMANCE: Pre-allocate array with known size to avoid dynamic resizing
    const allEntities: YSortedEntityType[] = new Array(totalEntities);
    let index = 0;
    
    // Aggregate all entity types into a single array
    visiblePlayers.forEach(e => allEntities[index++] = { type: 'player', entity: e });
    visibleTrees.forEach(e => allEntities[index++] = { type: 'tree', entity: e });
    visibleStones.forEach(e => { if (e.health > 0) allEntities[index++] = { type: 'stone', entity: e }; });
    visibleWoodenStorageBoxes.forEach(e => allEntities[index++] = { type: 'wooden_storage_box', entity: e });
    visibleStashes.forEach(e => allEntities[index++] = { type: 'stash', entity: e });
    visibleCampfires.forEach(e => allEntities[index++] = { type: 'campfire', entity: e });
    visibleFurnaces.forEach(e => allEntities[index++] = { type: 'furnace', entity: e });
    visibleLanterns.forEach(e => allEntities[index++] = { type: 'lantern', entity: e });
    visibleHomesteadHearths.forEach(e => allEntities[index++] = { type: 'homestead_hearth', entity: e }); // ADDED: Homestead Hearths
    visibleGrass.forEach(e => allEntities[index++] = { type: 'grass', entity: e });
    visiblePlantedSeeds.forEach(e => allEntities[index++] = { type: 'planted_seed', entity: e });
    visibleDroppedItems.forEach(e => allEntities[index++] = { type: 'dropped_item', entity: e });
    visibleHarvestableResources.forEach(e => allEntities[index++] = { type: 'harvestable_resource', entity: e });
    visibleRainCollectors.forEach(e => allEntities[index++] = { type: 'rain_collector', entity: e });
    visibleProjectiles.forEach(e => allEntities[index++] = { type: 'projectile', entity: e });
    visibleViperSpittles.forEach(e => allEntities[index++] = { type: 'viper_spittle', entity: e });
    visibleAnimalCorpses.forEach(e => allEntities[index++] = { type: 'animal_corpse', entity: e });
    visiblePlayerCorpses.forEach(e => allEntities[index++] = { type: 'player_corpse', entity: e });
    visibleWildAnimals.forEach(e => allEntities[index++] = { type: 'wild_animal', entity: e });
    visibleBarrels.forEach(e => allEntities[index++] = { type: 'barrel', entity: e });
    visibleSleepingBags.forEach(e => allEntities[index++] = { type: 'sleeping_bag', entity: e }); // ADDED: Sleeping bags
    visibleSeaStacks.forEach(e => allEntities[index++] = { type: 'sea_stack', entity: e });
    visibleShelters.forEach(e => allEntities[index++] = { type: 'shelter', entity: e });
    visibleFoundationCells.forEach(e => allEntities[index++] = { type: 'foundation_cell', entity: e }); // ADDED: Foundations
    visibleWallCells.forEach(e => allEntities[index++] = { type: 'wall_cell', entity: e }); // ADDED: Walls

    // Trim array to actual size in case some entities were filtered out (e.g., stones with 0 health)
    allEntities.length = index;
    
    // PERFORMANCE: Sort the array in-place.
    // The comparator function will call helpers, which is computationally more expensive
    // than the old method, but it avoids massive memory allocation, which is the
    // likely cause of the garbage-collection lag spikes.
    allEntities.sort((a, b) => {
      // CRITICAL FIX: Explicitly check if a player is on the same tile as a foundation/wall
      // For foundations and east/west walls: player ALWAYS renders after (above)
      // For north/south walls: wall renders after (above) player ONLY when player is on the correct side
      if (a.type === 'player' && b.type === 'wall_cell') {
        const player = a.entity as SpacetimeDBPlayer;
        const wall = b.entity as SpacetimeDBWallCell;
        const FOUNDATION_TILE_SIZE = 96;
        const foundationTopY = wall.cellY * FOUNDATION_TILE_SIZE;
        const foundationBottomY = foundationTopY + FOUNDATION_TILE_SIZE;
        const isTriangle = wall.foundationShape >= 2 && wall.foundationShape <= 5;
        
        // For triangle foundations, always check if player is near the wall
        // Triangle walls extend beyond the foundation, so we need to check a wider area
        if (isTriangle) {
          const foundationLeftX = wall.cellX * FOUNDATION_TILE_SIZE;
          const foundationRightX = foundationLeftX + FOUNDATION_TILE_SIZE;
          const playerTileX = Math.floor(player.positionX / 48);
          const playerTileY = Math.floor(player.positionY / 48);
          const foundationTileMinX = Math.floor(foundationLeftX / 48);
          const foundationTileMaxX = Math.floor(foundationRightX / 48);
          const foundationTileMinY = Math.floor(foundationTopY / 48);
          const foundationTileMaxY = Math.floor(foundationBottomY / 48);
          
          // Check if player is on foundation tile or adjacent tiles (wider range for triangles)
          const isNearTriangleWall = playerTileX >= foundationTileMinX - 1 && 
                                     playerTileX <= foundationTileMaxX + 1 &&
                                     playerTileY >= foundationTileMinY - 1 && 
                                     playerTileY <= foundationTileMaxY + 1;
          
          if (!isNearTriangleWall) {
            // Player is too far, let normal Y-sorting handle it
            // Continue to next check
          }
        }
        
        // For triangle foundations, handle ALL edges with special logic
        if (isTriangle) {
          // Triangle walls are slanted - need direction-based sorting
          // When player is south of foundation bottom, player should be in front (render above wall)
          // When player is north of foundation bottom, wall should be in front (render above player)
          const foundationCenterY = foundationTopY + FOUNDATION_TILE_SIZE / 2;
          
          if (player.positionY > foundationBottomY) {
            // Player is clearly south - player renders above wall
            return 1; // Player renders after (above) wall
          } else if (player.positionY < foundationTopY) {
            // Player is clearly north - wall renders above player
            return -1; // Wall renders after (above) player
          } else {
            // Player is on or near foundation - use center as threshold
            if (player.positionY > foundationCenterY) {
              return 1; // Player renders after (above) wall
            } else {
              return -1; // Wall renders after (above) player
            }
          }
        } else if (wall.edge === 0) {
          // North wall (cardinal): Check if player is near the wall
          if (isPlayerNearWall(player, wall)) {
            // When player is south of foundation (positionY > foundationBottomY):
            // Player is closer to camera, so player should render above wall (player in front)
            // Return -1 means player (a) renders before wall (b), so player is above wall
            if (player.positionY > foundationBottomY) {
              return -1; // Player renders before wall, so player is above wall
            }
            // When player is north of foundation (positionY < foundationBottomY):
            // Wall is closer to camera, so wall should render above player (wall in front)
            // Return 1 means player (a) renders after wall (b), so wall is above player
            if (player.positionY < foundationBottomY) {
              return 1; // Player renders after wall, so wall is above player
            }
          }
        } else if (wall.edge === 2) {
          // South wall (cardinal): Check if player is on same tile or adjacent
          if (isPlayerNearWall(player, wall)) {
            // South wall: wall renders after (above) player ONLY if player is south of the wall
            // Check if player Y is greater than the foundation center (player is south of wall)
            const foundationCenterY = foundationTopY + FOUNDATION_TILE_SIZE / 2;
            if (player.positionY > foundationCenterY) {
              return -1; // Wall renders after (above) player
            }
          }
        }
        // East/west walls and other cases: let normal Y-sorting handle it
      }
      if (b.type === 'player' && a.type === 'wall_cell') {
        const player = b.entity as SpacetimeDBPlayer;
        const wall = a.entity as SpacetimeDBWallCell;
        const FOUNDATION_TILE_SIZE = 96;
        const foundationTopY = wall.cellY * FOUNDATION_TILE_SIZE;
        const foundationBottomY = foundationTopY + FOUNDATION_TILE_SIZE;
        const isTriangle = wall.foundationShape >= 2 && wall.foundationShape <= 5;
        
        // For triangle foundations, always check if player is near the wall
        if (isTriangle) {
          const foundationLeftX = wall.cellX * FOUNDATION_TILE_SIZE;
          const foundationRightX = foundationLeftX + FOUNDATION_TILE_SIZE;
          const playerTileX = Math.floor(player.positionX / 48);
          const playerTileY = Math.floor(player.positionY / 48);
          const foundationTileMinX = Math.floor(foundationLeftX / 48);
          const foundationTileMaxX = Math.floor(foundationRightX / 48);
          const foundationTileMinY = Math.floor(foundationTopY / 48);
          const foundationTileMaxY = Math.floor(foundationBottomY / 48);
          
          // Check if player is on foundation tile or adjacent tiles (wider range for triangles)
          const isNearTriangleWall = playerTileX >= foundationTileMinX - 1 && 
                                     playerTileX <= foundationTileMaxX + 1 &&
                                     playerTileY >= foundationTileMinY - 1 && 
                                     playerTileY <= foundationTileMaxY + 1;
          
          if (!isNearTriangleWall) {
            // Player is too far, let normal Y-sorting handle it
            // Continue to next check
          }
        }
        
        // For triangle foundations, handle ALL edges with special logic FIRST
        if (isTriangle) {
          // Triangle walls are slanted - need direction-based sorting
          // When player is south of foundation bottom, player should be in front (render above wall)
          // When player is north of foundation bottom, wall should be in front (render above player)
          const foundationCenterY = foundationTopY + FOUNDATION_TILE_SIZE / 2;
          
          if (player.positionY > foundationBottomY) {
            // Player is clearly south - player renders above wall
            return -1; // Player renders after (above) wall (inverted for this comparator)
          } else if (player.positionY < foundationTopY) {
            // Player is clearly north - wall renders above player
            return 1; // Wall renders after (above) player (inverted for this comparator)
          } else {
            // Player is on or near foundation - use center as threshold
            if (player.positionY > foundationCenterY) {
              return -1; // Player renders after (above) wall (inverted for this comparator)
            } else {
              return 1; // Wall renders after (above) player (inverted for this comparator)
            }
          }
        } else if (wall.edge === 0) {
          // North wall (cardinal): Check if player is near the wall (inverted comparator)
          if (isPlayerNearWall(player, wall)) {
            // When player is south of foundation (positionY > foundationBottomY):
            // Player is closer to camera, so player should render above wall (player in front)
            // In this comparator, a is wall and b is player, so return 1 means wall renders after player (player above)
            if (player.positionY > foundationBottomY) {
              return 1; // Wall renders after player, so player is above wall
            }
            // When player is north of foundation (positionY < foundationBottomY):
            // Wall is closer to camera, so wall should render above player (wall in front)
            // Return -1 means wall (a) renders before player (b), so wall is above player
            if (player.positionY < foundationBottomY) {
              return -1; // Wall renders before player, so wall is above player
            }
          }
        } else if (wall.edge === 2) {
          // South wall (cardinal): Check if player is on same tile or adjacent
          if (isPlayerNearWall(player, wall)) {
            // South wall: wall renders after (above) player ONLY if player is south of the wall
            const foundationCenterY = foundationTopY + FOUNDATION_TILE_SIZE / 2;
            if (player.positionY > foundationCenterY) {
              return 1; // Wall renders after (above) player
            }
          }
        }
        // East/west walls and other cases: let normal Y-sorting handle it
      }
      // Ensure east/west walls render above north walls (3/4 perspective)
      if (a.type === 'wall_cell' && b.type === 'wall_cell') {
        const wallA = a.entity as SpacetimeDBWallCell;
        const wallB = b.entity as SpacetimeDBWallCell;
        // If walls are on the same tile, east/west should render above north/south
        if (wallA.cellX === wallB.cellX && wallA.cellY === wallB.cellY) {
          const isA_EastWest = wallA.edge === 1 || wallA.edge === 3;
          const isB_EastWest = wallB.edge === 1 || wallB.edge === 3;
          const isA_NorthSouth = wallA.edge === 0 || wallA.edge === 2;
          const isB_NorthSouth = wallB.edge === 0 || wallB.edge === 2;
          
          // If A is east/west and B is north/south, A renders after (above)
          if (isA_EastWest && isB_NorthSouth) {
            return 1;
          }
          // If B is east/west and A is north/south, B renders after (above)
          if (isB_EastWest && isA_NorthSouth) {
            return -1;
          }
        }
      }
      if (a.type === 'player' && b.type === 'foundation_cell') {
        const player = a.entity as SpacetimeDBPlayer;
        const foundation = b.entity as SpacetimeDBFoundationCell;
        if (isPlayerOnSameTileAsBuilding(player, foundation)) {
          return 1; // Player renders after (above) foundation
        }
      }
      if (b.type === 'player' && a.type === 'foundation_cell') {
        const player = b.entity as SpacetimeDBPlayer;
        const foundation = a.entity as SpacetimeDBFoundationCell;
        if (isPlayerOnSameTileAsBuilding(player, foundation)) {
          return -1; // Player renders after (above) foundation
        }
      }
      
      // CRITICAL FIX: Placeable objects should ALWAYS render above north walls (edge 0)
      // North walls extend upward visually, so placeables should always render on top
      // Simple rule: if it's a north wall and a placeable object, placeable always wins
      const placeableObjectTypes: Array<YSortedEntityType['type']> = [
        'campfire', 'furnace', 'lantern', 'homestead_hearth', 'wooden_storage_box', 
        'stash', 'barrel', 'rain_collector', 'sleeping_bag'
      ];
      
      if (placeableObjectTypes.includes(a.type) && b.type === 'wall_cell') {
        const wall = b.entity as SpacetimeDBWallCell;
        // For north walls (edge 0), always render placeable above
        if (wall.edge === 0) {
          return 1; // Placeable renders after (above) north wall
        }
      }
      
      if (placeableObjectTypes.includes(b.type) && a.type === 'wall_cell') {
        const wall = a.entity as SpacetimeDBWallCell;
        // For north walls (edge 0), always render placeable above
        if (wall.edge === 0) {
          return -1; // Placeable renders after (above) north wall
        }
      }
      
      const yA = getEntityY(a, stableTimestamp);
      const yB = getEntityY(b, stableTimestamp);
      
      // CRITICAL FIX: Handle NaN values that break sorting
      if (isNaN(yA) || isNaN(yB)) {
        console.warn('[ySortedEntities] Invalid Y values detected:', { 
          typeA: a.type, yA, 
          typeB: b.type, yB,
          entityA: a.entity,
          entityB: b.entity
        });
        // Fallback: use priority sorting if Y values are invalid
        return getEntityPriority(b) - getEntityPriority(a);
      }
      
      // Primary sort by Y position
      const yDiff = yA - yB;
      if (Math.abs(yDiff) > 0.1) {
        return yDiff;
      }
      
      // Secondary sort by priority when Y positions are close
      return getEntityPriority(b) - getEntityPriority(a);
    });
    
    // PERFORMANCE: Update cache with new sorted result
    ySortedCache.entities = allEntities;
    ySortedCache.lastUpdateFrame = frameCounter;
    ySortedCache.lastEntityCounts = currentEntityCounts;
    ySortedCache.lastFoundationMapSize = foundationCells?.size || 0;
    ySortedCache.lastWallMapSize = wallCells?.size || 0;
    ySortedCache.isDirty = false;
    
    return allEntities;
  },
    // Dependencies for cached Y-sorting
    [visiblePlayers, visibleTrees, visibleStones, visibleWoodenStorageBoxes, 
    visiblePlayerCorpses, visibleStashes, 
    visibleCampfires, visibleFurnaces, visibleLanterns, visibleDroppedItems,
    visibleProjectiles, visibleGrass,
    visibleShelters,
    visiblePlantedSeeds,
    visibleRainCollectors,
    visibleWildAnimals,
    visibleViperSpittles,
    visibleAnimalCorpses,
    visibleBarrels,
    visibleSeaStacks,
    visibleHarvestableResources,
    visibleFoundationCells, // ADDED: Foundations dependency
    visibleWallCells, // ADDED: Walls dependency
    foundationCells, // CRITICAL: Depend on raw map to detect when data loads
    foundationMapSize, // CRITICAL: Depend on map size to detect when subscription data arrives
    wallCells, // CRITICAL: Depend on raw map to detect when data loads
    wallMapSize, // CRITICAL: Depend on map size to detect when subscription data arrives
    playerMapSize, // CRITICAL: Depend on player map size to detect when player data loads
    stableTimestamp, // Only include stableTimestamp for projectile calculations
    hasEntityCountChanged, // Add callback dependency
    frameCounter // Add frame counter for cache invalidation
  ]);

  // Emergency mode removed

  return {
    visibleHarvestableResources,
    visibleDroppedItems,
    visibleCampfires,
    visibleFurnaces, // ADDED: Furnaces
    visibleLanterns,
    visibleHomesteadHearths, // ADDED: Homestead Hearths
    visiblePlayers,
    visibleTrees,
    visibleStones,
    visibleWoodenStorageBoxes,
    visibleSleepingBags,
    visiblePlayerCorpses,
    visibleStashes,
    visibleProjectiles,
    visibleHarvestableResourcesMap,
    visibleCampfiresMap,
    visibleFurnacesMap, // ADDED: Furnaces map
    visibleLanternsMap,
    visibleHomesteadHearthsMap, // ADDED: Homestead Hearths map
    visibleDroppedItemsMap,
    visibleBoxesMap,
    visibleProjectilesMap,
    visiblePlayerCorpsesMap,
    visibleStashesMap,
    visibleSleepingBagsMap,
    visibleTreesMap,
    groundItems,
    ySortedEntities,
    visibleGrass,
    visibleGrassMap,
    visibleShelters,
    visibleSheltersMap,
    visibleClouds,
    visiblePlantedSeeds,
    visiblePlantedSeedsMap,
    visibleRainCollectors,
    visibleRainCollectorsMap,
    visibleWildAnimals,
    visibleWildAnimalsMap,
    visibleViperSpittles,
    visibleViperSpittlesMap,
    visibleAnimalCorpses,
    visibleAnimalCorpsesMap,
    visibleBarrels,
    visibleBarrelsMap,
    visibleSeaStacks, 
    visibleSeaStacksMap,
    visibleFoundationCells,
    visibleFoundationCellsMap,
    visibleWallCells,
    visibleWallCellsMap,
  };
} 