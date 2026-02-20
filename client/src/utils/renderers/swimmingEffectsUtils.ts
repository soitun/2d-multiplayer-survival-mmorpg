import { Player as SpacetimeDBPlayer } from '../../generated';
import { gameConfig } from '../../config/gameConfig';
import { drawDynamicGroundShadow } from './shadowUtils';

/** World position to tile key (avoids importing heavy placementRenderingUtils). */
function worldPosToTileKey(worldX: number, worldY: number): string {
  const tileX = Math.floor(worldX / gameConfig.tileSize);
  const tileY = Math.floor(worldY / gameConfig.tileSize);
  return `${tileX},${tileY}`;
}

// --- Reusable offscreen canvas for underwater shadow sprite extraction (avoids per-frame allocation) ---
const _uwShadowCanvas = document.createElement('canvas');
const _uwShadowCtx = _uwShadowCanvas.getContext('2d');

// Swimming effects configuration
const SWIMMING_EFFECTS_CONFIG = {
  WATER_LINE_OFFSET: 0.5, // Proper waist level (0.4 = 40% down from top)
  WAVE_AMPLITUDE: 2.5, // More dramatic wave movement
  WAVE_FREQUENCY: 0.004, // Frequency of water line animation
  WAVE_SECONDARY_AMPLITUDE: 1.5, // Secondary wave for complex deformation
  WAVE_SECONDARY_FREQUENCY: 0.007, // Secondary wave frequency
  WAVE_TERTIARY_AMPLITUDE: 0.8, // Tertiary wave for micro-ripples
  WAVE_TERTIARY_FREQUENCY: 0.012, // Tertiary wave frequency
  WAKE_INITIAL_RADIUS: 36, // Starting radius of wake semi-circles
  WAKE_MAX_RADIUS: 95, // Maximum radius for wake expansion - increased for faster movement
  WAKE_EXPANSION_SPEED: 0.05, // How fast wake semi-circles expand - increased speed
  WAKE_LIFETIME: 1400, // How long each wake lasts (ms) - shorter for faster turnover
  WAKE_MOVEMENT_THRESHOLD: 3, // Minimum distance moved to create new wake (reduced for more responsiveness)
  UNDERWATER_TINT: 'rgba(12, 62, 79, 0.4)', // Underwater tinting
  SHIMMER_FREQUENCY: 0.005, // Frequency of shimmer effects
};

// Interface for tracking individual wake effects
interface WakeEffect {
  id: number;
  originX: number;
  originY: number;
  createdAt: number;
  directionAngle: number;
  thickness: number; // Line thickness - thicker when moving
}

// Global wake tracking
let wakeEffects: WakeEffect[] = [];
let nextWakeId = 0;

// Per-player tracking to prevent cross-player position contamination
interface PlayerWakeState {
  lastPosition: { x: number; y: number } | null;
  movementCounter: number;
  nextWakeThreshold: number;
  lastIdleWakeTime: number; // Track when we last created an idle wake
}
const playerWakeStates = new Map<string, PlayerWakeState>();

const WAKE_SKIP_MOVEMENTS_BASE = 12; // Base movements to skip - increased for less frequent wakes
const WAKE_SKIP_RANDOMNESS = 6; // Random additional movements (0-6) - increased
const IDLE_WAKE_INTERVAL_MS = 600; // Create idle wake every 600ms when standing still in water
const WAKE_THICKNESS = 3.0; // Thick wake lines for both moving and idle

/**
 * Generates next random wake threshold
 */
function generateNextWakeThreshold(): number {
  return WAKE_SKIP_MOVEMENTS_BASE + Math.floor(Math.random() * WAKE_SKIP_RANDOMNESS);
}

/**
 * Calculates the direction angle for wake effects based on player direction
 */
function getDirectionAngle(direction: string): number {
  switch (direction) {
    case 'up': return -Math.PI / 2;
    case 'up_right': return -Math.PI / 4;
    case 'right': return 0;
    case 'down_right': return Math.PI / 4;
    case 'down': return Math.PI / 2;
    case 'down_left': return (3 * Math.PI) / 4;
    case 'left': return Math.PI;
    case 'up_left': return (-3 * Math.PI) / 4;
    default: return Math.PI / 2; // Default to down
  }
}

/**
 * Draws the animated water line effect halfway down the player sprite with complex wave deformation
 */
function drawWaterLine(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  spriteWidth: number,
  spriteHeight: number,
  currentTimeMs: number
): void {
  // Position water line at waist level - from the TOP of the sprite, not center
  const spriteTopY = centerY - spriteHeight / 2;
  const waterLineY = spriteTopY + (spriteHeight * SWIMMING_EFFECTS_CONFIG.WATER_LINE_OFFSET);
  const time = currentTimeMs;
  
  // Create complex animated wave effect with multiple wave layers
  const primaryWave = Math.sin(time * SWIMMING_EFFECTS_CONFIG.WAVE_FREQUENCY + centerX * 0.01) * SWIMMING_EFFECTS_CONFIG.WAVE_AMPLITUDE;
  const secondaryWave = Math.sin(time * SWIMMING_EFFECTS_CONFIG.WAVE_SECONDARY_FREQUENCY + centerX * 0.02 + Math.PI * 0.3) * SWIMMING_EFFECTS_CONFIG.WAVE_SECONDARY_AMPLITUDE;
  const tertiaryWave = Math.sin(time * SWIMMING_EFFECTS_CONFIG.WAVE_TERTIARY_FREQUENCY + centerX * 0.03 + Math.PI * 0.7) * SWIMMING_EFFECTS_CONFIG.WAVE_TERTIARY_AMPLITUDE;
  const shimmerIntensity = (Math.sin(time * SWIMMING_EFFECTS_CONFIG.SHIMMER_FREQUENCY * 2) + 1) * 0.5;
  
  ctx.save();
  
  // Draw the animated water line with complex deformation - matches water disturbance color
  ctx.strokeStyle = 'rgba(160, 200, 220, 0.7)'; // Pale blue/cyan matching wake effects
  ctx.lineWidth = 2.5; // Thicker line for better visibility
  ctx.lineCap = 'round';
  
  ctx.beginPath();
  
  // Draw curved water line with complex wave deformation
  const waterLineWidth = spriteWidth * 0.6; // Half the sprite width
  const leftX = centerX - waterLineWidth / 2;
  const rightX = centerX + waterLineWidth / 2;
  const segments = 12; // More segments for smoother deformation
  
  for (let i = 0; i <= segments; i++) {
    const progress = i / segments; // 0 to 1
    const x = leftX + (waterLineWidth * progress);
    
    // Create a parabolic curve that dips down in the middle and curves up at the ends
    const distanceFromCenter = Math.abs(progress - 0.5) * 2; // 0 at center, 1 at edges
    const curveOffset = distanceFromCenter * distanceFromCenter * 3; // Quadratic curve
    
    // Complex horizontal deformation with minimal vertical movement
    const segmentWaveOffset = progress * 2 * Math.PI; // Create wave variation across the line
    const localPrimaryWave = Math.sin(time * SWIMMING_EFFECTS_CONFIG.WAVE_FREQUENCY * 1.5 + segmentWaveOffset) * (SWIMMING_EFFECTS_CONFIG.WAVE_AMPLITUDE * 0.2);
    const localSecondaryWave = Math.sin(time * SWIMMING_EFFECTS_CONFIG.WAVE_SECONDARY_FREQUENCY + segmentWaveOffset * 1.3 + Math.PI * 0.3) * (SWIMMING_EFFECTS_CONFIG.WAVE_SECONDARY_AMPLITUDE * 0.15);
    const localTertiaryWave = Math.sin(time * SWIMMING_EFFECTS_CONFIG.WAVE_TERTIARY_FREQUENCY + segmentWaveOffset * 2.1 + Math.PI * 0.7) * (SWIMMING_EFFECTS_CONFIG.WAVE_TERTIARY_AMPLITUDE * 0.1);
    
    // Combine waves but keep vertical movement minimal
    const totalWaveOffset = primaryWave * 0.1 + localPrimaryWave + localSecondaryWave + localTertiaryWave; // Complex but subtle
    
    const y = waterLineY - curveOffset + totalWaveOffset; // Subtract to curve upward
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  ctx.stroke();
  
  // Removed shimmer highlights and shimmer points for cleaner, static appearance
  
  ctx.restore();
}

/**
 * Simply darkens the bottom half of the sprite below the water line with deformed water line border
 */
function darkenSpriteBottomHalf(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  spriteWidth: number,
  spriteHeight: number,
  currentTimeMs: number
): void {
  // Position water line at waist level
  const spriteTopY = centerY - spriteHeight / 2;
  const waterLineY = spriteTopY + (spriteHeight * SWIMMING_EFFECTS_CONFIG.WATER_LINE_OFFSET);
  const spriteBottomY = centerY + spriteHeight / 2;
  const time = currentTimeMs;
  
  // NOTE: The underwater darkening should be handled in the main sprite rendering
  // by passing swimming state to the sprite renderer and applying color filters there
  // This way it follows the exact sprite shape, not a rectangle
  
  // Now draw the deformed water line border on top, only on existing sprite pixels
  ctx.save();
  
  // Use source-atop so the line only appears on existing sprite pixels
  ctx.globalCompositeOperation = 'source-atop';
  
  // Create complex animated wave effect (same as original water line)
  const primaryWave = Math.sin(time * SWIMMING_EFFECTS_CONFIG.WAVE_FREQUENCY + centerX * 0.01) * SWIMMING_EFFECTS_CONFIG.WAVE_AMPLITUDE;
  const secondaryWave = Math.sin(time * SWIMMING_EFFECTS_CONFIG.WAVE_SECONDARY_FREQUENCY + centerX * 0.02 + Math.PI * 0.3) * SWIMMING_EFFECTS_CONFIG.WAVE_SECONDARY_AMPLITUDE;
  const tertiaryWave = Math.sin(time * SWIMMING_EFFECTS_CONFIG.WAVE_TERTIARY_FREQUENCY + centerX * 0.03 + Math.PI * 0.7) * SWIMMING_EFFECTS_CONFIG.WAVE_TERTIARY_AMPLITUDE;
  const shimmerIntensity = (Math.sin(time * SWIMMING_EFFECTS_CONFIG.SHIMMER_FREQUENCY * 2) + 1) * 0.5;
  
  // Draw the deformed water line only on sprite pixels - matches water disturbance color
  ctx.strokeStyle = 'rgba(160, 200, 220, 0.7)'; // Pale blue/cyan matching wake effects
  ctx.lineWidth = 2.5; // Thicker line for better visibility
  ctx.lineCap = 'round';
  
  ctx.beginPath();
  
  // Draw curved water line with complex wave deformation (half sprite width)
  const waterLineWidth = spriteWidth * 0.3;
  const leftX = centerX - waterLineWidth / 2;
  const segments = 16; // More segments for smoother deformation
  
  for (let i = 0; i <= segments; i++) {
    const progress = i / segments; // 0 to 1
    const x = leftX + (waterLineWidth * progress);
    
    // Create a subtle curve that dips down in the middle and curves up at the ends
    const distanceFromCenter = Math.abs(progress - 0.5) * 2; // 0 at center, 1 at edges
    const curveOffset = distanceFromCenter * distanceFromCenter * 2; // Subtle curve
    
    // Complex horizontal deformation with minimal vertical movement
    const segmentWaveOffset = progress * 2 * Math.PI; // Create wave variation across the line
    const localPrimaryWave = Math.sin(time * SWIMMING_EFFECTS_CONFIG.WAVE_FREQUENCY * 1.5 + segmentWaveOffset) * (SWIMMING_EFFECTS_CONFIG.WAVE_AMPLITUDE * 0.2);
    const localSecondaryWave = Math.sin(time * SWIMMING_EFFECTS_CONFIG.WAVE_SECONDARY_FREQUENCY + segmentWaveOffset * 1.3 + Math.PI * 0.3) * (SWIMMING_EFFECTS_CONFIG.WAVE_SECONDARY_AMPLITUDE * 0.15);
    const localTertiaryWave = Math.sin(time * SWIMMING_EFFECTS_CONFIG.WAVE_TERTIARY_FREQUENCY + segmentWaveOffset * 2.1 + Math.PI * 0.7) * (SWIMMING_EFFECTS_CONFIG.WAVE_TERTIARY_AMPLITUDE * 0.1);
    
    // Combine waves but keep vertical movement minimal
    const totalWaveOffset = primaryWave * 0.1 + localPrimaryWave + localSecondaryWave + localTertiaryWave; // Complex but subtle
    
    const y = waterLineY - curveOffset + totalWaveOffset;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  
  ctx.stroke();
  
  // Removed shimmer highlights for cleaner, static appearance
  
  ctx.restore();
}


/**
 * Creates a new wake effect when player moves or idles in water
 */
function createWakeEffect(centerX: number, centerY: number, directionAngle: number, currentTimeMs: number, thickness: number = WAKE_THICKNESS): void {
  wakeEffects.push({
    id: nextWakeId++,
    originX: centerX,
    originY: centerY,
    createdAt: currentTimeMs,
    directionAngle: directionAngle,
    thickness: thickness
  });
}

/**
 * Manages wake creation based on player movement AND idle state
 * Uses per-player state tracking to prevent cross-player position contamination
 */
function manageWakeCreation(
  centerX: number,
  centerY: number,
  player: SpacetimeDBPlayer,
  currentTimeMs: number,
  isMoving: boolean
): void {
  const playerId = player.identity.toHexString();
  const currentPos = { x: centerX, y: centerY };
  
  // Get or create per-player state
  let playerState = playerWakeStates.get(playerId);
  if (!playerState) {
    playerState = {
      lastPosition: null,
      movementCounter: 0,
      nextWakeThreshold: generateNextWakeThreshold(),
      lastIdleWakeTime: 0
    };
    playerWakeStates.set(playerId, playerState);
  }
  
  // Check for actual position changes using THIS player's last position
  if (playerState.lastPosition) {
    const distance = Math.sqrt(
      Math.pow(currentPos.x - playerState.lastPosition.x, 2) + 
      Math.pow(currentPos.y - playerState.lastPosition.y, 2)
    );
    
    if (distance >= SWIMMING_EFFECTS_CONFIG.WAKE_MOVEMENT_THRESHOLD) {
      // MOVING - create movement wakes
      playerState.movementCounter++;
      
      // Only create wake when we reach the randomized threshold
      if (playerState.movementCounter >= playerState.nextWakeThreshold) {
        const directionAngle = getDirectionAngle(player.direction);
        createWakeEffect(currentPos.x, currentPos.y, directionAngle, currentTimeMs, WAKE_THICKNESS);
        
        // 25% chance to create a second wake immediately for dopamine burst
        if (Math.random() < 0.25) {
          // Create second wake with slight offset and different timing
          const offsetX = (Math.random() - 0.5) * 20; // Random offset ±10 pixels
          const offsetY = (Math.random() - 0.5) * 20;
          const secondWakeDelay = 300 + Math.random() * 200; // 300-500ms delay - longer pause
          setTimeout(() => {
            createWakeEffect(currentPos.x + offsetX, currentPos.y + offsetY, directionAngle, currentTimeMs + secondWakeDelay, WAKE_THICKNESS);
          }, secondWakeDelay);
        }
        
        playerState.movementCounter = 0; // Reset counter
        playerState.nextWakeThreshold = generateNextWakeThreshold(); // Set next random threshold
      }
      
      playerState.lastPosition = currentPos;
      playerState.lastIdleWakeTime = currentTimeMs; // Reset idle timer when moving
    } else {
      // IDLE - create idle wakes periodically
      const timeSinceLastIdleWake = currentTimeMs - playerState.lastIdleWakeTime;
      
      if (timeSinceLastIdleWake >= IDLE_WAKE_INTERVAL_MS) {
        // Create a gentle idle wake with random direction (treading water effect)
        const idleAngle = Math.random() * Math.PI * 2; // Random direction for idle
        createWakeEffect(currentPos.x, currentPos.y, idleAngle, currentTimeMs, WAKE_THICKNESS);
        
        playerState.lastIdleWakeTime = currentTimeMs;
      }
    }
  } else {
    // First time seeing this player - initialize position and create initial wake
    const directionAngle = getDirectionAngle(player.direction);
    createWakeEffect(currentPos.x, currentPos.y, directionAngle, currentTimeMs, WAKE_THICKNESS);
    playerState.lastPosition = currentPos;
    playerState.movementCounter = 0;
    playerState.nextWakeThreshold = generateNextWakeThreshold();
    playerState.lastIdleWakeTime = currentTimeMs;
  }
}

/**
 * Draws expanding semi-circular wake effects with irregular edges
 */
function drawExpandingWakes(
  ctx: CanvasRenderingContext2D,
  currentTimeMs: number
): void {
  ctx.save();
  
  // Clean up expired wakes and draw active ones
  wakeEffects = wakeEffects.filter(wake => {
    const age = currentTimeMs - wake.createdAt;
    const ageProgress = age / SWIMMING_EFFECTS_CONFIG.WAKE_LIFETIME;
    
    // Remove expired wakes
    if (ageProgress >= 1) return false;
    
    // Calculate current radius based on age with accelerated expansion
    const expansionCurve = Math.pow(ageProgress, 0.7); // Accelerated expansion curve
    const baseRadius = SWIMMING_EFFECTS_CONFIG.WAKE_INITIAL_RADIUS + 
      (SWIMMING_EFFECTS_CONFIG.WAKE_MAX_RADIUS - SWIMMING_EFFECTS_CONFIG.WAKE_INITIAL_RADIUS) * expansionCurve;
    
    // Fade out as wake expands
    const alpha = (1 - ageProgress) * 0.5;
    
    // Draw semi-circle wake with opening facing the player (toward direction of movement)
    ctx.strokeStyle = `rgba(160, 200, 220, ${alpha * 0.6})`; // More muted, less bright water color
    ctx.lineWidth = wake.thickness * (1 - ageProgress * 0.2); // Use wake's thickness, fade slightly over time
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    
    // Draw full semi-circle but compress vertically to create oval shape
    // The opening faces AWAY from the direction the player was moved (behind the player)
    const flippedDirection = wake.directionAngle + Math.PI; // Flip 180 degrees
    const startAngle = flippedDirection - Math.PI / 2;
    const endAngle = flippedDirection + Math.PI / 2;
    const segments = 24; // Number of segments for the arc
    
    // Calculate distortion intensity that builds gradually throughout entire animation
    // Start subtle and build up more naturally over time
    const distortionIntensity = Math.pow(ageProgress, 1.5) * 0.8; // Gradual curve starting from 0, reaching 80% at end
    const maxDistortion = baseRadius * 0.18; // Max 18% radius variation for more realistic turbulence
    
    for (let i = 0; i <= segments; i++) {
      const segmentProgress = i / segments;
      const currentAngle = startAngle + (endAngle - startAngle) * segmentProgress;
      
      // Create inward-curving oval by reducing radius toward center and compressing vertically
      const distanceFromCenter = Math.abs(segmentProgress - 0.5); // 0 at center, 1 at edges
      const squishFactor = 0.75 + (distanceFromCenter * 0.25); // 0.75 at center, 1.0 at edges - more inward curve
      
      // Add irregular distortion to radius
      let currentRadius = baseRadius * squishFactor; // Apply squish factor
      if (distortionIntensity > 0) {
        // Use multiple sine waves for irregular effect
        const distortion1 = Math.sin(currentAngle * 8 + currentTimeMs * 0.003 + wake.id) * maxDistortion * distortionIntensity;
        const distortion2 = Math.sin(currentAngle * 12 + currentTimeMs * 0.002 + wake.id * 1.3) * maxDistortion * 0.6 * distortionIntensity;
        const distortion3 = Math.sin(currentAngle * 16 + currentTimeMs * 0.004 + wake.id * 0.7) * maxDistortion * 0.3 * distortionIntensity;
        currentRadius += distortion1 + distortion2 + distortion3;
      }
      
      // Apply vertical compression to make wake shorter and more oval
      const verticalCompressionFactor = 0.6; // Compress y-axis to 60% of original height
      
      const x = wake.originX + Math.cos(currentAngle) * currentRadius;
      const y = wake.originY + Math.sin(currentAngle) * currentRadius * verticalCompressionFactor;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
    
    return true; // Keep this wake
  });
  
  ctx.restore();
}





/**
 * Draws an underwater shadow beneath and to the right of the swimming player using the sprite shape
 * Shadow is angled 45 degrees to the right and positioned far below like it's on the sea floor
 */
function drawUnderwaterShadow(
  ctx: CanvasRenderingContext2D,
  spriteImage: CanvasImageSource,
  sx: number,
  sy: number,
  centerX: number,
  centerY: number,
  spriteWidth: number,
  spriteHeight: number
): void {
  // Reuse module-level canvas for sprite extraction (avoids per-frame allocation)
  _uwShadowCanvas.width = gameConfig.spriteWidth;
  _uwShadowCanvas.height = gameConfig.spriteHeight;
  
  if (!_uwShadowCtx) return;
  
  _uwShadowCtx.clearRect(0, 0, gameConfig.spriteWidth, gameConfig.spriteHeight);
  
  // Draw just the current sprite frame to the temporary canvas
  _uwShadowCtx.drawImage(
    spriteImage,
    sx, sy, gameConfig.spriteWidth, gameConfig.spriteHeight, // Source: specific frame from spritesheet
    0, 0, gameConfig.spriteWidth, gameConfig.spriteHeight    // Destination: full temporary canvas
  );
  
  // Shadow offset: positioned close to the character for top-down underwater view
  const shadowOffsetX = spriteWidth * 0.28; // Small shift right (~10-12 pixels)
  const shadowOffsetY = spriteHeight * 0.9; // Small shift down (~14-18 pixels)
  
  // Shadow position
  const shadowX = centerX + shadowOffsetX;
  const shadowY = centerY + shadowOffsetY;
  
  ctx.save();
  
  // Apply transformations for underwater shadow distortion
  ctx.translate(shadowX, shadowY);
  
  // Make shadow smaller than character with slight horizontal distortion
  ctx.scale(0.85, 0.75); // 85% width, 75% height - smaller and compressed underwater
  
  // Rotate for slanting shadow effect (without flipping)
  ctx.rotate(Math.PI / 6); // 30 degrees clockwise
  
  ctx.translate(-shadowX, -shadowY);
  
  // Use drawDynamicGroundShadow with custom parameters for underwater effect
  drawDynamicGroundShadow({
    ctx,
    entityImage: _uwShadowCanvas, // Use the extracted sprite frame (reusable canvas)
    entityCenterX: shadowX,
    entityBaseY: shadowY,
    imageDrawWidth: spriteWidth,
    imageDrawHeight: spriteHeight,
    cycleProgress: 0.5, // Fixed "noon" lighting for consistent underwater shadow
    baseShadowColor: '6, 30, 38', // Matches water color (#0C3E4F) but darker for sea floor shadow
    maxShadowAlpha: 0.75, // Slightly more transparent (deeper underwater)
    maxStretchFactor: 1.0, // Minimal stretch (water diffuses light)
    minStretchFactor: 0.9, // Keep shadow compact
    shadowBlur: 2, // Reduced blur for sharper shadow
    pivotYOffset: 0,
  });
  
  ctx.restore();
}

/** Shadow offset from sprite center (matches drawUnderwaterShadow). */
const UNDERWATER_SHADOW_OFFSET_X = 0.28;
const UNDERWATER_SHADOW_OFFSET_Y = 0.9;

/**
 * Renders underwater shadow for a player if their shadow position is over water.
 * Consolidates the repeated logic from GameCanvas (swimming, local snorkeling, remote snorkeling).
 */
export function renderUnderwaterShadowIfOverWater(
  ctx: CanvasRenderingContext2D,
  heroImg: CanvasImageSource,
  playerPosX: number,
  playerPosY: number,
  spriteSx: number,
  spriteSy: number,
  waterTileLookup: Map<string, boolean>
): void {
  const drawWidth = gameConfig.playerSpriteWidth;
  const drawHeight = gameConfig.playerSpriteHeight;
  const spriteBaseX = playerPosX - drawWidth / 2;
  const spriteBaseY = playerPosY - drawHeight / 2;
  const shadowX = playerPosX + drawWidth * UNDERWATER_SHADOW_OFFSET_X;
  const shadowY = playerPosY + drawHeight * UNDERWATER_SHADOW_OFFSET_Y;
  const isShadowOverWater = waterTileLookup.get(worldPosToTileKey(shadowX, shadowY)) ?? false;
  if (isShadowOverWater) {
    drawUnderwaterShadowOnly(ctx, heroImg, spriteSx, spriteSy, spriteBaseX, spriteBaseY, drawWidth, drawHeight);
  }
}

/**
 * Draws ONLY the underwater shadow (should be called in an early rendering layer, beneath water surface)
 */
export function drawUnderwaterShadowOnly(
  ctx: CanvasRenderingContext2D,
  spriteImage: CanvasImageSource,
  spriteSx: number,
  spriteSy: number,
  spriteDrawX: number,
  spriteDrawY: number,
  spriteWidth: number = gameConfig.playerSpriteWidth,
  spriteHeight: number = gameConfig.playerSpriteHeight
): void {
  const centerX = spriteDrawX + spriteWidth / 2;
  const centerY = spriteDrawY + spriteHeight / 2;
  drawUnderwaterShadow(ctx, spriteImage, spriteSx, spriteSy, centerX, centerY, spriteWidth, spriteHeight);
}

/**
 * Draws swimming effects that should appear UNDER the player sprite (but above water surface)
 * Note: This no longer draws the underwater shadow - that should be drawn in an earlier layer
 */
export function drawSwimmingEffectsUnder(
  ctx: CanvasRenderingContext2D,
  player: SpacetimeDBPlayer,
  currentTimeMs: number,
  isMoving: boolean,
  spriteDrawX: number,
  spriteDrawY: number,
  spriteWidth: number = gameConfig.playerSpriteWidth,
  spriteHeight: number = gameConfig.playerSpriteHeight,
  cycleProgress?: number,
  spriteImage?: CanvasImageSource,
  spriteSx?: number,
  spriteSy?: number
): void {
  const centerX = spriteDrawX + spriteWidth / 2;
  const centerY = spriteDrawY + spriteHeight / 2;
  
  // Underwater shadow is now rendered separately in an earlier layer
  // No longer drawing it here to avoid appearing above water surface
  
  // Manage wake creation based on player movement
  manageWakeCreation(centerX, centerY, player, currentTimeMs, isMoving);
  
  // Draw all active expanding wake semi-circles (above water surface)
  drawExpandingWakes(ctx, currentTimeMs);
}

/**
 * Draws swimming effects that should appear OVER the player sprite
 */
export function drawSwimmingEffectsOver(
  ctx: CanvasRenderingContext2D,
  player: SpacetimeDBPlayer,
  currentTimeMs: number,
  spriteDrawX: number,
  spriteDrawY: number,
  spriteWidth: number = gameConfig.playerSpriteWidth,
  spriteHeight: number = gameConfig.playerSpriteHeight
): void {
  const centerX = spriteDrawX + spriteWidth / 2;
  const centerY = spriteDrawY + spriteHeight / 2;
  
  // Simply darken the bottom half of the sprite with deformed water line border
  darkenSpriteBottomHalf(ctx, centerX, centerY, spriteWidth, spriteHeight, currentTimeMs);
  
  // DISABLED: Draw water line effect over everything - now handled in darkening function
  // drawWaterLine(ctx, centerX, centerY, spriteWidth, spriteHeight, currentTimeMs);
}

/**
 * Main function to draw all swimming effects for a player (for backwards compatibility)
 */
export function drawSwimmingEffects(
  ctx: CanvasRenderingContext2D,
  player: SpacetimeDBPlayer,
  currentTimeMs: number,
  isMoving: boolean,
  currentAnimationFrame: number,
  spriteDrawX: number,
  spriteDrawY: number,
  spriteWidth: number = gameConfig.playerSpriteWidth,
  spriteHeight: number = gameConfig.playerSpriteHeight,
  cycleProgress?: number,
  spriteImage?: CanvasImageSource,
  spriteSx?: number,
  spriteSy?: number
): void {
  drawSwimmingEffectsUnder(ctx, player, currentTimeMs, isMoving, spriteDrawX, spriteDrawY, spriteWidth, spriteHeight, cycleProgress, spriteImage, spriteSx, spriteSy);
  drawSwimmingEffectsOver(ctx, player, currentTimeMs, spriteDrawX, spriteDrawY, spriteWidth, spriteHeight);
} 