import {
  Player as SpacetimeDBPlayer,
  Tree as SpacetimeDBTree,
  Stone as SpacetimeDBStone,
  RuneStone as SpacetimeDBRuneStone,
  WoodenStorageBox as SpacetimeDBWoodenStorageBox,
  SleepingBag as SpacetimeDBSleepingBag,
  ActiveConnection,
  ActiveEquipment as SpacetimeDBActiveEquipment,
  ItemDefinition as SpacetimeDBItemDefinition,
  InventoryItem as SpacetimeDBInventoryItem,
  Stash as SpacetimeDBStash,
  DroppedItem as SpacetimeDBDroppedItem,
  Campfire as SpacetimeDBCampfire,
  ActiveConsumableEffect,
  HarvestableResource as SpacetimeDBHarvestableResource,
  Grass as SpacetimeDBGrass,
  Projectile as SpacetimeDBProjectile,
  Shelter as SpacetimeDBShelter,
  PlayerDodgeRollState as SpacetimeDBPlayerDodgeRollState,
  PlantedSeed as SpacetimeDBPlantedSeed,
  RainCollector as SpacetimeDBRainCollector,
  WildAnimal as SpacetimeDBWildAnimal,
  AnimalCorpse as SpacetimeDBAnimalCorpse,
  FoundationCell as SpacetimeDBFoundationCell, // ADDED: Building foundations
  WallCell as SpacetimeDBWallCell, // ADDED: Building walls
  Door as SpacetimeDBDoor, // ADDED: Building doors
  Fence as SpacetimeDBFence, // ADDED: Building fences
  HomesteadHearth as SpacetimeDBHomesteadHearth, // ADDED: HomesteadHearth
  BrothPot as SpacetimeDBBrothPot, // ADDED: BrothPot
  Turret as SpacetimeDBTurret, // ADDED: Turret
  Fumarole as SpacetimeDBFumarole, // ADDED: Fumarole
  BasaltColumn as SpacetimeDBBasaltColumn, // ADDED: Basalt column
  LivingCoral as SpacetimeDBLivingCoral, // Living coral (underwater harvestable via combat)
  AlkStation as SpacetimeDBAlkStation, // ADDED: ALK delivery station
  Cairn as SpacetimeDBCairn, // ADDED: Cairn import
} from '../../generated';
import { DbConnection } from '../../generated'; // ADDED: DbConnection for tile biome lookup
import { PlayerCorpse as SpacetimeDBPlayerCorpse } from '../../generated/player_corpse_type';
import { gameConfig } from '../../config/gameConfig';
import { JUMP_DURATION_MS } from '../../config/gameConfig'; // Import the constant
// Import individual rendering functions
import { renderTree, renderTreeImpactEffects, renderTreeHitEffects } from './treeRenderingUtils';
import { renderStone, renderStoneDestructionEffects, renderStoneHitEffects } from './stoneRenderingUtils';
import { renderRuneStone } from './runeStoneRenderingUtils';
import { renderCairn } from './cairnRenderingUtils';
import { renderWoodenStorageBox, BOX_TYPE_COMPOST, BOX_TYPE_REFRIGERATOR, BOX_TYPE_REPAIR_BENCH, BOX_TYPE_COOKING_STATION, BOX_TYPE_SCARECROW, BOX_TYPE_MILITARY_RATION, BOX_TYPE_MINE_CART, BOX_TYPE_FISH_TRAP, BOX_TYPE_WILD_BEEHIVE } from './woodenStorageBoxRenderingUtils';
import { renderEquippedItem } from './equippedItemRenderingUtils';
// Import the extracted player renderer
import { renderPlayer, isPlayerHovered } from './playerRenderingUtils';
// Import underwater shadow renderer for early rendering pass
import { drawUnderwaterShadowOnly } from './swimmingEffectsUtils';
// Import unified resource renderer - these functions now work with HarvestableResource
import { renderHarvestableResource } from './unifiedResourceRenderer';
// Import planted seed renderer (will be activated once client bindings are generated)
import { renderPlantedSeed } from './plantedSeedRenderingUtils';
import { renderCampfire } from './campfireRenderingUtils';
import { renderFurnace } from './furnaceRenderingUtils'; // ADDED: Furnace renderer import
import { renderBarbecue } from './barbecueRenderingUtils'; // ADDED: Barbecue renderer import
import { renderLantern, renderWardRadius, LANTERN_TYPE_LANTERN } from './lanternRenderingUtils';
import { renderTurret } from './turretRenderingUtils';
import { renderBrothPot } from './brothPotRenderingUtils'; // ADDED: Broth pot renderer import
import { renderFoundation, renderFogOverlay, renderFogOverlayCluster } from './foundationRenderingUtils'; // ADDED: Foundation renderer import
import { renderWall, renderWallExteriorShadow, renderFence, buildFencePositionMap } from './foundationRenderingUtils'; // ADDED: Wall renderer, exterior shadow, fence renderer, and fence position map builder import
import { renderDoor } from './doorRenderingUtils'; // ADDED: Door renderer import
import { renderStash } from './stashRenderingUtils';
import { renderSleepingBag } from './sleepingBagRenderingUtils';
// Import shelter renderer
import { renderShelter } from './shelterRenderingUtils';
// Import rain collector renderer
import { renderRainCollector } from './rainCollectorRenderingUtils';
// Import wild animal renderer
import { renderWildAnimal, renderTamingThoughtBubbles, renderPregnancyIndicator } from './wildAnimalRenderingUtils';
// Import breeding data types for rendering
import { CaribouBreedingData } from '../../generated/caribou_breeding_data_type';
import { WalrusBreedingData } from '../../generated/walrus_breeding_data_type';
// Import animal corpse renderer
import { renderAnimalCorpse } from './animalCorpseRenderingUtils';
// Import player corpse renderer
import { renderPlayerCorpse, isCorpseHovered } from './playerCorpseRenderingUtils';
// Import barrel renderer
import { renderBarrel } from './barrelRenderingUtils';
// Import entity visual config for centralized bounds
import { ENTITY_VISUAL_CONFIG, getInteractionOutlineParams } from '../entityVisualConfig';
// Import fumarole renderer
import { renderFumarole } from './fumaroleRenderingUtils';
// Import basalt column renderer
import { renderBasaltColumn } from './basaltColumnRenderingUtils';
// Import living coral renderer (underwater harvestable resource)
import { renderLivingCoral, renderCoralDestructionEffects, renderCoralHitEffects } from './livingCoralRenderingUtils';
// Import ALK station renderer
import { renderAlkStation } from './alkStationRenderingUtils';
// Import compound building renderer
import { renderMonument, getBuildingImage } from './monumentRenderingUtils';
import { CompoundBuildingEntity } from '../../hooks/useEntityFiltering';
// Import building restriction overlay for monument zones
import { renderBuildingRestrictionOverlay, BuildingRestrictionZoneConfig } from './buildingRestrictionOverlayUtils';
import { COMPOUND_BUILDINGS } from '../../config/compoundBuildings';
// Import sea stack renderer
import { renderSeaStackSingle } from './seaStackRenderingUtils';
// Import hearth renderer
import { renderHearth } from './hearthRenderingUtils';
// Import grass renderer
import { renderGrass } from './grassRenderingUtils';
// Import dropped item renderer
import { renderDroppedItem } from './droppedItemRenderingUtils';
// Import projectile renderer
import { renderProjectile } from './projectileRenderingUtils';
import { imageManager } from './imageManager';
import { getItemIcon } from '../itemIconUtils';
import { renderPlayerTorchLight, renderCampfireLight } from './lightRenderingUtils';
import { drawInteractionOutline, drawCircularInteractionOutline, getInteractionOutlineColor } from './outlineUtils';
import { drawDynamicGroundShadow } from './shadowUtils';
import { getTileTypeFromChunkData, worldPosToTileCoords } from './placementRenderingUtils';
// Import snow footprint system for alpine terrain
import { updatePlayerFootprints } from './snowFootprintUtils';

// Type alias for Y-sortable entities
import { YSortedEntityType } from '../../hooks/useEntityFiltering';
import { InterpolatedGrassData } from '../../hooks/useGrassInterpolation';

// Module-level cache for debug logging
const playerDebugStateCache = new Map<string, { prevIsDead: boolean, prevLastHitTime: string | null }>();



// Movement smoothing cache to prevent animation jitters
const playerMovementCache = new Map<string, { 
  lastMovementTime: number, 
  isCurrentlyMoving: boolean,
  lastKnownPosition: { x: number, y: number } | null
}>();

// Dodge roll visual effects cache
interface DodgeRollVisualState {
  startTime: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  direction: string;
  ghostTrailPositions: Array<{ x: number, y: number, alpha: number, timestamp: number }>;
}

const dodgeRollVisualCache = new Map<string, DodgeRollVisualState>();

// Movement buffer duration - keep animation going for this long after movement stops
const MOVEMENT_BUFFER_MS = 150;

// Dodge roll constants (should match server)
const DODGE_ROLL_DURATION_MS = 500;
const DODGE_ROLL_DISTANCE = 450;

// --- MEMORY OPTIMIZATION: Object Pools ---
// Reduces garbage collection pressure by reusing objects instead of creating new ones

// Position object pool
const positionPool: Array<{ x: number; y: number }> = [];
const maxPoolSize = 100;

function getPooledPosition(x: number, y: number): { x: number; y: number } {
const pos = positionPool.pop() || { x: 0, y: 0 };
pos.x = x;
pos.y = y;
return pos;
}

function releasePooledPosition(pos: { x: number; y: number }): void {
if (positionPool.length < maxPoolSize) {
  positionPool.push(pos);
}
}

// Cached transform values to avoid recalculation
const transformCache = new Map<string, {
lastUpdate: number;
transforms: { x: number; y: number; rotation: number; scale: number };
}>();

// Render state cache to avoid object creation
const renderStateCache = {
lastViewportBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
lastCameraX: 0,
lastCameraY: 0,
lastFrameTime: 0,
boundsUpdateThreshold: 10, // Only update bounds if camera moved more than this
};

// PERFORMANCE: Cached sprite coordinate calculations
const spriteCoordCache = new Map<string, {
spriteCol: number;
spriteRow: number;
lastUpdate: number;
}>();

// PERFORMANCE: Reduce object creation in hot paths
function getCachedSpriteCoordinates(
playerId: string,
direction: string,
frameIndex: number,
isIdle: boolean
): { spriteCol: number; spriteRow: number } {
const cacheKey = `${playerId}_${direction}_${frameIndex}_${isIdle}`;
const cached = spriteCoordCache.get(cacheKey);

// Cache coordinates for 100ms to avoid recalculation
const now = performance.now();
if (cached && (now - cached.lastUpdate) < 100) {
  return { spriteCol: cached.spriteCol, spriteRow: cached.spriteRow };
}

// Calculate coordinates (original logic)
let spriteCol = 0;
let spriteRow = 0;

if (isIdle) {
  spriteCol = frameIndex % 4; // Cycle through 4 idle frames
  // Use direction to determine sprite row (maintain consistent facing)
  switch (direction) {
    case 'right': spriteRow = 0; break;
    case 'left': spriteRow = 1; break;
    case 'up': spriteRow = 2; break;
    case 'down': spriteRow = 3; break;
    default: spriteRow = 3; break;
  }
} else {
  spriteCol = frameIndex % 4; // Walking frames
  switch (direction) {
    case 'right': spriteRow = 4; break;
    case 'left': spriteRow = 5; break;
    case 'up': spriteRow = 6; break;
    case 'down': spriteRow = 7; break;
    default: spriteRow = 7; break;
  }
}

// Update cache
spriteCoordCache.set(cacheKey, {
  spriteCol,
  spriteRow,
  lastUpdate: now
});

return { spriteCol, spriteRow };
}

// PERFORMANCE: Optimize viewport bounds checking
function getOptimizedViewportBounds(
canvasWidth: number,
canvasHeight: number,
cameraX: number,
cameraY: number
): { minX: number; maxX: number; minY: number; maxY: number } {
// Check if we can reuse cached bounds
const deltaX = Math.abs(cameraX - renderStateCache.lastCameraX);
const deltaY = Math.abs(cameraY - renderStateCache.lastCameraY);

if (deltaX < renderStateCache.boundsUpdateThreshold && 
    deltaY < renderStateCache.boundsUpdateThreshold) {
  return renderStateCache.lastViewportBounds;
}

// Calculate new bounds
const buffer = 200; // Render buffer around viewport
const bounds = {
  minX: cameraX - canvasWidth / 2 - buffer,
  maxX: cameraX + canvasWidth / 2 + buffer,
  minY: cameraY - canvasHeight / 2 - buffer,
  maxY: cameraY + canvasHeight / 2 + buffer
};

// Update cache
renderStateCache.lastViewportBounds = bounds;
renderStateCache.lastCameraX = cameraX;
renderStateCache.lastCameraY = cameraY;

return bounds;
}

// PERFORMANCE: Reduce function call overhead in hot paths
function isEntityInViewportBounds(
entityX: number,
entityY: number,
bounds: { minX: number; maxX: number; minY: number; maxY: number }
): boolean {
return entityX >= bounds.minX && 
       entityX <= bounds.maxX && 
       entityY >= bounds.minY && 
       entityY <= bounds.maxY;
}

// PERFORMANCE: Cache frequently accessed player data
const playerDataCache = new Map<string, {
lastPosition: { x: number; y: number };
lastDirection: string;
lastUpdateTime: number;
isMoving: boolean;
}>();

// PERFORMANCE: Optimized player movement detection
function hasPlayerMoved(
playerId: string,
currentX: number,
currentY: number,
threshold: number = 1.0
): boolean {
const cached = playerDataCache.get(playerId);
if (!cached) {
  // First time seeing this player
  playerDataCache.set(playerId, {
    lastPosition: { x: currentX, y: currentY },
    lastDirection: 'down',
    lastUpdateTime: performance.now(),
    isMoving: false
  });
  return false;
}

const deltaX = Math.abs(currentX - cached.lastPosition.x);
const deltaY = Math.abs(currentY - cached.lastPosition.y);
const moved = deltaX > threshold || deltaY > threshold;

// Update cache
cached.lastPosition.x = currentX;
cached.lastPosition.y = currentY;
cached.lastUpdateTime = performance.now();
cached.isMoving = moved;

return moved;
}

// PERFORMANCE: Cleanup cached data periodically
let lastCleanupTime = 0;
const CLEANUP_INTERVAL = 10000; // 10 seconds

function cleanupCaches(): void {
const now = performance.now();
if (now - lastCleanupTime < CLEANUP_INTERVAL) {
  return;
}

// Clean up sprite coordinate cache
const spriteExpiration = 5000; // 5 seconds
for (const [key, value] of spriteCoordCache) {
  if (now - value.lastUpdate > spriteExpiration) {
    spriteCoordCache.delete(key);
  }
}

// Clean up player data cache
const playerExpiration = 30000; // 30 seconds
for (const [key, value] of playerDataCache) {
  if (now - value.lastUpdateTime > playerExpiration) {
    playerDataCache.delete(key);
  }
}

// Clean up transform cache
const transformExpiration = 15000; // 15 seconds
for (const [key, value] of transformCache) {
  if (now - value.lastUpdate > transformExpiration) {
    transformCache.delete(key);
  }
}

lastCleanupTime = now;
}

// Ghost trail constants
const GHOST_TRAIL_LENGTH = 8;
const GHOST_TRAIL_SPACING_MS = 15; // Add new ghost every 15ms
const GHOST_TRAIL_FADE_MS = 200; // Fade out over 200ms

// --- Client-side animation tracking ---
const clientJumpStartTimes = new Map<string, number>(); // playerId -> client timestamp when jump started
const lastKnownServerJumpTimes = new Map<string, number>(); // playerId -> last known server timestamp

interface RenderYSortedEntitiesProps {
  ctx: CanvasRenderingContext2D;
  ySortedEntities: YSortedEntityType[];
  heroImageRef: React.RefObject<HTMLImageElement | null>;
  heroWaterImageRef: React.RefObject<HTMLImageElement | null>;
  heroCrouchImageRef: React.RefObject<HTMLImageElement | null>;
  heroSprintImageRef: React.RefObject<HTMLImageElement | null>;
  heroIdleImageRef: React.RefObject<HTMLImageElement | null>;
  heroSwimImageRef?: React.RefObject<HTMLImageElement | null>; // Add swim sprite ref (optional)
  heroDodgeImageRef?: React.RefObject<HTMLImageElement | null>; // NEW: Add dodge roll sprite ref (optional)
  lastPositionsRef: React.RefObject<Map<string, { x: number; y: number }>>;
  activeConnections: Map<string, ActiveConnection> | undefined;
  activeEquipments: Map<string, SpacetimeDBActiveEquipment>;
  activeConsumableEffects: Map<string, ActiveConsumableEffect>;
  itemDefinitions: Map<string, SpacetimeDBItemDefinition>;
  inventoryItems: Map<string, SpacetimeDBInventoryItem>; // Add inventory items for validation
  itemImagesRef: React.RefObject<Map<string, HTMLImageElement>>;
  doodadImagesRef: React.RefObject<Map<string, HTMLImageElement>>;
  shelterImage: HTMLImageElement | null;
  worldMouseX: number | null;
  worldMouseY: number | null;
  localPlayerId?: string;
  animationFrame: number;
  sprintAnimationFrame: number;
  idleAnimationFrame: number;
  nowMs: number;
  hoveredPlayerIds: Set<string>;
  onPlayerHover: (identity: string, hover: boolean) => void;
  cycleProgress: number;
  playerDodgeRollStates: Map<string, SpacetimeDBPlayerDodgeRollState>; // Add dodge roll states
  renderPlayerCorpse: (props: { 
      ctx: CanvasRenderingContext2D; 
      corpse: SpacetimeDBPlayerCorpse; 
      nowMs: number; 
      itemImagesRef: React.RefObject<Map<string, HTMLImageElement>>;
      heroImageRef: React.RefObject<HTMLImageElement | null>;
      heroWaterImageRef: React.RefObject<HTMLImageElement | null>;
      heroCrouchImageRef: React.RefObject<HTMLImageElement | null>;
      heroSwimImageRef: React.RefObject<HTMLImageElement | null>;
      isHovered?: boolean; // Whether this corpse is being hovered
  }) => void;
  localPlayerPosition?: { x: number; y: number } | null; // This is the predicted position
  remotePlayerInterpolation?: {
      updateAndGetSmoothedPosition: (player: any, localPlayerId?: string) => { x: number; y: number };
  };
  localPlayerIsCrouching?: boolean; // Local crouch state for immediate visual feedback
  // Closest interactable IDs for outline rendering
  closestInteractableCampfireId?: number | null;
  closestInteractableBoxId?: number | null;
  closestInteractableStashId?: number | null;
  closestInteractableSleepingBagId?: number | null;
  closestInteractableHarvestableResourceId?: bigint | null;
  closestInteractableDroppedItemId?: bigint | null;
  closestInteractableDoorId?: bigint | null; // ADDED: Door interaction
  // New unified single target system (replaces individual resource IDs)
  closestInteractableTarget?: { type: string; id: bigint | number | string; position: { x: number; y: number }; distance: number; isEmpty?: boolean; } | null;
  // NEW: Shelter clipping data for shadow rendering
  shelterClippingData?: Array<{posX: number, posY: number, isDestroyed: boolean}>;
  // ADD: Local facing direction for instant client-authoritative direction changes
  localFacingDirection?: string;
  // NEW: Visual cortex module setting for tree shadows
treeShadowsEnabled?: boolean;
// NEW: Falling tree animation state
isTreeFalling?: (treeId: string) => boolean;
getFallProgress?: (treeId: string) => number;
// ADDED: Camera offsets for foundation rendering
cameraOffsetX?: number;
cameraOffsetY?: number;
foundationTileImagesRef?: React.RefObject<Map<string, HTMLImageElement>>; // ADDED: Foundation tile images
  allWalls?: Map<string, any>; // ADDED: All walls to check for adjacent walls
  allFoundations?: Map<string, any>; // ADDED: All foundations to check for adjacent foundations
  allFences?: any[]; // ADDED: All fences for smart sprite selection based on neighbors
  buildingClusters?: Map<string, any>; // ADDED: Building clusters for fog of war
  playerBuildingClusterId?: string | null; // ADDED: Which building the player is in
  connection?: DbConnection | null; // ADDED: Connection for tile biome lookup
  isLocalPlayerSnorkeling?: boolean; // ADDED: Whether local player is snorkeling (underwater mode)
  alwaysShowPlayerNames?: boolean; // ADDED: Show player names above heads at all times
  playerStats?: Map<string, any>; // ADDED: Player stats for title display on name labels
  largeQuarries?: Map<string, any>; // ADDED: Large quarry locations for building restriction zones
  detectedHotSprings?: Array<{ id: string; posX: number; posY: number; radius: number }>; // ADDED: Hot spring locations for building restriction zones
  detectedQuarries?: Array<{ id: string; posX: number; posY: number; radius: number }>; // ADDED: Small quarry locations for building restriction zones
  placementInfo?: { itemDefId?: bigint; itemName?: string } | null; // ADDED: Current placement info for showing restriction zones when placing items
  // Animal breeding system data for age-based rendering and pregnancy indicators
  caribouBreedingData?: Map<string, CaribouBreedingData>; // ADDED: Caribou breeding data (sex, age, pregnancy)
  walrusBreedingData?: Map<string, WalrusBreedingData>; // ADDED: Walrus breeding data (sex, age, pregnancy)
  // Note: viewBounds for snow footprints has been moved to GameCanvas.tsx
  // Footprints are now rendered once before any renderYSortedEntities calls
}



/**
* Renders entities that need to be sorted by their Y-coordinate for correct overlapping.
*/
export const renderYSortedEntities = ({
  ctx,
  ySortedEntities,
  heroImageRef,
  heroWaterImageRef,
  heroCrouchImageRef,
  heroSprintImageRef,
  heroIdleImageRef,
  heroSwimImageRef,
  heroDodgeImageRef,
  lastPositionsRef,
  activeConnections,
  activeEquipments,
  activeConsumableEffects,
  itemDefinitions,
  inventoryItems,
  itemImagesRef,
  doodadImagesRef,
  shelterImage,
  worldMouseX,
  worldMouseY,
  localPlayerId,
  animationFrame,
  sprintAnimationFrame,
  idleAnimationFrame,
  nowMs,
  hoveredPlayerIds,
  onPlayerHover,
  cycleProgress,
  playerDodgeRollStates,
  renderPlayerCorpse: renderCorpse,
  localPlayerPosition,
  remotePlayerInterpolation,
  localPlayerIsCrouching,
  // Closest interactable IDs for outline rendering
  closestInteractableCampfireId,
  closestInteractableBoxId,
  closestInteractableStashId,
  closestInteractableSleepingBagId,
  closestInteractableHarvestableResourceId,
  closestInteractableDroppedItemId,
  closestInteractableDoorId, // ADDED: Door interaction
  // Unified target system (replaces individual resource IDs)
  closestInteractableTarget,
  shelterClippingData,
  // ADD: Local facing direction for client-authoritative direction changes
  localFacingDirection,
  // NEW: Visual cortex module setting for tree shadows
  treeShadowsEnabled = true,
  // NEW: Falling tree animation state
  isTreeFalling,
  getFallProgress,
  // ADDED: Pass camera offsets for foundation rendering
  cameraOffsetX = 0,
  cameraOffsetY = 0,
  foundationTileImagesRef,
  allWalls, // ADDED: All walls to check for adjacent walls
  allFoundations, // ADDED: All foundations to check for adjacent foundations
  allFences, // ADDED: All fences for smart sprite selection based on neighbors
  buildingClusters, // ADDED: Building clusters for fog of war
  playerBuildingClusterId, // ADDED: Which building the player is in
  connection, // ADDED: Connection for tile biome lookup
  isLocalPlayerSnorkeling = false, // ADDED: Whether local player is snorkeling (underwater mode)
  alwaysShowPlayerNames = false, // ADDED: Show player names above heads at all times
  playerStats, // ADDED: Player stats for title display on name labels
  largeQuarries, // ADDED: Large quarry locations for building restriction zones
  detectedHotSprings, // ADDED: Hot spring locations for building restriction zones
  detectedQuarries, // ADDED: Small quarry locations for building restriction zones
  placementInfo, // ADDED: Current placement info for showing restriction zones when placing items
  caribouBreedingData, // ADDED: Caribou breeding data (sex, age, pregnancy)
  walrusBreedingData, // ADDED: Walrus breeding data (sex, age, pregnancy)
}: RenderYSortedEntitiesProps) => {
  // PERFORMANCE: Clean up memory caches periodically
  cleanupCaches();
  
  // Precompute mapping from foundation cell coordinates to building cluster IDs and enclosure status
  const cellCoordToClusterId = new Map<string, string>();
  const clusterEnclosureStatus = new Map<string, boolean>();
  if (buildingClusters) {
      buildingClusters.forEach((cluster, clusterId) => {
          if (cluster?.cellCoords) {
              cluster.cellCoords.forEach((coord: string) => {
                  cellCoordToClusterId.set(coord, clusterId);
              });
              // Store whether this cluster is enclosed
              clusterEnclosureStatus.set(clusterId, cluster.isEnclosed || false);
          }
      });
  }
  
  // Precompute ALL entrance way foundations from fog_overlay entities
  // Walls on entrance way foundations should always be visible (no ceiling hiding them)
  const allEntranceWayFoundations = new Set<string>();
  ySortedEntities.forEach(({ type, entity }) => {
      if (type === 'fog_overlay') {
          const fogEntity = entity as { entranceWayFoundations?: string[] };
          if (fogEntity.entranceWayFoundations) {
              fogEntity.entranceWayFoundations.forEach(coord => {
                  allEntranceWayFoundations.add(coord);
              });
          }
      }
  });
  
  // Build fence position map for smart sprite selection (neighbor detection)
  // This allows fences to show proper end caps, center pieces, and corners
  const fencePositionMap = allFences ? buildFencePositionMap(allFences) : new Map<string, any>();
  
  // PERF FIX: Pre-index activeConsumableEffects by player ID for O(1) lookup per player.
  // Without this, renderPlayer iterates ALL effects (potentially hundreds) for EACH rendered player,
  // costing O(N_players × N_effects) per frame. With the index, each player only sees its own effects.
  const effectsByPlayerId = new Map<string, Map<string, ActiveConsumableEffect>>();
  const EMPTY_EFFECTS_MAP = new Map<string, ActiveConsumableEffect>();
  if (activeConsumableEffects) {
    for (const [effectId, effect] of activeConsumableEffects) {
      // Index by initiator player ID
      const initiatorId = effect.playerId.toHexString();
      if (!effectsByPlayerId.has(initiatorId)) {
        effectsByPlayerId.set(initiatorId, new Map());
      }
      effectsByPlayerId.get(initiatorId)!.set(effectId, effect);
      
      // Also index by target player ID (for remote healing glow on the target)
      if (effect.targetPlayerId) {
        const targetId = effect.targetPlayerId.toHexString();
        if (!effectsByPlayerId.has(targetId)) {
          effectsByPlayerId.set(targetId, new Map());
        }
        effectsByPlayerId.get(targetId)!.set(effectId, effect);
      }
    }
  }
  
  // NOTE: Underwater shadows are now rendered separately in GameCanvas.tsx
  // before the water overlay, not here in renderYSortedEntities
  
  // RENDERING PASS ORDER:
  // Pass 1: All Y-sorted entities (players, trees, placeables, ALL walls including south)
  //         - Walls properly Y-sort with players/trees so entities south of walls render on top
  // Pass 2-4: North doors (before ceiling tiles)
  // Pass 5: Fog overlays / ceiling tiles (with exclusions for entrance ways and south walls)
  // Pass 6: South doors (after ceiling tiles)
  
  // Pre-Pass: Render ward deterrence radius circles BEHIND all entities
  // This shows players the safe zones created by wards (both active and inactive)
  ySortedEntities.forEach(({ type, entity }) => {
      if (type === 'turret') {
          // Turrets don't have radius circles (unlike wards)
          // They render normally in the main pass
      } else if (type === 'lantern') {
          const lantern = entity as any;
          // Render radius for all wards (not regular lanterns) - both active and inactive states
          if (lantern.lanternType !== LANTERN_TYPE_LANTERN && !lantern.isDestroyed) {
              renderWardRadius(ctx, lantern, cycleProgress);
          }
      }
  });
  
  // NOTE: Snow/beach footprints are now rendered ONCE in GameCanvas.tsx before any
  // renderYSortedEntities calls. Previously they were here in Pre-Pass 2, but that
  // caused footprints to re-render on top of players when batched rendering splits
  // Y-sorted entities across multiple renderYSortedEntities calls (swimming players).
  
  // First Pass: Render all Y-sorted entities including ALL walls
  // ALL walls now render in Pass 1 for correct Y-sorting with players/placeables/trees
  // South walls still render in Pass 6 (after ceiling tiles) so they appear on the exterior
  ySortedEntities.forEach(({ type, entity }) => {
      // Skip fog overlays and doors - they render in later passes
      // NOTE: wall_cell is no longer skipped entirely - only south walls (edge 2) are skipped
      if (type === 'fog_overlay' || type === 'door') {
        return;
      }
      
      // Handle wall_cell: render ALL walls in Y-sorted order
      // CRITICAL FIX: South walls were previously in Pass 6 (after everything), causing them to 
      // always render on top of players/trees even when the player is south of the wall.
      // Now ALL walls render here in Pass 1, properly Y-sorted with other entities.
      // Ceiling tiles already exclude south wall foundations (via southWallFoundations set).
      if (type === 'wall_cell') {
          const wall = entity as SpacetimeDBWallCell;
          
          // Render ALL walls in their Y-sorted position
          const wallCellKey = `${wall.cellX},${wall.cellY}`;
          const wallClusterId = cellCoordToClusterId.get(wallCellKey);
          const playerInsideThisCluster = wallClusterId !== undefined && wallClusterId === playerBuildingClusterId;
          const isEnclosed = wallClusterId ? clusterEnclosureStatus.get(wallClusterId) || false : false;

          renderWall({
              ctx,
              wall: wall as any,
              worldScale: 1.0,
              viewOffsetX: -cameraOffsetX,
              viewOffsetY: -cameraOffsetY,
              foundationTileImagesRef: foundationTileImagesRef,
              allWalls: allWalls,
              cycleProgress: cycleProgress,
              localPlayerPosition: localPlayerPosition,
              playerInsideCluster: playerInsideThisCluster,
              isClusterEnclosed: isEnclosed,
              entranceWayFoundations: allEntranceWayFoundations,
          });
          return;
      }
      
      // Handle fence: render fences in Y-sorted order with smart sprite selection
      if (type === 'fence') {
          const fence = entity as SpacetimeDBFence;
          
          renderFence({
              ctx,
              fence: fence as any,
              worldScale: 1.0,
              viewOffsetX: -cameraOffsetX,
              viewOffsetY: -cameraOffsetY,
              foundationTileImagesRef: foundationTileImagesRef,
              cycleProgress: cycleProgress,
              localPlayerPosition: localPlayerPosition,
              fencePositionMap: fencePositionMap, // Pass for neighbor detection
              doodadImagesRef: doodadImagesRef, // Pass for fence sprite images
          });
          return;
      }
      
      // === UNDERWATER SNORKELING MODE ===
      // When snorkeling, hide most land-based entities - player is underwater
      // But allow underwater entities: players, living coral, submerged fumaroles, seaweed, and dropped items
      if (isLocalPlayerSnorkeling) {
        // Allow: players, living coral (always underwater), submerged fumaroles, SeaweedBed resources, dropped items, and projectiles
        const isSeaweedBed = type === 'harvestable_resource' && 
          (entity as SpacetimeDBHarvestableResource).plantType?.tag === 'SeaweedBed';
        
        // Planted SeaweedBed seeds (player-planted seaweed) should also be visible underwater
        const isPlantedSeaweed = type === 'planted_seed' && 
          (entity as SpacetimeDBPlantedSeed).plantType?.tag === 'SeaweedBed';
        
        const isUnderwaterEntity = 
          type === 'player' || 
          type === 'living_coral' || 
          type === 'dropped_item' || // Dropped items should be visible underwater (thrown harpoons, etc.)
          type === 'projectile' || // Projectiles should be visible underwater (thrown harpoons in flight, etc.)
          isSeaweedBed ||
          isPlantedSeaweed || // Planted seaweed fronds visible underwater
          (type === 'fumarole' && (entity as SpacetimeDBFumarole).isSubmerged);
        
        if (!isUnderwaterEntity) {
          return; // Skip all land-based entities when underwater
        }
      }
      
      if (type === 'player') {
          const player = entity as SpacetimeDBPlayer;
          const playerId = player.identity.toHexString();
          const isLocalPlayer = localPlayerId === playerId;

          // Create a modified player object with appropriate position system
          let playerForRendering = player;
          if (isLocalPlayer && localPlayerPosition) {
              // Local player uses predicted position AND local facing direction for instant visual feedback
              playerForRendering = {
                  ...player,
                  positionX: localPlayerPosition.x,
                  positionY: localPlayerPosition.y,
                  // CLIENT-AUTHORITATIVE: Use local facing direction for instant direction changes (no server lag)
                  direction: localFacingDirection || player.direction
              };
          } else if (!isLocalPlayer && remotePlayerInterpolation) {
              // Remote players use interpolated position between server updates
              const interpolatedPosition = remotePlayerInterpolation.updateAndGetSmoothedPosition(player, localPlayerId);
              playerForRendering = {
                  ...player,
                  positionX: interpolatedPosition.x,
                  positionY: interpolatedPosition.y
              };
          }

          const lastPos = lastPositionsRef.current.get(playerId);
          let isPlayerMoving = false;
          let movementReason = 'none';

         
          // Get or create movement cache for this player
          let movementCache = playerMovementCache.get(playerId);
          if (!movementCache) {
              movementCache = {
                  lastMovementTime: 0,
                  isCurrentlyMoving: false,
                  lastKnownPosition: null
              };
              playerMovementCache.set(playerId, movementCache);
          }
         
          // Check for actual position changes (skip if already detected dodge rolling)
          let hasPositionChanged = false;
          
          // Compare current position with last known position
          if (movementCache.lastKnownPosition) {
              const positionThreshold = 0.1; // Small threshold to avoid floating point precision issues
              const dx = Math.abs(playerForRendering.positionX - movementCache.lastKnownPosition.x);
              const dy = Math.abs(playerForRendering.positionY - movementCache.lastKnownPosition.y);
              hasPositionChanged = dx > positionThreshold || dy > positionThreshold;
          } else {
              // First time seeing this player, initialize position
              movementCache.lastKnownPosition = { x: playerForRendering.positionX, y: playerForRendering.positionY };
              hasPositionChanged = false;
          }
          
          // Update movement cache if position changed
          if (hasPositionChanged) {
              movementCache.lastMovementTime = nowMs;
              movementCache.isCurrentlyMoving = true;
              movementCache.lastKnownPosition = { x: playerForRendering.positionX, y: playerForRendering.positionY };
              isPlayerMoving = true;
              movementReason = 'position_change';
          } else {
              // Check if we're still in the movement buffer period
              const timeSinceLastMovement = nowMs - movementCache.lastMovementTime;
              if (timeSinceLastMovement < MOVEMENT_BUFFER_MS) {
                  isPlayerMoving = true;
                  movementReason = `movement_buffer(${timeSinceLastMovement}ms)`;
              } else {
                  movementCache.isCurrentlyMoving = false;
              }
          }
         
          // If position-based detection fails, check if player is actively sprinting
          if (!isPlayerMoving && playerForRendering.isSprinting) {
              movementCache.lastMovementTime = nowMs;
              movementCache.isCurrentlyMoving = true;
              isPlayerMoving = true;
              movementReason = 'sprinting';
          }
          
          // Update snow footprints for players walking on alpine terrain
          // This creates footprint trails that fade out over time
          // Skip footprints when player is dodging
          updatePlayerFootprints(connection ?? null, playerForRendering, isPlayerMoving, nowMs, playerDodgeRollStates);
         
          lastPositionsRef.current.set(playerId, { x: playerForRendering.positionX, y: playerForRendering.positionY });

         let jumpOffset = 0;
         let isCurrentlyJumping = false;
         const jumpStartTime = playerForRendering.jumpStartTimeMs;
         
         if (jumpStartTime > 0) {
             const serverJumpTime = Number(jumpStartTime);
             const playerId = playerForRendering.identity.toHexString();
             
             // Check if this is a NEW jump by comparing server timestamps
             const lastKnownServerTime = lastKnownServerJumpTimes.get(playerId) || 0;
             
             if (serverJumpTime !== lastKnownServerTime) {
                 // NEW jump detected! Record both server time and client time
                 lastKnownServerJumpTimes.set(playerId, serverJumpTime);
                 clientJumpStartTimes.set(playerId, nowMs);
             }
             
             // Calculate animation based on client time
             const clientStartTime = clientJumpStartTimes.get(playerId);
             if (clientStartTime) {
                 const elapsedJumpTime = nowMs - clientStartTime;
                 
                 if (elapsedJumpTime < JUMP_DURATION_MS) {
                     const t = elapsedJumpTime / JUMP_DURATION_MS;
                     jumpOffset = Math.sin(t * Math.PI) * 50;
                     isCurrentlyJumping = true; // Player is mid-jump
                 }
             }
         } else {
             // No jump active - clean up for this player
             const playerId = playerForRendering.identity.toHexString();
             clientJumpStartTimes.delete(playerId);
             lastKnownServerJumpTimes.delete(playerId);
         }
         
         // Dodge roll detection logic (for animation only)
         const dodgeRollState = playerDodgeRollStates.get(playerId);
         let isDodgeRolling = false;
         let dodgeRollProgress = 0;
         
         if (dodgeRollState) {
             // Use CLIENT reception time instead of server time to avoid clock drift issues
             const clientReceptionTime = (dodgeRollState as any).clientReceptionTimeMs || Date.now();
             const elapsed = nowMs - clientReceptionTime;
             
            if (elapsed < 500) { // 500ms dodge roll duration (SYNCED WITH SERVER)
                isDodgeRolling = true;
                dodgeRollProgress = elapsed / 500.0;
                 // Only log successful dodge rolls occasionally to reduce spam
                //  if (Math.random() < 0.05) { // 5% chance to log
                //      console.log(`[DODGE] Player dodging - Progress: ${(dodgeRollProgress * 100).toFixed(1)}%, elapsed: ${elapsed.toFixed(0)}ms`);
                //  }
             }
             // Silently ignore expired dodge states (elapsed > 400ms)
         }
         // No logging for players without dodge state - this is the normal case
         
         const currentlyHovered = isPlayerHovered(worldMouseX, worldMouseY, playerForRendering);
         const isPersistentlyHovered = alwaysShowPlayerNames || hoveredPlayerIds.has(playerId);
         
         // Choose sprite based on priority: dodge roll > water > crouching > default
         let heroImg: HTMLImageElement | null;
         // For local player, use immediate local crouch state; for others, use server state
         const effectiveIsCrouching = isLocalPlayer && localPlayerIsCrouching !== undefined 
             ? localPlayerIsCrouching 
             : playerForRendering.isCrouching;
         
         // console.log(`[DEBUG] Player ${playerId} image selection - isDodgeRolling:`, isDodgeRolling, 'effectiveIsCrouching:`, effectiveIsCrouching, 'isOnWater:', playerForRendering.isOnWater, 'isCurrentlyJumping:', isCurrentlyJumping);
         // console.log(`[DEBUG] Image refs available - heroImageRef:`, !!heroImageRef.current, 'heroWaterImageRef:', !!heroWaterImageRef.current, 'heroCrouchImageRef:', !!heroCrouchImageRef.current, 'heroDodgeImageRef:', !!heroDodgeImageRef?.current);
         
        if (isDodgeRolling) {
            heroImg = heroDodgeImageRef?.current || heroImageRef.current; // HIGHEST PRIORITY: Use dodge roll sprite when dodge rolling, fallback to normal
            // console.log(`[DEBUG] Using dodge roll sprite for ${playerId}:`, !!heroImg);
        } else if (playerForRendering.isOnWater && !isCurrentlyJumping) {
            // FIX: Add fallback to walking sprite if water sprite not loaded
            heroImg = heroWaterImageRef.current || heroImageRef.current; // Use water sprite when on water, fallback to walking sprite
           // console.log(`[DEBUG] Using water sprite for ${playerId}:`, !!heroImg);
        } else if (effectiveIsCrouching && !playerForRendering.isOnWater) {
            // FIX: Add fallback to walking sprite if crouch sprite not loaded
            heroImg = heroCrouchImageRef.current || heroImageRef.current; // Use crouch sprite when crouching, fallback to walking sprite
           // console.log(`[DEBUG] Using crouch sprite for ${playerId}:`, !!heroImg);
        } else {
            heroImg = heroImageRef.current; // DEFAULT: Use normal sprite otherwise
           // console.log(`[DEBUG] Using normal sprite for ${playerId}:`, !!heroImg);
        }
         const isOnline = activeConnections ? activeConnections.has(playerId) : false;

         const equipment = activeEquipments.get(playerId);
         let itemDef: SpacetimeDBItemDefinition | null = null;
         let itemImg: HTMLImageElement | null = null;

         if (equipment && equipment.equippedItemDefId && equipment.equippedItemInstanceId) {
           // Validate that the equipped item instance actually exists in inventory
           const equippedItemInstance = inventoryItems.get(equipment.equippedItemInstanceId.toString());
           if (equippedItemInstance && equippedItemInstance.quantity > 0) {
             itemDef = itemDefinitions.get(equipment.equippedItemDefId.toString()) || null;
             itemImg = (itemDef ? itemImagesRef.current.get(itemDef.iconAssetName) : null) || null;
      
           } else {
             // Item was consumed but equipment table hasn't updated yet - don't render
           }
         } else if (localPlayerId && playerId === localPlayerId) {
           // Debug logging removed for performance (was spamming every frame)
         }
         const canRenderItem = itemDef && itemImg && itemImg.complete && itemImg.naturalHeight !== 0;
         
          // PERF FIX: Use pre-indexed effects for this specific player (O(1) lookup vs O(N) iteration)
          const playerEffects = effectsByPlayerId.get(playerId) || EMPTY_EFFECTS_MAP;
         
          // Determine rendering order based on player direction
          if (playerForRendering.direction === 'up' || playerForRendering.direction === 'left') {
              // For UP or LEFT, item should be rendered BENEATH the player
            
            // Ghost trail disabled for cleaner dodge roll experience
            // if (heroImg && isDodgeRolling) {
            //     renderGhostTrail(ctx, playerId, heroImg, playerForRendering);
            // }
            
            if (canRenderItem && equipment) {
                  // Pass player.direction (server-synced) for accurate attack arc display
                  // Pass snorkeling state for underwater teal tint effect
                  const playerIsSnorkelingForItem = isLocalPlayer ? isLocalPlayerSnorkeling : playerForRendering.isSnorkeling;
                  renderEquippedItem(ctx, playerForRendering, equipment, itemDef!, itemDefinitions, itemImg!, nowMs, jumpOffset, itemImagesRef.current, playerEffects, localPlayerId, player.direction, playerIsSnorkelingForItem);
            }
            
            // console.log(`[DEBUG] Rendering player ${playerId} - heroImg available:`, !!heroImg, 'direction:', playerForRendering.direction);
            if (heroImg) {
              // console.log(`[DEBUG] Calling renderPlayer for ${playerId}`);
              // Choose animation frame based on player state and environment
              let currentAnimFrame: number;
              if (playerForRendering.isOnWater) {
                currentAnimFrame = isPlayerMoving ? animationFrame : idleAnimationFrame; // Use movement frames when moving, idle when still - for better sync
              } else {
                // Land animations
                if (!isPlayerMoving) {
                  currentAnimFrame = idleAnimationFrame; // Use idle animation when not moving
                } else if (playerForRendering.isSprinting) {
                  currentAnimFrame = sprintAnimationFrame; // Use sprint animation when sprinting
                } else {
                  currentAnimFrame = animationFrame; // Use walking animation for normal movement
                }
              }
              // Determine if this player should use snorkeling mode rendering
              // Local player: use isLocalPlayerSnorkeling (for optimistic/predicted state)
              // Remote player: use their synced isSnorkeling flag
              const playerIsSnorkeling = playerId === localPlayerId 
                ? isLocalPlayerSnorkeling 
                : playerForRendering.isSnorkeling;
              
              // For swimming players, render only the bottom half (underwater portion) - but skip underwater shadow since it was rendered earlier
              // EXCEPTION: When snorkeling, render full sprite (player is fully underwater)
              const renderHalf = (playerForRendering.isOnWater && !playerForRendering.isDead && !playerForRendering.isKnockedOut && !playerIsSnorkeling) ? 'bottom' : 'full';
              
              // Use normal player position (movement system handles dodge roll speed)
              const playerForRender = playerForRendering;
              
              // Get player's active title from playerStats
              const playerStatsEntry = playerStats?.get(playerId);
              const playerActiveTitle = playerStatsEntry?.activeTitleId || null;
              
              renderPlayer(
                      ctx, 
                      playerForRender, 
                      heroImg, 
                      heroSprintImageRef.current || heroImg, 
                      heroIdleImageRef.current || heroImg,
                      heroCrouchImageRef.current || heroImg, // crouch sprite
                      heroSwimImageRef?.current || heroImg, // swim sprite
                      heroDodgeImageRef?.current || heroImg, // NEW: dodge roll sprite
                      isOnline, 
                      isPlayerMoving, 
                      currentlyHovered,
                currentAnimFrame, // Use appropriate animation frame
                nowMs, 
                jumpOffset,
                isPersistentlyHovered,
                playerEffects, // PERF FIX: Pre-indexed effects for this player only
                localPlayerId,
                false, // isCorpse
                cycleProgress, // cycleProgress
                localPlayerIsCrouching, // NEW: pass local crouch state for optimistic rendering
                renderHalf, // Render full player for normal Y-sorting (or full when snorkeling)
                isDodgeRolling, // NEW: pass dodge roll state
                dodgeRollProgress, // NEW: pass dodge roll progress
                playerIsSnorkeling, // NEW: pass snorkeling state for underwater rendering
                isLocalPlayerSnorkeling, // NEW: pass viewer's underwater state for underwater-from-above effects
                playerActiveTitle // NEW: pass player's active title for name label
              );
            }
            // heroImg not loaded yet - skip rendering silently (will render once loaded)
          } else { // This covers 'down' or 'right'
              // For DOWN or RIGHT, item should be rendered ABOVE the player
            // console.log(`[DEBUG] Rendering player ${playerId} (down/right) - heroImg available:`, !!heroImg, 'direction:', playerForRendering.direction);
            if (heroImg) {
              // console.log(`[DEBUG] Calling renderPlayer for ${playerId} (down/right)`);
              // Choose animation frame based on player state and environment
              let currentAnimFrame: number;
              if (playerForRendering.isOnWater) {
                currentAnimFrame = isPlayerMoving ? animationFrame : idleAnimationFrame; // Use movement frames when moving, idle when still - for better sync
              } else {
                // Land animations
                if (!isPlayerMoving) {
                  currentAnimFrame = idleAnimationFrame; // Use idle animation when not moving
                } else if (playerForRendering.isSprinting) {
                  currentAnimFrame = sprintAnimationFrame; // Use sprint animation when sprinting
                } else {
                  currentAnimFrame = animationFrame; // Use walking animation for normal movement
                }
              }
              // Determine if this player should use snorkeling mode rendering
              // Local player: use isLocalPlayerSnorkeling (for optimistic/predicted state)
              // Remote player: use their synced isSnorkeling flag
              const playerIsSnorkeling = playerId === localPlayerId 
                ? isLocalPlayerSnorkeling 
                : playerForRendering.isSnorkeling;
              
              // For swimming players, render only the bottom half (underwater portion) - but skip underwater shadow since it was rendered earlier
              // EXCEPTION: When snorkeling, render full sprite (player is fully underwater)
              const renderHalf = (playerForRendering.isOnWater && !playerForRendering.isDead && !playerForRendering.isKnockedOut && !playerIsSnorkeling) ? 'bottom' : 'full';
              
              // Use normal player position (movement system handles dodge roll speed)
              const playerForRender = playerForRendering;
              
              // Get player's active title from playerStats (same lookup as up/left case)
              const playerStatsEntry2 = playerStats?.get(playerId);
              const playerActiveTitle2 = playerStatsEntry2?.activeTitleId || null;
              
              renderPlayer(
                  ctx, 
                  playerForRender, 
                  heroImg, 
                  heroSprintImageRef.current || heroImg, 
                  heroIdleImageRef.current || heroImg,
                  heroCrouchImageRef.current || heroImg, // crouch sprite
                  heroSwimImageRef?.current || heroImg, // swim sprite  
                  heroDodgeImageRef?.current || heroImg, // NEW: dodge roll sprite
                  isOnline, 
                  isPlayerMoving, 
                  currentlyHovered,
                currentAnimFrame, // Use appropriate animation frame
                nowMs, 
                jumpOffset,
                isPersistentlyHovered,
                playerEffects, // PERF FIX: Pre-indexed effects for this player only
                localPlayerId,
                false, // isCorpse
                cycleProgress, // cycleProgress
                localPlayerIsCrouching, // NEW: pass local crouch state for optimistic rendering
                renderHalf, // Render full player for normal Y-sorting (or full when snorkeling)
                isDodgeRolling, // NEW: pass dodge roll state
                dodgeRollProgress, // NEW: pass dodge roll progress
                playerIsSnorkeling, // NEW: pass snorkeling state for underwater rendering
                isLocalPlayerSnorkeling, // NEW: pass viewer's underwater state for underwater-from-above effects
                playerActiveTitle2 // NEW: pass player's active title for name label
              );
            }
            // heroImg not loaded yet - skip rendering silently (will render once loaded)
            if (canRenderItem && equipment) {
                  // Pass player.direction (server-synced) for accurate attack arc display
                  // Pass snorkeling state for underwater teal tint effect
                  const playerIsSnorkelingForItem = isLocalPlayer ? isLocalPlayerSnorkeling : playerForRendering.isSnorkeling;
                  renderEquippedItem(ctx, playerForRendering, equipment, itemDef!, itemDefinitions, itemImg!, nowMs, jumpOffset, itemImagesRef.current, playerEffects, localPlayerId, player.direction, playerIsSnorkelingForItem);
            }
            
            // Ghost trail disabled for cleaner dodge roll experience
            // if (heroImg && isDodgeRolling) {
            //     renderGhostTrail(ctx, playerId, heroImg, playerForRendering);
            // }
         }

         // Check if this knocked out player is the closest interactable target
         const isTheClosestKnockedOutTarget = closestInteractableTarget?.type === 'knocked_out_player' && closestInteractableTarget?.id === playerId;

         // Draw outline for knocked out players who are the closest interactable target
         if (isTheClosestKnockedOutTarget && playerForRendering.isKnockedOut && !playerForRendering.isDead) {
             const outlineColor = getInteractionOutlineColor('revive');
             // Use an oval outline that's wider than tall to represent a lying down player
             drawCircularInteractionOutline(ctx, playerForRendering.positionX, playerForRendering.positionY, 40, cycleProgress, outlineColor);
         }
      } else if (type === 'tree') {
          // Render tree with its shadow in the normal order (shadow first, then tree)
          const tree = entity as SpacetimeDBTree;
          const treeId = tree.id.toString();
          const isFalling = isTreeFalling ? isTreeFalling(treeId) : false;
          const fallProgress = isFalling && getFallProgress ? getFallProgress(treeId) : undefined;
          
          // BUGFIX: Skip rendering destroyed trees that are no longer falling
          // This guards against cache race conditions where the tree is still in the
          // cached visible list after the falling animation ends
          if (tree.health === 0 && !isFalling) {
              return; // Skip this tree - it's destroyed and animation is done
          }
          
          // Render tree with its shadow in the normal order (shadow first, then tree)
          // NOTE: Canopy shadows are rendered via a separate overlay pass (renderTreeCanopyShadowsOverlay)
          // which runs AFTER all Y-sorted entities. This allows shadows to appear ON TOP of all entities
          // walking under trees, while respecting tree-to-tree Y-sorting (shadows from behind trees
          // don't appear on front tree canopies)
          renderTree(ctx, tree, nowMs, cycleProgress, false, false, localPlayerPosition, treeShadowsEnabled, isFalling, fallProgress);
      } else if (type === 'stone') {
          // Render stone with its shadow in the normal order (shadow first, then stone)
          renderStone(ctx, entity as SpacetimeDBStone, nowMs, cycleProgress, false, false);
      } else if (type === 'rune_stone') {
          // Render rune stone with its shadow in the normal order (shadow first, then rune stone)
          const runeStone = entity as SpacetimeDBRuneStone;
          
          // Check if local player has Blueprint equipped OR is placing a placeable item to show building restriction overlay
          let showBuildingRestriction = false;
          // First check: Is any placeable item currently being placed? (placementInfo is non-null)
          if (placementInfo) {
              showBuildingRestriction = true;
          }
          // Second check: Is Blueprint equipped? (via ActiveEquipment)
          if (!showBuildingRestriction && localPlayerId && activeEquipments && itemDefinitions) {
              const localEquipment = activeEquipments.get(localPlayerId);
              if (localEquipment?.equippedItemDefId) {
                  const equippedItemDef = itemDefinitions.get(localEquipment.equippedItemDefId.toString());
                  // Show restriction zones for Blueprint (Placeable items use placementInfo instead)
                  if (equippedItemDef?.name === 'Blueprint') {
                      showBuildingRestriction = true;
                  }
              }
          }
          
          renderRuneStone(ctx, runeStone, nowMs, cycleProgress, false, false, localPlayerPosition, showBuildingRestriction);
      } else if (type === 'cairn') {
          // Render cairn with interaction indicator if in range
          const cairn = entity as SpacetimeDBCairn;
          const isTheClosestTarget = closestInteractableTarget?.type === 'cairn' && 
                                       closestInteractableTarget?.id === cairn.id;
          // Note: renderCairn no longer draws its own indicator - we use the standard outline below
          renderCairn(ctx, cairn, cameraOffsetX, cameraOffsetY, connection ?? null, false, nowMs, cycleProgress);
          
          // Draw outline only if this is THE closest interactable target
          if (isTheClosestTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              const config = ENTITY_VISUAL_CONFIG.cairn;
              const outline = getInteractionOutlineParams(cairn.posX, cairn.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'shelter') {
          const shelter = entity as SpacetimeDBShelter;
          if (shelterImage) { 
              renderShelter({
                  ctx,
                  shelter,
                  shelterImage: shelterImage, 
                  nowMs,
                  cycleProgress,
                  localPlayerId,
                  localPlayerPosition,
              });
          } else {
              // console.warn('[renderYSortedEntities] Shelter image not available for shelter:', shelter.id); // DEBUG LOG
          }
      } else if (type === 'harvestable_resource') {
          const resource = entity as SpacetimeDBHarvestableResource;
          
          // Check if this is an underwater plant (SeaweedBed)
          const isSeaweedBed = resource.plantType?.tag === 'SeaweedBed';
          
          if (isSeaweedBed) {
            // SeaweedBed rendering with underwater visibility effects
            if (!isLocalPlayerSnorkeling) {
              // Above water view: render seaweed blurry (visible but hard to interact with)
              ctx.save();
              ctx.filter = 'blur(2px)';
              ctx.globalAlpha = 0.6;
              renderHarvestableResource(ctx, resource, nowMs, cycleProgress);
              ctx.restore();
            } else {
              // Underwater view - render clearly with teal underwater tint
              ctx.save();
              ctx.globalAlpha = 1.0;
              // Apply subtle teal tint for underwater ambiance (same as planted seaweed)
              ctx.filter = 'sepia(20%) hue-rotate(140deg) saturate(120%)';
              renderHarvestableResource(ctx, resource, nowMs, cycleProgress);
              ctx.restore();
            }
          } else {
            // Normal harvestable resources - use unified renderer
            renderHarvestableResource(ctx, resource, nowMs, cycleProgress);
          }
          
          // Note: Green circle outline removed - interaction indicators now handled by cyberpunk "E" labels only
      } else if (type === 'campfire') {
          const campfire = entity as SpacetimeDBCampfire;
          const isTheClosestTarget = closestInteractableTarget?.type === 'campfire' && closestInteractableTarget?.id === campfire.id;
          // Pass player position for health bar rendering on opposite side (like barrels)
          const playerX = localPlayerPosition?.x;
          const playerY = localPlayerPosition?.y;
          renderCampfire(ctx, campfire, nowMs, cycleProgress, false, false, playerX, playerY);
          
          // Draw outline only if this is THE closest interactable target
          if (isTheClosestTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              const config = ENTITY_VISUAL_CONFIG.campfire;
              const outline = getInteractionOutlineParams(campfire.posX, campfire.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'furnace') {
          const furnace = entity as any;
          const isTheClosestTarget = closestInteractableTarget?.type === 'furnace' && closestInteractableTarget?.id === furnace.id;
          // Pass player position for health bar rendering on opposite side (like barrels)
          const playerX = localPlayerPosition?.x;
          const playerY = localPlayerPosition?.y;
          renderFurnace(ctx, furnace, nowMs, cycleProgress, false, false, playerX, playerY, localPlayerPosition);
          
          // Draw outline only if this is THE closest interactable target
          if (isTheClosestTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              // Select config based on furnace type and monument status
              let config;
              if (furnace.furnaceType === 1 && furnace.isMonument) {
                  config = ENTITY_VISUAL_CONFIG.monument_large_furnace;
              } else if (furnace.furnaceType === 1) {
                  config = ENTITY_VISUAL_CONFIG.large_furnace;
              } else {
                  config = ENTITY_VISUAL_CONFIG.furnace;
              }
              const outline = getInteractionOutlineParams(furnace.posX, furnace.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'barbecue') { // ADDED: Barbecue handling (same as campfire)
          const barbecue = entity as any; // Barbecue type from generated types
          const isTheClosestTarget = closestInteractableTarget?.type === 'barbecue' && closestInteractableTarget?.id === barbecue.id;
          // Pass player position for health bar rendering on opposite side (like barrels)
          const playerX = localPlayerPosition?.x;
          const playerY = localPlayerPosition?.y;
          renderBarbecue(ctx, barbecue, nowMs, cycleProgress, false, false, playerX, playerY);
          
          // Draw outline only if this is THE closest interactable target
          if (isTheClosestTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              // Use centralized visual config for consistent bounds
              const config = ENTITY_VISUAL_CONFIG.barbecue;
              const outline = getInteractionOutlineParams(barbecue.posX, barbecue.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'turret') {
          const turret = entity as SpacetimeDBTurret;
          const isTheClosestTarget = closestInteractableTarget?.type === 'turret' && closestInteractableTarget?.id === turret.id;
          
          // Use camera offsets from function parameters (passed from GameCanvas)
          const camX = cameraOffsetX ?? 0;
          const camY = cameraOffsetY ?? 0;
          // Pass player position for health bar rendering on opposite side (like barrels, campfires, furnaces)
          const playerX = localPlayerPosition?.x;
          const playerY = localPlayerPosition?.y;
          renderTurret(ctx, turret, camX, camY, cycleProgress, playerX, playerY);
          
          if (isTheClosestTarget) {
              const config = ENTITY_VISUAL_CONFIG.turret;
              const outlineColor = getInteractionOutlineColor('turret');
              const outline = getInteractionOutlineParams(turret.posX, turret.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'lantern') {
          const lantern = entity as any;
          const isTheClosestTarget = closestInteractableTarget?.type === 'lantern' && closestInteractableTarget?.id === lantern.id;
          // Pass localPlayerPosition for transparency occlusion (wards are tall and can block player view)
          // Also pass playerX/playerY for health bar rendering (shows on opposite side from player)
          renderLantern(ctx, lantern, nowMs, cycleProgress, undefined, undefined, localPlayerPosition?.x, localPlayerPosition?.y, localPlayerPosition);
          
          if (isTheClosestTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              // Use appropriate config based on lantern type (wards have larger bounds)
              let config = ENTITY_VISUAL_CONFIG.lantern;
              if (lantern.lanternType === 1) { // LANTERN_TYPE_ANCESTRAL_WARD
                  config = ENTITY_VISUAL_CONFIG.ancestral_ward;
              } else if (lantern.lanternType === 2) { // LANTERN_TYPE_SIGNAL_DISRUPTOR
                  config = ENTITY_VISUAL_CONFIG.signal_disruptor;
              } else if (lantern.lanternType === 3) { // LANTERN_TYPE_MEMORY_BEACON
                  config = ENTITY_VISUAL_CONFIG.memory_beacon;
              }
              const outline = getInteractionOutlineParams(lantern.posX, lantern.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'broth_pot') {
          const brothPot = entity as SpacetimeDBBrothPot;
          renderBrothPot(ctx, brothPot, nowMs, cycleProgress);
      } else if (type === 'dropped_item') {
          const droppedItem = entity as SpacetimeDBDroppedItem;
          const itemDef = itemDefinitions.get(droppedItem.itemDefId.toString());
          
          // Apply underwater teal tint when snorkeling (items visible underwater)
          if (isLocalPlayerSnorkeling) {
              ctx.save();
              ctx.globalAlpha = 1.0;
              // Apply subtle teal tint for underwater ambiance (same as seaweed/planted seeds)
              ctx.filter = 'sepia(20%) hue-rotate(140deg) saturate(120%)';
              renderDroppedItem({ ctx, item: droppedItem, itemDef, nowMs, cycleProgress });
              ctx.restore();
          } else {
              renderDroppedItem({ ctx, item: droppedItem, itemDef, nowMs, cycleProgress });
          }
      } else if (type === 'sleeping_bag') {
          const sleepingBag = entity as SpacetimeDBSleepingBag;
          renderSleepingBag(ctx, sleepingBag, nowMs, cycleProgress);
      } else if (type === 'stash') {
          const stash = entity as SpacetimeDBStash;
          const isTheClosestTarget = closestInteractableTarget?.type === 'stash' && closestInteractableTarget?.id === stash.id;
          
          // Always render the stash (will show nothing if hidden, but that's okay)
          renderStash(ctx, stash, nowMs, cycleProgress);
          
          // Draw outline if this is the closest target, even if stash is hidden
          if (isTheClosestTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              const config = ENTITY_VISUAL_CONFIG.stash;
              const outline = getInteractionOutlineParams(stash.posX, stash.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'wooden_storage_box') {
          const box = entity as SpacetimeDBWoodenStorageBox;
          const isTheClosestTarget = closestInteractableTarget?.type === 'box' && closestInteractableTarget?.id === box.id;
          // Pass player position for health bar rendering on opposite side (like barrels, campfires, furnaces)
          const playerX = localPlayerPosition?.x;
          const playerY = localPlayerPosition?.y;
          renderWoodenStorageBox(ctx, box, nowMs, cycleProgress, playerX, playerY, inventoryItems, itemDefinitions);
          
          if (isTheClosestTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              // Use appropriate config for each box type
              let config;
              if (box.boxType === BOX_TYPE_COMPOST) {
                  config = ENTITY_VISUAL_CONFIG.compost;
              } else if (box.boxType === BOX_TYPE_REFRIGERATOR) {
                  config = ENTITY_VISUAL_CONFIG.refrigerator;
              } else if (box.boxType === BOX_TYPE_REPAIR_BENCH) {
                  config = ENTITY_VISUAL_CONFIG.repair_bench;
              } else if (box.boxType === BOX_TYPE_COOKING_STATION) {
                  config = ENTITY_VISUAL_CONFIG.cooking_station;
              } else if (box.boxType === BOX_TYPE_SCARECROW) {
                  config = ENTITY_VISUAL_CONFIG.scarecrow;
              } else if (box.boxType === BOX_TYPE_MILITARY_RATION) {
                  config = ENTITY_VISUAL_CONFIG.military_ration;
              } else if (box.boxType === BOX_TYPE_MINE_CART) {
                  config = ENTITY_VISUAL_CONFIG.mine_cart;
              } else if (box.boxType === BOX_TYPE_FISH_TRAP) {
                  config = ENTITY_VISUAL_CONFIG.fish_trap;
              } else if (box.boxType === BOX_TYPE_WILD_BEEHIVE) {
                  config = ENTITY_VISUAL_CONFIG.wild_beehive;
              } else {
                  config = ENTITY_VISUAL_CONFIG.wooden_storage_box;
              }
              const outline = getInteractionOutlineParams(box.posX, box.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'player_corpse') {
          const corpse = entity as SpacetimeDBPlayerCorpse;
          
          // Check if mouse is hovering over this corpse (for nametag display)
          const isMouseHoveringCorpse = isCorpseHovered(worldMouseX, worldMouseY, corpse);
          
          // Check if this corpse is the closest interactable target (for blue outline)
          const isTheClosestTarget = closestInteractableTarget && 
                                   closestInteractableTarget.type === 'corpse' && 
                                   closestInteractableTarget.id.toString() === corpse.id.toString();
          
          renderCorpse({ 
              ctx, 
              corpse, 
              nowMs, 
              itemImagesRef,
              heroImageRef,
              heroWaterImageRef,
              heroCrouchImageRef,
              heroSwimImageRef: heroSwimImageRef || { current: null },
              isHovered: isMouseHoveringCorpse, // Show nametag when mouse hovers (not just closest target)
          });
          
          // Draw outline only if this is THE closest interactable target
          if (isTheClosestTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              const config = ENTITY_VISUAL_CONFIG.player_corpse;
              const outline = getInteractionOutlineParams(corpse.posX, corpse.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'grass') {
          // Grass rendered from Y-sorted entities - use 'near' LOD since it's already visibility filtered
          renderGrass(ctx, entity as InterpolatedGrassData, nowMs, cycleProgress, false, true, 'near');
      } else if (type === 'projectile') {
          const projectile = entity as SpacetimeDBProjectile;
          
          // Check if this is a turret tallow projectile (source_type = 1)
          // Turret projectiles are rendered as primitives (glowing orange circles), not sprites
          const PROJECTILE_SOURCE_TURRET = 1;
          const PROJECTILE_SOURCE_NPC = 2;
          const isTurretTallow = projectile.sourceType === PROJECTILE_SOURCE_TURRET;
          const isNpcProjectile = projectile.sourceType === PROJECTILE_SOURCE_NPC;
          
          if (isTurretTallow || isNpcProjectile) {
              // Turret and NPC projectiles are rendered as primitives - no image needed
              // Create a dummy image object for the renderProjectile function
              // (it will detect source_type and render as primitive instead)
              const dummyImage = new Image();
              dummyImage.width = 16;
              dummyImage.height = 16;
              
              renderProjectile({
                  ctx,
                  projectile,
                  arrowImage: dummyImage, // Dummy image - rendering uses source_type to render primitives
                  currentTimeMs: nowMs,
                  itemDefinitions,
                  applyUnderwaterTint: isLocalPlayerSnorkeling,
              });
          } else {
              // Regular projectiles (arrows, bullets, thrown items) - use sprite images
              // Debug logging disabled for performance - uncomment to debug projectile rendering
              // console.log(`🏹 [RENDER] Projectile ${projectile.id} found in render queue`);
              
              // Check if this is a thrown weapon (ammo_def_id == item_def_id)
              const isThrown = projectile.ammoDefId === projectile.itemDefId;
              
              // Get the appropriate definition and image
              const ammoDef = itemDefinitions.get(projectile.ammoDefId.toString());
              let projectileImageName: string;
              
              if (isThrown && ammoDef) {
                  // For thrown weapons, use the weapon's icon
                  projectileImageName = ammoDef.iconAssetName;
              } else if (ammoDef) {
                  // For regular projectiles (arrows), use the ammunition's icon
                  projectileImageName = ammoDef.iconAssetName;
              } else {
                  // Fallback for missing definitions
                  projectileImageName = 'wooden_arrow.png';
                  console.warn(`🏹 [RENDER] No ammo definition found for projectile ${projectile.id}, using fallback`);
              }
              
              // Use imageManager to get the projectile image for production compatibility
              const projectileImageSrc = getItemIcon(projectileImageName);
              const projectileImage = imageManager.getImage(projectileImageSrc);
              
              if (projectileImage) {
                  renderProjectile({
                      ctx,
                      projectile,
                      arrowImage: projectileImage, // Note: parameter name is still 'arrowImage' but now handles both
                      currentTimeMs: nowMs,
                      itemDefinitions, // FIXED: Add itemDefinitions for weapon type detection
                      applyUnderwaterTint: isLocalPlayerSnorkeling, // Teal tint when local player is underwater
                  });
              } else {
                  console.warn(`🏹 [RENDER] Image not loaded: ${projectileImageName} for projectile ${projectile.id}`);
              }
          }
      } else if (type === 'planted_seed') {
          const plantedSeed = entity as SpacetimeDBPlantedSeed;
          const plantedSeedImg = doodadImagesRef.current?.get('planted_seed.png');
          
          // Check if this is an underwater planted seed (seaweed)
          const isUnderwaterPlant = plantedSeed.plantType?.tag === 'SeaweedBed';
          
          if (isUnderwaterPlant) {
              // Underwater seaweed rendering with visibility from both above and below water
              const viewingFromAbove = !isLocalPlayerSnorkeling;
              
              if (viewingFromAbove) {
                  // Viewing seaweed from above water - apply blur and transparency
                  const savedFilter = ctx.filter;
                  ctx.filter = 'blur(2px)';
                  ctx.globalAlpha = 0.6; // Semi-transparent when viewed from above
                  renderPlantedSeed(ctx, plantedSeed, nowMs, cycleProgress, plantedSeedImg);
                  ctx.filter = savedFilter;
                  ctx.globalAlpha = 1.0;
              } else {
                  // Underwater view - render clearly with teal underwater tint
                  ctx.save();
                  ctx.globalAlpha = 1.0;
                  // Apply subtle teal tint for underwater ambiance
                  ctx.filter = 'sepia(20%) hue-rotate(140deg) saturate(120%)';
                  renderPlantedSeed(ctx, plantedSeed, nowMs, cycleProgress, plantedSeedImg);
                  ctx.restore();
              }
          } else {
              // Normal land-based planted seeds
              renderPlantedSeed(ctx, plantedSeed, nowMs, cycleProgress, plantedSeedImg);
          }
      } else if (type === 'rain_collector') {
          const rainCollector = entity as SpacetimeDBRainCollector;
          renderRainCollector(ctx, rainCollector, nowMs, cycleProgress, undefined, undefined, localPlayerPosition ?? undefined);
          
          // Check if this rain collector is the closest interactable target
          const isTheClosestTarget = closestInteractableTarget && 
                                   closestInteractableTarget.type === 'rain_collector' && 
                                   closestInteractableTarget.id.toString() === rainCollector.id.toString();
          
          // Draw outline only if this is THE closest interactable target
          if (isTheClosestTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              // Select config based on monument status
              const config = rainCollector.isMonument
                  ? ENTITY_VISUAL_CONFIG.monument_rain_collector
                  : ENTITY_VISUAL_CONFIG.rain_collector;
              const outline = getInteractionOutlineParams(rainCollector.posX, rainCollector.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'wild_animal') {
          const wildAnimal = entity as SpacetimeDBWildAnimal;
          renderWildAnimal({
              ctx,
              animal: wildAnimal,
              nowMs,
              cycleProgress,
              animationFrame,
              localPlayerPosition: localPlayerPosition || { x: 0, y: 0 },
              isLocalPlayerSnorkeling, // Pass snorkeling state for underwater rendering (sharks)
              caribouBreedingData, // Pass breeding data for age-based size scaling
              walrusBreedingData, // Pass breeding data for age-based size scaling
          });
          
          // Render thought bubbles for tamed animals (hearts, crying, etc.)
          renderTamingThoughtBubbles({
              ctx,
              animal: wildAnimal,
              nowMs,
          });
          
          // Render pregnancy indicator thought bubble for pregnant caribou/walrus (both wild and tamed)
          renderPregnancyIndicator({
              ctx,
              animal: wildAnimal,
              nowMs,
              caribouBreedingData,
              walrusBreedingData,
          });
          
          // ADDED: Draw interaction outline for milkable animals
          // Check if this animal is the closest milkable target
          const isMilkableTarget = closestInteractableTarget?.type === 'milkable_animal' && 
                                   closestInteractableTarget?.id === wildAnimal.id;
          if (isMilkableTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              const config = ENTITY_VISUAL_CONFIG.milkable_animal;
              const outline = getInteractionOutlineParams(wildAnimal.posX, wildAnimal.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'animal_corpse') {
          const animalCorpse = entity as SpacetimeDBAnimalCorpse;
          renderAnimalCorpse(ctx, animalCorpse, nowMs);
      } else if (type === 'barrel') {
          const barrel = entity as any; // Use any for now, will be properly typed
          // Check if this barrel is the closest interactable target  
          const isTheClosestTarget = closestInteractableTarget?.type === 'barrel' && closestInteractableTarget?.id === barrel.id;
          
          // Create callback to check if barrel is on a sea tile
          // This prevents sea barrel water effects from rendering when barrels are on land (e.g., beach)
          const isOnSeaTile = (worldX: number, worldY: number): boolean => {
              if (!connection) return false;
              const { tileX, tileY } = worldPosToTileCoords(worldX, worldY);
              const tileType = getTileTypeFromChunkData(connection, tileX, tileY);
              return tileType === 'Sea';
          };
          
          // Render barrel using imported function with sea tile check
          // Pass player position for health bar positioning (shows on opposite side from player)
          renderBarrel(ctx, barrel, nowMs, cycleProgress, isOnSeaTile, localPlayerPosition?.x, localPlayerPosition?.y);
          
          // Draw outline only if this is THE closest interactable target
          if (isTheClosestTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              const config = ENTITY_VISUAL_CONFIG.barrel;
              const outline = getInteractionOutlineParams(barrel.posX, barrel.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'sea_stack') {
          const seaStack = entity as any; // Sea stack from SpacetimeDB
          // Skip top half rendering when snorkeling - underwater silhouettes are rendered elsewhere
          if (!isLocalPlayerSnorkeling) {
            // Render ONLY top half - bottom half is rendered separately before swimming players
            renderSeaStackSingle(ctx, seaStack, doodadImagesRef.current, cycleProgress, nowMs, 'top', localPlayerPosition);
          }
      } else if (type === 'homestead_hearth') {
          const hearth = entity as SpacetimeDBHomesteadHearth;
          // Check if this hearth is the closest interactable target
          const isTheClosestTarget = closestInteractableTarget?.type === 'homestead_hearth' && closestInteractableTarget?.id === hearth.id;
          // Render hearth using imported function
          renderHearth(ctx, hearth, nowMs, cycleProgress);
          
          // Draw outline only if this is THE closest interactable target
          if (isTheClosestTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              const config = ENTITY_VISUAL_CONFIG.homestead_hearth;
              const outline = getInteractionOutlineParams(hearth.posX, hearth.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'fumarole') {
          const fumarole = entity as SpacetimeDBFumarole;
          const isTheClosestTarget = closestInteractableTarget?.type === 'fumarole' && closestInteractableTarget?.id === fumarole.id;
          
          // Submerged fumaroles (underwater) - render with blur when viewed from above water
          const viewingSubmergedFromAbove = fumarole.isSubmerged && !isLocalPlayerSnorkeling;
          const applyUnderwaterTint = fumarole.isSubmerged && isLocalPlayerSnorkeling;
          
          if (viewingSubmergedFromAbove) {
              // Save current filter and apply underwater blur effect (viewing through water surface)
              const savedFilter = ctx.filter;
              ctx.filter = 'blur(2px)';
              ctx.globalAlpha = 0.7; // Slightly transparent when viewed from above
              renderFumarole(ctx, fumarole, nowMs, cycleProgress);
              ctx.filter = savedFilter;
              ctx.globalAlpha = 1.0;
          } else if (applyUnderwaterTint) {
              // Underwater view - render with CSS filter teal tint (consistent with other underwater entities)
              ctx.save();
              ctx.globalAlpha = 1.0;
              ctx.filter = 'sepia(20%) hue-rotate(140deg) saturate(120%)';
              renderFumarole(ctx, fumarole, nowMs, cycleProgress);
              ctx.restore();
          } else {
              // Normal rendering (non-submerged fumaroles)
              renderFumarole(ctx, fumarole, nowMs, cycleProgress);
          }
          
          if (isTheClosestTarget && !viewingSubmergedFromAbove) {
              const outlineColor = getInteractionOutlineColor('open');
              const config = ENTITY_VISUAL_CONFIG.fumarole;
              const outline = getInteractionOutlineParams(fumarole.posX, fumarole.posY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'basalt_column') {
          const basaltColumn = entity as SpacetimeDBBasaltColumn;
          // console.log('🗿 [RENDER] Rendering basalt column', basaltColumn.id, 'at', basaltColumn.posX, basaltColumn.posY);
          renderBasaltColumn(ctx, basaltColumn, nowMs, cycleProgress, localPlayerPosition);
      } else if (type === 'living_coral') {
          const livingCoral = entity as SpacetimeDBLivingCoral;
          // Living coral - render with blur when viewed from above water (not snorkeling)
          const viewingCoralFromAbove = !isLocalPlayerSnorkeling;
          
          if (viewingCoralFromAbove) {
              // Save current filter and apply underwater blur effect (viewing through water surface)
              const savedFilter = ctx.filter;
              ctx.filter = 'blur(2px)';
              ctx.globalAlpha = 0.6; // More transparent when viewed from above water
              renderLivingCoral(ctx, livingCoral, nowMs, cycleProgress);
              ctx.filter = savedFilter;
              ctx.globalAlpha = 1.0;
          } else {
              // Underwater view - render with CSS filter teal tint (consistent with other underwater entities)
              ctx.save();
              ctx.globalAlpha = 1.0;
              ctx.filter = 'sepia(20%) hue-rotate(140deg) saturate(120%)';
              renderLivingCoral(ctx, livingCoral, nowMs, cycleProgress);
              ctx.restore();
          }
      } else if (type === 'alk_station') {
          const alkStation = entity as SpacetimeDBAlkStation;
          const isTheClosestTarget = closestInteractableTarget?.type === 'alk_station' && closestInteractableTarget?.id === alkStation.stationId;
          
          // Check if local player has Blueprint equipped OR is placing a placeable item to show safe zone overlay
          let showSafeZone = false;
          // First check: Is any placeable item currently being placed? (placementInfo is non-null)
          if (placementInfo) {
              showSafeZone = true;
          }
          // Second check: Is Blueprint equipped? (via ActiveEquipment)
          if (!showSafeZone && localPlayerId && activeEquipments && itemDefinitions) {
              const localEquipment = activeEquipments.get(localPlayerId);
              if (localEquipment?.equippedItemDefId) {
                  const equippedItemDef = itemDefinitions.get(localEquipment.equippedItemDefId.toString());
                  // Show restriction zones for Blueprint (Placeable items use placementInfo instead)
                  if (equippedItemDef?.name === 'Blueprint') {
                      showSafeZone = true;
                  }
              }
          }
          
          // console.log('🏭 [RENDER] Rendering ALK station', alkStation.stationId, 'at', alkStation.worldPosX, alkStation.worldPosY);
          renderAlkStation(ctx, alkStation, cycleProgress, isTheClosestTarget, undefined, localPlayerPosition, showSafeZone);
          
          // Draw outline only if this is THE closest interactable target
          if (isTheClosestTarget) {
              const outlineColor = getInteractionOutlineColor('open');
              const config = ENTITY_VISUAL_CONFIG.alk_station;
              const outline = getInteractionOutlineParams(alkStation.worldPosX, alkStation.worldPosY, config);
              drawInteractionOutline(ctx, outline.x, outline.y, outline.width, outline.height, cycleProgress, outlineColor);
          }
      } else if (type === 'compound_building') {
          // Compound buildings include both static buildings and dynamic shipwreck parts
          const buildingEntity = entity as CompoundBuildingEntity;
          
          // The entity already has all the data we need from useEntityFiltering
          // Convert it to CompoundBuilding format for renderMonument
          const buildingForRendering = {
              id: buildingEntity.id,
              offsetX: 0, // Not used by renderMonument (uses worldX/worldY directly)
              offsetY: 0,
              imagePath: buildingEntity.imagePath,
              width: buildingEntity.width,
              height: buildingEntity.height,
              anchorYOffset: buildingEntity.anchorYOffset,
              collisionRadius: 0, // Not used for rendering
              collisionYOffset: 0,
          };
          
          // renderMonument expects world position, so we need to pass it directly
          // Override getBuildingWorldPosition by passing worldX/worldY in the building object
          const buildingWithWorldPos = {
              ...buildingForRendering,
              worldX: buildingEntity.worldX,
              worldY: buildingEntity.worldY,
          };
          
          renderMonument(ctx, buildingWithWorldPos as any, cycleProgress, localPlayerPosition, doodadImagesRef);
          
          // Check if local player has Blueprint equipped OR is placing a placeable item to show building restriction overlay
          // Only show for monuments with building restrictions (shipwrecks, fishing villages, whale bone graveyards)
          let showBuildingRestriction = false;
          // First check: Is any placeable item currently being placed? (placementInfo is non-null)
          if (placementInfo) {
              showBuildingRestriction = true;
          }
          // Second check: Is Blueprint equipped? (via ActiveEquipment)
          if (!showBuildingRestriction && localPlayerId && activeEquipments && itemDefinitions) {
              const localEquipment = activeEquipments.get(localPlayerId);
              if (localEquipment?.equippedItemDefId) {
                  const equippedItemDef = itemDefinitions.get(localEquipment.equippedItemDefId.toString());
                  // Show restriction zones for Blueprint (Placeable items use placementInfo instead)
                  if (equippedItemDef?.name === 'Blueprint') {
                      showBuildingRestriction = true;
                  }
              }
          }
          
          // Render building restriction overlay for monuments (shipwrecks, fishing villages, whale bone graveyards, hunting villages)
          if (showBuildingRestriction && buildingEntity.isCenter) {
              const buildingId = buildingEntity.id;
              let restrictionRadius = 0;
              
              // Determine restriction radius based on monument type
              // ID prefix is generated from MonumentType enum (CamelCase -> snake_case)
              // e.g., Shipwreck -> shipwreck_, FishingVillage -> fishing_village_, etc.
              if (buildingId.startsWith('shipwreck_')) {
                  restrictionRadius = 1875; // SHIPWRECK_NPC_EXCLUSION_RADIUS from server (25% larger than 1500)
              } else if (buildingId.startsWith('fishing_village_')) {
                  restrictionRadius = 1000; // FISHING_VILLAGE_EXCLUSION_RADIUS from server (25% larger than 800)
              } else if (buildingId.startsWith('whale_bone_graveyard_')) {
                  restrictionRadius = 1200; // WHALE_BONE_GRAVEYARD_NPC_EXCLUSION_RADIUS from server
              } else if (buildingId.startsWith('hunting_village_')) {
                  restrictionRadius = 1200; // HUNTING_VILLAGE_NPC_EXCLUSION_RADIUS from server
              } else if (buildingId.startsWith('crashed_research_drone_')) {
                  restrictionRadius = 800; // CRASHED_RESEARCH_DRONE_RESTRICTION_RADIUS from server (800px minimum)
              } else if (buildingId.startsWith('weather_station_')) {
                  restrictionRadius = 800; // WEATHER_STATION_RESTRICTION_RADIUS from server (800px minimum)
              } else if (buildingId.startsWith('wolf_den_')) {
                  restrictionRadius = 800; // WOLF_DEN_RESTRICTION_RADIUS from server (800px minimum)
              }
              
              if (restrictionRadius > 0) {
                  const zoneConfig: BuildingRestrictionZoneConfig = {
                      centerX: buildingEntity.worldX,
                      centerY: buildingEntity.worldY,
                      radius: restrictionRadius,
                  };
                  renderBuildingRestrictionOverlay(ctx, zoneConfig);
              }
          }
      } else if (type === 'foundation_cell') {
          const foundation = entity as SpacetimeDBFoundationCell;
          // Foundations use cell coordinates directly - renderFoundation handles conversion
          renderFoundation({
              ctx,
              foundation: foundation,
              worldScale: 1.0,
              viewOffsetX: -cameraOffsetX, // Convert camera offset to view offset
              viewOffsetY: -cameraOffsetY,
              foundationTileImagesRef: foundationTileImagesRef,
              allFoundations: allFoundations, // Pass all foundations to check for adjacent foundations
          });
      } else if (type === 'shelter') {
          // Shelters are fully rendered in the first pass, including shadows.
          // No action needed in this second (shadow-only) pass.
      } else {
          console.warn('Unhandled entity type for Y-sorting (first pass):', type, entity);
      } 
  });

  // PASS 1.5: Render particle effects (AFTER entities so particles appear on top)
  
  // Hit impact effects (small chips flying off when attacking - triggered every hit)
  renderTreeHitEffects(ctx, nowMs);    // Bark chips, leaves, splinters
  renderStoneHitEffects(ctx, nowMs);   // Rock chips, sparks
  renderCoralHitEffects(ctx, nowMs);   // Coral fragments, bubbles
  
  // Destruction effects (big debris explosions when entity is fully destroyed)
  renderTreeImpactEffects(ctx, nowMs);     // Twigs, leaves, dirt, dust cloud from falling trees
  renderStoneDestructionEffects(ctx, nowMs); // Rock chunks, sparks, dust cloud from mined stones
  renderCoralDestructionEffects(ctx, nowMs); // Coral fragments, bubbles, sand cloud from harvested coral

  // PASS 2: REMOVED - North walls are now rendered in Pass 1 for correct Y-sorting with players/placeables
  // This fixes the issue where north walls would always render on top of entities on the tile south of the foundation
  // The Y-sort comparator correctly positions players/placeables after north walls when they're south of the wall
  // See Pass 1 above for the new wall_cell handling logic

  // PASS 2.5: Render north doors (edge 0) BEFORE ceiling tiles
  // North doors need to be covered by ceiling tiles to hide the interior
  ySortedEntities.forEach(({ type, entity }) => {
      if (type === 'door') {
          const door = entity as SpacetimeDBDoor;
          
          // Only render north doors (edge 0) in this pass - they render before ceiling tiles
          if (door.edge !== 0) {
              return;
          }
          
          // Get door sprite images based on type and edge (North)
          const doorType = door.doorType;
          
          // Select correct image based on door type
          let woodDoorImage: HTMLImageElement | null = null;
          let metalDoorImage: HTMLImageElement | null = null;
          
          if (doorType === 0) {
              // Wood door (north)
              woodDoorImage = doodadImagesRef?.current?.get('wood_door_north.png') || null;
          } else {
              // Metal door (north)
              metalDoorImage = doodadImagesRef?.current?.get('metal_door_north.png') || null;
          }
          
          // Check if this door is highlighted (closest interactable)
          const isHighlighted = closestInteractableDoorId !== null && closestInteractableDoorId !== undefined &&
              door.id.toString() === closestInteractableDoorId.toString();
          
          renderDoor({
              ctx,
              door,
              woodDoorImage,
              metalDoorImage,
              isHighlighted,
          });
      }
  });

  // PASS 3: REMOVED - East/west/diagonal walls are now rendered in Pass 1 for correct Y-sorting
  // This ensures all non-south walls are rendered in their proper Y-sorted position relative to players/placeables
  // See Pass 1 above for the new wall_cell handling logic

  // PASS 4: Render exterior wall shadows BEFORE ceiling tiles so the tiles occlude them
  ySortedEntities.forEach(({ type, entity }) => {
      if (type === 'wall_cell') {
          const wall = entity as SpacetimeDBWallCell;
          // Skip triangle foundations - their exterior shadows are rendered in the first pass
          const isTriangleFoundation = wall.foundationShape >= 2 && wall.foundationShape <= 5;
          // Skip north walls (edge === 0) - their exterior shadows are rendered in the first pass
          const isNorthWall = wall.edge === 0;
          if (!isTriangleFoundation && !isNorthWall) {
              renderWallExteriorShadow({
                  ctx,
                  wall: wall as any,
                  worldScale: 1.0,
                  cycleProgress,
                  viewOffsetX: -cameraOffsetX,
                  viewOffsetY: -cameraOffsetY,
              });
          }
      }
  });

  // PASS 5: Render ceiling tiles (AFTER east/west walls & exterior shadows, but BEFORE south walls)
  // CRITICAL: Ceiling tiles must render between east/west walls and south walls
  ySortedEntities.forEach(({ type, entity }) => {
      if (type === 'fog_overlay') {
          const fogEntity = entity as { clusterId: string; bounds: { minX: number; minY: number; maxX: number; maxY: number }; entranceWayFoundations?: string[]; clusterFoundationCoords?: string[]; northWallFoundations?: string[]; southWallFoundations?: string[] };

          // Save context and ensure ceiling tiles render with full opacity on top
          ctx.save();
          ctx.globalAlpha = 1.0; // Ensure full opacity
          ctx.globalCompositeOperation = 'source-over'; // Ensure normal blending

          // Render fog overlay (ceiling tile image)
          // Note: renderFogOverlayCluster has its own save/restore, but we wrap it to ensure proper state
          renderFogOverlayCluster({
              ctx,
              bounds: fogEntity.bounds,
              worldScale: 1.0,
              viewOffsetX: -cameraOffsetX,
              viewOffsetY: -cameraOffsetY,
              foundationTileImagesRef: foundationTileImagesRef,
              entranceWayFoundations: fogEntity.entranceWayFoundations ? new Set(fogEntity.entranceWayFoundations) : undefined,
              clusterFoundationCoords: fogEntity.clusterFoundationCoords ? new Set(fogEntity.clusterFoundationCoords) : undefined,
              northWallFoundations: fogEntity.northWallFoundations ? new Set(fogEntity.northWallFoundations) : undefined,
              southWallFoundations: fogEntity.southWallFoundations ? new Set(fogEntity.southWallFoundations) : undefined,
          });
          
          // Restore context
          ctx.restore();
      }
  });

  // NOTE: Pass 6 (south walls) was removed - south walls now render in Pass 1 with proper Y-sorting
  // This fixes the bug where south walls would always render on top of players/trees regardless of Y-position

  // PASS 6: Render south doors (edge 2) AFTER ceiling tiles (so they appear ON TOP)
  // South doors need to render above ceiling tiles to be visible
  // NOTE: North doors (edge 0) were already rendered in PASS 2.5 before ceiling tiles
  ySortedEntities.forEach(({ type, entity }) => {
      if (type === 'door') {
          const door = entity as SpacetimeDBDoor;
          
          // Only render south doors (edge 2) in this pass - north doors were rendered in PASS 2.5
          if (door.edge !== 2) {
              return;
          }
          
          // Get door sprite images based on type (South)
          const doorType = door.doorType;
          
          // Select correct image based on door type
          let woodDoorImage: HTMLImageElement | null = null;
          let metalDoorImage: HTMLImageElement | null = null;
          
          if (doorType === 0) {
              // Wood door (south)
              woodDoorImage = doodadImagesRef?.current?.get('wood_door.png') || null;
          } else {
              // Metal door (south)
              metalDoorImage = doodadImagesRef?.current?.get('metal_door.png') || null;
          }
          
          // Check if this door is highlighted (closest interactable)
          const isHighlighted = closestInteractableDoorId !== null && closestInteractableDoorId !== undefined &&
              door.id.toString() === closestInteractableDoorId.toString();
          
          renderDoor({
              ctx,
              door,
              woodDoorImage,
              metalDoorImage,
              isHighlighted,
              localPlayerPosition,
          });
      }
  });

  // PASS 7: Render large quarry building restriction zones when Blueprint equipped or placing a placeable item
  // Large quarries are monuments that should show restriction zones similar to ALK stations and rune stones
  if (largeQuarries && largeQuarries.size > 0) {
      // Check if local player has Blueprint equipped OR is placing a placeable item
      let showBuildingRestriction = false;
      // First check: Is any placeable item currently being placed? (placementInfo is non-null)
      if (placementInfo) {
          showBuildingRestriction = true;
      }
      // Second check: Is Blueprint equipped? (via ActiveEquipment)
      if (!showBuildingRestriction && localPlayerId && activeEquipments && itemDefinitions) {
          const localEquipment = activeEquipments.get(localPlayerId);
          if (localEquipment?.equippedItemDefId) {
              const equippedItemDef = itemDefinitions.get(localEquipment.equippedItemDefId.toString());
              // Show restriction zones for Blueprint (Placeable items use placementInfo instead)
              if (equippedItemDef?.name === 'Blueprint') {
                  showBuildingRestriction = true;
              }
          }
      }
      
      if (showBuildingRestriction) {
          // Large quarries have radiusTiles (their own size), so effective restriction = quarryRadius + restriction
          const TILE_SIZE_PX = 48;
          const QUARRY_RESTRICTION_RADIUS = 400.0; // Halved from 800px to better match actual restriction
          
          largeQuarries.forEach((quarry: any) => {
              // quarry.radiusTiles is the quarry's own radius in tiles
              const quarryRadiusPx = (quarry.radiusTiles || 0) * TILE_SIZE_PX;
              const effectiveRadius = quarryRadiusPx + QUARRY_RESTRICTION_RADIUS;
              
              const zoneConfig: BuildingRestrictionZoneConfig = {
                  centerX: quarry.worldX,
                  centerY: quarry.worldY,
                  radius: effectiveRadius,
              };
              renderBuildingRestrictionOverlay(ctx, zoneConfig);
          });
      }
  }

  // PASS 8: Render hot spring building restriction zones when Blueprint equipped or placing a placeable item
  // Hot springs are monument areas with 800px restriction radius around their detected centers
  if (detectedHotSprings && detectedHotSprings.length > 0) {
      // Check if local player has Blueprint equipped OR is placing a placeable item
      let showBuildingRestriction = false;
      // First check: Is any placeable item currently being placed? (placementInfo is non-null)
      if (placementInfo) {
          showBuildingRestriction = true;
      }
      // Second check: Is Blueprint equipped? (via ActiveEquipment)
      if (!showBuildingRestriction && localPlayerId && activeEquipments && itemDefinitions) {
          const localEquipment = activeEquipments.get(localPlayerId);
          if (localEquipment?.equippedItemDefId) {
              const equippedItemDef = itemDefinitions.get(localEquipment.equippedItemDefId.toString());
              // Show restriction zones for Blueprint (Placeable items use placementInfo instead)
              if (equippedItemDef?.name === 'Blueprint') {
                  showBuildingRestriction = true;
              }
          }
      }
      
      if (showBuildingRestriction) {
          // Server checks 800px from ANY hot spring tile, not just center
          // So visual radius = cluster_radius + 800px monument restriction
          const MONUMENT_RESTRICTION_RADIUS = 800.0;
          
          detectedHotSprings.forEach((hotSpring) => {
              // Add cluster radius to the monument restriction to show the full exclusion zone
              const effectiveRadius = hotSpring.radius + MONUMENT_RESTRICTION_RADIUS;
              const zoneConfig: BuildingRestrictionZoneConfig = {
                  centerX: hotSpring.posX,
                  centerY: hotSpring.posY,
                  radius: effectiveRadius,
              };
              renderBuildingRestrictionOverlay(ctx, zoneConfig);
          });
      }
  }

  // PASS 9: Render small quarry building restriction zones when Blueprint equipped or placing a placeable item
  // Small quarries are tile-based monument areas - server checks 800px from ANY quarry tile
  if (detectedQuarries && detectedQuarries.length > 0) {
      // Check if local player has Blueprint equipped OR is placing a placeable item
      let showBuildingRestriction = false;
      // First check: Is any placeable item currently being placed? (placementInfo is non-null)
      if (placementInfo) {
          showBuildingRestriction = true;
      }
      // Second check: Is Blueprint equipped? (via ActiveEquipment)
      if (!showBuildingRestriction && localPlayerId && activeEquipments && itemDefinitions) {
          const localEquipment = activeEquipments.get(localPlayerId);
          if (localEquipment?.equippedItemDefId) {
              const equippedItemDef = itemDefinitions.get(localEquipment.equippedItemDefId.toString());
              // Show restriction zones for Blueprint (Placeable items use placementInfo instead)
              if (equippedItemDef?.name === 'Blueprint') {
                  showBuildingRestriction = true;
              }
          }
      }
      
      if (showBuildingRestriction) {
          // Small quarries - visual radius = cluster_radius + restriction
          const QUARRY_RESTRICTION_RADIUS = 400.0; // Halved from 800px to better match actual restriction
          
          detectedQuarries.forEach((quarry) => {
              // Add cluster radius to the quarry restriction to show the full exclusion zone
              const effectiveRadius = quarry.radius + QUARRY_RESTRICTION_RADIUS;
              const zoneConfig: BuildingRestrictionZoneConfig = {
                  centerX: quarry.posX,
                  centerY: quarry.posY,
                  radius: effectiveRadius,
              };
              renderBuildingRestrictionOverlay(ctx, zoneConfig);
          });
      }
  }
};