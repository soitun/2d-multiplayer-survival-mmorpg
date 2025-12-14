import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import styles from './InventoryUI.module.css'; // Reuse styles for consistency
import {
    Recipe,
    RecipeIngredient,
    CraftingQueueItem,
    ItemDefinition,
    InventoryItem,
    DbConnection,
    InventoryLocationData,
    HotbarLocationData,
    ItemCategory,
} from '../generated';
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
}) => {
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [craftQuantities, setCraftQuantities] = useState<Map<string, number>>(new Map()); // State for quantity input
    // Initialize searchTerm from localStorage, fallback to empty string
    const [searchTerm, setSearchTerm] = useState<string>(() => {
        return localStorage.getItem('craftingSearchTerm') || '';
    });
    const [craftedRecipeIdsThisSession, setCraftedRecipeIdsThisSession] = useState<Set<string>>(new Set()); // New state

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

    // Tooltip handler for output item icon
    const handleOutputItemIconMouseEnter = useCallback((itemDef: ItemDefinition, event: React.MouseEvent<HTMLDivElement>) => {
        // Prevent browser tooltip
        event.currentTarget.removeAttribute('title');
        
        // Create PopulatedItem object with the output item definition
        const outputItem: PopulatedItem = {
            instance: {
                instanceId: BigInt(0),
                itemDefId: itemDef.id,
                quantity: 0,
                location: { tag: 'Inventory', value: null as any },
                durability: null,
                waterContent: null
            } as any,
            definition: itemDef
        };
        
        onItemMouseEnter(outputItem, event);
    }, [onItemMouseEnter]);

    const handleOutputItemIconMouseLeave = useCallback(() => {
        onItemMouseLeave();
    }, [onItemMouseLeave]);

    const handleOutputItemIconMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
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
                    return inventoryData.ownerId.isEqual(playerIdentity);
                } else if (item.location.tag === 'Hotbar') {
                    const hotbarData = item.location.value as HotbarLocationData;
                    return hotbarData.ownerId.isEqual(playerIdentity);
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
                if (!item.playerIdentity.isEqual(playerIdentity)) return false;
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
                connection.reducers.startCraftingMultiple(recipeId, quantity);
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
            connection.reducers.cancelCraftingItem(queueItemId);
        } catch (err) {
            console.error("Error calling cancelCraftingItem reducer:", err);
            // TODO: Show user-friendly error feedback
        }
    };

    const handleCancelAllCrafting = () => {
        if (!connection?.reducers) return;
        // console.log("Attempting to cancel all crafting items.");
        try {
            connection.reducers.cancelAllCrafting();
        } catch (err) {
            console.error("Error calling cancelAllCrafting reducer:", err);
            // TODO: Show user-friendly error feedback
        }
    };

    // --- Helper to calculate max craftable quantity ---
    const calculateMaxCraftable = (recipe: Recipe): number => {
        if (!recipe.ingredients || recipe.ingredients.length === 0) return 0; // Cannot craft if no ingredients

        let maxPossible = Infinity;
        for (const ingredient of recipe.ingredients) {
            const available = playerInventoryResources.get(ingredient.itemDefId.toString()) || 0;
            if (ingredient.quantity === 0) continue; // Should not happen, but avoid division by zero
            maxPossible = Math.min(maxPossible, Math.floor(available / ingredient.quantity));
        }
        return maxPossible === Infinity ? 0 : maxPossible; // If loop didn't run (e.g. no ingredients with quantity > 0), return 0
    };

    // --- Helper to check craftability ---
    const canCraft = (recipe: Recipe, quantity: number = 1): boolean => {
        for (const ingredient of recipe.ingredients) {
            const available = playerInventoryResources.get(ingredient.itemDefId.toString()) || 0;
            if (available < ingredient.quantity * quantity) { // Check against total needed
                return false;
            }
        }
        return recipe.ingredients.length > 0; // Also ensure there are ingredients
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
    const recipeList = useMemo(() => {
        return Array.from(recipes.values()).map(recipe => {
            const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
            return {
                id: recipe.recipeId.toString(),
                name: outputDef?.name || 'Unknown',
                category: outputDef?.category || { tag: 'Material' },
                materials: recipe.ingredients.map(ing => {
                    const ingDef = itemDefinitions.get(ing.itemDefId.toString());
                    return {
                        itemId: ingDef?.name || ing.itemDefId.toString(),
                        quantity: ing.quantity
                    };
                }),
                output: {
                    itemId: outputDef?.name || recipe.outputItemDefId.toString(),
                    quantity: recipe.outputQuantity
                }
            };
        });
    }, [recipes, itemDefinitions]);

    // Convert player inventory to the format expected by CraftingSearchBar  
    const inventoryForFiltering = useMemo(() => {
        const inventory: Record<string, number> = {};
        Array.from(itemDefinitions.values()).forEach(itemDef => {
            const quantity = playerInventoryResources.get(itemDef.id.toString()) || 0;
            inventory[itemDef.name] = quantity;
        });
        

        
        return inventory;
    }, [playerInventoryResources, itemDefinitions]);

    // Handle filtered recipes from the search bar
    const handleFilteredRecipesChange = (filteredRecipes: any[]) => {
        const recipesWithScores = filteredRecipes.map(filterResult => {
            const originalRecipe = Array.from(recipes.values()).find(r => r.recipeId.toString() === filterResult.id);
            return {
                recipe: originalRecipe!,
                score: 0 // Score is already calculated in the filter
            };
        }).filter(item => item.recipe); // Remove any undefined recipes
        
        setFilteredRecipes(recipesWithScores);
    };

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
                onFilteredRecipesChange={handleFilteredRecipesChange}
                showCategoryFilter={false}
            />
            {/* Added scrollable class and data-attribute */}
            <div data-scrollable-region="crafting-items" className={`${styles.craftableItemsSection} ${styles.scrollableSection}`}> 
                {/* Recipe list container */}
                <div className={styles.craftableItemsList}> 
                    {filteredRecipes.map((recipeData) => {
                        const recipe = recipeData.recipe;
                        const outputDef = itemDefinitions.get(recipe.outputItemDefId.toString());
                        if (!outputDef) return null;

                        const currentQuantity = craftQuantities.get(recipe.recipeId.toString()) || 1;
                        const maxCraftableForThisRecipe = calculateMaxCraftable(recipe);
                        
                        // Check if recipe is locked by Memory Grid
                        const isMemoryGridUnlocked = isRecipeUnlockedByMemoryGrid(recipe);
                        const requiredNodeName = !isMemoryGridUnlocked ? getRequiredNodeName(recipe) : null;
                        
                        // Recipe is only craftable if unlocked AND has resources
                        const isCraftable = isMemoryGridUnlocked && canCraft(recipe, currentQuantity) && currentQuantity <= maxCraftableForThisRecipe && currentQuantity > 0;

                        const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                            let newQuantity = parseInt(e.target.value, 10);
                            if (isNaN(newQuantity) || newQuantity < 1) {
                                newQuantity = 1; // Default to 1 if invalid or less than 1
                            }
                            const clampedQuantity = Math.min(newQuantity, maxCraftableForThisRecipe > 0 ? maxCraftableForThisRecipe : 1);
                            setCraftQuantities(prev => new Map(prev).set(recipe.recipeId.toString(), clampedQuantity));
                        };

                        const handleMaxClick = () => {
                            const maxVal = calculateMaxCraftable(recipe);
                            setCraftQuantities(prev => new Map(prev).set(recipe.recipeId.toString(), maxVal > 0 ? maxVal : 1));
                        };
                        
                        return (
                            // Two-column layout: Icon | Content (Name, Resources, Buttons)
                            <div key={recipe.recipeId.toString()} className={styles.craftingRecipeRow} style={{ 
                                padding: '12px', 
                                marginBottom: '8px', 
                                background: !isMemoryGridUnlocked 
                                    ? 'linear-gradient(135deg, rgba(40, 30, 50, 0.6), rgba(30, 25, 40, 0.7))' // Darker purple for locked
                                    : 'linear-gradient(135deg, rgba(20, 30, 60, 0.6), rgba(15, 25, 50, 0.7))', 
                                borderRadius: '6px',
                                border: !isMemoryGridUnlocked 
                                    ? '2px solid rgba(139, 92, 246, 0.4)' // Purple border for locked
                                    : isCraftable ? '2px solid rgba(0, 255, 136, 0.5)' : '2px solid rgba(0, 170, 255, 0.3)',
                                boxShadow: !isMemoryGridUnlocked 
                                    ? 'inset 0 0 10px rgba(139, 92, 246, 0.1)' // Purple glow for locked
                                    : isCraftable ? '0 0 15px rgba(0, 255, 136, 0.2), inset 0 0 10px rgba(0, 255, 136, 0.1)' : 'inset 0 0 10px rgba(0, 170, 255, 0.1)',
                                display: 'flex',
                                gap: '12px',
                                transition: 'all 0.3s ease',
                                opacity: !isMemoryGridUnlocked ? 0.7 : 1 // Slightly dimmed for locked
                            }}>
                                {/* Left Column: Recipe Icon */}
                                <div 
                                    style={{ 
                                        width: '48px', 
                                        height: '48px', 
                                        flexShrink: 0,
                                        cursor: 'pointer',
                                        transition: 'transform 0.1s ease-out',
                                        transform: 'scale(1)',
                                        position: 'relative'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'scale(1.05)';
                                        handleOutputItemIconMouseEnter(outputDef, e);
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'scale(1)';
                                        handleOutputItemIconMouseLeave();
                                    }}
                                    onMouseMove={handleOutputItemIconMouseMove}
                                >
                                    <img
                                        src={getItemIcon(outputDef.iconAssetName)}
                                        alt={outputDef.name}
                                        style={{ 
                                            width: '100%', 
                                            height: '100%', 
                                            objectFit: 'contain', 
                                            imageRendering: 'pixelated',
                                            filter: !isMemoryGridUnlocked ? 'grayscale(60%) brightness(0.7)' : 'none'
                                        }}
                                    />
                                    {/* Lock overlay for locked recipes */}
                                    {!isMemoryGridUnlocked && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            background: 'rgba(139, 92, 246, 0.2)',
                                            borderRadius: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            <span style={{ fontSize: '20px', filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))' }}>🔒</span>
                                        </div>
                                    )}
                                </div>

                                {/* Right Column: Content (3 rows) */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    
                                    {/* Row 1: Recipe Name + Lock Indicator */}
                                    <div style={{ 
                                        fontSize: '16px', 
                                        fontWeight: 'bold', 
                                        color: !isMemoryGridUnlocked ? '#8b5cf6' : '#00ffff', // Purple for locked
                                        wordBreak: 'break-word',
                                        lineHeight: '1.2',
                                        textAlign: 'left',
                                        textShadow: !isMemoryGridUnlocked ? '0 0 8px rgba(139, 92, 246, 0.6)' : '0 0 8px rgba(0, 255, 255, 0.6)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        {!isMemoryGridUnlocked && (
                                            <span style={{ fontSize: '14px' }}>🔒</span>
                                        )}
                                        {outputDef.name}
                                    </div>
                                    
                                    {/* Memory Grid Lock Message */}
                                    {!isMemoryGridUnlocked && requiredNodeName && (
                                        <div style={{
                                            fontSize: '11px',
                                            color: '#8b5cf6',
                                            background: 'rgba(139, 92, 246, 0.15)',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            border: '1px solid rgba(139, 92, 246, 0.3)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            width: 'fit-content'
                                        }}>
                                            <span>⚡</span>
                                            <span>Unlock "<strong>{requiredNodeName}</strong>" in Memory Grid</span>
                                        </div>
                                    )}

                                    {/* Row 2: Resources */}
                                    <div style={{ 
                                        display: 'flex', 
                                        flexWrap: 'wrap',
                                        gap: '6px'
                                    }}>
                                        {recipe.ingredients.map((ing, index) => {
                                            const ingDef = itemDefinitions.get(ing.itemDefId.toString());
                                            const available = playerInventoryResources.get(ing.itemDefId.toString()) || 0;
                                            const neededTotal = ing.quantity * currentQuantity;
                                            const hasEnough = available >= neededTotal;
                                            return (
                                                                                                <div key={index} style={{ 
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    background: hasEnough ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.15), rgba(0, 200, 100, 0.2))' : 'linear-gradient(135deg, rgba(255, 51, 102, 0.15), rgba(200, 40, 80, 0.2))',
                                                    padding: '4px 6px',
                                                    borderRadius: '3px',
                                                    border: hasEnough ? '2px solid rgba(0, 255, 136, 0.4)' : '2px solid rgba(255, 51, 102, 0.4)',
                                                    boxShadow: hasEnough ? '0 0 8px rgba(0, 255, 136, 0.2)' : '0 0 8px rgba(255, 51, 102, 0.2)',
                                                    color: hasEnough ? '#00ff88' : '#ff3366',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    transform: 'scale(1)',
                                                    textShadow: hasEnough ? '0 0 5px rgba(0, 255, 136, 0.4)' : '0 0 5px rgba(255, 51, 102, 0.4)'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.transform = 'scale(1.05)';
                                                    handleResourceIconMouseEnter(ingDef?.name || 'Unknown Resource', e);
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = 'scale(1)';
                                                    handleResourceIconMouseLeave();
                                                }}
                                                onMouseMove={handleResourceIconMouseMove}
                                                >
                                                    <div 
                                                        style={{ 
                                                            width: '16px', 
                                                            height: '16px', 
                                                            flexShrink: 0
                                                        }}
                                                    >
                                                        <img
                                                            src={getItemIcon(ingDef?.iconAssetName || '')}
                                                            alt={ingDef?.name || 'Unknown'}
                                                            style={{ 
                                                                width: '100%', 
                                                                height: '100%', 
                                                                objectFit: 'contain', 
                                                                imageRendering: 'pixelated'
                                                            }}
                                                        />
                                                    </div>
                                                    <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
                                                        {ing.quantity}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: '#ccc' }}>
                                                        ({available})
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Row 3: Actions (Quantity + Craft Button) */}
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between',
                                        gap: '8px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                            {/* Decrease Button */}
                                            <button 
                                                onClick={() => {
                                                    const newQuantity = Math.max(1, currentQuantity - 1);
                                                    setCraftQuantities(prev => new Map(prev).set(recipe.recipeId.toString(), newQuantity));
                                                }}
                                                disabled={currentQuantity <= 1}
                                                style={{
                                                    width: '24px',
                                                    height: '24px',
                                                    padding: '0',
                                                    fontSize: '14px',
                                                    fontWeight: 'bold',
                                                    background: currentQuantity > 1 ? 'linear-gradient(135deg, rgba(0, 170, 255, 0.3), rgba(0, 150, 220, 0.4))' : 'linear-gradient(135deg, rgba(40, 40, 60, 0.5), rgba(30, 30, 50, 0.6))',
                                                    color: currentQuantity > 1 ? '#00aaff' : '#666',
                                                    border: currentQuantity > 1 ? '2px solid rgba(0, 170, 255, 0.4)' : '2px solid rgba(100, 100, 120, 0.3)',
                                                    borderRadius: '3px 0 0 3px',
                                                    cursor: currentQuantity > 1 ? 'pointer' : 'not-allowed',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxShadow: currentQuantity > 1 ? '0 0 8px rgba(0, 170, 255, 0.2)' : 'none',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                −
                                            </button>
                                            
                                            {/* Quantity Input */}
                                            <input 
                                                type="number" 
                                                value={currentQuantity}
                                                onChange={handleQuantityChange}
                                                className="craft-quantity-input"
                                                style={{
                                                    width: '40px',
                                                    height: '24px',
                                                    padding: '0',
                                                    fontSize: '13px',
                                                    textAlign: 'center',
                                                    background: 'linear-gradient(135deg, rgba(20, 30, 60, 0.8), rgba(15, 25, 50, 0.9))',
                                                    border: '2px solid rgba(0, 170, 255, 0.4)',
                                                    borderLeft: 'none',
                                                    borderRight: 'none',
                                                    color: '#00ffff',
                                                    outline: 'none',
                                                    textShadow: '0 0 5px rgba(0, 255, 255, 0.4)',
                                                    // Hide default number input spinners
                                                    MozAppearance: 'textfield'
                                                }}
                                                min="1"
                                                max={maxCraftableForThisRecipe > 0 ? maxCraftableForThisRecipe : 1}
                                                onKeyDown={(e) => {
                                                    // Block + and - keys since we have custom buttons
                                                    if (e.key === '+' || e.key === '-') {
                                                        e.preventDefault();
                                                    }
                                                }}
                                            />
                                            
                                            {/* Increase Button */}
                                            <button 
                                                onClick={() => {
                                                    const newQuantity = Math.min(maxCraftableForThisRecipe > 0 ? maxCraftableForThisRecipe : 1, currentQuantity + 1);
                                                    setCraftQuantities(prev => new Map(prev).set(recipe.recipeId.toString(), newQuantity));
                                                }}
                                                disabled={currentQuantity >= (maxCraftableForThisRecipe > 0 ? maxCraftableForThisRecipe : 1)}
                                                style={{
                                                    width: '24px',
                                                    height: '24px',
                                                    padding: '0',
                                                    fontSize: '14px',
                                                    fontWeight: 'bold',
                                                    background: currentQuantity < (maxCraftableForThisRecipe > 0 ? maxCraftableForThisRecipe : 1) ? 'linear-gradient(135deg, rgba(0, 170, 255, 0.3), rgba(0, 150, 220, 0.4))' : 'linear-gradient(135deg, rgba(40, 40, 60, 0.5), rgba(30, 30, 50, 0.6))',
                                                    color: currentQuantity < (maxCraftableForThisRecipe > 0 ? maxCraftableForThisRecipe : 1) ? '#00aaff' : '#666',
                                                    border: currentQuantity < (maxCraftableForThisRecipe > 0 ? maxCraftableForThisRecipe : 1) ? '2px solid rgba(0, 170, 255, 0.4)' : '2px solid rgba(100, 100, 120, 0.3)',
                                                    borderRadius: '0 3px 3px 0',
                                                    cursor: currentQuantity < (maxCraftableForThisRecipe > 0 ? maxCraftableForThisRecipe : 1) ? 'pointer' : 'not-allowed',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    boxShadow: currentQuantity < (maxCraftableForThisRecipe > 0 ? maxCraftableForThisRecipe : 1) ? '0 0 8px rgba(0, 170, 255, 0.2)' : 'none',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                +
                                            </button>
                                            
                                            {/* MAX Button */}
                                            <button 
                                                onClick={handleMaxClick}
                                                disabled={maxCraftableForThisRecipe <= 0}
                                                style={{
                                                    padding: '4px 6px',
                                                    fontSize: '10px',
                                                    background: maxCraftableForThisRecipe > 0 ? 'linear-gradient(135deg, rgba(0, 170, 255, 0.3), rgba(0, 150, 220, 0.4))' : 'linear-gradient(135deg, rgba(40, 40, 60, 0.5), rgba(30, 30, 50, 0.6))',
                                                    color: maxCraftableForThisRecipe > 0 ? '#00aaff' : '#666',
                                                    border: maxCraftableForThisRecipe > 0 ? '2px solid rgba(0, 170, 255, 0.4)' : '2px solid rgba(100, 100, 120, 0.3)',
                                                    borderRadius: '3px',
                                                    cursor: maxCraftableForThisRecipe > 0 ? 'pointer' : 'not-allowed',
                                                    marginLeft: '4px',
                                                    boxShadow: maxCraftableForThisRecipe > 0 ? '0 0 8px rgba(0, 170, 255, 0.2)' : 'none',
                                                    textShadow: maxCraftableForThisRecipe > 0 ? '0 0 5px rgba(0, 170, 255, 0.4)' : 'none',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                MAX
                                            </button>
                                        </div>
                                        
                                        <button
                                            onClick={() => handleCraftItem(recipe.recipeId, currentQuantity)}
                                            disabled={!isCraftable}
                                            style={{
                                                padding: '8px 16px',
                                                fontSize: '13px',
                                                fontWeight: 'bold',
                                                background: !isMemoryGridUnlocked 
                                                    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(100, 70, 180, 0.4))' // Purple for locked
                                                    : isCraftable ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.3), rgba(0, 200, 100, 0.4))' : 'linear-gradient(135deg, rgba(40, 40, 60, 0.5), rgba(30, 30, 50, 0.6))',
                                                color: !isMemoryGridUnlocked ? '#8b5cf6' : isCraftable ? '#00ff88' : '#666',
                                                border: !isMemoryGridUnlocked 
                                                    ? '2px solid rgba(139, 92, 246, 0.5)'
                                                    : isCraftable ? '2px solid rgba(0, 255, 136, 0.5)' : '2px solid rgba(100, 100, 120, 0.3)',
                                                borderRadius: '4px',
                                                cursor: isCraftable ? 'pointer' : 'not-allowed',
                                                minWidth: '70px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                                boxShadow: !isMemoryGridUnlocked 
                                                    ? '0 0 15px rgba(139, 92, 246, 0.2), inset 0 0 10px rgba(139, 92, 246, 0.1)'
                                                    : isCraftable ? '0 0 15px rgba(0, 255, 136, 0.3), inset 0 0 10px rgba(0, 255, 136, 0.1)' : 'none',
                                                textShadow: !isMemoryGridUnlocked 
                                                    ? '0 0 8px rgba(139, 92, 246, 0.6)'
                                                    : isCraftable ? '0 0 8px rgba(0, 255, 136, 0.6)' : 'none',
                                                transition: 'all 0.3s ease'
                                            }}
                                        >
                                            {!isMemoryGridUnlocked ? 'LOCKED' : 'CRAFT'}
                                        </button>
                                    </div>
                                </div>
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
                    {playerQueue.map((item) => {
                        const outputDef = itemDefinitions.get(item.outputItemDefId.toString());
                        const remainingTime = calculateRemainingTime(Number(item.finishTime.microsSinceUnixEpoch / 1000n), currentTime);

                        return (
                            <div key={item.queueItemId.toString()} style={{
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
                                            src={getItemIcon(outputDef.iconAssetName)}
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

        </div>
    );
};

export default CraftingUI; 