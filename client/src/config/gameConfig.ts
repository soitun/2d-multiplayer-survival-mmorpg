// client/src/config/gameConfig.ts
// ------------------------------------
// Centralizes client-side configuration values primarily used for rendering.
// These values define how the game world *looks* on the client.
// The server maintains its own authoritative values for game logic and validation,
// so modifying these client-side values does not pose a security risk.
// ------------------------------------

// Define base values first
const TILE_SIZE = 48;
export { TILE_SIZE };

// Foundation grid is 2x world tiles (96px) for larger building pieces
export const FOUNDATION_TILE_SIZE = 96; // 2x TILE_SIZE

// --- Server World & Chunk Configuration (Client-Side Assumption - TODO: Make Server-Driven) ---
// These values MUST match the server's current world generation settings.
const SERVER_WORLD_WIDTH_TILES = 800; // UPDATED: Assumed width of the server world in tiles (matches lib.rs)
const SERVER_WORLD_HEIGHT_TILES = 800; // UPDATED: Assumed height of the server world in tiles (matches lib.rs)
/** Deep sea outer ring tiles from each edge - matches server DEEP_SEA_OUTER_RING_TILES for fallback rendering */
export const DEEP_SEA_EDGE_TILES = 70;
// OPTIMIZED: Changed from 5×5 to 16×16 based on performance testing
// Results: 60-70% reduction in subscriptions, eliminated performance spikes
// See CHUNK_SIZE_TESTING.md for detailed test results
const CHUNK_SIZE_TILES = 16;         // Number of tiles along one edge of a square chunk

const MINIMAP_GRID_DIAGONAL_TILES = Math.round(SERVER_WORLD_WIDTH_TILES / 5) + 1; // Always 1/5th of server world width, plus 1

// Calculate derived values
const CHUNK_SIZE_PX = CHUNK_SIZE_TILES * TILE_SIZE; // Size of a chunk in pixels (768px = 16×48)
const WORLD_WIDTH_CHUNKS = Math.ceil(SERVER_WORLD_WIDTH_TILES / CHUNK_SIZE_TILES); // Width of the world in chunks (25)
const WORLD_HEIGHT_CHUNKS = Math.ceil(SERVER_WORLD_HEIGHT_TILES / CHUNK_SIZE_TILES); // Height of the world in chunks (25)
// --- End Server World & Chunk Config ---

// Calculate derived values for minimap
const MINIMAP_GRID_CELL_SIZE_PIXELS = Math.round((MINIMAP_GRID_DIAGONAL_TILES / Math.SQRT2) * TILE_SIZE);

export const gameConfig = {
  // Basic sprite and rendering dimensions
  spriteWidth: 48,
  spriteHeight: 48,
  // Player sprite draw size (2x base for pixel scaling)
  get playerSpriteWidth() { return this.spriteWidth * 2; },
  get playerSpriteHeight() { return this.spriteHeight * 2; },
  worldWidthTiles: SERVER_WORLD_WIDTH_TILES,
  worldHeightTiles: SERVER_WORLD_HEIGHT_TILES,
  tileSize: 48,

  // Calculated world dimensions in pixels
  get worldWidthPx() { return this.worldWidthTiles * this.tileSize; },
  get worldHeightPx() { return this.worldHeightTiles * this.tileSize; },

  // Player Movement
  playerSpeed: 320.0, // 6.67 tiles/sec - faster walking (SYNCED WITH SERVER)
  sprintMultiplier: 1.75, // 1.75x speed for sprinting (560 px/s) - meaningful boost (SYNCED WITH SERVER)
  crouchMultiplier: 0.5, // Half speed when crouching (120 px/s)
  waterSpeedPenalty: 0.5, // Speed reduction in water

  // Jumping Mechanics
  jumpHeightPx: 48,      // How high the player jumps visually
  jumpDurationMs: 500,   // How long the jump animation/arc lasts

  // Interaction
  holdInteractionDurationMs: 250, // Time to hold 'E' for default interactions
  reviveHoldDurationMs: 6000,     // Time to hold 'E' to revive a player

  // Combat
  swingCooldownMs: 500, // Default cooldown for melee swings

  // --- World & Chunk Configuration ---
  // Values below are based on server config assumptions - should ideally be server-driven.
  serverWorldWidthTiles: SERVER_WORLD_WIDTH_TILES,
  serverWorldHeightTiles: SERVER_WORLD_HEIGHT_TILES,
  chunkSizeTiles: CHUNK_SIZE_TILES,
  chunkSizePx: CHUNK_SIZE_PX,
  worldWidthChunks: WORLD_WIDTH_CHUNKS,
  worldHeightChunks: WORLD_HEIGHT_CHUNKS,
  worldWidth: SERVER_WORLD_WIDTH_TILES,
  worldHeight: SERVER_WORLD_HEIGHT_TILES,
  // --- End World & Chunk Config ---

  // --- Minimap Configuration ---
  // Target diagonal distance (in tiles) a grid cell should represent.
  // Used to dynamically calculate grid cell pixel size.
  minimapGridCellDiagonalTiles: MINIMAP_GRID_DIAGONAL_TILES, // Assign the constant

  // Calculated grid cell size in pixels based on the diagonal tile target.
  // Avoids hardcoding pixel size directly.
  minimapGridCellSizePixels: MINIMAP_GRID_CELL_SIZE_PIXELS, // Assign the calculated value

  // Foundation grid configuration
  foundationTileSize: FOUNDATION_TILE_SIZE,

  // --- Gold Standard Loop Configuration ---
  /** When true, simulation runs at fixed 60 Hz; render at display rate. */
  fixedSimulationEnabled: true,
  /** Fixed simulation step in ms (60 Hz). */
  fixedSimDtMs: 1000 / 60,
  /** Max simulation steps per render frame to prevent spiral-of-death. */
  maxSimStepsPerFrame: 4,
};

// --- Viewport Bounds ---
/** Returns world-space view bounds from camera offset and canvas size. */
export function getViewBounds(
  cameraOffsetX: number,
  cameraOffsetY: number,
  canvasWidth: number,
  canvasHeight: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: -cameraOffsetX,
    maxX: -cameraOffsetX + canvasWidth,
    minY: -cameraOffsetY,
    maxY: -cameraOffsetY + canvasHeight,
  };
}

// --- Foundation Grid Conversion Utilities ---
/**
 * Convert foundation cell coordinates to world pixel coordinates (top-left corner)
 */
export function foundationCellToWorldPixels(cellX: number, cellY: number): { x: number; y: number } {
  return {
    x: cellX * FOUNDATION_TILE_SIZE,
    y: cellY * FOUNDATION_TILE_SIZE,
  };
}

/**
 * Convert foundation cell coordinates to world pixel coordinates (center)
 */
export function foundationCellToWorldCenter(cellX: number, cellY: number): { x: number; y: number } {
  return {
    x: (cellX * FOUNDATION_TILE_SIZE) + (FOUNDATION_TILE_SIZE / 2),
    y: (cellY * FOUNDATION_TILE_SIZE) + (FOUNDATION_TILE_SIZE / 2),
  };
}

/**
 * Convert world pixel coordinates to foundation cell coordinates
 */
export function worldPixelsToFoundationCell(worldX: number, worldY: number): { cellX: number; cellY: number } {
  return {
    cellX: Math.floor(worldX / FOUNDATION_TILE_SIZE),
    cellY: Math.floor(worldY / FOUNDATION_TILE_SIZE),
  };
}

/**
 * Convert world tile coordinates (48px) to foundation cell coordinates (96px)
 */
export function worldTileToFoundationCell(tileX: number, tileY: number): { cellX: number; cellY: number } {
  return {
    cellX: Math.floor(tileX / 2),
    cellY: Math.floor(tileY / 2),
  };
}

/**
 * Convert foundation cell coordinates to world tile coordinates (48px)
 */
export function foundationCellToWorldTile(cellX: number, cellY: number): { tileX: number; tileY: number } {
  return {
    tileX: cellX * 2,
    tileY: cellY * 2,
  };
}

// --- Rendering & Interaction Constants ---
export const MOVEMENT_POSITION_THRESHOLD = 0.1; // Small threshold to account for float precision

/** Check if position moved beyond threshold (swimming/shadow movement detection). */
export function isPlayerMoving(
  lastPos: { x: number; y: number } | undefined,
  posX: number,
  posY: number,
  threshold = MOVEMENT_POSITION_THRESHOLD
): boolean {
  if (!lastPos) return false;
  const dx = Math.abs(posX - lastPos.x);
  const dy = Math.abs(posY - lastPos.y);
  return dx > threshold || dy > threshold;
}

// --- Jump Constants ---
export const JUMP_DURATION_MS = 300; // Reduced from 400ms for faster jumping
export const JUMP_HEIGHT_PX = 40; // Maximum height the player reaches

// --- Stat Thresholds (must match server/player_stats.rs) ---
export const MAX_STAT_VALUE = 100;
export const MIN_STAT_VALUE = 0;

// --- Campfire & Torch Light Constants ---
export const CAMPFIRE_LIGHT_RADIUS_BASE = 100; // Base radius for campfire light
export const CAMPFIRE_FLICKER_AMOUNT = 0.1; // Amount of flicker for campfire light
export const CAMPFIRE_LIGHT_INNER_COLOR = '#ffaa00'; // Inner color of campfire light
export const CAMPFIRE_LIGHT_OUTER_COLOR = '#ff6600'; // Outer color of campfire light

// --- Interaction Durations ---
export const HOLD_INTERACTION_DURATION_MS = 250; // 250ms for fast interactions
export const REVIVE_HOLD_DURATION_MS = 3000;      // 3 seconds hold to revive a player