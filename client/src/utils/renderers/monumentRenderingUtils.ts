/**
 * monumentRenderingUtils.ts
 * 
 * Rendering utility for all monument structures in the game.
 * Handles both:
 * - Static monuments: Defined in client config (e.g., compound buildings, guard posts)
 * - Dynamic monuments: Generated during world creation (e.g., shipwrecks on beaches)
 * 
 * Server handles collision detection for all monuments.
 */

import React from 'react';
import { 
    CompoundBuilding, 
    COMPOUND_BUILDINGS, 
    getBuildingWorldPosition 
} from '../../config/compoundBuildings';
import { drawDynamicGroundShadow } from './shadowUtils';

/** Isometric hut/lodge doodads: footprint extends down-right; shadow needs R(45° CW) * S(1, 0.5) */
const ISOMETRIC_DOODAD_IMAGES = new Set([
  'fv_lodge.png', 'fv_hut2.png', 'fv_hut3.png',
  'hv_lodge.png', 'hv_hut2.png', 'hv_hut3.png',
  'wbg_hermit_hut.png', 'hs_shack.png',
  // Whale Bone Graveyard monument parts (ancient whale bones on beach)
  'wbg_ribcage.png', 'wbg_skull.png', 'wbg_spine.png', 'wbg_jawbone.png',
]);

// Image cache for compound buildings (same pattern as alkStationRenderingUtils.ts)
const buildingImages: Map<string, HTMLImageElement> = new Map();
const loadingImages: Set<string> = new Set();
// Track images that failed to load or don't have loaders to prevent infinite retry loops
const failedImages: Set<string> = new Set();

/**
 * Load a single building image with explicit dynamic import
 */
function loadImage(imageName: string, importPromise: Promise<{ default: string }>): void {
    if (buildingImages.has(imageName) || loadingImages.has(imageName) || failedImages.has(imageName)) return;
    
    loadingImages.add(imageName);
    importPromise.then((module) => {
        const img = new Image();
        img.onload = () => {
            buildingImages.set(imageName, img);
            loadingImages.delete(imageName);
            console.log(`[Monument] ✅ Loaded: ${imageName}`);
        };
        img.onerror = (e) => {
            loadingImages.delete(imageName);
            failedImages.add(imageName); // Mark as failed to prevent retry loops
            console.error(`[Monument] ❌ Failed to load: ${imageName}, URL was: ${module.default}`, e);
        };
        img.src = module.default;
    }).catch((err) => {
        loadingImages.delete(imageName);
        failedImages.add(imageName); // Mark as failed to prevent retry loops
        console.error(`[Monument] ❌ Import failed for: ${imageName}`, err);
    });
}

/**
 * Preload all monument images (explicit imports like alkStationRenderingUtils.ts)
 * Using ?url suffix to ensure Vite processes these as static assets
 * Includes both static monuments (compound buildings) and dynamic monuments (shipwrecks)
 */
export function preloadMonumentImages(): void {
    // guardpost.png removed - all guardposts/streetlights replaced by eerie ambient lights
    loadImage('shed.png', import('../../assets/doodads/shed.png?url'));
    loadImage('garage.png', import('../../assets/doodads/garage.png?url'));
    loadImage('alk_food_processor.png', import('../../assets/doodads/alk_food_processor.png?url'));
    loadImage('alk_weapons_depot.png', import('../../assets/doodads/alk_weapons_depot.png?url'));
    // warehouse.png removed - replaced by monument large furnace placeable
    loadImage('barracks.png', import('../../assets/doodads/barracks.png?url'));
    loadImage('fuel_depot.png', import('../../assets/doodads/fuel_depot.png?url'));
    
    // Shipwreck monument images (hull1, hull2, hull3, etc.)
    loadImage('hull1.png', import('../../assets/doodads/hull1.png?url'));
    loadImage('hull2.png', import('../../assets/doodads/hull2.png?url'));
    loadImage('hull3.png', import('../../assets/doodads/hull3.png?url'));
    loadImage('hull4.png', import('../../assets/doodads/hull4.png?url'));
    loadImage('hull5.png', import('../../assets/doodads/hull5.png?url'));
    loadImage('hull6.png', import('../../assets/doodads/hull6.png?url'));
    loadImage('hull7.png', import('../../assets/doodads/hull7.png?url'));
    
    // Fishing village monument images (Aleut-style village)
    loadImage('fv_campfire.png', import('../../assets/doodads/fv_campfire.png?url')); // Visual campfire at center
    loadImage('fv_lodge.png', import('../../assets/doodads/fv_lodge.png?url'));
    loadImage('fv_hut2.png', import('../../assets/doodads/fv_hut2.png?url'));
    loadImage('fv_hut3.png', import('../../assets/doodads/fv_hut3.png?url'));
    loadImage('fv_smokerack1.png', import('../../assets/doodads/fv_smokerack1.png?url'));
    
    // Whale Bone Graveyard monument images (ancient whale bone graveyard on beach)
    // Note: Campfire is a functional monument placeable, not a visual doodad
    loadImage('wbg_ribcage.png', import('../../assets/doodads/wbg_ribcage.png?url'));
    loadImage('wbg_skull.png', import('../../assets/doodads/wbg_skull.png?url'));
    loadImage('wbg_spine.png', import('../../assets/doodads/wbg_spine.png?url'));
    loadImage('wbg_jawbone.png', import('../../assets/doodads/wbg_jawbone.png?url'));
    loadImage('wbg_hermit_hut.png', import('../../assets/doodads/wbg_hermit_hut.png?url'));
    
    // Hunting Village monument images (boreal Aleutian-style hunting village in forest)
    // Uses fv_campfire.png for the campfire (shared with fishing village)
    loadImage('hv_lodge.png', import('../../assets/doodads/hv_lodge.png?url'));
    loadImage('hv_hut2.png', import('../../assets/doodads/hv_hut2.png?url'));
    loadImage('hv_hut3.png', import('../../assets/doodads/hv_hut3.png?url'));
    loadImage('hv_drying_rack.png', import('../../assets/doodads/hv_drying_rack.png?url'));
    loadImage('scarecrow.png', import('../../assets/doodads/scarecrow.png?url'));
    
    // Crashed Research Drone monument images (tundra crash site)
    loadImage('cd_drone.png', import('../../assets/doodads/cd_drone.png?url'));
    
    // Hot Spring monument images (abandoned bath house shack)
    loadImage('hs_shack.png', import('../../assets/doodads/hs_shack.png?url'));
    
    // Weather Station monument images (alpine radar dish)
    loadImage('ws_radar.png', import('../../assets/doodads/ws_radar.png?url'));
    
    // Wolf Den monument images (tundra wolf mound)
    loadImage('wd_mound.png', import('../../assets/doodads/wd_mound.png?url'));

    // Aleutian whale oil road lampposts (along dirt roads)
    loadImage('road_lamp.png', import('../../assets/doodads/road_lamp.png?url'));
    loadImage('road_lamp_off.png', import('../../assets/doodads/road_lamp_off.png?url'));
}

/**
 * Get a building's image, triggering load if needed
 * PERFORMANCE FIX: Prevents infinite retry loops for missing/unknown images
 */
export function getBuildingImage(imagePath: string): HTMLImageElement | null {
    // Fast path: already loaded
    const img = buildingImages.get(imagePath);
    if (img) return img;
    
    // Skip if already loading or known to have failed
    if (loadingImages.has(imagePath) || failedImages.has(imagePath)) {
        return null;
    }
    
    // Image not loaded and not loading - try to trigger load
        const imageMap: Record<string, () => Promise<{ default: string }>> = {
            'shed.png': () => import('../../assets/doodads/shed.png?url'),
            'garage.png': () => import('../../assets/doodads/garage.png?url'),
            'alk_food_processor.png': () => import('../../assets/doodads/alk_food_processor.png?url'),
            'alk_weapons_depot.png': () => import('../../assets/doodads/alk_weapons_depot.png?url'),
            'warehouse.png': () => import('../../assets/doodads/warehouse.png?url'),
            'barracks.png': () => import('../../assets/doodads/barracks.png?url'),
            'fuel_depot.png': () => import('../../assets/doodads/fuel_depot.png?url'),
            
            // Shipwreck monument images (hull1, hull2, hull3, etc.)
            'hull1.png': () => import('../../assets/doodads/hull1.png?url'),
            'hull2.png': () => import('../../assets/doodads/hull2.png?url'),
            'hull3.png': () => import('../../assets/doodads/hull3.png?url'),
            'hull4.png': () => import('../../assets/doodads/hull4.png?url'),
            'hull5.png': () => import('../../assets/doodads/hull5.png?url'),
            'hull6.png': () => import('../../assets/doodads/hull6.png?url'),
            'hull7.png': () => import('../../assets/doodads/hull7.png?url'),
            
            // Fishing village monument images (Aleut-style village)
            'fv_campfire.png': () => import('../../assets/doodads/fv_campfire.png?url'), // Visual campfire at center
            'fv_lodge.png': () => import('../../assets/doodads/fv_lodge.png?url'),
            'fv_hut2.png': () => import('../../assets/doodads/fv_hut2.png?url'),
            'fv_hut3.png': () => import('../../assets/doodads/fv_hut3.png?url'),
            'fv_smokerack1.png': () => import('../../assets/doodads/fv_smokerack1.png?url'),
            
            // Whale Bone Graveyard monument images (ancient whale bone graveyard on beach)
            // Note: Campfire is a functional monument placeable, not a visual doodad
            'wbg_ribcage.png': () => import('../../assets/doodads/wbg_ribcage.png?url'),
            'wbg_skull.png': () => import('../../assets/doodads/wbg_skull.png?url'),
            'wbg_spine.png': () => import('../../assets/doodads/wbg_spine.png?url'),
            'wbg_jawbone.png': () => import('../../assets/doodads/wbg_jawbone.png?url'),
            'wbg_hermit_hut.png': () => import('../../assets/doodads/wbg_hermit_hut.png?url'),
            
            // Hunting Village monument images (boreal Aleutian-style hunting village in forest)
            // Uses fv_campfire.png for the campfire (shared with fishing village)
            'hv_lodge.png': () => import('../../assets/doodads/hv_lodge.png?url'),
            'hv_hut2.png': () => import('../../assets/doodads/hv_hut2.png?url'),
            'hv_hut3.png': () => import('../../assets/doodads/hv_hut3.png?url'),
            'hv_drying_rack.png': () => import('../../assets/doodads/hv_drying_rack.png?url'),
            'scarecrow.png': () => import('../../assets/doodads/scarecrow.png?url'),
            
            // Crashed Research Drone monument images (tundra crash site)
            'cd_drone.png': () => import('../../assets/doodads/cd_drone.png?url'),
            
            // Hot Spring monument images (abandoned bath house shack)
            'hs_shack.png': () => import('../../assets/doodads/hs_shack.png?url'),
            
            // Weather Station monument images (alpine radar dish)
            'ws_radar.png': () => import('../../assets/doodads/ws_radar.png?url'),
            
            // Wolf Den monument images (tundra wolf mound)
            'wd_mound.png': () => import('../../assets/doodads/wd_mound.png?url'),

            // Aleutian whale oil road lampposts (along dirt roads)
            'road_lamp.png': () => import('../../assets/doodads/road_lamp.png?url'),
            'road_lamp_off.png': () => import('../../assets/doodads/road_lamp_off.png?url'),
        };
    
        const loader = imageMap[imagePath];
        if (loader) {
        // Log only once when actually starting to load
        console.log(`[Monument] Starting load for: ${imagePath}`);
            loadImage(imagePath, loader());
    } else {
        // No loader for this image - mark as failed to prevent retry spam
        // Log only once to notify developers
        console.warn(`[Monument] No loader configured for: ${imagePath} - skipping`);
        failedImages.add(imagePath);
    }
    
    return null;
}

// Color palette for placeholder buildings (cycles through these)
const PLACEHOLDER_COLORS = [
    { fill: 'rgba(70, 130, 180, 0.4)', stroke: 'rgba(70, 130, 180, 0.9)' },   // Steel Blue
    { fill: 'rgba(178, 102, 255, 0.4)', stroke: 'rgba(178, 102, 255, 0.9)' }, // Purple
    { fill: 'rgba(255, 165, 0, 0.4)', stroke: 'rgba(255, 165, 0, 0.9)' },     // Orange
    { fill: 'rgba(50, 205, 50, 0.4)', stroke: 'rgba(50, 205, 50, 0.9)' },     // Lime Green
    { fill: 'rgba(255, 99, 71, 0.4)', stroke: 'rgba(255, 99, 71, 0.9)' },     // Tomato Red
    { fill: 'rgba(0, 206, 209, 0.4)', stroke: 'rgba(0, 206, 209, 0.9)' },     // Turquoise
];

// Get a consistent color for a building based on its ID
function getPlaceholderColor(buildingId: string): { fill: string; stroke: string } {
    let hash = 0;
    for (let i = 0; i < buildingId.length; i++) {
        hash = ((hash << 5) - hash) + buildingId.charCodeAt(i);
        hash = hash & hash;
    }
    return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

/**
 * Render a placeholder for monuments whose images haven't loaded yet
 * Shows a colored transparent overlay with border and monument info
 */
function renderPlaceholder(
    ctx: CanvasRenderingContext2D,
    building: CompoundBuilding,
    worldX: number,
    worldY: number
): void {
    const drawX = worldX - building.width / 2;
    const drawY = worldY - building.height + building.anchorYOffset;
    
    const color = getPlaceholderColor(building.id);
    
    ctx.save();
    
    // Draw filled rectangle with transparency
    ctx.fillStyle = color.fill;
    ctx.fillRect(drawX, drawY, building.width, building.height);
    
    // Draw border
    ctx.strokeStyle = color.stroke;
    ctx.lineWidth = 3;
    ctx.strokeRect(drawX, drawY, building.width, building.height);
    
    // Draw diagonal lines to indicate placeholder
    ctx.strokeStyle = color.stroke;
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(drawX, drawY);
    ctx.lineTo(drawX + building.width, drawY + building.height);
    ctx.moveTo(drawX + building.width, drawY);
    ctx.lineTo(drawX, drawY + building.height);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw anchor point marker (where building "feet" are)
    ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.beginPath();
    ctx.arc(worldX, worldY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw collision radius circle at the ACTUAL collision position
    // collisionCenterY = worldY - collisionYOffset
    // With negative collisionYOffset, this moves collision DOWN (south) towards sprite bottom
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const collisionY = worldY - building.collisionYOffset; // Negative offset = positive result = further south
    ctx.arc(worldX, collisionY, building.collisionRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw building info text
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 3;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const centerY = drawY + building.height / 2;
    
    // Building ID
    const idText = building.id;
    ctx.strokeText(idText, worldX, centerY - 20);
    ctx.fillText(idText, worldX, centerY - 20);
    
    // Dimensions
    const dimText = `${building.width}×${building.height}`;
    ctx.font = '12px monospace';
    ctx.strokeText(dimText, worldX, centerY);
    ctx.fillText(dimText, worldX, centerY);
    
    // Collision radius
    const collText = `r=${building.collisionRadius}`;
    ctx.strokeText(collText, worldX, centerY + 18);
    ctx.fillText(collText, worldX, centerY + 18);
    
    ctx.restore();
}

/**
 * Render a single monument (compound building or shipwreck part)
 */
export function renderMonument(
    ctx: CanvasRenderingContext2D,
    building: CompoundBuilding & { worldX?: number; worldY?: number },
    cycleProgress: number,
    localPlayerPosition?: { x: number; y: number } | null,
    doodadImagesRef?: React.RefObject<Map<string, HTMLImageElement>>
): void {
    // Use provided world coordinates if available (for dynamic shipwrecks),
    // otherwise calculate from offset (for static compound buildings)
    const worldX = building.worldX !== undefined ? building.worldX : getBuildingWorldPosition(building).x;
    const worldY = building.worldY !== undefined ? building.worldY : getBuildingWorldPosition(building).y;
    
    // Try doodadImagesRef first (like alkStationRenderingUtils.ts), then fallback to module cache
    let img: HTMLImageElement | null | undefined = doodadImagesRef?.current?.get(building.imagePath);
    if (!img) {
        img = getBuildingImage(building.imagePath);
    }
    
    // PERFORMANCE FIX: Removed debug logging that was running every frame
    
    if (!img) {
        renderPlaceholder(ctx, building, worldX, worldY);
        return;
    }
    
    // Calculate draw position (anchor at bottom-center, offset by anchorYOffset)
    const drawX = worldX - building.width / 2;
    const drawY = worldY - building.height + building.anchorYOffset;
    
    ctx.save();
    
    // ===== TRANSPARENCY WHEN PLAYER IS BEHIND =====
    // Similar to ALK central compound - only trigger when player is in inner 50% of building
    // This prevents transparency from triggering too easily from the sides
    let shouldApplyTransparency = false;
    let transparencyAlpha = 1.0;
    
    if (localPlayerPosition) {
        // Calculate TIGHTER bounds - only inner 50% of building triggers transparency
        // This matches the ALK compound behavior
        const horizontalPadding = building.width * 0.33; // 25% padding on each side = 50% inner area
        const visualHeight = building.height - building.anchorYOffset;
        const topPadding = visualHeight * 0.25; // 25% padding from top = 50% inner area
        
        const buildingLeft = worldX - building.width / 2 + horizontalPadding;
        const buildingRight = worldX + building.width / 2 - horizontalPadding;
        const buildingTop = worldY - building.height + building.anchorYOffset + topPadding;
        const buildingBottom = worldY;
        
        // Player bounding box (approximate)
        const playerSize = 48;
        const playerLeft = localPlayerPosition.x - playerSize / 2;
        const playerRight = localPlayerPosition.x + playerSize / 2;
        const playerTop = localPlayerPosition.y - playerSize;
        const playerBottom = localPlayerPosition.y;
        
        // Check for visual overlap - tighter bounds mean player must be more inside
        const overlapsHorizontally = playerRight > buildingLeft && playerLeft < buildingRight;
        const overlapsVertically = playerBottom > buildingTop && playerTop < buildingBottom;
        
        // Building should be transparent if:
        // 1. Player overlaps with building's inner 50% area
        // 2. Building renders AFTER player (player.y < building anchor Y means player is behind)
        const playerIsBehindBuilding = localPlayerPosition.y < worldY;
        
        if (overlapsHorizontally && overlapsVertically && playerIsBehindBuilding) {
            // Calculate smooth fade based on depth (similar to ALK compound)
            const depthDifference = worldY - localPlayerPosition.y;
            const maxDepthForFade = 200; // Max distance for fade effect (larger for big structures)
            
            if (depthDifference > 0 && depthDifference < maxDepthForFade) {
                // Smooth fade based on depth - more behind = more transparent
                const fadeProgress = Math.min(1.0, depthDifference / maxDepthForFade);
                transparencyAlpha = 1.0 - (fadeProgress * 0.6); // Max 60% transparency
                shouldApplyTransparency = true;
            } else if (depthDifference >= maxDepthForFade) {
                transparencyAlpha = 0.4; // Minimum opacity
                shouldApplyTransparency = true;
            }
        }
    }
    
    // Draw dynamic ground shadow (before building sprite, like ALK central compound)
    // Skip shadow for ground-level items: crashed research drone, campfire (fv_campfire used in both villages)
    // The sprite's visual base (where it touches ground) is at worldY + anchorYOffset
    // (since drawY = worldY - height + anchorYOffset, sprite bottom = drawY + height = worldY + anchorYOffset)
    // So we need to adjust entityBaseY to the visual base, or use negative pivotYOffset
    // Using negative pivotYOffset to move shadow pivot DOWN to match sprite visual base
    const skipShadow = building.id.startsWith('crashed_research_drone') || building.imagePath === 'fv_campfire.png';
    if (!skipShadow) {
        // Compound buildings are large ground-level structures - no noon shadow push needed.
        // The noon push fix is for tall narrow entities (trees, stones) where the short noon
        // shadow detaches from the base. Compound buildings have wide bases so the shadow
        // stays visually connected without any offset adjustment.
        drawDynamicGroundShadow({
            ctx,
            entityImage: img,
            entityCenterX: worldX,
            entityBaseY: worldY,
            imageDrawWidth: building.width,
            imageDrawHeight: building.height,
            cycleProgress,
            maxShadowAlpha: 0.5,
            maxStretchFactor: 2.0,
            minStretchFactor: 0.2,
            shadowBlur: 3,
            pivotYOffset: ISOMETRIC_DOODAD_IMAGES.has(building.imagePath)
                ? 80  // Iso huts need larger pivot to pull shadow up (scaleY=0.5 creates gap)
                : -building.anchorYOffset + 50,
            isometricShadow: ISOMETRIC_DOODAD_IMAGES.has(building.imagePath),
        });
    }
    
    // Apply transparency if needed
    if (shouldApplyTransparency) {
        ctx.globalAlpha = transparencyAlpha;
    }
    
    // Apply rotation if needed (e.g., monument parts with custom orientation)
    const rotationRad = (building as { rotationRad?: number }).rotationRad ?? 0;
    if (Math.abs(rotationRad) > 0.001) {
        ctx.translate(worldX, worldY);
        ctx.rotate(rotationRad);
        ctx.translate(-worldX, -worldY);
    }
    
    // Draw the building (transparency already applied if needed)
    ctx.drawImage(img, drawX, drawY, building.width, building.height);
    
    ctx.restore();
}

/**
 * Render all static monuments (compound buildings)
 * Note: For proper Y-sorting, monuments should be rendered through the Y-sorted entity system.
 * This function is useful for debugging or if you want to render all monuments in a batch.
 * Does NOT include dynamic monuments (shipwrecks) - those come from SpacetimeDB subscription.
 */
export function renderAllStaticMonuments(
    ctx: CanvasRenderingContext2D,
    cycleProgress: number,
    localPlayerPosition?: { x: number; y: number } | null
): void {
    for (const building of COMPOUND_BUILDINGS) {
        renderMonument(ctx, building, cycleProgress, localPlayerPosition);
    }
}

/**
 * Check if a point is within the visual bounds of any static monument.
 * Useful for interaction detection or UI purposes.
 */
export function isPointInStaticMonument(x: number, y: number): CompoundBuilding | null {
    for (const building of COMPOUND_BUILDINGS) {
        const worldPos = getBuildingWorldPosition(building);
        const left = worldPos.x - building.width / 2;
        const right = worldPos.x + building.width / 2;
        const top = worldPos.y - building.height + building.anchorYOffset;
        const bottom = worldPos.y;
        
        if (x >= left && x <= right && y >= top && y <= bottom) {
            return building;
        }
    }
    return null;
}

/**
 * Get static monuments visible in a viewport.
 * Useful for culling monuments outside the camera view.
 */
export function getVisibleStaticMonuments(
    viewMinX: number,
    viewMaxX: number,
    viewMinY: number,
    viewMaxY: number,
    buffer: number = 100
): Array<CompoundBuilding & { worldX: number; worldY: number }> {
    const visible: Array<CompoundBuilding & { worldX: number; worldY: number }> = [];
    
    for (const building of COMPOUND_BUILDINGS) {
        const worldPos = getBuildingWorldPosition(building);
        
        // Calculate building bounds
        const left = worldPos.x - building.width / 2 - buffer;
        const right = worldPos.x + building.width / 2 + buffer;
        const top = worldPos.y - building.height + building.anchorYOffset - buffer;
        const bottom = worldPos.y + buffer;
        
        // Check if building overlaps with viewport
        if (right >= viewMinX && left <= viewMaxX && bottom >= viewMinY && top <= viewMaxY) {
            visible.push({
                ...building,
                worldX: worldPos.x,
                worldY: worldPos.y,
            });
        }
    }
    
    return visible;
}

