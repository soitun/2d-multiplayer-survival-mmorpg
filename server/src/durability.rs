/******************************************************************************
 *                                                                            *
 * Durability System Module                                                   *
 * Handles item durability for weapons, tools, and torches.                   *
 * Items lose durability on successful hits (weapons/tools) or over time      *
 * (torches while lit). Items become unusable at 0 durability.                *
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

/// Checks if an item definition supports the durability system
/// Returns true for weapons, tools, ranged weapons, and torches/flashlights
pub fn has_durability_system(item_def: &ItemDefinition) -> bool {
    match item_def.category {
        ItemCategory::Weapon | ItemCategory::Tool | ItemCategory::RangedWeapon => true,
        _ => {
            // Also check for special items by name
            item_def.name == "Torch" || item_def.name == "Flashlight"
        }
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
