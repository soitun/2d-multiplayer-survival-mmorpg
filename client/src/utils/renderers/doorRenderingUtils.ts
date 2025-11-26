import { Door as SpacetimeDBDoor } from '../../generated';
import { FOUNDATION_TILE_SIZE } from '../../config/gameConfig';

// Door rendering dimensions
export const DOOR_RENDER_WIDTH = FOUNDATION_TILE_SIZE; // 96px to span foundation edge
export const DOOR_RENDER_HEIGHT = FOUNDATION_TILE_SIZE; // 96px

// Door types (match server constants)
export const DOOR_TYPE_WOOD = 0;
export const DOOR_TYPE_METAL = 1;

// Door edges (match server BuildingEdge enum)
export const DOOR_EDGE_NORTH = 0;
export const DOOR_EDGE_SOUTH = 2;

// Door interaction distance (matches server-side for flawless interaction)
export const PLAYER_DOOR_INTERACTION_DISTANCE = 180.0; // Matches server-side 180px for generous interaction range
export const PLAYER_DOOR_INTERACTION_DISTANCE_SQUARED = PLAYER_DOOR_INTERACTION_DISTANCE * PLAYER_DOOR_INTERACTION_DISTANCE;

// Door rendering offset (doors are rendered 44px higher than their actual position)
export const DOOR_RENDER_Y_OFFSET = 44;

// Interaction highlight colors
const HIGHLIGHT_COLOR = 'rgba(100, 180, 255, 0.4)'; // Blue tint for interactable
const HIGHLIGHT_BORDER_COLOR = 'rgba(100, 180, 255, 0.8)';

interface RenderDoorProps {
  ctx: CanvasRenderingContext2D;
  door: SpacetimeDBDoor;
  woodDoorImage: HTMLImageElement | null;
  metalDoorImage: HTMLImageElement | null;
  isHighlighted?: boolean;
  nowMs?: number;
  localPlayerPosition?: { x: number; y: number } | null; // Player position for transparency logic
}

/**
 * Get the sprite image for a door based on its type
 */
export function getDoorImage(
  door: SpacetimeDBDoor,
  woodDoorImage: HTMLImageElement | null,
  metalDoorImage: HTMLImageElement | null
): HTMLImageElement | null {
  switch (door.doorType) {
    case DOOR_TYPE_WOOD:
      return woodDoorImage;
    case DOOR_TYPE_METAL:
      return metalDoorImage;
    default:
      return woodDoorImage;
  }
}

/**
 * Render a door entity
 */
export const renderDoor = ({
  ctx,
  door,
  woodDoorImage,
  metalDoorImage,
  isHighlighted = false,
  nowMs = Date.now(),
  localPlayerPosition,
}: RenderDoorProps) => {
  if (door.isDestroyed) {
    return;
  }

  const doorImage = getDoorImage(door, woodDoorImage, metalDoorImage);
  if (!doorImage) {
    return;
  }

  // Calculate draw position - door is centered on the edge
  const drawWidth = DOOR_RENDER_WIDTH; // Full foundation width (96px) to match walls
  const drawHeight = DOOR_RENDER_HEIGHT; // Full foundation height (96px)
  
  // Door position is at the edge center, but offset 64px up to align with foundation
  let drawX = door.posX - drawWidth / 2;
  let drawY = door.posY - drawHeight / 2 - 44; // Offset 44px up to align with foundation

  // Calculate transparency for SOUTH doors when player is behind them (similar to trees/south walls)
  const MIN_ALPHA = 0.3;
  const MAX_ALPHA = 1.0;
  let doorAlpha = MAX_ALPHA;

  // Only apply transparency to south doors (edge 2) when player is behind them
  if (localPlayerPosition && door.edge === DOOR_EDGE_SOUTH && !door.isOpen) {
    // Door bounding box for overlap detection
    const doorLeft = drawX;
    const doorRight = drawX + drawWidth;
    const doorTop = drawY;
    const doorBottom = drawY + drawHeight;
    
    // Player bounding box
    const playerSize = 48;
    const playerLeft = localPlayerPosition.x - playerSize / 2;
    const playerRight = localPlayerPosition.x + playerSize / 2;
    const playerTop = localPlayerPosition.y - playerSize;
    const playerBottom = localPlayerPosition.y;
    
    // Check if player overlaps with door visually
    const overlapsHorizontally = playerRight > doorLeft && playerLeft < doorRight;
    const overlapsVertically = playerBottom > doorTop && playerTop < doorBottom;
    
    // South door: player is behind if player.y > door.posY (player is south of door)
    const isPlayerBehind = localPlayerPosition.y > door.posY;
    
    if (overlapsHorizontally && overlapsVertically && isPlayerBehind) {
      // Calculate depth difference for smooth fade
      const depthDifference = Math.abs(door.posY - localPlayerPosition.y);
      const maxDepthForFade = 100;
      
      if (depthDifference > 0 && depthDifference < maxDepthForFade) {
        const fadeFactor = 1 - (depthDifference / maxDepthForFade);
        doorAlpha = MAX_ALPHA - (fadeFactor * (MAX_ALPHA - MIN_ALPHA));
        doorAlpha = Math.max(MIN_ALPHA, Math.min(MAX_ALPHA, doorAlpha));
      } else if (depthDifference >= maxDepthForFade) {
        doorAlpha = MIN_ALPHA;
      }
    }
  }

  // Apply transparency if needed
  const needsTransparency = doorAlpha < MAX_ALPHA;
  if (needsTransparency) {
    ctx.save();
    ctx.globalAlpha = doorAlpha;
  } else {
    ctx.save();
  }

  // Draw highlight box if interactable (always draw, even when door is open/invisible)
  if (isHighlighted) {
    ctx.fillStyle = HIGHLIGHT_COLOR;
    ctx.strokeStyle = HIGHLIGHT_BORDER_COLOR;
    ctx.lineWidth = 2;
    
    // Draw highlight rectangle around door
    const highlightPadding = 4;
    ctx.fillRect(
      drawX - highlightPadding,
      drawY - highlightPadding,
      drawWidth + highlightPadding * 2,
      drawHeight + highlightPadding * 2
    );
    ctx.strokeRect(
      drawX - highlightPadding,
      drawY - highlightPadding,
      drawWidth + highlightPadding * 2,
      drawHeight + highlightPadding * 2
    );
  }

  // If door is open, don't render the sprite (invisible), but still show highlight
  if (door.isOpen) {
    ctx.restore();
    return;
  }

  // Closed door - draw normally
  ctx.drawImage(
    doorImage,
    drawX,
    drawY,
    drawWidth,
    drawHeight
  );

  ctx.restore();

  // Draw health bar if door has taken damage
  const healthPercent = door.health / door.maxHealth;
  if (healthPercent < 1.0) {
    renderDoorHealthBar(ctx, door.posX, drawY - 10, healthPercent);
  }
};

/**
 * Render door health bar
 */
function renderDoorHealthBar(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  healthPercent: number
) {
  const barWidth = 60;
  const barHeight = 6;
  const barX = centerX - barWidth / 2;
  const barY = topY;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  // Health fill
  const healthColor = healthPercent > 0.5 
    ? `rgb(${Math.floor((1 - healthPercent) * 2 * 255)}, 255, 0)` 
    : `rgb(255, ${Math.floor(healthPercent * 2 * 255)}, 0)`;
  ctx.fillStyle = healthColor;
  ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);

  // Border
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barWidth, barHeight);
}

/**
 * Render E interaction label for door
 */
export function renderDoorInteractionLabel(
  ctx: CanvasRenderingContext2D,
  door: SpacetimeDBDoor,
  isOwner: boolean
) {
  const labelY = door.posY - DOOR_RENDER_HEIGHT / 2 - 25;
  const labelText = isOwner 
    ? (door.isOpen ? '[E] Close' : '[E] Open / Hold [E] Pickup')
    : (door.isOpen ? '' : 'Locked');

  if (!labelText) return;

  ctx.save();
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Draw text shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillText(labelText, door.posX + 1, labelY + 1);

  // Draw text
  ctx.fillStyle = isOwner ? '#FFFFFF' : '#FF6666';
  ctx.fillText(labelText, door.posX, labelY);

  ctx.restore();
}

/**
 * Get the Y-sort position for a door (used for depth sorting)
 * Doors should be rendered at the same depth as walls on the same edge
 */
export function getDoorYSortPosition(door: SpacetimeDBDoor): number {
  // Use the door's Y position for sorting
  // Adjust slightly based on edge to ensure proper layering
  if (door.edge === DOOR_EDGE_NORTH) {
    return door.posY;
  } else {
    return door.posY;
  }
}

