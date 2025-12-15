/**
 * HotLootIndicator.tsx
 * 
 * Visual indicator component for hot loot feature.
 * Shows a circular progress animation similar to the interaction indicator
 * when items are queued for hot looting.
 */

import React from 'react';
import styles from './HotLootIndicator.module.css';

interface HotLootIndicatorProps {
    progress: number; // 0 to 1
    isActive: boolean;
    size?: number; // Size of the indicator in pixels
}

const HotLootIndicator: React.FC<HotLootIndicatorProps> = ({
    progress,
    isActive,
    size = 24,
}) => {
    if (!isActive) return null;

    // Calculate stroke dasharray for the progress circle
    const radius = (size - 4) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference * (1 - progress);

    return (
        <div 
            className={styles.container}
            style={{ 
                width: size, 
                height: size,
            }}
        >
            {/* Background circle */}
            <svg 
                className={styles.svgContainer}
                width={size} 
                height={size} 
                viewBox={`0 0 ${size} ${size}`}
            >
                {/* Background circle */}
                <circle
                    className={styles.bgCircle}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth="3"
                />
                {/* Progress circle */}
                <circle
                    className={styles.progressCircle}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth="3"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </svg>
            {/* Checkmark icon when complete */}
            {progress >= 1 && (
                <div className={styles.checkmark}>✓</div>
            )}
        </div>
    );
};

export default HotLootIndicator;
