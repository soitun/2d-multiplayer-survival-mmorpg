/**
 * CraftingScreen.tsx
 * 
 * A dedicated full-screen crafting panel that opens with 'B' key.
 * Features a category sidebar on the left, search bar, and expanded recipe list.
 * Uses the same data and reducers as the inventory crafting panel.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import styles from './CraftingScreen.module.css';
import {
    Recipe,
    CraftingQueueItem,
    ItemDefinition,
    InventoryItem,
    DbConnection,
    InventoryLocationData,
    HotbarLocationData,
    ActiveConsumableEffect,
} from '../generated';
import { Identity } from 'spacetimedb';
import { getItemIcon } from '../utils/itemIconUtils';
import { ITEM_TO_NODE_MAP, MEMORY_GRID_NODES } from './MemoryGridData';
import Tooltip, { TooltipContent, TooltipStats } from './Tooltip';

// Category definitions with icons
const CATEGORIES = [
    { id: 'All', name: 'All Items', icon: '📦' },
    { id: 'Tool', name: 'Tools', icon: '⚒️' },
    { id: 'Weapon', name: 'Melee', icon: '⚔️' },
    { id: 'RangedWeapon', name: 'Ranged', icon: '🏹' },
    { id: 'Armor', name: 'Armor', icon: '🛡️' },
    { id: 'Consumable', name: 'Consumables', icon: '🧪' },
    { id: 'Material', name: 'Materials', icon: '🧱' },
    { id: 'Placeable', name: 'Building', icon: '🏠' },
    { id: 'Ammunition', name: 'Ammo', icon: '🎯' },
];

interface CraftingScreenProps {
    playerIdentity: Identity | null;
    recipes: Map<string, Recipe>;
    craftingQueueItems: Map<string, CraftingQueueItem>;
    itemDefinitions: Map<string, ItemDefinition>;
    inventoryItems: Map<string, InventoryItem>;
    connection: DbConnection | null;
    onClose: () => void;
    onSearchFocusChange?: (isFocused: boolean) => void;
    purchasedMemoryNodes?: Set<string>;
    activeConsumableEffects?: Map<string, ActiveConsumableEffect>; // For checking cooking station proximity
}

// Helper to calculate remaining time
const calculateRemainingTime = (finishTime: number, now: number): number => {
    return Math.max(0, Math.ceil((finishTime - now) / 1000));
};

const CraftingScreen: React.FC<CraftingScreenProps> = ({
    playerIdentity,
    recipes,
    craftingQueueItems,
    itemDefinitions,
    inventoryItems,
    connection,
    onClose,
    onSearchFocusChange,
    purchasedMemoryNodes = new Set(['center']),
    activeConsumableEffects,
}) => {
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [craftQuantities, setCraftQuantities] = useState<Map<string, number>>(new Map());
    const [searchTerm, setSearchTerm] = useState<string>(() => {
        return localStorage.getItem('craftingScreenSearchTerm') || '';
    });
    const [selectedCategory, setSelectedCategory] = useState<string>(() => {
        return localStorage.getItem('craftingScreenCategory') || 'All';
    });

    // Tooltip State
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const [tooltipContent, setTooltipContent] = useState<TooltipContent | null>(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

    const panelRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Timer to update queue times
    useEffect(() => {
        const timerId = setInterval(() => {
            setCurrentTime(Date.now());
        }, 1000);
        return () => clearInterval(timerId);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            onSearchFocusChange?.(false);
        };
    }, [onSearchFocusChange]);

    // Memoize player inventory calculation
    const playerInventoryResources = useMemo(() => {
        const resources: Map<string, number> = new Map();
        if (!playerIdentity) return resources;

        Array.from(inventoryItems.values())
            .filter(item => {
                if (item.location.tag === 'Inventory') {
                    const inventoryData = item.location.value as InventoryLocationData;
                    return inventoryData.ownerId && inventoryData.ownerId.isEqual(playerIdentity);
                } else if (item.location.tag === 'Hotbar') {
                    const hotbarData = item.location.value as HotbarLocationData;
                    return hotbarData.ownerId && hotbarData.ownerId.isEqual(playerIdentity);
                }
                return false;
            })
            .forEach(item => {
                const defIdStr = item.itemDefId.toString();
                resources.set(defIdStr, (resources.get(defIdStr) || 0) + item.quantity);
            });

        return resources;
    }, [inventoryItems, playerIdentity]);

    // Filter and sort crafting queue for the current player
    const playerQueue = useMemo(() => {
        if (!playerIdentity) return [];
        const now = Date.now();
        return Array.from(craftingQueueItems.values())
            .filter(item => {
                if (!item.playerIdentity || !item.playerIdentity.isEqual(playerIdentity)) return false;
                const finishTimeMs = Number(item.finishTime.microsSinceUnixEpoch / 1000n);
                const remainingTime = Math.ceil((finishTimeMs - now) / 1000);
                return remainingTime > -2;
            })
            .sort((a, b) => Number(a.finishTime.microsSinceUnixEpoch - b.finishTime.microsSinceUnixEpoch));
    }, [craftingQueueItems, playerIdentity, currentTime]);

    // Helper to get effective category (with overrides like Tallow -> Material)
    const getEffectiveCategory = useCallback((outputDef: ItemDefinition | undefined): string => {
        if (!outputDef) return 'Material';
        // Override: Tallow is technically Consumable but functions as a Material in crafting
        if (outputDef.name === 'Tallow') return 'Material';
        return outputDef.category.tag;
    }, []);

    // Calculate category counts
    const categoryCounts = useMemo(() => {
        const counts: Map<string, number> = new Map();
        counts.set('All', recipes.size);

        recipes.forEach(recipe => {
            const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
            if (outputDef) {
                const category = getEffectiveCategory(outputDef);
                counts.set(category, (counts.get(category) || 0) + 1);
            }
        });

        return counts;
    }, [recipes, itemDefinitions, getEffectiveCategory]);

    // --- Helper to get flexible ingredient info for a recipe ---
    // Returns a map of item_def_id (first option) -> { groupName, validItemDefIds[], totalRequired }
    const getFlexibleIngredientInfo = useCallback((recipe: Recipe): Map<string, { groupName: string; validItemDefIds: string[]; totalRequired: number }> => {
        const flexMap = new Map<string, { groupName: string; validItemDefIds: string[]; totalRequired: number }>();
        
        const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
        if (!outputDef?.flexibleIngredients) return flexMap;
        
        for (const flexIng of outputDef.flexibleIngredients) {
            // Find the item_def_id for each valid item name
            const validIds: string[] = [];
            for (const itemName of flexIng.validItems) {
                for (const [id, def] of itemDefinitions) {
                    if (def.name === itemName) {
                        validIds.push(id);
                        break;
                    }
                }
            }
            
            // The first valid ID is what's stored in recipe.ingredients
            if (validIds.length > 0) {
                flexMap.set(validIds[0], {
                    groupName: flexIng.groupName,
                    validItemDefIds: validIds,
                    totalRequired: flexIng.totalRequired
                });
            }
        }
        
        return flexMap;
    }, [itemDefinitions]);

    // --- Helper functions (defined before useMemo that needs them) ---
    const calculateMaxCraftable = useCallback((recipe: Recipe): number => {
        if (!recipe.ingredients || recipe.ingredients.length === 0) return 0;

        const flexInfo = getFlexibleIngredientInfo(recipe);
        let maxPossible = Infinity;
        
        for (const ingredient of recipe.ingredients) {
            const ingIdStr = ingredient.itemDefId.toString();
            const flex = flexInfo.get(ingIdStr);
            
            let available: number;
            let required: number;
            
            if (flex) {
                // Flexible ingredient - sum up all valid items
                available = flex.validItemDefIds.reduce((sum, id) => {
                    return sum + (playerInventoryResources.get(id) || 0);
                }, 0);
                required = flex.totalRequired;
            } else {
                // Fixed ingredient
                available = playerInventoryResources.get(ingIdStr) || 0;
                required = ingredient.quantity;
            }
            
            if (required === 0) continue;
            maxPossible = Math.min(maxPossible, Math.floor(available / required));
        }
        
        return maxPossible === Infinity ? 0 : maxPossible;
    }, [playerInventoryResources, getFlexibleIngredientInfo]);

    const canCraft = useCallback((recipe: Recipe, quantity: number = 1): boolean => {
        if (!recipe.ingredients || recipe.ingredients.length === 0) return false;
        
        const flexInfo = getFlexibleIngredientInfo(recipe);
        
        for (const ingredient of recipe.ingredients) {
            const ingIdStr = ingredient.itemDefId.toString();
            const flex = flexInfo.get(ingIdStr);
            
            let available: number;
            let required: number;
            
            if (flex) {
                // Flexible ingredient - sum up all valid items
                available = flex.validItemDefIds.reduce((sum, id) => {
                    return sum + (playerInventoryResources.get(id) || 0);
                }, 0);
                required = flex.totalRequired * quantity;
            } else {
                // Fixed ingredient
                available = playerInventoryResources.get(ingIdStr) || 0;
                required = ingredient.quantity * quantity;
            }
            
            if (available < required) {
                return false;
            }
        }
        
        return true;
    }, [playerInventoryResources, getFlexibleIngredientInfo]);

    const isRecipeUnlockedByMemoryGrid = useCallback((recipe: Recipe): boolean => {
        const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
        if (!outputDef) return true;

        const requiredNode = ITEM_TO_NODE_MAP[outputDef.name];
        if (!requiredNode) return true;

        return purchasedMemoryNodes.has(requiredNode);
    }, [itemDefinitions, purchasedMemoryNodes]);

    const getRequiredNodeName = useCallback((recipe: Recipe): string | null => {
        const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
        if (!outputDef) return null;

        const requiredNode = ITEM_TO_NODE_MAP[outputDef.name];
        if (!requiredNode) return null;

        const nodeData = MEMORY_GRID_NODES.find(n => n.id === requiredNode);
        return nodeData?.name || requiredNode;
    }, [itemDefinitions]);

    // --- Helper to check if player is near a cooking station ---
    const isNearCookingStation = useMemo((): boolean => {
        if (!activeConsumableEffects || !playerIdentity) return false;
        
        const playerIdHex = playerIdentity.toHexString();
        for (const effect of activeConsumableEffects.values()) {
            if (effect.playerId.toHexString() === playerIdHex) {
                const effectTypeTag = effect.effectType ? (effect.effectType as any).tag : undefined;
                if (effectTypeTag === 'NearCookingStation') {
                    return true;
                }
            }
        }
        return false;
    }, [activeConsumableEffects, playerIdentity]);

    // --- Helper to check if a recipe requires a crafting station ---
    const getRequiredStation = useCallback((recipe: Recipe): string | null => {
        const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
        if (!outputDef) return null;
        
        // Check if the item has a requires_station field (from server schema)
        const requires = (outputDef as any).requiresStation || (outputDef as any).requires_station;
        return requires || null;
    }, [itemDefinitions]);

    // --- Helper to check if station requirement is met for a recipe ---
    const isStationRequirementMet = useCallback((recipe: Recipe): boolean => {
        const requiredStation = getRequiredStation(recipe);
        if (!requiredStation) return true; // No station required
        
        // Check if player has the corresponding effect
        if (requiredStation === 'Cooking Station') {
            return isNearCookingStation;
        }
        
        // Unknown station type - default to not met
        return false;
    }, [getRequiredStation, isNearCookingStation]);

    // Filter recipes based on category and search
    const filteredRecipes = useMemo(() => {
        let filtered = Array.from(recipes.values());

        // Category filter (using effective category for overrides like Tallow)
        if (selectedCategory !== 'All') {
            filtered = filtered.filter(recipe => {
                const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
                return getEffectiveCategory(outputDef) === selectedCategory;
            });
        }

        // Search filter
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(recipe => {
                const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
                if (!outputDef) return false;

                // Match output name
                if (outputDef.name.toLowerCase().includes(term)) return true;

                // Match ingredient names
                return recipe.ingredients.some(ing => {
                    const ingDef = itemDefinitions.get(ing.itemDefId.toString());
                    return ingDef?.name.toLowerCase().includes(term);
                });
            });
        }

        // Sort: UNLOCKED FIRST, then CRAFTABLE, then search relevance, then alphabetically
        const term = searchTerm.trim().toLowerCase();
        return filtered.sort((a, b) => {
            const aName = itemDefinitions.get(a.outputItemDefId.toString())?.name || '';
            const bName = itemDefinitions.get(b.outputItemDefId.toString())?.name || '';
            const aNameLower = aName.toLowerCase();
            const bNameLower = bName.toLowerCase();
            
            // FIRST PRIORITY: Unlocked items always come before locked items
            const aUnlocked = isRecipeUnlockedByMemoryGrid(a);
            const bUnlocked = isRecipeUnlockedByMemoryGrid(b);
            if (aUnlocked && !bUnlocked) return -1;
            if (!aUnlocked && bUnlocked) return 1;
            
            // SECOND PRIORITY: Craftable items come before non-craftable (within unlock tier)
            const aCraftable = aUnlocked && canCraft(a, 1);
            const bCraftable = bUnlocked && canCraft(b, 1);
            if (aCraftable && !bCraftable) return -1;
            if (!aCraftable && bCraftable) return 1;
            
            // THIRD PRIORITY: Within same tier, sort by search relevance
            if (term) {
                const aExact = aNameLower === term;
                const bExact = bNameLower === term;
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;
                
                // Then startsWith matches
                const aStartsWith = aNameLower.startsWith(term);
                const bStartsWith = bNameLower.startsWith(term);
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;
            }

            // FOURTH PRIORITY: Alphabetical
            return aName.localeCompare(bName);
        });
    }, [recipes, selectedCategory, searchTerm, itemDefinitions, canCraft, isRecipeUnlockedByMemoryGrid]);

    // --- Crafting Handlers ---
    const handleCraftItem = (recipeId: bigint, quantity: number) => {
        if (!connection?.reducers) return;
        try {
            if (quantity > 0) {
                connection.reducers.startCraftingMultiple(recipeId, quantity);
            }
        } catch (err) {
            console.error("Error calling startCraftingMultiple reducer:", err);
        }
    };

    const handleCancelCraft = (queueItemId: bigint) => {
        if (!connection?.reducers) return;
        try {
            connection.reducers.cancelCraftingItem(queueItemId);
        } catch (err) {
            console.error("Error calling cancelCraftingItem reducer:", err);
        }
    };

    const handleCancelAllCrafting = () => {
        if (!connection?.reducers) return;
        try {
            connection.reducers.cancelAllCrafting();
        } catch (err) {
            console.error("Error calling cancelAllCrafting reducer:", err);
        }
    };

    // --- Handlers ---
    const handleSearchChange = (newSearchTerm: string) => {
        setSearchTerm(newSearchTerm);
        localStorage.setItem('craftingScreenSearchTerm', newSearchTerm);
    };

    const handleCategoryChange = (category: string) => {
        setSelectedCategory(category);
        localStorage.setItem('craftingScreenCategory', category);
    };

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        // Including 'y' which opens achievements panel
        const gameControlKeys = ['f', 'g', ' ', 'e', 'w', 'a', 's', 'd', 'z', 'c', 'm', 'b', 'y'];
        const key = event.key.toLowerCase();

        if (gameControlKeys.includes(key)) {
            event.stopPropagation();
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            searchInputRef.current?.blur();
        }
    };

    // Tooltip handlers
    const handleItemMouseEnter = useCallback((itemDef: ItemDefinition, event: React.MouseEvent<HTMLDivElement>) => {
        event.currentTarget.removeAttribute('title');

        if (panelRef.current) {
            const panelRect = panelRef.current.getBoundingClientRect();
            const relativeX = event.clientX - panelRect.left;
            const relativeY = event.clientY - panelRect.top;

            const stats: TooltipStats[] = [];

            if (itemDef.pvpDamageMin !== undefined || itemDef.pvpDamageMax !== undefined) {
                const min = itemDef.pvpDamageMin ?? 0;
                const max = itemDef.pvpDamageMax ?? min;
                stats.push({ label: 'Damage', value: max > min ? `${min}-${max}` : `${min}` });
            }

            if (itemDef.damageResistance !== undefined && itemDef.damageResistance > 0) {
                stats.push({ label: 'Defense', value: `+${Math.round(itemDef.damageResistance * 100)}%` });
            }

            if (itemDef.consumableHealthGain !== undefined && itemDef.consumableHealthGain !== 0) {
                stats.push({ label: 'Health', value: `${itemDef.consumableHealthGain > 0 ? '+' : ''}${itemDef.consumableHealthGain}`, color: itemDef.consumableHealthGain > 0 ? '#5cb85c' : '#d9534f' });
            }
            if (itemDef.consumableHungerSatiated !== undefined && itemDef.consumableHungerSatiated !== 0) {
                stats.push({ label: 'Hunger', value: `${itemDef.consumableHungerSatiated > 0 ? '+' : ''}${itemDef.consumableHungerSatiated}`, color: '#f0ad4e' });
            }
            if (itemDef.consumableThirstQuenched !== undefined && itemDef.consumableThirstQuenched !== 0) {
                stats.push({ label: 'Thirst', value: `${itemDef.consumableThirstQuenched > 0 ? '+' : ''}${itemDef.consumableThirstQuenched}`, color: '#5bc0de' });
            }

            const content: TooltipContent = {
                name: itemDef.name,
                description: itemDef.description,
                category: itemDef.category.tag,
                stats: stats.length > 0 ? stats : undefined,
            };

            setTooltipContent(content);
            setTooltipPosition({ x: relativeX, y: relativeY });
            setTooltipVisible(true);
        }
    }, []);

    const handleItemMouseLeave = useCallback(() => {
        setTooltipVisible(false);
        setTooltipContent(null);
    }, []);

    const handleItemMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (panelRef.current && tooltipVisible) {
            const panelRect = panelRef.current.getBoundingClientRect();
            const relativeX = event.clientX - panelRect.left;
            const relativeY = event.clientY - panelRect.top;
            setTooltipPosition({ x: relativeX, y: relativeY });
        }
    }, [tooltipVisible]);

    return (
        <div ref={panelRef} data-id="crafting-screen" className={styles.craftingScreen}>
            <button className={styles.closeButton} onClick={onClose}>X</button>

            {/* Left Sidebar - Categories */}
            <div className={styles.categorySidebar}>
                <h3 className={styles.sidebarTitle}>CATEGORIES</h3>
                <div className={styles.categoryList}>
                    {CATEGORIES.map(category => (
                        <div
                            key={category.id}
                            className={`${styles.categoryItem} ${selectedCategory === category.id ? styles.categoryItemActive : ''}`}
                            onClick={() => handleCategoryChange(category.id)}
                        >
                            <span className={styles.categoryIcon}>{category.icon}</span>
                            <span className={styles.categoryName}>{category.name}</span>
                            <span className={styles.categoryCount}>{categoryCounts.get(category.id) || 0}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className={styles.mainContent}>
                <div className={styles.header}>
                    <h2 className={styles.title}>CRAFTING</h2>
                    <div className={styles.searchContainer}>
                        <input
                            ref={searchInputRef}
                            type="text"
                            className={styles.searchInput}
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search by item or ingredient name..."
                            onFocus={() => onSearchFocusChange?.(true)}
                            onBlur={() => onSearchFocusChange?.(false)}
                            onKeyDown={handleSearchKeyDown}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck="false"
                        />
                    </div>
                </div>

                {/* Recipe List */}
                <div className={styles.recipeArea}>
                    <div className={styles.recipeListContainer}>
                        {filteredRecipes.length === 0 ? (
                            <div className={styles.emptyState}>
                                <div className={styles.emptyStateIcon}>🔍</div>
                                <div className={styles.emptyStateText}>No recipes found</div>
                            </div>
                        ) : (
                            <div className={styles.recipeList}>
                                {filteredRecipes.map(recipe => {
                                    const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
                                    if (!outputDef) return null;

                                    const currentQuantity = craftQuantities.get(recipe.recipeId.toString()) || 1;
                                    const maxCraftable = calculateMaxCraftable(recipe);
                                    const isMemoryGridUnlocked = isRecipeUnlockedByMemoryGrid(recipe);
                                    const requiredNodeName = !isMemoryGridUnlocked ? getRequiredNodeName(recipe) : null;
                                    
                                    // Check cooking station requirement
                                    const requiredStation = getRequiredStation(recipe);
                                    const hasStationAccess = isStationRequirementMet(recipe);
                                    
                                    // Recipe is only craftable if: unlocked, station requirement met, and has resources
                                    const isCraftable = isMemoryGridUnlocked && hasStationAccess && canCraft(recipe, currentQuantity) && currentQuantity <= maxCraftable && currentQuantity > 0;

                                    return (
                                        <div
                                            key={recipe.recipeId.toString()}
                                            className={`${styles.recipeRow} ${isCraftable ? styles.recipeCraftable : ''} ${!isMemoryGridUnlocked ? styles.recipeLocked : ''} ${(requiredStation && !hasStationAccess) ? styles.recipeLocked : ''}`}
                                        >
                                            {/* Recipe Icon */}
                                            <div
                                                className={styles.recipeIcon}
                                                onMouseEnter={(e) => handleItemMouseEnter(outputDef, e)}
                                                onMouseLeave={handleItemMouseLeave}
                                                onMouseMove={handleItemMouseMove}
                                            >
                                                <img
                                                    src={getItemIcon(outputDef.iconAssetName)}
                                                    alt={outputDef.name}
                                                    style={{ filter: !isMemoryGridUnlocked ? 'grayscale(60%) brightness(0.7)' : 'none' }}
                                                />
                                                {!isMemoryGridUnlocked && (
                                                    <div className={styles.lockOverlay}>🔒</div>
                                                )}
                                            </div>

                                            {/* Recipe Content */}
                                            <div className={styles.recipeContent}>
                                                <div className={`${styles.recipeName} ${!isMemoryGridUnlocked ? styles.recipeNameLocked : ''}`}>
                                                    {!isMemoryGridUnlocked && <span className={styles.lockIcon}>🔒</span>}
                                                    {outputDef.name}
                                                    {recipe.outputQuantity > 1 && <span style={{ color: '#888', fontSize: '12px' }}> x{recipe.outputQuantity}</span>}
                                                </div>

                                                {!isMemoryGridUnlocked && requiredNodeName && (
                                                    <div className={styles.lockMessage}>
                                                        <span>⚡</span>
                                                        <span>Unlock "<strong>{requiredNodeName}</strong>" in Memory Grid</span>
                                                    </div>
                                                )}

                                                {/* Cooking Station requirement message */}
                                                {isMemoryGridUnlocked && requiredStation && !hasStationAccess && (
                                                    <div style={{
                                                        fontSize: '11px',
                                                        color: '#f0ad4e',
                                                        marginTop: '2px',
                                                        marginBottom: '4px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        <span>🍳</span>
                                                        <span>Requires <strong>{requiredStation}</strong> nearby</span>
                                                    </div>
                                                )}

                                                <div className={styles.ingredientsList}>
                                                    {(() => {
                                                        const flexInfo = getFlexibleIngredientInfo(recipe);
                                                        return recipe.ingredients.map((ing, index) => {
                                                            const ingIdStr = ing.itemDefId.toString();
                                                            const ingDef = itemDefinitions.get(ingIdStr);
                                                            const flex = flexInfo.get(ingIdStr);
                                                            
                                                            // For flexible ingredients, sum all valid items
                                                            const available = flex 
                                                                ? flex.validItemDefIds.reduce((sum, id) => sum + (playerInventoryResources.get(id) || 0), 0)
                                                                : (playerInventoryResources.get(ingIdStr) || 0);
                                                            
                                                            const neededQty = flex ? flex.totalRequired : ing.quantity;
                                                            const neededTotal = neededQty * currentQuantity;
                                                            const hasEnough = available >= neededTotal;
                                                            
                                                            // Display name: group name for flexible, item name for fixed
                                                            const displayName = flex ? flex.groupName : (ingDef?.name || 'Unknown');
                                                            const isFlexible = !!flex;

                                                            return (
                                                                <div
                                                                    key={index}
                                                                    className={`${styles.ingredient} ${hasEnough ? styles.ingredientHasEnough : styles.ingredientNotEnough}`}
                                                                    onMouseEnter={(e) => ingDef && handleItemMouseEnter(ingDef, e)}
                                                                    onMouseLeave={handleItemMouseLeave}
                                                                    onMouseMove={handleItemMouseMove}
                                                                    title={isFlexible ? `Accepts: ${flex.validItemDefIds.map(id => itemDefinitions.get(id)?.name).filter(Boolean).join(', ')}` : undefined}
                                                                >
                                                                    <div className={styles.ingredientIcon} style={isFlexible ? { border: '1px solid rgba(255, 200, 0, 0.5)', borderRadius: '4px' } : undefined}>
                                                                        <img
                                                                            src={getItemIcon(ingDef?.iconAssetName || '')}
                                                                            alt={displayName}
                                                                        />
                                                                        {isFlexible && <span style={{ position: 'absolute', top: '-2px', right: '-2px', fontSize: '8px' }}>⚡</span>}
                                                                    </div>
                                                                    <span className={styles.ingredientQuantity}>{neededQty}</span>
                                                                    <span className={styles.ingredientAvailable}>({available})</span>
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            </div>

                                            {/* Crafting Controls */}
                                            <div className={styles.craftingControls}>
                                                <div className={styles.quantityControls}>
                                                    <button
                                                        className={styles.quantityBtn}
                                                        onClick={() => {
                                                            const newQuantity = Math.max(1, currentQuantity - 1);
                                                            setCraftQuantities(prev => new Map(prev).set(recipe.recipeId.toString(), newQuantity));
                                                        }}
                                                        disabled={currentQuantity <= 1}
                                                    >
                                                        −
                                                    </button>
                                                    <input
                                                        type="number"
                                                        className={styles.quantityInput}
                                                        value={currentQuantity}
                                                        onChange={(e) => {
                                                            let newQuantity = parseInt(e.target.value, 10);
                                                            if (isNaN(newQuantity) || newQuantity < 1) newQuantity = 1;
                                                            const clampedQuantity = Math.min(newQuantity, maxCraftable > 0 ? maxCraftable : 1);
                                                            setCraftQuantities(prev => new Map(prev).set(recipe.recipeId.toString(), clampedQuantity));
                                                        }}
                                                        min="1"
                                                        max={maxCraftable > 0 ? maxCraftable : 1}
                                                        onKeyDown={(e) => {
                                                            if (e.key === '+' || e.key === '-') e.preventDefault();
                                                            // Block game control keys (y opens achievements, etc)
                                                            const gameControlKeys = ['f', 'g', ' ', 'e', 'w', 'a', 's', 'd', 'z', 'c', 'm', 'b', 'y'];
                                                            if (gameControlKeys.includes(e.key.toLowerCase())) {
                                                                e.stopPropagation();
                                                            }
                                                        }}
                                                    />
                                                    <button
                                                        className={styles.quantityBtn}
                                                        onClick={() => {
                                                            const newQuantity = Math.min(maxCraftable > 0 ? maxCraftable : 1, currentQuantity + 1);
                                                            setCraftQuantities(prev => new Map(prev).set(recipe.recipeId.toString(), newQuantity));
                                                        }}
                                                        disabled={currentQuantity >= (maxCraftable > 0 ? maxCraftable : 1)}
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                                <button
                                                    className={styles.maxBtn}
                                                    onClick={() => {
                                                        const maxVal = calculateMaxCraftable(recipe);
                                                        setCraftQuantities(prev => new Map(prev).set(recipe.recipeId.toString(), maxVal > 0 ? maxVal : 1));
                                                    }}
                                                    disabled={maxCraftable <= 0}
                                                >
                                                    MAX
                                                </button>
                                                <button
                                                    className={`${styles.craftBtn} ${!isMemoryGridUnlocked ? styles.craftBtnLocked : ''} ${(requiredStation && !hasStationAccess) ? styles.craftBtnLocked : ''}`}
                                                    onClick={() => handleCraftItem(recipe.recipeId, currentQuantity)}
                                                    disabled={!isCraftable}
                                                    title={requiredStation && !hasStationAccess ? `Requires ${requiredStation} nearby` : undefined}
                                                >
                                                    {!isMemoryGridUnlocked ? 'LOCKED' : (requiredStation && !hasStationAccess) ? 'STATION' : 'CRAFT'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Crafting Queue */}
                    <div className={styles.queueSection}>
                        <div className={styles.queueHeader}>
                            <h4 className={styles.queueTitle}>CRAFTING QUEUE ({playerQueue.length})</h4>
                            {playerQueue.length > 0 && (
                                <button className={styles.cancelAllBtn} onClick={handleCancelAllCrafting}>
                                    CANCEL ALL
                                </button>
                            )}
                        </div>
                        <div className={styles.queueList}>
                            {playerQueue.map((item) => {
                                const outputDef = itemDefinitions.get(item.outputItemDefId.toString());
                                const remainingTime = calculateRemainingTime(
                                    Number(item.finishTime.microsSinceUnixEpoch / 1000n),
                                    currentTime
                                );

                                return (
                                    <div key={item.queueItemId.toString()} className={styles.queueItem}>
                                        <div className={styles.queueItemIcon}>
                                            {outputDef && (
                                                <img
                                                    src={getItemIcon(outputDef.iconAssetName)}
                                                    alt={outputDef?.name || 'Crafting'}
                                                />
                                            )}
                                        </div>
                                        <div className={styles.queueItemInfo}>
                                            <div className={styles.queueItemName}>
                                                {outputDef?.name || 'Unknown Item'}
                                            </div>
                                            <div className={styles.queueItemTime}>
                                                {remainingTime > 0 ? `${remainingTime}s remaining` : 'Completing...'}
                                            </div>
                                        </div>
                                        <button
                                            className={styles.queueItemCancelBtn}
                                            onClick={() => handleCancelCraft(item.queueItemId)}
                                        >
                                            CANCEL
                                        </button>
                                    </div>
                                );
                            })}
                            {playerQueue.length === 0 && (
                                <div className={styles.emptyQueue}>No items in queue</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <Tooltip content={tooltipContent} visible={tooltipVisible} position={tooltipPosition} />
        </div>
    );
};

export default CraftingScreen;
