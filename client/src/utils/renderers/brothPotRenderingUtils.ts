import { BrothPot } from '../../generated';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { drawDynamicGroundShadow } from './shadowUtils';
import { imageManager } from './imageManager';

// Import the field cauldron icon
import fieldCauldronIcon from '../../assets/items/field_cauldron.png';

// --- Constants ---
export const BROTH_POT_WIDTH = 80;
export const BROTH_POT_HEIGHT = 80;
export const BROTH_POT_RENDER_Y_OFFSET = 0; // No offset - sits directly on campfire

// Broth pot interaction distance (player <-> broth pot)
export const PLAYER_BROTH_POT_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0; // Same as campfire

// --- Define Configuration ---
const brothPotConfig: GroundEntityConfig<BrothPot> = {
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null;
        }
        return fieldCauldronIcon;
    },

    getTargetDimensions: (_img, _entity) => ({
        width: BROTH_POT_WIDTH,
        height: BROTH_POT_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        // Center on campfire position
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight / 2, // Center vertically on campfire
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        if (!entity.isDestroyed) {
            drawDynamicGroundShadow({
                ctx,
                entityImage,
                entityCenterX: entityPosX,
                entityBaseY: entityPosY,
                imageDrawWidth,
                imageDrawHeight,
                cycleProgress,
                maxStretchFactor: 1.1,
                minStretchFactor: 0.2,
                shadowBlur: 3,
                pivotYOffset: 20,
            });
        }
    },

    applyEffects: undefined, // No special effects needed
};

/**
 * Renders a broth pot entity
 */
export function renderBrothPot(
    ctx: CanvasRenderingContext2D,
    brothPot: BrothPot,
    nowMs: number,
    cycleProgress: number,
    onlyDrawShadow?: boolean
) {
    renderConfiguredGroundEntity({
        ctx,
        entity: brothPot,
        config: brothPotConfig,
        nowMs,
        entityPosX: brothPot.posX,
        entityPosY: brothPot.posY,
        cycleProgress,
        onlyDrawShadow,
    });
}

