import { AnimalCorpse as SpacetimeDBAnimalCorpse } from '../../generated';
import { imageManager } from './imageManager';

// Import legacy 3x3 sprite sheets (CableViper only - no release spritesheet)
import cableViperWalkingSheet from '../../assets/cable_viper_walking.png';

// Import release pattern spritesheets (4x4 layout) - used for most animals
import foxWalkingAnimatedSheet from '../../assets/fox_walking_release.png';
import tundraWolfWalkingAnimatedSheet from '../../assets/tundra_wolf_walking_release.png';
import walrusWalkingAnimatedSheet from '../../assets/walrus_walking_release.png';
import ternWalkingAnimatedSheet from '../../assets/tern_walking_release.png';
import wolverineWalkingAnimatedSheet from '../../assets/wolverine_walking_release.png';
import caribouWalkingAnimatedSheet from '../../assets/caribou_walking_release.png';
import salmonSharkWalkingAnimatedSheet from '../../assets/salmon_shark_walking_release.png';
import jellyfishWalkingAnimatedSheet from '../../assets/jellyfish_walking_release.png';
// Alpine animals (4x4 release pattern)
import polarBearWalkingAnimatedSheet from '../../assets/polar_bear_walking_release.png';
import hareWalkingAnimatedSheet from '../../assets/hare_walking_release.png';
import snowyOwlWalkingAnimatedSheet from '../../assets/owl_walking_release.png';
// Crow (4x4 release pattern)
import crowWalkingAnimatedSheet from '../../assets/crow_walking_release.png';
import crabWalkingAnimatedSheet from '../../assets/crab_release_walking.png';
import voleWalkingAnimatedSheet from '../../assets/vole_walking_release.png';

// Sprite sheet configuration for 3x3 sheets (legacy pattern)
const SPRITE_SHEET_CONFIG_3X3 = {
    sheetWidth: 320,
    sheetHeight: 320,
    sheetCols: 3,
    sheetRows: 3, 
};

// Sprite sheet configuration for 4x4 release pattern sheets
const SPRITE_SHEET_CONFIG_4X4 = {
    sheetWidth: 320,
    sheetHeight: 320,
    sheetCols: 4,
    sheetRows: 4,
};

const FRAME_WIDTH_3X3 = Math.floor(SPRITE_SHEET_CONFIG_3X3.sheetWidth / SPRITE_SHEET_CONFIG_3X3.sheetCols);
const FRAME_HEIGHT_3X3 = Math.floor(SPRITE_SHEET_CONFIG_3X3.sheetHeight / SPRITE_SHEET_CONFIG_3X3.sheetRows);

const FRAME_WIDTH_4X4 = Math.floor(SPRITE_SHEET_CONFIG_4X4.sheetWidth / SPRITE_SHEET_CONFIG_4X4.sheetCols);
const FRAME_HEIGHT_4X4 = Math.floor(SPRITE_SHEET_CONFIG_4X4.sheetHeight / SPRITE_SHEET_CONFIG_4X4.sheetRows);

// Right-facing sprite position for 3x3 sheets (middle left of sheet - col 0, row 1)
const RIGHT_FACING_COL_3X3 = 0;
const RIGHT_FACING_ROW_3X3 = 1;

// For 4x4 release pattern: use frame 0, direction 0 (down-facing, first frame)
// This gives us a good corpse pose - then flip it upside down
const CORPSE_FRAME_4X4 = 0; // First animation frame
const CORPSE_DIRECTION_4X4 = 0; // Down-facing (row 0)

// Animal corpse dimensions and rendering constants
export const ANIMAL_CORPSE_HEIGHT = 96; // Height for interaction indicators
export const ANIMAL_CORPSE_COLLISION_RADIUS = 16; // From server-side constant

// Map species to their sprite sheets
// Animals using 4x4 release pattern: Most animals (fox, wolf, walrus, tern, wolverine, caribou, shark, crow, alpine animals, BeachCrab, Vole)
// Animals using 3x3 pattern: CableViper only (no release spritesheet)
const speciesSpriteSheets: Record<string, string> = {
    // 4x4 release pattern animals
    'CinderFox': foxWalkingAnimatedSheet,
    'TundraWolf': tundraWolfWalkingAnimatedSheet,
    'ArcticWalrus': walrusWalkingAnimatedSheet,
    'Tern': ternWalkingAnimatedSheet,
    'Wolverine': wolverineWalkingAnimatedSheet,
    'Caribou': caribouWalkingAnimatedSheet,
    'SalmonShark': salmonSharkWalkingAnimatedSheet,
    'Jellyfish': jellyfishWalkingAnimatedSheet,
    'Crow': crowWalkingAnimatedSheet,
    // Alpine animals (4x4 release pattern)
    'PolarBear': polarBearWalkingAnimatedSheet,
    'Hare': hareWalkingAnimatedSheet,
    'SnowyOwl': snowyOwlWalkingAnimatedSheet,
    // BeachCrab and Vole use 4x4 release pattern (like live animals)
    'BeachCrab': crabWalkingAnimatedSheet,
    'Vole': voleWalkingAnimatedSheet,
    // 3x3 legacy pattern (CableViper only - no release spritesheet)
    'CableViper': cableViperWalkingSheet,
};

// Track which species use 4x4 release pattern
const usesReleasePattern: Record<string, boolean> = {
    // 4x4 release pattern
    'CinderFox': true,
    'TundraWolf': true,
    'ArcticWalrus': true,
    'Tern': true,
    'Wolverine': true,
    'Caribou': true,
    'SalmonShark': true,
    'Jellyfish': true,
    'Crow': true,
    // Alpine animals (4x4 release pattern)
    'PolarBear': true,
    'Hare': true,
    'SnowyOwl': true,
    // BeachCrab and Vole use 4x4 release pattern
    'BeachCrab': true,
    'Vole': true,
    // 3x3 legacy pattern (CableViper only - no release spritesheet)
    'CableViper': false,
};

// Get corpse render size based on species (match live animal sizes)
function getCorpseRenderSize(species: any): { width: number; height: number } {
    switch (species.tag) {
        case 'ArcticWalrus':
            return { width: 128, height: 128 };
        case 'TundraWolf':
            return { width: 128, height: 128 };
        case 'CinderFox':
            return { width: 128, height: 128 };
        case 'CableViper':
            return { width: 96, height: 96 };
        case 'BeachCrab':
            return { width: 64, height: 64 };
        case 'Bee':
            // Bees don't produce corpses (they just poof when killed by fire)
            // Return 0 size to skip rendering
            return { width: 0, height: 0 };
        case 'Jellyfish':
            // Jellyfish corpses - harvestable with Tidebreaker Blade
            return { width: 96, height: 96 };
        case 'Tern':
            return { width: 96, height: 96 }; // Medium-sized coastal bird
        case 'Crow':
            return { width: 88, height: 88 }; // Medium-sized inland bird
        case 'Vole':
            return { width: 48, height: 48 }; // Tiny rodent
        case 'Wolverine':
            return { width: 112, height: 112 }; // Stocky medium predator
        case 'Caribou':
            return { width: 128, height: 128 }; // Large herd herbivore
        case 'SalmonShark':
            return { width: 160, height: 160 }; // Large aquatic predator
        // Alpine animals
        case 'PolarBear':
            return { width: 160, height: 160 }; // Massive apex predator
        case 'Hare':
            return { width: 80, height: 80 }; // Small fast prey animal
        case 'SnowyOwl':
            return { width: 96, height: 96 }; // Medium aggressive flying bird
        default:
            return { width: 96, height: 96 };
    }
}

// Helper function to get sprite sheet for animal corpse
function getCorpseSpriteSheet(species: any): string {
    return speciesSpriteSheets[species.tag] || foxWalkingAnimatedSheet;
}

// Preload animal corpse images using imageManager
export const preloadAnimalCorpseImages = () => {
    // Preload all sprite sheets (includes all release and legacy sheets)
    Object.values(speciesSpriteSheets).forEach(sheet => {
        imageManager.preloadImage(sheet);
    });
};

/**
 * Renders an animal corpse as a flipped animal sprite (facing right, upside down)
 */
export const renderAnimalCorpse = (
  ctx: CanvasRenderingContext2D,
  corpse: SpacetimeDBAnimalCorpse,
  currentTime: number
) => {
  // Bees don't produce corpses - they just disappear when killed by fire
  // Skip rendering entirely for bees (shouldn't happen, but just in case)
  if (corpse.animalSpecies.tag === 'Bee') {
    return;
  }

  // Canvas is already translated, so we use world coordinates directly
  const screenX = corpse.posX;
  const screenY = corpse.posY;

  // Get the appropriate sprite sheet based on species
  const spriteSheetSrc = getCorpseSpriteSheet(corpse.animalSpecies);
  const spriteSheet = imageManager.getImage(spriteSheetSrc);
  
  // Get render size for this species
  const renderSize = getCorpseRenderSize(corpse.animalSpecies);
  
  if (!spriteSheet || !spriteSheet.complete) {
    // Fallback: render a simple rectangle if image not loaded
    ctx.fillStyle = '#8B4513'; // Brown color for corpse
    ctx.fillRect(screenX - renderSize.width / 2, screenY - renderSize.height / 2, renderSize.width, renderSize.height);
    return;
  }

  ctx.save();

  // Calculate shaking offset if corpse was recently damaged
  let shakeX = 0;
  let shakeY = 0;
  
  // Check if corpse was damaged recently (within last 200ms)
  // Handle both timestamp property names for compatibility
  const SHAKE_DURATION_MS = 200;
  if (corpse.lastHitTime) {
    const lastHitTimeMs = Number(
      (corpse.lastHitTime as any).microsSinceUnixEpoch || 
      (corpse.lastHitTime as any).__timestamp_micros_since_unix_epoch__ || 
      0n
    ) / 1000;
    const timeSinceLastDamage = currentTime - lastHitTimeMs;
    
    if (timeSinceLastDamage >= 0 && timeSinceLastDamage < SHAKE_DURATION_MS) {
      const shakeIntensity = Math.max(0, 3 - (timeSinceLastDamage / SHAKE_DURATION_MS) * 3);
      shakeX = (Math.random() - 0.5) * shakeIntensity * 2;
      shakeY = (Math.random() - 0.5) * shakeIntensity * 2;
    }
  }

  // Move to corpse position with shake offset
  ctx.translate(screenX + shakeX, screenY + shakeY);
  
  // Flip vertically only (upside down but still facing right)
  ctx.scale(1, -1);
  
  // Check if this species uses the 4x4 release pattern
  const isReleasePattern = usesReleasePattern[corpse.animalSpecies.tag] || false;
  
  let sx: number;
  let sy: number;
  let frameWidth: number;
  let frameHeight: number;
  
  if (isReleasePattern) {
    // 4x4 release pattern: use frame 0, direction 0 (down-facing)
    // Then flip upside down for corpse effect
    // SalmonShark and Jellyfish use same 320x320 sheet with 80x80 frames as other animals
    sx = CORPSE_FRAME_4X4 * FRAME_WIDTH_4X4;
    sy = CORPSE_DIRECTION_4X4 * FRAME_HEIGHT_4X4;
    frameWidth = FRAME_WIDTH_4X4;
    frameHeight = FRAME_HEIGHT_4X4;
  } else {
    // 3x3 pattern: use right-facing sprite (col 0, row 1)
    sx = RIGHT_FACING_COL_3X3 * FRAME_WIDTH_3X3;
    sy = RIGHT_FACING_ROW_3X3 * FRAME_HEIGHT_3X3;
    frameWidth = FRAME_WIDTH_3X3;
    frameHeight = FRAME_HEIGHT_3X3;
  }
  
  // Render the sprite frame (flipped vertically)
  ctx.drawImage(
    spriteSheet,
    sx, sy, frameWidth, frameHeight,  // Source rect from sprite sheet
    -renderSize.width / 2, -renderSize.height / 2, renderSize.width, renderSize.height  // Dest rect
  );

  ctx.restore();
};

// Export for use in interaction system
export const getAnimalCorpseInteractionBounds = (corpse: SpacetimeDBAnimalCorpse) => ({
  x: corpse.posX - ANIMAL_CORPSE_COLLISION_RADIUS,
  y: corpse.posY - ANIMAL_CORPSE_COLLISION_RADIUS,
  width: ANIMAL_CORPSE_COLLISION_RADIUS * 2,
  height: ANIMAL_CORPSE_COLLISION_RADIUS * 2,
});
