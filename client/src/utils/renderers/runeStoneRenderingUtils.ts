import { RuneStone } from '../../generated';
import monumentBlueImage from '../../assets/doodads/monument_blue.png';
import monumentRedImage from '../../assets/doodads/monument_red.png';
import monumentGreenImage from '../../assets/doodads/monument_green.png';
import { drawDynamicGroundShadow } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';

// Configuration constants
const TARGET_RUNE_STONE_WIDTH_PX = 150; // Target width on screen (slightly larger than stones)

// Rune stone type keys
type RuneStoneTypeKey = 'Green' | 'Red' | 'Blue';

// Rune stone type to image mapping
const RUNE_STONE_IMAGES: Record<RuneStoneTypeKey, string> = {
    'Green': monumentGreenImage,
    'Red': monumentRedImage,
    'Blue': monumentBlueImage,
};

// Night lighting configuration
const NIGHT_LIGHT_RADIUS = 200; // Radius of the colored light effect
const NIGHT_LIGHT_INTENSITY = 0.6; // Intensity of the light (0-1)
const TWILIGHT_EVENING_START = 0.76; // Start of twilight evening (76% through day)
const TWILIGHT_MORNING_END = 1.0; // End of twilight morning (100% through day, wraps around)

// Rune stone colors for night lighting
const RUNE_STONE_COLORS: Record<RuneStoneTypeKey, { r: number; g: number; b: number }> = {
    'Green': { r: 50, g: 200, b: 50 },
    'Red': { r: 200, g: 50, b: 50 },
    'Blue': { r: 50, g: 100, b: 200 },
};

// Rising particle configuration (Sea of Stars style)
const PARTICLE_COUNT = 12; // Number of rising particles per runestone
const PARTICLE_RISE_SPEED = 15; // Pixels per second upward movement
const PARTICLE_DRIFT_SPEED = 8; // Pixels per second horizontal drift
const PARTICLE_LIFETIME_SECONDS = 4.0; // How long each particle lives
const PARTICLE_SPAWN_RADIUS = 60; // Radius around runestone where particles spawn
const PARTICLE_MIN_SIZE = 2; // Minimum particle size
const PARTICLE_MAX_SIZE = 5; // Maximum particle size
const PARTICLE_GLOW_INTENSITY = 0.8; // Glow intensity multiplier

/**
 * Get the image source for a rune stone based on its type
 */
function getRuneStoneImageSource(runeStone: RuneStone): string {
    const runeType = (runeStone.runeType?.tag || 'Blue') as RuneStoneTypeKey; // Default to Blue if not set
    return RUNE_STONE_IMAGES[runeType] || RUNE_STONE_IMAGES['Blue'];
}

/**
 * Check if it's night time (between twilight evening and twilight morning)
 * Excludes Dawn (0.0-0.05) - only shows from twilight evening (0.76) to twilight morning (ends at 1.0)
 */
function isNightTime(cycleProgress: number): boolean {
    // Only show from twilight evening (0.76) through end of cycle (1.0)
    // This excludes Dawn (0.0-0.05) which comes after twilight morning wraps around
    return cycleProgress >= TWILIGHT_EVENING_START;
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
    
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Generate deterministic spawn position around runestone
        const angle = seededRandom(seed++) * Math.PI * 2;
        const distance = seededRandom(seed++) * PARTICLE_SPAWN_RADIUS;
        const baseX = runeStone.posX + Math.cos(angle) * distance;
        const baseY = runeStone.posY + Math.sin(angle) * distance;
        
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
 * Render rising glowing particles around runestones (Sea of Stars style)
 * Creates mystical floating particles that rise and glow within the light area
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
    
    ctx.save();
    
    particles.forEach((particle) => {
        // Calculate particle age (0-1, loops)
        const particleAge = ((currentTimeSeconds + particle.spawnOffset) / PARTICLE_LIFETIME_SECONDS) % 1.0;
        
        // Calculate vertical position (rises from baseY upward)
        const riseDistance = particleAge * PARTICLE_RISE_SPEED * PARTICLE_LIFETIME_SECONDS;
        const currentY = particle.baseY - riseDistance;
        
        // Horizontal drift (gentle swaying motion)
        const driftAmount = Math.sin(currentTimeSeconds * 0.5 + particle.driftPhase) * PARTICLE_DRIFT_SPEED * 0.5;
        const currentX = particle.baseX + driftAmount;
        
        // Apply camera offset
        const screenX = currentX + cameraOffsetX;
        const screenY = currentY + cameraOffsetY;
        
        // Alpha: Fade in at start, fade out at end, peak in middle
        let alpha = 1.0;
        if (particleAge < 0.15) {
            // Fade in
            alpha = particleAge / 0.15;
        } else if (particleAge > 0.85) {
            // Fade out
            alpha = (1.0 - particleAge) / 0.15;
        }
        alpha *= timeIntensity * PARTICLE_GLOW_INTENSITY;
        
        // Size pulsing (gentle breathing effect)
        const pulsePhase = currentTimeSeconds * 2 + particle.driftPhase;
        const pulseFactor = 1.0 + Math.sin(pulsePhase) * 0.15; // ±15% size variation
        const currentSize = particle.size * pulseFactor;
        
        // Only render if visible and within light radius
        const distanceFromCenter = Math.sqrt(
            Math.pow(currentX - runeStone.posX, 2) + 
            Math.pow(currentY - runeStone.posY, 2)
        );
        
        if (distanceFromCenter > NIGHT_LIGHT_RADIUS || alpha < 0.05) {
            return; // Skip particles outside light radius or too faint
        }
        
        // AAA Sea of Stars quality: Multi-layered glowing particle
        // LAYER 1: Outer soft glow halo
        const glowRadius = currentSize * 2.5;
        const outerGlow = ctx.createRadialGradient(
            screenX, screenY, 0,
            screenX, screenY, glowRadius
        );
        outerGlow.addColorStop(0, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${alpha * 0.3})`);
        outerGlow.addColorStop(0.5, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${alpha * 0.15})`);
        outerGlow.addColorStop(1, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, 0)`);
        
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(screenX, screenY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // LAYER 2: Bright core particle
        const coreRadius = currentSize * 0.6;
        const coreGlow = ctx.createRadialGradient(
            screenX, screenY, 0,
            screenX, screenY, currentSize
        );
        coreGlow.addColorStop(0, `rgba(${Math.min(255, particle.color.r + 100)}, ${Math.min(255, particle.color.g + 100)}, ${Math.min(255, particle.color.b + 100)}, ${alpha * 0.9})`);
        coreGlow.addColorStop(0.6, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${alpha * 0.6})`);
        coreGlow.addColorStop(1, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, 0)`);
        
        ctx.fillStyle = coreGlow;
        ctx.beginPath();
        ctx.arc(screenX, screenY, currentSize, 0, Math.PI * 2);
        ctx.fill();
        
        // LAYER 3: Tiny bright sparkle at center
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY, coreRadius, 0, Math.PI * 2);
        ctx.fill();
    });
    
    ctx.restore();
}

/**
 * Render night lighting effect for rune stones
 * Creates a colored cutout lighting effect similar to campfires
 * Uses drawRadialLightCutout for proper light rendering
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

    // Calculate light intensity based on how deep into night we are
    let timeIntensity = NIGHT_LIGHT_INTENSITY;
    if (cycleProgress >= TWILIGHT_EVENING_START) {
        // Fade in quickly during twilight evening, then maintain full intensity
        if (cycleProgress < 0.80) {
            // Twilight evening (0.76-0.80) - fade in
            timeIntensity = NIGHT_LIGHT_INTENSITY * ((cycleProgress - TWILIGHT_EVENING_START) / (0.80 - TWILIGHT_EVENING_START));
        } else if (cycleProgress >= 0.97) {
            // Twilight morning (0.97-1.0) - fade out
            timeIntensity = NIGHT_LIGHT_INTENSITY * ((TWILIGHT_MORNING_END - cycleProgress) / (TWILIGHT_MORNING_END - 0.97));
        }
        // Full night (0.80-0.97) uses full NIGHT_LIGHT_INTENSITY
    }
    
    // Add subtle breathing/pulsing effect (very gentle, mystical)
    const breathingPhase = (Date.now() / 3000) % (Math.PI * 2); // 3 second cycle
    const breathingIntensity = 1.0 + Math.sin(breathingPhase) * 0.08; // ±8% gentle pulse
    const finalIntensity = timeIntensity * breathingIntensity;

    // Apply camera offset to world coordinates
    const lightScreenX = runeStone.posX + cameraOffsetX;
    const lightScreenY = runeStone.posY + cameraOffsetY;

    ctx.save();

    // AAA Sea of Stars quality: Multi-layered diffuse atmospheric glow
    // LAYER 1: Large ambient atmospheric glow - fills entire area with soft color tint
    const ambientRadius = NIGHT_LIGHT_RADIUS * 1.0; // Full radius
    const ambientGradient = ctx.createRadialGradient(
        lightScreenX,
        lightScreenY,
        0,
        lightScreenX,
        lightScreenY,
        ambientRadius
    );

    // Create diffuse, atmospheric glow that fills the entire area
    // Color values are tuned for each rune type to feel magical and ethereal
    if (runeType === 'Green') {
        // Emerald - Mystical agrarian magic: soft, organic, life-giving
        ambientGradient.addColorStop(0, `rgba(40, 140, 50, ${0.20 * finalIntensity})`);
        ambientGradient.addColorStop(0.2, `rgba(35, 120, 45, ${0.18 * finalIntensity})`);
        ambientGradient.addColorStop(0.4, `rgba(30, 100, 40, ${0.15 * finalIntensity})`);
        ambientGradient.addColorStop(0.6, `rgba(25, 85, 35, ${0.12 * finalIntensity})`);
        ambientGradient.addColorStop(0.8, `rgba(20, 70, 30, ${0.08 * finalIntensity})`);
        ambientGradient.addColorStop(1, 'rgba(15, 55, 25, 0)');
    } else if (runeType === 'Red') {
        // Crimson - Forge fire magic: warm, intense, transformative
        ambientGradient.addColorStop(0, `rgba(200, 50, 50, ${0.22 * finalIntensity})`);
        ambientGradient.addColorStop(0.2, `rgba(180, 45, 45, ${0.19 * finalIntensity})`);
        ambientGradient.addColorStop(0.4, `rgba(160, 40, 40, ${0.16 * finalIntensity})`);
        ambientGradient.addColorStop(0.6, `rgba(140, 35, 35, ${0.13 * finalIntensity})`);
        ambientGradient.addColorStop(0.8, `rgba(120, 30, 30, ${0.09 * finalIntensity})`);
        ambientGradient.addColorStop(1, 'rgba(100, 25, 25, 0)');
    } else {
        // Azure - Memory shard magic: ethereal, dreamlike, otherworldly
        ambientGradient.addColorStop(0, `rgba(60, 140, 220, ${0.21 * finalIntensity})`);
        ambientGradient.addColorStop(0.2, `rgba(55, 120, 200, ${0.18 * finalIntensity})`);
        ambientGradient.addColorStop(0.4, `rgba(50, 100, 180, ${0.15 * finalIntensity})`);
        ambientGradient.addColorStop(0.6, `rgba(45, 85, 160, ${0.12 * finalIntensity})`);
        ambientGradient.addColorStop(0.8, `rgba(40, 70, 140, ${0.08 * finalIntensity})`);
        ambientGradient.addColorStop(1, 'rgba(35, 55, 120, 0)');
    }

    ctx.fillStyle = ambientGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX, lightScreenY, ambientRadius, 0, Math.PI * 2);
    ctx.fill();

    // LAYER 2: Core bright glow - adds depth and intensity at the center
    // Creates a more focused "source of power" feeling while maintaining diffuse quality
    const coreRadius = NIGHT_LIGHT_RADIUS * 0.35;
    const coreGradient = ctx.createRadialGradient(
        lightScreenX,
        lightScreenY,
        0,
        lightScreenX,
        lightScreenY,
        coreRadius
    );

    if (runeType === 'Green') {
        coreGradient.addColorStop(0, `rgba(60, 200, 70, ${0.30 * finalIntensity})`);
        coreGradient.addColorStop(0.4, `rgba(50, 170, 60, ${0.24 * finalIntensity})`);
        coreGradient.addColorStop(0.7, `rgba(40, 140, 50, ${0.16 * finalIntensity})`);
        coreGradient.addColorStop(1, `rgba(30, 100, 40, ${0.08 * finalIntensity})`);
    } else if (runeType === 'Red') {
        coreGradient.addColorStop(0, `rgba(255, 80, 80, ${0.32 * finalIntensity})`);
        coreGradient.addColorStop(0.4, `rgba(230, 70, 70, ${0.26 * finalIntensity})`);
        coreGradient.addColorStop(0.7, `rgba(200, 60, 60, ${0.18 * finalIntensity})`);
        coreGradient.addColorStop(1, `rgba(170, 50, 50, ${0.10 * finalIntensity})`);
    } else {
        coreGradient.addColorStop(0, `rgba(80, 180, 255, ${0.31 * finalIntensity})`);
        coreGradient.addColorStop(0.4, `rgba(70, 160, 240, ${0.25 * finalIntensity})`);
        coreGradient.addColorStop(0.7, `rgba(60, 140, 220, ${0.17 * finalIntensity})`);
        coreGradient.addColorStop(1, `rgba(50, 120, 200, ${0.09 * finalIntensity})`);
    }

    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX, lightScreenY, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    
    // Render rising glowing particles (Sea of Stars style)
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

/**
 * Renders a single rune stone entity onto the canvas.
 */
export function renderRuneStone(
    ctx: CanvasRenderingContext2D,
    runeStone: RuneStone,
    nowMs: number,
    cycleProgress: number,
    onlyDrawShadow?: boolean,
    skipDrawingShadow?: boolean
): void {
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
}

