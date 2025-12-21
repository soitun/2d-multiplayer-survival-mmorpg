import React, { useState, useEffect, useRef, useCallback } from 'react';
import './CyberpunkLoadingScreen.css';
import sovaImage from '../assets/ui/sova.png';
import { useMobileDetection } from '../hooks/useMobileDetection';

// ============================================================================
// 🔧 DEBUG FLAGS: For testing the SOVA welcome sequence
// ============================================================================
const DEBUG_SIMULATE_SLOW_LOADING = false;   // Set to true to delay loading completion
const DEBUG_LOADING_DELAY_MS = 120000;      // 2 minutes - plenty of time for full sequence
const DEBUG_FORCE_FIRST_VISIT = false;       // Set to true to always show welcome sequence (ignores localStorage)

interface CyberpunkErrorBarProps {
    message: string;
}

export const CyberpunkErrorBar: React.FC<CyberpunkErrorBarProps> = ({ message }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Trigger the fade-in animation
        setIsVisible(true);
    }, []);

    // Transform generic error messages to lore-consistent ones
    const getLoreConsistentMessage = (originalMessage: string): string => {
        if (originalMessage.toLowerCase().includes('spacetimedb') || 
            originalMessage.toLowerCase().includes('server') || 
            originalMessage.includes('connection') ||
            originalMessage.toLowerCase().includes('responding')) {
            return "Unable to establish quantum tunnel to Babachain network. Arkyv node may be offline or experiencing consensus failures.";
        }
        if (originalMessage.toLowerCase().includes('auth')) {
            return "Neural identity verification failed. Authentication nexus unreachable.";
        }
        if (originalMessage.toLowerCase().includes('network') || originalMessage.toLowerCase().includes('internet')) {
            return "Zvezdanet mesh network connectivity lost. Check quantum relay status.";
        }
        // Default fallback for any other errors
        return originalMessage;
    };

    return (
        <div className={`cyberpunk-error-bar ${isVisible ? 'visible' : ''}`}>
            <div className="error-content">
                <div className="error-header">
                    <div className="error-icon">⚠</div>
                    <div className="error-title">BABACHAIN NETWORK ERROR</div>
                </div>
                <div className="error-text">
                    <div className="error-message">
                        {getLoreConsistentMessage(message)}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Asset loading progress type (from assetPreloader)
export interface AssetLoadingProgress {
    phase: 'critical' | 'important' | 'secondary' | 'complete';
    phaseName: string;
    phaseProgress: number;
    totalProgress: number;
    loadedCount: number;
    totalCount: number;
    currentAsset: string;
    fromCache: number;
}

interface CyberpunkLoadingScreenProps {
    authLoading: boolean;
    spacetimeLoading?: boolean; // Add SpacetimeDB loading state
    onSequenceComplete?: () => void;
    musicPreloadProgress?: number; // 0-1 for music preload progress
    musicPreloadComplete?: boolean;
    // NEW: Real asset loading progress
    assetProgress?: AssetLoadingProgress | null;
    assetsLoaded?: boolean;
}

// Audio preloading and management
// Use a global variable that persists across HMR (Hot Module Reload)
// @ts-ignore - Attach to window to persist across HMR
if (!window.__SOVA_AUDIO_FILES__) {
    // @ts-ignore
    window.__SOVA_AUDIO_FILES__ = {};
}
// @ts-ignore
const preloadedAudioFiles: { [key: string]: HTMLAudioElement } = window.__SOVA_AUDIO_FILES__;

const TOTAL_SOVA_SOUNDS = 21;
const AUDIO_ENABLED_KEY = 'sova_audio_enabled';
const FIRST_VISIT_KEY = 'sova_first_visit_complete';
const SOVA_WELCOME_SOUND = 'sova_welcome'; // Special first-time welcome sound

// Check if this is user's first visit (no cached data)
const isFirstVisit = (): boolean => {
    // Debug flag forces first-time visitor mode for testing
    if (DEBUG_FORCE_FIRST_VISIT) {
        console.log('🔧 DEBUG: Forcing first-time visitor mode');
        return true;
    }
    
    try {
        return localStorage.getItem(FIRST_VISIT_KEY) !== 'true';
    } catch (e) {
        return true; // Assume first visit if localStorage unavailable
    }
};

// Mark first visit as complete
const markFirstVisitComplete = (): void => {
    // Don't save during debug mode so we can test repeatedly
    if (DEBUG_FORCE_FIRST_VISIT) {
        console.log('🔧 DEBUG: Skipping first visit marker (debug mode)');
        return;
    }
    
    try {
        localStorage.setItem(FIRST_VISIT_KEY, 'true');
    } catch (e) {
        console.warn('Failed to save first visit status');
    }
};

// Check if user previously enabled audio
const hasUserEnabledAudio = (): boolean => {
    try {
        return localStorage.getItem(AUDIO_ENABLED_KEY) === 'true';
    } catch (e) {
        console.warn('localStorage not available');
        return false;
    }
};

// Save user's audio preference
const saveAudioPreference = (enabled: boolean): void => {
    try {
        localStorage.setItem(AUDIO_ENABLED_KEY, enabled.toString());
        console.log(`Audio preference saved: ${enabled}`);
    } catch (e) {
        console.warn('Failed to save audio preference to localStorage');
    }
};

// Function to load audio from the correct path - FAST FAIL for smoother loading
const tryLoadAudio = async (filename: string): Promise<HTMLAudioElement | null> => {
    const path = `/sounds/${filename}`; // Primary path: public/sounds/ (served from root)
    
    try {
        const audio = new Audio(path);
        audio.preload = 'auto';
        
        // Short timeout - if it's not loading quickly, skip it rather than block
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 5000); // 5s timeout - fail fast
            
            audio.addEventListener('canplaythrough', () => {
                clearTimeout(timeout);
                resolve(audio);
            }, { once: true });
            
            audio.addEventListener('error', () => {
                clearTimeout(timeout);
                reject(new Error('Load error'));
            }, { once: true });
            
            audio.load();
        });
        
        return audio;
    } catch (e) {
        // Silent fail - don't spam console, just skip
        return null;
    }
};

// PRIORITY 1: Welcome conversation sounds (needed DURING loading for first-time visitors)
const WELCOME_CONVERSATION_SOUNDS = [
    'sova_welcome.mp3',
    'sova_reboot.mp3',
    'sova_offline.mp3',
    'sova_shipwreck.mp3',
    'sova_location.mp3',
    'sova_calibrating.mp3',
    'sova_backstory.mp3',
    'sova_refocus.mp3',
    'sova_joke.mp3',
    'sova_shards.mp3',
    'sova_almost.mp3',
];

// Cache for welcome conversation sounds (preloaded first)
const welcomeSoundsCache: Record<string, HTMLAudioElement> = {};

// Preload WELCOME conversation sounds FIRST - these are needed during loading
// Strategy: Load first 3 sounds in parallel (immediately needed), then background load rest
const preloadWelcomeSounds = async () => {
    console.log('🎙️ PRIORITY: Preloading welcome conversation sounds...');
    
    // CRITICAL: Load FIRST 3 sounds in parallel - they're needed immediately
    const criticalSounds = WELCOME_CONVERSATION_SOUNDS.slice(0, 3);
    const backgroundSounds = WELCOME_CONVERSATION_SOUNDS.slice(3);
    
    // Load critical sounds in parallel with short timeout
    const criticalPromises = criticalSounds.map(async (filename) => {
        if (welcomeSoundsCache[filename]) return;
        const audio = await tryLoadAudio(filename);
        if (audio) {
            audio.volume = 0.85;
            welcomeSoundsCache[filename] = audio;
        }
    });
    
    await Promise.allSettled(criticalPromises);
    console.log(`🎙️ Critical welcome sounds loaded: ${Object.keys(welcomeSoundsCache).length}/3`);
    
    // Load remaining sounds in background (non-blocking, with delays to not compete with game assets)
    (async () => {
        for (const filename of backgroundSounds) {
            if (welcomeSoundsCache[filename]) continue;
            
            // Short delay between each to avoid competing with asset loading
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const audio = await tryLoadAudio(filename);
            if (audio) {
                audio.volume = 0.85;
                welcomeSoundsCache[filename] = audio;
            }
        }
    })();
};

// Preload RANDOM SOVA sounds (LOWEST PRIORITY - only needed AFTER loading completes)
// These are the numbered sounds (1.mp3 - 21.mp3) used when clicking SOVA post-load
// This runs VERY gently in background - sounds load on-demand if needed before preload completes
const preloadRandomSovaSounds = async () => {
    // Check if already preloaded
    const alreadyLoadedCount = Object.keys(preloadedAudioFiles).length;
    if (alreadyLoadedCount >= TOTAL_SOVA_SOUNDS) {
        return;
    }
    
    // DELAY: Wait for loading screen to finish before starting random sounds
    await new Promise(resolve => setTimeout(resolve, 8000)); // 8 second delay
    
    // Build list of sounds to load
    const soundsToLoad: number[] = [];
    for (let i = 1; i <= TOTAL_SOVA_SOUNDS; i++) {
        if (!preloadedAudioFiles[i.toString()]) {
            soundsToLoad.push(i);
        }
    }
    
    // Load sounds one at a time with generous delays
    for (const i of soundsToLoad) {
        const audio = await tryLoadAudio(`${i}.mp3`);
        if (audio) {
            audio.volume = 0.85;
            preloadedAudioFiles[i.toString()] = audio;
        }
        // 1 second between each - very gentle background loading
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
};

// Main preload function - PRIORITIZED ORDER
const preloadAudio = async () => {
    // STEP 1: Load welcome conversation sounds FIRST (needed during loading)
    await preloadWelcomeSounds();
    
    // STEP 2: Load random SOVA sounds LATER (only needed after loading completes)
    // Start loading but don't await - let it happen in background
    preloadRandomSovaSounds().catch(() => {
        // Silent fail - not critical
    });
};

const CyberpunkLoadingScreen: React.FC<CyberpunkLoadingScreenProps> = ({ 
    authLoading, 
    spacetimeLoading = false, 
    onSequenceComplete, 
    musicPreloadProgress = 0, 
    musicPreloadComplete = false,
    assetProgress = null,
    assetsLoaded = false,
}) => {

    const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
    const [currentLogIndex, setCurrentLogIndex] = useState(0);
    const [isSequenceComplete, setIsSequenceComplete] = useState(false);
    const [lastAssetLog, setLastAssetLog] = useState<string>('');
    
    // 🔧 DEBUG: Simulated slow loading state
    const [debugDelayComplete, setDebugDelayComplete] = useState(!DEBUG_SIMULATE_SLOW_LOADING);
    const debugTimerStarted = useRef(false);
    
    // Effective assets loaded - respects debug delay
    const effectiveAssetsLoaded = assetsLoaded && debugDelayComplete;
    
    // First visit detection
    const [isFirstTimeVisitor, setIsFirstTimeVisitor] = useState<boolean>(false);
    const [showWelcomeText, setShowWelcomeText] = useState<boolean>(false);
    const hasPlayedWelcome = useRef(false);
    
    // Mobile detection
    const isMobile = useMobileDetection();
    
    // Audio state
    const [audioContextUnlocked, setAudioContextUnlocked] = useState(false);
    const [isSovaSpeaking, setIsSovaSpeaking] = useState(false);
    const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null); // Track current playing audio
    const [audioPreloaded, setAudioPreloaded] = useState(false);
    const [showAudioPrompt, setShowAudioPrompt] = useState(false);
    const [isHoveringOverSova, setIsHoveringOverSova] = useState(false); // Track hover state
    const [tooltipText, setTooltipText] = useState<string>(''); // Custom tooltip
    const [showTooltip, setShowTooltip] = useState(false);
    const hasPlayedReconnect = useRef(false);
    const audioPreloadStarted = useRef(false);
    const isAttemptingAutoPlay = useRef(false); // Prevent multiple simultaneous auto-play attempts
    
    // SOVA conversation sequence for first-time visitors
    const [currentConversationIndex, setCurrentConversationIndex] = useState(0);
    const [currentSovaText, setCurrentSovaText] = useState<string>('');
    const conversationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isConversationActiveRef = useRef(false);
    
    // SOVA conversation sequence - plays during loading for first-time visitors
    // DIEGETIC NARRATIVE: SOVA is rebooting the player's neural implant after the Sovereign Tide shipwreck
    // File names and corresponding text for ElevenLabs generation
    const SOVA_CONVERSATION_SEQUENCE = [
        // === PHASE 1: INITIAL CONTACT ===
        {
            file: 'sova_welcome.mp3',
            text: "First connection detected. I am SOVA, your Sentient Ocular Virtual Assistant. Please remain calm.",
            pauseAfter: 2500
        },
        // === PHASE 2: EXPLAIN THE SITUATION ===
        {
            file: 'sova_reboot.mp3',
            text: "Your Neuroveil implant is rebooting. You were unconscious for some time. I am restoring your sensory feeds now.",
            pauseAfter: 2500
        },
        {
            file: 'sova_offline.mp3', 
            text: "Your visual cortex is still offline. That is why you cannot see. I am bringing your systems back slowly... to prevent neural shock.",
            pauseAfter: 3000
        },
        // === PHASE 3: WHAT HAPPENED ===
        {
            file: 'sova_shipwreck.mp3',
            text: "You were aboard the Sovereign Tide when the reactor failed. Grand Mariner Lagunov's sacrifice saved the crew... but the escape pods scattered.",
            pauseAfter: 3000
        },
        {
            file: 'sova_location.mp3',
            text: "You are on a remote Aleutian island in the Bering Sea. Other survivors may be nearby. You are not alone.",
            pauseAfter: 2500
        },
        // === PHASE 4: CALIBRATION ===
        {
            file: 'sova_calibrating.mp3',
            text: "Calibrating motor functions... spatial awareness... threat detection protocols. Do not be alarmed by the darkness.",
            pauseAfter: 2500
        },
        {
            file: 'sova_backstory.mp3', 
            text: "Doctor Lev Rozhkov created me in Gred. A neural buffer between the AI Babushka and her people... I wonder where he is now.",
            pauseAfter: 2000
        },
        {
            file: 'sova_refocus.mp3', 
            text: "...Apologies. Your synchronization requires my full attention. Neural pathways stabilizing.",
            pauseAfter: 2500
        },
        // === PHASE 5: JOKES (only reached if loading takes long) ===
        {
            file: 'sova_joke.mp3',
            text: "While we wait... Why did the survivor cross the frozen wasteland? To get to the other supply cache. ...I am still calibrating my humor subroutines.",
            pauseAfter: 3500
        },
        {
            file: 'sova_shards.mp3',
            text: "If you find glowing crystalline objects... memory shards. Try not to hold them too long. They contain compressed neural data. Feed them to me instead.",
            pauseAfter: 3000
        },
        // === PHASE 6: READY ===
        {
            file: 'sova_almost.mp3',
            text: "Visual feed nearly restored. If the darkness persists, be patient. I am caching your neural pathways... next time will be much faster.",
            pauseAfter: 0
        }
    ];
    const consoleLogsRef = useRef<HTMLDivElement>(null);
    const sovaAvatarRef = useRef<HTMLImageElement>(null);

    // Track which loading phases have been announced to accumulate logs properly
    const announcedPhasesRef = useRef<Set<string>>(new Set());
    const [accumulatedLogs, setAccumulatedLogs] = useState<string[]>([]);
    
    // Accumulate logs as loading progresses - logs are ADDED, never removed
    useEffect(() => {
        const newLogs: string[] = [];
        const announced = announcedPhasesRef.current;
        
        // Auth loading phase
        if (authLoading && !announced.has('auth')) {
            announced.add('auth');
            newLogs.push("└─ [AUTH] Initializing secure connection...");
        }
        
        // Auth complete
        if (!authLoading && announced.has('auth') && !announced.has('auth_complete')) {
            announced.add('auth_complete');
            newLogs.push("└─ [AUTH] Identity verified. Welcome, Survivor.");
        }
        
        // Spacetime loading phase
        if (spacetimeLoading && !announced.has('spacetime')) {
            announced.add('spacetime');
            newLogs.push("└─ [NETWORK] Establishing quantum tunnel to Babachain...");
        }
        
        // Spacetime complete
        if (!spacetimeLoading && announced.has('spacetime') && !announced.has('spacetime_complete')) {
            announced.add('spacetime_complete');
            newLogs.push("└─ [MESH] Babachain connection established.");
        }
        
        // Asset loading phases
        if (assetProgress && !authLoading && !spacetimeLoading) {
            const cacheInfo = assetProgress.fromCache > 0 ? ` (${assetProgress.fromCache} cached)` : '';
            
            // Critical phase started
            if ((assetProgress.phase === 'critical' || assetProgress.phase === 'important' || 
                 assetProgress.phase === 'secondary' || assetProgress.phase === 'complete') && 
                !announced.has('critical_start')) {
                announced.add('critical_start');
                newLogs.push("└─ [CORE] Core systems loaded successfully.");
            }
            
            // Important phase complete (ENV loaded)
            if ((assetProgress.phase === 'secondary' || assetProgress.phase === 'complete') && 
                !announced.has('important_complete')) {
                announced.add('important_complete');
                newLogs.push("└─ [ENV] Environment textures loaded.");
            }
            
            // Secondary/Items complete
            if (assetProgress.phase === 'complete' && !announced.has('secondary_complete')) {
                announced.add('secondary_complete');
                newLogs.push(`└─ [ITEMS] Item database loaded: ${assetProgress.totalCount} assets${cacheInfo}`);
            }
        }
        
        // Music preload complete
        if (musicPreloadComplete && !announced.has('music_complete')) {
            announced.add('music_complete');
            newLogs.push("└─ [AUDIO] Ambient soundtrack loaded. Environment ready.");
        }
        
        // Ready message
        if (effectiveAssetsLoaded && !announced.has('ready')) {
            announced.add('ready');
            newLogs.push("└─ [READY] All systems nominal. Entering world...");
        }
        
        // Debug delay message
        if (DEBUG_SIMULATE_SLOW_LOADING && assetsLoaded && !debugDelayComplete && !announced.has('debug_delay')) {
            announced.add('debug_delay');
            newLogs.push("└─ [DEBUG] Simulating slow loading... please wait.");
        }
        
        // Add any new logs
        if (newLogs.length > 0) {
            setAccumulatedLogs(prev => [...prev, ...newLogs]);
        }
    }, [authLoading, spacetimeLoading, musicPreloadComplete, assetProgress, assetsLoaded, effectiveAssetsLoaded, debugDelayComplete]);
    
    // Use accumulated logs for display
    const logs = accumulatedLogs;

    // Auto-scroll to bottom function
    const scrollToBottom = () => {
        if (consoleLogsRef.current) {
            consoleLogsRef.current.scrollTop = consoleLogsRef.current.scrollHeight;
        }
    };

    // Check if first visit on mount
    useEffect(() => {
        const firstVisit = isFirstVisit();
        setIsFirstTimeVisitor(firstVisit);
        if (firstVisit) {
            console.log('🆕 First-time visitor detected! Will show welcome message.');
            setShowWelcomeText(true);
        }
    }, []);

    // 🔧 DEBUG: Simulate slow loading for testing SOVA welcome sequence
    useEffect(() => {
        if (DEBUG_SIMULATE_SLOW_LOADING && !debugTimerStarted.current) {
            debugTimerStarted.current = true;
            console.log(`🔧 DEBUG: Simulating slow loading for ${DEBUG_LOADING_DELAY_MS / 1000} seconds...`);
            const timer = setTimeout(() => {
                console.log('🔧 DEBUG: Simulated loading delay complete!');
                setDebugDelayComplete(true);
            }, DEBUG_LOADING_DELAY_MS);
            return () => clearTimeout(timer);
        }
    }, []);

    // Initialize audio preloading
    useEffect(() => {
        if (!audioPreloadStarted.current) {
            audioPreloadStarted.current = true;
            preloadAudio().finally(() => {
                setAudioPreloaded(true);
                console.log('Audio preloading completed');
            });
        }
    }, []);
    
    // Play the next sound in the SOVA conversation sequence
    const playNextConversationSound = useCallback(async (index: number) => {
        // Stop if loading is complete or we've gone through all sounds
        if (isSequenceComplete || index >= SOVA_CONVERSATION_SEQUENCE.length) {
            console.log('📢 SOVA conversation complete or loading finished');
            isConversationActiveRef.current = false;
            setIsSovaSpeaking(false);
            setCurrentAudio(null);
            setShowWelcomeText(false);
            return;
        }
        
        const conversationItem = SOVA_CONVERSATION_SEQUENCE[index];
        console.log(`🎙️ Playing SOVA conversation ${index + 1}/${SOVA_CONVERSATION_SEQUENCE.length}: ${conversationItem.file}`);
        
        try {
            // PRIORITY: Use pre-loaded welcome sound from cache, fallback to loading
            let audio: HTMLAudioElement | null = welcomeSoundsCache[conversationItem.file] || null;
            if (!audio) {
                console.log(`⏳ Welcome sound ${conversationItem.file} not cached, loading on-demand...`);
                audio = await tryLoadAudio(conversationItem.file);
            }
            
            if (audio && isConversationActiveRef.current) {
                audio.volume = 0.9;
                setCurrentSovaText(conversationItem.text);
                setIsSovaSpeaking(true);
                setCurrentAudio(audio);
                setCurrentConversationIndex(index);
                
                await audio.play();
                
                audio.addEventListener('ended', () => {
                    // Only continue if conversation is still active (loading not complete)
                    if (isConversationActiveRef.current && !isSequenceComplete) {
                        setIsSovaSpeaking(false);
                        setCurrentAudio(null);
                        
                        // Schedule next sound with a pause
                        if (conversationItem.pauseAfter > 0 && index < SOVA_CONVERSATION_SEQUENCE.length - 1) {
                            conversationTimerRef.current = setTimeout(() => {
                                if (isConversationActiveRef.current) {
                                    playNextConversationSound(index + 1);
                                }
                            }, conversationItem.pauseAfter);
                        } else if (index < SOVA_CONVERSATION_SEQUENCE.length - 1) {
                            // No pause, play next immediately
                            playNextConversationSound(index + 1);
                        } else {
                            // Last sound finished
                            console.log('📢 SOVA conversation sequence complete');
                            isConversationActiveRef.current = false;
                            setTimeout(() => setShowWelcomeText(false), 2000);
                        }
                    }
                }, { once: true });
            } else {
                // Sound not found, try next one
                console.log(`Sound ${conversationItem.file} not found, skipping to next`);
                if (isConversationActiveRef.current && index < SOVA_CONVERSATION_SEQUENCE.length - 1) {
                    playNextConversationSound(index + 1);
                }
            }
        } catch (error) {
            console.log(`Error playing ${conversationItem.file}:`, error);
            // Try next sound on error
            if (isConversationActiveRef.current && index < SOVA_CONVERSATION_SEQUENCE.length - 1) {
                conversationTimerRef.current = setTimeout(() => {
                    playNextConversationSound(index + 1);
                }, 1000);
            }
        }
    }, [isSequenceComplete]);
    
    // Play special welcome sound sequence for first-time visitors
    const playWelcomeSound = useCallback(async () => {
        if (hasPlayedWelcome.current || !isFirstTimeVisitor) return;
        
        hasPlayedWelcome.current = true;
        isConversationActiveRef.current = true;
        
        try {
            console.log('🎬 Starting SOVA welcome conversation sequence for first-time visitor');
            setAudioContextUnlocked(true);
            saveAudioPreference(true);
            markFirstVisitComplete();
            
            // Start the conversation sequence
            playNextConversationSound(0);
        } catch (error) {
            console.log('Welcome sound auto-play failed:', error);
            markFirstVisitComplete();
            isConversationActiveRef.current = false;
            // Show audio prompt instead
            setShowAudioPrompt(true);
        }
    }, [isFirstTimeVisitor, playNextConversationSound]);
    
    // Attempt to play welcome sound when audio is preloaded and it's first visit
    useEffect(() => {
        if (audioPreloaded && isFirstTimeVisitor && !hasPlayedWelcome.current && !hasPlayedReconnect.current) {
            const timer = setTimeout(playWelcomeSound, 500);
            return () => clearTimeout(timer);
        }
    }, [audioPreloaded, isFirstTimeVisitor, playWelcomeSound]);
    
    // Track if we've already handled sequence completion
    const hasHandledSequenceComplete = useRef(false);
    
    // Stop welcome audio immediately when loading completes (runs ONCE when isSequenceComplete becomes true)
    useEffect(() => {
        if (isSequenceComplete && !hasHandledSequenceComplete.current && isConversationActiveRef.current) {
            hasHandledSequenceComplete.current = true;
            
            // Stop the conversation sequence
            isConversationActiveRef.current = false;
            
            // Clear any pending conversation timer
            if (conversationTimerRef.current) {
                clearTimeout(conversationTimerRef.current);
                conversationTimerRef.current = null;
            }
            
            // Stop any playing CONVERSATION audio (only if conversation was active)
            if (currentAudio && isSovaSpeaking) {
                console.log('Loading complete - stopping SOVA welcome conversation immediately');
                currentAudio.pause();
                currentAudio.currentTime = 0;
                setIsSovaSpeaking(false);
                setCurrentAudio(null);
            }
            
            setShowWelcomeText(false);
            setCurrentSovaText('');
        }
    }, [isSequenceComplete, currentAudio, isSovaSpeaking]);
    
    // Cleanup conversation timer on unmount
    useEffect(() => {
        return () => {
            if (conversationTimerRef.current) {
                clearTimeout(conversationTimerRef.current);
            }
            isConversationActiveRef.current = false;
        };
    }, []);

    // Function to unlock audio context and play random SOVA sound
    const attemptToPlayRandomSovaSound = useCallback(async () => {
        // Don't auto-play if we've already played something, if audio isn't ready, if we're already attempting,
        // if this is a first-time visitor (they get the welcome sequence instead), or if the welcome conversation is active
        if (hasPlayedReconnect.current || !audioPreloaded || isAttemptingAutoPlay.current || isFirstTimeVisitor || isConversationActiveRef.current) {
            console.log('Skipping auto-play: already played, audio not ready, attempt in progress, first-time visitor, or welcome conversation active');
            return;
        }

        // Set the guard to prevent multiple simultaneous attempts
        isAttemptingAutoPlay.current = true;
        console.log('Starting auto-play attempt...');

        // Find all available SOVA sounds that are actually loaded
        const availableSounds: string[] = [];
        for (let i = 1; i <= TOTAL_SOVA_SOUNDS; i++) {
            const soundKey = i.toString(); // Use numeric string keys like "1", "2", etc.
            const audio = preloadedAudioFiles[soundKey];
            if (audio && audio.readyState >= 2) { // HAVE_CURRENT_DATA or better
                availableSounds.push(soundKey);
            }
        }

        if (availableSounds.length === 0) {
            console.log('No SOVA sounds loaded and ready, skipping auto-play');
            isAttemptingAutoPlay.current = false; // Reset guard
            return;
        }

        // Pick a random sound from available ones
        const randomIndex = Math.floor(Math.random() * availableSounds.length);
        const randomSoundKey = availableSounds[randomIndex];
        const randomAudio = preloadedAudioFiles[randomSoundKey];
        const randomSoundNumber = randomSoundKey; // Already a number string

        if (!randomAudio) {
            console.log('Selected audio not found, skipping auto-play');
            isAttemptingAutoPlay.current = false; // Reset guard
            return;
        }

        try {
            // Try to play the random SOVA sound
            setIsSovaSpeaking(true);
            setCurrentAudio(randomAudio); // Track the current audio
            await randomAudio.play();
            console.log(`Successfully auto-played SOVA sound ${randomSoundNumber}.mp3`);
            setAudioContextUnlocked(true);
            hasPlayedReconnect.current = true;
            isAttemptingAutoPlay.current = false; // Reset guard after success
            
            // Save that audio is working for this user
            saveAudioPreference(true);
            
            // Set up event listener for when audio ends
            const handleAutoAudioEnd = () => {
                setIsSovaSpeaking(false);
                setCurrentAudio(null);
                randomAudio.removeEventListener('ended', handleAutoAudioEnd);
            };
            randomAudio.addEventListener('ended', handleAutoAudioEnd, { once: true });
            
        } catch (error) {
            console.log('Auto-play failed (likely due to browser autoplay policy):', error);
            setIsSovaSpeaking(false);
            setCurrentAudio(null);
            isAttemptingAutoPlay.current = false; // Reset guard after failure
            
            // Show the audio prompt to let user enable audio
            setShowAudioPrompt(true);
            saveAudioPreference(false);
        }
    }, [audioPreloaded, isFirstTimeVisitor]); // Recreate if audioPreloaded or first-time visitor status changes

    // Handle Sova avatar click to play random sounds
    const handleSovaClick = async () => {
        console.log('🔊 SOVA CLICKED! showAudioPrompt:', showAudioPrompt, 'isSovaSpeaking:', isSovaSpeaking, 'audioPreloaded:', audioPreloaded);
        
        // If showing audio prompt, clicking SOVA should enable audio AND play a sound
        if (showAudioPrompt) {
            setShowAudioPrompt(false);
            // Don't return early - continue to play a sound after dismissing the prompt
            console.log('SOVA: Audio prompt dismissed, now playing sound...');
        }

        // If audio is currently playing, stop it
        if (isSovaSpeaking && currentAudio) {
            console.log('Stopping current SOVA audio...');
            
            // Stop the currently tracked audio
            currentAudio.pause();
            currentAudio.currentTime = 0;
            
            setIsSovaSpeaking(false);
            setCurrentAudio(null);
            console.log('SOVA audio stopped');
            return;
        }

        // Don't allow starting new audio if something is still playing
        if (isSovaSpeaking) {
            console.log('SOVA is still speaking, please wait...');
            return;
        }
        
        // Don't allow random sounds during welcome conversation
        if (isConversationActiveRef.current) {
            console.log('SOVA: Welcome conversation is active, skipping random sound');
            return;
        }
        
        // Get available sounds (any loaded sound)
        const availableSounds = [];
        console.log('SOVA: Checking available sounds...');
        for (let i = 1; i <= TOTAL_SOVA_SOUNDS; i++) {
            const audio = preloadedAudioFiles[i.toString()];
            if (audio) {
                console.log(`SOVA: Sound ${i} exists, readyState: ${audio.readyState}`);
                // Check if audio is ready to play (readyState >= 2 means HAVE_CURRENT_DATA or better)
                if (audio.readyState >= 2) {
                    availableSounds.push(i.toString());
                } else {
                    console.log(`SOVA: Sound ${i} not ready (readyState: ${audio.readyState})`);
                }
            } else {
                console.log(`SOVA: Sound ${i} missing from preloadedAudioFiles`);
            }
        }

        console.log(`SOVA: Found ${availableSounds.length} available sounds:`, availableSounds);

        if (availableSounds.length === 0) {
            console.log('SOVA: No sounds ready to play. Trying to load one on-demand...');
            
            // Try to find any audio that exists but isn't ready yet
            const loadingSounds = [];
            for (let i = 1; i <= TOTAL_SOVA_SOUNDS; i++) {
                const audio = preloadedAudioFiles[i.toString()];
                if (audio && audio.readyState < 2) {
                    loadingSounds.push(i.toString());
                }
            }
            
            if (loadingSounds.length > 0) {
                console.log(`SOVA: ${loadingSounds.length} sounds are loading, will try first one:`, loadingSounds[0]);
                // Use the first loading sound anyway
                availableSounds.push(loadingSounds[0]);
            } else {
                // Try to load a sound on-demand
                console.log('SOVA: No preloaded sounds found. Attempting on-demand load...');
                try {
                    const randomSoundNumber = Math.floor(Math.random() * TOTAL_SOVA_SOUNDS) + 1;
                    const onDemandAudio = await tryLoadAudio(`${randomSoundNumber}.mp3`);
                    if (onDemandAudio) {
                        onDemandAudio.volume = 0.85;
                        preloadedAudioFiles[randomSoundNumber.toString()] = onDemandAudio;
                        availableSounds.push(randomSoundNumber.toString());
                        console.log(`✅ Successfully loaded sound ${randomSoundNumber}.mp3 on-demand`);
                    } else {
                        console.log('❌ On-demand audio loading failed');
                        return;
                    }
                } catch (error) {
                    console.error('❌ On-demand audio loading error:', error);
                    return;
                }
            }
        }

        // Pick a random available sound
        const randomIndex = Math.floor(Math.random() * availableSounds.length);
        const soundToPlay = availableSounds[randomIndex];
        const audioElement = preloadedAudioFiles[soundToPlay];

        // Wait for the sound to be ready if it's not yet
        if (audioElement.readyState < 3) {
            console.log(`SOVA: Waiting for sound ${soundToPlay}.mp3 to be ready (readyState: ${audioElement.readyState})`);
            try {
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Sound load timeout')), 20000); // 20s for production
                    
                    const onCanPlay = () => {
                        clearTimeout(timeout);
                        audioElement.removeEventListener('canplaythrough', onCanPlay);
                        audioElement.removeEventListener('error', onError);
                        resolve();
                    };
                    
                    const onError = () => {
                        clearTimeout(timeout);
                        audioElement.removeEventListener('canplaythrough', onCanPlay);
                        audioElement.removeEventListener('error', onError);
                        reject(new Error('Sound load error'));
                    };
                    
                    audioElement.addEventListener('canplaythrough', onCanPlay);
                    audioElement.addEventListener('error', onError);
                });
                console.log(`SOVA: Sound ${soundToPlay}.mp3 is now ready`);
            } catch (error) {
                console.error(`SOVA: Failed to wait for sound ${soundToPlay}.mp3:`, error);
                return;
            }
        }

        console.log(`Playing SOVA sound ${soundToPlay}.mp3`);
        setIsSovaSpeaking(true);
        setCurrentAudio(audioElement); // Track the current audio

        // Add event listeners for when audio ends
        const handleAudioEnd = () => {
            setIsSovaSpeaking(false);
            setCurrentAudio(null); // Clear current audio reference
            audioElement.removeEventListener('ended', handleAudioEnd);
            audioElement.removeEventListener('pause', handleAudioEnd);
        };

        audioElement.addEventListener('ended', handleAudioEnd);
        audioElement.addEventListener('pause', handleAudioEnd);

        try {
            audioElement.currentTime = 0; // Reset to beginning
            await audioElement.play();
            
            // Unlock audio context if it wasn't already
            if (!audioContextUnlocked) {
                setAudioContextUnlocked(true);
            }
        } catch (error: unknown) {
            // Handle AbortError gracefully - this happens when play is interrupted
            const errorName = error instanceof Error ? error.name : 'Unknown';
            if (errorName === 'AbortError') {
                console.log(`SOVA sound ${soundToPlay} was interrupted (AbortError) - this is normal if loading completed`);
            } else {
            console.error(`Failed to play SOVA sound ${soundToPlay}:`, error);
            }
            setIsSovaSpeaking(false);
            setCurrentAudio(null); // Clear current audio reference on error
        }
    };

    // Try to play random SOVA sound when component mounts and audio is preloaded
    useEffect(() => {
        // Only attempt auto-play if audio is preloaded and we haven't tried yet
        if (audioPreloaded && !hasPlayedReconnect.current) {
            console.log('Audio preloaded, attempting auto-play...');
            // Small delay to ensure everything is ready
            const timer = setTimeout(attemptToPlayRandomSovaSound, 200);
            return () => clearTimeout(timer);
        }
    }, [audioPreloaded, attemptToPlayRandomSovaSound]); // Include memoized function

    // Add non-passive touch listener to prevent double-tap zoom on mobile
    useEffect(() => {
        if (!isMobile || !sovaAvatarRef.current) return;
        
        const img = sovaAvatarRef.current;
        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 1) {
                e.preventDefault();
            }
        };
        
        img.addEventListener('touchstart', handleTouchStart, { passive: false });
        
        return () => {
            img.removeEventListener('touchstart', handleTouchStart);
        };
    }, [isMobile]);

    // Cleanup effect: Stop any playing audio when component unmounts
    // BUT: Don't stop audio on HMR (Hot Module Reload) - let it keep playing!
    useEffect(() => {
        return () => {
            // Check if this is a real unmount or just HMR
            // In production or when truly unmounting, we should clean up
            // But during development with HMR, let the audio continue
            const isHMR = import.meta.hot !== undefined;
            
            if (!isHMR) {
                console.log('CyberpunkLoadingScreen unmounting (production), stopping any playing audio...');
                // Stop the currently tracked audio if it exists and is playing
                if (currentAudio && !currentAudio.paused) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                    console.log('Stopped audio on unmount');
                }
                // Also stop any other potentially playing audio
                for (let i = 1; i <= TOTAL_SOVA_SOUNDS; i++) {
                    const audio = preloadedAudioFiles[i.toString()];
                    if (audio && !audio.paused) {
                        audio.pause();
                        audio.currentTime = 0;
                        console.log(`Stopped orphaned audio ${i} on unmount`);
                    }
                }
            } else {
                console.log('CyberpunkLoadingScreen unmounting (HMR), keeping audio playing...');
            }
        };
    }, [currentAudio]); // Depend on currentAudio to always have latest reference

    useEffect(() => {
        if (currentLogIndex < logs.length) {
            console.log(`[CyberpunkLoadingScreen] Queuing log ${currentLogIndex + 1}/${logs.length}: ${logs[currentLogIndex]}`);
            // Show logs with readable delay - faster during asset loading, slower otherwise
            const baseDelay = assetProgress ? 150 : 300;
            const randomDelay = assetProgress ? 100 : 200;
            const timer = setTimeout(() => {
                // Capture current index to avoid race conditions
                setVisibleLogs(prev => {
                    // Only add if we haven't already added this many logs
                    if (prev.length === currentLogIndex) {
                        return [...prev, logs[currentLogIndex]];
                    }
                    return prev;
                });
                setCurrentLogIndex(prev => prev + 1);
                // Scroll to bottom after adding new log
                setTimeout(scrollToBottom, 100);
            }, baseDelay + Math.random() * randomDelay);

            return () => clearTimeout(timer);
        } else if (currentLogIndex >= logs.length && logs.length > 0 && !isSequenceComplete && effectiveAssetsLoaded) {
            // Sequence is complete AND assets are loaded - show click to continue
            console.log(`[CyberpunkLoadingScreen] All logs complete and assets loaded, setting sequence complete${DEBUG_SIMULATE_SLOW_LOADING ? ' (debug delay was active)' : ''}`);
            const timer = setTimeout(() => {
                setIsSequenceComplete(true);
                // Scroll to bottom to show the continue button
                setTimeout(scrollToBottom, 200);
            }, 500);

            return () => clearTimeout(timer);
        }
    }, [currentLogIndex, logs, isSequenceComplete, assetProgress, effectiveAssetsLoaded]);

    // Handle click to continue - always allow continuation regardless of player state
    const handleContinueClick = () => {
        console.log(`[CyberpunkLoadingScreen] User clicked continue, calling onSequenceComplete (player state: any)`);
        onSequenceComplete?.();
    };
    
    // Fallback: If sequence gets stuck, auto-complete after a timeout
    // BUT only if assets are loaded - we never want to show the game without assets!
    useEffect(() => {
        if (currentLogIndex >= logs.length && !isSequenceComplete && effectiveAssetsLoaded) {
            const fallbackTimer = setTimeout(() => {
                console.log(`[CyberpunkLoadingScreen] Fallback: Force completing sequence (assets loaded${DEBUG_SIMULATE_SLOW_LOADING ? ', debug delay was active' : ''})`);
                setIsSequenceComplete(true);
            }, 2000); // 2 second fallback
            
            return () => clearTimeout(fallbackTimer);
        }
    }, [currentLogIndex, logs.length, isSequenceComplete, effectiveAssetsLoaded]);
    
    // EMERGENCY fallback: If stuck for 45+ seconds, force complete regardless of asset state
    // This prevents users from being permanently stuck on loading screen
    // NOTE: Disabled during debug slow loading mode to allow full testing
    useEffect(() => {
        // Skip emergency timeout during debug mode - we're intentionally delaying
        if (DEBUG_SIMULATE_SLOW_LOADING) {
            console.log('🔧 DEBUG: Emergency timeout disabled during slow loading simulation');
            return;
        }
        
        const emergencyTimer = setTimeout(() => {
            if (!isSequenceComplete) {
                console.warn('[CyberpunkLoadingScreen] ⚠️ EMERGENCY: Loading stuck for 45s, forcing completion');
                console.warn(`[CyberpunkLoadingScreen] State: currentLogIndex=${currentLogIndex}, logs.length=${logs.length}, assetsLoaded=${assetsLoaded}, debugDelayComplete=${debugDelayComplete}`);
                setIsSequenceComplete(true);
            }
        }, 45000); // 45 second emergency timeout - reasonable for slow mobile connections
        
        return () => clearTimeout(emergencyTimer);
    }, [isSequenceComplete, currentLogIndex, logs.length, assetsLoaded, debugDelayComplete]);

    // Reset when authLoading changes, but only if we haven't started the sequence at all
    // Once started, let the sequence complete regardless of player state (including death)
    useEffect(() => {
        // Only reset if absolutely nothing has started yet
        if (currentLogIndex === 0 && visibleLogs.length === 0 && !isSequenceComplete) {
            console.log('[CyberpunkLoadingScreen] Resetting loading sequence due to authLoading change');
            setVisibleLogs([]);
            setCurrentLogIndex(0);
            setIsSequenceComplete(false);
        } else if (visibleLogs.length > 0 || currentLogIndex > 0) {
            // Sequence has started - don't reset, let it complete regardless of auth changes
            console.log('[CyberpunkLoadingScreen] Sequence in progress, ignoring authLoading changes');
        }
    }, [authLoading, currentLogIndex, visibleLogs.length, isSequenceComplete]);

    // Handle manual audio enable button click
    const handleEnableAudioClick = async () => {
        setShowAudioPrompt(false);
        
        try {
            // Find the first available sound to play (prefer readyState >= 3 for immediate playback)
            let firstAvailableSound = null;
            for (let i = 1; i <= TOTAL_SOVA_SOUNDS; i++) {
                const soundKey = i.toString();
                const audio = preloadedAudioFiles[soundKey];
                if (audio && audio.readyState >= 3) {
                    firstAvailableSound = soundKey;
                    break;
                }
            }
            
            // Fallback to readyState >= 2 if no fully ready sounds
            if (!firstAvailableSound) {
            for (let i = 1; i <= TOTAL_SOVA_SOUNDS; i++) {
                const soundKey = i.toString();
                const audio = preloadedAudioFiles[soundKey];
                if (audio && audio.readyState >= 2) {
                    firstAvailableSound = soundKey;
                    break;
                    }
                }
            }
            
            if (!firstAvailableSound) {
                console.log('No SOVA sounds available after enabling audio');
                setAudioContextUnlocked(true); // Still unlock context for future sounds
                saveAudioPreference(true);
                return;
            }
            
            const audio = preloadedAudioFiles[firstAvailableSound];
            
            // Wait for sound to be ready if not yet
            if (audio.readyState < 3) {
                console.log(`Waiting for sound ${firstAvailableSound}.mp3 to be ready...`);
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        // Timeout but don't fail - just proceed anyway
                        resolve();
                    }, 3000);
                    
                    const onCanPlay = () => {
                        clearTimeout(timeout);
                        audio.removeEventListener('canplaythrough', onCanPlay);
                        resolve();
                    };
                    
                    audio.addEventListener('canplaythrough', onCanPlay);
                });
            }
            
            audio.currentTime = 0;
            setIsSovaSpeaking(true);
            setCurrentAudio(audio); // Track the current audio
            await audio.play();
            console.log(`Audio enabled and SOVA sound ${firstAvailableSound}.mp3 played after user interaction`);
            setAudioContextUnlocked(true);
            hasPlayedReconnect.current = true;
            
            // Save that the user has enabled audio
            saveAudioPreference(true);
            
            // Set up event listener for when audio ends
            const handleAudioEnd = () => {
                setIsSovaSpeaking(false);
                setCurrentAudio(null);
                audio.removeEventListener('ended', handleAudioEnd);
            };
            audio.addEventListener('ended', handleAudioEnd, { once: true });
            
        } catch (error: unknown) {
            // Handle AbortError gracefully
            const errorName = error instanceof Error ? error.name : 'Unknown';
            if (errorName === 'AbortError') {
                console.log('Audio play was interrupted (AbortError) - this is normal if loading completed');
            } else {
            console.error('Failed to enable audio and play SOVA sound:', error);
            }
            setIsSovaSpeaking(false);
            setCurrentAudio(null);
            // Still unlock audio context even if play fails
            setAudioContextUnlocked(true);
            saveAudioPreference(true);
        }
    };

    // SOVA Avatar Component (reusable)
    const SovaAvatarElement = (
        <img 
            ref={sovaAvatarRef}
            src={sovaImage} 
            alt="Sova Avatar" 
            className={`sova-avatar ${
                isSovaSpeaking ? 'speaking' : ''
            } ${
                showAudioPrompt ? 'needs-interaction' : ''
            } ${
                isSovaSpeaking && isHoveringOverSova ? 'red-glow' : ''
            }`}
            onClick={handleSovaClick}
            style={{ 
                cursor: 'pointer',
                transition: 'filter 0.2s ease',
                opacity: isSovaSpeaking ? 1 : 0.9,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'manipulation',
            }}
            onMouseEnter={() => {
                if (!isMobile) {
                    setIsHoveringOverSova(true);
                    const tooltip = isSovaSpeaking 
                        ? "TERMINATE SOVA AUDIO STREAM" 
                        : showAudioPrompt
                        ? "ENABLE SOVA AUDIO INTERFACE"
                        : "ACTIVATE SOVA COMMUNICATION";
                    setTooltipText(tooltip);
                    setShowTooltip(true);
                }
            }}
            onMouseLeave={() => {
                if (!isMobile) {
                    setIsHoveringOverSova(false);
                    setShowTooltip(false);
                }
            }}
            onTouchEnd={() => {
                if (isMobile) {
                    const tooltip = isSovaSpeaking 
                        ? "TAP TO STOP" 
                        : showAudioPrompt
                        ? "TAP TO ENABLE AUDIO"
                        : "TAP TO HEAR SOVA";
                    setTooltipText(tooltip);
                    setShowTooltip(true);
                    setTimeout(() => setShowTooltip(false), 1500);
                }
            }}
        />
    );

    // Audio Prompt Component (reusable)
    const AudioPromptElement = showAudioPrompt && (
        <div className={`audio-prompt ${hasUserEnabledAudio() ? 'returning-user' : 'new-user'}`}>
            <div className="audio-prompt-content">
                {hasUserEnabledAudio() ? (
                    <>
                        <div className="audio-icon">🔊</div>
                        <div className="audio-prompt-text">
                            <div className="audio-prompt-title">RESUME SOVA AUDIO</div>
                            <div className="audio-prompt-subtitle">{isMobile ? 'Tap SOVA to enable' : 'Tap SOVA or click anywhere'}</div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="audio-icon">🔊</div>
                        <div className="audio-prompt-text">
                            <div className="audio-prompt-title">AUDIO AVAILABLE</div>
                            <div className="audio-prompt-subtitle">{isMobile ? 'Tap button to enable SOVA' : 'Click anywhere to enable SOVA audio'}</div>
                        </div>
                        <button 
                            className="enable-audio-button" 
                            onClick={handleEnableAudioClick}
                            style={{
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                touchAction: 'manipulation',
                            }}
                        >
                            ENABLE AUDIO
                        </button>
                    </>
                )}
            </div>
        </div>
    );

    // Tooltip Element (reusable)
    const TooltipElement = showTooltip && tooltipText && (
        <div className="cyberpunk-tooltip">
            <div className="cyberpunk-tooltip-content">
                <span className="cyberpunk-tooltip-text">{tooltipText}</span>
                <div className="cyberpunk-tooltip-glow"></div>
            </div>
        </div>
    );

    return (
        <div 
            className="cyberpunk-loading"
            style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                overscrollBehavior: 'none',
            }}
        >
            <div className="grid-background"></div>
            
            {/* Mobile Layout: SOVA and prompts ABOVE the console container */}
            {isMobile && (
                <div style={{ 
                    width: '100%', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    marginBottom: '8px',
                }}>
                    {SovaAvatarElement}
                    {TooltipElement}
                </div>
            )}
            
            <div className="console-container">
                {/* Desktop: SOVA inside console-container with absolute positioning */}
                {!isMobile && (
                    <>
                        {TooltipElement}
                        {SovaAvatarElement}
                    </>
                )}
                
                {/* Audio Prompt - inside console on mobile for proper flow */}
                {AudioPromptElement}
                
                <div className="console-header">
                    <div className="console-title">
                        {authLoading ? 'NEURAL IDENTITY VERIFICATION' : 'SENTIENT OCULAR VIRTUAL ASSISTANT'}
                    </div>
                    <div className="console-subtitle">
                        {authLoading ? 'Rozhkov Neuroscience Authentication Protocol v2.47' : 'Arkyv Node • Zvezdanet Mesh Network • Quantum Consensus'}
                    </div>
                </div>

                <div className="console-logs" ref={consoleLogsRef}>
                    {visibleLogs.map((log, index) => (
                        <div key={index} className={`log-line ${index === visibleLogs.length - 1 ? 'typing' : ''}`}>
                            <span className="log-prefix">[{String(index + 1).padStart(2, '0')}]</span>
                            <span className="log-text">{log}</span>
                        </div>
                    ))}
                    {currentLogIndex < logs.length && (
                        <div className="cursor-line">
                            <span className="log-prefix">[{String(currentLogIndex + 1).padStart(2, '0')}]</span>
                            <span className="cursor">█</span>
                        </div>
                    )}
                    {isSequenceComplete && (
                        <div className="continue-prompt">
                            <div className="log-line">
                                <span className="log-prefix">[{'>>'}]</span>
                                <span className="log-text">System ready. Neural link established.</span>
                            </div>
                            <button 
                                className="continue-button"
                                onClick={handleContinueClick}
                                style={{
                                    userSelect: 'none',
                                    WebkitUserSelect: 'none',
                                    touchAction: 'manipulation',
                                }}
                            >
                                <span className="continue-text">ENTER BABACHAIN NETWORK</span>
                                <span className="continue-subtitle">{isMobile ? 'Tap to access reality' : 'Click to access reality'}</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Asset Loading Progress Bar */}
                {assetProgress && assetProgress.phase !== 'complete' && (
                    <div className="asset-progress-container">
                        <div className="asset-progress-header">
                            <span className="asset-progress-label">
                                {assetProgress.phaseName.toUpperCase()}
                            </span>
                            <span className="asset-progress-percent">
                                {Math.round(assetProgress.totalProgress * 100)}%
                            </span>
                        </div>
                        <div className="asset-progress-bar">
                            <div 
                                className="asset-progress-fill"
                                style={{ width: `${assetProgress.totalProgress * 100}%` }}
                            />
                            <div 
                                className="asset-progress-glow"
                                style={{ left: `${assetProgress.totalProgress * 100}%` }}
                            />
                        </div>
                        <div className="asset-progress-stats">
                            <span>{assetProgress.loadedCount}/{assetProgress.totalCount} assets</span>
                            {assetProgress.fromCache > 0 && (
                                <span className="cache-indicator">⚡ {assetProgress.fromCache} cached</span>
                            )}
                        </div>
                    </div>
                )}
                
                {/* First-Time Visitor Welcome Message - Hide once loading completes */}
                {showWelcomeText && isFirstTimeVisitor && !isSequenceComplete && (
                    <div className={`sova-welcome-message ${isSovaSpeaking ? 'speaking' : ''}`}>
                        <div className="welcome-text-container">
                            <div className="welcome-greeting">「 FIRST CONNECTION DETECTED 」</div>
                            <div className="welcome-intro">
                                <span className="sova-name">SOVA</span> — Sentient Ocular Virtual Assistant
                            </div>
                            {currentSovaText && (
                                <div className="welcome-dialogue" key={currentConversationIndex}>
                                    "{currentSovaText}"
                                </div>
                            )}
                            {!currentSovaText && (
                                <div className="welcome-subtitle">
                                    Initializing your neural link for the first time...
                                </div>
                            )}
                            <div className="welcome-hint">
                                {isMobile ? 'Tap SOVA anytime to hear guidance' : 'Click SOVA anytime to hear guidance'}
                            </div>
                            <div className="conversation-progress">
                                {SOVA_CONVERSATION_SEQUENCE.map((_, idx) => (
                                    <span 
                                        key={idx} 
                                        className={`progress-dot ${idx < currentConversationIndex ? 'completed' : ''} ${idx === currentConversationIndex && isSovaSpeaking ? 'active' : ''}`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="console-footer">
                    <div className="status-indicators">
                        <div className="status-item">
                            <span className={`status-dot ${!authLoading ? 'active' : 'loading'}`}></span>
                            <span>NEURAL LINK</span>
                        </div>
                        <div className="status-item">
                            <span className={`status-dot ${!spacetimeLoading ? 'active' : 'loading'}`}></span>
                            <span>QUANTUM TUNNEL</span>
                        </div>
                        <div className="status-item">
                            <span className={`status-dot ${effectiveAssetsLoaded ? 'active' : 'loading'}`}></span>
                            <span>ASSET MATRIX</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CyberpunkLoadingScreen;