import { Lantern } from '../../generated'; // Import generated Lantern type
import lanternOnImage from '../../assets/doodads/lantern_on.png'; // Direct import ON
import lanternOffImage from '../../assets/doodads/lantern_off.png'; // Direct import OFF
// Ward images - on/off states for Ancestral Ward and Signal Disruptor
import ancestralWardOnImage from '../../assets/doodads/ancestral_ward_on.png';
import ancestralWardOffImage from '../../assets/doodads/ancestral_ward_off.png';
import signalDisruptorOnImage from '../../assets/doodads/signal_disruptor_on.png';
import signalDisruptorOffImage from '../../assets/doodads/signal_disruptor_off.png';
// Memory Beacon - single sprite (particles indicate active state)
import memoryBeaconImage from '../../assets/doodads/memory_beacon.png';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer'; // Import generic renderer
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { imageManager } from './imageManager'; // Import image manager

// === LANTERN TYPE CONSTANTS ===
// Must match server-side constants in lantern.rs
export const LANTERN_TYPE_LANTERN = 0;
export const LANTERN_TYPE_ANCESTRAL_WARD = 1;
export const LANTERN_TYPE_SIGNAL_DISRUPTOR = 2;
export const LANTERN_TYPE_MEMORY_BEACON = 3;

// --- Constants directly used by this module or exported ---
// Regular lantern size
export const LANTERN_WIDTH = 48;
export const LANTERN_HEIGHT = 56;
export const LANTERN_WIDTH_PREVIEW = 48; // Preview width matches actual width
export const LANTERN_HEIGHT_PREVIEW = 56; // Preview height matches actual height

// Ward sizes - larger than regular lanterns to make them more prominent
export const ANCESTRAL_WARD_WIDTH = 256;
export const ANCESTRAL_WARD_HEIGHT = 256;
export const SIGNAL_DISRUPTOR_WIDTH = 256;
export const SIGNAL_DISRUPTOR_HEIGHT = 256;
export const MEMORY_BEACON_WIDTH = 256;
export const MEMORY_BEACON_HEIGHT = 256;

// === WARD DETERRENCE RADII (must match server constants in lantern.rs) ===
// These define the protection zones where hostile NPCs won't enter
export const ANCESTRAL_WARD_RADIUS_PX = 550.0;      // Tier 1: Solo camp
export const SIGNAL_DISRUPTOR_RADIUS_PX = 1100.0;   // Tier 2: Homestead
// Memory Beacon: ATTRACTS hostiles instead of repelling! Sanity zone is small (600px)
export const MEMORY_BEACON_RADIUS_PX = 600.0;       // Tier 3: Sanity haven only (ATTRACTS hostiles in larger 2000px radius!)

// === MEMORY BEACON LIFETIME (must match server constant in beacon_event.rs) ===
// Memory Beacons are server-spawned events only (at Dusk) and last 90 minutes
// Must match BEACON_EVENT_LIFETIME_SECS in server/src/beacon_event.rs
export const MEMORY_BEACON_LIFETIME_SECS = 5400; // 90 minutes (5400 seconds)

// Offset for rendering to align with server-side collision/interaction zones
export const LANTERN_RENDER_Y_OFFSET = 6; // Visual offset from entity's base Y

// Helper function to get dimensions based on lantern type
export function getLanternDimensions(lanternType: number): { width: number; height: number } {
    switch (lanternType) {
        case LANTERN_TYPE_ANCESTRAL_WARD:
            return { width: ANCESTRAL_WARD_WIDTH, height: ANCESTRAL_WARD_HEIGHT };
        case LANTERN_TYPE_SIGNAL_DISRUPTOR:
            return { width: SIGNAL_DISRUPTOR_WIDTH, height: SIGNAL_DISRUPTOR_HEIGHT };
        case LANTERN_TYPE_MEMORY_BEACON:
            return { width: MEMORY_BEACON_WIDTH, height: MEMORY_BEACON_HEIGHT };
        case LANTERN_TYPE_LANTERN:
        default:
            return { width: LANTERN_WIDTH, height: LANTERN_HEIGHT };
    }
}

// Helper function to get ward deterrence radius (0 for non-ward lanterns)
export function getWardRadius(lanternType: number): number {
    switch (lanternType) {
        case LANTERN_TYPE_ANCESTRAL_WARD:
            return ANCESTRAL_WARD_RADIUS_PX;
        case LANTERN_TYPE_SIGNAL_DISRUPTOR:
            return SIGNAL_DISRUPTOR_RADIUS_PX;
        case LANTERN_TYPE_MEMORY_BEACON:
            return MEMORY_BEACON_RADIUS_PX;
        default:
            return 0; // Regular lanterns have no ward radius
    }
}

// Lantern interaction distance (player <-> lantern)
export const PLAYER_LANTERN_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0; // Same as campfire

// Lantern pickup mechanic: Empty lanterns can be picked up by holding E (similar to boxes)
// Non-empty lanterns can have their burning state toggled by holding E
// Tap E opens the lantern interface for fuel management

// Constants for server-side damage logic (lanterns don't damage, but kept for consistency)
export const SERVER_LANTERN_DAMAGE_RADIUS = 0.0; // Lanterns don't damage
export const SERVER_LANTERN_DAMAGE_CENTER_Y_OFFSET = 0.0;

// Particle emission points relative to the lantern's visual center
const LIGHT_EMISSION_VISUAL_CENTER_Y_OFFSET = LANTERN_HEIGHT * 0.3; 

// --- Other Local Constants ---
const SHAKE_DURATION_MS = 150; // How long the shake effect lasts
const SHAKE_INTENSITY_PX = 6; // Less intense shake for lanterns

// --- Client-side animation tracking for lantern shakes ---
const clientLanternShakeStartTimes = new Map<string, number>(); // lanternId -> client timestamp when shake started
const lastKnownServerLanternShakeTimes = new Map<string, number>();

// --- Define Configuration ---
const lanternConfig: GroundEntityConfig<Lantern> = {
    // Return imported URL based on lantern type and state
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null; // Don't render if destroyed
        }
        
        // Different sprites based on lantern type - use on/off states
        switch (entity.lanternType) {
            case LANTERN_TYPE_ANCESTRAL_WARD:
                return entity.isBurning ? ancestralWardOnImage : ancestralWardOffImage;
            case LANTERN_TYPE_SIGNAL_DISRUPTOR:
                return entity.isBurning ? signalDisruptorOnImage : signalDisruptorOffImage;
            case LANTERN_TYPE_MEMORY_BEACON:
                return memoryBeaconImage; // Single sprite, particles indicate active state
            case LANTERN_TYPE_LANTERN:
            default:
                // Regular lantern has on/off sprites
                return entity.isBurning ? lanternOnImage : lanternOffImage;
        }
    },

    getTargetDimensions: (_img, entity) => {
        // Use dynamic dimensions based on lantern type
        // Wards are larger than regular lanterns
        return getLanternDimensions(entity.lanternType);
    },

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        // Top-left corner for image drawing, originating from entity's base Y
        // Apply Y offset to better align with collision area
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight - LANTERN_RENDER_Y_OFFSET,
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Draw DYNAMIC ground shadow for both lit and unlit lanterns (if not destroyed)
        if (!entity.isDestroyed) {
            // Calculate shake offsets for shadow synchronization using helper function
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientLanternShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerLanternShakeTimes
                },
                SHAKE_DURATION_MS,
                SHAKE_INTENSITY_PX
            );

            // Scale shadow parameters based on entity size
            // Wards are much larger (256px height) vs regular lanterns (56px height)
            // pivotYOffset should be proportional to sprite height
            const isWard = entity.lanternType !== LANTERN_TYPE_LANTERN;
            const pivotYOffset = isWard ? 60 : 15; // Larger offset for wards to align shadow with base
            const shadowBlur = isWard ? 3 : 2;     // Standardized: 2 for base objects, 3 for larger wards
            const maxStretchFactor = isWard ? 1.2 : 1.1;
            const minStretchFactor = isWard ? 0.3 : 0.2;

            drawDynamicGroundShadow({
                ctx,
                entityImage,
                entityCenterX: entityPosX,
                entityBaseY: entityPosY,
                imageDrawWidth,
                imageDrawHeight,
                cycleProgress,
                maxStretchFactor, 
                minStretchFactor,  
                shadowBlur,         
                pivotYOffset,
                // NEW: Pass shake offsets so shadow moves with the lantern
                shakeOffsetX,
                shakeOffsetY      
            });
        }
    },

    applyEffects: (ctx, entity, nowMs, baseDrawX, baseDrawY, cycleProgress) => {
        // Dynamic shadow is now handled in drawCustomGroundShadow for all states
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

    fallbackColor: '#996633', // Warm brown fallback
};

// Preload all lantern/ward images
imageManager.preloadImage(lanternOnImage);
imageManager.preloadImage(lanternOffImage);
imageManager.preloadImage(ancestralWardOnImage);
imageManager.preloadImage(ancestralWardOffImage);
imageManager.preloadImage(signalDisruptorOnImage);
imageManager.preloadImage(signalDisruptorOffImage);
imageManager.preloadImage(memoryBeaconImage);

// --- Rendering Function (Refactored) ---
export function renderLantern(
    ctx: CanvasRenderingContext2D, 
    lantern: Lantern, 
    nowMs: number, 
    cycleProgress: number,
    onlyDrawShadow?: boolean,
    skipDrawingShadow?: boolean,
    playerX?: number,
    playerY?: number,
    localPlayerPosition?: { x: number; y: number } | null // Player position for transparency logic
) { 
    const { width, height } = getLanternDimensions(lantern.lanternType);
    
    // Only wards (type > 0) need transparency occlusion since they are tall (256px)
    // Regular lanterns (56px) are too small to occlude the player
    const isWard = lantern.lanternType !== LANTERN_TYPE_LANTERN;
    
    // Calculate transparency for wards when player is behind them
    const MIN_ALPHA = 0.35; // Minimum opacity when ward is blocking player
    const MAX_ALPHA = 1.0;  // Full opacity when not blocking
    let wardAlpha = MAX_ALPHA;
    
    if (isWard && localPlayerPosition && !onlyDrawShadow) {
        // Ward visual dimensions - use portion of sprite for actual building
        const wardVisualWidth = width * 0.5;  // ~50% of sprite width is building
        const wardVisualHeight = height * 0.7; // ~70% of sprite height is building
        
        // Dynamic threshold based on ward height (similar to trees)
        const BASE_TRANSPARENCY_THRESHOLD_PERCENT = 0.25;
        const dynamicThreshold = wardVisualHeight * BASE_TRANSPARENCY_THRESHOLD_PERCENT;
        
        // Ward is drawn with bottom-center at lantern.posX, lantern.posY (with Y offset)
        const wardLeft = lantern.posX - wardVisualWidth / 2;
        const wardRight = lantern.posX + wardVisualWidth / 2;
        const wardTop = lantern.posY - wardVisualHeight - LANTERN_RENDER_Y_OFFSET;
        const wardBottom = lantern.posY - dynamicThreshold - LANTERN_RENDER_Y_OFFSET;
        
        // Player bounding box (approximate)
        const playerSize = 48;
        const playerLeft = localPlayerPosition.x - playerSize / 2;
        const playerRight = localPlayerPosition.x + playerSize / 2;
        const playerTop = localPlayerPosition.y - playerSize;
        const playerBottom = localPlayerPosition.y;
        
        // Check if player overlaps with ward's visual area
        const overlapsHorizontally = playerRight > wardLeft && playerLeft < wardRight;
        const overlapsVertically = playerBottom > wardTop && playerTop < wardBottom;
        
        // Ward should be transparent if:
        // 1. It overlaps with player visually (with threshold buffer)
        // 2. Ward renders AFTER player (ward.posY > player.posY + threshold)
        if (overlapsHorizontally && overlapsVertically && lantern.posY > localPlayerPosition.y + dynamicThreshold) {
            // Calculate how much the player is behind the ward (for smooth fade)
            const depthDifference = lantern.posY - localPlayerPosition.y;
            const maxDepthForFade = 100; // Max distance for fade effect
            
            if (depthDifference > 0 && depthDifference < maxDepthForFade) {
                // Closer to ward = more transparent
                const fadeFactor = 1 - (depthDifference / maxDepthForFade);
                wardAlpha = MAX_ALPHA - (fadeFactor * (MAX_ALPHA - MIN_ALPHA));
                wardAlpha = Math.max(MIN_ALPHA, Math.min(MAX_ALPHA, wardAlpha));
            } else if (depthDifference >= maxDepthForFade) {
                // Very close - use minimum alpha
                wardAlpha = MIN_ALPHA;
            }
        }
    }
    
    // Apply transparency if needed
    const needsTransparency = wardAlpha < MAX_ALPHA;
    if (needsTransparency) {
        ctx.save();
        ctx.globalAlpha = wardAlpha;
    }
    
    renderConfiguredGroundEntity({
        ctx,
        entity: lantern,
        config: lanternConfig,
        nowMs,
        entityPosX: lantern.posX,
        entityPosY: lantern.posY,
        cycleProgress,
        onlyDrawShadow,
        skipDrawingShadow
    });
    
    // Restore context if transparency was applied
    if (needsTransparency) {
        ctx.restore();
    }
    
    // Health bar rendered via renderHealthBarOverlay (on top of world objects)
    
    // Render countdown timer for Memory Beacons (shows remaining time before auto-destruct)
    if (!onlyDrawShadow && lantern.lanternType === LANTERN_TYPE_MEMORY_BEACON) {
        renderMemoryBeaconTimer(ctx, lantern, nowMs);
    }
}

/**
 * Render the ward deterrence radius circle around a ward.
 * Creates a diegetic (in-world) energy field effect rather than a UI element.
 * When rendered over day/night, uses a soft glowing energy barrier look.
 * 
 * @param ctx - Canvas rendering context
 * @param lantern - The lantern/ward entity
 * @param cycleProgress - Animation cycle progress (0-1) for subtle pulsing effect
 * @param overDayNight - If true, renders with ethereal glow for visibility at night
 */
export function renderWardRadius(
    ctx: CanvasRenderingContext2D,
    lantern: Lantern,
    cycleProgress: number,
    overDayNight: boolean = false
) {
    // Skip destroyed wards and regular lanterns
    if (lantern.isDestroyed) return;
    
    const radius = getWardRadius(lantern.lanternType);
    if (radius <= 0) return; // No radius for regular lanterns
    
    const isActive = lantern.isBurning;
    
    // Ward center is at the entity position
    const centerX = lantern.posX;
    const centerY = lantern.posY;
    
    // Pulsing effect - more noticeable when over day/night for visibility
    const pulseIntensity = overDayNight ? 0.015 : 0.008;
    const pulseScale = isActive 
        ? 1.0 + Math.sin(cycleProgress * Math.PI * 2) * pulseIntensity
        : 1.0;
    const effectiveRadius = radius * pulseScale;
    
    // Different colors for different ward tiers
    let r: number, g: number, b: number;
    
    switch (lantern.lanternType) {
        case LANTERN_TYPE_ANCESTRAL_WARD:
            r = 147; g = 112; b = 219; // Light purple
            break;
        case LANTERN_TYPE_SIGNAL_DISRUPTOR:
            r = 100; g = 149; b = 237; // Cornflower blue
            break;
        case LANTERN_TYPE_MEMORY_BEACON:
            r = 186; g = 85; b = 211; // Medium orchid
            break;
        default:
            return;
    }
    
    ctx.save();
    
    if (overDayNight) {
        // === DIEGETIC ENERGY FIELD RENDERING (over day/night) ===
        // Creates an ethereal, magical barrier effect that looks in-world
        // Uses additive blending and soft gradients for a mystical glow
        
        ctx.globalCompositeOperation = 'screen';
        
        // Layer 1: Very soft outer atmospheric glow (barely visible)
        const outerGlowRadius = effectiveRadius + 20;
        const outerGlow = ctx.createRadialGradient(
            centerX, centerY, effectiveRadius - 5,
            centerX, centerY, outerGlowRadius
        );
        outerGlow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.0)`);
        outerGlow.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.03)`);
        outerGlow.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.02)`);
        outerGlow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
        
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(centerX, centerY, outerGlowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Layer 2: Main barrier edge glow (concentrated at the radius line)
        const edgeGlow = ctx.createRadialGradient(
            centerX, centerY, effectiveRadius - 15,
            centerX, centerY, effectiveRadius + 15
        );
        const edgeOpacity = isActive ? 0.12 : 0.06;
        edgeGlow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.0)`);
        edgeGlow.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${edgeOpacity * 0.5})`);
        edgeGlow.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${edgeOpacity})`);
        edgeGlow.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, ${edgeOpacity * 0.5})`);
        edgeGlow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.0)`);
        
        ctx.fillStyle = edgeGlow;
        ctx.beginPath();
        ctx.arc(centerX, centerY, effectiveRadius + 15, 0, Math.PI * 2);
        ctx.fill();
        
        // Layer 3: Bright core line (the actual barrier edge)
        ctx.globalCompositeOperation = 'lighter';
        const coreOpacity = isActive ? 0.25 : 0.12;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${coreOpacity})`;
        ctx.lineWidth = isActive ? 3 : 2;
        ctx.setLineDash([]); // Solid line for energy barrier
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
        ctx.shadowBlur = isActive ? 8 : 4;
        ctx.beginPath();
        ctx.arc(centerX, centerY, effectiveRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Layer 4: Inner ethereal particles/wisps (subtle energy flow effect)
        if (isActive) {
            const wispCount = 8;
            for (let i = 0; i < wispCount; i++) {
                const angle = (cycleProgress * Math.PI * 2 + i * Math.PI * 2 / wispCount) % (Math.PI * 2);
                const wispX = centerX + Math.cos(angle) * effectiveRadius;
                const wispY = centerY + Math.sin(angle) * effectiveRadius;
                const wispAlpha = 0.15 + Math.sin(cycleProgress * Math.PI * 4 + i) * 0.1;
                
                const wispGrad = ctx.createRadialGradient(wispX, wispY, 0, wispX, wispY, 12);
                wispGrad.addColorStop(0, `rgba(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)}, ${wispAlpha})`);
                wispGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
                
                ctx.fillStyle = wispGrad;
                ctx.beginPath();
                ctx.arc(wispX, wispY, 12, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
    } else {
        // === GROUND-LEVEL RENDERING (below entities, below day/night) ===
        // Simpler rendering for the base layer
        
        const strokeAlpha = 0.35;
        const glowAlpha = 0.15;
        
        // Outer glow
        ctx.beginPath();
        ctx.arc(centerX, centerY, effectiveRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${glowAlpha})`;
        ctx.lineWidth = 8;
        ctx.stroke();
        
        // Main border
        ctx.beginPath();
        ctx.arc(centerX, centerY, effectiveRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${strokeAlpha})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([15, 10]);
        ctx.stroke();
    }
    
    ctx.restore();
}

/**
 * Render the countdown timer for Memory Beacons.
 * Shows remaining time before auto-destruct in MM:SS format.
 * Positioned above the beacon with a cyberpunk-style display.
 * 
 * Memory Beacons are server-spawned events (at Dusk) and last 90 minutes.
 * 
 * @param ctx - Canvas rendering context
 * @param lantern - The lantern/ward entity (only renders for Memory Beacons)
 * @param nowMs - Current time in milliseconds
 */
export function renderMemoryBeaconTimer(
    ctx: CanvasRenderingContext2D,
    lantern: Lantern,
    nowMs: number
) {
    // Only render for active Memory Beacons
    if (lantern.lanternType !== LANTERN_TYPE_MEMORY_BEACON) return;
    if (lantern.isDestroyed) return;
    
    // Get placed_at timestamp - need to convert from BigInt microseconds
    const placedAtMs = Number(lantern.placedAt.microsSinceUnixEpoch / 1000n);
    const elapsedSecs = (nowMs - placedAtMs) / 1000;
    const remainingSecs = Math.max(0, MEMORY_BEACON_LIFETIME_SECS - elapsedSecs);
    
    // Format as MM:SS
    const minutes = Math.floor(remainingSecs / 60);
    const seconds = Math.floor(remainingSecs % 60);
    const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Position above the beacon sprite
    const { height } = getLanternDimensions(lantern.lanternType);
    const timerX = lantern.posX;
    const timerY = lantern.posY - height - LANTERN_RENDER_Y_OFFSET - 20; // 20px above sprite
    
    ctx.save();
    
    // Urgency color: transitions from cyan to orange to red as time runs out
    let textColor: string;
    let glowColor: string;
    if (remainingSecs > 180) { // > 3 min: calm cyan
        textColor = '#00ffff';
        glowColor = 'rgba(0, 255, 255, 0.6)';
    } else if (remainingSecs > 60) { // 1-3 min: warning orange
        textColor = '#ffaa00';
        glowColor = 'rgba(255, 170, 0, 0.6)';
    } else { // < 1 min: critical red with pulse
        const pulse = 0.7 + Math.sin(nowMs / 200) * 0.3; // Pulsing intensity
        textColor = `rgba(255, ${Math.floor(50 * pulse)}, ${Math.floor(50 * pulse)}, 1)`;
        glowColor = `rgba(255, 50, 50, ${0.4 + pulse * 0.2})`;
    }
    
    // Draw background pill
    ctx.font = '14px "Courier New", Consolas, Monaco, monospace'; // Set font first for measurement
    const textWidth = ctx.measureText(timeText).width;
    const pillPadding = 8;
    const pillHeight = 22;
    const pillWidth = textWidth + pillPadding * 2;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 1;
    
    // Rounded rectangle
    const pillX = timerX - pillWidth / 2;
    const pillY = timerY - pillHeight / 2;
    const radius = pillHeight / 2;
    
    ctx.beginPath();
    ctx.moveTo(pillX + radius, pillY);
    ctx.lineTo(pillX + pillWidth - radius, pillY);
    ctx.arc(pillX + pillWidth - radius, pillY + radius, radius, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(pillX + radius, pillY + pillHeight);
    ctx.arc(pillX + radius, pillY + radius, radius, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw timer text
    ctx.font = '14px "Courier New", Consolas, Monaco, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = remainingSecs < 60 ? 8 : 4;
    ctx.fillStyle = textColor;
    ctx.fillText(timeText, timerX, timerY);
    
    ctx.restore();
}