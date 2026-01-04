use spacetimedb::{Identity, ReducerContext};
use spacetimedb::Table;
use log;

// Import needed Item types and Table Traits
use crate::items::{ItemDefinition, InventoryItem, item_definition as ItemDefinitionTableTrait, inventory_item as InventoryItemTableTrait};
// Import ActiveEquipment types and Table Trait
use crate::active_equipment::{ActiveEquipment, active_equipment as ActiveEquipmentTableTrait};
// Import ItemLocation and EquipmentSlotType
use crate::models::{ItemLocation, EquipmentSlotType};

// ============================================================================
// LOADOUT CONFIGURATION
// ============================================================================
// Change ACTIVE_LOADOUT to switch between different starting item sets.
// This makes testing different game scenarios much easier!

/// Available loadout presets for testing different game scenarios.
#[derive(Clone, Copy, Debug)]
#[allow(dead_code)]
pub enum LoadoutType {
    /// Default game mode: Combat Ladle, Torch, Cauldron, Water Bottle
    Basic,
    /// Building testing: Blueprint, Repair Hammer, Door, lots of materials
    Building,
    /// Melee combat testing: Various melee weapons
    Combat,
    /// Ranged combat testing: Bows, crossbow, arrows
    Ranged,
    /// Firearm testing: Makarov with ammo
    Firearms,
    /// Full survival testing: Tools, food, storage
    Survival,
    /// Developer mode: Everything you need for debugging (weapons, tools, materials)
    Developer,
    /// Swimming/Water testing: Snorkel, fishing rod, water containers
    Swimming,
    /// Farming testing: Seeds, compost, fertilizer, water containers
    Farming,
    /// Explosives testing: Babushka's Surprise and Matriarch's Wrath
    Explosives,
}

// ⬇️ CHANGE THIS TO SWITCH LOADOUTS ⬇️
const ACTIVE_LOADOUT: LoadoutType = LoadoutType::Basic;  

// Configuration flag: Set to false to disable starting equipment (cloth armor)
const GRANT_STARTING_EQUIPMENT: bool = false;

/// Returns the item list for the specified loadout type.
/// Format: (item_name, quantity, hotbar_slot, inventory_slot)
fn get_loadout_items(loadout: LoadoutType) -> Vec<(&'static str, u32, Option<u8>, Option<u16>)> {
    match loadout {
        // ====================================================================
        // BASIC - Default game mode, minimal starting gear
        // ====================================================================
        LoadoutType::Basic => vec![
            // Hotbar
            ("Combat Ladle", 1, Some(0), None),
            ("Torch", 1, Some(1), None),
            ("Cerametal Field Cauldron Mk. II", 1, Some(2), None),
            ("Reed Water Bottle", 1, Some(3), None),
        ],

        // ====================================================================
        // BUILDING - For testing the building system
        // ====================================================================
        LoadoutType::Building => vec![
            // Hotbar - Building essentials
            ("Combat Ladle", 1, Some(0), None),
            ("Torch", 1, Some(1), None),
            ("Blueprint", 1, Some(2), None),
            ("Repair Hammer", 1, Some(3), None),
            ("Wood Door", 5, Some(4), None),
            ("Metal Door", 3, Some(5), None),
            // Inventory - Building materials
            ("Wood", 5000, None, Some(0)),
            ("Stone", 3000, None, Some(1)),
            ("Metal Fragments", 2000, None, Some(2)),
            ("Rope", 50, None, Some(3)),
            ("Cloth", 100, None, Some(4)),
            ("Matron's Chest", 1, None, Some(5)),
            ("Sleeping Bag", 3, None, Some(6)),
            ("Shelter", 5, None, Some(7)),
        ],

        // ====================================================================
        // COMBAT - Melee weapons testing
        // ====================================================================
        LoadoutType::Combat => vec![
            // Hotbar - Various melee weapons
            ("Wooden Spear", 1, Some(0), None),
            ("Stone Spear", 1, Some(1), None),
            ("Bush Knife", 1, Some(2), None),
            ("Battle Axe", 1, Some(3), None),
            ("Metal Dagger", 1, Some(4), None),
            ("Torch", 1, Some(5), None),
            // Inventory - More weapons and support
            ("Bone Shiv", 1, None, Some(0)),
            ("Stone Mace", 1, None, Some(1)),
            ("War Hammer", 1, None, Some(2)),
            ("Scythe", 1, None, Some(3)),
            ("Bandage", 10, None, Some(4)),
            ("Cerametal Field Cauldron Mk. II", 1, None, Some(5)),
            ("Reed Water Bottle", 1, None, Some(6)),
        ],

        // ====================================================================
        // RANGED - Bows and crossbow testing
        // ====================================================================
        LoadoutType::Ranged => vec![
            // Hotbar
            ("Hunting Bow", 1, Some(0), None),
            ("Crossbow", 1, Some(1), None),
            ("Bush Knife", 1, Some(2), None),        // Backup melee
            ("Torch", 1, Some(3), None),
            ("Reed Water Bottle", 1, Some(4), None),
            ("Bandage", 10, Some(5), None),
            // Inventory - Ammo variety
            ("Wooden Arrow", 200, None, Some(0)),
            ("Bone Arrow", 100, None, Some(1)),
            ("Fire Arrow", 50, None, Some(2)),
            ("Hollow Reed Arrow", 150, None, Some(3)),
            ("Cerametal Field Cauldron Mk. II", 1, None, Some(4)),
        ],

        // ====================================================================
        // FIREARMS - Gun combat testing
        // ====================================================================
        LoadoutType::Firearms => vec![
            // Hotbar
            ("Makarov PM", 1, Some(0), None),
            ("Crossbow", 1, Some(1), None),       // Backup ranged
            ("Metal Dagger", 1, Some(2), None),   // Backup melee
            ("Torch", 1, Some(3), None),
            ("Bandage", 10, Some(4), None),
            ("Reed Water Bottle", 1, Some(5), None),
            // Inventory - Lots of ammo
            ("9x18mm Round", 500, None, Some(0)),
            ("Bone Arrow", 100, None, Some(1)),
            ("Gunpowder", 200, None, Some(2)),
            ("Metal Fragments", 500, None, Some(3)),
            ("Charcoal", 200, None, Some(4)),
            ("Sulfur", 100, None, Some(5)),
            ("Cerametal Field Cauldron Mk. II", 1, None, Some(6)),
        ],

        // ====================================================================
        // SURVIVAL - Testing survival mechanics (food, water, temperature)
        // ====================================================================
        LoadoutType::Survival => vec![
            // Hotbar - Survival tools
            ("Stone Hatchet", 1, Some(0), None),
            ("Stone Pickaxe", 1, Some(1), None),
            ("Wooden Spear", 1, Some(2), None),
            ("Torch", 1, Some(3), None),
            ("Reed Water Bottle", 1, Some(4), None),
            ("Cerametal Field Cauldron Mk. II", 1, Some(5), None),
            // Inventory - Survival supplies
            ("Bandage", 10, None, Some(0)),
            ("Shelter", 2, None, Some(1)),
            ("Sleeping Bag", 2, None, Some(2)),
            ("Camp Fire", 5, None, Some(3)),
            ("Wooden Storage Box", 3, None, Some(4)),
            ("Lantern", 2, None, Some(5)),
            ("Wood", 500, None, Some(6)),
            ("Stone", 300, None, Some(7)),
            ("Plant Fiber", 200, None, Some(8)),
            ("Cloth", 50, None, Some(9)),
        ],

        // ====================================================================
        // DEVELOPER - Full debug loadout with everything
        // ====================================================================
        LoadoutType::Developer => vec![
            // Hotbar - Best tools
            ("Makarov PM", 1, Some(0), None),
            ("Crossbow", 1, Some(1), None),
            ("Battle Axe", 1, Some(2), None),
            ("Metal Hatchet", 1, Some(3), None),
            ("Metal Pickaxe", 1, Some(4), None),
            ("Blueprint", 1, Some(5), None),
            // Inventory - Everything for testing
            ("9x18mm Round", 500, None, Some(0)),
            ("Bone Arrow", 200, None, Some(1)),
            ("Wood", 10000, None, Some(2)),
            ("Stone", 5000, None, Some(3)),
            ("Metal Fragments", 5000, None, Some(4)),
            ("Rope", 100, None, Some(5)),
            ("Cloth", 500, None, Some(6)),
            ("Bandage", 10, None, Some(7)),
            ("Cerametal Field Cauldron Mk. II", 1, None, Some(8)),
            ("Reed Water Bottle", 1, None, Some(9)),
            ("Plastic Water Jug", 1, None, Some(10)),
            ("Repair Hammer", 1, None, Some(11)),
            ("Wood Door", 10, None, Some(12)),
            ("Metal Door", 5, None, Some(13)),
            ("Matron's Chest", 2, None, Some(14)),
            ("Shelter", 5, None, Some(15)),
            ("Sleeping Bag", 5, None, Some(16)),
            ("Camp Fire", 5, None, Some(17)),
            ("Furnace", 3, None, Some(18)),
            ("Large Wooden Storage Box", 5, None, Some(19)),
            ("Barbecue", 3, None, Some(20)),
            ("Compost", 3, None, Some(21)),
            ("Gunpowder", 500, None, Some(22)),
            ("Wolf Fur Hood", 1, None, Some(23)),
        ],

        // ====================================================================
        // SWIMMING - Water exploration and fishing
        // ====================================================================
        LoadoutType::Swimming => vec![
            // Hotbar - Water essentials
            ("Primitive Reed Fishing Rod", 1, Some(0), None),
            ("Bone Gaff Hook", 1, Some(1), None),
            ("Reed Harpoon", 1, Some(2), None),       // Underwater weapon
            ("Torch", 1, Some(3), None),
            ("Plastic Water Jug", 1, Some(4), None),
            ("Cerametal Field Cauldron Mk. II", 1, Some(5), None),
            // Inventory - Fishing & water supplies
            ("Reed Water Bottle", 1, None, Some(0)),
            ("Reed Rain Collector", 3, None, Some(1)),
            ("Reed Diver's Helm", 1, None, Some(2)),   // Snorkel for underwater exploration
            ("Bandage", 10, None, Some(3)),
            ("Camp Fire", 3, None, Some(4)),
            ("Reed Harpoon Gun", 1, None, Some(5)),
            ("Reed Harpoon Dart", 100, None, Some(6)),
            ("Common Reed Stalk", 50, None, Some(7)),
            ("Rope", 20, None, Some(8)),
            ("Reed Flippers", 1, None, Some(9)),
            ("Diving Pick", 1, None, Some(10)),
        ],

        // ====================================================================
        // FARMING - Crop cultivation and gardening
        // ====================================================================
        LoadoutType::Farming => vec![
            // Hotbar - Farming essentials
            ("Combat Ladle", 1, Some(0), None),       // Basic tool
            ("Torch", 1, Some(1), None),
            ("Plastic Water Jug", 1, Some(2), None),  // Watering
            ("Fertilizer", 100, Some(3), None),       // Growth boost
            ("Reed Water Bottle", 1, Some(4), None),
            ("Cerametal Field Cauldron Mk. II", 1, Some(5), None),
            // Inventory - Seeds variety
            ("Seed Potato", 20, None, Some(0)),
            ("Corn Seeds", 20, None, Some(1)),
            ("Carrot Seeds", 30, None, Some(2)),
            ("Pumpkin Seeds", 20, None, Some(3)),
            ("Sunflower Seeds", 30, None, Some(4)),
            ("Flax Seeds", 30, None, Some(5)),
            ("Chamomile Seeds", 20, None, Some(6)),
            ("Lingonberry Seeds", 20, None, Some(7)),
            // Farming infrastructure
            ("Compost", 3, None, Some(8)),
            ("Reed Rain Collector", 5, None, Some(9)),
            ("Wooden Storage Box", 3, None, Some(10)),
            ("Camp Fire", 2, None, Some(11)),
            ("Bandage", 10, None, Some(12)),
        ],

        // ====================================================================
        // EXPLOSIVES - Demolition and destruction testing
        // ====================================================================
        LoadoutType::Explosives => vec![
            // Hotbar - Explosives ready to use
            ("Babushka's Surprise", 10, Some(0), None),    // Tier 1 explosive
            ("Matriarch's Wrath", 10, Some(1), None),     // Tier 2 explosive
            ("Combat Ladle", 1, Some(2), None),           // Basic tool
            ("Torch", 1, Some(3), None),
            ("Reed Water Bottle", 1, Some(4), None),
            ("Cerametal Field Cauldron Mk. II", 1, Some(5), None),
            // Inventory - Lots of explosives
            ("Babushka's Surprise", 50, None, Some(0)),
            ("Babushka's Surprise", 50, None, Some(1)),
            ("Matriarch's Wrath", 30, None, Some(2)),
            ("Matriarch's Wrath", 30, None, Some(3)),
            ("Bandage", 20, None, Some(4)),
            ("Wood", 1000, None, Some(5)),               // For building test structures
            ("Stone", 500, None, Some(6)),
            ("Metal Fragments", 500, None, Some(7)),
        ],
    }
}

/// Grants the predefined starting items (inventory/hotbar) and starting equipment to a newly registered player.
pub(crate) fn grant_starting_items(ctx: &ReducerContext, player_id: Identity, username: &str) -> Result<(), String> {
    log::info!("[GrantItems] Granting starting items & equipment to player {} ({:?}) using {:?} loadout...", 
               username, player_id, ACTIVE_LOADOUT);

    let item_defs = ctx.db.item_definition();
    let inventory = ctx.db.inventory_item();

    // --- Grant Inventory/Hotbar Items --- 
    // Get items for the active loadout
    let starting_inv_items = get_loadout_items(ACTIVE_LOADOUT);

    log::info!("[GrantItems] Defined {} starting inventory/hotbar item entries for {:?} loadout.", 
               starting_inv_items.len(), ACTIVE_LOADOUT);

    for (item_name, quantity, hotbar_slot_opt, inventory_slot_opt) in starting_inv_items.iter() {
        log::debug!("[GrantItems] Processing inv/hotbar entry: {}", item_name);
        if let Some(item_def) = item_defs.iter().find(|def| def.name == *item_name) {
            let location = if let Some(slot_idx) = *hotbar_slot_opt {
                ItemLocation::Hotbar(crate::models::HotbarLocationData { owner_id: player_id, slot_index: slot_idx as u8 })
            } else if let Some(slot_idx) = *inventory_slot_opt {
                ItemLocation::Inventory(crate::models::InventoryLocationData { owner_id: player_id, slot_index: slot_idx as u16 })
            } else {
                log::warn!("[GrantItems] Item {} for player {:?} had neither hotbar nor inventory slot specified. Setting to Unknown.", item_name, player_id);
                ItemLocation::Unknown 
            };
            
            // IDEMPOTENCY CHECK: Check if this specific slot already has an item
            let slot_already_occupied = inventory.iter().any(|existing_item| {
                match (&existing_item.location, &location) {
                    (ItemLocation::Hotbar(existing), ItemLocation::Hotbar(new)) => {
                        existing.owner_id == new.owner_id && existing.slot_index == new.slot_index
                    },
                    (ItemLocation::Inventory(existing), ItemLocation::Inventory(new)) => {
                        existing.owner_id == new.owner_id && existing.slot_index == new.slot_index
                    },
                    _ => false,
                }
            });
            
            if slot_already_occupied {
                log::info!("[GrantItems] Slot already occupied for {} (H: {:?}, I: {:?}) for player {:?}. Skipping (idempotent).", 
                           item_name, hotbar_slot_opt, inventory_slot_opt, player_id);
                continue;
            }
            
            let item_to_insert = InventoryItem { 
                instance_id: 0,
                item_def_id: item_def.id,
                quantity: *quantity,
                location,
                item_data: None, // Initialize as empty
            };
            match inventory.try_insert(item_to_insert) {
                Ok(_) => {
                    log::info!("[GrantItems] Granted inv/hotbar: {} (Qty: {}, H: {:?}, I: {:?}) to player {:?}", 
                               item_name, quantity, hotbar_slot_opt, inventory_slot_opt, player_id);
                },
                Err(e) => {
                    log::error!("[GrantItems] FAILED inv/hotbar insert for {} for player {:?}: {}", item_name, player_id, e);
                }
            }
        } else {
            log::error!("[GrantItems] Definition NOT FOUND for inv/hotbar item: '{}' for player {:?}. Check items_database!", item_name, player_id);
        }
    }

    // --- Grant Starting Equipment --- 
    if GRANT_STARTING_EQUIPMENT {
        log::info!("[GrantItems] Equipping starting armor for player {:?}", player_id);
        let active_equip_table = ctx.db.active_equipment();
        
        // Find or create the ActiveEquipment row for the player
        let mut found_existing_entry = true; // Assume we find one initially
        let mut equip_entry = match active_equip_table.player_identity().find(player_id) {
            Some(entry) => entry, // Existing entry found
            None => {
                found_existing_entry = false; // Mark that we created a new one
                // Create a default entry if none exists
                log::info!("[GrantItems] No ActiveEquipment found for player {:?}, creating default.", player_id);
                ActiveEquipment {
                    player_identity: player_id,
                    equipped_item_def_id: None,
                    equipped_item_instance_id: None,
                    icon_asset_name: None,
                    swing_start_time_ms: 0,
                    loaded_ammo_def_id: None,
                    loaded_ammo_count: 0,
                    is_ready_to_fire: false,
                    preferred_arrow_type: None,
                    head_item_instance_id: None,
                    chest_item_instance_id: None,
                    legs_item_instance_id: None,
                    feet_item_instance_id: None,
                    hands_item_instance_id: None,
                    back_item_instance_id: None,
                }
            }
        };
        let mut equipment_updated = false; // Track if we modify the entry

        // Define the starting equipment: (item_name, equipment_slot_type)
        let starting_equipment = [
            ("Cloth Hood", EquipmentSlotType::Head),
            ("Cloth Shirt", EquipmentSlotType::Chest),
            ("Cloth Pants", EquipmentSlotType::Legs),
            ("Cloth Boots", EquipmentSlotType::Feet),
            ("Cloth Gloves", EquipmentSlotType::Hands),
            ("Cloth Cape", EquipmentSlotType::Back),
        ];

        for (item_name, target_slot_type) in starting_equipment.iter() {
            log::debug!("[GrantItems] Processing equipment entry: {}", item_name);
            if let Some(item_def) = item_defs.iter().find(|def| def.name == *item_name) {
                // Validate that item_def is equippable to this slot type
                if item_def.equipment_slot_type.as_ref() != Some(target_slot_type) {
                    log::error!(
                        "[GrantItems] Definition mismatch for equipment item: {} for player {:?}. Def has {:?}, expected {:?}.",
                        item_name, player_id, item_def.equipment_slot_type, target_slot_type
                    );
                    continue;
                }

                // Create the InventoryItem instance, correctly located
                let item_to_equip_for_insert = InventoryItem {
                    instance_id: 0, // Auto-inc
                    item_def_id: item_def.id,
                    quantity: 1, // Equipment is typically quantity 1
                    location: ItemLocation::Equipped(crate::models::EquippedLocationData { owner_id: player_id, slot_type: target_slot_type.clone() }),
                    item_data: None, // Initialize as empty
                };
                match inventory.try_insert(item_to_equip_for_insert) {
                    Ok(inserted_item) => {
                        let new_instance_id = inserted_item.instance_id;
                        log::info!("[GrantItems] Created InventoryItem (ID: {}) for equipping {} to player {:?}. Location: {:?}", 
                            new_instance_id, item_name, player_id, inserted_item.location);
                        
                        // Update the correct slot in the equip_entry struct
                        match target_slot_type {
                            EquipmentSlotType::Head => equip_entry.head_item_instance_id = Some(new_instance_id),
                            EquipmentSlotType::Chest => equip_entry.chest_item_instance_id = Some(new_instance_id),
                            EquipmentSlotType::Legs => equip_entry.legs_item_instance_id = Some(new_instance_id),
                            EquipmentSlotType::Feet => equip_entry.feet_item_instance_id = Some(new_instance_id),
                            EquipmentSlotType::Hands => equip_entry.hands_item_instance_id = Some(new_instance_id),
                            EquipmentSlotType::Back => equip_entry.back_item_instance_id = Some(new_instance_id),
                            // No other types should reach here due to the check above
                            _ => log::warn!("[GrantItems] Unexpected EquipmentSlotType {:?} encountered while setting ActiveEquipment for player {:?}", target_slot_type, player_id),
                        }
                        equipment_updated = true;
                    },
                    Err(e) => {
                        log::error!("[GrantItems] FAILED to insert InventoryItem for equipping {} for player {:?}: {}", item_name, player_id, e);
                    }
                }
            } else {
                log::error!("[GrantItems] Definition NOT FOUND for equipment item: {} for player {:?}", item_name, player_id);
            }
        }

        // If we modified the equipment entry, update or insert it in the table
        if equipment_updated {
            if found_existing_entry {
                log::info!("[GrantItems] Updating existing ActiveEquipment entry for player {:?}", player_id);
                active_equip_table.player_identity().update(equip_entry);
            } else {
                log::info!("[GrantItems] Inserting new ActiveEquipment entry for player {:?}", player_id);
                // Use insert for the newly created entry
                match active_equip_table.try_insert(equip_entry) {
                    Ok(_) => { /* Successfully inserted */ },
                    Err(e) => {
                        // Log error if insert fails (e.g., race condition if another process inserted just now)
                        log::error!("[GrantItems] FAILED to insert new ActiveEquipment entry for player {:?}: {}", player_id, e);
                    }
                }
            }
        } else if !found_existing_entry {
            // If we created a default entry but didn't add any equipment (e.g., due to item def errors),
            // we still need to insert the default row.
            log::info!("[GrantItems] Inserting default (unmodified) ActiveEquipment entry for player {:?}", player_id);
            match active_equip_table.try_insert(equip_entry) {
                Ok(_) => { /* Successfully inserted */ },
                Err(e) => {
                    log::error!("[GrantItems] FAILED to insert default ActiveEquipment entry for player {:?}: {}", player_id, e);
                }
            }
                 }
     } else {
         log::info!("[GrantItems] Starting equipment disabled (GRANT_STARTING_EQUIPMENT = false). Player {:?} will start with no armor.", player_id);
     }

    log::info!("[GrantItems] Finished granting items & equipment to player {}.", username);
    Ok(()) // Indicate overall success (individual errors logged)
} 