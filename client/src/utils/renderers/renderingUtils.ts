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
    ViperSpittle as SpacetimeDBViperSpittle,
    AnimalCorpse as SpacetimeDBAnimalCorpse,
    FoundationCell as SpacetimeDBFoundationCell, // ADDED: Building foundations
    WallCell as SpacetimeDBWallCell, // ADDED: Building walls
    Door as SpacetimeDBDoor, // ADDED: Building doors
    HomesteadHearth as SpacetimeDBHomesteadHearth, // ADDED: HomesteadHearth
    BrothPot as SpacetimeDBBrothPot, // ADDED: BrothPot
    Fumarole as SpacetimeDBFumarole, // ADDED: Fumarole
    BasaltColumn as SpacetimeDBBasaltColumn, // ADDED: Basalt column
} from '../../generated';
import { PlayerCorpse as SpacetimeDBPlayerCorpse } from '../../generated/player_corpse_type';
import { gameConfig } from '../../config/gameConfig';
import { JUMP_DURATION_MS } from '../../config/gameConfig'; // Import the constant
// Import individual rendering functions
import { renderTree } from './treeRenderingUtils';
import { renderStone } from './stoneRenderingUtils';
import { renderRuneStone } from './runeStoneRenderingUtils';
import { renderWoodenStorageBox } from './woodenStorageBoxRenderingUtils';
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
import { renderLantern } from './lanternRenderingUtils';
import { renderBrothPot } from './brothPotRenderingUtils'; // ADDED: Broth pot renderer import
import { renderFoundation, renderFogOverlay, renderFogOverlayCluster } from './foundationRenderingUtils'; // ADDED: Foundation renderer import
import { renderWall, renderWallExteriorShadow } from './foundationRenderingUtils'; // ADDED: Wall renderer and exterior shadow import
import { renderDoor } from './doorRenderingUtils'; // ADDED: Door renderer import
import { renderStash } from './stashRenderingUtils';
import { renderSleepingBag } from './sleepingBagRenderingUtils';
// Import shelter renderer
import { renderShelter } from './shelterRenderingUtils';
// Import rain collector renderer
import { renderRainCollector } from './rainCollectorRenderingUtils';
// Import wild animal renderer
import { renderWildAnimal, renderTamingThoughtBubbles } from './wildAnimalRenderingUtils';
// Import viper spittle renderer
import { renderViperSpittle } from './viperSpittleRenderingUtils';
// Import animal corpse renderer
import { renderAnimalCorpse } from './animalCorpseRenderingUtils';
// Import player corpse renderer
import { renderPlayerCorpse } from './playerCorpseRenderingUtils';
// Import barrel renderer
import { renderBarrel } from './barrelRenderingUtils';
// Import fumarole renderer
import { renderFumarole } from './fumaroleRenderingUtils';
// Import basalt column renderer
import { renderBasaltColumn } from './basaltColumnRenderingUtils';
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
const DODGE_ROLL_DURATION_MS = 250;
const DODGE_ROLL_DISTANCE = 120;

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
    buildingClusters?: Map<string, any>; // ADDED: Building clusters for fog of war
    playerBuildingClusterId?: string | null; // ADDED: Which building the player is in
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
    buildingClusters, // ADDED: Building clusters for fog of war
    playerBuildingClusterId, // ADDED: Which building the player is in
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
    
    // NOTE: Underwater shadows are now rendered separately in GameCanvas.tsx
    // before the water overlay, not here in renderYSortedEntities
    
    // CRITICAL FIX FOR CEILING TILE GLITCHING:
    // The Y-sorting comparator has explicit checks for fog/wall ordering, but it's still unreliable.
    // Solution: Render in THREE SEPARATE PASSES with GUARANTEED order
    // Pass 1: Everything except fog and walls (normal Y-sorted)
    // Pass 2: Fog overlays ONLY (ceiling tiles)
    // Pass 3: Walls ONLY (always on top of fog)
    
    // First Pass: Render all non-fog, non-wall entities (players, trees, placeables, etc.)
    ySortedEntities.forEach(({ type, entity }) => {
        // Skip fog overlays, walls, and doors - they render in later passes
        if (type === 'fog_overlay' || type === 'wall_cell' || type === 'door') {
          return;
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
               
               if (elapsed < 500) { // 500ms dodge roll duration (match server)
                   isDodgeRolling = true;
                   dodgeRollProgress = elapsed / 500.0;
                   // Only log successful dodge rolls occasionally to reduce spam
                  //  if (Math.random() < 0.05) { // 5% chance to log
                  //      console.log(`[DODGE] Player dodging - Progress: ${(dodgeRollProgress * 100).toFixed(1)}%, elapsed: ${elapsed.toFixed(0)}ms`);
                  //  }
               }
               // Silently ignore expired dodge states (elapsed > 500ms)
           }
           // No logging for players without dodge state - this is the normal case
           
           const currentlyHovered = isPlayerHovered(worldMouseX, worldMouseY, playerForRendering);
           const isPersistentlyHovered = hoveredPlayerIds.has(playerId);
           
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
               heroImg = heroWaterImageRef.current; // HIGHEST PRIORITY: Use water sprite when on water (but not jumping)
              // console.log(`[DEBUG] Using water sprite for ${playerId}:`, !!heroImg);
           } else if (effectiveIsCrouching && !playerForRendering.isOnWater) {
               heroImg = heroCrouchImageRef.current; // SECOND PRIORITY: Use crouch sprite when crouching (and NOT on water)
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
           
            // Determine rendering order based on player direction
            if (playerForRendering.direction === 'up' || playerForRendering.direction === 'left') {
                // For UP or LEFT, item should be rendered BENEATH the player
              
              // Ghost trail disabled for cleaner dodge roll experience
              // if (heroImg && isDodgeRolling) {
              //     renderGhostTrail(ctx, playerId, heroImg, playerForRendering);
              // }
              
              if (canRenderItem && equipment) {
                    renderEquippedItem(ctx, playerForRendering, equipment, itemDef!, itemDefinitions, itemImg!, nowMs, jumpOffset, itemImagesRef.current, activeConsumableEffects, localPlayerId);
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
                // For swimming players, render only the bottom half (underwater portion) - but skip underwater shadow since it was rendered earlier
                const renderHalf = (playerForRendering.isOnWater && !playerForRendering.isDead && !playerForRendering.isKnockedOut) ? 'bottom' : 'full';
                
                // Use normal player position (movement system handles dodge roll speed)
                const playerForRender = playerForRendering;
                
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
                  activeConsumableEffects,
                  localPlayerId,
                  false, // isCorpse
                  cycleProgress, // cycleProgress
                  localPlayerIsCrouching, // NEW: pass local crouch state for optimistic rendering
                  renderHalf, // Render full player for normal Y-sorting
                  isDodgeRolling, // NEW: pass dodge roll state
                  dodgeRollProgress // NEW: pass dodge roll progress
                );
              } else {
                console.log(`[DEBUG] heroImg is null for player ${playerId} - cannot render`);
              }
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
                // For swimming players, render only the bottom half (underwater portion) - but skip underwater shadow since it was rendered earlier
                const renderHalf = (playerForRendering.isOnWater && !playerForRendering.isDead && !playerForRendering.isKnockedOut) ? 'bottom' : 'full';
                
                // Use normal player position (movement system handles dodge roll speed)
                const playerForRender = playerForRendering;
                
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
                  activeConsumableEffects,
                  localPlayerId,
                  false, // isCorpse
                  cycleProgress, // cycleProgress
                  localPlayerIsCrouching, // NEW: pass local crouch state for optimistic rendering
                  renderHalf, // Render full player for normal Y-sorting
                  isDodgeRolling, // NEW: pass dodge roll state
                  dodgeRollProgress // NEW: pass dodge roll progress
                );
              } else {
                console.log(`[DEBUG] heroImg is null for player ${playerId} (down/right) - cannot render`);
              }
              if (canRenderItem && equipment) {
                    renderEquippedItem(ctx, playerForRendering, equipment, itemDef!, itemDefinitions, itemImg!, nowMs, jumpOffset, itemImagesRef.current, activeConsumableEffects, localPlayerId);
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
            
            renderTree(ctx, tree, nowMs, cycleProgress, false, false, localPlayerPosition, treeShadowsEnabled, isFalling, fallProgress);
        } else if (type === 'stone') {
            // Render stone with its shadow in the normal order (shadow first, then stone)
            renderStone(ctx, entity as SpacetimeDBStone, nowMs, cycleProgress, false, false);
        } else if (type === 'rune_stone') {
            // Render rune stone with its shadow in the normal order (shadow first, then rune stone)
            renderRuneStone(ctx, entity as SpacetimeDBRuneStone, nowMs, cycleProgress, false, false);
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
            
            // Use unified renderer that handles all plant types internally
            renderHarvestableResource(ctx, resource, nowMs, cycleProgress);
            
            // Note: Green circle outline removed - interaction indicators now handled by cyberpunk "E" labels only
        } else if (type === 'campfire') {
            const campfire = entity as SpacetimeDBCampfire;
            const isTheClosestTarget = closestInteractableTarget?.type === 'campfire' && closestInteractableTarget?.id === campfire.id;
            renderCampfire(ctx, campfire, nowMs, cycleProgress);
            
            // Draw outline only if this is THE closest interactable target
            if (isTheClosestTarget) {
                const outlineColor = getInteractionOutlineColor('open');
                drawInteractionOutline(ctx, campfire.posX, campfire.posY - 48, 64, 96, cycleProgress, outlineColor);
            }
        } else if (type === 'furnace') { // ADDED: Furnace handling (same as campfire)
            const furnace = entity as any; // Furnace type from generated types
            const isTheClosestTarget = closestInteractableTarget?.type === 'furnace' && closestInteractableTarget?.id === furnace.id;
            renderFurnace(ctx, furnace, nowMs, cycleProgress);
            
            // Draw outline only if this is THE closest interactable target
            if (isTheClosestTarget) {
                const outlineColor = getInteractionOutlineColor('open');
                drawInteractionOutline(ctx, furnace.posX, furnace.posY - 64, 96, 128, cycleProgress, outlineColor); // Standard 96x96 furnace size
            }
        } else if (type === 'lantern') {
            const lantern = entity as any; // Type will be Lantern from generated types
            const isTheClosestTarget = closestInteractableTarget?.type === 'lantern' && closestInteractableTarget?.id === lantern.id;
            renderLantern(ctx, lantern, nowMs, cycleProgress);
            
            // Draw outline only if this is THE closest interactable target
            if (isTheClosestTarget) {
                const outlineColor = getInteractionOutlineColor('open');
                // Make outline taller (height: 56 -> 72) and extend more downward (Y offset: -48 -> -40)
                drawInteractionOutline(ctx, lantern.posX, lantern.posY - 40, 48, 72, cycleProgress, outlineColor);
            }
        } else if (type === 'broth_pot') {
            const brothPot = entity as SpacetimeDBBrothPot;
            renderBrothPot(ctx, brothPot, nowMs, cycleProgress);
        } else if (type === 'dropped_item') {
            const droppedItem = entity as SpacetimeDBDroppedItem;
            const itemDef = itemDefinitions.get(droppedItem.itemDefId.toString());
            renderDroppedItem({ ctx, item: droppedItem, itemDef, nowMs, cycleProgress });
        } else if (type === 'sleeping_bag') {
            const sleepingBag = entity as SpacetimeDBSleepingBag;
            renderSleepingBag(ctx, sleepingBag, nowMs, cycleProgress);
        } else if (type === 'stash') {
            const stash = entity as SpacetimeDBStash;
            const isTheClosestTarget = closestInteractableTarget?.type === 'stash' && closestInteractableTarget?.id === stash.id;
            
            // Always render the stash (will show nothing if hidden, but that's okay)
            renderStash(ctx, stash, nowMs, cycleProgress);
            
            // Draw outline if this is the closest target, even if stash is hidden
            // This allows players to see where hidden stashes are when close enough
            if (isTheClosestTarget) {
                const outlineColor = getInteractionOutlineColor('open');
                drawInteractionOutline(ctx, stash.posX, stash.posY - 24, 48, 48, cycleProgress, outlineColor);
            }
        } else if (type === 'wooden_storage_box') {
            // Render box normally, its applyStandardDropShadow will handle the shadow
            const box = entity as SpacetimeDBWoodenStorageBox;
            const isTheClosestTarget = closestInteractableTarget?.type === 'box' && closestInteractableTarget?.id === box.id;
            renderWoodenStorageBox(ctx, box, nowMs, cycleProgress);
            
            // Draw outline only if this is THE closest interactable target
            if (isTheClosestTarget) {
                const outlineColor = getInteractionOutlineColor('open');
                drawInteractionOutline(ctx, box.posX, box.posY - 58, 64, 72, cycleProgress, outlineColor);
            }
        } else if (type === 'player_corpse') {
            const corpse = entity as SpacetimeDBPlayerCorpse;
            
            renderCorpse({ 
                ctx, 
                corpse, 
                nowMs, 
                itemImagesRef,
                heroImageRef,
                heroWaterImageRef,
                heroCrouchImageRef,
                heroSwimImageRef: heroSwimImageRef || { current: null }
            });
            
            // Check if this corpse is the closest interactable target
            const isTheClosestTarget = closestInteractableTarget && 
                                     closestInteractableTarget.type === 'corpse' && 
                                     closestInteractableTarget.id.toString() === corpse.id.toString();
            
            // Draw outline only if this is THE closest interactable target
            if (isTheClosestTarget) {
                const outlineColor = getInteractionOutlineColor('open');
                // Make outline wider and positioned lower for lying down corpse (rectangular shape)
                drawInteractionOutline(ctx, corpse.posX, corpse.posY + 0, 80, 72, cycleProgress, outlineColor); // Made taller: 48 → 72
            }
        } else if (type === 'grass') {
            renderGrass(ctx, entity as InterpolatedGrassData, nowMs, cycleProgress, false, true);
        } else if (type === 'projectile') {
            const projectile = entity as SpacetimeDBProjectile;
            
            // Reduced debug logging - only log when projectiles are found
            console.log(`🏹 [RENDER] Projectile ${projectile.id} found in render queue`);
            
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
                });
            } else {
                console.warn(`🏹 [RENDER] Image not loaded: ${projectileImageName} for projectile ${projectile.id}`);
            }
        } else if (type === 'planted_seed') {
            const plantedSeed = entity as SpacetimeDBPlantedSeed;
            const plantedSeedImg = doodadImagesRef.current?.get('planted_seed.png');
            renderPlantedSeed(ctx, plantedSeed, nowMs, cycleProgress, plantedSeedImg);
        } else if (type === 'rain_collector') {
            const rainCollector = entity as SpacetimeDBRainCollector;
            renderRainCollector(ctx, rainCollector, nowMs, cycleProgress);
            
            // Check if this rain collector is the closest interactable target
            const isTheClosestTarget = closestInteractableTarget && 
                                     closestInteractableTarget.type === 'rain_collector' && 
                                     closestInteractableTarget.id.toString() === rainCollector.id.toString();
            
            // Draw outline only if this is THE closest interactable target
            if (isTheClosestTarget) {
                const outlineColor = getInteractionOutlineColor('open');
                drawInteractionOutline(ctx, rainCollector.posX, rainCollector.posY, 96 + 20, 128 + 20, cycleProgress, outlineColor);
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
            });
            
            // Render thought bubbles for tamed animals (hearts, crying, etc.)
            renderTamingThoughtBubbles({
                ctx,
                animal: wildAnimal,
                nowMs,
            });
        } else if (type === 'viper_spittle') {
            const viperSpittle = entity as SpacetimeDBViperSpittle;
            renderViperSpittle({
                ctx,
                spittle: viperSpittle,
                currentTimeMs: nowMs,
            });
        } else if (type === 'animal_corpse') {
            const animalCorpse = entity as SpacetimeDBAnimalCorpse;
            renderAnimalCorpse(ctx, animalCorpse, nowMs);
        } else if (type === 'barrel') {
            const barrel = entity as any; // Use any for now, will be properly typed
            // Check if this barrel is the closest interactable target  
            const isTheClosestTarget = closestInteractableTarget?.type === 'barrel' && closestInteractableTarget?.id === barrel.id;
            // Render barrel using imported function
            renderBarrel(ctx, barrel, nowMs, cycleProgress);
            
            // Draw outline only if this is THE closest interactable target
            if (isTheClosestTarget) {
                const outlineColor = getInteractionOutlineColor('open');
                drawInteractionOutline(ctx, barrel.posX, barrel.posY - 24, 48, 48, cycleProgress, outlineColor);
            }
        } else if (type === 'sea_stack') {
            const seaStack = entity as any; // Sea stack from SpacetimeDB
            // Render ONLY top half - bottom half is rendered separately before swimming players
            renderSeaStackSingle(ctx, seaStack, doodadImagesRef.current, cycleProgress, nowMs, 'top');
        } else if (type === 'homestead_hearth') {
            const hearth = entity as SpacetimeDBHomesteadHearth;
            // Check if this hearth is the closest interactable target
            const isTheClosestTarget = closestInteractableTarget?.type === 'homestead_hearth' && closestInteractableTarget?.id === hearth.id;
            // Render hearth using imported function
            renderHearth(ctx, hearth, nowMs, cycleProgress);
            
            // Draw outline only if this is THE closest interactable target
            if (isTheClosestTarget) {
                const outlineColor = getInteractionOutlineColor('open');
                // Moved up by ~20% (15px) to match indicator box and E label position
                drawInteractionOutline(ctx, hearth.posX, hearth.posY - 63, 96, 96, cycleProgress, outlineColor);
            }
        } else if (type === 'fumarole') {
            const fumarole = entity as SpacetimeDBFumarole;
            const isTheClosestTarget = closestInteractableTarget?.type === 'fumarole' && closestInteractableTarget?.id === fumarole.id;
            // console.log('🔥 [RENDER] Rendering fumarole', fumarole.id, 'at', fumarole.posX, fumarole.posY);
            renderFumarole(ctx, fumarole, nowMs, cycleProgress);
            
            // Draw outline only if this is THE closest interactable target
            if (isTheClosestTarget) {
                const outlineColor = getInteractionOutlineColor('open');
                // Fumaroles are ground-level, center the outline lower on the fumarole
                drawInteractionOutline(ctx, fumarole.posX, fumarole.posY - 0, 96, 96, cycleProgress, outlineColor);
            }
        } else if (type === 'basalt_column') {
            const basaltColumn = entity as SpacetimeDBBasaltColumn;
            // console.log('🗿 [RENDER] Rendering basalt column', basaltColumn.id, 'at', basaltColumn.posX, basaltColumn.posY);
            renderBasaltColumn(ctx, basaltColumn, nowMs, cycleProgress);
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

    // PASS 2: Render north walls only (before ceiling tiles)
    ySortedEntities.forEach(({ type, entity }) => {
        if (type === 'wall_cell') {
            const wall = entity as SpacetimeDBWallCell;

            // Only render north walls (edge 0) - they render before ceiling tiles
            if (wall.edge !== 0) {
                return;
            }
            
            // Determine if this wall belongs to the same building cluster the player is inside
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
            });
        }
    });

    // PASS 3: Render east/west walls and diagonal walls FIRST (before ceiling tiles)
    // These walls will be covered by ceiling tiles in PASS 5
    ySortedEntities.forEach(({ type, entity }) => {
        if (type === 'wall_cell') {
            const wall = entity as SpacetimeDBWallCell;

            // Only render east/west walls (edge 1 and 3) and diagonal walls (edge 4 and 5) - they render BEFORE ceiling tiles
            if (wall.edge !== 1 && wall.edge !== 3 && wall.edge !== 4 && wall.edge !== 5) {
                return;
            }

            // Determine if this wall belongs to the same building cluster the player is inside
            const wallCellKey = `${wall.cellX},${wall.cellY}`;
            const wallClusterId = cellCoordToClusterId.get(wallCellKey);
            const playerInsideThisCluster = wallClusterId !== undefined && wallClusterId === playerBuildingClusterId;

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
            });
        }
    });

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

    // PASS 6: Render south walls (AFTER ceiling tiles, so they appear ON TOP of ceiling tiles)
    ySortedEntities.forEach(({ type, entity }) => {
        if (type === 'wall_cell') {
            const wall = entity as SpacetimeDBWallCell;

            // Only render south walls (edge 2) - they render after ceiling tiles
            if (wall.edge !== 2) {
                return;
            }

            // Determine if this wall belongs to the same building cluster the player is inside
            const wallCellKey = `${wall.cellX},${wall.cellY}`;
            const wallClusterId = cellCoordToClusterId.get(wallCellKey);
            const playerInsideThisCluster = wallClusterId !== undefined && wallClusterId === playerBuildingClusterId;

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
            });
        }
    });

    // PASS 7: Render doors (after south walls, so they appear ON TOP)
    ySortedEntities.forEach(({ type, entity }) => {
        if (type === 'door') {
            const door = entity as SpacetimeDBDoor;
            
            // Get door sprite images based on type and edge (North vs South)
            const doorType = door.doorType;
            const isNorthEdge = door.edge === 0; // 0 = North, 2 = South
            
            // Select correct image based on door type and edge
            let woodDoorImage: HTMLImageElement | null = null;
            let metalDoorImage: HTMLImageElement | null = null;
            
            if (doorType === 0) {
                // Wood door
                const imageKey = isNorthEdge ? 'wood_door_north.png' : 'wood_door.png';
                woodDoorImage = doodadImagesRef?.current?.get(imageKey) || null;
            } else {
                // Metal door
                const imageKey = isNorthEdge ? 'metal_door_north.png' : 'metal_door.png';
                metalDoorImage = doodadImagesRef?.current?.get(imageKey) || null;
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
};
