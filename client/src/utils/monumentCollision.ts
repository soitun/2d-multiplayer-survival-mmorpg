/**
 * Client-side collision shapes for monument buildings.
 * Abstraction layer for monument-specific collision (village campfires, etc.).
 */
import type { MonumentPart } from '../generated';
import type { CollisionShape } from './clientCollision';

// --- Village campfire collision ---
const VILLAGE_CAMPFIRE_COLLISION_RADIUS = 60;
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
 * Returns collision shapes for fishing/hunting village campfires (60px radius circle).
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
