import React from 'react';
import styles from './MenuComponents.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTree, faCloudRain, faHeartPulse, faLeaf } from '@fortawesome/free-solid-svg-icons';

// Default visual settings based on optimal neural rendering thresholds
export const DEFAULT_VISUAL_SETTINGS = {
    treeShadowsEnabled: true,        // Enable tree shadows
    weatherOverlayEnabled: true,     // Enable weather overlay effects
    statusOverlaysEnabled: true,     // Enable cold/low health screen overlays
    grassEnabled: true,              // Enable grass rendering and subscriptions
} as const;

interface GameVisualSettingsMenuProps {
    onBack: () => void;
    onClose: () => void;
    treeShadowsEnabled: boolean;
    onTreeShadowsChange: (enabled: boolean) => void;
    weatherOverlayEnabled: boolean;
    onWeatherOverlayChange: (enabled: boolean) => void;
    statusOverlaysEnabled: boolean;
    onStatusOverlaysChange: (enabled: boolean) => void;
    grassEnabled: boolean;
    onGrassChange: (enabled: boolean) => void;
}

const GameVisualSettingsMenu: React.FC<GameVisualSettingsMenuProps> = ({
    onBack,
    onClose,
    treeShadowsEnabled,
    onTreeShadowsChange,
    weatherOverlayEnabled,
    onWeatherOverlayChange,
    statusOverlaysEnabled,
    onStatusOverlaysChange,
    grassEnabled,
    onGrassChange,
}) => {
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onBack();
        }
    };

    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(135deg, rgba(10, 25, 40, 0.95), rgba(5, 15, 30, 0.98))',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 100000,
                    backdropFilter: 'blur(8px)',
                }}
                onClick={handleBackdropClick}
            >

            <div
                className={styles.menuContainer}
                style={{
                    maxWidth: '600px',
                    maxHeight: '80vh',
                    background: 'linear-gradient(145deg, rgba(15, 30, 50, 0.95), rgba(10, 20, 40, 0.98))',
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

                <div style={{ padding: '20px 0' }}>
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
                            TREE SHADOWS: {treeShadowsEnabled ? 'ENABLED' : 'DISABLED'}
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
                            {treeShadowsEnabled 
                                ? 'Performance may decrease in dense forests' 
                                : 'Disabled for better performance'
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
                                color: treeShadowsEnabled ? '#88ff44' : '#666',
                                textShadow: treeShadowsEnabled ? '0 0 5px #88ff44' : 'none',
                                transition: 'all 0.3s ease',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={treeShadowsEnabled}
                                    onChange={(e) => onTreeShadowsChange(e.target.checked)}
                                    style={{
                                        marginRight: '10px',
                                        transform: 'scale(1.5)',
                                        accentColor: '#00ff88',
                                    }}
                                />
                                ENABLE SHADOWS
                            </label>
                        </div>
                    </div>

                    {/* Weather Overlay Setting */}
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
                            RAIN PARTICLES: {weatherOverlayEnabled ? 'ENABLED' : 'DISABLED'}
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
                                ? 'Rain particles may reduce performance' 
                                : 'Rain disabled, atmosphere remains for feedback'
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
                                ENABLE RAIN
                            </label>
                        </div>
                    </div>

                    {/* Grass Setting */}
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
                `}</style>
            </div>
            </div>
        </>
    );
};

export default GameVisualSettingsMenu; 