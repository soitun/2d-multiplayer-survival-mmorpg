/**
 * Draws a simple elliptical shadow on the canvas.
 * @param ctx The rendering context.
 * @param centerX The horizontal center of the shadow.
 * @param baseY The vertical position where the shadow sits on the ground.
 * @param radiusX The horizontal radius of the shadow ellipse.
 * @param radiusY The vertical radius of the shadow ellipse.
 */
export function drawShadow(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  baseY: number, 
  radiusX: number,
  radiusY: number
) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; // 35% opacity black
  ctx.beginPath();
  // Draw an ellipse centered horizontally at centerX, vertically at baseY
  ctx.ellipse(centerX, baseY, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
} 

// Helper for linear interpolation
function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

/**
 * Options for configuring the standard drop shadow.
 */
export interface StandardDropShadowOptions {
  color?: string; // Base RGB color string, e.g., '0,0,0'
  blur?: number;
  offsetX?: number; // Default/base offsetX if not fully dynamic
  offsetY?: number; // Default/base offsetY if not fully dynamic
  cycleProgress?: number; // Value from 0.0 (dawn) to 1.0 (end of night)
}

/**
 * Applies a standard set of shadow properties directly to the canvas context.
 * This is meant to be used when the image itself will have the shadow,
 * rather than drawing a separate shadow shape.
 * Assumes ctx.save() and ctx.restore() are handled elsewhere.
 * @param ctx The rendering context.
 * @param options Optional overrides for default shadow properties.
 */
export function applyStandardDropShadow(
  ctx: CanvasRenderingContext2D,
  options: StandardDropShadowOptions = {}
): void {
  const cycleProgress = options.cycleProgress ?? 0.375; // Default to "noonish" if not provided
  let alphaMultiplier: number;
  let currentOffsetX: number;
  let currentOffsetY: number;
  let currentBlur: number;

  const baseRGB = options.color ?? '0,0,0';
  const noonBlur = (options.blur ?? 5) - 1 > 0 ? (options.blur ?? 5) -1 : 1; // Sharper at noon
  const sunriseSunsetBlur = (options.blur ?? 5) + 2; // Softer, more diffused for long shadows
  const defaultDayBlur = options.blur ?? 5;

  const maxDayAlpha = 0.6; // More visible daytime shadow (increased from 0.45)
  const minNightAlpha = 0.15; // Subtle night shadows (increased from 0.0)

  // Day: 0.0 (Dawn) to 0.75 (Dusk ends). Night: 0.75 to 1.0
  // Server ranges: Night (0.80-0.92) -> Midnight (0.92-0.97) -> TwilightMorning (0.97-1.0) -> Dawn (0.0-0.05) -> Morning (0.05-0.35) -> Noon (0.35-0.55) -> Afternoon (0.55-0.72) -> Dusk (0.72-0.76) -> TwilightEvening (0.76-0.80) -> Night
  
  // Midnight (0.92 - 0.97): Deep night, no shadows (matches ground shadow behavior)
  // Shadows should NOT appear during midnight - they start at Twilight Morning
  if (cycleProgress >= 0.92 && cycleProgress < 0.97) {
    alphaMultiplier = 0; // No shadows during midnight
    currentOffsetX = 0;
    currentOffsetY = 0;
    currentBlur = defaultDayBlur;
  } else if (cycleProgress < 0.05) { // Dawn (0.0 - 0.05)
    // SYMMETRY: Dawn(0.0) should match Dusk(0.76), Dawn(0.05) should match Dusk(0.72)
    const t = cycleProgress / 0.05;
    alphaMultiplier = lerp(lerp(minNightAlpha, maxDayAlpha, 0.5), maxDayAlpha, t);
    currentOffsetX = lerp(10, 12, t); // Behind and to the right (positive X) - sun in east
    currentOffsetY = lerp(7, 6, t);  // Behind (positive Y)
    currentBlur = lerp(sunriseSunsetBlur, defaultDayBlur, t);
  } else if (cycleProgress < 0.35) { // Morning (0.05 - 0.35)
    // SYMMETRY: Morning(0.05) should match Afternoon(0.72), Morning(0.35) should match Afternoon(0.55)
    const t = (cycleProgress - 0.05) / (0.35 - 0.05);
    alphaMultiplier = maxDayAlpha;
    currentOffsetX = lerp(12, 0, t);  // Moving from far right to center (positive X) - sun rising in east
    currentOffsetY = lerp(6, 3, t);   // Moving from far behind to closer behind
    currentBlur = defaultDayBlur;
  } else if (cycleProgress < 0.55) { // Noon (0.35 - 0.55)
    // Shadow directly below, shortest - perfectly centered for symmetry
    alphaMultiplier = maxDayAlpha;
    currentOffsetX = 0; // Centered (no horizontal offset for perfect symmetry)
    currentOffsetY = 3; // Slightly behind
    currentBlur = noonBlur;
  } else if (cycleProgress < 0.72) { // Afternoon (0.55 - 0.72)
    // SYMMETRY: Afternoon(0.55) should match Morning(0.35), Afternoon(0.72) should match Morning(0.05)
    const t = (cycleProgress - 0.55) / (0.72 - 0.55);
    alphaMultiplier = maxDayAlpha;
    currentOffsetX = lerp(0, -12, t);   // Moving from center to far left (negative X) - sun setting in west (mirror of Morning)
    currentOffsetY = lerp(3, 6, t);    // Moving from closer behind to far behind (mirror of Morning)
    currentBlur = defaultDayBlur;
  } else if (cycleProgress < 0.76) { // Dusk (0.72 - 0.76)
    // SYMMETRY: Dusk(0.72) should match Dawn(0.05), Dusk(0.76) should match Dawn(0.0)
    const t = (cycleProgress - 0.72) / 0.04;
    alphaMultiplier = lerp(maxDayAlpha, lerp(maxDayAlpha, minNightAlpha, 0.5), t);
    currentOffsetX = lerp(-12, -10, t);   // Moving back towards twilight position (negative X) - sun in west (mirror of Dawn)
    currentOffsetY = lerp(6, 7, t);    // Moving back towards twilight position (same as Dawn)
    currentBlur = lerp(defaultDayBlur, sunriseSunsetBlur, t);
  } else if (cycleProgress < 0.80) { // Twilight Evening (0.76 - 0.80)
    // SYMMETRY: TE(0.76) should match TM(0.97), TE(0.80) should match TM(0.92)
    const t = (cycleProgress - 0.76) / 0.04;
    alphaMultiplier = lerp(lerp(maxDayAlpha, minNightAlpha, 0.5), minNightAlpha, t); // Fading out to night, matching TwilightMorning symmetry
    currentOffsetX = lerp(-10, -8, t);   // Moving back towards night position (negative X) - sun in west (mirror of TM)
    currentOffsetY = lerp(7, 8, t);    // Moving back towards night position (same as TM)
    currentBlur = sunriseSunsetBlur; // Soft blur
  } else if (cycleProgress < 0.92) { // Night (0.80 - 0.92)
    alphaMultiplier = minNightAlpha;
    currentOffsetX = 0; // Offset doesn't matter much if alpha is low
    currentOffsetY = 0;
    currentBlur = defaultDayBlur; // Blur doesn't matter if alpha is low
  } else if (cycleProgress >= 0.97) { // TwilightMorning (0.97 - 1.0, wraps around) - Pre-dawn twilight
    // Shadows START appearing here (first light after midnight)
    const t = cycleProgress >= 0.97 ? (cycleProgress - 0.97) / 0.03 : (cycleProgress + 0.03) / 0.03; // Handle wrap-around
    // Alpha: 0.0 at start (0.97, from Midnight) → 0.4 at end (1.0/0.0, to Dawn) - gradual fade-in
    alphaMultiplier = lerp(0, lerp(minNightAlpha, maxDayAlpha, 0.5), t); // Fading in from nothing
    currentOffsetX = lerp(10, 10, t); // Behind and to the right (positive X) - sun in east
    currentOffsetY = lerp(7, 7, t);  // Behind (positive Y)
    currentBlur = sunriseSunsetBlur; // Soft blur
  } else {
    // Fallback (should never reach here, but TypeScript needs this)
    alphaMultiplier = minNightAlpha;
    currentOffsetX = 0;
    currentOffsetY = 0;
    currentBlur = defaultDayBlur;
  }
  
  ctx.shadowColor = `rgba(${baseRGB},${alphaMultiplier.toFixed(2)})`;
  ctx.shadowBlur = Math.round(currentBlur);
  ctx.shadowOffsetX = Math.round(currentOffsetX);
  ctx.shadowOffsetY = Math.round(currentOffsetY);
} 

/**
 * Parameters for drawing a dynamic ground shadow.
 */
export interface DynamicGroundShadowParams {
  ctx: CanvasRenderingContext2D;
  entityImage: HTMLImageElement | HTMLCanvasElement; // Accept both image and canvas
  entityCenterX: number;      // World X-coordinate of the entity's center
  entityBaseY: number;        // World Y-coordinate of the entity's ground base
  imageDrawWidth: number;    // The width the entity image is drawn on screen
  imageDrawHeight: number;   // The height the entity image is drawn on screen
  cycleProgress: number;      // Day/night cycle progress (0.0 to 1.0)
  baseShadowColor?: string;   // RGB string for shadow color, e.g., '0,0,0'
  maxShadowAlpha?: number;    // Base opacity of the shadow color itself (before day/night fading)
  maxStretchFactor?: number;  // How many times its height the shadow can stretch (e.g., 2.5 for 2.5x)
  minStretchFactor?: number;  // Shortest shadow length factor (e.g., 0.1 for 10% of height at noon)
  shadowBlur?: number;        // Blur radius for the shadow
  pivotYOffset?: number;      // Vertical offset for the shadow pivot point
  // NEW: Shelter clipping support
  shelters?: Array<{
    posX: number;
    posY: number;
    isDestroyed: boolean;
  }>;
  // NEW: Shake effect support for impact animations
  shakeOffsetX?: number;      // Horizontal shake offset when entity is hit
  shakeOffsetY?: number;      // Vertical shake offset when entity is hit
}

// Shelter collision constants (adjusted for visual clipping)
const SHELTER_COLLISION_WIDTH = 300.0; // Reduced from 300.0 to better match visual shelter
const SHELTER_COLLISION_HEIGHT = 125.0;
const SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y = 200.0;

/**
 * Creates a clipping path that excludes shelter interiors from shadow rendering.
 * This prevents shadows from being cast inside enclosed structures.
 */
function applyShelterClipping(ctx: CanvasRenderingContext2D, shelters?: Array<{posX: number, posY: number, isDestroyed: boolean}>) {
  if (!shelters || shelters.length === 0) {
    return; // No clipping needed
  }

  // Create a clipping path that excludes all shelter interiors
  ctx.beginPath();
  
  // Start with the entire canvas area
  ctx.rect(-50000, -50000, 100000, 100000);
  
  // Subtract each shelter's interior AABB
  for (const shelter of shelters) {
    if (shelter.isDestroyed) continue;
    
    // Calculate shelter AABB bounds (same logic as shelter.rs)
    const shelterAabbCenterX = shelter.posX;
    const shelterAabbCenterY = shelter.posY - SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y;
    const aabbLeft = shelterAabbCenterX - SHELTER_COLLISION_WIDTH / 2;
    const aabbTop = shelterAabbCenterY - SHELTER_COLLISION_HEIGHT / 2;
    
    // Create a hole in the clipping path for this shelter's interior
    // We use counterclockwise winding to create a hole
    ctx.rect(aabbLeft + SHELTER_COLLISION_WIDTH, aabbTop, -SHELTER_COLLISION_WIDTH, SHELTER_COLLISION_HEIGHT);
  }
  
  // Apply the clipping path
  ctx.clip();
}

// Cache for pre-rendered silhouettes
const silhouetteCache = new Map<string, HTMLCanvasElement>();

// Global shelter clipping data - set by GameCanvas and used by all shadow rendering
let globalShelterClippingData: Array<{posX: number, posY: number, isDestroyed: boolean}> = [];

/**
 * Sets the global shelter clipping data for shadow rendering.
 * This should be called from GameCanvas before rendering entities.
 */
export function setShelterClippingData(shelters: Array<{posX: number, posY: number, isDestroyed: boolean}>) {
  globalShelterClippingData = shelters;
}

/**
 * Draws a dynamic shadow on the ground, simulating a cast shadow from an entity.
 * The shadow length, direction, and opacity change based on the time of day (cycleProgress).
 * Assumes ctx.save() and ctx.restore() are handled by the caller if multiple shadows are drawn.
 */
export function drawDynamicGroundShadow({
  ctx,
  entityImage,
  entityCenterX,
  entityBaseY,
  imageDrawWidth,
  imageDrawHeight,
  cycleProgress,
  baseShadowColor = '0,0,0',
  maxShadowAlpha = 0.5, // Increased for better visibility (was 0.35)
  maxStretchFactor = 2.2, // Increased for more dramatic shadows (was 1.8)
  minStretchFactor = 0.15, // Increased minimum (was 0.1)
  shadowBlur = 0,
  pivotYOffset = 0,
  shelters,
  shakeOffsetX,
  shakeOffsetY,
}: DynamicGroundShadowParams): void {
  let overallAlpha: number;
  let shadowLength: number; // How far the shadow extends
  let shadowShearX: number; // Horizontal shear for shadow direction
  let shadowScaleY: number; // Vertical scaling for shadow length

  // Calculate sun position throughout the day
  // 0.0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk, 1.0 = midnight
  // Server ranges: Night (0.80-0.92) -> Midnight (0.92-0.97) -> TwilightMorning (0.97-1.0) -> Dawn (0.0-0.05) -> Morning (0.05-0.35) -> Noon (0.35-0.55) -> Afternoon (0.55-0.72) -> Dusk (0.72-0.76) -> TwilightEvening (0.76-0.80) -> Night
  
  // Midnight (0.92 - 0.97): Deep night, no shadows (matches wall shadow behavior)
  // Shadows should NOT appear during midnight - they start at Twilight Morning
  if (cycleProgress >= 0.92 && cycleProgress < 0.97) {
    // No shadows during midnight (completely dark)
    overallAlpha = 0;
    shadowLength = 0;
    shadowShearX = 0;
    shadowScaleY = 0.5;
  } else if (cycleProgress < 0.05) { // Dawn (0.0 - 0.05)
    // Dawn follows Twilight Morning - shadows continue to strengthen
    const t = cycleProgress / 0.05;
    // Alpha: 0.4 at start (0.0, from TM) → 1.0 at end (0.05, to Morning)
    overallAlpha = lerp(maxShadowAlpha * 0.4, maxShadowAlpha, t);
    // Length: 0.7 at start (0.0) → 0.6 at end (0.05)
    shadowLength = lerp(maxStretchFactor * 0.7, maxStretchFactor * 0.6, t);
    // Dawn: Sun low in the east, shadows point west (positive X direction)
    shadowShearX = lerp(1.1, 0.8, t); // Strong rightward lean reducing
    shadowScaleY = lerp(0.35, 0.4, t); // Flattened shadow becoming less flat
  } else if (cycleProgress < 0.35) { // Morning (0.05 - 0.35)
    // SYMMETRY: Morning(0.05) should match Afternoon(0.72), Morning(0.35) should match Afternoon(0.55)
    const t = (cycleProgress - 0.05) / (0.35 - 0.05);
    overallAlpha = maxShadowAlpha;
    // Length: 0.6 at start (0.05) → 0.3 at end (0.35) - matches Afternoon reversed
    shadowLength = lerp(maxStretchFactor * 0.6, minStretchFactor * 2, t);
    // Morning: Sun rising, shadows moving from right to center
    shadowShearX = lerp(0.8, 0, t); // Reducing rightward lean to zero (perfect symmetry)
    shadowScaleY = lerp(0.4, 0.7, t); // Less flattened
  } else if (cycleProgress < 0.55) { // Noon (0.35 - 0.55)
    // Noon transitions from morning end to shortest, then back to afternoon start
    const t = (cycleProgress - 0.35) / (0.55 - 0.35);
    overallAlpha = maxShadowAlpha;
    // Shadow shrinks to shortest at t=0.5 (middle of noon), then grows again
    // Creates smooth parabolic transition: 0.5 → 0.25 → 0.5
    const noonFactor = 1.0 - Math.abs(t - 0.5) * 2.0; // 0 at edges, 1 at center
    shadowLength = lerp(minStretchFactor * 2, minStretchFactor, noonFactor);
    // Noon: Sun overhead, shadow directly below
    shadowShearX = 0; // No horizontal lean (perfectly centered)
    // ScaleY also transitions smoothly through noon
    shadowScaleY = lerp(0.7, 0.8, noonFactor); // Gets taller at peak noon, then back down
  } else if (cycleProgress < 0.72) { // Afternoon (0.55 - 0.72)
    // SYMMETRY: START with same length as morning START (1.32)
    const t = (cycleProgress - 0.55) / (0.72 - 0.55);
    overallAlpha = maxShadowAlpha;
    // Length: START at 1.32 (same as morning start) → END at 0.5 (same as morning end)
    shadowLength = lerp(maxStretchFactor * 0.6, minStretchFactor * 2, t);
    // Direction: Start centered, move LEFT as sun sets (mirror of morning: right to center)
    shadowShearX = lerp(0, -0.8, t); // Center → Left (opposite of morning's Right → Center)
    // ScaleY: Same as morning
    shadowScaleY = lerp(0.4, 0.7, t);
  } else if (cycleProgress < 0.76) { // Dusk (0.72 - 0.76)
    // SYMMETRY: Dusk(0.72) should match Dawn(0.05), Dusk(0.76) should match Dawn(0.0)
    const t = (cycleProgress - 0.72) / 0.04;
    // Alpha: 1.0 at start (0.72, from Afternoon) → 0.5 at end (0.76, to TE) - matches Dawn reversed
    overallAlpha = lerp(maxShadowAlpha, maxShadowAlpha * 0.5, t);
    // Length: 0.6 at start (0.72) → 0.8 at end (0.76) - matches Dawn reversed
    shadowLength = lerp(maxStretchFactor * 0.6, maxStretchFactor * 0.8, t);
    // Dusk: Sun low in WEST, shadows pointing EAST (LEFT/negative X direction)
    shadowShearX = lerp(-0.8, -1.2, t); // Continue strong leftward lean (opposite of Dawn)
    shadowScaleY = lerp(0.4, 0.3, t); // Very flattened (mirror of Dawn)
  } else if (cycleProgress < 0.80) { // Twilight Evening (0.76 - 0.80)
    // SYMMETRY: TE(0.76) should match TM(0.97), TE(0.80) should match TM(0.92)
    const t = (cycleProgress - 0.76) / 0.04;
    // Alpha: 0.5 at start (0.76, from Dusk) → 0.3 at end (0.80, to night) - matches TM reversed
    overallAlpha = lerp(maxShadowAlpha * 0.5, maxShadowAlpha * 0.3, t);
    // Length: 0.8 at start (0.76) → 0.9 at end (0.80) - matches TM reversed
    shadowLength = lerp(maxStretchFactor * 0.8, maxStretchFactor * 0.9, t);
    // Twilight Evening: Sun setting in WEST, shadows pointing EAST (LEFT/negative X direction)
    shadowShearX = lerp(-1.2, -1.3, t); // Strong leftward lean (opposite of TM)
    shadowScaleY = lerp(0.3, 0.25, t); // Very flattened (mirror of TM)
  } else if (cycleProgress < 0.92) { // Night (0.80 - 0.92)
    // Shadows should be completely invisible during night
    overallAlpha = 0;
    shadowLength = 0;
    shadowShearX = 0;
    shadowScaleY = 0.5;
  } else if (cycleProgress >= 0.97) { // TwilightMorning (0.97 - 1.0, wraps around)
    // Pre-dawn twilight - shadows START appearing here (first light)
    const t = cycleProgress >= 0.97 ? (cycleProgress - 0.97) / 0.03 : (cycleProgress + 0.03) / 0.03; // Handle wrap-around
    // Alpha: 0.0 at start (0.97, from Midnight) → 0.4 at end (1.0/0.0, to Dawn) - gradual fade-in
    overallAlpha = lerp(0, maxShadowAlpha * 0.4, t); // Shadows fade in from nothing
    // Length: 0.8 at start → 0.7 at end
    shadowLength = lerp(maxStretchFactor * 0.8, maxStretchFactor * 0.7, t);
    shadowShearX = lerp(1.2, 1.1, t); // Rightward lean, preparing for dawn
    shadowScaleY = lerp(0.3, 0.35, t);
  } else {
    // Fallback (should never reach here, but TypeScript needs this)
    overallAlpha = 0;
    shadowLength = 0;
    shadowShearX = 0;
    shadowScaleY = 0.5;
  }

  if (overallAlpha < 0.01 || shadowLength < 0.01) {
    return; // No shadow if invisible or too small
  }

  // Generate a cache key for the silhouette
  const cacheKey = entityImage instanceof HTMLImageElement 
    ? `${entityImage.src}-${baseShadowColor}`
    : null; // Don't cache canvas elements (they're already processed sprite frames)
  let offscreenCanvas = cacheKey ? silhouetteCache.get(cacheKey) : null;

  if (!offscreenCanvas) {
    // Create an offscreen canvas to prepare the sharp silhouette if not cached
    const newOffscreenCanvas = document.createElement('canvas');
    newOffscreenCanvas.width = imageDrawWidth;
    newOffscreenCanvas.height = imageDrawHeight;
    const offscreenCtx = newOffscreenCanvas.getContext('2d');

    if (!offscreenCtx) {
      console.error("Failed to get 2D context from offscreen canvas for shadow rendering.");
      return;
    }

    // 1. Draw the original image onto the offscreen canvas
    offscreenCtx.drawImage(entityImage, 0, 0, imageDrawWidth, imageDrawHeight);

    // 2. Create a sharp, tinted silhouette on the offscreen canvas using source-in
    offscreenCtx.globalCompositeOperation = 'source-in';
    offscreenCtx.fillStyle = `rgba(${baseShadowColor}, 1.0)`; // Tint with full opacity base color
    offscreenCtx.fillRect(0, 0, imageDrawWidth, imageDrawHeight);

    // Store in cache only for HTMLImageElement (not for canvas)
    if (cacheKey) {
      silhouetteCache.set(cacheKey, newOffscreenCanvas);
    }
    offscreenCanvas = newOffscreenCanvas;
  }
  
  // Now, offscreenCanvas contains the perfect, sharp, tinted silhouette (either new or cached).

  // --- Render onto the main canvas --- 
  ctx.save();

  // Apply shelter clipping to prevent shadows inside shelter interiors
  // Use global shelter data if not provided directly
  const sheltersToUse = shelters || globalShelterClippingData;
  applyShelterClipping(ctx, sheltersToUse);

  // Move origin to the entity's base center (this is the anchor point)
  // Apply shake offsets if the entity is being hit for responsive feedback
  const effectiveEntityCenterX = entityCenterX + (shakeOffsetX || 0);
  const effectiveEntityBaseY = entityBaseY + (shakeOffsetY || 0);
  
  ctx.translate(effectiveEntityCenterX, effectiveEntityBaseY - pivotYOffset);

  // Calculate shadow height based on length (before perspective flattening)
  const scaledShadowHeight = imageDrawHeight * shadowLength;
  
  // Apply shadow transformation matrix:
  // - shearX: leans the shadow left/right based on sun position
  // - scaleY: flattens the shadow onto the ground plane (perspective)
  // 
  // ANCHOR GUARANTEE: The transform [1, 0, shearX, scaleY] maps:
  //   (x, 0) → (x, 0)  -- points at y=0 stay at y'=0 (anchor locked)
  //   (x, y) → (x + shearX*y, scaleY*y)  -- points above anchor get sheared & compressed
  ctx.transform(
    1.0,            // Scale X (keep original width)
    0,              // Shear Y (none)
    shadowShearX,   // Shear X (leans shadow based on sun direction)
    shadowScaleY,   // Scale Y (flattens onto ground - perspective compression)
    0,              // Translate X
    0               // Translate Y
  );

  // Apply blur to the drawing of the offscreen (silhouette) canvas
  if (shadowBlur > 0) {
    ctx.filter = `blur(${shadowBlur}px)`;
  }

  // Apply overallAlpha for day/night intensity
  ctx.globalAlpha = overallAlpha;
  
  // SPRITE PADDING COMPENSATION:
  // Most sprites have transparent padding at the bottom (~3-8% of height).
  // This means the silhouette's visual "feet" are at y = -padding, not y = 0.
  // When shear is applied, this creates a HORIZONTAL gap:
  //   x_displacement = shearX * (-padding)
  // 
  // To fix this, we calculate the horizontal offset that the padding causes
  // and shift the entire shadow back to compensate.
  const estimatedPaddingPercent = 0.04; // ~4% typical sprite bottom padding
  const estimatedPaddingPx = scaledShadowHeight * estimatedPaddingPercent;
  // The padding at y = -estimatedPaddingPx gets sheared by: shearX * (-estimatedPaddingPx)
  // To compensate, shift X in the OPPOSITE direction:
  const paddingShearCompensation = shadowShearX * estimatedPaddingPx;
  
  // Draw the shadow silhouette with horizontal compensation for sprite padding
  ctx.drawImage(
    offscreenCanvas,
    -imageDrawWidth / 2 + paddingShearCompensation,  // Compensate for padding-induced shear offset
    -scaledShadowHeight,                              // Top of shadow at y = -height
    imageDrawWidth,
    scaledShadowHeight                                // Full shadow height
  );

  // Reset filter and alpha
  if (shadowBlur > 0) {
    ctx.filter = 'none';
  }
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over'; // Ensure composite mode is reset

  ctx.restore();
} 

/**
 * Helper function to calculate shake offsets for shadow synchronization.
 * This reduces code duplication across all object rendering utilities.
 * @param entity The entity that might be shaking
 * @param entityId The string ID of the entity
 * @param shakeTrackingMaps Object containing the tracking maps for this entity type
 * @param shakeDurationMs Duration of the shake effect in milliseconds
 * @param shakeIntensityPx Maximum shake intensity in pixels
 * @returns Object with shakeOffsetX and shakeOffsetY values
 */
export function calculateShakeOffsets(
  entity: { lastHitTime?: { microsSinceUnixEpoch: bigint } | null },
  entityId: string,
  shakeTrackingMaps: {
    clientStartTimes: Map<string, number>;
    lastKnownServerTimes: Map<string, number>;
  },
  shakeDurationMs: number = 300,
  shakeIntensityPx: number = 6
): { shakeOffsetX: number; shakeOffsetY: number } {
  let shakeOffsetX = 0;
  let shakeOffsetY = 0;

  if (entity.lastHitTime) {
    const serverShakeTime = Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n);
    
    // Check if this is a NEW shake by comparing server timestamps
    const lastKnownServerTime = shakeTrackingMaps.lastKnownServerTimes.get(entityId) || 0;
    
    if (serverShakeTime !== lastKnownServerTime) {
      // NEW shake detected! Record both server time and client time
      shakeTrackingMaps.lastKnownServerTimes.set(entityId, serverShakeTime);
      shakeTrackingMaps.clientStartTimes.set(entityId, Date.now());
    }
    
    // Calculate animation based on client time
    const clientStartTime = shakeTrackingMaps.clientStartTimes.get(entityId);
    if (clientStartTime) {
      const elapsedSinceShake = Date.now() - clientStartTime;
      
      if (elapsedSinceShake >= 0 && elapsedSinceShake < shakeDurationMs) {
        const shakeFactor = 1.0 - (elapsedSinceShake / shakeDurationMs);
        const currentShakeIntensity = shakeIntensityPx * shakeFactor;
        shakeOffsetX = (Math.random() - 0.5) * 2 * currentShakeIntensity;
        shakeOffsetY = (Math.random() - 0.5) * 2 * currentShakeIntensity;
      }
    }
  } else {
    // Clean up tracking when entity is not being hit
    shakeTrackingMaps.clientStartTimes.delete(entityId);
    shakeTrackingMaps.lastKnownServerTimes.delete(entityId);
  }

  return { shakeOffsetX, shakeOffsetY };
} 