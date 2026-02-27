/******************************************************************************
 *                                                                            *
 * Explosive Rendering Utils - Renders placed explosives on the ground        *
 * Shows Babushka's Surprise as a cloth-wrapped bundle and Matriarch's Wrath  *
 * as a larger metal-cased explosive. Includes smoke and explosion effects.   *
 *                                                                            *
 ******************************************************************************/

import { PlacedExplosive } from '../../generated/types';

// Import doodad images directly
import babushkaSurpriseImg from '../../assets/doodads/babushka_surprise.png';
import matriarchWrathImg from '../../assets/doodads/matriarch_wrath.png';

// --- Constants ---

export const EXPLOSIVE_BABUSHKA_SIZE = 48; // Babushka's Surprise visual size
export const EXPLOSIVE_MATRIARCH_SIZE = 64; // Matriarch's Wrath visual size

// Image caches
let babushkaSurpriseImage: HTMLImageElement | null = null;
let matriarchWrathImage: HTMLImageElement | null = null;
let imagesLoaded = false;

// --- Explosion Effect State ---
// Track active explosions for rendering
interface ExplosionEffect {
    x: number;
    y: number;
    startTime: number;
    duration: number; // milliseconds
    radius: number;
    tier: 'babushka' | 'matriarch';
    // Pre-computed random values for consistent debris/smoke
    debrisAngles: number[];
    debrisSpeeds: number[];
    debrisColors: string[];
    smokeAngles: number[];
    smokeSizes: number[];
}

const activeExplosions: ExplosionEffect[] = [];

// Pre-generate random values for explosion particles
function generateExplosionParticles(tier: 'babushka' | 'matriarch'): Pick<ExplosionEffect, 'debrisAngles' | 'debrisSpeeds' | 'debrisColors' | 'smokeAngles' | 'smokeSizes'> {
    const numDebris = tier === 'matriarch' ? 24 : 16;
    const numSmoke = tier === 'matriarch' ? 20 : 14;
    
    const debrisColors = ['#8B4513', '#4A3728', '#5C4033', '#3D2B1F', '#6B4423', '#A0522D', '#CD853F'];
    
    return {
        debrisAngles: Array.from({ length: numDebris }, () => Math.random() * Math.PI * 2),
        debrisSpeeds: Array.from({ length: numDebris }, () => 0.5 + Math.random() * 1.5),
        debrisColors: Array.from({ length: numDebris }, () => debrisColors[Math.floor(Math.random() * debrisColors.length)]),
        smokeAngles: Array.from({ length: numSmoke }, () => Math.random() * Math.PI * 2),
        smokeSizes: Array.from({ length: numSmoke }, () => 12 + Math.random() * 20),
    };
}

// --- Preload Images ---

export function preloadExplosiveImages(): void {
    if (imagesLoaded) return;
    
    babushkaSurpriseImage = new Image();
    babushkaSurpriseImage.src = babushkaSurpriseImg;
    
    matriarchWrathImage = new Image();
    matriarchWrathImage.src = matriarchWrathImg;
    
    imagesLoaded = true;
}

// --- Trigger Explosion Effect ---
export function triggerExplosionEffect(
    x: number,
    y: number,
    radius: number,
    tier: 'babushka' | 'matriarch'
): void {
    // Make visual explosion MUCH larger than damage radius for dramatic effect
    // Babushka: 150px damage -> 220px visual, Matriarch: 200px damage -> 320px visual
    const visualRadius = tier === 'matriarch' 
        ? Math.max(radius * 1.6, 280)  // Matriarch is BIG
        : Math.max(radius * 1.4, 180); // Babushka is still impressive
    
    const particles = generateExplosionParticles(tier);
    
    const explosion: ExplosionEffect = {
        x,
        y,
        startTime: Date.now(),
        // Faster, more intense animations
        duration: tier === 'babushka' ? 800 : 1100, // Faster = more intense
        radius: visualRadius,
        tier,
        ...particles
    };
    activeExplosions.push(explosion);
}

// --- Render Explosion Effect (INTENSE pixel art style) ---
function renderExplosionEffect(
    ctx: CanvasRenderingContext2D,
    explosion: ExplosionEffect,
    currentTime: number
): boolean {
    const elapsed = currentTime - explosion.startTime;
    const progress = elapsed / explosion.duration;
    
    if (progress >= 1) return false; // Explosion finished
    
    ctx.save();
    
    const screenX = explosion.x;
    const screenY = explosion.y;
    const isMatriarch = explosion.tier === 'matriarch';
    
    // Use easing for more dramatic expansion
    const easeOutQuad = (t: number) => t * (2 - t);
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    
    // === PHASE 1: INITIAL FLASH (0-10%) - Super bright, fast ===
    if (progress < 0.10) {
        const flashProgress = easeOutQuad(progress / 0.10);
        const flashRadius = explosion.radius * 0.5 * flashProgress;
        
        // Blinding white flash
        ctx.globalAlpha = 1 - flashProgress * 0.3;
        const flashGradient = ctx.createRadialGradient(
            screenX, screenY, 0,
            screenX, screenY, flashRadius
        );
        flashGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        flashGradient.addColorStop(0.2, 'rgba(255, 255, 200, 0.95)');
        flashGradient.addColorStop(0.4, 'rgba(255, 220, 100, 0.8)');
        flashGradient.addColorStop(0.7, 'rgba(255, 150, 0, 0.5)');
        flashGradient.addColorStop(1, 'rgba(255, 50, 0, 0)');
        
        ctx.fillStyle = flashGradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, flashRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Secondary shockwave ring
        ctx.strokeStyle = 'rgba(255, 200, 50, 0.8)';
        ctx.lineWidth = 4 + flashProgress * 8;
        ctx.beginPath();
        ctx.arc(screenX, screenY, flashRadius * 0.8, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // === PHASE 2: FIREBALL EXPANSION (10-45%) - Multiple waves of fire ===
    if (progress >= 0.05 && progress < 0.45) {
        const fireProgress = easeOutCubic((progress - 0.05) / 0.40);
        const fireRadius = explosion.radius * (0.2 + fireProgress * 0.8);
        const fireAlpha = 1 - fireProgress * 0.6;
        
        // Inner white-hot core
        ctx.globalAlpha = fireAlpha;
        const coreRadius = fireRadius * 0.4 * (1 - fireProgress * 0.5);
        const coreGradient = ctx.createRadialGradient(
            screenX, screenY, 0,
            screenX, screenY, coreRadius
        );
        coreGradient.addColorStop(0, '#FFFFFF');
        coreGradient.addColorStop(0.3, '#FFFFAA');
        coreGradient.addColorStop(0.6, '#FFAA00');
        coreGradient.addColorStop(1, 'rgba(255, 100, 0, 0)');
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, coreRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Multiple flame bursts - LOTS of them
        const numFlames = isMatriarch ? 18 : 12;
        for (let i = 0; i < numFlames; i++) {
            const baseAngle = (i / numFlames) * Math.PI * 2;
            const wobble = Math.sin(fireProgress * 6 + i) * 0.3;
            const angle = baseAngle + wobble;
            const dist = fireRadius * (0.3 + fireProgress * 0.6);
            const flameX = screenX + Math.cos(angle) * dist;
            const flameY = screenY + Math.sin(angle) * dist;
            const flameSize = (isMatriarch ? 16 : 12) + fireProgress * 8;
            
            // Intense flame colors
            const colors = ['#FFFF00', '#FFCC00', '#FF9900', '#FF6600', '#FF3300', '#FF0000'];
            ctx.fillStyle = colors[i % colors.length];
            ctx.globalAlpha = fireAlpha * 0.9;
            
            // Draw flame as rotated diamond
            ctx.save();
            ctx.translate(flameX, flameY);
            ctx.rotate(angle + Math.PI / 4);
            ctx.fillRect(-flameSize / 2, -flameSize / 2, flameSize, flameSize);
            ctx.restore();
        }
        
        // Expanding fire ring (shockwave effect)
        ctx.globalAlpha = fireAlpha * 0.7;
        ctx.strokeStyle = '#FF6600';
        ctx.lineWidth = 6 - fireProgress * 4;
        ctx.beginPath();
        ctx.arc(screenX, screenY, fireRadius * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        
        // Second shockwave (delayed)
        if (fireProgress > 0.3) {
            const wave2Progress = (fireProgress - 0.3) / 0.7;
            ctx.globalAlpha = (1 - wave2Progress) * 0.5;
            ctx.strokeStyle = '#FF4400';
            ctx.lineWidth = 4 - wave2Progress * 3;
            ctx.beginPath();
            ctx.arc(screenX, screenY, fireRadius * wave2Progress * 1.2, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    
    // === PHASE 3: SMOKE & DEBRIS (30-100%) - Overlaps with fire ===
    if (progress >= 0.30) {
        const smokeProgress = easeOutQuad((progress - 0.30) / 0.70);
        const smokeRadius = explosion.radius * (0.5 + smokeProgress * 0.6);
        const smokeAlpha = 0.8 * (1 - smokeProgress * 0.9);
        
        // Billowing smoke clouds - use pre-computed values
        const numPuffs = explosion.smokeAngles.length;
        for (let i = 0; i < numPuffs; i++) {
            const baseAngle = explosion.smokeAngles[i];
            const angle = baseAngle + smokeProgress * 0.5;
            const dist = smokeRadius * (0.2 + smokeProgress * 0.7);
            const riseOffset = smokeProgress * (30 + i * 3); // Smoke rises
            const puffX = screenX + Math.cos(angle) * dist;
            const puffY = screenY + Math.sin(angle) * dist - riseOffset;
            const puffSize = explosion.smokeSizes[i] * (0.8 + smokeProgress * 0.4);
            
            // Dark smoke with orange glow in early stages
            const glowFade = Math.max(0, 1 - smokeProgress * 2);
            const grayValue = 30 + smokeProgress * 40;
            const r = Math.floor(grayValue + 60 * glowFade);
            const g = Math.floor(grayValue + 20 * glowFade);
            const b = Math.floor(grayValue);
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.globalAlpha = smokeAlpha * (0.6 + (1 - i / numPuffs) * 0.4);
            
            ctx.beginPath();
            ctx.arc(puffX, puffY, puffSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Flying debris - use pre-computed values
        const numDebris = explosion.debrisAngles.length;
        for (let i = 0; i < numDebris; i++) {
            const angle = explosion.debrisAngles[i];
            const speed = explosion.debrisSpeeds[i];
            const dist = smokeRadius * smokeProgress * speed;
            
            // Parabolic arc for debris
            const gravity = smokeProgress * smokeProgress * 80;
            const debrisX = screenX + Math.cos(angle) * dist;
            const debrisY = screenY + Math.sin(angle) * dist * 0.6 + gravity;
            
            // Debris gets smaller as it flies
            const debrisSize = (isMatriarch ? 6 : 4) * (1 - smokeProgress * 0.5);
            
            ctx.fillStyle = explosion.debrisColors[i];
            ctx.globalAlpha = smokeAlpha * 1.2;
            
            // Rotating debris squares
            ctx.save();
            ctx.translate(debrisX, debrisY);
            ctx.rotate(smokeProgress * 8 + i);
            ctx.fillRect(-debrisSize / 2, -debrisSize / 2, debrisSize, debrisSize);
            ctx.restore();
        }
        
        // Ember sparks (late phase)
        if (smokeProgress > 0.3 && smokeProgress < 0.9) {
            const emberProgress = (smokeProgress - 0.3) / 0.6;
            const numEmbers = isMatriarch ? 12 : 8;
            for (let i = 0; i < numEmbers; i++) {
                const angle = (i / numEmbers) * Math.PI * 2 + emberProgress * 2;
                const dist = smokeRadius * 0.3 * (1 + emberProgress);
                const emberX = screenX + Math.cos(angle) * dist;
                const emberY = screenY + Math.sin(angle) * dist - emberProgress * 50;
                
                ctx.fillStyle = i % 2 === 0 ? '#FF6600' : '#FFAA00';
                ctx.globalAlpha = (1 - emberProgress) * 0.8;
                ctx.beginPath();
                ctx.arc(emberX, emberY, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    
    ctx.globalAlpha = 1;
    ctx.restore();
    return true;
}

// --- Render Fuse Smoke ---
function renderFuseSmoke(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    fuseProgress: number,
    currentTime: number,
    size: number
): void {
    // More smoke as fuse progresses
    const smokeIntensity = 0.3 + fuseProgress * 0.7;
    const numPuffs = Math.floor(3 + fuseProgress * 5);
    
    ctx.save();
    
    for (let i = 0; i < numPuffs; i++) {
        // Animated smoke rising from fuse
        const time = currentTime * 0.002 + i * 0.5;
        const offsetX = Math.sin(time + i) * 8;
        const offsetY = -10 - (i * 6) - Math.abs(Math.sin(time * 0.5)) * 10;
        
        const puffX = x + offsetX;
        const puffY = y + offsetY;
        const puffSize = 4 + i * 2;
        
        // Gray smoke that gets darker as fuse burns
        const grayBase = 100 - fuseProgress * 50;
        const grayValue = Math.floor(grayBase + Math.random() * 30);
        
        ctx.fillStyle = `rgb(${grayValue}, ${grayValue}, ${grayValue})`;
        ctx.globalAlpha = smokeIntensity * (0.3 + (1 - i / numPuffs) * 0.4);
        
        ctx.beginPath();
        ctx.arc(puffX, puffY, puffSize, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Fuse spark
    if (fuseProgress < 1) {
        const sparkle = Math.sin(currentTime * 0.02) > 0;
        if (sparkle) {
            ctx.fillStyle = '#FFFF00';
            ctx.globalAlpha = 0.8 + Math.random() * 0.2;
            
            // Spark at top of explosive
            const sparkX = x + size * 0.15;
            const sparkY = y - size * 0.35;
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, 2 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Orange glow around spark
            ctx.fillStyle = '#FF8800';
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, 4 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    ctx.globalAlpha = 1;
    ctx.restore();
}

// --- Explosive Rendering ---

/**
 * Renders a single placed explosive with fuse animation
 */
export function renderPlacedExplosive(
    ctx: CanvasRenderingContext2D,
    explosive: PlacedExplosive,
    cameraX: number,
    cameraY: number,
    currentTime: number
): void {
    // Since the context is already translated by cameraOffset, we render directly in world coordinates
    const screenX = explosive.posX;
    const screenY = explosive.posY;
    
    const isBabushka = explosive.explosiveType.tag === 'BabushkaSurprise';
    const size = isBabushka ? EXPLOSIVE_BABUSHKA_SIZE : EXPLOSIVE_MATRIARCH_SIZE;
    const image = isBabushka ? babushkaSurpriseImage : matriarchWrathImage;
    
    ctx.save();
    
    // Calculate fuse animation - pulsing glow
    let fuseProgress = 0;
    if (explosive.armedAt) {
        // Convert SpacetimeDB timestamp (microseconds since Unix epoch) to milliseconds
        const armedTime = Number(explosive.armedAt.microsSinceUnixEpoch / 1000n);
        const elapsedSecs = (currentTime - armedTime) / 1000;
        fuseProgress = Math.min(elapsedSecs / explosive.fuseDurationSecs, 1.0);
    }
    
    // Danger pulse - gets faster as detonation approaches
    const pulseSpeed = 3 + fuseProgress * 10; // Starts slow, gets very fast near detonation
    const pulse = 0.5 + Math.sin(currentTime * 0.001 * pulseSpeed) * 0.5;
    const dangerIntensity = fuseProgress * pulse;
    
    // Draw warning glow underneath
    if (explosive.armedAt && !explosive.isDud) {
        const glowRadius = size * 1.2 * (1 + dangerIntensity * 0.3);
        const dangerGradient = ctx.createRadialGradient(
            screenX, screenY, 0,
            screenX, screenY, glowRadius
        );
        
        // Yellow to red glow based on fuse progress
        const red = Math.floor(255);
        const green = Math.floor(255 * (1 - fuseProgress));
        dangerGradient.addColorStop(0, `rgba(${red}, ${green}, 0, ${0.3 + dangerIntensity * 0.3})`);
        dangerGradient.addColorStop(0.5, `rgba(${red}, ${Math.floor(green * 0.5)}, 0, ${0.15 + dangerIntensity * 0.15})`);
        dangerGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        
        ctx.fillStyle = dangerGradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, glowRadius, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    // Draw the explosive doodad image
    if (image && image.complete && image.naturalWidth > 0) {
        // Apply slight shake as fuse nears end
        const shakeIntensity = fuseProgress > 0.7 ? (fuseProgress - 0.7) * 10 : 0;
        const shakeX = (Math.random() - 0.5) * shakeIntensity * 4;
        const shakeY = (Math.random() - 0.5) * shakeIntensity * 4;
        
        ctx.drawImage(
            image,
            screenX - size / 2 + shakeX,
            screenY - size / 2 + shakeY,
            size,
            size
        );
    } else {
        // Fallback - draw a colored rectangle
        ctx.fillStyle = isBabushka ? '#8B4513' : '#4A4A4A'; // Brown for Babushka, Gray for Matriarch
        ctx.fillRect(screenX - size / 2, screenY - size / 2, size, size);
        
        // Draw "fuse" line on top
        if (!explosive.isDud) {
            ctx.strokeStyle = `rgb(255, ${Math.floor(255 * (1 - fuseProgress))}, 0)`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(screenX, screenY - size / 4);
            ctx.lineTo(screenX + size / 4, screenY - size / 2);
            ctx.stroke();
        }
    }
    
    // Draw fuse smoke if armed and not a dud
    if (explosive.armedAt && !explosive.isDud) {
        renderFuseSmoke(ctx, screenX, screenY, fuseProgress, currentTime, size);
    }
    
    // Draw "DUD" text if it's a dud
    if (explosive.isDud) {
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText('DUD', screenX, screenY + size / 2 + 12);
        
        // Draw text
        ctx.fillStyle = '#FF6600';
        ctx.fillText('DUD', screenX, screenY + size / 2 + 12);
    }
    
    ctx.restore();
}

/**
 * Renders all placed explosives and explosion effects in the view
 */
export function renderPlacedExplosives(
    ctx: CanvasRenderingContext2D,
    placedExplosives: Map<string, PlacedExplosive>,
    cameraX: number,
    cameraY: number,
    canvasWidth: number,
    canvasHeight: number,
    currentTime: number
): void {
    // Preload images if not already done
    if (!imagesLoaded) {
        preloadExplosiveImages();
    }
    
    // Render each placed explosive in view
    // Note: Explosives are deleted from the table when they detonate, so no need to check isDetonated
    placedExplosives.forEach((explosive) => {
        // Simple viewport culling
        const padding = EXPLOSIVE_MATRIARCH_SIZE * 2; // Extra padding for glow
        const screenX = explosive.posX - cameraX;
        const screenY = explosive.posY - cameraY;
        
        if (screenX < -padding || screenX > canvasWidth + padding ||
            screenY < -padding || screenY > canvasHeight + padding) {
            return; // Skip if outside visible area
        }
        
        renderPlacedExplosive(ctx, explosive, cameraX, cameraY, currentTime);
    });
    
    // Render active explosion effects
    for (let i = activeExplosions.length - 1; i >= 0; i--) {
        const explosion = activeExplosions[i];
        
        // Simple viewport culling for explosions
        const screenX = explosion.x - cameraX;
        const screenY = explosion.y - cameraY;
        const padding = explosion.radius * 2;
        
        if (screenX >= -padding && screenX <= canvasWidth + padding &&
            screenY >= -padding && screenY <= canvasHeight + padding) {
            const stillActive = renderExplosionEffect(ctx, explosion, currentTime);
            if (!stillActive) {
                activeExplosions.splice(i, 1);
            }
        } else {
            // Remove if too far off screen and expired
            if (currentTime - explosion.startTime > explosion.duration) {
                activeExplosions.splice(i, 1);
            }
        }
    }
}

// Export for external triggering (e.g., when server sends detonation event)
export { activeExplosions };
