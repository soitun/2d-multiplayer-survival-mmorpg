import { TILE_SIZE } from '../../config/gameConfig';

/**
 * Water Overlay Rendering Utilities
 * 
 * AAA pixel art studio style water surface effects with crisp, deliberate lines,
 * subtle color variations, and sparkle highlights. Optimized for high performance.
 */

// Pre-computed constants
const TWO_PI = Math.PI * 2;
const HALF_TILE_SIZE = TILE_SIZE * 0.5;

// Line visual type for varied aesthetics
type LineVisualType = 'highlight' | 'reflection' | 'deep';

interface WaterLine {
  startX: number;
  y: number;
  targetLength: number;
  currentLength: number;
  opacity: number;
  thickness: number;
  growthSpeed: number;
  growthPhase: number;
  lifetime: number;
  age: number;
  baseOpacity: number;
  isGrowing: boolean;
  isFadingOut: boolean; // Track if line is shrinking back toward center
  fadeOutPhase: number; // Phase of fade-out animation (0 to 1)
  wavePhase: number;
  visualType: LineVisualType; // Different line styles for visual depth
  colorShift: number; // Subtle hue variation along line
}

// Sparkle effect for that extra polish
interface WaterSparkle {
  x: number;
  y: number;
  lifetime: number;
  age: number;
  size: number;
  brightness: number;
  pulsePhase: number;
}

interface WaterOverlayState {
  lines: WaterLine[];
  sparkles: WaterSparkle[];
  lastUpdate: number;
  globalPhaseOffset: number;
  worldTiles: Map<string, any> | null;
}

// AAA Pixel Art Style Water Configuration - crisp, deliberate, polished
const WATER_CONFIG = {
  // Line density - increased for better coverage
  LINES_PER_SCREEN_AREA: 0.4, // Increased from 0.25
  
  // Line properties - crisp pixel art style
  MIN_LENGTH: 8,
  MAX_LENGTH: 32,
  MIN_OPACITY: 0.5,
  MAX_OPACITY: 0.85,
  LINE_THICKNESS: 2.5, // Slightly thinner to match player wake line width
  
  // Growth animation - faster and more dynamic with wider variation
  MIN_GROWTH_SPEED: 4.0,  // Doubled for faster appearance
  MAX_GROWTH_SPEED: 8.0,  // More than doubled for wider variation and faster feel
  
  // Line lifetime - shorter for faster, more dynamic feel
  MIN_LIFETIME: 1.8,  // Reduced for faster turnover
  MAX_LIFETIME: 3.5,  // Reduced for more frequent appearance/disappearance
  FADE_DURATION: 0.5,  // Faster fade-out to match increased growth speed
  
  // Wave movement - subtle and organic
  WAVE_AMPLITUDE: 1.0, // Subtle vertical movement
  WAVE_FREQUENCY: 0.00449, // Matches wake expansion speed (2π/1400ms for one cycle per wake lifetime)
  
  // Sparkle settings for that AAA polish
  SPARKLE_DENSITY: 0.12, // Increased from 0.08 for better coverage
  SPARKLE_SIZE_MIN: 1,
  SPARKLE_SIZE_MAX: 2,
  SPARKLE_LIFETIME_MIN: 0.3,
  SPARKLE_LIFETIME_MAX: 0.8,
  SPARKLE_PULSE_SPEED: 0.008,
  
  // Color palette - sophisticated water tones
  // Primary: Crisp cyan highlight
  PRIMARY_COLOR: { r: 140, g: 230, b: 255 },
  // Secondary: Deeper teal for reflections  
  SECONDARY_COLOR: { r: 100, g: 200, b: 240 },
  // Deep: Subtle blue for depth
  DEEP_COLOR: { r: 80, g: 170, b: 220 },
  // Sparkle: Bright white-cyan
  SPARKLE_COLOR: { r: 220, g: 250, b: 255 },
  
  // Screen margins - expanded for better coverage
  SPAWN_MARGIN: 1200, // Increased from 600 - spawn effects further out
  RENDER_MARGIN: 400, // Margin for rendering (keep effects visible longer)
  
  // Global timing
  GLOBAL_WAVE_SPEED: 4.49, // Matches wake expansion speed (2π/1.4s for synchronized movement with deltaTime in seconds)
  BREATHING_SPEED: 0.001, // Subtle opacity breathing
};

let waterSystem: WaterOverlayState = {
  lines: [],
  sparkles: [],
  lastUpdate: 0,
  globalPhaseOffset: 0,
  worldTiles: null,
};

/**
 * Converts world pixel coordinates to tile coordinates (same as placement system)
 */
function worldPosToTileCoords(worldX: number, worldY: number): { tileX: number; tileY: number } {
  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);
  return { tileX, tileY };
}

// Cache for water tile lookup by coordinate key
const waterTileCache = new Map<string, boolean>();
let waterTileCacheWorldTiles: Map<string, any> | null = null;

/**
 * Checks if a world position is on a water tile (Sea type) - same logic as placement system
 * OPTIMIZED: Uses direct key lookup instead of iterating all tiles
 */
function isPositionOnWaterTile(worldTiles: Map<string, any>, worldX: number, worldY: number): boolean {
  if (!worldTiles || worldTiles.size === 0) return false;
  
  // Rebuild cache if worldTiles changed
  if (worldTiles !== waterTileCacheWorldTiles) {
    waterTileCache.clear();
    worldTiles.forEach((tile) => {
      if (tile.tileType && tile.tileType.tag === 'Sea') {
        waterTileCache.set(`${tile.worldX}_${tile.worldY}`, true);
      }
    });
    waterTileCacheWorldTiles = worldTiles;
  }
  
  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);
  
  return waterTileCache.has(`${tileX}_${tileY}`);
}

// Pre-allocated array for visible water tiles (reused each frame)
const visibleWaterTilesPool: Array<{x: number, y: number}> = [];
let visibleWaterTilesCount = 0;

/**
 * Get all water tiles in the visible camera area for efficient spawning
 * OPTIMIZED: Uses pre-allocated array pool, reuses forEach
 */
function getVisibleWaterTiles(
  worldTiles: Map<string, any>,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number
): Array<{x: number, y: number}> {
  // Reset pool count
  visibleWaterTilesCount = 0;
  
  // Calculate visible tile bounds
  const halfWidth = canvasWidth * 0.5;
  const halfHeight = canvasHeight * 0.5;
  const leftBound = cameraX - halfWidth - WATER_CONFIG.SPAWN_MARGIN;
  const rightBound = cameraX + halfWidth + WATER_CONFIG.SPAWN_MARGIN;
  const topBound = cameraY - halfHeight - WATER_CONFIG.SPAWN_MARGIN;
  const bottomBound = cameraY + halfHeight + WATER_CONFIG.SPAWN_MARGIN;
  
  // Check all tiles in the area
  worldTiles.forEach((tile) => {
    if (tile.tileType && tile.tileType.tag === 'Sea') {
      // Convert tile coordinates to world pixels (center of tile)
      const worldX = tile.worldX * TILE_SIZE + HALF_TILE_SIZE;
      const worldY = tile.worldY * TILE_SIZE + HALF_TILE_SIZE;
      
      // Check if tile is in visible area
      if (worldX >= leftBound && worldX <= rightBound && 
          worldY >= topBound && worldY <= bottomBound) {
        // Reuse or extend pool
        if (visibleWaterTilesCount >= visibleWaterTilesPool.length) {
          visibleWaterTilesPool.push({x: worldX, y: worldY});
        } else {
          visibleWaterTilesPool[visibleWaterTilesCount].x = worldX;
          visibleWaterTilesPool[visibleWaterTilesCount].y = worldY;
        }
        visibleWaterTilesCount++;
      }
    }
  });
  
  // Return a view of the pool (up to count)
  return visibleWaterTilesPool.slice(0, visibleWaterTilesCount);
}

/**
 * Creates a single water line with AAA pixel art styling
 * Only spawns lines on water tiles
 */
function createWaterLine(
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  worldTiles: Map<string, any>
): WaterLine | null {
  // Get all visible water tiles for spawning
  const visibleWaterTiles = getVisibleWaterTiles(worldTiles, cameraX, cameraY, canvasWidth, canvasHeight);
  
  if (visibleWaterTiles.length === 0) return null;
  
  // Pick a random water tile to spawn on
  const randomWaterTile = visibleWaterTiles[Math.floor(Math.random() * visibleWaterTiles.length)];
  const startX = randomWaterTile.x + (Math.random() - 0.5) * TILE_SIZE * 0.7;
  const y = randomWaterTile.y + (Math.random() - 0.5) * TILE_SIZE * 0.7;
  
  // Determine visual type for variety (weighted distribution)
  const typeRoll = Math.random();
  let visualType: LineVisualType;
  if (typeRoll < 0.5) {
    visualType = 'highlight'; // Most common - bright surface highlights
  } else if (typeRoll < 0.8) {
    visualType = 'reflection'; // Medium - teal reflections
  } else {
    visualType = 'deep'; // Rare - subtle deep water hints
  }
  
  // Properties based on visual type
  let targetLength: number;
  let baseOpacity: number;
  
  switch (visualType) {
    case 'highlight':
      targetLength = WATER_CONFIG.MIN_LENGTH + Math.random() * (WATER_CONFIG.MAX_LENGTH - WATER_CONFIG.MIN_LENGTH) * 0.7;
      baseOpacity = WATER_CONFIG.MIN_OPACITY + Math.random() * (WATER_CONFIG.MAX_OPACITY - WATER_CONFIG.MIN_OPACITY);
      break;
    case 'reflection':
      targetLength = WATER_CONFIG.MIN_LENGTH * 1.5 + Math.random() * (WATER_CONFIG.MAX_LENGTH - WATER_CONFIG.MIN_LENGTH);
      baseOpacity = (WATER_CONFIG.MIN_OPACITY + WATER_CONFIG.MAX_OPACITY) * 0.4 + Math.random() * 0.2;
      break;
    case 'deep':
      targetLength = WATER_CONFIG.MIN_LENGTH + Math.random() * WATER_CONFIG.MAX_LENGTH * 0.5;
      baseOpacity = WATER_CONFIG.MIN_OPACITY * 0.7 + Math.random() * 0.2;
      break;
  }
  
  // Validate line end is on water
  const endX = startX + targetLength;
  if (!isPositionOnWaterTile(worldTiles, endX, y)) {
    // Try shorter length
    targetLength = targetLength * 0.5;
    if (targetLength < WATER_CONFIG.MIN_LENGTH) return null;
  }
  
  // More variation: use exponential distribution for wider speed range
  // Some lines grow very fast, some slower, creating more dynamic feel
  const speedRandom = Math.random();
  const speedVariation = speedRandom * speedRandom; // Square for exponential distribution (more fast lines)
  const growthSpeed = WATER_CONFIG.MIN_GROWTH_SPEED + 
    speedVariation * (WATER_CONFIG.MAX_GROWTH_SPEED - WATER_CONFIG.MIN_GROWTH_SPEED);
  
  // Add occasional burst of extra speed (10% chance for very fast lines)
  const burstMultiplier = Math.random() < 0.1 ? 1.5 : 1.0;
  const finalGrowthSpeed = growthSpeed * burstMultiplier;
  
  const lifetime = WATER_CONFIG.MIN_LIFETIME + 
    Math.random() * (WATER_CONFIG.MAX_LIFETIME - WATER_CONFIG.MIN_LIFETIME);
  
  return {
    startX,
    y,
    targetLength,
    currentLength: 0,
    opacity: baseOpacity,
    thickness: WATER_CONFIG.LINE_THICKNESS,
    growthSpeed: finalGrowthSpeed,
    growthPhase: 0,
    lifetime,
    age: 0,
    baseOpacity,
    isGrowing: true,
    isFadingOut: false,
    fadeOutPhase: 0,
    wavePhase: Math.random() * Math.PI * 2,
    visualType,
    colorShift: Math.random() * 0.15 - 0.075, // -7.5% to +7.5% hue shift
  };
}

/**
 * Creates a sparkle effect at a random water position
 */
function createSparkle(
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  worldTiles: Map<string, any>
): WaterSparkle | null {
  const visibleWaterTiles = getVisibleWaterTiles(worldTiles, cameraX, cameraY, canvasWidth, canvasHeight);
  
  if (visibleWaterTiles.length === 0) return null;
  
  const randomTile = visibleWaterTiles[Math.floor(Math.random() * visibleWaterTiles.length)];
  
  return {
    x: randomTile.x + (Math.random() - 0.5) * TILE_SIZE * 0.8,
    y: randomTile.y + (Math.random() - 0.5) * TILE_SIZE * 0.8,
    lifetime: WATER_CONFIG.SPARKLE_LIFETIME_MIN + 
      Math.random() * (WATER_CONFIG.SPARKLE_LIFETIME_MAX - WATER_CONFIG.SPARKLE_LIFETIME_MIN),
    age: 0,
    size: WATER_CONFIG.SPARKLE_SIZE_MIN + 
      Math.random() * (WATER_CONFIG.SPARKLE_SIZE_MAX - WATER_CONFIG.SPARKLE_SIZE_MIN),
    brightness: 0.7 + Math.random() * 0.3,
    pulsePhase: Math.random() * Math.PI * 2,
  };
}

/**
 * Updates water lines and sparkles with smooth animations
 */
function updateWaterSystem(
  deltaTime: number,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  worldTiles: Map<string, any> | null
): void {
  waterSystem.worldTiles = worldTiles;
  waterSystem.globalPhaseOffset += deltaTime * WATER_CONFIG.GLOBAL_WAVE_SPEED;
  
  // Culling bounds
  const cullMargin = WATER_CONFIG.SPAWN_MARGIN;
  const leftBound = cameraX - canvasWidth / 2 - cullMargin;
  const rightBound = cameraX + canvasWidth / 2 + cullMargin;
  const topBound = cameraY - canvasHeight / 2 - cullMargin;
  const bottomBound = cameraY + canvasHeight / 2 + cullMargin;
  
  // Update lines using swap-and-pop for O(1) removal
  const lines = waterSystem.lines;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    line.age += deltaTime;
    let shouldRemove = false;
    
    // Growth animation with smooth ease-out
    if (line.isGrowing) {
      line.growthPhase += line.growthSpeed * deltaTime;
      if (line.growthPhase >= 1.0) {
        line.growthPhase = 1.0;
        line.isGrowing = false;
      }
      // Cubic ease-out for smooth appearance
      const t = line.growthPhase;
      const oneMinusT = 1 - t;
      const easedGrowth = 1 - oneMinusT * oneMinusT * oneMinusT;
      line.currentLength = line.targetLength * easedGrowth;
    }
    
    // Fade out at end of lifetime - reverse of appearance (shrink back toward center)
    if (line.age > line.lifetime) {
      // Start fade-out animation if not already started
      if (!line.isFadingOut) {
        line.isFadingOut = true;
        line.fadeOutPhase = 0;
      }
      
      const fadeProgress = (line.age - line.lifetime) / WATER_CONFIG.FADE_DURATION;
      if (fadeProgress >= 1.0) {
        shouldRemove = true;
      } else {
        // Update fade-out phase (same speed as growth)
        line.fadeOutPhase += line.growthSpeed * deltaTime;
        if (line.fadeOutPhase > 1.0) {
          line.fadeOutPhase = 1.0;
        }
        
        // Reverse of growth: shrink from full length back to 0
        const t = line.fadeOutPhase;
        const easedShrink = t * t * t;
        line.currentLength = line.targetLength * (1.0 - easedShrink);
        
        // Also fade opacity
        const easedFade = fadeProgress * fadeProgress * (3.0 - 2.0 * fadeProgress);
        line.opacity = line.baseOpacity * (1.0 - easedFade);
      }
    }
    
    // Cull off-screen lines
    if (!shouldRemove && (line.startX + line.currentLength < leftBound || 
        line.startX > rightBound ||
        line.y < topBound || line.y > bottomBound)) {
      shouldRemove = true;
    }
    
    if (shouldRemove) {
      // Swap-and-pop: O(1) removal
      const lastIdx = lines.length - 1;
      if (i < lastIdx) lines[i] = lines[lastIdx];
      lines.pop();
    } else {
      i++;
    }
  }
  
  // Update sparkles using swap-and-pop
  const sparkles = waterSystem.sparkles;
  let j = 0;
  while (j < sparkles.length) {
    const sparkle = sparkles[j];
    sparkle.age += deltaTime;
    
    let removeSparkle = sparkle.age >= sparkle.lifetime ||
        sparkle.x < leftBound || sparkle.x > rightBound ||
        sparkle.y < topBound || sparkle.y > bottomBound;
    
    if (removeSparkle) {
      const lastIdx = sparkles.length - 1;
      if (j < lastIdx) sparkles[j] = sparkles[lastIdx];
      sparkles.pop();
    } else {
      j++;
    }
  }
  
  // Calculate target counts
  const visibleArea = canvasWidth * canvasHeight;
  const targetLineCount = Math.floor((visibleArea / 1000000) * WATER_CONFIG.LINES_PER_SCREEN_AREA * 800);
  const targetSparkleCount = Math.floor((visibleArea / 1000000) * WATER_CONFIG.SPARKLE_DENSITY * 200);
  
  // Spawn new lines - increased spawn rate for better coverage
  if (waterSystem.lines.length < targetLineCount && worldTiles && worldTiles.size > 0) {
    const linesToSpawn = Math.min(8, targetLineCount - waterSystem.lines.length); // Increased from 5
    for (let i = 0; i < linesToSpawn; i++) {
      const newLine = createWaterLine(cameraX, cameraY, canvasWidth, canvasHeight, worldTiles);
      if (newLine) waterSystem.lines.push(newLine);
    }
  }
  
  // Spawn new sparkles - increased spawn rate for better coverage
  if (waterSystem.sparkles.length < targetSparkleCount && worldTiles && worldTiles.size > 0) {
    const sparklesToSpawn = Math.min(5, targetSparkleCount - waterSystem.sparkles.length); // Increased from 3
    for (let i = 0; i < sparklesToSpawn; i++) {
      const newSparkle = createSparkle(cameraX, cameraY, canvasWidth, canvasHeight, worldTiles);
      if (newSparkle) waterSystem.sparkles.push(newSparkle);
    }
  }
  
  // Cap maximums for performance
  while (waterSystem.lines.length > targetLineCount * 1.3) waterSystem.lines.pop();
  while (waterSystem.sparkles.length > targetSparkleCount * 1.3) waterSystem.sparkles.pop();
}

/**
 * Gets the color for a line based on its visual type with subtle variation
 */
function getLineColor(line: WaterLine, breathingFactor: number): { r: number; g: number; b: number } {
  let baseColor: { r: number; g: number; b: number };
  
  switch (line.visualType) {
    case 'highlight':
      baseColor = WATER_CONFIG.PRIMARY_COLOR;
      break;
    case 'reflection':
      baseColor = WATER_CONFIG.SECONDARY_COLOR;
      break;
    case 'deep':
      baseColor = WATER_CONFIG.DEEP_COLOR;
      break;
  }
  
  // Apply subtle color shift for variation
  const shift = line.colorShift;
  return {
    r: Math.min(255, Math.max(0, baseColor.r + baseColor.r * shift)),
    g: Math.min(255, Math.max(0, baseColor.g + baseColor.g * shift * 0.5)),
    b: Math.min(255, Math.max(0, baseColor.b + baseColor.b * shift * 0.3)),
  };
}

// Cached sparkle color string
const SPARKLE_COLOR_STR = `rgb(${WATER_CONFIG.SPARKLE_COLOR.r}, ${WATER_CONFIG.SPARKLE_COLOR.g}, ${WATER_CONFIG.SPARKLE_COLOR.b})`;

/**
 * Renders water effects with AAA pixel art style - crisp lines and sparkles
 * OPTIMIZED: Traditional loops, pre-computed values, reduced string creation
 */
function renderWaterEffects(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  currentTime: number
): void {
  const lineCount = waterSystem.lines.length;
  const sparkleCount = waterSystem.sparkles.length;
  if (lineCount === 0 && sparkleCount === 0) return;
  
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  
  // Global breathing effect for subtle life
  const breathingFactor = (Math.sin(currentTime * WATER_CONFIG.BREATHING_SPEED) + 1) * 0.5;
  const breathingMod = 0.85 + breathingFactor * 0.15;
  
  // Camera bounds for rendering - expanded margin to keep effects visible longer
  const renderMargin = WATER_CONFIG.RENDER_MARGIN;
  const cameraLeft = cameraX - canvasWidth - renderMargin;
  const cameraRight = cameraX + canvasWidth + renderMargin;
  const cameraTop = cameraY - canvasHeight - renderMargin;
  const cameraBottom = cameraY + canvasHeight + renderMargin;
  
  // Pre-compute wave frequency factor
  const waveFreqTime = currentTime * WATER_CONFIG.WAVE_FREQUENCY;
  const waveAmplitude = WATER_CONFIG.WAVE_AMPLITUDE;
  
  // === RENDER LINES ===
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  
  const lines = waterSystem.lines;
  const worldTiles = waterSystem.worldTiles;
  
  for (let i = 0; i < lineCount; i++) {
    const line = lines[i];
    const lineEnd = line.startX + line.currentLength;
    
    // Quick culling check
    if (lineEnd < cameraLeft || line.startX > cameraRight ||
        line.y < cameraTop || line.y > cameraBottom) {
      continue;
    }
    
    // Verify still on water
    const midX = line.startX + line.currentLength * 0.5;
    if (worldTiles && !isPositionOnWaterTile(worldTiles, midX, line.y)) {
      continue;
    }
    
    // Calculate wave offset
    const waveOffset = Math.sin(waveFreqTime + line.wavePhase + line.startX * 0.005) * waveAmplitude;
    
    // Calculate final opacity with breathing
    const finalOpacity = line.opacity * breathingMod;
    
    // Get color for this line type
    const color = getLineColor(line, breathingFactor);
    
    // Calculate line position with wave
    const y = line.y + waveOffset;
    
    // Calculate center and half-length
    const centerX = line.startX + line.targetLength * 0.5;
    const halfLength = line.currentLength * 0.5;
    const startX = centerX - halfLength;
    const endX = centerX + halfLength;
    
    // Draw main crisp line
    ctx.globalAlpha = finalOpacity;
    ctx.strokeStyle = `rgb(${color.r | 0}, ${color.g | 0}, ${color.b | 0})`;
    ctx.lineWidth = line.thickness;
    
    ctx.beginPath();
    ctx.moveTo(startX | 0, y | 0);
    ctx.lineTo(endX | 0, y | 0);
    ctx.stroke();
    
    // Add subtle highlight for highlight type
    if (line.visualType === 'highlight' && finalOpacity > 0.5) {
      ctx.globalAlpha = finalOpacity * 0.3;
      const rH = Math.min(255, color.r + 40) | 0;
      const gH = Math.min(255, color.g + 20) | 0;
      const bH = Math.min(255, color.b + 10) | 0;
      ctx.strokeStyle = `rgb(${rH}, ${gH}, ${bH})`;
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo((startX + 1) | 0, (y - 1) | 0);
      ctx.lineTo((endX - 1) | 0, (y - 1) | 0);
      ctx.stroke();
    }
  }
  
  // === RENDER SPARKLES ===
  const sparkles = waterSystem.sparkles;
  const pulseSpeedTime = currentTime * WATER_CONFIG.SPARKLE_PULSE_SPEED;
  
  for (let i = 0; i < sparkleCount; i++) {
    const sparkle = sparkles[i];
    
    // Quick culling
    if (sparkle.x < cameraLeft || sparkle.x > cameraRight ||
        sparkle.y < cameraTop || sparkle.y > cameraBottom) {
      continue;
    }
    
    // Verify on water
    if (worldTiles && !isPositionOnWaterTile(worldTiles, sparkle.x, sparkle.y)) {
      continue;
    }
    
    // Calculate sparkle opacity
    const lifeProgress = sparkle.age / sparkle.lifetime;
    let lifeFade: number;
    if (lifeProgress < 0.15) {
      lifeFade = lifeProgress / 0.15;
    } else if (lifeProgress > 0.7) {
      lifeFade = 1 - (lifeProgress - 0.7) / 0.3;
    } else {
      lifeFade = 1.0;
    }
    
    // Pulse effect
    const pulseIntensity = (Math.sin(pulseSpeedTime + sparkle.pulsePhase) + 1) * 0.5;
    const finalSparkleOpacity = sparkle.brightness * lifeFade * (0.7 + pulseIntensity * 0.3);
    
    if (finalSparkleOpacity < 0.1) continue;
    
    const x = sparkle.x | 0;
    const y = sparkle.y | 0;
    const size = sparkle.size | 0;
    
    // Draw sparkle
    ctx.globalAlpha = finalSparkleOpacity;
    ctx.fillStyle = SPARKLE_COLOR_STR;
    ctx.fillRect(x, y, 1, 1);
    
    // Extended sparkle for larger sizes
    if (size >= 2) {
      ctx.globalAlpha = finalSparkleOpacity * 0.6;
      ctx.fillRect(x - 1, y, 1, 1);
      ctx.fillRect(x + 1, y, 1, 1);
      ctx.fillRect(x, y - 1, 1, 1);
      ctx.fillRect(x, y + 1, 1, 1);
    }
  }
  
  ctx.restore();
}

/**
 * Main water overlay rendering function to be called from the game loop
 * AAA pixel art style water surface effects
 */
export function renderWaterOverlay(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  deltaTime: number,
  worldTiles?: Map<string, any>,
  currentTime?: number
): void {
  // Update water system state
  updateWaterSystem(deltaTime, cameraX, cameraY, canvasWidth, canvasHeight, worldTiles || null);
  
  // Render with AAA pixel art style (use passed time or fallback)
  const now = currentTime ?? performance.now();
  renderWaterEffects(ctx, cameraX, cameraY, canvasWidth, canvasHeight, now);
}

/**
 * Clears all water effects (useful for scene transitions)
 */
export function clearWaterOverlay(): void {
  waterSystem.lines = [];
  waterSystem.sparkles = [];
}

/**
 * Gets current effect counts (for debugging)
 */
export function getWaterLineCount(): number {
  return waterSystem.lines.length;
}

export function getWaterSparkleCount(): number {
  return waterSystem.sparkles.length;
}

/**
 * Sets water overlay intensity (0-1)
 * Affects opacity and sparkle frequency
 */
export function setWaterOverlayIntensity(intensity: number): void {
  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  
  // Adjust existing line opacities
  for (const line of waterSystem.lines) {
    line.opacity = line.baseOpacity * clampedIntensity;
  }
  
  // Adjust sparkle brightness
  for (const sparkle of waterSystem.sparkles) {
    sparkle.brightness = (0.7 + Math.random() * 0.3) * clampedIntensity;
  }
} 