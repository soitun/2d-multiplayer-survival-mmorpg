/******************************************************************************
 * ExternalContainerUI.tsx                                                     *
 * -------------------------------------------------------------------------- *
 * Manages the UI for external containers like campfires, wooden storage      *
 * boxes, player corpses, and stashes. Displays items, handles               *
 * drag-and-drop interactions, and context menus for these containers.        *
 ******************************************************************************/

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import styles from './InventoryUI.module.css'; // Reuse styles for now

// Import Custom Components
import ContainerSlots from './ContainerSlots';
import ContainerButtons from './ContainerButtons';

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
    HearthUpkeepQueryResult, // ADDED: For upkeep query results
    WorldState,
    Player,
    ActiveConsumableEffect,
} from '../generated';
import { InteractionTarget } from '../hooks/useInteractionManager';
import { DragSourceSlotInfo, DraggedItemInfo } from '../types/dragDropTypes';
import { PopulatedItem } from './InventoryUI';
import { isWaterContainer, getWaterContent, formatWaterContent, getWaterLevelPercentage } from '../utils/waterContainerHelpers';

// Import new utilities
import { useContainer } from '../hooks/useContainer';
import { ContainerType, isFuelContainer, getContainerConfig } from '../utils/containerUtils';

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
    const isHeavyRaining = useMemo(() => {
        if (!worldState?.rainIntensity || worldState.rainIntensity <= 0) return false;
        
        if (worldState.currentWeather) {
            return worldState.currentWeather.tag === 'HeavyRain' || worldState.currentWeather.tag === 'HeavyStorm';
        }
        
        return worldState.rainIntensity >= 0.8;
    }, [worldState]);

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
    const getWeatherWarningMessage = useMemo(() => {
        if (!worldState?.currentWeather || !isHeavyRaining) return null;
        
        switch (worldState.currentWeather.tag) {
            case 'HeavyRain':
                return "Heavy rain - May require shelter 🏠 or tree cover 🌳";
            case 'HeavyStorm':
                return "Heavy storm - May require shelter 🏠 or tree cover 🌳";
            default:
                return "Severe weather - May require shelter 🏠 or tree cover 🌳";
        }
    }, [worldState, isHeavyRaining]);

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

    // Handle grant building privilege for matron's chest
    const handleGrantBuildingPrivilege = useCallback(() => {
        if (!connection?.reducers || container.containerId === null || !container.containerEntity) return;
        
        const hearthIdNum = typeof container.containerId === 'bigint' ? Number(container.containerId) : container.containerId;
        try {
            connection.reducers.grantBuildingPrivilegeFromHearth(hearthIdNum);
        } catch (e: any) {
            console.error("Error granting building privilege:", e);
        }
    }, [connection, container.containerId, container.containerEntity]);

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
            />

            {/* Generic Container Buttons - handles toggle/light/extinguish */}
            <ContainerButtons
                containerType={container.containerType}
                containerEntity={container.containerEntity}
                items={container.items}
                onToggle={container.containerType === 'lantern' ? handleLanternToggle : container.toggleHandler}
            >
                {/* Special case buttons for specific containers */}
                
                {/* Campfire weather warning */}
                {container.containerType === 'campfire' && isHeavyRaining && !container.isActive && (
                            <div style={{ 
                                marginTop: '8px', 
                                color: '#87CEEB', 
                                fontSize: '12px', 
                                textAlign: 'center',
                                fontStyle: 'italic'
                            }}>
                                🌧️ {getWeatherWarningMessage}
                            </div>
                )}

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
                        <button
                            onClick={handleFillWaterContainer}
                            disabled={!container.items[0] || 
                                     !['Reed Water Bottle', 'Plastic Water Jug'].includes(container.items[0]?.definition.name || '') || 
                                     (container.containerEntity as SpacetimeDBRainCollector).totalWaterCollected <= 0}
                            className={`${styles.interactionButton} ${styles.lightFireButton}`}
                        >
                            Fill Container ({(container.containerEntity as SpacetimeDBRainCollector).totalWaterCollected.toFixed(1)}L)
                        </button>
                        
                        <div style={{ 
                            marginTop: '4px', 
                            color: '#87CEEB', 
                            fontSize: '12px', 
                            textAlign: 'center',
                            fontStyle: 'italic'
                        }}>
                            💧 Place water containers (bottles/jugs) to fill during rain
                    </div>
                </>
            )}

                {/* Matron's Chest building privilege UI */}
                {container.containerType === 'homestead_hearth' && (
                    <>
                        <div style={{ 
                            marginTop: '12px', 
                            marginBottom: '8px',
                            padding: '8px',
                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '4px',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <div style={{ 
                                fontSize: '12px', 
                                fontWeight: 'bold',
                                color: '#87CEEB',
                                marginBottom: '6px'
                            }}>
                                🏗️ Building Privilege
                            </div>
                            
                            {playersWithPrivilege.length > 0 ? (
                                <div style={{ fontSize: '11px', color: '#ffffff', marginBottom: '8px' }}>
                                    <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>Players with privilege:</div>
                                    {playersWithPrivilege.map((p) => (
                                        <div key={p.id} style={{ marginLeft: '8px', color: p.id === playerId ? '#00ff88' : '#cccccc' }}>
                                            • {p.name || p.id.substring(0, 8)} {p.id === playerId && '(You)'}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ fontSize: '11px', color: '#aaaaaa', marginBottom: '8px', fontStyle: 'italic' }}>
                                    No players with building privilege
                                </div>
                            )}
                            
                            <button
                                onClick={handleGrantBuildingPrivilege}
                                className={`${styles.interactionButton} ${currentPlayerHasPrivilege ? styles.extinguishButton : styles.lightFireButton}`}
                                style={{ width: '100%', marginTop: '4px' }}
                            >
                                {currentPlayerHasPrivilege ? 'Revoke Building Privilege' : 'Grant Building Privilege'}
                            </button>
                            
                        </div>

                        {/* Upkeep UI */}
                        <div style={{ 
                            marginTop: '12px', 
                            marginBottom: '8px',
                            padding: '8px',
                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '4px',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <div style={{ 
                                fontSize: '12px', 
                                fontWeight: 'bold',
                                color: '#ffa040',
                                marginBottom: '6px'
                            }}>
                                ⚙️ Building Upkeep
                            </div>
                            
                            {upkeepCosts ? (
                                <>
                                    <div style={{ fontSize: '11px', color: '#ffffff', marginBottom: '8px' }}>
                                        <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>Required per hour:</div>
                                        <div style={{ marginLeft: '8px', marginBottom: '2px' }}>
                                            🪵 Wood: <span style={{ color: upkeepCosts.availableWood >= upkeepCosts.requiredWood ? '#00ff88' : '#ff4444' }}>
                                                {upkeepCosts.requiredWood} / {upkeepCosts.availableWood}
                                            </span>
                                        </div>
                                        <div style={{ marginLeft: '8px', marginBottom: '2px' }}>
                                            🪨 Stone: <span style={{ color: upkeepCosts.availableStone >= upkeepCosts.requiredStone ? '#00ff88' : '#ff4444' }}>
                                                {upkeepCosts.requiredStone} / {upkeepCosts.availableStone}
                                            </span>
                                        </div>
                                        <div style={{ marginLeft: '8px', marginBottom: '2px' }}>
                                            ⚙️ Metal: <span style={{ color: upkeepCosts.availableMetal >= upkeepCosts.requiredMetal ? '#00ff88' : '#ff4444' }}>
                                                {upkeepCosts.requiredMetal} / {upkeepCosts.availableMetal}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {upkeepCosts.requiredWood === 0 && upkeepCosts.requiredStone === 0 && upkeepCosts.requiredMetal === 0 ? (
                                        <div style={{ fontSize: '11px', color: '#00ff88', fontStyle: 'italic' }}>
                                            ✓ No upkeep required (only twig buildings)
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ 
                                                fontSize: '11px', 
                                                color: (upkeepCosts.availableWood >= upkeepCosts.requiredWood && 
                                                       upkeepCosts.availableStone >= upkeepCosts.requiredStone && 
                                                       upkeepCosts.availableMetal >= upkeepCosts.requiredMetal) 
                                                    ? '#00ff88' : '#ff4444',
                                                fontWeight: 'bold',
                                                marginTop: '4px'
                                            }}>
                                                {(upkeepCosts.availableWood >= upkeepCosts.requiredWood && 
                                                  upkeepCosts.availableStone >= upkeepCosts.requiredStone && 
                                                  upkeepCosts.availableMetal >= upkeepCosts.requiredMetal) 
                                                    ? '✓ Buildings Protected' 
                                                    : '⚠️ Insufficient Resources - Buildings Will Decay'}
                                            </div>
                                            
                                            {/* Show time estimate - resource duration when protected, decay time when unprotected */}
                                            {upkeepCosts.estimatedDecayHours !== null && 
                                             upkeepCosts.estimatedDecayHours !== undefined && (
                                                <div style={{ 
                                                    fontSize: '12px', 
                                                    color: (upkeepCosts.availableWood >= upkeepCosts.requiredWood && 
                                                           upkeepCosts.availableStone >= upkeepCosts.requiredStone && 
                                                           upkeepCosts.availableMetal >= upkeepCosts.requiredMetal)
                                                        ? '#87CEEB' : '#ffaa44',
                                                    marginTop: '4px',
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
                                   
                                </>
                            ) : (
                                <div style={{ fontSize: '11px', color: '#aaaaaa', fontStyle: 'italic' }}>
                                    Loading upkeep information...
                                </div>
                            )}
                        </div>
                    </>
                )}
            </ContainerButtons>

            {/* Special handling for hidden stash - don't show slots */}
            {container.containerType === 'stash' && (container.containerEntity as SpacetimeDBStash).isHidden && (
                <div style={{ marginTop: '8px' }}>
                    {/* Slots are hidden, only show the surface button above */}
                </div>
            )}
        </div>
    );
};

export default ExternalContainerUI; 