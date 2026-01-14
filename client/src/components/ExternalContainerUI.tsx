/******************************************************************************
 * ExternalContainerUI.tsx                                                     *
 * -------------------------------------------------------------------------- *
 * Manages the UI for external containers like campfires, wooden storage      *
 * boxes, player corpses, and stashes. Displays items, handles               *
 * drag-and-drop interactions, and context menus for these containers.        *
 ******************************************************************************/

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import styles from './InventoryUI.module.css'; // Reuse styles for now
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faArrowDown, faDroplet, faArrowRight } from '@fortawesome/free-solid-svg-icons';

// Import Custom Components
import ContainerSlots from './ContainerSlots';
import ContainerButtons from './ContainerButtons';
import DroppableSlot from './DroppableSlot';
import DraggableItem from './DraggableItem';
import DurabilityBar from './DurabilityBar';
import { getAllSlotProgress } from '../utils/containerProgressUtils';

// Import Types
import { 
    ItemDefinition, InventoryItem, DbConnection, 
    Campfire as SpacetimeDBCampfire,
    Furnace as SpacetimeDBFurnace,
    Barbecue as SpacetimeDBBarbecue, // ADDED: Barbecue import
    Fumarole as SpacetimeDBFumarole, // ADDED: Fumarole import
    Lantern as SpacetimeDBLantern, 
    WoodenStorageBox as SpacetimeDBWoodenStorageBox, 
    PlayerCorpse, 
    Stash as SpacetimeDBStash,
    Shelter as SpacetimeDBShelter,
    Tree as SpacetimeDBTree,
    RainCollector as SpacetimeDBRainCollector,
    HomesteadHearth as SpacetimeDBHomesteadHearth, // ADDED: HomesteadHearth import
    BrothPot as SpacetimeDBBrothPot, // ADDED: BrothPot import
    HearthUpkeepQueryResult, // ADDED: For upkeep query results
    WorldState,
    Player,
    ActiveConsumableEffect,
} from '../generated';
import { InteractionTarget } from '../hooks/useInteractionManager';
import { DragSourceSlotInfo, DraggedItemInfo } from '../types/dragDropTypes';
import { PopulatedItem } from './InventoryUI';
import { isWaterContainer, getWaterContent, formatWaterContent, getWaterLevelPercentage, isSaltWater } from '../utils/waterContainerHelpers';
import { hasDurabilitySystem, getDurabilityPercentage, isItemBroken, getDurabilityColor, isFoodItem, isFoodSpoiled, formatFoodSpoilageTimeRemaining, formatDurability, getDurability, getMaxDurability, getRepairCount, canItemBeRepaired, getRepairBlockedReason, calculateRepairCost, formatRepairCost, MAX_REPAIR_COUNT, MAX_DURABILITY } from '../utils/durabilityHelpers';
import { BOX_TYPE_REPAIR_BENCH } from '../utils/renderers/woodenStorageBoxRenderingUtils';
import { getItemIcon } from '../utils/itemIconUtils';
import { playImmediateSound } from '../hooks/useSoundSystem';

/**
 * Convert item display name to icon asset name
 * e.g. "Wood" -> "wood.png", "Metal Fragments" -> "metal_fragments.png"
 */
function getIconAssetFromName(itemName: string): string {
    return itemName.toLowerCase().replace(/ /g, '_') + '.png';
}

// Import AI Brewing Service
import { 
    generateFullBrewRecipe, 
    recipeToServerJson, 
    getIngredientRarities,
    computeRecipeHash 
} from '../services/brewingAIService';

// Import new utilities
import { useContainer } from '../hooks/useContainer';
import { ContainerType, isFuelContainer, getContainerConfig, extractContainerItems, createContainerCallbacks } from '../utils/containerUtils';
import { calculateChunkIndex } from '../utils/chunkUtils';

// Helper function to format decay time estimate
function formatDecayTime(hours: number): string {
    if (hours < 1) {
        const minutes = Math.round(hours * 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else if (hours < 24) {
        const wholeHours = Math.floor(hours);
        const minutes = Math.round((hours - wholeHours) * 60);
        if (minutes > 0) {
            return `${wholeHours}h ${minutes}m`;
        }
        return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''}`;
    } else {
        const days = Math.floor(hours / 24);
        const remainingHours = Math.floor(hours % 24);
        if (remainingHours > 0) {
            return `${days} day${days !== 1 ? 's' : ''} ${remainingHours}h`;
        }
        return `${days} day${days !== 1 ? 's' : ''}`;
    }
}

// Helper function to calculate how long resources will last
function calculateResourceDuration(upkeepCosts: {
    requiredWood: number;
    requiredStone: number;
    requiredMetal: number;
    availableWood: number;
    availableStone: number;
    availableMetal: number;
}): string {
    // Calculate hours each resource type will last (infinity if not required)
    const woodHours = upkeepCosts.requiredWood > 0 
        ? upkeepCosts.availableWood / upkeepCosts.requiredWood 
        : Infinity;
    const stoneHours = upkeepCosts.requiredStone > 0 
        ? upkeepCosts.availableStone / upkeepCosts.requiredStone 
        : Infinity;
    const metalHours = upkeepCosts.requiredMetal > 0 
        ? upkeepCosts.availableMetal / upkeepCosts.requiredMetal 
        : Infinity;
    
    // The shortest duration determines when resources run out
    const shortestDuration = Math.min(woodHours, stoneHours, metalHours);
    
    if (!isFinite(shortestDuration)) {
        return "indefinitely (no upkeep required)";
    }
    
    return formatDecayTime(shortestDuration);
}

interface ExternalContainerUIProps {
    interactionTarget: InteractionTarget;
    inventoryItems: Map<string, InventoryItem>;
    itemDefinitions: Map<string, ItemDefinition>;
    campfires: Map<string, SpacetimeDBCampfire>;
    furnaces: Map<string, SpacetimeDBFurnace>;
    barbecues: Map<string, SpacetimeDBBarbecue>; // ADDED: Barbecues
    fumaroles: Map<string, SpacetimeDBFumarole>; // ADDED: Fumaroles
    lanterns: Map<string, SpacetimeDBLantern>;
    woodenStorageBoxes: Map<string, SpacetimeDBWoodenStorageBox>;
    playerCorpses: Map<string, PlayerCorpse>;
    stashes: Map<string, SpacetimeDBStash>;
    rainCollectors: Map<string, SpacetimeDBRainCollector>;
    homesteadHearths: Map<string, SpacetimeDBHomesteadHearth>; // ADDED: HomesteadHearths
    brothPots: Map<string, SpacetimeDBBrothPot>; // ADDED: BrothPots
    shelters?: Map<string, SpacetimeDBShelter>;
    trees?: Map<string, SpacetimeDBTree>;
    currentStorageBox?: SpacetimeDBWoodenStorageBox | null;
    connection: DbConnection | null;
    onItemDragStart: (info: DraggedItemInfo) => void;
    onItemDrop: (targetSlotInfo: DragSourceSlotInfo | null) => void;
    playerId: string | null;
    onExternalItemMouseEnter: (item: PopulatedItem, event: React.MouseEvent<HTMLDivElement>) => void;
    onExternalItemMouseLeave: () => void;
    onExternalItemMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
    worldState: WorldState | null;
    players?: Map<string, Player>; // ADDED: Players for building privilege list
    activeConsumableEffects?: Map<string, ActiveConsumableEffect>; // ADDED: For building privilege check
    chunkWeather?: Map<string, any>; // ADDED: Chunk-based weather
    // Hot loot props
    isHotLootActive?: boolean;
    getSlotIndicator?: (slotType: string, slotIndex: number | string, parentId?: number | bigint) => { progress: number } | undefined;
    onHotLootSlotHover?: (item: PopulatedItem, slotInfo: DragSourceSlotInfo, context: 'player' | 'container') => void;
    setHotLootCurrentHover?: (item: PopulatedItem | null, slotInfo: DragSourceSlotInfo | null, context: 'player' | 'container' | null) => void;
}

const ExternalContainerUI: React.FC<ExternalContainerUIProps> = ({
    interactionTarget,
    inventoryItems,
    itemDefinitions,
    campfires,
    furnaces,
    barbecues, // ADDED: Barbecues
    fumaroles, // ADDED: Fumaroles
    lanterns,
    woodenStorageBoxes,
    playerCorpses,
    stashes,
    rainCollectors,
    homesteadHearths, // ADDED: HomesteadHearths
    brothPots, // ADDED: BrothPots
    shelters,
    trees,
    currentStorageBox,
    connection,
    onItemDragStart,
    onItemDrop,
    playerId,
    onExternalItemMouseEnter,
    onExternalItemMouseLeave,
    onExternalItemMouseMove,
    worldState,
    players,
    activeConsumableEffects,
    chunkWeather,
    isHotLootActive,
    getSlotIndicator,
    onHotLootSlotHover,
    setHotLootCurrentHover,
}) => {
    // Add ref to track when drag operations complete
    const lastDragCompleteTime = useRef<number>(0);

    // Wrap the onItemDrop to track completion times
    const handleItemDropWithTracking = useCallback((targetSlotInfo: DragSourceSlotInfo | null) => {
        lastDragCompleteTime.current = Date.now();
        onItemDrop(targetSlotInfo);
    }, [onItemDrop]);

    // Use the new container hook to eliminate all the duplication!
    const container = useContainer({
        interactionTarget,
        inventoryItems,
        itemDefinitions,
        campfires,
        furnaces,
        barbecues,
        fumaroles,
        lanterns,
        woodenStorageBoxes,
        playerCorpses,
        stashes,
        rainCollectors,
        homesteadHearths,
        brothPots,
        currentStorageBox,
        connection,
        lastDragCompleteTime
    });
    
    // Track current time for compost progress updates
    const [currentTime, setCurrentTime] = useState(Date.now());
    
    // Update time periodically for compost progress (every second)
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(Date.now());
        }, 1000); // Update every second
        
        return () => clearInterval(interval);
    }, []);
    
    // Calculate progress for cooking/fertilizing overlays
    const slotProgress = useMemo(() => {
        if (!container.containerType || !container.containerEntity) {
            return new Map<number, number>();
        }
        
        return getAllSlotProgress(
            container.containerType,
            container.containerEntity,
            container.items,
            currentTime
        );
    }, [container.containerType, container.containerEntity, container.items, currentTime]);

    // Enhanced tooltip handler for campfire items to show Reed Bellows effects
    const handleCampfireFuelMouseEnter = useCallback((item: PopulatedItem, event: React.MouseEvent<HTMLDivElement>) => {
        // Prevent browser tooltip
        event.currentTarget.removeAttribute('title');
        
        // Check if Reed Bellows is present in the campfire
        const currentCampfire = container.containerEntity as SpacetimeDBCampfire;
        const hasReedBellows = currentCampfire && [
            currentCampfire.slotDefId0, currentCampfire.slotDefId1, 
            currentCampfire.slotDefId2, currentCampfire.slotDefId3, 
            currentCampfire.slotDefId4
        ].some(defId => {
            if (defId) {
                const itemDef = itemDefinitions.get(defId.toString());
                return itemDef?.name === 'Reed Bellows';
            }
            return false;
        });

        if (hasReedBellows) {
            let enhancedItem = { ...item };
            let descriptionAddition = '';

            // Handle fuel items - show enhanced burn time
            if (item.definition.fuelBurnDurationSecs && item.definition.fuelBurnDurationSecs > 0) {
                const enhancedBurnTime = Math.round(item.definition.fuelBurnDurationSecs * 1.5);
                enhancedItem = {
                    ...item,
                    definition: {
                        ...item.definition,
                        fuelBurnDurationSecs: enhancedBurnTime
                    }
                };
                descriptionAddition = `\n\n🎐 Reed Bellows: +50% burn time (${item.definition.fuelBurnDurationSecs}s → ${enhancedBurnTime}s)`;
            }
            // Handle cookable items - show enhanced cooking speed
            else if (item.definition.cookTimeSecs && item.definition.cookTimeSecs > 0) {
                const enhancedCookTime = Math.round(item.definition.cookTimeSecs / 1.2);
                enhancedItem = {
                    ...item,
                    definition: {
                        ...item.definition,
                        cookTimeSecs: enhancedCookTime
                    }
                };
                descriptionAddition = `\n\n🎐 Reed Bellows: +20% cooking speed (${item.definition.cookTimeSecs}s → ${enhancedCookTime}s)`;
            }

            // Add description if we have enhancement info
            if (descriptionAddition) {
                enhancedItem = {
                    ...enhancedItem,
                    definition: {
                        ...enhancedItem.definition,
                        description: `${item.definition.description}${descriptionAddition}`
                    }
                };
            }

            onExternalItemMouseEnter(enhancedItem, event);
        } else {
            // Regular tooltip when no Reed Bellows present
            onExternalItemMouseEnter(item, event);
        }
    }, [onExternalItemMouseEnter, container.containerEntity, itemDefinitions]);

    // Enhanced tooltip handler for furnace items to show Reed Bellows effects
    const handleFurnaceFuelMouseEnter = useCallback((item: PopulatedItem, event: React.MouseEvent<HTMLDivElement>) => {
        // Prevent browser tooltip
        event.currentTarget.removeAttribute('title');
        
        // Check if Reed Bellows is present in the furnace
        const currentFurnace = container.containerEntity as SpacetimeDBFurnace;
        const hasReedBellows = currentFurnace && [
            currentFurnace.slotDefId0, currentFurnace.slotDefId1, 
            currentFurnace.slotDefId2, currentFurnace.slotDefId3, 
            currentFurnace.slotDefId4
        ].some(defId => {
            if (defId) {
                const itemDef = itemDefinitions.get(defId.toString());
                return itemDef?.name === 'Reed Bellows';
            }
            return false;
        });

        if (hasReedBellows) {
            let enhancedItem = { ...item };
            let descriptionAddition = '';

            // Handle fuel items - show enhanced burn time
            if (item.definition.fuelBurnDurationSecs && item.definition.fuelBurnDurationSecs > 0) {
                const enhancedBurnTime = Math.round(item.definition.fuelBurnDurationSecs * 1.5);
                enhancedItem = {
                    ...item,
                    definition: {
                        ...item.definition,
                        fuelBurnDurationSecs: enhancedBurnTime
                    }
                };
                descriptionAddition = `\n\n🎐 Reed Bellows: +50% burn time (${item.definition.fuelBurnDurationSecs}s → ${enhancedBurnTime}s)`;
            }
            // Handle smeltable items - show enhanced smelting speed
            else if (item.definition.cookTimeSecs && item.definition.cookTimeSecs > 0) {
                const enhancedSmeltTime = item.definition.cookTimeSecs / 1.2;
                const enhancedSmeltTimeRounded = Math.round(enhancedSmeltTime * 10) / 10; // Round to 1 decimal place
                const baseTimeRounded = Math.round(item.definition.cookTimeSecs * 10) / 10; // Round base time too
                enhancedItem = {
                    ...item,
                    definition: {
                        ...item.definition,
                        cookTimeSecs: enhancedSmeltTimeRounded
                    }
                };
                descriptionAddition = `\n\n🎐 Reed Bellows: +20% smelting speed (${baseTimeRounded}s → ${enhancedSmeltTimeRounded}s)`;
            }

            // Add description if we have enhancement info
            if (descriptionAddition) {
                enhancedItem = {
                    ...enhancedItem,
                    definition: {
                        ...enhancedItem.definition,
                        description: `${item.definition.description}${descriptionAddition}`
                    }
                };
            }

            onExternalItemMouseEnter(enhancedItem, event);
        } else {
            // Regular tooltip when no Reed Bellows present
            onExternalItemMouseEnter(item, event);
        }
    }, [onExternalItemMouseEnter, container.containerEntity, itemDefinitions]);

    // Helper function to check if it's raining heavily enough to prevent campfire lighting
    // Uses chunk-based weather for the campfire's position
    const isHeavyRaining = useMemo(() => {
        if (container.containerType !== 'campfire' || !container.containerEntity || !chunkWeather) {
            return false;
        }
        
        const campfire = container.containerEntity as SpacetimeDBCampfire;
        const campfireChunkIndex = calculateChunkIndex(campfire.posX, campfire.posY);
        const chunkWeatherData = chunkWeather.get(campfireChunkIndex.toString());
        
        if (!chunkWeatherData || !chunkWeatherData.currentWeather) {
            // Fallback to global weather if chunk weather not available
            if (worldState?.currentWeather) {
            return worldState.currentWeather.tag === 'HeavyRain' || worldState.currentWeather.tag === 'HeavyStorm';
            }
            return false;
        }
        
        // Check chunk weather for heavy rain/storm
        const weatherTag = chunkWeatherData.currentWeather.tag;
        return weatherTag === 'HeavyRain' || weatherTag === 'HeavyStorm';
    }, [container.containerType, container.containerEntity, chunkWeather, worldState]);

    // Helper function to check if campfire is protected from rain
    const campfireProtection = useMemo(() => {
        if (container.containerType !== 'campfire' || !container.containerEntity) {
            return { isProtected: false, protectionType: null, hasData: false };
        }
        
        const currentCampfire = container.containerEntity as SpacetimeDBCampfire;
        const hasShelterData = shelters && shelters.size >= 0;
        const hasTreeData = trees && trees.size >= 0;
        
        if (!hasShelterData && !hasTreeData) {
            return { isProtected: false, protectionType: null, hasData: false };
        }
        
        // Check shelter protection
        if (shelters) {
            for (const shelter of Array.from(shelters.values())) {
                if (shelter.isDestroyed) continue;
                
                const SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y = 25.0;
                const SHELTER_AABB_HALF_WIDTH = 96.0;
                const SHELTER_AABB_HALF_HEIGHT = 64.0;
                
                const shelterAabbCenterX = shelter.posX;
                const shelterAabbCenterY = shelter.posY - SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y;
                const aabbLeft = shelterAabbCenterX - SHELTER_AABB_HALF_WIDTH;
                const aabbRight = shelterAabbCenterX + SHELTER_AABB_HALF_WIDTH;
                const aabbTop = shelterAabbCenterY - SHELTER_AABB_HALF_HEIGHT;
                const aabbBottom = shelterAabbCenterY + SHELTER_AABB_HALF_HEIGHT;
                
                if (currentCampfire.posX >= aabbLeft && currentCampfire.posX <= aabbRight &&
                    currentCampfire.posY >= aabbTop && currentCampfire.posY <= aabbBottom) {
                    return { isProtected: true, protectionType: 'shelter', hasData: true };
                }
            }
        }
        
        // Check tree protection
        const TREE_PROTECTION_DISTANCE_SQ = 100.0 * 100.0;
        
        if (trees) {
            for (const tree of Array.from(trees.values())) {
                // Skip trees that are respawning (destroyed)
                if (tree.respawnAt && tree.respawnAt.microsSinceUnixEpoch !== 0n) continue;
                
                const dx = currentCampfire.posX - tree.posX;
                const dy = currentCampfire.posY - tree.posY;
                const distanceSq = dx * dx + dy * dy;
                
                if (distanceSq <= TREE_PROTECTION_DISTANCE_SQ) {
                    return { isProtected: true, protectionType: 'tree', hasData: true };
                }
            }
        }
        
        return { isProtected: false, protectionType: null, hasData: true };
    }, [container.containerType, container.containerEntity, shelters, trees]);

    // Calculate toggle button state for campfire
    const isToggleButtonDisabled = useMemo(() => {
        if (container.containerType !== 'campfire' || !container.containerEntity) return true;
        if (container.isActive) return false; // If already burning, can extinguish
        
        // Check if there's valid fuel first
        const hasValidFuel = container.items.some(item => 
            item && 
            item.definition.fuelBurnDurationSecs !== undefined && 
            item.definition.fuelBurnDurationSecs > 0 && 
            item.instance.quantity > 0
        );
        
        if (!hasValidFuel) return true; // No fuel = disabled
        return false; // Has fuel and either no rain or protected = enabled
    }, [container.containerType, container.containerEntity, container.isActive, container.items]);

    // Helper function to get weather warning message
    // Uses chunk-based weather for the campfire's position
    const getWeatherWarningMessage = useMemo(() => {
        if (!isHeavyRaining || container.containerType !== 'campfire' || !container.containerEntity || !chunkWeather) {
            return null;
        }
        
        const campfire = container.containerEntity as SpacetimeDBCampfire;
        const campfireChunkIndex = calculateChunkIndex(campfire.posX, campfire.posY);
        const chunkWeatherData = chunkWeather.get(campfireChunkIndex.toString());
        
        // Get weather tag from chunk weather or fallback to global weather
        let weatherTag: string | null = null;
        if (chunkWeatherData?.currentWeather) {
            weatherTag = chunkWeatherData.currentWeather.tag;
        } else if (worldState?.currentWeather) {
            weatherTag = worldState.currentWeather.tag;
        }
        
        if (!weatherTag) return null;
        
        switch (weatherTag) {
            case 'HeavyRain':
                return "Heavy rain - May require shelter 🏠 or tree cover 🌳";
            case 'HeavyStorm':
                return "Heavy storm - May require shelter 🏠 or tree cover 🌳";
            default:
                return "Severe weather - May require shelter 🏠 or tree cover 🌳";
        }
    }, [isHeavyRaining, container.containerType, container.containerEntity, chunkWeather, worldState]);

    // Determine if the current player can operate the stash hide/surface button
    const canOperateStashButton = useMemo(() => {
        if (container.containerType !== 'stash' || !container.containerEntity || !playerId) return false;
        
        const stash = container.containerEntity as SpacetimeDBStash;
        if (stash.isHidden) {
            return true; // Anyone can attempt to surface if they are close enough
        }
        // If not hidden, only placer or last surfacer can hide it
        return stash.placedBy?.toHexString() === playerId || stash.lastSurfacedBy?.toHexString() === playerId;
    }, [container.containerType, container.containerEntity, playerId]);

    // Handle stash visibility toggle
    const handleToggleStashVisibility = useCallback(() => {
        if (!connection?.reducers || container.containerId === null || !container.containerEntity) return;
        
        const stashIdNum = typeof container.containerId === 'bigint' ? Number(container.containerId) : container.containerId;
        try {
            connection.reducers.toggleStashVisibility(stashIdNum);
        } catch (e: any) {
            console.error("Error toggling stash visibility:", e);
        }
    }, [connection, container.containerId, container.containerEntity]);

    // Handle rain collector fill water container
    const handleFillWaterContainer = useCallback(() => {
        if (!connection?.reducers || container.containerId === null || !container.containerEntity) return;
        
        const rainCollectorIdNum = typeof container.containerId === 'bigint' ? Number(container.containerId) : container.containerId;
        try {
            connection.reducers.fillWaterContainer(rainCollectorIdNum);
        } catch (e: any) {
            console.error("Error filling water container:", e);
        }
    }, [connection, container.containerId, container.containerEntity]);

    // Handle repair bench item repair
    const handleRepairItem = useCallback(() => {
        if (!connection?.reducers || container.containerId === null || !container.containerEntity) return;
        
        const boxId = typeof container.containerId === 'bigint' ? Number(container.containerId) : container.containerId;
        try {
            connection.reducers.repairItem(boxId);
        } catch (e: any) {
            console.error("Error repairing item:", e);
        }
    }, [connection, container.containerId, container.containerEntity]);

    // Track if privilege toggle is in progress to prevent double-clicks
    const [isTogglingPrivilege, setIsTogglingPrivilege] = useState(false);

    // Track empty reservoir confirmation dialog
    const [showEmptyReservoirConfirm, setShowEmptyReservoirConfirm] = useState(false);
    const [pendingEmptyReservoirId, setPendingEmptyReservoirId] = useState<number | null>(null);
    const [pendingEmptyReservoirInfo, setPendingEmptyReservoirInfo] = useState<{
        waterAmount: number;
        waterType: string;
        isSalt: boolean;
    } | null>(null);

    // Handle grant building privilege for matron's chest
    // CRITICAL FIX: Add debouncing and proper error handling
    const handleGrantBuildingPrivilege = useCallback(() => {
        if (!connection?.reducers || container.containerId === null || !container.containerEntity) {
            console.warn("[BuildingPrivilege] Cannot grant privilege - missing connection or container");
            return;
        }
        
        // Prevent double-clicks and rapid toggling
        if (isTogglingPrivilege) {
            console.warn("[BuildingPrivilege] Toggle already in progress, ignoring click");
            return;
        }
        
        setIsTogglingPrivilege(true);
        const hearthIdNum = typeof container.containerId === 'bigint' ? Number(container.containerId) : container.containerId;
        
        // Register one-time callback to handle the response
        const handlePrivilegeResponse = (ctx: any, hearthIdParam: number) => {
            if (hearthIdParam !== hearthIdNum) return; // Not our call
            
            // Remove callback after handling
            if (connection?.reducers?.removeOnGrantBuildingPrivilegeFromHearth) {
                connection.reducers.removeOnGrantBuildingPrivilegeFromHearth(handlePrivilegeResponse);
            }
            
            // Reset toggle flag
            setIsTogglingPrivilege(false);
            
            // Check reducer event status
            const status = ctx.event?.status;
            if (status?.tag === 'Failed') {
                const errorMsg = status.value || 'Failed to toggle building privilege';
                console.error("[BuildingPrivilege] Failed to toggle privilege:", errorMsg);
                // Show error to user
                alert(`Failed to toggle building privilege: ${errorMsg}`);
            } else if (status?.tag === 'Committed') {
                console.log("[BuildingPrivilege] Successfully toggled building privilege");
                // State will update automatically via activeConsumableEffects subscription
                // Give it a moment to propagate
                setTimeout(() => {
                    console.log("[BuildingPrivilege] State should be updated now");
                }, 100);
            }
        };
        
        // Register callback before calling reducer
        if (connection.reducers.onGrantBuildingPrivilegeFromHearth) {
            connection.reducers.onGrantBuildingPrivilegeFromHearth(handlePrivilegeResponse);
        }
        
        try {
            console.log("[BuildingPrivilege] Calling grantBuildingPrivilegeFromHearth for hearth", hearthIdNum);
            connection.reducers.grantBuildingPrivilegeFromHearth(hearthIdNum);
            
            // Timeout fallback in case callback never fires (shouldn't happen, but safety net)
            setTimeout(() => {
                setIsTogglingPrivilege(false);
            }, 5000); // 5 second timeout
        } catch (e: any) {
            console.error("[BuildingPrivilege] Error calling reducer:", e);
            setIsTogglingPrivilege(false);
            // Remove callback on error
            if (connection?.reducers?.removeOnGrantBuildingPrivilegeFromHearth) {
                connection.reducers.removeOnGrantBuildingPrivilegeFromHearth(handlePrivilegeResponse);
            }
        }
    }, [connection, container.containerId, container.containerEntity, isTogglingPrivilege]);

    // Get list of players with building privilege
    const playersWithPrivilege = useMemo(() => {
        if (!activeConsumableEffects || !players) return [];
        
        const privilegePlayers: Array<{ id: string; name: string | null }> = [];
        
        activeConsumableEffects.forEach((effect) => {
            const effectTypeTag = effect.effectType ? (effect.effectType as any).tag : 'undefined';
            if (effectTypeTag === 'BuildingPrivilege') {
                const playerIdHex = effect.playerId.toHexString();
                const player = players.get(playerIdHex);
                if (player) {
                    privilegePlayers.push({
                        id: playerIdHex,
                        name: player.username || null
                    });
                }
            }
        });
        
        return privilegePlayers;
    }, [activeConsumableEffects, players]);
    
    // Check if current player has building privilege
    // CRITICAL FIX: Ensure state updates properly
    const currentPlayerHasPrivilege = useMemo(() => {
        if (!activeConsumableEffects || !playerId) return false;
        
        return Array.from(activeConsumableEffects.values()).some((effect) => {
            const effectTypeTag = effect.effectType ? (effect.effectType as any).tag : 'undefined';
            const effectPlayerIdHex = effect.playerId.toHexString();
            return effectTypeTag === 'BuildingPrivilege' && effectPlayerIdHex === playerId;
        });
    }, [activeConsumableEffects, playerId]);

    // Upkeep costs state
    const [upkeepCosts, setUpkeepCosts] = useState<{
        requiredWood: number;
        requiredStone: number;
        requiredMetal: number;
        availableWood: number;
        availableStone: number;
        availableMetal: number;
        estimatedDecayHours: number | null | undefined; // Estimated hours until first building decays
    } | null>(null);

    // Query upkeep costs when chest is opened - subscribe to table instead of reducer callback
    useEffect(() => {
        if (container.containerType !== 'homestead_hearth' || !container.containerEntity || !connection) {
            setUpkeepCosts(null);
            return;
        }

        const hearth = container.containerEntity as SpacetimeDBHomesteadHearth;
        const hearthId = typeof container.containerId === 'bigint' ? Number(container.containerId) : container.containerId;

        // Early return if hearthId is null
        if (hearthId === null || hearthId === undefined) {
            setUpkeepCosts(null);
            return;
        }

        // Check for existing result first (may already be cached)
        const existingResult = connection.db?.hearthUpkeepQueryResult?.hearthId?.find(hearthId);
        console.log('[Upkeep] Checking for existing result:', { 
            hearthId, 
            hasExistingResult: !!existingResult,
            existingResult: existingResult ? {
                requiredWood: existingResult.requiredWood,
                requiredStone: existingResult.requiredStone,
                requiredMetal: existingResult.requiredMetal,
                availableWood: existingResult.availableWood,
                availableStone: existingResult.availableStone,
                availableMetal: existingResult.availableMetal,
            } : null
        });
        if (existingResult) {
            console.log('[Upkeep] Found existing result, setting state');
            setUpkeepCosts({
                requiredWood: existingResult.requiredWood,
                requiredStone: existingResult.requiredStone,
                requiredMetal: existingResult.requiredMetal,
                availableWood: existingResult.availableWood,
                availableStone: existingResult.availableStone,
                availableMetal: existingResult.availableMetal,
                estimatedDecayHours: (existingResult as any).estimatedDecayHours ?? null,
            });
        } else {
            // Show loading state if no cached result
            console.log('[Upkeep] No existing result found, showing loading state');
            setUpkeepCosts(null);
        }

        // Subscribe to table updates - use useCallback pattern to prevent recreating on every render
        const handleUpkeepUpdate = (ctx: any, result: HearthUpkeepQueryResult) => {
            console.log('[Upkeep] Table update received:', { 
                resultHearthId: result.hearthId, 
                expectedHearthId: hearthId, 
                match: result.hearthId === hearthId,
                data: {
                    requiredWood: result.requiredWood,
                    requiredStone: result.requiredStone,
                    requiredMetal: result.requiredMetal,
                    availableWood: result.availableWood,
                    availableStone: result.availableStone,
                    availableMetal: result.availableMetal,
                }
            });
            if (result.hearthId === hearthId) {
                console.log('[Upkeep] Setting upkeep costs state');
                setUpkeepCosts({
                    requiredWood: result.requiredWood,
                    requiredStone: result.requiredStone,
                    requiredMetal: result.requiredMetal,
                    availableWood: result.availableWood,
                    availableStone: result.availableStone,
                    availableMetal: result.availableMetal,
                    estimatedDecayHours: (result as any).estimatedDecayHours ?? null,
                });
            } else {
                console.log('[Upkeep] Hearth ID mismatch, ignoring update');
            }
        };

        // Register callbacks for table updates
        let subscriptionHandle: any = null;
        let interval: NodeJS.Timeout | null = null;
        
        if (connection.db?.hearthUpkeepQueryResult) {
            connection.db.hearthUpkeepQueryResult.onInsert(handleUpkeepUpdate);
            connection.db.hearthUpkeepQueryResult.onUpdate(handleUpkeepUpdate);
            
            // Subscribe to the table to receive updates (callbacks only fire for subscribed tables)
            try {
                subscriptionHandle = connection
                    .subscriptionBuilder()
                    .onError((err: any) => console.error('[Upkeep] Subscription error:', err))
                    .subscribe([`SELECT * FROM hearth_upkeep_query_result WHERE hearth_id = ${hearthId}`]);
                console.log('[Upkeep] Subscribed to upkeep query result table for hearth', hearthId);
            } catch (error) {
                console.error('[Upkeep] Failed to subscribe to upkeep query result table:', error);
            }
            
            // Call reducer to trigger update (reducer updates the table)
            // Add error handling via reducer callback
            const handleQueryError = (ctx: any, hearthIdParam: number) => {
                if (hearthIdParam === hearthId) {
                    // Check reducer event status
                    if (ctx.event?.status?.tag === 'Failed') {
                        const errorMsg = ctx.event.status.value || 'Failed to query upkeep costs';
                        console.error('[Upkeep] Failed to query upkeep costs for hearth', hearthIdParam, ':', errorMsg);
                        // Log the error but don't clear existing state - keep showing last known values
                    } else if (ctx.event?.status?.tag === 'Committed') {
                        console.log('[Upkeep] Successfully queried upkeep costs for hearth', hearthIdParam);
                        // Manually check the table after reducer commits (table update callback may not fire immediately)
                        setTimeout(() => {
                                const result = connection.db?.hearthUpkeepQueryResult?.hearthId?.find(hearthId);
                            if (result) {
                                console.log('[Upkeep] Manually reading table after reducer commit:', result);
                                setUpkeepCosts({
                                    requiredWood: result.requiredWood,
                                    requiredStone: result.requiredStone,
                                    requiredMetal: result.requiredMetal,
                                    availableWood: result.availableWood,
                                    availableStone: result.availableStone,
                                    availableMetal: result.availableMetal,
                                    estimatedDecayHours: (result as any).estimatedDecayHours ?? null,
                                });
                            } else {
                                console.warn('[Upkeep] Reducer committed but table result not found yet');
                            }
                        }, 100); // Small delay to allow table update to propagate
                    }
                }
            };
            
            if (connection.reducers && typeof connection.reducers.queryHearthUpkeepCosts === 'function') {
                // Register error callback
                connection.reducers.onQueryHearthUpkeepCosts(handleQueryError);
                
                // Call reducer to trigger update
                try {
                    connection.reducers.queryHearthUpkeepCosts(hearthId);
                } catch (error) {
                    console.error('[Upkeep] Error calling queryHearthUpkeepCosts:', error);
                }
            }
            
            // Refresh every 5 seconds by calling reducer again
            interval = setInterval(() => {
                if (connection.reducers && typeof connection.reducers.queryHearthUpkeepCosts === 'function' && hearthId !== null && hearthId !== undefined) {
                    try {
                        connection.reducers.queryHearthUpkeepCosts(hearthId);
                    } catch (error) {
                        console.error('[Upkeep] Error refreshing upkeep costs:', error);
                    }
                }
            }, 5000);
        }
        
        return () => {
            if (interval) {
                clearInterval(interval);
            }
            if (subscriptionHandle) {
                try {
                    subscriptionHandle.unsubscribe?.();
                    console.log('[Upkeep] Unsubscribed from upkeep query result table');
                } catch (error) {
                    console.error('[Upkeep] Error unsubscribing:', error);
                }
            }
            if (connection?.db?.hearthUpkeepQueryResult) {
                connection.db.hearthUpkeepQueryResult.removeOnInsert(handleUpkeepUpdate);
                connection.db.hearthUpkeepQueryResult.removeOnUpdate(handleUpkeepUpdate);
            }
            if (connection?.reducers && typeof connection.reducers.removeOnQueryHearthUpkeepCosts === 'function') {
                // Note: handleQueryError is defined inside the if block, so we can't remove it here
                // This is okay - the cleanup will happen when the component unmounts
            }
        };
    }, [container.containerType, container.containerEntity, container.containerId, connection]);

    // Special lantern toggle handler (light/extinguish instead of toggle)
    const handleLanternToggle = useCallback(() => {
        if (!connection?.reducers || container.containerId === null || !container.containerEntity) return;
        
        const lantern = container.containerEntity as SpacetimeDBLantern;
        const lanternIdNum = typeof container.containerId === 'bigint' ? Number(container.containerId) : container.containerId;
        
        try { 
            if (lantern.isBurning) {
                connection.reducers.extinguishLantern(lanternIdNum);
            } else {
                connection.reducers.lightLantern(lanternIdNum);
            }
        } catch (e: any) { 
            console.error("Error toggle lantern burn:", e); 
        }
    }, [connection, container.containerId, container.containerEntity]);

    // Check if heat source (campfire or fumarole) has attached broth pot
    // IMPORTANT: This hook must be before any early returns to follow React rules of hooks
    const attachedBrothPot = useMemo(() => {
        if (!container.containerType || !container.containerEntity) return null;
        if (container.containerType === 'campfire') {
            const campfire = container.containerEntity as SpacetimeDBCampfire;
            if (!campfire.attachedBrothPotId) return null;
            return brothPots.get(campfire.attachedBrothPotId.toString()) || null;
        } else if (container.containerType === 'fumarole') {
            // For fumaroles, find the broth pot by checking attachedToFumaroleId
            const fumarole = container.containerEntity as any; // Fumarole type
            if (!fumarole || !fumarole.id) {
                return null;
            }
            
            // Find broth pot attached to this fumarole
            for (const pot of brothPots.values()) {
                const potData = pot as any;
                
                // Compare as strings to handle bigint vs number mismatch
                const potFumaroleId = potData.attachedToFumaroleId ? potData.attachedToFumaroleId.toString() : null;
                const currentFumaroleId = fumarole.id.toString();
                
                if (potFumaroleId === currentFumaroleId && !potData.isDestroyed) {
                    return pot;
                }
            }
        }
        return null;
    }, [container.containerType, container.containerEntity, brothPots]);

    // Get broth pot items if attached (ingredient slots only)
    const brothPotItems = useMemo(() => {
        if (!attachedBrothPot) return null;
        return extractContainerItems(
            'broth_pot',
            attachedBrothPot,
            inventoryItems,
            itemDefinitions
        );
    }, [attachedBrothPot, inventoryItems, itemDefinitions]);

    // Get water container slot item if attached
    const waterContainerItem = useMemo(() => {
        if (!attachedBrothPot) return null;
        // TypeScript bindings need regeneration - using type assertion for now
        const pot = attachedBrothPot as any;
        if (!pot.waterContainerInstanceId) return null;
        const instanceIdStr = pot.waterContainerInstanceId.toString();
        const invItem = inventoryItems.get(instanceIdStr);
        if (!invItem) return null;
        const def = itemDefinitions.get(invItem.itemDefId.toString());
        if (!def) return null;
        return { instance: invItem, definition: def } as PopulatedItem;
    }, [attachedBrothPot, inventoryItems, itemDefinitions]);

    // Create broth pot callbacks for context menu (for ingredient slots)
    const brothPotCallbacks = useMemo(() => {
        if (!attachedBrothPot) return null;
        return createContainerCallbacks(
            'broth_pot',
            attachedBrothPot.id,
            connection,
            lastDragCompleteTime
        );
    }, [attachedBrothPot, connection, lastDragCompleteTime]);

    // ============================================================================
    // AI BREWING - Automatic Recipe Generation
    // ============================================================================
    // Track whether we're currently generating a recipe to prevent duplicate calls
    // Using ref for immediate synchronous check (state is async and causes race conditions)
    const [isGeneratingRecipe, setIsGeneratingRecipe] = useState(false);
    const [lastGeneratedRecipeName, setLastGeneratedRecipeName] = useState<string | null>(null);
    const isGeneratingRef = useRef(false);
    const lastGeneratedHashRef = useRef<string | null>(null);

    // Automatic AI recipe generation when broth pot has 3 ingredients
    useEffect(() => {
        // Skip if:
        // - No broth pot attached
        // - No connection
        // - Already generating a recipe (check ref for immediate sync check)
        // - Broth pot conditions not met for brewing
        if (!attachedBrothPot || !connection?.reducers || isGeneratingRef.current) {
            return;
        }

        // Check brewing conditions:
        // - Has 3 ingredients (all slots filled)
        // - Has sufficient water (>=250ml for brewing)
        // - Not seawater
        // - Not already cooking
        // - No output item (brewing not complete)
        const pot = attachedBrothPot as any;
        const hasThreeIngredients = 
            pot.ingredientDefId0 !== null && pot.ingredientDefId0 !== undefined &&
            pot.ingredientDefId1 !== null && pot.ingredientDefId1 !== undefined &&
            pot.ingredientDefId2 !== null && pot.ingredientDefId2 !== undefined;

        const canBrew = 
            hasThreeIngredients &&
            pot.waterLevelMl >= 250 &&
            !pot.isSeawater &&
            !pot.isCooking &&
            (pot.outputItemInstanceId === null || pot.outputItemInstanceId === undefined);

        if (!canBrew) {
            return;
        }

        // Get ingredient names from definitions
        const ingredientDefIds = [pot.ingredientDefId0, pot.ingredientDefId1, pot.ingredientDefId2];
        const ingredientNames: string[] = [];

        for (const defId of ingredientDefIds) {
            if (defId === null || defId === undefined) continue;
            const def = itemDefinitions.get(defId.toString());
            if (def) {
                ingredientNames.push(def.name);
            }
        }

        if (ingredientNames.length !== 3) {
            console.warn('[AI Brewing] Could not get all 3 ingredient names');
            return;
        }

        // Compute recipe hash to avoid regenerating the same recipe
        const recipeHash = computeRecipeHash(ingredientNames);
        const recipeHashStr = recipeHash.toString();

        // Skip if we already generated this exact recipe combination
        if (lastGeneratedHashRef.current === recipeHashStr) {
            return;
        }

        // IMMEDIATELY mark as generating to prevent race conditions
        isGeneratingRef.current = true;
        setIsGeneratingRecipe(true);
        
        // Start generating recipe
        console.log('[AI Brewing] ===== STARTING RECIPE GENERATION =====');
        console.log('[AI Brewing] Ingredients:', ingredientNames);
        console.log('[AI Brewing] Recipe hash:', recipeHashStr);

        // Async function to generate and cache the recipe
        const generateAndCacheRecipe = async () => {
            console.log('[AI Brewing] generateAndCacheRecipe() called');
            try {
                console.log('[AI Brewing] Calling generateFullBrewRecipe...');
                // Generate recipe via Gemini API (icon generation DISABLED for now - was hanging)
                const result = await generateFullBrewRecipe(
                    ingredientNames,
                    getIngredientRarities(ingredientNames),
                    false // TEMPORARILY DISABLED - icon generation was hanging
                );

                console.log('[AI Brewing] ===== RECIPE RESULT RECEIVED =====');
                console.log('[AI Brewing] Recipe name:', result.recipe.name);
                console.log('[AI Brewing] Cached:', result.cached);

                // Convert recipe to JSON for server
                const recipeJson = recipeToServerJson(result.recipe, ingredientNames);
                console.log('[AI Brewing] Recipe JSON to send:', recipeJson.substring(0, 200) + '...');

                // Cache the recipe on the server via reducer
                console.log('[AI Brewing] Caching recipe on server via createGeneratedBrew reducer...');
                try {
                    connection.reducers.createGeneratedBrew(recipeJson, result.icon_base64 ?? undefined);
                    console.log('[AI Brewing] createGeneratedBrew reducer called successfully');
                } catch (reducerError) {
                    console.error('[AI Brewing] createGeneratedBrew reducer call FAILED:', reducerError);
                }

                // Remember this hash and recipe name so we don't regenerate
                lastGeneratedHashRef.current = recipeHashStr;
                setLastGeneratedRecipeName(result.recipe.name);
                console.log('[AI Brewing] Recipe cached successfully! Server will start brewing shortly.');

            } catch (error) {
                console.error('[AI Brewing] Failed to generate recipe:', error);
                // Don't set lastGeneratedHashRef so we can retry on next render
            } finally {
                isGeneratingRef.current = false;
                setIsGeneratingRecipe(false);
            }
        };

        generateAndCacheRecipe();

    }, [attachedBrothPot, connection, itemDefinitions]);

    // Register reducer callback to track if createGeneratedBrew succeeds or fails
    useEffect(() => {
        if (!connection?.reducers) return;

        const handleReducerResult = (ctx: any, recipeJson: string, iconBase64: string | undefined) => {
            console.log('[AI Brewing] ===== REDUCER CALLBACK FIRED =====');
            console.log('[AI Brewing] Event status:', ctx.event?.status);
            console.log('[AI Brewing] Event message:', ctx.event?.message);
            
            if (ctx.event?.status === 'Committed') {
                console.log('[AI Brewing] ✅ createGeneratedBrew reducer COMMITTED successfully!');
            } else if (ctx.event?.status === 'Failed') {
                console.error('[AI Brewing] ❌ createGeneratedBrew reducer FAILED:', ctx.event?.message || ctx.event?.status);
            } else {
                console.log('[AI Brewing] ⚠️ createGeneratedBrew reducer status:', ctx.event?.status);
            }
        };

        connection.reducers.onCreateGeneratedBrew(handleReducerResult);

        return () => {
            if (connection?.reducers?.removeOnCreateGeneratedBrew) {
                connection.reducers.removeOnCreateGeneratedBrew(handleReducerResult);
            }
        };
    }, [connection]);

    // Check if we have a cached recipe ready for the current ingredients
    // Now checks BOTH local state AND server's brew_recipe_cache table
    const recipeReadyState = useMemo(() => {
        if (!attachedBrothPot || !itemDefinitions || !connection) return null;
        
        const pot = attachedBrothPot as any;
        const hasThreeIngredients = 
            pot.ingredientDefId0 !== null && pot.ingredientDefId0 !== undefined &&
            pot.ingredientDefId1 !== null && pot.ingredientDefId1 !== undefined &&
            pot.ingredientDefId2 !== null && pot.ingredientDefId2 !== undefined;
        
        if (!hasThreeIngredients) return null;
        
        // Get current ingredient names
        const ingredientDefIds = [pot.ingredientDefId0, pot.ingredientDefId1, pot.ingredientDefId2];
        const ingredientNames: string[] = [];
        for (const defId of ingredientDefIds) {
            if (defId === null || defId === undefined) continue;
            const def = itemDefinitions.get(defId.toString());
            if (def) ingredientNames.push(def.name);
        }
        if (ingredientNames.length !== 3) return null;
        
        // Calculate the hash for the current ingredients
        const currentHash = computeRecipeHash(ingredientNames).toString();
        
        // FIRST: Check local state (for recipes we generated this session)
        if (lastGeneratedHashRef.current === currentHash && lastGeneratedRecipeName) {
            return {
                recipeName: lastGeneratedRecipeName,
                isReady: true,
                source: 'local' as const
            };
        }
        
        // SECOND: Check server's brew_recipe_cache table for existing recipes
        // This handles recipes generated by other players or in previous sessions
        try {
            const currentHashBigInt = BigInt(currentHash);
            for (const cachedRecipe of connection.db.brewRecipeCache.iter()) {
                if (cachedRecipe.recipeHash === currentHashBigInt) {
                    // Get the output item name from the item definitions
                    const outputDef = itemDefinitions.get(cachedRecipe.outputItemDefId.toString());
                    const outputName = outputDef?.name || 'Unknown Brew';
                    return {
                        recipeName: outputName,
                        isReady: true,
                        source: 'server' as const
                    };
                }
            }
        } catch (e) {
            // Ignore errors when iterating cache (might be empty or unavailable)
        }
        
        return null;
    }, [attachedBrothPot, itemDefinitions, lastGeneratedRecipeName, connection]);

    // Check if campfire has heat (for showing "light the fire" message)
    const hasHeatSource = useMemo(() => {
        if (container.containerType === 'campfire') {
            const campfire = container.containerEntity as SpacetimeDBCampfire;
            return campfire.isBurning && !campfire.isDestroyed;
        } else if (container.containerType === 'fumarole') {
            // Fumaroles always have heat
            return true;
        }
        return false;
    }, [container.containerType, container.containerEntity]);

    // Create special context menu handler for water container slot
    const waterContainerContextMenuHandler = useCallback((event: React.MouseEvent, itemInfo: PopulatedItem, slotIndex: number) => {
        event.preventDefault();
        
        // Block context menu for 200ms after drag completion  
        const timeSinceLastDrag = Date.now() - lastDragCompleteTime.current;
        if (timeSinceLastDrag < 200) return;
        
        if (!connection?.reducers || !itemInfo || !attachedBrothPot) return;
        
        try {
            // Water container slot quick move doesn't take slot index
            (connection.reducers as any).quickMoveFromBrothPotWaterContainer(attachedBrothPot.id);
        } catch (e: any) {
            console.error(`[WaterContainer QuickMove]`, e);
        }
    }, [attachedBrothPot, connection, lastDragCompleteTime]);

    // Don't render anything if no container
    // IMPORTANT: This early return must be AFTER all hooks to follow React rules of hooks
    if (!container.containerType || !container.containerEntity) {
        return null;
    }

    const config = getContainerConfig(container.containerType, container.containerEntity);

    return (
        <div className={styles.externalInventorySection}>
            {/* Dynamic Title */}
            <h3 className={styles.sectionTitle}>{container.containerTitle}</h3>

            {/* Fumarole Helper Text - always show for new players */}
            {container.containerType === 'fumarole' && !attachedBrothPot && container.items.every(item => item === null) && (
                <div style={{
                    marginTop: '8px',
                    marginBottom: '12px',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(100, 100, 120, 0.15)',
                    border: '1px solid rgba(150, 150, 170, 0.3)',
                    borderRadius: '4px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: '#aab',
                    fontStyle: 'italic'
                }}>
                    🌋 Add items to <strong style={{ color: '#ff8c46' }}>incinerate</strong> them into charcoal
                </div>
            )}
            
            {/* Fumarole Incineration Indicator - pulsing animation (when items present) */}
            {container.containerType === 'fumarole' && container.items.some(item => item !== null && item.definition.name !== 'Charcoal') && (
                <div style={{
                    marginTop: '8px',
                    marginBottom: '12px',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(255, 107, 53, 0.15)',
                    border: '1px solid rgba(255, 140, 70, 0.5)',
                    borderRadius: '4px',
                    textAlign: 'center',
                    animation: 'fumarolePulse 2s ease-in-out infinite',
                    boxShadow: '0 0 12px rgba(255, 107, 53, 0.4)',
                }}>
                    <style>{`
                        @keyframes fumarolePulse {
                            0%, 100% {
                                opacity: 1;
                                box-shadow: 0 0 12px rgba(255, 107, 53, 0.4);
                            }
                            50% {
                                opacity: 0.7;
                                box-shadow: 0 0 20px rgba(255, 140, 70, 0.7);
                            }
                        }
                    `}</style>
                    <div style={{
                        fontSize: '13px',
                        color: '#ff8c46',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                    }}>
                        <span style={{ fontSize: '16px' }}>🔥</span>
                        <span>Incinerating for Charcoal</span>
                        <span style={{ fontSize: '16px' }}>🔥</span>
                    </div>
                </div>
            )}

            {/* Generic Container Slots - handles all slot rendering with progress overlays */}
            <ContainerSlots
                containerType={container.containerType}
                containerEntity={container.containerEntity}
                items={container.items}
                createSlotInfo={container.createSlotInfo}
                getSlotKey={container.getSlotKey}
                onItemDragStart={onItemDragStart}
                onItemDrop={handleItemDropWithTracking}
                onContextMenu={container.contextMenuHandler}
                onItemMouseEnter={
                    container.containerType === 'campfire' ? handleCampfireFuelMouseEnter : 
                    container.containerType === 'furnace' ? handleFurnaceFuelMouseEnter :
                    onExternalItemMouseEnter
                }
                onItemMouseLeave={onExternalItemMouseLeave}
                onItemMouseMove={onExternalItemMouseMove}
                style={container.containerType === 'rain_collector' ? { marginTop: '12px' } : undefined}
                disabledSlots={
                    (container.containerType === 'campfire' && attachedBrothPot) 
                        ? new Set([1, 2, 3, 4]) // Disable slots 1-4 when broth pot attached, keep slot 0 for adding fuel
                        : (container.containerType === 'fumarole' && attachedBrothPot)
                        ? new Set([0, 1, 2, 3, 4, 5]) // Disable all 6 fumarole slots when broth pot is attached (fumaroles don't need fuel)
                        : undefined
                }
                slotProgress={slotProgress}
                isHotLootActive={isHotLootActive}
                getSlotIndicator={getSlotIndicator}
                onHotLootSlotHover={onHotLootSlotHover}
                setHotLootCurrentHover={setHotLootCurrentHover}
            />

            {/* Generic Container Buttons - handles toggle/light/extinguish (shown before broth pot for campfires) */}
            {container.containerType === 'campfire' && (
            <ContainerButtons
                containerType={container.containerType}
                containerEntity={container.containerEntity}
                items={container.items}
                    onToggle={container.toggleHandler}
            >
                {/* Campfire weather warning */}
                    {isHeavyRaining && !container.isActive && (
                            <div style={{ 
                                marginTop: '8px', 
                                color: '#87CEEB', 
                                fontSize: '12px', 
                                textAlign: 'center',
                                fontStyle: 'italic'
                            }}>
                            🌧️ {getWeatherWarningMessage || ''}
                            </div>
                    )}
                </ContainerButtons>
            )}

            {/* Broth Pot Section - shown below campfire when attached */}
            {attachedBrothPot && brothPotItems && (
                <>
                    <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.2)', paddingTop: '16px' }}>
                        <h3 className={styles.sectionTitle} style={{ fontSize: '14px', marginBottom: '8px' }}>
                            Field Cauldron
                        </h3>
                        
                        {/* Heat Source Indicator */}
                        <div style={{
                            fontSize: '11px',
                            color: container.containerType === 'fumarole' ? '#ff6b35' : '#ffa500',
                            textAlign: 'center',
                            marginBottom: '12px',
                            fontStyle: 'italic',
                            opacity: 0.9
                        }}>
                            {container.containerType === 'fumarole' 
                                ? '🌋 Always-On Volcanic Heat (No Fuel Required)' 
                                : '🔥 Campfire Heat (Requires Fuel)'}
                        </div>
                        
                        {/* All 5 slots in one row: Water Container + 3 Ingredient slots + Arrow + Output slot */}
                        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '12px', alignItems: 'center', gap: '8px' }}>
                            <div style={{ 
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: '4px',
                                maxWidth: 'fit-content'
                            }}>
                                {/* Water Container Slot - Blue theme */}
                                <DroppableSlot
                                    slotInfo={{
                                        type: 'broth_pot_water_container',
                                        index: 0,
                                        parentId: attachedBrothPot.id
                                    }}
                                    onItemDrop={handleItemDropWithTracking}
                                    className={styles.slot}
                                    isDraggingOver={false}
                                    style={{
                                        border: '2px solid rgba(0, 150, 255, 0.6)',
                                        background: 'linear-gradient(135deg, rgba(0, 100, 200, 0.2), rgba(0, 150, 255, 0.15))',
                                        boxShadow: 'inset 0 0 8px rgba(0, 150, 255, 0.2)'
                                    }}
                                >
                                    {waterContainerItem && (
                                        <DraggableItem
                                            item={waterContainerItem}
                                            sourceSlot={{
                                                type: 'broth_pot_water_container',
                                                index: 0,
                                                parentId: attachedBrothPot.id
                                            }}
                                            onItemDragStart={onItemDragStart}
                                            onItemDrop={handleItemDropWithTracking}
                                            onContextMenu={(event) => waterContainerContextMenuHandler(event, waterContainerItem, 0)}
                                            onMouseEnter={(e) => onExternalItemMouseEnter(waterContainerItem, e)}
                                            onMouseLeave={onExternalItemMouseLeave}
                                            onMouseMove={onExternalItemMouseMove}
                                        />
                                    )}
                                    {/* Water level indicator */}
                                    {waterContainerItem && isWaterContainer(waterContainerItem.definition.name) && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                left: '4px',
                                                top: '4px',
                                                bottom: '4px',
                                                width: '3px',
                                                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                                borderRadius: '1px',
                                                zIndex: 4,
                                                pointerEvents: 'none',
                                            }}
                                        >
                                            {getWaterLevelPercentage(waterContainerItem.instance, waterContainerItem.definition.name) > 0 && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        bottom: '0px',
                                                        left: '0px',
                                                        right: '0px',
                                                        height: `${getWaterLevelPercentage(waterContainerItem.instance, waterContainerItem.definition.name) * 100}%`,
                                                        backgroundColor: isSaltWater(waterContainerItem.instance) 
                                                            ? 'rgba(135, 206, 250, 0.8)' // Lighter blue for salt water
                                                            : 'rgba(0, 150, 255, 0.8)', // Normal blue for fresh water
                                                        borderRadius: '1px',
                                                        transition: 'height 0.3s ease-in-out',
                                                    }}
                                                />
                                            )}
                                        </div>
                                    )}
                                    {/* Water icon in top left */}
                                    <div style={{
                                        position: 'absolute',
                                        top: '4px',
                                        left: '4px',
                                        fontSize: '14px',
                                        zIndex: 5,
                                        pointerEvents: 'none',
                                        textShadow: '0 0 2px rgba(0, 0, 0, 0.8)'
                                    }}>
                                        💧
                                    </div>
                                </DroppableSlot>

                                {/* Ingredient Slots */}
                                {Array.from({ length: 3 }).map((_, index) => {
                                    const itemInSlot = brothPotItems[index] || null;
                                    const slotInfo = {
                                        type: getContainerConfig('broth_pot').slotType as any,
                                        index,
                                        parentId: attachedBrothPot.id
                                    };
                                    
                                    // Visual feedback for empty slots - subtle pulsing animation
                                    const isEmpty = !itemInSlot;
                                    const filledIngredientCount = brothPotItems.filter(item => item !== null).length;
                                    
                                    return (
                                        <DroppableSlot
                                            key={`broth_pot_${attachedBrothPot.id}_${index}`}
                                            slotInfo={slotInfo}
                                            onItemDrop={handleItemDropWithTracking}
                                            className={styles.slot}
                                            isDraggingOver={false}
                                            style={{
                                                border: isEmpty 
                                                    ? '2px dashed rgba(100, 200, 100, 0.4)' // Dashed border for empty slots
                                                    : '2px solid rgba(100, 200, 100, 0.7)', // Solid border for filled slots
                                                background: isEmpty
                                                    ? 'linear-gradient(135deg, rgba(50, 150, 50, 0.08), rgba(100, 200, 100, 0.05))' // Dimmer for empty
                                                    : 'linear-gradient(135deg, rgba(50, 150, 50, 0.15), rgba(100, 200, 100, 0.1))', // Normal for filled
                                                boxShadow: isEmpty
                                                    ? 'inset 0 0 8px rgba(100, 200, 100, 0.1), 0 0 4px rgba(100, 200, 100, 0.2)' // Subtle glow for empty
                                                    : 'inset 0 0 8px rgba(100, 200, 100, 0.15)',
                                                animation: isEmpty && filledIngredientCount < 3
                                                    ? 'ingredientSlotPulse 2s ease-in-out infinite' // Pulse empty slots when not all filled
                                                    : 'none',
                                            }}
                                        >
                                            {itemInSlot && (
                                                <DraggableItem
                                                    item={itemInSlot}
                                                    sourceSlot={slotInfo}
                                                    onItemDragStart={onItemDragStart}
                                                    onItemDrop={handleItemDropWithTracking}
                                                    onContextMenu={(event) => brothPotCallbacks?.contextMenuHandler(event, itemInSlot, index)}
                                                    onMouseEnter={(e) => onExternalItemMouseEnter(itemInSlot, e)}
                                                    onMouseLeave={onExternalItemMouseLeave}
                                                    onMouseMove={onExternalItemMouseMove}
                                                />
                                            )}
                                            {/* Generic ingredient icon in top left - show number for empty slots */}
                                            <div style={{
                                                position: 'absolute',
                                                top: '4px',
                                                left: '4px',
                                                fontSize: isEmpty ? '12px' : '14px',
                                                zIndex: 5,
                                                pointerEvents: 'none',
                                                textShadow: '0 0 2px rgba(0, 0, 0, 0.8)',
                                                color: isEmpty ? 'rgba(100, 200, 100, 0.6)' : 'inherit',
                                                fontWeight: isEmpty ? 'bold' : 'normal',
                                            }}>
                                                {isEmpty ? `${index + 1}` : '⚪'}
                                            </div>
                                        </DroppableSlot>
                                    );
                                })}
                            </div>
                            
                            {/* Arrow indicator between ingredients and output - changes color based on readiness */}
                            {(() => {
                                const filledIngredientCount = brothPotItems.filter(item => item !== null).length;
                                const hasEnoughWater = attachedBrothPot.waterLevelMl >= 250;
                                const isReady = filledIngredientCount >= 3 && hasEnoughWater && !attachedBrothPot.isSeawater;
                                
                                return (
                                    <div style={{
                                        fontSize: '20px',
                                        color: isReady ? '#00ff88' : '#ffcc44', // Green when ready, yellow when not
                                        textShadow: isReady 
                                            ? '0 0 8px rgba(0, 255, 136, 0.8)' 
                                            : '0 0 8px rgba(255, 200, 0, 0.6)',
                                        userSelect: 'none',
                                        pointerEvents: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        opacity: isReady ? 1 : 0.5, // Dimmed when not ready
                                        transition: 'all 0.3s ease',
                                    }}>
                                        <FontAwesomeIcon icon={faArrowRight} />
                                    </div>
                                );
                            })()}
                            
                            {/* Output Slot container */}
                            <div>
                                {/* Output Slot (4th slot) - for brewed result */}
                                {(() => {
                                    const outputItem = attachedBrothPot.outputItemInstanceId 
                                        ? (() => {
                                            const instanceIdStr = attachedBrothPot.outputItemInstanceId!.toString();
                                            const invItem = inventoryItems.get(instanceIdStr);
                                            if (!invItem) return null;
                                            const def = itemDefinitions.get(invItem.itemDefId.toString());
                                            if (!def) return null;
                                            return { instance: invItem, definition: def } as PopulatedItem;
                                        })()
                                        : null;
                                    
                                    const outputSlotInfo = {
                                        type: 'broth_pot_output' as any, // Special slot type for output slot
                                        index: 3, // 4th slot (0-indexed)
                                        parentId: attachedBrothPot.id
                                    };
                                    
                                    return (
                                        <DroppableSlot
                                            key={`broth_pot_${attachedBrothPot.id}_output`}
                                            slotInfo={outputSlotInfo}
                                            onItemDrop={handleItemDropWithTracking}
                                            className={styles.slot}
                                            isDraggingOver={false}
                                            style={{
                                                border: '2px solid rgba(255, 200, 0, 0.7)',
                                                background: 'linear-gradient(135deg, rgba(200, 150, 0, 0.2), rgba(255, 200, 0, 0.15))',
                                                boxShadow: 'inset 0 0 8px rgba(255, 200, 0, 0.25)'
                                            }}
                                        >
                                            {outputItem && (
                                                <DraggableItem
                                                    item={outputItem}
                                                    sourceSlot={outputSlotInfo}
                                                    onItemDragStart={onItemDragStart}
                                                    onItemDrop={handleItemDropWithTracking}
                                                    onContextMenu={(event) => {
                                                        event.preventDefault();
                                                        // Block context menu for 200ms after drag completion  
                                                        const timeSinceLastDrag = Date.now() - lastDragCompleteTime.current;
                                                        if (timeSinceLastDrag < 200) return;
                                                        
                                                        if (!connection?.reducers || !outputItem || !attachedBrothPot) return;
                                                        
                                                        try {
                                                            // Output slot quick move doesn't take slot index
                                                            (connection.reducers as any).quickMoveFromBrothPotOutput(attachedBrothPot.id);
                                                        } catch (e: any) {
                                                            console.error(`[OutputSlot QuickMove]`, e);
                                                        }
                                                    }}
                                                    onMouseEnter={(e) => onExternalItemMouseEnter(outputItem, e)}
                                                    onMouseLeave={onExternalItemMouseLeave}
                                                    onMouseMove={onExternalItemMouseMove}
                                                />
                                            )}
                                            {/* Soup icon in top left for output slot when empty */}
                                            {!outputItem && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '4px',
                                                    left: '4px',
                                                    fontSize: '14px',
                                                    zIndex: 5,
                                                    pointerEvents: 'none',
                                                    textShadow: '0 0 2px rgba(0, 0, 0, 0.8)'
                                                }}>
                                                    🍲
                                                </div>
                                            )}
                                        </DroppableSlot>
                                    );
                                })()}
                            </div>
                        </div>
                        
                        {/* Visual Readiness Indicator - shows ingredient and water status - SUBDUED */}
                        {(() => {
                            const filledIngredientCount = brothPotItems.filter(item => item !== null).length;
                            const hasEnoughWater = attachedBrothPot.waterLevelMl >= 250;
                            const isReady = filledIngredientCount >= 3 && hasEnoughWater && !attachedBrothPot.isSeawater;
                            
                            return (
                                <div style={{
                                    marginTop: '4px',
                                    marginBottom: '4px',
                                    padding: '4px 8px',
                                    background: isReady 
                                        ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.08), rgba(0, 200, 100, 0.05))'
                                        : 'linear-gradient(135deg, rgba(255, 200, 0, 0.08), rgba(255, 150, 0, 0.05))',
                                    border: isReady
                                        ? '1px solid rgba(0, 255, 136, 0.2)'
                                        : '1px solid rgba(255, 200, 0, 0.2)',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: '10px',
                                    fontSize: '10px',
                                    color: isReady ? 'rgba(0, 255, 136, 0.7)' : 'rgba(255, 200, 0, 0.7)',
                                    fontWeight: 'normal',
                                    opacity: 0.7,
                                }}>
                                    {/* Ingredient count indicator */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <span style={{ fontSize: '9px' }}>⚪</span>
                                        <span>{filledIngredientCount}/3</span>
                                    </div>
                                    {/* Water indicator */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <span style={{ fontSize: '9px' }}>{attachedBrothPot.isSeawater ? '🌊' : '💧'}</span>
                                        <span>{hasEnoughWater ? '✓' : `${Math.round(attachedBrothPot.waterLevelMl)}/250ml`}</span>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Water level display with visual bar - PROMINENT with more spacing */}
                        <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                            <div style={{ 
                                fontSize: '14px', 
                                color: '#87CEEB', 
                                marginBottom: '10px',
                                textAlign: 'center',
                                fontWeight: 'bold',
                                textShadow: '0 0 4px rgba(135, 206, 250, 0.6)',
                            }}>
                                {attachedBrothPot.isSeawater ? '🌊' : '💧'} Water: {attachedBrothPot.waterLevelMl}ml / 5000ml
                            </div>
                            
                                {/* Visual water level bar - LARGER and more prominent */}
                                <div style={{
                                    width: '100%',
                                    height: '14px', // Increased from 8px to 14px
                                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                    borderRadius: '7px',
                                    overflow: 'visible', // Changed to visible to show threshold line
                                    border: attachedBrothPot.isSeawater 
                                        ? '2px solid rgba(135, 206, 250, 0.7)' // Lighter cyan border for salt water - thicker
                                        : '2px solid rgba(0, 150, 255, 0.7)', // Blue border for fresh water - thicker
                                    position: 'relative',
                                    boxShadow: '0 0 8px rgba(0, 150, 255, 0.3), inset 0 0 4px rgba(0, 150, 255, 0.2)',
                                }}>
                                    {/* Minimum water threshold line at 250ml (first tick) - BRIGHT RED/GOLD - MORE PROMINENT */}
                                    <div style={{
                                        position: 'absolute',
                                        left: `${(250 / 5000) * 100}%`,
                                        top: '-3px',
                                        bottom: '-3px',
                                        width: '4px', // Increased from 3px to 4px
                                        backgroundColor: attachedBrothPot.waterLevelMl >= 250 
                                            ? 'rgba(0, 255, 136, 1)' // Green when threshold met - fully opaque
                                            : 'rgba(255, 100, 50, 1)', // Red when threshold not met - fully opaque
                                        borderRadius: '2px',
                                        zIndex: 10,
                                        pointerEvents: 'none',
                                        boxShadow: attachedBrothPot.waterLevelMl >= 250
                                            ? '0 0 8px rgba(0, 255, 136, 1)' // Green glow when met - brighter
                                            : '0 0 8px rgba(255, 100, 50, 1)', // Red glow when not met - brighter
                                        animation: attachedBrothPot.waterLevelMl < 250 
                                            ? 'thresholdPulse 1.5s ease-in-out infinite' 
                                            : 'none',
                                    }} />
                                    {/* Water fill - MORE PROMINENT */}
                                    <div style={{
                                        width: `${(attachedBrothPot.waterLevelMl / 5000) * 100}%`,
                                        height: '100%',
                                        background: attachedBrothPot.waterLevelMl > 0 
                                            ? (attachedBrothPot.isSeawater 
                                                ? 'linear-gradient(90deg, #87ceeb 0%, #a0d4f0 50%, #b8dce8 100%)' // Light cyan gradient for salt water
                                                : 'linear-gradient(90deg, #0066cc 0%, #0080ff 50%, #0099ff 100%)') // Deep blue gradient for fresh water
                                            : 'transparent',
                                        transition: 'width 0.3s ease',
                                        borderRadius: '5px',
                                        boxShadow: attachedBrothPot.waterLevelMl > 0 
                                            ? (attachedBrothPot.isSeawater 
                                                ? '0 0 10px rgba(135, 206, 250, 0.8), inset 0 0 4px rgba(135, 206, 250, 0.4)' // Cyan glow for salt water - brighter
                                                : '0 0 10px rgba(0, 150, 255, 0.8), inset 0 0 4px rgba(0, 150, 255, 0.4)') // Blue glow for fresh water - brighter
                                            : 'none',
                                    }} />
                                    {/* Yellow tick marks every 250ml (20 ticks for 5000ml) - ADJUSTED FOR LARGER BAR */}
                                    {Array.from({ length: 19 }, (_, i) => {
                                        const tickPosition = ((i + 1) * 250 / 5000) * 100; // Position as percentage
                                        const isMajorTick = (i + 1) % 4 === 0; // Every 1000ml (4 x 250ml)
                                        const isFirstTick = i === 0; // First tick is the minimum threshold
                                        return (
                                            <div
                                                key={i}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${tickPosition}%`,
                                                    top: 0,
                                                    width: isMajorTick ? '2px' : '1px',
                                                    height: '100%',
                                                    backgroundColor: isFirstTick
                                                        ? 'rgba(255, 200, 0, 1)' // Bright gold for first tick (minimum threshold)
                                                        : isMajorTick 
                                                            ? 'rgba(255, 215, 0, 0.9)' // Bright gold for major ticks (1000ml)
                                                            : 'rgba(255, 215, 0, 0.5)', // Dimmer gold for minor ticks (250ml)
                                                    pointerEvents: 'none',
                                                    zIndex: isFirstTick ? 5 : 1, // First tick above water fill
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                        </div>

                        {/* SIMPLE Brewing Status - shows IMMEDIATELY when conditions are met */}
                        {/* This doesn't depend on AI state - just broth pot conditions */}
                        {(() => {
                            // Check conditions for showing "Preparing Brew" message
                            const has3Ingredients = 
                                attachedBrothPot.ingredientDefId0 != null &&
                                attachedBrothPot.ingredientDefId1 != null &&
                                attachedBrothPot.ingredientDefId2 != null;
                            const hasEnoughWater = attachedBrothPot.waterLevelMl >= 250;
                            const notSeawater = !attachedBrothPot.isSeawater;
                            const notCooking = !attachedBrothPot.isCooking;
                            const noOutput = attachedBrothPot.outputItemInstanceId == null;
                            
                            const shouldShowPreparing = has3Ingredients && hasEnoughWater && notSeawater && notCooking && noOutput && hasHeatSource;
                            
                            // Debug log to help troubleshoot
                            // if (has3Ingredients && hasEnoughWater && notSeawater) {
                            //     console.log('[BrothPot Status] Conditions:', {
                            //         has3Ingredients,
                            //         hasEnoughWater,
                            //         notSeawater,
                            //         notCooking,
                            //         noOutput,
                            //         hasHeatSource,
                            //         shouldShowPreparing,
                            //         outputItemInstanceId: attachedBrothPot.outputItemInstanceId,
                            //         isCooking: attachedBrothPot.isCooking
                            //     });
                            // }
                            
                            if (!shouldShowPreparing) return null;
                            
                            return (
                                <div style={{
                                    marginTop: '8px',
                                    marginBottom: '12px',
                                    padding: '8px 12px',
                                    backgroundColor: 'rgba(255, 180, 50, 0.2)',
                                    border: '1px solid rgba(255, 180, 50, 0.6)',
                                    borderRadius: '4px',
                                    textAlign: 'center',
                                    animation: 'preparingPulse 1.2s ease-in-out infinite',
                                    boxShadow: '0 0 15px rgba(255, 180, 50, 0.5)',
                                }}>
                                    <style>{`
                                        @keyframes preparingPulse {
                                            0%, 100% {
                                                opacity: 1;
                                                box-shadow: 0 0 15px rgba(255, 180, 50, 0.5);
                                            }
                                            50% {
                                                opacity: 0.85;
                                                box-shadow: 0 0 25px rgba(255, 180, 50, 0.8);
                                            }
                                        }
                                    `}</style>
                                    <div style={{
                                        fontSize: '13px',
                                        color: '#ffcc44',
                                        fontWeight: 'bold',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                    }}>
                                        <span style={{ fontSize: '16px' }}>🍲</span>
                                        <span>{isGeneratingRecipe ? 'Generating Recipe...' : 'Preparing Brew...'}</span>
                                        <span style={{ fontSize: '16px' }}>🍲</span>
                                    </div>
                                    <div style={{
                                        marginTop: '6px',
                                        fontSize: '11px',
                                        color: '#cc9944',
                                        fontStyle: 'italic',
                                    }}>
                                        {isGeneratingRecipe 
                                            ? 'Consulting the elders...' 
                                            : 'Mixing ingredients... brewing will start soon!'}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* No Heat Source Warning - shown when ready to brew but fire not lit */}
                        {!attachedBrothPot.isCooking && 
                         !attachedBrothPot.isSeawater &&
                         attachedBrothPot.waterLevelMl >= 250 &&
                         attachedBrothPot.outputItemInstanceId == null &&
                         !hasHeatSource &&
                         attachedBrothPot.ingredientDefId0 != null &&
                         attachedBrothPot.ingredientDefId1 != null &&
                         attachedBrothPot.ingredientDefId2 != null && (
                            <div style={{
                                marginTop: '8px',
                                marginBottom: '12px',
                                padding: '8px 12px',
                                backgroundColor: 'rgba(255, 100, 50, 0.15)',
                                border: '1px solid rgba(255, 100, 50, 0.5)',
                                borderRadius: '4px',
                                textAlign: 'center',
                                animation: 'needsFirePulse 1.5s ease-in-out infinite',
                                boxShadow: '0 0 12px rgba(255, 100, 50, 0.4)',
                            }}>
                                <style>{`
                                    @keyframes needsFirePulse {
                                        0%, 100% {
                                            opacity: 1;
                                            box-shadow: 0 0 12px rgba(255, 100, 50, 0.4);
                                        }
                                        50% {
                                            opacity: 0.8;
                                            box-shadow: 0 0 20px rgba(255, 100, 50, 0.7);
                                        }
                                    }
                                `}</style>
                                <div style={{
                                    fontSize: '13px',
                                    color: '#ff8844',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                }}>
                                    <span style={{ fontSize: '16px' }}>🔥</span>
                                    <span>Ready to Brew!</span>
                                    <span style={{ fontSize: '16px' }}>🔥</span>
                                </div>
                                <div style={{
                                    marginTop: '6px',
                                    fontSize: '11px',
                                    color: '#cc6633',
                                    fontStyle: 'italic',
                                }}>
                                    Light the campfire to start brewing!
                                </div>
                            </div>
                        )}

                        {/* Currently Brewing Indicator - pulsing animation */}
                        {attachedBrothPot.isCooking && (
                            <div style={{
                                marginTop: '8px',
                                marginBottom: '12px',
                                padding: '8px 12px',
                                backgroundColor: 'rgba(255, 150, 0, 0.15)',
                                border: '1px solid rgba(255, 200, 0, 0.5)',
                                borderRadius: '4px',
                                textAlign: 'center',
                                animation: 'pulse 2s ease-in-out infinite',
                                boxShadow: '0 0 12px rgba(255, 200, 0, 0.4)',
                            }}>
                                <style>{`
                                    @keyframes pulse {
                                        0%, 100% {
                                            opacity: 1;
                                            box-shadow: 0 0 12px rgba(255, 200, 0, 0.4);
                                        }
                                        50% {
                                            opacity: 0.7;
                                            box-shadow: 0 0 20px rgba(255, 200, 0, 0.7);
                                        }
                                    }
                                `}</style>
                                <div style={{
                                    fontSize: '13px',
                                    color: '#ffcc44',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                }}>
                                    <span style={{ fontSize: '16px' }}>🍲</span>
                                    <span>Currently Brewing {attachedBrothPot.currentRecipeName || 'Unknown Brew'}</span>
                                    <span style={{ fontSize: '16px' }}>🍲</span>
                                </div>
                                {/* Brewing Time Remaining */}
                                {attachedBrothPot.requiredCookingTimeSecs > 0 && (
                                    <div style={{
                                        marginTop: '8px',
                                        fontSize: '12px',
                                        color: '#87CEEB',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                    }}>
                                        <span>⏱️ Time Remaining:</span>
                                        <span style={{ fontWeight: 'bold', color: '#ffcc44' }}>
                                            {(() => {
                                                const remaining = Math.max(0, attachedBrothPot.requiredCookingTimeSecs - attachedBrothPot.cookingProgressSecs);
                                                const minutes = Math.floor(remaining / 60);
                                                const seconds = Math.floor(remaining % 60);
                                                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                                            })()}
                                        </span>
                                        {/* Progress bar */}
                                        <div style={{
                                            width: '60px',
                                            height: '6px',
                                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                            borderRadius: '3px',
                                            overflow: 'hidden',
                                            border: '1px solid rgba(255, 200, 0, 0.3)',
                                        }}>
                                            <div style={{
                                                width: `${Math.min(100, (attachedBrothPot.cookingProgressSecs / attachedBrothPot.requiredCookingTimeSecs) * 100)}%`,
                                                height: '100%',
                                                background: 'linear-gradient(90deg, #ffcc44 0%, #ff8800 100%)',
                                                transition: 'width 0.5s ease',
                                                boxShadow: '0 0 4px rgba(255, 200, 0, 0.6)',
                                            }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Seawater Warning - shown when pot has seawater and ingredients */}
                        {!attachedBrothPot.isCooking && 
                         attachedBrothPot.isSeawater && 
                         attachedBrothPot.waterLevelMl >= 250 &&
                         (brothPotItems.some(item => item !== null)) && (
                            <div style={{
                                marginTop: '8px',
                                marginBottom: '12px',
                                padding: '8px 12px',
                                backgroundColor: 'rgba(135, 206, 250, 0.15)',
                                border: '1px solid rgba(135, 206, 250, 0.5)',
                                borderRadius: '4px',
                                textAlign: 'center',
                            }}>
                                <div style={{
                                    fontSize: '12px',
                                    color: '#87CEEB',
                                    fontStyle: 'italic',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                }}>
                                    <span style={{ fontSize: '14px' }}>🌊</span>
                                    <span>Cannot brew with salt water - Desalinate first!</span>
                                    <span style={{ fontSize: '14px' }}>🌊</span>
                                </div>
                            </div>
                        )}

                    {/* Bidirectional water transfer buttons */}
                    {/* OUT = Orange/Amber (emptying) */}
                    <button
                        onClick={() => {
                            if (!connection?.reducers) return;
                            try {
                                (connection.reducers as any).transferWaterFromPotToContainer(
                                    attachedBrothPot.id
                                );
                            } catch (e: any) {
                                console.error("Error transferring water from pot to container:", e);
                            }
                        }}
                        disabled={!waterContainerItem || attachedBrothPot.waterLevelMl <= 0}
                        className={styles.interactionButton}
                        style={{ 
                            width: '100%', 
                            marginBottom: '8px', 
                            textShadow: 'none', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '8px',
                            background: 'linear-gradient(135deg, rgba(255, 140, 0, 0.3), rgba(255, 100, 0, 0.2))',
                            border: '2px solid rgba(255, 140, 0, 0.6)',
                            color: '#ffaa44',
                            boxShadow: '0 0 8px rgba(255, 140, 0, 0.3)',
                        }}
                    >
                        <FontAwesomeIcon icon={faArrowUp} /> Transfer Water OUT OF Field Cauldron
                    </button>

                    {/* IN = Blue/Cyan (filling) */}
                    <button
                        onClick={() => {
                            if (!connection?.reducers) return;
                            try {
                                (connection.reducers as any).transferWaterFromContainerToPot(
                                    attachedBrothPot.id
                                );
                            } catch (e: any) {
                                console.error("Error transferring water from container to pot:", e);
                            }
                        }}
                        disabled={!waterContainerItem || attachedBrothPot.waterLevelMl >= 5000}
                        className={styles.interactionButton}
                        style={{ 
                            width: '100%', 
                            marginBottom: '12px', 
                            textShadow: 'none', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '8px',
                            background: 'linear-gradient(135deg, rgba(0, 150, 255, 0.3), rgba(0, 100, 200, 0.2))',
                            border: '2px solid rgba(0, 150, 255, 0.6)',
                            color: '#66ccff',
                            boxShadow: '0 0 8px rgba(0, 150, 255, 0.3)',
                        }}
                    >
                        <FontAwesomeIcon icon={faArrowDown} /> Transfer Water INTO Field Cauldron
                    </button>

                        {/* Broth pot info and actions */}
                        <div style={{ marginTop: '12px' }}>


                            {/* Pickup button - always show, water will spill if present */}
                            <button
                                onClick={() => {
                                    if (!connection?.reducers) return;
                                    
                                    // Play spill sound immediately if there's water (client-side instant feedback)
                                    // Note: Server will also emit sound, but this provides instant feedback
                                    const hadWater = attachedBrothPot.waterLevelMl > 0;
                                    if (hadWater) {
                                        playImmediateSound('filling_container', 1.2); // Use filling_container sound for spill
                                    }
                                    
                                    try {
                                        connection.reducers.pickupBrothPot(attachedBrothPot.id);
                                    } catch (e: any) {
                                        console.error("Error picking up broth pot:", e);
                                    }
                                }}
                                className={`${styles.interactionButton} ${styles.extinguishButton}`}
                                style={{ width: '100%', marginTop: '8px', textShadow: 'none' }}
                                title={attachedBrothPot.waterLevelMl > 0 
                                    ? `⚠️ WARNING: Picking up will spill ${attachedBrothPot.waterLevelMl}ml of water! (No confirmation for quick PvP escapes)` 
                                    : "Pick up the Field Cauldron and return it to your inventory"}
                            >
                                Pick Up Broth Pot {attachedBrothPot.waterLevelMl > 0 ? '(Will Spill Water!)' : ''}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Generic Container Buttons - handles toggle/light/extinguish (for non-campfire containers) */}
            {container.containerType !== 'campfire' && (
                <ContainerButtons
                    containerType={container.containerType}
                    containerEntity={container.containerEntity}
                    items={container.items}
                    onToggle={container.containerType === 'lantern' ? handleLanternToggle : container.toggleHandler}
                >
                    {/* Special case buttons for specific containers */}

                {/* Stash visibility button */}
                {container.containerType === 'stash' && canOperateStashButton && (  
                         <button
                            onClick={handleToggleStashVisibility}
                            className={`${styles.interactionButton} ${
                            (container.containerEntity as SpacetimeDBStash).isHidden
                                ? styles.lightFireButton
                                : styles.extinguishButton
                        }`}
                    >
                        {(container.containerEntity as SpacetimeDBStash).isHidden ? "Surface Stash" : "Hide Stash"}
                        </button>
                    )}

                {/* Stash hidden message */}
                {container.containerType === 'stash' && (container.containerEntity as SpacetimeDBStash).isHidden && !canOperateStashButton && (
                        <p className={styles.infoText}>This stash is hidden. You might be able to surface it if you are on top of it.</p>
                )}

                {/* Rain collector fill button and info */}
                {container.containerType === 'rain_collector' && (
                    <>
                        {/* Water level display with visual bar */}
                        <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                            <div style={{ 
                                fontSize: '12px', 
                                color: '#87CEEB', 
                                marginBottom: '6px',
                                textAlign: 'center'
                            }}>
                                {((container.containerEntity as any) as SpacetimeDBRainCollector & { isSaltWater?: boolean }).isSaltWater ? '🌊' : '💧'} Water: {Math.round((container.containerEntity as SpacetimeDBRainCollector).totalWaterCollected * 1000)}ml / 40000ml
                            </div>
                            
                            {/* Visual water level bar */}
                            <div style={{
                                width: '100%',
                                height: '8px',
                                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                borderRadius: '4px',
                                overflow: 'hidden',
                                border: ((container.containerEntity as any) as SpacetimeDBRainCollector & { isSaltWater?: boolean }).isSaltWater
                                    ? '1px solid rgba(135, 206, 250, 0.5)' // Lighter cyan border for salt water
                                    : '1px solid rgba(0, 150, 255, 0.5)', // Blue border for fresh water
                            }}>
                                <div style={{
                                    width: `${((container.containerEntity as SpacetimeDBRainCollector).totalWaterCollected / 40.0) * 100}%`,
                                    height: '100%',
                                    background: (container.containerEntity as SpacetimeDBRainCollector).totalWaterCollected > 0 
                                        ? (((container.containerEntity as any) as SpacetimeDBRainCollector & { isSaltWater?: boolean }).isSaltWater
                                            ? 'linear-gradient(90deg, #87ceeb 0%, #a0d4f0 50%, #b8dce8 100%)' // Light cyan gradient for salt water
                                            : 'linear-gradient(90deg, #0066cc 0%, #0080ff 50%, #0099ff 100%)') // Deep blue gradient for fresh water
                                        : 'transparent',
                                    transition: 'width 0.3s ease',
                                    boxShadow: (container.containerEntity as SpacetimeDBRainCollector).totalWaterCollected > 0 
                                        ? (((container.containerEntity as any) as SpacetimeDBRainCollector & { isSaltWater?: boolean }).isSaltWater
                                            ? '0 0 8px rgba(135, 206, 250, 0.6)' // Cyan glow for salt water
                                            : '0 0 8px rgba(0, 150, 255, 0.6)') // Blue glow for fresh water
                                        : 'none',
                                }} />
                            </div>
                        </div>

                        {/* Bidirectional water transfer buttons */}
                        {/* OUT = Orange/Amber (emptying) */}
                        <button
                            onClick={handleFillWaterContainer}
                            disabled={!container.items[0] || 
                                     !['Reed Water Bottle', 'Plastic Water Jug'].includes(container.items[0]?.definition.name || '') || 
                                     (container.containerEntity as SpacetimeDBRainCollector).totalWaterCollected <= 0}
                            className={styles.interactionButton}
                            style={{ 
                                width: '100%', 
                                marginBottom: '8px', 
                                textShadow: 'none', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '8px',
                                background: 'linear-gradient(135deg, rgba(255, 140, 0, 0.3), rgba(255, 100, 0, 0.2))',
                                border: '2px solid rgba(255, 140, 0, 0.6)',
                                color: '#ffaa44',
                                boxShadow: '0 0 8px rgba(255, 140, 0, 0.3)',
                            }}
                        >
                            <FontAwesomeIcon icon={faArrowUp} /> Transfer Water OUT OF Rain Collector
                        </button>

                        {/* IN = Blue/Cyan (filling) */}
                        <button
                            onClick={() => {
                                if (!connection?.reducers || container.containerId === null) return;
                                const rainCollectorIdNum = typeof container.containerId === 'bigint' ? Number(container.containerId) : container.containerId;
                                try {
                                    (connection.reducers as any).transferWaterFromContainerToCollector(rainCollectorIdNum);
                                } catch (e: any) {
                                    console.error("Error transferring water from container to collector:", e);
                                }
                            }}
                            disabled={!container.items[0] || 
                                     !['Reed Water Bottle', 'Plastic Water Jug'].includes(container.items[0]?.definition.name || '') || 
                                     (container.containerEntity as SpacetimeDBRainCollector).totalWaterCollected >= 40.0}
                            className={styles.interactionButton}
                            style={{ 
                                width: '100%', 
                                marginBottom: '8px', 
                                textShadow: 'none', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '8px',
                                background: 'linear-gradient(135deg, rgba(0, 150, 255, 0.3), rgba(0, 100, 200, 0.2))',
                                border: '2px solid rgba(0, 150, 255, 0.6)',
                                color: '#66ccff',
                                boxShadow: '0 0 8px rgba(0, 150, 255, 0.3)',
                            }}
                        >
                            <FontAwesomeIcon icon={faArrowDown} /> Transfer Water INTO Rain Collector
                        </button>

                        {/* Empty Reservoir Button - for clearing contaminated water */}
                        <button
                            onClick={() => {
                                if (!connection?.reducers || container.containerId === null) return;
                                const rainCollectorIdNum = typeof container.containerId === 'bigint' ? Number(container.containerId) : container.containerId;
                                
                                // Show styled confirmation dialog
                                const collector = container.containerEntity as SpacetimeDBRainCollector;
                                const isSalt = ((collector as any) as SpacetimeDBRainCollector & { isSaltWater?: boolean }).isSaltWater;
                                const waterAmount = Math.round(collector.totalWaterCollected * 1000);
                                const waterType = isSalt ? 'salt water' : 'fresh water';
                                
                                setPendingEmptyReservoirId(rainCollectorIdNum);
                                setPendingEmptyReservoirInfo({ waterAmount, waterType, isSalt });
                                setShowEmptyReservoirConfirm(true);
                            }}
                            disabled={(container.containerEntity as SpacetimeDBRainCollector).totalWaterCollected <= 0}
                            className={`${styles.interactionButton} ${styles.extinguishButton}`}
                            style={{ width: '100%', marginBottom: '8px', textShadow: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            title="Empty all water from the reservoir. Useful for clearing salt water contamination."
                        >
                            <FontAwesomeIcon icon={faDroplet} /> Empty Reservoir (Spill All Water)
                        </button>
                        
                </>
            )}

                {/* Repair Bench UI - only show for wooden_storage_box with boxType === 5 */}
                {container.containerType === 'wooden_storage_box' && 
                 (container.containerEntity as SpacetimeDBWoodenStorageBox).boxType === BOX_TYPE_REPAIR_BENCH && (
                    <>
                        {/* Repair Bench Info Section */}
                        <div style={{ marginTop: '12px', marginBottom: '12px', padding: '10px', backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: '4px', border: '1px solid rgba(255, 166, 77, 0.3)' }}>
                            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#ffa64d', marginBottom: '8px', textAlign: 'center' }}>
                                🔧 Repair Bench
                            </div>
                            
                            {/* Show item info if there's an item in the slot */}
                            {container.items[0] && (
                                <div style={{ marginBottom: '10px' }}>
                                    {(() => {
                                        const repairItem = container.items[0];
                                        const itemDef = repairItem.definition;
                                        const currentDurability = getDurability(repairItem.instance) ?? MAX_DURABILITY;
                                        const maxDurability = getMaxDurability(repairItem.instance);
                                        const repairCount = getRepairCount(repairItem.instance);
                                        const canRepair = canItemBeRepaired(repairItem.instance, itemDef);
                                        const blockedReason = getRepairBlockedReason(repairItem.instance, itemDef);
                                        
                                        return (
                                            <>
                                                {/* Durability display */}
                                                <div style={{ 
                                                    display: 'flex', 
                                                    justifyContent: 'space-between', 
                                                    fontSize: '12px',
                                                    marginBottom: '6px',
                                                    color: '#ccc'
                                                }}>
                                                    <span>Durability:</span>
                                                    <span style={{ 
                                                        color: currentDurability <= maxDurability * 0.25 ? '#ff6b6b' : 
                                                               currentDurability <= maxDurability * 0.5 ? '#ffc94d' : '#66d966' 
                                                    }}>
                                                        {Math.round(currentDurability)} / {Math.round(maxDurability)}
                                                    </span>
                                                </div>
                                                
                                                {/* Durability bar with red "lost" segment */}
                                                <div style={{
                                                    position: 'relative',
                                                    width: '100%',
                                                    height: '10px',
                                                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                                    borderRadius: '4px',
                                                    overflow: 'hidden',
                                                    marginBottom: '8px'
                                                }}>
                                                    {/* Current durability fill (from left) */}
                                                    <div style={{
                                                        position: 'absolute',
                                                        left: 0,
                                                        top: 0,
                                                        bottom: 0,
                                                        width: `${(currentDurability / MAX_DURABILITY) * 100}%`,
                                                        backgroundColor: currentDurability <= maxDurability * 0.25 ? '#ff6b6b' : 
                                                                         currentDurability <= maxDurability * 0.5 ? '#ffc94d' : '#66d966',
                                                        borderRadius: '4px 0 0 4px',
                                                        transition: 'width 0.3s ease',
                                                    }} />
                                                    
                                                    {/* Red "lost" durability segment (at right) */}
                                                    {maxDurability < MAX_DURABILITY && (
                                                        <div style={{
                                                            position: 'absolute',
                                                            right: 0,
                                                            top: 0,
                                                            bottom: 0,
                                                            width: `${((MAX_DURABILITY - maxDurability) / MAX_DURABILITY) * 100}%`,
                                                            backgroundColor: 'rgba(180, 50, 50, 0.9)',
                                                            borderRadius: '0 4px 4px 0',
                                                        }} />
                                                    )}
                                                </div>
                                                
                                                {/* Repair count */}
                                                <div style={{ 
                                                    display: 'flex', 
                                                    justifyContent: 'space-between', 
                                                    fontSize: '12px',
                                                    marginBottom: '8px',
                                                    color: '#ccc'
                                                }}>
                                                    <span>Repairs Used:</span>
                                                    <span style={{ 
                                                        color: repairCount >= MAX_REPAIR_COUNT ? '#ff6b6b' : 
                                                               repairCount >= 2 ? '#ffc94d' : '#66d966' 
                                                    }}>
                                                        {repairCount} / {MAX_REPAIR_COUNT}
                                                    </span>
                                                </div>
                                                
                                                {/* Repair cost display */}
                                                {canRepair && (() => {
                                                    const repairCost = calculateRepairCost(repairItem.instance, itemDef);
                                                    if (repairCost.length > 0) {
                                                        return (
                                                            <div style={{
                                                                marginBottom: '8px',
                                                                padding: '6px 8px',
                                                                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                                                borderRadius: '4px',
                                                                border: '1px solid rgba(255, 166, 77, 0.2)'
                                                            }}>
                                                                <div style={{ 
                                                                    fontSize: '11px', 
                                                                    color: '#aaa',
                                                                    marginBottom: '4px'
                                                                }}>
                                                                    Repair Cost:
                                                                </div>
                                                                <div style={{ 
                                                                    fontSize: '12px', 
                                                                    color: '#ffa64d',
                                                                    display: 'flex',
                                                                    flexWrap: 'wrap',
                                                                    gap: '6px'
                                                                }}>
                                                                    {repairCost.map((ingredient, idx) => (
                                                                        <span key={idx} style={{
                                                                            padding: '2px 6px',
                                                                            backgroundColor: 'rgba(255, 166, 77, 0.1)',
                                                                            borderRadius: '3px',
                                                                            border: '1px solid rgba(255, 166, 77, 0.3)',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px'
                                                                        }}>
                                                                            <img 
                                                                                src={getItemIcon(getIconAssetFromName(ingredient.itemName))}
                                                                                alt={ingredient.itemName}
                                                                                style={{
                                                                                    width: '16px',
                                                                                    height: '16px',
                                                                                    objectFit: 'contain',
                                                                                    imageRendering: 'pixelated'
                                                                                }}
                                                                            />
                                                                            {ingredient.quantity}× {ingredient.itemName}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                                
                                                {/* Blocked reason message */}
                                                {blockedReason && (
                                                    <div style={{
                                                        fontSize: '11px',
                                                        color: '#ff8888',
                                                        textAlign: 'center',
                                                        marginBottom: '8px',
                                                        padding: '4px 8px',
                                                        backgroundColor: 'rgba(255, 100, 100, 0.1)',
                                                        borderRadius: '4px',
                                                        border: '1px solid rgba(255, 100, 100, 0.3)'
                                                    }}>
                                                        ⚠️ {blockedReason}
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                            
                            {/* Empty slot message */}
                            {!container.items[0] && (
                                <div style={{
                                    fontSize: '12px',
                                    color: '#888',
                                    textAlign: 'center',
                                    marginBottom: '8px',
                                    fontStyle: 'italic'
                                }}>
                                    Place an item in the slot to repair it
                                </div>
                            )}
                            
                            {/* Repair button */}
                            <button
                                onClick={handleRepairItem}
                                disabled={!container.items[0] || !canItemBeRepaired(container.items[0]!.instance, container.items[0]!.definition)}
                                className={styles.interactionButton}
                                style={{ 
                                    width: '100%', 
                                    textShadow: 'none', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    gap: '8px',
                                    background: container.items[0] && canItemBeRepaired(container.items[0].instance, container.items[0].definition)
                                        ? 'linear-gradient(135deg, rgba(255, 166, 77, 0.3), rgba(255, 140, 0, 0.2))'
                                        : 'rgba(100, 100, 100, 0.2)',
                                    border: container.items[0] && canItemBeRepaired(container.items[0].instance, container.items[0].definition)
                                        ? '2px solid rgba(255, 166, 77, 0.6)'
                                        : '2px solid rgba(100, 100, 100, 0.4)',
                                    color: container.items[0] && canItemBeRepaired(container.items[0].instance, container.items[0].definition)
                                        ? '#ffa64d'
                                        : '#888',
                                    boxShadow: container.items[0] && canItemBeRepaired(container.items[0].instance, container.items[0].definition)
                                        ? '0 0 8px rgba(255, 166, 77, 0.3)'
                                        : 'none',
                                }}
                            >
                                🔧 Repair Item
                            </button>
                            
                            {/* Repair info */}
                            <div style={{
                                fontSize: '12px',
                                color: '#777',
                                textAlign: 'center',
                                marginTop: '8px',
                                lineHeight: '1.4'
                            }}>
                                Each repair restores durability but reduces max durability by 25%
                            </div>
                        </div>
                    </>
                )}

                {/* Broth pot pickup button - show with warning if has contents */}
                {container.containerType === 'broth_pot' && (
                    <>
                        {(() => {
                            const brothPot = container.containerEntity as SpacetimeDBBrothPot;
                            const isEmpty = brothPot.waterLevelMl === 0 && 
                                          !brothPot.ingredientInstanceId0 && 
                                          !brothPot.ingredientInstanceId1 && 
                                          !brothPot.ingredientInstanceId2;
                            
                            return (
                                <button
                                    onClick={() => {
                                        if (!connection?.reducers || container.containerId === null) return;
                                        const brothPotIdNum = typeof container.containerId === 'bigint' ? Number(container.containerId) : container.containerId;
                                        
                                        // Play spill sound immediately if there's water (client-side instant feedback)
                                        const hadWater = brothPot.waterLevelMl > 0;
                                        if (hadWater) {
                                            playImmediateSound('filling_container', 1.2);
                                        }
                                        
                                        try {
                                            connection.reducers.pickupBrothPot(brothPotIdNum);
                                        } catch (e: any) {
                                            console.error("Error picking up broth pot:", e);
                                        }
                                    }}
                                    className={`${styles.interactionButton} ${isEmpty ? styles.lightFireButton : styles.extinguishButton}`}
                                    style={{ marginTop: '8px', textShadow: 'none' }}
                                    title={!isEmpty 
                                        ? `⚠️ WARNING: Picking up will spill ${brothPot.waterLevelMl}ml of water and drop ingredients! (No confirmation for quick PvP escapes)` 
                                        : "Pick up the Field Cauldron and return it to your inventory"}
                                >
                                    Pick Up Broth Pot {!isEmpty ? '(Will Spill Contents!)' : ''}
                                </button>
                            );
                        })()}
                </>
            )}

                {/* Matron's Chest building privilege UI */}
                {container.containerType === 'homestead_hearth' && (
                    <>
                        <div style={{ 
                            marginTop: '12px', 
                            marginBottom: '8px',
                            padding: '10px',
                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '4px',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <div style={{ 
                                fontSize: '13px', 
                                fontWeight: 'bold',
                                color: '#87CEEB',
                                marginBottom: '8px'
                            }}>
                                🏗️ Building Privilege
                            </div>
                            
                            <div style={{ 
                                display: 'flex', 
                                gap: '16px',
                                alignItems: 'flex-start'
                            }}>
                                {/* Left column: Button */}
                                <div style={{ flex: '1', minWidth: '0' }}>
                                    <button
                                        onClick={handleGrantBuildingPrivilege}
                                        className={`${styles.interactionButton} ${currentPlayerHasPrivilege ? styles.extinguishButton : styles.lightFireButton}`}
                                        style={{ width: '100%' }}
                                        disabled={!connection || container.containerId === null || isTogglingPrivilege}
                                        title={
                                            !connection ? 'Not connected' : 
                                            container.containerId === null ? 'No container selected' : 
                                            isTogglingPrivilege ? 'Processing...' : 
                                            ''
                                        }
                                    >
                                        {isTogglingPrivilege 
                                            ? 'Processing...' 
                                            : currentPlayerHasPrivilege 
                                                ? 'Revoke Building Privilege' 
                                                : 'Grant Building Privilege'
                                        }
                                    </button>
                                </div>
                                
                                {/* Right column: Players list with revoke buttons */}
                                <div style={{ flex: '1', minWidth: '0' }}>
                                    {playersWithPrivilege.length > 0 ? (
                                        <div style={{ fontSize: '12px', color: '#ffffff' }}>
                                            <div style={{ 
                                                marginBottom: '6px', 
                                                fontWeight: 'bold', 
                                                color: '#87CEEB',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <span>Players with privilege:</span>
                                                {/* Wipe All button */}
                                                {playersWithPrivilege.length > 1 && currentPlayerHasPrivilege && (
                                                    <button
                                                        onClick={() => {
                                                            if (!connection?.reducers || container.containerId === null) return;
                                                            const hearthIdNum = typeof container.containerId === 'bigint' ? Number(container.containerId) : container.containerId;
                                                            if (window.confirm(`⚠️ Wipe ALL ${playersWithPrivilege.length} building privileges?\n\nThis will revoke access for everyone (including yourself).\n\nThis action cannot be undone.`)) {
                                                                try {
                                                                    (connection.reducers as any).wipeAllBuildingPrivileges(hearthIdNum);
                                                                } catch (e: any) {
                                                                    console.error("Error wiping privileges:", e);
                                                                }
                                                            }
                                                        }}
                                                        style={{
                                                            fontSize: '10px',
                                                            padding: '2px 6px',
                                                            background: 'rgba(255, 50, 50, 0.3)',
                                                            border: '1px solid rgba(255, 100, 100, 0.6)',
                                                            borderRadius: '3px',
                                                            color: '#ff6666',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.background = 'rgba(255, 50, 50, 0.5)';
                                                            e.currentTarget.style.borderColor = 'rgba(255, 100, 100, 0.9)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = 'rgba(255, 50, 50, 0.3)';
                                                            e.currentTarget.style.borderColor = 'rgba(255, 100, 100, 0.6)';
                                                        }}
                                                    >
                                                        Wipe All
                                                    </button>
                                                )}
                                            </div>
                                            {playersWithPrivilege.map((p) => (
                                                <div key={p.id} style={{ 
                                                    marginBottom: '4px', 
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}>
                                                    <span style={{
                                                        color: p.id === playerId ? '#00ff88' : '#cccccc',
                                                        fontSize: '13px',
                                                        flex: 1,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        • {p.name || p.id.substring(0, 8)} {p.id === playerId && '(You)'}
                                                    </span>
                                                    {/* Individual revoke button - only show if current player has privilege */}
                                                    {currentPlayerHasPrivilege && (
                                                        <button
                                                            onClick={() => {
                                                                if (!connection?.reducers || container.containerId === null) return;
                                                                const hearthIdNum = typeof container.containerId === 'bigint' ? Number(container.containerId) : container.containerId;
                                                                try {
                                                                    // Convert hex string to Identity
                                                                    const { Identity } = require('../generated');
                                                                    const targetIdentity = Identity.fromString(p.id);
                                                                    (connection.reducers as any).revokePlayerBuildingPrivilege(hearthIdNum, targetIdentity);
                                                                } catch (e: any) {
                                                                    console.error("Error revoking privilege:", e);
                                                                }
                                                            }}
                                                            style={{
                                                                fontSize: '11px',
                                                                padding: '2px 6px',
                                                                background: 'rgba(255, 100, 100, 0.2)',
                                                                border: '1px solid rgba(255, 100, 100, 0.4)',
                                                                borderRadius: '3px',
                                                                color: '#ff8888',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s',
                                                                minWidth: '20px'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.background = 'rgba(255, 100, 100, 0.4)';
                                                                e.currentTarget.style.borderColor = 'rgba(255, 100, 100, 0.7)';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.background = 'rgba(255, 100, 100, 0.2)';
                                                                e.currentTarget.style.borderColor = 'rgba(255, 100, 100, 0.4)';
                                                            }}
                                                            title={`Revoke building privilege from ${p.name || p.id.substring(0, 8)}`}
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '12px', color: '#aaaaaa', fontStyle: 'italic' }}>
                                            No players with building privilege
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Upkeep UI */}
                        <div style={{ 
                            marginTop: '12px', 
                            marginBottom: '8px',
                            padding: '10px',
                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '4px',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <div style={{ 
                                fontSize: '13px', 
                                fontWeight: 'bold',
                                color: '#ffa040',
                                marginBottom: '8px'
                            }}>
                                ⚙️ Building Upkeep
                            </div>
                            
                            {upkeepCosts ? (
                                <div style={{ 
                                    display: 'flex', 
                                    gap: '16px',
                                    alignItems: 'flex-start'
                                }}>
                                    {/* Left column: Status and time estimates */}
                                    <div style={{ flex: '1', minWidth: '0' }}>
                                        {upkeepCosts.requiredWood === 0 && upkeepCosts.requiredStone === 0 && upkeepCosts.requiredMetal === 0 ? (
                                            <div style={{ fontSize: '12px', color: '#00ff88', fontStyle: 'italic' }}>
                                                ✓ No upkeep required (only twig buildings)
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ 
                                                    fontSize: '12px', 
                                                    color: (upkeepCosts.availableWood >= upkeepCosts.requiredWood && 
                                                           upkeepCosts.availableStone >= upkeepCosts.requiredStone && 
                                                           upkeepCosts.availableMetal >= upkeepCosts.requiredMetal) 
                                                        ? '#00ff88' : '#ff4444',
                                                    fontWeight: 'bold',
                                                    marginBottom: '6px'
                                                }}>
                                                    {(upkeepCosts.availableWood >= upkeepCosts.requiredWood && 
                                                      upkeepCosts.availableStone >= upkeepCosts.requiredStone && 
                                                      upkeepCosts.availableMetal >= upkeepCosts.requiredMetal) 
                                                        ? '✓ Building Protected' 
                                                        : '⚠️ Insufficient Resources - Buildings Will Decay'}
                                                </div>
                                                
                                                {/* Show time estimate - resource duration when protected, decay time when unprotected */}
                                                {upkeepCosts.estimatedDecayHours !== null && 
                                                 upkeepCosts.estimatedDecayHours !== undefined && (
                                                    <div style={{ 
                                                        fontSize: '13px', 
                                                        color: (upkeepCosts.availableWood >= upkeepCosts.requiredWood && 
                                                               upkeepCosts.availableStone >= upkeepCosts.requiredStone && 
                                                               upkeepCosts.availableMetal >= upkeepCosts.requiredMetal)
                                                            ? '#87CEEB' : '#ffaa44',
                                                        fontStyle: 'italic'
                                                    }}>
                                                        {(upkeepCosts.availableWood >= upkeepCosts.requiredWood && 
                                                          upkeepCosts.availableStone >= upkeepCosts.requiredStone && 
                                                          upkeepCosts.availableMetal >= upkeepCosts.requiredMetal) ? (
                                                            <>
                                                                ⏱️ Resources will last: {calculateResourceDuration(upkeepCosts)}
                                                            </>
                                                        ) : (
                                                            <>
                                                                ⏱️ Buildings will decay in: {formatDecayTime(upkeepCosts.estimatedDecayHours)}
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    
                                    {/* Right column: Resource requirements */}
                                    <div style={{ flex: '1', minWidth: '0' }}>
                                        <div style={{ fontSize: '12px', color: '#ffffff' }}>
                                            <div style={{ marginBottom: '6px', fontWeight: 'bold', color: '#ffa040' }}>Required per hour:</div>
                                            <div style={{ marginBottom: '4px', fontSize: '13px' }}>
                                                🪵 Wood: {upkeepCosts.requiredWood}
                                            </div>
                                            <div style={{ marginBottom: '4px', fontSize: '13px' }}>
                                                🪨 Stone: {upkeepCosts.requiredStone}
                                            </div>
                                            <div style={{ marginBottom: '4px', fontSize: '13px' }}>
                                                ⚙️ Metal: {upkeepCosts.requiredMetal}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ fontSize: '12px', color: '#aaaaaa', fontStyle: 'italic' }}>
                                    Loading upkeep information...
                                </div>
                            )}
                        </div>
                    </>
                )}
            </ContainerButtons>
            )}

            {/* Special handling for hidden stash - don't show slots */}
            {container.containerType === 'stash' && (container.containerEntity as SpacetimeDBStash).isHidden && (
                <div style={{ marginTop: '8px' }}>
                    {/* Slots are hidden, only show the surface button above */}
                </div>
            )}

            {/* Empty Reservoir Confirmation Dialog */}
            {showEmptyReservoirConfirm && pendingEmptyReservoirInfo && (
                <div 
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000,
                        backdropFilter: 'blur(4px)',
                    }}
                    onClick={() => setShowEmptyReservoirConfirm(false)}
                >
                    <div 
                        style={{
                            background: 'linear-gradient(145deg, rgba(40, 20, 60, 0.98), rgba(30, 15, 50, 0.99))',
                            border: pendingEmptyReservoirInfo.isSalt ? '2px solid #87CEEB' : '2px solid #ff6666',
                            borderRadius: '12px',
                            padding: '30px',
                            maxWidth: '450px',
                            textAlign: 'center',
                            boxShadow: pendingEmptyReservoirInfo.isSalt 
                                ? '0 0 40px rgba(135, 206, 250, 0.4), inset 0 0 20px rgba(135, 206, 250, 0.1)'
                                : '0 0 40px rgba(255, 102, 102, 0.4), inset 0 0 20px rgba(255, 102, 102, 0.1)',
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Warning scan line */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '2px',
                            background: pendingEmptyReservoirInfo.isSalt
                                ? 'linear-gradient(90deg, transparent, #87CEEB, transparent)'
                                : 'linear-gradient(90deg, transparent, #ff6666, transparent)',
                            animation: 'scanLine 2s linear infinite',
                        }} />
                        
                        <div style={{
                            color: pendingEmptyReservoirInfo.isSalt ? '#87CEEB' : '#ff9999',
                            fontSize: '18px',
                            marginBottom: '15px',
                            textShadow: pendingEmptyReservoirInfo.isSalt 
                                ? '0 0 10px rgba(135, 206, 250, 0.8)'
                                : '0 0 10px rgba(255, 153, 153, 0.8)',
                            fontFamily: '"Press Start 2P", cursive',
                            letterSpacing: '1px',
                        }}>
                            {pendingEmptyReservoirInfo.isSalt ? '🌊 SPILL SALT WATER?' : '⚠️ SPILL FRESH WATER?'}
                        </div>
                        
                        <div style={{
                            color: '#ffffff',
                            fontSize: '14px',
                            lineHeight: '1.8',
                            marginBottom: '25px',
                            padding: '20px',
                            backgroundColor: 'rgba(0, 0, 0, 0.4)',
                            borderRadius: '8px',
                            border: pendingEmptyReservoirInfo.isSalt
                                ? '1px solid rgba(135, 206, 250, 0.3)'
                                : '1px solid rgba(255, 102, 102, 0.3)',
                            fontFamily: '"Press Start 2P", cursive',
                        }}>
                            You are about to spill <strong style={{ color: pendingEmptyReservoirInfo.isSalt ? '#87CEEB' : '#66ccff' }}>{pendingEmptyReservoirInfo.waterAmount}ml</strong> of <strong>{pendingEmptyReservoirInfo.waterType}</strong> from the rain collector.
                            <br /><br />
                            {pendingEmptyReservoirInfo.isSalt ? (
                                <>This will clear the salt water contamination and allow fresh rainwater to be collected.</>
                            ) : (
                                <>This will permanently destroy this fresh water. Consider transferring it to containers first!</>
                            )}
                            <br /><br />
                            <span style={{ color: '#ff6666' }}>This action cannot be undone.</span>
                        </div>

                        <div style={{
                            display: 'flex',
                            gap: '15px',
                            justifyContent: 'center',
                        }}>
                            <button
                                onClick={() => {
                                    if (connection?.reducers && pendingEmptyReservoirId !== null) {
                                        try {
                                            (connection.reducers as any).emptyRainCollectorReservoir(pendingEmptyReservoirId);
                                            playImmediateSound('filling_container', 1.2);
                                        } catch (e: any) {
                                            console.error("Error emptying rain collector reservoir:", e);
                                        }
                                    }
                                    setShowEmptyReservoirConfirm(false);
                                    setPendingEmptyReservoirId(null);
                                    setPendingEmptyReservoirInfo(null);
                                }}
                                style={{
                                    background: 'linear-gradient(135deg, rgba(120, 20, 40, 0.8), rgba(80, 10, 30, 0.9))',
                                    color: '#ffffff',
                                    border: '2px solid #ff6666',
                                    borderRadius: '8px',
                                    padding: '15px 25px',
                                    fontFamily: '"Press Start 2P", cursive',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 0 15px rgba(255, 102, 102, 0.3), inset 0 0 10px rgba(255, 102, 102, 0.1)',
                                    textShadow: '0 0 5px currentColor',
                                    letterSpacing: '1px',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(150, 30, 50, 0.9), rgba(100, 15, 35, 1))';
                                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 0 25px rgba(255, 102, 102, 0.6), inset 0 0 15px rgba(255, 102, 102, 0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 20, 40, 0.8), rgba(80, 10, 30, 0.9))';
                                    e.currentTarget.style.transform = 'translateY(0px) scale(1)';
                                    e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 102, 102, 0.3), inset 0 0 10px rgba(255, 102, 102, 0.1)';
                                }}
                            >
                                CONFIRM SPILL
                            </button>
                            
                            <button
                                onClick={() => {
                                    setShowEmptyReservoirConfirm(false);
                                    setPendingEmptyReservoirId(null);
                                    setPendingEmptyReservoirInfo(null);
                                }}
                                style={{
                                    background: 'linear-gradient(135deg, rgba(20, 40, 80, 0.8), rgba(10, 30, 70, 0.9))',
                                    color: '#ffffff',
                                    border: '2px solid #00aaff',
                                    borderRadius: '8px',
                                    padding: '15px 25px',
                                    fontFamily: '"Press Start 2P", cursive',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 0 15px rgba(0, 170, 255, 0.3), inset 0 0 10px rgba(0, 170, 255, 0.1)',
                                    textShadow: '0 0 5px currentColor',
                                    letterSpacing: '1px',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30, 50, 100, 0.9), rgba(15, 40, 90, 1))';
                                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 0 25px rgba(0, 170, 255, 0.6), inset 0 0 15px rgba(0, 170, 255, 0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(20, 40, 80, 0.8), rgba(10, 30, 70, 0.9))';
                                    e.currentTarget.style.transform = 'translateY(0px) scale(1)';
                                    e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 170, 255, 0.3), inset 0 0 10px rgba(0, 170, 255, 0.1)';
                                }}
                            >
                                KEEP WATER
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes scanLine {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes ingredientSlotPulse {
                    0%, 100% {
                        opacity: 1;
                        box-shadow: inset 0 0 8px rgba(100, 200, 100, 0.1), 0 0 4px rgba(100, 200, 100, 0.2);
                    }
                    50% {
                        opacity: 0.85;
                        box-shadow: inset 0 0 8px rgba(100, 200, 100, 0.15), 0 0 8px rgba(100, 200, 100, 0.4);
                    }
                }
                @keyframes thresholdPulse {
                    0%, 100% {
                        opacity: 0.9;
                        box-shadow: 0 0 6px rgba(255, 100, 50, 0.8);
                    }
                    50% {
                        opacity: 1;
                        box-shadow: 0 0 12px rgba(255, 100, 50, 1);
                    }
                }
            `}</style>
        </div>
    );
};

export default ExternalContainerUI; 