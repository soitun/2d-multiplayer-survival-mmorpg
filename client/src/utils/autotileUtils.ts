import { WorldTile } from '../generated/world_tile_type';

// Import autotile images (15-tile hierarchical format, 512×640)
import grassBeachAutotile from '../assets/tiles/new/tileset_grass_beach_autotile.png';
import beachSeaAutotile from '../assets/tiles/new/tileset_beach_sea_autotile.png';
import grassDirtAutotile from '../assets/tiles/new/tileset_grass_dirt_autotile.png';
import dirtBeachAutotile from '../assets/tiles/new/tileset_dirt_beach_autotile.png';
import grassDirtRoadAutotile from '../assets/tiles/new/tileset_grass_dirtroad_autotile.png';
import grassTundraAutotile from '../assets/tiles/new/tileset_grass_tundra_autotile.png';
import beachDirtRoadAutotile from '../assets/tiles/new/tileset_beach_dirtroad_autotile.png';
import dirtDirtRoadAutotile from '../assets/tiles/new/tileset_dirt_dirtroad_autotile.png';
import dirtRoadTundraAutotile from '../assets/tiles/new/tileset_dirtroad_tundra_autotile.png';
import forestGrassAutotile from '../assets/tiles/new/tileset_forest_grass_autotile.png';
import forestDirtRoadAutotile from '../assets/tiles/new/tileset_forest_dirtroad_autotile.png';
import forestBeachAutotile from '../assets/tiles/new/tileset_forest_beach_autotile.png';
import forestDirtAutotile from '../assets/tiles/new/tileset_forest_dirt_autotile.png';
import tundraBeachAutotile from '../assets/tiles/new/tileset_tundra_beach_autotile.png';
import dirtTundraAutotile from '../assets/tiles/new/tileset_dirt_tundra_autotile.png';

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
    
    // Don't map Forest to Grass when checking Forest_Grass transitions
    if (tileType === 'Quarry') return 'Dirt';
    if (tileType === 'Forest' && !(primaryType === 'Forest' && secondaryType === 'Grass')) return 'Grass';
    if (tileType === 'Asphalt') return 'DirtRoad';
    // Don't map Tundra to Grass when checking for Tundra transitions (Dirt_Tundra, Tundra_Beach, etc.)
    if (tileType === 'Tundra' && secondaryType !== 'Tundra') return 'Grass';
    if (tileType === 'Alpine') return 'Dirt';
    
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
        tilesetPath: beachSeaAutotile,
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
    'Forest_Grass': {
        primaryType: 'Forest',
        secondaryType: 'Grass',
        tilesetPath: forestGrassAutotile,
        tileSize: TILE_SIZE,
        columns: TILESET_COLS,
        rows: TILESET_ROWS,
        primaryInterior: { row: 1, col: 2 },
        secondaryInterior: { row: 0, col: 0 },
    },
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
            const neighborType = mapTileTypeForAutotile(neighborTile.tileType?.tag, primaryType, secondaryType);
            
            // Count as secondary if:
            // 1. The neighbor IS the secondary type, OR
            // 2. The neighbor is the same primary type BUT is "overwhelmed"
            //    (has 3+ cardinal secondary neighbors, so should be absorbed)
            if (neighborType === secondaryType) {
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
    
    // No cardinals but has diagonals - concave corners
    if (cardinalCount === 0) {
        if (hasNE && !hasSE && !hasSW && !hasNW) return TILE_POSITIONS.A3;
        if (hasNW && !hasNE && !hasSE && !hasSW) return TILE_POSITIONS.A1;
        if (hasSE && !hasNE && !hasNW && !hasSW) return TILE_POSITIONS.A9;
        if (hasSW && !hasNE && !hasNW && !hasSE) return TILE_POSITIONS.A7;
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
    const tilesWithoutAutotiles = ['Alpine', 'Asphalt', 'Quarry', 'HotSpringWater'];
    
    if (tilesWithoutAutotiles.includes(tileType)) {
        return null; // Render as plain base texture
    }
    
    // Map Quarry tiles to Dirt for autotiling (kept for when autotiles exist)
    // NOTE: Quarry SHOULD have been caught above and returned null - this is fallback only
    const autotileTileType = tileType === 'Quarry' ? 'Dirt' : tileType;
    
    // Use tile's coordinates if available
    if ('worldX' in centerTile && 'worldY' in centerTile) {
        const tileWorldX = (centerTile as WorldTile).worldX;
        const tileWorldY = (centerTile as WorldTile).worldY;
        if (tileWorldX !== undefined && tileWorldY !== undefined) {
            x = tileWorldX;
            y = tileWorldY;
        }
    }
    
    // REMOVED: The mapping code below should NEVER execute now that we return null above
    // If you see this log, something is wrong!
    const mappedTileType = autotileTileType;
    if (['Asphalt', 'Quarry', 'Alpine'].includes(autotileTileType)) {
        console.error(`[AUTOTILE] BUG! Reached mapping code for ${autotileTileType} - should have returned null earlier!`);
    }
    
    // Sort configs to prioritize road overlay transitions FIRST (they're visually on top)
    // Priority: *_DirtRoad (highest - road overlays) > Grass_Dirt > Grass_Beach > Dirt_Beach
    const configEntries = Object.entries(AUTOTILE_CONFIGS);
    configEntries.sort((a, b) => {
        // HIGHEST priority: DirtRoad transitions (road overlay is visually on top of terrain)
        if (a[0].includes('DirtRoad') && !b[0].includes('DirtRoad')) return -1;
        if (b[0].includes('DirtRoad') && !a[0].includes('DirtRoad')) return 1;
        // Second priority: Grass_Dirt (prevents dirt patches from looking weird)
        if (a[0] === 'Grass_Dirt') return -1;
        if (b[0] === 'Grass_Dirt') return 1;
        // Then other terrain transitions
        if (a[0] === 'Grass_Beach') return -1;
        if (b[0] === 'Grass_Beach') return 1;
        if (a[0] === 'Dirt_Beach') return -1;
        if (b[0] === 'Dirt_Beach') return 1;
        if (a[0] === 'Beach_Sea') return -1;
        if (b[0] === 'Beach_Sea') return 1;
        return 0;
    });
    
    // First pass: Look for configs where this tile is PRIMARY with secondary neighbors
    // DirtRoad configs are checked first due to sorting, so road overlays take priority
    for (const [, config] of configEntries) {
        if (mappedTileType === config.primaryType) {
            if (config.primaryType === 'DirtRoad' && config.secondaryType === 'Grass') continue;
            if (config.primaryType === 'HotSpringWater') continue;
            
            // Check if this tile is TRULY overwhelmed (3+ ACTUAL secondary cardinal neighbors)
            // This is different from the bitmask which includes absorbed same-type neighbors
            // Truly overwhelmed tiles should be absorbed into secondary type
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
    // Use the same sorted order to maintain priority
    for (const [, config] of configEntries) {
        if (mappedTileType === config.primaryType) {
            if (config.primaryType === 'DirtRoad' && config.secondaryType === 'Grass') continue;
            if (config.primaryType === 'HotSpringWater') continue;
            if (mappedTileType === 'Sea' || mappedTileType === 'HotSpringWater') continue;
            
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
    // - Quarry is rocky dirt, so use Dirt autotile configs
    // - Forest uses Forest-specific configs (Forest_Grass) and falls back to Grass configs for other transitions
    // - Tundra uses Tundra-specific configs (Tundra_Beach, Dirt_Tundra) and falls back to Grass configs for other transitions
    // - Asphalt is paved surface, so use DirtRoad autotile configs
    // - Alpine is rocky terrain, so use Dirt autotile configs
    let autotileTileType = tileType;
    let fallbackTileType: string | null = null;
    if (tileType === 'Quarry') autotileTileType = 'Dirt';
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
    if (tileType === 'Asphalt') autotileTileType = 'DirtRoad';
    if (tileType === 'Alpine') autotileTileType = 'Dirt';
    
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
            if (config.primaryType === 'HotSpringWater') continue;
            
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
                if (config.primaryType === 'HotSpringWater') continue;
                
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
