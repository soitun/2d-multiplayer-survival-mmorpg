import { Tree } from '../../generated'; // Import generated types
import aleppoPineImage from '../../assets/doodads/siberian_birch_b.png';
import mannaAshImage from '../../assets/doodads/mountain_hemlock_b.png';
import downyOakImage from '../../assets/doodads/sitka_spruce_b.png';
import stonePineImage from '../../assets/doodads/sitka_alder_b.png'; // New import for stone pine
// import treeOakImage from '../assets/doodads/tree.png'; // REMOVED
// import treeStumpImage from '../assets/doodads/tree_stump.png'; // REMOVED
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils'; // Import shadow utils
import { applyStandardDropShadow } from './shadowUtils'; // Import new shadow util
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer'; // Import generic renderer
import { imageManager } from './imageManager'; // Import image manager

// Define constants for tree rendering
const TARGET_TREE_WIDTH_PX = 480; // Target width on screen (base size for tallest tree - Sitka Spruce)
const TREE_HEIGHT = 120;
const SHAKE_DURATION_MS = 500;
const SHAKE_INTENSITY_PX = 14; // Increased from 8 for more intense shaking
const VERTEX_SHAKE_SEGMENTS = 8; // Number of vertical segments for vertex-based shaking

// --- Client-side animation tracking for tree shakes ---
const clientTreeShakeStartTimes = new Map<string, number>(); // treeId -> client timestamp when shake started
const lastKnownServerTreeShakeTimes = new Map<string, number>(); // treeId -> last known server timestamp

// PERFORMANCE: Cache tree type results to avoid repeated runtime checks
const treeTypeCache = new Map<string, { imageSource: string; targetWidth: number }>();

// PERFORMANCE: Helper to get cached tree type info
function getCachedTreeTypeInfo(entity: Tree): { imageSource: string; targetWidth: number } {
    const treeTypeKey = typeof entity.treeType === 'object' && entity.treeType !== null && 'tag' in entity.treeType
        ? (entity.treeType as any).tag
        : entity.treeType;
    
    let cached = treeTypeCache.get(treeTypeKey);
    if (!cached) {
        // Calculate once and cache
        let imageSource: string;
        let targetWidth: number;
        
        switch (treeTypeKey) {
            case 'AleppoPine':
                imageSource = aleppoPineImage;
                targetWidth = 320; // 33% shorter than Sitka Spruce
                break;
            case 'MannaAsh':
                imageSource = mannaAshImage;
                targetWidth = 400; // 17% shorter than Sitka Spruce
                break;
            case 'DownyOak':
                imageSource = downyOakImage;
                targetWidth = 480; // Full size (same as old uniform height)
                break;
            case 'StonePine':
                imageSource = stonePineImage;
                targetWidth = 360; // 25% shorter than Sitka Spruce
                break;
            default:
                imageSource = downyOakImage;
                targetWidth = TARGET_TREE_WIDTH_PX; // Fallback to Sitka Spruce size
        }
        
        cached = { imageSource, targetWidth };
        treeTypeCache.set(treeTypeKey, cached);
    }
    
    return cached;
}

// Define the configuration for rendering trees
const treeConfig: GroundEntityConfig<Tree> = {
    getImageSource: (entity) => {
        return getCachedTreeTypeInfo(entity).imageSource;
    },

    getTargetDimensions: (img, entity) => {
        const { targetWidth } = getCachedTreeTypeInfo(entity);
        const scaleFactor = targetWidth / img.naturalWidth;
        return {
            width: targetWidth,
            height: img.naturalHeight * scaleFactor,
        };
    },

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        // Top-left corner for image drawing, originating from entity's base Y
        drawX: entity.posX - drawWidth / 2, 
        drawY: entity.posY - drawHeight, 
    }),

    getShadowParams: undefined, // No longer using this for trees

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        // Calculate shake offsets for shadow synchronization using helper function
        const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
            entity,
            entity.id.toString(),
            {
                clientStartTimes: clientTreeShakeStartTimes,
                lastKnownServerTimes: lastKnownServerTreeShakeTimes
            },
            SHAKE_DURATION_MS,
            SHAKE_INTENSITY_PX
        );

        drawDynamicGroundShadow({
            ctx,
            entityImage,
            entityCenterX: entityPosX + 25, // Offset to the right to center shadow better
            entityBaseY: entityPosY,
            imageDrawWidth,
            imageDrawHeight,
            cycleProgress,
            maxStretchFactor: 1.8,
            minStretchFactor: 0.15,
            shadowBlur: 2,
            pivotYOffset: 25, // Positive offset moves anchor UP, aligning shadow with tree base
            // NEW: Pass shake offsets so shadow moves with the tree
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
            const treeId = entity.id.toString();
            const serverShakeTime = Number(entity.lastHitTime.microsSinceUnixEpoch / 1000n);
            
            // Check if this is a NEW shake by comparing server timestamps
            const lastKnownServerTime = lastKnownServerTreeShakeTimes.get(treeId) || 0;
            
            if (serverShakeTime !== lastKnownServerTime) {
                // NEW shake detected! Record both server time and client time
                lastKnownServerTreeShakeTimes.set(treeId, serverShakeTime);
                clientTreeShakeStartTimes.set(treeId, nowMs);
            }
            
            // Calculate animation based on client time
            const clientStartTime = clientTreeShakeStartTimes.get(treeId);
            if (clientStartTime) {
                const elapsedSinceShake = nowMs - clientStartTime;
                
                if (elapsedSinceShake >= 0 && elapsedSinceShake < SHAKE_DURATION_MS) {
                    shakeFactor = 1.0 - (elapsedSinceShake / SHAKE_DURATION_MS); 
                    baseShakeIntensity = SHAKE_INTENSITY_PX * shakeFactor;
                    
                    // Generate smooth, time-based shake direction using sine waves
                    // This creates a more natural swaying motion
                    const timePhase = elapsedSinceShake / 50; // Faster oscillation (50ms per cycle)
                    const treeSeed = treeId.charCodeAt(0) % 100; // Unique phase offset per tree
                    
                    // Use sine/cosine for smooth circular motion
                    shakeDirectionX = Math.sin(timePhase + treeSeed);
                    shakeDirectionY = Math.cos(timePhase + treeSeed) * 0.5; // Less vertical movement
                }
            }
        } else {
            // Clean up tracking when tree is not being hit
            const treeId = entity.id.toString();
            clientTreeShakeStartTimes.delete(treeId);
            lastKnownServerTreeShakeTimes.delete(treeId);
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
     * Draws the tree in vertical segments with increasing shake from base to top.
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

        // Draw tree in vertical segments with vertex-based shaking
        // Base (bottom) has minimal shake, top has maximum shake
        const segmentHeight = targetImgHeight / VERTEX_SHAKE_SEGMENTS;
        
        for (let i = 0; i < VERTEX_SHAKE_SEGMENTS; i++) {
            // Calculate normalized position (0 = base/bottom, 1 = top)
            // i=0 is top of tree, i=VERTEX_SHAKE_SEGMENTS-1 is base
            const normalizedY = (VERTEX_SHAKE_SEGMENTS - 1 - i) / (VERTEX_SHAKE_SEGMENTS - 1);
            
            // Shake intensity increases quadratically from base to top
            // This creates a more realistic wind effect where the top sways more
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

    fallbackColor: 'darkgreen',
};

// Preload using the imported URL
imageManager.preloadImage(aleppoPineImage);
imageManager.preloadImage(mannaAshImage);
imageManager.preloadImage(downyOakImage);
imageManager.preloadImage(stonePineImage);
// TODO: Preload other variants if added

// Refactored rendering function
export function renderTree(
    ctx: CanvasRenderingContext2D, 
    tree: Tree, 
    now_ms: number, 
    cycleProgress: number,
    onlyDrawShadow?: boolean, // New flag
    skipDrawingShadow?: boolean, // New flag
    localPlayerPosition?: { x: number; y: number } | null, // Player position for transparency logic
    treeShadowsEnabled: boolean = true, // NEW: Visual cortex module setting
    isFalling?: boolean, // NEW: Tree is currently falling
    fallProgress?: number // NEW: Progress of fall animation (0.0 to 1.0)
) {
    // PERFORMANCE: Skip shadow rendering entirely if disabled in visual settings
    const shouldSkipShadows = !treeShadowsEnabled || skipDrawingShadow;
    
    // Calculate if tree visually overlaps and occludes the player
    const MIN_ALPHA = 0.3; // Minimum opacity when tree is blocking player
    const MAX_ALPHA = 1.0; // Full opacity when not blocking
    
    let treeAlpha = MAX_ALPHA;
    
    if (localPlayerPosition && !onlyDrawShadow) {
        // Get tree's visual bounding box (trees are tall and wide)
        const treeVisualWidth = 240; // Approximate visual width of tree
        const treeVisualHeight = 320; // Approximate visual height of tree
        
        // Tree is drawn with bottom-center at tree.posX, tree.posY
        const treeLeft = tree.posX - treeVisualWidth / 2;
        const treeRight = tree.posX + treeVisualWidth / 2;
        // CRITICAL: Extend tree's visual area UPWARD to catch players behind tall trees
        // When player moves away (lower Y = north), tree still visually blocks them
        const treeVisualExtension = 300; // Upward extension to capture tree tops
        const treeTop = tree.posY - treeVisualHeight - treeVisualExtension; // Tree extends upward + extension
        // Shift the bottom up so tree doesn't fade when player is at trunk level
        const trunkHeightOffset = 150; // Don't trigger transparency when at trunk base level (reduced to start fade lower)
        const treeBottom = tree.posY - trunkHeightOffset;
        
        // Player bounding box (approximate)
        const playerSize = 48;
        const playerLeft = localPlayerPosition.x - playerSize / 2;
        const playerRight = localPlayerPosition.x + playerSize / 2;
        const playerTop = localPlayerPosition.y - playerSize;
        const playerBottom = localPlayerPosition.y;
        
        // Check if player overlaps with tree's visual area (shifted upward)
        const overlapsHorizontally = playerRight > treeLeft && playerLeft < treeRight;
        const overlapsVertically = playerBottom > treeTop && playerTop < treeBottom;
        
        // Tree should be transparent if:
        // 1. It overlaps with player visually
        // 2. Tree renders AFTER player (tree.posY > player.posY means tree is in front in Y-sort)
        if (overlapsHorizontally && overlapsVertically && tree.posY > localPlayerPosition.y) {
            // Calculate how much the player is behind the tree (for smooth fade)
            const depthDifference = tree.posY - localPlayerPosition.y;
            const maxDepthForFade = 100; // Max distance for fade effect (increased for taller trees)
            
            if (depthDifference > 0 && depthDifference < maxDepthForFade) {
                // Closer to tree = more transparent
                const fadeFactor = 1 - (depthDifference / maxDepthForFade);
                treeAlpha = MAX_ALPHA - (fadeFactor * (MAX_ALPHA - MIN_ALPHA));
                treeAlpha = Math.max(MIN_ALPHA, Math.min(MAX_ALPHA, treeAlpha));
            } else if (depthDifference >= maxDepthForFade) {
                // Very close - use minimum alpha
                treeAlpha = MIN_ALPHA;
            }
        }
    }
    
    // Apply transparency if needed
    const needsTransparency = treeAlpha < MAX_ALPHA;
    if (needsTransparency) {
        ctx.save();
        ctx.globalAlpha = treeAlpha;
    }
    
    // Handle falling animation
    if (isFalling && fallProgress !== undefined && fallProgress !== null) {
        renderFallingTree(ctx, tree, fallProgress, cycleProgress, shouldSkipShadows || false);
    } else {
        // Normal upright tree rendering
        renderConfiguredGroundEntity({
            ctx,
            entity: tree,
            config: treeConfig,
            nowMs: now_ms,
            entityPosX: tree.posX,
            entityPosY: tree.posY,
            cycleProgress,
            onlyDrawShadow,    // Pass flag
            skipDrawingShadow: shouldSkipShadows  // Use computed shadow skip flag
        });
    }
    
    // Restore context if transparency was applied
    if (needsTransparency) {
        ctx.restore();
    }
}

/**
 * Render a tree in its falling animation
 */
function renderFallingTree(
    ctx: CanvasRenderingContext2D,
    tree: Tree,
    fallProgress: number,
    cycleProgress: number,
    skipShadow: boolean
) {
    const { imageSource, targetWidth } = getCachedTreeTypeInfo(tree);
    const img = imageManager.getImage(imageSource);
    
    if (!img) return;
    
    const scaleFactor = targetWidth / img.naturalWidth;
    const drawWidth = targetWidth;
    const drawHeight = img.naturalHeight * scaleFactor;
    
    // Calculate fall rotation (0 to 90 degrees, falling to the right)
    const fallAngle = fallProgress * (Math.PI / 2); // 0 to 90 degrees
    
    // Draw realistic collapsing shadow BEFORE rotation (using actual tree shadow)
    // Skip shadow entirely when tree is nearly flat (>90% fallen)
    if (!skipShadow && fallProgress < 0.9) {
        ctx.save();
        
        // Shadow stays at tree base (doesn't rotate with tree)
        // Use the same shadow rendering as upright trees, but with vertical squashing
        
        // Shadow scale factors change as tree falls:
        // - Height: Starts at full height, collapses to almost flat
        const shadowHeightScale = 1 - (fallProgress * 0.95); // Collapses to 5% height when near flat
        
        // Shadow position (stays at base, shifts slightly as tree falls)
        const shadowOffsetX = drawWidth * 0.1 * fallProgress; // Shifts right as tree falls
        
        // Translate to tree base and apply vertical squash
        ctx.translate(tree.posX + shadowOffsetX, tree.posY);
        ctx.scale(1.0, shadowHeightScale); // Only squash vertically
        
        // Calculate aggressive fade-out: fades to 0 at 90% progress
        // At 0%: alpha = 1.0, At 50%: alpha = 0.5, At 90%: alpha = 0
        const shadowFadeProgress = Math.min(fallProgress / 0.9, 1.0); // Normalize to 0-1 by 90%
        const shadowAlpha = 0.35 * (1 - Math.pow(shadowFadeProgress, 1.5)); // Exponential fade-out
        
        // Use the actual tree shadow rendering (same as upright trees)
        drawDynamicGroundShadow({
            ctx,
            entityImage: img,
            entityCenterX: 0, // Already translated
            entityBaseY: 0,   // Already translated
            imageDrawWidth: drawWidth,
            imageDrawHeight: drawHeight,
            cycleProgress,
            maxStretchFactor: 1.8,
            minStretchFactor: 0.15,
            shadowBlur: 2,
            pivotYOffset: 25, // Positive offset moves anchor UP, aligning shadow with tree base
            // Aggressive fade-out - disappears completely by 90%
            baseShadowColor: '0, 0, 0', // Standard shadow color
            maxShadowAlpha: shadowAlpha
        });
        
        ctx.restore();
    }
    
    // Draw the falling tree (with rotation)
    ctx.save();
    
    // Translate to tree base position (pivot point)
    ctx.translate(tree.posX, tree.posY);
    
    // Rotate around the base
    ctx.rotate(fallAngle);
    
    // Tree image is drawn from its base (bottom-center)
    ctx.drawImage(
        img,
        -drawWidth / 2, // Center horizontally at pivot
        -drawHeight,    // Top of tree at pivot (tree grows upward from base)
        drawWidth,
        drawHeight
    );
    
    ctx.restore();
}
