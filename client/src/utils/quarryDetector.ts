/******************************************************************************
 *                                                                            *
 * Quarry Detector - Detects small quarry clusters from world tiles           *
 * and calculates their centers and radii for building restriction zones.     *
 *                                                                            *
 * Small quarries are tile-based monuments (like hot springs) that restrict   *
 * building/placement within their radius. This detector clusters quarry      *
 * tiles and calculates discrete centers for rendering restriction overlays.  *
 *                                                                            *
 ******************************************************************************/

import { WorldChunkData } from '../generated';

export interface DetectedQuarry {
    id: string; // Unique ID based on center position
    posX: number; // World position X in pixels (center)
    posY: number; // World position Y in pixels (center)
    radius: number; // Radius in pixels (of the quarry itself, not the restriction zone)
}

const TILE_SIZE_PX = 48;
const QUARRY_TILE_TYPE = 7; // From TileType enum - Quarry tiles (rocky gray-brown)

// Cache for detected quarries to avoid recalculating every frame
let cachedQuarries: DetectedQuarry[] = [];
let lastChunkDataHash = '';

/**
 * Detects quarry clusters from world chunk data
 */
export function detectQuarries(worldChunkData: Map<string, WorldChunkData>): DetectedQuarry[] {
    // Create a hash of chunk data to detect changes
    const currentHash = Array.from(worldChunkData.keys()).sort().join(',');
    
    // Return cached results if data hasn't changed
    if (currentHash === lastChunkDataHash && cachedQuarries.length > 0) {
        return cachedQuarries;
    }
    
    lastChunkDataHash = currentHash;
    
    // Build a map of all quarry tiles
    const quarryTiles = new Set<string>();
    
    for (const chunk of worldChunkData.values()) {
        const chunkSize = chunk.chunkSize;
        
        for (let localY = 0; localY < chunkSize; localY++) {
            for (let localX = 0; localX < chunkSize; localX++) {
                const tileIndex = localY * chunkSize + localX;
                
                if (tileIndex < chunk.tileTypes.length) {
                    const tileType = chunk.tileTypes[tileIndex];
                    
                    if (tileType === QUARRY_TILE_TYPE) {
                        const worldX = chunk.chunkX * chunkSize + localX;
                        const worldY = chunk.chunkY * chunkSize + localY;
                        quarryTiles.add(`${worldX},${worldY}`);
                    }
                }
            }
        }
    }
    
    // Find clusters of quarry tiles using flood fill
    const visited = new Set<string>();
    const clusters: Array<{tiles: Array<{x: number, y: number}>}> = [];
    
    for (const tileKey of quarryTiles) {
        if (visited.has(tileKey)) continue;
        
        const [x, y] = tileKey.split(',').map(Number);
        const cluster = floodFillCluster(x, y, quarryTiles, visited);
        
        if (cluster.length > 0) {
            clusters.push({ tiles: cluster });
        }
    }
    
    // Calculate center and radius for each cluster
    const detectedQuarries: DetectedQuarry[] = [];
    
    for (const cluster of clusters) {
        // Small quarries are typically smaller than hot springs
        // Skip very small clusters (noise) - require at least 5 tiles
        if (cluster.tiles.length < 5) {
            continue;
        }
        
        // Calculate center (average position)
        let sumX = 0;
        let sumY = 0;
        
        for (const tile of cluster.tiles) {
            sumX += tile.x;
            sumY += tile.y;
        }
        
        const centerTileX = Math.round(sumX / cluster.tiles.length);
        const centerTileY = Math.round(sumY / cluster.tiles.length);
        
        // Calculate radius (max distance from center)
        let maxDistSq = 0;
        
        for (const tile of cluster.tiles) {
            const dx = tile.x - centerTileX;
            const dy = tile.y - centerTileY;
            const distSq = dx * dx + dy * dy;
            maxDistSq = Math.max(maxDistSq, distSq);
        }
        
        const radiusTiles = Math.sqrt(maxDistSq);
        
        // Convert to world pixels
        const centerX = (centerTileX + 0.5) * TILE_SIZE_PX;
        const centerY = (centerTileY + 0.5) * TILE_SIZE_PX;
        const radiusPx = radiusTiles * TILE_SIZE_PX;
        
        detectedQuarries.push({
            id: `quarry_${centerTileX}_${centerTileY}`,
            posX: centerX,
            posY: centerY,
            radius: radiusPx
        });
    }
    
    cachedQuarries = detectedQuarries;
    return detectedQuarries;
}

/**
 * Flood fill algorithm to find connected quarry tiles
 */
function floodFillCluster(
    startX: number,
    startY: number,
    quarryTiles: Set<string>,
    visited: Set<string>
): Array<{x: number, y: number}> {
    const cluster: Array<{x: number, y: number}> = [];
    const queue: Array<{x: number, y: number}> = [{x: startX, y: startY}];
    
    while (queue.length > 0) {
        const current = queue.shift()!;
        const key = `${current.x},${current.y}`;
        
        if (visited.has(key)) continue;
        if (!quarryTiles.has(key)) continue;
        
        visited.add(key);
        cluster.push(current);
        
        // Check 8 neighbors (including diagonals for better cluster detection)
        const neighbors = [
            {x: current.x - 1, y: current.y},
            {x: current.x + 1, y: current.y},
            {x: current.x, y: current.y - 1},
            {x: current.x, y: current.y + 1},
            {x: current.x - 1, y: current.y - 1},
            {x: current.x + 1, y: current.y - 1},
            {x: current.x - 1, y: current.y + 1},
            {x: current.x + 1, y: current.y + 1},
        ];
        
        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.x},${neighbor.y}`;
            if (!visited.has(neighborKey) && quarryTiles.has(neighborKey)) {
                queue.push(neighbor);
            }
        }
    }
    
    return cluster;
}

/**
 * Clear the cache (call when world data changes significantly)
 */
export function clearQuarryCache(): void {
    cachedQuarries = [];
    lastChunkDataHash = '';
}
