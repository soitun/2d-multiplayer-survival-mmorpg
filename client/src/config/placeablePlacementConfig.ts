/**
 * Placeable Placement Grid Configuration
 *
 * Defines grid sizes and snap behavior for placeables. Placeables snap to a 48x48
 * quarter-cell grid (4 cells per 96x96 foundation). The placement preview snaps to
 * exactly where the item will be placed on the server, resolving preview/placement mismatch.
 */

import { foundationCellToWorldCenter } from './gameConfig';

export const PLACEABLE_QUARTER_SIZE = 48;
export const FOUNDATION_TILE_SIZE = 96;

export interface PlacementGridSize {
  widthQuarters: number;
  heightQuarters: number;
}

export interface PlaceablePlacementConfig {
  gridSize: PlacementGridSize;
  snapToGrid: boolean;
}

/** Minimal info needed for config lookup - avoids circular imports */
export interface PlacementLookupInfo {
  itemName: string;
  iconAssetName: string;
}

// Items excluded from grid snapping (free placement or special snap logic)
const EXCLUDED_FROM_GRID_SNAPPING = new Set([
  'Cerametal Field Cauldron Mk. II', // Broth pot - snaps to heat source
  'Wood Door',
  'Metal Door',
  'Fish Trap',
  'field_cauldron.png',
  'wood_door.png',
  'metal_door.png',
  'fish_trap.png',
]);

function isExcluded(info: PlacementLookupInfo): boolean {
  return (
    EXCLUDED_FROM_GRID_SNAPPING.has(info.itemName) ||
    EXCLUDED_FROM_GRID_SNAPPING.has(info.iconAssetName)
  );
}

/** Config keyed by itemName (primary) and iconAssetName (fallback for shared icons) */
const PLACEABLE_PLACEMENT_CONFIG: Record<string, PlaceablePlacementConfig> = {
  // 1x1 - quarter cell
  'Camp Fire': { gridSize: { widthQuarters: 1, heightQuarters: 1 }, snapToGrid: true },
  'Stash': { gridSize: { widthQuarters: 1, heightQuarters: 1 }, snapToGrid: true },
  'Lantern': { gridSize: { widthQuarters: 1, heightQuarters: 1 }, snapToGrid: true },
  'Wooden Storage Box': { gridSize: { widthQuarters: 1, heightQuarters: 1 }, snapToGrid: true },
  "Babushka's Surprise": { gridSize: { widthQuarters: 1, heightQuarters: 1 }, snapToGrid: true },
  "Matriarch's Wrath": { gridSize: { widthQuarters: 1, heightQuarters: 1 }, snapToGrid: true },

  // 2x1 - wide and short
  'Sleeping Bag': { gridSize: { widthQuarters: 2, heightQuarters: 1 }, snapToGrid: true },
  'Wolf Pelt': { gridSize: { widthQuarters: 2, heightQuarters: 1 }, snapToGrid: true },
  'Fox Pelt': { gridSize: { widthQuarters: 2, heightQuarters: 1 }, snapToGrid: true },
  'Polar Bear Pelt': { gridSize: { widthQuarters: 2, heightQuarters: 1 }, snapToGrid: true },
  'Walrus Pelt': { gridSize: { widthQuarters: 2, heightQuarters: 1 }, snapToGrid: true },

  // 1x2 - tall and narrow
  'Pantry': { gridSize: { widthQuarters: 1, heightQuarters: 2 }, snapToGrid: true },
  'Scarecrow': { gridSize: { widthQuarters: 1, heightQuarters: 2 }, snapToGrid: true },

  // 2x2 - full foundation
  'Furnace': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  'Large Furnace': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  'Barbecue': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  'Large Wooden Storage Box': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  'Compost': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  'Repair Bench': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  'Cooking Station': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  'Wooden Beehive': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  'Reed Rain Collector': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  "Matron's Chest": { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  'Ancestral Ward': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  'Signal Disruptor': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  'Memory Resonance Beacon': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },
  'Tallow Steam Turret': { gridSize: { widthQuarters: 2, heightQuarters: 2 }, snapToGrid: true },

  // 4x4 - uses foundation grid (Shelter)
  'Shelter': { gridSize: { widthQuarters: 4, heightQuarters: 4 }, snapToGrid: true },
};

/**
 * Get placement config for an item. Returns null if item uses free placement or special snap logic.
 */
export function getPlacementConfig(info: PlacementLookupInfo): PlaceablePlacementConfig | null {
  if (isExcluded(info)) return null;
  return PLACEABLE_PLACEMENT_CONFIG[info.itemName] ?? null;
}

/**
 * Whether this item should use grid snapping. Seeds are handled separately (isSeedItemValid).
 */
export function shouldUseGridSnapping(info: PlacementLookupInfo): boolean {
  if (isExcluded(info)) return false;
  const config = PLACEABLE_PLACEMENT_CONFIG[info.itemName];
  return config?.snapToGrid ?? false;
}

/**
 * Snap world coordinates to the placement grid center. Returns the center position
 * where the item will be placed (matches server storage).
 */
export function snapToPlacementGrid(
  worldX: number,
  worldY: number,
  config: PlaceablePlacementConfig
): { x: number; y: number } {
  const { widthQuarters, heightQuarters } = config.gridSize;

  if (widthQuarters === 4 && heightQuarters === 4) {
    // Shelter: use foundation grid, center of 2x2 foundations
    const fX = Math.floor(worldX / FOUNDATION_TILE_SIZE);
    const fY = Math.floor(worldY / FOUNDATION_TILE_SIZE);
    const { x, y } = foundationCellToWorldCenter(fX, fY);
    // Center of 4x4 = foundation center + half a foundation (middle of 2x2 block)
    return {
      x: x + FOUNDATION_TILE_SIZE / 2,
      y: y + FOUNDATION_TILE_SIZE / 2,
    };
  }

  // 1x1, 1x2, 2x1, 2x2: use quarter-cell grid
  const qX = Math.floor(worldX / PLACEABLE_QUARTER_SIZE);
  const qY = Math.floor(worldY / PLACEABLE_QUARTER_SIZE);

  // Anchor at top-left of placement; center = anchor + half dimensions
  const widthPx = widthQuarters * PLACEABLE_QUARTER_SIZE;
  const heightPx = heightQuarters * PLACEABLE_QUARTER_SIZE;
  const anchorX = qX * PLACEABLE_QUARTER_SIZE;
  const anchorY = qY * PLACEABLE_QUARTER_SIZE;

  return {
    x: anchorX + widthPx / 2,
    y: anchorY + heightPx / 2,
  };
}

/** Box type constants (match server wooden_storage_box.rs) - for footprint lookup */
const BOX_TYPE_NORMAL = 0;
const BOX_TYPE_LARGE = 1;
const BOX_TYPE_REFRIGERATOR = 2;
const BOX_TYPE_COMPOST = 3;
const BOX_TYPE_REPAIR_BENCH = 5;
const BOX_TYPE_COOKING_STATION = 6;
const BOX_TYPE_SCARECROW = 7;
const BOX_TYPE_FISH_TRAP = 10;
const BOX_TYPE_PLAYER_BEEHIVE = 12;
const BOX_TYPE_WOLF_PELT = 14;
const BOX_TYPE_FOX_PELT = 15;
const BOX_TYPE_POLAR_BEAR_PELT = 16;
const BOX_TYPE_WALRUS_PELT = 17;

/** Get placement config for wooden storage box by boxType (for overlap detection) */
export function getBoxTypePlacementConfig(boxType: number): PlaceablePlacementConfig | null {
  switch (boxType) {
    case BOX_TYPE_NORMAL:
      return PLACEABLE_PLACEMENT_CONFIG['Wooden Storage Box'];
    case BOX_TYPE_LARGE:
      return PLACEABLE_PLACEMENT_CONFIG['Large Wooden Storage Box'];
    case BOX_TYPE_REFRIGERATOR:
      return PLACEABLE_PLACEMENT_CONFIG['Pantry'];
    case BOX_TYPE_COMPOST:
      return PLACEABLE_PLACEMENT_CONFIG['Compost'];
    case BOX_TYPE_REPAIR_BENCH:
      return PLACEABLE_PLACEMENT_CONFIG['Repair Bench'];
    case BOX_TYPE_COOKING_STATION:
      return PLACEABLE_PLACEMENT_CONFIG['Cooking Station'];
    case BOX_TYPE_SCARECROW:
      return PLACEABLE_PLACEMENT_CONFIG['Scarecrow'];
    case BOX_TYPE_FISH_TRAP:
      return null; // Excluded - free placement
    case BOX_TYPE_PLAYER_BEEHIVE:
      return PLACEABLE_PLACEMENT_CONFIG['Wooden Beehive'];
    case BOX_TYPE_WOLF_PELT:
      return PLACEABLE_PLACEMENT_CONFIG['Wolf Pelt'];
    case BOX_TYPE_FOX_PELT:
      return PLACEABLE_PLACEMENT_CONFIG['Fox Pelt'];
    case BOX_TYPE_POLAR_BEAR_PELT:
      return PLACEABLE_PLACEMENT_CONFIG['Polar Bear Pelt'];
    case BOX_TYPE_WALRUS_PELT:
      return PLACEABLE_PLACEMENT_CONFIG['Walrus Pelt'];
    default:
      return PLACEABLE_PLACEMENT_CONFIG['Wooden Storage Box'];
  }
}

/**
 * Get placement square bounds (top-left x, y and width, height in pixels) for drawing the preview square.
 */
export function getPlacementSquareBounds(
  centerX: number,
  centerY: number,
  config: PlaceablePlacementConfig
): { x: number; y: number; width: number; height: number } {
  const { widthQuarters, heightQuarters } = config.gridSize;
  // Shelter (4x4) uses foundation grid: 4 foundation cells = 384px
  const width =
    widthQuarters === 4 && heightQuarters === 4
      ? 4 * FOUNDATION_TILE_SIZE
      : widthQuarters * PLACEABLE_QUARTER_SIZE;
  const height =
    widthQuarters === 4 && heightQuarters === 4
      ? 4 * FOUNDATION_TILE_SIZE
      : heightQuarters * PLACEABLE_QUARTER_SIZE;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}
