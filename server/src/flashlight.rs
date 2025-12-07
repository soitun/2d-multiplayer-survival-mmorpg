use spacetimedb::{ReducerContext, Identity, Timestamp, Table, log};
// Import necessary table traits
use crate::player;
use crate::active_equipment::active_equipment;
use crate::items::item_definition;
use crate::sound_events;

/// Update the flashlight aim angle (in radians) for smooth 360° aiming
/// This is called by the client when the mouse position changes and flashlight is on
#[spacetimedb::reducer]
pub fn update_flashlight_aim(ctx: &ReducerContext, aim_angle: f32) -> Result<(), String> {
    let sender_id = ctx.sender;
    let mut players_table = ctx.db.player();

    let mut player = players_table.identity().find(&sender_id)
        .ok_or_else(|| "Player not found.".to_string())?;

    // Only update if flashlight is on (optimization)
    if !player.is_flashlight_on {
        return Ok(()); // Silently ignore if flashlight is off
    }

    // Update the aim angle
    player.flashlight_aim_angle = aim_angle;
    // Don't update last_update timestamp - this is a high-frequency update
    // and we don't want it to interfere with other game logic

    players_table.identity().update(player);

    Ok(())
}

#[spacetimedb::reducer]
pub fn toggle_flashlight(ctx: &ReducerContext) -> Result<(), String> {
    let sender_id = ctx.sender;
    let mut players_table = ctx.db.player();
    let mut active_equipments_table = ctx.db.active_equipment();
    let item_defs_table = ctx.db.item_definition();

    let mut player = players_table.identity().find(&sender_id)
        .ok_or_else(|| "Player not found.".to_string())?;

    // Don't allow flashlight toggle if dead or knocked out
    if player.is_dead {
        return Err("Cannot toggle flashlight while dead.".to_string());
    }
    if player.is_knocked_out {
        return Err("Cannot toggle flashlight while knocked out.".to_string());
    }

    let mut equipment = active_equipments_table.player_identity().find(&sender_id)
        .ok_or_else(|| "Player has no active equipment record.".to_string())?;

    match equipment.equipped_item_def_id {
        Some(item_def_id) => {
            let item_def = item_defs_table.id().find(item_def_id)
                .ok_or_else(|| "Equipped item definition not found.".to_string())?;

            if item_def.name != "Flashlight" {
                return Err("Cannot toggle: Not a Flashlight.".to_string());
            }

            // Toggle the flashlight state
            player.is_flashlight_on = !player.is_flashlight_on;
            // Update player's last_update timestamp
            player.last_update = ctx.timestamp;

            // Update icon based on new state and play sounds
            if player.is_flashlight_on {
                equipment.icon_asset_name = Some("flashlight_on.png".to_string());
                sound_events::emit_flashlight_on_sound(ctx, player.position_x, player.position_y, sender_id);
                log::info!("Player {:?} turned on their flashlight.", sender_id);
            } else {
                equipment.icon_asset_name = Some("flashlight.png".to_string());
                sound_events::emit_flashlight_off_sound(ctx, player.position_x, player.position_y, sender_id);
                log::info!("Player {:?} turned off their flashlight.", sender_id);
            }

            // Update player and equipment records
            players_table.identity().update(player);
            active_equipments_table.player_identity().update(equipment);

            Ok(())
        }
        None => Err("No item equipped to toggle.".to_string()),
    }
}

