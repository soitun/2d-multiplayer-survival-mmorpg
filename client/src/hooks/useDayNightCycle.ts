import { useEffect, useRef, useState, useMemo } from 'react';
import {
    Campfire as SpacetimeDBCampfire,
    Lantern as SpacetimeDBLantern,
    Furnace as SpacetimeDBFurnace,
    WorldState as SpacetimeDBWorldState,
    Player as SpacetimeDBPlayer,
    ActiveEquipment as SpacetimeDBActiveEquipment,
    ItemDefinition as SpacetimeDBItemDefinition,
    RuneStone as SpacetimeDBRuneStone, // ADDED: RuneStone
    FirePatch as SpacetimeDBFirePatch, // ADDED: FirePatch
    Fumarole as SpacetimeDBFumarole, // ADDED: Fumarole
    Barbecue as SpacetimeDBBarbecue, // ADDED: Barbecue
} from '../generated';
import { CAMPFIRE_LIGHT_RADIUS_BASE, CAMPFIRE_FLICKER_AMOUNT, LANTERN_LIGHT_RADIUS_BASE, LANTERN_FLICKER_AMOUNT, FURNACE_LIGHT_RADIUS_BASE, FURNACE_FLICKER_AMOUNT, BARBECUE_LIGHT_RADIUS_BASE, BARBECUE_FLICKER_AMOUNT, SOVA_AURA_RADIUS_BASE } from '../utils/renderers/lightRenderingUtils';
import { CAMPFIRE_HEIGHT } from '../utils/renderers/campfireRenderingUtils';
import { LANTERN_HEIGHT } from '../utils/renderers/lanternRenderingUtils';
import { FURNACE_HEIGHT, FURNACE_RENDER_Y_OFFSET } from '../utils/renderers/furnaceRenderingUtils';
import { BARBECUE_HEIGHT, BARBECUE_RENDER_Y_OFFSET } from '../utils/renderers/barbecueRenderingUtils';
import { FIRE_PATCH_VISUAL_RADIUS } from '../utils/renderers/firePatchRenderingUtils';
import { BuildingCluster } from '../utils/buildingVisibilityUtils';
import { FOUNDATION_TILE_SIZE } from '../config/gameConfig';
import { getCompoundBuildingsWithLights } from '../config/compoundBuildings';

export interface ColorPoint {
  r: number; g: number; b: number; a: number;
}

// ============================================================================
// AAA PIXEL ART DAY/NIGHT COLORS - Inspired by Sea of Stars
// ============================================================================
// Key principles:
// - Night is NEVER pure black - always rich deep blues with purple undertones
// - Dawn/Dusk have vibrant oranges, magentas, and teals
// - Full moon has ethereal silver-blue magical glow
// - Each time period has a distinct cinematic "mood"
// ============================================================================

// Default night: Rich deep blue transitions, but midnight is TRUE BLACK
// The contrast makes the blues feel richer
export const defaultPeakMidnightColor: ColorPoint = { r: 0, g: 0, b: 0, a: 1.0 };
export const defaultTransitionNightColor: ColorPoint = { r: 25, g: 35, b: 65, a: 0.78 };

// Full Moon night: Ethereal silver-blue magical glow
// Brighter, cooler, more mystical - like moonlight bathing the world
export const fullMoonPeakMidnightColor: ColorPoint = { r: 70, g: 90, b: 140, a: 0.42 };
export const fullMoonTransitionNightColor: ColorPoint = { r: 55, g: 80, b: 130, a: 0.52 };

// Base keyframes (simplified reference for other systems)
export const baseKeyframes: Record<number, ColorPoint> = {
  0.00: { r: 140, g: 90, b: 130, a: 0.52 },    // Lavender pre-dawn
  0.08: { r: 255, g: 200, b: 120, a: 0.12 },   // Morning warmth
  0.15: { r: 0, g: 0, b: 0, a: 0.0 },          // Day clear
  0.50: { r: 0, g: 0, b: 0, a: 0.0 },          // Noon clear
  0.72: { r: 255, g: 140, b: 70, a: 0.22 },    // Sunset orange
  0.80: { r: 45, g: 40, b: 110, a: 0.78 },     // Night indigo
  0.92: { r: 12, g: 18, b: 50, a: 0.90 },      // Pre-midnight blue
  0.945: { r: 0, g: 0, b: 0, a: 1.0 },         // TRUE BLACK midnight
  0.97: { r: 25, g: 30, b: 70, a: 0.84 },      // Pre-dawn blue
  1.00: { r: 140, g: 90, b: 130, a: 0.52 },    // Lavender (wrap)
};
// --- END Day/Night Cycle Constants ---

// Define TORCH_LIGHT_RADIUS_BASE locally
const TORCH_LIGHT_RADIUS_BASE = CAMPFIRE_LIGHT_RADIUS_BASE * 0.8; // Slightly smaller than campfire
const TORCH_FLICKER_AMOUNT = CAMPFIRE_FLICKER_AMOUNT * 0.7; // Added for torch flicker

// Define HEADLAMP_LIGHT_RADIUS_BASE locally (twice as bright as torch, same fire-like style)
const HEADLAMP_LIGHT_RADIUS_BASE = TORCH_LIGHT_RADIUS_BASE * 2.0;
const HEADLAMP_FLICKER_AMOUNT = TORCH_FLICKER_AMOUNT * 1.2; // More flicker for fire-like effect

// Define RGB colors for overlay tints - UPDATED FOR 25-MINUTE CYCLE (20min day + 5min night)
interface ColorAlphaKeyframe {
  progress: number;
  rgb: [number, number, number];
  alpha: number;
}

// Helper for daytime (effectively transparent)
const DAY_COLOR_CONFIG = { rgb: [0, 0, 0] as [number, number, number], alpha: 0.0 }; // Color doesn't matter when alpha is 0

const REGULAR_CYCLE_KEYFRAMES: ColorAlphaKeyframe[] = [
  // ============================================================================
  // SEA OF STARS INSPIRED - Rich, saturated, cinematic colors
  // Night is deep blue (never black!), dawn/dusk are vibrant gold/magenta/teal
  // ============================================================================
  
  // START at 0.0 matching END of Twilight Morning - lavender pre-dawn glow
  { progress: 0.0,  rgb: [140, 90, 130],   alpha: 0.52 },   // Soft lavender-pink pre-dawn
  
  // Dawn (Server: 0.0 - 0.05) - Golden hour magic with magenta undertones
  { progress: 0.015, rgb: [180, 100, 120], alpha: 0.42 },   // Rose-gold awakening
  { progress: 0.025, rgb: [220, 120, 90],  alpha: 0.35 },   // Warm coral sunrise
  { progress: 0.035, rgb: [255, 150, 60],  alpha: 0.28 },   // Rich golden orange
  { progress: 0.045, rgb: [255, 180, 80],  alpha: 0.18 },   // Bright sunrise gold

  // Morning - Transition to Clear Day (Server: 0.05 - 0.35)
  { progress: 0.06, rgb: [255, 200, 120],  alpha: 0.12 },   // Warm morning glow
  { progress: 0.08, rgb: [255, 220, 150],  alpha: 0.08 },   // Soft golden haze
  { progress: 0.10, rgb: [255, 235, 180],  alpha: 0.05 },   // Fading warmth
  { progress: 0.12, rgb: [255, 245, 210],  alpha: 0.02 },   // Almost clear
  { progress: 0.15, ...DAY_COLOR_CONFIG },                  // Morning fully clear
  
  // Day/Noon/Afternoon clear (bright, no overlay)
  { progress: 0.35, ...DAY_COLOR_CONFIG }, // Morning clear
  { progress: 0.55, ...DAY_COLOR_CONFIG }, // Noon clear 
  { progress: 0.68, ...DAY_COLOR_CONFIG }, // Late afternoon clear

  // Golden Hour / Pre-Dusk (Server: ~0.70 - 0.72) - Warm amber tones
  { progress: 0.70, rgb: [255, 210, 140],  alpha: 0.06 },   // First hints of golden hour
  { progress: 0.715, rgb: [255, 180, 100], alpha: 0.12 },   // Deepening gold

  // Dusk (Server: 0.72 - 0.76) - Dramatic orange to magenta to teal transition
  { progress: 0.72, rgb: [255, 140, 70],   alpha: 0.22 },   // Intense sunset orange
  { progress: 0.735, rgb: [240, 100, 90],  alpha: 0.32 },   // Coral-pink sunset
  { progress: 0.75, rgb: [200, 80, 120],   alpha: 0.42 },   // Magenta twilight
  { progress: 0.76, rgb: [160, 70, 140],   alpha: 0.52 },   // Deep purple-magenta

  // Twilight Evening (Server: 0.76 - 0.80) - Purple to deep blue transition
  { progress: 0.77, rgb: [120, 60, 150],   alpha: 0.60 },   // Rich violet
  { progress: 0.785, rgb: [80, 50, 140],   alpha: 0.68 },   // Deep indigo
  { progress: 0.80, rgb: [45, 40, 110],    alpha: 0.78 },   // Night indigo

  // Night (Server: 0.80 - 0.92) - Rich deep blue (Sea of Stars style - NEVER black)
  { progress: 0.83, rgb: [30, 35, 90],     alpha: 0.82 },   // Deep starlit blue
  { progress: 0.86, rgb: [20, 28, 75],     alpha: 0.86 },   // Darker blue
  { progress: 0.89, rgb: [15, 22, 60],     alpha: 0.88 },   // Deep night blue

  // Midnight (Server: 0.92 - 0.97) - True black at peak, blue transitions
  { progress: 0.92, rgb: [12, 18, 50],     alpha: 0.90 },   // Midnight blue start
  { progress: 0.945, rgb: [0, 0, 0],       alpha: 1.0 },    // TRUE BLACK at midnight peak
  { progress: 0.965, rgb: [15, 20, 55],    alpha: 0.88 },   // Midnight easing back to blue

  // Twilight Morning (Server: 0.97 - 1.0) - Deep blue to purple to lavender
  { progress: 0.97, rgb: [25, 30, 70],     alpha: 0.84 },   // Pre-dawn deep blue
  { progress: 0.98, rgb: [50, 45, 100],    alpha: 0.75 },   // Indigo awakening
  { progress: 0.99, rgb: [90, 65, 120],    alpha: 0.65 },   // Purple dawn hints
  { progress: 0.995, rgb: [120, 80, 125],  alpha: 0.58 },   // Lavender pre-dawn
  { progress: 1.0, rgb: [140, 90, 130],    alpha: 0.52 },   // Soft lavender (matches 0.0)
];

const FULL_MOON_NIGHT_KEYFRAMES: ColorAlphaKeyframe[] = [
  // ============================================================================
  // FULL MOON - Ethereal silver-blue magical atmosphere
  // Brighter nights with mystical moonlit glow, cool blue-silver tones
  // Inspired by moonlit scenes in Sea of Stars and Ori
  // ============================================================================
  
  // START at 0.0 - Soft silver-lavender pre-dawn under moonlight
  { progress: 0.0,  rgb: [180, 170, 200], alpha: 0.22 },   // Silver-lavender pre-dawn

  // Dawn (Full Moon) - Softer, more ethereal sunrise with silver undertones
  { progress: 0.015, rgb: [200, 175, 190], alpha: 0.18 },   // Rose-silver awakening
  { progress: 0.025, rgb: [220, 185, 170], alpha: 0.14 },   // Soft peach-silver
  { progress: 0.035, rgb: [240, 200, 160], alpha: 0.10 },   // Gentle golden glow
  { progress: 0.045, rgb: [255, 215, 175], alpha: 0.06 },   // Soft sunrise

  // Morning - Transition to Clear Day
  { progress: 0.06, rgb: [255, 225, 190], alpha: 0.04 },   // Fading warmth
  { progress: 0.08, rgb: [255, 235, 210], alpha: 0.02 },   // Almost clear
  { progress: 0.12, ...DAY_COLOR_CONFIG },                  // Morning clear

  // Day/Afternoon (Same as regular - bright and clear)
  { progress: 0.35, ...DAY_COLOR_CONFIG },
  { progress: 0.55, ...DAY_COLOR_CONFIG },
  { progress: 0.68, ...DAY_COLOR_CONFIG },

  // Golden Hour / Pre-Dusk - Slightly muted compared to regular
  { progress: 0.70, rgb: [255, 220, 170], alpha: 0.05 },   // Soft golden hour
  { progress: 0.715, rgb: [250, 195, 150], alpha: 0.10 },  // Gentle gold

  // Dusk (Full Moon) - More subdued, transitioning to silver-blue faster
  { progress: 0.72, rgb: [240, 160, 130], alpha: 0.18 },   // Coral sunset
  { progress: 0.735, rgb: [210, 140, 150], alpha: 0.26 },  // Rose twilight
  { progress: 0.75, rgb: [180, 130, 170], alpha: 0.32 },   // Lavender-rose
  { progress: 0.76, rgb: [150, 130, 185], alpha: 0.36 },   // Silver-lavender

  // Twilight Evening (Full Moon) - Quick transition to magical blue
  { progress: 0.77, rgb: [130, 140, 190], alpha: 0.38 },   // Silver-blue emerging
  { progress: 0.785, rgb: [110, 145, 195], alpha: 0.40 },  // Cool moonlight blue
  { progress: 0.80, rgb: [95, 140, 200],  alpha: 0.42 },   // Ethereal blue

  // Night (Full Moon) - MAGICAL silver-blue moonlit atmosphere
  { progress: 0.83, rgb: [85, 130, 195],  alpha: 0.40 },   // Soft moonlight
  { progress: 0.86, rgb: [75, 115, 185],  alpha: 0.42 },   // Deep moonlight
  { progress: 0.89, rgb: [70, 105, 175],  alpha: 0.43 },   // Rich moonlit blue

  // Midnight (Full Moon) - Brightest silver-blue, mystical glow
  { progress: 0.92, rgb: [70, 95, 165],   alpha: 0.44 },   // Midnight moon start
  { progress: 0.945, rgb: [70, 90, 155],  alpha: 0.45 },   // Midnight moon peak (brightest)
  { progress: 0.965, rgb: [75, 100, 170], alpha: 0.44 },   // Midnight easing

  // Twilight Morning (Full Moon) - Silver-blue to lavender pre-dawn
  { progress: 0.97, rgb: [85, 110, 180],  alpha: 0.42 },   // Pre-dawn moonlight
  { progress: 0.98, rgb: [110, 130, 190], alpha: 0.36 },   // Fading moonlight
  { progress: 0.99, rgb: [145, 150, 195], alpha: 0.30 },   // Silver-lavender hints
  { progress: 0.995, rgb: [165, 160, 198], alpha: 0.26 }, // Soft lavender
  { progress: 1.0, rgb: [180, 170, 200],  alpha: 0.22 },   // Silver-lavender (matches 0.0)
];

// Server's full moon cycle interval
const SERVER_FULL_MOON_INTERVAL = 3;

// --- Indoor Light Containment Utilities ---

/**
 * Convert world position to foundation cell coordinates
 */
function worldToFoundationCell(worldX: number, worldY: number): { cellX: number; cellY: number } {
    return {
        cellX: Math.floor(worldX / FOUNDATION_TILE_SIZE),
        cellY: Math.floor(worldY / FOUNDATION_TILE_SIZE),
    };
}

/**
 * Find which enclosed building cluster contains the given world position
 * Returns the cluster and its ID if found, null otherwise
 */
function findEnclosingCluster(
    worldX: number,
    worldY: number,
    buildingClusters: Map<string, BuildingCluster>
): { clusterId: string; cluster: BuildingCluster } | null {
    const { cellX, cellY } = worldToFoundationCell(worldX, worldY);
    const cellKey = `${cellX},${cellY}`;
    
    for (const [clusterId, cluster] of buildingClusters) {
        if (cluster.isEnclosed && cluster.cellCoords.has(cellKey)) {
            return { clusterId, cluster };
        }
    }
    return null;
}

/**
 * Create a Path2D clip path from a building cluster's foundation cells
 * This allows light cutouts to be contained within the building interior
 * 
 * IMPORTANT: North walls/doors render with a vertical offset ABOVE the foundation,
 * so we extend the clip area upward by one foundation tile size to include
 * the north wall rendering area.
 */
function createClusterClipPath(
    cluster: BuildingCluster,
    cameraOffsetX: number,
    cameraOffsetY: number
): Path2D {
    const path = new Path2D();
    
    // Add each foundation cell as a rectangle to the path
    // Also extend upward by one tile to cover north wall rendering area
    cluster.cellCoords.forEach((cellKey) => {
        const [cellXStr, cellYStr] = cellKey.split(',');
        const cellX = parseInt(cellXStr, 10);
        const cellY = parseInt(cellYStr, 10);
        
        // Convert cell coordinates to screen pixels
        const screenX = cellX * FOUNDATION_TILE_SIZE + cameraOffsetX;
        const screenY = cellY * FOUNDATION_TILE_SIZE + cameraOffsetY;
        
        // Add the foundation cell itself
        path.rect(screenX, screenY, FOUNDATION_TILE_SIZE, FOUNDATION_TILE_SIZE);
        
        // Add a rectangle ABOVE this cell to cover north wall/door rendering area
        // North walls render with vertical offset above the foundation
        path.rect(screenX, screenY - FOUNDATION_TILE_SIZE, FOUNDATION_TILE_SIZE, FOUNDATION_TILE_SIZE);
    });
    
    return path;
}

/**
 * Render a light cutout, optionally clipped to a building interior
 * This prevents light from spilling outside of enclosed structures
 */
function renderClippedLightCutout(
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    lightRadius: number,
    gradientStops: Array<{ stop: number; alpha: number }>,
    enclosingCluster: { clusterId: string; cluster: BuildingCluster } | null,
    cameraOffsetX: number,
    cameraOffsetY: number
): void {
    // Save context before potentially applying clip
    if (enclosingCluster) {
        ctx.save();
        const clipPath = createClusterClipPath(enclosingCluster.cluster, cameraOffsetX, cameraOffsetY);
        ctx.clip(clipPath);
    }
    
    // Create and apply the radial gradient for the light cutout
    const innerRadius = lightRadius * (gradientStops[0]?.stop || 0.08);
    const maskGradient = ctx.createRadialGradient(screenX, screenY, innerRadius, screenX, screenY, lightRadius);
    
    for (const { stop, alpha } of gradientStops) {
        maskGradient.addColorStop(stop, `rgba(0,0,0,${alpha})`);
    }
    
    ctx.fillStyle = maskGradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, lightRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Restore context if we applied a clip
    if (enclosingCluster) {
        ctx.restore();
    }
}

// --- End Indoor Light Containment Utilities ---

function calculateOverlayRgbaString(
    cycleProgress: number,
    worldState: SpacetimeDBWorldState | null // Pass the whole worldState or null
): string { 
    const isCurrentlyFullMoon = worldState?.isFullMoon ?? false;
    const currentCycleCount = worldState?.cycleCount ?? 0;

    const GRACE_PERIOD_END_PROGRESS = 0.05; // Dawn period ends at 0.05 in 25-minute cycle
    const REGULAR_DAWN_PEAK_PROGRESS = REGULAR_CYCLE_KEYFRAMES.find(kf => kf.progress === 0.125)?.progress ?? 0.125; // Updated to match new sunrise peak

    // --- Special Transition 1: Full Moon cycle STARTS, but PREVIOUS was Regular (or first cycle) ---
    const prevCycleWasRegularOrDefault = currentCycleCount === 0 || ((currentCycleCount - 1) % SERVER_FULL_MOON_INTERVAL !== 0);
    if (isCurrentlyFullMoon && cycleProgress < GRACE_PERIOD_END_PROGRESS && prevCycleWasRegularOrDefault) {
        const fromKf = REGULAR_CYCLE_KEYFRAMES[0]; // Regular dark midnight
        const toKf = FULL_MOON_NIGHT_KEYFRAMES[0];   // Target: Full moon bright midnight
        let t = 0;
        if (GRACE_PERIOD_END_PROGRESS > 0.0001) {
            t = cycleProgress / GRACE_PERIOD_END_PROGRESS;
        }
        t = Math.max(0, Math.min(t, 1));

        const r = Math.round(fromKf.rgb[0] * (1 - t) + toKf.rgb[0] * t);
        const g = Math.round(fromKf.rgb[1] * (1 - t) + toKf.rgb[1] * t);
        const b = Math.round(fromKf.rgb[2] * (1 - t) + toKf.rgb[2] * t);
        const alpha = fromKf.alpha * (1 - t) + toKf.alpha * t;
        return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
    }

    // --- Special Transition 2: Regular cycle STARTS, but PREVIOUS was Full Moon ---
    const prevCycleWasFullMoon = currentCycleCount > 0 && ((currentCycleCount - 1) % SERVER_FULL_MOON_INTERVAL === 0);
    if (!isCurrentlyFullMoon && cycleProgress < REGULAR_DAWN_PEAK_PROGRESS && prevCycleWasFullMoon) {
        const fromKf = FULL_MOON_NIGHT_KEYFRAMES[FULL_MOON_NIGHT_KEYFRAMES.length - 1]; 
        const toKf = REGULAR_CYCLE_KEYFRAMES.find(kf => kf.progress === REGULAR_DAWN_PEAK_PROGRESS) ?? REGULAR_CYCLE_KEYFRAMES[1]; 
        let t = 0;
        if (REGULAR_DAWN_PEAK_PROGRESS > 0) { 
            t = cycleProgress / REGULAR_DAWN_PEAK_PROGRESS;
        }
        t = Math.max(0, Math.min(t, 1));
        const r = Math.round(fromKf.rgb[0] * (1 - t) + toKf.rgb[0] * t);
        const g = Math.round(fromKf.rgb[1] * (1 - t) + toKf.rgb[1] * t);
        const b = Math.round(fromKf.rgb[2] * (1 - t) + toKf.rgb[2] * t);
        const alpha = fromKf.alpha * (1 - t) + toKf.alpha * t;
        return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
    }

    // --- Default Interpolation (covers all other cases) ---
    const keyframesToUse = isCurrentlyFullMoon ? FULL_MOON_NIGHT_KEYFRAMES : REGULAR_CYCLE_KEYFRAMES;
    
    // Handle wrap-around: TwilightMorning (0.97-1.0) wraps to Dawn (0.0-0.05)
    // If we're in the wrap-around zone (0.97-1.0), interpolate from last keyframe to first Dawn keyframe
    if (cycleProgress >= 0.97) {
        // Find the last keyframe (should be around 0.97 or 1.0)
        const lastKf = keyframesToUse[keyframesToUse.length - 1];
        // Find the first Dawn keyframe (should be 0.0 or 0.025)
        const firstDawnKf = keyframesToUse.find(kf => kf.progress <= 0.05) || keyframesToUse[0];
        
        // Normalize progress: 0.97-1.0 maps to 0.0-1.0 for interpolation
        const normalizedProgress = (cycleProgress - 0.97) / (1.0 - 0.97);
        const t = Math.max(0, Math.min(normalizedProgress, 1));
        
        const r = Math.round(lastKf.rgb[0] * (1 - t) + firstDawnKf.rgb[0] * t);
        const g = Math.round(lastKf.rgb[1] * (1 - t) + firstDawnKf.rgb[1] * t);
        const b = Math.round(lastKf.rgb[2] * (1 - t) + firstDawnKf.rgb[2] * t);
        const alpha = lastKf.alpha * (1 - t) + firstDawnKf.alpha * t;
        
        return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
    }
    
    // Standard keyframe lookup and interpolation
    let prevKf = keyframesToUse[0];
    let nextKf = keyframesToUse[keyframesToUse.length - 1];

    if (cycleProgress <= keyframesToUse[0].progress) {
        prevKf = keyframesToUse[0];
        nextKf = keyframesToUse[0];
    } else {
        for (let i = 0; i < keyframesToUse.length - 1; i++) {
            if (cycleProgress >= keyframesToUse[i].progress && cycleProgress < keyframesToUse[i + 1].progress) {
                prevKf = keyframesToUse[i];
                nextKf = keyframesToUse[i + 1];
                break;
            }
        }
    }

    let t = 0; // Interpolation factor
    if (nextKf.progress > prevKf.progress) {
        t = (cycleProgress - prevKf.progress) / (nextKf.progress - prevKf.progress);
    }
    t = Math.max(0, Math.min(t, 1)); // Clamp t

    const r = Math.round(prevKf.rgb[0] * (1 - t) + nextKf.rgb[0] * t);
    const g = Math.round(prevKf.rgb[1] * (1 - t) + nextKf.rgb[1] * t);
    const b = Math.round(prevKf.rgb[2] * (1 - t) + nextKf.rgb[2] * t);
    const alpha = prevKf.alpha * (1 - t) + nextKf.alpha * t;

    // Debug logging for Dusk overlay (0.72 - 0.76)
    // if (cycleProgress >= 0.72 && cycleProgress <= 0.76) {
    //     console.log(`[DayNightCycle] DUSK DEBUG - Progress: ${cycleProgress.toFixed(3)}, Prev: ${prevKf.progress} (alpha: ${prevKf.alpha}), Next: ${nextKf.progress} (alpha: ${nextKf.alpha}), T: ${t.toFixed(3)}, Final Alpha: ${alpha.toFixed(2)}, RGB: [${r},${g},${b}]`);
    // }

    return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

interface UseDayNightCycleProps {
    worldState: SpacetimeDBWorldState | null;
    campfires: Map<string, SpacetimeDBCampfire>;
    lanterns: Map<string, SpacetimeDBLantern>;
    furnaces: Map<string, SpacetimeDBFurnace>;
    barbecues: Map<string, SpacetimeDBBarbecue>; // ADDED: Barbecues for night light cutouts
    runeStones: Map<string, SpacetimeDBRuneStone>; // ADDED: RuneStones for night light cutouts
    firePatches: Map<string, SpacetimeDBFirePatch>; // ADDED: Fire patches for night light cutouts
    fumaroles: Map<string, SpacetimeDBFumarole>; // ADDED: Fumaroles for heat glow at night
    fishingVillageParts: Map<string, any>; // ADDED: Fishing village parts for campfire light
    players: Map<string, SpacetimeDBPlayer>;
    activeEquipments: Map<string, SpacetimeDBActiveEquipment>;
    itemDefinitions: Map<string, SpacetimeDBItemDefinition>;
    cameraOffsetX: number;
    cameraOffsetY: number;
    canvasSize: { width: number; height: number };
    // Add interpolated positions for smooth torch light cutouts
    localPlayerId?: string;
    predictedPosition: { x: number; y: number } | null;
    remotePlayerInterpolation?: any; // Type matches GameCanvas
    // Indoor light containment - prevents light from spilling outside enclosed buildings
    buildingClusters?: Map<string, BuildingCluster>;
    // Mouse position for local player's flashlight aiming (smooth 360° tracking)
    worldMouseX?: number | null;
    worldMouseY?: number | null;
}

interface UseDayNightCycleResult {
    overlayRgba: string;
    maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function useDayNightCycle({
    worldState,
    campfires,
    lanterns,
    furnaces,
    barbecues, // ADDED: Barbecues
    runeStones, // ADDED: RuneStones
    firePatches, // ADDED: Fire patches
    fumaroles, // ADDED: Fumaroles
    fishingVillageParts, // ADDED: Fishing village parts for campfire light
    players,
    activeEquipments,
    itemDefinitions,
    cameraOffsetX,
    cameraOffsetY,
    canvasSize,
    localPlayerId,
    predictedPosition,
    remotePlayerInterpolation,
    buildingClusters, // Indoor light containment
    worldMouseX, // Mouse position for local player's flashlight
    worldMouseY,
}: UseDayNightCycleProps): UseDayNightCycleResult {
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [overlayRgba, setOverlayRgba] = useState<string>('transparent');
    // OPTIMIZED: Track previous overlay value to avoid unnecessary re-renders
    const prevOverlayRef = useRef<string>('transparent');

    // --- Create a derived state string that changes when any torch's lit status changes ---
    const torchLitStatesKey = useMemo(() => {
        let key = "torch_light_states:";
        players.forEach((player, playerId) => {
            const equipment = activeEquipments.get(playerId);
            if (equipment && equipment.equippedItemDefId) {
                const itemDef = itemDefinitions.get(equipment.equippedItemDefId.toString());
                if (itemDef && itemDef.name === "Torch") {
                    key += `${playerId}:${player.isTorchLit};`;
                }
            }
        });
        return key;
    }, [players, activeEquipments, itemDefinitions]);
    // --- End derived state ---

    // --- Create a derived state string that changes when any headlamp's lit status changes ---
    const headlampLitStatesKey = useMemo(() => {
        let key = "headlamp_light_states:";
        players.forEach((player, playerId) => {
            key += `${playerId}:${player.isHeadlampLit};`;
        });
        return key;
    }, [players]);
    // --- End derived state ---

    // --- Create a derived state string that changes when any lantern's burning status changes ---
    const lanternBurningStatesKey = useMemo(() => {
        let key = "lantern_burning_states:";
        lanterns.forEach((lantern, lanternId) => {
            key += `${lanternId}:${lantern.isBurning};`;
        });
        return key;
    }, [lanterns]);
    // --- End lantern derived state ---

    useEffect(() => {
        if (!maskCanvasRef.current) {
            maskCanvasRef.current = document.createElement('canvas');
        }
        const maskCanvas = maskCanvasRef.current;
        const maskCtx = maskCanvas.getContext('2d');

        if (!maskCtx || canvasSize.width === 0 || canvasSize.height === 0) {
            setOverlayRgba('transparent');
            return;
        }

        maskCanvas.width = canvasSize.width;
        maskCanvas.height = canvasSize.height;

        const currentCycleProgress = worldState?.cycleProgress;
        let calculatedOverlayString; 

        if (typeof currentCycleProgress === 'number') {
            calculatedOverlayString = calculateOverlayRgbaString(
                currentCycleProgress,
                worldState // Pass the whole worldState object
            );
            
            // Enhanced debug logging - show time of day and overlay
            const timeOfDayTag = worldState?.timeOfDay?.tag || 'Unknown';
            const isDusk = timeOfDayTag === 'Dusk' || (currentCycleProgress >= 0.72 && currentCycleProgress <= 0.76);
            
            // if (isDusk) {
            //     console.log(`[DayNightCycle] DUSK DEBUG - TimeOfDay: ${timeOfDayTag}, Progress: ${currentCycleProgress.toFixed(3)}, Overlay: ${calculatedOverlayString}, FullMoon: ${worldState?.isFullMoon ?? false}`);
            // }
            
            // Log whenever overlay changes significantly (has alpha > 0.1)
            const overlayMatch = calculatedOverlayString.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
            if (overlayMatch && parseFloat(overlayMatch[4]) > 0.1) {
                // console.log(`[DayNightCycle] VISIBLE OVERLAY - TimeOfDay: ${timeOfDayTag}, Progress: ${currentCycleProgress.toFixed(3)}, Overlay: ${calculatedOverlayString}`);
            }
        } else {
            calculatedOverlayString = 'rgba(0,0,0,0)'; // Default to fully transparent day
            console.warn('[DayNightCycle] No cycleProgress available, using transparent overlay');
        }
        
        // OPTIMIZED: Only update state if the overlay value actually changed
        if (calculatedOverlayString !== prevOverlayRef.current) {
            prevOverlayRef.current = calculatedOverlayString;
            setOverlayRgba(calculatedOverlayString);
        } 

        maskCtx.fillStyle = calculatedOverlayString; 
        maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

        // Debug: Log when mask canvas is drawn with visible overlay
        const overlayMatch = calculatedOverlayString.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
        if (overlayMatch && parseFloat(overlayMatch[4]) > 0.1) {
            const timeOfDayTag = worldState?.timeOfDay?.tag || 'Unknown';
            // console.log(`[DayNightCycle] MASK CANVAS DRAWN - TimeOfDay: ${timeOfDayTag}, Canvas size: ${maskCanvas.width}x${maskCanvas.height}, Overlay: ${calculatedOverlayString}`);
        }

        maskCtx.globalCompositeOperation = 'destination-out';

        // Render campfire light cutouts
        campfires.forEach(campfire => {
            if (campfire.isBurning) {
                // Adjust Y position for the light source to be centered on the flame
                const visualCenterWorldY = campfire.posY - (CAMPFIRE_HEIGHT / 2);
                const adjustedGradientCenterWorldY = visualCenterWorldY - (CAMPFIRE_HEIGHT * 0); // Changed from 0.6 to 0.4
                
                const screenX = campfire.posX + cameraOffsetX;
                const screenY = adjustedGradientCenterWorldY + cameraOffsetY; // Use adjusted Y
                
                // Check if campfire is inside an enclosed building
                const enclosingCluster = buildingClusters 
                    ? findEnclosingCluster(campfire.posX, campfire.posY, buildingClusters)
                    : null;
                
                // SUBSTANTIAL CAMPFIRE CUTOUT - 2x larger inner bright area with natural gradient
                const lightRadius = CAMPFIRE_LIGHT_RADIUS_BASE * 2.0; // Double the cutout size
                
                // Use clipped rendering if inside a building
                renderClippedLightCutout(
                    maskCtx,
                    screenX,
                    screenY,
                    lightRadius,
                    [
                        { stop: 0.08, alpha: 1 },    // Full cutout at center
                        { stop: 0.4, alpha: 0.7 },   // Natural transition zone
                        { stop: 0.8, alpha: 0.3 },   // Gentle fade
                        { stop: 1, alpha: 0 },       // Complete fade to darkness
                    ],
                    enclosingCluster,
                    cameraOffsetX,
                    cameraOffsetY
                );
            }
        });

        // Render fishing village campfire light cutouts (Aleut-style central campfire)
        // This is a LARGE communal campfire - cozy safe zone with warm light
        // Y offset to center light on the firepit in the 1024x1024 image (rendered at 256x256)
        const FV_CAMPFIRE_Y_OFFSET = -150; // Dropped 100px lower for better alignment
        fishingVillageParts.forEach(part => {
            if (part.partType === 'campfire') {
                const screenX = part.worldX + cameraOffsetX;
                const screenY = part.worldY + cameraOffsetY + FV_CAMPFIRE_Y_OFFSET; // Apply offset
                
                // LARGE FISHING VILLAGE CAMPFIRE - bigger and warmer than regular campfires
                // Creates a cozy, safe atmosphere in the village
                const FISHING_VILLAGE_CAMPFIRE_RADIUS = CAMPFIRE_LIGHT_RADIUS_BASE * 3.0; // Communal fire light
                const flicker = (Math.random() - 0.5) * 2 * CAMPFIRE_FLICKER_AMOUNT * 0.8; // Slightly more stable
                const lightRadius = Math.max(0, FISHING_VILLAGE_CAMPFIRE_RADIUS + flicker);
                
                // No building clusters for outdoor village campfire
                renderClippedLightCutout(
                    maskCtx,
                    screenX,
                    screenY,
                    lightRadius,
                    [
                        { stop: 0.05, alpha: 1 },    // Full cutout at center - cozy warm core
                        { stop: 0.25, alpha: 0.85 }, // Strong cutout - safe zone area
                        { stop: 0.5, alpha: 0.6 },   // Gentle transition
                        { stop: 0.75, alpha: 0.3 },  // Fading edge
                        { stop: 1, alpha: 0 },       // Complete fade to darkness
                    ],
                    null, // No building cluster (outdoor)
                    cameraOffsetX,
                    cameraOffsetY
                );
            }
        });

        // Render lantern light cutouts
        lanterns.forEach(lantern => {
            if (lantern.isBurning && !lantern.isDestroyed) {
                // Adjust Y position for the light source to be centered on the lantern flame
                const visualCenterWorldY = lantern.posY - (LANTERN_HEIGHT / 2);
                const adjustedGradientCenterWorldY = visualCenterWorldY; // Lanterns don't need extra offset like campfires
                
                const screenX = lantern.posX + cameraOffsetX;
                const screenY = adjustedGradientCenterWorldY + cameraOffsetY;
                
                // Check if lantern is inside an enclosed building
                const enclosingCluster = buildingClusters 
                    ? findEnclosingCluster(lantern.posX, lantern.posY, buildingClusters)
                    : null;
                
                // LANTERN CUTOUT - Larger and more stable than torch, but more contained than campfire
                const flicker = (Math.random() - 0.5) * 2 * LANTERN_FLICKER_AMOUNT;
                const lightRadius = Math.max(0, (LANTERN_LIGHT_RADIUS_BASE * 1.8) + flicker); // 1.8x radius for good coverage
                
                // Use clipped rendering if inside a building
                renderClippedLightCutout(
                    maskCtx,
                    screenX,
                    screenY,
                    lightRadius,
                    [
                        { stop: 0.05, alpha: 1 },    // Full cutout at center
                        { stop: 0.3, alpha: 0.85 },  // Strong cutout zone
                        { stop: 0.6, alpha: 0.5 },   // Gradual transition
                        { stop: 0.85, alpha: 0.2 },  // Gentle fade
                        { stop: 1, alpha: 0 },       // Complete fade to darkness
                    ],
                    enclosingCluster,
                    cameraOffsetX,
                    cameraOffsetY
                );
            }
        });

        // Render furnace light cutouts with red gradient fill
        furnaces.forEach(furnace => {
            if (furnace.isBurning) {
                // Adjust Y position for the light source to be centered on the furnace
                const visualCenterWorldY = furnace.posY - (FURNACE_HEIGHT / 2);
                const adjustedGradientCenterWorldY = visualCenterWorldY - (FURNACE_RENDER_Y_OFFSET * 0); // Changed from 0.6 to 0.4
                
                const screenX = furnace.posX + cameraOffsetX;
                const screenY = adjustedGradientCenterWorldY + cameraOffsetY; // Use adjusted Y
                
                // Check if furnace is inside an enclosed building
                const enclosingCluster = buildingClusters 
                    ? findEnclosingCluster(furnace.posX, furnace.posY, buildingClusters)
                    : null;
                
                const lightRadius = FURNACE_LIGHT_RADIUS_BASE * 2.0; // Double the cutout size
                
                // Apply clip if inside a building (clip affects both cutout and red fill)
                if (enclosingCluster) {
                    maskCtx.save();
                    const clipPath = createClusterClipPath(enclosingCluster.cluster, cameraOffsetX, cameraOffsetY);
                    maskCtx.clip(clipPath);
                }
                
                // FIRST: Create the transparent cutout hole
                const maskGradient = maskCtx.createRadialGradient(screenX, screenY, lightRadius * 0.08, screenX, screenY, lightRadius);
                maskGradient.addColorStop(0, 'rgba(0,0,0,1)'); // Full cutout at center
                maskGradient.addColorStop(0.4, 'rgba(0,0,0,0.7)'); // Natural transition zone
                maskGradient.addColorStop(0.8, 'rgba(0,0,0,0.3)'); // Gentle fade
                maskGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Complete fade to darkness
                maskCtx.fillStyle = maskGradient;
                maskCtx.beginPath();
                maskCtx.arc(screenX, screenY, lightRadius, 0, Math.PI * 2);
                maskCtx.fill();

                // SECOND: Fill the cutout with dark red gradient (switch composite mode back)
                maskCtx.globalCompositeOperation = 'source-over';
                const redFillRadius = lightRadius; // Same size as cutout to fill completely
                const redGradient = maskCtx.createRadialGradient(screenX, screenY, 0, screenX, screenY, redFillRadius);
                redGradient.addColorStop(0, 'rgba(140, 30, 18, 0.8)'); // Intense dark red center - eerie glow
                redGradient.addColorStop(0.15, 'rgba(120, 25, 15, 0.7)'); // Strong industrial red
                redGradient.addColorStop(0.35, 'rgba(100, 20, 12, 0.6)'); // Deep forge red
                redGradient.addColorStop(0.55, 'rgba(80, 15, 10, 0.5)'); // Darker red midpoint
                redGradient.addColorStop(0.75, 'rgba(60, 12, 8, 0.4)'); // Very dark red
                redGradient.addColorStop(0.9, 'rgba(40, 8, 5, 0.2)'); // Eerie dark edge
                redGradient.addColorStop(1, 'rgba(30, 6, 4, 0)'); // Natural fade to transparent
                maskCtx.fillStyle = redGradient;
                maskCtx.beginPath();
                maskCtx.arc(screenX, screenY, redFillRadius, 0, Math.PI * 2);
                maskCtx.fill();
                
                // Restore context if we applied a clip
                if (enclosingCluster) {
                    maskCtx.restore();
                }
                
                // Switch back to cutout mode for other lights
                maskCtx.globalCompositeOperation = 'destination-out';
            }
        });

        // Render barbecue light cutouts - smaller, subtle red/orange glow (cooking coals)
        barbecues.forEach(barbecue => {
            if (barbecue.isBurning) {
                // Sprite is CENTERED on posY, so visual center = posY
                const visualCenterWorldY = barbecue.posY;
                const adjustedGradientCenterWorldY = visualCenterWorldY;
                
                const screenX = barbecue.posX + cameraOffsetX;
                const screenY = adjustedGradientCenterWorldY + cameraOffsetY;
                
                // Check if barbecue is inside an enclosed building
                const enclosingCluster = buildingClusters 
                    ? findEnclosingCluster(barbecue.posX, barbecue.posY, buildingClusters)
                    : null;
                
                // SMALL BARBECUE CUTOUT - Much smaller than campfire, subtle glow from coals
                const lightRadius = BARBECUE_LIGHT_RADIUS_BASE * 1.0; // Smaller radius for realistic cooking glow
                
                // Apply clip if inside a building (clip affects both cutout and red fill)
                if (enclosingCluster) {
                    maskCtx.save();
                    const clipPath = createClusterClipPath(enclosingCluster.cluster, cameraOffsetX, cameraOffsetY);
                    maskCtx.clip(clipPath);
                }
                
                // FIRST: Create a small transparent cutout hole (much smaller than campfire)
                const maskGradient = maskCtx.createRadialGradient(screenX, screenY, lightRadius * 0.05, screenX, screenY, lightRadius);
                maskGradient.addColorStop(0, 'rgba(0,0,0,0.5)'); // Partial cutout at center (not full)
                maskGradient.addColorStop(0.3, 'rgba(0,0,0,0.3)'); // Gentle transition
                maskGradient.addColorStop(0.6, 'rgba(0,0,0,0.15)'); // Subtle fade
                maskGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Complete fade to darkness
                maskCtx.fillStyle = maskGradient;
                maskCtx.beginPath();
                maskCtx.arc(screenX, screenY, lightRadius, 0, Math.PI * 2);
                maskCtx.fill();

                // SECOND: Fill the cutout with warm red-orange coal glow (switch composite mode back)
                maskCtx.globalCompositeOperation = 'source-over';
                const glowFillRadius = lightRadius * 0.9; // Slightly smaller than cutout
                const glowGradient = maskCtx.createRadialGradient(screenX, screenY, 0, screenX, screenY, glowFillRadius);
                glowGradient.addColorStop(0, 'rgba(200, 60, 30, 0.35)'); // Warm red-orange center - hot coals
                glowGradient.addColorStop(0.2, 'rgba(180, 50, 25, 0.28)'); // Deep ember red
                glowGradient.addColorStop(0.4, 'rgba(150, 40, 20, 0.20)'); // Darker coal red
                glowGradient.addColorStop(0.6, 'rgba(120, 30, 15, 0.12)'); // Very subtle red
                glowGradient.addColorStop(0.8, 'rgba(90, 20, 10, 0.06)'); // Faint edge glow
                glowGradient.addColorStop(1, 'rgba(60, 15, 8, 0)'); // Natural fade to transparent
                maskCtx.fillStyle = glowGradient;
                maskCtx.beginPath();
                maskCtx.arc(screenX, screenY, glowFillRadius, 0, Math.PI * 2);
                maskCtx.fill();
                
                // Restore context if we applied a clip
                if (enclosingCluster) {
                    maskCtx.restore();
                }
                
                // Switch back to cutout mode for other lights
                maskCtx.globalCompositeOperation = 'destination-out';
            }
        });

        // Render torch light cutouts
        players.forEach((player, playerId) => {
            if (!player || player.isDead) return;

            const equipment = activeEquipments.get(playerId);
            if (!equipment || !equipment.equippedItemDefId) {
                return;
            }
            const itemDef = itemDefinitions.get(equipment.equippedItemDefId.toString());
            if (!itemDef || itemDef.name !== "Torch") {
                return;
            }

            if (itemDef && itemDef.name === "Torch" && player.isTorchLit) {
                // Use the same interpolated position logic as torch light rendering for smooth cutouts
                let renderPositionX = player.positionX;
                let renderPositionY = player.positionY;
                
                if (playerId === localPlayerId && predictedPosition) {
                    // For local player, use predicted position
                    renderPositionX = predictedPosition.x;
                    renderPositionY = predictedPosition.y;
                } else if (playerId !== localPlayerId && remotePlayerInterpolation) {
                    // For remote players, use interpolated position
                    const interpolatedPos = remotePlayerInterpolation.updateAndGetSmoothedPosition(player, localPlayerId);
                    if (interpolatedPos) {
                        renderPositionX = interpolatedPos.x;
                        renderPositionY = interpolatedPos.y;
                    }
                }
                
                // Check if player with torch is inside an enclosed building
                const enclosingCluster = buildingClusters 
                    ? findEnclosingCluster(renderPositionX, renderPositionY, buildingClusters)
                    : null;
                
                const lightScreenX = renderPositionX + cameraOffsetX;
                const lightScreenY = renderPositionY + cameraOffsetY;

                // TORCH CUTOUT - 1.25x larger inner bright area with natural rustic gradient
                const flicker = (Math.random() - 0.5) * 2 * TORCH_FLICKER_AMOUNT;
                const currentLightRadius = Math.max(0, (TORCH_LIGHT_RADIUS_BASE * 1.25) + flicker);

                // Use clipped rendering if inside a building
                renderClippedLightCutout(
                    maskCtx,
                    lightScreenX,
                    lightScreenY,
                    currentLightRadius,
                    [
                        { stop: 0.12, alpha: 1 },    // Full cutout at center
                        { stop: 0.35, alpha: 0.8 },  // Natural transition zone
                        { stop: 0.75, alpha: 0.4 },  // Gentle fade
                        { stop: 1, alpha: 0 },       // Complete fade to darkness
                    ],
                    enclosingCluster,
                    cameraOffsetX,
                    cameraOffsetY
                );
            }
        });

        // Render headlamp light cutouts (head armor - tallow burning lamp)
        players.forEach((player, playerId) => {
            if (!player || player.isDead || !player.isHeadlampLit) return;

            // Use the same interpolated position logic as other lights for smooth cutouts
            let renderPositionX = player.positionX;
            let renderPositionY = player.positionY;
            
            if (playerId === localPlayerId && predictedPosition) {
                // For local player, use predicted position
                renderPositionX = predictedPosition.x;
                renderPositionY = predictedPosition.y;
            } else if (playerId !== localPlayerId && remotePlayerInterpolation) {
                // For remote players, use interpolated position
                const interpolatedPos = remotePlayerInterpolation.updateAndGetSmoothedPosition(player, localPlayerId);
                if (interpolatedPos) {
                    renderPositionX = interpolatedPos.x;
                    renderPositionY = interpolatedPos.y;
                }
            }
            
            // Check if player with headlamp is inside an enclosed building
            const enclosingCluster = buildingClusters 
                ? findEnclosingCluster(renderPositionX, renderPositionY, buildingClusters)
                : null;
            
            const lightScreenX = renderPositionX + cameraOffsetX;
            const lightScreenY = renderPositionY + cameraOffsetY;

            // Headlamp cutout - same style as torch, scaled up (2x torch radius)
            const flicker = (Math.random() - 0.5) * 2 * HEADLAMP_FLICKER_AMOUNT;
            const currentLightRadius = Math.max(0, (HEADLAMP_LIGHT_RADIUS_BASE * 1.25) + flicker);

            // Use clipped rendering if inside a building
            renderClippedLightCutout(
                maskCtx,
                lightScreenX,
                lightScreenY,
                currentLightRadius,
                [
                    { stop: 0.12, alpha: 1 },    // Full cutout at center
                    { stop: 0.35, alpha: 0.8 },  // Natural transition zone
                    { stop: 0.75, alpha: 0.4 },  // Gentle fade
                    { stop: 1, alpha: 0 },       // Complete fade to darkness
                ],
                enclosingCluster,
                cameraOffsetX,
                cameraOffsetY
            );
        });

        // Render flashlight beam cutouts (AAA pixel art style - narrow, long beam)
        players.forEach((player, playerId) => {
            if (!player || player.isDead || !player.isFlashlightOn) return;

            // Player has flashlight on - render the beam cutout
            // Use the same interpolated position logic as torch light rendering for smooth cutouts
            let renderPositionX = player.positionX;
            let renderPositionY = player.positionY;
            
            if (playerId === localPlayerId && predictedPosition) {
                // For local player, use predicted position
                renderPositionX = predictedPosition.x;
                renderPositionY = predictedPosition.y;
            } else if (playerId !== localPlayerId && remotePlayerInterpolation) {
                // For remote players, use interpolated position
                const interpolatedPos = remotePlayerInterpolation.updateAndGetSmoothedPosition(player, localPlayerId);
                if (interpolatedPos) {
                    renderPositionX = interpolatedPos.x;
                    renderPositionY = interpolatedPos.y;
                }
            }
            
            // Check if player with flashlight is inside an enclosed building
            const enclosingCluster = buildingClusters 
                ? findEnclosingCluster(renderPositionX, renderPositionY, buildingClusters)
                : null;

            // FLASHLIGHT BEAM - Narrow, long cone cutout (matches lightRenderingUtils constants)
            const FLASHLIGHT_BEAM_LENGTH = 650; // Very long reach for exploration
            const FLASHLIGHT_BEAM_ANGLE = Math.PI / 7; // ~25 degrees - narrow focused beam
            const FLASHLIGHT_START_OFFSET = 18; // Start beam slightly ahead of player
            
            // Determine beam direction - use mouse target for local player, synced angle for remote players
            let beamAngle = 0;
            const isLocalPlayerFlashlight = playerId === localPlayerId;
            
            if (isLocalPlayerFlashlight && 
                worldMouseX !== undefined && worldMouseX !== null && 
                worldMouseY !== undefined && worldMouseY !== null) {
                // Calculate angle from player to mouse for smooth 360° aiming (local player)
                const dx = worldMouseX - renderPositionX;
                const dy = worldMouseY - renderPositionY;
                beamAngle = Math.atan2(dy, dx);
            } else {
                // Use synced flashlight aim angle for remote players
                beamAngle = player.flashlightAimAngle ?? 0;
            }

            // Offset the beam start position slightly ahead of the player
            const offsetX = Math.cos(beamAngle) * FLASHLIGHT_START_OFFSET;
            const offsetY = Math.sin(beamAngle) * FLASHLIGHT_START_OFFSET;
            
            const lightScreenX = renderPositionX + cameraOffsetX + offsetX;
            const lightScreenY = renderPositionY + cameraOffsetY + offsetY;

            // Calculate cone vertices - narrow, long beam
            const startX = lightScreenX;
            const startY = lightScreenY;
            const endX = startX + Math.cos(beamAngle) * FLASHLIGHT_BEAM_LENGTH;
            const endY = startY + Math.sin(beamAngle) * FLASHLIGHT_BEAM_LENGTH;
            
            // Calculate cone width at the end (half-width) - narrow cone
            const halfWidth = FLASHLIGHT_BEAM_LENGTH * Math.tan(FLASHLIGHT_BEAM_ANGLE / 2);
            
            // Perpendicular vector for cone width
            const perpX = -Math.sin(beamAngle) * halfWidth;
            const perpY = Math.cos(beamAngle) * halfWidth;
            
            const leftX = endX + perpX;
            const leftY = endY + perpY;
            const rightX = endX - perpX;
            const rightY = endY - perpY;

            // Apply clipping if inside a building (same pattern as torch/campfire)
            if (enclosingCluster) {
                maskCtx.save();
                const clipPath = createClusterClipPath(enclosingCluster.cluster, cameraOffsetX, cameraOffsetY);
                maskCtx.clip(clipPath);
            }

            // === LAYER 1: Wide outer glow cutout (soft ambient light) ===
            const outerGlowLength = FLASHLIGHT_BEAM_LENGTH * 1.15;
            const outerGlowWidth = halfWidth * 1.5;
            const outerEndX = startX + Math.cos(beamAngle) * outerGlowLength;
            const outerEndY = startY + Math.sin(beamAngle) * outerGlowLength;
            const outerLeftX = outerEndX + (-Math.sin(beamAngle) * outerGlowWidth);
            const outerLeftY = outerEndY + (Math.cos(beamAngle) * outerGlowWidth);
            const outerRightX = outerEndX - (-Math.sin(beamAngle) * outerGlowWidth);
            const outerRightY = outerEndY - (Math.cos(beamAngle) * outerGlowWidth);

            const outerGradient = maskCtx.createLinearGradient(startX, startY, outerEndX, outerEndY);
            outerGradient.addColorStop(0, 'rgba(0,0,0,0.5)');
            outerGradient.addColorStop(0.4, 'rgba(0,0,0,0.3)');
            outerGradient.addColorStop(0.7, 'rgba(0,0,0,0.12)');
            outerGradient.addColorStop(1, 'rgba(0,0,0,0)');

            maskCtx.fillStyle = outerGradient;
            maskCtx.beginPath();
            maskCtx.moveTo(startX, startY);
            maskCtx.lineTo(outerLeftX, outerLeftY);
            maskCtx.lineTo(outerRightX, outerRightY);
            maskCtx.closePath();
            maskCtx.fill();

            // === LAYER 2: Main beam cutout ===
            const mainGradient = maskCtx.createLinearGradient(startX, startY, endX, endY);
            mainGradient.addColorStop(0, 'rgba(0,0,0,1)'); // Full cutout at start
            mainGradient.addColorStop(0.2, 'rgba(0,0,0,0.95)');
            mainGradient.addColorStop(0.45, 'rgba(0,0,0,0.75)');
            mainGradient.addColorStop(0.65, 'rgba(0,0,0,0.45)');
            mainGradient.addColorStop(0.85, 'rgba(0,0,0,0.15)');
            mainGradient.addColorStop(1, 'rgba(0,0,0,0)');

            maskCtx.fillStyle = mainGradient;
            maskCtx.beginPath();
            maskCtx.moveTo(startX, startY);
            maskCtx.lineTo(leftX, leftY);
            maskCtx.lineTo(rightX, rightY);
            maskCtx.closePath();
            maskCtx.fill();

            // === LAYER 3: Hot core beam cutout (brightest center) ===
            const coreLength = FLASHLIGHT_BEAM_LENGTH * 0.7;
            const coreWidth = halfWidth * 0.4;
            const coreEndX = startX + Math.cos(beamAngle) * coreLength;
            const coreEndY = startY + Math.sin(beamAngle) * coreLength;
            const coreLeftX = coreEndX + (-Math.sin(beamAngle) * coreWidth);
            const coreLeftY = coreEndY + (Math.cos(beamAngle) * coreWidth);
            const coreRightX = coreEndX - (-Math.sin(beamAngle) * coreWidth);
            const coreRightY = coreEndY - (Math.cos(beamAngle) * coreWidth);

            const coreGradient = maskCtx.createLinearGradient(startX, startY, coreEndX, coreEndY);
            coreGradient.addColorStop(0, 'rgba(0,0,0,1)'); // Full cutout
            coreGradient.addColorStop(0.35, 'rgba(0,0,0,0.95)');
            coreGradient.addColorStop(0.7, 'rgba(0,0,0,0.6)');
            coreGradient.addColorStop(1, 'rgba(0,0,0,0)');

            maskCtx.fillStyle = coreGradient;
            maskCtx.beginPath();
            maskCtx.moveTo(startX, startY);
            maskCtx.lineTo(coreLeftX, coreLeftY);
            maskCtx.lineTo(coreRightX, coreRightY);
            maskCtx.closePath();
            maskCtx.fill();

            // === LAYER 4: Bright hotspot at source ===
            const hotspotRadius = 20;
            const hotspotGradient = maskCtx.createRadialGradient(
                startX, startY, 0,
                startX, startY, hotspotRadius
            );
            hotspotGradient.addColorStop(0, 'rgba(0,0,0,1)');
            hotspotGradient.addColorStop(0.5, 'rgba(0,0,0,0.7)');
            hotspotGradient.addColorStop(1, 'rgba(0,0,0,0)');

            maskCtx.fillStyle = hotspotGradient;
            maskCtx.beginPath();
            maskCtx.arc(startX, startY, hotspotRadius, 0, Math.PI * 2);
            maskCtx.fill();

            // Restore context if we applied a clip
            if (enclosingCluster) {
                maskCtx.restore();
            }
        });

        // ============================================================================
        // SOVA AURA - Local player night-vision aid (client-side only)
        // ============================================================================
        // Renders a subtle cutout around the LOCAL player ONLY during nighttime.
        // This helps the player see in the dark without competing with actual light sources.
        // It is purely visual - no gameplay effects, not visible to remote players, not on minimap.
        // ============================================================================
        if (typeof currentCycleProgress === 'number' && localPlayerId && predictedPosition) {
            // Aura is only visible during nighttime: after dusk (0.72) and before dawn (0.05, wrapping around 1.0)
            const isNightTimeForAura = currentCycleProgress >= 0.72 || currentCycleProgress <= 0.05;
            
            if (isNightTimeForAura) {
                const lightScreenX = predictedPosition.x + cameraOffsetX;
                const lightScreenY = predictedPosition.y + cameraOffsetY;
                
                // SOVA Aura cutout - subtle visibility bubble, weaker than torch
                // Uses very soft alpha values to avoid competing with actual light sources
                const auraRadius = SOVA_AURA_RADIUS_BASE;
                
                const maskGradient = maskCtx.createRadialGradient(
                    lightScreenX, lightScreenY, auraRadius * 0.05, // Inner radius (5% of total)
                    lightScreenX, lightScreenY, auraRadius // Outer radius
                );
                
                // Very soft cutout - much weaker than torch (which uses 1.0, 0.8, 0.4, 0)
                // This creates a subtle visibility improvement without overpowering the night
                maskGradient.addColorStop(0, 'rgba(0,0,0,0.35)'); // Subtle visibility at center (torch is 1.0)
                maskGradient.addColorStop(0.3, 'rgba(0,0,0,0.25)'); // Soft transition
                maskGradient.addColorStop(0.6, 'rgba(0,0,0,0.12)'); // Gentle fade
                maskGradient.addColorStop(0.85, 'rgba(0,0,0,0.04)'); // Very soft edge
                maskGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Complete fade to darkness
                
                maskCtx.fillStyle = maskGradient;
                maskCtx.beginPath();
                maskCtx.arc(lightScreenX, lightScreenY, auraRadius, 0, Math.PI * 2);
                maskCtx.fill();
            }
        }
        // === END SOVA AURA ===

        // Render compound building light cutouts (guardpost street lamps)
        // These are static lights that are always on at night
        const buildingsWithLights = getCompoundBuildingsWithLights();
        buildingsWithLights.forEach(({ building, lightWorldX, lightWorldY }) => {
            const lightSource = building.lightSource!;
            const screenX = lightWorldX + cameraOffsetX;
            const screenY = lightWorldY + cameraOffsetY;
            
            // Calculate effective light radius with intensity
            const intensity = lightSource.intensity ?? 1.0;
            const lightRadius = lightSource.radius * intensity;
            
            // FIRST: Create the transparent cutout hole for visibility
            const maskGradient = maskCtx.createRadialGradient(
                screenX, screenY, lightRadius * 0.05, // Inner radius (5% of total)
                screenX, screenY, lightRadius // Outer radius
            );
            
            // Street lamp style cutout - strong center, gradual fade (cone-like illumination)
            maskGradient.addColorStop(0, 'rgba(0,0,0,1)'); // Full cutout at center
            maskGradient.addColorStop(0.15, 'rgba(0,0,0,0.95)'); // Strong cutout zone
            maskGradient.addColorStop(0.35, 'rgba(0,0,0,0.8)'); // Gradual transition
            maskGradient.addColorStop(0.55, 'rgba(0,0,0,0.5)'); // Mid fade
            maskGradient.addColorStop(0.75, 'rgba(0,0,0,0.25)'); // Gentle fade
            maskGradient.addColorStop(0.9, 'rgba(0,0,0,0.08)'); // Very soft edge
            maskGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Complete fade to darkness
            
            maskCtx.fillStyle = maskGradient;
            maskCtx.beginPath();
            maskCtx.arc(screenX, screenY, lightRadius, 0, Math.PI * 2);
            maskCtx.fill();
            
            // SECOND: Add warm street lamp glow tint if color is specified
            if (lightSource.color) {
                maskCtx.globalCompositeOperation = 'source-over';
                
                const { r, g, b } = lightSource.color;
                const glowRadius = lightRadius * 0.9; // Slightly smaller than cutout
                
                // Warm street lamp glow gradient
                const glowGradient = maskCtx.createRadialGradient(
                    screenX, screenY, 0,
                    screenX, screenY, glowRadius
                );
                
                // Subtle warm tint that doesn't overpower the cutout
                glowGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.18)`); // Soft warm center
                glowGradient.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, 0.14)`); // Gradual fade
                glowGradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.10)`); // Mid transition
                glowGradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.06)`); // Gentle fade
                glowGradient.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, 0.02)`); // Very soft edge
                glowGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`); // Fade to transparent
                
                maskCtx.fillStyle = glowGradient;
                maskCtx.beginPath();
                maskCtx.arc(screenX, screenY, glowRadius, 0, Math.PI * 2);
                maskCtx.fill();
                
                // Switch back to cutout mode for other lights
                maskCtx.globalCompositeOperation = 'destination-out';
            }
        });

        // Render fire patch light cutouts (smaller than campfires, same size as the patch)
        firePatches.forEach(firePatch => {
            // Fire patches are always burning (no isBurning check needed)
            // Skip if intensity is too low
            if (firePatch.currentIntensity < 0.1) return;
            
            const screenX = firePatch.posX + cameraOffsetX;
            const screenY = firePatch.posY + cameraOffsetY;
            
            // Fire patch cutout - smaller than campfire, matches the visual radius
            // Use the same radius as the visual fire patch (FIRE_PATCH_VISUAL_RADIUS = 40)
            const lightRadius = FIRE_PATCH_VISUAL_RADIUS * 1.5; // Slightly larger cutout for better visibility
            const maskGradient = maskCtx.createRadialGradient(screenX, screenY, lightRadius * 0.08, screenX, screenY, lightRadius);
            maskGradient.addColorStop(0, 'rgba(0,0,0,1)'); // Full cutout at center
            maskGradient.addColorStop(0.4, 'rgba(0,0,0,0.7)'); // Natural transition zone
            maskGradient.addColorStop(0.8, 'rgba(0,0,0,0.3)'); // Gentle fade
            maskGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Complete fade to darkness
            maskCtx.fillStyle = maskGradient;
            maskCtx.beginPath();
            maskCtx.arc(screenX, screenY, lightRadius, 0, Math.PI * 2);
            maskCtx.fill();
        });

        // Render fumarole light cutouts - geothermal vents emit heat/light visible at night
        // Fumaroles are always active (no isBurning check needed)
        fumaroles.forEach(fumarole => {
            const screenX = fumarole.posX + cameraOffsetX;
            const screenY = fumarole.posY + cameraOffsetY;
            
            // Fumarole cutout radius - large heat area (600px warmth radius on server)
            const FUMAROLE_CUTOUT_RADIUS = 300; // Visual cutout is half the warmth radius for better aesthetics
            const lightRadius = FUMAROLE_CUTOUT_RADIUS;
            
            // FIRST: Create the transparent cutout hole for visibility
            const maskGradient = maskCtx.createRadialGradient(
                screenX, screenY, lightRadius * 0.05, // Inner radius (5% of total)
                screenX, screenY, lightRadius // Outer radius
            );
            
            // Strong cutout with smooth fade - creates visible area around fumarole
            maskGradient.addColorStop(0, 'rgba(0,0,0,1)'); // Full cutout at center
            maskGradient.addColorStop(0.25, 'rgba(0,0,0,0.85)'); // Strong cutout zone
            maskGradient.addColorStop(0.5, 'rgba(0,0,0,0.6)'); // Gradual transition
            maskGradient.addColorStop(0.75, 'rgba(0,0,0,0.3)'); // Gentle fade
            maskGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Complete fade to darkness
            
            maskCtx.fillStyle = maskGradient;
            maskCtx.beginPath();
            maskCtx.arc(screenX, screenY, lightRadius, 0, Math.PI * 2);
            maskCtx.fill();

            // SECOND: Fill the cutout with warm orange/red geothermal glow (switch composite mode back)
            maskCtx.globalCompositeOperation = 'source-over';
            
            // Add subtle heat shimmer effect using time-based intensity
            const heatPulse = (Date.now() / 2000) % (Math.PI * 2); // 2 second cycle
            const heatIntensity = 1.0 + Math.sin(heatPulse) * 0.1; // ±10% pulse
            
            // Warm orange-red geothermal glow gradient
            const heatFillRadius = lightRadius; // Same size as cutout to fill completely
            const heatGradient = maskCtx.createRadialGradient(screenX, screenY, 0, screenX, screenY, heatFillRadius);
            heatGradient.addColorStop(0, `rgba(255, 120, 40, ${0.35 * heatIntensity})`); // Bright orange center - intense heat
            heatGradient.addColorStop(0.15, `rgba(240, 90, 30, ${0.30 * heatIntensity})`); // Hot orange
            heatGradient.addColorStop(0.35, `rgba(200, 70, 25, ${0.22 * heatIntensity})`); // Deep orange-red
            heatGradient.addColorStop(0.55, `rgba(160, 50, 20, ${0.15 * heatIntensity})`); // Dark red-orange
            heatGradient.addColorStop(0.75, `rgba(120, 40, 15, ${0.08 * heatIntensity})`); // Very dark red
            heatGradient.addColorStop(0.9, `rgba(80, 30, 10, ${0.03 * heatIntensity})`); // Faint edge glow
            heatGradient.addColorStop(1, 'rgba(60, 20, 8, 0)'); // Natural fade to transparent
            
            maskCtx.fillStyle = heatGradient;
            maskCtx.beginPath();
            maskCtx.arc(screenX, screenY, heatFillRadius, 0, Math.PI * 2);
            maskCtx.fill();
            
            // Switch back to cutout mode for other lights
            maskCtx.globalCompositeOperation = 'destination-out';
        });

        // Render rune stone light cutouts with colored atmospheric glows (only at night: twilight evening to twilight morning)
        // Excludes Dawn (0.0-0.05) - only shows from twilight evening (0.76) to twilight morning (ends at 1.0)
        if (typeof currentCycleProgress === 'number') {
            const isNightTime = currentCycleProgress >= 0.76; // Twilight evening (0.76) through twilight morning (ends at 1.0)
            
            if (isNightTime) {
                runeStones.forEach(runeStone => {
                    // Center on the rune stone light center (offset upward to match visual mass)
                    // LIGHT_CENTER_Y_OFFSET = 140 (doubled from 70) - matches runeStoneRenderingUtils.ts
                    const LIGHT_CENTER_Y_OFFSET = 140;
                    const screenX = runeStone.posX + cameraOffsetX;
                    const screenY = runeStone.posY + cameraOffsetY - LIGHT_CENTER_Y_OFFSET;
                    
                    // Larger cutout radius to match doubled rune stone size (was 600, now 880 to match NIGHT_LIGHT_RADIUS * 2)
                    const RUNE_STONE_CUTOUT_RADIUS = 880;
                    const lightRadius = RUNE_STONE_CUTOUT_RADIUS;
                    
                    // FIRST: Create the transparent cutout hole
                    const maskGradient = maskCtx.createRadialGradient(
                        screenX, screenY, lightRadius * 0.05, // Inner radius (5% of total)
                        screenX, screenY, lightRadius // Outer radius
                    );
                    
                    // Strong cutout with smooth fade - creates visible light area
                    maskGradient.addColorStop(0, 'rgba(0,0,0,1)'); // Full cutout at center
                    maskGradient.addColorStop(0.2, 'rgba(0,0,0,0.9)'); // Strong cutout zone
                    maskGradient.addColorStop(0.4, 'rgba(0,0,0,0.7)'); // Gradual transition
                    maskGradient.addColorStop(0.6, 'rgba(0,0,0,0.5)'); // Mid fade
                    maskGradient.addColorStop(0.8, 'rgba(0,0,0,0.25)'); // Gentle fade
                    maskGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Complete fade to darkness
                    
                    maskCtx.fillStyle = maskGradient;
                    maskCtx.beginPath();
                    maskCtx.arc(screenX, screenY, lightRadius, 0, Math.PI * 2);
                    maskCtx.fill();

                    // SECOND: Fill the entire cutout area with diffuse atmospheric color glow (AAA Sea of Stars quality)
                    // Multi-layered approach: entire area bathed in magical light, not just a ring
                    maskCtx.globalCompositeOperation = 'source-over';
                    
                    // Determine rune stone color and calculate time-based intensity
                    const runeType = runeStone.runeType?.tag || 'Blue';
                    
                    // Calculate intensity based on time of night (subtle pulsing effect)
                    let timeIntensity = 1.0;
                    if (currentCycleProgress < 0.80) {
                        // Twilight evening (0.76-0.80) - fade in
                        timeIntensity = (currentCycleProgress - 0.76) / 0.04;
                    } else if (currentCycleProgress >= 0.97) {
                        // Twilight morning (0.97-1.0) - fade out
                        timeIntensity = (1.0 - currentCycleProgress) / 0.03;
                    }
                    // Add subtle breathing/pulsing effect (very gentle, mystical)
                    const breathingPhase = (Date.now() / 3000) % (Math.PI * 2); // 3 second cycle
                    const breathingIntensity = 1.0 + Math.sin(breathingPhase) * 0.08; // ±8% gentle pulse
                    const finalIntensity = timeIntensity * breathingIntensity;
                    
                    // LAYER 1: Ambient atmospheric glow - fills entire cutout area with soft color tint
                    // Gradient radius matches cutout radius exactly - fills the entire 600px cutout area
                    const ambientRadius = lightRadius; // Same as cutout radius - fills entire cutout area
                    let ambientGradient: CanvasGradient;
                    
                    if (runeType === 'Green') {
                        // Emerald - Mystical agrarian magic: fills entire cutout with strong color
                        ambientGradient = maskCtx.createRadialGradient(screenX, screenY, 0, screenX, screenY, ambientRadius);
                        ambientGradient.addColorStop(0, `rgba(40, 140, 50, ${0.25 * finalIntensity})`); // Bright emerald center
                        ambientGradient.addColorStop(0.2, `rgba(38, 135, 48, ${0.24 * finalIntensity})`); // Strong emerald
                        ambientGradient.addColorStop(0.5, `rgba(35, 120, 45, ${0.23 * finalIntensity})`); // Rich emerald - maintains strength
                        ambientGradient.addColorStop(0.8, `rgba(33, 115, 43, ${0.22 * finalIntensity})`); // Still strong emerald
                        ambientGradient.addColorStop(0.95, `rgba(30, 105, 40, ${0.18 * finalIntensity})`); // Slight fade near edge
                        ambientGradient.addColorStop(1, 'rgba(25, 90, 35, 0)'); // Only fade at very edge
                    } else if (runeType === 'Red') {
                        // Crimson - Forge fire magic: fills entire cutout with strong color
                        ambientGradient = maskCtx.createRadialGradient(screenX, screenY, 0, screenX, screenY, ambientRadius);
                        ambientGradient.addColorStop(0, `rgba(200, 50, 50, ${0.28 * finalIntensity})`); // Bright crimson center
                        ambientGradient.addColorStop(0.2, `rgba(195, 48, 48, ${0.27 * finalIntensity})`); // Strong crimson
                        ambientGradient.addColorStop(0.5, `rgba(180, 45, 45, ${0.26 * finalIntensity})`); // Rich crimson - maintains strength
                        ambientGradient.addColorStop(0.8, `rgba(175, 43, 43, ${0.25 * finalIntensity})`); // Still strong crimson
                        ambientGradient.addColorStop(0.95, `rgba(165, 40, 40, ${0.20 * finalIntensity})`); // Slight fade near edge
                        ambientGradient.addColorStop(1, 'rgba(150, 35, 35, 0)'); // Only fade at very edge
                    } else {
                        // Azure - Memory shard magic: fills entire cutout with strong color
                        ambientGradient = maskCtx.createRadialGradient(screenX, screenY, 0, screenX, screenY, ambientRadius);
                        ambientGradient.addColorStop(0, `rgba(60, 140, 220, ${0.26 * finalIntensity})`); // Bright azure center
                        ambientGradient.addColorStop(0.2, `rgba(58, 135, 215, ${0.25 * finalIntensity})`); // Strong azure
                        ambientGradient.addColorStop(0.5, `rgba(55, 120, 200, ${0.24 * finalIntensity})`); // Rich azure - maintains strength
                        ambientGradient.addColorStop(0.8, `rgba(53, 115, 195, ${0.23 * finalIntensity})`); // Still strong azure
                        ambientGradient.addColorStop(0.95, `rgba(50, 105, 185, ${0.19 * finalIntensity})`); // Slight fade near edge
                        ambientGradient.addColorStop(1, 'rgba(45, 90, 170, 0)'); // Only fade at very edge
                    }
                    
                    maskCtx.fillStyle = ambientGradient;
                    maskCtx.beginPath();
                    maskCtx.arc(screenX, screenY, ambientRadius, 0, Math.PI * 2);
                    maskCtx.fill();
                    
                    // Switch back to cutout mode for other lights
                    maskCtx.globalCompositeOperation = 'destination-out';
                });
            }
        }
        
        maskCtx.globalCompositeOperation = 'source-over';

    }, [worldState, campfires, lanterns, furnaces, barbecues, runeStones, firePatches, fumaroles, players, activeEquipments, itemDefinitions, cameraOffsetX, cameraOffsetY, canvasSize.width, canvasSize.height, torchLitStatesKey, headlampLitStatesKey, lanternBurningStatesKey, localPlayerId, predictedPosition, remotePlayerInterpolation, buildingClusters]);

    return { overlayRgba, maskCanvasRef };
} 