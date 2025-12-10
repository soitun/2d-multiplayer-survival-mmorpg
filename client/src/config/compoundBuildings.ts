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
  
  // ===== PERIMETER WALLS =====
  // Walls are slightly shorter than the compound to leave gaps at corners
  
  // North Wall (top, long horizontal) - moved further north, shortened for corner gaps
  {
    id: 'wall_north',
    offsetX: 0,
    offsetY: -690,  // Pushed down a bit from -750
    imagePath: 'wall_horizontal.png',
    width: 1000,  // Shortened from 1200 for corner gaps
    height: 64,
    anchorYOffset: 32,
    collisionRadius: 480,
    collisionYOffset: 0,
  },
  
  // South Wall (bottom, long horizontal) - moved further south, shortened for corner gaps
  {
    id: 'wall_south',
    offsetX: 0,
    offsetY: 740,  // Moved down from 550
    imagePath: 'wall_horizontal.png',
    width: 1000,  // Shortened from 1200 for corner gaps
    height: 64,
    anchorYOffset: 32,
    collisionRadius: 480,
    collisionYOffset: 0,
  },
  
  // West Wall (left, tall vertical) - pushed outward, shortened from bottom
  {
    id: 'wall_west',
    offsetX: -680,  // Pushed right a tad from -700
    offsetY: 50,  // Shifted up slightly (reducing bottom height)
    imagePath: 'wall_vertical.png',
    width: 64,
    height: 1100,  // Shortened from bottom (was 1200)
    anchorYOffset: 550,  // Half of 1100
    collisionRadius: 540,
    collisionYOffset: 0,
  },
  
  // East Wall (right, tall vertical) - pushed outward, shortened from bottom
  {
    id: 'wall_east',
    offsetX: 740,  // Pushed further out from 600
    offsetY: 50,  // Shifted up slightly (reducing bottom height)
    imagePath: 'wall_vertical.png',
    width: 64,
    height: 1100,  // Shortened from bottom (was 1200)
    anchorYOffset: 550,  // Half of 1100
    collisionRadius: 540,
    collisionYOffset: 0,
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
 * Convert shipwreck parts from database to compound building format.
 * Shipwrecks are dynamically placed during world generation, but then treated as static config.
 * Client reads shipwreck positions once on world load, then treats them like compound buildings.
 */
export function getShipwreckBuildings(shipwreckParts: Array<{
  id: bigint;
  worldX: number;
  worldY: number;
  imagePath: string;
  isCenter: boolean;
  collisionRadius: number;
}>): CompoundBuilding[] {
  const center = getWorldCenter();
  
  return shipwreckParts.map((part, index) => {
    // Calculate offset from world center (matching compound building pattern)
    const offsetX = part.worldX - center.x;
    const offsetY = part.worldY - center.y;
    
    // All ship parts are rendered at half size (512x512) for better spacing
    const width = 512;
    const height = 512;
    const anchorYOffset = 0; // Anchor at bottom of sprite
    
    return {
      id: `shipwreck_${part.id}`,
      offsetX,
      offsetY,
      imagePath: part.imagePath,
      width,
      height,
      anchorYOffset,
      collisionRadius: part.collisionRadius,
      collisionYOffset: 0,
    };
  });
}

/**
 * Get all compound buildings including shipwrecks.
 * Shipwrecks are read once from database during world load, then treated as static config.
 * This matches the compound buildings pattern: client-side rendering, server-side collision only.
 */
export function getAllCompoundBuildings(shipwreckParts?: Array<{
  id: bigint;
  worldX: number;
  worldY: number;
  imagePath: string;
  isCenter: boolean;
  collisionRadius: number;
}>): CompoundBuilding[] {
  const staticBuildings = COMPOUND_BUILDINGS;
  const shipwreckBuildings = shipwreckParts ? getShipwreckBuildings(shipwreckParts) : [];
  return [...staticBuildings, ...shipwreckBuildings];
}

