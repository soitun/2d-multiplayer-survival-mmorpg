import { LivingCoral } from '../../generated'; // Import generated type
import coralImage from '../../assets/doodads/coral.png'; // Main coral variant
import coral1Image from '../../assets/doodads/coral1.png'; // Second coral variant
import coral2Image from '../../assets/doodads/coral2.png'; // Third coral variant
import coral3Image from '../../assets/doodads/coral3.png'; // Fourth coral variant
import { applyStandardDropShadow, drawDynamicGroundShadow } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';

// --- Constants ---
export const LIVING_CORAL_WIDTH = 192; // Coral reef cluster width (doubled for better underwater visibility)
export const LIVING_CORAL_HEIGHT = 160; // Coral reef cluster height (doubled)
export const LIVING_CORAL_COLLISION_RADIUS = 80; // Doubled collision radius for client collision checks

// --- Shake Effect Constants ---
const SHAKE_DURATION_MS = 300;     // How long the shake effect lasts when hit
const SHAKE_INTENSITY_PX = 4;     // Shake intensity (underwater so slightly less than land entities)
const VERTEX_SHAKE_SEGMENTS = 6;  // Number of vertical segments for vertex-based shaking

// --- Client-side animation tracking for coral shakes ---
const clientCoralShakeStartTimes = new Map<string, number>(); // coralId -> client timestamp when shake started
const lastKnownServerCoralShakeTimes = new Map<string, number>(); // coralId -> last known server timestamp

/** Trigger coral shake immediately (optimistic feedback) when player initiates a hit. */
export function triggerCoralShakeOptimistic(coralId: string, posX: number, posY: number, variantIndex: number = 0): void {
  const now = Date.now();
  clientCoralShakeStartTimes.set(coralId, now);
  lastKnownServerCoralShakeTimes.set(coralId, now);
  triggerCoralHitEffect(coralId, posX, posY, variantIndex);
}

// ============================================================================
// CORAL HIT PARTICLES - Small fragments and bubbles on each hit
// ============================================================================

interface CoralHitParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    rotation: number;
    rotationSpeed: number;
    type: 'fragment' | 'bubble';
    color: string;
    alpha: number;
    drag: number;
}

interface CoralHitEffect {
    coralId: string;
    startTime: number;
    x: number;
    y: number;
    duration: number;
    particles: CoralHitParticle[];
}

// Track active coral hit effects
const activeCoralHitEffects = new Map<string, CoralHitEffect>();

// Hit effect constants
const CORAL_HIT_DURATION_MS = 550;
const NUM_CORAL_HIT_PARTICLES = 8;

// Coral fragment colors (reused from main palettes below)
const CORAL_HIT_COLORS = [
    ['#FF6B6B', '#FF8080', '#E05555'], // Pink
    ['#FF8C42', '#FFA060', '#E07030'], // Orange
    ['#9B59B6', '#A070C0', '#7B3996'], // Purple
    ['#1ABC9C', '#20D0A8', '#15A085'], // Teal
];

/**
 * Generate coral hit particles
 */
function generateCoralHitParticles(x: number, y: number, variantIndex: number): CoralHitParticle[] {
    const particles: CoralHitParticle[] = [];
    const colors = CORAL_HIT_COLORS[variantIndex % CORAL_HIT_COLORS.length];
    
    for (let i = 0; i < NUM_CORAL_HIT_PARTICLES; i++) {
        // Underwater spray - less vertical, more floaty
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
        const speed = 2 + Math.random() * 3;
        
        // Mix of fragments and bubbles - 35% bubbles
        const isBubble = Math.random() < 0.35;
        
        particles.push({
            x: x + (Math.random() - 0.5) * 24,
            y: y - 35 - Math.random() * 25,
            vx: Math.cos(angle) * speed,
            vy: isBubble ? -1.5 - Math.random() * 2.5 : Math.sin(angle) * speed, // Bubbles rise
            size: isBubble ? (3 + Math.random() * 4) : (4 + Math.random() * 5), // LARGER (4-9px fragments, 3-7px bubbles)
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.4,
            type: isBubble ? 'bubble' : 'fragment',
            color: isBubble ? 'rgba(200, 230, 255, 0.7)' : colors[Math.floor(Math.random() * colors.length)],
            alpha: isBubble ? 0.65 : 0.92,
            drag: 0.91, // Heavy water drag
        });
    }
    
    return particles;
}

/**
 * Trigger coral hit effect
 */
export function triggerCoralHitEffect(coralId: string, x: number, y: number, variantIndex: number): void {
    const effectKey = `${coralId}_${Date.now()}`;
    
    const effect: CoralHitEffect = {
        coralId,
        startTime: Date.now(),
        x,
        y,
        duration: CORAL_HIT_DURATION_MS,
        particles: generateCoralHitParticles(x, y, variantIndex),
    };
    
    activeCoralHitEffects.set(effectKey, effect);
}

/**
 * Render coral hit effects
 */
export function renderCoralHitEffects(ctx: CanvasRenderingContext2D, nowMs: number): void {
    const effectsToRemove: string[] = [];
    
    activeCoralHitEffects.forEach((effect, effectKey) => {
        const elapsed = nowMs - effect.startTime;
        const progress = elapsed / effect.duration;
        
        if (progress >= 1) {
            effectsToRemove.push(effectKey);
            return;
        }
        
        ctx.save();
        
        effect.particles.forEach((particle) => {
            // Update with water physics
            particle.vx *= particle.drag;
            particle.vy *= particle.drag;
            
            // Bubbles continue rising
            if (particle.type === 'bubble') {
                particle.vy -= 0.05; // Buoyancy
            } else {
                particle.vy += 0.03; // Slight sink
            }
            
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.rotation += particle.rotationSpeed;
            
            // Fade out
            const fadeStart = 0.4;
            const particleAlpha = progress > fadeStart
                ? particle.alpha * (1 - (progress - fadeStart) / (1 - fadeStart))
                : particle.alpha;
            
            if (particleAlpha < 0.01) return;
            
            ctx.save();
            ctx.translate(particle.x, particle.y);
            ctx.globalAlpha = particleAlpha;
            
            if (particle.type === 'bubble') {
                // Bubble with highlight
                ctx.beginPath();
                ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
                ctx.fillStyle = particle.color;
                ctx.fill();
                
                // Highlight
                ctx.beginPath();
                ctx.arc(-particle.size * 0.3, -particle.size * 0.3, particle.size * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.fill();
            } else {
                // Coral fragment
                ctx.rotate(particle.rotation);
                ctx.fillStyle = particle.color;
                ctx.beginPath();
                ctx.moveTo(-particle.size / 2, 0);
                ctx.lineTo(0, -particle.size / 2);
                ctx.lineTo(particle.size / 2, 0);
                ctx.lineTo(0, particle.size / 2);
                ctx.closePath();
                ctx.fill();
            }
            
            ctx.restore();
        });
        
        ctx.restore();
    });
    
    effectsToRemove.forEach(key => activeCoralHitEffects.delete(key));
}

// ============================================================================
// CORAL DESTRUCTION DEBRIS SYSTEM - AAA Pixel Art Underwater Quality
// ============================================================================

// Coral debris particle interface
interface CoralDebrisParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    rotation: number;
    rotationSpeed: number;
    type: 'coral_chunk' | 'coral_shard' | 'sand' | 'shell_fragment';
    color: string;
    alpha: number;
    drag: number; // Water resistance
    sinkSpeed: number;
}

// Bubble particle for underwater effect
interface CoralBubbleParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
    wobblePhase: number;
    wobbleSpeed: number;
}

// Sand cloud particle
interface SandCloudParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
    expandRate: number;
}

// Coral destruction effect state
interface CoralDestructionEffect {
    coralId: string;
    startTime: number;
    x: number;
    y: number;
    duration: number;
    debris: CoralDebrisParticle[];
    bubbles: CoralBubbleParticle[];
    sand: SandCloudParticle[];
    variantIndex: number; // For color variation
}

// Track active coral destruction effects
const activeCoralDestructions = new Map<string, CoralDestructionEffect>();

// Track previous coral states to detect destruction
const previousCoralHealthStates = new Map<string, boolean>(); // coralId -> wasHealthy

/**
 * Check if a coral has an active destruction effect (for entity filtering)
 * This allows destroyed corals to remain visible while their debris effect plays
 */
export function hasActiveCoralDestruction(coralId: string): boolean {
    return activeCoralDestructions.has(coralId);
}

/**
 * Check if a coral should be visible for destruction effect - call this from entity filtering
 * This function detects destruction transitions and triggers effects
 * Returns true if the coral has an active or newly-triggered destruction effect
 */
export function checkCoralDestructionVisibility(coral: LivingCoral): boolean {
    const coralId = coral.id.toString();
    const isDestroyed = coral.respawnAt && coral.respawnAt.microsSinceUnixEpoch !== 0n;
    const wasHealthy = previousCoralHealthStates.get(coralId);
    
    // If already has an active effect, keep it visible
    if (activeCoralDestructions.has(coralId)) {
        return true;
    }
    
    // Check for destruction transition: was healthy, now destroyed
    if (wasHealthy === true && isDestroyed) {
        // Trigger the effect!
        const variantIndex = Number(coral.id) % 4; // 4 coral color variants
        triggerCoralDestructionEffect(coralId, coral.posX, coral.posY, variantIndex);
        return true;
    }
    
    // Update tracking for next frame
    previousCoralHealthStates.set(coralId, !isDestroyed);
    
    return false;
}

// Destruction effect constants
const CORAL_DESTRUCTION_DURATION_MS = 1600; // Longer underwater for settling
const NUM_CORAL_DEBRIS_PARTICLES = 14;
const NUM_CORAL_BUBBLE_PARTICLES = 18;
const NUM_SAND_PARTICLES = 8;

// Color palettes for coral debris (AAA pixel art underwater style)
const CORAL_COLORS = [
    // Variant 0 - Pink/Red coral
    {
        chunks: ['#FF6B6B', '#FF8080', '#E05555', '#FF5050', '#CC4040'],
        shards: ['#FFB3B3', '#FF9999', '#FFCCCC'],
        sand: ['rgba(194, 178, 128, 0.5)', 'rgba(210, 190, 140, 0.4)', 'rgba(180, 165, 120, 0.3)'],
    },
    // Variant 1 - Orange coral
    {
        chunks: ['#FF8C42', '#FFA060', '#E07030', '#FF9955', '#CC6620'],
        shards: ['#FFB888', '#FFCC99', '#FFD0A0'],
        sand: ['rgba(194, 178, 128, 0.5)', 'rgba(210, 190, 140, 0.4)', 'rgba(180, 165, 120, 0.3)'],
    },
    // Variant 2 - Purple coral
    {
        chunks: ['#9B59B6', '#A070C0', '#7B3996', '#8855AA', '#6A2888'],
        shards: ['#C999DD', '#D4AAEE', '#E0BBFF'],
        sand: ['rgba(194, 178, 128, 0.5)', 'rgba(210, 190, 140, 0.4)', 'rgba(180, 165, 120, 0.3)'],
    },
    // Variant 3 - Teal coral
    {
        chunks: ['#1ABC9C', '#20D0A8', '#15A085', '#18C8A0', '#108870'],
        shards: ['#80E0CC', '#99EEDD', '#B3F5E8'],
        sand: ['rgba(194, 178, 128, 0.5)', 'rgba(210, 190, 140, 0.4)', 'rgba(180, 165, 120, 0.3)'],
    },
];

// Shell fragment colors
const SHELL_COLORS = ['#F5E6D3', '#E8D4BE', '#DCC8B0', '#D0BCA0', '#FFF8F0'];

/**
 * Generate debris particles for coral destruction (underwater physics)
 */
function generateCoralDebris(x: number, y: number, variantIndex: number): CoralDebrisParticle[] {
    const particles: CoralDebrisParticle[] = [];
    const colors = CORAL_COLORS[variantIndex % CORAL_COLORS.length];
    
    for (let i = 0; i < NUM_CORAL_DEBRIS_PARTICLES; i++) {
        // Underwater: slower, more drifty movement
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3; // Slower underwater
        
        const typeRoll = Math.random();
        let type: 'coral_chunk' | 'coral_shard' | 'sand' | 'shell_fragment';
        let color: string;
        let size: number;
        let drag: number;
        let sinkSpeed: number;
        
        if (typeRoll < 0.35) {
            type = 'coral_chunk';
            color = colors.chunks[Math.floor(Math.random() * colors.chunks.length)];
            size = 5 + Math.random() * 10; // 5-15px
            drag = 0.95; // High water resistance
            sinkSpeed = 0.3 + Math.random() * 0.2;
        } else if (typeRoll < 0.6) {
            type = 'coral_shard';
            color = colors.shards[Math.floor(Math.random() * colors.shards.length)];
            size = 3 + Math.random() * 6; // 3-9px
            drag = 0.93;
            sinkSpeed = 0.2 + Math.random() * 0.15;
        } else if (typeRoll < 0.85) {
            type = 'sand';
            color = '#C2B280'; // Sandy color
            size = 1 + Math.random() * 2; // 1-3px
            drag = 0.9;
            sinkSpeed = 0.4 + Math.random() * 0.3;
        } else {
            type = 'shell_fragment';
            color = SHELL_COLORS[Math.floor(Math.random() * SHELL_COLORS.length)];
            size = 2 + Math.random() * 4; // 2-6px
            drag = 0.92;
            sinkSpeed = 0.25 + Math.random() * 0.15;
        }
        
        particles.push({
            x: x + (Math.random() - 0.5) * 50,
            y: y - 30 - Math.random() * 40,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.5 - Math.random() * 2, // Gentle upward burst
            size,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.3, // Slower rotation underwater
            type,
            color,
            alpha: 0.85 + Math.random() * 0.15,
            drag,
            sinkSpeed,
        });
    }
    
    return particles;
}

/**
 * Generate bubble particles for underwater coral destruction
 */
function generateCoralBubbles(x: number, y: number): CoralBubbleParticle[] {
    const particles: CoralBubbleParticle[] = [];
    
    for (let i = 0; i < NUM_CORAL_BUBBLE_PARTICLES; i++) {
        particles.push({
            x: x + (Math.random() - 0.5) * 60,
            y: y - 20 - Math.random() * 40,
            vx: (Math.random() - 0.5) * 0.8,
            vy: -1.5 - Math.random() * 2.5, // Rise upward
            size: 2 + Math.random() * 6, // 2-8px
            alpha: 0.5 + Math.random() * 0.3,
            wobblePhase: Math.random() * Math.PI * 2,
            wobbleSpeed: 2 + Math.random() * 3,
        });
    }
    
    return particles;
}

/**
 * Generate sand cloud for coral destruction
 */
function generateSandCloud(x: number, y: number): SandCloudParticle[] {
    const particles: SandCloudParticle[] = [];
    
    for (let i = 0; i < NUM_SAND_PARTICLES; i++) {
        const angle = Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI; // Mostly upward
        const speed = 0.3 + Math.random() * 0.8;
        
        particles.push({
            x: x + (Math.random() - 0.5) * 40,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: -0.2 - Math.random() * 0.5, // Slow rise
            size: 20 + Math.random() * 30,
            alpha: 0.35 + Math.random() * 0.15,
            expandRate: 0.3 + Math.random() * 0.3,
        });
    }
    
    return particles;
}

/**
 * Trigger coral destruction effect
 */
export function triggerCoralDestructionEffect(
    coralId: string,
    x: number,
    y: number,
    variantIndex: number
): void {
    if (activeCoralDestructions.has(coralId)) return;
    
    const effect: CoralDestructionEffect = {
        coralId,
        startTime: Date.now(),
        x,
        y,
        duration: CORAL_DESTRUCTION_DURATION_MS,
        debris: generateCoralDebris(x, y, variantIndex),
        bubbles: generateCoralBubbles(x, y),
        sand: generateSandCloud(x, y),
        variantIndex,
    };
    
    activeCoralDestructions.set(coralId, effect);
}

/**
 * Render coral destruction effects - AAA pixel art underwater quality
 */
export function renderCoralDestructionEffects(
    ctx: CanvasRenderingContext2D,
    nowMs: number
): void {
    const effectsToRemove: string[] = [];
    
    activeCoralDestructions.forEach((effect, coralId) => {
        const elapsed = nowMs - effect.startTime;
        const progress = elapsed / effect.duration;
        
        if (progress >= 1) {
            effectsToRemove.push(coralId);
            return;
        }
        
        ctx.save();
        
        // === PHASE 1: SAND CLOUD (first 85%) ===
        if (progress < 0.85) {
            const sandProgress = progress / 0.85;
            const sandFade = 1 - Math.pow(sandProgress, 0.4); // Slow fade
            
            effect.sand.forEach((sand) => {
                sand.x += sand.vx;
                sand.y += sand.vy;
                sand.size += sand.expandRate;
                sand.vy *= 0.98; // Slow down
                
                const sandAlpha = sand.alpha * sandFade;
                if (sandAlpha > 0.01) {
                    const gradient = ctx.createRadialGradient(
                        sand.x, sand.y, 0,
                        sand.x, sand.y, sand.size
                    );
                    gradient.addColorStop(0, `rgba(194, 178, 128, ${sandAlpha * 0.5})`);
                    gradient.addColorStop(0.5, `rgba(180, 165, 115, ${sandAlpha * 0.3})`);
                    gradient.addColorStop(1, `rgba(160, 145, 100, 0)`);
                    
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(sand.x, sand.y, sand.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        }
        
        // === PHASE 2: BUBBLES (full animation) ===
        const bubbleFade = progress > 0.7 ? 1 - ((progress - 0.7) / 0.3) : 1;
        
        effect.bubbles.forEach((bubble) => {
            // Underwater bubble physics - wobble as they rise
            bubble.wobblePhase += bubble.wobbleSpeed * 0.016; // ~60fps
            bubble.x += bubble.vx + Math.sin(bubble.wobblePhase) * 0.5;
            bubble.y += bubble.vy;
            bubble.vy *= 0.99; // Slight slowdown
            bubble.size *= 0.997; // Shrink slightly as they rise
            
            const bubbleAlpha = bubble.alpha * bubbleFade;
            if (bubbleAlpha > 0.02 && bubble.size > 0.5) {
                // Draw bubble with highlight
                ctx.beginPath();
                ctx.arc(bubble.x, bubble.y, bubble.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(200, 230, 255, ${bubbleAlpha * 0.3})`;
                ctx.fill();
                
                // Bubble outline
                ctx.strokeStyle = `rgba(180, 220, 255, ${bubbleAlpha * 0.6})`;
                ctx.lineWidth = 1;
                ctx.stroke();
                
                // Highlight
                ctx.beginPath();
                ctx.arc(bubble.x - bubble.size * 0.3, bubble.y - bubble.size * 0.3, bubble.size * 0.25, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${bubbleAlpha * 0.7})`;
                ctx.fill();
            }
        });
        
        // === PHASE 3: CORAL DEBRIS (full animation, underwater physics) ===
        const debrisFade = progress > 0.65 ? 1 - ((progress - 0.65) / 0.35) : 1;
        
        effect.debris.forEach((particle) => {
            // Underwater physics - drag slows movement, gentle sinking
            particle.vx *= particle.drag;
            particle.vy *= particle.drag;
            particle.vy += particle.sinkSpeed * 0.1; // Gentle sink
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.rotation += particle.rotationSpeed;
            particle.rotationSpeed *= 0.98; // Slow rotation decay
            
            // Settle on "ground"
            const groundY = effect.y + 20;
            if (particle.y > groundY) {
                particle.y = groundY;
                particle.vy = 0;
                particle.vx *= 0.9;
                particle.rotationSpeed *= 0.5;
            }
            
            const particleAlpha = particle.alpha * debrisFade;
            if (particleAlpha < 0.05) return;
            
            ctx.save();
            ctx.translate(particle.x, particle.y);
            ctx.rotate(particle.rotation);
            ctx.globalAlpha = particleAlpha;
            ctx.fillStyle = particle.color;
            
            switch (particle.type) {
                case 'coral_chunk':
                    // Organic blob shape
                    ctx.beginPath();
                    ctx.moveTo(-particle.size / 2, 0);
                    ctx.quadraticCurveTo(-particle.size / 3, -particle.size / 2, 0, -particle.size / 2);
                    ctx.quadraticCurveTo(particle.size / 3, -particle.size / 2, particle.size / 2, 0);
                    ctx.quadraticCurveTo(particle.size / 3, particle.size / 3, 0, particle.size / 2);
                    ctx.quadraticCurveTo(-particle.size / 3, particle.size / 3, -particle.size / 2, 0);
                    ctx.fill();
                    break;
                    
                case 'coral_shard':
                    // Branching coral piece
                    ctx.fillRect(-particle.size / 6, -particle.size / 2, particle.size / 3, particle.size);
                    ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size / 3, particle.size / 6);
                    break;
                    
                case 'sand':
                    // Tiny sand grain
                    ctx.beginPath();
                    ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                    
                case 'shell_fragment':
                    // Curved shell piece
                    ctx.beginPath();
                    ctx.arc(0, 0, particle.size, 0, Math.PI);
                    ctx.fill();
                    break;
            }
            
            ctx.restore();
        });
        
        // === PHASE 4: WATER DISTURBANCE RING (first 25%) ===
        if (progress < 0.25) {
            const ringProgress = progress / 0.25;
            const ringRadius = 40 + ringProgress * 80;
            const ringAlpha = 0.3 * (1 - ringProgress);
            
            ctx.strokeStyle = `rgba(150, 200, 230, ${ringAlpha})`;
            ctx.lineWidth = 2 - ringProgress * 1.5;
            ctx.beginPath();
            ctx.ellipse(effect.x, effect.y - 20, ringRadius, ringRadius * 0.4, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.restore();
    });
    
    effectsToRemove.forEach(id => activeCoralDestructions.delete(id));
}

/**
 * Clean up coral destruction effect
 */
export function cleanupCoralDestructionEffect(coralId: string): void {
    activeCoralDestructions.delete(coralId);
    previousCoralHealthStates.delete(coralId);
}

// --- Living Coral Variant Images Array ---
// Use coral, coral1, coral2, coral3.png for visual variety in reef clusters
const LIVING_CORAL_VARIANT_IMAGES = [
    coralImage,    // Main coral variant
    coral1Image,   // Second coral variant
    coral2Image,   // Third coral variant
    coral3Image,   // Fourth coral variant
];

// --- Define Configuration ---
const livingCoralConfig: GroundEntityConfig<LivingCoral> = {
    getImageSource: (entity) => {
        // Select coral variant based on entity ID for consistent visual variety
        const variantIndex = Number(entity.id) % LIVING_CORAL_VARIANT_IMAGES.length;
        return LIVING_CORAL_VARIANT_IMAGES[variantIndex];
    },

    getTargetDimensions: (_img, _entity) => ({
        width: LIVING_CORAL_WIDTH,
        height: LIVING_CORAL_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight + 40, // Anchor at base with offset for doubled underwater appearance
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Calculate shake offsets for shadow synchronization
        let shakeOffsetX = 0;
        let shakeOffsetY = 0;

        if (entity.lastHitTime) {
            const coralId = entity.id.toString();
            const serverShakeTime = Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n);
            const lastKnownServerTime = lastKnownServerCoralShakeTimes.get(coralId) || 0;
            
            if (serverShakeTime !== lastKnownServerTime) {
                const clientStartTime = clientCoralShakeStartTimes.get(coralId);
                const alreadyShaking = clientStartTime && (Date.now() - clientStartTime < SHAKE_DURATION_MS);
                lastKnownServerCoralShakeTimes.set(coralId, serverShakeTime);
                if (!alreadyShaking) {
                    clientCoralShakeStartTimes.set(coralId, Date.now());
                    const variantIndex = Number(entity.id) % 4;
                    triggerCoralHitEffect(coralId, entity.posX, entity.posY, variantIndex);
                }
            }
            
            const clientStartTime = clientCoralShakeStartTimes.get(coralId);
            if (clientStartTime) {
                const elapsedSinceShake = Date.now() - clientStartTime;
                
                if (elapsedSinceShake >= 0 && elapsedSinceShake < SHAKE_DURATION_MS) {
                    const shakeFactor = 1.0 - (elapsedSinceShake / SHAKE_DURATION_MS);
                    const currentShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                    
                    // Use average shake intensity for shadow
                    const averageShakeFactor = Math.pow(0.5, 1.8);
                    const shadowShakeIntensity = currentShakeIntensity * averageShakeFactor;
                    
                    const timePhase = elapsedSinceShake / 50;
                    const coralSeed = coralId.charCodeAt(0) % 100;
                    
                    shakeOffsetX = Math.sin(timePhase + coralSeed) * shadowShakeIntensity;
                    shakeOffsetY = Math.cos(timePhase + coralSeed) * 0.5 * shadowShakeIntensity;
                }
            }
        }

        // Draw subtle underwater shadow for coral (doubled size)
        drawDynamicGroundShadow({
            ctx,
            entityImage,
            entityCenterX: entityPosX,
            entityBaseY: entityPosY,
            imageDrawWidth,
            imageDrawHeight,
            cycleProgress,
            maxStretchFactor: 0.8,  // Minimal stretch (underwater has diffused light)
            minStretchFactor: 0.4,  // Keep some shadow even at noon
            shadowBlur: 8,          // Softer underwater shadow (slightly larger for doubled size)
            pivotYOffset: 40,       // Pivot point for shadow (doubled for larger coral)
            shakeOffsetX,           // Pass shake offsets so shadow moves with coral
            shakeOffsetY
        });
    },

    applyEffects: (ctx, entity, nowMs, baseDrawX, baseDrawY, cycleProgress, targetImgWidth, targetImgHeight) => {
        // Apply subtle drop shadow for depth
        applyStandardDropShadow(ctx);
        
        // Add gentle underwater sway animation
        const swayOffset = Math.sin(nowMs / 2000 + entity.posX * 0.01) * 2;
        
        // Calculate shake intensity when hit
        let baseShakeIntensity = 0;
        let shakeFactor = 0;
        let shakeDirectionX = 0;
        let shakeDirectionY = 0;

        if (entity.lastHitTime) { 
            // NOTE: Hit effect is triggered in drawCustomGroundShadow (runs first)
            // This block handles the shake animation for the coral sprite
            const coralId = entity.id.toString();
            
            // Calculate animation based on client time (Maps are updated in drawCustomGroundShadow)
            const clientStartTime = clientCoralShakeStartTimes.get(coralId);
            if (clientStartTime) {
                const elapsedSinceShake = nowMs - clientStartTime;
                
                if (elapsedSinceShake >= 0 && elapsedSinceShake < SHAKE_DURATION_MS) {
                    shakeFactor = 1.0 - (elapsedSinceShake / SHAKE_DURATION_MS); 
                    baseShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                    
                    // Generate smooth, time-based shake direction using sine waves
                    const timePhase = elapsedSinceShake / 50; // Faster oscillation (50ms per cycle)
                    const coralSeed = coralId.charCodeAt(0) % 100; // Unique phase offset per coral
                    
                    // Use sine/cosine for smooth circular motion
                    shakeDirectionX = Math.sin(timePhase + coralSeed);
                    shakeDirectionY = Math.cos(timePhase + coralSeed) * 0.5; // Less vertical movement
                }
            }
        }
        
        // Apply vertex-based shake effect (slicing) if shaking
        if (baseShakeIntensity > 0 && targetImgWidth && targetImgHeight) {
            // Vertex-based shake: different segments shake at different intensities
            // Bottom is more anchored, top shakes more (like swaying in water)
            for (let i = 0; i < VERTEX_SHAKE_SEGMENTS; i++) {
                const segmentYStart = (i / VERTEX_SHAKE_SEGMENTS) * targetImgHeight;
                const segmentYEnd = ((i + 1) / VERTEX_SHAKE_SEGMENTS) * targetImgHeight;
                const segmentHeight = segmentYEnd - segmentYStart;
                
                // Progressive shake: more shake at the top
                const segmentProgress = i / (VERTEX_SHAKE_SEGMENTS - 1);
                const segmentShakeFactor = Math.pow(segmentProgress, 1.8); // Exponential falloff from bottom to top
                const segmentShakeIntensity = baseShakeIntensity * segmentShakeFactor;
                
                // Calculate segment offset with directional shake
                const segmentOffsetX = shakeDirectionX * segmentShakeIntensity + swayOffset;
                const segmentOffsetY = shakeDirectionY * segmentShakeIntensity * 0.3;
            }
        }
        
        // Return combined sway and shake offsets for the entire entity
        const totalOffsetX = swayOffset + (shakeDirectionX * baseShakeIntensity);
        const totalOffsetY = shakeDirectionY * baseShakeIntensity * 0.3;
        
        return {
            offsetX: totalOffsetX,
            offsetY: totalOffsetY,
        };
    },

    // No health bars for natural resources (trees, stones, corals)
    // Living coral uses the same pattern as other harvestable resources
    drawOverlay: undefined,

    fallbackColor: '#FF6B6B', // Coral pink fallback color
};

/**
 * Renders a living coral entity (underwater harvestable resource).
 * Living coral uses the combat system like stones - attack with Diving Pick to harvest.
 * Note: Underwater tinting is now handled via CSS filter in renderingUtils.ts for consistency.
 * Also tracks destruction state to trigger debris effects.
 */
export function renderLivingCoral(
    ctx: CanvasRenderingContext2D,
    coral: LivingCoral,
    nowMs: number,
    cycleProgress: number
): void {
    const coralId = coral.id.toString();
    const isDestroyed = coral.respawnAt && coral.respawnAt.microsSinceUnixEpoch !== 0n;
    const wasHealthy = previousCoralHealthStates.get(coralId);
    
    // Check for destruction transition: was healthy, now destroyed
    if (wasHealthy && isDestroyed && !activeCoralDestructions.has(coralId)) {
        const variantIndex = Number(coral.id) % CORAL_COLORS.length;
        triggerCoralDestructionEffect(coralId, coral.posX, coral.posY, variantIndex);
    }
    
    // Update tracking
    previousCoralHealthStates.set(coralId, !isDestroyed);
    
    // Don't render the coral sprite if it's destroyed (only show debris)
    if (isDestroyed) {
        return;
    }
    
    // Render coral
    renderConfiguredGroundEntity({
        ctx,
        entity: coral,
        config: livingCoralConfig,
        nowMs,
        entityPosX: coral.posX,
        entityPosY: coral.posY,
        cycleProgress,
    });
}

/**
 * Pre-loads living coral images into the image manager cache.
 */
export function preloadLivingCoralImages(): void {
    // Preload all coral variant images
    LIVING_CORAL_VARIANT_IMAGES.forEach(imageSrc => {
        imageManager.preloadImage(imageSrc);
    });
}

