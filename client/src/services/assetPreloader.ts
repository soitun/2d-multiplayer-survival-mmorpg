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

// Cache for loaded images - persist across HMR for faster dev reloads
// @ts-ignore - Attach to window to persist across HMR
if (!window.__ASSET_PRELOADER_CACHE__) {
    // @ts-ignore
    window.__ASSET_PRELOADER_CACHE__ = new Map<string, HTMLImageElement>();
}
// @ts-ignore
const loadedImages: Map<string, HTMLImageElement> = window.__ASSET_PRELOADER_CACHE__;

// Service worker cache name - must match sw.js CACHE_NAME
const SW_CACHE_NAME = 'game-assets-v2';

// Track if SW is actually controlling (set by waitForServiceWorker)
let swIsControlling = false;

// Check if an asset is in service worker cache (with proper full URL matching)
async function isInCache(url: string): Promise<boolean> {
    // Skip all cache checks in dev mode - SW doesn't work with Vite anyway
    if (import.meta.env.DEV) return false;
    // If SW isn't controlling, don't bother checking cache (it won't be used anyway)
    if (!swIsControlling) return false;
    if (!('caches' in window)) return false;
    
    try {
        const cache = await caches.open(SW_CACHE_NAME);
        // Convert to full URL for proper Cache API matching
        const fullUrl = new URL(url, window.location.origin).href;
        const response = await cache.match(fullUrl);
        const inCache = !!response;
        if (inCache) {
            console.debug(`[AssetPreloader] ✓ SW Cache hit: ${url.split('/').pop()}`);
        }
        return inCache;
    } catch (e) {
        console.warn('[AssetPreloader] Cache check failed:', e);
        return false;
    }
}

// Wait for Service Worker to be ready and controlling before preloading (production only)
async function waitForServiceWorker(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) {
        console.warn('[AssetPreloader] Service Workers not supported');
        return false;
    }
    
    try {
        // Wait for SW to be ready
        const registration = await navigator.serviceWorker.ready;
        console.log('[AssetPreloader] Service Worker ready:', registration.scope);
        
        // Check if SW is controlling the page (important for caching!)
        if (!navigator.serviceWorker.controller) {
            console.warn('[AssetPreloader] ⚠️ SW is ready but NOT controlling - first visit or hard refresh');
            
            // The SW should claim clients on activation - wait a moment for clients.claim() to take effect
            console.log('[AssetPreloader] Waiting for SW to claim this client...');
            await new Promise(resolve => setTimeout(resolve, 100));
            
            if (navigator.serviceWorker.controller) {
                console.log('[AssetPreloader] ✅ SW now controlling after claim');
                swIsControlling = true;
                return true;
            }
            
            // Still not controlling - suggest reload
            console.warn('[AssetPreloader] SW still not controlling. Caching will work after page reload.');
            return false;
        }
        
        console.log('[AssetPreloader] ✅ Service Worker is controlling the page - cache should work!');
        swIsControlling = true;
        return true;
    } catch (e) {
        console.warn('[AssetPreloader] Service Worker not ready:', e);
        return false;
    }
}

// Load a single image with progress tracking
function loadImage(src: string, name: string): Promise<{ image: HTMLImageElement; fromCache: boolean }> {
    return new Promise(async (resolve) => {
        // Check if already loaded in memory (instant - true cache hit)
        if (loadedImages.has(src)) {
            const cachedImg = loadedImages.get(src)!;
            // Make sure imageManager also has it
            imageManager.preloadImage(src);
            resolve({ image: cachedImg, fromCache: true });
            return;
        }

        // Check if in service worker cache BEFORE loading
        const inSwCache = await isInCache(src);
        const loadStartTime = performance.now();
        const img = new Image();
        
        img.onload = () => {
            const loadTime = performance.now() - loadStartTime;
            // Only count as "from cache" if:
            // 1. We verified it's in SW cache, OR
            // 2. It loaded VERY fast (< 20ms indicates browser disk/memory cache)
            // Don't use 50ms - that's too generous and gives false positives
            const wasFromCache = inSwCache || loadTime < 20;
            
            loadedImages.set(src, img);
            // Also preload in imageManager for game use
            imageManager.preloadImage(src);
            
            // Log slow loads for debugging
            if (loadTime > 100) {
                console.debug(`[AssetPreloader] 🐢 Slow: ${name} took ${loadTime.toFixed(0)}ms`);
            }
            
            resolve({ image: img, fromCache: wasFromCache });
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
    const isDev = import.meta.env.DEV;
    console.log(`[AssetPreloader] Starting asset preload... (${isDev ? 'DEV mode - no SW cache' : 'PROD mode'})`);
    const startTime = performance.now();
    
    // Only bother with Service Worker in production
    if (!isDev) {
        const swReady = await waitForServiceWorker();
        if (!swReady) {
            console.warn('[AssetPreloader] ⚠️ Service Worker not ready - assets won\'t be cached!');
        }
    }
    
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
    const BATCH_SIZE = 3; // Small batches to prevent ERR_INSUFFICIENT_RESOURCES on Railway
    const DELAY_BETWEEN_BATCHES = 150; // Longer delay between batches for production
    // Skip delays when most assets are from cache (returning user with warm cache)
    const cacheRatioSoFar = loadedSoFar > 0 ? totalFromCache / loadedSoFar : 0;
    const skipDelays = cacheRatioSoFar > 0.8; // >80% from cache = skip delays
    if (skipDelays) {
        console.log(`[AssetPreloader] 🚀 High cache rate (${(cacheRatioSoFar * 100).toFixed(0)}%), skipping batch delays`);
    }
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
        // Skip delays when assets are coming from cache (returning user)
        if (!skipDelays && i + BATCH_SIZE < itemIconAssets.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
    }
    
    loadedSoFar += secondaryLoaded;
    totalFromCache += secondaryFromCache;
    
    // Complete!
    const elapsed = performance.now() - startTime;
    const cachePercentage = totalAssets > 0 ? ((totalFromCache / totalAssets) * 100).toFixed(0) : 0;
    const avgLoadTime = totalAssets > 0 ? (elapsed / totalAssets).toFixed(1) : 0;
    
    console.log(`[AssetPreloader] ✅ Complete! Loaded ${loadedSoFar} assets in ${elapsed.toFixed(0)}ms`);
    console.log(`[AssetPreloader] 📊 Cache stats: ${totalFromCache}/${totalAssets} from cache (${cachePercentage}%)`);
    console.log(`[AssetPreloader] ⏱️ Average load time: ${avgLoadTime}ms/asset`);
    
    if (elapsed < 1000 && totalFromCache > totalAssets * 0.5) {
        console.log(`[AssetPreloader] 🚀 Fast load detected! Service Worker cache is working.`);
    } else if (elapsed > 3000 && totalFromCache < totalAssets * 0.1) {
        console.log(`[AssetPreloader] 🐢 Slow load detected. First visit or cache cleared.`);
    }
    
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

// Check if ALL assets (critical + important + secondary) are already in memory cache.
// Returns true if a previous preload already loaded everything, meaning we can skip
// the entire loading screen on reconnect / remount.
export function areAllAssetsPreloaded(): boolean {
    // Quick check: if we haven't loaded critical assets, definitely not done
    if (!areCriticalAssetsLoaded()) return false;
    if (!IMPORTANT_ASSETS.every(asset => loadedImages.has(asset.src))) return false;
    // For secondary assets (item icons), check the cache size is non-trivial
    // We can't easily enumerate all item icons synchronously, so use a heuristic:
    // critical (12) + important (5) = 17, plus at least some secondary assets
    return loadedImages.size >= CRITICAL_ASSETS.length + IMPORTANT_ASSETS.length + 10;
}

