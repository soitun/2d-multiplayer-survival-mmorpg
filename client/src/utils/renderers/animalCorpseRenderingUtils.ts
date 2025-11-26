import { AnimalCorpse as SpacetimeDBAnimalCorpse } from '../../generated';
import { imageManager } from './imageManager';

// Import sprite sheets (same as wildAnimalRenderingUtils)
import walrusWalkingSheet from '../../assets/walrus_walking.png';
import foxWalkingSheet from '../../assets/fox_walking.png';
import crabWalkingSheet from '../../assets/crab_walking.png';
import tundraWolfWalkingSheet from '../../assets/tundra_wolf_walking.png';
import cableViperWalkingSheet from '../../assets/cable_viper_walking.png';

// Sprite sheet configuration (must match wildAnimalRenderingUtils)
const SPRITE_SHEET_CONFIG = {
    sheetWidth: 320,
    sheetHeight: 320,
    sheetCols: 3,
    sheetRows: 3,
};

const FRAME_WIDTH = Math.floor(SPRITE_SHEET_CONFIG.sheetWidth / SPRITE_SHEET_CONFIG.sheetCols);
const FRAME_HEIGHT = Math.floor(SPRITE_SHEET_CONFIG.sheetHeight / SPRITE_SHEET_CONFIG.sheetRows);

// Right-facing sprite position (middle left of sheet - col 0, row 1)
const RIGHT_FACING_COL = 0;
const RIGHT_FACING_ROW = 1;

// Animal corpse dimensions and rendering constants
export const ANIMAL_CORPSE_HEIGHT = 96; // Height for interaction indicators
export const ANIMAL_CORPSE_COLLISION_RADIUS = 16; // From server-side constant

// Map species to their sprite sheets
const speciesSpriteSheets: Record<string, string> = {
    'CinderFox': foxWalkingSheet,
    'TundraWolf': tundraWolfWalkingSheet,
    'CableViper': cableViperWalkingSheet,
    'ArcticWalrus': walrusWalkingSheet,
    'BeachCrab': crabWalkingSheet,
};

// Get corpse render size based on species (match live animal sizes)
function getCorpseRenderSize(species: any): { width: number; height: number } {
    switch (species.tag) {
        case 'ArcticWalrus':
            return { width: 128, height: 128 };
        case 'TundraWolf':
            return { width: 96, height: 96 };
        case 'CinderFox':
            return { width: 112, height: 112 };
        case 'CableViper':
            return { width: 72, height: 72 };
        case 'BeachCrab':
            return { width: 64, height: 64 };
        default:
            return { width: 96, height: 96 };
    }
}

// Helper function to get sprite sheet for animal corpse
function getCorpseSpriteSheet(species: any): string {
    return speciesSpriteSheets[species.tag] || foxWalkingSheet;
}

// Preload animal corpse images using imageManager
export const preloadAnimalCorpseImages = () => {
    // Preload all sprite sheets
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
  const timeSinceLastDamage = currentTime - Number(corpse.lastHitTime?.microsSinceUnixEpoch || 0n) / 1000;
  if (timeSinceLastDamage < 200) {
    const shakeIntensity = Math.max(0, 3 - (timeSinceLastDamage / 200) * 3);
    shakeX = (Math.random() - 0.5) * shakeIntensity * 2;
    shakeY = (Math.random() - 0.5) * shakeIntensity * 2;
  }

  // Move to corpse position with shake offset
  ctx.translate(screenX + shakeX, screenY + shakeY);
  
  // Flip vertically only (upside down but still facing right)
  ctx.scale(1, -1);
  
  // Calculate source rectangle for the right-facing sprite
  const sx = RIGHT_FACING_COL * FRAME_WIDTH;
  const sy = RIGHT_FACING_ROW * FRAME_HEIGHT;
  
  // Render the sprite frame (flipped vertically)
  ctx.drawImage(
    spriteSheet,
    sx, sy, FRAME_WIDTH, FRAME_HEIGHT,  // Source rect from sprite sheet
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
