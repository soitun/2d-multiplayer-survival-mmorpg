/******************************************************************************
 *                                                                            *
 * Fish Trap-specific logic and reducers.                                     *
 * Extends the base WoodenStorageBox functionality with fish trap-specific    *
 * behavior: converts food bait into fish/crab over time.                     *
 * Must be placed on shore (land adjacent to water).                          *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Table, Timestamp, Identity};
use spacetimedb::spacetimedb_lib::{ScheduleAt, TimeDuration};
use log;
use std::time::Duration;

use crate::wooden_storage_box::{WoodenStorageBox, BOX_TYPE_FISH_TRAP, validate_box_interaction, wooden_storage_box as WoodenStorageBoxTableTrait};
use crate::items::{ItemDefinition, InventoryItem, ItemCategory};
use crate::items::{inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait};
use crate::dropped_item::create_dropped_item_entity;
use crate::durability::is_food_item;
use crate::inventory_management::{merge_or_place_into_container_slot, ItemContainer};
use crate::models::{ItemLocation, ContainerType, ContainerLocationData};
use serde_json;

// --- Fish Trap Constants ---
pub const NUM_FISH_TRAP_SLOTS: usize = 12;
pub const FISH_TRAP_INITIAL_HEALTH: f32 = 300.0;
pub const FISH_TRAP_MAX_HEALTH: f32 = 300.0;

// Fish trap timing constants
pub const FISH_TRAP_PROCESS_INTERVAL_SECS: u64 = 60; // Process every minute
pub const FISH_TRAP_CONVERSION_TIME_SECS: u64 = 600; // 10 minutes to convert bait to fish/crab

// Output probabilities (as percentages out of 100)
// Fish traps are passive and only catch common tier fish/shellfish + junk
// They CANNOT catch rare/premium fish - that requires active fishing
pub const FISH_TRAP_JUNK_CHANCE: u32 = 15;      // 15% junk (Seaweed, Shell Fragment, etc.)
pub const FISH_TRAP_SMALL_FISH_CHANCE: u32 = 35; // 35% small fish (Twigfish, Herring, Smelt)
pub const FISH_TRAP_SHELLFISH_CHANCE: u32 = 25;  // 25% shellfish (Mussel, Urchin, Chiton)
pub const FISH_TRAP_CRAB_CHANCE: u32 = 25;       // 25% crab (Raw Crab Meat)

// Output item pools (common tier only - passive trapping cannot catch rare fish!)
pub const FISH_TRAP_SMALL_FISH: &[&str] = &["Raw Twigfish", "Raw Herring", "Raw Smelt"];
pub const FISH_TRAP_SHELLFISH: &[&str] = &["Raw Blue Mussel", "Raw Sea Urchin", "Raw Black Katy Chiton"];
pub const FISH_TRAP_CRAB: &[&str] = &["Raw Crab Meat"];
pub const FISH_TRAP_JUNK: &[&str] = &["Seaweed", "Shell Fragment", "Old Boot", "Rusty Hook"];

// Fishing village bonus constants
// Fish traps in the Aleut fishing village zone get bonuses similar to fishing
pub const FISH_TRAP_VILLAGE_CONVERSION_TIME_SECS: u64 = 300; // 5 minutes (half normal time) when in village
pub const FISH_TRAP_VILLAGE_DOUBLE_YIELD: bool = true; // Double yield (2x output) when in village

// --- Fish Trap Schedule Table ---
#[spacetimedb::table(name = fish_trap_process_schedule, scheduled(process_fish_trap_conversion))]
#[derive(Clone)]
pub struct FishTrapProcessSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Initialize the fish trap processing system
pub fn init_fish_trap_system(ctx: &ReducerContext) -> Result<(), String> {
    let schedule_table = ctx.db.fish_trap_process_schedule();
    if schedule_table.iter().count() == 0 {
        log::info!("Starting fish trap processing schedule (every {}s).", FISH_TRAP_PROCESS_INTERVAL_SECS);
        let interval = Duration::from_secs(FISH_TRAP_PROCESS_INTERVAL_SECS);
        crate::try_insert_schedule!(
            schedule_table,
            FishTrapProcessSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(TimeDuration::from(interval)),
            },
            "Fish trap processing"
        );
    } else {
        log::debug!("Fish trap processing schedule already exists.");
    }
    Ok(())
}

/// Helper function to set fish trap placement timestamp in item_data
pub(crate) fn set_fish_trap_timestamp(item: &mut InventoryItem, timestamp: Timestamp) {
    use std::collections::HashMap;
    let mut data_map: HashMap<String, serde_json::Value> = if let Some(ref data_str) = item.item_data {
        serde_json::from_str(data_str).unwrap_or_default()
    } else {
        HashMap::new()
    };
    data_map.insert("fish_trap_placed_at".to_string(), serde_json::json!(timestamp.to_micros_since_unix_epoch()));
    item.item_data = Some(serde_json::to_string(&data_map).unwrap_or_default());
}

/// Helper function to get fish trap placement timestamp from item_data
fn get_fish_trap_timestamp(item: &InventoryItem) -> Option<Timestamp> {
    if let Some(ref data_str) = item.item_data {
        if let Ok(data_map) = serde_json::from_str::<std::collections::HashMap<String, serde_json::Value>>(data_str) {
            if let Some(ts_value) = data_map.get("fish_trap_placed_at") {
                if let Some(ts_micros) = ts_value.as_i64() {
                    return Some(Timestamp::from_micros_since_unix_epoch(ts_micros));
                }
            }
        }
    }
    None
}

/// Checks if an item can be used as bait in a fish trap
/// Allowed items: any food (raw, cooked, burnt)
/// Excluded: Output items (Raw Fish, Crab Meat) to prevent feedback loops
pub fn is_valid_bait(item_def: &ItemDefinition, _item_instance: Option<&InventoryItem>) -> bool {
    // Explicitly exclude output items - can't use fish to catch fish!
    // (Though players could experiment with this - it would just be inefficient)
    // Actually, let's allow it for discovery - players might find certain baits work better
    
    // Any food item is valid bait
    if is_food_item(item_def) {
        return true;
    }
    
    false
}

/// Validates that a box is a fish trap and performs item validation
fn validate_fish_trap_and_item(
    ctx: &ReducerContext,
    box_id: u32,
    item_instance_id: u64,
) -> Result<(WoodenStorageBox, ItemDefinition), String> {
    let (_player, storage_box) = validate_box_interaction(ctx, box_id)?;
    
    // Ensure this is actually a fish trap
    if storage_box.box_type != BOX_TYPE_FISH_TRAP {
        return Err("This reducer is only for fish trap containers.".to_string());
    }
    
    // Validate the item is valid bait
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    
    let item = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;
    let item_def = item_defs.id().find(item.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item.item_def_id))?;
    
    // Check if item is valid bait
    if !is_valid_bait(&item_def, Some(&item)) {
        return Err(format!(
            "Cannot use '{}' as bait. Only food items can be used as bait in fish traps.", 
            item_def.name
        ));
    }
    
    Ok((storage_box, item_def))
}

/******************************************************************************
 *                    FISH TRAP-SPECIFIC REDUCERS                              *
 ******************************************************************************/

/// --- Move Item to Fish Trap ---
/// Moves an item from the player's inventory/hotbar INTO a specified slot in the fish trap.
/// Adds fish trap-specific validation (only food items allowed as bait).
#[spacetimedb::reducer]
pub fn move_item_to_fish_trap(
    ctx: &ReducerContext, 
    box_id: u32, 
    target_slot_index: u8, 
    item_instance_id: u64
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    
    // Validate fish trap and item restrictions
    let (mut storage_box, _item_def) = validate_fish_trap_and_item(ctx, box_id, item_instance_id)?;
    
    // Get the item to set fish trap timestamp
    let mut inventory_items = ctx.db.inventory_item();
    if let Some(mut item) = inventory_items.instance_id().find(&item_instance_id) {
        set_fish_trap_timestamp(&mut item, ctx.timestamp);
        inventory_items.instance_id().update(item);
    }
    
    // Call the generic handler (validation already done)
    crate::inventory_management::handle_move_to_container_slot(
        ctx, 
        &mut storage_box, 
        target_slot_index, 
        item_instance_id
    )?;
    
    // Commit box update
    boxes.id().update(storage_box);
    Ok(())
}

/// --- Split Stack Into Fish Trap ---
/// Splits a stack from player inventory/hotbar into a specific fish trap slot.
/// Adds fish trap-specific validation.
#[spacetimedb::reducer]
pub fn split_stack_into_fish_trap(
    ctx: &ReducerContext,
    box_id: u32,
    target_slot_index: u8,
    source_item_instance_id: u64,
    quantity_to_split: u32,
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    
    // Validate fish trap and item restrictions
    let (_storage_box, _item_def) = validate_fish_trap_and_item(ctx, box_id, source_item_instance_id)?;
    let (_player, mut storage_box) = validate_box_interaction(ctx, box_id)?;
    
    // Get the source item to check if we need to set timestamp for the split stack
    // Note: The split handler creates a new item, so we'll set timestamp after split
    let mut inventory_items = ctx.db.inventory_item();
    
    // Call the generic handler
    crate::inventory_management::handle_split_into_container(
        ctx, 
        &mut storage_box, 
        target_slot_index, 
        source_item_instance_id, 
        quantity_to_split
    )?;
    
    // Set fish trap timestamp on the newly created split item in the target slot
    if let Some(new_item_id) = storage_box.get_slot_instance_id(target_slot_index) {
        if let Some(mut new_item) = inventory_items.instance_id().find(&new_item_id) {
            set_fish_trap_timestamp(&mut new_item, ctx.timestamp);
            inventory_items.instance_id().update(new_item);
        }
    }
    
    boxes.id().update(storage_box);
    Ok(())
}

/// --- Quick Move To Fish Trap ---
/// Quickly moves an item FROM player inventory/hotbar TO the first available/mergeable slot in the fish trap.
/// Adds fish trap-specific validation.
#[spacetimedb::reducer]
pub fn quick_move_to_fish_trap(
    ctx: &ReducerContext, 
    box_id: u32, 
    item_instance_id: u64
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    
    // Validate fish trap and item restrictions
    let (mut storage_box, _item_def) = validate_fish_trap_and_item(ctx, box_id, item_instance_id)?;
    
    // Get the item to set fish trap timestamp
    let mut inventory_items = ctx.db.inventory_item();
    if let Some(mut item) = inventory_items.instance_id().find(&item_instance_id) {
        set_fish_trap_timestamp(&mut item, ctx.timestamp);
        inventory_items.instance_id().update(item);
    }
    
    // Call the generic handler
    crate::inventory_management::handle_quick_move_to_container(
        ctx, 
        &mut storage_box, 
        item_instance_id
    )?;
    
    // Commit box update
    boxes.id().update(storage_box);
    Ok(())
}

/******************************************************************************
 *                    SCHEDULED FISH TRAP PROCESSING                           *
 ******************************************************************************/

/// Item definition cache for fish trap outputs
struct FishTrapOutputCache {
    /// Map of item name to (def_id, max_stack)
    items: std::collections::HashMap<String, (u64, u32)>,
}

impl FishTrapOutputCache {
    /// Build cache of all possible fish trap output items
    fn build(ctx: &ReducerContext) -> Self {
        let item_defs = ctx.db.item_definition();
        let mut items = std::collections::HashMap::new();
        
        // Collect all possible output items
        let all_outputs: Vec<&str> = FISH_TRAP_SMALL_FISH.iter()
            .chain(FISH_TRAP_SHELLFISH.iter())
            .chain(FISH_TRAP_CRAB.iter())
            .chain(FISH_TRAP_JUNK.iter())
            .copied()
            .collect();
        
        for def in item_defs.iter() {
            if all_outputs.contains(&def.name.as_str()) {
                let max_stack = if def.is_stackable { def.stack_size } else { 1 };
                items.insert(def.name.clone(), (def.id, max_stack));
            }
        }
        
        FishTrapOutputCache { items }
    }
    
    /// Get a random item from a category using deterministic RNG
    fn get_random_from_pool(&self, pool: &[&str], hash: u64) -> Option<(u64, u32)> {
        let idx = (hash as usize) % pool.len();
        let item_name = pool[idx];
        self.items.get(item_name).copied()
    }
    
    /// Select output based on fish trap probabilities
    fn select_output(&self, hash: u64, sub_hash: u64) -> Option<(u64, u32, &'static str)> {
        let roll = (hash % 100) as u32;
        
        if roll < FISH_TRAP_JUNK_CHANCE {
            // Junk (15%)
            self.get_random_from_pool(FISH_TRAP_JUNK, sub_hash)
                .map(|(id, stack)| (id, stack, "junk"))
        } else if roll < FISH_TRAP_JUNK_CHANCE + FISH_TRAP_SMALL_FISH_CHANCE {
            // Small fish (35%)
            self.get_random_from_pool(FISH_TRAP_SMALL_FISH, sub_hash)
                .map(|(id, stack)| (id, stack, "fish"))
        } else if roll < FISH_TRAP_JUNK_CHANCE + FISH_TRAP_SMALL_FISH_CHANCE + FISH_TRAP_SHELLFISH_CHANCE {
            // Shellfish (25%)
            self.get_random_from_pool(FISH_TRAP_SHELLFISH, sub_hash)
                .map(|(id, stack)| (id, stack, "shellfish"))
        } else {
            // Crab (25%)
            self.get_random_from_pool(FISH_TRAP_CRAB, sub_hash)
                .map(|(id, stack)| (id, stack, "crab"))
        }
    }
}

/// Scheduled reducer that processes fish trap conversion
/// Converts bait (food items) into fish/shellfish/crab/junk over time
#[spacetimedb::reducer]
pub fn process_fish_trap_conversion(ctx: &ReducerContext, _args: FishTrapProcessSchedule) -> Result<(), String> {
    // Security check - only scheduler can run this
    if ctx.sender != ctx.identity() {
        return Err("Fish trap processing can only be run by scheduler".to_string());
    }
    
    // PERFORMANCE: Early exit if no fish traps exist
    let has_fish_traps = ctx.db.wooden_storage_box().iter().any(|b| b.box_type == BOX_TYPE_FISH_TRAP);
    if !has_fish_traps {
        return Ok(());
    }
    
    let current_time = ctx.timestamp;
    
    // Build output item cache
    let output_cache = FishTrapOutputCache::build(ctx);
    
    // Collect all fish trap box IDs to process
    let mut fish_trap_box_ids: Vec<u32> = Vec::new();
    {
        let boxes = ctx.db.wooden_storage_box();
        for storage_box in boxes.iter() {
            if storage_box.box_type == BOX_TYPE_FISH_TRAP {
                fish_trap_box_ids.push(storage_box.id);
            }
        }
    }
    
    // Process each fish trap box individually
    for box_id in fish_trap_box_ids {
        let _ = process_single_fish_trap(ctx, box_id, current_time, &output_cache);
    }
    
    Ok(())
}

/// Process a single fish trap conversion
fn process_single_fish_trap(
    ctx: &ReducerContext,
    box_id: u32,
    current_time: Timestamp,
    output_cache: &FishTrapOutputCache,
) -> Result<(), String> {
    // Get fresh table handles
    let boxes_table = ctx.db.wooden_storage_box();
    let items_table = ctx.db.inventory_item();
    let defs_table = ctx.db.item_definition();
    
    // Find the fish trap box
    let fish_trap_original = match boxes_table.id().find(&box_id) {
        Some(b) => b,
        None => return Ok(()), // Box was deleted
    };
    
    let mut fish_trap = fish_trap_original.clone();
    let num_slots: usize = fish_trap.num_slots();
    
    // Check if fish trap is in the Aleut fishing village zone for bonuses
    let in_fishing_village = crate::fishing_village::is_position_in_fishing_village_zone(
        ctx, fish_trap.pos_x, fish_trap.pos_y
    );
    
    // Determine conversion time based on village bonus
    let conversion_time_secs = if in_fishing_village {
        FISH_TRAP_VILLAGE_CONVERSION_TIME_SECS // 5 minutes in village
    } else {
        FISH_TRAP_CONVERSION_TIME_SECS // 10 minutes normally
    };
    
    let mut items_to_remove: Vec<(u8, u64)> = Vec::new();
    let mut items_to_timestamp: Vec<u64> = Vec::new();
    let mut output_to_add: Vec<(u64, u32, u32)> = Vec::new(); // (def_id, max_stack, quantity)
    
    // Check each slot for valid bait items
    // IMPORTANT: Process ONE unit at a time, not entire stacks
    let mut slot_idx: usize = 0;
    while slot_idx < num_slots {
        let slot_u8: u8 = slot_idx as u8;
        let maybe_item_id = fish_trap.get_slot_instance_id(slot_u8);
        
        if let Some(item_instance_id) = maybe_item_id {
            let maybe_item = items_table.instance_id().find(&item_instance_id);
            if let Some(mut item) = maybe_item {
                let maybe_def = defs_table.id().find(&item.item_def_id);
                if let Some(item_def) = maybe_def {
                    let is_bait: bool = is_valid_bait(&item_def, Some(&item));
                    if is_bait {
                        let maybe_placed_at = get_fish_trap_timestamp(&item);
                        if let Some(placed_at) = maybe_placed_at {
                            let current_micros: i64 = current_time.to_micros_since_unix_epoch();
                            let placed_micros: i64 = placed_at.to_micros_since_unix_epoch();
                            let elapsed_micros: u64 = (current_micros.saturating_sub(placed_micros)) as u64;
                            let elapsed_secs: u64 = elapsed_micros / 1_000_000;
                            if elapsed_secs >= conversion_time_secs {
                                // Determine output using deterministic RNG
                                // Use two hashes: one for category, one for specific item within category
                                let category_hash = ((box_id as u64).wrapping_mul(31)) ^ ((slot_idx as u64).wrapping_mul(17)) ^ (current_micros as u64);
                                let item_hash = category_hash.wrapping_mul(37) ^ (current_micros as u64).wrapping_add(slot_idx as u64);
                                
                                if let Some((output_def_id, output_max_stack, output_type)) = output_cache.select_output(category_hash, item_hash) {
                                    // Add output - double yield if in fishing village (but NOT for junk!)
                                    let output_qty = if in_fishing_village && FISH_TRAP_VILLAGE_DOUBLE_YIELD && output_type != "junk" {
                                        log::info!("🏘️🦀 Fish trap {} in Aleut village - double {} yield!", box_id, output_type);
                                        2u32
                                    } else {
                                        1u32
                                    };
                                    output_to_add.push((output_def_id, output_max_stack, output_qty));
                                    
                                    // Log what was caught
                                    if let Some(output_name) = output_cache.items.iter().find(|(_, (id, _))| *id == output_def_id).map(|(name, _)| name.as_str()) {
                                        log::info!("🪤 Fish trap {} caught: {} ({})", box_id, output_name, output_type);
                                    }
                                } else {
                                    log::warn!("[FishTrap] Could not select output item - item definitions may be missing");
                                }
                                
                                // Reduce bait quantity by 1
                                if item.quantity > 1 {
                                    item.quantity -= 1;
                                    let remaining_qty = item.quantity;
                                    // Reset timestamp for the remaining stack (they start fresh)
                                    set_fish_trap_timestamp(&mut item, current_time);
                                    items_table.instance_id().update(item);
                                    log::debug!("[FishTrap] Converted 1 bait from slot {}. Remaining: {}. Timestamp reset.", slot_u8, remaining_qty);
                                } else {
                                    // Last unit converted, remove the item
                                    items_to_remove.push((slot_u8, item_instance_id));
                                    log::debug!("[FishTrap] Converted last bait from slot {}. Removing item.", slot_u8);
                                }
                            }
                        } else {
                            // Item doesn't have a timestamp yet - set one
                            items_to_timestamp.push(item_instance_id);
                        }
                    }
                }
            }
        }
        
        slot_idx += 1;
    }
    
    // Apply timestamp updates for items that didn't have one
    for item_id in items_to_timestamp {
        let maybe_item = items_table.instance_id().find(&item_id);
        if let Some(mut item) = maybe_item {
            set_fish_trap_timestamp(&mut item, current_time);
            items_table.instance_id().update(item);
        }
    }
    
    // Remove converted bait items
    for (slot_u8, item_id) in items_to_remove {
        fish_trap.set_slot(slot_u8, None, None);
        items_table.instance_id().delete(item_id);
    }
    
    // Add output items (fish/shellfish/crab/junk) to fish trap slots
    for (output_def_id, output_max_stack, output_qty) in output_to_add {
        let mut remaining_to_add = output_qty;
        
        // Try to stack with existing output items
        let mut slot_idx: usize = 0;
        while slot_idx < num_slots && remaining_to_add > 0 {
            let slot_u8: u8 = slot_idx as u8;
            let maybe_existing_id = fish_trap.get_slot_instance_id(slot_u8);
            
            if let Some(existing_id) = maybe_existing_id {
                let maybe_existing = items_table.instance_id().find(&existing_id);
                if let Some(mut existing_item) = maybe_existing {
                    if existing_item.item_def_id == output_def_id {
                        let current_qty: u32 = existing_item.quantity;
                        let space_available: u32 = output_max_stack.saturating_sub(current_qty);
                        if space_available > 0 {
                            let to_add: u32 = remaining_to_add.min(space_available);
                            existing_item.quantity += to_add;
                            items_table.instance_id().update(existing_item);
                            remaining_to_add -= to_add;
                        }
                    }
                }
            }
            
            slot_idx += 1;
        }
        
        // Fill empty slots with remaining output
        while remaining_to_add > 0 {
            let mut placed: bool = false;
            let mut slot_idx: usize = 0;
            while slot_idx < num_slots {
                let slot_u8: u8 = slot_idx as u8;
                let is_empty: bool = fish_trap.get_slot_instance_id(slot_u8).is_none();
                
                if is_empty {
                    let quantity_to_place: u32 = remaining_to_add.min(output_max_stack);
                    let new_location = ItemLocation::Container(ContainerLocationData {
                        container_type: ContainerType::WoodenStorageBox,
                        container_id: fish_trap.id as u64,
                        slot_index: slot_u8,
                    });
                    
                    let new_item = InventoryItem {
                        instance_id: 0,
                        item_def_id: output_def_id,
                        quantity: quantity_to_place,
                        location: new_location,
                        item_data: None,
                    };
                    
                    let insert_result = items_table.try_insert(new_item);
                    match insert_result {
                        Ok(inserted) => {
                            fish_trap.set_slot(slot_u8, Some(inserted.instance_id), Some(output_def_id));
                            remaining_to_add -= quantity_to_place;
                            placed = true;
                            break;
                        }
                        Err(e) => {
                            log::warn!("[FishTrap] Failed to insert output item: {:?}", e);
                            break;
                        }
                    }
                }
                
                slot_idx += 1;
            }
            
            if !placed {
                // Drop remaining output near the fish trap
                if remaining_to_add > 0 {
                    let drop_x: f32 = fish_trap.pos_x;
                    let drop_y: f32 = fish_trap.pos_y;
                    let drop_result = create_dropped_item_entity(ctx, output_def_id, remaining_to_add, drop_x, drop_y);
                    if let Err(e) = drop_result {
                        log::warn!("[FishTrap] Failed to drop output item: {}", e);
                    } else {
                        log::info!("[FishTrap] Dropped {} output items near fish trap {}", remaining_to_add, fish_trap.id);
                    }
                }
                break;
            }
        }
    }
    
    // Update the box
    let boxes_table_mut = ctx.db.wooden_storage_box();
    boxes_table_mut.id().update(fish_trap);
    
    Ok(())
}
