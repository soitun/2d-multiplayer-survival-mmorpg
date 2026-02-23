import React from 'react';
import styles from './MenuComponents.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMusic, faVolumeUp, faLeaf } from '@fortawesome/free-solid-svg-icons';
import { useSettings } from '../contexts/SettingsContext';

// Default audio settings based on optimal neural processing thresholds
export const DEFAULT_AUDIO_SETTINGS = {
    musicVolume: 0.20,        // 20% - Neural Harmony Levels (Cortical Music Enhancement)
    soundVolume: 0.50,       // 50% - Haptic Feedback Matrix (Neural Action Response)
    environmentalVolume: 1.00 // 100% - Atmospheric Sensors (Environmental Analysis)
} as const;

interface GameSettingsMenuProps {
    onBack: () => void;
    onClose: () => void;
}

const GameSettingsMenu: React.FC<GameSettingsMenuProps> = ({
    onBack,
    onClose,
}) => {
    const {
        musicVolume,
        soundVolume,
        environmentalVolume,
        setMusicVolume: onMusicVolumeChange,
        setSoundVolume: onSoundVolumeChange,
        setEnvironmentalVolume: onEnvironmentalVolumeChange,
    } = useSettings();
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onBack();
        }
    };

    const formatVolume = (volume: number) => `${Math.round(volume * 100)}%`;

    const settingCardStyle: React.CSSProperties = {
        marginBottom: '25px',
        padding: '14px 16px',
        borderRadius: '10px',
        border: '1px solid rgba(0, 0, 0, 0.45)',
        background: 'rgba(0, 0, 0, 0.42)',
        boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.35)',
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
                    background: 'linear-gradient(135deg, rgba(25, 10, 40, 0.95), rgba(15, 5, 30, 0.98))',
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
                    background: 'linear-gradient(145deg, rgba(30, 15, 50, 0.95), rgba(20, 10, 40, 0.98))',
                    border: '2px solid #00ffff',
                    borderRadius: '12px',
                    boxShadow: '0 0 30px rgba(0, 255, 255, 0.3), inset 0 0 20px rgba(0, 255, 255, 0.1)',
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
                    background: 'linear-gradient(90deg, transparent, #00ffff, transparent)',
                    animation: 'scanLine 3s linear infinite',
                }} />
                
                <div style={{ textAlign: 'center', marginBottom: '35px' }}>
                    <h2
                        style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '22px',
                            color: '#00ffff',
                            textAlign: 'center',
                            marginBottom: '8px',
                            textShadow: '0 0 10px rgba(0, 255, 255, 0.8), 0 0 20px rgba(0, 255, 255, 0.4)',
                            animation: 'glow 2s ease-in-out infinite alternate',
                            letterSpacing: '2px',
                        }}
                    >
                        AUDITORY CORTEX MODULE
                    </h2>
                    <div
                        style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#6699cc',
                            textAlign: 'center',
                            letterSpacing: '1px',
                            opacity: 0.8,
                        }}
                    >
                        Neural Audio Processing Interface v0.82
                    </div>
                </div>
                
                <div style={{ padding: '20px 0' }}>
                    <div style={settingCardStyle}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#ff6b9d',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #ff6b9d',
                            letterSpacing: '1px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}>
                            <FontAwesomeIcon 
                                icon={faMusic} 
                                style={{
                                    color: '#ff6b9d',
                                    textShadow: '0 0 8px #ff6b9d',
                                    fontSize: '14px',
                                }}
                            />
                            NEURAL HARMONY LEVELS: {Math.round(musicVolume * 100)}%
                        </div>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#ffaacc',
                            marginBottom: '8px',
                            opacity: 0.7,
                            letterSpacing: '0.5px',
                            textAlign: 'left',
                        }}>
                            Cortical Music Enhancement, Ambient Synthesis
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={musicVolume}
                            onChange={(e) => onMusicVolumeChange(parseFloat(e.target.value))}
                            style={{
                                width: '100%',
                                margin: '8px 0',
                            }}
                        />
                    </div>
                    
                    <div style={settingCardStyle}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#4ecdc4',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #4ecdc4',
                            letterSpacing: '1px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}>
                            <FontAwesomeIcon 
                                icon={faVolumeUp} 
                                style={{
                                    color: '#4ecdc4',
                                    textShadow: '0 0 8px #4ecdc4',
                                    fontSize: '14px',
                                }}
                            />
                            HAPTIC FEEDBACK MATRIX: {Math.round(soundVolume * 100)}%
                        </div>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '12px',
                            color: '#88dddd',
                            marginBottom: '8px',
                            opacity: 0.7,
                            letterSpacing: '0.5px',
                            textAlign: 'left',
                        }}>
                            Neural Action Response, Item Recognition
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={soundVolume}
                            onChange={(e) => onSoundVolumeChange(parseFloat(e.target.value))}
                            style={{
                                width: '100%',
                                margin: '8px 0',
                            }}
                        />
                    </div>
                    
                    <div style={settingCardStyle}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '16px',
                            color: '#90ee90',
                            marginBottom: '12px',
                            textShadow: '0 0 8px #90ee90',
                            letterSpacing: '1px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}>
                            <FontAwesomeIcon 
                                icon={faLeaf} 
                                style={{
                                    color: '#90ee90',
                                    textShadow: '0 0 8px #90ee90',
                                    fontSize: '14px',
                                }}
                            />
                            ATMOSPHERIC SENSORS: {Math.round(environmentalVolume * 100)}%
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
                            Weather Synthesis, Environmental Analysis
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={environmentalVolume}
                            onChange={(e) => onEnvironmentalVolumeChange(parseFloat(e.target.value))}
                            style={{
                                width: '100%',
                                margin: '8px 0',
                            }}
                        />
                    </div>

                    {/* Defaults preset */}
                    <div style={settingCardStyle}>
                        <div style={{
                            fontFamily: '"Press Start 2P", cursive',
                            fontSize: '11px',
                            color: '#a8ffd8',
                            opacity: 0.8,
                            marginBottom: '10px',
                            textAlign: 'left',
                            letterSpacing: '0.7px',
                        }}>
                            PRESETS
                        </div>
                        <button
                            onClick={() => {
                                onMusicVolumeChange(DEFAULT_AUDIO_SETTINGS.musicVolume);
                                onSoundVolumeChange(DEFAULT_AUDIO_SETTINGS.soundVolume);
                                onEnvironmentalVolumeChange(DEFAULT_AUDIO_SETTINGS.environmentalVolume);
                            }}
                            className={styles.menuButton}
                            style={{
                                width: '100%',
                                background: 'linear-gradient(135deg, rgba(30, 65, 45, 0.85), rgba(20, 45, 30, 0.95))',
                                color: '#ffffff',
                                border: '2px solid #66ffb3',
                                borderRadius: '8px',
                                padding: '12px 14px',
                                fontFamily: '"Press Start 2P", cursive',
                                fontSize: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                boxShadow: '0 0 15px rgba(102, 255, 179, 0.35), inset 0 0 10px rgba(102, 255, 179, 0.12)',
                                textShadow: '0 0 5px rgba(102, 255, 179, 0.85)',
                                letterSpacing: '1px',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(45, 85, 60, 0.95), rgba(25, 55, 38, 1))';
                                e.currentTarget.style.transform = 'translateY(-2px) scale(1.01)';
                                e.currentTarget.style.boxShadow = '0 0 25px rgba(102, 255, 179, 0.6), inset 0 0 15px rgba(102, 255, 179, 0.2)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30, 65, 45, 0.85), rgba(20, 45, 30, 0.95))';
                                e.currentTarget.style.transform = 'translateY(0px) scale(1)';
                                e.currentTarget.style.boxShadow = '0 0 15px rgba(102, 255, 179, 0.35), inset 0 0 10px rgba(102, 255, 179, 0.12)';
                            }}
                        >
                            DEFAULTS (20% / 50% / 100%)
                        </button>
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
                            text-shadow: 0 0 10px rgba(0, 255, 255, 0.8), 0 0 20px rgba(0, 255, 255, 0.4);
                        }
                        100% { 
                            text-shadow: 0 0 15px rgba(0, 255, 255, 1), 0 0 30px rgba(0, 255, 255, 0.6);
                        }
                    }
                `}</style>
            </div>
        </div>
        </>
    );
};

export default GameSettingsMenu; 