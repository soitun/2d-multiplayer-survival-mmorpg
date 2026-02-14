/**
 * Tile Doodad Renderer
 * 
 * Renders deterministic decorative doodads on tile centers based on tile type.
 * Uses position-based hashing for consistent rendering across all clients.
 */

import { gameConfig } from '../../config/gameConfig';
import { WorldTile } from '../../generated/world_tile_type';
import { getDualGridTileInfoMultiLayer } from '../dualGridAutotile';

// ============================================================================
// Configuration Types
// ============================================================================

interface DoodadConfig {
    folder: string;
    spawnRate: number;  // 0.0 to 1.0 (e.g., 0.10 = 10%)
    /** When snorkeling, only underwater doodads are shown. When not snorkeling, underwater doodads render with a "viewing through water" effect. */
    isUnderwaterOnly?: boolean;
}

// ============================================================================
// Tile Type to Doodad Configuration Mapping
// ============================================================================

const TILE_DOODAD_CONFIG: Record<string, DoodadConfig> = {
    'Grass':       { folder: 'grass',        spawnRate: 0.03 },  // Reduced: existing grass entities provide coverage
    'Tundra':      { folder: 'tundra',       spawnRate: 0.04 },  // Sparse for arctic feel
    'Beach':       { folder: 'beach',        spawnRate: 0.04 },  // Light scatter of shells/debris
    'Sea':         { folder: 'underwater',   spawnRate: 0.08, isUnderwaterOnly: true },  // Visible always; blur effect when viewed from above
    'Alpine':      { folder: 'alpine',       spawnRate: 0.03 },  // Rocky areas mostly bare
    'TundraGrass': { folder: 'tundra_grass', spawnRate: 0.05 },  // Similar to grass
    'Forest':      { folder: 'forest',       spawnRate: 0.05 },  // Trees provide visual interest
    'DirtRoad':    { folder: 'dirt_road',    spawnRate: 0.02 },  // Roads should be mostly clear
    'Dirt':        { folder: 'dirt',         spawnRate: 0.04 },  // Dirt looks relatively bare
};

// ============================================================================
// Deterministic Hash Function
// ============================================================================

/**
 * Generates a deterministic hash from tile coordinates.
 * Uses different salts to get independent random values for different purposes.
 * 
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate  
 * @param salt - Optional salt for generating different hash sequences
 * @returns Positive 32-bit integer hash value
 */
function hashPosition(x: number, y: number, salt: number = 0): number {
    // Mix coordinates with large primes for good distribution
    const h = ((x + salt) * 374761393 + y * 668265263) ^ (x * 1013904223);
    // Ensure positive 32-bit integer using unsigned right shift
    return Math.abs(h) >>> 0;
}

// ============================================================================
// Dynamic Image Loading via Vite's import.meta.glob
// ============================================================================

// Import all doodad images from each folder
// Vite will resolve these at build time and create proper asset URLs
const grassImages = import.meta.glob<{ default: string }>(
    '../../assets/environment/tile_object/grass/*.png',
    { eager: true }
);

const tundraImages = import.meta.glob<{ default: string }>(
    '../../assets/environment/tile_object/tundra/*.png',
    { eager: true }
);

const beachImages = import.meta.glob<{ default: string }>(
    '../../assets/environment/tile_object/beach/*.png',
    { eager: true }
);

const underwaterImages = import.meta.glob<{ default: string }>(
    '../../assets/environment/tile_object/underwater/*.png',
    { eager: true }
);

const alpineImages = import.meta.glob<{ default: string }>(
    '../../assets/environment/tile_object/alpine/*.png',
    { eager: true }
);

const tundraGrassImages = import.meta.glob<{ default: string }>(
    '../../assets/environment/tile_object/tundra_grass/*.png',
    { eager: true }
);

const forestImages = import.meta.glob<{ default: string }>(
    '../../assets/environment/tile_object/forest/*.png',
    { eager: true }
);

const dirtRoadImages = import.meta.glob<{ default: string }>(
    '../../assets/environment/tile_object/dirt_road/*.png',
    { eager: true }
);

const dirtImages = import.meta.glob<{ default: string }>(
    '../../assets/environment/tile_object/dirt/*.png',
    { eager: true }
);

// Map folder names to their glob imports
const FOLDER_TO_GLOB: Record<string, Record<string, { default: string }>> = {
    'grass': grassImages,
    'tundra': tundraImages,
    'beach': beachImages,
    'underwater': underwaterImages,
    'alpine': alpineImages,
    'tundra_grass': tundraGrassImages,
    'forest': forestImages,
    'dirt_road': dirtRoadImages,
    'dirt': dirtImages,
};

// ============================================================================
// Tile Doodad Renderer Class
// ============================================================================

export class TileDoodadRenderer {
    // Cache of loaded HTMLImageElement objects per folder
    private imageCache: Map<string, HTMLImageElement[]> = new Map();
    
    // Tracks initialization state
    private isInitialized = false;
    
    // Track which folders have no images (to avoid repeated warnings)
    private emptyFolders: Set<string> = new Set();
    
    constructor() {
        this.preloadAllImages();
    }
    
    /**
     * Preload all doodad images from all configured folders
     */
    private async preloadAllImages(): Promise<void> {
        const loadPromises: Promise<void>[] = [];
        
        for (const [folder, globResult] of Object.entries(FOLDER_TO_GLOB)) {
            const imagePaths = Object.values(globResult).map(module => module.default);
            
            if (imagePaths.length === 0) {
                this.emptyFolders.add(folder);
                continue;
            }
            
            const folderImages: HTMLImageElement[] = [];
            
            for (const imagePath of imagePaths) {
                const promise = this.loadImage(imagePath).then(img => {
                    if (img) {
                        folderImages.push(img);
                    }
                });
                loadPromises.push(promise);
            }
            
            this.imageCache.set(folder, folderImages);
        }
        
        try {
            await Promise.all(loadPromises);
            this.isInitialized = true;
            
            // Log loaded images count per folder
            for (const [folder, images] of this.imageCache.entries()) {
                if (images.length > 0) {
                    console.log(`[TileDoodadRenderer] Loaded ${images.length} doodads for folder: ${folder}`);
                }
            }
        } catch (error) {
            console.error('[TileDoodadRenderer] Error preloading images:', error);
            this.isInitialized = true; // Still mark as initialized to allow graceful degradation
        }
    }
    
    /**
     * Load a single image and return the HTMLImageElement
     */
    private loadImage(src: string): Promise<HTMLImageElement | null> {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.warn(`[TileDoodadRenderer] Failed to load image: ${src}`);
                resolve(null);
            };
            img.src = src;
        });
    }
    
    /**
     * Check if the tile is on a transition (boundary between terrains).
     * Doodads should never spawn on transition tiles - they would overlap transition textures.
     */
    private isTransitionTile(tileX: number, tileY: number, tileCache: Map<string, WorldTile>): boolean {
        // Tile (x,y) is a corner of 4 dual grid cells: (x,y), (x-1,y), (x,y-1), (x-1,y-1)
        const cells = [
            [tileX, tileY],
            [tileX - 1, tileY],
            [tileX, tileY - 1],
            [tileX - 1, tileY - 1],
        ];
        for (const [cx, cy] of cells) {
            if (getDualGridTileInfoMultiLayer(cx, cy, tileCache).length > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if a doodad should spawn at the given tile position
     */
    private shouldSpawnDoodad(tileX: number, tileY: number, spawnRate: number): boolean {
        // Use salt 12345 for spawn decision
        const hash = hashPosition(tileX, tileY, 12345);
        // Convert spawn rate (0.0-1.0) to permille (0-1000) for finer granularity
        return (hash % 1000) < Math.floor(spawnRate * 1000);
    }
    
    /**
     * Get the index of the doodad image to use for a tile
     */
    private getDoodadIndex(tileX: number, tileY: number, imageCount: number): number {
        // Use different salt (67890) for image selection to get independent randomness
        const hash = hashPosition(tileX, tileY, 67890);
        return hash % imageCount;
    }
    
    /**
     * Render doodads for all visible tiles
     * 
     * @param ctx - Canvas 2D rendering context
     * @param tileCache - Map of tile coordinates to WorldTile data
     * @param startTileX - First visible tile X coordinate
     * @param endTileX - Last visible tile X coordinate (exclusive)
     * @param startTileY - First visible tile Y coordinate
     * @param endTileY - Last visible tile Y coordinate (exclusive)
     * @param isSnorkeling - Whether player is currently snorkeling (shows underwater doodads)
     */
    public renderDoodads(
        ctx: CanvasRenderingContext2D,
        tileCache: Map<string, WorldTile>,
        startTileX: number,
        endTileX: number,
        startTileY: number,
        endTileY: number,
        isSnorkeling: boolean = false
    ): void {
        if (!this.isInitialized) {
            return;
        }
        
        const { tileSize } = gameConfig;
        
        // Iterate through visible tiles
        for (let y = startTileY; y < endTileY; y++) {
            for (let x = startTileX; x < endTileX; x++) {
                const tileKey = `${x}_${y}`;
                const tile = tileCache.get(tileKey);
                
                if (!tile) continue;
                
                const tileTypeName = tile.tileType?.tag;
                if (!tileTypeName) continue;
                
                // Never spawn doodads on transition tiles (boundaries between terrains)
                if (this.isTransitionTile(x, y, tileCache)) continue;

                // Get doodad config for this tile type
                const config = TILE_DOODAD_CONFIG[tileTypeName];
                if (!config) continue;
                
                // When snorkeling: only show underwater doodads (land tiles appear as dark underwater view)
                if (isSnorkeling && !config.isUnderwaterOnly) continue;
                
                // Get images for this folder
                const images = this.imageCache.get(config.folder);
                if (!images || images.length === 0) continue;
                
                // Check if doodad should spawn at this tile
                if (!this.shouldSpawnDoodad(x, y, config.spawnRate)) continue;
                
                // Get which doodad image to use
                const imageIndex = this.getDoodadIndex(x, y, images.length);
                const image = images[imageIndex];
                
                if (!image || !image.complete || image.naturalHeight === 0) continue;
                
                // Calculate pixel position (center of tile)
                const pixelX = Math.floor(x * tileSize);
                const pixelY = Math.floor(y * tileSize);
                
                // Draw doodad centered on tile
                const doodadSize = tileSize;
                const drawX = pixelX + (tileSize - doodadSize) / 2;
                const drawY = pixelY + (tileSize - doodadSize) / 2;
                
                const isUnderwaterDoodad = config.isUnderwaterOnly;
                
                if (isUnderwaterDoodad && !isSnorkeling) {
                    // Viewing through water surface - subtle blur and transparency (like submerged fumaroles, living coral)
                    const savedFilter = ctx.filter;
                    const savedAlpha = ctx.globalAlpha;
                    ctx.filter = 'blur(2px)';
                    ctx.globalAlpha = 0.65;
                    ctx.drawImage(image, drawX, drawY, doodadSize, doodadSize);
                    ctx.filter = savedFilter;
                    ctx.globalAlpha = savedAlpha;
                } else {
                    ctx.drawImage(image, drawX, drawY, doodadSize, doodadSize);
                }
            }
        }
    }
    
    /**
     * Get stats about loaded doodad images
     */
    public getStats(): { folder: string; imageCount: number }[] {
        const stats: { folder: string; imageCount: number }[] = [];
        
        for (const [folder, images] of this.imageCache.entries()) {
            stats.push({ folder, imageCount: images.length });
        }
        
        return stats;
    }
    
    /**
     * Check if renderer is ready
     */
    public isReady(): boolean {
        return this.isInitialized;
    }
}

// Export singleton instance for use across the application
export const tileDoodadRenderer = new TileDoodadRenderer();
