import { WorldTile } from '../generated/world_tile_type';

// Import autotile images (15-tile hierarchical format, 512×640)
import grassBeachAutotile from '../assets/tiles/new/tileset_grass_beach_autotile_2.png';
import beachSeaAutotile from '../assets/tiles/new/tileset_beach_sea_autotile_2.png';
import grassDirtAutotile from '../assets/tiles/new/tileset_grass_dirt_autotile.png';
import dirtBeachAutotile from '../assets/tiles/new/tileset_dirt_beach_autotile.png';
import grassDirtRoadAutotile from '../assets/tiles/new/tileset_grass_dirtroad_autotile.png';
import grassTundraAutotile from '../assets/tiles/new/tileset_grass_tundra_autotile.png';
import grassTundraGrassAutotile from '../assets/tiles/new/tileset_grass_tundragrass_autotile.png';
import grassForestAutotile from '../assets/tiles/new/tileset_grass_forest_autotile.png';
import quarryGrassAutotile from '../assets/tiles/new/tileset_quarry_grass_autotile.png';
import beachDirtRoadAutotile from '../assets/tiles/new/tileset_beach_dirtroad_autotile.png';
import dirtDirtRoadAutotile from '../assets/tiles/new/tileset_dirt_dirtroad_autotile.png';
import dirtRoadTundraAutotile from '../assets/tiles/new/tileset_dirtroad_tundra_autotile.png';
// REMOVED: forestGrassAutotile (using Forest_TundraGrass instead)
import forestDirtRoadAutotile from '../assets/tiles/new/tileset_forest_dirtroad_autotile.png';
import forestBeachAutotile from '../assets/tiles/new/tileset_forest_beach_autotile.png';
import forestDirtAutotile from '../assets/tiles/new/tileset_forest_dirt_autotile.png';
import tundraBeachAutotile from '../assets/tiles/new/tileset_tundra_beach_autotile.png';
import dirtTundraAutotile from '../assets/tiles/new/tileset_dirt_tundra_autotile.png';
import quarryDirtAutotile from '../assets/tiles/new/tileset_quarry_dirt_autotile.png';
import quarryBeachAutotile from '../assets/tiles/new/tileset_quarry_beach_autotile.png';
import quarryDirtRoadAutotile from '../assets/tiles/new/tileset_quarry_dirtroad_autotile.png';
import quarryTundraAutotile from '../assets/tiles/new/tileset_quarry_tundra_autotile.png';
import quarryAlpineAutotile from '../assets/tiles/new/tileset_quarry_alpine_autotile.png';
import quarryForestAutotile from '../assets/tiles/new/tileset_quarry_forest_autotile.png';
import asphaltDirtRoadAutotile from '../assets/tiles/new/tileset_asphalt_dirtroad_autotile.png';
import asphaltDirtAutotile from '../assets/tiles/new/tileset_asphalt_dirt_autotile.png';
import asphaltBeachAutotile from '../assets/tiles/new/tileset_asphalt_beach_autotile.png';
import asphaltAlpineAutotile from '../assets/tiles/new/tileset_asphalt_alpine_autotile.png';
import asphaltTundraAutotile from '../assets/tiles/new/tileset_asphalt_tundra_autotile.png';
import asphaltSeaAutotile from '../assets/tiles/new/tileset_asphalt_sea_autotile.png';
import alpineDirtRoadAutotile from '../assets/tiles/new/tileset_alpine_dirtroad_autotile.png';
import alpineDirtAutotile from '../assets/tiles/new/tileset_alpine_dirt_autotile.png';
import alpineBeachAutotile from '../assets/tiles/new/tileset_alpine_beach_autotile.png';
import alpineTundraAutotile from '../assets/tiles/new/tileset_alpine_tundra_autotile.png';
import forestTundraAutotile from '../assets/tiles/new/tileset_forest_tundra_autotile.png';
import beachHotSpringWaterAutotile from '../assets/tiles/new/tileset_beach_hotspringwater_autotile.png';
import tundraGrassTundraAutotile from '../assets/tiles/new/tileset_tundragrass_tundra_autotile.png';
import alpineTundraGrassAutotile from '../assets/tiles/new/tileset_alpine_tundragrass_autotile.png';
import tundraGrassBeachAutotile from '../assets/tiles/new/tileset_tundragrass_beach_autotile.png';
// REMOVED: tundraGrassDirtAutotile and tundraGrassDirtRoadAutotile (using Dirt_TundraGrass and DirtRoad_TundraGrass instead)
// REMOVED: tundraGrassGrassAutotile (using Grass_TundraGrass instead)
import quarryTundraGrassAutotile from '../assets/tiles/new/tileset_quarry_tundragrass_autotile.png';
import dirtRoadTundraGrassAutotile from '../assets/tiles/new/tileset_dirtroad_tundragrass_autotile.png';
import forestTundraGrassAutotile from '../assets/tiles/new/tileset_forest_tundragrass_autotile.png';
import dirtTundraGrassAutotile from '../assets/tiles/new/tileset_dirt_tundragrass_autotile.png';

/**
 * 15-Tile Hierarchical Autotile System
 * =====================================
 * 
 * Tileset Layout: 512×640px with 128×128 pixel tiles (4 cols × 5 rows)
 * 
 * Column 0 contains interior tiles. Transition tiles are in columns 1-3:
 * 
 *   Col:    0       1       2       3
 *   Row 0: [INT]   [A1]    [A2]    [A3]   <- 3×3 island top row
 *   Row 1: [--]    [A4]    [A5]    [A6]   <- 3×3 island middle row
 *   Row 2: [--]    [A7]    [A8]    [A9]   <- 3×3 island bottom row
 *   Row 3: [--]    [B1]    [B2]    [C1]   <- 2×2 pond top + 1×2 strip
 *   Row 4: [--]    [B3]    [B4]    [C2]   <- 2×2 pond bottom + 1×2 strip
 * 
 * A-tiles (3×3 Island): Land edges touching water (convex corners)
 * B-tiles (2×2 Pond): Water fully enclosed by land (concave corners)
 * C-tiles (1×2 Strip): Special coastline connectors
 */

// =============================================================================
// TILESET CONSTANTS
// =============================================================================

/** Tile size in pixels */
export const TILE_SIZE = 128;

/** Tileset dimensions */
export const TILESET_WIDTH = 512;
export const TILESET_HEIGHT = 640;
export const TILESET_COLS = 4;
export const TILESET_ROWS = 5;

// =============================================================================
// TILE POSITION DEFINITIONS
// =============================================================================

/** 
 * Tile positions in the tileset (row, col)
 * 
 * The tileset has TWO sections:
 * 1. A-tiles (3×3): For CONVEX corners (island shape) - primary material bulges out
 * 2. B-tiles (2×2): For CONCAVE corners (pond/hole shape) - primary material curves inward
 */
export const TILE_POSITIONS = {
    // 3×3 Island Autotile (A1-A9) - CONVEX corners, edges
    A1: { row: 0, col: 1 }, // Convex corner NW
    A2: { row: 0, col: 2 }, // Top edge
    A3: { row: 0, col: 3 }, // Convex corner NE
    A4: { row: 1, col: 1 }, // Left edge
    A5: { row: 1, col: 2 }, // Center/Full - interior
    A6: { row: 1, col: 3 }, // Right edge
    A7: { row: 2, col: 1 }, // Convex corner SW
    A8: { row: 2, col: 2 }, // Bottom edge
    A9: { row: 2, col: 3 }, // Convex corner SE
    
    // 2×2 Pond/Hole Tiles (B1-B4) - CONCAVE corners
    B1: { row: 3, col: 1 }, // Concave at SE
    B2: { row: 3, col: 2 }, // Concave at SW
    B3: { row: 4, col: 1 }, // Concave at NE
    B4: { row: 4, col: 2 }, // Concave at NW
    
    // 1×2 Coastline Strips (C1-C2)
    C1: { row: 3, col: 3 },
    C2: { row: 4, col: 3 },
};

// =============================================================================
// NEIGHBOR DIRECTION CONSTANTS
// =============================================================================

/** Cardinal directions */
const DIR_N = 0b0001;
const DIR_E = 0b0010;
const DIR_S = 0b0100;
const DIR_W = 0b1000;

/** Diagonal directions */
const DIR_NE = 0b00010000;
const DIR_SE = 0b00100000;
const DIR_SW = 0b01000000;
const DIR_NW = 0b10000000;

/** Neighbor offsets for 8-directional checking */
const NEIGHBOR_OFFSETS = {
    N:  { x:  0, y: -1, bit: DIR_N },
    NE: { x:  1, y: -1, bit: DIR_NE },
    E:  { x:  1, y:  0, bit: DIR_E },
    SE: { x:  1, y:  1, bit: DIR_SE },
    S:  { x:  0, y:  1, bit: DIR_S },
    SW: { x: -1, y:  1, bit: DIR_SW },
    W:  { x: -1, y:  0, bit: DIR_W },
    NW: { x: -1, y: -1, bit: DIR_NW },
};

/** Cardinal-only offsets for overwhelmed tile detection */
const CARDINAL_OFFSETS = [
    { x:  0, y: -1, bit: DIR_N },  // N
    { x:  1, y:  0, bit: DIR_E },  // E
    { x:  0, y:  1, bit: DIR_S },  // S
    { x: -1, y:  0, bit: DIR_W },  // W
];

// =============================================================================
// TYPE MAPPING HELPER
// =============================================================================

/**
 * Map tile types to their autotile-equivalent base types.
 * This ensures consistent behavior across different tile types that should
 * transition similarly.
 */
function mapTileTypeForAutotile(tileType: string | undefined, primaryType?: string, secondaryType?: string): string | undefined {
    if (!tileType) return undefined;
    
    // Don't map Forest to Grass when checking Forest_* transitions (Forest is primary)
    // Also don't map Forest to Grass when checking Quarry_Forest - we want to detect Forest neighbors
    if (tileType === 'Forest' && primaryType === 'Forest') return 'Forest';
    // CRITICAL: When Quarry is primary, ALWAYS keep Forest distinct so Quarry_Forest can be detected (not Quarry_Grass)
    if (tileType === 'Forest' && primaryType === 'Quarry') return 'Forest'; // Keep Forest for ALL Quarry transitions
    if (tileType === 'Forest') return 'Grass';
    
    // Don't map Tundra to Grass when checking Forest_Tundra transitions (Tundra is secondary)
    if (tileType === 'Tundra' && primaryType === 'Forest' && secondaryType === 'Tundra') return 'Tundra';
    
    // Don't map Quarry to Dirt when checking Quarry_* transitions (Quarry is primary)
    // Also don't map Quarry to Dirt when checking Grass_Dirt - we want Grass to use Quarry_Grass instead
    if (tileType === 'Quarry' && primaryType === 'Quarry') return 'Quarry';
    if (tileType === 'Quarry' && primaryType === 'Grass' && secondaryType === 'Dirt') return 'Quarry'; // Don't treat as Dirt
    if (tileType === 'Quarry' && secondaryType === 'Dirt') return 'Quarry'; // Keep Quarry distinct from Dirt
    if (tileType === 'Quarry') return 'Dirt';
    
    // CRITICAL: Check TundraGrass_Tundra FIRST before general Tundra mapping
    // Keep Tundra distinct when checking TundraGrass_Tundra transitions (Tundra is secondary)
    if (tileType === 'Tundra' && primaryType === 'TundraGrass' && secondaryType === 'Tundra') return 'Tundra';
    
    // Don't map Tundra to Grass when checking Tundra_* transitions (Tundra is primary)
    // Also don't map Tundra to Grass when checking DirtRoad_Tundra, Grass_Tundra, Dirt_Tundra, Quarry_Tundra, Alpine_Tundra, or Asphalt_Tundra - we want to detect Tundra neighbors
    // IMPORTANT: When checking Quarry_Grass, don't map Tundra to Grass - we want Quarry_Tundra to take priority
    if (tileType === 'Tundra' && primaryType === 'Tundra') return 'Tundra';
    if (tileType === 'Tundra' && primaryType === 'DirtRoad' && secondaryType === 'Tundra') return 'Tundra'; // Keep Tundra for DirtRoad_Tundra
    if (tileType === 'Tundra' && primaryType === 'Grass' && secondaryType === 'Tundra') return 'Tundra'; // Keep Tundra for Grass_Tundra
    if (tileType === 'Tundra' && primaryType === 'Dirt' && secondaryType === 'Tundra') return 'Tundra'; // Keep Tundra for Dirt_Tundra
    if (tileType === 'Tundra' && primaryType === 'Quarry' && secondaryType === 'Tundra') return 'Tundra'; // Keep Tundra for Quarry_Tundra
    if (tileType === 'Tundra' && primaryType === 'Alpine' && secondaryType === 'Tundra') return 'Tundra'; // Keep Tundra for Alpine_Tundra
    if (tileType === 'Tundra' && primaryType === 'Asphalt' && secondaryType === 'Tundra') return 'Tundra'; // Keep Tundra for Asphalt_Tundra
    if (tileType === 'Tundra' && primaryType === 'Quarry' && secondaryType === 'Grass') return 'Tundra'; // Don't map Tundra to Grass when checking Quarry_Grass - prioritize Quarry_Tundra
    if (tileType === 'Tundra') return 'Grass';
    
    // Don't map Asphalt to DirtRoad when checking Asphalt_* transitions (Asphalt is primary)
    // IMPORTANT: When checking Alpine_Beach or Alpine_DirtRoad, don't map Asphalt to DirtRoad - keep Asphalt distinct
    if (tileType === 'Asphalt' && primaryType === 'Asphalt') return 'Asphalt';
    if (tileType === 'Asphalt' && primaryType === 'Alpine' && (secondaryType === 'Beach' || secondaryType === 'DirtRoad')) return 'Asphalt'; // Keep Asphalt for Alpine_Beach and Alpine_DirtRoad
    if (tileType === 'Asphalt') return 'DirtRoad';
    
    // Don't map Alpine to Dirt when checking Alpine_* transitions (Alpine is primary)
    // IMPORTANT: When checking Asphalt_Beach, Asphalt_DirtRoad, Asphalt_Alpine, or Alpine_TundraGrass, don't map Alpine incorrectly
    if (tileType === 'Alpine' && primaryType === 'Alpine') return 'Alpine';
    if (tileType === 'Alpine' && primaryType === 'Quarry' && secondaryType === 'Alpine') return 'Alpine'; // Keep Alpine for Quarry_Alpine
    if (tileType === 'Alpine' && primaryType === 'Asphalt' && secondaryType === 'Alpine') return 'Alpine'; // Keep Alpine for Asphalt_Alpine
    if (tileType === 'Alpine' && primaryType === 'Alpine' && secondaryType === 'TundraGrass') return 'Alpine'; // Keep Alpine for Alpine_TundraGrass
    if (tileType === 'Alpine' && primaryType === 'Asphalt' && secondaryType === 'Beach') return 'Alpine'; // Don't map Alpine to Beach when checking Asphalt_Beach
    if (tileType === 'Alpine' && primaryType === 'Asphalt' && secondaryType === 'DirtRoad') return 'Alpine'; // Don't map Alpine to DirtRoad when checking Asphalt_DirtRoad
    if (tileType === 'Alpine' && primaryType === 'Quarry' && secondaryType === 'Dirt') return 'Alpine'; // Don't map Alpine to Dirt when checking Quarry_Dirt - prioritize Quarry_Alpine
    if (tileType === 'Alpine') return 'Dirt';
    
    // Don't map HotSpringWater to Beach when checking Beach_HotSpringWater transitions (HotSpringWater is secondary)
    if (tileType === 'HotSpringWater' && primaryType === 'Beach' && secondaryType === 'HotSpringWater') return 'HotSpringWater';
    // HotSpringWater can be treated as Beach for other transitions (they're both water-like)
    if (tileType === 'HotSpringWater') return 'Beach';
    
    // Don't map TundraGrass when checking TundraGrass_* transitions (TundraGrass is primary)
    // Also don't map TundraGrass to Tundra when it's the secondary in other configs
    if (tileType === 'TundraGrass' && primaryType === 'TundraGrass') return 'TundraGrass';
    if (tileType === 'TundraGrass' && secondaryType === 'TundraGrass') return 'TundraGrass';
    // CRITICAL: When Quarry is primary, ALWAYS keep TundraGrass distinct so Quarry_TundraGrass can be detected (not Quarry_Tundra)
    if (tileType === 'TundraGrass' && primaryType === 'Quarry') return 'TundraGrass'; // Keep TundraGrass for ALL Quarry transitions
    // CRITICAL: When DirtRoad is primary, keep TundraGrass distinct so DirtRoad_TundraGrass can be detected
    if (tileType === 'TundraGrass' && primaryType === 'DirtRoad') return 'TundraGrass'; // Keep TundraGrass for ALL DirtRoad transitions
    // CRITICAL: When Dirt is primary, keep TundraGrass distinct so Dirt_TundraGrass can be detected (not Dirt_Tundra)
    if (tileType === 'TundraGrass' && primaryType === 'Dirt') return 'TundraGrass'; // Keep TundraGrass for ALL Dirt transitions
    // CRITICAL: When Forest is primary, keep TundraGrass distinct so Forest_TundraGrass can be detected
    if (tileType === 'TundraGrass' && primaryType === 'Forest') return 'TundraGrass'; // Keep TundraGrass for ALL Forest transitions
    // CRITICAL: When Grass is primary, keep TundraGrass distinct so Grass_TundraGrass can be detected (not Grass_Tundra)
    if (tileType === 'TundraGrass' && primaryType === 'Grass') return 'TundraGrass'; // Keep TundraGrass for ALL Grass transitions
    // CRITICAL: When Alpine is primary, keep TundraGrass distinct so Alpine_TundraGrass can be detected (not Alpine_Tundra)
    if (tileType === 'TundraGrass' && primaryType === 'Alpine') return 'TundraGrass'; // Keep TundraGrass for ALL Alpine transitions
    // TundraGrass should be treated as Tundra for other transitions (it's a variant within tundra biome)
    if (tileType === 'TundraGrass') return 'Tundra';
    
    // CRITICAL: When checking Grass_TundraGrass, keep Grass distinct
    if (tileType === 'Grass' && primaryType === 'Grass' && secondaryType === 'TundraGrass') return 'Grass';
    
    return tileType;
}

// =============================================================================
// OVERWHELMED TILE DETECTION
// =============================================================================

/**
 * Check if a tile is "overwhelmed" by secondary type neighbors.
 * A tile is overwhelmed when 3+ of its cardinal directions are the secondary type.
 * 
 * Overwhelmed tiles should:
 * 1. Render as the secondary type's interior (they're "absorbed")
 * 2. Be treated as secondary type by their neighbors (so adjacent same-type
 *    tiles get proper edge transitions toward them)
 * 
 * This handles narrow peninsulas (1x2 strips, single-tile protrusions, etc.)
 * that can't be properly autotiled with standard edge tiles.
 */
function isOverwhelmedTile(
    x: number,
    y: number,
    worldTiles: Map<string, WorldTile>,
    primaryType: string,
    secondaryType: string
): boolean {
    const tileKey = `${x}_${y}`;
    const tile = worldTiles.get(tileKey);
    
    if (!tile) return false;
    
    const tileType = mapTileTypeForAutotile(tile.tileType?.tag, primaryType, secondaryType);
    
    // Only check tiles that are the primary type
    if (tileType !== primaryType) return false;
    
    // Count how many cardinal neighbors are the secondary type
    let cardinalSecondaryCount = 0;
    
    for (const offset of CARDINAL_OFFSETS) {
        const neighborKey = `${x + offset.x}_${y + offset.y}`;
        const neighborTile = worldTiles.get(neighborKey);
        
        if (neighborTile) {
            const neighborType = mapTileTypeForAutotile(neighborTile.tileType?.tag, primaryType, secondaryType);
            if (neighborType === secondaryType) {
                cardinalSecondaryCount++;
            }
        }
    }
    
    // Overwhelmed if 3+ cardinal neighbors are secondary type
    return cardinalSecondaryCount >= 3;
}

// =============================================================================
// AUTOTILE CONFIGURATION
// =============================================================================

/**
 * Autotile configuration for tile type transitions
 */
export interface AutotileConfig {
    primaryType: string;
    secondaryType: string;
    tilesetPath: string;
    tileSize: number;
    columns: number;
    rows: number;
    primaryInterior: { row: number; col: number };
    secondaryInterior: { row: number; col: number };
}

/**
 * Autotile configurations for all supported tile transitions
 */
export const AUTOTILE_CONFIGS: { [key: string]: AutotileConfig } = {
    'Grass_Beach': {
        primaryType: 'Grass',
        secondaryType: 'Beach',
        tilesetPath: grassBeachAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Grass_HotSpringWater': {
        primaryType: 'Grass',
        secondaryType: 'HotSpringWater',
        tilesetPath: grassBeachAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Beach_Sea': {
        primaryType: 'Beach',
        secondaryType: 'Sea',
        tilesetPath: beachSeaAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Beach_HotSpringWater': {
        primaryType: 'Beach',
        secondaryType: 'HotSpringWater',
        tilesetPath: beachHotSpringWaterAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Grass_Dirt': {
        primaryType: 'Grass',
        secondaryType: 'Dirt',
        tilesetPath: grassDirtAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Grass_Tundra': {
        primaryType: 'Grass',
        secondaryType: 'Tundra',
        tilesetPath: grassTundraAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Grass_TundraGrass': {
        primaryType: 'Grass',
        secondaryType: 'TundraGrass',
        tilesetPath: grassTundraGrassAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Grass_Forest': {
        primaryType: 'Grass',
        secondaryType: 'Forest',
        tilesetPath: grassForestAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Quarry_Grass': {
        primaryType: 'Quarry',
        secondaryType: 'Grass',
        tilesetPath: quarryGrassAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Quarry_Dirt': {
        primaryType: 'Quarry',
        secondaryType: 'Dirt',
        tilesetPath: quarryDirtAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Quarry_Beach': {
        primaryType: 'Quarry',
        secondaryType: 'Beach',
        tilesetPath: quarryBeachAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Quarry_DirtRoad': {
        primaryType: 'Quarry',
        secondaryType: 'DirtRoad',
        tilesetPath: quarryDirtRoadAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Quarry_Tundra': {
        primaryType: 'Quarry',
        secondaryType: 'Tundra',
        tilesetPath: quarryTundraAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Quarry_Forest': {
        primaryType: 'Quarry',
        secondaryType: 'Forest',
        tilesetPath: quarryForestAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Quarry_TundraGrass': {
        primaryType: 'Quarry',
        secondaryType: 'TundraGrass',
        tilesetPath: quarryTundraGrassAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Asphalt_DirtRoad': {
        primaryType: 'Asphalt',
        secondaryType: 'DirtRoad',
        tilesetPath: asphaltDirtRoadAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Asphalt_Dirt': {
        primaryType: 'Asphalt',
        secondaryType: 'Dirt',
        tilesetPath: asphaltDirtAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Asphalt_Beach': {
        primaryType: 'Asphalt',
        secondaryType: 'Beach',
        tilesetPath: asphaltBeachAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Asphalt_Alpine': {
        primaryType: 'Asphalt',
        secondaryType: 'Alpine',
        tilesetPath: asphaltAlpineAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Asphalt_Tundra': {
        primaryType: 'Asphalt',
        secondaryType: 'Tundra',
        tilesetPath: asphaltTundraAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Asphalt_Sea': {
        primaryType: 'Asphalt',
        secondaryType: 'Sea',
        tilesetPath: asphaltSeaAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Alpine_DirtRoad': {
        primaryType: 'Alpine',
        secondaryType: 'DirtRoad',
        tilesetPath: alpineDirtRoadAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Alpine_Dirt': {
        primaryType: 'Alpine',
        secondaryType: 'Dirt',
        tilesetPath: alpineDirtAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Alpine_Beach': {
        primaryType: 'Alpine',
        secondaryType: 'Beach',
        tilesetPath: alpineBeachAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Alpine_Tundra': {
        primaryType: 'Alpine',
        secondaryType: 'Tundra',
        tilesetPath: alpineTundraAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Quarry_Alpine': {
        primaryType: 'Quarry',
        secondaryType: 'Alpine',
        tilesetPath: quarryAlpineAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Dirt_Beach': {
        primaryType: 'Dirt',
        secondaryType: 'Beach',
        tilesetPath: dirtBeachAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Dirt_Tundra': {
        primaryType: 'Dirt',
        secondaryType: 'Tundra',
        tilesetPath: dirtTundraAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Dirt_TundraGrass': {
        primaryType: 'Dirt',
        secondaryType: 'TundraGrass',
        tilesetPath: dirtTundraGrassAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Grass_DirtRoad': {
        primaryType: 'Grass',
        secondaryType: 'DirtRoad',
        tilesetPath: grassDirtRoadAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Beach_DirtRoad': {
        primaryType: 'Beach',
        secondaryType: 'DirtRoad',
        tilesetPath: beachDirtRoadAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Dirt_DirtRoad': {
        primaryType: 'Dirt',
        secondaryType: 'DirtRoad',
        tilesetPath: dirtDirtRoadAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'DirtRoad_Tundra': {
        primaryType: 'DirtRoad',
        secondaryType: 'Tundra',
        tilesetPath: dirtRoadTundraAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'DirtRoad_TundraGrass': {
        primaryType: 'DirtRoad',
        secondaryType: 'TundraGrass',
        tilesetPath: dirtRoadTundraGrassAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    // REMOVED: Forest_Grass
    // Using Forest_TundraGrass instead to avoid double borders
    // Forest tiles autotile with TundraGrass neighbors (one-sided transition)
    'Forest_Dirt': {
        primaryType: 'Forest',
        secondaryType: 'Dirt',
        tilesetPath: forestDirtAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Forest_DirtRoad': {
        primaryType: 'Forest',
        secondaryType: 'DirtRoad',
        tilesetPath: forestDirtRoadAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Forest_Beach': {
        primaryType: 'Forest',
        secondaryType: 'Beach',
        tilesetPath: forestBeachAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Tundra_Beach': {
        primaryType: 'Tundra',
        secondaryType: 'Beach',
        tilesetPath: tundraBeachAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'TundraGrass_Tundra': {
        primaryType: 'TundraGrass',
        secondaryType: 'Tundra',
        tilesetPath: tundraGrassTundraAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Alpine_TundraGrass': {
        primaryType: 'Alpine',
        secondaryType: 'TundraGrass',
        tilesetPath: alpineTundraGrassAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'TundraGrass_Beach': {
        primaryType: 'TundraGrass',
        secondaryType: 'Beach',
        tilesetPath: tundraGrassBeachAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    // REMOVED: TundraGrass_Dirt and TundraGrass_DirtRoad 
    // These were causing double borders with Dirt_TundraGrass and DirtRoad_TundraGrass
    // Now only Dirt/DirtRoad autotile with TundraGrass (one-sided transition)
    // REMOVED: TundraGrass_Grass
    // Using Grass_TundraGrass instead to avoid double borders
    // Grass tiles autotile with TundraGrass neighbors (one-sided transition)
    'Forest_Tundra': {
        primaryType: 'Forest',
        secondaryType: 'Tundra',
        tilesetPath: forestTundraAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    'Forest_TundraGrass': {
        primaryType: 'Forest',
        secondaryType: 'TundraGrass',
        tilesetPath: forestTundraGrassAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
    // REMOVED: HotSpringWater_Beach
    // Using Beach_HotSpringWater instead to avoid double borders
    // Beach tiles autotile with HotSpringWater neighbors (one-sided transition)
    // NOTE: DirtRoad_Dirt was removed because using the same tileset with swapped
    // interiors doesn't work - the transition tiles (A1-A9, B1-B4) are designed
    // for Dirt->DirtRoad direction only. DirtRoad tiles will use secondaryInterior
    // from Dirt_DirtRoad when surrounded by Dirt.
};

// =============================================================================
// NEIGHBOR ANALYSIS
// =============================================================================

/**
 * Analyze neighbors and return bitmask of which neighbors are the secondary type.
 * 
 * This also treats "overwhelmed" same-type neighbors as secondary type.
 * An overwhelmed tile is one that has 3+ cardinal neighbors of the secondary type,
 * meaning it should visually be absorbed into the secondary type.
 * By treating overwhelmed neighbors as secondary, adjacent tiles will properly
 * render edge transitions toward them.
 */
function getNeighborMask(
    x: number,
    y: number,
    worldTiles: Map<string, WorldTile>,
    secondaryType: string,
    primaryType?: string // Optional: primary tile type for context-aware mapping
): number {
    let mask = 0;
    
    for (const [, offset] of Object.entries(NEIGHBOR_OFFSETS)) {
        const neighborX = x + offset.x;
        const neighborY = y + offset.y;
        const neighborKey = `${neighborX}_${neighborY}`;
        const neighborTile = worldTiles.get(neighborKey);
        
        if (neighborTile) {
            const originalNeighborType = neighborTile.tileType?.tag;
            const neighborType = mapTileTypeForAutotile(originalNeighborType, primaryType, secondaryType);
            
            // Skip DirtRoad neighbors when checking for non-DirtRoad secondary types
            // This prevents DirtRoad from interfering with other transitions
            // Skip DirtRoad neighbors when checking for non-DirtRoad secondary types
            // This prevents DirtRoad from interfering with other transitions
            if (originalNeighborType === 'DirtRoad' && secondaryType !== 'DirtRoad') {
                continue; // Skip DirtRoad neighbors when not checking for DirtRoad
            }
            
            // Skip Asphalt neighbors when checking for non-Asphalt secondary types (unless it's the secondary type)
            // This prevents Asphalt from interfering with Alpine/Beach transitions
            if (originalNeighborType === 'Asphalt' && secondaryType !== 'Asphalt' && primaryType !== 'Asphalt') {
                continue; // Skip Asphalt neighbors when not checking for Asphalt transitions
            }
            
            // Skip Alpine neighbors when checking for non-Alpine secondary types (unless it's the secondary type)
            // This prevents Alpine from interfering with Asphalt/Beach transitions
            // CRITICAL: Don't skip Alpine when checking Alpine_TundraGrass (Alpine is primary, TundraGrass is secondary)
            if (originalNeighborType === 'Alpine' && secondaryType !== 'Alpine' && primaryType !== 'Alpine') {
                continue; // Skip Alpine neighbors when not checking for Alpine transitions
            }
            
            // Skip Sea neighbors when checking for Beach_HotSpringWater transitions (Sea is different from HotSpringWater)
            // This prevents Sea from interfering with Beach_HotSpringWater transitions
            if (originalNeighborType === 'Sea' && primaryType === 'Beach' && secondaryType === 'HotSpringWater') {
                continue; // Skip Sea neighbors when checking Beach_HotSpringWater - we want HotSpringWater neighbors only
            }
            
            // Skip Forest neighbors when checking for Quarry transitions that aren't Quarry_Forest
            // This prevents Forest from interfering with Quarry_Grass transitions (Quarry_Forest should take priority)
            if (originalNeighborType === 'Forest' && primaryType === 'Quarry' && secondaryType !== 'Forest') {
                continue; // Skip Forest neighbors when checking Quarry_Grass - prioritize Quarry_Forest
            }
            
            // Skip Tundra neighbors when checking for Quarry_TundraGrass transitions
            // This prevents Tundra from interfering with Quarry_TundraGrass (we want TundraGrass neighbors)
            if (originalNeighborType === 'Tundra' && primaryType === 'Quarry' && secondaryType === 'TundraGrass') {
                continue; // Skip Tundra neighbors when checking Quarry_TundraGrass - we want TundraGrass neighbors
            }
            
            // Skip TundraGrass neighbors when checking for Quarry transitions that aren't Quarry_TundraGrass
            // This prevents TundraGrass from interfering with Quarry_Tundra (Quarry_TundraGrass should take priority)
            if (originalNeighborType === 'TundraGrass' && primaryType === 'Quarry' && secondaryType !== 'TundraGrass') {
                continue; // Skip TundraGrass neighbors when checking other Quarry configs - prioritize Quarry_TundraGrass
            }
            
            // CRITICAL: Skip TundraGrass neighbors when checking DirtRoad_Tundra
            // This prevents TundraGrass from being incorrectly matched as Tundra
            // TundraGrass neighbors should ONLY match DirtRoad_TundraGrass, not DirtRoad_Tundra
            if (originalNeighborType === 'TundraGrass' && primaryType === 'DirtRoad' && secondaryType === 'Tundra') {
                continue; // Skip TundraGrass neighbors when checking DirtRoad_Tundra - they should match DirtRoad_TundraGrass instead
            }
            
            // Skip TundraGrass neighbors when checking for DirtRoad transitions that aren't DirtRoad_TundraGrass
            // This prevents TundraGrass from interfering with other DirtRoad configs (DirtRoad_TundraGrass should take priority)
            if (originalNeighborType === 'TundraGrass' && primaryType === 'DirtRoad' && secondaryType !== 'TundraGrass') {
                continue; // Skip TundraGrass neighbors when checking other DirtRoad configs - prioritize DirtRoad_TundraGrass
            }
            
            // Skip Tundra neighbors when checking for DirtRoad_TundraGrass transitions
            // This prevents Tundra from interfering with DirtRoad_TundraGrass (we want TundraGrass neighbors)
            if (originalNeighborType === 'Tundra' && primaryType === 'DirtRoad' && secondaryType === 'TundraGrass') {
                continue; // Skip Tundra neighbors when checking DirtRoad_TundraGrass - we want TundraGrass neighbors
            }
            
            // Skip TundraGrass neighbors when checking for Forest transitions that aren't Forest_TundraGrass
            // This prevents TundraGrass from interfering with Forest_Tundra (Forest_TundraGrass should take priority)
            if (originalNeighborType === 'TundraGrass' && primaryType === 'Forest' && secondaryType !== 'TundraGrass') {
                continue; // Skip TundraGrass neighbors when checking other Forest configs - prioritize Forest_TundraGrass
            }
            
            // Skip Tundra neighbors when checking for Forest_TundraGrass transitions
            // This prevents Tundra from interfering with Forest_TundraGrass (we want TundraGrass neighbors)
            if (originalNeighborType === 'Tundra' && primaryType === 'Forest' && secondaryType === 'TundraGrass') {
                continue; // Skip Tundra neighbors when checking Forest_TundraGrass - we want TundraGrass neighbors
            }
            
            // CRITICAL: Skip Grass neighbors when checking Forest_TundraGrass transitions
            // This prevents Grass from interfering with Forest_TundraGrass (we want ONLY TundraGrass neighbors)
            // Forest_TundraGrass should take priority over Forest_Grass when TundraGrass neighbors exist
            if (originalNeighborType === 'Grass' && primaryType === 'Forest' && secondaryType === 'TundraGrass') {
                continue; // Skip Grass neighbors when checking Forest_TundraGrass - we want TundraGrass neighbors only
            }
            
            // Skip TundraGrass neighbors when checking for TundraGrass_* transitions
            // TundraGrass should only detect the specific secondary type neighbors, not other TundraGrass tiles
            if (originalNeighborType === 'TundraGrass' && primaryType === 'TundraGrass') {
                continue; // Skip TundraGrass neighbors - we only want to detect the secondary type neighbors
            }
            
            // Skip Tundra neighbors when checking for TundraGrass transitions that aren't TundraGrass_Tundra
            // This prevents Tundra from interfering with TundraGrass_Beach, etc.
            // Note: Alpine_TundraGrass is now Alpine primary, so Tundra neighbors are handled differently
            if (originalNeighborType === 'Tundra' && primaryType === 'TundraGrass' && secondaryType !== 'Tundra') {
                continue; // Skip Tundra neighbors when checking TundraGrass_* (except TundraGrass_Tundra)
            }
            
            // CRITICAL: Skip Tundra neighbors when checking Alpine_TundraGrass transitions
            // This prevents Tundra from interfering with Alpine_TundraGrass (we want TundraGrass neighbors)
            if (originalNeighborType === 'Tundra' && primaryType === 'Alpine' && secondaryType === 'TundraGrass') {
                continue; // Skip Tundra neighbors when checking Alpine_TundraGrass - we want TundraGrass neighbors
            }
            
            // CRITICAL: Skip TundraGrass neighbors when checking Grass_TundraGrass transitions
            // This prevents TundraGrass from being incorrectly matched as Tundra
            // TundraGrass neighbors should ONLY match Grass_TundraGrass, not Grass_Tundra
            if (originalNeighborType === 'TundraGrass' && primaryType === 'Grass' && secondaryType === 'TundraGrass') {
                // Don't skip - we want TundraGrass neighbors for Grass_TundraGrass
            } else if (originalNeighborType === 'TundraGrass' && primaryType === 'Grass') {
                continue; // Skip TundraGrass neighbors when checking other Grass configs
            }
            
            // CRITICAL: Skip Tundra neighbors when checking Grass_TundraGrass transitions
            // This prevents Tundra from interfering with Grass_TundraGrass (we want TundraGrass neighbors)
            if (originalNeighborType === 'Tundra' && primaryType === 'Grass' && secondaryType === 'TundraGrass') {
                continue; // Skip Tundra neighbors when checking Grass_TundraGrass - we want TundraGrass neighbors
            }
            
            // Grass neighbors should pass through for Grass_TundraGrass transitions
            
            // Count as secondary if:
            // 1. The neighbor's ACTUAL type matches the secondary type (check original type FIRST)
            // 2. OR the neighbor's mapped type matches the secondary type
            // 3. OR the neighbor is the same primary type BUT is "overwhelmed"
            
            // CRITICAL: Check ACTUAL neighbor type first before mapping
            // This ensures TundraGrass neighbors match TundraGrass, not Tundra or Grass
            if (originalNeighborType === secondaryType) {
                mask |= offset.bit;
            } else if (neighborType === secondaryType) {
                mask |= offset.bit;
            } else if (primaryType && neighborType === primaryType) {
                // Check if this same-type neighbor is overwhelmed
                // If so, treat it as secondary (it will render as secondary interior)
                if (isOverwhelmedTile(neighborX, neighborY, worldTiles, primaryType, secondaryType)) {
                    mask |= offset.bit;
                }
            }
        }
    }
    
    return mask;
}

// =============================================================================
// TILE SELECTION
// =============================================================================

/**
 * Select the appropriate tile from the 3×3 island autotile based on neighbor mask.
 * 
 * Returns null if the tile is "fully overwhelmed" (4 cardinal neighbors of secondary type),
 * indicating it should render as secondary interior instead.
 * 
 * For 3-cardinal cases (narrow peninsula base), returns an edge tile facing the
 * primary body direction - this handles the "base of peninsula" case where the tile
 * is mostly surrounded but still connected to the main body on one side.
 */
function selectIslandTile(mask: number): { row: number; col: number } | null {
    // Handle diagonal-only bitmasks
    if (mask === 16) return { row: 4, col: 1 };  // NE diagonal
    if (mask === 32) return { row: 3, col: 1 };  // SE diagonal
    if (mask === 64) return { row: 3, col: 2 };  // SW diagonal
    if (mask === 128) return { row: 4, col: 2 }; // NW diagonal
    
    // Handle opposite diagonal pairs (connector tiles)
    // NW + SE (160 = 128 + 32): Dirt in top-right and bottom-left corners
    if (mask === 20) return { row: 2, col: 3 };
    if (mask === 80) return { row: 4, col: 3 };
    if (mask === 115) return { row: 0, col: 0 };
    if (mask === 126) return { row: 0, col: 0 };
    if (mask === 9) return { row: 0, col: 1 };
    if (mask === 146) return { row: 0, col: 3 };
    if (mask === 160) return { row: 3, col: 3 };
    if (mask === 162) return { row: 0, col: 3 };
    if (mask === 164) return { row: 4, col: 2 };
    if (mask === 166) return { row: 0, col: 0 };
    if (mask === 168) return { row: 2, col: 1 };
    if (mask === 169) return { row: 0, col: 0 };
    if (mask === 170) return { row: 0, col: 0 };
    if (mask === 177) return { row: 0, col: 3 };
    if (mask === 178) return { row: 0, col: 3 };
    if (mask === 183) return { row: 0, col: 0 };
    if (mask === 187) return { row: 0, col: 0 };
    if (mask === 232) return { row: 2, col: 1 };

    // NE + SW (96 = 16 + 64): Dirt in top-left and bottom-right corners  
    if (mask === 96) return { row: 3, col: 3 };
    
    // No neighbors - interior tile
    if (mask === 0) return TILE_POSITIONS.A5;
    
    const hasN = (mask & DIR_N) !== 0;
    const hasE = (mask & DIR_E) !== 0;
    const hasS = (mask & DIR_S) !== 0;
    const hasW = (mask & DIR_W) !== 0;
    const hasNE = (mask & DIR_NE) !== 0;
    const hasSE = (mask & DIR_SE) !== 0;
    const hasSW = (mask & DIR_SW) !== 0;
    const hasNW = (mask & DIR_NW) !== 0;
    
    const cardinalCount = (hasN ? 1 : 0) + (hasE ? 1 : 0) + (hasS ? 1 : 0) + (hasW ? 1 : 0);
    
    // FULLY OVERWHELMED: All 4 cardinal neighbors are secondary type
    // This tile should be absorbed into the secondary type (render as secondary interior)
    if (cardinalCount >= 4) return null;
    
    // THREE CARDINALS: Peninsula base case
    // One cardinal direction connects to primary body, others are secondary
    // Use edge tile facing the open (primary) direction
    // This is imperfect (E/W transitions won't show) but better than full absorption
    if (cardinalCount === 3) {
        // Find which cardinal is NOT secondary (that's where primary body connects)
        // Return edge tile that transitions toward that direction
        if (!hasS) return TILE_POSITIONS.A2; // Open to south (body below) → top edge
        if (!hasN) return TILE_POSITIONS.A8; // Open to north (body above) → bottom edge
        if (!hasW) return TILE_POSITIONS.A6; // Open to west (body left) → right edge
        if (!hasE) return TILE_POSITIONS.A4; // Open to east (body right) → left edge
        // Shouldn't reach here with cardinalCount=3
        return null;
    }
    
    // Two cardinals - corners
    if (cardinalCount === 2) {
        if (hasN && hasE) return hasNE ? TILE_POSITIONS.A3 : TILE_POSITIONS.B3;
        if (hasN && hasW) return hasNW ? TILE_POSITIONS.A1 : TILE_POSITIONS.B4;
        if (hasS && hasE) return hasSE ? TILE_POSITIONS.A9 : TILE_POSITIONS.B1;
        if (hasS && hasW) return hasSW ? TILE_POSITIONS.A7 : TILE_POSITIONS.B2;
        // Channels (N-S or E-W) - use center (primary interior)
        return TILE_POSITIONS.A5;
    }
    
    // Single cardinal - edges
    if (cardinalCount === 1) {
        if (hasN) return TILE_POSITIONS.A2;
        if (hasS) return TILE_POSITIONS.A8;
        if (hasE) return TILE_POSITIONS.A6;
        if (hasW) return TILE_POSITIONS.A4;
    }
    
    // No cardinals but has diagonals - handle opposite diagonal pairs and single diagonals
    if (cardinalCount === 0) {
        // Opposite diagonal pairs (connector tiles)
        if (hasNW && hasSE && !hasNE && !hasSW) return { row: 4, col: 3 }; // C2: NW+SE connector
        if (hasNE && hasSW && !hasNW && !hasSE) return { row: 3, col: 3 }; // C1: NE+SW connector
        
        // Single diagonals (already handled at top, but keep for completeness)
        if (hasNE && !hasSE && !hasSW && !hasNW) return TILE_POSITIONS.A3;
        if (hasNW && !hasNE && !hasSE && !hasSW) return TILE_POSITIONS.A1;
        if (hasSE && !hasNE && !hasNW && !hasSW) return TILE_POSITIONS.A9;
        if (hasSW && !hasNE && !hasNW && !hasSE) return TILE_POSITIONS.A7;
    }
    
    // Handle cases with cardinals + opposite diagonals (like 162 = NW+SE+E)
    // These should also use connector tiles when appropriate
    if (cardinalCount === 1) {
        // NW + SE diagonals with one cardinal
        if (hasNW && hasSE && !hasNE && !hasSW) {
            if (hasE) return { row: 4, col: 3 }; // C2: NW+SE+E connector
            if (hasW) return { row: 4, col: 3 }; // C2: NW+SE+W connector
            if (hasN) return { row: 4, col: 3 }; // C2: NW+SE+N connector
            if (hasS) return { row: 4, col: 3 }; // C2: NW+SE+S connector
        }
        // NE + SW diagonals with one cardinal
        if (hasNE && hasSW && !hasNW && !hasSE) {
            if (hasE) return { row: 3, col: 3 }; // C1: NE+SW+E connector
            if (hasW) return { row: 3, col: 3 }; // C1: NE+SW+W connector
            if (hasN) return { row: 3, col: 3 }; // C1: NE+SW+N connector
            if (hasS) return { row: 3, col: 3 }; // C1: NE+SW+S connector
        }
    }
    
    return TILE_POSITIONS.A5;
}

/**
 * Get sprite coordinates for a tile position
 */
function getSpriteCoords(tilePos: { row: number; col: number }): { 
    x: number; 
    y: number; 
    width: number; 
    height: number 
} {
    return {
        x: tilePos.col * TILE_SIZE,
        y: tilePos.row * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
    };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get autotile sprite coordinates for a specific tile.
 * 
 * When a tile is "overwhelmed" (3+ cardinal neighbors are secondary type),
 * selectIslandTile returns null and we use secondary interior - the tile
 * is visually absorbed into the surrounding type.
 */
export function getAutotileSpriteCoords(
    config: AutotileConfig,
    bitmask: number,
    isSecondaryInterior: boolean = false
): { x: number; y: number; width: number; height: number } {
    if (isSecondaryInterior) {
        return getSpriteCoords(config.secondaryInterior);
    }
    
    if (bitmask === 0) {
        return getSpriteCoords(config.primaryInterior);
    }
    
    const tilePos = selectIslandTile(bitmask);
    
    // If tile is overwhelmed (null), use secondary interior
    // This handles narrow peninsulas/protrusions that can't be properly autotiled
    if (tilePos === null) {
        return getSpriteCoords(config.secondaryInterior);
    }
    
    return getSpriteCoords(tilePos);
}

/**
 * Calculate bitmask for autotile selection based on neighboring tiles
 */
export function calculateAutotileBitmask(
    centerX: number,
    centerY: number,
    worldTiles: Map<string, WorldTile>,
    secondaryType: string,
    primaryType?: string // Optional: primary tile type for context-aware neighbor mapping
): number {
    return getNeighborMask(centerX, centerY, worldTiles, secondaryType, primaryType);
}

/**
 * Determine if a tile should use autotiling and return the appropriate config
 */
export function shouldUseAutotiling(
    tileType: string,
    worldTiles: Map<string, WorldTile>,
    x: number,
    y: number
): { config: AutotileConfig; bitmask: number; isSecondaryInterior?: boolean } | null {
    const centerTileKey = `${x}_${y}`;
    const centerTile = worldTiles.get(centerTileKey);
    
    if (!centerTile) return null;
    
    const actualTileType = centerTile.tileType?.tag;
    if (actualTileType) tileType = actualTileType;
    
    // NEW TILE TYPES: These don't have autotile sheets yet, so render as plain base textures
    // Remove these from the list as you create autotile sheets for them
    const tilesWithoutAutotiles: string[] = []; // HotSpringWater uses Beach_HotSpringWater (Beach is primary)
    
    if (tilesWithoutAutotiles.includes(tileType)) {
        return null; // Render as plain base texture
    }
    
    // Quarry now has its own autotile configs, so keep it as Quarry
    const autotileTileType = tileType;
    
    // Use tile's coordinates if available
    if ('worldX' in centerTile && 'worldY' in centerTile) {
        const tileWorldX = (centerTile as WorldTile).worldX;
        const tileWorldY = (centerTile as WorldTile).worldY;
        if (tileWorldX !== undefined && tileWorldY !== undefined) {
            x = tileWorldX;
            y = tileWorldY;
        }
    }
    
    const mappedTileType = autotileTileType;
    
    // Sort configs to prioritize road overlay transitions FIRST (they're visually on top)
    // Priority: *_DirtRoad (highest - road overlays) > Quarry_* (for interior Quarry tiles) > Grass_Dirt > Grass_Beach > Dirt_Beach
    const configEntries = Object.entries(AUTOTILE_CONFIGS);
    configEntries.sort((a, b) => {
        // HIGHEST priority: DirtRoad transitions (road overlay is visually on top of terrain)
        if (a[0].includes('DirtRoad') && !b[0].includes('DirtRoad')) return -1;
        if (b[0].includes('DirtRoad') && !a[0].includes('DirtRoad')) return 1;
        // Within DirtRoad configs: DirtRoad_TundraGrass before DirtRoad_Tundra (TundraGrass is more specific)
        if (a[0] === 'DirtRoad_TundraGrass' && b[0].startsWith('DirtRoad_')) return -1;
        if (b[0] === 'DirtRoad_TundraGrass' && a[0].startsWith('DirtRoad_')) return 1;
        // Second priority: Quarry configs (ensures interior Quarry tiles use Quarry configs, not Dirt fallback)
        // CRITICAL: Quarry_TundraGrass must be checked BEFORE Quarry_Tundra (TundraGrass is more specific than Tundra)
        // Same for Quarry_Forest before Quarry_Grass, Quarry_Alpine before Quarry_Dirt
        if (a[0].startsWith('Quarry_') && !b[0].startsWith('Quarry_')) return -1;
        if (b[0].startsWith('Quarry_') && !a[0].startsWith('Quarry_')) return 1;
        // Quarry_TundraGrass FIRST (most specific - TundraGrass might be mapped to Tundra otherwise)
        if (a[0] === 'Quarry_TundraGrass' && b[0].startsWith('Quarry_')) return -1;
        if (b[0] === 'Quarry_TundraGrass' && a[0].startsWith('Quarry_')) return 1;
        // Then Quarry_Forest (Forest might be mapped to Grass otherwise)
        if (a[0] === 'Quarry_Forest' && b[0].startsWith('Quarry_')) return -1;
        if (b[0] === 'Quarry_Forest' && a[0].startsWith('Quarry_')) return 1;
        // Then Quarry_Alpine (Alpine might be mapped to Dirt otherwise)
        if (a[0] === 'Quarry_Alpine' && b[0].startsWith('Quarry_')) return -1;
        if (b[0] === 'Quarry_Alpine' && a[0].startsWith('Quarry_')) return 1;
        // Then Quarry_Tundra (Tundra might be mapped to Grass otherwise)
        if (a[0] === 'Quarry_Tundra' && b[0].startsWith('Quarry_')) return -1;
        if (b[0] === 'Quarry_Tundra' && a[0].startsWith('Quarry_')) return 1;
        // Third priority: Forest configs - Forest_TundraGrass BEFORE Forest_Tundra (TundraGrass is more specific)
        if (a[0].startsWith('Forest_') && !b[0].startsWith('Forest_')) return -1;
        if (b[0].startsWith('Forest_') && !a[0].startsWith('Forest_')) return 1;
        // Forest_TundraGrass FIRST (most specific - TundraGrass might be mapped to Tundra otherwise)
        if (a[0] === 'Forest_TundraGrass' && b[0].startsWith('Forest_')) return -1;
        if (b[0] === 'Forest_TundraGrass' && a[0].startsWith('Forest_')) return 1;
        // Then Forest_Tundra (Tundra might be mapped to Grass, but TundraGrass is more specific)
        if (a[0] === 'Forest_Tundra' && b[0].startsWith('Forest_') && b[0] !== 'Forest_TundraGrass') return -1;
        if (b[0] === 'Forest_Tundra' && a[0].startsWith('Forest_') && a[0] !== 'Forest_TundraGrass') return 1;
        // Forest_Grass removed - using Forest_TundraGrass only
        // Fourth priority: Alpine configs - Alpine_TundraGrass BEFORE Alpine_Tundra (TundraGrass is more specific)
        if (a[0].startsWith('Alpine_') && !b[0].startsWith('Alpine_')) return -1;
        if (b[0].startsWith('Alpine_') && !a[0].startsWith('Alpine_')) return 1;
        // Alpine_TundraGrass FIRST (most specific - TundraGrass might be mapped to Tundra otherwise)
        if (a[0] === 'Alpine_TundraGrass' && b[0].startsWith('Alpine_')) return -1;
        if (b[0] === 'Alpine_TundraGrass' && a[0].startsWith('Alpine_')) return 1;
        // Then Alpine_Tundra (Tundra might be mapped to Grass, but TundraGrass is more specific)
        if (a[0] === 'Alpine_Tundra' && b[0].startsWith('Alpine_') && b[0] !== 'Alpine_TundraGrass') return -1;
        if (b[0] === 'Alpine_Tundra' && a[0].startsWith('Alpine_') && a[0] !== 'Alpine_TundraGrass') return 1;
        // Fifth priority: TundraGrass configs (biome-specific transitions should be prioritized)
        // Prioritize TundraGrass_DirtRoad first (road overlays), then TundraGrass_Dirt, then others
        // Note: Alpine_TundraGrass is now Alpine primary, so it's handled in Alpine configs above
        if (a[0].startsWith('TundraGrass_') && !b[0].startsWith('TundraGrass_')) return -1;
        if (b[0].startsWith('TundraGrass_') && !a[0].startsWith('TundraGrass_')) return 1;
        if (a[0] === 'TundraGrass_DirtRoad' && b[0].startsWith('TundraGrass_')) return -1; // TundraGrass_DirtRoad first (highest priority)
        if (b[0] === 'TundraGrass_DirtRoad' && a[0].startsWith('TundraGrass_')) return 1;
        if (a[0] === 'TundraGrass_Dirt' && b[0].startsWith('TundraGrass_')) return -1; // TundraGrass_Dirt second (before TundraGrass_Tundra)
        if (b[0] === 'TundraGrass_Dirt' && a[0].startsWith('TundraGrass_')) return 1;
        if (a[0] === 'TundraGrass_Tundra' && b[0].startsWith('TundraGrass_')) return 1; // TundraGrass_Tundra last (lowest priority within TundraGrass)
        if (b[0] === 'TundraGrass_Tundra' && a[0].startsWith('TundraGrass_')) return -1;
        // Fifth priority: Grass configs - Grass_TundraGrass and Grass_Forest before others (more specific)
        if (a[0].startsWith('Grass_') && b[0].startsWith('Grass_')) {
            if (a[0] === 'Grass_TundraGrass') return -1;
            if (b[0] === 'Grass_TundraGrass') return 1;
            if (a[0] === 'Grass_Forest') return -1;
            if (b[0] === 'Grass_Forest') return 1;
        }
        // Grass_Dirt (prevents dirt patches from looking weird)
        if (a[0] === 'Grass_Dirt') return -1;
        if (b[0] === 'Grass_Dirt') return 1;
        // Then other terrain transitions
        if (a[0] === 'Grass_Beach') return -1;
        if (b[0] === 'Grass_Beach') return 1;
        if (a[0] === 'Dirt_Beach') return -1;
        if (b[0] === 'Dirt_Beach') return 1;
        // Dirt_TundraGrass before Dirt_Tundra (TundraGrass is more specific)
        if (a[0] === 'Dirt_TundraGrass' && b[0].startsWith('Dirt_')) return -1;
        if (b[0] === 'Dirt_TundraGrass' && a[0].startsWith('Dirt_')) return 1;
        // Beach_HotSpringWater should take priority over Beach_Sea when checking Beach tiles
        if (a[0] === 'Beach_HotSpringWater') return -1;
        if (b[0] === 'Beach_HotSpringWater') return 1;
        if (a[0] === 'Beach_Sea') return -1;
        if (b[0] === 'Beach_Sea') return 1;
        return 0;
    });
    
    // First pass: Look for configs where this tile is PRIMARY with secondary neighbors
    // DirtRoad configs are checked first due to sorting, so road overlays take priority
    // For TundraGrass, we need to check DirtRoad and Alpine BEFORE Tundra to ensure correct priority
    let tundraGrassConfigs: Array<[string, AutotileConfig]> = [];
    let otherConfigs: Array<[string, AutotileConfig]> = [];
    
    // Separate TundraGrass configs to handle them specially
    for (const entry of configEntries) {
        if (entry[1].primaryType === 'TundraGrass') {
            tundraGrassConfigs.push(entry);
        } else {
            otherConfigs.push(entry);
        }
    }
    
    // Sort TundraGrass configs by priority: DirtRoad > Dirt > Grass > Beach > others > Tundra
    // Note: Alpine_TundraGrass is now Alpine primary, so it's handled separately
    tundraGrassConfigs.sort((a, b) => {
        if (a[0] === 'TundraGrass_DirtRoad') return -1;
        if (b[0] === 'TundraGrass_DirtRoad') return 1;
        if (a[0] === 'TundraGrass_Dirt') return -1; // Dirt before Grass
        if (b[0] === 'TundraGrass_Dirt') return 1;
        // TundraGrass_Grass removed - using Grass_TundraGrass only
        if (a[0] === 'TundraGrass_Beach') return -1; // Beach before Tundra
        if (b[0] === 'TundraGrass_Beach') return 1;
        if (a[0] === 'TundraGrass_Tundra') return 1; // Tundra last (lowest priority)
        if (b[0] === 'TundraGrass_Tundra') return -1;
        return 0;
    });
    
    // CRITICAL: Sort otherConfigs to ensure proper priority order is maintained
    // This is essential because TundraGrass neighbors might be incorrectly matched as Tundra
    otherConfigs.sort((a, b) => {
        // Within DirtRoad configs: DirtRoad_TundraGrass before DirtRoad_Tundra
        if (a[0].startsWith('DirtRoad_') && b[0].startsWith('DirtRoad_')) {
            if (a[0] === 'DirtRoad_TundraGrass') return -1;
            if (b[0] === 'DirtRoad_TundraGrass') return 1;
        }
        // Within Forest configs: Forest_TundraGrass BEFORE Forest_Tundra (TundraGrass is most specific)
        if (a[0].startsWith('Forest_') && b[0].startsWith('Forest_')) {
            if (a[0] === 'Forest_TundraGrass') return -1;
            if (b[0] === 'Forest_TundraGrass') return 1;
            if (a[0] === 'Forest_Tundra') return -1;
            if (b[0] === 'Forest_Tundra') return 1;
            // Forest_Grass removed
        }
        return 0; // Keep original sort order for other configs
    });
    
    // Check other configs first (DirtRoad, Quarry, Forest, etc.)
    // CRITICAL: For Forest tiles, check Forest_TundraGrass (Forest_Grass removed)
    // This ensures TundraGrass transitions take priority over Grass transitions
    let forestTundraGrassConfig: [string, AutotileConfig] | null = null;
    let forestOtherConfigs: Array<[string, AutotileConfig]> = [];
    let nonForestConfigs: Array<[string, AutotileConfig]> = [];
    
    // Separate Forest configs to handle Forest_TundraGrass specially
    for (const entry of otherConfigs) {
        if (entry[1].primaryType === 'Forest') {
            if (entry[0] === 'Forest_TundraGrass') {
                forestTundraGrassConfig = entry;
            } else {
                forestOtherConfigs.push(entry);
            }
        } else {
            nonForestConfigs.push(entry);
        }
    }
    
    // Check Forest_TundraGrass FIRST if it exists
    if (forestTundraGrassConfig && mappedTileType === 'Forest') {
        const [, config] = forestTundraGrassConfig;
        // Check if this tile is TRULY overwhelmed (3+ ACTUAL secondary cardinal neighbors)
        if (isOverwhelmedTile(x, y, worldTiles, config.primaryType, config.secondaryType)) {
            return { config, bitmask: -1, isSecondaryInterior: true };
        }
        
        // Calculate bitmask (may include absorbed same-type neighbors for edge rendering)
        // This will skip Grass neighbors and only detect TundraGrass neighbors
        const bitmask = calculateAutotileBitmask(x, y, worldTiles, config.secondaryType, mappedTileType);
        
        // CRITICAL: If ANY TundraGrass neighbors exist, use Forest_TundraGrass
        // Even if bitmask is 0 (no neighbors), we should still check if TundraGrass neighbors exist
        // by checking neighbors directly
        if (bitmask > 0) {
            return { config, bitmask };
        }
        
        // Additional check: Look for TundraGrass neighbors directly to ensure we don't miss them
        // This handles cases where TundraGrass neighbors might not be detected due to mapping issues
        let hasTundraGrassNeighbor = false;
        for (const [, offset] of Object.entries(NEIGHBOR_OFFSETS)) {
            const neighborX = x + offset.x;
            const neighborY = y + offset.y;
            const neighborKey = `${neighborX}_${neighborY}`;
            const neighborTile = worldTiles.get(neighborKey);
            if (neighborTile && neighborTile.tileType?.tag === 'TundraGrass') {
                hasTundraGrassNeighbor = true;
                break;
            }
        }
        
        // If TundraGrass neighbors exist, use Forest_TundraGrass (even with bitmask 0, use interior)
        if (hasTundraGrassNeighbor) {
            return { config, bitmask: 0 }; // Use interior tile when TundraGrass neighbors exist
        }
    }
    
    // Then check other Forest configs (Forest_Tundra, etc.)
    for (const [, config] of forestOtherConfigs) {
        if (mappedTileType === config.primaryType) {
            
            // Check if this tile is TRULY overwhelmed (3+ ACTUAL secondary cardinal neighbors)
            if (isOverwhelmedTile(x, y, worldTiles, config.primaryType, config.secondaryType)) {
                return { config, bitmask: -1, isSecondaryInterior: true };
            }
            
            // Calculate bitmask (may include absorbed same-type neighbors for edge rendering)
            const bitmask = calculateAutotileBitmask(x, y, worldTiles, config.secondaryType, mappedTileType);
            
            if (bitmask > 0) {
                return { config, bitmask };
            }
        }
    }
    
    // Then check non-Forest configs (DirtRoad, Quarry, Alpine, etc.)
    // CRITICAL: For Alpine tiles, check Alpine_TundraGrass BEFORE Alpine_Tundra
    let alpineTundraGrassConfig: [string, AutotileConfig] | null = null;
    let alpineOtherConfigs: Array<[string, AutotileConfig]> = [];
    let otherNonForestConfigs: Array<[string, AutotileConfig]> = [];
    
    // Separate Alpine configs to handle Alpine_TundraGrass specially
    for (const entry of nonForestConfigs) {
        if (entry[1].primaryType === 'Alpine') {
            if (entry[0] === 'Alpine_TundraGrass') {
                alpineTundraGrassConfig = entry;
            } else {
                alpineOtherConfigs.push(entry);
            }
        } else {
            otherNonForestConfigs.push(entry);
        }
    }
    
    // Check Alpine_TundraGrass FIRST if it exists
    if (alpineTundraGrassConfig && mappedTileType === 'Alpine') {
        const [, config] = alpineTundraGrassConfig;
        // Check if this tile is TRULY overwhelmed (3+ ACTUAL secondary cardinal neighbors)
        if (isOverwhelmedTile(x, y, worldTiles, config.primaryType, config.secondaryType)) {
            return { config, bitmask: -1, isSecondaryInterior: true };
        }
        
        // Calculate bitmask (may include absorbed same-type neighbors for edge rendering)
        const bitmask = calculateAutotileBitmask(x, y, worldTiles, config.secondaryType, mappedTileType);
        
        if (bitmask > 0) {
            return { config, bitmask };
        }
    }
    
    // Then check other Alpine configs (Alpine_Tundra, Alpine_DirtRoad, etc.)
    for (const [, config] of alpineOtherConfigs) {
        if (mappedTileType === config.primaryType) {
            // Check if this tile is TRULY overwhelmed (3+ ACTUAL secondary cardinal neighbors)
            if (isOverwhelmedTile(x, y, worldTiles, config.primaryType, config.secondaryType)) {
                return { config, bitmask: -1, isSecondaryInterior: true };
            }
            
            // Calculate bitmask (may include absorbed same-type neighbors for edge rendering)
            const bitmask = calculateAutotileBitmask(x, y, worldTiles, config.secondaryType, mappedTileType);
            
            if (bitmask > 0) {
                return { config, bitmask };
            }
        }
    }
    
    // Then check other non-Forest, non-Alpine configs (DirtRoad, Quarry, etc.)
    for (const [, config] of otherNonForestConfigs) {
        if (mappedTileType === config.primaryType) {
            if (config.primaryType === 'DirtRoad' && config.secondaryType === 'Grass') continue;
            // HotSpringWater uses Beach_HotSpringWater autotile (Beach is primary), so allow it
            
            // Check if this tile is TRULY overwhelmed (3+ ACTUAL secondary cardinal neighbors)
            if (isOverwhelmedTile(x, y, worldTiles, config.primaryType, config.secondaryType)) {
                return { config, bitmask: -1, isSecondaryInterior: true };
            }
            
            // Calculate bitmask (may include absorbed same-type neighbors for edge rendering)
            const bitmask = calculateAutotileBitmask(x, y, worldTiles, config.secondaryType, mappedTileType);
            
            if (bitmask > 0) {
                return { config, bitmask };
            }
        }
    }
    
    // Then check TundraGrass configs in priority order
    for (const [, config] of tundraGrassConfigs) {
        if (mappedTileType === config.primaryType) {
            // Check if this tile is TRULY overwhelmed (3+ ACTUAL secondary cardinal neighbors)
            if (isOverwhelmedTile(x, y, worldTiles, config.primaryType, config.secondaryType)) {
                return { config, bitmask: -1, isSecondaryInterior: true };
            }
            
            // Calculate bitmask (may include absorbed same-type neighbors for edge rendering)
            const bitmask = calculateAutotileBitmask(x, y, worldTiles, config.secondaryType, mappedTileType);
            
            if (bitmask > 0) {
                return { config, bitmask };
            }
        }
    }
    
    // Second pass: Use primaryInterior for interior PRIMARY tiles
    // Use the same separated order to maintain priority
    // IMPORTANT: For Quarry tiles, we MUST use a Quarry config, not a Dirt fallback
    // For TundraGrass tiles, prioritize DirtRoad > Alpine > others > Tundra
    for (const [, config] of otherConfigs) {
        if (mappedTileType === config.primaryType) {
            if (config.primaryType === 'DirtRoad' && config.secondaryType === 'Grass') continue;
            // HotSpringWater uses Beach_HotSpringWater autotile (Beach is primary), so allow it
            if (mappedTileType === 'Sea') continue; // Sea still doesn't use autotiles
            
            // For Quarry tiles, ensure we use a Quarry config (not Dirt fallback)
            if (mappedTileType === 'Quarry' && config.primaryType !== 'Quarry') continue;
            
            return { config, bitmask: 0 };
        }
    }
    
    // Check TundraGrass configs in priority order for interior tiles
    for (const [, config] of tundraGrassConfigs) {
        if (mappedTileType === config.primaryType) {
            // For TundraGrass tiles, ensure we use a TundraGrass config (not Tundra fallback)
            return { config, bitmask: 0 };
        }
    }
    
    // Third pass: Look for configs where this tile is SECONDARY (e.g., Sea in Beach_Sea)
    const secondaryConfigEntries = Object.entries(AUTOTILE_CONFIGS);
    secondaryConfigEntries.sort((a, b) => {
        if (a[0] === 'Beach_HotSpringWater') return -1;
        if (b[0] === 'Beach_HotSpringWater') return 1;
        if (a[0] === 'Beach_Sea') return -1;
        if (b[0] === 'Beach_Sea') return 1;
        return 0;
    });
    
    for (const [, config] of secondaryConfigEntries) {
        if (mappedTileType === config.secondaryType) {
            return { config, bitmask: -1, isSecondaryInterior: true };
        }
    }
    
    return null;
}

/**
 * Get ALL autotile transitions for a tile (for multi-layer rendering)
 */
export function getAutotilesForTile(
    tileType: string,
    worldTiles: Map<string, WorldTile>,
    x: number,
    y: number
): Array<{ config: AutotileConfig; bitmask: number }> {
    const centerTileKey = `${x}_${y}`;
    const centerTile = worldTiles.get(centerTileKey);
    
    if (!centerTile) return [];
    
    const actualTileType = centerTile.tileType?.tag;
    if (actualTileType) tileType = actualTileType;
    
    // Map new tile types to their base types for autotile config matching:
    // - Quarry uses Quarry-specific configs (Quarry_Grass, Quarry_Dirt) and falls back to Dirt configs for other transitions
    // - Forest uses Forest-specific configs (Forest_Grass) and falls back to Grass configs for other transitions
    // - Tundra uses Tundra-specific configs (Tundra_Beach, Dirt_Tundra) and falls back to Grass configs for other transitions
    // - Alpine uses Alpine-specific configs (Alpine_DirtRoad, Alpine_Dirt, Alpine_Beach) and falls back to Dirt configs for other transitions
    // - Asphalt is paved surface, so use DirtRoad autotile configs
    let autotileTileType = tileType;
    let fallbackTileType: string | null = null;
    if (tileType === 'Quarry') {
        // Quarry has its own configs (Quarry_Grass, Quarry_Dirt), but can fall back to Dirt configs for other transitions
        autotileTileType = 'Quarry';
        fallbackTileType = 'Dirt';
    }
    if (tileType === 'Forest') {
        // Forest has its own configs (Forest_Grass), but can fall back to Grass configs for other transitions
        autotileTileType = 'Forest';
        fallbackTileType = 'Grass';
    }
    if (tileType === 'Tundra') {
        // Tundra has its own configs (Tundra_Beach), but can fall back to Grass configs for other transitions
        autotileTileType = 'Tundra';
        fallbackTileType = 'Grass';
    }
    if (tileType === 'Alpine') {
        // Alpine has its own configs (Alpine_DirtRoad, Alpine_Dirt, Alpine_Beach), but can fall back to Dirt configs for other transitions
        autotileTileType = 'Alpine';
        fallbackTileType = 'Dirt';
    }
    if (tileType === 'Asphalt') {
        // Asphalt has its own configs (Asphalt_DirtRoad), but can fall back to DirtRoad configs for other transitions
        autotileTileType = 'Asphalt';
        fallbackTileType = 'DirtRoad';
    }
    if (tileType === 'HotSpringWater') {
        // HotSpringWater uses Beach_HotSpringWater (Beach is primary), no fallback needed
        autotileTileType = 'HotSpringWater';
        fallbackTileType = null; // HotSpringWater transitions via Beach_HotSpringWater, no fallback
    }
    if (tileType === 'TundraGrass') {
        // TundraGrass has its own configs (TundraGrass_Tundra), can fall back to Tundra configs for other transitions
        autotileTileType = 'TundraGrass';
        fallbackTileType = 'Tundra';
    }
    
    if ('worldX' in centerTile && 'worldY' in centerTile) {
        const tileWorldX = (centerTile as WorldTile).worldX;
        const tileWorldY = (centerTile as WorldTile).worldY;
        if (tileWorldX !== undefined && tileWorldY !== undefined) {
            x = tileWorldX;
            y = tileWorldY;
        }
    }
    
    const autotiles: Array<{ config: AutotileConfig; bitmask: number }> = [];
    
    // First, check for tile-specific configs (e.g., Forest_Grass)
    for (const [, config] of Object.entries(AUTOTILE_CONFIGS)) {
        if (autotileTileType === config.primaryType) {
            if (config.primaryType === 'DirtRoad' && config.secondaryType === 'Grass') continue;
            // HotSpringWater uses Beach_HotSpringWater autotile (Beach is primary), so allow it
            
            const bitmask = calculateAutotileBitmask(x, y, worldTiles, config.secondaryType, autotileTileType);
            
            if (bitmask > 0) {
                autotiles.push({ config, bitmask });
            }
        }
    }
    
    // Then, check for fallback configs (e.g., Grass configs for Forest tiles transitioning to non-Grass types)
    if (fallbackTileType) {
        for (const [, config] of Object.entries(AUTOTILE_CONFIGS)) {
            // Skip if we already have a config for this transition
            const alreadyHasConfig = autotiles.some(a => 
                a.config.secondaryType === config.secondaryType
            );
            
            if (fallbackTileType === config.primaryType && !alreadyHasConfig) {
                if (config.primaryType === 'DirtRoad' && config.secondaryType === 'Grass') continue;
                // HotSpringWater uses Beach_HotSpringWater autotile (Beach is primary), so allow it
                
                const bitmask = calculateAutotileBitmask(x, y, worldTiles, config.secondaryType, fallbackTileType);
                
                if (bitmask > 0) {
                    autotiles.push({ config, bitmask });
                }
            }
        }
    }
    
    return autotiles;
}

// =============================================================================
// DEBUG UTILITIES
// =============================================================================

/**
 * Get detailed debug info about a tile's autotile state
 */
export function getDebugTileInfo(bitmask: number): {
    bitmask: number;
    tileIndex: number;
    row: number;
    col: number;
    coordinates: { x: number; y: number };
    isOverwhelmed: boolean;
} {
    const tilePos = selectIslandTile(bitmask);
    
    // Handle overwhelmed tiles (null return)
    if (tilePos === null) {
        return {
            bitmask,
            tileIndex: -1, // Special value for overwhelmed
            row: 0,
            col: 0,
            coordinates: { x: 0, y: 0 },
            isOverwhelmed: true,
        };
    }
    
    return {
        bitmask,
        tileIndex: tilePos.row * TILESET_COLS + tilePos.col,
        row: tilePos.row,
        col: tilePos.col,
        coordinates: {
            x: tilePos.col * TILE_SIZE,
            y: tilePos.row * TILE_SIZE,
        },
        isOverwhelmed: false,
    };
}

/**
 * Helper function to debug autotile bitmasks
 */
export function debugAutotileBitmask(bitmask: number): string {
    const neighbors = [];
    if (bitmask & DIR_NW) neighbors.push('NW');
    if (bitmask & DIR_N) neighbors.push('N');
    if (bitmask & DIR_NE) neighbors.push('NE');
    if (bitmask & DIR_W) neighbors.push('W');
    if (bitmask & DIR_E) neighbors.push('E');
    if (bitmask & DIR_SW) neighbors.push('SW');
    if (bitmask & DIR_S) neighbors.push('S');
    if (bitmask & DIR_SE) neighbors.push('SE');
    
    return `Bitmask ${bitmask}: [${neighbors.join(', ')}]`;
}
