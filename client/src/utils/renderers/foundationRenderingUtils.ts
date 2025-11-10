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
 */
function getWallTileFilename(tier: number): string {
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

  // Draw border for all foundation shapes
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  
  if (isTriangle) {
    // Draw triangle border for triangle shapes
    ctx.beginPath();
    switch (foundation.shape) {
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
 * Render a wall cell as a thin rectangle on the edge of a foundation tile
 */
export interface RenderWallParams {
  ctx: CanvasRenderingContext2D;
  wall: any; // WallCell - will be properly typed after regenerating bindings
  worldScale: number;
  viewOffsetX: number;
  viewOffsetY: number;
  foundationTileImagesRef?: React.RefObject<Map<string, HTMLImageElement>>;
}

export function renderWall({
  ctx,
  wall,
  worldScale,
  viewOffsetX,
  viewOffsetY,
  foundationTileImagesRef,
}: RenderWallParams): void {
  if (wall.isDestroyed) {
    return;
  }

  const { x: worldX, y: worldY } = cellToWorldPixels(wall.cellX, wall.cellY);
  
  const screenX = worldX;
  const screenY = worldY;
  const screenSize = FOUNDATION_TILE_SIZE * worldScale;
  
  // Wall thickness (thin rectangle)
  const WALL_THICKNESS = 4 * worldScale; // 4 pixels thick
  
  // Get wall image based on tier (use wall-specific images)
  const wallFilename = getWallTileFilename(wall.tier);
  const wallImage = foundationTileImagesRef?.current?.get(wallFilename);
  
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
  
  // For north/south walls in isometric view, make them taller (2 tiles tall) to render above players
  const NORTH_SOUTH_WALL_HEIGHT = screenSize * 2; // 2 tiles tall for isometric depth
  
  switch (wall.edge) {
    case 0: // North (top edge) - extend upward for isometric depth
      wallX = screenX;
      wallY = screenY - NORTH_SOUTH_WALL_HEIGHT + WALL_THICKNESS / 2; // Extend upward
      wallWidth = screenSize;
      wallHeight = NORTH_SOUTH_WALL_HEIGHT;
      break;
    case 1: // East (right edge) - center on edge (half inside, half outside)
      wallX = screenX + screenSize - WALL_THICKNESS / 2;
      wallY = screenY;
      wallWidth = WALL_THICKNESS;
      wallHeight = screenSize;
      break;
    case 2: // South (bottom edge) - extend upward from bottom edge for isometric depth
      wallX = screenX;
      // Start at bottom edge and extend UPWARD (negative Y direction for isometric depth)
      wallY = screenY + screenSize - NORTH_SOUTH_WALL_HEIGHT; // Bottom edge minus wall height
      wallWidth = screenSize;
      wallHeight = NORTH_SOUTH_WALL_HEIGHT;
      break;
    case 3: // West (left edge) - center on edge (half inside, half outside)
      wallX = screenX - WALL_THICKNESS / 2;
      wallY = screenY;
      wallWidth = WALL_THICKNESS;
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
      const stripHeight = WALL_THICKNESS;
      ctx.drawImage(
        wallImage,
        0, 0, wallImage.width, WALL_THICKNESS / worldScale, // Source
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
      const stripHeight = WALL_THICKNESS;
      
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
      if (wall.edge === 0 || wall.edge === 2) {
        // North/south walls - draw full wall extension
        ctx.drawImage(
          wallImage,
          0, 0, wallImage.width, wallImage.height, // Source: full tile
          wallX, wallY, wallWidth, wallHeight // Destination: full wall
        );
      } else {
        // Vertical wall - draw vertical strip from tile
        const sourceX = wall.edge === 3 ? 0 : wallImage.width - WALL_THICKNESS / worldScale;
        ctx.drawImage(
          wallImage,
          sourceX, 0, WALL_THICKNESS / worldScale, wallImage.height, // Source
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
      } else {
        // East/west walls - draw normally
        ctx.fillStyle = tierColors[wall.tier] || '#8B4513';
        ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
      }
    }
    
    // Draw black border around the wall
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(wallX, wallY, wallWidth, wallHeight);
  }
  
  if (isTriangle) {
    ctx.restore();
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
  const WALL_THICKNESS = 4 * worldScale; // 4 pixels thick
  
  // Determine wall rectangle position and size based on edge
  let wallX = screenX;
  let wallY = screenY;
  let wallWidth = screenSize;
  let wallHeight = WALL_THICKNESS;
  let isDiagonal = edge === 4 || edge === 5;
  
  switch (edge) {
    case 0: // North (top edge) - center on edge (half above, half below)
      wallX = screenX;
      wallY = screenY - WALL_THICKNESS / 2;
      wallWidth = screenSize;
      wallHeight = WALL_THICKNESS;
      break;
    case 1: // East (right edge) - center on edge (half inside, half outside)
      wallX = screenX + screenSize - WALL_THICKNESS / 2;
      wallY = screenY;
      wallWidth = WALL_THICKNESS;
      wallHeight = screenSize;
      break;
    case 2: // South (bottom edge) - extend upward from bottom edge for isometric depth
      wallX = screenX;
      // Start at bottom edge and extend UPWARD (negative Y direction for isometric depth)
      // For preview, use same logic as actual wall rendering
      const previewNorthSouthHeight = screenSize * 2; // 2 foundation cells tall
      wallY = screenY + screenSize - previewNorthSouthHeight; // Bottom edge minus wall height
      wallWidth = screenSize;
      wallHeight = previewNorthSouthHeight;
      break;
    case 3: // West (left edge) - center on edge (half inside, half outside)
      wallX = screenX - WALL_THICKNESS / 2;
      wallY = screenY;
      wallWidth = WALL_THICKNESS;
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
  const wallFilename = getWallTileFilename(tier);
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
    ctx.lineWidth = WALL_THICKNESS * 2; // Make preview more visible
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
    const stripHeight = WALL_THICKNESS * 2;
    ctx.fillStyle = isValid ? 'rgba(0, 255, 255, 0.3)' : 'rgba(255, 0, 255, 0.3)';
    ctx.fillRect(centerX - stripWidth / 2, centerY - stripHeight / 2, stripWidth, stripHeight);
    ctx.restore();
  } else {
    // Draw rectangular wall preview
    if (wallImage && wallImage.complete && wallImage.naturalHeight !== 0) {
      // Draw a portion of the wall tile image for the wall preview
      if (edge === 0 || edge === 2) {
        // Horizontal wall - draw horizontal strip from tile
        const sourceY = edge === 0 ? 0 : wallImage.height - WALL_THICKNESS / worldScale;
        ctx.drawImage(
          wallImage,
          0, sourceY, wallImage.width, WALL_THICKNESS / worldScale, // Source
          wallX, wallY, wallWidth, wallHeight // Destination
        );
      } else {
        // Vertical wall - draw vertical strip from tile
        const sourceX = edge === 3 ? 0 : wallImage.width - WALL_THICKNESS / worldScale;
        ctx.drawImage(
          wallImage,
          sourceX, 0, WALL_THICKNESS / worldScale, wallImage.height, // Source
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

