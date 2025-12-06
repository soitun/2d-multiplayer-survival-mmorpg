/**
 * compoundBuildingRenderingUtils.ts
 * 
 * Rendering utility for static compound buildings.
 * These buildings are defined in config and rendered client-side.
 * Server handles collision detection using mirrored constants.
 */

import React from 'react';
import { 
    CompoundBuilding, 
    COMPOUND_BUILDINGS, 
    getBuildingWorldPosition 
} from '../../config/compoundBuildings';

// Image cache for compound buildings (same pattern as alkStationRenderingUtils.ts)
const buildingImages: Map<string, HTMLImageElement> = new Map();
const loadingImages: Set<string> = new Set();

/**
 * Load a single building image with explicit dynamic import
 */
function loadImage(imageName: string, importPromise: Promise<{ default: string }>): void {
    if (buildingImages.has(imageName) || loadingImages.has(imageName)) return;
    
    loadingImages.add(imageName);
    importPromise.then((module) => {
        console.log(`[CompoundBuilding] Import resolved for ${imageName}, module.default:`, module.default);
        const img = new Image();
        img.onload = () => {
            buildingImages.set(imageName, img);
            loadingImages.delete(imageName);
            console.log(`[CompoundBuilding] ✅ Loaded: ${imageName}`);
        };
        img.onerror = (e) => {
            loadingImages.delete(imageName);
            console.error(`[CompoundBuilding] ❌ Failed to load: ${imageName}, URL was: ${module.default}`, e);
        };
        img.src = module.default;
    }).catch((err) => {
        loadingImages.delete(imageName);
        console.error(`[CompoundBuilding] ❌ Import failed for: ${imageName}`, err);
    });
}

/**
 * Preload all compound building images (explicit imports like alkStationRenderingUtils.ts)
 * Using ?url suffix to ensure Vite processes these as static assets
 */
export function preloadCompoundBuildingImages(): void {
    loadImage('guardpost.png', import('../../assets/doodads/guardpost.png?url'));
    loadImage('shed.png', import('../../assets/doodads/shed.png?url'));
    loadImage('garage.png', import('../../assets/doodads/garage.png?url'));
    loadImage('warehouse.png', import('../../assets/doodads/warehouse.png?url'));
    loadImage('barracks.png', import('../../assets/doodads/barracks.png?url'));
    loadImage('fuel_depot.png', import('../../assets/doodads/fuel_depot.png?url'));
    // Add more as you create image files:
    // loadImage('wall_horizontal.png', import('../../assets/doodads/wall_horizontal.png?url'));
    // loadImage('wall_vertical.png', import('../../assets/doodads/wall_vertical.png?url'));
}

/**
 * Get a building's image, triggering load if needed
 */
export function getBuildingImage(imagePath: string): HTMLImageElement | null {
    const img = buildingImages.get(imagePath);
    if (!img && !loadingImages.has(imagePath)) {
        // Image not loaded and not loading - trigger load
        console.log(`[CompoundBuilding] Triggering load for: ${imagePath}`);
        // Re-trigger preload for this specific image
        const imageMap: Record<string, () => Promise<{ default: string }>> = {
            'guardpost.png': () => import('../../assets/doodads/guardpost.png?url'),
            'shed.png': () => import('../../assets/doodads/shed.png?url'),
            'garage.png': () => import('../../assets/doodads/garage.png?url'),
            'warehouse.png': () => import('../../assets/doodads/warehouse.png?url'),
            'barracks.png': () => import('../../assets/doodads/barracks.png?url'),
            'fuel_depot.png': () => import('../../assets/doodads/fuel_depot.png?url'),
        };
        const loader = imageMap[imagePath];
        if (loader) {
            loadImage(imagePath, loader());
        }
    }
    return img || null;
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
 * Render a placeholder for buildings whose images haven't loaded yet
 * Shows a colored transparent overlay with border and building info
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
    
    // Draw collision radius circle
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const collisionY = worldY - building.collisionYOffset;
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
 * Render a single compound building
 */
export function renderCompoundBuilding(
    ctx: CanvasRenderingContext2D,
    building: CompoundBuilding,
    cycleProgress: number,
    localPlayerPosition?: { x: number; y: number } | null,
    doodadImagesRef?: React.RefObject<Map<string, HTMLImageElement>>
): void {
    const worldPos = getBuildingWorldPosition(building);
    const worldX = worldPos.x;
    const worldY = worldPos.y;
    
    // Try doodadImagesRef first (like alkStationRenderingUtils.ts), then fallback to module cache
    let img: HTMLImageElement | null | undefined = doodadImagesRef?.current?.get(building.imagePath);
    if (!img) {
        img = getBuildingImage(building.imagePath);
    }
    
    // Debug logging for specific images
    if (building.imagePath === 'guardpost.png' || building.imagePath === 'shed.png') {
        console.log(`[CompoundBuilding] Rendering ${building.id} (${building.imagePath}):`, {
            fromRef: !!doodadImagesRef?.current?.get(building.imagePath),
            fromCache: !!buildingImages.get(building.imagePath),
            loading: loadingImages.has(building.imagePath),
            hasImg: !!img
        });
    }
    
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
    
    // Apply transparency if needed
    if (shouldApplyTransparency) {
        ctx.globalAlpha = transparencyAlpha;
    }
    
    // Draw the building (transparency already applied if needed)
    ctx.drawImage(img, drawX, drawY, building.width, building.height);
    
    ctx.restore();
}

/**
 * Render all compound buildings
 * Note: For proper Y-sorting, buildings should be rendered through the Y-sorted entity system.
 * This function is useful for debugging or if you want to render all buildings in a batch.
 */
export function renderAllCompoundBuildings(
    ctx: CanvasRenderingContext2D,
    cycleProgress: number,
    localPlayerPosition?: { x: number; y: number } | null
): void {
    for (const building of COMPOUND_BUILDINGS) {
        renderCompoundBuilding(ctx, building, cycleProgress, localPlayerPosition);
    }
}

/**
 * Check if a point is within the visual bounds of any compound building.
 * Useful for interaction detection or UI purposes.
 */
export function isPointInCompoundBuilding(x: number, y: number): CompoundBuilding | null {
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
 * Get compound buildings visible in a viewport.
 * Useful for culling buildings outside the camera view.
 */
export function getVisibleCompoundBuildings(
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

