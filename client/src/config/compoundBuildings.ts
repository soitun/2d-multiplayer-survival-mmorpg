// client/src/config/compoundBuildings.ts
// ------------------------------------
// Static compound building definitions for the central compound area.
// Buildings are positioned relative to the world center and rendered client-side.
// Server mirrors collision data for movement validation.
// ------------------------------------

import { gameConfig } from './gameConfig';

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
  // Scaled to match ALK compound resolution (480x480 base)
  // Top-left corner guard post
  {
    id: 'guardpost_nw',
    offsetX: -600,
    offsetY: -600,
    imagePath: 'guardpost.png',
    width: 288,  // Scaled up from 96 (3x) to match ALK scale
    height: 384, // Scaled up from 128 (3x)
    anchorYOffset: 72,  // Scaled proportionally
    collisionRadius: 60, // Reduced collision size
    collisionYOffset: 45, // Scaled proportionally (15 * 3)
  },
  
  // Top-right corner guard post
  {
    id: 'guardpost_ne',
    offsetX: 600,
    offsetY: -600,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 60, // Reduced collision size
    collisionYOffset: 45,
  },
  
  // Bottom-left corner guard post
  {
    id: 'guardpost_sw',
    offsetX: -600,
    offsetY: 650,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 60, // Reduced collision size
    collisionYOffset: 45,
  },
  
  // Bottom-right corner guard post
  {
    id: 'guardpost_se',
    offsetX: 600,
    offsetY: 650,
    imagePath: 'guardpost.png',
    width: 288,
    height: 384,
    anchorYOffset: 72,
    collisionRadius: 60, // Reduced collision size
    collisionYOffset: 45,
  },
  
  // ===== LARGE WAREHOUSE (Northwest - pushed into corner) =====
  // Large building, scaled to match ALK compound size
  {
    id: 'warehouse',
    offsetX: -450,
    offsetY: -300,
    imagePath: 'warehouse.png',
    width: 480,  // Scaled to match ALK compound width
    height: 480, // Scaled to match ALK compound height
    anchorYOffset: 96,  // Scaled proportionally
    collisionRadius: 240, // Scaled proportionally (larger for big building)
    collisionYOffset: 48, // Scaled proportionally
  },
  
  // ===== BARRACKS (Northeast - pushed into corner) =====
  // Large building, scaled to match ALK compound size
  {
    id: 'barracks',
    offsetX: 450,
    offsetY: -300,
    imagePath: 'barracks.png',
    width: 480,  // Scaled to match ALK compound width
    height: 480, // Scaled to match ALK compound height
    anchorYOffset: 96,  // Scaled proportionally
    collisionRadius: 240, // Scaled proportionally (larger for big building)
    collisionYOffset: 48, // Scaled proportionally
  },
  
  // ===== FUEL DEPOT (Southeast - pushed into corner) =====
  // Medium building, scaled proportionally
  {
    id: 'fuel_depot',
    offsetX: 450,
    offsetY: 400,
    imagePath: 'fuel_depot.png',
    width: 480,  // Scaled up from 300 (1.6x) to match ALK scale
    height: 480, // Scaled up from 300 (1.6x)
    anchorYOffset: 96,  // Scaled proportionally
    collisionRadius: 192, // Scaled proportionally (80 * 2.4)
    collisionYOffset: 72, // Scaled proportionally (30 * 2.4)
  },
  
  // ===== GARAGE (Southwest - pushed into corner) =====
  // Medium building, scaled proportionally
  {
    id: 'garage',
    offsetX: -450,
    offsetY: 400,
    imagePath: 'garage.png',
    width: 480,  // Scaled up from 300 (1.6x) to match ALK scale
    height: 480, // Scaled up from 300 (1.6x)
    anchorYOffset: 96,  // Scaled proportionally
    collisionRadius: 192, // Scaled proportionally (80 * 2.4)
    collisionYOffset: 72, // Scaled proportionally (30 * 2.4)
  },
  
  // ===== UTILITY SHED (South Center - filling empty space) =====
  // Small utility building, scaled proportionally
  {
    id: 'shed',
    offsetX: 0,
    offsetY: 500,  // South center
    imagePath: 'shed.png',
    width: 384,  // Scaled up from 128 (3x) to match ALK scale
    height: 480, // Scaled up from 160 (3x)
    anchorYOffset: 84,  // Scaled proportionally
    collisionRadius: 120, // Scaled proportionally (40 * 3)
    collisionYOffset: 54, // Scaled proportionally (18 * 3)
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

