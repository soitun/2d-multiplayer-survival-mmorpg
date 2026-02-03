import React, { useRef, useState } from 'react';
import styles from './InventoryUI.module.css'; // Reuse existing styles if applicable, or create new ones
import { ItemCategory } from '../generated';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';

// Category mappings with pretty names
const CATEGORY_LABELS: Record<string, string> = {
  'All': 'All Items',
  'Tool': 'Tools',
  'Material': 'Materials',
  'Placeable': 'Building',
  'Armor': 'Armor',
  'Consumable': 'Consumables',
  'Ammunition': 'Ammo',
  'Weapon': 'Melee Weapons',
  'RangedWeapon': 'Ranged Weapons',
};

// === SURVIVAL ESSENTIALS: Critical items players need first ===
const SURVIVAL_ESSENTIAL_TOOLS: Set<string> = new Set([
  'Stone Pickaxe', 'Stone Axe', 'Stone Hoe', 'Wooden Pickaxe', 'Wooden Axe',
  'Flint Knife', 'Torch', 'Campfire', 'Reed Water Bottle'
]);

const CRITICAL_FIRST_ITEMS: Set<string> = new Set([
  'Bandage', 'Torch', 'Campfire', 'Stone Pickaxe', 'Stone Axe', 'Flint Knife',
  'Reed Water Bottle', 'Wooden Storage Box'
]);

// === TOOL UPGRADE TIERS: Maps basic tools to their upgrades ===
const TOOL_UPGRADE_PATHS: Record<string, string[]> = {
  'Wooden Pickaxe': ['Stone Pickaxe', 'Iron Pickaxe', 'Steel Pickaxe'],
  'Stone Pickaxe': ['Iron Pickaxe', 'Steel Pickaxe'],
  'Iron Pickaxe': ['Steel Pickaxe'],
  'Wooden Axe': ['Stone Axe', 'Iron Axe', 'Steel Axe'],
  'Stone Axe': ['Iron Axe', 'Steel Axe'],
  'Iron Axe': ['Steel Axe'],
  'Flint Knife': ['Iron Knife', 'Steel Knife'],
  'Iron Knife': ['Steel Knife'],
};

// === RESOURCE CATEGORIES for smart grouping ===
const RESOURCE_TIERS: Record<string, number> = {
  // Basic resources (tier 1)
  'Grass Fiber': 1, 'Stick': 1, 'Stone': 1, 'Flint': 1, 'Clay': 1,
  // Processed basics (tier 2)
  'Reed': 2, 'Wood': 2, 'Leather': 2, 'Bone': 2, 'Feather': 2,
  // Advanced resources (tier 3)
  'Iron Ore': 3, 'Iron Ingot': 3, 'Charcoal': 3,
  // High-tier resources (tier 4)
  'Steel Ingot': 4, 'Gold': 4,
};

interface Recipe {
  id: string;
  name: string;
  category: ItemCategory;
  materials: { itemId: string; quantity: number }[];
  output: { itemId: string; quantity: number };
}

interface PlayerInventory {
  [itemId: string]: number; // itemId -> quantity
}

// === OPTIMIZED QUICK CRAFT PREDICTION ALGORITHM ===
export const calculateRecipePredictionScore = (
  recipe: Recipe,
  playerInventory: PlayerInventory,
  playerHotbar: PlayerInventory = {}
): number => {
  const outputName = recipe.output.itemId;
  const categoryTag = recipe.category.tag;
  
  // === STEP 1: CRAFTABILITY CHECK (Most Important) ===
  // Can we craft this RIGHT NOW? This is the #1 priority.
  let canCraftNow = true;
  let craftabilityRatio = 1.0;
  let maxCraftableCount = Infinity;
  
  for (const material of recipe.materials) {
    const available = playerInventory[material.itemId] || 0;
    const needed = material.quantity;
    
    if (available < needed) {
      canCraftNow = false;
      craftabilityRatio *= (available / needed);
    }
    
    if (needed > 0) {
      maxCraftableCount = Math.min(maxCraftableCount, Math.floor(available / needed));
    }
  }
  
  // If we can't craft it at all, it gets a much lower base score
  const craftableBonus = canCraftNow ? 100 : 0;
  
  // === STEP 2: SCARCITY CHECK ===
  // Do we already have this item? Less relevant if we have many.
  const inventoryCount = playerInventory[outputName] || 0;
  const hotbarCount = playerHotbar[outputName] || 0;
  const totalOwned = inventoryCount + hotbarCount;
  
  // Exponential decay - items we have lots of get deprioritized
  // 0 owned = 1.0, 1 owned = 0.6, 2 owned = 0.36, 5 owned = 0.08
  const scarcityMultiplier = Math.pow(0.6, totalOwned);
  
  // === STEP 3: SURVIVAL ESSENTIALS ===
  // Critical items get massive boost if we don't have them
  let survivalBonus = 0;
  
  if (CRITICAL_FIRST_ITEMS.has(outputName) && totalOwned === 0 && canCraftNow) {
    survivalBonus = 200; // Massive boost for first critical item
  } else if (SURVIVAL_ESSENTIAL_TOOLS.has(outputName) && totalOwned === 0 && canCraftNow) {
    survivalBonus = 150;
  }
  
  // === STEP 4: CATEGORY PRIORITY ===
  // Tools and weapons are more important than materials
  const categoryPriority: Record<string, number> = {
    'Tool': 25,
    'Weapon': 22,
    'RangedWeapon': 20,
    'Armor': 18,
    'Consumable': 15,
    'Ammunition': 12,
    'Placeable': 10,
    'Material': 5,
  };
  const categoryBonus = categoryPriority[categoryTag] || 8;
  
  // === STEP 5: UPGRADE PATH DETECTION ===
  // If we have a lower-tier tool, boost the next upgrade
  let upgradeBonus = 0;
  
  for (const [basicTool, upgrades] of Object.entries(TOOL_UPGRADE_PATHS)) {
    const haveBasicTool = (playerInventory[basicTool] || 0) > 0;
    
    if (haveBasicTool && upgrades.includes(outputName) && canCraftNow && totalOwned === 0) {
      // This is a direct upgrade from a tool we have!
      const upgradeIndex = upgrades.indexOf(outputName);
      upgradeBonus = 80 - (upgradeIndex * 15); // First upgrade = 80, second = 65, etc.
      break;
    }
  }
  
  // === STEP 6: RESOURCE UTILIZATION ===
  // Boost recipes that use resources we have a LOT of
  let resourceUtilizationBonus = 0;
  
  if (canCraftNow) {
    for (const material of recipe.materials) {
      const available = playerInventory[material.itemId] || 0;
      const needed = material.quantity;
      
      // If we have 10x+ what we need, bonus for using up resources
      if (available >= needed * 10) {
        resourceUtilizationBonus += 5;
      } else if (available >= needed * 5) {
        resourceUtilizationBonus += 2;
      }
    }
  }
  
  // === STEP 7: MATERIAL TIER CONSIDERATION ===
  // Higher tier materials = more valuable craft
  let tierBonus = 0;
  
  for (const material of recipe.materials) {
    const tier = RESOURCE_TIERS[material.itemId] || 1;
    if (canCraftNow) {
      tierBonus += tier * 3;
    }
  }
  
  // === STEP 8: QUANTITY OUTPUT BONUS ===
  // Recipes that produce more items get slight bonus
  const outputQuantityBonus = Math.min(recipe.output.quantity * 2, 10);
  
  // === STEP 9: PARTIAL CRAFTABILITY ===
  // If we're close to being able to craft, slight boost
  let almostCraftableBonus = 0;
  if (!canCraftNow && craftabilityRatio >= 0.75) {
    almostCraftableBonus = 15; // We're 75%+ there
  } else if (!canCraftNow && craftabilityRatio >= 0.5) {
    almostCraftableBonus = 8; // We're 50%+ there
  }
  
  // === STEP 10: STACK COMPLETION ===
  // If crafting this would complete a stack or reach a nice number
  let stackBonus = 0;
  const afterCraftCount = totalOwned + recipe.output.quantity;
  if (canCraftNow && (afterCraftCount === 10 || afterCraftCount === 20 || afterCraftCount === 50)) {
    stackBonus = 5;
  }
  
  // === FINAL SCORE CALCULATION ===
  const finalScore = (
    craftableBonus +           // +100 if craftable now
    survivalBonus +            // +150-200 for critical first items
    upgradeBonus +             // +65-80 for tool upgrades
    (categoryBonus * scarcityMultiplier) + // Category priority adjusted by how many we have
    resourceUtilizationBonus + // +2-5 per abundant material used
    tierBonus +                // Higher tier materials = better
    outputQuantityBonus +      // Recipes that produce more
    almostCraftableBonus +     // Almost craftable items
    stackBonus                 // Nice round numbers
  );
  
  return finalScore;
};

// Sort recipes by prediction score
export const sortRecipesByPrediction = (
  recipes: Recipe[],
  playerInventory: PlayerInventory,
  playerHotbar?: PlayerInventory
): Recipe[] => {
  return recipes
    .map(recipe => ({
      recipe,
      score: calculateRecipePredictionScore(recipe, playerInventory, playerHotbar)
    }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.recipe);
};

// Helper to check if a recipe can be crafted
const canCraftRecipe = (recipe: Recipe, playerInventory: PlayerInventory): boolean => {
  for (const material of recipe.materials) {
    const available = playerInventory[material.itemId] || 0;
    if (available < material.quantity) {
      return false;
    }
  }
  return recipe.materials.length > 0;
};

// Filter recipes with smart prediction scoring
// IMPORTANT: Craftable items ALWAYS appear first, regardless of search term
export const filterAndSortRecipes = (
  recipes: Recipe[],
  searchTerm: string,
  selectedCategory: string,
  playerInventory: PlayerInventory,
  playerHotbar?: PlayerInventory
): Recipe[] => {
  let filtered = recipes;
  
  // Category filter
  if (selectedCategory !== 'All') {
    filtered = filtered.filter(recipe => recipe.category.tag === selectedCategory);
  }
  
  // Search term filter
  const term = searchTerm.trim().toLowerCase();
  if (term) {
    filtered = filtered.filter(recipe => 
      recipe.name.toLowerCase().includes(term) ||
      recipe.materials.some(mat => mat.itemId.toLowerCase().includes(term))
    );
  }
  
  // Sort: CRAFTABLE ITEMS FIRST, then search relevance, then prediction score
  return filtered
    .map(recipe => ({
      recipe,
      canCraft: canCraftRecipe(recipe, playerInventory),
      isExactMatch: term ? recipe.name.toLowerCase() === term : false,
      isStartsWith: term ? recipe.name.toLowerCase().startsWith(term) : false,
      score: calculateRecipePredictionScore(recipe, playerInventory, playerHotbar)
    }))
    .sort((a, b) => {
      // FIRST PRIORITY: Craftable items always come first
      if (a.canCraft && !b.canCraft) return -1;
      if (!a.canCraft && b.canCraft) return 1;
      
      // SECOND PRIORITY: Within same craftability tier, search relevance
      if (term) {
        // Exact matches
        if (a.isExactMatch && !b.isExactMatch) return -1;
        if (!a.isExactMatch && b.isExactMatch) return 1;
        // Then startsWith matches
        if (a.isStartsWith && !b.isStartsWith) return -1;
        if (!a.isStartsWith && b.isStartsWith) return 1;
      }
      
      // THIRD PRIORITY: Prediction score (higher is better)
      return b.score - a.score;
    })
    .map(item => item.recipe);
};

interface CraftingSearchBarProps {
  searchTerm: string;
  onSearchChange: (newSearchTerm: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  // New props for category filtering
  selectedCategory?: string;
  onCategoryChange?: (category: string) => void;
  showCategoryFilter?: boolean; // Whether to show the category dropdown (default: true)
  // New props for prediction
  recipes?: Recipe[];
  playerInventory?: PlayerInventory;
  playerHotbar?: PlayerInventory;
  onFilteredRecipesChange?: (filteredRecipes: Recipe[]) => void;
}

const CraftingSearchBar: React.FC<CraftingSearchBarProps> = (props) => {
  const {
    searchTerm,
    onSearchChange,
    placeholder = "Search recipes by name, ingredients...",
    onFocus,
    onBlur,
    selectedCategory = 'All',
    onCategoryChange,
    showCategoryFilter = true,
    recipes = [],
    playerInventory = {},
    playerHotbar = {},
    onFilteredRecipesChange,
  } = props;

  const inputRef = useRef<HTMLInputElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Apply filtering and sorting whenever inputs change
  React.useEffect(() => {
    if (recipes.length > 0 && Object.keys(playerInventory).length > 0) {
      const filteredAndSorted = filterAndSortRecipes(
        recipes, 
        searchTerm, 
        selectedCategory, 
        playerInventory, 
        playerHotbar
      );
      onFilteredRecipesChange?.(filteredAndSorted);
    }
  }, [recipes, searchTerm, selectedCategory, playerInventory, playerHotbar]); // Removed onFilteredRecipesChange from deps

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent ALL game control keys from bubbling up to the game
    // Including 'y' which opens achievements panel, 'b' which opens building menu
    const gameControlKeys = ['f', 'g', ' ', 'e', 'w', 'a', 's', 'd', 'z', 'c', 'm', 'y', 'b'];
    const key = event.key.toLowerCase();
    
    if (gameControlKeys.includes(key)) {
      // Prevent game actions but allow typing in the input
      event.stopPropagation();
    }
    
    // Handle Escape key to blur the input and ensure game controls are restored
    if (event.key === 'Escape') {
      event.preventDefault();
      inputRef.current?.blur();
      setIsDropdownOpen(false);
    }
  };

  const handleFilterClick = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleCategorySelect = (category: string) => {
    onCategoryChange?.(category);
    setIsDropdownOpen(false);
  };

  // Close dropdown when clicking outside
  const handleDropdownBlur = (event: React.FocusEvent) => {
    // Check if the new focus target is inside the dropdown
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDropdownOpen(false);
    }
  };

  return (
    <div className={styles.craftingSearchBarContainer}>
      <input
        ref={inputRef}
        type="text"
        className={styles.craftingSearchInput} 
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => {
          console.log('[CraftingSearchBar] Input focused - should block game controls');
          onFocus?.();
        }}
        onBlur={() => {
          console.log('[CraftingSearchBar] Input blurred - should unblock game controls');
          onBlur?.();
        }}
        onKeyDown={handleKeyDown}
        data-is-chat-input="true"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
      />
      {showCategoryFilter && (
        <div className={styles.filterButtonContainer}>
          <button
            className={styles.filterButton}
            onClick={handleFilterClick}
            title="Filter by category"
          >
            <FontAwesomeIcon icon={faChevronDown} />
          </button>
          {isDropdownOpen && (
            <div 
              className={styles.filterDropdown}
              onBlur={handleDropdownBlur}
              tabIndex={-1}
              style={{
                background: 'linear-gradient(135deg, rgba(30, 15, 50, 0.98), rgba(20, 10, 40, 0.99))',
                border: '2px solid #00aaff',
                borderRadius: '8px',
                boxShadow: '0 0 30px rgba(0, 170, 255, 0.4), inset 0 0 20px rgba(0, 170, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                zIndex: 1000,
                minWidth: '160px',
                maxHeight: '300px',
                overflowY: 'auto'
              }}
            >
              {Object.entries(CATEGORY_LABELS).map(([categoryKey, label]) => (
                <div
                  key={categoryKey}
                  className={`${styles.filterOption} ${selectedCategory === categoryKey ? styles.filterOptionSelected : ''}`}
                  onClick={() => handleCategorySelect(categoryKey)}
                  style={{
                    padding: '12px 16px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: selectedCategory === categoryKey ? '#00ff88' : '#00ffff',
                    background: selectedCategory === categoryKey ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.2), rgba(0, 200, 100, 0.3))' : 'transparent',
                    cursor: 'pointer',
                    borderBottom: '2px solid rgba(0, 170, 255, 0.2)',
                    transition: 'all 0.2s ease',
                    userSelect: 'none',
                    lineHeight: '1.4',
                    textShadow: selectedCategory === categoryKey ? '0 0 8px rgba(0, 255, 136, 0.6)' : '0 0 5px rgba(0, 255, 255, 0.4)',
                    boxShadow: selectedCategory === categoryKey ? 'inset 0 0 10px rgba(0, 255, 136, 0.1)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedCategory !== categoryKey) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0, 170, 255, 0.2), rgba(0, 150, 220, 0.3))';
                      e.currentTarget.style.color = '#00aaff';
                      e.currentTarget.style.boxShadow = 'inset 0 0 10px rgba(0, 170, 255, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedCategory !== categoryKey) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#00ffff';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CraftingSearchBar; 