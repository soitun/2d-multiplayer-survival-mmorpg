import { Campfire } from '../../generated'; // Import generated Campfire type
import campfireImage from '../../assets/doodads/campfire.png'; // Direct import ON
import campfireOffImage from '../../assets/doodads/campfire_off.png'; // Direct import OFF
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer'; // Import generic renderer
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { imageManager } from './imageManager'; // Import image manager
import { renderEntityHealthBar } from './healthBarUtils';

// --- Constants directly used by this module or exported ---
export const CAMPFIRE_WIDTH = 64;
export const CAMPFIRE_HEIGHT = 64;
export const CAMPFIRE_WIDTH_PREVIEW = 64; // Added for preview components
export const CAMPFIRE_HEIGHT_PREVIEW = 64; // Added for preview components
// Offset for rendering to align with server-side collision/damage zones
// Keep the original render offset as server code has been updated to match visual
export const CAMPFIRE_RENDER_Y_OFFSET = 10; // Visual offset from entity's base Y

// Campfire interaction distance (player <-> campfire)
export const PLAYER_CAMPFIRE_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0; // New radius: 96px

// Constants for server-side damage logic
export const SERVER_CAMPFIRE_DAMAGE_RADIUS = 25.0;
export const SERVER_CAMPFIRE_DAMAGE_CENTER_Y_OFFSET = 0.0;

// Particle emission points relative to the campfire's visual center (posY - (HEIGHT/2) - RENDER_Y_OFFSET)
// These describe where particles START. Positive Y is UP from visual center.
const FIRE_EMISSION_VISUAL_CENTER_Y_OFFSET = CAMPFIRE_HEIGHT * 0.35; 
const SMOKE_EMISSION_VISUAL_CENTER_Y_OFFSET = CAMPFIRE_HEIGHT * 0.4;

// --- Other Local Constants ---
const SHAKE_DURATION_MS = 150; // How long the shake effect lasts
const SHAKE_INTENSITY_PX = 8; // Slightly less intense shake for campfires

// --- Client-side animation tracking for campfire shakes ---
const clientCampfireShakeStartTimes = new Map<string, number>(); // campfireId -> client timestamp when shake started
const lastKnownServerCampfireShakeTimes = new Map<string, number>();

// --- Define Configuration ---
const campfireConfig: GroundEntityConfig<Campfire> = {
    // Return imported URL based on state
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null; // Don't render if destroyed (placeholder for shatter)
        }
        return entity.isBurning ? campfireImage : campfireOffImage;
    },

    getTargetDimensions: (_img, _entity) => ({
        width: CAMPFIRE_WIDTH,
        height: CAMPFIRE_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        // Top-left corner for image drawing, originating from entity's base Y
        // Apply Y offset to better align with collision area
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight - CAMPFIRE_RENDER_Y_OFFSET,
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Draw DYNAMIC ground shadow for both burning and unlit campfires (if not destroyed)
        if (!entity.isDestroyed) {
            // Calculate shake offsets for shadow synchronization using helper function
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientCampfireShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerCampfireShakeTimes
                },
                SHAKE_DURATION_MS,
                SHAKE_INTENSITY_PX
            );

            // NOON FIX: At noon, shadows appear too far below (detached from entity)
            let noonExtraOffset = 0;
            if (cycleProgress >= 0.35 && cycleProgress < 0.55) {
                const noonT = (cycleProgress - 0.35) / 0.20;
                const noonFactor = 1.0 - Math.abs(noonT - 0.5) * 2.0;
                noonExtraOffset = noonFactor * imageDrawHeight * 0.25;
            }

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
                pivotYOffset: 25 + noonExtraOffset,
                // NEW: Pass shake offsets so shadow moves with the campfire
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

    fallbackColor: '#663300', // Dark brown fallback
};

// Preload both imported URLs
imageManager.preloadImage(campfireImage);
imageManager.preloadImage(campfireOffImage);

// --- Rendering Function (Refactored) ---
export function renderCampfire(
    ctx: CanvasRenderingContext2D, 
    campfire: Campfire, 
    nowMs: number, 
    cycleProgress: number,
    onlyDrawShadow?: boolean,
    skipDrawingShadow?: boolean,
    playerX?: number,
    playerY?: number
) { 
    renderConfiguredGroundEntity({
        ctx,
        entity: campfire,
        config: campfireConfig,
        nowMs,
        entityPosX: campfire.posX,
        entityPosY: campfire.posY,
        cycleProgress,
        onlyDrawShadow,
        skipDrawingShadow
    });
    
    // Render health bar using unified system
    if (!onlyDrawShadow && playerX !== undefined && playerY !== undefined) {
        renderEntityHealthBar(ctx, campfire, CAMPFIRE_WIDTH, CAMPFIRE_HEIGHT, nowMs, playerX, playerY, -CAMPFIRE_RENDER_Y_OFFSET);
    }
} 
