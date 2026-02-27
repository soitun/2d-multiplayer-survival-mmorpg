/**
 * treeRenderingUtils - Tree sprite rendering, shake effects, and destruction.
 *
 * Renders trees (birch, hemlock, spruce, pine, willow, fruit trees, etc.) with
 * variant-specific sprites, vertex-based shake on hit, canopy shadow, and
 * falling/destruction effects. Used by renderingUtils in the Y-sorted loop.
 *
 * Responsibilities:
 * 1. SPRITE RENDERING: renderTree uses genericGroundRenderer. Variant maps to
 *    species (Siberian Birch, Mountain Hemlock, Sitka Spruce, etc.).
 *
 * 2. SHAKE: triggerTreeShakeOptimistic for immediate hit feedback. Vertex-based
 *    shake segments for tall trees. Syncs with server shake timestamps.
 *
 * 3. DESTRUCTION: renderTreeImpactEffects, renderTreeHitEffects for falling
 *    animation and debris. Time-of-day affects shadow intensity.
 *
 * 4. CANOPY SHADOW: Elliptical ambient occlusion under foliage.
 */

import { Tree, TimeOfDay } from '../../generated/types'; // Import generated types
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
// Fruit/Nut trees
import crabAppleTreeImage from '../../assets/doodads/crab_apple_tree.png';
import hazelnutTreeImage from '../../assets/doodads/hazelnut_tree.png';
import rowanberryTreeImage from '../../assets/doodads/rowanberry_tree.png';
import oliveTreeImage from '../../assets/doodads/olive_tree.png';
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

// Circular canopy shadow constants (ambient occlusion under foliage)
const CANOPY_SHADOW_BASE_RADIUS_X = 120; // Base horizontal radius for canopy shadow (much larger)
const CANOPY_SHADOW_BASE_RADIUS_Y = 55; // Base vertical radius (elliptical, flattened for ground plane)
const CANOPY_SHADOW_BASE_ALPHA = 0.5; // Base opacity - matches dynamic ground shadow maxShadowAlpha
const CANOPY_SHADOW_VERTICAL_OFFSET = -25; // Offset up from base to cover lower trunk area
const CANOPY_SHADOW_BLUR_RADIUS = 8; // Blur radius for soft shadow edges (similar to ground shadow)

// --- Client-side animation tracking for tree shakes ---
const clientTreeShakeStartTimes = new Map<string, number>(); // treeId -> client timestamp when shake started
const lastKnownServerTreeShakeTimes = new Map<string, number>(); // treeId -> last known server timestamp

/**
 * Trigger tree shake immediately (optimistic feedback) when player initiates a hit.
 * Call when the player swings an axe at a tree, before server response.
 */
export function triggerTreeShakeOptimistic(treeId: string, posX: number, posY: number): void {
  const now = Date.now();
  clientTreeShakeStartTimes.set(treeId, now);
  // Don't set lastKnownServerTimes here - let server update sync it. Prevents double shake
  // when server confirms (alreadyShaking blocks onNewShake, but we avoid timestamp confusion).
  triggerTreeHitEffect(treeId, posX, posY);
}

/**
 * Draws a circular/elliptical canopy shadow directly under the tree.
 * This creates an ambient occlusion effect that darkens the trunk area and ground
 * directly beneath the tree's foliage, adding visual depth independent of sun position.
 * 
 * NOTE: This matches the dynamic ground shadow approach - solid black fill with globalAlpha + blur.
 */
function drawCanopyShadow(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    centerX: number,
    baseY: number,
    treeTargetWidth: number,
    shakeOffsetX: number = 0,
    shakeOffsetY: number = 0,
    applyBlur: boolean = true
): void {
    // Scale shadow size based on tree size (larger trees = larger canopy shadows)
    const sizeScale = treeTargetWidth / TARGET_TREE_WIDTH_PX;
    const radiusX = CANOPY_SHADOW_BASE_RADIUS_X * sizeScale;
    const radiusY = CANOPY_SHADOW_BASE_RADIUS_Y * sizeScale;
    
    // Apply shake offsets to shadow position for consistency with tree movement
    const shadowX = centerX + shakeOffsetX;
    const shadowY = baseY + CANOPY_SHADOW_VERTICAL_OFFSET + shakeOffsetY;
    
    ctx.save();
    
    // Match dynamic ground shadow approach: blur filter + globalAlpha + solid black fill
    if (applyBlur) {
        ctx.filter = `blur(${CANOPY_SHADOW_BLUR_RADIUS}px)`;
    }
    
    // Use globalAlpha exactly like dynamic ground shadow (0.5)
    ctx.globalAlpha = CANOPY_SHADOW_BASE_ALPHA;
    
    // Solid black fill - the blur will create soft edges
    ctx.fillStyle = 'rgb(0, 0, 0)';
    
    // Draw ellipse for ground-plane perspective
    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

// Constants for canopy mask (used to cut out tree canopy regions from shadows)
// These define an elliptical region representing the visual canopy area
const CANOPY_MASK_RADIUS_X_FACTOR = 0.35; // Horizontal radius as fraction of tree width
const CANOPY_MASK_RADIUS_Y_FACTOR = 0.45; // Vertical radius as fraction of tree height
const CANOPY_MASK_CENTER_Y_OFFSET_FACTOR = 0.35; // How far up from base (as fraction of height) the canopy center is

// Offscreen canvas for shadow compositing (reused to avoid allocation)
let shadowOffscreenCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let shadowOffscreenCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

/**
 * Gets or creates the offscreen canvas for shadow compositing.
 * The canvas is reused across frames to avoid allocation overhead.
 */
function getShadowOffscreenCanvas(width: number, height: number): { canvas: OffscreenCanvas | HTMLCanvasElement, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } | null {
    // Create canvas if needed or resize if dimensions changed
    if (!shadowOffscreenCanvas || shadowOffscreenCanvas.width !== width || shadowOffscreenCanvas.height !== height) {
        // Release GPU memory from old canvas before creating new one
        if (shadowOffscreenCanvas) { shadowOffscreenCanvas.width = 0; shadowOffscreenCanvas.height = 0; }
        try {
            // Prefer OffscreenCanvas for better performance
            shadowOffscreenCanvas = new OffscreenCanvas(width, height);
        } catch {
            // Fallback to regular canvas if OffscreenCanvas not supported
            shadowOffscreenCanvas = document.createElement('canvas');
            shadowOffscreenCanvas.width = width;
            shadowOffscreenCanvas.height = height;
        }
        shadowOffscreenCtx = shadowOffscreenCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    }
    
    if (!shadowOffscreenCtx) return null;
    
    return { canvas: shadowOffscreenCanvas, ctx: shadowOffscreenCtx };
}

/**
 * Cuts out a tree's canopy region from the shadow canvas.
 * This prevents shadows from trees behind from appearing on this tree's canopy.
 */
function cutOutCanopyRegion(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    tree: Tree,
    shakeOffsetX: number = 0,
    shakeOffsetY: number = 0
): void {
    const { imageSource, targetWidth } = getCachedTreeTypeInfo(tree);
    const img = imageManager.getImage(imageSource);
    
    if (!img || img.naturalWidth === 0) return;
    
    const scaleFactor = targetWidth / img.naturalWidth;
    const treeHeight = img.naturalHeight * scaleFactor;
    
    // Calculate canopy ellipse dimensions based on tree size
    const canopyRadiusX = targetWidth * CANOPY_MASK_RADIUS_X_FACTOR;
    const canopyRadiusY = treeHeight * CANOPY_MASK_RADIUS_Y_FACTOR;
    
    // Canopy center is above the tree base (posY)
    // The tree sprite is drawn with bottom at posY, extending upward
    const canopyCenterX = tree.posX + shakeOffsetX;
    const canopyCenterY = tree.posY - (treeHeight * CANOPY_MASK_CENTER_Y_OFFSET_FACTOR) + shakeOffsetY;
    
    // Use destination-out to cut this region from whatever was drawn before
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    
    ctx.beginPath();
    ctx.ellipse(canopyCenterX, canopyCenterY, canopyRadiusX, canopyRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

/**
 * Renders canopy shadow overlays for all visible trees.
 * 
 * This creates an ambient occlusion/shade effect under tree canopies that:
 * - Appears on ALL entities (players, ground, items) under tree canopies
 * - Uses semi-transparent shadows (0.5 alpha) so underlying content remains visible
 * - Creates natural overlapping shade in dense forests
 * 
 * The shadows are rendered AFTER all Y-sorted entities, so they appear on top of
 * everything including players and the ground. The semi-transparency ensures
 * tree canopies remain visible through the shadow overlay.
 * 
 * NOTE: Canopy shadows are NOT rendered during Night, Midnight, or TwilightMorning
 * since there is no direct sunlight to cast shadows through the canopy.
 * 
 * NOTE: Canopy shadows are also skipped when treeShadowsEnabled is false (visual settings).
 * 
 * @param ctx - Canvas rendering context
 * @param trees - Array of visible trees to render shadows for
 * @param nowMs - Current timestamp for shake animation sync
 * @param isTreeFalling - Optional function to check if a tree is currently falling
 * @param timeOfDay - Current time of day (shadows are skipped at night)
 * @param treeShadowsEnabled - Visual setting to enable/disable tree shadows (default: true)
 */
export function renderTreeCanopyShadowsOverlay(
    ctx: CanvasRenderingContext2D,
    trees: Tree[],
    nowMs: number,
    isTreeFalling?: (treeId: string) => boolean,
    timeOfDay?: TimeOfDay,
    treeShadowsEnabled: boolean = true
): void {
    // Skip canopy shadows entirely if disabled in visual settings
    if (!treeShadowsEnabled) return;
    
    if (!trees || trees.length === 0) return;
    
    // Skip canopy shadows during nighttime - no direct sunlight to cast shadows
    // Night, Midnight, and TwilightMorning (pre-dawn darkness) have no canopy shadows
    if (timeOfDay) {
        const tag = timeOfDay.tag;
        if (tag === 'Night' || tag === 'Midnight' || tag === 'TwilightMorning') {
            return;
        }
    }
    
    // Get the main canvas dimensions
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    
    // Get or create offscreen canvas for shadow compositing
    const offscreen = getShadowOffscreenCanvas(canvasWidth, canvasHeight);
    if (!offscreen) {
        // Fallback: render shadows without tree-to-tree Y-sorting (simple approach)
        for (const tree of trees) {
            const treeId = tree.id.toString();
            if (tree.health === 0 && !tree.respawnAt) continue;
            const isFalling = isTreeFalling ? isTreeFalling(treeId) : false;
            if (isFalling) continue;
            const { targetWidth } = getCachedTreeTypeInfo(tree);
            drawCanopyShadow(ctx, tree.posX, tree.posY, targetWidth, 0, 0, true);
        }
        return;
    }
    
    const { ctx: offCtx } = offscreen;
    
    // Clear the offscreen canvas
    offCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Apply the same transform as the main canvas (camera offset)
    offCtx.save();
    offCtx.setTransform(ctx.getTransform());
    
    // Draw all tree canopy shadows without any masking/cutouts
    // The shadows are semi-transparent (0.5 alpha) so tree canopies remain visible
    // This creates a natural overlapping shade effect in dense forests
    for (const tree of trees) {
        const treeId = tree.id.toString();
        
        // Skip trees with no health (destroyed) unless they have respawn time
        if (tree.health === 0 && !tree.respawnAt) continue;
        
        // Skip falling trees - canopy is no longer overhead when the tree is falling
        const isFalling = isTreeFalling ? isTreeFalling(treeId) : false;
        if (isFalling) continue;
        
        const { targetWidth } = getCachedTreeTypeInfo(tree);
        
        // Calculate shake offsets for shadow synchronization
        let shakeOffsetX = 0;
        let shakeOffsetY = 0;
        
        if (tree.lastHitTime) {
            const clientStartTime = clientTreeShakeStartTimes.get(treeId);
            if (clientStartTime) {
                const elapsedSinceShake = nowMs - clientStartTime;
                
                if (elapsedSinceShake >= 0 && elapsedSinceShake < SHAKE_DURATION_MS) {
                    const shakeFactor = 1.0 - (elapsedSinceShake / SHAKE_DURATION_MS);
                    const baseShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                    
                    // Generate smooth shake direction
                    const timePhase = elapsedSinceShake / 50;
                    const treeSeed = treeId.charCodeAt(0) % 100;
                    
                    shakeOffsetX = Math.sin(timePhase + treeSeed) * baseShakeIntensity * 0.3;
                    shakeOffsetY = Math.cos(timePhase + treeSeed) * baseShakeIntensity * 0.15;
                }
            }
        }
        
        // Draw this tree's canopy shadow
        // No cutouts needed - shadows naturally overlap creating realistic dappled shade
        drawCanopyShadow(offCtx, tree.posX, tree.posY, targetWidth, shakeOffsetX, shakeOffsetY, true);
    }
    
    offCtx.restore();
    
    // Composite the shadow layer onto the main canvas
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for direct pixel copy
    ctx.drawImage(offscreen.canvas, 0, 0);
    ctx.restore();
}

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

// Pre-computed constants for tree effects
const TWO_PI = Math.PI * 2;

// Pre-allocated array for keys to remove (avoids allocation each frame)
const treeHitEffectsToRemove: string[] = [];

/**
 * Render tree hit effects
 * OPTIMIZED: Traditional loops, pre-allocated removal array, reduced save/restore
 */
export function renderTreeHitEffects(ctx: CanvasRenderingContext2D, nowMs: number): void {
    if (activeTreeHitEffects.size === 0) return;
    
    treeHitEffectsToRemove.length = 0;
    
    activeTreeHitEffects.forEach((effect, effectKey) => {
        const elapsed = nowMs - effect.startTime;
        const progress = elapsed / effect.duration;
        
        if (progress >= 1) {
            treeHitEffectsToRemove.push(effectKey);
            return;
        }
        
        // Pre-compute fade values
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
            
            // Leaves have more air resistance
            if (particle.type === 'leaf') {
                particle.vx *= 0.95;
                particle.vy *= 0.98;
            }
            
            // Fade out
            const particleAlpha = particle.alpha * fadeMultiplier;
            if (particleAlpha < 0.01) continue;
            
            ctx.save();
            ctx.translate(particle.x, particle.y);
            ctx.rotate(particle.rotation);
            ctx.globalAlpha = particleAlpha;
            ctx.fillStyle = particle.color;
            
            const size = particle.size;
            const halfSize = size * 0.5;
            const thirdSize = size / 3;
            const quarterSize = size * 0.25;
            const sixthSize = size / 6;
            
            switch (particle.type) {
                case 'bark':
                    ctx.beginPath();
                    ctx.moveTo(-halfSize, -thirdSize);
                    ctx.lineTo(thirdSize, -halfSize);
                    ctx.lineTo(halfSize, quarterSize);
                    ctx.lineTo(-quarterSize, halfSize);
                    ctx.closePath();
                    ctx.fill();
                    break;
                    
                case 'splinter':
                    ctx.fillRect(-sixthSize, -size, thirdSize, size * 2);
                    break;
                    
                case 'leaf':
                    ctx.beginPath();
                    ctx.ellipse(0, 0, halfSize, size, 0, 0, TWO_PI);
                    ctx.fill();
                    break;
            }
            
            ctx.restore();
        }
    });
    
    // Delete completed effects
    for (let i = 0; i < treeHitEffectsToRemove.length; i++) {
        activeTreeHitEffects.delete(treeHitEffectsToRemove[i]);
    }
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

// Pre-allocated array for impact effects removal
const treeImpactEffectsToRemove: string[] = [];

/**
 * Render tree impact debris effect - AAA pixel art quality
 * OPTIMIZED: Traditional loops, pre-allocated arrays, reduced ctx state changes
 */
export function renderTreeImpactEffects(
    ctx: CanvasRenderingContext2D,
    nowMs: number
): void {
    if (activeTreeImpacts.size === 0) return;
    
    treeImpactEffectsToRemove.length = 0;
    
    activeTreeImpacts.forEach((effect, treeId) => {
        const elapsed = nowMs - effect.startTime;
        const progress = elapsed / effect.duration;
        
        if (progress >= 1) {
            treeImpactEffectsToRemove.push(treeId);
            return;
        }
        
        const groundY = effect.y + 5;
        
        // === PHASE 1: DUST CLOUD (first 80% of animation) ===
        if (progress < 0.8) {
            const dustProgress = progress / 0.8;
            const dustFade = 1 - Math.pow(dustProgress, 0.5);
            const dustAlphaMultiplier = dustFade * (1 - dustProgress * 0.3);
            
            const dustParticles = effect.dust;
            const dustCount = dustParticles.length;
            
            for (let i = 0; i < dustCount; i++) {
                const dust = dustParticles[i];
                
                // Update dust position
                dust.x += dust.vx;
                dust.y += dust.vy;
                dust.size += dust.expandRate;
                dust.vy *= 0.98;
                
                const dustAlpha = dust.alpha * dustAlphaMultiplier;
                if (dustAlpha > 0.01) {
                    const gradient = ctx.createRadialGradient(
                        dust.x, dust.y, 0,
                        dust.x, dust.y, dust.size
                    );
                    gradient.addColorStop(0, `rgba(139, 119, 101, ${dustAlpha * 0.6})`);
                    gradient.addColorStop(0.4, `rgba(110, 90, 70, ${dustAlpha * 0.4})`);
                    gradient.addColorStop(0.7, `rgba(80, 65, 50, ${dustAlpha * 0.2})`);
                    gradient.addColorStop(1, 'rgba(60, 50, 40, 0)');
                    
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(dust.x, dust.y, dust.size, 0, TWO_PI);
                    ctx.fill();
                }
            }
        }
        
        // === PHASE 2: DEBRIS PARTICLES (full animation) ===
        const debrisFade = progress > 0.7 ? 1 - ((progress - 0.7) / 0.3) : 1;
        
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
                    particle.vy = -particle.vy * 0.3;
                    particle.vx *= 0.7;
                    particle.bounceCount++;
                    particle.rotationSpeed *= 0.5;
                } else {
                    particle.y = groundY;
                    particle.vy = 0;
                    particle.vx *= 0.95;
                    particle.rotationSpeed *= 0.9;
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
            
            switch (particle.type) {
                case 'twig':
                    ctx.fillRect(-size * 1.5, -size * 0.3, size * 3, size * 0.6);
                    ctx.fillStyle = BARK_COLORS[0];
                    ctx.fillRect(-size, -size * 0.15, size * 2, size * 0.3);
                    break;
                    
                case 'leaf':
                    ctx.beginPath();
                    ctx.moveTo(0, -size);
                    ctx.lineTo(size * 0.6, 0);
                    ctx.lineTo(0, size);
                    ctx.lineTo(-size * 0.6, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = LEAF_COLORS[3];
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(0, -size * 0.7);
                    ctx.lineTo(0, size * 0.7);
                    ctx.stroke();
                    break;
                    
                case 'dirt':
                    ctx.fillRect(-halfSize, -halfSize, size, size);
                    break;
                    
                case 'bark':
                    ctx.beginPath();
                    ctx.moveTo(-halfSize, -thirdSize);
                    ctx.lineTo(thirdSize, -halfSize);
                    ctx.lineTo(halfSize, size * 0.25);
                    ctx.lineTo(-size * 0.25, halfSize);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = BARK_COLORS[2];
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(-size * 0.3, 0);
                    ctx.lineTo(size * 0.3, 0);
                    ctx.stroke();
                    break;
            }
            
            ctx.restore();
        }
        
        // === PHASE 3: GROUND IMPACT RING (first 20%) ===
        if (progress < 0.2) {
            const ringProgress = progress / 0.2;
            const impactX = effect.x + effect.treeHeight * 0.9;
            const ringRadius = 20 + ringProgress * 60;
            const ringAlpha = 0.4 * (1 - ringProgress);
            
            ctx.strokeStyle = `rgba(139, 119, 101, ${ringAlpha})`;
            ctx.lineWidth = 3 - ringProgress * 2;
            ctx.beginPath();
            ctx.ellipse(impactX, effect.y, ringRadius, ringRadius * 0.3, 0, 0, TWO_PI);
            ctx.stroke();
            
            const innerRadius = ringRadius * 0.5;
            ctx.strokeStyle = `rgba(100, 85, 70, ${ringAlpha * 0.7})`;
            ctx.lineWidth = 2 - ringProgress * 1.5;
            ctx.beginPath();
            ctx.ellipse(impactX, effect.y, innerRadius, innerRadius * 0.3, 0, 0, TWO_PI);
            ctx.stroke();
        }
    });
    
    // Clean up finished effects
    for (let i = 0; i < treeImpactEffectsToRemove.length; i++) {
        activeTreeImpacts.delete(treeImpactEffectsToRemove[i]);
    }
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
            // Fruit/Nut trees (Crab Apple, Hazelnut, Rowanberry, Olive - all have falling animation)
            case 'CrabAppleTree':
                imageSource = crabAppleTreeImage;
                targetWidth = 300; // Small fruit tree
                break;
            case 'HazelnutTree':
                imageSource = hazelnutTreeImage;
                targetWidth = 300; // Small shrub-tree for nuts
                break;
            case 'RowanberryTree':
                imageSource = rowanberryTreeImage;
                targetWidth = 340; // Large mountain ash tree
                break;
            case 'OliveTree':
                imageSource = oliveTreeImage;
                targetWidth = 320; // GMO olive cultivar - compact fruit tree
                break;
            default:
                // Fallback for any unknown tree type (ensures falling animation still works)
                if (process.env.NODE_ENV === 'development' && treeTypeKey) {
                    console.warn(`[TreeRendering] Unknown tree type "${treeTypeKey}" - using Sitka Spruce fallback`);
                }
                imageSource = sitkaSpruceImage;
                targetWidth = TARGET_TREE_WIDTH_PX;
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
            () => triggerTreeHitEffect(treeId, entity.posX, entity.posY),
            { suppressRestartIfRecentClientShake: true }
        );

        // NOTE: Canopy shadow is now rendered as an OVERLAY pass after all Y-sorted entities
        // This allows it to appear ON TOP of trees and players for a realistic shade effect.
        // See renderTreeCanopyShadowsOverlay() which is called in GameCanvas after entity rendering.

        // NOON FIX: At noon, shadows appear too far below (detached from entity)
        // because the shadow is very short but still starts from the base pivot.
        // Add extra upward offset at noon to keep shadow visually attached to entity base.
        let noonExtraOffset = 0;
        if (cycleProgress >= 0.35 && cycleProgress < 0.55) {
            const noonT = (cycleProgress - 0.35) / 0.20;
            const noonFactor = 1.0 - Math.abs(noonT - 0.5) * 2.0;
            noonExtraOffset = noonFactor * imageDrawHeight * 0.25; // Trees need moderate offset
        }

        // Draw dynamic directional ground shadow (sun-based)
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
            pivotYOffset: 25 + noonExtraOffset, // Positive offset moves anchor UP, aligning shadow with tree base
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

        const treeId = entity.id.toString();
        const clientStartTime = clientTreeShakeStartTimes.get(treeId);
        // Support BOTH server lastHitTime AND optimistic client shake (triggered before server responds)
        const hasActiveClientShake = clientStartTime !== undefined && (nowMs - clientStartTime < SHAKE_DURATION_MS);
        const hasServerHit = !!entity.lastHitTime;

        if (hasServerHit || hasActiveClientShake) {
            // NOTE: Hit effect is triggered in drawCustomGroundShadow via calculateShakeOffsets callback
            // This block handles the shake animation for the tree sprite
            // Use clientStartTime (from optimistic trigger or from calculateShakeOffsets) for smooth animation
            const effectiveStartTime = clientStartTime ?? (entity.lastHitTime ? Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n) : nowMs);
            const elapsedSinceShake = nowMs - effectiveStartTime;

            if (elapsedSinceShake >= 0 && elapsedSinceShake < SHAKE_DURATION_MS) {
                shakeFactor = 1.0 - (elapsedSinceShake / SHAKE_DURATION_MS);
                baseShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;

                // Generate smooth, time-based shake direction using sine waves
                const timePhase = elapsedSinceShake / 50; // Faster oscillation (50ms per cycle)
                const treeSeed = treeId.charCodeAt(0) % 100; // Unique phase offset per tree

                shakeDirectionX = Math.sin(timePhase + treeSeed);
                shakeDirectionY = Math.cos(timePhase + treeSeed) * 0.5; // Less vertical movement
            }
        } else {
            // Clean up tracking when tree is not being hit and no active shake
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
// Fruit/Nut trees
imageManager.preloadImage(crabAppleTreeImage);
imageManager.preloadImage(hazelnutTreeImage);
imageManager.preloadImage(rowanberryTreeImage);
imageManager.preloadImage(oliveTreeImage);

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
    
    // NOTE: Canopy shadows are rendered as a separate overlay pass via renderTreeCanopyShadowsOverlay()
    // This allows shadows to appear ON TOP of players (shade effect) while respecting tree Y-sorting
    // (shadows from trees behind don't appear on tree canopies in front)
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
    
    // Draw shadows BEFORE rotation
    // Skip shadow entirely when tree is nearly flat (>90% fallen)
    // NOTE: Canopy shadow overlay is handled separately in renderTreeCanopyShadowsOverlay
    // and is skipped for falling trees since the canopy is no longer overhead
    if (!skipShadow && fallProgress < 0.9) {
        // Calculate aggressive fade-out: fades to 0 at 90% progress
        const shadowFadeProgress = Math.min(fallProgress / 0.9, 1.0);
        const shadowAlpha = 0.35 * (1 - Math.pow(shadowFadeProgress, 1.5));
        
        // Draw dynamic directional shadow (squashed as tree falls)
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
