/**
 * Water state hysteresis to prevent flickering when players move across
 * water/land/transition tile boundaries. Requires the new state to persist
 * for HYSTERESIS_MS before switching, stabilizing rendering during transitions.
 */

const HYSTERESIS_MS = 120; // Require 120ms of consistent state before switching

interface PlayerWaterState {
  committedValue: boolean; // The stable value we're using
  pendingValue: boolean | null; // Value we've seen but not yet committed
  firstSeenAt: number; // When we first saw the pending value
}

const stateCache = new Map<string, PlayerWaterState>();

/**
 * Returns the effective "is on water (swimming)" state with hysteresis applied.
 * Raw effective = isOnWater && !isOnSeaTransition.
 * Requires the new state to persist for HYSTERESIS_MS before switching.
 */
export function getEffectiveIsOnWater(
  playerId: string,
  isOnWater: boolean,
  isOnSeaTransition: boolean,
  nowMs: number
): boolean {
  const rawEffective = isOnWater && !isOnSeaTransition;

  let cached = stateCache.get(playerId);
  if (!cached) {
    cached = { committedValue: rawEffective, pendingValue: null, firstSeenAt: nowMs };
    stateCache.set(playerId, cached);
    return rawEffective;
  }

  if (rawEffective === cached.committedValue) {
    // Stable - clear any pending switch
    cached.pendingValue = null;
    return cached.committedValue;
  }

  // Raw differs from committed - we're considering a switch
  if (cached.pendingValue === rawEffective) {
    // We've seen this value before - check if enough time has passed
    if (nowMs - cached.firstSeenAt >= HYSTERESIS_MS) {
      cached.committedValue = rawEffective;
      cached.pendingValue = null;
      return cached.committedValue;
    }
    return cached.committedValue;
  }

  // New pending value - start the timer
  cached.pendingValue = rawEffective;
  cached.firstSeenAt = nowMs;
  return cached.committedValue;
}

/** Clean up cache for players no longer in view (call periodically if needed). */
export function pruneWaterStateCache(activePlayerIds: Set<string>, maxSize: number = 64): void {
  if (stateCache.size <= maxSize) return;
  for (const [id] of stateCache) {
    if (!activePlayerIds.has(id)) {
      stateCache.delete(id);
      if (stateCache.size <= maxSize) break;
    }
  }
}
