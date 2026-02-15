import { Stash } from '../../generated';
import stashImageSrc from '../../assets/doodads/stash.png';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { imageManager } from './imageManager';

// --- Constants ---
export const STASH_WIDTH = 48; // Adjust as needed
export const STASH_HEIGHT = 48; // Adjust as needed
export const PLAYER_STASH_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0; // Added interaction distance
const SHAKE_DURATION_MS = 150;
const SHAKE_INTENSITY_PX = 7;

// --- Client-side animation tracking for stash shakes ---
const clientStashShakeStartTimes = new Map<string, number>(); // stashId -> client timestamp when shake started
const lastKnownServerStashShakeTimes = new Map<string, number>();

const stashConfig: GroundEntityConfig<Stash> = {
    getImageSource: (entity) => {
        if (entity.isDestroyed || entity.isHidden) {
            return null;
        }
        return stashImageSrc;
    },

    getTargetDimensions: (img, _entity) => {
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        const targetHeight = STASH_HEIGHT; // Use the defined height
        const targetWidth = targetHeight * aspectRatio;
        return { width: targetWidth, height: targetHeight };
    },

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight, // Anchor to bottom center (like campfire)
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Draw DYNAMIC ground shadow if not hidden and not destroyed
        if (!entity.isHidden && !entity.isDestroyed) {
            // Calculate shake offsets for shadow synchronization using helper function
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientStashShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerStashShakeTimes
                },
                SHAKE_DURATION_MS,
                SHAKE_INTENSITY_PX
            );

            drawDynamicGroundShadow({
                ctx,
                entityImage,
                entityCenterX: entityPosX,
                entityBaseY: entityPosY,
                imageDrawWidth,
                imageDrawHeight,
                cycleProgress,
                maxStretchFactor: 1.2, 
                minStretchFactor: 0.1,  
                shadowBlur: 2,         
                pivotYOffset: 20,
                // NEW: Pass shake offsets so shadow moves with the stash
                shakeOffsetX,
                shakeOffsetY      
            });
        }
    },

    applyEffects: (ctx, entity, nowMs, baseDrawX, baseDrawY, cycleProgress) => {
        // Dynamic shadow is now handled in drawCustomGroundShadow
        // No additional shadow effects needed here

        let shakeOffsetX = 0;
        let shakeOffsetY = 0;

        if (entity.lastHitTime && !entity.isDestroyed && !entity.isHidden) {
            const lastHitTimeMs = Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n);
            const elapsedSinceHit = nowMs - lastHitTimeMs;

            if (elapsedSinceHit >= 0 && elapsedSinceHit < SHAKE_DURATION_MS) {
                const shakeFactor = 1.0 - (elapsedSinceHit / SHAKE_DURATION_MS);
                const currentShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                shakeOffsetX = (Math.random() - 0.5) * 2 * currentShakeIntensity;
                shakeOffsetY = (Math.random() - 0.5) * 2 * currentShakeIntensity;
            }
        }
        return { offsetX: shakeOffsetX, offsetY: shakeOffsetY };
    },

    // Health bar rendered separately via renderEntityHealthBar
    drawOverlay: undefined,
    fallbackColor: '#5C4033', // Darker brown for stash
};

imageManager.preloadImage(stashImageSrc);

export function renderStash(
    ctx: CanvasRenderingContext2D, 
    stash: Stash, 
    nowMs: number, 
    cycleProgress: number,
    playerX?: number,
    playerY?: number
) {
    renderConfiguredGroundEntity({
        ctx,
        entity: stash,
        config: stashConfig,
        nowMs,
        entityPosX: stash.posX,
        entityPosY: stash.posY,
        cycleProgress,
    });
    
    // Health bar rendered via renderHealthBarOverlay (on top of world objects)
} 