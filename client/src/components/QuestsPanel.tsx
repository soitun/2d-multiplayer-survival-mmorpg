import React, { useMemo, useState, useCallback } from 'react';
import { 
    TutorialQuestDefinition, 
    DailyQuestDefinition,
    PlayerTutorialProgress, 
    PlayerDailyQuest,
    QuestStatus 
} from '../generated';
import { Identity } from 'spacetimedb';
import { 
    TUTORIALS, 
    TutorialDefinition, 
    replayTutorial,
    ShowSovaSoundBoxFn,
    SovaMessageAdderFn
} from '../hooks/useSovaTutorials';

// Helper: get human-readable label for quest objective (e.g. "Beach Lyme Grass", "Plant Fiber", "Wood")
function getObjectiveLabel(quest: TutorialQuestDefinition, which: 'primary' | 'secondary'): string {
    const objType = which === 'primary' ? quest.objectiveType : quest.secondaryObjectiveType;
    const targetId = which === 'primary' ? quest.targetId : quest.secondaryTargetId;
    if (!objType) return which === 'primary' ? 'Objective' : 'Secondary Objective';
    const tag = (objType as { tag?: string }).tag;
    if (tag === 'GatherWood') return 'Wood';
    if (tag === 'GatherStone') return 'Stone';
    if (tag === 'GatherFiber') return 'Plant Fiber';
    if (targetId) return targetId; // HarvestSpecificPlant, CollectSpecificItem, CraftSpecificItem
    return which === 'primary' ? 'Objective' : 'Secondary Objective';
}

// Style constants - Cyberpunk theme
const UI_BG_COLOR = 'linear-gradient(135deg, rgba(10, 5, 20, 0.98), rgba(15, 8, 30, 0.99))';
const UI_BORDER_COLOR = '#00aaff';
const UI_SHADOW = '0 0 50px rgba(0, 170, 255, 0.4), inset 0 0 30px rgba(0, 170, 255, 0.15)';
const UI_FONT_FAMILY = '"Press Start 2P", cursive';
const SOVA_PURPLE = '#c084fc';
const SOVA_CYAN = '#00ffff';
const GLOW_CYAN = '0 0 15px rgba(0, 255, 255, 0.6)';

interface QuestsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    tutorialQuestDefinitions: Map<string, TutorialQuestDefinition>;
    dailyQuestDefinitions: Map<string, DailyQuestDefinition>;
    playerTutorialProgress: Map<string, PlayerTutorialProgress>;
    playerDailyQuests: Map<string, PlayerDailyQuest>;
    localPlayerId: Identity | undefined;
    isMobile?: boolean;
    // Audio tutorials replay functionality
    showSovaSoundBox?: ShowSovaSoundBoxFn;
    addSOVAMessage?: SovaMessageAdderFn;
    // Server-side tutorial flags (ALL tutorials now server-validated, survives browser cache clear)
    hasSeenSovaIntro?: boolean;
    hasSeenMemoryShardTutorial?: boolean;
    hasSeenTutorialHint?: boolean;
    hasSeenHostileEncounterTutorial?: boolean;
    hasSeenRuneStoneTutorial?: boolean;
    hasSeenAlkStationTutorial?: boolean;
    hasSeenCrashedDroneTutorial?: boolean;
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
    showSovaSoundBox,
    addSOVAMessage,
    // All server-side tutorial flags
    hasSeenSovaIntro,
    hasSeenMemoryShardTutorial,
    hasSeenTutorialHint,
    hasSeenHostileEncounterTutorial,
    hasSeenRuneStoneTutorial,
    hasSeenAlkStationTutorial,
    hasSeenCrashedDroneTutorial,
}) => {
    // Get tutorial progress
    const tutorialProgress = useMemo(() => {
        if (!localPlayerId) return null;
        return playerTutorialProgress.get(localPlayerId.toHexString()) || null;
    }, [localPlayerId, playerTutorialProgress]);

    // Check if a tutorial is unlocked using SERVER-SIDE flags
    // ALL tutorials now use server-side validation (no localStorage fallback)
    const isTutorialUnlockedWithServer = useCallback((tutorialId: string): boolean => {
        switch (tutorialId) {
            case 'crashIntro':
                return hasSeenSovaIntro === true;
            case 'tutorialHint':
                return hasSeenTutorialHint === true;
            case 'memoryShard':
                return hasSeenMemoryShardTutorial === true;
            case 'firstHostileEncounter':
                return hasSeenHostileEncounterTutorial === true;
            case 'runeStone':
                return hasSeenRuneStoneTutorial === true;
            case 'alkStation':
                return hasSeenAlkStationTutorial === true;
            case 'crashedDrone':
                return hasSeenCrashedDroneTutorial === true;
            default:
                return false;
        }
    }, [hasSeenSovaIntro, hasSeenTutorialHint, hasSeenMemoryShardTutorial, hasSeenHostileEncounterTutorial, hasSeenRuneStoneTutorial, hasSeenAlkStationTutorial, hasSeenCrashedDroneTutorial]);

    // Get unlocked SOVA tutorials for the Audio Tutorials tab
    // Uses server-side flags where available, localStorage as fallback
    const unlockedTutorials = useMemo(() => {
        return Object.values(TUTORIALS).filter(tutorial => 
            isTutorialUnlockedWithServer(tutorial.id)
        );
    }, [isOpen, hasSeenSovaIntro, hasSeenMemoryShardTutorial, isTutorialUnlockedWithServer]);

    // Handle replaying a tutorial
    const handleReplayTutorial = useCallback((tutorialId: string) => {
        replayTutorial(tutorialId, showSovaSoundBox, addSOVAMessage);
    }, [showSovaSoundBox, addSOVAMessage]);

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

    // Get player's daily quests - only show quests from the current (most recent) day
    const playerDailyQuestsList = useMemo(() => {
        if (!localPlayerId) return [];
        
        const allPlayerQuests = Array.from(playerDailyQuests.values())
            .filter(q => q.playerId.toHexString() === localPlayerId.toHexString());
        
        // Find the most recent assigned day (current day)
        const mostRecentDay = allPlayerQuests.reduce((maxDay, quest) => 
            Math.max(maxDay, quest.assignedDay), 0);
        
        // Only return quests from the current day
        return allPlayerQuests.filter(q => q.assignedDay === mostRecentDay);
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

    // Tab state
    const [activeTab, setActiveTab] = useState<'mission' | 'daily' | 'audio'>('mission');

    if (!isOpen) return null;

    const getStatusText = (status: QuestStatus): string => {
        switch (status.tag) {
            case 'Locked': return '🔒 LOCKED';
            case 'Available': return '⭐ AVAILABLE';
            case 'InProgress': return '▶ IN PROGRESS';
            case 'Completed': return '✓ COMPLETE';
            case 'Expired': return '⏰ EXPIRED';
            default: return 'UNKNOWN';
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
        <div 
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                zIndex: 2000,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                backdropFilter: 'blur(8px)',
            }} 
            onClick={onClose}
        >
            {/* Custom scrollbar styles */}
            <style>{`
                .quest-panel-scroll::-webkit-scrollbar {
                    width: 12px;
                }
                .quest-panel-scroll::-webkit-scrollbar-track {
                    background: rgba(0, 20, 40, 0.8);
                    border-radius: 6px;
                    border: 1px solid rgba(0, 170, 255, 0.3);
                }
                .quest-panel-scroll::-webkit-scrollbar-thumb {
                    background: linear-gradient(180deg, #00aaff, #0066aa);
                    border-radius: 6px;
                    border: 2px solid rgba(0, 20, 40, 0.8);
                    box-shadow: 0 0 10px rgba(0, 170, 255, 0.5);
                }
                .quest-panel-scroll::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(180deg, #00ffff, #00aaff);
                    box-shadow: 0 0 15px rgba(0, 255, 255, 0.7);
                }
                .quest-panel-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: #00aaff rgba(0, 20, 40, 0.8);
                }
            `}</style>

            <div 
                style={{
                    width: isMobile ? '95%' : '700px',
                    maxWidth: '95vw',
                    height: '85vh',
                    maxHeight: '85vh',
                    background: UI_BG_COLOR,
                    border: `3px solid ${UI_BORDER_COLOR}`,
                    borderRadius: '16px',
                    boxShadow: UI_SHADOW,
                    fontFamily: UI_FONT_FAMILY,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                }} 
                onClick={(e) => e.stopPropagation()}
            >
                {/* Animated scan line */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent, #00ffff, transparent)',
                    animation: 'scanLine 3s linear infinite',
                    pointerEvents: 'none',
                }} />
                
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '20px 24px',
                    borderBottom: `2px solid ${UI_BORDER_COLOR}`,
                    background: 'linear-gradient(90deg, rgba(0, 170, 255, 0.15), rgba(192, 132, 252, 0.15), rgba(0, 170, 255, 0.15))',
                    flexShrink: 0,
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        color: SOVA_CYAN,
                        fontSize: isMobile ? '14px' : '18px',
                        fontWeight: 'bold',
                        textShadow: GLOW_CYAN,
                    }}>
                        <span style={{ fontSize: isMobile ? '20px' : '26px' }}>📡</span>
                        <span>SOVA DIRECTIVES</span>
                    </div>
                    <button 
                        style={{
                            background: 'rgba(192, 132, 252, 0.1)',
                            border: `2px solid ${SOVA_PURPLE}`,
                            borderRadius: '6px',
                            color: SOVA_PURPLE,
                            fontSize: isMobile ? '10px' : '13px',
                            padding: '10px 18px',
                            cursor: 'pointer',
                            fontFamily: UI_FONT_FAMILY,
                            transition: 'all 0.2s ease',
                            textShadow: '0 0 10px rgba(192, 132, 252, 0.5)',
                        }}
                        onClick={onClose}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = SOVA_PURPLE;
                            e.currentTarget.style.color = '#fff';
                            e.currentTarget.style.boxShadow = '0 0 20px rgba(192, 132, 252, 0.6)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(192, 132, 252, 0.1)';
                            e.currentTarget.style.color = SOVA_PURPLE;
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                    >
                        CLOSE [ESC]
                    </button>
                </div>

                {/* Tab Navigation */}
                <div style={{
                    display: 'flex',
                    borderBottom: `2px solid ${UI_BORDER_COLOR}`,
                    background: 'rgba(0, 10, 20, 0.5)',
                    flexShrink: 0,
                }}>
                    {/* Primary Mission Tab */}
                    <button
                        onClick={() => setActiveTab('mission')}
                        style={{
                            flex: 1,
                            padding: isMobile ? '14px 12px' : '16px 20px',
                            background: activeTab === 'mission' 
                                ? 'linear-gradient(180deg, rgba(192, 132, 252, 0.2), rgba(192, 132, 252, 0.05))'
                                : 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'mission' 
                                ? `3px solid ${SOVA_PURPLE}`
                                : '3px solid transparent',
                            color: activeTab === 'mission' ? SOVA_PURPLE : '#6b7280',
                            fontSize: isMobile ? '11px' : '14px',
                            fontWeight: 'bold',
                            fontFamily: UI_FONT_FAMILY,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            textShadow: activeTab === 'mission' ? '0 0 15px rgba(192, 132, 252, 0.5)' : 'none',
                        }}
                        onMouseEnter={(e) => {
                            if (activeTab !== 'mission') {
                                e.currentTarget.style.color = SOVA_PURPLE;
                                e.currentTarget.style.background = 'rgba(192, 132, 252, 0.1)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (activeTab !== 'mission') {
                                e.currentTarget.style.color = '#6b7280';
                                e.currentTarget.style.background = 'transparent';
                            }
                        }}
                    >
                        <span style={{ fontSize: isMobile ? '16px' : '18px' }}>🎯</span>
                        <span>Primary Mission</span>
                        {tutorialProgress?.tutorialCompleted && (
                            <span style={{ 
                                color: '#4ade80', 
                                fontSize: isMobile ? '8px' : '10px',
                                padding: '2px 6px',
                                background: 'rgba(74, 222, 128, 0.2)',
                                borderRadius: '3px',
                            }}>
                                ✓
                            </span>
                        )}
                    </button>

                    {/* Daily Training Tab - locked until calibration complete */}
                    <button
                        onClick={() => setActiveTab('daily')}
                        style={{
                            flex: 1,
                            padding: isMobile ? '14px 12px' : '16px 20px',
                            background: activeTab === 'daily' 
                                ? 'linear-gradient(180deg, rgba(0, 255, 255, 0.2), rgba(0, 255, 255, 0.05))'
                                : 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'daily' 
                                ? `3px solid ${SOVA_CYAN}`
                                : '3px solid transparent',
                            color: activeTab === 'daily' ? SOVA_CYAN : (tutorialProgress?.tutorialCompleted ? '#6b7280' : '#4b5563'),
                            fontSize: isMobile ? '11px' : '14px',
                            fontWeight: 'bold',
                            fontFamily: UI_FONT_FAMILY,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            textShadow: activeTab === 'daily' ? GLOW_CYAN : 'none',
                        }}
                        onMouseEnter={(e) => {
                            if (activeTab !== 'daily') {
                                e.currentTarget.style.color = SOVA_CYAN;
                                e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (activeTab !== 'daily') {
                                e.currentTarget.style.color = '#6b7280';
                                e.currentTarget.style.background = 'transparent';
                            }
                        }}
                    >
                        <span style={{ fontSize: isMobile ? '16px' : '18px' }}>
                            {tutorialProgress?.tutorialCompleted ? '📋' : '🔒'}
                        </span>
                        <span>Daily Training</span>
                        {tutorialProgress?.tutorialCompleted ? (
                            <span style={{ 
                                color: dailyQuestsWithDefs.filter(d => d.quest.status.tag === 'Completed').length === dailyQuestsWithDefs.length && dailyQuestsWithDefs.length > 0
                                    ? '#4ade80' 
                                    : '#9ca3af', 
                                fontSize: isMobile ? '10px' : '12px',
                                padding: '2px 8px',
                                background: 'rgba(0, 0, 0, 0.4)',
                                borderRadius: '3px',
                            }}>
                                {dailyQuestsWithDefs.filter(d => d.quest.status.tag === 'Completed').length}/{dailyQuestsWithDefs.length}
                            </span>
                        ) : (
                            <span style={{ 
                                color: '#f59e0b', 
                                fontSize: isMobile ? '8px' : '9px',
                                padding: '2px 6px',
                                background: 'rgba(245, 158, 11, 0.2)',
                                borderRadius: '3px',
                                whiteSpace: 'nowrap',
                            }}>
                                UNAVAILABLE
                            </span>
                        )}
                    </button>

                    {/* Audio Tutorials Tab */}
                    <button
                        onClick={() => setActiveTab('audio')}
                        style={{
                            flex: 1,
                            padding: isMobile ? '14px 12px' : '16px 20px',
                            background: activeTab === 'audio' 
                                ? 'linear-gradient(180deg, rgba(251, 191, 36, 0.2), rgba(251, 191, 36, 0.05))'
                                : 'transparent',
                            border: 'none',
                            borderBottom: activeTab === 'audio' 
                                ? '3px solid #fbbf24'
                                : '3px solid transparent',
                            color: activeTab === 'audio' ? '#fbbf24' : '#6b7280',
                            fontSize: isMobile ? '11px' : '14px',
                            fontWeight: 'bold',
                            fontFamily: UI_FONT_FAMILY,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            textShadow: activeTab === 'audio' ? '0 0 15px rgba(251, 191, 36, 0.5)' : 'none',
                        }}
                        onMouseEnter={(e) => {
                            if (activeTab !== 'audio') {
                                e.currentTarget.style.color = '#fbbf24';
                                e.currentTarget.style.background = 'rgba(251, 191, 36, 0.1)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (activeTab !== 'audio') {
                                e.currentTarget.style.color = '#6b7280';
                                e.currentTarget.style.background = 'transparent';
                            }
                        }}
                    >
                        <span style={{ fontSize: isMobile ? '16px' : '18px' }}>🔊</span>
                        <span style={{ display: isMobile ? 'none' : 'inline' }}>Audio Logs</span>
                        <span style={{ display: isMobile ? 'inline' : 'none' }}>Audio</span>
                        <span style={{ 
                            color: unlockedTutorials.length > 0 ? '#4ade80' : '#9ca3af', 
                            fontSize: isMobile ? '10px' : '12px',
                            padding: '2px 8px',
                            background: 'rgba(0, 0, 0, 0.4)',
                            borderRadius: '3px',
                        }}>
                            {unlockedTutorials.length}/{Object.keys(TUTORIALS).length}
                        </span>
                    </button>
                </div>

                {/* Scrollable Content */}
                <div 
                    className="quest-panel-scroll"
                    data-id="quests-panel-scroll"
                    style={{
                        padding: '24px',
                        overflowY: 'auto',
                        flex: '1 1 auto',
                        minHeight: 0,
                    }}
                    onWheel={(e) => e.stopPropagation()}
                >
                    {/* Primary Mission Tab Content */}
                    {activeTab === 'mission' && (
                        <>
                        {currentTutorialQuest ? (
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(192, 132, 252, 0.12), rgba(0, 170, 255, 0.08))',
                                border: `2px solid ${SOVA_PURPLE}`,
                                borderRadius: '12px',
                                padding: '20px',
                                boxShadow: '0 0 25px rgba(192, 132, 252, 0.15)',
                            }}>
                                <div style={{
                                    color: '#fff',
                                    fontSize: isMobile ? '13px' : '15px',
                                    fontWeight: 'bold',
                                    marginBottom: '12px',
                                    textShadow: '0 0 10px rgba(255, 255, 255, 0.3)',
                                }}>
                                    {currentTutorialQuest.name}
                                </div>
                                <div style={{
                                    color: '#b0b8c8',
                                    fontSize: isMobile ? '11px' : '13px',
                                    marginBottom: '16px',
                                    lineHeight: 1.6,
                                }}>
                                    {currentTutorialQuest.description}
                                </div>
                                
                                {/* Primary Objective Progress Bar */}
                                <div style={{ marginBottom: '12px' }}>
                                    <div style={{
                                        color: '#9ca3af',
                                        fontSize: isMobile ? '9px' : '11px',
                                        marginBottom: '4px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '1px',
                                    }}>
                                        {/* Show item name (e.g. "Beach Lyme Grass", "Wood") for clarity */}
                                        {getObjectiveLabel(currentTutorialQuest, 'primary')}
                                    </div>
                                    <div style={{
                                        width: '100%',
                                        height: '14px',
                                        backgroundColor: 'rgba(55, 65, 81, 0.6)',
                                        borderRadius: '7px',
                                        overflow: 'hidden',
                                        marginBottom: '6px',
                                        border: '1px solid rgba(0, 170, 255, 0.3)',
                                    }}>
                                        <div style={{
                                            width: `${Math.min((tutorialProgress?.currentQuestProgress || 0) / currentTutorialQuest.targetAmount * 100, 100)}%`,
                                            height: '100%',
                                            background: `linear-gradient(90deg, ${SOVA_CYAN}, ${SOVA_PURPLE})`,
                                            borderRadius: '7px',
                                            transition: 'width 0.3s ease',
                                            boxShadow: '0 0 15px rgba(0, 255, 255, 0.5)',
                                        }} />
                                    </div>
                                    <div style={{ color: SOVA_CYAN, fontSize: isMobile ? '11px' : '13px', textShadow: GLOW_CYAN }}>
                                        {tutorialProgress?.currentQuestProgress || 0} / {currentTutorialQuest.targetAmount}
                                    </div>
                                </div>

                                {/* Secondary Objective Progress Bar (if exists) - show "OR" when alternative path */}
                                {(currentTutorialQuest as any).secondaryObjectiveType && (currentTutorialQuest as any).secondaryTargetAmount > 0 && (
                                    <div style={{ marginBottom: '12px' }}>
                                        {(currentTutorialQuest as any).objectiveLogic?.tag === 'Or' && (
                                            <div style={{ color: '#fbbf24', fontSize: isMobile ? '10px' : '12px', marginBottom: '8px', fontWeight: 'bold', textAlign: 'center' }}>
                                                — OR —
                                            </div>
                                        )}
                                        <div style={{
                                            color: '#9ca3af',
                                            fontSize: isMobile ? '9px' : '11px',
                                            marginBottom: '4px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '1px',
                                        }}>
                                            {getObjectiveLabel(currentTutorialQuest, 'secondary')}
                                        </div>
                                        <div style={{
                                            width: '100%',
                                            height: '14px',
                                            backgroundColor: 'rgba(55, 65, 81, 0.6)',
                                            borderRadius: '7px',
                                            overflow: 'hidden',
                                            marginBottom: '6px',
                                            border: '1px solid rgba(192, 132, 252, 0.3)',
                                        }}>
                                            <div style={{
                                                width: `${Math.min(((tutorialProgress as any)?.secondaryQuestProgress || 0) / (currentTutorialQuest as any).secondaryTargetAmount * 100, 100)}%`,
                                                height: '100%',
                                                background: `linear-gradient(90deg, ${SOVA_PURPLE}, #f472b6)`,
                                                borderRadius: '7px',
                                                transition: 'width 0.3s ease',
                                                boxShadow: '0 0 15px rgba(192, 132, 252, 0.5)',
                                            }} />
                                        </div>
                                        <div style={{ color: SOVA_PURPLE, fontSize: isMobile ? '11px' : '13px', textShadow: '0 0 10px rgba(192, 132, 252, 0.5)' }}>
                                            {(tutorialProgress as any)?.secondaryQuestProgress || 0} / {(currentTutorialQuest as any).secondaryTargetAmount}
                                        </div>
                                    </div>
                                )}
                                
                                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                    <div style={{ display: 'flex', gap: '20px', fontSize: isMobile ? '11px' : '13px' }}>
                                        <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>⚡</span>
                                            <span>{currentTutorialQuest.xpReward.toString()} XP</span>
                                        </span>
                                        <span style={{ color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>💎</span>
                                            <span>{currentTutorialQuest.shardReward.toString()} Shards</span>
                                        </span>
                                    </div>
                                </div>
                                
                                {currentTutorialQuest.sovaStartMessage && (
                                    <div style={{ 
                                        marginTop: '18px', 
                                        padding: '14px 18px', 
                                        background: 'rgba(192, 132, 252, 0.08)', 
                                        borderRadius: '8px',
                                        borderLeft: `4px solid ${SOVA_PURPLE}`,
                                    }}>
                                        <span style={{ color: SOVA_PURPLE, fontSize: '11px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                                            SOVA:
                                        </span>
                                        <span style={{ color: '#d1d5db', fontSize: isMobile ? '11px' : '12px', fontStyle: 'italic', lineHeight: 1.6 }}>
                                            "{currentTutorialQuest.sovaStartMessage}"
                                        </span>
                                    </div>
                                )}
                            </div>
                        ) : tutorialProgress?.tutorialCompleted ? (
                            <div style={{ 
                                color: '#a0a8b8', 
                                fontSize: isMobile ? '12px' : '14px', 
                                fontStyle: 'italic',
                                padding: '20px',
                                background: 'rgba(74, 222, 128, 0.05)',
                                borderRadius: '12px',
                                border: '1px solid rgba(74, 222, 128, 0.25)',
                                lineHeight: 1.6,
                            }}>
                                🎖️ Calibration protocol complete. You've proven yourself capable, Agent. 
                                Continue with daily training to maintain peak performance.
                            </div>
                        ) : (
                            <div style={{ 
                                color: '#6b7280', 
                                fontSize: isMobile ? '12px' : '14px', 
                                fontStyle: 'italic',
                                padding: '20px',
                                background: 'rgba(55, 65, 81, 0.2)',
                                borderRadius: '12px',
                                border: '1px dashed rgba(107, 114, 128, 0.4)',
                            }}>
                                ⏳ No active mission. Initializing directive uplink...
                            </div>
                        )}

                        {/* Calibration Progress Overview */}
                        {tutorialProgress && !tutorialProgress.tutorialCompleted && sortedTutorialQuests.length > 0 && (
                            <div style={{ marginTop: '24px' }}>
                                <div style={{
                                    color: '#9ca3af',
                                    fontSize: isMobile ? '12px' : '14px',
                                    fontWeight: 'bold',
                                    marginBottom: '14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                }}>
                                    <span>📊</span>
                                    <span>Calibration Progress</span>
                                </div>
                                <div style={{ 
                                    display: 'flex', 
                                    flexWrap: 'wrap', 
                                    gap: '6px',
                                    padding: '14px',
                                    background: 'rgba(20, 25, 40, 0.5)',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(107, 114, 128, 0.2)',
                                }}>
                                    {sortedTutorialQuests.map((quest, index) => {
                                        const isCompleted = index < (tutorialProgress?.currentQuestIndex || 0);
                                        const isCurrent = index === tutorialProgress?.currentQuestIndex;
                                        return (
                                            <div
                                                key={quest.id}
                                                title={quest.name}
                                                style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '6px',
                                                    backgroundColor: isCompleted ? '#4ade80' : isCurrent ? SOVA_PURPLE : '#374151',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '12px',
                                                    fontWeight: 'bold',
                                                    color: isCompleted || isCurrent ? '#fff' : '#6b7280',
                                                    border: isCurrent ? `2px solid ${SOVA_CYAN}` : '1px solid rgba(107, 114, 128, 0.3)',
                                                    boxShadow: isCurrent ? `0 0 15px ${SOVA_CYAN}` : isCompleted ? '0 0 10px rgba(74, 222, 128, 0.3)' : 'none',
                                                    cursor: 'default',
                                                    transition: 'all 0.2s ease',
                                                }}
                                            >
                                                {isCompleted ? '✓' : index + 1}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ color: '#6b7280', fontSize: isMobile ? '11px' : '13px', marginTop: '14px', textAlign: 'center' }}>
                                    Mission {(tutorialProgress?.currentQuestIndex || 0) + 1} of {sortedTutorialQuests.length}
                                </div>
                            </div>
                        )}
                        </>
                    )}

                    {/* Daily Training Tab Content */}
                    {activeTab === 'daily' && (
                        <>
                        {!tutorialProgress?.tutorialCompleted ? (
                            <div style={{ 
                                padding: '32px 24px',
                                textAlign: 'center',
                                background: 'linear-gradient(135deg, rgba(107, 114, 128, 0.15), rgba(75, 85, 99, 0.1))',
                                borderRadius: '12px',
                                border: '2px dashed rgba(107, 114, 128, 0.5)',
                                marginBottom: '20px',
                            }}>
                                <div style={{ 
                                    fontSize: isMobile ? '28px' : '40px', 
                                    marginBottom: '16px',
                                    opacity: 0.7,
                                }}>
                                    🔒
                                </div>
                                <div style={{ 
                                    color: '#9ca3af', 
                                    fontSize: isMobile ? '14px' : '16px', 
                                    fontWeight: 'bold',
                                    marginBottom: '12px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                }}>
                                    Daily Training Unavailable
                                </div>
                                <div style={{ 
                                    color: '#6b7280', 
                                    fontSize: isMobile ? '11px' : '13px', 
                                    lineHeight: 1.6,
                                    maxWidth: '400px',
                                    margin: '0 auto',
                                }}>
                                    Complete the Primary Mission (calibration) to unlock daily training objectives. 
                                    Finish all calibration protocols in the Primary Mission tab first.
                                </div>
                                <button
                                    onClick={() => setActiveTab('mission')}
                                    style={{
                                        marginTop: '20px',
                                        padding: '12px 24px',
                                        background: 'linear-gradient(135deg, rgba(192, 132, 252, 0.3), rgba(0, 170, 255, 0.2))',
                                        border: `2px solid ${SOVA_PURPLE}`,
                                        borderRadius: '8px',
                                        color: SOVA_PURPLE,
                                        fontSize: isMobile ? '11px' : '13px',
                                        fontFamily: UI_FONT_FAMILY,
                                        cursor: 'pointer',
                                        textTransform: 'uppercase',
                                        letterSpacing: '1px',
                                        transition: 'all 0.2s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = SOVA_PURPLE;
                                        e.currentTarget.style.color = '#fff';
                                        e.currentTarget.style.boxShadow = '0 0 20px rgba(192, 132, 252, 0.5)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(192, 132, 252, 0.3), rgba(0, 170, 255, 0.2))';
                                        e.currentTarget.style.color = SOVA_PURPLE;
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                >
                                    Go to Primary Mission →
                                </button>
                            </div>
                        ) : dailyQuestsWithDefs.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {dailyQuestsWithDefs.map(({ quest, definition }) => {
                                    const isCompleted = quest.status.tag === 'Completed';
                                    const progressPercent = (quest.currentProgress / quest.targetAmount) * 100;
                                    
                                    return (
                                        <div 
                                            key={quest.id.toString()} 
                                            style={{
                                                background: isCompleted 
                                                    ? 'linear-gradient(135deg, rgba(74, 222, 128, 0.1), rgba(34, 197, 94, 0.05))'
                                                    : 'rgba(20, 25, 40, 0.6)',
                                                border: `1px solid ${isCompleted ? 'rgba(74, 222, 128, 0.4)' : 'rgba(107, 114, 128, 0.3)'}`,
                                                borderRadius: '10px',
                                                padding: '16px 20px',
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                                <div style={{
                                                    color: isCompleted ? '#4ade80' : '#e0e0e0',
                                                    fontSize: isMobile ? '12px' : '14px',
                                                    fontWeight: 'bold',
                                                }}>
                                                    {definition?.name || 'Unknown Quest'}
                                                </div>
                                                <span style={{ 
                                                    color: getStatusColor(quest.status), 
                                                    fontSize: isMobile ? '9px' : '11px',
                                                    padding: '5px 10px',
                                                    background: 'rgba(0,0,0,0.4)',
                                                    borderRadius: '4px',
                                                    border: `1px solid ${getStatusColor(quest.status)}40`,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {getStatusText(quest.status)}
                                                </span>
                                            </div>
                                            <div style={{
                                                color: '#9ca3af',
                                                fontSize: isMobile ? '10px' : '12px',
                                                marginBottom: '14px',
                                                lineHeight: 1.5,
                                            }}>
                                                {definition?.description || 'Complete this training objective.'}
                                            </div>
                                            
                                            {/* Progress Bar */}
                                            <div style={{
                                                width: '100%',
                                                height: '10px',
                                                backgroundColor: 'rgba(55, 65, 81, 0.5)',
                                                borderRadius: '5px',
                                                overflow: 'hidden',
                                                marginBottom: '10px',
                                            }}>
                                                <div style={{
                                                    width: `${Math.min(progressPercent, 100)}%`,
                                                    height: '100%',
                                                    backgroundColor: isCompleted ? '#4ade80' : SOVA_CYAN,
                                                    borderRadius: '5px',
                                                    transition: 'width 0.3s ease',
                                                    boxShadow: `0 0 10px ${isCompleted ? 'rgba(74, 222, 128, 0.5)' : 'rgba(0, 255, 255, 0.5)'}`,
                                                }} />
                                            </div>
                                            
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                <span style={{ color: isCompleted ? '#4ade80' : '#a0a8b8', fontSize: isMobile ? '11px' : '13px' }}>
                                                    {quest.currentProgress} / {quest.targetAmount}
                                                </span>
                                                <div style={{ display: 'flex', gap: '16px', fontSize: isMobile ? '10px' : '12px' }}>
                                                    <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <span>⚡</span>
                                                        <span>{quest.xpReward.toString()} XP</span>
                                                    </span>
                                                    <span style={{ color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <span>💎</span>
                                                        <span>{quest.shardReward.toString()}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ 
                                color: '#6b7280', 
                                fontSize: isMobile ? '12px' : '14px', 
                                fontStyle: 'italic',
                                padding: '20px',
                                background: 'rgba(55, 65, 81, 0.2)',
                                borderRadius: '12px',
                                border: '1px dashed rgba(107, 114, 128, 0.4)',
                                lineHeight: 1.6,
                            }}>
                                ⏳ Daily training assignments not yet initialized. Check back soon.
                            </div>
                        )}
                        </>
                    )}

                    {/* Audio Tutorials Tab Content */}
                    {activeTab === 'audio' && (
                        <>
                        {/* Header info */}
                        <div style={{ 
                            marginBottom: '20px', 
                            padding: '16px 20px', 
                            background: 'rgba(251, 191, 36, 0.08)', 
                            borderRadius: '10px',
                            border: '1px solid rgba(251, 191, 36, 0.25)',
                        }}>
                            <div style={{
                                color: '#fbbf24',
                                fontSize: isMobile ? '12px' : '14px',
                                fontWeight: 'bold',
                                marginBottom: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}>
                                <span>📡</span>
                                <span>SOVA Audio Logs</span>
                            </div>
                            <div style={{
                                color: '#9ca3af',
                                fontSize: isMobile ? '10px' : '12px',
                                lineHeight: 1.5,
                            }}>
                                Replay archived SOVA transmissions. Click any entry to listen again.
                            </div>
                        </div>

                        {unlockedTutorials.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {Object.values(TUTORIALS).map((tutorial: TutorialDefinition) => {
                                    // Use server-side flags where available (crashIntro, memoryShard)
                                    const isUnlocked = isTutorialUnlockedWithServer(tutorial.id);
                                    
                                    return (
                                        <div 
                                            key={tutorial.id}
                                            onClick={() => isUnlocked && handleReplayTutorial(tutorial.id)}
                                            style={{
                                                background: isUnlocked 
                                                    ? 'rgba(20, 25, 40, 0.6)'
                                                    : 'rgba(20, 25, 40, 0.3)',
                                                border: `1px solid ${isUnlocked ? 'rgba(251, 191, 36, 0.3)' : 'rgba(107, 114, 128, 0.2)'}`,
                                                borderRadius: '10px',
                                                padding: '14px 18px',
                                                cursor: isUnlocked ? 'pointer' : 'not-allowed',
                                                transition: 'all 0.2s ease',
                                                opacity: isUnlocked ? 1 : 0.5,
                                            }}
                                            onMouseEnter={(e) => {
                                                if (isUnlocked) {
                                                    e.currentTarget.style.background = 'rgba(251, 191, 36, 0.1)';
                                                    e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.5)';
                                                    e.currentTarget.style.boxShadow = '0 0 15px rgba(251, 191, 36, 0.2)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (isUnlocked) {
                                                    e.currentTarget.style.background = 'rgba(20, 25, 40, 0.6)';
                                                    e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.3)';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                }
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                {/* Icon */}
                                                <div style={{
                                                    width: '40px',
                                                    height: '40px',
                                                    borderRadius: '8px',
                                                    background: isUnlocked 
                                                        ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(251, 191, 36, 0.1))'
                                                        : 'rgba(55, 65, 81, 0.3)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '20px',
                                                    flexShrink: 0,
                                                }}>
                                                    {isUnlocked ? tutorial.emoji : '🔒'}
                                                </div>
                                                
                                                {/* Content */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        color: isUnlocked ? '#e0e0e0' : '#6b7280',
                                                        fontSize: isMobile ? '11px' : '13px',
                                                        fontWeight: 'bold',
                                                        marginBottom: '4px',
                                                    }}>
                                                        {tutorial.displayName}
                                                    </div>
                                                    <div style={{
                                                        color: isUnlocked ? '#9ca3af' : '#4b5563',
                                                        fontSize: isMobile ? '9px' : '11px',
                                                        lineHeight: 1.4,
                                                    }}>
                                                        {isUnlocked ? tutorial.description : 'Not yet discovered'}
                                                    </div>
                                                </div>
                                                
                                                {/* Play indicator */}
                                                {isUnlocked && (
                                                    <div style={{
                                                        color: '#fbbf24',
                                                        fontSize: isMobile ? '16px' : '20px',
                                                        flexShrink: 0,
                                                    }}>
                                                        ▶
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ 
                                color: '#6b7280', 
                                fontSize: isMobile ? '12px' : '14px', 
                                fontStyle: 'italic',
                                padding: '20px',
                                background: 'rgba(55, 65, 81, 0.2)',
                                borderRadius: '12px',
                                border: '1px dashed rgba(107, 114, 128, 0.4)',
                                lineHeight: 1.6,
                                textAlign: 'center',
                            }}>
                                🔇 No audio logs recorded yet. Explore the island to unlock SOVA transmissions.
                            </div>
                        )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: `2px solid ${UI_BORDER_COLOR}`,
                    color: '#6b7280',
                    fontSize: isMobile ? '11px' : '14px',
                    textAlign: 'center',
                    background: 'linear-gradient(180deg, rgba(0, 10, 20, 0.3), rgba(0, 10, 20, 0.6))',
                    flexShrink: 0,
                }}>
                    Press <span style={{ color: SOVA_CYAN, textShadow: GLOW_CYAN }}>J</span> to toggle this panel • 
                    Click <span style={{ color: SOVA_CYAN, textShadow: GLOW_CYAN }}>outside</span> to close
                </div>
            </div>
            
            {/* Animation keyframes */}
            <style>{`
                @keyframes scanLine {
                    0% { transform: translateX(-100%); opacity: 0; }
                    50% { opacity: 1; }
                    100% { transform: translateX(100%); opacity: 0; }
                }
            `}</style>
        </div>
    );
};

export default QuestsPanel;
