/**
 * Service Worker for Broth & Bullets
 * 
 * Caches game assets for instant loading on subsequent visits.
 * Uses a cache-first strategy for static assets (images, audio).
 * Network-first for API calls and dynamic content.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `game-assets-${CACHE_VERSION}`;

// Assets to precache on install (critical path)
const PRECACHE_ASSETS = [
    // Core HTML/JS will be handled by Vite
    // We focus on large static assets
];

// Patterns for assets to cache on fetch
const CACHEABLE_PATTERNS = [
    /\.(png|jpg|jpeg|webp|gif|svg)$/i,  // Images
    /\.(mp3|wav|ogg|m4a)$/i,            // Audio
    /\.(woff|woff2|ttf|otf)$/i,         // Fonts
];

// Patterns to always fetch from network
const NETWORK_ONLY_PATTERNS = [
    /\/api\//,                           // API calls
    /spacetimedb/i,                      // SpacetimeDB WebSocket
    /\.hot-update\./,                    // Vite HMR
];

// Check if URL matches any pattern in array
function matchesPattern(url, patterns) {
    return patterns.some(pattern => pattern.test(url));
}

// Install event - precache critical assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Precaching critical assets...');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .then(() => {
                console.log('[SW] Installation complete');
                // Skip waiting to activate immediately
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[SW] Installation failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('game-assets-') && name !== CACHE_NAME)
                        .map(name => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activation complete, claiming clients...');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip network-only patterns (API, WebSocket, HMR)
    if (matchesPattern(url, NETWORK_ONLY_PATTERNS)) {
        return;
    }
    
    // For cacheable assets, use cache-first strategy
    if (matchesPattern(url, CACHEABLE_PATTERNS)) {
        event.respondWith(cacheFirst(event.request));
        return;
    }
    
    // For everything else, use network-first with cache fallback
    event.respondWith(networkFirst(event.request));
});

// Cache-first strategy: Try cache, fall back to network
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        // Return cached version immediately
        // Also update cache in background (stale-while-revalidate)
        updateCache(request, cache);
        return cachedResponse;
    }
    
    // Not in cache, fetch from network and cache
    try {
        const networkResponse = await fetch(request);
        
        // Only cache successful responses
        if (networkResponse.ok) {
            // Clone because response can only be consumed once
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Network fetch failed:', request.url, error);
        // Return a fallback or error response
        return new Response('Asset unavailable offline', { status: 503 });
    }
}

// Network-first strategy: Try network, fall back to cache
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        // Network failed, try cache
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Nothing available
        throw error;
    }
}

// Background cache update (stale-while-revalidate pattern)
async function updateCache(request, cache) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            await cache.put(request, networkResponse);
        }
    } catch {
        // Silently fail - cached version is still valid
    }
}

// Listen for messages from main thread
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    
    if (event.data === 'getStats') {
        // Report cache statistics
        getCacheStats().then(stats => {
            event.ports[0].postMessage(stats);
        });
    }
    
    if (event.data === 'clearCache') {
        caches.delete(CACHE_NAME).then(() => {
            event.ports[0].postMessage({ success: true });
        });
    }
});

// Get cache statistics
async function getCacheStats() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        
        let totalSize = 0;
        const assetTypes = {
            images: 0,
            audio: 0,
            fonts: 0,
            other: 0,
        };
        
        for (const request of keys) {
            const response = await cache.match(request);
            if (response) {
                const blob = await response.clone().blob();
                totalSize += blob.size;
                
                const url = request.url;
                if (/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(url)) {
                    assetTypes.images++;
                } else if (/\.(mp3|wav|ogg|m4a)$/i.test(url)) {
                    assetTypes.audio++;
                } else if (/\.(woff|woff2|ttf|otf)$/i.test(url)) {
                    assetTypes.fonts++;
                } else {
                    assetTypes.other++;
                }
            }
        }
        
        return {
            cacheVersion: CACHE_VERSION,
            totalAssets: keys.length,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
            assetTypes,
        };
    } catch (error) {
        return { error: error.message };
    }
}

console.log('[SW] Service worker script loaded');

