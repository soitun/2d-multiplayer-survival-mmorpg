import { Turret } from '../../generated';
import turretTallowImage from '../../assets/doodads/turret_tallow.png';
import { GroundEntityConfig, renderConfiguredGroundEntity } from './genericGroundRenderer';
import { drawDynamicGroundShadow, calculateShakeOffsets } from './shadowUtils';
import { imageManager } from './imageManager';
import { renderEntityHealthBar } from './healthBarUtils';

// === TURRET TYPE CONSTANTS ===
// Must match server-side constants in turret.rs
export const TURRET_TYPE_TALLOW_STEAM = 0;

// --- Constants directly used by this module or exported ---
export const TURRET_WIDTH = 256;
export const TURRET_HEIGHT = 256;
export const TURRET_WIDTH_PREVIEW = 256;
export const TURRET_HEIGHT_PREVIEW = 256;

// Offset for rendering to align with server-side collision/interaction zones
// Changed from -6 (drawn higher) to +36 (bottom-anchored like rain_collector)
export const TURRET_RENDER_Y_OFFSET = 36; // Visual offset - bottom-anchored like rain collector

// Turret interaction distance (player <-> turret)
export const PLAYER_TURRET_INTERACTION_DISTANCE_SQUARED = 96.0 * 96.0; // Same as lanterns

// Turret height for interaction calculations
export const TURRET_HEIGHT_FOR_INTERACTION = 256;

// --- Other Local Constants ---
const SHAKE_DURATION_MS = 150;
const SHAKE_INTENSITY_PX = 6;

// --- Client-side animation tracking for turret shakes ---
const clientTurretShakeStartTimes = new Map<string, number>();
const lastKnownServerTurretShakeTimes = new Map<string, number>();

// --- Define Configuration ---
const turretConfig: GroundEntityConfig<Turret> = {
    getImageSource: (entity) => {
        if (entity.isDestroyed) {
            return null;
        }
        
        // Currently only Tallow Steam Turret exists
        switch (entity.turretType) {
            case TURRET_TYPE_TALLOW_STEAM:
            default:
                return turretTallowImage;
        }
    },

    getTargetDimensions: (_img, entity) => {
        return { width: TURRET_WIDTH, height: TURRET_HEIGHT };
    },

    calculateDrawPosition: (entity, drawWidth, drawHeight) => ({
        drawX: entity.posX - drawWidth / 2,
        drawY: entity.posY - drawHeight + TURRET_RENDER_Y_OFFSET, // Bottom-anchored like rain_collector
    }),

    getShadowParams: undefined,

    drawCustomGroundShadow: (ctx, entity, entityImage, entityPosX, entityPosY, imageDrawWidth, imageDrawHeight, cycleProgress) => {
        if (!entity.isDestroyed) {
            const { shakeOffsetX, shakeOffsetY } = calculateShakeOffsets(
                entity,
                entity.id.toString(),
                {
                    clientStartTimes: clientTurretShakeStartTimes,
                    lastKnownServerTimes: lastKnownServerTurretShakeTimes
                },
                SHAKE_DURATION_MS,
                SHAKE_INTENSITY_PX
            );
            
            // Match rain_collector shadow parameters (bottom-anchored)
            drawDynamicGroundShadow({
                ctx,
                entityImage,
                entityCenterX: entityPosX,
                entityBaseY: entityPosY, // Bottom-anchored (same as rain_collector)
                imageDrawWidth,
                imageDrawHeight,
                cycleProgress,
                baseShadowColor: '0,0,0',
                maxShadowAlpha: 0.4,
                shadowBlur: 2,
                maxStretchFactor: 1.2,
                minStretchFactor: 0.1,
                pivotYOffset: 35, // Same as rain_collector for 256x256 sprite
                shakeOffsetX,
                shakeOffsetY
            });
        }
    },

    drawOverlay: (ctx, entity, finalDrawX, finalDrawY, finalDrawWidth, finalDrawHeight, nowMs, baseDrawX, baseDrawY) => {
        // Render health bar if turret is damaged (only when PvP is enabled)
        if (entity.health && entity.maxHealth && entity.health < entity.maxHealth) {
            // Use entity position as player position fallback (health bar uses it for distance-based visibility)
            // yAnchorOffset matches rain collector: TURRET_HEIGHT - TURRET_RENDER_Y_OFFSET = 256 - 36 = 220
            renderEntityHealthBar(
                ctx,
                entity,
                TURRET_WIDTH,
                TURRET_HEIGHT,
                nowMs,
                entity.posX,
                entity.posY,
                TURRET_HEIGHT - TURRET_RENDER_Y_OFFSET
            );
        }
    },
};

/**
 * Render a turret entity
 */
export function renderTurret(
    ctx: CanvasRenderingContext2D,
    turret: Turret,
    cameraOffsetX: number,
    cameraOffsetY: number,
    cycleProgress: number
): void {
    const nowMs = performance.now();
    const entityPosX = turret.posX - cameraOffsetX;
    const entityPosY = turret.posY - cameraOffsetY;
    
    renderConfiguredGroundEntity({
        ctx,
        entity: turret,
        config: turretConfig,
        nowMs,
        entityPosX,
        entityPosY,
        cycleProgress
    });
}

/**
 * Get turret dimensions for a given turret type
 */
export function getTurretDimensions(turretType: number): { width: number; height: number } {
    switch (turretType) {
        case TURRET_TYPE_TALLOW_STEAM:
        default:
            return { width: TURRET_WIDTH, height: TURRET_HEIGHT };
    }
}
