import React from 'react';
import styles from './MenuComponents.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTree, faCloudRain, faHeartPulse, faLeaf, faUsers } from '@fortawesome/free-solid-svg-icons';
import { useSettings } from '../contexts/SettingsContext';

// Default visual settings based on optimal neural rendering thresholds
export const DEFAULT_VISUAL_SETTINGS = {
    allShadowsEnabled: true,         // Enable all in-world shadows
    weatherOverlayEnabled: true,     // Enable precipitation particles (rain/snow)
    stormAtmosphereEnabled: true,    // Enable storm darkening/desaturation layer
    statusOverlaysEnabled: true,     // Enable cold/low health screen overlays
    grassEnabled: true,              // Enable grass rendering and subscriptions
    alwaysShowPlayerNames: true,     // Show player names above heads at all times
    cloudsEnabled: true,             // Enable cloud layer
    waterSurfaceEffectsEnabled: true,// Enable voronoi/caustic water effects
    waterSurfaceEffectsIntensity: 75,// Strong enough to feel alive but not noisy
    worldParticlesQuality: 2,        // 0=off, 1=low, 2=full
    footprintsEnabled: true,         // Enable sand/snow footprints
    bloomIntensity: 0,               // Default OFF
    vignetteIntensity: 0,            // Default OFF
    chromaticAberrationIntensity: 0, // Default OFF
    colorCorrection: 50,             // Neutral by default
} as const;

const POST_PROCESSING_PRESETS = {
    off: { bloomIntensity: 0, vignetteIntensity: 0, chromaticAberrationIntensity: 0, colorCorrection: 50 },
    cozy: { bloomIntensity: 36, vignetteIntensity: 20, chromaticAberrationIntensity: 12, colorCorrection: 60 }, // previous defaults, stronger
    hdr: { bloomIntensity: 68, vignetteIntensity: 34, chromaticAberrationIntensity: 20, colorCorrection: 74 },
    cinematic: { bloomIntensity: 48, vignetteIntensity: 58, chromaticAberrationIntensity: 26, colorCorrection: 58 },
    clean: { bloomIntensity: 14, vignetteIntensity: 8, chromaticAberrationIntensity: 0, colorCorrection: 53 },
} as const;

interface GameVisualSettingsMenuProps {
    onBack: () => void;
    onClose: () => void;
}

const GameVisualSettingsMenu: React.FC<GameVisualSettingsMenuProps> = ({
    onBack,
    onClose,
}) => {
    const {
        allShadowsEnabled,
        setAllShadowsEnabled: onAllShadowsChange,
        weatherOverlayEnabled,
        setWeatherOverlayEnabled: onWeatherOverlayChange,
        stormAtmosphereEnabled,
        setStormAtmosphereEnabled: onStormAtmosphereChange,
        statusOverlaysEnabled,
        setStatusOverlaysEnabled: onStatusOverlaysChange,
        grassEnabled,
        setGrassEnabled: onGrassChange,
        alwaysShowPlayerNames,
        setAlwaysShowPlayerNames: onAlwaysShowPlayerNamesChange,
        cloudsEnabled,
        setCloudsEnabled: onCloudsEnabledChange,
        waterSurfaceEffectsEnabled,
        setWaterSurfaceEffectsEnabled: onWaterSurfaceEffectsEnabledChange,
        waterSurfaceEffectsIntensity,
        setWaterSurfaceEffectsIntensity: onWaterSurfaceEffectsIntensityChange,
        worldParticlesQuality,
        setWorldParticlesQuality: onWorldParticlesQualityChange,
        footprintsEnabled,
        setFootprintsEnabled: onFootprintsEnabledChange,
        bloomIntensity,
        setBloomIntensity: onBloomIntensityChange,
        vignetteIntensity,
        setVignetteIntensity: onVignetteIntensityChange,
        chromaticAberrationIntensity,
        setChromaticAberrationIntensity: onChromaticAberrationIntensityChange,
        colorCorrection,
        setColorCorrection: onColorCorrectionChange,
    } = useSettings();

    const setShadowsEnabled = (enabled: boolean) => {
        onAllShadowsChange(enabled);
    };

    const applyPostProcessingPreset = (preset: keyof typeof POST_PROCESSING_PRESETS) => {
        const values = POST_PROCESSING_PRESETS[preset];
        onBloomIntensityChange(values.bloomIntensity);
        onVignetteIntensityChange(values.vignetteIntensity);
        onChromaticAberrationIntensityChange(values.chromaticAberrationIntensity);
        onColorCorrectionChange(values.colorCorrection);
    };

    const applyPresetDefault = () => {
        setShadowsEnabled(DEFAULT_VISUAL_SETTINGS.allShadowsEnabled);
        onWeatherOverlayChange(DEFAULT_VISUAL_SETTINGS.weatherOverlayEnabled);
        onStormAtmosphereChange(DEFAULT_VISUAL_SETTINGS.stormAtmosphereEnabled);
        onStatusOverlaysChange(DEFAULT_VISUAL_SETTINGS.statusOverlaysEnabled);
        onAlwaysShowPlayerNamesChange(DEFAULT_VISUAL_SETTINGS.alwaysShowPlayerNames);
        onCloudsEnabledChange(DEFAULT_VISUAL_SETTINGS.cloudsEnabled);
        onWaterSurfaceEffectsEnabledChange(DEFAULT_VISUAL_SETTINGS.waterSurfaceEffectsEnabled);
        onWaterSurfaceEffectsIntensityChange(DEFAULT_VISUAL_SETTINGS.waterSurfaceEffectsIntensity);
        onWorldParticlesQualityChange(DEFAULT_VISUAL_SETTINGS.worldParticlesQuality);
        onFootprintsEnabledChange(DEFAULT_VISUAL_SETTINGS.footprintsEnabled);
        applyPostProcessingPreset('off');
    };

    const applyPresetPerformance = () => {
        setShadowsEnabled(false);
        onWeatherOverlayChange(false);
        onStormAtmosphereChange(false);
        onStatusOverlaysChange(false);
        onAlwaysShowPlayerNamesChange(true);
        onCloudsEnabledChange(false);
        onWaterSurfaceEffectsEnabledChange(false);
        onWaterSurfaceEffectsIntensityChange(0);
        onWorldParticlesQualityChange(0);
        onFootprintsEnabledChange(false);
        applyPostProcessingPreset('off');
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onBack();
        }
    };

    const slidersEngaged = bloomIntensity > 0 || vignetteIntensity > 0 || chromaticAberrationIntensity > 0 || colorCorrection !== 50;
    const backdropStyle = slidersEngaged
        ? { background: 'rgba(0, 0, 0, 0.08)', backdropFilter: 'blur(0.5px)' as const }
        : { background: 'rgba(0, 0, 0, 0.22)', backdropFilter: 'blur(1.5px)' as const };
    const panelBg = slidersEngaged
        ? 'linear-gradient(145deg, rgba(15, 30, 50, 0.55), rgba(10, 20, 40, 0.62))'
        : 'linear-gradient(145deg, rgba(15, 30, 50, 0.95), rgba(10, 20, 40, 0.98))';

    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    ...backdropStyle,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 100000,
                }}
                onClick={handleBackdropClick}
            >

            <div
                className={styles.menuContainer}
                style={{
                    maxWidth: '600px',
                    maxHeight: '80vh',
                    background: panelBg,
                    border: '2px solid #00ff88',
                    borderRadius: '12px',
                    boxShadow: '0 0 30px rgba(0, 255, 136, 0.3), inset 0 0 20px rgba(0, 255, 136, 0.1)',
                    position: 'relative',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Scan line effect */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent, #00ff88, transparent)',
                    animation: 'scanLine 3s linear infinite',
                }} />
                
                <div style={{ textAlign: 'left', marginBottom: '35px' }}>
                    <h2
                        style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '22px',
                            color: '#00ff88',
                            textAlign: 'left',
                            marginBottom: '8px',
                            textShadow: '0 0 10px rgba(0, 255, 136, 0.8), 0 0 20px rgba(0, 255, 136, 0.4)',
                            animation: 'glow 2s ease-in-out infinite alternate',
                            letterSpacing: '2px',
                        }}
                    >
                        VISUAL CORTEX MODULE
                    </h2>
                    <div
                        style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#6699cc',
                            textAlign: 'left',
                            letterSpacing: '1px',
                            opacity: 0.8,
                        }}
                    >
                        Neural Imaging Processing Interface v0.53
                    </div>
                </div>

                {/* Scrollable content area */}
                <div 
                    style={{ 
                        padding: '20px 0',
                        maxHeight: 'calc(80vh - 200px)', // Account for header and buttons
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        paddingRight: '10px', // Space for scrollbar
                    }}
                    className="visual-cortex-scroll"
                >
                    <div style={{
                        marginBottom: '18px',
                        padding: '14px',
                        borderRadius: '10px',
                        border: '1px solid rgba(0, 255, 136, 0.35)',
                        background: 'linear-gradient(135deg, rgba(10, 35, 45, 0.72), rgba(8, 24, 32, 0.84))',
                    }}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '11px',
                            color: '#88ffd8',
                            marginBottom: '10px',
                            letterSpacing: '1px',
                            textAlign: 'left',
                        }}>
                            VISUAL PRESETS
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                onClick={applyPresetDefault}
                                className={styles.menuButton}
                                style={{ flex: '1 1 160px', minWidth: '150px', padding: '10px 12px', fontSize: '12px', fontFamily: '"Press Start 2P", cursive' }}
                            >
                                DEFAULT
                            </button>
                            <button
                                onClick={applyPresetPerformance}
                                className={styles.menuButton}
                                style={{ flex: '1 1 160px', minWidth: '150px', padding: '10px 12px', fontSize: '12px', fontFamily: '"Press Start 2P", cursive' }}
                            >
                                PERFORMANCE
                            </button>
                        </div>
                    </div>

                    <div style={{
                        marginBottom: '16px',
                        fontFamily: '"Press Start 2P", cursive',
                        fontSize: '11px',
                        color: '#66d7ff',
                        letterSpacing: '1px',
                        textAlign: 'left',
                        opacity: 0.9,
                    }}>
                        CORE VISUALS
                    </div>

                    {/* Tree Shadows Setting */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#88ff44',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #88ff44',
                            letterSpacing: '1px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}>
                            <FontAwesomeIcon 
                                icon={faTree} 
                                style={{
                                    color: '#88ff44',
                                    textShadow: '0 0 8px #88ff44',
                                    fontSize: '14px',
                                }}
                            />
                            ALL SHADOWS: {allShadowsEnabled ? 'ENABLED' : 'DISABLED'}
                        </div>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#aaffaa',
                            marginBottom: '8px',
                            opacity: 0.7,
                            letterSpacing: '0.5px',
                            textAlign: 'left',
                        }}>
                            {allShadowsEnabled
                                ? 'Dynamic shadows enabled for trees, resources, structures, and overlays'
                                : 'All in-world shadows disabled for maximum clarity/performance'
                            }
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            gap: '15px',
                        }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                fontFamily: '"Press Start 2P", cursive',
                                fontSize: '14px',
                                color: allShadowsEnabled ? '#88ff44' : '#666',
                                textShadow: allShadowsEnabled ? '0 0 5px #88ff44' : 'none',
                                transition: 'all 0.3s ease',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={allShadowsEnabled}
                                    onChange={(e) => setShadowsEnabled(e.target.checked)}
                                    style={{
                                        marginRight: '10px',
                                        transform: 'scale(1.5)',
                                        accentColor: '#00ff88',
                                    }}
                                />
                                ENABLE ALL SHADOWS
                            </label>
                        </div>
                    </div>

                    {/* Weather Precipitation Setting */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#44aaff',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #44aaff',
                            letterSpacing: '1px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}>
                            <FontAwesomeIcon 
                                icon={faCloudRain} 
                                style={{
                                    color: '#44aaff',
                                    textShadow: '0 0 8px #44aaff',
                                    fontSize: '14px',
                                }}
                            />
                            PRECIPITATION: {weatherOverlayEnabled ? 'ENABLED' : 'DISABLED'}
                        </div>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#aaccff',
                            marginBottom: '8px',
                            opacity: 0.7,
                            letterSpacing: '0.5px',
                            textAlign: 'left',
                        }}>
                            {weatherOverlayEnabled 
                                ? 'Rain and snow particles enabled' 
                                : 'Rain and snow disabled'
                            }
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            gap: '15px',
                        }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                fontFamily: '"Press Start 2P", cursive',
                                fontSize: '14px',
                                color: weatherOverlayEnabled ? '#44aaff' : '#666',
                                textShadow: weatherOverlayEnabled ? '0 0 5px #44aaff' : 'none',
                                transition: 'all 0.3s ease',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={weatherOverlayEnabled}
                                    onChange={(e) => onWeatherOverlayChange(e.target.checked)}
                                    style={{
                                        marginRight: '10px',
                                        transform: 'scale(1.5)',
                                        accentColor: '#44aaff',
                                    }}
                                />
                                ENABLE RAIN/SNOW
                            </label>
                        </div>
                    </div>

                    {/* Storm Atmosphere Setting */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#5cb8ff',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #5cb8ff',
                            letterSpacing: '1px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}>
                            STORM ATMOSPHERE: {stormAtmosphereEnabled ? 'ENABLED' : 'DISABLED'}
                        </div>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#b8dcff',
                            marginBottom: '8px',
                            opacity: 0.7,
                            letterSpacing: '0.5px',
                            textAlign: 'left',
                        }}>
                            {stormAtmosphereEnabled
                                ? 'Storm darkening, desaturation, and mood enabled'
                                : 'No storm tinting/darkening'
                            }
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '15px' }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                fontFamily: '"Press Start 2P", cursive',
                                fontSize: '14px',
                                color: stormAtmosphereEnabled ? '#5cb8ff' : '#666',
                                textShadow: stormAtmosphereEnabled ? '0 0 5px #5cb8ff' : 'none',
                                transition: 'all 0.3s ease',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={stormAtmosphereEnabled}
                                    onChange={(e) => onStormAtmosphereChange(e.target.checked)}
                                    style={{ marginRight: '10px', transform: 'scale(1.5)', accentColor: '#5cb8ff' }}
                                />
                                ENABLE STORM LOOK
                            </label>
                        </div>
                    </div>

                    {/* Grass Setting - HIDDEN FOR NOW (not deleted) */}
                    {false && (
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#88cc44',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #88cc44',
                            letterSpacing: '1px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}>
                            <FontAwesomeIcon 
                                icon={faLeaf} 
                                style={{
                                    color: '#88cc44',
                                    textShadow: '0 0 8px #88cc44',
                                    fontSize: '14px',
                                }}
                            />
                            GRASS RENDERING: {grassEnabled ? 'ENABLED' : 'DISABLED'}
                        </div>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#aaffaa',
                            marginBottom: '8px',
                            opacity: 0.7,
                            letterSpacing: '0.5px',
                            textAlign: 'left',
                        }}>
                            {grassEnabled 
                                ? 'Grass subscriptions active - may impact performance' 
                                : 'Grass disabled for better performance'
                            }
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            gap: '15px',
                        }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                fontFamily: '"Press Start 2P", cursive',
                                fontSize: '14px',
                                color: grassEnabled ? '#88cc44' : '#666',
                                textShadow: grassEnabled ? '0 0 5px #88cc44' : 'none',
                                transition: 'all 0.3s ease',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={grassEnabled}
                                    onChange={(e) => onGrassChange(e.target.checked)}
                                    style={{
                                        marginRight: '10px',
                                        transform: 'scale(1.5)',
                                        accentColor: '#88cc44',
                                    }}
                                />
                                ENABLE GRASS
                            </label>
                        </div>
                    </div>
                    )}

                    {/* Status Overlays Setting (Cold/Low Health) */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#ff5566',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #ff5566',
                            letterSpacing: '1px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}>
                            <FontAwesomeIcon 
                                icon={faHeartPulse} 
                                style={{
                                    color: '#ff5566',
                                    textShadow: '0 0 8px #ff5566',
                                    fontSize: '14px',
                                }}
                            />
                            STATUS OVERLAYS: {statusOverlaysEnabled ? 'ENABLED' : 'DISABLED'}
                        </div>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#ffaaaa',
                            marginBottom: '8px',
                            opacity: 0.7,
                            letterSpacing: '0.5px',
                            textAlign: 'left',
                        }}>
                            {statusOverlaysEnabled 
                                ? 'Screen effects show when cold or low health' 
                                : 'Cold/health screen effects disabled'
                            }
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            gap: '15px',
                        }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                fontFamily: '"Press Start 2P", cursive',
                                fontSize: '14px',
                                color: statusOverlaysEnabled ? '#ff5566' : '#666',
                                textShadow: statusOverlaysEnabled ? '0 0 5px #ff5566' : 'none',
                                transition: 'all 0.3s ease',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={statusOverlaysEnabled}
                                    onChange={(e) => onStatusOverlaysChange(e.target.checked)}
                                    style={{
                                        marginRight: '10px',
                                        transform: 'scale(1.5)',
                                        accentColor: '#ff5566',
                                    }}
                                />
                                ENABLE OVERLAYS
                            </label>
                        </div>
                    </div>

                    {/* Always Show Player Names Setting */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#00ffff',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #00ffff',
                            letterSpacing: '1px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}>
                            <FontAwesomeIcon 
                                icon={faUsers} 
                                style={{
                                    color: '#00ffff',
                                    textShadow: '0 0 8px #00ffff',
                                    fontSize: '14px',
                                }}
                            />
                            PLAYER NAMES: {alwaysShowPlayerNames ? 'ALWAYS VISIBLE' : 'HOVER ONLY'}
                        </div>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#aaffff',
                            marginBottom: '8px',
                            opacity: 0.7,
                            letterSpacing: '0.5px',
                            textAlign: 'left',
                        }}>
                            {alwaysShowPlayerNames 
                                ? 'Player names shown above all characters' 
                                : 'Player names shown only when hovering'
                            }
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            gap: '15px',
                        }}>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                fontFamily: '"Press Start 2P", cursive',
                                fontSize: '14px',
                                color: alwaysShowPlayerNames ? '#00ffff' : '#666',
                                textShadow: alwaysShowPlayerNames ? '0 0 5px #00ffff' : 'none',
                                transition: 'all 0.3s ease',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={alwaysShowPlayerNames}
                                    onChange={(e) => onAlwaysShowPlayerNamesChange(e.target.checked)}
                                    style={{
                                        marginRight: '10px',
                                        transform: 'scale(1.5)',
                                        accentColor: '#00ffff',
                                    }}
                                />
                                ALWAYS SHOW NAMES
                            </label>
                        </div>
                    </div>

                    <div style={{
                        marginBottom: '16px',
                        marginTop: '5px',
                        fontFamily: '"Press Start 2P", cursive',
                        fontSize: '11px',
                        color: '#66d7ff',
                        letterSpacing: '1px',
                        textAlign: 'left',
                        opacity: 0.9,
                    }}>
                        PERFORMANCE
                    </div>

                    {/* Clouds Setting */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '16px', color: '#a8d9ff', marginBottom: '12px', textShadow: '0 0 8px #a8d9ff', letterSpacing: '1px' }}>
                            CLOUDS: {cloudsEnabled ? 'ENABLED' : 'DISABLED'}
                        </div>
                        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '12px', color: '#d6ebff', marginBottom: '8px', opacity: 0.7, letterSpacing: '0.5px', textAlign: 'left' }}>
                            High-atmosphere cloud layer rendered over world.
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontFamily: '"Press Start 2P", cursive', fontSize: '14px', color: cloudsEnabled ? '#a8d9ff' : '#666', textShadow: cloudsEnabled ? '0 0 5px #a8d9ff' : 'none' }}>
                            <input type="checkbox" checked={cloudsEnabled} onChange={(e) => onCloudsEnabledChange(e.target.checked)} style={{ marginRight: '10px', transform: 'scale(1.5)', accentColor: '#a8d9ff' }} />
                            ENABLE CLOUDS
                        </label>
                    </div>

                    {/* Water Surface Effects */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '16px', color: '#55d6ff', marginBottom: '12px', textShadow: '0 0 8px #55d6ff', letterSpacing: '1px' }}>
                            WATER SURFACE FX: {waterSurfaceEffectsEnabled ? 'ENABLED' : 'DISABLED'}
                        </div>
                        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '12px', color: '#baf3ff', marginBottom: '8px', opacity: 0.7, letterSpacing: '0.5px', textAlign: 'left' }}>
                            Voronoi/caustic/ripple water rendering and shoreline treatment.
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontFamily: '"Press Start 2P", cursive', fontSize: '14px', color: waterSurfaceEffectsEnabled ? '#55d6ff' : '#666', textShadow: waterSurfaceEffectsEnabled ? '0 0 5px #55d6ff' : 'none', marginBottom: '10px' }}>
                            <input type="checkbox" checked={waterSurfaceEffectsEnabled} onChange={(e) => onWaterSurfaceEffectsEnabledChange(e.target.checked)} style={{ marginRight: '10px', transform: 'scale(1.5)', accentColor: '#55d6ff' }} />
                            ENABLE WATER FX
                        </label>
                        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '12px', color: '#baf3ff', marginBottom: '8px', opacity: 0.8, letterSpacing: '0.5px' }}>
                            WATER FX INTENSITY: {Math.round(waterSurfaceEffectsIntensity)}%
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={waterSurfaceEffectsIntensity}
                            onChange={(e) => onWaterSurfaceEffectsIntensityChange(parseInt(e.target.value, 10))}
                            disabled={!waterSurfaceEffectsEnabled}
                            style={{ width: '100%', accentColor: '#55d6ff', cursor: waterSurfaceEffectsEnabled ? 'pointer' : 'not-allowed', opacity: waterSurfaceEffectsEnabled ? 1 : 0.5 }}
                        />
                    </div>

                    {/* Particle Quality */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '16px', color: '#ffd46a', marginBottom: '12px', textShadow: '0 0 8px #ffd46a', letterSpacing: '1px' }}>
                            WORLD PARTICLES: {worldParticlesQuality === 2 ? 'FULL' : worldParticlesQuality === 1 ? 'LOW' : 'OFF'}
                        </div>
                        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '12px', color: '#ffeab4', marginBottom: '8px', opacity: 0.75, letterSpacing: '0.5px', textAlign: 'left' }}>
                            Controls ambient and combat particles for performance tuning.
                        </div>
                        <select
                            value={worldParticlesQuality}
                            onChange={(e) => onWorldParticlesQualityChange(parseInt(e.target.value, 10))}
                            style={{
                                width: '100%',
                                background: 'rgba(10, 20, 35, 0.9)',
                                color: '#ffeab4',
                                border: '1px solid rgba(255, 212, 106, 0.6)',
                                borderRadius: '6px',
                                padding: '10px',
                                fontFamily: '"Press Start 2P", cursive',
                                fontSize: '11px',
                            }}
                        >
                            <option value={0}>OFF</option>
                            <option value={1}>LOW</option>
                            <option value={2}>FULL</option>
                        </select>
                    </div>

                    {/* Footprints */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '16px', color: '#9ce7a5', marginBottom: '12px', textShadow: '0 0 8px #9ce7a5', letterSpacing: '1px' }}>
                            FOOTPRINTS: {footprintsEnabled ? 'ENABLED' : 'DISABLED'}
                        </div>
                        <div style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '12px', color: '#cdf4d2', marginBottom: '8px', opacity: 0.75, letterSpacing: '0.5px', textAlign: 'left' }}>
                            Ground footprints in sand/snow. Cosmetic only.
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontFamily: '"Press Start 2P", cursive', fontSize: '14px', color: footprintsEnabled ? '#9ce7a5' : '#666', textShadow: footprintsEnabled ? '0 0 5px #9ce7a5' : 'none' }}>
                            <input type="checkbox" checked={footprintsEnabled} onChange={(e) => onFootprintsEnabledChange(e.target.checked)} style={{ marginRight: '10px', transform: 'scale(1.5)', accentColor: '#9ce7a5' }} />
                            ENABLE FOOTPRINTS
                        </label>
                    </div>

                    <div style={{
                        marginBottom: '16px',
                        marginTop: '5px',
                        fontFamily: '"Press Start 2P", cursive',
                        fontSize: '11px',
                        color: '#66d7ff',
                        letterSpacing: '1px',
                        textAlign: 'left',
                        opacity: 0.9,
                    }}>
                        POST PROCESSING
                    </div>

                    {/* Bloom Filter Slider */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#ffe066',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #ffe066',
                            letterSpacing: '1px',
                        }}>
                            BLOOM FILTER: {Math.round(bloomIntensity)}%
                        </div>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#fff2b8',
                            marginBottom: '10px',
                            opacity: 0.75,
                            letterSpacing: '0.5px',
                            textAlign: 'left',
                        }}>
                            Soft glow on bright areas. Tuned for a cozy, cinematic scene.
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={bloomIntensity}
                            onChange={(e) => onBloomIntensityChange(parseInt(e.target.value, 10))}
                            style={{
                                width: '100%',
                                accentColor: '#ffe066',
                                cursor: 'pointer',
                            }}
                        />
                    </div>

                    {/* Vignette Slider */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#d0d8ff',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #d0d8ff',
                            letterSpacing: '1px',
                        }}>
                            VIGNETTE: {Math.round(vignetteIntensity)}%
                        </div>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#dfe5ff',
                            marginBottom: '10px',
                            opacity: 0.75,
                            letterSpacing: '0.5px',
                            textAlign: 'left',
                        }}>
                            Darkens screen edges for depth. Default is intentionally very subtle.
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={vignetteIntensity}
                            onChange={(e) => onVignetteIntensityChange(parseInt(e.target.value, 10))}
                            style={{
                                width: '100%',
                                accentColor: '#d0d8ff',
                                cursor: 'pointer',
                            }}
                        />
                    </div>

                    {/* Chromatic Aberration Slider */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#ff9ad1',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #ff9ad1',
                            letterSpacing: '1px',
                        }}>
                            CHROMATIC ABERRATION: {Math.round(chromaticAberrationIntensity)}%
                        </div>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#ffc5e6',
                            marginBottom: '10px',
                            opacity: 0.75,
                            letterSpacing: '0.5px',
                            textAlign: 'left',
                        }}>
                            Adds a subtle red/green edge split for film-like lens character.
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={chromaticAberrationIntensity}
                            onChange={(e) => onChromaticAberrationIntensityChange(parseInt(e.target.value, 10))}
                            style={{
                                width: '100%',
                                accentColor: '#ff9ad1',
                                cursor: 'pointer',
                            }}
                        />
                    </div>

                    {/* Saturation Slider */}
                    <div style={{ marginBottom: '25px' }}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#8effd1',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #8effd1',
                            letterSpacing: '1px',
                        }}>
                            SATURATION: {Math.round(colorCorrection)}%
                        </div>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#c6ffe8',
                            marginBottom: '10px',
                            opacity: 0.75,
                            letterSpacing: '0.5px',
                            textAlign: 'left',
                        }}>
                            Adjusts color intensity of the world. 50% is neutral.
                        </div>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={colorCorrection}
                            onChange={(e) => onColorCorrectionChange(parseInt(e.target.value, 10))}
                            style={{
                                width: '100%',
                                accentColor: '#8effd1',
                                cursor: 'pointer',
                            }}
                        />
                    </div>

                    {/* Slider Preset Actions */}
                    <div style={{
                        marginBottom: '25px',
                        padding: '14px',
                        borderRadius: '10px',
                        border: '1px solid rgba(180, 255, 220, 0.3)',
                        background: 'linear-gradient(135deg, rgba(12, 32, 36, 0.65), rgba(8, 22, 28, 0.75))',
                        boxShadow: 'inset 0 0 12px rgba(120, 255, 200, 0.1)',
                    }}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '11px',
                            color: '#a8ffd8',
                            opacity: 0.8,
                            marginBottom: '10px',
                            textAlign: 'left',
                            letterSpacing: '0.7px',
                        }}>
                            POST-PROCESSING PRESETS
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => applyPostProcessingPreset('off')}
                                className={styles.menuButton}
                                style={{
                                    flex: '1 1 170px',
                                    minWidth: '150px',
                                    background: 'linear-gradient(135deg, rgba(70, 28, 28, 0.88), rgba(45, 15, 15, 0.96))',
                                    color: '#ffffff',
                                    border: '2px solid #ff7a7a',
                                    borderRadius: '8px',
                                    padding: '12px 14px',
                                    fontFamily: '"Press Start 2P", cursive',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 0 15px rgba(255, 122, 122, 0.35), inset 0 0 10px rgba(255, 122, 122, 0.12)',
                                    textShadow: '0 0 5px rgba(255, 122, 122, 0.85)',
                                    letterSpacing: '1px',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(95, 35, 35, 0.96), rgba(60, 18, 18, 1))';
                                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 0 25px rgba(255, 122, 122, 0.6), inset 0 0 15px rgba(255, 122, 122, 0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(70, 28, 28, 0.88), rgba(45, 15, 15, 0.96))';
                                    e.currentTarget.style.transform = 'translateY(0px) scale(1)';
                                    e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 122, 122, 0.35), inset 0 0 10px rgba(255, 122, 122, 0.12)';
                                }}
                            >
                                OFF (DEFAULT)
                            </button>
                            <button
                                onClick={() => applyPostProcessingPreset('cozy')}
                                className={styles.menuButton}
                                style={{
                                    flex: '1 1 170px',
                                    minWidth: '150px',
                                    background: 'linear-gradient(135deg, rgba(30, 65, 45, 0.85), rgba(20, 45, 30, 0.95))',
                                    color: '#ffffff',
                                    border: '2px solid #66ffb3',
                                    borderRadius: '8px',
                                    padding: '12px 14px',
                                    fontFamily: '"Press Start 2P", cursive',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 0 15px rgba(102, 255, 179, 0.35), inset 0 0 10px rgba(102, 255, 179, 0.12)',
                                    textShadow: '0 0 5px rgba(102, 255, 179, 0.85)',
                                    letterSpacing: '1px',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(45, 85, 60, 0.95), rgba(25, 55, 38, 1))';
                                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 0 25px rgba(102, 255, 179, 0.6), inset 0 0 15px rgba(102, 255, 179, 0.2)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30, 65, 45, 0.85), rgba(20, 45, 30, 0.95))';
                                    e.currentTarget.style.transform = 'translateY(0px) scale(1)';
                                    e.currentTarget.style.boxShadow = '0 0 15px rgba(102, 255, 179, 0.35), inset 0 0 10px rgba(102, 255, 179, 0.12)';
                                }}
                            >
                                COZY
                            </button>
                            <button
                                onClick={() => applyPostProcessingPreset('hdr')}
                                className={styles.menuButton}
                                style={{
                                    flex: '1 1 170px',
                                    minWidth: '150px',
                                    background: 'linear-gradient(135deg, rgba(70, 60, 20, 0.88), rgba(55, 45, 10, 0.96))',
                                    color: '#ffffff',
                                    border: '2px solid #ffd966',
                                    borderRadius: '8px',
                                    padding: '12px 14px',
                                    fontFamily: '"Press Start 2P", cursive',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 0 15px rgba(255, 217, 102, 0.35), inset 0 0 10px rgba(255, 217, 102, 0.12)',
                                    textShadow: '0 0 5px rgba(255, 217, 102, 0.85)',
                                    letterSpacing: '1px',
                                }}
                            >
                                HDR
                            </button>
                            <button
                                onClick={() => applyPostProcessingPreset('cinematic')}
                                className={styles.menuButton}
                                style={{
                                    flex: '1 1 170px',
                                    minWidth: '150px',
                                    background: 'linear-gradient(135deg, rgba(48, 30, 70, 0.88), rgba(28, 15, 45, 0.96))',
                                    color: '#ffffff',
                                    border: '2px solid #c58cff',
                                    borderRadius: '8px',
                                    padding: '12px 14px',
                                    fontFamily: '"Press Start 2P", cursive',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 0 15px rgba(197, 140, 255, 0.35), inset 0 0 10px rgba(197, 140, 255, 0.12)',
                                    textShadow: '0 0 5px rgba(197, 140, 255, 0.85)',
                                    letterSpacing: '1px',
                                }}
                            >
                                CINEMATIC
                            </button>
                            <button
                                onClick={() => applyPostProcessingPreset('clean')}
                                className={styles.menuButton}
                                style={{
                                    flex: '1 1 170px',
                                    minWidth: '150px',
                                    background: 'linear-gradient(135deg, rgba(26, 48, 65, 0.88), rgba(15, 30, 45, 0.96))',
                                    color: '#ffffff',
                                    border: '2px solid #7ccfff',
                                    borderRadius: '8px',
                                    padding: '12px 14px',
                                    fontFamily: '"Press Start 2P", cursive',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 0 15px rgba(124, 207, 255, 0.35), inset 0 0 10px rgba(124, 207, 255, 0.12)',
                                    textShadow: '0 0 5px rgba(124, 207, 255, 0.85)',
                                    letterSpacing: '1px',
                                }}
                            >
                                CLEAN
                            </button>
                        </div>
                    </div>

                </div>

                <div className={styles.menuButtons}>
                    <button 
                        onClick={onBack}
                        className={styles.menuButton}
                        style={{
                            background: 'linear-gradient(135deg, rgba(80, 40, 20, 0.8), rgba(60, 30, 15, 0.9))',
                            color: '#ffffff',
                            border: '2px solid #ff8833',
                            borderRadius: '8px',
                            padding: '15px 30px',
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: '0 0 15px rgba(255, 136, 51, 0.3), inset 0 0 10px rgba(255, 136, 51, 0.1)',
                            textShadow: '0 0 5px rgba(255, 136, 51, 0.8)',
                            letterSpacing: '1px',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(100, 50, 25, 0.9), rgba(80, 40, 20, 1))';
                            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                            e.currentTarget.style.boxShadow = '0 0 25px rgba(255, 136, 51, 0.6), inset 0 0 15px rgba(255, 136, 51, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(80, 40, 20, 0.8), rgba(60, 30, 15, 0.9))';
                            e.currentTarget.style.transform = 'translateY(0px) scale(1)';
                            e.currentTarget.style.boxShadow = '0 0 15px rgba(255, 136, 51, 0.3), inset 0 0 10px rgba(255, 136, 51, 0.1)';
                        }}
                    >
                        NEURAL INTERFACE MENU
                    </button>
                    <button
                        onClick={onClose}
                        className={`${styles.menuButton} ${styles.menuButtonPrimary}`}
                        style={{
                            background: 'linear-gradient(135deg, rgba(20, 40, 80, 0.8), rgba(10, 30, 70, 0.9))',
                            color: '#ffffff',
                            border: '2px solid #00aaff',
                            borderRadius: '8px',
                            padding: '15px 30px',
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: '0 0 15px rgba(0, 170, 255, 0.3), inset 0 0 10px rgba(0, 170, 255, 0.1)',
                            textShadow: '0 0 5px rgba(0, 170, 255, 0.8)',
                            letterSpacing: '1px',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30, 50, 100, 0.9), rgba(15, 40, 90, 1))';
                            e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                            e.currentTarget.style.boxShadow = '0 0 25px rgba(0, 170, 255, 0.6), inset 0 0 15px rgba(0, 170, 255, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(20, 40, 80, 0.8), rgba(10, 30, 70, 0.9))';
                            e.currentTarget.style.transform = 'translateY(0px) scale(1)';
                            e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 170, 255, 0.3), inset 0 0 10px rgba(0, 170, 255, 0.1)';
                        }}
                    >
                        RESUME CONSCIOUSNESS
                    </button>
                </div>
                
                <style>{`
                    @keyframes scanLine {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(100%); }
                    }
                    
                    @keyframes glow {
                        0% { 
                            text-shadow: 0 0 10px rgba(0, 255, 136, 0.8), 0 0 20px rgba(0, 255, 136, 0.4);
                        }
                        100% { 
                            text-shadow: 0 0 15px rgba(0, 255, 136, 1), 0 0 30px rgba(0, 255, 136, 0.6);
                        }
                    }
                    
                    /* Cyberpunk styled scrollbar */
                    .visual-cortex-scroll::-webkit-scrollbar {
                        width: 8px;
                    }
                    
                    .visual-cortex-scroll::-webkit-scrollbar-track {
                        background: rgba(0, 20, 40, 0.8);
                        border-radius: 4px;
                        border: 1px solid rgba(0, 255, 136, 0.2);
                    }
                    
                    .visual-cortex-scroll::-webkit-scrollbar-thumb {
                        background: linear-gradient(180deg, #00ff88 0%, #00aa66 100%);
                        border-radius: 4px;
                        box-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
                    }
                    
                    .visual-cortex-scroll::-webkit-scrollbar-thumb:hover {
                        background: linear-gradient(180deg, #00ffaa 0%, #00cc88 100%);
                        box-shadow: 0 0 12px rgba(0, 255, 136, 0.8);
                    }
                    
                    /* Firefox scrollbar */
                    .visual-cortex-scroll {
                        scrollbar-width: thin;
                        scrollbar-color: #00ff88 rgba(0, 20, 40, 0.8);
                    }
                `}</style>
            </div>
            </div>
        </>
    );
};

export default GameVisualSettingsMenu; 