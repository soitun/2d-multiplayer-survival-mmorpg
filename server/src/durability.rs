/******************************************************************************
 *                                                                            *
 * Durability System Module                                                   *
 * Handles item durability for weapons, tools, torches, and food.            *
 * Items lose durability on successful hits (weapons/tools) or over time      *
 * (torches while lit, food spoilage). Items become unusable at 0 durability.  *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{Identity, ReducerContext, Table, Timestamp};
use log;
use serde_json;

use crate::items::{InventoryItem, ItemDefinition, ItemCategory};
use crate::items::inventory_item as InventoryItemTableTrait;
use crate::items::item_definition as ItemDefinitionTableTrait;
use crate::active_equipment::active_equipment as ActiveEquipmentTableTrait;
use crate::player;

// --- Constants ---

/// Maximum durability for all items (100%)
pub const MAX_DURABILITY: f32 = 100.0;

/// Durability lost per successful hit
/// 0.2 per hit = 500 hits before breaking (from 100 durability)
/// This allows gathering ~3,800+ wood with a stone hatchet before it breaks
pub const DURABILITY_LOSS_PER_HIT: f32 = 0.2;

/// Torch durability tick interval in seconds (check every 5 seconds)
pub const TORCH_DURABILITY_TICK_INTERVAL_SECS: u64 = 5;

/// Total torch duration in seconds (15 minutes = 900 seconds)
pub const TORCH_TOTAL_DURATION_SECS: f32 = 900.0;

/// Durability lost per torch tick
/// With 5-second ticks over 900 seconds = 180 ticks
/// 100 durability / 180 ticks ≈ 0.556 per tick
pub const TORCH_DURABILITY_LOSS_PER_TICK: f32 = MAX_DURABILITY / (TORCH_TOTAL_DURATION_SECS / TORCH_DURABILITY_TICK_INTERVAL_SECS as f32);

/// Total flashlight duration in seconds (30 minutes = 1800 seconds - longer than torch)
pub const FLASHLIGHT_TOTAL_DURATION_SECS: f32 = 1800.0;

/// Durability lost per flashlight tick
/// With 5-second ticks over 1800 seconds = 360 ticks
/// 100 durability / 360 ticks ≈ 0.278 per tick
pub const FLASHLIGHT_DURABILITY_LOSS_PER_TICK: f32 = MAX_DURABILITY / (FLASHLIGHT_TOTAL_DURATION_SECS / TORCH_DURABILITY_TICK_INTERVAL_SECS as f32);

/// Food spoilage tick interval in seconds (check every 5 minutes = 300 seconds)
/// Longer interval than torches since food spoils much slower
pub const FOOD_SPOILAGE_TICK_INTERVAL_SECS: u64 = 300;

/// Minimum food spoilage duration in hours (6 hours = 21600 seconds)
pub const FOOD_MIN_SPOILAGE_HOURS: f32 = 6.0;
/// Maximum food spoilage duration in hours (48 hours = 172800 seconds)
pub const FOOD_MAX_SPOILAGE_HOURS: f32 = 48.0;

// --- Schedule Table for Torch Durability ---

/// Schedule table for torch durability reduction
#[spacetimedb::table(name = torch_durability_schedule, scheduled(process_torch_durability))]
#[derive(Clone, Debug)]
pub struct TorchDurabilitySchedule {
    #[primary_key]
    #[auto_inc]
    pub schedule_id: u64,
    pub scheduled_at: spacetimedb::ScheduleAt,
}

/// Schedule table for food spoilage
#[spacetimedb::table(name = food_spoilage_schedule, scheduled(process_food_spoilage))]
#[derive(Clone, Debug)]
pub struct FoodSpoilageSchedule {
    #[primary_key]
    #[auto_inc]
    pub schedule_id: u64,
    pub scheduled_at: spacetimedb::ScheduleAt,
}

// --- Helper Functions ---

/// Gets the current durability from an item's item_data JSON field
/// Returns None if no durability data exists (item hasn't been used yet)
pub fn get_durability(item: &InventoryItem) -> Option<f32> {
    item.item_data.as_ref().and_then(|data| {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
            parsed.get("durability").and_then(|v| v.as_f64()).map(|v| v as f32)
        } else {
            None
        }
    })
}

/// Sets the durability value in an item's item_data JSON field
/// Preserves any existing data (like water_liters) while updating durability
pub fn set_durability(item: &mut InventoryItem, durability: f32) {
    let new_durability = durability.max(0.0).min(MAX_DURABILITY);
    
    // Parse existing data or create new object
    let mut json_obj = if let Some(ref data) = item.item_data {
        serde_json::from_str::<serde_json::Value>(data)
            .unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    
    // Ensure it's an object
    if !json_obj.is_object() {
        json_obj = serde_json::json!({});
    }
    
    // Update durability
    json_obj["durability"] = serde_json::json!(new_durability);
    
    // Serialize back
    item.item_data = Some(json_obj.to_string());
}

/// Merges food item durability using weighted average when stacking food items
/// Calculates: (source_qty * source_durability + target_qty * target_durability) / (source_qty + target_qty)
/// Preserves other item_data fields (like water_liters) from the target item
pub fn merge_food_durability(
    target_item: &mut InventoryItem,
    source_item: &InventoryItem,
    source_qty: u32,
    target_qty: u32,
) {
    // Get durabilities (default to MAX_DURABILITY if not set)
    let source_durability = get_durability(source_item).unwrap_or(MAX_DURABILITY);
    let target_durability = get_durability(target_item).unwrap_or(MAX_DURABILITY);
    
    // Calculate weighted average
    let total_qty = source_qty + target_qty;
    if total_qty > 0 {
        let weighted_avg = (source_qty as f32 * source_durability + target_qty as f32 * target_durability) 
                          / total_qty as f32;
        
        // Update target item's durability
        set_durability(target_item, weighted_avg);
        
        log::debug!(
            "[FoodMerge] Merged food durability: {} (qty {}) @ {:.1}% + {} (qty {}) @ {:.1}% = {:.1}% (qty {})",
            source_item.instance_id, source_qty, source_durability,
            target_item.instance_id, target_qty, target_durability,
            weighted_avg, total_qty
        );
    }
}

/// Checks if an item definition supports the durability system
/// Returns true for weapons, tools, ranged weapons, torches/flashlights, and food items
pub fn has_durability_system(item_def: &ItemDefinition) -> bool {
    match item_def.category {
        ItemCategory::Weapon | ItemCategory::Tool | ItemCategory::RangedWeapon => true,
        ItemCategory::Consumable => {
            // Food items have durability (spoilage)
            is_food_item(item_def)
        },
        _ => {
            // Also check for special items by name
            item_def.name == "Torch" || item_def.name == "Flashlight"
        }
    }
}

/// Checks if an item is a food item (can spoil)
/// Returns true if the item has consumable stats (hunger/thirst/health gain)
/// This makes the system smart - it doesn't hardcode food names
pub fn is_food_item(item_def: &ItemDefinition) -> bool {
    // Food items have consumable stats (hunger or thirst)
    // This excludes non-food consumables like bandages, anti-venom, etc. that only have health gain
    // Items with hunger/thirst are food, regardless of health gain
    item_def.consumable_hunger_satiated.is_some() || 
    item_def.consumable_thirst_quenched.is_some()
}

/// Calculates the spoilage duration in hours for a food item based on its properties
/// Returns a value between FOOD_MIN_SPOILAGE_HOURS and FOOD_MAX_SPOILAGE_HOURS
/// Smart calculation based on item properties:
/// - Cooked foods last longer (2x multiplier)
/// - Foods with higher nutrition value last slightly longer
/// - Raw/perishable foods spoil faster
pub fn calculate_food_spoilage_hours(item_def: &ItemDefinition) -> f32 {
    let mut base_hours = 12.0; // Base 12 hours
    
    // Check if food is cooked (has cooked_item_def_name or name suggests cooking)
    let is_cooked = item_def.cooked_item_def_name.is_some() ||
                     item_def.name.starts_with("Cooked") ||
                     item_def.name.starts_with("Roasted") ||
                     item_def.name.starts_with("Toasted") ||
                     item_def.name.contains("Stew") ||
                     item_def.name.contains("Soup");
    
    if is_cooked {
        // Cooked foods last 2x longer (preservation through cooking)
        base_hours *= 2.0;
    }
    
    // Check if food is raw/perishable (name suggests raw or fresh)
    let is_raw = item_def.name.starts_with("Raw") ||
                  item_def.name.contains("Fresh");
    
    if is_raw {
        // Raw foods spoil faster (0.7x multiplier)
        base_hours *= 0.7;
    }
    
    // Adjust based on nutrition value (more nutritious = slightly longer shelf life)
    let nutrition_value = item_def.consumable_hunger_satiated.unwrap_or(0.0) +
                         item_def.consumable_thirst_quenched.unwrap_or(0.0) +
                         item_def.consumable_health_gain.unwrap_or(0.0);
    
    // Nutrition bonus: +0.1 hours per 10 nutrition points (max +2 hours)
    let nutrition_bonus = (nutrition_value / 10.0 * 0.1).min(2.0);
    base_hours += nutrition_bonus;
    
    // Clamp to min/max range
    base_hours.max(FOOD_MIN_SPOILAGE_HOURS).min(FOOD_MAX_SPOILAGE_HOURS)
}

/// Calculates durability loss per tick for a food item
/// Based on the food's spoilage duration
pub fn calculate_food_spoilage_loss_per_tick(item_def: &ItemDefinition) -> f32 {
    let spoilage_hours = calculate_food_spoilage_hours(item_def);
    let spoilage_seconds = spoilage_hours * 3600.0;
    let num_ticks = spoilage_seconds / FOOD_SPOILAGE_TICK_INTERVAL_SECS as f32;
    
    if num_ticks <= 0.0 {
        // Fallback: spoil in minimum time
        MAX_DURABILITY / (FOOD_MIN_SPOILAGE_HOURS * 3600.0 / FOOD_SPOILAGE_TICK_INTERVAL_SECS as f32)
    } else {
        MAX_DURABILITY / num_ticks
    }
}

/// Checks if an item is broken (durability <= 0)
/// Returns false if the item has no durability data (treated as full durability)
pub fn is_item_broken(item: &InventoryItem) -> bool {
    get_durability(item).map(|d| d <= 0.0).unwrap_or(false)
}

/// Gets durability percentage (0.0 to 1.0)
/// Returns 1.0 if no durability data exists (full durability)
pub fn get_durability_percentage(item: &InventoryItem) -> f32 {
    get_durability(item).map(|d| d / MAX_DURABILITY).unwrap_or(1.0)
}

/// Initializes durability for an item if it doesn't have any
/// Called when an item is first used
pub fn ensure_durability_initialized(item: &mut InventoryItem) {
    if get_durability(item).is_none() {
        set_durability(item, MAX_DURABILITY);
    }
}

/// Initializes durability for a food item when it's first created
/// Should be called when food items are created (harvested, cooked, etc.)
pub fn ensure_food_durability_initialized(
    ctx: &ReducerContext,
    item: &mut InventoryItem,
    item_def: &ItemDefinition,
) {
    // Only initialize if it's a food item and doesn't have durability yet
    if is_food_item(item_def) && get_durability(item).is_none() {
        set_durability(item, MAX_DURABILITY);
        log::debug!("[FoodSpoilage] Initialized durability for food item '{}' (instance {})", 
            item_def.name, item.instance_id);
    }
}

/// Reduces durability on an item after a successful hit
/// Returns Ok(true) if the item broke (durability hit 0), Ok(false) otherwise
pub fn reduce_durability_on_hit(
    ctx: &ReducerContext,
    item_instance_id: u64,
) -> Result<bool, String> {
    let inventory_items = ctx.db.inventory_item();
    
    let mut item = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item instance {} not found", item_instance_id))?;
    
    // Initialize durability if not set
    ensure_durability_initialized(&mut item);
    
    // Get current durability
    let current_durability = get_durability(&item).unwrap_or(MAX_DURABILITY);
    let new_durability = (current_durability - DURABILITY_LOSS_PER_HIT).max(0.0);
    
    // Update durability
    set_durability(&mut item, new_durability);
    inventory_items.instance_id().update(item.clone());
    
    let item_broke = new_durability <= 0.0;
    
    if item_broke {
        log::info!("[Durability] Item {} broke! Durability reduced from {:.1} to {:.1}", 
            item_instance_id, current_durability, new_durability);
    } else {
        log::debug!("[Durability] Item {} durability reduced from {:.1} to {:.1}", 
            item_instance_id, current_durability, new_durability);
    }
    
    Ok(item_broke)
}

/// Reduces torch durability (called by scheduler)
/// Returns Ok(true) if the torch burned out
fn reduce_torch_durability(
    ctx: &ReducerContext,
    item_instance_id: u64,
) -> Result<bool, String> {
    let inventory_items = ctx.db.inventory_item();
    
    let mut item = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Torch item {} not found", item_instance_id))?;
    
    // Initialize durability if not set
    ensure_durability_initialized(&mut item);
    
    // Get current durability
    let current_durability = get_durability(&item).unwrap_or(MAX_DURABILITY);
    let new_durability = (current_durability - TORCH_DURABILITY_LOSS_PER_TICK).max(0.0);
    
    // Update durability
    set_durability(&mut item, new_durability);
    inventory_items.instance_id().update(item);
    
    let torch_burned_out = new_durability <= 0.0;
    
    if torch_burned_out {
        log::info!("[Durability] Torch {} burned out! Durability depleted.", item_instance_id);
    } else {
        log::debug!("[Durability] Torch {} durability: {:.1} -> {:.1}", 
            item_instance_id, current_durability, new_durability);
    }
    
    Ok(torch_burned_out)
}

// --- Initialization ---

/// Initializes the torch durability schedule
/// Called from init_module in lib.rs
pub fn init_torch_durability_schedule(ctx: &ReducerContext) -> Result<(), String> {
    use spacetimedb::spacetimedb_lib::ScheduleAt;
    use spacetimedb::TimeDuration;
    
    let schedule_table = ctx.db.torch_durability_schedule();
    
    // Check if schedule already exists
    if schedule_table.iter().count() > 0 {
        log::debug!("Torch durability schedule already initialized.");
        return Ok(());
    }
    
    log::info!("Initializing torch durability schedule (runs every {} seconds)...", 
        TORCH_DURABILITY_TICK_INTERVAL_SECS);
    
    // Create schedule that runs every 5 seconds
    let interval = TimeDuration::from_micros((TORCH_DURABILITY_TICK_INTERVAL_SECS * 1_000_000) as i64);
    let schedule = TorchDurabilitySchedule {
        schedule_id: 0, // Auto-increment
        scheduled_at: ScheduleAt::Interval(interval),
    };
    
    crate::try_insert_schedule!(
        schedule_table,
        schedule.clone(),
        "Torch durability"
    );
    
    Ok(())
}

/// Initializes the food spoilage schedule
/// Called from init_module in lib.rs
pub fn init_food_spoilage_schedule(ctx: &ReducerContext) -> Result<(), String> {
    use spacetimedb::spacetimedb_lib::ScheduleAt;
    use spacetimedb::TimeDuration;
    
    let schedule_table = ctx.db.food_spoilage_schedule();
    
    // Check if schedule already exists
    if schedule_table.iter().count() > 0 {
        log::debug!("Food spoilage schedule already initialized.");
        return Ok(());
    }
    
    log::info!("Initializing food spoilage schedule (runs every {} seconds)...", 
        FOOD_SPOILAGE_TICK_INTERVAL_SECS);
    
    // Create schedule that runs every 5 minutes
    let interval = TimeDuration::from_micros((FOOD_SPOILAGE_TICK_INTERVAL_SECS * 1_000_000) as i64);
    let schedule = FoodSpoilageSchedule {
        schedule_id: 0, // Auto-increment
        scheduled_at: ScheduleAt::Interval(interval),
    };
    
    crate::try_insert_schedule!(
        schedule_table,
        schedule.clone(),
        "Food spoilage"
    );
    
    Ok(())
}

// --- Scheduled Reducer ---

/// Reduces flashlight durability (called by scheduler)
/// Returns Ok(true) if the flashlight ran out of battery
fn reduce_flashlight_durability(
    ctx: &ReducerContext,
    item_instance_id: u64,
) -> Result<bool, String> {
    let inventory_items = ctx.db.inventory_item();
    
    let mut item = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Flashlight item {} not found", item_instance_id))?;
    
    // Initialize durability if not set
    ensure_durability_initialized(&mut item);
    
    // Get current durability
    let current_durability = get_durability(&item).unwrap_or(MAX_DURABILITY);
    let new_durability = (current_durability - FLASHLIGHT_DURABILITY_LOSS_PER_TICK).max(0.0);
    
    // Update durability
    set_durability(&mut item, new_durability);
    inventory_items.instance_id().update(item);
    
    let battery_dead = new_durability <= 0.0;
    
    if battery_dead {
        log::info!("[Durability] Flashlight {} battery died! Durability depleted.", item_instance_id);
    } else {
        log::debug!("[Durability] Flashlight {} durability: {:.1} -> {:.1}", 
            item_instance_id, current_durability, new_durability);
    }
    
    Ok(battery_dead)
}

/// Scheduled reducer that processes torch and flashlight durability for all players
/// Runs every 5 seconds, checks for lit torches/flashlights, reduces their durability
#[spacetimedb::reducer]
pub fn process_torch_durability(ctx: &ReducerContext, _args: TorchDurabilitySchedule) -> Result<(), String> {
    // Security check - only allow scheduler to run this
    if ctx.sender != ctx.identity() {
        return Err("Torch durability processing can only be run by scheduler".to_string());
    }
    
    let players_table = ctx.db.player();
    let active_equipments = ctx.db.active_equipment();
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    
    let mut torch_processed_count = 0;
    let mut torch_burned_out_count = 0;
    let mut flashlight_processed_count = 0;
    let mut flashlight_dead_count = 0;
    
    // === PROCESS TORCHES ===
    // Collect players with lit torches to process
    let torch_players: Vec<_> = players_table.iter()
        .filter(|p| p.is_torch_lit && !p.is_dead && !p.is_knocked_out)
        .collect();
    
    for player in torch_players {
        // Get player's active equipment
        let equipment = match active_equipments.player_identity().find(&player.identity) {
            Some(eq) => eq,
            None => continue,
        };
        
        // Check if player has something equipped
        let equipped_instance_id = match equipment.equipped_item_instance_id {
            Some(id) => id,
            None => {
                // Player has torch lit but nothing equipped - turn off torch
                log::warn!("[TorchDurability] Player {:?} has is_torch_lit=true but nothing equipped, turning off torch", 
                    player.identity);
                if let Some(mut p) = players_table.identity().find(&player.identity) {
                    p.is_torch_lit = false;
                    p.last_update = ctx.timestamp;
                    players_table.identity().update(p);
                }
                continue;
            }
        };
        
        // Get the equipped item
        let equipped_item = match inventory_items.instance_id().find(equipped_instance_id) {
            Some(item) => item,
            None => continue,
        };
        
        // Get item definition
        let item_def = match item_defs.id().find(equipped_item.item_def_id) {
            Some(def) => def,
            None => continue,
        };
        
        // Only process if the equipped item is actually a torch
        if item_def.name != "Torch" {
            // Player has torch lit but is holding something else - turn off torch
            log::debug!("[TorchDurability] Player {:?} has is_torch_lit=true but is holding '{}', turning off torch", 
                player.identity, item_def.name);
            if let Some(mut p) = players_table.identity().find(&player.identity) {
                p.is_torch_lit = false;
                p.last_update = ctx.timestamp;
                players_table.identity().update(p);
            }
            continue;
        }
        
        // Reduce torch durability
        match reduce_torch_durability(ctx, equipped_instance_id) {
            Ok(burned_out) => {
                torch_processed_count += 1;
                
                if burned_out {
                    torch_burned_out_count += 1;
                    
                    // Extinguish the torch
                    if let Some(mut p) = players_table.identity().find(&player.identity) {
                        p.is_torch_lit = false;
                        p.last_update = ctx.timestamp;
                        players_table.identity().update(p);
                        log::info!("[TorchDurability] Player {:?}'s torch burned out and was extinguished", 
                            player.identity);
                    }
                }
            }
            Err(e) => {
                log::error!("[TorchDurability] Error reducing durability for torch {}: {}", 
                    equipped_instance_id, e);
            }
        }
    }
    
    // === PROCESS FLASHLIGHTS ===
    // Collect players with flashlights on to process
    let flashlight_players: Vec<_> = players_table.iter()
        .filter(|p| p.is_flashlight_on && !p.is_dead && !p.is_knocked_out)
        .collect();
    
    for player in flashlight_players {
        // Get player's active equipment
        let equipment = match active_equipments.player_identity().find(&player.identity) {
            Some(eq) => eq,
            None => continue,
        };
        
        // Check if player has something equipped
        let equipped_instance_id = match equipment.equipped_item_instance_id {
            Some(id) => id,
            None => {
                // Player has flashlight on but nothing equipped - turn off flashlight
                log::warn!("[FlashlightDurability] Player {:?} has is_flashlight_on=true but nothing equipped, turning off", 
                    player.identity);
                if let Some(mut p) = players_table.identity().find(&player.identity) {
                    p.is_flashlight_on = false;
                    p.last_update = ctx.timestamp;
                    players_table.identity().update(p);
                }
                continue;
            }
        };
        
        // Get the equipped item
        let equipped_item = match inventory_items.instance_id().find(equipped_instance_id) {
            Some(item) => item,
            None => continue,
        };
        
        // Get item definition
        let item_def = match item_defs.id().find(equipped_item.item_def_id) {
            Some(def) => def,
            None => continue,
        };
        
        // Only process if the equipped item is actually a flashlight
        if item_def.name != "Flashlight" {
            // Player has flashlight on but is holding something else - turn off flashlight
            log::debug!("[FlashlightDurability] Player {:?} has is_flashlight_on=true but is holding '{}', turning off", 
                player.identity, item_def.name);
            if let Some(mut p) = players_table.identity().find(&player.identity) {
                p.is_flashlight_on = false;
                p.last_update = ctx.timestamp;
                players_table.identity().update(p);
            }
            continue;
        }
        
        // Reduce flashlight durability
        match reduce_flashlight_durability(ctx, equipped_instance_id) {
            Ok(battery_dead) => {
                flashlight_processed_count += 1;
                
                if battery_dead {
                    flashlight_dead_count += 1;
                    
                    // Turn off the flashlight
                    if let Some(mut p) = players_table.identity().find(&player.identity) {
                        p.is_flashlight_on = false;
                        p.last_update = ctx.timestamp;
                        players_table.identity().update(p);
                        log::info!("[FlashlightDurability] Player {:?}'s flashlight battery died and was turned off", 
                            player.identity);
                    }
                }
            }
            Err(e) => {
                log::error!("[FlashlightDurability] Error reducing durability for flashlight {}: {}", 
                    equipped_instance_id, e);
            }
        }
    }
    
    if torch_processed_count > 0 || torch_burned_out_count > 0 || flashlight_processed_count > 0 || flashlight_dead_count > 0 {
        log::debug!("[LightDurability] Processed {} torches ({} burned out), {} flashlights ({} battery dead)", 
            torch_processed_count, torch_burned_out_count, flashlight_processed_count, flashlight_dead_count);
    }
    
    Ok(())
}

/// Checks if an item is stored in a refrigerator (skips spoilage)
fn is_item_in_refrigerator(ctx: &ReducerContext, item: &InventoryItem) -> bool {
    use crate::models::{ItemLocation, ContainerType};
    use crate::wooden_storage_box::{wooden_storage_box as WoodenStorageBoxTableTrait, BOX_TYPE_REFRIGERATOR};
    
    // Check if item is in a container
    if let ItemLocation::Container(container_data) = &item.location {
        // Check if it's a WoodenStorageBox container
        if container_data.container_type == ContainerType::WoodenStorageBox {
            // Look up the box to check if it's a refrigerator
            let boxes = ctx.db.wooden_storage_box();
            if let Some(storage_box) = boxes.id().find(container_data.container_id as u32) {
                return storage_box.box_type == BOX_TYPE_REFRIGERATOR;
            }
        }
    }
    false
}

/// Scheduled reducer that processes food spoilage for all food items
/// Runs every 5 minutes, reduces durability of all food items
/// Items stored in refrigerators are protected from spoilage
#[spacetimedb::reducer]
pub fn process_food_spoilage(ctx: &ReducerContext, _args: FoodSpoilageSchedule) -> Result<(), String> {
    // Security check - only allow scheduler to run this
    if ctx.sender != ctx.identity() {
        return Err("Food spoilage processing can only be run by scheduler".to_string());
    }
    
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    
    let mut food_processed_count = 0;
    let mut food_spoiled_count = 0;
    let mut food_refrigerated_count = 0;
    
    // Process all food items in inventory/hotbar
    for item in inventory_items.iter() {
        // Get item definition
        let item_def = match item_defs.id().find(item.item_def_id) {
            Some(def) => def,
            None => continue,
        };
        
        // Only process food items
        if !is_food_item(&item_def) {
            continue;
        }
        
        // Skip items stored in refrigerators - they don't spoil!
        if is_item_in_refrigerator(ctx, &item) {
            food_refrigerated_count += 1;
            continue;
        }
        
        // Skip items that don't have durability initialized yet (they're fresh)
        let current_durability = match get_durability(&item) {
            Some(d) => d,
            None => {
                // Initialize durability for this food item
                let mut item_to_init = item.clone();
                ensure_food_durability_initialized(ctx, &mut item_to_init, &item_def);
                inventory_items.instance_id().update(item_to_init);
                continue; // Skip this tick, will process next time
            }
        };
        
        // Skip if already spoiled
        if current_durability <= 0.0 {
            continue;
        }
        
        // Calculate spoilage loss for this food type
        let spoilage_loss = calculate_food_spoilage_loss_per_tick(&item_def);
        let new_durability = (current_durability - spoilage_loss).max(0.0);
        
        // Update durability
        let mut item_to_update = item.clone();
        set_durability(&mut item_to_update, new_durability);
        inventory_items.instance_id().update(item_to_update);
        
        food_processed_count += 1;
        
        if new_durability <= 0.0 {
            food_spoiled_count += 1;
            log::info!("[FoodSpoilage] Food item '{}' (instance {}) has spoiled!", 
                item_def.name, item.instance_id);
        } else {
            log::debug!("[FoodSpoilage] Food item '{}' (instance {}) durability: {:.1} -> {:.1}", 
                item_def.name, item.instance_id, current_durability, new_durability);
        }
    }
    
    if food_processed_count > 0 || food_spoiled_count > 0 || food_refrigerated_count > 0 {
        log::debug!("[FoodSpoilage] Processed {} food items ({} spoiled, {} refrigerated/protected)", 
            food_processed_count, food_spoiled_count, food_refrigerated_count);
    }
    
    Ok(())
}
