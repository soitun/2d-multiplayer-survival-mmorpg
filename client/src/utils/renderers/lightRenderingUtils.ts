import { Player as SpacetimeDBPlayer, ItemDefinition as SpacetimeDBItemDefinition, ActiveEquipment as SpacetimeDBActiveEquipment, Lantern as SpacetimeDBLantern, Furnace as SpacetimeDBFurnace, Campfire as SpacetimeDBCampfire, Barbecue as SpacetimeDBBarbecue } from '../../generated';

// Import rendering constants
import { CAMPFIRE_RENDER_Y_OFFSET, CAMPFIRE_HEIGHT } from '../renderers/campfireRenderingUtils';
import { LANTERN_RENDER_Y_OFFSET, LANTERN_HEIGHT } from '../renderers/lanternRenderingUtils';
import { FURNACE_RENDER_Y_OFFSET, FURNACE_HEIGHT } from '../renderers/furnaceRenderingUtils';
import { BARBECUE_RENDER_Y_OFFSET, BARBECUE_HEIGHT } from '../renderers/barbecueRenderingUtils';
import { BuildingCluster } from '../buildingVisibilityUtils';
import { FOUNDATION_TILE_SIZE } from '../../config/gameConfig';

// --- Indoor Light Containment Utilities ---

/**
 * Convert world position to foundation cell coordinates
 */
function worldToFoundationCell(worldX: number, worldY: number): { cellX: number; cellY: number } {
    return {
        cellX: Math.floor(worldX / FOUNDATION_TILE_SIZE),
        cellY: Math.floor(worldY / FOUNDATION_TILE_SIZE),
    };
}

/**
 * Find which enclosed building cluster contains the given world position
 * Returns the cluster if found, null otherwise
 */
function findEnclosingCluster(
    worldX: number,
    worldY: number,
    buildingClusters: Map<string, BuildingCluster>
): BuildingCluster | null {
    const { cellX, cellY } = worldToFoundationCell(worldX, worldY);
    const cellKey = `${cellX},${cellY}`;
    
    for (const [_, cluster] of buildingClusters) {
        if (cluster.isEnclosed && cluster.cellCoords.has(cellKey)) {
            return cluster;
        }
    }
    return null;
}

/**
 * Create a Path2D clip path from a building cluster's foundation cells
 * 
 * IMPORTANT: North walls/doors render with a vertical offset ABOVE the foundation,
 * so we extend the clip area upward by one foundation tile size to include
 * the north wall rendering area.
 */
function createClusterClipPath(
    cluster: BuildingCluster,
    cameraOffsetX: number,
    cameraOffsetY: number
): Path2D {
    const path = new Path2D();
    
    cluster.cellCoords.forEach((cellKey) => {
        const [cellXStr, cellYStr] = cellKey.split(',');
        const cellX = parseInt(cellXStr, 10);
        const cellY = parseInt(cellYStr, 10);
        
        const screenX = cellX * FOUNDATION_TILE_SIZE + cameraOffsetX;
        const screenY = cellY * FOUNDATION_TILE_SIZE + cameraOffsetY;
        
        // Add the foundation cell itself
        path.rect(screenX, screenY, FOUNDATION_TILE_SIZE, FOUNDATION_TILE_SIZE);
        
        // Add a rectangle ABOVE this cell to cover north wall/door rendering area
        // North walls render with vertical offset above the foundation
        path.rect(screenX, screenY - FOUNDATION_TILE_SIZE, FOUNDATION_TILE_SIZE, FOUNDATION_TILE_SIZE);
    });
    
    return path;
}

/**
 * Apply building interior clipping if needed
 * Returns a function to restore the context, or null if no clipping was applied
 */
function applyIndoorClip(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    cameraOffsetX: number,
    cameraOffsetY: number,
    buildingClusters?: Map<string, BuildingCluster>
): (() => void) | null {
    if (!buildingClusters) return null;
    
    const enclosingCluster = findEnclosingCluster(worldX, worldY, buildingClusters);
    if (!enclosingCluster) return null;
    
    ctx.save();
    const clipPath = createClusterClipPath(enclosingCluster, cameraOffsetX, cameraOffsetY);
    ctx.clip(clipPath);
    
    return () => ctx.restore();
}

// --- End Indoor Light Containment Utilities ---

// --- Campfire Light Constants (defined locally now) ---
export const CAMPFIRE_LIGHT_RADIUS_BASE = 150;
export const CAMPFIRE_FLICKER_AMOUNT = 5; // Max pixels radius will change by
export const CAMPFIRE_LIGHT_INNER_COLOR = 'rgba(255, 180, 80, 0.35)'; // Warmer orange/yellow, slightly more opaque
export const CAMPFIRE_LIGHT_OUTER_COLOR = 'rgba(255, 100, 0, 0.0)';  // Fade to transparent orange

// --- Torch Light Constants (more yellow-orange for pitch/tar burning) ---
export const TORCH_LIGHT_RADIUS_BASE = CAMPFIRE_LIGHT_RADIUS_BASE * 0.8;
export const TORCH_FLICKER_AMOUNT = CAMPFIRE_FLICKER_AMOUNT * 0.7;
export const TORCH_LIGHT_INNER_COLOR = 'rgba(255, 200, 100, 0.28)'; // Reduced intensity for pitch/tar
export const TORCH_LIGHT_OUTER_COLOR = 'rgba(255, 140, 60, 0.0)';  // Golden orange fade

// --- Lantern Light Constants (focused spot lighting, half the range) ---
export const LANTERN_LIGHT_RADIUS_BASE = CAMPFIRE_LIGHT_RADIUS_BASE * 0.6; // Reduced from 1.2 to 0.6 (half range)
export const LANTERN_FLICKER_AMOUNT = CAMPFIRE_FLICKER_AMOUNT * 0.3; // Much more stable than campfire/torch
export const LANTERN_LIGHT_INNER_COLOR = 'rgba(255, 220, 160, 0.32)'; // Reduced intensity for focused lighting
export const LANTERN_LIGHT_OUTER_COLOR = 'rgba(240, 180, 120, 0.0)'; // Golden amber fade

// --- Furnace Light Constants (industrial metal smelting - bright white-hot to orange gradient) ---
export const FURNACE_LIGHT_RADIUS_BASE = CAMPFIRE_LIGHT_RADIUS_BASE * 0.5; // Focused lighting, doesn't cast far
export const FURNACE_FLICKER_AMOUNT = CAMPFIRE_FLICKER_AMOUNT * 0.6; // More stable than campfire, industrial
export const FURNACE_LIGHT_INNER_COLOR = 'rgba(255, 240, 200, 0.4)'; // Bright white-hot center
export const FURNACE_LIGHT_OUTER_COLOR = 'rgba(255, 120, 40, 0.0)'; // Bright orange fade

// --- Barbecue Light Constants (same as campfire - wood-burning cooking appliance) ---
export const BARBECUE_LIGHT_RADIUS_BASE = CAMPFIRE_LIGHT_RADIUS_BASE; // Same as campfire
export const BARBECUE_FLICKER_AMOUNT = CAMPFIRE_FLICKER_AMOUNT; // Same flicker as campfire
export const BARBECUE_LIGHT_INNER_COLOR = CAMPFIRE_LIGHT_INNER_COLOR; // Same colors as campfire
export const BARBECUE_LIGHT_OUTER_COLOR = CAMPFIRE_LIGHT_OUTER_COLOR; // Same colors as campfire

interface RenderPlayerTorchLightProps {
    ctx: CanvasRenderingContext2D;
    player: SpacetimeDBPlayer;
    activeEquipments: Map<string, SpacetimeDBActiveEquipment>;
    itemDefinitions: Map<string, SpacetimeDBItemDefinition>;
    cameraOffsetX: number;
    cameraOffsetY: number;
    renderPositionX?: number;
    renderPositionY?: number;
    // Indoor light containment - prevents light from spilling outside enclosed buildings
    buildingClusters?: Map<string, BuildingCluster>;
}

export const renderPlayerTorchLight = ({
    ctx,
    player,
    activeEquipments,
    itemDefinitions,
    cameraOffsetX,
    cameraOffsetY,
    renderPositionX,
    renderPositionY,
    buildingClusters,
}: RenderPlayerTorchLightProps) => {
    if (!player.isTorchLit || !player.identity) {
        return; // Not lit or no identity, nothing to render
    }

    const playerIdentityStr = player.identity.toHexString();
    const equipment = activeEquipments.get(playerIdentityStr);

    if (equipment && equipment.equippedItemDefId) {
        const itemDef = itemDefinitions.get(equipment.equippedItemDefId.toString());
        if (itemDef && itemDef.name === "Torch") {
            const lightCenterX = renderPositionX ?? player.positionX;
            const lightCenterY = renderPositionY ?? player.positionY;
            
            // Apply indoor clipping if player is inside an enclosed building
            const restoreClip = applyIndoorClip(ctx, lightCenterX, lightCenterY, cameraOffsetX, cameraOffsetY, buildingClusters);
            
            const lightScreenX = lightCenterX + cameraOffsetX;
            const lightScreenY = lightCenterY + cameraOffsetY;
            const baseFlicker = (Math.random() - 0.5) * 2 * TORCH_FLICKER_AMOUNT;

            // Add subtle asymmetry for more rustic feel
            const asymmetryX = (Math.random() - 0.5) * baseFlicker * 0.3;
            const asymmetryY = (Math.random() - 0.5) * baseFlicker * 0.2;
            const rustixLightX = lightScreenX + asymmetryX;
            const rustixLightY = lightScreenY + asymmetryY;

            // Layer 1: Large ambient glow (pitch/tar burning - golden yellow-orange)
            const ambientRadius = Math.max(0, TORCH_LIGHT_RADIUS_BASE * 2.8 + baseFlicker * 0.4);
            const ambientGradient = ctx.createRadialGradient(
                rustixLightX, rustixLightY, 0,
                rustixLightX, rustixLightY, ambientRadius
            );
            ambientGradient.addColorStop(0, 'rgba(240, 160, 80, 0.04)'); // More natural pitch/tar golden
            ambientGradient.addColorStop(0.3, 'rgba(220, 130, 60, 0.025)'); // Warmer natural orange
            ambientGradient.addColorStop(1, 'rgba(200, 100, 40, 0)'); // Natural golden fade
            
            ctx.fillStyle = ambientGradient;
            ctx.beginPath();
            ctx.arc(rustixLightX, rustixLightY, ambientRadius, 0, Math.PI * 2);
            ctx.fill();

            // Layer 2: Main illumination (pitch/tar characteristic glow)
            const mainRadius = Math.max(0, TORCH_LIGHT_RADIUS_BASE * 1.8 + baseFlicker * 0.8);
            const mainGradient = ctx.createRadialGradient(
                rustixLightX, rustixLightY, 0,
                rustixLightX, rustixLightY, mainRadius
            );
            mainGradient.addColorStop(0, 'rgba(240, 200, 120, 0.16)'); // Natural pitch/tar golden
            mainGradient.addColorStop(0.2, 'rgba(230, 170, 90, 0.13)'); // Rich natural amber
            mainGradient.addColorStop(0.5, 'rgba(220, 140, 70, 0.08)'); // Warm natural orange
            mainGradient.addColorStop(0.8, 'rgba(210, 120, 50, 0.04)'); // Natural golden orange
            mainGradient.addColorStop(1, 'rgba(190, 100, 40, 0)'); // Natural golden fade
            
            ctx.fillStyle = mainGradient;
            ctx.beginPath();
            ctx.arc(rustixLightX, rustixLightY, mainRadius, 0, Math.PI * 2);
            ctx.fill();

            // Layer 3: Core bright light (pitch/tar flame center)
            const coreRadius = Math.max(0, TORCH_LIGHT_RADIUS_BASE * 0.5 + baseFlicker * 1.2);
            const coreGradient = ctx.createRadialGradient(
                rustixLightX, rustixLightY, 0,
                rustixLightX, rustixLightY, coreRadius
            );
            coreGradient.addColorStop(0, 'rgba(245, 220, 160, 0.24)'); // Natural pitch/tar flame center
            coreGradient.addColorStop(0.4, 'rgba(235, 190, 110, 0.16)'); // Natural golden yellow
            coreGradient.addColorStop(1, 'rgba(220, 150, 80, 0)'); // Natural golden fade
            
            ctx.fillStyle = coreGradient;
            ctx.beginPath();
            ctx.arc(lightScreenX, lightScreenY, coreRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // Restore context if we applied a clip
            if (restoreClip) restoreClip();
        }
    }
}; 

// --- Headlamp Light Constants (tallow-based fire light, twice as bright as torch with fire-like flicker) ---
export const HEADLAMP_LIGHT_RADIUS_BASE = TORCH_LIGHT_RADIUS_BASE * 2.0; // Twice as bright as torch
export const HEADLAMP_FLICKER_AMOUNT = TORCH_FLICKER_AMOUNT * 1.2; // More flicker for fire-like effect (tallow burning)

interface RenderPlayerHeadlampLightProps {
    ctx: CanvasRenderingContext2D;
    player: SpacetimeDBPlayer;
    cameraOffsetX: number;
    cameraOffsetY: number;
    renderPositionX?: number;
    renderPositionY?: number;
    // Indoor light containment - prevents light from spilling outside enclosed buildings
    buildingClusters?: Map<string, BuildingCluster>;
}

/**
 * Renders fire-like light for the headlamp (tallow-burning head lamp)
 * Similar to torch but positioned at player center (head), with good coverage radius
 */
export const renderPlayerHeadlampLight = ({
    ctx,
    player,
    cameraOffsetX,
    cameraOffsetY,
    renderPositionX,
    renderPositionY,
    buildingClusters,
}: RenderPlayerHeadlampLightProps) => {
    if (!player.isHeadlampLit || !player.identity) {
        return; // Not lit or no identity, nothing to render
    }

    const lightCenterX = renderPositionX ?? player.positionX;
    const lightCenterY = renderPositionY ?? player.positionY;
    
    // Apply indoor clipping if player is inside an enclosed building
    const restoreClip = applyIndoorClip(ctx, lightCenterX, lightCenterY, cameraOffsetX, cameraOffsetY, buildingClusters);
    
    const lightScreenX = lightCenterX + cameraOffsetX;
    const lightScreenY = lightCenterY + cameraOffsetY;
    const baseFlicker = (Math.random() - 0.5) * 2 * HEADLAMP_FLICKER_AMOUNT;

    // Add subtle asymmetry for more rustic feel (same as torch)
    const asymmetryX = (Math.random() - 0.5) * baseFlicker * 0.3;
    const asymmetryY = (Math.random() - 0.5) * baseFlicker * 0.2;
    const rustixLightX = lightScreenX + asymmetryX;
    const rustixLightY = lightScreenY + asymmetryY;

    // Layer 1: Large ambient glow (pitch/tar burning - golden yellow-orange) - same style as torch, scaled up
    const ambientRadius = Math.max(0, HEADLAMP_LIGHT_RADIUS_BASE * 2.8 + baseFlicker * 0.4);
    const ambientGradient = ctx.createRadialGradient(
        rustixLightX, rustixLightY, 0,
        rustixLightX, rustixLightY, ambientRadius
    );
    ambientGradient.addColorStop(0, 'rgba(240, 160, 80, 0.04)'); // More natural pitch/tar golden
    ambientGradient.addColorStop(0.3, 'rgba(220, 130, 60, 0.025)'); // Warmer natural orange
    ambientGradient.addColorStop(1, 'rgba(200, 100, 40, 0)'); // Natural golden fade
    
    ctx.fillStyle = ambientGradient;
    ctx.beginPath();
    ctx.arc(rustixLightX, rustixLightY, ambientRadius, 0, Math.PI * 2);
    ctx.fill();

    // Layer 2: Main illumination (pitch/tar characteristic glow) - same style as torch, scaled up
    const mainRadius = Math.max(0, HEADLAMP_LIGHT_RADIUS_BASE * 1.8 + baseFlicker * 0.8);
    const mainGradient = ctx.createRadialGradient(
        rustixLightX, rustixLightY, 0,
        rustixLightX, rustixLightY, mainRadius
    );
    mainGradient.addColorStop(0, 'rgba(240, 200, 120, 0.16)'); // Natural pitch/tar golden
    mainGradient.addColorStop(0.2, 'rgba(230, 170, 90, 0.13)'); // Rich natural amber
    mainGradient.addColorStop(0.5, 'rgba(220, 140, 70, 0.08)'); // Warm natural orange
    mainGradient.addColorStop(0.8, 'rgba(210, 120, 50, 0.04)'); // Natural golden orange
    mainGradient.addColorStop(1, 'rgba(190, 100, 40, 0)'); // Natural golden fade
    
    ctx.fillStyle = mainGradient;
    ctx.beginPath();
    ctx.arc(rustixLightX, rustixLightY, mainRadius, 0, Math.PI * 2);
    ctx.fill();

    // Layer 3: Core bright light (pitch/tar flame center) - same style as torch, scaled up
    const coreRadius = Math.max(0, HEADLAMP_LIGHT_RADIUS_BASE * 0.5 + baseFlicker * 1.2);
    const coreGradient = ctx.createRadialGradient(
        rustixLightX, rustixLightY, 0,
        rustixLightX, rustixLightY, coreRadius
    );
    coreGradient.addColorStop(0, 'rgba(245, 220, 160, 0.24)'); // Natural pitch/tar flame center
    coreGradient.addColorStop(0.4, 'rgba(235, 190, 110, 0.16)'); // Natural golden yellow
    coreGradient.addColorStop(1, 'rgba(220, 150, 80, 0)'); // Natural golden fade
    
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX, lightScreenY, coreRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Restore context if we applied a clip
    if (restoreClip) restoreClip();
};

// --- Flashlight Light Constants (AAA pixel art style - narrow, long beam) ---
export const FLASHLIGHT_BEAM_LENGTH = 650; // Very long reach for exploration
export const FLASHLIGHT_BEAM_ANGLE = Math.PI / 7; // ~25 degrees - narrow focused beam
export const FLASHLIGHT_START_OFFSET = 18; // Start beam slightly ahead of player

interface RenderPlayerFlashlightLightProps {
    ctx: CanvasRenderingContext2D;
    player: SpacetimeDBPlayer;
    activeEquipments: Map<string, SpacetimeDBActiveEquipment>;
    itemDefinitions: Map<string, SpacetimeDBItemDefinition>;
    cameraOffsetX: number;
    cameraOffsetY: number;
    renderPositionX?: number;
    renderPositionY?: number;
    // Indoor light containment - prevents light from spilling outside enclosed buildings
    buildingClusters?: Map<string, BuildingCluster>;
    // Mouse target position for smooth 360° aiming (local player only)
    targetWorldX?: number | null;
    targetWorldY?: number | null;
}

export const renderPlayerFlashlightLight = ({
    ctx,
    player,
    activeEquipments,
    itemDefinitions,
    cameraOffsetX,
    cameraOffsetY,
    renderPositionX,
    renderPositionY,
    buildingClusters,
    targetWorldX,
    targetWorldY,
}: RenderPlayerFlashlightLightProps) => {
    if (!player.isFlashlightOn || !player.identity) {
        return; // Not on or no identity, nothing to render
    }

    const playerIdentityStr = player.identity.toHexString();
    const equipment = activeEquipments.get(playerIdentityStr);

    if (equipment && equipment.equippedItemDefId) {
        const itemDef = itemDefinitions.get(equipment.equippedItemDefId.toString());
        if (itemDef && itemDef.name === "Flashlight") {
            const lightCenterX = renderPositionX ?? player.positionX;
            const lightCenterY = renderPositionY ?? player.positionY;
            
            // Apply indoor clipping if player is inside an enclosed building
            const restoreClip = applyIndoorClip(ctx, lightCenterX, lightCenterY, cameraOffsetX, cameraOffsetY, buildingClusters);

            // Determine beam direction - use mouse target for local player, synced angle for remote players
            let beamAngle = 0;
            if (targetWorldX !== undefined && targetWorldX !== null && 
                targetWorldY !== undefined && targetWorldY !== null) {
                // Calculate angle from player to mouse for smooth 360° aiming (local player)
                const dx = targetWorldX - lightCenterX;
                const dy = targetWorldY - lightCenterY;
                beamAngle = Math.atan2(dy, dx);
            } else {
                // Use synced flashlight aim angle for remote players
                beamAngle = player.flashlightAimAngle ?? 0;
            }

            // Offset the beam start position slightly ahead of the player
            const offsetX = Math.cos(beamAngle) * FLASHLIGHT_START_OFFSET;
            const offsetY = Math.sin(beamAngle) * FLASHLIGHT_START_OFFSET;
            
            const lightScreenX = lightCenterX + cameraOffsetX + offsetX;
            const lightScreenY = lightCenterY + cameraOffsetY + offsetY;

            // Calculate cone vertices - narrow, long beam
            const startX = lightScreenX;
            const startY = lightScreenY;
            const endX = startX + Math.cos(beamAngle) * FLASHLIGHT_BEAM_LENGTH;
            const endY = startY + Math.sin(beamAngle) * FLASHLIGHT_BEAM_LENGTH;
            
            // Calculate cone width at the end (half-width) - narrow cone
            const halfWidth = FLASHLIGHT_BEAM_LENGTH * Math.tan(FLASHLIGHT_BEAM_ANGLE / 2);
            
            // Perpendicular vector for cone width
            const perpX = -Math.sin(beamAngle) * halfWidth;
            const perpY = Math.cos(beamAngle) * halfWidth;
            
            const leftX = endX + perpX;
            const leftY = endY + perpY;
            const rightX = endX - perpX;
            const rightY = endY - perpY;

            // === SIMPLIFIED FUNCTIONAL FLASHLIGHT ===
            // Main beam cone - clean cutout with soft edges
            const mainGradient = ctx.createLinearGradient(startX, startY, endX, endY);
            mainGradient.addColorStop(0, 'rgba(255, 255, 255, 0.45)'); // Bright white at source
            mainGradient.addColorStop(0.3, 'rgba(250, 250, 250, 0.35)');
            mainGradient.addColorStop(0.6, 'rgba(245, 245, 245, 0.22)');
            mainGradient.addColorStop(0.85, 'rgba(240, 240, 240, 0.10)');
            mainGradient.addColorStop(1, 'rgba(235, 235, 235, 0)'); // Soft fade at end

            ctx.fillStyle = mainGradient;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(leftX, leftY);
            ctx.lineTo(rightX, rightY);
            ctx.closePath();
            ctx.fill();

            // === DUST PARTICLES IN BEAM ===
            // Subtle floating particles to show the beam volume
            const numParticles = 12;
            const time = Date.now() * 0.0005; // Slow animation
            
            ctx.save();
            ctx.globalAlpha = 0.3;
            
            for (let i = 0; i < numParticles; i++) {
                // Distribute particles along the beam
                const t = (i / numParticles) + (Math.sin(time + i * 0.5) * 0.1); // Slight drift
                const distance = FLASHLIGHT_BEAM_LENGTH * Math.max(0.1, Math.min(0.9, t));
                
                // Position along beam center
                const particleX = startX + Math.cos(beamAngle) * distance;
                const particleY = startY + Math.sin(beamAngle) * distance;
                
                // Add slight perpendicular offset (particles drift across beam)
                const driftOffset = Math.sin(time * 2 + i * 1.3) * halfWidth * (distance / FLASHLIGHT_BEAM_LENGTH) * 0.6;
                const finalX = particleX + (-Math.sin(beamAngle) * driftOffset);
                const finalY = particleY + (Math.cos(beamAngle) * driftOffset);
                
                // Particle size decreases with distance
                const baseSize = 1.5;
                const sizeFade = 1.0 - (distance / FLASHLIGHT_BEAM_LENGTH) * 0.5;
                const particleSize = baseSize * sizeFade;
                
                // Brightness flicker
                const flicker = 0.7 + Math.sin(time * 3 + i * 2.1) * 0.3;
                
                ctx.fillStyle = `rgba(255, 255, 255, ${flicker})`;
                ctx.beginPath();
                ctx.arc(finalX, finalY, particleSize, 0, Math.PI * 2);
                ctx.fill();
            }
            
            ctx.restore();

            // === SOFT EDGE GLOW (subtle halo around beam edges) ===
            const edgeGlowWidth = halfWidth * 1.2;
            const edgeLeftX = endX + (-Math.sin(beamAngle) * edgeGlowWidth);
            const edgeLeftY = endY + (Math.cos(beamAngle) * edgeGlowWidth);
            const edgeRightX = endX - (-Math.sin(beamAngle) * edgeGlowWidth);
            const edgeRightY = endY - (Math.cos(beamAngle) * edgeGlowWidth);

            const edgeGradient = ctx.createLinearGradient(startX, startY, endX, endY);
            edgeGradient.addColorStop(0, 'rgba(240, 245, 255, 0.12)'); // Soft blue-white glow
            edgeGradient.addColorStop(0.5, 'rgba(230, 240, 255, 0.06)');
            edgeGradient.addColorStop(1, 'rgba(220, 235, 250, 0)');

            ctx.fillStyle = edgeGradient;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(edgeLeftX, edgeLeftY);
            ctx.lineTo(edgeRightX, edgeRightY);
            ctx.closePath();
            ctx.fill();

            // === BRIGHT HOTSPOT AT SOURCE ===
            const hotspotRadius = 15;
            const hotspotGradient = ctx.createRadialGradient(
                startX, startY, 0,
                startX, startY, hotspotRadius
            );
            hotspotGradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
            hotspotGradient.addColorStop(0.5, 'rgba(255, 252, 245, 0.4)');
            hotspotGradient.addColorStop(1, 'rgba(245, 243, 235, 0)');

            ctx.fillStyle = hotspotGradient;
            ctx.beginPath();
            ctx.arc(startX, startY, hotspotRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // Restore context if we applied a clip
            if (restoreClip) restoreClip();
        }
    }
}; 

// --- Campfire Light Rendering ---
interface RenderCampfireLightProps {
    ctx: CanvasRenderingContext2D;
    campfire: SpacetimeDBCampfire;
    cameraOffsetX: number;
    cameraOffsetY: number;
    // Indoor light containment - prevents light from spilling outside enclosed buildings
    buildingClusters?: Map<string, BuildingCluster>;
}

export const renderCampfireLight = ({
    ctx,
    campfire,
    cameraOffsetX,
    cameraOffsetY,
    buildingClusters,
}: RenderCampfireLightProps) => {
    if (!campfire.isBurning) {
        return; // Not burning, no light
    }

    // Apply indoor clipping if campfire is inside an enclosed building
    const restoreClip = applyIndoorClip(ctx, campfire.posX, campfire.posY, cameraOffsetX, cameraOffsetY, buildingClusters);

    const visualCenterX = campfire.posX;
    const visualCenterY = campfire.posY - (CAMPFIRE_HEIGHT / 2) - CAMPFIRE_RENDER_Y_OFFSET;
    
    const lightScreenX = visualCenterX + cameraOffsetX;
    const lightScreenY = visualCenterY + cameraOffsetY;
    const baseFlicker = (Math.random() - 0.5) * 2 * CAMPFIRE_FLICKER_AMOUNT;

    // Add more pronounced asymmetry for crackling campfire effect
    const campfireAsymmetryX = (Math.random() - 0.5) * baseFlicker * 0.6;
    const campfireAsymmetryY = (Math.random() - 0.5) * baseFlicker * 0.4;
    const rusticCampfireX = lightScreenX + campfireAsymmetryX;
    const rusticCampfireY = lightScreenY + campfireAsymmetryY;

    // CAMPFIRE LIGHTING SYSTEM - Balanced scale for natural rustic feel
    const CAMPFIRE_SCALE = 1.5; // Reduced from 2.0 to 1.5 for more natural lighting

    // Layer 1: Large ambient glow (wood-burning campfire - deep oranges and reds)
    const ambientRadius = Math.max(0, CAMPFIRE_LIGHT_RADIUS_BASE * 3.9 * CAMPFIRE_SCALE + baseFlicker * 0.3);
    const ambientGradient = ctx.createRadialGradient(
        rusticCampfireX, rusticCampfireY, 0,
        rusticCampfireX, rusticCampfireY, ambientRadius
    );
    ambientGradient.addColorStop(0, 'rgba(220, 70, 20, 0.04)'); // Natural campfire orange-red
    ambientGradient.addColorStop(0.25, 'rgba(180, 55, 15, 0.025)'); // Natural ember red
    ambientGradient.addColorStop(0.7, 'rgba(140, 35, 12, 0.012)'); // Natural wood-burning red
    ambientGradient.addColorStop(1, 'rgba(100, 20, 8, 0)'); // Natural ember fade
    
    ctx.fillStyle = ambientGradient;
    ctx.beginPath();
    ctx.arc(rusticCampfireX, rusticCampfireY, ambientRadius, 0, Math.PI * 2);
    ctx.fill();

    // Layer 2: Main illumination (authentic wood fire colors)
    const mainRadius = Math.max(0, CAMPFIRE_LIGHT_RADIUS_BASE * 2.6 * CAMPFIRE_SCALE + baseFlicker * 1.0);
    const mainGradient = ctx.createRadialGradient(
        rusticCampfireX, rusticCampfireY, 0,
        rusticCampfireX, rusticCampfireY, mainRadius
    );
    mainGradient.addColorStop(0, 'rgba(230, 120, 50, 0.18)'); // Natural campfire orange center
    mainGradient.addColorStop(0.15, 'rgba(210, 90, 25, 0.15)'); // Natural rich orange
    mainGradient.addColorStop(0.4, 'rgba(190, 60, 18, 0.10)'); // Natural orange-red
    mainGradient.addColorStop(0.7, 'rgba(160, 45, 12, 0.05)'); // Natural ember red
    mainGradient.addColorStop(0.9, 'rgba(120, 30, 8, 0.015)'); // Natural wood burning
    mainGradient.addColorStop(1, 'rgba(90, 20, 6, 0)'); // Natural rustic fade
    
    ctx.fillStyle = mainGradient;
    ctx.beginPath();
    ctx.arc(rusticCampfireX, rusticCampfireY, mainRadius, 0, Math.PI * 2);
    ctx.fill();

    // Layer 3: Core bright light (intense campfire flame center) 
    const coreRadius = Math.max(0, CAMPFIRE_LIGHT_RADIUS_BASE * 0.65 * CAMPFIRE_SCALE + baseFlicker * 1.5);
    const coreGradient = ctx.createRadialGradient(
        rusticCampfireX, rusticCampfireY, 0,
        rusticCampfireX, rusticCampfireY, coreRadius
    );
    coreGradient.addColorStop(0, 'rgba(240, 160, 90, 0.26)'); // Natural campfire center
    coreGradient.addColorStop(0.3, 'rgba(220, 110, 35, 0.18)'); // Natural rich orange
    coreGradient.addColorStop(0.7, 'rgba(190, 70, 22, 0.10)'); // Natural orange-red glow
    coreGradient.addColorStop(1, 'rgba(160, 50, 18, 0)'); // Natural rustic fade
    
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX, lightScreenY, coreRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Restore context if we applied a clip
    if (restoreClip) restoreClip();
};

// --- Barbecue Light Rendering ---
interface RenderBarbecueLightProps {
    ctx: CanvasRenderingContext2D;
    barbecue: SpacetimeDBBarbecue;
    cameraOffsetX: number;
    cameraOffsetY: number;
    // Indoor light containment - prevents light from spilling outside enclosed buildings
    buildingClusters?: Map<string, BuildingCluster>;
}

export const renderBarbecueLight = ({
    ctx,
    barbecue,
    cameraOffsetX,
    cameraOffsetY,
    buildingClusters,
}: RenderBarbecueLightProps) => {
    if (!barbecue.isBurning) {
        return; // Not burning, no light
    }

    // Apply indoor clipping if barbecue is inside an enclosed building
    const restoreClip = applyIndoorClip(ctx, barbecue.posX, barbecue.posY, cameraOffsetX, cameraOffsetY, buildingClusters);

    // Sprite is CENTERED on posY, so visual center = posY
    const visualCenterX = barbecue.posX;
    const visualCenterY = barbecue.posY;
    
    const lightScreenX = visualCenterX + cameraOffsetX;
    const lightScreenY = visualCenterY + cameraOffsetY;
    const baseFlicker = (Math.random() - 0.5) * 2 * BARBECUE_FLICKER_AMOUNT;

    // Add more pronounced asymmetry for crackling barbecue effect (same as campfire)
    const barbecueAsymmetryX = (Math.random() - 0.5) * baseFlicker * 0.6;
    const barbecueAsymmetryY = (Math.random() - 0.5) * baseFlicker * 0.4;
    const rusticBarbecueX = lightScreenX + barbecueAsymmetryX;
    const rusticBarbecueY = lightScreenY + barbecueAsymmetryY;

    // BARBECUE LIGHTING SYSTEM - Balanced scale for natural rustic feel (same as campfire)
    const BARBECUE_SCALE = 1.5; // Same as campfire

    // Layer 1: Large ambient glow (wood-burning barbecue - deep oranges and reds)
    const ambientRadius = Math.max(0, BARBECUE_LIGHT_RADIUS_BASE * 3.9 * BARBECUE_SCALE + baseFlicker * 0.3);
    const ambientGradient = ctx.createRadialGradient(
        rusticBarbecueX, rusticBarbecueY, 0,
        rusticBarbecueX, rusticBarbecueY, ambientRadius
    );
    ambientGradient.addColorStop(0, 'rgba(220, 70, 20, 0.04)'); // Natural barbecue orange-red
    ambientGradient.addColorStop(0.25, 'rgba(180, 55, 15, 0.025)'); // Natural ember red
    ambientGradient.addColorStop(0.7, 'rgba(140, 35, 12, 0.012)'); // Natural wood-burning red
    ambientGradient.addColorStop(1, 'rgba(100, 20, 8, 0)'); // Natural ember fade
    
    ctx.fillStyle = ambientGradient;
    ctx.beginPath();
    ctx.arc(rusticBarbecueX, rusticBarbecueY, ambientRadius, 0, Math.PI * 2);
    ctx.fill();

    // Layer 2: Main illumination (authentic wood fire colors)
    const mainRadius = Math.max(0, BARBECUE_LIGHT_RADIUS_BASE * 2.6 * BARBECUE_SCALE + baseFlicker * 1.0);
    const mainGradient = ctx.createRadialGradient(
        rusticBarbecueX, rusticBarbecueY, 0,
        rusticBarbecueX, rusticBarbecueY, mainRadius
    );
    mainGradient.addColorStop(0, 'rgba(230, 120, 50, 0.18)'); // Natural barbecue orange center
    mainGradient.addColorStop(0.15, 'rgba(210, 90, 25, 0.15)'); // Natural rich orange
    mainGradient.addColorStop(0.4, 'rgba(190, 60, 18, 0.10)'); // Natural orange-red
    mainGradient.addColorStop(0.7, 'rgba(160, 45, 12, 0.05)'); // Natural ember red
    mainGradient.addColorStop(0.9, 'rgba(120, 30, 8, 0.015)'); // Natural wood burning
    mainGradient.addColorStop(1, 'rgba(90, 20, 6, 0)'); // Natural rustic fade
    
    ctx.fillStyle = mainGradient;
    ctx.beginPath();
    ctx.arc(rusticBarbecueX, rusticBarbecueY, mainRadius, 0, Math.PI * 2);
    ctx.fill();

    // Layer 3: Core bright light (intense barbecue flame center) 
    const coreRadius = Math.max(0, BARBECUE_LIGHT_RADIUS_BASE * 0.65 * BARBECUE_SCALE + baseFlicker * 1.5);
    const coreGradient = ctx.createRadialGradient(
        rusticBarbecueX, rusticBarbecueY, 0,
        rusticBarbecueX, rusticBarbecueY, coreRadius
    );
    coreGradient.addColorStop(0, 'rgba(240, 160, 90, 0.26)'); // Natural barbecue center
    coreGradient.addColorStop(0.3, 'rgba(220, 110, 35, 0.18)'); // Natural rich orange
    coreGradient.addColorStop(0.7, 'rgba(190, 70, 22, 0.10)'); // Natural orange-red glow
    coreGradient.addColorStop(1, 'rgba(160, 50, 18, 0)'); // Natural rustic fade
    
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX, lightScreenY, coreRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Restore context if we applied a clip
    if (restoreClip) restoreClip();
};

// --- Lantern Light Rendering ---
interface RenderLanternLightProps {
    ctx: CanvasRenderingContext2D;
    lantern: SpacetimeDBLantern;
    cameraOffsetX: number;
    cameraOffsetY: number;
    // Indoor light containment - prevents light from spilling outside enclosed buildings
    buildingClusters?: Map<string, BuildingCluster>;
}

export const renderLanternLight = ({
    ctx,
    lantern,
    cameraOffsetX,
    cameraOffsetY,
    buildingClusters,
}: RenderLanternLightProps) => {
    if (!lantern.isBurning) {
        return; // Not burning, no light
    }

    // Apply indoor clipping if lantern is inside an enclosed building
    const restoreClip = applyIndoorClip(ctx, lantern.posX, lantern.posY, cameraOffsetX, cameraOffsetY, buildingClusters);

    const visualCenterX = lantern.posX;
    const visualCenterY = lantern.posY - (LANTERN_HEIGHT / 2) - LANTERN_RENDER_Y_OFFSET;
    
    const lightScreenX = visualCenterX + cameraOffsetX;
    const lightScreenY = visualCenterY + cameraOffsetY;
    const baseFlicker = (Math.random() - 0.5) * 2 * LANTERN_FLICKER_AMOUNT;

    // Add subtle asymmetry for lantern flame effect (much less than campfire)
    const lanternAsymmetryX = (Math.random() - 0.5) * baseFlicker * 0.2;
    const lanternAsymmetryY = (Math.random() - 0.5) * baseFlicker * 0.1;
    const steadyLanternX = lightScreenX + lanternAsymmetryX;
    const steadyLanternY = lightScreenY + lanternAsymmetryY;

    // FOCUSED LANTERN LIGHTING SYSTEM - spot lighting, natural intensity
    const LANTERN_SCALE = 1.0; // Focused spot lighting, smaller coverage than campfire

    // Layer 1: Large ambient glow (tallow through glass - warm amber, extended reach)
    const ambientRadius = Math.max(0, LANTERN_LIGHT_RADIUS_BASE * 3.5 * LANTERN_SCALE + baseFlicker * 0.1);
    const ambientGradient = ctx.createRadialGradient(
        steadyLanternX, steadyLanternY, 0,
        steadyLanternX, steadyLanternY, ambientRadius
    );
    ambientGradient.addColorStop(0, 'rgba(230, 200, 150, 0.05)'); // Natural tallow amber center
    ambientGradient.addColorStop(0.15, 'rgba(220, 180, 130, 0.04)'); // Natural amber glow
    ambientGradient.addColorStop(0.35, 'rgba(210, 160, 110, 0.035)'); // Natural amber transition
    ambientGradient.addColorStop(0.55, 'rgba(200, 140, 90, 0.03)'); // Natural deep amber
    ambientGradient.addColorStop(0.75, 'rgba(190, 125, 75, 0.02)'); // Natural amber orange
    ambientGradient.addColorStop(0.9, 'rgba(180, 110, 65, 0.015)'); // Natural soft amber
    ambientGradient.addColorStop(1, 'rgba(170, 95, 55, 0)'); // Natural amber fade
    
    ctx.fillStyle = ambientGradient;
    ctx.beginPath();
    ctx.arc(steadyLanternX, steadyLanternY, ambientRadius, 0, Math.PI * 2);
    ctx.fill();

    // Layer 2: Main illumination (tallow flame through glass with smooth transitions)
    const mainRadius = Math.max(0, LANTERN_LIGHT_RADIUS_BASE * 2.2 * LANTERN_SCALE + baseFlicker * 0.3);
    const mainGradient = ctx.createRadialGradient(
        steadyLanternX, steadyLanternY, 0,
        steadyLanternX, steadyLanternY, mainRadius
    );
    mainGradient.addColorStop(0, 'rgba(235, 215, 170, 0.16)'); // Natural tallow center (glass filtered)
    mainGradient.addColorStop(0.12, 'rgba(225, 205, 150, 0.14)'); // Natural amber bright center
    mainGradient.addColorStop(0.25, 'rgba(220, 190, 135, 0.12)'); // Natural rich amber
    mainGradient.addColorStop(0.4, 'rgba(210, 175, 120, 0.11)'); // Natural amber transition
    mainGradient.addColorStop(0.6, 'rgba(200, 160, 105, 0.09)'); // Natural deep amber
    mainGradient.addColorStop(0.8, 'rgba(190, 145, 90, 0.06)'); // Natural amber orange
    mainGradient.addColorStop(0.95, 'rgba(180, 130, 80, 0.03)'); // Natural soft amber
    mainGradient.addColorStop(1, 'rgba(170, 115, 70, 0)'); // Natural amber fade
    
    ctx.fillStyle = mainGradient;
    ctx.beginPath();
    ctx.arc(steadyLanternX, steadyLanternY, mainRadius, 0, Math.PI * 2);
    ctx.fill();

    // Layer 3: Core bright light (tallow flame center through glass with reduced glare) 
    const coreRadius = Math.max(0, LANTERN_LIGHT_RADIUS_BASE * 0.9 * LANTERN_SCALE + baseFlicker * 0.8);
    const coreGradient = ctx.createRadialGradient(
        steadyLanternX, steadyLanternY, 0,
        steadyLanternX, steadyLanternY, coreRadius
    );
    coreGradient.addColorStop(0, 'rgba(240, 220, 180, 0.20)'); // Natural tallow core (glass diffused)
    coreGradient.addColorStop(0.15, 'rgba(230, 210, 160, 0.18)'); // Natural amber bright core
    coreGradient.addColorStop(0.3, 'rgba(225, 200, 145, 0.16)'); // Natural rich amber
    coreGradient.addColorStop(0.5, 'rgba(215, 185, 130, 0.14)'); // Natural deep amber
    coreGradient.addColorStop(0.7, 'rgba(205, 170, 115, 0.11)'); // Natural amber transition
    coreGradient.addColorStop(0.85, 'rgba(195, 155, 100, 0.07)'); // Natural warm amber
    coreGradient.addColorStop(1, 'rgba(185, 140, 85, 0)'); // Natural amber fade
    
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(lightScreenX, lightScreenY, coreRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Restore context if we applied a clip
    if (restoreClip) restoreClip();
};

// --- Furnace Light Rendering ---
interface RenderFurnaceLightProps {
    ctx: CanvasRenderingContext2D;
    furnace: SpacetimeDBFurnace;
    cameraOffsetX: number;
    cameraOffsetY: number;
    // Indoor light containment - prevents light from spilling outside enclosed buildings
    buildingClusters?: Map<string, BuildingCluster>;
}

export const renderFurnaceLight = ({
    ctx,
    furnace,
    cameraOffsetX,
    cameraOffsetY,
    buildingClusters,
}: RenderFurnaceLightProps) => {
    if (!furnace.isBurning) {
        return; // Not burning, no light
    }

    // Apply indoor clipping if furnace is inside an enclosed building
    const restoreClip = applyIndoorClip(ctx, furnace.posX, furnace.posY, cameraOffsetX, cameraOffsetY, buildingClusters);

    const visualCenterX = furnace.posX;
    const visualCenterY = furnace.posY - (FURNACE_HEIGHT / 2) - FURNACE_RENDER_Y_OFFSET;
    
    const lightScreenX = visualCenterX + cameraOffsetX;
    const lightScreenY = visualCenterY + cameraOffsetY;
    const baseFlicker = (Math.random() - 0.5) * 2 * FURNACE_FLICKER_AMOUNT;

    // Add industrial asymmetry for furnace forge effect
    const furnaceAsymmetryX = (Math.random() - 0.5) * baseFlicker * 0.4;
    const furnaceAsymmetryY = (Math.random() - 0.5) * baseFlicker * 0.3;
    const industrialFurnaceX = lightScreenX + furnaceAsymmetryX;
    const industrialFurnaceY = lightScreenY + furnaceAsymmetryY;

    // INDUSTRIAL FURNACE LIGHTING SYSTEM - realistic high-temperature metal smelting
    const FURNACE_SCALE = 1.0; // Focused lighting that doesn't cast far

    // Layer 1: Large ambient glow (hot furnace - bright orange ambient heat)
    const ambientRadius = Math.max(0, FURNACE_LIGHT_RADIUS_BASE * 3.5 * FURNACE_SCALE + baseFlicker * 0.3);
    const ambientGradient = ctx.createRadialGradient(
        industrialFurnaceX, industrialFurnaceY, 0,
        industrialFurnaceX, industrialFurnaceY, ambientRadius
    );
    ambientGradient.addColorStop(0, 'rgba(255, 180, 100, 0.06)'); // Bright orange ambient heat
    ambientGradient.addColorStop(0.2, 'rgba(255, 160, 80, 0.05)'); // Warm orange glow
    ambientGradient.addColorStop(0.4, 'rgba(255, 140, 60, 0.04)'); // Deep orange
    ambientGradient.addColorStop(0.6, 'rgba(255, 120, 50, 0.03)'); // Rich orange
    ambientGradient.addColorStop(0.8, 'rgba(255, 100, 40, 0.02)'); // Bright orange fade
    ambientGradient.addColorStop(1, 'rgba(255, 80, 30, 0)'); // Orange fade to transparent
    
    ctx.fillStyle = ambientGradient;
    ctx.beginPath();
    ctx.arc(industrialFurnaceX, industrialFurnaceY, ambientRadius, 0, Math.PI * 2);
    ctx.fill();

    // Layer 2: Main illumination (bright yellow-orange furnace heat)
    const mainRadius = Math.max(0, FURNACE_LIGHT_RADIUS_BASE * 2.4 * FURNACE_SCALE + baseFlicker * 0.8);
    const mainGradient = ctx.createRadialGradient(
        industrialFurnaceX, industrialFurnaceY, 0,
        industrialFurnaceX, industrialFurnaceY, mainRadius
    );
    mainGradient.addColorStop(0, 'rgba(255, 220, 140, 0.15)'); // Bright yellow-orange center
    mainGradient.addColorStop(0.15, 'rgba(255, 200, 120, 0.13)'); // Warm yellow-orange
    mainGradient.addColorStop(0.3, 'rgba(255, 180, 100, 0.12)'); // Rich orange-yellow
    mainGradient.addColorStop(0.5, 'rgba(255, 160, 80, 0.10)'); // Deep orange
    mainGradient.addColorStop(0.7, 'rgba(255, 140, 70, 0.08)'); // Orange heat
    mainGradient.addColorStop(0.85, 'rgba(255, 120, 60, 0.06)'); // Warm orange
    mainGradient.addColorStop(1, 'rgba(255, 100, 50, 0)'); // Orange fade
    
    ctx.fillStyle = mainGradient;
    ctx.beginPath();
    ctx.arc(industrialFurnaceX, industrialFurnaceY, mainRadius, 0, Math.PI * 2);
    ctx.fill();

    // Restore context if we applied a clip
    if (restoreClip) restoreClip();
};