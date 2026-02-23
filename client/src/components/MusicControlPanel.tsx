import React, { useState, useRef, useEffect } from 'react';
import { useMusicSystem, MusicZone } from '../hooks/useMusicSystem';
import { useSettings } from '../contexts/SettingsContext';

// Style constants - match DayNightCycleTracker uplink theme exactly
const UI_BG_COLOR = 'linear-gradient(180deg, rgba(15, 25, 20, 0.98) 0%, rgba(20, 35, 30, 0.95) 100%)';
const UI_BORDER_GRADIENT = 'linear-gradient(135deg, #00d4ff, #4ade80, #c084fc, #00d4ff)';
const ACCENT_CYAN = '#00d4ff';
const ACCENT_GREEN = '#4ade80';
const ACCENT_PURPLE = '#c084fc';
const UI_FONT_FAMILY = "'Courier New', 'Consolas', monospace";

// Zone-specific colors for visual feedback
const ZONE_COLORS: Record<MusicZone, { primary: string; secondary: string; glow: string }> = {
    normal: { primary: '#ff6b9d', secondary: '#4ecdc4', glow: 'rgba(255, 107, 157, 0.8)' },
    fishing_village: { primary: '#4fc3f7', secondary: '#81d4fa', glow: 'rgba(79, 195, 247, 0.8)' },
    hunting_village: { primary: '#8b6f47', secondary: '#a0826d', glow: 'rgba(139, 111, 71, 0.8)' },
    alpine_village: { primary: '#6B8E23', secondary: '#9ACD32', glow: 'rgba(107, 142, 35, 0.8)' }, // Olive green - shares hunting village tracks
    alk_compound: { primary: '#ffc107', secondary: '#ff9800', glow: 'rgba(255, 193, 7, 0.8)' },
    alk_substation: { primary: '#9c27b0', secondary: '#ba68c8', glow: 'rgba(156, 39, 176, 0.8)' },
    hot_springs: { primary: '#ff6b9d', secondary: '#4ecdc4', glow: 'rgba(255, 107, 157, 0.8)' },
    deep_sea: { primary: '#0288d1', secondary: '#03a9f4', glow: 'rgba(2, 136, 209, 0.8)' },
};

interface MusicControlPanelProps {
    musicSystem: ReturnType<typeof useMusicSystem>;
    isVisible: boolean;
    onClose?: () => void;
    isDayNightMinimized?: boolean;
}

// Custom Tooltip Component
interface TooltipProps {
    text: string;
    children: React.ReactNode;
}

const CustomTooltip: React.FC<TooltipProps> = ({ text, children }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    const handleMouseEnter = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPosition({
            x: rect.left + rect.width / 2,
            y: rect.top - 10
        });
        setIsVisible(true);
    };

    const handleMouseLeave = () => {
        setIsVisible(false);
    };

    return (
        <>
            <div
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                style={{ position: 'relative', display: 'inline-block' }}
            >
                {children}
            </div>
            {isVisible && (
                <div
                    style={{
                        position: 'fixed',
                        left: `${position.x}px`,
                        top: `${position.y}px`,
                        transform: 'translateX(-50%) translateY(-100%)',
                        background: UI_BG_COLOR,
                        color: ACCENT_CYAN,
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '9px',
                        fontFamily: UI_FONT_FAMILY,
                        border: `2px solid ${ACCENT_CYAN}`,
                        boxShadow: '0 0 15px rgba(0, 212, 255, 0.5)',
                        zIndex: 10000,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none'
                    }}
                >
                    {text}
                    <div
                        style={{
                            position: 'absolute',
                            top: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 0,
                            height: 0,
                            borderLeft: '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderTop: `6px solid ${ACCENT_CYAN}`,
                        }}
                    />
                </div>
            )}
        </>
    );
};

const MusicControlPanel: React.FC<MusicControlPanelProps> = ({
    musicSystem,
    isVisible,
    onClose,
    isDayNightMinimized = false,
}) => {
    const { musicVolume, setMusicVolume: onMusicVolumeChange } = useSettings();
    // Optimistic UI state - show selected track immediately on click
    const [optimisticSelectedTrack, setOptimisticSelectedTrack] = useState<string | null>(null);
    
    // Ref for click-outside detection
    const panelRef = useRef<HTMLDivElement>(null);

    // Click outside to close
    useEffect(() => {
        if (!isVisible) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                onClose?.();
            }
        };

        // Add listener with a slight delay to avoid closing immediately on the same click that opened it
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isVisible, onClose]);

    if (!isVisible) return null;

    const {
        isPlaying,
        currentTrack,
        next: nextTrack,
        previous: previousTrack,
        start: startMusic,
        stop: stopMusic,
        toggleShuffle,
        tracklist: MUSIC_TRACKS,
        currentPosition,
        totalTracks,
        error,
        setVolume,
        shuffleMode,
        playSpecificTrack,
        currentZone,
        zoneInfo
    } = musicSystem;

    // Get zone-specific colors
    const zoneColors = ZONE_COLORS[currentZone] || ZONE_COLORS.normal;

    // Toggle play/pause
    const togglePlayPause = () => {
        if (isPlaying) {
            stopMusic();
        } else {
            startMusic();
        }
    };

    // Handle volume change - sync with both music system and parent
    const handleVolumeChange = (volume: number) => {
        setVolume(volume); // Update music system volume
        onMusicVolumeChange(volume); // Update parent/settings volume
    };

    // Handle shuffle toggle - toggleShuffle is synchronous, not async
    const handleShuffleToggle = () => {
        try {
            // console.log('🎵 Toggling shuffle from:', shuffleMode);
            toggleShuffle(); // This is synchronous, not async
            // console.log('🎵 Shuffle button clicked');
        } catch (error) {
            console.error('🎵 Failed to toggle shuffle:', error);
        }
    };

    // Handle track selection with optimistic UI
    const handleTrackClick = async (trackIndex: number) => {
        const selectedTrack = MUSIC_TRACKS[trackIndex];
        
        // Immediately update the visual selection (optimistic UI)
        setOptimisticSelectedTrack(selectedTrack.filename);
        
        try {
            // Start playing the track
            await playSpecificTrack(trackIndex);
            // Clear optimistic state once the real state updates
            setOptimisticSelectedTrack(null);
        } catch (error) {
            // If there's an error, clear the optimistic state
            setOptimisticSelectedTrack(null);
            console.error('Failed to play track:', error);
        }
    };

    // Handle next track with optimistic UI
    const handleNextTrack = async () => {
        try {
            // Get current state to calculate next track optimistically
            const currentPosition = musicSystem.currentPosition - 1; // Convert to 0-based index
            const totalTracks = MUSIC_TRACKS.length;
            let nextPosition = currentPosition + 1;
            
            // Handle wrap-around
            if (nextPosition >= totalTracks) {
                nextPosition = 0; // Go to first track
            }
            
            const nextTrack = MUSIC_TRACKS[nextPosition];
            if (nextTrack) {
                // Immediately show the next track as selected (optimistic UI)
                setOptimisticSelectedTrack(nextTrack.filename);
            }
            
            await musicSystem.next();
            // Clear optimistic state once the real state updates
            setOptimisticSelectedTrack(null);
        } catch (error) {
            // If there's an error, clear the optimistic state
            setOptimisticSelectedTrack(null);
            console.error('Failed to go to next track:', error);
        }
    };

    // Handle previous track with optimistic UI
    const handlePreviousTrack = async () => {
        try {
            // Get current state to calculate previous track optimistically
            const currentPosition = musicSystem.currentPosition - 1; // Convert to 0-based index
            const totalTracks = MUSIC_TRACKS.length;
            let prevPosition = currentPosition - 1;
            
            // Handle wrap-around
            if (prevPosition < 0) {
                prevPosition = totalTracks - 1; // Go to last track
            }
            
            const prevTrack = MUSIC_TRACKS[prevPosition];
            if (prevTrack) {
                // Immediately show the previous track as selected (optimistic UI)
                setOptimisticSelectedTrack(prevTrack.filename);
            }
            
            await musicSystem.previous();
            // Clear optimistic state once the real state updates
            setOptimisticSelectedTrack(null);
        } catch (error) {
            // If there's an error, clear the optimistic state
            setOptimisticSelectedTrack(null);
            console.error('Failed to go to previous track:', error);
        }
    };

    // Determine which track should appear selected (optimistic or actual)
    const getDisplaySelectedTrack = () => {
        if (optimisticSelectedTrack) {
            return optimisticSelectedTrack;
        }
        return currentTrack?.filename || null;
    };

    // Get the display track info for the current track display (optimistic or actual)
    const getDisplayTrackInfo = () => {
        if (optimisticSelectedTrack) {
            const optimisticTrack = MUSIC_TRACKS.find(track => track.filename === optimisticSelectedTrack);
            return optimisticTrack || currentTrack;
        }
        return currentTrack;
    };

    // Handle wheel events within the music panel to prevent Hotbar interference
    const handlePanelWheel = (event: React.WheelEvent) => {
        // Stop propagation to prevent Hotbar from handling this wheel event
        event.stopPropagation();
        // Let the default scrolling behavior work within the panel
    };

    // Position directly beneath DayNightCycleTracker: same right: 15px, top varies by tracker state
    const topPosition = isDayNightMinimized ? '63px' : '293px'; // minimized ~40px + gap | expanded ~270px + gap

    return (
        <div
            ref={panelRef}
            onWheel={handlePanelWheel}
            style={{
                position: 'fixed',
                top: topPosition,
                right: '15px',
                zIndex: 49, // Just below DayNightCycleTracker (50)
            }}
        >
            {/* Gradient border container - matches DayNightCycleTracker uplink style */}
            <div className="music-panel-glow" style={{
                padding: '2px',
                backgroundImage: UI_BORDER_GRADIENT,
                backgroundSize: '300% 300%',
                animation: 'uplinkGradientShift 4s ease infinite',
                borderRadius: '10px',
                boxShadow: '0 0 20px rgba(0, 212, 255, 0.3), inset 0 0 15px rgba(0, 212, 255, 0.1)',
            }}>
                <div style={{
                    background: UI_BG_COLOR,
                    borderRadius: '8px',
                    minWidth: '250px',
                    overflow: 'hidden',
                    fontFamily: UI_FONT_FAMILY,
                }}>
                    {/* Header - compact like DayNightCycleTracker */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: 'rgba(0, 212, 255, 0.08)',
                        borderBottom: '1px solid rgba(0, 212, 255, 0.25)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px' }}>🎵</span>
                            <span style={{ fontSize: '8px', color: ACCENT_CYAN, letterSpacing: '1px' }}>// NEURAL HARMONY</span>
                        </div>
                        <CustomTooltip text="Close">
                            <button
                                onClick={() => onClose?.()}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'rgba(255, 100, 100, 0.9)',
                                    cursor: 'pointer',
                                    fontSize: '9px',
                                    padding: '2px 4px',
                                }}
                            >
                                ✕
                            </button>
                        </CustomTooltip>
                    </div>

                    {/* Content - compact */}
                    <div style={{ padding: '10px 12px' }}>
                        {/* Zone + Track row */}
                        <div style={{ marginBottom: '8px' }}>
                            {currentZone !== 'normal' && zoneInfo && (
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 6px',
                                    marginBottom: '4px',
                                    background: `${zoneColors.primary}20`,
                                    border: `1px solid ${zoneColors.primary}40`,
                                    borderRadius: '4px',
                                    fontSize: '8px',
                                    color: zoneColors.primary,
                                }}>
                                    <span>{zoneInfo.icon}</span>
                                    <span>{zoneInfo.name.toUpperCase()}</span>
                                </div>
                            )}
                            <div style={{ fontSize: '9px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {totalTracks === 0 ? '— SILENCE —' : (getDisplayTrackInfo()?.displayName || 'No track')}
                            </div>
                            <div style={{ fontSize: '8px', color: '#9ca3af' }}>
                                {totalTracks === 0 ? 'Ambient only' : `${currentPosition}/${totalTracks} ${shuffleMode ? '🔀' : ''}`}
                            </div>
                        </div>

                        {/* Controls row - compact inline */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <CustomTooltip text={shuffleMode ? 'Shuffle ON' : 'Sequential'}>
                                <button
                                    onClick={handleShuffleToggle}
                                    style={{
                                        background: shuffleMode ? `${ACCENT_PURPLE}30` : 'transparent',
                                        border: `1px solid ${shuffleMode ? ACCENT_PURPLE : `${ACCENT_CYAN}40`}`,
                                        color: shuffleMode ? ACCENT_PURPLE : `${ACCENT_CYAN}80`,
                                        borderRadius: '4px',
                                        padding: '4px 6px',
                                        cursor: 'pointer',
                                        fontSize: '10px',
                                    }}
                                >
                                    🔀
                                </button>
                            </CustomTooltip>
                            <CustomTooltip text="Previous">
                                <button onClick={handlePreviousTrack} style={{ background: 'none', border: 'none', color: ACCENT_CYAN, cursor: 'pointer', fontSize: '12px' }}>⏮️</button>
                            </CustomTooltip>
                            <CustomTooltip text={isPlaying ? 'Pause' : 'Play'}>
                                <button
                                    onClick={togglePlayPause}
                                    style={{
                                        background: isPlaying ? `${ACCENT_PURPLE}25` : `${ACCENT_GREEN}25`,
                                        border: `1px solid ${isPlaying ? ACCENT_PURPLE : ACCENT_GREEN}`,
                                        color: isPlaying ? ACCENT_PURPLE : ACCENT_GREEN,
                                        borderRadius: '50%',
                                        width: '28px',
                                        height: '28px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    {isPlaying ? '⏸' : '▶'}
                                </button>
                            </CustomTooltip>
                            <CustomTooltip text="Next">
                                <button onClick={handleNextTrack} style={{ background: 'none', border: 'none', color: ACCENT_CYAN, cursor: 'pointer', fontSize: '12px' }}>⏭️</button>
                            </CustomTooltip>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px' }}>
                                <span style={{ fontSize: '8px', color: '#9ca3af', minWidth: '28px' }}>{Math.round(musicVolume * 100)}%</span>
                                <CustomTooltip text={`Vol: ${Math.round(musicVolume * 100)}%`}>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={musicVolume}
                                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                        style={{
                                            flex: 1,
                                            minWidth: 0,
                                            height: '4px',
                                            background: 'rgba(0, 212, 255, 0.3)',
                                            outline: 'none',
                                            borderRadius: '2px',
                                            cursor: 'pointer',
                                        }}
                                    />
                                </CustomTooltip>
                            </div>
                        </div>

                        {/* Playlist - compact */}
                        <div
                            style={{
                                maxHeight: '90px',
                                overflowY: 'auto',
                                border: '1px solid rgba(0, 212, 255, 0.25)',
                                borderRadius: '4px',
                                padding: '6px',
                                background: 'rgba(0, 0, 0, 0.3)',
                            }}
                            className="music-panel-scrollable"
                        >
                            {totalTracks === 0 ? (
                                <div style={{ fontSize: '8px', color: '#6b7280', textAlign: 'center', padding: '6px 0' }}>— ambient only —</div>
                            ) : MUSIC_TRACKS.map((track, trackIndex) => {
                                const displaySelectedTrack = getDisplaySelectedTrack();
                                const isCurrentTrack = displaySelectedTrack === track.filename;
                                return (
                                    <div
                                        key={`${track.filename}-${trackIndex}`}
                                        onClick={() => handleTrackClick(trackIndex)}
                                        style={{
                                            fontSize: '8px',
                                            padding: '3px 6px',
                                            marginBottom: '2px',
                                            cursor: 'pointer',
                                            borderRadius: '3px',
                                            background: isCurrentTrack ? `${ACCENT_PURPLE}25` : 'transparent',
                                            color: isCurrentTrack ? ACCENT_PURPLE : ACCENT_CYAN,
                                            border: isCurrentTrack ? `1px solid ${ACCENT_PURPLE}60` : '1px solid transparent',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isCurrentTrack) {
                                                e.currentTarget.style.background = 'rgba(0, 212, 255, 0.15)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isCurrentTrack) {
                                                e.currentTarget.style.background = 'transparent';
                                            }
                                        }}
                                    >
                                        {isCurrentTrack ? '▶ ' : `${trackIndex + 1}. `}
                                        {track.displayName}
                                        {optimisticSelectedTrack === track.filename && !currentTrack && (
                                            <span style={{ marginLeft: '4px', fontSize: '7px', color: ACCENT_GREEN }}>...</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {error && (
                            <div style={{ marginTop: '6px', fontSize: '8px', color: '#f43f5e', textAlign: 'center' }}>
                                {error}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes uplinkGradientShift {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                .music-panel-scrollable::-webkit-scrollbar { width: 6px; }
                .music-panel-scrollable::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); border-radius: 3px; }
                .music-panel-scrollable::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #00d4ff, #4ade80); border-radius: 3px; }
                .music-panel-scrollable { scrollbar-width: thin; scrollbar-color: #00d4ff rgba(0,0,0,0.3); }
            `}</style>
        </div>
    );
};

export default MusicControlPanel; 