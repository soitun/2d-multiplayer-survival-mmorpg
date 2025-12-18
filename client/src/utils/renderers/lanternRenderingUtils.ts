import { Lantern } from '../../generated'; // Import generated Lantern type
import lanternOnImage from '../../assets/doodads/lantern_on.png'; // Direct import ON
import lanternOffImage from '../../assets/doodads/lantern_off.png'; // Direct import OFF
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer'; // Import generic renderer
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { imageManager } from './imageManager'; // Import image manager
import { renderEntityHealthBar } from './healthBarUtils';

// --- Constants directly used by this module or exported ---
export const LANTERN_WIDTH = 48;
export const LANTERN_HEIGHT = 56;
export const LANTERN_WIDTH_PREVIEW = 48; // Preview width matches actual width
export const LANTERN_HEIGHT_PREVIEW = 56; // Preview height matches actual height
// Offset for rendering to align with server-side collision/interaction zones
export const LANTERN_RENDER_Y_OFFSET = 6; // Visual offset from entity's base Y

// Lantern interaction distance (player <-> lantern)
export const PLAYER_LANTERN_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0; // Same as campfire

// Lantern pickup mechanic: Empty lanterns can be picked up by holding E (similar to boxes)
// Non-empty lanterns can have their burning state toggled by holding E
// Tap E opens the lantern interface for fuel management

// Constants for server-side damage logic (lanterns don't damage, but kept for consistency)
export const SERVER_LANTERN_DAMAGE_RADIUS = 0.0; // Lanterns don't damage
export const SERVER_LANTERN_DAMAGE_CENTER_Y_OFFSET = 0.0;

// Particle emission points relative to the lantern's visual center
const LIGHT_EMISSION_VISUAL_CENTER_Y_OFFSET = LANTERN_HEIGHT * 0.3; 

// --- Other Local Constants ---
const SHAKE_DURATION_MS = 150; // How long the shake effect lasts
const SHAKE_INTENSITY_PX = 6; // Less intense shake for lanterns

// --- Client-side animation tracking for lantern shakes ---
const clientLanternShakeStartTimes = new Map<string, number>(); // lanternId -> client timestamp when shake started
const lastKnownServerLanternShakeTimes = new Map<string, number>();

// --- Define Configuration ---
const lanternConfig: GroundEntityConfig<Lantern> = {
    // Return imported URL based on state
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null; // Don't render if destroyed
        }
        return entity.isBurning ? lanternOnImage : lanternOffImage;
    },

    getTargetDimensions: (_img, _entity) => ({
        width: LANTERN_WIDTH,
        height: LANTERN_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        // Top-left corner for image drawing, originating from entity's base Y
        // Apply Y offset to better align with collision area
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight - LANTERN_RENDER_Y_OFFSET,
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Draw DYNAMIC ground shadow for both lit and unlit lanterns (if not destroyed)
        if (!entity.isDestroyed) {
            // Calculate shake offsets for shadow synchronization using helper function
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientLanternShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerLanternShakeTimes
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
                maxStretchFactor: 1.1, 
                minStretchFactor: 0.2,  
                shadowBlur: 1,         
                pivotYOffset: 15,
                // NEW: Pass shake offsets so shadow moves with the lantern
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

    fallbackColor: '#996633', // Warm brown fallback
};

// Preload both imported URLs
imageManager.preloadImage(lanternOnImage);
imageManager.preloadImage(lanternOffImage);

// --- Rendering Function (Refactored) ---
export function renderLantern(
    ctx: CanvasRenderingContext2D, 
    lantern: Lantern, 
    nowMs: number, 
    cycleProgress: number,
    onlyDrawShadow?: boolean,
    skipDrawingShadow?: boolean,
    playerX?: number,
    playerY?: number
) { 
    renderConfiguredGroundEntity({
        ctx,
        entity: lantern,
        config: lanternConfig,
        nowMs,
        entityPosX: lantern.posX,
        entityPosY: lantern.posY,
        cycleProgress,
        onlyDrawShadow,
        skipDrawingShadow
    });
    
    // Render health bar using unified system
    if (!onlyDrawShadow && playerX !== undefined && playerY !== undefined) {
        renderEntityHealthBar(ctx, lantern, LANTERN_WIDTH, LANTERN_HEIGHT, nowMs, playerX, playerY, -LANTERN_RENDER_Y_OFFSET);
    }
} 