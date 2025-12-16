# Adding New Items Guide

This guide explains how to add new items to the game's item database.

## Overview

Items are defined in the server module under `server/src/items_database/`. The system uses a modular architecture where items are organized by category.

## Item Database Structure

```
server/src/items_database/
├── mod.rs          # Main entry point, combines all categories
├── builders.rs     # ItemDefinition builder utilities
├── weapons.rs      # Melee weapons
├── tools.rs        # Harvesting tools (axes, pickaxes)
├── consumables.rs  # Food, potions, water
├── materials.rs    # Crafting materials (wood, stone, fiber)
├── seeds.rs        # Plantable seeds
├── armor.rs        # Wearable armor pieces
├── placeables.rs   # Structures (campfire, storage box)
├── ammunition.rs   # Arrows, bullets
```

## ItemDefinition Table Schema

```rust
#[spacetimedb::table(name = item_definition, public)]
pub struct ItemDefinition {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub name: String,                    // Unique identifier
    pub description: String,             // Flavor text
    pub category: ItemCategory,          // Tool, Material, Weapon, etc.
    pub icon_asset_name: String,         // Client asset filename
    
    // Stack behavior
    pub is_stackable: bool,
    pub stack_size: u32,                 // Max per stack
    
    // Equipment
    pub is_equippable: bool,
    pub equipment_slot_type: Option<EquipmentSlotType>,
    
    // Combat stats
    pub primary_target_damage_min: Option<u32>,
    pub primary_target_damage_max: Option<u32>,
    pub pvp_damage_min: Option<u32>,
    pub pvp_damage_max: Option<u32>,
    pub damage_type: Option<DamageType>,
    
    // Tool yields
    pub primary_target_type: Option<TargetType>,
    pub primary_target_yield_min: Option<u32>,
    pub primary_target_yield_max: Option<u32>,
    pub primary_yield_resource_name: Option<String>,
    
    // Consumable effects
    pub consumable_health_gain: Option<f32>,
    pub consumable_hunger_satiated: Option<f32>,
    pub consumable_thirst_quenched: Option<f32>,
    pub consumable_duration_secs: Option<f32>,
    
    // Crafting
    pub crafting_cost: Option<Vec<CostIngredient>>,
    pub crafting_output_quantity: Option<u32>,
    pub crafting_time_secs: Option<u32>,
    pub requires_station: Option<String>,
    
    // Cooking
    pub cook_time_secs: Option<f32>,
    pub cooked_item_def_name: Option<String>,
    
    // Fuel
    pub fuel_burn_duration_secs: Option<f32>,
    
    // Armor stats
    pub armor_resistances: Option<ArmorResistances>,
    pub warmth_bonus: Option<f32>,
    pub movement_speed_modifier: Option<f32>,
    // ... many more armor-specific fields
}
```

## Step-by-Step: Adding a New Item

### 1. Choose the Category File

Determine which category your item belongs to:
- **Weapon** → `weapons.rs`
- **Tool** (harvesting) → `tools.rs`
- **Food/Potion** → `consumables.rs`
- **Crafting material** → `materials.rs`
- **Seed** → `seeds.rs`
- **Armor** → `armor.rs`
- **Placeable structure** → `placeables.rs`
- **Arrow/Bullet** → `ammunition.rs`

### 2. Define the Item

Open the appropriate file and add your item to the `get_X_definitions()` function.

#### Example: Adding a New Tool

```rust
// In server/src/items_database/tools.rs

pub fn get_tool_definitions() -> Vec<ItemDefinition> {
    vec![
        // ... existing tools ...
        
        // NEW: Bronze Pickaxe
        ItemDefinition {
            id: 0,  // Auto-incremented
            name: "Bronze Pickaxe".to_string(),
            description: "A pickaxe made of bronze. More durable than stone.".to_string(),
            category: ItemCategory::Tool,
            icon_asset_name: "bronze_pickaxe.png".to_string(),
            
            // Not stackable (it's a tool)
            is_stackable: false,
            stack_size: 1,
            
            // Can be equipped in hand
            is_equippable: true,
            equipment_slot_type: Some(EquipmentSlotType::MainHand),
            
            // Mining stats
            primary_target_type: Some(TargetType::Stone),
            primary_target_damage_min: Some(35),
            primary_target_damage_max: Some(45),
            primary_target_yield_min: Some(3),
            primary_target_yield_max: Some(5),
            primary_yield_resource_name: Some("Stone".to_string()),
            
            // PvP damage
            pvp_damage_min: Some(8),
            pvp_damage_max: Some(12),
            damage_type: Some(DamageType::Blunt),
            
            // Attack speed
            attack_interval_secs: Some(1.2),
            
            // Crafting recipe
            crafting_cost: Some(vec![
                CostIngredient { item_name: "Bronze Ingot".to_string(), quantity: 3 },
                CostIngredient { item_name: "Wood".to_string(), quantity: 2 },
            ]),
            crafting_output_quantity: Some(1),
            crafting_time_secs: Some(8),
            requires_station: None,  // Can craft anywhere
            
            // Not a consumable/cookable/fuel
            consumable_health_gain: None,
            consumable_hunger_satiated: None,
            consumable_thirst_quenched: None,
            consumable_duration_secs: None,
            cook_time_secs: None,
            cooked_item_def_name: None,
            fuel_burn_duration_secs: None,
            
            // Not armor
            armor_resistances: None,
            warmth_bonus: None,
            movement_speed_modifier: None,
            stamina_regen_modifier: None,
            reflects_melee_damage: None,
            fire_damage_multiplier: None,
            detection_radius_bonus: None,
            low_health_damage_bonus: None,
            grants_burn_immunity: false,
            grants_cold_immunity: false,
            grants_wetness_immunity: false,
            grants_knockback_immunity: false,
            grants_bleed_immunity: false,
            noise_on_sprint: false,
            silences_movement: false,
            intimidates_animals: false,
            
            // Misc
            bleed_damage_per_tick: None,
            bleed_duration_seconds: None,
            bleed_tick_interval_seconds: None,
            damage_resistance: None,
            respawn_time_seconds: None,
            ammo_type: None,
        },
    ]
}
```

#### Example: Adding a Consumable

```rust
// In server/src/items_database/consumables.rs

ItemDefinition {
    id: 0,
    name: "Healing Salve".to_string(),
    description: "A soothing salve that heals wounds over time.".to_string(),
    category: ItemCategory::Consumable,
    icon_asset_name: "healing_salve.png".to_string(),
    
    is_stackable: true,
    stack_size: 10,
    is_equippable: false,
    equipment_slot_type: None,
    
    // Healing effect over time
    consumable_health_gain: Some(50.0),      // Total 50 HP
    consumable_duration_secs: Some(10.0),    // Over 10 seconds
    consumable_hunger_satiated: None,
    consumable_thirst_quenched: None,
    
    // Crafting
    crafting_cost: Some(vec![
        CostIngredient { item_name: "Aloe Vera".to_string(), quantity: 2 },
        CostIngredient { item_name: "Animal Fat".to_string(), quantity: 1 },
    ]),
    crafting_output_quantity: Some(1),
    crafting_time_secs: Some(5),
    requires_station: None,
    
    // ... all other fields set to None/false/defaults ...
}
```

### 3. Add the Icon Asset

Place the icon image in the client assets:

```
client/public/assets/items/{icon_asset_name}
```

Icon requirements:
- Format: PNG with transparency
- Size: 64x64 pixels (recommended)
- Naming: Match `icon_asset_name` exactly

### 4. Rebuild and Publish

```bash
# Build server
spacetime build --project-path ./server

# Publish (clear data to reseed items)
spacetime publish -c --project-path ./server broth-bullets-local

# Regenerate client bindings
spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server
```

### 5. Verify

```bash
# Check item was added
spacetime sql broth-bullets-local "SELECT id, name FROM item_definition WHERE name = 'Bronze Pickaxe'"
```

## Item Categories Reference

| Category | Description | Example Fields Used |
|----------|-------------|---------------------|
| `Tool` | Harvesting implements | `primary_target_type`, yields |
| `Weapon` | Combat items | `damage_*`, `damage_type` |
| `Material` | Crafting ingredients | `is_stackable`, `stack_size` |
| `Consumable` | Food, potions | `consumable_*` |
| `Armor` | Wearable protection | `armor_resistances`, `warmth_bonus` |
| `Placeable` | World structures | (handled separately in entity system) |
| `Ammunition` | Arrows, bullets | `ammo_type`, damage |
| `RangedWeapon` | Bows, guns | (uses `RangedWeaponStats` table) |

## Using Builders (Optional)

For cleaner code, use the builder pattern in `builders.rs`:

```rust
pub fn create_basic_tool(name: &str, description: &str, icon: &str) -> ItemDefinition {
    ItemDefinition {
        id: 0,
        name: name.to_string(),
        description: description.to_string(),
        category: ItemCategory::Tool,
        icon_asset_name: icon.to_string(),
        is_stackable: false,
        stack_size: 1,
        is_equippable: true,
        equipment_slot_type: Some(EquipmentSlotType::MainHand),
        // ... sensible defaults for other fields ...
    }
}
```

## Common Patterns

### Cookable Raw Food → Cooked Food

```rust
// Raw item
ItemDefinition {
    name: "Raw Meat".to_string(),
    cook_time_secs: Some(15.0),
    cooked_item_def_name: Some("Cooked Meat".to_string()),
    // ... 
}

// Cooked result (separate item)
ItemDefinition {
    name: "Cooked Meat".to_string(),
    consumable_hunger_satiated: Some(40.0),
    // ...
}
```

### Fuel Item

```rust
ItemDefinition {
    name: "Coal".to_string(),
    fuel_burn_duration_secs: Some(120.0),  // 2 minutes of burn time
    // ...
}
```

### Tiered Equipment

Name consistently for clarity:
- `Stone Pickaxe`, `Iron Pickaxe`, `Steel Pickaxe`
- Stats scale accordingly

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Item not appearing | Check `get_X_definitions()` includes new item |
| Icon not showing | Verify filename matches `icon_asset_name` |
| Recipe not working | Ingredient names must match exactly |
| Stats not applying | Ensure correct category and field usage |

