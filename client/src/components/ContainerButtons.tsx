/**
 * ContainerButtons Component
 * 
 * Simple component that eliminates the repetitive button logic in ExternalContainerUI.tsx
 * Handles toggle/light/extinguish operations for fuel containers.
 */

import React from 'react';
import { 
    ContainerType, ContainerEntity, getContainerConfig, isFuelContainer,
    LANTERN_TYPE_LANTERN, LANTERN_TYPE_ANCESTRAL_WARD, LANTERN_TYPE_SIGNAL_DISRUPTOR, LANTERN_TYPE_MEMORY_BEACON,
    getLanternFuelTypeName
} from '../utils/containerUtils';
import { PopulatedItem } from './InventoryUI';
import { Campfire, Furnace, Lantern } from '../generated';
import styles from './InventoryUI.module.css';

interface ContainerButtonsProps {
    containerType: ContainerType;
    containerEntity: ContainerEntity | null;
    items: (PopulatedItem | null)[];
    onToggle: () => void;
    
    // Special props for lantern light/extinguish
    onLight?: () => void;
    onExtinguish?: () => void;
    
    // Optional additional buttons
    children?: React.ReactNode;
}

const ContainerButtons: React.FC<ContainerButtonsProps> = ({
    containerType,
    containerEntity,
    items,
    onToggle,
    onLight,
    onExtinguish,
    children
}) => {
    const config = getContainerConfig(containerType);
    
    // Only render buttons for fuel containers
    if (!isFuelContainer(containerType) || !containerEntity) {
        return children ? <>{children}</> : null;
    }
    
    const isActive = (containerEntity as any).isBurning || false;
    
    // Check if container has valid fuel
    const hasValidFuel = items.some(item => 
        item && 
        item.definition.fuelBurnDurationSecs !== undefined && 
        item.definition.fuelBurnDurationSecs > 0 && 
        item.instance.quantity > 0
    );
    
    // For lanterns/wards, check for the correct fuel type based on lanternType
    let hasValidLanternFuel = false;
    if (containerType === 'lantern') {
        const lantern = containerEntity as Lantern;
        const requiredFuelName = getLanternFuelTypeName(lantern.lanternType);
        hasValidLanternFuel = items.some(item => 
            item && 
            item.definition.name === requiredFuelName && 
            item.instance.quantity > 0
        );
    }
    
    const isDisabled = !isActive && (containerType === 'lantern' ? !hasValidLanternFuel : !hasValidFuel);
    
    // Get the required fuel name for display (lanterns/wards only)
    let fuelHintText = '';
    if (containerType === 'lantern' && !isActive) {
        const lantern = containerEntity as Lantern;
        const requiredFuelName = getLanternFuelTypeName(lantern.lanternType);
        if (!hasValidLanternFuel) {
            fuelHintText = `Requires ${requiredFuelName}`;
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            {/* Toggle/Light/Extinguish Button */}
            {config.hasToggle && (
                <button
                    onClick={onToggle}
                    disabled={isDisabled}
                    className={`${styles.interactionButton} ${
                        isActive ? styles.extinguishButton : styles.lightFireButton
                    }`}
                >
                    {getButtonText(containerType, isActive, containerEntity)}
                </button>
            )}
            
            {/* Fuel hint for lanterns/wards when no valid fuel */}
            {fuelHintText && (
                <div style={{ 
                    fontSize: '11px', 
                    color: '#ff9999', 
                    textAlign: 'center',
                    fontStyle: 'italic'
                }}>
                    {fuelHintText}
                </div>
            )}
            
            {/* Lantern Light/Extinguish Buttons */}
            {config.hasLightExtinguish && (
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        onClick={onLight || onToggle}
                        disabled={isActive || !hasValidLanternFuel}
                        className={`${styles.interactionButton} ${styles.lightFireButton}`}
                    >
                        {getButtonText(containerType, false, containerEntity)}
                    </button>
                    <button
                        onClick={onExtinguish || onToggle}
                        disabled={!isActive}
                        className={`${styles.interactionButton} ${styles.extinguishButton}`}
                    >
                        {getButtonText(containerType, true, containerEntity)}
                    </button>
                </div>
            )}
            
            {/* Additional buttons passed as children */}
            {children}
        </div>
    );
};

/**
 * Get button text based on container type, lantern type, and state
 */
function getButtonText(containerType: ContainerType, isActive: boolean, containerEntity?: ContainerEntity | null): string {
    if (isActive) {
        switch (containerType) {
            case 'campfire': return 'Extinguish';
            case 'furnace': return 'Extinguish';
            case 'barbecue': return 'Extinguish';
            case 'lantern': 
                // Use appropriate text for ward types
                if (containerEntity) {
                    const lantern = containerEntity as Lantern;
                    switch (lantern.lanternType) {
                        case LANTERN_TYPE_ANCESTRAL_WARD: return 'Deactivate Ward';
                        case LANTERN_TYPE_SIGNAL_DISRUPTOR: return 'Power Down';
                        case LANTERN_TYPE_MEMORY_BEACON: return 'Disable Beacon';
                        default: return 'Extinguish';
                    }
                }
                return 'Extinguish';
            default: return 'Stop';
        }
    } else {
        switch (containerType) {
            case 'campfire': return 'Light Fire';
            case 'furnace': return 'Light Furnace';
            case 'barbecue': return 'Light Barbecue';
            case 'lantern':
                // Use appropriate text for ward types
                if (containerEntity) {
                    const lantern = containerEntity as Lantern;
                    switch (lantern.lanternType) {
                        case LANTERN_TYPE_ANCESTRAL_WARD: return 'Activate Ward';
                        case LANTERN_TYPE_SIGNAL_DISRUPTOR: return 'Power On';
                        case LANTERN_TYPE_MEMORY_BEACON: return 'Enable Beacon';
                        default: return 'Light Lantern';
                    }
                }
                return 'Light Lantern';
            default: return 'Start';
        }
    }
}

export default ContainerButtons; 