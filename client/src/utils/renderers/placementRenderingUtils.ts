import { PlacementItemInfo } from '../../hooks/usePlacementManager';
import { BuildingPlacementState, BuildingMode } from '../../hooks/useBuildingManager';
// Import dimensions directly from their respective rendering utility files
import { CAMPFIRE_WIDTH_PREVIEW, CAMPFIRE_HEIGHT_PREVIEW } from './campfireRenderingUtils';
import { FURNACE_WIDTH_PREVIEW, FURNACE_HEIGHT_PREVIEW } from './furnaceRenderingUtils'; // ADDED: Furnace dimensions
import { LANTERN_WIDTH_PREVIEW, LANTERN_HEIGHT_PREVIEW } from './lanternRenderingUtils';
import { SLEEPING_BAG_WIDTH, SLEEPING_BAG_HEIGHT } from './sleepingBagRenderingUtils';
import { STASH_WIDTH, STASH_HEIGHT } from './stashRenderingUtils';
import { SHELTER_RENDER_WIDTH, SHELTER_RENDER_HEIGHT } from './shelterRenderingUtils';
import { TILE_SIZE } from '../../config/gameConfig';
import { DbConnection } from '../../generated';
import { isSeedItemValid, requiresWaterPlacement } from '../plantsUtils';
import { renderFoundationPreview } from './foundationRenderingUtils';

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
                // Convert Uint8 to tile type tag (matching server-side enum)
                switch (tileTypeU8) {
                    case 0: return 'Grass';
                    case 1: return 'Dirt';
                    case 2: return 'DirtRoad';
                    case 3: return 'Sea';
                    case 4: return 'Beach';
                    case 5: return 'Sand';
                    default: return 'Grass';
                }
            }
            break; // Found the chunk, no need to continue
        }
    }
    
    return null; // No compressed data found for this position
}

/**
 * Checks if a world position is on a water tile (Sea type).
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
    return tileType === 'Sea';
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
 * Checks if placement should be blocked due to water tiles.
 * This applies to shelters, camp fires, lanterns, stashes, wooden storage boxes, sleeping bags, and most seeds.
 * Reed Rhizomes have special handling and require water instead.
 */
function isWaterPlacementBlocked(connection: DbConnection | null, placementInfo: PlacementItemInfo | null, worldX: number, worldY: number): boolean {
    if (!connection || !placementInfo) {
        return false;
    }

    // Special case: Seeds that require water placement (like Reed Rhizome)
    if (requiresWaterPlacement(placementInfo.itemName)) {
        return isReedRhizomePlacementBlocked(connection, worldX, worldY);
    }

    // List of items that cannot be placed on water
    const waterBlockedItems = ['Camp Fire', 'Furnace', 'Lantern', 'Wooden Storage Box', 'Sleeping Bag', 'Stash', 'Shelter', 'Reed Rain Collector']; // ADDED: Furnace
    
    // Seeds that don't require water (most seeds) cannot be planted on water
    const isSeedButNotWaterSeed = isSeedItemValid(placementInfo.itemName) && !requiresWaterPlacement(placementInfo.itemName);
    
    if (waterBlockedItems.includes(placementInfo.itemName) || isSeedButNotWaterSeed) {
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
 * Checks if placement is too far from the player.
 * Returns true if the placement position is beyond the allowed range.
 */
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
    let clientPlacementRangeSq: number;
    if (placementInfo.iconAssetName === 'shelter_b.png') {
        // Shelter has a much larger placement range (256px vs 64px for other items)
        clientPlacementRangeSq = SHELTER_PLACEMENT_MAX_DISTANCE * SHELTER_PLACEMENT_MAX_DISTANCE;
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

    // Convert cell coordinates to world pixel coordinates (center of tile)
    const worldX = (cellX * TILE_SIZE) + (TILE_SIZE / 2);
    const worldY = (cellY * TILE_SIZE) + (TILE_SIZE / 2);

    // Check distance
    const dx = worldX - playerX;
    const dy = worldY - playerY;
    const distSq = dx * dx + dy * dy;
    if (distSq > BUILDING_PLACEMENT_MAX_DISTANCE_SQUARED) {
        return false;
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
        const { tileX, tileY } = worldPosToTileCoords(worldMouseX, worldMouseY);
        
        if (buildingState.mode === BuildingMode.Foundation) {
            const isValid = isFoundationPlacementValid(
                connection,
                tileX,
                tileY,
                buildingState.foundationShape,
                localPlayerX,
                localPlayerY,
                inventoryItems,
                itemDefinitions
            );

            renderFoundationPreview({
                ctx,
                cellX: tileX,
                cellY: tileY,
                shape: buildingState.foundationShape,
                tier: buildingState.buildingTier,
                isValid,
                worldScale,
                viewOffsetX,
                viewOffsetY,
                foundationTileImagesRef,
            });
        }
        return; // Building preview rendered, exit early
    }

    // Handle item placement preview (existing logic)
    if (!placementInfo || worldMouseX === null || worldMouseY === null) {
        return; // Nothing to render
    }

    // Determine which image to use for the preview
    let previewImg: HTMLImageElement | undefined;
    
    // Check if this is a seed placement
          // Dynamic seed detection using plant utils - no more hardcoding!
      const isSeedPlacement = isSeedItemValid(placementInfo.itemName);
    
    if (isSeedPlacement) {
        // For seeds, use the planted_seed.png from doodads folder
        previewImg = doodadImagesRef.current?.get('planted_seed.png');
    } else if (placementInfo.iconAssetName === 'shelter.png' && shelterImageRef?.current) {
        // For shelters, use the shelter image from doodads folder
        previewImg = shelterImageRef.current;
    } else {
        // For other items, use the item images
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
    } else if (isSeedPlacement) {
        // Seeds should match the actual planted seed size (48x48)
        drawWidth = 48;  
        drawHeight = 48;
    }

    ctx.save();

    // Check for water placement restriction
    const isOnWater = isWaterPlacementBlocked(connection, placementInfo, worldMouseX, worldMouseY);
    
    // Check for seed proximity restriction
    const isTooCloseToSeeds = isSeedPlacementTooClose(connection, placementInfo, worldMouseX, worldMouseY);
    
    // Apply visual effect - red tint with opacity for any invalid placement
    const isInvalidPlacement = isPlacementTooFar || isOnWater || isTooCloseToSeeds || placementError;
    
    if (isInvalidPlacement) {
        // Strong red tint for all invalid placements
        ctx.filter = 'sepia(100%) hue-rotate(320deg) saturate(400%) brightness(1.0) contrast(120%)';
        ctx.globalAlpha = 0.8;
    } else {
        // Blue tint for valid placement positions
        ctx.filter = 'sepia(100%) hue-rotate(200deg) saturate(300%) brightness(1.1) contrast(110%)';
        ctx.globalAlpha = 0.7;
    }

    // Calculate the centered position (perfectly centered on cursor)
    const adjustedX = worldMouseX - drawWidth / 2;
    const adjustedY = worldMouseY - drawHeight / 2;

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