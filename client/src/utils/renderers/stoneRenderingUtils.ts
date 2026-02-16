import { Stone } from '../../generated'; // Import generated Stone type
import stoneImage from '../../assets/doodads/stone_d.png'; // Direct import
import metalImage from '../../assets/doodads/metal.png'; // Metal ore node image
import sulfurImage from '../../assets/doodads/sulfur.png'; // Sulfur ore node image
import memoryImage from '../../assets/doodads/memory.png'; // Memory ore node image
import { drawDynamicGroundShadow } from './shadowUtils'; // Import shadow utils
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';

// Configuration constants
const TARGET_STONE_WIDTH_PX = 120; // Target width on screen
const SHAKE_DURATION_MS = 300;     // How long the shake effect lasts
const SHAKE_INTENSITY_PX = 2;     // Slightly toned down from 10 for subtler shaking
const VERTEX_SHAKE_SEGMENTS = 6; // Number of vertical segments for vertex-based shaking (fewer than trees since stones are shorter)

// --- Client-side animation tracking for stone shakes ---
const clientStoneShakeStartTimes = new Map<string, number>(); // stoneId -> client timestamp when shake started
const lastKnownServerStoneShakeTimes = new Map<string, number>(); // stoneId -> last known server timestamp

type StoneOreType = 'stone' | 'metal' | 'sulfur' | 'memory';

function normalizeOreType(oreType: string | undefined): StoneOreType {
  const s = (oreType ?? 'stone').toLowerCase();
  if (s === 'metal' || s === 'sulfur' || s === 'memory') return s;
  return 'stone';
}

/** Trigger stone shake immediately (optimistic feedback) when player initiates a hit. */
export function triggerStoneShakeOptimistic(stoneId: string, posX: number, posY: number, oreType?: string): void {
  const now = Date.now();
  clientStoneShakeStartTimes.set(stoneId, now);
  lastKnownServerStoneShakeTimes.set(stoneId, now);
  triggerStoneHitEffect(stoneId, posX, posY, normalizeOreType(oreType));
}

// ============================================================================
// STONE DESTRUCTION DEBRIS SYSTEM - AAA Pixel Art Quality
// ============================================================================

// Stone debris particle interface
interface StoneDebrisParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    rotation: number;
    rotationSpeed: number;
    type: 'rock_chunk' | 'rock_shard' | 'dust' | 'spark';
    color: string;
    alpha: number;
    gravity: number;
    bounceCount: number;
    maxBounces: number;
}

// Dust cloud particle for stone
interface StoneDustParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
    expandRate: number;
    color: string;
}

// Stone destruction effect state
interface StoneDestructionEffect {
    stoneId: string;
    startTime: number;
    x: number;
    y: number;
    duration: number;
    debris: StoneDebrisParticle[];
    dust: StoneDustParticle[];
    oreType: 'stone' | 'metal' | 'sulfur' | 'memory';
}

// Track active stone destruction effects
const activeStoneDestructions = new Map<string, StoneDestructionEffect>();

// Track previous stone states to detect destruction
const previousStoneHealthStates = new Map<string, boolean>(); // stoneId -> wasHealthy

/**
 * Check if a stone has an active destruction effect (for entity filtering)
 * This allows destroyed stones to remain visible while their debris effect plays
 */
export function hasActiveStoneDestruction(stoneId: string): boolean {
    return activeStoneDestructions.has(stoneId);
}

/**
 * Get active stone destruction IDs (for debugging)
 */
export function getActiveStoneDestructionCount(): number {
    return activeStoneDestructions.size;
}

// Destruction effect constants
const STONE_DESTRUCTION_DURATION_MS = 1200;
const NUM_STONE_DEBRIS_PARTICLES = 16;
const NUM_STONE_DUST_PARTICLES = 10;

// ============================================================================
// STONE HIT IMPACT PARTICLES - Smaller chips on each hit
// ============================================================================

interface StoneHitParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    rotation: number;
    rotationSpeed: number;
    color: string;
    alpha: number;
    gravity: number;
}

interface StoneHitEffect {
    stoneId: string;
    startTime: number;
    x: number;
    y: number;
    duration: number;
    particles: StoneHitParticle[];
}

// Track active hit effects
const activeStoneHitEffects = new Map<string, StoneHitEffect>();

// Hit effect constants (smaller/quicker than destruction)
const STONE_HIT_DURATION_MS = 500;
const NUM_STONE_HIT_PARTICLES = 8;

// Base gray colors that always appear on stone hits
const STONE_GRAY_COLORS = ['#6b6b6b', '#7a7a7a', '#5c5c5c', '#888888', '#4d4d4d'];

/**
 * Generate hit impact particles for stone
 */
function generateStoneHitParticles(x: number, y: number, oreType: 'stone' | 'metal' | 'sulfur' | 'memory'): StoneHitParticle[] {
    const particles: StoneHitParticle[] = [];
    const oreColors = STONE_COLORS[oreType];
    
    for (let i = 0; i < NUM_STONE_HIT_PARTICLES; i++) {
        // Upward spray with some horizontal spread
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9; // Mostly upward
        const speed = 3 + Math.random() * 4;
        
        // Mix of chunks and sparks - 70% chunks, 30% sparks
        const isSpark = Math.random() < 0.25;
        
        // Always include some gray chunks, mix in ore color
        // First half particles are gray, second half are ore-colored
        const useGrayColor = i < NUM_STONE_HIT_PARTICLES / 2;
        let color: string;
        
        if (isSpark) {
            color = oreColors.sparks[Math.floor(Math.random() * oreColors.sparks.length)];
        } else if (useGrayColor) {
            color = STONE_GRAY_COLORS[Math.floor(Math.random() * STONE_GRAY_COLORS.length)];
        } else {
            color = oreColors.chunks[Math.floor(Math.random() * oreColors.chunks.length)];
        }
        
        particles.push({
            x: x + (Math.random() - 0.5) * 24,
            y: y - 25 - Math.random() * 25, // Start near impact point
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 3, // Stronger upward boost
            size: isSpark ? (2 + Math.random() * 2) : (4 + Math.random() * 5), // LARGER chunks (4-9px)
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.6,
            color,
            alpha: 0.95,
            gravity: isSpark ? 0.18 : 0.28,
        });
    }
    
    return particles;
}

/**
 * Trigger hit impact effect for stone
 */
export function triggerStoneHitEffect(stoneId: string, x: number, y: number, oreType: 'stone' | 'metal' | 'sulfur' | 'memory'): void {
    // Allow multiple hit effects by using unique keys
    const effectKey = `${stoneId}_${Date.now()}`;
    
    const effect: StoneHitEffect = {
        stoneId,
        startTime: Date.now(),
        x,
        y,
        duration: STONE_HIT_DURATION_MS,
        particles: generateStoneHitParticles(x, y, oreType),
    };
    
    activeStoneHitEffects.set(effectKey, effect);
}

// Pre-computed constant
const TWO_PI = Math.PI * 2;

// Pre-allocated arrays for effect removal (avoid allocation each frame)
const stoneHitEffectsToRemove: string[] = [];

/**
 * Render stone hit impact effects
 * OPTIMIZED: Traditional loops, pre-allocated removal array
 */
export function renderStoneHitEffects(ctx: CanvasRenderingContext2D, nowMs: number): void {
    if (activeStoneHitEffects.size === 0) return;
    
    stoneHitEffectsToRemove.length = 0;
    
    activeStoneHitEffects.forEach((effect, effectKey) => {
        const elapsed = nowMs - effect.startTime;
        const progress = elapsed / effect.duration;
        
        if (progress >= 1) {
            stoneHitEffectsToRemove.push(effectKey);
            return;
        }
        
        // Pre-compute fade multiplier
        const fadeStart = 0.5;
        const fadeMultiplier = progress > fadeStart 
            ? (1 - (progress - fadeStart) / (1 - fadeStart))
            : 1.0;
        
        const particles = effect.particles;
        const particleCount = particles.length;
        
        for (let i = 0; i < particleCount; i++) {
            const particle = particles[i];
            
            // Update physics
            particle.vy += particle.gravity;
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.rotation += particle.rotationSpeed;
            particle.vx *= 0.98;
            
            const particleAlpha = particle.alpha * fadeMultiplier;
            if (particleAlpha < 0.01) continue;
            
            ctx.save();
            ctx.translate(particle.x, particle.y);
            ctx.rotate(particle.rotation);
            ctx.globalAlpha = particleAlpha;
            ctx.fillStyle = particle.color;
            
            const size = particle.size;
            
            if (size > 2) {
                // Rock chip - irregular polygon
                const halfSize = size * 0.5;
                const thirdSize = size / 3;
                const quarterSize = size * 0.25;
                ctx.beginPath();
                ctx.moveTo(-halfSize, 0);
                ctx.lineTo(0, -halfSize);
                ctx.lineTo(halfSize, -quarterSize);
                ctx.lineTo(thirdSize, halfSize);
                ctx.lineTo(-thirdSize, thirdSize);
                ctx.closePath();
                ctx.fill();
            } else {
                // Spark - small circle
                ctx.beginPath();
                ctx.arc(0, 0, size, 0, TWO_PI);
                ctx.fill();
            }
            
            ctx.restore();
        }
    });
    
    for (let i = 0; i < stoneHitEffectsToRemove.length; i++) {
        activeStoneHitEffects.delete(stoneHitEffectsToRemove[i]);
    }
}

// Color palettes for different ore types (AAA pixel art style)
const STONE_COLORS = {
    stone: {
        chunks: ['#6B6B6B', '#808080', '#5A5A5A', '#7A7A7A', '#4D4D4D'],
        dust: ['rgba(100, 100, 100, 0.6)', 'rgba(80, 80, 80, 0.5)', 'rgba(120, 120, 120, 0.4)'],
        sparks: ['#FFFFFF', '#E0E0E0', '#C0C0C0'],
    },
    metal: {
        chunks: ['#8B7355', '#A08060', '#6B5344', '#9A8A6A', '#5C4433'],
        dust: ['rgba(139, 115, 85, 0.6)', 'rgba(100, 80, 60, 0.5)', 'rgba(160, 128, 96, 0.4)'],
        sparks: ['#FFD700', '#FFA500', '#FFFF00'],
    },
    sulfur: {
        chunks: ['#B5A642', '#D4C55A', '#8B8B00', '#C0B030', '#9A9A00'],
        dust: ['rgba(181, 166, 66, 0.6)', 'rgba(140, 130, 50, 0.5)', 'rgba(200, 180, 80, 0.4)'],
        sparks: ['#FFFF00', '#FFEE00', '#FFDD00'],
    },
    memory: {
        chunks: ['#4A6B8A', '#5A7B9A', '#3A5B7A', '#6A8BAA', '#2A4B6A'],
        dust: ['rgba(74, 107, 138, 0.6)', 'rgba(60, 90, 120, 0.5)', 'rgba(90, 120, 150, 0.4)'],
        sparks: ['#00FFFF', '#00E0FF', '#00C0FF'],
    },
};

/**
 * Get ore type from stone entity
 */
export function getStoneOreType(stone: Stone): 'stone' | 'metal' | 'sulfur' | 'memory' {
    const oreType = (stone as any).oreType;
    if (oreType) {
        if (oreType.tag === 'Metal' || oreType === 'Metal') return 'metal';
        if (oreType.tag === 'Sulfur' || oreType === 'Sulfur') return 'sulfur';
        if (oreType.tag === 'Memory' || oreType === 'Memory') return 'memory';
    }
    return 'stone';
}

/**
 * Check if a stone should be visible for destruction effect - call this from entity filtering
 * This function detects destruction transitions and triggers effects
 * Returns true if the stone has an active or newly-triggered destruction effect
 */
export function checkStoneDestructionVisibility(stone: Stone): boolean {
    const stoneId = stone.id.toString();
    const isDestroyed = stone.respawnAt && stone.respawnAt.microsSinceUnixEpoch !== 0n;
    const wasHealthy = previousStoneHealthStates.get(stoneId);
    
    // If already has an active effect, keep it visible
    if (activeStoneDestructions.has(stoneId)) {
        return true;
    }
    
    // Check for destruction transition: was healthy, now destroyed
    if (wasHealthy === true && isDestroyed) {
        // Trigger the effect!
        const oreType = getStoneOreType(stone);
        triggerStoneDestructionEffect(stoneId, stone.posX, stone.posY, oreType);
        return true;
    }
    
    // Update tracking for next frame
    previousStoneHealthStates.set(stoneId, !isDestroyed);
    
    return false;
}

/**
 * Generate debris particles for stone destruction
 */
function generateStoneDebris(x: number, y: number, oreType: 'stone' | 'metal' | 'sulfur' | 'memory'): StoneDebrisParticle[] {
    const particles: StoneDebrisParticle[] = [];
    const colors = STONE_COLORS[oreType];
    
    for (let i = 0; i < NUM_STONE_DEBRIS_PARTICLES; i++) {
        // Explosion outward from center
        const angle = (Math.random() * Math.PI * 2);
        const speed = 3 + Math.random() * 6;
        
        // Determine particle type
        const typeRoll = Math.random();
        let type: 'rock_chunk' | 'rock_shard' | 'dust' | 'spark';
        let color: string;
        let size: number;
        let gravity: number;
        let maxBounces: number;
        
        if (typeRoll < 0.35) {
            type = 'rock_chunk';
            color = colors.chunks[Math.floor(Math.random() * colors.chunks.length)];
            size = 4 + Math.random() * 8; // 4-12px
            gravity = 0.25;
            maxBounces = 2;
        } else if (typeRoll < 0.65) {
            type = 'rock_shard';
            color = colors.chunks[Math.floor(Math.random() * colors.chunks.length)];
            size = 2 + Math.random() * 4; // 2-6px
            gravity = 0.2;
            maxBounces = 3;
        } else if (typeRoll < 0.85) {
            type = 'dust';
            color = colors.chunks[Math.floor(Math.random() * colors.chunks.length)];
            size = 1 + Math.random() * 2; // 1-3px
            gravity = 0.05;
            maxBounces = 0;
        } else {
            type = 'spark';
            color = colors.sparks[Math.floor(Math.random() * colors.sparks.length)];
            size = 1 + Math.random() * 2; // 1-3px
            gravity = 0.1;
            maxBounces = 0;
        }
        
        particles.push({
            x: x + (Math.random() - 0.5) * 30,
            y: y - 20 - Math.random() * 30, // Start from center of stone
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 3 - Math.random() * 4, // Initial upward burst
            size,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.6,
            type,
            color,
            alpha: 0.9 + Math.random() * 0.1,
            gravity,
            bounceCount: 0,
            maxBounces,
        });
    }
    
    return particles;
}

/**
 * Generate dust cloud for stone destruction
 */
function generateStoneDustCloud(x: number, y: number, oreType: 'stone' | 'metal' | 'sulfur' | 'memory'): StoneDustParticle[] {
    const particles: StoneDustParticle[] = [];
    const colors = STONE_COLORS[oreType];
    
    for (let i = 0; i < NUM_STONE_DUST_PARTICLES; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 1.5;
        
        particles.push({
            x: x + (Math.random() - 0.5) * 40,
            y: y - 10 - Math.random() * 20,
            vx: Math.cos(angle) * speed,
            vy: -0.5 - Math.random() * 1.0, // Rise slowly
            size: 12 + Math.random() * 20,
            alpha: 0.5 + Math.random() * 0.2,
            expandRate: 0.4 + Math.random() * 0.4,
            color: colors.dust[Math.floor(Math.random() * colors.dust.length)],
        });
    }
    
    return particles;
}

/**
 * Trigger stone destruction effect
 */
export function triggerStoneDestructionEffect(
    stoneId: string,
    x: number,
    y: number,
    oreType: 'stone' | 'metal' | 'sulfur' | 'memory'
): void {
    if (activeStoneDestructions.has(stoneId)) return;
    
    const effect: StoneDestructionEffect = {
        stoneId,
        startTime: Date.now(),
        x,
        y,
        duration: STONE_DESTRUCTION_DURATION_MS,
        debris: generateStoneDebris(x, y, oreType),
        dust: generateStoneDustCloud(x, y, oreType),
        oreType,
    };
    
    activeStoneDestructions.set(stoneId, effect);
}

// Pre-allocated array for destruction effects removal
const stoneDestructionEffectsToRemove: string[] = [];

/**
 * Render stone destruction effects - AAA pixel art quality
 * OPTIMIZED: Traditional loops, pre-allocated arrays, reduced string operations
 */
export function renderStoneDestructionEffects(
    ctx: CanvasRenderingContext2D,
    nowMs: number
): void {
    if (activeStoneDestructions.size === 0) return;
    
    stoneDestructionEffectsToRemove.length = 0;
    
    activeStoneDestructions.forEach((effect, stoneId) => {
        const elapsed = nowMs - effect.startTime;
        const progress = elapsed / effect.duration;
        
        if (progress >= 1) {
            stoneDestructionEffectsToRemove.push(stoneId);
            return;
        }
        
        const groundY = effect.y + 5;
        
        // === PHASE 1: DUST CLOUD (first 80%) ===
        if (progress < 0.8) {
            const dustProgress = progress / 0.8;
            const dustFade = 1 - Math.pow(dustProgress, 0.6);
            const dustAlphaMultiplier = dustFade * (1 - dustProgress * 0.4);
            
            const dustParticles = effect.dust;
            const dustCount = dustParticles.length;
            
            for (let i = 0; i < dustCount; i++) {
                const dust = dustParticles[i];
                
                dust.x += dust.vx;
                dust.y += dust.vy;
                dust.size += dust.expandRate;
                dust.vy *= 0.97;
                
                const dustAlpha = dust.alpha * dustAlphaMultiplier;
                if (dustAlpha > 0.01) {
                    const gradient = ctx.createRadialGradient(
                        dust.x, dust.y, 0,
                        dust.x, dust.y, dust.size
                    );
                    // Pre-compute alpha values to avoid string replacement
                    const alpha07 = dustAlpha * 0.7;
                    const alpha04 = dustAlpha * 0.4;
                    gradient.addColorStop(0, dust.color.replace(/[\d.]+\)$/, `${alpha07})`));
                    gradient.addColorStop(0.5, dust.color.replace(/[\d.]+\)$/, `${alpha04})`));
                    gradient.addColorStop(1, dust.color.replace(/[\d.]+\)$/, '0)'));
                    
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(dust.x, dust.y, dust.size, 0, TWO_PI);
                    ctx.fill();
                }
            }
        }
        
        // === PHASE 2: DEBRIS PARTICLES (full animation) ===
        const debrisFade = progress > 0.6 ? 1 - ((progress - 0.6) / 0.4) : 1;
        
        const debrisParticles = effect.debris;
        const debrisCount = debrisParticles.length;
        
        for (let i = 0; i < debrisCount; i++) {
            const particle = debrisParticles[i];
            
            // Physics update
            particle.vy += particle.gravity;
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.rotation += particle.rotationSpeed;
            particle.vx *= 0.98;
            
            // Ground bounce
            if (particle.y > groundY) {
                if (particle.bounceCount < particle.maxBounces) {
                    particle.y = groundY;
                    particle.vy = -particle.vy * 0.35;
                    particle.vx *= 0.6;
                    particle.bounceCount++;
                    particle.rotationSpeed *= 0.4;
                } else {
                    particle.y = groundY;
                    particle.vy = 0;
                    particle.vx *= 0.92;
                }
            }
            
            const particleAlpha = particle.alpha * debrisFade;
            if (particleAlpha < 0.05) continue;
            
            ctx.save();
            ctx.translate(particle.x, particle.y);
            ctx.rotate(particle.rotation);
            ctx.globalAlpha = particleAlpha;
            ctx.fillStyle = particle.color;
            
            const size = particle.size;
            const halfSize = size * 0.5;
            const thirdSize = size / 3;
            const quarterSize = size * 0.25;
            
            switch (particle.type) {
                case 'rock_chunk':
                    ctx.beginPath();
                    ctx.moveTo(-halfSize, -thirdSize);
                    ctx.lineTo(thirdSize, -halfSize);
                    ctx.lineTo(halfSize, quarterSize);
                    ctx.lineTo(-quarterSize, halfSize);
                    ctx.closePath();
                    ctx.fill();
                    break;
                    
                case 'rock_shard':
                    ctx.beginPath();
                    ctx.moveTo(0, -size);
                    ctx.lineTo(halfSize, halfSize);
                    ctx.lineTo(-halfSize, halfSize);
                    ctx.closePath();
                    ctx.fill();
                    break;
                    
                case 'dust':
                    ctx.beginPath();
                    ctx.arc(0, 0, size, 0, TWO_PI);
                    ctx.fill();
                    break;
                    
                case 'spark':
                    ctx.shadowColor = particle.color;
                    ctx.shadowBlur = 4;
                    ctx.beginPath();
                    ctx.arc(0, 0, size, 0, TWO_PI);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    break;
            }
            
            ctx.restore();
        }
        
        // === PHASE 3: IMPACT BURST (first 15%) ===
        if (progress < 0.15) {
            const burstProgress = progress / 0.15;
            const burstRadius = 30 + burstProgress * 50;
            const burstAlpha = 0.5 * (1 - burstProgress);
            
            ctx.strokeStyle = `rgba(255, 255, 255, ${burstAlpha})`;
            ctx.lineWidth = 3 - burstProgress * 2;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y - 20, burstRadius, 0, TWO_PI);
            ctx.stroke();
        }
    });
    
    for (let i = 0; i < stoneDestructionEffectsToRemove.length; i++) {
        activeStoneDestructions.delete(stoneDestructionEffectsToRemove[i]);
    }
}

/**
 * Clean up stone destruction effect
 */
export function cleanupStoneDestructionEffect(stoneId: string): void {
    activeStoneDestructions.delete(stoneId);
    previousStoneHealthStates.delete(stoneId);
}

// Define the configuration for rendering stones
const stoneConfig: GroundEntityConfig<Stone> = {
    // shouldRender: (entity) => entity.health > 0, // Removed: Filtering should happen before calling renderStone

    getImageSource: (entity) => {
        // Determine which image to use based on ore type
        // Note: oreType field will be available after bindings are regenerated
        const oreType = (entity as any).oreType;
        if (oreType) {
            // Check the ore type variant (assuming it's an enum/tagged union)
            if (oreType.tag === 'Metal' || oreType === 'Metal') {
                return metalImage;
            } else if (oreType.tag === 'Sulfur' || oreType === 'Sulfur') {
                return sulfurImage;
            } else if (oreType.tag === 'Memory' || oreType === 'Memory') {
                return memoryImage;
            }
        }
        // Default to stone image
        return stoneImage;
    },

    getTargetDimensions: (img, _entity) => {
        // Calculate scaling factor based on target width
        const scaleFactor = TARGET_STONE_WIDTH_PX / img.naturalWidth;
        return {
            width: TARGET_STONE_WIDTH_PX, // Set width to target
            height: img.naturalHeight * scaleFactor, // Scale height proportionally
        };
    },

    calculateDrawPosition: (entity, _drawWidth, drawHeight) => ({
        // Top-left corner for image drawing, originating from entity's base Y
        drawX: entity.posX - TARGET_STONE_WIDTH_PX / 2, 
        drawY: entity.posY - drawHeight, 
    }),

    getShadowParams: undefined, // No longer using this for stones

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Calculate shake offsets for shadow synchronization
        // Use average shake (since shadow represents the whole stone, not segments)
        let shakeOffsetX = 0;
        let shakeOffsetY = 0;

        if (entity.lastHitTime) {
            const stoneId = entity.id.toString();
            const serverShakeTime = Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n);
            const lastKnownServerTime = lastKnownServerStoneShakeTimes.get(stoneId) || 0;
            
            if (serverShakeTime !== lastKnownServerTime) {
                const clientStartTime = clientStoneShakeStartTimes.get(stoneId);
                const alreadyShaking = clientStartTime && (Date.now() - clientStartTime < SHAKE_DURATION_MS);
                lastKnownServerStoneShakeTimes.set(stoneId, serverShakeTime);
                if (!alreadyShaking) {
                    clientStoneShakeStartTimes.set(stoneId, Date.now());
                    const oreType = getStoneOreType(entity);
                    triggerStoneHitEffect(stoneId, entity.posX, entity.posY, oreType);
                }
            }
            
            const clientStartTime = clientStoneShakeStartTimes.get(stoneId);
            if (clientStartTime) {
                const elapsedSinceShake = Date.now() - clientStartTime;
                
                if (elapsedSinceShake >= 0 && elapsedSinceShake < SHAKE_DURATION_MS) {
                    const shakeFactor = 1.0 - (elapsedSinceShake / SHAKE_DURATION_MS);
                    const currentShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                    
                    // Use average shake intensity (middle of stone) for shadow
                    const averageShakeFactor = Math.pow(0.5, 1.8); // Middle segment shake factor
                    const shadowShakeIntensity = currentShakeIntensity * averageShakeFactor;
                    
                    const timePhase = elapsedSinceShake / 50;
                    const stoneSeed = stoneId.charCodeAt(0) % 100;
                    
                    shakeOffsetX = Math.sin(timePhase + stoneSeed) * shadowShakeIntensity;
                    shakeOffsetY = Math.cos(timePhase + stoneSeed) * 0.5 * shadowShakeIntensity;
                }
            }
        }

        // NOON FIX: At noon, shadows appear too far below (detached from entity)
        let noonExtraOffset = 0;
        if (cycleProgress >= 0.35 && cycleProgress < 0.55) {
            const noonT = (cycleProgress - 0.35) / 0.20;
            const noonFactor = 1.0 - Math.abs(noonT - 0.5) * 2.0;
            noonExtraOffset = noonFactor * imageDrawHeight * 0.2; // Stones need smaller offset
        }

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
            shadowBlur: 2, // Standardized to match other world objects
            pivotYOffset: 10 + noonExtraOffset,
            // NEW: Pass shake offsets so shadow moves with the stone
            shakeOffsetX,
            shakeOffsetY
        });
    },

    applyEffects: (ctx, entity, nowMs, _baseDrawX, _baseDrawY, _cycleProgress, targetImgWidth, targetImgHeight) => {
        // Calculate shake intensity (same as before)
        let baseShakeIntensity = 0;
        let shakeFactor = 0;
        let shakeDirectionX = 0;
        let shakeDirectionY = 0;

        const stoneId = entity.id.toString();

        if (entity.lastHitTime) { 
            // NOTE: Hit effect is triggered in drawCustomGroundShadow (runs first)
            // This block handles the shake animation for the stone sprite
            
            // Calculate animation based on client time
            const clientStartTime = clientStoneShakeStartTimes.get(stoneId);
            if (clientStartTime) {
                const elapsedSinceShake = nowMs - clientStartTime;
                
                if (elapsedSinceShake >= 0 && elapsedSinceShake < SHAKE_DURATION_MS) {
                    shakeFactor = 1.0 - (elapsedSinceShake / SHAKE_DURATION_MS); 
                    baseShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                    
                    // Generate smooth, time-based shake direction using sine waves
                    // This creates a more natural swaying motion
                    const timePhase = elapsedSinceShake / 50; // Faster oscillation (50ms per cycle)
                    const stoneSeed = stoneId.charCodeAt(0) % 100; // Unique phase offset per stone
                    
                    // Use sine/cosine for smooth circular motion
                    shakeDirectionX = Math.sin(timePhase + stoneSeed);
                    shakeDirectionY = Math.cos(timePhase + stoneSeed) * 0.5; // Less vertical movement
                }
            }
        } else {
            // Clean up tracking when stone is not being hit
            clientStoneShakeStartTimes.delete(stoneId);
            lastKnownServerStoneShakeTimes.delete(stoneId);
        }
        
        // Store shake data for vertex-based rendering
        // Return zero offset - the custom draw will handle vertex-based shaking
        return { 
            offsetX: 0, 
            offsetY: 0, 
            vertexShakeIntensity: baseShakeIntensity,
            shakeDirectionX,
            shakeDirectionY
        };
    },

    /**
     * Custom draw function for vertex-based shaking.
     * Draws the stone in vertical segments with increasing shake from base to top.
     */
    customDraw: (ctx, entity, img, finalDrawX, finalDrawY, targetImgWidth, targetImgHeight, effectsResult) => {
        const shakeIntensity = (effectsResult.vertexShakeIntensity as number) || 0;
        const shakeDirX = (effectsResult.shakeDirectionX as number) || 0;
        const shakeDirY = (effectsResult.shakeDirectionY as number) || 0;

        // If no shaking, just draw normally
        if (shakeIntensity <= 0) {
            ctx.drawImage(
                img,
                -targetImgWidth / 2,
                -targetImgHeight / 2,
                targetImgWidth,
                targetImgHeight
            );
            return;
        }

        // FIRST: Draw a static backdrop to fill any gaps from segment shake
        // This prevents 1-2px gaps from showing through
        ctx.drawImage(
            img,
            -targetImgWidth / 2,
            -targetImgHeight / 2,
            targetImgWidth,
            targetImgHeight
        );

        // THEN: Draw stone in vertical segments with vertex-based shaking on top
        // Base (bottom) has minimal shake, top has maximum shake
        const segmentHeight = targetImgHeight / VERTEX_SHAKE_SEGMENTS;
        
        for (let i = 0; i < VERTEX_SHAKE_SEGMENTS; i++) {
            // Calculate normalized position (0 = base/bottom, 1 = top)
            // i=0 is top of stone, i=VERTEX_SHAKE_SEGMENTS-1 is base
            const normalizedY = (VERTEX_SHAKE_SEGMENTS - 1 - i) / (VERTEX_SHAKE_SEGMENTS - 1);
            
            // Shake intensity increases quadratically from base to top
            // This creates a more realistic impact effect where the top shakes more
            // Using a slightly steeper curve for more pronounced effect
            const segmentShakeFactor = Math.pow(normalizedY, 1.8); // Slightly steeper than quadratic for more intensity
            
            // Calculate offset for this segment
            const segmentOffsetX = shakeDirX * shakeIntensity * segmentShakeFactor;
            const segmentOffsetY = shakeDirY * shakeIntensity * segmentShakeFactor;
            
            // Source rectangle (from original image)
            const sourceY = (img.naturalHeight / VERTEX_SHAKE_SEGMENTS) * i;
            const sourceHeight = img.naturalHeight / VERTEX_SHAKE_SEGMENTS;
            
            // Destination rectangle (on canvas, with offset)
            const destX = -targetImgWidth / 2 + segmentOffsetX;
            const destY = -targetImgHeight / 2 + (segmentHeight * i) + segmentOffsetY;
            
            // Draw this segment
            ctx.drawImage(
                img,
                0, // Source X (full width)
                sourceY, // Source Y (segment start)
                img.naturalWidth, // Source width (full width)
                sourceHeight, // Source height (segment height)
                destX, // Destination X (with shake offset)
                destY, // Destination Y (with shake offset)
                targetImgWidth, // Destination width (full width)
                segmentHeight // Destination height (segment height)
            );
        }
    },

    fallbackColor: 'gray', // Fallback if image fails to load
};

// Preload all ore node images
imageManager.preloadImage(stoneImage);
imageManager.preloadImage(metalImage);
imageManager.preloadImage(sulfurImage);
imageManager.preloadImage(memoryImage);

/**
 * Renders a single stone entity onto the canvas using the generic renderer.
 * Also tracks destruction state to trigger debris effects.
 */
export function renderStone(
    ctx: CanvasRenderingContext2D, 
    stone: Stone, 
    nowMs: number, 
    cycleProgress: number,
    onlyDrawShadow?: boolean,    // New flag
    skipDrawingShadow?: boolean // New flag
) {
    const stoneId = stone.id.toString();
    const isDestroyed = stone.respawnAt && stone.respawnAt.microsSinceUnixEpoch !== 0n;
    const wasHealthy = previousStoneHealthStates.get(stoneId);
    
    // Check for destruction transition: was healthy, now destroyed
    if (wasHealthy && isDestroyed && !activeStoneDestructions.has(stoneId)) {
        const oreType = getStoneOreType(stone);
        triggerStoneDestructionEffect(stoneId, stone.posX, stone.posY, oreType);
    }
    
    // Update tracking
    previousStoneHealthStates.set(stoneId, !isDestroyed);
    
    // Don't render the stone sprite if it's destroyed (only show debris)
    if (isDestroyed) {
        return;
    }
    
    renderConfiguredGroundEntity({
        ctx,
        entity: stone,
        config: stoneConfig,
        nowMs,
        entityPosX: stone.posX,
        entityPosY: stone.posY,
        cycleProgress,
        onlyDrawShadow,     // Pass flag
        skipDrawingShadow   // Pass flag
    });
} 