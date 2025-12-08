/**
 * buildingRestrictionOverlayUtils.ts
 * 
 * Reusable utility for rendering building restriction zones around monuments
 * Shows a red transparent overlay with border when Blueprint is equipped
 */

/**
 * Configuration for a building restriction zone
 */
export interface BuildingRestrictionZoneConfig {
    /** Center X position of the zone */
    centerX: number;
    /** Center Y position of the zone */
    centerY: number;
    /** Radius of the restriction zone in pixels */
    radius: number;
}

/**
 * Visual style configuration for the overlay
 */
export interface BuildingRestrictionOverlayStyle {
    /** Fill color with alpha (default: red transparent) */
    fillColor?: string;
    /** Border color with alpha (default: red opaque) */
    borderColor?: string;
    /** Inner border color with alpha (default: lighter red) */
    innerBorderColor?: string;
    /** Border width in pixels (default: 3) */
    borderWidth?: number;
    /** Inner border width in pixels (default: 1) */
    innerBorderWidth?: number;
}

const DEFAULT_STYLE: Required<BuildingRestrictionOverlayStyle> = {
    fillColor: 'rgba(255, 0, 0, 0.15)',
    borderColor: 'rgba(255, 0, 0, 0.8)',
    innerBorderColor: 'rgba(255, 100, 100, 0.6)',
    borderWidth: 3,
    innerBorderWidth: 1,
};

/**
 * Render a building restriction zone overlay
 * Displays a red transparent circle with border indicating where building is restricted
 * 
 * @param ctx Canvas rendering context
 * @param config Zone configuration (center position and radius)
 * @param style Optional style overrides
 */
export function renderBuildingRestrictionOverlay(
    ctx: CanvasRenderingContext2D,
    config: BuildingRestrictionZoneConfig,
    style?: BuildingRestrictionOverlayStyle
): void {
    const finalStyle = { ...DEFAULT_STYLE, ...style };
    
    ctx.save();
    
    // Draw filled circle with transparent overlay
    ctx.beginPath();
    ctx.arc(config.centerX, config.centerY, config.radius, 0, Math.PI * 2);
    ctx.fillStyle = finalStyle.fillColor;
    ctx.fill();
    
    // Draw outer border outline
    ctx.beginPath();
    ctx.arc(config.centerX, config.centerY, config.radius, 0, Math.PI * 2);
    ctx.strokeStyle = finalStyle.borderColor;
    ctx.lineWidth = finalStyle.borderWidth;
    ctx.stroke();
    
    // Draw inner border for better visibility
    ctx.beginPath();
    ctx.arc(config.centerX, config.centerY, config.radius - 2, 0, Math.PI * 2);
    ctx.strokeStyle = finalStyle.innerBorderColor;
    ctx.lineWidth = finalStyle.innerBorderWidth;
    ctx.stroke();
    
    ctx.restore();
}

/**
 * Render multiple building restriction zones at once
 * Useful when rendering multiple monuments of the same type
 * 
 * @param ctx Canvas rendering context
 * @param zones Array of zone configurations
 * @param style Optional style overrides (applied to all zones)
 */
export function renderMultipleBuildingRestrictionOverlays(
    ctx: CanvasRenderingContext2D,
    zones: BuildingRestrictionZoneConfig[],
    style?: BuildingRestrictionOverlayStyle
): void {
    zones.forEach(zone => {
        renderBuildingRestrictionOverlay(ctx, zone, style);
    });
}

