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
// Session-Based Notification Filtering
// ============================================================================
// 
// IMPORTANT: We now filter notifications by SESSION TIMESTAMP instead of relying
// on localStorage alone. This ensures that clearing browser cache does NOT replay
// old quest completion notifications.
//
// How it works:
// 1. When this module loads, we capture the current timestamp as SESSION_START_TIME
// 2. Notifications with sentAt/completedAt BEFORE this time are considered "old"
// 3. Old notifications are automatically marked as "seen" and not displayed
// 4. Only notifications created AFTER the session started are shown
//
// This is combined with localStorage tracking (for in-session deduplication)
// to provide airtight protection against notification replay.
// ============================================================================

// Session start time - captured once when module loads
const SESSION_START_TIME = Date.now();
console.log(`[useQuestNotifications] Session started at ${new Date(SESSION_START_TIME).toISOString()}`);

// Convert SpacetimeDB timestamp to milliseconds
function timestampToMs(timestamp: { microsSinceUnixEpoch: bigint } | undefined): number {
    if (!timestamp) return 0;
    return Number(timestamp.microsSinceUnixEpoch / 1000n);
}

// Check if a notification is from BEFORE this session started
function isOldNotification(sentAt: { microsSinceUnixEpoch: bigint } | undefined): boolean {
    const notificationTimeMs = timestampToMs(sentAt);
    // Add 5 second grace period to handle clock skew and notification creation delay
    return notificationTimeMs < (SESSION_START_TIME - 5000);
}

// LocalStorage keys for persisting seen notifications across page refreshes
// (Still used for in-session deduplication, but timestamp filtering is primary defense)
const SEEN_QUEST_COMPLETIONS_KEY = 'broth_seen_quest_completions';
const SEEN_SOVA_MESSAGES_KEY = 'broth_seen_sova_messages';

// Load seen IDs from localStorage
function loadSeenIds(key: string): Set<string> {
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                return new Set(parsed);
            }
        }
    } catch (e) {
        console.warn(`[useQuestNotifications] Failed to load ${key} from localStorage:`, e);
    }
    return new Set();
}

// Save seen IDs to localStorage
function saveSeenIds(key: string, ids: Set<string>): void {
    try {
        // Limit to last 200 entries to prevent localStorage bloat
        const idsArray = [...ids];
        const limitedArray = idsArray.slice(-200);
        localStorage.setItem(key, JSON.stringify(limitedArray));
    } catch (e) {
        console.warn(`[useQuestNotifications] Failed to save ${key} to localStorage:`, e);
    }
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
    
    // State for tracking seen notifications - persisted to localStorage to survive page refreshes
    const [seenSovaQuestMessageIds, setSeenSovaQuestMessageIds] = useState<Set<string>>(() => loadSeenIds(SEEN_SOVA_MESSAGES_KEY));
    const [seenQuestCompletionIds, setSeenQuestCompletionIds] = useState<Set<string>>(() => loadSeenIds(SEEN_QUEST_COMPLETIONS_KEY));
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
    // Now filters by session timestamp to prevent replay after cache clear
    // Processes messages SEQUENTIALLY to avoid AbortError (play interrupted by pause)
    // when quest_complete + quest_start arrive in same batch
    // ========================================================================
    const sovaAudioQueueRef = useRef<boolean>(false);
    
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
        
        // Mark all as seen immediately (we'll process them)
        setSeenSovaQuestMessageIds(prev => {
            const newSet = new Set(prev);
            newMessages.forEach(({ id }) => newSet.add(id));
            saveSeenIds(SEEN_SOVA_MESSAGES_KEY, newSet);
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
                
                try {
                    const audio = new Audio(`/sounds/${message.audioFile}`);
                    audio.volume = 0.8;
                    audio.preload = 'auto';
                    
                    const label = SOVA_LABEL_MAP[message.messageType] || 'SOVA: Quest Update';
                    
                    const onEndedOrError = () => {
                        audio.removeEventListener('ended', onEndedOrError);
                        audio.removeEventListener('error', onEndedOrError);
                        processNext(index + 1);
                    };
                    
                    audio.addEventListener('ended', onEndedOrError);
                    audio.addEventListener('error', onEndedOrError);
                    
                    sovaAudioQueueRef.current = true;
                    
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
                } catch (err) {
                    console.warn('[QuestNotifications] Error creating SOVA quest audio:', err);
                    processNext(index + 1);
                }
            };
            
            // Only wait if a PREVIOUS batch is still playing (index 0 = starting new batch)
            if (index === 0 && sovaAudioQueueRef.current) {
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
            
            // Mark as seen and persist to localStorage
            setSeenQuestCompletionIds(prev => {
                const newSet = new Set(prev).add(id);
                saveSeenIds(SEEN_QUEST_COMPLETIONS_KEY, newSet);
                return newSet;
            });
            
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
            
            // Queue mission complete sound - the queue manager handles:
            // - Not playing over other SOVA sounds (tutorials, cairn lore, intro)
            // - Not playing over other notification sounds (level ups, achievements)
            // - Playing SFX with debounce
            queueNotificationSound('mission_complete');
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
