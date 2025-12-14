import { gameConfig } from '../../config/gameConfig';
import { WorldTile } from '../../generated/world_tile_type';
import { 
    getDualGridTileInfoMultiLayer, 
    getAllTransitionTilesets, 
    TILE_SIZE as AUTOTILE_SIZE,
    describeDualGridIndex,
    DualGridTileInfo
} from '../dualGridAutotile';

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

        // Load all transition tilesets from Dual Grid config
        const transitionTilesets = getAllTransitionTilesets();
        transitionTilesets.forEach((tilesetPath, transitionKey) => {
            const cacheKey = `transition_${transitionKey}`;
            promises.push(this.loadImage(tilesetPath, cacheKey).catch(() => {
                // Silently ignore missing autotile files - they'll be added later
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
        
        // PASS 1: Render base textures at exact tile positions
        for (let y = startTileY; y < endTileY; y++) {
            for (let x = startTileX; x < endTileX; x++) {
                this.renderBaseTile(ctx, x, y, tileSize, showDebugOverlay);
            }
        }
        
        // PASS 2: Render Dual Grid transitions at half-tile offset positions
        // Start one tile earlier to catch transitions that overlap visible area
        const dualStartX = Math.max(0, startTileX - 1);
        const dualStartY = Math.max(0, startTileY - 1);
        const dualEndX = Math.min(gameConfig.worldWidth - 1, endTileX);
        const dualEndY = Math.min(gameConfig.worldHeight - 1, endTileY);
        
        for (let y = dualStartY; y < dualEndY; y++) {
            for (let x = dualStartX; x < dualEndX; x++) {
                this.renderDualGridTransition(ctx, x, y, tileSize, showDebugOverlay);
            }
        }
    }
    
    /**
     * Render the base texture for a tile at its exact position.
     * This is the first pass - just the solid terrain texture.
     */
    private renderBaseTile(
        ctx: CanvasRenderingContext2D, 
        tileX: number, 
        tileY: number, 
        tileSize: number,
        showDebugOverlay: boolean = false
    ) {
        const tileKey = `${tileX}_${tileY}`;
        const tile = this.tileCache.tiles.get(tileKey);
        
        // Calculate pixel-perfect positions
        const pixelX = Math.floor(tileX * tileSize);
        const pixelY = Math.floor(tileY * tileSize);
        const pixelSize = Math.floor(tileSize) + 1; // Add 1 pixel to eliminate gaps
        
        if (!tile) {
            // Fallback to grass if no tile data
            const grassImg = this.tileCache.images.get('Grass_base');
            if (grassImg && grassImg.complete && grassImg.naturalHeight !== 0) {
                ctx.drawImage(grassImg, pixelX, pixelY, pixelSize, pixelSize);
            } else {
                ctx.fillStyle = '#8FBC8F';
                ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
            }
            return;
        }
        
        const tileTypeName = tile.tileType?.tag;
        if (!tileTypeName) {
            ctx.fillStyle = '#808080';
            ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
            return;
        }
        
        // Render base texture
        const image = this.tileCache.images.get(`${tileTypeName}_base`);
        
        if (image && image.complete && image.naturalHeight !== 0) {
            ctx.drawImage(image, pixelX, pixelY, pixelSize, pixelSize);
        } else {
            // Fallback to solid color
            this.renderFallbackTile(ctx, tile, pixelX, pixelY, pixelSize);
        }
        
        // Debug overlay for base tiles
        if (showDebugOverlay && tileTypeName) {
            const tileTypeAbbr = this.getTileTypeAbbreviation(tileTypeName);
            const textX = pixelX + pixelSize / 2;
            const textY = pixelY + pixelSize / 2;
            
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // White outline for visibility
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.strokeText(tileTypeAbbr, textX, textY);
            
            // Black fill
            ctx.fillStyle = 'black';
            ctx.fillText(tileTypeAbbr, textX, textY);
        }
    }
    
    /**
     * Render Dual Grid transition tile at half-tile offset position.
     * This is the second pass - smooth transitions between terrain types.
     * 
     * In Dual Grid, the rendered tile at (x, y) straddles 4 logical tiles:
     * - TL: (x, y)
     * - TR: (x+1, y)
     * - BL: (x, y+1)
     * - BR: (x+1, y+1)
     * 
     * The rendered tile is drawn at pixel position (x + 0.5, y + 0.5) * tileSize
     */
    private renderDualGridTransition(
        ctx: CanvasRenderingContext2D,
        logicalX: number,
        logicalY: number,
        tileSize: number,
        showDebugOverlay: boolean = false
    ) {
        // Get ALL Dual Grid transition layers (handles 3+ terrain junctions)
        const transitions = getDualGridTileInfoMultiLayer(logicalX, logicalY, this.tileCache.tiles);
        
        // If no transitions needed (all corners same terrain), skip
        if (transitions.length === 0) {
            return;
        }
        
        // Calculate pixel position with half-tile offset
        // The Dual Grid tile renders centered between 4 logical tiles
        const pixelX = Math.floor((logicalX + 0.5) * tileSize);
        const pixelY = Math.floor((logicalY + 0.5) * tileSize);
        const pixelSize = Math.floor(tileSize) + 1;
        
        // Render each transition layer from bottom to top
        for (const tileInfo of transitions) {
            // Get the tileset image for this transition
            const transitionKey = `${tileInfo.primaryTerrain}_${tileInfo.secondaryTerrain}`;
            let tilesetImg = this.tileCache.images.get(`transition_${transitionKey}`);
            
            // Try reversed key if not found
            if (!tilesetImg || !tilesetImg.complete) {
                const reversedKey = `${tileInfo.secondaryTerrain}_${tileInfo.primaryTerrain}`;
                tilesetImg = this.tileCache.images.get(`transition_${reversedKey}`);
            }
            
            // If tileset not found, skip this layer
            if (!tilesetImg || !tilesetImg.complete || tilesetImg.naturalHeight === 0) {
                continue;
            }
            
            // Get sprite coordinates from Dual Grid lookup
            const { spriteCoords, clipCorners } = tileInfo;
            
            const destX = Math.floor(pixelX - pixelSize / 2);
            const destY = Math.floor(pixelY - pixelSize / 2);
            const halfSize = Math.floor(pixelSize / 2);
            
            if (clipCorners && clipCorners.length > 0) {
                // Corner clipping mode: only render specified corners
                // This is used for 3+ terrain junctions where upper layers
                // should only show where their higherTerrain actually exists
                ctx.save();
                
                // Create clipping path for specified corners
                ctx.beginPath();
                for (const corner of clipCorners) {
                    switch (corner) {
                        case 'TL':
                            ctx.rect(destX, destY, halfSize, halfSize);
                            break;
                        case 'TR':
                            ctx.rect(destX + halfSize, destY, halfSize, halfSize);
                            break;
                        case 'BL':
                            ctx.rect(destX, destY + halfSize, halfSize, halfSize);
                            break;
                        case 'BR':
                            ctx.rect(destX + halfSize, destY + halfSize, halfSize, halfSize);
                            break;
                    }
                }
                ctx.clip();
                
                // Draw the full tile (clipping will mask it)
                ctx.drawImage(
                    tilesetImg,
                    Math.floor(spriteCoords.x), Math.floor(spriteCoords.y),
                    Math.floor(spriteCoords.width), Math.floor(spriteCoords.height),
                    destX, destY,
                    Math.floor(pixelSize), Math.floor(pixelSize)
                );
                
                ctx.restore();
            } else {
                // Normal full-tile rendering
                ctx.drawImage(
                    tilesetImg,
                    Math.floor(spriteCoords.x), Math.floor(spriteCoords.y),
                    Math.floor(spriteCoords.width), Math.floor(spriteCoords.height),
                    destX, destY,
                    Math.floor(pixelSize), Math.floor(pixelSize)
                );
            }
        }
        
        // Debug overlay - show info for the TOP layer only
        if (showDebugOverlay && transitions.length > 0) {
            const topLayer = transitions[transitions.length - 1];
            
            ctx.save();
            
            // Draw tile boundary rectangle
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(pixelX - pixelSize/2, pixelY - pixelSize/2, pixelSize, pixelSize);
            
            // Draw dual grid index - large, bold, black with white outline
            ctx.font = 'bold 24px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // White outline for visibility
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 4;
            ctx.strokeText(`${topLayer.dualGridIndex}`, pixelX, pixelY);
            
            // Black fill
            ctx.fillStyle = 'black';
            ctx.fillText(`${topLayer.dualGridIndex}`, pixelX, pixelY);
            
            // Show layer count if multi-layer (L suffix with count)
            if (transitions.length > 1) {
                ctx.font = 'bold 12px monospace';
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.strokeText(`L${transitions.length}`, pixelX + 20, pixelY - 15);
                ctx.fillStyle = 'cyan';
                ctx.fillText(`L${transitions.length}`, pixelX + 20, pixelY - 15);
            }
            
            // Also show if reversed (R suffix)
            if (topLayer.isReversedTileset) {
                ctx.font = 'bold 12px monospace';
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                const rX = transitions.length > 1 ? pixelX - 20 : pixelX + 20;
                ctx.strokeText('R', rX, pixelY - 15);
                ctx.fillStyle = 'red';
                ctx.fillText('R', rX, pixelY - 15);
            }
            
            ctx.restore();
        }
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
            'Alpine': 'AL',
            'TundraGrass': 'TG'
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
                ctx.fillStyle = '#64D4FF';
                break;
            case 'Quarry':
                ctx.fillStyle = '#7A6B5C';
                break;
            case 'Asphalt':
                ctx.fillStyle = '#3C3C3C';
                break;
            case 'Forest':
                ctx.fillStyle = '#2E5E2E';
                break;
            case 'Tundra':
                ctx.fillStyle = '#8B9B7A';
                break;
            case 'Alpine':
                ctx.fillStyle = '#9B9B9B';
                break;
            case 'TundraGrass':
                ctx.fillStyle = '#7A8B6A';
                break;
            default:
                ctx.fillStyle = '#808080';
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
