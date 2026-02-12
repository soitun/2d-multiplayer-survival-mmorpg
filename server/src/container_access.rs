//! Validates that a player can interact with items in external containers.
//! Used by consume/crush/pulverize/extract reducers to allow using items
//! directly from storage boxes, military rations, campfires, etc.

use spacetimedb::ReducerContext;
use crate::models::{ItemLocation, ContainerType};
use crate::items::InventoryItem;
use crate::player;
use crate::wooden_storage_box::wooden_storage_box;
use crate::campfire::campfire;
use crate::furnace::furnace;
use crate::fumarole::fumarole;
use crate::stash::stash;
use crate::player_corpse::player_corpse;
use crate::rain_collector::rain_collector;
use crate::barbecue::barbecue;
use crate::turret::turret;
use crate::lantern::lantern;
use crate::homestead_hearth::homestead_hearth;
use crate::broth_pot::broth_pot;

/// Interaction distance squared (same order as typical container interaction - 96px)
const CONTAINER_INTERACTION_DISTANCE_SQUARED: f32 = 96.0 * 96.0;

/// Validates that the player has access to use (consume, crush, etc.) the given item.
/// Returns Ok(()) if the item is in player's possession OR in an accessible container.
/// Returns Err if the item is in a container the player cannot access.

pub fn validate_player_can_use_item(ctx: &ReducerContext, item: &InventoryItem) -> Result<(), String> {
    let sender_id = ctx.sender;

    match &item.location {
        ItemLocation::Inventory(data) if data.owner_id == sender_id => Ok(()),
        ItemLocation::Hotbar(data) if data.owner_id == sender_id => Ok(()),
        ItemLocation::Equipped(data) if data.owner_id == sender_id => Ok(()),
        ItemLocation::Container(container_data) => {
            validate_container_access(ctx, container_data.container_type, container_data.container_id)
        }
        ItemLocation::Inventory(_) | ItemLocation::Hotbar(_) | ItemLocation::Equipped(_) => {
            Err("Item not in your possession.".to_string())
        }
        ItemLocation::Dropped(_) => Err("Cannot use dropped items directly. Pick them up first.".to_string()),
        ItemLocation::Unknown => Err("Item has an unknown location.".to_string()),
    }
}

fn validate_container_access(
    ctx: &ReducerContext,
    container_type: ContainerType,
    container_id: u64,
) -> Result<(), String> {
    let container_id_u32 = container_id as u32;
    let player = ctx.db.player().identity().find(&ctx.sender)
        .ok_or_else(|| "Player not found".to_string())?;

    let (pos_x, pos_y) = match container_type {
        ContainerType::WoodenStorageBox => {
            let box_entity = ctx.db.wooden_storage_box().id().find(container_id_u32)
                .ok_or_else(|| format!("Container {} not found", container_id))?;
            if box_entity.is_destroyed {
                return Err("Container is destroyed.".to_string());
            }
            (box_entity.pos_x, box_entity.pos_y)
        }
        ContainerType::Campfire => {
            let campfire = ctx.db.campfire().id().find(container_id_u32)
                .ok_or_else(|| format!("Campfire {} not found", container_id))?;
            (campfire.pos_x, campfire.pos_y)
        }
        ContainerType::Furnace => {
            let furnace = ctx.db.furnace().id().find(container_id_u32)
                .ok_or_else(|| format!("Furnace {} not found", container_id))?;
            (furnace.pos_x, furnace.pos_y)
        }
        ContainerType::Fumarole => {
            let fumarole = ctx.db.fumarole().id().find(container_id_u32)
                .ok_or_else(|| format!("Fumarole {} not found", container_id))?;
            (fumarole.pos_x, fumarole.pos_y)
        }
        ContainerType::Stash => {
            let stash = ctx.db.stash().id().find(container_id_u32)
                .ok_or_else(|| format!("Stash {} not found", container_id))?;
            if stash.is_destroyed {
                return Err("Stash is destroyed.".to_string());
            }
            if stash.is_hidden {
                return Err("Stash is hidden.".to_string());
            }
            (stash.pos_x, stash.pos_y)
        }
        ContainerType::PlayerCorpse => {
            let corpse = ctx.db.player_corpse().id().find(container_id_u32)
                .ok_or_else(|| format!("Corpse {} not found", container_id))?;
            (corpse.pos_x, corpse.pos_y)
        }
        ContainerType::RainCollector => {
            let collector = ctx.db.rain_collector().id().find(container_id_u32)
                .ok_or_else(|| format!("Rain collector {} not found", container_id))?;
            (collector.pos_x, collector.pos_y)
        }
        ContainerType::Barbecue => {
            let barbecue = ctx.db.barbecue().id().find(container_id_u32)
                .ok_or_else(|| format!("Barbecue {} not found", container_id))?;
            (barbecue.pos_x, barbecue.pos_y)
        }
        ContainerType::Turret => {
            let turret = ctx.db.turret().id().find(container_id_u32)
                .ok_or_else(|| format!("Turret {} not found", container_id))?;
            (turret.pos_x, turret.pos_y)
        }
        ContainerType::Lantern => {
            let lantern = ctx.db.lantern().id().find(container_id_u32)
                .ok_or_else(|| format!("Lantern {} not found", container_id))?;
            (lantern.pos_x, lantern.pos_y)
        }
        ContainerType::HomesteadHearth => {
            let hearth = ctx.db.homestead_hearth().id().find(container_id_u32)
                .ok_or_else(|| format!("Hearth {} not found", container_id))?;
            (hearth.pos_x, hearth.pos_y)
        }
        ContainerType::BrothPot => {
            let broth_pot = ctx.db.broth_pot().id().find(container_id_u32)
                .ok_or_else(|| format!("Broth pot {} not found", container_id))?;
            (broth_pot.pos_x, broth_pot.pos_y)
        }
    };

    let dx = player.position_x - pos_x;
    let dy = player.position_y - pos_y;
    if (dx * dx + dy * dy) > CONTAINER_INTERACTION_DISTANCE_SQUARED {
        return Err("Too far away from container.".to_string());
    }

    // Shelter access check for world containers
    if !crate::shelter::can_player_interact_with_object_in_shelter(
        ctx,
        ctx.sender,
        player.position_x,
        player.position_y,
        pos_x,
        pos_y,
    ) {
        return Err("Cannot interact with container inside shelter - only the shelter owner can access it from inside".to_string());
    }

    Ok(())
}
