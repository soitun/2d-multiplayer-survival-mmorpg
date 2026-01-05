import React, { useMemo, useCallback } from 'react';
import { 
    TutorialQuestDefinition, 
    DailyQuestDefinition,
    PlayerTutorialProgress, 
    PlayerDailyQuest,
    QuestStatus 
} from '../generated';
import { Identity } from 'spacetimedb';

// Style constants
const UI_BG_COLOR = 'linear-gradient(135deg, rgba(20, 10, 35, 0.98), rgba(15, 8, 30, 0.99))';
const UI_BORDER_COLOR = '#00aaff';
const UI_SHADOW = '0 0 40px rgba(0, 170, 255, 0.3), inset 0 0 20px rgba(0, 170, 255, 0.1)';
const UI_FONT_FAMILY = '"Press Start 2P", cursive';
const SOVA_PURPLE = '#c084fc';
const SOVA_CYAN = '#00aaff';

interface QuestsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    // Quest definitions
    tutorialQuestDefinitions: Map<string, TutorialQuestDefinition>;
    dailyQuestDefinitions: Map<string, DailyQuestDefinition>;
    // Player progress
    playerTutorialProgress: Map<string, PlayerTutorialProgress>;
    playerDailyQuests: Map<string, PlayerDailyQuest>;
    // Player identity for filtering
    localPlayerId: Identity | undefined;
    isMobile?: boolean;
}

const QuestsPanel: React.FC<QuestsPanelProps> = ({
    isOpen,
    onClose,
    tutorialQuestDefinitions,
    dailyQuestDefinitions,
    playerTutorialProgress,
    playerDailyQuests,
    localPlayerId,
    isMobile = false,
}) => {
    // Get tutorial progress
    const tutorialProgress = useMemo(() => {
        if (!localPlayerId) return null;
        return playerTutorialProgress.get(localPlayerId.toHexString()) || null;
    }, [localPlayerId, playerTutorialProgress]);

    // Get sorted tutorial quests
    const sortedTutorialQuests = useMemo(() => {
        return Array.from(tutorialQuestDefinitions.values())
            .sort((a, b) => a.orderIndex - b.orderIndex);
    }, [tutorialQuestDefinitions]);

    // Get current tutorial quest
    const currentTutorialQuest = useMemo(() => {
        if (!tutorialProgress || tutorialProgress.tutorialCompleted) return null;
        return sortedTutorialQuests[tutorialProgress.currentQuestIndex] || null;
    }, [tutorialProgress, sortedTutorialQuests]);

    // Get player's daily quests
    const playerDailyQuestsList = useMemo(() => {
        if (!localPlayerId) return [];
        return Array.from(playerDailyQuests.values())
            .filter(q => q.playerId.toHexString() === localPlayerId.toHexString());
    }, [localPlayerId, playerDailyQuests]);

    // Get daily quest definitions for player's assigned quests
    const dailyQuestsWithDefs = useMemo(() => {
        return playerDailyQuestsList.map(quest => ({
            quest,
            definition: dailyQuestDefinitions.get(quest.questDefId),
        })).filter(item => item.definition !== undefined);
    }, [playerDailyQuestsList, dailyQuestDefinitions]);

    // Handle escape key to close
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const overlayStyle: React.CSSProperties = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 2000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backdropFilter: 'blur(4px)',
    };

    const panelStyle: React.CSSProperties = {
        width: isMobile ? '95%' : '600px',
        maxWidth: '95vw',
        maxHeight: '80vh',
        background: UI_BG_COLOR,
        border: `3px solid ${UI_BORDER_COLOR}`,
        borderRadius: '12px',
        boxShadow: UI_SHADOW,
        fontFamily: UI_FONT_FAMILY,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
    };

    const headerStyle: React.CSSProperties = {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: `2px solid ${UI_BORDER_COLOR}`,
        background: 'linear-gradient(90deg, rgba(0, 170, 255, 0.1), rgba(192, 132, 252, 0.1))',
    };

    const titleStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        color: SOVA_CYAN,
        fontSize: '16px', // Increased from 14px
        fontWeight: 'bold',
        textShadow: '0 0 15px rgba(0, 170, 255, 0.5)',
    };

    const closeButtonStyle: React.CSSProperties = {
        background: 'transparent',
        border: `1px solid ${SOVA_PURPLE}`,
        borderRadius: '4px',
        color: SOVA_PURPLE,
        fontSize: '12px', // Increased from 10px
        padding: '8px 14px',
        cursor: 'pointer',
        fontFamily: UI_FONT_FAMILY,
        transition: 'all 0.2s ease',
    };

    const contentStyle: React.CSSProperties = {
        padding: '20px',
        overflowY: 'auto',
        flex: 1,
    };

    const sectionStyle: React.CSSProperties = {
        marginBottom: '24px',
    };

    const sectionTitleStyle: React.CSSProperties = {
        color: SOVA_PURPLE,
        fontSize: '14px', // Increased from 11px
        fontWeight: 'bold',
        marginBottom: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        textTransform: 'uppercase',
        letterSpacing: '1px',
    };

    const questCardStyle = (isActive: boolean, isCompleted: boolean): React.CSSProperties => ({
        background: isActive 
            ? 'linear-gradient(135deg, rgba(192, 132, 252, 0.15), rgba(0, 170, 255, 0.1))'
            : isCompleted 
                ? 'linear-gradient(135deg, rgba(74, 222, 128, 0.1), rgba(34, 197, 94, 0.05))'
                : 'rgba(30, 30, 50, 0.5)',
        border: `1px solid ${isActive ? SOVA_PURPLE : isCompleted ? '#4ade80' : '#374151'}`,
        borderRadius: '8px',
        padding: '12px 16px',
        marginBottom: '8px',
        transition: 'all 0.2s ease',
    });

    const questTitleStyle: React.CSSProperties = {
        color: '#e0e0e0',
        fontSize: '12px', // Increased from 9px
        fontWeight: 'bold',
        marginBottom: '8px',
    };

    const questDescriptionStyle: React.CSSProperties = {
        color: '#9ca3af',
        fontSize: '10px', // Increased from 7px
        marginBottom: '10px',
        lineHeight: 1.5,
    };

    const progressBarContainerStyle: React.CSSProperties = {
        width: '100%',
        height: '10px', // Increased from 8px
        backgroundColor: 'rgba(55, 65, 81, 0.5)',
        borderRadius: '5px',
        overflow: 'hidden',
        marginBottom: '8px',
    };

    const progressBarFillStyle = (progress: number, isCompleted: boolean): React.CSSProperties => ({
        width: `${Math.min(progress, 100)}%`,
        height: '100%',
        backgroundColor: isCompleted ? '#4ade80' : SOVA_CYAN,
        borderRadius: '5px',
        transition: 'width 0.3s ease',
        boxShadow: `0 0 10px ${isCompleted ? 'rgba(74, 222, 128, 0.5)' : 'rgba(0, 170, 255, 0.5)'}`,
    });

    const rewardStyle: React.CSSProperties = {
        display: 'flex',
        gap: '16px',
        fontSize: '10px', // Increased from 7px
        color: '#9ca3af',
    };

    const rewardItemStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
    };

    const getStatusText = (status: QuestStatus): string => {
        switch (status.tag) {
            case 'Locked': return '🔒 Locked';
            case 'Available': return '⭐ Available';
            case 'InProgress': return '▶ In Progress';
            case 'Completed': return '✓ Completed';
            case 'Expired': return '⏰ Expired';
            default: return 'Unknown';
        }
    };

    const getStatusColor = (status: QuestStatus): string => {
        switch (status.tag) {
            case 'Locked': return '#6b7280';
            case 'Available': return '#fbbf24';
            case 'InProgress': return SOVA_CYAN;
            case 'Completed': return '#4ade80';
            case 'Expired': return '#f87171';
            default: return '#9ca3af';
        }
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={headerStyle}>
                    <div style={titleStyle}>
                        <span style={{ fontSize: '20px' }}>📡</span>
                        <span>SOVA DIRECTIVES</span>
                    </div>
                    <button 
                        style={closeButtonStyle}
                        onClick={onClose}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = SOVA_PURPLE;
                            e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = SOVA_PURPLE;
                        }}
                    >
                        CLOSE [ESC]
                    </button>
                </div>

                {/* Content */}
                <div style={contentStyle}>
                    {/* Current Mission (Tutorial) */}
                    <div style={sectionStyle}>
                        <div style={sectionTitleStyle}>
                            <span>🎯</span>
                            <span>Primary Mission</span>
                            {tutorialProgress?.tutorialCompleted && (
                                <span style={{ color: '#4ade80', fontSize: '11px' }}>✓ COMPLETE</span>
                            )}
                        </div>

                        {currentTutorialQuest ? (
                            <div style={questCardStyle(true, false)}>
                                <div style={questTitleStyle}>
                                    {currentTutorialQuest.name}
                                </div>
                                <div style={questDescriptionStyle}>
                                    {currentTutorialQuest.description}
                                </div>
                                <div style={progressBarContainerStyle}>
                                    <div style={progressBarFillStyle(
                                        (tutorialProgress?.currentQuestProgress || 0) / currentTutorialQuest.targetAmount * 100,
                                        false
                                    )} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: SOVA_CYAN, fontSize: '11px' }}>
                                        Progress: {tutorialProgress?.currentQuestProgress || 0} / {currentTutorialQuest.targetAmount}
                                    </span>
                                    <div style={rewardStyle}>
                                        <span style={rewardItemStyle}>
                                            <span>⚡</span>
                                            <span>{currentTutorialQuest.xpReward.toString()} XP</span>
                                        </span>
                                        <span style={rewardItemStyle}>
                                            <span>💎</span>
                                            <span>{currentTutorialQuest.shardReward.toString()} Shards</span>
                                        </span>
                                    </div>
                                </div>
                                {currentTutorialQuest.sovaStartMessage && (
                                    <div style={{ 
                                        marginTop: '12px', 
                                        padding: '10px 14px', 
                                        background: 'rgba(192, 132, 252, 0.1)', 
                                        borderRadius: '6px',
                                        borderLeft: `3px solid ${SOVA_PURPLE}`,
                                    }}>
                                        <span style={{ color: SOVA_PURPLE, fontSize: '9px', display: 'block', marginBottom: '6px' }}>
                                            SOVA:
                                        </span>
                                        <span style={{ color: '#d1d5db', fontSize: '10px', fontStyle: 'italic', lineHeight: 1.5 }}>
                                            "{currentTutorialQuest.sovaStartMessage}"
                                        </span>
                                    </div>
                                )}
                            </div>
                        ) : tutorialProgress?.tutorialCompleted ? (
                            <div style={{ 
                                color: '#9ca3af', 
                                fontSize: '11px', 
                                fontStyle: 'italic',
                                padding: '14px',
                                background: 'rgba(74, 222, 128, 0.05)',
                                borderRadius: '8px',
                                border: '1px solid rgba(74, 222, 128, 0.2)',
                                lineHeight: 1.5,
                            }}>
                                Calibration protocol complete. You've proven yourself capable, Agent. 
                                Continue with daily training to maintain peak performance.
                            </div>
                        ) : (
                            <div style={{ color: '#6b7280', fontSize: '13px', fontStyle: 'italic' }}>
                                No active mission. Initializing directive uplink...
                            </div>
                        )}
                    </div>

                    {/* Daily Training */}
                    <div style={sectionStyle}>
                        <div style={sectionTitleStyle}>
                            <span>📋</span>
                            <span>Daily Training</span>
                            <span style={{ color: '#6b7280', fontSize: '13px', fontWeight: 'normal' }}>
                                ({dailyQuestsWithDefs.filter(d => d.quest.status.tag === 'Completed').length}/{dailyQuestsWithDefs.length})
                            </span>
                        </div>

                        {dailyQuestsWithDefs.length > 0 ? (
                            dailyQuestsWithDefs.map(({ quest, definition }) => {
                                const isCompleted = quest.status.tag === 'Completed';
                                const progressPercent = (quest.currentProgress / quest.targetAmount) * 100;
                                
                                return (
                                    <div key={quest.id.toString()} style={questCardStyle(false, isCompleted)}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={questTitleStyle}>
                                                {definition?.name || 'Unknown Quest'}
                                            </div>
                                            <span style={{ 
                                                color: getStatusColor(quest.status), 
                                                fontSize: '9px',
                                                padding: '4px 8px',
                                                background: 'rgba(0,0,0,0.3)',
                                                borderRadius: '4px',
                                            }}>
                                                {getStatusText(quest.status)}
                                            </span>
                                        </div>
                                        <div style={questDescriptionStyle}>
                                            {definition?.description || 'Complete this training objective.'}
                                        </div>
                                        <div style={progressBarContainerStyle}>
                                            <div style={progressBarFillStyle(progressPercent, isCompleted)} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ color: isCompleted ? '#4ade80' : '#9ca3af', fontSize: '10px' }}>
                                                {quest.currentProgress} / {quest.targetAmount}
                                            </span>
                                            <div style={rewardStyle}>
                                                <span style={rewardItemStyle}>
                                                    <span>⚡</span>
                                                    <span>{quest.xpReward.toString()} XP</span>
                                                </span>
                                                <span style={rewardItemStyle}>
                                                    <span>💎</span>
                                                    <span>{quest.shardReward.toString()} Shards</span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div style={{ 
                                color: '#6b7280', 
                                fontSize: '11px', 
                                fontStyle: 'italic',
                                padding: '14px',
                                background: 'rgba(55, 65, 81, 0.2)',
                                borderRadius: '8px',
                                lineHeight: 1.5,
                            }}>
                                Daily training assignments not yet initialized. Check back soon.
                            </div>
                        )}
                    </div>

                    {/* Tutorial Progress Overview */}
                    {tutorialProgress && !tutorialProgress.tutorialCompleted && (
                        <div style={sectionStyle}>
                            <div style={sectionTitleStyle}>
                                <span>📊</span>
                                <span>Calibration Progress</span>
                            </div>
                            <div style={{ 
                                display: 'flex', 
                                flexWrap: 'wrap', 
                                gap: '4px',
                                padding: '8px',
                                background: 'rgba(30, 30, 50, 0.3)',
                                borderRadius: '6px',
                            }}>
                                {sortedTutorialQuests.map((quest, index) => {
                                    const isCompleted = index < (tutorialProgress?.currentQuestIndex || 0);
                                    const isCurrent = index === tutorialProgress?.currentQuestIndex;
                                    return (
                                        <div
                                            key={quest.id}
                                            title={quest.name}
                                            style={{
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '4px',
                                                backgroundColor: isCompleted ? '#4ade80' : isCurrent ? SOVA_PURPLE : '#374151',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '10px',
                                                color: isCompleted || isCurrent ? '#fff' : '#6b7280',
                                                border: isCurrent ? `2px solid ${SOVA_CYAN}` : 'none',
                                                boxShadow: isCurrent ? `0 0 10px ${SOVA_CYAN}` : 'none',
                                            }}
                                        >
                                            {isCompleted ? '✓' : index + 1}
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ color: '#6b7280', fontSize: '10px', marginTop: '12px', textAlign: 'center' }}>
                                Mission {(tutorialProgress?.currentQuestIndex || 0) + 1} of {sortedTutorialQuests.length}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div style={{
                    padding: '14px 20px',
                    borderTop: `1px solid ${UI_BORDER_COLOR}`,
                    color: '#6b7280',
                    fontSize: '12px',
                    textAlign: 'center',
                    background: 'rgba(0, 0, 0, 0.2)',
                }}>
                    Press <span style={{ color: SOVA_CYAN }}>J</span> to toggle this panel • 
                    Press <span style={{ color: SOVA_CYAN }}>ESC</span> to close
                </div>
            </div>
        </div>
    );
};

export default QuestsPanel;
