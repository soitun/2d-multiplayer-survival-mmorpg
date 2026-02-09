import { RainCollector } from '../../generated';
import reedRainCollectorImage from '../../assets/doodads/reed_rain_collector.png';
import alkWaterReservoirImage from '../../assets/doodads/alk_water_reservoir.png';
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';
import { renderEntityHealthBar } from './healthBarUtils';
import { isCompoundMonument } from '../../config/compoundBuildings';

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
        // Only compound monument rain collectors use the ALK water reservoir graphic
        return isCompoundMonument(entity.isMonument, entity.posX, entity.posY) ? alkWaterReservoirImage : reedRainCollectorImage;
    },

    getTargetDimensions: (img, entity) => {
        if (isCompoundMonument(entity.isMonument, entity.posX, entity.posY)) {
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
        if (isCompoundMonument(entity.isMonument, entity.posX, entity.posY)) {
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

/** Helper to get dimensions/offsets for a rain collector based on compound monument status */
export function getRainCollectorDimensions(rainCollector: RainCollector): { width: number; height: number; yOffset: number } {
    if (isCompoundMonument(rainCollector.isMonument, rainCollector.posX, rainCollector.posY)) {
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
    // Compound monument rain collectors support occlusion transparency (same pattern as furnace)
    // Only trigger when entity is Y-sorted IN FRONT of player (player is behind/above)
    const isCompound = isCompoundMonument(rainCollector.isMonument, rainCollector.posX, rainCollector.posY);
    let needsAlphaRestore = false;
    if (isCompound && localPlayerPosition) {
        const dims = getRainCollectorDimensions(rainCollector);
        
        // Use portion of sprite for actual building bounds
        const visualWidth = dims.width * 0.5;
        const visualHeight = dims.height * 0.7;
        
        // Dynamic threshold based on height
        const BASE_TRANSPARENCY_THRESHOLD_PERCENT = 0.25;
        const dynamicThreshold = visualHeight * BASE_TRANSPARENCY_THRESHOLD_PERCENT;
        
        // Building is drawn bottom-anchored at posY with 96px anchor offset
        const buildingLeft = rainCollector.posX - visualWidth / 2;
        const buildingRight = rainCollector.posX + visualWidth / 2;
        const buildingTop = rainCollector.posY - visualHeight + 96;
        const buildingBottom = rainCollector.posY - dynamicThreshold + 96;
        
        // Player bounding box (approximate)
        const playerSize = 48;
        const pLeft = localPlayerPosition.x - playerSize / 2;
        const pRight = localPlayerPosition.x + playerSize / 2;
        const pTop = localPlayerPosition.y - playerSize;
        const pBottom = localPlayerPosition.y;
        
        // Check if player overlaps with building visual area
        const overlapsH = pRight > buildingLeft && pLeft < buildingRight;
        const overlapsV = pBottom > buildingTop && pTop < buildingBottom;
        
        // Only apply transparency when building is IN FRONT of player (larger Y = rendered after)
        if (overlapsH && overlapsV && rainCollector.posY > localPlayerPosition.y + dynamicThreshold) {
            const depthDifference = rainCollector.posY - localPlayerPosition.y;
            const maxDepthForFade = 100;
            const MIN_ALPHA = 0.35;
            const MAX_ALPHA = 1.0;
            
            let buildingAlpha = MAX_ALPHA;
            if (depthDifference > 0 && depthDifference < maxDepthForFade) {
                const fadeFactor = 1 - (depthDifference / maxDepthForFade);
                buildingAlpha = MAX_ALPHA - (fadeFactor * (MAX_ALPHA - MIN_ALPHA));
            } else if (depthDifference >= maxDepthForFade) {
                buildingAlpha = MIN_ALPHA;
            }
            ctx.save();
            ctx.globalAlpha = Math.max(MIN_ALPHA, Math.min(MAX_ALPHA, buildingAlpha));
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
        if (isCompound) {
            // Monument: 480x480 sprite with 96px anchor offset
            renderEntityHealthBar(ctx, rainCollector, MONUMENT_RAIN_COLLECTOR_WIDTH, MONUMENT_RAIN_COLLECTOR_HEIGHT, nowMs, playerX, playerY, MONUMENT_RAIN_COLLECTOR_HEIGHT - 96);
        } else {
            // Regular: 256x256 sprite with 36px anchor offset
            renderEntityHealthBar(ctx, rainCollector, RAIN_COLLECTOR_WIDTH, RAIN_COLLECTOR_HEIGHT, nowMs, playerX, playerY, RAIN_COLLECTOR_HEIGHT - 36);
        }
    }
} 