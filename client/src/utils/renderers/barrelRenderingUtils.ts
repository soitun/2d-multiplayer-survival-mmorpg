import { Barrel } from '../../generated'; // Import generated type
import barrelImage from '../../assets/doodads/barrel.png'; // Variant 0
import barrel2Image from '../../assets/doodads/barrel2.png'; // Variant 1 
import barrel3Image from '../../assets/doodads/barrel3.png'; // Variant 2
// Sea barrel variants (flotsam/cargo crates) - variants 3, 4, 5
// TODO: Add actual sea barrel images when available
// For now, using road barrel images as placeholders
import seaBarrelImage from '../../assets/doodads/barrel4.png'; // Variant 3 (placeholder)
import seaBarrel2Image from '../../assets/doodads/barrel5.png'; // Variant 4 (placeholder)
import seaBarrel3Image from '../../assets/doodads/barrel6.png'; // Variant 5 (placeholder)
import buoyImage from '../../assets/doodads/buoy.png'; // Variant 6 (indestructible buoy)
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer'; // Import generic renderer
import { imageManager } from './imageManager'; // Import image manager

// --- Constants --- (Keep exportable if used elsewhere)
export const BARREL_WIDTH = 86; // Standard barrel size (increased from 72)
export const BARREL_HEIGHT = 86;
export const BARREL5_WIDTH = 172; // Variant 4 (barrel5.png) rendered at larger size
export const BARREL5_HEIGHT = 172;
export const BUOY_WIDTH = 192; // Variant 6 (buoy) - large navigational marker (~4x player height)
export const BUOY_HEIGHT = 192;
export const PLAYER_BARREL_INTERACTION_DISTANCE_SQUARED = 64.0 * 64.0; // Barrel interaction distance
const SHAKE_DURATION_MS = 150; 
const SHAKE_INTENSITY_PX = 4; // Subtle shake for barrels
// --- Barrel Variant Images Array ---
// Variants 0-2: Road barrels
// Variants 3-5: Sea barrels (flotsam/cargo crates)
// Variant 6: Buoy (indestructible, outer ocean)
const BARREL_VARIANT_IMAGES = [
    barrelImage,       // Variant 0 (road barrel)
    barrel2Image,      // Variant 1 (road barrel)
    barrel3Image,      // Variant 2 (road barrel)
    seaBarrelImage,    // Variant 3 (sea flotsam/cargo crate - placeholder)
    seaBarrel2Image,   // Variant 4 (sea flotsam/cargo crate - placeholder)
    seaBarrel3Image,   // Variant 5 (sea flotsam/cargo crate - placeholder)
    buoyImage,         // Variant 6 (indestructible buoy)
];

// Constants for sea barrel variants (water overlay, sway, bob)
const SEA_BARREL_VARIANT_START = 3;
const SEA_BARREL_VARIANT_END = 7; // Exclusive end (3, 4, 5, 6 - includes buoy)

// --- Client-side animation tracking for barrel shakes ---
const clientBarrelShakeStartTimes = new Map<string, number>(); // barrelId -> client timestamp when shake started
const lastKnownServerBarrelShakeTimes = new Map<string, number>();

/** Trigger barrel shake immediately (optimistic feedback) when player initiates a hit. */
export function triggerBarrelShakeOptimistic(barrelId: string): void {
  const now = Date.now();
  clientBarrelShakeStartTimes.set(barrelId, now);
}

// --- Define Configuration --- 
const barrelConfig: GroundEntityConfig<Barrel> = {
    getImageSource: (entity) => {
        // Don't render if respawning (respawnAt > 0 means barrel is destroyed)
        if (entity.respawnAt && entity.respawnAt.microsSinceUnixEpoch !== 0n) {
            return null;
        }
        
        // Select barrel variant based on entity.variant field
        // Variants 0-2: Road barrels, Variants 3-5: Sea barrels (flotsam/cargo crates)
        const variantIndex = (entity.variant ?? 0);
        if (variantIndex < BARREL_VARIANT_IMAGES.length) {
            return BARREL_VARIANT_IMAGES[variantIndex];
        }
        // Fallback to variant 0 if invalid variant
        return BARREL_VARIANT_IMAGES[0];
    },

    getTargetDimensions: (img, entity) => {
        const variantIndex = Number(entity.variant ?? 0);
        if (variantIndex === 4) {
            return { width: BARREL5_WIDTH, height: BARREL5_HEIGHT };
        }
        if (variantIndex === 6) {
            return { width: BUOY_WIDTH, height: BUOY_HEIGHT };
        }
        return {
            width: BARREL_WIDTH,
            height: BARREL_HEIGHT,
        };
    },

    calculateDrawPosition: (entity, drawWidth, drawHeight) => {
        const variantIndex = Number(entity.variant ?? 0);
        const yOffset = variantIndex === 4 ? 24 : variantIndex === 6 ? 28 : 12; // Buoy (6) 192px, large barrel (4)
        return {
            drawX: entity.posX - drawWidth / 2,
            drawY: entity.posY - drawHeight - yOffset, // Slight Y adjustment for centering
        };
    },

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Draw DYNAMIC ground shadow if not destroyed/respawning
        // Uses same offset/scale/rotate as swimming player shadow (offset right+down, scaled, angled)
        if (!entity.respawnAt || entity.respawnAt.microsSinceUnixEpoch === 0n) {
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientBarrelShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerBarrelShakeTimes
                },
                SHAKE_DURATION_MS,
                SHAKE_INTENSITY_PX,
                undefined,
                { suppressRestartIfRecentClientShake: false } // Always restart on new hit so subsequent hits shake
            );

            const variantIndex = Number(entity.variant ?? 0);
            const yOffset = variantIndex === 4 ? 24 : variantIndex === 6 ? 28 : 12;
            const centerY = entityPosY - imageDrawHeight / 2 - yOffset;
            const shadowOffsetX = imageDrawWidth * 0.28;
            const shadowOffsetY = imageDrawHeight * 0.9;
            const shadowX = entityPosX + shadowOffsetX;
            const shadowY = centerY + shadowOffsetY;

            ctx.save();
            ctx.translate(shadowX, shadowY);
            ctx.scale(0.85, 0.75);
            ctx.rotate(Math.PI / 6);
            ctx.translate(-shadowX, -shadowY);

            drawDynamicGroundShadow({
                ctx,
                entityImage,
                entityCenterX: shadowX,
                entityBaseY: shadowY,
                imageDrawWidth,
                imageDrawHeight,
                cycleProgress,
                maxStretchFactor: 1.1,
                minStretchFactor: 0.15,
                shadowBlur: 2,
                pivotYOffset: 0,
                shakeOffsetX,
                shakeOffsetY,
            });
            ctx.restore();
        }
    },

    applyEffects: (ctx, entity, nowMs, baseDrawX, baseDrawY, cycleProgress) => {
        // Dynamic shadow is now handled in drawCustomGroundShadow
        // Use calculateShakeOffsets so shake starts from client detection time (not server time)
        // This ensures full shake on each hit regardless of network latency
        if (!entity.respawnAt || entity.respawnAt.microsSinceUnixEpoch === 0n) {
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientBarrelShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerBarrelShakeTimes
                },
                SHAKE_DURATION_MS,
                SHAKE_INTENSITY_PX,
                undefined,
                { suppressRestartIfRecentClientShake: false } // Always restart on new hit so subsequent hits shake
            );
            return { offsetX: shakeOffsetX, offsetY: shakeOffsetY };
        }
        return { offsetX: 0, offsetY: 0 };
    },

    drawOverlay: undefined,

    fallbackColor: '#8B4513', // Saddle brown for wooden barrel
};

// Preload all barrel variant images
BARREL_VARIANT_IMAGES.forEach(barrelImg => {
    imageManager.preloadImage(barrelImg);
});

// === SEA BARREL WATER EFFECTS CONFIGURATION ===
const SEA_BARREL_WATER_CONFIG = {
    // Water line position (fraction of sprite height from top)
    WATER_LINE_OFFSET: 0.55, // 55% down from top = barrel sits about halfway in water
    // Wave animation for water line
    WAVE_AMPLITUDE: 1.5, // Gentle wave movement
    WAVE_FREQUENCY: 0.003, // Slow wave frequency
    WAVE_SECONDARY_AMPLITUDE: 0.8,
    WAVE_SECONDARY_FREQUENCY: 0.005,
    // Swaying animation
    SWAY_AMPLITUDE: 0.015, // Very gentle rotation (radians) - about 0.86 degrees
    SWAY_FREQUENCY: 0.0008, // Slow, peaceful swaying
    SWAY_SECONDARY_FREQUENCY: 0.0012, // Secondary sway for organic feel
    // Bobbing animation (vertical)
    BOB_AMPLITUDE: 1.5, // Slight vertical bob in pixels
    BOB_FREQUENCY: 0.0015, // Slow bob
    // Underwater tint
    UNDERWATER_TINT_COLOR: { r: 12, g: 62, b: 79 },
    UNDERWATER_TINT_INTENSITY: 0.35,
};

/**
 * Checks if a barrel variant is a sea barrel
 */
function isSeaBarrelVariant(variantIndex: number): boolean {
    return variantIndex >= SEA_BARREL_VARIANT_START && variantIndex < SEA_BARREL_VARIANT_END;
}

// Cached offscreen canvas for barrel tinting (reused to avoid allocations)
let barrelOffscreenCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let barrelOffscreenCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getBarrelOffscreenCanvas(width: number, height: number): { canvas: OffscreenCanvas | HTMLCanvasElement, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
    if (!barrelOffscreenCanvas || barrelOffscreenCanvas.width < width || barrelOffscreenCanvas.height < height) {
        // Release GPU memory from old canvas before creating new one
        if (barrelOffscreenCanvas) { barrelOffscreenCanvas.width = 0; barrelOffscreenCanvas.height = 0; }
        try {
            barrelOffscreenCanvas = new OffscreenCanvas(width, height);
        } catch {
            barrelOffscreenCanvas = document.createElement('canvas');
            barrelOffscreenCanvas.width = width;
            barrelOffscreenCanvas.height = height;
        }
        barrelOffscreenCtx = barrelOffscreenCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    }
    return { canvas: barrelOffscreenCanvas, ctx: barrelOffscreenCtx! };
}

/**
 * Renders a sea barrel with water effects (water line, underwater tinting, swaying)
 * Uses offscreen canvas and proper compositing to respect PNG transparency
 */
function renderSeaBarrelWithWaterEffects(
    ctx: CanvasRenderingContext2D,
    barrel: Barrel,
    nowMs: number,
    cycleProgress: number
): void {
    // Don't render if barrel is respawning (destroyed)
    if (barrel.respawnAt && barrel.respawnAt.microsSinceUnixEpoch !== 0n) return;
    
    const variantIndex = Number(barrel.variant ?? 0);
    const imageSource = BARREL_VARIANT_IMAGES[variantIndex] || BARREL_VARIANT_IMAGES[0];
    const img = imageManager.getImage(imageSource);
    
    if (!img || !img.complete || img.naturalWidth === 0) {
        // Fallback color
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(barrel.posX - 20, barrel.posY - 40, 40, 40);
        return;
    }
    
    // Get dimensions - variant 4 (large barrel) 172x172, variant 6 (buoy) 144x144
    const drawWidth = variantIndex === 4 ? BARREL5_WIDTH : variantIndex === 6 ? BUOY_WIDTH : BARREL_WIDTH;
    const drawHeight = variantIndex === 4 ? BARREL5_HEIGHT : variantIndex === 6 ? BUOY_HEIGHT : BARREL_HEIGHT;
    const yOffset = variantIndex === 4 ? 24 : variantIndex === 6 ? 28 : 12;
    
    // Calculate sway animation (gentle rotation)
    const swayPrimary = Math.sin(nowMs * SEA_BARREL_WATER_CONFIG.SWAY_FREQUENCY + barrel.posX * 0.01) 
        * SEA_BARREL_WATER_CONFIG.SWAY_AMPLITUDE;
    const swaySecondary = Math.sin(nowMs * SEA_BARREL_WATER_CONFIG.SWAY_SECONDARY_FREQUENCY + barrel.posY * 0.01 + Math.PI * 0.5) 
        * SEA_BARREL_WATER_CONFIG.SWAY_AMPLITUDE * 0.5;
    const totalSway = swayPrimary + swaySecondary;
    
    // Calculate bob animation (vertical movement)
    const bobOffset = Math.sin(nowMs * SEA_BARREL_WATER_CONFIG.BOB_FREQUENCY + barrel.posX * 0.02) 
        * SEA_BARREL_WATER_CONFIG.BOB_AMPLITUDE;
    
    // Base position
    const baseX = barrel.posX;
    const baseY = barrel.posY + bobOffset;
    const drawX = baseX - drawWidth / 2;
    const drawY = baseY - drawHeight - yOffset;
    
    // --- Draw dynamic ground shadow (on water surface) - same offset/scale/rotate as swimming player ---
    const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
        barrel,
        barrel.id.toString(),
        {
            clientStartTimes: clientBarrelShakeStartTimes,
            lastKnownServerTimes: lastKnownServerBarrelShakeTimes
        },
        SHAKE_DURATION_MS,
        SHAKE_INTENSITY_PX,
        undefined,
        { suppressRestartIfRecentClientShake: false } // Always restart on new hit so subsequent hits shake
    );
    const centerY = barrel.posY - drawHeight / 2 - yOffset;
    const shadowOffsetX = drawWidth * 0.28;
    const shadowOffsetY = drawHeight * 0.9;
    const shadowX = baseX + shadowOffsetX;
    const shadowY = centerY + shadowOffsetY;

    ctx.save();
    ctx.translate(shadowX, shadowY);
    ctx.scale(0.85, 0.75);
    ctx.rotate(Math.PI / 6);
    ctx.translate(-shadowX, -shadowY);

    drawDynamicGroundShadow({
        ctx,
        entityImage: img,
        entityCenterX: shadowX,
        entityBaseY: shadowY,
        imageDrawWidth: drawWidth,
        imageDrawHeight: drawHeight,
        cycleProgress: 0.5, // Fixed noon like swimming (underwater shadow)
        baseShadowColor: '6, 30, 38',
        maxShadowAlpha: 0.75,
        maxStretchFactor: 1.0,
        minStretchFactor: 0.9,
        shadowBlur: 2,
        pivotYOffset: 0,
        shakeOffsetX,
        shakeOffsetY,
    });
    ctx.restore();
    
    // Calculate water line position (in local sprite coordinates)
    const waterLineLocalY = drawHeight * SEA_BARREL_WATER_CONFIG.WATER_LINE_OFFSET;
    const waterLineWorldY = drawY + waterLineLocalY;
    
    // Wave calculation helper
    const getWaveOffset = (x: number) => {
        return Math.sin(nowMs * SEA_BARREL_WATER_CONFIG.WAVE_FREQUENCY + x * 0.02) 
            * SEA_BARREL_WATER_CONFIG.WAVE_AMPLITUDE
            + Math.sin(nowMs * SEA_BARREL_WATER_CONFIG.WAVE_SECONDARY_FREQUENCY + x * 0.03 + Math.PI * 0.3) 
            * SEA_BARREL_WATER_CONFIG.WAVE_SECONDARY_AMPLITUDE;
    };
    
    // --- Create tinted underwater version on offscreen canvas ---
    const { canvas: offscreen, ctx: offCtx } = getBarrelOffscreenCanvas(drawWidth + 4, drawHeight + 4);
    offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
    
    // Draw barrel to offscreen
    offCtx.drawImage(img, 2, 2, drawWidth, drawHeight);
    
    // Apply tint using source-atop (only affects existing non-transparent pixels)
    offCtx.globalCompositeOperation = 'source-atop';
    const { r, g, b } = SEA_BARREL_WATER_CONFIG.UNDERWATER_TINT_COLOR;
    const tintIntensity = SEA_BARREL_WATER_CONFIG.UNDERWATER_TINT_INTENSITY;
    // Create a color that when multiplied gives the teal tint effect
    offCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${tintIntensity})`;
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    
    // Darken slightly
    offCtx.fillStyle = `rgba(0, 20, 40, 0.2)`;
    offCtx.fillRect(0, 0, offscreen.width, offscreen.height);
    
    offCtx.globalCompositeOperation = 'source-over';
    
    ctx.save();
    
    // Apply rotation around the bottom center of the barrel (pivot point)
    const pivotX = baseX;
    const pivotY = baseY;
    ctx.translate(pivotX, pivotY);
    ctx.rotate(totalSway);
    ctx.translate(-pivotX, -pivotY);
    
    const waveSegments = 16;
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
    
    // Draw tinted barrel from offscreen canvas
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
    
    // Draw normal barrel
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
    
    // --- Draw water line ---
    ctx.strokeStyle = 'rgba(150, 180, 200, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    const lineStartX = drawX + drawWidth * 0.2;
    const lineEndX = drawX + drawWidth * 0.8;
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
}

// --- Rendering Function (Refactored) ---
/**
 * Renders a barrel with appropriate effects based on variant and location.
 * @param ctx - Canvas rendering context
 * @param barrel - The barrel entity to render
 * @param nowMs - Current time in milliseconds
 * @param cycleProgress - Day/night cycle progress (0-1)
 * @param isOnSeaTile - Optional callback to check if barrel position is on a sea tile.
 *                      If not provided, defaults to assuming sea variants are on sea tiles.
 * @param playerX - Player X position for health bar positioning (opposite side from player)
 * @param playerY - Player Y position for health bar positioning
 */
export function renderBarrel(
    ctx: CanvasRenderingContext2D, 
    barrel: Barrel, 
    nowMs: number, 
    cycleProgress: number,
    isOnSeaTile?: (worldX: number, worldY: number) => boolean,
    playerX?: number,
    playerY?: number
) {
    const variantIndex = Number(barrel.variant ?? 0);
    
    // Sea barrels get special water effects rendering ONLY if actually on a sea tile
    // If isOnSeaTile callback is provided, use it to verify the barrel is on water
    // If not provided, fall back to variant-only check for backwards compatibility
    const isSeaVariant = isSeaBarrelVariant(variantIndex);
    const actuallyOnSea = isOnSeaTile ? isOnSeaTile(barrel.posX, barrel.posY) : isSeaVariant;
    
    if (isSeaVariant && actuallyOnSea && (!barrel.respawnAt || barrel.respawnAt.microsSinceUnixEpoch === 0n)) {
        // Sea barrel rendering includes health bar
        renderSeaBarrelWithWaterEffects(ctx, barrel, nowMs, cycleProgress);
        return;
    }
    
    // Normal barrel rendering for road barrels OR sea barrels that washed up on land
    renderConfiguredGroundEntity({
        ctx,
        entity: barrel,
        config: barrelConfig,
        nowMs,
        entityPosX: barrel.posX,
        entityPosY: barrel.posY,
        cycleProgress,
    });
}

// === UNDERWATER SNORKELING MODE ===
// Constants for underwater silhouette rendering
// Must match values in clientCollision.ts for accurate collision representation
const UNDERWATER_BARREL_CONFIG = {
    // Base radius matches COLLISION_RADII.BARREL in clientCollision.ts
    BASE_RADIUS: 25,
    // Y offset matches COLLISION_OFFSETS.BARREL.y in clientCollision.ts
    Y_OFFSET: 48,
    // Feather amount (soft edge gradient)
    FEATHER_RATIO: 0.4, // 40% of radius is feathered
    // Colors for underwater effect
    INNER_COLOR: 'rgba(10, 50, 70, 0.85)', // Dark teal center
    OUTER_COLOR: 'rgba(10, 50, 70, 0)', // Transparent edge
};

/**
 * Renders a barrel as an underwater silhouette (feathered dark blue circle)
 * Used when player is snorkeling - shows where obstacles are from underwater perspective
 * Only renders for sea barrel variants (3, 4, 5)
 * Includes sway and bob animation to match the barrel's above-water movement
 */
export function renderBarrelUnderwaterSilhouette(
    ctx: CanvasRenderingContext2D,
    barrel: Barrel,
    cycleProgress: number = 0.5,
    nowMs: number = Date.now()
): void {
    const variantIndex = Number(barrel.variant ?? 0);
    
    // Only render silhouette for sea barrels (variants 3, 4, 5)
    if (variantIndex < SEA_BARREL_VARIANT_START || variantIndex >= SEA_BARREL_VARIANT_END) {
        return;
    }
    
    // Variant 4 (barrel5.png) 2x, variant 6 (buoy) 144/86 ≈ 1.67
    const scaleFactor = variantIndex === 4 ? 2 : variantIndex === 6 ? BUOY_WIDTH / BARREL_WIDTH : 1;
    
    // Calculate radius to match actual collision system
    const radius = UNDERWATER_BARREL_CONFIG.BASE_RADIUS * scaleFactor;
    const featherRadius = radius * (1 + UNDERWATER_BARREL_CONFIG.FEATHER_RATIO);
    
    // Calculate sway animation (same as barrel rendering)
    const swayPrimary = Math.sin(nowMs * SEA_BARREL_WATER_CONFIG.SWAY_FREQUENCY + barrel.posX * 0.01) 
        * SEA_BARREL_WATER_CONFIG.SWAY_AMPLITUDE;
    const swaySecondary = Math.sin(nowMs * SEA_BARREL_WATER_CONFIG.SWAY_SECONDARY_FREQUENCY + barrel.posY * 0.01 + Math.PI * 0.5) 
        * SEA_BARREL_WATER_CONFIG.SWAY_AMPLITUDE * 0.5;
    const totalSway = swayPrimary + swaySecondary;
    
    // Calculate bob animation (same as barrel rendering)
    const bobOffset = Math.sin(nowMs * SEA_BARREL_WATER_CONFIG.BOB_FREQUENCY + barrel.posX * 0.02) 
        * SEA_BARREL_WATER_CONFIG.BOB_AMPLITUDE;
    
    // Base position with bob
    const baseX = barrel.posX;
    const baseY = barrel.posY + bobOffset;
    
    // Apply sway rotation offset to the silhouette position
    // The sway rotates around the barrel base, so the collision center moves in an arc
    const collisionYOffset = UNDERWATER_BARREL_CONFIG.Y_OFFSET * scaleFactor;
    // Calculate horizontal displacement from sway (simplified arc motion)
    const swayDisplacementX = Math.sin(totalSway) * collisionYOffset;
    const swayDisplacementY = (1 - Math.cos(totalSway)) * collisionYOffset * 0.1; // Small vertical component
    
    const x = baseX + swayDisplacementX;
    const y = baseY - collisionYOffset + swayDisplacementY;
    
    ctx.save();
    
    // Create radial gradient for feathered effect
    const gradient = ctx.createRadialGradient(x, y, radius * 0.3, x, y, featherRadius);
    
    // Adjust darkness slightly based on time of day
    const nightFactor = Math.abs(cycleProgress - 0.5) * 2; // 0 at noon, 1 at midnight
    const baseAlpha = 0.75 + nightFactor * 0.15; // Darker at night
    
    // Inner solid color
    const innerColor = UNDERWATER_BARREL_CONFIG.INNER_COLOR.replace('0.85', baseAlpha.toFixed(2));
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(0.6, innerColor);
    // Feathered edge
    gradient.addColorStop(1, UNDERWATER_BARREL_CONFIG.OUTER_COLOR);
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, featherRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}