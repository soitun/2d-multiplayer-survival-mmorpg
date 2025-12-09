/**
 * Insanity Overlay Rendering Utilities
 * Creates visual screen effects for Memory Shard insanity mechanic
 * 
 * Visual style: Distorted reality, glitchy digital artifacts
 * - Purple/pink vignette overlay (similar to health overlay pattern)
 * - Full-screen purple tint
 * - Glitchy scan lines
 * - Digital artifacts/glitches
 * 
 * Intensity increases as insanity bar goes up (0.0-1.0)
 */

// Animation state for insanity effect
interface InsanityAnimationState {
  pulsePhase: number;
  wobbleOffset: { x: number; y: number };
  intensity: number;
}

let insanityState: InsanityAnimationState = {
  pulsePhase: 0,
  wobbleOffset: { x: 0, y: 0 },
  intensity: 0,
};

/**
 * Creates a pixelated purple/pink vignette effect (EXACTLY like health overlay pattern)
 */
function createInsanityVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  intensity: number,
  edgeWidth: number = 150
): void {
  ctx.save();
  
  // Calculate color with intensity-based alpha (EXACTLY like health overlay)
  // Use purple/pink colors that scale with intensity
  const baseAlpha = intensity * 0.6; // Same as health overlay (0.6 max alpha)
  const purpleColor = `rgba(255, 0, 255, ${baseAlpha})`; // Bright magenta/pink
  
  // Create gradient for smooth edge fade (EXACTLY like health overlay)
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
  gradient.addColorStop(1, purpleColor);
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Add stronger edge effect (EXACTLY like health overlay)
  const edgeGradient = ctx.createLinearGradient(0, 0, edgeWidth, 0);
  edgeGradient.addColorStop(0, purpleColor);
  edgeGradient.addColorStop(1, 'transparent');
  
  // Top edge
  ctx.fillStyle = edgeGradient;
  ctx.fillRect(0, 0, width, edgeWidth);
  
  // Bottom edge (flipped)
  const bottomGradient = ctx.createLinearGradient(0, height - edgeWidth, 0, height);
  bottomGradient.addColorStop(0, 'transparent');
  bottomGradient.addColorStop(1, purpleColor);
  ctx.fillStyle = bottomGradient;
  ctx.fillRect(0, height - edgeWidth, width, edgeWidth);
  
  // Left edge
  const leftGradient = ctx.createLinearGradient(0, 0, 0, edgeWidth);
  leftGradient.addColorStop(0, purpleColor);
  leftGradient.addColorStop(1, 'transparent');
  ctx.fillStyle = leftGradient;
  ctx.fillRect(0, 0, edgeWidth, height);
  
  // Right edge (flipped)
  const rightGradient = ctx.createLinearGradient(width - edgeWidth, 0, width, 0);
  rightGradient.addColorStop(0, 'transparent');
  rightGradient.addColorStop(1, purpleColor);
  ctx.fillStyle = rightGradient;
  ctx.fillRect(width - edgeWidth, 0, edgeWidth, height);
  
  ctx.restore();
}

/**
 * Renders the memory shard insanity visual effect
 * Intensity increases as insanity bar goes up (0.0-1.0)
 * 
 * @param insanityIntensity - Insanity intensity (0.0-1.0) from player.insanity / max_insanity
 */
export function renderInsanityOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  deltaTime: number,
  insanityIntensity: number // 0.0-1.0 (insanity / max_insanity)
): void {
  // Only show overlay when insanity is above 10% (similar to health overlay threshold)
  const INSANITY_THRESHOLD = 0.1; // 10% insanity
  
  if (insanityIntensity < INSANITY_THRESHOLD) {
    // Fade out when insanity decreases (deltaTime in seconds)
    insanityState.intensity = Math.max(0, insanityState.intensity - deltaTime * 2.0);
    // Still render if fading out
    if (insanityState.intensity <= 0) {
      return;
    }
  } else {
    // Calculate intensity based on insanity (0.1 = 10% insanity, 1.0 = 100% insanity)
    // At 10% insanity, start with noticeable intensity (0.3), scale up to 1.0 at 100% insanity
    const insanityFactor = (insanityIntensity - INSANITY_THRESHOLD) / (1.0 - INSANITY_THRESHOLD); // 0 to 1, higher = more insane
    const baseIntensity = 0.3; // Minimum intensity at 10% insanity
    const targetIntensity = Math.min(1.0, baseIntensity + (insanityFactor * 0.7)); // Scale from 0.3 to 1.0
    
    // Smooth intensity transition (similar to health overlay)
    insanityState.intensity = Math.min(1.0, insanityState.intensity + (targetIntensity - insanityState.intensity) * 0.1);
  }
  
  // Update pulse phase for animation (deltaTime in seconds)
  insanityState.pulsePhase += deltaTime * 1000; // Convert to milliseconds for pulse calculations
  
  const intensity = insanityState.intensity;
  
  // Early return if intensity is too low (after fade-out check)
  if (intensity <= 0) {
    return;
  }
  
  ctx.save();
  
  // 1. Purple/pink vignette overlay (EXACTLY like health overlay pattern) - FULL SCREEN
  createInsanityVignette(ctx, width, height, intensity, 150);
  
  // 2. Add noticeable purple/pink tint to entire screen (EXACTLY like health overlay does with red)
  ctx.globalAlpha = intensity * 0.25; // Same as health overlay (0.25 max)
  ctx.fillStyle = '#FF00FF'; // Bright magenta/pink
  ctx.fillRect(0, 0, width, height);
  
  // 3. Glitchy scan lines (more frequent at higher intensity)
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = intensity * 0.5;
  const scanLineSpacing = Math.max(3, 12 - intensity * 10); // Closer lines at higher intensity
  const scanLineOffset = (insanityState.pulsePhase * 0.2) % scanLineSpacing;
  
  for (let y = scanLineOffset; y < height; y += scanLineSpacing) {
    ctx.fillStyle = intensity > 0.7 ? 'rgba(255, 0, 255, 0.6)' : 'rgba(200, 0, 200, 0.4)';
    ctx.fillRect(0, y, width, 1);
  }
  
  // 4. Digital artifacts/glitches (random flickering pixels)
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = intensity * 0.7;
  const numArtifacts = Math.floor(intensity * 60);
  
  for (let i = 0; i < numArtifacts; i++) {
    const x = (Math.sin(insanityState.pulsePhase * 0.001 + i) * width * 0.5 + width * 0.5) % width;
    const y = (Math.cos(insanityState.pulsePhase * 0.0013 + i * 0.7) * height * 0.5 + height * 0.5) % height;
    const size = 2 + Math.sin(insanityState.pulsePhase * 0.003 + i) * 2;
    const alpha = 0.5 + Math.sin(insanityState.pulsePhase * 0.005 + i) * 0.5;
    
    ctx.globalAlpha = intensity * alpha;
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(x, y, size, size);
  }
  
  ctx.restore();
}

/**
 * Resets insanity overlay state (useful when player dies or respawns)
 */
export function resetInsanityState(): void {
  insanityState = {
    pulsePhase: 0,
    wobbleOffset: { x: 0, y: 0 },
    intensity: 0,
  };
}

