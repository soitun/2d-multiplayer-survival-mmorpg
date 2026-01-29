/******************************************************************************
 *                                                                            *
 * Player Beehive - Honeycomb Production System                               *
 *                                                                            *
 * A player-craftable beehive that produces honeycomb over time when a        *
 * Queen Bee is placed in the input slot. The Queen Bee is preserved          *
 * (doesn't spoil) while inside the beehive.                                  *
 *                                                                            *
 * Slot Layout:                                                               *
 *   - Slot 0: Queen Bee input (only accepts Queen Bee)                       *
 *   - Slots 1-6: Honeycomb output (6 output slots)                           *
 *                                                                            *
 * Production:                                                                *
 *   - While Queen Bee is present, produces 1 Honeycomb every 5 minutes       *
 *   - Honeycomb is added to first available output slot (1-6)                *
 *   - If all output slots are full, honeycomb drops as item nearby           *
 *   - Queen Bee doesn't spoil while in the beehive                           *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Table, Timestamp, Identity};
use spacetimedb::spacetimedb_lib::{ScheduleAt, TimeDuration};
use log;
use std::time::Duration;
use rand::Rng;

use crate::wooden_storage_box::{WoodenStorageBox, BOX_TYPE_PLAYER_BEEHIVE, validate_box_interaction, wooden_storage_box as WoodenStorageBoxTableTrait};
use crate::items::{ItemDefinition, InventoryItem, ItemCategory};
use crate::items::{inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait};
use crate::dropped_item::create_dropped_item_entity;
use crate::inventory_management::{merge_or_place_into_container_slot, ItemContainer};
use crate::models::{ItemLocation, ContainerType, ContainerLocationData};
use serde_json;

// --- Beehive Constants ---
pub const NUM_BEEHIVE_SLOTS: usize = 7; // 1 input + 6 output
pub const BEEHIVE_INPUT_SLOT: usize = 0; // Slot 0 is for Queen Bee
pub const BEEHIVE_OUTPUT_START_SLOT: usize = 1; // Slots 1-6 are for output
pub const BEEHIVE_OUTPUT_END_SLOT: usize = 6; // Inclusive

// Beehive timing constants
pub const BEEHIVE_PROCESS_INTERVAL_SECS: u64 = 60; // Check every minute
pub const BEEHIVE_PRODUCTION_TIME_SECS: u64 = 300; // 5 minutes to produce 1 honeycomb
pub const HONEYCOMB_PER_PRODUCTION: u32 = 1; // Produce 1 honeycomb per cycle

// --- Beehive Schedule Table ---
#[spacetimedb::table(name = beehive_process_schedule, scheduled(process_beehive_production))]
#[derive(Clone)]
pub struct BeehiveProcessSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Initialize the beehive processing system
pub fn init_beehive_system(ctx: &ReducerContext) -> Result<(), String> {
    let schedule_table = ctx.db.beehive_process_schedule();
    if schedule_table.iter().count() == 0 {
        log::info!("Starting beehive processing schedule (every {}s).", BEEHIVE_PROCESS_INTERVAL_SECS);
        let interval = Duration::from_secs(BEEHIVE_PROCESS_INTERVAL_SECS);
        crate::try_insert_schedule!(
            schedule_table,
            BeehiveProcessSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(TimeDuration::from(interval)),
            },
            "Beehive processing"
        );
    } else {
        log::debug!("Beehive processing schedule already exists.");
    }
    Ok(())
}

/// Helper function to set beehive production timestamp in item_data (stored on Queen Bee)
fn set_beehive_production_timestamp(item: &mut InventoryItem, timestamp: Timestamp) {
    use std::collections::HashMap;
    let mut data_map: HashMap<String, serde_json::Value> = if let Some(ref data_str) = item.item_data {
        serde_json::from_str(data_str).unwrap_or_default()
    } else {
        HashMap::new()
    };
    data_map.insert("beehive_last_production".to_string(), serde_json::json!(timestamp.to_micros_since_unix_epoch()));
    item.item_data = Some(serde_json::to_string(&data_map).unwrap_or_default());
}

/// Helper function to get beehive production timestamp from item_data
fn get_beehive_production_timestamp(item: &InventoryItem) -> Option<Timestamp> {
    if let Some(ref data_str) = item.item_data {
        if let Ok(data_map) = serde_json::from_str::<std::collections::HashMap<String, serde_json::Value>>(data_str) {
            if let Some(ts_value) = data_map.get("beehive_last_production") {
                if let Some(ts_micros) = ts_value.as_i64() {
                    return Some(Timestamp::from_micros_since_unix_epoch(ts_micros));
                }
            }
        }
    }
    None
}

/// Checks if an item is a Queen Bee
pub fn is_queen_bee(item_def: &ItemDefinition) -> bool {
    item_def.name == "Queen Bee"
}

/// Checks if an item is Honeycomb
pub fn is_honeycomb(item_def: &ItemDefinition) -> bool {
    item_def.name == "Honeycomb"
}

/// Check if a Queen Bee item is inside a player beehive (used for spoilage prevention)
pub fn is_queen_bee_in_beehive(ctx: &ReducerContext, item: &InventoryItem) -> bool {
    // Check if item is in a container
    if let ItemLocation::Container(container_data) = &item.location {
        if container_data.container_type == ContainerType::WoodenStorageBox {
            // Find the storage box
            if let Some(storage_box) = ctx.db.wooden_storage_box().id().find(&(container_data.container_id as u32)) {
                // Check if it's a player beehive and item is in slot 0 (input slot)
                return storage_box.box_type == BOX_TYPE_PLAYER_BEEHIVE && container_data.slot_index == 0;
            }
        }
    }
    false
}

/// Validates that a box is a player beehive and performs item validation
fn validate_beehive_and_item(
    ctx: &ReducerContext,
    box_id: u32,
    item_instance_id: u64,
) -> Result<(WoodenStorageBox, ItemDefinition), String> {
    let (_player, storage_box) = validate_box_interaction(ctx, box_id)?;
    
    // Ensure this is actually a player beehive
    if storage_box.box_type != BOX_TYPE_PLAYER_BEEHIVE {
        return Err("This reducer is only for player beehive containers.".to_string());
    }
    
    // Get the item definition
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    
    let item = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;
    let item_def = item_defs.id().find(item.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item.item_def_id))?;
    
    Ok((storage_box, item_def))
}

/// Add an item to a player beehive slot (with validation)
#[spacetimedb::reducer]
pub fn add_item_to_beehive_slot(
    ctx: &ReducerContext,
    box_id: u32,
    item_instance_id: u64,
    target_slot: u8,
) -> Result<(), String> {
    let (storage_box, item_def) = validate_beehive_and_item(ctx, box_id, item_instance_id)?;
    
    // Slot 0 only accepts Queen Bee
    if target_slot == 0 && !is_queen_bee(&item_def) {
        return Err("Only a Queen Bee can be placed in the beehive's input slot.".to_string());
    }
    
    // Output slots (1-6) only accept Honeycomb (or nothing - let the container system handle stacking)
    // Actually, we should allow manual placement of honeycomb in output slots for organization
    // But prevent placing Queen Bee in output slots
    if target_slot > 0 && target_slot <= 6 && is_queen_bee(&item_def) {
        return Err("Queen Bee can only be placed in the beehive's input slot (slot 0).".to_string());
    }
    
    // Validate slot index
    if target_slot as usize >= NUM_BEEHIVE_SLOTS {
        return Err(format!("Invalid slot index {} for beehive (max {})", target_slot, NUM_BEEHIVE_SLOTS - 1));
    }
    
    // Use the standard container add logic
    // The generic add_item_to_box_slot reducer can handle the actual placement
    // We just needed to validate the beehive-specific rules here
    
    // If placing a Queen Bee, initialize the production timestamp
    if target_slot == 0 && is_queen_bee(&item_def) {
        let mut inventory_items = ctx.db.inventory_item();
        if let Some(mut item) = inventory_items.instance_id().find(item_instance_id) {
            set_beehive_production_timestamp(&mut item, ctx.timestamp);
            inventory_items.instance_id().update(item);
            log::info!("[Beehive] Queen Bee placed in beehive {}, production timer started", box_id);
        }
    }
    
    Ok(())
}

/// Scheduled reducer to process honeycomb production in all beehives
#[spacetimedb::reducer]
pub fn process_beehive_production(ctx: &ReducerContext, _schedule: BeehiveProcessSchedule) -> Result<(), String> {
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("Beehive production can only be triggered by the scheduler.".to_string());
    }
    
    let current_time = ctx.timestamp;
    let mut storage_boxes = ctx.db.wooden_storage_box();
    let mut inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    
    // Find honeycomb definition for creating new honeycomb
    let honeycomb_def = item_defs.iter()
        .find(|def| def.name == "Honeycomb")
        .ok_or_else(|| "Honeycomb item definition not found".to_string())?;
    
    // Collect beehives to process
    let beehives: Vec<WoodenStorageBox> = storage_boxes.iter()
        .filter(|b| b.box_type == BOX_TYPE_PLAYER_BEEHIVE && !b.is_destroyed)
        .collect();
    
    let mut total_produced = 0;
    let mut total_dropped = 0;
    
    for beehive in beehives {
        // Check if slot 0 has a Queen Bee
        let queen_bee_instance_id = match beehive.slot_instance_id_0 {
            Some(id) => id,
            None => continue, // No Queen Bee, skip this beehive
        };
        
        // Verify it's actually a Queen Bee
        let queen_bee = match inventory_items.instance_id().find(queen_bee_instance_id) {
            Some(item) => item,
            None => continue,
        };
        
        let queen_def = match item_defs.id().find(queen_bee.item_def_id) {
            Some(def) => def,
            None => continue,
        };
        
        if !is_queen_bee(&queen_def) {
            continue; // Not a Queen Bee, skip
        }
        
        // Check production timer
        let last_production = get_beehive_production_timestamp(&queen_bee)
            .unwrap_or(current_time); // Default to now if no timestamp
        
        let elapsed_micros = current_time.to_micros_since_unix_epoch() - last_production.to_micros_since_unix_epoch();
        let elapsed_secs = elapsed_micros / 1_000_000;
        
        if elapsed_secs < BEEHIVE_PRODUCTION_TIME_SECS as i64 {
            continue; // Not enough time has passed
        }
        
        // Time to produce honeycomb!
        // Try to find an empty output slot or stack with existing honeycomb
        let mut honeycomb_placed = false;
        let mut updated_beehive = beehive.clone();
        
        // Check slots 1-6 for empty space or stacking
        for slot_idx in BEEHIVE_OUTPUT_START_SLOT..=BEEHIVE_OUTPUT_END_SLOT {
            let (slot_instance, slot_def) = match slot_idx {
                1 => (updated_beehive.slot_instance_id_1, updated_beehive.slot_def_id_1),
                2 => (updated_beehive.slot_instance_id_2, updated_beehive.slot_def_id_2),
                3 => (updated_beehive.slot_instance_id_3, updated_beehive.slot_def_id_3),
                4 => (updated_beehive.slot_instance_id_4, updated_beehive.slot_def_id_4),
                5 => (updated_beehive.slot_instance_id_5, updated_beehive.slot_def_id_5),
                6 => (updated_beehive.slot_instance_id_6, updated_beehive.slot_def_id_6),
                _ => continue,
            };
            
            if slot_instance.is_none() {
                // Empty slot - create new honeycomb
                let new_honeycomb = InventoryItem {
                    instance_id: 0, // Auto-increment
                    item_def_id: honeycomb_def.id,
                    quantity: HONEYCOMB_PER_PRODUCTION,
                    location: ItemLocation::Container(ContainerLocationData {
                        container_type: ContainerType::WoodenStorageBox,
                        container_id: beehive.id as u64,
                        slot_index: slot_idx as u8,
                    }),
                    item_data: None,
                };
                
                let inserted = inventory_items.insert(new_honeycomb);
                
                // Update beehive slot
                match slot_idx {
                    1 => { updated_beehive.slot_instance_id_1 = Some(inserted.instance_id); updated_beehive.slot_def_id_1 = Some(honeycomb_def.id); }
                    2 => { updated_beehive.slot_instance_id_2 = Some(inserted.instance_id); updated_beehive.slot_def_id_2 = Some(honeycomb_def.id); }
                    3 => { updated_beehive.slot_instance_id_3 = Some(inserted.instance_id); updated_beehive.slot_def_id_3 = Some(honeycomb_def.id); }
                    4 => { updated_beehive.slot_instance_id_4 = Some(inserted.instance_id); updated_beehive.slot_def_id_4 = Some(honeycomb_def.id); }
                    5 => { updated_beehive.slot_instance_id_5 = Some(inserted.instance_id); updated_beehive.slot_def_id_5 = Some(honeycomb_def.id); }
                    6 => { updated_beehive.slot_instance_id_6 = Some(inserted.instance_id); updated_beehive.slot_def_id_6 = Some(honeycomb_def.id); }
                    _ => {}
                }
                
                honeycomb_placed = true;
                total_produced += 1;
                log::debug!("[Beehive] Produced honeycomb in beehive {} slot {}", beehive.id, slot_idx);
                break;
            } else if let Some(inst_id) = slot_instance {
                // Check if we can stack with existing honeycomb
                if let Some(mut existing_item) = inventory_items.instance_id().find(inst_id) {
                    if let Some(existing_def) = item_defs.id().find(existing_item.item_def_id) {
                        if is_honeycomb(&existing_def) && existing_item.quantity < honeycomb_def.stack_size as u32 {
                            // Stack with existing honeycomb
                            existing_item.quantity += HONEYCOMB_PER_PRODUCTION;
                            if existing_item.quantity > honeycomb_def.stack_size as u32 {
                                existing_item.quantity = honeycomb_def.stack_size as u32;
                            }
                            inventory_items.instance_id().update(existing_item);
                            honeycomb_placed = true;
                            total_produced += 1;
                            log::debug!("[Beehive] Stacked honeycomb in beehive {} slot {}", beehive.id, slot_idx);
                            break;
                        }
                    }
                }
            }
        }
        
        // If no slot available, drop honeycomb nearby
        if !honeycomb_placed {
            let mut rng = ctx.rng();
            let drop_x = beehive.pos_x + (rng.gen::<f32>() - 0.5) * 40.0;
            let drop_y = beehive.pos_y + (rng.gen::<f32>() - 0.5) * 40.0;
            
            match create_dropped_item_entity(ctx, honeycomb_def.id, HONEYCOMB_PER_PRODUCTION, drop_x, drop_y) {
                Ok(_) => {
                    total_dropped += 1;
                    log::info!("[Beehive] Output full - dropped honeycomb near beehive {} at ({:.1}, {:.1})", beehive.id, drop_x, drop_y);
                }
                Err(e) => {
                    log::warn!("[Beehive] Failed to drop honeycomb: {}", e);
                }
            }
        }
        
        // Update production timestamp on Queen Bee
        if let Some(mut queen) = inventory_items.instance_id().find(queen_bee_instance_id) {
            set_beehive_production_timestamp(&mut queen, current_time);
            inventory_items.instance_id().update(queen);
        }
        
        // Save beehive changes
        storage_boxes.id().update(updated_beehive);
    }
    
    if total_produced > 0 || total_dropped > 0 {
        log::info!("[Beehive] Production cycle: {} honeycomb produced, {} dropped (overflow)", total_produced, total_dropped);
    }
    
    Ok(())
}

// Yeast extraction is now unified with Queen Bee extraction in bones.rs
// See extract_from_honeycomb reducer which gives 15% Queen Bee, 85% Yeast
