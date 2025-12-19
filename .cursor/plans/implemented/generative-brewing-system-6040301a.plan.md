<!-- 6040301a-2222-4237-865e-8b7aa2459e04 65d2eac8-8aa1-4162-a921-fd7b7ccdf8db -->
# Hybrid Recipe Similarity System

## Architecture

```
[3 Ingredients] → Check exact hash match (existing)
       ↓ no exact match
Find recipes with 2/3 ingredient overlap → Generate VARIANT
       ↓ no 2/3 match  
Find recipes with 1/3 overlap → Pass as CONTEXT to Gemini
       ↓
Generate new recipe (with or without context)
```

---

## Phase 1: Server-Side Similarity Matching

### [server/src/ai_brewing.rs](server/src/ai_brewing.rs)

Add new functions for similarity lookup:

```rust
/// Find cached recipes that share 2 of 3 ingredients (for variants)
pub fn find_similar_recipes_2_of_3(
    ctx: &ReducerContext,
    ingredients: &[String],
) -> Vec<BrewRecipeCache>

/// Find cached recipes that share 1 of 3 ingredients (for context)
pub fn find_similar_recipes_1_of_3(
    ctx: &ReducerContext,
    ingredients: &[String],
) -> Vec<BrewRecipeCache>

/// Count ingredient overlap between two recipe ingredient sets
fn count_ingredient_overlap(a: &[String], b: &[String]) -> usize
```

Add new reducer for similarity-aware generation:

```rust
#[spacetimedb::reducer]
pub fn create_generated_brew_with_similarity(
    ctx: &ReducerContext,
    recipe_json: String,
    icon_base64: String,
    is_variant_of: Option<u64>, // Parent recipe_hash if this is a variant
) -> Result<u64, String>
```

Add field to `BrewRecipeCache`:

- `parent_recipe_hash: Option<u64>` - Links variants to their base recipe

---

## Phase 2: API Proxy - Context-Aware Generation

### [api-proxy/server.ts](api-proxy/server.ts)

Update `/api/gemini/brew` endpoint to accept optional context:

```typescript
// Request body additions
interface BrewRequest {
  ingredients: string[];
  ingredient_rarities: number[];
  similar_recipes?: SimilarRecipe[]; // NEW: Context from cache
  variant_of?: {                     // NEW: For 2/3 match variants
    name: string;
    category: string;
    description: string;
  };
}
```

Update Gemini prompt to include context:

```
// If variant_of is provided:
"Generate a VARIANT of the existing recipe '${variant_of.name}'. 
Keep the same category (${variant_of.category}) and similar stats.
The new ingredient '${newIngredient}' should slightly modify the result.
Add a suffix like '(Honey-Glazed)', '(Spiced)', '(Chilled)' to the name."

// If similar_recipes is provided:
"Here are existing recipes in this world for thematic reference:
${similar_recipes.map(r => `- ${r.name}: ${r.description}`).join('\n')}
Generate a recipe that feels consistent with this world's style."
```

---

## Phase 3: Client-Side Similarity Logic

### [client/src/services/brewingAIService.ts](client/src/services/brewingAIService.ts)

Add similarity checking functions:

```typescript
// Check for 2/3 ingredient overlap (for variants)
function findVariantBase(
  ingredients: string[], 
  cachedRecipes: Map<string, CachedRecipe>
): CachedRecipe | null

// Check for 1/3 ingredient overlap (for context)
function findSimilarRecipesForContext(
  ingredients: string[],
  cachedRecipes: Map<string, CachedRecipe>,
  limit: number = 3
): CachedRecipe[]

// Count overlapping ingredients between two sets
function countIngredientOverlap(a: string[], b: string[]): number
```

Update `generateBrewRecipe()` flow:

```typescript
export async function generateBrewRecipe(ingredients: string[]): Promise<BrewRecipe> {
  // 1. Check exact match (existing)
  const exactMatch = getLocalCachedRecipe(computeRecipeHash(ingredients));
  if (exactMatch) return exactMatch;

  // 2. Check for 2/3 match → variant generation
  const variantBase = findVariantBase(ingredients, localRecipeCache);
  if (variantBase) {
    return generateVariantRecipe(ingredients, variantBase);
  }

  // 3. Check for 1/3 match → context-aware generation
  const similarRecipes = findSimilarRecipesForContext(ingredients, localRecipeCache);
  return generateNewRecipeWithContext(ingredients, similarRecipes);
}
```

---

## Phase 4: Sync Server Cache to Client

### New reducer in [server/src/ai_brewing.rs](server/src/ai_brewing.rs):

```rust
#[spacetimedb::reducer]
pub fn get_all_cached_recipes(ctx: &ReducerContext) -> Vec<BrewRecipeCacheSummary>
```

### Client subscription update in [client/src/hooks/useSpacetimeTables.ts](client/src/hooks/useSpacetimeTables.ts):

Subscribe to `brew_recipe_cache` table so client has access to all cached recipes for similarity matching.

---

## Key Files

| File | Changes |

|------|---------|

| `server/src/ai_brewing.rs` | Add similarity functions, parent_recipe_hash field, new reducer |

| `api-proxy/server.ts` | Accept similar_recipes/variant_of context in `/api/gemini/brew` |

| `client/src/services/brewingAIService.ts` | Add similarity checking, variant generation logic |

| `client/src/hooks/useSpacetimeTables.ts` | Subscribe to brew_recipe_cache table |

---

## Example Flow

**Scenario: Player has cached `[Mushroom, Berry, Water]` → "Wild Berry Broth"**

1. Player tries `[Mushroom, Berry, Honey]`:

   - No exact match
   - 2/3 overlap with "Wild Berry Broth" found
   - Generate variant: "Wild Berry Broth (Honeyed)" with +5 hunger bonus
   - Cache with `parent_recipe_hash` pointing to original

2. Player tries `[Fish, Salt, Berry]`:

   - No exact match
   - 1/3 overlap with "Wild Berry Broth" (berry)
   - Pass as context to Gemini
   - Generate "Salted Fish with Wild Berries" - new but thematically aware

3. Player tries `[Iron Ore, Sulfur, Coal]`:

   - No match at all
   - Generate completely new (no context)
   - "Volatile Mixture" - industrial/technological category

### To-dos

- [ ] Add similarity matching functions to ai_brewing.rs (2/3 and 1/3 overlap)
- [ ] Add parent_recipe_hash field to BrewRecipeCache table
- [ ] Update /api/gemini/brew to accept similar_recipes and variant_of context
- [ ] Update Gemini prompts for variant generation and context-aware generation
- [ ] Add findVariantBase() and findSimilarRecipesForContext() to brewingAIService
- [ ] Update generateBrewRecipe() with similarity-first logic
- [ ] Subscribe client to brew_recipe_cache table for similarity lookups