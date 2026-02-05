/**
 * ItemInteractionPanel.tsx
 * 
 * Displays an item interaction panel that appears when a player left-clicks an item.
 * Shows the item's icon, name, description, and context-specific action buttons.
 * Supports actions like "Crush" for bones/skulls, "Consume" for consumables,
 * and stack splitting for all stackable items.
 */

import React, { useCallback, useState, useEffect } from 'react';
import styles from './ItemInteractionPanel.module.css';
import { PopulatedItem } from './InventoryUI';
import { DbConnection } from '../generated';
import { getItemIcon } from '../utils/itemIconUtils';
import { isWaterContainer, hasWaterContent } from '../utils/waterContainerHelpers';
import { playImmediateSound } from '../hooks/useSoundSystem';

interface ItemInteractionPanelProps {
    selectedItem: PopulatedItem;
    connection: DbConnection | null;
    onClose: () => void;
    onStartSplitDrag?: (itemInfo: PopulatedItem, quantity: number) => void;
    onOpenBoneCarving?: () => void; // Opens the bone carving panel
    onOpenRadio?: () => void; // Opens the radio panel
}

interface ItemAction {
    label: string;
    action: string;
    description: string;
    buttonStyle?: string; // Optional class name for button styling
}

const ItemInteractionPanel: React.FC<ItemInteractionPanelProps> = ({ 
    selectedItem, 
    connection, 
    onClose,
    onStartSplitDrag,
    onOpenBoneCarving,
    onOpenRadio
}) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentItemQuantity, setCurrentItemQuantity] = useState(selectedItem.instance.quantity);
    const [splitQuantity, setSplitQuantity] = useState(1);

    // Update quantity and reset split quantity when selected item changes
    useEffect(() => {
        setCurrentItemQuantity(selectedItem.instance.quantity);
        setSplitQuantity(1);
    }, [selectedItem]);

    // Subscribe to inventory updates to track item quantity
    useEffect(() => {
        if (!connection) return;

        const handleInventoryUpdate = (ctx: any, oldRow: any, newRow: any) => {
            if (newRow.instanceId === selectedItem.instance.instanceId) {
                setCurrentItemQuantity(newRow.quantity);
                if (newRow.quantity === 0) {
                    // Item stack is depleted, close panel
                    onClose();
                }
            }
        };

        const handleInventoryDelete = (ctx: any, row: any) => {
            if (row.instanceId === selectedItem.instance.instanceId) {
                // Item was deleted, close panel
                onClose();
            }
        };

        // Subscribe to inventory updates
        connection.db.inventoryItem.onUpdate(handleInventoryUpdate);
        connection.db.inventoryItem.onDelete(handleInventoryDelete);

        return () => {
            // Cleanup subscriptions
            connection.db.inventoryItem.removeOnUpdate(handleInventoryUpdate);
            connection.db.inventoryItem.removeOnDelete(handleInventoryDelete);
        };
    }, [connection, selectedItem.instance.instanceId, onClose]);

    // Determine available actions based on item definition
    const getAvailableActions = useCallback((item: PopulatedItem): ItemAction[] => {
        const actions: ItemAction[] = [];
        const def = item.definition;

        // Check if item is crushable (specific items only)
        const itemName = def.name;
        if (itemName === "Animal Bone" || 
            itemName === "Human Skull" || 
            itemName === "Fox Skull" || 
            itemName === "Wolf Skull" || 
            itemName === "Viper Skull" ||
            itemName === "Walrus Skull" ||
            itemName === "Vole Skull" ||
            itemName === "Wolverine Skull" ||
            itemName === "Whale Bone Fragment" ||
            itemName === "Polar Bear Skull" ||
            itemName === "Hare Skull" ||
            itemName === "Owl Skull" ||
            itemName === "Tern Skull" ||
            itemName === "Crow Skull" ||
            itemName === "Shark Skull") {
            actions.push({
                label: 'Crush',
                action: 'crush',
                description: 'Crush into bone fragments',
                buttonStyle: 'crushButton'
            });
        }

        // Check if item is unravelable (Rope -> Plant Fiber with penalty)
        if (itemName === "Rope") {
            actions.push({
                label: 'Unravel',
                action: 'unravel',
                description: 'Unravel into plant fiber (10-14)',
                buttonStyle: 'crushButton' // Reuse the same style
            });
        }

        // Check if item can be pulverized into flour (traditional Aleut flour sources)
        if (itemName === "Kamchatka Lily Bulb" ||
            itemName === "Silverweed Root" ||
            itemName === "Bistort Bulbils" ||
            itemName === "Angelica Seeds" ||
            itemName === "Beach Lyme Grass Seeds") {
            actions.push({
                label: 'Pulverize',
                action: 'pulverize',
                description: 'Grind into flour',
                buttonStyle: 'crushButton' // Reuse the same style
            });
        }

        // Check if item can be mashed into Berry Mash
        if (itemName === "Lingonberries" ||
            itemName === "Cloudberries" ||
            itemName === "Crowberries" ||
            itemName === "Crowberry" ||
            itemName === "Bilberries" ||
            itemName === "Wild Strawberries" ||
            itemName === "Rowan Berries" ||
            itemName === "Cranberries" ||
            itemName === "Nagoonberries") {
            actions.push({
                label: 'Mash',
                action: 'mash_berries',
                description: 'Mash into Berry Mash',
                buttonStyle: 'crushButton'
            });
        }

        // Check if item can be mashed into Starchy Mash (cooked starchy items)
        // Note: Flour is for baking bread, not brewing - no mash option for flour
        if (itemName === "Cooked Potato" ||
            itemName === "Cooked Beet" ||
            itemName === "Cooked Pumpkin" ||
            itemName === "Cooked Kamchatka Lily Bulb" ||
            itemName === "Cooked Silverweed Root" ||
            itemName === "Cooked Bistort Bulbils" ||
            itemName === "Cooked Salsify Root") {
            actions.push({
                label: 'Mash',
                action: 'mash_starch',
                description: 'Mash into Starchy Mash',
                buttonStyle: 'crushButton'
            });
        }

        // Check if item can have yeast extracted (fermentable bases)
        if (itemName === "Berry Mash" ||
            itemName === "Starchy Mash" ||
            itemName === "Raw Milk") {
            actions.push({
                label: 'Extract Yeast',
                action: 'extract_yeast',
                description: 'Extract natural yeasts',
                buttonStyle: 'crushButton'
            });
        }

        // Check if item can be extracted (honeycomb -> queen bee or yeast)
        if (itemName === "Honeycomb") {
            actions.push({
                label: 'Extract',
                action: 'extract_from_honeycomb',
                description: 'Extract Queen Bee (15%) or Yeast (85%)',
                buttonStyle: 'crushButton'
            });
        }

        // Check if item is the Bone Carving Kit
        if (itemName === "Bone Carving Kit") {
            actions.push({
                label: 'Use Carving Kit',
                action: 'use_carving_kit',
                description: 'Open bone carving interface',
                buttonStyle: 'carvingKitButton'
            });
        }

        // Check if item is the Transistor Radio
        if (itemName === "Transistor Radio") {
            actions.push({
                label: 'Listen',
                action: 'use_radio',
                description: 'Tune into radio frequencies',
                buttonStyle: 'radioButton'
            });
        }

        // Check if item is a water container with water content
        if (isWaterContainer(itemName) && hasWaterContent(item.instance)) {
            actions.push({
                label: 'Drink',
                action: 'drink',
                description: 'Drink water from this container',
                buttonStyle: 'consumeButton'
            });
        }

        // Check if item is consumable (but not a bandage or water container)
        if (itemName !== "Bandage" && !isWaterContainer(itemName) && (
            def.category.tag === 'Consumable' || 
            def.consumableHealthGain !== undefined ||
            def.consumableHungerSatiated !== undefined ||
            def.consumableThirstQuenched !== undefined)) {
            actions.push({
                label: 'Consume',
                action: 'consume',
                description: 'Use this item',
                buttonStyle: 'consumeButton'
            });
        }

        return actions;
    }, []);

    const handleAction = useCallback(async (action: string) => {
        if (!connection?.reducers || isProcessing) return;

        setIsProcessing(true);
        try {
            const itemInstanceId = BigInt(selectedItem.instance.instanceId);
            
            switch (action) {
                case 'crush':
                    // console.log(`Crushing item ${itemInstanceId}: ${selectedItem.definition.name}`);
                    connection.reducers.crushBoneItem(itemInstanceId);
                    playImmediateSound('crush_bones');
                    break;
                case 'unravel':
                    // console.log(`Unraveling rope ${itemInstanceId}: ${selectedItem.definition.name}`);
                    connection.reducers.unravelRope(itemInstanceId);
                    playImmediateSound('crush_bones'); // Reuse crushing sound for deconstruction
                    break;
                case 'pulverize':
                    // console.log(`Pulverizing item ${itemInstanceId}: ${selectedItem.definition.name}`);
                    connection.reducers.pulverizeItem(itemInstanceId);
                    playImmediateSound('pulverize_flour');
                    break;
                case 'mash_berries':
                    connection.reducers.mashBerries(itemInstanceId);
                    playImmediateSound('mash_berries');
                    break;
                case 'mash_starch':
                    connection.reducers.mashStarch(itemInstanceId);
                    playImmediateSound('mash_berries'); // Reuse berry mashing sound
                    break;
                case 'extract_from_honeycomb':
                    connection.reducers.extractFromHoneycomb(itemInstanceId);
                    playImmediateSound('extract_queen_bee');
                    break;
                case 'extract_yeast':
                    connection.reducers.extractYeast(itemInstanceId);
                    playImmediateSound('crush_bones'); // Extraction sound
                    break;
                case 'consume':
                    // console.log(`Consuming item ${itemInstanceId}: ${selectedItem.definition.name}`);
                    connection.reducers.consumeItem(itemInstanceId);
                    break;
                case 'drink':
                    // console.log(`Drinking from water container ${itemInstanceId}: ${selectedItem.definition.name}`);
                    connection.reducers.consumeFilledWaterContainer(itemInstanceId);
                    break;
                case 'use_carving_kit':
                    // Open the bone carving panel
                    if (onOpenBoneCarving) {
                        onOpenBoneCarving();
                        onClose(); // Close the interaction panel when opening carving panel
                    }
                    break;
                case 'use_radio':
                    // Open the radio panel
                    if (onOpenRadio) {
                        onOpenRadio();
                        onClose(); // Close the interaction panel when opening radio panel
                    }
                    break;
                default:
                    console.warn(`Unknown action: ${action}`);
            }
        } catch (error) {
            console.error(`Error performing action ${action}:`, error);
        } finally {
            setIsProcessing(false);
        }
    }, [connection, selectedItem, isProcessing]);

    const handleSplitQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 1 && value <= currentItemQuantity) {
            // console.log('[Split] Quantity changed to:', value);
            setSplitQuantity(value);
        }
    };

    const handleSplitClick = () => {
        // console.log('[Split] Split button clicked:', {
        //     item: selectedItem.definition.name,
        //     itemId: selectedItem.instance.instanceId,
        //     quantity: splitQuantity,
        //     maxQuantity: currentItemQuantity
        // });
        if (onStartSplitDrag && splitQuantity > 0 && splitQuantity <= currentItemQuantity) {
            onStartSplitDrag(selectedItem, splitQuantity);
        } else {
            console.warn('[Split] Invalid split conditions:', {
                hasCallback: !!onStartSplitDrag,
                quantity: splitQuantity,
                maxQuantity: currentItemQuantity
            });
        }
    };

    const availableActions = getAvailableActions(selectedItem);

    return (
        <div className={styles.itemInteractionPanel}>
            <div className={styles.interactionHeader}>
                <button className={styles.closeInteractionButton} onClick={onClose}>×</button>
            </div>
            
            <div className={styles.interactionContent}>
                <div className={styles.interactionItemIcon}>
                    <img 
                        src={getItemIcon(selectedItem.definition.iconAssetName)}
                        alt={selectedItem.definition.name}
                        className={styles.itemIcon}
                    />
                    {currentItemQuantity > 1 && (
                        <div className={styles.itemQuantity}>{currentItemQuantity}</div>
                    )}
                </div>
                
                <div className={styles.interactionItemDetails}>
                    <h4 className={styles.interactionItemName}>{selectedItem.definition.name}</h4>
                    {selectedItem.definition.description && (
                        <p className={styles.interactionItemDescription}>
                            {selectedItem.definition.description}
                        </p>
                    )}
                    <div className={styles.interactionActions}>
                        {availableActions.map((actionInfo) => (
                            <button
                                key={actionInfo.action}
                                className={`${styles.actionButton} ${styles[actionInfo.buttonStyle || '']}`}
                                onClick={() => handleAction(actionInfo.action)}
                                disabled={isProcessing}
                                title={actionInfo.description}
                            >
                                {isProcessing ? 'Processing...' : actionInfo.label}
                            </button>
                        ))}
                        {selectedItem.definition.isStackable && currentItemQuantity > 1 && (
                            <div className={styles.splitControls}>
                                <input
                                    type="number"
                                    min={1}
                                    max={currentItemQuantity}
                                    value={splitQuantity}
                                    onChange={handleSplitQuantityChange}
                                    className={styles.splitInput}
                                />
                                <button
                                    className={`${styles.actionButton} ${styles.splitButton}`}
                                    onClick={handleSplitClick}
                                    disabled={splitQuantity <= 0 || splitQuantity > currentItemQuantity}
                                >
                                    Split
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ItemInteractionPanel; 