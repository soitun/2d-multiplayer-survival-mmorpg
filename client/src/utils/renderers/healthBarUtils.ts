/**
 * Shared Health Bar Rendering Utility
 *
 * Provides consistent health bar rendering across all game entities.
 * Health bars are:
 * - Uniformly sized (not scaled with entity size)
 * - Positioned as VERTICAL bars on the OPPOSITE side from the player
 * - Fade out after a duration since last hit
 *
 * OPTIMISTIC UPDATES: When entityType + entityId are passed, we merge with
 * optimistic overlay (from registerOptimisticHit) for instant feedback on attack.
 * Server state overwrites when it arrives.
 */
import type { OptimisticEntityType } from '../optimisticHealthOverlays';
import { mergeWithOptimisticOverlay } from '../optimisticHealthOverlays';

// === CONSTANTS ===
// Uniform sizing for ALL health bars
export const HEALTH_BAR_WIDTH = 6;  // Thin vertical bar
export const HEALTH_BAR_HEIGHT = 40; // Standard height for all entities
export const HEALTH_BAR_OFFSET = 8;  // Distance from entity edge
export const HEALTH_BAR_VISIBLE_DURATION_MS = 3000; // 3 seconds visibility after hit

// Colors
const HEALTH_BAR_BG_COLOR = 'rgba(0, 0, 0, 0.6)';
const HEALTH_BAR_BORDER_COLOR = 'rgba(0, 0, 0, 0.8)';

export interface HealthBarParams {
    ctx: CanvasRenderingContext2D;
    // Entity position (center)
    entityX: number;
    entityY: number;
    // Entity visual bounds (for positioning the bar)
    entityWidth: number;
    entityHeight: number;
    // Health values
    health: number;
    maxHealth: number;
    // Timing
    lastHitTimeMs: number | null;
    nowMs: number;
    // Player position (for determining which side to show bar)
    playerX: number;
    playerY: number;
    // Optional: custom bar dimensions
    barWidth?: number;
    barHeight?: number;
    // Optional: Y offset adjustment for entity draw position
    entityDrawYOffset?: number;
}

/**
 * Determines which side of the entity the health bar should appear on.
 * Returns 'left' | 'right' | 'top' | 'bottom' based on player position relative to entity.
 */
function getHealthBarSide(
    entityX: number,
    entityY: number,
    playerX: number,
    playerY: number
): 'left' | 'right' | 'top' | 'bottom' {
    const dx = playerX - entityX;
    const dy = playerY - entityY;
    
    // Determine primary direction (horizontal or vertical)
    if (Math.abs(dx) > Math.abs(dy)) {
        // Player is primarily to the left or right
        // Show bar on OPPOSITE side (opposite from player)
        return dx > 0 ? 'left' : 'right';
    } else {
        // Player is primarily above or below
        return dy > 0 ? 'top' : 'bottom';
    }
}

/**
 * Renders a vertical health bar on the opposite side from the player.
 * Used by all destructible entities for consistent health visualization.
 * 
 * @returns true if bar was rendered, false if not (hidden or destroyed)
 */
export function renderHealthBar(params: HealthBarParams): boolean {
    const {
        ctx,
        entityX,
        entityY,
        entityWidth,
        entityHeight,
        health,
        maxHealth,
        lastHitTimeMs,
        nowMs,
        playerX,
        playerY,
        barWidth = HEALTH_BAR_WIDTH,
        barHeight = HEALTH_BAR_HEIGHT,
        entityDrawYOffset = 0,
    } = params;
    
    // Don't render if at full health or no last hit time
    if (health >= maxHealth || lastHitTimeMs === null) {
        return false;
    }
    
    // Check visibility duration
    const elapsedSinceHit = nowMs - lastHitTimeMs;
    if (elapsedSinceHit < 0 || elapsedSinceHit >= HEALTH_BAR_VISIBLE_DURATION_MS) {
        return false;
    }
    
    // Calculate fade opacity
    const timeSinceLastHitRatio = elapsedSinceHit / HEALTH_BAR_VISIBLE_DURATION_MS;
    const opacity = Math.max(0, 1 - Math.pow(timeSinceLastHitRatio, 2));
    
    if (opacity <= 0) {
        return false;
    }
    
    // Calculate health percentage
    const healthPercentage = Math.max(0, Math.min(1, health / maxHealth));
    
    // Determine which side to show the bar
    const side = getHealthBarSide(entityX, entityY, playerX, playerY);
    
    // Calculate entity draw bounds
    const entityDrawX = entityX - entityWidth / 2;
    const entityDrawY = entityY - entityHeight + entityDrawYOffset;
    
    // Calculate bar position based on side
    let barX: number;
    let barY: number;
    let isVertical: boolean;
    
    switch (side) {
        case 'left':
            // Vertical bar on the left side
            barX = entityDrawX - barWidth - HEALTH_BAR_OFFSET;
            barY = entityDrawY + (entityHeight - barHeight) / 2;
            isVertical = true;
            break;
        case 'right':
            // Vertical bar on the right side
            barX = entityDrawX + entityWidth + HEALTH_BAR_OFFSET;
            barY = entityDrawY + (entityHeight - barHeight) / 2;
            isVertical = true;
            break;
        case 'top':
            // Horizontal bar on top
            barX = entityX - barHeight / 2; // Swap width/height for horizontal
            barY = entityDrawY - barWidth - HEALTH_BAR_OFFSET;
            isVertical = false;
            break;
        case 'bottom':
        default:
            // Horizontal bar on bottom
            barX = entityX - barHeight / 2; // Swap width/height for horizontal
            barY = entityDrawY + entityHeight + HEALTH_BAR_OFFSET;
            isVertical = false;
            break;
    }
    
    ctx.save();
    ctx.globalAlpha = opacity;
    
    if (isVertical) {
        // Vertical bar rendering
        // Background (full height)
        ctx.fillStyle = HEALTH_BAR_BG_COLOR;
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Health portion (fills from bottom up)
        const healthBarInnerHeight = barHeight * healthPercentage;
        const healthBarInnerY = barY + (barHeight - healthBarInnerHeight); // Start from bottom
        
        // Color gradient based on health (green -> yellow -> red)
        const r = Math.floor(255 * (1 - healthPercentage));
        const g = Math.floor(255 * healthPercentage);
        ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
        ctx.fillRect(barX, healthBarInnerY, barWidth, healthBarInnerHeight);
        
        // Border
        ctx.strokeStyle = HEALTH_BAR_BORDER_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
    } else {
        // Horizontal bar rendering (swapped dimensions)
        const hBarWidth = barHeight; // Use height as width for horizontal
        const hBarHeight = barWidth; // Use width as height for horizontal
        
        // Background
        ctx.fillStyle = HEALTH_BAR_BG_COLOR;
        ctx.fillRect(barX, barY, hBarWidth, hBarHeight);
        
        // Health portion (fills from left)
        const healthBarInnerWidth = hBarWidth * healthPercentage;
        
        const r = Math.floor(255 * (1 - healthPercentage));
        const g = Math.floor(255 * healthPercentage);
        ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
        ctx.fillRect(barX, barY, healthBarInnerWidth, hBarHeight);
        
        // Border
        ctx.strokeStyle = HEALTH_BAR_BORDER_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, hBarWidth, hBarHeight);
    }
    
    ctx.restore();
    
    return true;
}

/**
 * Helper to extract lastHitTimeMs from SpacetimeDB timestamp
 */
export function getLastHitTimeMs(lastHitTime: { microsSinceUnixEpoch: bigint } | null | undefined): number | null {
    if (!lastHitTime) return null;
    return Number(lastHitTime.microsSinceUnixEpoch / 1000n);
}

// === GENERIC ENTITY HEALTH BAR ===
// DRY interface for entities with standard health properties

/**
 * Common interface for entities that can display health bars.
 * Most SpacetimeDB entities with health implement this shape.
 */
export interface HealthBarEntity {
    posX: number;
    posY: number;
    health?: number;
    maxHealth?: number;
    lastHitTime?: { microsSinceUnixEpoch: bigint } | null;
    isDestroyed?: boolean;
}

/**
 * Simplified health bar rendering for standard entities.
 * Call directly from render functions - no wrapper needed.
 *
 * When entityType + entityId are provided, merges with optimistic overlay for
 * instant feedback when the local player attacks (no server round-trip delay).
 *
 * @example
 * // In render function:
 * renderEntityHealthBar(ctx, campfire, CAMPFIRE_WIDTH, CAMPFIRE_HEIGHT, nowMs, playerX, playerY, -RENDER_Y_OFFSET);
 * // With optimistic overlay (for combat targets):
 * renderEntityHealthBar(ctx, tree, W, H, nowMs, playerX, playerY, 0, 'tree', tree.id);
 */
export function renderEntityHealthBar(
    ctx: CanvasRenderingContext2D,
    entity: HealthBarEntity,
    entityWidth: number,
    entityHeight: number,
    nowMs: number,
    playerX: number,
    playerY: number,
    entityDrawYOffset: number = 0,
    entityType?: OptimisticEntityType,
    entityId?: bigint | number | string
): boolean {
    // Skip if destroyed or missing required properties
    if (entity.isDestroyed) return false;
    const maxHealth = entity.maxHealth ?? 100;
    if (entity.health === undefined && !(entityType && entityId)) return false;

    // Merge with optimistic overlay when we have type+id (combat targets)
    let health: number;
    let lastHitTimeMs: number | null;
    if (entityType !== undefined && entityId !== undefined) {
        const merged = mergeWithOptimisticOverlay(entityType, entityId, entity);
        health = merged.health;
        lastHitTimeMs = merged.lastHitTimeMs;
    } else {
        health = entity.health ?? maxHealth;
        lastHitTimeMs = getLastHitTimeMs(entity.lastHitTime);
    }

    return renderHealthBar({
        ctx,
        entityX: entity.posX,
        entityY: entity.posY,
        entityWidth,
        entityHeight,
        health,
        maxHealth,
        lastHitTimeMs,
        nowMs,
        playerX,
        playerY,
        entityDrawYOffset,
    });
}
