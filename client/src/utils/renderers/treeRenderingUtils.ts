import { Tree } from '../../generated'; // Import generated types
import birchImage from '../../assets/doodads/siberian_birch_c.png';
import mountainHemlockImage from '../../assets/doodads/mountain_hemlock_c.png';
import mountainHemlockImage2 from '../../assets/doodads/mountain_hemlock_d.png';
import sitkaSpruceImage from '../../assets/doodads/sitka_spruce_c.png';
import beachBirchImage from '../../assets/doodads/sitka_alder_c.png';
import beachBirchImage2 from '../../assets/doodads/sitka_alder_d.png';
import dwarfPineImage from '../../assets/doodads/dwarf_pine.png';
import arcticWillowImage from '../../assets/doodads/arctic_willow.png';
import mountainHemlockSnowImage from '../../assets/doodads/mountain_hemlock_snow.png';
import krummholzSpruceImage from '../../assets/doodads/krummholz_spruce.png';
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils'; // Import shadow utils
import { applyStandardDropShadow } from './shadowUtils'; // Import new shadow util
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer'; // Import generic renderer
import { imageManager } from './imageManager'; // Import image manager

// Define constants for tree rendering
const TARGET_TREE_WIDTH_PX = 480; // Target width on screen (base size for tallest tree - Sitka Spruce)
const TREE_HEIGHT = 120;
const SHAKE_DURATION_MS = 500;
const SHAKE_INTENSITY_PX = 14; // Increased from 8 for more intense shaking
const VERTEX_SHAKE_SEGMENTS = 8; // Number of vertical segments for vertex-based shaking

// --- Client-side animation tracking for tree shakes ---
const clientTreeShakeStartTimes = new Map<string, number>(); // treeId -> client timestamp when shake started
const lastKnownServerTreeShakeTimes = new Map<string, number>(); // treeId -> last known server timestamp

// ============================================================================
// TREE HIT PARTICLES - Bark/leaf chips on each axe swing
// ============================================================================

interface TreeHitParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    rotation: number;
    rotationSpeed: number;
    type: 'bark' | 'leaf' | 'splinter';
    color: string;
    alpha: number;
    gravity: number;
}

interface TreeHitEffect {
    treeId: string;
    startTime: number;
    x: number;
    y: number;
    duration: number;
    particles: TreeHitParticle[];
}

// Track active tree hit effects
const activeTreeHitEffects = new Map<string, TreeHitEffect>();

// Hit effect constants (smaller than fall impact)
const TREE_HIT_DURATION_MS = 500;
const NUM_TREE_HIT_PARTICLES = 8;

// Colors for tree hit particles (prefixed with HIT_ to avoid conflict with destruction colors)
const HIT_BARK_COLORS = ['#5C4033', '#6B4423', '#7A5C3A', '#4A3728', '#3D2B1F'];
const HIT_LEAF_COLORS = ['#2D5016', '#3A6B1A', '#4A7C28', '#1E3D0F', '#507830'];
const HIT_SPLINTER_COLORS = ['#C4A35A', '#D4B36A', '#B4934A', '#E4C37A', '#A4833A'];

/**
 * Generate hit particles for tree
 */
function generateTreeHitParticles(x: number, y: number): TreeHitParticle[] {
    const particles: TreeHitParticle[] = [];
    
    for (let i = 0; i < NUM_TREE_HIT_PARTICLES; i++) {
        // Spray outward and upward from hit point
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
        const speed = 3 + Math.random() * 4;
        
        // Determine particle type
        const typeRoll = Math.random();
        let type: 'bark' | 'leaf' | 'splinter';
        let color: string;
        let size: number;
        
        if (typeRoll < 0.4) {
            type = 'bark';
            color = HIT_BARK_COLORS[Math.floor(Math.random() * HIT_BARK_COLORS.length)];
            size = 4 + Math.random() * 5; // LARGER (4-9px)
        } else if (typeRoll < 0.7) {
            type = 'splinter';
            color = HIT_SPLINTER_COLORS[Math.floor(Math.random() * HIT_SPLINTER_COLORS.length)];
            size = 3 + Math.random() * 4; // LARGER (3-7px)
        } else {
            type = 'leaf';
            color = HIT_LEAF_COLORS[Math.floor(Math.random() * HIT_LEAF_COLORS.length)];
            size = 4 + Math.random() * 4; // LARGER (4-8px)
        }
        
        particles.push({
            x: x + (Math.random() - 0.5) * 20,
            y: y - 45 - Math.random() * 35, // Mid-trunk height
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 3, // Stronger upward boost
            size,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.6,
            type,
            color,
            alpha: 0.95,
            gravity: type === 'leaf' ? 0.1 : 0.22, // Leaves fall slower
        });
    }
    
    return particles;
}

/**
 * Trigger tree hit effect
 */
export function triggerTreeHitEffect(treeId: string, x: number, y: number): void {
    const effectKey = `${treeId}_${Date.now()}`;
    
    const effect: TreeHitEffect = {
        treeId,
        startTime: Date.now(),
        x,
        y,
        duration: TREE_HIT_DURATION_MS,
        particles: generateTreeHitParticles(x, y),
    };
    
    activeTreeHitEffects.set(effectKey, effect);
}

/**
 * Render tree hit effects
 */
export function renderTreeHitEffects(ctx: CanvasRenderingContext2D, nowMs: number): void {
    const effectsToRemove: string[] = [];
    
    activeTreeHitEffects.forEach((effect, effectKey) => {
        const elapsed = nowMs - effect.startTime;
        const progress = elapsed / effect.duration;
        
        if (progress >= 1) {
            effectsToRemove.push(effectKey);
            return;
        }
        
        ctx.save();
        
        effect.particles.forEach((particle) => {
            // Update physics
            particle.vy += particle.gravity;
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.rotation += particle.rotationSpeed;
            particle.vx *= 0.98;
            
            // Leaves have more air resistance
            if (particle.type === 'leaf') {
                particle.vx *= 0.95;
                particle.vy *= 0.98;
            }
            
            // Fade out
            const fadeStart = 0.5;
            const particleAlpha = progress > fadeStart
                ? particle.alpha * (1 - (progress - fadeStart) / (1 - fadeStart))
                : particle.alpha;
            
            if (particleAlpha < 0.01) return;
            
            ctx.save();
            ctx.translate(particle.x, particle.y);
            ctx.rotate(particle.rotation);
            ctx.globalAlpha = particleAlpha;
            ctx.fillStyle = particle.color;
            
            switch (particle.type) {
                case 'bark':
                    // Irregular bark chip
                    ctx.beginPath();
                    ctx.moveTo(-particle.size / 2, -particle.size / 3);
                    ctx.lineTo(particle.size / 3, -particle.size / 2);
                    ctx.lineTo(particle.size / 2, particle.size / 4);
                    ctx.lineTo(-particle.size / 4, particle.size / 2);
                    ctx.closePath();
                    ctx.fill();
                    break;
                    
                case 'splinter':
                    // Long thin wood splinter
                    ctx.fillRect(-particle.size / 6, -particle.size, particle.size / 3, particle.size * 2);
                    break;
                    
                case 'leaf':
                    // Leaf shape
                    ctx.beginPath();
                    ctx.ellipse(0, 0, particle.size / 2, particle.size, 0, 0, Math.PI * 2);
                    ctx.fill();
                    break;
            }
            
            ctx.restore();
        });
        
        ctx.restore();
    });
    
    effectsToRemove.forEach(key => activeTreeHitEffects.delete(key));
}

// ============================================================================
// TREE IMPACT DEBRIS SYSTEM - AAA Pixel Art Quality
// ============================================================================

// Impact debris particle interface
interface TreeDebrisParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    rotation: number;
    rotationSpeed: number;
    type: 'twig' | 'leaf' | 'dirt' | 'bark';
    color: string;
    alpha: number;
    gravity: number;
    bounceCount: number;
    maxBounces: number;
}

// Dust cloud particle interface
interface DustParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
    expandRate: number;
}

// Tree impact effect state
interface TreeImpactEffect {
    treeId: string;
    startTime: number;
    x: number; // Landing position X
    y: number; // Landing position Y (tree base)
    duration: number;
    debris: TreeDebrisParticle[];
    dust: DustParticle[];
    impactDirection: number; // Radians, direction tree fell
    treeWidth: number;
    treeHeight: number;
}

// Track active tree impact effects
const activeTreeImpacts = new Map<string, TreeImpactEffect>();

// Impact effect constants
const IMPACT_DURATION_MS = 1400; // 1.4 seconds for debris to settle
const NUM_DEBRIS_PARTICLES = 18;
const NUM_DUST_PARTICLES = 12;

// Color palettes for organic debris (AAA pixel art style)
const TWIG_COLORS = ['#5C4033', '#6B4423', '#7A5C3A', '#4A3728', '#8B6914'];
const LEAF_COLORS = ['#2D5016', '#3A6B1A', '#4A7C28', '#1E3D0F', '#507830'];
const DIRT_COLORS = ['#3D2B1F', '#4A3728', '#5C4033', '#2A1F15', '#352A20'];
const BARK_COLORS = ['#6B4423', '#5C3D28', '#7A5C3A', '#4F3520', '#8B6914'];

/**
 * Generate debris particles for tree impact
 * Creates a spray of organic material in the direction the tree fell
 */
function generateTreeDebris(x: number, y: number, treeWidth: number, treeHeight: number): TreeDebrisParticle[] {
    const particles: TreeDebrisParticle[] = [];
    const fallDirection = Math.PI / 2; // Tree falls to the right (90 degrees)
    
    // Calculate impact point (where the top of tree lands)
    const impactX = x + treeHeight * 0.9; // Tree lands to the right
    const impactY = y;
    
    for (let i = 0; i < NUM_DEBRIS_PARTICLES; i++) {
        // Spray direction biased toward the fall direction with spread
        const spreadAngle = (Math.random() - 0.5) * Math.PI * 0.8; // ±72 degrees spread
        const upwardBias = -Math.PI * 0.3 * Math.random(); // Some particles go up
        const angle = fallDirection + spreadAngle + upwardBias;
        
        // Speed varies - some fast, some slow for depth
        const speed = 2 + Math.random() * 5;
        
        // Determine particle type and properties
        const typeRoll = Math.random();
        let type: 'twig' | 'leaf' | 'dirt' | 'bark';
        let color: string;
        let size: number;
        let gravity: number;
        let maxBounces: number;
        
        if (typeRoll < 0.25) {
            type = 'twig';
            color = TWIG_COLORS[Math.floor(Math.random() * TWIG_COLORS.length)];
            size = 3 + Math.random() * 5; // 3-8px
            gravity = 0.12;
            maxBounces = 2;
        } else if (typeRoll < 0.5) {
            type = 'leaf';
            color = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)];
            size = 2 + Math.random() * 4; // 2-6px
            gravity = 0.06; // Leaves float more
            maxBounces = 1;
        } else if (typeRoll < 0.8) {
            type = 'dirt';
            color = DIRT_COLORS[Math.floor(Math.random() * DIRT_COLORS.length)];
            size = 2 + Math.random() * 3; // 2-5px
            gravity = 0.2; // Dirt falls fast
            maxBounces = 3;
        } else {
            type = 'bark';
            color = BARK_COLORS[Math.floor(Math.random() * BARK_COLORS.length)];
            size = 4 + Math.random() * 6; // 4-10px
            gravity = 0.15;
            maxBounces = 2;
        }
        
        // Spawn position spread along the impact area
        const spawnOffset = (Math.random() - 0.3) * treeWidth * 0.5;
        
        particles.push({
            x: impactX + spawnOffset,
            y: impactY - 5 - Math.random() * 15, // Start slightly above ground
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2 - Math.random() * 3, // Initial upward velocity
            size,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.4,
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
 * Generate dust cloud particles for tree impact
 * Creates a billowing dust/dirt cloud at the impact point
 */
function generateDustCloud(x: number, y: number, treeHeight: number): DustParticle[] {
    const particles: DustParticle[] = [];
    const impactX = x + treeHeight * 0.9;
    
    for (let i = 0; i < NUM_DUST_PARTICLES; i++) {
        // Dust spreads outward and upward
        const angle = Math.PI + (Math.random() - 0.5) * Math.PI * 1.2; // Mostly upward-right spread
        const speed = 0.5 + Math.random() * 1.5;
        
        particles.push({
            x: impactX + (Math.random() - 0.5) * 60,
            y: y - Math.random() * 10,
            vx: Math.cos(angle) * speed,
            vy: -0.3 - Math.random() * 0.8, // Rise slowly
            size: 15 + Math.random() * 25, // Large soft particles
            alpha: 0.4 + Math.random() * 0.2,
            expandRate: 0.5 + Math.random() * 0.5,
        });
    }
    
    return particles;
}

/**
 * Trigger tree impact effect when tree lands
 */
export function triggerTreeImpactEffect(
    treeId: string,
    baseX: number,
    baseY: number,
    treeWidth: number,
    treeHeight: number
): void {
    // Don't duplicate if already active
    if (activeTreeImpacts.has(treeId)) return;
    
    const effect: TreeImpactEffect = {
        treeId,
        startTime: Date.now(),
        x: baseX,
        y: baseY,
        duration: IMPACT_DURATION_MS,
        debris: generateTreeDebris(baseX, baseY, treeWidth, treeHeight),
        dust: generateDustCloud(baseX, baseY, treeHeight),
        impactDirection: Math.PI / 2,
        treeWidth,
        treeHeight,
    };
    
    activeTreeImpacts.set(treeId, effect);
}

/**
 * Check if tree impact effect should be triggered
 * Called from renderFallingTree when fallProgress reaches 1.0
 */
function checkAndTriggerImpact(
    treeId: string,
    fallProgress: number,
    treeX: number,
    treeY: number,
    treeWidth: number,
    treeHeight: number
): void {
    // Trigger at 98% to ensure it fires exactly once
    if (fallProgress >= 0.98 && !activeTreeImpacts.has(treeId)) {
        triggerTreeImpactEffect(treeId, treeX, treeY, treeWidth, treeHeight);
    }
}

/**
 * Render tree impact debris effect - AAA pixel art quality
 */
export function renderTreeImpactEffects(
    ctx: CanvasRenderingContext2D,
    nowMs: number
): void {
    const effectsToRemove: string[] = [];
    
    activeTreeImpacts.forEach((effect, treeId) => {
        const elapsed = nowMs - effect.startTime;
        const progress = elapsed / effect.duration;
        
        if (progress >= 1) {
            effectsToRemove.push(treeId);
            return;
        }
        
        ctx.save();
        
        // === PHASE 1: DUST CLOUD (first 80% of animation) ===
        if (progress < 0.8) {
            const dustProgress = progress / 0.8;
            const dustFade = 1 - Math.pow(dustProgress, 0.5); // Slow fade
            
            effect.dust.forEach((dust) => {
                // Update dust position
                dust.x += dust.vx;
                dust.y += dust.vy;
                dust.size += dust.expandRate;
                dust.vy *= 0.98; // Slow down rise
                
                // Draw dust as soft circle
                const dustAlpha = dust.alpha * dustFade * (1 - dustProgress * 0.3);
                if (dustAlpha > 0.01) {
                    const gradient = ctx.createRadialGradient(
                        dust.x, dust.y, 0,
                        dust.x, dust.y, dust.size
                    );
                    gradient.addColorStop(0, `rgba(139, 119, 101, ${dustAlpha * 0.6})`);
                    gradient.addColorStop(0.4, `rgba(110, 90, 70, ${dustAlpha * 0.4})`);
                    gradient.addColorStop(0.7, `rgba(80, 65, 50, ${dustAlpha * 0.2})`);
                    gradient.addColorStop(1, `rgba(60, 50, 40, 0)`);
                    
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(dust.x, dust.y, dust.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        }
        
        // === PHASE 2: DEBRIS PARTICLES (full animation) ===
        const debrisFade = progress > 0.7 ? 1 - ((progress - 0.7) / 0.3) : 1;
        
        effect.debris.forEach((particle) => {
            // Physics update
            particle.vy += particle.gravity;
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.rotation += particle.rotationSpeed;
            
            // Friction
            particle.vx *= 0.98;
            
            // Ground bounce
            const groundY = effect.y + 5;
            if (particle.y > groundY && particle.bounceCount < particle.maxBounces) {
                particle.y = groundY;
                particle.vy = -particle.vy * 0.3; // Damped bounce
                particle.vx *= 0.7; // Friction on bounce
                particle.bounceCount++;
                particle.rotationSpeed *= 0.5;
            } else if (particle.y > groundY) {
                // Settled on ground
                particle.y = groundY;
                particle.vy = 0;
                particle.vx *= 0.95;
                particle.rotationSpeed *= 0.9;
            }
            
            // Draw particle based on type
            const particleAlpha = particle.alpha * debrisFade;
            if (particleAlpha < 0.05) return;
            
            ctx.save();
            ctx.translate(particle.x, particle.y);
            ctx.rotate(particle.rotation);
            ctx.globalAlpha = particleAlpha;
            ctx.fillStyle = particle.color;
            
            switch (particle.type) {
                case 'twig':
                    // Draw as elongated rectangle (stick shape)
                    ctx.fillRect(-particle.size * 1.5, -particle.size * 0.3, particle.size * 3, particle.size * 0.6);
                    // Add slight detail line
                    ctx.fillStyle = BARK_COLORS[0];
                    ctx.fillRect(-particle.size, -particle.size * 0.15, particle.size * 2, particle.size * 0.3);
                    break;
                    
                case 'leaf':
                    // Draw as diamond/rhombus shape
                    ctx.beginPath();
                    ctx.moveTo(0, -particle.size);
                    ctx.lineTo(particle.size * 0.6, 0);
                    ctx.lineTo(0, particle.size);
                    ctx.lineTo(-particle.size * 0.6, 0);
                    ctx.closePath();
                    ctx.fill();
                    // Add center vein
                    ctx.strokeStyle = LEAF_COLORS[3];
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(0, -particle.size * 0.7);
                    ctx.lineTo(0, particle.size * 0.7);
                    ctx.stroke();
                    break;
                    
                case 'dirt':
                    // Draw as small irregular square (rotated)
                    ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
                    break;
                    
                case 'bark':
                    // Draw as chunky irregular piece
                    ctx.beginPath();
                    ctx.moveTo(-particle.size / 2, -particle.size / 3);
                    ctx.lineTo(particle.size / 3, -particle.size / 2);
                    ctx.lineTo(particle.size / 2, particle.size / 4);
                    ctx.lineTo(-particle.size / 4, particle.size / 2);
                    ctx.closePath();
                    ctx.fill();
                    // Add texture line
                    ctx.strokeStyle = BARK_COLORS[2];
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(-particle.size * 0.3, 0);
                    ctx.lineTo(particle.size * 0.3, 0);
                    ctx.stroke();
                    break;
            }
            
            ctx.restore();
        });
        
        // === PHASE 3: GROUND IMPACT RING (first 20%) ===
        if (progress < 0.2) {
            const ringProgress = progress / 0.2;
            const impactX = effect.x + effect.treeHeight * 0.9;
            const ringRadius = 20 + ringProgress * 60;
            const ringAlpha = 0.4 * (1 - ringProgress);
            
            ctx.strokeStyle = `rgba(139, 119, 101, ${ringAlpha})`;
            ctx.lineWidth = 3 - ringProgress * 2;
            ctx.beginPath();
            ctx.ellipse(impactX, effect.y, ringRadius, ringRadius * 0.3, 0, 0, Math.PI * 2);
            ctx.stroke();
            
            // Inner ring
            const innerRadius = ringRadius * 0.5;
            ctx.strokeStyle = `rgba(100, 85, 70, ${ringAlpha * 0.7})`;
            ctx.lineWidth = 2 - ringProgress * 1.5;
            ctx.beginPath();
            ctx.ellipse(impactX, effect.y, innerRadius, innerRadius * 0.3, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.restore();
    });
    
    // Clean up finished effects
    effectsToRemove.forEach(id => activeTreeImpacts.delete(id));
}

/**
 * Clean up impact effect for a specific tree (called when tree respawns or unloads)
 */
export function cleanupTreeImpactEffect(treeId: string): void {
    activeTreeImpacts.delete(treeId);
}

// PERFORMANCE: Cache tree type results to avoid repeated runtime checks
const treeTypeCache = new Map<string, { imageSource: string; targetWidth: number }>();

// PERFORMANCE: Helper to get cached tree type info
function getCachedTreeTypeInfo(entity: Tree): { imageSource: string; targetWidth: number } {
    const treeTypeKey = typeof entity.treeType === 'object' && entity.treeType !== null && 'tag' in entity.treeType
        ? (entity.treeType as any).tag
        : entity.treeType;
    
    let cached = treeTypeCache.get(treeTypeKey);
    if (!cached) {
        // Calculate once and cache
        let imageSource: string;
        let targetWidth: number;
        
        switch (treeTypeKey) {
            // Deciduous trees
            case 'SiberianBirch':
                imageSource = birchImage;
                targetWidth = 320; // 33% shorter than Sitka Spruce
                break;
            case 'SitkaAlder':
                imageSource = beachBirchImage;
                targetWidth = 360; // 25% shorter than Sitka Spruce
                break;
            case 'SitkaAlder2':
                imageSource = beachBirchImage2;
                targetWidth = 360; // Same size as SitkaAlder variant A
                break;
            // Conifer trees
            case 'SitkaSpruce':
                imageSource = sitkaSpruceImage;
                targetWidth = 480; // Full size (same as old uniform height)
                break;
            case 'MountainHemlock':
                imageSource = mountainHemlockImage;
                targetWidth = 400; // 17% shorter than Sitka Spruce
                break;
            case 'MountainHemlock2':
                imageSource = mountainHemlockImage2;
                targetWidth = 400; // Same size as MountainHemlock variant A
                break;
            case 'DwarfPine':
                imageSource = dwarfPineImage;
                targetWidth = 280; // 42% shorter - stunted alpine tree
                break;
            case 'MountainHemlockSnow':
                imageSource = mountainHemlockSnowImage;
                targetWidth = 360; // 25% shorter - snow-covered alpine hemlock
                break;
            case 'ArcticWillow':
                imageSource = arcticWillowImage;
                targetWidth = 240; // 50% shorter - short tundra shrub-tree
                break;
            case 'KrummholzSpruce':
                imageSource = krummholzSpruceImage;
                targetWidth = 300; // Twisted wind-sculpted spruce, medium size
                break;
            default:
                imageSource = sitkaSpruceImage;
                targetWidth = TARGET_TREE_WIDTH_PX; // Fallback to Sitka Spruce size
        }
        
        cached = { imageSource, targetWidth };
        treeTypeCache.set(treeTypeKey, cached);
    }
    
    return cached;
}

// Define the configuration for rendering trees
const treeConfig: GroundEntityConfig<Tree> = {
    getImageSource: (entity) => {
        return getCachedTreeTypeInfo(entity).imageSource;
    },

    getTargetDimensions: (img, entity) => {
        const { targetWidth } = getCachedTreeTypeInfo(entity);
        const scaleFactor = targetWidth / img.naturalWidth;
        return {
            width: targetWidth,
            height: img.naturalHeight * scaleFactor,
        };
    },

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        // Top-left corner for image drawing, originating from entity's base Y
        drawX: entity.posX - drawWidth / 2, 
        drawY: entity.posY - drawHeight, 
    }),

    getShadowParams: undefined, // No longer using this for trees

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        const treeId = entity.id.toString();
        
        // Calculate shake offsets for shadow synchronization using helper function
        // The callback triggers hit particles when a new shake is detected
        const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
            entity,
            treeId,
            {
                clientStartTimes: clientTreeShakeStartTimes,
                lastKnownServerTimes: lastKnownServerTreeShakeTimes
            },
            SHAKE_DURATION_MS,
            SHAKE_INTENSITY_PX,
            // Callback when new shake detected - trigger hit particles!
            () => triggerTreeHitEffect(treeId, entity.posX, entity.posY)
        );

        drawDynamicGroundShadow({
            ctx,
            entityImage,
            entityCenterX: entityPosX, // No manual offset - padding compensation in shadowUtils handles alignment
            entityBaseY: entityPosY,
            imageDrawWidth,
            imageDrawHeight,
            cycleProgress,
            maxStretchFactor: 1.8,
            minStretchFactor: 0.15,
            shadowBlur: 2,
            pivotYOffset: 25, // Positive offset moves anchor UP, aligning shadow with tree base
            // NEW: Pass shake offsets so shadow moves with the tree
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

        if (entity.lastHitTime) { 
            // NOTE: Hit effect is triggered in drawCustomGroundShadow via calculateShakeOffsets callback
            // This block handles the shake animation for the tree sprite
            const treeId = entity.id.toString();
            
            // Calculate animation based on client time (Maps are updated in drawCustomGroundShadow)
            const clientStartTime = clientTreeShakeStartTimes.get(treeId);
            if (clientStartTime) {
                const elapsedSinceShake = nowMs - clientStartTime;
                
                if (elapsedSinceShake >= 0 && elapsedSinceShake < SHAKE_DURATION_MS) {
                    shakeFactor = 1.0 - (elapsedSinceShake / SHAKE_DURATION_MS); 
                    baseShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                    
                    // Generate smooth, time-based shake direction using sine waves
                    // This creates a more natural swaying motion
                    const timePhase = elapsedSinceShake / 50; // Faster oscillation (50ms per cycle)
                    const treeSeed = treeId.charCodeAt(0) % 100; // Unique phase offset per tree
                    
                    // Use sine/cosine for smooth circular motion
                    shakeDirectionX = Math.sin(timePhase + treeSeed);
                    shakeDirectionY = Math.cos(timePhase + treeSeed) * 0.5; // Less vertical movement
                }
            }
        } else {
            // Clean up tracking when tree is not being hit
            const treeId = entity.id.toString();
            clientTreeShakeStartTimes.delete(treeId);
            lastKnownServerTreeShakeTimes.delete(treeId);
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
     * Draws the tree in vertical segments with increasing shake from base to top.
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

        // THEN: Draw tree in vertical segments with vertex-based shaking on top
        // Base (bottom) has minimal shake, top has maximum shake
        const segmentHeight = targetImgHeight / VERTEX_SHAKE_SEGMENTS;
        
        for (let i = 0; i < VERTEX_SHAKE_SEGMENTS; i++) {
            // Calculate normalized position (0 = base/bottom, 1 = top)
            // i=0 is top of tree, i=VERTEX_SHAKE_SEGMENTS-1 is base
            const normalizedY = (VERTEX_SHAKE_SEGMENTS - 1 - i) / (VERTEX_SHAKE_SEGMENTS - 1);
            
            // Shake intensity increases quadratically from base to top
            // This creates a more realistic wind effect where the top sways more
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

    fallbackColor: 'darkgreen',
};

// Preload using the imported URL
imageManager.preloadImage(birchImage);
imageManager.preloadImage(mountainHemlockImage);
imageManager.preloadImage(mountainHemlockImage2);
imageManager.preloadImage(sitkaSpruceImage);
imageManager.preloadImage(beachBirchImage);
imageManager.preloadImage(beachBirchImage2);
imageManager.preloadImage(dwarfPineImage);
imageManager.preloadImage(arcticWillowImage);
imageManager.preloadImage(mountainHemlockSnowImage);
imageManager.preloadImage(krummholzSpruceImage);

// Refactored rendering function
export function renderTree(
    ctx: CanvasRenderingContext2D, 
    tree: Tree, 
    now_ms: number, 
    cycleProgress: number,
    onlyDrawShadow?: boolean, // New flag
    skipDrawingShadow?: boolean, // New flag
    localPlayerPosition?: { x: number; y: number } | null, // Player position for transparency logic
    treeShadowsEnabled: boolean = true, // NEW: Visual cortex module setting
    isFalling?: boolean, // NEW: Tree is currently falling
    fallProgress?: number // NEW: Progress of fall animation (0.0 to 1.0)
) {
    // PERFORMANCE: Skip shadow rendering entirely if disabled in visual settings
    const shouldSkipShadows = !treeShadowsEnabled || skipDrawingShadow;
    
    // Calculate if tree visually overlaps and occludes the player
    const MIN_ALPHA = 0.3; // Minimum opacity when tree is blocking player
    const MAX_ALPHA = 1.0; // Full opacity when not blocking
    
    // Dynamic threshold based on tree height - shorter trees need smaller thresholds
    // This ensures transparency only kicks in when player is actually BEHIND the tree
    const BASE_TRANSPARENCY_THRESHOLD_PERCENT = 0.33; // 25% of visual height as threshold
    
    let treeAlpha = MAX_ALPHA;
    
    if (localPlayerPosition && !onlyDrawShadow) {
        // Get actual tree dimensions from cached info and image
        const { imageSource, targetWidth } = getCachedTreeTypeInfo(tree);
        const img = imageManager.getImage(imageSource);
        
        // Calculate actual tree visual dimensions
        let treeVisualWidth = targetWidth * 0.4; // Trees are mostly transparent - use ~40% of sprite width for actual foliage
        let treeVisualHeight = 200; // Default height if image not loaded
        
        if (img && img.naturalWidth > 0) {
            const scaleFactor = targetWidth / img.naturalWidth;
            treeVisualHeight = img.naturalHeight * scaleFactor * 0.6; // Use ~60% of height (lower trunk is thin)
        }
        
        // Calculate dynamic threshold based on tree height
        // Taller trees (spruce 480px) get larger threshold (~72px)
        // Shorter trees (willow 240px) get smaller threshold (~36px)
        // This ensures player must be well ABOVE the trunk base before transparency triggers
        const dynamicThreshold = treeVisualHeight * BASE_TRANSPARENCY_THRESHOLD_PERCENT;
        
        // Tree is drawn with bottom-center at tree.posX, tree.posY
        const treeLeft = tree.posX - treeVisualWidth / 2;
        const treeRight = tree.posX + treeVisualWidth / 2;
        const treeTop = tree.posY - treeVisualHeight; // Tree extends upward
        const treeBottom = tree.posY - dynamicThreshold; // Effective bottom for overlap check (uses dynamic threshold)
        
        // Player bounding box (approximate)
        const playerSize = 48;
        const playerLeft = localPlayerPosition.x - playerSize / 2;
        const playerRight = localPlayerPosition.x + playerSize / 2;
        const playerTop = localPlayerPosition.y - playerSize;
        const playerBottom = localPlayerPosition.y;
        
        // Check if player overlaps with tree's visual area
        const overlapsHorizontally = playerRight > treeLeft && playerLeft < treeRight;
        const overlapsVertically = playerBottom > treeTop && playerTop < treeBottom;
        
        // Tree should be transparent if:
        // 1. It overlaps with player visually (with dynamic threshold buffer)
        // 2. Tree renders AFTER player (tree.posY > player.posY + threshold means tree is clearly in front in Y-sort)
        // The dynamic threshold ensures player must clearly move ABOVE the tree base, not just be parallel
        if (overlapsHorizontally && overlapsVertically && tree.posY > localPlayerPosition.y + dynamicThreshold) {
            // Calculate how much the player is behind the tree (for smooth fade)
            const depthDifference = tree.posY - localPlayerPosition.y;
            const maxDepthForFade = 100; // Max distance for fade effect
            
            if (depthDifference > 0 && depthDifference < maxDepthForFade) {
                // Closer to tree = more transparent
                const fadeFactor = 1 - (depthDifference / maxDepthForFade);
                treeAlpha = MAX_ALPHA - (fadeFactor * (MAX_ALPHA - MIN_ALPHA));
                treeAlpha = Math.max(MIN_ALPHA, Math.min(MAX_ALPHA, treeAlpha));
            } else if (depthDifference >= maxDepthForFade) {
                // Very close - use minimum alpha
                treeAlpha = MIN_ALPHA;
            }
        }
    }
    
    // Apply transparency if needed
    const needsTransparency = treeAlpha < MAX_ALPHA;
    if (needsTransparency) {
        ctx.save();
        ctx.globalAlpha = treeAlpha;
    }
    
    // Handle falling animation
    if (isFalling && fallProgress !== undefined && fallProgress !== null) {
        renderFallingTree(ctx, tree, fallProgress, cycleProgress, shouldSkipShadows || false);
    } else {
        // Normal upright tree rendering
        renderConfiguredGroundEntity({
            ctx,
            entity: tree,
            config: treeConfig,
            nowMs: now_ms,
            entityPosX: tree.posX,
            entityPosY: tree.posY,
            cycleProgress,
            onlyDrawShadow,    // Pass flag
            skipDrawingShadow: shouldSkipShadows  // Use computed shadow skip flag
        });
    }
    
    // Restore context if transparency was applied
    if (needsTransparency) {
        ctx.restore();
    }
}

/**
 * Render a tree in its falling animation
 */
function renderFallingTree(
    ctx: CanvasRenderingContext2D,
    tree: Tree,
    fallProgress: number,
    cycleProgress: number,
    skipShadow: boolean
) {
    const { imageSource, targetWidth } = getCachedTreeTypeInfo(tree);
    const img = imageManager.getImage(imageSource);
    
    if (!img) return;
    
    const scaleFactor = targetWidth / img.naturalWidth;
    const drawWidth = targetWidth;
    const drawHeight = img.naturalHeight * scaleFactor;
    
    // Check if we need to trigger impact effect (at 98% progress)
    const treeId = tree.id.toString();
    checkAndTriggerImpact(treeId, fallProgress, tree.posX, tree.posY, drawWidth, drawHeight);
    
    // Calculate fall rotation (0 to 90 degrees, falling to the right)
    const fallAngle = fallProgress * (Math.PI / 2); // 0 to 90 degrees
    
    // Draw realistic collapsing shadow BEFORE rotation (using actual tree shadow)
    // Skip shadow entirely when tree is nearly flat (>90% fallen)
    if (!skipShadow && fallProgress < 0.9) {
        ctx.save();
        
        // Shadow stays at tree base (doesn't rotate with tree)
        // Use the same shadow rendering as upright trees, but with vertical squashing
        
        // Shadow scale factors change as tree falls:
        // - Height: Starts at full height, collapses to almost flat
        const shadowHeightScale = 1 - (fallProgress * 0.95); // Collapses to 5% height when near flat
        
        // Shadow position (stays at base, shifts slightly as tree falls)
        const shadowOffsetX = drawWidth * 0.1 * fallProgress; // Shifts right as tree falls
        
        // Translate to tree base and apply vertical squash
        ctx.translate(tree.posX + shadowOffsetX, tree.posY);
        ctx.scale(1.0, shadowHeightScale); // Only squash vertically
        
        // Calculate aggressive fade-out: fades to 0 at 90% progress
        // At 0%: alpha = 1.0, At 50%: alpha = 0.5, At 90%: alpha = 0
        const shadowFadeProgress = Math.min(fallProgress / 0.9, 1.0); // Normalize to 0-1 by 90%
        const shadowAlpha = 0.35 * (1 - Math.pow(shadowFadeProgress, 1.5)); // Exponential fade-out
        
        // Use the actual tree shadow rendering (same as upright trees)
        drawDynamicGroundShadow({
            ctx,
            entityImage: img,
            entityCenterX: 0, // Already translated
            entityBaseY: 0,   // Already translated
            imageDrawWidth: drawWidth,
            imageDrawHeight: drawHeight,
            cycleProgress,
            maxStretchFactor: 1.8,
            minStretchFactor: 0.15,
            shadowBlur: 2,
            pivotYOffset: 25, // Positive offset moves anchor UP, aligning shadow with tree base
            // Aggressive fade-out - disappears completely by 90%
            baseShadowColor: '0, 0, 0', // Standard shadow color
            maxShadowAlpha: shadowAlpha
        });
        
        ctx.restore();
    }
    
    // Draw the falling tree (with rotation)
    ctx.save();
    
    // Translate to tree base position (pivot point)
    ctx.translate(tree.posX, tree.posY);
    
    // Rotate around the base
    ctx.rotate(fallAngle);
    
    // Tree image is drawn from its base (bottom-center)
    ctx.drawImage(
        img,
        -drawWidth / 2, // Center horizontally at pivot
        -drawHeight,    // Top of tree at pivot (tree grows upward from base)
        drawWidth,
        drawHeight
    );
    
    ctx.restore();
}
