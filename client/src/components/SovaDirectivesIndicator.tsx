import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
    TutorialQuestDefinition, 
    DailyQuestDefinition,
    PlayerTutorialProgress, 
    PlayerDailyQuest,
    QuestStatus 
} from '../generated';
import { Identity } from 'spacetimedb';

// Style constants - Cyberpunk theme
const UI_BG_COLOR = 'linear-gradient(135deg, rgba(10, 5, 20, 0.95), rgba(15, 8, 30, 0.98))';
const UI_BORDER_COLOR = '#00aaff';
const UI_SHADOW = '0 0 25px rgba(0, 170, 255, 0.4), inset 0 0 15px rgba(0, 170, 255, 0.15)';
const UI_FONT_FAMILY = '"Press Start 2P", cursive';
const SOVA_PURPLE = '#c084fc';
const SOVA_CYAN = '#00ffff';
const GLOW_CYAN = '0 0 12px rgba(0, 255, 255, 0.6)';

interface SovaDirectivesIndicatorProps {
    // Quest definitions
    tutorialQuestDefinitions: Map<string, TutorialQuestDefinition>;
    dailyQuestDefinitions: Map<string, DailyQuestDefinition>;
    // Player progress
    playerTutorialProgress: Map<string, PlayerTutorialProgress>;
    playerDailyQuests: Map<string, PlayerDailyQuest>;
    // Player identity for filtering
    localPlayerId: Identity | undefined;
    // Panel toggle callback
    onOpenQuestsPanel: () => void;
    // Whether there are new/unread notifications
    hasNewNotification?: boolean;
    isMobile?: boolean;
}

const SovaDirectivesIndicator: React.FC<SovaDirectivesIndicatorProps> = ({
    tutorialQuestDefinitions,
    dailyQuestDefinitions,
    playerTutorialProgress,
    playerDailyQuests,
    localPlayerId,
    onOpenQuestsPanel,
    hasNewNotification = false,
    isMobile = false,
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const [pulseAnimation, setPulseAnimation] = useState(false);

    // Pulse animation when there's a new notification
    useEffect(() => {
        if (hasNewNotification) {
            setPulseAnimation(true);
            const timer = setTimeout(() => setPulseAnimation(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [hasNewNotification]);

    // Get current tutorial quest
    const currentTutorialQuest = useMemo(() => {
        if (!localPlayerId) return null;
        const progress = playerTutorialProgress.get(localPlayerId.toHexString());
        if (!progress || progress.tutorialCompleted) return null;
        
        // Find the quest with the matching order index
        const quests = Array.from(tutorialQuestDefinitions.values())
            .sort((a, b) => a.orderIndex - b.orderIndex);
        
        return quests[progress.currentQuestIndex] || null;
    }, [localPlayerId, playerTutorialProgress, tutorialQuestDefinitions]);

    // Get current tutorial progress
    const currentTutorialProgress = useMemo(() => {
        if (!localPlayerId) return null;
        return playerTutorialProgress.get(localPlayerId.toHexString()) || null;
    }, [localPlayerId, playerTutorialProgress]);

    // Calculate active daily quest count
    const activeDailyQuestInfo = useMemo(() => {
        if (!localPlayerId) return { active: 0, completed: 0, total: 5 };
        
        const playerQuests = Array.from(playerDailyQuests.values())
            .filter(q => q.playerId.toHexString() === localPlayerId.toHexString());
        
        const active = playerQuests.filter(q => q.status.tag === 'InProgress' || q.status.tag === 'Available').length;
        const completed = playerQuests.filter(q => q.status.tag === 'Completed').length;
        
        return { active, completed, total: 5 };
    }, [localPlayerId, playerDailyQuests]);

    // Determine if there's an active quest (tutorial or daily)
    const hasActiveQuest = currentTutorialQuest !== null || activeDailyQuestInfo.active > 0;
    
    // Check if tutorial is complete
    const tutorialComplete = currentTutorialProgress?.tutorialCompleted ?? false;

    const handleClick = useCallback(() => {
        onOpenQuestsPanel();
    }, [onOpenQuestsPanel]);

    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        top: isMobile ? '120px' : '165px', // Position below DayNightCycleTracker with clear spacing
        right: isMobile ? '10px' : '15px',
        zIndex: 1000,
        background: UI_BG_COLOR,
        border: `2px solid ${hasNewNotification || pulseAnimation ? SOVA_PURPLE : UI_BORDER_COLOR}`,
        borderRadius: '10px',
        boxShadow: pulseAnimation 
            ? `0 0 35px rgba(192, 132, 252, 0.6), inset 0 0 18px rgba(192, 132, 252, 0.2)` 
            : UI_SHADOW,
        padding: isMobile ? '12px 16px' : '14px 20px',
        fontFamily: UI_FONT_FAMILY,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: isHovered ? 'scale(1.03)' : 'scale(1)',
        animation: pulseAnimation ? 'sovaPulse 1s ease-in-out infinite' : 'none',
        minWidth: isMobile ? '170px' : '200px',
    };

    const titleStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: SOVA_CYAN,
        fontSize: isMobile ? '11px' : '13px',
        fontWeight: 'bold',
        marginBottom: '8px',
        textShadow: GLOW_CYAN,
    };

    const statusStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: '#e0e0e0',
        fontSize: isMobile ? '10px' : '12px',
    };

    const dotStyle = (active: boolean): React.CSSProperties => ({
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: active ? '#4ade80' : '#6b7280',
        boxShadow: active ? '0 0 10px rgba(74, 222, 128, 0.7)' : 'none',
        flexShrink: 0,
    });

    const notificationDotStyle: React.CSSProperties = {
        position: 'absolute' as const,
        top: '-5px',
        right: '-5px',
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        backgroundColor: '#f43f5e',
        boxShadow: '0 0 12px rgba(244, 63, 94, 0.7)',
        animation: 'notificationPulse 1.5s ease-in-out infinite',
        border: '2px solid rgba(10, 5, 20, 0.9)',
    };

    // Get progress display for current tutorial quest
    const tutorialProgressText = useMemo(() => {
        if (!currentTutorialQuest || !currentTutorialProgress) return null;
        const progress = currentTutorialProgress.currentQuestProgress;
        const target = currentTutorialQuest.targetAmount;
        return `${progress}/${target}`;
    }, [currentTutorialQuest, currentTutorialProgress]);

    return (
        <>
            {/* CSS Animation Keyframes */}
            <style>
                {`
                    @keyframes sovaPulse {
                        0% { box-shadow: 0 0 20px rgba(192, 132, 252, 0.4); }
                        50% { box-shadow: 0 0 40px rgba(192, 132, 252, 0.8); }
                        100% { box-shadow: 0 0 20px rgba(192, 132, 252, 0.4); }
                    }
                    @keyframes notificationPulse {
                        0% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(1.2); opacity: 0.8; }
                        100% { transform: scale(1); opacity: 1; }
                    }
                `}
            </style>
            <div
                style={containerStyle}
                onClick={handleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Notification dot */}
                {hasNewNotification && <div style={notificationDotStyle} />}
                
                {/* Title */}
                <div style={titleStyle}>
                    <span style={{ fontSize: isMobile ? '14px' : '16px' }}>📡</span>
                    <span>DIRECTIVES</span>
                    <span style={{ 
                        color: SOVA_PURPLE, 
                        fontSize: isMobile ? '9px' : '11px',
                        padding: '3px 6px',
                        background: 'rgba(192, 132, 252, 0.15)',
                        borderRadius: '4px',
                        border: '1px solid rgba(192, 132, 252, 0.3)',
                    }}>
                        [J]
                    </span>
                </div>
                
                {/* Status line */}
                <div style={statusStyle}>
                    {/* Tutorial progress */}
                    {!tutorialComplete && currentTutorialQuest && (
                        <>
                            <span style={dotStyle(true)} />
                            <span style={{ color: SOVA_PURPLE }}>
                                Mission: {tutorialProgressText}
                            </span>
                        </>
                    )}
                    
                    {/* Show completed status once tutorial is done */}
                    {tutorialComplete && (
                        <>
                            <span style={dotStyle(false)} />
                            <span style={{ color: '#6b7280' }}>
                                Calibration Complete
                            </span>
                        </>
                    )}
                    
                    {/* Separator */}
                    {!tutorialComplete && currentTutorialQuest && activeDailyQuestInfo.active > 0 && (
                        <span style={{ color: '#4b5563', margin: '0 4px' }}>•</span>
                    )}
                    
                    {/* Daily quests */}
                    {activeDailyQuestInfo.active > 0 && (
                        <>
                            <span style={dotStyle(true)} />
                            <span>
                                Daily: {activeDailyQuestInfo.completed}/{activeDailyQuestInfo.total}
                            </span>
                        </>
                    )}
                    
                    {/* No active quests fallback */}
                    {!hasActiveQuest && tutorialComplete && activeDailyQuestInfo.active === 0 && (
                        <span style={{ color: '#6b7280', fontStyle: 'italic' }}>
                            All clear, Agent
                        </span>
                    )}
                </div>
            </div>
        </>
    );
};

export default SovaDirectivesIndicator;
