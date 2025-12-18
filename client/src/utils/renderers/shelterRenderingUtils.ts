import { Shelter as SpacetimeDBShelter, Player as SpacetimeDBPlayer } from '../../generated';
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { renderEntityHealthBar } from './healthBarUtils';

interface RenderShelterProps {
  ctx: CanvasRenderingContext2D;
  shelter: SpacetimeDBShelter;
  shelterImage: HTMLImageElement | null;
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
  if (!shelterImage || shelter.isDestroyed) {
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
    entityImage: shelterImage, // The image used to derive shadow silhouette
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
    shelterImage,
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
  if (localPlayerPosition) {
    renderEntityHealthBar(ctx, shelter, SHELTER_RENDER_WIDTH, SHELTER_RENDER_HEIGHT, nowMs, localPlayerPosition.x, localPlayerPosition.y);
  }
};
