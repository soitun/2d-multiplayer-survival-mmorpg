/**
 * Asset Preloader Service
 * 
 * Centralized asset loading with progress tracking.
 * Prioritizes critical assets (player sprites, core UI) before secondary assets.
 * Reports real-time progress for loading screens.
 */

import { imageManager } from '../utils/renderers/imageManager';

// Import critical assets (must load before game starts)
import heroSpriteSheet from '../assets/hero_walk.png';
import heroSprintSpriteSheet from '../assets/hero_sprint.png';
import heroIdleSpriteSheet from '../assets/hero_idle.png';
import heroWaterSpriteSheet from '../assets/hero_swim.png';
import heroCrouchSpriteSheet from '../assets/hero_crouch.png';
import heroDodgeSpriteSheet from '../assets/hero_dodge.png';

// Import UI assets
import sovaImage from '../assets/ui/sova.png';
import heartIcon from '../assets/ui/heart.png';
import hungerIcon from '../assets/ui/hunger.png';
import thirstIcon from '../assets/ui/thirst.png';
import warmthIcon from '../assets/ui/warmth.png';
import staminaIcon from '../assets/ui/stamina.png';

// Import cloud textures
import cloud1Texture from '../assets/environment/clouds/cloud1.png';
import cloud2Texture from '../assets/environment/clouds/cloud2.png';
import cloud3Texture from '../assets/environment/clouds/cloud3.png';
import cloud4Texture from '../assets/environment/clouds/cloud4.png';
import cloud5Texture from '../assets/environment/clouds/cloud5.png';

// Types
export interface AssetLoadingProgress {
    phase: 'critical' | 'important' | 'secondary' | 'complete';
    phaseName: string;
    phaseProgress: number; // 0-1 for current phase
    totalProgress: number; // 0-1 overall
    loadedCount: number;
    totalCount: number;
    currentAsset: string;
    fromCache: number; // Count of assets loaded from service worker cache
}

export type ProgressCallback = (progress: AssetLoadingProgress) => void;

// Asset categories with weights for progress calculation
const PHASE_WEIGHTS = {
    critical: 0.4,   // 40% of progress bar
    important: 0.35, // 35% of progress bar
    secondary: 0.25, // 25% of progress bar
};

// Critical assets - MUST load before game starts
const CRITICAL_ASSETS: { name: string; src: string }[] = [
    { name: 'Player Walk', src: heroSpriteSheet },
    { name: 'Player Sprint', src: heroSprintSpriteSheet },
    { name: 'Player Idle', src: heroIdleSpriteSheet },
    { name: 'Player Swim', src: heroWaterSpriteSheet },
    { name: 'Player Crouch', src: heroCrouchSpriteSheet },
    { name: 'Player Dodge', src: heroDodgeSpriteSheet },
    { name: 'SOVA Interface', src: sovaImage },
    { name: 'Health Icon', src: heartIcon },
    { name: 'Hunger Icon', src: hungerIcon },
    { name: 'Thirst Icon', src: thirstIcon },
    { name: 'Warmth Icon', src: warmthIcon },
    { name: 'Stamina Icon', src: staminaIcon },
];

// Important assets - Load immediately after critical
const IMPORTANT_ASSETS: { name: string; src: string }[] = [
    { name: 'Cloud 1', src: cloud1Texture },
    { name: 'Cloud 2', src: cloud2Texture },
    { name: 'Cloud 3', src: cloud3Texture },
    { name: 'Cloud 4', src: cloud4Texture },
    { name: 'Cloud 5', src: cloud5Texture },
];

// Cache for loaded images
const loadedImages: Map<string, HTMLImageElement> = new Map();

// Check if an asset is in service worker cache
async function isInCache(url: string): Promise<boolean> {
    if (!('caches' in window)) return false;
    try {
        const cache = await caches.open('game-assets-v1');
        const response = await cache.match(url);
        return !!response;
    } catch {
        return false;
    }
}

// Load a single image with progress tracking
function loadImage(src: string, name: string): Promise<{ image: HTMLImageElement; fromCache: boolean }> {
    return new Promise(async (resolve, reject) => {
        // Check if already loaded
        if (loadedImages.has(src)) {
            resolve({ image: loadedImages.get(src)!, fromCache: true });
            return;
        }

        const fromCache = await isInCache(src);
        const img = new Image();
        
        img.onload = () => {
            loadedImages.set(src, img);
            // Also preload in imageManager for game use
            imageManager.preloadImage(src);
            resolve({ image: img, fromCache });
        };
        
        img.onerror = () => {
            console.warn(`[AssetPreloader] Failed to load: ${name} (${src})`);
            // Resolve anyway to not block loading
            resolve({ image: img, fromCache: false });
        };
        
        img.src = src;
    });
}

// Load a batch of assets with progress reporting
async function loadAssetBatch(
    assets: { name: string; src: string }[],
    phase: 'critical' | 'important' | 'secondary',
    phaseName: string,
    baseProgress: number,
    onProgress: ProgressCallback,
    totalAssetCount: number,
    loadedSoFar: number
): Promise<{ loaded: number; fromCache: number }> {
    let loaded = 0;
    let fromCacheCount = 0;
    
    for (const asset of assets) {
        const result = await loadImage(asset.src, asset.name);
        loaded++;
        if (result.fromCache) fromCacheCount++;
        
        const phaseProgress = loaded / assets.length;
        const phaseContribution = PHASE_WEIGHTS[phase] * phaseProgress;
        const totalProgress = baseProgress + phaseContribution;
        
        onProgress({
            phase,
            phaseName,
            phaseProgress,
            totalProgress: Math.min(totalProgress, 1),
            loadedCount: loadedSoFar + loaded,
            totalCount: totalAssetCount,
            currentAsset: asset.name,
            fromCache: fromCacheCount,
        });
    }
    
    return { loaded, fromCache: fromCacheCount };
}

// Get item icons dynamically
async function getItemIconAssets(): Promise<{ name: string; src: string }[]> {
    const { itemIcons } = await import('../utils/itemIconUtils');
    const assets: { name: string; src: string }[] = [];
    
    for (const [key, src] of Object.entries(itemIcons)) {
        if (src && typeof src === 'string') {
            assets.push({ name: key.replace('.png', ''), src });
        }
    }
    
    return assets;
}

// Main preload function
export async function preloadAllAssets(onProgress: ProgressCallback): Promise<void> {
    console.log('[AssetPreloader] Starting asset preload...');
    const startTime = performance.now();
    
    // Get all secondary assets (item icons, etc.)
    const itemIconAssets = await getItemIconAssets();
    
    // Calculate totals
    const totalAssets = CRITICAL_ASSETS.length + IMPORTANT_ASSETS.length + itemIconAssets.length;
    let loadedSoFar = 0;
    let totalFromCache = 0;
    
    // Initial progress
    onProgress({
        phase: 'critical',
        phaseName: 'Loading Core Systems',
        phaseProgress: 0,
        totalProgress: 0,
        loadedCount: 0,
        totalCount: totalAssets,
        currentAsset: 'Initializing...',
        fromCache: 0,
    });
    
    // Phase 1: Critical assets
    console.log(`[AssetPreloader] Phase 1: Loading ${CRITICAL_ASSETS.length} critical assets...`);
    const criticalResult = await loadAssetBatch(
        CRITICAL_ASSETS,
        'critical',
        'Loading Core Systems',
        0,
        onProgress,
        totalAssets,
        loadedSoFar
    );
    loadedSoFar += criticalResult.loaded;
    totalFromCache += criticalResult.fromCache;
    
    // Phase 2: Important assets
    console.log(`[AssetPreloader] Phase 2: Loading ${IMPORTANT_ASSETS.length} important assets...`);
    const importantResult = await loadAssetBatch(
        IMPORTANT_ASSETS,
        'important',
        'Loading Environment',
        PHASE_WEIGHTS.critical,
        onProgress,
        totalAssets,
        loadedSoFar
    );
    loadedSoFar += importantResult.loaded;
    totalFromCache += importantResult.fromCache;
    
    // Phase 3: Secondary assets (item icons) - load in SMALL batches with delays to prevent server overload
    console.log(`[AssetPreloader] Phase 3: Loading ${itemIconAssets.length} item icons...`);
    const BATCH_SIZE = 5; // Reduced from 20 to prevent ERR_INSUFFICIENT_RESOURCES
    const DELAY_BETWEEN_BATCHES = 50; // Small delay between batches
    let secondaryLoaded = 0;
    let secondaryFromCache = 0;
    
    for (let i = 0; i < itemIconAssets.length; i += BATCH_SIZE) {
        const batch = itemIconAssets.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(asset => loadImage(asset.src, asset.name));
        const results = await Promise.all(batchPromises);
        
        secondaryLoaded += results.length;
        secondaryFromCache += results.filter(r => r.fromCache).length;
        
        const phaseProgress = secondaryLoaded / itemIconAssets.length;
        const baseProgress = PHASE_WEIGHTS.critical + PHASE_WEIGHTS.important;
        const totalProgress = baseProgress + (PHASE_WEIGHTS.secondary * phaseProgress);
        
        onProgress({
            phase: 'secondary',
            phaseName: 'Loading Item Database',
            phaseProgress,
            totalProgress: Math.min(totalProgress, 1),
            loadedCount: loadedSoFar + secondaryLoaded,
            totalCount: totalAssets,
            currentAsset: batch[batch.length - 1]?.name || 'Items',
            fromCache: totalFromCache + secondaryFromCache,
        });
        
        // Small delay between batches to prevent overwhelming the server
        if (i + BATCH_SIZE < itemIconAssets.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
    }
    
    loadedSoFar += secondaryLoaded;
    totalFromCache += secondaryFromCache;
    
    // Complete!
    const elapsed = performance.now() - startTime;
    console.log(`[AssetPreloader] ✅ Complete! Loaded ${loadedSoFar} assets in ${elapsed.toFixed(0)}ms (${totalFromCache} from cache)`);
    
    onProgress({
        phase: 'complete',
        phaseName: 'Systems Online',
        phaseProgress: 1,
        totalProgress: 1,
        loadedCount: loadedSoFar,
        totalCount: totalAssets,
        currentAsset: 'All systems ready',
        fromCache: totalFromCache,
    });
}

// Get a loaded image (for use in game)
export function getLoadedImage(src: string): HTMLImageElement | null {
    return loadedImages.get(src) || null;
}

// Check if all critical assets are loaded
export function areCriticalAssetsLoaded(): boolean {
    return CRITICAL_ASSETS.every(asset => loadedImages.has(asset.src));
}

