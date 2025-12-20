import { LivingCoral } from '../../generated'; // Import generated type
import coralImage from '../../assets/doodads/coral.png'; // Main coral variant
import coral1Image from '../../assets/doodads/coral1.png'; // Second coral variant
import coral2Image from '../../assets/doodads/coral2.png'; // Third coral variant
import coral3Image from '../../assets/doodads/coral3.png'; // Fourth coral variant
import { applyStandardDropShadow, drawDynamicGroundShadow } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';

// --- Constants ---
export const LIVING_CORAL_WIDTH = 192; // Coral reef cluster width (doubled for better underwater visibility)
export const LIVING_CORAL_HEIGHT = 160; // Coral reef cluster height (doubled)
export const LIVING_CORAL_COLLISION_RADIUS = 80; // Doubled collision radius for client collision checks

// --- Living Coral Variant Images Array ---
// Use coral, coral1, coral2, coral3.png for visual variety in reef clusters
const LIVING_CORAL_VARIANT_IMAGES = [
    coralImage,    // Main coral variant
    coral1Image,   // Second coral variant
    coral2Image,   // Third coral variant
    coral3Image,   // Fourth coral variant
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
        drawY: entity.posY - drawHeight + 40, // Anchor at base with offset for doubled underwater appearance
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Draw subtle underwater shadow for coral (doubled size)
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
            shadowBlur: 8,          // Softer underwater shadow (slightly larger for doubled size)
            pivotYOffset: 40,       // Pivot point for shadow (doubled for larger coral)
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

    // No health bars for natural resources (trees, stones, corals)
    // Living coral uses the same pattern as other harvestable resources
    drawOverlay: undefined,

    fallbackColor: '#FF6B6B', // Coral pink fallback color
};

// Offscreen canvas for underwater tinting (reused for performance)
let offscreenCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getOffscreenCanvas(width: number, height: number): { canvas: OffscreenCanvas | HTMLCanvasElement, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
    if (!offscreenCanvas || offscreenCanvas.width < width || offscreenCanvas.height < height) {
        // Create or resize offscreen canvas
        if (typeof OffscreenCanvas !== 'undefined') {
            offscreenCanvas = new OffscreenCanvas(width, height);
        } else {
            offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = width;
            offscreenCanvas.height = height;
        }
        offscreenCtx = offscreenCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    }
    return { canvas: offscreenCanvas, ctx: offscreenCtx! };
}

/**
 * Renders a living coral entity (underwater harvestable resource).
 * Living coral uses the combat system like stones - attack with Diving Pick to harvest.
 * @param applyUnderwaterTint - If true, applies teal underwater tint (when viewer is snorkeling)
 */
export function renderLivingCoral(
    ctx: CanvasRenderingContext2D,
    coral: LivingCoral,
    nowMs: number,
    cycleProgress: number,
    applyUnderwaterTint: boolean = false
): void {
    // Don't render if coral is respawning (depleted)
    if (coral.respawnAt !== undefined && coral.respawnAt !== null) {
        return;
    }
    
    // Calculate draw position
    const drawX = coral.posX - LIVING_CORAL_WIDTH / 2;
    const drawY = coral.posY - LIVING_CORAL_HEIGHT + 40;
    
    if (applyUnderwaterTint) {
        // Use offscreen canvas for proper tinting
        const padding = 20; // Extra padding for shadows/effects
        const canvasWidth = LIVING_CORAL_WIDTH + padding * 2;
        const canvasHeight = LIVING_CORAL_HEIGHT + padding * 2;
        const { canvas, ctx: offCtx } = getOffscreenCanvas(canvasWidth, canvasHeight);
        
        // Clear the offscreen canvas
        offCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        
        // Save and translate to render coral at center of offscreen canvas
        offCtx.save();
        offCtx.translate(padding + LIVING_CORAL_WIDTH / 2 - coral.posX, padding + LIVING_CORAL_HEIGHT - 40 - coral.posY);
        
        // Render coral to offscreen canvas
        renderConfiguredGroundEntity({
            ctx: offCtx as CanvasRenderingContext2D,
            entity: coral,
            config: livingCoralConfig,
            nowMs,
            entityPosX: coral.posX,
            entityPosY: coral.posY,
            cycleProgress,
        });
        
        offCtx.restore();
        
        // Apply teal tint using source-atop (only affects drawn pixels)
        offCtx.globalCompositeOperation = 'source-atop';
        offCtx.fillStyle = 'rgba(12, 62, 79, 0.35)'; // Teal underwater tint
        offCtx.fillRect(0, 0, canvasWidth, canvasHeight);
        offCtx.globalCompositeOperation = 'source-over';
        
        // Draw the tinted result to main canvas
        ctx.drawImage(canvas, drawX - padding, drawY - padding);
    } else {
        // Normal rendering without tint
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

