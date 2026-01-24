/**
 * ContainerSlots Component
 * 
 * Simple component that eliminates the repetitive slot rendering logic in ExternalContainerUI.tsx
 * Handles the DroppableSlot + DraggableItem pattern that's duplicated 7 times.
 */

import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import DroppableSlot from './DroppableSlot';
import DraggableItem from './DraggableItem';
import { PopulatedItem } from './InventoryUI';
import { DragSourceSlotInfo, DraggedItemInfo } from '../types/dragDropTypes';
import { ContainerType, ContainerEntity, getContainerConfig, BOX_TYPE_MILITARY_RATION } from '../utils/containerUtils';
import { WoodenStorageBox, RangedWeaponStats } from '../generated';
import { isWaterContainer, getWaterLevelPercentage } from '../utils/waterContainerHelpers';
import { hasDurabilitySystem, isItemBroken, isFoodItem } from '../utils/durabilityHelpers';
import DurabilityBar from './DurabilityBar';
import styles from './InventoryUI.module.css';

interface ContainerSlotsProps {
    containerType: ContainerType;
    items: (PopulatedItem | null)[];
    createSlotInfo: (index: number) => DragSourceSlotInfo | null;
    getSlotKey: (index: number) => string;
    
    // Drag and drop handlers
    onItemDragStart: (info: DraggedItemInfo) => void;
    onItemDrop: (targetSlotInfo: DragSourceSlotInfo | null) => void;
    
    // Context menu handler
    onContextMenu: (event: React.MouseEvent, itemInfo: PopulatedItem, slotIndex: number) => void;
    
    // Mouse event handlers for tooltips
    onItemMouseEnter: (item: PopulatedItem, event: React.MouseEvent<HTMLDivElement>) => void;
    onItemMouseLeave: () => void;
    onItemMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
    
    // Optional styling
    className?: string;
    style?: React.CSSProperties;
    
    // Optional disabled slots (for campfire with broth pot)
    disabledSlots?: Set<number>;
    
    // Optional container entity for dynamic config (e.g., WoodenStorageBox with boxType)
    containerEntity?: ContainerEntity;
    
    // Optional progress data for cooking/fertilizing overlays (slot index -> progress 0.0-1.0)
    slotProgress?: Map<number, number>;
    
    // Hot loot props
    isHotLootActive?: boolean;
    getSlotIndicator?: (slotType: string, slotIndex: number | string, parentId?: number | bigint) => { progress: number } | undefined;
    onHotLootSlotHover?: (item: PopulatedItem, slotInfo: DragSourceSlotInfo, context: 'player' | 'container') => void;
    setHotLootCurrentHover?: (item: PopulatedItem | null, slotInfo: DragSourceSlotInfo | null, context: 'player' | 'container' | null) => void;
    
    // Ranged weapon stats for ammo bar display
    rangedWeaponStats?: Map<string, RangedWeaponStats>;
}

const ContainerSlots: React.FC<ContainerSlotsProps> = ({
    containerType,
    items,
    createSlotInfo,
    getSlotKey,
    onItemDragStart,
    onItemDrop,
    onContextMenu,
    onItemMouseEnter,
    onItemMouseLeave,
    onItemMouseMove,
    className,
    style,
    disabledSlots,
    containerEntity,
    slotProgress,
    isHotLootActive,
    getSlotIndicator,
    onHotLootSlotHover,
    setHotLootCurrentHover,
    rangedWeaponStats,
}) => {
    // Track slot element refs for overlay positioning
    const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const [slotPositions, setSlotPositions] = useState<Map<number, DOMRect>>(new Map());
    
    // Update slot positions when slots are rendered or progress changes
    useEffect(() => {
        const updatePositions = () => {
            const newPositions = new Map<number, DOMRect>();
            slotRefs.current.forEach((element, index) => {
                if (element) {
                    const rect = element.getBoundingClientRect();
                    newPositions.set(index, rect);
                }
            });
            setSlotPositions(newPositions);
        };
        
        updatePositions();
        // Update on window resize
        window.addEventListener('resize', updatePositions);
        // Update on scroll (in case container is in scrollable area)
        window.addEventListener('scroll', updatePositions, true);
        
        return () => {
            window.removeEventListener('resize', updatePositions);
            window.removeEventListener('scroll', updatePositions, true);
        };
    }, [items, slotProgress]);
    const config = getContainerConfig(containerType, containerEntity);
    
    // Determine if this should render as a grid
    const isGridLayout = config.gridCols && config.gridCols > 1;
    
    // Check if this is a military ration (3 slots, should be close together and centered)
    const isMilitaryRation = containerType === 'wooden_storage_box' && 
                             containerEntity && 
                             (containerEntity as WoodenStorageBox).boxType === BOX_TYPE_MILITARY_RATION;
    
    // Container styles
    const containerStyle: React.CSSProperties = {
        ...style,
        ...(isGridLayout ? {
            display: 'grid',
            gridTemplateColumns: `repeat(${config.gridCols}, 1fr)`,
            gap: isMilitaryRation ? '2px' : '4px', // Tighter spacing for military rations
            justifyContent: 'center', // Center the grid
            width: 'fit-content', // Allow grid to shrink to content
            margin: '0 auto' // Center horizontally
        } : {
            display: 'flex',
            flexDirection: 'row',
            gap: '4px',
            // Center all containers
            justifyContent: 'center'
        })
    };
    
    const containerClassName = className || (isGridLayout ? styles.inventoryGrid : styles.multiSlotContainer);
    
    // Use items.length if it's less than config.slots (for special cases like water container slot)
    // Otherwise use config.slots to show all slots even if some are empty
    const numSlotsToRender = items.length < config.slots ? items.length : config.slots;
    
    return (
        <div className={containerClassName} style={containerStyle}>
            {Array.from({ length: numSlotsToRender }).map((_, index) => {
                const itemInSlot = items[index] || null;
                const slotInfo = createSlotInfo(index);
                const slotKey = getSlotKey(index);
                const isDisabled = disabledSlots?.has(index) || false;
                
                if (!slotInfo) return null;
                
                const progress = slotProgress?.get(index) ?? 0;
                const hasProgress = progress > 0 && progress < 1.0;
                
                // Hot loot indicator for this slot
                const hotLootIndicator = getSlotIndicator?.(slotInfo.type, slotInfo.index, slotInfo.parentId);
                
                return (
                    <div
                        key={`slot-wrapper-${slotKey}`}
                        ref={(el) => {
                            if (el) {
                                slotRefs.current.set(index, el);
                            } else {
                                slotRefs.current.delete(index);
                            }
                        }}
                        style={{ position: 'relative' }}
                    >
                        <DroppableSlot
                            key={slotKey}
                            slotInfo={slotInfo}
                            onItemDrop={onItemDrop}
                            className={styles.slot}
                            isDraggingOver={false} // Could be enhanced with actual drag state
                            style={isDisabled ? {
                                opacity: 0.3,
                                pointerEvents: 'none',
                                filter: 'grayscale(100%)',
                                cursor: 'not-allowed'
                            } : undefined}
                            isHotLootActive={isHotLootActive && !isDisabled && !!itemInSlot}
                            hotLootIndicatorProgress={hotLootIndicator?.progress}
                            onHotLootHover={itemInSlot && onHotLootSlotHover ? () => onHotLootSlotHover(itemInSlot, slotInfo, 'container') : undefined}
                            onHotLootEnter={setHotLootCurrentHover ? () => setHotLootCurrentHover(itemInSlot || null, slotInfo, 'container') : undefined}
                            onHotLootLeave={setHotLootCurrentHover ? () => setHotLootCurrentHover(null, null, null) : undefined}
                        >
                        {itemInSlot && (
                            <DraggableItem
                                item={itemInSlot}
                                sourceSlot={slotInfo}
                                onItemDragStart={isDisabled ? () => {} : onItemDragStart}
                                onItemDrop={isDisabled ? () => {} : onItemDrop}
                                onContextMenu={isDisabled ? () => {} : (event) => onContextMenu(event, itemInSlot, index)}
                                onMouseEnter={isDisabled ? () => {} : (e) => onItemMouseEnter(itemInSlot, e)}
                                onMouseLeave={isDisabled ? () => {} : onItemMouseLeave}
                                onMouseMove={isDisabled ? () => {} : onItemMouseMove}
                            />
                        )}
                        
                        {/* Water level indicator - same pattern used across all containers */}
                        {itemInSlot && isWaterContainer(itemInSlot.definition.name) && (
                            <WaterLevelIndicator item={itemInSlot} />
                        )}
                        
                        {/* Ammo bar indicator - for magazine-based ranged weapons (LEFT side) */}
                        {itemInSlot && itemInSlot.definition.category.tag === 'RangedWeapon' && rangedWeaponStats && (
                            <AmmoBarIndicator item={itemInSlot} rangedWeaponStats={rangedWeaponStats} />
                        )}
                        
                        {/* Durability indicator - for weapons, tools, torches (RIGHT side, GREEN) */}
                        {itemInSlot && hasDurabilitySystem(itemInSlot.definition) && (
                            <DurabilityIndicator item={itemInSlot} />
                        )}
                        
                        {/* Droplet icon for rain collector slot - always show in bottom left */}
                        {containerType === 'rain_collector' && index === 0 && (
                            <div style={{
                                position: 'absolute',
                                top: '4px',
                                left: '4px',
                                fontSize: '14px',
                                zIndex: 5,
                                pointerEvents: 'none',
                                textShadow: '0 0 2px rgba(0, 0, 0, 0.8)'
                            }}>
                                💧
                            </div>
                        )}
                        </DroppableSlot>
                        
                        {/* Progress overlay - similar to Hotbar weapon cooldown */}
                        {hasProgress && slotPositions.has(index) && createPortal(
                            <div
                                style={{
                                    position: 'fixed',
                                    left: `${slotPositions.get(index)!.left}px`,
                                    top: `${slotPositions.get(index)!.top}px`,
                                    width: `${slotPositions.get(index)!.width}px`,
                                    height: `${slotPositions.get(index)!.height}px`,
                                    zIndex: 10000, // Above everything
                                    pointerEvents: 'none',
                                }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '0px',
                                        left: '0px',
                                        width: '100%',
                                        height: `${(1 - progress) * 100}%`,
                                        backgroundColor: 'rgba(0, 200, 100, 0.4)', // Dark green for all fuel burn progress
                                        borderRadius: '2px',
                                        transition: 'height 0.1s linear',
                                    }}
                                    title={`${
                                        containerType === 'wooden_storage_box' ? 'Fertilizing' : 
                                        containerType === 'lantern' ? 'Fuel Burn' : 
                                        'Cooking'
                                    } Progress: ${Math.round(progress * 100)}%`}
                                />
                            </div>,
                            document.body
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// Water level indicator component - extracted from repeated pattern
const WaterLevelIndicator: React.FC<{ item: PopulatedItem }> = ({ item }) => {
    const waterLevelPercentage = getWaterLevelPercentage(item.instance, item.definition.name);
    const hasWater = waterLevelPercentage > 0;
    
    return (
        <div
            style={{
                position: 'absolute',
                left: '4px',
                top: '4px',
                bottom: '4px',
                width: '3px',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '1px',
                zIndex: 4,
                pointerEvents: 'none',
            }}
        >
            {hasWater && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: '0px',
                        left: '0px',
                        right: '0px',
                        height: `${waterLevelPercentage * 100}%`,
                        backgroundColor: 'rgba(0, 150, 255, 0.8)',
                        borderRadius: '1px',
                        transition: 'height 0.3s ease-in-out',
                    }}
                />
            )}
        </div>
    );
};

// Durability indicator component - for weapons, tools, torches (RIGHT side)
// Shows current durability in green/yellow/red and lost max durability (from repairs) in red at top
const DurabilityIndicator: React.FC<{ item: PopulatedItem }> = ({ item }) => {
    const broken = isItemBroken(item.instance);
    const isFood = isFoodItem(item.definition);
    
    return (
        <>
            {/* Durability bar with red "lost" segment */}
            <DurabilityBar 
                item={item.instance}
                itemDef={item.definition}
                style={{ bottom: '14px' }} // Raised to avoid covering any slot indicators
            />
            
            {/* Broken item overlay or Spoiled food overlay */}
            {broken && (
                <div style={{
                    position: 'absolute',
                    top: '0px',
                    left: '0px',
                    width: '100%',
                    height: '100%',
                    backgroundColor: isFood
                        ? 'rgba(139, 69, 19, 0.6)' // Brownish overlay for spoiled food
                        : 'rgba(80, 80, 80, 0.6)', // Gray overlay for broken items
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: '2px',
                    pointerEvents: 'none',
                    zIndex: 5
                }}>
                    <span style={{
                        fontSize: '16px',
                        color: isFood
                            ? 'rgba(255, 200, 100, 0.9)' // Yellowish for spoiled food
                            : 'rgba(255, 100, 100, 0.9)', // Red for broken items
                        textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                        userSelect: 'none'
                    }}>
                        {isFood ? '🦠' : '✖'}
                    </span>
                </div>
            )}
        </>
    );
};

// Ammo bar indicator component - for magazine-based ranged weapons (LEFT side)
// Shows individual bullet notches in brass/gold color
const AmmoBarIndicator: React.FC<{ 
    item: PopulatedItem; 
    rangedWeaponStats: Map<string, RangedWeaponStats>;
}> = ({ item, rangedWeaponStats }) => {
    const weaponStats = rangedWeaponStats.get(item.definition.name);
    const magazineCapacity = weaponStats?.magazineCapacity ?? 0;
    
    // Only show for magazine-based weapons
    if (magazineCapacity === 0) return null;
    
    // For items in containers, ammo is always stored in itemData JSON (not equipped)
    let loadedAmmoCount = 0;
    if (item.instance.itemData) {
        try {
            const itemData = JSON.parse(item.instance.itemData);
            loadedAmmoCount = itemData.loaded_ammo_count ?? 0;
        } catch {
            loadedAmmoCount = 0;
        }
    }
    
    return (
        <div
            style={{
                position: 'absolute',
                left: '3px',
                top: '4px',
                bottom: '4px',
                width: '6px',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                borderRadius: '2px',
                zIndex: 4,
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column-reverse',
                padding: '1px',
                boxSizing: 'border-box',
                border: '1px solid rgba(255, 200, 100, 0.4)',
            }}
        >
            {Array.from({ length: magazineCapacity }).map((_, bulletIndex) => {
                const isFilled = bulletIndex < loadedAmmoCount;
                return (
                    <div
                        key={`container-ammo-${bulletIndex}`}
                        style={{
                            flex: 1,
                            marginTop: bulletIndex > 0 ? '1px' : '0px',
                            backgroundColor: isFilled 
                                ? 'rgba(255, 200, 80, 0.95)'
                                : 'rgba(60, 60, 60, 0.6)',
                            borderRadius: '1px',
                            boxShadow: isFilled 
                                ? '0 0 3px rgba(255, 180, 50, 0.8)' 
                                : 'none',
                            transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
                        }}
                    />
                );
            })}
        </div>
    );
};

export default ContainerSlots; 