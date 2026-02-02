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
// Alpine animal skulls
const POLAR_BEAR_SKULL_FRAGMENTS: u32 = 30; // Massive skull - same as walrus
const HARE_SKULL_FRAGMENTS: u32 = 6;     // Small prey skull
const OWL_SKULL_FRAGMENTS: u32 = 10;     // Medium bird skull

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
        "Animal Bone" | "Human Skull" | "Fox Skull" | "Wolf Skull" | "Viper Skull" | "Walrus Skull" | "Vole Skull" | "Wolverine Skull" | "Whale Bone Fragment" | "Polar Bear Skull" | "Hare Skull" | "Owl Skull" => {
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
        // Alpine animal skulls
        "Polar Bear Skull" => POLAR_BEAR_SKULL_FRAGMENTS,
        "Hare Skull" => HARE_SKULL_FRAGMENTS,
        "Owl Skull" => OWL_SKULL_FRAGMENTS,
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

// =============================================================================
// FERMENTATION PREPARATION - Mashing & Yeast Extraction
// =============================================================================
// These reducers simplify the fermentation workflow by allowing direct conversion
// of raw materials into fermentation bases via the ItemInteractionPanel.

/// Berries that can be mashed into Berry Mash (1:1 conversion)
const MASHABLE_BERRIES: &[&str] = &[
    "Lingonberries",
    "Cloudberries",
    "Crowberries",
    "Crowberry",  // Singular form
    "Bilberries",
    "Wild Strawberries",
    "Rowan Berries",
    "Cranberries",
    "Nagoonberries",
];

/// Mashes berries into Berry Mash.
/// Simple 1:1 conversion - one berry becomes one berry mash.
/// If inventory is full, berry mash will be dropped near the player.
#[spacetimedb::reducer]
pub fn mash_berries(ctx: &ReducerContext, item_instance_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();

    // 1. Fetch and validate the item to mash
    let item_to_mash = inventory_table.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;

    let item_def = item_def_table.id().find(item_to_mash.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item_to_mash.item_def_id))?;

    // 2. Validate item is a mashable berry
    let item_name = item_def.name.as_str();
    if !MASHABLE_BERRIES.contains(&item_name) {
        return Err(format!("Cannot mash '{}'. Only berries can be mashed into Berry Mash.", item_def.name));
    }

    // Validate ownership through location
    match &item_to_mash.location {
        crate::models::ItemLocation::Inventory(data) if data.owner_id == sender_id => (),
        crate::models::ItemLocation::Hotbar(data) if data.owner_id == sender_id => (),
        crate::models::ItemLocation::Equipped(data) if data.owner_id == sender_id => (),
        _ => return Err("Item must be in your inventory, hotbar, or equipped to mash.".to_string()),
    }

    // Find the Berry Mash item definition
    let berry_mash_def = item_def_table.iter()
        .find(|def| def.name == "Berry Mash")
        .ok_or_else(|| "Berry Mash item definition not found".to_string())?;

    log::info!("[MashBerries] Player {} mashing {} into Berry Mash", sender_id, item_def.name);

    // 3. Update item quantity or delete if last one
    if item_to_mash.quantity > 1 {
        let mut updated_item = item_to_mash.clone();
        updated_item.quantity -= 1;
        inventory_table.instance_id().update(updated_item);
    } else {
        inventory_table.instance_id().delete(item_instance_id);
    }

    // 4. Give berry mash to player (1:1 conversion)
    match try_give_item_to_player(ctx, sender_id, berry_mash_def.id, 1) {
        Ok(added_to_inventory) => {
            if added_to_inventory {
                log::info!("[MashBerries] Added 1 Berry Mash to inventory for player {}", sender_id);
            } else {
                log::info!("[MashBerries] Inventory full, dropped 1 Berry Mash near player {}", sender_id);
            }
            Ok(())
        },
        Err(e) => Err(format!("Failed to give Berry Mash to player: {}", e))
    }
}

// NOTE: mash_flour reducer removed - flour is for baking bread, not brewing.
// Cooked starchy items are mashed directly into Starchy Mash via mash_starch reducer below.

/// Cooked starchy items that can be mashed into Starchy Mash (1:1 conversion)
/// Includes roots, bulbs, and other starchy foods once cooked
const MASHABLE_STARCH: &[&str] = &[
    "Cooked Potato",
    "Cooked Beet",
    "Cooked Pumpkin",
    "Cooked Kamchatka Lily Bulb",
    "Cooked Silverweed Root",
    "Cooked Bistort Bulbils",
    "Cooked Salsify Root",
];

/// Mashes cooked starchy items into Starchy Mash.
/// Simple 1:1 conversion - one cooked starchy item becomes one starchy mash.
/// If inventory is full, starchy mash will be dropped near the player.
#[spacetimedb::reducer]
pub fn mash_starch(ctx: &ReducerContext, item_instance_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();

    // 1. Fetch and validate the item to mash
    let item_to_mash = inventory_table.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;

    let item_def = item_def_table.id().find(item_to_mash.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item_to_mash.item_def_id))?;

    // 2. Validate item is a mashable cooked starchy item
    let item_name = item_def.name.as_str();
    if !MASHABLE_STARCH.contains(&item_name) {
        return Err(format!("Cannot mash '{}'. Only cooked starchy roots and bulbs can be mashed into Starchy Mash.", item_def.name));
    }

    // Validate ownership through location
    match &item_to_mash.location {
        crate::models::ItemLocation::Inventory(data) if data.owner_id == sender_id => (),
        crate::models::ItemLocation::Hotbar(data) if data.owner_id == sender_id => (),
        crate::models::ItemLocation::Equipped(data) if data.owner_id == sender_id => (),
        _ => return Err("Item must be in your inventory, hotbar, or equipped to mash.".to_string()),
    }

    // Find the Starchy Mash item definition
    let starchy_mash_def = item_def_table.iter()
        .find(|def| def.name == "Starchy Mash")
        .ok_or_else(|| "Starchy Mash item definition not found".to_string())?;

    log::info!("[MashStarch] Player {} mashing {} into Starchy Mash", sender_id, item_def.name);

    // 3. Update item quantity or delete if last one
    if item_to_mash.quantity > 1 {
        let mut updated_item = item_to_mash.clone();
        updated_item.quantity -= 1;
        inventory_table.instance_id().update(updated_item);
    } else {
        inventory_table.instance_id().delete(item_instance_id);
    }

    // 4. Give starchy mash to player (1:1 conversion)
    match try_give_item_to_player(ctx, sender_id, starchy_mash_def.id, 1) {
        Ok(added_to_inventory) => {
            if added_to_inventory {
                log::info!("[MashStarch] Added 1 Starchy Mash to inventory for player {}", sender_id);
            } else {
                log::info!("[MashStarch] Inventory full, dropped 1 Starchy Mash near player {}", sender_id);
            }
            Ok(())
        },
        Err(e) => Err(format!("Failed to give Starchy Mash to player: {}", e))
    }
}

/// Items from which yeast can be extracted (fermentable bases)
const YEAST_EXTRACTABLE: &[&str] = &[
    "Berry Mash",
    "Starchy Mash",
    "Raw Milk",
];

/// Extracts yeast from fermentable bases (mashes or raw milk).
/// Yields 1-2 yeast per extraction - the natural yeasts in the ingredients.
/// If inventory is full, yeast will be dropped near the player.
#[spacetimedb::reducer]
pub fn extract_yeast(ctx: &ReducerContext, item_instance_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();

    // 1. Fetch and validate the item to extract from
    let item_to_extract = inventory_table.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item {} not found", item_instance_id))?;

    let item_def = item_def_table.id().find(item_to_extract.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item_to_extract.item_def_id))?;

    // 2. Validate item is a yeast-extractable source
    let item_name = item_def.name.as_str();
    if !YEAST_EXTRACTABLE.contains(&item_name) {
        return Err(format!("Cannot extract yeast from '{}'. Only mashes and raw milk contain natural yeasts.", item_def.name));
    }

    // Validate ownership through location
    match &item_to_extract.location {
        crate::models::ItemLocation::Inventory(data) if data.owner_id == sender_id => (),
        crate::models::ItemLocation::Hotbar(data) if data.owner_id == sender_id => (),
        crate::models::ItemLocation::Equipped(data) if data.owner_id == sender_id => (),
        _ => return Err("Item must be in your inventory, hotbar, or equipped to extract yeast.".to_string()),
    }

    // Find the Yeast item definition
    let yeast_def = item_def_table.iter()
        .find(|def| def.name == "Yeast")
        .ok_or_else(|| "Yeast item definition not found".to_string())?;

    // 3. Calculate yeast yield (1-2 based on source richness)
    let yeast_to_create = match item_name {
        "Raw Milk" => ctx.rng().gen_range(1..=2),  // Milk is rich in lactobacillus
        "Berry Mash" => ctx.rng().gen_range(1..=2), // Wild yeasts on berry skins
        "Starchy Mash" => 1, // Less natural yeast than berry mash
        _ => 1,
    };

    log::info!("[ExtractYeast] Player {} extracting {} yeast from {}", sender_id, yeast_to_create, item_def.name);

    // 4. Update item quantity or delete if last one
    if item_to_extract.quantity > 1 {
        let mut updated_item = item_to_extract.clone();
        updated_item.quantity -= 1;
        inventory_table.instance_id().update(updated_item);
    } else {
        inventory_table.instance_id().delete(item_instance_id);
    }

    // 5. Give yeast to player
    match try_give_item_to_player(ctx, sender_id, yeast_def.id, yeast_to_create) {
        Ok(added_to_inventory) => {
            if added_to_inventory {
                log::info!("[ExtractYeast] Added {} Yeast to inventory for player {}", yeast_to_create, sender_id);
            } else {
                log::info!("[ExtractYeast] Inventory full, dropped {} Yeast near player {}", yeast_to_create, sender_id);
            }
            Ok(())
        },
        Err(e) => Err(format!("Failed to give Yeast to player: {}", e))
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

    // Validate ownership through location
    match &item_to_extract.location {
        crate::models::ItemLocation::Inventory(data) if data.owner_id == sender_id => (),
        crate::models::ItemLocation::Hotbar(data) if data.owner_id == sender_id => (),
        crate::models::ItemLocation::Equipped(data) if data.owner_id == sender_id => (),
        _ => return Err("Item must be in your inventory, hotbar, or equipped to extract.".to_string()),
    }

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