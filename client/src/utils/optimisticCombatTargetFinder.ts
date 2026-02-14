/**
 * Client-side target prediction for optimistic combat feedback.
 * Mirrors server's find_targets_in_cone logic to predict which entity we'll hit.
 * Used to show health bar immediately on swing, before server confirms.
 */

import type { OptimisticEntityType, OptimisticHit } from './optimisticHealthOverlays';

const DEFAULT_ATTACK_RANGE = 150; // ~144px server default, use 150 for slight tolerance
const DEFAULT_ATTACK_ANGLE_DEG = 90;
const TREE_COLLISION_Y_OFFSET = 16;
const STONE_COLLISION_Y_OFFSET = 16;

function getForwardVector(direction: string): { x: number; y: number } {
  switch (direction) {
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
    default: return { x: 0, y: 1 };
  }
}

function isInCone(
  playerX: number, playerY: number,
  targetX: number, targetY: number,
  forwardX: number, forwardY: number,
  halfAngleRad: number
): { inCone: boolean; distSq: number } {
  const dx = targetX - playerX;
  const dy = targetY - playerY;
  const distSq = dx * dx + dy * dy;
  if (distSq < 1) return { inCone: false, distSq };

  const dist = Math.sqrt(distSq);
  const targetVecX = dx / dist;
  const targetVecY = dy / dist;
  const dot = forwardX * targetVecX + forwardY * targetVecY;
  const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
  return { inCone: angleRad <= halfAngleRad, distSq };
}

interface FindTargetParams {
  playerX: number;
  playerY: number;
  direction: string;
  attackRange?: number;
  attackAngleDeg?: number;
  trees?: Map<string, unknown>;
  stones?: Map<string, unknown>;
  wildAnimals?: Map<string, unknown>;
  barrels?: Map<string, unknown>;
  campfires?: Map<string, unknown>;
  boxes?: Map<string, unknown>;
  players?: Map<string, unknown>;
  estimatedDamage?: number;
}

/**
 * Find the closest destructible entity in the player's attack cone.
 * Returns target info for optimistic hit registration, or null if none found.
 */
export function findOptimisticCombatTarget(params: FindTargetParams): {
  type: OptimisticEntityType;
  id: bigint | number | string;
  currentHealth: number;
  maxHealth: number;
} | null {
  const {
    playerX, playerY, direction,
    attackRange = DEFAULT_ATTACK_RANGE,
    attackAngleDeg = DEFAULT_ATTACK_ANGLE_DEG,
    trees, stones, wildAnimals, barrels, campfires, boxes, players,
    estimatedDamage = 15,
  } = params;

  const rangeSq = attackRange * attackRange;
  const halfAngleRad = (attackAngleDeg * Math.PI / 180) / 2;
  const { x: forwardX, y: forwardY } = getForwardVector(direction);

  type BestTarget = { type: OptimisticEntityType; id: bigint | number | string; distSq: number; health: number; maxHealth: number };
  let best: BestTarget | null = null;

  const consider = (type: OptimisticEntityType, id: bigint | number | string, x: number, y: number, health: number, maxHealth: number) => {
    const { inCone, distSq } = isInCone(playerX, playerY, x, y, forwardX, forwardY, halfAngleRad);
    if (!inCone || distSq > rangeSq) return;
    if (health <= 0) return;
    if (!best || distSq < best.distSq) {
      best = { type, id, distSq, health, maxHealth };
    }
  };

  trees?.forEach((t) => {
    const e = t as { respawnAt?: { microsSinceUnixEpoch: bigint }; posX: number; posY: number; id: bigint | number; health?: number; maxHealth?: number };
    if (e.respawnAt && e.respawnAt.microsSinceUnixEpoch > 0n) return;
    const ty = e.posY - TREE_COLLISION_Y_OFFSET;
    consider('tree', e.id, e.posX, ty, e.health ?? 100, e.maxHealth ?? 100);
  });

  stones?.forEach((s) => {
    const e = s as { respawnAt?: { microsSinceUnixEpoch: bigint }; posX: number; posY: number; id: bigint | number; health?: number; maxHealth?: number };
    if (e.respawnAt && e.respawnAt.microsSinceUnixEpoch > 0n) return;
    const sy = e.posY - STONE_COLLISION_Y_OFFSET;
    consider('stone', e.id, e.posX, sy, e.health ?? 100, e.maxHealth ?? 100);
  });

  wildAnimals?.forEach((a) => {
    const e = a as { id: bigint | number; posX: number; posY: number; health?: number; maxHealth?: number };
    consider('wild_animal', e.id, e.posX, e.posY, e.health ?? 100, e.maxHealth ?? 100);
  });

  barrels?.forEach((b) => {
    const e = b as { respawnAt?: { microsSinceUnixEpoch: bigint }; posX: number; posY: number; id: bigint | number; health?: number };
    if (e.respawnAt && e.respawnAt.microsSinceUnixEpoch > 0n) return;
    consider('barrel', e.id, e.posX, e.posY, e.health ?? 100, 100);
  });

  campfires?.forEach((c) => {
    const e = c as { isDestroyed?: boolean; id: number; posX: number; posY: number; health?: number; maxHealth?: number };
    if (e.isDestroyed) return;
    consider('campfire', e.id, e.posX, e.posY, e.health ?? 100, e.maxHealth ?? 100);
  });

  boxes?.forEach((b) => {
    const e = b as { isDestroyed?: boolean; id: number; posX: number; posY: number; health?: number; maxHealth?: number };
    if (e.isDestroyed) return;
    consider('box', e.id, e.posX, e.posY, e.health ?? 100, e.maxHealth ?? 100);
  });

  players?.forEach((p, hexId) => {
    const pl = p as { isDead?: boolean; isOnline?: boolean; positionX?: number; positionY?: number; posX?: number; posY?: number; health?: number; maxHealth?: number };
    if (pl.isDead || !pl.isOnline) return;
    const px = pl.positionX ?? pl.posX ?? 0;
    const py = pl.positionY ?? pl.posY ?? 0;
    consider('player', hexId, px, py, pl.health ?? 100, pl.maxHealth ?? 100);
  });

  if (!best) return null;

  const target = best as BestTarget;
  const newHealth = Math.max(0, target.health - estimatedDamage);
  return {
    type: target.type,
    id: target.id,
    currentHealth: newHealth,
    maxHealth: target.maxHealth,
  };
}

/**
 * Create an OptimisticHit from findOptimisticCombatTarget result.
 */
export function toOptimisticHit(
  target: { type: OptimisticEntityType; id: bigint | number | string; currentHealth: number; maxHealth: number }
): OptimisticHit {
  return {
    entityType: target.type,
    entityId: target.id,
    lastHitTimeMs: performance.now(),
    estimatedHealth: target.currentHealth,
    maxHealth: target.maxHealth,
  };
}
