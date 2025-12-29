/******************************************************************************
 *                                                                            *
 * Explosive Rendering Utils - Renders placed explosives on the ground        *
 * Shows Babushka's Surprise as a cloth-wrapped bundle and Matriarch's Wrath  *
 * as a larger metal-cased explosive. Includes smoke and explosion effects.   *
 *                                                                            *
 ******************************************************************************/

import { PlacedExplosive } from '../../generated';

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
}

const activeExplosions: ExplosionEffect[] = [];

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
    const explosion = {
        x,
        y,
        startTime: Date.now(), // Use Date.now() to match currentTime from render loop
        duration: tier === 'babushka' ? 1200 : 1600, // Longer duration for more visible effect
        radius: Math.max(radius, 100), // Minimum radius for visibility
        tier
    };
    activeExplosions.push(explosion);
}

// --- Render Explosion Effect (pixel art style) ---
function renderExplosionEffect(
    ctx: CanvasRenderingContext2D,
    explosion: ExplosionEffect,
    currentTime: number
): boolean {
    const elapsed = currentTime - explosion.startTime;
    const progress = elapsed / explosion.duration;
    
    if (progress >= 1) return false; // Explosion finished
    
    ctx.save();
    
    // Use world coordinates - the context is already translated
    const screenX = explosion.x;
    const screenY = explosion.y;
    
    // Phase 1: Initial flash (0-15%)
    // Phase 2: Fireball expansion (15-50%)
    // Phase 3: Smoke and debris (50-100%)
    
    if (progress < 0.15) {  
        // Initial bright flash
        const flashProgress = progress / 0.15;
        const flashRadius = explosion.radius * 0.3 * flashProgress;
        const flashAlpha = 1 - flashProgress * 0.3;
        
        // White hot center
        const flashGradient = ctx.createRadialGradient(
            screenX, screenY, 0,
            screenX, screenY, flashRadius
        );
        flashGradient.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha})`);
        flashGradient.addColorStop(0.3, `rgba(255, 255, 200, ${flashAlpha * 0.8})`);
        flashGradient.addColorStop(0.6, `rgba(255, 200, 50, ${flashAlpha * 0.5})`);
        flashGradient.addColorStop(1, `rgba(255, 100, 0, 0)`);
        
        ctx.fillStyle = flashGradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, flashRadius, 0, Math.PI * 2);
        ctx.fill();
        
    } else if (progress < 0.5) {
        // Fireball expansion phase
        const fireProgress = (progress - 0.15) / 0.35;
        const fireRadius = explosion.radius * (0.3 + fireProgress * 0.7);
        const fireAlpha = 1 - fireProgress * 0.5;
        
        // Draw multiple "pixel art" flame circles
        const numFlames = explosion.tier === 'matriarch' ? 8 : 5;
        for (let i = 0; i < numFlames; i++) {
            const angle = (i / numFlames) * Math.PI * 2 + fireProgress * Math.PI;
            const dist = fireRadius * 0.5 * (0.5 + Math.random() * 0.5);
            const flameX = screenX + Math.cos(angle) * dist;
            const flameY = screenY + Math.sin(angle) * dist;
            const flameSize = 8 + Math.random() * 12;
            
            // Orange/red flame colors (pixel art style - no gradient, solid colors)
            const colors = ['#FF6600', '#FF4400', '#FF8800', '#FFAA00', '#FF2200'];
            ctx.fillStyle = colors[i % colors.length];
            ctx.globalAlpha = fireAlpha * (0.7 + Math.random() * 0.3);
            
            // Draw as pixelated squares
            ctx.fillRect(
                Math.floor(flameX - flameSize / 2),
                Math.floor(flameY - flameSize / 2),
                Math.ceil(flameSize),
                Math.ceil(flameSize)
            );
        }
        
        // Central fireball
        ctx.globalAlpha = fireAlpha;
        const coreGradient = ctx.createRadialGradient(
            screenX, screenY, 0,
            screenX, screenY, fireRadius * 0.6
        );
        coreGradient.addColorStop(0, '#FFFF00');
        coreGradient.addColorStop(0.3, '#FF8800');
        coreGradient.addColorStop(0.6, '#FF4400');
        coreGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(screenX, screenY, fireRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
    } else {
        // Smoke and debris phase
        const smokeProgress = (progress - 0.5) / 0.5;
        const smokeRadius = explosion.radius * (0.8 + smokeProgress * 0.4);
        const smokeAlpha = 0.6 * (1 - smokeProgress);
        
        // Draw smoke puffs (pixel art style)
        const numPuffs = explosion.tier === 'matriarch' ? 12 : 8;
        for (let i = 0; i < numPuffs; i++) {
            const angle = (i / numPuffs) * Math.PI * 2;
            const dist = smokeRadius * (0.3 + smokeProgress * 0.5);
            const puffX = screenX + Math.cos(angle) * dist;
            const puffY = screenY + Math.sin(angle) * dist - smokeProgress * 20; // Rise up
            const puffSize = 10 + Math.random() * 15;
            
            // Gray/black smoke colors
            const grayValue = 40 + Math.floor(Math.random() * 60);
            ctx.fillStyle = `rgb(${grayValue}, ${grayValue}, ${grayValue})`;
            ctx.globalAlpha = smokeAlpha * (0.5 + Math.random() * 0.5);
            
            // Draw as pixelated circles (octagon approximation)
            ctx.beginPath();
            ctx.arc(
                Math.floor(puffX),
                Math.floor(puffY),
                Math.ceil(puffSize / 2),
                0, Math.PI * 2
            );
            ctx.fill();
        }
        
        // Debris particles
        const numDebris = explosion.tier === 'matriarch' ? 10 : 6;
        for (let i = 0; i < numDebris; i++) {
            const angle = (i / numDebris) * Math.PI * 2 + smokeProgress * 0.5;
            const dist = smokeRadius * smokeProgress;
            const debrisX = screenX + Math.cos(angle) * dist;
            const debrisY = screenY + Math.sin(angle) * dist + smokeProgress * 30 * (i % 3 - 1);
            const debrisSize = 3 + Math.random() * 4;
            
            // Brown/orange debris
            ctx.fillStyle = i % 2 === 0 ? '#8B4513' : '#4A3728';
            ctx.globalAlpha = smokeAlpha;
            ctx.fillRect(
                Math.floor(debrisX - debrisSize / 2),
                Math.floor(debrisY - debrisSize / 2),
                Math.ceil(debrisSize),
                Math.ceil(debrisSize)
            );
        }
    }
    
    ctx.globalAlpha = 1;
    ctx.restore();
    return true; // Still rendering
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
