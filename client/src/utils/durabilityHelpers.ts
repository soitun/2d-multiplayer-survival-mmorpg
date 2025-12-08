/**
 * Durability Helper Functions
 * 
 * Client-side utilities for handling item durability display and calculations.
 * Items with durability include weapons, tools, ranged weapons, torches, flashlights, and food.
 */

import { InventoryItem, ItemDefinition } from '../generated';

/**
 * Maximum durability value for all items (100%)
 */
export const MAX_DURABILITY = 100.0;

/**
 * Food spoilage tick interval in seconds (matches server: 300 seconds = 5 minutes)
 */
const FOOD_SPOILAGE_TICK_INTERVAL_SECS = 300;

/**
 * Minimum food spoilage duration in hours (matches server: 6 hours)
 */
const FOOD_MIN_SPOILAGE_HOURS = 6.0;

/**
 * Maximum food spoilage duration in hours (matches server: 48 hours)
 */
const FOOD_MAX_SPOILAGE_HOURS = 48.0;

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
 * Check if an item is a food item (can spoil)
 * Returns true if the item has consumable stats (hunger/thirst)
 * This matches the server-side logic - smart detection without hardcoded names
 */
export function isFoodItem(itemDef: ItemDefinition): boolean {
    // Food items have consumable stats (hunger or thirst)
    // This excludes non-food consumables like bandages, anti-venom, etc.
    return itemDef.consumableHungerSatiated !== null && itemDef.consumableHungerSatiated !== undefined ||
           itemDef.consumableThirstQuenched !== null && itemDef.consumableThirstQuenched !== undefined;
}

/**
 * Check if an item definition supports the durability system
 * Returns true for weapons, tools, ranged weapons, torches, flashlights, and food items
 */
export function hasDurabilitySystem(itemDef: ItemDefinition): boolean {
    const categoryTag = itemDef.category.tag;
    
    // Check category
    if (categoryTag === 'Weapon' || categoryTag === 'Tool' || categoryTag === 'RangedWeapon') {
        return true;
    }
    
    // Check for food items (Consumable category with hunger/thirst)
    if (categoryTag === 'Consumable' && isFoodItem(itemDef)) {
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
 * Check if food is spoiled (durability <= 0)
 * Returns false if no durability data exists (treated as fresh)
 */
export function isFoodSpoiled(item: InventoryItem, itemDef: ItemDefinition): boolean {
    if (!isFoodItem(itemDef)) {
        return false;
    }
    return isItemBroken(item);
}

/**
 * Calculate the spoilage duration in hours for a food item based on its properties
 * Matches server-side logic: cooked foods last longer, raw foods spoil faster
 */
function calculateFoodSpoilageHours(itemDef: ItemDefinition): number {
    let baseHours = 12.0; // Base 12 hours
    
    // Check if food is cooked
    const isCooked = itemDef.cookedItemDefName !== null && itemDef.cookedItemDefName !== undefined ||
                     itemDef.name.startsWith('Cooked') ||
                     itemDef.name.startsWith('Roasted') ||
                     itemDef.name.startsWith('Toasted') ||
                     itemDef.name.includes('Stew') ||
                     itemDef.name.includes('Soup');
    
    if (isCooked) {
        baseHours *= 2.0; // Cooked foods last 2x longer
    }
    
    // Check if food is raw/perishable
    const isRaw = itemDef.name.startsWith('Raw') ||
                  itemDef.name.includes('Fresh');
    
    if (isRaw) {
        baseHours *= 0.7; // Raw foods spoil faster
    }
    
    // Adjust based on nutrition value
    const nutritionValue = (itemDef.consumableHungerSatiated ?? 0) +
                           (itemDef.consumableThirstQuenched ?? 0) +
                           (itemDef.consumableHealthGain ?? 0);
    
    // Nutrition bonus: +0.1 hours per 10 nutrition points (max +2 hours)
    const nutritionBonus = Math.min(nutritionValue / 10.0 * 0.1, 2.0);
    baseHours += nutritionBonus;
    
    // Clamp to min/max range
    return Math.max(FOOD_MIN_SPOILAGE_HOURS, Math.min(FOOD_MAX_SPOILAGE_HOURS, baseHours));
}

/**
 * Calculate approximate time remaining until food spoils (in hours)
 * Returns null if food is already spoiled or not a food item
 */
export function calculateFoodSpoilageTimeRemaining(item: InventoryItem, itemDef: ItemDefinition): number | null {
    if (!isFoodItem(itemDef)) {
        return null;
    }
    
    const durability = getDurability(item);
    
    // If no durability data, treat as fresh (full time remaining)
    if (durability === null) {
        return calculateFoodSpoilageHours(itemDef);
    }
    
    // If already spoiled, return null
    if (durability <= 0) {
        return null;
    }
    
    // Calculate spoilage duration for this food type
    const totalSpoilageHours = calculateFoodSpoilageHours(itemDef);
    const durabilityPercentage = durability / MAX_DURABILITY;
    
    // Time remaining = total time * durability percentage
    return totalSpoilageHours * durabilityPercentage;
}

/**
 * Format time remaining until spoilage for display
 * Returns formatted string like "12h 30m" or "2d 5h" or "Spoiled"
 */
export function formatFoodSpoilageTimeRemaining(item: InventoryItem, itemDef: ItemDefinition): string {
    if (!isFoodItem(itemDef)) {
        return '';
    }
    
    const timeRemainingHours = calculateFoodSpoilageTimeRemaining(item, itemDef);
    
    if (timeRemainingHours === null) {
        return 'Spoiled';
    }
    
    if (timeRemainingHours < 1) {
        const minutes = Math.round(timeRemainingHours * 60);
        return `${minutes}m`;
    } else if (timeRemainingHours < 24) {
        const wholeHours = Math.floor(timeRemainingHours);
        const minutes = Math.round((timeRemainingHours - wholeHours) * 60);
        if (minutes > 0) {
            return `${wholeHours}h ${minutes}m`;
        }
        return `${wholeHours}h`;
    } else {
        const days = Math.floor(timeRemainingHours / 24);
        const remainingHours = Math.floor(timeRemainingHours % 24);
        if (remainingHours > 0) {
            return `${days}d ${remainingHours}h`;
        }
        return `${days}d`;
    }
}

/**
 * Get the color for durability display based on percentage
 * Green (high) -> Yellow (medium) -> Red (low/broken)
 * For food items, uses slightly different colors to indicate spoilage
 */
export function getDurabilityColor(item: InventoryItem, itemDef?: ItemDefinition): string {
    const percentage = getDurabilityPercentage(item);
    const isFood = itemDef ? isFoodItem(itemDef) : false;
    
    if (percentage <= 0) {
        // Gray for broken/spoiled
        return isFood ? 'rgba(139, 69, 19, 0.8)' : 'rgba(128, 128, 128, 0.8)'; // Brownish-gray for spoiled food
    }
    
    if (percentage < 0.25) {
        // Red for low/spoiling soon
        return isFood ? 'rgba(255, 100, 100, 0.8)' : 'rgba(255, 80, 80, 0.8)'; // Slightly brighter red for food
    }
    
    if (percentage < 0.5) {
        // Yellow/orange for medium
        return 'rgba(255, 200, 50, 0.8)';
    }
    
    return 'rgba(50, 205, 50, 0.8)'; // Green for good
}

