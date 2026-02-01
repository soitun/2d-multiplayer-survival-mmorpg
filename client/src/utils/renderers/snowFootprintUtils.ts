/**
 * Snow Trail System
 * =================
 * 
 * A polished alpine snow trail effect system for pixel art aesthetics.
 * When players walk on alpine (snowy) tiles, they create disturbance
 * patches AHEAD of them, as if pushing through deep snow.
 * 
 * Visual Design Philosophy:
 * - Splotchy, irregular shapes (not perfect circles) for organic feel
 * - Each footprint uses the alpine tile texture as base for seamless blending
 * - Purple overlays create depth effect:
 *   - #A9B4EC dark purple (compressed snow shadow)
 *   - #D2DEF2 light purple (center highlight)
 * - Trails positioned AHEAD of player (pushing through snow effect)
 * - Random size/position variation for seamless blending
 * - Smooth alpha fade-out over 5 seconds (starts at 3.5s)
 */

import { Player as SpacetimeDBPlayer } from '../../generated';
import { DbConnection } from '../../generated';
import { getTileTypeFromChunkData, worldPosToTileCoords } from './placementRenderingUtils';

// Import alpine texture directly - Vite will handle the asset URL
import alpineTextureUrl from '../../assets/tiles/new/alpine.png';

// =============================================================================
// ALPINE TEXTURE FOR INNER LAYER
// =============================================================================

let alpineTexture: HTMLImageElement | null = null;
let alpinePattern: CanvasPattern | null = null;
let textureLoaded = false;

// Preload the alpine texture
function loadAlpineTexture(): void {
  if (alpineTexture) return; // Already loading/loaded
  
  alpineTexture = new Image();
  alpineTexture.onload = () => {
    textureLoaded = true;
    console.log('[SnowTrail] Alpine texture loaded successfully');
  };
  alpineTexture.onerror = (e) => {
    console.warn('[SnowTrail] Failed to load alpine texture:', e);
    alpineTexture = null;
  };
  alpineTexture.src = alpineTextureUrl;
}

// Initialize texture loading
loadAlpineTexture();

/** Scale factor for pattern to match ground tile rendering (2x for pixel art) */
const TILE_SCALE = 0.5;

/**
 * Creates or returns cached alpine pattern for a context
 * Pattern is scaled to match the ground tile rendering scale
 */
function getAlpinePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (!textureLoaded || !alpineTexture) return null;
  
  // Create pattern if not cached
  if (!alpinePattern) {
    alpinePattern = ctx.createPattern(alpineTexture, 'repeat');
    
    // Scale the pattern to match ground tile rendering
    if (alpinePattern) {
      const scaleMatrix = new DOMMatrix();
      scaleMatrix.scaleSelf(TILE_SCALE, TILE_SCALE);
      alpinePattern.setTransform(scaleMatrix);
    }
  }
  return alpinePattern;
}

// =============================================================================
// CONSTANTS - Tuned for natural-looking footprints
// =============================================================================

/** How often to create new footprints while walking (milliseconds) */
const FOOTPRINT_INTERVAL_MS = 60; // Very fast for continuous overlap

/** Total lifetime of a footprint (milliseconds) */
const FOOTPRINT_DURATION_MS = 5000;

/** When to start fading (milliseconds from creation) */
const FOOTPRINT_FADE_START_MS = 3500;

/** Maximum footprints per player (memory limit) */
const MAX_FOOTPRINTS_PER_PLAYER = 120; // More for denser trail

/** 
 * Footprint dimensions (pixels) 
 * Large snow disturbance patches that create a seamless trail
 */
const FOOTPRINT_SIZE = 96; // Size of each splotch (2x larger)

/** Distance along walking direction for trail placement (pixels) */
const TRAIL_FORWARD_OFFSET = 32; // Further ahead of player - pushing through snow

/** Random lateral offset range for organic look (pixels) */
const TRAIL_LATERAL_VARIANCE = 2; // Tight trail

/** Minimum distance moved to create new footprint (pixels squared) */
const MIN_MOVEMENT_DIST_SQ = 9; // 3 pixels - very tight for continuous trail

// =============================================================================
// TYPES
// =============================================================================

interface SnowFootprint {
  x: number;
  y: number;
  createdAt: number;
  angle: number; // Radians - direction player was facing
  // Random variation for organic patchy look
  sizeVariation: number; // 0.8 to 1.2 multiplier
  offsetX: number; // Small random offset for trail variation
  offsetY: number;
  patchSeed: number; // Seed for consistent patchy pattern
}

interface PlayerFootprintState {
  footprints: SnowFootprint[];
  lastFootprintTime: number;
  lastPosition: { x: number; y: number };
}

// =============================================================================
// STATE - Per-player footprint tracking
// =============================================================================

const playerFootprintStates = new Map<string, PlayerFootprintState>();

// =============================================================================
// DIRECTION UTILITIES
// =============================================================================

/**
 * Converts player direction string to angle in radians
 * For snow trails: left/right movement = vertical elongation (90°)
 *                  up/down movement = horizontal elongation (0°)
 */
function directionToAngle(direction: string): number {
  switch (direction) {
    // Up/down movement - trail spreads horizontally
    case 'up':         return 0;
    case 'down':       return 0;
    // Left/right movement - trail spreads vertically (rotated 90°)
    case 'left':       return Math.PI / 2;
    case 'right':      return Math.PI / 2;
    // Diagonal movement - 45° angle
    case 'up_right':   return Math.PI / 4;
    case 'down_right': return -Math.PI / 4;
    case 'down_left':  return Math.PI / 4;
    case 'up_left':    return -Math.PI / 4;
    default:           return 0;
  }
}

/**
 * Gets movement direction vector for positioning trail behind player
 */
function getMovementVector(direction: string): { x: number; y: number } {
  switch (direction) {
    case 'up':         return { x: 0, y: -1 };
    case 'up_right':   return { x: 0.707, y: -0.707 };
    case 'right':      return { x: 1, y: 0 };
    case 'down_right': return { x: 0.707, y: 0.707 };
    case 'down':       return { x: 0, y: 1 };
    case 'down_left':  return { x: -0.707, y: 0.707 };
    case 'left':       return { x: -1, y: 0 };
    case 'up_left':    return { x: -0.707, y: -0.707 };
    default:           return { x: 0, y: 1 };
  }
}

// =============================================================================
// FOOTPRINT CREATION
// =============================================================================

/**
 * Simple seeded random for consistent patchy patterns
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Updates footprint state for a player if they're walking on alpine terrain
 */
export function updatePlayerFootprints(
  connection: DbConnection | null,
  player: SpacetimeDBPlayer,
  isMoving: boolean,
  nowMs: number
): void {
  if (!connection) return;
  
  const playerId = player.identity.toHexString();
  
  // Get or create player footprint state
  let state = playerFootprintStates.get(playerId);
  if (!state) {
    state = {
      footprints: [],
      lastFootprintTime: 0,
      lastPosition: { x: player.positionX, y: player.positionY }
    };
    playerFootprintStates.set(playerId, state);
  }
  
  // Clean up expired footprints
  state.footprints = state.footprints.filter(fp => 
    nowMs - fp.createdAt < FOOTPRINT_DURATION_MS
  );
  
  // Check if player is on alpine terrain
  const { tileX, tileY } = worldPosToTileCoords(player.positionX, player.positionY);
  const tileType = getTileTypeFromChunkData(connection, tileX, tileY);
  const isOnAlpine = tileType === 'Alpine';
  
  // Skip if not on alpine or not moving
  if (!isOnAlpine || !isMoving) {
    state.lastPosition = { x: player.positionX, y: player.positionY };
    return;
  }
  
  // Skip if player is swimming, jumping, or in other special states
  if (player.isOnWater || player.isDead || player.isKnockedOut) {
    return;
  }
  
  // Check if enough time has passed and player has moved enough
  const timeSinceLastFootprint = nowMs - state.lastFootprintTime;
  const dx = player.positionX - state.lastPosition.x;
  const dy = player.positionY - state.lastPosition.y;
  const distSq = dx * dx + dy * dy;
  
  if (timeSinceLastFootprint >= FOOTPRINT_INTERVAL_MS && distSq >= MIN_MOVEMENT_DIST_SQ) {
    // Get movement direction to place trail behind player
    const moveVec = getMovementVector(player.direction);
    const angle = directionToAngle(player.direction);
    
    // Random variations for organic look
    const seed = nowMs + player.positionX * 1000 + player.positionY;
    const sizeVariation = 0.85 + seededRandom(seed) * 0.3; // 0.85 to 1.15
    const offsetX = (seededRandom(seed + 1) - 0.5) * TRAIL_LATERAL_VARIANCE * 2;
    const offsetY = (seededRandom(seed + 2) - 0.5) * TRAIL_LATERAL_VARIANCE * 2;
    
    // Position trail AHEAD of player (in movement direction - pushing through snow)
    const footprint: SnowFootprint = {
      x: player.positionX + moveVec.x * TRAIL_FORWARD_OFFSET + offsetX,
      y: player.positionY + moveVec.y * TRAIL_FORWARD_OFFSET + offsetY,
      createdAt: nowMs,
      angle,
      sizeVariation,
      offsetX,
      offsetY,
      patchSeed: seed
    };
    
    // Add to array (with limit)
    state.footprints.push(footprint);
    if (state.footprints.length > MAX_FOOTPRINTS_PER_PLAYER) {
      state.footprints.shift(); // Remove oldest
    }
    
    // Update state
    state.lastFootprintTime = nowMs;
    state.lastPosition = { x: player.positionX, y: player.positionY };
  }
}

// =============================================================================
// FOOTPRINT RENDERING - Splotchy Pixel Art Style
// =============================================================================

/**
 * Draws irregular splotchy shapes using multiple offset circles
 * Creates organic, pixel-art style snow disturbance
 */
function drawSplotchyShape(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  baseRadius: number,
  color: string,
  seed: number,
  blobCount: number = 4
): void {
  // Draw main blob
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(centerX, centerY, baseRadius * 0.85, 0, Math.PI * 2);
  ctx.fill();
  
  // Add irregular bumps around the edge for splotchy look
  for (let i = 0; i < blobCount; i++) {
    const angle = (i / blobCount) * Math.PI * 2 + seededRandom(seed + i * 100) * 0.8;
    const dist = baseRadius * (0.4 + seededRandom(seed + i * 200) * 0.3);
    const blobX = centerX + Math.cos(angle) * dist;
    const blobY = centerY + Math.sin(angle) * dist;
    const blobRadius = baseRadius * (0.5 + seededRandom(seed + i * 300) * 0.35);
    
    ctx.beginPath();
    ctx.arc(blobX, blobY, blobRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draws a splotchy shape filled with the alpine texture (for inner layer)
 * Uses world coordinates for proper pattern alignment with terrain
 */
function drawSplotchyTexturedShape(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  baseRadius: number,
  alpha: number,
  seed: number,
  blobCount: number
): void {
  const pattern = getAlpinePattern(ctx);
  
  ctx.save();
  ctx.globalAlpha = alpha;
  
  // Build splotchy shape path in world coordinates (no rotation for texture alignment)
  ctx.beginPath();
  ctx.arc(worldX, worldY, baseRadius * 0.85, 0, Math.PI * 2);
  
  // Add satellite blobs
  for (let i = 0; i < blobCount; i++) {
    const angle = (i / blobCount) * Math.PI * 2 + seededRandom(seed + i * 100) * 0.8;
    const dist = baseRadius * (0.4 + seededRandom(seed + i * 200) * 0.3);
    const blobX = worldX + Math.cos(angle) * dist;
    const blobY = worldY + Math.sin(angle) * dist;
    const blobRadius = baseRadius * (0.5 + seededRandom(seed + i * 300) * 0.35);
    
    ctx.moveTo(blobX + blobRadius, blobY);
    ctx.arc(blobX, blobY, blobRadius, 0, Math.PI * 2);
  }
  
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fill();
  } else {
    // Fallback to solid color if texture not loaded
    ctx.fillStyle = `rgba(200, 215, 235, 1)`;
    ctx.fill();
  }
  
  ctx.restore();
}

/**
 * Draws a soft circular gradient for subtle color overlay
 */
function drawSoftCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  r: number, g: number, b: number,
  alpha: number
): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
  gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draws a single footprint with all layers:
 * 1. Alpine texture base (seamlessly blends with ground)
 * 2. Soft dark purple gradient overlay
 * 3. Soft light purple gradient center
 */
function drawFootprint(
  ctx: CanvasRenderingContext2D,
  footprint: SnowFootprint,
  alpha: number
): void {
  const size = FOOTPRINT_SIZE * footprint.sizeVariation;
  const halfSize = size / 2;
  const seed = footprint.patchSeed;
  
  // Small position wobble for organic feel
  const wobbleX = (seededRandom(seed + 700) - 0.5) * 2;
  const wobbleY = (seededRandom(seed + 800) - 0.5) * 2;
  const worldX = footprint.x + wobbleX;
  const worldY = footprint.y + wobbleY;
  
  // Layer 1: Alpine texture base (full size - blends with ground)
  drawSplotchyTexturedShape(
    ctx, worldX, worldY,
    halfSize,
    alpha * 0.95,
    seed, 5
  );
  
  // Layer 2: Soft dark purple gradient #A9B4EC (feathered edges blend smoothly)
  drawSoftCircle(
    ctx, worldX, worldY,
    halfSize * 0.8,
    169, 180, 236,  // #A9B4EC
    alpha * 1.0
  );
  
  // Layer 3: Soft light purple gradient #D2DEF2 (center glow)
  drawSoftCircle(
    ctx, worldX, worldY,
    halfSize * 0.5,
    210, 222, 242,  // #D2DEF2
    alpha * 1.0
  );
}

/**
 * Calculates the alpha value for a footprint based on age
 * Uses smooth fade-out in the last portion of lifetime
 */
function calculateFootprintAlpha(footprint: SnowFootprint, nowMs: number): number {
  const age = nowMs - footprint.createdAt;
  
  if (age < FOOTPRINT_FADE_START_MS) {
    // Full opacity during initial period
    return 1.0;
  }
  
  // Smooth fade-out using easing
  const fadeProgress = (age - FOOTPRINT_FADE_START_MS) / (FOOTPRINT_DURATION_MS - FOOTPRINT_FADE_START_MS);
  const easedFade = 1 - (fadeProgress * fadeProgress); // Quadratic ease-out
  
  return Math.max(0, easedFade);
}

/**
 * Adds splotchy shape to a Path2D for combined rendering
 */
function addSplotchyShapeToPath(
  path: Path2D,
  centerX: number,
  centerY: number,
  baseRadius: number,
  seed: number,
  blobCount: number
): void {
  // Main blob
  path.moveTo(centerX + baseRadius * 0.85, centerY);
  path.arc(centerX, centerY, baseRadius * 0.85, 0, Math.PI * 2);
  
  // Satellite blobs
  for (let i = 0; i < blobCount; i++) {
    const angle = (i / blobCount) * Math.PI * 2 + seededRandom(seed + i * 100) * 0.8;
    const dist = baseRadius * (0.4 + seededRandom(seed + i * 200) * 0.3);
    const blobX = centerX + Math.cos(angle) * dist;
    const blobY = centerY + Math.sin(angle) * dist;
    const blobRadius = baseRadius * (0.5 + seededRandom(seed + i * 300) * 0.35);
    
    path.moveTo(blobX + blobRadius, blobY);
    path.arc(blobX, blobY, blobRadius, 0, Math.PI * 2);
  }
}

/**
 * Renders all footprints for all players within the viewport
 * Uses combined path rendering for seamless texture:
 * 1. Build single combined path from all footprint shapes
 * 2. Fill once with alpine texture (no overlapping edges)
 * 3. Draw soft gradient overlays on top
 */
export function renderAllFootprints(
  ctx: CanvasRenderingContext2D,
  viewBounds: { minX: number; maxX: number; minY: number; maxY: number },
  nowMs: number
): void {
  // Collect visible footprints
  const visibleFootprints: Array<{ footprint: SnowFootprint; alpha: number }> = [];
  
  for (const [_playerId, state] of playerFootprintStates) {
    for (const footprint of state.footprints) {
      const margin = 60;
      if (footprint.x < viewBounds.minX - margin || footprint.x > viewBounds.maxX + margin ||
          footprint.y < viewBounds.minY - margin || footprint.y > viewBounds.maxY + margin) {
        continue;
      }
      
      const alpha = calculateFootprintAlpha(footprint, nowMs);
      if (alpha <= 0) continue;
      
      visibleFootprints.push({ footprint, alpha });
    }
  }
  
  if (visibleFootprints.length === 0) return;
  
  // PASS 1: Build combined path and fill with texture ONCE (no overlapping edges)
  const combinedTexturePath = new Path2D();
  
  for (const { footprint } of visibleFootprints) {
    const size = FOOTPRINT_SIZE * footprint.sizeVariation;
    const halfSize = size / 2;
    const seed = footprint.patchSeed;
    const wobbleX = (seededRandom(seed + 700) - 0.5) * 2;
    const wobbleY = (seededRandom(seed + 800) - 0.5) * 2;
    
    addSplotchyShapeToPath(
      combinedTexturePath,
      footprint.x + wobbleX,
      footprint.y + wobbleY,
      halfSize,
      seed,
      5
    );
  }
  
  // Fill the combined path with texture once
  const pattern = getAlpinePattern(ctx);
  if (pattern) {
    ctx.fillStyle = pattern;
  } else {
    ctx.fillStyle = 'rgba(200, 215, 235, 0.9)';
  }
  ctx.fill(combinedTexturePath);
  
  // PASS 2: Draw soft gradient overlays on top of each footprint
  for (const { footprint, alpha } of visibleFootprints) {
    const size = FOOTPRINT_SIZE * footprint.sizeVariation;
    const halfSize = size / 2;
    const seed = footprint.patchSeed;
    const wobbleX = (seededRandom(seed + 700) - 0.5) * 2;
    const wobbleY = (seededRandom(seed + 800) - 0.5) * 2;
    const worldX = footprint.x + wobbleX;
    const worldY = footprint.y + wobbleY;
    
    // Dark purple gradient - visible border
    drawSoftCircle(ctx, worldX, worldY, halfSize * 0.85, 130, 145, 200, alpha * 0.55);
    
    // Light purple center
    drawSoftCircle(ctx, worldX, worldY, halfSize * 0.5, 210, 222, 242, alpha * 0.45);
  }
}

/**
 * Gets footprints for a specific player (for debugging or special rendering)
 */
export function getPlayerFootprints(playerId: string): SnowFootprint[] {
  return playerFootprintStates.get(playerId)?.footprints || [];
}

/**
 * Clears all footprints for a player (e.g., on disconnect or death)
 */
export function clearPlayerFootprints(playerId: string): void {
  playerFootprintStates.delete(playerId);
}

/**
 * Clears all footprint data (e.g., on world reset)
 */
export function clearAllFootprints(): void {
  playerFootprintStates.clear();
}

/**
 * Gets the count of active footprints (for debugging/monitoring)
 */
export function getFootprintCount(): { total: number; byPlayer: Map<string, number> } {
  let total = 0;
  const byPlayer = new Map<string, number>();
  
  for (const [playerId, state] of playerFootprintStates) {
    const count = state.footprints.length;
    total += count;
    byPlayer.set(playerId, count);
  }
  
  return { total, byPlayer };
}
