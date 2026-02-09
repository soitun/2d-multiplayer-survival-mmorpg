import seaStackImage1 from '../../assets/doodads/sea_stack.png';
import seaStackImage2 from '../../assets/doodads/sea_stack2.png';
import seaStackImage3 from '../../assets/doodads/sea_stack3.png';
import { drawDynamicGroundShadow } from './shadowUtils';

// Constants for sea stack rendering
const SEA_STACK_CONFIG = {
  // Size variation (relative to tallest trees at 480px)
  MIN_SCALE: 1.2, // Minimum 1.2x taller than tallest trees
  MAX_SCALE: 2.5,  // Maximum 2.5x taller than tallest trees  
  BASE_WIDTH: 400, // pixels - base sea stack size (towering over trees)
};

// Water line effects removed - voronoi shader in waterOverlayUtils.ts handles water wave simulation

// Sea stack images array for variation (all three variants available)
const SEA_STACK_IMAGES = [seaStackImage1, seaStackImage2, seaStackImage3];

interface SeaStack {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  imageIndex: number; // 0, 1, or 2 for different sea stack images
}

// Pre-loaded image cache to prevent lag spikes
let preloadedImages: HTMLImageElement[] = [];
let imagesLoaded = false;

/**
 * Pre-loads all sea stack images asynchronously to prevent lag spikes
 */
function preloadSeaStackImages(): void {
  if (imagesLoaded) return;
  
  let loadedCount = 0;
  const totalImages = SEA_STACK_IMAGES.length;
  
  SEA_STACK_IMAGES.forEach((imageSrc, index) => {
    if (!imageSrc) return;
    
    const img = new Image();
    img.onload = () => {
      preloadedImages[index] = img;
      loadedCount++;
      
      if (loadedCount === totalImages) {
        imagesLoaded = true;
        // console.log('[SeaStacks] All images pre-loaded successfully');
      }
    };
    img.onerror = () => {
      console.error(`[SeaStacks] Failed to load image variant ${index + 1}`);
      loadedCount++; // Still increment to avoid hanging
      
      if (loadedCount === totalImages) {
        imagesLoaded = preloadedImages.length > 0; // Only mark loaded if we have at least one image
        //console.log(`[SeaStacks] Image loading completed with ${preloadedImages.length}/${totalImages} successful`);
      }
    };
    img.src = imageSrc;
  });
}

/**
 * Renders a single sea stack with dynamic ground shadow
 */
function renderSeaStack(
  ctx: CanvasRenderingContext2D,
  stack: SeaStack,
  image: HTMLImageElement,
  cycleProgress?: number,
  onlyDrawShadow?: boolean,
  skipDrawingShadow?: boolean,
  currentTimeMs?: number,
  renderHalfMode?: 'top' | 'bottom' | 'full'
): void {
  if (!image || !image.complete) return;
  
  const width = SEA_STACK_CONFIG.BASE_WIDTH * stack.scale;
  const height = (image.naturalHeight / image.naturalWidth) * width;
  
  // Draw dynamic ground shadow first (before the sea stack)
  if (!skipDrawingShadow && cycleProgress !== undefined) {
    // Position shadow at the base of the sea stack (where base and tower split)
    const BASE_PORTION = 0.12; // Must match the BASE_PORTION below - water line is WAY LOWER
    const baseHeight = height * BASE_PORTION;
    const shadowBaseY = stack.y - baseHeight; // Shadow at the actual base level
    
    drawDynamicGroundShadow({
      ctx,
      entityImage: image,
      entityCenterX: stack.x,
      entityBaseY: shadowBaseY, // Shadow positioned at base level
      imageDrawWidth: width,
      imageDrawHeight: height,
      cycleProgress,
      maxStretchFactor: 2.5, // Sea stacks cast longer shadows
      minStretchFactor: 0.3,  // Decent minimum shadow
      shadowBlur: 3, // Standardized to match other large objects
      pivotYOffset: -15, // Moderate offset - shadow starts close but has angular skew
    });
  }
  
  // If only drawing shadow, stop here
  if (onlyDrawShadow) return;
  
  ctx.save();
  
  // Apply transformations
  ctx.translate(stack.x, stack.y);
  ctx.rotate(stack.rotation);
  ctx.globalAlpha = stack.opacity;
  
  // Draw the sea stack centered (simple and clean) with optional base/tower rendering
  const halfMode = renderHalfMode || 'full';
  
  // The "base" is the underwater portion - needs to cover the sea stack base graphics
  // Most of the sea stack is underwater
  const BASE_PORTION = 0.12; // Only 12% above water - 88% underwater!
  
  if (halfMode === 'bottom') {
    // Render the underwater base portion with gradient transparency
    // The base extends BELOW the anchor point (into positive Y) for the underwater reflection
    const baseHeight = height * BASE_PORTION;
    const sourceBaseHeight = image.naturalHeight * BASE_PORTION;
    const savedAlpha = ctx.globalAlpha;
    
    // EXTENSION: How much further down past the anchor point to draw (for underwater depth)
    // MASSIVE extension to cover the entire base of the sea stack image
    const UNDERWATER_EXTENSION = 6.0; // Extend 600% of baseHeight further down (covers entire base!)
    const extensionHeight = baseHeight * UNDERWATER_EXTENSION;
    const totalDrawHeight = baseHeight + extensionHeight;
    
    // Draw the base in horizontal slices with gradient transparency
    // FULLY OPAQUE at water line, fading to TRANSPARENT as it goes DOWN
    const numSlices = 48; // More slices for smoother gradient over larger area
    const sliceHeight = totalDrawHeight / numSlices;
    const sourceSliceHeight = sourceBaseHeight / numSlices;
    
    for (let i = 0; i < numSlices; i++) {
      // Calculate opacity: OPAQUE at top (water line), fading to transparent as we go DOWN
      // Fade over the entire draw height
      const fadeProgress = i / numSlices; // 0 at top, 1 at bottom
      // Underwater portion should be SEMI-TRANSPARENT so water tiles show through
      // Start at ~50% opacity at water line, fade to fully transparent at bottom
      const baseOpacity = 0.0; // Base opacity for underwater portion (water shows through)
      let sliceOpacity: number;
      if (fadeProgress < 0.5) {
        // First 50%: semi-transparent (water shows through)
        sliceOpacity = baseOpacity;
      } else {
        // Last 50%: fade from semi-transparent to fully transparent
        const localFade = (fadeProgress - 0.5) / 0.5; // 0 to 1 over remaining portion
        sliceOpacity = baseOpacity * (1.0 - localFade); // Linear fade to transparent
      }
      
      ctx.globalAlpha = savedAlpha * sliceOpacity;
      
      // Source Y: sample from the base portion of the source image
      // For the extended portion, we repeat/stretch the bottom of the source
      const sourceProgress = Math.min(1.0, i / 30); // Clamp to source range, stretch more
      const sourceY = image.naturalHeight - sourceBaseHeight + (sourceProgress * sourceBaseHeight);
      
      // Destination Y: starts at -baseHeight (water line, UP from anchor)
      // and goes DOWN past 0 (anchor point) into positive Y (below anchor)
      // destY = -baseHeight + (i * sliceHeight)
      // When i=0: destY = -baseHeight (water line, above anchor)
      // When i reaches baseHeight/sliceHeight: destY = 0 (anchor point)
      // When i continues: destY becomes positive (below anchor, extending down)
      const destY = -baseHeight + (i * sliceHeight);
      
      ctx.drawImage(
        image,
        0, sourceY, // Source position
        image.naturalWidth, sourceSliceHeight + 1, // Source size (+1 to avoid gaps)
        -width / 2, destY, // Destination position (extends into positive Y = DOWN)
        width, sliceHeight + 1 // Destination size (+1 to avoid gaps)
      );
    }
    
    ctx.globalAlpha = savedAlpha; // Restore original alpha
  } else if (halfMode === 'top') {
    // Render only the tower portion (top ~85% of sea stack)
    // NO water effects here - those are rendered separately in Step 3.5
    const baseHeight = height * BASE_PORTION;
    const towerHeight = height * (1 - BASE_PORTION);
    const sourceTowerHeight = image.naturalHeight * (1 - BASE_PORTION);
    
    // Add 1-pixel overlap to eliminate seam between base and tower
    const overlapPixels = 1;
    const sourceOverlapPixels = Math.floor(overlapPixels * (image.naturalHeight / height));
    
    ctx.drawImage(
      image,
      0, 0, // Source: top 85% of image (starting from top)
      image.naturalWidth, sourceTowerHeight + sourceOverlapPixels, // Add overlap to source
      -width / 2, -height, // Destination: tower portion from top down
      width, towerHeight + overlapPixels // Add overlap to destination to eliminate seam
    );
  } else {
    // Render full sea stack (default behavior)
    ctx.drawImage(
      image,
      -width / 2,
      -height,
      width,
      height
    );
  }
  
  ctx.restore();
}

/**
 * Renders a single sea stack entity for the Y-sorted rendering system
 * This function is used when sea stacks are rendered individually through the Y-sorted entities
 */
export function renderSeaStackSingle(
  ctx: CanvasRenderingContext2D,
  seaStack: any, // Server-provided sea stack entity
  doodadImages: Map<string, HTMLImageElement> | null,
  cycleProgress?: number, // Day/night cycle for dynamic shadows
  currentTimeMs?: number, // Current time for animations
  renderHalfMode?: 'top' | 'bottom' | 'full', // Control which half to render
  localPlayerPosition?: { x: number; y: number } | null // Player position for transparency logic
): void {
  // Trigger image preloading on first call
  preloadSeaStackImages();
  
  // Early exit if images not loaded yet
  if (!imagesLoaded || preloadedImages.length === 0) return;
    
    // Map server variant to image index
    let imageIndex = 0;
    if (seaStack.variant && seaStack.variant.tag) {
      switch (seaStack.variant.tag) {
        case 'Tall': imageIndex = 0; break;
        case 'Medium': imageIndex = 1; break;
        case 'Wide': imageIndex = 2; break;
        default: imageIndex = 0; break;
      }
    }
    
    // Ensure valid image index
    imageIndex = Math.min(imageIndex, preloadedImages.length - 1);
    const stackImage = preloadedImages[imageIndex];
    
  if (stackImage && stackImage.complete) {
      // Create client-side rendering object from server data
    const clientStack: SeaStack = {
        x: seaStack.posX,
        y: seaStack.posY,
        scale: seaStack.scale || 1.0,
        rotation: 0.0, // Keep sea stacks upright (no rotation)
        opacity: seaStack.opacity || 1.0,
        imageIndex: imageIndex
      };
    
    // Calculate transparency when player is behind sea stack (same logic as trees)
    const MIN_ALPHA = 0.3;
    const MAX_ALPHA = 1.0;
    let stackAlpha = clientStack.opacity;
    
    if (localPlayerPosition) {
      // Calculate sea stack dimensions
      const width = SEA_STACK_CONFIG.BASE_WIDTH * clientStack.scale;
      const height = (stackImage.naturalHeight / stackImage.naturalWidth) * width;
      
      // Sea stacks have lots of transparent space - use tighter bounds for actual rock
      // The rock texture is roughly 30% of the width (centered) and 70% of height (from bottom)
      const rockWidth = width * 0.3;
      const rockHeight = height * 0.7;
      
      // Sea stack bounding box for overlap detection (tighter to actual rock)
      const stackLeft = clientStack.x - rockWidth / 2;
      const stackRight = clientStack.x + rockWidth / 2;
      const stackTop = clientStack.y - rockHeight;
      const stackBottom = clientStack.y;
      
      // Player bounding box
      const playerSize = 48;
      const playerLeft = localPlayerPosition.x - playerSize / 2;
      const playerRight = localPlayerPosition.x + playerSize / 2;
      const playerTop = localPlayerPosition.y - playerSize;
      const playerBottom = localPlayerPosition.y;
      
      // Check if player overlaps with sea stack visually
      const overlapsHorizontally = playerRight > stackLeft && playerLeft < stackRight;
      const overlapsVertically = playerBottom > stackTop && playerTop < stackBottom;
      
      // Sea stack should be transparent ONLY when player is BEHIND it
      // CRITICAL FIX: Add buffer threshold to prevent transparency when player is at/near same level
      // Player is "below" when playerBottom >= stackBottom (player's feet at or below stack's base)
      // In this case, player is IN FRONT and stack should be fully opaque
      const TRANSPARENCY_THRESHOLD = 40; // Minimum distance player must be above stack base to trigger transparency (increased for stricter check)
      const isPlayerBelowOrAtStack = playerBottom >= (stackBottom - TRANSPARENCY_THRESHOLD);
      
      // Only apply transparency when:
      // 1. Player overlaps with stack visually
      // 2. Player is CLEARLY above the stack (playerBottom is at least THRESHOLD pixels above stackBottom)
      // This prevents transparency when player is at/near the same level or below
      if (overlapsHorizontally && overlapsVertically && !isPlayerBelowOrAtStack && playerBottom < (stackBottom - TRANSPARENCY_THRESHOLD)) {
        // Player is CLEARLY BEHIND the stack (playerBottom is well above stack base)
        // Stack is blocking the player, so make stack transparent
        const depthDifference = stackBottom - playerBottom;
        const maxDepthForFade = 100; // Same as trees
        
        if (depthDifference > TRANSPARENCY_THRESHOLD && depthDifference < maxDepthForFade) {
          // Closer to stack = more transparent (but only if clearly above threshold)
          const fadeFactor = 1 - ((depthDifference - TRANSPARENCY_THRESHOLD) / (maxDepthForFade - TRANSPARENCY_THRESHOLD));
          stackAlpha = MAX_ALPHA - (fadeFactor * (MAX_ALPHA - MIN_ALPHA));
          stackAlpha = Math.max(MIN_ALPHA, Math.min(MAX_ALPHA, stackAlpha));
        } else if (depthDifference >= maxDepthForFade) {
          // Very close - use minimum alpha
          stackAlpha = MIN_ALPHA;
        }
      } else {
        // Player is at/near same level or below stack = player is in front, ensure stack is fully opaque
        stackAlpha = MAX_ALPHA;
      }
    }
    
    // Update client stack opacity with calculated alpha
    clientStack.opacity = stackAlpha;
      
    // Render with water effects, but skip shadow (drawn separately)
    renderSeaStack(ctx, clientStack, stackImage, cycleProgress, false, true, currentTimeMs || Date.now(), renderHalfMode);
  }
}

/**
 * Renders ONLY the shadow for a sea stack (no rock texture)
 * This should be called first, before any sea stack portions
 */
export function renderSeaStackShadowOnly(
  ctx: CanvasRenderingContext2D,
  seaStack: any, // Server-provided sea stack entity
  doodadImages: Map<string, HTMLImageElement> | null,
  cycleProgress?: number // Day/night cycle for dynamic shadows
): void {
  // Trigger image preloading
  preloadSeaStackImages();
  if (!imagesLoaded || preloadedImages.length === 0) return;
  
  // Map server variant to image index
  let imageIndex = 0;
  if (seaStack.variant && seaStack.variant.tag) {
    switch (seaStack.variant.tag) {
      case 'Tall': imageIndex = 0; break;
      case 'Medium': imageIndex = 1; break;
      case 'Wide': imageIndex = 2; break;
      default: imageIndex = 0; break;
    }
  }
  
  imageIndex = Math.min(imageIndex, preloadedImages.length - 1);
  const stackImage = preloadedImages[imageIndex];
  
  if (stackImage && stackImage.complete) {
    const clientStack: SeaStack = {
      x: seaStack.posX,
      y: seaStack.posY,
      scale: seaStack.scale || 1.0,
      rotation: 0.0,
      opacity: seaStack.opacity || 1.0,
      imageIndex: imageIndex
    };
    
    // Render with onlyDrawShadow = true, skipDrawingShadow = false
    renderSeaStack(ctx, clientStack, stackImage, cycleProgress, true, false, undefined, 'full');
  }
}

/**
 * Renders only the bottom half of a sea stack WITHOUT shadows (underwater portion)
 * This should be called after shadows but before swimming players
 */
export function renderSeaStackBottomOnly(
  ctx: CanvasRenderingContext2D,
  seaStack: any, // Server-provided sea stack entity
  doodadImages: Map<string, HTMLImageElement> | null,
  cycleProgress?: number, // Day/night cycle for dynamic shadows
  currentTimeMs?: number, // Current time for animations
  localPlayerPosition?: { x: number; y: number } | null // Player position for transparency logic
): void {
  // Render only the bottom half, skipping shadow (already drawn separately)
  renderSeaStackSingle(ctx, seaStack, doodadImages, cycleProgress, currentTimeMs, 'bottom', localPlayerPosition);
}

// Water line rendering functions removed - voronoi shader in waterOverlayUtils.ts
// handles water wave simulation at the base of sea stacks

// Removed clearSeaStackCache function - no longer needed since sea stacks are server-authoritative 

// === SEA STACK SHADOW OVERLAY (renders above players but below sea stack rock) ===
// Offscreen canvas for sea stack shadow compositing (reused to avoid allocation)
let seaStackShadowCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let seaStackShadowCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getSeaStackShadowCanvas(width: number, height: number): { canvas: OffscreenCanvas | HTMLCanvasElement, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } | null {
  if (!seaStackShadowCanvas || seaStackShadowCanvas.width !== width || seaStackShadowCanvas.height !== height) {
    try {
      seaStackShadowCanvas = new OffscreenCanvas(width, height);
    } catch {
      seaStackShadowCanvas = document.createElement('canvas');
      seaStackShadowCanvas.width = width;
      seaStackShadowCanvas.height = height;
    }
    seaStackShadowCtx = seaStackShadowCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  }
  if (!seaStackShadowCtx) return null;
  return { canvas: seaStackShadowCanvas, ctx: seaStackShadowCtx };
}

/** Helper to get image index from sea stack variant */
function getSeaStackImageIndex(seaStack: any): number {
  let imageIndex = 0;
  if (seaStack.variant && seaStack.variant.tag) {
    switch (seaStack.variant.tag) {
      case 'Tall': imageIndex = 0; break;
      case 'Medium': imageIndex = 1; break;
      case 'Wide': imageIndex = 2; break;
      default: imageIndex = 0; break;
    }
  }
  return Math.min(imageIndex, preloadedImages.length - 1);
}

/**
 * Renders sea stack ground shadows as an overlay AFTER Y-sorted entities.
 * Uses an offscreen canvas to composite shadows with sea stack body cutouts,
 * so shadows appear on players/ground but NOT on the sea stack rock itself.
 * 
 * This is the same approach used by tree canopy shadow overlays:
 * 1. Draw all shadows to offscreen canvas
 * 2. Cut out sea stack body regions (destination-out)
 * 3. Composite onto main canvas
 */
export function renderSeaStackShadowsOverlay(
  ctx: CanvasRenderingContext2D,
  seaStacks: any[],
  doodadImages: Map<string, HTMLImageElement> | null,
  cycleProgress: number
): void {
  preloadSeaStackImages();
  if (!imagesLoaded || preloadedImages.length === 0) return;
  if (!seaStacks || seaStacks.length === 0) return;

  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  const offscreen = getSeaStackShadowCanvas(canvasWidth, canvasHeight);
  if (!offscreen) {
    // Fallback: render shadows directly (will show on sea stacks, but better than nothing)
    seaStacks.forEach(seaStack => {
      renderSeaStackShadowOnly(ctx, seaStack, doodadImages, cycleProgress);
    });
    return;
  }

  const { ctx: offCtx, canvas: offCanvas } = offscreen;

  // Clear offscreen canvas
  offCtx.save();
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  offCtx.restore();

  // Apply same camera transform as main canvas
  offCtx.save();
  offCtx.setTransform(ctx.getTransform());

  // Step 1: Draw all sea stack shadows onto offscreen canvas
  seaStacks.forEach(seaStack => {
    const imageIndex = getSeaStackImageIndex(seaStack);
    const stackImage = preloadedImages[imageIndex];
    if (!stackImage || !stackImage.complete) return;

    const clientStack: SeaStack = {
      x: seaStack.posX,
      y: seaStack.posY,
      scale: seaStack.scale || 1.0,
      rotation: 0.0,
      opacity: seaStack.opacity || 1.0,
      imageIndex
    };

    // Draw shadow only (onlyDrawShadow=true, skipDrawingShadow=false)
    renderSeaStack(offCtx as CanvasRenderingContext2D, clientStack, stackImage, cycleProgress, true, false, undefined, 'full');
  });

  // Step 2: Cut out sea stack body regions using destination-out
  // This erases shadow pixels wherever the sea stack rock image has opaque pixels,
  // preventing the shadow from appearing on top of the rock itself.
  offCtx.globalCompositeOperation = 'destination-out';

  seaStacks.forEach(seaStack => {
    const imageIndex = getSeaStackImageIndex(seaStack);
    const stackImage = preloadedImages[imageIndex];
    if (!stackImage || !stackImage.complete) return;

    const scale = seaStack.scale || 1.0;
    const width = SEA_STACK_CONFIG.BASE_WIDTH * scale;
    const height = (stackImage.naturalHeight / stackImage.naturalWidth) * width;

    offCtx.save();
    offCtx.translate(seaStack.posX, seaStack.posY);
    offCtx.globalAlpha = 1.0; // Full erase where rock pixels exist

    // Draw the full sea stack image to cut out its silhouette from the shadow.
    // The image's alpha channel determines the cutout shape - fully opaque rock
    // pixels completely erase the shadow, transparent areas leave it intact.
    offCtx.drawImage(
      stackImage,
      -width / 2,
      -height,
      width,
      height
    );

    offCtx.restore();
  });

  offCtx.globalCompositeOperation = 'source-over';
  offCtx.restore();

  // Step 3: Composite the shadow layer (with cutouts) onto the main canvas
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform for direct pixel copy
  ctx.drawImage(offCanvas, 0, 0);
  ctx.restore();
}

// === UNDERWATER SNORKELING MODE ===
// Constants for underwater silhouette rendering
// Must match AABB values in clientCollision.ts for accurate collision representation
const UNDERWATER_SILHOUETTE_CONFIG = {
  // Base AABB dimensions match SEA_STACK_DIMS in clientCollision.ts
  BASE_HALF_WIDTH: 80,   // Same as SEA_STACK_DIMS.BASE_HALF_WIDTH
  BASE_HALF_HEIGHT: 35,  // Same as SEA_STACK_DIMS.BASE_HALF_HEIGHT
  BASE_Y_OFFSET: 70,     // Same as SEA_STACK_DIMS.BASE_Y_OFFSET (lowered for better base positioning)
  // Feather amount (soft edge gradient) - use average of dimensions for silhouette
  FEATHER_RATIO: 0.4, // 40% of effective radius is feathered
  // Colors for underwater effect
  INNER_COLOR: 'rgba(10, 50, 70, 0.85)', // Dark teal center
  OUTER_COLOR: 'rgba(10, 50, 70, 0)', // Transparent edge
};

/**
 * Gets the effective collision radius for a sea stack's underwater silhouette
 * Uses the average of AABB half-width and half-height for a circular silhouette
 * that approximates the rectangular collision shape
 */
function getSeaStackCollisionRadius(scale: number): number {
  // Use the average of halfWidth and halfHeight for a circular approximation
  const avgHalfDimension = (UNDERWATER_SILHOUETTE_CONFIG.BASE_HALF_WIDTH + UNDERWATER_SILHOUETTE_CONFIG.BASE_HALF_HEIGHT) / 2;
  return avgHalfDimension * scale;
}

/**
 * Renders a sea stack as an underwater silhouette (feathered dark blue circle)
 * Used when player is snorkeling - shows where obstacles are from underwater perspective
 */
export function renderSeaStackUnderwaterSilhouette(
  ctx: CanvasRenderingContext2D,
  seaStack: any, // Server-provided sea stack entity
  cycleProgress: number = 0.5 // Day/night cycle (affects darkness slightly)
): void {
  const scale = seaStack.scale || 1.0;
  
  // Calculate radius to match actual collision system (60 * scale)
  const radius = getSeaStackCollisionRadius(scale);
  const featherRadius = radius * (1 + UNDERWATER_SILHOUETTE_CONFIG.FEATHER_RATIO);
  
  // Position from server data - posX/posY is the base anchor point
  const x = seaStack.posX;
  // The silhouette should match the collision AABB center exactly
  // Scale the Y offset based on sea stack scale - larger sea stacks need silhouette pushed up more
  // This matches the scaled offset in clientCollision.ts (SEA_STACK_DIMS.BASE_Y_OFFSET)
  const scaledYOffset = UNDERWATER_SILHOUETTE_CONFIG.BASE_Y_OFFSET * scale;
  const y = seaStack.posY - scaledYOffset;
  
  ctx.save();
  
  // Create radial gradient for feathered effect
  const gradient = ctx.createRadialGradient(x, y, radius * 0.3, x, y, featherRadius);
  
  // Adjust darkness slightly based on time of day
  const nightFactor = Math.abs(cycleProgress - 0.5) * 2; // 0 at noon, 1 at midnight
  const baseAlpha = 0.75 + nightFactor * 0.15; // Darker at night
  
  gradient.addColorStop(0, `rgba(8, 42, 58, ${baseAlpha})`); // Dark center
  gradient.addColorStop(0.5, `rgba(10, 50, 70, ${baseAlpha * 0.7})`); // Mid transition
  gradient.addColorStop(0.8, `rgba(12, 58, 80, ${baseAlpha * 0.3})`); // Outer transition
  gradient.addColorStop(1, 'rgba(12, 58, 80, 0)'); // Transparent edge
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, featherRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Add a subtle darker core for depth
  const coreGradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.5);
  coreGradient.addColorStop(0, `rgba(5, 30, 45, ${baseAlpha * 0.5})`);
  coreGradient.addColorStop(1, 'rgba(5, 30, 45, 0)');
  
  ctx.fillStyle = coreGradient;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}