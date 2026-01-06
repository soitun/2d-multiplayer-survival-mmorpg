import { drawDynamicGroundShadow } from './shadowUtils';
import { imageManager } from './imageManager';
import * as SpacetimeDB from '../../generated';
import { 
  getAnimalCollisionBounds,
  ANIMAL_COLLISION_SIZES 
} from '../animalCollisionUtils';

// Import sprite sheets (320x320, 3x3 grid, ~107x107 per frame)
// These are the PRIMARY source for all animals
import walrusWalkingSheet from '../../assets/walrus_walking.png';
import foxWalkingSheet from '../../assets/fox_walking.png';
import crabWalkingSheet from '../../assets/crab_walking.png';
import tundraWolfWalkingSheet from '../../assets/tundra_wolf_walking.png';
import cableViperWalkingSheet from '../../assets/cable_viper_walking.png';
import ternWalkingSheet from '../../assets/tern_walking.png';
import crowWalkingSheet from '../../assets/crow_walking.png';
// Flying sprite sheets for birds
import ternFlyingSheet from '../../assets/tern_flying.png';
import crowFlyingSheet from '../../assets/crow_flying.png';
// Night hostile NPC sprite sheets
import shoreboundWalkingSheet from '../../assets/shorebound_walking.png';
import shardkinWalkingSheet from '../../assets/shardkin_walking.png';
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

// Calculate frame dimensions from sheet size
const FRAME_WIDTH = Math.floor(SPRITE_SHEET_CONFIG.sheetWidth / SPRITE_SHEET_CONFIG.sheetCols);
const FRAME_HEIGHT = Math.floor(SPRITE_SHEET_CONFIG.sheetHeight / SPRITE_SHEET_CONFIG.sheetRows);
const FLYING_FRAME_WIDTH = Math.floor(FLYING_SPRITE_SHEET_CONFIG.sheetWidth / FLYING_SPRITE_SHEET_CONFIG.sheetCols);
const FLYING_FRAME_HEIGHT = Math.floor(FLYING_SPRITE_SHEET_CONFIG.sheetHeight / FLYING_SPRITE_SHEET_CONFIG.sheetRows);

// Map species to their sprite sheets (all animals now have sprite sheets)
const speciesSpriteSheets: Record<string, string> = {
    'CinderFox': foxWalkingSheet,
    'TundraWolf': tundraWolfWalkingSheet,
    'CableViper': cableViperWalkingSheet,
    'ArcticWalrus': walrusWalkingSheet,
    'BeachCrab': crabWalkingSheet,
    'Tern': ternWalkingSheet,
    'Crow': crowWalkingSheet,
    // Night hostile NPCs have custom sprites
    'Shorebound': shoreboundWalkingSheet,
    'Shardkin': shardkinWalkingSheet,
    'DrownedWatch': drownedWatchWalkingSheet,
};

// Map species to their flying sprite sheets (for birds when in flight)
const speciesFlyingSpriteSheets: Record<string, string> = {
    'Tern': ternFlyingSheet,
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

// --- Movement interpolation for smoother animal movement ---
interface AnimalMovementState {
    lastServerX: number;
    lastServerY: number;
    targetX: number;
    targetY: number;
    lastUpdateTime: number;
    interpolatedX: number;
    interpolatedY: number;
}

const animalMovementStates = new Map<string, AnimalMovementState>();

// Interpolation settings - UPDATED for 500ms server tick interval
// Animals can move ~375px in 500ms at 750px/s, so we need higher thresholds
// Slower lerp speed compensates for larger gaps between server updates
const ANIMAL_INTERPOLATION_SPEED = 0.20; // Slower interpolation for smoother movement with 500ms ticks
const MAX_INTERPOLATION_DISTANCE = 500; // Higher threshold for 500ms tick interval (was 200 for 125ms)

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
}

// Get the sprite sheet for a species (considers flying state for birds)
function getSpriteSheet(species: AnimalSpecies, isFlying: boolean = false): string {
    // Check for flying sprite sheet if the animal is flying
    if (isFlying && speciesFlyingSpriteSheets[species.tag]) {
        return speciesFlyingSpriteSheets[species.tag];
    }
    return speciesSpriteSheets[species.tag] || foxWalkingSheet; // Fallback to fox
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
            // Terns are medium-sized coastal birds
            return { width: 96, height: 96, shadowRadius: 28 };
        case 'Crow':
            // Crows are medium-sized inland birds (slightly larger)
            return { width: 104, height: 104, shadowRadius: 30 };
        // Night hostile NPCs
        case 'Shorebound':
            // Stalker - fast, lean predator (wolf-sized)
            return { width: 128, height: 128, shadowRadius: 40 };
        case 'Shardkin':
            // Swarmer - small, aggressive (smaller than crab)
            return { width: 72, height: 72, shadowRadius: 24 };
        case 'DrownedWatch':
            // Brute - large, heavy (bigger than walrus)
            return { width: 160, height: 160, shadowRadius: 52 };
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
    localPlayerPosition
}: WildAnimalRenderProps) {
    // REMOVED: No more burrowing state checks - all animals should always be visible

    const animalId = animal.id.toString();
    
    // --- Movement interpolation with collision prediction ---
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
        };
        animalMovementStates.set(animalId, movementState);
    } else {
        // Check if server position changed significantly
        const dx = animal.posX - movementState.lastServerX;
        const dy = animal.posY - movementState.lastServerY;
        const distanceMoved = Math.sqrt(dx * dx + dy * dy);
        
        if (distanceMoved > 2.0) { // Only update if animal moved more than 2 pixels (reduced sensitivity for high-speed animals)
            // Check for teleportation (too far to interpolate)
            if (distanceMoved > MAX_INTERPOLATION_DISTANCE) {
                // Teleportation detected - snap to new position
                movementState.interpolatedX = animal.posX;
                movementState.interpolatedY = animal.posY;
            } else {
                // Normal movement - update target
                movementState.targetX = animal.posX;
                movementState.targetY = animal.posY;
            }
            movementState.lastServerX = animal.posX;
            movementState.lastServerY = animal.posY;
            movementState.lastUpdateTime = nowMs;
        }
        
        // Dynamic interpolation speed based on movement distance (auto-scales to any speed)
        const distanceToTarget = Math.sqrt(
            (movementState.targetX - movementState.interpolatedX) ** 2 + 
            (movementState.targetY - movementState.interpolatedY) ** 2
        );
        
        // Auto-adaptive speed based on how far behind we are (works for any animal speed)
        let adaptiveSpeed = ANIMAL_INTERPOLATION_SPEED;
        if (distanceToTarget > 40) { // Large gap = much faster catchup
            adaptiveSpeed = 0.6;
        } else if (distanceToTarget > 15) { // Medium gap = faster catchup  
            adaptiveSpeed = 0.45;
        }
        
        // Use adaptive interpolation for smooth movement
        const lerpX = movementState.interpolatedX + (movementState.targetX - movementState.interpolatedX) * adaptiveSpeed;
        const lerpY = movementState.interpolatedY + (movementState.targetY - movementState.interpolatedY) * adaptiveSpeed;
        
        movementState.interpolatedX = lerpX;
        movementState.interpolatedY = lerpY;
        
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
    const spriteSheetSrc = getSpriteSheet(animal.species, useFlying);
    const spriteSheetImage = imageManager.getImage(spriteSheetSrc);
    
    // Get the appropriate frame dimensions based on flying state
    const currentFrameWidth = useFlying ? FLYING_FRAME_WIDTH : FRAME_WIDTH;
    const currentFrameHeight = useFlying ? FLYING_FRAME_HEIGHT : FRAME_HEIGHT;
    
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
            // Night hostile NPCs
            case 'Shorebound': return '#2C5F2D'; // Dark forest green
            case 'Shardkin': return '#4A0E4E'; // Dark purple
            case 'DrownedWatch': return '#1B3A4B'; // Deep ocean blue
            default: return '#9013FE'; // Purple
        }
    };
    
    const useImageFallback = !animalImage || !animalImage.complete;

    const props = getSpeciesRenderingProps(animal.species);
    
    // Terns are twice as large when flying (their flying sprite sheet is smaller)
    // Crows stay the same size
    const flyingSizeMultiplier = (animal.species.tag === 'Tern' && useFlying) ? 1.75 : 1.0;
    const renderWidth = props.width * flyingSizeMultiplier;
    const renderHeight = props.height * flyingSizeMultiplier;
    
    const renderX = renderPosX - renderWidth / 2 + shakeX; // Apply shake to X (using interpolated position)
    const renderY = renderPosY - renderHeight / 2 + shakeY; // Apply shake to Y (using interpolated position)

    // No animals hide anymore - always fully visible
    const alpha = 1.0;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Note: No horizontal flipping needed - sprite sheets have all 4 directions
    // Legacy flipping is only used for static images that don't have sprite sheets
    const shouldFlip = !useSpriteSheet && animal.facingDirection === "right";
    if (shouldFlip) {
        ctx.scale(-1, 1); // Flip horizontally
        ctx.translate(-renderPosX * 2, 0); // Adjust position after flipping
    }

    // Render dynamic shadow based on time of day (using current sprite frame)
    {
        ctx.save();
        if (useSpriteSheet && animalImage) {
            // Create a temporary canvas to extract the current frame for shadow
            const shadowCanvas = document.createElement('canvas');
            shadowCanvas.width = currentFrameWidth;
            shadowCanvas.height = currentFrameHeight;
            const shadowCtx = shadowCanvas.getContext('2d');
            
            if (shadowCtx) {
                const spriteRect = getSpriteSourceRect(animal.facingDirection, useFlying);
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
            const spriteRect = useSpriteSheet 
                ? getSpriteSourceRect(animal.facingDirection, useFlying)
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
                const spriteRect = getSpriteSourceRect(animal.facingDirection, useFlying);
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

    ctx.restore();
}

// Preload wild animal images using imageManager
export function preloadWildAnimalImages(): void {
    // All animal sprite sheets (walking/grounded)
    const spriteSheets = [
        walrusWalkingSheet,
        foxWalkingSheet,
        crabWalkingSheet,
        tundraWolfWalkingSheet,
        cableViperWalkingSheet,
        ternWalkingSheet,
        crowWalkingSheet,
        // Night hostile NPCs
        shoreboundWalkingSheet,
        shardkinWalkingSheet,
        drownedWatchWalkingSheet,
    ];
    
    // Flying sprite sheets for birds
    const flyingSpriteSheets = [
        ternFlyingSheet,
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