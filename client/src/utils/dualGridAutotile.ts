/**
 * Dual Grid Autotile System
 * =========================
 * 
 * A simplified autotile system that uses corner-based tile selection.
 * Each rendered tile straddles 4 logical tiles and picks from 16 variants
 * based on which corners match the primary terrain.
 * 
 * Benefits over standard autotile:
 * - Only 16 tile variants needed (vs 47 for full blob)
 * - Automatic 3-way and 4-way junction handling
 * - No complex priority sorting or type mapping
 * - Simpler code (~200 lines vs 1700+)
 */

import { WorldTile } from '../generated/world_tile_type';

type AssetModule = { default: string };

/**
 * Enable this to automatically prefer same-named PNGs in `tiles/new/hd/`.
 * Missing HD files gracefully fall back to `tiles/new/`.
 */
export const USE_HD_TILE_ASSETS = false;

/**
 * Optional per-file override when global HD is disabled.
 * Example: ['tileset_beach_sea_autotile.png']
 */
const HD_TILE_FILE_OVERRIDES = new Set<string>();

function extractFileName(assetPath: string): string {
    const segments = assetPath.split('/');
    return segments[segments.length - 1];
}

function buildAssetFileMap(modules: Record<string, AssetModule>): Map<string, string> {
    const fileMap = new Map<string, string>();
    for (const [assetPath, module] of Object.entries(modules)) {
        fileMap.set(extractFileName(assetPath), module.default);
    }
    return fileMap;
}

const DEFAULT_TILE_ASSETS = buildAssetFileMap(
    import.meta.glob<AssetModule>('../assets/tiles/new/*.png', { eager: true })
);
const HD_TILE_ASSETS = buildAssetFileMap(
    import.meta.glob<AssetModule>('../assets/tiles/new/hd/*.png', { eager: true })
);

export function resolveTileAsset(fileName: string): string {
    const shouldTryHd = USE_HD_TILE_ASSETS || HD_TILE_FILE_OVERRIDES.has(fileName);
    if (shouldTryHd) {
        const hdAsset = HD_TILE_ASSETS.get(fileName);
        if (hdAsset) {
            return hdAsset;
        }
    }

    const defaultAsset = DEFAULT_TILE_ASSETS.get(fileName);
    if (!defaultAsset) {
        throw new Error(`[dualGridAutotile] Missing base tile asset: ${fileName}`);
    }

    return defaultAsset;
}

// Import all existing autotile images (reusing the 4x5 format)
const grassBeachAutotile = resolveTileAsset('tileset_grass_beach_autotile.png');
const beachSeaAutotile = resolveTileAsset('tileset_beach_sea_autotile.png');
const grassDirtAutotile = resolveTileAsset('tileset_grass_dirt_autotile.png');
const dirtBeachAutotile = resolveTileAsset('tileset_dirt_beach_autotile.png');
const grassDirtRoadAutotile = resolveTileAsset('tileset_grass_dirtroad_autotile.png');
const grassTundraAutotile = resolveTileAsset('tileset_grass_tundra_autotile.png');
const grassTundraGrassAutotile = resolveTileAsset('tileset_grass_tundragrass_autotile.png');
const grassForestAutotile = resolveTileAsset('tileset_grass_forest_autotile.png');
const quarryGrassAutotile = resolveTileAsset('tileset_quarry_grass_autotile.png');
const beachDirtRoadAutotile = resolveTileAsset('tileset_beach_dirtroad_autotile.png');
const dirtDirtRoadAutotile = resolveTileAsset('tileset_dirt_dirtroad_autotile.png');
const dirtRoadTundraAutotile = resolveTileAsset('tileset_dirtroad_tundra_autotile.png');
const forestDirtRoadAutotile = resolveTileAsset('tileset_forest_dirtroad_autotile.png');
const forestBeachAutotile = resolveTileAsset('tileset_forest_beach_autotile.png');
const forestDirtAutotile = resolveTileAsset('tileset_forest_dirt_autotile.png');
const tundraBeachAutotile = resolveTileAsset('tileset_tundra_beach_autotile.png');
const dirtTundraAutotile = resolveTileAsset('tileset_dirt_tundra_autotile.png');
const quarryDirtAutotile = resolveTileAsset('tileset_quarry_dirt_autotile.png');
const quarryBeachAutotile = resolveTileAsset('tileset_quarry_beach_autotile.png');
const quarryDirtRoadAutotile = resolveTileAsset('tileset_quarry_dirtroad_autotile.png');
const quarryTundraAutotile = resolveTileAsset('tileset_quarry_tundra_autotile.png');
const quarryAlpineAutotile = resolveTileAsset('tileset_quarry_alpine_autotile.png');
const quarryForestAutotile = resolveTileAsset('tileset_quarry_forest_autotile.png');
const asphaltDirtRoadAutotile = resolveTileAsset('tileset_asphalt_dirtroad_autotile.png');
const asphaltDirtAutotile = resolveTileAsset('tileset_asphalt_dirt_autotile.png');
const asphaltBeachAutotile = resolveTileAsset('tileset_asphalt_beach_autotile.png');
const asphaltAlpineAutotile = resolveTileAsset('tileset_asphalt_alpine_autotile.png');
const asphaltTundraAutotile = resolveTileAsset('tileset_asphalt_tundra_autotile.png');
const asphaltSeaAutotile = resolveTileAsset('tileset_asphalt_sea_autotile.png');
const asphaltGrassAutotile = resolveTileAsset('tileset_asphalt_grass_autotile.png');
const alpineDirtRoadAutotile = resolveTileAsset('tileset_alpine_dirtroad_autotile.png');
const alpineDirtAutotile = resolveTileAsset('tileset_alpine_dirt_autotile.png');
const alpineBeachAutotile = resolveTileAsset('tileset_alpine_beach_autotile.png');
const alpineTundraAutotile = resolveTileAsset('tileset_alpine_tundra_autotile.png');
const forestTundraAutotile = resolveTileAsset('tileset_forest_tundra_autotile.png');
const beachHotSpringWaterAutotile = resolveTileAsset('tileset_beach_hotspringwater_autotile.png');
const tundraGrassTundraAutotile = resolveTileAsset('tileset_tundragrass_tundra_autotile.png');
const alpineTundraGrassAutotile = resolveTileAsset('tileset_alpine_tundragrass_autotile.png');
const tundraGrassBeachAutotile = resolveTileAsset('tileset_tundragrass_beach_autotile.png');
const quarryTundraGrassAutotile = resolveTileAsset('tileset_quarry_tundragrass_autotile.png');
const dirtRoadTundraGrassAutotile = resolveTileAsset('tileset_dirtroad_tundragrass_autotile.png');
const forestTundraGrassAutotile = resolveTileAsset('tileset_forest_tundragrass_autotile.png');
const dirtTundraGrassAutotile = resolveTileAsset('tileset_dirt_tundragrass_autotile.png');
// Underwater autotile for snorkeling mode (beach/land to sea transition when underwater)
const underwaterSeaAutotile = resolveTileAsset('tileset_underwater_sea_autotile.png');

// =============================================================================
// CONSTANTS
// =============================================================================

/** Tile size in pixels (matches existing tileset format) */
export const TILE_SIZE = 128;

/** Tileset dimensions (4 columns x 5 rows) */
export const TILESET_COLS = 4;
export const TILESET_ROWS = 5;

// =============================================================================
// DUAL GRID LOOKUP TABLE
// =============================================================================

/**
 * Maps Dual Grid 4-bit index (0-15) to position in existing 4x5 tileset.
 * 
 * Index is calculated from 4 corners: TL(8) + TR(4) + BL(2) + BR(1)
 * where 1 = corner is different terrain (secondary), 0 = same terrain (primary)
 * 
 * The existing 4x5 tileset layout:
 *   Col:    0       1       2       3
 *   Row 0: [INT]   [A1]    [A2]    [A3]   <- convex corners + top edge
 *   Row 1: [--]    [A4]    [A5]    [A6]   <- left edge, interior, right edge
 *   Row 2: [--]    [A7]    [A8]    [A9]   <- convex corners + bottom edge
 *   Row 3: [--]    [B1]    [B2]    [C1]   <- concave corners + diagonal
 *   Row 4: [--]    [B3]    [B4]    [C2]   <- concave corners + diagonal
 */
export const DUAL_GRID_LOOKUP: ReadonlyArray<{ row: number; col: number }> = [
    { row: 1, col: 2 },  // 0  (0000) = All same → Interior (A5)
    { row: 3, col: 1 },  // 1  (0001) = BR different → Concave BR (B1)
    { row: 3, col: 2 },  // 2  (0010) = BL different → Concave BL (B2)
    { row: 2, col: 2 },  // 3  (0011) = Bottom edge (A8)
    { row: 4, col: 1 },  // 4  (0100) = TR different → Concave TR (B3)
    { row: 1, col: 3 },  // 5  (0101) = Right edge (A6)
    { row: 4, col: 3 },  // 6  (0110) = Diagonal TR+BL → C2 (SWAPPED with 9)
    { row: 2, col: 3 },  // 7  (0111) = Convex TL corner (A1) - SWAPPED with 14
    { row: 4, col: 2 },  // 8  (1000) = TL different → Concave TL (B4)
    { row: 3, col: 3 },  // 9  (1001) = Diagonal TL+BR → C1 (SWAPPED with 6)
    { row: 1, col: 1 },  // 10 (1010) = Left edge (A4)
    { row: 2, col: 1 },  // 11 (1011) = Convex TR corner (A3) - SWAPPED with 13
    { row: 0, col: 2 },  // 12 (1100) = Top edge (A2)
    { row: 0, col: 3 },  // 13 (1101) = Convex BL corner (A7) - SWAPPED with 11
    { row: 0, col: 1 },  // 14 (1110) = Convex BR corner (A9) - SWAPPED with 7
    { row: 0, col: 0 },  // 15 (1111) = All different → Secondary interior
];

// =============================================================================
// TERRAIN PRIORITY
// =============================================================================

/**
 * Terrain priority determines which terrain is "primary" when multiple terrains meet.
 * Lower number = higher priority (renders "on top" / is the primary terrain).
 * 
 * Priority order (lowest to highest priority):
 * - Water types (Sea, HotSpringWater) are lowest - they render "underneath"
 * - Roads (DirtRoad, Asphalt) are higher - they render on top of terrain
 * - Natural terrains in between
 */
export const TERRAIN_PRIORITY: Readonly<Record<string, number>> = {
    'Sea': 0,
    'HotSpringWater': 1,
    'Beach': 2,
    'Tundra': 3,
    'TundraGrass': 4,
    'Alpine': 5,
    'Grass': 6,
    'Forest': 7,
    'Dirt': 8,
    'Tilled': 8, // Same priority as Dirt - tilled soil uses dirt graphics
    'Quarry': 9,
    'DirtRoad': 10,
    'Asphalt': 11,
};

// =============================================================================
// TRANSITION TILESETS
// =============================================================================

/**
 * Maps terrain pair (Primary_Secondary) to tileset path.
 * The lookup tries both Primary_Secondary and Secondary_Primary.
 * 
 * All transitions from the original autotileUtils.ts are included here.
 */
export const TRANSITION_TILESETS: Readonly<Record<string, string>> = {
    // === Grass transitions ===
    'Grass_Beach': grassBeachAutotile,
    'Grass_HotSpringWater': grassBeachAutotile, // Reuse grass_beach for hot spring
    'Grass_Dirt': grassDirtAutotile,
    'Grass_DirtRoad': grassDirtRoadAutotile,
    'Grass_Tundra': grassTundraAutotile,
    'Grass_TundraGrass': grassTundraGrassAutotile,
    'Grass_Forest': grassForestAutotile,
    
    // === Forest transitions ===
    'Forest_Beach': forestBeachAutotile,
    'Forest_Dirt': forestDirtAutotile,
    'Forest_DirtRoad': forestDirtRoadAutotile,
    'Forest_Tundra': forestTundraAutotile,
    'Forest_TundraGrass': forestTundraGrassAutotile,
    
    // === Beach transitions ===
    'Beach_Sea': beachSeaAutotile,
    'Beach_HotSpringWater': beachHotSpringWaterAutotile,
    'Beach_DirtRoad': beachDirtRoadAutotile,
    
    // === Underwater transitions (snorkeling mode) ===
    'Underwater_Sea': underwaterSeaAutotile, // Used for land→sea transitions when player is underwater
    
    // === Dirt transitions ===
    'Dirt_Beach': dirtBeachAutotile,
    'Dirt_DirtRoad': dirtDirtRoadAutotile,
    'Dirt_Tundra': dirtTundraAutotile,
    'Dirt_TundraGrass': dirtTundraGrassAutotile,
    
    // === DirtRoad transitions ===
    'DirtRoad_Tundra': dirtRoadTundraAutotile,
    'DirtRoad_TundraGrass': dirtRoadTundraGrassAutotile,
    
    // === Quarry transitions ===
    'Quarry_Grass': quarryGrassAutotile,
    'Quarry_Dirt': quarryDirtAutotile,
    'Quarry_Beach': quarryBeachAutotile,
    'Quarry_DirtRoad': quarryDirtRoadAutotile,
    'Quarry_Tundra': quarryTundraAutotile,
    'Quarry_TundraGrass': quarryTundraGrassAutotile,
    'Quarry_Alpine': quarryAlpineAutotile,
    'Quarry_Forest': quarryForestAutotile,
    
    // === Asphalt transitions ===
    'Asphalt_DirtRoad': asphaltDirtRoadAutotile,
    'Asphalt_Dirt': asphaltDirtAutotile,
    'Asphalt_Beach': asphaltBeachAutotile,
    'Asphalt_Alpine': asphaltAlpineAutotile,
    'Asphalt_Tundra': asphaltTundraAutotile,
    'Asphalt_Sea': asphaltSeaAutotile,
    'Asphalt_Grass': asphaltGrassAutotile,
    
    // === Alpine transitions ===
    'Alpine_DirtRoad': alpineDirtRoadAutotile,
    'Alpine_Dirt': alpineDirtAutotile,
    'Alpine_Beach': alpineBeachAutotile,
    'Alpine_Tundra': alpineTundraAutotile,
    'Alpine_TundraGrass': alpineTundraGrassAutotile,
    
    // === Tundra transitions ===
    'Tundra_Beach': tundraBeachAutotile,
    
    // === TundraGrass transitions ===
    'TundraGrass_Tundra': tundraGrassTundraAutotile,
    'TundraGrass_Beach': tundraGrassBeachAutotile,
};

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Get the terrain type from a tile, with fallback to 'Grass'
 * Maps 'Tilled' to 'Dirt' for autotiling purposes (they share graphics)
 */
function getTileType(tile: WorldTile | undefined): string {
    const tileType = tile?.tileType?.tag ?? 'Grass';
    // Tilled tiles render using Dirt graphics and transitions
    return tileType === 'Tilled' ? 'Dirt' : tileType;
}

/**
 * Get terrain priority (higher number = higher priority = renders on top)
 */
function getTerrainPriority(terrainType: string): number {
    return TERRAIN_PRIORITY[terrainType] ?? 6; // Default to Grass priority
}

/**
 * Determine if a diagonal tile (index 6 or 9) should use the alternate diagonal.
 * 
 * The dual-grid renders at half-tile offsets, so the tile at (logicalX, logicalY)
 * is influenced by corners at: TL(x,y), TR(x+1,y), BL(x,y+1), BR(x+1,y+1)
 * 
 * Index 6 (0110): TR+BL are secondary → default diagonal cuts TR to BL
 * Index 9 (1001): TL+BR are secondary → default diagonal cuts TL to BR
 * 
 * To determine correct diagonal, check adjacent dual-grid cells:
 * - If secondary terrain continues diagonally in the TL↔BR direction, use TL↔BR diagonal
 * - If secondary terrain continues diagonally in the TR↔BL direction, use TR↔BL diagonal
 */
function shouldSwapDiagonal(
    dualGridIndex: number,
    logicalX: number,
    logicalY: number,
    worldTiles: Map<string, WorldTile>,
    primaryTerrain: string
): boolean {
    // Only applies to diagonal tiles: 6 (TR+BL) and 9 (TL+BR)
    if (dualGridIndex !== 6 && dualGridIndex !== 9) {
        return false;
    }
    
    // Helper to check if a tile is secondary (not primary)
    const isSecondary = (x: number, y: number): boolean => {
        const tile = worldTiles.get(`${x}_${y}`);
        const type = getTileType(tile);
        return type !== primaryTerrain;
    };
    
    // Check adjacent tiles to determine diagonal direction
    // We look at the tiles diagonally adjacent to determine flow
    
    // Get the 4 corner types for this dual-grid cell
    const tlSecondary = isSecondary(logicalX, logicalY);
    const trSecondary = isSecondary(logicalX + 1, logicalY);
    const blSecondary = isSecondary(logicalX, logicalY + 1);
    const brSecondary = isSecondary(logicalX + 1, logicalY + 1);
    
    // Check neighbors in each diagonal direction to see where the secondary terrain continues
    // TL↔BR direction: check above-left of TL and below-right of BR
    const aboveLeftSecondary = isSecondary(logicalX - 1, logicalY - 1);
    const belowRightSecondary = isSecondary(logicalX + 2, logicalY + 2);
    
    // TR↔BL direction: check above-right of TR and below-left of BL
    const aboveRightSecondary = isSecondary(logicalX + 2, logicalY - 1);
    const belowLeftSecondary = isSecondary(logicalX - 1, logicalY + 2);
    
    // Count how many tiles support each diagonal direction
    let tlBrScore = 0;
    let trBlScore = 0;
    
    // If secondary terrain continues in TL↔BR direction
    if (tlSecondary && (aboveLeftSecondary || isSecondary(logicalX - 1, logicalY) || isSecondary(logicalX, logicalY - 1))) {
        tlBrScore++;
    }
    if (brSecondary && (belowRightSecondary || isSecondary(logicalX + 2, logicalY + 1) || isSecondary(logicalX + 1, logicalY + 2))) {
        tlBrScore++;
    }
    
    // If secondary terrain continues in TR↔BL direction  
    if (trSecondary && (aboveRightSecondary || isSecondary(logicalX + 2, logicalY) || isSecondary(logicalX + 1, logicalY - 1))) {
        trBlScore++;
    }
    if (blSecondary && (belowLeftSecondary || isSecondary(logicalX - 1, logicalY + 1) || isSecondary(logicalX, logicalY + 2))) {
        trBlScore++;
    }
    
    // Index 6 default is TR↔BL diagonal (C2), index 9 default is TL↔BR diagonal (C1)
    // Swap if the other diagonal has a higher score
    if (dualGridIndex === 6) {
        // Default is TR↔BL, swap to TL↔BR if that scores higher
        return tlBrScore > trBlScore;
    } else {
        // Default is TL↔BR, swap to TR↔BL if that scores higher  
        return trBlScore > tlBrScore;
    }
}

/**
 * Determine the primary terrain from 4 corners based on priority.
 * The primary terrain is the one with highest priority (highest number).
 */
function getPrimaryTerrain(terrains: string[]): string {
    let primary = terrains[0];
    let highestPriority = getTerrainPriority(primary);
    
    for (let i = 1; i < terrains.length; i++) {
        const priority = getTerrainPriority(terrains[i]);
        if (priority > highestPriority) {
            highestPriority = priority;
            primary = terrains[i];
        }
    }
    
    return primary;
}

/**
 * Determine the secondary terrain (the one that's different from primary).
 * Returns the lowest priority terrain that isn't the primary.
 */
function getSecondaryTerrain(terrains: string[], primaryTerrain: string): string | null {
    let secondary: string | null = null;
    let lowestPriority = Infinity;
    
    for (const terrain of terrains) {
        if (terrain !== primaryTerrain) {
            const priority = getTerrainPriority(terrain);
            if (priority < lowestPriority) {
                lowestPriority = priority;
                secondary = terrain;
            }
        }
    }
    
    return secondary;
}

/**
 * Result of tileset lookup with metadata about whether it was reversed.
 */
interface TransitionTilesetResult {
    tilesetPath: string;
    /** True if we found the tileset using Secondary_Primary key (needs bitmask inversion) */
    isReversed: boolean;
}

/**
 * Get tileset path for a terrain transition.
 * Tries Primary_Secondary first, then Secondary_Primary.
 * Returns metadata about whether the lookup was reversed (which affects bitmask).
 */
function getTransitionTilesetWithMeta(primary: string, secondary: string): TransitionTilesetResult | null {
    // Try direct lookup (Primary_Secondary)
    const key1 = `${primary}_${secondary}`;
    if (TRANSITION_TILESETS[key1]) {
        return { tilesetPath: TRANSITION_TILESETS[key1], isReversed: false };
    }
    
    // Try reversed lookup (Secondary_Primary)
    // When this is used, the tileset was designed with opposite primary/secondary,
    // so the bitmask needs to be inverted when rendering.
    const key2 = `${secondary}_${primary}`;
    if (TRANSITION_TILESETS[key2]) {
        return { tilesetPath: TRANSITION_TILESETS[key2], isReversed: true };
    }
    
    return null;
}

// =============================================================================
// PUBLIC API
// =============================================================================

export interface DualGridTileInfo {
    /** The tileset image path to use */
    tilesetPath: string;
    /** The 4-bit index (0-15) for tile selection */
    dualGridIndex: number;
    /** Sprite coordinates in the tileset */
    spriteCoords: { x: number; y: number; width: number; height: number };
    /** The primary terrain type */
    primaryTerrain: string;
    /** The secondary terrain type (if any) */
    secondaryTerrain: string | null;
    /** Whether this is a transition tile (multiple terrain types) */
    isTransition: boolean;
    /** Whether the tileset lookup was reversed (for debugging) */
    isReversedTileset: boolean;
    /** 
     * Which corners to clip/mask when rendering (for 3+ terrain junctions).
     * null = render full tile, otherwise only render specified corners.
     * Array of corner names: 'TL', 'TR', 'BL', 'BR'
     */
    clipCorners: ('TL' | 'TR' | 'BL' | 'BR')[] | null;
    /** Whether to flip the tile horizontally when rendering */
    flipHorizontal: boolean;
    /** Whether to flip the tile vertically when rendering */
    flipVertical: boolean;
}

/**
 * Get Dual Grid tile information for a rendered position.
 * 
 * In Dual Grid, rendered tiles are offset by half a tile from the logical grid.
 * Each rendered tile at position (x, y) straddles 4 logical tiles:
 * - TL: logical tile at (x, y)
 * - TR: logical tile at (x+1, y)
 * - BL: logical tile at (x, y+1)
 * - BR: logical tile at (x+1, y+1)
 * 
 * @param logicalX - The logical tile X coordinate (top-left corner of the 4 tiles)
 * @param logicalY - The logical tile Y coordinate (top-left corner of the 4 tiles)
 * @param worldTiles - Map of world tiles keyed by "x_y"
 * @returns Tile info for rendering, or null if no transition needed
 */
export function getDualGridTileInfo(
    logicalX: number,
    logicalY: number,
    worldTiles: Map<string, WorldTile>
): DualGridTileInfo | null {
    // Get the 4 corner tiles
    const tlTile = worldTiles.get(`${logicalX}_${logicalY}`);
    const trTile = worldTiles.get(`${logicalX + 1}_${logicalY}`);
    const blTile = worldTiles.get(`${logicalX}_${logicalY + 1}`);
    const brTile = worldTiles.get(`${logicalX + 1}_${logicalY + 1}`);
    
    // Get terrain types for each corner
    const tlType = getTileType(tlTile);
    const trType = getTileType(trTile);
    const blType = getTileType(blTile);
    const brType = getTileType(brTile);
    
    // Check if all corners are the same terrain
    const allSame = tlType === trType && trType === blType && blType === brType;
    
    if (allSame) {
        // No transition needed - return null to render base texture
        return null;
    }
    
    // Determine primary and secondary terrains
    const terrains = [tlType, trType, blType, brType];
    const primaryTerrain = getPrimaryTerrain(terrains);
    const secondaryTerrain = getSecondaryTerrain(terrains, primaryTerrain);
    
    if (!secondaryTerrain) {
        // Shouldn't happen if we got here, but safety check
        return null;
    }
    
    // Get tileset for this transition (with metadata about reversed lookup)
    const tilesetResult = getTransitionTilesetWithMeta(primaryTerrain, secondaryTerrain);
    
    if (!tilesetResult) {
        // No tileset for this transition - render base texture
        return null;
    }
    
    const { tilesetPath, isReversed } = tilesetResult;
    
    // Calculate 4-bit Dual Grid index
    // Bit positions: TL(8) + TR(4) + BL(2) + BR(1)
    // 1 = corner is secondary (different from primary), 0 = corner is primary
    let dualGridIndex = 0;
    if (tlType !== primaryTerrain) dualGridIndex |= 8;
    if (trType !== primaryTerrain) dualGridIndex |= 4;
    if (blType !== primaryTerrain) dualGridIndex |= 2;
    if (brType !== primaryTerrain) dualGridIndex |= 1;
    
    // Store original index before potential inversion (needed for flip detection)
    const originalDualGridIndex = dualGridIndex;
    
    // CRITICAL: If the tileset was found via reversed lookup (Secondary_Primary key),
    // it means the tileset was designed with the opposite primary/secondary convention.
    // We need to INVERT the bitmask to get the correct tile variant.
    // Example: Beach_DirtRoad tileset shows Beach as primary, but our priority says
    // DirtRoad is primary. Inverting 15-index swaps all corners.
    if (isReversed) {
        dualGridIndex = 15 - dualGridIndex;
    }
    
    // Look up tile position in tileset
    const tilePos = DUAL_GRID_LOOKUP[dualGridIndex];
    
    // Check if diagonal tiles need horizontal flipping for better connections
    // Use original index before inversion to determine flip, since flip is about
    // the actual pattern, not the tileset orientation
    const flipHorizontal = shouldSwapDiagonal(
        originalDualGridIndex,
        logicalX,
        logicalY,
        worldTiles,
        primaryTerrain
    );
    
    // Calculate sprite coordinates
    const spriteCoords = {
        x: tilePos.col * TILE_SIZE,
        y: tilePos.row * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
    };
    
    return {
        tilesetPath,
        dualGridIndex,
        spriteCoords,
        primaryTerrain,
        secondaryTerrain,
        isTransition: true,
        isReversedTileset: isReversed,
        clipCorners: null, // Full tile rendering for 2-terrain case
        flipHorizontal,
        flipVertical: false,
    };
}

/**
 * Get MULTIPLE Dual Grid tile transitions for multi-terrain junctions (3+ terrains).
 * 
 * When 3+ terrains meet at a junction, we need to render multiple transition layers
 * to avoid visual gaps. Layers are returned in bottom-to-top order.
 * 
 * Example: Beach(2), Grass(6), Forest(7) meeting at a junction:
 * - Layer 1: Grass→Beach transition (fills the gap between grass and beach)
 * - Layer 2: Forest→Grass transition (forest on top)
 * 
 * @returns Array of transitions in render order (bottom to top), or empty if no transitions
 */
export function getDualGridTileInfoMultiLayer(
    logicalX: number,
    logicalY: number,
    worldTiles: Map<string, WorldTile>
): DualGridTileInfo[] {
    // Get the 4 corner tiles
    const tlTile = worldTiles.get(`${logicalX}_${logicalY}`);
    const trTile = worldTiles.get(`${logicalX + 1}_${logicalY}`);
    const blTile = worldTiles.get(`${logicalX}_${logicalY + 1}`);
    const brTile = worldTiles.get(`${logicalX + 1}_${logicalY + 1}`);
    
    // Get terrain types for each corner
    const tlType = getTileType(tlTile);
    const trType = getTileType(trTile);
    const blType = getTileType(blTile);
    const brType = getTileType(brTile);
    
    const cornerTypes = [tlType, trType, blType, brType];
    
    // Check if all corners are the same terrain
    const allSame = tlType === trType && trType === blType && blType === brType;
    if (allSame) {
        return [];
    }
    
    // Get unique terrains sorted by priority (lowest first = renders first/underneath)
    const uniqueTerrains = [...new Set(cornerTypes)];
    uniqueTerrains.sort((a, b) => getTerrainPriority(a) - getTerrainPriority(b));
    
    // If only 2 terrains, use the simple single-layer approach
    if (uniqueTerrains.length === 2) {
        const result = getDualGridTileInfo(logicalX, logicalY, worldTiles);
        return result ? [result] : [];
    }
    
    // For 3+ terrains, create transition layers from bottom to top.
    // Upper layers use CORNER CLIPPING to only render where their higherTerrain exists.
    //
    // Example with corners [G, F, G, B] and terrains [Beach, Grass, Forest]:
    //   - Grass→Beach layer: render fully (clipCorners = null)
    //   - Forest→Grass layer: clip to only TR corner (where Forest actually is)
    // Result: Grass→Beach shows G/B transition, Forest corner overlays at TR only
    const transitions: DualGridTileInfo[] = [];
    
    for (let i = 0; i < uniqueTerrains.length - 1; i++) {
        const lowerTerrain = uniqueTerrains[i];      // Lower priority = underneath
        const higherTerrain = uniqueTerrains[i + 1]; // Higher priority = on top
        const lowerPriority = getTerrainPriority(lowerTerrain);
        const higherPriority = getTerrainPriority(higherTerrain);
        
        // Check if any corner has terrain LOWER than this layer's lowerTerrain
        // If so, we need corner clipping for this layer
        const hasLowerTerrain = cornerTypes.some(t => getTerrainPriority(t) < lowerPriority);
        
        // Determine which corners to clip to (only corners where higherTerrain exists)
        let clipCorners: ('TL' | 'TR' | 'BL' | 'BR')[] | null = null;
        if (hasLowerTerrain) {
            // Only render corners where the higherTerrain of this layer actually exists
            clipCorners = [];
            if (tlType === higherTerrain) clipCorners.push('TL');
            if (trType === higherTerrain) clipCorners.push('TR');
            if (blType === higherTerrain) clipCorners.push('BL');
            if (brType === higherTerrain) clipCorners.push('BR');
            
            // If no corners have the higher terrain, skip this layer entirely
            if (clipCorners.length === 0) {
                continue;
            }
        }
        
        // Get tileset for this transition pair
        const tilesetResult = getTransitionTilesetWithMeta(higherTerrain, lowerTerrain);
        if (!tilesetResult) {
            continue; // No tileset for this pair, skip
        }
        
        const { tilesetPath, isReversed } = tilesetResult;
        
        // Calculate bitmask:
        // bit=1 if corner priority <= lowerTerrain priority (shows secondary/lower)
        // bit=0 if corner priority > lowerTerrain priority (shows primary/higher)
        //
        // This simple rule handles both 2-terrain and 3+ terrain cases correctly:
        // - For Grass→Beach: only Beach corners get bit=1, Grass and Forest get bit=0
        // - For Forest→Grass: Beach and Grass corners get bit=1, only Forest gets bit=0
        // (lowerPriority already calculated above for the skip check)
        let dualGridIndex = 0;
        if (getTerrainPriority(tlType) <= lowerPriority) dualGridIndex |= 8;
        if (getTerrainPriority(trType) <= lowerPriority) dualGridIndex |= 4;
        if (getTerrainPriority(blType) <= lowerPriority) dualGridIndex |= 2;
        if (getTerrainPriority(brType) <= lowerPriority) dualGridIndex |= 1;
        
        // Store original index before potential inversion (needed for flip detection)
        const originalDualGridIndex = dualGridIndex;
        
        // Invert if tileset was found via reversed lookup
        if (isReversed) {
            dualGridIndex = 15 - dualGridIndex;
        }
        
        // Skip if this would be index 0 (all corners are higher terrain) or 15 (none are)
        if (dualGridIndex === 0 || dualGridIndex === 15) {
            continue;
        }
        
        const tilePos = DUAL_GRID_LOOKUP[dualGridIndex];
        
        // Check if diagonal tiles need horizontal flipping for better connections
        // Use original index before inversion to determine flip, since flip is about
        // the actual pattern, not the tileset orientation
        const flipHorizontal = shouldSwapDiagonal(
            originalDualGridIndex,
            logicalX,
            logicalY,
            worldTiles,
            higherTerrain
        );
        
        const spriteCoords = {
            x: tilePos.col * TILE_SIZE,
            y: tilePos.row * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE,
        };
        
        transitions.push({
            tilesetPath,
            dualGridIndex,
            spriteCoords,
            primaryTerrain: higherTerrain,
            secondaryTerrain: lowerTerrain,
            isTransition: true,
            isReversedTileset: isReversed,
            clipCorners,
            flipHorizontal,
            flipVertical: false,
        });
    }
    
    return transitions;
}

/**
 * Get all transition tilesets that need to be preloaded.
 * Returns a map of transition key to tileset path.
 */
export function getAllTransitionTilesets(): Map<string, string> {
    const result = new Map<string, string>();
    
    for (const [key, path] of Object.entries(TRANSITION_TILESETS)) {
        result.set(key, path);
    }
    
    return result;
}

/**
 * Debug utility: Get human-readable description of a Dual Grid index
 */
export function describeDualGridIndex(index: number): string {
    const corners = [
        (index & 8) ? 'TL:diff' : 'TL:same',
        (index & 4) ? 'TR:diff' : 'TR:same',
        (index & 2) ? 'BL:diff' : 'BL:same',
        (index & 1) ? 'BR:diff' : 'BR:same',
    ];
    
    const tilePos = DUAL_GRID_LOOKUP[index];
    const descriptions = [
        'Interior (all same)',
        'Concave BR',
        'Concave BL',
        'Bottom edge',
        'Concave TR',
        'Right edge',
        'Diagonal TR+BL',
        'Convex TL',
        'Concave TL',
        'Diagonal TL+BR',
        'Left edge',
        'Convex TR',
        'Top edge',
        'Convex BL',
        'Convex BR',
        'Secondary interior (all different)',
    ];
    
    return `Index ${index} (${corners.join(', ')}): ${descriptions[index]} @ row ${tilePos.row}, col ${tilePos.col}`;
}
