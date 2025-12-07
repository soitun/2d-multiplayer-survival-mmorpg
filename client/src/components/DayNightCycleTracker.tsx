import React, { useState, useMemo } from 'react';
import { WorldState, TimeOfDay, Season, Player } from '../generated';
import { calculateChunkIndex } from '../utils/chunkUtils';
import springIcon from '../assets/ui/spring.png';
import summerIcon from '../assets/ui/summer.png';
import autumnIcon from '../assets/ui/autumn.png';
import winterIcon from '../assets/ui/winter.png';
import clockIcon from '../assets/ui/clock.png';

// Style constants
const UI_BG_COLOR = 'linear-gradient(135deg, rgba(30, 15, 50, 0.9), rgba(20, 10, 40, 0.95))';
const UI_BORDER_COLOR = '#00aaff';
const UI_SHADOW = '0 0 20px rgba(0, 170, 255, 0.4), inset 0 0 10px rgba(0, 170, 255, 0.1)';
const UI_FONT_FAMILY = '"Press Start 2P", cursive';

// Colors for different times of day
const COLORS = {
  dawn: '#ff9e6d',
  morning: '#ffde59',
  noon: '#ffff99',
  afternoon: '#ffde59',
  dusk: '#ff7e45',
  night: '#3b4a78',
  midnight: '#1a1a40',
  fullMoon: '#e6e6fa',
  twilightMorning: '#c8a2c8', // Lilac/light purple for morning twilight
  twilightEvening: '#8a2be2'  // Blue-violet for evening twilight
};

// Colors for different seasons
const SEASON_COLORS = {
  spring: '#90EE90', // Light green
  summer: '#FFD700', // Gold
  autumn: '#FF8C00', // Dark orange
  winter: '#87CEEB'  // Sky blue
};

interface DayNightCycleTrackerProps {
  worldState: WorldState | null;
  chunkWeather: Map<string, any>;
  localPlayer: Player | undefined;
  isMobile?: boolean;
}

const DayNightCycleTracker: React.FC<DayNightCycleTrackerProps> = ({ worldState, chunkWeather, localPlayer, isMobile = false }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<'season' | 'timeOfDay' | null>(null);

  // Calculate current chunk index and get chunk weather
  const currentChunkWeather = useMemo(() => {
    if (!localPlayer) return null;
    
    const chunkIndex = calculateChunkIndex(localPlayer.positionX, localPlayer.positionY);
    const weather = chunkWeather.get(chunkIndex.toString());
    
    // If chunk weather exists, use it. Otherwise, assume Clear (chunk hasn't been initialized yet)
    // We don't fall back to global weather because chunk-based weather is the source of truth
    return weather || null;
  }, [localPlayer, chunkWeather, localPlayer?.positionX, localPlayer?.positionY]);

  // Use chunk weather if available, otherwise assume Clear (chunk not initialized yet)
  // Only fall back to global weather if chunk weather explicitly exists but is null/undefined
  const displayWeather = currentChunkWeather?.currentWeather || { tag: 'Clear' };
  const displayRainIntensity = currentChunkWeather?.rainIntensity ?? 0.0;

  // Helper function to get display name for time of day
  const getTimeOfDayDisplay = (timeOfDay: TimeOfDay) => {
    switch (timeOfDay.tag) {
      case 'Dawn': return 'Dawn';
      case 'TwilightMorning': return 'Twilight Morning';
      case 'Morning': return 'Morning';
      case 'Noon': return 'Noon';
      case 'Afternoon': return 'Afternoon';
      case 'Dusk': return 'Dusk';
      case 'TwilightEvening': return 'Twilight Evening';
      case 'Night': return 'Night';
      case 'Midnight': return 'Midnight';
      default: return 'Unknown';
    }
  };

  // Helper function to get weather display
  const getWeatherDisplay = (weather: any) => {
    switch (weather.tag) {
      case 'Clear': return 'Clear';
      case 'LightRain': return 'Light Rain';
      case 'ModerateRain': return 'Moderate Rain';
      case 'HeavyRain': return 'Heavy Rain';
      case 'HeavyStorm': return 'Heavy Storm';
      default: return 'Unknown';
    }
  };

  // Helper function to get weather emoji
  const getWeatherEmoji = (weather: any) => {
    switch (weather.tag) {
      case 'Clear': return '☀️';
      case 'LightRain': return '🌦️';
      case 'ModerateRain': return '🌧️';
      case 'HeavyRain': return '🌧️';
      case 'HeavyStorm': return '⛈️';
      default: return '🌍';
    }
  };

  // Helper function to get season display name
  const getSeasonDisplay = (season: Season) => {
    switch (season.tag) {
      case 'Spring': return 'Spring';
      case 'Summer': return 'Summer';
      case 'Autumn': return 'Autumn';
      case 'Winter': return 'Winter';
      default: return 'Spring'; // Fallback
    }
  };

  // Helper function to get season icon image source
  const getSeasonIcon = (season: Season): string => {
    switch (season.tag) {
      case 'Spring': return springIcon;
      case 'Summer': return summerIcon;
      case 'Autumn': return autumnIcon;
      case 'Winter': return winterIcon;
      default: return springIcon; // Fallback to spring
    }
  };

  // Helper function to get season color
  const getSeasonColor = (season: Season) => {
    switch (season.tag) {
      case 'Spring': return SEASON_COLORS.spring;
      case 'Summer': return SEASON_COLORS.summer;
      case 'Autumn': return SEASON_COLORS.autumn;
      case 'Winter': return SEASON_COLORS.winter;
      default: return SEASON_COLORS.spring; // Fallback
    }
  };


  // Helper function to get background gradient based on time of day
  const getBackgroundGradient = () => {
    // Create a gradient representing the day/night cycle
    return `linear-gradient(to right, 
      ${COLORS.midnight}, 
      ${COLORS.dawn}, 
      ${COLORS.twilightMorning}, 
      ${COLORS.morning}, 
      ${COLORS.noon}, 
      ${COLORS.afternoon}, 
      ${COLORS.dusk}, 
      ${COLORS.twilightEvening}, 
      ${COLORS.night}, 
      ${COLORS.midnight})`;
  };

  // Early return if no worldState
  if (!worldState) return null;
  
  // On mobile, render a readable horizontal bar below status bars
  if (isMobile) {
    const mobileWeather = displayWeather;
    
    return (
      <div style={{
        position: 'fixed',
        top: '42px', // Below status bars (~32px) + 10px gap
        right: '10px',
        background: 'linear-gradient(135deg, rgba(10, 5, 20, 0.92), rgba(20, 10, 40, 0.95))',
        padding: '10px 14px',
        borderRadius: '12px',
        border: '1px solid rgba(0, 170, 255, 0.5)',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.5)',
        zIndex: 9995,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        fontFamily: 'monospace',
        color: '#00ffff',
      }}>
        {/* Top Row: Season, Day, Weather */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          {/* Season with label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <img 
              src={getSeasonIcon(worldState.currentSeason)} 
              alt={getSeasonDisplay(worldState.currentSeason)}
              style={{ width: '18px', height: '18px', objectFit: 'contain' }}
            />
            <span style={{ 
              fontSize: '11px',
              color: getSeasonColor(worldState.currentSeason),
              fontWeight: 'bold',
            }}>
              {getSeasonDisplay(worldState.currentSeason)}
            </span>
          </div>
          
          {/* Divider */}
          <span style={{ color: 'rgba(0, 170, 255, 0.5)' }}>|</span>
          
          {/* Day */}
          <span style={{ 
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#fff',
            textShadow: '0 0 4px rgba(0, 255, 255, 0.5)',
          }}>
            Day {worldState.cycleCount}
          </span>
          
          {/* Divider */}
          <span style={{ color: 'rgba(0, 170, 255, 0.5)' }}>|</span>
          
          {/* Weather */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '16px' }}>
              {getWeatherEmoji(mobileWeather)}
            </span>
            <span style={{ fontSize: '10px', color: '#aabbcc' }}>
              {getWeatherDisplay(mobileWeather)}
            </span>
          </div>
        </div>
        
        {/* Bottom Row: Time of Day with Progress Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {/* Time of Day Label */}
          <span style={{
            fontSize: '10px',
            color: '#aabbcc',
            minWidth: '60px',
          }}>
            {getTimeOfDayDisplay(worldState.timeOfDay)}
          </span>
          
          {/* Day Cycle Progress Bar */}
          <div style={{
            flex: 1,
            height: '6px',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '3px',
            overflow: 'hidden',
            minWidth: '80px',
          }}>
            <div style={{
              width: `${worldState.cycleProgress * 100}%`,
              height: '100%',
              background: getBackgroundGradient(),
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      </div>
    );
  }

  // Calculate dial position based on cycle progress (0-1)
  const dialPosition = `${worldState.cycleProgress * 100}%`;

  // Toggle minimize/maximize
  const toggleMinimized = () => {
    setIsMinimized(!isMinimized);
  };

  // Minimized view - just the emoji
  if (isMinimized) {
    return (
      <div
        onClick={toggleMinimized}
        style={{
          position: 'fixed',
          top: '15px',
          right: '15px',
          background: UI_BG_COLOR,
          color: '#00ffff',
          padding: '8px',
          borderRadius: '50%',
          border: `2px solid ${UI_BORDER_COLOR}`,
          boxShadow: UI_SHADOW,
          backdropFilter: 'blur(10px)',
          zIndex: 50,
          cursor: 'pointer',
          width: '48px',
          height: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
          transition: 'all 0.3s ease',
          filter: 'drop-shadow(0 0 8px rgba(0, 255, 255, 0.6))',
          transform: 'rotate(-15deg)' // Always diagonal
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1) rotate(-10deg)';
          e.currentTarget.style.filter = 'drop-shadow(0 0 15px rgba(0, 255, 255, 0.9))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1) rotate(-15deg)';
          e.currentTarget.style.filter = 'drop-shadow(0 0 8px rgba(0, 255, 255, 0.6))';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <img 
            src={getSeasonIcon(worldState.currentSeason)} 
            alt={getSeasonDisplay(worldState.currentSeason)}
            style={{ width: '16px', height: '16px', objectFit: 'contain' }}
          />
          <img 
            src={clockIcon} 
            alt="Time"
            style={{ width: '16px', height: '16px', objectFit: 'contain' }}
          />
        </div>
      </div>
    );
  }

  // Expanded view - full component
  return (
    <div style={{
      position: 'fixed',
      top: '15px',
      right: '15px',
      background: UI_BG_COLOR,
      color: '#00ffff',
      padding: '12px 18px',
      borderRadius: '8px',
      border: `2px solid ${UI_BORDER_COLOR}`,
      fontFamily: UI_FONT_FAMILY,
      boxShadow: UI_SHADOW,
      backdropFilter: 'blur(10px)',
      zIndex: 50,
      width: '240px',
      fontSize: '12px',
      textShadow: '0 0 8px rgba(0, 255, 255, 0.7), 0 0 4px rgba(0, 255, 255, 0.4)',
      overflow: 'hidden'
    }}>
      {/* Animated scan line effect */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        background: 'linear-gradient(90deg, transparent, #00ffff, transparent)',
        animation: 'trackerScan 3s linear infinite',
        pointerEvents: 'none',
        zIndex: 1
      }} />
      
      {/* Day/Time Information */}
      <div style={{ marginBottom: '8px', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px', fontWeight: 'bold' }}>
          <span style={{ textShadow: '0 0 10px rgba(0, 255, 255, 0.8)' }}>Day {worldState.cycleCount}</span>
          <div style={{ position: 'relative', display: 'flex', gap: '4px' }}>
            <div style={{ position: 'relative' }}>
              <img
                src={getSeasonIcon(worldState.currentSeason)}
                alt={getSeasonDisplay(worldState.currentSeason)}
                style={{
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  opacity: 0.9,
                  width: '16px',
                  height: '16px',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 0 8px rgba(0, 255, 255, 0.6))',
                  display: 'block'
                }}
                onMouseEnter={(e) => { 
                  e.currentTarget.style.opacity = '1'; 
                  e.currentTarget.style.transform = 'scale(1.1)';
                  e.currentTarget.style.filter = 'drop-shadow(0 0 12px rgba(0, 255, 255, 0.9))';
                  setHoveredElement('season');
                }}
                onMouseLeave={(e) => { 
                  e.currentTarget.style.opacity = '0.9'; 
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.filter = 'drop-shadow(0 0 8px rgba(0, 255, 255, 0.6))';
                  setHoveredElement(null);
                }}
              />
              {hoveredElement === 'season' && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  right: '100%',
                  transform: 'translateY(-50%)',
                  marginRight: '8px',
                  padding: '6px 12px',
                  background: 'linear-gradient(135deg, rgba(30, 15, 50, 0.98), rgba(20, 10, 40, 0.98))',
                  border: `2px solid ${getSeasonColor(worldState.currentSeason)}`,
                  borderRadius: '6px',
                  boxShadow: `0 0 20px ${getSeasonColor(worldState.currentSeason)}80, inset 0 0 10px ${getSeasonColor(worldState.currentSeason)}40`,
                  backdropFilter: 'blur(10px)',
                  whiteSpace: 'nowrap',
                  fontSize: '10px',
                  fontFamily: UI_FONT_FAMILY,
                  color: getSeasonColor(worldState.currentSeason),
                  textShadow: `0 0 8px ${getSeasonColor(worldState.currentSeason)}`,
                  zIndex: 100,
                  pointerEvents: 'none',
                  animation: 'tooltipSlideIn 0.2s ease-out'
                }}>
                  {getSeasonDisplay(worldState.currentSeason)}
                </div>
              )}
            </div>
            <div
              onClick={toggleMinimized}
              style={{
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                opacity: 0.9,
                filter: 'drop-shadow(0 0 8px rgba(0, 255, 255, 0.6))',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => { 
                e.currentTarget.style.opacity = '1'; 
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.filter = 'drop-shadow(0 0 12px rgba(0, 255, 255, 0.9))';
                setHoveredElement('timeOfDay');
              }}
              onMouseLeave={(e) => { 
                e.currentTarget.style.opacity = '0.9'; 
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.filter = 'drop-shadow(0 0 8px rgba(0, 255, 255, 0.6))';
                setHoveredElement(null);
              }}
            >
              <img 
                src={clockIcon} 
                alt="Time"
                style={{ width: '16px', height: '16px', objectFit: 'contain' }}
              />
              {hoveredElement === 'timeOfDay' && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  right: '100%',
                  transform: 'translateY(-50%)',
                  marginRight: '8px',
                  padding: '6px 12px',
                  background: 'linear-gradient(135deg, rgba(30, 15, 50, 0.98), rgba(20, 10, 40, 0.98))',
                  border: `2px solid ${UI_BORDER_COLOR}`,
                  borderRadius: '6px',
                  boxShadow: `0 0 20px rgba(0, 170, 255, 0.8), inset 0 0 10px rgba(0, 170, 255, 0.4)`,
                  backdropFilter: 'blur(10px)',
                  whiteSpace: 'nowrap',
                  fontSize: '10px',
                  fontFamily: UI_FONT_FAMILY,
                  color: '#00ffff',
                  textShadow: '0 0 8px rgba(0, 255, 255, 0.8)',
                  zIndex: 100,
                  pointerEvents: 'none',
                  animation: 'tooltipSlideIn 0.2s ease-out'
                }}>
                  {getTimeOfDayDisplay(worldState.timeOfDay)}
                  {worldState.isFullMoon && (worldState.timeOfDay.tag === 'Night' || worldState.timeOfDay.tag === 'Midnight') && ' - Full Moon'}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Season and Year Information */}
        <div style={{ 
          fontSize: '10px', 
          opacity: 0.95, 
          marginBottom: '4px',
          color: getSeasonColor(worldState.currentSeason),
          textShadow: `0 0 8px ${getSeasonColor(worldState.currentSeason)}80, 0 0 4px ${getSeasonColor(worldState.currentSeason)}40`
        }}>
          <span>{getSeasonDisplay(worldState.currentSeason)}</span>
          <span style={{ margin: '0 4px' }}>•</span>
          <span>Day {worldState.dayOfYear}/360</span>
          <span style={{ margin: '0 4px' }}>•</span>
          <span>Year {worldState.year}</span>
        </div>
        
        <div style={{ fontSize: '11px', opacity: 0.9, textShadow: '0 0 5px rgba(0, 255, 255, 0.3)' }}>
          <div>
            <span>{getWeatherEmoji(displayWeather)}</span>
            <span style={{ margin: '0 4px' }}>{getWeatherDisplay(displayWeather)}</span>
          </div>
          {displayRainIntensity > 0 && (
            <div style={{ marginTop: '2px', paddingLeft: '8px', color: '#00aaff' }}>
              <span>Intensity: {Math.round(displayRainIntensity * 100)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        position: 'relative',
        height: '20px',
        background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(10, 10, 25, 0.95))',
        borderRadius: '10px',
        overflow: 'hidden',
        border: '2px solid rgba(0, 170, 255, 0.5)',
        boxShadow: '0 0 15px rgba(0, 170, 255, 0.3), inset 0 0 15px rgba(0, 170, 255, 0.2)',
        zIndex: 2
      }}>
        {/* Gradient background representing the day/night cycle */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: getBackgroundGradient(),
          opacity: '0.8',
        }}></div>
        
        {/* Position indicator/dial */}
        <div style={{
          position: 'absolute',
          top: '0',
          left: dialPosition,
          transform: 'translateX(-50%)',
          width: '5px',
          height: '100%',
          background: 'linear-gradient(to bottom, #00ffff, #ffffff, #00ffff)',
          boxShadow: '0 0 12px rgba(255, 255, 255, 1), 0 0 20px rgba(0, 255, 255, 0.9), 0 0 30px rgba(0, 255, 255, 0.5)',
          borderRadius: '3px',
          animation: 'dialPulse 2s ease-in-out infinite'
        }}></div>
        
        {/* Scan line effect */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: 'linear-gradient(90deg, transparent, #00ffff, transparent)',
          animation: 'cycleScan 4s linear infinite',
        }} />
      </div>
      
      <style>{`
        @keyframes cycleScan {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes trackerScan {
          0% { transform: translateX(-100%); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateX(100%); opacity: 0; }
        }
        @keyframes dialPulse {
          0%, 100% { 
            box-shadow: 0 0 12px rgba(255, 255, 255, 1), 0 0 20px rgba(0, 255, 255, 0.9), 0 0 30px rgba(0, 255, 255, 0.5);
          }
          50% { 
            box-shadow: 0 0 18px rgba(255, 255, 255, 1), 0 0 30px rgba(0, 255, 255, 1), 0 0 45px rgba(0, 255, 255, 0.7);
          }
        }
        @keyframes tooltipSlideIn {
          0% { 
            opacity: 0; 
            transform: translateY(-50%) translateX(10px);
          }
          100% { 
            opacity: 1; 
            transform: translateY(-50%) translateX(0);
          }
        }
      `}</style>
    </div>
  );
};

export default DayNightCycleTracker; 