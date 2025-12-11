/**
 * Container Progress Utilities
 * 
 * Calculates cooking/fertilizing progress for container slots
 * to display visual progress overlays similar to weapon cooldowns
 */

import { Campfire, Furnace, Barbecue, WoodenStorageBox, CookingProgress, InventoryItem } from '../generated';
import { ContainerType, ContainerEntity } from './containerUtils';

const COMPOST_CONVERSION_TIME_SECS = 300; // 5 minutes (matching server constant)

/**
 * Calculate cooking progress for a campfire/furnace slot
 * Returns progress as 0.0 to 1.0 (0% to 100%)
 */
export function getCookingProgress(
    containerType: ContainerType,
    containerEntity: ContainerEntity | null | undefined,
    slotIndex: number
): number {
    if (!containerEntity) return 0;
    
    if (containerType === 'campfire') {
        const campfire = containerEntity as Campfire;
        const progressField = `slot${slotIndex}CookingProgress` as keyof Campfire;
        const cookingProgress = campfire[progressField] as CookingProgress | undefined;
        
        if (cookingProgress && cookingProgress.targetCookTimeSecs > 0) {
            return Math.min(1.0, cookingProgress.currentCookTimeSecs / cookingProgress.targetCookTimeSecs);
        }
    } else if (containerType === 'furnace') {
        const furnace = containerEntity as Furnace;
        const progressField = `slot${slotIndex}CookingProgress` as keyof Furnace;
        const cookingProgress = furnace[progressField] as CookingProgress | undefined;
        
        if (cookingProgress && cookingProgress.targetCookTimeSecs > 0) {
            return Math.min(1.0, cookingProgress.currentCookTimeSecs / cookingProgress.targetCookTimeSecs);
        }
    } else if (containerType === 'barbecue') {
        const barbecue = containerEntity as Barbecue;
        const progressField = `slot${slotIndex}CookingProgress` as keyof Barbecue;
        const cookingProgress = barbecue[progressField] as CookingProgress | undefined;
        
        if (cookingProgress && cookingProgress.targetCookTimeSecs > 0) {
            return Math.min(1.0, cookingProgress.currentCookTimeSecs / cookingProgress.targetCookTimeSecs);
        }
    }
    
    return 0;
}

/**
 * Calculate fertilizing progress for a compost box slot
 * Returns progress as 0.0 to 1.0 (0% to 100%)
 */
export function getCompostProgress(
    item: InventoryItem | null | undefined,
    currentTimeMs: number
): number {
    if (!item || !item.itemData) return 0;
    
    try {
        const dataMap = JSON.parse(item.itemData);
        const placedAtMicros = dataMap?.compost_placed_at;
        
        if (!placedAtMicros || typeof placedAtMicros !== 'number') return 0;
        
        // Convert microseconds to milliseconds
        const placedAtMs = placedAtMicros / 1000;
        const elapsedSecs = (currentTimeMs - placedAtMs) / 1000;
        
        // Progress is elapsed time / conversion time (5 minutes)
        return Math.min(1.0, Math.max(0, elapsedSecs / COMPOST_CONVERSION_TIME_SECS));
    } catch (e) {
        // Invalid JSON or missing data
        return 0;
    }
}

/**
 * Get progress for all slots in a container
 * Returns a map of slot index -> progress (0.0 to 1.0)
 */
export function getAllSlotProgress(
    containerType: ContainerType,
    containerEntity: ContainerEntity | null | undefined,
    items: (any | null)[],
    currentTimeMs: number
): Map<number, number> {
    const progressMap = new Map<number, number>();
    
    if (!containerEntity) return progressMap;
    
    // For campfire/furnace/barbecue, use cooking progress
    if (containerType === 'campfire' || containerType === 'furnace' || containerType === 'barbecue') {
        items.forEach((item, index) => {
            if (item) { // Only calculate if there's an item in the slot
                const progress = getCookingProgress(containerType, containerEntity, index);
                if (progress > 0) {
                    progressMap.set(index, progress);
                }
            }
        });
    }
    // For compost boxes, use fertilizing progress
    else if (containerType === 'wooden_storage_box') {
        const storageBox = containerEntity as WoodenStorageBox;
        if (storageBox.boxType === 3) { // BOX_TYPE_COMPOST = 3
            items.forEach((item, index) => {
                if (item?.instance) {
                    const progress = getCompostProgress(item.instance, currentTimeMs);
                    if (progress > 0 && progress < 1.0) { // Only show if actively composting
                        progressMap.set(index, progress);
                    }
                }
            });
        }
    }
    
    return progressMap;
}

