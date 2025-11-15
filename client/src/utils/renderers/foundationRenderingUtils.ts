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
 * Render fog of war overlay for a foundation cell
 * This renders a black rectangle over the foundation to hide interior contents
 * Renders above placeables but below walls
 * 
 * NOTE: Fog only covers foundation area (not extended upward) to avoid obscuring doors
 * Y-sorting ensures placeables never render above fog overlays on the same foundation
 */
export function renderFogOverlay({
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

  // Set up clipping path for triangle shapes (same as foundation)
  const isTriangle = foundation.shape >= 2 && foundation.shape <= 5;
  if (isTriangle) {
    setupTriangleClipPath(ctx, screenX, screenY, screenSize, foundation.shape);
  }

  // Draw black fog of war overlay (fully opaque) - foundation size only
  ctx.fillStyle = '#000000';
  ctx.fillRect(screenX, screenY, screenSize, screenSize);

  ctx.restore();
}

/**
 * Render fog of war overlay for an entire building cluster
 * This renders a tiled ceiling image over the entire cluster bounds to hide interior contents
 * Renders above placeables but below walls
 * Skips rendering ceiling tiles for entrance way foundations (perimeter foundations without walls on exposed edges)
 * Extends upward to cover north wall interiors (which extend upward for isometric depth)
 */
export function renderFogOverlayCluster({
  ctx,
  bounds,
  worldScale,
  viewOffsetX,
  viewOffsetY,
  foundationTileImagesRef,
  entranceWayFoundations, // Set of foundation cell coordinates (e.g., "cellX,cellY") that are entrance ways
  clusterFoundationCoords, // Set of ALL foundation coordinates in this cluster
  northWallFoundations, // Set of foundation coordinates that have north walls (for ceiling extension)
  southWallFoundations, // Set of foundation coordinates that have south walls (to prevent covering them)
}: {
  ctx: CanvasRenderingContext2D;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  worldScale: number;
  viewOffsetX: number;
  viewOffsetY: number;
  foundationTileImagesRef?: React.RefObject<Map<string, HTMLImageElement>>;
  entranceWayFoundations?: Set<string>; // Set of "cellX,cellY" strings for entrance way foundations
  clusterFoundationCoords?: Set<string>; // Set of "cellX,cellY" strings for ALL foundations in cluster
  northWallFoundations?: Set<string>; // Set of "cellX,cellY" strings for foundations with north walls
  southWallFoundations?: Set<string>; // Set of "cellX,cellY" strings for foundations with south walls
}): void {
  // CRITICAL: Save context to ensure proper rendering state
  ctx.save();
  
  // North walls extend upward by 1.0 tiles (96px) for isometric depth
  // Ceiling tiles need to extend upward to cover the interior of north walls
  const NORTH_WALL_EXTENSION = FOUNDATION_TILE_SIZE * 1.0; // Same as NORTH_WALL_HEIGHT
  
  // Since canvas context is already translated by camera offset,
  // we just use world coordinates directly
  // Extend bounds upward to cover north walls
  const screenX = bounds.minX;
  const screenY = bounds.minY - NORTH_WALL_EXTENSION; // Extend upward
  const screenWidth = (bounds.maxX - bounds.minX) * worldScale;
  const screenHeight = ((bounds.maxY - bounds.minY) + NORTH_WALL_EXTENSION) * worldScale; // Include extension

  // Get ceiling tile image
  const ceilingImage = foundationTileImagesRef?.current?.get('ceiling_twig.png');
  
  if (ceilingImage && ceilingImage.complete && ceilingImage.naturalHeight !== 0) {
    // Tile the ceiling image across the entire cluster bounds
    const tileSize = FOUNDATION_TILE_SIZE * worldScale;
    const startX = screenX;
    const startY = screenY;
    
    // Calculate how many tiles we need in each direction
    const tilesX = Math.ceil(screenWidth / tileSize);
    const tilesY = Math.ceil(screenHeight / tileSize);
    
    // Draw tiled ceiling image, only where there are foundations, skipping entrance ways
    // Also render ceiling tiles above foundations with north walls to cover their interior
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x = startX + (tx * tileSize);
        const y = startY + (ty * tileSize);
        
        // Convert world pixel coordinates back to cell coordinates
        const cellX = Math.floor(x / FOUNDATION_TILE_SIZE);
        const cellY = Math.floor(y / FOUNDATION_TILE_SIZE);
        const foundationKey = `${cellX},${cellY}`;
        
        // Check if this position should have a ceiling tile
        let shouldRenderCeiling = false;
        
        // Case 1: There's a foundation at this position (not an entrance way)
        if (clusterFoundationCoords && clusterFoundationCoords.has(foundationKey)) {
          // Skip entrance way foundations
          if (!entranceWayFoundations || !entranceWayFoundations.has(foundationKey)) {
            shouldRenderCeiling = true;
          }
        } 
        // Case 2: This is empty space above a foundation with a north wall (to cover north wall interior)
        else {
          // Check if the foundation one row below (cellY + 1) has a north wall
          const foundationBelowKey = `${cellX},${cellY + 1}`;
          if (northWallFoundations && northWallFoundations.has(foundationBelowKey)) {
            // CRITICAL: Only render ceiling tile if current position is completely empty
            // This prevents accidentally covering any foundations or their walls
            shouldRenderCeiling = true;
          }
        }
        
        // Never cover foundations that have south walls - those walls must render on top
        if (shouldRenderCeiling && southWallFoundations && southWallFoundations.has(foundationKey)) {
          shouldRenderCeiling = false;
        }
        
        if (!shouldRenderCeiling) {
          continue;
        }
        
        // Only draw the portion that's within bounds
        const drawWidth = Math.min(tileSize, screenX + screenWidth - x);
        const drawHeight = Math.min(tileSize, screenY + screenHeight - y);
        
        if (drawWidth > 0 && drawHeight > 0) {
          // Ensure ceiling tiles render with full opacity and normal blending
          ctx.globalAlpha = 1.0;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(ceilingImage, x, y, drawWidth, drawHeight);
        }
      }
    }
  } else {
    // Fallback: Draw black rectangles if image not loaded, only where foundations exist
    const tileSize = FOUNDATION_TILE_SIZE * worldScale;
    const tilesX = Math.ceil(screenWidth / tileSize);
    const tilesY = Math.ceil(screenHeight / tileSize);
    
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const x = screenX + (tx * tileSize);
        const y = screenY + (ty * tileSize);
        const cellX = Math.floor(x / FOUNDATION_TILE_SIZE);
        const cellY = Math.floor(y / FOUNDATION_TILE_SIZE);
        const foundationKey = `${cellX},${cellY}`;
        
        // Check if this position should have a ceiling tile
        let shouldRenderCeiling = false;
        
        // Case 1: There's a foundation at this position (not an entrance way)
        if (clusterFoundationCoords && clusterFoundationCoords.has(foundationKey)) {
          // Skip entrance way foundations
          if (!entranceWayFoundations || !entranceWayFoundations.has(foundationKey)) {
            shouldRenderCeiling = true;
          }
        } 
        // Case 2: This is empty space above a foundation with a north wall (to cover north wall interior)
        else {
          // Check if the foundation one row below (cellY + 1) has a north wall
          const foundationBelowKey = `${cellX},${cellY + 1}`;
          if (northWallFoundations && northWallFoundations.has(foundationBelowKey)) {
            // CRITICAL: Only render ceiling tile if current position is completely empty
            // This prevents accidentally covering any foundations or their walls
            shouldRenderCeiling = true;
          }
        }
        
        // Never cover foundations that have south walls - those walls must remain visible
        if (shouldRenderCeiling && southWallFoundations && southWallFoundations.has(foundationKey)) {
          shouldRenderCeiling = false;
        }
        
        if (!shouldRenderCeiling) {
          continue;
        }
        
        const drawWidth = Math.min(tileSize, screenX + screenWidth - x);
        const drawHeight = Math.min(tileSize, screenY + screenHeight - y);
        if (drawWidth > 0 && drawHeight > 0) {
          // Ensure ceiling tiles render with full opacity and normal blending
          ctx.globalAlpha = 1.0;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#000000';
          ctx.fillRect(x, y, drawWidth, drawHeight);
        }
      }
    }
  }
  
  // Restore context state
  ctx.restore();
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

  // Always render foundation normally (fog overlay is rendered separately as a Y-sorted entity)
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

  // Draw health bar if damaged (only show temporarily after being hit, like walls)
  const HEALTH_BAR_VISIBLE_DURATION_MS = 3000; // Show for 3 seconds after being hit
  if (foundation.health < foundation.maxHealth && foundation.lastHitTime) {
    const nowMs = Date.now();
    const lastHitTimeMs = Number(foundation.lastHitTime.microsSinceUnixEpoch / 1000n);
    const elapsedSinceHit = nowMs - lastHitTimeMs;
    
    if (elapsedSinceHit < HEALTH_BAR_VISIBLE_DURATION_MS) {
      const healthPercent = foundation.health / foundation.maxHealth;
      const barWidth = screenSize * healthPercent;
      const barHeight = 3;
      const barY = screenY + screenSize - barHeight - 2;
      
      const timeSinceLastHitRatio = elapsedSinceHit / HEALTH_BAR_VISIBLE_DURATION_MS;
      const opacity = Math.max(0, 1 - Math.pow(timeSinceLastHitRatio, 2)); // Fade out faster at the end

      ctx.save();
      ctx.globalAlpha = opacity;

      // Health bar background (red)
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(screenX, barY, screenSize, barHeight);

      // Health bar (green)
      ctx.fillStyle = '#00FF00';
      ctx.fillRect(screenX, barY, barWidth, barHeight);
      
      ctx.restore();
    }
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
  const NORTH_WALL_HEIGHT = screenSize * 1.0; // 1.0 tiles tall (full height)
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
  cycleProgress?: number; // ADDED: Day/night cycle progress for exterior shadows
  localPlayerPosition?: { x: number; y: number } | null; // ADDED: Player position for transparency logic
  playerInsideCluster?: boolean; // ADDED: Only fade walls when player is inside this building cluster
  isClusterEnclosed?: boolean; // ADDED: Whether this wall's cluster is enclosed (has ceiling)
}

export function renderWall({
  ctx,
  wall,
  worldScale,
  viewOffsetX,
  viewOffsetY,
  foundationTileImagesRef,
  allWalls,
  cycleProgress = 0.5, // Default to noon if not provided
  localPlayerPosition,
  playerInsideCluster = false,
  isClusterEnclosed = false,
}: RenderWallParams): void {
  if (wall.isDestroyed) {
    return;
  }

  // Wall visibility logic:
  // - South walls (edge 2): Always visible (exterior walls)
  // - North/East/West walls: Only hide when building is ENCLOSED and player is OUTSIDE
  // - During construction (not enclosed): Show all walls so player can see what they're building
  const isEastWestWall = wall.edge === 1 || wall.edge === 3;
  const isNorthWall = wall.edge === 0;
  
  // Only hide interior walls if the building is actually enclosed AND player is outside
  if (isClusterEnclosed && !playerInsideCluster) {
    if (isEastWestWall || isNorthWall) {
      return; // Hide interior walls when viewing enclosed building from outside
    }
  }
  // Otherwise, show all walls (during construction or when inside)

  const { x: worldX, y: worldY } = cellToWorldPixels(wall.cellX, wall.cellY);
  
  const screenX = worldX;
  const screenY = worldY;
  const screenSize = FOUNDATION_TILE_SIZE * worldScale;
  
  // Calculate wall transparency if player is behind it (similar to trees)
  const MIN_ALPHA = 0.3;
  const MAX_ALPHA = 1.0;
  let wallAlpha = MAX_ALPHA;
  const shouldFadeWhenInside = playerInsideCluster;
  const shouldFadeNorthWallsOutside = !playerInsideCluster && wall.edge === 0;
  const canFadeWall = localPlayerPosition && (shouldFadeWhenInside || shouldFadeNorthWallsOutside);
  
  if (canFadeWall) {
    // Only apply transparency to north/south cardinal walls and diagonal north/south walls
    const isNorthSouthCardinal = wall.edge === 0 || wall.edge === 2;
    const isDiagonal = wall.edge === 4 || wall.edge === 5;
    const isTriangle = wall.foundationShape >= 2 && wall.foundationShape <= 5;
    
    // Check if this is a north/south wall that should have transparency
    let shouldCheckTransparency = false;
    let isPlayerBehind = false;
    
    if (isNorthSouthCardinal) {
      // Cardinal north/south walls
      shouldCheckTransparency = true;
      if (wall.edge === 0) {
        // North wall: player is behind if player.y < wall.y (player is north of wall)
        isPlayerBehind = localPlayerPosition.y < worldY;
      } else if (wall.edge === 2) {
        // South wall: player is behind if player.y > wall.y (player is south of wall)
        isPlayerBehind = localPlayerPosition.y > worldY;
      }
    } else if (isDiagonal && isTriangle) {
      // Diagonal walls on triangle foundations
      // TriNW (2) and TriNE (3) are "south" triangles - player behind if player.y < wall.y
      // TriSE (4) and TriSW (5) are "north" triangles - player behind if player.y > wall.y
      shouldCheckTransparency = true;
      if (wall.foundationShape === 2 || wall.foundationShape === 3) {
        // South triangles: player behind if player.y < wall.y
        isPlayerBehind = localPlayerPosition.y < worldY;
      } else if (wall.foundationShape === 4 || wall.foundationShape === 5) {
        // North triangles: player behind if player.y > wall.y
        isPlayerBehind = localPlayerPosition.y > worldY;
      }
    }
    
    if (shouldCheckTransparency && isPlayerBehind) {
      // Calculate wall bounding box for overlap detection
      let wallLeft: number, wallRight: number, wallTop: number, wallBottom: number;
      
      if (isNorthSouthCardinal) {
        // Cardinal walls: use wall rectangle bounds
        if (wall.edge === 0) {
          // North wall
          const NORTH_WALL_HEIGHT = screenSize * 1.0;
          wallLeft = screenX;
          wallRight = screenX + screenSize;
          wallTop = screenY - NORTH_WALL_HEIGHT;
          wallBottom = screenY;
        } else {
          // South wall
          const SOUTH_WALL_HEIGHT = screenSize;
          wallLeft = screenX;
          wallRight = screenX + screenSize;
          wallTop = screenY + screenSize - SOUTH_WALL_HEIGHT;
          wallBottom = screenY + screenSize;
        }
      } else {
        // Diagonal walls: use triangle bounding box
        wallLeft = screenX;
        wallRight = screenX + screenSize;
        wallTop = screenY;
        wallBottom = screenY + screenSize * 2; // Diagonal walls extend upward
      }
      
      // Player bounding box
      const playerSize = 48;
      const playerLeft = localPlayerPosition.x - playerSize / 2;
      const playerRight = localPlayerPosition.x + playerSize / 2;
      const playerTop = localPlayerPosition.y - playerSize;
      const playerBottom = localPlayerPosition.y;
      
      // Check if player overlaps with wall visually
      const overlapsHorizontally = playerRight > wallLeft && playerLeft < wallRight;
      const overlapsVertically = playerBottom > wallTop && playerTop < wallBottom;
      
      if (overlapsHorizontally && overlapsVertically) {
        // Calculate depth difference for smooth fade
        const depthDifference = Math.abs(worldY - localPlayerPosition.y);
        const maxDepthForFade = 100;
        
        if (depthDifference > 0 && depthDifference < maxDepthForFade) {
          const fadeFactor = 1 - (depthDifference / maxDepthForFade);
          wallAlpha = MAX_ALPHA - (fadeFactor * (MAX_ALPHA - MIN_ALPHA));
          wallAlpha = Math.max(MIN_ALPHA, Math.min(MAX_ALPHA, wallAlpha));
        } else if (depthDifference >= maxDepthForFade) {
          wallAlpha = MIN_ALPHA;
        }
      }
    }
  }
  
  // Apply transparency if needed
  const needsTransparency = wallAlpha < MAX_ALPHA;
  if (needsTransparency) {
    ctx.save();
    ctx.globalAlpha = wallAlpha;
  }
  
  // Wall thickness (thin rectangle)
  const WALL_THICKNESS = 4 * worldScale; // 4 pixels thick (for north/south walls)
  const EAST_WEST_WALL_THICKNESS = 12 * worldScale; // 12 pixels thick for east/west walls (more visible)
  const DIAGONAL_WALL_THICKNESS = 12 * worldScale; // 12 pixels thick for diagonal walls (more visible)
  
  // Get wall image based on tier (use wall-specific images)
  // North walls (edge 0) show the interior side since they're away from the viewer
  // (isNorthWall already declared above in visibility logic)
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
  const NORTH_WALL_HEIGHT = screenSize * 1.0; // 1.0 tiles tall (full height)
  const SOUTH_WALL_HEIGHT = screenSize; // 1 tile tall (closer to viewer, full height)

  // For west walls, draw interior shadow BEFORE the wall itself so wall appears above shadow
  // Only render interior shadows when player is inside the building cluster
  if (wall.edge === 3 && playerInsideCluster) {
    const shadowWidth = screenSize * 0.3; // Shadow extends horizontally onto the foundation
    const shadowY = screenY; // Start at the top of the foundation tile (where wall meets ground)
    const shadowHeight = screenSize; // Shadow covers the full height of the foundation tile
    const shadowX = screenX; // Start from the left edge of the foundation tile (where wall meets interior)
    const shadowGradient = ctx.createLinearGradient(shadowX, shadowY, shadowX + shadowWidth, shadowY);

    // Same gradient stops as north wall shadow for consistency
    shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)'); // More intense start (at wall)
    shadowGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.3)'); // Gradual fade midpoint
    shadowGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)'); // Soft before end
    shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)'); // Fade to transparent

    ctx.fillStyle = shadowGradient;
    ctx.fillRect(shadowX, shadowY, shadowWidth, shadowHeight);
  }
  
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
  
  // Draw wall rectangle or diagonal line
  const isDiagonalWall = wall.edge === 4 || wall.edge === 5;
  
  // For diagonal walls on triangles, DON'T clip - we need to draw outside the foundation
  // For cardinal edges on triangles, clip to triangle shape
  let hasClipping = false;
  if (isTriangle && isValidEdgeForTriangle && !isDiagonalWall) {
    // For cardinal edges on triangles, clip to triangle shape
    ctx.save();
    setupTriangleClipPath(ctx, screenX, screenY, screenSize, wall.foundationShape);
    hasClipping = true;
  }
  
  if (isDiagonalWall && isTriangle) {
    // ═══════════════════════════════════════════════════════════════════════════
    // TRIANGLE FOUNDATION WALLS (2A/2B, 3A/3B, 4A/4B, 5A/5B)
    // ═══════════════════════════════════════════════════════════════════════════
    // For diagonal walls on triangles: draw TWO triangles with wall graphics
    // 1. Draw the foundation triangle (A) with wall texture
    // 2. Take the same triangle, transform it, and move it up one full tile (B)
    // These two triangles together form the wall, using wall graphics based on tier
    
    // Get wall image based on tier (same as cardinal walls)
    const isNorthWall = false; // Diagonal walls don't use interior/exterior distinction
    const wallFilename = getWallTileFilename(wall.tier, isNorthWall);
    const wallImage = foundationTileImagesRef?.current?.get(wallFilename);
    
    const tierColors: Record<number, string> = {
      0: '#8B4513', // Twig - brown
      1: '#654321', // Wood - dark brown
      2: '#808080', // Stone - gray
      3: '#C0C0C0', // Metal - silver
    };
    
    ctx.save();
    
    // Get the three vertices of the foundation triangle
    let v1X: number, v1Y: number, v2X: number, v2Y: number, v3X: number, v3Y: number;
    
    // ============================================================================
    // TRIANGLE FOUNDATION WALLS:
    // Each triangle foundation wall is composed of two triangles: bottom (A) and top (B)
    // 2A, 2B = TriNW (Top-left triangle foundation) - bottom and top triangles
    // 3A, 3B = TriNE (Top-right triangle foundation) - bottom and top triangles
    // 4A, 4B = TriSE (Bottom-right triangle foundation) - bottom and top triangles
    // 5A, 5B = TriSW (Bottom-left triangle foundation) - bottom and top triangles
    // All triangles now use wall graphics based on tier (same as cardinal walls)
    // ============================================================================
    
    // Determine triangle vertices based on foundation shape
    // These match setupTriangleClipPath
    switch (wall.foundationShape) {
      case 2: // TriNW - Top-left triangle
        // === 2A: Bottom triangle (foundation triangle) ===
        v1X = screenX;
        v1Y = screenY;
        v2X = screenX + screenSize;
        v2Y = screenY;
        v3X = screenX;
        v3Y = screenY + screenSize;
        break;
      case 3: // TriNE - Top-right triangle
        // === 3A: Bottom triangle (foundation triangle) ===
        v1X = screenX + screenSize;
        v1Y = screenY;
        v2X = screenX + screenSize;
        v2Y = screenY + screenSize;
        v3X = screenX;
        v3Y = screenY;
        break;
      case 4: // TriSE - Bottom-right triangle (SOUTH)
        // === 4A: Bottom triangle (foundation triangle) - REFLECTED across horizontal axis at base ===
        // Reflect across horizontal axis at base (screenY + screenSize): newY = 2 * baseY - oldY
        const baseY4 = screenY + screenSize;
        v1X = screenX + screenSize;
        v1Y = baseY4; // On axis, stays same
        v2X = screenX;
        v2Y = baseY4; // On axis, stays same
        v3X = screenX + screenSize;
        v3Y = 2 * baseY4 - screenY; // Reflect upward: was screenY, now screenY + 2*screenSize
        break;
      case 5: // TriSW - Bottom-left triangle (SOUTH)
        // === 5A: Bottom triangle (foundation triangle) - REFLECTED across horizontal axis at base ===
        // Reflect across horizontal axis at base (screenY + screenSize): newY = 2 * baseY - oldY
        const baseY5 = screenY + screenSize;
        v1X = screenX;
        v1Y = baseY5; // On axis, stays same
        v2X = screenX;
        v2Y = 2 * baseY5 - screenY; // Reflect upward: was screenY, now screenY + 2*screenSize
        v3X = screenX + screenSize;
        v3Y = baseY5; // On axis, stays same
        break;
      default:
        ctx.restore();
        return;
    }
    
    // Draw exterior shadow for triangle foundations BEFORE drawing triangles
    // This ensures shadows appear behind the walls
    if (cycleProgress !== undefined) {
      renderWallExteriorShadow({
        ctx,
        wall: wall as any,
        worldScale,
        cycleProgress,
        viewOffsetX,
        viewOffsetY,
      });
    }
    
    // Draw interior shadow for diagonal walls on triangle foundations (TriSE and TriSW only)
    // These shadows are time-independent and always visible
    // Draw BEFORE triangles so shadows appear behind walls
    if (wall.foundationShape === 4 || wall.foundationShape === 5) {
      ctx.save();
      const shadowDepth = screenSize * 0.3; // Same depth as other wall shadows
      
      // Get the diagonal edge coordinates for the triangle
      let hypStartX: number, hypStartY: number, hypEndX: number, hypEndY: number;
      
      if (wall.foundationShape === 4) {
        // TriSE - DiagNW_SE (edge 5): from bottom-left to top-right
        hypStartX = screenX;
        hypStartY = screenY + screenSize;
        hypEndX = screenX + screenSize;
        hypEndY = screenY;
      } else {
        // TriSW - DiagNE_SW (edge 4): from bottom-right to top-left
        hypStartX = screenX + screenSize;
        hypStartY = screenY + screenSize;
        hypEndX = screenX;
        hypEndY = screenY;
      }
      
      // Calculate the diagonal vector and its perpendicular (pointing inward)
      const dx = hypEndX - hypStartX;
      const dy = hypEndY - hypStartY;
      
      // Perpendicular vector pointing inward
      const perpX = -dy;
      const perpY = dx;
      const perpLength = Math.sqrt(perpX * perpX + perpY * perpY);
      
      // Normalize perpendicular vector
      const perpNormX = perpX / perpLength;
      const perpNormY = perpY / perpLength;
      
      // Determine which side is "inside" based on triangle interior point
      // For TriSE (4): interior is at bottom-right corner (screenX + screenSize, screenY + screenSize)
      // For TriSW (5): interior is at bottom-left corner (screenX, screenY + screenSize)
      let interiorX: number, interiorY: number;
      if (wall.foundationShape === 4) {
        // TriSE - interior is bottom-right corner
        interiorX = screenX + screenSize;
        interiorY = screenY + screenSize;
      } else {
        // TriSW - interior is bottom-left corner
        interiorX = screenX;
        interiorY = screenY + screenSize;
      }
      
      const wallMidX = (hypStartX + hypEndX) / 2;
      const wallMidY = (hypStartY + hypEndY) / 2;
      
      // Check if perpendicular points toward triangle interior (if not, flip it)
      const toInteriorX = interiorX - wallMidX;
      const toInteriorY = interiorY - wallMidY;
      const dotProduct = perpNormX * toInteriorX + perpNormY * toInteriorY;
      
      // If dot product is negative, flip the perpendicular direction
      const finalPerpX = dotProduct < 0 ? -perpNormX : perpNormX;
      const finalPerpY = dotProduct < 0 ? -perpNormY : perpNormY;
      
      // Calculate shadow start and end points along the diagonal
      const shadowStartX = hypStartX + finalPerpX * shadowDepth;
      const shadowStartY = hypStartY + finalPerpY * shadowDepth;
      const shadowEndX = hypEndX + finalPerpX * shadowDepth;
      const shadowEndY = hypEndY + finalPerpY * shadowDepth;
      
      // Create gradient along the perpendicular direction
      const gradientStartX = wallMidX;
      const gradientStartY = wallMidY;
      const gradientEndX = wallMidX + finalPerpX * shadowDepth;
      const gradientEndY = wallMidY + finalPerpY * shadowDepth;
      
      const shadowGradient = ctx.createLinearGradient(
        gradientStartX, gradientStartY,
        gradientEndX, gradientEndY
      );
      
      // Same gradient stops as north/east/west walls for consistency
      shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)'); // More intense start
      shadowGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.3)'); // Gradual fade midpoint
      shadowGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)'); // Soft before end
      shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)'); // Fade to transparent
      
      // Draw shadow as a quadrilateral
      ctx.fillStyle = shadowGradient;
      ctx.beginPath();
      ctx.moveTo(hypStartX, hypStartY); // Start at wall start
      ctx.lineTo(hypEndX, hypEndY); // Along wall end
      ctx.lineTo(shadowEndX, shadowEndY); // Shadow end point
      ctx.lineTo(shadowStartX, shadowStartY); // Shadow start point
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
    }
    
    // === Draw bottom triangle (A): 2A, 3A, 4A, 5A ===
    // For 2A/3A: draw at foundation vertices
    // For 4A and 5A: mirror on vertical axis (keep X, flip Y)
    const centerX = screenX + screenSize / 2;
    const centerY = screenY + screenSize / 2;
    
    let drawV1X: number, drawV1Y: number, drawV2X: number, drawV2Y: number, drawV3X: number, drawV3Y: number;
    
    if (wall.foundationShape === 4 || wall.foundationShape === 5) {
      // Mirror 4A and 5A on vertical axis: newX = oldX, newY = 2 * centerY - oldY
      // Move down a few pixels
      const downOffset = 3 * worldScale;
      drawV1X = v1X;
      drawV1Y = 2 * centerY - v1Y + downOffset;
      drawV2X = v2X;
      drawV2Y = 2 * centerY - v2Y + downOffset;
      drawV3X = v3X;
      drawV3Y = 2 * centerY - v3Y + downOffset;
    } else {
      // For 2A/3A: draw at foundation vertices directly (no change)
      drawV1X = v1X;
      drawV1Y = v1Y;
      drawV2X = v2X;
      drawV2Y = v2Y;
      drawV3X = v3X;
      drawV3Y = v3Y;
    }
    
    // Draw bottom triangle (A) with wall image
    ctx.save(); // Save before clipping triangle A
    ctx.beginPath();
    ctx.moveTo(drawV1X, drawV1Y);
    ctx.lineTo(drawV2X, drawV2Y);
    ctx.lineTo(drawV3X, drawV3Y);
    ctx.closePath();
    ctx.clip(); // Clip to bottom triangle (A) shape
    
    // Draw wall image on bottom triangle (A)
    if (wallImage && wallImage.complete && wallImage.naturalHeight !== 0) {
      // Calculate bounding box for the triangle
      const minX = Math.min(drawV1X, drawV2X, drawV3X);
      const maxX = Math.max(drawV1X, drawV2X, drawV3X);
      const minY = Math.min(drawV1Y, drawV2Y, drawV3Y);
      const maxY = Math.max(drawV1Y, drawV2Y, drawV3Y);
      const triangleWidth = maxX - minX;
      const triangleHeight = maxY - minY;
      
      // Draw the wall image covering the triangle area
      ctx.drawImage(
        wallImage,
        0, 0, wallImage.width, wallImage.height, // Source: full image
        minX, minY, triangleWidth, triangleHeight // Destination: triangle bounding box
      );
      
      // Apply darkening overlay for south triangle foundations (TriSE=4, TriSW=5)
      // Same as north walls - make them darker/shaded since they're interior-facing
      if (wall.foundationShape === 4 || wall.foundationShape === 5) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.15; // Darkening intensity (same as north walls)
        ctx.fillStyle = '#000000'; // Black for darkening
        ctx.fillRect(minX, minY, triangleWidth, triangleHeight);
        
        // Reset composite operation and alpha
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
      }
    } else {
      // Fallback: Draw colored triangle
      ctx.fillStyle = tierColors[wall.tier] || '#8B4513';
      ctx.beginPath();
      ctx.moveTo(drawV1X, drawV1Y);
      ctx.lineTo(drawV2X, drawV2Y);
      ctx.lineTo(drawV3X, drawV3Y);
      ctx.closePath();
      ctx.fill();
    }
    
    ctx.restore(); // Restore clipping for triangle A
    
    // Draw border for bottom triangle (A) - exclude the shared interior edge
    // The shared edge differs by foundation shape:
    // - Case 2 (TriNW): v1-v2 is shared (top horizontal edge)
    // - Case 3 (TriNE): v3-v1 is shared (top horizontal edge)
    // - Case 4 (TriSE): v1-v2 is shared (horizontal bottom edge)
    // - Case 5 (TriSW): v3-v1 is shared (horizontal bottom edge)
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    if (wall.foundationShape === 2) {
      // TriNW: v1-v2 is shared, draw v2-v3 and v3-v1
      ctx.moveTo(drawV2X, drawV2Y);
      ctx.lineTo(drawV3X, drawV3Y); // Exterior edge (v2-v3)
      ctx.lineTo(drawV1X, drawV1Y); // Exterior edge (v3-v1)
      // Skip v1-v2 as it's the shared interior edge
    } else if (wall.foundationShape === 3) {
      // TriNE: v3-v1 is shared, draw v1-v2 and v2-v3
      ctx.moveTo(drawV1X, drawV1Y);
      ctx.lineTo(drawV2X, drawV2Y); // Exterior edge (v1-v2)
      ctx.lineTo(drawV3X, drawV3Y); // Exterior edge (v2-v3)
      // Skip v3-v1 as it's the shared interior edge
    } else if (wall.foundationShape === 4) {
      // TriSE: v1-v2 is shared, draw v2-v3 and v3-v1
      ctx.moveTo(drawV2X, drawV2Y);
      ctx.lineTo(drawV3X, drawV3Y); // Exterior edge (v2-v3)
      ctx.lineTo(drawV1X, drawV1Y); // Exterior edge (v3-v1)
      // Skip v1-v2 as it's the shared interior edge
    } else if (wall.foundationShape === 5) {
      // TriSW: v3-v1 is shared, draw v1-v2 and v2-v3
      ctx.moveTo(drawV1X, drawV1Y);
      ctx.lineTo(drawV2X, drawV2Y); // Exterior edge (v1-v2)
      ctx.lineTo(drawV3X, drawV3Y); // Exterior edge (v2-v3)
      // Skip v3-v1 as it's the shared interior edge
    }
    
    ctx.stroke();
    ctx.restore();
    
    // === Create top triangle (B) by transforming bottom triangle (A) ===
    // 2B, 3B, 4B, 5B
    // For SOUTH triangle foundations (TriNW=2, TriNE=3), rotate the top triangle 180 degrees around center
    // For NORTH triangle foundations (TriSE=4, TriSW=5), mirror horizontally (left/right)
    const isSouthTriangle = wall.foundationShape === 2 || wall.foundationShape === 3;
    
    let mirrorV1X: number, mirrorV1Y: number, mirrorV2X: number, mirrorV2Y: number, mirrorV3X: number, mirrorV3Y: number;
    
    if (isSouthTriangle) {
      // === 2B, 3B: Top triangles created from 2A, 3A ===
      // SOUTH triangles (TriNW=2, TriNE=3): rotate 180 degrees around center, then move up
      // 180-degree rotation: newX = 2 * centerX - oldX, newY = 2 * centerY - oldY
      mirrorV1X = 2 * centerX - v1X; // Rotate X around center
      mirrorV1Y = 2 * centerY - v1Y - screenSize; // Rotate Y around center, then move up
      mirrorV2X = 2 * centerX - v2X;
      mirrorV2Y = 2 * centerY - v2Y - screenSize;
      mirrorV3X = 2 * centerX - v3X;
      mirrorV3Y = 2 * centerY - v3Y - screenSize;
    } else {
      // === 4B, 5B: Top triangles created from 4A, 5A ===
      // NORTH triangles (TriSE=4, TriSW=5): mirror horizontally (left/right) and move up
      // Move down a few pixels (same offset as 4A/5A)
      const downOffset = 3 * worldScale;
      mirrorV1X = 2 * centerX - v1X;
      mirrorV1Y = v1Y - screenSize + downOffset; // Move up one tile, then down a few pixels
      mirrorV2X = 2 * centerX - v2X;
      mirrorV2Y = v2Y - screenSize + downOffset;
      mirrorV3X = 2 * centerX - v3X;
      mirrorV3Y = v3Y - screenSize + downOffset;
    }
    
    // === Draw top triangle (B): 2B, 3B, 4B, 5B ===
    ctx.save();
    
    // Clip to top triangle (B) shape
    ctx.beginPath();
    ctx.moveTo(mirrorV1X, mirrorV1Y);
    ctx.lineTo(mirrorV2X, mirrorV2Y);
    ctx.lineTo(mirrorV3X, mirrorV3Y);
    ctx.closePath();
    ctx.clip();
    
    // Draw wall image on top triangle (B)
    if (wallImage && wallImage.complete && wallImage.naturalHeight !== 0) {
      // Calculate bounding box for the triangle
      const minX = Math.min(mirrorV1X, mirrorV2X, mirrorV3X);
      const maxX = Math.max(mirrorV1X, mirrorV2X, mirrorV3X);
      const minY = Math.min(mirrorV1Y, mirrorV2Y, mirrorV3Y);
      const maxY = Math.max(mirrorV1Y, mirrorV2Y, mirrorV3Y);
      const triangleWidth = maxX - minX;
      const triangleHeight = maxY - minY;
      
      // Draw the wall image covering the triangle area
      ctx.drawImage(
        wallImage,
        0, 0, wallImage.width, wallImage.height, // Source: full image
        minX, minY, triangleWidth, triangleHeight // Destination: triangle bounding box
      );
      
      // Apply darkening overlay for south triangle foundations (TriSE=4, TriSW=5)
      // Same as north walls - make them darker/shaded since they're interior-facing
      if (wall.foundationShape === 4 || wall.foundationShape === 5) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.15; // Darkening intensity (same as north walls)
        ctx.fillStyle = '#000000'; // Black for darkening
        ctx.fillRect(minX, minY, triangleWidth, triangleHeight);
        
        // Reset composite operation and alpha
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
      }
    } else {
      // Fallback: Draw colored triangle
      ctx.fillStyle = tierColors[wall.tier] || '#8B4513';
      ctx.beginPath();
      ctx.moveTo(mirrorV1X, mirrorV1Y);
      ctx.lineTo(mirrorV2X, mirrorV2Y);
      ctx.lineTo(mirrorV3X, mirrorV3Y);
      ctx.closePath();
      ctx.fill();
    }
    
    ctx.restore(); // Restore clipping
    
    // Draw border for top triangle (B) - exclude the shared interior edge
    // The shared edge matches the bottom triangle (A) for the same foundation shape
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    if (wall.foundationShape === 2) {
      // TriNW: mirrorV1-mirrorV2 is shared, draw mirrorV2-mirrorV3 and mirrorV3-mirrorV1
      ctx.moveTo(mirrorV2X, mirrorV2Y);
      ctx.lineTo(mirrorV3X, mirrorV3Y); // Exterior edge (mirrorV2-mirrorV3)
      ctx.lineTo(mirrorV1X, mirrorV1Y); // Exterior edge (mirrorV3-mirrorV1)
      // Skip mirrorV1-mirrorV2 as it's the shared interior edge
    } else if (wall.foundationShape === 3) {
      // TriNE: mirrorV3-mirrorV1 is shared, draw mirrorV1-mirrorV2 and mirrorV2-mirrorV3
      ctx.moveTo(mirrorV1X, mirrorV1Y);
      ctx.lineTo(mirrorV2X, mirrorV2Y); // Exterior edge (mirrorV1-mirrorV2)
      ctx.lineTo(mirrorV3X, mirrorV3Y); // Exterior edge (mirrorV2-mirrorV3)
      // Skip mirrorV3-mirrorV1 as it's the shared interior edge
    } else if (wall.foundationShape === 4) {
      // TriSE: mirrorV1-mirrorV2 is shared, draw mirrorV2-mirrorV3 and mirrorV3-mirrorV1
      ctx.moveTo(mirrorV2X, mirrorV2Y);
      ctx.lineTo(mirrorV3X, mirrorV3Y); // Exterior edge (mirrorV2-mirrorV3)
      ctx.lineTo(mirrorV1X, mirrorV1Y); // Exterior edge (mirrorV3-mirrorV1)
      // Skip mirrorV1-mirrorV2 as it's the shared interior edge
    } else if (wall.foundationShape === 5) {
      // TriSW: mirrorV3-mirrorV1 is shared, draw mirrorV1-mirrorV2 and mirrorV2-mirrorV3
      ctx.moveTo(mirrorV1X, mirrorV1Y);
      ctx.lineTo(mirrorV2X, mirrorV2Y); // Exterior edge (mirrorV1-mirrorV2)
      ctx.lineTo(mirrorV3X, mirrorV3Y); // Exterior edge (mirrorV2-mirrorV3)
      // Skip mirrorV3-mirrorV1 as it's the shared interior edge
    }
    
    ctx.stroke();
    ctx.restore();
    
    ctx.restore();
  } else if (isDiagonalWall) {
    // For diagonal walls on non-triangle foundations, use the old method
    let hypStartX: number, hypStartY: number, hypEndX: number, hypEndY: number;
    
    // Determine hypotenuse coordinates
    if (wall.edge === 4) { // DiagNE_SW
      hypStartX = screenX;
      hypStartY = screenY;
      hypEndX = screenX + screenSize;
      hypEndY = screenY + screenSize;
    } else { // DiagNW_SE (edge 5)
      hypStartX = screenX + screenSize;
      hypStartY = screenY;
      hypEndX = screenX;
      hypEndY = screenY + screenSize;
    }
    
    // Draw diagonal wall texture (rotated strip along hypotenuse)
    if (wallImage && wallImage.complete && wallImage.naturalHeight !== 0) {
      ctx.save();
      const centerX = (hypStartX + hypEndX) / 2;
      const centerY = (hypStartY + hypEndY) / 2;
      const angle = Math.atan2(hypEndY - hypStartY, hypEndX - hypStartX);
      
      ctx.translate(centerX, centerY);
      ctx.rotate(angle);
      ctx.translate(-centerX, -centerY);
      
      const stripWidth = Math.sqrt((hypEndX - hypStartX) ** 2 + (hypEndY - hypStartY) ** 2);
      const stripHeight = DIAGONAL_WALL_THICKNESS;
      ctx.drawImage(
        wallImage,
        0, 0, wallImage.width, DIAGONAL_WALL_THICKNESS / worldScale,
        centerX - stripWidth / 2, centerY - stripHeight / 2, stripWidth, stripHeight
      );
      ctx.restore();
    } else {
      const tierColors: Record<number, string> = {
        0: '#8B4513',
        1: '#654321',
        2: '#808080',
        3: '#C0C0C0',
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
    
    // Draw interior shadow for diagonal walls (same formula as north/east/west walls)
    // Shadow extends inward perpendicular to the diagonal wall
    // Draw BEFORE the wall stroke so it's visible on the foundation tile
    ctx.save();
    const shadowDepth = screenSize * 0.3; // Same depth as other wall shadows
    
    // Calculate the diagonal vector and its perpendicular (pointing inward)
    const dx = hypEndX - hypStartX;
    const dy = hypEndY - hypStartY;
    const diagonalLength = Math.sqrt(dx * dx + dy * dy);
    
    // Perpendicular vector pointing inward (rotate 90 degrees clockwise)
    // For DiagNE_SW (top-left to bottom-right), inward is toward top-right
    // For DiagNW_SE (top-right to bottom-left), inward is toward top-left
    const perpX = -dy; // Perpendicular X component
    const perpY = dx;  // Perpendicular Y component
    const perpLength = Math.sqrt(perpX * perpX + perpY * perpY);
    
    // Normalize perpendicular vector
    const perpNormX = perpX / perpLength;
    const perpNormY = perpY / perpLength;
    
    // Determine which side is "inside" based on foundation center
    const foundationCenterX = screenX + screenSize / 2;
    const foundationCenterY = screenY + screenSize / 2;
    const wallMidX = (hypStartX + hypEndX) / 2;
    const wallMidY = (hypStartY + hypEndY) / 2;
    
    // Check if perpendicular points toward center (if not, flip it)
    const toCenterX = foundationCenterX - wallMidX;
    const toCenterY = foundationCenterY - wallMidY;
    const dotProduct = perpNormX * toCenterX + perpNormY * toCenterY;
    
    // If dot product is negative, flip the perpendicular direction
    const finalPerpX = dotProduct < 0 ? -perpNormX : perpNormX;
    const finalPerpY = dotProduct < 0 ? -perpNormY : perpNormY;
    
    // Calculate shadow start and end points along the diagonal
    const shadowStartX = hypStartX + finalPerpX * shadowDepth;
    const shadowStartY = hypStartY + finalPerpY * shadowDepth;
    const shadowEndX = hypEndX + finalPerpX * shadowDepth;
    const shadowEndY = hypEndY + finalPerpY * shadowDepth;
    
    // Create gradient along the perpendicular direction
    const gradientStartX = wallMidX;
    const gradientStartY = wallMidY;
    const gradientEndX = wallMidX + finalPerpX * shadowDepth;
    const gradientEndY = wallMidY + finalPerpY * shadowDepth;
    
    const shadowGradient = ctx.createLinearGradient(
      gradientStartX, gradientStartY,
      gradientEndX, gradientEndY
    );
    
    // Same gradient stops as north/east/west walls for consistency
    shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)'); // More intense start
    shadowGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.3)'); // Gradual fade midpoint
    shadowGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)'); // Soft before end
    shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)'); // Fade to transparent
    
    // Draw shadow as a quadrilateral
    ctx.fillStyle = shadowGradient;
    ctx.beginPath();
    ctx.moveTo(hypStartX, hypStartY); // Start at wall start
    ctx.lineTo(hypEndX, hypEndY); // Along wall end
    ctx.lineTo(shadowEndX, shadowEndY); // Shadow end point
    ctx.lineTo(shadowStartX, shadowStartY); // Shadow start point
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
    
    // Draw wall stroke AFTER the shadow so the shadow is visible
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(hypStartX, hypStartY);
    ctx.lineTo(hypEndX, hypEndY);
    ctx.stroke();
  } else {
    // Draw cardinal wall as a visible rectangle
    // For north walls, draw exterior shadow FIRST before any wall rendering
    // This ensures the wall appears above its exterior shadow
    if (wall.edge === 0 && cycleProgress !== undefined) {
      renderWallExteriorShadow({
        ctx,
        wall: wall as any,
        worldScale,
        cycleProgress,
        viewOffsetX,
        viewOffsetY,
      });
    }
    
    // For north walls, draw interior shadow FIRST before any wall rendering
    if (wall.edge === 0) {
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
    }
    
    // First draw the texture/image if available
    if (wallImage && wallImage.complete && wallImage.naturalHeight !== 0) {
      // Draw a portion of the wall tile image for the wall
      // For horizontal walls (N/S), we take a horizontal strip from the tile
      // For vertical walls (E/W), we take a vertical strip from the tile
      // Horizontal wall - draw scaled tile for north/south walls (taller for isometric)
      if (wall.edge === 0) {
        // North wall (interior) - use BOTTOM half of texture, make it lighter
        const sourceY = wallImage.height * 0.5; // Start from middle (bottom half)
        const sourceHeight = wallImage.height * 0.5; // Bottom half of texture
        
        ctx.save();
        
        // Draw the bottom half of the image AFTER shadow so wall appears on top
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
        
        ctx.restore();
      } else if (wall.edge === 2) {
        // South wall - use full texture for full height (1 tile)
        // Check if there's an east wall or west wall on the same foundation and draw their interior shadows first
        // This ensures south walls render above east/west wall shadows
        if (allWalls) {
          // Find east wall on the same foundation tile (edge === 1)
          for (const [_, eastWall] of allWalls) {
            if (eastWall.cellX === wall.cellX && 
                eastWall.cellY === wall.cellY && 
                eastWall.edge === 1 && 
                !eastWall.isDestroyed && 
                eastWall.foundationShape === wall.foundationShape) {
              // Draw east wall's interior shadow BEFORE drawing south wall
              const shadowWidth = screenSize * 0.3;
              const shadowY = screenY;
              const shadowHeight = screenSize;
              const shadowX = screenX + screenSize - EAST_WEST_WALL_THICKNESS / 2 - shadowWidth;
              const shadowGradient = ctx.createLinearGradient(shadowX + shadowWidth, shadowY, shadowX, shadowY);
              shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
              shadowGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.3)');
              shadowGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)');
              shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
              ctx.fillStyle = shadowGradient;
              ctx.fillRect(shadowX, shadowY, shadowWidth, shadowHeight);
              break; // Found the east wall, no need to continue searching
            }
          }
          
          // Find west wall on the same foundation tile (edge === 3)
          for (const [_, westWall] of allWalls) {
            if (westWall.cellX === wall.cellX && 
                westWall.cellY === wall.cellY && 
                westWall.edge === 3 && 
                !westWall.isDestroyed && 
                westWall.foundationShape === wall.foundationShape) {
              // Draw west wall's interior shadow BEFORE drawing south wall
              const shadowWidth = screenSize * 0.3;
              const shadowY = screenY;
              const shadowHeight = screenSize;
              const shadowX = screenX; // Start from the left edge of the foundation tile
              const shadowGradient = ctx.createLinearGradient(shadowX, shadowY, shadowX + shadowWidth, shadowY);
              shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
              shadowGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.3)');
              shadowGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)');
              shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
              ctx.fillStyle = shadowGradient;
              ctx.fillRect(shadowX, shadowY, shadowWidth, shadowHeight);
              break; // Found the west wall, no need to continue searching
            }
          }
        }
        
        ctx.drawImage(
          wallImage,
          0, 0, wallImage.width, wallImage.height, // Source: full tile
          wallX, wallY, wallWidth, wallHeight // Destination: full wall (SOUTH_WALL_HEIGHT)
        );
      } else {
        // Vertical wall (East/West) - draw vertical strip from tile
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
          
          // Draw shadow BELOW the wall FIRST, projected onto the ground/foundation (fallback)
          // Sea of Stars style - softer, more gradual fade
          // Shadow should be on the foundation tile below, not on the wall itself
          // Draw shadow BEFORE wall so wall appears on top
          const shadowHeight = screenSize * 0.3; // Shadow extends onto the foundation below
          const shadowY = screenY; // Start at the top of the foundation tile (where wall meets ground)
          
          const shadowGradient = ctx.createLinearGradient(wallX, shadowY, wallX, shadowY + shadowHeight);
          shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)'); // More intense start
          shadowGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.3)'); // Gradual fade midpoint
          shadowGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)'); // Soft before end
          shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)'); // Fade to transparent at bottom
          ctx.fillStyle = shadowGradient;
          ctx.fillRect(wallX, shadowY, wallWidth, shadowHeight);
          
          // Apply darkening overlay (make it darker/shaded) for interior north walls AFTER shadow
          ctx.globalCompositeOperation = 'multiply';
          ctx.globalAlpha = 0.3; // Darkening intensity
          ctx.fillStyle = '#000000'; // Black for darkening
          ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
          
          // Reset composite operation
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1.0;
          ctx.restore();
        }
      } else {
        // East/west walls - draw normally
        ctx.fillStyle = tierColors[wall.tier] || '#8B4513';
        ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
        
        // Draw interior shadow for east/west walls (fallback)
        // East walls (edge === 1) cast shadow to the left
        // West walls (edge === 3) cast shadow to the right
        // Shadows should be projected onto the foundation tile, not on the wall itself
        if (wall.edge === 1 || wall.edge === 3) {
          const shadowWidth = screenSize * 0.3; // Shadow extends horizontally onto the foundation
          const shadowY = screenY; // Start at the top of the foundation tile (where wall meets ground)
          const shadowHeight = screenSize; // Shadow covers the full height of the foundation tile
          let shadowX: number;
          let shadowGradient: CanvasGradient;
          
          if (wall.edge === 1) {
            // East wall - shadow to the left
            shadowX = screenX - shadowWidth; // Start to the left of the tile
            shadowGradient = ctx.createLinearGradient(shadowX + shadowWidth, shadowY, shadowX, shadowY);
          } else {
            // West wall - shadow to the right
            shadowX = screenX + screenSize; // Start at the right edge of the tile
            shadowGradient = ctx.createLinearGradient(shadowX, shadowY, shadowX + shadowWidth, shadowY);
          }
          
          // Same gradient stops as north wall shadow for consistency
          shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)'); // More intense start
          shadowGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.3)'); // Gradual fade midpoint
          shadowGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)'); // Soft before end
          shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)'); // Fade to transparent
          
          ctx.fillStyle = shadowGradient;
          ctx.fillRect(shadowX, shadowY, shadowWidth, shadowHeight);
        }
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
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    if (wall.edge === 0) {
      // North wall - draw border on all sides including bottom
      ctx.beginPath();
      ctx.moveTo(wallX, wallY); // Top left
      ctx.lineTo(wallX + wallWidth, wallY); // Top right
      ctx.lineTo(wallX + wallWidth, wallY + wallHeight); // Right side to bottom right
      ctx.lineTo(wallX, wallY + wallHeight); // Bottom left
      ctx.closePath(); // Close the path to include the bottom edge
      ctx.stroke();
    } else {
      // Other walls - draw full border
      ctx.strokeRect(wallX, wallY, wallWidth, wallHeight);
    }
  }
  
  // Only restore clipping if it was set up
  if (hasClipping) {
    ctx.restore();
  }
  
  ctx.restore();
  
  // Draw interior shadow for east walls AFTER all wall rendering and context restoration
  // This ensures shadows are not clipped and render on top of foundations
  // East walls (edge === 1) cast shadow to the left (toward interior)
  // West walls (edge === 3) have their shadows drawn BEFORE the wall itself
  // Shadows should be projected onto the foundation tile, starting from the wall position
  // NOTE: East wall shadows are drawn BEFORE south walls (see south wall rendering above)
  // So we skip drawing east wall shadow here if there's a south wall on the same foundation
  // Only render interior shadows when player is inside the building cluster
  if (wall.edge === 1 && playerInsideCluster) {
    // For east walls, check if there's a south wall on the same foundation
    // If so, skip drawing shadow here (it was already drawn before the south wall)
    if (allWalls) {
      // Find south wall on the same foundation tile (edge === 2)
      for (const [_, southWall] of allWalls) {
        if (southWall.cellX === wall.cellX && 
            southWall.cellY === wall.cellY && 
            southWall.edge === 2 && 
            !southWall.isDestroyed && 
            southWall.foundationShape === wall.foundationShape) {
          // Skip drawing east/west wall shadow here - it was already drawn before the south wall
          return;
        }
      }
    }
    
    const shadowWidth = screenSize * 0.3; // Shadow extends horizontally onto the foundation
    const shadowY = screenY; // Start at the top of the foundation tile (where wall meets ground)
    const shadowHeight = screenSize; // Shadow covers the full height of the foundation tile
    let shadowX: number;
    let shadowGradient: CanvasGradient;
    
    if (wall.edge === 1) {
      // East wall - shadow extends to the left (toward interior)
      // Wall is positioned at: screenX + screenSize - EAST_WEST_WALL_THICKNESS / 2
      // Shadow should start from where the wall meets the foundation interior and extend leftward
      shadowX = screenX + screenSize - EAST_WEST_WALL_THICKNESS / 2 - shadowWidth; // Start from wall position, extend left
      shadowGradient = ctx.createLinearGradient(shadowX + shadowWidth, shadowY, shadowX, shadowY);
    } else {
      // West wall - shadow extends to the right (toward interior)
      // Wall is positioned at: screenX - EAST_WEST_WALL_THICKNESS / 2 (centered on left edge)
      // Shadow should start from where the wall meets the foundation interior (screenX) and extend rightward
      shadowX = screenX; // Start from the left edge of the foundation tile (where wall meets interior)
      shadowGradient = ctx.createLinearGradient(shadowX, shadowY, shadowX + shadowWidth, shadowY);
    }
    
    // Same gradient stops as north wall shadow for consistency
    shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)'); // More intense start (at wall)
    shadowGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.3)'); // Gradual fade midpoint
    shadowGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.12)'); // Soft before end
    shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)'); // Fade to transparent
    
    ctx.fillStyle = shadowGradient;
    ctx.fillRect(shadowX, shadowY, shadowWidth, shadowHeight);
  }
  
  // --- Health Bar Rendering (similar to barrels, shelters, etc.) ---
  const HEALTH_BAR_WIDTH = 60;
  const HEALTH_BAR_HEIGHT = 6;
  const HEALTH_BAR_Y_OFFSET = 10;
  const HEALTH_BAR_VISIBLE_DURATION_MS = 3000;
  
  if (!wall.isDestroyed && wall.health < wall.maxHealth && wall.lastHitTime) {
    const nowMs = Date.now();
    const lastHitTimeMs = Number(wall.lastHitTime.microsSinceUnixEpoch / 1000n);
    const elapsedSinceHit = nowMs - lastHitTimeMs;
    
    if (elapsedSinceHit < HEALTH_BAR_VISIBLE_DURATION_MS) {
      const healthPercentage = Math.max(0, wall.health / wall.maxHealth);
      
      // Calculate health bar position based on wall edge - position it close to the actual wall
      // Use the same constants as wall rendering
      const WALL_THICKNESS = 4 * worldScale;
      const EAST_WEST_WALL_THICKNESS = 12 * worldScale;
      const NORTH_WALL_HEIGHT = screenSize * 1.0;
      const SOUTH_WALL_HEIGHT = screenSize;
      
      let barOuterX: number;
      let barOuterY: number;
      
      switch (wall.edge) {
        case 0: // North wall - position at top edge of wall
          barOuterX = screenX + screenSize / 2 - HEALTH_BAR_WIDTH / 2;
          barOuterY = screenY - NORTH_WALL_HEIGHT + WALL_THICKNESS / 2 - HEALTH_BAR_Y_OFFSET - HEALTH_BAR_HEIGHT;
          break;
        case 1: // East wall - position at right edge
          barOuterX = screenX + screenSize - EAST_WEST_WALL_THICKNESS / 2 + HEALTH_BAR_Y_OFFSET;
          barOuterY = screenY + screenSize / 2 - HEALTH_BAR_HEIGHT / 2;
          break;
        case 2: // South wall - position at bottom edge
          barOuterX = screenX + screenSize / 2 - HEALTH_BAR_WIDTH / 2;
          barOuterY = screenY + screenSize - SOUTH_WALL_HEIGHT + HEALTH_BAR_Y_OFFSET;
          break;
        case 3: // West wall - position at left edge
          barOuterX = screenX - EAST_WEST_WALL_THICKNESS / 2 - HEALTH_BAR_Y_OFFSET - HEALTH_BAR_WIDTH;
          barOuterY = screenY + screenSize / 2 - HEALTH_BAR_HEIGHT / 2;
          break;
        case 4: // DiagNE_SW
        case 5: // DiagNW_SE
          // For diagonal walls, position at center
          barOuterX = screenX + screenSize / 2 - HEALTH_BAR_WIDTH / 2;
          barOuterY = screenY + screenSize / 2 - HEALTH_BAR_Y_OFFSET - HEALTH_BAR_HEIGHT;
          break;
        default:
          // Fallback to center
          barOuterX = screenX + screenSize / 2 - HEALTH_BAR_WIDTH / 2;
          barOuterY = screenY + screenSize / 2 - HEALTH_BAR_Y_OFFSET - HEALTH_BAR_HEIGHT;
      }
      
      const timeSinceLastHitRatio = elapsedSinceHit / HEALTH_BAR_VISIBLE_DURATION_MS;
      const opacity = Math.max(0, 1 - Math.pow(timeSinceLastHitRatio, 2)); // Fade out faster at the end
      
      ctx.save();
      ctx.globalAlpha = opacity;
      
      // Background
      ctx.fillStyle = `rgba(0, 0, 0, ${0.5})`;
      ctx.fillRect(barOuterX, barOuterY, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
      
      // Health bar
      const healthBarInnerWidth = HEALTH_BAR_WIDTH * healthPercentage;
      const r = Math.floor(255 * (1 - healthPercentage));
      const g = Math.floor(255 * healthPercentage);
      ctx.fillStyle = `rgba(${r}, ${g}, 0, 1)`;
      ctx.fillRect(barOuterX, barOuterY, healthBarInnerWidth, HEALTH_BAR_HEIGHT);
      
      // Border
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.7})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(barOuterX, barOuterY, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
      
      ctx.restore();
    }
  }
  
  // Restore context if transparency was applied
  if (needsTransparency) {
    ctx.restore();
  }
}

/**
 * Render exterior wall shadows that change throughout the day based on sun position
 * Sea of Stars style - soft, atmospheric shadows throughout all time periods
 * Shadows extend OUTWARD from walls onto the ground outside the building
 */
export function renderWallExteriorShadow({
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
  
  // Check if this is a triangle foundation
  const isTriangleFoundation = wall.foundationShape >= 2 && wall.foundationShape <= 5;
  
  // Dawn (0.0 - 0.05): Very soft shadows, sun rising from east
  if (cycleProgress >= 0.0 && cycleProgress < 0.05) {
    if (isTriangleFoundation) {
      // TriSE (4) and TriNE (3) cast shadows left in morning
      // TriNW (2) and TriSW (5) don't cast in morning
      shouldCastShadow = wall.edge === 3 || 
        (wall.foundationShape === 4 && (wall.edge === 4 || wall.edge === 5)) ||
        (wall.foundationShape === 3 && (wall.edge === 4 || wall.edge === 5));
    } else {
      shouldCastShadow = wall.edge === 3 || wall.edge === 4 || wall.edge === 5; // West walls and both diagonals cast long, soft shadows (westward)
    }
    shadowAlpha = 0.25 + (cycleProgress / 0.05) * 0.15; // 0.25 -> 0.40
    shadowDepth = screenSize * (1.2 - (cycleProgress / 0.05) * 0.4); // 1.2 -> 0.8 (long to medium)
    shadowColor = { r: 20, g: 10, b: 40 }; // Bluish-purple dawn shadows
    gradientStops = [0, 0.7, 1.0]; // Softer falloff
  }
  // Morning (0.05 - 0.35): Sun in east, shadows cast west
  else if (cycleProgress >= 0.05 && cycleProgress < 0.35) {
    if (isTriangleFoundation) {
      // TriSE (4) and TriNE (3) cast shadows left in morning
      // TriNW (2) and TriSW (5) don't cast in morning
      shouldCastShadow = wall.edge === 3 || ((wall.edge === 4 || wall.edge === 5) && (wall.foundationShape === 4 || wall.foundationShape === 3));
    } else {
      shouldCastShadow = wall.edge === 3 || wall.edge === 4 || wall.edge === 5; // West walls and both diagonals (westward shadows)
    }
    const morningProgress = (cycleProgress - 0.05) / 0.30;
    shadowAlpha = 0.40 + morningProgress * 0.10; // 0.40 -> 0.50
    shadowDepth = screenSize * (0.8 - morningProgress * 0.1); // 0.8 -> 0.7
    shadowColor = { r: 10, g: 5, b: 20 }; // Slight cool tint
    gradientStops = [0, 0.65, 1.0];
  }
  // Noon (0.35 - 0.55): Sun overhead, short shadows from all sides
  else if (cycleProgress >= 0.35 && cycleProgress < 0.55) {
    if (isTriangleFoundation) {
      // TriSE (4) and TriNE (3) cast shadows left in morning/noon
      // TriNW (2) and TriSW (5) don't cast until afternoon
      // Exclude TriNW (2) and TriSW (5) during noon
      const isTriNW = wall.foundationShape === 2;
      const isTriSW = wall.foundationShape === 5;
      shouldCastShadow = !isTriNW && !isTriSW;
    } else {
      shouldCastShadow = true; // All walls cast shadows
    }
    const noonProgress = (cycleProgress - 0.35) / 0.20;
    const peakNoon = Math.abs(noonProgress - 0.5) * 2; // 0 at exact noon (0.45), 1 at edges
    shadowAlpha = 0.20 + peakNoon * 0.05; // 0.20 at noon, 0.25 at edges
    shadowDepth = screenSize * 0.4; // Very short shadows
    shadowColor = { r: 0, g: 0, b: 0 }; // Pure black at noon
    gradientStops = [0, 0.5, 1.0]; // Tight gradient
  }
  // Afternoon (0.55 - 0.72): Sun in west, shadows cast east
  else if (cycleProgress >= 0.55 && cycleProgress < 0.72) {
    if (isTriangleFoundation) {
      // TriSW (5) and TriNW (2) cast shadows right after noon
      // TriSE (4) and TriNE (3) don't cast after noon
      shouldCastShadow = wall.edge === 1 || ((wall.edge === 4 || wall.edge === 5) && (wall.foundationShape === 5 || wall.foundationShape === 2));
    } else {
      shouldCastShadow = wall.edge === 1 || wall.edge === 5; // East walls and DiagNW_SE (eastward shadows)
    }
    const afternoonProgress = (cycleProgress - 0.55) / 0.17;
    shadowAlpha = 0.50 - afternoonProgress * 0.05; // 0.50 -> 0.45
    shadowDepth = screenSize * (0.7 + afternoonProgress * 0.2); // 0.7 -> 0.9 (getting longer)
    shadowColor = { r: 15, g: 10, b: 5 }; // Warm afternoon tint
    gradientStops = [0, 0.65, 1.0];
  }
  // Dusk (0.72 - 0.76): Sun setting in west, long soft shadows
  else if (cycleProgress >= 0.72 && cycleProgress < 0.76) {
    if (isTriangleFoundation) {
      // TriSW (5) and TriNW (2) cast shadows right after noon
      // TriSE (4) and TriNE (3) don't cast after noon
      shouldCastShadow = wall.edge === 1 || ((wall.edge === 4 || wall.edge === 5) && (wall.foundationShape === 5 || wall.foundationShape === 2));
    } else {
      shouldCastShadow = wall.edge === 1 || wall.edge === 5; // East walls and DiagNW_SE cast long shadows (eastward)
    }
    const duskProgress = (cycleProgress - 0.72) / 0.04;
    shadowAlpha = 0.45 - duskProgress * 0.15; // 0.45 -> 0.30
    shadowDepth = screenSize * (0.9 + duskProgress * 0.3); // 0.9 -> 1.2 (very long)
    shadowColor = { r: 30, g: 15, b: 40 }; // Purple-orange dusk shadows
    gradientStops = [0, 0.75, 1.0]; // Very soft falloff
  }
  // Twilight Evening (0.76 - 0.80): Ambient shadows, very soft
  // Sun is in the west, shadows cast EAST (right), so only EAST walls should cast shadows
  else if (cycleProgress >= 0.76 && cycleProgress < 0.80) {
    if (isTriangleFoundation) {
      // TriSW (5) and TriNW (2) cast shadows right after noon/evening
      // TriSE (4) and TriNE (3) don't cast after noon
      shouldCastShadow = wall.edge === 1 || ((wall.edge === 4 || wall.edge === 5) && (wall.foundationShape === 5 || wall.foundationShape === 2));
    } else {
      shouldCastShadow = wall.edge === 1 || wall.edge === 5; // East walls and DiagNW_SE cast shadows (eastward)
    }
    const twilightProgress = (cycleProgress - 0.76) / 0.04;
    shadowAlpha = 0.30 - twilightProgress * 0.15; // 0.30 -> 0.15
    shadowDepth = screenSize * 0.5; // Medium, diffuse
    shadowColor = { r: 10, g: 5, b: 30 }; // Deep blue twilight
    gradientStops = [0, 0.8, 1.0]; // Very soft, ambient
  }
  // Night (0.80 - 0.92): No directional shadows
  else if (cycleProgress >= 0.80 && cycleProgress < 0.92) {
    shouldCastShadow = false; // No shadows during night
    shadowAlpha = 0;
    shadowDepth = 0;
    shadowColor = { r: 0, g: 0, b: 0 };
    gradientStops = [0, 0.85, 1.0];
  }
  // Midnight (0.92 - 0.97): No shadows, preparing for twilight morning
  else if (cycleProgress >= 0.92 && cycleProgress < 0.97) {
    shouldCastShadow = false; // No shadows during midnight
    shadowAlpha = 0;
    shadowDepth = 0;
    shadowColor = { r: 0, g: 0, b: 0 };
    gradientStops = [0, 0.85, 1.0];
  }
  // Twilight Morning / Pre-Dawn (0.97 - 1.0): Starting to get directional
  // Shadows gradually fade from moderate to match Dawn's start - smooth transition with NO JUMP
  else if (cycleProgress >= 0.97 && cycleProgress <= 1.0) {
    const preDawnProgress = (cycleProgress - 0.97) / 0.03;
    if (isTriangleFoundation) {
      // TriSE (4) and TriNE (3) cast shadows left in morning
      // TriNW (2) and TriSW (5) don't cast in morning
      shouldCastShadow = wall.edge === 3 || ((wall.edge === 4 || wall.edge === 5) && (wall.foundationShape === 4 || wall.foundationShape === 3));
    } else {
      shouldCastShadow = wall.edge === 3 || wall.edge === 4 || wall.edge === 5; // West walls and both diagonals cast shadows (westward)
    }
    // Fade from 0.30 down to 0.25 to EXACTLY match Dawn's start - no jump in darkness!
    // Transition: Midnight (0) -> Twilight Morning starts (0.30) -> fades to (0.25) -> Dawn continues from 0.25 smoothly
    shadowAlpha = 0.30 - preDawnProgress * 0.05; // 0.30 -> 0.25 (getting slightly lighter, matching Dawn's start)
    shadowDepth = screenSize * (1.0 - preDawnProgress * 0.2); // 1.0 -> 0.8 (getting shorter, matching Dawn's start)
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
      // For diagonal walls, create a shadow along the diagonal edge extending OUTWARD
      {
        ctx.save();
        
        // Get the diagonal edge coordinates
        // For triangle foundations, use foundationShape to determine correct coordinates
        let hypStartX: number, hypStartY: number, hypEndX: number, hypEndY: number;
        
        const isTriangle = wall.foundationShape >= 2 && wall.foundationShape <= 5;
        
        if (isTriangle) {
          // Use foundation shape to determine diagonal coordinates (same logic as renderWallTargetIndicator)
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
              // Fallback to non-triangle logic
              if (wall.edge === 4) {
                hypStartX = screenX;
                hypStartY = screenY;
                hypEndX = screenX + screenSize;
                hypEndY = screenY + screenSize;
              } else {
                hypStartX = screenX + screenSize;
                hypStartY = screenY;
                hypEndX = screenX;
                hypEndY = screenY + screenSize;
              }
              break;
          }
        } else {
          // Non-triangle foundations - use edge number directly
          if (wall.edge === 4) {
            // DiagNE_SW: from top-left to bottom-right
            hypStartX = screenX;
            hypStartY = screenY;
            hypEndX = screenX + screenSize;
            hypEndY = screenY + screenSize;
          } else {
            // DiagNW_SE: from top-right to bottom-left
            hypStartX = screenX + screenSize;
            hypStartY = screenY;
            hypEndX = screenX;
            hypEndY = screenY + screenSize;
          }
        }
        
        // Calculate the diagonal vector
        const dx = hypEndX - hypStartX;
        const dy = hypEndY - hypStartY;
        const perpLength = Math.sqrt(dx * dx + dy * dy);
        
        // Perpendicular vector (rotate 90 degrees)
        const perpX = -dy;
        const perpY = dx;
        const perpNormX = perpX / perpLength;
        const perpNormY = perpY / perpLength;
        
        // Calculate shadow direction based on sun position (time of day) and foundation shape
        // For triangle foundations:
        // - TriSE (4): casts shadows LEFT in morning, nothing after noon
        // - TriSW (5): casts shadows RIGHT after noon, nothing in morning
        // - TriNE (3): casts shadows LEFT in morning, nothing after noon
        // - TriNW (2): casts shadows RIGHT after noon, nothing in morning
        // For non-triangle foundations: use time-based direction
        let desiredShadowDirX: number, desiredShadowDirY: number;
        
        if (isTriangle) {
          // Triangle foundations have specific shadow directions based on shape
          if (wall.foundationShape === 4 || wall.foundationShape === 3) {
            // TriSE (4A/4B) and TriNE (3A/3B): cast shadows LEFT in morning only
            // Include Twilight Morning (0.97-1.0) wrap-around in morning shadow direction
            if ((cycleProgress >= 0.0 && cycleProgress < 0.55) || (cycleProgress >= 0.97 && cycleProgress <= 1.0)) {
              desiredShadowDirX = -1; // Left
              desiredShadowDirY = 0;
            } else {
              // After noon: no shadow (but this shouldn't happen due to time-based check)
              desiredShadowDirX = 0;
              desiredShadowDirY = 0;
            }
          } else if (wall.foundationShape === 5 || wall.foundationShape === 2) {
            // TriSW (5A/5B) and TriNW (2A/2B): cast shadows RIGHT after noon only
            // Exclude Twilight Morning (0.97-1.0) from afternoon shadows
            if (cycleProgress >= 0.55 && cycleProgress < 0.97) {
              desiredShadowDirX = 1; // Right
              desiredShadowDirY = 0;
            } else {
              // Before noon or during Twilight Morning: no shadow
              desiredShadowDirX = 0;
              desiredShadowDirY = 0;
            }
          } else {
            // Fallback: use standard time-based direction
            // Include Twilight Morning (0.97-1.0) wrap-around in morning shadow direction
            if ((cycleProgress >= 0.0 && cycleProgress < 0.55) || (cycleProgress >= 0.97 && cycleProgress <= 1.0)) {
              desiredShadowDirX = -1; // Left in morning
              desiredShadowDirY = 0;
            } else {
              desiredShadowDirX = 1; // Right in afternoon
              desiredShadowDirY = 0;
            }
          }
        } else {
          // Non-triangle foundations: use time-based direction
          // Include Twilight Morning (0.97-1.0) wrap-around in morning shadow direction
          if ((cycleProgress >= 0.0 && cycleProgress < 0.55) || (cycleProgress >= 0.97 && cycleProgress <= 1.0)) {
            // Dawn through Morning to Noon, and Twilight Morning: sun in east, shadows cast WEST (left, negative X)
            desiredShadowDirX = -1;
            desiredShadowDirY = 0;
          } else {
            // Afternoon through Dusk: sun in west, shadows cast EAST (right, positive X)
            desiredShadowDirX = 1;
            desiredShadowDirY = 0;
          }
        }
        
        // Normalize desired shadow direction
        const desiredDirLength = Math.sqrt(desiredShadowDirX ** 2 + desiredShadowDirY ** 2);
        const desiredDirX = desiredShadowDirX / desiredDirLength;
        const desiredDirY = desiredShadowDirY / desiredDirLength;
        
        // Check which perpendicular direction (perpNorm or -perpNorm) better matches desired shadow direction
        const dot1 = perpNormX * desiredDirX + perpNormY * desiredDirY;
        const dot2 = -perpNormX * desiredDirX + -perpNormY * desiredDirY;
        
        // Use the perpendicular direction that better matches the desired shadow direction
        const outwardPerpX = dot1 > dot2 ? perpNormX : -perpNormX;
        const outwardPerpY = dot1 > dot2 ? perpNormY : -perpNormY;
        
        // Calculate wall midpoint for gradient
        const wallMidX = (hypStartX + hypEndX) / 2;
        const wallMidY = (hypStartY + hypEndY) / 2;
        
        // Calculate shadow start and end points along the diagonal, extending OUTWARD
        const shadowStartX = hypStartX + outwardPerpX * shadowDepth;
        const shadowStartY = hypStartY + outwardPerpY * shadowDepth;
        const shadowEndX = hypEndX + outwardPerpX * shadowDepth;
        const shadowEndY = hypEndY + outwardPerpY * shadowDepth;
        
        // Create gradient along the outward perpendicular direction
        const gradientStartX = wallMidX;
        const gradientStartY = wallMidY;
        const gradientEndX = wallMidX + outwardPerpX * shadowDepth;
        const gradientEndY = wallMidY + outwardPerpY * shadowDepth;
        
        const { r, g, b } = shadowColor;
        const shadowGradient = ctx.createLinearGradient(
          gradientStartX, gradientStartY,
          gradientEndX, gradientEndY
        );
        
        // Smooth multi-stop gradient (same as other shadows)
        shadowGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${shadowAlpha})`);
        shadowGradient.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, ${shadowAlpha * 0.8})`);
        shadowGradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${shadowAlpha * 0.4})`);
        shadowGradient.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, ${shadowAlpha * 0.1})`);
        shadowGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        
        // Draw shadow as a quadrilateral extending OUTWARD
        ctx.fillStyle = shadowGradient;
        ctx.beginPath();
        ctx.moveTo(hypStartX, hypStartY); // Start at wall start
        ctx.lineTo(hypEndX, hypEndY); // Along wall end
        ctx.lineTo(shadowEndX, shadowEndY); // Shadow end point (outward)
        ctx.lineTo(shadowStartX, shadowStartY); // Shadow start point (outward)
        ctx.closePath();
        ctx.fill();
        
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
  const PREVIEW_NORTH_WALL_HEIGHT = screenSize * 1.0; // 1.0 tiles tall (full height)
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
      // Match the actual wall rendering exactly
      if (edge === 0) {
        // North wall - use BOTTOM half of texture (matches actual rendering)
        // Draw at full height (NORTH_WALL_HEIGHT) to match actual wall
        const sourceY = wallImage.height * 0.5; // Start from middle (bottom half)
        const sourceHeight = wallImage.height * 0.5; // Bottom half of texture
        ctx.drawImage(
          wallImage,
          0, sourceY, wallImage.width, sourceHeight, // Source: BOTTOM half of texture
          wallX, wallY, wallWidth, wallHeight // Destination: wall dimensions (PREVIEW_NORTH_WALL_HEIGHT = 1.0 * screenSize)
        );
      } else if (edge === 2) {
        // South wall - use full texture for full height (matches actual rendering)
        ctx.drawImage(
          wallImage,
          0, 0, wallImage.width, wallImage.height, // Source: full texture
          wallX, wallY, wallWidth, wallHeight // Destination: full wall (PREVIEW_SOUTH_WALL_HEIGHT = screenSize)
        );
      } else {
        // East/West walls - draw vertical strip from tile (matches actual rendering)
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

