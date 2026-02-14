/**
 * Optimistic Health Bar Overlays
 *
 * When the player initiates an attack (useEquippedItem), we don't know the target until
 * the server responds. This causes lag between the swing and the health bar appearing.
 *
 * This module stores "pending hits" - when we swing and have a predicted target (from
 * client-side cone check), we immediately show the health bar with estimated damage.
 * Server state overwrites when it arrives (typically within 50-200ms).
 *
 * Similar to registerLocalPlayerSwing() - client-authoritative for instant feedback.
 */

export type OptimisticEntityType =
  | 'tree'
  | 'stone'
  | 'wild_animal'
  | 'player'
  | 'barrel'
  | 'campfire'
  | 'box'
  | 'lantern'
  | 'turret'
  | 'living_coral'
  | 'corpse'
  | 'animal_corpse'
  | 'furnace'
  | 'barbecue'
  | 'rain_collector'
  | 'stash'
  | 'sleeping_bag'
  | 'fence'
  | 'wall'
  | 'foundation'
  | 'door'
  | 'homestead_hearth'
  | 'broth_pot'
  | 'fumarole';

export interface OptimisticHit {
  entityType: OptimisticEntityType;
  entityId: bigint | number | string;
  lastHitTimeMs: number;
  /** Estimated health after hit (currentHealth - estimatedDamage). Server overwrites. */
  estimatedHealth: number;
  maxHealth: number;
}

const overlays = new Map<string, OptimisticHit>();
const OVERLAY_TTL_MS = 800; // Expire if server hasn't confirmed within 800ms

function overlayKey(type: OptimisticEntityType, id: bigint | number | string): string {
  return `${type}:${id}`;
}

/**
 * Register an optimistic hit when the player swings and we have a predicted target.
 * Call from useInputHandler when useEquippedItem is invoked.
 */
export function registerOptimisticHit(hit: OptimisticHit): void {
  overlays.set(overlayKey(hit.entityType, hit.entityId), hit);
}

/**
 * Get optimistic overlay for an entity, if we have a pending hit that's still valid.
 * Returns null if no overlay, or overlay has expired.
 */
export function getOptimisticOverlay(
  entityType: OptimisticEntityType,
  entityId: bigint | number | string
): OptimisticHit | null {
  const key = overlayKey(entityType, entityId);
  const hit = overlays.get(key);
  if (!hit) return null;
  const age = performance.now() - hit.lastHitTimeMs;
  if (age >= OVERLAY_TTL_MS) {
    overlays.delete(key);
    return null;
  }
  return hit;
}

/**
 * Clear overlay when server confirms (entity update received).
 * Called from useSpacetimeTables when we get an update for an entity we had an overlay for.
 */
export function clearOptimisticOverlay(
  entityType: OptimisticEntityType,
  entityId: bigint | number | string
): void {
  overlays.delete(overlayKey(entityType, entityId));
}

/**
 * Merge server entity data with optimistic overlay for display.
 * Use optimistic values when we have a pending hit that's newer than server's lastHitTime.
 */
export function mergeWithOptimisticOverlay<T extends { health?: number; maxHealth?: number; lastHitTime?: { microsSinceUnixEpoch: bigint } | null }>(
  entityType: OptimisticEntityType,
  entityId: bigint | number | string,
  entity: T
): { health: number; maxHealth: number; lastHitTimeMs: number | null } {
  const overlay = getOptimisticOverlay(entityType, entityId);
  const serverLastHitMs = entity.lastHitTime
    ? Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n)
    : null;

  if (overlay) {
    // Use optimistic if it's newer than server (we swung before server confirmed)
    const useOptimistic = serverLastHitMs === null || overlay.lastHitTimeMs >= serverLastHitMs - 50;
    if (useOptimistic) {
      return {
        health: overlay.estimatedHealth,
        maxHealth: overlay.maxHealth,
        lastHitTimeMs: overlay.lastHitTimeMs,
      };
    }
  }

  return {
    health: entity.health ?? 0,
    maxHealth: entity.maxHealth ?? 100,
    lastHitTimeMs: serverLastHitMs,
  };
}
