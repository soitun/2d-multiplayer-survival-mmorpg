/**
 * Health and Frost Overlay Rendering Utilities
 * Creates pixel art style screen edge overlays for low health and cold conditions
 */

interface OverlayState {
  pulsePhase: number;
  edgeIntensity: number;
}

let bloodOverlayState: OverlayState = {
  pulsePhase: 0,
  edgeIntensity: 0,
};

let frostOverlayState: OverlayState = {
  pulsePhase: 0,
  edgeIntensity: 0,
};

/**
 * Creates a pixelated vignette effect using canvas patterns
 */
function createPixelVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  color: string,
  edgeWidth: number = 150
): void {
  ctx.save();
  
  // Create gradient for smooth edge fade
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.3,
    width / 2,
    height / 2,
    Math.min(width, height) * 0.7
  );
  
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(0.6, 'transparent');
  gradient.addColorStop(1, color);
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Add stronger edge effect
  const edgeGradient = ctx.createLinearGradient(0, 0, edgeWidth, 0);
  edgeGradient.addColorStop(0, color);
  edgeGradient.addColorStop(1, 'transparent');
  
  // Top edge
  ctx.fillStyle = edgeGradient;
  ctx.fillRect(0, 0, width, edgeWidth);
  
  // Bottom edge (flipped)
  const bottomGradient = ctx.createLinearGradient(0, height - edgeWidth, 0, height);
  bottomGradient.addColorStop(0, 'transparent');
  bottomGradient.addColorStop(1, color);
  ctx.fillStyle = bottomGradient;
  ctx.fillRect(0, height - edgeWidth, width, edgeWidth);
  
  // Left edge
  const leftGradient = ctx.createLinearGradient(0, 0, 0, edgeWidth);
  leftGradient.addColorStop(0, color);
  leftGradient.addColorStop(1, 'transparent');
  ctx.fillStyle = leftGradient;
  ctx.fillRect(0, 0, edgeWidth, height);
  
  // Right edge (flipped)
  const rightGradient = ctx.createLinearGradient(width - edgeWidth, 0, width, 0);
  rightGradient.addColorStop(0, 'transparent');
  rightGradient.addColorStop(1, color);
  ctx.fillStyle = rightGradient;
  ctx.fillRect(width - edgeWidth, 0, edgeWidth, height);
  
  ctx.restore();
}

/**
 * Creates pixelated blood splatter pattern on edges
 */
function createBloodSplatter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  pulsePhase: number
): void {
  ctx.save();
  ctx.globalAlpha = intensity * (0.4 + 0.2 * Math.sin(pulsePhase * 0.05));
  
  const pixelSize = 4; // Pixel art size
  const edgeWidth = 120;
  const splatterDensity = Math.floor(intensity * 15);
  
  // Create blood red color with slight variation
  const bloodColors = [
    'rgba(139, 0, 0, 0.8)',   // Dark red
    'rgba(178, 34, 34, 0.7)',  // Fire brick
    'rgba(128, 0, 0, 0.9)',    // Maroon
  ];
  
  // Top edge splatters
  for (let i = 0; i < splatterDensity; i++) {
    const x = Math.random() * width;
    const y = Math.random() * edgeWidth;
    const size = 2 + Math.random() * 3;
    const color = bloodColors[Math.floor(Math.random() * bloodColors.length)];
    
    ctx.fillStyle = color;
    ctx.fillRect(
      Math.floor(x / pixelSize) * pixelSize,
      Math.floor(y / pixelSize) * pixelSize,
      Math.floor(size) * pixelSize,
      Math.floor(size) * pixelSize
    );
  }
  
  // Bottom edge splatters
  for (let i = 0; i < splatterDensity; i++) {
    const x = Math.random() * width;
    const y = height - edgeWidth + Math.random() * edgeWidth;
    const size = 2 + Math.random() * 3;
    const color = bloodColors[Math.floor(Math.random() * bloodColors.length)];
    
    ctx.fillStyle = color;
    ctx.fillRect(
      Math.floor(x / pixelSize) * pixelSize,
      Math.floor(y / pixelSize) * pixelSize,
      Math.floor(size) * pixelSize,
      Math.floor(size) * pixelSize
    );
  }
  
  // Left edge splatters
  for (let i = 0; i < splatterDensity; i++) {
    const x = Math.random() * edgeWidth;
    const y = Math.random() * height;
    const size = 2 + Math.random() * 3;
    const color = bloodColors[Math.floor(Math.random() * bloodColors.length)];
    
    ctx.fillStyle = color;
    ctx.fillRect(
      Math.floor(x / pixelSize) * pixelSize,
      Math.floor(y / pixelSize) * pixelSize,
      Math.floor(size) * pixelSize,
      Math.floor(size) * pixelSize
    );
  }
  
  // Right edge splatters
  for (let i = 0; i < splatterDensity; i++) {
    const x = width - edgeWidth + Math.random() * edgeWidth;
    const y = Math.random() * height;
    const size = 2 + Math.random() * 3;
    const color = bloodColors[Math.floor(Math.random() * bloodColors.length)];
    
    ctx.fillStyle = color;
    ctx.fillRect(
      Math.floor(x / pixelSize) * pixelSize,
      Math.floor(y / pixelSize) * pixelSize,
      Math.floor(size) * pixelSize,
      Math.floor(size) * pixelSize
    );
  }
  
  ctx.restore();
}

/**
 * Creates pixelated frost/ice pattern on edges
 */
function createFrostPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  pulsePhase: number
): void {
  ctx.save();
  ctx.globalAlpha = intensity * (0.5 + 0.3 * Math.sin(pulsePhase * 0.03));
  
  const pixelSize = 3; // Smaller pixels for frost
  const edgeWidth = 140;
  const frostDensity = Math.floor(intensity * 20);
  
  // Create frost/ice colors
  const frostColors = [
    'rgba(176, 224, 230, 0.6)',  // Powder blue
    'rgba(135, 206, 250, 0.7)',  // Light sky blue
    'rgba(173, 216, 230, 0.65)', // Light blue
    'rgba(176, 196, 222, 0.7)',  // Light steel blue
    'rgba(255, 255, 255, 0.5)',  // White frost
  ];
  
  // Create frost crystal pattern
  const drawFrostCrystal = (x: number, y: number, size: number) => {
    const color = frostColors[Math.floor(Math.random() * frostColors.length)];
    ctx.fillStyle = color;
    
    // Draw pixelated crystal shape
    const halfSize = Math.floor(size / 2);
    for (let dy = -halfSize; dy <= halfSize; dy++) {
      for (let dx = -halfSize; dx <= halfSize; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= size / 2 && Math.random() > 0.3) {
          ctx.fillRect(
            Math.floor((x + dx) / pixelSize) * pixelSize,
            Math.floor((y + dy) / pixelSize) * pixelSize,
            pixelSize,
            pixelSize
          );
        }
      }
    }
  };
  
  // Top edge frost
  for (let i = 0; i < frostDensity; i++) {
    const x = Math.random() * width;
    const y = Math.random() * edgeWidth;
    const size = 3 + Math.random() * 5;
    drawFrostCrystal(x, y, size);
  }
  
  // Bottom edge frost
  for (let i = 0; i < frostDensity; i++) {
    const x = Math.random() * width;
    const y = height - edgeWidth + Math.random() * edgeWidth;
    const size = 3 + Math.random() * 5;
    drawFrostCrystal(x, y, size);
  }
  
  // Left edge frost
  for (let i = 0; i < frostDensity; i++) {
    const x = Math.random() * edgeWidth;
    const y = Math.random() * height;
    const size = 3 + Math.random() * 5;
    drawFrostCrystal(x, y, size);
  }
  
  // Right edge frost
  for (let i = 0; i < frostDensity; i++) {
    const x = width - edgeWidth + Math.random() * edgeWidth;
    const y = Math.random() * height;
    const size = 3 + Math.random() * 5;
    drawFrostCrystal(x, y, size);
  }
  
  ctx.restore();
}

/**
 * Renders blood overlay for low health
 * @param isCombinedMode - If true, reduces intensity slightly to blend with frost overlay
 */
export function renderBloodOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  healthPercent: number,
  deltaTime: number,
  isCombinedMode: boolean = false
): void {
  // Only show overlay when health is below 30%
  if (healthPercent >= 0.3) {
    // Fade out when health recovers (deltaTime in seconds)
    bloodOverlayState.edgeIntensity = Math.max(0, bloodOverlayState.edgeIntensity - deltaTime * 2.0);
    // Still render if fading out
    if (bloodOverlayState.edgeIntensity <= 0) {
      return;
    }
  } else {
    // Calculate intensity based on health (0.3 = 30% health, 0.0 = 0% health)
    // At 30% health, start with noticeable intensity (0.4), scale up to 1.0 at 0% health
    const healthFactor = (0.3 - healthPercent) / 0.3; // 0 to 1, higher = lower health
    const baseIntensity = 0.4; // Minimum intensity at 30% health
    const targetIntensity = Math.min(1.0, baseIntensity + (healthFactor * 0.6)); // Scale from 0.4 to 1.0
    
    // Smooth intensity transition (deltaTime in seconds, but we use frame-based interpolation)
    bloodOverlayState.edgeIntensity = Math.min(1.0, bloodOverlayState.edgeIntensity + (targetIntensity - bloodOverlayState.edgeIntensity) * 0.1);
  }
  
  // Update pulse phase for animation (deltaTime in seconds)
  bloodOverlayState.pulsePhase += deltaTime * 1000; // Convert to milliseconds for pulse calculations
  
  // Adjust intensity when combined with frost (slightly reduce to allow blending)
  const intensityMultiplier = isCombinedMode ? 0.85 : 1.0;
  const adjustedIntensity = bloodOverlayState.edgeIntensity * intensityMultiplier;
  
  // Create blood red vignette (more intense)
  createPixelVignette(
    ctx,
    width,
    height,
    adjustedIntensity,
    `rgba(139, 0, 0, ${adjustedIntensity * 0.6})`, // Increased from 0.4 to 0.6
    150
  );
  
  // Add more noticeable red tint to entire screen
  ctx.save();
  ctx.globalAlpha = adjustedIntensity * 0.25; // Increased from 0.15 to 0.25
  ctx.fillStyle = '#8B0000'; // Dark red
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Renders frost overlay when cold status effect is active (warmth < 20%)
 * @param isCombinedMode - If true, uses blend mode to combine with blood overlay
 */
export function renderFrostOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  warmthPercent: number,
  deltaTime: number,
  isCombinedMode: boolean = false
): void {
  // Show when warmth < 20% (cold status threshold)
  const COLD_THRESHOLD = 0.2; // 20% warmth
  
  if (warmthPercent >= COLD_THRESHOLD) {
    // Fade out when warmth recovers (deltaTime in seconds)
    frostOverlayState.edgeIntensity = Math.max(0, frostOverlayState.edgeIntensity - deltaTime * 2.0);
    // Still render if fading out
    if (frostOverlayState.edgeIntensity <= 0) {
      return;
    }
  } else {
    // Calculate intensity based on warmth (0.2 = 20% warmth, 0.0 = 0% warmth)
    const warmthFactor = (COLD_THRESHOLD - warmthPercent) / COLD_THRESHOLD; // 0 to 1, higher = colder
    const targetIntensity = Math.min(1.0, warmthFactor * 1.2); // Scale for dramatic effect
    
    // Smooth intensity transition (deltaTime in seconds, but we use frame-based interpolation)
    frostOverlayState.edgeIntensity = Math.min(1.0, frostOverlayState.edgeIntensity + (targetIntensity - frostOverlayState.edgeIntensity) * 0.1);
  }
  
  // Update pulse phase for animation (deltaTime in seconds)
  frostOverlayState.pulsePhase += deltaTime * 1000; // Convert to milliseconds for pulse calculations
  
  // Adjust intensity when combined with blood (slightly reduce to allow blending)
  const intensityMultiplier = isCombinedMode ? 0.85 : 1.0;
  const adjustedIntensity = frostOverlayState.edgeIntensity * intensityMultiplier;
  
  // Use blend mode when combined with blood overlay for better visual mixing
  if (isCombinedMode) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen'; // Screen blend mode for additive-like effect
  }
  
  // Create frost blue vignette
  createPixelVignette(
    ctx,
    width,
    height,
    adjustedIntensity,
    `rgba(135, 206, 250, ${adjustedIntensity * 0.5})`,
    160
  );
  
  // Add subtle blue tint to entire screen
  ctx.save();
  ctx.globalAlpha = adjustedIntensity * 0.2;
  ctx.fillStyle = '#87CEEB'; // Light sky blue
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  
  // Add slight desaturation effect (make everything look colder)
  ctx.save();
  ctx.globalAlpha = adjustedIntensity * 0.1;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  
  if (isCombinedMode) {
    ctx.restore(); // Restore blend mode
  }
}

/**
 * Renders combined blood and frost overlays with proper blending
 */
export function renderCombinedHealthOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  healthPercent: number,
  warmthPercent: number,
  deltaTime: number
): void {
  const isLowHealth = healthPercent < 0.3;
  const isCold = warmthPercent < 0.2;
  
  // Render blood overlay first (base layer)
  if (isLowHealth) {
    renderBloodOverlay(ctx, width, height, healthPercent, deltaTime, isCold);
  }
  
  // Render frost overlay on top with blend mode
  if (isCold) {
    renderFrostOverlay(ctx, width, height, warmthPercent, deltaTime, isLowHealth);
  }
}

/**
 * Resets overlay state (useful when player dies or respawns)
 */
export function resetOverlayState(): void {
  bloodOverlayState = {
    pulsePhase: 0,
    edgeIntensity: 0,
  };
  frostOverlayState = {
    pulsePhase: 0,
    edgeIntensity: 0,
  };
}

