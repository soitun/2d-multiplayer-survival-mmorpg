use spacetimedb::{ReducerContext, Table};
use log;
use rand::Rng;

use crate::items::{inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait};
use crate::dropped_item::try_give_item_to_player;

// =============================================================================
// GENERIC EXTRACTION - Single reducer for all extractable items
// =============================================================================
// Items with extraction_output_name, extraction_output_min, extraction_output_max set
// in ItemDefinition can be processed. Covers: crush bones, unravel rope, pulverize,
// mash berries/starch, extract yeast, gut fish. Honeycomb uses extract_from_honeycomb
// (probabilistic 15% Queen Bee / 85% Yeast).

/// Process any extractable item: crush, unravel, pulverize, mash, extract yeast, gut.
/// Uses ItemDefinition extraction_output_name, extraction_output_min, extraction_output_max.
/// If inventory is full, output will be dropped near the player.
#[spacetimedb::reducer]
pub fn process_extraction(ctx: &ReducerContext, item_instance_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();

    let item = inventory_table.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;

    let item_def = item_def_table.id().find(item.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item.item_def_id))?;

    let output_name = item_def.extraction_output_name.as_ref()
        .ok_or_else(|| format!("Cannot process '{}'. Item is not extractable.", item_def.name))?;

    let (min_out, max_out) = match (item_def.extraction_output_min, item_def.extraction_output_max) {
        (Some(min), Some(max)) if min <= max => (min, max),
        _ => return Err(format!("Invalid extraction config for '{}'.", item_def.name)),
    };

    crate::container_access::validate_player_can_use_item(ctx, &item)?;

    let output_def = item_def_table.iter()
        .find(|def| def.name == *output_name)
        .ok_or_else(|| format!("Output item '{}' not found", output_name))?;

    let output_quantity = ctx.rng().gen_range(min_out..=max_out);

    log::info!("[ProcessExtraction] Player {} processing {} into {} {}",
        sender_id, item_def.name, output_quantity, output_name);

    if item.quantity > 1 {
        let mut updated = item.clone();
        updated.quantity -= 1;
        inventory_table.instance_id().update(updated);
    } else {
        if let crate::models::ItemLocation::Container(ref loc) = &item.location {
            if !crate::items::clear_item_from_container_by_location(ctx, loc, item_instance_id) {
                crate::items::clear_item_from_any_container(ctx, item_instance_id);
            }
        }
        inventory_table.instance_id().delete(item_instance_id);
    }

    match try_give_item_to_player(ctx, sender_id, output_def.id, output_quantity) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to give {} to player: {}", output_name, e))
    }
}

// =============================================================================
// BEE PRODUCTS - Queen Bee Extraction
// =============================================================================

/// Extracts a Queen Bee from Honeycomb.
/// Destructive process - consumes the honeycomb to retrieve the queen.
/// Extracts from Honeycomb - chance to yield Queen Bee (rare, 15%) or Yeast (common, 85%).
/// If inventory is full, the item will be dropped near the player.
#[spacetimedb::reducer]
pub fn extract_from_honeycomb(ctx: &ReducerContext, item_instance_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();

    // 1. Fetch and validate the item to extract from
    let item_to_extract = inventory_table.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;

    let item_def = item_def_table.id().find(item_to_extract.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item_to_extract.item_def_id))?;

    // 2. Validate item is Honeycomb
    if item_def.name != "Honeycomb" {
        return Err(format!("Cannot extract from '{}'. Only Honeycomb can be extracted.", item_def.name));
    }

    crate::container_access::validate_player_can_use_item(ctx, &item_to_extract)?;

    // Find the Queen Bee and Yeast item definitions
    let queen_bee_def = item_def_table.iter()
        .find(|def| def.name == "Queen Bee")
        .ok_or_else(|| "Queen Bee item definition not found".to_string())?;
    
    let yeast_def = item_def_table.iter()
        .find(|def| def.name == "Yeast")
        .ok_or_else(|| "Yeast item definition not found".to_string())?;

    // 3. Roll for what we find: 15% Queen Bee, 85% Yeast
    let roll = ctx.rng().gen_range(0..100);
    let found_queen = roll < 15;

    log::info!("[Extract] Player {} extracting from honeycomb - Roll: {}, Found Queen: {}", sender_id, roll, found_queen);

    // 4. Update item quantity or delete if last one (honeycomb is consumed either way)
    if item_to_extract.quantity > 1 {
        let mut updated_item = item_to_extract.clone();
        updated_item.quantity -= 1;
        inventory_table.instance_id().update(updated_item);
    } else {
        if let crate::models::ItemLocation::Container(ref loc) = &item_to_extract.location {
            if !crate::items::clear_item_from_container_by_location(ctx, loc, item_instance_id) {
                crate::items::clear_item_from_any_container(ctx, item_instance_id);
            }
        }
        inventory_table.instance_id().delete(item_instance_id);
    }

    // 5. Give the extracted item to player
    if found_queen {
        match try_give_item_to_player(ctx, sender_id, queen_bee_def.id, 1) {
            Ok(added_to_inventory) => {
                if added_to_inventory {
                    log::info!("[Extract] Added 1 Queen Bee to inventory for player {}", sender_id);
                } else {
                    log::info!("[Extract] Inventory full, dropped 1 Queen Bee near player {}", sender_id);
                }
            },
            Err(e) => return Err(format!("Failed to give Queen Bee to player: {}", e))
        }
    } else {
        // Found yeast (85% chance)
        match try_give_item_to_player(ctx, sender_id, yeast_def.id, 1) {
            Ok(added_to_inventory) => {
                if added_to_inventory {
                    log::info!("[Extract] Added 1 Yeast to inventory for player {}", sender_id);
                } else {
                    log::info!("[Extract] Inventory full, dropped 1 Yeast near player {}", sender_id);
                }
            },
            Err(e) => return Err(format!("Failed to give Yeast to player: {}", e))
        }
    }
    
    Ok(())
}
