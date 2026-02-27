/******************************************************************************
 *                                                                            *
 * Fire Patch Rendering Utils - Renders fire patches on the ground created   *
 * by fire arrows. Shows as animated orange/red flames that damage players   *
 * and wooden structures. Can be extinguished by water patches.              *
 *                                                                            *
 ******************************************************************************/

import { FirePatch } from '../../generated/types';

// --- Constants ---

export const FIRE_PATCH_VISUAL_RADIUS = 40; // Visual radius in pixels (doubled from 25 to match server)
export const FIRE_PATCH_MAX_INTENSITY = 1.0; // Maximum intensity (100%)
export const FIRE_PATCH_MIN_INTENSITY = 0.2; // Minimum intensity before it becomes invisible

// --- Fire Patch Rendering ---

/**
 * Renders a single fire patch - just the ground glow
 * (Fire and smoke particles are handled by useFirePatchParticles hook)
 */
export function renderFirePatch(
    ctx: CanvasRenderingContext2D,
    firePatch: FirePatch,
    cameraX: number,
    cameraY: number,
    currentTime: number
): void {
    // Since the context is already translated by cameraOffset, we render directly in world coordinates
    const screenX = firePatch.posX;
    const screenY = firePatch.posY;

    // Calculate intensity based on the patch's current intensity (which fades over time)
    const intensity = Math.max(firePatch.currentIntensity, 0.1);

    // Animate the fire with a flickering effect
    const flicker = 0.8 + Math.sin(currentTime * 0.01) * 0.2; // Flicker between 0.6 and 1.0
    const finalIntensity = intensity * flicker;

    // Save the current context state
    ctx.save();

    // Draw only the ground glow (underneath the player)
    // Layer 1: Outer glow (orange)
    const outerGradient = ctx.createRadialGradient(
        screenX, 
        screenY, 
        0, 
        screenX, 
        screenY, 
        FIRE_PATCH_VISUAL_RADIUS * 1.2
    );
    outerGradient.addColorStop(0, `rgba(255, 100, 0, ${finalIntensity * 0.3})`); // Bright orange center
    outerGradient.addColorStop(0.5, `rgba(255, 50, 0, ${finalIntensity * 0.2})`); // Red-orange
    outerGradient.addColorStop(1, `rgba(255, 0, 0, 0)`); // Fade to transparent

    ctx.fillStyle = outerGradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, FIRE_PATCH_VISUAL_RADIUS * 1.2, 0, 2 * Math.PI);
    ctx.fill();

    // Layer 2: Inner glow (yellow-orange)
    const innerGradient = ctx.createRadialGradient(
        screenX, 
        screenY,
        0, 
        screenX, 
        screenY, 
        FIRE_PATCH_VISUAL_RADIUS * 0.8
    );
    innerGradient.addColorStop(0, `rgba(255, 200, 0, ${finalIntensity * 0.4})`); // Bright yellow center
    innerGradient.addColorStop(0.6, `rgba(255, 120, 0, ${finalIntensity * 0.3})`); // Orange
    innerGradient.addColorStop(1, `rgba(255, 50, 0, 0)`); // Fade to transparent

    ctx.fillStyle = innerGradient;
    ctx.beginPath();
    ctx.arc(screenX, screenY, FIRE_PATCH_VISUAL_RADIUS * 0.8, 0, 2 * Math.PI);
    ctx.fill();

    // Restore the context state
    ctx.restore();
}

/**
 * Renders all fire patches in the current view
 */
export function renderFirePatches(
    ctx: CanvasRenderingContext2D,
    firePatches: Map<string, FirePatch>,
    cameraX: number,
    cameraY: number,
    viewWidth: number,
    viewHeight: number,
    currentTime: number
): void {
    // Calculate view bounds with some padding for smooth transitions
    const padding = FIRE_PATCH_VISUAL_RADIUS * 2;
    const minX = cameraX - padding;
    const maxX = cameraX + viewWidth + padding;
    const minY = cameraY - padding;
    const maxY = cameraY + viewHeight + padding;

    let renderedCount = 0;
    // Render only fire patches within the view
    for (const firePatch of firePatches.values()) {
        // Skip patches that are outside the view
        if (firePatch.posX < minX || firePatch.posX > maxX || 
            firePatch.posY < minY || firePatch.posY > maxY) {
            continue;
        }

        // Skip patches that are too faded to be visible
        if (firePatch.currentIntensity < 0.05) {
            continue;
        }

        renderFirePatch(ctx, firePatch, cameraX, cameraY, currentTime);
        renderedCount++;
    }
}

/**
 * Check if a fire patch is visible on screen
 */
export function isFirePatchVisible(
    firePatch: FirePatch,
    cameraX: number,
    cameraY: number,
    viewWidth: number,
    viewHeight: number
): boolean {
    const padding = FIRE_PATCH_VISUAL_RADIUS;
    return firePatch.posX >= cameraX - padding &&
           firePatch.posX <= cameraX + viewWidth + padding &&
           firePatch.posY >= cameraY - padding &&
           firePatch.posY <= cameraY + viewHeight + padding &&
           firePatch.currentIntensity > 0.05;
}

/**
 * Get fire patches sorted by distance from camera center (for depth sorting if needed)
 */
export function getFirePatchesSortedByDistance(
    firePatches: Map<string, FirePatch>,
    cameraX: number,
    cameraY: number,
    viewWidth: number,
    viewHeight: number
): FirePatch[] {
    const centerX = cameraX + viewWidth / 2;
    const centerY = cameraY + viewHeight / 2;

    return Array.from(firePatches.values())
        .filter(patch => isFirePatchVisible(patch, cameraX, cameraY, viewWidth, viewHeight))
        .sort((a, b) => {
            const distA = Math.sqrt((a.posX - centerX) ** 2 + (a.posY - centerY) ** 2);
            const distB = Math.sqrt((b.posX - centerX) ** 2 + (b.posY - centerY) ** 2);
            return distA - distB;
        });
}

