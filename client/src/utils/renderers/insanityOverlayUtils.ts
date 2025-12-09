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
  // Entrainment-specific effects
  lastColorInversionTime: number;
  colorInversionDuration: number;
  glitchOffset: { x: number; y: number };
  glitchPhase: number;
  randomFlashPhase: number;
}

let insanityState: InsanityAnimationState = {
  pulsePhase: 0,
  wobbleOffset: { x: 0, y: 0 },
  intensity: 0,
  lastColorInversionTime: 0,
  colorInversionDuration: 0,
  glitchOffset: { x: 0, y: 0 },
  glitchPhase: 0,
  randomFlashPhase: 0,
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
 * @param hasEntrainment - Whether player has Entrainment effect (max insanity death sentence)
 */
export function renderInsanityOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  deltaTime: number,
  insanityIntensity: number, // 0.0-1.0 (insanity / max_insanity)
  hasEntrainment: boolean = false // Entrainment = max insanity, triggers extra chaotic effects
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
  
  // 5. ENTRAINMENT-SPECIFIC CHAOTIC EFFECTS (max insanity death sentence)
  if (hasEntrainment) {
    const currentTime = insanityState.pulsePhase;
    
    // Update glitch phase for screen shifts
    insanityState.glitchPhase += deltaTime * 2000; // Fast glitch movement
    insanityState.randomFlashPhase += deltaTime * 3000; // Random flash timing
    
    // Subtle color inversion flashes (safer - less frequent and less intense)
    // Reduced frequency and intensity to prevent seizures
    const timeSinceLastInversion = currentTime - insanityState.lastColorInversionTime;
    if (timeSinceLastInversion > insanityState.colorInversionDuration) {
      // Trigger new inversion flash (less frequent: 3-6 seconds between flashes)
      insanityState.lastColorInversionTime = currentTime;
      insanityState.colorInversionDuration = 3000 + Math.random() * 3000; // 3-6 seconds between flashes
    }
    
    const timeIntoFlash = timeSinceLastInversion;
    const flashDuration = 50; // Flash lasts 50ms (shorter)
    const isFlashing = timeIntoFlash < flashDuration;
    
    // Subtle color inversion flash effect (reduced intensity)
    if (isFlashing) {
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      // Fade in/out for smoother transition (less jarring)
      const flashProgress = timeIntoFlash / flashDuration;
      const fadeAlpha = Math.sin(flashProgress * Math.PI); // Smooth fade curve
      ctx.globalAlpha = 0.3 * fadeAlpha; // Reduced from 0.8 to 0.3 max, with fade
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
    
    // Random screen glitches/shifts (horizontal displacement)
    const glitchChance = Math.random();
    if (glitchChance < 0.3) { // 30% chance per frame when Entrainment active
      const glitchAmount = (Math.random() - 0.5) * 20; // Random horizontal shift up to 20px
      ctx.save();
      ctx.translate(glitchAmount, 0);
      ctx.globalAlpha = 0.3;
      ctx.globalCompositeOperation = 'source-over';
      // Draw a vertical glitch line
      const glitchX = Math.random() * width;
      ctx.fillStyle = '#FF00FF';
      ctx.fillRect(glitchX, 0, 2, height);
      ctx.restore();
    }
    
    // Intense digital corruption (more artifacts)
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.9;
    const entrainmentArtifacts = Math.floor(100 + Math.random() * 50); // 100-150 artifacts
    
    for (let i = 0; i < entrainmentArtifacts; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = 1 + Math.random() * 4;
      const alpha = 0.3 + Math.random() * 0.7;
      
      ctx.globalAlpha = alpha;
      // Random colors: magenta, cyan, or white for chaos
      const colors = ['#FF00FF', '#00FFFF', '#FFFFFF'];
      ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      ctx.fillRect(x, y, size, size);
    }
    
    // Random vertical scan line glitches
    if (Math.random() < 0.2) { // 20% chance per frame
      const glitchY = Math.random() * height;
      const glitchHeight = 5 + Math.random() * 15;
      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#00FFFF';
      ctx.fillRect(0, glitchY, width, glitchHeight);
    }
    
    // Screen shake/wobble effect (visual only - creates wobbling overlay)
    const shakeAmount = 3 + Math.random() * 5; // 3-8px shake
    insanityState.wobbleOffset.x = (Math.sin(insanityState.glitchPhase * 0.01) * shakeAmount);
    insanityState.wobbleOffset.y = (Math.cos(insanityState.glitchPhase * 0.013) * shakeAmount);
    
    // Apply wobble to overlay elements (not the entire canvas)
    ctx.save();
    ctx.translate(insanityState.wobbleOffset.x, insanityState.wobbleOffset.y);
    ctx.globalAlpha = 0.4;
    ctx.globalCompositeOperation = 'screen';
    // Draw wobbling scan lines
    for (let y = 0; y < height; y += 5) {
      ctx.fillStyle = `rgba(255, 0, 255, ${0.3 + Math.random() * 0.3})`;
      ctx.fillRect(0, y, width, 1);
    }
    ctx.restore();
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
    lastColorInversionTime: 0,
    colorInversionDuration: 0,
    glitchOffset: { x: 0, y: 0 },
    glitchPhase: 0,
    randomFlashPhase: 0,
  };
}

