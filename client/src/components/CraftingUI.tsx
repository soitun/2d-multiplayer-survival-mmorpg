import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './InventoryUI.module.css'; // Reuse styles for consistency
import { DbConnection } from '../generated';
import {
    Recipe,
    RecipeIngredient,
    CraftingQueueItem,
    ItemDefinition,
    InventoryItem,
    InventoryLocationData,
    HotbarLocationData,
    ItemCategory,
    ActiveConsumableEffect,
} from '../generated/types';
import { Identity } from 'spacetimedb';
import { PopulatedItem } from './InventoryUI'; // Reuse PopulatedItem type
import { getItemIcon } from '../utils/itemIconUtils';
import CraftingSearchBar from './CraftingSearchBar'; // Import the new component
import { ITEM_TO_NODE_MAP, MEMORY_GRID_NODES } from './MemoryGridData'; // Memory Grid integration

interface CraftingUIProps {
    playerIdentity: Identity | null;
    recipes: Map<string, Recipe>;
    craftingQueueItems: Map<string, CraftingQueueItem>;
    itemDefinitions: Map<string, ItemDefinition>;
    inventoryItems: Map<string, InventoryItem>; // Needed to check resource availability
    connection: DbConnection | null;
    onCraftingSearchFocusChange?: (isFocused: boolean) => void;
    onItemMouseEnter: (item: PopulatedItem, event: React.MouseEvent<HTMLDivElement>) => void;
    onItemMouseLeave: () => void;
    onItemMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
    purchasedMemoryNodes?: Set<string>; // Memory Grid nodes the player has purchased
    activeConsumableEffects?: Map<string, ActiveConsumableEffect>; // Active effects for station proximity check
}

// Helper to calculate remaining time
const calculateRemainingTime = (finishTime: number, now: number): number => {
    return Math.max(0, Math.ceil((finishTime - now) / 1000));
};

const CraftingUI: React.FC<CraftingUIProps> = ({
    playerIdentity,
    recipes,
    craftingQueueItems,
    itemDefinitions,
    inventoryItems,
    connection,
    onCraftingSearchFocusChange,
    onItemMouseEnter,
    onItemMouseLeave,
    onItemMouseMove,
    purchasedMemoryNodes = new Set(['center']), // Default: only center node unlocked
    activeConsumableEffects,
}) => {
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [craftQuantities, setCraftQuantities] = useState<Map<string, number>>(new Map()); // State for quantity input
    // Initialize searchTerm from localStorage, fallback to empty string
    const [searchTerm, setSearchTerm] = useState<string>(() => {
        return localStorage.getItem('craftingSearchTerm') || '';
    });
    const [craftedRecipeIdsThisSession, setCraftedRecipeIdsThisSession] = useState<Set<string>>(new Set()); // New state
    const [hoveredRecipe, setHoveredRecipe] = useState<{ id: string; name: string; x: number; y: number; requiresStation?: string | null } | null>(null); // For local name-only tooltip

    // Timer to update queue times
    useEffect(() => {
        const timerId = setInterval(() => {
            setCurrentTime(Date.now());
        }, 1000); // Update every second
        return () => clearInterval(timerId);
    }, []);

    // Defensive cleanup to ensure game controls are restored on unmount
    useEffect(() => {
        return () => {
            // Always restore game controls when component unmounts
            onCraftingSearchFocusChange?.(false);
        };
    }, [onCraftingSearchFocusChange]);

    // Tooltip handlers for resource icons - delegate to parent like ExternalContainerUI
    const handleResourceIconMouseEnter = useCallback((resourceName: string, event: React.MouseEvent<HTMLDivElement>) => {
        // Prevent browser tooltip
        event.currentTarget.removeAttribute('title');
        
        // Create minimal item object with just the name for tooltip
        const resourceItem: PopulatedItem = {
            instance: {
                instanceId: BigInt(0),
                itemDefId: BigInt(0),
                quantity: 0,
                location: { tag: 'Inventory', value: null as any },
                durability: null,
                waterContent: null
            } as any,
            definition: {
                id: BigInt(0),
                itemDefId: BigInt(0),
                name: resourceName,
                description: '',
                category: '',
                iconAssetName: '',
                rarity: undefined,
                maxStackSize: 1
            } as any
        };
        
        onItemMouseEnter(resourceItem, event);
    }, [onItemMouseEnter]);

    const handleResourceIconMouseLeave = useCallback(() => {
        onItemMouseLeave();
    }, [onItemMouseLeave]);

    const handleResourceIconMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        onItemMouseMove(event);
    }, [onItemMouseMove]);

    // Memoize player inventory calculation
    const playerInventoryResources = useMemo(() => {
        const resources: Map<string, number> = new Map();
        if (!playerIdentity) return resources;

        // console.log('[CraftingUI DEBUG] Recalculating resources. inventoryItems prop:', new Map(inventoryItems)); // Log a clone

        Array.from(inventoryItems.values())
            .filter(item => {
                if (item.location.tag === 'Inventory') {
                    const inventoryData = item.location.value as InventoryLocationData;
                    return inventoryData.ownerId && inventoryData.ownerId.isEqual(playerIdentity);
                } else if (item.location.tag === 'Hotbar') {
                    const hotbarData = item.location.value as HotbarLocationData;
                    return hotbarData.ownerId && hotbarData.ownerId.isEqual(playerIdentity);
                }
                return false; // Not in player's inventory or hotbar
            })
            .forEach(item => {
                const defIdStr = item.itemDefId.toString();
                // console.log(`[CraftingUI DEBUG Sum] Adding ${item.quantity} of Def ${defIdStr} (Instance ${item.instanceId}) from slot Inv=${item.inventorySlot}/Hotbar=${item.hotbarSlot}`);
                resources.set(defIdStr, (resources.get(defIdStr) || 0) + item.quantity);
            });
            
        // console.log('[CraftingUI DEBUG] Calculated playerInventoryResources:', resources);
            
        return resources;
    }, [inventoryItems, playerIdentity]);

    // Filter and sort crafting queue for the current player
    // Filter out items that have been finished for 2+ seconds (gives server time to process)
    const playerQueue = useMemo(() => {
        if (!playerIdentity) return [];
        const now = Date.now();
        return Array.from(craftingQueueItems.values())
            .filter(item => {
                if (!item.playerIdentity || !item.playerIdentity.isEqual(playerIdentity)) return false;
                // Only hide items that have been finished for 2+ seconds
                // This gives the server time to process (checks every 1 second) and grant the item
                const finishTimeMs = Number(item.finishTime.microsSinceUnixEpoch / 1000n);
                const remainingTime = Math.ceil((finishTimeMs - now) / 1000);
                return remainingTime > -2; // Show items until 2 seconds after completion
            })
            .sort((a, b) => Number(a.finishTime.microsSinceUnixEpoch - b.finishTime.microsSinceUnixEpoch)); // Sort by finish time ASC
    }, [craftingQueueItems, playerIdentity, currentTime]); // Add currentTime to dependencies so it updates every second

    // --- Crafting Handlers ---
    const handleCraftItem = (recipeId: bigint, quantity: number) => {
        if (!connection?.reducers) return;
        // console.log(`Attempting to craft recipe ID: ${recipeId}, quantity: ${quantity}`);
        try {
            if (quantity > 0) { // Ensure quantity is positive
                // Call the new reducer
                connection.reducers.startCraftingMultiple({ recipeId: BigInt(recipeId), quantityToCraft: quantity });
                // Optimistically add to crafted this session
                setCraftedRecipeIdsThisSession(prev => new Set(prev).add(recipeId.toString()));
            } else {
                console.warn("Attempted to craft with quantity 0 or less.");
            }
        } catch (err) {
            console.error("Error calling startCraftingMultiple reducer:", err);
            // TODO: Show user-friendly error feedback
        }
    };

    const handleCancelCraft = (queueItemId: bigint) => {
        if (!connection?.reducers) return;
        // console.log(`Attempting to cancel craft queue item ID: ${queueItemId}`);
        try {
            connection.reducers.cancelCraftingItem({ queueItemId: BigInt(queueItemId) });
        } catch (err) {
            console.error("Error calling cancelCraftingItem reducer:", err);
            // TODO: Show user-friendly error feedback
        }
    };

    const handleCancelAllCrafting = () => {
        if (!connection?.reducers) return;
        // console.log("Attempting to cancel all crafting items.");
        try {
            connection.reducers.cancelAllCrafting({});
        } catch (err) {
            console.error("Error calling cancelAllCrafting reducer:", err);
            // TODO: Show user-friendly error feedback
        }
    };

    const handleMoveToFront = (queueItemId: bigint) => {
        if (!connection?.reducers) return;
        try {
            connection.reducers.moveCraftingQueueItemToFront({ queueItemId: BigInt(queueItemId) });
        } catch (err) {
            console.error("Error calling moveCraftingQueueItemToFront reducer:", err);
        }
    };

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

    // --- Helper to check craftability ---
    const canCraft = (recipe: Recipe, quantity: number = 1): boolean => {
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
    };

    // --- Helper to check Memory Grid unlock status ---
    const isRecipeUnlockedByMemoryGrid = useCallback((recipe: Recipe): boolean => {
        const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
        if (!outputDef) return true; // Unknown item, allow crafting
        
        const requiredNode = ITEM_TO_NODE_MAP[outputDef.name];
        if (!requiredNode) return true; // Item doesn't require Memory Grid unlock
        
        return purchasedMemoryNodes.has(requiredNode);
    }, [itemDefinitions, purchasedMemoryNodes]);

    // --- Helper to get required Memory Grid node name for display ---
    const getRequiredNodeName = useCallback((recipe: Recipe): string | null => {
        const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
        if (!outputDef) return null;
        
        const requiredNodeId = ITEM_TO_NODE_MAP[outputDef.name];
        if (!requiredNodeId) return null;
        
        const node = MEMORY_GRID_NODES.find(n => n.id === requiredNodeId);
        return node ? node.name : requiredNodeId;
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
        // Note: This field may be named requiresStation in TypeScript bindings
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

    // --- Search Handler with localStorage persistence ---
    const handleSearchChange = (newSearchTerm: string) => {
        setSearchTerm(newSearchTerm);
        // Save to localStorage for persistence
        localStorage.setItem('craftingSearchTerm', newSearchTerm);
    };

    // State for filtered recipes from the search bar
    const [filteredRecipes, setFilteredRecipes] = useState<Array<{
        recipe: Recipe;
        score: number;
    }>>([]);

    // Convert recipes to the format expected by CraftingSearchBar
    // IMPORTANT: Filter out locked recipes - they shouldn't appear in Quick Craft menu at all
    const recipeList = useMemo(() => {
        return Array.from(recipes.values())
            .filter(recipe => isRecipeUnlockedByMemoryGrid(recipe)) // Hide locked recipes
            .map(recipe => {
            const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
            const outputName = outputDef?.name || 'Unknown';
            
            // Override category for Tallow - treat as Material even though it's Consumable
            // because it's a basic building material used in many recipes
            let category = outputDef?.category || { tag: 'Material' };
            if (outputName === 'Tallow') {
                category = { tag: 'Material' };
            }
            
            return {
                id: recipe.recipeId.toString(),
                name: outputName,
                category: category,
                materials: recipe.ingredients.map(ing => {
                    const ingDef = itemDefinitions.get(ing.itemDefId.toString());
                    return {
                        itemId: ingDef?.name || ing.itemDefId.toString(),
                        quantity: ing.quantity
                    };
                }),
                output: {
                    itemId: outputName,
                    quantity: recipe.outputQuantity
                }
            };
        });
    }, [recipes, itemDefinitions, isRecipeUnlockedByMemoryGrid]);

    // Convert player inventory to the format expected by CraftingSearchBar  
    const inventoryForFiltering = useMemo(() => {
        const inventory: Record<string, number> = {};
        Array.from(itemDefinitions.values()).forEach(itemDef => {
            const quantity = playerInventoryResources.get(itemDef.id.toString()) || 0;
            inventory[itemDef.name] = quantity;
        });
        

        
        return inventory;
    }, [playerInventoryResources, itemDefinitions]);

    // Stable empty object for playerHotbar prop (avoid creating new {} on each render)
    const emptyHotbar = useMemo(() => ({}), []);

    // Handle filtered recipes from the search bar - memoized to prevent infinite loops
    const handleFilteredRecipesChange = useCallback((filteredRecipesInput: any[]) => {
        setFilteredRecipes(prevFiltered => {
            const recipesWithScores = filteredRecipesInput.map(filterResult => {
                const originalRecipe = Array.from(recipes.values()).find(r => r.recipeId.toString() === filterResult.id);
                return {
                    recipe: originalRecipe!,
                    score: 0 // Score is already calculated in the filter
                };
            }).filter(item => item.recipe); // Remove any undefined recipes

            // Avoid unnecessary state updates if the result is the same
            if (prevFiltered.length === recipesWithScores.length) {
                const same = prevFiltered.every((p, i) => 
                    p.recipe?.recipeId === recipesWithScores[i]?.recipe?.recipeId
                );
                if (same) return prevFiltered; // Return same reference to avoid re-render
            }
            
            return recipesWithScores;
        });
    }, [recipes]);

    // Initialize filtered recipes to empty - let CraftingSearchBar handle ALL filtering
    useEffect(() => {
        // Don't manually initialize - let the CraftingSearchBar algorithm do its work
        if (recipeList.length === 0) {
            setFilteredRecipes([]);
        }
    }, [recipeList]);

    return (
        <div className={styles.rightPane}> {/* Use existing right pane style */}
            {/* CSS to hide webkit number input spinners */}
            <style>{`
                .craft-quantity-input::-webkit-outer-spin-button,
                .craft-quantity-input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
            `}</style>
            {/* Craftable Items Section - Now a List */}
            <div className={styles.craftingHeader}>
                <h3 className={styles.sectionTitle}>QUICK CRAFT</h3>
            </div>
            {/* Add Search Bar (no category filter - use full CraftingScreen for categories) */}
            <CraftingSearchBar 
                searchTerm={searchTerm}
                onSearchChange={handleSearchChange}
                placeholder="Search by item or ingredient name..."
                onFocus={() => onCraftingSearchFocusChange?.(true)}
                onBlur={() => onCraftingSearchFocusChange?.(false)}
                recipes={recipeList}
                playerInventory={inventoryForFiltering}
                playerHotbar={emptyHotbar}
                onFilteredRecipesChange={handleFilteredRecipesChange}
                showCategoryFilter={false}
            />
            {/* Added scrollable class and data-attribute */}
            <div data-scrollable-region="crafting-items" className={`${styles.craftableItemsSection} ${styles.scrollableSection}`}> 
                {/* Grid layout: 6 items per row, fixed size */}
                <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, 48px)',
                    gap: '16px',
                    padding: '4px',
                    justifyContent: 'center'
                }}> 
                    {filteredRecipes.map((recipeData) => {
                        const recipe = recipeData.recipe;
                        const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
                        if (!outputDef) return null;
                        
                        // Check if recipe is locked by Memory Grid
                        const isMemoryGridUnlocked = isRecipeUnlockedByMemoryGrid(recipe);
                        
                        // Check if recipe requires a crafting station (Cooking Station)
                        const requiredStation = getRequiredStation(recipe);
                        const hasStationAccess = isStationRequirementMet(recipe);
                        
                        // Check if player has resources but needs station (for orange styling)
                        const hasResourcesButNeedsStation = isMemoryGridUnlocked && !hasStationAccess && requiredStation && canCraft(recipe, 1);
                        
                        // Recipe is only craftable if unlocked, station available, AND has resources (quantity 1 for quick craft)
                        const isCraftable = isMemoryGridUnlocked && hasStationAccess && canCraft(recipe, 1);

                        // Determine border color: green=craftable, orange=has ingredients but needs station, red=missing ingredients, purple=locked
                        const getBorderColor = () => {
                            if (!isMemoryGridUnlocked) return '1px solid rgba(139, 92, 246, 0.4)'; // Purple - locked
                            if (isCraftable) return '1px solid rgba(0, 255, 136, 0.5)'; // Green - craftable
                            if (hasResourcesButNeedsStation) return '1px solid rgba(255, 165, 0, 0.6)'; // Orange - has ingredients, needs station
                            return '1px solid rgba(255, 51, 102, 0.4)'; // Red - missing ingredients
                        };

                        const getBoxShadow = () => {
                            if (!isMemoryGridUnlocked) return 'inset 0 0 6px rgba(139, 92, 246, 0.1)';
                            if (isCraftable) return '0 0 8px rgba(0, 255, 136, 0.2), inset 0 0 6px rgba(0, 255, 136, 0.1)';
                            if (hasResourcesButNeedsStation) return '0 0 8px rgba(255, 165, 0, 0.25), inset 0 0 6px rgba(255, 165, 0, 0.1)';
                            return 'inset 0 0 6px rgba(255, 51, 102, 0.1)';
                        };

                        return (
                            <div 
                                key={recipe.recipeId.toString()}
                                onClick={() => {
                                    if (isCraftable) {
                                        handleCraftItem(recipe.recipeId, 1);
                                    }
                                }}
                                style={{ 
                                    width: '48px',
                                    height: '48px',
                                    padding: '4px',
                                    background: !isMemoryGridUnlocked 
                                        ? 'linear-gradient(135deg, rgba(40, 30, 50, 0.6), rgba(30, 25, 40, 0.7))'
                                        : hasResourcesButNeedsStation
                                            ? 'linear-gradient(135deg, rgba(50, 35, 20, 0.6), rgba(40, 30, 15, 0.7))'
                                            : isCraftable 
                                                ? 'linear-gradient(135deg, rgba(20, 30, 60, 0.6), rgba(15, 25, 50, 0.7))'
                                                : 'linear-gradient(135deg, rgba(30, 20, 40, 0.6), rgba(25, 15, 35, 0.7))',
                                    borderRadius: '4px',
                                    border: getBorderColor(),
                                    boxShadow: getBoxShadow(),
                                    cursor: isCraftable ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.15s ease',
                                    opacity: !isMemoryGridUnlocked ? 0.7 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    position: 'relative'
                                }}
                                onMouseEnter={(e) => {
                                    if (isCraftable) e.currentTarget.style.transform = 'scale(1.08)';
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredRecipe({
                                        id: recipe.recipeId.toString(),
                                        name: outputDef.name,
                                        x: rect.left,
                                        y: rect.top + rect.height / 2,
                                        requiresStation: hasResourcesButNeedsStation ? requiredStation : null
                                    });
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    setHoveredRecipe(null);
                                }}
                            >
                                <img
                                    src={getItemIcon(outputDef.iconAssetName, 'crafting')}
                                    alt={outputDef.name}
                                    style={{ 
                                        width: '32px', 
                                        height: '32px', 
                                        objectFit: 'contain', 
                                        imageRendering: 'pixelated',
                                        filter: !isMemoryGridUnlocked ? 'grayscale(60%) brightness(0.7)' : !isCraftable && !hasResourcesButNeedsStation ? 'grayscale(40%) brightness(0.8)' : 'none'
                                    }}
                                />
                                {/* Lock overlay for locked recipes */}
                                {!isMemoryGridUnlocked && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '2px',
                                        right: '2px',
                                        fontSize: '12px',
                                        filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.8))'
                                    }}>
                                        🔒
                                    </div>
                                )}
                                {/* Cooking station indicator for recipes that need a station */}
                                {isMemoryGridUnlocked && hasResourcesButNeedsStation && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '1px',
                                        right: '1px',
                                        fontSize: '10px',
                                        filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))'
                                    }}>
                                        🍳
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Crafting Queue Section (Moved down, potentially needs own scroll later) */}
            <div className={styles.craftingQueueSection}>
                <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#00ffff', margin: '16px 0 12px 0', textShadow: '0 0 10px rgba(0, 255, 255, 0.6)' }}>
                    CRAFTING QUEUE ({playerQueue.length})
                </h4>
                 {/* Added scrollable class and data-attribute */}
                <div data-scrollable-region="crafting-queue" className={`${styles.craftingQueueList} ${styles.scrollableSection}`}> 
                    {playerQueue.map((item, index) => {
                        const outputDef = itemDefinitions.get(item.outputItemDefId.toString());
                        const remainingTime = calculateRemainingTime(Number(item.finishTime.microsSinceUnixEpoch / 1000n), currentTime);
                        const isFirst = index === 0;

                        return (
                            <div
                                key={item.queueItemId.toString()}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    if (!isFirst) handleMoveToFront(item.queueItemId);
                                }}
                                title={isFirst ? 'Already first in queue' : 'Right-click to move to front'}
                                style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '12px',
                                background: 'linear-gradient(135deg, rgba(20, 30, 60, 0.6), rgba(15, 25, 50, 0.7))',
                                borderRadius: '6px',
                                marginBottom: '8px',
                                border: '2px solid rgba(0, 170, 255, 0.3)',
                                boxShadow: 'inset 0 0 10px rgba(0, 170, 255, 0.1)',
                                transition: 'all 0.3s ease'
                            }}>
                                <div style={{ width: '40px', height: '40px', flexShrink: 0 }}>
                                    {outputDef && (
                                        <img
                                            src={getItemIcon(outputDef.iconAssetName, 'crafting')}
                                            alt={outputDef?.name || 'Crafting'}
                                            style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
                                        />
                                                    )}
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#00ffff', textShadow: '0 0 8px rgba(0, 255, 255, 0.6)' }}>
                                        {outputDef?.name || 'Unknown Item'}
                                    </div>
                                    <div style={{ fontSize: '14px', color: '#00aaff' }}>
                                        {remainingTime > 0 ? `${remainingTime}s remaining` : 'Completing...'}
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleCancelCraft(item.queueItemId)}
                                    style={{
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.3), rgba(200, 40, 80, 0.4))',
                                        color: '#ff3366',
                                        border: '2px solid rgba(255, 51, 102, 0.5)',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        boxShadow: '0 0 15px rgba(255, 51, 102, 0.3), inset 0 0 10px rgba(255, 51, 102, 0.1)',
                                        textShadow: '0 0 8px rgba(255, 51, 102, 0.6)',
                                        transition: 'all 0.3s ease'
                                    }}
                                    title="Cancel Craft"
                                >
                                    CANCEL
                                </button>
                            </div>
                        );
                    })}
                    {playerQueue.length === 0 && 
                        <div style={{ 
                            fontSize: '14px', 
                            color: '#00aaff', 
                            textAlign: 'center', 
                            padding: '20px',
                            textShadow: '0 0 5px rgba(0, 170, 255, 0.4)'
                        }}>
                            No items in queue
                        </div>
                    }
                </div>
                {/* Add Cancel All Button Here */}
                {playerQueue.length > 0 && (
                    <button 
                        onClick={handleCancelAllCrafting}
                        style={{
                            width: '100%',
                            padding: '12px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.3), rgba(200, 40, 80, 0.4))',
                            color: '#ff3366',
                            border: '2px solid rgba(255, 51, 102, 0.5)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginTop: '8px',
                            boxShadow: '0 0 15px rgba(255, 51, 102, 0.3), inset 0 0 10px rgba(255, 51, 102, 0.1)',
                            textShadow: '0 0 8px rgba(255, 51, 102, 0.6)',
                            transition: 'all 0.3s ease'
                        }}
                        title="Cancel all items in queue and refund resources"
                    >
                        CANCEL ALL QUEUE
                    </button>
                )}
            </div>

            {/* Portal-based name tooltip for quick craft grid - renders to body to avoid overflow clipping */}
            {hoveredRecipe && createPortal(
                <div style={{
                    position: 'fixed',
                    left: hoveredRecipe.x - 8,
                    top: hoveredRecipe.y,
                    transform: 'translateX(-100%) translateY(-50%)',
                    padding: '6px 10px',
                    background: 'linear-gradient(135deg, rgba(20, 30, 60, 0.95), rgba(15, 25, 50, 0.98))',
                    border: hoveredRecipe.requiresStation 
                        ? '1px solid rgba(255, 165, 0, 0.6)' 
                        : '1px solid rgba(0, 170, 255, 0.5)',
                    borderRadius: '4px',
                    color: hoveredRecipe.requiresStation ? '#ffa500' : '#00ffff',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    fontFamily: '"Courier New", monospace',
                    whiteSpace: 'nowrap',
                    zIndex: 10000,
                    pointerEvents: 'none',
                    boxShadow: hoveredRecipe.requiresStation 
                        ? '0 0 10px rgba(255, 165, 0, 0.3)' 
                        : '0 0 10px rgba(0, 170, 255, 0.3)',
                    textShadow: hoveredRecipe.requiresStation 
                        ? '0 0 5px rgba(255, 165, 0, 0.5)' 
                        : '0 0 5px rgba(0, 255, 255, 0.5)'
                }}>
                    <div>{hoveredRecipe.name}</div>
                    {hoveredRecipe.requiresStation && (
                        <div style={{ 
                            fontSize: '10px', 
                            marginTop: '4px', 
                            color: '#ffcc66',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            <span>🍳</span>
                            <span>Requires {hoveredRecipe.requiresStation}</span>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

export default CraftingUI;
