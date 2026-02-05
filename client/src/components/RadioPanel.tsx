/**
 * RadioPanel.tsx
 * 
 * Panel for listening to radio stations using the Transistor Radio item.
 * Displays a retro-styled radio interface with station selection.
 * Opens when player uses the Transistor Radio from ItemInteractionPanel.
 */

import React, { useState, useEffect, useRef } from 'react';
import styles from './RadioPanel.module.css';
import { DbConnection } from '../generated';
import { Identity } from 'spacetimedb';

// Radio Station definition
interface RadioStation {
    id: number;
    name: string;
    frequency: string;
    description: string;
    isStatic: boolean; // If true, plays static noise (no signal)
}

// Available radio stations
const RADIO_STATIONS: RadioStation[] = [
    {
        id: 1,
        name: "Radio Silence",
        frequency: "87.5 FM",
        description: "Just the crackling void...",
        isStatic: true,
    },
    {
        id: 2,
        name: "Aleutian Whispers",
        frequency: "92.3 FM",
        description: "Old folk tales from the islands",
        isStatic: false,
    },
    {
        id: 3,
        name: "Soviet Remnants",
        frequency: "103.7 FM",
        description: "Abandoned military broadcasts",
        isStatic: false,
    },
    {
        id: 4,
        name: "The Hermit's Hour",
        frequency: "108.1 FM",
        description: "Strange stories from the whale bones",
        isStatic: false,
    },
    {
        id: 5,
        name: "Ocean Frequencies",
        frequency: "95.9 FM",
        description: "Sounds from beneath the waves",
        isStatic: false,
    },
    {
        id: 6,
        name: "Emergency Broadcast",
        frequency: "121.5 FM",
        description: "...signal interrupted...",
        isStatic: true,
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

    // Handle station selection
    const handleStationSelect = (station: RadioStation) => {
        setSelectedStation(station);
        setIsPlaying(true);
        // Calculate dial position based on station frequency
        const freqNum = parseFloat(station.frequency);
        const dialPos = ((freqNum - 87.5) / (121.5 - 87.5)) * 100;
        setDialPosition(dialPos);
    };

    // Handle dial rotation (click on dial area)
    const handleDialClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const dial = e.currentTarget;
        const rect = dial.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = (x / rect.width) * 100;
        setDialPosition(Math.min(100, Math.max(0, percentage)));
        
        // Find closest station
        const targetFreq = 87.5 + (percentage / 100) * (121.5 - 87.5);
        let closestStation = RADIO_STATIONS[0];
        let closestDist = Infinity;
        
        for (const station of RADIO_STATIONS) {
            const stationFreq = parseFloat(station.frequency);
            const dist = Math.abs(stationFreq - targetFreq);
            if (dist < closestDist) {
                closestDist = dist;
                closestStation = station;
            }
        }
        
        // Only select if within 2.0 MHz of a station
        if (closestDist < 2.0) {
            setSelectedStation(closestStation);
            setIsPlaying(true);
        } else {
            setSelectedStation(null);
            setIsPlaying(false);
        }
    };

    // Toggle play/pause
    const handleTogglePlay = () => {
        if (selectedStation) {
            setIsPlaying(!isPlaying);
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
                            {selectedStation ? selectedStation.frequency : '---.- FM'}
                        </div>
                        <div className={styles.stationName}>
                            {selectedStation ? selectedStation.name : 'No Signal'}
                        </div>
                        
                        {/* Signal indicator */}
                        <div className={styles.signalIndicator}>
                            <div className={`${styles.signalBar} ${isPlaying && selectedStation && !selectedStation.isStatic ? styles.active : ''}`} />
                            <div className={`${styles.signalBar} ${isPlaying && selectedStation && !selectedStation.isStatic ? styles.active : ''}`} />
                            <div className={`${styles.signalBar} ${isPlaying && selectedStation && !selectedStation.isStatic ? styles.active : ''}`} />
                            <div className={`${styles.signalBar} ${isPlaying && selectedStation ? styles.active : ''}`} />
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
                            className={`${styles.playButton} ${isPlaying ? styles.playing : ''}`}
                            onClick={handleTogglePlay}
                            disabled={!selectedStation}
                        >
                            {isPlaying ? '⏸' : '▶'}
                        </button>
                    </div>

                    {/* Station Description */}
                    {selectedStation && (
                        <div className={styles.stationDescription}>
                            <p>{selectedStation.description}</p>
                            {selectedStation.isStatic && isPlaying && (
                                <p className={styles.staticText}>*crackle* *hiss* *crackle*</p>
                            )}
                        </div>
                    )}

                    {/* Station List */}
                    <div className={styles.stationList}>
                        <h4>Saved Frequencies</h4>
                        <div className={styles.stations}>
                            {RADIO_STATIONS.map(station => (
                                <button
                                    key={station.id}
                                    className={`${styles.stationButton} ${selectedStation?.id === station.id ? styles.selected : ''} ${station.isStatic ? styles.static : ''}`}
                                    onClick={() => handleStationSelect(station)}
                                >
                                    <span className={styles.stationFreq}>{station.frequency}</span>
                                    <span className={styles.stationTitle}>{station.name}</span>
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
