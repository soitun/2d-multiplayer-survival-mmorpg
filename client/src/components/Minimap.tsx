import { gameConfig } from '../config/gameConfig';
import { calculateChunkIndex } from '../utils/chunkUtils';
import { Player as SpacetimeDBPlayer, Tree, Stone as SpacetimeDBStone, Barrel as SpacetimeDBBarrel, PlayerPin, SleepingBag as SpacetimeDBSleepingBag, Campfire as SpacetimeDBCampfire, PlayerCorpse as SpacetimeDBCorpse, WorldState, DeathMarker as SpacetimeDBDeathMarker, MinimapCache, RuneStone as SpacetimeDBRuneStone, ChunkWeather, AlkStation as SpacetimeDBAlkStation, LivingCoral as SpacetimeDBLivingCoral, BeaconDropEvent as SpacetimeDBBeaconDropEvent } from '../generated';
import { useRef, useCallback } from 'react';

// --- Calculate Proportional Dimensions ---
const worldPixelWidth = gameConfig.worldWidth * gameConfig.tileSize;
const worldPixelHeight = gameConfig.worldHeight * gameConfig.tileSize;
const worldAspectRatio = worldPixelHeight / worldPixelWidth;

const BASE_MINIMAP_WIDTH = 750; // Base width for calculation (wider to accommodate more tabs/content)
const calculatedMinimapHeight = BASE_MINIMAP_WIDTH * worldAspectRatio;

// Minimap constants - UPDATED TO CYBERPUNK THEME
const MINIMAP_WIDTH = BASE_MINIMAP_WIDTH;
const MINIMAP_HEIGHT = Math.round(calculatedMinimapHeight); // Use calculated height

// Cyberpunk color scheme
const MINIMAP_BG_COLOR_NORMAL = 'rgba(15, 23, 35, 0.95)'; // Dark blue-black
const MINIMAP_BG_COLOR_HOVER = 'rgba(20, 30, 45, 0.98)'; // Slightly lighter on hover
const MINIMAP_BORDER_COLOR = '#00d4ff'; // Bright cyan border
const MINIMAP_BORDER_WIDTH = 2;
const MINIMAP_INNER_BORDER_COLOR = '#7c3aed'; // Purple inner border
const MINIMAP_INNER_BORDER_WIDTH = 1;
const MINIMAP_GLOW_COLOR = '#00d4ff'; // Cyan glow effect

// Tab and X button functionality now handled by React components
const PLAYER_DOT_SIZE = 3;
const LOCAL_PLAYER_DOT_COLOR = '#00FF88'; // Bright cyan-green for maximum visibility
const LOCAL_PLAYER_PULSE_COLOR_1 = '#00FFFF'; // Cyan pulse ring
const LOCAL_PLAYER_PULSE_COLOR_2 = '#00FF88'; // Green pulse ring
const LOCAL_PLAYER_ICON_SIZE = 18; // Larger than other players
// Player icon constants - Updated for directional triangular icons
// PvP THREAT INDICATORS - Players are PRIMARY focus
const PLAYER_ICON_SIZE = 14; // LARGER than resources - players are the main threat
const PLAYER_ICON_OUTLINE_COLOR = '#000000'; // Pure black outline for maximum contrast
const PLAYER_ICON_OUTLINE_WIDTH = 2.5; // Thick outline for instant recognition
const REMOTE_PLAYER_DOT_COLOR = '#FF3366'; // BRIGHT PINK/RED - ENEMY THREAT COLOR
const REMOTE_PLAYER_GLOW = '0 0 10px #FF3366'; // Pulsing glow for threats
// Matronage member color (same matronage = friendly)
const MATRONAGE_MEMBER_COLOR = '#00AAFF'; // Bright blue for same-matronage players
// Enemy color (different matronage or no matronage = enemy)
const ENEMY_PLAYER_COLOR = '#FF3366'; // Bright red for enemy players
// Torch visibility radius at night (torches are beacons visible from far away)
const TORCH_VISIBILITY_RADIUS = 3500; // 3500 pixels - torches visible from far at night
const TORCH_VISIBILITY_RADIUS_SQ = TORCH_VISIBILITY_RADIUS * TORCH_VISIBILITY_RADIUS;
// Resource colors - TACTICAL VISIBILITY (cover, landmarks, loot)
// PvP Note: Resources are CRITICAL for tactical awareness - they're cover, ambush points, and landmarks
const TREE_DOT_COLOR = 'rgba(55, 255, 122, 0.6)'; // Medium-bright green - COVER and CONCEALMENT
const ROCK_DOT_COLOR = 'rgba(187, 187, 255, 0.6)'; // Medium-bright blue - HARD COVER landmarks
const BARREL_DOT_COLOR = 'rgba(255, 187, 68, 0.75)'; // Bright yellow-orange - LOOT and OBJECTIVES
const LIVING_CORAL_DOT_COLOR = 'rgba(255, 127, 200, 0.75)'; // Pink/coral color - UNDERWATER RESOURCES
// Rune stone colors - matching their rune types
const RUNE_STONE_GREEN_COLOR = '#9dff00'; // Bright cyberpunk yellow-green for agrarian rune stones
const RUNE_STONE_RED_COLOR = '#ff4400'; // Vibrant orange-red for production rune stones
const RUNE_STONE_BLUE_COLOR = '#8b5cf6'; // Bright blue-purple cyberpunk violet for memory shard rune stones
const RUNE_STONE_ICON_SIZE = 12; // Twice as large for better visibility on minimap

// ALK Station constants - CRITICAL SUPPLY/OBJECTIVE MARKERS
const ALK_STATION_ICON_SIZE = 18; // Large for high visibility as major objective points
const ALK_CENTRAL_COLOR = '#00ff88'; // Bright cyan-green for central compound (no fee)
const ALK_SUBSTATION_COLOR = '#ffaa00'; // Bright amber for substations (with fee)
const ALK_STATION_GLOW_COLOR = '#00ff88'; // Matching glow
const ALK_STATION_OUTLINE_COLOR = '#000000'; // Black outline for contrast
const ALK_STATION_OUTLINE_WIDTH = 2;

// Shipwreck constants - EXPLORATION LANDMARKS
const SHIPWRECK_ICON_SIZE = 20; // Large for landmark visibility
const SHIPWRECK_COLOR = '#D2691E'; // Vibrant rusty orange-brown for shipwrecks (more visible)
const SHIPWRECK_GLOW_COLOR = '#FF8C42'; // Bright orange glow for high visibility
const SHIPWRECK_OUTLINE_COLOR = '#000000'; // Black outline for contrast (matching other icons)
const SHIPWRECK_OUTLINE_WIDTH = 2.5; // Thicker outline like player icons
const SHIPWRECK_INNER_COLOR = '#8B4513'; // Darker brown for inner detail

// Large Quarry constants - RESOURCE LANDMARKS (Stone/Sulfur/Metal Quarry)
const QUARRY_STONE_COLOR = '#A0A0A0'; // Gray for stone quarry
const QUARRY_SULFUR_COLOR = '#FFD700'; // Gold/yellow for sulfur quarry
const QUARRY_METAL_COLOR = '#B87333'; // Copper/bronze for metal quarry
const QUARRY_GLOW_COLOR = '#FFFFFF'; // White glow for visibility

// Whale Bone Graveyard constants - EXPLORATION/SAFE ZONE LANDMARK
const WHALE_BONE_GRAVEYARD_COLOR = '#E8E8E8'; // Pale bone white/ivory for ancient bones
const WHALE_BONE_GRAVEYARD_GLOW_COLOR = '#B8B8B8'; // Pale gray glow (eerie, ancient)

// Hunting Village constants - EXPLORATION/SAFE ZONE LANDMARK (boreal forest)
const HUNTING_VILLAGE_COLOR = '#8B4513'; // Saddle brown for rustic wood buildings
const HUNTING_VILLAGE_GLOW_COLOR = '#228B22'; // Forest green glow (forest biome)

// Crashed Research Drone constants - DANGEROUS CRASH SITE (tundra)
const CRASHED_DRONE_COLOR = '#00FFFF'; // Bright cyan for tech debris
const CRASHED_DRONE_GLOW_COLOR = '#FF4500'; // Orange-red glow (dangerous/explosive)

// Memory Beacon Event constants - SERVER EVENT MARKERS (airdrop-style)
const BEACON_EVENT_ICON_SIZE = 24; // Large for high visibility as major event
const BEACON_EVENT_COLOR = '#FF00FF'; // Bright magenta/purple for beacon events
const BEACON_EVENT_GLOW_COLOR = '#FF66FF'; // Lighter magenta glow
const BEACON_EVENT_OUTLINE_COLOR = '#000000'; // Black outline for contrast
const BEACON_EVENT_OUTLINE_WIDTH = 2.5;

const RESOURCE_ICON_OUTLINE_COLOR = 'rgba(0, 0, 0, 0.8)'; // Strong black outline for clarity
const RESOURCE_ICON_OUTLINE_WIDTH = 1.5; // Thicker outline for tactical visibility
const CAMPFIRE_DOT_COLOR = '#FF6600'; // Bright orange for campfires and lit players
const CAMPFIRE_GLOW_COLOR = '#FF8800'; // Orange glow effect
const CAMPFIRE_ICON_SIZE = 8; // Larger size for better visibility
const SLEEPING_BAG_DOT_COLOR = '#A0522D'; // Sienna (brownish)
// Water tile rendering on minimap
const WATER_TILE_COLOR = '#1E90FF'; // Bright blue for water features
const BEACH_TILE_COLOR = '#F4A460'; // Sandy beach color
const DIRT_ROAD_COLOR = '#8B7355'; // Brown for dirt roads
const DIRT_COLOR = '#8B4513'; // Slightly lighter brown for regular dirt
const ENTITY_DOT_SIZE = 3; // Larger dot size for tactical visibility (was 2)
const LIT_ENTITY_DOT_SIZE = 4; // Larger size for lit campfires and players with torches
const OWNED_BAG_DOT_SIZE = 24; // Make owned bags larger
const REGULAR_BAG_ICON_SIZE = 24; // Increased size considerably
const REGULAR_BAG_BORDER_WIDTH = 2;
const REGULAR_BAG_BORDER_COLOR = '#FFFFFF'; // White border for regular bags
const REGULAR_BAG_BG_COLOR = 'rgba(0, 0, 0, 0.3)'; // Slightly transparent black bg
// Unused constants removed
const MINIMAP_WORLD_BG_COLOR = 'rgba(52, 88, 52, 0.2)';
const OUT_OF_BOUNDS_COLOR = 'rgba(20, 35, 20, 0.2)'; // Darker shade for outside world bounds

// Updated pin styling - Simple classic design
const PIN_COLOR = '#FFD700'; // Bright yellow for pin body
const PIN_BORDER_COLOR = '#000000'; // Black border
const PIN_SIZE = 24; // Standard size
const PIN_BORDER_WIDTH = 1; // Thin border width

// Grid Constants - Cyberpunk SOVA style with enhanced readability
const GRID_LINE_COLOR = 'rgba(0, 212, 255, 0.08)'; // Very subtle cyan grid (was 0.15)
const GRID_LINE_HIGHLIGHT_COLOR = 'rgba(0, 212, 255, 0.20)'; // Subtle cyan for major grid lines (was 0.4)
const GRID_TEXT_COLOR = 'rgba(0, 255, 255, 1.0)'; // FULL BRIGHTNESS cyan for instant readability
const GRID_TEXT_FONT = 'bold 13px "Courier New", monospace'; // LARGER and BOLD for combat readability
const GRID_TEXT_SHADOW = '0 0 8px rgba(0, 255, 255, 1.0), 0 0 3px #000000'; // Stronger glow + black outline
const GRID_TEXT_BG_COLOR = 'rgba(0, 0, 0, 0.85)'; // Darker background for better contrast
const GRID_TEXT_BG_PADDING = 3; // More padding for readability

// Death Marker Constants (New)
const DEATH_MARKER_ICON_SIZE = 24;
const DEATH_MARKER_BORDER_WIDTH = 2;
const DEATH_MARKER_BORDER_COLOR = '#FFFFFF'; // White border, same as regular bags
const DEATH_MARKER_BG_COLOR = 'rgba(139, 0, 0, 0.5)'; // Dark red, semi-transparent

// Opacity animation constants
const OPACITY_TRANSITION_SPEED = 0.08; // Higher = faster transition
const OPACITY_HIDDEN = 0.5; // 30% opacity when not hovered
const OPACITY_VISIBLE = 1.0; // 100% opacity when hovered

// Global ref to track animated opacity (shared across all minimap instances)
let animatedOpacity = OPACITY_HIDDEN;
let targetOpacity = OPACITY_HIDDEN;
let animationFrameId: number | null = null;

// Function to smoothly animate opacity
const animateOpacity = () => {
  const diff = targetOpacity - animatedOpacity;
  if (Math.abs(diff) > 0.01) {
    animatedOpacity += diff * OPACITY_TRANSITION_SPEED;
    animationFrameId = requestAnimationFrame(animateOpacity);
  } else {
    animatedOpacity = targetOpacity;
    animationFrameId = null;
  }
};

// Function to set target opacity and start animation if needed
const setTargetOpacity = (newTarget: number) => {
  targetOpacity = newTarget;
  if (animationFrameId === null && Math.abs(targetOpacity - animatedOpacity) > 0.01) {
    animateOpacity();
  }
};

// Add helper to check if it's night/evening
function isNightTimeOfDay(tag: string): boolean {
  return (
    tag === 'Dusk' ||
    tag === 'TwilightEvening' ||
    tag === 'Night' ||
    tag === 'Midnight'
  );
}

// Helper function to draw a directional circular player icon with chevron
function drawPlayerIcon(
  ctx: CanvasRenderingContext2D, 
  x: number, 
  y: number, 
  rotation: number, 
  fillColor: string, 
  size: number = PLAYER_ICON_SIZE
) {
  ctx.save();
  
  const radius = size / 2;
  
  // Draw the circle outline first
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = PLAYER_ICON_OUTLINE_COLOR;
  ctx.lineWidth = PLAYER_ICON_OUTLINE_WIDTH;
  ctx.stroke();
  
  // Fill the circle with player color
  ctx.fillStyle = fillColor;
  ctx.fill();
  
  // Now draw the ">" chevron inside the circle
  ctx.translate(x, y);
  ctx.rotate(rotation);
  
  // Chevron dimensions (scaled to fit inside circle nicely)
  const chevronSize = radius * 0.7; // Size of chevron arms
  const chevronThickness = size * 0.08; // Line thickness for chevron
  
  // Draw chevron ">" pointing right (will be rotated)
  ctx.beginPath();
  ctx.moveTo(-chevronSize * 0.4, -chevronSize * 0.6); // Top-left of chevron
  ctx.lineTo(chevronSize * 0.4, 0);                    // Point (right side)
  ctx.lineTo(-chevronSize * 0.4, chevronSize * 0.6);   // Bottom-left of chevron
  
  // Stroke the chevron with contrasting color
  ctx.strokeStyle = PLAYER_ICON_OUTLINE_COLOR;
  ctx.lineWidth = chevronThickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  
  ctx.restore();
}

// Props required for drawing the minimap
interface MinimapProps {
  ctx: CanvasRenderingContext2D;
  players: Map<string, SpacetimeDBPlayer>; // Map of player identities to player data
  trees: Map<string, Tree>; // Map of tree identities/keys to tree data
  stones: Map<string, SpacetimeDBStone>; // Add stones
  runeStones: Map<string, SpacetimeDBRuneStone>; // Add rune stones
  barrels: Map<string, SpacetimeDBBarrel>; // Add barrels
  campfires: Map<string, SpacetimeDBCampfire>; // Add campfires
  sleepingBags: Map<string, SpacetimeDBSleepingBag>; // Add sleeping bags
  alkStations?: Map<string, SpacetimeDBAlkStation>; // ALK delivery stations
  monumentParts?: Map<string, any>; // Unified monument parts (all monument types)
  largeQuarries?: Map<string, any>; // Large quarry locations with types for labels (Stone/Sulfur/Metal Quarry)
  livingCorals?: Map<string, SpacetimeDBLivingCoral>; // Living coral reefs (underwater harvestable resources)

  localPlayer: SpacetimeDBPlayer | undefined; // Extracted local player
  localPlayerId?: string;
  viewCenterOffset: { x: number; y: number }; // pan offset
  playerPin: PlayerPin | null; // Player pin
  canvasWidth: number; // Canvas width for calculating minimap position
  canvasHeight: number; // Canvas height for calculating minimap position
  isMouseOverMinimap: boolean; // Whether the mouse is over the minimap
  zoomLevel: number; // Zoom level for minimap
  minimapCache: MinimapCache | null; // Cached minimap data
  // Add new props with defaults
  isDeathScreen?: boolean; // Whether this is being rendered in the death screen
  ownedSleepingBagIds?: Set<number>; // IDs of sleeping bags owned by the player
  onSelectSleepingBag?: (bagId: number) => void; // Callback when a sleeping bag is selected
  sleepingBagImage?: HTMLImageElement | null; // Sleeping bag image for rendering
  // Add new death marker props
  localPlayerDeathMarker?: SpacetimeDBDeathMarker | null; // Death marker for the local player
  deathMarkerImage?: HTMLImageElement | null; // Death marker image for rendering
  worldState?: WorldState | null; // World state for various info
  // Add pin marker image prop
  pinMarkerImage?: HTMLImageElement | null; // Pin marker image for rendering
  // Add campfire and torch image props
  campfireWarmthImage?: HTMLImageElement | null; // Warmth image for campfires
  torchOnImage?: HTMLImageElement | null; // Torch image for torch-lit players
  // Tab functionality now handled by React components
  showGridCoordinates?: boolean; // Whether to show grid coordinate labels (A1, B2, etc.)
  // Weather overlay props
  showWeatherOverlay?: boolean; // Whether to show the weather overlay
  chunkWeatherData?: Map<number, ChunkWeather>; // Map of chunk indices to weather data
  // Show names prop
  showNames?: boolean; // Whether to show names for shipwrecks and other entities
  // Matronage system props for player visibility
  matronageMembers?: Map<string, any>; // Matronage membership tracking
  matronages?: Map<string, any>; // Matronage organizations
  // Memory Beacon server events (airdrop-style)
  beaconDropEvents?: Map<string, SpacetimeDBBeaconDropEvent>; // Active beacon drop events
}

// Bright, clear terrain colors for easy readability
// Significantly brightened for better visibility and differentiation
function getTerrainColor(colorValue: number): [number, number, number] {
  switch (colorValue) {
    case 0:   // Sea - Bright blue, easily recognizable as water
      return [30, 80, 140]; // Rich blue (much brighter)
    case 48:  // Asphalt - Dark gray for paved compounds
      return [60, 60, 60]; // Dark gray
    case 64:  // Beach - Sandy beige, distinct from water and land
      return [180, 170, 140]; // Light sandy beige (very bright)
    case 96:  // Sand - Warm sand color
      return [200, 180, 130]; // Warm light sand (distinct from beach)
    case 100: // Forest - Darker green for dense forest
      return [40, 90, 50]; // Dark forest green
    case 128: // Grass - Vibrant green, clearly vegetation
      return [60, 120, 70]; // Medium-bright green (much more visible)
    case 140: // Tundra - Pale mossy green-gray for arctic grassland
      return [120, 140, 100]; // Pale greenish-gray
    case 180: // Alpine - Light gray for rocky high-altitude terrain
      return [150, 150, 160]; // Light blue-gray
    case 192: // Dirt - Earthy brown
      return [110, 85, 65]; // Medium brown (clearly dirt)
    case 224: // DirtRoad - Darker brown for roads
      return [80, 65, 50]; // Dark brown (still visible, distinct from dirt)
    case 255: // HotSpringWater - BRIGHT WHITE/CYAN for maximum visibility!
      return [255, 255, 200]; // Bright white-cyan (highly visible)
    default:  // Fallback
      return [70, 100, 75]; // Medium green-grey
  }
}

// AAA Pixel Art Studio Style: Efficient region-based rendering
// Instead of drawing every pixel, we downscale and draw filled regions with clean edges

// Get terrain type from color value (simplified classification)
function getTerrainType(colorValue: number): number {
  // Group similar terrain types together for region detection
  if (colorValue === 0) return 0; // Sea
  if (colorValue === 48) return 7; // Asphalt - paved compounds (distinct)
  if (colorValue === 64) return 1; // Beach
  if (colorValue === 96) return 2; // Sand
  if (colorValue === 100) return 8; // Forest - dense vegetation (distinct)
  if (colorValue === 140) return 9; // Tundra - arctic grassland (distinct)
  if (colorValue === 180) return 10; // Alpine - rocky terrain (distinct)
  if (colorValue === 255) return 6; // HotSpringWater - separate type for visibility
  if (colorValue >= 128 && colorValue < 192) return 3; // Grass
  if (colorValue >= 192 && colorValue < 224) return 4; // Dirt
  return 5; // DirtRoad/other
}

// Render regions as filled rectangles with clean edges (AAA Pixel Art Style)
// Much more efficient than pixel-by-pixel rendering
function renderRegionsWithEdges(
  ctx: CanvasRenderingContext2D,
  cacheData: Uint8Array,
  width: number,
  height: number,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
  scaleDown: number = 4 // Downscale factor (4 = 1/4 resolution - optimized for performance)
) {
  ctx.save();
  
  // Scale factors
  const scaleX = targetWidth / width;
  const scaleY = targetHeight / height;
  const downWidth = Math.ceil(width / scaleDown);
  const downHeight = Math.ceil(height / scaleDown);
  const cellSizeX = scaleDown * scaleX;
  const cellSizeY = scaleDown * scaleY;
  
  // Helper to get terrain type at downscaled position
  const getTerrainAt = (x: number, y: number): number => {
    const srcX = Math.min(Math.floor(x * scaleDown), width - 1);
    const srcY = Math.min(Math.floor(y * scaleDown), height - 1);
    const colorValue = cacheData[srcY * width + srcX];
    return getTerrainType(colorValue);
  };
  
  // First pass: Draw filled regions (downscaled cells)
  for (let y = 0; y < downHeight; y++) {
    for (let x = 0; x < downWidth; x++) {
      const terrainType = getTerrainAt(x, y);
      const srcX = Math.min(Math.floor(x * scaleDown), width - 1);
      const srcY = Math.min(Math.floor(y * scaleDown), height - 1);
      const colorValue = cacheData[srcY * width + srcX];
      const [r, g, b] = getTerrainColor(colorValue);
      
      // Draw filled cell
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(
        targetX + x * cellSizeX,
        targetY + y * cellSizeY,
        cellSizeX,
        cellSizeY
      );
    }
  }
  
  // Second pass: Draw clean edges between different terrain types (OPTIMIZED - batched)
  // Subtle edges for definition without overwhelming the terrain colors
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'; // Very subtle dark edges instead of bright cyan
  ctx.lineWidth = 0.5; // Thin edges for subtle definition
  ctx.shadowColor = 'transparent'; // No glow effect
  ctx.shadowBlur = 0;
  
  // Batch all edges into a single path for much better performance
  ctx.beginPath();
  
  for (let y = 0; y < downHeight; y++) {
    for (let x = 0; x < downWidth; x++) {
      const currentTerrain = getTerrainAt(x, y);
      const screenX = targetX + x * cellSizeX;
      const screenY = targetY + y * cellSizeY;
      
      // Check neighbors and add edges to path where terrain changes
      // Top edge
      if (y > 0 && getTerrainAt(x, y - 1) !== currentTerrain) {
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX + cellSizeX, screenY);
      }
      
      // Left edge
      if (x > 0 && getTerrainAt(x - 1, y) !== currentTerrain) {
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX, screenY + cellSizeY);
      }
      
      // Right edge (only draw if at boundary or next cell is different)
      if (x < downWidth - 1 && getTerrainAt(x + 1, y) !== currentTerrain) {
        ctx.moveTo(screenX + cellSizeX, screenY);
        ctx.lineTo(screenX + cellSizeX, screenY + cellSizeY);
      }
      
      // Bottom edge (only draw if at boundary or next cell is different)
      if (y < downHeight - 1 && getTerrainAt(x, y + 1) !== currentTerrain) {
        ctx.moveTo(screenX, screenY + cellSizeY);
        ctx.lineTo(screenX + cellSizeX, screenY + cellSizeY);
      }
    }
  }
  
  // Single stroke call for all edges (much faster than individual strokes)
  ctx.stroke();
  
  // Reset shadow for other drawing operations
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  
  ctx.restore();
}

// Cyberpunk edge detection for SOVA-style outlines (kept for fallback)
function applyEdgeDetection(
  imageData: ImageData,
  width: number,
  height: number
): ImageData {
  const output = new ImageData(width, height);
  const data = imageData.data;
  const outData = output.data;
  
  // Sobel edge detection kernel
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      
      // Apply Sobel operator
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          
          gx += brightness * sobelX[kernelIdx];
          gy += brightness * sobelY[kernelIdx];
        }
      }
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const edgeStrength = Math.min(255, magnitude);
      
      const idx = (y * width + x) * 4;
      
      // Copy original color
      outData[idx] = data[idx];
      outData[idx + 1] = data[idx + 1];
      outData[idx + 2] = data[idx + 2];
      outData[idx + 3] = 255;
      
      // Add cyan edge highlight for strong edges
      if (edgeStrength > 30) {
        const edgeFactor = edgeStrength / 255;
        outData[idx] = Math.min(255, outData[idx] + 0 * edgeFactor * 100); // R
        outData[idx + 1] = Math.min(255, outData[idx + 1] + 212 * edgeFactor * 0.5); // G (cyan)
        outData[idx + 2] = Math.min(255, outData[idx + 2] + 255 * edgeFactor * 0.5); // B (cyan)
      }
    }
  }
  
  return output;
}

// Apply subtle scan line effect (optimized - fewer lines, batched drawing)
function applyScanLines(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  ctx.save();
  ctx.globalAlpha = 0.02; // Much more subtle (was 0.05)
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 1;
  
  // Batch all scan lines into a single path for better performance
  ctx.beginPath();
  // Horizontal scan lines - much less frequent (every 12px instead of 6px)
  for (let i = 0; i < height; i += 12) {
    ctx.moveTo(x, y + i);
    ctx.lineTo(x + width, y + i);
  }
  ctx.stroke(); // Single stroke call for all lines
  
  ctx.restore();
}

// Get weather color and opacity based on weather type and intensity
function getWeatherOverlayColor(weatherTag: string, rainIntensity: number): { color: string; opacity: number } {
  switch (weatherTag) {
    case 'Clear':
      return { color: '#87CEEB', opacity: 0 }; // Sky blue, fully transparent
    case 'LightRain':
      return { color: '#4682B4', opacity: 0.4 + rainIntensity * 0.2 }; // Steel blue, MORE VISIBLE
    case 'ModerateRain':
      return { color: '#4169E1', opacity: 0.5 + rainIntensity * 0.25 }; // Royal blue, MORE VISIBLE
    case 'HeavyRain':
      return { color: '#0000CD', opacity: 0.6 + rainIntensity * 0.3 }; // Medium blue, MORE VISIBLE
    case 'HeavyStorm':
      return { color: '#00008B', opacity: 0.7 + rainIntensity * 0.3 }; // Dark blue, VERY VISIBLE
    default:
      return { color: '#87CEEB', opacity: 0 };
  }
}

// Render weather overlay for all chunks
function renderWeatherOverlay(
  ctx: CanvasRenderingContext2D,
  chunkWeatherData: Map<number, ChunkWeather>,
  worldRectScreenX: number,
  worldRectScreenY: number,
  worldPixelWidth: number,
  worldPixelHeight: number,
  currentScale: number
) {
  if (!chunkWeatherData || chunkWeatherData.size === 0) return;

  ctx.save();
  
  // Calculate chunk size in world pixels using gameConfig
  // Using the correct config values fixes misalignment issues
  const WORLD_WIDTH_CHUNKS = gameConfig.worldWidthChunks; 
  const chunkWidthWorld = worldPixelWidth / WORLD_WIDTH_CHUNKS;
  // Assuming square chunks for height ratio as well or proportional
  const chunkHeightWorld = worldPixelHeight / gameConfig.worldHeightChunks;

  // Optimization: Group chunks by color/opacity to batch draw calls
  // Key: "color|opacity", Value: Array of rects
  const batches = new Map<string, { x: number, y: number, w: number, h: number }[]>();

  // 1. Collect visible chunks into batches
  chunkWeatherData.forEach((weather, chunkIndex) => {
    const weatherTag = weather.currentWeather?.tag || 'Clear';
    
    // Skip clear weather (opacity 0)
    if (weatherTag === 'Clear') return;

    const { color, opacity } = getWeatherOverlayColor(weatherTag, weather.rainIntensity);

    if (opacity <= 0) return;

    // Calculate chunk position
    const chunkX = chunkIndex % WORLD_WIDTH_CHUNKS;
    const chunkY = Math.floor(chunkIndex / WORLD_WIDTH_CHUNKS);

    const chunkWorldX = chunkX * chunkWidthWorld;
    const chunkWorldY = chunkY * chunkHeightWorld;

    // Convert to screen coordinates
    const screenX = worldRectScreenX + chunkWorldX * currentScale;
    const screenY = worldRectScreenY + chunkWorldY * currentScale;
    const screenWidth = chunkWidthWorld * currentScale;
    const screenHeight = chunkHeightWorld * currentScale;

    // Add to batch
    const batchKey = `${color}|${opacity}`;
    if (!batches.has(batchKey)) {
      batches.set(batchKey, []);
    }
    batches.get(batchKey)!.push({ x: screenX, y: screenY, w: screenWidth, h: screenHeight });
  });

  // 2. Render batches
  batches.forEach((rects, key) => {
    const [color, opacityStr] = key.split('|');
    const opacity = parseFloat(opacityStr);

    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    
    ctx.beginPath();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      ctx.rect(r.x, r.y, r.w, r.h);
    }
    ctx.fill();
  });

  ctx.restore();
}

/**
 * Draws the minimap overlay onto the provided canvas context.
 */
export function drawMinimapOntoCanvas({
  ctx,
  players,
  trees,
  stones,
  runeStones,
  barrels,
  campfires,
  sleepingBags,
  alkStations, // ALK delivery stations
  monumentParts, // Unified monument parts (all monument types)
  largeQuarries, // Large quarry locations with types for labels
  livingCorals, // Living coral reefs (underwater resources)

  localPlayer, // Destructure localPlayer
  localPlayerId,
  playerPin, // Destructure playerPin
  canvasWidth,
  canvasHeight,
  isMouseOverMinimap,
  // isMouseOverXButton removed - X button now handled by React components
  zoomLevel, // Destructure zoomLevel
  viewCenterOffset, // Destructure pan offset
  minimapCache, // Destructure minimapCache
  // Destructure new props with defaults
  isDeathScreen = false,
  ownedSleepingBagIds = new Set(),
  onSelectSleepingBag, // Callback is optional, only needed if interactive
  sleepingBagImage = null, // Default to null
  // Destructure new death marker props
  localPlayerDeathMarker = null,
  deathMarkerImage = null,
  worldState, // <-- Add this
  // Destructure pin marker image prop
  pinMarkerImage = null, // Default to null
  // Destructure campfire and torch image props
  campfireWarmthImage = null, // Default to null
  torchOnImage = null, // Default to null
  // Destructure grid coordinates visibility prop
  showGridCoordinates = true, // Default to true (show by default)
  // Destructure weather overlay props
  showWeatherOverlay = false, // Default to false (hidden by default)
  chunkWeatherData, // Weather data map
  // Destructure show names prop
  showNames = true, // Default to true (show names by default)
  // Destructure matronage props
  matronageMembers, // Matronage membership tracking
  matronages, // Matronage organizations
  // Destructure beacon drop event props
  beaconDropEvents, // Active beacon drop events
}: MinimapProps) {
  // On mobile (smaller canvas), use full canvas dimensions; on desktop, use fixed dimensions
  const isMobile = canvasWidth <= 768 || canvasHeight <= 768;
  const minimapWidth = isMobile ? canvasWidth : MINIMAP_WIDTH;
  const minimapHeight = isMobile ? canvasHeight : MINIMAP_HEIGHT;
  
  // Log the received localPlayerDeathMarker prop at the beginning of the function
  // console.log('[Minimap.tsx] drawMinimapOntoCanvas called. Received localPlayerDeathMarker:', JSON.stringify(localPlayerDeathMarker, (key, value) => typeof value === 'bigint' ? value.toString() : value));

  // On mobile, fill the canvas (start at 0,0); on desktop, center the minimap
  const minimapX = isMobile ? 0 : (canvasWidth - minimapWidth) / 2;
  const minimapY = isMobile ? 0 : (canvasHeight - minimapHeight) / 2;
  
  // DEBUG: Log drawing coordinate calculation values (commented out for performance)
  // console.log(`[Minimap] Drawing coordinate calculation:
  //   canvasSize: ${canvasWidth}x${canvasHeight}
  //   minimapSize: ${minimapWidth}x${minimapHeight}
  //   minimapPos: (${minimapX}, ${minimapY})`);

  // --- Calculate Base Scale (Zoom Level 1) ---
  const worldPixelWidth = gameConfig.worldWidth * gameConfig.tileSize;
  const worldPixelHeight = gameConfig.worldHeight * gameConfig.tileSize;
  const baseScaleX = minimapWidth / worldPixelWidth;
  const baseScaleY = minimapHeight / worldPixelHeight;
  const baseUniformScale = Math.min(baseScaleX, baseScaleY);

  // --- Calculate Current Scale based on Zoom ---
  const currentScale = baseUniformScale * zoomLevel;

  // --- Calculate Final View Center (incorporating pan offset) ---
  let viewCenterXWorld: number;
  let viewCenterYWorld: number;

  if (zoomLevel <= 1 || !localPlayer) {
    // At zoom 1 or if no local player, center on the world center
    viewCenterXWorld = worldPixelWidth / 2;
    viewCenterYWorld = worldPixelHeight / 2;
  } else {
    // When zoomed in, center on the local player
    viewCenterXWorld = localPlayer.positionX + viewCenterOffset.x; // Add offset
    viewCenterYWorld = localPlayer.positionY + viewCenterOffset.y; // Add offset
  }

  // Calculate the top-left world coordinate visible at the current zoom and center
  const viewWidthWorld = minimapWidth / currentScale;
  const viewHeightWorld = minimapHeight / currentScale;
  const viewMinXWorld = viewCenterXWorld - viewWidthWorld / 2;
  const viewMinYWorld = viewCenterYWorld - viewHeightWorld / 2;

  // The drawing offset needs to map the calculated viewMinX/YWorld to the minimapX/Y screen coordinates
  const drawOffsetX = minimapX - viewMinXWorld * currentScale;
  const drawOffsetY = minimapY - viewMinYWorld * currentScale;

  // Helper function to convert world coords to minimap screen coords
  const worldToMinimap = (worldX: number, worldY: number): { x: number; y: number } | null => {
    const screenX = drawOffsetX + worldX * currentScale;
    const screenY = drawOffsetY + worldY * currentScale;
    // Basic check if within minimap bounds (can be more precise)
    if (screenX >= minimapX && screenX <= minimapX + minimapWidth &&
        screenY >= minimapY && screenY <= minimapY + minimapHeight) {
      return { x: screenX, y: screenY };
    } else {
      return null; // Off the minimap at current zoom/pan
    }
  };

  // Determine if it's night/evening for minimap light rendering
  const timeOfDayTag = worldState?.timeOfDay?.tag;
  const showNightLights = timeOfDayTag ? isNightTimeOfDay(timeOfDayTag) : false;

  // --- Apply Retro Styling --- 
  ctx.save(); // Save context before applying shadow/styles

  // --- Apply Smooth Animated Transparency Based on Hover State ---
  // Set target opacity based on hover state
  setTargetOpacity(isMouseOverMinimap ? OPACITY_VISIBLE : OPACITY_HIDDEN);
  
  // Apply current animated opacity (smoothly transitioning)
  ctx.globalAlpha = animatedOpacity;

  // Apply cyberpunk glow shadow effect (optimized - reduced blur)
  const shadowOffset = 4;
  ctx.shadowColor = MINIMAP_GLOW_COLOR;
  ctx.shadowBlur = 8; // Reduced from 12 for better performance
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillRect(minimapX + shadowOffset, minimapY + shadowOffset, minimapWidth, minimapHeight);
  ctx.shadowBlur = 0; // Reset shadow

  // 1. Draw Overall Minimap Background (optimized - solid color instead of gradient)
  // Gradients are expensive, use solid color with slight variation if needed
  ctx.fillStyle = isMouseOverMinimap ? MINIMAP_BG_COLOR_HOVER : MINIMAP_BG_COLOR_NORMAL;
  ctx.fillRect(minimapX, minimapY, minimapWidth, minimapHeight);

  // Draw enhanced cyberpunk border with glow effect (optimized - reduced blur)
  ctx.strokeStyle = MINIMAP_BORDER_COLOR;
  ctx.lineWidth = MINIMAP_BORDER_WIDTH;
  ctx.shadowColor = MINIMAP_GLOW_COLOR;
  ctx.shadowBlur = 6; // Reduced from 8 for better performance
  ctx.strokeRect(minimapX, minimapY, minimapWidth, minimapHeight);
  ctx.shadowBlur = 0; // Reset shadow
  
  // Draw inner border for more definition with purple accent
  ctx.strokeStyle = MINIMAP_INNER_BORDER_COLOR;
  ctx.lineWidth = MINIMAP_INNER_BORDER_WIDTH;
  ctx.strokeRect(minimapX + MINIMAP_BORDER_WIDTH, minimapY + MINIMAP_BORDER_WIDTH, 
                 minimapWidth - MINIMAP_BORDER_WIDTH * 2, minimapHeight - MINIMAP_BORDER_WIDTH * 2);

  // Clip drawing to minimap bounds (optional, but good practice)
  ctx.beginPath();
  ctx.rect(minimapX, minimapY, minimapWidth, minimapHeight);
  ctx.clip();
  // --- End Initial Styling & Clip ---

  // 3. Draw Dark Background for the entire minimap area (including potential out-of-bounds)
  ctx.fillStyle = OUT_OF_BOUNDS_COLOR;
  ctx.fillRect(minimapX, minimapY, minimapWidth, minimapHeight);

  // Calculate the screen rectangle for the actual world bounds at current zoom/pan
  const worldRectScreenX = drawOffsetX + 0 * currentScale; // World X=0
  const worldRectScreenY = drawOffsetY + 0 * currentScale; // World Y=0
  const worldRectScreenWidth = worldPixelWidth * currentScale;
  const worldRectScreenHeight = worldPixelHeight * currentScale;

  // Draw the actual world background
  ctx.fillStyle = MINIMAP_WORLD_BG_COLOR; 
  ctx.fillRect(worldRectScreenX, worldRectScreenY, worldRectScreenWidth, worldRectScreenHeight);

  // --- Draw Cached Minimap Background with AAA Pixel Art Studio Style ---
  if (minimapCache && minimapCache.data && minimapCache.data.length > 0) {
    // Calculate the world bounds within the minimap
    const worldRectScreenX = drawOffsetX + 0 * currentScale; // World X=0
    const worldRectScreenY = drawOffsetY + 0 * currentScale; // World Y=0
    const worldRectScreenWidth = worldPixelWidth * currentScale;
    const worldRectScreenHeight = worldPixelHeight * currentScale;
    
    // Use new region-based rendering for AAA pixel art style
    // Use cache data directly if already Uint8Array, otherwise create view (efficient)
    const cacheData = minimapCache.data instanceof Uint8Array 
      ? minimapCache.data 
      : new Uint8Array(minimapCache.data);
    
    // Render regions with clean edges (much more efficient than pixel-by-pixel)
    // Uses downscaled cells with clean edges for AAA pixel art studio style
    // Note: cacheData is a view, not a copy, so it's efficient
    renderRegionsWithEdges(
      ctx,
      cacheData,
      minimapCache.width,
      minimapCache.height,
      worldRectScreenX,
      worldRectScreenY,
      worldRectScreenWidth,
      worldRectScreenHeight,
      4 // scaleDown factor (4 = 1/4 resolution - optimized for performance while maintaining quality)
    );
    
    // Apply scan line overlay for cyberpunk effect
    applyScanLines(ctx, worldRectScreenX, worldRectScreenY, worldRectScreenWidth, worldRectScreenHeight);
    
    // Draw weather overlay if enabled
    if (showWeatherOverlay && chunkWeatherData) {
      renderWeatherOverlay(
        ctx,
        chunkWeatherData,
        worldRectScreenX,
        worldRectScreenY,
        worldPixelWidth,
        worldPixelHeight,
        currentScale
      );
    }
  } else {
    // Debug: Show what we actually have
    // console.log(`[Minimap] No cached minimap data available. minimapCache:`, minimapCache);
    
    // Show a message that minimap cache is not ready
    ctx.fillStyle = 'rgba(0, 212, 255, 0.8)';
    ctx.font = '14px "Courier New", monospace';
    ctx.textAlign = 'center';
    // ctx.fillText('INITIALIZING TACTICAL MAP...', minimapX + minimapWidth/2, minimapY + minimapHeight/2);
  }

  // --- Calculate Grid Divisions Dynamically (Based on current view) ---
  // Adjust grid rendering based on zoom level - maybe show finer grid when zoomed?
  // For now, keep it simple: calculate grid lines based on visible world area.
  const gridCellSizeWorld = gameConfig.minimapGridCellSizePixels > 0 ? gameConfig.minimapGridCellSizePixels : 1;

  const startGridXWorld = Math.floor(viewMinXWorld / gridCellSizeWorld) * gridCellSizeWorld;
  const endGridXWorld = Math.ceil((viewMinXWorld + viewWidthWorld) / gridCellSizeWorld) * gridCellSizeWorld;
  const startGridYWorld = Math.floor(viewMinYWorld / gridCellSizeWorld) * gridCellSizeWorld;
  const endGridYWorld = Math.ceil((viewMinYWorld + viewHeightWorld) / gridCellSizeWorld) * gridCellSizeWorld;

  // --- Draw Grid (CYBERPUNK SOVA STYLE) ---
  ctx.fillStyle = GRID_TEXT_COLOR;
  ctx.font = GRID_TEXT_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = GRID_TEXT_SHADOW;
  ctx.shadowBlur = 4;

  // Draw Vertical Lines with alternating emphasis
  let gridLineIndex = 0;
  for (let worldX = startGridXWorld; worldX <= endGridXWorld; worldX += gridCellSizeWorld) {
    const screenCoords = worldToMinimap(worldX, viewMinYWorld);
    if (screenCoords) {
      const screenX = screenCoords.x;
      const isMajorLine = gridLineIndex % 5 === 0; // Every 5th line is major
      
      ctx.strokeStyle = isMajorLine ? GRID_LINE_HIGHLIGHT_COLOR : GRID_LINE_COLOR;
      ctx.lineWidth = isMajorLine ? 1 : 0.5;
      
      ctx.beginPath();
      ctx.moveTo(screenX, minimapY);
      ctx.lineTo(screenX, minimapY + minimapHeight);
      ctx.stroke();
    }
    gridLineIndex++;
  }

  // Draw Horizontal Lines with alternating emphasis
  gridLineIndex = 0;
  for (let worldY = startGridYWorld; worldY <= endGridYWorld; worldY += gridCellSizeWorld) {
    const screenCoords = worldToMinimap(viewMinXWorld, worldY);
    if (screenCoords) {
      const screenY = screenCoords.y;
      const isMajorLine = gridLineIndex % 5 === 0; // Every 5th line is major
      
      ctx.strokeStyle = isMajorLine ? GRID_LINE_HIGHLIGHT_COLOR : GRID_LINE_COLOR;
      ctx.lineWidth = isMajorLine ? 1 : 0.5;
      
      ctx.beginPath();
      ctx.moveTo(minimapX, screenY);
      ctx.lineTo(minimapX + minimapWidth, screenY);
      ctx.stroke();
    }
    gridLineIndex++;
  }
  
  // Reset shadow for subsequent drawing
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  // --- End Grid Lines (Labels drawn LAST for visibility) ---

  // --- Draw Death Marker ---
  // console.log('[Minimap] Checking for death marker. Marker data:', localPlayerDeathMarker, 'Image loaded:', deathMarkerImage && deathMarkerImage.complete && deathMarkerImage.naturalHeight !== 0, 'Image Element:', deathMarkerImage);
  if (localPlayerDeathMarker && deathMarkerImage && deathMarkerImage.complete && deathMarkerImage.naturalHeight !== 0) {
    // console.log('[Minimap] Corpse and loaded image found, attempting to draw death marker.'); // Changed 'Corpse' to 'Marker' for clarity
    const screenCoords = worldToMinimap(localPlayerDeathMarker.posX, localPlayerDeathMarker.posY);
    //console.log('[Minimap] Death marker worldPos:', { x: localPlayerDeathMarker.posX, y: localPlayerDeathMarker.posY }, 'screenCoords:', screenCoords, 'Zoom:', zoomLevel, 'Offset:', viewCenterOffset);
    if (screenCoords) {
      // console.log('[Minimap] Drawing death marker at:', screenCoords);
      const iconRadius = DEATH_MARKER_ICON_SIZE / 2;
      const iconDiameter = DEATH_MARKER_ICON_SIZE;
      const cx = screenCoords.x;
      const cy = screenCoords.y;

      ctx.save(); // Save before clipping/drawing

      // 1. Draw background circle (optional, for better visibility or style)
      ctx.fillStyle = DEATH_MARKER_BG_COLOR;
      ctx.beginPath();
      ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Clip to circle
      ctx.beginPath();
      ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
      ctx.clip();

      // 3. Draw image centered in the circle
      ctx.drawImage(
        deathMarkerImage,
        cx - iconRadius, // Adjust x to center
        cy - iconRadius, // Adjust y to center
        iconDiameter,    // Draw at icon size
        iconDiameter
      );
      
      ctx.restore(); // Restore context after drawing image (removes clip)

      // 4. Draw border around the circle
      ctx.strokeStyle = DEATH_MARKER_BORDER_COLOR;
      ctx.lineWidth = DEATH_MARKER_BORDER_WIDTH;
      ctx.beginPath();
      ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // --- Draw Trees (TACTICAL COVER INDICATORS) ---
  // PvP Tactical Note: Trees = SOFT COVER and CONCEALMENT zones
  // Critical for predicting enemy movement and ambush points
  trees.forEach(tree => {
    // Only show trees that aren't destroyed or respawning
    if (tree.health <= 0 || (tree.respawnAt && tree.respawnAt.microsSinceUnixEpoch !== 0n)) return;
    
    const screenCoords = worldToMinimap(tree.posX, tree.posY);
    if (screenCoords) {
      const iconSize = ENTITY_DOT_SIZE * 2.5; // Larger for better tactical awareness
      const halfSize = iconSize / 2;
      const x = screenCoords.x;
      const y = screenCoords.y;
      
      // Draw triangular tree icon (▲)
      ctx.save();
      
      // Add subtle green glow for visibility
      ctx.shadowColor = 'rgba(55, 255, 122, 0.4)';
      ctx.shadowBlur = 4;
      
      // Draw black outline first
      ctx.strokeStyle = RESOURCE_ICON_OUTLINE_COLOR;
      ctx.lineWidth = RESOURCE_ICON_OUTLINE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, y - halfSize); // Top point
      ctx.lineTo(x - halfSize, y + halfSize); // Bottom left
      ctx.lineTo(x + halfSize, y + halfSize); // Bottom right
      ctx.closePath();
      ctx.stroke();
      
      // Fill with tree color
      ctx.fillStyle = TREE_DOT_COLOR;
      ctx.fill();
      
      ctx.restore();
    }
  });

  // --- Draw Stones (HARD COVER LANDMARKS) ---
  // PvP Tactical Note: Stones = HARD COVER and MAJOR LANDMARKS
  // "Enemy behind the rock cluster at C7" - critical callout points
  stones.forEach(stone => { // Use stones prop (type SpacetimeDBStone)
    // Only show stones that aren't destroyed or respawning
    if (stone.health <= 0 || (stone.respawnAt && stone.respawnAt.microsSinceUnixEpoch !== 0n)) return;
    
    const screenCoords = worldToMinimap(stone.posX, stone.posY);
    if (screenCoords) {
      const iconSize = ENTITY_DOT_SIZE * 2.5; // Larger for landmark visibility
      const halfSize = iconSize / 2;
      const x = screenCoords.x;
      const y = screenCoords.y;
      
      // Draw square stone icon (■)
      ctx.save();
      
      // Add subtle blue glow for visibility
      ctx.shadowColor = 'rgba(187, 187, 255, 0.4)';
      ctx.shadowBlur = 4;
      
      // Draw black outline first
      ctx.strokeStyle = RESOURCE_ICON_OUTLINE_COLOR;
      ctx.lineWidth = RESOURCE_ICON_OUTLINE_WIDTH;
      ctx.strokeRect(x - halfSize, y - halfSize, iconSize, iconSize);
      
      // Fill with stone color
      ctx.fillStyle = ROCK_DOT_COLOR;
      ctx.fillRect(x - halfSize, y - halfSize, iconSize, iconSize);
      
      ctx.restore();
    }
  });

  // --- Draw Living Corals (UNDERWATER RESOURCES) ---
  // Living corals are harvestable underwater resources - show them like stones but with coral color
  if (livingCorals) {
    livingCorals.forEach(coral => {
      // Only show corals that have health and aren't respawning
      if (coral.health <= 0 || (coral.respawnAt && coral.respawnAt.microsSinceUnixEpoch !== 0n)) return;
      
      const screenCoords = worldToMinimap(coral.posX, coral.posY);
      if (screenCoords) {
        const iconSize = ENTITY_DOT_SIZE * 2.5; // Same size as stones
        const halfSize = iconSize / 2;
        const x = screenCoords.x;
        const y = screenCoords.y;
        
        // Draw coral icon (flower/star shape)
        ctx.save();
        
        // Add subtle pink glow for visibility
        ctx.shadowColor = 'rgba(255, 127, 200, 0.5)';
        ctx.shadowBlur = 4;
        
        // Draw black outline first
        ctx.strokeStyle = RESOURCE_ICON_OUTLINE_COLOR;
        ctx.lineWidth = RESOURCE_ICON_OUTLINE_WIDTH;
        
        // Draw a simple cross/plus shape to represent coral branches
        ctx.beginPath();
        // Vertical bar
        ctx.moveTo(x, y - halfSize);
        ctx.lineTo(x, y + halfSize);
        // Horizontal bar
        ctx.moveTo(x - halfSize, y);
        ctx.lineTo(x + halfSize, y);
        // Diagonal bars for coral branch effect
        const diagSize = halfSize * 0.7;
        ctx.moveTo(x - diagSize, y - diagSize);
        ctx.lineTo(x + diagSize, y + diagSize);
        ctx.moveTo(x + diagSize, y - diagSize);
        ctx.lineTo(x - diagSize, y + diagSize);
        ctx.stroke();
        
        // Fill center with coral color
        ctx.fillStyle = LIVING_CORAL_DOT_COLOR;
        ctx.beginPath();
        ctx.arc(x, y, iconSize / 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    });
  }

  // --- Draw Rune Stones ---
  runeStones.forEach(runeStone => {
    const screenCoords = worldToMinimap(runeStone.posX, runeStone.posY);
    if (screenCoords) {
      const iconSize = RUNE_STONE_ICON_SIZE;
      const halfSize = iconSize / 2;
      const x = screenCoords.x;
      const y = screenCoords.y;
      
      // Determine color based on rune type
      let runeColor = RUNE_STONE_BLUE_COLOR; // Default to blue
      const runeType = runeStone.runeType?.tag || 'Blue';
      if (runeType === 'Green') {
        runeColor = RUNE_STONE_GREEN_COLOR;
      } else if (runeType === 'Red') {
        runeColor = RUNE_STONE_RED_COLOR;
      } else if (runeType === 'Blue') {
        runeColor = RUNE_STONE_BLUE_COLOR;
      }
      
      // Draw diamond/hexagon rune stone icon (◆)
      ctx.save();
      
      // Add glow effect matching the rune color
      ctx.shadowColor = runeColor;
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      // Draw black outline first
      ctx.strokeStyle = RESOURCE_ICON_OUTLINE_COLOR;
      ctx.lineWidth = RESOURCE_ICON_OUTLINE_WIDTH;
      ctx.beginPath();
      // Draw diamond shape (rotated square)
      ctx.moveTo(x, y - halfSize); // Top
      ctx.lineTo(x + halfSize, y); // Right
      ctx.lineTo(x, y + halfSize); // Bottom
      ctx.lineTo(x - halfSize, y); // Left
      ctx.closePath();
      ctx.stroke();
      
      // Fill with rune color (glow will be applied automatically)
      ctx.fillStyle = runeColor;
      ctx.fill();
      
      // Reset shadow for next drawing operations
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      
      ctx.restore();
    }
  });

  // --- Draw Barrels (LOOT OBJECTIVES) ---
  // PvP Tactical Note: Barrels = LOOT CONTAINERS and OBJECTIVES
  // High-value targets that attract player activity - expect combat nearby
  barrels.forEach(barrel => {
    // Only show barrels that aren't destroyed (health > 0)
    if (barrel.health <= 0) return;
    
    const screenCoords = worldToMinimap(barrel.posX, barrel.posY);
    if (screenCoords) {
      const iconSize = ENTITY_DOT_SIZE * 2.5; // Larger for objective visibility
      const radius = iconSize / 2;
      const x = screenCoords.x;
      const y = screenCoords.y;
      
      // Draw circular barrel icon (●)
      ctx.save();
      
      // Add bright yellow-orange glow for LOOT visibility
      ctx.shadowColor = 'rgba(255, 187, 68, 0.6)';
      ctx.shadowBlur = 5;
      
      // Draw black outline first
      ctx.strokeStyle = RESOURCE_ICON_OUTLINE_COLOR;
      ctx.lineWidth = RESOURCE_ICON_OUTLINE_WIDTH;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Fill with barrel color (bright yellow-orange)
      ctx.fillStyle = BARREL_DOT_COLOR;
      ctx.fill();
      
      ctx.restore();
    }
  });

  // --- Draw ALK Stations (DELIVERY OBJECTIVES) ---
  // ALK stations are critical supply/delivery points for the economy system
  if (alkStations) {
    alkStations.forEach(station => {
      // Only show active stations
      if (!station.isActive) return;
      
      const screenCoords = worldToMinimap(station.worldPosX, station.worldPosY);
      if (screenCoords) {
        const iconSize = ALK_STATION_ICON_SIZE;
        const halfSize = iconSize / 2;
        const x = screenCoords.x;
        const y = screenCoords.y;
        
        // Determine color based on station type (compound vs substation)
        const isCentralCompound = station.stationId === 0;
        const stationColor = isCentralCompound ? ALK_CENTRAL_COLOR : ALK_SUBSTATION_COLOR;
        
        ctx.save();
        
        // Add strong glow effect for high visibility
        ctx.shadowColor = stationColor;
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw ALK station icon - hexagonal shape (⬡) for unique identification
        ctx.beginPath();
        const sides = 6;
        for (let i = 0; i < sides; i++) {
          const angle = (Math.PI / 6) + (i * Math.PI * 2 / sides); // Start rotated 30 degrees for flat-top hex
          const px = x + halfSize * Math.cos(angle);
          const py = y + halfSize * Math.sin(angle);
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();
        
        // Draw black outline first for contrast
        ctx.strokeStyle = ALK_STATION_OUTLINE_COLOR;
        ctx.lineWidth = ALK_STATION_OUTLINE_WIDTH;
        ctx.stroke();
        
        // Fill with station color
        ctx.fillStyle = stationColor;
        ctx.fill();
        
        // Draw inner detail - smaller hexagon or icon
        ctx.shadowBlur = 0;
        ctx.beginPath();
        const innerSize = halfSize * 0.5;
        for (let i = 0; i < sides; i++) {
          const angle = (Math.PI / 6) + (i * Math.PI * 2 / sides);
          const px = x + innerSize * Math.cos(angle);
          const py = y + innerSize * Math.sin(angle);
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();
        
        // Inner fill - darker for depth
        ctx.fillStyle = isCentralCompound ? '#004433' : '#553300';
        ctx.fill();
        
        // Draw "ALK" text for central compound only (it's larger/more important)
        if (isCentralCompound) {
          ctx.font = 'bold 12px "Courier New", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
        }
        
        ctx.restore();
      }
    });
  }

  // --- Draw Shipwreck Parts (EXPLORATION LANDMARKS) ---
  // Show ONE representative "SHIPWRECK" label for the entire structure
  // Filter shipwreck parts from unified monument parts
  // NOTE: MonumentType is a tagged union with a `tag` property (e.g., { tag: 'Shipwreck' })
  const shipwreckPartsFiltered = monumentParts ? Array.from(monumentParts.values())
    .filter((part: any) => part.monumentType?.tag === 'Shipwreck') : [];
  
  if (shipwreckPartsFiltered.length > 0 && showNames === true) {
    // Find ONE representative shipwreck part (prefer center part, otherwise use first part)
    let representativePart: any | null = null;
    
    // First, try to find a center part
    shipwreckPartsFiltered.forEach((part: any) => {
      if (part.isCenter) {
        representativePart = part;
      }
    });
    
    // If no center part found, just use the first part
    if (!representativePart && shipwreckPartsFiltered.length > 0) {
      representativePart = shipwreckPartsFiltered[0];
    }
    
    // Draw the label for the representative part
    if (representativePart) {
      const screenCoords = worldToMinimap(representativePart.worldX, representativePart.worldY);
      if (screenCoords) {
        const x = screenCoords.x;
        const y = screenCoords.y;
        
        ctx.save();
        
        // Draw "SHIPWRECK" text with cyberpunk styling - LARGER SIZE
        ctx.font = 'bold 14px "Courier New", monospace'; // Increased from 10px to 14px
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add glow effect for visibility
        ctx.shadowColor = SHIPWRECK_GLOW_COLOR;
        ctx.shadowBlur = 10; // Increased glow
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw text with black outline for contrast
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4; // Thicker outline for larger text
        ctx.strokeText('SHIPWRECK', x, y);
        
        // Fill with shipwreck color
        ctx.fillStyle = SHIPWRECK_COLOR;
        ctx.fillText('SHIPWRECK', x, y);
        
        ctx.restore();
      }
    }
  }

  // --- Draw Fishing Village Parts (EXPLORATION LANDMARKS) ---
  // Show ONE representative "FISHING VILLAGE" label for the entire structure
  // Filter fishing village parts from unified monument parts
  // NOTE: MonumentType is a tagged union with a `tag` property (e.g., { tag: 'FishingVillage' })
  const fishingVillagePartsFiltered = monumentParts ? Array.from(monumentParts.values())
    .filter((part: any) => part.monumentType?.tag === 'FishingVillage') : [];
  
  if (fishingVillagePartsFiltered.length > 0 && showNames === true) {
    // Find ONE representative fishing village part (prefer center part, otherwise use first part)
    let representativePart: any | null = null;
    
    // First, try to find a center part
    fishingVillagePartsFiltered.forEach((part: any) => {
      if (part.isCenter) {
        representativePart = part;
      }
    });
    
    // If no center part found, just use the first part
    if (!representativePart && fishingVillagePartsFiltered.length > 0) {
      representativePart = fishingVillagePartsFiltered[0];
    }
    
    // Draw the label for the representative part
    if (representativePart) {
      const screenCoords = worldToMinimap(representativePart.worldX, representativePart.worldY);
      if (screenCoords) {
        const x = screenCoords.x;
        const y = screenCoords.y;
        
        ctx.save();
        
        // Draw "FISHING VILLAGE" text with warm/earthy styling - LARGER SIZE
        ctx.font = 'bold 14px "Courier New", monospace'; // Same size as shipwreck
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Warm brown/tan color for fishing village (earthy Aleut style)
        const FISHING_VILLAGE_COLOR = '#D2691E'; // Chocolate brown
        const FISHING_VILLAGE_GLOW_COLOR = '#FFD700'; // Gold glow (from campfire)
        
        // Add glow effect for visibility
        ctx.shadowColor = FISHING_VILLAGE_GLOW_COLOR;
        ctx.shadowBlur = 10; // Increased glow
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw text with black outline for contrast
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4; // Thicker outline for larger text
        ctx.strokeText('FISHING VILLAGE', x, y);
        
        // Fill with fishing village color
        ctx.fillStyle = FISHING_VILLAGE_COLOR;
        ctx.fillText('FISHING VILLAGE', x, y);
        
        ctx.restore();
      }
    }
  }

  // --- Draw Whale Bone Graveyard Parts (EXPLORATION LANDMARKS) ---
  // Show ONE representative "WHALE GRAVEYARD" label for the entire structure
  // Filter whale bone graveyard parts from unified monument parts
  // NOTE: MonumentType is a tagged union with a `tag` property (e.g., { tag: 'WhaleBoneGraveyard' })
  const whaleBoneGraveyardPartsFiltered = monumentParts ? Array.from(monumentParts.values())
    .filter((part: any) => part.monumentType?.tag === 'WhaleBoneGraveyard') : [];
  
  if (whaleBoneGraveyardPartsFiltered.length > 0 && showNames === true) {
    // Find ONE representative whale bone graveyard part (prefer center part/ribcage, otherwise use first part)
    let representativePart: any | null = null;
    
    // First, try to find a center part (ribcage)
    whaleBoneGraveyardPartsFiltered.forEach((part: any) => {
      if (part.isCenter || part.partType === 'ribcage') {
        representativePart = part;
      }
    });
    
    // If no center part found, just use the first part
    if (!representativePart && whaleBoneGraveyardPartsFiltered.length > 0) {
      representativePart = whaleBoneGraveyardPartsFiltered[0];
    }
    
    // Draw the label for the representative part
    if (representativePart) {
      const screenCoords = worldToMinimap(representativePart.worldX, representativePart.worldY);
      if (screenCoords) {
        const x = screenCoords.x;
        const y = screenCoords.y;
        
        ctx.save();
        
        // Draw "WHALE GRAVEYARD" text with cyberpunk styling - same size as other landmarks
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add glow effect for visibility (eerie bone glow)
        ctx.shadowColor = WHALE_BONE_GRAVEYARD_GLOW_COLOR;
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw text with black outline for contrast
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText('WHALE GRAVEYARD', x, y);
        
        // Fill with whale bone graveyard color (pale bone white)
        ctx.fillStyle = WHALE_BONE_GRAVEYARD_COLOR;
        ctx.fillText('WHALE GRAVEYARD', x, y);
        
        ctx.restore();
      }
    }
  }

  // --- Draw Hunting Village Parts (EXPLORATION LANDMARKS) ---
  // Show ONE representative "HUNTING VILLAGE" label for the entire structure
  // Filter hunting village parts from unified monument parts
  // NOTE: MonumentType is a tagged union with a `tag` property (e.g., { tag: 'HuntingVillage' })
  const huntingVillagePartsFiltered = monumentParts ? Array.from(monumentParts.values())
    .filter((part: any) => part.monumentType?.tag === 'HuntingVillage') : [];
  
  if (huntingVillagePartsFiltered.length > 0 && showNames === true) {
    // Find ONE representative hunting village part (prefer center part/lodge, otherwise use first part)
    let representativePart: any | null = null;
    
    // First, try to find a center part (lodge)
    huntingVillagePartsFiltered.forEach((part: any) => {
      if (part.isCenter || part.partType === 'lodge') {
        representativePart = part;
      }
    });
    
    // If no center part found, just use the first part
    if (!representativePart && huntingVillagePartsFiltered.length > 0) {
      representativePart = huntingVillagePartsFiltered[0];
    }
    
    // Draw the label for the representative part
    if (representativePart) {
      const screenCoords = worldToMinimap(representativePart.worldX, representativePart.worldY);
      if (screenCoords) {
        const x = screenCoords.x;
        const y = screenCoords.y;
        
        ctx.save();
        
        // Draw "HUNTING VILLAGE" text with cyberpunk styling - same size as other landmarks
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add glow effect for visibility (forest green glow)
        ctx.shadowColor = HUNTING_VILLAGE_GLOW_COLOR;
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw text with black outline for contrast
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText('HUNTING VILLAGE', x, y);
        
        // Fill with hunting village color (rustic wood brown)
        ctx.fillStyle = HUNTING_VILLAGE_COLOR;
        ctx.fillText('HUNTING VILLAGE', x, y);
        
        ctx.restore();
      }
    }
  }

  // --- Draw Crashed Research Drone Parts (DANGEROUS CRASH SITE) ---
  // Show ONE representative "CRASHED DRONE" label for the entire structure
  // Filter crashed research drone parts from unified monument parts
  // NOTE: MonumentType is a tagged union with a `tag` property (e.g., { tag: 'CrashedResearchDrone' })
  const crashedDronePartsFiltered = monumentParts ? Array.from(monumentParts.values())
    .filter((part: any) => part.monumentType?.tag === 'CrashedResearchDrone') : [];
  
  if (crashedDronePartsFiltered.length > 0 && showNames === true) {
    // Find ONE representative crashed drone part (prefer center part, otherwise use first part)
    let representativePart: any | null = null;
    
    // First, try to find a center part (drone)
    crashedDronePartsFiltered.forEach((part: any) => {
      if (part.isCenter || part.partType === 'drone') {
        representativePart = part;
      }
    });
    
    // If no center part found, just use the first part
    if (!representativePart && crashedDronePartsFiltered.length > 0) {
      representativePart = crashedDronePartsFiltered[0];
    }
    
    // Draw the label for the representative part
    if (representativePart) {
      const screenCoords = worldToMinimap(representativePart.worldX, representativePart.worldY);
      if (screenCoords) {
        const x = screenCoords.x;
        const y = screenCoords.y;
        
        ctx.save();
        
        // Draw "CRASHED DRONE" text with cyberpunk styling - same size as other landmarks
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add glow effect for visibility (orange-red danger glow)
        ctx.shadowColor = CRASHED_DRONE_GLOW_COLOR;
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw text with black outline for contrast
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText('CRASHED DRONE', x, y);
        
        // Fill with crashed drone color (bright cyan for tech)
        ctx.fillStyle = CRASHED_DRONE_COLOR;
        ctx.fillText('CRASHED DRONE', x, y);
        
        ctx.restore();
      }
    }
  }

  // --- Draw Large Quarries (RESOURCE LANDMARKS) ---
  // Show labels for each large quarry: "STONE QUARRY", "SULFUR QUARRY", "METAL QUARRY"
  if (largeQuarries && largeQuarries.size > 0 && showNames === true) {
    largeQuarries.forEach((quarry) => {
      const screenCoords = worldToMinimap(quarry.worldX, quarry.worldY);
      if (screenCoords) {
        const x = screenCoords.x;
        const y = screenCoords.y;
        
        // Determine quarry type name and color based on quarryType tag
        let quarryLabel = 'QUARRY';
        let quarryColor = QUARRY_STONE_COLOR;
        let glowColor = QUARRY_GLOW_COLOR;
        
        const quarryTypeTag = quarry.quarryType?.tag || 'Stone';
        switch (quarryTypeTag) {
          case 'Stone':
            quarryLabel = 'STONE QUARRY';
            quarryColor = QUARRY_STONE_COLOR;
            glowColor = '#C0C0C0'; // Silver glow
            break;
          case 'Sulfur':
            quarryLabel = 'SULFUR QUARRY';
            quarryColor = QUARRY_SULFUR_COLOR;
            glowColor = '#FFD700'; // Gold glow
            break;
          case 'Metal':
            quarryLabel = 'METAL QUARRY';
            quarryColor = QUARRY_METAL_COLOR;
            glowColor = '#CD7F32'; // Bronze glow
            break;
        }
        
        ctx.save();
        
        // Draw quarry label text with cyberpunk styling - same size as shipwreck
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add glow effect for visibility
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw text with black outline for contrast
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText(quarryLabel, x, y);
        
        // Fill with quarry type color
        ctx.fillStyle = quarryColor;
        ctx.fillText(quarryLabel, x, y);
        
        ctx.restore();
      }
    });
  }

  // --- Draw Memory Beacon Events (SERVER EVENT MARKERS - AIRDROP STYLE) ---
  // These are high-priority server events that spawn at Dusk with a chance
  // They attract hostile NPCs and provide a sanity haven for farming
  if (beaconDropEvents && beaconDropEvents.size > 0) {
    beaconDropEvents.forEach(event => {
      // Only show active beacon events
      if (!event.isActive) return;
      
      const screenCoords = worldToMinimap(event.worldX, event.worldY);
      if (screenCoords) {
        const iconSize = BEACON_EVENT_ICON_SIZE;
        const halfSize = iconSize / 2;
        const x = screenCoords.x;
        const y = screenCoords.y;
        
        ctx.save();
        
        // Draw pulsing glow effect (beacon events are important!)
        const pulseTime = Date.now() / 500; // Faster pulse for urgency
        const pulseIntensity = 0.5 + 0.5 * Math.sin(pulseTime);
        ctx.shadowColor = BEACON_EVENT_GLOW_COLOR;
        ctx.shadowBlur = 15 + 10 * pulseIntensity;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw beacon icon - diamond shape with inner circle (like a radar ping)
        ctx.beginPath();
        ctx.moveTo(x, y - halfSize); // Top
        ctx.lineTo(x + halfSize, y); // Right
        ctx.lineTo(x, y + halfSize); // Bottom
        ctx.lineTo(x - halfSize, y); // Left
        ctx.closePath();
        
        // Draw outline
        ctx.strokeStyle = BEACON_EVENT_OUTLINE_COLOR;
        ctx.lineWidth = BEACON_EVENT_OUTLINE_WIDTH;
        ctx.stroke();
        
        // Fill with beacon color
        ctx.fillStyle = BEACON_EVENT_COLOR;
        ctx.fill();
        
        // Draw inner circle (radar ping effect)
        ctx.beginPath();
        ctx.arc(x, y, halfSize * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        
        // Draw label below the beacon
        if (showNames) {
          ctx.font = 'bold 12px "Courier New", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.shadowColor = BEACON_EVENT_GLOW_COLOR;
          ctx.shadowBlur = 8;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.strokeText('BEACON', x, y + halfSize + 4);
          ctx.fillStyle = BEACON_EVENT_COLOR;
          ctx.fillText('BEACON', x, y + halfSize + 4);
        }
        
        ctx.restore();
      }
    });
  }

  // --- Draw Campfires ---
  if (showNightLights) {
    campfires.forEach(campfire => {
      // Only draw burning campfires
      if (campfire.isBurning) {
        const screenCoords = worldToMinimap(campfire.posX, campfire.posY);
        if (screenCoords) {
          const x = screenCoords.x;
          const y = screenCoords.y;
          const size = CAMPFIRE_ICON_SIZE;
          
          ctx.save();
          
          // Use warmth image if available, otherwise fallback to drawn flame
          if (campfireWarmthImage && campfireWarmthImage.complete && campfireWarmthImage.naturalHeight !== 0) {
            // Draw the warmth image centered at the campfire location
            ctx.drawImage(
              campfireWarmthImage,
              x - size / 2,   // Center horizontally
              y - size / 2,   // Center vertically
              size,
              size
            );
          } else {
            // Fallback to drawn flame if image not loaded
            // Draw glow effect
            ctx.shadowColor = CAMPFIRE_GLOW_COLOR;
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Draw flame-like shape (diamond with rounded top)
            ctx.beginPath();
            ctx.moveTo(x, y - size/2); // Top point
            ctx.quadraticCurveTo(x + size/3, y - size/4, x + size/2, y); // Right curve
            ctx.lineTo(x, y + size/2); // Bottom point
            ctx.lineTo(x - size/2, y); // Left point
            ctx.quadraticCurveTo(x - size/3, y - size/4, x, y - size/2); // Left curve back to top
            ctx.closePath();
            
            // Fill with bright orange
            ctx.fillStyle = CAMPFIRE_DOT_COLOR;
            ctx.fill();
            
            // Add inner flame detail
            ctx.shadowBlur = 0; // Remove shadow for inner detail
            ctx.beginPath();
            ctx.moveTo(x, y - size/3); // Smaller inner flame
            ctx.quadraticCurveTo(x + size/6, y - size/6, x + size/4, y);
            ctx.lineTo(x, y + size/4);
            ctx.lineTo(x - size/4, y);
            ctx.quadraticCurveTo(x - size/6, y - size/6, x, y - size/3);
            ctx.closePath();
            
            ctx.fillStyle = '#FFAA00'; // Brighter yellow-orange for inner flame
            ctx.fill();
            
            // Add black outline for definition
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          
          ctx.restore();
        }
      }
    });
  }

  // --- Draw Remote Players (THREAT INDICATORS) ---
  // PvP Tactical Note: Show players in the same chunk as the local player
  // Night visibility: Only show if torch is lit (tactical advantage for stealth)
  // Same matronage = blue (friendly), different/none = red (enemy)
  
  // Check if local player is in a matronage (for coloring purposes)
  const localPlayerMatronageIdForNight = localPlayerId && matronageMembers 
    ? matronageMembers.get(localPlayerId)?.matronageId?.toString() 
    : null;
  
  if (showNightLights) {
    // Show remote players with torches lit at night - torches are beacons visible from far away!
    // This is intentionally a larger radius than daytime chunk visibility
    if (localPlayer) {
      players.forEach((player, playerId) => {
        if (localPlayerId && playerId === localPlayerId) {
          return; // Skip local player, handled separately
        }
        
        // Only show remote players if they have torch lit (night stealth mechanic)
        // Torches are visible from much farther away at night (like real torches!)
        if (player.isTorchLit) {
          // Radius check - torches visible from far away at night
          const dx = player.positionX - localPlayer.positionX;
          const dy = player.positionY - localPlayer.positionY;
          const distSq = dx * dx + dy * dy;
          if (distSq > TORCH_VISIBILITY_RADIUS_SQ) {
            return; // Torch too far away to see
          }
          const screenCoords = worldToMinimap(player.positionX, player.positionY);
          if (screenCoords) {
            const x = screenCoords.x;
            const y = screenCoords.y;
            const size = PLAYER_ICON_SIZE * 1.5; // Larger for torch-lit players

            // Determine player color based on matronage membership
            const remotePlayerMatronageId = matronageMembers?.get(playerId)?.matronageId?.toString();
            const isSameMatronage = localPlayerMatronageIdForNight && remotePlayerMatronageId && remotePlayerMatronageId === localPlayerMatronageIdForNight;
            const torchColor = isSameMatronage ? '#66AAFF' : '#FF6600'; // Blue-tinted for allies, orange for others
            
            ctx.save();
            
            // === PULSING RING EFFECT ===
            const time = Date.now();
            
            // Outer pulsing ring
            const pulsePhase1 = (time % 2000) / 2000;
            const pulseRadius1 = size + pulsePhase1 * 20;
            const pulseAlpha1 = 1 - pulsePhase1;
            
            ctx.strokeStyle = torchColor;
            ctx.lineWidth = 2 - pulsePhase1 * 1.5;
            ctx.globalAlpha = pulseAlpha1 * 0.6;
            ctx.beginPath();
            ctx.arc(x, y, pulseRadius1, 0, Math.PI * 2);
            ctx.stroke();
            
            // Second pulsing ring (offset timing)
            const pulsePhase2 = ((time + 1000) % 2000) / 2000;
            const pulseRadius2 = size + pulsePhase2 * 20;
            const pulseAlpha2 = 1 - pulsePhase2;
            
            ctx.lineWidth = 2 - pulsePhase2 * 1.5;
            ctx.globalAlpha = pulseAlpha2 * 0.5;
            ctx.beginPath();
            ctx.arc(x, y, pulseRadius2, 0, Math.PI * 2);
            ctx.stroke();
            
            // Reset alpha for main icon
            ctx.globalAlpha = 1.0;
            
            // Add glow for players at night
            ctx.shadowColor = torchColor;
            ctx.shadowBlur = 12;
            
            // Convert player direction to rotation angle (radians)
            let rotation = 0;
            switch (player.direction) {
              case 'right': rotation = 0; break;           // Point right (0°)
              case 'down': rotation = Math.PI / 2; break;  // Point down (90°)
              case 'left': rotation = Math.PI; break;      // Point left (180°)
              case 'up': rotation = -Math.PI / 2; break;   // Point up (-90°)
              default: rotation = 0; break;                // Default to right
            }
            
            // Draw torch-lit players with appropriate color (blue for allies, orange for enemies)
            drawPlayerIcon(
              ctx, 
              x, 
              y, 
              rotation, 
              torchColor, // Use torchColor directly (blue for allies, orange for enemies)
              size
            );
            
            ctx.restore();
          }
        }
      });
    }
  } else {
    // DAYTIME: Show players in nearby chunks (same visibility as trees/stones via spatial subscriptions)
    // Players in same matronage = blue, others = red (enemies)
    // Uses chunk-based filtering to match how trees/stones are spatially subscribed
    
    if (localPlayer) {
      // Calculate local player's chunk coordinates (matching spatial subscription logic)
      const { chunkSizeTiles, tileSize } = gameConfig;
      const localTileX = Math.floor(localPlayer.positionX / tileSize);
      const localTileY = Math.floor(localPlayer.positionY / tileSize);
      const localChunkX = Math.floor(localTileX / chunkSizeTiles);
      const localChunkY = Math.floor(localTileY / chunkSizeTiles);
      
      // Check if local player is in a matronage (for coloring purposes)
      const localPlayerMatronageId = localPlayerId && matronageMembers 
        ? matronageMembers.get(localPlayerId)?.matronageId?.toString() 
        : null;

      // Match the spatial subscription buffer size (CHUNK_BUFFER_SIZE = 1 in useSpacetimeTables)
      // This means players visible in a 3x3 grid of chunks around you (same as trees/stones)
      const PLAYER_CHUNK_BUFFER = 1;

      players.forEach((player, playerId) => {
        if (localPlayerId && playerId === localPlayerId) {
          return; // Skip local player, handled separately
        }

        // Calculate remote player's chunk coordinates
        const remoteTileX = Math.floor(player.positionX / tileSize);
        const remoteTileY = Math.floor(player.positionY / tileSize);
        const remoteChunkX = Math.floor(remoteTileX / chunkSizeTiles);
        const remoteChunkY = Math.floor(remoteTileY / chunkSizeTiles);
        
        // Check if within chunk buffer (same logic as spatial subscriptions for trees/stones)
        const chunkDistX = Math.abs(remoteChunkX - localChunkX);
        const chunkDistY = Math.abs(remoteChunkY - localChunkY);
        if (chunkDistX > PLAYER_CHUNK_BUFFER || chunkDistY > PLAYER_CHUNK_BUFFER) {
          return; // Player outside chunk buffer range
        }

        const screenCoords = worldToMinimap(player.positionX, player.positionY);
        if (screenCoords) {
          const x = screenCoords.x;
          const y = screenCoords.y;

          // Determine player color based on matronage membership
          // Same matronage = blue (friendly), different/none = red (enemy)
          const remotePlayerMatronageId = matronageMembers?.get(playerId)?.matronageId?.toString();
          const isSameMatronage = localPlayerMatronageId && remotePlayerMatronageId && remotePlayerMatronageId === localPlayerMatronageId;
          const playerColor = isSameMatronage ? MATRONAGE_MEMBER_COLOR : ENEMY_PLAYER_COLOR;

          ctx.save();

          // === PULSING RING EFFECT ===
          const time = Date.now();

          // Outer pulsing ring (expands and fades)
          const pulsePhase1 = (time % 2000) / 2000; // 2 second cycle
          const pulseRadius1 = PLAYER_ICON_SIZE + pulsePhase1 * 20;
          const pulseAlpha1 = 1 - pulsePhase1;

          ctx.strokeStyle = playerColor;
          ctx.lineWidth = 2 - pulsePhase1 * 1.5;
          ctx.globalAlpha = pulseAlpha1 * 0.6;
          ctx.beginPath();
          ctx.arc(x, y, pulseRadius1, 0, Math.PI * 2);
          ctx.stroke();

          // Second pulsing ring (offset timing)
          const pulsePhase2 = ((time + 1000) % 2000) / 2000;
          const pulseRadius2 = PLAYER_ICON_SIZE + pulsePhase2 * 20;
          const pulseAlpha2 = 1 - pulsePhase2;

          ctx.lineWidth = 2 - pulsePhase2 * 1.5;
          ctx.globalAlpha = pulseAlpha2 * 0.5;
          ctx.beginPath();
          ctx.arc(x, y, pulseRadius2, 0, Math.PI * 2);
          ctx.stroke();

          // Reset alpha for main icon
          ctx.globalAlpha = 1.0;

          // Add glow to the player icon
          ctx.shadowColor = playerColor;
          ctx.shadowBlur = 10;

          // Convert player direction to rotation angle (radians)
          let rotation = 0;
          switch (player.direction) {
            case 'right': rotation = 0; break;
            case 'down': rotation = Math.PI / 2; break;
            case 'left': rotation = Math.PI; break;
            case 'up': rotation = -Math.PI / 2; break;
            default: rotation = 0; break;
          }

          // Draw player with appropriate color (blue for same matronage, red for enemies)
          drawPlayerIcon(
            ctx, 
            x, 
            y, 
            rotation, 
            playerColor,
            PLAYER_ICON_SIZE
          );
          
          ctx.restore();
        }
      });
    }
  }

  // --- Draw Sleeping Bags ---
  // Filter bags belonging to the local player before drawing
  sleepingBags.forEach(bag => {
    const isOwnedByLocalPlayer = localPlayerId && bag.placedBy.toHexString() === localPlayerId;

    // Skip drawing entirely if it's the death screen and the bag isn't owned.
    if (isDeathScreen && !isOwnedByLocalPlayer) {
        return;
    }
    // Also skip drawing non-owned bags on the regular minimap (existing logic)
    if (!isDeathScreen && !isOwnedByLocalPlayer) {
        return; 
    }

    const screenCoords = worldToMinimap(bag.posX, bag.posY);
    if (screenCoords) {
      const isOwned = ownedSleepingBagIds.has(bag.id);
      if (isDeathScreen && isOwned) {
        // Draw owned bags on death screen with yellow glow
        const iconRadius = OWNED_BAG_DOT_SIZE / 2; // Use owned size
        const iconDiameter = OWNED_BAG_DOT_SIZE;
        const cx = screenCoords.x;
        const cy = screenCoords.y;

        ctx.save(); // Save before drawing

        // 1. Draw yellow glow effect (multiple layers for stronger glow)
        ctx.shadowColor = '#ffeb3b'; // Bright yellow
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        // Draw multiple glow layers for stronger effect
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(cx, cy, iconRadius + (i * 2), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 235, 59, ${0.3 - (i * 0.1)})`; // Fading yellow glow
          ctx.fill();
        }

        // Reset shadow for main icon
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // 2. Clip to circle
        ctx.beginPath();
        ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
        ctx.clip();

        // 3. Draw image centered in the circle
        if (sleepingBagImage && sleepingBagImage.complete && sleepingBagImage.naturalHeight !== 0) {
            ctx.drawImage(
                sleepingBagImage,
                cx - iconRadius, // Adjust x to center
                cy - iconRadius, // Adjust y to center
                iconDiameter,    // Draw at icon size
                iconDiameter
            );
        } 
        // No else needed here, background circle shows something if image fails
        
        ctx.restore(); // Restore context after drawing image (removes clip)

        // 4. Draw bright yellow border around the circle for extra visibility
        ctx.strokeStyle = '#ffeb3b'; // Bright yellow border instead of white
        ctx.lineWidth = REGULAR_BAG_BORDER_WIDTH + 1; // Slightly thicker
        ctx.beginPath();
        ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
        ctx.stroke();

      } else if (!isDeathScreen && isOwnedByLocalPlayer) { // Refined condition for regular map
        // Draw normal OWNED sleeping bags using the image if available
        if (sleepingBagImage && sleepingBagImage.complete && sleepingBagImage.naturalHeight !== 0) {
            const iconRadius = REGULAR_BAG_ICON_SIZE / 2;
            const iconDiameter = REGULAR_BAG_ICON_SIZE;
            const cx = screenCoords.x;
            const cy = screenCoords.y;

            ctx.save(); // Save before clipping
            
            // 1. Draw background circle (optional)
            ctx.fillStyle = REGULAR_BAG_BG_COLOR;
            ctx.beginPath();
            ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
            ctx.fill();

            // 2. Clip to circle
            ctx.beginPath();
            ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
            ctx.clip();

            // 3. Draw image centered in the circle
            ctx.drawImage(
                sleepingBagImage,
                cx - iconRadius, // Adjust x to center
                cy - iconRadius, // Adjust y to center
                iconDiameter,    // Draw at icon size
                iconDiameter
            );
            
            ctx.restore(); // Restore context after drawing image (removes clip)

            // 4. Draw border around the circle
            ctx.strokeStyle = REGULAR_BAG_BORDER_COLOR;
            ctx.lineWidth = REGULAR_BAG_BORDER_WIDTH;
            ctx.beginPath();
            ctx.arc(cx, cy, iconRadius, 0, Math.PI * 2);
            ctx.stroke();

        } else {
            // Fallback to dot if image not loaded
            ctx.fillStyle = SLEEPING_BAG_DOT_COLOR;
            ctx.fillRect(
              screenCoords.x - ENTITY_DOT_SIZE / 2,
              screenCoords.y - ENTITY_DOT_SIZE / 2,
              ENTITY_DOT_SIZE,
              ENTITY_DOT_SIZE
            );
        }
      }
    }
  });

  // --- Draw Local Player (HIGHLY VISIBLE - "YOU ARE HERE" indicator) --- 
  // The local player should IMMEDIATELY stand out - it's the most important marker on the map
  if (localPlayer) {
    const screenCoords = worldToMinimap(localPlayer.positionX, localPlayer.positionY);
    if (screenCoords) { // Should generally be true unless player is somehow off-world
      const x = screenCoords.x;
      const y = screenCoords.y;
      
      ctx.save();
      
      // === PULSING RING EFFECT (Radar-style "YOU ARE HERE") ===
      const time = Date.now();
      
      // Outer pulsing ring (expands and fades)
      const pulsePhase1 = (time % 2000) / 2000; // 2 second cycle
      const pulseRadius1 = LOCAL_PLAYER_ICON_SIZE + pulsePhase1 * 25; // Expands from icon to 25px out
      const pulseAlpha1 = 1 - pulsePhase1; // Fades as it expands
      
      ctx.strokeStyle = LOCAL_PLAYER_PULSE_COLOR_1;
      ctx.lineWidth = 3 - pulsePhase1 * 2; // Gets thinner as it expands
      ctx.globalAlpha = pulseAlpha1 * 0.8;
      ctx.beginPath();
      ctx.arc(x, y, pulseRadius1, 0, Math.PI * 2);
      ctx.stroke();
      
      // Second pulsing ring (offset timing for continuous effect)
      const pulsePhase2 = ((time + 1000) % 2000) / 2000; // Offset by 1 second
      const pulseRadius2 = LOCAL_PLAYER_ICON_SIZE + pulsePhase2 * 25;
      const pulseAlpha2 = 1 - pulsePhase2;
      
      ctx.strokeStyle = LOCAL_PLAYER_PULSE_COLOR_2;
      ctx.lineWidth = 3 - pulsePhase2 * 2;
      ctx.globalAlpha = pulseAlpha2 * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, pulseRadius2, 0, Math.PI * 2);
      ctx.stroke();
      
      // Reset alpha for main icon
      ctx.globalAlpha = 1.0;
      
      // === DIRECTIONAL ARROW ===
      // Convert player direction to rotation angle (radians)
      let rotation = 0;
      switch (localPlayer.direction) {
        case 'right': rotation = 0; break;           // Point right (0°)
        case 'down': rotation = Math.PI / 2; break;  // Point down (90°)
        case 'left': rotation = Math.PI; break;      // Point left (180°)
        case 'up': rotation = -Math.PI / 2; break;   // Point up (-90°)
        default: rotation = 0; break;                // Default to right
      }
      
      // Add strong glow to the player icon
      ctx.shadowColor = LOCAL_PLAYER_DOT_COLOR;
      ctx.shadowBlur = 12;
      
      // Draw local player with directional triangular icon (LARGER than others)
      drawPlayerIcon(
        ctx, 
        x, 
        y, 
        rotation, 
        LOCAL_PLAYER_DOT_COLOR, 
        LOCAL_PLAYER_ICON_SIZE // Use the larger local player size
      );
      
      ctx.restore();
    }
  }

  // --- Draw Player Pin ---
  if (playerPin) {
      const pinScreenCoords = worldToMinimap(playerPin.pinX, playerPin.pinY);
      if (pinScreenCoords) {
          const x = pinScreenCoords.x;
          const y = pinScreenCoords.y;
          const size = PIN_SIZE;
          
          // DEBUG: Log drawing parameters (uncomment for debugging)
          // console.log(`[Minimap DRAW] Pin at world (${playerPin.pinX}, ${playerPin.pinY}) -> screen (${x.toFixed(1)}, ${y.toFixed(1)})`);
          
          // Save context for styling
          ctx.save();
          
          // Use image if available, otherwise fallback to drawn pin
          if (pinMarkerImage && pinMarkerImage.complete && pinMarkerImage.naturalHeight !== 0) {
              // Draw the pin image centered at the world coordinates (no offset adjustments)
              // This ensures the pin appears exactly where the coordinate conversion places it
              const imageWidth = size;
              const imageHeight = size;
              
              // console.log('[Minimap] Drawing pin image at world coordinates - Screen pos:', x, y);
              ctx.drawImage(
                  pinMarkerImage,
                  x - imageWidth / 2,   // Center horizontally
                  y - imageHeight / 2,  // Center vertically (no special pin point offset)
                  imageWidth,
                  imageHeight
              );
          } else {
              // console.log('[Minimap] Pin image not available, using fallback. Image:', !!pinMarkerImage, 'complete:', pinMarkerImage?.complete, 'naturalHeight:', pinMarkerImage?.naturalHeight);
              // Fallback to drawn pin if image not loaded
              // Draw a classic map pin (long base with narrow triangle)
              const pinWidth = size * 0.4;   // Narrow width
              const pinHeight = size;        // Full height
              const baseHeight = size * 0.75; // Long base (75% of total height)
              const triangleHeight = size * 0.25; // Short triangle (25% of total height)
              
              // Calculate positions
              const baseTop = y - pinHeight;
              const baseBottom = y - triangleHeight;
              const triangleTop = baseBottom;
              const triangleBottom = y; // Point at the actual pin location
              
              ctx.beginPath();
              
              // Draw the rectangular base
              ctx.rect(
                x - pinWidth / 2,  // Left edge
                baseTop,           // Top edge
                pinWidth,          // Width
                baseHeight         // Height
              );
              
              // Draw the triangle point
              ctx.moveTo(x - pinWidth / 2, triangleTop);     // Bottom-left of base
              ctx.lineTo(x, triangleBottom);                 // Point at pin location
              ctx.lineTo(x + pinWidth / 2, triangleTop);     // Bottom-right of base
              ctx.lineTo(x - pinWidth / 2, triangleTop);     // Back to start
              
              ctx.closePath();
              
              // Fill with bright yellow
              ctx.fillStyle = PIN_COLOR;
              ctx.fill();
              
              // Draw thin black border
              ctx.strokeStyle = PIN_BORDER_COLOR;
              ctx.lineWidth = PIN_BORDER_WIDTH;
              ctx.stroke();
          }
          
          // Restore context after pin drawing
          ctx.restore();
      }
  }

  // --- Draw Grid Cell Labels LAST (A1, B2 etc.) - ALWAYS ON TOP ---
  // PvP Critical: Coordinates must NEVER be obscured - they're essential for callouts
  // Only render if showGridCoordinates is true
  if (showGridCoordinates) {
    const labelGridDivisionsX = Math.max(1, Math.round(worldPixelWidth / gridCellSizeWorld));
    const labelGridDivisionsY = Math.max(1, Math.round(worldPixelHeight / gridCellSizeWorld));

    ctx.font = GRID_TEXT_FONT; // Use the bold, larger font
    
    for (let row = 0; row < labelGridDivisionsY; row++) {
    for (let col = 0; col < labelGridDivisionsX; col++) {
      // Calculate world coordinates of the top-left corner of this grid cell
      const cellWorldX = col * gridCellSizeWorld;
      const cellWorldY = row * gridCellSizeWorld;
      // Convert world corner to screen coordinates
      const screenCoords = worldToMinimap(cellWorldX, cellWorldY);
      if (screenCoords) {
          // Check if the label position is actually within the minimap bounds
          if (screenCoords.x + 2 < minimapX + minimapWidth && screenCoords.y + 15 < minimapY + minimapHeight) {
              const colLabel = String.fromCharCode(65 + col); // A, B, C...
              const rowLabel = (row + 1).toString(); // 1, 2, 3...
              const label = colLabel + rowLabel;
              
              ctx.save(); // Save state for each label
              
              // Measure text for background box
              const textMetrics = ctx.measureText(label);
              const textHeight = 13; // Approximate height for 13px font
              
              // Draw DARKER background box with MORE padding for combat readability
              ctx.shadowBlur = 0; // No shadow on background
              ctx.fillStyle = GRID_TEXT_BG_COLOR;
              ctx.fillRect(
                screenCoords.x + 2 - GRID_TEXT_BG_PADDING,
                screenCoords.y + 2 - GRID_TEXT_BG_PADDING,
                textMetrics.width + GRID_TEXT_BG_PADDING * 2,
                textHeight + GRID_TEXT_BG_PADDING * 2
              );
              
              // Draw border around background for extra definition
              ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
              ctx.lineWidth = 1;
              ctx.strokeRect(
                screenCoords.x + 2 - GRID_TEXT_BG_PADDING,
                screenCoords.y + 2 - GRID_TEXT_BG_PADDING,
                textMetrics.width + GRID_TEXT_BG_PADDING * 2,
                textHeight + GRID_TEXT_BG_PADDING * 2
              );
              
              // Draw text with STRONG glow and black outline
              ctx.shadowBlur = 8;
              ctx.shadowColor = 'rgba(0, 255, 255, 1.0)';
              
              // Draw black outline for text (stroke text multiple times)
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 3;
              ctx.strokeText(label, screenCoords.x + 2, screenCoords.y + 2);
              
              // Draw bright cyan text
              ctx.fillStyle = GRID_TEXT_COLOR;
              ctx.fillText(label, screenCoords.x + 2, screenCoords.y + 2);
              
              ctx.restore(); // Restore state after each label
          }
      }
    }
    }
  }
  // --- End Grid Labels (Now conditionally visible based on preference) ---

  // --- Draw Cyberpunk Corner HUD Elements ---
  ctx.save();
  
  // Top-left tactical display corner
  const cornerSize = 30;
  const cornerOffset = 8;
  
  // Top-left corner bracket
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(minimapX + cornerOffset + cornerSize, minimapY + cornerOffset);
  ctx.lineTo(minimapX + cornerOffset, minimapY + cornerOffset);
  ctx.lineTo(minimapX + cornerOffset, minimapY + cornerOffset + cornerSize);
  ctx.stroke();
  
  // Top-right corner bracket
  ctx.beginPath();
  ctx.moveTo(minimapX + minimapWidth - cornerOffset - cornerSize, minimapY + cornerOffset);
  ctx.lineTo(minimapX + minimapWidth - cornerOffset, minimapY + cornerOffset);
  ctx.lineTo(minimapX + minimapWidth - cornerOffset, minimapY + cornerOffset + cornerSize);
  ctx.stroke();
  
  // Bottom-left corner bracket
  ctx.beginPath();
  ctx.moveTo(minimapX + cornerOffset, minimapY + minimapHeight - cornerOffset - cornerSize);
  ctx.lineTo(minimapX + cornerOffset, minimapY + minimapHeight - cornerOffset);
  ctx.lineTo(minimapX + cornerOffset + cornerSize, minimapY + minimapHeight - cornerOffset);
  ctx.stroke();
  
  // Bottom-right corner bracket
  ctx.beginPath();
  ctx.moveTo(minimapX + minimapWidth - cornerOffset, minimapY + minimapHeight - cornerOffset - cornerSize);
  ctx.lineTo(minimapX + minimapWidth - cornerOffset, minimapY + minimapHeight - cornerOffset);
  ctx.lineTo(minimapX + minimapWidth - cornerOffset - cornerSize, minimapY + minimapHeight - cornerOffset);
  ctx.stroke();
  
  // Add small corner dots for extra tactical feel
  const dotRadius = 2;
  ctx.fillStyle = '#00d4ff';
  ctx.beginPath();
  ctx.arc(minimapX + cornerOffset, minimapY + cornerOffset, dotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(minimapX + minimapWidth - cornerOffset, minimapY + cornerOffset, dotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(minimapX + cornerOffset, minimapY + minimapHeight - cornerOffset, dotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(minimapX + minimapWidth - cornerOffset, minimapY + minimapHeight - cornerOffset, dotRadius, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
  
  // X button now handled by React components, not canvas drawing
  ctx.restore(); // Restore context after drawing all elements

  // Tab bar now handled by React components, not canvas drawing
}

// Export the calculated dimensions for potential use elsewhere (e.g., mouse interaction checks)
export const MINIMAP_DIMENSIONS = {
  width: MINIMAP_WIDTH,
  height: MINIMAP_HEIGHT,
};

// Add worldToMinimap export if needed by DeathScreen click handling
// Export helper function to convert world coords to minimap screen coords
export const worldToMinimapCoords = (
  worldX: number, worldY: number,
  minimapX: number, minimapY: number, minimapWidth: number, minimapHeight: number,
  drawOffsetX: number, drawOffsetY: number, currentScale: number
): { x: number; y: number } | null => {
  const screenX = drawOffsetX + worldX * currentScale;
  const screenY = drawOffsetY + worldY * currentScale;
  // Basic check if within minimap bounds (can be more precise)
  if (screenX >= minimapX && screenX <= minimapX + minimapWidth &&
      screenY >= minimapY && screenY <= minimapY + minimapHeight) {
    return { x: screenX, y: screenY };
  } else {
    return null; // Off the minimap at current zoom/pan
  }
};

// Export calculation logic for draw offsets and scale if needed
export const calculateMinimapViewport = (
  minimapWidth: number, minimapHeight: number,
  worldPixelWidth: number, worldPixelHeight: number,
  zoomLevel: number,
  localPlayer: SpacetimeDBPlayer | undefined, // Use undefined for clarity
  viewCenterOffset: { x: number; y: number }
) => {
    const baseScaleX = minimapWidth / worldPixelWidth;
    const baseScaleY = minimapHeight / worldPixelHeight;
    const baseUniformScale = Math.min(baseScaleX, baseScaleY);
    const currentScale = baseUniformScale * zoomLevel;

    let viewCenterXWorld: number;
    let viewCenterYWorld: number;

    if (zoomLevel <= 1 || !localPlayer) {
      viewCenterXWorld = worldPixelWidth / 2;
      viewCenterYWorld = worldPixelHeight / 2;
    } else {
      viewCenterXWorld = localPlayer.positionX + viewCenterOffset.x;
      viewCenterYWorld = localPlayer.positionY + viewCenterOffset.y;
    }

    const viewWidthWorld = minimapWidth / currentScale;
    const viewHeightWorld = minimapHeight / currentScale;
    const viewMinXWorld = viewCenterXWorld - viewWidthWorld / 2;
    const viewMinYWorld = viewCenterYWorld - viewHeightWorld / 2;

    // Calculate draw offsets based on minimap's top-left screen position (assumed 0,0 for calculation)
    // Actual screen position (minimapX, minimapY) needs to be added separately when drawing.
    const drawOffsetX = -viewMinXWorld * currentScale;
    const drawOffsetY = -viewMinYWorld * currentScale;

    return { currentScale, drawOffsetX, drawOffsetY, viewMinXWorld, viewMinYWorld };
};

// X button functionality now handled by React components

// Helper function to check if a point is within the minimap bounds
export const isPointInMinimap = (
  mouseX: number,
  mouseY: number,
  canvasWidth: number,
  canvasHeight: number
): boolean => {
  const minimapX = (canvasWidth - MINIMAP_WIDTH) / 2;
  const minimapY = (canvasHeight - MINIMAP_HEIGHT) / 2;
  
  return mouseX >= minimapX && 
         mouseX <= minimapX + MINIMAP_WIDTH && 
         mouseY >= minimapY && 
         mouseY <= minimapY + MINIMAP_HEIGHT;
};

// Helper function to check if a click is outside the minimap (for closing)
export const isClickOutsideMinimap = (
  mouseX: number,
  mouseY: number,
  canvasWidth: number,
  canvasHeight: number
): boolean => {
  return !isPointInMinimap(mouseX, mouseY, canvasWidth, canvasHeight);
};

// Tab functionality moved to React components

export default drawMinimapOntoCanvas;