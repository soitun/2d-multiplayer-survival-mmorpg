/*
 * server/src/bone_carving.rs
 *
 * Purpose: Bone carving system for crafting Aleutian spirit totems.
 * Uses the Bone Carving Kit (found at Whale Bone Graveyard) to craft
 * powerful back-slot items from animal skulls.
 */

use spacetimedb::{Identity, ReducerContext, Table, Timestamp, TimeDuration, SpacetimeType, ScheduleAt};
use log;
use std::collections::HashMap;
use std::time::Duration;

use crate::items::{InventoryItem, ItemDefinition};
use crate::items::{inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait};
use crate::Player;
use crate::player as PlayerTableTrait;
use crate::models::ItemLocation;
use crate::crafting_queue::CraftingQueueItem;
use crate::crafting_queue::crafting_queue_item as CraftingQueueItemTableTrait;

/// Represents a single ingredient for a bone carving recipe
#[derive(Clone, Debug)]
pub struct BoneCarvingIngredient {
    pub item_name: String,
    pub quantity: u32,
}

/// Represents a bone carving recipe
#[derive(Clone, Debug)]
pub struct BoneCarvingRecipe {
    pub id: u64,
    pub output_item_name: String,
    pub output_quantity: u32,
    pub ingredients: Vec<BoneCarvingIngredient>,
    pub crafting_time_secs: u32,
    pub description: String, // Passive bonus description for UI
}

/// Table for tracking bone carving kit respawn schedule
#[spacetimedb::table(accessor = bone_carving_kit_respawn, scheduled(respawn_bone_carving_kit))]
#[derive(Clone)]
pub struct BoneCarvingKitRespawn {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Returns all bone carving recipes
pub fn get_bone_carving_recipes() -> Vec<BoneCarvingRecipe> {
    vec![
        // 1. Kayux Amulet (Fox - Stealth)
        BoneCarvingRecipe {
            id: 1,
            output_item_name: "Kayux Amulet".to_string(),
            output_quantity: 1,
            ingredients: vec![
                BoneCarvingIngredient { item_name: "Fox Skull".to_string(), quantity: 1 },
                BoneCarvingIngredient { item_name: "Animal Bone".to_string(), quantity: 10 },
                BoneCarvingIngredient { item_name: "Tallow".to_string(), quantity: 5 },
                BoneCarvingIngredient { item_name: "Fox Fur".to_string(), quantity: 2 },
                BoneCarvingIngredient { item_name: "Rope".to_string(), quantity: 3 },
            ],
            crafting_time_secs: 60,
            description: "-20% animal detection radius".to_string(),
        },
        // 2. Sabaakax Totem (Wolf - Pack Bonus)
        BoneCarvingRecipe {
            id: 2,
            output_item_name: "Sabaakax Totem".to_string(),
            output_quantity: 1,
            ingredients: vec![
                BoneCarvingIngredient { item_name: "Wolf Skull".to_string(), quantity: 1 },
                BoneCarvingIngredient { item_name: "Animal Bone".to_string(), quantity: 15 },
                BoneCarvingIngredient { item_name: "Tallow".to_string(), quantity: 5 },
                BoneCarvingIngredient { item_name: "Wolf Fur".to_string(), quantity: 2 },
                BoneCarvingIngredient { item_name: "Rope".to_string(), quantity: 3 },
            ],
            crafting_time_secs: 75,
            description: "+15% damage when allies nearby".to_string(),
        },
        // 3. Qax'aadax Totem (Viper - Poison)
        BoneCarvingRecipe {
            id: 3,
            output_item_name: "Qax'aadax Totem".to_string(),
            output_quantity: 1,
            ingredients: vec![
                BoneCarvingIngredient { item_name: "Viper Skull".to_string(), quantity: 1 },
                BoneCarvingIngredient { item_name: "Animal Bone".to_string(), quantity: 10 },
                BoneCarvingIngredient { item_name: "Cable Viper Gland".to_string(), quantity: 3 },
                BoneCarvingIngredient { item_name: "Viper Scale".to_string(), quantity: 3 },
                BoneCarvingIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ],
            crafting_time_secs: 60,
            description: "+1 poison damage on melee hits".to_string(),
        },
        // 4. Tugix Totem (Walrus - Cold/Health)
        BoneCarvingRecipe {
            id: 4,
            output_item_name: "Tugix Totem".to_string(),
            output_quantity: 1,
            ingredients: vec![
                BoneCarvingIngredient { item_name: "Walrus Skull".to_string(), quantity: 1 },
                BoneCarvingIngredient { item_name: "Animal Bone".to_string(), quantity: 20 },
                BoneCarvingIngredient { item_name: "Tallow".to_string(), quantity: 8 },
                BoneCarvingIngredient { item_name: "Animal Leather".to_string(), quantity: 5 },
                BoneCarvingIngredient { item_name: "Rope".to_string(), quantity: 4 },
            ],
            crafting_time_secs: 90,
            description: "+15% cold resistance, +10 max health".to_string(),
        },
        // 5. Tunux Charm (Vole - Harvest)
        BoneCarvingRecipe {
            id: 5,
            output_item_name: "Tunux Charm".to_string(),
            output_quantity: 1,
            ingredients: vec![
                BoneCarvingIngredient { item_name: "Vole Skull".to_string(), quantity: 1 },
                BoneCarvingIngredient { item_name: "Animal Bone".to_string(), quantity: 8 },
                BoneCarvingIngredient { item_name: "Tallow".to_string(), quantity: 3 },
                BoneCarvingIngredient { item_name: "Plant Fiber".to_string(), quantity: 10 },
                BoneCarvingIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ],
            crafting_time_secs: 45,
            description: "+25% harvest yield".to_string(),
        },
        // 6. Qilax Totem (Wolverine - Berserker)
        BoneCarvingRecipe {
            id: 6,
            output_item_name: "Qilax Totem".to_string(),
            output_quantity: 1,
            ingredients: vec![
                BoneCarvingIngredient { item_name: "Wolverine Skull".to_string(), quantity: 1 },
                BoneCarvingIngredient { item_name: "Animal Bone".to_string(), quantity: 15 },
                BoneCarvingIngredient { item_name: "Tallow".to_string(), quantity: 5 },
                BoneCarvingIngredient { item_name: "Animal Leather".to_string(), quantity: 3 },
                BoneCarvingIngredient { item_name: "Rope".to_string(), quantity: 3 },
            ],
            crafting_time_secs: 75,
            description: "+30% damage when below 25% health".to_string(),
        },
        // 7. Tanuux Totem (Polar Bear - Strength)
        BoneCarvingRecipe {
            id: 7,
            output_item_name: "Tanuux Totem".to_string(),
            output_quantity: 1,
            ingredients: vec![
                BoneCarvingIngredient { item_name: "Polar Bear Skull".to_string(), quantity: 1 },
                BoneCarvingIngredient { item_name: "Animal Bone".to_string(), quantity: 25 },
                BoneCarvingIngredient { item_name: "Tallow".to_string(), quantity: 10 },
                BoneCarvingIngredient { item_name: "Animal Leather".to_string(), quantity: 5 },
                BoneCarvingIngredient { item_name: "Rope".to_string(), quantity: 5 },
            ],
            crafting_time_secs: 90,
            description: "+15% melee damage, knockback immunity".to_string(),
        },
        // 8. Ulax Charm (Hare - Speed)
        BoneCarvingRecipe {
            id: 8,
            output_item_name: "Ulax Charm".to_string(),
            output_quantity: 1,
            ingredients: vec![
                BoneCarvingIngredient { item_name: "Hare Skull".to_string(), quantity: 1 },
                BoneCarvingIngredient { item_name: "Animal Bone".to_string(), quantity: 8 },
                BoneCarvingIngredient { item_name: "Tallow".to_string(), quantity: 3 },
                BoneCarvingIngredient { item_name: "Plant Fiber".to_string(), quantity: 10 },
                BoneCarvingIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ],
            crafting_time_secs: 45,
            description: "+8% movement speed".to_string(),
        },
        // 9. Angunax Totem (Owl - Detection)
        BoneCarvingRecipe {
            id: 9,
            output_item_name: "Angunax Totem".to_string(),
            output_quantity: 1,
            ingredients: vec![
                BoneCarvingIngredient { item_name: "Owl Skull".to_string(), quantity: 1 },
                BoneCarvingIngredient { item_name: "Animal Bone".to_string(), quantity: 12 },
                BoneCarvingIngredient { item_name: "Tallow".to_string(), quantity: 4 },
                BoneCarvingIngredient { item_name: "Owl Feathers".to_string(), quantity: 5 },
                BoneCarvingIngredient { item_name: "Rope".to_string(), quantity: 3 },
            ],
            crafting_time_secs: 60,
            description: "Permanent night vision".to_string(),
        },
        // 10. Alax Totem (Shark - Sea Hunter)
        BoneCarvingRecipe {
            id: 10,
            output_item_name: "Alax Totem".to_string(),
            output_quantity: 1,
            ingredients: vec![
                BoneCarvingIngredient { item_name: "Shark Skull".to_string(), quantity: 1 },
                BoneCarvingIngredient { item_name: "Animal Bone".to_string(), quantity: 15 },
                BoneCarvingIngredient { item_name: "Tallow".to_string(), quantity: 5 },
                BoneCarvingIngredient { item_name: "Shark Fin".to_string(), quantity: 2 },
                BoneCarvingIngredient { item_name: "Rope".to_string(), quantity: 3 },
            ],
            crafting_time_secs: 75,
            description: "+15% water speed, 10% bleed on melee".to_string(),
        },
        // 11. Tayngax Totem (Tern - Tireless Endurance)
        BoneCarvingRecipe {
            id: 11,
            output_item_name: "Tayngax Totem".to_string(),
            output_quantity: 1,
            ingredients: vec![
                BoneCarvingIngredient { item_name: "Tern Skull".to_string(), quantity: 1 },
                BoneCarvingIngredient { item_name: "Animal Bone".to_string(), quantity: 10 },
                BoneCarvingIngredient { item_name: "Tallow".to_string(), quantity: 4 },
                BoneCarvingIngredient { item_name: "Tern Feathers".to_string(), quantity: 5 },
                BoneCarvingIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ],
            crafting_time_secs: 55,
            description: "+15% stamina regeneration".to_string(),
        },
        // 12. Qaangax Totem (Crow - Aggressive Defender)
        BoneCarvingRecipe {
            id: 12,
            output_item_name: "Qaangax Totem".to_string(),
            output_quantity: 1,
            ingredients: vec![
                BoneCarvingIngredient { item_name: "Crow Skull".to_string(), quantity: 1 },
                BoneCarvingIngredient { item_name: "Animal Bone".to_string(), quantity: 10 },
                BoneCarvingIngredient { item_name: "Tallow".to_string(), quantity: 4 },
                BoneCarvingIngredient { item_name: "Crow Feathers".to_string(), quantity: 5 },
                BoneCarvingIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ],
            crafting_time_secs: 55,
            description: "Reflects 10% melee damage".to_string(),
        },
    ]
}

/// Get a bone carving recipe by ID
pub fn get_bone_carving_recipe(recipe_id: u64) -> Option<BoneCarvingRecipe> {
    get_bone_carving_recipes().into_iter().find(|r| r.id == recipe_id)
}

/// Reducer to start bone carving
#[spacetimedb::reducer]
pub fn start_bone_carving(ctx: &ReducerContext, recipe_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender();
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();
    let queue_table = ctx.db.crafting_queue_item();

    // 1. Get the recipe
    let recipe = get_bone_carving_recipe(recipe_id)
        .ok_or(format!("Bone carving recipe with ID {} not found.", recipe_id))?;

    // 2. Check if player has Bone Carving Kit in inventory
    let bone_carving_kit_def = item_def_table.iter()
        .find(|def| def.name == "Bone Carving Kit")
        .ok_or("Bone Carving Kit item definition not found.")?;
    
    let has_kit = inventory_table.iter().any(|item| {
        let is_in_player_possession = match &item.location {
            ItemLocation::Inventory(data) => data.owner_id == sender_id,
            ItemLocation::Hotbar(data) => data.owner_id == sender_id,
            _ => false,
        };
        is_in_player_possession && item.item_def_id == bone_carving_kit_def.id
    });

    if !has_kit {
        return Err("You need a Bone Carving Kit to craft bone totems.".to_string());
    }

    // 3. Check all required materials and build consumption map
    let mut required_resources: HashMap<u64, u32> = HashMap::new();
    
    for ingredient in &recipe.ingredients {
        let ingredient_def = item_def_table.iter()
            .find(|def| def.name == ingredient.item_name)
            .ok_or(format!("Item '{}' not found.", ingredient.item_name))?;
        
        *required_resources.entry(ingredient_def.id).or_insert(0) += ingredient.quantity;
    }

    // 4. Count available resources and track items to consume
    let mut available_resources: HashMap<u64, u32> = HashMap::new();
    let mut items_to_consume: HashMap<u64, u32> = HashMap::new(); // instance_id -> quantity
    
    // Clone required_resources for iteration
    let mut remaining_required = required_resources.clone();
    
    for item in inventory_table.iter() {
        let is_in_player_possession = match &item.location {
            ItemLocation::Inventory(data) => data.owner_id == sender_id,
            ItemLocation::Hotbar(data) => data.owner_id == sender_id,
            _ => false,
        };
        
        if is_in_player_possession {
            *available_resources.entry(item.item_def_id).or_insert(0) += item.quantity;
            
            // Track items to consume
            if let Some(needed_qty) = remaining_required.get_mut(&item.item_def_id) {
                if *needed_qty > 0 {
                    let can_take = std::cmp::min(item.quantity, *needed_qty);
                    *items_to_consume.entry(item.instance_id).or_insert(0) += can_take;
                    *needed_qty -= can_take;
                }
            }
        }
    }

    // 5. Verify all resources are available
    for (item_def_id, required_qty) in &required_resources {
        let available_qty = available_resources.get(item_def_id).unwrap_or(&0);
        if *available_qty < *required_qty {
            // Get item name for error message
            let item_name = item_def_table.id().find(item_def_id)
                .map(|def| def.name.clone())
                .unwrap_or_else(|| format!("Item #{}", item_def_id));
            return Err(format!(
                "Not enough {}. Have: {}, Need: {}",
                item_name, available_qty, required_qty
            ));
        }
    }

    // 6. Consume resources
    for (instance_id, qty_to_consume) in items_to_consume {
        if let Some(mut item) = inventory_table.instance_id().find(&instance_id) {
            if item.quantity <= qty_to_consume {
                // Delete the entire stack
                inventory_table.instance_id().delete(&instance_id);
            } else {
                // Reduce quantity
                item.quantity -= qty_to_consume;
                inventory_table.instance_id().update(item);
            }
        }
    }

    // 7. Get output item definition
    let output_def = item_def_table.iter()
        .find(|def| def.name == recipe.output_item_name)
        .ok_or(format!("Output item '{}' not found.", recipe.output_item_name))?;

    // 8. Calculate finish time with crafting speed bonuses
    let base_crafting_time_secs = recipe.crafting_time_secs;
    let mut crafting_time_secs = base_crafting_time_secs;

    // Apply Red Rune Stone production boost (2x speed = half time)
    if crate::active_effects::player_has_production_rune_effect(ctx, sender_id) {
        crafting_time_secs = (crafting_time_secs as f32 / 2.0).ceil() as u32;
    }

    // Apply Memory Grid crafting speed bonuses
    // get_crafting_speed_multiplier returns a multiplier (1.0 = no change, 0.5 = 2x speed)
    let grid_crafting_multiplier = crate::memory_grid::get_crafting_speed_multiplier(ctx, sender_id);
    if grid_crafting_multiplier < 1.0 && grid_crafting_multiplier > 0.0 {
        crafting_time_secs = (crafting_time_secs as f32 * grid_crafting_multiplier).ceil() as u32;
    }

    // Minimum crafting time of 1 second
    crafting_time_secs = std::cmp::max(1, crafting_time_secs);

    // Find the latest finish time in the player's queue
    let mut latest_finish_time = ctx.timestamp;
    for queue_item in queue_table.iter() {
        if queue_item.player_identity == sender_id && queue_item.finish_time > latest_finish_time {
            latest_finish_time = queue_item.finish_time;
        }
    }

    // Calculate this item's finish time
    let crafting_duration = TimeDuration::from(Duration::from_secs(crafting_time_secs as u64));
    let finish_time = latest_finish_time + crafting_duration;

    // 9. Add to crafting queue
    let queue_item = CraftingQueueItem {
        queue_item_id: 0, // Auto-increment
        player_identity: sender_id,
        recipe_id: 0, // Use 0 to indicate bone carving (no Recipe table entry)
        output_item_def_id: output_def.id,
        output_quantity: recipe.output_quantity,
        start_time: ctx.timestamp,
        finish_time,
    };

    queue_table.insert(queue_item);

    log::info!(
        "Player {} started bone carving: {} (finishes in {}s)",
        sender_id,
        recipe.output_item_name,
        crafting_time_secs
    );

    Ok(())
}

/// Scheduled reducer to respawn the Bone Carving Kit at the Whale Bone Graveyard
#[spacetimedb::reducer]
pub fn respawn_bone_carving_kit(ctx: &ReducerContext, _args: BoneCarvingKitRespawn) -> Result<(), String> {
    // Only allow the scheduler to call this
    if ctx.sender() != ctx.identity() {
        return Err("Bone carving kit respawn can only be triggered by scheduler.".to_string());
    }

    // Spawn the kit at the whale bone graveyard
    crate::whale_bone_graveyard::spawn_bone_carving_kit(ctx)?;

    log::info!("Bone Carving Kit respawned at Whale Bone Graveyard");
    Ok(())
}

/// Schedule a bone carving kit respawn after the specified delay
pub fn schedule_kit_respawn(ctx: &ReducerContext, delay_secs: u64) {
    let respawn_table = ctx.db.bone_carving_kit_respawn();
    
    let delay = TimeDuration::from(Duration::from_secs(delay_secs));
    let respawn_time = ctx.timestamp + delay;
    
    respawn_table.insert(BoneCarvingKitRespawn {
        id: 0, // Auto-increment
        scheduled_at: ScheduleAt::Time(respawn_time),
    });

    log::info!("Scheduled Bone Carving Kit respawn in {} seconds", delay_secs);
}
