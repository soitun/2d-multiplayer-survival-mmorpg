/**
 * Brewing AI Service
 * 
 * Handles AI-generated brew recipe creation via Gemini API through the secure proxy.
 * Manages recipe generation, icon generation, and local caching to reduce API calls.
 */

// Secure proxy URL - API keys never exposed to client
const PROXY_URL = import.meta.env.VITE_API_PROXY_URL || 'http://localhost:8002';
const GEMINI_BREW_URL = `${PROXY_URL}/api/gemini/brew`;
const GEMINI_ICON_URL = `${PROXY_URL}/api/gemini/icon`;

// ============================================================================
// TYPES
// ============================================================================

export interface BrewRecipe {
  name: string;
  description: string;
  health: number;
  hunger: number;
  thirst: number;
  brew_time_secs: number;
  category: BrewCategory;
  effect_type: EffectType | null;
  icon_subject: string;
  ingredients?: string[]; // Optional: included when recipe needs to be sent to server
}

export type BrewCategory =
  | 'healing_broth'
  | 'medicinal_tea'
  | 'alcoholic'
  | 'poison'
  | 'performance_enhancer'
  | 'utility_brew'
  | 'psychoactive'
  | 'nutritional_drink'
  | 'maritime_specialty'
  | 'cooking_base'
  | 'technological';

export type EffectType =
  | 'HealthRegen'
  | 'FoodPoisoning'
  | 'Intoxicated'
  | 'Poisoned'          // Brew-based poison (distinct from Venom/FoodPoisoning)
  | 'StaminaBoost'
  | 'SpeedBoost'
  | 'ColdResistance'
  | 'NightVision'
  | 'WarmthBoost'
  | 'PoisonResistance';

export interface BrewIconResponse {
  icon_base64: string | null;
  mime_type?: string;
  placeholder?: boolean;
  description?: string;
  error?: string;
}

export interface BrewGenerationResult {
  recipe: BrewRecipe;
  icon_base64: string | null;
  recipe_hash: bigint;
  cached: boolean;
}

// ============================================================================
// LOCAL CACHE
// ============================================================================

// Client-side cache to reduce redundant API calls
// Maps recipe_hash -> cached recipe data
const localRecipeCache = new Map<string, BrewRecipe>();
const localIconCache = new Map<string, string | null>();

/**
 * Computes a consistent hash for a set of ingredient names.
 * Ingredients are sorted alphabetically before hashing to ensure
 * the same ingredients in any order produce the same hash.
 * 
 * NOTE: This must match the server-side compute_recipe_hash() function in ai_brewing.rs
 */
export function computeRecipeHash(ingredients: string[]): bigint {
  // Sort ingredients alphabetically
  const sortedIngredients = [...ingredients].sort();
  
  // Simple string hash using djb2 algorithm
  // This matches the Rust DefaultHasher behavior for consistency
  let hash = BigInt(5381);
  
  for (const ingredient of sortedIngredients) {
    for (let i = 0; i < ingredient.length; i++) {
      const char = BigInt(ingredient.charCodeAt(i));
      // hash * 33 + char (djb2 algorithm)
      hash = ((hash << BigInt(5)) + hash) + char;
      // Keep within u64 range
      hash = hash & BigInt('0xFFFFFFFFFFFFFFFF');
    }
  }
  
  return hash;
}

/**
 * Gets a recipe from the local cache if available.
 */
export function getLocalCachedRecipe(recipeHash: bigint): BrewRecipe | undefined {
  return localRecipeCache.get(recipeHash.toString());
}

/**
 * Stores a recipe in the local cache.
 */
export function cacheRecipeLocally(recipeHash: bigint, recipe: BrewRecipe): void {
  localRecipeCache.set(recipeHash.toString(), recipe);
}

/**
 * Gets an icon from the local cache if available.
 */
export function getLocalCachedIcon(recipeHash: bigint): string | null | undefined {
  return localIconCache.get(recipeHash.toString());
}

/**
 * Stores an icon in the local cache.
 */
export function cacheIconLocally(recipeHash: bigint, iconBase64: string | null): void {
  localIconCache.set(recipeHash.toString(), iconBase64);
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Generates a brew recipe via the Gemini API.
 * 
 * @param ingredients - Array of exactly 3 ingredient names
 * @param ingredientRarities - Array of rarity values (0.0-1.0) for each ingredient
 * @returns Generated recipe data
 */
export async function generateBrewRecipe(
  ingredients: string[],
  ingredientRarities: number[] = [0.3, 0.3, 0.3]
): Promise<BrewRecipe> {
  if (ingredients.length !== 3) {
    throw new Error('Exactly 3 ingredients required for brewing');
  }

  console.log('[BrewingAI] ===== generateBrewRecipe START =====');
  console.log('[BrewingAI] Ingredients:', ingredients);
  console.log('[BrewingAI] API URL:', GEMINI_BREW_URL);

  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error('[BrewingAI] !!! FETCH TIMEOUT after 60s !!!');
    controller.abort();
  }, 60000); // 60 second timeout

  try {
    console.log('[BrewingAI] Sending fetch request...');
    const response = await fetch(GEMINI_BREW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ingredients,
        ingredient_rarities: ingredientRarities,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    console.log('[BrewingAI] Fetch response received, status:', response.status);

    if (!response.ok) {
      console.error('[BrewingAI] Response NOT OK:', response.status, response.statusText);
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API request failed: ${response.status}`);
    }

    console.log('[BrewingAI] Parsing response JSON...');
    const recipe: BrewRecipe = await response.json();
    console.log('[BrewingAI] ===== Recipe parsed successfully =====');
    console.log('[BrewingAI] Recipe name:', recipe.name);
    console.log('[BrewingAI] Recipe category:', recipe.category);
    
    return recipe;
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('[BrewingAI] ===== Recipe generation FAILED =====');
    if (error.name === 'AbortError') {
      console.error('[BrewingAI] Request was aborted (timeout)');
    } else {
      console.error('[BrewingAI] Error:', error);
    }
    throw error;
  }
}

/**
 * Generates a pixel art icon for a brew via the Gemini Imagen API.
 * 
 * @param subject - Description of the brew for icon generation
 * @returns Base64-encoded PNG icon or null if generation failed
 */
export async function generateBrewIcon(subject: string): Promise<string | null> {
  console.log('[BrewingAI] Generating icon for:', subject);

  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('[BrewingAI] Icon generation timed out after 30s');
    controller.abort();
  }, 30000); // 30 second timeout

  try {
    console.log('[BrewingAI] Sending icon request to:', GEMINI_ICON_URL);
    const response = await fetch(GEMINI_ICON_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subject }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    console.log('[BrewingAI] Icon response received, status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[BrewingAI] Icon generation API error:', errorData);
      return null;
    }

    console.log('[BrewingAI] Parsing icon response JSON...');
    const data: BrewIconResponse = await response.json();
    console.log('[BrewingAI] Icon response parsed:', { placeholder: data.placeholder, hasIcon: !!data.icon_base64 });
    
    if (data.placeholder) {
      console.log('[BrewingAI] Icon generation returned placeholder (feature not available)');
      return null;
    }

    if (data.icon_base64) {
      console.log('[BrewingAI] Generated icon successfully');
      return data.icon_base64;
    }

    return null;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error('[BrewingAI] Icon generation aborted (timeout)');
    } else {
      console.error('[BrewingAI] Icon generation failed:', error);
    }
    return null;
  }
}

/**
 * Full brew generation flow:
 * 1. Check local cache
 * 2. If not cached, generate recipe via AI
 * 3. Generate icon (optional)
 * 4. Cache locally
 * 
 * @param ingredients - Array of exactly 3 ingredient names
 * @param ingredientRarities - Array of rarity values (0.0-1.0) for each ingredient
 * @param generateIcon - Whether to generate an icon (default: true)
 * @returns Full generation result with recipe, icon, and hash
 */
export async function generateFullBrewRecipe(
  ingredients: string[],
  ingredientRarities: number[] = [0.3, 0.3, 0.3],
  generateIcon: boolean = true
): Promise<BrewGenerationResult> {
  console.log('[BrewingAI] generateFullBrewRecipe starting for:', ingredients);
  const recipeHash = computeRecipeHash(ingredients);
  
  // Check local cache first
  const cachedRecipe = getLocalCachedRecipe(recipeHash);
  if (cachedRecipe) {
    console.log('[BrewingAI] Using locally cached recipe for hash:', recipeHash.toString());
    console.log('[BrewingAI] NOTE: Recipe is locally cached but will still be sent to server for caching');
    return {
      recipe: { ...cachedRecipe, ingredients }, // Include ingredients for server
      icon_base64: getLocalCachedIcon(recipeHash) ?? null,
      recipe_hash: recipeHash,
      cached: true,
    };
  }

  // Generate new recipe via AI
  console.log('[BrewingAI] Calling generateBrewRecipe...');
  const recipe = await generateBrewRecipe(ingredients, ingredientRarities);
  console.log('[BrewingAI] Recipe received:', recipe.name);
  
  // Add ingredients to recipe data for server verification
  const recipeWithIngredients = {
    ...recipe,
    ingredients,
  };

  // Generate icon if requested (but don't let it block recipe caching)
  let iconBase64: string | null = null;
  if (generateIcon) {
    console.log('[BrewingAI] Starting icon generation (non-blocking)...');
    try {
      iconBase64 = await generateBrewIcon(recipe.icon_subject);
      console.log('[BrewingAI] Icon generation completed:', iconBase64 ? 'with icon' : 'no icon');
    } catch (iconError) {
      console.error('[BrewingAI] Icon generation error (continuing without icon):', iconError);
      iconBase64 = null;
    }
  }

  // Cache locally
  console.log('[BrewingAI] Caching recipe locally...');
  cacheRecipeLocally(recipeHash, recipe);
  cacheIconLocally(recipeHash, iconBase64);

  console.log('[BrewingAI] generateFullBrewRecipe completed successfully');
  return {
    recipe: recipeWithIngredients as BrewRecipe,
    icon_base64: iconBase64,
    recipe_hash: recipeHash,
    cached: false,
  };
}

/**
 * Converts a BrewRecipe to JSON string format expected by the server reducer.
 */
export function recipeToServerJson(recipe: BrewRecipe, ingredients: string[]): string {
  return JSON.stringify({
    name: recipe.name,
    description: recipe.description,
    health: recipe.health,
    hunger: recipe.hunger,
    thirst: recipe.thirst,
    brew_time_secs: recipe.brew_time_secs,
    category: recipe.category,
    effect_type: recipe.effect_type,
    icon_subject: recipe.icon_subject,
    ingredients,
  });
}

/**
 * Gets ingredient rarity values from item definitions.
 * Returns default rarity (0.3) if not found.
 * 
 * NOTE: This is a placeholder - actual implementation should read from
 * the item definition's rarity field or calculate based on spawn rates.
 */
export function getIngredientRarities(ingredientNames: string[]): number[] {
  // TODO: Implement actual rarity lookup from item definitions
  // For now, return default common rarity
  return ingredientNames.map(() => 0.3);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Clears the local recipe and icon caches.
 * Useful for testing or forcing fresh generation.
 */
export function clearLocalCache(): void {
  localRecipeCache.clear();
  localIconCache.clear();
  console.log('[BrewingAI] Local cache cleared');
}

/**
 * Gets statistics about the local cache.
 */
export function getCacheStats(): { recipes: number; icons: number } {
  return {
    recipes: localRecipeCache.size,
    icons: localIconCache.size,
  };
}

/**
 * Checks if the Gemini API proxy is available.
 */
export async function checkGeminiAvailability(): Promise<boolean> {
  try {
    const response = await fetch(`${PROXY_URL}/health`);
    if (!response.ok) return false;
    
    const health = await response.json();
    return health.geminiConfigured === true;
  } catch {
    return false;
  }
}

