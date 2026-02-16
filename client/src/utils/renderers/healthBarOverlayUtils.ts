/**
 * Health Bar Overlay - Renders all entity health bars in a separate pass
 * so they appear ON TOP of barrels, doodads, and other game world objects.
 *
 * Call this after all Y-sorted entities have been rendered.
 */

import { renderHealthBar, renderEntityHealthBar, getLastHitTimeMs } from './healthBarUtils';
import { CAMPFIRE_WIDTH, CAMPFIRE_HEIGHT, CAMPFIRE_RENDER_Y_OFFSET } from './campfireRenderingUtils';
import {
  getBoxDimensions,
  BOX_TYPE_COOKING_STATION,
  BOX_TYPE_REPAIR_BENCH,
  BOX_TYPE_COMPOST,
  BOX_TYPE_FISH_TRAP,
  BOX_RENDER_Y_OFFSET,
  MONUMENT_COOKING_STATION_WIDTH,
  MONUMENT_COOKING_STATION_HEIGHT,
  MONUMENT_COMPOST_WIDTH,
  MONUMENT_COMPOST_HEIGHT,
  MONUMENT_REPAIR_BENCH_WIDTH,
  MONUMENT_REPAIR_BENCH_HEIGHT,
  MONUMENT_BOX_ANCHOR_Y_OFFSET,
} from './woodenStorageBoxRenderingUtils';
import { isCompoundMonument } from '../../config/compoundBuildings'; // Used for furnace, wooden_storage_box
import { TURRET_WIDTH, TURRET_HEIGHT } from './turretRenderingUtils';
import {
  RAIN_COLLECTOR_WIDTH,
  RAIN_COLLECTOR_HEIGHT,
  MONUMENT_RAIN_COLLECTOR_WIDTH,
  MONUMENT_RAIN_COLLECTOR_HEIGHT,
} from './rainCollectorRenderingUtils';
import { getFurnaceDimensions } from './furnaceRenderingUtils';
import { SLEEPING_BAG_WIDTH, SLEEPING_BAG_HEIGHT } from './sleepingBagRenderingUtils';
import { LANTERN_RENDER_Y_OFFSET, getLanternDimensions } from './lanternRenderingUtils';
import { BARBECUE_WIDTH, BARBECUE_HEIGHT } from './barbecueRenderingUtils';
import { HEARTH_WIDTH, HEARTH_HEIGHT, HEARTH_RENDER_Y_OFFSET } from './hearthRenderingUtils';
import { STASH_WIDTH, STASH_HEIGHT } from './stashRenderingUtils';
import {
  DEBUG_SHELTER_COLLISION_WIDTH,
  DEBUG_SHELTER_COLLISION_HEIGHT,
  DEBUG_SHELTER_AABB_CENTER_Y_FROM_BASE,
} from './shelterRenderingUtils';
import { DOOR_RENDER_WIDTH, DOOR_RENDER_HEIGHT } from './doorRenderingUtils';
import type { YSortedEntityType } from '../../hooks/useEntityFiltering';

export interface HealthBarOverlayParams {
  ctx: CanvasRenderingContext2D;
  ySortedEntities: YSortedEntityType[];
  nowMs: number;
  playerX: number;
  playerY: number;
}

/**
 * Renders health bars for all entities that have them.
 * Call AFTER all Y-sorted entities so health bars appear on top.
 */
export function renderHealthBarOverlay(params: HealthBarOverlayParams): void {
  const { ctx, ySortedEntities, nowMs, playerX, playerY } = params;

  ySortedEntities.forEach(({ type, entity }) => {
    // Barrels: no health bar (only structures/walls/placeables show health when hit)
    if (type === 'campfire') {
      renderEntityHealthBar(ctx, entity as any, CAMPFIRE_WIDTH, CAMPFIRE_HEIGHT, nowMs, playerX, playerY, -CAMPFIRE_RENDER_Y_OFFSET);
    } else if (type === 'wooden_storage_box') {
      const box = entity as any;
      if (box.isDestroyed) return;
      const isCompoundBldg = isCompoundMonument(box.isMonument, box.posX, box.posY);
      if (isCompoundBldg && (box.boxType === BOX_TYPE_COOKING_STATION || box.boxType === BOX_TYPE_REPAIR_BENCH || box.boxType === BOX_TYPE_COMPOST)) {
        const w = box.boxType === BOX_TYPE_COOKING_STATION ? MONUMENT_COOKING_STATION_WIDTH : box.boxType === BOX_TYPE_COMPOST ? MONUMENT_COMPOST_WIDTH : MONUMENT_REPAIR_BENCH_WIDTH;
        const h = box.boxType === BOX_TYPE_COOKING_STATION ? MONUMENT_COOKING_STATION_HEIGHT : box.boxType === BOX_TYPE_COMPOST ? MONUMENT_COMPOST_HEIGHT : MONUMENT_REPAIR_BENCH_HEIGHT;
        renderEntityHealthBar(ctx, box, w, h, nowMs, playerX, playerY, h - MONUMENT_BOX_ANCHOR_Y_OFFSET);
      } else if (box.boxType === BOX_TYPE_FISH_TRAP) {
        const dims = getBoxDimensions(box.boxType);
        renderEntityHealthBar(ctx, box, dims.width, dims.height, nowMs, playerX, playerY, -BOX_RENDER_Y_OFFSET);
      } else {
        const dims = getBoxDimensions(box.boxType);
        renderEntityHealthBar(ctx, box, dims.width, dims.height, nowMs, playerX, playerY, -BOX_RENDER_Y_OFFSET);
      }
    } else if (type === 'turret') {
      const turret = entity as any;
      if (!turret.isMonument) {
        renderEntityHealthBar(ctx, turret, TURRET_WIDTH, TURRET_HEIGHT, nowMs, playerX, playerY, TURRET_HEIGHT / 2);
      }
    } else if (type === 'rain_collector') {
      const rc = entity as any;
      if (rc.isMonument) {
        renderEntityHealthBar(ctx, rc, MONUMENT_RAIN_COLLECTOR_WIDTH, MONUMENT_RAIN_COLLECTOR_HEIGHT, nowMs, playerX, playerY, MONUMENT_RAIN_COLLECTOR_HEIGHT - 96);
      } else {
        renderEntityHealthBar(ctx, rc, RAIN_COLLECTOR_WIDTH, RAIN_COLLECTOR_HEIGHT, nowMs, playerX, playerY, RAIN_COLLECTOR_HEIGHT - 36);
      }
    } else if (type === 'furnace') {
      const furnace = entity as any;
      const dims = getFurnaceDimensions(furnace.furnaceType, isCompoundMonument(furnace.isMonument, furnace.posX, furnace.posY));
      renderEntityHealthBar(ctx, furnace, dims.width, dims.height, nowMs, playerX, playerY, -dims.yOffset);
    } else if (type === 'sleeping_bag') {
      renderEntityHealthBar(ctx, entity as any, SLEEPING_BAG_WIDTH, SLEEPING_BAG_HEIGHT, nowMs, playerX, playerY);
    } else if (type === 'lantern') {
      const lantern = entity as any;
      const { width, height } = getLanternDimensions(lantern.lanternType);
      renderEntityHealthBar(ctx, lantern, width, height, nowMs, playerX, playerY, -LANTERN_RENDER_Y_OFFSET);
    } else if (type === 'barbecue') {
      renderEntityHealthBar(ctx, entity as any, BARBECUE_WIDTH, BARBECUE_HEIGHT, nowMs, playerX, playerY, BARBECUE_HEIGHT / 2);
    } else if (type === 'homestead_hearth') {
      renderEntityHealthBar(ctx, entity as any, HEARTH_WIDTH, HEARTH_HEIGHT, nowMs, playerX, playerY, -HEARTH_RENDER_Y_OFFSET);
    } else if (type === 'stash') {
      const stash = entity as any;
      if (!stash.isHidden) {
        renderEntityHealthBar(ctx, stash, STASH_WIDTH, STASH_HEIGHT, nowMs, playerX, playerY);
      }
    } else if (type === 'shelter') {
      const shelter = entity as any;
      if (!shelter.isDestroyed) {
        const aabbCenterY = shelter.posY - DEBUG_SHELTER_AABB_CENTER_Y_FROM_BASE;
        renderHealthBar({
          ctx,
          entityX: shelter.posX,
          entityY: aabbCenterY,
          entityWidth: DEBUG_SHELTER_COLLISION_WIDTH,
          entityHeight: DEBUG_SHELTER_COLLISION_HEIGHT,
          health: shelter.health,
          maxHealth: shelter.maxHealth,
          lastHitTimeMs: getLastHitTimeMs(shelter.lastHitTime),
          nowMs,
          playerX,
          playerY,
          entityDrawYOffset: 0,
        });
      }
    } else if (type === 'door') {
      const door = entity as any;
      if (door.health / door.maxHealth < 1.0) {
        renderHealthBar({
          ctx,
          entityX: door.posX,
          entityY: door.posY,
          entityWidth: DOOR_RENDER_WIDTH,
          entityHeight: DOOR_RENDER_HEIGHT,
          health: door.health,
          maxHealth: door.maxHealth,
          lastHitTimeMs: nowMs - 1000,
          nowMs,
          playerX,
          playerY,
          entityDrawYOffset: -44,
        });
      }
    }
    // foundation_cell: uses custom inline health bar in foundationRenderingUtils - handled in that renderer's pass
    // We could add it here but foundation rendering is complex (multiple passes). Skip for now - foundations
    // are typically large and less likely to be obscured. Can add later if needed.
  });
}
