/**
 * Tiller Preview Rendering Utilities
 * 
 * Renders a preview overlay showing which tile will be tilled when using the Stone Tiller.
 * Shows brown for tillable tiles, gray for already-tilled/dirt, red for non-tillable.
 */

import { DbConnection } from '../../generated';
import { gameConfig, TILE_SIZE } from '../../config/gameConfig';

const HALF_TILE = TILE_SIZE / 2; // 24px - dual-grid offset

// Tile types that cannot be tilled (matching server can_be_tilled logic)
const NON_TILLABLE_TYPES = ['Sea', 'HotSpringWater', 'Asphalt', 'DirtRoad', 'Quarry', 'Beach', 'Sand'];

// Tile types that are already prepared soil
const ALREADY_PREPARED_TYPES = ['Dirt', 'Tilled'];

/**
 * Convert u8 tile type to string tag (matching server TileType enum)
 */
function tileTypeU8ToTag(tileTypeU8: number): string {
  switch (tileTypeU8) {
    case 0: return 'Grass';
    case 1: return 'Dirt';
    case 2: return 'DirtRoad';
    case 3: return 'Sea';
    case 4: return 'Beach';
    case 5: return 'Sand';
    case 6: return 'HotSpringWater';
    case 7: return 'Quarry';
    case 8: return 'Asphalt';
    case 9: return 'Forest';
    case 10: return 'Tundra';
    case 11: return 'Alpine';
    case 12: return 'TundraGrass';
    case 13: return 'Tilled';
    default: return 'Grass';
  }
}

/**
 * Get tile type at a specific tile coordinate from chunk data
 */
function getTileTypeAtTile(connection: DbConnection, tileX: number, tileY: number): string | null {
  const chunkSize = gameConfig.chunkSizeTiles;
  const chunkX = Math.floor(tileX / chunkSize);
  const chunkY = Math.floor(tileY / chunkSize);
  
  for (const chunk of connection.db.worldChunkData.iter()) {
    if (chunk.chunkX === chunkX && chunk.chunkY === chunkY) {
      // Handle negative coordinates properly
      const localTileX = ((tileX % chunkSize) + chunkSize) % chunkSize;
      const localTileY = ((tileY % chunkSize) + chunkSize) % chunkSize;
      const tileIndex = localTileY * chunkSize + localTileX;
      
      if (tileIndex >= 0 && tileIndex < chunk.tileTypes.length) {
        return tileTypeU8ToTag(chunk.tileTypes[tileIndex]);
      }
      break;
    }
  }
  
  return null;
}

/**
 * Check if a world position is within a monument zone
 */
function isInMonumentZone(connection: DbConnection, worldX: number, worldY: number): boolean {
  const MONUMENT_RESTRICTION_RADIUS_SQ = 800 * 800;
  
  // Check ALK stations
  for (const station of connection.db.alkStation.iter()) {
    if (!station.isActive) continue;
    const dx = worldX - station.worldPosX;
    const dy = worldY - station.worldPosY;
    const distSq = dx * dx + dy * dy;
    const multiplier = station.stationId === 0 ? 7.0 : 3.0;
    const restrictionRadius = station.interactionRadius * multiplier;
    if (distSq <= restrictionRadius * restrictionRadius) {
      return true;
    }
  }
  
  // Check rune stones
  for (const runeStone of connection.db.runeStone.iter()) {
    const dx = worldX - runeStone.posX;
    const dy = worldY - runeStone.posY;
    const distSq = dx * dx + dy * dy;
    if (distSq <= MONUMENT_RESTRICTION_RADIUS_SQ) {
      return true;
    }
  }
  
  return false;
}

export interface TillerPreviewParams {
  ctx: CanvasRenderingContext2D;
  connection: DbConnection;
  playerX: number;
  playerY: number;
  facingDirection: string;
}

export interface TillerPreviewResult {
  tileWorldX: number;
  tileWorldY: number;
  canTill: boolean;
  isAlreadyTilled: boolean;
}

/**
 * Calculate the target tile for the tiller based on player position and facing direction.
 * Matches server-side calculation in active_equipment.rs
 */
export function calculateTillerTarget(
  playerX: number,
  playerY: number,
  facingDirection: string
): { targetTileX: number; targetTileY: number; targetWorldX: number; targetWorldY: number } {
  // Calculate direction vector (matching server logic)
  let dirX = 0;
  let dirY = 0;
  switch (facingDirection) {
    case 'up':    dirY = -1; break;
    case 'down':  dirY = 1; break;
    case 'left':  dirX = -1; break;
    case 'right': dirX = 1; break;
  }
  
  // Match server calculation: till_x = player.position_x + dir_x * TILE_SIZE_PX
  const targetWorldX = playerX + dirX * TILE_SIZE;
  const targetWorldY = playerY + dirY * TILE_SIZE;
  
  // Convert to tile coordinates using floor (matching server world_pos_to_tile_coords)
  const targetTileX = Math.floor(targetWorldX / TILE_SIZE);
  const targetTileY = Math.floor(targetWorldY / TILE_SIZE);
  
  return { targetTileX, targetTileY, targetWorldX, targetWorldY };
}

/**
 * Check if a tile can be tilled
 */
export function canTillTile(
  connection: DbConnection,
  targetTileX: number,
  targetTileY: number,
  targetWorldX: number,
  targetWorldY: number
): { canTill: boolean; isAlreadyTilled: boolean } {
  let canTill = true;
  let isAlreadyTilled = false;
  
  // Get tile type from chunk data
  const tileType = getTileTypeAtTile(connection, targetTileX, targetTileY);
  
  if (tileType) {
    // Cannot till certain tile types
    if (NON_TILLABLE_TYPES.includes(tileType)) {
      canTill = false;
    }
    // Already prepared soil: Dirt or Tilled
    if (ALREADY_PREPARED_TYPES.includes(tileType)) {
      canTill = false;
      isAlreadyTilled = true;
    }
  }
  
  // Check if on monument zone
  if (canTill && isInMonumentZone(connection, targetWorldX, targetWorldY)) {
    canTill = false;
  }
  
  return { canTill, isAlreadyTilled };
}

/**
 * Render the tiller target preview overlay
 * 
 * NOTE: The dual-grid autotiling system renders tiles at half-tile offsets.
 * When a logical tile at (tileX, tileY) is tilled:
 * - The base texture renders at (tileX * 48, tileY * 48)
 * - The transition overlays render at ((tileX ± 0.5) * 48, (tileY ± 0.5) * 48)
 * 
 * This creates a visual "center" of the tilled area that appears offset.
 * We draw the preview at the logical tile position but offset by half a tile
 * to match where the visual center of the tilled area will appear.
 */
export function renderTillerPreview(params: TillerPreviewParams): TillerPreviewResult | null {
  const { ctx, connection, playerX, playerY, facingDirection } = params;
  
  // Calculate target tile
  const { targetTileX, targetTileY, targetWorldX, targetWorldY } = calculateTillerTarget(
    playerX,
    playerY,
    facingDirection
  );
  
  // Logical tile top-left position
  const tileWorldX = targetTileX * TILE_SIZE;
  const tileWorldY = targetTileY * TILE_SIZE;
  
  // Apply dual-grid offset for visual alignment
  // The visual "center" of the tile in the dual-grid system is at (tileX + 0.5, tileY + 0.5) * TILE_SIZE
  // So we offset the preview to match where the dirt will visually appear
  const previewX = tileWorldX - HALF_TILE;
  const previewY = tileWorldY - HALF_TILE;
  
  // Check if tile can be tilled
  const { canTill, isAlreadyTilled } = canTillTile(
    connection,
    targetTileX,
    targetTileY,
    targetWorldX,
    targetWorldY
  );
  
  // Draw the preview rectangle with dual-grid offset
  ctx.save();
  if (canTill) {
    ctx.fillStyle = 'rgba(139, 115, 85, 0.35)'; // Semi-transparent brown (dirt color)
    ctx.strokeStyle = 'rgba(139, 115, 85, 0.9)'; // Solid brown border
  } else if (isAlreadyTilled) {
    ctx.fillStyle = 'rgba(128, 128, 128, 0.35)'; // Semi-transparent gray
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.9)'; // Solid gray border
  } else {
    ctx.fillStyle = 'rgba(200, 50, 50, 0.35)'; // Semi-transparent red
    ctx.strokeStyle = 'rgba(200, 50, 50, 0.9)'; // Solid red border
  }
  ctx.lineWidth = 2;
  ctx.fillRect(previewX, previewY, TILE_SIZE, TILE_SIZE);
  ctx.strokeRect(previewX, previewY, TILE_SIZE, TILE_SIZE);
  ctx.restore();
  
  return { tileWorldX, tileWorldY, canTill, isAlreadyTilled };
}
