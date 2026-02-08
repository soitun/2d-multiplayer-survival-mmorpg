/**
 * compoundEerieLightUtils.ts
 * 
 * Eerie nanobot-style ambient light rendering for the central compound.
 * Replaces the old street lamp graphics with ghostly blue/purple glows
 * similar to the shipwreck Lagunov ghost lights, giving the compound
 * an otherworldly, technology-infused atmosphere at night.
 * 
 * These are purely visual overlays (no collision, no physical structure).
 * The day/night mask cutouts are handled separately in useDayNightCycle.ts.
 */

import { getCompoundEerieLightsWithPositions, CompoundEerieLight } from '../../config/compoundBuildings';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - Eerie Nanobot Light Palette
// ═══════════════════════════════════════════════════════════════════════════

// Night time thresholds (matches shipwreckRenderingUtils.ts)
const TWILIGHT_EVENING_START = 0.76;
const TWILIGHT_MORNING_END = 1.0;

// Eerie nanobot colors - ghostly blue/purple matching Lagunov ghost palette
const EERIE_PRIMARY = { r: 80, g: 120, b: 200 };   // Deep ocean blue
const EERIE_ACCENT = { r: 140, g: 100, b: 220 };    // Mystical purple
const EERIE_DEEP = { r: 30, g: 50, b: 100 };        // Deep indigo (outer halo)
const EERIE_HIGHLIGHT = { r: 180, g: 200, b: 255 };  // Bright ethereal highlight

// Rising particle configuration
const PARTICLE_COUNT = 8;
const PARTICLE_LIFETIME_SECONDS = 5.0;
const PARTICLE_SPAWN_RADIUS = 60;
const PARTICLE_MIN_SIZE = 2;
const PARTICLE_MAX_SIZE = 7;

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════════════

function isNightTime(cycleProgress: number): boolean {
    return cycleProgress >= TWILIGHT_EVENING_START;
}

function seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

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
// RENDERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a single compound eerie light with full shipwreck-style effects:
 * - Outer ethereal halo with drift
 * - Main ambient blue/purple glow
 * - Inner core radiance
 * - Ground light pool (elliptical)
 * - Rising ghostly particles
 */
function renderCompoundEerieLight(
    ctx: CanvasRenderingContext2D,
    light: CompoundEerieLight & { worldX: number; worldY: number },
    cycleProgress: number,
    cameraOffsetX: number,
    cameraOffsetY: number,
    nowMs: number
): void {
    if (!isNightTime(cycleProgress)) return;

    // Calculate time-based intensity (fade in/out at twilight)
    let timeIntensity = light.intensity;
    if (cycleProgress < 0.80) {
        const fadeProgress = (cycleProgress - TWILIGHT_EVENING_START) / (0.80 - TWILIGHT_EVENING_START);
        timeIntensity = light.intensity * Math.pow(Math.max(0, fadeProgress), 0.7);
    } else if (cycleProgress >= 0.97) {
        const fadeProgress = (TWILIGHT_MORNING_END - cycleProgress) / (TWILIGHT_MORNING_END - 0.97);
        timeIntensity = light.intensity * Math.pow(Math.max(0, fadeProgress), 0.7);
    }

    const currentTimeSeconds = nowMs / 1000;

    // Multi-layered breathing effect
    const breathingIntensity = 1.0
        + Math.sin(currentTimeSeconds * 0.3) * 0.08
        + Math.sin(currentTimeSeconds * 0.6) * 0.05
        + Math.sin(currentTimeSeconds * 1.0) * 0.03;

    const finalIntensity = timeIntensity * breathingIntensity;
    if (finalIntensity <= 0.01) return;

    const screenX = light.worldX + cameraOffsetX;
    const screenY = light.worldY + cameraOffsetY;

    // Ghostly drift
    const driftX = Math.sin(currentTimeSeconds * 0.25) * 3;
    const driftY = Math.cos(currentTimeSeconds * 0.2) * 2;

    ctx.save();

    // ═══════════════════════════════════════════════════════════
    // LAYER 1: OUTER ETHEREAL HALO
    // ═══════════════════════════════════════════════════════════
    const outerHaloRadius = light.radius * 1.3;
    const outerHaloGradient = ctx.createRadialGradient(
        screenX + driftX, screenY + driftY, 0,
        screenX + driftX, screenY + driftY, outerHaloRadius
    );
    outerHaloGradient.addColorStop(0, `rgba(${EERIE_DEEP.r}, ${EERIE_DEEP.g}, ${EERIE_DEEP.b}, ${0.12 * finalIntensity})`);
    outerHaloGradient.addColorStop(0.4, `rgba(${EERIE_DEEP.r}, ${EERIE_DEEP.g}, ${EERIE_DEEP.b}, ${0.08 * finalIntensity})`);
    outerHaloGradient.addColorStop(0.7, `rgba(${EERIE_DEEP.r}, ${EERIE_DEEP.g}, ${EERIE_DEEP.b}, ${0.04 * finalIntensity})`);
    outerHaloGradient.addColorStop(1, `rgba(${EERIE_DEEP.r}, ${EERIE_DEEP.g}, ${EERIE_DEEP.b}, 0)`);

    ctx.fillStyle = outerHaloGradient;
    ctx.beginPath();
    ctx.arc(screenX + driftX, screenY + driftY, outerHaloRadius, 0, Math.PI * 2);
    ctx.fill();

    // ═══════════════════════════════════════════════════════════
    // LAYER 2: MAIN AMBIENT GLOW
    // ═══════════════════════════════════════════════════════════
    const ambientRadius = light.radius * 0.9;
    const ghostlyPulse = 1.0 + Math.sin(currentTimeSeconds * 1.5) * 0.06;
    const ambientGradient = ctx.createRadialGradient(
        screenX, screenY, 0,
        screenX, screenY, ambientRadius
    );
    ambientGradient.addColorStop(0, `rgba(${EERIE_PRIMARY.r}, ${EERIE_PRIMARY.g}, ${EERIE_PRIMARY.b}, ${0.22 * finalIntensity * ghostlyPulse})`);
    ambientGradient.addColorStop(0.2, `rgba(${EERIE_PRIMARY.r}, ${EERIE_PRIMARY.g}, ${EERIE_PRIMARY.b}, ${0.18 * finalIntensity})`);
    ambientGradient.addColorStop(0.4, `rgba(${EERIE_ACCENT.r}, ${EERIE_ACCENT.g}, ${EERIE_ACCENT.b}, ${0.14 * finalIntensity})`);
    ambientGradient.addColorStop(0.6, `rgba(${EERIE_ACCENT.r}, ${EERIE_ACCENT.g}, ${EERIE_ACCENT.b}, ${0.09 * finalIntensity})`);
    ambientGradient.addColorStop(0.8, `rgba(${EERIE_DEEP.r}, ${EERIE_DEEP.g}, ${EERIE_DEEP.b}, ${0.05 * finalIntensity})`);
    ambientGradient.addColorStop(1, `rgba(${EERIE_DEEP.r}, ${EERIE_DEEP.g}, ${EERIE_DEEP.b}, 0)`);

    ctx.fillStyle = ambientGradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, ambientRadius, 0, Math.PI * 2);
    ctx.fill();

    // ═══════════════════════════════════════════════════════════
    // LAYER 3: INNER CORE RADIANCE
    // ═══════════════════════════════════════════════════════════
    const coreRadius = light.radius * 0.35;
    const corePulse = 1.0 + Math.sin(currentTimeSeconds * 1.2) * 0.12;
    const coreGradient = ctx.createRadialGradient(
        screenX, screenY - 10, 0,
        screenX, screenY - 10, coreRadius
    );
    coreGradient.addColorStop(0, `rgba(${EERIE_HIGHLIGHT.r}, ${EERIE_HIGHLIGHT.g}, ${EERIE_HIGHLIGHT.b}, ${0.25 * finalIntensity * corePulse})`);
    coreGradient.addColorStop(0.3, `rgba(${EERIE_PRIMARY.r}, ${EERIE_PRIMARY.g}, ${EERIE_PRIMARY.b}, ${0.18 * finalIntensity})`);
    coreGradient.addColorStop(0.6, `rgba(${EERIE_ACCENT.r}, ${EERIE_ACCENT.g}, ${EERIE_ACCENT.b}, ${0.10 * finalIntensity})`);
    coreGradient.addColorStop(1, `rgba(${EERIE_ACCENT.r}, ${EERIE_ACCENT.g}, ${EERIE_ACCENT.b}, 0)`);

    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY - 10, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // ═══════════════════════════════════════════════════════════
    // LAYER 4: GROUND LIGHT POOL (elliptical)
    // ═══════════════════════════════════════════════════════════
    const poolRadius = light.radius * 0.5;
    const poolPulse = 1.0 + Math.sin(currentTimeSeconds * 0.6) * 0.08;
    const poolAlpha = 0.25 * finalIntensity * poolPulse;

    ctx.save();
    ctx.translate(screenX, screenY + 10);
    ctx.scale(1, 0.35); // Flatten vertically for ground pool
    const poolGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, poolRadius);
    poolGradient.addColorStop(0, `rgba(${EERIE_PRIMARY.r}, ${EERIE_PRIMARY.g}, ${EERIE_PRIMARY.b}, ${poolAlpha})`);
    poolGradient.addColorStop(0.4, `rgba(${EERIE_ACCENT.r}, ${EERIE_ACCENT.g}, ${EERIE_ACCENT.b}, ${poolAlpha * 0.6})`);
    poolGradient.addColorStop(1, `rgba(${EERIE_DEEP.r}, ${EERIE_DEEP.g}, ${EERIE_DEEP.b}, 0)`);
    ctx.fillStyle = poolGradient;
    ctx.beginPath();
    ctx.arc(0, 0, poolRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ═══════════════════════════════════════════════════════════
    // LAYER 5: RISING GHOSTLY PARTICLES
    // ═══════════════════════════════════════════════════════════
    renderEerieParticles(ctx, light, screenX, screenY, nowMs, finalIntensity);
}

/**
 * Render deterministic rising particles for an eerie compound light.
 */
function renderEerieParticles(
    ctx: CanvasRenderingContext2D,
    light: CompoundEerieLight,
    screenX: number,
    screenY: number,
    nowMs: number,
    finalIntensity: number
): void {
    const currentTimeSeconds = nowMs / 1000;
    // Use light ID hash as seed base for determinism
    let seedBase = 0;
    for (let i = 0; i < light.id.length; i++) {
        seedBase = seedBase * 31 + light.id.charCodeAt(i);
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        let seed = seedBase + i * 1000;

        const angle = seededRandom(seed++) * Math.PI * 2;
        const distance = seededRandom(seed++) * PARTICLE_SPAWN_RADIUS;
        const spawnOffsetX = Math.cos(angle) * distance;
        const spawnOffsetY = Math.sin(angle) * distance * 0.5;
        const spawnTimeOffset = seededRandom(seed++) * PARTICLE_LIFETIME_SECONDS;
        const driftPhase = seededRandom(seed++) * Math.PI * 2;
        const size = PARTICLE_MIN_SIZE + seededRandom(seed++) * (PARTICLE_MAX_SIZE - PARTICLE_MIN_SIZE);
        const colorVariant = seededRandom(seed++);

        // Calculate particle lifecycle position
        const particleTime = (currentTimeSeconds + spawnTimeOffset) % PARTICLE_LIFETIME_SECONDS;
        const lifeProgress = particleTime / PARTICLE_LIFETIME_SECONDS;

        // Rise upward
        const riseY = -lifeProgress * 60; // Rise 60px over lifetime
        // Horizontal drift
        const driftX = Math.sin(driftPhase + currentTimeSeconds * 0.5) * 12;

        // Alpha: fade in, hold, fade out
        let alpha: number;
        if (lifeProgress < 0.15) {
            alpha = lifeProgress / 0.15; // Fade in
        } else if (lifeProgress > 0.75) {
            alpha = (1.0 - lifeProgress) / 0.25; // Fade out
        } else {
            alpha = 1.0;
        }
        alpha *= finalIntensity * 0.7;
        if (alpha <= 0.01) continue;

        const px = screenX + spawnOffsetX + driftX;
        const py = screenY + spawnOffsetY + riseY;

        // Interpolate color between primary and accent
        const color = lerpColor(EERIE_PRIMARY, EERIE_ACCENT, colorVariant);

        // Outer glow
        const glowRadius = size * 3;
        const glowGradient = ctx.createRadialGradient(px, py, 0, px, py, glowRadius);
        glowGradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.3})`);
        glowGradient.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.1})`);
        glowGradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(px, py, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Core particle
        const coreGradient = ctx.createRadialGradient(px, py, 0, px, py, size);
        coreGradient.addColorStop(0, `rgba(${EERIE_HIGHLIGHT.r}, ${EERIE_HIGHLIGHT.g}, ${EERIE_HIGHLIGHT.b}, ${alpha * 0.8})`);
        coreGradient.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.5})`);
        coreGradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render all compound eerie lights. Call from GameCanvas during night rendering pass.
 */
export function renderCompoundEerieLights(
    ctx: CanvasRenderingContext2D,
    cycleProgress: number,
    cameraOffsetX: number,
    cameraOffsetY: number,
    viewMinX: number,
    viewMaxX: number,
    viewMinY: number,
    viewMaxY: number,
    nowMs: number
): void {
    if (!isNightTime(cycleProgress)) return;

    const lights = getCompoundEerieLightsWithPositions();
    const buffer = 400; // Viewport cull buffer

    for (const light of lights) {
        // Viewport culling
        if (light.worldX < viewMinX - buffer || light.worldX > viewMaxX + buffer) continue;
        if (light.worldY < viewMinY - buffer || light.worldY > viewMaxY + buffer) continue;

        renderCompoundEerieLight(ctx, light, cycleProgress, cameraOffsetX, cameraOffsetY, nowMs);
    }
}
