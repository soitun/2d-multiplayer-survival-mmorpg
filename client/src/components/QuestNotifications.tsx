/**
 * QuestNotifications.tsx
 * 
 * Handles quest-related notifications:
 * - Quest completion celebration popup
 * - Quest progress milestone toasts
 * - Renders at a fixed position on screen
 */

import React, { useState, useEffect, useCallback } from 'react';

// Style constants (matching other UI components)
const UI_BG_COLOR = 'linear-gradient(135deg, rgba(20, 10, 35, 0.98), rgba(15, 8, 30, 0.99))';
const UI_BORDER_COLOR = '#00aaff';
const UI_FONT_FAMILY = '"Press Start 2P", cursive';
const SOVA_PURPLE = '#c084fc';
const SOVA_CYAN = '#00aaff';
const SUCCESS_GREEN = '#4ade80';

// ============================================================================
// QUEST COMPLETION NOTIFICATION (Celebration popup)
// ============================================================================

export interface QuestCompletionData {
    id: string;
    questName: string;
    questType: 'tutorial' | 'daily';
    xpAwarded: number;
    shardsAwarded: number;
    unlockedRecipe?: string;
}

interface QuestCompletionNotificationProps {
    notification: QuestCompletionData | null;
    onDismiss: () => void;
}

export const QuestCompletionNotification: React.FC<QuestCompletionNotificationProps> = ({
    notification,
    onDismiss,
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isAnimatingOut, setIsAnimatingOut] = useState(false);

    useEffect(() => {
        if (notification) {
            setIsVisible(true);
            setIsAnimatingOut(false);
            
            // Auto-dismiss after 6 seconds
            const timer = setTimeout(() => {
                setIsAnimatingOut(true);
                setTimeout(() => {
                    setIsVisible(false);
                    onDismiss();
                }, 500);
            }, 6000);
            
            return () => clearTimeout(timer);
        }
    }, [notification, onDismiss]);

    if (!notification || !isVisible) return null;

    const isTutorial = notification.questType === 'tutorial';

    return (
        <>
            <style>
                {`
                    @keyframes questCompletePulse {
                        0% { box-shadow: 0 0 30px rgba(74, 222, 128, 0.4); }
                        50% { box-shadow: 0 0 60px rgba(74, 222, 128, 0.8); }
                        100% { box-shadow: 0 0 30px rgba(74, 222, 128, 0.4); }
                    }
                    @keyframes questSlideIn {
                        from { transform: translateY(-100%) scale(0.8); opacity: 0; }
                        to { transform: translateY(0) scale(1); opacity: 1; }
                    }
                    @keyframes questSlideOut {
                        from { transform: translateY(0) scale(1); opacity: 1; }
                        to { transform: translateY(-100%) scale(0.8); opacity: 0; }
                    }
                    @keyframes rewardPop {
                        0% { transform: scale(1); }
                        50% { transform: scale(1.2); }
                        100% { transform: scale(1); }
                    }
                `}
            </style>
            <div
                style={{
                    position: 'fixed',
                    top: '100px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 3000,
                    background: UI_BG_COLOR,
                    border: `3px solid ${SUCCESS_GREEN}`,
                    borderRadius: '12px',
                    padding: '20px 30px',
                    fontFamily: UI_FONT_FAMILY,
                    minWidth: '350px',
                    maxWidth: '450px',
                    textAlign: 'center',
                    animation: isAnimatingOut 
                        ? 'questSlideOut 0.5s ease-out forwards'
                        : 'questSlideIn 0.5s ease-out, questCompletePulse 2s ease-in-out infinite',
                    cursor: 'pointer',
                }}
                onClick={() => {
                    setIsAnimatingOut(true);
                    setTimeout(() => {
                        setIsVisible(false);
                        onDismiss();
                    }, 500);
                }}
            >
                {/* Header */}
                <div style={{
                    color: SUCCESS_GREEN,
                    fontSize: '12px',
                    fontWeight: 'bold',
                    marginBottom: '8px',
                    textShadow: '0 0 15px rgba(74, 222, 128, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                }}>
                    <span style={{ fontSize: '18px' }}>✓</span>
                    <span>{isTutorial ? 'MISSION COMPLETE' : 'DAILY QUEST COMPLETE'}</span>
                    <span style={{ fontSize: '18px' }}>✓</span>
                </div>

                {/* Quest Name */}
                <div style={{
                    color: '#ffffff',
                    fontSize: '11px',
                    marginBottom: '16px',
                    textShadow: '0 0 10px rgba(255, 255, 255, 0.3)',
                }}>
                    {notification.questName}
                </div>

                {/* Rewards */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '24px',
                    marginBottom: notification.unlockedRecipe ? '12px' : '0',
                }}>
                    {notification.xpAwarded > 0 && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            animation: 'rewardPop 0.5s ease-out 0.3s',
                        }}>
                            <span style={{ fontSize: '20px' }}>⚡</span>
                            <span style={{ color: SOVA_CYAN, fontSize: '10px' }}>
                                +{notification.xpAwarded} XP
                            </span>
                        </div>
                    )}
                    {notification.shardsAwarded > 0 && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            animation: 'rewardPop 0.5s ease-out 0.5s',
                        }}>
                            <span style={{ fontSize: '20px' }}>💎</span>
                            <span style={{ color: SOVA_PURPLE, fontSize: '10px' }}>
                                +{notification.shardsAwarded} Shards
                            </span>
                        </div>
                    )}
                </div>

                {/* Unlocked Recipe */}
                {notification.unlockedRecipe && (
                    <div style={{
                        background: 'rgba(192, 132, 252, 0.15)',
                        border: `1px solid ${SOVA_PURPLE}`,
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: SOVA_PURPLE,
                        fontSize: '8px',
                        animation: 'rewardPop 0.5s ease-out 0.7s',
                    }}>
                        🔓 UNLOCKED: {notification.unlockedRecipe}
                    </div>
                )}

                {/* Click hint */}
                <div style={{
                    color: '#6b7280',
                    fontSize: '6px',
                    marginTop: '12px',
                }}>
                    Click to dismiss
                </div>
            </div>
        </>
    );
};

// ============================================================================
// QUEST PROGRESS TOAST (Milestone notification)
// ============================================================================

export interface QuestProgressData {
    id: string;
    questName: string;
    currentProgress: number;
    targetAmount: number;
    milestonePercent: number;
}

interface QuestProgressToastProps {
    notification: QuestProgressData | null;
    onDismiss: () => void;
}

export const QuestProgressToast: React.FC<QuestProgressToastProps> = ({
    notification,
    onDismiss,
}) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (notification) {
            setIsVisible(true);
            
            // Auto-dismiss after 3 seconds
            const timer = setTimeout(() => {
                setIsVisible(false);
                onDismiss();
            }, 3000);
            
            return () => clearTimeout(timer);
        }
    }, [notification, onDismiss]);

    if (!notification || !isVisible) return null;

    return (
        <>
            <style>
                {`
                    @keyframes toastSlideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `}
            </style>
            <div
                style={{
                    position: 'fixed',
                    bottom: '120px',
                    right: '20px',
                    zIndex: 2500,
                    background: UI_BG_COLOR,
                    border: `2px solid ${SOVA_CYAN}`,
                    borderRadius: '8px',
                    padding: '12px 16px',
                    fontFamily: UI_FONT_FAMILY,
                    minWidth: '200px',
                    animation: 'toastSlideIn 0.3s ease-out',
                }}
            >
                {/* Header */}
                <div style={{
                    color: SOVA_CYAN,
                    fontSize: '8px',
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                }}>
                    <span>📊</span>
                    <span>Quest Progress</span>
                </div>

                {/* Quest Name */}
                <div style={{
                    color: '#e0e0e0',
                    fontSize: '7px',
                    marginBottom: '8px',
                }}>
                    {notification.questName}
                </div>

                {/* Progress bar */}
                <div style={{
                    width: '100%',
                    height: '6px',
                    backgroundColor: 'rgba(55, 65, 81, 0.5)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    marginBottom: '4px',
                }}>
                    <div style={{
                        width: `${notification.milestonePercent}%`,
                        height: '100%',
                        backgroundColor: SOVA_CYAN,
                        borderRadius: '3px',
                        boxShadow: `0 0 8px ${SOVA_CYAN}`,
                    }} />
                </div>

                {/* Progress text */}
                <div style={{
                    color: '#9ca3af',
                    fontSize: '6px',
                    textAlign: 'right',
                }}>
                    {notification.currentProgress} / {notification.targetAmount} ({notification.milestonePercent}%)
                </div>
            </div>
        </>
    );
};

export default QuestCompletionNotification;
