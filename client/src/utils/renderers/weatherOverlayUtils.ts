/**
 * Weather Overlay Rendering Utilities
 * 
 * Handles atmospheric effects for different weather intensities.
 * Inspired by AAA pixel art games like Sea of Stars.
 * 
 * Rendering Order:
 * 1. Rain particles (already rendered)
 * 2. Storm darkness/desaturation overlay (this file)
 * 3. Day/Night cycle overlay (existing system)
 * 4. Health/Frost overlays (existing system)
 */

// Smooth transition state for weather changes
let previousRainIntensity = 0;

let transitionStartTime = 0;
// Longer fade when leaving storm zones (high -> low) for seamless feel
const TRANSITION_DURATION_ENTER_MS = 1500;  // Entering rain: 1.5s
const TRANSITION_DURATION_LEAVE_MS = 2500;  // Leaving rain: 2.5s (especially when exiting storm)

/**
 * Smoothly interpolates between two values using ease-in-out cubic function.
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Renders a weather overlay that darkens and desaturates the scene based on rain intensity.
 * Smoothly transitions when rain intensity changes (e.g., moving between chunks).
 * 
 * @param ctx - Canvas rendering context
 * @param canvasWidth - Width of the canvas
 * @param canvasHeight - Height of the canvas
 * @param targetRainIntensity - Target rain intensity from 0.0 (clear) to 1.0 (heavy storm)
 * @param timeOfDayProgress - Current time of day progress (0.0 to 1.0) for blending with day/night
 * @param currentTime - Current timestamp in milliseconds (for transition timing)
 */
// Track target intensity and last transition duration for continuity
let lastTargetIntensity = 0;
let lastTransitionDurationMs = TRANSITION_DURATION_ENTER_MS;

export function renderWeatherOverlay(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  targetRainIntensity: number,
  timeOfDayProgress: number,
  currentTime: number = Date.now()
): void {
  // Detect if target intensity actually changed (not just re-rendering)
  const targetChanged = Math.abs(targetRainIntensity - lastTargetIntensity) > 0.01;

  if (targetChanged) {
    // Compute current visual state (where we are in the ongoing transition)
    // Use this as the starting point for the new transition - prevents abrupt jumps
    const timeSinceTransition = currentTime - transitionStartTime;
    const prevProgress = Math.min(timeSinceTransition / lastTransitionDurationMs, 1.0);
    const prevEased = easeInOutCubic(prevProgress);
    const currentVisualIntensity = previousRainIntensity + (lastTargetIntensity - previousRainIntensity) * prevEased;

    transitionStartTime = currentTime;
    previousRainIntensity = currentVisualIntensity;
    lastTargetIntensity = targetRainIntensity;
  }

  // Use longer duration when leaving storm (high -> low) for seamless exit
  const isLeavingStorm = targetRainIntensity < previousRainIntensity && previousRainIntensity > 0.3;
  const transitionDuration = isLeavingStorm ? TRANSITION_DURATION_LEAVE_MS : TRANSITION_DURATION_ENTER_MS;
  lastTransitionDurationMs = transitionDuration;

  // Calculate transition progress
  const timeSinceTransition = currentTime - transitionStartTime;
  const transitionProgress = Math.min(timeSinceTransition / transitionDuration, 1.0);
  const easedProgress = easeInOutCubic(transitionProgress);

  // Interpolate between previous and target intensity
  const rainIntensity = previousRainIntensity + (targetRainIntensity - previousRainIntensity) * easedProgress;

  // Update previous intensity when transition completes
  if (transitionProgress >= 1.0) {
    previousRainIntensity = targetRainIntensity;
  }

  // Early exit if no weather to render (after interpolation)
  if (rainIntensity <= 0.001) {
    return;
  }

  // Calculate overlay properties based on rain intensity
  // Light rain (0.2-0.4): Subtle grey tint - 20% darkness
  // Moderate rain (0.5-0.7): Noticeable darkening - 35% darkness
  // Heavy rain (0.8-1.0): Significant darkening - 50% darkness
  // Heavy storm (1.0): Very dark, ominous atmosphere - 60% darkness

  // Progressive darkness scaling for each rain level
  // Much more dramatic than before for better atmosphere
  let darknessAlpha: number;
  if (rainIntensity < 0.4) {
    // Light rain: 0-20% darkness
    darknessAlpha = rainIntensity * 0.5; // 0.0-0.2
  } else if (rainIntensity < 0.7) {
    // Moderate rain: 20-35% darkness
    darknessAlpha = 0.2 + ((rainIntensity - 0.4) / 0.3) * 0.15; // 0.2-0.35
  } else if (rainIntensity < 0.9) {
    // Heavy rain: 35-50% darkness
    darknessAlpha = 0.35 + ((rainIntensity - 0.7) / 0.2) * 0.15; // 0.35-0.5
  } else {
    // Heavy storm: 50-60% darkness
    darknessAlpha = 0.5 + ((rainIntensity - 0.9) / 0.1) * 0.1; // 0.5-0.6
  }

  // Desaturation effect - more intense rain = more grey/blue
  // Storms get progressively more blue-grey and desaturated
  const blueGrey = {
    r: 50 + (rainIntensity * 30),  // 50-80 (darker blue)
    g: 60 + (rainIntensity * 35),  // 60-95 (grey-green)
    b: 85 + (rainIntensity * 55),  // 85-140 (blue dominant for storm atmosphere)
  };

  // Adjust for time of day - storms are darker at night, less noticeable during day
  // timeOfDayProgress: 0.0 = midnight, 0.5 = noon
  // Calculate how "bright" it is (peaks at noon)
  const dayBrightness = 1.0 - Math.abs(timeOfDayProgress - 0.5) * 2.0; // 0.0 at midnight, 1.0 at noon
  
  // During day, reduce storm darkness slightly (storms are more visible at night)
  const timeAdjustedAlpha = darknessAlpha * (0.7 + (dayBrightness * 0.3)); // 70-100% of base darkness

  // Create gradient overlay for more natural look
  // Storms tend to be darker at the top (clouds) and lighter at bottom
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  
  // Top of screen: Full storm effect
  gradient.addColorStop(0, `rgba(${blueGrey.r}, ${blueGrey.g}, ${blueGrey.b}, ${timeAdjustedAlpha})`);
  
  // Middle: Slightly less intense
  gradient.addColorStop(0.5, `rgba(${blueGrey.r + 10}, ${blueGrey.g + 10}, ${blueGrey.b + 10}, ${timeAdjustedAlpha * 0.85})`);
  
  // Bottom: Even lighter (ground level)
  gradient.addColorStop(1, `rgba(${blueGrey.r + 20}, ${blueGrey.g + 20}, ${blueGrey.b + 20}, ${timeAdjustedAlpha * 0.7})`);

  // Apply the overlay
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.restore();

  // Add vignette effect for heavy storms (adds dramatic depth)
  if (rainIntensity > 0.6) {
    // Stronger vignette for more dramatic storms
    const vignetteIntensity = (rainIntensity - 0.6) * 0.75; // 0.0 to 0.3 for storms
    renderStormVignette(ctx, canvasWidth, canvasHeight, vignetteIntensity);
  }
}

/**
 * Renders a subtle vignette effect for heavy storms.
 * Darkens the edges of the screen to create atmospheric depth.
 */
function renderStormVignette(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  intensity: number
): void {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const radius = Math.max(canvasWidth, canvasHeight) * 0.8;

  // Create radial gradient from center to edges
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  
  // Center: transparent
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  
  // Edges: dark vignette
  gradient.addColorStop(0.9, `rgba(20, 25, 35, ${intensity * 0.3})`);
  gradient.addColorStop(1, `rgba(15, 20, 30, ${intensity * 0.5})`);

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.restore();
}

/**
 * Get a descriptive name for the current weather atmosphere.
 * Useful for debugging or UI display.
 */
export function getWeatherAtmosphereName(rainIntensity: number): string {
  if (rainIntensity === 0) return 'Clear';
  if (rainIntensity < 0.3) return 'Light Overcast';
  if (rainIntensity < 0.6) return 'Stormy';
  if (rainIntensity < 0.8) return 'Heavy Storm';
  return 'Severe Storm';
}

