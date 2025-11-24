import { Fumarole } from '../../generated'; // Import generated type
import fumaroleImage from '../../assets/doodads/fumarole.png'; // Fumarole sprite
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer'; // Import generic renderer
import { imageManager } from './imageManager'; // Import image manager

// --- Constants ---
export const FUMAROLE_WIDTH = 96; // Size for geothermal vent
export const FUMAROLE_HEIGHT = 96;
export const PLAYER_FUMAROLE_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0; // Fumarole interaction distance for broth pot placement

// --- Steam Particle System ---
interface SteamParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
    life: number; // 0 to 1, where 1 is just spawned and 0 is dead
    maxLife: number;
}

// Store particles per fumarole
const fumaroleSteamParticles = new Map<string, SteamParticle[]>();
const fumaroleLastBurstTime = new Map<string, number>();
const fumaroleLastFrameTime = new Map<string, number>();
const fumaroleBurstInterval = new Map<string, number>(); // Randomized burst interval per fumarole

// Steam particle constants
const STEAM_BURST_INTERVAL_MIN = 2500; // Minimum time between bursts (2.5 seconds)
const STEAM_BURST_INTERVAL_MAX = 4000; // Maximum time between bursts (4 seconds)
const STEAM_PARTICLES_PER_BURST = 8; // Number of particles per burst
const STEAM_PARTICLE_LIFETIME = 2000; // 2 seconds lifetime
const STEAM_PARTICLE_MIN_SIZE = 8;
const STEAM_PARTICLE_MAX_SIZE = 24;
const STEAM_RISE_SPEED_MIN = -40; // Pixels per second (negative = upward)
const STEAM_RISE_SPEED_MAX = -80;
const STEAM_HORIZONTAL_DRIFT = 20; // Max horizontal drift pixels per second

// --- Define Configuration ---
const fumaroleConfig: GroundEntityConfig<Fumarole> = {
    getImageSource: (_entity) => {
        // Fumaroles always use the same sprite
        return fumaroleImage;
    },

    getTargetDimensions: (img, _entity) => ({
        width: FUMAROLE_WIDTH,
        height: FUMAROLE_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight / 2, // Center the sprite on the position
    }),

    getShadowParams: undefined, // No shadow for fumaroles (they're ground-level vents)

    drawCustomGroundShadow: undefined, // No custom shadow needed

    applyEffects: undefined, // No effects for fumaroles

    drawOverlay: undefined, // No overlay for fumaroles

    fallbackColor: '#8B4513', // Brown fallback color
};

/**
 * Updates steam particles for a fumarole
 */
function updateSteamParticles(fumaroleId: string, fumaroleX: number, fumaroleY: number, nowMs: number, deltaTime: number): void {
    // Get or create particle array for this fumarole
    if (!fumaroleSteamParticles.has(fumaroleId)) {
        fumaroleSteamParticles.set(fumaroleId, []);
        // Initialize with a random burst interval for this fumarole
        const randomInterval = STEAM_BURST_INTERVAL_MIN + Math.random() * (STEAM_BURST_INTERVAL_MAX - STEAM_BURST_INTERVAL_MIN);
        fumaroleBurstInterval.set(fumaroleId, randomInterval);
        // Start with a random offset so fumaroles don't all burst at the same time
        fumaroleLastBurstTime.set(fumaroleId, nowMs - Math.random() * randomInterval);
    }
    
    const particles = fumaroleSteamParticles.get(fumaroleId)!;
    const lastBurstTime = fumaroleLastBurstTime.get(fumaroleId) || 0;
    const burstInterval = fumaroleBurstInterval.get(fumaroleId) || STEAM_BURST_INTERVAL_MIN;
    
    // Check if it's time for a new burst
    if (nowMs - lastBurstTime >= burstInterval) {
        // Spawn new particles
        for (let i = 0; i < STEAM_PARTICLES_PER_BURST; i++) {
            const angle = (Math.random() * Math.PI / 3) - Math.PI / 6; // -30° to +30° spread
            const speed = STEAM_RISE_SPEED_MIN + Math.random() * (STEAM_RISE_SPEED_MAX - STEAM_RISE_SPEED_MIN);
            const horizontalDrift = (Math.random() - 0.5) * STEAM_HORIZONTAL_DRIFT;
            
            particles.push({
                x: fumaroleX + (Math.random() - 0.5) * 20, // Spawn near center with slight spread
                y: fumaroleY,
                vx: horizontalDrift,
                vy: speed,
                size: STEAM_PARTICLE_MIN_SIZE + Math.random() * (STEAM_PARTICLE_MAX_SIZE - STEAM_PARTICLE_MIN_SIZE),
                opacity: 0.6 + Math.random() * 0.4, // 0.6 to 1.0
                life: 1.0,
                maxLife: STEAM_PARTICLE_LIFETIME,
            });
        }
        fumaroleLastBurstTime.set(fumaroleId, nowMs);
        
        // Randomize the next burst interval for natural variation
        const nextInterval = STEAM_BURST_INTERVAL_MIN + Math.random() * (STEAM_BURST_INTERVAL_MAX - STEAM_BURST_INTERVAL_MIN);
        fumaroleBurstInterval.set(fumaroleId, nextInterval);
    }
    
    // Update existing particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        
        // Update position
        p.x += (p.vx * deltaTime) / 1000;
        p.y += (p.vy * deltaTime) / 1000;
        
        // Update life
        p.life -= deltaTime / p.maxLife;
        
        // Remove dead particles
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

/**
 * Renders steam particles for a fumarole
 */
function renderSteamParticles(ctx: CanvasRenderingContext2D, fumaroleId: string): void {
    const particles = fumaroleSteamParticles.get(fumaroleId);
    if (!particles || particles.length === 0) return;
    
    ctx.save();
    
    for (const p of particles) {
        // Fade out as particle ages
        const fadeOpacity = p.opacity * p.life;
        
        // Draw particle as a soft circle (steam puff)
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${fadeOpacity * 0.8})`);
        gradient.addColorStop(0.5, `rgba(220, 220, 220, ${fadeOpacity * 0.4})`);
        gradient.addColorStop(1, `rgba(200, 200, 200, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

/**
 * Renders a fumarole entity (geothermal vent in quarry areas).
 * Fumaroles provide warmth protection and emit steam particles.
 */
export function renderFumarole(
    ctx: CanvasRenderingContext2D,
    fumarole: Fumarole,
    nowMs: number,
    cycleProgress: number
): void {
    const fumaroleId = fumarole.id.toString();
    
    // Calculate deltaTime from last frame
    const lastFrameTime = fumaroleLastFrameTime.get(fumaroleId) || nowMs;
    const deltaTime = nowMs - lastFrameTime;
    fumaroleLastFrameTime.set(fumaroleId, nowMs);
    
    // Cap deltaTime to prevent huge jumps (e.g., when tab is inactive)
    const cappedDeltaTime = Math.min(deltaTime, 100); // Max 100ms per frame
    
    // Update steam particles
    updateSteamParticles(fumaroleId, fumarole.posX, fumarole.posY, nowMs, cappedDeltaTime);
    
    // Render the fumarole base sprite
    renderConfiguredGroundEntity({
        ctx,
        entity: fumarole,
        config: fumaroleConfig,
        nowMs,
        entityPosX: fumarole.posX,
        entityPosY: fumarole.posY,
        cycleProgress,
    });
    
    // Render steam particles on top
    renderSteamParticles(ctx, fumaroleId);
}

/**
 * Pre-loads fumarole images into the image manager cache.
 */
export function preloadFumaroleImages(): void {
    // Preloading is handled automatically by imageManager when images are first used
    // This function exists for consistency with other rendering utils
}

