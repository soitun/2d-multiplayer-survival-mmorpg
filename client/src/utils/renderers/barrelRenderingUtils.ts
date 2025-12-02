import { Barrel } from '../../generated'; // Import generated type
import barrelImage from '../../assets/doodads/barrel.png'; // Variant 0
import barrel2Image from '../../assets/doodads/barrel2.png'; // Variant 1 
import barrel3Image from '../../assets/doodads/barrel3.png'; // Variant 2
// Sea barrel variants (flotsam/cargo crates) - variants 3, 4, 5
// TODO: Add actual sea barrel images when available
// For now, using road barrel images as placeholders
import seaBarrelImage from '../../assets/doodads/barrel4.png'; // Variant 3 (placeholder)
import seaBarrel2Image from '../../assets/doodads/barrel5.png'; // Variant 4 (placeholder)
import seaBarrel3Image from '../../assets/doodads/barrel6.png'; // Variant 5 (placeholder)
import { applyStandardDropShadow, drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils'; // Added import
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer'; // Import generic renderer
import { imageManager } from './imageManager'; // Import image manager

// --- Constants --- (Keep exportable if used elsewhere)
export const BARREL_WIDTH = 86; // Standard barrel size (increased from 72)
export const BARREL_HEIGHT = 86;
export const BARREL5_WIDTH = 172; // Variant 4 (barrel5.png) rendered at larger size (increased from 144)
export const BARREL5_HEIGHT = 172;
export const PLAYER_BARREL_INTERACTION_DISTANCE_SQUARED = 64.0 * 64.0; // Barrel interaction distance
const SHAKE_DURATION_MS = 150; 
const SHAKE_INTENSITY_PX = 8; // Moderate shake for barrels
const HEALTH_BAR_WIDTH = 40; // Smaller health bar for barrels
const HEALTH_BAR_HEIGHT = 5;
const HEALTH_BAR_Y_OFFSET = 6; // Adjust offset for barrel image centering
const HEALTH_BAR_VISIBLE_DURATION_MS = 3000; // Same as storage boxes

// --- Barrel Variant Images Array ---
// Variants 0-2: Road barrels
// Variants 3-5: Sea barrels (flotsam/cargo crates)
const BARREL_VARIANT_IMAGES = [
    barrelImage,       // Variant 0 (road barrel)
    barrel2Image,      // Variant 1 (road barrel)
    barrel3Image,      // Variant 2 (road barrel)
    seaBarrelImage,    // Variant 3 (sea flotsam/cargo crate - placeholder)
    seaBarrel2Image,   // Variant 4 (sea flotsam/cargo crate - placeholder)
    seaBarrel3Image,   // Variant 5 (sea flotsam/cargo crate - placeholder)
];

// Constants for sea barrel variants
const SEA_BARREL_VARIANT_START = 3;
const SEA_BARREL_VARIANT_END = 6; // Exclusive end

// --- Client-side animation tracking for barrel shakes ---
const clientBarrelShakeStartTimes = new Map<string, number>(); // barrelId -> client timestamp when shake started
const lastKnownServerBarrelShakeTimes = new Map<string, number>();

// --- Define Configuration --- 
const barrelConfig: GroundEntityConfig<Barrel> = {
    getImageSource: (entity) => {
        if (entity.respawnAt) {
            return null; // Don't render if respawning (destroyed)
        }
        
        // Select barrel variant based on entity.variant field
        // Variants 0-2: Road barrels, Variants 3-5: Sea barrels (flotsam/cargo crates)
        const variantIndex = (entity.variant ?? 0);
        if (variantIndex < BARREL_VARIANT_IMAGES.length) {
            return BARREL_VARIANT_IMAGES[variantIndex];
        }
        // Fallback to variant 0 if invalid variant
        return BARREL_VARIANT_IMAGES[0];
    },

    getTargetDimensions: (img, entity) => {
        // Variant 4 (barrel5.png) renders at 144x144px, all others at 72x72px
        const variantIndex = Number(entity.variant ?? 0);
        if (variantIndex === 4) {
            return {
                width: BARREL5_WIDTH,
                height: BARREL5_HEIGHT,
            };
        }
        return {
            width: BARREL_WIDTH,
            height: BARREL_HEIGHT,
        };
    },

    calculateDrawPosition: (entity, drawWidth, drawHeight) => {
        // Scale Y offset for variant 4 (barrel5.png - 2x larger barrel)
        const variantIndex = Number(entity.variant ?? 0);
        const yOffset = variantIndex === 4 ? 24 : 12; // Double offset for variant 4
        return {
            drawX: entity.posX - drawWidth / 2,
            drawY: entity.posY - drawHeight - yOffset, // Slight Y adjustment for centering
        };
    },

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Draw DYNAMIC ground shadow if not destroyed/respawning
        if (!entity.respawnAt) {
            // Calculate shake offsets for shadow synchronization using helper function
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientBarrelShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerBarrelShakeTimes
                },
                SHAKE_DURATION_MS,
                SHAKE_INTENSITY_PX
            );

            // Scale pivotYOffset based on barrel size (variant 4 is 2x larger)
            const variantIndex = Number(entity.variant ?? 0);
            const pivotYOffset = variantIndex === 4 ? 60 : 30; // Double for variant 4

            drawDynamicGroundShadow({
                ctx,
                entityImage,
                entityCenterX: entityPosX,
                entityBaseY: entityPosY,
                imageDrawWidth,
                imageDrawHeight,
                cycleProgress,
                maxStretchFactor: 1.1, 
                minStretchFactor: 0.15,  
                shadowBlur: 2,         
                pivotYOffset,
                // Pass shake offsets so shadow moves with the barrel
                shakeOffsetX,
                shakeOffsetY       
            });
        }
    },

    applyEffects: (ctx, entity, nowMs, baseDrawX, baseDrawY, cycleProgress) => {
        // Dynamic shadow is now handled in drawCustomGroundShadow
        // Handle shake effects

        let shakeOffsetX = 0;
        let shakeOffsetY = 0;

        if (entity.lastHitTime && !entity.respawnAt) {
            const lastHitTimeMs = Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n);
            const elapsedSinceHit = nowMs - lastHitTimeMs;

            if (elapsedSinceHit >= 0 && elapsedSinceHit < SHAKE_DURATION_MS) {
                const shakeFactor = 1.0 - (elapsedSinceHit / SHAKE_DURATION_MS);
                const currentShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                shakeOffsetX = (Math.random() - 0.5) * 2 * currentShakeIntensity;
                shakeOffsetY = (Math.random() - 0.5) * 2 * currentShakeIntensity;
            }
        }
        return {
            offsetX: shakeOffsetX,
            offsetY: shakeOffsetY,
        };
    },

    drawOverlay: (ctx, entity, finalDrawX, finalDrawY, finalDrawWidth, finalDrawHeight, nowMs, baseDrawX, baseDrawY) => {
        if (entity.respawnAt) {
            return; // Don't draw health bar if barrel is destroyed/respawning
        }

        const health = entity.health ?? 0;
        const maxHealth = 50.0; // BARREL_INITIAL_HEALTH from server

        if (health < maxHealth && entity.lastHitTime) {
            const lastHitTimeMs = Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n);
            const elapsedSinceHit = nowMs - lastHitTimeMs;

            if (elapsedSinceHit < HEALTH_BAR_VISIBLE_DURATION_MS) {
                // Scale health bar size for variant 4 (barrel5.png - 2x larger barrel = 2x larger health bar)
                const variantIndex = Number(entity.variant ?? 0);
                const healthBarWidth = variantIndex === 4 ? HEALTH_BAR_WIDTH * 2 : HEALTH_BAR_WIDTH;
                const healthBarHeight = variantIndex === 4 ? HEALTH_BAR_HEIGHT * 2 : HEALTH_BAR_HEIGHT;
                const healthBarYOffset = variantIndex === 4 ? HEALTH_BAR_Y_OFFSET * 2 : HEALTH_BAR_Y_OFFSET;

                const healthPercentage = Math.max(0, health / maxHealth);
                const barOuterX = finalDrawX + (finalDrawWidth - healthBarWidth) / 2;
                const barOuterY = finalDrawY + finalDrawHeight + healthBarYOffset; // Position below barrel 

                const timeSinceLastHitRatio = elapsedSinceHit / HEALTH_BAR_VISIBLE_DURATION_MS;
                const opacity = Math.max(0, 1 - Math.pow(timeSinceLastHitRatio, 2));

                // Background
                ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * opacity})`;
                ctx.fillRect(barOuterX, barOuterY, healthBarWidth, healthBarHeight);

                // Health bar
                const healthBarInnerWidth = healthBarWidth * healthPercentage;
                const r = Math.floor(255 * (1 - healthPercentage));
                const g = Math.floor(255 * healthPercentage);
                ctx.fillStyle = `rgba(${r}, ${g}, 0, ${opacity})`;
                ctx.fillRect(barOuterX, barOuterY, healthBarInnerWidth, healthBarHeight);

                // Border
                ctx.strokeStyle = `rgba(0,0,0, ${0.7 * opacity})`;
                ctx.lineWidth = variantIndex === 4 ? 2 : 1; // Thicker border for larger barrel
                ctx.strokeRect(barOuterX, barOuterY, healthBarWidth, healthBarHeight);
            }
        }
    },

    fallbackColor: '#8B4513', // Saddle brown for wooden barrel
};

// Preload all barrel variant images
BARREL_VARIANT_IMAGES.forEach(barrelImg => {
    imageManager.preloadImage(barrelImg);
});

// --- Rendering Function (Refactored) ---
export function renderBarrel(
    ctx: CanvasRenderingContext2D, 
    barrel: Barrel, 
    nowMs: number, 
    cycleProgress: number
) {
    renderConfiguredGroundEntity({
        ctx,
        entity: barrel,
        config: barrelConfig,
        nowMs,
        entityPosX: barrel.posX,
        entityPosY: barrel.posY,
        cycleProgress,
    });
} 