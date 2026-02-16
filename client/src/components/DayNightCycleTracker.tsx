import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
    WorldState, 
    TimeOfDay, 
    Season, 
    Player,
    TutorialQuestDefinition,
    DailyQuestDefinition,
    PlayerTutorialProgress,
    PlayerDailyQuest,
} from '../generated';
import { Identity } from 'spacetimedb';
import { calculateChunkIndex } from '../utils/chunkUtils';
import springIcon from '../assets/ui/spring.png';
import summerIcon from '../assets/ui/summer.png';
import autumnIcon from '../assets/ui/autumn.png';
import winterIcon from '../assets/ui/winter.png';

// Style constants - Cyberpunk theme (matching QuestNotifications)
const UI_BG_COLOR = 'linear-gradient(180deg, rgba(15, 25, 20, 0.98) 0%, rgba(20, 35, 30, 0.95) 100%)';
const UI_BORDER_GRADIENT = 'linear-gradient(135deg, #00d4ff, #4ade80, #c084fc, #00d4ff)';
const ACCENT_CYAN = '#00d4ff';
const ACCENT_GREEN = '#4ade80';
const ACCENT_PURPLE = '#c084fc';
const ACCENT_PINK = '#f472b6';

// Colors for different times of day
const TIME_COLORS = {
    dawn: '#ff9e6d',
    twilightMorning: '#c8a2c8',
    morning: '#ffde59',
    noon: '#ffff99',
    afternoon: '#ffde59',
    dusk: '#ff7e45',
    twilightEvening: '#8a2be2',
    night: '#3b4a78',
    midnight: '#1a1a40',
};

// Colors for different seasons
const SEASON_COLORS = {
    spring: '#90EE90',
    summer: '#FFD700',
    autumn: '#FF8C00',
    winter: '#87CEEB',
};

// Season constants (must match server)
const DAYS_PER_SEASON = 240;
const DAYS_PER_YEAR = 960;

// Max chars for objective labels in compact uplink (truncate with ... if longer)
const OBJECTIVE_LABEL_MAX_LEN = 14;

/** Get human-readable label for quest objective (e.g. "Beach Lyme Grass", "Plant Fiber", "Wood") */
function getObjectiveLabel(quest: TutorialQuestDefinition, which: 'primary' | 'secondary' | 'tertiary'): string {
    const objType = which === 'primary' ? quest.objectiveType : which === 'secondary' ? quest.secondaryObjectiveType : quest.tertiaryObjectiveType;
    const targetId = which === 'primary' ? quest.targetId : which === 'secondary' ? quest.secondaryTargetId : quest.tertiaryTargetId;
    if (!objType) return which === 'primary' ? 'Mission' : `Obj_${which === 'secondary' ? '2' : '3'}`;
    const tag = (objType as { tag?: string }).tag;
    if (tag === 'GatherWood') return 'Wood';
    if (tag === 'GatherStone') return 'Stone';
    if (tag === 'GatherFiber') return 'Plant Fiber';
    if (targetId) return targetId;
    return which === 'primary' ? 'Mission' : `Obj_${which === 'secondary' ? '2' : '3'}`;
}

/** Truncate label with ... if too long for compact display */
function truncateLabel(label: string, maxLen: number = OBJECTIVE_LABEL_MAX_LEN): string {
    if (label.length <= maxLen) return label;
    return label.slice(0, maxLen - 3) + '...';
}

interface DayNightCycleTrackerProps {
    worldState: WorldState | null;
    chunkWeather: Map<string, any>;
    localPlayer: Player | undefined;
    isMobile?: boolean;
    onMinimizedChange?: (isMinimized: boolean) => void;
    // Quest props (from SovaDirectivesIndicator)
    tutorialQuestDefinitions?: Map<string, TutorialQuestDefinition>;
    dailyQuestDefinitions?: Map<string, DailyQuestDefinition>;
    playerTutorialProgress?: Map<string, PlayerTutorialProgress>;
    playerDailyQuests?: Map<string, PlayerDailyQuest>;
    localPlayerId?: Identity;
    onOpenQuestsPanel?: () => void;
    hasNewNotification?: boolean;
}

const DayNightCycleTracker: React.FC<DayNightCycleTrackerProps> = ({
    worldState,
    chunkWeather,
    localPlayer,
    isMobile = false,
    onMinimizedChange,
    tutorialQuestDefinitions = new Map(),
    dailyQuestDefinitions = new Map(),
    playerTutorialProgress = new Map(),
    playerDailyQuests = new Map(),
    localPlayerId,
    onOpenQuestsPanel,
    hasNewNotification = false,
}) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const [hoveredElement, setHoveredElement] = useState<'season' | 'time' | 'weather' | 'quest' | null>(null);
    const [pulseAnimation, setPulseAnimation] = useState(false);
    const [progressFlash, setProgressFlash] = useState(false);
    const [secondaryProgressFlash, setSecondaryProgressFlash] = useState(false);
    const [tertiaryProgressFlash, setTertiaryProgressFlash] = useState(false);
    const [prevProgress, setPrevProgress] = useState<number | null>(null);
    const [prevSecondaryProgress, setPrevSecondaryProgress] = useState<number | null>(null);
    const [prevTertiaryProgress, setPrevTertiaryProgress] = useState<number | null>(null);

    // Notify parent when minimized state changes
    const handleSetMinimized = (minimized: boolean) => {
        setIsMinimized(minimized);
        onMinimizedChange?.(minimized);
    };

    // Pulse animation when there's a new notification
    useEffect(() => {
        if (hasNewNotification) {
            setPulseAnimation(true);
            const timer = setTimeout(() => setPulseAnimation(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [hasNewNotification]);

    // Get current progress for flash detection
    const currentProgress = useMemo(() => {
        if (!localPlayerId) return null;
        const progress = playerTutorialProgress.get(localPlayerId.toHexString());
        return progress?.currentQuestProgress ?? null;
    }, [localPlayerId, playerTutorialProgress]);

    const currentSecondaryProgress = useMemo(() => {
        if (!localPlayerId) return null;
        const progress = playerTutorialProgress.get(localPlayerId.toHexString());
        return progress?.secondaryQuestProgress ?? null;
    }, [localPlayerId, playerTutorialProgress]);

    const currentTertiaryProgress = useMemo(() => {
        if (!localPlayerId) return null;
        const progress = playerTutorialProgress.get(localPlayerId.toHexString());
        return progress?.tertiaryQuestProgress ?? null;
    }, [localPlayerId, playerTutorialProgress]);

    // Flash effects when progress increases
    useEffect(() => {
        if (currentProgress !== null && prevProgress !== null && currentProgress > prevProgress) {
            setProgressFlash(true);
            const timer = setTimeout(() => setProgressFlash(false), 800);
            return () => clearTimeout(timer);
        }
        setPrevProgress(currentProgress);
    }, [currentProgress, prevProgress]);

    useEffect(() => {
        if (currentSecondaryProgress !== null && prevSecondaryProgress !== null && currentSecondaryProgress > prevSecondaryProgress) {
            setSecondaryProgressFlash(true);
            const timer = setTimeout(() => setSecondaryProgressFlash(false), 800);
            return () => clearTimeout(timer);
        }
        setPrevSecondaryProgress(currentSecondaryProgress);
    }, [currentSecondaryProgress, prevSecondaryProgress]);

    useEffect(() => {
        if (currentTertiaryProgress !== null && prevTertiaryProgress !== null && currentTertiaryProgress > prevTertiaryProgress) {
            setTertiaryProgressFlash(true);
            const timer = setTimeout(() => setTertiaryProgressFlash(false), 800);
            return () => clearTimeout(timer);
        }
        setPrevTertiaryProgress(currentTertiaryProgress);
    }, [currentTertiaryProgress, prevTertiaryProgress]);

    // Calculate current chunk weather
    const currentChunkWeather = useMemo(() => {
        if (!localPlayer) return null;
        const chunkIndex = calculateChunkIndex(localPlayer.positionX, localPlayer.positionY);
        return chunkWeather.get(chunkIndex.toString()) || null;
    }, [localPlayer, chunkWeather]);

    const displayWeather = currentChunkWeather?.currentWeather || { tag: 'Clear' };
    const displayRainIntensity = currentChunkWeather?.rainIntensity ?? 0.0;

    // Get current tutorial quest
    const currentTutorialQuest = useMemo(() => {
        if (!localPlayerId) return null;
        const progress = playerTutorialProgress.get(localPlayerId.toHexString());
        if (!progress || progress.tutorialCompleted) return null;
        const quests = Array.from(tutorialQuestDefinitions.values()).sort((a, b) => a.orderIndex - b.orderIndex);
        return quests[progress.currentQuestIndex] || null;
    }, [localPlayerId, playerTutorialProgress, tutorialQuestDefinitions]);

    const currentTutorialProgress = useMemo(() => {
        if (!localPlayerId) return null;
        return playerTutorialProgress.get(localPlayerId.toHexString()) || null;
    }, [localPlayerId, playerTutorialProgress]);

    const activeDailyQuestInfo = useMemo(() => {
        if (!localPlayerId) return { active: 0, completed: 0, total: 5 };
        const playerQuests = Array.from(playerDailyQuests.values())
            .filter(q => q.playerId.toHexString() === localPlayerId.toHexString());
        const active = playerQuests.filter(q => q.status.tag === 'InProgress' || q.status.tag === 'Available').length;
        const completed = playerQuests.filter(q => q.status.tag === 'Completed').length;
        return { active, completed, total: 5 };
    }, [localPlayerId, playerDailyQuests]);

    const hasActiveQuest = currentTutorialQuest !== null || activeDailyQuestInfo.active > 0;
    const tutorialComplete = currentTutorialProgress?.tutorialCompleted ?? false;

    // Helper functions
    const getTimeOfDayDisplay = (timeOfDay: TimeOfDay) => {
        switch (timeOfDay.tag) {
            case 'Dawn': return 'Dawn';
            case 'TwilightMorning': return 'Twilight';
            case 'Morning': return 'Morning';
            case 'Noon': return 'Noon';
            case 'Afternoon': return 'Afternoon';
            case 'Dusk': return 'Dusk';
            case 'TwilightEvening': return 'Twilight';
            case 'Night': return 'Night';
            case 'Midnight': return 'Midnight';
            default: return 'Unknown';
        }
    };

    const getTimeEmoji = (timeOfDay: TimeOfDay) => {
        switch (timeOfDay.tag) {
            case 'Dawn': return '🌅';
            case 'TwilightMorning': return '🌆';
            case 'Morning': return '☀️';
            case 'Noon': return '🌞';
            case 'Afternoon': return '🌤️';
            case 'Dusk': return '🌇';
            case 'TwilightEvening': return '🌆';
            case 'Night': return '🌙';
            case 'Midnight': return '🌑';
            default: return '🌍';
        }
    };

    const getWeatherDisplay = (weather: any, isWinter: boolean = false) => {
        if (isWinter) {
            switch (weather.tag) {
                case 'Clear': return 'Clear';
                case 'LightRain': return 'Light Snow';
                case 'ModerateRain': return 'Snow';
                case 'HeavyRain': return 'Heavy Snow';
                case 'HeavyStorm': return 'Blizzard';
                default: return 'Unknown';
            }
        }
        switch (weather.tag) {
            case 'Clear': return 'Clear';
            case 'LightRain': return 'Light Rain';
            case 'ModerateRain': return 'Moderate Rain';
            case 'HeavyRain': return 'Heavy Rain';
            case 'HeavyStorm': return 'Heavy Storm';
            default: return 'Unknown';
        }
    };

    const getWeatherEmoji = (weather: any, isWinter: boolean = false) => {
        if (isWinter) {
            switch (weather.tag) {
                case 'Clear': return '❄️';
                case 'LightRain': return '🌨️';
                case 'ModerateRain': return '🌨️';
                case 'HeavyRain': return '❄️';
                case 'HeavyStorm': return '🌬️';
                default: return '❄️';
            }
        }
        switch (weather.tag) {
            case 'Clear': return '☀️';
            case 'LightRain': return '🌦️';
            case 'ModerateRain': return '🌧️';
            case 'HeavyRain': return '🌧️';
            case 'HeavyStorm': return '⛈️';
            default: return '🌍';
        }
    };

    const getSeasonDisplay = (season: Season) => {
        switch (season.tag) {
            case 'Spring': return 'Spring';
            case 'Summer': return 'Summer';
            case 'Autumn': return 'Autumn';
            case 'Winter': return 'Winter';
            default: return 'Spring';
        }
    };

    const getSeasonIcon = (season: Season): string => {
        switch (season.tag) {
            case 'Spring': return springIcon;
            case 'Summer': return summerIcon;
            case 'Autumn': return autumnIcon;
            case 'Winter': return winterIcon;
            default: return springIcon;
        }
    };

    const getSeasonColor = (season: Season) => {
        switch (season.tag) {
            case 'Spring': return SEASON_COLORS.spring;
            case 'Summer': return SEASON_COLORS.summer;
            case 'Autumn': return SEASON_COLORS.autumn;
            case 'Winter': return SEASON_COLORS.winter;
            default: return SEASON_COLORS.spring;
        }
    };

    const getBackgroundGradient = () => {
        return `linear-gradient(to right, 
            ${TIME_COLORS.midnight}, 
            ${TIME_COLORS.dawn}, 
            ${TIME_COLORS.twilightMorning}, 
            ${TIME_COLORS.morning}, 
            ${TIME_COLORS.noon}, 
            ${TIME_COLORS.afternoon}, 
            ${TIME_COLORS.dusk}, 
            ${TIME_COLORS.twilightEvening}, 
            ${TIME_COLORS.night}, 
            ${TIME_COLORS.midnight})`;
    };

    // Progress text helpers
    const tutorialProgressText = useMemo(() => {
        if (!currentTutorialQuest || !currentTutorialProgress) return null;
        const progress = currentTutorialProgress.currentQuestProgress;
        const target = currentTutorialQuest.targetAmount;
        return `${progress}/${target}`;
    }, [currentTutorialQuest, currentTutorialProgress]);

    const secondaryProgressText = useMemo(() => {
        if (!currentTutorialQuest || !currentTutorialProgress) return null;
        const secondaryTarget = currentTutorialQuest.secondaryTargetAmount;
        if (!secondaryTarget || secondaryTarget === 0) return null;
        const progress = currentTutorialProgress.secondaryQuestProgress;
        return `${progress}/${secondaryTarget}`;
    }, [currentTutorialQuest, currentTutorialProgress]);

    const tertiaryProgressText = useMemo(() => {
        if (!currentTutorialQuest || !currentTutorialProgress) return null;
        const tertiaryTarget = currentTutorialQuest.tertiaryTargetAmount;
        if (!tertiaryTarget || tertiaryTarget === 0) return null;
        const progress = currentTutorialProgress.tertiaryQuestProgress;
        return `${progress}/${tertiaryTarget}`;
    }, [currentTutorialQuest, currentTutorialProgress]);

    const hasMultipleObjectives = secondaryProgressText !== null;
    const hasThreeObjectives = tertiaryProgressText !== null;

    const handleClick = useCallback(() => {
        onOpenQuestsPanel?.();
    }, [onOpenQuestsPanel]);

    const toggleMinimized = () => {
        handleSetMinimized(!isMinimized);
    };

    // Early return if no worldState
    if (!worldState) return null;

    const anyProgressFlash = progressFlash || secondaryProgressFlash || tertiaryProgressFlash;
    const dialPosition = `${worldState.cycleProgress * 100}%`;
    
    // Calculate day within current season (1 to DAYS_PER_SEASON)
    const dayInSeason = ((worldState.dayOfYear - 1) % DAYS_PER_SEASON) + 1;
    
    // Check if it's winter (for snow vs rain display)
    const isWinter = worldState.currentSeason?.tag === 'Winter';

    // ==================== MOBILE VIEW ====================
    if (isMobile) {
        return (
            <div style={{
                position: 'fixed',
                top: '42px',
                right: '10px',
                zIndex: 9995,
            }}>
                <div className="uplink-glow-container" style={{
                    padding: '2px',
                    backgroundImage: UI_BORDER_GRADIENT,
                    backgroundSize: '300% 300%',
                    animation: 'uplinkGradientShift 4s ease infinite',
                    borderRadius: '10px',
                }}>
                    <div style={{
                        background: UI_BG_COLOR,
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontFamily: "'Courier New', 'Consolas', monospace",
                        color: ACCENT_CYAN,
                        minWidth: '200px',
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '8px',
                            paddingBottom: '6px',
                            borderBottom: `1px solid ${ACCENT_CYAN}40`,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '14px' }}>📡</span>
                                <span style={{ fontSize: '9px', fontWeight: 'bold', color: ACCENT_CYAN, letterSpacing: '1px' }}>UPLINK</span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <span className="uplink-dot green" />
                                <span className="uplink-dot cyan" />
                                <span className="uplink-dot purple" />
                            </div>
                        </div>

                        {/* Time Info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <img src={getSeasonIcon(worldState.currentSeason)} alt="" style={{ width: '16px', height: '16px' }} />
                            <span style={{ fontSize: '10px', color: getSeasonColor(worldState.currentSeason), fontWeight: 'bold' }}>
                                {getSeasonDisplay(worldState.currentSeason)}
                            </span>
                            <span style={{ fontSize: '8px', color: '#9ca3af' }}>{dayInSeason}/{DAYS_PER_SEASON}</span>
                            <span style={{ color: `${ACCENT_CYAN}50` }}>|</span>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#fff' }}>Day {worldState.cycleCount}</span>
                            <span style={{ color: `${ACCENT_CYAN}50` }}>|</span>
                            <span style={{ fontSize: '14px' }}>{getWeatherEmoji(displayWeather, isWinter)}</span>
                        </div>

                        {/* Day Progress */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '9px', color: '#9ca3af', minWidth: '50px' }}>{getTimeOfDayDisplay(worldState.timeOfDay)}</span>
                            <div style={{
                                flex: 1,
                                height: '4px',
                                background: 'rgba(0,0,0,0.5)',
                                borderRadius: '2px',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: dialPosition,
                                    height: '100%',
                                    background: getBackgroundGradient(),
                                    transition: 'width 0.5s ease',
                                }} />
                            </div>
                        </div>

                        {/* Quest Progress */}
                        {!tutorialComplete && currentTutorialQuest && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 8px',
                                background: `${ACCENT_GREEN}15`,
                                borderRadius: '4px',
                                border: `1px solid ${ACCENT_GREEN}30`,
                            }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: ACCENT_GREEN, boxShadow: `0 0 8px ${ACCENT_GREEN}` }} />
                                <span style={{ fontSize: '9px', color: ACCENT_PURPLE }}>{tutorialProgressText}</span>
                                {hasMultipleObjectives && (
                                    <>
                                        <span style={{ color: `${ACCENT_CYAN}50` }}>•</span>
                                        <span style={{ fontSize: '9px', color: ACCENT_CYAN }}>{secondaryProgressText}</span>
                                    </>
                                )}
                                {hasThreeObjectives && (
                                    <>
                                        <span style={{ color: `${ACCENT_CYAN}50` }}>•</span>
                                        <span style={{ fontSize: '9px', color: ACCENT_PINK }}>{tertiaryProgressText}</span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <style>{uplinkStyles}</style>
            </div>
        );
    }

    // ==================== MINIMIZED VIEW ====================
    if (isMinimized) {
        const timeTooltipText = getTimeOfDayDisplay(worldState.timeOfDay) + 
            (worldState.isFullMoon && (worldState.timeOfDay.tag === 'Night' || worldState.timeOfDay.tag === 'Midnight') ? ' • Full Moon' : '');
        
        return (
            <div
                onClick={toggleMinimized}
                style={{
                    position: 'fixed',
                    top: '15px',
                    right: '15px',
                    zIndex: 50,
                    cursor: 'pointer',
                }}
            >
                <div className="uplink-glow-container minimized" style={{
                    padding: '2px',
                    backgroundImage: anyProgressFlash ? `linear-gradient(135deg, ${ACCENT_GREEN}, ${ACCENT_CYAN}, ${ACCENT_GREEN})` : UI_BORDER_GRADIENT,
                    backgroundSize: '300% 300%',
                    animation: anyProgressFlash ? 'progressFlashBorder 0.8s ease-out' : 'uplinkGradientShift 4s ease infinite',
                    borderRadius: '8px',
                }}>
                    <div style={{
                        background: UI_BG_COLOR,
                        padding: '8px 14px',
                        borderRadius: '6px',
                        fontFamily: "'Courier New', 'Consolas', monospace",
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                    }}>
                        {/* Season Icon with Tooltip */}
                        <div
                            style={{ position: 'relative' }}
                            onMouseEnter={(e) => { e.stopPropagation(); setHoveredElement('season'); }}
                            onMouseLeave={() => setHoveredElement(null)}
                        >
                            <img 
                                src={getSeasonIcon(worldState.currentSeason)} 
                                alt="" 
                                style={{ 
                                    width: '14px', 
                                    height: '14px',
                                    transition: 'transform 0.2s ease',
                                    transform: hoveredElement === 'season' ? 'scale(1.2)' : 'scale(1)',
                                }} 
                            />
                            {hoveredElement === 'season' && (
                                <div className="uplink-tooltip" style={{
                                    borderColor: getSeasonColor(worldState.currentSeason),
                                    boxShadow: `0 0 20px ${getSeasonColor(worldState.currentSeason)}60`,
                                }}>
                                    <span style={{ color: getSeasonColor(worldState.currentSeason) }}>
                                        {getSeasonDisplay(worldState.currentSeason)} • Day {dayInSeason}/{DAYS_PER_SEASON}
                                    </span>
                                    <span className="uplink-tooltip-caret" style={{ borderLeftColor: getSeasonColor(worldState.currentSeason) }} />
                                </div>
                            )}
                        </div>
                        
                        {/* Day Number */}
                        <span style={{
                            fontSize: '10px',
                            fontWeight: 'bold',
                            color: '#fff',
                            textShadow: `0 0 6px ${ACCENT_CYAN}`,
                        }}>D{worldState.cycleCount}</span>
                        
                        {/* Divider */}
                        <div style={{ width: '1px', height: '12px', background: `${ACCENT_CYAN}40` }} />
                        
                        {/* Time Emoji with Tooltip */}
                        <div
                            style={{ position: 'relative' }}
                            onMouseEnter={(e) => { e.stopPropagation(); setHoveredElement('time'); }}
                            onMouseLeave={() => setHoveredElement(null)}
                        >
                            <span style={{ 
                                fontSize: '12px',
                                transition: 'transform 0.2s ease',
                                display: 'inline-block',
                                transform: hoveredElement === 'time' ? 'scale(1.2)' : 'scale(1)',
                            }}>
                                {getTimeEmoji(worldState.timeOfDay)}
                            </span>
                            {hoveredElement === 'time' && (
                                <div className="uplink-tooltip" style={{
                                    borderColor: ACCENT_CYAN,
                                    boxShadow: `0 0 20px ${ACCENT_CYAN}60`,
                                }}>
                                    <span style={{ color: ACCENT_CYAN }}>{timeTooltipText}</span>
                                    <span className="uplink-tooltip-caret" style={{ borderLeftColor: ACCENT_CYAN }} />
                                </div>
                            )}
                        </div>
                        
                        {/* Weather with Tooltip */}
                        <div
                            style={{ position: 'relative' }}
                            onMouseEnter={(e) => { e.stopPropagation(); setHoveredElement('weather'); }}
                            onMouseLeave={() => setHoveredElement(null)}
                        >
                            <span style={{ 
                                fontSize: '12px',
                                transition: 'transform 0.2s ease',
                                display: 'inline-block',
                                transform: hoveredElement === 'weather' ? 'scale(1.2)' : 'scale(1)',
                            }}>
                                {getWeatherEmoji(displayWeather, isWinter)}
                            </span>
                            {hoveredElement === 'weather' && (
                                <div className="uplink-tooltip" style={{
                                    borderColor: ACCENT_CYAN,
                                    boxShadow: `0 0 20px ${ACCENT_CYAN}60`,
                                }}>
                                    <span style={{ color: '#9ca3af' }}>
                                        {getWeatherDisplay(displayWeather, isWinter)}
                                        {displayRainIntensity > 0 && ` (${Math.round(displayRainIntensity * 100)}%)`}
                                    </span>
                                    <span className="uplink-tooltip-caret" style={{ borderLeftColor: ACCENT_CYAN }} />
                                </div>
                            )}
                        </div>
                        
                        {/* Quest Progress (if active) with Tooltip */}
                        {!tutorialComplete && currentTutorialQuest && (
                            <>
                                <div style={{ width: '1px', height: '12px', background: `${ACCENT_CYAN}40` }} />
                                <div
                                    style={{ position: 'relative' }}
                                    onMouseEnter={(e) => { e.stopPropagation(); setHoveredElement('quest'); }}
                                    onMouseLeave={() => setHoveredElement(null)}
                                >
                                    <span style={{
                                        fontSize: '9px',
                                        color: anyProgressFlash ? ACCENT_GREEN : ACCENT_PURPLE,
                                        fontWeight: 'bold',
                                        textShadow: anyProgressFlash ? `0 0 10px ${ACCENT_GREEN}` : 'none',
                                        transition: 'all 0.2s ease',
                                        transform: hoveredElement === 'quest' ? 'scale(1.1)' : 'scale(1)',
                                        display: 'inline-block',
                                    }}>
                                        {tutorialProgressText}
                                    </span>
                                    {hoveredElement === 'quest' && (
                                        <div className="uplink-tooltip" style={{
                                            borderColor: ACCENT_PURPLE,
                                            boxShadow: `0 0 20px ${ACCENT_PURPLE}60`,
                                        }}>
                                            <span style={{ color: ACCENT_PURPLE }}>Press [J] for Directives</span>
                                            <span className="uplink-tooltip-caret" style={{ borderLeftColor: ACCENT_PURPLE }} />
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                        
                        {/* Notification Dot */}
                        {hasNewNotification && (
                            <span className="notification-dot-mini" />
                        )}
                        
                        {/* Expand Icon */}
                        <span style={{ fontSize: '8px', color: `${ACCENT_CYAN}60` }}>▼</span>
                    </div>
                </div>
                <style>{uplinkStyles}</style>
            </div>
        );
    }

    // ==================== EXPANDED VIEW ====================
    return (
        <div style={{
            position: 'fixed',
            top: '15px',
            right: '15px',
            zIndex: 50,
        }}>
            {/* Gradient border container */}
            <div className="uplink-glow-container" style={{
                padding: '2px',
                backgroundImage: anyProgressFlash ? `linear-gradient(135deg, ${ACCENT_GREEN}, ${ACCENT_CYAN}, ${ACCENT_GREEN})` : (pulseAnimation ? `linear-gradient(135deg, ${ACCENT_PURPLE}, ${ACCENT_CYAN}, ${ACCENT_PURPLE})` : UI_BORDER_GRADIENT),
                backgroundSize: '300% 300%',
                animation: anyProgressFlash ? 'progressFlashBorder 0.8s ease-out' : (pulseAnimation ? 'uplinkPulse 1s ease-in-out infinite' : 'uplinkGradientShift 4s ease infinite'),
                borderRadius: '10px',
            }}>
                {/* Main box */}
                <div className="uplink-box" style={{
                    position: 'relative',
                    background: UI_BG_COLOR,
                    borderRadius: '8px',
                    minWidth: '250px',
                    overflow: 'hidden',
                    fontFamily: "'Courier New', 'Consolas', monospace",
                }}>
                    {/* Scanlines */}
                    <div className="uplink-scanlines" />
                    
                    {/* Corner accents */}
                    <div className="uplink-corner top-left" />
                    <div className="uplink-corner top-right" />
                    <div className="uplink-corner bottom-left" />
                    <div className="uplink-corner bottom-right" />
                    
                    {/* Header bar */}
                    <div className="uplink-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px' }}>📡</span>
                            <span className="uplink-header-text">// NEURAL UPLINK</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="uplink-header-dots">
                                <span className="uplink-dot green" />
                                <span className="uplink-dot cyan" />
                                <span className="uplink-dot purple" />
                            </div>
                            <div
                                onClick={(e) => { e.stopPropagation(); toggleMinimized(); }}
                                className="uplink-minimize"
                            >
                                ▲
                            </div>
                        </div>
                    </div>
                    
                    {/* Content */}
                    <div style={{ padding: '12px 16px' }}>
                        {/* Day/Time Section */}
                        <div className="uplink-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        color: '#fff',
                                        textShadow: `0 0 10px ${ACCENT_CYAN}`,
                                    }}>Day {worldState.cycleCount}</span>
                                    <span style={{ color: `${ACCENT_CYAN}40` }}>•</span>
                                    <span style={{ fontSize: '10px', color: '#9ca3af' }}>Year {worldState.year}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <img src={getSeasonIcon(worldState.currentSeason)} alt="" style={{ width: '16px', height: '16px' }} />
                                    <span style={{
                                        fontSize: '10px',
                                        color: getSeasonColor(worldState.currentSeason),
                                        fontWeight: 'bold',
                                        textShadow: `0 0 6px ${getSeasonColor(worldState.currentSeason)}80`,
                                    }}>{getSeasonDisplay(worldState.currentSeason)}</span>
                                    <span style={{ fontSize: '8px', color: '#6b7280' }}>
                                        {dayInSeason}/{DAYS_PER_SEASON}
                                    </span>
                                </div>
                            </div>
                            
                            {/* Time of Day with Progress */}
                            <div style={{ marginBottom: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '9px', color: ACCENT_CYAN, letterSpacing: '1px' }}>
                                        {getTimeOfDayDisplay(worldState.timeOfDay).toUpperCase()}
                                        {worldState.isFullMoon && (worldState.timeOfDay.tag === 'Night' || worldState.timeOfDay.tag === 'Midnight') && ' • FULL MOON'}
                                    </span>
                                    <span style={{ fontSize: '8px', color: '#6b7280' }}>Day {worldState.dayOfYear}/{DAYS_PER_YEAR}</span>
                                </div>
                                
                                {/* Day Cycle Progress Bar */}
                                <div className="uplink-progress-bar">
                                    <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        background: getBackgroundGradient(),
                                        opacity: 0.8,
                                    }} />
                                    <div className="uplink-progress-indicator" style={{ left: dialPosition }} />
                                </div>
                            </div>
                            
                            {/* Weather */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '14px' }}>{getWeatherEmoji(displayWeather, isWinter)}</span>
                                <span style={{ fontSize: '10px', color: '#9ca3af' }}>{getWeatherDisplay(displayWeather, isWinter)}</span>
                                {displayRainIntensity > 0 && (
                                    <span style={{ fontSize: '9px', color: ACCENT_CYAN }}>
                                        {Math.round(displayRainIntensity * 100)}%
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        {/* Divider */}
                        <div style={{
                            height: '1px',
                            background: `linear-gradient(90deg, transparent, ${ACCENT_CYAN}40, transparent)`,
                            margin: '10px 0',
                        }} />
                        
                        {/* Directives Section */}
                        <div
                            className="uplink-directives"
                            onClick={handleClick}
                            style={{ cursor: onOpenQuestsPanel ? 'pointer' : 'default' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '9px', color: ACCENT_CYAN, letterSpacing: '1px' }}>DIRECTIVES</span>
                                <span style={{
                                    fontSize: '8px',
                                    color: ACCENT_PURPLE,
                                    padding: '2px 6px',
                                    background: `${ACCENT_PURPLE}15`,
                                    borderRadius: '3px',
                                    border: `1px solid ${ACCENT_PURPLE}30`,
                                }}>[J]</span>
                            </div>
                            
                            {/* Tutorial Progress */}
                            {!tutorialComplete && currentTutorialQuest && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {/* Primary Objective */}
                                    <div className="uplink-objective" style={{
                                        borderColor: progressFlash ? ACCENT_GREEN : `${ACCENT_GREEN}30`,
                                        boxShadow: progressFlash ? `0 0 15px ${ACCENT_GREEN}50` : 'none',
                                    }}>
                                        <span className="uplink-objective-dot" style={{
                                            backgroundColor: ACCENT_GREEN,
                                            transform: progressFlash ? 'scale(1.5)' : 'scale(1)',
                                            boxShadow: progressFlash ? `0 0 12px ${ACCENT_GREEN}` : `0 0 6px ${ACCENT_GREEN}`,
                                        }} />
                                        <span style={{
                                            fontSize: '9px',
                                            color: progressFlash ? ACCENT_GREEN : ACCENT_PURPLE,
                                            textShadow: progressFlash ? `0 0 10px ${ACCENT_GREEN}` : 'none',
                                            transition: 'all 0.2s ease',
                                        }}>
                                            {truncateLabel(getObjectiveLabel(currentTutorialQuest, 'primary'))}: {tutorialProgressText}
                                        </span>
                                    </div>
                                    
                                    {/* Secondary Objective */}
                                    {hasMultipleObjectives && (
                                        <div className="uplink-objective" style={{
                                            borderColor: secondaryProgressFlash ? ACCENT_CYAN : `${ACCENT_CYAN}30`,
                                            boxShadow: secondaryProgressFlash ? `0 0 15px ${ACCENT_CYAN}50` : 'none',
                                        }}>
                                            <span className="uplink-objective-dot" style={{
                                                backgroundColor: ACCENT_CYAN,
                                                transform: secondaryProgressFlash ? 'scale(1.5)' : 'scale(1)',
                                                boxShadow: secondaryProgressFlash ? `0 0 12px ${ACCENT_CYAN}` : `0 0 6px ${ACCENT_CYAN}`,
                                            }} />
                                            <span style={{
                                                fontSize: '9px',
                                                color: secondaryProgressFlash ? ACCENT_CYAN : ACCENT_CYAN,
                                                textShadow: secondaryProgressFlash ? `0 0 10px ${ACCENT_CYAN}` : 'none',
                                                transition: 'all 0.2s ease',
                                            }}>
                                                {truncateLabel(getObjectiveLabel(currentTutorialQuest, 'secondary'))}: {secondaryProgressText}
                                            </span>
                                        </div>
                                    )}
                                    
                                    {/* Tertiary Objective */}
                                    {hasThreeObjectives && (
                                        <div className="uplink-objective" style={{
                                            borderColor: tertiaryProgressFlash ? ACCENT_PINK : `${ACCENT_PINK}30`,
                                            boxShadow: tertiaryProgressFlash ? `0 0 15px ${ACCENT_PINK}50` : 'none',
                                        }}>
                                            <span className="uplink-objective-dot" style={{
                                                backgroundColor: ACCENT_PINK,
                                                transform: tertiaryProgressFlash ? 'scale(1.5)' : 'scale(1)',
                                                boxShadow: tertiaryProgressFlash ? `0 0 12px ${ACCENT_PINK}` : `0 0 6px ${ACCENT_PINK}`,
                                            }} />
                                            <span style={{
                                                fontSize: '9px',
                                                color: tertiaryProgressFlash ? ACCENT_PINK : ACCENT_PINK,
                                                textShadow: tertiaryProgressFlash ? `0 0 10px ${ACCENT_PINK}` : 'none',
                                                transition: 'all 0.2s ease',
                                            }}>
                                                {truncateLabel(getObjectiveLabel(currentTutorialQuest, 'tertiary'))}: {tertiaryProgressText}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* Tutorial Complete */}
                            {tutorialComplete && (
                                <div className="uplink-objective" style={{ borderColor: `#6b728030` }}>
                                    <span className="uplink-objective-dot" style={{ backgroundColor: '#6b7280', boxShadow: 'none' }} />
                                    <span style={{ fontSize: '9px', color: '#6b7280' }}>CALIBRATION COMPLETE</span>
                                </div>
                            )}
                            
                            {/* Daily Quests */}
                            {activeDailyQuestInfo.active > 0 && (
                                <div className="uplink-objective" style={{ borderColor: `${ACCENT_PURPLE}30`, marginTop: '4px' }}>
                                    <span className="uplink-objective-dot" style={{ backgroundColor: ACCENT_PURPLE, boxShadow: `0 0 6px ${ACCENT_PURPLE}` }} />
                                    <span style={{ fontSize: '9px', color: '#9ca3af' }}>
                                        DAILY: {activeDailyQuestInfo.completed}/{activeDailyQuestInfo.total}
                                    </span>
                                </div>
                            )}
                            
                            {/* No Active Quests */}
                            {!hasActiveQuest && tutorialComplete && activeDailyQuestInfo.active === 0 && (
                                <div style={{ fontSize: '9px', color: '#6b7280', fontStyle: 'italic', padding: '4px 0' }}>
                                    All clear, Agent
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Notification indicator */}
                    {hasNewNotification && <div className="notification-dot" />}
                </div>
            </div>
            <style>{uplinkStyles}</style>
        </div>
    );
};

// CSS Styles
const uplinkStyles = `
    @keyframes uplinkGradientShift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }
    
    @keyframes uplinkPulse {
        0% { box-shadow: 0 0 15px rgba(192, 132, 252, 0.4); }
        50% { box-shadow: 0 0 35px rgba(192, 132, 252, 0.8); }
        100% { box-shadow: 0 0 15px rgba(192, 132, 252, 0.4); }
    }
    
    @keyframes progressFlashBorder {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; box-shadow: 0 0 30px rgba(74, 222, 128, 0.6); }
        100% { background-position: 0% 50%; }
    }
    
    @keyframes uplinkScanline {
        0% { transform: translateY(-100%); }
        100% { transform: translateY(100%); }
    }
    
    @keyframes uplinkDotPulse {
        0%, 100% { transform: scale(1); opacity: 0.7; }
        50% { transform: scale(1.3); opacity: 1; }
    }
    
    @keyframes dialPulse {
        0%, 100% { box-shadow: 0 0 8px rgba(255, 255, 255, 0.9), 0 0 15px rgba(0, 212, 255, 0.8); }
        50% { box-shadow: 0 0 12px rgba(255, 255, 255, 1), 0 0 25px rgba(0, 212, 255, 1); }
    }
    
    @keyframes notificationPulse {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.2); opacity: 0.8; }
        100% { transform: scale(1); opacity: 1; }
    }
    
    .uplink-glow-container {
        box-shadow: 0 0 20px rgba(0, 212, 255, 0.3), inset 0 0 15px rgba(0, 212, 255, 0.1);
        transition: all 0.3s ease;
    }
    
    .uplink-glow-container:hover {
        box-shadow: 0 0 30px rgba(0, 212, 255, 0.5), inset 0 0 20px rgba(0, 212, 255, 0.15);
    }
    
    .uplink-glow-container.minimized:hover {
        transform: translateY(-2px);
    }
    
    .uplink-scanlines {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 212, 255, 0.02) 2px,
            rgba(0, 212, 255, 0.02) 4px
        );
        pointer-events: none;
        z-index: 10;
    }
    
    .uplink-scanlines::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 100%;
        background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(0, 212, 255, 0.06) 50%,
            transparent 100%
        );
        animation: uplinkScanline 4s linear infinite;
        pointer-events: none;
    }
    
    .uplink-corner {
        position: absolute;
        width: 10px;
        height: 10px;
        border: 2px solid #00d4ff;
        z-index: 5;
    }
    
    .uplink-corner.top-left { top: 4px; left: 4px; border-right: none; border-bottom: none; }
    .uplink-corner.top-right { top: 4px; right: 4px; border-left: none; border-bottom: none; }
    .uplink-corner.bottom-left { bottom: 4px; left: 4px; border-right: none; border-top: none; }
    .uplink-corner.bottom-right { bottom: 4px; right: 4px; border-left: none; border-top: none; }
    
    .uplink-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 14px;
        background: rgba(0, 212, 255, 0.08);
        border-bottom: 1px solid rgba(0, 212, 255, 0.25);
    }
    
    .uplink-header-text {
        font-size: 9px;
        color: #00d4ff;
        letter-spacing: 1.5px;
        text-transform: uppercase;
    }
    
    .uplink-header-dots {
        display: flex;
        gap: 5px;
    }
    
    .uplink-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
    }
    
    .uplink-dot.green {
        background: #4ade80;
        animation: uplinkDotPulse 1s ease-in-out infinite;
    }
    
    .uplink-dot.cyan {
        background: #00d4ff;
        animation: uplinkDotPulse 1s ease-in-out infinite 0.2s;
    }
    
    .uplink-dot.purple {
        background: #c084fc;
        animation: uplinkDotPulse 1s ease-in-out infinite 0.4s;
    }
    
    .uplink-minimize {
        font-size: 8px;
        color: rgba(0, 212, 255, 0.5);
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 3px;
        transition: all 0.2s ease;
    }
    
    .uplink-minimize:hover {
        color: #00d4ff;
        background: rgba(0, 212, 255, 0.15);
    }
    
    .uplink-progress-bar {
        position: relative;
        height: 14px;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 7px;
        overflow: hidden;
        border: 1px solid rgba(0, 212, 255, 0.3);
    }
    
    .uplink-progress-indicator {
        position: absolute;
        top: 0;
        transform: translateX(-50%);
        width: 4px;
        height: 100%;
        background: linear-gradient(to bottom, #fff, #00d4ff, #fff);
        border-radius: 2px;
        animation: dialPulse 2s ease-in-out infinite;
        z-index: 5;
    }
    
    .uplink-directives {
        transition: all 0.2s ease;
        border-radius: 6px;
        padding: 4px;
        margin: -4px;
    }
    
    .uplink-directives:hover {
        background: rgba(0, 212, 255, 0.05);
    }
    
    .uplink-objective {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px;
        background: rgba(74, 222, 128, 0.08);
        border: 1px solid rgba(74, 222, 128, 0.3);
        border-radius: 4px;
        transition: all 0.2s ease;
    }
    
    .uplink-objective-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
        transition: all 0.2s ease;
    }
    
    .notification-dot {
        position: absolute;
        top: -5px;
        right: -5px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #f43f5e;
        box-shadow: 0 0 12px rgba(244, 63, 94, 0.7);
        animation: notificationPulse 1.5s ease-in-out infinite;
        border: 2px solid rgba(15, 25, 20, 0.9);
        z-index: 20;
    }
    
    .notification-dot-mini {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #f43f5e;
        box-shadow: 0 0 8px rgba(244, 63, 94, 0.7);
        animation: notificationPulse 1.5s ease-in-out infinite;
    }
    
    @keyframes tooltipFadeIn {
        0% { opacity: 0; }
        100% { opacity: 1; }
    }
    
    .uplink-tooltip {
        position: absolute;
        top: 50%;
        right: calc(100% + 10px);
        transform: translateY(-50%);
        padding: 6px 12px;
        background: linear-gradient(135deg, rgba(15, 25, 20, 0.98) 0%, rgba(20, 35, 30, 0.98) 100%);
        border: 2px solid #00d4ff;
        border-radius: 6px;
        backdrop-filter: blur(10px);
        white-space: nowrap;
        font-size: 9px;
        font-family: 'Courier New', 'Consolas', monospace;
        letter-spacing: 0.5px;
        z-index: 100;
        pointer-events: none;
        animation: tooltipFadeIn 0.15s ease-out forwards;
    }
    
    .uplink-tooltip-caret {
        position: absolute;
        top: 50%;
        right: -8px;
        transform: translateY(-50%);
        width: 0;
        height: 0;
        border-style: solid;
        border-width: 6px 0 6px 6px;
        border-color: transparent transparent transparent #00d4ff;
    }
`;

export default DayNightCycleTracker;
