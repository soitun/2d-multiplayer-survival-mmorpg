/**
 * Grenade metadata helpers for fuse countdown display.
 * Mirrors durability/water helper style for parsing item_data JSON.
 */

import type { InventoryItem, DroppedItem } from '../generated/types';

interface GrenadeFuseData {
  fuse_detonates_at?: number;
  fuse_duration_secs?: number;
  fuse_started_at?: number;
}

/**
 * Parse grenade fuse metadata from item_data JSON.
 * Returns null if not a grenade or no valid fuse data.
 */
export function parseGrenadeFuseData(itemData: string | undefined): GrenadeFuseData | null {
  if (!itemData) return null;
  try {
    const data = JSON.parse(itemData) as GrenadeFuseData;
    if (data.fuse_detonates_at == null || typeof data.fuse_detonates_at !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Check if an item has armed grenade fuse metadata.
 */
export function hasGrenadeFuse(item: InventoryItem | DroppedItem): boolean {
  return parseGrenadeFuseData(item.itemData) !== null;
}

/**
 * Get remaining seconds until grenade detonation.
 * Returns null if not a grenade, no fuse, or already expired.
 */
export function getGrenadeFuseRemainingSecs(item: InventoryItem | DroppedItem): number | null {
  const data = parseGrenadeFuseData(item.itemData);
  if (!data || data.fuse_detonates_at == null) return null;
  const nowSecs = Date.now() / 1000;
  const remaining = data.fuse_detonates_at - nowSecs;
  return remaining > 0 ? remaining : 0; // 0 when expired (detonating)
}

/**
 * Format grenade fuse countdown for display.
 * Returns "Xs" for remaining time, "Detonating…" or "0s" when expired.
 */
export function formatGrenadeCountdown(item: InventoryItem | DroppedItem): string | null {
  const data = parseGrenadeFuseData(item.itemData);
  if (!data || data.fuse_detonates_at == null) return null;
  const nowSecs = Date.now() / 1000;
  const remaining = data.fuse_detonates_at - nowSecs;
  if (remaining <= 0) return 'Detonating…';
  const secs = Math.ceil(remaining);
  return `${secs}s`;
}
