import { RainCollector } from '../../generated';
import reedRainCollectorImage from '../../assets/doodads/reed_rain_collector.png';
import alkWaterReservoirImage from '../../assets/doodads/alk_water_reservoir.png';
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';
import { renderEntityHealthBar } from './healthBarUtils';

// --- Constants ---
export const RAIN_COLLECTOR_WIDTH = 256;  // 256x256 sprite (matches beehive)
export const RAIN_COLLECTOR_HEIGHT = 256;
export const PLAYER_RAIN_COLLECTOR_INTERACTION_DISTANCE_SQUARED = 200.0 * 200.0; // Larger range for big 256x256 sprite

// Monument rain collector constants (matches compound building size - same as monument large furnace)
export const MONUMENT_RAIN_COLLECTOR_WIDTH = 480;
export const MONUMENT_RAIN_COLLECTOR_HEIGHT = 480;
export const MONUMENT_RAIN_COLLECTOR_RENDER_Y_OFFSET = 0; // Visual offset from entity's base Y
export const PLAYER_MONUMENT_RAIN_COLLECTOR_INTERACTION_DISTANCE_SQUARED = 250.0 * 250.0; // Matches server

const SHAKE_DURATION_MS = 150;
const SHAKE_INTENSITY_PX = 10; // Match box shake intensity

// --- Client-side animation tracking for rain collector shakes ---
const clientRainCollectorShakeStartTimes = new Map<string, number>(); // rainCollectorId -> client timestamp when shake started
const lastKnownServerRainCollectorShakeTimes = new Map<string, number>();

const rainCollectorConfig: GroundEntityConfig<RainCollector> = {
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null;
        }
        // Monument rain collectors use the ALK water reservoir graphic
        return entity.isMonument ? alkWaterReservoirImage : reedRainCollectorImage;
    },

    getTargetDimensions: (img, entity) => {
        if (entity.isMonument) {
            return {
                width: MONUMENT_RAIN_COLLECTOR_WIDTH,
                height: MONUMENT_RAIN_COLLECTOR_HEIGHT,
            };
        }
        return {
            width: RAIN_COLLECTOR_WIDTH,
            height: RAIN_COLLECTOR_HEIGHT,
        };
    },

    calculateDrawPosition: (entity, drawWidth, drawHeight) => {
        if (entity.isMonument) {
            // Monument: bottom-anchored at posY with large 480x480 sprite
            return {
                drawX: entity.posX - drawWidth / 2,
                drawY: entity.posY - drawHeight + 96, // anchorYOffset matches compound buildings (96px)
            };
        }
        return {
            drawX: entity.posX - drawWidth / 2,
            drawY: entity.posY - drawHeight + 36, // Bottom-anchored, adjusted so stone base is at ground level
        };
    },

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
                entityBaseY: entityPosY, // Bottom-anchored (same as beehive)
                imageDrawWidth,
                imageDrawHeight,
                cycleProgress,
                baseShadowColor: '0,0,0',
                maxShadowAlpha: 0.4,
                shadowBlur: 2,
                maxStretchFactor: 1.2,
                minStretchFactor: 0.1,
                pivotYOffset: 35, // Adjusted for taller 256x256 sprite
                // Pass shake offsets so shadow moves with the rain collector
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

// Preload both rain collector images
imageManager.preloadImage(reedRainCollectorImage);
imageManager.preloadImage(alkWaterReservoirImage);

/** Helper to get dimensions/offsets for a rain collector based on monument status */
export function getRainCollectorDimensions(rainCollector: RainCollector): { width: number; height: number; yOffset: number } {
    if (rainCollector.isMonument) {
        return {
            width: MONUMENT_RAIN_COLLECTOR_WIDTH,
            height: MONUMENT_RAIN_COLLECTOR_HEIGHT,
            yOffset: MONUMENT_RAIN_COLLECTOR_RENDER_Y_OFFSET,
        };
    }
    return {
        width: RAIN_COLLECTOR_WIDTH,
        height: RAIN_COLLECTOR_HEIGHT,
        yOffset: 0,
    };
}

// --- Rendering Function ---
export function renderRainCollector(
    ctx: CanvasRenderingContext2D, 
    rainCollector: RainCollector, 
    nowMs: number, 
    cycleProgress: number,
    playerX?: number,
    playerY?: number,
    localPlayerPosition?: { x: number; y: number }
) {
    // Monument rain collectors support occlusion transparency (same as monument large furnace)
    let needsAlphaRestore = false;
    if (rainCollector.isMonument && localPlayerPosition) {
        const dims = getRainCollectorDimensions(rainCollector);
        const drawY = rainCollector.posY - dims.height + 96; // matches calculateDrawPosition for monument
        const entityTopY = drawY;
        const entityBottomY = rainCollector.posY + 96; // base of sprite
        const entityCenterX = rainCollector.posX;
        const halfWidth = dims.width / 2;

        // Check if player is behind (above) the entity and within its horizontal bounds
        if (localPlayerPosition.y < entityBottomY - 20 &&
            localPlayerPosition.y > entityTopY &&
            localPlayerPosition.x > entityCenterX - halfWidth &&
            localPlayerPosition.x < entityCenterX + halfWidth) {
            const fadeRange = entityBottomY - entityTopY;
            const playerRelativePos = (entityBottomY - 20 - localPlayerPosition.y) / fadeRange;
            const alpha = 0.3 + 0.7 * (1.0 - Math.min(1.0, playerRelativePos));
            ctx.save();
            ctx.globalAlpha = alpha;
            needsAlphaRestore = true;
        }
    }

    renderConfiguredGroundEntity({
        ctx,
        entity: rainCollector,
        config: rainCollectorConfig,
        nowMs,
        entityPosX: rainCollector.posX,
        entityPosY: rainCollector.posY,
        cycleProgress,
    });

    if (needsAlphaRestore) {
        ctx.restore();
    }
    
    // Render health bar using unified system (bottom-anchored positioning)
    if (playerX !== undefined && playerY !== undefined) {
        if (rainCollector.isMonument) {
            // Monument: 480x480 sprite with 96px anchor offset
            renderEntityHealthBar(ctx, rainCollector, MONUMENT_RAIN_COLLECTOR_WIDTH, MONUMENT_RAIN_COLLECTOR_HEIGHT, nowMs, playerX, playerY, MONUMENT_RAIN_COLLECTOR_HEIGHT - 96);
        } else {
            // Regular: 256x256 sprite with 36px anchor offset
            renderEntityHealthBar(ctx, rainCollector, RAIN_COLLECTOR_WIDTH, RAIN_COLLECTOR_HEIGHT, nowMs, playerX, playerY, RAIN_COLLECTOR_HEIGHT - 36);
        }
    }
} 