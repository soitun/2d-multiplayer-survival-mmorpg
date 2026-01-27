use spacetimedb::{ReducerContext, Identity, Table};
use log;
use rand::Rng;

use crate::items::{InventoryItem, ItemDefinition};
use crate::items::{inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait};
use crate::dropped_item::try_give_item_to_player;

// Constants for bone crushing
const MIN_FRAGMENTS_PER_BONE: u32 = 8; // New min value
const MAX_FRAGMENTS_PER_BONE: u32 = 12; // New max value

// Constants for rope unraveling (deconstruction with penalty)
// Rope costs 20 Plant Fiber to make, so we return 50-70% (10-14)
const MIN_FIBER_PER_ROPE: u32 = 10;
const MAX_FIBER_PER_ROPE: u32 = 14;

// Skull-specific fragment amounts (larger skulls yield more material)
const VOLE_SKULL_FRAGMENTS: u32 = 5;     // Tiny skull - smallest
const FOX_SKULL_FRAGMENTS: u32 = 15;     // Small skull
const WOLVERINE_SKULL_FRAGMENTS: u32 = 18; // Medium-sized fierce predator
const WOLF_SKULL_FRAGMENTS: u32 = 20;    // Baseline 
const VIPER_SKULL_FRAGMENTS: u32 = 22;   // Moderate
const HUMAN_SKULL_FRAGMENTS: u32 = 25;   // Strong
const WALRUS_SKULL_FRAGMENTS: u32 = 30;  // Largest skull, most material
const WHALE_BONE_FRAGMENT_FRAGMENTS: u32 = 3; // Small fishing junk, yields fewer fragments

/// Crushes a bone or skull item into bone fragments.
/// If inventory is full, fragments will be dropped near the player.
#[spacetimedb::reducer]
pub fn crush_bone_item(ctx: &ReducerContext, item_instance_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();

    // 1. Fetch and validate the item to crush
    let item_to_crush = inventory_table.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;

    let item_def = item_def_table.id().find(item_to_crush.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item_to_crush.item_def_id))?;

    // 2. Validate item ownership and type
    match item_def.name.as_str() {
        "Animal Bone" | "Human Skull" | "Fox Skull" | "Wolf Skull" | "Viper Skull" | "Walrus Skull" | "Vole Skull" | "Wolverine Skull" | "Whale Bone Fragment" => {
            // Validate ownership through location
            match &item_to_crush.location {
                crate::models::ItemLocation::Inventory(data) if data.owner_id == sender_id => (),
                crate::models::ItemLocation::Hotbar(data) if data.owner_id == sender_id => (),
                crate::models::ItemLocation::Equipped(data) if data.owner_id == sender_id => (),
                _ => return Err("Item must be in your inventory, hotbar, or equipped to crush.".to_string()),
            }
        },
        _ => return Err(format!("Cannot crush item '{}'. Only bones and skulls can be crushed.", item_def.name)),
    }

    // 3. Calculate number of fragments to create based on bone/skull size
    let fragments_to_create = match item_def.name.as_str() {
        "Animal Bone" => {
            // Use gen_range for a more idiomatic way to generate random numbers
            ctx.rng().gen_range(MIN_FRAGMENTS_PER_BONE..=MAX_FRAGMENTS_PER_BONE)
        },
        "Vole Skull" => VOLE_SKULL_FRAGMENTS,       // Tiny skull
        "Fox Skull" => FOX_SKULL_FRAGMENTS,
        "Wolverine Skull" => WOLVERINE_SKULL_FRAGMENTS, // Medium fierce predator
        "Wolf Skull" => WOLF_SKULL_FRAGMENTS, 
        "Viper Skull" => VIPER_SKULL_FRAGMENTS,
        "Human Skull" => HUMAN_SKULL_FRAGMENTS,
        "Walrus Skull" => WALRUS_SKULL_FRAGMENTS,
        "Whale Bone Fragment" => WHALE_BONE_FRAGMENT_FRAGMENTS, // Small fishing junk
        _ => unreachable!(), // We already validated the item type
    };

    // Find the Bone Fragments item definition by name
    let bone_fragments_def = item_def_table.iter()
        .find(|def| def.name == "Bone Fragments")
        .ok_or_else(|| "Bone Fragments item definition not found".to_string())?;

    // log::info!("[CrushBone] Player {} crushing {} into {} bone fragments", 
    //          sender_id, item_def.name, fragments_to_create);

    // 4. Update item quantity or delete if last one
    if item_to_crush.quantity > 1 {
        let mut updated_item = item_to_crush.clone();
        updated_item.quantity -= 1;
        inventory_table.instance_id().update(updated_item);
    } else {
        // Delete the item if it's the last one
        inventory_table.instance_id().delete(item_instance_id);
    }

    // 5. Give fragments to player (or drop near them if inventory full)
    match try_give_item_to_player(ctx, sender_id, bone_fragments_def.id, fragments_to_create) {
        Ok(added_to_inventory) => {
            if added_to_inventory {
                // log::info!("[CrushBone] Added {} bone fragments to inventory for player {}", fragments_to_create, sender_id);
            } else {
                // log::info!("[CrushBone] Inventory full, dropped {} bone fragments near player {}", fragments_to_create, sender_id);
            }
            Ok(())
        },
        Err(e) => Err(format!("Failed to give bone fragments to player: {}", e))
    }
}

/// Unravels rope back into plant fiber with a penalty.
/// Rope costs 20 Plant Fiber to make, but unraveling only returns 10-14 (50-70%).
/// If inventory is full, fiber will be dropped near the player.
#[spacetimedb::reducer]
pub fn unravel_rope(ctx: &ReducerContext, item_instance_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();

    // 1. Fetch and validate the item to unravel
    let item_to_unravel = inventory_table.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;

    let item_def = item_def_table.id().find(item_to_unravel.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item_to_unravel.item_def_id))?;

    // 2. Validate item is Rope and player owns it
    if item_def.name != "Rope" {
        return Err(format!("Cannot unravel '{}'. Only Rope can be unraveled into Plant Fiber.", item_def.name));
    }

    // Validate ownership through location
    match &item_to_unravel.location {
        crate::models::ItemLocation::Inventory(data) if data.owner_id == sender_id => (),
        crate::models::ItemLocation::Hotbar(data) if data.owner_id == sender_id => (),
        crate::models::ItemLocation::Equipped(data) if data.owner_id == sender_id => (),
        _ => return Err("Item must be in your inventory, hotbar, or equipped to unravel.".to_string()),
    }

    // 3. Calculate fiber to return (with penalty - 50-70% of original 20 cost)
    let fiber_to_create = ctx.rng().gen_range(MIN_FIBER_PER_ROPE..=MAX_FIBER_PER_ROPE);

    // Find the Plant Fiber item definition by name
    let plant_fiber_def = item_def_table.iter()
        .find(|def| def.name == "Plant Fiber")
        .ok_or_else(|| "Plant Fiber item definition not found".to_string())?;

    log::info!("[UnravelRope] Player {} unraveling rope into {} plant fiber (penalty applied)", 
             sender_id, fiber_to_create);

    // 4. Update item quantity or delete if last one
    if item_to_unravel.quantity > 1 {
        let mut updated_item = item_to_unravel.clone();
        updated_item.quantity -= 1;
        inventory_table.instance_id().update(updated_item);
    } else {
        // Delete the item if it's the last one
        inventory_table.instance_id().delete(item_instance_id);
    }

    // 5. Give plant fiber to player (or drop near them if inventory full)
    match try_give_item_to_player(ctx, sender_id, plant_fiber_def.id, fiber_to_create) {
        Ok(added_to_inventory) => {
            if added_to_inventory {
                log::info!("[UnravelRope] Added {} plant fiber to inventory for player {}", fiber_to_create, sender_id);
            } else {
                log::info!("[UnravelRope] Inventory full, dropped {} plant fiber near player {}", fiber_to_create, sender_id);
            }
            Ok(())
        },
        Err(e) => Err(format!("Failed to give plant fiber to player: {}", e))
    }
}

// Constants for pulverizing items into flour
const MIN_FLOUR_PER_BULB: u32 = 2;  // Bulbs/roots yield 2-3 flour each
const MAX_FLOUR_PER_BULB: u32 = 3;
const MIN_FLOUR_PER_SEEDS: u32 = 1; // Seeds yield 1-2 flour each
const MAX_FLOUR_PER_SEEDS: u32 = 2;

/// Items that can be pulverized into flour (traditional Aleut flour sources)
const PULVERIZABLE_ITEMS: &[&str] = &[
    "Kamchatka Lily Bulb",
    "Silverweed Root",
    "Bistort Bulbils",
    "Angelica Seeds",
    "Beach Lyme Grass Seeds",
];

/// Pulverizes starchy plants/seeds into flour.
/// Traditional Aleut method of creating flour from native plants.
/// If inventory is full, flour will be dropped near the player.
#[spacetimedb::reducer]
pub fn pulverize_item(ctx: &ReducerContext, item_instance_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();

    // 1. Fetch and validate the item to pulverize
    let item_to_pulverize = inventory_table.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;

    let item_def = item_def_table.id().find(item_to_pulverize.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item_to_pulverize.item_def_id))?;

    // 2. Validate item is pulverizable
    let item_name = item_def.name.as_str();
    if !PULVERIZABLE_ITEMS.contains(&item_name) {
        return Err(format!("Cannot pulverize '{}'. Only starchy roots, bulbs, and certain seeds can be ground into flour.", item_def.name));
    }

    // Validate ownership through location
    match &item_to_pulverize.location {
        crate::models::ItemLocation::Inventory(data) if data.owner_id == sender_id => (),
        crate::models::ItemLocation::Hotbar(data) if data.owner_id == sender_id => (),
        crate::models::ItemLocation::Equipped(data) if data.owner_id == sender_id => (),
        _ => return Err("Item must be in your inventory, hotbar, or equipped to pulverize.".to_string()),
    }

    // 3. Calculate flour yield based on item type
    let flour_to_create = match item_name {
        "Kamchatka Lily Bulb" | "Silverweed Root" | "Bistort Bulbils" => {
            // Bulbs and roots yield more flour
            ctx.rng().gen_range(MIN_FLOUR_PER_BULB..=MAX_FLOUR_PER_BULB)
        },
        "Angelica Seeds" | "Beach Lyme Grass Seeds" => {
            // Seeds yield less flour
            ctx.rng().gen_range(MIN_FLOUR_PER_SEEDS..=MAX_FLOUR_PER_SEEDS)
        },
        _ => unreachable!(), // Already validated above
    };

    // Find the Flour item definition by name
    let flour_def = item_def_table.iter()
        .find(|def| def.name == "Flour")
        .ok_or_else(|| "Flour item definition not found".to_string())?;

    log::info!("[PulverizeItem] Player {} pulverizing {} into {} flour", 
             sender_id, item_def.name, flour_to_create);

    // 4. Update item quantity or delete if last one
    if item_to_pulverize.quantity > 1 {
        let mut updated_item = item_to_pulverize.clone();
        updated_item.quantity -= 1;
        inventory_table.instance_id().update(updated_item);
    } else {
        // Delete the item if it's the last one
        inventory_table.instance_id().delete(item_instance_id);
    }

    // 5. Give flour to player (or drop near them if inventory full)
    match try_give_item_to_player(ctx, sender_id, flour_def.id, flour_to_create) {
        Ok(added_to_inventory) => {
            if added_to_inventory {
                log::info!("[PulverizeItem] Added {} flour to inventory for player {}", flour_to_create, sender_id);
            } else {
                log::info!("[PulverizeItem] Inventory full, dropped {} flour near player {}", flour_to_create, sender_id);
            }
            Ok(())
        },
        Err(e) => Err(format!("Failed to give flour to player: {}", e))
    }
} 