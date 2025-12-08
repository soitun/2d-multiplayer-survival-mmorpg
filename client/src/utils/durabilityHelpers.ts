/**
 * Durability Helper Functions
 * 
 * Client-side utilities for handling item durability display and calculations.
 * Items with durability include weapons, tools, ranged weapons, torches, and flashlights.
 */

import { InventoryItem, ItemDefinition } from '../generated';

/**
 * Maximum durability value for all items (100%)
 */
export const MAX_DURABILITY = 100.0;

/**
 * Get the current durability value from an item's itemData JSON field
 * Returns null if no durability data exists (item hasn't been used yet - treated as full)
 */
export function getDurability(item: InventoryItem): number | null {
    if (!item.itemData) {
        return null;
    }

    try {
        const data = JSON.parse(item.itemData);
        const durability = data.durability;
        return typeof durability === 'number' ? durability : null;
    } catch (error) {
        console.error('Failed to parse item data for durability:', error);
        return null;
    }
}

/**
 * Check if an item definition supports the durability system
 * Returns true for weapons, tools, ranged weapons, torches, and flashlights
 */
export function hasDurabilitySystem(itemDef: ItemDefinition): boolean {
    const categoryTag = itemDef.category.tag;
    
    // Check category
    if (categoryTag === 'Weapon' || categoryTag === 'Tool' || categoryTag === 'RangedWeapon') {
        return true;
    }
    
    // Check special items by name
    if (itemDef.name === 'Torch' || itemDef.name === 'Flashlight') {
        return true;
    }
    
    return false;
}

/**
 * Get durability as a percentage (0.0 to 1.0)
 * Returns 1.0 if no durability data exists (full durability for new items)
 */
export function getDurabilityPercentage(item: InventoryItem): number {
    const durability = getDurability(item);
    
    // If no durability data, treat as full (100%)
    if (durability === null) {
        return 1.0;
    }
    
    return Math.min(1.0, Math.max(0.0, durability / MAX_DURABILITY));
}

/**
 * Check if an item is broken (durability <= 0)
 * Returns false if no durability data exists (treated as full durability)
 */
export function isItemBroken(item: InventoryItem): boolean {
    const durability = getDurability(item);
    
    // If no durability data, item is not broken
    if (durability === null) {
        return false;
    }
    
    return durability <= 0;
}

/**
 * Format durability for display (e.g., "85%" or "Full" for new items)
 */
export function formatDurability(item: InventoryItem): string {
    const durability = getDurability(item);
    
    if (durability === null) {
        return 'Full';
    }
    
    if (durability <= 0) {
        return 'Broken';
    }
    
    return `${Math.round(durability)}%`;
}

/**
 * Get the color for durability display based on percentage
 * Green (high) -> Yellow (medium) -> Red (low/broken)
 */
export function getDurabilityColor(item: InventoryItem): string {
    const percentage = getDurabilityPercentage(item);
    
    if (percentage <= 0) {
        return 'rgba(128, 128, 128, 0.8)'; // Gray for broken
    }
    
    if (percentage < 0.25) {
        return 'rgba(255, 80, 80, 0.8)'; // Red for low
    }
    
    if (percentage < 0.5) {
        return 'rgba(255, 200, 50, 0.8)'; // Yellow/orange for medium
    }
    
    return 'rgba(50, 205, 50, 0.8)'; // Green for good
}

