// client/src/config/compoundBuildings.ts
// ------------------------------------
// Static compound building definitions for the central compound area.
// Buildings are positioned relative to the world center and rendered client-side.
// Server mirrors collision data for movement validation.
// ------------------------------------

import { gameConfig } from './gameConfig';

/**
 * Light source definition for buildings that emit light at night.
 * Light punches through the day/night overlay like a street lamp.
 */
export interface BuildingLightSource {
  /** Light radius in pixels */
  radius: number;
  /** 
   * X-offset from building center (default 0 = centered).
   * Positive = east, negative = west.
   */
  offsetX?: number;
  /** 
   * Y-offset from building anchor point.
   * Positive values move the light UP (toward top of sprite).
   */
  offsetY: number;
  /** 
   * Light color for atmospheric tint (optional).
   * Format: { r, g, b } with values 0-255.
   * If not provided, creates a pure cutout (white/neutral light).
   */
  color?: { r: number; g: number; b: number };
  /** 
   * Light intensity multiplier (default 1.0).
   * Higher values = brighter light that cuts through more darkness.
   */
  intensity?: number;
}

/**
 * Definition for a static compound building.
 * Each building has unique visual and collision properties.
 */
export interface CompoundBuilding {
  /** Unique identifier for this building */
  id: string;
  
  // === POSITION (relative to world center in pixels) ===
  /** X offset from world center (negative = west, positive = east) */
  offsetX: number;
  /** Y offset from world center (negative = north, positive = south) */
  offsetY: number;
  
  // === VISUAL PROPERTIES ===
  /** Image filename (loaded from assets/doodads/) */
  imagePath: string;
  /** Display width in pixels */
  width: number;
  /** Display height in pixels */
  height: number;
  /** 
   * Y-offset for the visual anchor point (pixels up from sprite bottom).
   * This determines where the building's "feet" are for Y-sorting.
   * Higher values = sprite is anchored lower on its image.
   */
  anchorYOffset: number;
  
  // === COLLISION (circular) ===
  /** Collision radius in pixels */
  collisionRadius: number;
  /** 
   * Y-offset for collision center (pixels up from visual anchor).
   * Adjusts where the collision circle is positioned relative to the building.
   */
  collisionYOffset: number;
  
  // === MONUMENT CENTER (optional) ===
  /**
   * For monuments (shipwrecks, fishing villages): marks the center piece.
   * Used for building restriction overlay rendering.
   */
  isCenter?: boolean;
  
  // === LIGHT SOURCE (optional) ===
  /** 
   * Light source for buildings that emit light at night.
   * Only buildings with this property will have light cutouts rendered.
   */
  lightSource?: BuildingLightSource;
}

/**
 * Calculate the world center coordinates in pixels.
 * Buildings are positioned relative to this point.
 */
export function getWorldCenter(): { x: number; y: number } {
  return {
    x: (gameConfig.worldWidthTiles * gameConfig.tileSize) / 2,
    y: (gameConfig.worldHeightTiles * gameConfig.tileSize) / 2,
  };
}

/**
 * Get a building's absolute world position.
 * @param building - The building definition
 * @returns World coordinates { x, y } for the building's anchor point
 */
export function getBuildingWorldPosition(building: CompoundBuilding): { x: number; y: number } {
  const center = getWorldCenter();
  return {
    x: center.x + building.offsetX,
    y: center.y + building.offsetY,
  };
}

/**
 * Get a building's Y-sort position for depth ordering.
 * @param building - The building definition
 * @returns Y coordinate used for depth sorting
 */
export function getBuildingYSortPosition(building: CompoundBuilding): number {
  const worldPos = getBuildingWorldPosition(building);
  // Y-sort position is at the building's "feet" (anchor point)
  return worldPos.y;
}

/**
 * Static compound buildings array.
 * 
 * TO ADD A NEW BUILDING:
 * 1. Add your image to client/src/assets/doodads/
 * 2. Add an entry below with unique id and your desired properties
 * 3. Mirror the collision values (offsetX, offsetY, collisionRadius, collisionYOffset) 
 *    in server/src/compound_buildings.rs
 * 
 * COORDINATE SYSTEM:
 * - offsetX: negative = west of center, positive = east of center
 * - offsetY: negative = north of center, positive = south of center
 * - The central compound asphalt area is roughly ±768px from center (16 tiles × 48px)
 * 
 * IMAGE LOADING:
 * - Buildings without image files will show colored placeholder overlays with collision circles
 * - Yellow dot = anchor point (where building "feet" are for Y-sorting)
 * - Red dashed circle = collision radius
 * - Once image files are added to assets/doodads/, they will automatically display
 */
export const COMPOUND_BUILDINGS: CompoundBuilding[] = [
  // ===== GUARD POSTS (4 corners - symmetrically positioned) =====
  // Collision at anchor point (worldY) - where building visually touches ground
  // Light source at 70% up from sprite bottom (like a street lamp)
  // Light Y offset calculation: spriteBottom - (0.7 * height) relative to anchor
  // = (anchorYOffset) - (0.7 * height) = 72 - 268.8 = -196.8 (below anchor)
  // Since positive offsetY moves UP, and we want 70% up from bottom:
  // offsetY = height * 0.7 - anchorYOffset = 268.8 - 72 = ~197 pixels above anchor
  {
    id: 'guardpost_nw',
    offsetX: -600,
    offsetY: -600,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0, // Collision at anchor point
    lightSource: {
      radius: 250,     // Street lamp light radius
      offsetX: 0,      // Centered horizontally
      offsetY: 100,    // 70% up from bottom of sprite (384 * 0.7 - 72)
      color: { r: 255, g: 220, b: 150 }, // Warm street lamp glow
      intensity: 1.0,
    },
  },
  {
    id: 'guardpost_ne',
    offsetX: 600,
    offsetY: -600,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 },
      intensity: 1.0,
    },
  },
  {
    id: 'guardpost_sw',
    offsetX: -600,
    offsetY: 650,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 },
      intensity: 1.0,
    },
  },
  {
    id: 'guardpost_se',
    offsetX: 600,
    offsetY: 650,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 },
      intensity: 1.0,
    },
  },
  
  // ===== ADDITIONAL GUARD POSTS (near center and strategic locations) =====
  // Guardpost near center building (shed) - west side
  {
    id: 'guardpost_center_west',
    offsetX: -200,
    offsetY: 450,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 },
      intensity: 1.0,
    },
  },
  
  // Guardpost near center building (shed) - east side
  {
    id: 'guardpost_center_east',
    offsetX: 200,
    offsetY: 450,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 },
      intensity: 1.0,
    },
  },
  
  // Guardpost between warehouse and garage (west side, mid-south)
  {
    id: 'guardpost_west_mid',
    offsetX: -450,
    offsetY: 50,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 },
      intensity: 1.0,
    },
  },
  
  // Guardpost between barracks and fuel depot (east side, mid-south)
  {
    id: 'guardpost_east_mid',
    offsetX: 450,
    offsetY: 50,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 },
      intensity: 1.0,
    },
  },
  
  // Guardpost near north entrance area (center-north)
  {
    id: 'guardpost_north_center',
    offsetX: 0,
    offsetY: -650,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 },
      intensity: 1.0,
    },
  },
  
  // Guardpost near warehouse (northwest area)
  {
    id: 'guardpost_northwest_inner',
    offsetX: -300,
    offsetY: -400,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 },
      intensity: 1.0,
    },
  },
  
  // Guardpost near barracks (northeast area)
  {
    id: 'guardpost_northeast_inner',
    offsetX: 300,
    offsetY: -400,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 },
      intensity: 1.0,
    },
  },
  
  
  // Guardpost in middle of south wall, just north of it
  {
    id: 'guardpost_south_wall_center',
    offsetX: 0,
    offsetY: 700,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 },
      intensity: 1.0,
    },
  },
  
  // ===== LARGE WAREHOUSE =====
  {
    id: 'warehouse',
    offsetX: -450,
    offsetY: -300,
    imagePath: 'warehouse.png',
    width: 480,
    height: 480,
    anchorYOffset: 96,
    collisionRadius: 150,
    collisionYOffset: 0,
  },
  
  // ===== BARRACKS =====
  {
    id: 'barracks',
    offsetX: 450,
    offsetY: -300,
    imagePath: 'barracks.png',
    width: 480,
    height: 480,
    anchorYOffset: 96,
    collisionRadius: 150,
    collisionYOffset: 0,
  },
  
  // ===== FUEL DEPOT =====
  {
    id: 'fuel_depot',
    offsetX: 450,
    offsetY: 400,
    imagePath: 'fuel_depot.png',
    width: 480,
    height: 480,
    anchorYOffset: 96,
    collisionRadius: 140,
    collisionYOffset: 0,
  },
  
  // ===== GARAGE =====
  {
    id: 'garage',
    offsetX: -450,
    offsetY: 400,
    imagePath: 'garage.png',
    width: 480,
    height: 480,
    anchorYOffset: 96,
    collisionRadius: 140,
    collisionYOffset: 0,
  },
  
  // ===== UTILITY SHED =====
  {
    id: 'shed',
    offsetX: 0,
    offsetY: 500,
    imagePath: 'shed.png',
    width: 384,
    height: 480,
    anchorYOffset: 84,
    collisionRadius: 100,
    collisionYOffset: 0,
  },
  
  // ===== STREET LIGHTS AT CENTRAL ALK BUILDING =====
  // Street light west of central building
  {
    id: 'streetlight_central_west',
    offsetX: -150,
    offsetY: 50,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 }, // Warm street lamp glow
      intensity: 1.0,
    },
  },
  
  // Street light east of central building
  {
    id: 'streetlight_central_east',
    offsetX: 150,
    offsetY: 50,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 30,
    collisionYOffset: 0,
    lightSource: {
      radius: 250,
      offsetX: 0,
      offsetY: 100,
      color: { r: 255, g: 220, b: 150 }, // Warm street lamp glow
      intensity: 1.0,
    },
  },
];

/**
 * Get all compound buildings with their calculated world positions.
 * Useful for rendering and filtering.
 */
export function getCompoundBuildingsWithPositions(): Array<CompoundBuilding & { worldX: number; worldY: number; ySortY: number }> {
  return COMPOUND_BUILDINGS.map(building => {
    const worldPos = getBuildingWorldPosition(building);
    return {
      ...building,
      worldX: worldPos.x,
      worldY: worldPos.y,
      ySortY: getBuildingYSortPosition(building),
    };
  });
}

/**
 * Get compound buildings that have light sources.
 * Returns buildings with their world positions and light source info.
 * Used by the day/night cycle to render light cutouts.
 */
export function getCompoundBuildingsWithLights(): Array<{
  building: CompoundBuilding;
  worldX: number;
  worldY: number;
  lightWorldX: number;
  lightWorldY: number;
}> {
  return COMPOUND_BUILDINGS
    .filter(building => building.lightSource !== undefined)
    .map(building => {
      const worldPos = getBuildingWorldPosition(building);
      const lightSource = building.lightSource!;
      return {
        building,
        worldX: worldPos.x,
        worldY: worldPos.y,
        // Light position: centered by default, offset by lightSource offsets
        lightWorldX: worldPos.x + (lightSource.offsetX ?? 0),
        // Light Y: anchor Y minus offsetY (positive offsetY = higher on screen = lower Y value)
        lightWorldY: worldPos.y - lightSource.offsetY,
      };
    });
}

/**
 * Size configuration for monument part types.
 * Maps partType to display dimensions (width, height).
 * All monument images are typically 1024x1024, scaled down for visual balance.
 */
const MONUMENT_PART_SIZES: Record<string, { width: number; height: number }> = {
  // Shipwreck parts (default size for ship parts)
  'hull': { width: 512, height: 512 },
  'bow': { width: 512, height: 512 },
  'stern': { width: 512, height: 512 },
  'mast': { width: 512, height: 512 },
  
  // Fishing Village parts
  'campfire': { width: 256, height: 256 },
  'hut': { width: 512, height: 512 },
  'dock': { width: 384, height: 384 },
  'smokerack': { width: 256, height: 256 },
  'kayak': { width: 320, height: 320 },
  
  // Whale Bone Graveyard parts
  'ribcage': { width: 640, height: 640 },
  'skull': { width: 480, height: 480 },
  'spine': { width: 512, height: 512 },
  'jawbone': { width: 384, height: 384 },
  'hermit_hut': { width: 400, height: 400 },
  
  // Hunting Village parts
  'lodge': { width: 512, height: 512 },
  'drying_rack': { width: 320, height: 320 },
  
  // Crashed Research Drone parts
  'drone': { width: 512, height: 512 },
  
  // Weather Station parts (ALPINE - 2x scale for large radar dish)
  'radar': { width: 768, height: 768 }, // 2x scale for visibility
  
  // Wolf Den parts (TUNDRA - wolf pack spawn point)
  'mound': { width: 384, height: 384 },
  
  // Hot Spring parts
  'shack': { width: 384, height: 384 },
  
  // Default fallback
  'default': { width: 512, height: 512 },
};

/**
 * Get the display size for a monument part based on its partType.
 * Falls back to default size if partType is not found.
 */
function getMonumentPartSize(partType: string): { width: number; height: number } {
  return MONUMENT_PART_SIZES[partType] || MONUMENT_PART_SIZES['default'];
}

/**
 * Monument part from database (unified format for all monument types).
 */
export interface MonumentPartData {
  id: bigint;
  worldX: number;
  worldY: number;
  imagePath: string;
  partType: string;
  isCenter: boolean;
  collisionRadius: number;
  monumentType: string; // Tag from MonumentType enum (e.g., 'Shipwreck', 'FishingVillage')
}

/**
 * Convert ALL monument parts from database to compound building format in a single pass.
 * This is more efficient than filtering by type separately.
 * Handles: Shipwreck, FishingVillage, WhaleBoneGraveyard, HuntingVillage, and any future monuments.
 */
export function getMonumentBuildings(monumentParts: MonumentPartData[]): CompoundBuilding[] {
  const center = getWorldCenter();
  
  return monumentParts
    .filter(part => part.imagePath && part.imagePath.length > 0) // Skip parts with empty images
    .map((part, index) => {
      // Calculate offset from world center (matching compound building pattern)
      const offsetX = part.worldX - center.x;
      const offsetY = part.worldY - center.y;
      
      // Get size based on part type
      const { width, height } = getMonumentPartSize(part.partType);
      
      // Generate unique ID based on monument type
      // Convert CamelCase to snake_case: WhaleBoneGraveyard -> whale_bone_graveyard
      // IMPORTANT: Insert underscores BEFORE converting to lowercase
      const idPrefix = part.monumentType.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase();
      
      return {
        id: `${idPrefix}_${part.id}_${index}`,
        imagePath: part.imagePath,
        offsetX,
        offsetY,
        width,
        height,
        anchorYOffset: 0, // Anchor at bottom of sprite
        collisionRadius: part.collisionRadius,
        collisionYOffset: 0,
        isCenter: part.isCenter,
      };
    });
}

/**
 * Get all compound buildings including static buildings and all monument parts.
 * Monument parts are processed in a single efficient pass.
 * This matches the compound buildings pattern: client-side rendering, server-side collision only.
 */
export function getAllCompoundBuildings(monumentParts?: MonumentPartData[]): CompoundBuilding[] {
  const staticBuildings = COMPOUND_BUILDINGS;
  const monumentBuildings = monumentParts ? getMonumentBuildings(monumentParts) : [];
  return [...staticBuildings, ...monumentBuildings];
}

