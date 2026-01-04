import { LivingCoral } from '../../generated'; // Import generated type
import coralImage from '../../assets/doodads/coral.png'; // Main coral variant
import coral1Image from '../../assets/doodads/coral1.png'; // Second coral variant
import coral2Image from '../../assets/doodads/coral2.png'; // Third coral variant
import coral3Image from '../../assets/doodads/coral3.png'; // Fourth coral variant
import { applyStandardDropShadow, drawDynamicGroundShadow } from './shadowUtils';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { imageManager } from './imageManager';

// --- Constants ---
export const LIVING_CORAL_WIDTH = 192; // Coral reef cluster width (doubled for better underwater visibility)
export const LIVING_CORAL_HEIGHT = 160; // Coral reef cluster height (doubled)
export const LIVING_CORAL_COLLISION_RADIUS = 80; // Doubled collision radius for client collision checks

// --- Shake Effect Constants ---
const SHAKE_DURATION_MS = 300;     // How long the shake effect lasts when hit
const SHAKE_INTENSITY_PX = 4;     // Shake intensity (underwater so slightly less than land entities)
const VERTEX_SHAKE_SEGMENTS = 6;  // Number of vertical segments for vertex-based shaking

// --- Client-side animation tracking for coral shakes ---
const clientCoralShakeStartTimes = new Map<string, number>(); // coralId -> client timestamp when shake started
const lastKnownServerCoralShakeTimes = new Map<string, number>(); // coralId -> last known server timestamp

// --- Living Coral Variant Images Array ---
// Use coral, coral1, coral2, coral3.png for visual variety in reef clusters
const LIVING_CORAL_VARIANT_IMAGES = [
    coralImage,    // Main coral variant
    coral1Image,   // Second coral variant
    coral2Image,   // Third coral variant
    coral3Image,   // Fourth coral variant
];

// --- Define Configuration ---
const livingCoralConfig: GroundEntityConfig<LivingCoral> = {
    getImageSource: (entity) => {
        // Select coral variant based on entity ID for consistent visual variety
        const variantIndex = Number(entity.id) % LIVING_CORAL_VARIANT_IMAGES.length;
        return LIVING_CORAL_VARIANT_IMAGES[variantIndex];
    },

    getTargetDimensions: (_img, _entity) => ({
        width: LIVING_CORAL_WIDTH,
        height: LIVING_CORAL_HEIGHT,
    }),

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight + 40, // Anchor at base with offset for doubled underwater appearance
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Calculate shake offsets for shadow synchronization
        let shakeOffsetX = 0;
        let shakeOffsetY = 0;

        if (entity.lastHitTime) {
            const coralId = entity.id.toString();
            const serverShakeTime = Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n);
            const lastKnownServerTime = lastKnownServerCoralShakeTimes.get(coralId) || 0;
            
            if (serverShakeTime !== lastKnownServerTime) {
                lastKnownServerCoralShakeTimes.set(coralId, serverShakeTime);
                clientCoralShakeStartTimes.set(coralId, Date.now());
            }
            
            const clientStartTime = clientCoralShakeStartTimes.get(coralId);
            if (clientStartTime) {
                const elapsedSinceShake = Date.now() - clientStartTime;
                
                if (elapsedSinceShake >= 0 && elapsedSinceShake < SHAKE_DURATION_MS) {
                    const shakeFactor = 1.0 - (elapsedSinceShake / SHAKE_DURATION_MS);
                    const currentShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                    
                    // Use average shake intensity for shadow
                    const averageShakeFactor = Math.pow(0.5, 1.8);
                    const shadowShakeIntensity = currentShakeIntensity * averageShakeFactor;
                    
                    const timePhase = elapsedSinceShake / 50;
                    const coralSeed = coralId.charCodeAt(0) % 100;
                    
                    shakeOffsetX = Math.sin(timePhase + coralSeed) * shadowShakeIntensity;
                    shakeOffsetY = Math.cos(timePhase + coralSeed) * 0.5 * shadowShakeIntensity;
                }
            }
        }

        // Draw subtle underwater shadow for coral (doubled size)
        drawDynamicGroundShadow({
            ctx,
            entityImage,
            entityCenterX: entityPosX,
            entityBaseY: entityPosY,
            imageDrawWidth,
            imageDrawHeight,
            cycleProgress,
            maxStretchFactor: 0.8,  // Minimal stretch (underwater has diffused light)
            minStretchFactor: 0.4,  // Keep some shadow even at noon
            shadowBlur: 8,          // Softer underwater shadow (slightly larger for doubled size)
            pivotYOffset: 40,       // Pivot point for shadow (doubled for larger coral)
            shakeOffsetX,           // Pass shake offsets so shadow moves with coral
            shakeOffsetY
        });
    },

    applyEffects: (ctx, entity, nowMs, baseDrawX, baseDrawY, cycleProgress, targetImgWidth, targetImgHeight) => {
        // Apply subtle drop shadow for depth
        applyStandardDropShadow(ctx);
        
        // Add gentle underwater sway animation
        const swayOffset = Math.sin(nowMs / 2000 + entity.posX * 0.01) * 2;
        
        // Calculate shake intensity when hit
        let baseShakeIntensity = 0;
        let shakeFactor = 0;
        let shakeDirectionX = 0;
        let shakeDirectionY = 0;

        if (entity.lastHitTime) { 
            const coralId = entity.id.toString();
            const serverShakeTime = Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n);
            
            // Check if this is a NEW shake by comparing server timestamps
            const lastKnownServerTime = lastKnownServerCoralShakeTimes.get(coralId) || 0;
            
            if (serverShakeTime !== lastKnownServerTime) {
                // NEW shake detected! Record both server time and client time
                lastKnownServerCoralShakeTimes.set(coralId, serverShakeTime);
                clientCoralShakeStartTimes.set(coralId, nowMs);
            }
            
            // Calculate animation based on client time
            const clientStartTime = clientCoralShakeStartTimes.get(coralId);
            if (clientStartTime) {
                const elapsedSinceShake = nowMs - clientStartTime;
                
                if (elapsedSinceShake >= 0 && elapsedSinceShake < SHAKE_DURATION_MS) {
                    shakeFactor = 1.0 - (elapsedSinceShake / SHAKE_DURATION_MS); 
                    baseShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                    
                    // Generate smooth, time-based shake direction using sine waves
                    const timePhase = elapsedSinceShake / 50; // Faster oscillation (50ms per cycle)
                    const coralSeed = coralId.charCodeAt(0) % 100; // Unique phase offset per coral
                    
                    // Use sine/cosine for smooth circular motion
                    shakeDirectionX = Math.sin(timePhase + coralSeed);
                    shakeDirectionY = Math.cos(timePhase + coralSeed) * 0.5; // Less vertical movement
                }
            }
        }
        
        // Apply vertex-based shake effect (slicing) if shaking
        if (baseShakeIntensity > 0 && targetImgWidth && targetImgHeight) {
            // Vertex-based shake: different segments shake at different intensities
            // Bottom is more anchored, top shakes more (like swaying in water)
            for (let i = 0; i < VERTEX_SHAKE_SEGMENTS; i++) {
                const segmentYStart = (i / VERTEX_SHAKE_SEGMENTS) * targetImgHeight;
                const segmentYEnd = ((i + 1) / VERTEX_SHAKE_SEGMENTS) * targetImgHeight;
                const segmentHeight = segmentYEnd - segmentYStart;
                
                // Progressive shake: more shake at the top
                const segmentProgress = i / (VERTEX_SHAKE_SEGMENTS - 1);
                const segmentShakeFactor = Math.pow(segmentProgress, 1.8); // Exponential falloff from bottom to top
                const segmentShakeIntensity = baseShakeIntensity * segmentShakeFactor;
                
                // Calculate segment offset with directional shake
                const segmentOffsetX = shakeDirectionX * segmentShakeIntensity + swayOffset;
                const segmentOffsetY = shakeDirectionY * segmentShakeIntensity * 0.3;
            }
        }
        
        // Return combined sway and shake offsets for the entire entity
        const totalOffsetX = swayOffset + (shakeDirectionX * baseShakeIntensity);
        const totalOffsetY = shakeDirectionY * baseShakeIntensity * 0.3;
        
        return {
            offsetX: totalOffsetX,
            offsetY: totalOffsetY,
        };
    },

    // No health bars for natural resources (trees, stones, corals)
    // Living coral uses the same pattern as other harvestable resources
    drawOverlay: undefined,

    fallbackColor: '#FF6B6B', // Coral pink fallback color
};

/**
 * Renders a living coral entity (underwater harvestable resource).
 * Living coral uses the combat system like stones - attack with Diving Pick to harvest.
 * Note: Underwater tinting is now handled via CSS filter in renderingUtils.ts for consistency.
 */
export function renderLivingCoral(
    ctx: CanvasRenderingContext2D,
    coral: LivingCoral,
    nowMs: number,
    cycleProgress: number
): void {
    // Don't render if coral is respawning (depleted)
    if (coral.respawnAt !== undefined && coral.respawnAt !== null) {
        return;
    }
    
    // Render coral
    renderConfiguredGroundEntity({
        ctx,
        entity: coral,
        config: livingCoralConfig,
        nowMs,
        entityPosX: coral.posX,
        entityPosY: coral.posY,
        cycleProgress,
    });
}

/**
 * Pre-loads living coral images into the image manager cache.
 */
export function preloadLivingCoralImages(): void {
    // Preload all coral variant images
    LIVING_CORAL_VARIANT_IMAGES.forEach(imageSrc => {
        imageManager.preloadImage(imageSrc);
    });
}

