/******************************************************************************
 *                                                                            *
 * Cooking Station - A specialized WoodenStorageBox variant that enables      *
 * proximity-based crafting of advanced food recipes. Unlike other containers,*
 * this has NO inventory slots - it purely acts as a crafting enabler when    *
 * players are standing nearby (within 100px).                                *
 *                                                                            *
 * PATTERN: Follows the same specialized container pattern as refrigerator.rs *
 * and repair_bench.rs - uses the shared WoodenStorageBox table with          *
 * box_type=6.                                                                *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Table, Timestamp};
use log;

use crate::wooden_storage_box::{
    WoodenStorageBox, BOX_TYPE_COOKING_STATION, validate_box_interaction,
    wooden_storage_box as WoodenStorageBoxTableTrait,
    COOKING_STATION_INITIAL_HEALTH, COOKING_STATION_MAX_HEALTH,
    BOX_COLLISION_Y_OFFSET,
};
use crate::items::{
    inventory_item as InventoryItemTableTrait, 
    item_definition as ItemDefinitionTableTrait,
    add_item_to_player_inventory,
};
use crate::environment::calculate_chunk_index;
use crate::player as PlayerTableTrait;

/// Cooking station proximity distance in pixels (250px for ease of use)
pub const COOKING_STATION_PROXIMITY_DISTANCE: f32 = 250.0;
pub const COOKING_STATION_PROXIMITY_DISTANCE_SQUARED: f32 = COOKING_STATION_PROXIMITY_DISTANCE * COOKING_STATION_PROXIMITY_DISTANCE;

/******************************************************************************
 *                    COOKING STATION-SPECIFIC REDUCERS                       *
 ******************************************************************************/

/// --- Place Cooking Station ---
/// Places a cooking station from the player's inventory into the world.
#[spacetimedb::reducer]
pub fn place_cooking_station(
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
    let player = players.identity().find(&ctx.sender())
        .ok_or("Player not found")?;
    
    if player.is_dead {
        return Err("Cannot place items while dead".to_string());
    }
    
    // Get the item being placed
    let item = inventory_items.instance_id().find(item_instance_id)
        .ok_or("Item not found in inventory")?;
    
    // Verify the item is owned by this player
    if let Some(owner_id) = item.location.is_player_bound() {
        if owner_id != ctx.sender() {
            return Err("You don't own this item".to_string());
        }
    } else {
        return Err("Item is not in your inventory".to_string());
    }
    
    // Get item definition and verify it's a cooking station
    let item_def = item_defs.id().find(item.item_def_id)
        .ok_or("Item definition not found")?;
    
    if item_def.name != "Cooking Station" {
        return Err("This item is not a Cooking Station".to_string());
    }
    
    // Validate placement distance (192px sprite, allow 200px range)
    const COOKING_STATION_PLACEMENT_MAX_DISTANCE: f32 = 200.0;
    let dx = player.position_x - pos_x;
    let dy = player.position_y - pos_y;
    if (dx * dx + dy * dy) > (COOKING_STATION_PLACEMENT_MAX_DISTANCE * COOKING_STATION_PLACEMENT_MAX_DISTANCE) {
        return Err("Placement location is too far away.".to_string());
    }
    
    // Calculate chunk index for the position
    let chunk_index = calculate_chunk_index(pos_x, pos_y);
    
    // Create the cooking station (WoodenStorageBox with box_type = 6)
    // Apply Y offset to match other box types (compensates for bottom-anchoring + render offset)
    let new_box = WoodenStorageBox {
        id: 0, // Auto-increment
        pos_x,
        pos_y: pos_y + BOX_COLLISION_Y_OFFSET,
        chunk_index,
        placed_by: ctx.sender(),
        box_type: BOX_TYPE_COOKING_STATION,
        // Initialize all slots as empty (cooking station has 0 slots, but we still need the fields)
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
        // Large box slots (unused for cooking station)
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
        // Health fields
        health: COOKING_STATION_INITIAL_HEALTH,
        max_health: COOKING_STATION_MAX_HEALTH,
        
        // Destruction tracking
        is_destroyed: false,
        destroyed_at: None,
        last_hit_time: None,
        last_damaged_by: None,
        respawn_at: Timestamp::UNIX_EPOCH, // 0 = not respawning (player-placed cooking stations don't respawn)
        // Monument placeable system (player-placed cooking stations are not monuments)
        is_monument: false,
        active_user_id: None,
        active_user_since: None,
    };
    
    // Insert the new cooking station
    match boxes.try_insert(new_box) {
        Ok(inserted_box) => {
            log::info!(
                "[CookingStation] Player {:?} placed cooking station {} at ({}, {})",
                ctx.sender(), inserted_box.id, pos_x, pos_y
            );
        }
        Err(e) => {
            return Err(format!("Failed to place cooking station: {}", e));
        }
    }
    
    // Remove the item from player's inventory (consume it)
    inventory_items.instance_id().delete(item_instance_id);
    
    log::info!(
        "[CookingStation] Consumed item instance {} from player {:?}",
        item_instance_id, ctx.sender()
    );
    
    Ok(())
}

/// --- Pickup Cooking Station ---
/// Picks up a cooking station and returns it to the player's inventory.
/// Since cooking stations have no inventory, they can always be picked up.
#[spacetimedb::reducer]
pub fn pickup_cooking_station(ctx: &ReducerContext, box_id: u32) -> Result<(), String> {
    let sender_id = ctx.sender();
    let mut boxes_table = ctx.db.wooden_storage_box();
    let item_defs_table = ctx.db.item_definition();
    
    log::info!("Player {:?} attempting to pick up cooking station {}.", sender_id, box_id);
    
    // 1. Validate Interaction
    let (_player, storage_box_to_pickup) = validate_box_interaction(ctx, box_id)?;
    
    // 2. Ensure this is actually a cooking station
    if storage_box_to_pickup.box_type != BOX_TYPE_COOKING_STATION {
        return Err("This reducer is only for cooking stations.".to_string());
    }
    
    // 3. Cooking station has no slots, so no need to check if empty
    
    // 4. Find the Cooking Station ItemDefinition
    let box_item_def = item_defs_table.iter()
        .find(|def| def.name == "Cooking Station")
        .ok_or("Could not find 'Cooking Station' item definition.")?;
    
    // 5. Add the item back to the player's inventory
    add_item_to_player_inventory(ctx, sender_id, box_item_def.id, 1)?;
    
    // 6. Delete the box entity
    boxes_table.id().delete(box_id);
    
    log::info!(
        "Player {:?} successfully picked up cooking station {} and received 1x '{}'.",
        sender_id, box_id, box_item_def.name
    );
    
    Ok(())
}

/// Check if a player is within proximity of any cooking station
/// Returns true if player is within COOKING_STATION_PROXIMITY_DISTANCE of any cooking station
pub fn is_player_near_cooking_station(ctx: &ReducerContext, player_x: f32, player_y: f32) -> bool {
    let boxes = ctx.db.wooden_storage_box();
    
    for box_entity in boxes.iter() {
        if box_entity.box_type != BOX_TYPE_COOKING_STATION {
            continue;
        }
        
        let dx = player_x - box_entity.pos_x;
        let dy = player_y - (box_entity.pos_y - BOX_COLLISION_Y_OFFSET); // Adjust for visual offset
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= COOKING_STATION_PROXIMITY_DISTANCE_SQUARED {
            return true;
        }
    }
    
    false
}

