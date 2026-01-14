import { BrothPot } from '../../generated';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { drawDynamicGroundShadow } from './shadowUtils';
import { imageManager } from './imageManager';

// Import the field cauldron icon
import fieldCauldronIcon from '../../assets/items/field_cauldron.png';

// --- Constants ---
export const BROTH_POT_WIDTH = 80;
export const BROTH_POT_HEIGHT = 80;
export const BROTH_POT_RENDER_Y_OFFSET = 0; // No offset - sits directly on campfire

// Broth pot interaction distance (player <-> broth pot)
export const PLAYER_BROTH_POT_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0; // Same as campfire

// ============================================================================
// BREWING PARTICLE SYSTEM - AAA Pixel Art Quality Bubbles & Steam
// ============================================================================

// --- Bubble Particle Interface ---
interface BubbleParticle {
    x: number;
    y: number;
    vx: number; // Horizontal drift velocity
    vy: number; // Vertical rise velocity (negative = up)
    size: number;
    opacity: number;
    wobblePhase: number; // For sinusoidal wobble
    wobbleSpeed: number;
    wobbleAmp: number;
    life: number; // 0 to 1, where 1 is just spawned
    maxLifeMs: number;
    color: { r: number; g: number; b: number }; // Tinted based on brew effect
}

// --- Steam Particle Interface ---
interface SteamParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
    life: number;
    maxLifeMs: number;
    rotation: number;
    rotationSpeed: number;
}

// Store particles per broth pot
const brothPotBubbles = new Map<string, BubbleParticle[]>();
const brothPotSteam = new Map<string, SteamParticle[]>();
const brothPotLastFrameTime = new Map<string, number>();
const brothPotLastBubbleSpawn = new Map<string, number>();
const brothPotLastSteamSpawn = new Map<string, number>();

// ============================================================================
// EFFECT TYPE REGISTRY - Maps pot ID to effect type for bubble coloring
// ============================================================================

// Registry for effect types - call registerBrewEffect when a brew starts
const brothPotEffectRegistry = new Map<string, { effectType: string | null; category: string | null }>();

/**
 * Register the effect type for a broth pot (call from ExternalContainerUI when recipe is known)
 */
export function registerBrewEffect(potId: number | string, effectType: string | null | undefined, category: string | null | undefined): void {
    brothPotEffectRegistry.set(potId.toString(), {
        effectType: effectType || null,
        category: category || null,
    });
}

/**
 * Clear the effect registry entry for a broth pot (call when cooking ends)
 */
export function clearBrewEffect(potId: number | string): void {
    brothPotEffectRegistry.delete(potId.toString());
}

// --- Bubble Configuration (AAA pixel art quality) ---
const BUBBLE_CONFIG = {
    MAX_BUBBLES: 12,
    SPAWN_INTERVAL_MIN: 80,   // ms between spawns (fast bubbling)
    SPAWN_INTERVAL_MAX: 200,
    SPAWN_RADIUS: 18,         // Spawn radius from pot center (liquid surface)
    MIN_SIZE: 2,
    MAX_SIZE: 6,
    RISE_SPEED_MIN: -35,      // pixels/second (negative = up)
    RISE_SPEED_MAX: -60,
    HORIZONTAL_DRIFT: 8,
    WOBBLE_AMP_MIN: 1.5,
    WOBBLE_AMP_MAX: 4,
    WOBBLE_SPEED_MIN: 3,
    WOBBLE_SPEED_MAX: 6,
    LIFETIME_MIN: 600,        // ms
    LIFETIME_MAX: 1200,
    // Default bubble color (warm golden for healing broths)
    DEFAULT_COLOR: { r: 255, g: 220, b: 160 },
};

// --- Steam Configuration (AAA pixel art quality) ---
const STEAM_CONFIG = {
    MAX_PARTICLES: 8,
    SPAWN_INTERVAL_MIN: 200,
    SPAWN_INTERVAL_MAX: 400,
    SPAWN_RADIUS: 12,
    MIN_SIZE: 6,
    MAX_SIZE: 18,
    RISE_SPEED_MIN: -20,
    RISE_SPEED_MAX: -45,
    HORIZONTAL_DRIFT: 15,
    LIFETIME_MIN: 800,
    LIFETIME_MAX: 1500,
    ROTATION_SPEED_MIN: -0.5,
    ROTATION_SPEED_MAX: 0.5,
};

// ============================================================================
// EFFECT-BASED BUBBLE COLORS - AAA Visual Feedback
// ============================================================================

// Color definitions based on effect type (priority) and category (fallback)
const EFFECT_COLORS: Record<string, { r: number; g: number; b: number }> = {
    // Effect Types - Primary coloring based on actual gameplay effect
    'Poisoned':          { r: 120, g: 255, b: 80 },   // Toxic green - danger!
    'FoodPoisoning':     { r: 160, g: 220, b: 80 },   // Sickly yellow-green
    'HealthRegen':       { r: 255, g: 100, b: 120 },  // Soft pink/red - healing
    'Intoxicated':       { r: 255, g: 180, b: 60 },   // Amber/beer - alcoholic
    'StaminaBoost':      { r: 255, g: 220, b: 80 },   // Bright yellow - energy!
    'SpeedBoost':        { r: 80, g: 255, b: 200 },   // Cyan/teal - swift
    'ColdResistance':    { r: 120, g: 200, b: 255 },  // Icy blue - cold protection
    'WarmthBoost':       { r: 255, g: 160, b: 80 },   // Warm orange - heat
    'NightVision':       { r: 180, g: 255, b: 120 },  // Bright lime green - see in dark
    'PoisonResistance':  { r: 200, g: 180, b: 255 },  // Soft purple - antidote
    'FireResistance':    { r: 255, g: 120, b: 60 },   // Deep orange/red - fire protection
};

const CATEGORY_COLORS: Record<string, { r: number; g: number; b: number }> = {
    // Category fallbacks when effect type is unknown
    'poison':               { r: 120, g: 255, b: 80 },   // Toxic green
    'healing_broth':        { r: 255, g: 200, b: 120 },  // Warm golden
    'medicinal_tea':        { r: 200, g: 255, b: 180 },  // Herbal green
    'alcoholic':            { r: 255, g: 180, b: 60 },   // Amber
    'performance_enhancer': { r: 80, g: 255, b: 220 },   // Cyan energy
    'psychoactive':         { r: 180, g: 100, b: 255 },  // Purple mystical
    'utility_brew':         { r: 200, g: 200, b: 220 },  // Neutral silver
    'nutritional_drink':    { r: 255, g: 220, b: 160 },  // Creamy
    'maritime_specialty':   { r: 100, g: 180, b: 255 },  // Ocean blue
    'cooking_base':         { r: 255, g: 220, b: 180 },  // Light tan
    'technological':        { r: 150, g: 255, b: 200 },  // Tech cyan
};

/**
 * Get bubble color based on effect type (priority) or category (fallback)
 */
function getBubbleColor(potId: string, recipeName: string | null | undefined): { r: number; g: number; b: number } {
    // First check the effect registry for accurate effect-based coloring
    const registered = brothPotEffectRegistry.get(potId);
    if (registered) {
        // Effect type takes priority - most accurate signal to player
        if (registered.effectType && EFFECT_COLORS[registered.effectType]) {
            return EFFECT_COLORS[registered.effectType];
        }
        // Fall back to category
        if (registered.category && CATEGORY_COLORS[registered.category]) {
            return CATEGORY_COLORS[registered.category];
        }
    }
    
    // Final fallback - try to guess from recipe name
    if (recipeName) {
        const name = recipeName.toLowerCase();
        
        // Poison brews - sickly green bubbles
        if (name.includes('poison') || name.includes('toxin') || name.includes('venom')) {
            return { r: 120, g: 255, b: 80 };
        }
        // Healing brews - warm golden bubbles
        if (name.includes('heal') || name.includes('health') || name.includes('medicinal')) {
            return { r: 255, g: 200, b: 120 };
        }
        // Alcoholic - amber/beer colored
        if (name.includes('ale') || name.includes('wine') || name.includes('spirit') || name.includes('alcohol') || name.includes('grog')) {
            return { r: 255, g: 180, b: 60 };
        }
        // Cold resistance - icy blue
        if (name.includes('cold') || name.includes('frost') || name.includes('ice') || name.includes('chill')) {
            return { r: 120, g: 200, b: 255 };
        }
        // Fire/warmth - orange/red
        if (name.includes('fire') || name.includes('flame') || name.includes('warm') || name.includes('heat')) {
            return { r: 255, g: 160, b: 80 };
        }
        // Speed/performance - cyan/electric
        if (name.includes('speed') || name.includes('swift') || name.includes('energy') || name.includes('stamina')) {
            return { r: 80, g: 255, b: 220 };
        }
        // Psychoactive - purple mystical
        if (name.includes('psycho') || name.includes('vision') || name.includes('dream') || name.includes('halluci')) {
            return { r: 180, g: 100, b: 255 };
        }
        // Night vision - lime green
        if (name.includes('night') || name.includes('sight') || name.includes('vision')) {
            return { r: 180, g: 255, b: 120 };
        }
    }
    
    return BUBBLE_CONFIG.DEFAULT_COLOR;
}

/**
 * Spawns a new bubble particle with effect-based coloring
 */
function spawnBubble(potX: number, potY: number, potId: string, recipeName: string | null | undefined): BubbleParticle {
    const color = getBubbleColor(potId, recipeName);
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * BUBBLE_CONFIG.SPAWN_RADIUS;
    
    return {
        x: potX + Math.cos(angle) * distance,
        y: potY - 10 + Math.random() * 6, // Spawn near liquid surface (slightly above pot center)
        vx: (Math.random() - 0.5) * BUBBLE_CONFIG.HORIZONTAL_DRIFT,
        vy: BUBBLE_CONFIG.RISE_SPEED_MIN + Math.random() * (BUBBLE_CONFIG.RISE_SPEED_MAX - BUBBLE_CONFIG.RISE_SPEED_MIN),
        size: BUBBLE_CONFIG.MIN_SIZE + Math.random() * (BUBBLE_CONFIG.MAX_SIZE - BUBBLE_CONFIG.MIN_SIZE),
        opacity: 0.6 + Math.random() * 0.4,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed: BUBBLE_CONFIG.WOBBLE_SPEED_MIN + Math.random() * (BUBBLE_CONFIG.WOBBLE_SPEED_MAX - BUBBLE_CONFIG.WOBBLE_SPEED_MIN),
        wobbleAmp: BUBBLE_CONFIG.WOBBLE_AMP_MIN + Math.random() * (BUBBLE_CONFIG.WOBBLE_AMP_MAX - BUBBLE_CONFIG.WOBBLE_AMP_MIN),
        life: 1.0,
        maxLifeMs: BUBBLE_CONFIG.LIFETIME_MIN + Math.random() * (BUBBLE_CONFIG.LIFETIME_MAX - BUBBLE_CONFIG.LIFETIME_MIN),
        color,
    };
}

/**
 * Spawns a new steam particle
 */
function spawnSteam(potX: number, potY: number): SteamParticle {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * STEAM_CONFIG.SPAWN_RADIUS;
    
    return {
        x: potX + Math.cos(angle) * distance,
        y: potY - 15, // Spawn above liquid surface
        vx: (Math.random() - 0.5) * STEAM_CONFIG.HORIZONTAL_DRIFT,
        vy: STEAM_CONFIG.RISE_SPEED_MIN + Math.random() * (STEAM_CONFIG.RISE_SPEED_MAX - STEAM_CONFIG.RISE_SPEED_MIN),
        size: STEAM_CONFIG.MIN_SIZE + Math.random() * (STEAM_CONFIG.MAX_SIZE - STEAM_CONFIG.MIN_SIZE),
        opacity: 0.4 + Math.random() * 0.3,
        life: 1.0,
        maxLifeMs: STEAM_CONFIG.LIFETIME_MIN + Math.random() * (STEAM_CONFIG.LIFETIME_MAX - STEAM_CONFIG.LIFETIME_MIN),
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: STEAM_CONFIG.ROTATION_SPEED_MIN + Math.random() * (STEAM_CONFIG.ROTATION_SPEED_MAX - STEAM_CONFIG.ROTATION_SPEED_MIN),
    };
}

/**
 * Updates brewing particles for a broth pot
 */
function updateBrewingParticles(
    potId: string,
    potX: number,
    potY: number,
    isCooking: boolean,
    recipeName: string | null | undefined,
    nowMs: number
): void {
    // Initialize storage if needed
    if (!brothPotBubbles.has(potId)) {
        brothPotBubbles.set(potId, []);
        brothPotSteam.set(potId, []);
        brothPotLastBubbleSpawn.set(potId, nowMs);
        brothPotLastSteamSpawn.set(potId, nowMs);
        brothPotLastFrameTime.set(potId, nowMs);
    }
    
    const bubbles = brothPotBubbles.get(potId)!;
    const steam = brothPotSteam.get(potId)!;
    const lastFrameTime = brothPotLastFrameTime.get(potId) || nowMs;
    const deltaMs = Math.min(nowMs - lastFrameTime, 100); // Cap delta to prevent huge jumps
    const deltaSec = deltaMs / 1000;
    brothPotLastFrameTime.set(potId, nowMs);
    
    // Only spawn new particles when cooking
    if (isCooking) {
        // Spawn bubbles with effect-based coloring
        const lastBubbleSpawn = brothPotLastBubbleSpawn.get(potId) || 0;
        const bubbleInterval = BUBBLE_CONFIG.SPAWN_INTERVAL_MIN + 
            Math.random() * (BUBBLE_CONFIG.SPAWN_INTERVAL_MAX - BUBBLE_CONFIG.SPAWN_INTERVAL_MIN);
        
        if (nowMs - lastBubbleSpawn >= bubbleInterval && bubbles.length < BUBBLE_CONFIG.MAX_BUBBLES) {
            bubbles.push(spawnBubble(potX, potY, potId, recipeName));
            brothPotLastBubbleSpawn.set(potId, nowMs);
        }
        
        // Spawn steam
        const lastSteamSpawn = brothPotLastSteamSpawn.get(potId) || 0;
        const steamInterval = STEAM_CONFIG.SPAWN_INTERVAL_MIN + 
            Math.random() * (STEAM_CONFIG.SPAWN_INTERVAL_MAX - STEAM_CONFIG.SPAWN_INTERVAL_MIN);
        
        if (nowMs - lastSteamSpawn >= steamInterval && steam.length < STEAM_CONFIG.MAX_PARTICLES) {
            steam.push(spawnSteam(potX, potY));
            brothPotLastSteamSpawn.set(potId, nowMs);
        }
    }
    
    // Update existing bubbles
    for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        
        // Update wobble phase
        b.wobblePhase += b.wobbleSpeed * deltaSec;
        
        // Update position with wobble
        const wobbleOffset = Math.sin(b.wobblePhase) * b.wobbleAmp;
        b.x += (b.vx + wobbleOffset * 0.5) * deltaSec;
        b.y += b.vy * deltaSec;
        
        // Update life
        b.life -= deltaMs / b.maxLifeMs;
        
        // Remove dead bubbles
        if (b.life <= 0) {
            bubbles.splice(i, 1);
        }
    }
    
    // Update existing steam
    for (let i = steam.length - 1; i >= 0; i--) {
        const s = steam[i];
        
        // Update position - steam drifts and expands
        s.x += s.vx * deltaSec;
        s.y += s.vy * deltaSec;
        s.rotation += s.rotationSpeed * deltaSec;
        
        // Steam expands as it rises
        const ageFactor = 1 - s.life;
        s.size += 8 * deltaSec * (1 + ageFactor); // Expand faster as it ages
        
        // Update life
        s.life -= deltaMs / s.maxLifeMs;
        
        // Remove dead steam
        if (s.life <= 0) {
            steam.splice(i, 1);
        }
    }
}

/**
 * Renders brewing particles (bubbles + steam) - AAA pixel art quality
 */
function renderBrewingParticles(
    ctx: CanvasRenderingContext2D,
    potId: string,
    potY: number
): void {
    const bubbles = brothPotBubbles.get(potId);
    const steam = brothPotSteam.get(potId);
    
    if ((!bubbles || bubbles.length === 0) && (!steam || steam.length === 0)) return;
    
    ctx.save();
    
    // --- Render Steam First (behind bubbles) ---
    if (steam && steam.length > 0) {
        for (const s of steam) {
            // Fade in at birth, fade out at death
            let alpha = s.opacity * s.life;
            if (s.life > 0.85) {
                // Fade in during first 15% of life
                alpha *= (1 - s.life) / 0.15;
            }
            
            // Draw steam wisp using multiple overlapping circles for soft cloud effect
            ctx.globalAlpha = alpha * 0.25;
            ctx.fillStyle = 'rgb(240, 240, 245)';
            
            // Outer soft glow
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size * 1.2, 0, Math.PI * 2);
            ctx.fill();
            
            // Middle layer
            ctx.globalAlpha = alpha * 0.4;
            ctx.fillStyle = 'rgb(250, 250, 255)';
            ctx.beginPath();
            ctx.arc(s.x + s.size * 0.15, s.y - s.size * 0.1, s.size * 0.8, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner bright core
            ctx.globalAlpha = alpha * 0.5;
            ctx.fillStyle = 'rgb(255, 255, 255)';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // --- Render Bubbles (in front of steam) ---
    if (bubbles && bubbles.length > 0) {
        for (const b of bubbles) {
            // Only render bubbles above the pot rim
            if (b.y > potY - 5) continue;
            
            // Fade in quickly, fade out at death
            let alpha = b.opacity * b.life;
            if (b.life > 0.9) {
                // Quick fade in
                alpha *= (1 - b.life) / 0.1;
            }
            
            // Pop effect near death - bubble gets bigger then disappears
            let sizeMod = 1.0;
            if (b.life < 0.15) {
                sizeMod = 1.0 + (0.15 - b.life) * 3; // Expand before popping
            }
            
            const finalSize = b.size * sizeMod;
            
            // Draw bubble with pixel-art style highlight
            // Outer edge (darker, transparent)
            ctx.globalAlpha = alpha * 0.6;
            ctx.fillStyle = `rgb(${b.color.r * 0.7}, ${b.color.g * 0.7}, ${b.color.b * 0.7})`;
            ctx.beginPath();
            ctx.arc(b.x, b.y, finalSize, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner fill
            ctx.globalAlpha = alpha * 0.8;
            ctx.fillStyle = `rgb(${b.color.r}, ${b.color.g}, ${b.color.b})`;
            ctx.beginPath();
            ctx.arc(b.x, b.y, finalSize * 0.75, 0, Math.PI * 2);
            ctx.fill();
            
            // Highlight dot (pixel art style specular)
            ctx.globalAlpha = alpha * 0.9;
            ctx.fillStyle = 'rgb(255, 255, 255)';
            ctx.beginPath();
            ctx.arc(b.x - finalSize * 0.25, b.y - finalSize * 0.25, finalSize * 0.25, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    ctx.restore();
}

/**
 * Cleans up particle data for a broth pot that no longer exists
 */
export function cleanupBrothPotParticles(potId: string): void {
    brothPotBubbles.delete(potId);
    brothPotSteam.delete(potId);
    brothPotLastFrameTime.delete(potId);
    brothPotLastBubbleSpawn.delete(potId);
    brothPotLastSteamSpawn.delete(potId);
}

// --- Define Configuration ---
const brothPotConfig: GroundEntityConfig<BrothPot> = {
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null;
        }
        return fieldCauldronIcon;
    },

    getTargetDimensions: (_img, _entity) => ({
        width: BROTH_POT_WIDTH,
        height: BROTH_POT_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        // Center on campfire position
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight / 2, // Center vertically on campfire
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        if (!entity.isDestroyed) {
            drawDynamicGroundShadow({
                ctx,
                entityImage,
                entityCenterX: entityPosX,
                entityBaseY: entityPosY,
                imageDrawWidth,
                imageDrawHeight,
                cycleProgress,
                maxStretchFactor: 1.1,
                minStretchFactor: 0.2,
                shadowBlur: 3,
                pivotYOffset: 20,
            });
        }
    },

    applyEffects: undefined, // No special effects needed
};

/**
 * Renders a broth pot entity with brewing particle effects
 */
export function renderBrothPot(
    ctx: CanvasRenderingContext2D,
    brothPot: BrothPot,
    nowMs: number,
    cycleProgress: number,
    onlyDrawShadow?: boolean
) {
    const potId = brothPot.id.toString();
    
    // Update brewing particles (runs even when not cooking to allow particles to fade out)
    updateBrewingParticles(
        potId,
        brothPot.posX,
        brothPot.posY,
        brothPot.isCooking,
        brothPot.currentRecipeName,
        nowMs
    );
    
    // Render the base pot
    renderConfiguredGroundEntity({
        ctx,
        entity: brothPot,
        config: brothPotConfig,
        nowMs,
        entityPosX: brothPot.posX,
        entityPosY: brothPot.posY,
        cycleProgress,
        onlyDrawShadow,
    });
    
    // Render brewing particles on top (only when not shadow-only pass)
    if (!onlyDrawShadow) {
        renderBrewingParticles(ctx, potId, brothPot.posY);
    }
}

