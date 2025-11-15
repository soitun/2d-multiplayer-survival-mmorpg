import { Stone } from '../../generated'; // Import generated Stone type
import stoneImage from '../../assets/doodads/stone_c.png'; // Direct import
import { drawDynamicGroundShadow } from './shadowUtils'; // Import shadow utils
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';

// Configuration constants
const TARGET_STONE_WIDTH_PX = 120; // Target width on screen
const SHAKE_DURATION_MS = 300;     // How long the shake effect lasts
const SHAKE_INTENSITY_PX = 2;     // Slightly toned down from 10 for subtler shaking
const VERTEX_SHAKE_SEGMENTS = 6; // Number of vertical segments for vertex-based shaking (fewer than trees since stones are shorter)

// --- Client-side animation tracking for stone shakes ---
const clientStoneShakeStartTimes = new Map<string, number>(); // stoneId -> client timestamp when shake started
const lastKnownServerStoneShakeTimes = new Map<string, number>(); // stoneId -> last known server timestamp

// Define the configuration for rendering stones
const stoneConfig: GroundEntityConfig<Stone> = {
    // shouldRender: (entity) => entity.health > 0, // Removed: Filtering should happen before calling renderStone

    getImageSource: (_entity) => stoneImage, // Use imported URL

    getTargetDimensions: (img, _entity) => {
        // Calculate scaling factor based on target width
        const scaleFactor = TARGET_STONE_WIDTH_PX / img.naturalWidth;
        return {
            width: TARGET_STONE_WIDTH_PX, // Set width to target
            height: img.naturalHeight * scaleFactor, // Scale height proportionally
        };
    },

    calculateDrawPosition: (entity, _drawWidth, drawHeight) => ({
        // Top-left corner for image drawing, originating from entity's base Y
        drawX: entity.posX - TARGET_STONE_WIDTH_PX / 2, 
        drawY: entity.posY - drawHeight, 
    }),

    getShadowParams: undefined, // No longer using this for stones

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Calculate shake offsets for shadow synchronization
        // Use average shake (since shadow represents the whole stone, not segments)
        let shakeOffsetX = 0;
        let shakeOffsetY = 0;

        if (entity.lastHitTime) {
            const stoneId = entity.id.toString();
            const serverShakeTime = Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n);
            const lastKnownServerTime = lastKnownServerStoneShakeTimes.get(stoneId) || 0;
            
            if (serverShakeTime !== lastKnownServerTime) {
                lastKnownServerStoneShakeTimes.set(stoneId, serverShakeTime);
                clientStoneShakeStartTimes.set(stoneId, Date.now());
            }
            
            const clientStartTime = clientStoneShakeStartTimes.get(stoneId);
            if (clientStartTime) {
                const elapsedSinceShake = Date.now() - clientStartTime;
                
                if (elapsedSinceShake >= 0 && elapsedSinceShake < SHAKE_DURATION_MS) {
                    const shakeFactor = 1.0 - (elapsedSinceShake / SHAKE_DURATION_MS);
                    const currentShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                    
                    // Use average shake intensity (middle of stone) for shadow
                    const averageShakeFactor = Math.pow(0.5, 1.8); // Middle segment shake factor
                    const shadowShakeIntensity = currentShakeIntensity * averageShakeFactor;
                    
                    const timePhase = elapsedSinceShake / 50;
                    const stoneSeed = stoneId.charCodeAt(0) % 100;
                    
                    shakeOffsetX = Math.sin(timePhase + stoneSeed) * shadowShakeIntensity;
                    shakeOffsetY = Math.cos(timePhase + stoneSeed) * 0.5 * shadowShakeIntensity;
                }
            }
        }

        drawDynamicGroundShadow({
            ctx,
            entityImage,
            entityCenterX: entityPosX,
            entityBaseY: entityPosY,
            imageDrawWidth,
            imageDrawHeight,
            cycleProgress,
            maxStretchFactor: 1.5,
            minStretchFactor: 0.15,
            shadowBlur: 1,
            pivotYOffset: 10,
            // NEW: Pass shake offsets so shadow moves with the stone
            shakeOffsetX,
            shakeOffsetY
        });
    },

    applyEffects: (ctx, entity, nowMs, _baseDrawX, _baseDrawY, _cycleProgress, targetImgWidth, targetImgHeight) => {
        // Calculate shake intensity (same as before)
        let baseShakeIntensity = 0;
        let shakeFactor = 0;
        let shakeDirectionX = 0;
        let shakeDirectionY = 0;

        if (entity.lastHitTime) { 
            const stoneId = entity.id.toString();
            const serverShakeTime = Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n);
            
            // Check if this is a NEW shake by comparing server timestamps
            const lastKnownServerTime = lastKnownServerStoneShakeTimes.get(stoneId) || 0;
            
            if (serverShakeTime !== lastKnownServerTime) {
                // NEW shake detected! Record both server time and client time
                lastKnownServerStoneShakeTimes.set(stoneId, serverShakeTime);
                clientStoneShakeStartTimes.set(stoneId, nowMs);
            }
            
            // Calculate animation based on client time
            const clientStartTime = clientStoneShakeStartTimes.get(stoneId);
            if (clientStartTime) {
                const elapsedSinceShake = nowMs - clientStartTime;
                
                if (elapsedSinceShake >= 0 && elapsedSinceShake < SHAKE_DURATION_MS) {
                    shakeFactor = 1.0 - (elapsedSinceShake / SHAKE_DURATION_MS); 
                    baseShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                    
                    // Generate smooth, time-based shake direction using sine waves
                    // This creates a more natural swaying motion
                    const timePhase = elapsedSinceShake / 50; // Faster oscillation (50ms per cycle)
                    const stoneSeed = stoneId.charCodeAt(0) % 100; // Unique phase offset per stone
                    
                    // Use sine/cosine for smooth circular motion
                    shakeDirectionX = Math.sin(timePhase + stoneSeed);
                    shakeDirectionY = Math.cos(timePhase + stoneSeed) * 0.5; // Less vertical movement
                }
            }
        } else {
            // Clean up tracking when stone is not being hit
            const stoneId = entity.id.toString();
            clientStoneShakeStartTimes.delete(stoneId);
            lastKnownServerStoneShakeTimes.delete(stoneId);
        }
        
        // Store shake data for vertex-based rendering
        // Return zero offset - the custom draw will handle vertex-based shaking
        return { 
            offsetX: 0, 
            offsetY: 0, 
            vertexShakeIntensity: baseShakeIntensity,
            shakeDirectionX,
            shakeDirectionY
        };
    },

    /**
     * Custom draw function for vertex-based shaking.
     * Draws the stone in vertical segments with increasing shake from base to top.
     */
    customDraw: (ctx, entity, img, finalDrawX, finalDrawY, targetImgWidth, targetImgHeight, effectsResult) => {
        const shakeIntensity = (effectsResult.vertexShakeIntensity as number) || 0;
        const shakeDirX = (effectsResult.shakeDirectionX as number) || 0;
        const shakeDirY = (effectsResult.shakeDirectionY as number) || 0;

        // If no shaking, just draw normally
        if (shakeIntensity <= 0) {
            ctx.drawImage(
                img,
                -targetImgWidth / 2,
                -targetImgHeight / 2,
                targetImgWidth,
                targetImgHeight
            );
            return;
        }

        // Draw stone in vertical segments with vertex-based shaking
        // Base (bottom) has minimal shake, top has maximum shake
        const segmentHeight = targetImgHeight / VERTEX_SHAKE_SEGMENTS;
        
        for (let i = 0; i < VERTEX_SHAKE_SEGMENTS; i++) {
            // Calculate normalized position (0 = base/bottom, 1 = top)
            // i=0 is top of stone, i=VERTEX_SHAKE_SEGMENTS-1 is base
            const normalizedY = (VERTEX_SHAKE_SEGMENTS - 1 - i) / (VERTEX_SHAKE_SEGMENTS - 1);
            
            // Shake intensity increases quadratically from base to top
            // This creates a more realistic impact effect where the top shakes more
            // Using a slightly steeper curve for more pronounced effect
            const segmentShakeFactor = Math.pow(normalizedY, 1.8); // Slightly steeper than quadratic for more intensity
            
            // Calculate offset for this segment
            const segmentOffsetX = shakeDirX * shakeIntensity * segmentShakeFactor;
            const segmentOffsetY = shakeDirY * shakeIntensity * segmentShakeFactor;
            
            // Source rectangle (from original image)
            const sourceY = (img.naturalHeight / VERTEX_SHAKE_SEGMENTS) * i;
            const sourceHeight = img.naturalHeight / VERTEX_SHAKE_SEGMENTS;
            
            // Destination rectangle (on canvas, with offset)
            const destX = -targetImgWidth / 2 + segmentOffsetX;
            const destY = -targetImgHeight / 2 + (segmentHeight * i) + segmentOffsetY;
            
            // Draw this segment
            ctx.drawImage(
                img,
                0, // Source X (full width)
                sourceY, // Source Y (segment start)
                img.naturalWidth, // Source width (full width)
                sourceHeight, // Source height (segment height)
                destX, // Destination X (with shake offset)
                destY, // Destination Y (with shake offset)
                targetImgWidth, // Destination width (full width)
                segmentHeight // Destination height (segment height)
            );
        }
    },

    fallbackColor: 'gray', // Fallback if image fails to load
};

// Preload using imported URL
imageManager.preloadImage(stoneImage);

/**
 * Renders a single stone entity onto the canvas using the generic renderer.
 */
export function renderStone(
    ctx: CanvasRenderingContext2D, 
    stone: Stone, 
    nowMs: number, 
    cycleProgress: number,
    onlyDrawShadow?: boolean,    // New flag
    skipDrawingShadow?: boolean // New flag
) {
    renderConfiguredGroundEntity({
        ctx,
        entity: stone,
        config: stoneConfig,
        nowMs,
        entityPosX: stone.posX,
        entityPosY: stone.posY,
        cycleProgress,
        onlyDrawShadow,     // Pass flag
        skipDrawingShadow   // Pass flag
    });
} 