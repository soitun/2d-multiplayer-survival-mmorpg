import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { InteractionConfig, InteractableTarget, INTERACTION_CONFIGS, hasSecondaryHoldAction, getSecondaryHoldDuration } from '../types/interactions';
import { InventoryItem, Campfire, Lantern } from '../generated/types';
import { DbConnection } from '../generated';
import { Identity } from 'spacetimedb';

// Define the shape of the interaction target
export type InteractionTarget = { 
    type: string; 
    id: number | bigint;
    data?: {
        campfireId?: number;
        brothPotId?: number;
        isBrothPotEmpty?: boolean;
        [key: string]: any;
    };
} | null;

// Define the return type of the hook
interface InteractionManager {
    interactingWith: InteractionTarget;
    handleSetInteractingWith: (target: InteractionTarget) => void;
    // clearInteractionTarget: () => void; // Combine into handleSetInteractingWith(null)
}

// Container types that support safe zone exclusivity
const CONTAINER_TYPES_WITH_EXCLUSIVITY = ['campfire', 'furnace', 'barbecue', 'rain_collector', 'wooden_storage_box'];

interface UseInteractionManagerProps {
    connection: DbConnection | null;
    target: InteractableTarget | null;
    inventoryItems: Map<string, InventoryItem>;
    campfires: Map<string, Campfire>;
    lanterns: Map<string, Lantern>;
}

interface InteractionManagerResult {
    config: InteractionConfig | null;
    hasSecondaryAction: boolean;
    secondaryHoldDuration: number;
    handleTapAction: () => void;
    handleHoldAction: () => void;
    handleSecondaryHoldAction?: () => void;
}

/**
 * Helper to call open container reducer based on container type
 * These reducers support safe zone container exclusivity
 */
function callOpenContainerReducer(connection: DbConnection, type: string, id: number | bigint) {
    const reducers = connection?.reducers as any;
    if (!reducers) return;
    
    const numericId = typeof id === 'bigint' ? Number(id) : id;
    
    switch (type) {
        case 'campfire':
            reducers.openCampfireContainer?.(numericId);
            break;
        case 'furnace':
            reducers.openFurnaceContainer?.(numericId);
            break;
        case 'barbecue':
            reducers.openBarbecueContainer?.(numericId);
            break;
        case 'rain_collector':
            reducers.openRainCollectorContainer?.(numericId);
            break;
        case 'wooden_storage_box':
            reducers.openStorageBoxContainer?.(numericId);
            break;
    }
}

/**
 * Helper to call close container reducer based on container type
 */
function callCloseContainerReducer(connection: DbConnection, type: string, id: number | bigint) {
    const reducers = connection?.reducers as any;
    if (!reducers) return;
    
    const numericId = typeof id === 'bigint' ? Number(id) : id;
    
    switch (type) {
        case 'campfire':
            reducers.closeCampfireContainer?.(numericId);
            break;
        case 'furnace':
            reducers.closeFurnaceContainer?.(numericId);
            break;
        case 'barbecue':
            reducers.closeBarbecueContainer?.(numericId);
            break;
        case 'rain_collector':
            reducers.closeRainCollectorContainer?.(numericId);
            break;
        case 'wooden_storage_box':
            reducers.closeStorageBoxContainer?.(numericId);
            break;
    }
}

export const useInteractionManager = (connection?: DbConnection | null): InteractionManager => {
    const [interactingWith, setInteractingWith] = useState<InteractionTarget>(null);
    const previousTargetRef = useRef<InteractionTarget>(null);

    // Combine setting and clearing into one handler
    const handleSetInteractingWith = useCallback((target: InteractionTarget) => {
        console.log("[useInteractionManager] Setting interaction target:", target);
        setInteractingWith(target);
    }, []);

    // Handle open/close container reducers for safe zone exclusivity
    useEffect(() => {
        const previousTarget = previousTargetRef.current;
        const currentTarget = interactingWith;
        
        // Close previous container if it supported exclusivity
        if (previousTarget && CONTAINER_TYPES_WITH_EXCLUSIVITY.includes(previousTarget.type) && connection) {
            console.log(`[useInteractionManager] Closing ${previousTarget.type} container ${previousTarget.id}`);
            callCloseContainerReducer(connection, previousTarget.type, previousTarget.id);
        }
        
        // Open new container if it supports exclusivity
        if (currentTarget && CONTAINER_TYPES_WITH_EXCLUSIVITY.includes(currentTarget.type) && connection) {
            console.log(`[useInteractionManager] Opening ${currentTarget.type} container ${currentTarget.id}`);
            callOpenContainerReducer(connection, currentTarget.type, currentTarget.id);
        }
        
        // Update previous target ref
        previousTargetRef.current = currentTarget;
    }, [interactingWith, connection]);

    // Cleanup on unmount - close any open container
    useEffect(() => {
        return () => {
            const target = previousTargetRef.current;
            if (target && CONTAINER_TYPES_WITH_EXCLUSIVITY.includes(target.type) && connection) {
                console.log(`[useInteractionManager] Unmount cleanup - closing ${target.type} container ${target.id}`);
                callCloseContainerReducer(connection, target.type, target.id);
            }
        };
    }, [connection]);

    // Optional: Clear function if needed separately, but handleSetInteractingWith(null) works
    // const clearInteractionTarget = useCallback(() => {
    //     console.log("[useInteractionManager] Clearing interaction target.");
    //     setInteractingWith(null);
    // }, []);

    return {
        interactingWith,
        handleSetInteractingWith,
        // clearInteractionTarget,
    };
};

export function useTargetInteractionManager({
    connection,
    target,
    inventoryItems,
    campfires,
    lanterns
}: UseInteractionManagerProps): InteractionManagerResult {

    // Get configuration for the current target
    const config = useMemo(() => {
        return target ? INTERACTION_CONFIGS[target.type] : null;
    }, [target]);

    // Check if target has secondary hold action
    const hasSecondaryAction = useMemo(() => {
        return target ? hasSecondaryHoldAction(target) : false;
    }, [target]);

    // Get secondary hold duration
    const secondaryHoldDuration = useMemo(() => {
        return target ? getSecondaryHoldDuration(target) : 250;
    }, [target]);

    // Handle tap actions (E key tap)
    const handleTapAction = useCallback(() => {
        if (!connection || !target || !config) return;

        switch (target.type) {
            case 'harvestable_resource':
                connection.reducers.interactWithHarvestableResource({ resourceId: BigInt(target.id as bigint) });
                break;
            case 'dropped_item':
                connection.reducers.pickupDroppedItem({ droppedItemId: BigInt(target.id as bigint) });
                break;
            case 'campfire':
                // Open campfire interface - could trigger UI modal opening
                console.log(`[InteractionManager] Opening campfire interface for ID: ${target.id}`);
                // In a real implementation, this might dispatch an action to open UI
                break;
            case 'barbecue':
                // Open barbecue interface - same as campfire
                console.log(`[InteractionManager] Opening barbecue interface for ID: ${target.id}`);
                connection.reducers.interactWithBarbecue({ barbecueId: Number(target.id) });
                break;
            case 'lantern':
                // Interact with lantern to open interface
                connection.reducers.interactWithLantern({ lanternId: Number(target.id) });
                break;
            case 'box':
                console.log(`[InteractionManager] Opening storage box interface for ID: ${target.id}`);
                break;
            case 'stash':
                console.log(`[InteractionManager] Opening stash interface for ID: ${target.id}`);
                break;
            case 'corpse':
                console.log(`[InteractionManager] Opening corpse interface for ID: ${target.id}`);
                break;
            case 'sleeping_bag':
                console.log(`[InteractionManager] Opening sleeping bag interface for ID: ${target.id}`);
                break;
            case 'broth_pot':
                console.log(`[InteractionManager] Opening broth pot interface for ID: ${target.id}`);
                break;
            case 'fumarole':
                console.log(`[InteractionManager] Opening fumarole interface for ID: ${target.id}`);
                break;
            case 'knocked_out_player':
                // This should be handled by hold action, not tap
                console.log(`[InteractionManager] Knocked out player requires hold action, not tap`);
                break;
            case 'water':
                // This should be handled by hold action, not tap
                console.log(`[InteractionManager] Water drinking requires hold action, not tap`);
                break;
            case 'door':
                // Toggle door open/close state
                connection.reducers.interactDoor({ doorId: BigInt(target.id as bigint) });
                break;
            default:
                console.warn(`[InteractionManager] Unhandled tap action for target type: ${target.type}`);
        }
    }, [connection, target, config]);

    // Handle hold actions (E key hold)
    const handleHoldAction = useCallback(() => {
        if (!connection || !target || !config) return;

        switch (target.type) {
            case 'knocked_out_player':
                connection.reducers.reviveKnockedOutPlayer({ targetPlayerId: Identity.fromString(String(target.id)) });
                break;
            case 'water':
                connection.reducers.drinkWater({});
                break;
            default:
                console.warn(`[InteractionManager] Unhandled hold action for target type: ${target.type}`);
        }
    }, [connection, target, config]);

    // Handle secondary hold actions (for dual-behavior targets)
    const handleSecondaryHoldAction = useCallback(() => {
        if (!connection || !target) return;

        switch (target.type) {
            case 'box':
                // Pickup empty box
                if (target.data?.isEmpty) {
                    connection.reducers.pickupStorageBox({ boxId: Number(target.id) });
                }
                break;
            case 'lantern':
                // Pickup empty lantern or toggle burning state
                if (target.data?.isEmpty) {
                    connection.reducers.pickupLantern({ lanternId: Number(target.id) });
                } else {
                    // Toggle burning state for non-empty lanterns
                    connection.reducers.toggleLantern({ lanternId: Number(target.id) });
                }
                break;
            case 'campfire':
                // Toggle burning state
                const campfire = campfires?.get(String(target.id));
                if (campfire) {
                    connection.reducers.toggleCampfireBurning({ campfireId: Number(target.id) });
                }
                break;
            case 'barbecue':
                // Toggle burning state
                connection.reducers.toggleBarbecueBurning({ barbecueId: Number(target.id) });
                break;
            case 'stash':
                // Toggle visibility
                connection.reducers.toggleStashVisibility({ stashId: Number(target.id) });
                break;
            case 'broth_pot':
                // Pickup empty broth pot
                if (target.data?.isEmpty) {
                    connection.reducers.pickupBrothPot({ brothPotId: Number(target.id) });
                }
                break;
            case 'door':
                // Pickup door (owner only - server validates)
                connection.reducers.pickupDoor({ doorId: BigInt(target.id as bigint) });
                break;
            default:
                console.warn(`[InteractionManager] Unhandled secondary hold action for target type: ${target.type}`);
        }
    }, [connection, target, campfires, lanterns]);

    return {
        config,
        hasSecondaryAction,
        secondaryHoldDuration,
        handleTapAction,
        handleHoldAction,
        handleSecondaryHoldAction: hasSecondaryAction ? handleSecondaryHoldAction : undefined
    };
} 