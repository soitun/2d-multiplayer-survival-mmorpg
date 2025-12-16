# AI-Driven Brewing System Implementation Plan

## System Architecture Overview

### Core Components:
1. **Recipe Cache Table** - Stores generated recipes for consistency
2. **RAG Vector Database** - Recipe embeddings for similarity search
3. **Ingredient Rarity Calculator** - Determines ingredient rarity from game data
4. **AI Recipe Generator** - GPT-4 with RAG context
5. **AI Icon Generator** - DALL-E 3 / Stable Diffusion
6. **Dynamic Item Creator** - Creates ItemDefinition entries on-the-fly

---

## 1. Database Schema

### Recipe Cache Table
```rust
#[spacetimedb::table(name = brew_recipe_cache, public)]
#[derive(Clone, Debug)]
pub struct BrewRecipeCache {
    #[primary_key]
    pub recipe_hash: u64, // Hash of sorted ingredient names
    
    // Ingredients (sorted for consistency)
    pub ingredient_names: Vec<String>, // ["Stone", "Stone", "Stone"]
    pub ingredient_def_ids: Vec<u64>,  // [123, 123, 123]
    
    // Generated Recipe Data
    pub output_item_def_id: u64, // Links to ItemDefinition
    pub brew_time_secs: u32,
    pub generated_at: Timestamp,
    
    // RAG Data
    pub recipe_embedding: Vec<f32>, // 1536-dim vector for similarity search
    pub recipe_json: String, // Full recipe data for RAG context
    
    // Metadata
    pub generation_count: u32, // How many times this recipe was created
    pub last_used_at: Timestamp,
}
```

### Recipe Embedding Table (for RAG)
```rust
#[spacetimedb::table(name = recipe_embedding_index, public)]
#[derive(Clone, Debug)]
pub struct RecipeEmbeddingIndex {
    #[primary_key]
    pub recipe_hash: u64,
    
    pub embedding: Vec<f32>, // 1536-dim OpenAI embedding
    pub recipe_summary: String, // "Stone Soup: Common ingredients, hearty stew"
}
```

---

## 2. Ingredient Rarity System

### Rarity Calculation Function
```rust
// server/src/broth_pot.rs

use crate::plants_database::{PLANT_CONFIGS, PlantType};
use crate::items::{item_definition as ItemDefinitionTableTrait, ItemDefinition};

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum IngredientRarity {
    Common,      // density > 0.001, respawn < 15min
    Uncommon,    // density 0.0005-0.001, respawn 15-30min
    Rare,        // density 0.0001-0.0005, respawn 30-60min
    VeryRare,    // density < 0.0001, respawn > 60min
    Special,     // Non-plant items (Stone, Bone, etc.)
}

pub fn calculate_ingredient_rarity(
    ctx: &ReducerContext,
    item_def_id: u64,
) -> IngredientRarity {
    let item_defs = ctx.db.item_definition();
    let item_def = item_defs.id().find(&item_def_id)
        .ok_or_else(|| return IngredientRarity::Common)?;
    
    // Check if it's a plant-based ingredient
    if let Some(plant_type) = find_plant_type_by_item_name(&item_def.name) {
        if let Some(config) = PLANT_CONFIGS.get(&plant_type) {
            let density = config.density_percent;
            let avg_respawn = (config.min_respawn_time_secs + config.max_respawn_time_secs) / 2;
            
            return match (density, avg_respawn) {
                (d, _) if d > 0.001 && avg_respawn < 900 => IngredientRarity::Common,
                (d, r) if d > 0.0005 && r < 1800 => IngredientRarity::Uncommon,
                (d, r) if d > 0.0001 && r < 3600 => IngredientRarity::Rare,
                _ => IngredientRarity::VeryRare,
            };
        }
    }
    
    // Non-plant items (Stone, Bone, etc.) - check spawn rates
    // Could add item spawn configs later
    IngredientRarity::Special
}

fn find_plant_type_by_item_name(item_name: &str) -> Option<PlantType> {
    // Match item names to plant types
    // e.g., "Pumpkin" -> PlantType::Pumpkin
    // This would need a mapping table
    None // Placeholder
}

pub fn calculate_recipe_power_level(ingredients: &[IngredientRarity]) -> f32 {
    // Power level: 0.0 (weak) to 1.0 (powerful)
    let rarity_weights: HashMap<IngredientRarity, f32> = [
        (IngredientRarity::Common, 0.2),
        (IngredientRarity::Uncommon, 0.4),
        (IngredientRarity::Rare, 0.7),
        (IngredientRarity::VeryRare, 1.0),
        (IngredientRarity::Special, 0.5),
    ].iter().cloned().collect();
    
    let avg_rarity: f32 = ingredients.iter()
        .map(|r| rarity_weights.get(r).unwrap_or(&0.2))
        .sum::<f32>() / ingredients.len() as f32;
    
    // Bonus for multiple rare ingredients
    let rare_count = ingredients.iter()
        .filter(|r| matches!(r, IngredientRarity::Rare | IngredientRarity::VeryRare))
        .count();
    let synergy_bonus = (rare_count as f32 * 0.1).min(0.3);
    
    (avg_rarity + synergy_bonus).min(1.0)
}
```

---

## 3. Recipe Hash & Consistency

```rust
pub fn hash_ingredients(ingredient_names: &[String]) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut sorted = ingredient_names.to_vec();
    sorted.sort(); // Ensure consistent ordering
    
    let mut hasher = DefaultHasher::new();
    sorted.hash(&mut hasher);
    hasher.finish()
}

// Example: ["Stone", "Stone", "Stone"] -> same hash every time
// Ensures "three stones" always becomes "Stone Soup"
```

---

## 4. RAG System Implementation

### Recipe Embedding Generation
```rust
// External service (Python microservice or Rust HTTP client)
async fn generate_recipe_embedding(recipe_text: &str) -> Result<Vec<f32>, String> {
    // Call OpenAI Embeddings API
    // Model: text-embedding-ada-002 (1536 dimensions)
    // Input: "Stone Soup: A hearty stew made from three stones..."
    // Returns: Vec<f32> of 1536 floats
}

async fn find_similar_recipes(
    ctx: &ReducerContext,
    ingredient_names: &[String],
    top_k: usize,
) -> Result<Vec<BrewRecipeCache>, String> {
    // 1. Generate embedding for ingredient combination
    let query_text = format!("Recipe with ingredients: {}", ingredient_names.join(", "));
    let query_embedding = generate_recipe_embedding(&query_text).await?;
    
    // 2. Calculate cosine similarity with all cached recipes
    let all_recipes = ctx.db.recipe_embedding_index().iter().collect::<Vec<_>>();
    
    let mut similarities: Vec<(u64, f32)> = all_recipes.iter()
        .map(|recipe| {
            let similarity = cosine_similarity(&query_embedding, &recipe.embedding);
            (recipe.recipe_hash, similarity)
        })
        .collect();
    
    // 3. Sort by similarity and get top K
    similarities.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    
    // 4. Fetch full recipes
    let recipe_cache = ctx.db.brew_recipe_cache();
    similarities.iter()
        .take(top_k)
        .filter_map(|(hash, _)| recipe_cache.recipe_hash().find(hash))
        .collect()
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    dot_product / (norm_a * norm_b)
}
```

---

## 5. AI Recipe Generation Prompt

```rust
async fn generate_brew_recipe_with_ai(
    ctx: &ReducerContext,
    ingredient_names: &[String],
    ingredient_rarities: &[IngredientRarity],
    similar_recipes: &[BrewRecipeCache],
) -> Result<AIGeneratedRecipe, String> {
    
    let power_level = calculate_recipe_power_level(ingredient_rarities);
    
    // Build RAG context from similar recipes
    let rag_context: String = similar_recipes.iter()
        .take(5) // Top 5 similar recipes
        .map(|recipe| {
            format!("- {}: {} (Power: {:.1})", 
                recipe.ingredient_names.join(" + "),
                get_output_name(ctx, recipe.output_item_def_id),
                calculate_power_from_stats(ctx, recipe.output_item_def_id))
        })
        .collect::<Vec<_>>()
        .join("\n");
    
    let rarity_description: String = ingredient_rarities.iter()
        .map(|r| format!("{:?}", r))
        .collect::<Vec<_>>()
        .join(", ");
    
    let prompt = format!(r#"
You are a survival game recipe designer for a 2D multiplayer survival game set in the Aleutian Islands.

**Current Ingredient Combination:**
{}

**Ingredient Rarities:** {}

**Recipe Power Level:** {:.2} (0.0 = weak/common, 1.0 = powerful/rare)

**Similar Recipes in Game (for consistency):**
{}

**Requirements:**
1. **Name:** Must start with "Glass Jar of " followed by a descriptive name (e.g., "Glass Jar of Stone Soup", "Glass Jar of Hearty Stew")
2. **Description:** 1-2 sentences, survival-themed, matches the game's tone
3. **Brew Time:** 60-300 seconds (rarer ingredients = longer brew time)
4. **Stats:** Total stat value should be 80-150 for common, 150-250 for rare
   - Health: Based on ingredient rarity (common: 20-40, rare: 50-80)
   - Hunger: Based on ingredient rarity (common: 40-60, rare: 70-120)
   - Thirst: Always 15-30 (water-based)
5. **Icon Prompt:** Simple 2D pixel art style, top-down view of glass jar with contents visible

**Power Level Guidelines:**
- Power 0.0-0.3 (Common): Basic stews, simple soups
- Power 0.3-0.6 (Uncommon): Hearty meals, nutritious broths
- Power 0.6-0.8 (Rare): Powerful concoctions, medicinal brews
- Power 0.8-1.0 (Very Rare): Legendary elixirs, transformative potions

**Consistency Rules:**
- Similar ingredient combinations should produce similar recipes
- "Three Stones" should always be "Stone Soup" (classic survival reference)
- Multiple rare ingredients = more powerful effects
- Consider ingredient synergies (e.g., medicinal herbs + food = healing stew)

Return JSON:
{{
    "name": "Glass Jar of [Name]",
    "description": "...",
    "brew_time_secs": 120,
    "health": 30.0,
    "hunger": 60.0,
    "thirst": 20.0,
    "icon_prompt": "2D pixel art, top-down view, glass jar containing [description], survival game item icon, 64x64 pixels, simple colors, game asset style"
}}
"#,
        ingredient_names.join(" + "),
        rarity_description,
        power_level,
        rag_context
    );
    
    // Call GPT-4
    let response = call_openai_gpt4(&prompt).await?;
    parse_recipe_json(&response)
}
```

---

## 6. Recipe Generation Flow

```rust
pub async fn generate_or_get_recipe(
    ctx: &ReducerContext,
    pot: &BrothPot,
) -> Result<u64, String> {
    // 1. Collect ingredients from pot
    let ingredients = collect_ingredient_names(ctx, pot)?;
    let ingredient_def_ids = collect_ingredient_def_ids(ctx, pot)?;
    
    // 2. Calculate hash
    let recipe_hash = hash_ingredients(&ingredients);
    
    // 3. Check cache first
    let recipe_cache = ctx.db.brew_recipe_cache();
    if let Some(cached) = recipe_cache.recipe_hash().find(&recipe_hash) {
        // Update usage stats
        let mut updated = cached.clone();
        updated.generation_count += 1;
        updated.last_used_at = ctx.timestamp;
        recipe_cache.recipe_hash().update(updated);
        
        return Ok(cached.output_item_def_id);
    }
    
    // 4. Calculate ingredient rarities
    let rarities: Vec<IngredientRarity> = ingredient_def_ids.iter()
        .map(|id| calculate_ingredient_rarity(ctx, *id))
        .collect();
    
    // 5. Find similar recipes (RAG)
    let similar_recipes = find_similar_recipes(ctx, &ingredients, 5).await?;
    
    // 6. Generate recipe with AI
    let ai_recipe = generate_brew_recipe_with_ai(
        ctx,
        &ingredients,
        &rarities,
        &similar_recipes,
    ).await?;
    
    // 7. Generate icon
    let icon_filename = generate_and_save_icon(&ai_recipe.icon_prompt, &recipe_hash).await?;
    
    // 8. Create ItemDefinition
    let output_item_def_id = create_brew_item_definition(ctx, &ai_recipe, &icon_filename)?;
    
    // 9. Generate embedding for RAG
    let recipe_text = format!("{}: {}", ai_recipe.name, ai_recipe.description);
    let embedding = generate_recipe_embedding(&recipe_text).await?;
    
    // 10. Cache recipe
    let cached_recipe = BrewRecipeCache {
        recipe_hash,
        ingredient_names: ingredients.clone(),
        ingredient_def_ids,
        output_item_def_id,
        brew_time_secs: ai_recipe.brew_time_secs,
        generated_at: ctx.timestamp,
        recipe_embedding: embedding.clone(),
        recipe_json: serde_json::to_string(&ai_recipe).unwrap_or_default(),
        generation_count: 1,
        last_used_at: ctx.timestamp,
    };
    recipe_cache.insert(cached_recipe.clone())?;
    
    // 11. Cache embedding
    let embedding_entry = RecipeEmbeddingIndex {
        recipe_hash,
        embedding,
        recipe_summary: format!("{}: {}", ai_recipe.name, ai_recipe.description),
    };
    ctx.db.recipe_embedding_index().insert(embedding_entry)?;
    
    Ok(output_item_def_id)
}
```

---

## 7. Dynamic Item Creation

```rust
fn create_brew_item_definition(
    ctx: &ReducerContext,
    recipe: &AIGeneratedRecipe,
    icon_filename: &str,
) -> Result<u64, String> {
    let item_defs = ctx.db.item_definition();
    
    // Check if item already exists (by name)
    if let Some(existing) = item_defs.name().find(&recipe.name) {
        return Ok(existing.id);
    }
    
    // Create new ItemDefinition
    use crate::items_database::builders::ItemBuilder;
    use crate::items::ItemCategory;
    
    let new_item = ItemBuilder::new(&recipe.name, &recipe.description, ItemCategory::Consumable)
        .icon(icon_filename)
        .stackable(5) // Brews can stack
        .consumable(recipe.health, recipe.hunger, recipe.thirst)
        .build();
    
    match item_defs.try_insert(new_item) {
        Ok(inserted) => {
            log::info!("Created new brew item: {} (ID: {})", recipe.name, inserted.id);
            Ok(inserted.id)
        }
        Err(e) => Err(format!("Failed to create brew item: {}", e))
    }
}
```

---

## 8. Icon Generation & Storage

```rust
async fn generate_and_save_icon(
    prompt: &str,
    recipe_hash: &u64,
) -> Result<String, String> {
    // Option A: DALL-E 3 (higher quality)
    let image_bytes = call_dalle3(prompt).await?;
    
    // Option B: Stable Diffusion (faster, cheaper)
    // let image_bytes = call_stable_diffusion(prompt).await?;
    
    // Resize to 64x64 for game
    let resized = resize_image_to_64x64(&image_bytes)?;
    
    // Save to client/public/icons/brews/
    let filename = format!("brew_{:x}.png", recipe_hash);
    let path = format!("client/public/icons/brews/{}", filename);
    std::fs::write(&path, resized)?;
    
    Ok(filename)
}

// Fallback: Use generic brew icon if generation fails
const GENERIC_BREW_ICON: &str = "brew_generic.png";
```

---

## 9. Brewing Process Integration

```rust
// In process_broth_pot_logic_scheduled
fn process_brewing(ctx: &ReducerContext, pot: &mut BrothPot) -> Result<(), String> {
    // Check if brewing conditions met
    if pot.water_level_ml == 0 {
        pot.is_cooking = false;
        pot.current_recipe_name = None;
        return Ok(());
    }
    
    // Check campfire is burning
    let campfire_burning = if let Some(campfire_id) = pot.attached_to_campfire_id {
        ctx.db.campfire().id().find(&campfire_id)
            .map(|cf| cf.is_burning)
            .unwrap_or(false)
    } else {
        false
    };
    
    if !campfire_burning {
        pot.is_cooking = false;
        return Ok(());
    }
    
    // Check if ingredients present
    let has_ingredients = pot.ingredient_instance_id_0.is_some() ||
                         pot.ingredient_instance_id_1.is_some() ||
                         pot.ingredient_instance_id_2.is_some();
    
    if !has_ingredients {
        pot.is_cooking = false;
        pot.current_recipe_name = None;
        return Ok(());
    }
    
    // Start brewing if not already started
    if !pot.is_cooking {
        pot.is_cooking = true;
        pot.brew_start_time = Some(ctx.timestamp);
        
        // Generate recipe (async, but we'll handle it synchronously for now)
        // In production, this would be async
        let output_item_def_id = generate_or_get_recipe(ctx, pot).await?;
        pot.output_item_instance_id = Some(output_item_def_id);
        
        // Get brew time from recipe cache
        let recipe_hash = hash_ingredients(&collect_ingredient_names(ctx, pot)?);
        if let Some(recipe) = ctx.db.brew_recipe_cache().recipe_hash().find(&recipe_hash) {
            pot.brew_time_secs = recipe.brew_time_secs;
        }
    }
    
    // Check if brewing complete
    if let Some(start_time) = pot.brew_start_time {
        let elapsed = ctx.timestamp - start_time;
        let brew_duration = TimeDuration::from_secs(pot.brew_time_secs as u64);
        
        if elapsed >= brew_duration {
            // Complete brewing
            complete_brewing(ctx, pot)?;
        }
    }
    
    Ok(())
}

fn complete_brewing(ctx: &ReducerContext, pot: &mut BrothPot) -> Result<(), String> {
    // 1. Get output item definition
    let output_item_def_id = pot.output_item_instance_id
        .ok_or_else(|| "No output item defined".to_string())?;
    
    // 2. Create inventory item in output slot
    let new_item = InventoryItem {
        instance_id: 0, // Auto-inc
        item_def_id: output_item_def_id,
        quantity: 1,
        location: ItemLocation::Container(ContainerLocationData {
            container_type: ContainerType::BrothPot,
            container_id: pot.id as u64,
            slot_index: 3, // Output slot
        }),
        item_data: None,
    };
    
    ctx.db.inventory_item().insert(new_item);
    
    // 3. Consume ingredients (remove from pot)
    consume_ingredients_from_pot(ctx, pot)?;
    
    // 4. Reset brewing state
    pot.is_cooking = false;
    pot.brew_start_time = None;
    pot.current_recipe_name = None;
    // Water level stays the same (ingredients dissolve)
    
    log::info!("Brewing complete! Created item {}", output_item_def_id);
    Ok(())
}
```

---

## 10. External AI Service Architecture

### Option A: Python Microservice
```python
# services/brew_ai_service.py
from fastapi import FastAPI
from openai import OpenAI
import json

app = FastAPI()
client = OpenAI()

@app.post("/generate-recipe")
async def generate_recipe(request: RecipeRequest):
    # Generate recipe with GPT-4
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are a survival game recipe designer..."},
            {"role": "user", "content": request.prompt}
        ],
        temperature=0.7
    )
    
    recipe = json.loads(response.choices[0].message.content)
    
    # Generate embedding
    embedding_response = client.embeddings.create(
        model="text-embedding-ada-002",
        input=f"{recipe['name']}: {recipe['description']}"
    )
    
    # Generate icon
    icon_response = client.images.generate(
        model="dall-e-3",
        prompt=recipe['icon_prompt'],
        size="1024x1024"
    )
    
    return {
        "recipe": recipe,
        "embedding": embedding_response.data[0].embedding,
        "icon_url": icon_response.data[0].url
    }
```

### Option B: Rust HTTP Client (Direct API Calls)
```rust
// server/src/ai_services.rs
use reqwest;

pub async fn call_openai_gpt4(prompt: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", std::env::var("OPENAI_API_KEY")?))
        .json(&json!({
            "model": "gpt-4",
            "messages": [
                {"role": "system", "content": "You are a survival game recipe designer..."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7
        }))
        .send()
        .await?;
    
    // Parse response...
}
```

---

## 11. Cost & Performance Optimization

### Caching Strategy:
- **Recipe Cache**: Permanent (never expires)
- **Embedding Cache**: Permanent (for RAG)
- **Icon Cache**: Permanent (downloaded once)

### Cost Estimates:
- **GPT-4**: ~$0.03 per recipe generation
- **Embeddings**: ~$0.0001 per recipe
- **DALL-E 3**: ~$0.04 per icon
- **Total per unique recipe**: ~$0.07

### With Caching:
- First player to discover "Stone + Stone + Stone" = $0.07
- All subsequent players = $0.00 (cached)
- **Cost scales with unique combinations, not usage**

### Performance:
- **Cache hit**: <1ms (instant)
- **Cache miss**: 2-5 seconds (AI generation)
- **Async processing**: Non-blocking, players see "Brewing..." state

---

## 12. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Create `BrewRecipeCache` table
- [ ] Create `RecipeEmbeddingIndex` table
- [ ] Implement `hash_ingredients()` function
- [ ] Implement `calculate_ingredient_rarity()` function
- [ ] Basic recipe caching logic

### Phase 2: RAG System (Week 2)
- [ ] Embedding generation service
- [ ] Cosine similarity search
- [ ] Similar recipe finding
- [ ] RAG context building

### Phase 3: AI Integration (Week 3)
- [ ] GPT-4 recipe generation
- [ ] Prompt engineering with rarity system
- [ ] Recipe JSON parsing
- [ ] Error handling & fallbacks

### Phase 4: Icon Generation (Week 4)
- [ ] DALL-E 3 / Stable Diffusion integration
- [ ] Image resizing (64x64)
- [ ] Icon storage system
- [ ] Fallback generic icon

### Phase 5: Brewing Logic (Week 5)
- [ ] Recipe generation on brew start
- [ ] Brew timer integration
- [ ] Output slot population
- [ ] Ingredient consumption
- [ ] UI updates

### Phase 6: Polish & Testing (Week 6)
- [ ] Edge case handling
- [ ] Performance optimization
- [ ] Cost monitoring
- [ ] Player testing & balancing

---

## 13. Example Recipe Evolution

**First Player Discovers:**
- Ingredients: ["Stone", "Stone", "Stone"]
- AI generates: "Glass Jar of Stone Soup"
- Stats: Health 25, Hunger 50, Thirst 15
- Cached with hash

**Second Player (Same Combination):**
- Ingredients: ["Stone", "Stone", "Stone"]
- Hash matches → Uses cached recipe
- Instant, consistent result

**Third Player (Similar):**
- Ingredients: ["Stone", "Stone", "Bone"]
- Hash different → RAG finds "Stone Soup" as similar
- AI generates: "Glass Jar of Bone Broth" (similar but different)
- New recipe cached

**Over Time:**
- Server accumulates 100+ unique recipes
- RAG ensures consistency (similar ingredients → similar recipes)
- Rare combinations become legendary discoveries
- Common combinations become standard recipes

---

## 14. Edge Cases & Fallbacks

### AI Service Failure:
- Fallback to "Glass Jar of Mystery Stew" (generic recipe)
- Generic icon: `brew_generic.png`
- Stats: Average values (Health 30, Hunger 50, Thirst 20)

### Invalid Ingredients:
- Non-consumable items → Error message
- Empty pot → No brewing
- No campfire → No brewing

### Rate Limiting:
- Queue recipe generation requests
- Show "Generating recipe..." message
- Process async, update when ready

---

## 15. Monitoring & Analytics

```rust
#[spacetimedb::table(name = brew_analytics, public)]
pub struct BrewAnalytics {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub recipe_hash: u64,
    pub created_at: Timestamp,
    pub created_by: Identity,
    pub generation_time_ms: u32,
    pub ai_cost_usd: f32,
}
```

Track:
- Most popular recipes
- Most expensive recipes (AI cost)
- Average generation time
- Player discovery patterns

---

This system provides:
✅ **Infinite recipe combinations** (AI-generated)
✅ **Consistency** (RAG + caching)
✅ **Balanced gameplay** (rarity-based stats)
✅ **Emergent discovery** (players find new combinations)
✅ **Cost-effective** (one-time cost per unique recipe)
✅ **Scalable** (works with any ingredient combination)

