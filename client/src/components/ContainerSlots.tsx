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
import { ContainerType, ContainerEntity, getContainerConfig } from '../utils/containerUtils';
import { isWaterContainer, getWaterLevelPercentage } from '../utils/waterContainerHelpers';
import { hasDurabilitySystem, getDurabilityPercentage, isItemBroken, getDurabilityColor } from '../utils/durabilityHelpers';
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
    
    // Container styles
    const containerStyle: React.CSSProperties = {
        ...style,
        ...(isGridLayout ? {
            display: 'grid',
            gridTemplateColumns: `repeat(${config.gridCols}, 1fr)`,
            gap: '4px'
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
                                        backgroundColor: containerType === 'wooden_storage_box' 
                                            ? 'rgba(101, 67, 33, 0.6)' // Brown for compost
                                            : 'rgba(0, 0, 0, 0.5)', // Dark for cooking
                                        borderRadius: '2px',
                                        transition: 'height 0.1s linear',
                                    }}
                                    title={`${containerType === 'wooden_storage_box' ? 'Fertilizing' : 'Cooking'} Progress: ${Math.round(progress * 100)}%`}
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

// Durability indicator component - for weapons, tools, torches (RIGHT side, GREEN)
const DurabilityIndicator: React.FC<{ item: PopulatedItem }> = ({ item }) => {
    const durabilityPercentage = getDurabilityPercentage(item.instance);
    const hasDurability = durabilityPercentage > 0;
    const durabilityColor = getDurabilityColor(item.instance, item.definition);
    const broken = isItemBroken(item.instance);
    
    return (
        <>
            <div
                style={{
                    position: 'absolute',
                    right: '4px',
                    top: '4px',
                    bottom: '14px', // Raised to avoid covering any slot indicators
                    width: '3px',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    borderRadius: '1px',
                    zIndex: 4,
                    pointerEvents: 'none',
                }}
            >
                {hasDurability && (
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '0px',
                            left: '0px',
                            right: '0px',
                            height: `${durabilityPercentage * 100}%`,
                            backgroundColor: durabilityColor,
                            borderRadius: '1px',
                            transition: 'height 0.3s ease-in-out, background-color 0.3s ease-in-out',
                        }}
                    />
                )}
            </div>
            {/* Broken item overlay */}
            {broken && (
                <div style={{
                    position: 'absolute',
                    top: '0px',
                    left: '0px',
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(80, 80, 80, 0.6)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: '2px',
                    pointerEvents: 'none',
                    zIndex: 5
                }}>
                    <span style={{
                        fontSize: '16px',
                        color: 'rgba(255, 100, 100, 0.9)',
                        textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                        userSelect: 'none'
                    }}>
                        ✖
                    </span>
                </div>
            )}
        </>
    );
};

export default ContainerSlots; 