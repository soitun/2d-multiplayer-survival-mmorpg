/******************************************************************************
 *                                                                            *
 * Fertilizer Patch Rendering Utils - Renders fertilizer patches on the     *
 * ground that show where fertilizer was applied. Shows as brown/organic     *
 * patches that fade over time.                                             *
 *                                                                            *
 ******************************************************************************/

import { FertilizerPatch } from '../../generated/types';

// --- Constants ---

export const FERTILIZER_PATCH_VISUAL_RADIUS = 36; // Visual radius in pixels (increased from 30 for better visibility)
export const FERTILIZER_PATCH_MAX_OPACITY = 0.7; // Maximum opacity (70% transparency)
export const FERTILIZER_PATCH_MIN_OPACITY = 0.15; // Minimum opacity before it becomes invisible

// --- Fertilizer Patch Rendering ---

/**
 * Renders a single fertilizer patch as brown/organic transparent patch
 */
export function renderFertilizerPatch(
    ctx: CanvasRenderingContext2D,
    fertilizerPatch: FertilizerPatch,
    cameraX: number,
    cameraY: number
): void {
    // Since the context is already translated by cameraOffset, we render directly in world coordinates
    const screenX = fertilizerPatch.posX;
    const screenY = fertilizerPatch.posY;

    // Calculate opacity based on the patch's current opacity (which fades over time)
    // Use brown/organic color for fertilizer
    const opacity = Math.max(fertilizerPatch.currentOpacity * FERTILIZER_PATCH_MAX_OPACITY, FERTILIZER_PATCH_MIN_OPACITY);

    // Save the current context state
    ctx.save();

    // Brown/organic gradient for fertilizer (darker brown center, lighter edges)
    const gradient = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, FERTILIZER_PATCH_VISUAL_RADIUS);
    // Rich brown color (RGB: 101, 67, 33) - organic fertilizer color
    gradient.addColorStop(0, `rgba(101, 67, 33, ${opacity})`); // Dark brown center
    gradient.addColorStop(0.6, `rgba(120, 85, 50, ${opacity * 0.8})`); // Medium brown
    gradient.addColorStop(0.9, `rgba(140, 105, 70, ${opacity * 0.5})`); // Lighter brown edge
    gradient.addColorStop(1, `rgba(140, 105, 70, 0)`); // Fade to transparent

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, FERTILIZER_PATCH_VISUAL_RADIUS, 0, 2 * Math.PI);
    ctx.fill();

    // Add subtle texture effect with small particles (optional - makes it look more organic)
    ctx.globalAlpha = opacity * 0.3;
    ctx.fillStyle = `rgba(80, 50, 25, ${opacity * 0.4})`; // Darker brown particles
    
    // Draw a few small particles for texture
    const particleCount = 8;
    for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2;
        const distance = (FERTILIZER_PATCH_VISUAL_RADIUS * 0.6) + (Math.random() * FERTILIZER_PATCH_VISUAL_RADIUS * 0.3);
        const particleX = screenX + Math.cos(angle) * distance;
        const particleY = screenY + Math.sin(angle) * distance;
        const particleSize = 2 + Math.random() * 3;
        
        ctx.beginPath();
        ctx.arc(particleX, particleY, particleSize, 0, 2 * Math.PI);
        ctx.fill();
    }

    // Restore the context state
    ctx.restore();
}

/**
 * Renders all fertilizer patches in the current view
 */
export function renderFertilizerPatches(
    ctx: CanvasRenderingContext2D,
    fertilizerPatches: Map<string, FertilizerPatch>,
    cameraX: number,
    cameraY: number,
    viewWidth: number,
    viewHeight: number
): void {
    // Calculate view bounds with some padding for smooth transitions
    const padding = FERTILIZER_PATCH_VISUAL_RADIUS * 2;
    const minX = cameraX - padding;
    const maxX = cameraX + viewWidth + padding;
    const minY = cameraY - padding;
    const maxY = cameraY + viewHeight + padding;

    let renderedCount = 0;
    // Render only fertilizer patches within the view
    for (const fertilizerPatch of fertilizerPatches.values()) {
        // Skip patches that are outside the view
        if (fertilizerPatch.posX < minX || fertilizerPatch.posX > maxX || 
            fertilizerPatch.posY < minY || fertilizerPatch.posY > maxY) {
            continue;
        }

        // Skip patches that are too faded to be visible
        if (fertilizerPatch.currentOpacity < 0.05) {
            continue;
        }

        renderFertilizerPatch(ctx, fertilizerPatch, cameraX, cameraY);
        renderedCount++;
    }
}

/**
 * Check if a fertilizer patch is visible on screen
 */
export function isFertilizerPatchVisible(
    fertilizerPatch: FertilizerPatch,
    cameraX: number,
    cameraY: number,
    viewWidth: number,
    viewHeight: number
): boolean {
    const padding = FERTILIZER_PATCH_VISUAL_RADIUS;
    return fertilizerPatch.posX >= cameraX - padding &&
           fertilizerPatch.posX <= cameraX + viewWidth + padding &&
           fertilizerPatch.posY >= cameraY - padding &&
           fertilizerPatch.posY <= cameraY + viewHeight + padding &&
           fertilizerPatch.currentOpacity > 0.05;
}

