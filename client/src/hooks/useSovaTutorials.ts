/**
 * useSovaTutorials.ts
 * 
 * Custom hook that manages all SOVA tutorial sounds and messages.
 * Handles timed intro sequences and event-based tutorial triggers.
 * 
 * Features:
 * - Crash intro (2.5 seconds after spawn)
 * - Tutorial hint (3.5 minutes after spawn)
 * - First resource interaction tutorial (event-driven)
 * - Memory shard tutorial (event-driven)
 * - First hostile encounter tutorial (event-driven) - warns about night apparitions
 * 
 * Tutorial state is now tracked SERVER-SIDE on the Player table:
 * - hasSeenSovaIntro: boolean - Crash intro tutorial
 * - hasSeenMemoryShardTutorial: boolean - Memory shard warning
 * 
 * This ensures clearing browser cache does NOT replay these tutorials.
 * The server is the source of truth for "has player seen this tutorial".
 */

import { useEffect, useRef, MutableRefObject } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface SovaMessage {
    id: string;
    text: string;
    isUser: boolean;
    timestamp: Date;
    flashTab?: boolean;
}

export type ShowSovaSoundBoxFn = (audio: HTMLAudioElement, label: string) => void;
export type SovaMessageAdderFn = (message: SovaMessage) => void;

// Minimal interfaces for the entity types we need (just position data)
interface RuneStoneData {
    posX: number;
    posY: number;
}

interface AlkStationData {
    worldPosX: number;
    worldPosY: number;
}

interface MonumentPartData {
    worldX: number;
    worldY: number;
    monumentType?: { tag: string };
    isCenter?: boolean;
}

interface UseSovaTutorialsProps {
    localPlayerId: string | null | undefined;
    showSovaSoundBoxRef: MutableRefObject<ShowSovaSoundBoxFn | null | undefined>;
    sovaMessageAdderRef: MutableRefObject<SovaMessageAdderFn | null | undefined>;
    // SERVER-SIDE tutorial flags from Player table (ALL tutorials now server-validated)
    // No localStorage - survives browser cache clears
    hasSeenSovaIntro?: boolean;
    hasSeenMemoryShardTutorial?: boolean;
    hasSeenTutorialHint?: boolean;
    hasSeenHostileEncounterTutorial?: boolean;
    hasSeenRuneStoneTutorial?: boolean;
    hasSeenAlkStationTutorial?: boolean;
    hasSeenCrashedDroneTutorial?: boolean;
    // Callbacks to mark tutorials as seen on the server
    onMarkSovaIntroSeen?: () => void;
    onMarkTutorialHintSeen?: () => void;
    onMarkHostileEncounterTutorialSeen?: () => void;
    onMarkRuneStoneTutorialSeen?: () => void;
    onMarkAlkStationTutorialSeen?: () => void;
    onMarkCrashedDroneTutorialSeen?: () => void;
    // Optional entity data for proximity-based tutorials
    localPlayerPosition?: { x: number; y: number } | null;
    runeStones?: Map<string, RuneStoneData>;
    alkStations?: Map<string, AlkStationData>;
    monumentParts?: Map<string, MonumentPartData>;
}

// ============================================================================
// Constants - Tutorial Definitions
// ============================================================================

// Exported tutorial definition type for external use
export interface TutorialDefinition {
    id: string;
    storageKey: string;
    audioFile: string;
    soundBoxLabel: string;
    message: string;
    displayName: string;
    emoji: string;
    description: string;
    delayMs?: number;
    eventName?: string;
}

export const TUTORIALS: Record<string, TutorialDefinition> = {
    crashIntro: {
        id: 'crashIntro',
        storageKey: 'broth_sova_intro_crash_played',
        delayMs: 2.5 * 1000, // 2.5 seconds
        audioFile: '/sounds/sova_intro_crash.mp3',
        soundBoxLabel: 'SOVA: Neural Link Established',
        displayName: 'Neural Link Established',
        emoji: '🚢',
        description: 'The opening broadcast when you first wake up on the island.',
        message: `Neural link established. This is SOVA — Sentient Ocular Virtual Assistant — your tactical AI implant from Gred Naval Intelligence. I've been offline since the Sovereign Tide went down. Based on your biometrics, you've been unconscious for... a while. The icebreaker's gone. I'm not picking up other neural links in range—most of the crew... didn't make it. You're stranded on an uncharted island somewhere in the Aleutians — no comms, no extraction, no backup. Your survival is now my primary directive. I'm picking up debris signatures along the shoreline—could be salvageable, but it won't last out here. You're going to need to learn how to live off this place. I'll walk you through it — press J anytime to check your current objectives. I've loaded an introductory sequence to get you started, and once you're stable, I'll push daily assignments to keep your skills sharp. For now, head to the shore and start gathering plant fibers from the vegetation. You'll need them for rope, bandages, the basics. One step at a time, agent. Just stay alive.`,
    },
    tutorialHint: {
        id: 'tutorialHint',
        storageKey: 'broth_sova_tutorial_hint_played',
        delayMs: 3.5 * 60 * 1000, // 3.5 minutes
        audioFile: '/sounds/sova_tutorial_hint.mp3',
        soundBoxLabel: 'SOVA: Press V to Talk',
        displayName: 'Voice Command Tutorial',
        emoji: '🎤',
        description: 'Learn how to communicate with SOVA using your voice.',
        message: `Hey, you... Yeah, you. I can hear you breathing out there. Look, if you're feeling lost or confused—and trust me, everyone is at first—just press V and talk to me. I'll walk you through everything. Fair warning though, the first time we chat I might take a moment to... wake up. Cold starts and all that. Think of it as me shaking off the cosmic dust. I'll be quicker after that, I promise. Otherwise, you can text with me here.`,
    },
    memoryShard: {
        id: 'memoryShard',
        storageKey: 'broth_memory_shard_tutorial_played',
        audioFile: '/sounds/sova_tutorial_memory_shard.mp3',
        soundBoxLabel: 'SOVA: Crystalline Substrate Detected',
        eventName: 'sova-memory-shard-tutorial',
        displayName: 'Crystalline Substrate Detected',
        emoji: '🔮',
        description: 'First encounter with a crystalline shard and its unknown effects.',
        message: `I'm picking up something on you—crystalline substrate. The pattern it's emitting resembles neural memory encoding. Hold on—my systems are responding to the substrate. There's some kind of compatibility. I think I can interface with it. I'm also picking up elevated neural activity from you—stress markers. I don't know what this thing is doing to you. If something feels off, drop it.`,
    },
    firstHostileEncounter: {
        id: 'firstHostileEncounter',
        storageKey: 'broth_first_hostile_encounter_played',
        audioFile: '/sounds/sova_first_hostile_encounter.mp3',
        soundBoxLabel: 'SOVA: Neural Resonance Detected',
        eventName: 'sova-first-hostile-encounter',
        displayName: 'Neural Resonance Detected',
        emoji: '👹',
        description: 'Warning about the apparitions that appear at night.',
        message: `Wait... I'm picking up something strange. Neural resonance patterns. They're not quite... real. The readings show fear signatures, fragmented resonance. The patterns are converging on your position—your neural readout is spiking. Solid structures might attenuate the resonance—shelter should help, but don't get comfortable. I'm detecting larger patterns with higher density; extended contact could compromise structural integrity. Your options? Keep moving, or stand your ground. I don't know if they can be stopped.`,
    },
    runeStone: {
        id: 'runeStone',
        storageKey: 'broth_rune_stone_tutorial_played',
        audioFile: '/sounds/sova_tutorial_rune_stone.mp3',
        soundBoxLabel: 'SOVA: Anomalous Structure Detected',
        eventName: 'sova-rune-stone-tutorial',
        displayName: 'Rune Stone Discovery',
        emoji: '🪨',
        description: 'Analysis of the mysterious rune stones and their powers.',
        message: `Hold on — I'm picking up unusual readings from that structure. Scanning now. It's old. I'm detecting similar structures elsewhere on the island, few and far between. At least three distinct types. And there's residue on the surface—same substrate as those shards we've been finding. There are markings carved into the stone—get closer. Might tell us what this one does.`,
    },
    alkStation: {
        id: 'alkStation',
        storageKey: 'broth_alk_station_tutorial_played',
        audioFile: '/sounds/sova_tutorial_alk_station.mp3',
        soundBoxLabel: 'SOVA: Military Frequency Detected',
        eventName: 'sova-alk-station-tutorial',
        displayName: 'ALK Station Briefing',
        emoji: '🏭',
        description: 'Explanation of the Automated Logistics Kernel contract system.',
        message: `That structure is broadcasting on a military frequency. Analyzing... Decoding the header now. A-L-K — Automated Logistics Kernel. Pre-collapse infrastructure, still operational. I'm picking up similar broadcasts from other locations. The protocol describes a contract system—resource exchange for crystalline compensation. The shards. I've downloaded the protocol response and set up a tab in my interface for you under the title ALK Board. It'll collate all the work orders in one place. Might as well plug in and see what it wants. Could be useful.`,
    },
    crashedDrone: {
        id: 'crashedDrone',
        storageKey: 'broth_crashed_drone_tutorial_played',
        audioFile: '/sounds/sova_tutorial_crashed_drone.mp3',
        soundBoxLabel: 'SOVA: Wreckage Analysis',
        eventName: 'sova-crashed-drone-tutorial',
        displayName: 'Crashed Drone Analysis',
        emoji: '🛸',
        description: 'Investigation of the crashed research drone and abandoned camp.',
        message: `Hold up — I'm detecting residual electromagnetic signatures from that wreckage. Scanning... It's a research drone. Pre-collapse tech, military-grade sensors. Someone already tried to salvage it — there's an abandoned camp nearby. Furnace, rain collector, repair station... whoever set this up knew what they were doing. They were probably trying to extract the drone's CPU. The good news? They left their equipment behind. The bad news? They left everything behind. No body, no trail. Just... gone. Be careful out here, agent. I'm detecting memory shards, sulfur compounds, metal fragments — the wreckage is rich with salvage. But don't linger. Whatever happened to that survivor... I don't think they saw it coming.`,
    },
};

// Intro audio duration check (for skipping overlapping audio)
const INTRO_AUDIO_DURATION_MS = 45 * 1000; // 45 seconds - generous estimate
const INTRO_STARTED_KEY = 'broth_sova_intro_started_at';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a tutorial has already been played (persisted in localStorage)
 */
export function hasBeenPlayed(storageKey: string): boolean {
    return localStorage.getItem(storageKey) === 'true';
}

/**
 * Check if a specific tutorial by ID has been unlocked/played
 */
export function isTutorialUnlocked(tutorialId: string): boolean {
    const tutorial = TUTORIALS[tutorialId];
    if (!tutorial) return false;
    return hasBeenPlayed(tutorial.storageKey);
}

/**
 * Get list of all unlocked tutorials
 */
export function getUnlockedTutorials(): TutorialDefinition[] {
    return Object.values(TUTORIALS).filter(tutorial => hasBeenPlayed(tutorial.storageKey));
}

/**
 * Mark a tutorial as played in localStorage
 */
function markAsPlayed(storageKey: string): void {
    localStorage.setItem(storageKey, 'true');
}

/**
 * Check if the intro audio is still playing (to avoid overlapping sounds)
 */
function isIntroStillPlaying(): boolean {
    const introStartedAt = localStorage.getItem(INTRO_STARTED_KEY);
    if (!introStartedAt) return false;
    return (Date.now() - parseInt(introStartedAt, 10)) < INTRO_AUDIO_DURATION_MS;
}

/**
 * Replay a tutorial by ID - for use from the Audio Tutorials panel
 * Returns true if the tutorial was found and played
 */
export function replayTutorial(
    tutorialId: string,
    showSovaSoundBox: ShowSovaSoundBoxFn | null | undefined,
    sovaMessageAdder: SovaMessageAdderFn | null | undefined
): boolean {
    const tutorial = TUTORIALS[tutorialId];
    if (!tutorial) {
        console.warn(`[SovaTutorials] Tutorial not found: ${tutorialId}`);
        return false;
    }

    console.log(`[SovaTutorials] 🔄 Replaying tutorial: ${tutorial.displayName}`);

    playSovaTutorial(
        {
            audioFile: tutorial.audioFile,
            soundBoxLabel: tutorial.soundBoxLabel,
            message: tutorial.message,
            messageId: `sova-replay-${tutorialId}-${Date.now()}`,
        },
        showSovaSoundBox,
        sovaMessageAdder
    );

    return true;
}

/**
 * Play SOVA audio and show sound box with message
 */
function playSovaTutorial(
    config: {
        audioFile: string;
        soundBoxLabel: string;
        message: string;
        messageId: string;
    },
    showSovaSoundBox: ShowSovaSoundBoxFn | null | undefined,
    sovaMessageAdder: SovaMessageAdderFn | null | undefined,
    options?: {
        skipAudioIfIntroPlaying?: boolean;
        onAudioStart?: () => void;
    }
): void {
    const { audioFile, soundBoxLabel, message, messageId } = config;
    const { skipAudioIfIntroPlaying = false, onAudioStart } = options || {};

    // Check if we should skip audio due to intro still playing
    if (skipAudioIfIntroPlaying && isIntroStillPlaying()) {
        console.log(`[SovaTutorials] Intro still playing - sending text only for ${soundBoxLabel}`);
        if (sovaMessageAdder) {
            sovaMessageAdder({
                id: messageId,
                text: message,
                isUser: false,
                timestamp: new Date(),
                flashTab: true,
            });
        }
        return;
    }

    // Try to play audio
    try {
        const audio = new Audio(audioFile);
        audio.volume = 0.8;
        
        // CRITICAL: Show sound box BEFORE calling play() to set the __SOVA_SOUNDBOX_IS_ACTIVE__ flag
        // This prevents notification sounds from sneaking in during the async play() window
        if (showSovaSoundBox) {
            showSovaSoundBox(audio, soundBoxLabel);
        }
        
        audio.play()
            .then(() => {
                console.log(`[SovaTutorials] Playing: ${soundBoxLabel}`);
                onAudioStart?.();
                
                // Send message to SOVA chat
                if (sovaMessageAdder) {
                    sovaMessageAdder({
                        id: messageId,
                        text: message,
                        isUser: false,
                        timestamp: new Date(),
                        flashTab: true,
                    });
                }
            })
            .catch(err => {
                console.warn(`[SovaTutorials] Failed to play ${soundBoxLabel}:`, err);
                // Still send message even if audio fails
                if (sovaMessageAdder) {
                    sovaMessageAdder({
                        id: messageId,
                        text: message,
                        isUser: false,
                        timestamp: new Date(),
                        flashTab: true,
                    });
                }
            });
    } catch (err) {
        console.warn(`[SovaTutorials] Error creating audio for ${soundBoxLabel}:`, err);
        // Still send message on error
        if (sovaMessageAdder) {
            sovaMessageAdder({
                id: messageId,
                text: message,
                isUser: false,
                timestamp: new Date(),
                flashTab: true,
            });
        }
    }
}

// ============================================================================
// Main Hook
// ============================================================================

// Proximity detection distance for tutorials (in pixels)
const TUTORIAL_PROXIMITY_DISTANCE = 600;
const TUTORIAL_PROXIMITY_DISTANCE_SQ = TUTORIAL_PROXIMITY_DISTANCE * TUTORIAL_PROXIMITY_DISTANCE;

export function useSovaTutorials({
    localPlayerId,
    showSovaSoundBoxRef,
    sovaMessageAdderRef,
    // Server-side tutorial flags (ALL tutorials now server-validated)
    hasSeenSovaIntro,
    hasSeenMemoryShardTutorial,
    hasSeenTutorialHint,
    hasSeenHostileEncounterTutorial,
    hasSeenRuneStoneTutorial,
    hasSeenAlkStationTutorial,
    hasSeenCrashedDroneTutorial,
    // Server-side marking callbacks
    onMarkSovaIntroSeen,
    onMarkTutorialHintSeen,
    onMarkHostileEncounterTutorialSeen,
    onMarkRuneStoneTutorialSeen,
    onMarkAlkStationTutorialSeen,
    onMarkCrashedDroneTutorialSeen,
    // Entity data for proximity detection
    localPlayerPosition,
    runeStones,
    alkStations,
    monumentParts,
}: UseSovaTutorialsProps): void {
    
    // Track if component is mounted to avoid state updates after unmount
    const isMountedRef = useRef(true);
    
    // Track if we've already triggered the intro this session (prevents double-play during data loading)
    const hasTriggeredIntroThisSession = useRef(false);
    
    // Track if we've already fired the proximity events this session (to avoid spamming)
    const hasFiredRuneStoneEvent = useRef(false);
    const hasFiredAlkStationEvent = useRef(false);
    const hasFiredCrashedDroneEvent = useRef(false);
    
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // ========================================================================
    // Part 1: SOVA Crash Intro (2.5 seconds after spawn)
    // Uses SERVER-SIDE flag (hasSeenSovaIntro) as source of truth
    // This ensures clearing browser cache does NOT replay the intro
    // ========================================================================
    useEffect(() => {
        const { delayMs, audioFile, soundBoxLabel, message } = TUTORIALS.crashIntro;
        
        // Skip if no player yet or already triggered this session
        if (!localPlayerId || hasTriggeredIntroThisSession.current) {
            return;
        }
        
        // Wait for server data to load (hasSeenSovaIntro will be undefined initially)
        if (hasSeenSovaIntro === undefined) {
            console.log('[SovaTutorials] 🚢 Waiting for server data to determine intro state...');
            return;
        }
        
        // Skip if server says player has already seen the intro
        if (hasSeenSovaIntro === true) {
            console.log('[SovaTutorials] 🚢 Server confirms intro already seen, skipping');
            hasTriggeredIntroThisSession.current = true;
            return;
        }

        console.log('[SovaTutorials] 🚢 Server confirms intro NOT seen, scheduling in 2.5 seconds...');
        hasTriggeredIntroThisSession.current = true; // Prevent double-scheduling
        
        const timer = setTimeout(() => {
            // Double-check mount status
            if (!isMountedRef.current) {
                return;
            }

            // Store timestamp for other sounds to check (still useful for overlap prevention)
            localStorage.setItem(INTRO_STARTED_KEY, Date.now().toString());
            
            console.log('[SovaTutorials] 🚢 Playing crash intro NOW');
            
            playSovaTutorial(
                {
                    audioFile,
                    soundBoxLabel,
                    message,
                    messageId: `sova-intro-crash-${Date.now()}`,
                },
                showSovaSoundBoxRef.current,
                sovaMessageAdderRef.current,
                {
                    onAudioStart: () => {
                        // Mark as seen on the server AFTER audio starts successfully
                        if (onMarkSovaIntroSeen) {
                            console.log('[SovaTutorials] 🚢 Marking intro as seen on server');
                            onMarkSovaIntroSeen();
                        }
                    }
                }
            );
        }, delayMs);

        return () => clearTimeout(timer);
    }, [localPlayerId, hasSeenSovaIntro, showSovaSoundBoxRef, sovaMessageAdderRef, onMarkSovaIntroSeen]);

    // ========================================================================
    // Part 2: SOVA Tutorial Hint (3.5 minutes after spawn)
    // Now uses SERVER-SIDE flag instead of localStorage
    // ========================================================================
    useEffect(() => {
        const { delayMs, audioFile, soundBoxLabel, message } = TUTORIALS.tutorialHint;
        
        // Skip if no player yet or waiting for server data
        if (!localPlayerId || hasSeenTutorialHint === undefined) {
            return;
        }
        
        // Skip if server says already seen
        if (hasSeenTutorialHint === true) {
            return;
        }

        console.log('[SovaTutorials] 🎓 Scheduling tutorial hint in 3.5 minutes...');
        
        const timer = setTimeout(() => {
            // Double-check mount status
            if (!isMountedRef.current) {
                return;
            }
            
            console.log('[SovaTutorials] 🎓 Playing tutorial hint NOW');
            
            playSovaTutorial(
                {
                    audioFile,
                    soundBoxLabel,
                    message,
                    messageId: `sova-tutorial-hint-${Date.now()}`,
                },
                showSovaSoundBoxRef.current,
                sovaMessageAdderRef.current,
                {
                    onAudioStart: () => {
                        // Mark as seen on server AFTER audio starts
                        if (onMarkTutorialHintSeen) {
                            console.log('[SovaTutorials] 🎓 Marking tutorial hint as seen on server');
                            onMarkTutorialHintSeen();
                        }
                    }
                }
            );
        }, delayMs);

        return () => clearTimeout(timer);
    }, [localPlayerId, hasSeenTutorialHint, showSovaSoundBoxRef, sovaMessageAdderRef, onMarkTutorialHintSeen]);

    // ========================================================================
    // Part 3: Memory Shard Tutorial (Event-driven)
    // SERVER controls when this triggers via has_seen_memory_shard_tutorial flag
    // The server emits SovaMemoryShardTutorial sound event ONLY for players
    // who haven't seen it yet. We trust the server's decision here.
    // 
    // Triggered by: useSoundSystem.ts when it receives SovaMemoryShardTutorial sound event
    // ========================================================================
    useEffect(() => {
        const { audioFile, soundBoxLabel, eventName, message } = TUTORIALS.memoryShard;
        
        const handleEvent = () => {
            console.log('[SovaTutorials] 🔮 Memory shard tutorial event received from server');
            
            // Intro still playing? Skip this time - server will re-trigger on next pickup
            if (isIntroStillPlaying()) {
                console.log('[SovaTutorials] 🔮 Intro still playing - skipping memory shard tutorial audio (will play next time)');
                return;
            }
            
            // Server already marked this as seen, just play the audio
            console.log('[SovaTutorials] 🔮 Playing memory shard tutorial NOW');
            
            playSovaTutorial(
                {
                    audioFile,
                    soundBoxLabel,
                    message,
                    messageId: `sova-memory-shard-tutorial-${Date.now()}`,
                },
                showSovaSoundBoxRef.current,
                sovaMessageAdderRef.current
            );
        };

        window.addEventListener(eventName!, handleEvent as EventListener);
        return () => window.removeEventListener(eventName!, handleEvent as EventListener);
    }, [showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Part 4: First Hostile Encounter Tutorial (Event-driven)
    // Plays the first time the player encounters hostile NPCs at night.
    // Now uses SERVER-SIDE flag instead of localStorage
    // ========================================================================
    useEffect(() => {
        const { audioFile, soundBoxLabel, eventName, message } = TUTORIALS.firstHostileEncounter;
        
        const handleEvent = () => {
            console.log('[SovaTutorials] 👹 First hostile encounter event received');
            
            // Server says already seen? Skip
            if (hasSeenHostileEncounterTutorial === true) {
                console.log('[SovaTutorials] 👹 First hostile encounter tutorial already seen (server), skipping');
                return;
            }
            
            // Intro still playing? Skip this time (will replay next encounter)
            if (isIntroStillPlaying()) {
                console.log('[SovaTutorials] 👹 Intro still playing - skipping hostile encounter tutorial (will play next time)');
                return;
            }
            
            console.log('[SovaTutorials] 👹 Playing first hostile encounter tutorial NOW');
            
            playSovaTutorial(
                {
                    audioFile,
                    soundBoxLabel,
                    message,
                    messageId: `sova-first-hostile-encounter-${Date.now()}`,
                },
                showSovaSoundBoxRef.current,
                sovaMessageAdderRef.current,
                {
                    onAudioStart: () => {
                        // Mark as seen on server AFTER audio starts
                        if (onMarkHostileEncounterTutorialSeen) {
                            console.log('[SovaTutorials] 👹 Marking hostile encounter tutorial as seen on server');
                            onMarkHostileEncounterTutorialSeen();
                        }
                    }
                }
            );
        };

        window.addEventListener(eventName!, handleEvent as EventListener);
        return () => window.removeEventListener(eventName!, handleEvent as EventListener);
    }, [hasSeenHostileEncounterTutorial, onMarkHostileEncounterTutorialSeen, showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Part 5: Rune Stone Tutorial (Event-driven)
    // Now uses SERVER-SIDE flag instead of localStorage
    // ========================================================================
    useEffect(() => {
        const { audioFile, soundBoxLabel, eventName, message } = TUTORIALS.runeStone;
        
        const handleEvent = () => {
            console.log('[SovaTutorials] 🪨 Rune stone tutorial event received');
            
            // Server says already seen? Skip
            if (hasSeenRuneStoneTutorial === true) {
                console.log('[SovaTutorials] 🪨 Rune stone tutorial already seen (server), skipping');
                return;
            }
            
            // Intro still playing? Skip this time
            if (isIntroStillPlaying()) {
                console.log('[SovaTutorials] 🪨 Intro still playing - skipping rune stone tutorial (will play next time)');
                return;
            }
            
            console.log('[SovaTutorials] 🪨 Playing rune stone tutorial NOW');
            
            playSovaTutorial(
                {
                    audioFile,
                    soundBoxLabel,
                    message,
                    messageId: `sova-rune-stone-tutorial-${Date.now()}`,
                },
                showSovaSoundBoxRef.current,
                sovaMessageAdderRef.current,
                {
                    onAudioStart: () => {
                        if (onMarkRuneStoneTutorialSeen) {
                            console.log('[SovaTutorials] 🪨 Marking rune stone tutorial as seen on server');
                            onMarkRuneStoneTutorialSeen();
                        }
                    }
                }
            );
        };

        window.addEventListener(eventName!, handleEvent as EventListener);
        return () => window.removeEventListener(eventName!, handleEvent as EventListener);
    }, [hasSeenRuneStoneTutorial, onMarkRuneStoneTutorialSeen, showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Part 6: ALK Station Tutorial (Event-driven)
    // Now uses SERVER-SIDE flag instead of localStorage
    // ========================================================================
    useEffect(() => {
        const { audioFile, soundBoxLabel, eventName, message } = TUTORIALS.alkStation;
        
        const handleEvent = () => {
            console.log('[SovaTutorials] 🏭 ALK station tutorial event received');
            
            // Server says already seen? Skip
            if (hasSeenAlkStationTutorial === true) {
                console.log('[SovaTutorials] 🏭 ALK station tutorial already seen (server), skipping');
                return;
            }
            
            // Intro still playing? Skip this time
            if (isIntroStillPlaying()) {
                console.log('[SovaTutorials] 🏭 Intro still playing - skipping ALK station tutorial (will play next time)');
                return;
            }
            
            console.log('[SovaTutorials] 🏭 Playing ALK station tutorial NOW');
            
            playSovaTutorial(
                {
                    audioFile,
                    soundBoxLabel,
                    message,
                    messageId: `sova-alk-station-tutorial-${Date.now()}`,
                },
                showSovaSoundBoxRef.current,
                sovaMessageAdderRef.current,
                {
                    onAudioStart: () => {
                        if (onMarkAlkStationTutorialSeen) {
                            console.log('[SovaTutorials] 🏭 Marking ALK station tutorial as seen on server');
                            onMarkAlkStationTutorialSeen();
                        }
                    }
                }
            );
        };

        window.addEventListener(eventName!, handleEvent as EventListener);
        return () => window.removeEventListener(eventName!, handleEvent as EventListener);
    }, [hasSeenAlkStationTutorial, onMarkAlkStationTutorialSeen, showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Part 6b: Crashed Research Drone Tutorial (Event-driven)
    // Now uses SERVER-SIDE flag instead of localStorage
    // ========================================================================
    useEffect(() => {
        const { audioFile, soundBoxLabel, eventName, message } = TUTORIALS.crashedDrone;
        
        const handleEvent = () => {
            console.log('[SovaTutorials] 🛸 Crashed drone tutorial event received');
            
            // Server says already seen? Skip
            if (hasSeenCrashedDroneTutorial === true) {
                console.log('[SovaTutorials] 🛸 Crashed drone tutorial already seen (server), skipping');
                return;
            }
            
            // Intro still playing? Skip this time
            if (isIntroStillPlaying()) {
                console.log('[SovaTutorials] 🛸 Intro still playing - skipping crashed drone tutorial (will play next time)');
                return;
            }
            
            console.log('[SovaTutorials] 🛸 Playing crashed drone tutorial NOW');
            
            playSovaTutorial(
                {
                    audioFile,
                    soundBoxLabel,
                    message,
                    messageId: `sova-crashed-drone-tutorial-${Date.now()}`,
                },
                showSovaSoundBoxRef.current,
                sovaMessageAdderRef.current,
                {
                    onAudioStart: () => {
                        if (onMarkCrashedDroneTutorialSeen) {
                            console.log('[SovaTutorials] 🛸 Marking crashed drone tutorial as seen on server');
                            onMarkCrashedDroneTutorialSeen();
                        }
                    }
                }
            );
        };

        window.addEventListener(eventName!, handleEvent as EventListener);
        return () => window.removeEventListener(eventName!, handleEvent as EventListener);
    }, [hasSeenCrashedDroneTutorial, onMarkCrashedDroneTutorialSeen, showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Part 7: Proximity Detection for Rune Stones, ALK Stations, and Monuments
    // Fires tutorial events when player first approaches these structures.
    // Now uses SERVER-SIDE flags instead of localStorage
    // ========================================================================
    useEffect(() => {
        // Skip if no player position or no entity data
        if (!localPlayerPosition || !localPlayerId) return;
        
        const playerX = localPlayerPosition.x;
        const playerY = localPlayerPosition.y;
        
        // Check rune stone proximity - use server flag
        if (runeStones && runeStones.size > 0 && !hasFiredRuneStoneEvent.current) {
            // Don't fire if server says already seen
            if (hasSeenRuneStoneTutorial !== true) {
                for (const runeStone of runeStones.values()) {
                    const dx = playerX - runeStone.posX;
                    const dy = playerY - runeStone.posY;
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < TUTORIAL_PROXIMITY_DISTANCE_SQ) {
                        console.log('[SovaTutorials] 🪨 Player approached rune stone - firing tutorial event');
                        hasFiredRuneStoneEvent.current = true;
                        window.dispatchEvent(new Event(TUTORIALS.runeStone.eventName!));
                        break;
                    }
                }
            }
        }
        
        // Check ALK station proximity - use server flag
        if (alkStations && alkStations.size > 0 && !hasFiredAlkStationEvent.current) {
            // Don't fire if server says already seen
            if (hasSeenAlkStationTutorial !== true) {
                for (const alkStation of alkStations.values()) {
                    const dx = playerX - alkStation.worldPosX;
                    const dy = playerY - alkStation.worldPosY;
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < TUTORIAL_PROXIMITY_DISTANCE_SQ) {
                        console.log('[SovaTutorials] 🏭 Player approached ALK station - firing tutorial event');
                        hasFiredAlkStationEvent.current = true;
                        window.dispatchEvent(new Event(TUTORIALS.alkStation.eventName!));
                        break;
                    }
                }
            }
        }
        
        // Check crashed research drone proximity - use server flag
        if (monumentParts && monumentParts.size > 0 && !hasFiredCrashedDroneEvent.current) {
            // Don't fire if server says already seen
            if (hasSeenCrashedDroneTutorial !== true) {
                for (const part of monumentParts.values()) {
                    // Only check crashed research drone parts
                    if (part.monumentType?.tag !== 'CrashedResearchDrone') continue;
                    
                    const dx = playerX - part.worldX;
                    const dy = playerY - part.worldY;
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < TUTORIAL_PROXIMITY_DISTANCE_SQ) {
                        console.log('[SovaTutorials] 🛸 Player approached crashed research drone - firing tutorial event');
                        hasFiredCrashedDroneEvent.current = true;
                        window.dispatchEvent(new Event(TUTORIALS.crashedDrone.eventName!));
                        break;
                    }
                }
            }
        }
    }, [localPlayerPosition, localPlayerId, runeStones, alkStations, monumentParts, hasSeenRuneStoneTutorial, hasSeenAlkStationTutorial, hasSeenCrashedDroneTutorial]);
}

export default useSovaTutorials;
