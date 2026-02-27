/******************************************************************************
 *                                                                            *
 * Headlamp Module                                                            *
 * Handles toggling the headlamp (tallow head-mounted light source)           *
 * The headlamp is a head armor item that provides hands-free lighting        *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Table, log};
// Import necessary table traits
use crate::player;
use crate::active_equipment::active_equipment;
use crate::items::item_definition;
use crate::items::inventory_item;
use crate::sound_events;

// Headlamp warmth constant (similar to torch)
// Provides warmth when lit to help counteract cold
pub const HEADLAMP_WARMTH_PER_SECOND: f32 = 1.5;

#[spacetimedb::reducer]
pub fn toggle_headlamp(ctx: &ReducerContext) -> Result<(), String> {
    let sender_id = ctx.sender();
    let players_table = ctx.db.player();
    let active_equipments_table = ctx.db.active_equipment();
    let item_defs_table = ctx.db.item_definition();
    let inventory_items_table = ctx.db.inventory_item();

    let mut player = players_table.identity().find(&sender_id)
        .ok_or_else(|| "Player not found.".to_string())?;

    // Don't allow headlamp toggle if dead or knocked out
    if player.is_dead {
        return Err("Cannot toggle headlamp while dead.".to_string());
    }
    if player.is_knocked_out {
        return Err("Cannot toggle headlamp while knocked out.".to_string());
    }

    let equipment = active_equipments_table.player_identity().find(&sender_id)
        .ok_or_else(|| "Player has no active equipment record.".to_string())?;

    // Check if player has something equipped in head slot
    let head_item_instance_id = equipment.head_item_instance_id
        .ok_or_else(|| "No item equipped in head slot.".to_string())?;

    // Get the inventory item to find its definition
    let head_item = inventory_items_table.instance_id().find(head_item_instance_id)
        .ok_or_else(|| "Head item not found in inventory.".to_string())?;

    // Get the item definition
    let item_def = item_defs_table.id().find(head_item.item_def_id)
        .ok_or_else(|| "Head item definition not found.".to_string())?;

    // Check if the head item is a Headlamp
    if item_def.name != "Headlamp" {
        return Err(format!("Cannot toggle: {} is not a Headlamp.", item_def.name));
    }

    // Check durability - don't allow lighting if durability is 0
    // Durability is stored in item_data JSON field
    if let Some(durability) = crate::durability::get_durability(&head_item) {
        if durability <= 0.0 && !player.is_headlamp_lit {
            return Err("Headlamp is burned out. Craft a new one.".to_string());
        }
    }

    // Toggle the lit state
    player.is_headlamp_lit = !player.is_headlamp_lit;
    player.last_update = ctx.timestamp;

    // Emit sounds based on new state
    if player.is_headlamp_lit {
        sound_events::emit_light_torch_sound(ctx, player.position_x, player.position_y, sender_id);
        log::info!("Player {:?} lit their headlamp.", sender_id);
    } else {
        sound_events::emit_extinguish_torch_sound(ctx, player.position_x, player.position_y, sender_id);
        log::info!("Player {:?} extinguished their headlamp.", sender_id);
    }

    // Update player record
    players_table.identity().update(player);

    Ok(())
}

