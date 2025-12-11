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
const TARGET_CAIRN_WIDTH_PX = 80; // Target width on screen
const CAIRN_RADIUS = 40.0; // Collision radius (matches server constant)
export const PLAYER_CAIRN_INTERACTION_DISTANCE = 100.0; // Interaction distance (matches server constant)
export const PLAYER_CAIRN_INTERACTION_DISTANCE_SQUARED = PLAYER_CAIRN_INTERACTION_DISTANCE * PLAYER_CAIRN_INTERACTION_DISTANCE;

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
        drawY: entity.posY - drawHeight / 2,
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        drawDynamicGroundShadow({
            ctx,
            entityImage,
            entityCenterX: entityPosX,
            entityBaseY: entityPosY,
            imageDrawWidth,
            imageDrawHeight,
            cycleProgress,
            maxShadowAlpha: 0.3,
            pivotYOffset: 5,
        });
    },

    applyEffects: undefined,
    drawOverlay: undefined,
    fallbackColor: '#8B7355', // Brown/tan fallback color
};

/**
 * Render a cairn monument
 */
export function renderCairn(
    ctx: CanvasRenderingContext2D,
    cairn: Cairn,
    cameraOffsetX: number,
    cameraOffsetY: number,
    connection: DbConnection | null,
    isInInteractionRange: boolean = false,
    nowMs: number = Date.now(),
    cycleProgress: number = 0
): void {
    // Store connection for config functions
    currentConnection = connection;

    // Render using generic ground entity renderer
    renderConfiguredGroundEntity({
        ctx,
        entity: cairn,
        config: cairnConfig,
        nowMs,
        entityPosX: cairn.posX,
        entityPosY: cairn.posY,
        cycleProgress,
    });

    // Draw interaction indicator if in range
    if (isInInteractionRange) {
        const screenX = cairn.posX + cameraOffsetX;
        const screenY = cairn.posY + cameraOffsetY;
        
        // Draw blue interaction box with E label
        const indicatorY = screenY - TARGET_CAIRN_WIDTH_PX / 2 - 30; // Above the cairn
        
        // Draw blue box background
        ctx.save();
        ctx.fillStyle = 'rgba(0, 100, 255, 0.8)';
        ctx.fillRect(screenX - 25, indicatorY - 12, 50, 24);
        
        // Draw border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX - 25, indicatorY - 12, 50, 24);
        
        // Draw "E" label
        ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('E', screenX, indicatorY);
        
        ctx.restore();
    }
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
