import { Cairn } from '../../generated';
import { DbConnection } from '../../generated';
import cairnImage from '../../assets/doodads/cairn.png';
import cairnTundraImage from '../../assets/doodads/cairn_tundra.png';
import cairnBeachImage from '../../assets/doodads/cairn_beach.png';
import cairnAlpineImage from '../../assets/doodads/cairn_alpine.png';
import { drawDynamicGroundShadow } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';
import { drawInteractionIndicator } from '../interactionIndicator';
import { getTileTypeFromChunkData, worldPosToTileCoords } from './placementRenderingUtils';

// Configuration constants
const TARGET_CAIRN_WIDTH_PX = 256; // Target width on screen (~half of 1024x1024 source)
const CAIRN_RADIUS = 128.0; // Collision radius (matches visual size)
export const PLAYER_CAIRN_INTERACTION_DISTANCE = 200.0; // Interaction distance (increased to match larger visual)
export const PLAYER_CAIRN_INTERACTION_DISTANCE_SQUARED = PLAYER_CAIRN_INTERACTION_DISTANCE * PLAYER_CAIRN_INTERACTION_DISTANCE;

// Visual base offset: The sprite has extra space at the bottom. The visual base (where stones meet ground)
// is offset upward from the sprite bottom. This offset is used for collision and Y-sorting.
export const CAIRN_VISUAL_BASE_OFFSET = 64; // Pixels upward from sprite bottom to visual base

/**
 * Get the appropriate cairn image based on the tile biome
 * Similar to how trees select sprites based on treeType
 */
function getCairnImageForBiome(connection: DbConnection | null, posX: number, posY: number): string {
    if (!connection) {
        return cairnImage; // Default fallback
    }
    
    // Convert world position to tile coordinates
    const { tileX, tileY } = worldPosToTileCoords(posX, posY);
    
    // Get tile type from chunk data
    const tileType = getTileTypeFromChunkData(connection, tileX, tileY);
    
    // Map tile types to cairn variants (similar to tree type selection)
    switch (tileType) {
        case 'Tundra':
        case 'TundraGrass':
            return cairnTundraImage;
        case 'Beach':
            return cairnBeachImage;
        case 'Alpine':
            return cairnAlpineImage;
        case 'Grass':
        case 'Forest':
        default:
            return cairnImage; // Default for grass/forest
    }
}

// Store connection reference for config functions
let currentConnection: DbConnection | null = null;

// --- Define Configuration ---
const cairnConfig: GroundEntityConfig<Cairn> = {
    getImageSource: (entity) => {
        return getCairnImageForBiome(currentConnection, entity.posX, entity.posY);
    },

    getTargetDimensions: (_img, _entity) => ({
        width: TARGET_CAIRN_WIDTH_PX,
        height: TARGET_CAIRN_WIDTH_PX, // Assuming square aspect ratio
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        drawX: entity.posX - drawWidth / 2,
        // Draw sprite so that visual base (where stones meet ground) aligns with entity.posY
        // Visual base is offset upward from sprite bottom by CAIRN_VISUAL_BASE_OFFSET
        drawY: entity.posY - drawHeight + CAIRN_VISUAL_BASE_OFFSET,
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        drawDynamicGroundShadow({
            ctx,
            entityImage,
            entityCenterX: entityPosX,
            entityBaseY: entityPosY, // Shadow at visual base where stones meet ground
            imageDrawWidth,
            imageDrawHeight,
            cycleProgress,
            maxShadowAlpha: 0.3,
            pivotYOffset: -CAIRN_VISUAL_BASE_OFFSET, // Offset to account for visual base position
        });
    },

    applyEffects: undefined,
    drawOverlay: undefined,
    fallbackColor: '#8B7355', // Brown/tan fallback color
};

/**
 * Render a cairn monument
 * Note: Interaction outline is handled by renderingUtils.ts using the standard drawInteractionOutline
 */
export function renderCairn(
    ctx: CanvasRenderingContext2D,
    cairn: Cairn,
    _cameraOffsetX: number, // Unused - canvas already translated
    _cameraOffsetY: number, // Unused - canvas already translated
    connection: DbConnection | null,
    _isInInteractionRange: boolean = false, // Unused - outline handled by renderingUtils.ts
    nowMs: number = Date.now(),
    cycleProgress: number = 0
): void {
    // Store connection for config functions
    currentConnection = connection;

    // Render using generic ground entity renderer
    // Note: Canvas context is already translated by camera offset in Y-sorted rendering
    // Interaction outline is handled by renderingUtils.ts using the standard drawInteractionOutline
    renderConfiguredGroundEntity({
        ctx,
        entity: cairn,
        config: cairnConfig,
        nowMs,
        entityPosX: cairn.posX,
        entityPosY: cairn.posY,
        cycleProgress,
    });
}

/**
 * Preload all cairn variant images
 */
export function preloadCairnImages(): void {
    imageManager.preloadImage(cairnImage);
    imageManager.preloadImage(cairnTundraImage);
    imageManager.preloadImage(cairnBeachImage);
    imageManager.preloadImage(cairnAlpineImage);
}
