import { Shelter as SpacetimeDBShelter, Player as SpacetimeDBPlayer } from '../../generated';
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { renderHealthBar, getLastHitTimeMs } from './healthBarUtils';

// Import terrain-specific shelter images
import shelterDefaultImage from '../../assets/doodads/shelter.png';
import shelterBeachImage from '../../assets/doodads/shelter_beach.png';
import shelterTundraImage from '../../assets/doodads/shelter_tundra.png';
import shelterAlpineImage from '../../assets/doodads/shelter_alpine.png';

// --- Terrain Variant Constants (must match server-side values) ---
const SHELTER_TERRAIN_DEFAULT = 0;  // Grass, Dirt, Forest, etc.
const SHELTER_TERRAIN_BEACH = 1;    // Beach tiles
const SHELTER_TERRAIN_TUNDRA = 2;   // Tundra, TundraGrass
const SHELTER_TERRAIN_ALPINE = 3;   // Alpine terrain

// --- Shelter Variant Image Management ---
// Pre-load all shelter variant images for efficient lookup
const shelterVariantImageSources: string[] = [
  shelterDefaultImage,  // Index 0: Default
  shelterBeachImage,    // Index 1: Beach
  shelterTundraImage,   // Index 2: Tundra
  shelterAlpineImage,   // Index 3: Alpine
];

// Cache for loaded HTMLImageElement objects
const shelterVariantImages: (HTMLImageElement | null)[] = [null, null, null, null];
let imagesLoading = false;

// Pre-load all shelter variant images
function ensureShelterImagesLoaded(): void {
  if (imagesLoading) return;
  imagesLoading = true;
  
  shelterVariantImageSources.forEach((src, index) => {
    if (!shelterVariantImages[index]) {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        shelterVariantImages[index] = img;
      };
      img.onerror = () => {
        console.warn(`[ShelterRenderer] Failed to load shelter variant image: ${src}`);
      };
    }
  });
}

// Initialize loading on module import
ensureShelterImagesLoaded();

/**
 * Gets the appropriate shelter image based on terrain variant.
 * Uses efficient array lookup - O(1) operation.
 * Falls back to provided shelterImage if variant image isn't loaded yet.
 */
export function getShelterImageForVariant(
  terrainVariant: number,
  fallbackImage: HTMLImageElement | null
): HTMLImageElement | null {
  // Clamp variant to valid range
  const variant = Math.max(0, Math.min(terrainVariant, shelterVariantImages.length - 1));
  
  // Return cached variant image if available, otherwise fallback
  return shelterVariantImages[variant] || fallbackImage;
}

interface RenderShelterProps {
  ctx: CanvasRenderingContext2D;
  shelter: SpacetimeDBShelter;
  shelterImage: HTMLImageElement | null; // Fallback/default image
  nowMs: number; // For potential animations or effects
  cycleProgress: number; // For dynamic shadows based on time of day
  localPlayerId?: string; // ADDED
  localPlayerPosition?: {x: number, y: number} | null; // ADDED
  renderPass?: 'bottom' | 'top' | 'full'; // ADDED: Which part of the shelter to render
}

// Shelter visual properties (can be adjusted or moved to a config)
export const SHELTER_RENDER_WIDTH = 384;
export const SHELTER_RENDER_HEIGHT = 384;
// Y-offset for rendering the image relative to its pos_y (base of the shelter)
// If shelter.posY is the bottom-center of the 384x384 image, we draw it upwards.
const SHELTER_IMAGE_DRAW_OFFSET_Y = SHELTER_RENDER_HEIGHT; 

// Shake effect constants for Shelter
const SHELTER_SHAKE_DURATION_MS = 180; // Slightly longer or shorter than tree based on desired feel
const SHELTER_SHAKE_INTENSITY_PX = 6; // Less intense for a large, sturdy object

// --- Client-side animation tracking for shelter shakes ---
const clientShelterShakeStartTimes = new Map<string, number>(); // shelterId -> client timestamp when shake started
const lastKnownServerShelterShakeTimes = new Map<string, number>();

const SHELTER_OUTLINE_THICKNESS = 1; // Thinner debug outline
const SHELTER_OUTLINE_COLOR = 'rgba(92, 62, 33, 0.6)'; // Earthy brown tone
// DEBUG: Server-side AABB collision constants (mirror what's in server/src/shelter.rs)
const DEBUG_SHELTER_COLLISION_WIDTH = 300.0;
const DEBUG_SHELTER_COLLISION_HEIGHT = 125.0;
const DEBUG_SHELTER_AABB_CENTER_Y_FROM_BASE = 200.0;

export const renderShelter = ({
  ctx,
  shelter,
  shelterImage,
  nowMs,
  cycleProgress,
  localPlayerId,
  localPlayerPosition,
}: RenderShelterProps) => {
  // Get the terrain-appropriate shelter image
  // Uses efficient O(1) array lookup based on terrainVariant field
  const variantImage = getShelterImageForVariant(shelter.terrainVariant, shelterImage);
  
  if (!variantImage || shelter.isDestroyed) {
    return;
  }

  let isOwnerInside = false;
  // Calculate AABB properties for owner check AND for outline drawing
  const aabbCenterX = shelter.posX;
  const aabbCenterY = shelter.posY - DEBUG_SHELTER_AABB_CENTER_Y_FROM_BASE;
  const aabbMinX = aabbCenterX - DEBUG_SHELTER_COLLISION_WIDTH / 2;
  const aabbMinY = aabbCenterY - DEBUG_SHELTER_COLLISION_HEIGHT / 2;

  if (localPlayerId && localPlayerPosition && shelter.placedBy.toHexString() === localPlayerId) {
    // Check if player's center is within the AABB for the transparency/passthrough effect
    if (localPlayerPosition.x >= aabbMinX && localPlayerPosition.x <= aabbMinX + DEBUG_SHELTER_COLLISION_WIDTH &&
        localPlayerPosition.y >= aabbMinY && localPlayerPosition.y <= aabbMinY + DEBUG_SHELTER_COLLISION_HEIGHT) {
      isOwnerInside = true;
    }
  }

  ctx.save(); // Save context for potential alpha/stroke changes

  if (isOwnerInside) {
    ctx.globalAlpha = 0.3; // 30% opacity for see-through
  }

  // --- Shadow Rendering --- 
  // The shadow is cast from the base of the shelter.
  // entityCenterX is shelter.posX
  // entityBaseY is shelter.posY
  
  // Calculate shake offsets for shadow synchronization using helper function
  const { shakeOffsetX: shadowShakeOffsetX, shakeOffsetY: shadowShakeOffsetY } = calculateShakeOffsets(
    shelter,
    shelter.id.toString(),
    {
      clientStartTimes: clientShelterShakeStartTimes,
      lastKnownServerTimes: lastKnownServerShelterShakeTimes
    },
    SHELTER_SHAKE_DURATION_MS,
    SHELTER_SHAKE_INTENSITY_PX
  );

  drawDynamicGroundShadow({
    ctx,
    entityImage: variantImage, // The terrain-specific image used to derive shadow silhouette
    entityCenterX: shelter.posX,
    entityBaseY: shelter.posY, 
    imageDrawWidth: SHELTER_RENDER_WIDTH,
    imageDrawHeight: SHELTER_RENDER_HEIGHT,
    cycleProgress: cycleProgress,
    // Adjusted optional parameters for a shadow closer to the example image
    baseShadowColor: '0,0,0', 
    maxShadowAlpha: 0.5,          // Darker shadow
    maxStretchFactor: 1.8,        // Less stretching at dawn/dusk
    minStretchFactor: 0.15,        // Wider shadow at noon
    shadowBlur: 2,                // Softer edges
    pivotYOffset: 100, // Significantly reduced pivotYOffset, similar to tree's concept
    // NEW: Pass shake offsets so shadow moves with the shelter
    shakeOffsetX: shadowShakeOffsetX,
    shakeOffsetY: shadowShakeOffsetY
  });

  // --- Shelter Image Rendering ---
  // Calculate base top-left coordinates for drawing the image
  let imageDrawX = shelter.posX - SHELTER_RENDER_WIDTH / 2;
  // Adjust shelter drawing so its visual base matches its Y-sort position
  // Draw the shelter so its bottom edge aligns with shelter.posY (where players interact)
  let imageDrawY = shelter.posY - SHELTER_RENDER_HEIGHT;

  // Calculate shake effect
  let shakeOffsetX = 0;
  let shakeOffsetY = 0;

  if (shelter.lastHitTime) {
    const lastHitTimeMs = Number(shelter.lastHitTime.microsSinceUnixEpoch / 1000n);
    const elapsedSinceHit = nowMs - lastHitTimeMs;

    if (elapsedSinceHit >= 0 && elapsedSinceHit < SHELTER_SHAKE_DURATION_MS) {
        const shakeProgress = elapsedSinceHit / SHELTER_SHAKE_DURATION_MS;
        // Power curve for more intense start and quick fade: (1 - progress)^2 or similar
        const shakeFactor = Math.pow(1 - shakeProgress, 2);
        const currentShakeIntensity = SHELTER_SHAKE_INTENSITY_PX * shakeFactor;
        
        shakeOffsetX = (Math.random() - 0.5) * 2 * currentShakeIntensity;
        shakeOffsetY = (Math.random() - 0.5) * 2 * currentShakeIntensity;
    }
  }

  // Apply shake offset to draw position
  imageDrawX += shakeOffsetX;
  imageDrawY += shakeOffsetY;

  ctx.drawImage(
    variantImage,
    imageDrawX,
    imageDrawY,
    SHELTER_RENDER_WIDTH,
    SHELTER_RENDER_HEIGHT
  );
  


  // --- Outline if owner is inside ---
  if (isOwnerInside) {
    ctx.globalAlpha = 1.0; // Reset alpha for outline
    ctx.strokeStyle = SHELTER_OUTLINE_COLOR;
    ctx.lineWidth = SHELTER_OUTLINE_THICKNESS;
    // Draw a rect around the AABB bounds
    ctx.strokeRect(
        aabbMinX, // Use AABB's calculated top-left X
        aabbMinY, // Use AABB's calculated top-left Y
        DEBUG_SHELTER_COLLISION_WIDTH, // Use AABB width
        DEBUG_SHELTER_COLLISION_HEIGHT // Use AABB height
    );
  }

  ctx.restore(); // Restore original context (alpha, strokeStyle, etc.)

  // --- Health Bar Rendering (using unified system) ---
  // Use AABB center position and dimensions for health bar positioning (matches attack detection)
  // This ensures the health bar appears on the opposite side from where the player is attacking
  if (localPlayerPosition && !shelter.isDestroyed) {
    const aabbCenterX = shelter.posX;
    const aabbCenterY = shelter.posY - DEBUG_SHELTER_AABB_CENTER_Y_FROM_BASE;
    
    renderHealthBar({
      ctx,
      entityX: aabbCenterX, // Use AABB center X
      entityY: aabbCenterY, // Use AABB center Y (where attacks actually hit)
      entityWidth: DEBUG_SHELTER_COLLISION_WIDTH, // Use AABB width (300px)
      entityHeight: DEBUG_SHELTER_COLLISION_HEIGHT, // Use AABB height (125px)
      health: shelter.health,
      maxHealth: shelter.maxHealth,
      lastHitTimeMs: getLastHitTimeMs(shelter.lastHitTime),
      nowMs,
      playerX: localPlayerPosition.x,
      playerY: localPlayerPosition.y,
      entityDrawYOffset: 0, // AABB center is already the reference point
    });
  }
};
