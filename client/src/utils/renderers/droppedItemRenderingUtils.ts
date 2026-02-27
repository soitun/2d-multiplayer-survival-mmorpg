import { DroppedItem as SpacetimeDBDroppedItem, ItemDefinition as SpacetimeDBItemDefinition } from '../../generated/types';
import burlapSackImage from '../../assets/doodads/burlap_sack.png'; // Import the sack image as fallback
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';
import { getItemIcon } from '../itemIconUtils'; // Import item icon utility
import { SEA_BARREL_WATER_CONFIG } from './barrelRenderingUtils';

// --- Constants --- 
const DRAW_WIDTH = 48;
const DRAW_HEIGHT = 48;

// --- Reusable offscreen canvas for glow outline effect (avoids per-frame allocation) ---
const _glowCanvas = document.createElement('canvas');
_glowCanvas.width = 60;
_glowCanvas.height = 60;
const _glowCtx = _glowCanvas.getContext('2d');

// --- Config --- 
const droppedItemConfig: GroundEntityConfig<SpacetimeDBDroppedItem & { itemDef?: SpacetimeDBItemDefinition }> = {
    // Always try to show the actual item sprite, fall back to burlap sack if not found
    getImageSource: (entity) => {
        // If we have item definition, try to get the actual item icon
        // Use 'dropped' context: torch/campfire show off versions on ground
        if (entity.itemDef && entity.itemDef.iconAssetName) {
            const itemIconUrl = getItemIcon(entity.itemDef.iconAssetName, 'dropped');
            if (itemIconUrl) {
                return itemIconUrl;
            }
        }
        
        // Fallback: use burlap sack if item icon isn't available
        return burlapSackImage;
    },

    getTargetDimensions: (_img, entity) => {
        // If we have the actual item sprite, use appropriate size
        if (entity.itemDef && entity.itemDef.iconAssetName) {
            const itemIconUrl = getItemIcon(entity.itemDef.iconAssetName, 'dropped');
            if (itemIconUrl) {
                // Vole skull is tiny - half the size of other items
                if (entity.itemDef.name === "Vole Skull") {
                    return {
                        width: 24,  // Half size for tiny vole skull
                        height: 24,
                    };
                }
                // Actual item sprites are typically smaller and more detailed
                return {
                    width: 48,  // Good size for actual item sprites
                    height: 48,
                };
            }
        }
        
        // Default size for burlap sack fallback
        return {
            width: DRAW_WIDTH,
            height: DRAW_HEIGHT,
        };
    },

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        // Center the image
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight / 2, 
    }),

    getShadowParams: undefined, // No shadow params needed for glow effect

    applyEffects: (ctx, entity, nowMs, baseDrawX, baseDrawY, cycleProgress) => {
        // Save the current context state
        ctx.save();
        
        // Create a soft glow effect with pulsing animation
        const time = nowMs * 0.003; // Slow pulse animation
        const pulseIntensity = 0.3 + 0.2 * Math.sin(time); // Pulse between 0.3 and 0.5
        
        // Set up the glow effect
        ctx.shadowColor = `rgba(255, 255, 255, ${pulseIntensity})`;
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw multiple glow layers for a more intense effect
        // Outer glow (larger, more transparent)
        ctx.save();
        ctx.shadowColor = `rgba(100, 200, 255, ${pulseIntensity * 0.4})`;
        ctx.shadowBlur = 25;
        
        // Reuse module-level canvas for the outline effect (avoids per-frame allocation)
        if (_glowCtx) {
            _glowCtx.clearRect(0, 0, 60, 60);
            
            // Draw a rounded rectangle outline
            _glowCtx.strokeStyle = `rgba(255, 255, 255, ${pulseIntensity * 0.8})`;
            _glowCtx.lineWidth = 2;
            _glowCtx.lineCap = 'round';
            _glowCtx.lineJoin = 'round';
            
            const outlineSize = 50;
            const radius = 8;
            const x = 5;
            const y = 5;
            
            // Draw rounded rectangle outline
            _glowCtx.beginPath();
            _glowCtx.moveTo(x + radius, y);
            _glowCtx.lineTo(x + outlineSize - radius, y);
            _glowCtx.quadraticCurveTo(x + outlineSize, y, x + outlineSize, y + radius);
            _glowCtx.lineTo(x + outlineSize, y + outlineSize - radius);
            _glowCtx.quadraticCurveTo(x + outlineSize, y + outlineSize, x + outlineSize - radius, y + outlineSize);
            _glowCtx.lineTo(x + radius, y + outlineSize);
            _glowCtx.quadraticCurveTo(x, y + outlineSize, x, y + outlineSize - radius);
            _glowCtx.lineTo(x, y + radius);
            _glowCtx.quadraticCurveTo(x, y, x + radius, y);
            _glowCtx.closePath();
            _glowCtx.stroke();
            
            // Draw the outline on the main canvas with glow
            ctx.drawImage(_glowCanvas, baseDrawX - 6, baseDrawY - 6);
        }
        
        ctx.restore();
        
        // Inner glow (smaller, more intense)
        ctx.shadowColor = `rgba(255, 255, 255, ${pulseIntensity * 0.6})`;
        ctx.shadowBlur = 8;
        
        // Reset to the saved state
        ctx.restore();
        
        // Return no additional offsets since we want the glow centered
        return { offsetX: 0, offsetY: 0 };
    },

    fallbackColor: '#A0522D', // Brown fallback color if image fails to load
};

// Preload fallback images (campfire_off used when Torch/Camp Fire dropped on ground)
imageManager.preloadImage(burlapSackImage);
imageManager.preloadImage(getItemIcon('campfire_off.png'));

// --- Arc Animation Constants ---
const ARC_ANIMATION_DURATION_MS = 1200; // Duration of falling arc animation (longer for visibility)
const ARC_HEIGHT_FACTOR = 0.5; // How high the arc peaks (as fraction of horizontal distance)

// Track when items with arc animation were first seen client-side
// This avoids clock sync issues between client and server
const itemFirstSeenTimeMap = new Map<string, number>();

// Clean up old entries periodically to prevent memory leaks
let lastCleanupTime = 0;
const CLEANUP_INTERVAL_MS = 30000; // Clean every 30 seconds
const MAX_TRACKING_AGE_MS = 10000; // Remove entries older than 10 seconds

function cleanupOldTrackingEntries(nowMs: number): void {
    if (nowMs - lastCleanupTime < CLEANUP_INTERVAL_MS) return;
    lastCleanupTime = nowMs;
    
    const cutoffTime = nowMs - MAX_TRACKING_AGE_MS;
    for (const [key, firstSeen] of itemFirstSeenTimeMap.entries()) {
        if (firstSeen < cutoffTime) {
            itemFirstSeenTimeMap.delete(key);
        }
    }
}

/**
 * Calculate the current position for an item with arc animation.
 * Uses a parabolic trajectory from spawn point to landing point.
 * Uses client-side first-seen time to avoid clock sync issues.
 */
function calculateArcPosition(
    item: SpacetimeDBDroppedItem,
    nowMs: number
): { x: number; y: number; isAnimating: boolean; scale: number } {
    // Periodic cleanup
    cleanupOldTrackingEntries(nowMs);
    
    // Check if this item has arc animation data
    if (item.spawnX === null || item.spawnX === undefined || 
        item.spawnY === null || item.spawnY === undefined) {
        // No arc animation - use final position
        return { x: item.posX, y: item.posY, isAnimating: false, scale: 1.0 };
    }
    
    // Store spawn coordinates in local variables (TypeScript now knows these are defined)
    const spawnX = item.spawnX;
    const spawnY = item.spawnY;

    // Get or set the first-seen time for this item (client-side tracking)
    const itemKey = item.id.toString();
    let firstSeenMs = itemFirstSeenTimeMap.get(itemKey);
    if (firstSeenMs === undefined) {
        // First time seeing this item - start animation now
        firstSeenMs = nowMs;
        itemFirstSeenTimeMap.set(itemKey, firstSeenMs);
    }

    // Calculate elapsed time since we first saw this item
    const elapsedMs = nowMs - firstSeenMs;

    // If animation is complete, return final position
    if (elapsedMs >= ARC_ANIMATION_DURATION_MS) {
        return { x: item.posX, y: item.posY, isAnimating: false, scale: 1.0 };
    }

    // Calculate animation progress (0 to 1)
    const progress = elapsedMs / ARC_ANIMATION_DURATION_MS;
    
    // Use easeOutQuad for smoother landing: progress * (2 - progress)
    const easedProgress = progress * (2 - progress);
    
    // Linear interpolation for X position
    const currentX = spawnX + (item.posX - spawnX) * easedProgress;
    
    // Calculate Y position with parabolic arc
    // The arc peaks at progress = 0.5
    // parabola: -4 * (progress - 0.5)^2 + 1, which goes from 0 to 1 (at 0.5) back to 0
    const arcProgress = -4 * Math.pow(progress - 0.5, 2) + 1; // 0 at start/end, 1 at middle
    
    // Calculate how high the arc should go based on distance
    const horizontalDist = Math.abs(item.posX - spawnX);
    const verticalDist = Math.abs(item.posY - spawnY);
    const arcHeight = Math.max(horizontalDist, verticalDist) * ARC_HEIGHT_FACTOR;
    
    // Y position: linear from spawn to final, with arc offset (negative = up)
    const linearY = spawnY + (item.posY - spawnY) * easedProgress;
    const currentY = linearY - arcHeight * arcProgress;
    
    // Scale effect: start slightly smaller, grow to full size
    const scale = 0.7 + 0.3 * easedProgress;

    return { x: currentX, y: currentY, isAnimating: true, scale };
}

// --- Interface for new renderer function ---
interface RenderDroppedItemParamsNew {
    ctx: CanvasRenderingContext2D;
    item: SpacetimeDBDroppedItem;
    itemDef: SpacetimeDBItemDefinition | undefined;
    nowMs: number; // Keep nowMs for consistency, even if unused
    cycleProgress: number; // Added for shadow
    isOnSeaTile?: (worldX: number, worldY: number) => boolean;
}

// --- Reusable offscreen canvas for dropped item water tinting ---
let _droppedItemOffscreenCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let _droppedItemOffscreenCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getDroppedItemOffscreenCanvas(w: number, h: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
    if (!_droppedItemOffscreenCanvas || _droppedItemOffscreenCanvas.width < w || _droppedItemOffscreenCanvas.height < h) {
        if (_droppedItemOffscreenCanvas) {
            _droppedItemOffscreenCanvas.width = 0;
            _droppedItemOffscreenCanvas.height = 0;
        }
        try {
            _droppedItemOffscreenCanvas = new OffscreenCanvas(w, h);
        } catch {
            _droppedItemOffscreenCanvas = document.createElement('canvas');
            _droppedItemOffscreenCanvas.width = w;
            _droppedItemOffscreenCanvas.height = h;
        }
        _droppedItemOffscreenCtx = _droppedItemOffscreenCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    }
    return { canvas: _droppedItemOffscreenCanvas, ctx: _droppedItemOffscreenCtx! };
}

function getDroppedItemImageAndSize(
    item: SpacetimeDBDroppedItem,
    itemDef: SpacetimeDBItemDefinition | undefined
): { img: HTMLImageElement | null; drawWidth: number; drawHeight: number; imageSource: string } {
    const imageSource = itemDef?.iconAssetName
        ? getItemIcon(itemDef.iconAssetName, 'dropped') ?? burlapSackImage
        : burlapSackImage;
    const img = imageManager.getImage(imageSource);
    const isVoleSkull = itemDef?.name === 'Vole Skull';
    const drawWidth = isVoleSkull ? 24 : DRAW_WIDTH;
    const drawHeight = isVoleSkull ? 24 : DRAW_HEIGHT;
    return { img: img ?? null, drawWidth, drawHeight, imageSource };
}

/**
 * Renders a dropped item with water effects (water line, bobbing, sway, underwater tint).
 * No water shadow - items floating on water don't cast the same shadow as barrels.
 */
function renderDroppedItemWithWaterEffects(
    ctx: CanvasRenderingContext2D,
    item: SpacetimeDBDroppedItem,
    itemDef: SpacetimeDBItemDefinition | undefined,
    nowMs: number,
    renderX: number,
    renderY: number,
    scale: number
): void {
    const { img, drawWidth, drawHeight } = getDroppedItemImageAndSize(item, itemDef);
    if (!img || !img.complete || img.naturalWidth === 0) {
        ctx.fillStyle = '#A0522D';
        ctx.fillRect(renderX - drawWidth / 2, renderY - drawHeight / 2, drawWidth, drawHeight);
        return;
    }

    const cfg = SEA_BARREL_WATER_CONFIG;
    const swayPrimary = Math.sin(nowMs * cfg.SWAY_FREQUENCY + item.posX * 0.01) * cfg.SWAY_AMPLITUDE;
    const swaySecondary = Math.sin(nowMs * cfg.SWAY_SECONDARY_FREQUENCY + item.posY * 0.01 + Math.PI * 0.5) * cfg.SWAY_AMPLITUDE * 0.5;
    const totalSway = swayPrimary + swaySecondary;
    const bobOffset = Math.sin(nowMs * cfg.BOB_FREQUENCY + item.posX * 0.02) * cfg.BOB_AMPLITUDE;

    const baseX = renderX;
    const baseY = renderY + bobOffset;
    const drawX = baseX - drawWidth / 2;
    const drawY = baseY - drawHeight / 2;

    const waterLineOffset = cfg.WATER_LINE_OFFSET;
    const waterLineLocalY = drawHeight * waterLineOffset;
    const waterLineWorldY = drawY + waterLineLocalY;

    const getWaveOffset = (x: number) =>
        Math.sin(nowMs * cfg.WAVE_FREQUENCY + x * 0.02) * cfg.WAVE_AMPLITUDE +
        Math.sin(nowMs * cfg.WAVE_SECONDARY_FREQUENCY + x * 0.03 + Math.PI * 0.3) * cfg.WAVE_SECONDARY_AMPLITUDE;

    const { canvas: offscreen, ctx: offCtx } = getDroppedItemOffscreenCanvas(drawWidth + 4, drawHeight + 4);
    offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
    offCtx.drawImage(img, 2, 2, drawWidth, drawHeight);
    offCtx.globalCompositeOperation = 'source-atop';
    const { r, g, b } = cfg.UNDERWATER_TINT_COLOR;
    offCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${cfg.UNDERWATER_TINT_INTENSITY})`;
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    offCtx.fillStyle = 'rgba(0, 20, 40, 0.2)';
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    offCtx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.rotate(totalSway);
    ctx.translate(-baseX, -baseY);

    const waveSegments = 12;
    const segmentWidth = drawWidth / waveSegments;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(drawX - 5, baseY + 30);
    ctx.lineTo(drawX - 5, waterLineWorldY);
    for (let i = 0; i <= waveSegments; i++) {
        ctx.lineTo(drawX + i * segmentWidth, waterLineWorldY + getWaveOffset(drawX + i * segmentWidth));
    }
    ctx.lineTo(drawX + drawWidth + 5, baseY + 30);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(offscreen, drawX - 2, drawY - 2);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(drawX - 5, drawY - 5);
    ctx.lineTo(drawX + drawWidth + 5, drawY - 5);
    ctx.lineTo(drawX + drawWidth + 5, waterLineWorldY);
    for (let i = waveSegments; i >= 0; i--) {
        ctx.lineTo(drawX + i * segmentWidth, waterLineWorldY + getWaveOffset(drawX + i * segmentWidth));
    }
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();

    ctx.strokeStyle = 'rgba(150, 180, 200, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const lineStartX = drawX + drawWidth * 0.2;
    const lineEndX = drawX + drawWidth * 0.8;
    const lineSegments = 6;
    const lineSegmentWidth = (lineEndX - lineStartX) / lineSegments;
    for (let i = 0; i <= lineSegments; i++) {
        const segX = lineStartX + i * lineSegmentWidth;
        const waveOffset = getWaveOffset(segX);
        if (i === 0) ctx.moveTo(segX, waterLineWorldY + waveOffset);
        else ctx.lineTo(segX, waterLineWorldY + waveOffset);
    }
    ctx.stroke();
    ctx.restore();
}

// --- Rendering Function (Refactored) ---
export function renderDroppedItem({
    ctx,
    item,
    itemDef,
    nowMs,
    cycleProgress,
    isOnSeaTile,
}: RenderDroppedItemParamsNew): void {
    const { x: renderX, y: renderY, isAnimating, scale } = calculateArcPosition(item, nowMs);

    const onWater = isOnSeaTile?.(item.posX, item.posY) ?? false;

    if (onWater) {
        if (isAnimating && scale !== 1.0) {
            ctx.save();
            ctx.translate(renderX, renderY);
            ctx.scale(scale, scale);
            ctx.translate(-renderX, -renderY);
        }
        renderDroppedItemWithWaterEffects(ctx, item, itemDef, nowMs, renderX, renderY, scale);
        if (isAnimating && scale !== 1.0) ctx.restore();
        return;
    }

    const entityWithDef = {
        ...item,
        itemDef,
        posX: renderX,
        posY: renderY,
    };

    if (isAnimating && scale !== 1.0) {
        ctx.save();
        ctx.translate(renderX, renderY);
        ctx.scale(scale, scale);
        ctx.translate(-renderX, -renderY);
    }

    renderConfiguredGroundEntity({
        ctx,
        entity: entityWithDef,
        config: droppedItemConfig,
        nowMs,
        entityPosX: renderX,
        entityPosY: renderY,
        cycleProgress,
    });

    if (isAnimating && scale !== 1.0) {
        ctx.restore();
    }
} 