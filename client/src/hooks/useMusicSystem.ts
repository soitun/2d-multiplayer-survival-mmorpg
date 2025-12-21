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
export type MusicZone = 'normal' | 'fishing_village' | 'alk_compound';

// Zone metadata for UI display
export const MUSIC_ZONE_INFO: Record<MusicZone, { name: string; icon: string }> = {
    normal: { name: 'Wilderness', icon: '🌲' },
    fishing_village: { name: 'Fishing Village', icon: '🎣' },
    alk_compound: { name: 'ALK Compound', icon: '🏭' },
};

// Zone detection radius in pixels (matches server clearance::FISHING_VILLAGE)
const FISHING_VILLAGE_ZONE_RADIUS = 500;

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

// Zone-based track mapping
const ZONE_TRACKS: Record<MusicZone, MusicTrack[]> = {
    normal: NORMAL_TRACKS,
    fishing_village: FISHING_VILLAGE_TRACKS,
    alk_compound: NORMAL_TRACKS, // Placeholder until ALK music is added
};

// All tracks for preloading
const ALL_TRACKS: MusicTrack[] = [...NORMAL_TRACKS, ...FISHING_VILLAGE_TRACKS];

// Legacy export for backward compatibility
const MUSIC_TRACKS = NORMAL_TRACKS;

const DEFAULT_CONFIG: MusicSystemConfig = {
    enabled: true,
    volume: 0.5, // 50% volume for background music (0.5 out of 1.0 max)
    crossfadeDuration: 2000, // 2 second crossfade
    shuffleMode: true,
    preloadAll: true,
};

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
}

// Player position for zone detection
interface PlayerPosition {
    x: number;
    y: number;
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
            }, 15000); // 15 second timeout - fail faster rather than block loading

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

const fadeAudio = async (audio: HTMLAudioElement, fromVolume: number, toVolume: number, duration: number): Promise<void> => {
    return new Promise((resolve) => {
        const steps = 60; // 60 steps for smooth fade
        const stepDuration = duration / steps;
        const volumeStep = (toVolume - fromVolume) / steps;
        let currentStep = 0;

        const fade = () => {
            if (currentStep >= steps) {
                audio.volume = toVolume;
                resolve();
                return;
            }

            audio.volume = fromVolume + (volumeStep * currentStep);
            currentStep++;
            setTimeout(fade, stepDuration);
        };

        fade();
    });
};

// Helper function to detect which music zone the player is in
const detectMusicZone = (
    playerPos: PlayerPosition | null,
    fishingVillageParts: Map<string, any> | null
): MusicZone => {
    if (!playerPos || !fishingVillageParts || fishingVillageParts.size === 0) {
        return 'normal';
    }

    // Find the fishing village center (campfire)
    let centerX: number | null = null;
    let centerY: number | null = null;

    for (const part of fishingVillageParts.values()) {
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
        for (const part of fishingVillageParts.values()) {
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

    // Future: Add ALK compound zone detection here
    // For now, return normal
    return 'normal';
};

interface MusicSystemOptions extends Partial<MusicSystemConfig> {
    playerPosition?: PlayerPosition | null;
    fishingVillageParts?: Map<string, any> | null;
}

export const useMusicSystem = (options: MusicSystemOptions = {}) => {
    const { playerPosition, fishingVillageParts, ...config } = options;
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

    // Update refs when state changes
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    useEffect(() => {
        configRef.current = finalConfig;
    }, [finalConfig]);

    // Preload all music tracks (including zone-specific tracks) - STAGGERED to prevent server overload
    const preloadAllTracks = useCallback(async () => {
        if (!finalConfig.preloadAll) return;

        // console.log('🎵 Starting music preload (including zone tracks)...');
        setState(prev => ({ ...prev, isLoading: true, preloadProgress: 0 }));

        let loadedCount = 0;
        const totalTracks = ALL_TRACKS.length;
        const BATCH_SIZE = 1; // Only 1 concurrent music file request (they're large and Railway throttles)
        const DELAY_BETWEEN_BATCHES = 500; // 500ms between batches for production

        // Load tracks in small batches to prevent overwhelming the server
        for (let i = 0; i < ALL_TRACKS.length; i += BATCH_SIZE) {
            const batch = ALL_TRACKS.slice(i, i + BATCH_SIZE);
            const loadPromises = batch.map(async (track) => {
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
            
            // Small delay between batches to prevent overwhelming the server
            if (i + BATCH_SIZE < ALL_TRACKS.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
        }
        
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
    const playTrack = useCallback(async (trackIndex: number, crossfade = true, zone?: MusicZone): Promise<void> => {
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
                const fadeOutPromise = fadeAudio(
                    currentAudioRef.current, 
                    currentAudioRef.current.volume, 
                    0, 
                    configRef.current.crossfadeDuration
                );
                
                const fadeInPromise = fadeAudio(
                    newAudio, 
                    0, 
                    configRef.current.volume, 
                    configRef.current.crossfadeDuration
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
        }
    }, [cleanupEventListeners]);

    // Start music system (with optional zone override)
    const startMusic = useCallback(async (forceZone?: MusicZone) => {
        // console.log('🎵 Starting music system...');
        
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
            setState(prev => ({ ...prev, playlist: currentPlaylist, playlistPosition: 0, currentZone: zoneToUse }));
        }
        
        // If we're at the beginning (position 0), randomize the starting position
        // This ensures each game session starts with a different song
        if (startPosition === 0) {
            startPosition = Math.floor(Math.random() * currentPlaylist.length);
            setState(prev => ({ ...prev, playlistPosition: startPosition }));
            // console.log(`🎵 Randomized starting position: ${startPosition + 1}/${currentPlaylist.length}`);
        }

        const firstTrackIndex = currentPlaylist[startPosition];
        // console.log(`🎵 Starting with track: ${zoneTracks[firstTrackIndex]?.displayName}`);
        await playTrack(firstTrackIndex, false, zoneToUse); // No crossfade for first track
    }, [playTrack]); // Removed state dependencies to prevent stale closures

    // Stop music
    const stopMusic = useCallback(() => {
        // console.log('🎵 Stopping music...');
        
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
        }));
    }, []);

    // Next track
    const nextTrack = useCallback(async (): Promise<void> => {
        // Use stateRef.current to get the most up-to-date state
        const currentState = stateRef.current;
        
        if (!currentState.isPlaying) {
            // console.log('🎵 nextTrack called but music is not playing');
            return;
        }

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
    }, [playTrack]);

    // Set the nextTrack ref after the function is defined
    useEffect(() => {
        nextTrackRef.current = nextTrack;
    }, [nextTrack]);

    // Previous track
    const previousTrack = useCallback(async (): Promise<void> => {
        // Use stateRef.current to get the most up-to-date state  
        const currentState = stateRef.current;
        
        if (!currentState.isPlaying) return;

        let prevPosition = currentState.playlistPosition - 1;
        
        // If we're at the beginning, go to end of playlist
        if (prevPosition < 0) {
            prevPosition = currentState.playlist.length - 1;
        }

        setState(prev => ({ ...prev, playlistPosition: prevPosition }));
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
            if (currentAudioRef.current) {
                currentAudioRef.current.pause();
            }
            if (nextAudioRef.current) {
                nextAudioRef.current.pause();
            }
            musicCache.clear();
        };
    }, [finalConfig.enabled, preloadAllTracks]);

    // Zone detection and switching
    const detectedZone = useMemo(() => {
        return detectMusicZone(playerPosition ?? null, fishingVillageParts ?? null);
    }, [playerPosition?.x, playerPosition?.y, fishingVillageParts]);

    // Switch zones when detected zone changes and music is playing
    const previousZoneRef = useRef<MusicZone>('normal');
    useEffect(() => {
        const currentState = stateRef.current;
        
        // Only switch if the zone actually changed
        if (detectedZone !== previousZoneRef.current) {
            // console.log(`🎵 Zone changed: ${previousZoneRef.current} → ${detectedZone}`);
            previousZoneRef.current = detectedZone;
            
            // If music is playing, switch to the new zone's playlist
            if (currentState.isPlaying) {
                const newZoneTracks = ZONE_TRACKS[detectedZone] || NORMAL_TRACKS;
                const newPlaylist = createShuffledPlaylist(newZoneTracks.length);
                const randomStart = Math.floor(Math.random() * newPlaylist.length);
                
                setState(prev => ({
                    ...prev,
                    currentZone: detectedZone,
                    playlist: newPlaylist,
                    playlistPosition: randomStart,
                }));
                
                // Play the first track of the new zone's playlist with crossfade
                const firstTrackIndex = newPlaylist[randomStart];
                playTrack(firstTrackIndex, true, detectedZone).catch(err => {
                    console.error('🎵 Failed to switch zone music:', err);
                });
            } else {
                // Just update the zone without playing
                setState(prev => ({
                    ...prev,
                    currentZone: detectedZone,
                    playlist: [],
                    playlistPosition: 0,
                }));
            }
        }
    }, [detectedZone, playTrack]);

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
                playlistPosition: newPosition 
            }));
        } else {
            setState(prev => ({ 
                ...prev, 
                playlistPosition: newPosition 
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