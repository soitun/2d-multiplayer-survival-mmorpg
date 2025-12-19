import React, { useState } from 'react';
import { useDebug } from '../contexts/DebugContext';
import { WorldState as SpacetimeDBWorldState } from '../generated';
import { DbConnection } from '../generated';
import springIcon from '../assets/ui/spring.png';
import summerIcon from '../assets/ui/summer.png';
import autumnIcon from '../assets/ui/autumn.png';
import winterIcon from '../assets/ui/winter.png';
import clockIcon from '../assets/ui/clock.png';

interface DebugPanelProps {
    localPlayer: any;
    worldState: SpacetimeDBWorldState | null;
    connection: DbConnection | null;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ localPlayer, worldState, connection }) => {
    const { showAutotileDebug, toggleAutotileDebug, showChunkBoundaries, toggleChunkBoundaries, showInteriorDebug, toggleInteriorDebug, showCollisionDebug, toggleCollisionDebug, showAttackRangeDebug, toggleAttackRangeDebug, showYSortDebug, toggleYSortDebug } = useDebug();
    const [isMinimized, setIsMinimized] = useState(false);

    const cycleWeather = (direction: 'forward' | 'backward') => {
        const weatherTypes = ['Clear', 'LightRain', 'ModerateRain', 'HeavyRain', 'HeavyStorm'];
        const currentWeather = worldState?.currentWeather?.tag;
        const currentIndex = weatherTypes.indexOf(currentWeather || 'Clear');
        
        let nextIndex: number;
        if (direction === 'forward') {
            nextIndex = (currentIndex + 1) % weatherTypes.length;
        } else {
            nextIndex = (currentIndex - 1 + weatherTypes.length) % weatherTypes.length;
        }
        
        const nextWeather = weatherTypes[nextIndex];

        if (connection) {
            try {
                (connection.reducers as any).debugSetWeather(nextWeather);
            } catch (error) {
                console.warn('Debug weather function not available (production build?):', error);
            }
        }
    };

    const cycleTime = (direction: 'forward' | 'backward') => {
        const timeOrder = ['Night', 'Midnight', 'TwilightMorning', 'Dawn', 'Morning', 'Noon', 'Afternoon', 'Dusk', 'TwilightEvening'];
        const currentTimeOfDay = worldState?.timeOfDay?.tag || 'Noon';
        const currentIndex = timeOrder.indexOf(currentTimeOfDay);
        
        let nextIndex: number;
        if (direction === 'forward') {
            nextIndex = (currentIndex + 1) % timeOrder.length;
        } else {
            nextIndex = (currentIndex - 1 + timeOrder.length) % timeOrder.length;
        }
        
        const nextTime = timeOrder[nextIndex];

        if (connection) {
            try {
                (connection.reducers as any).debugSetTime(nextTime);
            } catch (error) {
                console.warn('Debug time function not available (production build?):', error);
            }
        }
    };

    const cycleSeason = (direction: 'forward' | 'backward') => {
        const seasonOrder = ['Spring', 'Summer', 'Autumn', 'Winter'];
        const currentSeason = worldState?.currentSeason?.tag || 'Spring';
        const currentIndex = seasonOrder.indexOf(currentSeason);
        
        let nextIndex: number;
        if (direction === 'forward') {
            nextIndex = (currentIndex + 1) % seasonOrder.length;
        } else {
            nextIndex = (currentIndex - 1 + seasonOrder.length) % seasonOrder.length;
        }
        
        const nextSeason = seasonOrder[nextIndex];

        if (connection) {
            try {
                (connection.reducers as any).debugSetSeason(nextSeason);
            } catch (error) {
                console.warn('Debug season function not available (production build?):', error);
            }
        }
    };

    const getWeatherColor = () => {
        const weather = worldState?.currentWeather?.tag;
        switch (weather) {
            case 'Clear': return { bg: 'linear-gradient(135deg, rgba(76, 175, 80, 0.3), rgba(56, 142, 60, 0.4))', color: '#4CAF50', border: '1px solid #4CAF50' };
            case 'LightRain': return { bg: 'linear-gradient(135deg, rgba(3, 169, 244, 0.3), rgba(2, 136, 209, 0.4))', color: '#03A9F4', border: '1px solid #03A9F4' };
            case 'ModerateRain': return { bg: 'linear-gradient(135deg, rgba(33, 150, 243, 0.3), rgba(25, 118, 210, 0.4))', color: '#2196F3', border: '1px solid #2196F3' };
            case 'HeavyRain': return { bg: 'linear-gradient(135deg, rgba(63, 81, 181, 0.3), rgba(48, 63, 159, 0.4))', color: '#3F51B5', border: '1px solid #3F51B5' };
            case 'HeavyStorm': return { bg: 'linear-gradient(135deg, rgba(156, 39, 176, 0.3), rgba(123, 31, 162, 0.4))', color: '#9C27B0', border: '1px solid #9C27B0' };
            default: return { bg: 'linear-gradient(135deg, rgba(255, 152, 0, 0.3), rgba(245, 124, 0, 0.4))', color: '#FF9800', border: '1px solid #FF9800' };
        }
    };

    const getWeatherLabel = () => {
        const weather = worldState?.currentWeather?.tag;
        switch (weather) {
            case 'Clear': return 'CLEAR';
            case 'LightRain': return 'LIGHT';
            case 'ModerateRain': return 'MODERATE';
            case 'HeavyRain': return 'HEAVY';
            case 'HeavyStorm': return 'STORM';
            default: return 'UNKNOWN';
        }
    };

    const getTimeColor = () => {
        const timeOfDay = worldState?.timeOfDay?.tag;
        if (timeOfDay === 'Night' || timeOfDay === 'Midnight') 
            return { bg: 'linear-gradient(135deg, rgba(63, 81, 181, 0.3), rgba(48, 63, 159, 0.4))', color: '#7986CB', border: '1px solid #7986CB' };
        if (timeOfDay === 'Dawn' || timeOfDay === 'Dusk') 
            return { bg: 'linear-gradient(135deg, rgba(255, 152, 0, 0.3), rgba(245, 124, 0, 0.4))', color: '#FF9800', border: '1px solid #FF9800' };
        if (timeOfDay === 'TwilightMorning' || timeOfDay === 'TwilightEvening') 
            return { bg: 'linear-gradient(135deg, rgba(156, 39, 176, 0.3), rgba(123, 31, 162, 0.4))', color: '#BA68C8', border: '1px solid #BA68C8' };
        return { bg: 'linear-gradient(135deg, rgba(255, 235, 59, 0.3), rgba(251, 192, 45, 0.4))', color: '#FFD54F', border: '1px solid #FFD54F' };
    };

    const getSeasonColor = () => {
        const season = worldState?.currentSeason?.tag;
        switch (season) {
            case 'Spring': return { bg: 'linear-gradient(135deg, rgba(129, 199, 132, 0.3), rgba(102, 187, 106, 0.4))', color: '#81C784', border: '1px solid #81C784', icon: springIcon };
            case 'Summer': return { bg: 'linear-gradient(135deg, rgba(255, 213, 79, 0.3), rgba(255, 193, 7, 0.4))', color: '#FFD54F', border: '1px solid #FFD54F', icon: summerIcon };
            case 'Autumn': return { bg: 'linear-gradient(135deg, rgba(255, 138, 101, 0.3), rgba(255, 112, 67, 0.4))', color: '#FF8A65', border: '1px solid #FF8A65', icon: autumnIcon };
            case 'Winter': return { bg: 'linear-gradient(135deg, rgba(144, 202, 249, 0.3), rgba(100, 181, 246, 0.4))', color: '#90CAF9', border: '1px solid #90CAF9', icon: winterIcon };
            default: return { bg: 'linear-gradient(135deg, rgba(129, 199, 132, 0.3), rgba(102, 187, 106, 0.4))', color: '#81C784', border: '1px solid #81C784', icon: springIcon };
        }
    };

    const weatherColors = getWeatherColor();
    const timeColors = getTimeColor();
    const seasonColors = getSeasonColor();

    return (
        <div style={{
            position: 'absolute',
            top: '70px',
            left: '15px',
            zIndex: 998,
            background: 'linear-gradient(145deg, rgba(15, 30, 50, 0.95), rgba(10, 20, 40, 0.98))',
            border: '2px solid #00d4ff',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '11px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: '0 0 20px rgba(0, 212, 255, 0.3), inset 0 0 15px rgba(0, 212, 255, 0.1)',
            fontFamily: '"Press Start 2P", monospace',
            minWidth: '240px'
        }}>
            {/* Header with Minimize Button */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
                borderBottom: '1px solid rgba(0, 212, 255, 0.3)',
                paddingBottom: '6px'
            }}>
                <div style={{
                    fontSize: '11px',
                    color: '#00d4ff',
                    textShadow: '0 0 8px rgba(0, 212, 255, 0.8)',
                    letterSpacing: '1px',
                    flex: 1,
                    textAlign: 'center'
                }}>
                    DEBUG CONSOLE
                </div>
                <button
                    onClick={() => setIsMinimized(!isMinimized)}
                    onFocus={(e) => e.currentTarget.blur()}
                    style={{
                        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 170, 255, 0.3))',
                        color: '#00d4ff',
                        border: '1px solid rgba(0, 212, 255, 0.4)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        fontFamily: 'inherit',
                        minWidth: '28px'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 212, 255, 0.3), rgba(0, 170, 255, 0.4))';
                        e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 212, 255, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 170, 255, 0.3))';
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                >
                    {isMinimized ? '▼' : '▲'}
                </button>
            </div>

            {!isMinimized && (
                <>
                    {/* Tileset Toggle */}
                    <button
                        onClick={(e) => {
                            toggleAutotileDebug();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showAutotileDebug 
                                ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.3), rgba(0, 170, 255, 0.4))' 
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showAutotileDebug ? '#00ffff' : '#ff6b6b',
                            border: showAutotileDebug ? '1px solid #00d4ff' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showAutotileDebug ? '0 0 5px #00ffff' : '0 0 5px #ff6b6b',
                            boxShadow: showAutotileDebug 
                                ? '0 0 10px rgba(0, 212, 255, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showAutotileDebug 
                                ? '0 0 15px rgba(0, 212, 255, 0.5)' 
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showAutotileDebug 
                                ? '0 0 10px rgba(0, 212, 255, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        TILESET: {showAutotileDebug ? 'ON' : 'OFF'}
                    </button>

                    {/* Chunk Boundaries Toggle */}
                    <button
                        onClick={(e) => {
                            toggleChunkBoundaries();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showChunkBoundaries 
                                ? 'linear-gradient(135deg, rgba(255, 165, 0, 0.3), rgba(255, 140, 0, 0.4))' 
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showChunkBoundaries ? '#ffaa00' : '#ff6b6b',
                            border: showChunkBoundaries ? '1px solid #ff8800' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showChunkBoundaries ? '0 0 5px #ffaa00' : '0 0 5px #ff6b6b',
                            boxShadow: showChunkBoundaries 
                                ? '0 0 10px rgba(255, 165, 0, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showChunkBoundaries 
                                ? '0 0 15px rgba(255, 165, 0, 0.5)' 
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showChunkBoundaries 
                                ? '0 0 10px rgba(255, 165, 0, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        CHUNKS: {showChunkBoundaries ? 'ON' : 'OFF'}
                    </button>

                    {/* Interior Debug Toggle */}
                    <button
                        onClick={(e) => {
                            toggleInteriorDebug();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showInteriorDebug 
                                ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.3), rgba(0, 200, 100, 0.4))' 
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showInteriorDebug ? '#00ff88' : '#ff6b6b',
                            border: showInteriorDebug ? '1px solid #00ff88' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showInteriorDebug ? '0 0 5px #00ff88' : '0 0 5px #ff6b6b',
                            boxShadow: showInteriorDebug 
                                ? '0 0 10px rgba(0, 255, 136, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showInteriorDebug 
                                ? '0 0 15px rgba(0, 255, 136, 0.5)' 
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showInteriorDebug 
                                ? '0 0 10px rgba(0, 255, 136, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        INTERIOR: {showInteriorDebug ? 'ON' : 'OFF'}
                    </button>

                    {/* Collision Debug Toggle */}
                    <button
                        onClick={(e) => {
                            toggleCollisionDebug();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showCollisionDebug 
                                ? 'linear-gradient(135deg, rgba(255, 0, 128, 0.3), rgba(200, 0, 100, 0.4))' 
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showCollisionDebug ? '#ff0080' : '#ff6b6b',
                            border: showCollisionDebug ? '1px solid #ff0080' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showCollisionDebug ? '0 0 5px #ff0080' : '0 0 5px #ff6b6b',
                            boxShadow: showCollisionDebug 
                                ? '0 0 10px rgba(255, 0, 128, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showCollisionDebug 
                                ? '0 0 15px rgba(255, 0, 128, 0.5)' 
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showCollisionDebug 
                                ? '0 0 10px rgba(255, 0, 128, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        COLLISION: {showCollisionDebug ? 'ON' : 'OFF'}
                    </button>

                    {/* Attack Range Debug Toggle */}
                    <button
                        onClick={(e) => {
                            toggleAttackRangeDebug();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showAttackRangeDebug 
                                ? 'linear-gradient(135deg, rgba(255, 69, 0, 0.3), rgba(200, 50, 0, 0.4))' 
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showAttackRangeDebug ? '#ff4500' : '#ff6b6b',
                            border: showAttackRangeDebug ? '1px solid #ff4500' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showAttackRangeDebug ? '0 0 5px #ff4500' : '0 0 5px #ff6b6b',
                            boxShadow: showAttackRangeDebug 
                                ? '0 0 10px rgba(255, 69, 0, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showAttackRangeDebug 
                                ? '0 0 15px rgba(255, 69, 0, 0.5)' 
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showAttackRangeDebug 
                                ? '0 0 10px rgba(255, 69, 0, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        ATK RANGE: {showAttackRangeDebug ? 'ON' : 'OFF'}
                    </button>

                    {/* Y-Sort Debug Toggle */}
                    <button
                        onClick={(e) => {
                            toggleYSortDebug();
                            e.currentTarget.blur();
                        }}
                        onFocus={(e) => e.currentTarget.blur()}
                        style={{
                            background: showYSortDebug 
                                ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(200, 170, 0, 0.4))' 
                                : 'linear-gradient(135deg, rgba(60, 30, 30, 0.6), rgba(40, 20, 20, 0.7))',
                            color: showYSortDebug ? '#ffd700' : '#ff6b6b',
                            border: showYSortDebug ? '1px solid #ffd700' : '1px solid #ff6b6b',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textShadow: showYSortDebug ? '0 0 5px #ffd700' : '0 0 5px #ff6b6b',
                            boxShadow: showYSortDebug 
                                ? '0 0 10px rgba(255, 215, 0, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)',
                            fontFamily: 'inherit',
                            letterSpacing: '0.5px'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = showYSortDebug 
                                ? '0 0 15px rgba(255, 215, 0, 0.5)' 
                                : '0 0 15px rgba(255, 107, 107, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = showYSortDebug 
                                ? '0 0 10px rgba(255, 215, 0, 0.3)' 
                                : '0 0 10px rgba(255, 107, 107, 0.2)';
                        }}
                    >
                        Y-SORT: {showYSortDebug ? 'ON' : 'OFF'}
                    </button>

                    {/* Position Display */}
                    {localPlayer && (
                        <div style={{
                            fontSize: '10px',
                            color: '#00ff88',
                            textShadow: '0 0 6px rgba(0, 255, 136, 0.6)',
                            background: 'rgba(0, 255, 136, 0.1)',
                            border: '1px solid rgba(0, 255, 136, 0.3)',
                            borderRadius: '4px',
                            padding: '8px 10px',
                            letterSpacing: '0.5px',
                            textAlign: 'center'
                        }}>
                            <div style={{ marginBottom: '4px', opacity: 0.8 }}>📍 POSITION</div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', fontSize: '10px' }}>
                                <span>X:{Math.round(localPlayer.positionX)}</span>
                                <span>Y:{Math.round(localPlayer.positionY)}</span>
                            </div>
                        </div>
                    )}

                    {/* Weather Control */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Left Arrow */}
                        <button
                            onClick={(e) => {
                                cycleWeather('backward');
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))',
                                color: '#aaaaaa',
                                border: '1px solid rgba(170, 170, 170, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                minWidth: '32px',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 120, 120, 0.4), rgba(100, 100, 100, 0.5))';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))';
                                e.currentTarget.style.color = '#aaaaaa';
                            }}
                        >
                            ←
                        </button>
                        
                        {/* Weather Display Button (non-clickable) */}
                        <div
                            style={{
                                background: weatherColors.bg,
                                color: weatherColors.color,
                                border: weatherColors.border,
                                padding: '8px 12px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'default',
                                textShadow: '0 0 5px currentColor',
                                boxShadow: '0 0 10px rgba(255, 255, 255, 0.2)',
                                fontFamily: 'inherit',
                                letterSpacing: '0.5px',
                                flex: 1,
                                textAlign: 'center'
                            }}
                        >
                            ☁️ {getWeatherLabel()}
                        </div>
                        
                        {/* Right Arrow */}
                        <button
                            onClick={(e) => {
                                cycleWeather('forward');
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))',
                                color: '#aaaaaa',
                                border: '1px solid rgba(170, 170, 170, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                minWidth: '32px',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 120, 120, 0.4), rgba(100, 100, 100, 0.5))';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))';
                                e.currentTarget.style.color = '#aaaaaa';
                            }}
                        >
                            →
                        </button>
                    </div>

                    {/* Time Control */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Left Arrow */}
                        <button
                            onClick={(e) => {
                                cycleTime('backward');
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))',
                                color: '#aaaaaa',
                                border: '1px solid rgba(170, 170, 170, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                minWidth: '32px',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 120, 120, 0.4), rgba(100, 100, 100, 0.5))';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))';
                                e.currentTarget.style.color = '#aaaaaa';
                            }}
                        >
                            ←
                        </button>
                        
                        {/* Time Display Button (non-clickable) */}
                        <div
                            style={{
                                background: timeColors.bg,
                                color: timeColors.color,
                                border: timeColors.border,
                                padding: '8px 12px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'default',
                                textShadow: '0 0 5px currentColor',
                                boxShadow: '0 0 10px rgba(255, 255, 255, 0.2)',
                                fontFamily: 'inherit',
                                letterSpacing: '0.5px',
                                flex: 1,
                                textAlign: 'center',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px'
                            }}
                        >
                            <img 
                                src={clockIcon} 
                                alt="Time"
                                style={{ width: '14px', height: '14px', objectFit: 'contain', verticalAlign: 'middle' }}
                            />
                            {worldState?.timeOfDay?.tag || 'UNKNOWN'}
                        </div>
                        
                        {/* Right Arrow */}
                        <button
                            onClick={(e) => {
                                cycleTime('forward');
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))',
                                color: '#aaaaaa',
                                border: '1px solid rgba(170, 170, 170, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                minWidth: '32px',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 120, 120, 0.4), rgba(100, 100, 100, 0.5))';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))';
                                e.currentTarget.style.color = '#aaaaaa';
                            }}
                        >
                            →
                        </button>
                    </div>

                    {/* Season Control */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Left Arrow */}
                        <button
                            onClick={(e) => {
                                cycleSeason('backward');
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))',
                                color: '#aaaaaa',
                                border: '1px solid rgba(170, 170, 170, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                minWidth: '32px',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 120, 120, 0.4), rgba(100, 100, 100, 0.5))';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))';
                                e.currentTarget.style.color = '#aaaaaa';
                            }}
                        >
                            ←
                        </button>
                        
                        {/* Season Display Button (non-clickable) */}
                        <div
                            style={{
                                background: seasonColors.bg,
                                color: seasonColors.color,
                                border: seasonColors.border,
                                padding: '8px 12px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'default',
                                textShadow: '0 0 5px currentColor',
                                boxShadow: '0 0 10px rgba(255, 255, 255, 0.2)',
                                fontFamily: 'inherit',
                                letterSpacing: '0.5px',
                                flex: 1,
                                textAlign: 'center'
                            }}
                        >
                            <img 
                                src={seasonColors.icon} 
                                alt={worldState?.currentSeason?.tag || 'SPRING'}
                                style={{ width: '14px', height: '14px', objectFit: 'contain', verticalAlign: 'middle', marginRight: '4px' }}
                            />
                            {worldState?.currentSeason?.tag || 'SPRING'}
                        </div>
                        
                        {/* Right Arrow */}
                        <button
                            onClick={(e) => {
                                cycleSeason('forward');
                                e.currentTarget.blur();
                            }}
                            onFocus={(e) => e.currentTarget.blur()}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))',
                                color: '#aaaaaa',
                                border: '1px solid rgba(170, 170, 170, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                cursor: 'pointer',
                                minWidth: '32px',
                                transition: 'all 0.2s ease',
                                fontFamily: 'inherit'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(120, 120, 120, 0.4), rgba(100, 100, 100, 0.5))';
                                e.currentTarget.style.color = '#ffffff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.4))';
                                e.currentTarget.style.color = '#aaaaaa';
                            }}
                        >
                            →
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default DebugPanel;

