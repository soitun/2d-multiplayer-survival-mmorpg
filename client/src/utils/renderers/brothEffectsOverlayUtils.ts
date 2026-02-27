/**
 * Broth Effects Overlay Rendering Utilities
 * Creates visual screen effects for NightVision and Intoxicated (drunk) status effects
 * 
 * NightVision: Mystical potion effect - enhanced vision at night with ethereal glow
 * Intoxicated: Drunk effect - blurred edges, wobble, warm tint
 */

import type { ActiveConsumableEffect } from '../../generated/types';

// Animation state for effects
interface EffectAnimationState {
  pulsePhase: number;
  wobbleOffset: { x: number; y: number };
  intensity: number;
}

let intoxicatedState: EffectAnimationState = {
  pulsePhase: 0,
  wobbleOffset: { x: 0, y: 0 },
  intensity: 0,
};

let nightVisionState: EffectAnimationState = {
  pulsePhase: 0,
  wobbleOffset: { x: 0, y: 0 },
  intensity: 0,
};


// Day/Night cycle constants
// Night periods: Twilight Evening (0.76-0.80), Night (0.80-0.92), Midnight (0.92-0.97), Twilight Morning (0.97-1.0)
const NIGHT_START_PROGRESS = 0.76;
const DUSK_START_PROGRESS = 0.72; // Start fading in slightly before full night

/**
 * Checks if it's currently night time based on cycle progress
 */
export function isNightTime(cycleProgress: number): boolean {
  return cycleProgress >= NIGHT_START_PROGRESS;
}

/**
 * Gets the night intensity (0.0 during day, ramps up from dusk, 1.0 at full night)
 */
function getNightIntensity(cycleProgress: number): number {
  if (cycleProgress < DUSK_START_PROGRESS) return 0.0;
  if (cycleProgress >= NIGHT_START_PROGRESS) return 1.0;
  // Fade in during dusk (0.72-0.76)
  return (cycleProgress - DUSK_START_PROGRESS) / (NIGHT_START_PROGRESS - DUSK_START_PROGRESS);
}

/**
 * Checks if the local player has an active effect of the given type
 */
export function hasActiveEffect(
  activeConsumableEffects: Map<string, ActiveConsumableEffect>,
  localPlayerId: string | undefined,
  effectTag: string
): boolean {
  if (!localPlayerId || !activeConsumableEffects) return false;
  
  return Array.from(activeConsumableEffects.values()).some(
    effect => effect.playerId.toHexString() === localPlayerId && effect.effectType.tag === effectTag
  );
}

/**
 * Renders the intoxicated (drunk) visual effect
 * - Blurred/unfocused edges
 * - Screen wobble effect (applied via CSS transform on canvas)
 * - Slight color desaturation with warm tint
 */
export function renderIntoxicatedOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  deltaTime: number,
  isActive: boolean
): { wobbleX: number; wobbleY: number } {
  // Fade in/out based on active state
  const targetIntensity = isActive ? 1.0 : 0.0;
  intoxicatedState.intensity += (targetIntensity - intoxicatedState.intensity) * 0.05;
  
  // Return early if not visible
  if (intoxicatedState.intensity < 0.01) {
    return { wobbleX: 0, wobbleY: 0 };
  }
  
  // Update animation phase
  intoxicatedState.pulsePhase += deltaTime * 1000;
  
  const intensity = intoxicatedState.intensity;
  
  // Calculate screen wobble (sinusoidal movement)
  const wobbleSpeed = 0.002;
  const wobbleAmplitude = 3 * intensity; // Max 3px wobble
  const wobbleX = Math.sin(intoxicatedState.pulsePhase * wobbleSpeed) * wobbleAmplitude;
  const wobbleY = Math.cos(intoxicatedState.pulsePhase * wobbleSpeed * 0.7) * wobbleAmplitude * 0.6;
  
  intoxicatedState.wobbleOffset = { x: wobbleX, y: wobbleY };
  
  ctx.save();
  
  // 1. Add warm amber/sepia tint (like beer goggles)
  ctx.globalAlpha = intensity * 0.15;
  ctx.fillStyle = '#D4A574'; // Warm amber
  ctx.fillRect(0, 0, width, height);
  
  // 2. Add subtle vignette blur effect (darker edges)
  const vignetteGradient = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.3,
    width / 2, height / 2, Math.min(width, height) * 0.8
  );
  vignetteGradient.addColorStop(0, 'transparent');
  vignetteGradient.addColorStop(0.5, 'transparent');
  vignetteGradient.addColorStop(1, `rgba(0, 0, 0, ${intensity * 0.4})`);
  
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = vignetteGradient;
  ctx.fillRect(0, 0, width, height);
  
  // 3. Add pulsing blur effect at edges (simulated with gradient rings)
  const pulseIntensity = 0.5 + 0.5 * Math.sin(intoxicatedState.pulsePhase * 0.003);
  const blurGradient = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.4,
    width / 2, height / 2, Math.min(width, height) * 0.7
  );
  blurGradient.addColorStop(0, 'transparent');
  blurGradient.addColorStop(0.7, 'transparent');
  blurGradient.addColorStop(1, `rgba(139, 90, 43, ${intensity * pulseIntensity * 0.2})`);
  
  ctx.fillStyle = blurGradient;
  ctx.fillRect(0, 0, width, height);
  
  // 4. Add slight double-vision effect (subtle color separation)
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = intensity * 0.08;
  ctx.fillStyle = '#FF6B6B'; // Red tint offset
  ctx.fillRect(2, 0, width, height);
  ctx.fillStyle = '#6BB5FF'; // Blue tint offset
  ctx.fillRect(-2, 0, width, height);
  
  ctx.restore();
  
  return { wobbleX, wobbleY };
}

/**
 * Renders the night vision visual effect (mystical potion-based, not military goggles)
 * Only activates at night (cycleProgress >= 0.76)
 * 
 * Visual style: Ethereal, mystical glow that enhances vision
 * - Soft silver/blue luminescence that lifts the darkness
 * - Gentle pulsing aura effect
 * - Subtle magical particles at screen edges
 * - No harsh tech elements (no scan lines, no CRT effects)
 */
export function renderNightVisionOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  deltaTime: number,
  isActive: boolean,
  cycleProgress: number
): void {
  // Only apply at night - get night intensity for smooth transition
  const nightIntensity = getNightIntensity(cycleProgress);
  
  // Fade in/out based on active state AND night time
  const targetIntensity = (isActive && nightIntensity > 0) ? nightIntensity : 0.0;
  nightVisionState.intensity += (targetIntensity - nightVisionState.intensity) * 0.06;
  
  // Return early if not visible
  if (nightVisionState.intensity < 0.01) {
    return;
  }
  
  // Update animation phase
  nightVisionState.pulsePhase += deltaTime * 1000;
  
  const intensity = nightVisionState.intensity;
  
  ctx.save();
  
  // 1. Lift the darkness with a soft silver-blue luminescence
  // This makes the night appear brighter without changing colors drastically
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = intensity * 0.35;
  ctx.fillStyle = '#B8C5D6'; // Soft silver-blue
  ctx.fillRect(0, 0, width, height);
  
  // 2. Add subtle ethereal glow (soft radial brightening from center)
  const pulseGlow = 0.85 + 0.15 * Math.sin(nightVisionState.pulsePhase * 0.002);
  const glowGradient = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, Math.max(width, height) * 0.6
  );
  glowGradient.addColorStop(0, `rgba(200, 220, 255, ${intensity * pulseGlow * 0.2})`);
  glowGradient.addColorStop(0.5, `rgba(180, 200, 240, ${intensity * pulseGlow * 0.1})`);
  glowGradient.addColorStop(1, 'transparent');
  
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = glowGradient;
  ctx.fillRect(0, 0, width, height);
  
  // 3. Soft mystical vignette (very subtle, not dark goggles)
  ctx.globalCompositeOperation = 'source-over';
  const vignetteGradient = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.4,
    width / 2, height / 2, Math.min(width, height) * 0.85
  );
  vignetteGradient.addColorStop(0, 'transparent');
  vignetteGradient.addColorStop(0.7, 'transparent');
  vignetteGradient.addColorStop(1, `rgba(100, 120, 180, ${intensity * 0.15})`); // Soft blue edge
  
  ctx.fillStyle = vignetteGradient;
  ctx.fillRect(0, 0, width, height);
  
  // 4. Magical sparkle particles at edges (subtle floating motes)
  ctx.globalAlpha = intensity * 0.6;
  const sparkleColors = ['#E8F0FF', '#D4E4FF', '#C8D8F8', '#FFFFFF'];
  const numSparkles = 12;
  const sparklePhase = nightVisionState.pulsePhase * 0.001;
  
  for (let i = 0; i < numSparkles; i++) {
    // Position sparkles around the edges
    const angle = (i / numSparkles) * Math.PI * 2 + sparklePhase;
    const edgeDistance = 0.85 + 0.1 * Math.sin(sparklePhase * 2 + i);
    const x = width / 2 + Math.cos(angle) * (width * 0.45 * edgeDistance);
    const y = height / 2 + Math.sin(angle) * (height * 0.45 * edgeDistance);
    
    // Pulsing size and opacity
    const sparkleLife = (Math.sin(sparklePhase * 3 + i * 0.8) + 1) / 2;
    const size = 1 + sparkleLife * 2;
    const alpha = 0.3 + sparkleLife * 0.7;
    
    ctx.globalAlpha = intensity * alpha * 0.5;
    ctx.fillStyle = sparkleColors[i % sparkleColors.length];
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // 5. Very subtle blue-silver tint to enhance night colors
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = intensity * 0.08;
  ctx.fillStyle = '#A0B8D8'; // Soft moonlight blue
  ctx.fillRect(0, 0, width, height);
  
  ctx.restore();
}

/**
 * Renders broth effect overlays (NightVision and Intoxicated)
 * Returns wobble offset for Intoxicated effect (to apply to canvas transform)
 * 
 * @param cycleProgress - Day/night cycle progress (0.0-1.0). Night starts at 0.76
 */
export function renderBrothEffectsOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  deltaTime: number,
  activeConsumableEffects: Map<string, ActiveConsumableEffect>,
  localPlayerId: string | undefined,
  cycleProgress: number = 0.375 // Default to daytime if not provided
): { wobbleX: number; wobbleY: number } {
  const hasNightVision = hasActiveEffect(activeConsumableEffects, localPlayerId, 'NightVision');
  const hasIntoxicated = hasActiveEffect(activeConsumableEffects, localPlayerId, 'Intoxicated');
  
  // Render night vision first (base layer) - only works at night
  renderNightVisionOverlay(ctx, width, height, deltaTime, hasNightVision, cycleProgress);
  
  // Render intoxicated overlay and get wobble values
  const wobble = renderIntoxicatedOverlay(ctx, width, height, deltaTime, hasIntoxicated);
  
  return wobble;
}

/**
 * Resets broth effect overlay state (useful when player dies or respawns)
 */
export function resetBrothEffectsState(): void {
  intoxicatedState = {
    pulsePhase: 0,
    wobbleOffset: { x: 0, y: 0 },
    intensity: 0,
  };
  nightVisionState = {
    pulsePhase: 0,
    wobbleOffset: { x: 0, y: 0 },
    intensity: 0,
  };
}

