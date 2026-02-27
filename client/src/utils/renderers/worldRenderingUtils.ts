/**
 * worldRenderingUtils - Entry point for tiled world background rendering.
 *
 * Thin wrapper around ProceduralWorldRenderer. Provides renderWorldBackground
 * which draws the procedural tile layer onto the canvas. Used by GameCanvas
 * as the first render pass (before entities, water overlay, etc.).
 *
 * Responsibilities:
 * 1. RENDER ENTRY: renderWorldBackground(ctx, cameraOffset, canvasSize, worldTiles)
 *    initializes the procedural renderer if needed and delegates to it.
 *
 * 2. UNDERWATER MODE: When isSnorkeling is true, land tiles render dark blue for
 *    submerged view. Sea tiles render normally.
 *
 * 3. FALLBACK: If no world tiles, leaves background untouched so the cyberpunk
 *    grid remains visible while chunk data streams in.
 */

import { ProceduralWorldRenderer } from './proceduralWorldRenderer';

// Global instance - cached for performance
let globalProceduralRenderer: ProceduralWorldRenderer | null = null;

/**
 * Renders the tiled world background onto the canvas.
 * Uses the procedural world renderer with autotiling support.
 * 
 * @param isSnorkeling - When true, renders underwater view mode (land as dark blue, sea as normal)
 */
export function renderWorldBackground(
    ctx: CanvasRenderingContext2D,
    cameraOffsetX: number,
    cameraOffsetY: number,  
    canvasWidth: number,
    canvasHeight: number,
    worldTiles?: Map<string, any>,
    showDebugOverlay: boolean = false,
    isSnorkeling: boolean = false
): void {
    // Enable pixel-perfect rendering
    ctx.imageSmoothingEnabled = false;
    if ('webkitImageSmoothingEnabled' in ctx) {
        (ctx as any).webkitImageSmoothingEnabled = false;
    }
    if ('mozImageSmoothingEnabled' in ctx) {
        (ctx as any).mozImageSmoothingEnabled = false;
    }
    if ('msImageSmoothingEnabled' in ctx) {
        (ctx as any).msImageSmoothingEnabled = false;
    }

    // Require world tiles for rendering
    if (!worldTiles || worldTiles.size === 0) {
        // Keep previously drawn background (cyberpunk grid) visible while waiting
        // for chunk/tile data instead of painting default grass.
        return;
    }

    // Initialize renderer if needed
    if (!globalProceduralRenderer) {
        globalProceduralRenderer = new ProceduralWorldRenderer();
    }
    
    // Update the tile cache
    globalProceduralRenderer.updateTileCache(worldTiles);
    
    // Render the procedural world (with underwater mode when snorkeling)
    globalProceduralRenderer.renderProceduralWorld(
        ctx, 
        cameraOffsetX, 
        cameraOffsetY, 
        canvasWidth, 
        canvasHeight, 
        16.67,
        showDebugOverlay,
        isSnorkeling
    );
}

/**
 * Renders the shoreline overlay (white foam line) on Beach_Sea transitions.
 * Must be called AFTER renderWaterOverlay so the shoreline appears on top.
 */
export function renderShorelineOverlay(
    ctx: CanvasRenderingContext2D,
    cameraOffsetX: number,
    cameraOffsetY: number,
    canvasWidth: number,
    canvasHeight: number,
    isSnorkeling: boolean = false
): void {
    if (!globalProceduralRenderer) return;
    globalProceduralRenderer.renderShorelineOverlayPass(
        ctx,
        cameraOffsetX,
        cameraOffsetY,
        canvasWidth,
        canvasHeight,
        isSnorkeling
    );
}
