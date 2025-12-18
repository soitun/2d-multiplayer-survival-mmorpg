import { Barbecue } from '../../generated'; // Import generated Barbecue type
import barbecueImage from '../../assets/doodads/barbecue.png'; // Direct import OFF state
import barbecueOnImage from '../../assets/doodads/barbecue_on.png'; // Direct import ON state
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer'; // Import generic renderer
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { imageManager } from './imageManager'; // Import image manager
import { renderEntityHealthBar } from './healthBarUtils';

// --- Constants directly used by this module or exported ---
export const BARBECUE_WIDTH = 128;
export const BARBECUE_HEIGHT = 128;
export const BARBECUE_WIDTH_PREVIEW = 128;
export const BARBECUE_HEIGHT_PREVIEW = 128;
// No render offset - sprite is CENTERED on posY
// This makes collision (at posY) align with sprite center
export const BARBECUE_RENDER_Y_OFFSET = 0;

// Barbecue interaction distance (player <-> barbecue)
export const PLAYER_BARBECUE_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0; // Same as campfire: 96px

// Constants for server-side damage logic
export const SERVER_BARBECUE_DAMAGE_RADIUS = 25.0;
export const SERVER_BARBECUE_DAMAGE_CENTER_Y_OFFSET = 0.0;

// Particle emission points relative to the barbecue's visual center
const FIRE_EMISSION_VISUAL_CENTER_Y_OFFSET = BARBECUE_HEIGHT * 0.30; 
const SMOKE_EMISSION_VISUAL_CENTER_Y_OFFSET = BARBECUE_HEIGHT * 0.35;

// --- Other Local Constants ---
const SHAKE_DURATION_MS = 150;
const SHAKE_INTENSITY_PX = 8;

// --- Client-side animation tracking for barbecue shakes ---
const clientBarbecueShakeStartTimes = new Map<string, number>();
const lastKnownServerBarbecueShakeTimes = new Map<string, number>();

// --- Define Configuration ---
const barbecueConfig: GroundEntityConfig<Barbecue> = {
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null;
        }
        // Return ON or OFF image based on burning state
        return entity.isBurning ? barbecueOnImage : barbecueImage;
    },

    getTargetDimensions: (_img, _entity) => ({
        width: BARBECUE_WIDTH,
        height: BARBECUE_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        // Sprite is CENTERED on posY - collision (at posY) aligns with sprite center
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight / 2,
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        if (!entity.isDestroyed) {
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientBarbecueShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerBarbecueShakeTimes
                },
                SHAKE_DURATION_MS,
                SHAKE_INTENSITY_PX
            );

            // Sprite is CENTERED on posY, so the BASE (bottom) is at posY + height/2
            const entityBaseY = entityPosY + BARBECUE_HEIGHT / 2;

            drawDynamicGroundShadow({
                ctx,
                entityImage,
                entityCenterX: entityPosX,
                entityBaseY: entityBaseY,
                imageDrawWidth,
                imageDrawHeight,
                cycleProgress,
                maxStretchFactor: 1.2,
                minStretchFactor: 0.1,
                shadowBlur: 2,
                pivotYOffset: 25,
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

    fallbackColor: '#663300', // Dark brown fallback
};

// Preload images
imageManager.preloadImage(barbecueImage);
imageManager.preloadImage(barbecueOnImage);

// --- Rendering Function ---
export function renderBarbecue(
    ctx: CanvasRenderingContext2D,
    barbecue: Barbecue,
    nowMs: number,
    cycleProgress: number,
    onlyDrawShadow?: boolean,
    skipDrawingShadow?: boolean,
    playerX?: number,
    playerY?: number
) {
    renderConfiguredGroundEntity({
        ctx,
        entity: barbecue,
        config: barbecueConfig,
        nowMs,
        entityPosX: barbecue.posX,
        entityPosY: barbecue.posY,
        cycleProgress,
        onlyDrawShadow,
        skipDrawingShadow
    });
    
    // Render health bar using unified system (barbecue is centered on posY)
    if (!onlyDrawShadow && playerX !== undefined && playerY !== undefined) {
        renderEntityHealthBar(ctx, barbecue, BARBECUE_WIDTH, BARBECUE_HEIGHT, nowMs, playerX, playerY, BARBECUE_HEIGHT / 2);
    }
}
