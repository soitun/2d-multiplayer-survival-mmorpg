import { useEffect, useRef, useCallback, useState, useMemo } from 'react';

interface MusicSystemConfig {
    enabled: boolean;
    volume: number; // 0-1 scale (up to 100%)
    crossfadeDuration: number; // milliseconds
    shuffleMode: boolean;
    preloadAll: boolean;
}

interface MusicTrack {
    filename: string;
    displayName: string;
    duration?: number; // Will be set after loading
    path: string; // Full path from /music/
}

// Music zone types - extensible for future monuments
export type MusicZone = 'normal' | 'fishing_village' | 'hunting_village' | 'alk_compound' | 'alk_substation' | 'hot_springs';

// Zone metadata for UI display
export const MUSIC_ZONE_INFO: Record<MusicZone, { name: string; icon: string }> = {
    normal: { name: 'Wilderness', icon: '🌲' },
    fishing_village: { name: 'Fishing Village', icon: '🎣' },
    hunting_village: { name: 'Hunting Village', icon: '🏕️' },
    alk_compound: { name: 'ALK Compound', icon: '🏭' },
    alk_substation: { name: 'ALK Substation', icon: '⚡' },
    hot_springs: { name: 'Hot Springs', icon: '♨️' },
};

// Zone detection radius in pixels - should cover the whole fishing village area
// Server's FISHING_VILLAGE_BONUS_RADIUS is 1200px, but music zone should be even larger
// to ensure the ambient music plays throughout the entire village experience
const FISHING_VILLAGE_ZONE_RADIUS = 1400;

// Hunting village zone radius - similar to fishing village
// Server's HUNTING_VILLAGE_SAFE_ZONE_RADIUS is 600px, but music zone should be larger
// to ensure the ambient music plays throughout the entire village experience
const HUNTING_VILLAGE_ZONE_RADIUS = 1400;

// ALK zone radii - matches the building restriction zones
// Central compound: interaction_radius (250px) × multiplier (8.75) = 2188px
// Substations: interaction_radius (200px) × multiplier (3.0) = 600px

// Central compound music zone radius - matches building restriction zone
const ALK_CENTRAL_COMPOUND_ZONE_RADIUS = 2188; // 250 * 8.75 - scaled 25% from 1750 to match larger asphalt

// Substation music zone radius - matches building restriction zone
const ALK_SUBSTATION_ZONE_RADIUS = 1200;

// Hot springs music zone radius - 1400px from center of hot spring
const HOT_SPRINGS_ZONE_RADIUS = 1400;

// Hot spring shack offset from center (used to reverse-calculate center from monument parts)
// Server places shacks at offset (-380, 250) from hot spring center
const HOT_SPRING_SHACK_OFFSET_X = -380;
const HOT_SPRING_SHACK_OFFSET_Y = 250;

// Normal world music tracks (in /public/music/)
const NORMAL_TRACKS: MusicTrack[] = [
    { filename: 'Aleut_Ashfall.mp3', displayName: 'Aleut Ashfall', path: 'Aleut_Ashfall.mp3' },
    { filename: 'Babushka_Circuit.mp3', displayName: 'Babushka Circuit', path: 'Babushka_Circuit.mp3' },
    { filename: 'Deadwomans_Harbor.mp3', displayName: 'Deadwoman\'s Harbor', path: 'Deadwomans_Harbor.mp3' },
    { filename: 'Inlet Fog.mp3', displayName: 'Inlet Fog', path: 'Inlet_Fog.mp3' },
    { filename: 'Derge_Soupline.mp3', displayName: 'Derge Soupline', path: 'Derge_Soupline.mp3' },
    { filename: 'Kindling_Ritual.mp3', displayName: 'Kindling Ritual', path: 'Kindling_Ritual.mp3' },
    { filename: 'Latchkey_Depths.mp3', displayName: 'Latchkey Depths', path: 'Latchkey_Depths.mp3' },
    { filename: 'Low_Tide_Cache.mp3', displayName: 'Low Tide Cache', path: 'Low_Tide_Cache.mp3' },
    { filename: 'Saltwind.mp3', displayName: 'Saltwind', path: 'Saltwind.mp3' },
    { filename: 'Snowblind_Signal.mp3', displayName: 'Snowblind Signal', path: 'Snowblind_Signal.mp3' },
    { filename: 'Spoiled_Tallow.mp3', displayName: 'Spoiled Tallow', path: 'Spoiled_Tallow.mp3' },
    { filename: 'Whalebone_Relay.mp3', displayName: 'Whalebone Relay', path: 'Whalebone_Relay.mp3' },
];

// Fishing Village music tracks (in /public/music/fv/)
const FISHING_VILLAGE_TRACKS: MusicTrack[] = [
    { filename: 'Ancestors_Watch.mp3', displayName: 'Ancestors Watch', path: 'fv/Ancestors_Watch.mp3' },
    { filename: 'Bering_Fog.mp3', displayName: 'Bering Fog', path: 'fv/Bering_Fog.mp3' },
    { filename: 'Unagan_Tides.mp3', displayName: 'Unagan Tides', path: 'fv/Unagan_Tides.mp3' },
    { filename: 'Whale_Bone_Drums.mp3', displayName: 'Whale Bone Drums', path: 'fv/Whale_Bone_Drums.mp3' },
];

// Hunting Village music tracks (in /public/music/hv/)
const HUNTING_VILLAGE_TRACKS: MusicTrack[] = [
    { filename: 'Where_The_Rifles_Rest.mp3', displayName: 'Where The Rifles Rest', path: 'hv/Where_The_Rifles_Rest.mp3' },
    { filename: 'Smoke_On_The_Line.mp3', displayName: 'Smoke On The Line', path: 'hv/Smoke_On_The_Line.mp3' },
    { filename: 'After_The_Kill.mp3', displayName: 'After The Kill', path: 'hv/After_The_Kill.mp3' },
    { filename: 'The_Long_Watch.mp3', displayName: 'The Long Watch', path: 'hv/The_Long_Watch.mp3' },
];

// ALK music tracks (in /public/music/alk/) - shared by compound and substations
const ALK_TRACKS: MusicTrack[] = [
    { filename: 'Throughput_Without_Witness.mp3', displayName: 'Throughput Without Witness', path: 'alk/Throughput_Without_Witness.mp3' },
    { filename: 'Autonomous_Allocation.mp3', displayName: 'Autonomous Allocation', path: 'alk/Autonomous_Allocation.mp3' },
    { filename: 'Legacy_Code_In_Permafrost.mp3', displayName: 'Legacy Code In Permafrost', path: 'alk/Legacy_Code_In_Permafrost.mp3' },
    { filename: 'Failsafe_Still_Running.mp3', displayName: 'Failsafe Still Running', path: 'alk/Failsafe_Still_Running.mp3' },
];

// Hot Springs music tracks (in /public/music/hs/) - relaxing ambient for geothermal pools
const HOT_SPRINGS_TRACKS: MusicTrack[] = [
    { filename: 'Steam_Over_Birchwood.mp3', displayName: 'Steam Over Birchwood', path: 'hs/Steam_Over_Birchwood.mp3' },
];

// Zone-based track mapping
const ZONE_TRACKS: Record<MusicZone, MusicTrack[]> = {
    normal: NORMAL_TRACKS,
    fishing_village: FISHING_VILLAGE_TRACKS,
    hunting_village: HUNTING_VILLAGE_TRACKS,
    alk_compound: ALK_TRACKS,
    alk_substation: ALK_TRACKS,
    hot_springs: HOT_SPRINGS_TRACKS,
};

// All tracks for preloading
const ALL_TRACKS: MusicTrack[] = [...NORMAL_TRACKS, ...FISHING_VILLAGE_TRACKS, ...HUNTING_VILLAGE_TRACKS, ...ALK_TRACKS, ...HOT_SPRINGS_TRACKS];

// Legacy export for backward compatibility
const MUSIC_TRACKS = NORMAL_TRACKS;

const DEFAULT_CONFIG: MusicSystemConfig = {
    enabled: true,
    volume: 0.5, // 50% volume for background music (0.5 out of 1.0 max)
    crossfadeDuration: 3000, // 3 second crossfade for seamless zone transitions
    shuffleMode: true,
    preloadAll: true,
};

// Zone must be stable for this long before switching (prevents boundary flicker)
const ZONE_DEBOUNCE_MS = 1500;

// Random pause configuration
const PAUSE_PROBABILITY = 0.4; // 40% chance of pausing between songs
const MIN_PAUSE_DURATION_MS = 2 * 60 * 1000; // 2 minutes minimum
const MAX_PAUSE_DURATION_MS = 5 * 60 * 1000; // 5 minutes maximum

// Music system state
interface MusicSystemState {
    isPlaying: boolean;
    currentTrack: MusicTrack | null;
    currentTrackIndex: number;
    isLoading: boolean;
    preloadProgress: number; // 0-1
    error: string | null;
    playlist: number[]; // Shuffled track indices (relative to current zone's tracks)
    playlistPosition: number;
    volume: number; // Current volume (0-1)
    shuffleMode: boolean; // Track shuffle mode in state
    currentZone: MusicZone; // Current music zone
    isPaused: boolean; // Whether we're in a random pause period
    pauseEndTime: number | null; // Timestamp when pause should end (ms since epoch)
}

// Player position for zone detection
interface PlayerPosition {
    x: number;
    y: number;
}

// ALK station interface (matching SpacetimeDB type)
interface AlkStation {
    stationId: number;
    worldPosX: number;
    worldPosY: number;
    interactionRadius: number;
    isActive: boolean;
}

// Fishing village part interface (matching SpacetimeDB type)
interface FishingVillagePart {
    id: bigint;
    world_x: number;
    world_y: number;
    worldX?: number; // Alternative naming
    worldY?: number;
    part_type: string;
    partType?: string; // Alternative naming
    is_center: boolean;
    isCenter?: boolean; // Alternative naming
}

// Audio cache for preloaded tracks
class MusicCache {
    private cache = new Map<string, HTMLAudioElement>();
    private loadingPromises = new Map<string, Promise<HTMLAudioElement>>();

    async get(path: string): Promise<HTMLAudioElement> {
        // Check cache first
        const cached = this.cache.get(path);
        if (cached) {
            return cached;
        }

        // Check if already loading
        const loadingPromise = this.loadingPromises.get(path);
        if (loadingPromise) {
            return loadingPromise;
        }

        // Start loading
        const promise = this.loadTrack(path);
        this.loadingPromises.set(path, promise);

        try {
            const audio = await promise;
            this.cache.set(path, audio);
            this.loadingPromises.delete(path);
            return audio;
        } catch (error) {
            this.loadingPromises.delete(path);
            throw error;
        }
    }

    private async loadTrack(path: string): Promise<HTMLAudioElement> {
        return new Promise((resolve, reject) => {
            const audio = new Audio(`/music/${path}`);
            audio.preload = 'auto';
            audio.loop = false; // We'll handle looping manually
            
            const loadTimeout = setTimeout(() => {
                reject(new Error(`Music load timeout: ${path}`));
            }, 10000); // 10 second timeout for large files

            audio.addEventListener('loadeddata', () => {
                clearTimeout(loadTimeout);
                resolve(audio);
            }, { once: true });

            audio.addEventListener('error', (e) => {
                clearTimeout(loadTimeout);
                console.error(`🎵 Music load error: ${path}`, e);
                reject(new Error(`Failed to load music: ${path}`));
            }, { once: true });

            // Start loading
            audio.load();
        });
    }

    has(path: string): boolean {
        return this.cache.has(path);
    }

    clear(): void {
        // Stop all cached audio
        this.cache.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
        this.cache.clear();
        this.loadingPromises.clear();
    }

    size(): number {
        return this.cache.size;
    }
}

// Global music cache
const musicCache = new MusicCache();

// Utility functions
const createShuffledPlaylist = (trackCount: number): number[] => {
    const playlist = Array.from({ length: trackCount }, (_, i) => i);
    // Fisher-Yates shuffle
    for (let i = playlist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
    }
    return playlist;
};

// Fade curve types for different situations
type FadeCurve = 'linear' | 'exponential' | 'equal-power';

const fadeAudio = async (
    audio: HTMLAudioElement, 
    fromVolume: number, 
    toVolume: number, 
    duration: number,
    curve: FadeCurve = 'exponential'
): Promise<void> => {
    return new Promise((resolve) => {
        const steps = 60; // 60 steps for smooth fade
        const stepDuration = duration / steps;
        let currentStep = 0;
        const isFadingOut = toVolume < fromVolume;

        const calculateVolume = (progress: number): number => {
            // progress goes from 0 to 1
            switch (curve) {
                case 'linear':
                    return fromVolume + (toVolume - fromVolume) * progress;
                
                case 'exponential':
                    // Exponential curve sounds more natural to human ears
                    // For fade out: slow start, fast end (volume drops gradually then quickly)
                    // For fade in: fast start, slow end (volume rises quickly then gradually)
                    if (isFadingOut) {
                        // Use a power curve that keeps volume higher longer, then drops
                        // This makes the fade-out feel more gradual
                        const curvedProgress = Math.pow(progress, 2.5);
                        return fromVolume * (1 - curvedProgress);
                    } else {
                        // Fade in: rise quickly at first, then settle
                        const curvedProgress = 1 - Math.pow(1 - progress, 2.5);
                        return fromVolume + (toVolume - fromVolume) * curvedProgress;
                    }
                
                case 'equal-power':
                    // Equal-power crossfade prevents volume dips in the middle
                    // Uses sine/cosine curves
                    if (isFadingOut) {
                        return fromVolume * Math.cos(progress * Math.PI / 2);
                    } else {
                        return toVolume * Math.sin(progress * Math.PI / 2);
                    }
                
                default:
                    return fromVolume + (toVolume - fromVolume) * progress;
            }
        };

        const fade = () => {
            if (currentStep >= steps) {
                audio.volume = Math.max(0, Math.min(1, toVolume));
                resolve();
                return;
            }

            const progress = currentStep / steps;
            const newVolume = calculateVolume(progress);
            audio.volume = Math.max(0, Math.min(1, newVolume));
            currentStep++;
            setTimeout(fade, stepDuration);
        };

        fade();
    });
};

// Helper function to detect which music zone the player is in
const detectMusicZone = (
    playerPos: PlayerPosition | null,
    monumentParts: Map<string, any> | null,
    alkStations: Map<string, AlkStation> | null
): MusicZone => {
    if (!playerPos) {
        return 'normal';
    }

    // Check for ALK stations first (they don't use monumentParts)
    if (alkStations && alkStations.size > 0) {
        // Check central compound first (stationId === 0)
        for (const station of alkStations.values()) {
            if (!station.isActive) continue;
            
            const dx = playerPos.x - station.worldPosX;
            const dy = playerPos.y - station.worldPosY;
            const distSq = dx * dx + dy * dy;
            
            // Use larger radius for central compound (matches building restriction zone)
            const isCentralCompound = station.stationId === 0;
            const zoneRadius = isCentralCompound ? ALK_CENTRAL_COMPOUND_ZONE_RADIUS : ALK_SUBSTATION_ZONE_RADIUS;
            const zoneRadiusSq = zoneRadius * zoneRadius;
            
            if (distSq < zoneRadiusSq) {
                // Central compound (stationId 0) gets alk_compound zone
                // Substations (stationId 1-4) get alk_substation zone
                return isCentralCompound ? 'alk_compound' : 'alk_substation';
            }
        }
    }

    // Check monument-based zones (fishing village, hunting village)
    if (!monumentParts || monumentParts.size === 0) {
        return 'normal';
    }

    // Check fishing village first
    const fishingVillageParts = Array.from(monumentParts.values())
        .filter((part: any) => part.monumentType?.tag === 'FishingVillage');
    
    if (fishingVillageParts.length > 0) {
        // Find the fishing village center
        let centerX: number | null = null;
        let centerY: number | null = null;

        for (const part of fishingVillageParts) {
            // Check for center piece using both naming conventions
            const isCenter = part.is_center || part.isCenter;
            if (isCenter) {
                centerX = part.world_x ?? part.worldX;
                centerY = part.world_y ?? part.worldY;
                break;
            }
        }

        // If no center found, use average of all parts
        if (centerX === null || centerY === null) {
            let sumX = 0, sumY = 0, count = 0;
            for (const part of fishingVillageParts) {
                const x = part.world_x ?? part.worldX;
                const y = part.world_y ?? part.worldY;
                if (x !== undefined && y !== undefined) {
                    sumX += x;
                    sumY += y;
                    count++;
                }
            }
            if (count > 0) {
                centerX = sumX / count;
                centerY = sumY / count;
            }
        }

        // Check if player is within zone radius
        if (centerX !== null && centerY !== null) {
            const dx = playerPos.x - centerX;
            const dy = playerPos.y - centerY;
            const distSq = dx * dx + dy * dy;
            
            if (distSq < FISHING_VILLAGE_ZONE_RADIUS * FISHING_VILLAGE_ZONE_RADIUS) {
                return 'fishing_village';
            }
        }
    }

    // Check for hunting village
    const huntingVillageParts = Array.from(monumentParts.values())
        .filter((part: any) => part.monumentType?.tag === 'HuntingVillage');
    
    if (huntingVillageParts.length > 0) {
        // Find the hunting village center
        let centerX: number | null = null;
        let centerY: number | null = null;

        for (const part of huntingVillageParts) {
            const isCenter = part.is_center || part.isCenter;
            if (isCenter) {
                centerX = part.world_x ?? part.worldX;
                centerY = part.world_y ?? part.worldY;
                break;
            }
        }

        // If no center found, use average of all parts
        if (centerX === null || centerY === null) {
            let sumX = 0, sumY = 0, count = 0;
            for (const part of huntingVillageParts) {
                const x = part.world_x ?? part.worldX;
                const y = part.world_y ?? part.worldY;
                if (x !== undefined && y !== undefined) {
                    sumX += x;
                    sumY += y;
                    count++;
                }
            }
            if (count > 0) {
                centerX = sumX / count;
                centerY = sumY / count;
            }
        }

        // Check if player is within zone radius
        if (centerX !== null && centerY !== null) {
            const dx = playerPos.x - centerX;
            const dy = playerPos.y - centerY;
            const distSq = dx * dx + dy * dy;
            
            if (distSq < HUNTING_VILLAGE_ZONE_RADIUS * HUNTING_VILLAGE_ZONE_RADIUS) {
                return 'hunting_village';
            }
        }
    }

    // Check for hot springs
    // Hot spring shacks are placed at offset from the hot spring center
    // We reverse-calculate the center from shack positions
    const hotSpringParts = Array.from(monumentParts.values())
        .filter((part: any) => part.monumentType?.tag === 'HotSpring');
    
    if (hotSpringParts.length > 0) {
        for (const part of hotSpringParts) {
            const partX = part.world_x ?? part.worldX;
            const partY = part.world_y ?? part.worldY;
            
            if (partX === undefined || partY === undefined) continue;
            
            // Reverse-calculate the hot spring center from shack position
            // Server places shacks at (-380, 250) from center, so center = shack + (380, -250)
            const centerX = partX - HOT_SPRING_SHACK_OFFSET_X;
            const centerY = partY - HOT_SPRING_SHACK_OFFSET_Y;
            
            const dx = playerPos.x - centerX;
            const dy = playerPos.y - centerY;
            const distSq = dx * dx + dy * dy;
            
            if (distSq < HOT_SPRINGS_ZONE_RADIUS * HOT_SPRINGS_ZONE_RADIUS) {
                return 'hot_springs';
            }
        }
    }

    return 'normal';
};

interface MusicSystemOptions extends Partial<MusicSystemConfig> {
    playerPosition?: PlayerPosition | null;
    monumentParts?: Map<string, any> | null; // Unified monument parts (will filter for fishing village internally)
    alkStations?: Map<string, AlkStation> | null; // ALK stations for zone detection
}

export const useMusicSystem = (options: MusicSystemOptions = {}) => {
    const { playerPosition, monumentParts, alkStations, ...config } = options;
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    
    const [state, setState] = useState<MusicSystemState>({
        isPlaying: false,
        currentTrack: null,
        currentTrackIndex: -1,
        isLoading: false,
        preloadProgress: 0,
        error: null,
        playlist: [],
        playlistPosition: 0,
        volume: finalConfig.volume,
        shuffleMode: finalConfig.shuffleMode,
        currentZone: 'normal',
        isPaused: false,
        pauseEndTime: null,
    });

    const currentAudioRef = useRef<HTMLAudioElement | null>(null);
    const nextAudioRef = useRef<HTMLAudioElement | null>(null);
    const configRef = useRef(finalConfig);
    const stateRef = useRef(state);

    // Track cleanup ref to store event listeners for proper cleanup
    const currentEventListenersRef = useRef<Array<() => void>>([]);
    
    // Clean up previous event listeners
    const cleanupEventListeners = useCallback(() => {
        currentEventListenersRef.current.forEach(cleanup => cleanup());
        currentEventListenersRef.current = [];
    }, []);

    // Forward reference for nextTrack function
    const nextTrackRef = useRef<(() => Promise<void>) | null>(null);
    
    // Ref to track pause timeout
    const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Update refs when state changes
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    useEffect(() => {
        configRef.current = finalConfig;
    }, [finalConfig]);

    // Preload all music tracks (including zone-specific tracks)
    const preloadAllTracks = useCallback(async () => {
        if (!finalConfig.preloadAll) return;

        // console.log('🎵 Starting music preload (including zone tracks)...');
        setState(prev => ({ ...prev, isLoading: true, preloadProgress: 0 }));

        let loadedCount = 0;
        const totalTracks = ALL_TRACKS.length;

        const loadPromises = ALL_TRACKS.map(async (track, index) => {
            try {
                await musicCache.get(track.path);
                loadedCount++;
                const progress = loadedCount / totalTracks;
                setState(prev => ({ ...prev, preloadProgress: progress }));
                // console.log(`🎵 Preloaded: ${track.displayName} (${loadedCount}/${totalTracks})`);
            } catch (error) {
                console.warn(`🎵 Failed to preload: ${track.displayName}`, error);
                loadedCount++; // Still count as "processed"
                setState(prev => ({ ...prev, preloadProgress: loadedCount / totalTracks }));
            }
        });

        await Promise.allSettled(loadPromises);
        
        setState(prev => ({ 
            ...prev, 
            isLoading: false, 
            preloadProgress: 1,
            error: loadedCount === 0 ? 'Failed to load any music tracks' : null
        }));

        // console.log(`🎵 Music preload complete! Loaded ${loadedCount}/${totalTracks} tracks`);
    }, [finalConfig.preloadAll]);

    // Get current zone's tracks
    const getCurrentZoneTracks = useCallback((): MusicTrack[] => {
        return ZONE_TRACKS[stateRef.current.currentZone] || NORMAL_TRACKS;
    }, []);

    // Play a specific track (using index within current zone's tracklist)
    const playTrackTransitionLockRef = useRef<Promise<void> | null>(null);
    const playTrack = useCallback(async (trackIndex: number, crossfade = true, zone?: MusicZone): Promise<void> => {
        // Wait for any in-progress transition to complete before starting a new one
        // This prevents overlapping crossfades and abrupt cutoffs
        if (playTrackTransitionLockRef.current) {
            await playTrackTransitionLockRef.current;
        }

        const transitionPromise = (async () => {
        try {
            const zoneToUse = zone ?? stateRef.current.currentZone;
            const zoneTracks = ZONE_TRACKS[zoneToUse] || NORMAL_TRACKS;
            const track = zoneTracks[trackIndex];
            if (!track) {
                throw new Error(`Invalid track index: ${trackIndex} for zone: ${zoneToUse}`);
            }

            // console.log(`🎵 Playing: ${track.displayName} (Zone: ${zoneToUse})`);

            // Clean up previous event listeners to prevent multiple tracks from auto-advancing
            cleanupEventListeners();

            // Get the audio element using the path
            const audio = await musicCache.get(track.path);
            const newAudio = audio.cloneNode() as HTMLAudioElement;
            newAudio.volume = 0; // Start silent for crossfade
            newAudio.currentTime = 0;

            // Set up next track preparation
            nextAudioRef.current = newAudio;

            // Crossfade if there's currently playing audio
            if (currentAudioRef.current && crossfade && configRef.current.crossfadeDuration > 0) {
                const baseDuration = configRef.current.crossfadeDuration;
                const currentZone = stateRef.current.currentZone;
                const targetZone = zone ?? currentZone;
                
                // Detect if we're leaving a special zone to return to normal
                // In this case, use a longer, more gradual fade-out
                const isLeavingSpecialZone = currentZone !== 'normal' && targetZone === 'normal';
                const isEnteringSpecialZone = currentZone === 'normal' && targetZone !== 'normal';
                const isZoneTransition = currentZone !== targetZone;
                
                // Use longer fade for zone transitions, especially when leaving special zones
                // Leaving feels more natural with a gradual fade-out; entering can be quicker
                const fadeOutDuration = isLeavingSpecialZone ? baseDuration * 1.8 : 
                                       isZoneTransition ? baseDuration * 1.4 : 
                                       baseDuration;
                const fadeInDuration = isEnteringSpecialZone ? baseDuration * 1.3 : baseDuration;
                
                // Use equal-power crossfade for zone transitions (prevents volume dip)
                // Use exponential for same-zone track changes (sounds more natural)
                const fadeCurve: FadeCurve = isZoneTransition ? 'equal-power' : 'exponential';
                
                const fadeOutPromise = fadeAudio(
                    currentAudioRef.current, 
                    currentAudioRef.current.volume, 
                    0, 
                    fadeOutDuration,
                    fadeCurve
                );
                
                const fadeInPromise = fadeAudio(
                    newAudio, 
                    0, 
                    configRef.current.volume, 
                    fadeInDuration,
                    fadeCurve
                );

                // Start new track
                await newAudio.play();
                
                // Run crossfade
                await Promise.all([fadeOutPromise, fadeInPromise]);
                
                // Stop old track
                currentAudioRef.current.pause();
                currentAudioRef.current.currentTime = 0;
            } else {
                // No crossfade, just start new track
                newAudio.volume = configRef.current.volume;
                await newAudio.play();
            }

            // Set up track end listener for automatic next track
            const handleTrackEnded = () => {
                // console.log('🎵 Track ended, checking if should auto-advance...');
                // Use stateRef to check current playing state
                if (stateRef.current.isPlaying) {
                    // console.log('🎵 Auto-advancing to next track');
                    // Call nextTrack via ref to avoid circular dependency
                    if (nextTrackRef.current) {
                        nextTrackRef.current().catch((error: Error) => {
                            console.error('🎵 Error auto-advancing to next track:', error);
                            setState(prev => ({ 
                                ...prev, 
                                error: `Failed to advance to next track: ${error.message || 'Unknown error'}` 
                            }));
                        });
                    }
                } else {
                    // console.log('🎵 Track ended but music system is not playing, skipping auto-advance');
                }
            };
            
            newAudio.addEventListener('ended', handleTrackEnded, { once: true });
            
            // Store cleanup function for this event listener
            const cleanup = () => newAudio.removeEventListener('ended', handleTrackEnded);
            currentEventListenersRef.current.push(cleanup);

            // Update current audio reference
            currentAudioRef.current = newAudio;
            nextAudioRef.current = null;

            // Update state
            setState(prev => ({
                ...prev,
                currentTrack: track,
                currentTrackIndex: trackIndex,
                isPlaying: true,
                error: null,
            }));

        } catch (error) {
            console.error('🎵 Error playing track:', error);
            setState(prev => ({ 
                ...prev, 
                error: `Failed to play track: ${(error as Error).message || 'Unknown error'}` 
            }));
        } finally {
            playTrackTransitionLockRef.current = null;
        }
        })();

        playTrackTransitionLockRef.current = transitionPromise;
        return transitionPromise;
    }, [cleanupEventListeners]);

    // Start music system (with optional zone override)
    const startMusic = useCallback(async (forceZone?: MusicZone) => {
        // console.log('🎵 Starting music system...');
        
        // Clear any active pause timeout when starting music
        if (pauseTimeoutRef.current) {
            clearTimeout(pauseTimeoutRef.current);
            pauseTimeoutRef.current = null;
        }
        
        // Use stateRef to get the most current state
        const currentState = stateRef.current;
        const zoneToUse = forceZone ?? currentState.currentZone;
        const zoneTracks = ZONE_TRACKS[zoneToUse] || NORMAL_TRACKS;
        
        let currentPlaylist = currentState.playlist;
        let startPosition = currentState.playlistPosition;
        
        // If no playlist exists or zone changed, create a new shuffled one
        if (currentPlaylist.length === 0 || currentPlaylist.length !== zoneTracks.length) {
            // console.log(`🎵 Creating new shuffled playlist for zone: ${zoneToUse}`);
            currentPlaylist = createShuffledPlaylist(zoneTracks.length);
            startPosition = 0;
            setState(prev => ({ 
                ...prev, 
                playlist: currentPlaylist, 
                playlistPosition: 0, 
                currentZone: zoneToUse,
                isPaused: false,
                pauseEndTime: null,
            }));
        }
        
        // If we're at the beginning (position 0), randomize the starting position
        // This ensures each game session starts with a different song
        if (startPosition === 0) {
            startPosition = Math.floor(Math.random() * currentPlaylist.length);
            setState(prev => ({ 
                ...prev, 
                playlistPosition: startPosition,
                isPaused: false,
                pauseEndTime: null,
            }));
            // console.log(`🎵 Randomized starting position: ${startPosition + 1}/${currentPlaylist.length}`);
        }

        const firstTrackIndex = currentPlaylist[startPosition];
        // console.log(`🎵 Starting with track: ${zoneTracks[firstTrackIndex]?.displayName}`);
        await playTrack(firstTrackIndex, false, zoneToUse); // No crossfade for first track
    }, [playTrack]); // Removed state dependencies to prevent stale closures

    // Stop music (with optional smooth fade-out to avoid abrupt cutoff)
    const stopMusic = useCallback(async () => {
        // console.log('🎵 Stopping music...');
        
        // Clear any active pause timeout
        if (pauseTimeoutRef.current) {
            clearTimeout(pauseTimeoutRef.current);
            pauseTimeoutRef.current = null;
        }
        
        const audioToFade = currentAudioRef.current;
        if (audioToFade && configRef.current.crossfadeDuration > 0) {
            // Smooth fade-out over 2.5 seconds before stopping
            const fadeOutMs = Math.min(2500, configRef.current.crossfadeDuration * 1.2);
            try {
                await fadeAudio(audioToFade, audioToFade.volume, 0, fadeOutMs, 'exponential');
            } catch {
                // Ignore - we're stopping anyway
            }
        }
        
        if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current.currentTime = 0;
        }
        
        if (nextAudioRef.current) {
            nextAudioRef.current.pause();
            nextAudioRef.current.currentTime = 0;
        }

        setState(prev => ({
            ...prev,
            isPlaying: false,
            currentTrack: null,
            currentTrackIndex: -1,
            isPaused: false,
            pauseEndTime: null,
        }));
    }, []);

    // Resume from pause
    const resumeFromPause = useCallback(async (): Promise<void> => {
        const currentState = stateRef.current;
        
        if (!currentState.isPlaying || !currentState.isPaused) {
            return;
        }

        // Clear pause timeout
        if (pauseTimeoutRef.current) {
            clearTimeout(pauseTimeoutRef.current);
            pauseTimeoutRef.current = null;
        }

        // Clear pause state
        setState(prev => ({ 
            ...prev, 
            isPaused: false, 
            pauseEndTime: null 
        }));

        // Continue to next track
        const zoneTracks = ZONE_TRACKS[currentState.currentZone] || NORMAL_TRACKS;
        let nextPosition = currentState.playlistPosition + 1;
        let playlistToUse = currentState.playlist;
        
        // If we've reached the end of the playlist, shuffle a new one
        if (nextPosition >= currentState.playlist.length) {
            const newPlaylist = createShuffledPlaylist(zoneTracks.length);
            playlistToUse = newPlaylist;
            nextPosition = 0;
            
            setState(prev => ({ 
                ...prev, 
                playlist: newPlaylist, 
                playlistPosition: nextPosition 
            }));
        } else {
            setState(prev => ({ 
                ...prev, 
                playlistPosition: nextPosition 
            }));
        }

        const nextTrackIndex = playlistToUse[nextPosition];
        // console.log(`🎵 Resuming from pause, playing track ${nextPosition + 1}/${playlistToUse.length}: ${zoneTracks[nextTrackIndex]?.displayName}`);
        
        await playTrack(nextTrackIndex);
    }, [playTrack]);

    // Next track
    const nextTrack = useCallback(async (): Promise<void> => {
        // Use stateRef.current to get the most up-to-date state
        const currentState = stateRef.current;
        
        if (!currentState.isPlaying) {
            // console.log('🎵 nextTrack called but music is not playing');
            return;
        }

        // Randomly decide if we should pause
        const shouldPause = Math.random() < PAUSE_PROBABILITY;
        
        if (shouldPause) {
            // Calculate random pause duration
            const pauseDuration = MIN_PAUSE_DURATION_MS + 
                Math.random() * (MAX_PAUSE_DURATION_MS - MIN_PAUSE_DURATION_MS);
            const pauseEndTime = Date.now() + pauseDuration;
            
            // console.log(`🎵 Random pause: ${Math.round(pauseDuration / 1000 / 60 * 10) / 10} minutes`);
            
            // Set pause state
            setState(prev => ({ 
                ...prev, 
                isPaused: true, 
                pauseEndTime 
            }));

            // Set up timeout to resume after pause
            pauseTimeoutRef.current = setTimeout(() => {
                resumeFromPause().catch((error: Error) => {
                    console.error('🎵 Error resuming from pause:', error);
                    setState(prev => ({ 
                        ...prev, 
                        error: `Failed to resume from pause: ${error.message || 'Unknown error'}`,
                        isPaused: false,
                        pauseEndTime: null
                    }));
                });
            }, pauseDuration);
            
            return;
        }

        // No pause, continue to next track normally
        const zoneTracks = ZONE_TRACKS[currentState.currentZone] || NORMAL_TRACKS;
        // console.log(`🎵 Moving to next track. Current position: ${currentState.playlistPosition}/${currentState.playlist.length}`);

        let nextPosition = currentState.playlistPosition + 1;
        let playlistToUse = currentState.playlist;
        
        // If we've reached the end of the playlist, shuffle a new one
        if (nextPosition >= currentState.playlist.length) {
            // console.log('🎵 End of playlist reached, creating new shuffled playlist');
            const newPlaylist = createShuffledPlaylist(zoneTracks.length);
            playlistToUse = newPlaylist;
            nextPosition = 0;
            
            setState(prev => ({ 
                ...prev, 
                playlist: newPlaylist, 
                playlistPosition: nextPosition 
            }));
        } else {
            setState(prev => ({ 
                ...prev, 
                playlistPosition: nextPosition 
            }));
        }

        const nextTrackIndex = playlistToUse[nextPosition];
        // console.log(`🎵 Playing track ${nextPosition + 1}/${playlistToUse.length}: ${zoneTracks[nextTrackIndex]?.displayName}`);
        
        await playTrack(nextTrackIndex);
    }, [playTrack, resumeFromPause]);

    // Set the nextTrack ref after the function is defined
    useEffect(() => {
        nextTrackRef.current = nextTrack;
    }, [nextTrack]);

    // Previous track
    const previousTrack = useCallback(async (): Promise<void> => {
        // Use stateRef.current to get the most up-to-date state  
        const currentState = stateRef.current;
        
        if (!currentState.isPlaying) return;

        // Clear any active pause timeout if manually skipping
        if (pauseTimeoutRef.current) {
            clearTimeout(pauseTimeoutRef.current);
            pauseTimeoutRef.current = null;
        }

        let prevPosition = currentState.playlistPosition - 1;
        
        // If we're at the beginning, go to end of playlist
        if (prevPosition < 0) {
            prevPosition = currentState.playlist.length - 1;
        }

        setState(prev => ({ 
            ...prev, 
            playlistPosition: prevPosition,
            isPaused: false,
            pauseEndTime: null,
        }));
        const prevTrackIndex = currentState.playlist[prevPosition];
        await playTrack(prevTrackIndex);
    }, [playTrack]);

    // Set volume
    const setVolume = useCallback((volume: number) => {
        const clampedVolume = Math.max(0, Math.min(1, volume)); // 0-100% range
        // console.log('🎵 Setting music volume to:', clampedVolume);
        
        if (currentAudioRef.current) {
            currentAudioRef.current.volume = clampedVolume;
        }

        // Update config
        configRef.current = { ...configRef.current, volume: clampedVolume };
        
        // Update state to reflect new volume
        setState(prev => ({ ...prev, volume: clampedVolume }));
    }, []);

    // Toggle shuffle mode
    const toggleShuffle = useCallback(() => {
        const currentState = stateRef.current;
        const currentConfig = configRef.current;
        const newShuffleMode = !currentState.shuffleMode; // Use state instead of config
        const zoneTracks = ZONE_TRACKS[currentState.currentZone] || NORMAL_TRACKS;
        
        // console.log(`🎵 Toggling shuffle mode: ${currentState.shuffleMode} → ${newShuffleMode}`);
        
        // Update config
        configRef.current = { ...currentConfig, shuffleMode: newShuffleMode };
        
        // Get current track index to preserve position
        const currentTrackIndex = currentState.currentTrackIndex;
        
        if (newShuffleMode) {
            // Create new shuffled playlist, but keep current track at the front if playing
            // console.log('🎵 Creating shuffled playlist');
            let newPlaylist = createShuffledPlaylist(zoneTracks.length);
            
            // If we're currently playing a track, move it to the front of the new playlist
            if (currentTrackIndex >= 0 && currentState.isPlaying) {
                newPlaylist = newPlaylist.filter(idx => idx !== currentTrackIndex);
                newPlaylist.unshift(currentTrackIndex);
                // console.log(`🎵 Moved current track ${currentTrackIndex} to front of shuffled playlist`);
            }
            
            setState(prev => ({ 
                ...prev, 
                playlist: newPlaylist, 
                playlistPosition: currentState.isPlaying ? 0 : Math.floor(Math.random() * newPlaylist.length),
                shuffleMode: newShuffleMode 
            }));
        } else {
            // Create ordered playlist (0, 1, 2, 3...)
            // console.log('🎵 Creating sequential playlist');
            const orderedPlaylist = Array.from({ length: zoneTracks.length }, (_, i) => i);
            
            // Set position to current track index if playing, otherwise start at 0
            const newPosition = currentState.isPlaying && currentTrackIndex >= 0 ? currentTrackIndex : 0;
            
            setState(prev => ({ 
                ...prev, 
                playlist: orderedPlaylist, 
                playlistPosition: newPosition,
                shuffleMode: newShuffleMode 
            }));
        }
        
        // console.log(`🎵 Shuffle mode is now: ${newShuffleMode ? 'ON' : 'OFF'}`);
    }, []);

    // Initialize music system
    useEffect(() => {
        if (finalConfig.enabled) {
            preloadAllTracks();
        }

        // Cleanup on unmount
        return () => {
            // console.log('🎵 Music system cleanup');
            cleanupEventListeners(); // Clean up any active event listeners
            if (pauseTimeoutRef.current) {
                clearTimeout(pauseTimeoutRef.current);
                pauseTimeoutRef.current = null;
            }
            if (zoneDebounceRef.current) {
                clearTimeout(zoneDebounceRef.current);
                zoneDebounceRef.current = null;
            }
            if (currentAudioRef.current) {
                currentAudioRef.current.pause();
            }
            if (nextAudioRef.current) {
                nextAudioRef.current.pause();
            }
            musicCache.clear();
        };
    }, [finalConfig.enabled, preloadAllTracks, cleanupEventListeners]);

    // Zone detection and switching with debouncing to prevent boundary flicker
    const detectedZone = useMemo(() => {
        return detectMusicZone(playerPosition ?? null, monumentParts ?? null, alkStations ?? null);
    }, [playerPosition?.x, playerPosition?.y, monumentParts, alkStations]);

    // Debounced zone: only switch when zone has been stable for ZONE_DEBOUNCE_MS
    const [debouncedZone, setDebouncedZone] = useState<MusicZone>(() => detectedZone);
    const zoneDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const previousZoneRef = useRef<MusicZone>(detectedZone);

    useEffect(() => {
        if (detectedZone === previousZoneRef.current) {
            // Zone unchanged - clear any pending debounce
            if (zoneDebounceRef.current) {
                clearTimeout(zoneDebounceRef.current);
                zoneDebounceRef.current = null;
            }
            return;
        }

        // Zone changed - start debounce timer
        if (zoneDebounceRef.current) {
            clearTimeout(zoneDebounceRef.current);
        }

        zoneDebounceRef.current = setTimeout(() => {
            zoneDebounceRef.current = null;
            previousZoneRef.current = detectedZone;
            setDebouncedZone(detectedZone);
        }, ZONE_DEBOUNCE_MS);

        return () => {
            if (zoneDebounceRef.current) {
                clearTimeout(zoneDebounceRef.current);
            }
        };
    }, [detectedZone]);

    // Switch zones when debounced zone changes and music is playing
    const previousDebouncedZoneRef = useRef<MusicZone>(debouncedZone);

    useEffect(() => {
        const currentState = stateRef.current;
        
        if (debouncedZone !== previousDebouncedZoneRef.current) {
            previousDebouncedZoneRef.current = debouncedZone;
            
            if (currentState.isPlaying) {
                const newZoneTracks = ZONE_TRACKS[debouncedZone] || NORMAL_TRACKS;
                const newPlaylist = createShuffledPlaylist(newZoneTracks.length);
                const randomStart = Math.floor(Math.random() * newPlaylist.length);
                
                setState(prev => ({
                    ...prev,
                    currentZone: debouncedZone,
                    playlist: newPlaylist,
                    playlistPosition: randomStart,
                }));
                
                const firstTrackIndex = newPlaylist[randomStart];
                playTrack(firstTrackIndex, true, debouncedZone).catch(err =>
                    console.error('🎵 Failed to switch zone music:', err)
                );
            } else {
                setState(prev => ({
                    ...prev,
                    currentZone: debouncedZone,
                    playlist: [],
                    playlistPosition: 0,
                }));
            }
        }
    }, [debouncedZone, playTrack]);

    // Get the current zone's tracklist for UI
    const currentZoneTracks = useMemo(() => {
        return ZONE_TRACKS[state.currentZone] || NORMAL_TRACKS;
    }, [state.currentZone]);

    // Play specific track by index (within current zone's tracklist)
    const playSpecificTrack = useCallback(async (trackIndex: number): Promise<void> => {
        const currentState = stateRef.current;
        const zoneTracks = ZONE_TRACKS[currentState.currentZone] || NORMAL_TRACKS;
        
        if (trackIndex < 0 || trackIndex >= zoneTracks.length) {
            console.error('🎵 Invalid track index:', trackIndex);
            return;
        }

        // Clear any active pause timeout if manually selecting a track
        if (pauseTimeoutRef.current) {
            clearTimeout(pauseTimeoutRef.current);
            pauseTimeoutRef.current = null;
        }

        // console.log(`🎵 Playing specific track: ${zoneTracks[trackIndex]?.displayName}`);
        
        // Update playlist position to match the selected track
        let newPosition = currentState.playlist.indexOf(trackIndex);
        
        // If the track isn't in the current playlist, add it or create a new playlist
        if (newPosition === -1) {
            // Create a new playlist starting with the selected track
            const newPlaylist = [trackIndex, ...currentState.playlist.filter(idx => idx !== trackIndex)];
            newPosition = 0;
            setState(prev => ({ 
                ...prev, 
                playlist: newPlaylist, 
                playlistPosition: newPosition,
                isPaused: false,
                pauseEndTime: null,
            }));
        } else {
            setState(prev => ({ 
                ...prev, 
                playlistPosition: newPosition,
                isPaused: false,
                pauseEndTime: null,
            }));
        }

        // Play the track
        await playTrack(trackIndex);
    }, [playTrack]);

    // Public API
    return {
        // State
        isPlaying: state.isPlaying,
        currentTrack: state.currentTrack,
        isLoading: state.isLoading,
        preloadProgress: state.preloadProgress,
        error: state.error,
        volume: state.volume,
        shuffleMode: state.shuffleMode,
        isPaused: state.isPaused,
        pauseEndTime: state.pauseEndTime,
        
        // Controls
        start: startMusic,
        stop: stopMusic,
        next: nextTrack,
        previous: previousTrack,
        setVolume,
        toggleShuffle,
        
        // Info - use current zone's tracklist
        tracklist: currentZoneTracks,
        currentPosition: state.playlistPosition + 1,
        totalTracks: currentZoneTracks.length,
        
        // Zone info
        currentZone: state.currentZone,
        zoneInfo: MUSIC_ZONE_INFO[state.currentZone],
        
        // New function
        playSpecificTrack,
    };
}; 