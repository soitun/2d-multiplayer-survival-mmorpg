import { useEffect, useRef, useState, useMemo } from 'react';
import {
    Campfire as SpacetimeDBCampfire,
    Lantern as SpacetimeDBLantern,
    Furnace as SpacetimeDBFurnace,
    HomesteadHearth as SpacetimeDBHomesteadHearth, // ADDED: HomesteadHearth
    WorldState as SpacetimeDBWorldState,
    Player as SpacetimeDBPlayer,
    ActiveEquipment as SpacetimeDBActiveEquipment,
    ItemDefinition as SpacetimeDBItemDefinition,
    RuneStone as SpacetimeDBRuneStone, // ADDED: RuneStone
} from '../generated';
import { CAMPFIRE_LIGHT_RADIUS_BASE, CAMPFIRE_FLICKER_AMOUNT, LANTERN_LIGHT_RADIUS_BASE, LANTERN_FLICKER_AMOUNT, FURNACE_LIGHT_RADIUS_BASE, FURNACE_FLICKER_AMOUNT, HEARTH_LIGHT_RADIUS_BASE, HEARTH_FLICKER_AMOUNT } from '../utils/renderers/lightRenderingUtils';
import { CAMPFIRE_HEIGHT } from '../utils/renderers/campfireRenderingUtils';
import { LANTERN_HEIGHT } from '../utils/renderers/lanternRenderingUtils';
import { FURNACE_HEIGHT, FURNACE_RENDER_Y_OFFSET } from '../utils/renderers/furnaceRenderingUtils';
import { HEARTH_HEIGHT, HEARTH_RENDER_Y_OFFSET } from '../utils/renderers/hearthRenderingUtils'; // ADDED: Hearth constants

export interface ColorPoint {
  r: number; g: number; b: number; a: number;
}

// Default night: Dark, desaturated blue/grey
export const defaultPeakMidnightColor: ColorPoint = { r: 0, g: 0, b: 0, a: 1.0 };
export const defaultTransitionNightColor: ColorPoint = { r: 40, g: 50, b: 70, a: 0.75 };

// Full Moon night: Brighter, cooler grey/blue, less saturated
export const fullMoonPeakMidnightColor: ColorPoint =    { r: 90, g: 110, b: 130, a: 0.48 };
export const fullMoonTransitionNightColor: ColorPoint = { r: 75, g: 100, b: 125, a: 0.58 };

// Base keyframes
export const baseKeyframes: Record<number, ColorPoint> = {
  0.00: defaultPeakMidnightColor,
  0.20: defaultTransitionNightColor,
  0.35: { r: 255, g: 180, b: 120, a: 0.25 },
  0.50: { r: 0, g: 0, b: 0, a: 0.0 },
  0.65: { r: 255, g: 210, b: 150, a: 0.15 },
  0.75: { r: 255, g: 150, b: 100, a: 0.35 },
  0.85: { r: 80, g: 70, b: 90, a: 0.60 },
  0.95: defaultTransitionNightColor,
  1.00: defaultPeakMidnightColor,
};
// --- END ADDED Day/Night Cycle Constants ---

// Define TORCH_LIGHT_RADIUS_BASE locally
const TORCH_LIGHT_RADIUS_BASE = CAMPFIRE_LIGHT_RADIUS_BASE * 0.8; // Slightly smaller than campfire
const TORCH_FLICKER_AMOUNT = CAMPFIRE_FLICKER_AMOUNT * 0.7; // Added for torch flicker

// Define RGB colors for overlay tints - UPDATED FOR 25-MINUTE CYCLE (20min day + 5min night)
interface ColorAlphaKeyframe {
  progress: number;
  rgb: [number, number, number];
  alpha: number;
}

// Helper for daytime (effectively transparent)
const DAY_COLOR_CONFIG = { rgb: [0, 0, 0] as [number, number, number], alpha: 0.0 }; // Color doesn't matter when alpha is 0

const REGULAR_CYCLE_KEYFRAMES: ColorAlphaKeyframe[] = [
  // START at 0.0 matching END of Twilight Morning (1.0) - smooth wrap-around transition!
  { progress: 0.0,  rgb: [120, 70, 90],   alpha: 0.55 },   // Early morning purples (matches Twilight Morning end at 1.0)
  
  // Dawn (Server: 0.0 - 0.05, gradual transitions) - FADE OUT (get lighter), not darker!
  { progress: 0.015, rgb: [150, 70, 100],   alpha: 0.45 },   // Getting lighter
  { progress: 0.025, rgb: [160, 80, 90],    alpha: 0.40 },   // Pinks emerge, getting lighter
  { progress: 0.035, rgb: [220, 110, 70],   alpha: 0.30 },   // Oranges appear, much lighter
  { progress: 0.045, rgb: [255, 140, 60],   alpha: 0.20 },   // Bright oranges, very light

  // Morning - Transition to Clear Day (Server: 0.05 - 0.35)
  { progress: 0.06, rgb: [255, 170, 80],   alpha: 0.10 },   // Sunrise peak, almost clear
  { progress: 0.08, rgb: [160, 80, 90],   alpha: 0.50 },   // Pinks and Muted Oranges appear
  { progress: 0.10, rgb: [220, 110, 70],  alpha: 0.35 },   // Oranges strengthen
  { progress: 0.115, rgb: [255, 140, 60],  alpha: 0.20 },   // Brighter Oranges, lower alpha
  { progress: 0.125, rgb: [255, 170, 80],  alpha: 0.10 },   // Sunrise Peak
  { progress: 0.15, rgb: [255, 190, 100], alpha: 0.05 },   // Lingering soft yellow/orange glow
  { progress: 0.18, ...DAY_COLOR_CONFIG },                // Morning fully clear
  
  // Day/Noon/Afternoon clear (80% of cycle = 0.18 to 0.72)
  { progress: 0.35, ...DAY_COLOR_CONFIG }, // Morning clear
  { progress: 0.55, ...DAY_COLOR_CONFIG }, // Noon clear 
  { progress: 0.70, ...DAY_COLOR_CONFIG }, // Afternoon clear

  // Dusk (Server: 0.72 - 0.76, gradual transitions)
  // Match TwilightMorning style - same colors and alpha progression (in reverse)
  { progress: 0.72, rgb: [120, 70, 90],   alpha: 0.55 },   // Early evening purples - matches TwilightMorning end
  { progress: 0.735, rgb: [160, 80, 90],  alpha: 0.50 },   // Pinks and Muted Oranges
  { progress: 0.75, rgb: [220, 110, 70],  alpha: 0.35 },   // Oranges strengthen
  { progress: 0.76, rgb: [255, 140, 60],  alpha: 0.20 },   // Brighter Oranges

  // Twilight Evening (Server: 0.76 - 0.80, LONGER gradual transitions)
  { progress: 0.77, rgb: [150, 70, 100],  alpha: 0.65 },   // Civil Dusk (matches TwilightMorning civil dawn)
  { progress: 0.785, rgb: [80, 50, 90],    alpha: 0.80 },   // Nautical Dusk (matches TwilightMorning nautical dawn)
  { progress: 0.80, rgb: [5, 5, 10],      alpha: 0.96 },   // Astronomical Dusk (matches TwilightMorning astronomical dawn)

  // Night (Server: 0.80 - 0.92) - Slightly lighter than midnight
  { progress: 0.85, rgb: [10, 15, 20],    alpha: 0.88 },   // Deep Night (lighter than midnight)

  // Midnight (Server: 0.92 - 0.97) - Very dark, darkest part of night
  { progress: 0.92, rgb: [defaultPeakMidnightColor.r, defaultPeakMidnightColor.g, defaultPeakMidnightColor.b],    alpha: defaultPeakMidnightColor.a },   // Deepest Midnight start
  { progress: 0.945, rgb: [0, 0, 0],      alpha: 1.0 },   // PITCH BLACK (midnight peak) - true darkness
  { progress: 0.969, rgb: [defaultTransitionNightColor.r, defaultTransitionNightColor.g, defaultTransitionNightColor.b],    alpha: defaultTransitionNightColor.a },   // Transition from midnight to twilight (just before 0.97)

  // Twilight Morning (Server: 0.97 - 1.0, pre-dawn twilight RIGHT BEFORE dawn, wraps around)
  // This wraps around - after 0.97 comes 0.0 (Dawn)
  { progress: 0.97, rgb: [30, 25, 65],    alpha: 0.85 },   // Astronomical Dawn (darkest purple, matches TwilightEvening end)
  { progress: 0.985, rgb: [80, 50, 90],    alpha: 0.80 },   // Nautical Dawn
  { progress: 0.995, rgb: [150, 70, 100],  alpha: 0.65 },   // Civil Dawn
  { progress: 1.0, rgb: [120, 70, 90],   alpha: 0.55 },   // Early morning purples (matches Dusk start, wraps to Dawn)
];

const FULL_MOON_NIGHT_KEYFRAMES: ColorAlphaKeyframe[] = [
  // START at 0.0 matching END of Full Moon Twilight Morning (1.0) - smooth wrap-around!
  { progress: 0.0,  rgb: [200, 175, 165], alpha: 0.15 },   // Early morning silver-pink (matches Twilight Morning end at 1.0)

  // Dawn (Full Moon, gradual transitions) - FADE OUT (get lighter), not darker!
  { progress: 0.015, rgb: [210, 180, 160], alpha: 0.12 },   // Getting lighter
  { progress: 0.025, rgb: [230, 190, 150], alpha: 0.08 },   // Soft oranges, much lighter
  { progress: 0.035, rgb: [250, 200, 140], alpha: 0.04 },   // Bright pale oranges, very light
  { progress: 0.045, rgb: [255, 215, 150], alpha: 0.02 },   // Sunrise peak, almost clear

  // Morning - Transition to Clear Day (Full Moon)
  { progress: 0.06, rgb: [255, 225, 170], alpha: 0.01 },   // Lingering soft glow
  { progress: 0.08, rgb: [210, 180, 160], alpha: 0.12 },   // Pale Pinks/Muted Oranges appear
  { progress: 0.10, rgb: [230, 190, 150], alpha: 0.08 },   // Soft Oranges strengthen
  { progress: 0.115, rgb: [250, 200, 140], alpha: 0.04 },   // Brighter Pale Oranges
  { progress: 0.125, rgb: [255, 215, 150], alpha: 0.02 },   // Sunrise Peak
  { progress: 0.15, rgb: [255, 225, 170], alpha: 0.01 },   // Lingering soft glow
  { progress: 0.18, ...DAY_COLOR_CONFIG },                // Morning fully clear

  // Day/Afternoon (Same as regular, 80% of cycle)
  { progress: 0.35, ...DAY_COLOR_CONFIG },
  { progress: 0.55, ...DAY_COLOR_CONFIG },
  { progress: 0.70, ...DAY_COLOR_CONFIG },

  // Dusk (Full Moon, gradual transitions)
  // Match Full Moon TwilightMorning style - same colors and alpha progression (in reverse)
  { progress: 0.72, rgb: [200, 175, 165], alpha: 0.15 },   // Early evening silver-pink - matches Full Moon TwilightMorning end
  { progress: 0.735, rgb: [210, 180, 160], alpha: 0.12 },   // Pale Pinks/Muted Oranges
  { progress: 0.75, rgb: [230, 190, 150], alpha: 0.08 },   // Soft Oranges strengthen
  { progress: 0.76, rgb: [250, 200, 140], alpha: 0.04 },   // Brighter Pale Oranges

  // Twilight Evening (Full Moon, LONGER gradual transitions)
  { progress: 0.77, rgb: [170, 150, 180], alpha: 0.28 },   // Civil Dusk (matches TwilightMorning civil dawn)
  { progress: 0.785, rgb: [150, 150, 190], alpha: 0.35 },   // Nautical Dusk (matches TwilightMorning nautical dawn)
  { progress: 0.80, rgb: [140, 150, 190], alpha: 0.38 },   // Astronomical Dusk (matches TwilightMorning astronomical dawn)

  // Night (Full Moon, Server: 0.80 - 0.92)
  { progress: 0.85, rgb: [135, 155, 195], alpha: 0.39 },   // Deep Night

  // Midnight (Full Moon, Server: 0.92 - 0.97) - Lighter than regular midnight but still dark
  { progress: 0.92, rgb: [130, 150, 190], alpha: 0.40 },   // Full Moon Midnight start
  { progress: 0.945, rgb: [135, 155, 195], alpha: 0.38 },   // Full Moon Midnight peak
  { progress: 0.969, rgb: [140, 150, 190], alpha: 0.38 },   // Transition from midnight to twilight (just before 0.97)

  // Twilight Morning (Full Moon, Server: 0.97 - 1.0, pre-dawn twilight RIGHT BEFORE dawn)
  // This wraps around - after 0.97 comes 0.0 (Dawn)
  { progress: 0.97, rgb: [150, 160, 190], alpha: 0.32 },   // Astronomical Dawn (matches Dawn start)
  { progress: 0.985, rgb: [150, 150, 190], alpha: 0.35 },   // Nautical Dawn
  { progress: 0.995, rgb: [170, 150, 180], alpha: 0.28 },   // Civil Dawn
  { progress: 1.0, rgb: [200, 175, 165], alpha: 0.15 },   // Early morning silver-pink (matches Dusk start, wraps to Dawn)
];

// Server's full moon cycle interval
const SERVER_FULL_MOON_INTERVAL = 3;

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
    homesteadHearths: Map<string, SpacetimeDBHomesteadHearth>; // ADDED: HomesteadHearths
    runeStones: Map<string, SpacetimeDBRuneStone>; // ADDED: RuneStones for night light cutouts
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
    homesteadHearths, // ADDED: HomesteadHearths
    runeStones, // ADDED: RuneStones
    players,
    activeEquipments,
    itemDefinitions,
    cameraOffsetX,
    cameraOffsetY,
    canvasSize,
    localPlayerId,
    predictedPosition,
    remotePlayerInterpolation,
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
                
                // SUBSTANTIAL CAMPFIRE CUTOUT - 2x larger inner bright area with natural gradient
                const lightRadius = CAMPFIRE_LIGHT_RADIUS_BASE * 2.0; // Double the cutout size
                const maskGradient = maskCtx.createRadialGradient(screenX, screenY, lightRadius * 0.08, screenX, screenY, lightRadius);
                maskGradient.addColorStop(0, 'rgba(0,0,0,1)'); // Full cutout at center
                maskGradient.addColorStop(0.4, 'rgba(0,0,0,0.7)'); // Natural transition zone
                maskGradient.addColorStop(0.8, 'rgba(0,0,0,0.3)'); // Gentle fade
                maskGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Complete fade to darkness
                maskCtx.fillStyle = maskGradient;
                maskCtx.beginPath();
                maskCtx.arc(screenX, screenY, lightRadius, 0, Math.PI * 2);
                maskCtx.fill();
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
                
                // LANTERN CUTOUT - Larger and more stable than torch, but more contained than campfire
                const flicker = (Math.random() - 0.5) * 2 * LANTERN_FLICKER_AMOUNT;
                const lightRadius = Math.max(0, (LANTERN_LIGHT_RADIUS_BASE * 1.8) + flicker); // 1.8x radius for good coverage
                const maskGradient = maskCtx.createRadialGradient(screenX, screenY, lightRadius * 0.05, screenX, screenY, lightRadius);
                maskGradient.addColorStop(0, 'rgba(0,0,0,1)'); // Full cutout at center
                maskGradient.addColorStop(0.3, 'rgba(0,0,0,0.85)'); // Strong cutout zone
                maskGradient.addColorStop(0.6, 'rgba(0,0,0,0.5)'); // Gradual transition
                maskGradient.addColorStop(0.85, 'rgba(0,0,0,0.2)'); // Gentle fade
                maskGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Complete fade to darkness
                maskCtx.fillStyle = maskGradient;
                maskCtx.beginPath();
                maskCtx.arc(screenX, screenY, lightRadius, 0, Math.PI * 2);
                maskCtx.fill();
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
                
                // FIRST: Create the transparent cutout hole
                const lightRadius = FURNACE_LIGHT_RADIUS_BASE * 2.0; // Double the cutout size
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
                // Switch back to cutout mode for other lights
                maskCtx.globalCompositeOperation = 'destination-out';
            }
        });

        // Render hearth light cutouts (always on, warm orange glow)
        homesteadHearths.forEach(hearth => {
            if (!hearth.isDestroyed) {
                // Adjust Y position for the light source to be centered on the hearth flame
                const visualCenterWorldY = hearth.posY - (HEARTH_HEIGHT / 2) - HEARTH_RENDER_Y_OFFSET;
                
                const screenX = hearth.posX + cameraOffsetX;
                const screenY = visualCenterWorldY + cameraOffsetY;
                
                // HEARTH CUTOUT - Larger than campfire, warm orange glow (always on)
                const flicker = (Math.random() - 0.5) * 2 * HEARTH_FLICKER_AMOUNT;
                const lightRadius = Math.max(0, (HEARTH_LIGHT_RADIUS_BASE * 2.2) + flicker); // 2.2x radius for larger coverage
                const maskGradient = maskCtx.createRadialGradient(screenX, screenY, lightRadius * 0.08, screenX, screenY, lightRadius);
                maskGradient.addColorStop(0, 'rgba(0,0,0,1)'); // Full cutout at center
                maskGradient.addColorStop(0.4, 'rgba(0,0,0,0.75)'); // Strong cutout zone
                maskGradient.addColorStop(0.7, 'rgba(0,0,0,0.4)'); // Gradual transition
                maskGradient.addColorStop(0.9, 'rgba(0,0,0,0.15)'); // Gentle fade
                maskGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Complete fade to darkness
                maskCtx.fillStyle = maskGradient;
                maskCtx.beginPath();
                maskCtx.arc(screenX, screenY, lightRadius, 0, Math.PI * 2);
                maskCtx.fill();
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
                
                const lightScreenX = renderPositionX + cameraOffsetX;
                const lightScreenY = renderPositionY + cameraOffsetY;

                // TORCH CUTOUT - 1.25x larger inner bright area with natural rustic gradient
                const flicker = (Math.random() - 0.5) * 2 * TORCH_FLICKER_AMOUNT;
                const currentLightRadius = Math.max(0, (TORCH_LIGHT_RADIUS_BASE * 1.25) + flicker);

                const maskGradient = maskCtx.createRadialGradient(lightScreenX, lightScreenY, currentLightRadius * 0.12, lightScreenX, lightScreenY, currentLightRadius);
                maskGradient.addColorStop(0, 'rgba(0,0,0,1)'); // Full cutout at center
                maskGradient.addColorStop(0.35, 'rgba(0,0,0,0.8)'); // Natural transition zone
                maskGradient.addColorStop(0.75, 'rgba(0,0,0,0.4)'); // Gentle fade
                maskGradient.addColorStop(1, 'rgba(0,0,0,0)'); // Complete fade to darkness
                maskCtx.fillStyle = maskGradient;
                maskCtx.beginPath();
                maskCtx.arc(lightScreenX, lightScreenY, currentLightRadius, 0, Math.PI * 2);
                maskCtx.fill();
            }
        });

        // Render rune stone light cutouts with colored atmospheric glows (only at night: twilight evening to twilight morning)
        // Excludes Dawn (0.0-0.05) - only shows from twilight evening (0.76) to twilight morning (ends at 1.0)
        if (typeof currentCycleProgress === 'number') {
            const isNightTime = currentCycleProgress >= 0.76; // Twilight evening (0.76) through twilight morning (ends at 1.0)
            
            if (isNightTime) {
                runeStones.forEach(runeStone => {
                    // Center exactly on the rune stone position
                    const screenX = runeStone.posX + cameraOffsetX;
                    const screenY = runeStone.posY + cameraOffsetY;
                    
                    // 3x larger cutout radius (was 200, now 600)
                    const RUNE_STONE_CUTOUT_RADIUS = 600;
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

    }, [worldState, campfires, lanterns, furnaces, homesteadHearths, runeStones, players, activeEquipments, itemDefinitions, cameraOffsetX, cameraOffsetY, canvasSize.width, canvasSize.height, torchLitStatesKey, lanternBurningStatesKey, localPlayerId, predictedPosition, remotePlayerInterpolation]);

    return { overlayRgba, maskCanvasRef };
} 