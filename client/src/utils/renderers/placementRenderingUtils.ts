import { PlacementItemInfo } from '../../hooks/usePlacementManager';
import { BuildingPlacementState, BuildingMode } from '../../hooks/useBuildingManager';
// Import dimensions directly from their respective rendering utility files
import { CAMPFIRE_WIDTH_PREVIEW, CAMPFIRE_HEIGHT_PREVIEW } from './campfireRenderingUtils';
import { FURNACE_WIDTH_PREVIEW, FURNACE_HEIGHT_PREVIEW } from './furnaceRenderingUtils'; // ADDED: Furnace dimensions
import { LANTERN_WIDTH_PREVIEW, LANTERN_HEIGHT_PREVIEW } from './lanternRenderingUtils';
import { SLEEPING_BAG_WIDTH, SLEEPING_BAG_HEIGHT } from './sleepingBagRenderingUtils';
import { STASH_WIDTH, STASH_HEIGHT } from './stashRenderingUtils';
import { SHELTER_RENDER_WIDTH, SHELTER_RENDER_HEIGHT } from './shelterRenderingUtils';
import { HEARTH_WIDTH, HEARTH_HEIGHT, HEARTH_RENDER_Y_OFFSET } from './hearthRenderingUtils'; // ADDED: Hearth dimensions
import { TILE_SIZE, FOUNDATION_TILE_SIZE, worldPixelsToFoundationCell, foundationCellToWorldCenter } from '../../config/gameConfig';
import { DbConnection } from '../../generated';
import { isSeedItemValid, requiresWaterPlacement, requiresBeachPlacement } from '../plantsUtils';
import { renderFoundationPreview, renderWallPreview } from './foundationRenderingUtils';

// Import interaction distance constants
const PLAYER_BOX_INTERACTION_DISTANCE_SQUARED = 80.0 * 80.0; // From useInteractionFinder.ts
const SHELTER_PLACEMENT_MAX_DISTANCE = 256.0;

// Minimum distance between planted seeds (in pixels) - should match usePlacementManager.ts
const MIN_SEED_DISTANCE = 20;

interface RenderPlacementPreviewParams {
    ctx: CanvasRenderingContext2D;
    placementInfo: PlacementItemInfo | null;
    buildingState: BuildingPlacementState | null; // NEW: Building placement state
    itemImagesRef: React.RefObject<Map<string, HTMLImageElement>>;
    doodadImagesRef: React.RefObject<Map<string, HTMLImageElement>>;
    shelterImageRef?: React.RefObject<HTMLImageElement | null>;
    worldMouseX: number | null;
    worldMouseY: number | null;
    isPlacementTooFar: boolean;
    placementError: string | null;
    connection: DbConnection | null;
    worldScale: number; // NEW: World scale for building previews
    viewOffsetX: number; // NEW: View offset for building previews
    viewOffsetY: number; // NEW: View offset for building previews
    localPlayerX: number; // NEW: Player position for validation
    localPlayerY: number; // NEW: Player position for validation
    inventoryItems?: Map<string, any>; // NEW: Inventory items for resource checking
    itemDefinitions?: Map<string, any>; // NEW: Item definitions for resource checking
    foundationTileImagesRef?: React.RefObject<Map<string, HTMLImageElement>>; // ADDED: Foundation tile images
}

/**
 * Converts world pixel coordinates to tile coordinates
 */
function worldPosToTileCoords(worldX: number, worldY: number): { tileX: number; tileY: number } {
    const TILE_SIZE = 48; // pixels per tile (matches server TILE_SIZE_PX and GameCanvas.tsx)
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
    return { tileX, tileY };
}

/**
 * Gets tile type from compressed chunk data (matching GameCanvas.tsx logic)
 * Returns tile type tag string or null if not found
 */
export function getTileTypeFromChunkData(connection: DbConnection | null, tileX: number, tileY: number): string | null {
    if (!connection) return null;
    
    // Default chunk size (typically 8 tiles per chunk)
    let chunkSize = 8;
    
    // Try to find chunk size from any chunk data
    for (const chunk of connection.db.worldChunkData.iter()) {
        if (chunk.chunkSize) {
            chunkSize = chunk.chunkSize;
            break;
        }
    }
    
    // Calculate which chunk this tile belongs to (matching GameCanvas.tsx logic)
    const chunkX = Math.floor(tileX / chunkSize);
    const chunkY = Math.floor(tileY / chunkSize);
    
    // Look up the compressed chunk data using the same key format as GameCanvas
    const chunkKey = `${chunkX},${chunkY}`;
    
    // Find chunk by iterating (since we don't have the chunkCacheRef)
    for (const chunk of connection.db.worldChunkData.iter()) {
        if (chunk.chunkX === chunkX && chunk.chunkY === chunkY) {
            // Calculate local tile position within the chunk (matching GameCanvas.tsx logic)
            const localX = tileX % chunkSize;
            const localY = tileY % chunkSize;
            
            // Handle negative mod (for negative tile coordinates)
            const localTileX = localX < 0 ? localX + chunkSize : localX;
            const localTileY = localY < 0 ? localY + chunkSize : localY;
            
            // Use chunk.chunkSize (which may differ from default) for index calculation
            const actualChunkSize = chunk.chunkSize || chunkSize;
            const tileIndex = localTileY * actualChunkSize + localTileX;
            
            // Check bounds and extract tile type
            if (tileIndex >= 0 && tileIndex < chunk.tileTypes.length) {
                const tileTypeU8 = chunk.tileTypes[tileIndex];
                // Convert Uint8 to tile type tag (matching server-side enum in lib.rs TileType::to_u8)
                switch (tileTypeU8) {
                    case 0: return 'Grass';
                    case 1: return 'Dirt';
                    case 2: return 'DirtRoad';
                    case 3: return 'Sea';
                    case 4: return 'Beach';
                    case 5: return 'Sand';
                    case 6: return 'HotSpringWater'; // Hot spring water pools
                    case 7: return 'Quarry'; // Quarry tiles (rocky gray-brown)
                    case 8: return 'Asphalt'; // Paved compound areas
                    case 9: return 'Forest'; // Dense forested areas
                    case 10: return 'Tundra'; // Arctic tundra (northern regions)
                    case 11: return 'Alpine'; // High-altitude rocky terrain
                    default: return 'Grass';
                }
            }
            break; // Found the chunk, no need to continue
        }
    }
    
    return null; // No compressed data found for this position
}

/**
 * Checks if a world position is on a water tile (Sea or HotSpringWater type).
 * Uses compressed chunk data for efficient lookup.
 * Returns true if the position is on water.
 */
function isPositionOnWater(connection: DbConnection | null, worldX: number, worldY: number): boolean {
    if (!connection) {
        return false; // If no connection, allow placement (fallback)
    }

    const { tileX, tileY } = worldPosToTileCoords(worldX, worldY);
    
    // Use compressed chunk data lookup
    const tileType = getTileTypeFromChunkData(connection, tileX, tileY);
    // Block placement on both regular water (Sea) and hot spring water
    return tileType === 'Sea' || tileType === 'HotSpringWater';
}

/**
 * Checks if a world position is on a beach tile (Beach type).
 * Uses compressed chunk data for efficient lookup.
 * Returns true if the position is on a beach.
 */
function isPositionOnBeach(connection: DbConnection | null, worldX: number, worldY: number): boolean {
    if (!connection) {
        return false; // If no connection, allow placement (fallback)
    }

    const { tileX, tileY } = worldPosToTileCoords(worldX, worldY);
    
    // Use compressed chunk data lookup
    const tileType = getTileTypeFromChunkData(connection, tileX, tileY);
    return tileType === 'Beach';
}

/**
 * Calculates the distance to the nearest shore (non-water tile) from a water position.
 * Returns distance in pixels, or -1 if position is not on water.
 */
function calculateShoreDistance(connection: DbConnection | null, worldX: number, worldY: number): number {
    if (!connection) return -1;
    
    const TILE_SIZE = 48; // pixels per tile (matches server TILE_SIZE_PX and GameCanvas.tsx)
    const MAX_SEARCH_RADIUS_PIXELS = 200.0; // Matching server-side limit (20 meters = 200 pixels)
    const MAX_SEARCH_RADIUS_TILES = Math.ceil(MAX_SEARCH_RADIUS_PIXELS / TILE_SIZE); // ~5 tiles
    
    const { tileX: centerTileX, tileY: centerTileY } = worldPosToTileCoords(worldX, worldY);
    
    // First verify we're on water
    if (!isPositionOnWater(connection, worldX, worldY)) {
        return -1; // Not on water
    }
    
    // Search outward in concentric circles to find nearest non-water tile
    // Limit search to MAX_SEARCH_RADIUS_TILES to match server-side 200 pixel limit
    for (let radius = 1; radius <= MAX_SEARCH_RADIUS_TILES; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                // Only check tiles on the perimeter of the current radius
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                
                const checkTileX = centerTileX + dx;
                const checkTileY = centerTileY + dy;
                
                // Find this tile using compressed chunk data
                const checkTileType = getTileTypeFromChunkData(connection, checkTileX, checkTileY);
                
                // If this tile is not water, we found shore
                if (checkTileType !== null && checkTileType !== 'Sea') {
                    const distancePixels = radius * TILE_SIZE;
                    // Cap at MAX_SEARCH_RADIUS_PIXELS to match server behavior
                    return Math.min(distancePixels, MAX_SEARCH_RADIUS_PIXELS);
                }
            }
        }
    }
    
    return MAX_SEARCH_RADIUS_PIXELS + 1; // Beyond max search radius
}

/**
 * Checks if Reed Rhizome placement is valid (water within 20m of shore).
 * Returns true if placement should be blocked.
 */
function isReedRhizomePlacementBlocked(connection: DbConnection | null, worldX: number, worldY: number): boolean {
    if (!connection) return false;
    
    // Reed Rhizomes must be on water
    if (!isPositionOnWater(connection, worldX, worldY)) {
        return true; // Block if not on water
    }
    
    // Reed Rhizomes must be within 50m (500 pixels) of shore - MATCHING SERVER-SIDE LIMIT
    const shoreDistance = calculateShoreDistance(connection, worldX, worldY);
    const MAX_SHORE_DISTANCE = 500.0; // 50 meters = 500 pixels (matching server-side constant)
    
    if (shoreDistance < 0 || shoreDistance > MAX_SHORE_DISTANCE) {
        return true; // Block if too far from shore
    }
    
    return false; // Valid placement
}

/**
 * Checks if Beach Lyme Grass Seeds placement is valid (beach tiles only).
 * Returns true if placement should be blocked.
 */
function isBeachLymeGrassPlacementBlocked(connection: DbConnection | null, worldX: number, worldY: number): boolean {
    if (!connection) return false;
    
    // Beach Lyme Grass Seeds must be on beach tiles
    if (!isPositionOnBeach(connection, worldX, worldY)) {
        return true; // Block if not on beach
    }
    
    return false; // Valid placement
}

/**
 * Checks if placement should be blocked due to water tiles.
 * This applies to shelters, camp fires, lanterns, stashes, wooden storage boxes, sleeping bags, and most seeds.
 * Reed Rhizomes have special handling and require water instead.
 * Beach Lyme Grass Seeds and Scurvy Grass Seeds have special handling and require beach tiles.
 */
function isWaterPlacementBlocked(connection: DbConnection | null, placementInfo: PlacementItemInfo | null, worldX: number, worldY: number): boolean {
    if (!connection || !placementInfo) {
        return false;
    }

    // Special case: Seeds that require water placement (like Reed Rhizome)
    if (requiresWaterPlacement(placementInfo.itemName)) {
        return isReedRhizomePlacementBlocked(connection, worldX, worldY);
    }

    // Special case: Seeds that require beach placement (like Beach Lyme Grass Seeds)
    if (requiresBeachPlacement(placementInfo.itemName)) {
        return isBeachLymeGrassPlacementBlocked(connection, worldX, worldY);
    }

    // List of items that cannot be placed on water
    const waterBlockedItems = ['Camp Fire', 'Furnace', 'Lantern', 'Wooden Storage Box', 'Sleeping Bag', 'Stash', 'Shelter', 'Reed Rain Collector']; // ADDED: Furnace
    
    // Seeds that don't require water or beach (most seeds) cannot be planted on water
    const isSeedButNotSpecialSeed = isSeedItemValid(placementInfo.itemName) && 
                                     !requiresWaterPlacement(placementInfo.itemName) && 
                                     !requiresBeachPlacement(placementInfo.itemName);
    
    if (waterBlockedItems.includes(placementInfo.itemName) || isSeedButNotSpecialSeed) {
        return isPositionOnWater(connection, worldX, worldY);
    }
    
    return false;
}

/**
 * Checks if a seed placement is too close to existing planted seeds.
 * Returns true if the placement should be blocked.
 */
function isSeedPlacementTooClose(connection: DbConnection | null, placementInfo: PlacementItemInfo | null, worldX: number, worldY: number): boolean {
    // Client-side validation removed - let players experiment freely!
    // The server-side crowding penalty system will handle optimization naturally
    return false;
}

/**
 * Checks if a world position is too close to any wall (with buffer zone)
 * Used to prevent placing placeables on or near walls (client-side validation)
 * Returns true if the position is within the buffer zone around a wall, false otherwise
 */
function isPositionOnWall(
    connection: DbConnection | null,
    worldX: number,
    worldY: number
): boolean {
    if (!connection) return false;
    
    const WALL_COLLISION_THICKNESS = 6.0;
    const PLACEMENT_BUFFER = 24.0; // Buffer zone around walls (prevents placing too close on either side)
    const FOUNDATION_TILE_SIZE = 96;
    
    // Convert world position to foundation cell coordinates
    const cellX = Math.floor(worldX / FOUNDATION_TILE_SIZE);
    const cellY = Math.floor(worldY / FOUNDATION_TILE_SIZE);
    
    // Check walls in nearby cells (±1 cell in each direction to catch edge cases)
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
            const checkCellX = cellX + offsetX;
            const checkCellY = cellY + offsetY;
            
            // Iterate through all walls and check if they're on this cell
            for (const wall of connection.db.wallCell.iter()) {
                if (wall.isDestroyed) continue;
                
                // Only check walls on the cell we're interested in
                if (wall.cellX !== checkCellX || wall.cellY !== checkCellY) continue;
                
                // Calculate wall edge collision bounds using foundation cell coordinates
                const tileLeft = checkCellX * FOUNDATION_TILE_SIZE;
                const tileTop = checkCellY * FOUNDATION_TILE_SIZE;
                const tileRight = tileLeft + FOUNDATION_TILE_SIZE;
                const tileBottom = tileTop + FOUNDATION_TILE_SIZE;
                
                // Determine wall edge bounds with buffer zone on both sides
                // Edge 0 = North (top), 1 = East (right), 2 = South (bottom), 3 = West (left)
                // Buffer extends on both interior and exterior sides of the wall
                let wallMinX: number, wallMaxX: number, wallMinY: number, wallMaxY: number;
                
                switch (wall.edge) {
                    case 0: // North (top edge) - horizontal line
                        // Buffer extends both north (exterior) and south (interior) of the wall
                        wallMinX = tileLeft;
                        wallMaxX = tileRight;
                        wallMinY = tileTop - WALL_COLLISION_THICKNESS / 2.0 - PLACEMENT_BUFFER;
                        wallMaxY = tileTop + WALL_COLLISION_THICKNESS / 2.0 + PLACEMENT_BUFFER;
                        break;
                    case 1: // East (right edge) - vertical line
                        // Buffer extends both east (exterior) and west (interior) of the wall
                        wallMinX = tileRight - WALL_COLLISION_THICKNESS / 2.0 - PLACEMENT_BUFFER;
                        wallMaxX = tileRight + WALL_COLLISION_THICKNESS / 2.0 + PLACEMENT_BUFFER;
                        wallMinY = tileTop;
                        wallMaxY = tileBottom;
                        break;
                    case 2: // South (bottom edge) - horizontal line
                        // Buffer extends both south (exterior) and north (interior) of the wall
                        wallMinX = tileLeft;
                        wallMaxX = tileRight;
                        wallMinY = tileBottom - WALL_COLLISION_THICKNESS / 2.0 - PLACEMENT_BUFFER;
                        wallMaxY = tileBottom + WALL_COLLISION_THICKNESS / 2.0 + PLACEMENT_BUFFER;
                        break;
                    case 3: // West (left edge) - vertical line
                        // Buffer extends both west (exterior) and east (interior) of the wall
                        wallMinX = tileLeft - WALL_COLLISION_THICKNESS / 2.0 - PLACEMENT_BUFFER;
                        wallMaxX = tileLeft + WALL_COLLISION_THICKNESS / 2.0 + PLACEMENT_BUFFER;
                        wallMinY = tileTop;
                        wallMaxY = tileBottom;
                        break;
                    default:
                        continue; // Skip invalid edges
                }
                
                // Check if placement position is within wall collision bounds (including buffer)
                if (worldX >= wallMinX && worldX <= wallMaxX &&
                    worldY >= wallMinY && worldY <= wallMaxY) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

export function isPlacementTooFar(
    placementInfo: PlacementItemInfo | null, 
    playerX: number, 
    playerY: number, 
    worldX: number, 
    worldY: number
): boolean {
    if (!placementInfo) {
        return false;
    }

    const placeDistSq = (worldX - playerX) ** 2 + (worldY - playerY) ** 2;

    // Use appropriate placement range based on item type
    // These should match server-side placement distance constants!
    let clientPlacementRangeSq: number;
    if (placementInfo.iconAssetName === 'shelter_b.png') {
        // Shelter has a much larger placement range (256px vs 64px for other items)
        clientPlacementRangeSq = SHELTER_PLACEMENT_MAX_DISTANCE * SHELTER_PLACEMENT_MAX_DISTANCE;
    } else if (placementInfo.iconAssetName === 'hearth.png') {
        // Matron's Chest has increased placement range (200px) to make placement easier
        const HEARTH_PLACEMENT_MAX_DISTANCE = 200.0;
        clientPlacementRangeSq = HEARTH_PLACEMENT_MAX_DISTANCE * HEARTH_PLACEMENT_MAX_DISTANCE;
    } else if (placementInfo.iconAssetName === 'field_cauldron.png') {
        // Field Cauldron (broth pot) matches server PLAYER_BROTH_POT_INTERACTION_DISTANCE = 200.0
        const BROTH_POT_PLACEMENT_MAX_DISTANCE = 200.0;
        clientPlacementRangeSq = BROTH_POT_PLACEMENT_MAX_DISTANCE * BROTH_POT_PLACEMENT_MAX_DISTANCE;
    } else if (placementInfo.iconAssetName === 'wood_door.png' || placementInfo.iconAssetName === 'metal_door.png') {
        // Doors match server BUILDING_PLACEMENT_MAX_DISTANCE = 128.0
        const DOOR_PLACEMENT_MAX_DISTANCE = 128.0;
        clientPlacementRangeSq = DOOR_PLACEMENT_MAX_DISTANCE * DOOR_PLACEMENT_MAX_DISTANCE;
    } else {
        // Use standard interaction distance for other items (campfires, lanterns, boxes, etc.)
        clientPlacementRangeSq = PLAYER_BOX_INTERACTION_DISTANCE_SQUARED * 1.1;
    }

    return placeDistSq > clientPlacementRangeSq;
}

/**
 * All placement previews should be perfectly centered on the cursor.
 * Server-side positioning has been adjusted to compensate for renderer anchoring,
 * so placement previews no longer need visual offsets.
 */

/**
 * Check if foundation placement is valid (client-side validation)
 * Now includes resource checking
 */
function isFoundationPlacementValid(
    connection: DbConnection | null,
    cellX: number,
    cellY: number,
    shape: number,
    playerX: number,
    playerY: number,
    inventoryItems?: Map<string, any>,
    itemDefinitions?: Map<string, any>
): boolean {
    if (!connection) return false;

    const BUILDING_PLACEMENT_MAX_DISTANCE = 128.0;
    const BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED = BUILDING_PLACEMENT_MAX_DISTANCE * BUILDING_PLACEMENT_MAX_DISTANCE;
    
    // Cost depends on shape: 50 for full, 25 for triangles
    const REQUIRED_WOOD = (shape === 1) ? 50 : 25; // 1 = Full, 2-5 = Triangles

    // Convert cell coordinates to world pixel coordinates (center of foundation cell)
    const { x: worldX, y: worldY } = foundationCellToWorldCenter(cellX, cellY);

    // Check distance
    const dx = worldX - playerX;
    const dy = worldY - playerY;
    const distSq = dx * dx + dy * dy;
    if (distSq > BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED) {
        return false;
    }

    // Check if position has grass (foundations cannot be placed on grass - must clear first)
    const FOUNDATION_SIZE = 96; // Foundation is 96x96 pixels
    const foundationMinX = worldX - FOUNDATION_SIZE / 2;
    const foundationMaxX = worldX + FOUNDATION_SIZE / 2;
    const foundationMinY = worldY - FOUNDATION_SIZE / 2;
    const foundationMaxY = worldY + FOUNDATION_SIZE / 2;
    
    for (const grass of connection.db.grass.iter()) {
        if (grass.health > 0 &&
            grass.posX >= foundationMinX && grass.posX <= foundationMaxX &&
            grass.posY >= foundationMinY && grass.posY <= foundationMaxY) {
            return false; // Grass is blocking placement
        }
    }

    // Check if position is near monuments (rune stones, hot springs, quarries) - 800px radius
    const MONUMENT_RESTRICTION_RADIUS = 800.0;
    const MONUMENT_RESTRICTION_RADIUS_SQ = MONUMENT_RESTRICTION_RADIUS * MONUMENT_RESTRICTION_RADIUS;
    const TILE_SIZE = 48;
    
    // Check rune stones
    for (const runeStone of connection.db.runeStone.iter()) {
        const dx = worldX - runeStone.posX;
        const dy = worldY - runeStone.posY;
        const distSq = dx * dx + dy * dy;
        if (distSq <= MONUMENT_RESTRICTION_RADIUS_SQ) {
            return false; // Too close to rune stone
        }
    }
    
    // Check hot springs and quarries using tile type lookup
    // We need to check a radius around the foundation position for monument tiles
    const checkRadiusTiles = Math.ceil(MONUMENT_RESTRICTION_RADIUS / TILE_SIZE); // ~17 tiles
    const foundationTileX = Math.floor(worldX / TILE_SIZE);
    const foundationTileY = Math.floor(worldY / TILE_SIZE);
    
    for (let dy = -checkRadiusTiles; dy <= checkRadiusTiles; dy++) {
        for (let dx = -checkRadiusTiles; dx <= checkRadiusTiles; dx++) {
            const checkTileX = foundationTileX + dx;
            const checkTileY = foundationTileY + dy;
            
            const tileType = getTileTypeFromChunkData(connection, checkTileX, checkTileY);
            if (tileType === 'HotSpringWater' || tileType === 'Quarry') {
                const tileCenterX = (checkTileX * TILE_SIZE) + (TILE_SIZE / 2);
                const tileCenterY = (checkTileY * TILE_SIZE) + (TILE_SIZE / 2);
                const dx = worldX - tileCenterX;
                const dy = worldY - tileCenterY;
                const distSq = dx * dx + dy * dy;
                if (distSq <= MONUMENT_RESTRICTION_RADIUS_SQ) {
                    return false; // Too close to hot spring or quarry
                }
            }
        }
    }

    // Check if position is already occupied (but allow complementary triangles)
    // IMPORTANT: Check ALL foundations at this cell - there might be two complementary triangles already
    let foundComplementary = false;
    let foundOverlap = false;
    let foundationCount = 0;
    
    for (const foundation of connection.db.foundationCell.iter()) {
        if (foundation.cellX === cellX && foundation.cellY === cellY && !foundation.isDestroyed) {
            foundationCount++;
            const existingShape = foundation.shape as number;
            
            // Same shape = overlap
            if (existingShape === shape) {
                return false; // Position occupied
            }
            
            // Full foundation overlaps with anything
            if (existingShape === 1 || shape === 1) { // 1 = Full
                return false; // Position occupied
            }
            
            // Check if shapes are complementary triangles
            const isComplementary = (
                (existingShape === 2 && shape === 4) || // TriNW + TriSE
                (existingShape === 4 && shape === 2) || // TriSE + TriNW
                (existingShape === 3 && shape === 5) || // TriNE + TriSW
                (existingShape === 5 && shape === 3)    // TriSW + TriNE
            );
            
            if (isComplementary) {
                foundComplementary = true; // Mark that we found a complementary triangle
            } else {
                // Non-complementary shapes overlap
                foundOverlap = true; // Mark that we found an overlap
            }
        }
    }
    
    // If we found an overlap, block placement
    if (foundOverlap) {
        return false;
    }
    
    // If there are already 2 foundations at this cell (two complementary triangles forming a full square),
    // block any further placement
    if (foundationCount >= 2) {
        return false; // Already have two triangles forming a full square
    }
    
    // If we found a complementary triangle and no overlaps, allow placement
    // (This handles the case where we're adding the second triangle to form a full square)
    // If no foundations found at all, allow placement

    // Check if player has enough resources (cost depends on shape)
    if (inventoryItems && itemDefinitions) {
        // Find Wood item definition
        let woodDefId: bigint | null = null;
        for (const def of itemDefinitions.values()) {
            if (def.name === 'Wood') {
                woodDefId = def.id;
                break;
            }
        }
        
        if (woodDefId) {
            // Sum up all wood items (inventory + hotbar)
            let totalWood = 0;
            for (const item of inventoryItems.values()) {
                if (item.itemDefId === woodDefId) {
                    totalWood += item.quantity;
                }
            }
            
            if (totalWood < REQUIRED_WOOD) {
                return false; // Not enough resources
            }
        } else {
            // Can't find wood definition, assume invalid
            return false;
        }
    }

    return true;
}

/**
 * Check if wall placement is valid (client-side validation)
 * Checks: foundation exists, no overlapping wall, distance, resources
 */
function isWallPlacementValid(
    connection: DbConnection | null,
    cellX: number,
    cellY: number,
    worldMouseX: number,
    worldMouseY: number,
    playerX: number,
    playerY: number,
    inventoryItems?: Map<string, any>,
    itemDefinitions?: Map<string, any>
): boolean {
    if (!connection) return false;

    const BUILDING_PLACEMENT_MAX_DISTANCE = 128.0;
    const BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED = BUILDING_PLACEMENT_MAX_DISTANCE * BUILDING_PLACEMENT_MAX_DISTANCE;
    
    // Wall cost: 15 wood for Twig tier
    const REQUIRED_WOOD = 15;

    // Convert cell coordinates to world pixel coordinates (center of foundation cell)
    const { x: worldX, y: worldY } = foundationCellToWorldCenter(cellX, cellY);

    // Check distance
    const dx = worldX - playerX;
    const dy = worldY - playerY;
    const distSq = dx * dx + dy * dy;
    if (distSq > BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED) {
        return false;
    }

    // Check if there's a foundation at this cell (walls require a foundation)
    let hasFoundation = false;
    let foundationShape = 1; // Default to Full (1)
    for (const foundation of connection.db.foundationCell.iter()) {
        if (foundation.cellX === cellX && foundation.cellY === cellY && !foundation.isDestroyed) {
            hasFoundation = true;
            foundationShape = foundation.shape as number;
            break;
        }
    }

    if (!hasFoundation) {
        return false; // No foundation at this location
    }

    // Check if foundation is a triangle (needed for edge detection)
    const isTriangle = foundationShape >= 2 && foundationShape <= 5;

    // Determine edge based on mouse position (same logic as server)
    // Convert foundation cell center to world coordinates
    const { x: foundationCenterX, y: foundationCenterY } = foundationCellToWorldCenter(cellX, cellY);
    const tileCenterX = foundationCenterX;
    const tileCenterY = foundationCenterY;
    const dxFromCenter = worldMouseX - tileCenterX;
    const dyFromCenter = worldMouseY - tileCenterY;
    const absDx = Math.abs(dxFromCenter);
    const absDy = Math.abs(dyFromCenter);
    
    // For triangle foundations, also consider diagonal edges
    let edge: number;
    if (isTriangle) {
        // Calculate distance to diagonal edges
        // Use same logic as preview rendering
        const diagNW_SE_dist = Math.abs(dxFromCenter - dyFromCenter); // Distance to NW-SE diagonal
        const diagNE_SW_dist = Math.abs(dxFromCenter + dyFromCenter); // Distance to NE-SW diagonal
        
        // Check if we're closer to a diagonal than to cardinal edges
        // Use a threshold to prefer diagonals when close
        const minCardinalDist = Math.min(absDx, absDy);
        const minDiagDist = Math.min(diagNW_SE_dist, diagNE_SW_dist);
        
        // Prefer diagonal if it's significantly closer, or if we're very close to diagonal
        if (minDiagDist < minCardinalDist * 1.2 || minDiagDist < 10) {
            // Closer to diagonal
            if (diagNW_SE_dist < diagNE_SW_dist) {
                edge = 5; // DiagNW_SE
            } else {
                edge = 4; // DiagNE_SW
            }
        } else {
            // Closer to cardinal edge
            if (absDy > absDx) {
                edge = dyFromCenter < 0 ? 0 : 2; // North (0) or South (2)
            } else {
                edge = dxFromCenter < 0 ? 3 : 1; // West (3) or East (1)
            }
        }
    } else {
        // Full foundation - only cardinal edges
        if (absDy > absDx) {
            edge = dyFromCenter < 0 ? 0 : 2; // North (0) or South (2)
        } else {
            edge = dxFromCenter < 0 ? 3 : 1; // West (3) or East (1)
        }
    }

    // Check if edge is valid for triangle foundations
    if (isTriangle) {
        // Triangle shapes: 2=TriNW, 3=TriNE, 4=TriSE, 5=TriSW
        // Valid edges for each triangle:
        // TriNW (2): N, W, DiagNW_SE edges (0, 3, 5)
        // TriNE (3): N, E, DiagNE_SW edges (0, 1, 4)
        // TriSE (4): S, E, DiagNW_SE edges (2, 1, 5)
        // TriSW (5): S, W, DiagNE_SW edges (2, 3, 4)
        let isValidEdge = false;
        switch (foundationShape) {
            case 2: // TriNW
                isValidEdge = edge === 0 || edge === 3 || edge === 5; // N, W, or DiagNW_SE
                break;
            case 3: // TriNE
                isValidEdge = edge === 0 || edge === 1 || edge === 4; // N, E, or DiagNE_SW
                break;
            case 4: // TriSE
                isValidEdge = edge === 2 || edge === 1 || edge === 5; // S, E, or DiagNW_SE
                break;
            case 5: // TriSW
                isValidEdge = edge === 2 || edge === 3 || edge === 4; // S, W, or DiagNE_SW
                break;
        }
        if (!isValidEdge) {
            return false; // Invalid edge for triangle foundation
        }
    }

    // Check if a wall already exists at this cell, edge, and facing
    // Also check adjacent tiles for shared edges
    // Note: We don't check facing - walls on same edge block regardless of facing
    // IMPORTANT: Check ALL walls at this cell, not just the detected edge
    // This handles cases where edge detection might be slightly off
    for (const wall of connection.db.wallCell.iter()) {
        if (wall.cellX === cellX && wall.cellY === cellY && !wall.isDestroyed) {
            // Check if this wall is on the same edge OR a very close edge
            // For diagonal edges, also check if there's a wall on the other diagonal
            if (wall.edge === edge) {
                return false; // Wall already exists at this exact edge
            }
            // For triangle foundations, if we detected a diagonal edge but there's a wall
            // on the other diagonal, that's also invalid (can't have two diagonals)
            if (isTriangle && (edge === 4 || edge === 5) && (wall.edge === 4 || wall.edge === 5)) {
                return false; // Diagonal wall already exists
            }
        }
    }
    
    // Check adjacent tiles for shared edges
    // North edge of (x, y) = South edge of (x, y-1)
    // East edge of (x, y) = West edge of (x+1, y)
    // South edge of (x, y) = North edge of (x, y+1)
    // West edge of (x, y) = East edge of (x-1, y)
    let adjacentCellX: number = 0;
    let adjacentCellY: number = 0;
    let oppositeEdge: number = 0;
    let hasAdjacentTile = false;
    
    if (edge === 0) { // North
        adjacentCellX = cellX;
        adjacentCellY = cellY - 1;
        oppositeEdge = 2; // South
        hasAdjacentTile = true;
    } else if (edge === 1) { // East
        adjacentCellX = cellX + 1;
        adjacentCellY = cellY;
        oppositeEdge = 3; // West
        hasAdjacentTile = true;
    } else if (edge === 2) { // South
        adjacentCellX = cellX;
        adjacentCellY = cellY + 1;
        oppositeEdge = 0; // North
        hasAdjacentTile = true;
    } else if (edge === 3) { // West
        adjacentCellX = cellX - 1;
        adjacentCellY = cellY;
        oppositeEdge = 1; // East
        hasAdjacentTile = true;
    }
    // Diagonal edges (4, 5) don't have adjacent tiles (they're internal to the triangle)
    
    // Check adjacent cell for a wall on the opposite edge (only for cardinal edges)
    if (hasAdjacentTile) {
        for (const wall of connection.db.wallCell.iter()) {
            if (wall.cellX === adjacentCellX && wall.cellY === adjacentCellY && wall.edge === oppositeEdge && !wall.isDestroyed) {
                return false; // Wall already exists on the shared edge with the adjacent tile
            }
        }
    }

    // Check if player has enough resources
    if (inventoryItems && itemDefinitions) {
        // Find Wood item definition
        let woodDefId: bigint | null = null;
        for (const def of itemDefinitions.values()) {
            if (def.name === 'Wood') {
                woodDefId = def.id;
                break;
            }
        }

        if (!woodDefId) {
            return false; // Wood item definition not found
        }

        // Sum up all wood items (inventory + hotbar)
        let totalWood = 0;
        for (const item of inventoryItems.values()) {
            if (item.itemDefId === woodDefId) {
                totalWood += item.quantity;
            }
        }

        if (totalWood < REQUIRED_WOOD) {
            return false; // Not enough wood
        }
    }

    return true;
}

/**
 * Renders the placement preview item/structure following the mouse.
 */
export function renderPlacementPreview({
    ctx,
    placementInfo,
    buildingState,
    itemImagesRef,
    doodadImagesRef,
    shelterImageRef,
    worldMouseX,
    worldMouseY,
    isPlacementTooFar,
    placementError,
    connection,
    worldScale,
    viewOffsetX,
    viewOffsetY,
    localPlayerX,
    localPlayerY,
    inventoryItems,
    itemDefinitions,
    foundationTileImagesRef,
}: RenderPlacementPreviewParams): void {
    // Handle building preview first
    if (buildingState?.isBuilding && worldMouseX !== null && worldMouseY !== null) {
        // Convert mouse position to foundation cell coordinates (96px grid)
        const { cellX, cellY } = worldPixelsToFoundationCell(worldMouseX, worldMouseY);
        
        if (buildingState.mode === BuildingMode.Foundation) {
            const isValid = isFoundationPlacementValid(
                connection,
                cellX,
                cellY,
                buildingState.foundationShape,
                localPlayerX,
                localPlayerY,
                inventoryItems,
                itemDefinitions
            );

            renderFoundationPreview({
                ctx,
                cellX: cellX,
                cellY: cellY,
                shape: buildingState.foundationShape,
                tier: buildingState.buildingTier,
                isValid,
                worldScale,
                viewOffsetX,
                viewOffsetY,
                foundationTileImagesRef,
            });
        } else if (buildingState.mode === BuildingMode.Wall) {
            // First check if there's a foundation at this cell - don't render wall preview without one
            let hasFoundation = false;
            if (connection) {
                for (const foundation of connection.db.foundationCell.iter()) {
                    if (foundation.cellX === cellX && foundation.cellY === cellY && !foundation.isDestroyed) {
                        hasFoundation = true;
                        break;
                    }
                }
            }

            // Only render wall preview if there's a foundation to snap to
            if (hasFoundation) {
                const isValid = isWallPlacementValid(
                    connection,
                    cellX,
                    cellY,
                    worldMouseX,
                    worldMouseY,
                    localPlayerX,
                    localPlayerY,
                    inventoryItems,
                    itemDefinitions
                );

                renderWallPreview({
                    ctx,
                    cellX: cellX,
                    cellY: cellY,
                    worldMouseX,
                    worldMouseY,
                    tier: buildingState.buildingTier,
                    isValid,
                    worldScale,
                    viewOffsetX,
                    viewOffsetY,
                    foundationTileImagesRef,
                    connection, // ADDED: Pass connection to check foundation shape
                });
            }
        }
        return; // Building preview rendered, exit early
    }

    // Handle item placement preview (existing logic)
    if (!placementInfo || worldMouseX === null || worldMouseY === null) {
        return; // Nothing to render
    }

    // Check if this is a seed placement
    // Dynamic seed detection using plant utils - no more hardcoding!
    const isSeedPlacement = isSeedItemValid(placementInfo.itemName);
    
    // Check if this is a door placement
    const isDoorPlacement = placementInfo.iconAssetName === 'wood_door.png' || placementInfo.iconAssetName === 'metal_door.png';
    
    // Calculate door edge early if it's a door placement (needed for image selection)
    let doorEdgeForPreview: number = 2; // Default to South
    if (isDoorPlacement && connection) {
        const FOUNDATION_TILE_SIZE = 96;
        let nearestDistance = Infinity;
        let nearestFoundation: any = null;
        
        // Find closest foundation cell
        for (const foundation of connection.db.foundationCell.iter()) {
            if (foundation.isDestroyed) continue;
            
            const foundationCenterX = foundation.cellX * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
            const foundationCenterY = foundation.cellY * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
            
            const dx = worldMouseX - foundationCenterX;
            const dy = worldMouseY - foundationCenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < nearestDistance && distance < FOUNDATION_TILE_SIZE * 1.5) {
                nearestDistance = distance;
                nearestFoundation = foundation;
            }
        }
        
        if (nearestFoundation) {
            const foundationCenterY = nearestFoundation.cellY * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
            doorEdgeForPreview = worldMouseY < foundationCenterY ? 0 : 2; // 0 = North, 2 = South
        }
    }
    
    // Determine which image to use for the preview
    let previewImg: HTMLImageElement | undefined;
    
    if (isSeedPlacement) {
        // For seeds, use the planted_seed.png from doodads folder
        previewImg = doodadImagesRef.current?.get('planted_seed.png');
    } else if (placementInfo.iconAssetName === 'shelter.png' && shelterImageRef?.current) {
        // For shelters, use the shelter image from doodads folder
        previewImg = shelterImageRef.current;
    } else if (isDoorPlacement) {
        // For doors, use the doodads images (not item icons)
        // Determine which door sprite to use based on edge and type
        const isNorthEdge = doorEdgeForPreview === 0;
        
        if (placementInfo.iconAssetName === 'wood_door.png') {
            previewImg = doodadImagesRef.current?.get(isNorthEdge ? 'wood_door_north.png' : 'wood_door.png');
        } else if (placementInfo.iconAssetName === 'metal_door.png') {
            previewImg = doodadImagesRef.current?.get(isNorthEdge ? 'metal_door_north.png' : 'metal_door.png');
        }
    } else {
        // For other items, use the item images (including hearth.png)
        previewImg = itemImagesRef.current?.get(placementInfo.iconAssetName);
    }

    // Determine width/height based on placement item (all previews centered on cursor)
    let drawWidth = CAMPFIRE_WIDTH_PREVIEW; // Default to campfire
    let drawHeight = CAMPFIRE_HEIGHT_PREVIEW;

    if (placementInfo.iconAssetName === 'furnace_simple.png') { // ADDED: Furnace placement dimensions
        drawWidth = FURNACE_WIDTH_PREVIEW; 
        drawHeight = FURNACE_HEIGHT_PREVIEW;
    } else if (placementInfo.iconAssetName === 'lantern_off.png') {
        drawWidth = LANTERN_WIDTH_PREVIEW; 
        drawHeight = LANTERN_HEIGHT_PREVIEW;
    } else if (placementInfo.iconAssetName === 'wooden_storage_box.png') {
        // Assuming box preview uses same dimensions as campfire for now
        // TODO: If wooden_storage_box has its own preview dimensions, import them
        drawWidth = CAMPFIRE_WIDTH_PREVIEW; 
        drawHeight = CAMPFIRE_HEIGHT_PREVIEW;
    } else if (placementInfo.iconAssetName === 'sleeping_bag.png') {
        drawWidth = SLEEPING_BAG_WIDTH; 
        drawHeight = SLEEPING_BAG_HEIGHT;
    } else if (placementInfo.iconAssetName === 'stash.png') {
        drawWidth = STASH_WIDTH;
        drawHeight = STASH_HEIGHT;
    } else if (placementInfo.iconAssetName === 'shelter.png') {
        drawWidth = SHELTER_RENDER_WIDTH; 
        drawHeight = SHELTER_RENDER_HEIGHT;
    } else if (placementInfo.iconAssetName === 'reed_rain_collector.png') {
        // Rain collector should match the actual sprite dimensions
        drawWidth = 96;  // Doubled from 48
        drawHeight = 128; // Doubled from 64
    } else if (placementInfo.iconAssetName === 'hearth.png') {
        // Matron's Chest preview dimensions (matches actual rendering: 125px, 30% larger than base 96px)
        drawWidth = HEARTH_WIDTH;  // 125px
        drawHeight = HEARTH_HEIGHT; // 125px
    } else if (placementInfo.iconAssetName === 'field_cauldron.png') {
        // Broth pot preview dimensions (similar to rain collector)
        drawWidth = 80;
        drawHeight = 80;
    } else if (placementInfo.iconAssetName === 'wood_door.png' || placementInfo.iconAssetName === 'metal_door.png') {
        // Door preview dimensions (matches FOUNDATION_TILE_SIZE)
        drawWidth = 96;
        drawHeight = 96;
    } else if (isSeedPlacement) {
        // Seeds should match the actual planted seed size (48x48)
        drawWidth = 48;  
        drawHeight = 48;
    }

    ctx.save();

    // Special handling for broth pot - snap to nearest heat source (campfire or fumarole)
    let snappedX = worldMouseX;
    let snappedY = worldMouseY;
    let nearestHeatSource: any = null;
    let heatSourceType: 'campfire' | 'fumarole' | null = null;
    
    if (placementInfo.iconAssetName === 'field_cauldron.png' && connection) {
        let nearestDistance = Infinity;
        const HEAT_SOURCE_SNAP_DISTANCE = 200; // Increased for easier placement
        
        // Check campfires
        for (const campfire of connection.db.campfire.iter()) {
            const dx = worldMouseX - campfire.posX;
            const dy = worldMouseY - campfire.posY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < nearestDistance && distance < HEAT_SOURCE_SNAP_DISTANCE) {
                nearestDistance = distance;
                nearestHeatSource = campfire;
                heatSourceType = 'campfire';
            }
        }
        
        // Check fumaroles (always-on heat sources)
        for (const fumarole of connection.db.fumarole.iter()) {
            const dx = worldMouseX - fumarole.posX;
            const dy = worldMouseY - fumarole.posY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < nearestDistance && distance < HEAT_SOURCE_SNAP_DISTANCE) {
                nearestDistance = distance;
                nearestHeatSource = fumarole;
                heatSourceType = 'fumarole';
            }
        }
        
        if (nearestHeatSource) {
            // Snap to heat source position - match server placement exactly
            // Server places pot at: campfire.pos_y - 60.0, fumarole.pos_y - 20.0
            snappedX = nearestHeatSource.posX;
            if (heatSourceType === 'fumarole') {
                snappedY = nearestHeatSource.posY - 10.0; // Fumaroles: small offset above center
            } else {
                snappedY = nearestHeatSource.posY - 60.0; // Campfires: larger offset
            }
        }
    }
    
    // For backward compatibility, keep nearestCampfire reference
    const nearestCampfire = heatSourceType === 'campfire' ? nearestHeatSource : null;

    // Special handling for door placement - snap to nearest foundation edge (N/S only)
    let nearestDoorFoundation: any = null;
    let doorEdge: number = 0; // 0 = North, 2 = South
    
    if (isDoorPlacement && connection) {
        const FOUNDATION_TILE_SIZE = 96;
        let nearestDistance = Infinity;
        
        // Find closest foundation cell
        for (const foundation of connection.db.foundationCell.iter()) {
            if (foundation.isDestroyed) continue;
            
            // Calculate foundation center position
            const foundationCenterX = foundation.cellX * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
            const foundationCenterY = foundation.cellY * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
            
            const dx = worldMouseX - foundationCenterX;
            const dy = worldMouseY - foundationCenterY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Only consider foundations within interaction range
            if (distance < nearestDistance && distance < FOUNDATION_TILE_SIZE * 1.5) {
                nearestDistance = distance;
                nearestDoorFoundation = foundation;
            }
        }
        
        if (nearestDoorFoundation) {
            // Determine which edge based on cursor Y relative to foundation center
            const foundationCenterY = nearestDoorFoundation.cellY * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
            doorEdge = worldMouseY < foundationCenterY ? 0 : 2; // 0 = North, 2 = South
            
            // Snap to edge position
            snappedX = nearestDoorFoundation.cellX * FOUNDATION_TILE_SIZE + FOUNDATION_TILE_SIZE / 2;
            snappedY = doorEdge === 0 
                ? nearestDoorFoundation.cellY * FOUNDATION_TILE_SIZE // North edge
                : (nearestDoorFoundation.cellY + 1) * FOUNDATION_TILE_SIZE; // South edge
        }
    }

    // Check for water placement restriction
    const isOnWater = isWaterPlacementBlocked(connection, placementInfo, snappedX, snappedY);
    
    // Check for seed proximity restriction
    const isTooCloseToSeeds = isSeedPlacementTooClose(connection, placementInfo, worldMouseX, worldMouseY);
    
    // Check if shelter is being placed on a foundation (not allowed)
    // Shelter is 384x384px, which covers 4x4 foundation cells (96px each)
    // We check a 5x5 grid centered on mouse position for full coverage
    const isOnFoundation = placementInfo.itemName === 'Shelter' && connection && 
        (() => {
            const FOUNDATION_TILE_SIZE = 96;
            const centerCellX = Math.floor(worldMouseX / FOUNDATION_TILE_SIZE);
            const centerCellY = Math.floor(worldMouseY / FOUNDATION_TILE_SIZE);
            
            // Check 5x5 grid around center (±2 cells in each direction)
            for (let offsetX = -2; offsetX <= 2; offsetX++) {
                for (let offsetY = -2; offsetY <= 2; offsetY++) {
                    const checkCellX = centerCellX + offsetX;
                    const checkCellY = centerCellY + offsetY;
                    
                    for (const foundation of connection.db.foundationCell.iter()) {
                        if (foundation.cellX === checkCellX && 
                            foundation.cellY === checkCellY && 
                            !foundation.isDestroyed) {
                            return true;
                        }
                    }
                }
            }
            return false;
        })();
    
    // Check if Matron's Chest is NOT on a foundation (required)
    const isNotOnFoundation = placementInfo.itemName === "Matron's Chest" && connection && 
        (() => {
            const FOUNDATION_TILE_SIZE = 96;
            const centerCellX = Math.floor(worldMouseX / FOUNDATION_TILE_SIZE);
            const centerCellY = Math.floor(worldMouseY / FOUNDATION_TILE_SIZE);
            
            // Check if there's a foundation at this exact cell
            for (const foundation of connection.db.foundationCell.iter()) {
                if (foundation.cellX === centerCellX && 
                    foundation.cellY === centerCellY && 
                    !foundation.isDestroyed) {
                    return false; // Found a foundation, placement is valid
                }
            }
            return true; // No foundation found, placement is invalid
        })();
    
    // Check if placement position is on a wall
    const isOnWall = connection ? isPositionOnWall(connection, worldMouseX, worldMouseY) : false;
    
    // Check if broth pot is being placed without a nearby heat source or on one that already has a pot
    const isBrothPotInvalid = placementInfo.iconAssetName === 'field_cauldron.png' && (() => {
        if (!nearestHeatSource || !heatSourceType) {
            return true; // No heat source nearby
        }
        
        if (heatSourceType === 'campfire') {
            // Check if campfire already has a broth pot
            return nearestHeatSource.attachedBrothPotId !== null && nearestHeatSource.attachedBrothPotId !== undefined;
        } else if (heatSourceType === 'fumarole') {
            // Check if fumarole already has a broth pot
            const existingPotOnFumarole = Array.from(connection!.db.brothPot.iter()).find(
                pot => pot.attachedToFumaroleId === nearestHeatSource.id && !pot.isDestroyed
            );
            return !!existingPotOnFumarole;
        }
        
        return false;
    })();
    
    // Check if door placement is invalid (no foundation, or edge already has wall/door)
    const isDoorInvalid = isDoorPlacement && (() => {
        if (!nearestDoorFoundation || !connection) {
            return true; // No foundation nearby
        }
        
        // Check for existing wall on this edge
        for (const wall of connection.db.wallCell.iter()) {
            if (wall.cellX === nearestDoorFoundation.cellX && 
                wall.cellY === nearestDoorFoundation.cellY && 
                wall.edge === doorEdge && 
                !wall.isDestroyed) {
                return true; // Wall exists on this edge
            }
        }
        
        // Check for existing door on this edge
        for (const door of connection.db.door.iter()) {
            if (door.cellX === nearestDoorFoundation.cellX && 
                door.cellY === nearestDoorFoundation.cellY && 
                door.edge === doorEdge) {
                return true; // Door exists on this edge
            }
        }
        
        return false; // Valid placement
    })();
    
    // Apply visual effect - red tint with opacity for any invalid placement
    // For broth pot, only invalid if no campfire or campfire has pot - distance doesn't matter if snapping
    // For door, only invalid if no foundation or edge has existing wall/door
    let isInvalidPlacement: boolean;
    if (placementInfo.iconAssetName === 'field_cauldron.png') {
        isInvalidPlacement = isBrothPotInvalid; // Only check campfire validity for broth pot
    } else if (isDoorPlacement) {
        isInvalidPlacement = isDoorInvalid; // Only check foundation edge validity for doors
    } else {
        isInvalidPlacement = isPlacementTooFar || isOnWater || isTooCloseToSeeds || isOnFoundation || isNotOnFoundation || isOnWall || !!placementError;
    }
    
    if (isInvalidPlacement) {
        // Strong red tint for all invalid placements
        ctx.filter = 'sepia(100%) hue-rotate(320deg) saturate(400%) brightness(1.0) contrast(120%)';
        ctx.globalAlpha = 0.8;
    } else {
        // Blue tint for valid placement positions
        ctx.filter = 'sepia(100%) hue-rotate(200deg) saturate(300%) brightness(1.1) contrast(110%)';
        ctx.globalAlpha = 0.7;
    }

    // Calculate the centered position (perfectly centered on cursor or snapped position)
    // Preview is always centered on cursor for all items (except broth pot which snaps to campfire)
    const adjustedX = snappedX - drawWidth / 2;
    // Apply 44px vertical offset for doors (matches door rendering offset)
    const adjustedY = isDoorPlacement 
        ? snappedY - drawHeight / 2 - 44
        : snappedY - drawHeight / 2;

    // Draw the preview image or fallback
    if (previewImg && previewImg.complete && previewImg.naturalHeight !== 0) {
        ctx.drawImage(previewImg, adjustedX, adjustedY, drawWidth, drawHeight);
    } else {
        // Fallback rectangle if image not loaded yet
        ctx.fillStyle = isInvalidPlacement ? "rgba(255, 0, 0, 0.4)" : "rgba(255, 255, 255, 0.3)";
        ctx.fillRect(adjustedX, adjustedY, drawWidth, drawHeight);
    }

    ctx.restore(); // Restore original context state
} 