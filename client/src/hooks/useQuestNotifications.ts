/**
 * useQuestNotifications.ts
 * 
 * Custom hook that manages quest-related notifications:
 * - SOVA quest messages (routed to SOVA chat tab with audio)
 * - Quest completion celebrations
 * - Quest progress milestone tracking
 * 
 * Abstracts notification handling logic from GameScreen.
 */

import { useEffect, useState, useCallback, MutableRefObject, useRef } from 'react';
import { Identity } from 'spacetimedb';
import { QuestCompletionData } from '../components/QuestNotifications';
import { queueNotificationSound } from '../utils/notificationSoundQueue';

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

// SpacetimeDB notification types (from props)
interface SovaQuestMessage {
    message: string;
    messageType: string;
    audioFile?: string;
    sentAt?: { microsSinceUnixEpoch: bigint };
}

interface QuestCompletionNotification {
    playerId?: Identity;
    questName: string;
    questType: string;
    xpAwarded?: number | bigint;
    shardsAwarded?: number | bigint;
    unlockedRecipe?: string;
    completedAt?: { microsSinceUnixEpoch: bigint };
}

interface QuestProgressNotification {
    playerId?: Identity;
    questName: string;
    currentProgress: number;
    targetAmount: number;
    milestonePercent: number;
}

interface UseQuestNotificationsProps {
    // Data from SpacetimeDB
    sovaQuestMessages: Map<string, SovaQuestMessage> | undefined;
    questCompletionNotifications: Map<string, QuestCompletionNotification> | undefined;
    questProgressNotifications: Map<string, QuestProgressNotification> | undefined;
    playerIdentity: Identity | null | undefined;
    
    // Refs for SOVA integration
    showSovaSoundBoxRef: MutableRefObject<ShowSovaSoundBoxFn | null | undefined>;
    sovaMessageAdderRef: MutableRefObject<SovaMessageAdderFn | null | undefined>;
}

interface UseQuestNotificationsReturn {
    // Quest completion notification state (for UI display)
    questCompletionNotification: QuestCompletionData | null;
    dismissQuestCompletionNotification: () => void;
    
    // New quest notification indicator (for flashing J button etc.)
    hasNewQuestNotification: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const SOVA_LABEL_MAP: Record<string, string> = {
    'quest_start': 'SOVA: New Mission',
    'quest_complete': 'SOVA: Mission Complete',
    'quest_hint': 'SOVA: Hint',
    'daily_quests_assigned': 'SOVA: Daily Training',
};

// Priority for sequencing when multiple SOVA messages arrive in same batch (lower = play first)
const SOVA_MESSAGE_PRIORITY: Record<string, number> = {
    'quest_complete': 0,
    'tutorial_complete': 1,
    'quest_start': 2,
    'quest_hint': 3,
    'daily_quests_assigned': 4,
};

// ============================================================================
// Session-Based Notification Filtering (NO localStorage)
// ============================================================================
//
// We do NOT persist seen notification IDs to localStorage. Persisting caused a bug:
// when the database is reset (spacetime publish -c), notification IDs restart at
// 1, 2, 3... but the client still had those IDs in localStorage from the previous
// DB state, so new notifications were skipped. Sounds only played after clearing
// cookies (which cleared localStorage).
//
// The server is the source of truth for quest state. We use:
// 1. SESSION_START_TIME - skip notifications created before this page loaded
// 2. In-memory seen IDs - dedupe within the same session only
// ============================================================================

const SESSION_START_TIME = Date.now();

function timestampToMs(timestamp: { microsSinceUnixEpoch: bigint } | undefined): number {
    if (!timestamp) return 0;
    return Number(timestamp.microsSinceUnixEpoch / 1000n);
}

function isOldNotification(sentAt: { microsSinceUnixEpoch: bigint } | undefined): boolean {
    const notificationTimeMs = timestampToMs(sentAt);
    return notificationTimeMs < (SESSION_START_TIME - 1000);
}

// ============================================================================
// Main Hook
// ============================================================================

export function useQuestNotifications({
    sovaQuestMessages,
    questCompletionNotifications,
    questProgressNotifications,
    playerIdentity,
    showSovaSoundBoxRef,
    sovaMessageAdderRef,
}: UseQuestNotificationsProps): UseQuestNotificationsReturn {
    
    // In-memory only - no localStorage. Prevents stale IDs when DB is reset.
    const [seenSovaQuestMessageIds, setSeenSovaQuestMessageIds] = useState<Set<string>>(() => new Set());
    const [seenQuestCompletionIds, setSeenQuestCompletionIds] = useState<Set<string>>(() => new Set());
    const [seenQuestProgressIds, setSeenQuestProgressIds] = useState<Set<string>>(() => new Set());
    
    // State for UI
    const [questCompletionNotification, setQuestCompletionNotification] = useState<QuestCompletionData | null>(null);
    const [hasNewQuestNotification, setHasNewQuestNotification] = useState(false);

    // Dismiss handler for quest completion UI
    const dismissQuestCompletionNotification = useCallback(() => {
        setQuestCompletionNotification(null);
    }, []);

    // ========================================================================
    // Handle SOVA Quest Messages - route to SOVA chat tab
    // Processes messages SEQUENTIALLY to avoid AbortError (play interrupted by pause)
    // when quest_complete + quest_start arrive in same batch
    // ========================================================================
    const sovaAudioQueueRef = useRef<boolean>(false);
    // Cooldown: server sends quest_complete + quest_start (or tutorial_complete) with SAME audio file
    // - prevents hearing mission complete sound twice (full play + beginning again)
    const lastPlayedAudioRef = useRef<{ file: string; at: number } | null>(null);
    const SAME_AUDIO_COOLDOWN_MS = 2500;
    
    useEffect(() => {
        if (!sovaQuestMessages || sovaQuestMessages.size === 0) return;
        if (!sovaMessageAdderRef.current) return;
        
        // Collect new messages, sorted by priority (quest_complete before quest_start)
        const newMessages: Array<{ id: string; message: SovaQuestMessage }> = [];
        sovaQuestMessages.forEach((message, id) => {
            if (seenSovaQuestMessageIds.has(id)) return;
            if (isOldNotification(message.sentAt)) {
                setSeenSovaQuestMessageIds(prev => new Set(prev).add(id));
                return;
            }
            newMessages.push({ id, message });
        });
        
        if (newMessages.length === 0) return;
        
        // Sort: quest_complete first, then quest_start, etc.
        newMessages.sort((a, b) => {
            const prioA = SOVA_MESSAGE_PRIORITY[a.message.messageType] ?? 99;
            const prioB = SOVA_MESSAGE_PRIORITY[b.message.messageType] ?? 99;
            return prioA - prioB;
        });
        
        // Mark all as seen immediately (we'll process them) - in-memory only
        setSeenSovaQuestMessageIds(prev => {
            const newSet = new Set(prev);
            newMessages.forEach(({ id }) => newSet.add(id));
            return newSet;
        });
        
        setHasNewQuestNotification(true);
        setTimeout(() => setHasNewQuestNotification(false), 5000);
        
        const processNext = (index: number) => {
            if (index >= newMessages.length) {
                sovaAudioQueueRef.current = false;
                return;
            }
            
            const { id, message } = newMessages[index];
            console.log('[QuestNotifications] 📡 New SOVA quest message:', message.message);
            
            // Add to chat immediately (no audio delay)
            if (sovaMessageAdderRef.current) {
                sovaMessageAdderRef.current({
                    id: `sova-quest-${id}-${Date.now()}`,
                    text: message.message,
                    isUser: false,
                    timestamp: new Date(Number(message.sentAt?.microsSinceUnixEpoch || 0) / 1000),
                    flashTab: true,
                });
            }
            
            const playAndContinue = () => {
                if (!message.audioFile) {
                    processNext(index + 1);
                    return;
                }
                
                // Skip audio if we just played the same file (quest_complete + quest_start use same file)
                const audioFile = message.audioFile;
                const now = Date.now();
                const last = lastPlayedAudioRef.current;
                if (last && audioFile && last.file === audioFile && (now - last.at) < SAME_AUDIO_COOLDOWN_MS) {
                    processNext(index + 1);
                    return;
                }
                
                try {
                    const audio = new Audio(`/sounds/${audioFile}`);
                    audio.volume = 0.8;
                    audio.preload = 'auto';
                    
                    const label = SOVA_LABEL_MAP[message.messageType] || 'SOVA: Quest Update';
                    
                    const onEndedOrError = () => {
                        audio.removeEventListener('ended', onEndedOrError);
                        audio.removeEventListener('error', onEndedOrError);
                        audio.removeEventListener('canplay', tryPlay);
                        processNext(index + 1);
                    };
                    
                    audio.addEventListener('ended', onEndedOrError);
                    audio.addEventListener('error', onEndedOrError);
                    
                    sovaAudioQueueRef.current = true;
                    
                    // Use 'canplay' for fastest start (fires when enough data to begin playback)
                    // - quest complete should play immediately when the player completes a quest
                    let loadTimeout: ReturnType<typeof setTimeout> | undefined;
                    const tryPlay = () => {
                        if (loadTimeout) clearTimeout(loadTimeout);
                        audio.removeEventListener('canplay', tryPlay);
                        lastPlayedAudioRef.current = { file: audioFile, at: Date.now() };
                        if (showSovaSoundBoxRef.current) {
                            showSovaSoundBoxRef.current(audio, label);
                        }
                        const playPromise = audio.play();
                        if (playPromise !== undefined) {
                            playPromise.catch(err => {
                                console.warn('[QuestNotifications] Failed to play SOVA quest audio:', err);
                                onEndedOrError();
                            });
                        } else {
                            onEndedOrError();
                        }
                    };
                    
                    // readyState 2+ = HAVE_CURRENT_DATA or better - safe to play
                    if (audio.readyState >= 2) {
                        tryPlay();
                    } else {
                        audio.addEventListener('canplay', tryPlay);
                        loadTimeout = setTimeout(() => {
                            if (audio.readyState < 2) {
                                audio.removeEventListener('canplay', tryPlay);
                                console.warn('[QuestNotifications] SOVA audio load timeout:', audioFile);
                                onEndedOrError();
                            }
                        }, 4000);
                    }
                } catch (err) {
                    console.warn('[QuestNotifications] Error creating SOVA quest audio:', err);
                    processNext(index + 1);
                }
            };
            
            // Quest complete and tutorial complete play IMMEDIATELY - never wait for previous batch.
            // These are critical feedback sounds that must play right away when the player completes a quest.
            const isUrgentMessage = message.messageType === 'quest_complete' || message.messageType === 'tutorial_complete';
            
            // Only wait if a PREVIOUS batch is still playing (index 0 = starting new batch) AND not urgent
            if (index === 0 && sovaAudioQueueRef.current && !isUrgentMessage) {
                const checkInterval = setInterval(() => {
                    if (!sovaAudioQueueRef.current) {
                        clearInterval(checkInterval);
                        playAndContinue();
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(checkInterval);
                    if (sovaAudioQueueRef.current) {
                        sovaAudioQueueRef.current = false;
                        playAndContinue();
                    }
                }, 6000);
            } else {
                playAndContinue();
            }
        };
        
        processNext(0);
    }, [sovaQuestMessages, seenSovaQuestMessageIds, showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Handle Quest Completion Notifications - show celebration UI
    // Now filters by session timestamp to prevent replay after cache clear
    // ========================================================================
    useEffect(() => {
        // IMPORTANT: Don't process notifications until playerIdentity is available
        // Otherwise notifications get marked as "seen" before we can verify they're for this player
        if (!playerIdentity) return;
        if (!questCompletionNotifications || questCompletionNotifications.size === 0) return;
        
        questCompletionNotifications.forEach((notification, id) => {
            // Skip if already seen this session
            if (seenQuestCompletionIds.has(id)) return;
            
            // Only show if it's for the local player
            if (notification.playerId?.toHexString() !== playerIdentity.toHexString()) return;
            
            // CRITICAL: Skip old notifications from before this session started
            // This prevents replaying quest completion celebrations after cache clear
            if (isOldNotification(notification.completedAt)) {
                // Silently mark as seen without displaying
                setSeenQuestCompletionIds(prev => new Set(prev).add(id));
                return;
            }
            
            console.log('[QuestNotifications] 🆕 NEW quest completion to display:', id, notification.questName, notification.questType);
            
            // Mark as seen (in-memory only)
            setSeenQuestCompletionIds(prev => new Set(prev).add(id));
            
            console.log('[QuestNotifications] 🎉 Quest completion:', notification.questName, 'type:', notification.questType);
            
            // Show celebration UI
            setQuestCompletionNotification({
                id: id,
                questName: notification.questName,
                questType: notification.questType === 'tutorial' ? 'tutorial' : 'daily',
                xpAwarded: Number(notification.xpAwarded || 0),
                shardsAwarded: Number(notification.shardsAwarded || 0),
                unlockedRecipe: notification.unlockedRecipe || undefined,
            });
            
            // Queue mission complete sound ONLY for daily quests.
            // Tutorial quests send a SovaQuestMessage with quest_complete that plays the same sound
            // via showSovaSoundBox - calling both would cause double play or the queue to skip.
            if (notification.questType !== 'tutorial') {
                queueNotificationSound('mission_complete');
            }
        });
    }, [questCompletionNotifications, playerIdentity, seenQuestCompletionIds]);

    // ========================================================================
    // Handle Quest Progress Notifications - log milestone (toast removed)
    // ========================================================================
    useEffect(() => {
        // IMPORTANT: Don't process notifications until playerIdentity is available
        if (!playerIdentity) return;
        if (!questProgressNotifications || questProgressNotifications.size === 0) return;
        
        questProgressNotifications.forEach((notification, id) => {
            if (seenQuestProgressIds.has(id)) return;
            
            // Only process if it's for the local player
            if (notification.playerId?.toHexString() !== playerIdentity.toHexString()) return;
            
            // Mark as seen
            setSeenQuestProgressIds(prev => new Set(prev).add(id));
            
            console.log('[QuestNotifications] 📊 Quest progress milestone:', notification.questName, notification.milestonePercent + '%');
        });
    }, [questProgressNotifications, playerIdentity, seenQuestProgressIds]);

    return {
        questCompletionNotification,
        dismissQuestCompletionNotification,
        hasNewQuestNotification,
    };
}

export default useQuestNotifications;
