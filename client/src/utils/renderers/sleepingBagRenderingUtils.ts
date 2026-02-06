import { SleepingBag } from '../../generated';
import sleepingBagImageSrc from '../../assets/doodads/sleeping_bag.png';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';
import { renderEntityHealthBar } from './healthBarUtils';

// --- Constants ---
export const SLEEPING_BAG_WIDTH = 96;
export const SLEEPING_BAG_HEIGHT = 96;
const SHAKE_DURATION_MS = 150;
const SHAKE_INTENSITY_PX = 6;

const sleepingBagConfig: GroundEntityConfig<SleepingBag> = {
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null;
        }
        return sleepingBagImageSrc;
    },

    getTargetDimensions: (img, _entity) => {
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        const targetHeight = SLEEPING_BAG_HEIGHT; // Use the defined height
        const targetWidth = targetHeight * aspectRatio;
        return { width: targetWidth, height: targetHeight };
    },

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight, // Anchor to bottom center (like campfire)
    }),

    getShadowParams: undefined,

    

    // Health bar rendered separately via renderEntityHealthBar
    drawOverlay: undefined,
    fallbackColor: '#8B4513', // SaddleBrown for sleeping bag
};

imageManager.preloadImage(sleepingBagImageSrc);

export function renderSleepingBag(
    ctx: CanvasRenderingContext2D, 
    bag: SleepingBag, 
    nowMs: number, 
    cycleProgress: number,
    playerX?: number,
    playerY?: number
) {
    renderConfiguredGroundEntity({
        ctx,
        entity: bag,
        config: sleepingBagConfig,
        nowMs,
        entityPosX: bag.posX,
        entityPosY: bag.posY,
        cycleProgress,
    });
    
    // Render health bar using unified system
    if (playerX !== undefined && playerY !== undefined) {
        renderEntityHealthBar(ctx, bag, SLEEPING_BAG_WIDTH, SLEEPING_BAG_HEIGHT, nowMs, playerX, playerY);
    }
} 