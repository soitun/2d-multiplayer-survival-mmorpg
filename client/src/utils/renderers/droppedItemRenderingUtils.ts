import { DroppedItem as SpacetimeDBDroppedItem, ItemDefinition as SpacetimeDBItemDefinition } from '../../generated';
import burlapSackImage from '../../assets/doodads/burlap_sack.png'; // Import the sack image as fallback
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager'; 
import { getItemIcon } from '../itemIconUtils'; // Import item icon utility

// --- Constants --- 
const DRAW_WIDTH = 48;
const DRAW_HEIGHT = 48;

// --- Config --- 
const droppedItemConfig: GroundEntityConfig<SpacetimeDBDroppedItem & { itemDef?: SpacetimeDBItemDefinition }> = {
    // Always try to show the actual item sprite, fall back to burlap sack if not found
    getImageSource: (entity) => {
        // If we have item definition, try to get the actual item icon
        if (entity.itemDef && entity.itemDef.iconAssetName) {
            const itemIconUrl = getItemIcon(entity.itemDef.iconAssetName);
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
            const itemIconUrl = getItemIcon(entity.itemDef.iconAssetName);
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
        
        // Create a temporary canvas for the outline effect
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
            tempCanvas.width = 60; // Slightly larger than item
            tempCanvas.height = 60;
            
            // Draw a rounded rectangle outline
            tempCtx.strokeStyle = `rgba(255, 255, 255, ${pulseIntensity * 0.8})`;
            tempCtx.lineWidth = 2;
            tempCtx.lineCap = 'round';
            tempCtx.lineJoin = 'round';
            
            const outlineSize = 50;
            const radius = 8;
            const x = 5;
            const y = 5;
            
            // Draw rounded rectangle outline
            tempCtx.beginPath();
            tempCtx.moveTo(x + radius, y);
            tempCtx.lineTo(x + outlineSize - radius, y);
            tempCtx.quadraticCurveTo(x + outlineSize, y, x + outlineSize, y + radius);
            tempCtx.lineTo(x + outlineSize, y + outlineSize - radius);
            tempCtx.quadraticCurveTo(x + outlineSize, y + outlineSize, x + outlineSize - radius, y + outlineSize);
            tempCtx.lineTo(x + radius, y + outlineSize);
            tempCtx.quadraticCurveTo(x, y + outlineSize, x, y + outlineSize - radius);
            tempCtx.lineTo(x, y + radius);
            tempCtx.quadraticCurveTo(x, y, x + radius, y);
            tempCtx.closePath();
            tempCtx.stroke();
            
            // Draw the outline on the main canvas with glow
            ctx.drawImage(tempCanvas, baseDrawX - 6, baseDrawY - 6);
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

// Preload the burlap sack fallback image
imageManager.preloadImage(burlapSackImage);

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
}

// --- Rendering Function (Refactored) ---
export function renderDroppedItem({
    ctx,
    item,
    itemDef,
    nowMs,
    cycleProgress, // Added
}: RenderDroppedItemParamsNew): void {
    // Calculate current position (handles arc animation if present)
    const { x: renderX, y: renderY, isAnimating, scale } = calculateArcPosition(item, nowMs);
    
    // Create entity with animated position - this is crucial because
    // calculateDrawPosition in the config reads entity.posX/posY directly
    const entityWithDef = { 
        ...item, 
        itemDef,
        // Override position with animated position for arc animation
        posX: renderX,
        posY: renderY,
    };

    // If animating, apply scale transform
    if (isAnimating && scale !== 1.0) {
        ctx.save();
        // Scale from the item's current position
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
    
    // Restore context if we applied scale
    if (isAnimating && scale !== 1.0) {
        ctx.restore();
    }
} 