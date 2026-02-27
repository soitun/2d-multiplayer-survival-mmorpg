import { HomesteadHearth } from '../../generated/types';
import hearthImage from '../../assets/doodads/hearth.png';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { imageManager } from './imageManager';

// --- Constants directly used by this module or exported ---
export const HEARTH_WIDTH = 125;
export const HEARTH_HEIGHT = 125;
export const HEARTH_WIDTH_PREVIEW = 125;
export const HEARTH_HEIGHT_PREVIEW = 125;
export const HEARTH_RENDER_Y_OFFSET = 10;

// Hearth interaction distance (player <-> hearth)
export const PLAYER_HEARTH_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0;

// --- Other Local Constants ---
const SHAKE_DURATION_MS = 150;
const SHAKE_INTENSITY_PX = 8;

// --- Client-side animation tracking for hearth shakes ---
const clientHearthShakeStartTimes = new Map<string, number>(); // hearthId -> client timestamp when shake started
const lastKnownServerHearthShakeTimes = new Map<string, number>();

// --- Define Configuration ---
const hearthConfig: GroundEntityConfig<HomesteadHearth> = {
    // Return imported URL - hearth is always "on" (always burning)
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null; // Don't render if destroyed
        }
        return hearthImage; // Always use the same image (hearth is always lit)
    },

    getTargetDimensions: (_img, _entity) => ({
        width: HEARTH_WIDTH,
        height: HEARTH_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        // Top-left corner for image drawing, originating from entity's base Y
        // Apply Y offset to better align with collision area
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight - HEARTH_RENDER_Y_OFFSET,
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Draw DYNAMIC ground shadow for hearth (if not destroyed)
        if (!entity.isDestroyed) {
            // Calculate shake offsets for shadow synchronization using helper function
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientHearthShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerHearthShakeTimes
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
                pivotYOffset: 25,
                // Pass shake offsets so shadow moves with the hearth
                shakeOffsetX,
                shakeOffsetY      
            });
        }
    },

    applyEffects: (ctx, entity, nowMs, baseDrawX, baseDrawY, cycleProgress) => {
        // Dynamic shadow is now handled in drawCustomGroundShadow for all states
        // No additional shadow effects needed here

        let shakeOffsetX = 0;
        let shakeOffsetY = 0;

        if (entity.lastHitTime && !entity.isDestroyed) {
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

    // Health bar rendered separately via renderEntityHealthBar
    drawOverlay: undefined,

    fallbackColor: '#8B4513', // Saddle brown fallback (darker than campfire)
};

// Preload hearth image
imageManager.preloadImage(hearthImage);

// --- Rendering Function ---
export function renderHearth(
    ctx: CanvasRenderingContext2D, 
    hearth: HomesteadHearth, 
    nowMs: number, 
    cycleProgress: number,
    onlyDrawShadow?: boolean,
    skipDrawingShadow?: boolean,
    playerX?: number,
    playerY?: number
) { 
    renderConfiguredGroundEntity({
        ctx,
        entity: hearth,
        config: hearthConfig,
        nowMs,
        entityPosX: hearth.posX,
        entityPosY: hearth.posY,
        cycleProgress,
        onlyDrawShadow,
        skipDrawingShadow
    });
    
    // Health bar rendered via renderHealthBarOverlay (on top of world objects)
} 

