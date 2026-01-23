//! # Military Ration Loot Crates
//! 
//! This module handles military ration containers that spawn as loot crates
//! in various locations (roads, monuments, quarries). They contain 3 slots
//! and typically spawn with 1-2 food items (up to 3, never 0), with small
//! stacks (1-2 max per item, mostly 1).

use spacetimedb::{ReducerContext, SpacetimeType, Table, Timestamp, Identity, TimeDuration};
use spacetimedb::spacetimedb_lib::ScheduleAt;
use log;
use rand::Rng;

use crate::wooden_storage_box::{
    WoodenStorageBox, BOX_TYPE_MILITARY_RATION, NUM_MILITARY_RATION_SLOTS,
    MILITARY_RATION_INITIAL_HEALTH, MILITARY_RATION_MAX_HEALTH,
    wooden_storage_box as WoodenStorageBoxTableTrait,
};
use crate::items::{
    InventoryItem, item_definition as ItemDefinitionTableTrait,
    inventory_item as InventoryItemTableTrait,
};
use crate::environment::calculate_chunk_index;
use crate::models::ItemLocation;
use crate::inventory_management::is_container_empty;

// --- Respawn Schedule Table ---

#[spacetimedb::table(name = military_ration_respawn_schedule, scheduled(respawn_military_rations))]
#[derive(Clone)]
pub struct MilitaryRationRespawnSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
    pub spawn_location_type: String,  // "road", "shipwreck", "quarry"
    pub pos_x: f32,
    pub pos_y: f32,
    pub chunk_index: u32,
}

// --- Loot Table Structure ---

#[derive(SpacetimeType, Clone, Debug)]
pub struct MilitaryRationLootEntry {
    pub item_def_name: String,  // Food item name
    pub min_quantity: u32,
    pub max_quantity: u32,
    pub spawn_chance: f32,      // 0.0 to 1.0
}

// --- Food Loot Table ---

/// Returns the loot table for military rations
/// Common foods have high spawn chance, uncommon have medium chance
fn get_military_ration_loot_table() -> Vec<MilitaryRationLootEntry> {
    vec![
        // Common foods (high chance)
        MilitaryRationLootEntry {
            item_def_name: "Cooked Potato".to_string(),
            min_quantity: 1,
            max_quantity: 2,
            spawn_chance: 0.35, // 35% chance
        },
        MilitaryRationLootEntry {
            item_def_name: "Cooked Carrot".to_string(),
            min_quantity: 1,
            max_quantity: 2,
            spawn_chance: 0.30, // 30% chance
        },
        MilitaryRationLootEntry {
            item_def_name: "Cooked Corn".to_string(),
            min_quantity: 1,
            max_quantity: 2,
            spawn_chance: 0.30, // 30% chance
        },
        // Uncommon foods (medium chance)
        MilitaryRationLootEntry {
            item_def_name: "Cooked Pumpkin".to_string(),
            min_quantity: 1,
            max_quantity: 1,
            spawn_chance: 0.15, // 15% chance
        },
        MilitaryRationLootEntry {
            item_def_name: "Cooked Beet".to_string(),
            min_quantity: 1,
            max_quantity: 1,
            spawn_chance: 0.12, // 12% chance
        },
    ]
}

// --- Spawn Function ---

/// Spawns a military ration container with loot at the specified position
/// Returns the box ID on success
pub fn spawn_military_ration_with_loot(
    ctx: &ReducerContext,
    pos_x: f32,
    pos_y: f32,
    chunk_index: u32,
) -> Result<u32, String> {
    let loot_table = get_military_ration_loot_table();
    let item_defs = ctx.db.item_definition();
    let inventory_items = ctx.db.inventory_item();
    let boxes = ctx.db.wooden_storage_box();
    
    // Determine how many items to spawn (typically 1-2, up to 3, never 0)
    // Distribution: ~60% chance for 1 item, ~35% chance for 2 items, ~5% chance for 3 items
    let item_count = {
        let roll: f32 = ctx.rng().gen();
        if roll < 0.60 {
            1 // 60% chance
        } else if roll < 0.95 {
            2 // 35% chance
        } else {
            3 // 5% chance
        }
    };
    
    // Create the military ration container
    let mut ration = WoodenStorageBox {
        id: 0, // auto_inc
        pos_x,
        pos_y,
        chunk_index,
        placed_by: ctx.identity(), // System-placed
        box_type: BOX_TYPE_MILITARY_RATION,
        // Initialize all slots as empty
        slot_instance_id_0: None, slot_def_id_0: None,
        slot_instance_id_1: None, slot_def_id_1: None,
        slot_instance_id_2: None, slot_def_id_2: None,
        // Large box slots (unused for military rations)
        slot_instance_id_3: None, slot_def_id_3: None,
        slot_instance_id_4: None, slot_def_id_4: None,
        slot_instance_id_5: None, slot_def_id_5: None,
        slot_instance_id_6: None, slot_def_id_6: None,
        slot_instance_id_7: None, slot_def_id_7: None,
        slot_instance_id_8: None, slot_def_id_8: None,
        slot_instance_id_9: None, slot_def_id_9: None,
        slot_instance_id_10: None, slot_def_id_10: None,
        slot_instance_id_11: None, slot_def_id_11: None,
        slot_instance_id_12: None, slot_def_id_12: None,
        slot_instance_id_13: None, slot_def_id_13: None,
        slot_instance_id_14: None, slot_def_id_14: None,
        slot_instance_id_15: None, slot_def_id_15: None,
        slot_instance_id_16: None, slot_def_id_16: None,
        slot_instance_id_17: None, slot_def_id_17: None,
        slot_instance_id_18: None, slot_def_id_18: None,
        slot_instance_id_19: None, slot_def_id_19: None,
        slot_instance_id_20: None, slot_def_id_20: None,
        slot_instance_id_21: None, slot_def_id_21: None,
        slot_instance_id_22: None, slot_def_id_22: None,
        slot_instance_id_23: None, slot_def_id_23: None,
        slot_instance_id_24: None, slot_def_id_24: None,
        slot_instance_id_25: None, slot_def_id_25: None,
        slot_instance_id_26: None, slot_def_id_26: None,
        slot_instance_id_27: None, slot_def_id_27: None,
        slot_instance_id_28: None, slot_def_id_28: None,
        slot_instance_id_29: None, slot_def_id_29: None,
        slot_instance_id_30: None, slot_def_id_30: None,
        slot_instance_id_31: None, slot_def_id_31: None,
        slot_instance_id_32: None, slot_def_id_32: None,
        slot_instance_id_33: None, slot_def_id_33: None,
        slot_instance_id_34: None, slot_def_id_34: None,
        slot_instance_id_35: None, slot_def_id_35: None,
        slot_instance_id_36: None, slot_def_id_36: None,
        slot_instance_id_37: None, slot_def_id_37: None,
        slot_instance_id_38: None, slot_def_id_38: None,
        slot_instance_id_39: None, slot_def_id_39: None,
        slot_instance_id_40: None, slot_def_id_40: None,
        slot_instance_id_41: None, slot_def_id_41: None,
        slot_instance_id_42: None, slot_def_id_42: None,
        slot_instance_id_43: None, slot_def_id_43: None,
        slot_instance_id_44: None, slot_def_id_44: None,
        slot_instance_id_45: None, slot_def_id_45: None,
        slot_instance_id_46: None, slot_def_id_46: None,
        slot_instance_id_47: None, slot_def_id_47: None,
        health: MILITARY_RATION_INITIAL_HEALTH,
        max_health: MILITARY_RATION_MAX_HEALTH,
        is_destroyed: false,
        destroyed_at: None,
        last_hit_time: None,
        last_damaged_by: None,
        respawn_at: Timestamp::UNIX_EPOCH, // 0 = not respawning yet
        is_monument: false,
        active_user_id: None,
        active_user_since: None,
    };
    
    // Fill slots with loot - spawn exactly item_count items
    let mut slot_index = 0u8;
    let mut items_spawned = 0;
    
    // Spawn items one at a time until we reach item_count
    while items_spawned < item_count && slot_index < NUM_MILITARY_RATION_SLOTS as u8 {
        // Select a random loot entry weighted by spawn chance
        let mut selected_entry: Option<&MilitaryRationLootEntry> = None;
        let mut total_weight = 0.0;
        
        // Calculate total weight
        for entry in &loot_table {
            total_weight += entry.spawn_chance;
        }
        
        // Select entry based on weighted random
        let mut roll: f32 = ctx.rng().gen::<f32>() * total_weight;
        for entry in &loot_table {
            roll -= entry.spawn_chance;
            if roll <= 0.0 {
                selected_entry = Some(entry);
                break;
            }
        }
        
        // Fallback to first entry if none selected (shouldn't happen, but safety)
        let loot_entry = selected_entry.unwrap_or(&loot_table[0]);
        
        // Find the item definition
        let item_def = item_defs.iter()
            .find(|def| def.name == loot_entry.item_def_name)
            .ok_or_else(|| format!("Item definition not found: {}", loot_entry.item_def_name))?;
        
        // Determine quantity (mostly 1, occasionally 2)
        let quantity = {
            let qty_roll: f32 = ctx.rng().gen();
            if qty_roll < 0.75 {
                loot_entry.min_quantity // 75% chance for min (usually 1)
            } else {
                loot_entry.max_quantity.min(2) // 25% chance for max, capped at 2
            }
        };
        
        // Create inventory item
        let new_item = InventoryItem {
            instance_id: 0, // Will be assigned by insert
            item_def_id: item_def.id,
            quantity,
            location: ItemLocation::Container(crate::models::ContainerLocationData {
                container_type: crate::models::ContainerType::WoodenStorageBox,
                container_id: 0, // Will be updated after box is inserted
                slot_index,
            }),
            item_data: None,
        };
        
        let inserted_item = inventory_items.insert(new_item);
        
        // Update ration slot
        match slot_index {
            0 => {
                ration.slot_instance_id_0 = Some(inserted_item.instance_id);
                ration.slot_def_id_0 = Some(inserted_item.item_def_id);
            }
            1 => {
                ration.slot_instance_id_1 = Some(inserted_item.instance_id);
                ration.slot_def_id_1 = Some(inserted_item.item_def_id);
            }
            2 => {
                ration.slot_instance_id_2 = Some(inserted_item.instance_id);
                ration.slot_def_id_2 = Some(inserted_item.item_def_id);
            }
            _ => return Err("Invalid slot index".to_string()),
        }
        
        slot_index += 1;
        items_spawned += 1;
    }
    
    // Ensure we spawned at least 1 item (safety check)
    if items_spawned == 0 {
        // Force spawn at least one item
        let loot_entry = &loot_table[0]; // Use first entry (Cooked Potato)
        let item_def = item_defs.iter()
            .find(|def| def.name == loot_entry.item_def_name)
            .ok_or_else(|| format!("Item definition not found: {}", loot_entry.item_def_name))?;
        
        let quantity = loot_entry.min_quantity; // Usually 1
        
        let new_item = InventoryItem {
            instance_id: 0,
            item_def_id: item_def.id,
            quantity,
            location: ItemLocation::Container(crate::models::ContainerLocationData {
                container_type: crate::models::ContainerType::WoodenStorageBox,
                container_id: 0,
                slot_index: 0,
            }),
            item_data: None,
        };
        
        let inserted_item = inventory_items.insert(new_item);
        ration.slot_instance_id_0 = Some(inserted_item.instance_id);
        ration.slot_def_id_0 = Some(inserted_item.item_def_id);
        items_spawned = 1;
    }
    
    // Insert the ration box
    let inserted_ration = boxes.insert(ration);
    
    // Update item locations with actual container ID
    if let Some(item_id) = inserted_ration.slot_instance_id_0 {
        if let Some(mut item) = inventory_items.instance_id().find(&item_id) {
            if let ItemLocation::Container(ref mut loc_data) = item.location {
                loc_data.container_id = inserted_ration.id as u64;
            }
            inventory_items.instance_id().update(item);
        }
    }
    if let Some(item_id) = inserted_ration.slot_instance_id_1 {
        if let Some(mut item) = inventory_items.instance_id().find(&item_id) {
            if let ItemLocation::Container(ref mut loc_data) = item.location {
                loc_data.container_id = inserted_ration.id as u64;
            }
            inventory_items.instance_id().update(item);
        }
    }
    if let Some(item_id) = inserted_ration.slot_instance_id_2 {
        if let Some(mut item) = inventory_items.instance_id().find(&item_id) {
            if let ItemLocation::Container(ref mut loc_data) = item.location {
                loc_data.container_id = inserted_ration.id as u64;
            }
            inventory_items.instance_id().update(item);
        }
    }
    
    log::info!(
        "[MilitaryRation] Spawned military ration {} at ({:.1}, {:.1}) with {} items",
        inserted_ration.id, pos_x, pos_y, items_spawned
    );
    
    Ok(inserted_ration.id)
}

// --- Auto-Deletion Function ---

/// Checks if a military ration is empty and deletes it if so
/// Also schedules respawn if the ration was fully looted (all slots had items)
pub fn check_and_despawn_military_ration_if_empty(
    ctx: &ReducerContext,
    ration_id: u32,
) -> Result<(), String> {
    let ration = ctx.db.wooden_storage_box().id().find(ration_id)
        .ok_or("Military ration not found")?;
    
    if ration.box_type != BOX_TYPE_MILITARY_RATION {
        return Ok(()); // Not a military ration
    }
    
    // Check if all slots are empty
    if is_container_empty(&ration) {
        // Check if this was a system-placed ration (not player-placed)
        let was_system_placed = ration.placed_by == ctx.identity();
        
        if was_system_placed {
            // Determine spawn location type based on context
            // For now, we'll use "road" as default (can be enhanced later)
            let spawn_location_type = "road".to_string();
            
            // Schedule respawn (5-10 minutes)
            let respawn_delay_secs = ctx.rng().gen_range(300..=600); // 5-10 minutes
            let respawn_time = ctx.timestamp + TimeDuration::from_micros(respawn_delay_secs * 1_000_000);
            
            // Create respawn schedule entry
            let schedule_entry = MilitaryRationRespawnSchedule {
                scheduled_id: 0, // auto_inc
                scheduled_at: ScheduleAt::Time(respawn_time),
                spawn_location_type,
                pos_x: ration.pos_x,
                pos_y: ration.pos_y,
                chunk_index: ration.chunk_index,
            };
            
            ctx.db.military_ration_respawn_schedule().insert(schedule_entry);
            log::info!("[MilitaryRation] Scheduled respawn for military ration {} at ({:.1}, {:.1})", 
                      ration_id, ration.pos_x, ration.pos_y);
        }
        
        ctx.db.wooden_storage_box().id().delete(ration_id);
        log::info!("[MilitaryRation] Auto-despawned empty military ration {}", ration_id);
    }
    
    Ok(())
}

// --- Scheduled Reducer for Respawn ---

#[spacetimedb::reducer]
pub fn respawn_military_rations(ctx: &ReducerContext, schedule: MilitaryRationRespawnSchedule) -> Result<(), String> {
    // Security check: only the scheduler should call this
    if ctx.sender != ctx.identity() {
        return Err("Respawn reducer may only be called by the scheduler".to_string());
    }
    
    // Respawn the military ration at the stored location
    match spawn_military_ration_with_loot(ctx, schedule.pos_x, schedule.pos_y, schedule.chunk_index) {
        Ok(_) => {
            log::info!("[MilitaryRation] Respawned military ration at ({:.1}, {:.1}) from {} location", 
                      schedule.pos_x, schedule.pos_y, schedule.spawn_location_type);
        }
        Err(e) => {
            log::warn!("[MilitaryRation] Failed to respawn military ration at ({:.1}, {:.1}): {}", 
                      schedule.pos_x, schedule.pos_y, e);
        }
    }
    
    Ok(())
}
