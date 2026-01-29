import { drawDynamicGroundShadow } from './shadowUtils';
import { imageManager } from './imageManager';
import * as SpacetimeDB from '../../generated';
import { 
  getAnimalCollisionBounds,
  ANIMAL_COLLISION_SIZES 
} from '../animalCollisionUtils';

// Import breeding data types for age-based rendering
import { CaribouBreedingData } from '../../generated/caribou_breeding_data_type';
import { WalrusBreedingData } from '../../generated/walrus_breeding_data_type';
import { CaribouAgeStage } from '../../generated/caribou_age_stage_type';
import { WalrusAgeStage } from '../../generated/walrus_age_stage_type';

// Import sprite sheets (320x320, 3x3 grid, ~107x107 per frame)
// These are the PRIMARY source for all animals
import walrusWalkingSheet from '../../assets/walrus_walking.png';
import walrusWalkingAnimatedSheet from '../../assets/walrus_walking_release.png'; // NEW: 4x4 animated spritesheet
import foxWalkingSheet from '../../assets/fox_walking.png';
import foxWalkingAnimatedSheet from '../../assets/fox_walking_release.png'; // NEW: 4x4 animated spritesheet
import crabWalkingSheet from '../../assets/crab_walking.png';
import tundraWolfWalkingSheet from '../../assets/tundra_wolf_walking.png';
import tundraWolfWalkingAnimatedSheet from '../../assets/tundra_wolf_walking_release.png'; // NEW: 4x4 animated spritesheet
import cableViperWalkingSheet from '../../assets/cable_viper_walking.png';
import ternWalkingSheet from '../../assets/tern_walking.png';
import ternWalkingAnimatedSheet from '../../assets/tern_walking_release.png'; // NEW: 4x4 animated spritesheet
import crowWalkingSheet from '../../assets/crow_walking.png';
import voleWalkingSheet from '../../assets/vole_walking.png';
import wolverineWalkingSheet from '../../assets/wolverine_walking.png';
import wolverineWalkingAnimatedSheet from '../../assets/wolverine_walking_release.png'; // NEW: 4x4 animated spritesheet
import caribouWalkingAnimatedSheet from '../../assets/caribou_walking_release.png'; // NEW: 4x4 animated spritesheet
import salmonSharkWalkingAnimatedSheet from '../../assets/salmon_shark_walking_release.png'; // NEW: 4x4 animated spritesheet (aquatic predator)
// Flying sprite sheets for birds
import ternFlyingSheet from '../../assets/tern_flying.png';
import ternFlyingAnimatedSheet from '../../assets/tern_flying_release.png'; // NEW: 4x4 animated flying spritesheet
import crowFlyingSheet from '../../assets/crow_flying.png';
// Night hostile NPC sprite sheets
import shoreboundWalkingSheet from '../../assets/shorebound_walking.png';
import shardkinWalkingSheet from '../../assets/shardkin_walking.png';
import shardkinWalkingAnimatedSheet from '../../assets/shardkin_walking_release.png'; // NEW: 6x4 animated spritesheet
import drownedWatchWalkingSheet from '../../assets/drowned_watch_walking.png';


// --- Sprite Sheet Configuration ---
// All animal sprite sheets follow the same 3x3 grid format (320x320 sheet)
// Only 4 directional sprites are used (no walking animation frames):
//   [0,0]    [0,1]     [0,2]      <- Row 0: unused, DOWN facing (middle), unused
//   [1,0]    [1,1]     [1,2]      <- Row 1: LEFT facing, unused, RIGHT facing  
//   [2,0]    [2,1]     [2,2]      <- Row 2: unused, UP facing (middle), unused

const SPRITE_SHEET_CONFIG = {
    sheetWidth: 320,
    sheetHeight: 320,
    sheetCols: 3,
    sheetRows: 3,
    // Direction to sprite position mapping (row, col) - just 4 static sprites
    directionMap: {
        'down':  { row: 0, col: 1 },  // Top middle
        'up':    { row: 2, col: 1 },  // Bottom middle
        'left':  { row: 1, col: 2 },  // Middle right (sprite faces left)
        'right': { row: 1, col: 0 },  // Middle left (sprite faces right)
    } as Record<string, { row: number; col: number }>,
};

// Flying sprite sheet configuration - same 3x3 grid format, same 320x320 size
// Flying sprites should match the walking sprite sheet dimensions for consistent rendering
const FLYING_SPRITE_SHEET_CONFIG = {
    sheetWidth: 320,
    sheetHeight: 320,
    sheetCols: 3,
    sheetRows: 3,
    // Same direction mapping as walking sprites
    directionMap: SPRITE_SHEET_CONFIG.directionMap,
};

// === ANIMATED SPRITE SHEET CONFIG (6x4 layout like player walking) ===
// Used for hostile NPCs with proper walking animations (Shardkin, Shorebound, DrownedWatch)
// Layout: 6 columns (animation frames), 4 rows (down, right, left, up)
// 
// Per-species configurations since each has different sprite sizes:
//   - Shardkin:     48x48 per frame → 288x192 sheet
//   - Shorebound:   64x64 per frame → 384x256 sheet (like player)
//   - DrownedWatch: 96x96 per frame → 576x384 sheet
interface AnimatedSpriteConfig {
    sheetWidth: number;
    sheetHeight: number;
    frameWidth: number;
    frameHeight: number;
    cols: number;  // Number of animation frame columns
    rows: number;  // Number of direction rows
}

const ANIMATED_SPRITE_CONFIGS: Record<string, AnimatedSpriteConfig> = {
    // ═══════════════════════════════════════════════════════════════════════════
    // WILDLIFE ANIMATED SPRITESHEETS
    // Row order: Down, Right, Left, Up (same as player)
    // ═══════════════════════════════════════════════════════════════════════════
    
    // CINDERFOX - Passive wildlife (4x4 layout: 4 frames × 4 directions)
    // Artist spec: 80x80 per frame → 320x320 total sheet
    // Renders at: 128x128 (1.6x scale)
    'CinderFox': {
        sheetWidth: 320,   // 80px × 4 frames
        sheetHeight: 320,  // 80px × 4 rows
        frameWidth: 80,
        frameHeight: 80,
        cols: 4,           // 4 animation frames
        rows: 4,           // 4 directions
    },
    
    // ARCTICWALRUS - Large passive wildlife (4x4 layout: 4 frames × 4 directions)
    // Artist spec: 80x80 per frame → 320x320 total sheet
    // Renders at: 128x128 (1.6x scale)
    'ArcticWalrus': {
        sheetWidth: 320,   // 80px × 4 frames
        sheetHeight: 320,  // 80px × 4 rows
        frameWidth: 80,
        frameHeight: 80,
        cols: 4,           // 4 animation frames
        rows: 4,           // 4 directions
    },
    
    // TUNDRAWOLF - Large predator wildlife (4x4 layout: 4 frames × 4 directions)
    // Artist spec: 80x80 per frame → 320x320 total sheet
    // Renders at: 128x128 (1.6x scale)
    'TundraWolf': {
        sheetWidth: 320,   // 80px × 4 frames
        sheetHeight: 320,  // 80px × 4 rows
        frameWidth: 80,
        frameHeight: 80,
        cols: 4,           // 4 animation frames
        rows: 4,           // 4 directions
    },
    
    // TERN - Coastal seabird (4x4 layout: 4 frames × 4 directions)
    // Artist spec: 80x80 per frame → 320x320 total sheet
    // Renders at: 96x96 (1.2x scale) - medium-sized bird
    'Tern': {
        sheetWidth: 320,   // 80px × 4 frames
        sheetHeight: 320,  // 80px × 4 rows
        frameWidth: 80,
        frameHeight: 80,
        cols: 4,           // 4 animation frames
        rows: 4,           // 4 directions
    },
    
    // CARIBOU - Large herd herbivore (4x4 layout: 4 frames × 4 directions)
    // Artist spec: 80x80 per frame → 320x320 total sheet
    // Renders at: 128x128 (1.6x scale) - large animal
    'Caribou': {
        sheetWidth: 320,   // 80px × 4 frames
        sheetHeight: 320,  // 80px × 4 rows
        frameWidth: 80,
        frameHeight: 80,
        cols: 4,           // 4 animation frames
        rows: 4,           // 4 directions
    },
    
    // SALMONSHARK - Aquatic apex predator (4x4 layout: 4 frames × 4 directions)
    // Artist spec: 256x256 per frame → 1024x1024 total sheet
    // Renders at: 160x160 - large aquatic predator
    // Always rendered "underwater" with blur effect when viewed from surface
    'SalmonShark': {
        sheetWidth: 1024,  // 256px × 4 frames
        sheetHeight: 1024, // 256px × 4 rows
        frameWidth: 256,
        frameHeight: 256,
        cols: 4,           // 4 animation frames
        rows: 4,           // 4 directions
    },
    
    // WOLVERINE - Medium-sized but stocky and muscular predator (4x4 layout: 4 frames × 4 directions)
    // Artist spec: Check actual frame size - if clipped, may need adjustment
    // If image is 320x320, frames should be 80x80, but sprites may overflow cells
    // Renders at: 112x112 (1.4x scale) - medium-sized predator
    'Wolverine': {
        sheetWidth: 320,   // Total sheet width
        sheetHeight: 320,  // Total sheet height
        frameWidth: 80,    // Frame width (320 / 4 = 80)
        frameHeight: 80,   // Frame height (320 / 4 = 80)
        cols: 4,           // 4 animation frames
        rows: 4,           // 4 directions
    },
    
    // ═══════════════════════════════════════════════════════════════════════════
    // HOSTILE NPC ANIMATED SPRITESHEETS (6x4 layout: 6 frames × 4 directions)
    // Row order: Down, Right, Left, Up (same as player)
    // ═══════════════════════════════════════════════════════════════════════════
    
    // SHARDKIN - Small swarmer creature
    // Artist spec: 48x48 per frame → 288x192 total sheet
    // Renders at: 72x72 (1.5x scale)
    'Shardkin': {
        sheetWidth: 288,   // 48px × 6 frames
        sheetHeight: 192,  // 48px × 4 rows
        frameWidth: 48,
        frameHeight: 48,
        cols: 6,           // 6 animation frames
        rows: 4,           // 4 directions
    },
    
    // SHOREBOUND - Lean stalker, fast predator (uncomment when asset is added)
    // Artist spec: 64x64 per frame → 384x256 total sheet (artist's 64-bit tier)
    // Renders at: 160x160 (2.5x scale) - ~1.67x player size
    // 'Shorebound': {
    //     sheetWidth: 384,   // 64px × 6 frames
    //     sheetHeight: 256,  // 64px × 4 rows
    //     frameWidth: 64,
    //     frameHeight: 64,
    //     cols: 6,
    //     rows: 4,
    // },
    
    // DROWNED WATCH - Massive brute, heavy boss-type (uncomment when asset is added)
    // Artist spec: 96x96 per frame → 576x384 total sheet (artist's 96-bit tier)
    // Renders at: 192x192 (2x scale) - 2x player size, imposing "oh crap" moment
    // 'DrownedWatch': {
    //     sheetWidth: 576,   // 96px × 6 frames
    //     sheetHeight: 384,  // 96px × 4 rows
    //     frameWidth: 96,
    //     frameHeight: 96,
    //     cols: 6,
    //     rows: 4,
    // },
};

// Common layout for all animated spritesheets (6 cols x 4 rows)
const ANIMATED_SHEET_COLS = 6;
const ANIMATED_SHEET_ROWS = 4;

// Direction to row mapping (matches player format - same for all species)
const ANIMATED_DIRECTION_ROW_MAP: Record<string, number> = {
    'down':  0,  // Row 0: facing down
    'right': 1,  // Row 1: facing right
    'left':  2,  // Row 2: facing left
    'up':    3,  // Row 3: facing up
};

// Animation timing for walking cycle
const ANIMATED_WALK_FRAME_DURATION_MS = 100; // Time per frame (100ms = smooth animation)

// Helper to check if species uses animated spritesheet
function usesAnimatedSpritesheet(species: AnimalSpecies): boolean {
    return species.tag in ANIMATED_SPRITE_CONFIGS;
}

// Get the animated config for a species (returns undefined if not animated)
function getAnimatedConfig(species: AnimalSpecies): AnimatedSpriteConfig | undefined {
    return ANIMATED_SPRITE_CONFIGS[species.tag];
}

// Calculate frame dimensions from sheet size
const FRAME_WIDTH = Math.floor(SPRITE_SHEET_CONFIG.sheetWidth / SPRITE_SHEET_CONFIG.sheetCols);
const FRAME_HEIGHT = Math.floor(SPRITE_SHEET_CONFIG.sheetHeight / SPRITE_SHEET_CONFIG.sheetRows);
const FLYING_FRAME_WIDTH = Math.floor(FLYING_SPRITE_SHEET_CONFIG.sheetWidth / FLYING_SPRITE_SHEET_CONFIG.sheetCols);
const FLYING_FRAME_HEIGHT = Math.floor(FLYING_SPRITE_SHEET_CONFIG.sheetHeight / FLYING_SPRITE_SHEET_CONFIG.sheetRows);

// Map species to their sprite sheets (all animals now have sprite sheets)
const speciesSpriteSheets: Record<string, string> = {
    'CinderFox': foxWalkingAnimatedSheet, // Use animated 4x4 spritesheet
    'TundraWolf': tundraWolfWalkingAnimatedSheet, // Use animated 4x4 spritesheet
    'CableViper': cableViperWalkingSheet,
    'ArcticWalrus': walrusWalkingAnimatedSheet, // Use animated 4x4 spritesheet
    'BeachCrab': crabWalkingSheet,
    'Tern': ternWalkingAnimatedSheet, // Use animated 4x4 spritesheet
    'Crow': crowWalkingSheet,
    'Vole': voleWalkingSheet,
    'Wolverine': wolverineWalkingAnimatedSheet, // Use animated 4x4 spritesheet
    'Caribou': caribouWalkingAnimatedSheet, // Use animated 4x4 spritesheet
    'SalmonShark': salmonSharkWalkingAnimatedSheet, // Use animated 4x4 spritesheet (aquatic)
    // Night hostile NPCs have custom sprites
    'Shorebound': shoreboundWalkingSheet,
    'Shardkin': shardkinWalkingAnimatedSheet, // NEW: Use animated 6x4 spritesheet
    'DrownedWatch': drownedWatchWalkingSheet,
};

// Map species to their flying sprite sheets (for birds when in flight)
const speciesFlyingSpriteSheets: Record<string, string> = {
    'Tern': ternFlyingAnimatedSheet, // Use animated 4x4 flying spritesheet
    'Crow': crowFlyingSheet,
};

// --- Constants for damage visual effects ---
const ANIMAL_SHAKE_DURATION_MS = 200; // How long the shake lasts
const ANIMAL_SHAKE_AMOUNT_PX = 4;     // Max pixels to offset (slightly more than players)
const ANIMAL_HIT_FLASH_DURATION_MS = 120; // Duration of the white flash on hit (slightly longer than players)

// --- Hit state tracking for animals (similar to player system) ---
interface AnimalHitState {
    lastProcessedHitTime: bigint;
    clientDetectionTime: number;
    effectStartTime: number;
}

const animalHitStates = new Map<string, AnimalHitState>();

// --- Burrow effect tracking for visual feedback when animals burrow underground ---
const BURROW_EFFECT_DURATION_MS = 800; // How long the dirt particles last
const BURROW_PARTICLE_COUNT = 12; // Number of dirt particles to spawn

interface BurrowEffectState {
    posX: number;
    posY: number;
    startTime: number;
    particles: Array<{
        offsetX: number;
        offsetY: number;
        velocityX: number;
        velocityY: number;
        size: number;
        color: string;
    }>;
}

const activeBurrowEffects = new Map<string, BurrowEffectState>();

// Track animals we've already processed for burrowing to avoid duplicate effects
const processedBurrowAnimals = new Map<string, bigint>(); // animalId -> stateChangeTime

/**
 * Check if an animal just started burrowing and create effect if needed
 */
function checkAndCreateBurrowEffect(animal: WildAnimal, nowMs: number) {
    const animalId = animal.id.toString();
    const stateChangeTime = animal.stateChangeTime?.microsSinceUnixEpoch ?? 0n;
    
    // Check if this animal is burrowed and we haven't already processed this burrow
    if (animal.state.tag === 'Burrowed') {
        const lastProcessed = processedBurrowAnimals.get(animalId);
        
        if (lastProcessed !== stateChangeTime) {
            // New burrow! Create the effect
            processedBurrowAnimals.set(animalId, stateChangeTime);
            
            // Generate random particles
            const particles: BurrowEffectState['particles'] = [];
            for (let i = 0; i < BURROW_PARTICLE_COUNT; i++) {
                const angle = (Math.PI * 2 * i) / BURROW_PARTICLE_COUNT + (Math.random() - 0.5) * 0.5;
                const speed = 40 + Math.random() * 60;
                particles.push({
                    offsetX: (Math.random() - 0.5) * 20,
                    offsetY: (Math.random() - 0.5) * 10,
                    velocityX: Math.cos(angle) * speed,
                    velocityY: Math.sin(angle) * speed - 50, // Upward bias
                    size: 3 + Math.random() * 4,
                    color: Math.random() > 0.5 ? '#8B7355' : '#6B5344', // Brown/dirt colors
                });
            }
            
            activeBurrowEffects.set(animalId, {
                posX: animal.posX,
                posY: animal.posY,
                startTime: nowMs,
                particles,
            });
        }
    }
}

/**
 * Process all wild animals to check for new burrow events
 * This should be called each frame BEFORE renderBurrowEffects to detect newly burrowed animals
 */
export function processWildAnimalsForBurrowEffects(wildAnimals: Map<string, WildAnimal>, nowMs: number) {
    wildAnimals.forEach(animal => {
        checkAndCreateBurrowEffect(animal, nowMs);
    });
}

/**
 * Renders active burrow effects (dirt particles flying up from ground)
 */
export function renderBurrowEffects(ctx: CanvasRenderingContext2D, nowMs: number) {
    const effectsToRemove: string[] = [];
    
    activeBurrowEffects.forEach((effect, animalId) => {
        const elapsed = nowMs - effect.startTime;
        
        if (elapsed >= BURROW_EFFECT_DURATION_MS) {
            effectsToRemove.push(animalId);
            return;
        }
        
        const progress = elapsed / BURROW_EFFECT_DURATION_MS;
        const alpha = 1 - progress; // Fade out over time
        
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // Render each particle
        effect.particles.forEach(particle => {
            const t = elapsed / 1000; // Time in seconds
            const gravity = 150; // Gravity acceleration
            
            // Calculate particle position with gravity
            const px = effect.posX + particle.offsetX + particle.velocityX * t;
            const py = effect.posY + particle.offsetY + particle.velocityY * t + 0.5 * gravity * t * t;
            
            // Draw particle as a small dirt clump
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(px, py, particle.size * (1 - progress * 0.5), 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.restore();
    });
    
    // Clean up finished effects
    effectsToRemove.forEach(id => {
        activeBurrowEffects.delete(id);
        // Keep processedBurrowAnimals entry to prevent re-triggering
    });
}

/**
 * Clean up burrow tracking when animal no longer exists
 */
export function cleanupBurrowTracking(activeAnimalIds: Set<string>) {
    // Remove tracking for animals that no longer exist
    for (const animalId of processedBurrowAnimals.keys()) {
        if (!activeAnimalIds.has(animalId)) {
            processedBurrowAnimals.delete(animalId);
            activeBurrowEffects.delete(animalId);
        }
    }
}

// --- Movement interpolation for smoother animal movement ---
interface AnimalMovementState {
    lastServerX: number;
    lastServerY: number;
    targetX: number;
    targetY: number;
    lastUpdateTime: number;
    interpolatedX: number;
    interpolatedY: number;
    velocityX: number; // Estimated velocity for prediction
    velocityY: number;
}

const animalMovementStates = new Map<string, AnimalMovementState>();

// Interpolation settings - TUNED for 500ms server tick interval with velocity-based smoothing
// With 500ms ticks, animals can move ~520px at 1040px/s sprint speed
// We use velocity estimation to predict movement between updates for smoother visuals
const SERVER_TICK_MS = 500; // Server updates every 500ms
const MAX_INTERPOLATION_DISTANCE = 600; // Higher threshold for 500ms tick interval (accounts for sprint speed)
const VELOCITY_SMOOTHING = 0.3; // How much to smooth velocity changes (0=instant, 1=never change)

// --- Reusable Offscreen Canvas for Tinting ---
const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

// Re-export for convenience
export type WildAnimal = SpacetimeDB.WildAnimal;
export type AnimalSpecies = SpacetimeDB.AnimalSpecies;
export type AnimalState = SpacetimeDB.AnimalState;

interface WildAnimalRenderProps {
    ctx: CanvasRenderingContext2D;
    animal: WildAnimal;
    nowMs: number;
    cycleProgress: number;
    animationFrame?: number;
    localPlayerPosition?: { x: number; y: number } | null;
    isLocalPlayerSnorkeling?: boolean; // For underwater rendering (sharks always underwater)
    // Breeding data for age-based sizing and pregnancy indicators
    caribouBreedingData?: Map<string, CaribouBreedingData>;
    walrusBreedingData?: Map<string, WalrusBreedingData>;
}

// ═══════════════════════════════════════════════════════════════════════════
// AGE-BASED SIZE SCALING FOR BREEDING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
// Pups/Calves: 50% size, Juveniles: 75% size, Adults: 100% size

/**
 * Get the size multiplier for a caribou based on its age stage
 */
function getCaribouAgeMultiplier(breedingData: CaribouBreedingData | undefined): number {
    if (!breedingData) return 1.0; // Default to adult size if no data
    
    switch (breedingData.ageStage.tag) {
        case 'Calf': return 0.5;      // 50% size for calves
        case 'Juvenile': return 0.75; // 75% size for juveniles
        case 'Adult': return 1.0;     // 100% size for adults
        default: return 1.0;
    }
}

/**
 * Get the size multiplier for a walrus based on its age stage
 */
function getWalrusAgeMultiplier(breedingData: WalrusBreedingData | undefined): number {
    if (!breedingData) return 1.0; // Default to adult size if no data
    
    switch (breedingData.ageStage.tag) {
        case 'Pup': return 0.5;       // 50% size for pups
        case 'Juvenile': return 0.75; // 75% size for juveniles
        case 'Adult': return 1.0;     // 100% size for adults
        default: return 1.0;
    }
}

/**
 * Check if an animal is pregnant (works for both caribou and walrus)
 */
function isAnimalPregnant(
    animal: WildAnimal,
    caribouBreedingData?: Map<string, CaribouBreedingData>,
    walrusBreedingData?: Map<string, WalrusBreedingData>
): boolean {
    const animalId = animal.id.toString();
    
    if (animal.species.tag === 'Caribou' && caribouBreedingData) {
        const data = caribouBreedingData.get(animalId);
        return data?.isPregnant ?? false;
    }
    
    if (animal.species.tag === 'ArcticWalrus' && walrusBreedingData) {
        const data = walrusBreedingData.get(animalId);
        return data?.isPregnant ?? false;
    }
    
    return false;
}

// Get the sprite sheet for a species (considers flying state for birds)
function getSpriteSheet(species: AnimalSpecies, isFlying: boolean = false): string {
    // Check for flying sprite sheet if the animal is flying
    if (isFlying && speciesFlyingSpriteSheets[species.tag]) {
        return speciesFlyingSpriteSheets[species.tag];
    }
    return speciesSpriteSheets[species.tag] || foxWalkingSheet; // Fallback to fox
}

// Get the source rectangle for an ANIMATED sprite (supports various layouts like 4x4 or 6x4)
// Returns sprite frame based on direction, animation frame, and species-specific frame size
function getAnimatedSpriteSourceRect(
    species: AnimalSpecies,
    direction: string,
    animationFrame: number
): { sx: number; sy: number; sw: number; sh: number } {
    const config = getAnimatedConfig(species);
    if (!config) {
        // Fallback - shouldn't happen if usesAnimatedSpritesheet is checked first
        return { sx: 0, sy: 0, sw: 48, sh: 48 };
    }
    
    const { frameWidth, frameHeight, cols } = config;
    
    // Normalize direction to 4-way
    let normalizedDir = direction.toLowerCase();
    
    // Map diagonal directions to closest cardinal direction
    if (normalizedDir === 'up_left' || normalizedDir === 'up-left' || normalizedDir === 'upleft') {
        normalizedDir = 'left';
    } else if (normalizedDir === 'up_right' || normalizedDir === 'up-right' || normalizedDir === 'upright') {
        normalizedDir = 'right';
    } else if (normalizedDir === 'down_left' || normalizedDir === 'down-left' || normalizedDir === 'downleft') {
        normalizedDir = 'left';
    } else if (normalizedDir === 'down_right' || normalizedDir === 'down-right' || normalizedDir === 'downright') {
        normalizedDir = 'right';
    }
    
    // Default to 'down' if direction not found
    if (ANIMATED_DIRECTION_ROW_MAP[normalizedDir] === undefined) {
        normalizedDir = 'down';
    }
    
    const row = ANIMATED_DIRECTION_ROW_MAP[normalizedDir];
    const col = animationFrame % cols; // Cycle through animation frames (using species-specific col count)
    
    return {
        sx: col * frameWidth,
        sy: row * frameHeight,
        sw: frameWidth,
        sh: frameHeight,
    };
}

// Get the source rectangle for a sprite from the sheet based on direction (no animation)
function getSpriteSourceRect(
    direction: string,
    isFlying: boolean = false
): { sx: number; sy: number; sw: number; sh: number } {
    const config = isFlying ? FLYING_SPRITE_SHEET_CONFIG : SPRITE_SHEET_CONFIG;
    const frameWidth = isFlying ? FLYING_FRAME_WIDTH : FRAME_WIDTH;
    const frameHeight = isFlying ? FLYING_FRAME_HEIGHT : FRAME_HEIGHT;
    const { directionMap } = config;
    
    // Normalize direction to 4-way (map 8-way to 4-way)
    let normalizedDir = direction.toLowerCase();
    
    // Map diagonal directions to closest cardinal direction
    if (normalizedDir === 'up_left' || normalizedDir === 'up-left' || normalizedDir === 'upleft') {
        normalizedDir = 'left';
    } else if (normalizedDir === 'up_right' || normalizedDir === 'up-right' || normalizedDir === 'upright') {
        normalizedDir = 'right';
    } else if (normalizedDir === 'down_left' || normalizedDir === 'down-left' || normalizedDir === 'downleft') {
        normalizedDir = 'left';
    } else if (normalizedDir === 'down_right' || normalizedDir === 'down-right' || normalizedDir === 'downright') {
        normalizedDir = 'right';
    }
    
    // Default to 'down' if direction not found
    if (!directionMap[normalizedDir]) {
        normalizedDir = 'down';
    }
    
    const { row, col } = directionMap[normalizedDir];
    
    return {
        sx: col * frameWidth,
        sy: row * frameHeight,
        sw: frameWidth,
        sh: frameHeight,
    };
}

// Get species-specific rendering properties
function getSpeciesRenderingProps(species: AnimalSpecies) {
    // Species-specific sizes
    switch (species.tag) {
        case 'ArcticWalrus':
            // Walruses are large, hefty animals
            return { width: 128, height: 128, shadowRadius: 40 };
        case 'TundraWolf':
            // Wolves are larger predators
            return { width: 128, height: 128, shadowRadius: 40 };
        case 'CinderFox':
            // Foxes are larger
            return { width: 128, height: 128, shadowRadius: 36 };
        case 'CableViper':
            // Vipers are larger snakes
            return { width: 96, height: 96, shadowRadius: 28 };
        case 'BeachCrab':
            return { width: 64, height: 64, shadowRadius: 20 };
        case 'Tern':
            // Terns are small coastal seabirds
            return { width: 64, height: 64, shadowRadius: 20 };
        case 'Crow':
            // Crows are medium-sized inland birds (slightly larger)
            return { width: 104, height: 104, shadowRadius: 30 };
        case 'Vole':
            // Voles are tiny rodents - very small sprite
            return { width: 48, height: 48, shadowRadius: 14 };
        case 'Wolverine':
            // Wolverines are medium-sized but stocky and muscular
            return { width: 112, height: 112, shadowRadius: 36 };
        case 'Caribou':
            // Caribou are large herd herbivores with antlers
            return { width: 128, height: 128, shadowRadius: 42 };
        case 'SalmonShark':
            // Salmon Sharks are large aquatic predators - always underwater
            return { width: 160, height: 160, shadowRadius: 0 }; // No ground shadow (underwater)
        // Night hostile NPCs (2x size for visibility and impact)
        // ═══════════════════════════════════════════════════════════════════════
        // HOSTILE NPCs - Sizes designed for clean 2x pixel scaling
        // ═══════════════════════════════════════════════════════════════════════
        case 'Shardkin':
            // Swarmer - small hostile creature (48x48 sprite × 1.5 = 72x72)
            // 0.75x player size (player is 96x96 render) - small but dangerous in groups
            return { width: 72, height: 72, shadowRadius: 24 };
        case 'Shorebound':
            // Stalker - lean, fast predator (64x64 sprite × 2.5 = 160x160)
            // ~1.67x player size (player is 96x96 render)
            return { width: 160, height: 160, shadowRadius: 52 };
        case 'DrownedWatch':
            // Brute - massive, heavy boss-type (96x96 sprite × 2 = 192x192)
            // 2x player size (player is 96x96 render) - the "oh crap" moment
            return { width: 192, height: 192, shadowRadius: 64 };
        default:
            return { width: 96, height: 96, shadowRadius: 32 };
    }
}

// Main wild animal rendering function
export function renderWildAnimal({
    ctx,
    animal,
    nowMs,
    cycleProgress,
    animationFrame = 0,
    localPlayerPosition,
    isLocalPlayerSnorkeling = false,
    caribouBreedingData,
    walrusBreedingData
}: WildAnimalRenderProps) {
    // Check for burrow effect BEFORE skipping burrowed animals
    // This allows us to detect when an animal JUST burrowed and create the particle effect
    checkAndCreateBurrowEffect(animal, nowMs);
    
    // BURROWED STATE: Animals that are burrowed underground are completely invisible
    // This is used by voles to hide from predators and players
    if (animal.state.tag === 'Burrowed') {
        return; // Don't render - animal is underground
    }

    const animalId = animal.id.toString();
    
    // --- Movement interpolation with velocity-based prediction for smoother movement ---
    let renderPosX = animal.posX;
    let renderPosY = animal.posY;
    
    let movementState = animalMovementStates.get(animalId);
    if (!movementState) {
        // Initialize movement state
        movementState = {
            lastServerX: animal.posX,
            lastServerY: animal.posY,
            targetX: animal.posX,
            targetY: animal.posY,
            lastUpdateTime: nowMs,
            interpolatedX: animal.posX,
            interpolatedY: animal.posY,
            velocityX: 0,
            velocityY: 0,
        };
        animalMovementStates.set(animalId, movementState);
    } else {
        // Check if server position changed
        const dx = animal.posX - movementState.lastServerX;
        const dy = animal.posY - movementState.lastServerY;
        const distanceMoved = Math.sqrt(dx * dx + dy * dy);
        
        if (distanceMoved > 1.0) { // Server position update detected
            const timeSinceLastUpdate = nowMs - movementState.lastUpdateTime;
            
            // Check for teleportation (too far to interpolate)
            if (distanceMoved > MAX_INTERPOLATION_DISTANCE) {
                // Teleportation detected - snap to new position and reset velocity
                movementState.interpolatedX = animal.posX;
                movementState.interpolatedY = animal.posY;
                movementState.velocityX = 0;
                movementState.velocityY = 0;
            } else if (timeSinceLastUpdate > 50) { // Avoid division by tiny time values
                // Calculate velocity based on actual movement (pixels per millisecond)
                const newVelocityX = dx / timeSinceLastUpdate;
                const newVelocityY = dy / timeSinceLastUpdate;
                
                // Smooth velocity changes to avoid jitter
                movementState.velocityX = movementState.velocityX * VELOCITY_SMOOTHING + newVelocityX * (1 - VELOCITY_SMOOTHING);
                movementState.velocityY = movementState.velocityY * VELOCITY_SMOOTHING + newVelocityY * (1 - VELOCITY_SMOOTHING);
            }
            
            // Update target and tracking
            movementState.targetX = animal.posX;
            movementState.targetY = animal.posY;
            movementState.lastServerX = animal.posX;
            movementState.lastServerY = animal.posY;
            movementState.lastUpdateTime = nowMs;
        }
        
        // Calculate time since last server update
        const timeSinceUpdate = nowMs - movementState.lastUpdateTime;
        
        // Use velocity prediction for the first portion of the tick, then blend to target
        // This creates smooth movement that arrives at the target position naturally
        const tickProgress = Math.min(timeSinceUpdate / SERVER_TICK_MS, 1.5); // Cap at 1.5x tick time
        
        // Distance remaining to target
        const distToTargetX = movementState.targetX - movementState.interpolatedX;
        const distToTargetY = movementState.targetY - movementState.interpolatedY;
        const distToTarget = Math.sqrt(distToTargetX * distToTargetX + distToTargetY * distToTargetY);
        
        if (distToTarget > 0.5) {
            // Blend between velocity prediction and direct interpolation based on tick progress
            // Early in tick: use velocity prediction
            // Late in tick: blend toward target to ensure we arrive
            
            if (tickProgress < 0.8) {
                // Early/mid tick: Use velocity prediction with correction toward target
                // This makes movement feel continuous rather than jerky
                const predictionWeight = 0.7 * (1 - tickProgress); // Fade out prediction over time
                const correctionWeight = 1 - predictionWeight;
                
                // Velocity-based prediction (where we'd be if velocity continued)
                const predictedX = movementState.interpolatedX + movementState.velocityX * 16; // 16ms = ~60fps frame
                const predictedY = movementState.interpolatedY + movementState.velocityY * 16;
                
                // Target-seeking interpolation (move toward target at appropriate speed)
                const seekSpeed = Math.min(0.15 + tickProgress * 0.2, 0.35); // Speed up as we approach tick end
                const seekX = movementState.interpolatedX + distToTargetX * seekSpeed;
                const seekY = movementState.interpolatedY + distToTargetY * seekSpeed;
                
                // Blend prediction and seeking
                movementState.interpolatedX = predictedX * predictionWeight + seekX * correctionWeight;
                movementState.interpolatedY = predictedY * predictionWeight + seekY * correctionWeight;
            } else {
                // Late tick: Prioritize reaching target smoothly
                // Use exponential approach to avoid overshooting
                const catchupSpeed = Math.min(0.25 + (tickProgress - 0.8) * 0.5, 0.6);
                movementState.interpolatedX += distToTargetX * catchupSpeed;
                movementState.interpolatedY += distToTargetY * catchupSpeed;
            }
            
            // Ensure we don't overshoot target
            if (Math.abs(movementState.interpolatedX - movementState.targetX) < 1) {
                movementState.interpolatedX = movementState.targetX;
            }
            if (Math.abs(movementState.interpolatedY - movementState.targetY) < 1) {
                movementState.interpolatedY = movementState.targetY;
            }
        }
        
        // Use interpolated position for rendering
        renderPosX = movementState.interpolatedX;
        renderPosY = movementState.interpolatedY;
    }
    
    // --- Hit detection and effect timing (similar to player system) ---
    const serverLastHitTimePropMicros = animal.lastHitTime?.microsSinceUnixEpoch ?? 0n;
    let hitState = animalHitStates.get(animalId);
    let isCurrentlyHit = false;
    let hitEffectElapsed = 0;
    
    if (serverLastHitTimePropMicros > 0n) {
        if (!hitState || serverLastHitTimePropMicros > hitState.lastProcessedHitTime) {
            // NEW HIT DETECTED! Set up effect timing based on client time
            hitState = {
                lastProcessedHitTime: serverLastHitTimePropMicros,
                clientDetectionTime: nowMs,
                effectStartTime: nowMs
            };
            animalHitStates.set(animalId, hitState);
        }
        
        // Calculate effect timing based on when WE detected the hit
        if (hitState) {
            hitEffectElapsed = nowMs - hitState.effectStartTime;
            isCurrentlyHit = hitEffectElapsed < ANIMAL_SHAKE_DURATION_MS;
        }
    } else {
        // No hit time from server - clear hit state
        if (hitState) {
            animalHitStates.delete(animalId);
        }
    }

    // Legacy calculation for fallback
    const serverLastHitTimeMs = serverLastHitTimePropMicros > 0n ? Number(serverLastHitTimePropMicros / 1000n) : 0;
    const elapsedSinceServerHitMs = serverLastHitTimeMs > 0 ? (nowMs - serverLastHitTimeMs) : Infinity;
    
    // Use new hit detection if available, otherwise fall back to old system
    const effectiveHitElapsed = isCurrentlyHit ? hitEffectElapsed : elapsedSinceServerHitMs;
    const shouldShowCombatEffects = isCurrentlyHit || elapsedSinceServerHitMs < ANIMAL_SHAKE_DURATION_MS;

    // --- Shake Logic ---
    let shakeX = 0;
    let shakeY = 0;
    if (animal.health > 0 && effectiveHitElapsed < ANIMAL_SHAKE_DURATION_MS) {
        shakeX = (Math.random() - 0.5) * 2 * ANIMAL_SHAKE_AMOUNT_PX;
        shakeY = (Math.random() - 0.5) * 2 * ANIMAL_SHAKE_AMOUNT_PX;
    }

    // --- Flash Logic ---
    const isFlashing = animal.health > 0 && effectiveHitElapsed < ANIMAL_HIT_FLASH_DURATION_MS;

    // Get sprite sheet for this species (all animals use sprite sheets now)
    // Use flying sprite sheet for birds when they are flying
    // Birds use flying sprites when isFlying is true, walking sprites otherwise
    const isBird = animal.species.tag === 'Tern' || animal.species.tag === 'Crow';
    const useFlying = isBird && animal.isFlying === true;
    const useAnimated = usesAnimatedSpritesheet(animal.species);
    const spriteSheetSrc = getSpriteSheet(animal.species, useFlying);
    const spriteSheetImage = imageManager.getImage(spriteSheetSrc);
    
    // Get the appropriate frame dimensions based on sprite type
    const animatedConfig = useAnimated ? getAnimatedConfig(animal.species) : undefined;
    let currentFrameWidth: number;
    let currentFrameHeight: number;
    if (useAnimated && animatedConfig) {
        currentFrameWidth = animatedConfig.frameWidth;
        currentFrameHeight = animatedConfig.frameHeight;
    } else if (useFlying) {
        currentFrameWidth = FLYING_FRAME_WIDTH;
        currentFrameHeight = FLYING_FRAME_HEIGHT;
    } else {
        currentFrameWidth = FRAME_WIDTH;
        currentFrameHeight = FRAME_HEIGHT;
    }
    
    // Calculate animation frame for animated sprites based on movement
    let calculatedAnimFrame = 0;
    if (useAnimated && movementState && animatedConfig) {
        // Check if animal is moving (has significant velocity)
        const velocityMagnitude = Math.sqrt(movementState.velocityX * movementState.velocityX + movementState.velocityY * movementState.velocityY);
        const isMoving = velocityMagnitude > 0.02; // Threshold for "moving"
        
        if (isMoving) {
            // Calculate animation frame based on time for smooth walking cycle
            // Use species-specific column count for proper animation cycling
            calculatedAnimFrame = Math.floor(nowMs / ANIMATED_WALK_FRAME_DURATION_MS) % animatedConfig.cols;
        } else {
            // Idle pose - use frame 0 or 1 (neutral stance)
            calculatedAnimFrame = 0;
        }
    }
    
    // Debug logging for bird sprite selection (enable to debug)
    // if (isBird && Math.random() < 0.001) { // Log 0.1% of frames to avoid spam
    //     console.log(`🐦 ${animal.species.tag} #${animal.id}: isFlying=${animal.isFlying}, state=${animal.state.tag}, sprite=${useFlying ? 'FLYING' : 'WALKING'}`);
    // }
    
    // Check if sprite sheet is loaded
    const useSpriteSheet = spriteSheetImage && spriteSheetImage.complete;
    const animalImage = spriteSheetImage;
    
    // Get fallback color for each species
    const getFallbackColor = (species: AnimalSpecies): string => {
        switch (species.tag) {
            case 'CinderFox': return '#FF6B35'; // Orange
            case 'TundraWolf': return '#4A90E2'; // Blue  
            case 'CableViper': return '#7ED321'; // Green
            case 'ArcticWalrus': return '#8B6914'; // Brown
            case 'BeachCrab': return '#E85D04'; // Orange-red
            case 'Tern': return '#E0E0E0'; // Light gray/white
            case 'Crow': return '#1A1A1A'; // Black
            case 'Caribou': return '#8B7355'; // Brown/tan (caribou fur color)
            case 'SalmonShark': return '#708090'; // Slate gray (shark skin color)
            // Night hostile NPCs
            case 'Shorebound': return '#2C5F2D'; // Dark forest green
            case 'Shardkin': return '#4A0E4E'; // Dark purple
            case 'DrownedWatch': return '#1B3A4B'; // Deep ocean blue
            default: return '#9013FE'; // Purple
        }
    };
    
    const useImageFallback = !animalImage || !animalImage.complete;

    const props = getSpeciesRenderingProps(animal.species);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // AGE-BASED SIZE SCALING FOR BREEDING ANIMALS
    // ═══════════════════════════════════════════════════════════════════════════
    // Calves/Pups: 50% size, Juveniles: 75% size, Adults: 100% size
    let ageBasedSizeMultiplier = 1.0;
    const animalIdStr = animal.id.toString();
    
    if (animal.species.tag === 'Caribou' && caribouBreedingData) {
        const breedingData = caribouBreedingData.get(animalIdStr);
        ageBasedSizeMultiplier = getCaribouAgeMultiplier(breedingData);
    } else if (animal.species.tag === 'ArcticWalrus' && walrusBreedingData) {
        const breedingData = walrusBreedingData.get(animalIdStr);
        ageBasedSizeMultiplier = getWalrusAgeMultiplier(breedingData);
    }
    
    // Flying terns appear slightly larger to account for wingspan
    const flyingSizeMultiplier = (animal.species.tag === 'Tern' && useFlying) ? 1.3 : 1.0;
    const renderWidth = props.width * flyingSizeMultiplier * ageBasedSizeMultiplier;
    const renderHeight = props.height * flyingSizeMultiplier * ageBasedSizeMultiplier;
    
    const renderX = renderPosX - renderWidth / 2 + shakeX; // Apply shake to X (using interpolated position)
    const renderY = renderPosY - renderHeight / 2 + shakeY; // Apply shake to Y (using interpolated position)

    // No animals hide anymore - always fully visible
    const alpha = 1.0;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Enable crisp pixel scaling for animated sprites (nearest-neighbor instead of bilinear)
    // This keeps pixel art sharp when scaling up (e.g., 48x48 sprite rendered at 72x72)
    if (useAnimated) {
        ctx.imageSmoothingEnabled = false;
    }
    
    // Note: No horizontal flipping needed - sprite sheets have all 4 directions
    // Legacy flipping is only used for static images that don't have sprite sheets
    const shouldFlip = !useSpriteSheet && animal.facingDirection === "right";
    if (shouldFlip) {
        ctx.scale(-1, 1); // Flip horizontally
        ctx.translate(-renderPosX * 2, 0); // Adjust position after flipping
    }

    // Render shadow - flying birds get special detached oval shadows
    {
        ctx.save();
        
        // Flying birds (Tern, Crow) get a special detached shadow
        if (isBird && useFlying) {
            // ═══════════════════════════════════════════════════════════════════════
            // FLYING BIRD SHADOW - Simple detached oval that shows height
            // ═══════════════════════════════════════════════════════════════════════
            // Design principles:
            // 1. Shadow is DETACHED from bird (offset diagonally down-right)
            // 2. Shadow is SMALLER than grounded shadow (shows altitude)
            // 3. Shadow is MORE TRANSPARENT (softer, lower contrast)
            // 4. Shadow is a SIMPLE OVAL (not sprite silhouette)
            // 5. Shadow does NOT animate with wing flaps
            
            // Global light direction: coming from upper-left, so shadow goes down-right
            const shadowOffsetX = 25;  // Offset to the right
            const shadowOffsetY = 45;  // Offset downward (shows height separation)
            
            // Shadow is smaller than the bird (shows altitude)
            const baseShadowWidth = props.width * 0.5;  // 50% of grounded size
            const baseShadowHeight = props.width * 0.15; // Flat oval
            
            // Shadow is more transparent when flying (softer, less contrast)
            const flyingShadowAlpha = 0.25;
            
            // Shadow position: below and to the right of the bird
            const shadowX = renderPosX + shadowOffsetX;
            const shadowY = renderPosY + renderHeight / 2 + shadowOffsetY;
            
            // Draw simple oval shadow with soft edges
            ctx.fillStyle = `rgba(0, 0, 0, ${flyingShadowAlpha})`;
            ctx.beginPath();
            ctx.ellipse(
                shadowX,
                shadowY,
                baseShadowWidth,
                baseShadowHeight,
                0, 0, Math.PI * 2
            );
            ctx.fill();
            
        } else if (useSpriteSheet && animalImage) {
            // GROUNDED SHADOW - Use sprite silhouette for dynamic shadow
            const shadowCanvas = document.createElement('canvas');
            shadowCanvas.width = currentFrameWidth;
            shadowCanvas.height = currentFrameHeight;
            const shadowCtx = shadowCanvas.getContext('2d');
            
            if (shadowCtx) {
                // Use animated sprite rect for animated species, standard for others
                const spriteRect = useAnimated 
                    ? getAnimatedSpriteSourceRect(animal.species, animal.facingDirection, calculatedAnimFrame)
                    : getSpriteSourceRect(animal.facingDirection, useFlying);
                shadowCtx.drawImage(
                    animalImage,
                    spriteRect.sx, spriteRect.sy, spriteRect.sw, spriteRect.sh,
                    0, 0, currentFrameWidth, currentFrameHeight
                );
                
                // Use the extracted frame for dynamic shadow
                drawDynamicGroundShadow({
                    ctx,
                    entityImage: shadowCanvas as unknown as HTMLImageElement,
                    entityCenterX: renderPosX,
                    entityBaseY: renderPosY + renderHeight / 2,
                    imageDrawWidth: renderWidth,
                    imageDrawHeight: renderHeight,
                    cycleProgress: cycleProgress,
                    baseShadowColor: '0,0,0',
                    maxShadowAlpha: 0.6,
                    maxStretchFactor: 3.0,
                    minStretchFactor: 0.25,
                    shadowBlur: 2,
                    pivotYOffset: 0,
                    shakeOffsetX: shakeX,
                    shakeOffsetY: shakeY,
                });
            }
        } else if (animalImage) {
            // Static image - use directly for shadow
            drawDynamicGroundShadow({
                ctx,
                entityImage: animalImage,
                entityCenterX: renderPosX,
                entityBaseY: renderPosY + renderHeight / 2,
                imageDrawWidth: renderWidth,
                imageDrawHeight: renderHeight,
                cycleProgress: cycleProgress,
                baseShadowColor: '0,0,0',
                maxShadowAlpha: 0.6,
                maxStretchFactor: 3.0,
                minStretchFactor: 0.25,
                shadowBlur: 2,
                pivotYOffset: 0,
                shakeOffsetX: shakeX,
                shakeOffsetY: shakeY,
            });
        } else {
            // Fallback ellipse shadow if no image available
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.beginPath();
            ctx.ellipse(
                renderPosX + shakeX, 
                renderPosY + renderHeight / 2 - 5 + shakeY,
                renderWidth / 2.5,
                renderHeight / 8,
                0, 0, Math.PI * 2
            );
            ctx.fill();
        }
        ctx.restore();
    }

    // 🦈 SALMON SHARK UNDERWATER RENDERING
    // Sharks are always underwater - apply visual effects based on viewer perspective
    const isShark = animal.species.tag === 'SalmonShark';
    const viewingSharkFromAbove = isShark && !isLocalPlayerSnorkeling;
    const viewingSharkFromUnderwater = isShark && isLocalPlayerSnorkeling;
    
    // Save filter state if we need to apply underwater blur
    const savedFilter = ctx.filter;
    if (viewingSharkFromAbove) {
        // Viewing shark from above water - apply underwater blur effect (like coral)
        ctx.filter = 'blur(2px)';
        ctx.globalAlpha = 0.7; // Slightly transparent when viewed through water
    } else if (viewingSharkFromUnderwater) {
        // Viewing shark from underwater - apply teal underwater tint
        ctx.globalAlpha = 1.0;
        // Teal tint will be applied via composite operations after drawing
    }

    if (useImageFallback) {
        // Draw fallback colored circle with shake applied
        const centerX = renderPosX + shakeX; // Use interpolated position
        const centerY = renderPosY + shakeY; // Use interpolated position
        const radius = Math.min(renderWidth, renderHeight) / 3;
        
        // Apply white flash to fallback color
        let fillColor = getFallbackColor(animal.species);
        if (isFlashing) {
            fillColor = '#FFFFFF'; // Flash white
        }
        
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        
        // Add a simple indicator for the species (letter)
        ctx.fillStyle = isFlashing ? '#000000' : '#FFFFFF'; // Invert letter color when flashing
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const letter = animal.species.tag.charAt(0); // C, T, or C
        ctx.fillText(letter, centerX, centerY);
    } else {
        // --- Prepare sprite on offscreen canvas (for white flash tinting and sprite sheet extraction) ---
        if (offscreenCtx && animalImage) {
            // Get sprite frame info for sprite sheets
            // Use animated sprite rect for animated species, standard for others
            const spriteRect = useSpriteSheet 
                ? (useAnimated 
                    ? getAnimatedSpriteSourceRect(animal.species, animal.facingDirection, calculatedAnimFrame)
                    : getSpriteSourceRect(animal.facingDirection, useFlying))
                : null;
            
            if (useSpriteSheet && spriteRect) {
                // Sprite sheet mode - extract and render specific frame
                const { sx, sy, sw, sh } = spriteRect;
                
                // Size offscreen canvas to single frame
                offscreenCanvas.width = sw;
                offscreenCanvas.height = sh;
                offscreenCtx.clearRect(0, 0, sw, sh);
                
                // Draw the specific frame from sprite sheet
                offscreenCtx.drawImage(
                    animalImage,
                    sx, sy, sw, sh,  // Source rectangle (frame from sheet)
                    0, 0, sw, sh      // Destination on offscreen canvas
                );
                
                // Apply white flash if needed
                if (isFlashing) {
                    offscreenCtx.globalCompositeOperation = 'source-in';
                    offscreenCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                    offscreenCtx.fillRect(0, 0, sw, sh);
                    offscreenCtx.globalCompositeOperation = 'source-over';
                }
                
                // Draw the frame to main canvas (scaled to animal size)
                ctx.drawImage(
                    offscreenCanvas,
                    renderX,
                    renderY,
                    renderWidth,
                    renderHeight
                );
            } else {
                // Static image mode (original behavior)
                offscreenCanvas.width = animalImage.width;
                offscreenCanvas.height = animalImage.height;
                offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
                
                // Draw the original image to the offscreen canvas
                offscreenCtx.drawImage(animalImage, 0, 0);

                // Apply white flash if needed
                if (isFlashing) {
                    offscreenCtx.globalCompositeOperation = 'source-in';
                    offscreenCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                    offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
                    offscreenCtx.globalCompositeOperation = 'source-over';
                }

                // Draw the (possibly tinted) offscreen canvas to the main canvas
                ctx.drawImage(
                    offscreenCanvas,
                    renderX,
                    renderY,
                    renderWidth,
                    renderHeight
                );
            }
        } else {
            // Fallback: draw image directly without flash effect
            if (useSpriteSheet) {
                // Use animated sprite rect for animated species, standard for others
                const spriteRect = useAnimated 
                    ? getAnimatedSpriteSourceRect(animal.species, animal.facingDirection, calculatedAnimFrame)
                    : getSpriteSourceRect(animal.facingDirection, useFlying);
                ctx.drawImage(
                    animalImage!,
                    spriteRect.sx, spriteRect.sy, spriteRect.sw, spriteRect.sh,
                    renderX,
                    renderY,
                    renderWidth,
                    renderHeight
                );
            } else {
                ctx.drawImage(
                    animalImage!,
                    renderX,
                    renderY,
                    renderWidth,
                    renderHeight
                );
            }
        }
    }
    
    // 🦈 Apply underwater teal tint overlay for sharks when viewer is underwater
    if (viewingSharkFromUnderwater && !useImageFallback) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(0, 180, 180, 0.15)'; // Subtle teal underwater tint
        ctx.fillRect(renderX, renderY, renderWidth, renderHeight);
        ctx.restore();
    }
    
    // Restore filter if we applied underwater blur
    if (viewingSharkFromAbove) {
        ctx.filter = savedFilter;
        ctx.globalAlpha = 1.0;
    }

    ctx.restore();
}

// Preload wild animal images using imageManager
export function preloadWildAnimalImages(): void {
    // All animal sprite sheets (walking/grounded)
    const spriteSheets = [
        walrusWalkingSheet,
        walrusWalkingAnimatedSheet, // NEW: Animated 4x4 walrus spritesheet
        foxWalkingSheet,
        foxWalkingAnimatedSheet, // NEW: Animated 4x4 fox spritesheet
        crabWalkingSheet,
        tundraWolfWalkingSheet,
        tundraWolfWalkingAnimatedSheet, // NEW: Animated 4x4 tundra wolf spritesheet
        cableViperWalkingSheet,
        ternWalkingSheet,
        ternWalkingAnimatedSheet, // NEW: Animated 4x4 tern walking spritesheet
        crowWalkingSheet,
        voleWalkingSheet,
        wolverineWalkingSheet,
        wolverineWalkingAnimatedSheet, // NEW: Animated 4x4 wolverine spritesheet
        caribouWalkingAnimatedSheet, // Animated caribou spritesheet
        salmonSharkWalkingAnimatedSheet, // Animated salmon shark spritesheet (aquatic)
        // Night hostile NPCs
        shoreboundWalkingSheet,
        shardkinWalkingAnimatedSheet, // Use animated spritesheet for Shardkin
        drownedWatchWalkingSheet,
    ];
    
    // Flying sprite sheets for birds
    const flyingSpriteSheets = [
        ternFlyingSheet,
        ternFlyingAnimatedSheet, // NEW: Animated 4x4 tern flying spritesheet
        crowFlyingSheet,
    ];
    
    // Preload all sprite sheets
    [...spriteSheets, ...flyingSpriteSheets].forEach(imageSrc => {
        imageManager.preloadImage(imageSrc);
    });
}

// Helper function to check if coordinates are within animal bounds
export function isPointInAnimal(
    x: number,
    y: number,
    animal: WildAnimal
): boolean {
    // Use the collision bounds system for consistent sizing
    const bounds = getAnimalCollisionBounds(animal);
    
    return x >= bounds.x && x <= bounds.x + bounds.width && 
           y >= bounds.y && y <= bounds.y + bounds.height;
}

// --- THOUGHT BUBBLE RENDERING ---

interface ThoughtBubbleProps {
    ctx: CanvasRenderingContext2D;
    animal: WildAnimal;
    nowMs: number;
    emoji: string;
    duration: number;
    startTime: number;
}

/**
 * Renders a thought bubble with an emoji above a tamed animal
 */
export function renderAnimalThoughtBubble({
    ctx,
    animal,
    nowMs,
    emoji,
    duration,
    startTime,
}: ThoughtBubbleProps) {
    const elapsed = nowMs - startTime;
    
    // Don't render if effect has expired
    if (elapsed >= duration) {
        return;
    }
    
    // Calculate bubble position above the animal
    const bubbleX = animal.posX;
    const bubbleY = animal.posY - 80; // Position above the animal
    
    // Calculate fade effect for the last 500ms
    const fadeStartTime = duration - 500;
    let alpha = 1.0;
    if (elapsed > fadeStartTime) {
        alpha = 1.0 - ((elapsed - fadeStartTime) / 500);
    }
    
    // Add slight bob animation
    const bobOffset = Math.sin((elapsed * 0.008)) * 3; // Gentle bobbing motion
    const finalY = bubbleY + bobOffset;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Draw thought bubble background
    const bubbleRadius = 25;
    const tailHeight = 8;
    
    // Bubble gradient
    const gradient = ctx.createRadialGradient(bubbleX, finalY, 0, bubbleX, finalY, bubbleRadius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(1, 'rgba(240, 240, 240, 0.85)');
    
    // Main bubble circle
    ctx.fillStyle = gradient;
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bubbleX, finalY, bubbleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Thought bubble tail (small circles)
    const tailPositions = [
        { x: bubbleX - 10, y: finalY + bubbleRadius + 5, radius: 4 },
        { x: bubbleX - 18, y: finalY + bubbleRadius + 12, radius: 3 },
        { x: bubbleX - 24, y: finalY + bubbleRadius + 18, radius: 2 },
    ];
    
    tailPositions.forEach(pos => {
        ctx.fillStyle = gradient;
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pos.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
    
    // Draw emoji
    ctx.fillStyle = 'black';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, bubbleX, finalY);
    
    ctx.restore();
}

/**
 * Renders taming-related thought bubbles for wild animals
 */
export function renderTamingThoughtBubbles({
    ctx,
    animal,
    nowMs,
}: {
    ctx: CanvasRenderingContext2D;
    animal: WildAnimal;
    nowMs: number;
}) {
    // Check for heart effect (when animal is tamed)
    if (animal.heartEffectUntil) {
        const heartEffectEndTime = Number(animal.heartEffectUntil.microsSinceUnixEpoch) / 1000; // Convert to milliseconds
        const heartEffectStartTime = heartEffectEndTime - 3000; // 3 second duration
        
        if (nowMs >= heartEffectStartTime && nowMs <= heartEffectEndTime) {
            renderAnimalThoughtBubble({
                ctx,
                animal,
                nowMs,
                emoji: '💖',
                duration: 3000,
                startTime: heartEffectStartTime,
            });
        }
    }
    
    // Check for crying effect (when tamed animal is hit by owner)
    if (animal.cryingEffectUntil) {
        const cryingEffectEndTime = Number(animal.cryingEffectUntil.microsSinceUnixEpoch) / 1000; // Convert to milliseconds
        const cryingEffectStartTime = cryingEffectEndTime - 3000; // 3 second duration
        
        if (nowMs >= cryingEffectStartTime && nowMs <= cryingEffectEndTime) {
            renderAnimalThoughtBubble({
                ctx,
                animal,
                nowMs,
                emoji: '😢',
                duration: 3000,
                startTime: cryingEffectStartTime,
            });
        }
    }
    
    // Additional thought bubbles can be added here for other emotions/states
}

/**
 * Renders pregnancy indicator thought bubble for breeding animals
 * Shows a small 🤰 indicator above pregnant caribou and walruses (both tamed and wild)
 * The indicator gently pulses to draw attention without being intrusive
 */
export function renderPregnancyIndicator({
    ctx,
    animal,
    nowMs,
    caribouBreedingData,
    walrusBreedingData,
}: {
    ctx: CanvasRenderingContext2D;
    animal: WildAnimal;
    nowMs: number;
    caribouBreedingData?: Map<string, CaribouBreedingData>;
    walrusBreedingData?: Map<string, WalrusBreedingData>;
}) {
    // Check if this animal is pregnant
    const isPregnant = isAnimalPregnant(animal, caribouBreedingData, walrusBreedingData);
    if (!isPregnant) return;
    
    // Position indicator above the animal (slightly offset from center)
    const indicatorX = animal.posX + 20;
    const indicatorY = animal.posY - 60;
    
    // Gentle pulsing animation (0.8 to 1.0 scale)
    const pulsePhase = (nowMs / 1500) * Math.PI; // 1.5 second cycle
    const pulseScale = 0.9 + 0.1 * Math.sin(pulsePhase);
    
    // Gentle bob animation (up/down 3px)
    const bobOffset = Math.sin(nowMs / 800) * 3;
    
    ctx.save();
    
    // Draw small thought bubble with pregnancy emoji
    const bubbleRadius = 16 * pulseScale;
    const finalY = indicatorY + bobOffset;
    
    // Bubble background - soft pink tint for pregnancy
    const gradient = ctx.createRadialGradient(indicatorX, finalY, 0, indicatorX, finalY, bubbleRadius);
    gradient.addColorStop(0, 'rgba(255, 220, 230, 0.95)'); // Soft pink center
    gradient.addColorStop(1, 'rgba(255, 200, 210, 0.85)'); // Slightly darker pink edge
    
    // Main bubble circle
    ctx.fillStyle = gradient;
    ctx.strokeStyle = 'rgba(200, 100, 130, 0.5)'; // Soft pink border
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(indicatorX, finalY, bubbleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Small tail circles pointing to animal
    const tailPositions = [
        { x: indicatorX - 8, y: finalY + bubbleRadius + 3, radius: 3 },
        { x: indicatorX - 12, y: finalY + bubbleRadius + 8, radius: 2 },
    ];
    
    tailPositions.forEach(pos => {
        ctx.fillStyle = gradient;
        ctx.strokeStyle = 'rgba(200, 100, 130, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pos.radius * pulseScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
    
    // Draw pregnancy emoji (🤰 or simpler 💕 for visibility at small sizes)
    ctx.fillStyle = 'black';
    ctx.font = `${Math.round(18 * pulseScale)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💕', indicatorX, finalY); // Using hearts for better visibility at small sizes
    
    ctx.restore();
}