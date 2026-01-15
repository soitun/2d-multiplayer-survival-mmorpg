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
 * All tutorials:
 * - Are played only once per player (persisted to localStorage)
 * - Show SOVA sound box with waveform visualization
 * - Send messages to SOVA chat with tab flash
 * - Handle audio playback errors gracefully
 */

import { useEffect, useRef, useCallback, MutableRefObject } from 'react';

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

interface UseSovaTutorialsProps {
    localPlayerId: string | null | undefined;
    showSovaSoundBoxRef: MutableRefObject<ShowSovaSoundBoxFn | null | undefined>;
    sovaMessageAdderRef: MutableRefObject<SovaMessageAdderFn | null | undefined>;
    // Optional entity data for proximity-based tutorials
    localPlayerPosition?: { x: number; y: number } | null;
    runeStones?: Map<string, RuneStoneData>;
    alkStations?: Map<string, AlkStationData>;
}

// ============================================================================
// Constants - Tutorial Definitions
// ============================================================================

const TUTORIALS = {
    crashIntro: {
        storageKey: 'broth_sova_intro_crash_played',
        delayMs: 2.5 * 1000, // 2.5 seconds
        audioFile: '/sounds/sova_intro_crash.mp3',
        soundBoxLabel: 'SOVA: Neural Link Established',
        message: `Neural link established. This is SOVA — Sentient Ocular Virtual Assistant — your tactical AI implant from Gred Naval Intelligence. I've been offline since the Sovereign Tide went down. Based on your biometrics, you've been unconscious for... a while. The icebreaker's gone. Most of the crew... didn't make it. You're stranded on an uncharted island somewhere in the Aleutians — no comms, no extraction, no backup. Your survival is now my primary directive. The wreckage scattered supplies across the shoreline, but they won't last. You're going to need to learn how to live off this place. I'll walk you through it — press J anytime to check your current objectives. I've loaded an introductory sequence to get you started, and once you're stable, I'll push daily assignments to keep your skills sharp. For now, head to the beach and start gathering plant fibers from the tall grass along the shoreline. You'll need them for rope, bandages, the basics. One step at a time, agent. Just stay alive.`,
    },
    tutorialHint: {
        storageKey: 'broth_sova_tutorial_hint_played',
        delayMs: 3.5 * 60 * 1000, // 3.5 minutes
        audioFile: '/sounds/sova_tutorial_hint.mp3',
        soundBoxLabel: 'SOVA: Press V to Talk',
        message: `Hey, you... Yeah, you. I can hear you breathing out there. Look, if you're feeling lost or confused—and trust me, everyone is at first—just press V and talk to me. I'll walk you through everything. Fair warning though, the first time we chat I might take a moment to... wake up. Cold starts and all that. Think of it as me shaking off the cosmic dust. I'll be quicker after that, I promise. Otherwise, you can text with me here.`,
    },
    memoryShard: {
        storageKey: 'broth_memory_shard_tutorial_played',
        audioFile: '/sounds/sova_tutorial_memory_shard.mp3',
        soundBoxLabel: 'SOVA: Memory Shard Warning',
        eventName: 'sova-memory-shard-tutorial',
        message: `Agent, you've acquired a Memory Shard. These things keep appearing on this island — I don't know where they come from, but I can integrate them to upgrade your loadout and unlock new blueprints. Be warned though: the longer you carry them, the more they mess with your head. You'll notice your vision turning purple — that's the insanity building up. It's not dangerous immediately, but don't hoard them for too long. Drop them on the ground for a bit if you need a break, or stash them at your base once you build one. The purple fades once you're not carrying them.`,
    },
    firstHostileEncounter: {
        storageKey: 'broth_first_hostile_encounter_played',
        audioFile: '/sounds/sova_first_hostile_encounter.mp3',
        soundBoxLabel: 'SOVA: Neural Resonance Detected',
        eventName: 'sova-first-hostile-encounter',
        message: `Wait... I'm picking up something strange. Neural resonance patterns—fragmented, hostile. They're not quite... real. More like echoes. Apparitions formed from collective fear and fractured memories. They sense vulnerable minds—yours is lit up like a beacon right now. Shelter can block their attacks, but don't get comfortable. Stay too long in one place and the larger ones will start tearing through your walls. Your best options? Keep moving until dawn, or stand your ground and fight. They can be killed. They're not invincible—just relentless.`,
    },
    runeStone: {
        storageKey: 'broth_rune_stone_tutorial_played',
        audioFile: '/sounds/sova_tutorial_rune_stone.mp3',
        soundBoxLabel: 'SOVA: Anomalous Structure Detected',
        eventName: 'sova-rune-stone-tutorial',
        message: `Hold on — I'm picking up some unusual readings from that structure. Scanning now. It's old. Pre-industrial, possibly ancient. These markings... they're some kind of resonance pattern. I'm detecting three distinct signatures across the island — green ones seem to accelerate biological growth, red ones affect material synthesis, and blue ones... those give off the same frequency as Memory Shards. Interesting. They also emit a faint light field at night. Approach the stone and read the inscription — it should tell you exactly what this one does.`,
    },
    alkStation: {
        storageKey: 'broth_alk_station_tutorial_played',
        audioFile: '/sounds/sova_tutorial_alk_station.mp3',
        soundBoxLabel: 'SOVA: Military Frequency Detected',
        eventName: 'sova-alk-station-tutorial',
        message: `That structure is broadcasting on a military frequency. Analyzing... Decoding the header now. A-L-K — Automated Logistics Kompound. Pre-collapse infrastructure, still operational. There's a central compound somewhere on the island and several substations scattered around. They all connect to the same contract system — bring them resources, they pay you in shards. Press E at a station to deliver contracts you've accepted. To browse and accept new contracts remotely, press G and select the ALK Board from my interface. Could be useful for converting surplus materials into something more valuable.`,
    },
} as const;

// Intro audio duration check (for skipping overlapping audio)
const INTRO_AUDIO_DURATION_MS = 45 * 1000; // 45 seconds - generous estimate
const INTRO_STARTED_KEY = 'broth_sova_intro_started_at';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a tutorial has already been played (persisted in localStorage)
 */
function hasBeenPlayed(storageKey: string): boolean {
    return localStorage.getItem(storageKey) === 'true';
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
        
        audio.play()
            .then(() => {
                console.log(`[SovaTutorials] Playing: ${soundBoxLabel}`);
                onAudioStart?.();
                
                // Show sound box with waveform
                if (showSovaSoundBox) {
                    showSovaSoundBox(audio, soundBoxLabel);
                }
                
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
    localPlayerPosition,
    runeStones,
    alkStations,
}: UseSovaTutorialsProps): void {
    
    // Track if component is mounted to avoid state updates after unmount
    const isMountedRef = useRef(true);
    
    // Track if we've already fired the proximity events this session (to avoid spamming)
    const hasFiredRuneStoneEvent = useRef(false);
    const hasFiredAlkStationEvent = useRef(false);
    
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // ========================================================================
    // Part 1: SOVA Crash Intro (5 seconds after spawn)
    // ========================================================================
    useEffect(() => {
        const { storageKey, delayMs, audioFile, soundBoxLabel, message } = TUTORIALS.crashIntro;
        
        // Skip if already played or no player yet
        if (hasBeenPlayed(storageKey) || !localPlayerId) {
            return;
        }

        console.log('[SovaTutorials] 🚢 Scheduling crash intro in 5 seconds...');
        
        const timer = setTimeout(() => {
            // Double-check (race condition protection)
            if (hasBeenPlayed(storageKey) || !isMountedRef.current) {
                return;
            }

            // Mark as played FIRST
            markAsPlayed(storageKey);
            // Store timestamp for other sounds to check
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
                sovaMessageAdderRef.current
            );
        }, delayMs);

        return () => clearTimeout(timer);
    }, [localPlayerId, showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Part 2: SOVA Tutorial Hint (3.5 minutes after spawn)
    // ========================================================================
    useEffect(() => {
        const { storageKey, delayMs, audioFile, soundBoxLabel, message } = TUTORIALS.tutorialHint;
        
        // Skip if already played or no player yet
        if (hasBeenPlayed(storageKey) || !localPlayerId) {
            return;
        }

        console.log('[SovaTutorials] 🎓 Scheduling tutorial hint in 3.5 minutes...');
        
        const timer = setTimeout(() => {
            // Double-check (race condition protection)
            if (hasBeenPlayed(storageKey) || !isMountedRef.current) {
                return;
            }

            // Mark as played FIRST
            markAsPlayed(storageKey);
            
            console.log('[SovaTutorials] 🎓 Playing tutorial hint NOW');
            
            playSovaTutorial(
                {
                    audioFile,
                    soundBoxLabel,
                    message,
                    messageId: `sova-tutorial-hint-${Date.now()}`,
                },
                showSovaSoundBoxRef.current,
                sovaMessageAdderRef.current
            );
        }, delayMs);

        return () => clearTimeout(timer);
    }, [localPlayerId, showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Part 3: Memory Shard Tutorial (Event-driven)
    // Plays the first time a memory shard is picked up AFTER intro finishes.
    // If intro is still playing, we skip entirely and wait for next pickup.
    // Triggered by: useSoundSystem.ts when it receives SovaMemoryShardTutorial sound event
    // ========================================================================
    useEffect(() => {
        const { storageKey, audioFile, soundBoxLabel, eventName, message } = TUTORIALS.memoryShard;
        
        const handleEvent = () => {
            console.log('[SovaTutorials] 🔮 Memory shard tutorial event received');
            
            // Already played before? Skip entirely
            if (hasBeenPlayed(storageKey)) {
                console.log('[SovaTutorials] 🔮 Memory shard tutorial already played, skipping');
                return;
            }
            
            // Intro still playing? Skip this time, but DON'T mark as played
            // So it will play next time player picks up a memory shard
            if (isIntroStillPlaying()) {
                console.log('[SovaTutorials] 🔮 Intro still playing - skipping memory shard tutorial (will play next time)');
                return;
            }
            
            // Mark as played FIRST to prevent duplicate plays
            markAsPlayed(storageKey);
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

        window.addEventListener(eventName, handleEvent as EventListener);
        return () => window.removeEventListener(eventName, handleEvent as EventListener);
    }, [showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Part 4: First Hostile Encounter Tutorial (Event-driven)
    // Plays the first time the player encounters hostile NPCs at night.
    // Warns about the neural resonance apparitions and suggests shelter/fighting.
    // ========================================================================
    useEffect(() => {
        const { storageKey, audioFile, soundBoxLabel, eventName, message } = TUTORIALS.firstHostileEncounter;
        
        const handleEvent = () => {
            console.log('[SovaTutorials] 👹 First hostile encounter event received');
            
            // Already played before? Skip entirely
            if (hasBeenPlayed(storageKey)) {
                console.log('[SovaTutorials] 👹 First hostile encounter tutorial already played, skipping');
                return;
            }
            
            // Intro still playing? Skip this time, but DON'T mark as played
            // So it will play next time player encounters hostiles
            if (isIntroStillPlaying()) {
                console.log('[SovaTutorials] 👹 Intro still playing - skipping hostile encounter tutorial (will play next time)');
                return;
            }
            
            // Mark as played FIRST to prevent duplicate plays
            markAsPlayed(storageKey);
            console.log('[SovaTutorials] 👹 Playing first hostile encounter tutorial NOW');
            
            playSovaTutorial(
                {
                    audioFile,
                    soundBoxLabel,
                    message,
                    messageId: `sova-first-hostile-encounter-${Date.now()}`,
                },
                showSovaSoundBoxRef.current,
                sovaMessageAdderRef.current
            );
        };

        window.addEventListener(eventName, handleEvent as EventListener);
        return () => window.removeEventListener(eventName, handleEvent as EventListener);
    }, [showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Part 5: Rune Stone Tutorial (Event-driven)
    // Plays the first time the player approaches a rune stone.
    // Explains the three rune stone types and their effects.
    // ========================================================================
    useEffect(() => {
        const { storageKey, audioFile, soundBoxLabel, eventName, message } = TUTORIALS.runeStone;
        
        const handleEvent = () => {
            console.log('[SovaTutorials] 🪨 Rune stone tutorial event received');
            
            // Already played before? Skip entirely
            if (hasBeenPlayed(storageKey)) {
                console.log('[SovaTutorials] 🪨 Rune stone tutorial already played, skipping');
                return;
            }
            
            // Intro still playing? Skip this time, but DON'T mark as played
            if (isIntroStillPlaying()) {
                console.log('[SovaTutorials] 🪨 Intro still playing - skipping rune stone tutorial (will play next time)');
                return;
            }
            
            // Mark as played FIRST to prevent duplicate plays
            markAsPlayed(storageKey);
            console.log('[SovaTutorials] 🪨 Playing rune stone tutorial NOW');
            
            playSovaTutorial(
                {
                    audioFile,
                    soundBoxLabel,
                    message,
                    messageId: `sova-rune-stone-tutorial-${Date.now()}`,
                },
                showSovaSoundBoxRef.current,
                sovaMessageAdderRef.current
            );
        };

        window.addEventListener(eventName, handleEvent as EventListener);
        return () => window.removeEventListener(eventName, handleEvent as EventListener);
    }, [showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Part 6: ALK Station Tutorial (Event-driven)
    // Plays the first time the player approaches an ALK station.
    // Explains the contract system and how to use stations.
    // ========================================================================
    useEffect(() => {
        const { storageKey, audioFile, soundBoxLabel, eventName, message } = TUTORIALS.alkStation;
        
        const handleEvent = () => {
            console.log('[SovaTutorials] 🏭 ALK station tutorial event received');
            
            // Already played before? Skip entirely
            if (hasBeenPlayed(storageKey)) {
                console.log('[SovaTutorials] 🏭 ALK station tutorial already played, skipping');
                return;
            }
            
            // Intro still playing? Skip this time, but DON'T mark as played
            if (isIntroStillPlaying()) {
                console.log('[SovaTutorials] 🏭 Intro still playing - skipping ALK station tutorial (will play next time)');
                return;
            }
            
            // Mark as played FIRST to prevent duplicate plays
            markAsPlayed(storageKey);
            console.log('[SovaTutorials] 🏭 Playing ALK station tutorial NOW');
            
            playSovaTutorial(
                {
                    audioFile,
                    soundBoxLabel,
                    message,
                    messageId: `sova-alk-station-tutorial-${Date.now()}`,
                },
                showSovaSoundBoxRef.current,
                sovaMessageAdderRef.current
            );
        };

        window.addEventListener(eventName, handleEvent as EventListener);
        return () => window.removeEventListener(eventName, handleEvent as EventListener);
    }, [showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Part 7: Proximity Detection for Rune Stones and ALK Stations
    // Fires tutorial events when player first approaches these structures.
    // ========================================================================
    useEffect(() => {
        // Skip if no player position or no entity data
        if (!localPlayerPosition || !localPlayerId) return;
        
        const playerX = localPlayerPosition.x;
        const playerY = localPlayerPosition.y;
        
        // Check rune stone proximity
        if (runeStones && runeStones.size > 0 && !hasFiredRuneStoneEvent.current) {
            // Don't fire if already played
            if (!hasBeenPlayed(TUTORIALS.runeStone.storageKey)) {
                for (const runeStone of runeStones.values()) {
                    const dx = playerX - runeStone.posX;
                    const dy = playerY - runeStone.posY;
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < TUTORIAL_PROXIMITY_DISTANCE_SQ) {
                        console.log('[SovaTutorials] 🪨 Player approached rune stone - firing tutorial event');
                        hasFiredRuneStoneEvent.current = true;
                        window.dispatchEvent(new Event(TUTORIALS.runeStone.eventName));
                        break;
                    }
                }
            }
        }
        
        // Check ALK station proximity
        if (alkStations && alkStations.size > 0 && !hasFiredAlkStationEvent.current) {
            // Don't fire if already played
            if (!hasBeenPlayed(TUTORIALS.alkStation.storageKey)) {
                for (const alkStation of alkStations.values()) {
                    const dx = playerX - alkStation.worldPosX;
                    const dy = playerY - alkStation.worldPosY;
                    const distSq = dx * dx + dy * dy;
                    
                    if (distSq < TUTORIAL_PROXIMITY_DISTANCE_SQ) {
                        console.log('[SovaTutorials] 🏭 Player approached ALK station - firing tutorial event');
                        hasFiredAlkStationEvent.current = true;
                        window.dispatchEvent(new Event(TUTORIALS.alkStation.eventName));
                        break;
                    }
                }
            }
        }
    }, [localPlayerPosition, localPlayerId, runeStones, alkStations]);
}

export default useSovaTutorials;
