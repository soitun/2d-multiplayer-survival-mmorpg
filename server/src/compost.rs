/******************************************************************************
 *                                                                            *
 * Compost-specific logic and reducers.                                       *
 * Extends the base WoodenStorageBox functionality with compost-specific     *
 * behavior: converts organic materials (food, plants, plant fiber) into     *
 * fertilizer over time.                                                     *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Table, Timestamp, Identity};
use spacetimedb::spacetimedb_lib::{ScheduleAt, TimeDuration};
use log;
use std::time::Duration;

use crate::wooden_storage_box::{WoodenStorageBox, BOX_TYPE_COMPOST, validate_box_interaction, wooden_storage_box as WoodenStorageBoxTableTrait};
use crate::items::{ItemDefinition, InventoryItem, ItemCategory};
use crate::items::{inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait};
use crate::dropped_item::create_dropped_item_entity;
use crate::durability::is_food_item;
use crate::inventory_management::{merge_or_place_into_container_slot, ItemContainer};
use crate::models::{ItemLocation, ContainerType, ContainerLocationData};
use serde_json;

// --- Compost Constants ---
pub const NUM_COMPOST_SLOTS: usize = 20;
pub const COMPOST_INITIAL_HEALTH: f32 = 500.0;
pub const COMPOST_MAX_HEALTH: f32 = 500.0;

// Composting timing constants
pub const COMPOST_PROCESS_INTERVAL_SECS: u64 = 60; // Process every minute
pub const COMPOST_CONVERSION_TIME_SECS: u64 = 300; // 5 minutes to convert items to fertilizer
pub const COMPOST_FERTILIZER_PER_ITEM: u32 = 1; // Each compostable item produces 1 fertilizer

// --- Compost Schedule Table ---
#[spacetimedb::table(name = compost_process_schedule, scheduled(process_compost_conversion))]
#[derive(Clone)]
pub struct CompostProcessSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Initialize the compost processing system
pub fn init_compost_system(ctx: &ReducerContext) -> Result<(), String> {
    let schedule_table = ctx.db.compost_process_schedule();
    if schedule_table.iter().count() == 0 {
        log::info!("Starting compost processing schedule (every {}s).", COMPOST_PROCESS_INTERVAL_SECS);
        let interval = Duration::from_secs(COMPOST_PROCESS_INTERVAL_SECS);
        crate::try_insert_schedule!(
            schedule_table,
            CompostProcessSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(TimeDuration::from(interval)),
            },
            "Compost processing"
        );
    } else {
        log::debug!("Compost processing schedule already exists.");
    }
    Ok(())
}

/// Helper function to set compost placement timestamp in item_data
pub(crate) fn set_compost_timestamp(item: &mut InventoryItem, timestamp: Timestamp) {
    use std::collections::HashMap;
    let mut data_map: HashMap<String, serde_json::Value> = if let Some(ref data_str) = item.item_data {
        serde_json::from_str(data_str).unwrap_or_default()
    } else {
        HashMap::new()
    };
    data_map.insert("compost_placed_at".to_string(), serde_json::json!(timestamp.to_micros_since_unix_epoch()));
    item.item_data = Some(serde_json::to_string(&data_map).unwrap_or_default());
}

/// Helper function to get compost placement timestamp from item_data
fn get_compost_timestamp(item: &InventoryItem) -> Option<Timestamp> {
    if let Some(ref data_str) = item.item_data {
        if let Ok(data_map) = serde_json::from_str::<std::collections::HashMap<String, serde_json::Value>>(data_str) {
            if let Some(ts_value) = data_map.get("compost_placed_at") {
                if let Some(ts_micros) = ts_value.as_i64() {
                    return Some(Timestamp::from_micros_since_unix_epoch(ts_micros));
                }
            }
        }
    }
    None
}

/// Checks if an item can be composted
/// Allowed items: food (raw, cooked, burnt), plant fiber, plants (seeds, consumables with plant names)
/// Excluded: Fertilizer (output of composting - cannot be re-composted)
pub fn is_item_compostable(item_def: &ItemDefinition, item_instance: Option<&InventoryItem>) -> bool {
    // Explicitly exclude Fertilizer - it's the output of composting, not an input!
    if item_def.name == "Fertilizer" {
        return false;
    }
    
    // Food items (raw, cooked, burnt) - check by category and name patterns
    if is_food_item(item_def) {
        return true;
    }
    
    // Plant Fiber
    if item_def.name == "Plant Fiber" {
        return true;
    }
    
    // Seeds - check if it's a material with "Seed" in the name
    if item_def.category == ItemCategory::Material && item_def.name.contains("Seed") {
        return true;
    }
    
    // Plants/Herbs (consumables that are plants - check name patterns)
    if item_def.category == ItemCategory::Consumable {
        let name_lower = item_def.name.to_lowercase();
        // Check for plant-related keywords
        if name_lower.contains("plant") || 
           name_lower.contains("herb") || 
           name_lower.contains("berry") ||
           name_lower.contains("mushroom") ||
           name_lower.contains("flower") ||
           name_lower.contains("leaf") ||
           name_lower.contains("stalk") ||
           name_lower.contains("root") ||
           name_lower.contains("bulb") ||
           name_lower.contains("rhizome") {
            return true;
        }
    }
    
    false
}

/// Validates that a box is a compost and performs item validation
fn validate_compost_and_item(
    ctx: &ReducerContext,
    box_id: u32,
    item_instance_id: u64,
) -> Result<(WoodenStorageBox, ItemDefinition), String> {
    let (_player, storage_box) = validate_box_interaction(ctx, box_id)?;
    
    // Ensure this is actually a compost
    if storage_box.box_type != BOX_TYPE_COMPOST {
        return Err("This reducer is only for compost containers.".to_string());
    }
    
    // Validate the item is compostable
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    
    let item = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;
    let item_def = item_defs.id().find(item.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item.item_def_id))?;
    
    // Check if item is compostable
    if !is_item_compostable(&item_def, Some(&item)) {
        return Err(format!(
            "Cannot compost '{}'. Only food, plants, and plant fiber can be composted.", 
            item_def.name
        ));
    }
    
    Ok((storage_box, item_def))
}

/******************************************************************************
 *                    COMPOST-SPECIFIC REDUCERS                                *
 ******************************************************************************/

/// --- Move Item to Compost ---
/// Moves an item from the player's inventory/hotbar INTO a specified slot in the compost.
/// Adds compost-specific validation (only compostable items allowed).
#[spacetimedb::reducer]
pub fn move_item_to_compost(
    ctx: &ReducerContext, 
    box_id: u32, 
    target_slot_index: u8, 
    item_instance_id: u64
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    
    // Validate compost and item restrictions
    let (mut storage_box, _item_def) = validate_compost_and_item(ctx, box_id, item_instance_id)?;
    
    // Get the item to set compost timestamp
    let mut inventory_items = ctx.db.inventory_item();
    if let Some(mut item) = inventory_items.instance_id().find(&item_instance_id) {
        set_compost_timestamp(&mut item, ctx.timestamp);
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

/// --- Split Stack Into Compost ---
/// Splits a stack from player inventory/hotbar into a specific compost slot.
/// Adds compost-specific validation.
#[spacetimedb::reducer]
pub fn split_stack_into_compost(
    ctx: &ReducerContext,
    box_id: u32,
    target_slot_index: u8,
    source_item_instance_id: u64,
    quantity_to_split: u32,
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    
    // Validate compost and item restrictions
    let (_storage_box, _item_def) = validate_compost_and_item(ctx, box_id, source_item_instance_id)?;
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
    
    // Set compost timestamp on the newly created split item in the target slot
    if let Some(new_item_id) = storage_box.get_slot_instance_id(target_slot_index) {
        if let Some(mut new_item) = inventory_items.instance_id().find(&new_item_id) {
            set_compost_timestamp(&mut new_item, ctx.timestamp);
            inventory_items.instance_id().update(new_item);
        }
    }
    
    // Note: Source item is in player inventory (not compost), so no timestamp reset needed
    // The source item will get a timestamp when/if it's moved to compost later
    
    boxes.id().update(storage_box);
    Ok(())
}

/// --- Quick Move To Compost ---
/// Quickly moves an item FROM player inventory/hotbar TO the first available/mergeable slot in the compost.
/// Adds compost-specific validation.
#[spacetimedb::reducer]
pub fn quick_move_to_compost(
    ctx: &ReducerContext, 
    box_id: u32, 
    item_instance_id: u64
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    
    // Validate compost and item restrictions
    let (mut storage_box, _item_def) = validate_compost_and_item(ctx, box_id, item_instance_id)?;
    
    // Get the item to set compost timestamp
    let mut inventory_items = ctx.db.inventory_item();
    if let Some(mut item) = inventory_items.instance_id().find(&item_instance_id) {
        set_compost_timestamp(&mut item, ctx.timestamp);
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
 *                    SCHEDULED COMPOST PROCESSING                             *
 ******************************************************************************/

/// Scheduled reducer that processes compost conversion
/// Converts compostable items into fertilizer over time
#[spacetimedb::reducer]
pub fn process_compost_conversion(ctx: &ReducerContext, _args: CompostProcessSchedule) -> Result<(), String> {
    // Security check - only scheduler can run this
    if ctx.sender != ctx.identity() {
        return Err("Compost processing can only be run by scheduler".to_string());
    }
    
    // PERFORMANCE: Early exit if no compost bins exist
    // Compost bins are wooden_storage_boxes with BOX_TYPE_COMPOST
    let has_compost_bins = ctx.db.wooden_storage_box().iter().any(|b| b.box_type == BOX_TYPE_COMPOST);
    if !has_compost_bins {
        return Ok(());
    }
    
    let current_time = ctx.timestamp;
    
    // Find fertilizer definition
    let fertilizer_def_id: u64;
    let fertilizer_max_stack: u32;
    {
        let item_defs = ctx.db.item_definition();
        let mut found_def: Option<(u64, u32)> = None;
        for def in item_defs.iter() {
            if def.name == "Fertilizer" {
                let def_id = def.id;
                let max_stack = if def.is_stackable { def.stack_size } else { 1 };
                found_def = Some((def_id, max_stack));
                break;
            }
        }
        match found_def {
            Some((def_id, max_stack)) => {
                fertilizer_def_id = def_id;
                fertilizer_max_stack = max_stack;
            }
            None => {
                return Err("Fertilizer item definition not found".to_string());
            }
        }
    }
    
    // Collect all compost box IDs to process
    let mut compost_box_ids: Vec<u32> = Vec::new();
    {
        let boxes = ctx.db.wooden_storage_box();
        for storage_box in boxes.iter() {
            if storage_box.box_type == BOX_TYPE_COMPOST {
                compost_box_ids.push(storage_box.id);
            }
        }
    }
    
    // Process each compost box individually
    for box_id in compost_box_ids {
        let _ = process_single_compost_box(ctx, box_id, current_time, fertilizer_def_id, fertilizer_max_stack);
    }
    
    Ok(())
}

/// Process a single compost box conversion
fn process_single_compost_box(
    ctx: &ReducerContext,
    box_id: u32,
    current_time: Timestamp,
    fertilizer_def_id: u64,
    fertilizer_max_stack: u32,
) -> Result<(), String> {
    // Get fresh table handles
    let boxes_table = ctx.db.wooden_storage_box();
    let items_table = ctx.db.inventory_item();
    let defs_table = ctx.db.item_definition();
    
    // Find the compost box
    let compost_box_original = match boxes_table.id().find(&box_id) {
        Some(b) => b,
        None => return Ok(()), // Box was deleted
    };
    
    let mut compost_box = compost_box_original.clone();
    let num_slots: usize = compost_box.num_slots();
    
    let mut items_to_remove: Vec<(u8, u64)> = Vec::new();
    let mut items_to_timestamp: Vec<u64> = Vec::new();
    let mut fertilizer_to_add: u32 = 0;
    
    // Check each slot for compostable items
    // IMPORTANT: Process ONE unit at a time, not entire stacks
    let mut slot_idx: usize = 0;
    while slot_idx < num_slots {
        let slot_u8: u8 = slot_idx as u8;
        let maybe_item_id = compost_box.get_slot_instance_id(slot_u8);
        
        if let Some(item_instance_id) = maybe_item_id {
            let maybe_item = items_table.instance_id().find(&item_instance_id);
            if let Some(mut item) = maybe_item {
                let maybe_def = defs_table.id().find(&item.item_def_id);
                if let Some(item_def) = maybe_def {
                    let is_compostable: bool = is_item_compostable(&item_def, Some(&item));
                    if is_compostable {
                        let maybe_placed_at = get_compost_timestamp(&item);
                        if let Some(placed_at) = maybe_placed_at {
                            let current_micros: i64 = current_time.to_micros_since_unix_epoch();
                            let placed_micros: i64 = placed_at.to_micros_since_unix_epoch();
                            let elapsed_micros: u64 = (current_micros.saturating_sub(placed_micros)) as u64;
                            let elapsed_secs: u64 = elapsed_micros / 1_000_000;
                            if elapsed_secs >= COMPOST_CONVERSION_TIME_SECS {
                                // Convert ONE unit at a time, not the entire stack
                                fertilizer_to_add += COMPOST_FERTILIZER_PER_ITEM;
                                
                                // Reduce quantity by 1
                                if item.quantity > 1 {
                                    item.quantity -= 1;
                                    let remaining_qty = item.quantity; // Store before update moves item
                                    // Reset timestamp for the remaining stack (they start fresh)
                                    set_compost_timestamp(&mut item, current_time);
                                    items_table.instance_id().update(item);
                                    log::debug!("[Compost] Converted 1 unit from stack in slot {}. Remaining: {}. Timestamp reset.", slot_u8, remaining_qty);
                                } else {
                                    // Last unit converted, remove the item
                                    items_to_remove.push((slot_u8, item_instance_id));
                                    log::debug!("[Compost] Converted last unit from stack in slot {}. Removing item.", slot_u8);
                                }
                            }
                        } else {
                            items_to_timestamp.push(item_instance_id);
                        }
                    }
                }
            }
        }
        
        slot_idx += 1;
    }
    
    // Apply timestamp updates
    for item_id in items_to_timestamp {
        let maybe_item = items_table.instance_id().find(&item_id);
        if let Some(mut item) = maybe_item {
            set_compost_timestamp(&mut item, current_time);
            items_table.instance_id().update(item);
        }
    }
    
    // Remove converted items
    for (slot_u8, item_id) in items_to_remove {
        compost_box.set_slot(slot_u8, None, None);
        items_table.instance_id().delete(item_id);
    }
    
    // Add fertilizer to compost slots
    if fertilizer_to_add > 0 {
        // Try to stack with existing fertilizer
        let mut slot_idx: usize = 0;
        while slot_idx < num_slots && fertilizer_to_add > 0 {
            let slot_u8: u8 = slot_idx as u8;
            let maybe_existing_id = compost_box.get_slot_instance_id(slot_u8);
            
            if let Some(existing_id) = maybe_existing_id {
                let maybe_existing = items_table.instance_id().find(&existing_id);
                if let Some(mut existing_item) = maybe_existing {
                    if existing_item.item_def_id == fertilizer_def_id {
                        let current_qty: u32 = existing_item.quantity;
                        let space_available: u32 = fertilizer_max_stack.saturating_sub(current_qty);
                        if space_available > 0 {
                            let to_add: u32 = fertilizer_to_add.min(space_available);
                            existing_item.quantity += to_add;
                            items_table.instance_id().update(existing_item);
                            fertilizer_to_add -= to_add;
                        }
                    }
                }
            }
            
            slot_idx += 1;
        }
        
        // Fill empty slots
        while fertilizer_to_add > 0 {
            let mut placed: bool = false;
            let mut slot_idx: usize = 0;
            while slot_idx < num_slots {
                let slot_u8: u8 = slot_idx as u8;
                let is_empty: bool = compost_box.get_slot_instance_id(slot_u8).is_none();
                
                if is_empty {
                    let quantity_to_place: u32 = fertilizer_to_add.min(fertilizer_max_stack);
                    let new_location = ItemLocation::Container(ContainerLocationData {
                        container_type: ContainerType::WoodenStorageBox,
                        container_id: compost_box.id as u64,
                        slot_index: slot_u8,
                    });
                    
                    let new_item = InventoryItem {
                        instance_id: 0,
                        item_def_id: fertilizer_def_id,
                        quantity: quantity_to_place,
                        location: new_location,
                        item_data: None,
                    };
                    
                    let insert_result = items_table.try_insert(new_item);
                    match insert_result {
                        Ok(inserted) => {
                            compost_box.set_slot(slot_u8, Some(inserted.instance_id), Some(fertilizer_def_id));
                            fertilizer_to_add -= quantity_to_place;
                            placed = true;
                            break;
                        }
                        Err(e) => {
                            log::warn!("[Compost] Failed to insert fertilizer: {:?}", e);
                            break;
                        }
                    }
                }
                
                slot_idx += 1;
            }
            
            if !placed {
                // Drop remaining
                if fertilizer_to_add > 0 {
                    let drop_x: f32 = compost_box.pos_x;
                    let drop_y: f32 = compost_box.pos_y;
                    let drop_result = create_dropped_item_entity(ctx, fertilizer_def_id, fertilizer_to_add, drop_x, drop_y);
                    if let Err(e) = drop_result {
                        log::warn!("[Compost] Failed to drop fertilizer: {}", e);
                    } else {
                        log::info!("[Compost] Dropped {} fertilizer near compost {}", fertilizer_to_add, compost_box.id);
                    }
                }
                break;
            }
        }
    }
    
    // Update the box
    let boxes_table_mut = ctx.db.wooden_storage_box();
    boxes_table_mut.id().update(compost_box);
    
    Ok(())
}

