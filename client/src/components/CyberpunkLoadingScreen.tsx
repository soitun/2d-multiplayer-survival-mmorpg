import React, { useState, useEffect, useRef, useCallback } from 'react';
import './CyberpunkLoadingScreen.css';
import sovaImage from '../assets/ui/sova.png';
import { useMobileDetection } from '../hooks/useMobileDetection';

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

export type ShowSovaSoundBoxFn = (audio: HTMLAudioElement, label: string, options?: { hideUI?: boolean; onEnded?: () => void }) => void;

interface CyberpunkLoadingScreenProps {
    authLoading: boolean;
    spacetimeLoading?: boolean; // Add SpacetimeDB loading state
    onSequenceComplete?: () => void;
    hasSeenSovaIntro?: boolean; // Server-tracked intro completion flag
    musicPreloadProgress?: number; // 0-1 for music preload progress
    musicPreloadComplete?: boolean;
    // NEW: Real asset loading progress
    assetProgress?: AssetLoadingProgress | null;
    assetsLoaded?: boolean;
    /** SOVA Sound Box - play loading sequence through this (headless, cancellable on leave) */
    showSovaSoundBox?: ShowSovaSoundBoxFn;
    hideSovaSoundBox?: () => void;
    /** Fallback: when hasSeenSovaIntro is undefined (server data not yet loaded), treat as returning if we have stored username */
    hasStoredUsername?: boolean;
    /** Fallback: localStorage has lastKnownPlayerInfo = we've connected before */
    hasLastKnownPlayer?: boolean;
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

// Loading screen now plays through SovaSoundBox (showSovaSoundBox/hideSovaSoundBox)
// - No separate __STOP_LOADING_SCREEN_SOVA_AUDIO__ / __LOADING_SCREEN_AUDIO_IS_PLAYING__
// - hideSovaSoundBox is called when user leaves (handleSequenceComplete in App)

const TOTAL_SOVA_SOUNDS = 21;
const AUDIO_ENABLED_KEY = 'sova_audio_enabled';

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

// Function to load audio from the correct path
const tryLoadAudio = async (filename: string): Promise<HTMLAudioElement | null> => {
    // SOVA sounds are in the public/sounds/ directory
    // Vite serves public directory files directly from the root (use /sounds/ not /public/sounds/)
    const possiblePaths = [
        `/sounds/${filename}`,            // Primary path: public/sounds/ (served from root)
        `./sounds/${filename}`,           // Relative path fallback
    ];

    for (const path of possiblePaths) {
        try {
            const audio = new Audio(path);
            
            // Test if the audio can load with a shorter timeout
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 3000);
                
                audio.addEventListener('canplaythrough', () => {
                    clearTimeout(timeout);
                    resolve(audio);
                }, { once: true });
                
                audio.addEventListener('error', (e) => {
                    clearTimeout(timeout);
                    reject(new Error(`Load failed: ${e}`));
                }, { once: true });
                
                audio.preload = 'auto';
                audio.load();
            });
            
            console.debug(`Successfully loaded ${filename} from path: ${path}`);
            return audio;
        } catch (e) {
            console.debug(`Failed to load ${filename} from path: ${path}:`, e);
        }
    }
    
    console.error(`Could not load ${filename} from any path`);
    return null;
};

// Preload all audio files
const preloadAudio = async () => {
    // Check if audio is already preloaded (e.g., from previous HMR reload)
    const alreadyLoadedCount = Object.keys(preloadedAudioFiles).length;
    if (alreadyLoadedCount >= TOTAL_SOVA_SOUNDS) {
        console.log(`🔊 Audio already preloaded (${alreadyLoadedCount}/${TOTAL_SOVA_SOUNDS} sounds), skipping preload`);
        return;
    }
    
    console.debug('Preloading SOVA audio files...');
    
    // Preload numbered SOVA sounds (1-21)
    const loadPromises = [];
    for (let i = 1; i <= TOTAL_SOVA_SOUNDS; i++) {
        // Skip if already loaded
        if (preloadedAudioFiles[i.toString()]) {
            console.debug(`⏭️ Sound ${i}.mp3 already loaded, skipping`);
            continue;
        }
        
        loadPromises.push(
            tryLoadAudio(`${i}.mp3`).then(audio => {
                if (audio) {
                    audio.volume = 0.85;
                    preloadedAudioFiles[i.toString()] = audio;
                    console.debug(`✅ Successfully preloaded sound ${i}.mp3 (readyState: ${audio.readyState})`);
                } else {
                    console.warn(`❌ Failed to preload sound ${i}.mp3 - no audio returned`);
                }
            }).catch(e => {
                console.error(`❌ Failed to preload sound ${i}.mp3:`, e);
            })
        );
    }
    
    // Wait for all audio files to load (or fail)
    await Promise.allSettled(loadPromises);
    
    // Count successfully loaded sounds
    const loadedSounds = [];
    for (let i = 1; i <= TOTAL_SOVA_SOUNDS; i++) {
        if (preloadedAudioFiles[i.toString()]) {
            loadedSounds.push(i);
        }
    }
    
    console.debug(`🔊 Audio preloading complete: ${loadedSounds.length}/${TOTAL_SOVA_SOUNDS} SOVA sounds loaded`);
    
    if (loadedSounds.length === 0) {
        console.error('⚠️ NO SOVA SOUNDS LOADED! Check audio file paths and network connectivity.');
    }
};

const CyberpunkLoadingScreen: React.FC<CyberpunkLoadingScreenProps> = ({ 
    authLoading, 
    spacetimeLoading = false, 
    onSequenceComplete, 
    hasSeenSovaIntro,
    musicPreloadProgress = 0, 
    musicPreloadComplete = false,
    assetProgress = null,
    assetsLoaded = false,
    showSovaSoundBox,
    hideSovaSoundBox,
    hasStoredUsername = false,
    hasLastKnownPlayer = false,
}) => {

    const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
    const [currentLogIndex, setCurrentLogIndex] = useState(0);
    const [isSequenceComplete, setIsSequenceComplete] = useState(false);
    const [lastAssetLog, setLastAssetLog] = useState<string>('');
    
    // Mobile detection
    const isMobile = useMobileDetection();
    
    // Audio state
    const [audioContextUnlocked, setAudioContextUnlocked] = useState(false);
    const [isSovaSpeaking, setIsSovaSpeaking] = useState(false);
    const [audioPreloaded, setAudioPreloaded] = useState(false);
    const [showAudioPrompt, setShowAudioPrompt] = useState(false);
    const [isHoveringOverSova, setIsHoveringOverSova] = useState(false); // Track hover state
    const [tooltipText, setTooltipText] = useState<string>(''); // Custom tooltip
    const [showTooltip, setShowTooltip] = useState(false);
    const hasPlayedReconnect = useRef(false);
    const audioPreloadStarted = useRef(false);
    const consoleLogsRef = useRef<HTMLDivElement>(null);
    const sovaAvatarRef = useRef<HTMLImageElement>(null);
    // Skip only when CERTAIN first-time: server says false AND no lastKnownPlayerInfo. Otherwise play (returning or unknown).
    const isReturningPlayer = !(hasSeenSovaIntro === false && !hasLastKnownPlayer);

    const logs = React.useMemo(() => {
        const baseLogs = authLoading ? [
            "└─ Initializing quantum encryption protocols...",
            "└─ Verifying neural identity matrix...",
            "└─ Establishing secure link to authentication nexus...",
            "└─ Authenticating biometric signature...",
            "└─ [AUTH] Identity verified. Welcome, Survivor.",
        ] : spacetimeLoading ? [
            "└─ [AUTH] Identity verification complete.",
            "└─ Scanning for Arkyv node broadcasts...",
            "└─ [NETWORK] Detecting Zvezdanet backbone signals...",
            "└─ Establishing quantum tunnel to Babachain...",
            "└─ [CRYPTO] Synchronizing blockchain ledger...",
            "└─ Handshaking with distributed survivor network...",
            "└─ [MESH] P2P connection protocols active...",
            "└─ [READY] Babachain connection established. Initializing world access...",
        ] : [];

        // Add REAL asset loading progress when not in auth/spacetime loading phases
        // NOTE: Log lines get "frozen" when added to visibleLogs, so we avoid showing 
        // intermediate counts that would appear stuck. The progress bar shows real-time progress,
        // and we only show final counts when loading is complete.
        if (!authLoading && !spacetimeLoading && assetProgress) {
            const finalCacheInfo = assetProgress.fromCache > 0 ? ` (${assetProgress.fromCache} cached)` : '';
            
            if (assetProgress.phase === 'critical') {
                baseLogs.push("└─ [INIT] Initializing core rendering systems...");
                baseLogs.push(`└─ [ASSETS] ${assetProgress.phaseName}...`);
            } else if (assetProgress.phase === 'important') {
                baseLogs.push("└─ [CORE] Core systems loaded successfully.");
                baseLogs.push(`└─ [ASSETS] ${assetProgress.phaseName}...`);
            } else if (assetProgress.phase === 'secondary') {
                baseLogs.push("└─ [CORE] Core systems loaded successfully.");
                baseLogs.push("└─ [ENV] Environment textures loaded.");
                baseLogs.push(`└─ [ASSETS] ${assetProgress.phaseName}...`);
            } else if (assetProgress.phase === 'complete') {
                // Only show final accurate counts when loading is truly complete
                baseLogs.push("└─ [CORE] Core systems loaded successfully.");
                baseLogs.push("└─ [ENV] Environment textures loaded.");
                baseLogs.push(`└─ [LOAD] Item database: ${assetProgress.totalCount}/${assetProgress.totalCount} assets${finalCacheInfo}`);
            }
        }

        // Add music preload status for non-auth loading
        // Only show final [AUDIO] status when assets are complete to avoid duplicate logs
        // (visibleLogs accumulates across phase changes, so we only add each log type once)
        if (!authLoading && !spacetimeLoading && assetProgress?.phase === 'complete') {
            if (musicPreloadComplete) {
                baseLogs.push("└─ [AUDIO] Ambient soundtrack loaded. Environment ready.");
            }
            
            // Only show ready message when assets are actually loaded
            if (assetsLoaded) {
                baseLogs.push("└─ [READY] All systems nominal. Entering world...");
            }
        }

        return baseLogs;
    }, [authLoading, spacetimeLoading, musicPreloadProgress, musicPreloadComplete, assetProgress, assetsLoaded]);

    // Auto-scroll to bottom function
    const scrollToBottom = () => {
        if (consoleLogsRef.current) {
            consoleLogsRef.current.scrollTop = consoleLogsRef.current.scrollHeight;
        }
    };

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

    // Play 1-21 sequence through SovaSoundBox (headless, cancellable via hideSovaSoundBox)
    const playLoadingScreenSequence = useCallback((startIndex: number) => {
        if (!showSovaSoundBox || !isReturningPlayer || startIndex > TOTAL_SOVA_SOUNDS) return;

        const audio = preloadedAudioFiles[startIndex.toString()];
        if (!audio || audio.readyState < 2) {
            if (startIndex < TOTAL_SOVA_SOUNDS) {
                playLoadingScreenSequence(startIndex + 1);
            }
            return;
        }

        const playNext = () => {
            if (startIndex < TOTAL_SOVA_SOUNDS) {
                playLoadingScreenSequence(startIndex + 1);
            } else {
                setIsSovaSpeaking(false);
            }
        };

        showSovaSoundBox(audio, `SOVA`, {
            hideUI: true,
            onEnded: playNext,
        });
        audio.volume = 0.85;
        setIsSovaSpeaking(true);
        hasPlayedReconnect.current = true;
        console.log('[CyberpunkLoadingScreen] SOVA sequence playing sound', startIndex);
        audio.play().then(() => {
            setAudioContextUnlocked(true);
            saveAudioPreference(true);
        }).catch((err) => {
            console.warn('[CyberpunkLoadingScreen] SOVA sequence play blocked (user gesture may be required):', err);
            setIsSovaSpeaking(false);
            setShowAudioPrompt(true);
            saveAudioPreference(false);
        });
    }, [isReturningPlayer, showSovaSoundBox]);

    // Handle Sova avatar click: stop sequence (cancellable) or dismiss prompt
    const handleSovaClick = async () => {
        if (!isReturningPlayer) {
            if (showAudioPrompt) setShowAudioPrompt(false);
            return;
        }

        if (showAudioPrompt) setShowAudioPrompt(false);

        // If sequence is playing, stop it (cancellable)
        if (isSovaSpeaking && hideSovaSoundBox) {
            hideSovaSoundBox();
            setIsSovaSpeaking(false);
            return;
        }

        // Sequence not playing - click does nothing (sequence auto-plays for returning players)
    };

    // Play 1-21 SOVA sequence when returning player - start as soon as first sound is ready (don't wait for all 21)
    useEffect(() => {
        if (!isReturningPlayer) {
            console.log('[CyberpunkLoadingScreen] SOVA sequence skip: confirmed first-time player', { hasSeenSovaIntro, hasLastKnownPlayer });
            return;
        }
        if (hasPlayedReconnect.current) return;
        if (!showSovaSoundBox) {
            console.log('[CyberpunkLoadingScreen] SOVA sequence skip: no showSovaSoundBox');
            return;
        }

        const tryStart = () => {
            if (hasPlayedReconnect.current) return true;
            const first = preloadedAudioFiles['1'];
            if (first && first.readyState >= 2) {
                console.log('[CyberpunkLoadingScreen] SOVA sequence starting (sound 1 ready)');
                playLoadingScreenSequence(1);
                return true;
            }
            return false;
        };

        let retryId: ReturnType<typeof setInterval> | null = null;
        let attempts = 0;
        const maxAttempts = 30;
        // Try immediately, then retry - preload may have already completed (e.g. from previous session)
        const timer = setTimeout(() => {
            if (tryStart()) return;
            retryId = setInterval(() => {
                attempts++;
                if (tryStart() || attempts >= maxAttempts) {
                    if (attempts >= maxAttempts) {
                        console.log('[CyberpunkLoadingScreen] SOVA sequence gave up: sound 1 not ready after', maxAttempts, 'attempts');
                    }
                    if (retryId) {
                        clearInterval(retryId);
                        retryId = null;
                    }
                }
            }, 250);
        }, 0);

        return () => {
            clearTimeout(timer);
            if (retryId) clearInterval(retryId);
        };
    }, [isReturningPlayer, showSovaSoundBox, playLoadingScreenSequence, hasSeenSovaIntro, hasStoredUsername, hasLastKnownPlayer]);

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

    // Do NOT stop SOVA on unmount - let it continue playing when user enters game

    useEffect(() => {
        if (currentLogIndex < logs.length) {
            // When assets are already loaded (cached reconnect), blast through logs instantly
            // Otherwise show them with a typing effect
            const isCachedReconnect = assetsLoaded && assetProgress?.phase === 'complete';
            const baseDelay = isCachedReconnect ? 30 : assetProgress ? 100 : 300;
            const randomDelay = isCachedReconnect ? 10 : assetProgress ? 50 : 200;
            const timer = setTimeout(() => {
                setVisibleLogs(prev => [...prev, logs[currentLogIndex]]);
                setCurrentLogIndex(prev => prev + 1);
                // Scroll to bottom after adding new log
                setTimeout(scrollToBottom, isCachedReconnect ? 0 : 100);
            }, baseDelay + Math.random() * randomDelay);

            return () => clearTimeout(timer);
        } else if (currentLogIndex >= logs.length && !isSequenceComplete && assetsLoaded) {
            // Sequence is complete AND assets are loaded - show click to continue
            // Fast-track if assets were already cached
            const isCachedReconnect = assetProgress?.phaseName === 'Cached';
            const timer = setTimeout(() => {
                setIsSequenceComplete(true);
                // Scroll to bottom to show the continue button
                setTimeout(scrollToBottom, isCachedReconnect ? 0 : 200);
            }, isCachedReconnect ? 100 : 500);

            return () => clearTimeout(timer);
        }
    }, [currentLogIndex, logs, isSequenceComplete, assetProgress, assetsLoaded]);

    // Handle click to continue - always allow continuation regardless of player state
    const handleContinueClick = () => {
        console.log(`[CyberpunkLoadingScreen] User clicked continue, calling onSequenceComplete (player state: any)`);
        onSequenceComplete?.();
    };
    
    // Fallback: If sequence gets stuck, auto-complete after a timeout
    // BUT only if assets are loaded - we never want to show the game without assets!
    useEffect(() => {
        if (currentLogIndex >= logs.length && !isSequenceComplete && assetsLoaded) {
            const isCachedReconnect = assetProgress?.phaseName === 'Cached';
            const fallbackTimer = setTimeout(() => {
                console.log('[CyberpunkLoadingScreen] Fallback: Force completing sequence (assets loaded)');
                setIsSequenceComplete(true);
            }, isCachedReconnect ? 500 : 2000); // Much shorter fallback for cached reconnects
            
            return () => clearTimeout(fallbackTimer);
        }
    }, [currentLogIndex, logs.length, isSequenceComplete, assetsLoaded, assetProgress]);

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

        if (!isReturningPlayer) {
            setAudioContextUnlocked(true);
            saveAudioPreference(true);
            return;
        }

        if (!showSovaSoundBox) return;
        const audio = preloadedAudioFiles['1'];
        if (!audio || audio.readyState < 2) return;

        audio.currentTime = 0;
        setIsSovaSpeaking(true);
        hasPlayedReconnect.current = true;
        showSovaSoundBox(audio, 'SOVA', {
            hideUI: true,
            onEnded: () => setIsSovaSpeaking(false),
        });
        audio.play().then(() => {
            setAudioContextUnlocked(true);
            saveAudioPreference(true);
        }).catch((err) => {
            console.error('Failed to enable audio:', err);
            setIsSovaSpeaking(false);
        });
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
                            <span className={`status-dot ${assetsLoaded ? 'active' : 'loading'}`}></span>
                            <span>ASSET MATRIX</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CyberpunkLoadingScreen; 