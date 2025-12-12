import { Barbecue } from '../../generated'; // Import generated Barbecue type
import barbecueImage from '../../assets/doodads/barbecue.png'; // Direct import OFF state
import barbecueOnImage from '../../assets/doodads/barbecue_on.png'; // Direct import ON state
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer'; // Import generic renderer
import { drawDynamicGroundShadow, applyStandardDropShadow, calculateShakeOffsets } from './shadowUtils';
import { imageManager } from './imageManager'; // Import image manager
import { Barbecue as SpacetimeDBBarbecue, Player as SpacetimeDBPlayer } from '../../generated';

// --- Constants directly used by this module or exported ---
export const BARBECUE_WIDTH = 128;
export const BARBECUE_HEIGHT = 128;
export const BARBECUE_WIDTH_PREVIEW = 128;
export const BARBECUE_HEIGHT_PREVIEW = 128;
export const BARBECUE_RENDER_Y_OFFSET = 16; // Visual offset from entity's base Y

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
const HEALTH_BAR_WIDTH = 70;
const HEALTH_BAR_HEIGHT = 6;
const HEALTH_BAR_Y_OFFSET = 16;
const HEALTH_BAR_VISIBLE_DURATION_MS = 3000;

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
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight / 2, // Centered - image content is centered in square
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

    drawOverlay: (ctx, entity, finalDrawX, finalDrawY, finalDrawWidth, finalDrawHeight, nowMs, baseDrawX, baseDrawY) => {
        if (entity.isDestroyed) {
            return;
        }

        const health = entity.health ?? 0;
        const maxHealth = entity.maxHealth ?? 1;

        if (health < maxHealth && entity.lastHitTime) {
            const lastHitTimeMs = Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n);
            const elapsedSinceHit = nowMs - lastHitTimeMs;

            if (elapsedSinceHit < HEALTH_BAR_VISIBLE_DURATION_MS) {
                const healthPercentage = Math.max(0, health / maxHealth);
                const barOuterX = finalDrawX + (finalDrawWidth - HEALTH_BAR_WIDTH) / 2;
                const barOuterY = finalDrawY + finalDrawHeight + HEALTH_BAR_Y_OFFSET;

                const timeSinceLastHitRatio = elapsedSinceHit / HEALTH_BAR_VISIBLE_DURATION_MS;
                const opacity = Math.max(0, 1 - Math.pow(timeSinceLastHitRatio, 2));

                ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * opacity})`;
                ctx.fillRect(barOuterX, barOuterY, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);

                const healthBarInnerWidth = HEALTH_BAR_WIDTH * healthPercentage;
                const r = Math.floor(255 * (1 - healthPercentage));
                const g = Math.floor(255 * healthPercentage);
                ctx.fillStyle = `rgba(${r}, ${g}, 0, ${opacity})`;
                ctx.fillRect(barOuterX, barOuterY, healthBarInnerWidth, HEALTH_BAR_HEIGHT);

                ctx.strokeStyle = `rgba(0, 0, 0, ${0.7 * opacity})`;
                ctx.lineWidth = 1;
                ctx.strokeRect(barOuterX, barOuterY, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT);
            }
        }
    },

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
    skipDrawingShadow?: boolean
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
}
