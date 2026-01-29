/**
 * Durability Helper Functions
 * 
 * Client-side utilities for handling item durability display and calculations.
 * Items with durability include weapons, tools, ranged weapons, torches, flashlights, headlamps, and food.
 */

import { InventoryItem, ItemDefinition, DbConnection, CostIngredient } from '../generated';

/**
 * Maximum durability value for all items (100%)
 */
export const MAX_DURABILITY = 100.0;

/**
 * Maximum number of times an item can be repaired
 */
export const MAX_REPAIR_COUNT = 3;

/**
 * Minimum max durability (25% of original) - items can't be repaired below this
 */
export const MIN_MAX_DURABILITY = 25.0;

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
 * Get the max durability value from an item's itemData JSON field
 * Returns MAX_DURABILITY (100.0) if not set (default for new items)
 */
export function getMaxDurability(item: InventoryItem): number {
    if (!item.itemData) {
        return MAX_DURABILITY;
    }

    try {
        const data = JSON.parse(item.itemData);
        const maxDurability = data.max_durability;
        return typeof maxDurability === 'number' ? maxDurability : MAX_DURABILITY;
    } catch (error) {
        console.error('Failed to parse item data for max_durability:', error);
        return MAX_DURABILITY;
    }
}

/**
 * Get the repair count from an item's itemData JSON field
 * Returns 0 if not set (item has never been repaired)
 */
export function getRepairCount(item: InventoryItem): number {
    if (!item.itemData) {
        return 0;
    }

    try {
        const data = JSON.parse(item.itemData);
        const repairCount = data.repair_count;
        return typeof repairCount === 'number' ? repairCount : 0;
    } catch (error) {
        console.error('Failed to parse item data for repair_count:', error);
        return 0;
    }
}

/**
 * Check if an item can be repaired
 * Returns true if item has durability system and hasn't been repaired too many times
 */
export function canItemBeRepaired(item: InventoryItem, itemDef: ItemDefinition): boolean {
    // Must have durability system
    if (!hasDurabilitySystem(itemDef)) {
        return false;
    }
    
    // Must not be repaired too many times
    const repairCount = getRepairCount(item);
    if (repairCount >= MAX_REPAIR_COUNT) {
        return false;
    }
    
    // Max durability must be above minimum
    const maxDurability = getMaxDurability(item);
    if (maxDurability <= MIN_MAX_DURABILITY) {
        return false;
    }
    
    // Must actually need repair (current < max)
    const currentDurability = getDurability(item) ?? MAX_DURABILITY;
    if (currentDurability >= maxDurability) {
        return false;
    }
    
    // Must have crafting cost defined (needed to calculate repair cost)
    if (!itemDef.craftingCost || itemDef.craftingCost.length === 0) {
        return false;
    }
    
    return true;
}

/**
 * Get the reason why an item cannot be repaired (if it cannot be repaired)
 * Returns null if item can be repaired
 */
export function getRepairBlockedReason(item: InventoryItem, itemDef: ItemDefinition): string | null {
    if (!hasDurabilitySystem(itemDef)) {
        return "Item doesn't have a durability system";
    }
    
    const repairCount = getRepairCount(item);
    if (repairCount >= MAX_REPAIR_COUNT) {
        return `Item is too degraded to repair (${repairCount}/${MAX_REPAIR_COUNT} repairs used)`;
    }
    
    const maxDurability = getMaxDurability(item);
    if (maxDurability <= MIN_MAX_DURABILITY) {
        return "Item is too degraded - max durability too low";
    }
    
    const currentDurability = getDurability(item) ?? MAX_DURABILITY;
    if (currentDurability >= maxDurability) {
        return "Item doesn't need repair - durability is at maximum";
    }
    
    // Must have crafting cost defined (needed to calculate repair cost)
    if (!itemDef.craftingCost || itemDef.craftingCost.length === 0) {
        return "Item cannot be repaired - no crafting recipe";
    }
    
    return null;
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
 * Returns true for weapons, tools, ranged weapons, torches, flashlights, food items, and items with explicit spoilage time
 * Excludes items that don't lose durability: Fertilizer, Reed Water Bottle, Plastic Water Jug
 */
export function hasDurabilitySystem(itemDef: ItemDefinition): boolean {
    // Exclude items that don't lose durability
    const noDurabilityItems = ['Fertilizer', 'Reed Water Bottle', 'Plastic Water Jug'];
    if (noDurabilityItems.includes(itemDef.name)) {
        return false;
    }
    
    const categoryTag = itemDef.category.tag;
    
    // Check category
    if (categoryTag === 'Weapon' || categoryTag === 'Tool' || categoryTag === 'RangedWeapon') {
        return true;
    }
    
    // Check for food items (Consumable category with hunger/thirst)
    if (categoryTag === 'Consumable' && isFoodItem(itemDef)) {
        return true;
    }
    
    // Check special items by name (light sources with durability)
    if (itemDef.name === 'Torch' || itemDef.name === 'Flashlight' || itemDef.name === 'Headlamp') {
        return true;
    }
    
    // Check for items with explicit spoilage time (like Queen Bee, bait, etc.)
    if (itemDef.spoilsAfterHours !== null && itemDef.spoilsAfterHours !== undefined && itemDef.spoilsAfterHours > 0) {
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
 * Check if an item is stored in a refrigerator
 * Returns true if the item's location is in a WoodenStorageBox with boxType === BOX_TYPE_REFRIGERATOR
 */
function isItemInRefrigerator(item: InventoryItem, connection: DbConnection | null): boolean {
    if (!connection) {
        return false;
    }
    
    // Check if item is in a container
    if (item.location.tag !== 'Container') {
        return false;
    }
    
    const containerData = item.location.value;
    
    // Check if it's a WoodenStorageBox container
    if (containerData.containerType.tag !== 'WoodenStorageBox') {
        return false;
    }
    
    // Look up the box to check if it's a refrigerator
    const boxId = Number(containerData.containerId);
    const storageBox = connection.db.woodenStorageBox.id.find(boxId);
    
    if (!storageBox) {
        return false;
    }
    
    // BOX_TYPE_REFRIGERATOR = 2 (from containerUtils.ts)
    const BOX_TYPE_REFRIGERATOR = 2;
    return storageBox.boxType === BOX_TYPE_REFRIGERATOR;
}

/**
 * Calculate spoilage time remaining for items with explicit spoilage time (like Queen Bee)
 * Returns hours remaining or null if spoiled
 */
function calculateExplicitSpoilageTimeRemaining(item: InventoryItem, itemDef: ItemDefinition): number | null {
    if (!itemDef.spoilsAfterHours || itemDef.spoilsAfterHours <= 0) {
        return null;
    }
    
    const durability = getDurability(item);
    const totalSpoilageHours = itemDef.spoilsAfterHours;
    
    // If no durability data, treat as fresh (full time remaining)
    if (durability === null) {
        return totalSpoilageHours;
    }
    
    // If already spoiled, return null
    if (durability <= 0) {
        return null;
    }
    
    // Calculate time remaining based on durability percentage
    const durabilityPercentage = durability / MAX_DURABILITY;
    return totalSpoilageHours * durabilityPercentage;
}

/**
 * Format time remaining until spoilage for display
 * Returns formatted string like "12h 30m" or "2d 5h" or "Spoiled" or "Preserved"
 * Works for both food items and items with explicit spoilage time (like Queen Bee)
 * @param item - The inventory item
 * @param itemDef - The item definition
 * @param connection - Optional database connection to check if item is in a pantry
 */
export function formatFoodSpoilageTimeRemaining(item: InventoryItem, itemDef: ItemDefinition, connection?: DbConnection | null): string {
    // Check if item is in a pantry/refrigerator - if so, show "Preserved"
    if (connection && isItemInRefrigerator(item, connection)) {
        return 'Preserved';
    }
    
    let timeRemainingHours: number | null = null;
    
    // Check if it's a food item
    if (isFoodItem(itemDef)) {
        timeRemainingHours = calculateFoodSpoilageTimeRemaining(item, itemDef);
    } 
    // Check if it has explicit spoilage time (like Queen Bee)
    else if (itemDef.spoilsAfterHours && itemDef.spoilsAfterHours > 0) {
        timeRemainingHours = calculateExplicitSpoilageTimeRemaining(item, itemDef);
    }
    // Neither food nor explicit spoilage time
    else {
        return '';
    }
    
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

/**
 * Repair cost fraction based on repair count
 * 1st repair (repair_count 0 → 1): 50% of crafting cost
 * 2nd repair (repair_count 1 → 2): 25% of crafting cost
 * 3rd repair (repair_count 2 → 3): 12.5% of crafting cost
 */
function getRepairCostFraction(repairCount: number): number {
    switch (repairCount) {
        case 0: return 0.5;      // 50%
        case 1: return 0.25;     // 25%
        case 2: return 0.125;    // 12.5%
        default: return 0;       // No more repairs allowed
    }
}

/**
 * Calculate the repair cost for an item based on its crafting cost and repair count.
 * Returns an array of CostIngredient objects representing the materials needed.
 * Returns empty array if item cannot be repaired or has no crafting cost.
 */
export function calculateRepairCost(item: InventoryItem, itemDef: ItemDefinition): CostIngredient[] {
    // Check if item can be repaired
    if (!canItemBeRepaired(item, itemDef)) {
        return [];
    }
    
    // Check if item has crafting cost
    const craftingCost = itemDef.craftingCost;
    if (!craftingCost || craftingCost.length === 0) {
        return [];
    }
    
    // Get repair cost fraction based on current repair count
    const repairCount = getRepairCount(item);
    const fraction = getRepairCostFraction(repairCount);
    
    if (fraction <= 0) {
        return [];
    }
    
    // Calculate repair cost (fraction of crafting cost, minimum 1 of each ingredient)
    const repairCost: CostIngredient[] = [];
    
    for (const ingredient of craftingCost) {
        const cost = Math.max(1, Math.ceil(ingredient.quantity * fraction));
        repairCost.push({
            itemName: ingredient.itemName,
            quantity: cost,
        });
    }
    
    return repairCost;
}

/**
 * Format repair cost for display
 * Returns a string like "5 Wood, 2 Stone" or "No repair cost"
 */
export function formatRepairCost(repairCost: CostIngredient[]): string {
    if (repairCost.length === 0) {
        return 'No repair cost';
    }
    
    return repairCost.map(c => `${c.quantity} ${c.itemName}`).join(', ');
}

