/******************************************************************************
 *                                                                            *
 * Repair Bench - A specialized WoodenStorageBox variant for repairing items. *
 * Extends the base WoodenStorageBox functionality with repair-specific       *
 * behavior: validates items have durability, calculates repair costs,        *
 * and performs item repairs.                                                 *
 *                                                                            *
 * PATTERN: Follows the same specialized container pattern as refrigerator.rs *
 * and compost.rs - uses the shared WoodenStorageBox table with box_type=5.  *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Table, Identity};
use log;

use crate::wooden_storage_box::{
    WoodenStorageBox, BOX_TYPE_REPAIR_BENCH, validate_box_interaction,
    wooden_storage_box as WoodenStorageBoxTableTrait,
    NUM_REPAIR_BENCH_SLOTS, REPAIR_BENCH_INITIAL_HEALTH, REPAIR_BENCH_MAX_HEALTH,
    BOX_COLLISION_Y_OFFSET,
};
use crate::items::{
    ItemDefinition, InventoryItem,
    inventory_item as InventoryItemTableTrait, 
    item_definition as ItemDefinitionTableTrait,
    add_item_to_player_inventory,
};
use crate::durability::{
    has_durability_system, can_item_be_repaired, calculate_repair_cost,
    check_player_has_repair_materials, consume_repair_materials, perform_item_repair,
    get_durability, get_max_durability, get_repair_count, MAX_REPAIR_COUNT,
};
use crate::inventory_management;
use crate::models::{ContainerType, ItemLocation, ContainerLocationData};
use crate::environment::calculate_chunk_index;
use crate::player as PlayerTableTrait;

/// Validates that a box is a repair bench and item has durability system
/// (For depositing items - allows items that don't currently need repair)
fn validate_repair_bench_and_durability_item(
    ctx: &ReducerContext,
    box_id: u32,
    item_instance_id: u64,
) -> Result<(WoodenStorageBox, ItemDefinition, InventoryItem), String> {
    let (_player, storage_box) = validate_box_interaction(ctx, box_id)?;
    
    // Ensure this is actually a repair bench
    if storage_box.box_type != BOX_TYPE_REPAIR_BENCH {
        return Err("This reducer is only for repair benches.".to_string());
    }
    
    // Get the item and its definition
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    
    let item = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;
    let item_def = item_defs.id().find(item.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item.item_def_id))?;
    
    // Only check if item HAS durability system (can be repaired in principle)
    // Allow items even if they don't currently need repair (full durability)
    if !has_durability_system(&item_def) {
        return Err("Only items with durability can be placed in the repair bench".to_string());
    }
    
    Ok((storage_box, item_def, item))
}

/// Validates that a box is a repair bench (without item validation)
fn validate_repair_bench(
    ctx: &ReducerContext,
    box_id: u32,
) -> Result<WoodenStorageBox, String> {
    let (_player, storage_box) = validate_box_interaction(ctx, box_id)?;
    
    // Ensure this is actually a repair bench
    if storage_box.box_type != BOX_TYPE_REPAIR_BENCH {
        return Err("This reducer is only for repair benches.".to_string());
    }
    
    Ok(storage_box)
}

/******************************************************************************
 *                    REPAIR BENCH-SPECIFIC REDUCERS                          *
 ******************************************************************************/

/// --- Place Repair Bench ---
/// Places a repair bench from the player's inventory into the world.
#[spacetimedb::reducer]
pub fn place_repair_bench(
    ctx: &ReducerContext,
    item_instance_id: u64,
    pos_x: f32,
    pos_y: f32,
) -> Result<(), String> {
    let players = ctx.db.player();
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    let mut boxes = ctx.db.wooden_storage_box();
    
    // Get the player
    let player = players.identity().find(&ctx.sender)
        .ok_or("Player not found")?;
    
    if player.is_dead {
        return Err("Cannot place items while dead".to_string());
    }
    
    // Get the item being placed
    let item = inventory_items.instance_id().find(item_instance_id)
        .ok_or("Item not found in inventory")?;
    
    // Verify the item is owned by this player
    if let Some(owner_id) = item.location.is_player_bound() {
        if owner_id != ctx.sender {
            return Err("You don't own this item".to_string());
        }
    } else {
        return Err("Item is not in your inventory".to_string());
    }
    
    // Get item definition and verify it's a repair bench
    let item_def = item_defs.id().find(item.item_def_id)
        .ok_or("Item definition not found")?;
    
    if item_def.name != "Repair Bench" {
        return Err("This item is not a Repair Bench".to_string());
    }
    
    // Calculate chunk index for the position
    let chunk_index = calculate_chunk_index(pos_x, pos_y);
    
    // Create the repair bench (WoodenStorageBox with box_type = 5)
    // Apply Y offset to match other box types (compensates for bottom-anchoring + render offset)
    let new_box = WoodenStorageBox {
        id: 0, // Auto-increment
        pos_x,
        pos_y: pos_y + BOX_COLLISION_Y_OFFSET,
        chunk_index,
        placed_by: ctx.sender,
        box_type: BOX_TYPE_REPAIR_BENCH,
        // Initialize all slots as empty (repair bench only uses slot 0)
        slot_instance_id_0: None, slot_def_id_0: None,
        slot_instance_id_1: None, slot_def_id_1: None,
        slot_instance_id_2: None, slot_def_id_2: None,
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
        // Large box slots (not used by repair bench)
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
        health: REPAIR_BENCH_INITIAL_HEALTH,
        max_health: REPAIR_BENCH_MAX_HEALTH,
        is_destroyed: false,
        destroyed_at: None,
        last_hit_time: None,
        last_damaged_by: None,
    };
    
    // Insert the repair bench
    match boxes.try_insert(new_box) {
        Ok(inserted) => {
            log::info!(
                "[RepairBench] Player {:?} placed Repair Bench {} at ({}, {})",
                ctx.sender, inserted.id, pos_x, pos_y
            );
            
            // Remove the item from inventory
            inventory_items.instance_id().delete(item_instance_id);
            
            Ok(())
        }
        Err(e) => {
            Err(format!("Failed to place repair bench: {:?}", e))
        }
    }
}

/// --- Move Item to Repair Bench ---
/// Moves an item from the player's inventory/hotbar INTO the repair bench slot.
/// Validates that the item can be repaired (has durability system, not too degraded).
#[spacetimedb::reducer]
pub fn move_item_to_repair_bench(
    ctx: &ReducerContext,
    box_id: u32,
    target_slot_index: u8,
    item_instance_id: u64,
) -> Result<(), String> {
    // Repair bench only has 1 slot (index 0)
    if target_slot_index >= NUM_REPAIR_BENCH_SLOTS as u8 {
        return Err(format!("Invalid slot index {}. Repair bench only has {} slot.", target_slot_index, NUM_REPAIR_BENCH_SLOTS));
    }
    
    let mut boxes = ctx.db.wooden_storage_box();
    
    // Validate repair bench and that item has durability (allows items at full durability)
    let (mut storage_box, _item_def, _item) = validate_repair_bench_and_durability_item(ctx, box_id, item_instance_id)?;
    
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

/// --- Quick Move To Repair Bench ---
/// Quickly moves an item FROM player inventory/hotbar TO the repair bench slot.
/// Validates that the item has a durability system (allows items at full durability).
#[spacetimedb::reducer]
pub fn quick_move_to_repair_bench(
    ctx: &ReducerContext,
    box_id: u32,
    item_instance_id: u64,
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    
    // Validate repair bench and that item has durability (allows items at full durability)
    let (mut storage_box, _item_def, _item) = validate_repair_bench_and_durability_item(ctx, box_id, item_instance_id)?;
    
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

/// --- Repair Item ---
/// Main repair logic. Repairs the item currently in the repair bench slot.
/// - Calculates repair cost based on item's crafting cost and repair count
/// - Consumes required materials from player inventory
/// - Reduces item's max durability by 25%
/// - Restores current durability to new max durability
/// - Increments repair count
#[spacetimedb::reducer]
pub fn repair_item(
    ctx: &ReducerContext,
    box_id: u32,
) -> Result<(), String> {
    let boxes = ctx.db.wooden_storage_box();
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    
    // Validate this is a repair bench
    let storage_box = validate_repair_bench(ctx, box_id)?;
    
    // Get the item in slot 0
    let item_instance_id = storage_box.slot_instance_id_0
        .ok_or("No item in repair bench slot")?;
    
    let item = inventory_items.instance_id().find(item_instance_id)
        .ok_or("Item in repair bench slot not found")?;
    
    let item_def = item_defs.id().find(item.item_def_id)
        .ok_or("Item definition not found")?;
    
    // Validate item can be repaired
    can_item_be_repaired(&item, &item_def)?;
    
    // Calculate repair cost
    let repair_cost = calculate_repair_cost(&item, &item_def)?;
    
    log::info!(
        "[RepairBench] Player {:?} attempting to repair '{}' (instance {}). Cost: {:?}",
        ctx.sender, item_def.name, item_instance_id, repair_cost
    );
    
    // Check player has materials
    check_player_has_repair_materials(ctx, ctx.sender, &repair_cost)?;
    
    // Consume materials
    consume_repair_materials(ctx, ctx.sender, &repair_cost)?;
    
    // Perform the repair
    let mut item_to_repair = item.clone();
    perform_item_repair(&mut item_to_repair);
    
    // Update the item in the database
    inventory_items.instance_id().update(item_to_repair.clone());
    
    log::info!(
        "[RepairBench] Successfully repaired '{}' (instance {}). New durability: {:.1}/{:.1}, Repair count: {}/{}",
        item_def.name, item_instance_id,
        get_durability(&item_to_repair).unwrap_or(0.0),
        get_max_durability(&item_to_repair),
        get_repair_count(&item_to_repair),
        MAX_REPAIR_COUNT
    );
    
    Ok(())
}

/// --- Pickup Repair Bench ---
/// Picks up an empty repair bench and adds it back to the player's inventory.
#[spacetimedb::reducer]
pub fn pickup_repair_bench(
    ctx: &ReducerContext,
    box_id: u32,
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    let item_defs = ctx.db.item_definition();
    
    // Validate this is a repair bench and player can interact
    let storage_box = validate_repair_bench(ctx, box_id)?;
    
    // Check that the repair bench is empty
    if storage_box.slot_instance_id_0.is_some() {
        return Err("Cannot pick up repair bench - it still has an item inside. Remove the item first.".to_string());
    }
    
    // Find the Repair Bench item definition
    let repair_bench_def = item_defs.iter()
        .find(|def| def.name == "Repair Bench")
        .ok_or("Repair Bench item definition not found")?;
    
    // Add the repair bench back to player inventory
    add_item_to_player_inventory(ctx, ctx.sender, repair_bench_def.id, 1)?;
    
    // Delete the repair bench entity
    boxes.id().delete(box_id);
    
    log::info!(
        "[RepairBench] Player {:?} picked up Repair Bench {} at ({}, {})",
        ctx.sender, box_id, storage_box.pos_x, storage_box.pos_y
    );
    
    Ok(())
}

// Note: move_item_from_repair_bench and quick_move_from_repair_bench can use the base
// wooden_storage_box reducers (move_item_from_box, quick_move_from_box) since moving
// items OUT of the repair bench doesn't require validation.

