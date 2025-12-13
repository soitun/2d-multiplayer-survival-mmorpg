/**
 * Mobile-specific Rendering Utilities
 * 
 * Contains rendering functions specifically for mobile device interactions
 */

// ===== CONSTANTS =====
export const TAP_ANIMATION_DURATION = 500; // ms
export const TAP_MAX_RADIUS = 30;
export const TAP_INNER_RING_DELAY = 0.2; // Progress threshold before inner ring starts
export const TAP_INNER_RING_SCALE = 0.7; // Scale of inner ring relative to outer

// ===== TYPES =====
export interface TapAnimation {
  x: number;
  y: number;
  startTime: number;
}

export interface RenderMobileTapAnimationOptions {
  ctx: CanvasRenderingContext2D;
  tapAnimation: TapAnimation;
  cameraOffsetX: number;
  cameraOffsetY: number;
}

// ===== RENDER FUNCTIONS =====

/**
 * Renders the mobile tap feedback animation
 * Shows expanding cyan rings at the tap location
 * 
 * @returns true if the animation is still active, false if completed
 */
export function renderMobileTapAnimation(options: RenderMobileTapAnimationOptions): boolean {
  const { ctx, tapAnimation, cameraOffsetX, cameraOffsetY } = options;

  const elapsed = performance.now() - tapAnimation.startTime;
  const progress = Math.min(elapsed / TAP_ANIMATION_DURATION, 1);

  // Animation completed
  if (progress >= 1) {
    return false;
  }

  // Convert world position to screen position (world + camera offset)
  const tapScreenX = tapAnimation.x + cameraOffsetX;
  const tapScreenY = tapAnimation.y + cameraOffsetY;

  // Calculate animation values
  const radius = TAP_MAX_RADIUS * progress;
  const opacity = 1 - progress;

  ctx.save();

  // Outer expanding ring
  ctx.strokeStyle = `rgba(0, 255, 255, ${opacity})`;
  ctx.lineWidth = 3 * (1 - progress * 0.5); // Line gets thinner as it expands
  ctx.beginPath();
  ctx.arc(tapScreenX, tapScreenY, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner dot that fades out
  ctx.fillStyle = `rgba(0, 255, 255, ${opacity * 0.8})`;
  ctx.beginPath();
  ctx.arc(tapScreenX, tapScreenY, 4 * (1 - progress), 0, Math.PI * 2);
  ctx.fill();

  // Second expanding ring (delayed)
  if (progress > TAP_INNER_RING_DELAY) {
    const innerProgress = (progress - TAP_INNER_RING_DELAY) / (1 - TAP_INNER_RING_DELAY);
    const innerRadius = TAP_MAX_RADIUS * innerProgress * TAP_INNER_RING_SCALE;
    const innerOpacity = (1 - innerProgress) * 0.6;
    ctx.strokeStyle = `rgba(0, 255, 255, ${innerOpacity})`;
    ctx.lineWidth = 2 * (1 - innerProgress * 0.5);
    ctx.beginPath();
    ctx.arc(tapScreenX, tapScreenY, innerRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  return true; // Animation still active
}
