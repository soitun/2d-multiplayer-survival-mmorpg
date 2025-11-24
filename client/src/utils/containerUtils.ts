/**
 * Container Utilities
 * 
 * Simple pattern-based utilities to eliminate duplication in ExternalContainerUI.tsx
 * and useDragDropManager.ts. Focuses on actual repeated patterns rather than theoretical configurations.
 */

import { 
    InventoryItem, ItemDefinition,
    Campfire, Furnace, Fumarole, Lantern, WoodenStorageBox, PlayerCorpse, Stash, RainCollector, HomesteadHearth, BrothPot
} from '../generated';
import { PopulatedItem } from '../components/InventoryUI';
import { DragSourceSlotInfo, DraggedItemInfo, SlotType } from '../types/dragDropTypes';
import { playImmediateSound } from '../hooks/useSoundSystem';

// Container type definitions based on actual usage
export type ContainerType = 
    | 'campfire' | 'furnace' | 'fumarole' | 'lantern'           // Fuel containers (fumarole is always-on heat source)
    | 'wooden_storage_box' | 'player_corpse' | 'stash' | 'rain_collector' | 'homestead_hearth' | 'broth_pot'; // Storage containers

export type ContainerEntity = Campfire | Furnace | Fumarole | Lantern | WoodenStorageBox | PlayerCorpse | Stash | RainCollector | HomesteadHearth | BrothPot;

// Container configurations - simple and focused on actual patterns
export const CONTAINER_CONFIGS = {
    // Fuel containers
    campfire: { slots: 5, slotType: 'campfire_fuel', fieldPrefix: 'fuelInstanceId', hasToggle: true, hasLightExtinguish: false, special: false, gridCols: 1 },
    furnace: { slots: 5, slotType: 'furnace_fuel', fieldPrefix: 'fuelInstanceId', hasToggle: true, hasLightExtinguish: false, special: false, gridCols: 1 },
    fumarole: { slots: 0, slotType: 'fumarole', fieldPrefix: '', hasToggle: false, hasLightExtinguish: false, special: true, gridCols: 1 }, // Fumaroles have no slots (always-on heat source)
    lantern: { slots: 1, slotType: 'lantern_fuel', fieldPrefix: 'fuelInstanceId', hasToggle: true, hasLightExtinguish: false, special: false, gridCols: 1 },
    
    // Storage containers
    wooden_storage_box: { slots: 18, slotType: 'wooden_storage_box', fieldPrefix: 'slotInstanceId', hasToggle: false, hasLightExtinguish: false, gridCols: 6, special: false },
    player_corpse: { slots: 30, slotType: 'player_corpse', fieldPrefix: 'slotInstanceId', hasToggle: false, hasLightExtinguish: false, gridCols: 6, special: false },
    stash: { slots: 6, slotType: 'stash', fieldPrefix: 'slotInstanceId', hasToggle: false, hasLightExtinguish: false, gridCols: 6, special: false },
    rain_collector: { slots: 1, slotType: 'rain_collector', fieldPrefix: 'slot0InstanceId', hasToggle: false, hasLightExtinguish: false, special: true, gridCols: 1 },
    homestead_hearth: { slots: 20, slotType: 'homestead_hearth', fieldPrefix: 'slotInstanceId', hasToggle: false, hasLightExtinguish: false, gridCols: 6, special: false },
    broth_pot: { slots: 3, slotType: 'broth_pot', fieldPrefix: 'ingredientInstanceId', hasToggle: false, hasLightExtinguish: false, gridCols: 3, special: false }
} as const;

/**
 * Generate reducer name from container type and action
 */
export function getReducerName(containerType: ContainerType, action: string): string {
    const typeMap = {
        campfire: 'Campfire',
        furnace: 'Furnace',
        fumarole: 'Fumarole', // Fumaroles don't have reducers (always-on heat source)
        lantern: 'Lantern',
        wooden_storage_box: 'Box',
        player_corpse: 'Corpse',
        stash: 'Stash',
        rain_collector: 'RainCollector',
        homestead_hearth: 'Hearth', // Note: Reducer is quickMoveFromHearth, not quickMoveFromHomesteadHearth
        broth_pot: 'BrothPot'
    };
    
    const typeName = typeMap[containerType];
    
    // Handle special action patterns
    switch (action) {
        case 'quickMoveFrom': 
            return `quickMoveFrom${typeName}`;
        case 'toggle': 
            return containerType === 'lantern' ? `toggle${typeName}` : `toggle${typeName}Burning`;
        case 'extinguish': return `extinguish${typeName}`;
        default: return `${action}${typeName}`;
    }
}

/**
 * Get reducer names for drag-drop operations using consistent patterns
 */
export function getDragDropReducerNames(containerType: ContainerType) {
    const typeMap = {
        campfire: 'Campfire',
        furnace: 'Furnace',
        fumarole: 'Fumarole', // Fumaroles don't have drag-drop reducers (no slots)
        lantern: 'Lantern',
        wooden_storage_box: 'Box',
        player_corpse: 'Corpse',
        stash: 'Stash',
        rain_collector: 'RainCollector',
        homestead_hearth: 'Hearth', // Note: Reducer is moveItemToHearth, not moveItemToHomesteadHearth
        broth_pot: 'BrothPot'
    };
    
    const typeName = typeMap[containerType];
    
    // Determine if this is a fuel container (different naming pattern)
    const isFuelContainer = ['campfire', 'furnace', 'lantern'].includes(containerType);
    
    return {
        // World drop reducers (consistent across all containers)
        dropToWorld: `dropItemFrom${typeName}SlotToWorld`,
        splitDropToWorld: `splitAndDropItemFrom${typeName}SlotToWorld`,
        
        // Player <-> Container reducers - DIFFERENT PATTERNS
        moveFromPlayer: `moveItemTo${typeName}`,  // Consistent: moveItemToCampfire, moveItemToBox, moveItemToHearth, etc.
        moveToPlayer: isFuelContainer 
            ? `moveItemFrom${typeName}ToPlayerSlot`  // Fuel: moveItemFromCampfireToPlayerSlot
            : `moveItemFrom${typeName}`,             // Storage: moveItemFromBox, moveItemFromHearth
        
        // Within container moves (consistent)  
        moveWithin: `moveItemWithin${typeName}`,  // moveItemWithinCampfire, moveItemWithinBox, moveItemWithinHearth, etc.
        
        // Split operations
        splitFromPlayer: `splitStackInto${typeName}`,     // splitStackIntoCampfire, splitStackIntoBox, splitStackIntoHearth
        splitToPlayer: `splitStackFrom${typeName}`,       // splitStackFromCampfire, splitStackFromBox, splitStackFromHearth
        splitWithin: `splitStackWithin${typeName}`,       // splitStackWithinCampfire, splitStackWithinBox, splitStackWithinHearth
    };
}

/**
 * Get container type from slot type
 */
export function getContainerTypeFromSlotType(slotType: string): ContainerType | null {
    const mapping: Record<string, ContainerType> = {
        'campfire_fuel': 'campfire',
        'furnace_fuel': 'furnace',
        'lantern_fuel': 'lantern',
        'wooden_storage_box': 'wooden_storage_box',
        'player_corpse': 'player_corpse',
        'stash': 'stash',
        'rain_collector': 'rain_collector',
        'homestead_hearth': 'homestead_hearth',
        'broth_pot': 'broth_pot',
        'broth_pot_water_container': 'broth_pot', // Special slot type for water container
        'broth_pot_output': 'broth_pot' // Special slot type for output slot
    };
    
    return mapping[slotType] || null;
}

/**
 * Handle world drop operations using consistent patterns
 */
export function handleWorldDrop(
    connection: any,
    sourceInfo: DraggedItemInfo,
    setDropError: (error: string | null) => void
): boolean {
    if (!sourceInfo.sourceContainerType) return false;
    
    const containerType = getContainerTypeFromSlotType(sourceInfo.sourceContainerType);
    if (!containerType) return false;
    
    const reducers = getDragDropReducerNames(containerType);
    // Ensure quantityToDrop is always a number
    const quantityToDrop = Number(sourceInfo.splitQuantity ?? sourceInfo.item.instance.quantity);
    
    try {
        const rawEntityId = sourceInfo.sourceContainerEntityId;
        const rawSlotIndex = sourceInfo.sourceSlot.index;
        
        // Validate entity ID
        let entityIdNum: number | null = null;
        if (typeof rawEntityId === 'number') {
            entityIdNum = rawEntityId;
        } else if (typeof rawEntityId === 'bigint') {
            entityIdNum = Number(rawEntityId);
        } else if (typeof rawEntityId === 'string') {
            const parsed = parseInt(rawEntityId, 10);
            if (!isNaN(parsed)) entityIdNum = parsed;
        }
        
        // Validate slot index
        let slotIndexNum: number | null = null;
        if (typeof rawSlotIndex === 'number') {
            slotIndexNum = rawSlotIndex;
        } else if (typeof rawSlotIndex === 'string') {
            const parsed = parseInt(rawSlotIndex, 10);
            if (!isNaN(parsed)) slotIndexNum = parsed;
        } else if (typeof rawSlotIndex === 'bigint') {
            slotIndexNum = Number(rawSlotIndex);
        }
        
        if (entityIdNum === null || slotIndexNum === null || isNaN(quantityToDrop) || quantityToDrop <= 0) {
            return true; // Silently reject - invalid parameters
        }
        
        // Call the appropriate reducer
        if (sourceInfo.splitQuantity) {
            const reducerName = reducers.splitDropToWorld;
            if (connection.reducers[reducerName]) {
                connection.reducers[reducerName](entityIdNum, slotIndexNum, quantityToDrop);
            } else {
                // Silently reject - reducer not available
            }
        } else {
            const reducerName = reducers.dropToWorld;
            if (connection.reducers[reducerName]) {
                connection.reducers[reducerName](entityIdNum, slotIndexNum);
            } else {
                // Silently reject - reducer not available
            }
        }
        
        return true;
    } catch (error) {
        console.error(`[WorldDrop ${containerType}]`, error);
        return true; // Silently reject - error occurred
    }
}

/**
 * Handle container to player slot moves using consistent patterns
 */
export function handleContainerToPlayerMove(
    connection: any,
    sourceInfo: DraggedItemInfo,
    targetSlotType: string,
    targetSlotIndex: number,
    setDropError: (error: string | null) => void
): boolean {
    console.log(`[ContainerToPlayer] Source slot type: ${sourceInfo.sourceSlot.type}, parentId: ${sourceInfo.sourceSlot.parentId}`);
    const containerType = getContainerTypeFromSlotType(sourceInfo.sourceSlot.type);
    console.log(`[ContainerToPlayer] Resolved container type: ${containerType}`);
    if (!containerType) {
        console.warn(`[ContainerToPlayer] Could not resolve container type for slot type: ${sourceInfo.sourceSlot.type}`);
        return false;
    }
    
    const reducers = getDragDropReducerNames(containerType);
    
    try {
        const sourceEntityId = sourceInfo.sourceSlot.parentId ? Number(sourceInfo.sourceSlot.parentId) : null;
        const sourceSlotIndex = typeof sourceInfo.sourceSlot.index === 'number' 
            ? sourceInfo.sourceSlot.index 
            : parseInt(sourceInfo.sourceSlot.index.toString(), 10);
        
        if (sourceEntityId === null || isNaN(sourceSlotIndex)) {
            return true; // Silently reject - invalid source context
        }
        
        // Special handling for water container slot and output slot
        let reducerName: string;
        if (sourceInfo.sourceSlot.type === 'broth_pot_water_container') {
            reducerName = 'moveItemFromBrothPotWaterContainer';
        } else if (sourceInfo.sourceSlot.type === 'broth_pot_output') {
            reducerName = 'moveItemFromBrothPotOutput';
        } else {
            reducerName = reducers.moveToPlayer;
        }
        
        if (sourceInfo.sourceSlot.type === 'broth_pot_water_container') {
            // Water container slot reducer: (broth_pot_id, target_slot_type, target_slot_index)
            // Ensure targetSlotType is a string and targetSlotIndex is a number
            const targetTypeStr = String(targetSlotType);
            const targetIndexNum = typeof targetSlotIndex === 'number' ? targetSlotIndex : parseInt(String(targetSlotIndex), 10);
            
            // Check if reducer exists
            if (!connection.reducers[reducerName]) {
                console.error(`[ContainerToPlayer WaterContainer] Reducer ${reducerName} not found. Available reducers:`, Object.keys(connection.reducers || {}));
                return true; // Silently reject - reducer not found
            }
            
            console.log(`[ContainerToPlayer WaterContainer] Calling ${reducerName} with:`, {
                brothPotId: sourceEntityId,
                targetSlotType: targetTypeStr,
                targetSlotIndex: targetIndexNum,
                sourceSlotType: sourceInfo.sourceSlot.type,
                sourceSlotParentId: sourceInfo.sourceSlot.parentId
            });
            
            try {
                (connection.reducers as any)[reducerName](sourceEntityId, targetTypeStr, targetIndexNum);
            } catch (error: any) {
                console.error(`[ContainerToPlayer WaterContainer] Error calling reducer:`, error);
                return true; // Silently reject - reducer error
            }
        } else if (sourceInfo.sourceSlot.type === 'broth_pot_output') {
            // Output slot reducer: (broth_pot_id, target_slot_type, target_slot_index)
            const targetTypeStr = String(targetSlotType);
            const targetIndexNum = typeof targetSlotIndex === 'number' ? targetSlotIndex : parseInt(String(targetSlotIndex), 10);
            
            // Check if reducer exists
            if (!connection.reducers[reducerName]) {
                console.error(`[ContainerToPlayer Output] Reducer ${reducerName} not found. Available reducers:`, Object.keys(connection.reducers || {}));
                return true; // Silently reject - reducer not found
            }
            
            console.log(`[ContainerToPlayer Output] Calling ${reducerName} with:`, {
                brothPotId: sourceEntityId,
                targetSlotType: targetTypeStr,
                targetSlotIndex: targetIndexNum,
                sourceSlotType: sourceInfo.sourceSlot.type,
                sourceSlotParentId: sourceInfo.sourceSlot.parentId
            });
            
            try {
                (connection.reducers as any)[reducerName](sourceEntityId, targetTypeStr, targetIndexNum);
            } catch (error: any) {
                console.error(`[ContainerToPlayer Output] Error calling reducer:`, error);
                return true; // Silently reject - reducer error
            }
        } else {
            if (!connection.reducers[reducerName]) {
                console.error(`[ContainerToPlayer] Reducer ${reducerName} not found. Available reducers:`, Object.keys(connection.reducers || {}));
                return true; // Silently reject - reducer not found
            }
            connection.reducers[reducerName](sourceEntityId, sourceSlotIndex, targetSlotType, targetSlotIndex);
        }
        
        return true;
    } catch (error) {
        console.error(`[ContainerToPlayer ${containerType}]`, error);
        return true; // Silently reject - error occurred
    }
}

/**
 * Handle player to container moves using consistent patterns
 */
export function handlePlayerToContainerMove(
    connection: any,
    itemInstanceId: bigint,
    targetSlot: DragSourceSlotInfo,
    interactingWith: { type: string; id: number | bigint } | null,
    setDropError: (error: string | null) => void
): boolean {
    const containerType = getContainerTypeFromSlotType(targetSlot.type);
    if (!containerType) return false;
    
    const reducers = getDragDropReducerNames(containerType);
    
    try {
        const targetIndexNum = typeof targetSlot.index === 'number' 
            ? targetSlot.index 
            : parseInt(targetSlot.index.toString(), 10);
        
        if (isNaN(targetIndexNum)) {
            return true; // Silently reject - invalid slot
        }
        
        // Get container ID from targetSlot.parentId or interactingWith
        let containerIdNum: number | null = null;
        if (targetSlot.parentId) {
            containerIdNum = Number(targetSlot.parentId);
        } else if (interactingWith?.type === containerType) {
            containerIdNum = Number(interactingWith.id);
        }
        
        if (containerIdNum === null || isNaN(containerIdNum)) {
            return true; // Silently reject - context lost
        }
        
        // Special validation: Prevent placing items into broth pot output slot
        if (targetSlot.type === 'broth_pot_output') {
            playImmediateSound('error_jar_placement', 1.0);
            return true; // Silently reject - sound provides feedback
        }
        
        // Use appropriate reducer based on container type and slot type
        let reducerName: string;
        if (containerType === 'player_corpse') {
            reducerName = 'moveItemToCorpse';
        } else if (containerType === 'rain_collector') {
            reducerName = 'moveItemToRainCollector';
        } else if (targetSlot.type === 'broth_pot_water_container') {
            // Special handling for water container slot
            reducerName = 'moveItemToBrothPotWaterContainer';
        } else {
            // Use standard reducer pattern (includes broth_pot ingredient slots)
            reducerName = reducers.moveFromPlayer;
        }
        
        if (connection.reducers[reducerName]) {
            if (containerType === 'rain_collector') {
                connection.reducers[reducerName](containerIdNum, itemInstanceId, targetIndexNum);
            } else if (targetSlot.type === 'broth_pot_water_container') {
                // Water container slot reducer only takes broth_pot_id and item_instance_id
                connection.reducers[reducerName](containerIdNum, itemInstanceId);
            } else {
                // Standard pattern: (container_id, slot_index, item_instance_id)
                // This works for broth_pot ingredient slots too: moveItemToBrothPot(broth_pot_id, slot_index, item_instance_id)
                connection.reducers[reducerName](containerIdNum, targetIndexNum, itemInstanceId);
            }
        } else {
            // Silently reject - reducer not available
        }
        
        return true;
    } catch (error) {
        console.error(`[PlayerToContainer ${containerType}]`, error);
        return true; // Silently reject - error occurred
    }
}

/**
 * Handle within-container moves using consistent patterns
 */
export function handleWithinContainerMove(
    connection: any,
    sourceInfo: DraggedItemInfo,
    targetSlot: DragSourceSlotInfo,
    setDropError: (error: string | null) => void
): boolean {
    const containerType = getContainerTypeFromSlotType(sourceInfo.sourceSlot.type);
    if (!containerType) return false;
    
    const reducers = getDragDropReducerNames(containerType);
    
    try {
        const sourceSlotIndex = typeof sourceInfo.sourceSlot.index === 'number' 
            ? sourceInfo.sourceSlot.index 
            : parseInt(sourceInfo.sourceSlot.index.toString(), 10);
        const targetSlotIndex = typeof targetSlot.index === 'number' 
            ? targetSlot.index 
            : parseInt(targetSlot.index.toString(), 10);
        
        if (isNaN(sourceSlotIndex) || isNaN(targetSlotIndex)) {
            return true; // Silently reject - invalid slots
        }
        
        const sourceContainerId = sourceInfo.sourceSlot.parentId ? Number(sourceInfo.sourceSlot.parentId) : null;
        const targetContainerId = targetSlot.parentId ? Number(targetSlot.parentId) : null;
        
        if (sourceContainerId !== targetContainerId) {
            return true; // Silently reject - different containers
        }
        
        if (sourceContainerId === null) {
            return true; // Silently reject - context lost
        }
        
        // Use standardized moveWithin reducer for all containers
        const reducerName = reducers.moveWithin;
        
        if (connection.reducers[reducerName]) {
            connection.reducers[reducerName](sourceContainerId, sourceSlotIndex, targetSlotIndex);
        } else {
            // Silently reject - reducer not available
        }
        
        return true;
    } catch (error) {
        console.error(`[WithinContainer ${containerType}]`, error);
        return true; // Silently reject - error occurred
    }
}

/**
 * Get field names for container slots
 */
export function getSlotFieldNames(containerType: ContainerType): string[] {
    const config = CONTAINER_CONFIGS[containerType];
    
    // Special case for rain collector
    if (config.special) {
        return ['slot0InstanceId'];
    }
    
    // Generate field names from pattern
    return Array.from({ length: config.slots }, (_, i) => `${config.fieldPrefix}${i}`);
}

/**
 * Extract items from container entity using field patterns
 */
export function extractContainerItems(
    containerType: ContainerType,
    entity: ContainerEntity | null | undefined,
    inventoryItems: Map<string, InventoryItem>,
    itemDefinitions: Map<string, ItemDefinition>
): (PopulatedItem | null)[] {
    const config = CONTAINER_CONFIGS[containerType];
    const items: (PopulatedItem | null)[] = Array(config.slots).fill(null);
    
    if (!entity) return items;
    
    const fieldNames = getSlotFieldNames(containerType);
    
    fieldNames.forEach((fieldName, index) => {
        const instanceIdOpt = (entity as any)[fieldName] as bigint | null | undefined;
        
        if (instanceIdOpt) {
            const instanceIdStr = instanceIdOpt.toString();
            const foundInvItem = inventoryItems.get(instanceIdStr);
            
            if (foundInvItem) {
                const definition = itemDefinitions.get(foundInvItem.itemDefId.toString());
                if (definition) {
                    items[index] = { instance: foundInvItem, definition };
                }
            }
        }
    });
    
    return items;
}

/**
 * Create slot info for drag/drop operations
 */
export function createSlotInfo(
    containerType: ContainerType,
    index: number,
    containerId: number | bigint | null
): DragSourceSlotInfo {
    const config = CONTAINER_CONFIGS[containerType];
    return {
        type: config.slotType as SlotType,
        index,
        parentId: containerId ?? undefined
    };
}

/**
 * Generate container interaction callbacks with drag timing protection
 */
export function createContainerCallbacks(
    containerType: ContainerType,
    containerId: number | bigint | null,
    connection: any,
    lastDragCompleteTime: React.MutableRefObject<number>
) {
    const contextMenuHandler = (event: React.MouseEvent, itemInfo: PopulatedItem, slotIndex: number) => {
        event.preventDefault();
        
        // Block context menu for 200ms after drag completion  
        const timeSinceLastDrag = Date.now() - lastDragCompleteTime.current;
        if (timeSinceLastDrag < 200) return;
        
        if (!connection?.reducers || !itemInfo || containerId === null) return;
        
        const containerIdNum = typeof containerId === 'bigint' ? Number(containerId) : containerId;
        
        // Use consistent quickMoveFrom pattern for all containers
        const reducerName = getReducerName(containerType, 'quickMoveFrom');
        
        try {
            (connection.reducers as any)[reducerName](containerIdNum, slotIndex);
        } catch (e: any) {
            console.error(`[ContainerCallback ${containerType}->Inv]`, e);
        }
    };
    
    const toggleHandler = () => {
        if (!connection?.reducers || containerId === null) return;
        
        const reducerName = getReducerName(containerType, 'toggle');
        const containerIdNum = typeof containerId === 'bigint' ? Number(containerId) : containerId;
        
        try {
            (connection.reducers as any)[reducerName](containerIdNum);
        } catch (e: any) {
            console.error(`[ContainerCallback toggle ${containerType}]`, e);
        }
    };
    
    const autoRemoveFuelHandler = (event: React.MouseEvent, slotIndex: number) => {
        event.preventDefault();
        
        // Block context menu for 200ms after drag completion
        const timeSinceLastDrag = Date.now() - lastDragCompleteTime.current;
        if (timeSinceLastDrag < 200) return;
        
        if (!connection?.reducers || containerId === null) return;
        
        const reducerName = getReducerName(containerType, 'quickMoveFrom');
        const containerIdNum = typeof containerId === 'bigint' ? Number(containerId) : containerId;
        
        try {
            (connection.reducers as any)[reducerName](containerIdNum, slotIndex);
        } catch (e: any) {
            console.error(`[ContainerCallback quickMoveFrom ${containerType}]`, e);
        }
    };
    
    return {
        contextMenuHandler,
        toggleHandler,
        autoRemoveFuelHandler
    };
}

/**
 * Find the first available inventory slot
 */
function findFirstAvailableInventorySlot(connection: any): number {
    if (!connection?.db?.inventoryItem) return -1;
    
    const TOTAL_INVENTORY_SLOTS = 30; // Standard inventory size
    const playerIdentity = connection.identity; // Assuming connection has identity
    
    if (!playerIdentity) return -1;
    
    // Get all player items in inventory
    const playerItems = Array.from(connection.db.inventoryItem.iter()).filter((item: any) => 
        item.location.tag === 'Inventory' &&
        item.location.value.ownerId.isEqual(playerIdentity)
    );
    
    // Create a set of occupied slot indices
    const occupiedSlots = new Set(
        playerItems.map((item: any) => item.location.value.slotIndex)
    );
    
    // Find first available slot
    for (let i = 0; i < TOTAL_INVENTORY_SLOTS; i++) {
        if (!occupiedSlots.has(i)) {
            return i;
        }
    }
    
    return -1; // No available slots
}

/**
 * Check if container type has fuel slots
 */
export function isFuelContainer(containerType: ContainerType): boolean {
    return ['campfire', 'furnace', 'lantern'].includes(containerType);
}

/**
 * Check if container type has storage slots  
 */
export function isStorageContainer(containerType: ContainerType): boolean {
    return ['wooden_storage_box', 'player_corpse', 'stash', 'rain_collector', 'homestead_hearth', 'broth_pot'].includes(containerType);
}

/**
 * Get container configuration
 */
export function getContainerConfig(containerType: ContainerType) {
    return CONTAINER_CONFIGS[containerType];
}

/**
 * Helper to capitalize container type for display
 */
export function getContainerDisplayName(containerType: ContainerType): string {
    const nameMap = {
        campfire: 'CAMPFIRE',
        furnace: 'FURNACE',
        fumarole: 'FUMAROLE', // Volcanic heat source
        lantern: 'LANTERN',
        wooden_storage_box: 'WOODEN STORAGE BOX',
        player_corpse: 'Player Corpse',
        stash: 'STASH',
        rain_collector: 'RAIN COLLECTOR',
        homestead_hearth: "MATRON'S CHEST",
        broth_pot: 'BROTH POT'
    };
    
    return nameMap[containerType];
}

/**
 * Extract container entity from the appropriate map
 */
export function getContainerEntity(
    containerType: ContainerType,
    containerId: number | bigint | string | null,
    containers: {
        campfires?: Map<string, Campfire>;
        furnaces?: Map<string, Furnace>;
        fumaroles?: Map<string, Fumarole>;
        lanterns?: Map<string, Lantern>;
        woodenStorageBoxes?: Map<string, WoodenStorageBox>;
        playerCorpses?: Map<string, PlayerCorpse>;
        stashes?: Map<string, Stash>;
        rainCollectors?: Map<string, RainCollector>;
        homesteadHearths?: Map<string, HomesteadHearth>;
        brothPots?: Map<string, BrothPot>;
    }
): ContainerEntity | null {
    if (containerId === null) return null;
    
    const idStr = containerId.toString();
    
    switch (containerType) {
        case 'campfire': return containers.campfires?.get(idStr) || null;
        case 'furnace': return containers.furnaces?.get(idStr) || null;
        case 'fumarole': return containers.fumaroles?.get(idStr) || null;
        case 'lantern': return containers.lanterns?.get(idStr) || null;
        case 'wooden_storage_box': return containers.woodenStorageBoxes?.get(idStr) || null;
        case 'player_corpse': return containers.playerCorpses?.get(idStr) || null;
        case 'stash': return containers.stashes?.get(idStr) || null;
        case 'rain_collector': return containers.rainCollectors?.get(idStr) || null;
        case 'homestead_hearth': return containers.homesteadHearths?.get(idStr) || null;
        case 'broth_pot': return containers.brothPots?.get(idStr) || null;
        default: return null;
    }
}

/**
 * Handle split operations from player inventory/hotbar to containers
 */
export function handlePlayerToContainerSplit(
    connection: any,
    sourceInstanceId: bigint,
    quantityToSplit: number,
    targetSlot: DragSourceSlotInfo,
    setDropError: (error: string | null) => void
): boolean {
    const containerType = getContainerTypeFromSlotType(targetSlot.type);
    if (!containerType) return false;
    
    const reducers = getDragDropReducerNames(containerType);
    
    try {
        const targetSlotIndexNum = typeof targetSlot.index === 'number' 
            ? targetSlot.index 
            : parseInt(targetSlot.index.toString(), 10);
        
        if (isNaN(targetSlotIndexNum)) {
            return true; // Silently reject - invalid slot index
        }
        
        let targetContainerIdNum: number | null = null;
        if (targetSlot.parentId) {
            targetContainerIdNum = Number(targetSlot.parentId);
        }
        
        if (targetContainerIdNum === null || isNaN(targetContainerIdNum)) {
            return true; // Silently reject - invalid context
        }
        
        // Use appropriate reducer based on container type
        const reducerName = reducers.splitFromPlayer;
        if (connection.reducers[reducerName]) {
            // Different parameter orders for fuel vs storage containers
            // Note: homestead_hearth uses fuel container parameter order
            const isFuel = ['campfire', 'furnace', 'lantern', 'homestead_hearth'].includes(containerType);
            
            if (isFuel) {
                // Fuel containers and hearth: (sourceItemInstanceId, quantityToSplit, targetContainerId, targetSlotIndex)
                connection.reducers[reducerName](sourceInstanceId, quantityToSplit, targetContainerIdNum, targetSlotIndexNum);
            } else {
                // Storage containers: (containerId, targetSlotIndex, sourceItemInstanceId, quantityToSplit)
                connection.reducers[reducerName](targetContainerIdNum, targetSlotIndexNum, sourceInstanceId, quantityToSplit);
            }
        } else {
            // Silently reject - reducer not available
        }
        
        return true;
    } catch (error) {
        console.error(`[PlayerToContainerSplit ${containerType}]`, error);
        return true; // Silently reject - error occurred
    }
}

/**
 * Handle split operations from containers to player inventory/hotbar
 */
export function handleContainerToPlayerSplit(
    connection: any,
    sourceInfo: DraggedItemInfo,
    quantityToSplit: number,
    targetSlotType: string,
    targetSlotIndexNum: number,
    setDropError: (error: string | null) => void
): boolean {
    const containerType = getContainerTypeFromSlotType(sourceInfo.sourceSlot.type);
    if (!containerType) return false;
    
    const reducers = getDragDropReducerNames(containerType);
    
    try {
        // Convert source entity ID to number
        let sourceEntityId: number | null = null;
        const rawParentId = sourceInfo.sourceSlot.parentId;
        if (typeof rawParentId === 'number') {
            sourceEntityId = rawParentId;
        } else if (typeof rawParentId === 'bigint') {
            sourceEntityId = Number(rawParentId);
        } else if (typeof rawParentId === 'string') {
            const parsed = parseInt(rawParentId, 10);
            if (!isNaN(parsed)) sourceEntityId = parsed;
        }
        
        // Convert source slot index to number
        let sourceSlotIndex: number | null = null;
        const rawSlotIndex = sourceInfo.sourceSlot.index;
        if (typeof rawSlotIndex === 'number') {
            sourceSlotIndex = rawSlotIndex;
        } else if (typeof rawSlotIndex === 'string') {
            const parsed = parseInt(rawSlotIndex, 10);
            if (!isNaN(parsed)) sourceSlotIndex = parsed;
        } else if (typeof rawSlotIndex === 'bigint') {
            sourceSlotIndex = Number(rawSlotIndex);
        }
        
        // Ensure quantityToSplit is a number
        const quantityToSplitNum = Number(quantityToSplit);
        
        if (sourceEntityId === null || sourceSlotIndex === null || isNaN(quantityToSplitNum) || quantityToSplitNum <= 0) {
            return true; // Silently reject - invalid parameters
        }
        
        const reducerName = reducers.splitToPlayer;
        if (connection.reducers[reducerName]) {
            connection.reducers[reducerName](
                sourceEntityId,
                sourceSlotIndex,
                quantityToSplitNum,
                targetSlotType,
                targetSlotIndexNum
            );
        } else {
            // Silently reject - reducer not available
        }
        
        return true;
    } catch (error) {
        console.error(`[ContainerToPlayerSplit ${containerType}]`, error);
        return true; // Silently reject - error occurred
    }
}

/**
 * Handle split operations within the same container
 */
export function handleWithinContainerSplit(
    connection: any,
    sourceInfo: DraggedItemInfo,
    targetSlot: DragSourceSlotInfo,
    quantityToSplit: number,
    setDropError: (error: string | null) => void
): boolean {
    const containerType = getContainerTypeFromSlotType(sourceInfo.sourceSlot.type);
    if (!containerType) return false;
    
    const reducers = getDragDropReducerNames(containerType);
    
    try {
        // Convert source slot index to number
        let sourceSlotIndex: number | null = null;
        const rawSourceSlotIndex = sourceInfo.sourceSlot.index;
        if (typeof rawSourceSlotIndex === 'number') {
            sourceSlotIndex = rawSourceSlotIndex;
        } else if (typeof rawSourceSlotIndex === 'string') {
            const parsed = parseInt(rawSourceSlotIndex, 10);
            if (!isNaN(parsed)) sourceSlotIndex = parsed;
        } else if (typeof rawSourceSlotIndex === 'bigint') {
            sourceSlotIndex = Number(rawSourceSlotIndex);
        }
        
        // Convert target slot index to number
        let targetSlotIndex: number | null = null;
        const rawTargetSlotIndex = targetSlot.index;
        if (typeof rawTargetSlotIndex === 'number') {
            targetSlotIndex = rawTargetSlotIndex;
        } else if (typeof rawTargetSlotIndex === 'string') {
            const parsed = parseInt(rawTargetSlotIndex, 10);
            if (!isNaN(parsed)) targetSlotIndex = parsed;
        } else if (typeof rawTargetSlotIndex === 'bigint') {
            targetSlotIndex = Number(rawTargetSlotIndex);
        }
        
        if (sourceSlotIndex === null || targetSlotIndex === null) {
            return true; // Silently reject - invalid slots
        }
        
        // Convert container IDs to numbers
        let sourceContainerId: number | null = null;
        const rawSourceParentId = sourceInfo.sourceSlot.parentId;
        if (typeof rawSourceParentId === 'number') {
            sourceContainerId = rawSourceParentId;
        } else if (typeof rawSourceParentId === 'bigint') {
            sourceContainerId = Number(rawSourceParentId);
        } else if (typeof rawSourceParentId === 'string') {
            const parsed = parseInt(rawSourceParentId, 10);
            if (!isNaN(parsed)) sourceContainerId = parsed;
        }
        
        let targetContainerId: number | null = null;
        const rawTargetParentId = targetSlot.parentId;
        if (typeof rawTargetParentId === 'number') {
            targetContainerId = rawTargetParentId;
        } else if (typeof rawTargetParentId === 'bigint') {
            targetContainerId = Number(rawTargetParentId);
        } else if (typeof rawTargetParentId === 'string') {
            const parsed = parseInt(rawTargetParentId, 10);
            if (!isNaN(parsed)) targetContainerId = parsed;
        }
        
        if (sourceContainerId !== targetContainerId) {
            return true; // Silently reject - different containers
        }
        
        if (sourceContainerId === null) {
            return true; // Silently reject - context lost
        }
        
        // Ensure quantityToSplit is a number
        const quantityToSplitNum = Number(quantityToSplit);
        
        if (isNaN(quantityToSplitNum) || quantityToSplitNum <= 0) {
            return true; // Silently reject - invalid quantity
        }
        
        const reducerName = reducers.splitWithin;
        if (connection.reducers[reducerName]) {
            // Different parameter orders for fuel vs storage containers
            const isFuel = ['campfire', 'furnace', 'lantern'].includes(containerType);
            
            if (isFuel) {
                // Fuel containers: (id, sourceSlotIndex, quantityToSplit, targetSlotIndex)
                connection.reducers[reducerName](
                    sourceContainerId,
                    sourceSlotIndex,
                    quantityToSplitNum,
                    targetSlotIndex
                );
            } else {
                // Storage containers: (id, sourceSlotIndex, targetSlotIndex, quantityToSplit)
                connection.reducers[reducerName](
                    sourceContainerId,
                    sourceSlotIndex,
                    targetSlotIndex,
                    quantityToSplitNum
                );
            }
        } else {
            // Silently reject - reducer not available
        }
        
        return true;
    } catch (error) {
        console.error(`[WithinContainerSplit ${containerType}]`, error);
        return true; // Silently reject - error occurred
    }
} 