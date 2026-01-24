/**
 * Container Progress Utilities
 * 
 * Calculates cooking/fertilizing progress for container slots
 * to display visual progress overlays similar to weapon cooldowns
 */

import { Campfire, Furnace, Barbecue, WoodenStorageBox, Lantern, CookingProgress, InventoryItem } from '../generated';
import { ContainerType, ContainerEntity } from './containerUtils';

const COMPOST_CONVERSION_TIME_SECS = 300; // 5 minutes (matching server constant)
const FISH_TRAP_CONVERSION_TIME_SECS = 600; // 10 minutes (matching server constant)

// === LANTERN/WARD BURN DURATIONS (must match server constants) ===
// Rebalanced to make fuel a meaningful ongoing cost for complete immunity protection
// Option A (Moderate): Creates a "tax" on safety that scales with benefit
const LANTERN_BURN_DURATION_SECS = 120.0;           // Lantern: 2 min per Tallow (unchanged)
const ANCESTRAL_WARD_BURN_DURATION_SECS = 150.0;    // Ancestral Ward: 2.5 min per Tallow (4/night)
const SIGNAL_DISRUPTOR_BURN_DURATION_SECS = 120.0;  // Signal Disruptor: 2 min per Battery (5/night)
const MEMORY_BEACON_BURN_DURATION_SECS = 90.0;      // Memory Beacon: 1.5 min per Battery (7/night)

// Lantern type constants (must match server)
const LANTERN_TYPE_LANTERN = 0;
const LANTERN_TYPE_ANCESTRAL_WARD = 1;
const LANTERN_TYPE_SIGNAL_DISRUPTOR = 2;
const LANTERN_TYPE_MEMORY_BEACON = 3;

/**
 * Get burn duration for a lantern type
 */
function getBurnDurationForLanternType(lanternType: number): number {
    switch (lanternType) {
        case LANTERN_TYPE_ANCESTRAL_WARD: return ANCESTRAL_WARD_BURN_DURATION_SECS;
        case LANTERN_TYPE_SIGNAL_DISRUPTOR: return SIGNAL_DISRUPTOR_BURN_DURATION_SECS;
        case LANTERN_TYPE_MEMORY_BEACON: return MEMORY_BEACON_BURN_DURATION_SECS;
        case LANTERN_TYPE_LANTERN:
        default: return LANTERN_BURN_DURATION_SECS;
    }
}

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
 * Calculate fishing progress for a fish trap slot
 * Returns progress as 0.0 to 1.0 (0% to 100%)
 */
export function getFishTrapProgress(
    item: InventoryItem | null | undefined,
    currentTimeMs: number
): number {
    if (!item || !item.itemData) return 0;
    
    try {
        const dataMap = JSON.parse(item.itemData);
        const placedAtMicros = dataMap?.fish_trap_placed_at;
        
        if (!placedAtMicros || typeof placedAtMicros !== 'number') return 0;
        
        // Convert microseconds to milliseconds
        const placedAtMs = placedAtMicros / 1000;
        const elapsedSecs = (currentTimeMs - placedAtMs) / 1000;
        
        // Progress is elapsed time / conversion time (10 minutes)
        return Math.min(1.0, Math.max(0, elapsedSecs / FISH_TRAP_CONVERSION_TIME_SECS));
    } catch (e) {
        // Invalid JSON or missing data
        return 0;
    }
}

/**
 * Calculate fuel burn progress for a lantern/ward
 * Returns progress as 0.0 to 1.0 (0% to 100% remaining)
 * Progress goes DOWN as fuel is consumed (overlay fills up)
 */
export function getLanternFuelProgress(
    lantern: Lantern | null | undefined
): number {
    if (!lantern || !lantern.isBurning) return 0;
    
    const remainingTime = lantern.remainingFuelBurnTimeSecs;
    if (remainingTime === null || remainingTime === undefined || remainingTime <= 0) return 0;
    
    const totalBurnTime = getBurnDurationForLanternType(lantern.lanternType);
    
    // Progress is how much has been consumed (for overlay that fills up)
    // 0.0 = just started (full fuel), 1.0 = almost empty
    const consumed = 1.0 - (remainingTime / totalBurnTime);
    return Math.min(1.0, Math.max(0, consumed));
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
        } else if (storageBox.boxType === 10) { // BOX_TYPE_FISH_TRAP = 10
            items.forEach((item, index) => {
                if (item?.instance) {
                    const progress = getFishTrapProgress(item.instance, currentTimeMs);
                    if (progress > 0 && progress < 1.0) { // Only show if actively fishing
                        progressMap.set(index, progress);
                    }
                }
            });
        }
    }
    // For lanterns/wards, use fuel burn progress on fuel slot (slot 0)
    // Note: We show progress based on remainingFuelBurnTimeSecs, NOT items in slot
    // because fuel is "consumed" (item deleted) when burn time starts
    else if (containerType === 'lantern') {
        const lantern = containerEntity as Lantern;
        if (lantern.isBurning) { // Show if burning, regardless of slot contents
            const progress = getLanternFuelProgress(lantern);
            if (progress > 0 && progress < 1.0) { // Only show if actively burning
                progressMap.set(0, progress);
            }
        }
    }
    
    return progressMap;
}

