import { LivingCoral } from '../../generated'; // Import generated type
import coralImage from '../../assets/doodads/coral.png'; // Main coral variant
import coral1Image from '../../assets/doodads/coral1.png'; // Second coral variant
import { applyStandardDropShadow, drawDynamicGroundShadow } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';

// --- Constants ---
export const LIVING_CORAL_WIDTH = 96; // Coral reef cluster width
export const LIVING_CORAL_HEIGHT = 80; // Coral reef cluster height

// --- Living Coral Variant Images Array ---
// Use coral.png and coral1.png for visual variety
const LIVING_CORAL_VARIANT_IMAGES = [
    coralImage,    // Main coral variant
    coral1Image,   // Second coral variant
];

// --- Define Configuration ---
const livingCoralConfig: GroundEntityConfig<LivingCoral> = {
    getImageSource: (entity) => {
        // Select coral variant based on entity ID for consistent visual variety
        const variantIndex = Number(entity.id) % LIVING_CORAL_VARIANT_IMAGES.length;
        return LIVING_CORAL_VARIANT_IMAGES[variantIndex];
    },

    getTargetDimensions: (_img, _entity) => ({
        width: LIVING_CORAL_WIDTH,
        height: LIVING_CORAL_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight + 20, // Anchor at base with small offset for underwater appearance
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Draw subtle underwater shadow for coral
        drawDynamicGroundShadow({
            ctx,
            entityImage,
            entityCenterX: entityPosX,
            entityBaseY: entityPosY,
            imageDrawWidth,
            imageDrawHeight,
            cycleProgress,
            maxStretchFactor: 0.8,  // Minimal stretch (underwater has diffused light)
            minStretchFactor: 0.4,  // Keep some shadow even at noon
            shadowBlur: 6,          // Softer underwater shadow
            pivotYOffset: 20,       // Pivot point for shadow
        });
    },

    applyEffects: (ctx, entity, nowMs, baseDrawX, baseDrawY, cycleProgress) => {
        // Apply subtle drop shadow for depth
        applyStandardDropShadow(ctx);
        
        // Add gentle underwater sway animation
        const swayOffset = Math.sin(nowMs / 2000 + entity.posX * 0.01) * 2;
        
        return {
            offsetX: swayOffset,
            offsetY: 0,
        };
    },

    drawOverlay: (ctx, entity, drawX, drawY, drawWidth, drawHeight, nowMs) => {
        // Draw health bar only if coral is damaged (not at full health)
        if (entity.health < 500) { // 500 = LIVING_CORAL_INITIAL_HEALTH
            const healthPercent = entity.health / 500;
            const barWidth = 40;
            const barHeight = 6;
            const barX = entity.posX - barWidth / 2;
            const barY = entity.posY - LIVING_CORAL_HEIGHT - 10;
            
            // Background bar
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            
            // Health bar (teal/cyan for underwater theme)
            ctx.fillStyle = healthPercent > 0.5 ? '#00CED1' : healthPercent > 0.25 ? '#FFD700' : '#FF4500';
            ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
            
            // Border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
        }
    },

    fallbackColor: '#FF6B6B', // Coral pink fallback color
};

/**
 * Renders a living coral entity (underwater harvestable resource).
 * Living coral uses the combat system like stones - attack with Diving Pick to harvest.
 */
export function renderLivingCoral(
    ctx: CanvasRenderingContext2D,
    coral: LivingCoral,
    nowMs: number,
    cycleProgress: number
): void {
    // Don't render if coral is respawning (depleted)
    if (coral.respawnAt !== undefined && coral.respawnAt !== null) {
        return;
    }
    
    renderConfiguredGroundEntity({
        ctx,
        entity: coral,
        config: livingCoralConfig,
        nowMs,
        entityPosX: coral.posX,
        entityPosY: coral.posY,
        cycleProgress,
    });
}

/**
 * Pre-loads living coral images into the image manager cache.
 */
export function preloadLivingCoralImages(): void {
    // Preload all coral variant images
    LIVING_CORAL_VARIANT_IMAGES.forEach(imageSrc => {
        imageManager.preloadImage(imageSrc);
    });
}

