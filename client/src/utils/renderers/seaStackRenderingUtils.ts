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

// Water line effect constants
const WATER_LINE_CONFIG = {
  HEIGHT_OFFSET: 55, // How high up from the base to place the water line (increased to 55 for better gradient coverage)
  WAVE_AMPLITUDE: 1.5, // How much the water line moves up/down (even more subtle for cozy feel)
  WAVE_FREQUENCY: 0.0008, // Much slower for cozy, atmospheric feel (was 0.002)
  SHIMMER_FREQUENCY: 0.002, // Slower shimmer for atmospheric feel (was 0.005)
  UNDERWATER_TINT: 'rgba(44, 88, 103, 0.6)', // Dark blue underwater tint using #2C5867
  CONTOUR_SAMPLE_DENSITY: 4, // Sample every 4 pixels for contour detection
};

// Sea stack images array for variation (all three variants available)
const SEA_STACK_IMAGES = [seaStackImage1, seaStackImage2, seaStackImage3];

// Cache for image contour data to avoid recalculating every frame
const imageContourCache = new Map<string, number[]>();

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
 * Analyzes image pixels to find the widest contour near the base
 * Samples multiple Y levels to ensure we get the full width, including the very bottom
 * Returns an array of X positions where the image has content (not transparent)
 */
function getImageContourAtLevel(
  image: HTMLImageElement,
  waterLineY: number,
  width: number,
  height: number
): number[] {
  const cacheKey = `${image.src}_${WATER_LINE_CONFIG.HEIGHT_OFFSET}_${width}_${height}`;
  
  // Check cache first
  if (imageContourCache.has(cacheKey)) {
    return imageContourCache.get(cacheKey)!;
  }
  
  // Create a temporary canvas to analyze the image
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  
  canvas.width = width;
  canvas.height = height;
  
  // Draw the image to analyze its pixels
  ctx.drawImage(image, 0, 0, width, height);
  
  let widestContour: number[] = [];
  let maxWidth = 0;
  
  // console.log(`[SeaStacks] Image dimensions: ${width}x${height}`);
  
  // First pass: scan entire image to see what alpha values we actually have
  let minAlpha = null, maxAlpha = null, totalPixels = 0, opaquePixels = 0;
  
  // Sample a few rows to analyze alpha values
  for (let y = 0; y < height; y += Math.floor(height / 20)) { // Sample ~20 rows across the image
    try {
      const imageData = ctx.getImageData(0, y, width, 1);
      const data = imageData.data;
      
      for (let x = 0; x < width; x++) {
        const alpha = data[x * 4 + 3];
        if (alpha !== undefined && !isNaN(alpha)) {
          if (minAlpha === null || alpha < minAlpha) minAlpha = alpha;
          if (maxAlpha === null || alpha > maxAlpha) maxAlpha = alpha;
          totalPixels++;
          if (alpha > 0) opaquePixels++;
        }
      }
    } catch (error) {
      console.warn(`[SeaStacks] Error reading row ${y}:`, error);
    }
  }
  
  // Fallback if no valid alpha values found
  if (minAlpha === null || maxAlpha === null) {
    // console.log(`[SeaStacks] Could not read alpha values, using fallback`);
    minAlpha = 0;
    maxAlpha = 255;
  }
  
  // console.log(`[SeaStacks] Alpha range: ${minAlpha}-${maxAlpha}, ${opaquePixels}/${totalPixels} pixels have alpha > 0`);
  
  // Use a simple threshold that should work
  const alphaThreshold = 30; // Fixed threshold that should catch solid pixels
  // console.log(`[SeaStacks] Using alpha threshold: ${alphaThreshold}`);
  
    // Scan the image for contours, focusing on the bottom portion where sea stacks are widest
  const startY = Math.floor(height * 0.2); // Start from 20% down
  const endY = Math.floor(height * 0.98);  // Scan almost to the very bottom (98%)
  // console.log(`[SeaStacks] Scanning rows ${startY} to ${endY}`);
  
  let rowsWithPixels = 0;
  let debugRowCount = 0;
  
  for (let y = startY; y < endY; y += 2) { // Every 2nd row for better accuracy
    try {
      const imageData = ctx.getImageData(0, y, width, 1);
      const data = imageData.data;
      
      let leftEdge = -1;
      let rightEdge = -1;
      let pixelsInRow = 0;
      
      // Count pixels in this row and find edges
      for (let x = 0; x < width; x++) {
        const alpha = data[x * 4 + 3];
        if (alpha > 0) pixelsInRow++;
        
        if (alpha > alphaThreshold) {
          if (leftEdge === -1) leftEdge = x;
          rightEdge = x; // Keep updating to get the rightmost
        }
      }
      
      if (pixelsInRow > 0) rowsWithPixels++;
      
      // Debug first few rows
      if (debugRowCount < 3 && pixelsInRow > 0) {
        // console.log(`[SeaStacks] Row ${y} debug: ${pixelsInRow} pixels with alpha>0, left=${leftEdge}, right=${rightEdge}, threshold=${alphaThreshold}`);
        // Sample a few pixel values
        for (let x = 0; x < Math.min(width, 10); x++) {
          const alpha = data[x * 4 + 3];
          if (alpha > 0) {
            // console.log(`[SeaStacks] Pixel at (${x}, ${y}) has alpha=${alpha}`);
          }
        }
        debugRowCount++;
      }
      
      // If we found both edges, check if this is the widest
      if (leftEdge !== -1 && rightEdge !== -1) {
        const contourWidth = rightEdge - leftEdge + 1;
        
        if (contourWidth > maxWidth) {
          maxWidth = contourWidth;
          widestContour = [];
          
          // console.log(`[SeaStacks] New widest contour at Y=${y}: width=${contourWidth}, left=${leftEdge}, right=${rightEdge}, pixelsInRow=${pixelsInRow}`);
          
          // Create contour points every 2 pixels for performance
          for (let x = leftEdge; x <= rightEdge; x += 2) {
            widestContour.push(x - width / 2); // Convert to centered coordinates
          }
        }
      }
    } catch (error) {
      console.warn(`[SeaStacks] Error reading row ${y}:`, error);
    }
  }
  
  // console.log(`[SeaStacks] Found ${rowsWithPixels} rows with pixels out of ${Math.floor((endY - startY) / 2)} scanned rows`);
    
    // console.log(`[SeaStacks] Final contour: width=${maxWidth}, points=${widestContour.length}`);
    
    // If still no contour found, try a more aggressive approach
    if (maxWidth === 0) {
      // console.log(`[SeaStacks] No contour found with threshold ${alphaThreshold}, trying lower threshold`);
      
      // Try with a much lower threshold
      const lowThreshold = 5;
      for (let y = startY; y < endY; y += 3) {
        try {
          const imageData = ctx.getImageData(0, y, width, 1);
          const data = imageData.data;
          
          let leftEdge = -1, rightEdge = -1;
          
          for (let x = 0; x < width; x++) {
            const alpha = data[x * 4 + 3];
            if (alpha > lowThreshold) {
              leftEdge = x;
              break;
            }
          }
          
          for (let x = width - 1; x >= 0; x--) {
            const alpha = data[x * 4 + 3];
            if (alpha > lowThreshold) {
              rightEdge = x;
              break;
            }
          }
          
          if (leftEdge !== -1 && rightEdge !== -1) {
            const contourWidth = rightEdge - leftEdge + 1;
            if (contourWidth > maxWidth) {
              maxWidth = contourWidth;
              widestContour = [];
              // console.log(`[SeaStacks] Found contour with low threshold at Y=${y}: width=${contourWidth}`);
              for (let x = leftEdge; x <= rightEdge; x += 2) {
                widestContour.push(x - width / 2);
              }
            }
          }
        } catch (error) {
          // Skip
        }
      }
    }
  

  
  // If we still don't have a good contour, create a fallback based on a reasonable base width
  if (widestContour.length === 0) {
    console.warn('[SeaStacks] No contour found, using fallback width');
    const fallbackWidth = width * 0.15; // Use only 15% of the total width as fallback (much smaller!)
    for (let x = -fallbackWidth / 2; x <= fallbackWidth / 2; x += 6) { // Smaller increments for better coverage
      widestContour.push(x);
    }
    // console.log(`[SeaStacks] Using fallback width: ${fallbackWidth} (${widestContour.length} points)`);
  }
  
  // Cache the result
  imageContourCache.set(cacheKey, widestContour);
  return widestContour;
}

/**
 * Draws animated water line effects that follow the actual sea stack contour
 */
function drawWaterLineEffects(
  ctx: CanvasRenderingContext2D,
  stack: SeaStack,
  image: HTMLImageElement,
  width: number,
  height: number,
  currentTimeMs: number
): void {
  // Position water line at the exact split between base and tower (11% from bottom)
  const BASE_PORTION = 0.11; // Must match the BASE_PORTION in renderSeaStack
  const baseHeight = height * BASE_PORTION;
  const waterLineY = -baseHeight; // Negative because we're measuring from stack.y (anchor point)
  const time = currentTimeMs;
  
  // Get contour points at the water line level
  const contourPoints = getImageContourAtLevel(image, waterLineY, width, height);
  
  if (contourPoints.length === 0) return; // No contour found
  
  // Create animated wave offset
  const baseWaveOffset = Math.sin(time * WATER_LINE_CONFIG.WAVE_FREQUENCY + stack.x * 0.01) * WATER_LINE_CONFIG.WAVE_AMPLITUDE;
  const shimmerIntensity = (Math.sin(time * WATER_LINE_CONFIG.SHIMMER_FREQUENCY * 2) + 1) * 0.5;
  
  ctx.save();
  
  // 1. Draw underwater tinting using a clipping path that follows the image shape
  ctx.save();
  ctx.beginPath();
  
  // Create clipping path that follows the contour and extends downward
  if (contourPoints.length > 0) {
    // Find leftmost and rightmost points to ensure we cover the full detected width
    const leftMost = Math.min(...contourPoints);
    const rightMost = Math.max(...contourPoints);
    
    // Create a simple rectangular clipping area that covers the full detected width
    // This ensures we don't miss any parts of the sea stack base
    const waveOffset1 = baseWaveOffset + Math.sin(time * WATER_LINE_CONFIG.WAVE_FREQUENCY * 2) * 1;
    const waveOffset2 = baseWaveOffset + Math.sin(time * WATER_LINE_CONFIG.WAVE_FREQUENCY * 2 + 1) * 1;
    
    // Create a clipping path that's constrained to the sea stack bounds
    const stackBounds = {
      left: -width / 2,
      right: width / 2,
      top: -height,
      bottom: 0
    };
    
    // Constrain the clipping area to not extend beyond the sea stack image bounds
    const constrainedLeft = Math.max(leftMost, stackBounds.left);
    const constrainedRight = Math.min(rightMost, stackBounds.right);
    
    // Create a rectangular clipping path that's bounded by the sea stack image
    ctx.moveTo(constrainedLeft, waterLineY + waveOffset1);
    ctx.lineTo(constrainedRight, waterLineY + waveOffset2);
    ctx.lineTo(constrainedRight, Math.min(waterLineY + 100, stackBounds.bottom)); // Don't extend beyond image bottom
    ctx.lineTo(constrainedLeft, Math.min(waterLineY + 100, stackBounds.bottom)); // Don't extend beyond image bottom
    ctx.closePath();
    
    // Apply clipping and fill with gradient underwater tint
    ctx.clip();
    
    // Create gradient that gets fully opaque sooner for better underwater effect
    const underwaterGradient = ctx.createLinearGradient(0, waterLineY, 0, waterLineY + 60);
    underwaterGradient.addColorStop(0, 'rgba(25, 59, 88, 0.3)'); // Light tint at water line (#193B58)
    underwaterGradient.addColorStop(0.2, 'rgba(25, 59, 88, 0.6)'); // Medium tint (#193B58)
    underwaterGradient.addColorStop(0.4, 'rgba(25, 59, 88, 0.9)'); // Strong tint - reaches 90% much sooner (#193B58)
    underwaterGradient.addColorStop(0.6, 'rgba(25, 59, 88, 1.0)'); // Fully opaque at 60% instead of 100% (#193B58)
    underwaterGradient.addColorStop(1, 'rgba(25, 59, 88, 1.0)'); // Stay fully opaque to bottom (#193B58)
    
    ctx.fillStyle = underwaterGradient;
    ctx.fillRect(constrainedLeft, waterLineY, constrainedRight - constrainedLeft, Math.min(100, stackBounds.bottom - waterLineY));
  }
  
  ctx.restore();
  
  // 2. Draw the animated water line following the contour
  if (contourPoints.length > 0) {
    ctx.strokeStyle = `rgba(100, 200, 255, ${0.6 + shimmerIntensity * 0.3})`;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    
    // Draw water line segments following the contour
    contourPoints.forEach((x, index) => {
      const localWaveOffset = baseWaveOffset + Math.sin(time * WATER_LINE_CONFIG.WAVE_FREQUENCY * 3 + index * 0.3) * 1;
      const y = waterLineY + localWaveOffset;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Add shimmer highlights on the water line
    if (shimmerIntensity > 0.7) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${(shimmerIntensity - 0.7) * 2})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  
  ctx.restore();
}



/**
 * Renders a single sea stack with dynamic ground shadow and water effects
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
    const BASE_PORTION = 0.11; // Must match the BASE_PORTION below
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
      shadowBlur: 4,
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
  
  // The "base" is the underwater portion - roughly player height (~48-64 pixels)
  // For sea stacks that are 800-1200px tall, this is about 1/15th to 1/20th
  const BASE_PORTION = 0.15; // Bottom 8% is the underwater base
  
  if (halfMode === 'bottom') {
    // Render only the small underwater base (bottom ~15% of sea stack)
    // NO water effects here - those render later with the top portion
    const baseHeight = height * BASE_PORTION;
    const sourceBaseHeight = image.naturalHeight * BASE_PORTION;
    
    ctx.drawImage(
      image,
      0, image.naturalHeight - sourceBaseHeight, // Source: bottom 15% of image
      image.naturalWidth, sourceBaseHeight,
      -width / 2, -baseHeight, // Destination: bottom portion at water level
      width, baseHeight
    );
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
    
    // Add water line effect for full rendering
    if (currentTimeMs !== undefined) {
      drawWaterLineEffects(ctx, stack, image, width, height, currentTimeMs);
    }
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
      
      // Sea stack should be transparent if:
      // 1. It overlaps with player visually
      // 2. Stack renders AFTER player (stack.y > player.y means stack is in front in Y-sort)
      if (overlapsHorizontally && overlapsVertically && clientStack.y > localPlayerPosition.y) {
        // Calculate how much the player is behind the stack (for smooth fade)
        const depthDifference = clientStack.y - localPlayerPosition.y;
        const maxDepthForFade = 100; // Same as trees
        
        if (depthDifference > 0 && depthDifference < maxDepthForFade) {
          // Closer to stack = more transparent
          const fadeFactor = 1 - (depthDifference / maxDepthForFade);
          stackAlpha = MAX_ALPHA - (fadeFactor * (MAX_ALPHA - MIN_ALPHA));
          stackAlpha = Math.max(MIN_ALPHA, Math.min(MAX_ALPHA, stackAlpha));
        } else if (depthDifference >= maxDepthForFade) {
          // Very close - use minimum alpha
          stackAlpha = MIN_ALPHA;
        }
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
  currentTimeMs?: number // Current time for animations
): void {
  // Render only the bottom half, skipping shadow (already drawn separately)
  renderSeaStackSingle(ctx, seaStack, doodadImages, cycleProgress, currentTimeMs, 'bottom');
}

/**
 * Draws ONLY the animated water line (without gradient)
 * This should be rendered on top of everything
 */
function drawWaterLineOnly(
  ctx: CanvasRenderingContext2D,
  stack: SeaStack,
  image: HTMLImageElement,
  width: number,
  height: number,
  currentTimeMs: number
): void {
  // Position water line at the exact split between base and tower (11% from bottom)
  const BASE_PORTION = 0.11;
  const baseHeight = height * BASE_PORTION;
  const waterLineY = -baseHeight;
  const time = currentTimeMs;
  
  // Get contour points at the water line level
  const contourPoints = getImageContourAtLevel(image, waterLineY, width, height);
  
  if (contourPoints.length === 0) return;
  
  // Create animated wave offset
  const baseWaveOffset = Math.sin(time * WATER_LINE_CONFIG.WAVE_FREQUENCY + stack.x * 0.01) * WATER_LINE_CONFIG.WAVE_AMPLITUDE;
  const shimmerIntensity = (Math.sin(time * WATER_LINE_CONFIG.SHIMMER_FREQUENCY * 2) + 1) * 0.5;
  
  ctx.save();
  
  // Draw the animated water line following the contour
  ctx.strokeStyle = `rgba(100, 200, 255, ${0.6 + shimmerIntensity * 0.3})`;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  ctx.beginPath();
  
  // Draw water line segments following the contour
  contourPoints.forEach((x, index) => {
    const localWaveOffset = baseWaveOffset + Math.sin(time * WATER_LINE_CONFIG.WAVE_FREQUENCY * 3 + index * 0.3) * 1;
    const y = waterLineY + localWaveOffset;
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  
  ctx.stroke();
  
  // Add shimmer highlights on the water line
  if (shimmerIntensity > 0.7) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${(shimmerIntensity - 0.7) * 2})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  
  ctx.restore();
}

/**
 * Renders only the water line effects for sea stacks (blue gradient overlay)
 * This should be called AFTER swimming players to ensure the water appears over them
 */
export function renderSeaStackWaterEffectsOnly(
  ctx: CanvasRenderingContext2D,
  seaStack: any, // Server-provided sea stack entity
  doodadImages: Map<string, HTMLImageElement> | null,
  currentTimeMs?: number // Current time for animations
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
      rotation: 0.0,
      opacity: seaStack.opacity || 1.0,
      imageIndex: imageIndex
    };
    
    const width = SEA_STACK_CONFIG.BASE_WIDTH * clientStack.scale;
    const height = (stackImage.naturalHeight / stackImage.naturalWidth) * width;
    
    // Draw ONLY the water effects in the stack's coordinate space
    ctx.save();
    ctx.translate(clientStack.x, clientStack.y);
    ctx.rotate(clientStack.rotation);
    ctx.globalAlpha = clientStack.opacity;
    
    if (currentTimeMs !== undefined) {
      drawWaterLineEffects(ctx, clientStack, stackImage, width, height, currentTimeMs);
    }
    
    ctx.restore();
  }
}

/**
 * Renders only the water line (animated line, no gradient)
 * This should be called LAST to render the water line on top of both base and tower
 */
export function renderSeaStackWaterLineOnly(
  ctx: CanvasRenderingContext2D,
  seaStack: any, // Server-provided sea stack entity
  doodadImages: Map<string, HTMLImageElement> | null,
  currentTimeMs?: number // Current time for animations
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
      rotation: 0.0,
      opacity: seaStack.opacity || 1.0,
      imageIndex: imageIndex
    };
    
    const width = SEA_STACK_CONFIG.BASE_WIDTH * clientStack.scale;
    const height = (stackImage.naturalHeight / stackImage.naturalWidth) * width;
    
    // Draw ONLY the water line in the stack's coordinate space
    ctx.save();
    ctx.translate(clientStack.x, clientStack.y);
    ctx.rotate(clientStack.rotation);
    ctx.globalAlpha = clientStack.opacity;
    
    if (currentTimeMs !== undefined) {
      drawWaterLineOnly(ctx, clientStack, stackImage, width, height, currentTimeMs);
    }
    
    ctx.restore();
  }
}

// Removed clearSeaStackCache function - no longer needed since sea stacks are server-authoritative 