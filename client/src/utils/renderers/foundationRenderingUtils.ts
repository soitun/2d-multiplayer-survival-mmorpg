/**
 * Foundation Rendering Utilities
 * 
 * Renders building foundations using PNG tile images.
 */

import { FoundationCell } from '../../generated';
import { TILE_SIZE } from '../../config/gameConfig';
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
 * Convert cell coordinates to world pixel coordinates (top-left corner of tile)
 */
function cellToWorldPixels(cellX: number, cellY: number): { x: number; y: number } {
  return {
    x: cellX * TILE_SIZE,
    y: cellY * TILE_SIZE,
  };
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
  const screenSize = TILE_SIZE * worldScale;

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
  const screenSize = TILE_SIZE * worldScale;

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
  const screenSize = TILE_SIZE * worldScale;

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

