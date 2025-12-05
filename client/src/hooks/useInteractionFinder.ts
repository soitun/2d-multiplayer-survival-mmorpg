import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
    Player as SpacetimeDBPlayer,
    Campfire as SpacetimeDBCampfire,
    Furnace as SpacetimeDBFurnace, // ADDED: Furnace import
    Fumarole as SpacetimeDBFumarole, // ADDED: Fumarole import (volcanic heat source)
    Lantern as SpacetimeDBLantern,
    HomesteadHearth as SpacetimeDBHomesteadHearth, // ADDED: HomesteadHearth import
    DroppedItem as SpacetimeDBDroppedItem,
    WoodenStorageBox as SpacetimeDBWoodenStorageBox,
    HarvestableResource as SpacetimeDBHarvestableResource,
    PlayerCorpse as SpacetimeDBPlayerCorpse,
    Stash as SpacetimeDBStash,
    SleepingBag as SpacetimeDBSleepingBag,
    Shelter as SpacetimeDBShelter,
    RainCollector as SpacetimeDBRainCollector,
    BrothPot as SpacetimeDBBrothPot,
    Door as SpacetimeDBDoor, // ADDED: Door import
    AlkStation as SpacetimeDBAlkStation, // ADDED: ALK station import
    DbConnection,
    InventoryItem as SpacetimeDBInventoryItem,
    ItemDefinition as SpacetimeDBItemDefinition,
    PlayerDrinkingCooldown as SpacetimeDBPlayerDrinkingCooldown,
} from '../generated';
import { InteractableTarget } from '../types/interactions';
import { selectHighestPriorityTarget } from '../types/interactions'; // ADDED: Import priority selection helper
import {
    PLAYER_CAMPFIRE_INTERACTION_DISTANCE_SQUARED,
    CAMPFIRE_HEIGHT,
    CAMPFIRE_RENDER_Y_OFFSET
} from '../utils/renderers/campfireRenderingUtils';
import {
    PLAYER_FURNACE_INTERACTION_DISTANCE_SQUARED,
    FURNACE_HEIGHT,
    FURNACE_RENDER_Y_OFFSET
} from '../utils/renderers/furnaceRenderingUtils'; // ADDED: Furnace rendering constants
import {
    PLAYER_FUMAROLE_INTERACTION_DISTANCE_SQUARED,
    FUMAROLE_WIDTH,
    FUMAROLE_HEIGHT
} from '../utils/renderers/fumaroleRenderingUtils'; // ADDED: Fumarole interaction constants
import {
    PLAYER_LANTERN_INTERACTION_DISTANCE_SQUARED,
    LANTERN_HEIGHT,
    LANTERN_RENDER_Y_OFFSET
} from '../utils/renderers/lanternRenderingUtils';
import {
    PLAYER_HEARTH_INTERACTION_DISTANCE_SQUARED,
    HEARTH_HEIGHT,
    HEARTH_RENDER_Y_OFFSET
} from '../utils/renderers/hearthRenderingUtils'; // ADDED: Hearth interaction constants
import { PLAYER_CORPSE_INTERACTION_DISTANCE_SQUARED } from '../utils/renderers/playerCorpseRenderingUtils';
import { PLAYER_BOX_INTERACTION_DISTANCE_SQUARED, BOX_HEIGHT } from '../utils/renderers/woodenStorageBoxRenderingUtils';
import { PLAYER_DOOR_INTERACTION_DISTANCE_SQUARED, DOOR_RENDER_Y_OFFSET } from '../utils/renderers/doorRenderingUtils'; // ADDED: Door interaction distance and render offset
import { PLAYER_ALK_STATION_INTERACTION_DISTANCE_SQUARED, ALK_STATION_Y_OFFSET } from '../utils/renderers/alkStationRenderingUtils'; // ADDED: ALK station interaction distance
import { getResourceConfig } from '../utils/renderers/resourceConfigurations';
import type { ResourceType } from '../types/resourceTypes';

// Generic harvestable resource interaction distance (balanced: 50% increase from original 80px)
const PLAYER_HARVESTABLE_RESOURCE_INTERACTION_DISTANCE_SQUARED = 120.0 * 120.0;
const PLAYER_SLEEPING_BAG_INTERACTION_DISTANCE_SQUARED = PLAYER_CAMPFIRE_INTERACTION_DISTANCE_SQUARED;
const PLAYER_KNOCKED_OUT_REVIVE_INTERACTION_DISTANCE_SQUARED = 128.0 * 128.0; // Doubled distance for easier revive access

// NEW: Water drinking interaction distance - close proximity required
const PLAYER_WATER_DRINKING_INTERACTION_DISTANCE_SQUARED = 64.0 * 64.0; // Same as server-side distance



// NEW: Tile size constant for water detection
const TILE_SIZE = 48;

// Define the hook's input props
interface UseInteractionFinderProps {
    localPlayer: SpacetimeDBPlayer | null | undefined;
    harvestableResources: Map<string, SpacetimeDBHarvestableResource>;
    campfires: Map<string, SpacetimeDBCampfire>;
    furnaces: Map<string, SpacetimeDBFurnace>; // ADDED: Furnace support
    fumaroles: Map<string, SpacetimeDBFumarole>; // ADDED: Fumarole support (volcanic heat source)
    lanterns: Map<string, SpacetimeDBLantern>;
    homesteadHearths: Map<string, SpacetimeDBHomesteadHearth>; // ADDED: HomesteadHearths support
    droppedItems: Map<string, SpacetimeDBDroppedItem>;
    woodenStorageBoxes: Map<string, SpacetimeDBWoodenStorageBox>;
    playerCorpses: Map<string, SpacetimeDBPlayerCorpse>;
    stashes: Map<string, SpacetimeDBStash>;
    rainCollectors: Map<string, SpacetimeDBRainCollector>;
    brothPots: Map<string, SpacetimeDBBrothPot>;
    doors: Map<string, SpacetimeDBDoor>; // ADDED: Door support
    alkStations: Map<string, SpacetimeDBAlkStation>; // ADDED: ALK station support
    sleepingBags: Map<string, SpacetimeDBSleepingBag>;
    players: Map<string, SpacetimeDBPlayer>;
    shelters: Map<string, SpacetimeDBShelter>;
    inventoryItems: Map<string, SpacetimeDBInventoryItem>;
    itemDefinitions: Map<string, SpacetimeDBItemDefinition>;
    connection: DbConnection | null; // NEW: Connection for water tile access
    playerDrinkingCooldowns: Map<string, SpacetimeDBPlayerDrinkingCooldown>; // NEW: Player drinking cooldowns
    worldTiles?: Map<string, any>; // NEW: World tiles for water detection
}

// Define the hook's return type

interface UseInteractionFinderResult {
    // Single closest target across all types
    closestInteractableTarget: InteractableTarget | null;
    
    // Generic harvestable resource ID (replaces all individual resource types)
    closestInteractableHarvestableResourceId: bigint | null;
    closestInteractableCampfireId: number | null;
    closestInteractableFurnaceId: number | null; // ADDED: Furnace support
    closestInteractableFumaroleId: number | null; // ADDED: Fumarole support (volcanic heat source)
    closestInteractableLanternId: number | null;
    closestInteractableHearthId: number | null; // ADDED: HomesteadHearth support
    closestInteractableDroppedItemId: bigint | null;
    closestInteractableBoxId: number | null;
    isClosestInteractableBoxEmpty: boolean;
    closestInteractableCorpseId: bigint | null;
    closestInteractableStashId: number | null;
    closestInteractableRainCollectorId: number | null;
    closestInteractableBrothPotId: number | null;
    closestInteractableSleepingBagId: number | null;
    closestInteractableKnockedOutPlayerId: string | null;
    closestInteractableWaterPosition: { x: number; y: number } | null;
    closestInteractableDoorId: bigint | null; // ADDED: Door support
    closestInteractableAlkStationId: number | null; // ADDED: ALK station support
}

// Constants for box slots (should match server if possible, or keep fixed)
const NUM_BOX_SLOTS = 18;

const INTERACTION_CHECK_INTERVAL = 16; // ms - Reduced for immediate responsiveness (was 100ms)

// --- Locally Defined Interaction Distance Constants (formerly in gameConfig.ts) ---
// PLAYER_BOX_INTERACTION_DISTANCE_SQUARED is now imported from woodenStorageBoxRenderingUtils
export const PLAYER_DROPPED_ITEM_INTERACTION_DISTANCE_SQUARED = 120.0 * 120.0; // Balanced: 87% increase from original 64px, consistent with harvestable resources
// PLAYER_CORPSE_INTERACTION_DISTANCE_SQUARED is now imported from playerCorpseRenderingUtils
export const PLAYER_STASH_INTERACTION_DISTANCE_SQUARED = 64.0 * 64.0;
export const PLAYER_STASH_SURFACE_INTERACTION_DISTANCE_SQUARED = 32.0 * 32.0;
export const PLAYER_RAIN_COLLECTOR_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0;

// --- Shelter Access Control Constants ---
const SHELTER_COLLISION_WIDTH = 300.0;
const SHELTER_COLLISION_HEIGHT = 125.0;
const SHELTER_AABB_HALF_WIDTH = SHELTER_COLLISION_WIDTH / 2.0;
const SHELTER_AABB_HALF_HEIGHT = SHELTER_COLLISION_HEIGHT / 2.0;
const SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y = 200.0;

// --- Shelter Access Control Helper Functions ---

/**
 * Checks if a player is inside a shelter's AABB
 */
function isPlayerInsideShelter(playerX: number, playerY: number, shelter: SpacetimeDBShelter): boolean {
    const shelterAabbCenterX = shelter.posX;
    const shelterAabbCenterY = shelter.posY - SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y;
    const aabbLeft = shelterAabbCenterX - SHELTER_AABB_HALF_WIDTH;
    const aabbRight = shelterAabbCenterX + SHELTER_AABB_HALF_WIDTH;
    const aabbTop = shelterAabbCenterY - SHELTER_AABB_HALF_HEIGHT;
    const aabbBottom = shelterAabbCenterY + SHELTER_AABB_HALF_HEIGHT;
    
    return playerX >= aabbLeft && playerX <= aabbRight && playerY >= aabbTop && playerY <= aabbBottom;
}

/**
 * Checks if a player can interact with an object at a given position
 * Returns true if:
 * - The object is not inside any shelter, OR
 * - The player is the owner of the shelter containing the object and is also inside that shelter
 */
function canPlayerInteractWithObjectInShelter(
    playerX: number,
    playerY: number,
    playerId: string,
    objectX: number,
    objectY: number,
    shelters: Map<string, SpacetimeDBShelter>
): boolean {
    for (const shelter of shelters.values()) {
        if (shelter.isDestroyed) continue;
        
        // Check if the object is inside this shelter
        if (isPlayerInsideShelter(objectX, objectY, shelter)) {
            // Object is inside this shelter
            // Only allow interaction if player is the owner and is also inside the shelter
            const isOwner = shelter.placedBy.toHexString() === playerId;
            const isPlayerInside = isPlayerInsideShelter(playerX, playerY, shelter);
            
            return isOwner && isPlayerInside;
        }
    }
    
    // Object is not inside any shelter, interaction is allowed
    return true;
}

/**
 * Finds the closest interactable entity of each type within range of the local player.
 */
export function useInteractionFinder({
    localPlayer,
    campfires,
    furnaces, // ADDED: Furnace prop destructuring
    fumaroles, // ADDED: Fumarole prop destructuring (volcanic heat source)
    lanterns,
    homesteadHearths, // ADDED: HomesteadHearths prop destructuring
    droppedItems,
    woodenStorageBoxes,
    playerCorpses,
    stashes,
    rainCollectors,
    brothPots,
    doors, // ADDED: Door support
    alkStations, // ADDED: ALK station support
    sleepingBags,
    players,
    shelters,
    harvestableResources,
    inventoryItems,
    itemDefinitions,
    connection,
    playerDrinkingCooldowns,
    worldTiles,
}: UseInteractionFinderProps): UseInteractionFinderResult {

    // State for closest interactable IDs
    const [closestInteractableHarvestableResourceId, setClosestInteractableHarvestableResourceId] = useState<bigint | null>(null);
    const [closestInteractableCampfireId, setClosestInteractableCampfireId] = useState<number | null>(null);
    const [closestInteractableFurnaceId, setClosestInteractableFurnaceId] = useState<number | null>(null); // ADDED: Furnace state
    const [closestInteractableFumaroleId, setClosestInteractableFumaroleId] = useState<number | null>(null); // ADDED: Fumarole state
    const [closestInteractableLanternId, setClosestInteractableLanternId] = useState<number | null>(null);
    const [closestInteractableHearthId, setClosestInteractableHearthId] = useState<number | null>(null); // ADDED: HomesteadHearth state
    const [closestInteractableDroppedItemId, setClosestInteractableDroppedItemId] = useState<bigint | null>(null);
    const [closestInteractableBoxId, setClosestInteractableBoxId] = useState<number | null>(null);
    const [isClosestInteractableBoxEmpty, setIsClosestInteractableBoxEmpty] = useState<boolean>(false);
    const [closestInteractableCorpseId, setClosestInteractableCorpseId] = useState<bigint | null>(null);
    const [closestInteractableStashId, setClosestInteractableStashId] = useState<number | null>(null);
    const [closestInteractableRainCollectorId, setClosestInteractableRainCollectorId] = useState<number | null>(null);
    const [closestInteractableBrothPotId, setClosestInteractableBrothPotId] = useState<number | null>(null);
    const [closestInteractableDoorId, setClosestInteractableDoorId] = useState<bigint | null>(null); // ADDED: Door state
    const [closestInteractableAlkStationId, setClosestInteractableAlkStationId] = useState<number | null>(null); // ADDED: ALK station state
    const [closestInteractableSleepingBagId, setClosestInteractableSleepingBagId] = useState<number | null>(null);
    const [closestInteractableKnockedOutPlayerId, setClosestInteractableKnockedOutPlayerId] = useState<string | null>(null);
    const [closestInteractableWaterPosition, setClosestInteractableWaterPosition] = useState<{ x: number; y: number } | null>(null);

    const resultRef = useRef<UseInteractionFinderResult>({
        closestInteractableTarget: null,
        closestInteractableHarvestableResourceId: null,
        closestInteractableCampfireId: null,
        closestInteractableFurnaceId: null,
        closestInteractableFumaroleId: null, // ADDED: Fumarole
        closestInteractableLanternId: null,
        closestInteractableHearthId: null, // ADDED: HomesteadHearth
        closestInteractableDroppedItemId: null,
        closestInteractableBoxId: null,
        isClosestInteractableBoxEmpty: false,
        closestInteractableCorpseId: null,
        closestInteractableStashId: null,
        closestInteractableRainCollectorId: null,
        closestInteractableBrothPotId: null,
        closestInteractableSleepingBagId: null,
        closestInteractableKnockedOutPlayerId: null,
        closestInteractableWaterPosition: null,
        closestInteractableDoorId: null, // ADDED: Door support
        closestInteractableAlkStationId: null, // ADDED: ALK station support
    });

    const updateInteractionResult = useCallback(() => {
        // Single closest target across all types
        let closestTarget: InteractableTarget | null = null;
        let closestTargetDistSq = Infinity;

        // Generic harvestable resource tracking
        let closestHarvestableResourceId: bigint | null = null;
        let closestHarvestableResourceDistSq = PLAYER_HARVESTABLE_RESOURCE_INTERACTION_DISTANCE_SQUARED;

        let closestCampfireId: number | null = null;
        let closestCampfireDistSq = PLAYER_CAMPFIRE_INTERACTION_DISTANCE_SQUARED;

        let closestFurnaceId: number | null = null; // ADDED: Furnace tracking variables
        let closestFurnaceDistSq = PLAYER_FURNACE_INTERACTION_DISTANCE_SQUARED;

        let closestFumaroleId: number | null = null; // ADDED: Fumarole tracking variables
        let closestFumaroleDistSq = PLAYER_FUMAROLE_INTERACTION_DISTANCE_SQUARED;

        let closestLanternId: number | null = null;
        let closestLanternDistSq = PLAYER_LANTERN_INTERACTION_DISTANCE_SQUARED;

        let closestHearthId: number | null = null; // ADDED: HomesteadHearth tracking
        let closestHearthDistSq = PLAYER_HEARTH_INTERACTION_DISTANCE_SQUARED;

        let closestDroppedItemId: bigint | null = null;
        let closestDroppedItemDistSq = PLAYER_DROPPED_ITEM_INTERACTION_DISTANCE_SQUARED;

        let closestBoxId: number | null = null;
        let closestBoxDistSq = PLAYER_BOX_INTERACTION_DISTANCE_SQUARED;
        let isClosestBoxEmpty = false;

        let closestCorpse: bigint | null = null;
        let closestCorpseDistSq = PLAYER_CORPSE_INTERACTION_DISTANCE_SQUARED;

        let closestStashId: number | null = null;

        let closestRainCollectorId: number | null = null;
        let closestRainCollectorDistSq = PLAYER_RAIN_COLLECTOR_INTERACTION_DISTANCE_SQUARED;

        let closestBrothPotId: number | null = null;
        let closestBrothPotDistSq = PLAYER_RAIN_COLLECTOR_INTERACTION_DISTANCE_SQUARED; // Use same distance as rain collectors

        let closestDoorId: bigint | null = null;
        let closestDoorDistSq = PLAYER_DOOR_INTERACTION_DISTANCE_SQUARED; // Increased interaction distance for doors

        let closestAlkStationId: number | null = null;
        let closestAlkStationDistSq = PLAYER_ALK_STATION_INTERACTION_DISTANCE_SQUARED; // ALK delivery station interaction distance

        let closestSleepingBagId: number | null = null;
        let closestSleepingBagDistSq = PLAYER_SLEEPING_BAG_INTERACTION_DISTANCE_SQUARED;

        let closestKnockedOutPlayerId: string | null = null;
        let closestKnockedOutPlayerDistSq = PLAYER_KNOCKED_OUT_REVIVE_INTERACTION_DISTANCE_SQUARED;

        let closestWaterPosition: { x: number; y: number } | null = null;
        let closestWaterDistSq = PLAYER_WATER_DRINKING_INTERACTION_DISTANCE_SQUARED;

        // Helper function to update closest target if this one is closer
        const updateClosestTarget = (candidate: InteractableTarget) => {
            const candidateDistSq = candidate.distance * candidate.distance;
            if (candidateDistSq < closestTargetDistSq) {
                closestTargetDistSq = candidateDistSq;
                closestTarget = candidate;
            }
        };

        if (localPlayer) {
            const playerX = localPlayer.positionX;
            const playerY = localPlayer.positionY;

            // Find closest harvestable resource (generic unified system)
            if (harvestableResources) {
                harvestableResources.forEach((resource) => {
                    if (resource.respawnAt !== null && resource.respawnAt !== undefined) return;
                    
                    // Get resource type and configuration
                    const plantType = resource.plantType?.tag as ResourceType;
                    if (!plantType) return;
                    
                    try {
                        const config = getResourceConfig(plantType);
                        
                        // Use target width as a proxy for visual height (can be refined later)
                        const visualHeight = config.targetWidth;
                        const visualCenterY = resource.posY - (visualHeight / 2);
                        
                        // Calculate distance to resource
                        const dx = playerX - resource.posX;
                        const dy = playerY - visualCenterY;
                        const distSq = dx * dx + dy * dy;
                        
                        // Check if this is the closest harvestable resource
                        if (distSq < closestHarvestableResourceDistSq) {
                            closestHarvestableResourceDistSq = distSq;
                            closestHarvestableResourceId = resource.id;
                        }
                    } catch (error) {
                        // Unknown plant type, skip
                        return;
                    }
                });
            }

            // Find closest campfire
            if (campfires) {
                campfires.forEach((campfire) => {
                    const visualCenterY = campfire.posY - (CAMPFIRE_HEIGHT / 2) - CAMPFIRE_RENDER_Y_OFFSET;
                    
                    const dx = playerX - campfire.posX;
                    const dy = playerY - visualCenterY;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < closestCampfireDistSq) {
                        // Check shelter access control
                        if (canPlayerInteractWithObjectInShelter(
                            playerX, playerY, localPlayer.identity.toHexString(),
                            campfire.posX, campfire.posY, shelters
                        )) {
                            closestCampfireDistSq = distSq;
                            closestCampfireId = campfire.id;
                        }
                    }
                });
            }

            // Find closest furnace - ADDED: Centered on actual furnace body for seamless interaction
            if (furnaces) {
                furnaces.forEach((furnace) => {
                    // Use asymmetric interaction points for better approach from below while keeping top unchanged
                    let interactionCenterY;
                    if (playerY > furnace.posY) {
                        // Player is below furnace - use lower interaction point for easier approach
                        interactionCenterY = furnace.posY + 10; // Below the furnace base
                    } else {
                        // Player is above/level with furnace - use normal center point to keep existing behavior
                        interactionCenterY = furnace.posY - (FURNACE_HEIGHT / 2) - FURNACE_RENDER_Y_OFFSET;
                    }
                    
                    const dx = playerX - furnace.posX;
                    const dy = playerY - interactionCenterY;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < closestFurnaceDistSq) {
                        // Check shelter access control
                        if (canPlayerInteractWithObjectInShelter(
                            playerX, playerY, localPlayer.identity.toHexString(),
                            furnace.posX, furnace.posY, shelters
                        )) {
                            closestFurnaceDistSq = distSq;
                            closestFurnaceId = furnace.id;
                        }
                    }
                });
            }

            // Find closest fumarole - ADDED: Volcanic heat source (always-on, opens broth pot UI if present)
            if (fumaroles) {
                fumaroles.forEach((fumarole) => {
                    // Fumaroles are ground-level entities, use their position directly
                    const dx = playerX - fumarole.posX;
                    const dy = playerY - fumarole.posY;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < closestFumaroleDistSq) {
                        closestFumaroleDistSq = distSq;
                        closestFumaroleId = fumarole.id;
                    }
                });
            }

            // Find closest lantern
            if (lanterns) {
                lanterns.forEach((lantern) => {
                    const visualCenterY = lantern.posY - (LANTERN_HEIGHT / 2) - LANTERN_RENDER_Y_OFFSET;
                    
                    const dx = playerX - lantern.posX;
                    const dy = playerY - visualCenterY;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < closestLanternDistSq) {
                        // Check shelter access control
                        if (canPlayerInteractWithObjectInShelter(
                            playerX, playerY, localPlayer.identity.toHexString(),
                            lantern.posX, lantern.posY, shelters
                        )) {
                            closestLanternDistSq = distSq;
                            closestLanternId = lantern.id;
                        }
                    }
                });
            }

            // Find closest homestead hearth
            if (homesteadHearths) {
                homesteadHearths.forEach((hearth) => {
                    if (hearth.isDestroyed) return;
                    
                    const visualCenterY = hearth.posY - (HEARTH_HEIGHT / 2) - HEARTH_RENDER_Y_OFFSET;
                    
                    const dx = playerX - hearth.posX;
                    const dy = playerY - visualCenterY;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < closestHearthDistSq) {
                        // Check shelter access control
                        if (canPlayerInteractWithObjectInShelter(
                            playerX, playerY, localPlayer.identity.toHexString(),
                            hearth.posX, hearth.posY, shelters
                        )) {
                            closestHearthDistSq = distSq;
                            closestHearthId = hearth.id;
                        }
                    }
                });
            }

            // Find closest dropped item
            if (droppedItems) {
                droppedItems.forEach((item) => {
                    const dx = playerX - item.posX;
                    const dy = playerY - item.posY;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < closestDroppedItemDistSq) {
                        closestDroppedItemDistSq = distSq;
                        closestDroppedItemId = item.id;
                    }
                });
            }

            // Find closest wooden storage box and check emptiness
            if (woodenStorageBoxes) {
                woodenStorageBoxes.forEach((box) => {
                    // Use the visual center of the box (middle of the visible sprite)
                    // Rendering: drawY = entity.posY - drawHeight - 20, so visual center is halfway down
                    const visualCenterY = box.posY - (BOX_HEIGHT / 2) - 20;
                    
                    const dx = playerX - box.posX;
                    const dy = playerY - visualCenterY; // Use visual center for interaction distance
                    const distSq = dx * dx + dy * dy;
                    if (distSq < closestBoxDistSq) {
                        // Check shelter access control (use original stored position for shelter checks)
                        if (canPlayerInteractWithObjectInShelter(
                            playerX, playerY, localPlayer.identity.toHexString(),
                            box.posX, box.posY, shelters
                        )) {
                            closestBoxDistSq = distSq;
                            closestBoxId = box.id;
                            // Check if this closest box is empty
                            let isEmpty = true;
                            for (let i = 0; i < NUM_BOX_SLOTS; i++) {
                                const slotKey = `slotInstanceId${i}` as keyof SpacetimeDBWoodenStorageBox;
                                if (box[slotKey] !== null && box[slotKey] !== undefined) {
                                    isEmpty = false;
                                    break;
                                }
                            }
                            isClosestBoxEmpty = isEmpty;
                        }
                    }
                });
            }

            // Find closest player corpse
            if (playerCorpses) {
                playerCorpses.forEach((corpse) => {
                    const dx = playerX - corpse.posX;
                    const dy = playerY - corpse.posY;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < closestCorpseDistSq) {
                        // Check shelter access control
                        if (canPlayerInteractWithObjectInShelter(
                            playerX, playerY, localPlayer.identity.toHexString(),
                            corpse.posX, corpse.posY, shelters
                        )) {
                            closestCorpseDistSq = distSq;
                            closestCorpse = corpse.id as unknown as bigint;
                        }
                    }
                });
            }

            // Find closest stash
            if (stashes) {
                let currentMinDistSq = Infinity;

                stashes.forEach((stash) => {
                    const dx = playerX - stash.posX;
                    const dy = playerY - stash.posY;
                    const distSq = dx * dx + dy * dy;

                    // Determine the correct interaction radius based on stash visibility
                    const interactionThresholdSq = stash.isHidden
                        ? 24.0 * 24.0
                        : 48.0 * 48.0;

                    // Check if the stash is within its applicable interaction radius
                    if (distSq < interactionThresholdSq) {
                        // Check shelter access control
                        if (canPlayerInteractWithObjectInShelter(
                            playerX, playerY, localPlayer.identity.toHexString(),
                            stash.posX, stash.posY, shelters
                        )) {
                            // If it's within the radius, check if it's closer than any previous candidate
                            if (distSq < currentMinDistSq) {
                                currentMinDistSq = distSq;
                                closestStashId = stash.id; // Set the main closestStashId directly here
                            }
                        }
                    }
                });
                // closestStashId is now correctly set to the ID of the stash that is
                // within its specific interaction range AND is the closest among such stashes.
            }

            // Find closest rain collector
            if (rainCollectors) {
                // DEBUG: Log rain collector search
                // if (rainCollectors.size > 0) {
                //     console.log('[InteractionFinder] Searching rain collectors:', {
                //         playerPos: { x: playerX, y: playerY },
                //         rainCollectorCount: rainCollectors.size,
                //         rainCollectorPositions: Array.from(rainCollectors.values()).map(rc => ({ id: rc.id, pos: { x: rc.posX, y: rc.posY }, destroyed: rc.isDestroyed }))
                //     });
                // }
                
                rainCollectors.forEach((rainCollector) => {
                    if (rainCollector.isDestroyed) return;
                    
                    const dx = playerX - rainCollector.posX;
                    const dy = playerY - rainCollector.posY;
                    const distSq = dx * dx + dy * dy;
                    const distance = Math.sqrt(distSq);
                    
                    // DEBUG: Log distance check
                    // console.log(`[InteractionFinder] Rain collector ${rainCollector.id} distance: ${distance.toFixed(1)}px (threshold: ${Math.sqrt(PLAYER_RAIN_COLLECTOR_INTERACTION_DISTANCE_SQUARED).toFixed(1)}px)`);
                    
                    if (distSq < closestRainCollectorDistSq) {
                        // Check shelter access control
                        if (canPlayerInteractWithObjectInShelter(
                            playerX, playerY, localPlayer.identity.toHexString(),
                            rainCollector.posX, rainCollector.posY, shelters
                        )) {
                            // console.log(`[InteractionFinder] Rain collector ${rainCollector.id} is now closest interactable`);
                            closestRainCollectorDistSq = distSq;
                            closestRainCollectorId = rainCollector.id;
                        } else {
                            // console.log(`[InteractionFinder] Rain collector ${rainCollector.id} blocked by shelter access control`);
                        }
                    }
                });
            }

            // Find closest broth pot
            if (brothPots) {
                brothPots.forEach((brothPot) => {
                    if (brothPot.isDestroyed) return;
                    
                    const dx = playerX - brothPot.posX;
                    const dy = playerY - brothPot.posY;
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < closestBrothPotDistSq) {
                        // Check shelter access control
                        if (canPlayerInteractWithObjectInShelter(
                            playerX, playerY, localPlayer.identity.toHexString(),
                            brothPot.posX, brothPot.posY, shelters
                        )) {
                            closestBrothPotDistSq = distSq;
                            closestBrothPotId = brothPot.id;
                        }
                    }
                });
            }

            // Find closest door
            if (doors) {
                doors.forEach((door) => {
                    // Doors are rendered 44px higher than their actual position
                    // Use the visual position for interaction checks
                    const visualDoorY = door.posY - DOOR_RENDER_Y_OFFSET;
                    const dx = playerX - door.posX;
                    const dy = playerY - visualDoorY; // Use visual Y position
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < closestDoorDistSq) {
                        // Check shelter access control (use actual position for shelter check)
                        if (canPlayerInteractWithObjectInShelter(
                            playerX, playerY, localPlayer.identity.toHexString(),
                            door.posX, door.posY, shelters
                        )) {
                            closestDoorDistSq = distSq;
                            closestDoorId = door.id;
                        }
                    }
                });
            }

            // Find closest ALK delivery station
            if (alkStations) {
                alkStations.forEach((station) => {
                    if (!station.isActive) return; // Skip inactive stations
                    
                    // ALK stations use worldPosX/worldPosY as their base position
                    // For interaction, we use the base position (where players approach from)
                    const dx = playerX - station.worldPosX;
                    const dy = playerY - station.worldPosY;
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < closestAlkStationDistSq) {
                        closestAlkStationDistSq = distSq;
                        closestAlkStationId = station.stationId;
                    }
                });
            }

            // Find closest knocked out player (excluding local player)
            if (players) {
                players.forEach((player) => {
                    // Skip if it's the local player or player is not knocked out or is dead
                    if (localPlayer && player.identity.isEqual(localPlayer.identity)) {
                        return; // Skip local player
                    }
                    if (!player.isKnockedOut || player.isDead) {
                        return; // Skip if not knocked out or is dead
                    }
                    
                    const dx = playerX - player.positionX;
                    const dy = playerY - player.positionY;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < closestKnockedOutPlayerDistSq) {
                        closestKnockedOutPlayerDistSq = distSq;
                        closestKnockedOutPlayerId = player.identity.toHexString();
                    }
                });
            }

            // Find closest water position
            if (connection) {
                // Check if player has drinking cooldown first
                const playerIdHex = localPlayer.identity.toHexString();
                const drinkingCooldown = playerDrinkingCooldowns?.get(playerIdHex);
                
                let isOnCooldown = false;
                if (drinkingCooldown) {
                    const currentTime = Date.now() * 1000; // Convert to microseconds
                    const timeSinceLastDrink = currentTime - Number(drinkingCooldown.lastDrinkTime.__timestamp_micros_since_unix_epoch__);
                    const cooldownMicros = 1000 * 1000; // 1 second in microseconds
                    isOnCooldown = timeSinceLastDrink < cooldownMicros;
                }
                
                // Only check for water tiles if not on cooldown
                if (!isOnCooldown) {
                    // Check for water tiles in a small radius around the player
                    const checkRadiusTiles = 2; // Check 2 tiles around player (matches server-side logic)
                    const playerTileX = Math.floor(playerX / TILE_SIZE);
                    const playerTileY = Math.floor(playerY / TILE_SIZE);
                    
                    for (let dy = -checkRadiusTiles; dy <= checkRadiusTiles; dy++) {
                        for (let dx = -checkRadiusTiles; dx <= checkRadiusTiles; dx++) {
                            const checkTileX = playerTileX + dx;
                            const checkTileY = playerTileY + dy;
                            
                            // Calculate tile center position
                            const tileCenterX = (checkTileX + 0.5) * TILE_SIZE;
                            const tileCenterY = (checkTileY + 0.5) * TILE_SIZE;
                            
                            // Calculate distance from player to tile center
                            const distanceToTileSq = (playerX - tileCenterX) * (playerX - tileCenterX) + 
                                                   (playerY - tileCenterY) * (playerY - tileCenterY);
                            
                            // Only check tiles within drinking distance
                            if (distanceToTileSq <= closestWaterDistSq) {
                                // Check if this tile is water using the new world tiles system
                                if (worldTiles) {
                                    const tileKey = `${checkTileX}_${checkTileY}`;
                                    const tile = worldTiles.get(tileKey);
                                    if (tile && tile.tileType.tag === 'Sea') {
                                        // This is a water tile and it's closer than our current closest
                                        closestWaterDistSq = distanceToTileSq;
                                        closestWaterPosition = { x: tileCenterX, y: tileCenterY };
                                    }
                                }
                            }
                        }
                        
                        // Early exit if we found very close water
                        if (closestWaterPosition && closestWaterDistSq < (32.0 * 32.0)) {
                            break;
                        }
                    }
                }
            }

            // After all searches, determine the single closest target across all types
            const candidates: InteractableTarget[] = [];

            // Add closest harvestable resource to candidates if one was found
            if (closestHarvestableResourceId) {
                const harvestableResource = harvestableResources?.get(String(closestHarvestableResourceId));
                if (harvestableResource) {
                    candidates.push({
                        type: 'harvestable_resource',
                        id: closestHarvestableResourceId,
                        position: { x: harvestableResource.posX, y: harvestableResource.posY },
                        distance: Math.sqrt(closestHarvestableResourceDistSq)
                    });
                }
            }
            if (closestCampfireId) {
                candidates.push({
                    type: 'campfire',
                    id: closestCampfireId,
                    position: { x: 0, y: 0 },
                    distance: Math.sqrt(closestCampfireDistSq)
                });
            }
            if (closestFurnaceId) { // ADDED: Furnace candidate
                candidates.push({
                    type: 'furnace',
                    id: closestFurnaceId,
                    position: { x: 0, y: 0 },
                    distance: Math.sqrt(closestFurnaceDistSq)
                });
            }
            if (closestFumaroleId) { // ADDED: Fumarole candidate (volcanic heat source)
                const fumarole = fumaroles?.get(String(closestFumaroleId));
                if (fumarole) {
                    candidates.push({
                        type: 'fumarole',
                        id: closestFumaroleId,
                        position: { x: fumarole.posX, y: fumarole.posY },
                        distance: Math.sqrt(closestFumaroleDistSq)
                    });
                }
            }
            if (closestLanternId) {
                const lantern = lanterns?.get(String(closestLanternId));
                let isEmpty = true;
                if (lantern) {
                    // Check if lantern has valid fuel items (match server-side logic)
                    if (lantern.fuelInstanceId0 !== undefined && lantern.fuelInstanceId0 > 0n) {
                        // Check if the actual item exists and is valid tallow
                        const fuelItem = inventoryItems?.get(String(lantern.fuelInstanceId0));
                        if (fuelItem) {
                            const itemDef = itemDefinitions?.get(String(fuelItem.itemDefId));
                            if (itemDef && itemDef.name === "Tallow" && fuelItem.quantity > 0) {
                                isEmpty = false;
                            }
                        }
                    }
                }
                candidates.push({
                    type: 'lantern',
                    id: closestLanternId,
                    position: { x: 0, y: 0 },
                    distance: Math.sqrt(closestLanternDistSq),
                    data: {
                        isEmpty: isEmpty
                    }
                });
            }
            if (closestHearthId) { // ADDED: HomesteadHearth candidate
                candidates.push({
                    type: 'homestead_hearth',
                    id: closestHearthId,
                    position: { x: 0, y: 0 },
                    distance: Math.sqrt(closestHearthDistSq)
                });
            }
            if (closestDroppedItemId) {
                candidates.push({
                    type: 'dropped_item',
                    id: closestDroppedItemId,
                    position: { x: 0, y: 0 },
                    distance: Math.sqrt(closestDroppedItemDistSq)
                });
            }
            if (closestBoxId) {
                candidates.push({
                    type: 'box',
                    id: closestBoxId,
                    position: { x: 0, y: 0 },
                    distance: Math.sqrt(closestBoxDistSq),
                    data: {
                        isEmpty: isClosestBoxEmpty
                    }
                });
            }
            if (closestCorpse) {
                candidates.push({
                    type: 'corpse',
                    id: closestCorpse,
                    position: { x: 0, y: 0 },
                    distance: Math.sqrt(closestCorpseDistSq)
                });
            }
            if (closestStashId !== null && typeof closestStashId === 'number') {
                const stash = stashes?.get(String(closestStashId));
                if (stash && localPlayer) {
                    // Calculate distance for the closest stash
                    const dx = localPlayer.positionX - stash.posX;
                    const dy = localPlayer.positionY - stash.posY;
                    const stashDistSq = dx * dx + dy * dy;
                    candidates.push({
                        type: 'stash',
                        id: closestStashId,
                        position: { x: stash.posX, y: stash.posY },
                        distance: Math.sqrt(stashDistSq)
                    });
                }
            }
            if (closestRainCollectorId) {
                const rainCollector = rainCollectors?.get(String(closestRainCollectorId));
                if (rainCollector) {
                    candidates.push({
                        type: 'rain_collector',
                        id: closestRainCollectorId,
                        position: { x: rainCollector.posX, y: rainCollector.posY },
                        distance: Math.sqrt(closestRainCollectorDistSq)
                    });
                }
            }
            if (closestSleepingBagId) {
                candidates.push({
                    type: 'sleeping_bag',
                    id: closestSleepingBagId,
                    position: { x: 0, y: 0 },
                    distance: Math.sqrt(closestSleepingBagDistSq)
                });
            }
            if (closestKnockedOutPlayerId) {
                candidates.push({
                    type: 'knocked_out_player',
                    id: closestKnockedOutPlayerId,
                    position: { x: 0, y: 0 },
                    distance: Math.sqrt(closestKnockedOutPlayerDistSq)
                });
            }
            if (closestWaterPosition) {
                candidates.push({
                    type: 'water',
                    id: 'water', // Water doesn't have a real ID
                    position: closestWaterPosition,
                    distance: Math.sqrt(closestWaterDistSq)
                });
            }
            if (closestDoorId) {
                const door = doors?.get(String(closestDoorId));
                if (door) {
                    candidates.push({
                        type: 'door',
                        id: closestDoorId,
                        position: { x: door.posX, y: door.posY },
                        distance: Math.sqrt(closestDoorDistSq)
                    });
                }
            }
            if (closestAlkStationId !== null) { // CRITICAL: Check for null explicitly since station ID 0 is valid (central compound)
                const station = alkStations?.get(String(closestAlkStationId));
                if (station) {
                    candidates.push({
                        type: 'alk_station',
                        id: closestAlkStationId,
                        position: { x: station.worldPosX, y: station.worldPosY },
                        distance: Math.sqrt(closestAlkStationDistSq)
                    });
                }
            }
            // Broth pot removed from candidates - it now works through campfire interaction

            // Find the closest target using priority selection
            if (candidates.length > 0) {
                closestTarget = selectHighestPriorityTarget(candidates);
            }
        }

        const calculatedResult: UseInteractionFinderResult = {
            closestInteractableTarget: closestTarget,
            closestInteractableHarvestableResourceId: closestHarvestableResourceId,
            closestInteractableCampfireId: closestCampfireId,
            closestInteractableFurnaceId: closestFurnaceId, // ADDED: Furnace return
            closestInteractableFumaroleId: closestFumaroleId, // ADDED: Fumarole return
            closestInteractableLanternId: closestLanternId,
            closestInteractableHearthId: closestHearthId, // ADDED: HomesteadHearth return
            closestInteractableDroppedItemId: closestDroppedItemId,
            closestInteractableBoxId: closestBoxId,
            isClosestInteractableBoxEmpty: isClosestBoxEmpty,
            closestInteractableCorpseId: closestCorpse,
            closestInteractableStashId: closestStashId,
            closestInteractableRainCollectorId: closestRainCollectorId,
            closestInteractableBrothPotId: closestBrothPotId,
            closestInteractableSleepingBagId: closestSleepingBagId,
            closestInteractableKnockedOutPlayerId: closestKnockedOutPlayerId,
            closestInteractableWaterPosition: closestWaterPosition,
            closestInteractableDoorId: closestDoorId, // ADDED: Door support
            closestInteractableAlkStationId: closestAlkStationId, // ADDED: ALK station support
        };

        resultRef.current = calculatedResult;

        // Update states if changed
        if (calculatedResult.closestInteractableHarvestableResourceId !== closestInteractableHarvestableResourceId) {
            setClosestInteractableHarvestableResourceId(calculatedResult.closestInteractableHarvestableResourceId);
        }
        if (calculatedResult.closestInteractableCampfireId !== closestInteractableCampfireId) {
            setClosestInteractableCampfireId(calculatedResult.closestInteractableCampfireId);
        }
        if (calculatedResult.closestInteractableFurnaceId !== closestInteractableFurnaceId) { // ADDED: Furnace useEffect
            setClosestInteractableFurnaceId(calculatedResult.closestInteractableFurnaceId);
        }
        if (calculatedResult.closestInteractableFumaroleId !== closestInteractableFumaroleId) { // ADDED: Fumarole state update
            setClosestInteractableFumaroleId(calculatedResult.closestInteractableFumaroleId);
        }
        if (calculatedResult.closestInteractableLanternId !== closestInteractableLanternId) {
            setClosestInteractableLanternId(calculatedResult.closestInteractableLanternId);
        }
        if (calculatedResult.closestInteractableHearthId !== closestInteractableHearthId) { // ADDED: HomesteadHearth state update
            setClosestInteractableHearthId(calculatedResult.closestInteractableHearthId);
        }
        if (calculatedResult.closestInteractableDroppedItemId !== closestInteractableDroppedItemId) {
            setClosestInteractableDroppedItemId(calculatedResult.closestInteractableDroppedItemId);
        }
        if (calculatedResult.closestInteractableBoxId !== closestInteractableBoxId) {
            setClosestInteractableBoxId(calculatedResult.closestInteractableBoxId);
        }
        if (calculatedResult.isClosestInteractableBoxEmpty !== isClosestInteractableBoxEmpty) {
            setIsClosestInteractableBoxEmpty(calculatedResult.isClosestInteractableBoxEmpty);
        }
        // Update corpse state based on memoized result
        if (calculatedResult.closestInteractableCorpseId !== closestInteractableCorpseId) {
            setClosestInteractableCorpseId(calculatedResult.closestInteractableCorpseId);
        }
        if (calculatedResult.closestInteractableStashId !== closestInteractableStashId) {
            setClosestInteractableStashId(calculatedResult.closestInteractableStashId);
        }
        if (calculatedResult.closestInteractableRainCollectorId !== closestInteractableRainCollectorId) {
            setClosestInteractableRainCollectorId(calculatedResult.closestInteractableRainCollectorId);
        }
        if (calculatedResult.closestInteractableBrothPotId !== closestInteractableBrothPotId) {
            setClosestInteractableBrothPotId(calculatedResult.closestInteractableBrothPotId);
        }
        if (calculatedResult.closestInteractableDoorId !== closestInteractableDoorId) {
            setClosestInteractableDoorId(calculatedResult.closestInteractableDoorId);
        }
        if (calculatedResult.closestInteractableAlkStationId !== closestInteractableAlkStationId) {
            setClosestInteractableAlkStationId(calculatedResult.closestInteractableAlkStationId);
        }
        if (calculatedResult.closestInteractableSleepingBagId !== closestInteractableSleepingBagId) {
            setClosestInteractableSleepingBagId(calculatedResult.closestInteractableSleepingBagId);
        }
        if (calculatedResult.closestInteractableKnockedOutPlayerId !== closestInteractableKnockedOutPlayerId) {
            setClosestInteractableKnockedOutPlayerId(calculatedResult.closestInteractableKnockedOutPlayerId);
        }
        if (calculatedResult.closestInteractableWaterPosition !== closestInteractableWaterPosition) {
            setClosestInteractableWaterPosition(calculatedResult.closestInteractableWaterPosition);
        }
    }, [localPlayer, harvestableResources, campfires, furnaces, fumaroles, lanterns, homesteadHearths, droppedItems, woodenStorageBoxes, playerCorpses, stashes, rainCollectors, sleepingBags, players, shelters, inventoryItems, itemDefinitions, connection, playerDrinkingCooldowns]);

    useEffect(() => {
        // Use requestAnimationFrame for frame-synced updates (every ~16ms at 60fps)
        // This ensures interactions are detected immediately as players move past items
        let animationFrameId: number | null = null;
        
        const updateLoop = () => {
            updateInteractionResult();
            animationFrameId = requestAnimationFrame(updateLoop);
        };
        
        // Start the update loop
        animationFrameId = requestAnimationFrame(updateLoop);
        
        return () => {
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [updateInteractionResult]);

    return {
        closestInteractableTarget: resultRef.current.closestInteractableTarget,
        closestInteractableHarvestableResourceId,
        closestInteractableCampfireId,
        closestInteractableFurnaceId, // ADDED: Furnace final return
        closestInteractableFumaroleId, // ADDED: Fumarole final return
        closestInteractableLanternId,
        closestInteractableHearthId, // ADDED: HomesteadHearth final return
        closestInteractableDroppedItemId,
        closestInteractableBoxId,
        isClosestInteractableBoxEmpty,
        closestInteractableCorpseId,
        closestInteractableStashId,
        closestInteractableRainCollectorId,
        closestInteractableBrothPotId,
        closestInteractableDoorId, // ADDED: Door support
        closestInteractableAlkStationId, // ADDED: ALK station support
        closestInteractableSleepingBagId,
        closestInteractableKnockedOutPlayerId,
        closestInteractableWaterPosition,
    };
}

export default useInteractionFinder; 