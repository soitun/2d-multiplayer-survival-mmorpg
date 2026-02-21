/**
 * Shared client-side tile type guards.
 * Keep all water/ocean classification logic here to avoid duplicated checks.
 */

export const WATER_TILE_U8 = new Set<number>([3, 6, 14]); // Sea, HotSpringWater, DeepSea
export const OCEAN_TILE_U8 = new Set<number>([3, 14]); // Sea, DeepSea

export const WATER_TILE_TAGS = new Set<string>(['Sea', 'HotSpringWater', 'DeepSea']);
export const OCEAN_TILE_TAGS = new Set<string>(['Sea', 'DeepSea']);

export function isWaterTileU8(tileTypeU8: number | null | undefined): boolean {
  return tileTypeU8 !== null && tileTypeU8 !== undefined && WATER_TILE_U8.has(tileTypeU8);
}

export function isOceanTileU8(tileTypeU8: number | null | undefined): boolean {
  return tileTypeU8 !== null && tileTypeU8 !== undefined && OCEAN_TILE_U8.has(tileTypeU8);
}

export function isWaterTileTag(tileType: string | null | undefined): boolean {
  return tileType !== null && tileType !== undefined && WATER_TILE_TAGS.has(tileType);
}

export function isOceanTileTag(tileType: string | null | undefined): boolean {
  return tileType !== null && tileType !== undefined && OCEAN_TILE_TAGS.has(tileType);
}
