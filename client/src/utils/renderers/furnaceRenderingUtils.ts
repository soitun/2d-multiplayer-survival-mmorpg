import { Furnace } from '../../generated'; // Import generated Furnace type
import furnaceImage from '../../assets/doodads/furnace_simple.png'; // Direct import OFF
import furnaceOnImage from '../../assets/doodads/furnace_simple_on.png'; // Direct import ON
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer'; // Import generic renderer
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { imageManager } from './imageManager'; // Import image manager
import { renderEntityHealthBar } from './healthBarUtils';

// --- Constants directly used by this module or exported ---
export const FURNACE_WIDTH = 96; // Standard furnace size
export const FURNACE_HEIGHT = 96; // Standard furnace size
export const FURNACE_WIDTH_PREVIEW = 96; // Standard furnace size
export const FURNACE_HEIGHT_PREVIEW = 96; // Standard furnace size
// Offset for rendering to align with server-side collision zones
export const FURNACE_RENDER_Y_OFFSET = 10; // Visual offset from entity's base Y

// Furnace interaction distance (player <-> furnace)
export const PLAYER_FURNACE_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0; // Same as campfire

// Constants for server-side collision logic
export const SERVER_FURNACE_COLLISION_RADIUS = 20.0;
export const SERVER_FURNACE_COLLISION_CENTER_Y_OFFSET = 0.0;

// --- Other Local Constants ---
const SHAKE_DURATION_MS = 150; // How long the shake effect lasts
const SHAKE_INTENSITY_PX = 8; // Same as campfire

// --- Client-side animation tracking for furnace shakes ---
const clientFurnaceShakeStartTimes = new Map<string, number>(); // furnaceId -> client timestamp when shake started
const lastKnownServerFurnaceShakeTimes = new Map<string, number>();

// --- Define Configuration ---
const furnaceConfig: GroundEntityConfig<Furnace> = {
    // Return imported URL based on burning state
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null; // Don't render if destroyed
        }
        return entity.isBurning ? furnaceOnImage : furnaceImage;
    },

    getTargetDimensions: (_img, _entity) => ({
        width: FURNACE_WIDTH,
        height: FURNACE_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        // Top-left corner for image drawing, originating from entity's base Y
        // Apply Y offset to better align with collision area
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight - FURNACE_RENDER_Y_OFFSET,
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Draw DYNAMIC ground shadow for both burning and unlit furnaces (if not destroyed)
        if (!entity.isDestroyed) {
            // Calculate shake offsets for shadow synchronization using helper function
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientFurnaceShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerFurnaceShakeTimes
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
                maxStretchFactor: 1.1, // Slightly less dynamic than campfire 
                minStretchFactor: 0.2,  // Heavier/more stable than campfire
                shadowBlur: 3,         // Slightly more blur for bigger object
                pivotYOffset: 30,      // Furnace is heavier, shadow anchor lower
                // Pass shake offsets so shadow moves with the furnace
                shakeOffsetX,
                shakeOffsetY      
            });
        }
    },

    applyEffects: (ctx, entity, nowMs, baseDrawX, baseDrawY, cycleProgress) => {
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

    fallbackColor: '#8B4513', // Sienna brown fallback
};

// Preload both furnace images
imageManager.preloadImage(furnaceImage);
imageManager.preloadImage(furnaceOnImage);

// --- Rendering Function ---
export function renderFurnace(
    ctx: CanvasRenderingContext2D, 
    furnace: Furnace, 
    nowMs: number, 
    cycleProgress: number,
    onlyDrawShadow?: boolean,
    skipDrawingShadow?: boolean,
    playerX?: number,
    playerY?: number
) { 
    renderConfiguredGroundEntity({
        ctx,
        entity: furnace,
        config: furnaceConfig,
        nowMs,
        entityPosX: furnace.posX,
        entityPosY: furnace.posY,
        cycleProgress,
        onlyDrawShadow,
        skipDrawingShadow
    });
    
    // Render health bar using unified system
    if (!onlyDrawShadow && playerX !== undefined && playerY !== undefined) {
        renderEntityHealthBar(ctx, furnace, FURNACE_WIDTH, FURNACE_HEIGHT, nowMs, playerX, playerY, -FURNACE_RENDER_Y_OFFSET);
    }
} 

 