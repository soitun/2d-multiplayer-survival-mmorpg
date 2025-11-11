/**
 * Foundation Rendering Utilities
 * 
 * Renders building foundations using PNG tile images.
 * Also renders walls as thin rectangles on tile edges.
 */

import { FoundationCell } from '../../generated';
// WallCell will be available after regenerating client bindings
// For now, using any type - will be fixed after running: spacetime generate --lang typescript --out-dir ../client/src/generated --project-path .
import { TILE_SIZE, FOUNDATION_TILE_SIZE, foundationCellToWorldPixels } from '../../config/gameConfig';
import React from 'react';
import { drawDynamicGroundShadow } from './shadowUtils'; // ADDED: For wall shadows

// Foundation colors for preview (cyberpunk neon theme)
const FOUNDATION_PREVIEW_COLORS = {
  valid: 'rgba(0, 255, 255, 0.4)',    // Neon cyan, semi-transparent
  invalid: 'rgba(255, 0, 255, 0.4)', // Neon magenta, semi-transparent
};

export interface RenderFoundationParams {
  ctx: CanvasRenderingContext2D;
  foundation: FoundationCell;
  worldScale: number;
  viewOffsetX: number;
  viewOffsetY: number;
  foundationTileImagesRef?: React.RefObject<Map<string, HTMLImageElement>>; // ADDED: Foundation tile images
  allFoundations?: Map<string, any>; // ADDED: All foundations to check for adjacent foundations
}

export interface RenderFoundationPreviewParams {
  ctx: CanvasRenderingContext2D;
  cellX: number;
  cellY: number;
  shape: number; // FoundationShape enum (0-5)
  tier: number;  // BuildingTier enum (0-2)
  isValid: boolean;
  worldScale: number;
  viewOffsetX: number;
  viewOffsetY: number;
  foundationTileImagesRef?: React.RefObject<Map<string, HTMLImageElement>>; // ADDED: Foundation tile images
}

/**
 * Get foundation tile image filename based on tier
 */
function getFoundationTileFilename(tier: number): string {
  switch (tier) {
    case 0: return 'foundation_twig.png'; // Twig (default tier)
    case 1: return 'foundation_wood.png'; // Wood
    case 2: return 'foundation_stone.png'; // Stone
    case 3: return 'foundation_metal.png'; // Metal
    default: return 'foundation_twig.png'; // Default to twig
  }
}

/**
 * Get wall tile image filename based on tier
 * Note: Interior walls now use the same image as exterior walls (with visual modifications in rendering)
 */
function getWallTileFilename(tier: number, isInterior: boolean = false): string {
  // Always return the regular wall image - interior walls will be modified visually during rendering
  switch (tier) {
    case 0: return 'wall_twig.png'; // Twig (default tier)
    case 1: return 'wall_wood.png'; // Wood
    case 2: return 'wall_stone.png'; // Stone
    case 3: return 'wall_metal.png'; // Metal
    default: return 'wall_twig.png'; // Default to twig
  }
}

/**
 * Convert foundation cell coordinates to world pixel coordinates (top-left corner of foundation cell)
 */
function cellToWorldPixels(cellX: number, cellY: number): { x: number; y: number } {
  return foundationCellToWorldPixels(cellX, cellY);
}

/**
 * Set up clipping path for triangle foundation shapes
 */
function setupTriangleClipPath(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  screenSize: number,
  shape: number
): void {
  ctx.beginPath();
  
  // Triangle shapes: 2=TriNW, 3=TriNE, 4=TriSE, 5=TriSW
  switch (shape) {
    case 2: // TriNW - Top-left triangle
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX + screenSize, screenY);
      ctx.lineTo(screenX, screenY + screenSize);
      ctx.closePath();
      break;
    case 3: // TriNE - Top-right triangle
      ctx.moveTo(screenX + screenSize, screenY);
      ctx.lineTo(screenX + screenSize, screenY + screenSize);
      ctx.lineTo(screenX, screenY);
      ctx.closePath();
      break;
    case 4: // TriSE - Bottom-right triangle
      ctx.moveTo(screenX + screenSize, screenY + screenSize);
      ctx.lineTo(screenX, screenY + screenSize);
      ctx.lineTo(screenX + screenSize, screenY);
      ctx.closePath();
      break;
    case 5: // TriSW - Bottom-left triangle
      ctx.moveTo(screenX, screenY + screenSize);
      ctx.lineTo(screenX, screenY);
      ctx.lineTo(screenX + screenSize, screenY + screenSize);
      ctx.closePath();
      break;
    default:
      // Not a triangle, don't set up clipping
      return;
  }
  
  ctx.clip();
}

/**
 * Render a foundation cell
 */
export function renderFoundation({
  ctx,
  foundation,
  worldScale,
  viewOffsetX,
  viewOffsetY,
  foundationTileImagesRef,
  allFoundations,
}: RenderFoundationParams): void {
  if (foundation.isDestroyed) {
    // Don't render destroyed foundations (or render them differently)
    return;
  }

  const { x: worldX, y: worldY } = cellToWorldPixels(foundation.cellX, foundation.cellY);
  
  // Since canvas context is already translated by camera offset,
  // we just use world coordinates directly (same as preview)
  const screenX = worldX;
  const screenY = worldY;
  const screenSize = FOUNDATION_TILE_SIZE * worldScale;

  // Get foundation tile image
  const tileFilename = getFoundationTileFilename(foundation.tier);
  const tileImage = foundationTileImagesRef?.current?.get(tileFilename);

  ctx.save();

  // Set up clipping path for triangle shapes
  const isTriangle = foundation.shape >= 2 && foundation.shape <= 5;
  if (isTriangle) {
    setupTriangleClipPath(ctx, screenX, screenY, screenSize, foundation.shape);
  }

  if (tileImage && tileImage.complete && tileImage.naturalHeight !== 0) {
    // Draw foundation tile image (clipped to triangle if needed)
    ctx.drawImage(tileImage, screenX, screenY, screenSize, screenSize);
  } else {
    // Fallback: Draw colored rectangle if image not loaded (clipped to triangle if needed)
    ctx.fillStyle = '#2A4A5A'; // Dark cyan-blue fallback
    ctx.fillRect(screenX, screenY, screenSize, screenSize);
  }

  ctx.restore();

  // Check which edges have adjacent foundations - only draw borders on exposed edges
  let hasNorthFoundation = false;
  let hasSouthFoundation = false;
  let hasEastFoundation = false;
  let hasWestFoundation = false;
  
  if (allFoundations) {
    for (const [_, otherFoundation] of allFoundations) {
      if (otherFoundation.isDestroyed) continue;
      
      // Check adjacent cells
      if (otherFoundation.cellX === foundation.cellX && otherFoundation.cellY === foundation.cellY - 1) {
        hasNorthFoundation = true;
      }
      if (otherFoundation.cellX === foundation.cellX && otherFoundation.cellY === foundation.cellY + 1) {
        hasSouthFoundation = true;
      }
      if (otherFoundation.cellX === foundation.cellX + 1 && otherFoundation.cellY === foundation.cellY) {
        hasEastFoundation = true;
      }
      if (otherFoundation.cellX === foundation.cellX - 1 && otherFoundation.cellY === foundation.cellY) {
        hasWestFoundation = true;
      }
    }
  }

  // Draw borders only on exposed edges (not shared with adjacent foundations)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  
  if (isTriangle) {
    // Draw triangle border, but skip edges with adjacent foundations
    ctx.beginPath();
    let pathStarted = false;
    
    switch (foundation.shape) {
      case 2: // TriNW - has top, left, and diagonal edges
        // Top edge
        if (!hasNorthFoundation) {
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(screenX + screenSize, screenY);
          pathStarted = true;
        }
        // Left edge
        if (!hasWestFoundation) {
          if (!pathStarted) {
            ctx.moveTo(screenX, screenY);
            pathStarted = true;
          }
          ctx.lineTo(screenX, screenY + screenSize);
        }
        // Diagonal edge (always draw - it's the hypotenuse)
        if (!pathStarted) {
          ctx.moveTo(screenX + screenSize, screenY);
        }
        ctx.lineTo(screenX, screenY + screenSize);
        break;
      case 3: // TriNE - has top, right, and diagonal edges
        // Top edge
        if (!hasNorthFoundation) {
          ctx.moveTo(screenX + screenSize, screenY);
          ctx.lineTo(screenX, screenY);
          pathStarted = true;
        }
        // Right edge
        if (!hasEastFoundation) {
          if (!pathStarted) {
            ctx.moveTo(screenX + screenSize, screenY);
            pathStarted = true;
          }
          ctx.lineTo(screenX + screenSize, screenY + screenSize);
        }
        // Diagonal edge (always draw)
        if (!pathStarted) {
          ctx.moveTo(screenX, screenY);
        }
        ctx.lineTo(screenX + screenSize, screenY + screenSize);
        break;
      case 4: // TriSE - has bottom, right, and diagonal edges
        // Bottom edge
        if (!hasSouthFoundation) {
          ctx.moveTo(screenX, screenY + screenSize);
          ctx.lineTo(screenX + screenSize, screenY + screenSize);
          pathStarted = true;
        }
        // Right edge
        if (!hasEastFoundation) {
          if (!pathStarted) {
            ctx.moveTo(screenX + screenSize, screenY + screenSize);
            pathStarted = true;
          }
          ctx.lineTo(screenX + screenSize, screenY);
        }
        // Diagonal edge (always draw)
        if (!pathStarted) {
          ctx.moveTo(screenX + screenSize, screenY);
        }
        ctx.lineTo(screenX, screenY + screenSize);
        break;
      case 5: // TriSW - has bottom, left, and diagonal edges
        // Bottom edge
        if (!hasSouthFoundation) {
          ctx.moveTo(screenX + screenSize, screenY + screenSize);
          ctx.lineTo(screenX, screenY + screenSize);
          pathStarted = true;
        }
        // Left edge
        if (!hasWestFoundation) {
          if (!pathStarted) {
            ctx.moveTo(screenX, screenY + screenSize);
            pathStarted = true;
          }
          ctx.lineTo(screenX, screenY);
        }
        // Diagonal edge (always draw)
        if (!pathStarted) {
          ctx.moveTo(screenX, screenY);
        }
        ctx.lineTo(screenX + screenSize, screenY + screenSize);
        break;
    }
    
    if (pathStarted || foundation.shape === 2 || foundation.shape === 3 || foundation.shape === 4 || foundation.shape === 5) {
      ctx.stroke();
    }
  } else {
    // Full foundation - draw rectangle border, but skip edges with adjacent foundations
    ctx.beginPath();
    let pathStarted = false;
    
    // Top edge
    if (!hasNorthFoundation) {
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX + screenSize, screenY);
      pathStarted = true;
    }
    
    // Right edge
    if (!hasEastFoundation) {
      if (!pathStarted) {
        ctx.moveTo(screenX + screenSize, screenY);
        pathStarted = true;
      }
      ctx.lineTo(screenX + screenSize, screenY + screenSize);
    }
    
    // Bottom edge
    if (!hasSouthFoundation) {
      if (!pathStarted) {
        ctx.moveTo(screenX + screenSize, screenY + screenSize);
        pathStarted = true;
      }
      ctx.lineTo(screenX, screenY + screenSize);
    }
    
    // Left edge
    if (!hasWestFoundation) {
      if (!pathStarted) {
        ctx.moveTo(screenX, screenY + screenSize);
        pathStarted = true;
      }
      ctx.lineTo(screenX, screenY);
    }
    
    if (pathStarted) {
      ctx.stroke();
    }
  }

  // Draw health bar if damaged (optional)
  if (foundation.health < foundation.maxHealth) {
    const healthPercent = foundation.health / foundation.maxHealth;
    const barWidth = screenSize * healthPercent;
    const barHeight = 3;
    const barY = screenY + screenSize - barHeight - 2;

    // Health bar background (red)
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(screenX, barY, screenSize, barHeight);

    // Health bar (green)
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(screenX, barY, barWidth, barHeight);
  }
}

/**
 * Render foundation preview (ghost) for placement
 * NOTE: Canvas context should already be translated by camera offset
 */
export function renderFoundationPreview({
  ctx,
  cellX,
  cellY,
  shape,
  tier,
  isValid,
  worldScale,
  viewOffsetX,
  viewOffsetY,
  foundationTileImagesRef,
}: RenderFoundationPreviewParams): void {
  const { x: worldX, y: worldY } = cellToWorldPixels(cellX, cellY);
  
  // Since canvas context is already translated by camera offset,
  // we need to account for that. viewOffsetX/Y is -cameraOffsetX/Y,
  // so we add it back to get screen coordinates.
  // Actually, since context is translated, we just use world coordinates directly!
  const screenX = worldX;
  const screenY = worldY;
  const screenSize = FOUNDATION_TILE_SIZE * worldScale;

  // Get foundation tile image
  const tileFilename = getFoundationTileFilename(tier);
  const tileImage = foundationTileImagesRef?.current?.get(tileFilename);

  ctx.save();

  // Set up clipping path for triangle shapes
  const isTriangle = shape >= 2 && shape <= 5;
  if (isTriangle) {
    setupTriangleClipPath(ctx, screenX, screenY, screenSize, shape);
  }

  // Apply preview tint (cyberpunk neon theme)
  if (isValid) {
    // Valid: Neon cyan tint
    ctx.globalAlpha = 0.5;
    ctx.filter = 'sepia(100%) hue-rotate(180deg) saturate(300%) brightness(1.2)';
  } else {
    // Invalid: Neon magenta tint
    ctx.globalAlpha = 0.5;
    ctx.filter = 'sepia(100%) hue-rotate(300deg) saturate(300%) brightness(1.2)';
  }

  if (tileImage && tileImage.complete && tileImage.naturalHeight !== 0) {
    // Draw foundation tile image with preview tint (clipped to triangle if needed)
    ctx.drawImage(tileImage, screenX, screenY, screenSize, screenSize);
  } else {
    // Fallback: Draw colored rectangle if image not loaded (clipped to triangle if needed)
    const color = isValid ? FOUNDATION_PREVIEW_COLORS.valid : FOUNDATION_PREVIEW_COLORS.invalid;
    ctx.fillStyle = color;
    ctx.fillRect(screenX, screenY, screenSize, screenSize);
  }

  ctx.restore();

  // Draw border (cyberpunk neon theme for preview)
  ctx.strokeStyle = isValid ? '#00FFFF' : '#FF00FF'; // Neon cyan or neon magenta
  ctx.lineWidth = 2;
  
  if (isTriangle) {
    // Draw triangle border
    ctx.beginPath();
    switch (shape) {
      case 2: // TriNW
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX + screenSize, screenY);
        ctx.lineTo(screenX, screenY + screenSize);
        ctx.closePath();
        break;
      case 3: // TriNE
        ctx.moveTo(screenX + screenSize, screenY);
        ctx.lineTo(screenX + screenSize, screenY + screenSize);
        ctx.lineTo(screenX, screenY);
        ctx.closePath();
        break;
      case 4: // TriSE
        ctx.moveTo(screenX + screenSize, screenY + screenSize);
        ctx.lineTo(screenX, screenY + screenSize);
        ctx.lineTo(screenX + screenSize, screenY);
        ctx.closePath();
        break;
      case 5: // TriSW
        ctx.moveTo(screenX, screenY + screenSize);
        ctx.lineTo(screenX, screenY);
        ctx.lineTo(screenX + screenSize, screenY + screenSize);
        ctx.closePath();
        break;
    }
    ctx.stroke();
  } else {
    // Draw rectangle border for full foundations
    ctx.strokeRect(screenX, screenY, screenSize, screenSize);
  }

  // Draw shape indicator (only for non-Full shapes, cyberpunk style)
  // Skip text for triangles - the visual triangle shape is clear enough
  if (shape === 0) { // Empty shape only
    ctx.fillStyle = isValid ? '#00FFFF' : '#FF00FF'; // Neon cyan or neon magenta
    ctx.font = `bold ${10 * worldScale}px 'Courier New', monospace`; // Monospace for cyberpunk feel
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Add text shadow for cyberpunk glow effect
    ctx.shadowColor = isValid ? '#00FFFF' : '#FF00FF';
    ctx.shadowBlur = 4;
    ctx.fillText('Empty', screenX + screenSize / 2, screenY + screenSize / 2);
    ctx.shadowBlur = 0; // Reset shadow
  }
}

/**
 * Render a highlight overlay on a targeted foundation (for upgrade targeting)
 */
export function renderFoundationTargetIndicator({
  ctx,
  foundation,
  worldScale,
  viewOffsetX,
  viewOffsetY,
}: {
  ctx: CanvasRenderingContext2D;
  foundation: FoundationCell;
  worldScale: number;
  viewOffsetX: number;
  viewOffsetY: number;
}): void {
  if (foundation.isDestroyed) {
    return;
  }

  const { x: worldX, y: worldY } = cellToWorldPixels(foundation.cellX, foundation.cellY);
  const screenX = worldX;
  const screenY = worldY;
  const screenSize = FOUNDATION_TILE_SIZE * worldScale;

  ctx.save();

  // Draw pulsing highlight overlay
  const pulsePhase = (Date.now() % 2000) / 2000; // 0 to 1 over 2 seconds
  const pulseAlpha = 0.3 + (Math.sin(pulsePhase * Math.PI * 2) * 0.2); // Pulse between 0.3 and 0.5

  const isTriangle = foundation.shape >= 2 && foundation.shape <= 5;
  if (isTriangle) {
    setupTriangleClipPath(ctx, screenX, screenY, screenSize, foundation.shape);
  }

  // Draw highlight overlay (golden/yellow tint for upgrade targeting)
  ctx.fillStyle = `rgba(255, 215, 0, ${pulseAlpha})`; // Gold color with pulsing alpha
  if (isTriangle) {
    ctx.fill(); // Fill clipped triangle path
  } else {
    ctx.fillRect(screenX, screenY, screenSize, screenSize);
  }

  // Draw border highlight
  ctx.strokeStyle = `rgba(255, 215, 0, ${0.8 + pulseAlpha * 0.2})`;
  ctx.lineWidth = 3;
  if (isTriangle) {
    // Draw triangle border - use the same coordinates as setupTriangleClipPath
    ctx.beginPath();
    switch (foundation.shape) {
      case 2: // TriNW - Top-left triangle
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX + screenSize, screenY);
        ctx.lineTo(screenX, screenY + screenSize);
        ctx.closePath();
        break;
      case 3: // TriNE - Top-right triangle
        ctx.moveTo(screenX + screenSize, screenY);
        ctx.lineTo(screenX + screenSize, screenY + screenSize);
        ctx.lineTo(screenX, screenY);
        ctx.closePath();
        break;
      case 4: // TriSE - Bottom-right triangle
        ctx.moveTo(screenX + screenSize, screenY + screenSize);
        ctx.lineTo(screenX, screenY + screenSize);
        ctx.lineTo(screenX + screenSize, screenY);
        ctx.closePath();
        break;
      case 5: // TriSW - Bottom-left triangle
        ctx.moveTo(screenX, screenY + screenSize);
        ctx.lineTo(screenX, screenY);
        ctx.lineTo(screenX + screenSize, screenY + screenSize);
        ctx.closePath();
        break;
    }
    ctx.stroke();
  } else {
    // Draw rectangle border
    ctx.strokeRect(screenX, screenY, screenSize, screenSize);
  }

  ctx.restore();
}

/**
 * Render a highlight overlay on a targeted wall (for upgrade targeting)
 */
export function renderWallTargetIndicator({
  ctx,
  wall,
  worldScale,
  viewOffsetX,
  viewOffsetY,
}: {
  ctx: CanvasRenderingContext2D;
  wall: any; // WallCell type
  worldScale: number;
  viewOffsetX: number;
  viewOffsetY: number;
}): void {
  if (wall.isDestroyed) {
    return;
  }

  const { x: worldX, y: worldY } = cellToWorldPixels(wall.cellX, wall.cellY);
  const screenX = worldX;
  const screenY = worldY;
  const screenSize = FOUNDATION_TILE_SIZE * worldScale;
  
  // Wall thickness constants (match actual wall rendering)
  const WALL_THICKNESS = 4 * worldScale; // For north/south walls
  const EAST_WEST_WALL_THICKNESS = 12 * worldScale; // For east/west walls
  const DIAGONAL_WALL_THICKNESS = 12 * worldScale; // For diagonal walls
  // Perspective correction: North walls (away from viewer) appear shorter
  const NORTH_WALL_HEIGHT = screenSize * 0.75; // 0.75 tiles tall (away from viewer)
  const SOUTH_WALL_HEIGHT = screenSize; // 1 tile tall (closer to viewer)

  ctx.save();

  // Draw pulsing highlight overlay
  const pulsePhase = (Date.now() % 2000) / 2000; // 0 to 1 over 2 seconds
  const pulseAlpha = 0.4 + (Math.sin(pulsePhase * Math.PI * 2) * 0.3); // Pulse between 0.4 and 0.7 (more visible)

  // Determine wall rectangle position and size based on edge (same logic as renderWall)
  let wallX = screenX;
  let wallY = screenY;
  let wallWidth = screenSize;
  let wallHeight = WALL_THICKNESS;

  switch (wall.edge) {
    case 0: // North (top edge) - highlight only the bottom rectangle on foundation edge, not the extension
      // The actual wall extends upward from screenY - screenSize + WALL_THICKNESS/2
      // The bottom edge of the wall (on foundation) is at screenY - screenSize + WALL_THICKNESS/2 + screenSize = screenY + WALL_THICKNESS/2
      // But we want to highlight just the thin rectangle at the foundation edge (screenY)
      wallX = screenX;
      wallY = screenY - WALL_THICKNESS / 2; // Top edge of foundation, centered on wall thickness
      wallWidth = screenSize;
      wallHeight = WALL_THICKNESS; // Just the thin rectangle, not the tall extension
      break;
    case 1: // East (right edge)
      wallX = screenX + screenSize - EAST_WEST_WALL_THICKNESS / 2;
      wallY = screenY;
      wallWidth = EAST_WEST_WALL_THICKNESS;
      wallHeight = screenSize;
      break;
    case 2: // South (bottom edge) - highlight only the bottom rectangle on foundation edge, not the extension
      // The actual wall extends upward from screenY + screenSize - screenSize = screenY
      // The bottom edge of the wall (on foundation) is at screenY + screenSize
      wallX = screenX;
      wallY = screenY + screenSize - WALL_THICKNESS / 2; // Bottom edge of foundation, centered on wall thickness
      wallWidth = screenSize;
      wallHeight = WALL_THICKNESS; // Just the thin rectangle, not the tall extension
      break;
    case 3: // West (left edge)
      wallX = screenX - EAST_WEST_WALL_THICKNESS / 2;
      wallY = screenY;
      wallWidth = EAST_WEST_WALL_THICKNESS;
      wallHeight = screenSize;
      break;
    case 4: // DiagNE_SW
    case 5: // DiagNW_SE
      // For diagonal walls, calculate hypotenuse coordinates
      const isTriangle = wall.foundationShape >= 2 && wall.foundationShape <= 5;
      let hypStartX: number, hypStartY: number, hypEndX: number, hypEndY: number;
      
      switch (wall.foundationShape) {
        case 2: // TriNW - DiagNW_SE (edge 5)
          hypStartX = screenX + screenSize;
          hypStartY = screenY;
          hypEndX = screenX;
          hypEndY = screenY + screenSize;
          break;
        case 3: // TriNE - DiagNE_SW (edge 4)
          hypStartX = screenX;
          hypStartY = screenY;
          hypEndX = screenX + screenSize;
          hypEndY = screenY + screenSize;
          break;
        case 4: // TriSE - DiagNW_SE (edge 5)
          hypStartX = screenX;
          hypStartY = screenY + screenSize;
          hypEndX = screenX + screenSize;
          hypEndY = screenY;
          break;
        case 5: // TriSW - DiagNE_SW (edge 4)
          hypStartX = screenX + screenSize;
          hypStartY = screenY + screenSize;
          hypEndX = screenX;
          hypEndY = screenY;
          break;
        default:
          hypStartX = screenX;
          hypStartY = screenY;
          hypEndX = screenX + screenSize;
          hypEndY = screenY + screenSize;
          break;
      }
      
      // Draw diagonal highlight
      ctx.strokeStyle = `rgba(255, 215, 0, ${0.9 + pulseAlpha * 0.1})`;
      ctx.lineWidth = DIAGONAL_WALL_THICKNESS + 4; // Thicker than wall for visibility
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hypStartX, hypStartY);
      ctx.lineTo(hypEndX, hypEndY);
      ctx.stroke();
      
      // Draw filled rectangle along diagonal for better visibility
      const centerX = (hypStartX + hypEndX) / 2;
      const centerY = (hypStartY + hypEndY) / 2;
      const angle = Math.atan2(hypEndY - hypStartY, hypEndX - hypStartX);
      const stripWidth = Math.sqrt((hypEndX - hypStartX) ** 2 + (hypEndY - hypStartY) ** 2);
      const stripHeight = DIAGONAL_WALL_THICKNESS + 4;
      
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(angle);
      ctx.fillStyle = `rgba(255, 215, 0, ${pulseAlpha})`;
      ctx.fillRect(-stripWidth / 2, -stripHeight / 2, stripWidth, stripHeight);
      ctx.restore();
      
      ctx.restore();
      return; // Early return for diagonal walls
    default:
      ctx.restore();
      return;
  }

  // Draw highlight overlay for cardinal walls (golden/yellow tint)
  ctx.fillStyle = `rgba(255, 215, 0, ${pulseAlpha})`;
  ctx.fillRect(wallX, wallY, wallWidth, wallHeight);

  // Draw border highlight (thicker and brighter)
  ctx.strokeStyle = `rgba(255, 215, 0, ${0.9 + pulseAlpha * 0.1})`;
  ctx.lineWidth = 4;
  ctx.strokeRect(wallX, wallY, wallWidth, wallHeight);

  ctx.restore();
}

/**
 * Render a wall cell as a thin rectangle on the edge of a foundation tile
 */
export interface RenderWallParams {
  ctx: CanvasRenderingContext2D;
  wall: any; // WallCell - will be properly typed after regenerating bindings
  worldScale: number;
  viewOffsetX: number;
  viewOffsetY: number;
  foundationTileImagesRef?: React.RefObject<Map<string, HTMLImageElement>>;
  allWalls?: Map<string, any>; // ADDED: All walls to check for adjacent walls
}

export function renderWall({
  ctx,
  wall,
  worldScale,
  viewOffsetX,
  viewOffsetY,
  foundationTileImagesRef,
  allWalls,
}: RenderWallParams): void {
  if (wall.isDestroyed) {
    return;
  }

  const { x: worldX, y: worldY } = cellToWorldPixels(wall.cellX, wall.cellY);
  
  const screenX = worldX;
  const screenY = worldY;
  const screenSize = FOUNDATION_TILE_SIZE * worldScale;
  
  // Wall thickness (thin rectangle)
  const WALL_THICKNESS = 4 * worldScale; // 4 pixels thick (for north/south walls)
  const EAST_WEST_WALL_THICKNESS = 12 * worldScale; // 12 pixels thick for east/west walls (more visible)
  const DIAGONAL_WALL_THICKNESS = 12 * worldScale; // 12 pixels thick for diagonal walls (more visible)
  
  // Get wall image based on tier (use wall-specific images)
  // North walls (edge 0) show the interior side since they're away from the viewer
  const isNorthWall = wall.edge === 0;
  const wallFilename = getWallTileFilename(wall.tier, isNorthWall);
  const wallImage = foundationTileImagesRef?.current?.get(wallFilename);
  
  // Debug: Log wall tier and image loading (only once per wall to avoid spam)
  if (wallImage === undefined && foundationTileImagesRef?.current) {
    console.warn(`[renderWall] Wall image not found for tier ${wall.tier}: ${wallFilename}. Available images:`, Array.from(foundationTileImagesRef.current.keys()));
  }
  
  ctx.save();
  
  // Determine wall rectangle position and size based on edge
  let wallX = screenX;
  let wallY = screenY;
  let wallWidth = screenSize;
  let wallHeight = WALL_THICKNESS;
  
  // Clip walls to tile boundaries to prevent diagonal artifacts at corners
  // Only clip cardinal edges (not diagonal)
  // North/south walls extend beyond tile boundaries, so don't clip them
  const isDiagonal = wall.edge === 4 || wall.edge === 5;
  const isNorthSouth = wall.edge === 0 || wall.edge === 2;
  if (!isDiagonal && !isNorthSouth) {
    // Only clip east/west walls to tile boundaries
    ctx.beginPath();
    ctx.rect(screenX, screenY, screenSize, screenSize);
    ctx.clip();
  }
  
  // Perspective correction: North walls (away from viewer) appear shorter than south walls (closer to viewer)
  const NORTH_WALL_HEIGHT = screenSize * 0.75; // 0.75 tiles tall (away from viewer, foreshortened)
  const SOUTH_WALL_HEIGHT = screenSize; // 1 tile tall (closer to viewer, full height)
  
  switch (wall.edge) {
    case 0: // North (top edge) - extend upward for isometric depth (SHORTER due to perspective)
      wallX = screenX;
      wallY = screenY - NORTH_WALL_HEIGHT + WALL_THICKNESS / 2; // Extend upward (shorter)
      wallWidth = screenSize;
      wallHeight = NORTH_WALL_HEIGHT;
      break;
    case 1: // East (right edge) - center on edge (half inside, half outside)
      wallX = screenX + screenSize - EAST_WEST_WALL_THICKNESS / 2;
      wallY = screenY;
      wallWidth = EAST_WEST_WALL_THICKNESS;
      wallHeight = screenSize;
      break;
    case 2: // South (bottom edge) - extend upward from bottom edge for isometric depth (TALLER as closer to viewer)
      wallX = screenX;
      // Start at bottom edge and extend UPWARD (negative Y direction for isometric depth)
      wallY = screenY + screenSize - SOUTH_WALL_HEIGHT; // Bottom edge minus wall height
      wallWidth = screenSize;
      wallHeight = SOUTH_WALL_HEIGHT;
      break;
    case 3: // West (left edge) - center on edge (half inside, half outside)
      wallX = screenX - EAST_WEST_WALL_THICKNESS / 2;
      wallY = screenY;
      wallWidth = EAST_WEST_WALL_THICKNESS;
      wallHeight = screenSize;
      break;
    case 4: // DiagNE_SW (diagonal from NE to SW)
    case 5: // DiagNW_SE (diagonal from NW to SE)
      // Diagonal walls - will be drawn as a path, not a rectangle
      wallX = screenX;
      wallY = screenY;
      wallWidth = screenSize;
      wallHeight = screenSize;
      break;
    default:
      // Invalid edge, don't render
      ctx.restore();
      return;
  }
  
  // For triangle foundations, we need to clip the wall to the triangle shape
  // But only if the wall edge is valid for this triangle shape
  const isTriangle = wall.foundationShape >= 2 && wall.foundationShape <= 5;
  
  // Check if this edge is valid for the triangle shape
  let isValidEdgeForTriangle = true;
  if (isTriangle) {
    // Triangle shapes: 2=TriNW, 3=TriNE, 4=TriSE, 5=TriSW
    // Valid edges for each triangle:
    // TriNW (2): N, W, DiagNW_SE edges (0, 3, 5)
    // TriNE (3): N, E, DiagNE_SW edges (0, 1, 4)
    // TriSE (4): S, E, DiagNW_SE edges (2, 1, 5)
    // TriSW (5): S, W, DiagNE_SW edges (2, 3, 4)
    switch (wall.foundationShape) {
      case 2: // TriNW
        isValidEdgeForTriangle = wall.edge === 0 || wall.edge === 3 || wall.edge === 5; // N, W, or DiagNW_SE
        break;
      case 3: // TriNE
        isValidEdgeForTriangle = wall.edge === 0 || wall.edge === 1 || wall.edge === 4; // N, E, or DiagNE_SW
        break;
      case 4: // TriSE
        isValidEdgeForTriangle = wall.edge === 2 || wall.edge === 1 || wall.edge === 5; // S, E, or DiagNW_SE
        break;
      case 5: // TriSW
        isValidEdgeForTriangle = wall.edge === 2 || wall.edge === 3 || wall.edge === 4; // S, W, or DiagNE_SW
        break;
    }
  }
  
  // Only render if edge is valid for triangle (or if not a triangle)
  if (isTriangle && !isValidEdgeForTriangle) {
    ctx.restore();
    return; // Don't render invalid wall on triangle foundation
  }
  
  // For diagonal walls on triangles, we need to clip to the triangle AND draw along the hypotenuse
  if (isTriangle && isValidEdgeForTriangle && (wall.edge === 4 || wall.edge === 5)) {
    ctx.save();
    setupTriangleClipPath(ctx, screenX, screenY, screenSize, wall.foundationShape);
  } else if (isTriangle && isValidEdgeForTriangle) {
    // For cardinal edges on triangles, clip to triangle shape
    ctx.save();
    setupTriangleClipPath(ctx, screenX, screenY, screenSize, wall.foundationShape);
  }
  
  // Draw wall rectangle or diagonal line
  const isDiagonalWall = wall.edge === 4 || wall.edge === 5;
  
  if (isDiagonalWall) {
    // For diagonal walls on triangles, draw along the hypotenuse (the outer edge)
    // Determine the hypotenuse coordinates based on triangle shape:
    // TriNW (2): DiagNW_SE (5) - hypotenuse from (screenX + screenSize, screenY) to (screenX, screenY + screenSize)
    // TriNE (3): DiagNE_SW (4) - hypotenuse from (screenX, screenY) to (screenX + screenSize, screenY + screenSize)
    // TriSE (4): DiagNW_SE (5) - hypotenuse from (screenX, screenY + screenSize) to (screenX + screenSize, screenY)
    // TriSW (5): DiagNE_SW (4) - hypotenuse from (screenX + screenSize, screenY + screenSize) to (screenX, screenY)
    
    let hypStartX: number, hypStartY: number, hypEndX: number, hypEndY: number;
    
    // Determine hypotenuse coordinates based on triangle shape
    switch (wall.foundationShape) {
      case 2: // TriNW - DiagNW_SE (edge 5)
        hypStartX = screenX + screenSize;
        hypStartY = screenY;
        hypEndX = screenX;
        hypEndY = screenY + screenSize;
        break;
      case 3: // TriNE - DiagNE_SW (edge 4)
        hypStartX = screenX;
        hypStartY = screenY;
        hypEndX = screenX + screenSize;
        hypEndY = screenY + screenSize;
        break;
      case 4: // TriSE - DiagNW_SE (edge 5)
        hypStartX = screenX;
        hypStartY = screenY + screenSize;
        hypEndX = screenX + screenSize;
        hypEndY = screenY;
        break;
      case 5: // TriSW - DiagNE_SW (edge 4)
        hypStartX = screenX + screenSize;
        hypStartY = screenY + screenSize;
        hypEndX = screenX;
        hypEndY = screenY;
        break;
      default:
        // Fallback (shouldn't happen)
        hypStartX = screenX;
        hypStartY = screenY;
        hypEndX = screenX + screenSize;
        hypEndY = screenY + screenSize;
        break;
    }
    
    // Draw diagonal wall texture (rotated strip along hypotenuse)
    if (wallImage && wallImage.complete && wallImage.naturalHeight !== 0) {
      ctx.save();
      // Calculate angle and center for rotation
      const centerX = (hypStartX + hypEndX) / 2;
      const centerY = (hypStartY + hypEndY) / 2;
      const angle = Math.atan2(hypEndY - hypStartY, hypEndX - hypStartX);
      
      ctx.translate(centerX, centerY);
      ctx.rotate(angle);
      ctx.translate(-centerX, -centerY);
      
      // Draw a strip along the diagonal
      const stripWidth = Math.sqrt((hypEndX - hypStartX) ** 2 + (hypEndY - hypStartY) ** 2);
      const stripHeight = DIAGONAL_WALL_THICKNESS;
      ctx.drawImage(
        wallImage,
        0, 0, wallImage.width, DIAGONAL_WALL_THICKNESS / worldScale, // Source
        centerX - stripWidth / 2, centerY - stripHeight / 2, stripWidth, stripHeight // Destination
      );
      ctx.restore();
    } else {
      // Fallback: Draw colored rectangle along hypotenuse
      const tierColors: Record<number, string> = {
        0: '#8B4513', // Twig - brown
        1: '#654321', // Wood - dark brown
        2: '#808080', // Stone - gray
        3: '#C0C0C0', // Metal - silver
      };
      ctx.save();
      const centerX = (hypStartX + hypEndX) / 2;
      const centerY = (hypStartY + hypEndY) / 2;
      const angle = Math.atan2(hypEndY - hypStartY, hypEndX - hypStartX);
      const stripWidth = Math.sqrt((hypEndX - hypStartX) ** 2 + (hypEndY - hypStartY) ** 2);
      const stripHeight = DIAGONAL_WALL_THICKNESS;
      
      ctx.translate(centerX, centerY);
      ctx.rotate(angle);
      ctx.fillStyle = tierColors[wall.tier] || '#8B4513';
      ctx.fillRect(-stripWidth / 2, -stripHeight / 2, stripWidth, stripHeight);
      ctx.restore();
    }
    
    // Draw black border along the hypotenuse (on the outer edge)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(hypStartX, hypStartY);
    ctx.lineTo(hypEndX, hypEndY);
    ctx.stroke();
  } else {
    // Draw cardinal wall as a visible rectangle
    // First draw the texture/image if available
    if (wallImage && wallImage.complete && wallImage.naturalHeight !== 0) {
      // Draw a portion of the wall tile image for the wall
      // For horizontal walls (N/S), we take a horizontal strip from the tile
      // For vertical walls (E/W), we take a vertical strip from the tile
      // Horizontal wall - draw scaled tile for north/south walls (taller for isometric)
      if (wall.edge === 0) {
        // North wall (interior) - use BOTTOM half of texture, make it lighter, add shadow at base
        const sourceY = wallImage.height * 0.5; // Start from middle (bottom half)
        const sourceHeight = wallImage.height * 0.5; // Bottom half of texture
        
        ctx.save();
        
        // Draw the bottom half of the image
        ctx.drawImage(
          wallImage,
          0, sourceY, wallImage.width, sourceHeight, // Source: BOTTOM half of texture
          wallX, wallY, wallWidth, wallHeight // Destination: wall dimensions (NORTH_WALL_HEIGHT)
        );
        
        // Apply darkening overlay (make it darker/shaded) for interior north walls
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.15; // Darkening intensity
        ctx.fillStyle = '#000000'; // Black for darkening
        ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
        
        // Reset composite operation
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        
        // Draw shadow BELOW the wall, projected onto the ground/foundation
        // Sea of Stars style - softer, more gradual fade
        // Shadow should be on the foundation tile below, not on the wall itself
        const shadowHeight = screenSize * 0.3; // Shadow extends onto the foundation below
        const shadowY = screenY; // Start at the top of the foundation tile (where wall meets ground)
        
        const shadowGradient = ctx.createLinearGradient(wallX, shadowY, wallX, shadowY + shadowHeight);
        shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)'); // More intense start
        shadowGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.3)'); // Gradual fade midpoint
        shadowGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)'); // Soft before end
        shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)'); // Fade to transparent at bottom
        ctx.fillStyle = shadowGradient;
        ctx.fillRect(wallX, shadowY, wallWidth, shadowHeight);
        
        ctx.restore();
      } else if (wall.edge === 2) {
        // South wall - use full texture for full height (1 tile)
        ctx.drawImage(
          wallImage,
          0, 0, wallImage.width, wallImage.height, // Source: full tile
          wallX, wallY, wallWidth, wallHeight // Destination: full wall (SOUTH_WALL_HEIGHT)
        );
      } else {
        // Vertical wall - draw vertical strip from tile
        const sourceX = wall.edge === 3 ? 0 : wallImage.width - EAST_WEST_WALL_THICKNESS / worldScale;
        ctx.drawImage(
          wallImage,
          sourceX, 0, EAST_WEST_WALL_THICKNESS / worldScale, wallImage.height, // Source
          wallX, wallY, wallWidth, wallHeight // Destination
        );
      }
    } else {
      // Fallback: Draw colored rectangle
      const tierColors: Record<number, string> = {
        0: '#8B4513', // Twig - brown
        1: '#654321', // Wood - dark brown
        2: '#808080', // Stone - gray
        3: '#C0C0C0', // Metal - silver
      };
      
      if (wall.edge === 0 || wall.edge === 2) {
        // North/south walls - draw full wall extension
        ctx.fillStyle = tierColors[wall.tier] || '#8B4513';
        ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
        
        // For north walls (interior), make them lighter and add shadow
        if (wall.edge === 0) {
          ctx.save();
          // Apply darkening overlay (make it darker/shaded) for interior north walls
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = 0.3; // Darkening intensity
          ctx.fillStyle = '#000000'; // Black for darkening
          ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
          
          // Reset composite operation
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1.0;
          
          // Draw shadow BELOW the wall, projected onto the ground/foundation (fallback)
          // Sea of Stars style - softer, more gradual fade
          // Shadow should be on the foundation tile below, not on the wall itself
          const shadowHeight = screenSize * 0.3; // Shadow extends onto the foundation below
          const shadowY = screenY; // Start at the top of the foundation tile (where wall meets ground)
          
          const shadowGradient = ctx.createLinearGradient(wallX, shadowY, wallX, shadowY + shadowHeight);
          shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)'); // More intense start
          shadowGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.3)'); // Gradual fade midpoint
          shadowGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)'); // Soft before end
          shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)'); // Fade to transparent at bottom
          ctx.fillStyle = shadowGradient;
          ctx.fillRect(wallX, shadowY, wallWidth, shadowHeight);
          ctx.restore();
        }
      } else {
        // East/west walls - draw normally
        ctx.fillStyle = tierColors[wall.tier] || '#8B4513';
        ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
      }
    }
    
    // For north walls, check if we need to draw vertical side walls (support beams)
    // Only draw on the leftmost and rightmost north walls (edges of the structure)
    // This runs AFTER the main wall rendering (both image and fallback paths)
    if (wall.edge === 0 && allWalls) {
      // Check if there's a north wall on adjacent cells to determine if this is an edge wall
      let hasNorthWallToLeft = false; // Check cell to the left (cellX - 1)
      let hasNorthWallToRight = false; // Check cell to the right (cellX + 1)
      
      for (const [_, otherWall] of allWalls) {
        if (otherWall.isDestroyed) continue;
        // Skip checking against self (though this shouldn't happen with adjacent cell checks)
        if (otherWall.cellX === wall.cellX && otherWall.cellY === wall.cellY && otherWall.edge === wall.edge) {
          continue;
        }
        // Check for north wall on cell to the left (same row)
        if (otherWall.cellX === wall.cellX - 1 && otherWall.cellY === wall.cellY && otherWall.edge === 0) {
          hasNorthWallToLeft = true;
          if (hasNorthWallToRight) break; // Both found, can exit early
        }
        // Check for north wall on cell to the right (same row)
        if (otherWall.cellX === wall.cellX + 1 && otherWall.cellY === wall.cellY && otherWall.edge === 0) {
          hasNorthWallToRight = true;
          if (hasNorthWallToLeft) break; // Both found, can exit early
        }
      }
      
      // Draw left side wall ONLY if this is the leftmost north wall (no north wall to the left)
      // Position it as a thin vertical strip at the left edge of the tile
      // Side walls should NOT have brightness overlay - they're support beams, darker
      if (!hasNorthWallToLeft) {
        const sideWallX = screenX; // Start at the left edge of the tile
        const sideWallY = wallY;
        const sideWallWidth = EAST_WEST_WALL_THICKNESS / 2; // Make it thinner - half the thickness
        const sideWallHeight = wallHeight;
        
        ctx.save();
        // Draw vertical strip from wall image (left side) - NO brightness overlay
        if (wallImage && wallImage.complete && wallImage.naturalHeight !== 0) {
          const sourceX = 0; // Left edge of image
          const sourceWidth = EAST_WEST_WALL_THICKNESS / 2 / worldScale; // Match the thinner width
          ctx.drawImage(
            wallImage,
            sourceX, 0, sourceWidth, wallImage.height, // Source: left vertical strip (thinner)
            sideWallX, sideWallY, sideWallWidth, sideWallHeight // Destination
          );
          // NO brightness overlay for side walls - they're support beams
        } else {
          // Fallback: colored rectangle
          const tierColors: Record<number, string> = {
            0: '#8B4513', 1: '#654321', 2: '#808080', 3: '#C0C0C0',
          };
          ctx.fillStyle = tierColors[wall.tier] || '#8B4513';
          ctx.fillRect(sideWallX, sideWallY, sideWallWidth, sideWallHeight);
          // NO brightness overlay for side walls
        }
        
        // Draw border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(sideWallX, sideWallY, sideWallWidth, sideWallHeight);
        ctx.restore();
      }
      
      // Draw right side wall ONLY if this is the rightmost north wall (no north wall to the right)
      // Position it as a thin vertical strip at the right edge of the tile
      // Side walls should NOT have brightness overlay - they're support beams, darker
      if (!hasNorthWallToRight) {
        const sideWallX = screenX + screenSize - EAST_WEST_WALL_THICKNESS / 2; // End at the right edge, thin strip
        const sideWallY = wallY;
        const sideWallWidth = EAST_WEST_WALL_THICKNESS / 2; // Make it thinner - half the thickness
        const sideWallHeight = wallHeight;
        
        ctx.save();
        // Draw vertical strip from wall image (right side) - NO brightness overlay
        if (wallImage && wallImage.complete && wallImage.naturalHeight !== 0) {
          const sourceWidth = EAST_WEST_WALL_THICKNESS / 2 / worldScale; // Match the thinner width
          const sourceX = wallImage.width - sourceWidth; // Right edge of image
          ctx.drawImage(
            wallImage,
            sourceX, 0, sourceWidth, wallImage.height, // Source: right vertical strip (thinner)
            sideWallX, sideWallY, sideWallWidth, sideWallHeight // Destination
          );
          // NO brightness overlay for side walls - they're support beams
        } else {
          // Fallback: colored rectangle
          const tierColors: Record<number, string> = {
            0: '#8B4513', 1: '#654321', 2: '#808080', 3: '#C0C0C0',
          };
          ctx.fillStyle = tierColors[wall.tier] || '#8B4513';
          ctx.fillRect(sideWallX, sideWallY, sideWallWidth, sideWallHeight);
          // NO brightness overlay for side walls
        }
        
        // Draw border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(sideWallX, sideWallY, sideWallWidth, sideWallHeight);
        ctx.restore();
      }
    }
    
    // Draw black border around the wall
    // For north walls, skip the bottom border to avoid thick line at the base
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    if (wall.edge === 0) {
      // North wall - draw border on top and sides only, not bottom
      ctx.beginPath();
      ctx.moveTo(wallX, wallY); // Top left
      ctx.lineTo(wallX + wallWidth, wallY); // Top right
      ctx.moveTo(wallX, wallY); // Top left
      ctx.lineTo(wallX, wallY + wallHeight); // Left side
      ctx.moveTo(wallX + wallWidth, wallY); // Top right
      ctx.lineTo(wallX + wallWidth, wallY + wallHeight); // Right side
      ctx.stroke();
    } else {
      // Other walls - draw full border
      ctx.strokeRect(wallX, wallY, wallWidth, wallHeight);
    }
  }
  
  if (isTriangle) {
    ctx.restore();
  }
  
  ctx.restore();
}

/**
 * Render exterior wall shadows that change throughout the day based on sun position
 * Sea of Stars style - soft, atmospheric shadows throughout all time periods
 * Despite the name, this renders EXTERIOR shadows, not interior ones
 */
export function renderWallInteriorShadow({
  ctx,
  wall,
  worldScale,
  cycleProgress,
  viewOffsetX,
  viewOffsetY,
}: {
  ctx: CanvasRenderingContext2D;
  wall: any; // WallCell type
  worldScale: number;
  cycleProgress: number; // Day/night cycle progress (0.0 to 1.0)
  viewOffsetX: number;
  viewOffsetY: number;
}): void {
  if (wall.isDestroyed) {
    return;
  }

  const { x: worldX, y: worldY } = cellToWorldPixels(wall.cellX, wall.cellY);
  const screenX = worldX;
  const screenY = worldY;
  const screenSize = FOUNDATION_TILE_SIZE * worldScale;

  // Determine shadow parameters based on time of day (Sea of Stars style)
  let shouldCastShadow = false;
  let shadowAlpha = 0.0;
  let shadowDepth = screenSize * 0.6;
  let shadowColor = { r: 0, g: 0, b: 0 }; // Can tint shadows based on time of day
  let gradientStops = [0, 0.6, 1.0]; // Default gradient stops
  
  // Dawn (0.0 - 0.05): Very soft shadows, sun rising from east
  if (cycleProgress >= 0.0 && cycleProgress < 0.05) {
    shouldCastShadow = wall.edge === 3; // West walls cast long, soft shadows
    shadowAlpha = 0.25 + (cycleProgress / 0.05) * 0.15; // 0.25 -> 0.40
    shadowDepth = screenSize * (1.2 - (cycleProgress / 0.05) * 0.4); // 1.2 -> 0.8 (long to medium)
    shadowColor = { r: 20, g: 10, b: 40 }; // Bluish-purple dawn shadows
    gradientStops = [0, 0.7, 1.0]; // Softer falloff
  }
  // Morning (0.05 - 0.35): Sun in east, shadows cast west
  else if (cycleProgress >= 0.05 && cycleProgress < 0.35) {
    shouldCastShadow = wall.edge === 3; // West walls
    const morningProgress = (cycleProgress - 0.05) / 0.30;
    shadowAlpha = 0.40 + morningProgress * 0.10; // 0.40 -> 0.50
    shadowDepth = screenSize * (0.8 - morningProgress * 0.1); // 0.8 -> 0.7
    shadowColor = { r: 10, g: 5, b: 20 }; // Slight cool tint
    gradientStops = [0, 0.65, 1.0];
  }
  // Noon (0.35 - 0.55): Sun overhead, short shadows from all sides
  else if (cycleProgress >= 0.35 && cycleProgress < 0.55) {
    shouldCastShadow = true; // All walls cast shadows
    const noonProgress = (cycleProgress - 0.35) / 0.20;
    const peakNoon = Math.abs(noonProgress - 0.5) * 2; // 0 at exact noon (0.45), 1 at edges
    shadowAlpha = 0.20 + peakNoon * 0.05; // 0.20 at noon, 0.25 at edges
    shadowDepth = screenSize * 0.4; // Very short shadows
    shadowColor = { r: 0, g: 0, b: 0 }; // Pure black at noon
    gradientStops = [0, 0.5, 1.0]; // Tight gradient
  }
  // Afternoon (0.55 - 0.72): Sun in west, shadows cast east
  else if (cycleProgress >= 0.55 && cycleProgress < 0.72) {
    shouldCastShadow = wall.edge === 1; // East walls
    const afternoonProgress = (cycleProgress - 0.55) / 0.17;
    shadowAlpha = 0.50 - afternoonProgress * 0.05; // 0.50 -> 0.45
    shadowDepth = screenSize * (0.7 + afternoonProgress * 0.2); // 0.7 -> 0.9 (getting longer)
    shadowColor = { r: 15, g: 10, b: 5 }; // Warm afternoon tint
    gradientStops = [0, 0.65, 1.0];
  }
  // Dusk (0.72 - 0.76): Sun setting in west, long soft shadows
  else if (cycleProgress >= 0.72 && cycleProgress < 0.76) {
    shouldCastShadow = wall.edge === 1; // East walls cast long shadows
    const duskProgress = (cycleProgress - 0.72) / 0.04;
    shadowAlpha = 0.45 - duskProgress * 0.15; // 0.45 -> 0.30
    shadowDepth = screenSize * (0.9 + duskProgress * 0.3); // 0.9 -> 1.2 (very long)
    shadowColor = { r: 30, g: 15, b: 40 }; // Purple-orange dusk shadows
    gradientStops = [0, 0.75, 1.0]; // Very soft falloff
  }
  // Twilight Evening (0.76 - 0.80): Ambient shadows, very soft
  else if (cycleProgress >= 0.76 && cycleProgress < 0.80) {
    shouldCastShadow = true; // All walls cast ambient shadows
    const twilightProgress = (cycleProgress - 0.76) / 0.04;
    shadowAlpha = 0.30 - twilightProgress * 0.15; // 0.30 -> 0.15
    shadowDepth = screenSize * 0.5; // Medium, diffuse
    shadowColor = { r: 10, g: 5, b: 30 }; // Deep blue twilight
    gradientStops = [0, 0.8, 1.0]; // Very soft, ambient
  }
  // Night (0.80 - 0.92): Minimal ambient shadows
  else if (cycleProgress >= 0.80 && cycleProgress < 0.92) {
    shouldCastShadow = true; // Faint ambient shadows from all walls
    shadowAlpha = 0.12; // Very faint
    shadowDepth = screenSize * 0.3; // Short, diffuse
    shadowColor = { r: 5, g: 5, b: 15 }; // Dark blue night
    gradientStops = [0, 0.85, 1.0]; // Extremely soft, almost imperceptible
  }
  // Twilight Morning / Pre-Dawn (0.92 - 1.0): Starting to get directional
  else if (cycleProgress >= 0.92 && cycleProgress <= 1.0) {
    const preDawnProgress = (cycleProgress - 0.92) / 0.08;
    shouldCastShadow = wall.edge === 3; // West walls start casting shadows
    shadowAlpha = 0.12 + preDawnProgress * 0.13; // 0.12 -> 0.25
    shadowDepth = screenSize * (0.5 + preDawnProgress * 0.7); // 0.5 -> 1.2
    shadowColor = { r: 15, g: 8, b: 35 }; // Purple pre-dawn
    gradientStops = [0, 0.8, 1.0]; // Soft
  }
  
  if (!shouldCastShadow) {
    return;
  }

  ctx.save();

  // Helper to create AAA-style shadow with smooth fade
  const createSoftShadow = (
    x: number, y: number, width: number, height: number,
    fadeDirection: 'north' | 'south' | 'east' | 'west'
  ) => {
    const { r, g, b } = shadowColor;
    
    // Create main linear gradient in the fade direction
    let gradient: CanvasGradient;
    if (fadeDirection === 'north' || fadeDirection === 'south') {
      // Vertical fade
      gradient = ctx.createLinearGradient(x, y + (fadeDirection === 'north' ? height : 0), x, y + (fadeDirection === 'north' ? 0 : height));
    } else {
      // Horizontal fade
      gradient = ctx.createLinearGradient(x + (fadeDirection === 'west' ? width : 0), y, x + (fadeDirection === 'west' ? 0 : width), y);
    }
    
    // Smooth multi-stop gradient for AAA quality
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${shadowAlpha})`); // Wall edge: Full intensity
    gradient.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, ${shadowAlpha * 0.8})`); // Near wall
    gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${shadowAlpha * 0.4})`); // Mid fade
    gradient.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, ${shadowAlpha * 0.1})`); // Soft fade
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`); // Edge: Fully transparent
    
    return gradient;
  };

  // Create shadow shape based on wall edge with smooth fade
  // Shadow extends from wall edge OUTWARD onto the ground outside the building
  switch (wall.edge) {
    case 0: // North (top edge) - shadow extends north (upward/outward)
      {
        const shadowX = screenX;
        const shadowY = screenY - shadowDepth;
        const shadowWidth = screenSize;
        const shadowHeight = shadowDepth;
        
        const gradient = createSoftShadow(shadowX, shadowY, shadowWidth, shadowHeight, 'north');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(shadowX, shadowY, shadowWidth, shadowHeight);
      }
      break;
      
    case 1: // East (right edge) - shadow extends east (rightward/outward)
      {
        const shadowX = screenX + screenSize;
        const shadowY = screenY;
        const shadowWidth = shadowDepth;
        const shadowHeight = screenSize;
        
        const gradient = createSoftShadow(shadowX, shadowY, shadowWidth, shadowHeight, 'east');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(shadowX, shadowY, shadowWidth, shadowHeight);
      }
      break;
      
    case 2: // South (bottom edge) - shadow extends south (downward/outward)
      {
        const shadowX = screenX;
        const shadowY = screenY + screenSize;
        const shadowWidth = screenSize;
        const shadowHeight = shadowDepth;
        
        const gradient = createSoftShadow(shadowX, shadowY, shadowWidth, shadowHeight, 'south');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(shadowX, shadowY, shadowWidth, shadowHeight);
      }
      break;
      
    case 3: // West (left edge) - shadow extends west (leftward/outward)
      {
        const shadowX = screenX - shadowDepth;
        const shadowY = screenY;
        const shadowWidth = shadowDepth;
        const shadowHeight = screenSize;
        
        const gradient = createSoftShadow(shadowX, shadowY, shadowWidth, shadowHeight, 'west');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(shadowX, shadowY, shadowWidth, shadowHeight);
      }
      break;
      
    case 4: // DiagNE_SW
    case 5: // DiagNW_SE
      // For diagonal walls, create a shadow along the diagonal edge extending outward
      {
        const centerX = screenX + screenSize / 2;
        const centerY = screenY + screenSize / 2;
        const angle = wall.edge === 4 ? Math.PI / 4 : -Math.PI / 4;
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);
        
        // Create a shadow strip along the diagonal extending outward
        const stripWidth = Math.sqrt(screenSize * screenSize * 2); // Diagonal length
        const stripHeight = shadowDepth;
        
        // Create gradient perpendicular to the diagonal, extending outward
        const { r, g, b } = shadowColor;
        const gradient = ctx.createLinearGradient(
          -stripWidth / 2, -stripHeight / 2, // Edge (wall)
          -stripWidth / 2, -stripHeight / 2 - stripHeight // Exterior
        );
        
        // Smooth multi-stop gradient
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${shadowAlpha})`);
        gradient.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, ${shadowAlpha * 0.8})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${shadowAlpha * 0.4})`);
        gradient.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, ${shadowAlpha * 0.1})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(-stripWidth / 2, -stripHeight / 2 - stripHeight, stripWidth, stripHeight);
        ctx.restore();
      }
      break;
  }

  ctx.restore();
}

/**
 * Render wall preview (ghost) for placement
 * Determines edge based on mouse position relative to tile center
 */
export function renderWallPreview({
  ctx,
  cellX,
  cellY,
  worldMouseX,
  worldMouseY,
  tier,
  isValid,
  worldScale,
  viewOffsetX,
  viewOffsetY,
  foundationTileImagesRef,
  connection, // ADDED: Need connection to check foundation shape
}: {
  ctx: CanvasRenderingContext2D;
  cellX: number;
  cellY: number;
  worldMouseX: number;
  worldMouseY: number;
  tier: number;
  isValid: boolean;
  worldScale: number;
  viewOffsetX: number;
  viewOffsetY: number;
  foundationTileImagesRef?: React.RefObject<Map<string, HTMLImageElement>>;
  connection?: any; // ADDED: DbConnection to check foundation shape
}): void {
  const { x: worldX, y: worldY } = cellToWorldPixels(cellX, cellY);
  
  const screenX = worldX;
  const screenY = worldY;
  const screenSize = FOUNDATION_TILE_SIZE * worldScale;
  
  // Calculate foundation cell center
  const tileCenterX = worldX + screenSize / 2;
  const tileCenterY = worldY + screenSize / 2;
  
  // Calculate offset from tile center
  const dx = worldMouseX - tileCenterX;
  const dy = worldMouseY - tileCenterY;
  
  // Check if foundation is a triangle first (needed for edge detection)
  let foundationShape = 1; // Default to Full
  let isTriangle = false;
  if (connection) {
    for (const foundation of connection.db.foundationCell.iter()) {
      if (foundation.cellX === cellX && foundation.cellY === cellY && !foundation.isDestroyed) {
        foundationShape = foundation.shape as number;
        isTriangle = foundationShape >= 2 && foundationShape <= 5;
        break;
      }
    }
  }
  
  // Determine which edge is closest (snap to nearest edge)
  // For triangle foundations, also consider diagonal edges
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  
  let edge: number; // BuildingEdge enum (0-5: N, E, S, W, DiagNE_SW, DiagNW_SE)
  
  // For triangle foundations, check diagonal edges first
  if (isTriangle) {
    // Calculate distance to diagonal edges
    // For NW-SE diagonal: distance is |dx - dy|
    // For NE-SW diagonal: distance is |dx + dy|
    const diagNW_SE_dist = Math.abs(dx - dy); // Distance to NW-SE diagonal
    const diagNE_SW_dist = Math.abs(dx + dy); // Distance to NE-SW diagonal
    
    // Check if we're closer to a diagonal than to cardinal edges
    // Use a threshold to prefer diagonals when close
    const minCardinalDist = Math.min(absDx, absDy);
    const minDiagDist = Math.min(diagNW_SE_dist, diagNE_SW_dist);
    
    // Prefer diagonal if it's significantly closer, or if we're very close to diagonal
    if (minDiagDist < minCardinalDist * 1.2 || minDiagDist < 10) {
      // Closer to diagonal
      if (diagNW_SE_dist < diagNE_SW_dist) {
        edge = 5; // DiagNW_SE
      } else {
        edge = 4; // DiagNE_SW
      }
    } else {
      // Closer to cardinal edge
      if (absDy > absDx) {
        edge = dy < 0 ? 0 : 2; // North (0) or South (2)
      } else {
        edge = dx < 0 ? 3 : 1; // West (3) or East (1)
      }
    }
  } else {
    // Full foundation - only cardinal edges
    if (absDy > absDx) {
      edge = dy < 0 ? 0 : 2; // North (0) or South (2)
    } else {
      edge = dx < 0 ? 3 : 1; // West (3) or East (1)
    }
  }
  
  // Check if edge is valid for triangle foundations
  if (isTriangle) {
    let isValidEdge = false;
    switch (foundationShape) {
      case 2: // TriNW
        isValidEdge = edge === 0 || edge === 3 || edge === 5; // N, W, or DiagNW_SE
        break;
      case 3: // TriNE
        isValidEdge = edge === 0 || edge === 1 || edge === 4; // N, E, or DiagNE_SW
        break;
      case 4: // TriSE
        isValidEdge = edge === 2 || edge === 1 || edge === 5; // S, E, or DiagNW_SE
        break;
      case 5: // TriSW
        isValidEdge = edge === 2 || edge === 3 || edge === 4; // S, W, or DiagNE_SW
        break;
    }
    if (!isValidEdge) {
      // Invalid edge for triangle - don't render preview
      return;
    }
  }
  
  // Wall thickness (thin rectangle)
  const WALL_THICKNESS = 4 * worldScale; // 4 pixels thick (for north/south walls)
  const EAST_WEST_WALL_THICKNESS = 12 * worldScale; // 12 pixels thick for east/west walls (more visible)
  const DIAGONAL_WALL_THICKNESS = 12 * worldScale; // 12 pixels thick for diagonal walls (more visible)
  
  // Determine wall rectangle position and size based on edge
  let wallX = screenX;
  let wallY = screenY;
  let wallWidth = screenSize;
  let wallHeight = WALL_THICKNESS;
  let isDiagonal = edge === 4 || edge === 5;
  
  // Perspective correction: North walls (away from viewer) appear shorter than south walls (closer to viewer)
  const PREVIEW_NORTH_WALL_HEIGHT = screenSize * 0.75; // 0.75 tiles tall (away from viewer, foreshortened)
  const PREVIEW_SOUTH_WALL_HEIGHT = screenSize; // 1 tile tall (closer to viewer, full height)
  
  switch (edge) {
    case 0: // North (top edge) - extend upward for isometric depth (SHORTER due to perspective)
      wallX = screenX;
      wallY = screenY - PREVIEW_NORTH_WALL_HEIGHT + WALL_THICKNESS / 2; // Extend upward (shorter)
      wallWidth = screenSize;
      wallHeight = PREVIEW_NORTH_WALL_HEIGHT;
      break;
    case 1: // East (right edge) - center on edge (half inside, half outside)
      wallX = screenX + screenSize - EAST_WEST_WALL_THICKNESS / 2;
      wallY = screenY;
      wallWidth = EAST_WEST_WALL_THICKNESS;
      wallHeight = screenSize;
      break;
    case 2: // South (bottom edge) - extend upward from bottom edge for isometric depth (TALLER as closer to viewer)
      wallX = screenX;
      // Start at bottom edge and extend UPWARD (negative Y direction for isometric depth)
      wallY = screenY + screenSize - PREVIEW_SOUTH_WALL_HEIGHT; // Bottom edge minus wall height
      wallWidth = screenSize;
      wallHeight = PREVIEW_SOUTH_WALL_HEIGHT;
      break;
    case 3: // West (left edge) - center on edge (half inside, half outside)
      wallX = screenX - EAST_WEST_WALL_THICKNESS / 2;
      wallY = screenY;
      wallWidth = EAST_WEST_WALL_THICKNESS;
      wallHeight = screenSize;
      break;
    case 4: // DiagNE_SW (diagonal from NE to SW)
    case 5: // DiagNW_SE (diagonal from NW to SE)
      isDiagonal = true;
      break;
    default:
      return; // Invalid edge
  }
  
  ctx.save();
  
  // Get wall tile image for wall preview texture
  // North walls (edge 0) show the interior side since they're away from the viewer
  const isNorthWallPreview = edge === 0;
  const wallFilename = getWallTileFilename(tier, isNorthWallPreview);
  const wallImage = foundationTileImagesRef?.current?.get(wallFilename);
  
  // Apply clipping for triangle foundations
  if (isTriangle) {
    ctx.save();
    setupTriangleClipPath(ctx, screenX, screenY, screenSize, foundationShape);
  }
  
  // Apply preview tint (cyberpunk neon theme)
  if (isValid) {
    // Valid: Neon cyan tint
    ctx.globalAlpha = 0.6;
    ctx.filter = 'sepia(100%) hue-rotate(180deg) saturate(300%) brightness(1.2)';
  } else {
    // Invalid: Neon magenta tint
    ctx.globalAlpha = 0.6;
    ctx.filter = 'sepia(100%) hue-rotate(300deg) saturate(300%) brightness(1.2)';
  }
  
  // Draw wall preview rectangle or diagonal
  if (isDiagonal) {
    // Draw diagonal wall preview as a thick line aligned with the hypotenuse
    ctx.strokeStyle = isValid ? '#00FFFF' : '#FF00FF'; // Neon cyan or neon magenta
    ctx.lineWidth = DIAGONAL_WALL_THICKNESS * 2; // Make preview more visible
    ctx.lineCap = 'square';
    ctx.beginPath();
    
    // For triangle foundations, the diagonal edge IS the hypotenuse
    // Match the exact coordinates of the triangle's hypotenuse
    if (edge === 4) {
      // DiagNE_SW: from NE (top-right) to SW (bottom-left)
      // This matches TriNE (3) and TriSW (5) hypotenuses
      ctx.moveTo(screenX + screenSize, screenY);
      ctx.lineTo(screenX, screenY + screenSize);
    } else {
      // DiagNW_SE: from NW (top-left) to SE (bottom-right)
      // This matches TriNW (2) and TriSE (4) hypotenuses
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX + screenSize, screenY + screenSize);
    }
    
    ctx.stroke();
    
    // Also draw a filled rectangle along the diagonal for better visibility
    ctx.save();
    const centerX = screenX + screenSize / 2;
    const centerY = screenY + screenSize / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(edge === 4 ? Math.PI / 4 : -Math.PI / 4);
    ctx.translate(-centerX, -centerY);
    
    const stripWidth = Math.sqrt(screenSize * screenSize * 2); // Diagonal length
    const stripHeight = DIAGONAL_WALL_THICKNESS * 2;
    ctx.fillStyle = isValid ? 'rgba(0, 255, 255, 0.3)' : 'rgba(255, 0, 255, 0.3)';
    ctx.fillRect(centerX - stripWidth / 2, centerY - stripHeight / 2, stripWidth, stripHeight);
    ctx.restore();
  } else {
    // Draw rectangular wall preview
    if (wallImage && wallImage.complete && wallImage.naturalHeight !== 0) {
      // Draw a portion of the wall tile image for the wall preview
      if (edge === 0) {
        // North wall - use only TOP 3/4 of texture (cropped, not stretched)
        // Simply crop to top 3/4 and draw at wall dimensions
        ctx.drawImage(
          wallImage,
          0, 0, wallImage.width, wallImage.height * 0.75, // Source: TOP 3/4 of texture
          wallX, wallY, wallWidth, wallHeight // Destination: wall dimensions
        );
      } else if (edge === 2) {
        // South wall - use full texture for full height
        ctx.drawImage(
          wallImage,
          0, 0, wallImage.width, wallImage.height, // Source: full texture
          wallX, wallY, wallWidth, wallHeight // Destination: full wall
        );
      } else {
        // Vertical wall - draw vertical strip from tile
        const sourceX = edge === 3 ? 0 : wallImage.width - EAST_WEST_WALL_THICKNESS / worldScale;
        ctx.drawImage(
          wallImage,
          sourceX, 0, EAST_WEST_WALL_THICKNESS / worldScale, wallImage.height, // Source
          wallX, wallY, wallWidth, wallHeight // Destination
        );
      }
    } else {
      // Fallback: Draw colored rectangle
      const color = isValid ? FOUNDATION_PREVIEW_COLORS.valid : FOUNDATION_PREVIEW_COLORS.invalid;
      ctx.fillStyle = color;
      ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
    }
    
    // Draw border (cyberpunk neon theme for preview)
    ctx.strokeStyle = isValid ? '#00FFFF' : '#FF00FF'; // Neon cyan or neon magenta
    ctx.lineWidth = 2;
    ctx.strokeRect(wallX, wallY, wallWidth, wallHeight);
  }
  
  if (isTriangle) {
    ctx.restore(); // Restore clipping
  }
  
  ctx.restore(); // Restore filters
}

/**
 * Render multiple walls
 */
export function renderWalls({
  ctx,
  walls,
  worldScale,
  viewOffsetX,
  viewOffsetY,
  foundationTileImagesRef,
}: {
  ctx: CanvasRenderingContext2D;
  walls: any[]; // WallCell[] - will be properly typed after regenerating bindings
  worldScale: number;
  viewOffsetX: number;
  viewOffsetY: number;
  foundationTileImagesRef?: React.RefObject<Map<string, HTMLImageElement>>;
}): void {
  for (const wall of walls) {
    renderWall({
      ctx,
      wall,
      worldScale,
      viewOffsetX,
      viewOffsetY,
      foundationTileImagesRef,
    });
  }
}

/**
 * Render multiple foundations
 */
export function renderFoundations({
  ctx,
  foundations,
  worldScale,
  viewOffsetX,
  viewOffsetY,
}: {
  ctx: CanvasRenderingContext2D;
  foundations: FoundationCell[];
  worldScale: number;
  viewOffsetX: number;
  viewOffsetY: number;
}): void {
  for (const foundation of foundations) {
    renderFoundation({
      ctx,
      foundation,
      worldScale,
      viewOffsetX,
      viewOffsetY,
    });
  }
}

