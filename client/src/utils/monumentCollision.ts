/**
 * Client-side collision shapes for monument buildings.
 * Abstraction layer for monument-specific collision (village campfires, scarecrow, etc.).
 */
import type { MonumentPart } from '../generated';
import type { CollisionShape } from './clientCollision';

// --- Monument scarecrow collision (matches wooden storage box - 20px radius, same position) ---
const MONUMENT_SCARECROW_CULL_DISTANCE_SQ = 200 * 200; // Only check within 200px
const MAX_MONUMENT_SCARECROWS_TO_CHECK = 3;
// Always use COLLISION_RADII.STORAGE_BOX (20) - ignore part.collisionRadius from DB (may be stale 64)
const MONUMENT_SCARECROW_COLLISION_RADIUS = 20;

function isMonumentScarecrowPart(part: MonumentPart): boolean {
  return part.monumentType?.tag === 'HuntingVillage' && part.partType === 'scarecrow' && (part.collisionRadius ?? 0) > 0;
}

/**
 * Returns collision shapes for hunting village monument scarecrow (matches wooden storage box).
 * Always uses radius 20 - same as COLLISION_RADII.STORAGE_BOX. Ignores part.collisionRadius.
 */
export function getMonumentScarecrowCollisionShapes(
  monumentParts: Map<string, MonumentPart> | undefined,
  playerX: number,
  playerY: number
): CollisionShape[] {
  if (!monumentParts || monumentParts.size === 0) return [];

  const shapes: CollisionShape[] = [];
  let count = 0;

  for (const part of monumentParts.values()) {
    if (count >= MAX_MONUMENT_SCARECROWS_TO_CHECK) break;
    if (!isMonumentScarecrowPart(part)) continue;

    const dx = part.worldX - playerX;
    const dy = part.worldY - playerY;
    const distSq = dx * dx + dy * dy;
    if (distSq > MONUMENT_SCARECROW_CULL_DISTANCE_SQ) continue;

    shapes.push({
      id: `monument_scarecrow_${part.id}`,
      type: `monument_scarecrow-${part.id}`,
      x: part.worldX,
      y: part.worldY,
      radius: MONUMENT_SCARECROW_COLLISION_RADIUS,
    });
    count++;
  }

  return shapes;
}

// --- Village campfire collision ---
const VILLAGE_CAMPFIRE_COLLISION_RADIUS = 70;
const VILLAGE_CAMPFIRE_CULL_DISTANCE_SQ = 250 * 250; // Only check within 250px
const MAX_VILLAGE_CAMPFIRES_TO_CHECK = 5;
// fv_campfire.png is 256x256, anchor at bottom; collision center at fire pit (half-height up)
const VILLAGE_CAMPFIRE_COLLISION_Y_OFFSET = -128;

function isVillageCampfirePart(part: MonumentPart): boolean {
  const isFishingVillage = part.monumentType?.tag === 'FishingVillage' && part.isCenter;
  const isHuntingVillage = part.monumentType?.tag === 'HuntingVillage' && part.partType === 'campfire';
  return Boolean(isFishingVillage || isHuntingVillage);
}

/**
 * Returns collision shapes for fishing/hunting village campfires (70px radius circle).
 * Culled by distance from player for performance.
 */
export function getVillageCampfireCollisionShapes(
  monumentParts: Map<string, MonumentPart> | undefined,
  playerX: number,
  playerY: number
): CollisionShape[] {
  if (!monumentParts || monumentParts.size === 0) return [];

  const shapes: CollisionShape[] = [];
  let count = 0;

  for (const part of monumentParts.values()) {
    if (count >= MAX_VILLAGE_CAMPFIRES_TO_CHECK) break;
    if (!isVillageCampfirePart(part)) continue;

    const dx = part.worldX - playerX;
    const dy = part.worldY - playerY;
    const distSq = dx * dx + dy * dy;
    if (distSq > VILLAGE_CAMPFIRE_CULL_DISTANCE_SQ) continue;

    shapes.push({
      id: `monument_campfire_${part.id}`,
      type: `monument_campfire-${part.id}`,
      x: part.worldX,
      y: part.worldY + VILLAGE_CAMPFIRE_COLLISION_Y_OFFSET,
      radius: VILLAGE_CAMPFIRE_COLLISION_RADIUS,
    });
    count++;
  }

  return shapes;
}
