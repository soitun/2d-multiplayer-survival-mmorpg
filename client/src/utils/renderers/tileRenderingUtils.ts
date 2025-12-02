import grassTile from '../../assets/tiles/grass_new.png';
import dirtTile from '../../assets/tiles/dirt.png';
import dirtRoadTile from '../../assets/tiles/dirt_road.png';
import seaTile from '../../assets/tiles/sea_new.png';
import beachTile from '../../assets/tiles/beach_new.png';
// Import new tile types from the new/ folder
import asphaltTile from '../../assets/tiles/new/asphalt.png';
import forestTile from '../../assets/tiles/new/forest.png';
import quarryTile from '../../assets/tiles/new/quarry.png';
import hotSpringWaterTile from '../../assets/tiles/new/hotspringwater.png';
import tundraTile from '../../assets/tiles/new/tundra.png';
import alpineTile from '../../assets/tiles/new/alpine.png';
// Import existing autotile assets (these files exist)
import grassDirtAutotile from '../../assets/tiles/tileset_grass_dirt_autotile.png';
import grassBeachAutotile from '../../assets/tiles/tileset_grass_beach_autotile_new.png';
import beachSeaAutotile from '../../assets/tiles/tileset_beach_sea_autotile.png';
// Note: Missing autotile images are loaded dynamically in proceduralWorldRenderer.ts
// to handle missing files gracefully until they are created

export interface TileAssetConfig {
    baseTexture: string;
    variants?: string[]; // For tile variations
    animationFrames?: string[]; // For animated tiles like water
    animationSpeed?: number; // Animation speed in ms per frame
    // New: Autotile support - can have multiple autotile sheets for different transitions
    autotileSheets?: { [transitionName: string]: string }; // Multiple autotile sheets
    autotileSize?: number;  // Size of each autotile in pixels
    autotileColumns?: number; // Number of columns in autotile sheet
    autotileRows?: number;    // Number of rows in autotile sheet
    // Legacy support for single autotile sheet
    autotileSheet?: string; // Path to autotile sheet for transitions
}

export const TILE_ASSETS: Record<string, TileAssetConfig> = {
    'Grass': { 
        baseTexture: grassTile,
        // Autotile configuration for grass-dirt transitions
        autotileSheet: grassDirtAutotile,
        autotileSize: 213, // 1280 ÷ 6 ≈ 213 pixels per sprite
        autotileColumns: 6,
        autotileRows: 6,
        // Could add grass variants here later
        // variants: ['../../assets/tiles/grass_variant1.png']
    },
    'Dirt': { 
        baseTexture: dirtTile,
        // Could add dirt variants here later
        // variants: ['../../assets/tiles/dirt_variant1.png']
    },
    'Quarry': { 
        baseTexture: quarryTile, // Use distinct quarry texture (rocky gray-brown)
        // Quarry tiles have a unique rocky appearance for mining areas
    },
    'DirtRoad': { 
        baseTexture: dirtRoadTile,
    },
    'Sea': { 
        baseTexture: seaTile,
        // Could add water animation frames here later
        // animationFrames: [
        //     '../../assets/tiles/sea_frame1.png',
        //     '../../assets/tiles/sea_frame2.png',
        // ],
        // animationSpeed: 1000, // 1 second per frame
    },
    'Beach': { 
        baseTexture: beachTile,
        // Autotile configuration for beach-sea transitions
        autotileSheet: beachSeaAutotile,
        autotileSize: 213, // 1280 ÷ 6 ≈ 213 pixels per sprite
        autotileColumns: 6,
        autotileRows: 8,
        // Could add beach variants here later
    },
    'Sand': {
        baseTexture: beachTile, // Use beach texture for sand for now
    },
    'HotSpringWater': {
        baseTexture: hotSpringWaterTile, // Use distinct teal/turquoise hot spring water texture
        // Hot springs have a unique cyan/turquoise water appearance
    },
    'Asphalt': {
        baseTexture: asphaltTile, // Dark gray paved texture for compounds
        // Asphalt is used for central compound and mini-compounds at road terminals
    },
    'Forest': {
        baseTexture: forestTile, // Dark green dense forest ground texture
        // Forest tiles represent dense forested areas with higher tree density
    },
    'Tundra': {
        baseTexture: tundraTile, // Arctic tundra texture (mossy, low vegetation)
        // Tundra tiles appear in northern regions - too cold for trees
    },
    'Alpine': {
        baseTexture: alpineTile, // High-altitude rocky terrain texture
        // Alpine tiles appear in the far north - sparse, rocky landscape
    },
};

export function getTileAssetKey(tileTypeName: string, variant?: number, frameIndex?: number, autotileKey?: string): string {
    if (autotileKey) {
        return `${tileTypeName}_autotile_${autotileKey}`;
    }
    if (frameIndex !== undefined) {
        return `${tileTypeName}_frame${frameIndex}`;
    }
    if (variant !== undefined && variant > 128) {
        return `${tileTypeName}_variant${variant}`;
    }
    return `${tileTypeName}_base`;
}

export function getAllTileAssetPaths(): string[] {
    const paths: string[] = [];
    
    Object.entries(TILE_ASSETS).forEach(([tileType, config]) => {
        paths.push(config.baseTexture);
        
        if (config.variants) {
            paths.push(...config.variants);
        }
        
        if (config.animationFrames) {
            paths.push(...config.animationFrames);
        }
        
        // Add autotile sheets
        if (config.autotileSheet) {
            paths.push(config.autotileSheet);
        }
    });
    
    return paths;
}

/**
 * Check if a tile type supports autotiling
 */
export function hasAutotileSupport(tileTypeName: string): boolean {
    const config = TILE_ASSETS[tileTypeName];
    return config && !!config.autotileSheet;
}

/**
 * Get autotile configuration for a tile type
 */
export function getAutotileConfig(tileTypeName: string): {
    sheet: string;
    size: number;
    columns: number;
    rows: number;
} | null {
    const config = TILE_ASSETS[tileTypeName];
    if (!config || !config.autotileSheet) {
        return null;
    }
    
    return {
        sheet: config.autotileSheet,
        size: config.autotileSize || 16,
        columns: config.autotileColumns || 6,
        rows: config.autotileRows || 8
    };
} 