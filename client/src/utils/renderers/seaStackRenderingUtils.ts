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

// Water line config – barrel-style: wavy clip + underwater tinting via offscreen compositing
const WATER_LINE_CONFIG = {
  WAVE_AMPLITUDE: 2.5,              // px – subtle vertical wiggle
  WAVE_FREQUENCY: 0.003,            // time-based primary wave speed
  WAVE_SPATIAL_FREQ: 0.025,         // spatial freq (waves per px across width)
  WAVE_SECONDARY_AMPLITUDE: 1.2,    // px – secondary wave
  WAVE_SECONDARY_FREQUENCY: 0.005,  // time-based secondary wave speed
  UNDERWATER_FADE_SLICES: 20,        // number of horizontal slices for the fade
  TINT_COLOR: { r: 30, g: 70, b: 100 },   // deep blue tint for underwater rock
  TINT_INTENSITY: 0.55,             // strong tint so it's clearly visible on brown rock
  DARKEN_INTENSITY: 0.35,           // noticeable darkening below water line
  // Water line stroke
  LINE_WIDTH: 2.5,                  // px – main water line thickness
  LINE_COLOR: 'rgba(210, 235, 255, 0.55)', // bright highlight line
  GLOW_WIDTH: 6.0,                  // px – soft glow behind the line
  GLOW_COLOR: 'rgba(180, 220, 255, 0.18)', // diffuse glow
  // Froth / foam system
  FROTH_SPREAD_ABOVE: 3,            // px – how far above the wave line froth can appear
  FROTH_SPREAD_BELOW: 14,           // px – how far below the wave line froth extends
  // Foam band: irregular, layered strokes hugging the waterline
  FOAM_BAND_PASSES: 3,
  FOAM_BAND_BASE_WIDTH: 1.8,
  FOAM_BAND_MAX_WIDTH: 4.5,
  // Foam clusters: groups of overlapping circles
  FOAM_CLUSTER_COUNT: 8,
  FOAM_CLUSTER_MIN_DOTS: 3,
  FOAM_CLUSTER_MAX_DOTS: 7,
  FOAM_CLUSTER_SPREAD: 5,
  FOAM_CLUSTER_DOT_MIN_R: 1.0,
  FOAM_CLUSTER_DOT_MAX_R: 3.2,
  // Foam streaks: curved wispy lines drifting below waterline
  FOAM_STREAK_COUNT: 6,
  FOAM_STREAK_MIN_LEN: 6,
  FOAM_STREAK_MAX_LEN: 16,
  FOAM_STREAK_WIDTH: 1.2,
  // Scattered individual bubbles
  BUBBLE_COUNT: 10,
  BUBBLE_MIN_R: 0.6,
  BUBBLE_MAX_R: 1.6,
  // Colors
  FOAM_COLOR_BRIGHT: { r: 240, g: 250, b: 255 },
  FOAM_COLOR_MID: { r: 200, g: 230, b: 250 },
  FOAM_COLOR_DIM: { r: 160, g: 200, b: 235 },
};

// Offscreen canvas for sea stack water line compositing (reused)
let waterLineOffscreen: OffscreenCanvas | HTMLCanvasElement | null = null;
let waterLineOffCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getWaterLineOffscreen(w: number, h: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } | null {
  if (!waterLineOffscreen || waterLineOffscreen.width < w || waterLineOffscreen.height < h) {
    const cw = Math.max(w, waterLineOffscreen?.width ?? 0);
    const ch = Math.max(h, waterLineOffscreen?.height ?? 0);
    try { waterLineOffscreen = new OffscreenCanvas(cw, ch); }
    catch { waterLineOffscreen = document.createElement('canvas'); waterLineOffscreen.width = cw; waterLineOffscreen.height = ch; }
    waterLineOffCtx = waterLineOffscreen.getContext('2d') as any;
  }
  if (!waterLineOffCtx) return null;
  return { canvas: waterLineOffscreen, ctx: waterLineOffCtx };
}

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
      pivotYOffset: -40, // Shadow anchored exactly at the water line base
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
    // Bottom pass: tinted underwater rock fading out + water line + froth
    // This renders at water level (behind players in Y-sort order)
    const baseHeight = height * BASE_PORTION;
    const halfW = width / 2;
    const waterLineY = -baseHeight; // Local Y where rock meets water
    const nowMs = currentTimeMs || 0;
    const savedAlpha = ctx.globalAlpha;

    // Time-animated wave offset
    const getWaveOffset = (localX: number) => {
      const worldX = stack.x + localX;
      return Math.sin(nowMs * WATER_LINE_CONFIG.WAVE_FREQUENCY + worldX * WATER_LINE_CONFIG.WAVE_SPATIAL_FREQ)
        * WATER_LINE_CONFIG.WAVE_AMPLITUDE
        + Math.sin(nowMs * WATER_LINE_CONFIG.WAVE_SECONDARY_FREQUENCY + worldX * WATER_LINE_CONFIG.WAVE_SPATIAL_FREQ * 1.6 + Math.PI * 0.3)
        * WATER_LINE_CONFIG.WAVE_SECONDARY_AMPLITUDE;
    };

    const waveSegments = 24;
    const segW = width / waveSegments;

    // --- Create tinted "wet rock" on offscreen ---
    const offPad = 4;
    const offW = Math.ceil(width) + offPad * 2;
    const offH = Math.ceil(height) + offPad * 2;
    const off = getWaterLineOffscreen(offW, offH);

    if (off) {
      const { ctx: oCtx } = off;
      oCtx.save();
      oCtx.setTransform(1, 0, 0, 1, 0, 0);
      oCtx.clearRect(0, 0, offW, offH);
      oCtx.drawImage(image, offPad, offPad, width, height);
      oCtx.globalCompositeOperation = 'source-atop';
      const { r, g, b } = WATER_LINE_CONFIG.TINT_COLOR;
      oCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${WATER_LINE_CONFIG.TINT_INTENSITY})`;
      oCtx.fillRect(0, 0, offW, offH);
      oCtx.fillStyle = `rgba(0, 15, 30, ${WATER_LINE_CONFIG.DARKEN_INTENSITY})`;
      oCtx.fillRect(0, 0, offW, offH);
      oCtx.globalCompositeOperation = 'source-over';
      oCtx.restore();

      // --- Draw tinted rock below waterline, fading to transparent ---
      const numSlices = WATER_LINE_CONFIG.UNDERWATER_FADE_SLICES;
      const underwaterHeight = baseHeight;
      const sliceH = underwaterHeight / numSlices;

      for (let i = 0; i < numSlices; i++) {
        const t = (i + 0.5) / numSlices;
        const sliceAlpha = Math.max(0, 1.0 - t);
        if (sliceAlpha < 0.01) continue;

        ctx.save();
        ctx.globalAlpha = savedAlpha * sliceAlpha;

        ctx.beginPath();
        const sliceTop = waterLineY + i * sliceH;
        const sliceBot = waterLineY + (i + 1) * sliceH;

        if (i === 0) {
          for (let j = 0; j <= waveSegments; j++) {
            const lx = -halfW + j * segW;
            const wy = waterLineY + getWaveOffset(lx);
            if (j === 0) ctx.moveTo(lx, wy);
            else ctx.lineTo(lx, wy);
          }
          ctx.lineTo(halfW, sliceBot);
          ctx.lineTo(-halfW, sliceBot);
        } else {
          ctx.moveTo(-halfW, sliceTop);
          ctx.lineTo(halfW, sliceTop);
          ctx.lineTo(halfW, sliceBot);
          ctx.lineTo(-halfW, sliceBot);
        }
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(off.canvas, 0, 0, offW, offH, -halfW - offPad, -height - offPad, offW, offH);
        ctx.restore();
      }
      ctx.globalAlpha = savedAlpha;

      // --- Water line (glow + main stroke) masked to rock silhouette ---
      // Draw stroke on offscreen, then mask with destination-in so only rock-overlapping pixels remain
      const buildWavePathOnOff = () => {
        oCtx.beginPath();
        for (let i = 0; i <= waveSegments; i++) {
          const lx = -halfW + i * segW;
          const ox = lx + halfW + offPad;
          const oy = (waterLineY + getWaveOffset(lx)) + height + offPad;
          if (i === 0) oCtx.moveTo(ox, oy);
          else oCtx.lineTo(ox, oy);
        }
      };

      // Glow
      oCtx.save();
      oCtx.setTransform(1, 0, 0, 1, 0, 0);
      oCtx.clearRect(0, 0, offW, offH);
      oCtx.strokeStyle = WATER_LINE_CONFIG.GLOW_COLOR;
      oCtx.lineWidth = WATER_LINE_CONFIG.GLOW_WIDTH;
      oCtx.lineCap = 'round';
      oCtx.lineJoin = 'round';
      buildWavePathOnOff();
      oCtx.stroke();
      // Mask: keep only where rock has pixels
      oCtx.globalCompositeOperation = 'destination-in';
      oCtx.drawImage(image, offPad, offPad, width, height);
      oCtx.globalCompositeOperation = 'source-over';
      oCtx.restore();
      ctx.drawImage(off.canvas, 0, 0, offW, offH, -halfW - offPad, -height - offPad, offW, offH);

      // Main line
      oCtx.save();
      oCtx.setTransform(1, 0, 0, 1, 0, 0);
      oCtx.clearRect(0, 0, offW, offH);
      oCtx.strokeStyle = WATER_LINE_CONFIG.LINE_COLOR;
      oCtx.lineWidth = WATER_LINE_CONFIG.LINE_WIDTH;
      oCtx.lineCap = 'round';
      oCtx.lineJoin = 'round';
      buildWavePathOnOff();
      oCtx.stroke();
      oCtx.globalCompositeOperation = 'destination-in';
      oCtx.drawImage(image, offPad, offPad, width, height);
      oCtx.globalCompositeOperation = 'source-over';
      oCtx.restore();
      ctx.drawImage(off.canvas, 0, 0, offW, offH, -halfW - offPad, -height - offPad, offW, offH);

      // --- Rich foam system masked to rock silhouette ---
      const wavePoints: { x: number; y: number }[] = [];
      for (let i = 0; i <= waveSegments; i++) {
        const lx = -halfW + i * segW;
        wavePoints.push({ x: lx, y: waterLineY + getWaveOffset(lx) });
      }

      // Deterministic RNG seeded by stack world position (stable per-stack)
      const foamSeed = Math.abs(Math.sin(stack.x * 73.17 + stack.y * 91.31)) * 10000;
      const rng = (idx: number) => {
        const v = Math.sin(foamSeed + idx * 127.1 + idx * idx * 0.31) * 43758.5453;
        return v - Math.floor(v);
      };

      // Helper: get interpolated wave Y in offscreen coords at fractional X [0..1]
      const waveYAtFrac = (frac: number): number => {
        const seg = Math.min(waveSegments - 1, Math.floor(frac * waveSegments));
        const t = frac * waveSegments - seg;
        return (wavePoints[seg].y * (1 - t) + wavePoints[seg + 1].y * t) + height + offPad;
      };

      // Slow time-based drift for subtle animation
      const drift = nowMs * 0.0004;

      oCtx.save();
      oCtx.setTransform(1, 0, 0, 1, 0, 0);
      oCtx.clearRect(0, 0, offW, offH);

      // ========== Layer 1: Foam band (irregular, layered strokes hugging the waterline) ==========
      const C = WATER_LINE_CONFIG;
      for (let pass = 0; pass < C.FOAM_BAND_PASSES; pass++) {
        const passT = pass / C.FOAM_BAND_PASSES;
        // Each pass has slightly different width and vertical offset for irregularity
        const lw = C.FOAM_BAND_BASE_WIDTH + passT * (C.FOAM_BAND_MAX_WIDTH - C.FOAM_BAND_BASE_WIDTH);
        const yShift = (pass - 1) * 1.5; // shifts: -1.5, 0, +1.5
        const alpha = 0.35 - pass * 0.08; // dimmer for outer passes

        oCtx.strokeStyle = `rgba(235, 248, 255, ${alpha})`;
        oCtx.lineWidth = lw;
        oCtx.lineCap = 'round';
        oCtx.lineJoin = 'round';
        oCtx.beginPath();

        // Build an irregular path: the main wave with per-segment thickness wobble
        for (let i = 0; i <= waveSegments; i++) {
          const frac = i / waveSegments;
          const wy = waveYAtFrac(frac) + yShift;
          // Add per-pass spatial wobble for organic look
          const wobble = Math.sin(frac * Math.PI * 5 + pass * 2.1 + drift) * 1.2;
          const ox = frac * width + offPad;
          if (i === 0) oCtx.moveTo(ox, wy + wobble);
          else oCtx.lineTo(ox, wy + wobble);
        }
        oCtx.stroke();
      }

      // ========== Layer 2: Foam clusters (groups of overlapping circles) ==========
      let rngIdx = 0;
      for (let ci = 0; ci < C.FOAM_CLUSTER_COUNT; ci++) {
        // Cluster center position along the rock
        const cx = rng(rngIdx++) * 0.8 + 0.1; // avoid edges
        const cyBias = rng(rngIdx++) * C.FROTH_SPREAD_BELOW * 0.7 + 1; // mostly below waterline
        const clusterCenterY = waveYAtFrac(cx) + cyBias;
        const clusterCenterX = cx * width + offPad;
        const dotCount = C.FOAM_CLUSTER_MIN_DOTS + Math.floor(rng(rngIdx++) * (C.FOAM_CLUSTER_MAX_DOTS - C.FOAM_CLUSTER_MIN_DOTS + 1));

        // Slow animation: cluster gently breathes/drifts
        const clusterDriftX = Math.sin(drift * 1.3 + ci * 1.7) * 1.5;
        const clusterDriftY = Math.sin(drift * 0.9 + ci * 2.3) * 0.8;

        for (let di = 0; di < dotCount; di++) {
          const angle = rng(rngIdx++) * Math.PI * 2;
          const dist = rng(rngIdx++) * C.FOAM_CLUSTER_SPREAD;
          const dotR = C.FOAM_CLUSTER_DOT_MIN_R + rng(rngIdx++) * (C.FOAM_CLUSTER_DOT_MAX_R - C.FOAM_CLUSTER_DOT_MIN_R);

          const dx = clusterCenterX + Math.cos(angle) * dist + clusterDriftX;
          const dy = clusterCenterY + Math.sin(angle) * dist * 0.6 + clusterDriftY; // squash vertically

          // Dots near center are brighter
          const centerDist = dist / C.FOAM_CLUSTER_SPREAD;
          const dotAlpha = (0.3 + rng(rngIdx++) * 0.35) * (1 - centerDist * 0.5);

          // Pick color: center dots brighter, edge dots dimmer
          const cm = centerDist < 0.4 ? C.FOAM_COLOR_BRIGHT : centerDist < 0.7 ? C.FOAM_COLOR_MID : C.FOAM_COLOR_DIM;

          oCtx.fillStyle = `rgba(${cm.r}, ${cm.g}, ${cm.b}, ${dotAlpha})`;
          oCtx.beginPath();
          oCtx.arc(dx, dy, dotR, 0, Math.PI * 2);
          oCtx.fill();
        }
      }

      // ========== Layer 3: Foam streaks (wispy curved lines below waterline) ==========
      for (let si = 0; si < C.FOAM_STREAK_COUNT; si++) {
        const sx = rng(rngIdx++) * 0.8 + 0.1;
        const syBias = 2 + rng(rngIdx++) * (C.FROTH_SPREAD_BELOW - 2);
        const startX = sx * width + offPad;
        const startY = waveYAtFrac(sx) + syBias;
        const len = C.FOAM_STREAK_MIN_LEN + rng(rngIdx++) * (C.FOAM_STREAK_MAX_LEN - C.FOAM_STREAK_MIN_LEN);
        const curvature = (rng(rngIdx++) - 0.5) * 4; // slight curve up or down

        // Animate: gentle horizontal drift
        const streakDrift = Math.sin(drift * 0.7 + si * 3.1) * 2;

        const alpha = 0.12 + rng(rngIdx++) * 0.18;
        oCtx.strokeStyle = `rgba(210, 235, 255, ${alpha})`;
        oCtx.lineWidth = C.FOAM_STREAK_WIDTH + rng(rngIdx++) * 0.8;
        oCtx.lineCap = 'round';
        oCtx.beginPath();
        oCtx.moveTo(startX + streakDrift, startY);
        // Quadratic curve for organic shape
        oCtx.quadraticCurveTo(
          startX + len * 0.5 + streakDrift,
          startY + curvature,
          startX + len + streakDrift,
          startY + curvature * 0.3
        );
        oCtx.stroke();
      }

      // ========== Layer 4: Scattered individual bubbles ==========
      for (let bi = 0; bi < C.BUBBLE_COUNT; bi++) {
        const bx = rng(rngIdx++) * width;
        const byBias = rng(rngIdx++) < 0.2
          ? -rng(rngIdx++) * C.FROTH_SPREAD_ABOVE
          : rng(rngIdx++) * C.FROTH_SPREAD_BELOW;
        const frac = bx / width;
        const by = waveYAtFrac(Math.min(1, Math.max(0, frac))) + byBias;
        const br = C.BUBBLE_MIN_R + rng(rngIdx++) * (C.BUBBLE_MAX_R - C.BUBBLE_MIN_R);

        // Gentle bob animation
        const bob = Math.sin(drift * 1.5 + bi * 2.7) * 0.8;
        const bAlpha = 0.2 + rng(rngIdx++) * 0.3;

        oCtx.fillStyle = `rgba(230, 245, 255, ${bAlpha})`;
        oCtx.beginPath();
        oCtx.arc(bx + offPad, by + bob, br, 0, Math.PI * 2);
        oCtx.fill();

        // Tiny specular highlight on each bubble
        if (br > 1.0) {
          oCtx.fillStyle = `rgba(255, 255, 255, ${bAlpha * 0.6})`;
          oCtx.beginPath();
          oCtx.arc(bx + offPad - br * 0.25, by + bob - br * 0.25, br * 0.3, 0, Math.PI * 2);
          oCtx.fill();
        }
      }

      // Mask everything to rock silhouette
      oCtx.globalCompositeOperation = 'destination-in';
      oCtx.drawImage(image, offPad, offPad, width, height);
      oCtx.globalCompositeOperation = 'source-over';
      oCtx.restore();
      ctx.drawImage(off.canvas, 0, 0, offW, offH, -halfW - offPad, -height - offPad, offW, offH);
    }

    ctx.globalAlpha = savedAlpha;
  } else if (halfMode === 'top') {
    // Top pass: only the above-water rock, clipped at the wavy waterline boundary.
    // All underwater effects (tint, fade, water line, froth) are in the 'bottom' pass
    // so they render at water level (behind players in Y-sort order).
    const baseHeight = height * BASE_PORTION;
    const halfW = width / 2;
    const waterLineY = -baseHeight;
    const nowMs = currentTimeMs || 0;

    const getWaveOffset = (localX: number) => {
      const worldX = stack.x + localX;
      return Math.sin(nowMs * WATER_LINE_CONFIG.WAVE_FREQUENCY + worldX * WATER_LINE_CONFIG.WAVE_SPATIAL_FREQ)
        * WATER_LINE_CONFIG.WAVE_AMPLITUDE
        + Math.sin(nowMs * WATER_LINE_CONFIG.WAVE_SECONDARY_FREQUENCY + worldX * WATER_LINE_CONFIG.WAVE_SPATIAL_FREQ * 1.6 + Math.PI * 0.3)
        * WATER_LINE_CONFIG.WAVE_SECONDARY_AMPLITUDE;
    };

    const waveSegments = 24;
    const segW = width / waveSegments;

    // Clip to above-water region with wavy bottom edge, then draw normal rock
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-halfW - 2, -height - 2);
    ctx.lineTo(halfW + 2, -height - 2);
    ctx.lineTo(halfW + 2, waterLineY);
    for (let i = waveSegments; i >= 0; i--) {
      const lx = -halfW + i * segW;
      ctx.lineTo(lx, waterLineY + getWaveOffset(lx));
    }
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, -halfW, -height, width, height);
    ctx.restore();
  } else {
    // Render full sea stack (shadow cutouts and fallback)
    ctx.drawImage(image, -width / 2, -height, width, height);
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