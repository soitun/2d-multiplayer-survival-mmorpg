/******************************************************************************
 * Snorkel Module                                                              *
 * Handles toggling the reed snorkel for underwater stealth                    *
 * The snorkel is a HEAD ARMOR SLOT item (like headlamp) that allows players   *
 * to hide in water, becoming invisible to wild animals.                       *
 * Only works when standing in water. Frees hands for underwater weapons.      *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Table, log};
use crate::player;
use crate::active_equipment::active_equipment;
use crate::items::item_definition;
use crate::items::inventory_item;
use crate::sound_events;

/// Toggle the snorkel state (submerge/emerge)
/// Snorkel is equipped in HEAD SLOT (like headlamp), freeing hands for underwater weapons
/// Only works when player is standing in water and wearing the reed snorkel
#[spacetimedb::reducer]
pub fn toggle_snorkel(ctx: &ReducerContext) -> Result<(), String> {
    let sender_id = ctx.sender;
    let players_table = ctx.db.player();
    let active_equipments_table = ctx.db.active_equipment();
    let item_defs_table = ctx.db.item_definition();
    let inventory_items_table = ctx.db.inventory_item();

    let mut player = players_table.identity().find(&sender_id)
        .ok_or_else(|| "Player not found.".to_string())?;

    // Don't allow snorkel toggle if dead or knocked out
    if player.is_dead {
        return Err("Cannot toggle snorkel while dead.".to_string());
    }
    if player.is_knocked_out {
        return Err("Cannot toggle snorkel while knocked out.".to_string());
    }

    let equipment = active_equipments_table.player_identity().find(&sender_id)
        .ok_or_else(|| "Player has no active equipment record.".to_string())?;

    // Check if player has something equipped in HEAD SLOT (like headlamp)
    let head_item_instance_id = equipment.head_item_instance_id
        .ok_or_else(|| "No item equipped in head slot.".to_string())?;

    // Get the inventory item to find its definition
    let head_item = inventory_items_table.instance_id().find(head_item_instance_id)
        .ok_or_else(|| "Head item not found in inventory.".to_string())?;

    // Get the item definition
    let item_def = item_defs_table.id().find(head_item.item_def_id)
        .ok_or_else(|| "Head item definition not found.".to_string())?;

    // Check if the head item is a Snorkel
    if item_def.name != "Reed Diver's Helm" {
        return Err(format!("Cannot toggle: {} is not a Reed Snorkel.", item_def.name));
    }

    // Check durability - don't allow submerging if durability is 0
    if let Some(durability) = crate::durability::get_durability(&head_item) {
        if durability <= 0.0 && !player.is_snorkeling {
            return Err("Snorkel is broken. Craft a new one.".to_string());
        }
    }

    // If trying to submerge, check if player is on water
    if !player.is_snorkeling && !player.is_on_water {
        return Err("Cannot submerge: Must be standing in water.".to_string());
    }
    
    // Don't allow snorkeling in hot springs - they're too shallow and hot!
    if !player.is_snorkeling && crate::active_effects::is_player_in_hot_spring(ctx, player.position_x, player.position_y) {
        return Err("Cannot submerge: The hot spring is too shallow and warm!".to_string());
    }

    // Toggle the snorkeling state
    player.is_snorkeling = !player.is_snorkeling;
    player.last_update = ctx.timestamp;

    // Play sound and log
    if player.is_snorkeling {
        sound_events::emit_snorkel_submerge_sound(ctx, player.position_x, player.position_y, sender_id);
        log::info!("Player {:?} submerged with snorkel.", sender_id);
        
        // Clear non-underwater-capable items when submerging
        // EXCEPTION: Underwater weapons and tools can stay equipped
        if let Some(mut equip) = active_equipments_table.player_identity().find(&sender_id) {
            if let Some(equipped_def_id) = equip.equipped_item_def_id {
                // Check if the equipped item is underwater-capable
                let is_underwater_capable = if let Some(item_def) = item_defs_table.id().find(equipped_def_id) {
                    matches!(item_def.name.as_str(), "Reed Harpoon" | "Reed Harpoon Gun" | "Diving Pick")
                } else {
                    false
                };
                
                if !is_underwater_capable {
                    log::info!("Player {:?} submerged - unequipping non-underwater item (instance: {:?}).", 
                        sender_id, equip.equipped_item_instance_id);
                    equip.equipped_item_def_id = None;
                    equip.equipped_item_instance_id = None;
                    equip.swing_start_time_ms = 0;
                    equip.icon_asset_name = None;
                    equip.loaded_ammo_def_id = None;
                    equip.loaded_ammo_count = 0;
                    equip.is_ready_to_fire = false;
                    active_equipments_table.player_identity().update(equip);
                } else {
                    log::info!("Player {:?} submerged - keeping underwater-capable item equipped.", sender_id);
                }
            }
        }
        
        // Also turn off torch/flashlight if they were on
        if player.is_torch_lit {
            player.is_torch_lit = false;
            log::info!("Player {:?} submerged - extinguishing torch.", sender_id);
        }
        if player.is_flashlight_on {
            player.is_flashlight_on = false;
            log::info!("Player {:?} submerged - turning off flashlight.", sender_id);
        }
    } else {
        sound_events::emit_snorkel_emerge_sound(ctx, player.position_x, player.position_y, sender_id);
        log::info!("Player {:?} emerged from water.", sender_id);
    }

    // Update player record
    players_table.identity().update(player);

    Ok(())
}

/// Auto-deactivate snorkeling when player leaves water or enters a hot spring
/// Called from player_movement when is_on_water changes or position changes
pub fn check_snorkel_auto_disable(ctx: &ReducerContext, player: &mut crate::Player) {
    if !player.is_snorkeling {
        return;
    }
    
    // If player is no longer on water, auto-disable snorkeling
    if !player.is_on_water {
        player.is_snorkeling = false;
        sound_events::emit_snorkel_emerge_sound(ctx, player.position_x, player.position_y, player.identity);
        log::info!("Player {:?} auto-emerged from snorkel (left water).", player.identity);
        return;
    }
    
    // If player walked into a hot spring while snorkeling, auto-emerge
    // Hot springs are too shallow and warm for snorkeling!
    if crate::active_effects::is_player_in_hot_spring(ctx, player.position_x, player.position_y) {
        player.is_snorkeling = false;
        sound_events::emit_snorkel_emerge_sound(ctx, player.position_x, player.position_y, player.identity);
        log::info!("Player {:?} auto-emerged from snorkel (entered hot spring).", player.identity);
    }
}
