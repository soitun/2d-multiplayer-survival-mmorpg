/**
 * Plant and seed utilities that work with SpacetimeDB generated data
 * This eliminates hardcoding of plant names by using the actual item definitions
 * and inferring rules from patterns in names and descriptions.
 * 
 * ALL SEEDS are now in seeds.rs as Placeable category items.
 * Only RAW seeds can be planted - cooked/burnt/toasted variants cannot be planted.
 */

import { ItemDefinition } from '../generated';

/**
 * Determines if an item is plantable (seeds, cuttings, bulbs, etc.) based on SpacetimeDB item definitions
 * Only RAW plantable items can be planted - cooked/burnt/toasted variants cannot be planted
 */
export function isPlantableSeed(itemDef: ItemDefinition): boolean {
  // All seeds are categorized as Placeable in the database
  if (itemDef.category.tag !== 'Placeable') {
    return false;
  }
  
  const name = itemDef.name.toLowerCase();
  const description = itemDef.description.toLowerCase();
  
  // Exclude cooked/burnt/toasted variants - only raw seeds can be planted
  if (name.includes('cooked') || name.includes('burnt') || name.includes('toasted') || name.includes('roasted')) {
    return false;
  }
  
  // Check if the item name or description indicates it's plantable (seeds, cuttings, bulbs, etc.)
  return (
    name.includes('seed') ||
    name.includes('spore') ||
    name.includes('rhizome') ||
    name.includes('cuttings') || // "Mint Cuttings"
    name.includes('bulbs') || // "Bear Garlic Bulbs"
    name.includes('potato') || // "Seed Potato"
    name.includes('frond') || // "Seaweed Frond" - underwater plant propagation
    name.includes('pinecone') || // "Pinecone" - tree seed for conifers
    name.includes('catkin') || // "Birch Catkin" - tree seed for deciduous trees
    description.includes('plant') ||
    description.includes('grow') ||
    description.includes('deploy')
  );
}

/**
 * Gets all plantable seeds from the item definitions
 * Returns the actual item definitions, not hardcoded names
 */
export function getPlantableSeeds(itemDefinitions: Map<string, ItemDefinition>): ItemDefinition[] {
  return Array.from(itemDefinitions.values())
    .filter(isPlantableSeed)
    .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically
}

/**
 * Gets just the names of plantable seeds for backwards compatibility
 * Use getPlantableSeeds() for the full data where possible
 */
export function getPlantableSeedNames(itemDefinitions: Map<string, ItemDefinition>): string[] {
  return getPlantableSeeds(itemDefinitions).map(item => item.name);
}

/**
 * Determines if a seed requires water placement (like Reed Rhizome)
 * Uses name/description patterns to infer water requirements
 */
export function requiresWaterPlacement(itemName: string, itemDef?: ItemDefinition): boolean {
  const name = itemName.toLowerCase();
  const description = itemDef?.description.toLowerCase() || '';
  
  // Specific exclusions for items that contain "reed" but aren't water-requiring plants
  if (name.includes('rain collector') || name.includes('collector')) {
    return false;
  }
  
  return (
    name.includes('reed') ||
    name.includes('rhizome') ||
    name.includes('seaweed') || // "Seaweed Frond" - underwater planting
    name.includes('frond') || // Alternative check for fronds
    description.includes('water') ||
    description.includes('underwater') ||
    description.includes('near water')
  );
}

/**
 * Determines if a seed requires beach placement (like Beach Lyme Grass Seeds, Scurvy Grass Seeds, Sea Plantain Seeds, and Glasswort Seeds)
 * Uses name/description patterns to infer beach requirements
 */
export function requiresBeachPlacement(itemName: string, itemDef?: ItemDefinition): boolean {
  const name = itemName.toLowerCase();
  const description = itemDef?.description.toLowerCase() || '';
  
  return (
    name.includes('beach lyme grass') ||
    name.includes('scurvy grass') ||
    name.includes('sea plantain') ||
    name.includes('glasswort') ||
    description.includes('beach tiles') ||
    description.includes('beach only')
  );
}

/**
 * Determines if a seed requires alpine/mountain placement
 * Arctic Lichen Spores, Moss Spores, Arctic Poppy Seeds, Arctic Hairgrass Seeds
 */
export function requiresAlpinePlacement(itemName: string, itemDef?: ItemDefinition): boolean {
  const name = itemName.toLowerCase();
  const description = itemDef?.description.toLowerCase() || '';
  
  return (
    name.includes('lichen spores') ||
    name.includes('moss spores') ||
    name.includes('arctic poppy') ||
    name.includes('arctic hairgrass') ||
    description.includes('alpine') ||
    description.includes('alpine mountain')
  );
}

/**
 * Determines if a seed requires tundra placement
 * Crowberry Seeds, Fireweed Seeds
 */
export function requiresTundraPlacement(itemName: string, itemDef?: ItemDefinition): boolean {
  const name = itemName.toLowerCase();
  const description = itemDef?.description.toLowerCase() || '';
  
  return (
    name.includes('crowberry') ||
    name.includes('fireweed') ||
    description.includes('tundra tiles') ||
    description.includes('tundra only')
  );
}

/**
 * Determines if a tree seed (Pinecone) is blocked from beach tiles
 * Conifers (spruce, hemlock, pine) don't grow in sandy, salt-spray beach environments
 */
export function isPineconeBlockedOnBeach(itemName: string): boolean {
  const name = itemName.toLowerCase();
  return name.includes('pinecone');
}

/**
 * Determines if a tree seed (Birch Catkin) is blocked from alpine tiles
 * Deciduous trees (birch, alder, willow) can't grow on rocky alpine terrain
 */
export function isBirchCatkinBlockedOnAlpine(itemName: string): boolean {
  const name = itemName.toLowerCase();
  return name.includes('catkin') || name.includes('birch catkin');
}

/**
 * Determines if a fruit/nut tree seed requires temperate-only placement
 * Crab Apple Seeds and Hazelnuts can only be planted on temperate tiles (grass/forest)
 * They cannot survive beach (salt), alpine (cold/rocky), or tundra (cold) conditions
 */
export function requiresTemperateOnlyPlacement(itemName: string): boolean {
  const name = itemName.toLowerCase();
  return name.includes('crab apple seed') || name === 'hazelnut' || name === 'hazelnuts';
}

/**
 * Determines if a fruit/nut tree seed is a Crab Apple Seed
 */
export function isCrabAppleSeed(itemName: string): boolean {
  const name = itemName.toLowerCase();
  return name.includes('crab apple seed');
}

/**
 * Determines if a seed is a Hazelnut (plantable nut)
 */
export function isHazelnutSeed(itemName: string): boolean {
  const name = itemName.toLowerCase();
  return name === 'hazelnut' || name === 'hazelnuts';
}

/**
 * Determines if a seed is a conifer tree seed (Pinecone)
 * These grow into spruce, hemlock, or pine trees
 */
export function isConiferSeed(itemName: string): boolean {
  const name = itemName.toLowerCase();
  return name.includes('pinecone');
}

/**
 * Determines if a seed is a deciduous tree seed (Birch Catkin)
 * These grow into birch, alder, or willow trees
 */
export function isDeciduousSeed(itemName: string): boolean {
  const name = itemName.toLowerCase();
  return name.includes('catkin') || name.includes('birch catkin');
}

/**
 * Determines if a seed is any tree seed (Pinecone, Birch Catkin, Crab Apple Seeds, or Hazelnut)
 */
export function isTreeSeed(itemName: string): boolean {
  return isConiferSeed(itemName) || isDeciduousSeed(itemName) || isCrabAppleSeed(itemName) || isHazelnutSeed(itemName);
}

/**
 * Determines if a seed can be planted on land (most seeds)
 * Uses name/description patterns to infer land suitability
 */
export function canPlantOnLand(itemName: string, itemDef?: ItemDefinition): boolean {
  // Most seeds can be planted on land, except water-specific ones
  return !requiresWaterPlacement(itemName, itemDef);
}

/**
 * Gets the plant placement type for a seed
 */
export type PlantPlacementType = 'land' | 'water' | 'both';

export function getPlantPlacementType(itemName: string, itemDef?: ItemDefinition): PlantPlacementType {
  if (requiresWaterPlacement(itemName, itemDef)) {
    return 'water';
  }
  return 'land';
}

/**
 * Check if a plantable item is valid for planting based on item name patterns
 * Only RAW plantable items can be planted - cooked/burnt/toasted variants cannot be planted
 */
export function isSeedItemValid(itemName: string, itemDefinitions?: Map<string, ItemDefinition>): boolean {
  // If we have full item definitions, use the complete check
  if (itemDefinitions) {
    const itemDef = itemDefinitions.get(itemName);
    return itemDef ? isPlantableSeed(itemDef) : false;
  }
  
  // Fallback: use name patterns (for when itemDefinitions not available)
  const name = itemName.toLowerCase();
  
  // Exclude cooked/burnt variants
  if (name.includes('cooked') || name.includes('burnt') || name.includes('toasted') || name.includes('roasted')) {
    return false;
  }
  
  return (
    name.includes('seed') ||
    name.includes('spore') ||
    name.includes('rhizome') ||
    name.includes('cuttings') || // "Mint Cuttings"
    name.includes('bulb') || // "Bear Garlic Bulbs", "Kamchatka Lily Bulb" (matches both singular and plural)
    name.includes('bulbil') || // "Bistort Bulbils" - viviparous alpine plant
    name.includes('root') || // "Silverweed Root", "Horseradish Root"
    name.includes('potato') || // "Seed Potato"
    name.includes('frond') || // "Seaweed Frond" - underwater plant propagation
    name.includes('pinecone') || // "Pinecone" - tree seed for conifers
    name.includes('catkin') // "Birch Catkin" - tree seed for deciduous trees
  );
} 