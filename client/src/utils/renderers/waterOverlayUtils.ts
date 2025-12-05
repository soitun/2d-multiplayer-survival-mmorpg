import { TILE_SIZE } from '../../config/gameConfig';

/**
 * Water Overlay Rendering Utilities
 * 
 * AAA pixel art studio style water surface effects with crisp, deliberate lines,
 * subtle color variations, and sparkle highlights. Optimized for high performance.
 */

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
  LINE_THICKNESS: 1, // Crisp 1px lines for pixel art
  
  // Growth animation - smooth and deliberate
  MIN_GROWTH_SPEED: 2.0,
  MAX_GROWTH_SPEED: 3.5,
  
  // Line lifetime - longer for a calmer feel
  MIN_LIFETIME: 2.5,
  MAX_LIFETIME: 5.0,
  FADE_DURATION: 0.8,
  
  // Wave movement - subtle and organic
  WAVE_AMPLITUDE: 1.0, // Subtle vertical movement
  WAVE_FREQUENCY: 0.0006, // Slow, deliberate waves
  
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
  GLOBAL_WAVE_SPEED: 0.0006,
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

/**
 * Checks if a world position is on a water tile (Sea type) - same logic as placement system
 */
function isPositionOnWaterTile(worldTiles: Map<string, any>, worldX: number, worldY: number): boolean {
  if (!worldTiles || worldTiles.size === 0) return false;
  
  const { tileX, tileY } = worldPosToTileCoords(worldX, worldY);
  
  // Check all world tiles to find the one at this position (same as placement system)
  for (const tile of worldTiles.values()) {
    if (tile.worldX === tileX && tile.worldY === tileY) {
      // Found the tile at this position, check if it's water
      return tile.tileType && tile.tileType.tag === 'Sea';
    }
  }
  
  // No tile found at this position, assume it's not water
  return false;
}

/**
 * Get all water tiles in the visible camera area for efficient spawning
 */
function getVisibleWaterTiles(
  worldTiles: Map<string, any>,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number
): Array<{x: number, y: number}> {
  const waterTiles: Array<{x: number, y: number}> = [];
  
  // Calculate visible tile bounds
  const leftBound = cameraX - canvasWidth / 2 - WATER_CONFIG.SPAWN_MARGIN;
  const rightBound = cameraX + canvasWidth / 2 + WATER_CONFIG.SPAWN_MARGIN;
  const topBound = cameraY - canvasHeight / 2 - WATER_CONFIG.SPAWN_MARGIN;
  const bottomBound = cameraY + canvasHeight / 2 + WATER_CONFIG.SPAWN_MARGIN;
  
  // Check all tiles in the area
  for (const tile of worldTiles.values()) {
    if (tile.tileType && tile.tileType.tag === 'Sea') {
      // Convert tile coordinates to world pixels (center of tile)
      const worldX = tile.worldX * TILE_SIZE + TILE_SIZE / 2;
      const worldY = tile.worldY * TILE_SIZE + TILE_SIZE / 2;
      
      // Check if tile is in visible area
      if (worldX >= leftBound && worldX <= rightBound && 
          worldY >= topBound && worldY <= bottomBound) {
        waterTiles.push({x: worldX, y: worldY});
      }
    }
  }
  
  return waterTiles;
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
  
  const growthSpeed = WATER_CONFIG.MIN_GROWTH_SPEED + 
    Math.random() * (WATER_CONFIG.MAX_GROWTH_SPEED - WATER_CONFIG.MIN_GROWTH_SPEED);
  
  const lifetime = WATER_CONFIG.MIN_LIFETIME + 
    Math.random() * (WATER_CONFIG.MAX_LIFETIME - WATER_CONFIG.MIN_LIFETIME);
  
  return {
    startX,
    y,
    targetLength,
    currentLength: 0,
    opacity: baseOpacity,
    thickness: WATER_CONFIG.LINE_THICKNESS,
    growthSpeed,
    growthPhase: 0,
    lifetime,
    age: 0,
    baseOpacity,
    isGrowing: true,
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
  
  // Update lines (iterate backwards for safe removal)
  for (let i = waterSystem.lines.length - 1; i >= 0; i--) {
    const line = waterSystem.lines[i];
    line.age += deltaTime;
    
    // Growth animation with smooth ease-out
    if (line.isGrowing) {
      line.growthPhase += line.growthSpeed * deltaTime;
      if (line.growthPhase >= 1.0) {
        line.growthPhase = 1.0;
        line.isGrowing = false;
      }
      // Cubic ease-out for smooth appearance
      const t = line.growthPhase;
      const easedGrowth = 1 - (1 - t) * (1 - t) * (1 - t);
      line.currentLength = line.targetLength * easedGrowth;
    }
    
    // Fade out at end of lifetime
    if (line.age > line.lifetime) {
      const fadeProgress = (line.age - line.lifetime) / WATER_CONFIG.FADE_DURATION;
      if (fadeProgress >= 1.0) {
        waterSystem.lines.splice(i, 1);
        continue;
      }
      // Smooth fade with cubic ease
      const easedFade = fadeProgress * fadeProgress * (3.0 - 2.0 * fadeProgress);
      line.opacity = line.baseOpacity * (1.0 - easedFade);
    }
    
    // Cull off-screen lines
    if (line.startX + line.currentLength < leftBound || 
        line.startX > rightBound ||
        line.y < topBound || line.y > bottomBound) {
      waterSystem.lines.splice(i, 1);
    }
  }
  
  // Update sparkles
  for (let i = waterSystem.sparkles.length - 1; i >= 0; i--) {
    const sparkle = waterSystem.sparkles[i];
    sparkle.age += deltaTime;
    
    if (sparkle.age >= sparkle.lifetime) {
      waterSystem.sparkles.splice(i, 1);
      continue;
    }
    
    // Cull off-screen sparkles
    if (sparkle.x < leftBound || sparkle.x > rightBound ||
        sparkle.y < topBound || sparkle.y > bottomBound) {
      waterSystem.sparkles.splice(i, 1);
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

/**
 * Renders water effects with AAA pixel art style - crisp lines and sparkles
 */
function renderWaterEffects(
  ctx: CanvasRenderingContext2D,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  if (waterSystem.lines.length === 0 && waterSystem.sparkles.length === 0) return;
  
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  
  const currentTime = Date.now();
  
  // Global breathing effect for subtle life
  const breathingFactor = (Math.sin(currentTime * WATER_CONFIG.BREATHING_SPEED) + 1) * 0.5;
  
  // Camera bounds for rendering - expanded margin to keep effects visible longer
  const renderMargin = WATER_CONFIG.RENDER_MARGIN;
  const cameraLeft = cameraX - canvasWidth - renderMargin;
  const cameraRight = cameraX + canvasWidth + renderMargin;
  const cameraTop = cameraY - canvasHeight - renderMargin;
  const cameraBottom = cameraY + canvasHeight + renderMargin;
  
  // === RENDER LINES ===
  // Set up for crisp pixel art lines
  ctx.lineCap = 'butt'; // Crisp ends for pixel art
  ctx.lineJoin = 'miter';
  
  for (const line of waterSystem.lines) {
    // Quick culling check
    if (line.startX + line.currentLength < cameraLeft || 
        line.startX > cameraRight ||
        line.y < cameraTop || line.y > cameraBottom) {
      continue;
    }
    
    // Verify still on water
    const midX = line.startX + line.currentLength * 0.5;
    if (waterSystem.worldTiles && !isPositionOnWaterTile(waterSystem.worldTiles, midX, line.y)) {
      continue;
    }
    
    // Calculate wave offset - subtle and smooth
    const waveOffset = Math.sin(
      currentTime * WATER_CONFIG.WAVE_FREQUENCY + 
      line.wavePhase + 
      line.startX * 0.005
    ) * WATER_CONFIG.WAVE_AMPLITUDE;
    
    // Calculate final opacity with breathing
    const breathingMod = 0.85 + breathingFactor * 0.15;
    const finalOpacity = line.opacity * breathingMod;
    
    // Get color for this line type
    const color = getLineColor(line, breathingFactor);
    
    // Calculate line position with wave
    const y = line.y + waveOffset;
    const startX = line.startX;
    const endX = line.startX + line.currentLength;
    
    // For pixel art: Draw main crisp line
    ctx.globalAlpha = finalOpacity;
    ctx.strokeStyle = `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
    ctx.lineWidth = line.thickness;
    
    ctx.beginPath();
    ctx.moveTo(Math.round(startX), Math.round(y));
    ctx.lineTo(Math.round(endX), Math.round(y));
    ctx.stroke();
    
    // Add subtle highlight above for depth (only for highlight type)
    if (line.visualType === 'highlight' && finalOpacity > 0.5) {
      ctx.globalAlpha = finalOpacity * 0.3;
      ctx.strokeStyle = `rgb(${Math.min(255, color.r + 40)}, ${Math.min(255, color.g + 20)}, ${Math.min(255, color.b + 10)})`;
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(Math.round(startX + 1), Math.round(y - 1));
      ctx.lineTo(Math.round(endX - 1), Math.round(y - 1));
      ctx.stroke();
    }
  }
  
  // === RENDER SPARKLES ===
  for (const sparkle of waterSystem.sparkles) {
    // Quick culling
    if (sparkle.x < cameraLeft || sparkle.x > cameraRight ||
        sparkle.y < cameraTop || sparkle.y > cameraBottom) {
      continue;
    }
    
    // Verify on water
    if (waterSystem.worldTiles && !isPositionOnWaterTile(waterSystem.worldTiles, sparkle.x, sparkle.y)) {
      continue;
    }
    
    // Calculate sparkle opacity with pulse and lifetime
    const lifeProgress = sparkle.age / sparkle.lifetime;
    // Quick fade in, hold, quick fade out
    let lifeFade: number;
    if (lifeProgress < 0.15) {
      lifeFade = lifeProgress / 0.15; // Fade in
    } else if (lifeProgress > 0.7) {
      lifeFade = 1 - (lifeProgress - 0.7) / 0.3; // Fade out
    } else {
      lifeFade = 1.0; // Full brightness
    }
    
    // Pulse effect
    const pulseIntensity = (Math.sin(currentTime * WATER_CONFIG.SPARKLE_PULSE_SPEED + sparkle.pulsePhase) + 1) * 0.5;
    const finalSparkleOpacity = sparkle.brightness * lifeFade * (0.7 + pulseIntensity * 0.3);
    
    if (finalSparkleOpacity < 0.1) continue;
    
    const { SPARKLE_COLOR } = WATER_CONFIG;
    const x = Math.round(sparkle.x);
    const y = Math.round(sparkle.y);
    const size = Math.round(sparkle.size);
    
    // Draw sparkle as crisp pixel art cross/diamond
    ctx.globalAlpha = finalSparkleOpacity;
    ctx.fillStyle = `rgb(${SPARKLE_COLOR.r}, ${SPARKLE_COLOR.g}, ${SPARKLE_COLOR.b})`;
    
    // Center pixel (always)
    ctx.fillRect(x, y, 1, 1);
    
    // Extended sparkle for larger sizes
    if (size >= 2) {
      ctx.globalAlpha = finalSparkleOpacity * 0.6;
      ctx.fillRect(x - 1, y, 1, 1); // Left
      ctx.fillRect(x + 1, y, 1, 1); // Right
      ctx.fillRect(x, y - 1, 1, 1); // Top
      ctx.fillRect(x, y + 1, 1, 1); // Bottom
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
  worldTiles?: Map<string, any>
): void {
  // Update water system state
  updateWaterSystem(deltaTime, cameraX, cameraY, canvasWidth, canvasHeight, worldTiles || null);
  
  // Render with AAA pixel art style
  renderWaterEffects(ctx, cameraX, cameraY, canvasWidth, canvasHeight);
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