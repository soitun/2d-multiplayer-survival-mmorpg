/**
 * Underwater Effects Rendering Utilities
 * 
 * Provides immersive underwater atmosphere effects when player is snorkeling:
 * - Floating bubble particles that drift upward
 * - Caustic light patterns that shimmer
 * - Vignette effect for depth perception
 */

// === UNDERWATER TINT (shared across all underwater entities) ===
// Used for sharks, jellyfish, players, corals, projectiles when viewed from underwater
export const UNDERWATER_TINT_FILTER = 'sepia(20%) hue-rotate(140deg) saturate(120%)';

// === BUBBLE PARTICLE SYSTEM ===
interface Bubble {
  x: number;
  y: number;
  size: number;
  speedY: number;
  driftX: number;
  driftPhase: number;
  opacity: number;
  lifetime: number;
  age: number;
}

// Bubble configuration
const BUBBLE_CONFIG = {
  MAX_BUBBLES: 60,
  SPAWN_RATE: 0.12, // Bubbles per frame (0.12 = ~7-8 per second at 60fps)
  MIN_SIZE: 2,
  MAX_SIZE: 6,
  MIN_SPEED_Y: 15, // Pixels per second upward
  MAX_SPEED_Y: 45,
  DRIFT_AMPLITUDE: 8, // Max horizontal drift in pixels
  DRIFT_SPEED: 0.002, // Drift oscillation speed
  MIN_OPACITY: 0.3,
  MAX_OPACITY: 0.7,
  MIN_LIFETIME: 3.0, // Seconds
  MAX_LIFETIME: 6.0,
  SPAWN_MARGIN: 100, // Spawn within this margin outside viewport
  // Colors
  BUBBLE_COLOR: { r: 180, g: 220, b: 240 },
  BUBBLE_HIGHLIGHT_COLOR: { r: 220, g: 245, b: 255 },
};

// === CAUSTIC LIGHT SYSTEM ===
interface CausticCell {
  x: number;
  y: number;
  phase: number;
  speed: number;
  size: number;
}

const CAUSTIC_CONFIG = {
  GRID_SIZE: 80, // Pixels between caustic centers
  INTENSITY_BASE: 0.08,
  INTENSITY_VARIATION: 0.04,
  ANIMATION_SPEED: 0.0008,
  CELL_SIZE_MIN: 30,
  CELL_SIZE_MAX: 50,
  COLOR: { r: 100, g: 180, b: 220, a: 0.15 },
};

// === STATE ===
interface UnderwaterState {
  bubbles: Bubble[];
  causticCells: CausticCell[];
  lastUpdate: number;
  isInitialized: boolean;
}

const underwaterState: UnderwaterState = {
  bubbles: [],
  causticCells: [],
  lastUpdate: 0,
  isInitialized: false,
};

// === BUBBLE FUNCTIONS ===

/**
 * Creates a new bubble particle
 */
function createBubble(
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number
): Bubble {
  const margin = BUBBLE_CONFIG.SPAWN_MARGIN;
  
  // Spawn bubbles from bottom of screen, spread across width
  const x = cameraX - canvasWidth / 2 - margin + Math.random() * (canvasWidth + margin * 2);
  const y = cameraY + canvasHeight / 2 + margin; // Below viewport
  
  const size = BUBBLE_CONFIG.MIN_SIZE + Math.random() * (BUBBLE_CONFIG.MAX_SIZE - BUBBLE_CONFIG.MIN_SIZE);
  const speedY = BUBBLE_CONFIG.MIN_SPEED_Y + Math.random() * (BUBBLE_CONFIG.MAX_SPEED_Y - BUBBLE_CONFIG.MIN_SPEED_Y);
  
  return {
    x,
    y,
    size,
    speedY,
    driftX: (Math.random() - 0.5) * 2, // Initial drift direction
    driftPhase: Math.random() * Math.PI * 2,
    opacity: BUBBLE_CONFIG.MIN_OPACITY + Math.random() * (BUBBLE_CONFIG.MAX_OPACITY - BUBBLE_CONFIG.MIN_OPACITY),
    lifetime: BUBBLE_CONFIG.MIN_LIFETIME + Math.random() * (BUBBLE_CONFIG.MAX_LIFETIME - BUBBLE_CONFIG.MIN_LIFETIME),
    age: 0,
  };
}

/**
 * Updates all bubble particles
 */
function updateBubbles(
  deltaTime: number,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  const cullMargin = BUBBLE_CONFIG.SPAWN_MARGIN * 2;
  const topBound = cameraY - canvasHeight / 2 - cullMargin;
  
  // Update existing bubbles
  for (let i = underwaterState.bubbles.length - 1; i >= 0; i--) {
    const bubble = underwaterState.bubbles[i];
    bubble.age += deltaTime;
    
    // Move upward
    bubble.y -= bubble.speedY * deltaTime;
    
    // Horizontal drift (sinusoidal)
    bubble.driftPhase += BUBBLE_CONFIG.DRIFT_SPEED * deltaTime * 1000;
    const driftOffset = Math.sin(bubble.driftPhase) * BUBBLE_CONFIG.DRIFT_AMPLITUDE;
    bubble.x += bubble.driftX * deltaTime * 10 + driftOffset * deltaTime;
    
    // Size variation as bubble rises (gets slightly bigger)
    const ageFactor = Math.min(1, bubble.age / bubble.lifetime);
    
    // Remove if too old or off screen
    if (bubble.age >= bubble.lifetime || bubble.y < topBound) {
      underwaterState.bubbles.splice(i, 1);
    }
  }
  
  // Spawn new bubbles
  if (underwaterState.bubbles.length < BUBBLE_CONFIG.MAX_BUBBLES) {
    if (Math.random() < BUBBLE_CONFIG.SPAWN_RATE) {
      underwaterState.bubbles.push(createBubble(cameraX, cameraY, canvasWidth, canvasHeight));
    }
  }
}

/**
 * Renders all bubble particles
 * @param isWaterTile - Optional function to check if a world position is over a water tile
 */
function renderBubbles(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  isWaterTile?: (worldX: number, worldY: number) => boolean
): void {
  const viewLeft = cameraX - canvasWidth / 2;
  const viewRight = cameraX + canvasWidth / 2;
  const viewTop = cameraY - canvasHeight / 2;
  const viewBottom = cameraY + canvasHeight / 2;
  
  ctx.save();
  
  for (const bubble of underwaterState.bubbles) {
    // Skip if off-screen
    if (bubble.x < viewLeft - 20 || bubble.x > viewRight + 20 ||
        bubble.y < viewTop - 20 || bubble.y > viewBottom + 20) {
      continue;
    }
    
    // Skip bubbles over land tiles - only render over sea
    if (isWaterTile && !isWaterTile(bubble.x, bubble.y)) {
      continue;
    }
    
    // Fade in at start, fade out at end
    let alpha = bubble.opacity;
    const fadeInDuration = 0.5;
    const fadeOutStart = 0.7;
    
    if (bubble.age < fadeInDuration) {
      alpha *= bubble.age / fadeInDuration;
    } else if (bubble.age / bubble.lifetime > fadeOutStart) {
      const fadeProgress = (bubble.age / bubble.lifetime - fadeOutStart) / (1 - fadeOutStart);
      alpha *= 1 - fadeProgress;
    }
    
    // Size grows slightly as bubble rises
    const sizeGrowth = 1 + (bubble.age / bubble.lifetime) * 0.3;
    const currentSize = bubble.size * sizeGrowth;
    
    // Draw bubble with gradient for 3D effect
    const gradient = ctx.createRadialGradient(
      bubble.x - currentSize * 0.3,
      bubble.y - currentSize * 0.3,
      0,
      bubble.x,
      bubble.y,
      currentSize
    );
    
    const { r, g, b } = BUBBLE_CONFIG.BUBBLE_COLOR;
    const { r: hr, g: hg, b: hb } = BUBBLE_CONFIG.BUBBLE_HIGHLIGHT_COLOR;
    
    gradient.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, ${alpha})`);
    gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${alpha * 0.8})`);
    gradient.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, currentSize, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
}

// === CAUSTIC FUNCTIONS ===

/**
 * Initializes caustic cells for the visible area
 */
function initializeCaustics(
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  underwaterState.causticCells = [];
  
  const gridSize = CAUSTIC_CONFIG.GRID_SIZE;
  const margin = gridSize * 2;
  
  const startX = Math.floor((cameraX - canvasWidth / 2 - margin) / gridSize) * gridSize;
  const endX = Math.ceil((cameraX + canvasWidth / 2 + margin) / gridSize) * gridSize;
  const startY = Math.floor((cameraY - canvasHeight / 2 - margin) / gridSize) * gridSize;
  const endY = Math.ceil((cameraY + canvasHeight / 2 + margin) / gridSize) * gridSize;
  
  for (let y = startY; y <= endY; y += gridSize) {
    for (let x = startX; x <= endX; x += gridSize) {
      // Use position-based pseudo-random for consistent appearance
      const seed = x * 31 + y * 17;
      const phase = (seed % 1000) / 1000 * Math.PI * 2;
      const speed = 0.8 + ((seed % 100) / 100) * 0.4; // 0.8 to 1.2
      const size = CAUSTIC_CONFIG.CELL_SIZE_MIN + 
        ((seed % 50) / 50) * (CAUSTIC_CONFIG.CELL_SIZE_MAX - CAUSTIC_CONFIG.CELL_SIZE_MIN);
      
      underwaterState.causticCells.push({ x, y, phase, speed, size });
    }
  }
}

/**
 * Renders caustic light patterns
 */
function renderCaustics(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  currentTimeMs: number
): void {
  // Re-initialize if camera moved significantly
  if (underwaterState.causticCells.length === 0 ||
      Math.abs(underwaterState.causticCells[0]?.x - cameraX) > canvasWidth) {
    initializeCaustics(cameraX, cameraY, canvasWidth, canvasHeight);
  }
  
  ctx.save();
  ctx.globalCompositeOperation = 'screen'; // Additive-like blending for light
  
  const viewLeft = cameraX - canvasWidth / 2;
  const viewRight = cameraX + canvasWidth / 2;
  const viewTop = cameraY - canvasHeight / 2;
  const viewBottom = cameraY + canvasHeight / 2;
  
  const { r, g, b, a } = CAUSTIC_CONFIG.COLOR;
  
  for (const cell of underwaterState.causticCells) {
    // Skip if off-screen
    if (cell.x < viewLeft - cell.size || cell.x > viewRight + cell.size ||
        cell.y < viewTop - cell.size || cell.y > viewBottom + cell.size) {
      continue;
    }
    
    // Animate intensity
    const animatedPhase = cell.phase + currentTimeMs * CAUSTIC_CONFIG.ANIMATION_SPEED * cell.speed;
    const intensity = CAUSTIC_CONFIG.INTENSITY_BASE + 
      Math.sin(animatedPhase) * CAUSTIC_CONFIG.INTENSITY_VARIATION +
      Math.sin(animatedPhase * 2.3 + 1.5) * CAUSTIC_CONFIG.INTENSITY_VARIATION * 0.5;
    
    // Draw caustic pattern as soft glow
    const gradient = ctx.createRadialGradient(
      cell.x, cell.y, 0,
      cell.x, cell.y, cell.size
    );
    
    const currentAlpha = a * intensity;
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${currentAlpha})`);
    gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${currentAlpha * 0.5})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cell.x, cell.y, cell.size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
}

// === VIGNETTE FUNCTION ===

/**
 * Renders a depth vignette effect around the edges of the screen
 */
export function renderUnderwaterVignette(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number
): void {
  ctx.save();
  
  // Create radial gradient from center to edges
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
  
  const gradient = ctx.createRadialGradient(
    centerX, centerY, maxRadius * 0.4, // Inner radius (clear center)
    centerX, centerY, maxRadius // Outer radius (darkened edges)
  );
  
  gradient.addColorStop(0, 'rgba(8, 35, 50, 0)'); // Transparent center
  gradient.addColorStop(0.6, 'rgba(8, 35, 50, 0.1)'); // Subtle darkening
  gradient.addColorStop(0.85, 'rgba(5, 25, 40, 0.25)'); // More visible darkening
  gradient.addColorStop(1, 'rgba(3, 18, 30, 0.4)'); // Dark edges
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  ctx.restore();
}

// === MAIN UPDATE/RENDER FUNCTIONS ===

/**
 * Updates all underwater effects (call once per frame)
 */
export function updateUnderwaterEffects(
  deltaTimeSeconds: number,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  updateBubbles(deltaTimeSeconds, cameraX, cameraY, canvasWidth, canvasHeight);
}

/**
 * Renders underwater effects that appear BELOW the player (caustics on sea floor)
 */
export function renderUnderwaterEffectsUnder(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  currentTimeMs: number
): void {
  // Render caustic light patterns on the sea floor
  renderCaustics(ctx, cameraX, cameraY, canvasWidth, canvasHeight, currentTimeMs);
}

/**
 * Renders underwater effects that appear ABOVE the player (bubbles, vignette)
 * @param applyVignette - Whether to apply the vignette effect (only for screen-space)
 * @param isWaterTile - Optional function to check if a world position is over a water tile (bubbles only render over water)
 */
export function renderUnderwaterEffectsOver(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  currentTimeMs: number,
  applyVignette: boolean = true,
  isWaterTile?: (worldX: number, worldY: number) => boolean
): void {
  // Render bubbles floating upward (only over water tiles)
  renderBubbles(ctx, cameraX, cameraY, canvasWidth, canvasHeight, isWaterTile);
}

/**
 * Clears all underwater effects (call when exiting underwater mode)
 */
export function clearUnderwaterEffects(): void {
  underwaterState.bubbles = [];
  underwaterState.causticCells = [];
  underwaterState.isInitialized = false;
}

/**
 * Gets current effect counts (for debugging)
 */
export function getUnderwaterEffectCounts(): { bubbles: number; caustics: number } {
  return {
    bubbles: underwaterState.bubbles.length,
    caustics: underwaterState.causticCells.length,
  };
}
