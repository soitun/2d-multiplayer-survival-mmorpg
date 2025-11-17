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
import { faArrowUp, faArrowDown, faDroplet } from '@fortawesome/free-solid-svg-icons';

// Import Custom Components
import ContainerSlots from './ContainerSlots';
import ContainerButtons from './ContainerButtons';
import DroppableSlot from './DroppableSlot';
import DraggableItem from './DraggableItem';

// Import Types
import { 
    ItemDefinition, InventoryItem, DbConnection, 
    Campfire as SpacetimeDBCampfire,
    Furnace as SpacetimeDBFurnace,
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
import { playImmediateSound } from '../hooks/useSoundSystem';

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
}

const ExternalContainerUI: React.FC<ExternalContainerUIProps> = ({
    interactionTarget,
    inventoryItems,
    itemDefinitions,
    campfires,
    furnaces,
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

    // Enhanced tooltip handler for campfire items to show Reed Bellows effects
    const handleCampfireFuelMouseEnter = useCallback((item: PopulatedItem, event: React.MouseEvent<HTMLDivElement>) => {
        // Prevent browser tooltip
        event.currentTarget.removeAttribute('title');
        
        // Check if Reed Bellows is present in the campfire
        const currentCampfire = container.containerEntity as SpacetimeDBCampfire;
        const hasReedBellows = currentCampfire && [
            currentCampfire.fuelDefId0, currentCampfire.fuelDefId1, 
            currentCampfire.fuelDefId2, currentCampfire.fuelDefId3, 
            currentCampfire.fuelDefId4
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
            currentFurnace.fuelDefId0, currentFurnace.fuelDefId1, 
            currentFurnace.fuelDefId2, currentFurnace.fuelDefId3, 
            currentFurnace.fuelDefId4
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
                if (tree.respawnAt !== null && tree.respawnAt !== undefined) continue;
                
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

    // Don't render anything if no container
    if (!container.containerType || !container.containerEntity) {
        return null;
    }

    const config = getContainerConfig(container.containerType);

    // Check if campfire has attached broth pot
    const attachedBrothPot = useMemo(() => {
        if (container.containerType !== 'campfire') return null;
        const campfire = container.containerEntity as SpacetimeDBCampfire;
        if (!campfire.attachedBrothPotId) return null;
        return brothPots.get(campfire.attachedBrothPotId.toString()) || null;
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

    return (
        <div className={styles.externalInventorySection}>
            {/* Dynamic Title */}
            <h3 className={styles.sectionTitle}>{container.containerTitle}</h3>

            {/* Generic Container Slots - handles all slot rendering */}
            <ContainerSlots
                containerType={container.containerType}
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
                        <h3 className={styles.sectionTitle} style={{ fontSize: '14px', marginBottom: '12px' }}>
                            Field Cauldron
                        </h3>
                        
                        {/* All 5 slots in one row: Water Container + 3 Ingredient slots + Output slot */}
                        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '12px' }}>
                            <div style={{ 
                                display: 'grid',
                                gridTemplateColumns: 'repeat(5, 1fr)',
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
                                    
                                    return (
                                        <DroppableSlot
                                            key={`broth_pot_${attachedBrothPot.id}_${index}`}
                                            slotInfo={slotInfo}
                                            onItemDrop={handleItemDropWithTracking}
                                            className={styles.slot}
                                            isDraggingOver={false}
                                            style={{
                                                border: '2px solid rgba(100, 200, 100, 0.5)',
                                                background: 'linear-gradient(135deg, rgba(50, 150, 50, 0.15), rgba(100, 200, 100, 0.1))',
                                                boxShadow: 'inset 0 0 8px rgba(100, 200, 100, 0.15)'
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
                                            {/* Generic ingredient icon in top left */}
                                            <div style={{
                                                position: 'absolute',
                                                top: '4px',
                                                left: '4px',
                                                fontSize: '14px',
                                                zIndex: 5,
                                                pointerEvents: 'none',
                                                textShadow: '0 0 2px rgba(0, 0, 0, 0.8)'
                                            }}>
                                                ⚪
                                            </div>
                                        </DroppableSlot>
                                    );
                                })}
                                
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
                        
                        {/* Water level display with visual bar - right under all inventory slots */}
                        <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                            <div style={{ 
                                fontSize: '12px', 
                                color: '#87CEEB', 
                                marginBottom: '6px',
                                textAlign: 'center'
                            }}>
                                {attachedBrothPot.isSeawater ? '🌊' : '💧'} Water: {attachedBrothPot.waterLevelMl}ml / 5000ml
                            </div>
                            
                                {/* Visual water level bar */}
                                <div style={{
                                    width: '100%',
                                    height: '8px',
                                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    border: attachedBrothPot.isSeawater 
                                        ? '1px solid rgba(135, 206, 250, 0.5)' // Lighter cyan border for salt water
                                        : '1px solid rgba(0, 150, 255, 0.5)', // Blue border for fresh water
                                }}>
                                    <div style={{
                                        width: `${(attachedBrothPot.waterLevelMl / 5000) * 100}%`,
                                        height: '100%',
                                        background: attachedBrothPot.waterLevelMl > 0 
                                            ? (attachedBrothPot.isSeawater 
                                                ? 'linear-gradient(90deg, #87ceeb 0%, #a0d4f0 50%, #b8dce8 100%)' // Light cyan gradient for salt water
                                                : 'linear-gradient(90deg, #0066cc 0%, #0080ff 50%, #0099ff 100%)') // Deep blue gradient for fresh water
                                            : 'transparent',
                                        transition: 'width 0.3s ease',
                                        boxShadow: attachedBrothPot.waterLevelMl > 0 
                                            ? (attachedBrothPot.isSeawater 
                                                ? '0 0 8px rgba(135, 206, 250, 0.6)' // Cyan glow for salt water
                                                : '0 0 8px rgba(0, 150, 255, 0.6)') // Blue glow for fresh water
                                            : 'none',
                                    }} />
                                </div>
                        </div>

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
                                    <span>Currently Brewing {attachedBrothPot.currentRecipeName || 'Soup'}</span>
                                    <span style={{ fontSize: '16px' }}>🍲</span>
                                </div>
                            </div>
                        )}

                        {/* Seawater Warning - shown when pot has seawater and ingredients */}
                        {!attachedBrothPot.isCooking && 
                         attachedBrothPot.isSeawater && 
                         attachedBrothPot.waterLevelMl >= 1000 &&
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
                        className={`${styles.interactionButton} ${styles.lightFireButton}`}
                        style={{ width: '100%', marginBottom: '8px', textShadow: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                        <FontAwesomeIcon icon={faArrowUp} /> Transfer Water OUT OF Field Cauldron
                    </button>

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
                        className={`${styles.interactionButton} ${styles.lightFireButton}`}
                        style={{ width: '100%', marginBottom: '12px', textShadow: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
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
                        <button
                            onClick={handleFillWaterContainer}
                            disabled={!container.items[0] || 
                                     !['Reed Water Bottle', 'Plastic Water Jug'].includes(container.items[0]?.definition.name || '') || 
                                     (container.containerEntity as SpacetimeDBRainCollector).totalWaterCollected <= 0}
                            className={`${styles.interactionButton} ${styles.lightFireButton}`}
                            style={{ width: '100%', marginBottom: '8px', textShadow: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            <FontAwesomeIcon icon={faArrowUp} /> Transfer Water OUT OF Rain Collector
                        </button>

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
                            className={`${styles.interactionButton} ${styles.lightFireButton}`}
                            style={{ width: '100%', marginBottom: '8px', textShadow: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
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
                                
                                {/* Right column: Players list */}
                                <div style={{ flex: '1', minWidth: '0' }}>
                                    {playersWithPrivilege.length > 0 ? (
                                        <div style={{ fontSize: '12px', color: '#ffffff' }}>
                                            <div style={{ marginBottom: '6px', fontWeight: 'bold', color: '#87CEEB' }}>Players with privilege:</div>
                                            {playersWithPrivilege.map((p) => (
                                                <div key={p.id} style={{ 
                                                    marginBottom: '4px', 
                                                    color: p.id === playerId ? '#00ff88' : '#cccccc',
                                                    fontSize: '13px'
                                                }}>
                                                    • {p.name || p.id.substring(0, 8)} {p.id === playerId && '(You)'}
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
            `}</style>
        </div>
    );
};

export default ExternalContainerUI; 