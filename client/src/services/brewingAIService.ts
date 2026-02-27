/**
 * Brewing AI Service (procedure-backed)
 *
 * Handles AI-generated brew recipe creation via SpacetimeDB procedures.
 * No direct client-side AI HTTP calls are performed here.
 */

import type { DbConnection } from '../generated';
import { type AIProvider } from './openaiService';

function normalizeProvider(rawProvider: string | undefined): AIProvider {
  const normalized = rawProvider?.toLowerCase();
  if (normalized === 'openai' || normalized === 'gemini' || normalized === 'grok') {
    return normalized;
  }
  return 'grok';
}
const AI_PROVIDER: AIProvider = normalizeProvider(import.meta.env.VITE_AI_PROVIDER);

let brewingConnection: DbConnection | null = null;

export function setBrewingConnection(connection: DbConnection | null): void {
  brewingConnection = connection;
}

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
  ingredients?: string[];
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
  | 'Poisoned'
  | 'StaminaBoost'
  | 'SpeedBoost'
  | 'ColdResistance'
  | 'NightVision'
  | 'WarmthBoost'
  | 'PoisonResistance'
  | 'PoisonCoating'
  | 'FireResistance'
  | 'PassiveHealthRegen'
  | 'HarvestBoost';

export interface BrewIconResponse {
  icon_base64: string | null;
  icon_asset?: string;
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

const localRecipeCache = new Map<string, BrewRecipe>();
const localIconCache = new Map<string, string | null>();

export function computeRecipeHash(ingredients: string[]): bigint {
  const sortedIngredients = [...ingredients].sort();
  let hash = BigInt(5381);

  for (const ingredient of sortedIngredients) {
    for (let i = 0; i < ingredient.length; i++) {
      const char = BigInt(ingredient.charCodeAt(i));
      hash = ((hash << BigInt(5)) + hash) + char;
      hash = hash & BigInt('0xFFFFFFFFFFFFFFFF');
    }
  }

  return hash;
}

export function getLocalCachedRecipe(recipeHash: bigint): BrewRecipe | undefined {
  return localRecipeCache.get(recipeHash.toString());
}

export function cacheRecipeLocally(recipeHash: bigint, recipe: BrewRecipe): void {
  localRecipeCache.set(recipeHash.toString(), recipe);
}

export function getLocalCachedIcon(recipeHash: bigint): string | null | undefined {
  return localIconCache.get(recipeHash.toString());
}

export function cacheIconLocally(recipeHash: bigint, iconBase64: string | null): void {
  localIconCache.set(recipeHash.toString(), iconBase64);
}

function getProcedureAccessor(connection: DbConnection | null, ...names: string[]): any {
  const procedures = (connection as any)?.procedures;
  for (const name of names) {
    const accessor = procedures?.[name];
    if (accessor) return accessor;
  }
  return null;
}

function unwrapProcedureResult(procResult: unknown): string {
  if (typeof procResult === 'string') return procResult;
  if (procResult && typeof procResult === 'object') {
    const resultObj = procResult as any;
    if (resultObj.tag === 'ok' || resultObj.tag === 'Ok') return String(resultObj.value ?? '');
    if (resultObj.tag === 'err' || resultObj.tag === 'Err') throw new Error(String(resultObj.value ?? 'Procedure failed'));
    if (typeof resultObj.ok === 'string') return resultObj.ok;
    if (resultObj.err) throw new Error(String(resultObj.err));
  }
  throw new Error('Unexpected procedure result format');
}

// ============================================================================
// PROCEDURE-BACKED API FUNCTIONS
// ============================================================================

export async function generateBrewRecipe(
  ingredients: string[],
  ingredientRarities: number[] = [0.3, 0.3, 0.3],
  connection: DbConnection | null = brewingConnection
): Promise<BrewRecipe> {
  if (ingredients.length !== 3) {
    throw new Error('Exactly 3 ingredients required for brewing');
  }
  if (!connection) {
    throw new Error('No SpacetimeDB connection available for brewing procedures');
  }

  const accessor = getProcedureAccessor(connection, 'generateBrewRecipe', 'generate_brew_recipe');
  if (!accessor) {
    throw new Error('generate_brew_recipe procedure is unavailable on this connection.');
  }

  const procResult = await accessor({
    ingredientsJson: JSON.stringify(ingredients),
    ingredientRaritiesJson: JSON.stringify(ingredientRarities),
    provider: AI_PROVIDER,
  });
  const recipeJson = unwrapProcedureResult(procResult);
  return JSON.parse(recipeJson) as BrewRecipe;
}

export async function generateBrewIcon(
  subject: string,
  connection: DbConnection | null = brewingConnection
): Promise<string | null> {
  if (!connection) {
    return 'broth_pot_icon.png';
  }

  const accessor = getProcedureAccessor(connection, 'generateBrewIcon', 'generate_brew_icon');
  if (!accessor) {
    return 'broth_pot_icon.png';
  }

  const procResult = await accessor({ subject });
  const json = unwrapProcedureResult(procResult);
  const data = JSON.parse(json) as BrewIconResponse;

  if (data.icon_asset) return data.icon_asset;
  if (data.icon_base64) return data.icon_base64;
  return null;
}

export async function generateFullBrewRecipe(
  ingredients: string[],
  ingredientRarities: number[] = [0.3, 0.3, 0.3],
  generateIcon: boolean = true,
  connection: DbConnection | null = brewingConnection
): Promise<BrewGenerationResult> {
  const recipeHash = computeRecipeHash(ingredients);

  const cachedRecipe = getLocalCachedRecipe(recipeHash);
  if (cachedRecipe) {
    return {
      recipe: { ...cachedRecipe, ingredients },
      icon_base64: getLocalCachedIcon(recipeHash) ?? null,
      recipe_hash: recipeHash,
      cached: true,
    };
  }

  const recipe = await generateBrewRecipe(ingredients, ingredientRarities, connection);
  const recipeWithIngredients = { ...recipe, ingredients };

  let iconBase64: string | null = null;
  if (generateIcon) {
    try {
      iconBase64 = await generateBrewIcon(recipe.icon_subject, connection);
    } catch {
      iconBase64 = null;
    }
  }

  cacheRecipeLocally(recipeHash, recipe);
  cacheIconLocally(recipeHash, iconBase64);

  return {
    recipe: recipeWithIngredients as BrewRecipe,
    icon_base64: iconBase64,
    recipe_hash: recipeHash,
    cached: false,
  };
}

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

export function getIngredientRarities(ingredientNames: string[]): number[] {
  return ingredientNames.map(() => 0.3);
}

export function clearLocalCache(): void {
  localRecipeCache.clear();
  localIconCache.clear();
}

export function getCacheStats(): { recipes: number; icons: number } {
  return {
    recipes: localRecipeCache.size,
    icons: localIconCache.size,
  };
}

export async function checkGeminiAvailability(connection: DbConnection | null = brewingConnection): Promise<boolean> {
  return !!getProcedureAccessor(connection, 'generateBrewRecipe', 'generate_brew_recipe');
}

