/**
 * shipwreckRenderingUtils.ts
 * 
 * Night lighting and particle effects for shipwreck monuments.
 * Shipwrecks are protected zones for new players - at night they emit
 * an eerie blue/purple glow with mystical particles to indicate safety.
 * 
 * AAA quality pixel art style inspired by Sea of Stars / Hyper Light Drifter.
 */

import { MonumentPart, MonumentType } from '../../generated/types';
import { isNightTime, NIGHT_LIGHTS_ON, LIGHT_FADE_FULL_AT, TWILIGHT_MORNING_FADE_START, TWILIGHT_MORNING_END } from '../../config/dayNightConstants';

// ═══════════════════════════════════════════════════════════════════════════
// NIGHT LIGHTING CONFIGURATION - EERIE SHIPWRECK ATMOSPHERE
// ═══════════════════════════════════════════════════════════════════════════

// Light radii and intensities
const NIGHT_LIGHT_RADIUS = 280; // Radius of the colored light effect per part (tighter glow)
const NIGHT_LIGHT_INTENSITY = 0.55; // Intensity of the light (0-1) - slightly dimmer than rune stones
const PROTECTION_INDICATOR_RADIUS = 192; // Visual indicator of protection zone (matches server-side SHIPWRECK_PROTECTION_RADIUS)

// Eerie blue/purple shipwreck colors - ghostly, ancient, protective
const SHIPWRECK_PRIMARY_COLOR = { r: 80, g: 120, b: 200 }; // Deep ocean blue
const SHIPWRECK_ACCENT_COLOR = { r: 140, g: 100, b: 220 }; // Mystical purple
const SHIPWRECK_DEEP_COLOR = { r: 30, g: 50, b: 100 }; // Deep indigo (outer halo)
const SHIPWRECK_HIGHLIGHT_COLOR = { r: 180, g: 200, b: 255 }; // Bright ethereal highlight

// Rising particle configuration (ghostly wisps rising from ancient wood)
const PARTICLE_COUNT = 12; // Particles per shipwreck part
const PARTICLE_RISE_SPEED = 8; // Slower ethereal rise
const PARTICLE_DRIFT_SPEED = 15; // More horizontal drift for ghostly feel
const PARTICLE_LIFETIME_SECONDS = 6.0; // Long lifetime for smooth flow
const PARTICLE_SPAWN_RADIUS = 100; // Spawn radius around part center
const PARTICLE_MIN_SIZE = 3;
const PARTICLE_MAX_SIZE = 10;
const PARTICLE_GLOW_INTENSITY = 0.75;

// Ground pool configuration (ghostly reflection on deck/beach)
const GROUND_POOL_RADIUS = 140;
const GROUND_POOL_INTENSITY = 0.3;

// Light center offset (adjust for shipwreck sprite positioning)
// Shipwreck parts are 512px tall sprites with anchor at bottom (worldY)
// Visual center is approximately 200-250px up from anchor point
const LIGHT_CENTER_Y_OFFSET = 220; // Pixels to offset light center upward from base

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simple deterministic random number generator based on seed
 * Ensures consistent particle positions for the same shipwreck part
 */
function seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

/**
 * Interface for rising particle data
 */
interface RisingParticle {
    baseX: number;
    baseY: number;
    spawnOffset: number;
    driftPhase: number;
    size: number;
    colorVariant: number; // 0-1, interpolates between primary and accent colors
}

/**
 * Generate deterministic particle data for a shipwreck part
 */
function generateRisingParticles(
    part: MonumentPart,
    nowMs: number
): RisingParticle[] {
    const particles: RisingParticle[] = [];
    const partId = Number(part.id) || 0;
    
    let seed = partId * 1000;
    const lightCenterY = part.worldY - LIGHT_CENTER_Y_OFFSET;
    
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = seededRandom(seed++) * Math.PI * 2;
        const distance = seededRandom(seed++) * PARTICLE_SPAWN_RADIUS;
        const baseX = part.worldX + Math.cos(angle) * distance;
        const baseY = lightCenterY + Math.sin(angle) * distance * 0.5; // Flattened
        
        const spawnOffset = seededRandom(seed++) * PARTICLE_LIFETIME_SECONDS;
        const driftPhase = seededRandom(seed++) * Math.PI * 2;
        const size = PARTICLE_MIN_SIZE + seededRandom(seed++) * (PARTICLE_MAX_SIZE - PARTICLE_MIN_SIZE);
        const colorVariant = seededRandom(seed++);
        
        particles.push({
            baseX,
            baseY,
            spawnOffset,
            driftPhase,
            size,
            colorVariant,
        });
    }
    
    return particles;
}

/**
 * Interpolate between two colors
 */
function lerpColor(
    c1: { r: number; g: number; b: number },
    c2: { r: number; g: number; b: number },
    t: number
): { r: number; g: number; b: number } {
    return {
        r: Math.round(c1.r + (c2.r - c1.r) * t),
        g: Math.round(c1.g + (c2.g - c1.g) * t),
        b: Math.round(c1.b + (c2.b - c1.b) * t),
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDERING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render ground light pool - ghostly glow on the ground
 */
function renderGroundLightPool(
    ctx: CanvasRenderingContext2D,
    part: MonumentPart,
    cameraOffsetX: number,
    cameraOffsetY: number,
    nowMs: number,
    timeIntensity: number
): void {
    const currentTimeSeconds = nowMs / 1000;
    
    const poolCenterX = part.worldX + cameraOffsetX;
    const poolCenterY = part.worldY + cameraOffsetY + 5; // At base
    
    // Subtle pulsing
    const pulsePhase = currentTimeSeconds * 0.6;
    const pulseScale = 1.0 + Math.sin(pulsePhase) * 0.08;
    const poolRadius = GROUND_POOL_RADIUS * pulseScale;
    
    ctx.save();
    
    // Elliptical ground pool
    ctx.scale(1, 0.35);
    const scaledY = poolCenterY / 0.35;
    
    const poolGradient = ctx.createRadialGradient(
        poolCenterX, scaledY, 0,
        poolCenterX, scaledY, poolRadius
    );
    
    const poolAlpha = timeIntensity * GROUND_POOL_INTENSITY;
    const color = SHIPWRECK_PRIMARY_COLOR;
    const deep = SHIPWRECK_DEEP_COLOR;
    
    poolGradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${poolAlpha * 0.5})`);
    poolGradient.addColorStop(0.3, `rgba(${color.r}, ${color.g}, ${color.b}, ${poolAlpha * 0.35})`);
    poolGradient.addColorStop(0.6, `rgba(${deep.r}, ${deep.g}, ${deep.b}, ${poolAlpha * 0.2})`);
    poolGradient.addColorStop(1, `rgba(${deep.r}, ${deep.g}, ${deep.b}, 0)`);
    
    ctx.fillStyle = poolGradient;
    ctx.beginPath();
    ctx.arc(poolCenterX, scaledY, poolRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

/**
 * Render rising ghostly particles
 */
function renderRisingParticles(
    ctx: CanvasRenderingContext2D,
    part: MonumentPart,
    cycleProgress: number,
    cameraOffsetX: number,
    cameraOffsetY: number,
    nowMs: number,
    timeIntensity: number
): void {
    if (!isNightTime(cycleProgress)) {
        return;
    }
    
    const particles = generateRisingParticles(part, nowMs);
    const currentTimeSeconds = nowMs / 1000;
    
    ctx.save();
    
    particles.forEach((particle) => {
        const particleAge = ((currentTimeSeconds + particle.spawnOffset) / PARTICLE_LIFETIME_SECONDS) % 1.0;
        
        // Eased rise
        const riseProgress = particleAge * particleAge * 0.4 + particleAge * 0.6;
        const riseDistance = riseProgress * PARTICLE_RISE_SPEED * PARTICLE_LIFETIME_SECONDS;
        const currentY = particle.baseY - riseDistance;
        
        // Ghostly drift (more erratic horizontal movement)
        const driftPrimary = Math.sin(currentTimeSeconds * 0.4 + particle.driftPhase) * PARTICLE_DRIFT_SPEED * 0.6;
        const driftSecondary = Math.cos(currentTimeSeconds * 0.7 + particle.driftPhase * 1.3) * PARTICLE_DRIFT_SPEED * 0.3;
        const driftTertiary = Math.sin(currentTimeSeconds * 1.1 + particle.driftPhase * 0.7) * PARTICLE_DRIFT_SPEED * 0.15;
        const currentX = particle.baseX + driftPrimary + driftSecondary + driftTertiary;
        
        const screenX = currentX + cameraOffsetX;
        const screenY = currentY + cameraOffsetY;
        
        // Alpha fade
        let alpha = 1.0;
        if (particleAge < 0.15) {
            alpha = Math.pow(particleAge / 0.15, 0.6);
        } else if (particleAge > 0.75) {
            alpha = Math.pow((1.0 - particleAge) / 0.25, 0.6);
        }
        alpha *= timeIntensity * PARTICLE_GLOW_INTENSITY;
        
        // Size pulsing
        const pulsePhase1 = currentTimeSeconds * 2.0 + particle.driftPhase;
        const pulsePhase2 = currentTimeSeconds * 1.0 + particle.driftPhase * 0.5;
        const pulseFactor = 1.0 + Math.sin(pulsePhase1) * 0.15 + Math.sin(pulsePhase2) * 0.1;
        const currentSize = particle.size * pulseFactor;
        
        // Check distance from light center
        const lightCenterY = part.worldY - LIGHT_CENTER_Y_OFFSET;
        const distanceFromCenter = Math.sqrt(
            Math.pow(currentX - part.worldX, 2) + 
            Math.pow(currentY - lightCenterY, 2)
        );
        
        if (distanceFromCenter > NIGHT_LIGHT_RADIUS * 1.3 || alpha < 0.03) {
            return;
        }
        
        // Get interpolated color
        const particleColor = lerpColor(SHIPWRECK_PRIMARY_COLOR, SHIPWRECK_ACCENT_COLOR, particle.colorVariant);
        
        // LAYER 0: Trailing afterglow
        const trailLength = 10;
        const trailAlpha = alpha * 0.12;
        for (let t = 1; t <= 3; t++) {
            const trailY = screenY + t * (trailLength / 3);
            const trailSize = currentSize * (1 - t * 0.12);
            ctx.fillStyle = `rgba(${particleColor.r}, ${particleColor.g}, ${particleColor.b}, ${trailAlpha * (1 - t * 0.25)})`;
            ctx.beginPath();
            ctx.arc(screenX, trailY, trailSize * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // LAYER 1: Outer glow halo
        const glowRadius = currentSize * 3.5;
        const outerGlow = ctx.createRadialGradient(
            screenX, screenY, 0,
            screenX, screenY, glowRadius
        );
        outerGlow.addColorStop(0, `rgba(${particleColor.r}, ${particleColor.g}, ${particleColor.b}, ${alpha * 0.3})`);
        outerGlow.addColorStop(0.4, `rgba(${particleColor.r}, ${particleColor.g}, ${particleColor.b}, ${alpha * 0.15})`);
        outerGlow.addColorStop(1, `rgba(${particleColor.r}, ${particleColor.g}, ${particleColor.b}, 0)`);
        
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(screenX, screenY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // LAYER 2: Core particle
        const coreGlow = ctx.createRadialGradient(
            screenX, screenY - 3, 0,
            screenX, screenY - 3, currentSize * 1.3
        );
        const highlight = SHIPWRECK_HIGHLIGHT_COLOR;
        coreGlow.addColorStop(0, `rgba(${Math.min(255, highlight.r)}, ${Math.min(255, highlight.g)}, ${Math.min(255, highlight.b)}, ${alpha * 0.9})`);
        coreGlow.addColorStop(0.4, `rgba(${particleColor.r}, ${particleColor.g}, ${particleColor.b}, ${alpha * 0.6})`);
        coreGlow.addColorStop(1, `rgba(${particleColor.r}, ${particleColor.g}, ${particleColor.b}, 0)`);
        
        ctx.fillStyle = coreGlow;
        ctx.beginPath();
        ctx.arc(screenX, screenY - 3, currentSize * 1.3, 0, Math.PI * 2);
        ctx.fill();
        
        // LAYER 3: Bright sparkle at center
        const sparkleSize = currentSize * 0.3;
        const sparkleAlpha = alpha * (0.6 + Math.sin(currentTimeSeconds * 6 + particle.driftPhase) * 0.4);
        ctx.fillStyle = `rgba(255, 255, 255, ${sparkleAlpha})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY - 4, sparkleSize, 0, Math.PI * 2);
        ctx.fill();
    });
    
    ctx.restore();
}

/**
 * Render night lighting effect for a shipwreck part
 * Creates an eerie blue/purple mystical glow with:
 * - Outer ethereal halo
 * - Inner core radiance
 * - Ground light pool
 * - Rising ghostly particles
 */
export function renderShipwreckNightLight(
    ctx: CanvasRenderingContext2D,
    part: MonumentPart,
    cycleProgress: number,
    cameraOffsetX: number,
    cameraOffsetY: number,
    nowMs?: number
): void {
    if (!isNightTime(cycleProgress)) {
        return;
    }
    
    const color = SHIPWRECK_PRIMARY_COLOR;
    const accent = SHIPWRECK_ACCENT_COLOR;
    const deep = SHIPWRECK_DEEP_COLOR;
    
    // Calculate light intensity based on night cycle (fade in from NIGHT_LIGHTS_ON to LIGHT_FADE_FULL_AT)
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
    
    // Multi-layered breathing effect
    const breathingPhase1 = (currentTimeSeconds * 0.3) % (Math.PI * 2);
    const breathingPhase2 = (currentTimeSeconds * 0.6) % (Math.PI * 2);
    const breathingPhase3 = (currentTimeSeconds * 1.0) % (Math.PI * 2);
    
    const breathingIntensity = 1.0 
        + Math.sin(breathingPhase1) * 0.08 
        + Math.sin(breathingPhase2) * 0.05 
        + Math.sin(breathingPhase3) * 0.03;
    
    const finalIntensity = timeIntensity * breathingIntensity;
    
    const lightScreenX = part.worldX + cameraOffsetX;
    const lightScreenY = part.worldY + cameraOffsetY - LIGHT_CENTER_Y_OFFSET;
    
    // Ghostly drift
    const driftX = Math.sin(currentTimeSeconds * 0.25) * 3;
    const driftY = Math.cos(currentTimeSeconds * 0.2) * 2;
    
    ctx.save();
    
    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 1: OUTER ETHEREAL HALO
    // ═══════════════════════════════════════════════════════════════════════
    const outerHaloRadius = NIGHT_LIGHT_RADIUS * 1.3;
    const outerHaloGradient = ctx.createRadialGradient(
        lightScreenX + driftX, lightScreenY + driftY, 0,
        lightScreenX + driftX, lightScreenY + driftY, outerHaloRadius
    );
    
    outerHaloGradient.addColorStop(0, `rgba(${deep.r}, ${deep.g}, ${deep.b}, ${0.12 * finalIntensity})`);
    outerHaloGradient.addColorStop(0.4, `rgba(${deep.r}, ${deep.g}, ${deep.b}, ${0.08 * finalIntensity})`);
    outerHaloGradient.addColorStop(0.7, `rgba(${deep.r}, ${deep.g}, ${deep.b}, ${0.04 * finalIntensity})`);
    outerHaloGradient.addColorStop(1, `rgba(${deep.r}, ${deep.g}, ${deep.b}, 0)`);
    
    ctx.fillStyle = outerHaloGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX + driftX, lightScreenY + driftY, outerHaloRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 2: MAIN AMBIENT GLOW
    // ═══════════════════════════════════════════════════════════════════════
    const ambientRadius = NIGHT_LIGHT_RADIUS * 0.9;
    const ambientGradient = ctx.createRadialGradient(
        lightScreenX, lightScreenY, 0,
        lightScreenX, lightScreenY, ambientRadius
    );
    
    // Eerie blue/purple shipwreck glow
    const ghostlyPulse = 1.0 + Math.sin(currentTimeSeconds * 1.5) * 0.06;
    ambientGradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.22 * finalIntensity * ghostlyPulse})`);
    ambientGradient.addColorStop(0.2, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.18 * finalIntensity})`);
    ambientGradient.addColorStop(0.4, `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${0.14 * finalIntensity})`);
    ambientGradient.addColorStop(0.6, `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${0.09 * finalIntensity})`);
    ambientGradient.addColorStop(0.8, `rgba(${deep.r}, ${deep.g}, ${deep.b}, ${0.05 * finalIntensity})`);
    ambientGradient.addColorStop(1, `rgba(${deep.r}, ${deep.g}, ${deep.b}, 0)`);
    
    ctx.fillStyle = ambientGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX, lightScreenY, ambientRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 3: INNER CORE RADIANCE
    // ═══════════════════════════════════════════════════════════════════════
    const coreRadius = NIGHT_LIGHT_RADIUS * 0.4;
    const corePulse = 1.0 + Math.sin(currentTimeSeconds * 1.2) * 0.12;
    const coreGradient = ctx.createRadialGradient(
        lightScreenX, lightScreenY - 15, 0,
        lightScreenX, lightScreenY - 15, coreRadius
    );
    
    const highlight = SHIPWRECK_HIGHLIGHT_COLOR;
    coreGradient.addColorStop(0, `rgba(${highlight.r}, ${highlight.g}, ${highlight.b}, ${0.28 * finalIntensity * corePulse})`);
    coreGradient.addColorStop(0.3, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.20 * finalIntensity})`);
    coreGradient.addColorStop(0.6, `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${0.12 * finalIntensity})`);
    coreGradient.addColorStop(1, `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0)`);
    
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX, lightScreenY - 15, coreRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 4: PROTECTION ZONE INDICATOR (subtle ring)
    // ═══════════════════════════════════════════════════════════════════════
    // NOTE: Protection indicator centered at visual center of shipwreck part
    // Server-side protection is technically at worldY (anchor), but visually
    // it makes more sense to show the ring where the ship visually is
    const protectionRadius = PROTECTION_INDICATOR_RADIUS;
    const ringPulse = Math.sin(currentTimeSeconds * 0.5) * 0.4 + 0.6;
    const ringAlpha = 0.06 * finalIntensity * ringPulse;
    
    ctx.strokeStyle = `rgba(${highlight.r}, ${highlight.g}, ${highlight.b}, ${ringAlpha})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 20]); // Dashed line for mystical effect
    ctx.beginPath();
    ctx.arc(lightScreenX, lightScreenY, protectionRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.restore();
    
    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 5: GROUND LIGHT POOL
    // ═══════════════════════════════════════════════════════════════════════
    if (nowMs !== undefined) {
        renderGroundLightPool(ctx, part, cameraOffsetX, cameraOffsetY, nowMs, finalIntensity);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 6: RISING GHOSTLY PARTICLES
    // ═══════════════════════════════════════════════════════════════════════
    if (nowMs !== undefined) {
        renderRisingParticles(ctx, part, cycleProgress, cameraOffsetX, cameraOffsetY, nowMs, finalIntensity);
    }
}

/**
 * Render night lighting for all visible shipwreck parts
 */
export function renderAllShipwreckNightLights(
    ctx: CanvasRenderingContext2D,
    shipwreckParts: Map<string, MonumentPart>,
    cycleProgress: number,
    cameraOffsetX: number,
    cameraOffsetY: number,
    viewMinX: number,
    viewMaxX: number,
    viewMinY: number,
    viewMaxY: number,
    nowMs: number
): void {
    // Only render at night
    if (!isNightTime(cycleProgress)) {
        return;
    }
    
    const buffer = NIGHT_LIGHT_RADIUS * 1.5;
    
    shipwreckParts.forEach((part) => {
        // Only render shipwreck monument parts
        if (part.monumentType.tag !== 'Shipwreck') {
            return;
        }
        
        // Viewport culling with buffer for light radius
        if (part.worldX + buffer < viewMinX || part.worldX - buffer > viewMaxX ||
            part.worldY + buffer < viewMinY || part.worldY - buffer > viewMaxY) {
            return;
        }
        
        renderShipwreckNightLight(ctx, part, cycleProgress, cameraOffsetX, cameraOffsetY, nowMs);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// DEBUG: VISIBLE PROTECTION ZONE CIRCLES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DEBUG: Render a highly visible protection zone circle for a shipwreck part
 * Shows both the visual center (where protection zone is) and the anchor point
 */
export function renderShipwreckDebugZone(
    ctx: CanvasRenderingContext2D,
    part: MonumentPart,
    cameraOffsetX: number,
    cameraOffsetY: number
): void {
    const anchorScreenX = part.worldX + cameraOffsetX;
    const anchorScreenY = part.worldY + cameraOffsetY;
    
    // Visual center (where protection zone is centered)
    const visualCenterScreenX = anchorScreenX;
    const visualCenterScreenY = anchorScreenY - LIGHT_CENTER_Y_OFFSET;
    
    ctx.save();
    
    // ===== PROTECTION ZONE CIRCLE (at visual center) =====
    // Filled semi-transparent circle
    ctx.fillStyle = 'rgba(140, 100, 220, 0.15)'; // Purple fill
    ctx.beginPath();
    ctx.arc(visualCenterScreenX, visualCenterScreenY, PROTECTION_INDICATOR_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    
    // Solid border
    ctx.strokeStyle = 'rgba(140, 100, 220, 0.8)'; // Purple border
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(visualCenterScreenX, visualCenterScreenY, PROTECTION_INDICATOR_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    
    // ===== VISUAL CENTER MARKER (crosshair) =====
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)'; // Green
    ctx.lineWidth = 2;
    const crossSize = 20;
    
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(visualCenterScreenX - crossSize, visualCenterScreenY);
    ctx.lineTo(visualCenterScreenX + crossSize, visualCenterScreenY);
    ctx.stroke();
    
    // Vertical line
    ctx.beginPath();
    ctx.moveTo(visualCenterScreenX, visualCenterScreenY - crossSize);
    ctx.lineTo(visualCenterScreenX, visualCenterScreenY + crossSize);
    ctx.stroke();
    
    // ===== ANCHOR POINT MARKER (red dot at worldY) =====
    ctx.fillStyle = 'rgba(255, 0, 0, 0.9)'; // Red
    ctx.beginPath();
    ctx.arc(anchorScreenX, anchorScreenY, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // ===== LINE FROM ANCHOR TO VISUAL CENTER =====
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)'; // Yellow dashed line
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(anchorScreenX, anchorScreenY);
    ctx.lineTo(visualCenterScreenX, visualCenterScreenY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // ===== LABELS =====
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'center';
    
    // Label at visual center
    ctx.fillText(`PROTECTION ZONE (192px)`, visualCenterScreenX, visualCenterScreenY - PROTECTION_INDICATOR_RADIUS - 10);
    ctx.fillText(`Y: ${Math.round(part.worldY - LIGHT_CENTER_Y_OFFSET)}`, visualCenterScreenX, visualCenterScreenY + 5);
    
    // Label at anchor
    ctx.fillStyle = 'rgba(255, 100, 100, 0.9)';
    ctx.fillText(`ANCHOR Y: ${Math.round(part.worldY)}`, anchorScreenX, anchorScreenY + 20);
    
    ctx.restore();
}

/**
 * DEBUG: Render protection zone debug circles for ALL shipwreck parts
 * Call this from GameCanvas to visualize where the protection zones are
 */
export function renderAllShipwreckDebugZones(
    ctx: CanvasRenderingContext2D,
    shipwreckParts: Map<string, MonumentPart>,
    cameraOffsetX: number,
    cameraOffsetY: number,
    viewMinX: number,
    viewMaxX: number,
    viewMinY: number,
    viewMaxY: number
): void {
    const buffer = PROTECTION_INDICATOR_RADIUS + 100;
    
    shipwreckParts.forEach((part) => {
        // Only render shipwreck monument parts
        if (part.monumentType.tag !== 'Shipwreck') {
            return;
        }
        
        // Viewport culling
        if (part.worldX + buffer < viewMinX || part.worldX - buffer > viewMaxX ||
            part.worldY + buffer < viewMinY || part.worldY - buffer > viewMaxY) {
            return;
        }
        
        renderShipwreckDebugZone(ctx, part, cameraOffsetX, cameraOffsetY);
    });
}
