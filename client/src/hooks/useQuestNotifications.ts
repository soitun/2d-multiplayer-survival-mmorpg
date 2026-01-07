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

import { useEffect, useState, useCallback, MutableRefObject } from 'react';
import { Identity } from 'spacetimedb';
import { QuestCompletionData } from '../components/QuestNotifications';

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
    
    // State for tracking seen notifications (to avoid re-processing)
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
    // ========================================================================
    useEffect(() => {
        if (!sovaQuestMessages || sovaQuestMessages.size === 0) return;
        if (!sovaMessageAdderRef.current) return;
        
        sovaQuestMessages.forEach((message, id) => {
            if (seenSovaQuestMessageIds.has(id)) return;
            
            // Mark as seen
            setSeenSovaQuestMessageIds(prev => new Set(prev).add(id));
            
            console.log('[QuestNotifications] 📡 New SOVA quest message:', message.message);
            
            // Play audio if provided
            if (message.audioFile) {
                try {
                    const audio = new Audio(`/sounds/${message.audioFile}`);
                    audio.volume = 0.8;
                    audio.play().then(() => {
                        if (showSovaSoundBoxRef.current) {
                            const label = SOVA_LABEL_MAP[message.messageType] || 'SOVA: Quest Update';
                            showSovaSoundBoxRef.current(audio, label);
                        }
                    }).catch(err => {
                        console.warn('[QuestNotifications] Failed to play SOVA quest audio:', err);
                    });
                } catch (err) {
                    console.warn('[QuestNotifications] Error creating SOVA quest audio:', err);
                }
            }
            
            // Send message to SOVA chat
            if (sovaMessageAdderRef.current) {
                sovaMessageAdderRef.current({
                    id: `sova-quest-${id}-${Date.now()}`,
                    text: message.message,
                    isUser: false,
                    timestamp: new Date(Number(message.sentAt?.microsSinceUnixEpoch || 0) / 1000),
                    flashTab: true,
                });
            }
            
            // Trigger notification indicator
            setHasNewQuestNotification(true);
            setTimeout(() => setHasNewQuestNotification(false), 5000);
        });
    }, [sovaQuestMessages, seenSovaQuestMessageIds, showSovaSoundBoxRef, sovaMessageAdderRef]);

    // ========================================================================
    // Handle Quest Completion Notifications - show celebration UI
    // ========================================================================
    useEffect(() => {
        // IMPORTANT: Don't process notifications until playerIdentity is available
        // Otherwise notifications get marked as "seen" before we can verify they're for this player
        if (!playerIdentity) return;
        if (!questCompletionNotifications || questCompletionNotifications.size === 0) return;
        
        questCompletionNotifications.forEach((notification, id) => {
            if (seenQuestCompletionIds.has(id)) return;
            
            // Only show if it's for the local player
            if (notification.playerId?.toHexString() !== playerIdentity.toHexString()) return;
            
            // Mark as seen
            setSeenQuestCompletionIds(prev => new Set(prev).add(id));
            
            console.log('[QuestNotifications] 🎉 Quest completion:', notification.questName);
            
            // Show celebration UI
            setQuestCompletionNotification({
                id: id,
                questName: notification.questName,
                questType: notification.questType === 'tutorial' ? 'tutorial' : 'daily',
                xpAwarded: Number(notification.xpAwarded || 0),
                shardsAwarded: Number(notification.shardsAwarded || 0),
                unlockedRecipe: notification.unlockedRecipe || undefined,
            });
            
            // Play SOVA mission complete voice line + progress unlocked SFX
            try {
                const sovaAudio = new Audio('/sounds/sova_mission_complete.mp3');
                sovaAudio.volume = 0.8;
                sovaAudio.play().catch(() => {});
                
                // Play progress_unlocked.mp3 with debounce (only once if multiple notifications)
                const now = Date.now();
                const lastPlayed = (window as any).__progressUnlockedLastPlayed || 0;
                if (now - lastPlayed > 500) { // 500ms debounce
                    (window as any).__progressUnlockedLastPlayed = now;
                    const sfxAudio = new Audio('/sounds/progress_unlocked.mp3');
                    sfxAudio.volume = 0.5;
                    sfxAudio.play().catch(() => {});
                }
            } catch (err) {
                // Ignore audio errors
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
