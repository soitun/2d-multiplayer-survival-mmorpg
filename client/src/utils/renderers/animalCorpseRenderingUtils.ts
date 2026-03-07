import { AnimalCorpse as SpacetimeDBAnimalCorpse } from '../../generated/types';
import { imageManager } from './imageManager';
import { calculateShakeOffsets } from './shadowUtils';

// Import release pattern spritesheets (4x4 layout) - used for most animals
import cableViperWalkingSheet from '../../assets/cable_viper_walking_release.png';
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

// Sprite sheet configuration for 4x4 sheets (Phase 6: 256x256, all animals)
const SPRITE_SHEET_CONFIG_4X4 = {
    sheetWidth: 256,
    sheetHeight: 256,
    sheetCols: 4,
    sheetRows: 4,
};

const FRAME_WIDTH_4X4 = Math.floor(SPRITE_SHEET_CONFIG_4X4.sheetWidth / SPRITE_SHEET_CONFIG_4X4.sheetCols);
const FRAME_HEIGHT_4X4 = Math.floor(SPRITE_SHEET_CONFIG_4X4.sheetHeight / SPRITE_SHEET_CONFIG_4X4.sheetRows);

// For 4x4 pattern: use frame 0, direction 0 (down-facing, first frame)
// This gives us a good corpse pose - then flip it upside down
const CORPSE_FRAME_4X4 = 0; // First animation frame
const CORPSE_DIRECTION_4X4 = 0; // Down-facing (row 0)

// Animal corpse dimensions and rendering constants
export const ANIMAL_CORPSE_HEIGHT = 96; // Height for interaction indicators
export const ANIMAL_CORPSE_COLLISION_RADIUS = 16; // From server-side constant

// --- Client-side animation tracking for animal corpse shakes (optimistic) ---
const clientAnimalCorpseShakeStartTimes = new Map<string, number>();
const lastKnownServerAnimalCorpseShakeTimes = new Map<string, number>();

const SHAKE_DURATION_MS = 200;
const SHAKE_INTENSITY_PX = 6;
const CORPSE_SPAWN_FLASH_MS = 140;
const ANIMAL_CORPSE_DESTRUCTION_DURATION_MS = 1000;
const ANIMAL_CORPSE_CHUNK_SLICE_LEVELS = 2;

/** Trigger animal corpse shake immediately (optimistic feedback) when player initiates a hit. */
export function triggerAnimalCorpseShakeOptimistic(corpseId: string): void {
  clientAnimalCorpseShakeStartTimes.set(corpseId, Date.now());
}

// Map species to their sprite sheets
// All animals use 4x4 pattern (256x256 sheet, 64x64 frames)
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
    // CableViper uses 4x4 (same as other wildlife)
    'CableViper': cableViperWalkingSheet,
};

interface AnimalCorpseDestructionChunk {
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  drawW: number;
  drawH: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  gravity: number;
}

interface AnimalCorpseDestructionEffect {
  corpseId: string;
  startTime: number;
  duration: number;
  chunks: AnimalCorpseDestructionChunk[];
  spriteSheet: HTMLImageElement;
}

const activeAnimalCorpseDestructions = new Map<string, AnimalCorpseDestructionEffect>();
const animalCorpseDestructionsToRemove: string[] = [];

function sliceRectIntoChunks(
  x: number,
  y: number,
  w: number,
  h: number,
  level: number,
  maxLevel: number,
  out: Array<{ srcX: number; srcY: number; srcW: number; srcH: number }>
): void {
  if (level >= maxLevel || w < 8 || h < 8) {
    out.push({ srcX: x, srcY: y, srcW: w, srcH: h });
    return;
  }

  if (level % 2 === 0) {
    const mid = Math.floor(h / 2);
    sliceRectIntoChunks(x, y, w, mid, level + 1, maxLevel, out);
    sliceRectIntoChunks(x, y + mid, w, h - mid, level + 1, maxLevel, out);
  } else {
    const mid = Math.floor(w / 2);
    sliceRectIntoChunks(x, y, mid, h, level + 1, maxLevel, out);
    sliceRectIntoChunks(x + mid, y, w - mid, h, level + 1, maxLevel, out);
  }
}

function generateAnimalCorpseDestructionChunks(
  corpse: SpacetimeDBAnimalCorpse,
  renderWidth: number,
  renderHeight: number,
): AnimalCorpseDestructionChunk[] {
  const srcRects: Array<{ srcX: number; srcY: number; srcW: number; srcH: number }> = [];
  sliceRectIntoChunks(0, 0, renderWidth, renderHeight, 0, ANIMAL_CORPSE_CHUNK_SLICE_LEVELS, srcRects);

  const sxBase = CORPSE_FRAME_4X4 * FRAME_WIDTH_4X4;
  const syBase = CORPSE_DIRECTION_4X4 * FRAME_HEIGHT_4X4;
  const scaleX = FRAME_WIDTH_4X4 / renderWidth;
  const scaleY = FRAME_HEIGHT_4X4 / renderHeight;
  const baseSpeed = 3.5 + Math.random() * 3.5;
  const centerX = corpse.posX;
  const centerY = corpse.posY;

  return srcRects.map((rect) => {
    const chunkCenterX = centerX - renderWidth / 2 + rect.srcX + rect.srcW / 2;
    const chunkCenterY = centerY - renderHeight / 2 + rect.srcY + rect.srcH / 2;
    const dx = chunkCenterX - centerX;
    const dy = chunkCenterY - centerY;
    const angle = Math.atan2(dy, dx);
    const speed = baseSpeed * (0.75 + Math.random() * 0.55);

    return {
      srcX: sxBase + rect.srcX * scaleX,
      srcY: syBase + rect.srcY * scaleY,
      srcW: rect.srcW * scaleX,
      srcH: rect.srcH * scaleY,
      drawW: rect.srcW,
      drawH: rect.srcH,
      x: chunkCenterX,
      y: chunkCenterY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.8 - Math.random() * 2.6,
      rotation: (Math.random() - 0.5) * 0.5,
      rotationSpeed: (Math.random() - 0.5) * 0.14,
      gravity: 0.2,
    };
  });
}

export function triggerAnimalCorpseDestructionEffect(corpse: SpacetimeDBAnimalCorpse): void {
  const corpseId = corpse.id.toString();
  if (activeAnimalCorpseDestructions.has(corpseId)) return;
  if (corpse.animalSpecies.tag === 'Bee') return;

  const spriteSheetSrc = getCorpseSpriteSheet(corpse.animalSpecies);
  const spriteSheet = imageManager.getImage(spriteSheetSrc);
  if (!spriteSheet || !spriteSheet.complete || spriteSheet.naturalWidth === 0) return;

  const renderSize = getCorpseRenderSize(corpse.animalSpecies);
  const effect: AnimalCorpseDestructionEffect = {
    corpseId,
    startTime: Date.now(),
    duration: ANIMAL_CORPSE_DESTRUCTION_DURATION_MS,
    chunks: generateAnimalCorpseDestructionChunks(corpse, renderSize.width, renderSize.height),
    spriteSheet,
  };

  activeAnimalCorpseDestructions.set(corpseId, effect);
}

export function renderAnimalCorpseDestructionEffects(ctx: CanvasRenderingContext2D, nowMs: number): void {
  if (activeAnimalCorpseDestructions.size === 0) return;

  animalCorpseDestructionsToRemove.length = 0;

  activeAnimalCorpseDestructions.forEach((effect, corpseId) => {
    const elapsed = nowMs - effect.startTime;
    const progress = elapsed / effect.duration;
    if (progress >= 1) {
      animalCorpseDestructionsToRemove.push(corpseId);
      return;
    }

    const fadeStart = 0.45;
    const alphaMultiplier = progress > fadeStart ? 1 - (progress - fadeStart) / (1 - fadeStart) : 1;

    for (const chunk of effect.chunks) {
      chunk.vy += chunk.gravity;
      chunk.x += chunk.vx;
      chunk.y += chunk.vy;
      chunk.rotation += chunk.rotationSpeed;
      chunk.vx *= 0.98;

      if (alphaMultiplier < 0.02) continue;

      ctx.save();
      ctx.translate(chunk.x, chunk.y);
      ctx.rotate(chunk.rotation);
      ctx.scale(1, -1);
      ctx.globalAlpha = alphaMultiplier;
      ctx.drawImage(
        effect.spriteSheet,
        chunk.srcX, chunk.srcY, chunk.srcW, chunk.srcH,
        -chunk.drawW / 2, -chunk.drawH / 2, chunk.drawW, chunk.drawH
      );
      ctx.restore();
    }
  });

  for (const corpseId of animalCorpseDestructionsToRemove) {
    activeAnimalCorpseDestructions.delete(corpseId);
  }
}

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

  // Use calculateShakeOffsets for server + optimistic shake (consistent with barrels/trees)
  const entityWithLastHit = { lastHitTime: corpse.lastHitTime ?? null };
  const { shakeOffsetX: shakeX, shakeOffsetY: shakeY } = calculateShakeOffsets(
    entityWithLastHit,
    corpse.id.toString(),
    {
      clientStartTimes: clientAnimalCorpseShakeStartTimes,
      lastKnownServerTimes: lastKnownServerAnimalCorpseShakeTimes
    },
    SHAKE_DURATION_MS,
    SHAKE_INTENSITY_PX,
    undefined,
    { suppressRestartIfRecentClientShake: true }
  );

  // Move to corpse position with shake offset
  ctx.translate(screenX + shakeX, screenY + shakeY);
  
  // Flip vertically only (upside down but still facing right)
  ctx.scale(1, -1);
  
  // 4x4 pattern: use frame 0, direction 0 (down-facing), flip upside down for corpse effect
  const sx = CORPSE_FRAME_4X4 * FRAME_WIDTH_4X4;
  const sy = CORPSE_DIRECTION_4X4 * FRAME_HEIGHT_4X4;
  const frameWidth = FRAME_WIDTH_4X4;
  const frameHeight = FRAME_HEIGHT_4X4;
  
  // Render the sprite frame (flipped vertically)
  ctx.drawImage(
    spriteSheet,
    sx, sy, frameWidth, frameHeight,  // Source rect from sprite sheet
    -renderSize.width / 2, -renderSize.height / 2, renderSize.width, renderSize.height  // Dest rect
  );

  const corpseSpawnedAtMs = Number(corpse.spawnedAt.microsSinceUnixEpoch / 1000n);
  const corpseFlashAgeMs = Math.max(0, currentTime - corpseSpawnedAtMs);
  if (corpseFlashAgeMs < CORPSE_SPAWN_FLASH_MS) {
    const flashAlpha = 1 - (corpseFlashAgeMs / CORPSE_SPAWN_FLASH_MS);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.95, 0.55 + flashAlpha * 0.4)})`;
    ctx.fillRect(
      -renderSize.width / 2,
      -renderSize.height / 2,
      renderSize.width,
      renderSize.height
    );
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();
};

// Export for use in interaction system
export const getAnimalCorpseInteractionBounds = (corpse: SpacetimeDBAnimalCorpse) => ({
  x: corpse.posX - ANIMAL_CORPSE_COLLISION_RADIUS,
  y: corpse.posY - ANIMAL_CORPSE_COLLISION_RADIUS,
  width: ANIMAL_CORPSE_COLLISION_RADIUS * 2,
  height: ANIMAL_CORPSE_COLLISION_RADIUS * 2,
});
