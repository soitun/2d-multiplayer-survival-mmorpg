import { BasaltColumn } from '../../generated'; // Import generated type
import basaltColumn1Image from '../../assets/doodads/basalt_column.png'; // Type1
import basaltColumn2Image from '../../assets/doodads/basalt_column2.png'; // Type2
import basaltColumn3Image from '../../assets/doodads/basalt_column3.png'; // Type3
import { applyStandardDropShadow, drawDynamicGroundShadow } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer'; // Import generic renderer
import { imageManager } from './imageManager'; // Import image manager

// --- Constants ---
export const BASALT_COLUMN_WIDTH = 200; // 2.5x bigger (was 80) - large rock formations for cover
export const BASALT_COLUMN_HEIGHT = 300; // 2.5x bigger (was 120) - tall vertical rock formations

// --- Basalt Column Variant Images Array ---
const BASALT_COLUMN_VARIANT_IMAGES = [
    basaltColumn1Image,    // Type1
    basaltColumn2Image,    // Type2
    basaltColumn3Image,    // Type3
];

// --- Define Configuration ---
const basaltColumnConfig: GroundEntityConfig<BasaltColumn> = {
    getImageSource: (entity) => {
        // Select basalt column variant based on entity.columnType
        const variantIndex = entity.columnType.tag === 'Type1' ? 0 :
                            entity.columnType.tag === 'Type2' ? 1 : 2;
        return BASALT_COLUMN_VARIANT_IMAGES[variantIndex];
    },

    getTargetDimensions: (img, _entity) => ({
        width: BASALT_COLUMN_WIDTH,
        height: BASALT_COLUMN_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight + 20, // Anchor at base with slight offset
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Draw DYNAMIC ground shadow for basalt columns
        drawDynamicGroundShadow({
            ctx,
            entityImage,
            entityCenterX: entityPosX,
            entityBaseY: entityPosY,
            imageDrawWidth,
            imageDrawHeight,
            cycleProgress,
            maxStretchFactor: 1.2,  // Moderate stretch for tall columns
            minStretchFactor: 0.2,   // Compressed at noon
            shadowBlur: 3,           // Soft shadow
            pivotYOffset: 40,        // Pivot point for shadow
        });
    },

    applyEffects: (ctx, entity, nowMs, baseDrawX, baseDrawY, cycleProgress) => {
        // Apply standard drop shadow for depth
        applyStandardDropShadow(ctx);
        return {
            offsetX: 0,
            offsetY: 0,
        };
    },

    drawOverlay: undefined, // No overlay needed

    fallbackColor: '#696969', // Gray fallback color for stone
};

/**
 * Renders a basalt column entity (decorative obstacle in quarry areas).
 * Basalt columns have collision but cannot be mined.
 */
export function renderBasaltColumn(
    ctx: CanvasRenderingContext2D,
    basaltColumn: BasaltColumn,
    nowMs: number,
    cycleProgress: number
): void {
    // console.log(`🗿 [BASALT RENDER] Rendering basalt column ${basaltColumn.id} at (${basaltColumn.posX}, ${basaltColumn.posY}), type: ${basaltColumn.columnType}`);
    // console.log(`🗿 [BASALT RENDER] Image sources:`, { type1: basaltColumn1Image, type2: basaltColumn2Image, type3: basaltColumn3Image });
    // console.log(`🗿 [BASALT RENDER] Config:`, basaltColumnConfig);
    
    renderConfiguredGroundEntity({
        ctx,
        entity: basaltColumn,
        config: basaltColumnConfig,
        nowMs,
        entityPosX: basaltColumn.posX,
        entityPosY: basaltColumn.posY,
        cycleProgress,
    });
    
    // console.log(`🗿 [BASALT RENDER] Finished rendering basalt column ${basaltColumn.id}`);
}

/**
 * Pre-loads basalt column images into the image manager cache.
 */
export function preloadBasaltColumnImages(): void {
    // Preloading is handled automatically by imageManager when images are first used
    // This function exists for consistency with other rendering utils
}

