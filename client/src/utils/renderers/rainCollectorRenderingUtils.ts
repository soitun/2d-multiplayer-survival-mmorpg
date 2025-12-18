import { RainCollector } from '../../generated';
import reedRainCollectorImage from '../../assets/doodads/reed_rain_collector.png';
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';
import { renderEntityHealthBar } from './healthBarUtils';

// --- Constants ---
export const RAIN_COLLECTOR_WIDTH = 96;
export const RAIN_COLLECTOR_HEIGHT = 128;
export const PLAYER_RAIN_COLLECTOR_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0;
const SHAKE_DURATION_MS = 150;
const SHAKE_INTENSITY_PX = 6;

// --- Client-side animation tracking for rain collector shakes ---
const clientRainCollectorShakeStartTimes = new Map<string, number>(); // rainCollectorId -> client timestamp when shake started
const lastKnownServerRainCollectorShakeTimes = new Map<string, number>();

const rainCollectorConfig: GroundEntityConfig<RainCollector> = {
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null;
        }
        return reedRainCollectorImage;
    },

    getTargetDimensions: (img, _entity) => ({
        width: RAIN_COLLECTOR_WIDTH,
        height: RAIN_COLLECTOR_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight / 2, // Center the rain collector
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        if (!entity.isDestroyed) {
            // Calculate shake offsets for shadow synchronization using helper function
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientRainCollectorShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerRainCollectorShakeTimes
                },
                SHAKE_DURATION_MS,
                SHAKE_INTENSITY_PX
            );

            drawDynamicGroundShadow({
                ctx,
                entityImage,
                entityCenterX: entityPosX,
                entityBaseY: entityPosY + imageDrawHeight / 2, // Base at bottom of sprite
                imageDrawWidth,
                imageDrawHeight,
                cycleProgress,
                baseShadowColor: '0,0,0',
                maxShadowAlpha: 0.4,
                shadowBlur: 1,
                maxStretchFactor: 1.2,
                minStretchFactor: 0.2,
                pivotYOffset: 20,
                // NEW: Pass shake offsets so shadow moves with the rain collector
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
        return { offsetX: shakeOffsetX, offsetY: shakeOffsetY };
    },

    // Health bar rendered separately via renderEntityHealthBar
    drawOverlay: undefined,

    fallbackColor: '#2c5aa0', // Blue fallback for rain collector
};

// Preload the rain collector image
imageManager.preloadImage(reedRainCollectorImage);

// --- Rendering Function ---
export function renderRainCollector(
    ctx: CanvasRenderingContext2D, 
    rainCollector: RainCollector, 
    nowMs: number, 
    cycleProgress: number,
    playerX?: number,
    playerY?: number
) {
    renderConfiguredGroundEntity({
        ctx,
        entity: rainCollector,
        config: rainCollectorConfig,
        nowMs,
        entityPosX: rainCollector.posX,
        entityPosY: rainCollector.posY,
        cycleProgress,
    });
    
    // Render health bar using unified system (centered on posY)
    if (playerX !== undefined && playerY !== undefined) {
        renderEntityHealthBar(ctx, rainCollector, RAIN_COLLECTOR_WIDTH, RAIN_COLLECTOR_HEIGHT, nowMs, playerX, playerY, RAIN_COLLECTOR_HEIGHT / 2);
    }
} 