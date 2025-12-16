/**
 * DurabilityBar Component
 * 
 * A visual durability indicator that shows:
 * - Current durability (green/yellow/red based on level)
 * - Lost max durability from repairs (red "degraded" segment at top)
 * 
 * The bar visually communicates the repair degradation system where each
 * repair reduces the maximum durability ceiling, shown as a permanent red
 * segment at the top of the bar.
 */

import React from 'react';
import { InventoryItem, ItemDefinition } from '../generated';
import { 
    getDurabilityPercentage, 
    getDurabilityColor, 
    getMaxDurability, 
    MAX_DURABILITY,
    isItemBroken 
} from '../utils/durabilityHelpers';

interface DurabilityBarProps {
    item: InventoryItem;
    itemDef: ItemDefinition;
    /** Position style overrides */
    style?: React.CSSProperties;
    /** Bar width in pixels (default: 3) */
    width?: number;
    /** Whether to show the bar vertically (default) or horizontally */
    horizontal?: boolean;
}

/**
 * Renders a durability bar with:
 * - Green/yellow/red fill for current durability (from bottom)
 * - Red "lost" segment for reduced max durability (at top)
 */
const DurabilityBar: React.FC<DurabilityBarProps> = ({
    item,
    itemDef,
    style = {},
    width = 3,
    horizontal = false,
}) => {
    const durabilityPercentage = getDurabilityPercentage(item);
    const maxDurability = getMaxDurability(item);
    const isBroken = isItemBroken(item);
    const durabilityColor = getDurabilityColor(item, itemDef);
    
    // Calculate the "lost" durability percentage (from repairs)
    // This is the portion of the bar that's permanently unavailable
    const lostDurabilityPercentage = ((MAX_DURABILITY - maxDurability) / MAX_DURABILITY) * 100;
    
    // Current durability relative to MAX_DURABILITY (100), not the reduced max
    // This way the bar shows the actual current value out of 100
    const currentDurabilityPercentage = durabilityPercentage * 100;
    
    // Only show lost segment if max durability is actually reduced
    const hasLostDurability = maxDurability < MAX_DURABILITY;
    
    const hasDurability = durabilityPercentage > 0;

    if (horizontal) {
        // Horizontal bar (for tooltips, repair bench, etc.)
        return (
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    height: `${width}px`,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    borderRadius: '1px',
                    overflow: 'hidden',
                    ...style,
                }}
            >
                {/* Current durability fill (from left) */}
                {hasDurability && (
                    <div
                        style={{
                            position: 'absolute',
                            left: '0px',
                            top: '0px',
                            bottom: '0px',
                            width: `${currentDurabilityPercentage}%`,
                            backgroundColor: durabilityColor,
                            borderRadius: '1px',
                            transition: 'width 0.3s ease-in-out, background-color 0.3s ease-in-out',
                        }}
                    />
                )}
                
                {/* Lost durability segment (red, from right) */}
                {hasLostDurability && (
                    <div
                        style={{
                            position: 'absolute',
                            right: '0px',
                            top: '0px',
                            bottom: '0px',
                            width: `${lostDurabilityPercentage}%`,
                            backgroundColor: 'rgba(180, 50, 50, 0.9)', // Dark red for lost durability
                            borderRadius: '1px',
                        }}
                    />
                )}
            </div>
        );
    }

    // Vertical bar (default, for inventory/hotbar slots)
    return (
        <div
            style={{
                position: 'absolute',
                right: '4px',
                top: '4px',
                bottom: '14px',
                width: `${width}px`,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '1px',
                zIndex: 4,
                pointerEvents: 'none',
                overflow: 'hidden',
                ...style,
            }}
        >
            {/* Lost durability segment (red, at top) */}
            {hasLostDurability && (
                <div
                    style={{
                        position: 'absolute',
                        top: '0px',
                        left: '0px',
                        right: '0px',
                        height: `${lostDurabilityPercentage}%`,
                        backgroundColor: 'rgba(180, 50, 50, 0.9)', // Dark red for lost durability
                        borderRadius: '1px',
                    }}
                />
            )}
            
            {/* Current durability fill (from bottom) */}
            {hasDurability && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: '0px',
                        left: '0px',
                        right: '0px',
                        height: `${currentDurabilityPercentage}%`,
                        backgroundColor: durabilityColor,
                        borderRadius: '1px',
                        transition: 'height 0.3s ease-in-out, background-color 0.3s ease-in-out',
                    }}
                />
            )}
        </div>
    );
};

export default DurabilityBar;

