import { WoodenStorageBox } from '../../generated'; // Import generated type
import boxImage from '../../assets/doodads/wooden_storage_box.png'; // Direct import
import largeBoxImage from '../../assets/doodads/large_wood_box.png'; // Large box image
import refrigeratorImage from '../../assets/doodads/refrigerator.png'; // Refrigerator image
import compostImage from '../../assets/doodads/compost.png'; // Compost image
import backpackImage from '../../assets/doodads/burlap_sack.png'; // Backpack image
import repairBenchImage from '../../assets/doodads/repair_bench.png'; // Repair bench image
import cookingStationImage from '../../assets/doodads/cooking_station.png'; // Cooking station image
import scarecrowImage from '../../assets/doodads/scarecrow.png'; // Scarecrow image (deters crows)
import militaryRationImage from '../../assets/doodads/military_ration.png'; // Military ration image
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';
import { renderEntityHealthBar } from './healthBarUtils';

// --- Constants --- (Keep exportable if used elsewhere)
export const BOX_WIDTH = 64; 
export const BOX_HEIGHT = 64;
export const LARGE_BOX_WIDTH = 96;  // Larger dimensions for large box
export const LARGE_BOX_HEIGHT = 96;
export const REFRIGERATOR_WIDTH = 96;  // Refrigerator dimensions (squared)
export const REFRIGERATOR_HEIGHT = 96;
export const COMPOST_WIDTH = 128;  // Compost box dimensions (larger than normal box)
export const COMPOST_HEIGHT = 128;
export const BACKPACK_WIDTH = 64;
export const BACKPACK_HEIGHT = 64;
export const REPAIR_BENCH_WIDTH = 128;
export const REPAIR_BENCH_HEIGHT = 128;
export const COOKING_STATION_WIDTH = 128;
export const COOKING_STATION_HEIGHT = 128;
export const SCARECROW_WIDTH = 128;  // Scarecrow dimensions - tall figure
export const SCARECROW_HEIGHT = 128;
export const MILITARY_RATION_WIDTH = 64;  // Military ration dimensions
export const MILITARY_RATION_HEIGHT = 64;

// Box type constants (must match server)
export const BOX_TYPE_NORMAL = 0;
export const BOX_TYPE_LARGE = 1;
export const BOX_TYPE_REFRIGERATOR = 2;
export const BOX_TYPE_COMPOST = 3;
export const BOX_TYPE_BACKPACK = 4;
export const BOX_TYPE_REPAIR_BENCH = 5;
export const BOX_TYPE_COOKING_STATION = 6;
export const BOX_TYPE_SCARECROW = 7;
export const BOX_TYPE_MILITARY_RATION = 8;
export const PLAYER_BOX_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0; // Added interaction distance
const SHAKE_DURATION_MS = 150; 
const SHAKE_INTENSITY_PX = 10; // Make boxes shake a bit more
const BOX_RENDER_Y_OFFSET = 20; // Matches calculateDrawPosition offset

// --- Client-side animation tracking for wooden storage box shakes ---
const clientBoxShakeStartTimes = new Map<string, number>(); // boxId -> client timestamp when shake started
const lastKnownServerBoxShakeTimes = new Map<string, number>();

// --- Define Configuration --- 
const boxConfig: GroundEntityConfig<WoodenStorageBox> = {
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null; // Don't render if destroyed (handled by drawOverlay)
        }
        // Return different image based on box type
        switch (entity.boxType) {
            case BOX_TYPE_LARGE:
                return largeBoxImage;
            case BOX_TYPE_REFRIGERATOR:
                return refrigeratorImage;
            case BOX_TYPE_COMPOST:
                return compostImage;
            case BOX_TYPE_BACKPACK:
                return backpackImage;
            case BOX_TYPE_REPAIR_BENCH:
                return repairBenchImage;
            case BOX_TYPE_COOKING_STATION:
                return cookingStationImage;
            case BOX_TYPE_SCARECROW:
                return scarecrowImage;
            case BOX_TYPE_MILITARY_RATION:
                return militaryRationImage;
            default:
                return boxImage;
        }
    },

    getTargetDimensions: (img, entity) => {
        // Return different dimensions based on box type
        switch (entity.boxType) {
            case BOX_TYPE_LARGE:
                return { width: LARGE_BOX_WIDTH, height: LARGE_BOX_HEIGHT };
            case BOX_TYPE_REFRIGERATOR:
                return { width: REFRIGERATOR_WIDTH, height: REFRIGERATOR_HEIGHT };
            case BOX_TYPE_COMPOST:
                return { width: COMPOST_WIDTH, height: COMPOST_HEIGHT };
            case BOX_TYPE_BACKPACK:
                return { width: BACKPACK_WIDTH, height: BACKPACK_HEIGHT };
            case BOX_TYPE_REPAIR_BENCH:
                return { width: REPAIR_BENCH_WIDTH, height: REPAIR_BENCH_HEIGHT };
            case BOX_TYPE_COOKING_STATION:
                return { width: COOKING_STATION_WIDTH, height: COOKING_STATION_HEIGHT };
            case BOX_TYPE_SCARECROW:
                return { width: SCARECROW_WIDTH, height: SCARECROW_HEIGHT };
            case BOX_TYPE_MILITARY_RATION:
                return { width: MILITARY_RATION_WIDTH, height: MILITARY_RATION_HEIGHT };
            default:
                return { width: BOX_WIDTH, height: BOX_HEIGHT };
        }
    },

    calculateDrawPosition: (entity, drawWidth, drawHeight) => {
        // All box types use bottom-anchored positioning (consistent with server BOX_COLLISION_Y_OFFSET)
        return {
            drawX: entity.posX - drawWidth / 2,
            drawY: entity.posY - drawHeight - 20,
        };
    },

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Draw DYNAMIC ground shadow if not destroyed
        if (!entity.isDestroyed) {
            // Calculate shake offsets for shadow synchronization using helper function
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientBoxShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerBoxShakeTimes
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
                pivotYOffset: 35,
                // NEW: Pass shake offsets so shadow moves with the wooden storage box
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

    fallbackColor: '#A0522D', // Sienna for wooden box
};

/**
 * Get box dimensions based on type
 */
function getBoxDimensions(boxType: number): { width: number; height: number } {
    switch (boxType) {
        case BOX_TYPE_LARGE:
            return { width: LARGE_BOX_WIDTH, height: LARGE_BOX_HEIGHT };
        case BOX_TYPE_REFRIGERATOR:
            return { width: REFRIGERATOR_WIDTH, height: REFRIGERATOR_HEIGHT };
        case BOX_TYPE_COMPOST:
            return { width: COMPOST_WIDTH, height: COMPOST_HEIGHT };
        case BOX_TYPE_BACKPACK:
            return { width: BACKPACK_WIDTH, height: BACKPACK_HEIGHT };
        case BOX_TYPE_REPAIR_BENCH:
            return { width: REPAIR_BENCH_WIDTH, height: REPAIR_BENCH_HEIGHT };
        case BOX_TYPE_COOKING_STATION:
            return { width: COOKING_STATION_WIDTH, height: COOKING_STATION_HEIGHT };
        case BOX_TYPE_SCARECROW:
            return { width: SCARECROW_WIDTH, height: SCARECROW_HEIGHT };
        default:
            return { width: BOX_WIDTH, height: BOX_HEIGHT };
    }
}

// Preload using imported URLs
imageManager.preloadImage(boxImage);
imageManager.preloadImage(largeBoxImage);
imageManager.preloadImage(refrigeratorImage);
imageManager.preloadImage(compostImage);
imageManager.preloadImage(backpackImage);
imageManager.preloadImage(repairBenchImage);
imageManager.preloadImage(cookingStationImage);
imageManager.preloadImage(scarecrowImage);
imageManager.preloadImage(militaryRationImage);

// --- Rendering Function (Refactored) ---
export function renderWoodenStorageBox(
    ctx: CanvasRenderingContext2D, 
    box: WoodenStorageBox, 
    nowMs: number, 
    cycleProgress: number,
    playerX?: number,
    playerY?: number
) {
    renderConfiguredGroundEntity({
        ctx,
        entity: box,
        config: boxConfig,
        nowMs,
        entityPosX: box.posX,
        entityPosY: box.posY,
        cycleProgress,
    });
    
    // Render health bar using unified system (with type-specific dimensions)
    if (playerX !== undefined && playerY !== undefined) {
        const dims = getBoxDimensions(box.boxType);
        renderEntityHealthBar(ctx, box, dims.width, dims.height, nowMs, playerX, playerY, -BOX_RENDER_Y_OFFSET);
    }
} 