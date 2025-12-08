/******************************************************************************
 *                                                                            *
 * Refrigerator-specific logic and reducers.                                  *
 * Extends the base WoodenStorageBox functionality with refrigerator-specific *
 * behavior like item restrictions (only food, seeds, water containers).     *
 *                                                                            *
 * PATTERN FOR SPECIALIZED CONTAINERS:                                        *
 *                                                                            *
 * This module establishes a pattern for creating specialized container      *
 * types that extend the base WoodenStorageBox functionality:                *
 *                                                                            *
 * 1. Create a new module file (e.g., refrigerator.rs)                      *
 * 2. Define container-specific constants (slots, health, etc.)             *
 * 3. Implement container-specific validation functions                     *
 * 4. Create wrapper reducers that:                                          *
 *    - Validate container type and restrictions                              *
 *    - Call the generic handlers from inventory_management.rs               *
 *    - Commit changes to the shared WoodenStorageBox table                  *
 *                                                                            *
 * Benefits:                                                                  *
 * - Keeps base box code clean and generic                                    *
 * - Allows each container type to have unique behaviors                      *
 * - Easy to add new specialized containers                                   *
 * - Shared table structure reduces database complexity                       *
 *                                                                            *
 * Example usage:                                                              *
 * - Base reducers: move_item_to_box, move_item_from_box, etc.               *
 * - Refrigerator reducers: move_item_to_refrigerator (adds validation)      *
 * - Both operate on the same WoodenStorageBox table                         *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Table};
use log;

use crate::wooden_storage_box::{WoodenStorageBox, BOX_TYPE_REFRIGERATOR, validate_box_interaction, wooden_storage_box as WoodenStorageBoxTableTrait};
use crate::items::{ItemDefinition, InventoryItem, inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait, get_water_content, get_water_container_capacity};
use crate::durability::is_food_item;
use crate::inventory_management;

/// Checks if an item is a portable water container (bottles/jugs that can be stored)
/// Excludes cauldrons and other placeable water containers.
/// 
/// This checks the definitive property: if an item has `water_liters` in its `item_data`,
/// it IS a portable water container. This is property-based, not name or description-based.
/// 
/// The presence of `water_liters` in `item_data` is the only reliable way to identify
/// a portable water container - it's an actual property of the item instance.
/// No fallbacks, no name checking, no description parsing - just the actual property.
fn is_portable_water_container(_item_def: &ItemDefinition, item_instance: Option<&InventoryItem>) -> bool {
    // Check if item has water_liters in item_data - this is the definitive property
    // If an item has been used as a water container (has water_liters), it IS a water container
    // This is the ONLY check - purely property-based
    if let Some(item) = item_instance {
        return get_water_content(item).is_some();
    }
    
    false
}

// --- Refrigerator Constants ---
pub const NUM_REFRIGERATOR_SLOTS: usize = 30;
pub const REFRIGERATOR_INITIAL_HEALTH: f32 = 1000.0;
pub const REFRIGERATOR_MAX_HEALTH: f32 = 1000.0;

/// Checks if an item is allowed to be stored in the refrigerator
/// Allowed items: food (hunger/thirst items), seeds, portable water containers
/// 
/// If an item_instance is provided, it will also check if the item has water_liters
/// in its item_data, which indicates it's a water container that's been used.
pub fn is_item_allowed_in_refrigerator(item_def: &ItemDefinition, item_instance: Option<&InventoryItem>) -> bool {
    // Food items (items with hunger or thirst stats)
    if is_food_item(item_def) {
        return true;
    }
    
    // Seeds (items with "Seeds" or "Seed" in name, typically Placeable category)
    if item_def.name.contains("Seeds") || item_def.name.contains("Seed") || item_def.name == "Seed Potato" {
        return true;
    }
    
    // Portable water containers (bottles/jugs that can be stored)
    // Excludes cauldrons which are placeable containers, not storage items
    if is_portable_water_container(item_def, item_instance) {
        return true;
    }
    
    false
}

/// Validates that a box is a refrigerator and performs item validation
fn validate_refrigerator_and_item(
    ctx: &ReducerContext,
    box_id: u32,
    item_instance_id: u64,
) -> Result<(WoodenStorageBox, ItemDefinition), String> {
    let (_player, storage_box) = validate_box_interaction(ctx, box_id)?;
    
    // Ensure this is actually a refrigerator
    if storage_box.box_type != BOX_TYPE_REFRIGERATOR {
        return Err("This reducer is only for refrigerators.".to_string());
    }
    
    // Validate the item is allowed in refrigerators
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    
    let item = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;
    let item_def = item_defs.id().find(item.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item.item_def_id))?;
    
    // Check if item is allowed - pass the item instance for water container detection
    if !is_item_allowed_in_refrigerator(&item_def, Some(&item)) {
        return Err(format!(
            "Cannot store '{}' in refrigerator. Only food, seeds, and portable water containers are allowed.", 
            item_def.name
        ));
    }
    
    Ok((storage_box, item_def))
}

/******************************************************************************
 *                    REFRIGERATOR-SPECIFIC REDUCERS                          *
 ******************************************************************************/

/// --- Move Item to Refrigerator ---
/// Moves an item from the player's inventory/hotbar INTO a specified slot in the refrigerator.
/// Adds refrigerator-specific validation (only food, seeds, water containers allowed).
#[spacetimedb::reducer]
pub fn move_item_to_refrigerator(
    ctx: &ReducerContext, 
    box_id: u32, 
    target_slot_index: u8, 
    item_instance_id: u64
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    
    // Validate refrigerator and item restrictions
    let (mut storage_box, _item_def) = validate_refrigerator_and_item(ctx, box_id, item_instance_id)?;
    
    // Call the generic handler (validation already done)
    inventory_management::handle_move_to_container_slot(
        ctx, 
        &mut storage_box, 
        target_slot_index, 
        item_instance_id
    )?;
    
    // Commit box update
    boxes.id().update(storage_box);
    Ok(())
}

/// --- Split Stack Into Refrigerator ---
/// Splits a stack from player inventory/hotbar into a specific refrigerator slot.
/// Adds refrigerator-specific validation.
#[spacetimedb::reducer]
pub fn split_stack_into_refrigerator(
    ctx: &ReducerContext,
    box_id: u32,
    target_slot_index: u8,
    source_item_instance_id: u64,
    quantity_to_split: u32,
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    
    // Validate refrigerator and item restrictions
    let (_storage_box, _item_def) = validate_refrigerator_and_item(ctx, box_id, source_item_instance_id)?;
    let (_player, mut storage_box) = validate_box_interaction(ctx, box_id)?;
    
    // Call the generic handler
    inventory_management::handle_split_into_container(
        ctx, 
        &mut storage_box, 
        target_slot_index, 
        source_item_instance_id, 
        quantity_to_split
    )?;
    
    boxes.id().update(storage_box);
    Ok(())
}

/// --- Quick Move To Refrigerator ---
/// Quickly moves an item FROM player inventory/hotbar TO the first available/mergeable slot in the refrigerator.
/// Adds refrigerator-specific validation.
#[spacetimedb::reducer]
pub fn quick_move_to_refrigerator(
    ctx: &ReducerContext, 
    box_id: u32, 
    item_instance_id: u64
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    
    // Validate refrigerator and item restrictions
    let (mut storage_box, _item_def) = validate_refrigerator_and_item(ctx, box_id, item_instance_id)?;
    
    // Call the generic handler
    inventory_management::handle_quick_move_to_container(
        ctx, 
        &mut storage_box, 
        item_instance_id
    )?;
    
    // Commit box update
    boxes.id().update(storage_box);
    Ok(())
}

// Note: Other reducers (move_from, move_within, split_from, split_within, quick_move_from, drop)
// don't need refrigerator-specific versions since they don't add items TO the refrigerator.
// They can use the base wooden_storage_box reducers directly.

