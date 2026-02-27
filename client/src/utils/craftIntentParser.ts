/**
 * Craft Intent Parser for SOVA Chat/Voice
 *
 * Detects craft requests ("craft X", "make X", "create X") and resolves them
 * against the recipe database. Returns structured feedback for success or
 * missing-resource failure without duplicating server crafting logic.
 */

import type { Recipe, RecipeIngredient, InventoryItem, ItemDefinition } from '../generated/types';
import type { Identity } from 'spacetimedb';
import type { InventoryLocationData, HotbarLocationData } from '../generated/types';

/** Patterns that indicate a craft intent (case-insensitive) */
const CRAFT_PATTERNS = [
  /^(?:craft|make|create|build)\s+(.+)$/i,
  /^(?:i\s+)?(?:want\s+to\s+)?(?:craft|make|create)\s+(.+)$/i,
];

/** Extract quantity from end of string, e.g. "wooden plank x5" -> { name: "wooden plank", qty: 5 } */
function parseQuantitySuffix(text: string): { name: string; quantity: number } {
  const match = text.trim().match(/^(.+?)\s*(?:x|×|\*)\s*(\d+)\s*$/i);
  if (match) {
    return { name: match[1].trim(), quantity: Math.max(1, parseInt(match[2], 10)) };
  }
  return { name: text.trim(), quantity: 1 };
}

/**
 * Parse user message for craft intent.
 * Returns { recipeName, quantity } or null if no craft intent detected.
 */
export function parseCraftIntent(message: string): { recipeName: string; quantity: number } | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  for (const pattern of CRAFT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const { name, quantity } = parseQuantitySuffix(match[1]);
      if (name.length > 0) {
        return { recipeName: name, quantity };
      }
    }
  }
  return null;
}

/**
 * Resolve recipe by output item name (case-insensitive, partial match).
 * Prefers exact match, then startsWith.
 */
export function resolveRecipeByName(
  recipeName: string,
  recipes: Map<string, Recipe>,
  itemDefinitions: Map<string, ItemDefinition>
): Recipe | null {
  const nameLower = recipeName.toLowerCase().trim();
  if (!nameLower) return null;

  let best: Recipe | null = null;
  let bestScore = 0; // higher = better match

  for (const recipe of recipes.values()) {
    const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
    if (!outputDef) continue;

    const outputName = outputDef.name;
    const outputLower = outputName.toLowerCase();

    if (outputLower === nameLower) {
      return recipe; // exact match wins immediately
    }
    if (outputLower.startsWith(nameLower) && nameLower.length > bestScore) {
      best = recipe;
      bestScore = nameLower.length;
    }
  }
  return best;
}

/** Compute player inventory totals (itemDefId -> quantity) for player-owned items */
function getPlayerInventoryResources(
  inventoryItems: Map<string, InventoryItem>,
  playerIdentity: Identity
): Map<string, number> {
  const resources = new Map<string, number>();
  for (const item of inventoryItems.values()) {
    if (item.location.tag === 'Inventory') {
      const data = item.location.value as InventoryLocationData;
      if (data.ownerId && data.ownerId.isEqual(playerIdentity)) {
        const id = item.itemDefId.toString();
        resources.set(id, (resources.get(id) || 0) + item.quantity);
      }
    } else if (item.location.tag === 'Hotbar') {
      const data = item.location.value as HotbarLocationData;
      if (data.ownerId && data.ownerId.isEqual(playerIdentity)) {
        const id = item.itemDefId.toString();
        resources.set(id, (resources.get(id) || 0) + item.quantity);
      }
    }
  }
  return resources;
}

/** Flexible ingredient info: first valid itemDefId -> { groupName, validItemDefIds, totalRequired } */
type FlexInfo = Map<string, { groupName: string; validItemDefIds: string[]; totalRequired: number }>;

function getFlexibleIngredientInfo(
  recipe: Recipe,
  itemDefinitions: Map<string, ItemDefinition>
): FlexInfo {
  const flexMap: FlexInfo = new Map();
  const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
  if (!outputDef?.flexibleIngredients) return flexMap;

  for (const flexIng of outputDef.flexibleIngredients) {
    const validIds: string[] = [];
    for (const itemName of flexIng.validItems) {
      for (const [id, def] of itemDefinitions) {
        if (def.name === itemName) {
          validIds.push(id);
          break;
        }
      }
    }
    if (validIds.length > 0) {
      flexMap.set(validIds[0], {
        groupName: flexIng.groupName,
        validItemDefIds: validIds,
        totalRequired: flexIng.totalRequired,
      });
    }
  }
  return flexMap;
}

/** Check if player has enough resources to craft (resources only, no station/memory grid) */
function canCraft(
  recipe: Recipe,
  quantity: number,
  playerResources: Map<string, number>,
  itemDefinitions: Map<string, ItemDefinition>
): boolean {
  if (!recipe.ingredients || recipe.ingredients.length === 0) return false;
  const flexInfo = getFlexibleIngredientInfo(recipe, itemDefinitions);

  for (const ingredient of recipe.ingredients) {
    const ingIdStr = ingredient.itemDefId.toString();
    const flex = flexInfo.get(ingIdStr);

    let available: number;
    let required: number;

    if (flex) {
      available = flex.validItemDefIds.reduce((sum, id) => sum + (playerResources.get(id) || 0), 0);
      required = flex.totalRequired * quantity;
    } else {
      available = playerResources.get(ingIdStr) || 0;
      required = ingredient.quantity * quantity;
    }

    if (available < required) return false;
  }
  return true;
}

export interface MissingResource {
  itemName: string;
  required: number;
  available: number;
  shortfall: number;
}

/**
 * Get missing resources for a recipe at given quantity.
 * Returns empty array if craftable.
 */
export function getMissingResources(
  recipe: Recipe,
  quantity: number,
  playerResources: Map<string, number>,
  itemDefinitions: Map<string, ItemDefinition>
): MissingResource[] {
  const missing: MissingResource[] = [];
  const flexInfo = getFlexibleIngredientInfo(recipe, itemDefinitions);

  for (const ingredient of recipe.ingredients) {
    const ingIdStr = ingredient.itemDefId.toString();
    const flex = flexInfo.get(ingIdStr);
    const def = itemDefinitions.get(ingIdStr);
    const itemName = def?.name ?? `Item ${ingIdStr}`;

    let available: number;
    let required: number;

    if (flex) {
      available = flex.validItemDefIds.reduce((sum, id) => sum + (playerResources.get(id) || 0), 0);
      required = flex.totalRequired * quantity;
    } else {
      available = playerResources.get(ingIdStr) || 0;
      required = ingredient.quantity * quantity;
    }

    if (available < required) {
      missing.push({
        itemName,
        required,
        available,
        shortfall: required - available,
      });
    }
  }
  return missing;
}

/** Suggested gather targets for missing resources (simplified: item name as hint) */
function getSuggestedGatherTargets(missing: MissingResource[]): string[] {
  const hints: string[] = [];
  for (const m of missing) {
    if (m.itemName.toLowerCase().includes('wood') || m.itemName.toLowerCase().includes('log')) {
      hints.push('trees');
    } else if (m.itemName.toLowerCase().includes('stone') || m.itemName.toLowerCase().includes('rock')) {
      hints.push('stones');
    } else if (m.itemName.toLowerCase().includes('fiber') || m.itemName.toLowerCase().includes('grass')) {
      hints.push('grass');
    } else if (m.itemName.toLowerCase().includes('flint')) {
      hints.push('stones (flint)');
    } else if (m.itemName.toLowerCase().includes('bone')) {
      hints.push('animals');
    } else {
      hints.push(m.itemName);
    }
  }
  return [...new Set(hints)];
}

export interface CraftFeedback {
  success: boolean;
  message: string;
  recipe?: Recipe;
  quantity?: number;
  missingResources?: MissingResource[];
}

/**
 * Build structured craft feedback for SOVA.
 * Does NOT call reducers - caller invokes startCraftingMultiple.
 */
export function getCraftFeedback(
  recipe: Recipe,
  quantity: number,
  inventoryItems: Map<string, InventoryItem>,
  itemDefinitions: Map<string, ItemDefinition>,
  playerIdentity: Identity | null
): CraftFeedback {
  const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
  const outputName = outputDef?.name ?? 'Unknown item';

  if (!playerIdentity) {
    return {
      success: false,
      message: "I can't craft for you until you're connected.",
      recipe,
      quantity,
    };
  }

  const playerResources = getPlayerInventoryResources(inventoryItems, playerIdentity);
  const craftable = canCraft(recipe, quantity, playerResources, itemDefinitions);

  if (craftable) {
    const qtyText = quantity > 1 ? ` x${quantity}` : '';
    return {
      success: true,
      message: `Started crafting ${outputName}${qtyText}.`,
      recipe,
      quantity,
    };
  }

  const missing = getMissingResources(recipe, quantity, playerResources, itemDefinitions);
  const suggestions = getSuggestedGatherTargets(missing);

  const lines: string[] = [`Can't craft ${outputName} — missing resources:`];
  for (const m of missing) {
    lines.push(`  • ${m.itemName}: need ${m.required}, have ${m.available} (short ${m.shortfall})`);
  }
  if (suggestions.length > 0) {
    lines.push(`Try gathering: ${suggestions.join(', ')}.`);
  }

  return {
    success: false,
    message: lines.join('\n'),
    recipe,
    quantity,
    missingResources: missing,
  };
}
