/**
 * Centralized Entity Visual Configuration
 * 
 * This file defines visual bounds for all interactable entities.
 * These values are used consistently across:
 * - Interaction outline (blue box)
 * - E label positioning (auto-centered on top of blue box)
 * - Placement preview positioning
 * 
 * All positions are relative to the entity's posX/posY from the server.
 */

export interface EntityVisualBounds {
  // Visual bounds center offset from entity's posX/posY
  centerOffsetX: number;  // Usually 0 (centered horizontally)
  centerOffsetY: number;  // Negative = up from posY, Positive = down from posY
  
  // Dimensions of the interaction box
  width: number;
  height: number;
  
  // Server-side placement Y offset (if any)
  // When placing, server stores: pos_y = click_y + placementYOffset
  placementYOffset: number;
  
  // Sprite dimensions for placement preview
  spriteWidth: number;
  spriteHeight: number;
}

/**
 * Visual configuration for all interactable entities.
 * 
 * To add a new entity:
 * 1. Add its config here with appropriate bounds
 * 2. The interaction outline, E label, and placement preview will all use these values
 * 
 * To fix misalignment:
 * 1. Adjust centerOffsetY to move the blue box up (negative) or down (positive)
 * 2. Adjust width/height to resize the blue box
 * 3. Adjust placementYOffset if server applies an offset during placement
 * 
 * Note: E label is ALWAYS centered horizontally on top of the blue box (no adjustment needed)
 */
export const ENTITY_VISUAL_CONFIG: Record<string, EntityVisualBounds> = {
  // Cooking appliances
  campfire: {
    centerOffsetX: 0,
    centerOffsetY: -48,  // Box centered 48px above posY
    width: 64,
    height: 96,
    placementYOffset: 0,
    spriteWidth: 64,
    spriteHeight: 64,
  },
  
  furnace: {
    centerOffsetX: 0,
    centerOffsetY: -64,  // Box centered 64px above posY
    width: 96,
    height: 128,
    placementYOffset: 0,
    spriteWidth: 96,
    spriteHeight: 96,
  },
  
  barbecue: {
    centerOffsetX: 0,
    centerOffsetY: 0,    // Sprite is centered on posY, so box at posY
    width: 72,
    height: 96,
    placementYOffset: 42, // Server adds +42 to Y when placing
    spriteWidth: 128,
    spriteHeight: 128,
  },
  
  // Storage containers
  wooden_storage_box: {
    centerOffsetX: 0,
    centerOffsetY: -58,
    width: 64,
    height: 72,
    placementYOffset: 0,
    spriteWidth: 64,
    spriteHeight: 64,
  },
  
  compost: {
    centerOffsetX: 0,
    centerOffsetY: -84,   // Sprite renders at posY - 148, center at posY - 84
    width: 80,            // Interaction box width (wider than regular box)
    height: 80,           // Interaction box height
    placementYOffset: -32, // Compensate for 128px sprite vs 64px normal box (server adds +52, but larger sprite)
    spriteWidth: 128,
    spriteHeight: 128,
  },
  
  refrigerator: {
    centerOffsetX: 0,
    centerOffsetY: -68,   // Sprite renders at posY - 116, center at posY - 68 (96x96 squared)
    width: 80,            // Interaction box width
    height: 80,           // Interaction box height
    placementYOffset: -16, // Server adds +52, sprite is 96px (larger than 64px normal box)
    spriteWidth: 96,
    spriteHeight: 96,
  },
  
  repair_bench: {
    centerOffsetX: 0,
    centerOffsetY: -84,   // Sprite is 128x128, renders at posY - 148, center at posY - 84
    width: 120,           // Interaction box width - covers most of 128px sprite
    height: 120,          // Interaction box height - covers most of 128px sprite
    placementYOffset: -32, // Compensate for 128px sprite vs 64px normal box
    spriteWidth: 128,
    spriteHeight: 128,
  },
  
  cooking_station: {
    centerOffsetX: 0,
    centerOffsetY: -84,   // Sprite is 128x128, renders at posY - 148, center at posY - 84
    width: 120,           // Interaction box width - covers most of 128px sprite
    height: 120,          // Interaction box height - covers most of 128px sprite
    placementYOffset: -32, // Compensate for 128px sprite vs 64px normal box
    spriteWidth: 128,
    spriteHeight: 128,
  },
  
  stash: {
    centerOffsetX: 0,
    centerOffsetY: -24,
    width: 48,
    height: 48,
    placementYOffset: 0,
    spriteWidth: 48,
    spriteHeight: 48,
  },
  
  barrel: {
    centerOffsetX: 0,
    centerOffsetY: -24,
    width: 48,
    height: 48,
    placementYOffset: 0,
    spriteWidth: 48,
    spriteHeight: 48,
  },
  
  // Structures
  cairn: {
    centerOffsetX: 0,
    centerOffsetY: -70,  // Reduced from -48 for lower visual offset
    width: 120,          // Reduced from 180 for smaller interaction box
    height: 160,         // Reduced from 220 for smaller interaction box
    placementYOffset: 0,
    spriteWidth: 192,
    spriteHeight: 192,
  },
  
  lantern: {
    centerOffsetX: 0,
    centerOffsetY: -40,  // Outline higher on the lantern
    width: 48,
    height: 72,
    placementYOffset: 0,
    spriteWidth: 64,
    spriteHeight: 96,
  },
  
  rain_collector: {
    centerOffsetX: 0,
    centerOffsetY: 0,
    width: 116,   // 96 + 20
    height: 148,  // 128 + 20
    placementYOffset: 0,
    spriteWidth: 96,
    spriteHeight: 128,
  },
  
  homestead_hearth: {
    centerOffsetX: 0,
    centerOffsetY: -63,
    width: 96,
    height: 96,
    placementYOffset: 0,
    spriteWidth: 96,
    spriteHeight: 96,
  },
  
  fumarole: {
    centerOffsetX: 0,
    centerOffsetY: 0,
    width: 96,
    height: 96,
    placementYOffset: 0,
    spriteWidth: 96,
    spriteHeight: 96,
  },
  
  // Corpses/entities
  player_corpse: {
    centerOffsetX: 0,
    centerOffsetY: 0,
    width: 80,
    height: 72,
    placementYOffset: 0,
    spriteWidth: 64,
    spriteHeight: 64,
  },
  
  // Special buildings
  alk_station: {
    centerOffsetX: 0,
    centerOffsetY: -200,
    width: 350,
    height: 500,
    placementYOffset: 0,
    spriteWidth: 350,
    spriteHeight: 500,
  },
  
  // Items and misc
  dropped_item: {
    centerOffsetX: 0,
    centerOffsetY: -10,
    width: 32,
    height: 32,
    placementYOffset: 0,
    spriteWidth: 32,
    spriteHeight: 32,
  },
  
  harvestable_resource: {
    centerOffsetX: 0,
    centerOffsetY: -32,  // Standard resource visual center
    width: 64,
    height: 64,
    placementYOffset: 0,
    spriteWidth: 64,
    spriteHeight: 64,
  },
  
  sleeping_bag: {
    centerOffsetX: 0,
    centerOffsetY: -32,
    width: 64,
    height: 64,
    placementYOffset: 0,
    spriteWidth: 64,
    spriteHeight: 64,
  },
  
  knocked_out_player: {
    centerOffsetX: 0,
    centerOffsetY: -15,
    width: 64,
    height: 48,
    placementYOffset: 0,
    spriteWidth: 64,
    spriteHeight: 64,
  },
  
  broth_pot: {
    centerOffsetX: 0,
    centerOffsetY: -30,
    width: 64,
    height: 64,
    placementYOffset: 0,
    spriteWidth: 64,
    spriteHeight: 64,
  },
  
  door: {
    centerOffsetX: 0,
    centerOffsetY: -66,  // Doors render 44px higher, so offset accounts for this
    width: 64,
    height: 96,
    placementYOffset: 0,
    spriteWidth: 64,
    spriteHeight: 128,
  },
};

/**
 * Get visual config for an entity type.
 * Returns undefined if not found (entity will use default/custom handling).
 */
export function getEntityVisualConfig(entityType: string): EntityVisualBounds | undefined {
  return ENTITY_VISUAL_CONFIG[entityType.toLowerCase()];
}

/**
 * Calculate the E label position based on entity visual bounds.
 * Label is ALWAYS centered horizontally, overlapping with top band of the blue box.
 * 
 * @param entityPosX - Entity's world X position
 * @param entityPosY - Entity's world Y position
 * @param config - Entity visual configuration
 */
export function getLabelPosition(
  entityPosX: number,
  entityPosY: number,
  config: EntityVisualBounds
): { x: number; y: number } {
  const boxCenterY = entityPosY + config.centerOffsetY;
  const boxTop = boxCenterY - config.height / 2;
  
  return {
    x: entityPosX + config.centerOffsetX,  // Centered horizontally
    y: boxTop + 5,                         // 20px down from top (overlaps with top band)
  };
}

/**
 * Calculate the interaction indicator position (center of the blue box).
 * Used for circular progress indicators during interactions.
 * 
 * @param entityPosX - Entity's world X position
 * @param entityPosY - Entity's world Y position
 * @param config - Entity visual configuration
 */
export function getIndicatorPosition(
  entityPosX: number,
  entityPosY: number,
  config: EntityVisualBounds
): { x: number; y: number } {
  return {
    x: entityPosX + config.centerOffsetX,  // Centered horizontally
    y: entityPosY + config.centerOffsetY,  // Center of blue box
  };
}

/**
 * Calculate placement preview position.
 * Accounts for server-side placement offset so preview matches final position.
 */
export function getPlacementPreviewPosition(
  mouseX: number,
  mouseY: number,
  config: EntityVisualBounds
): { x: number; y: number; width: number; height: number } {
  // Server will store pos_y = mouseY + placementYOffset
  // Sprite is drawn centered on posY
  // So preview should be centered on (mouseY + placementYOffset)
  const actualPosY = mouseY + config.placementYOffset;
  
  return {
    x: mouseX - config.spriteWidth / 2,
    y: actualPosY - config.spriteHeight / 2,
    width: config.spriteWidth,
    height: config.spriteHeight,
  };
}

/**
 * Get interaction outline parameters for an entity.
 */
export function getInteractionOutlineParams(
  entityPosX: number,
  entityPosY: number,
  config: EntityVisualBounds
): { x: number; y: number; width: number; height: number } {
  return {
    x: entityPosX + config.centerOffsetX,
    y: entityPosY + config.centerOffsetY,
    width: config.width,
    height: config.height,
  };
}
