import { RuneStone } from '../../generated/types';
import monumentBlueImage from '../../assets/doodads/monument_blue.png';
import monumentRedImage from '../../assets/doodads/monument_red.png';
import monumentGreenImage from '../../assets/doodads/monument_green.png';
import { drawDynamicGroundShadow } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';
import { renderBuildingRestrictionOverlay, BuildingRestrictionZoneConfig } from './buildingRestrictionOverlayUtils';
import { isNightTime, NIGHT_LIGHTS_ON, LIGHT_FADE_FULL_AT, TWILIGHT_MORNING_FADE_START, TWILIGHT_MORNING_END } from '../../config/dayNightConstants';

// Configuration constants
const TARGET_RUNE_STONE_WIDTH_PX = 300; // Target width on screen (doubled from 150)

// Rune stone type keys
type RuneStoneTypeKey = 'Green' | 'Red' | 'Blue';

// Rune stone type to image mapping
const RUNE_STONE_IMAGES: Record<RuneStoneTypeKey, string> = {
    'Green': monumentGreenImage,
    'Red': monumentRedImage,
    'Blue': monumentBlueImage,
};

// Night lighting configuration - AAA quality mythical effects
const NIGHT_LIGHT_RADIUS = 440; // Radius of the colored light effect (doubled from 220)
const NIGHT_LIGHT_INTENSITY = 0.7; // Intensity of the light (0-1)

// Rune stone colors for night lighting - richer, more vibrant mythical colors
const RUNE_STONE_COLORS: Record<RuneStoneTypeKey, { r: number; g: number; b: number }> = {
    'Green': { r: 80, g: 220, b: 100 }, // Verdant life magic
    'Red': { r: 240, g: 80, b: 60 }, // Forge ember magic
    'Blue': { r: 100, g: 160, b: 255 }, // Arcane crystal magic
};

// Secondary accent colors for chromatic effects
const RUNE_STONE_ACCENT_COLORS: Record<RuneStoneTypeKey, { r: number; g: number; b: number }> = {
    'Green': { r: 180, g: 255, b: 180 }, // Bright life essence
    'Red': { r: 255, g: 200, b: 120 }, // Golden ember glow
    'Blue': { r: 200, g: 220, b: 255 }, // Ethereal ice shimmer
};

// Tertiary deep colors for outer mystical halo
const RUNE_STONE_DEEP_COLORS: Record<RuneStoneTypeKey, { r: number; g: number; b: number }> = {
    'Green': { r: 20, g: 80, b: 40 }, // Deep forest shadow
    'Red': { r: 120, g: 20, b: 30 }, // Deep crimson ember
    'Blue': { r: 30, g: 60, b: 140 }, // Deep ocean arcane
};

// Rising particle configuration (AAA Sea of Stars / Hyper Light Drifter quality)
const PARTICLE_COUNT = 18; // More particles for denser magical atmosphere
const PARTICLE_RISE_SPEED = 12; // Slightly slower for more ethereal feel
const PARTICLE_DRIFT_SPEED = 10; // More horizontal drift for mystical movement
const PARTICLE_LIFETIME_SECONDS = 5.0; // Longer lifetime for smoother transitions
const PARTICLE_SPAWN_RADIUS = 140; // Wider spawn radius (doubled from 70)
const PARTICLE_MIN_SIZE = 4; // Minimum particle size (doubled from 2)
const PARTICLE_MAX_SIZE = 12; // Larger max for more variation (doubled from 6)
const PARTICLE_GLOW_INTENSITY = 0.9; // Brighter glow

// Ground pool configuration (light reflection on ground)
const GROUND_POOL_RADIUS = 180; // Radius of ground light pool (doubled from 90)
const GROUND_POOL_INTENSITY = 0.4; // Intensity of ground pool

// Light center vertical offset (push light up to center around runestone visual mass)
const LIGHT_CENTER_Y_OFFSET = 140; // Pixels to offset light center upward from base (doubled from 70)

/**
 * Get the image source for a rune stone based on its type
 */
function getRuneStoneImageSource(runeStone: RuneStone): string {
    const runeType = (runeStone.runeType?.tag || 'Blue') as RuneStoneTypeKey; // Default to Blue if not set
    return RUNE_STONE_IMAGES[runeType] || RUNE_STONE_IMAGES['Blue'];
}

/**
 * Simple deterministic random number generator based on seed
 * Ensures consistent particle positions for the same runestone
 */
function seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

/**
 * Generate deterministic particle data for a runestone
 * Uses runestone ID and time to create consistent, animated particles
 */
interface RisingParticle {
    baseX: number; // Base X position (world coords)
    baseY: number; // Base Y position (world coords)
    spawnOffset: number; // Time offset for this particle (0-1)
    driftPhase: number; // Phase for horizontal drift
    size: number; // Particle size
    color: { r: number; g: number; b: number };
}

function generateRisingParticles(
    runeStone: RuneStone,
    runeType: RuneStoneTypeKey,
    nowMs: number
): RisingParticle[] {
    const particles: RisingParticle[] = [];
    const stoneId = Number(runeStone.id) || 0;
    const color = RUNE_STONE_COLORS[runeType] || RUNE_STONE_COLORS['Blue'];
    
    // Use runestone ID as seed for deterministic positioning
    let seed = stoneId * 1000;
    
    // Light center is offset upward from base position
    const lightCenterY = runeStone.posY - LIGHT_CENTER_Y_OFFSET;
    
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Generate deterministic spawn position around light center
        const angle = seededRandom(seed++) * Math.PI * 2;
        const distance = seededRandom(seed++) * PARTICLE_SPAWN_RADIUS;
        const baseX = runeStone.posX + Math.cos(angle) * distance;
        const baseY = lightCenterY + Math.sin(angle) * distance * 0.6; // Flattened vertically
        
        // Stagger spawn times for continuous effect
        const spawnOffset = seededRandom(seed++) * PARTICLE_LIFETIME_SECONDS;
        
        // Drift phase for gentle swaying
        const driftPhase = seededRandom(seed++) * Math.PI * 2;
        
        // Size variation
        const size = PARTICLE_MIN_SIZE + seededRandom(seed++) * (PARTICLE_MAX_SIZE - PARTICLE_MIN_SIZE);
        
        particles.push({
            baseX,
            baseY,
            spawnOffset,
            driftPhase,
            size,
            color,
        });
    }
    
    return particles;
}

/**
 * Render ground light pool - the magical glow reflecting on the ground
 * Note: This stays at the base position (not offset up) since it's ground reflection
 */
function renderGroundLightPool(
    ctx: CanvasRenderingContext2D,
    runeStone: RuneStone,
    runeType: RuneStoneTypeKey,
    cameraOffsetX: number,
    cameraOffsetY: number,
    nowMs: number,
    timeIntensity: number
): void {
    const color = RUNE_STONE_COLORS[runeType];
    const deepColor = RUNE_STONE_DEEP_COLORS[runeType];
    const currentTimeSeconds = nowMs / 1000;
    
    const poolCenterX = runeStone.posX + cameraOffsetX;
    const poolCenterY = runeStone.posY + cameraOffsetY + 5; // At runestone base (ground level)
    
    // Subtle pulsing for ground pool
    const pulsePhase = currentTimeSeconds * 0.8;
    const pulseScale = 1.0 + Math.sin(pulsePhase) * 0.05;
    const poolRadius = GROUND_POOL_RADIUS * pulseScale;
    
    ctx.save();
    
    // Create elliptical ground pool (flattened vertically for perspective)
    ctx.scale(1, 0.4);
    const scaledY = poolCenterY / 0.4;
    
    const poolGradient = ctx.createRadialGradient(
        poolCenterX, scaledY, 0,
        poolCenterX, scaledY, poolRadius
    );
    
    const poolAlpha = timeIntensity * GROUND_POOL_INTENSITY;
    poolGradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${poolAlpha * 0.5})`);
    poolGradient.addColorStop(0.3, `rgba(${color.r}, ${color.g}, ${color.b}, ${poolAlpha * 0.35})`);
    poolGradient.addColorStop(0.6, `rgba(${deepColor.r}, ${deepColor.g}, ${deepColor.b}, ${poolAlpha * 0.2})`);
    poolGradient.addColorStop(1, `rgba(${deepColor.r}, ${deepColor.g}, ${deepColor.b}, 0)`);
    
    ctx.fillStyle = poolGradient;
    ctx.beginPath();
    ctx.arc(poolCenterX, scaledY, poolRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

/**
 * Render rising glowing particles around runestones (AAA quality)
 * Creates mystical floating particles that rise and glow within the light area
 * Enhanced with trails, chromatic effects, and multi-layered rendering
 */
function renderRisingParticles(
    ctx: CanvasRenderingContext2D,
    runeStone: RuneStone,
    runeType: RuneStoneTypeKey,
    cycleProgress: number,
    cameraOffsetX: number,
    cameraOffsetY: number,
    nowMs: number,
    timeIntensity: number
): void {
    if (!isNightTime(cycleProgress)) {
        return; // Only render at night
    }
    
    const particles = generateRisingParticles(runeStone, runeType, nowMs);
    const currentTimeSeconds = nowMs / 1000;
    const accentColor = RUNE_STONE_ACCENT_COLORS[runeType];
    
    ctx.save();
    
    particles.forEach((particle) => {
        // Calculate particle age (0-1, loops)
        const particleAge = ((currentTimeSeconds + particle.spawnOffset) / PARTICLE_LIFETIME_SECONDS) % 1.0;
        
        // Calculate vertical position (rises from baseY upward) - with slight acceleration
        const riseProgress = particleAge * particleAge * 0.5 + particleAge * 0.5; // Eased rise
        const riseDistance = riseProgress * PARTICLE_RISE_SPEED * PARTICLE_LIFETIME_SECONDS;
        const currentY = particle.baseY - riseDistance;
        
        // Horizontal drift (more complex spiral-like motion)
        const driftPrimary = Math.sin(currentTimeSeconds * 0.6 + particle.driftPhase) * PARTICLE_DRIFT_SPEED * 0.5;
        const driftSecondary = Math.cos(currentTimeSeconds * 0.9 + particle.driftPhase * 1.5) * PARTICLE_DRIFT_SPEED * 0.25;
        const currentX = particle.baseX + driftPrimary + driftSecondary;
        
        // Apply camera offset
        const screenX = currentX + cameraOffsetX;
        const screenY = currentY + cameraOffsetY;
        
        // Alpha: Smooth fade in/out with longer visible period
        let alpha = 1.0;
        if (particleAge < 0.12) {
            // Smooth fade in
            alpha = Math.pow(particleAge / 0.12, 0.7);
        } else if (particleAge > 0.8) {
            // Smooth fade out
            alpha = Math.pow((1.0 - particleAge) / 0.2, 0.7);
        }
        alpha *= timeIntensity * PARTICLE_GLOW_INTENSITY;
        
        // Size pulsing (layered breathing effect)
        const pulsePhase1 = currentTimeSeconds * 2.5 + particle.driftPhase;
        const pulsePhase2 = currentTimeSeconds * 1.2 + particle.driftPhase * 0.7;
        const pulseFactor = 1.0 + Math.sin(pulsePhase1) * 0.12 + Math.sin(pulsePhase2) * 0.08;
        const currentSize = particle.size * pulseFactor;
        
        // Only render if visible and within extended light radius (from light center, not base)
        const lightCenterY = runeStone.posY - LIGHT_CENTER_Y_OFFSET;
        const distanceFromCenter = Math.sqrt(
            Math.pow(currentX - runeStone.posX, 2) + 
            Math.pow(currentY - lightCenterY, 2)
        );
        
        if (distanceFromCenter > NIGHT_LIGHT_RADIUS * 1.2 || alpha < 0.03) {
            return; // Skip particles outside light radius or too faint
        }
        
        // LAYER 0: Trailing afterglow (motion blur effect)
        const trailLength = 8;
        const trailAlpha = alpha * 0.15;
        for (let t = 1; t <= 3; t++) {
            const trailY = screenY + t * (trailLength / 3);
            const trailSize = currentSize * (1 - t * 0.15);
            ctx.fillStyle = `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${trailAlpha * (1 - t * 0.3)})`;
            ctx.beginPath();
            ctx.arc(screenX, trailY, trailSize * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // LAYER 1: Outer soft glow halo (larger, more ethereal)
        const glowRadius = currentSize * 3.5;
        const outerGlow = ctx.createRadialGradient(
            screenX, screenY, 0,
            screenX, screenY, glowRadius
        );
        outerGlow.addColorStop(0, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${alpha * 0.35})`);
        outerGlow.addColorStop(0.3, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${alpha * 0.2})`);
        outerGlow.addColorStop(0.6, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${alpha * 0.08})`);
        outerGlow.addColorStop(1, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, 0)`);
        
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(screenX, screenY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // LAYER 2: Accent color halo (chromatic effect)
        const accentRadius = currentSize * 2.0;
        const accentGlow = ctx.createRadialGradient(
            screenX, screenY - 2, 0,
            screenX, screenY - 2, accentRadius
        );
        accentGlow.addColorStop(0, `rgba(${accentColor.r}, ${accentColor.g}, ${accentColor.b}, ${alpha * 0.25})`);
        accentGlow.addColorStop(0.5, `rgba(${accentColor.r}, ${accentColor.g}, ${accentColor.b}, ${alpha * 0.1})`);
        accentGlow.addColorStop(1, `rgba(${accentColor.r}, ${accentColor.g}, ${accentColor.b}, 0)`);
        
        ctx.fillStyle = accentGlow;
        ctx.beginPath();
        ctx.arc(screenX, screenY - 2, accentRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // LAYER 3: Bright core particle
        const coreGlow = ctx.createRadialGradient(
            screenX, screenY - 4, 0,
            screenX, screenY - 4, currentSize * 1.2
        );
        coreGlow.addColorStop(0, `rgba(${Math.min(255, particle.color.r + 120)}, ${Math.min(255, particle.color.g + 120)}, ${Math.min(255, particle.color.b + 120)}, ${alpha * 0.95})`);
        coreGlow.addColorStop(0.4, `rgba(${Math.min(255, particle.color.r + 60)}, ${Math.min(255, particle.color.g + 60)}, ${Math.min(255, particle.color.b + 60)}, ${alpha * 0.7})`);
        coreGlow.addColorStop(0.7, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${alpha * 0.4})`);
        coreGlow.addColorStop(1, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, 0)`);
        
        ctx.fillStyle = coreGlow;
        ctx.beginPath();
        ctx.arc(screenX, screenY - 4, currentSize * 1.2, 0, Math.PI * 2);
        ctx.fill();
        
        // LAYER 4: Brilliant white sparkle at center
        const sparkleSize = currentSize * 0.35;
        const sparkleAlpha = alpha * (0.7 + Math.sin(currentTimeSeconds * 8 + particle.driftPhase) * 0.3);
        ctx.fillStyle = `rgba(255, 255, 255, ${sparkleAlpha})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY - 5, sparkleSize, 0, Math.PI * 2);
        ctx.fill();
    });
    
    ctx.restore();
}

/**
 * Render night lighting effect for rune stones - AAA Quality
 * Creates a multi-layered mystical lighting effect with:
 * - Outer ethereal halo
 * - Inner core radiance with color-specific characteristics
 * - Ground light pool reflection
 * - Magical rising rays
 * - Enhanced particle effects
 */
export function renderRuneStoneNightLight(
    ctx: CanvasRenderingContext2D,
    runeStone: RuneStone,
    cycleProgress: number,
    cameraOffsetX: number,
    cameraOffsetY: number,
    nowMs?: number
): void {
    if (!isNightTime(cycleProgress)) {
        return; // Only render at night
    }

    const runeType = (runeStone.runeType?.tag || 'Blue') as RuneStoneTypeKey;
    const color = RUNE_STONE_COLORS[runeType] || RUNE_STONE_COLORS['Blue'];
    const accentColor = RUNE_STONE_ACCENT_COLORS[runeType] || RUNE_STONE_ACCENT_COLORS['Blue'];
    const deepColor = RUNE_STONE_DEEP_COLORS[runeType] || RUNE_STONE_DEEP_COLORS['Blue'];

    // Calculate light intensity from shared day/night constants
    let timeIntensity = NIGHT_LIGHT_INTENSITY;
    if (cycleProgress >= NIGHT_LIGHTS_ON) {
        if (cycleProgress < LIGHT_FADE_FULL_AT) {
            const fadeProgress = (cycleProgress - NIGHT_LIGHTS_ON) / (LIGHT_FADE_FULL_AT - NIGHT_LIGHTS_ON);
            timeIntensity = NIGHT_LIGHT_INTENSITY * Math.pow(fadeProgress, 0.7);
        } else if (cycleProgress >= TWILIGHT_MORNING_FADE_START) {
            const fadeProgress = (TWILIGHT_MORNING_END - cycleProgress) / (TWILIGHT_MORNING_END - TWILIGHT_MORNING_FADE_START);
            timeIntensity = NIGHT_LIGHT_INTENSITY * Math.pow(fadeProgress, 0.7);
        }
    }
    
    const currentTime = nowMs ?? Date.now();
    const currentTimeSeconds = currentTime / 1000;
    
    // Multi-layered breathing effect for mystical feel
    const breathingPhase1 = (currentTimeSeconds * 0.4) % (Math.PI * 2); // Slow 15.7s cycle
    const breathingPhase2 = (currentTimeSeconds * 0.7) % (Math.PI * 2); // Medium 9s cycle
    const breathingPhase3 = (currentTimeSeconds * 1.2) % (Math.PI * 2); // Fast 5.2s cycle
    
    const breathingIntensity = 1.0 
        + Math.sin(breathingPhase1) * 0.06 
        + Math.sin(breathingPhase2) * 0.04 
        + Math.sin(breathingPhase3) * 0.02;
    
    const finalIntensity = timeIntensity * breathingIntensity;

    // Apply camera offset to world coordinates - centered on runestone visual mass (pushed up)
    const lightScreenX = runeStone.posX + cameraOffsetX;
    const lightScreenY = runeStone.posY + cameraOffsetY - LIGHT_CENTER_Y_OFFSET; // Offset upward
    
    // Slight position drift for ethereal feel
    const driftX = Math.sin(currentTimeSeconds * 0.3) * 2;
    const driftY = Math.cos(currentTimeSeconds * 0.25) * 1.5;

    ctx.save();

    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 1: OUTER ETHEREAL HALO - Very large, soft, mystical outer glow
    // ═══════════════════════════════════════════════════════════════════════
    const outerHaloRadius = NIGHT_LIGHT_RADIUS * 1.4;
    const outerHaloGradient = ctx.createRadialGradient(
        lightScreenX + driftX, lightScreenY + driftY, 0,
        lightScreenX + driftX, lightScreenY + driftY, outerHaloRadius
    );
    
    // Deep color for outer ethereal boundary
    outerHaloGradient.addColorStop(0, `rgba(${deepColor.r}, ${deepColor.g}, ${deepColor.b}, ${0.15 * finalIntensity})`);
    outerHaloGradient.addColorStop(0.3, `rgba(${deepColor.r}, ${deepColor.g}, ${deepColor.b}, ${0.10 * finalIntensity})`);
    outerHaloGradient.addColorStop(0.6, `rgba(${deepColor.r}, ${deepColor.g}, ${deepColor.b}, ${0.05 * finalIntensity})`);
    outerHaloGradient.addColorStop(0.85, `rgba(${deepColor.r}, ${deepColor.g}, ${deepColor.b}, ${0.02 * finalIntensity})`);
    outerHaloGradient.addColorStop(1, `rgba(${deepColor.r}, ${deepColor.g}, ${deepColor.b}, 0)`);
    
    ctx.fillStyle = outerHaloGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX + driftX, lightScreenY + driftY, outerHaloRadius, 0, Math.PI * 2);
    ctx.fill();

    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 2: MAIN AMBIENT GLOW - Primary colored atmospheric glow
    // ═══════════════════════════════════════════════════════════════════════
    const ambientRadius = NIGHT_LIGHT_RADIUS * 1.0;
    const ambientGradient = ctx.createRadialGradient(
        lightScreenX, lightScreenY, 0,
        lightScreenX, lightScreenY, ambientRadius
    );

    // Create diffuse, atmospheric glow with rune-specific characteristics
    if (runeType === 'Green') {
        // Verdant Life Magic - organic, pulsing, nature-essence glow
        const leafPulse = 1.0 + Math.sin(currentTimeSeconds * 1.8) * 0.08;
        ambientGradient.addColorStop(0, `rgba(60, 180, 80, ${0.28 * finalIntensity * leafPulse})`);
        ambientGradient.addColorStop(0.15, `rgba(50, 160, 70, ${0.24 * finalIntensity})`);
        ambientGradient.addColorStop(0.3, `rgba(45, 140, 60, ${0.20 * finalIntensity})`);
        ambientGradient.addColorStop(0.5, `rgba(35, 120, 50, ${0.15 * finalIntensity})`);
        ambientGradient.addColorStop(0.7, `rgba(28, 100, 42, ${0.10 * finalIntensity})`);
        ambientGradient.addColorStop(0.85, `rgba(22, 80, 35, ${0.05 * finalIntensity})`);
        ambientGradient.addColorStop(1, 'rgba(18, 60, 28, 0)');
    } else if (runeType === 'Red') {
        // Forge Ember Magic - warm, flickering, transformative heat
        const emberFlicker = 1.0 + (Math.sin(currentTimeSeconds * 3.5) * 0.05 + Math.sin(currentTimeSeconds * 7.2) * 0.03);
        ambientGradient.addColorStop(0, `rgba(240, 100, 60, ${0.30 * finalIntensity * emberFlicker})`);
        ambientGradient.addColorStop(0.12, `rgba(220, 80, 50, ${0.26 * finalIntensity})`);
        ambientGradient.addColorStop(0.25, `rgba(200, 65, 45, ${0.22 * finalIntensity})`);
        ambientGradient.addColorStop(0.45, `rgba(170, 50, 40, ${0.16 * finalIntensity})`);
        ambientGradient.addColorStop(0.65, `rgba(140, 40, 35, ${0.10 * finalIntensity})`);
        ambientGradient.addColorStop(0.82, `rgba(110, 30, 30, ${0.05 * finalIntensity})`);
        ambientGradient.addColorStop(1, 'rgba(80, 20, 25, 0)');
    } else {
        // Arcane Crystal Magic - ethereal, shimmering, otherworldly
        const crystalShimmer = 1.0 + Math.sin(currentTimeSeconds * 2.2) * 0.06;
        ambientGradient.addColorStop(0, `rgba(100, 160, 255, ${0.28 * finalIntensity * crystalShimmer})`);
        ambientGradient.addColorStop(0.15, `rgba(85, 145, 235, ${0.24 * finalIntensity})`);
        ambientGradient.addColorStop(0.3, `rgba(70, 125, 215, ${0.20 * finalIntensity})`);
        ambientGradient.addColorStop(0.5, `rgba(55, 105, 190, ${0.15 * finalIntensity})`);
        ambientGradient.addColorStop(0.7, `rgba(45, 85, 165, ${0.09 * finalIntensity})`);
        ambientGradient.addColorStop(0.85, `rgba(38, 70, 140, ${0.04 * finalIntensity})`);
        ambientGradient.addColorStop(1, 'rgba(30, 55, 115, 0)');
    }

    ctx.fillStyle = ambientGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX, lightScreenY, ambientRadius, 0, Math.PI * 2);
    ctx.fill();

    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 3: INNER CORE RADIANCE - Bright, intense core glow
    // ═══════════════════════════════════════════════════════════════════════
    const coreRadius = NIGHT_LIGHT_RADIUS * 0.5;
    const corePulse = 1.0 + Math.sin(currentTimeSeconds * 1.5) * 0.1;
    const coreGradient = ctx.createRadialGradient(
        lightScreenX, lightScreenY - 20, 0, // Slight offset toward runestone top (doubled from 10)
        lightScreenX, lightScreenY - 20, coreRadius
    );
    
    // Bright accent color core with white-hot center
    coreGradient.addColorStop(0, `rgba(${Math.min(255, accentColor.r + 50)}, ${Math.min(255, accentColor.g + 50)}, ${Math.min(255, accentColor.b + 50)}, ${0.35 * finalIntensity * corePulse})`);
    coreGradient.addColorStop(0.2, `rgba(${accentColor.r}, ${accentColor.g}, ${accentColor.b}, ${0.28 * finalIntensity})`);
    coreGradient.addColorStop(0.4, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.20 * finalIntensity})`);
    coreGradient.addColorStop(0.7, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.10 * finalIntensity})`);
    coreGradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
    
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX, lightScreenY - 60, coreRadius, 0, Math.PI * 2); // Doubled from 30
    ctx.fill();

    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 4: ACCENT SHIMMER RING - Chromatic ring effect
    // ═══════════════════════════════════════════════════════════════════════
    const ringRadius = NIGHT_LIGHT_RADIUS * 0.65;
    const ringWidth = 50; // Doubled from 25
    const ringPulse = Math.sin(currentTimeSeconds * 0.8) * 0.5 + 0.5; // 0 to 1
    
    const ringGradient = ctx.createRadialGradient(
        lightScreenX, lightScreenY, ringRadius - ringWidth,
        lightScreenX, lightScreenY, ringRadius + ringWidth
    );
    
    ringGradient.addColorStop(0, `rgba(${accentColor.r}, ${accentColor.g}, ${accentColor.b}, 0)`);
    ringGradient.addColorStop(0.3, `rgba(${accentColor.r}, ${accentColor.g}, ${accentColor.b}, ${0.08 * finalIntensity * ringPulse})`);
    ringGradient.addColorStop(0.5, `rgba(${accentColor.r}, ${accentColor.g}, ${accentColor.b}, ${0.12 * finalIntensity * ringPulse})`);
    ringGradient.addColorStop(0.7, `rgba(${accentColor.r}, ${accentColor.g}, ${accentColor.b}, ${0.08 * finalIntensity * ringPulse})`);
    ringGradient.addColorStop(1, `rgba(${accentColor.r}, ${accentColor.g}, ${accentColor.b}, 0)`);
    
    ctx.fillStyle = ringGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX, lightScreenY, ringRadius + ringWidth, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 5: GROUND LIGHT POOL - Reflection on ground surface
    // ═══════════════════════════════════════════════════════════════════════
    if (nowMs !== undefined) {
        renderGroundLightPool(
            ctx,
            runeStone,
            runeType,
            cameraOffsetX,
            cameraOffsetY,
            nowMs,
            finalIntensity
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 7: RISING GLOWING PARTICLES - Mystical floating motes
    // ═══════════════════════════════════════════════════════════════════════
    if (nowMs !== undefined) {
        renderRisingParticles(
            ctx,
            runeStone,
            runeType,
            cycleProgress,
            cameraOffsetX,
            cameraOffsetY,
            nowMs,
            finalIntensity
        );
    }
}

// Define the configuration for rendering rune stones
const runeStoneConfig: GroundEntityConfig<RuneStone> = {
    getImageSource: getRuneStoneImageSource,

    getTargetDimensions: (img, _entity) => {
        const scaleFactor = TARGET_RUNE_STONE_WIDTH_PX / img.naturalWidth;
        return {
            width: TARGET_RUNE_STONE_WIDTH_PX,
            height: img.naturalHeight * scaleFactor,
        };
    },

    calculateDrawPosition: (entity, _drawWidth, drawHeight) => ({
        drawX: entity.posX - TARGET_RUNE_STONE_WIDTH_PX / 2,
        drawY: entity.posY - drawHeight,
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        drawDynamicGroundShadow({
            ctx,
            entityImage,
            entityCenterX: entityPosX,
            entityBaseY: entityPosY,
            imageDrawWidth,
            imageDrawHeight,
            cycleProgress,
            maxStretchFactor: 1.5,
            minStretchFactor: 0.15,
            shadowBlur: 2,
            pivotYOffset: 15,
        });
    },

    applyEffects: () => {
        // No shake effects for rune stones (they're static monuments)
        return { offsetX: 0, offsetY: 0 };
    },

    fallbackColor: 'purple',
};

// Preload all rune stone images
imageManager.preloadImage(monumentBlueImage);
imageManager.preloadImage(monumentRedImage);
imageManager.preloadImage(monumentGreenImage);

// Building restriction radius for rune stones (must match server-side value)
const RUNE_STONE_BUILDING_RESTRICTION_RADIUS = 800.0; // 800px = ~16 tiles

/**
 * Get the building restriction zone configuration for a rune stone
 * Returns the zone config that can be used with renderBuildingRestrictionOverlay
 */
export function getRuneStoneRestrictionZone(runeStone: RuneStone): BuildingRestrictionZoneConfig {
    return {
        centerX: runeStone.posX,
        centerY: runeStone.posY,
        radius: RUNE_STONE_BUILDING_RESTRICTION_RADIUS,
    };
}

/**
 * Renders a single rune stone entity onto the canvas.
 */
export function renderRuneStone(
    ctx: CanvasRenderingContext2D,
    runeStone: RuneStone,
    nowMs: number,
    cycleProgress: number,
    onlyDrawShadow?: boolean,
    skipDrawingShadow?: boolean,
    localPlayerPosition?: { x: number; y: number } | null, // Player position for transparency logic
    showBuildingRestriction?: boolean // Show building restriction overlay when Blueprint is equipped
): void {
    // Calculate if rune stone visually overlaps and occludes the player (same logic as trees/stones)
    const MIN_ALPHA = 0.3; // Minimum opacity when blocking player
    const MAX_ALPHA = 1.0; // Full opacity when not blocking
    const RUNE_STONE_WIDTH = TARGET_RUNE_STONE_WIDTH_PX; // 300px (doubled)
    
    let runeStoneAlpha = MAX_ALPHA;
    
    if (localPlayerPosition && !onlyDrawShadow) {
        // Calculate rune stone bounding box (use narrower width for occlusion - actual stone is ~60% of sprite width)
        const occlusionWidth = RUNE_STONE_WIDTH * 0.6; // ~180px - just the actual stone portion
        const occlusionHeight = RUNE_STONE_WIDTH * 0.8; // Upper portion that actually occludes
        
        const runeStoneLeft = runeStone.posX - occlusionWidth / 2;
        const runeStoneRight = runeStone.posX + occlusionWidth / 2;
        const runeStoneTop = runeStone.posY - occlusionHeight; // Only upper portion matters for occlusion
        const runeStoneBottom = runeStone.posY;
        
        // Player bounding box
        const playerSize = 48;
        const playerLeft = localPlayerPosition.x - playerSize / 2;
        const playerRight = localPlayerPosition.x + playerSize / 2;
        const playerTop = localPlayerPosition.y - playerSize;
        const playerBottom = localPlayerPosition.y;
        
        // Check if player overlaps with rune stone visually
        const overlapsHorizontally = playerRight > runeStoneLeft && playerLeft < runeStoneRight;
        const overlapsVertically = playerBottom > runeStoneTop && playerTop < runeStoneBottom;
        
        // Rune stone should be transparent if:
        // 1. It overlaps with player visually
        // 2. Rune stone renders AFTER player (runeStone.posY > player.posY means rune stone is in front in Y-sort)
        if (overlapsHorizontally && overlapsVertically && runeStone.posY > localPlayerPosition.y) {
            // Calculate how much the player is behind the rune stone (for smooth fade)
            const depthDifference = runeStone.posY - localPlayerPosition.y;
            const maxDepthForFade = 100; // Max distance for fade effect
            
            if (depthDifference > 0 && depthDifference < maxDepthForFade) {
                // Closer to rune stone = more transparent
                const fadeFactor = 1 - (depthDifference / maxDepthForFade);
                runeStoneAlpha = MAX_ALPHA - (fadeFactor * (MAX_ALPHA - MIN_ALPHA));
                runeStoneAlpha = Math.max(MIN_ALPHA, Math.min(MAX_ALPHA, runeStoneAlpha));
            } else if (depthDifference >= maxDepthForFade) {
                // Very close - use minimum alpha
                runeStoneAlpha = MIN_ALPHA;
            }
        }
    }
    
    // Apply transparency if needed
    const needsTransparency = runeStoneAlpha < MAX_ALPHA;
    if (needsTransparency) {
        ctx.save();
        ctx.globalAlpha = runeStoneAlpha;
    }
    
    renderConfiguredGroundEntity({
        ctx,
        entity: runeStone,
        config: runeStoneConfig,
        nowMs,
        entityPosX: runeStone.posX,
        entityPosY: runeStone.posY,
        cycleProgress,
        onlyDrawShadow,
        skipDrawingShadow,
    });
    
    // Restore context if transparency was applied
    if (needsTransparency) {
        ctx.restore();
    }
    
    // Draw building restriction overlay if Blueprint is equipped
    if (showBuildingRestriction && !onlyDrawShadow) {
        const zoneConfig = getRuneStoneRestrictionZone(runeStone);
        renderBuildingRestrictionOverlay(ctx, zoneConfig);
    }
}

