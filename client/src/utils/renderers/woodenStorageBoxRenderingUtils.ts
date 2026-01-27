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
import mineCartImage from '../../assets/doodads/mine_cart.png'; // Mine cart image (quarry-exclusive)
import fishTrapImage from '../../assets/doodads/fish_trap.png'; // Fish trap image (shore-only)
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
export const REPAIR_BENCH_WIDTH = 256;
export const REPAIR_BENCH_HEIGHT = 256;
export const COOKING_STATION_WIDTH = 128;
export const COOKING_STATION_HEIGHT = 128;
export const SCARECROW_WIDTH = 128;  // Scarecrow dimensions - tall figure
export const SCARECROW_HEIGHT = 128;
export const MILITARY_RATION_WIDTH = 64;  // Military ration dimensions
export const MILITARY_RATION_HEIGHT = 64;
export const MINE_CART_WIDTH = 192;  // Mine cart dimensions (quarry-exclusive) - 3x larger for visibility
export const MINE_CART_HEIGHT = 192;
export const FISH_TRAP_WIDTH = 96;  // Fish trap dimensions
export const FISH_TRAP_HEIGHT = 96;

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
export const BOX_TYPE_MINE_CART = 9;
export const BOX_TYPE_FISH_TRAP = 10;
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
            case BOX_TYPE_MINE_CART:
                return mineCartImage;
            case BOX_TYPE_FISH_TRAP:
                return fishTrapImage;
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
            case BOX_TYPE_MINE_CART:
                return { width: MINE_CART_WIDTH, height: MINE_CART_HEIGHT };
            case BOX_TYPE_FISH_TRAP:
                return { width: FISH_TRAP_WIDTH, height: FISH_TRAP_HEIGHT };
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
        case BOX_TYPE_MILITARY_RATION:
            return { width: MILITARY_RATION_WIDTH, height: MILITARY_RATION_HEIGHT };
        case BOX_TYPE_MINE_CART:
            return { width: MINE_CART_WIDTH, height: MINE_CART_HEIGHT };
        case BOX_TYPE_FISH_TRAP:
            return { width: FISH_TRAP_WIDTH, height: FISH_TRAP_HEIGHT };
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
imageManager.preloadImage(fishTrapImage);

// === FISH TRAP WATER EFFECTS CONFIGURATION ===
const FISH_TRAP_WATER_CONFIG = {
    // Water line position (fraction of sprite height from top)
    // Fish traps sit lower in the water than barrels since they're designed for fishing
    WATER_LINE_OFFSET: 0.60, // 60% down from top = trap sits mostly in water
    // Wave animation for water line
    WAVE_AMPLITUDE: 1.2, // Gentle wave movement
    WAVE_FREQUENCY: 0.003, // Slow wave frequency
    WAVE_SECONDARY_AMPLITUDE: 0.6,
    WAVE_SECONDARY_FREQUENCY: 0.005,
    // Swaying animation (very gentle for a trap anchored to shore)
    SWAY_AMPLITUDE: 0.008, // Minimal rotation (radians) - about 0.46 degrees
    SWAY_FREQUENCY: 0.0006, // Slow, peaceful swaying
    SWAY_SECONDARY_FREQUENCY: 0.001, // Secondary sway for organic feel
    // Bobbing animation (vertical)
    BOB_AMPLITUDE: 1.2, // Slight vertical bob in pixels
    BOB_FREQUENCY: 0.0012, // Slow bob
    // Underwater tint
    UNDERWATER_TINT_COLOR: { r: 12, g: 62, b: 79 },
    UNDERWATER_TINT_INTENSITY: 0.30,
};

// Cached offscreen canvas for fish trap tinting (reused to avoid allocations)
let fishTrapOffscreenCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let fishTrapOffscreenCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getFishTrapOffscreenCanvas(width: number, height: number): { canvas: OffscreenCanvas | HTMLCanvasElement, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
    if (!fishTrapOffscreenCanvas || fishTrapOffscreenCanvas.width < width || fishTrapOffscreenCanvas.height < height) {
        try {
            fishTrapOffscreenCanvas = new OffscreenCanvas(width, height);
        } catch {
            fishTrapOffscreenCanvas = document.createElement('canvas');
            fishTrapOffscreenCanvas.width = width;
            fishTrapOffscreenCanvas.height = height;
        }
        fishTrapOffscreenCtx = fishTrapOffscreenCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    }
    return { canvas: fishTrapOffscreenCanvas, ctx: fishTrapOffscreenCtx! };
}

/**
 * Renders a fish trap with water effects (water line, underwater tinting, gentle swaying/bobbing)
 * Fish traps are always on shore, so they always get water effects
 */
function renderFishTrapWithWaterEffects(
    ctx: CanvasRenderingContext2D,
    box: WoodenStorageBox,
    nowMs: number,
    cycleProgress: number,
    playerX?: number,
    playerY?: number
): void {
    // Don't render if destroyed
    if (box.isDestroyed) return;
    
    const img = imageManager.getImage(fishTrapImage);
    
    if (!img || !img.complete || img.naturalWidth === 0) {
        // Fallback color
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(box.posX - 32, box.posY - 64, 64, 64);
        return;
    }
    
    // Get dimensions
    const drawWidth = FISH_TRAP_WIDTH;
    const drawHeight = FISH_TRAP_HEIGHT;
    const yOffset = 20; // Standard box Y offset
    
    // Calculate sway animation (very gentle rotation for anchored trap)
    const swayPrimary = Math.sin(nowMs * FISH_TRAP_WATER_CONFIG.SWAY_FREQUENCY + box.posX * 0.01) 
        * FISH_TRAP_WATER_CONFIG.SWAY_AMPLITUDE;
    const swaySecondary = Math.sin(nowMs * FISH_TRAP_WATER_CONFIG.SWAY_SECONDARY_FREQUENCY + box.posY * 0.01 + Math.PI * 0.5) 
        * FISH_TRAP_WATER_CONFIG.SWAY_AMPLITUDE * 0.5;
    const totalSway = swayPrimary + swaySecondary;
    
    // Calculate bob animation (vertical movement)
    const bobOffset = Math.sin(nowMs * FISH_TRAP_WATER_CONFIG.BOB_FREQUENCY + box.posX * 0.02) 
        * FISH_TRAP_WATER_CONFIG.BOB_AMPLITUDE;
    
    // Base position
    const baseX = box.posX;
    const baseY = box.posY + bobOffset;
    const drawX = baseX - drawWidth / 2;
    const drawY = baseY - drawHeight - yOffset;
    
    // Calculate water line position (in local sprite coordinates)
    const waterLineLocalY = drawHeight * FISH_TRAP_WATER_CONFIG.WATER_LINE_OFFSET;
    const waterLineWorldY = drawY + waterLineLocalY;
    
    // Wave calculation helper
    const getWaveOffset = (x: number) => {
        return Math.sin(nowMs * FISH_TRAP_WATER_CONFIG.WAVE_FREQUENCY + x * 0.02) 
            * FISH_TRAP_WATER_CONFIG.WAVE_AMPLITUDE
            + Math.sin(nowMs * FISH_TRAP_WATER_CONFIG.WAVE_SECONDARY_FREQUENCY + x * 0.03 + Math.PI * 0.3) 
            * FISH_TRAP_WATER_CONFIG.WAVE_SECONDARY_AMPLITUDE;
    };
    
    // --- Create tinted underwater version on offscreen canvas ---
    const { canvas: offscreen, ctx: offCtx } = getFishTrapOffscreenCanvas(drawWidth + 4, drawHeight + 4);
    offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
    
    // Draw fish trap to offscreen
    offCtx.drawImage(img, 2, 2, drawWidth, drawHeight);
    
    // Apply tint using source-atop (only affects existing non-transparent pixels)
    offCtx.globalCompositeOperation = 'source-atop';
    const { r, g, b } = FISH_TRAP_WATER_CONFIG.UNDERWATER_TINT_COLOR;
    const tintIntensity = FISH_TRAP_WATER_CONFIG.UNDERWATER_TINT_INTENSITY;
    offCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${tintIntensity})`;
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    
    // Darken slightly
    offCtx.fillStyle = `rgba(0, 20, 40, 0.15)`;
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    
    offCtx.globalCompositeOperation = 'source-over';
    
    ctx.save();
    
    // Apply rotation around the bottom center of the trap (pivot point)
    const pivotX = baseX;
    const pivotY = baseY;
    ctx.translate(pivotX, pivotY);
    ctx.rotate(totalSway);
    ctx.translate(-pivotX, -pivotY);
    
    const waveSegments = 12;
    const segmentWidth = drawWidth / waveSegments;
    
    // --- Draw underwater portion (tinted) ---
    ctx.save();
    ctx.beginPath();
    
    // Create wavy clip path for underwater portion
    ctx.moveTo(drawX - 5, baseY + 50);
    ctx.lineTo(drawX - 5, waterLineWorldY);
    
    for (let i = 0; i <= waveSegments; i++) {
        const segX = drawX + i * segmentWidth;
        ctx.lineTo(segX, waterLineWorldY + getWaveOffset(segX));
    }
    
    ctx.lineTo(drawX + drawWidth + 5, baseY + 50);
    ctx.closePath();
    ctx.clip();
    
    // Draw tinted trap from offscreen canvas
    ctx.drawImage(offscreen, drawX - 2, drawY - 2);
    ctx.restore();
    
    // --- Draw above-water portion (normal) ---
    ctx.save();
    ctx.beginPath();
    
    // Clip to top portion with inverse wave
    ctx.moveTo(drawX - 5, drawY - 5);
    ctx.lineTo(drawX + drawWidth + 5, drawY - 5);
    ctx.lineTo(drawX + drawWidth + 5, waterLineWorldY);
    
    for (let i = waveSegments; i >= 0; i--) {
        const segX = drawX + i * segmentWidth;
        ctx.lineTo(segX, waterLineWorldY + getWaveOffset(segX));
    }
    
    ctx.closePath();
    ctx.clip();
    
    // Draw normal fish trap
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
    
    // --- Draw water line ---
    ctx.strokeStyle = 'rgba(150, 180, 200, 0.45)';
    ctx.lineWidth = 1.0;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    const lineStartX = drawX + drawWidth * 0.15;
    const lineEndX = drawX + drawWidth * 0.85;
    const lineSegments = 8;
    const lineSegmentWidth = (lineEndX - lineStartX) / lineSegments;
    
    for (let i = 0; i <= lineSegments; i++) {
        const segX = lineStartX + i * lineSegmentWidth;
        const waveOffset = getWaveOffset(segX);
        
        if (i === 0) {
            ctx.moveTo(segX, waterLineWorldY + waveOffset);
        } else {
            ctx.lineTo(segX, waterLineWorldY + waveOffset);
        }
    }
    ctx.stroke();
    
    ctx.restore(); // Restore from rotation transform
    
    // Render health bar for fish trap
    if (playerX !== undefined && playerY !== undefined) {
        renderEntityHealthBar(ctx, box, drawWidth, drawHeight, nowMs, playerX, playerY, -yOffset);
    }
}

// --- Rendering Function (Refactored) ---
export function renderWoodenStorageBox(
    ctx: CanvasRenderingContext2D, 
    box: WoodenStorageBox, 
    nowMs: number, 
    cycleProgress: number,
    playerX?: number,
    playerY?: number
) {
    // Fish traps get special water effects rendering (always on shore/in water)
    if (box.boxType === BOX_TYPE_FISH_TRAP && !box.isDestroyed) {
        renderFishTrapWithWaterEffects(ctx, box, nowMs, cycleProgress, playerX, playerY);
        return;
    }
    
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