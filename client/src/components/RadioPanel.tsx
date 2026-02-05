/**
 * RadioPanel.tsx
 * 
 * Panel for listening to radio stations using the Transistor Radio item.
 * Displays a retro-styled radio interface with station selection.
 * Opens when player uses the Transistor Radio from ItemInteractionPanel.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './RadioPanel.module.css';
import { DbConnection } from '../generated';
import { Identity } from 'spacetimedb';

// Radio tuning sound files
const RADIO_TUNING_SOUNDS = [
    '/sounds/radio.mp3',
    '/sounds/radio1.mp3',
    '/sounds/radio2.mp3',
    '/sounds/radio3.mp3',
];

// Radio station audio files
const RADIO_STATIC_SOUND = '/sounds/radio_static.mp3';

// Play a random radio tuning sound
const playRandomTuningSound = (volume: number = 0.5): void => {
    const randomIndex = Math.floor(Math.random() * RADIO_TUNING_SOUNDS.length);
    const soundPath = RADIO_TUNING_SOUNDS[randomIndex];
    
    try {
        const audio = new Audio(soundPath);
        audio.volume = volume;
        audio.play().catch(err => {
            console.warn('Failed to play radio tuning sound:', err);
        });
    } catch (err) {
        console.warn('Error creating radio tuning audio:', err);
    }
};

// Radio Station definition
interface RadioStation {
    id: number;
    name: string;
    frequency: string;
    description: string;
    audioFile?: string; // Path to station audio file (if implemented)
}

// Available radio stations - all real channels with unique content
const RADIO_STATIONS: RadioStation[] = [
    {
        id: 1,
        name: "Radio Silence",
        frequency: "87.5 FM",
        description: "Moments of stillness between the static...",
    },
    {
        id: 2,
        name: "Aleutian Whispers",
        frequency: "92.3 FM",
        description: "Old folk tales from the islands",
    },
    {
        id: 3,
        name: "Soviet Remnants",
        frequency: "103.7 FM",
        description: "Abandoned military broadcasts",
    },
    {
        id: 4,
        name: "The Hermit's Hour",
        frequency: "108.1 FM",
        description: "Strange stories from the whale bones",
    },
    {
        id: 5,
        name: "Ocean Frequencies",
        frequency: "95.9 FM",
        description: "Sounds from beneath the waves",
    },
    {
        id: 6,
        name: "Emergency Broadcast",
        frequency: "121.5 FM",
        description: "Civil defense messages that never ended",
    },
];

interface RadioPanelProps {
    playerIdentity: Identity | null;
    connection: DbConnection | null;
    onClose: () => void;
}

const RadioPanel: React.FC<RadioPanelProps> = ({
    playerIdentity,
    connection,
    onClose,
}) => {
    const [selectedStation, setSelectedStation] = useState<RadioStation | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [dialPosition, setDialPosition] = useState(0); // 0-100 representing dial rotation
    const panelRef = useRef<HTMLDivElement>(null);
    
    // Audio ref for station playback
    const stationAudioRef = useRef<HTMLAudioElement | null>(null);
    
    // Radio audio volume
    const RADIO_VOLUME = 0.35;

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);
    
    // Track if we're in "no signal" state (tuned between stations)
    const [isNoSignal, setIsNoSignal] = useState(false);
    
    // Handle audio playback based on selected station and isPlaying state
    useEffect(() => {
        // Stop any existing audio first
        if (stationAudioRef.current) {
            stationAudioRef.current.pause();
            stationAudioRef.current.currentTime = 0;
            stationAudioRef.current = null;
        }
        
        // If no station selected (tuned between stations), play static
        if (isNoSignal) {
            const audio = new Audio(RADIO_STATIC_SOUND);
            audio.loop = true;
            audio.volume = RADIO_VOLUME;
            stationAudioRef.current = audio;
            
            audio.play().catch(err => {
                console.warn('Failed to play radio static:', err);
            });
        }
        // If we have a station selected and should be playing
        else if (selectedStation && isPlaying) {
            // TODO: Add audio files for real stations here
            // For now, stations without audio files are silent
            if (selectedStation.audioFile) {
                const audio = new Audio(selectedStation.audioFile);
                audio.loop = true;
                audio.volume = RADIO_VOLUME;
                stationAudioRef.current = audio;
                
                audio.play().catch(err => {
                    console.warn('Failed to play station audio:', err);
                });
            }
        }
        
        // Cleanup on unmount or when dependencies change
        return () => {
            if (stationAudioRef.current) {
                stationAudioRef.current.pause();
                stationAudioRef.current.currentTime = 0;
                stationAudioRef.current = null;
            }
        };
    }, [selectedStation?.id, selectedStation?.audioFile, isPlaying, isNoSignal]);
    
    // Cleanup audio when panel closes
    useEffect(() => {
        return () => {
            if (stationAudioRef.current) {
                stationAudioRef.current.pause();
                stationAudioRef.current.currentTime = 0;
                stationAudioRef.current = null;
            }
        };
    }, []);

    // Handle station selection
    const handleStationSelect = useCallback((station: RadioStation) => {
        // Play tuning sound when changing stations
        if (selectedStation?.id !== station.id || isNoSignal) {
            playRandomTuningSound(0.4);
        }
        
        setIsNoSignal(false); // We're on a real station now
        setSelectedStation(station);
        setIsPlaying(true);
        // Calculate dial position based on station frequency
        const freqNum = parseFloat(station.frequency);
        const dialPos = ((freqNum - 87.5) / (121.5 - 87.5)) * 100;
        setDialPosition(dialPos);
    }, [selectedStation?.id, isNoSignal]);

    // Handle dial rotation (click on dial area)
    const handleDialClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const dial = e.currentTarget;
        const rect = dial.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = (x / rect.width) * 100;
        setDialPosition(Math.min(100, Math.max(0, percentage)));

        // Find closest station
        const targetFreq = 87.5 + (percentage / 100) * (121.5 - 87.5);
        let closestStation: RadioStation | null = null;
        let closestDist = Infinity;

        for (const station of RADIO_STATIONS) {
            const stationFreq = parseFloat(station.frequency);
            const dist = Math.abs(stationFreq - targetFreq);
            if (dist < closestDist) {
                closestDist = dist;
                closestStation = station;
            }
        }

        // Play tuning sound when dial is clicked
        playRandomTuningSound(0.3);

        // Only select if within 2.0 MHz of a station
        if (closestDist < 2.0 && closestStation) {
            setIsNoSignal(false);
            setSelectedStation(closestStation);
            setIsPlaying(true);
        } else {
            // No station found - play static (no signal)
            setIsNoSignal(true);
            setSelectedStation(null);
            setIsPlaying(false);
        }
    }, []);

    // Toggle play/pause (works for both stations and static)
    const handleTogglePlay = () => {
        if (selectedStation) {
            setIsPlaying(!isPlaying);
        } else if (isNoSignal) {
            // Toggle static off/on
            setIsNoSignal(false);
        }
    };

    return (
        <div className={styles.panelOverlay}>
            <div className={styles.radioPanel} ref={panelRef} data-id="radio-panel">
                <button className={styles.closeButton} onClick={onClose}>×</button>
                
                <div className={styles.header}>
                    <h2 className={styles.title}>Transistor Radio</h2>
                    <p className={styles.subtitle}>Tune into the island frequencies</p>
                </div>

                <div className={styles.content}>
                    {/* Radio Display */}
                    <div className={styles.radioDisplay}>
                        <div className={styles.frequencyDisplay}>
                            {selectedStation 
                                ? selectedStation.frequency 
                                : isNoSignal 
                                    ? `${(87.5 + (dialPosition / 100) * (121.5 - 87.5)).toFixed(1)} FM`
                                    : '---.- FM'}
                        </div>
                        {isNoSignal && (
                            <div className={styles.stationName}>
                                ~ NO SIGNAL ~
                            </div>
                        )}
                        
                        {/* Signal indicator */}
                        <div className={styles.signalIndicator}>
                            <div className={`${styles.signalBar} ${(isPlaying && selectedStation && !isNoSignal) || isNoSignal ? styles.active : ''}`} />
                            <div className={`${styles.signalBar} ${isPlaying && selectedStation && !isNoSignal ? styles.active : ''}`} />
                            <div className={`${styles.signalBar} ${isPlaying && selectedStation && !isNoSignal ? styles.active : ''}`} />
                            <div className={`${styles.signalBar} ${isPlaying && selectedStation && !isNoSignal ? styles.active : ''}`} />
                        </div>
                    </div>

                    {/* Tuning Dial */}
                    <div className={styles.dialContainer}>
                        <div className={styles.dialLabel}>TUNE</div>
                        <div className={styles.dial} onClick={handleDialClick}>
                            <div className={styles.dialTrack}>
                                {/* Station markers */}
                                {RADIO_STATIONS.map(station => {
                                    const freqNum = parseFloat(station.frequency);
                                    const pos = ((freqNum - 87.5) / (121.5 - 87.5)) * 100;
                                    return (
                                        <div 
                                            key={station.id}
                                            className={styles.stationMarker}
                                            style={{ left: `${pos}%` }}
                                            title={station.name}
                                        />
                                    );
                                })}
                                <div 
                                    className={styles.dialIndicator}
                                    style={{ left: `${dialPosition}%` }}
                                />
                            </div>
                            <div className={styles.dialFrequencies}>
                                <span>87.5</span>
                                <span>95</span>
                                <span>103</span>
                                <span>110</span>
                                <span>121.5</span>
                            </div>
                        </div>
                    </div>

                    {/* Play Controls */}
                    <div className={styles.controls}>
                        <button 
                            className={`${styles.playButton} ${(isPlaying || isNoSignal) ? styles.playing : ''}`}
                            onClick={handleTogglePlay}
                            disabled={!selectedStation && !isNoSignal}
                        >
                            {isPlaying || isNoSignal ? '⏸' : '▶'}
                        </button>
                    </div>

                    {/* Station Description */}
                    {selectedStation ? (
                        <div className={styles.stationDescription}>
                            <p>{selectedStation.description}</p>
                            {!selectedStation.audioFile && isPlaying && (
                                <p className={styles.staticText}>Coming soon...</p>
                            )}
                        </div>
                    ) : isNoSignal ? (
                        <div className={styles.stationDescription}>
                            <p>No signal... just static between the frequencies.</p>
                            <p className={styles.staticText}>*crackle* *hiss* *crackle*</p>
                        </div>
                    ) : null}

                    {/* Station List */}
                    <div className={styles.stationList}>
                        <h4>Saved Frequencies</h4>
                        <div className={styles.stations}>
                            {RADIO_STATIONS.map(station => (
                                <button
                                    key={station.id}
                                    className={`${styles.stationButton} ${selectedStation?.id === station.id ? styles.selected : ''} ${!station.audioFile ? styles.noAudio : ''}`}
                                    onClick={() => handleStationSelect(station)}
                                >
                                    <span className={styles.stationFreq}>{station.frequency}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Decorative speaker grille */}
                <div className={styles.speakerGrille}>
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className={styles.grilleLine} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default RadioPanel;
