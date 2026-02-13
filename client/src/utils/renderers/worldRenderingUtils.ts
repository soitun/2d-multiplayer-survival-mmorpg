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
        // Draw fallback color while waiting for tiles
        ctx.fillStyle = '#8FBC8F';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
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
