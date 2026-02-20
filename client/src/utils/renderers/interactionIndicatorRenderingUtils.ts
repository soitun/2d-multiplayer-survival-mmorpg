/**
 * Renders hold-progress circles for interaction targets (campfire, furnace, box, etc.)
 * Uses ENTITY_VISUAL_CONFIG for indicator positioning.
 */

import { drawInteractionIndicator } from '../interactionIndicator';
import { ENTITY_VISUAL_CONFIG, getIndicatorPosition, getIndicatorHeight } from '../entityVisualConfig';
import { getFurnaceDimensions } from './furnaceRenderingUtils';
import { isCompoundMonument } from '../../config/compoundBuildings';
import { HOLD_INTERACTION_DURATION_MS, REVIVE_HOLD_DURATION_MS } from '../../config/gameConfig';

export type IndicatorEntityType =
  | 'campfire' | 'furnace' | 'barbecue' | 'fumarole' | 'lantern' | 'box' | 'stash'
  | 'corpse' | 'knocked_out_player' | 'water' | 'homestead_hearth' | 'door';

export interface HoldInteractionProgress {
  targetId: string | number | bigint | null;
  targetType: string;
  startTime: number;
}

export interface RenderInteractionIndicatorsParams {
  ctx: CanvasRenderingContext2D;
  cameraOffsetX: number;
  cameraOffsetY: number;
  holdInteractionProgress: HoldInteractionProgress | null;
  isActivelyHolding: boolean;
  closestInteractableKnockedOutPlayerId: string | null;
  closestInteractableWaterPosition: { x: number; y: number } | null;
  visibleCampfiresMap: Map<string, any>;
  visibleFurnacesMap: Map<string, any>;
  visibleBarbecuesMap: Map<string, any>;
  visibleLanternsMap: Map<string, any>;
  visibleBoxesMap: Map<string, any>;
  visibleDoorsMap: Map<string, any>;
  visibleHomesteadHearthsMap: Map<string, any>;
  stashes: Map<string, any>;
  players: Map<string, any>;
  emptyMap: Map<string, any>;
}

function getConfigKey(
  entityType: IndicatorEntityType,
  entityHeight: number,
  boxType?: number
): string {
  if (entityType === 'box') {
    if (boxType === 3) return 'compost';
    if (boxType === 2) return 'refrigerator';
    return 'wooden_storage_box';
  }
  if (entityType === 'furnace') {
    return entityHeight >= 480 ? 'monument_large_furnace'
      : entityHeight >= 256 ? 'large_furnace'
        : 'furnace';
  }
  return entityType;
}

export function renderInteractionIndicators(params: RenderInteractionIndicatorsParams): void {
  const {
    ctx,
    cameraOffsetX,
    cameraOffsetY,
    holdInteractionProgress: hip,
    isActivelyHolding,
    closestInteractableKnockedOutPlayerId,
    closestInteractableWaterPosition,
    visibleCampfiresMap,
    visibleFurnacesMap,
    visibleBarbecuesMap,
    visibleLanternsMap,
    visibleBoxesMap,
    visibleDoorsMap,
    visibleHomesteadHearthsMap,
    stashes,
    players,
    emptyMap,
  } = params;

  const drawIndicatorIfNeeded = (
    entityType: IndicatorEntityType,
    entityId: number | bigint | string,
    entityPosX: number,
    entityPosY: number,
    entityHeight: number,
    isInView: boolean,
    boxType?: number
  ) => {
    if (!isInView || !hip) return;

    let targetId: number | bigint | string;
    if (typeof entityId === 'string') {
      targetId = entityId;
    } else if (typeof entityId === 'bigint') {
      targetId = BigInt(hip.targetId ?? 0);
    } else {
      targetId = Number(hip.targetId ?? 0);
    }

    if (hip.targetType !== entityType || targetId !== entityId) return;
    if (!isActivelyHolding) return;

    const interactionDuration = entityType === 'knocked_out_player'
      ? REVIVE_HOLD_DURATION_MS
      : HOLD_INTERACTION_DURATION_MS;
    const currentProgress = Math.min(Math.max((Date.now() - hip.startTime) / interactionDuration, 0), 1);

    const configKey = getConfigKey(entityType, entityHeight, boxType);
    const config = ENTITY_VISUAL_CONFIG[configKey];

    let indicatorX: number;
    let indicatorY: number;
    if (config) {
      const pos = getIndicatorPosition(entityPosX, entityPosY, config);
      indicatorX = pos.x + cameraOffsetX;
      indicatorY = pos.y + cameraOffsetY;
    } else {
      indicatorX = entityPosX + cameraOffsetX;
      indicatorY = entityPosY + cameraOffsetY - (entityHeight / 2) - 15;
    }

    drawInteractionIndicator(ctx, indicatorX, indicatorY, currentProgress);
  };

  type MapEntityType = 'campfire' | 'furnace' | 'barbecue' | 'lantern' | 'box' | 'stash' | 'door' | 'homestead_hearth';
  const INDICATOR_ENTRIES: Array<{
    type: MapEntityType;
    map: Map<string, any>;
    getInfo: (e: any) => { id: number | bigint; posX: number; posY: number; height: number; boxType?: number };
  }> = [
    { type: 'campfire', map: visibleCampfiresMap, getInfo: (e) => ({ id: e.id, posX: e.posX, posY: e.posY, height: getIndicatorHeight('campfire'), boxType: undefined }) },
    { type: 'furnace', map: visibleFurnacesMap, getInfo: (e) => ({ id: e.id, posX: e.posX, posY: e.posY, height: getFurnaceDimensions(e.furnaceType, isCompoundMonument(e.isMonument, e.posX, e.posY)).height, boxType: undefined }) },
    { type: 'barbecue', map: visibleBarbecuesMap, getInfo: (e) => ({ id: e.id, posX: e.posX, posY: e.posY, height: getIndicatorHeight('barbecue'), boxType: undefined }) },
    { type: 'lantern', map: visibleLanternsMap, getInfo: (e) => ({ id: e.id, posX: e.posX, posY: e.posY, height: getIndicatorHeight('lantern'), boxType: undefined }) },
    { type: 'box', map: visibleBoxesMap, getInfo: (e) => ({ id: e.id, posX: e.posX, posY: e.posY, height: e.boxType === 3 ? getIndicatorHeight('compost') : e.boxType === 2 ? getIndicatorHeight('refrigerator') : getIndicatorHeight('wooden_storage_box'), boxType: e.boxType }) },
    { type: 'stash', map: stashes instanceof Map ? stashes : emptyMap, getInfo: (e) => ({ id: e.id, posX: e.posX, posY: e.posY, height: getIndicatorHeight('stash'), boxType: undefined }) },
    { type: 'door', map: visibleDoorsMap, getInfo: (e) => ({ id: e.id, posX: e.posX, posY: e.posY, height: getIndicatorHeight('door'), boxType: undefined }) },
    { type: 'homestead_hearth', map: visibleHomesteadHearthsMap, getInfo: (e) => ({ id: e.id, posX: e.posX, posY: e.posY - 15, height: getIndicatorHeight('homestead_hearth'), boxType: undefined }) },
  ];

  INDICATOR_ENTRIES.forEach(({ type, map, getInfo }) => {
    map.forEach((entity: any) => {
      const info = getInfo(entity);
      drawIndicatorIfNeeded(type, info.id, info.posX, info.posY, info.height, true, info.boxType);
    });
  });

  if (closestInteractableKnockedOutPlayerId && players instanceof Map) {
    const knockedOutPlayer = players.get(closestInteractableKnockedOutPlayerId);
    if (knockedOutPlayer && knockedOutPlayer.isKnockedOut && !knockedOutPlayer.isDead &&
        hip && String(hip.targetId) === closestInteractableKnockedOutPlayerId && hip.targetType === 'knocked_out_player') {
      drawIndicatorIfNeeded('knocked_out_player', closestInteractableKnockedOutPlayerId, knockedOutPlayer.positionX, knockedOutPlayer.positionY, getIndicatorHeight('knocked_out_player'), true);
    }
  }
  if (closestInteractableWaterPosition && hip?.targetType === 'water') {
    drawIndicatorIfNeeded('water', 'water', closestInteractableWaterPosition.x, closestInteractableWaterPosition.y, 0, true);
  }
}
