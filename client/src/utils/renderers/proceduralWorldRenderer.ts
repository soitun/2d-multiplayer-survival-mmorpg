import { gameConfig } from '../../config/gameConfig';
import { WorldTile } from '../../generated/world_tile_type';
import { shouldUseAutotiling, getAutotileSpriteCoords, getDebugTileInfo, AutotileConfig, AUTOTILE_CONFIGS } from '../autotileUtils';

// Helper to get tile base texture path from tile type name
function getTileBaseTexturePath(tileTypeName: string): string {
    const tileNameMap: { [key: string]: string } = {
        'Grass': 'grass.png',
        'Dirt': 'dirt.png',
        'DirtRoad': 'dirtroad.png',
        'Sea': 'sea.png',
        'Beach': 'beach.png',
        'Sand': 'beach.png', // Use beach texture for sand
        'HotSpringWater': 'hotspringwater.png',
        'Quarry': 'quarry.png',
        'Asphalt': 'asphalt.png',
        'Forest': 'forest.png',
        'Tundra': 'tundra.png',
        'Alpine': 'alpine.png',
        'TundraGrass': 'tundragrass.png',
    };
    
    const fileName = tileNameMap[tileTypeName] || 'grass.png';
    return new URL(`../../assets/tiles/new/${fileName}`, import.meta.url).href;
}

interface TileCache {
    tiles: Map<string, WorldTile>;
    images: Map<string, HTMLImageElement>;
    lastUpdate: number;
}

export class ProceduralWorldRenderer {
    private tileCache: TileCache = {
        tiles: new Map(),
        images: new Map(),
        lastUpdate: 0
    };
    
    private animationTime = 0;
    private isInitialized = false;
    
    constructor() {
        this.preloadTileAssets();
    }
    
    private async preloadTileAssets() {
        const promises: Promise<void>[] = [];
        
        // Load base textures for all tile types
        const tileTypes = ['Grass', 'Dirt', 'DirtRoad', 'Sea', 'Beach', 'Sand', 'HotSpringWater', 
                          'Quarry', 'Asphalt', 'Forest', 'Tundra', 'Alpine', 'TundraGrass'];
        
        tileTypes.forEach((tileType) => {
            const texturePath = getTileBaseTexturePath(tileType);
            promises.push(
                this.loadImage(texturePath, `${tileType}_base`)
                    .catch(() => {})
            );
        });

        // Load specific autotile transition images
        // Use AUTOTILE_CONFIGS to get all transition paths dynamically
        Object.entries(AUTOTILE_CONFIGS).forEach(([configKey, config]) => {
            const transitionKey = `transition_${configKey}`;
            // Use the tilesetPath from config (already includes /src/assets/tiles/ prefix)
            promises.push(this.loadImage(config.tilesetPath, transitionKey).catch(() => {
                // Silently ignore missing autotile files - they'll be added later
                // This allows the build to succeed even when image files don't exist yet
            }));
        });
        
        try {
            await Promise.all(promises);
            this.isInitialized = true;
        } catch (error) {
            // Silently handle errors - missing assets will show fallback colors
        }
    }
    
    private loadImage(src: string, key: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.tileCache.images.set(key, img);
                resolve();
            };
            img.onerror = () => {
                reject(new Error(`Failed to load image ${key}`));
            };
            img.src = src;
        });
    }
    
    public updateTileCache(worldTiles: Map<string, WorldTile>) {
        this.tileCache.tiles.clear();
        
        // Convert the worldTiles map to use world coordinates as keys
        worldTiles.forEach((tile) => {
            const tileKey = `${tile.worldX}_${tile.worldY}`;
            this.tileCache.tiles.set(tileKey, tile);
        });
        
        this.tileCache.lastUpdate = Date.now();
    }
    
    public renderProceduralWorld(
        ctx: CanvasRenderingContext2D,
        cameraOffsetX: number,
        cameraOffsetY: number,
        canvasWidth: number,
        canvasHeight: number,
        deltaTime: number,
        showDebugOverlay: boolean = false
    ) {
        if (!this.isInitialized) {
            // Fallback to simple grass color if assets not loaded yet
            ctx.fillStyle = '#8FBC8F';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            return;
        }
        
        // Enable pixel-perfect rendering for crisp autotiles
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
        
        this.animationTime += deltaTime;
        
        const { tileSize } = gameConfig;
        
        // Calculate visible tile range
        const viewMinX = -cameraOffsetX;
        const viewMinY = -cameraOffsetY;
        const viewMaxX = viewMinX + canvasWidth;
        const viewMaxY = viewMinY + canvasHeight;
        
        const startTileX = Math.max(0, Math.floor(viewMinX / tileSize));
        const endTileX = Math.min(gameConfig.worldWidth, Math.ceil(viewMaxX / tileSize));
        const startTileY = Math.max(0, Math.floor(viewMinY / tileSize));
        const endTileY = Math.min(gameConfig.worldHeight, Math.ceil(viewMaxY / tileSize));
        
        // Render tiles
        let tilesRendered = 0;
        for (let y = startTileY; y < endTileY; y++) {
            for (let x = startTileX; x < endTileX; x++) {
                this.renderTileAt(ctx, x, y, tileSize, showDebugOverlay);
                tilesRendered++;
            }
        }
    }
    
    private renderTileAt(
        ctx: CanvasRenderingContext2D, 
        tileX: number, 
        tileY: number, 
        tileSize: number,
        showDebugOverlay: boolean = false
    ) {
        const tileKey = `${tileX}_${tileY}`;
        const tile = this.tileCache.tiles.get(tileKey);
        
        // Calculate pixel-perfect positions - use exact pixel alignment
        const pixelX = Math.floor(tileX * tileSize);
        const pixelY = Math.floor(tileY * tileSize);
        const pixelSize = Math.floor(tileSize) + 1; // Add 1 pixel to eliminate gaps between tiles
        
        if (!tile) {
            // Fallback to grass if no tile data
            const grassImg = this.tileCache.images.get('Grass_base');
            if (grassImg && grassImg.complete && grassImg.naturalHeight !== 0) {
                ctx.drawImage(grassImg, pixelX, pixelY, pixelSize, pixelSize);
            } else {
                // Ultimate fallback - solid color
                ctx.fillStyle = '#8FBC8F';
                ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
            }
            
            // Render tile type abbreviation for missing tiles in debug overlay
            if (showDebugOverlay) {
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                ctx.font = 'bold 12px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const textX = pixelX + pixelSize / 2;
                const textY = pixelY + pixelSize / 2;
                ctx.strokeText('?', textX, textY);
                ctx.fillText('?', textX, textY);
            }
            
            // Disabled excessive logging - was running every frame
            // if (!(window as any).missingTileCount) (window as any).missingTileCount = 0;
            // (window as any).missingTileCount++;
            // if ((window as any).missingTileCount % 50 === 0) {
            //     console.log(`[TILES] ${(window as any).missingTileCount} missing tiles rendered as grass`);
            // }
            return;
        }
        
        // Check if this tile should use autotiling
        // CRITICAL: Always use the tile's actual type from the tile object
        const tileTypeName = tile.tileType?.tag;
        if (!tileTypeName) {
            // Can't determine type, render base texture
            const image = this.getTileImage(tile);
            if (image && image.complete && image.naturalHeight !== 0) {
                ctx.drawImage(image, pixelX, pixelY, pixelSize, pixelSize);
            } else {
                this.renderFallbackTile(ctx, tile, pixelX, pixelY, pixelSize);
            }
            return;
        }
        
        const autotileResult = shouldUseAutotiling(tileTypeName, this.tileCache.tiles, tileX, tileY);
        
        if (autotileResult) {
            // Render autotile (even if image is missing, so debug overlay can show)
            this.renderAutotile(ctx, tile, autotileResult, pixelX, pixelY, pixelSize, showDebugOverlay);
        } else {
            // Render regular tile
            const image = this.getTileImage(tile);
            
            if (image && image.complete && image.naturalHeight !== 0) {
                ctx.drawImage(image, pixelX, pixelY, pixelSize, pixelSize);
            } else {
                // Fallback based on tile type - use solid colors
                this.renderFallbackTile(ctx, tile, pixelX, pixelY, pixelSize);
            }
            
            // Render tile type abbreviation in debug overlay (only for regular tiles, not autotiles)
            if (showDebugOverlay && tileTypeName) {
                const tileTypeAbbr = this.getTileTypeAbbreviation(tileTypeName);
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                ctx.font = 'bold 12px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const textX = pixelX + pixelSize / 2;
                const textY = pixelY + pixelSize / 2;
                ctx.strokeText(tileTypeAbbr, textX, textY);
                ctx.fillText(tileTypeAbbr, textX, textY);
            }
        }
    }
    
    private renderAutotile(
        ctx: CanvasRenderingContext2D,
        tile: WorldTile,
        autotileResult: { config: AutotileConfig; bitmask: number; isSecondaryInterior?: boolean },
        pixelX: number,
        pixelY: number,
        pixelSize: number,
        showDebugOverlay: boolean = false
    ) {
        const tileTypeName = tile.tileType.tag;
        
        // Find which specific transition this autotile config represents
        let transitionKey = '';
        for (const [key, config] of Object.entries(AUTOTILE_CONFIGS)) {
            if (config.primaryType === autotileResult.config.primaryType && 
                config.secondaryType === autotileResult.config.secondaryType &&
                config.tilesetPath === autotileResult.config.tilesetPath) {
                transitionKey = key;
                break;
            }
        }
        
        // Get the specific transition autotile image (no fallback to wrong tileset)
        const autotileImg = this.tileCache.images.get(`transition_${transitionKey}`);
        
        // If autotile image is missing, don't render anything (no fallback to wrong tileset)
        const isMissingTileset = !autotileImg || !autotileImg.complete || autotileImg.naturalHeight === 0;
        
        if (isMissingTileset) {
            // Don't render anything - let the cyberpunk grid background show through
            // (No fill, just skip rendering this tile)
            
            // Render debug overlay for missing tilesets (same format as existing debug overlay)
            if (showDebugOverlay) {
                const debugInfo = getDebugTileInfo(autotileResult.bitmask);
                
                ctx.save();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                
                // Show bitmask number (same format as existing overlay)
                ctx.fillText(
                    `${autotileResult.bitmask}`,
                    Math.floor(pixelX + pixelSize/2), 
                    Math.floor(pixelY + pixelSize/4)
                );
                
                // Show tile index (same format as existing overlay)
                ctx.fillText(
                    `T${debugInfo.tileIndex}`,
                    Math.floor(pixelX + pixelSize/2), 
                    Math.floor(pixelY + pixelSize/2)
                );
                
                // Show row,col (same format as existing overlay)
                ctx.fillText(
                    `${debugInfo.row},${debugInfo.col}`,
                    Math.floor(pixelX + pixelSize/2), 
                    Math.floor(pixelY + 3*pixelSize/4)
                );
                
                ctx.restore();
            }
            return;
        }
        
        // autotileResult.config already contains the correct autotile config
        // No need to look it up again from TILE_ASSETS
        
        // At this point, autotileImg is guaranteed to exist (we returned early if missing)
        if (!autotileImg) {
            return; // Type guard for TypeScript
        }
        
        // Get sprite coordinates from the autotile sheet
        // Pass isSecondaryInterior flag to use row 0 col 0 for Sea/HotSpringWater interior tiles
        const spriteCoords = getAutotileSpriteCoords(
            autotileResult.config, 
            autotileResult.bitmask,
            autotileResult.isSecondaryInterior ?? false
        );
        
        // Debug logging for autotile rendering (enable for debugging)
        // if (false) { // Temporarily disabled
        //     console.log(`[Autotile] ${tileTypeName} at (${tile.worldX}, ${tile.worldY}): ${debugAutotileBitmask(autotileResult.bitmask)}`);
        //     console.log(`[Autotile] Sprite coords:`, spriteCoords);
        //     console.log(`[Autotile] Autotile config:`, autotileConfig);
        //     console.log(`[Autotile] Autotile image dimensions:`, autotileImg.naturalWidth, 'x', autotileImg.naturalHeight);
        // }
        
        // Render the specific sprite from the autotile sheet with pixel-perfect alignment
        // Use exact source dimensions and destination dimensions
        ctx.drawImage(
            autotileImg,
            Math.floor(spriteCoords.x), Math.floor(spriteCoords.y), 
            Math.floor(spriteCoords.width), Math.floor(spriteCoords.height), // Source rectangle (16x16 from autotile sheet)
            Math.floor(pixelX), Math.floor(pixelY), 
            Math.floor(pixelSize), Math.floor(pixelSize) // Destination rectangle (game tile size)
        );
        
        // DEBUG: Draw bitmask and tile info on tile for easy debugging
        if (showDebugOverlay) { // Enable visual debugging
            const debugInfo = getDebugTileInfo(autotileResult.bitmask);
            
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            
            // Show bitmask number
            ctx.fillText(
                `${autotileResult.bitmask}`,
                Math.floor(pixelX + pixelSize/2), 
                Math.floor(pixelY + pixelSize/4)
            );
            
            // Show tile index
            ctx.fillText(
                `T${debugInfo.tileIndex}`,
                Math.floor(pixelX + pixelSize/2), 
                Math.floor(pixelY + pixelSize/2)
            );
            
            // Show row,col  
            ctx.fillText(
                `${debugInfo.row},${debugInfo.col}`,
                Math.floor(pixelX + pixelSize/2), 
                Math.floor(pixelY + 3*pixelSize/4)
            );
            
            ctx.restore();
        }
    }
    
    private getTileImage(tile: WorldTile): HTMLImageElement | null {
        // Handle the tile type (it's a tagged union with a .tag property)
        const tileTypeName = tile.tileType.tag;
        
        // Return base texture (loaded dynamically based on tile type name)
        return this.tileCache.images.get(`${tileTypeName}_base`) || null;
    }
    
    private getTileTypeAbbreviation(tileType: string): string {
        const abbreviations: { [key: string]: string } = {
            'DirtRoad': 'DR',
            'Dirt': 'D',
            'Grass': 'G',
            'Sea': 'S',
            'Beach': 'B',
            'Sand': 'Sa',
            'HotSpringWater': 'HS',
            'Quarry': 'Q',
            'Asphalt': 'AS',
            'Forest': 'F',
            'Tundra': 'TU',
            'Alpine': 'AL'
        };
        return abbreviations[tileType] || tileType.substring(0, 2).toUpperCase();
    }
    
    private renderFallbackTile(
        ctx: CanvasRenderingContext2D, 
        tile: WorldTile, 
        x: number, 
        y: number, 
        size: number
    ) {
        const tileTypeName = tile.tileType.tag;
        
        // Fallback colors based on tile type
        switch (tileTypeName) {
            case 'Grass':
                ctx.fillStyle = '#8FBC8F';
                break;
            case 'Dirt':
                ctx.fillStyle = '#8B7355';
                break;
            case 'DirtRoad':
                ctx.fillStyle = '#6B4E3D';
                break;
            case 'Sea':
                ctx.fillStyle = '#1E90FF';
                break;
            case 'Beach':
                ctx.fillStyle = '#F5DEB3';
                break;
            case 'Sand':
                ctx.fillStyle = '#F4A460';
                break;
            case 'HotSpringWater':
                ctx.fillStyle = '#64D4FF'; // Bright cyan for hot spring water (highly visible!)
                break;
            case 'Quarry':
                ctx.fillStyle = '#7A6B5C'; // Rocky gray-brown
                break;
            case 'Asphalt':
                ctx.fillStyle = '#3C3C3C'; // Dark gray paved
                break;
            case 'Forest':
                ctx.fillStyle = '#2E5E2E'; // Dark green dense forest
                break;
            case 'Tundra':
                ctx.fillStyle = '#8B9B7A'; // Pale mossy green-gray (arctic)
                break;
            case 'Alpine':
                ctx.fillStyle = '#9B9B9B'; // Light gray rocky terrain
                break;
            default:
                ctx.fillStyle = '#808080'; // Gray fallback
        }
        
        ctx.fillRect(x, y, size, size);
    }
    
    public getCacheStats() {
        return {
            tileCount: this.tileCache.tiles.size,
            imageCount: this.tileCache.images.size,
            lastUpdate: this.tileCache.lastUpdate,
            initialized: this.isInitialized
        };
    }
}