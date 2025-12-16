# Adding New Recipes Guide

This guide explains how to add crafting and cooking recipes to the game.

## Recipe System Overview

The game has two types of "recipes":

1. **Crafting Recipes** - Manual player crafting (table: `recipe`)
2. **Cooking Recipes** - Automatic transformation in heat sources (defined in `ItemDefinition`)

Both are ultimately derived from `ItemDefinition` fields.

## Crafting Recipes

### How It Works

Crafting recipes are automatically generated from `ItemDefinition` entries that have:
- `crafting_cost: Some(vec![...])` - Required ingredients
- `crafting_output_quantity: Some(n)` - How many items produced
- `crafting_time_secs: Some(n)` - Time to craft

The `seed_recipes` reducer in `crafting.rs` reads all item definitions and creates `Recipe` entries.

### Recipe Table Schema

```rust
#[spacetimedb::table(name = recipe, public)]
pub struct Recipe {
    #[primary_key]
    #[auto_inc]
    pub recipe_id: u64,
    pub output_item_def_id: u64,       // Links to ItemDefinition
    pub output_quantity: u32,           // How many crafted
    pub ingredients: Vec<RecipeIngredient>,
    pub crafting_time_secs: u32,
}

pub struct RecipeIngredient {
    pub item_def_id: u64,   // Links to ItemDefinition
    pub quantity: u32,
}
```

### Adding a Crafting Recipe

Simply add the crafting fields to your `ItemDefinition`:

```rust
// In items_database/tools.rs (or appropriate category)
ItemDefinition {
    name: "Iron Sword".to_string(),
    // ...
    
    // This makes it craftable
    crafting_cost: Some(vec![
        CostIngredient { item_name: "Iron Ingot".to_string(), quantity: 3 },
        CostIngredient { item_name: "Wood".to_string(), quantity: 1 },
        CostIngredient { item_name: "Leather Strip".to_string(), quantity: 2 },
    ]),
    crafting_output_quantity: Some(1),
    crafting_time_secs: Some(10),  // 10 seconds to craft
    requires_station: None,         // Can craft anywhere (or Some("Forge"))
    
    // ...other fields
}
```

### Recipe with Station Requirement

```rust
crafting_cost: Some(vec![
    CostIngredient { item_name: "Iron Ore".to_string(), quantity: 2 },
]),
crafting_output_quantity: Some(1),
crafting_time_secs: Some(15),
requires_station: Some("Furnace".to_string()),  // Must be near furnace
```

## Cooking Recipes

### How It Works

Cooking happens automatically in heat sources (Campfire, Furnace, Barbecue, Fumarole).

An item is "cookable" if it has:
- `cook_time_secs: Some(n)` - Time to cook
- `cooked_item_def_name: Some("Result Item")` - What it becomes

### Adding a Cooking Recipe

1. **Define the raw ingredient**:

```rust
// Raw item with cooking data
ItemDefinition {
    name: "Raw Fish".to_string(),
    category: ItemCategory::Consumable,
    
    // Cooking transformation
    cook_time_secs: Some(20.0),           // 20 seconds to cook
    cooked_item_def_name: Some("Cooked Fish".to_string()),
    
    // Raw stats (if eaten raw)
    consumable_hunger_satiated: Some(5.0),   // Barely fills hunger
    consumable_thirst_quenched: None,
    consumable_health_gain: Some(-10.0),     // Food poisoning risk!
    
    // ...
}
```

2. **Define the cooked result**:

```rust
ItemDefinition {
    name: "Cooked Fish".to_string(),
    category: ItemCategory::Consumable,
    
    // No cook data (already cooked)
    cook_time_secs: None,
    cooked_item_def_name: None,
    
    // Better stats
    consumable_hunger_satiated: Some(35.0),
    consumable_thirst_quenched: None,
    consumable_health_gain: Some(5.0),  // Minor health boost
    
    // ...
}
```

### Cooking Chains (Multiple Stages)

You can chain cooking transformations:

```rust
// Stage 1: Raw Dough
ItemDefinition {
    name: "Raw Dough".to_string(),
    cook_time_secs: Some(30.0),
    cooked_item_def_name: Some("Bread".to_string()),
    // ...
}

// Stage 2: Bread (can be toasted)
ItemDefinition {
    name: "Bread".to_string(),
    cook_time_secs: Some(10.0),
    cooked_item_def_name: Some("Toasted Bread".to_string()),
    // ...
}

// Stage 3: Toasted Bread (final)
ItemDefinition {
    name: "Toasted Bread".to_string(),
    cook_time_secs: None,  // Can't cook further
    cooked_item_def_name: None,
    // ...
}
```

### Burning (Overcooking)

Items can burn if left too long. This is handled by the fuel-burning container logic:

```rust
// In campfire.rs processing logic
if cooking_progress >= cook_time {
    // Item is done - becomes cooked version
    // If left longer and cook_time is exceeded by 2x, it burns
}
```

To make an item burnable:
```rust
ItemDefinition {
    name: "Cooked Steak".to_string(),
    cook_time_secs: Some(5.0),  // Can be "overcooked"
    cooked_item_def_name: Some("Burnt Steak".to_string()),
    // ...
}
```

## Broth Pot Recipes

The Broth Pot has special multi-ingredient recipes defined in `broth_pot.rs`.

### Broth Recipe Structure

```rust
pub struct BrothRecipe {
    pub name: &'static str,
    pub ingredients: &'static [(&'static str, u32)],  // (item_name, quantity)
    pub min_water_ml: u32,
    pub requires_salt_water: bool,
    pub cook_time_secs: f32,
    pub result_item_name: &'static str,
    pub result_quantity: u32,
}
```

### Adding a Broth Recipe

In `server/src/broth_pot.rs`:

```rust
const BROTH_RECIPES: &[BrothRecipe] = &[
    // Existing recipes...
    
    // New recipe
    BrothRecipe {
        name: "Mushroom Soup",
        ingredients: &[
            ("Mushroom", 3),
            ("Onion", 1),
        ],
        min_water_ml: 500,
        requires_salt_water: false,  // Fresh water only
        cook_time_secs: 45.0,
        result_item_name: "Mushroom Soup",
        result_quantity: 2,
    },
];
```

## Furnace Smelting

Furnaces handle ore → ingot transformations using the same cooking system:

```rust
// Ore
ItemDefinition {
    name: "Iron Ore".to_string(),
    cook_time_secs: Some(30.0),
    cooked_item_def_name: Some("Iron Ingot".to_string()),
    // ...
}

// Ingot (result)
ItemDefinition {
    name: "Iron Ingot".to_string(),
    cook_time_secs: None,
    cooked_item_def_name: None,
    // ...
}
```

## Recipe Validation

### Ingredient Name Matching

**Critical**: Ingredient names in `CostIngredient.item_name` must **exactly match** the `name` field of an existing `ItemDefinition`.

```rust
// WRONG - will fail
CostIngredient { item_name: "wood".to_string(), quantity: 5 }  // lowercase

// CORRECT
CostIngredient { item_name: "Wood".to_string(), quantity: 5 }
```

### Checking for Errors

View server logs after publishing:
```bash
spacetime logs broth-bullets-local | grep -i "recipe\|ingredient"
```

Common errors:
- `Failed to find ItemDefinition for ingredient name 'X'`
- Recipe not appearing in client crafting menu

## Client-Side Recipe Display

Recipes are fetched via subscription and displayed in `CraftingScreen.tsx`.

The client shows:
- Recipe name and icon
- Required ingredients with counts
- Crafting time
- Whether player has enough materials

### Recipe Filtering

```typescript
// In CraftingScreen.tsx
const availableRecipes = useMemo(() => {
  return Array.from(recipes.values()).filter(recipe => {
    // Filter by station requirement if applicable
    if (recipe.requires_station && !isNearStation(recipe.requires_station)) {
      return false;
    }
    return true;
  });
}, [recipes, playerPosition, stations]);
```

## Complete Example: New Food Item with Recipe

### 1. Define Raw Ingredient (if needed)

```rust
// items_database/consumables.rs
ItemDefinition {
    name: "Wild Berries".to_string(),
    description: "Foraged berries. Safe to eat raw.".to_string(),
    category: ItemCategory::Consumable,
    icon_asset_name: "wild_berries.png".to_string(),
    is_stackable: true,
    stack_size: 20,
    consumable_hunger_satiated: Some(5.0),
    // Not craftable (foraged)
    crafting_cost: None,
    // Not cookable directly
    cook_time_secs: None,
    cooked_item_def_name: None,
    // ...
}
```

### 2. Define Crafted Result

```rust
ItemDefinition {
    name: "Berry Jam".to_string(),
    description: "Sweet preserved berries. Lasts longer than fresh.".to_string(),
    category: ItemCategory::Consumable,
    icon_asset_name: "berry_jam.png".to_string(),
    is_stackable: true,
    stack_size: 10,
    consumable_hunger_satiated: Some(25.0),
    
    // Crafting recipe
    crafting_cost: Some(vec![
        CostIngredient { item_name: "Wild Berries".to_string(), quantity: 5 },
        CostIngredient { item_name: "Sugar".to_string(), quantity: 1 },
    ]),
    crafting_output_quantity: Some(2),
    crafting_time_secs: Some(8),
    requires_station: None,
    
    // Not further cookable
    cook_time_secs: None,
    cooked_item_def_name: None,
    // ...
}
```

### 3. Add Icons

Place in `client/public/assets/items/`:
- `wild_berries.png`
- `berry_jam.png`

### 4. Rebuild

```bash
spacetime build --project-path ./server
spacetime publish -c --project-path ./server broth-bullets-local
spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Recipe not in menu | Check `crafting_cost` is `Some(...)` not `None` |
| "Missing ingredient" | Verify exact name match with `ItemDefinition.name` |
| Cooking not working | Ensure `cook_time_secs` and `cooked_item_def_name` both set |
| Wrong output quantity | Check `crafting_output_quantity` |
| Can't craft near station | Verify `requires_station` string matches station name |

