import { useMemo, useCallback } from 'react';
import { Timestamp } from 'spacetimedb';
import { gameConfig, FOUNDATION_TILE_SIZE, foundationCellToWorldCenter } from '../config/gameConfig';

/**
 * Helper to check if a respawnAt timestamp indicates the entity is NOT respawning.
 * After the schema change, respawnAt is always a Timestamp.
 * UNIX_EPOCH (microsSinceUnixEpoch === 0n) means "not respawning" (alive/available).
 * Any positive value means "respawning" (destroyed/harvested, waiting to respawn).
 */
export const isNotRespawning = (respawnAt: Timestamp | null | undefined): boolean => {
  if (respawnAt === null || respawnAt === undefined) return true;
  return respawnAt.microsSinceUnixEpoch === 0n;
};
import {
  Player as SpacetimeDBPlayer,
  Tree as SpacetimeDBTree,
  Stone as SpacetimeDBStone,
  RuneStone as SpacetimeDBRuneStone,
  Cairn as SpacetimeDBCairn,
  Campfire as SpacetimeDBCampfire,
  Furnace as SpacetimeDBFurnace, // ADDED: Furnace import
  Barbecue as SpacetimeDBBarbecue, // ADDED: Barbecue import
  Lantern as SpacetimeDBLantern,
  Turret as SpacetimeDBTurret, // ADDED: Turret import
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
  BrothPot as SpacetimeDBBrothPot,
  WildAnimal as SpacetimeDBWildAnimal,
  AnimalCorpse as SpacetimeDBAnimalCorpse,
  Barrel as SpacetimeDBBarrel, // ADDED Barrel type
  FoundationCell as SpacetimeDBFoundationCell, // ADDED: Building foundations
  WallCell as SpacetimeDBWallCell, // ADDED: Building walls
  Door as SpacetimeDBDoor, // ADDED: Building doors
  Fence as SpacetimeDBFence, // ADDED: Building fences
  Fumarole as SpacetimeDBFumarole, // ADDED: Fumaroles (geothermal vents)
  BasaltColumn as SpacetimeDBBasaltColumn, // ADDED: Basalt columns (decorative obstacles)
  AlkStation as SpacetimeDBAlkStation, // ADDED: ALK delivery stations
  // StormPile removed - storms now spawn HarvestableResources and DroppedItems directly
  LivingCoral as SpacetimeDBLivingCoral, // Living coral for underwater harvesting (uses combat system)
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
import { COMPOUND_BUILDINGS, getBuildingWorldPosition, getBuildingYSortPosition, getAllCompoundBuildings } from '../config/compoundBuildings'; // Import compound buildings config
import { hasActiveStoneDestruction, checkStoneDestructionVisibility } from '../utils/renderers/stoneRenderingUtils'; // Import stone destruction tracking
import { hasActiveCoralDestruction, checkCoralDestructionVisibility } from '../utils/renderers/livingCoralRenderingUtils'; // Import coral destruction tracking
import { BOX_TYPE_LARGE, BOX_TYPE_COMPOST, BOX_TYPE_REPAIR_BENCH, BOX_TYPE_COOKING_STATION, BOX_TYPE_SCARECROW } from '../utils/renderers/woodenStorageBoxRenderingUtils'; // Import box type constants for y-sorting
// Ward radius constants for expanded viewport filtering (to render ward circles even when ward is off-screen)
import { 
  LANTERN_TYPE_LANTERN,
  ANCESTRAL_WARD_RADIUS_PX, 
  SIGNAL_DISRUPTOR_RADIUS_PX, 
  MEMORY_BEACON_RADIUS_PX 
} from '../utils/renderers/lanternRenderingUtils';

export interface ViewportBounds {
  viewMinX: number;
  viewMaxX: number;
  viewMinY: number;
  viewMaxY: number;
}

// Import building visibility utilities
import { getBuildingClusters, getPlayerBuildingClusterId, shouldMaskFoundation, detectEntranceWayFoundations, detectNorthWallFoundations, detectSouthWallFoundations, type BuildingCluster } from '../utils/buildingVisibilityUtils';

interface EntityFilteringResult {
  visibleHarvestableResources: SpacetimeDBHarvestableResource[];
  visibleDroppedItems: SpacetimeDBDroppedItem[];
  visibleCampfires: SpacetimeDBCampfire[];
  visibleFurnaces: SpacetimeDBFurnace[]; // ADDED: Furnaces
  visibleBarbecues: SpacetimeDBBarbecue[]; // ADDED: Barbecues
  visibleHomesteadHearths: SpacetimeDBHomesteadHearth[]; // ADDED: Homestead Hearths
  visiblePlayers: SpacetimeDBPlayer[];
  visibleTrees: SpacetimeDBTree[];
  visibleStones: SpacetimeDBStone[];
  visibleRuneStones: SpacetimeDBRuneStone[];
  visibleCairns: SpacetimeDBCairn[];
  visibleCairnsMap: Map<string, SpacetimeDBCairn>;
  visibleWoodenStorageBoxes: SpacetimeDBWoodenStorageBox[];
  visibleSleepingBags: SpacetimeDBSleepingBag[];
  visibleProjectiles: SpacetimeDBProjectile[];
  visibleHarvestableResourcesMap: Map<string, SpacetimeDBHarvestableResource>;
  visibleCampfiresMap: Map<string, SpacetimeDBCampfire>;
  visibleFurnacesMap: Map<string, SpacetimeDBFurnace>; // ADDED: Furnaces map
  visibleBarbecuesMap: Map<string, SpacetimeDBBarbecue>; // ADDED: Barbecues map
  visibleLanternsMap: Map<string, SpacetimeDBLantern>;
  visibleTurrets: SpacetimeDBTurret[]; // ADDED: Turrets
  visibleTurretsMap: Map<string, SpacetimeDBTurret>; // ADDED: Turrets map
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
  visibleRuneStonesMap: Map<string, SpacetimeDBRuneStone>;
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
  visibleBrothPots: SpacetimeDBBrothPot[];
  visibleBrothPotsMap: Map<string, SpacetimeDBBrothPot>;
  visibleWildAnimals: SpacetimeDBWildAnimal[]; // ADDED
  visibleWildAnimalsMap: Map<string, SpacetimeDBWildAnimal>; // ADDED
  visibleAnimalCorpses: SpacetimeDBAnimalCorpse[]; // ADDED
  visibleAnimalCorpsesMap: Map<string, SpacetimeDBAnimalCorpse>; // ADDED
  visibleBarrels: SpacetimeDBBarrel[]; // ADDED
  visibleBarrelsMap: Map<string, SpacetimeDBBarrel>; // ADDED
  visibleFumaroles: SpacetimeDBFumarole[]; // ADDED
  visibleFumerolesMap: Map<string, SpacetimeDBFumarole>; // ADDED
  visibleBasaltColumns: SpacetimeDBBasaltColumn[]; // ADDED
  visibleBasaltColumnsMap: Map<string, SpacetimeDBBasaltColumn>; // ADDED
  visibleSeaStacks: any[]; // ADDED
  visibleSeaStacksMap: Map<string, any>; // ADDED
  visibleAlkStations: SpacetimeDBAlkStation[]; // ADDED: ALK delivery stations
  visibleAlkStationsMap: Map<string, SpacetimeDBAlkStation>; // ADDED: ALK delivery stations map
  visibleFoundationCells: SpacetimeDBFoundationCell[]; // ADDED: Building foundations
  visibleFoundationCellsMap: Map<string, SpacetimeDBFoundationCell>; // ADDED: Building foundations map
  visibleWallCells: SpacetimeDBWallCell[]; // ADDED: Building walls
  visibleWallCellsMap: Map<string, SpacetimeDBWallCell>; // ADDED: Building walls map
  visibleDoors: SpacetimeDBDoor[]; // ADDED: Building doors
  visibleDoorsMap: Map<string, SpacetimeDBDoor>; // ADDED: Building doors map
  visibleFences: SpacetimeDBFence[]; // ADDED: Building fences
  visibleFencesMap: Map<string, SpacetimeDBFence>; // ADDED: Building fences map
  buildingClusters: Map<string, BuildingCluster>; // ADDED: Building clusters for fog of war
  playerBuildingClusterId: string | null; // ADDED: Which building cluster the player is in
  // StormPile removed - storms now spawn HarvestableResources and DroppedItems directly
  visibleLivingCorals: SpacetimeDBLivingCoral[]; // Living corals (uses combat system)
  visibleLivingCoralsMap: Map<string, SpacetimeDBLivingCoral>; // Living corals map
}

// Define a unified entity type for sorting
export type YSortedEntityType =
  | { type: 'player'; entity: SpacetimeDBPlayer }
  | { type: 'tree'; entity: SpacetimeDBTree }
  | { type: 'stone'; entity: SpacetimeDBStone }
  | { type: 'rune_stone'; entity: SpacetimeDBRuneStone }
  | { type: 'cairn'; entity: SpacetimeDBCairn }
  | { type: 'wooden_storage_box'; entity: SpacetimeDBWoodenStorageBox }
  | { type: 'player_corpse'; entity: SpacetimeDBPlayerCorpse }
  | { type: 'stash'; entity: SpacetimeDBStash }
  | { type: 'harvestable_resource'; entity: SpacetimeDBHarvestableResource }
  | { type: 'campfire'; entity: SpacetimeDBCampfire }
  | { type: 'furnace'; entity: SpacetimeDBFurnace } // ADDED: Furnace type
  | { type: 'barbecue'; entity: SpacetimeDBBarbecue } // ADDED: Barbecue type
  | { type: 'lantern'; entity: SpacetimeDBLantern }
  | { type: 'turret'; entity: SpacetimeDBTurret } // ADDED: Turret type
  | { type: 'homestead_hearth'; entity: SpacetimeDBHomesteadHearth } // ADDED: Homestead Hearth type
  | { type: 'dropped_item'; entity: SpacetimeDBDroppedItem }
  | { type: 'projectile'; entity: SpacetimeDBProjectile }
  | { type: 'shelter'; entity: SpacetimeDBShelter }
  | { type: 'grass'; entity: InterpolatedGrassData }
  | { type: 'planted_seed'; entity: SpacetimeDBPlantedSeed }
  | { type: 'rain_collector'; entity: SpacetimeDBRainCollector }
  | { type: 'broth_pot'; entity: SpacetimeDBBrothPot }
  | { type: 'wild_animal'; entity: SpacetimeDBWildAnimal }
  | { type: 'animal_corpse'; entity: SpacetimeDBAnimalCorpse }
  | { type: 'barrel'; entity: SpacetimeDBBarrel }
  | { type: 'sea_stack'; entity: any } // Server-provided sea stack entities
  | { type: 'sleeping_bag'; entity: SpacetimeDBSleepingBag } // ADDED: Sleeping bags
  | { type: 'foundation_cell'; entity: SpacetimeDBFoundationCell } // ADDED: Building foundations
  | { type: 'wall_cell'; entity: SpacetimeDBWallCell } // ADDED: Building walls
  | { type: 'door'; entity: SpacetimeDBDoor } // ADDED: Building doors
  | { type: 'fence'; entity: SpacetimeDBFence } // ADDED: Building fences
  | { type: 'fog_overlay'; entity: { clusterId: string; bounds: { minX: number; minY: number; maxX: number; maxY: number }; entranceWayFoundations?: string[]; clusterFoundationCoords?: string[]; northWallFoundations?: string[]; southWallFoundations?: string[] } } // ADDED: Fog of war overlay (renders above placeables, below walls)
  | { type: 'fumarole'; entity: SpacetimeDBFumarole } // ADDED: Fumaroles (geothermal vents in quarries)
  | { type: 'basalt_column'; entity: SpacetimeDBBasaltColumn } // ADDED: Basalt columns (decorative obstacles in quarries)
  | { type: 'alk_station'; entity: SpacetimeDBAlkStation } // ADDED: ALK delivery stations
  | { type: 'compound_building'; entity: CompoundBuildingEntity } // ADDED: Static compound buildings
  // StormPile removed - storms now spawn HarvestableResources and DroppedItems directly
  | { type: 'living_coral'; entity: SpacetimeDBLivingCoral }; // Living coral reefs (uses combat system)

// Type for compound buildings in Y-sorted system
export interface CompoundBuildingEntity {
  id: string;
  worldX: number;
  worldY: number;
  width: number;
  height: number;
  imagePath: string;
  anchorYOffset: number;
  isCenter?: boolean; // For monuments: marks the center piece for building restriction overlay
}

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
    case 'stash':
    case 'campfire':
    case 'furnace':
    case 'barbecue': // ADDED: Barbecue (same as campfire)
    case 'lantern':
    case 'homestead_hearth': // ADDED: Homestead Hearth (same as campfire)
    case 'planted_seed':
    case 'dropped_item':
    case 'harvestable_resource':
      // Resources (piles): Subtract offset to ensure they render before monuments (underneath)
      // This ensures stone piles, wood piles, etc. render under buildings
      return entity.posY - 100;
    case 'wooden_storage_box': {
      // Tall box types (repair bench, cooking station, scarecrow, compost, large)
      // need proper y-sorting using actual posY so player walks behind them correctly.
      // Small/flat boxes keep the -100 offset to render under buildings.
      const box = entity as SpacetimeDBWoodenStorageBox;
      if (box.boxType === BOX_TYPE_LARGE ||
          box.boxType === BOX_TYPE_COMPOST ||
          box.boxType === BOX_TYPE_REPAIR_BENCH ||
          box.boxType === BOX_TYPE_COOKING_STATION ||
          box.boxType === BOX_TYPE_SCARECROW) {
        return entity.posY;
      }
      return entity.posY - 100;
    }
    case 'rain_collector':
    case 'animal_corpse':
    case 'player_corpse':
    case 'wild_animal':
    case 'barrel':
    case 'sleeping_bag':
    case 'fumarole': // ADDED: Fumaroles sort by Y position (ground-level vents)
    case 'basalt_column': // ADDED: Basalt columns sort by Y position (tall obstacles)
    // storm_pile removed - storms now spawn HarvestableResources and DroppedItems directly
    case 'living_coral': // Living coral reefs sort by Y position (uses combat system)
      // CRITICAL FIX: Use actual Y position for proper depth sorting relative to players
      // The +10000 offset was causing everything to always render above players
      // Now placeables sort correctly based on their actual world Y position
      return entity.posY;
    case 'turret':
      // Turret: 256x256 sprite centered on posY, visual base (wooden platform) is ~80px below center
      // Y-sort by the visual base so players in front render correctly
      return entity.posY + 80;
    case 'broth_pot':
      // CRITICAL: Broth pot sits ON TOP of campfires/fumaroles (same posY position).
      // Adding a significant offset (10) ensures broth_pot ALWAYS sorts AFTER its heat source
      // through natural Y-sorting. The offset must be large enough to survive the sort
      // algorithm's partitioning, but small enough not to affect sorting relative to
      // entities that are actually at different Y positions (10px is within visual overlap).
      return entity.posY + 10;
    case 'cairn': {
      // Cairns: posY is the visual base (where stones meet ground), but the sprite
      // has extra space at the bottom. The visual base is offset upward from sprite bottom.
      // Use posY directly for Y-sorting (it already represents the visual base).
      const cairn = entity as SpacetimeDBCairn;
      return cairn.posY; // posY is already the visual base position
    }
    case 'alk_station': {
      // ALK stations: worldPosY is the sprite's BOTTOM, but the visual "foot level" 
      // (where players walk) is much HIGHER due to:
      // 1. ~24% transparent space at top of 1024px source image
      // 2. Building's architectural base/stairs extending above ground level
      // The collision center is offset 170px up from worldPosY, so the visual foot
      // is roughly there. Use this for Y-sorting so players in front render correctly.
      const alkStation = entity as SpacetimeDBAlkStation;
      const ALK_STATION_VISUAL_FOOT_OFFSET = 170; // Match collision Y offset
      return alkStation.worldPosY - ALK_STATION_VISUAL_FOOT_OFFSET;
    }
    case 'compound_building': {
      // Compound buildings: Use 87.5% height threshold for Y-sorting
      // Monument images are squares (256x256) but actual visual content is in the bottom portion
      // Player should be BEHIND when in top 87.5%, IN FRONT only when in bottom 12.5%
      // Sprite visual bounds: top = worldY - height + anchorYOffset, bottom = worldY + anchorYOffset
      // 87.5% threshold = worldY - (height * 0.125) + anchorYOffset (only bottom 12.5% = player in front)
      // Add offset to ensure monuments render above resources (piles) when at similar Y positions
      const building = entity as CompoundBuildingEntity;
      const sortThresholdY = building.worldY - (building.height * 0.125) + (building.anchorYOffset || 0);
      return sortThresholdY + 50; // Add offset to ensure monuments render after resources (on top)
    }
    case 'foundation_cell': {
      // Foundation cells use cell coordinates - convert to world pixel Y
      // Use top edge of tile (cellY * 48) to ensure foundations render below players
      // Players standing on foundations will have positionY at or near the top edge
      const foundation = entity as SpacetimeDBFoundationCell;
      return foundation.cellY * 48; // TILE_SIZE = 48, use top edge for Y-sorting
    }
    case 'fog_overlay': {
      // Fog overlays must ALWAYS render above placeables but BELOW walls for realism
      // Use the ACTUAL center Y of the building cluster for natural Y-sorting
      // The explicit sorting checks (lines 1484-1489) ensure walls ALWAYS render above fog
      // Using the actual building Y position ensures fog sorts correctly relative to placeables
      const fogEntity = entity as { clusterId: string; bounds: { minX: number; minY: number; maxX: number; maxY: number }; entranceWayFoundations?: string[]; clusterFoundationCoords?: string[]; northWallFoundations?: string[]; southWallFoundations?: string[] };
      // Use center Y of the building for natural sorting
      const centerY = (fogEntity.bounds.minY + fogEntity.bounds.maxY) / 2;
      return centerY;
    }
    case 'door': {
      const door = entity as SpacetimeDBDoor;
      const FOUNDATION_TILE_SIZE = 96;
      const foundationTopY = door.cellY * FOUNDATION_TILE_SIZE;
      if (door.edge === 0) {
        // North door: use foundation top - WORKING PERFECTLY
        return foundationTopY;
      } else {
        // South door: use foundation bottom + player sprite height (matches comparator)
        return foundationTopY + FOUNDATION_TILE_SIZE + 48;
      }
    }
    case 'fence': {
      // Fences use world position directly (posX, posY) on 48px tile grid
      const fence = entity as SpacetimeDBFence;
      return fence.posY; // Use tile center Y for sorting
    }
    case 'wall_cell': {
      const wall = entity as SpacetimeDBWallCell;
      const FOUNDATION_TILE_SIZE = 96;
      const baseY = wall.cellY * FOUNDATION_TILE_SIZE;
      const isTriangle = wall.foundationShape >= 2 && wall.foundationShape <= 5;
      
      if (isTriangle) {
        // Triangle walls: use foundation center
        return baseY + FOUNDATION_TILE_SIZE / 2;
      } else if (wall.edge === 0) {
        // North wall: use foundation top - WORKING PERFECTLY
        return baseY;
      } else if (wall.edge === 2) {
        // South wall: use foundation BOTTOM + player sprite height
        // This matches the comparator which checks playerHeadY >= foundationBottomY
        // playerHeadY = playerFeetY - 48, so threshold is foundationBottomY + 48
        return baseY + FOUNDATION_TILE_SIZE + 48;
      } else {
        // East/west walls: use foundation top
        return baseY;
      }
    }
    case 'grass':
      // Grass is a ground-level decoration that should render BEHIND tall objects
      // (trees, stones, basalt columns, etc.). Trees/stones use posY - 100 offset,
      // so grass needs a larger negative offset to ensure it sorts before (behind) them.
      // -200 ensures grass within ~100px south of a tree still renders behind the tree,
      // while grass clearly south (200+ px) will correctly render in front.
      return entity.serverPosY - 200;
    case 'projectile': {
      const startTime = Number(entity.startTime.microsSinceUnixEpoch / 1000n);
      const elapsedSeconds = (timestamp - startTime) / 1000.0;
      return entity.startPosY + entity.velocityY * elapsedSeconds;
    }
    case 'sea_stack':
      return entity.posY;
    case 'shelter':
      return entity.posY - 100;
    case 'rune_stone':
      return entity.posY;
    default:
      return 0;
  }
};

const getEntityPriority = (item: YSortedEntityType): number => {
  switch (item.type) {
    case 'sea_stack': return 1;
    case 'tree': return 2;
    case 'stone': return 3;
    case 'rune_stone': return 3.5; // Render between stones and animals
    case 'cairn': return 3.5; // Render at same priority as rune stones
    case 'wild_animal': {
      // Flying birds should render above everything (trees, stones, players, etc.)
      const animal = item.entity as SpacetimeDBWildAnimal;
      const isBird = animal.species.tag === 'Tern' || animal.species.tag === 'Crow';
      if (isBird && animal.isFlying === true) {
        return 25; // Higher than walls (22-23) and players (21) - renders on top
      }
      return 4; // Normal animals render at priority 4
    }
    case 'wooden_storage_box': return 5;
    case 'stash': return 6;
    case 'campfire': return 7;
    case 'furnace': return 7.5;
    case 'barbecue': return 7.3; // ADDED: Barbecue (between furnace and homestead hearth)
    case 'lantern': return 8;
    case 'homestead_hearth': return 7.2; // ADDED: Homestead Hearth (between furnace and lantern)
    case 'grass': return 9;
    case 'planted_seed': return 10;
    case 'dropped_item': return 11;
    case 'harvestable_resource': return 12;
    case 'sleeping_bag': return 13; // Render after dropped items, before barrels
    case 'barrel': return 15;
    case 'fumarole': return 14; // ADDED: Fumaroles render slightly before barrels (ground vents)
    case 'basalt_column': return 16; // ADDED: Basalt columns render after barrels (tall obstacles)
    // storm_pile removed - storms now spawn HarvestableResources and DroppedItems directly
    case 'living_coral': return 14.5; // Living corals render near fumaroles (underwater, uses combat)
    case 'alk_station': return 2; // ALK stations Y-sort like trees (tall structures with base at worldPosY)
    case 'rain_collector': return 18;
    case 'broth_pot': return 18; // Same as rain collector (similar placeable container)
    case 'foundation_cell': return 0.5; // ADDED: Foundations render early (ground level)
    case 'projectile': return 19;
    case 'animal_corpse': return 20;
    case 'player_corpse': return 20;
    case 'player': return 21; // Players render before fog overlays (below ceiling tiles)
    case 'fog_overlay': return 21.5; // ADDED: Fog overlays render above players (21) but below walls (22+)
    case 'wall_cell': {
      const wall = item.entity as SpacetimeDBWallCell;
      if (wall.edge === 0 || wall.edge === 2) {
        // North/south walls render above players and fog overlays
        return 22; // Render after players (priority 21) and fog (21.5)
      } else {
        // East/west walls render ABOVE north walls (closer to viewer in 3/4 perspective)
        return 23; // Higher priority than north walls (22) to render on top
      }
    }
    case 'door': return 22; // Doors render at same level as walls
    case 'compound_building': return 13; // Monuments render after resources (piles) so they appear on top
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
  const playerTileX = Math.floor(player.positionX / TILE_SIZE);
  const playerTileY = Math.floor(player.positionY / TILE_SIZE);
  
  const foundationCellWorldTileMinX = wall.cellX * 2;
  const foundationCellWorldTileMaxX = wall.cellX * 2 + 1;
  const foundationCellWorldTileMinY = wall.cellY * 2;
  const foundationCellWorldTileMaxY = wall.cellY * 2 + 1;
  
  // Check if player is within X range of the wall (same column +/- 1 tile for margin)
  const isInXRange = playerTileX >= foundationCellWorldTileMinX - 1 && 
                     playerTileX <= foundationCellWorldTileMaxX + 1;
  
  if (!isInXRange) return false;
  
  // Check if player is within Y range: from 2 tiles north to 3 tiles south of foundation
  // This covers all approach directions
  const northBound = foundationCellWorldTileMinY - 2;
  const southBound = foundationCellWorldTileMaxY + 3; // Extended south range for approaching from below
  
  const isInYRange = playerTileY >= northBound && playerTileY <= southBound;
  
  return isInYRange;
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
function getPlayerPosition(
  players: Map<string, SpacetimeDBPlayer>,
  localPlayerId?: string
): { x: number; y: number } | null {
  if (!players || players.size === 0) return null;

  // Prefer the local player if we know their ID
  if (localPlayerId) {
    const localPlayer = players.get(localPlayerId);
    if (localPlayer) {
      return { x: localPlayer.positionX, y: localPlayer.positionY };
    }
  }

  // Fallback: use the first available player (e.g., in spectator mode)
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
  runeStones: Map<string, SpacetimeDBRuneStone>,
  cairns: Map<string, SpacetimeDBCairn>,
  campfires: Map<string, SpacetimeDBCampfire>,
  furnaces: Map<string, SpacetimeDBFurnace>, // ADDED: Furnaces parameter
  barbecues: Map<string, SpacetimeDBBarbecue>, // ADDED: Barbecues parameter
  lanterns: Map<string, SpacetimeDBLantern>,
  turrets: Map<string, SpacetimeDBTurret>, // ADDED: Turrets parameter
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
  brothPots: Map<string, SpacetimeDBBrothPot>,
  wildAnimals: Map<string, SpacetimeDBWildAnimal>, // ADDED wildAnimals argument
  animalCorpses: Map<string, SpacetimeDBAnimalCorpse>, // ADDED animalCorpses argument
  barrels: Map<string, SpacetimeDBBarrel>, // ADDED barrels argument
  fumaroles: Map<string, SpacetimeDBFumarole>, // ADDED fumaroles argument
  basaltColumns: Map<string, SpacetimeDBBasaltColumn>, // ADDED basalt columns argument
  seaStacks: Map<string, any>, // ADDED sea stacks argument
  foundationCells: Map<string, SpacetimeDBFoundationCell>, // ADDED: Building foundations
  wallCells: Map<string, SpacetimeDBWallCell>, // ADDED: Building walls
  doors: Map<string, SpacetimeDBDoor>, // ADDED: Building doors
  fences: Map<string, SpacetimeDBFence>, // ADDED: Building fences
  localPlayerId: string | undefined, // ADDED: Local player ID for building visibility
  isTreeFalling?: (treeId: string) => boolean, // NEW: Check if tree is falling
  worldChunkData?: Map<string, any>, // ADDED: World chunk data for tile type lookups
  alkStations?: Map<string, SpacetimeDBAlkStation>, // ADDED: ALK delivery stations
  monumentParts?: Map<string, any>, // ADDED: Unified monument parts (shipwreck, fishing village, whale bone graveyard)
  // StormPile removed - storms now spawn HarvestableResources and DroppedItems directly
  livingCorals?: Map<string, SpacetimeDBLivingCoral> // Living corals (uses combat system)
): EntityFilteringResult {
  // Increment frame counter for throttling
  frameCounter++;
  
  // Get player position for distance calculations
  const playerPos = getPlayerPosition(players, localPlayerId);  
  
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
    } else if ((entity as any).runeType !== undefined) {
      // Handle rune stones - similar to stones but slightly larger
      x = (entity as any).posX;
      y = (entity as any).posY;
      width = 150; // TARGET_RUNE_STONE_WIDTH_PX
      height = 150;
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
    } else if ((entity as any).loreId !== undefined) {
      // Handle cairns - they have a unique loreId property
      x = (entity as any).posX;
      y = (entity as any).posY;
      width = 256; // TARGET_CAIRN_WIDTH_PX
      height = 256; // Same as width for cairns
    } else if ((entity as any).id !== undefined && (entity as any).posX !== undefined && (entity as any).posY !== undefined && (entity as any).chunkIndex !== undefined) {
      // Handle fumaroles and basalt columns - they have id, posX, posY, and chunkIndex
      x = (entity as any).posX;
      y = (entity as any).posY;
      // Check if it's a basalt column (has columnType field) or fumarole
      if ((entity as any).columnType !== undefined) {
        // Basalt column - tall obstacle (2.5x bigger for cover)
        width = 200; // BASALT_COLUMN_WIDTH
        height = 300; // BASALT_COLUMN_HEIGHT
      } else {
        // Fumarole - ground vent
        width = 96; // FUMAROLE_WIDTH
        height = 96; // FUMAROLE_HEIGHT
      }
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
        // Destroyed trees (health === 0) are only shown during their falling animation
        const isFalling = isTreeFalling ? isTreeFalling(tree.id.toString()) : false;
        // respawnAt > 0 (not UNIX_EPOCH) means tree is destroyed and respawning
        const isDestroyed = !isNotRespawning(tree.respawnAt);
        
        // Show tree if: it has health, OR (it's falling AND destroyed)
        // Explicitly exclude destroyed trees that are not falling (similar to resources)
        if (isDestroyed && !isFalling) {
          return false;
        }
        
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
      // Include stones with health > 0 OR stones with active/newly-triggered destruction effect
      // checkStoneDestructionVisibility detects destruction transitions and triggers effects
      (stone) => (stone.health > 0 || checkStoneDestructionVisibility(stone)) && isEntityInView(stone, viewBounds, stableTimestamp)
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
      (resource) => isNotRespawning(resource.respawnAt) && 
                    isEntityInView(resource, viewBounds, stableTimestamp)
    );
  }, [harvestableResources, playerPos, viewBounds, stableTimestamp, frameCounter]);

  // Use cached results instead of original filtering
  let visibleTrees = cachedVisibleTrees;
  const visibleStones = cachedVisibleStones;
  const visibleRuneStones = useMemo(() => 
    runeStones ? Array.from(runeStones.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp))
    : [],
    [runeStones, isEntityInView, viewBounds, stableTimestamp]
  );
  const visibleCairns = useMemo(() => 
    cairns ? Array.from(cairns.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp))
    : [],
    [cairns, isEntityInView, viewBounds, stableTimestamp]
  );
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

  const visibleBarbecues = useMemo(() => 
    // Check source map - same filtering as campfires
          barbecues ? Array.from(barbecues.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp) && !e.isDestroyed)
    : [],
    [barbecues, isEntityInView, viewBounds, stableTimestamp]
  );

  const visibleLanterns = useMemo(() => {
    if (!lanterns) return [];
    
    const allLanterns = Array.from(lanterns.values());
    
    // Filter lanterns, but for wards we need expanded bounds to include radius circles
    const visibleFiltered = allLanterns.filter(e => {
      if (e.isDestroyed) return false;
      
      // Regular lanterns use standard viewport filtering
      if (e.lanternType === LANTERN_TYPE_LANTERN || !e.isBurning) {
        return isEntityInView(e, viewBounds, stableTimestamp);
      }
      
      // For active wards, check if their radius circle would be visible
      // A circle is visible if its center is within (radius) pixels of the viewport
      let wardRadius = 0;
      if (e.lanternType === 1) wardRadius = ANCESTRAL_WARD_RADIUS_PX;
      else if (e.lanternType === 2) wardRadius = SIGNAL_DISRUPTOR_RADIUS_PX;
      else if (e.lanternType === 3) wardRadius = MEMORY_BEACON_RADIUS_PX;
      
      // Expand view bounds by ward radius to check if the radius circle would be visible
      const expandedBounds = {
        viewMinX: viewBounds.viewMinX - wardRadius,
        viewMaxX: viewBounds.viewMaxX + wardRadius,
        viewMinY: viewBounds.viewMinY - wardRadius,
        viewMaxY: viewBounds.viewMaxY + wardRadius,
      };
      
      return isEntityInView(e, expandedBounds, stableTimestamp);
    });
    
    return visibleFiltered;
  }, [lanterns, isEntityInView, viewBounds, stableTimestamp]);

  const visibleTurrets = useMemo(() => {
    if (!turrets) return [];
    
    const allTurrets = Array.from(turrets.values());
    
    // Filter turrets - same pattern as lanterns
    return allTurrets.filter(e => {
      if (e.isDestroyed) return false;
      return isEntityInView(e, viewBounds, stableTimestamp);
    });
  }, [turrets, isEntityInView, viewBounds, stableTimestamp]);

  const visibleHomesteadHearths = useMemo(() => 
    // Check source map - same filtering as campfires
          homesteadHearths ? Array.from(homesteadHearths.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp) && !e.isDestroyed)
    : [],
    [homesteadHearths, isEntityInView, viewBounds, stableTimestamp]
  );

  const visiblePlayers = useMemo(() => {
    if (!players) return [];
    // Filter out offline players - they're represented by their corpse instead
    return Array.from(players.values()).filter(e => e.isOnline && isEntityInView(e, viewBounds, stableTimestamp));
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
  // ALSO: Filter out grass on water tiles (Sea, HotSpringWater)
  let visibleGrass = useMemo(() => {
    if (!grass || !playerPos) {
      return [];
    }
    
    const allGrass = Array.from(grass.values());
    // Removed excessive logging
    
    let filteredByHealth = 0;
    let filteredByView = 0;
    let filteredByWater = 0;
    
    const result = allGrass.filter(e => {
      if (e.health <= 0) {
        filteredByHealth++;
        return false;
      }
      if (!isEntityInView(e, viewBounds, stableTimestamp)) {
        filteredByView++;
        return false;
      }
      
      // Filter out grass on water tiles
      const tileX = Math.floor(e.serverPosX / 48); // TILE_SIZE is 48
      const tileY = Math.floor(e.serverPosY / 48);
      
      // Check tile type using compressed chunk data
      const chunkSize = 16;
      const chunkX = Math.floor(tileX / chunkSize);
      const chunkY = Math.floor(tileY / chunkSize);
      
      // Find the chunk
      for (const chunk of worldChunkData?.values() || []) {
        if (chunk.chunkX === chunkX && chunk.chunkY === chunkY) {
          const localX = tileX % chunkSize;
          const localY = tileY % chunkSize;
          const localTileX = localX < 0 ? localX + chunkSize : localX;
          const localTileY = localY < 0 ? localY + chunkSize : localY;
          const tileIndex = localTileY * chunkSize + localTileX;
          
          if (tileIndex >= 0 && tileIndex < chunk.tileTypes.length) {
            const tileTypeU8 = chunk.tileTypes[tileIndex];
            // Filter out grass on Sea (3) and HotSpringWater (6) tiles
            if (tileTypeU8 === 3 || tileTypeU8 === 6) {
              filteredByWater++;
              return false;
            }
          }
          break;
        }
      }
      
      return true;
    });
    
    // Only log occasionally to reduce spam
    // if (allGrass.length > 0 && (filteredByHealth > 0 || Math.random() < 0.01)) {
    //   console.log(`[EntityFiltering] Grass filtering: ${allGrass.length} total -> ${result.length} visible (health: ${filteredByHealth}, view: ${filteredByView}, water: ${filteredByWater})`);
    // }
    
    return result;
  }, [grass, playerPos, viewBounds, stableTimestamp, frameCounter, worldChunkData]);

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

  const visibleBrothPots = useMemo(() => 
    brothPots ? Array.from(brothPots.values()).filter(e => !e.isDestroyed && isEntityInView(e, viewBounds, stableTimestamp))
    : [],
    [brothPots, isEntityInView, viewBounds, stableTimestamp]
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
      
      // BURROWED STATE: Animals that are burrowed underground are invisible and should be filtered out
      // This prevents them from appearing in visible lists and being targeted
      if (e.state.tag === 'Burrowed') return false;
      
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
      isNotRespawning(e.respawnAt) && isEntityInView(e, viewBounds, stableTimestamp) // Don't show if respawning (destroyed)
    ) : [],
    [barrels, isEntityInView, viewBounds, stableTimestamp]
  );

  const visibleFumaroles = useMemo(() => {
    // console.log('🔥 [FUMAROLE FILTER] Running filter. fumaroles:', fumaroles ? `Map with ${fumaroles.size} entries` : 'null/undefined');
    const visible = fumaroles ? Array.from(fumaroles.values()).filter(e => 
      isEntityInView(e, viewBounds, stableTimestamp) // Fumaroles don't respawn
    ) : [];
    // console.log('🔥 [FUMAROLE FILTER] Total fumaroles:', fumaroles?.size || 0, 'Visible:', visible.length);
    return visible;
  }, [fumaroles, isEntityInView, viewBounds, stableTimestamp]);

  const visibleBasaltColumns = useMemo(() => {
    const visible = basaltColumns ? Array.from(basaltColumns.values()).filter(e => 
      isEntityInView(e, viewBounds, stableTimestamp) // Basalt columns don't respawn
    ) : [];
    if (basaltColumns && basaltColumns.size > 0) {
      // console.log('🗿 [BASALT FILTER] Total basalt columns:', basaltColumns.size, 'Visible:', visible.length);
    }
    return visible;
  }, [basaltColumns, isEntityInView, viewBounds, stableTimestamp]);

  // ALK delivery stations filtering - use worldPosX/worldPosY instead of posX/posY
  const visibleAlkStations = useMemo(() => {
    if (!alkStations) return [];
    return Array.from(alkStations.values()).filter(station => {
      if (!station.isActive) return false;
      // ALK stations use worldPosX/worldPosY - manually check viewport bounds
      const x = station.worldPosX;
      const y = station.worldPosY;
      const buffer = 1200; // Very large buffer for tall industrial landmarks (960px tall, 768px wide at 6x scale)
      return x >= viewBounds.viewMinX - buffer &&
             x <= viewBounds.viewMaxX + buffer &&
             y >= viewBounds.viewMinY - buffer &&
             y <= viewBounds.viewMaxY + buffer;
    });
  }, [alkStations, viewBounds]);

  // ADDED: Compound buildings filtering - static buildings + dynamic monuments
  // Static buildings come from config, dynamic monuments come from database
  // All monument types (Shipwreck, FishingVillage, WhaleBoneGraveyard, HuntingVillage, etc.) 
  // are processed in a single efficient pass
  const visibleCompoundBuildings = useMemo(() => {
    // Convert all monument parts to unified format in a single pass
    // NOTE: MonumentType is a tagged union with a `tag` property (e.g., { tag: 'Shipwreck' })
    const allMonumentParts = monumentParts ? Array.from(monumentParts.values())
      .map((part: any) => ({
        id: part.id,
        worldX: part.worldX,
        worldY: part.worldY,
        imagePath: part.imagePath,
        partType: part.partType || '', // Some monuments (like shipwreck) may not have partType
        isCenter: part.isCenter,
        collisionRadius: part.collisionRadius,
        monumentType: part.monumentType?.tag || 'Unknown', // Extract tag from tagged union
      })) : [];
    
    const allBuildings = getAllCompoundBuildings(allMonumentParts);
    
    // Convert buildings to entity format with world positions
    return allBuildings.map(building => {
      const worldPos = getBuildingWorldPosition(building);
      return {
        id: building.id,
        worldX: worldPos.x,
        worldY: worldPos.y,
        width: building.width,
        height: building.height,
        imagePath: building.imagePath,
        anchorYOffset: building.anchorYOffset,
        isCenter: building.isCenter, // For building restriction overlay
      };
    }).filter(building => {
      // Check if building is in viewport (with buffer for tall buildings)
      const buffer = 500; // Large buffer for tall buildings
      const left = building.worldX - building.width / 2;
      const right = building.worldX + building.width / 2;
      const top = building.worldY - building.height + building.anchorYOffset;
      const bottom = building.worldY;
      
      return right + buffer >= viewBounds.viewMinX &&
             left - buffer <= viewBounds.viewMaxX &&
             bottom + buffer >= viewBounds.viewMinY &&
             top - buffer <= viewBounds.viewMaxY;
    });
  }, [viewBounds, monumentParts]);

  const visibleSeaStacks = useMemo(() => 
    seaStacks ? Array.from(seaStacks.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp))
    : [],
    [seaStacks, isEntityInView, viewBounds, stableTimestamp]
  );

  // StormPile removed - storms now spawn HarvestableResources and DroppedItems directly

  // Living corals filtering - underwater coral reefs (uses combat system)
  // Include corals that are not respawning OR have active destruction effects
  const visibleLivingCorals = useMemo(() =>
    livingCorals ? Array.from(livingCorals.values()).filter(e =>
      (isNotRespawning(e.respawnAt) || hasActiveCoralDestruction(e.id.toString())) && isEntityInView(e, viewBounds, stableTimestamp)
    ) : [],
    [livingCorals, isEntityInView, viewBounds, stableTimestamp]
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

  // Extract door map size BEFORE useMemo to ensure React detects changes
  const doorMapSize = doors?.size || 0;

  // ADDED: Filter visible doors
  const visibleDoors = useMemo(() => {
    if (!doors || typeof doors.values !== 'function') return [];
    
    const padding = 50; // Extra padding to catch doors on edges
    
    return Array.from(doors.values()).filter(door => {
      // Doors use world position directly (posX, posY)
      const worldX = door.posX;
      const worldY = door.posY;
      
      return worldX >= viewBounds.viewMinX - padding && worldX <= viewBounds.viewMaxX + padding &&
             worldY >= viewBounds.viewMinY - padding && worldY <= viewBounds.viewMaxY + padding;
    });
  }, [doors, doorMapSize, viewBounds, stableTimestamp]);

  // Extract foundation map size BEFORE building clusters computation to ensure React detects changes
  const foundationMapSize = foundationCells?.size || 0;

  // ADDED: Calculate building clusters for fog of war
  const buildingClusters = useMemo(() => {
    if (!foundationCells || !wallCells) return new Map();
    return getBuildingClusters(foundationCells, wallCells);
  }, [foundationCells, foundationMapSize, wallCells, wallMapSize]);

  // ADDED: Determine which building cluster the local player is in
  const playerBuildingClusterId = useMemo(() => {
    const localPlayer = localPlayerId ? players.get(localPlayerId) : undefined;
    return getPlayerBuildingClusterId(localPlayer, buildingClusters);
  }, [localPlayerId, players, buildingClusters]);

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

  const visibleBarbecuesMap = useMemo(() => 
    new Map(visibleBarbecues.map(b => [b.id.toString(), b])), 
    [visibleBarbecues]
  );

  const visibleLanternsMap = useMemo(() => 
    new Map(visibleLanterns.map(l => [l.id.toString(), l])), 
    [visibleLanterns]
  );

  const visibleTurretsMap = useMemo(() => 
    new Map(visibleTurrets.map(t => [t.id.toString(), t])), 
    [visibleTurrets]
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

  const visibleBrothPotsMap = useMemo(() => 
    new Map(visibleBrothPots.map(b => [b.id.toString(), b])), 
    [visibleBrothPots]
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

  const visibleRuneStonesMap = useMemo(() => {
    const map = new Map<string, SpacetimeDBRuneStone>();
    visibleRuneStones.forEach(e => map.set(e.id.toString(), e));
    return map;
  }, [visibleRuneStones]);

  const visibleCairnsMap = useMemo(() => {
    const map = new Map<string, SpacetimeDBCairn>();
    visibleCairns.forEach(e => map.set(e.id.toString(), e));
    return map;
  }, [visibleCairns]);

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

  const visibleFumerolesMap = useMemo(() =>
    new Map(visibleFumaroles.map(f => [f.id.toString(), f])),
    [visibleFumaroles]
  );

  const visibleBasaltColumnsMap = useMemo(() =>
    new Map(visibleBasaltColumns.map(b => [b.id.toString(), b])),
    [visibleBasaltColumns]
  );

  const visibleAlkStationsMap = useMemo(() =>
    new Map(visibleAlkStations.map(s => [s.stationId.toString(), s])),
    [visibleAlkStations]
  );

  // ADDED: Map for visible sea stacks
  const visibleSeaStacksMap = useMemo(() =>
    new Map(visibleSeaStacks.map(s => [s.id.toString(), s])),
    [visibleSeaStacks]
  );

  // StormPile removed - storms now spawn HarvestableResources and DroppedItems directly

  // ADDED: Map for visible living corals
  const visibleLivingCoralsMap = useMemo(() =>
    new Map(visibleLivingCorals.map(c => [c.id.toString(), c])),
    [visibleLivingCorals]
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

  // ADDED: Map for visible doors
  const visibleDoorsMap = useMemo(() =>
    new Map(visibleDoors.map(d => [d.id.toString(), d])),
    [visibleDoors]
  );

  // Extract fence map size BEFORE useMemo to ensure React detects changes
  const fenceMapSize = fences?.size || 0;

  // ADDED: Filter visible fences
  const visibleFences = useMemo(() => {
    if (!fences || typeof fences.values !== 'function') return [];
    
    const padding = 50; // Extra padding to catch fences on edges
    
    return Array.from(fences.values()).filter(fence => {
      if (fence.isDestroyed) return false;
      
      // Fences use world position directly (posX, posY)
      const worldX = fence.posX;
      const worldY = fence.posY;
      
      return worldX >= viewBounds.viewMinX - padding && worldX <= viewBounds.viewMaxX + padding &&
             worldY >= viewBounds.viewMinY - padding && worldY <= viewBounds.viewMaxY + padding;
    });
  }, [fences, fenceMapSize, viewBounds, stableTimestamp]);

  // ADDED: Map for visible fences
  const visibleFencesMap = useMemo(() =>
    new Map(visibleFences.map(f => [f.id.toString(), f])),
    [visibleFences]
  );

  // ===== CACHED Y-SORTING WITH DIRTY FLAG SYSTEM =====
  // PERFORMANCE: Cache includes pre-computed sort keys for faster comparisons
  // Internal type extends YSortedEntityType with pre-computed _ySortKey and _priority
  type YSortedEntityWithKey = YSortedEntityType & { _ySortKey: number; _priority: number };
  
  // Cache for Y-sorted entities to avoid recalculating every frame
  const ySortedCache = useMemo(() => ({
    entities: [] as YSortedEntityWithKey[],
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
  // Note: wallMapSize and foundationMapSize are already extracted above
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
      barbecues: visibleBarbecues.length,
      lanterns: visibleLanterns.length,
      homesteadHearths: visibleHomesteadHearths.length, // ADDED: Homestead Hearths count
      droppedItems: visibleDroppedItems.length,
      projectiles: visibleProjectiles.length,
      shelters: visibleShelters.length,
      grass: visibleGrass.length,
      plantedSeeds: visiblePlantedSeeds.length,
      rainCollectors: visibleRainCollectors.length,
      brothPots: visibleBrothPots.length,
      wildAnimals: visibleWildAnimals.length,
      animalCorpses: visibleAnimalCorpses.length,
      barrels: visibleBarrels.length,
      fumaroles: visibleFumaroles.length,
      basaltColumns: visibleBasaltColumns.length,
      seaStacks: visibleSeaStacks.length,
      foundationCells: visibleFoundationCells.length,
      harvestableResources: visibleHarvestableResources.length,
      playerCorpses: visiblePlayerCorpses.length,
      stashes: visibleStashes.length,
      wallCells: visibleWallCells.length,
      compoundBuildings: visibleCompoundBuildings.length, // ADDED: Static compound buildings
    };
    
    // Calculate fog overlay count (building clusters that should be masked)
    let fogOverlayCount = 0;
    if (buildingClusters && buildingClusters.size > 0) {
      const processedClusters = new Set<string>();
      visibleFoundationCells.forEach(foundation => {
        if (foundation.isDestroyed) return;

        // Find which cluster this foundation belongs to
        for (const [clusterId, cluster] of buildingClusters) {
          if (cluster.foundationIds.has(foundation.id) && !processedClusters.has(clusterId)) {
            // Check if this cluster should be masked
            const shouldMask = cluster.isEnclosed && playerBuildingClusterId !== clusterId;
            if (shouldMask) {
          fogOverlayCount++;
              processedClusters.add(clusterId);
            }
            break;
          }
        }
      });
    }
    
    const totalEntities = Object.values(currentEntityCounts).reduce((sum, count) => sum + count, 0) + fogOverlayCount;
    
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
    
    // NOTE: Previously had `hasBothPlayersAndTiles` which disabled caching entirely when players + tiles existed.
    // This caused 60 re-sorts/sec even when nothing changed. Removed as the other safeguards
    // (foundationsJustLoaded, wallsJustLoaded, bothPresentNowButNotBefore, etc.) already handle the
    // subscription race condition. Now we re-sort every 4 frames (~15fps) for smooth visuals.
    
    // CORPSE SHAKE FIX: Check if any corpse was recently hit (within 250ms)
    // This ensures we use fresh entity data for shake rendering instead of cached stale data
    // The check is intentionally 250ms (longer than shake duration of 150-200ms) to ensure
    // we catch all shake animations even with frame timing variations
    const CORPSE_SHAKE_CACHE_THRESHOLD_MS = 250;
    let hasRecentCorpseHit = false;
    for (const corpse of visibleAnimalCorpses) {
      if (corpse.lastHitTime) {
        const hitTimeMs = Number((corpse.lastHitTime as any).microsSinceUnixEpoch || (corpse.lastHitTime as any).__timestamp_micros_since_unix_epoch__ || 0n) / 1000;
        if (stableTimestamp - hitTimeMs < CORPSE_SHAKE_CACHE_THRESHOLD_MS) {
          hasRecentCorpseHit = true;
          break;
        }
      }
    }
    if (!hasRecentCorpseHit) {
      for (const corpse of visiblePlayerCorpses) {
        if (corpse.lastHitTime) {
          const hitTimeMs = Number((corpse.lastHitTime as any).microsSinceUnixEpoch || (corpse.lastHitTime as any).__timestamp_micros_since_unix_epoch__ || 0n) / 1000;
          if (stableTimestamp - hitTimeMs < CORPSE_SHAKE_CACHE_THRESHOLD_MS) {
            hasRecentCorpseHit = true;
            break;
          }
        }
      }
    }
    
    // Check if we need to resort
    // PERFORMANCE FIX: Removed `hasBothPlayersAndTiles` which disabled caching entirely (60 re-sorts/sec)
    // The other safeguards (foundationsJustLoaded, wallsJustLoaded, etc.) already handle subscription race conditions
    // Reduced frame interval from 10 to 4 for smoother visuals (~15 re-sorts/sec instead of 60)
    const needsResort = ySortedCache.isDirty || 
                       (frameCounter - ySortedCache.lastUpdateFrame) > 4 || // Force resort every 4 frames (~15fps) for smooth player/wall transitions
                       hasEntityCountChanged(currentEntityCounts) ||
                       foundationsJustLoaded || // Force resort when foundations first load
                       wallsJustLoaded || // Force resort when walls first load
                       wallCountIncreased || // CRITICAL: Force resort when new wall is placed
                       foundationCountIncreased || // CRITICAL: Force resort when new foundation is placed
                       playerJustLoadedWithTilesPresent || // Force resort when player loads with tiles already present
                       bothPresentNowButNotBefore || // Force resort when both players and tiles are now present but weren't both before
                       hasRecentCorpseHit; // CORPSE SHAKE FIX: Force resort when corpse was recently hit
    
    // Use cached result when no re-sort is needed - significant performance gain!
    if (!needsResort && ySortedCache.entities.length > 0) {
      // Use cached result - huge performance gain!
      // Cast to YSortedEntityType[] to hide internal _ySortKey and _priority from consumers
      return ySortedCache.entities as YSortedEntityType[];
    }
    
    // PERFORMANCE OPTIMIZATION: Pre-compute Y sort keys during entity aggregation
    // This eliminates thousands of getEntityY() and getEntityPriority() calls during sorting
    // Instead of calling these functions O(n log n) times in the comparator,
    // we compute them once per entity (O(n)) and then compare simple numbers
    // (YSortedEntityWithKey type is defined above near ySortedCache)
    
    // PERFORMANCE: Pre-allocate array with known size to avoid dynamic resizing
    const allEntities: YSortedEntityWithKey[] = new Array(totalEntities);
    let index = 0;
    
    // Helper to add entity with pre-computed sort key
    const addEntity = (type: YSortedEntityType['type'], entity: any) => {
      const item = { type, entity } as YSortedEntityType;
      allEntities[index++] = {
        ...item,
        _ySortKey: getEntityY(item, stableTimestamp),
        _priority: getEntityPriority(item)
      } as YSortedEntityWithKey;
    };
    
    // Aggregate all entity types with pre-computed sort keys
    visiblePlayers.forEach(e => addEntity('player', e));
    visibleTrees.forEach(e => addEntity('tree', e));
    // Include stones with health > 0 OR stones with active destruction effects
    visibleStones.forEach(e => { if (e.health > 0 || hasActiveStoneDestruction(e.id.toString())) addEntity('stone', e); });
    visibleRuneStones.forEach(e => addEntity('rune_stone', e));
    visibleCairns.forEach(e => addEntity('cairn', e));
    visibleWoodenStorageBoxes.forEach(e => addEntity('wooden_storage_box', e));
    visibleStashes.forEach(e => addEntity('stash', e));
    visibleCampfires.forEach(e => addEntity('campfire', e));
    visibleFurnaces.forEach(e => addEntity('furnace', e));
    visibleBarbecues.forEach(e => addEntity('barbecue', e));
    visibleLanterns.forEach(e => addEntity('lantern', e));
    visibleTurrets.forEach(e => addEntity('turret', e)); // ADDED: Turrets
    visibleHomesteadHearths.forEach(e => addEntity('homestead_hearth', e)); // ADDED: Homestead Hearths
    visibleGrass.forEach(e => addEntity('grass', e));
    visiblePlantedSeeds.forEach(e => addEntity('planted_seed', e));
    visibleDroppedItems.forEach(e => addEntity('dropped_item', e));
    visibleHarvestableResources.forEach(e => addEntity('harvestable_resource', e));
    visibleRainCollectors.forEach(e => addEntity('rain_collector', e));
    visibleBrothPots.forEach(e => addEntity('broth_pot', e));
    visibleProjectiles.forEach(e => addEntity('projectile', e));
    visibleAnimalCorpses.forEach(e => addEntity('animal_corpse', e));
    visiblePlayerCorpses.forEach(e => addEntity('player_corpse', e));
    visibleWildAnimals.forEach(e => addEntity('wild_animal', e));
    visibleBarrels.forEach(e => addEntity('barrel', e));
    visibleFumaroles.forEach(e => addEntity('fumarole', e)); // ADDED: Fumaroles
    visibleBasaltColumns.forEach(e => addEntity('basalt_column', e)); // ADDED: Basalt columns
    // StormPile removed - storms now spawn HarvestableResources and DroppedItems directly
    // Include living corals that are healthy OR have active destruction effects
    visibleLivingCorals.forEach(e => { if (isNotRespawning(e.respawnAt) || hasActiveCoralDestruction(e.id.toString())) addEntity('living_coral', e); }); // Living corals (uses combat)
    visibleAlkStations.forEach(e => addEntity('alk_station', e)); // ADDED: ALK delivery stations
    visibleCompoundBuildings.forEach(e => addEntity('compound_building', e)); // ADDED: Static compound buildings
    visibleSleepingBags.forEach(e => addEntity('sleeping_bag', e)); // ADDED: Sleeping bags
    visibleSeaStacks.forEach(e => addEntity('sea_stack', e));
    visibleShelters.forEach(e => addEntity('shelter', e));
    visibleFoundationCells.forEach(e => addEntity('foundation_cell', e)); // ADDED: Foundations
    
    // ADDED: Add fog overlays for building clusters that should be masked
    // These render above placeables but below walls
    // CRITICAL: Must always check and add fog overlays when player is outside enclosed buildings
    // This ensures consistent fog of war for PVP gameplay
    // IMPORTANT: Add fog overlays BEFORE walls to ensure correct render order
    if (buildingClusters && buildingClusters.size > 0) {
      const processedClusters = new Set<string>();

      visibleFoundationCells.forEach(foundation => {
        if (foundation.isDestroyed) return;

        // Find which cluster this foundation belongs to
        for (const [clusterId, cluster] of buildingClusters) {
          if (cluster.foundationIds.has(foundation.id) && !processedClusters.has(clusterId)) {
            // Check if this cluster should be masked
            const shouldMask = cluster.isEnclosed && playerBuildingClusterId !== clusterId;

        if (shouldMask) {
              // Calculate cluster bounds
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              cluster.cellCoords.forEach((coord: string) => {
                const [cellX, cellY] = coord.split(',').map(Number);
                const worldX = cellX * FOUNDATION_TILE_SIZE;
                const worldY = cellY * FOUNDATION_TILE_SIZE;
                minX = Math.min(minX, worldX);
                minY = Math.min(minY, worldY);
                maxX = Math.max(maxX, worldX + FOUNDATION_TILE_SIZE);
                maxY = Math.max(maxY, worldY + FOUNDATION_TILE_SIZE);
              });

              // Detect entrance way foundations (foundations on perimeter without walls on exposed edges)
              // Get all foundations in this cluster
              const clusterFoundations: SpacetimeDBFoundationCell[] = [];
              for (const f of visibleFoundationCells) {
                if (cluster.foundationIds.has(f.id)) {
                  clusterFoundations.push(f);
                }
              }

              // Detect entrance way foundations (foundations on perimeter without walls OR doors on exposed edges)
              const entranceWayFoundations = detectEntranceWayFoundations(
                clusterFoundations,
                wallCells || new Map(),
                cluster.cellCoords,
                doors // Pass doors so they count as edge coverage (not entrance ways)
              );

              // Detect foundations with north walls OR north doors (for ceiling extension to cover their interiors)
              const northWallFoundations = detectNorthWallFoundations(
                clusterFoundations,
                wallCells || new Map(),
                doors // Pass doors so north doors also get ceiling extension
              );

              // Detect foundations with south walls OR south doors (to prevent ceiling from covering them)
              const southWallFoundations = detectSouthWallFoundations(
                clusterFoundations,
                wallCells || new Map(),
                doors // Pass doors so south doors also prevent ceiling coverage
              );

              addEntity('fog_overlay', {
                  clusterId,
                  bounds: { minX, minY, maxX, maxY },
                  entranceWayFoundations: Array.from(entranceWayFoundations), // Convert Set to Array for serialization
                  clusterFoundationCoords: Array.from(cluster.cellCoords), // Pass all foundation coords to prevent rendering outside building
                  northWallFoundations: Array.from(northWallFoundations), // Pass foundations with north walls for ceiling extension
                  southWallFoundations: Array.from(southWallFoundations) // Pass foundations with south walls to prevent covering them
                });
              processedClusters.add(clusterId);
            }
            break; // Found the cluster, no need to check others
          }
        }
      });
    }
    
    visibleWallCells.forEach(e => addEntity('wall_cell', e)); // ADDED: Walls
    visibleDoors.forEach(e => addEntity('door', e)); // ADDED: Doors
    visibleFences.forEach(e => addEntity('fence', e)); // ADDED: Fences

    // Trim array to actual size in case some entities were filtered out (e.g., stones with 0 health)
    allEntities.length = index;
    
    // PERFORMANCE OPTIMIZATION: Sort using pre-computed _ySortKey and _priority
    // The Y sort key was computed once per entity during aggregation above,
    // eliminating O(n log n) getEntityY() calls during sorting.
    // Special case checks still run, but the final Y comparison uses simple numbers.
    allEntities.sort((a, b) => {
      // ABSOLUTE FIRST CHECK: Broth pot MUST ALWAYS render above campfires and fumaroles
      // This is the highest priority visual rule - broth pots sit ON TOP of heat sources
      // CRITICAL: This must be THE VERY FIRST check to ensure no other logic can interfere
      if (a.type === 'broth_pot' && (b.type === 'campfire' || b.type === 'fumarole')) {
        return 1; // Broth pot renders after (above) campfire/fumarole
      }
      if (b.type === 'broth_pot' && (a.type === 'campfire' || a.type === 'fumarole')) {
        return -1; // Broth pot renders after (above) campfire/fumarole
      }
      
      // SECOND CHECK: Player vs ALK Station - tall structure Y-sorting
      // This MUST be first to ensure correct rendering for large structures
      // CRITICAL: The ALK station sprite is 1024x1024 but only ~775px has actual building content
      // The top ~24% is transparent PNG. When rendered at 480px, ~115px is transparent at top.
      // The visual "foot" of the building is NOT at worldPosY - it's higher up.
      // We need a large buffer to account for: transparent sprite top (~115px) + player height (48px)
      if (a.type === 'player' && b.type === 'alk_station') {
        const player = a.entity as SpacetimeDBPlayer;
        const station = b.entity as SpacetimeDBAlkStation;
        // Buffer accounts for: transparent top of sprite (~115px) + player height (48px) + safety margin
        const ALK_STATION_YSORT_BUFFER = 170; // Matches collision Y offset - where building visually sits
        // Player renders in front if their feet are at or south of the building's visual base
        if (player.positionY >= station.worldPosY - ALK_STATION_YSORT_BUFFER) {
          return 1; // Player at/near/south of building's visual base - player in front
        }
        return -1; // Player clearly north of building - player behind (station on top)
      }
      if (a.type === 'alk_station' && b.type === 'player') {
        const player = b.entity as SpacetimeDBPlayer;
        const station = a.entity as SpacetimeDBAlkStation;
        const ALK_STATION_YSORT_BUFFER = 170; // Matches collision Y offset - where building visually sits
        if (player.positionY >= station.worldPosY - ALK_STATION_YSORT_BUFFER) {
          return -1; // Player at/near/south of building's visual base - player in front (inverted)
        }
        return 1; // Player clearly north of building - player behind (inverted)
      }
      
      // ABSOLUTE SECOND CHECK: Player vs Compound Building - tall structure Y-sorting
      // Use 87.5% height threshold: player behind in top 87.5%, in front in bottom 12.5%
      // Monument images are squares (256x256) but actual content is in bottom portion
      // Sprite bounds: top = worldY - height + anchorYOffset, bottom = worldY + anchorYOffset
      // 87.5% threshold = worldY - (height * 0.125) + anchorYOffset (only bottom 12.5% = player in front)
      if (a.type === 'player' && b.type === 'compound_building') {
        const player = a.entity as SpacetimeDBPlayer;
        const building = b.entity as CompoundBuildingEntity;
        // Calculate 87.5% Y threshold for sorting (player in front only in bottom 12.5%)
        const sortThresholdY = building.worldY - (building.height * 0.125) + (building.anchorYOffset || 0);
        if (player.positionY >= sortThresholdY) {
          return 1; // Player in bottom 12.5% of monument - player in front
        }
        return -1; // Player in top 87.5% of monument - player behind (building on top)
      }
      if (a.type === 'compound_building' && b.type === 'player') {
        const building = a.entity as CompoundBuildingEntity;
        const player = b.entity as SpacetimeDBPlayer;
        // Calculate 87.5% Y threshold for sorting (player in front only in bottom 12.5%)
        const sortThresholdY = building.worldY - (building.height * 0.125) + (building.anchorYOffset || 0);
        if (player.positionY >= sortThresholdY) {
          return -1; // Player in bottom 12.5% of monument - player in front (inverted)
        }
        return 1; // Player in top 87.5% of monument - player behind (inverted)
      }
      
      // Flying birds MUST render above everything (trees, stones, players, etc.)
      // This ensures birds in flight are always visible above ground entities
      const aAnimal = a.type === 'wild_animal' ? (a.entity as SpacetimeDBWildAnimal) : null;
      const bAnimal = b.type === 'wild_animal' ? (b.entity as SpacetimeDBWildAnimal) : null;
      
      const aIsFlyingBird = aAnimal !== null && 
        (aAnimal.species.tag === 'Tern' || aAnimal.species.tag === 'Crow') &&
        aAnimal.isFlying === true;
      const bIsFlyingBird = bAnimal !== null && 
        (bAnimal.species.tag === 'Tern' || bAnimal.species.tag === 'Crow') &&
        bAnimal.isFlying === true;
      
      // Explicit checks for common ground entities that flying birds should render above
      if (aIsFlyingBird && (b.type === 'tree' || b.type === 'stone' || b.type === 'player' || b.type === 'rune_stone' || b.type === 'wild_animal')) {
        return 1; // Flying bird renders after (above) ground entity
      }
      if (bIsFlyingBird && (a.type === 'tree' || a.type === 'stone' || a.type === 'player' || a.type === 'rune_stone' || a.type === 'wild_animal')) {
        return -1; // Flying bird renders after (above) ground entity
      }
      
      // General check: flying bird vs any non-flying entity
      if (aIsFlyingBird && !bIsFlyingBird) {
        return 1; // Flying bird renders after (above) non-flying entities
      }
      if (bIsFlyingBird && !aIsFlyingBird) {
        return -1; // Flying bird renders after (above) non-flying entities
      }
      
      // NOTE: Broth pot vs campfire/fumarole check moved to ABSOLUTE FIRST CHECK at top of comparator
      
      // CRITICAL: Ensure walls ALWAYS render after (above) fog overlays - THIRD CHECK
      // This MUST run early to guarantee walls are never obscured by fog
      // Walls represent the building structure and should always be visible above fog
      // Check BOTH type strings explicitly to ensure we catch all cases
      const aIsFog = a.type === 'fog_overlay';
      const bIsFog = b.type === 'fog_overlay';
      const aIsWall = a.type === 'wall_cell';
      const bIsWall = b.type === 'wall_cell';
      
      // If one is fog and the other is wall, wall ALWAYS wins (renders above)
      // Return IMMEDIATELY to prevent any other logic from interfering
      if (aIsFog && bIsWall) {
        return -1; // Fog renders before (below) wall - absolute precedence, NO EXCEPTIONS
      }
      if (bIsFog && aIsWall) {
        return 1; // Wall renders after (above) fog - absolute precedence, NO EXCEPTIONS
      }
      
      // CRITICAL: Ensure fog ALWAYS renders above players - SECOND CHECK (right after walls)
      // Players must always render below ceiling tiles/fog of war
      if (aIsFog && b.type === 'player') {
        return 1; // Fog renders after (above) player - absolute precedence
      }
      if (bIsFog && a.type === 'player') {
        return -1; // Fog renders after (above) player - absolute precedence
      }
      
      // CRITICAL: Ensure fog ALWAYS renders above placeables within masked building clusters - THIRD CHECK (after players)
      // This MUST run before any other logic to guarantee placeables are always hidden by fog
      const placeableTypes: Array<YSortedEntityType['type']> = [
        'wooden_storage_box', 'stash', 'campfire', 'furnace', 'lantern', 
        'homestead_hearth', 'barrel', 'rain_collector', 'sleeping_bag'
      ];
      
      // Helper function to check if a placeable is within a building cluster bounds
      const isPlaceableInFogBounds = (placeable: any, fogBounds: { minX: number; minY: number; maxX: number; maxY: number }): boolean => {
        if (!placeable || !placeable.posX || !placeable.posY) return false;
        return placeable.posX >= fogBounds.minX &&
               placeable.posX < fogBounds.maxX &&
               placeable.posY >= fogBounds.minY &&
               placeable.posY < fogBounds.maxY;
      };
      
      // Fog must render above placeables within the same building cluster
      if (aIsFog && placeableTypes.includes(b.type)) {
        const fogEntity = a.entity as { clusterId: string; bounds: { minX: number; minY: number; maxX: number; maxY: number } };
        const placeable = b.entity as any;
        if (isPlaceableInFogBounds(placeable, fogEntity.bounds)) {
          return 1; // Fog renders after (above) placeable - absolute precedence
        }
      }
      
      if (bIsFog && placeableTypes.includes(a.type)) {
        const fogEntity = b.entity as { clusterId: string; bounds: { minX: number; minY: number; maxX: number; maxY: number } };
        const placeable = a.entity as any;
        if (isPlaceableInFogBounds(placeable, fogEntity.bounds)) {
          return -1; // Fog renders after (above) placeable - absolute precedence
        }
      }
      
      // NOTE: Broth pot vs campfire/fumarole check moved to absolute top of comparator
      
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
          // North wall: use foundation TOP as threshold - WORKING PERFECTLY
          if (player.positionY >= foundationTopY) {
            return 1; // Player renders after wall (player in front)
          } else {
            return -1; // Player renders before wall (wall in front)
          }
        } else if (wall.edge === 2) {
          // South wall: Check player's HEAD position (not feet) against foundation bottom
          // Player's head is 48px above their feet (positionY)
          // Player renders on top when their HEAD is at or below foundation bottom
          const PLAYER_SPRITE_HEIGHT = 48;
          const playerHeadY = player.positionY - PLAYER_SPRITE_HEIGHT;
          if (playerHeadY >= foundationBottomY) {
            return 1; // Player renders after wall (player in front)
          } else {
            return -1; // Player renders before wall (wall in front)
          }
        } else if (wall.edge === 1 || wall.edge === 3) {
          // East/west walls: use foundation top
          if (player.positionY >= foundationTopY) {
            return 1; // Player renders after wall (player in front)
          } else {
            return -1; // Player renders before wall (wall in front)
          }
        }
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
          // North wall: use foundation TOP as threshold - WORKING PERFECTLY - inverted
          if (player.positionY >= foundationTopY) {
            return -1; // Player renders after wall (player in front) - inverted
          } else {
            return 1; // Player renders before wall (wall in front) - inverted
          }
        } else if (wall.edge === 2) {
          // South wall: Check player's HEAD position - inverted
          const PLAYER_SPRITE_HEIGHT = 48;
          const playerHeadY = player.positionY - PLAYER_SPRITE_HEIGHT;
          if (playerHeadY >= foundationBottomY) {
            return -1; // Player renders after wall (player in front) - inverted
          } else {
            return 1; // Player renders before wall (wall in front) - inverted
          }
        } else if (wall.edge === 1 || wall.edge === 3) {
          // East/west walls: use foundation top - inverted
          if (player.positionY >= foundationTopY) {
            return -1; // Player renders after wall (player in front) - inverted
          } else {
            return 1; // Player renders before wall (wall in front) - inverted
          }
        }
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
      
      // DOOR vs PLAYER Y-sorting
      if (a.type === 'player' && b.type === 'door') {
        const player = a.entity as SpacetimeDBPlayer;
        const door = b.entity as SpacetimeDBDoor;
        const FOUNDATION_TILE_SIZE = 96;
        const foundationTopY = door.cellY * FOUNDATION_TILE_SIZE;
        const foundationBottomY = foundationTopY + FOUNDATION_TILE_SIZE;
        
        if (door.edge === 0) {
          // North door: use foundation top - WORKING PERFECTLY
          if (player.positionY >= foundationTopY) {
            return 1; // Player renders after door (player in front)
          } else {
            return -1; // Player renders before door (door in front)
          }
        } else {
          // South door: Check player's HEAD position against foundation bottom
          const PLAYER_SPRITE_HEIGHT = 48;
          const playerHeadY = player.positionY - PLAYER_SPRITE_HEIGHT;
          if (playerHeadY >= foundationBottomY) {
            return 1; // Player renders after door (player in front)
          } else {
            return -1; // Player renders before door (door in front)
          }
        }
      }
      if (b.type === 'player' && a.type === 'door') {
        const player = b.entity as SpacetimeDBPlayer;
        const door = a.entity as SpacetimeDBDoor;
        const FOUNDATION_TILE_SIZE = 96;
        const foundationTopY = door.cellY * FOUNDATION_TILE_SIZE;
        const foundationBottomY = foundationTopY + FOUNDATION_TILE_SIZE;
        
        if (door.edge === 0) {
          // North door: use foundation top - WORKING PERFECTLY - inverted
          if (player.positionY >= foundationTopY) {
            return -1; // Player renders after door (player in front) - inverted
          } else {
            return 1; // Player renders before door (door in front) - inverted
          }
        } else {
          // South door: Check player's HEAD position - inverted
          const PLAYER_SPRITE_HEIGHT = 48;
          const playerHeadY = player.positionY - PLAYER_SPRITE_HEIGHT;
          if (playerHeadY >= foundationBottomY) {
            return -1; // Player renders after door (player in front) - inverted
          } else {
            return 1; // Player renders before door (door in front) - inverted
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
        'stash', 'barrel', 'rain_collector', 'sleeping_bag', 'broth_pot'
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
      
      // SAFETY: Broth pot should render above trees and stones (redundant with early check above for campfire/fumarole)
      if (a.type === 'broth_pot' && (b.type === 'tree' || b.type === 'stone')) {
        return 1; // Pot renders after (above) tree/stone
      }
      if (b.type === 'broth_pot' && (a.type === 'tree' || a.type === 'stone')) {
        return -1; // Pot renders after (above) tree/stone
      }
      
      // SHELTER VS PLACEABLES: Shelters are tall structures that should render ABOVE ground placeables
      // when the placeable is within or near the shelter's visual footprint.
      // Without this, placeables with posY near shelter's visual base (shelter.posY - 100) would incorrectly render above.
      const shelterPlaceableTypes: Array<YSortedEntityType['type']> = [
        'broth_pot', 'campfire', 'furnace', 'barbecue', 'lantern', 'wooden_storage_box', 
        'stash', 'barrel', 'rain_collector', 'sleeping_bag'
      ];
      
      if (a.type === 'shelter' && shelterPlaceableTypes.includes(b.type)) {
        const shelter = a.entity as SpacetimeDBShelter;
        const placeable = b.entity as { posX: number; posY: number };
        // Check if placeable is within shelter's visual footprint (roughly 200px radius)
        const SHELTER_VISUAL_RADIUS = 100;
        const dx = placeable.posX - shelter.posX;
        const dy = placeable.posY - shelter.posY;
        if (dx * dx + dy * dy < SHELTER_VISUAL_RADIUS * SHELTER_VISUAL_RADIUS) {
          return 1; // Shelter renders after (above) placeable within its footprint
        }
      }
      if (b.type === 'shelter' && shelterPlaceableTypes.includes(a.type)) {
        const shelter = b.entity as SpacetimeDBShelter;
        const placeable = a.entity as { posX: number; posY: number };
        const SHELTER_VISUAL_RADIUS = 100;
        const dx = placeable.posX - shelter.posX;
        const dy = placeable.posY - shelter.posY;
        if (dx * dx + dy * dy < SHELTER_VISUAL_RADIUS * SHELTER_VISUAL_RADIUS) {
          return -1; // Shelter renders after (above) placeable within its footprint
        }
      }
      
      // CRITICAL: Flying birds MUST render above trees, stones, and all ground objects regardless of Y position
      // This check runs right before Y-sorting to ensure it's not overridden
      // Reuse variables already declared at the top of the sort function
      // Ground objects that flying birds should render above
      const groundObjectTypes = ['tree', 'stone', 'rune_stone', 'basalt_column', 'fumarole', 
        'wooden_storage_box', 'stash', 'campfire', 'furnace', 'lantern', 'homestead_hearth',
        'planted_seed', 'dropped_item', 'harvestable_resource', 'barrel', 'rain_collector',
        'broth_pot', 'sleeping_bag', 'animal_corpse', 'player_corpse', 'foundation_cell', 'alk_station'];
      
      if (aIsFlyingBird && groundObjectTypes.includes(b.type)) {
        return 1; // Flying bird renders after (above) ground object
      }
      if (bIsFlyingBird && groundObjectTypes.includes(a.type)) {
        return -1; // Flying bird renders after (above) ground object
      }
      
      // PERFORMANCE OPTIMIZATION: Use pre-computed _ySortKey instead of calling getEntityY()
      // This eliminates O(n log n) function calls during sorting
      const yA = a._ySortKey;
      const yB = b._ySortKey;
      
      // CRITICAL FIX: Handle NaN values that break sorting
      if (isNaN(yA) || isNaN(yB)) {
        console.warn('[ySortedEntities] Invalid Y values detected:', { 
          typeA: a.type, yA, 
          typeB: b.type, yB,
          entityA: a.entity,
          entityB: b.entity
        });
        // Fallback: use pre-computed priority sorting if Y values are invalid
        return b._priority - a._priority;
      }
      
      // Primary sort by Y position
      // Note: Explicit check above ensures walls always render above fog regardless of Y position
      const yDiff = yA - yB;
      if (Math.abs(yDiff) > 0.1) {
        return yDiff;
      }
      
      // Secondary sort by pre-computed priority when Y positions are close
      // PERFORMANCE: Uses pre-computed _priority instead of calling getEntityPriority()
      return b._priority - a._priority;
    });
    
    // PERFORMANCE: Update cache with new sorted result
    ySortedCache.entities = allEntities;
    ySortedCache.lastUpdateFrame = frameCounter;
    ySortedCache.lastEntityCounts = currentEntityCounts;
    ySortedCache.lastFoundationMapSize = foundationCells?.size || 0;
    ySortedCache.lastWallMapSize = wallCells?.size || 0;
    ySortedCache.isDirty = false;
    
    // Cast to YSortedEntityType[] to hide internal _ySortKey and _priority from consumers
    return allEntities as YSortedEntityType[];
  },
    // Dependencies for cached Y-sorting
    [visiblePlayers, visibleTrees, visibleStones, visibleRuneStones, visibleCairns, visibleWoodenStorageBoxes, 
    visiblePlayerCorpses, visibleStashes, 
    visibleCampfires, visibleFurnaces, visibleLanterns, visibleDroppedItems,
    visibleProjectiles, visibleGrass,
    visibleShelters,
    visiblePlantedSeeds,
    visibleRainCollectors,
    visibleBrothPots,
    visibleWildAnimals,
    visibleAnimalCorpses,
    visibleBarrels,
    visibleFumaroles,
    visibleBasaltColumns,
    // visibleStormPiles removed - storms now spawn HarvestableResources and DroppedItems directly
    visibleLivingCorals, // Living corals dependency (uses combat)
    visibleAlkStations, // ADDED: ALK stations dependency
    visibleCompoundBuildings, // ADDED: Static compound buildings dependency
    visibleSeaStacks,
    visibleHarvestableResources,
    visibleFoundationCells, // ADDED: Foundations dependency
    visibleWallCells, // ADDED: Walls dependency
    visibleDoors, // ADDED: Doors dependency
    foundationCells, // CRITICAL: Depend on raw map to detect when data loads
    foundationMapSize, // CRITICAL: Depend on map size to detect when subscription data arrives
    wallCells, // CRITICAL: Depend on raw map to detect when data loads
    wallMapSize, // CRITICAL: Depend on map size to detect when subscription data arrives
    playerMapSize, // CRITICAL: Depend on player map size to detect when player data loads
    stableTimestamp, // Only include stableTimestamp for projectile calculations
    hasEntityCountChanged, // Add callback dependency
    frameCounter, // Add frame counter for cache invalidation
    buildingClusters, // ADDED: Depend on building clusters for fog overlay calculation
    playerBuildingClusterId, // ADDED: Depend on player building cluster for fog overlay calculation
  ]);

  // Emergency mode removed

  return {
    visibleHarvestableResources,
    visibleDroppedItems,
    visibleCampfires,
    visibleFurnaces, // ADDED: Furnaces
    visibleLanterns,
    visibleTurrets, // ADDED: Turrets (array)
    visibleHomesteadHearths, // ADDED: Homestead Hearths
    visiblePlayers,
    visibleTrees,
    visibleStones,
    visibleRuneStones,
    visibleRuneStonesMap,
    visibleCairns,
    visibleCairnsMap,
    visibleWoodenStorageBoxes,
    visibleSleepingBags,
    visiblePlayerCorpses,
    visibleStashes,
    visibleProjectiles,
    visibleHarvestableResourcesMap,
    visibleCampfiresMap,
    visibleFurnacesMap, // ADDED: Furnaces map
    visibleBarbecues, // ADDED: Barbecues
    visibleBarbecuesMap, // ADDED: Barbecues map
    visibleLanternsMap,
    visibleTurretsMap, // ADDED: Turrets map
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
    visibleBrothPots,
    visibleBrothPotsMap,
    visibleWildAnimals,
    visibleWildAnimalsMap,
    visibleAnimalCorpses,
    visibleAnimalCorpsesMap,
    visibleBarrels,
    visibleBarrelsMap,
    visibleFumaroles,
    visibleFumerolesMap,
    visibleBasaltColumns,
    visibleBasaltColumnsMap,
    // StormPile removed - storms now spawn HarvestableResources and DroppedItems directly
    visibleLivingCorals,
    visibleLivingCoralsMap,
    visibleSeaStacks, 
    visibleSeaStacksMap,
    visibleFoundationCells,
    visibleFoundationCellsMap,
    visibleWallCells,
    visibleWallCellsMap,
    visibleDoors, // ADDED: Building doors
    visibleDoorsMap, // ADDED: Building doors map
    visibleFences, // ADDED: Building fences
    visibleFencesMap, // ADDED: Building fences map
    buildingClusters, // ADDED: Building clusters for fog of war
    playerBuildingClusterId, // ADDED: Which building the player is in
    visibleAlkStations, // ADDED: ALK delivery stations
    visibleAlkStationsMap, // ADDED: ALK delivery stations map
  };
} 