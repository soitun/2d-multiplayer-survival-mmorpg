/**
 * BoneCarvingPanel.tsx
 * 
 * Panel for crafting bone totems using the Bone Carving Kit.
 * Shows 10 Aleutian-themed bone totem recipes with their passive bonuses.
 * Opens when player uses the Bone Carving Kit from ItemInteractionPanel.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import styles from './BoneCarvingPanel.module.css';
import {
    CraftingQueueItem,
    ItemDefinition,
    InventoryItem,
    DbConnection,
    InventoryLocationData,
    HotbarLocationData,
} from '../generated';
import { Identity } from 'spacetimedb';
import { getItemIcon } from '../utils/itemIconUtils';

// Bone Carving Recipe definition (matches server-side)
interface BoneCarvingRecipe {
    id: number;
    outputItemName: string;
    outputQuantity: number;
    ingredients: Array<{ itemName: string; quantity: number }>;
    craftingTimeSecs: number;
    description: string; // Passive bonus description
    animalSource: string; // For display purposes
}

// All 10 bone carving recipes (matching server/src/bone_carving.rs)
const BONE_CARVING_RECIPES: BoneCarvingRecipe[] = [
    {
        id: 1,
        outputItemName: "Kayux Amulet",
        outputQuantity: 1,
        ingredients: [
            { itemName: "Fox Skull", quantity: 1 },
            { itemName: "Animal Bone", quantity: 10 },
            { itemName: "Tallow", quantity: 5 },
            { itemName: "Fox Fur", quantity: 2 },
            { itemName: "Rope", quantity: 3 },
        ],
        craftingTimeSecs: 60,
        description: "-20% animal detection radius",
        animalSource: "Fox",
    },
    {
        id: 2,
        outputItemName: "Sabaakax Totem",
        outputQuantity: 1,
        ingredients: [
            { itemName: "Wolf Skull", quantity: 1 },
            { itemName: "Animal Bone", quantity: 15 },
            { itemName: "Tallow", quantity: 5 },
            { itemName: "Wolf Fur", quantity: 2 },
            { itemName: "Rope", quantity: 3 },
        ],
        craftingTimeSecs: 75,
        description: "+15% damage when allies nearby",
        animalSource: "Wolf",
    },
    {
        id: 3,
        outputItemName: "Qax'aadax Totem",
        outputQuantity: 1,
        ingredients: [
            { itemName: "Viper Skull", quantity: 1 },
            { itemName: "Animal Bone", quantity: 10 },
            { itemName: "Cable Viper Gland", quantity: 3 },
            { itemName: "Viper Scale", quantity: 3 },
            { itemName: "Rope", quantity: 2 },
        ],
        craftingTimeSecs: 60,
        description: "+1 poison damage on melee hits",
        animalSource: "Viper",
    },
    {
        id: 4,
        outputItemName: "Tugix Totem",
        outputQuantity: 1,
        ingredients: [
            { itemName: "Walrus Skull", quantity: 1 },
            { itemName: "Animal Bone", quantity: 20 },
            { itemName: "Tallow", quantity: 8 },
            { itemName: "Animal Leather", quantity: 5 },
            { itemName: "Rope", quantity: 4 },
        ],
        craftingTimeSecs: 90,
        description: "+15% cold resistance, +10 max health",
        animalSource: "Walrus",
    },
    {
        id: 5,
        outputItemName: "Tunux Charm",
        outputQuantity: 1,
        ingredients: [
            { itemName: "Vole Skull", quantity: 1 },
            { itemName: "Animal Bone", quantity: 8 },
            { itemName: "Tallow", quantity: 3 },
            { itemName: "Plant Fiber", quantity: 10 },
            { itemName: "Rope", quantity: 2 },
        ],
        craftingTimeSecs: 45,
        description: "+25% harvest yield",
        animalSource: "Vole",
    },
    {
        id: 6,
        outputItemName: "Qilax Totem",
        outputQuantity: 1,
        ingredients: [
            { itemName: "Wolverine Skull", quantity: 1 },
            { itemName: "Animal Bone", quantity: 15 },
            { itemName: "Tallow", quantity: 5 },
            { itemName: "Animal Leather", quantity: 3 },
            { itemName: "Rope", quantity: 3 },
        ],
        craftingTimeSecs: 75,
        description: "+30% damage when below 25% health",
        animalSource: "Wolverine",
    },
    {
        id: 7,
        outputItemName: "Tanuux Totem",
        outputQuantity: 1,
        ingredients: [
            { itemName: "Polar Bear Skull", quantity: 1 },
            { itemName: "Animal Bone", quantity: 25 },
            { itemName: "Tallow", quantity: 10 },
            { itemName: "Animal Leather", quantity: 5 },
            { itemName: "Rope", quantity: 5 },
        ],
        craftingTimeSecs: 90,
        description: "+15% melee damage, knockback immunity",
        animalSource: "Polar Bear",
    },
    {
        id: 8,
        outputItemName: "Ulax Charm",
        outputQuantity: 1,
        ingredients: [
            { itemName: "Hare Skull", quantity: 1 },
            { itemName: "Animal Bone", quantity: 8 },
            { itemName: "Tallow", quantity: 3 },
            { itemName: "Plant Fiber", quantity: 10 },
            { itemName: "Rope", quantity: 2 },
        ],
        craftingTimeSecs: 45,
        description: "+8% movement speed",
        animalSource: "Hare",
    },
    {
        id: 9,
        outputItemName: "Angunax Totem",
        outputQuantity: 1,
        ingredients: [
            { itemName: "Owl Skull", quantity: 1 },
            { itemName: "Animal Bone", quantity: 12 },
            { itemName: "Tallow", quantity: 4 },
            { itemName: "Owl Feathers", quantity: 5 },
            { itemName: "Rope", quantity: 3 },
        ],
        craftingTimeSecs: 60,
        description: "Permanent night vision",
        animalSource: "Owl",
    },
    {
        id: 10,
        outputItemName: "Alax Totem",
        outputQuantity: 1,
        ingredients: [
            { itemName: "Shark Skull", quantity: 1 },
            { itemName: "Animal Bone", quantity: 15 },
            { itemName: "Tallow", quantity: 5 },
            { itemName: "Shark Fin", quantity: 2 },
            { itemName: "Rope", quantity: 3 },
        ],
        craftingTimeSecs: 75,
        description: "+15% water speed, 10% bleed on melee",
        animalSource: "Shark",
    },
    {
        id: 11,
        outputItemName: "Tayngax Totem",
        outputQuantity: 1,
        ingredients: [
            { itemName: "Tern Skull", quantity: 1 },
            { itemName: "Animal Bone", quantity: 10 },
            { itemName: "Tallow", quantity: 4 },
            { itemName: "Tern Feathers", quantity: 5 },
            { itemName: "Rope", quantity: 2 },
        ],
        craftingTimeSecs: 55,
        description: "+15% stamina regeneration",
        animalSource: "Tern",
    },
    {
        id: 12,
        outputItemName: "Qaangax Totem",
        outputQuantity: 1,
        ingredients: [
            { itemName: "Crow Skull", quantity: 1 },
            { itemName: "Animal Bone", quantity: 10 },
            { itemName: "Tallow", quantity: 4 },
            { itemName: "Crow Feathers", quantity: 5 },
            { itemName: "Rope", quantity: 2 },
        ],
        craftingTimeSecs: 55,
        description: "Reflects 10% melee damage",
        animalSource: "Crow",
    },
];

interface BoneCarvingPanelProps {
    playerIdentity: Identity | null;
    craftingQueueItems: Map<string, CraftingQueueItem>;
    itemDefinitions: Map<string, ItemDefinition>;
    inventoryItems: Map<string, InventoryItem>;
    connection: DbConnection | null;
    onClose: () => void;
}

const BoneCarvingPanel: React.FC<BoneCarvingPanelProps> = ({
    playerIdentity,
    craftingQueueItems,
    itemDefinitions,
    inventoryItems,
    connection,
    onClose,
}) => {
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [selectedRecipe, setSelectedRecipe] = useState<BoneCarvingRecipe | null>(null);
    const [craftingMessage, setCraftingMessage] = useState<string | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Timer for queue updates
    useEffect(() => {
        const timerId = setInterval(() => {
            setCurrentTime(Date.now());
        }, 1000);
        return () => clearInterval(timerId);
    }, []);

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

    // Calculate player's available resources
    const playerResources = useMemo(() => {
        const resources: Map<string, number> = new Map();
        if (!playerIdentity) return resources;

        Array.from(inventoryItems.values())
            .filter(item => {
                if (item.location.tag === 'Inventory') {
                    const data = item.location.value as InventoryLocationData;
                    return data.ownerId && data.ownerId.isEqual(playerIdentity);
                } else if (item.location.tag === 'Hotbar') {
                    const data = item.location.value as HotbarLocationData;
                    return data.ownerId && data.ownerId.isEqual(playerIdentity);
                }
                return false;
            })
            .forEach(item => {
                // Get item name from definition
                const itemDef = itemDefinitions.get(item.itemDefId.toString());
                if (itemDef) {
                    resources.set(itemDef.name, (resources.get(itemDef.name) || 0) + item.quantity);
                }
            });

        return resources;
    }, [inventoryItems, itemDefinitions, playerIdentity]);

    // Check if player can craft a recipe
    const canCraftRecipe = (recipe: BoneCarvingRecipe): boolean => {
        for (const ingredient of recipe.ingredients) {
            const available = playerResources.get(ingredient.itemName) || 0;
            if (available < ingredient.quantity) {
                return false;
            }
        }
        return true;
    };

    // Get item icon by name
    const getItemIconByName = (itemName: string): string => {
        const itemDef = Array.from(itemDefinitions.values()).find(def => def.name === itemName);
        if (itemDef) {
            return getItemIcon(itemDef.iconAssetName);
        }
        return ''; // Fallback
    };

    // Handle crafting
    const handleCraft = async (recipe: BoneCarvingRecipe) => {
        if (!connection || !canCraftRecipe(recipe)) {
            return;
        }

        try {
            // Call the start_bone_carving reducer
            connection.reducers.startBoneCarving(BigInt(recipe.id));
            setCraftingMessage(`Started carving ${recipe.outputItemName}...`);
            setTimeout(() => setCraftingMessage(null), 3000);
        } catch (error) {
            console.error('Failed to start bone carving:', error);
            setCraftingMessage('Failed to start carving');
            setTimeout(() => setCraftingMessage(null), 3000);
        }
    };

    // Get player's crafting queue
    const playerQueue = useMemo(() => {
        if (!playerIdentity) return [];
        return Array.from(craftingQueueItems.values())
            .filter(item => item.playerIdentity && item.playerIdentity.isEqual(playerIdentity))
            .sort((a, b) => Number(a.finishTime.microsSinceUnixEpoch - b.finishTime.microsSinceUnixEpoch));
    }, [craftingQueueItems, playerIdentity]);

    return (
        <div className={styles.panelOverlay}>
            <div className={styles.boneCarvingPanel} ref={panelRef} data-id="bone-carving-panel">
                <button className={styles.closeButton} onClick={onClose}>×</button>
                
                <div className={styles.header}>
                    <h2 className={styles.title}>Bone Carving</h2>
                    <p className={styles.subtitle}>Craft Aleutian Spirit Totems</p>
                </div>

                {craftingMessage && (
                    <div className={styles.craftingMessage}>{craftingMessage}</div>
                )}

                <div className={styles.content}>
                    {/* Recipe Grid */}
                    <div className={styles.recipeGrid}>
                        {BONE_CARVING_RECIPES.map(recipe => {
                            const canCraft = canCraftRecipe(recipe);
                            const isSelected = selectedRecipe?.id === recipe.id;
                            
                            return (
                                <div
                                    key={recipe.id}
                                    className={`${styles.recipeCard} ${canCraft ? styles.craftable : styles.notCraftable} ${isSelected ? styles.selected : ''}`}
                                    onClick={() => setSelectedRecipe(recipe)}
                                >
                                    <div className={styles.recipeIcon}>
                                        <img 
                                            src={getItemIconByName(recipe.outputItemName)} 
                                            alt={recipe.outputItemName}
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = getItemIconByName("Bone Fragments");
                                            }}
                                        />
                                    </div>
                                    <div className={styles.recipeName}>{recipe.outputItemName}</div>
                                    <div className={styles.recipeAnimal}>{recipe.animalSource}</div>
                                    <div className={styles.recipeBonus}>{recipe.description}</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Recipe Details */}
                    {selectedRecipe && (
                        <div className={styles.recipeDetails}>
                            <h3>{selectedRecipe.outputItemName}</h3>
                            <p className={styles.animalSpirit}>{selectedRecipe.animalSource} Spirit</p>
                            <p className={styles.bonusText}>{selectedRecipe.description}</p>
                            
                            <div className={styles.ingredientsList}>
                                <h4>Required Materials:</h4>
                                {selectedRecipe.ingredients.map((ing, idx) => {
                                    const available = playerResources.get(ing.itemName) || 0;
                                    const hasEnough = available >= ing.quantity;
                                    
                                    return (
                                        <div 
                                            key={idx} 
                                            className={`${styles.ingredient} ${hasEnough ? styles.hasEnough : styles.notEnough}`}
                                        >
                                            <img 
                                                src={getItemIconByName(ing.itemName)} 
                                                alt={ing.itemName}
                                                className={styles.ingredientIcon}
                                            />
                                            <span className={styles.ingredientName}>{ing.itemName}</span>
                                            <span className={styles.ingredientCount}>
                                                {available}/{ing.quantity}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            
                            <div className={styles.craftingTime}>
                                Carving Time: {selectedRecipe.craftingTimeSecs}s
                            </div>
                            
                            <button
                                className={`${styles.craftButton} ${canCraftRecipe(selectedRecipe) ? '' : styles.disabled}`}
                                onClick={() => handleCraft(selectedRecipe)}
                                disabled={!canCraftRecipe(selectedRecipe)}
                            >
                                {canCraftRecipe(selectedRecipe) ? 'Start Carving' : 'Missing Materials'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Crafting Queue */}
                {playerQueue.length > 0 && (
                    <div className={styles.craftingQueue}>
                        <h4>Crafting Queue:</h4>
                        <div className={styles.queueItems}>
                            {playerQueue.map(item => {
                                const finishTimeMs = Number(item.finishTime.microsSinceUnixEpoch / 1000n);
                                const remainingTime = Math.max(0, Math.ceil((finishTimeMs - currentTime) / 1000));
                                const itemDef = itemDefinitions.get(item.outputItemDefId.toString());
                                
                                return (
                                    <div key={item.queueItemId.toString()} className={styles.queueItem}>
                                        <span>{itemDef?.name || 'Unknown'}</span>
                                        <span className={styles.queueTime}>
                                            {remainingTime > 0 ? `${remainingTime}s` : 'Complete!'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BoneCarvingPanel;
