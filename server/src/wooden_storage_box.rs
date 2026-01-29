/******************************************************************************
 *                                                                            *
 * Defines the WoodenStorageBox entity, its data structure, and associated    *
 * logic. Handles interactions like placing the box, adding/removing items,   *
 * splitting stacks, and managing items within the box's slots.               *
 * Uses generic handlers from inventory_management.rs where applicable.       *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{Identity, ReducerContext, SpacetimeType, Table, Timestamp};
use log;

// --- Constants --- 
pub(crate) const BOX_COLLISION_RADIUS: f32 = 18.0; // Default collision radius for small boxes
pub(crate) const BOX_COLLISION_Y_OFFSET: f32 = 52.0; // Match the placement offset for proper collision detection
pub(crate) const PLAYER_BOX_COLLISION_DISTANCE_SQUARED: f32 = (super::PLAYER_RADIUS + BOX_COLLISION_RADIUS) * (super::PLAYER_RADIUS + BOX_COLLISION_RADIUS);
const BOX_INTERACTION_DISTANCE_SQUARED: f32 = 96.0 * 96.0; // Increased from 64.0 * 64.0 for more lenient interaction
pub const NUM_BOX_SLOTS: usize = 18;
pub const NUM_LARGE_BOX_SLOTS: usize = 48;
pub(crate) const BOX_BOX_COLLISION_DISTANCE_SQUARED: f32 = (BOX_COLLISION_RADIUS * 2.0) * (BOX_COLLISION_RADIUS * 2.0);

// Collision radii for different box types (based on visual dimensions)
// These prevent boxes from overlapping visually
pub(crate) const LARGE_BOX_COLLISION_RADIUS: f32 = 48.0;      // 96x96 visual -> radius ~48
pub(crate) const COMPOST_COLLISION_RADIUS: f32 = 64.0;        // 128x128 visual -> radius ~64
pub(crate) const REPAIR_BENCH_COLLISION_RADIUS: f32 = 96.0;   // 192x192 visual -> radius ~96
pub(crate) const COOKING_STATION_COLLISION_RADIUS: f32 = 48.0; // 96x96 visual -> radius ~48
pub(crate) const SCARECROW_COLLISION_RADIUS: f32 = 64.0;      // 128x128 visual -> radius ~64
pub(crate) const FISH_TRAP_COLLISION_RADIUS: f32 = 48.0;      // 96x96 visual -> radius ~48
pub(crate) const WILD_BEEHIVE_COLLISION_RADIUS: f32 = 60.0;   // 120x120 visual -> radius ~60
pub(crate) const PLAYER_BEEHIVE_COLLISION_RADIUS: f32 = 100.0; // 256x256 visual -> radius ~100 (allows some overlap for placement flexibility)
pub(crate) const MINE_CART_COLLISION_RADIUS: f32 = 72.0;      // 144x144 visual -> radius ~72
pub(crate) const REFRIGERATOR_COLLISION_RADIUS: f32 = 48.0;   // 96x96 visual -> radius ~48

/// Get the collision radius for a specific box type
pub(crate) fn get_box_collision_radius(box_type: u8) -> f32 {
    match box_type {
        BOX_TYPE_NORMAL => BOX_COLLISION_RADIUS,
        BOX_TYPE_LARGE => LARGE_BOX_COLLISION_RADIUS,
        BOX_TYPE_REFRIGERATOR => REFRIGERATOR_COLLISION_RADIUS,
        BOX_TYPE_COMPOST => COMPOST_COLLISION_RADIUS,
        BOX_TYPE_BACKPACK => BOX_COLLISION_RADIUS,
        BOX_TYPE_REPAIR_BENCH => REPAIR_BENCH_COLLISION_RADIUS,
        BOX_TYPE_COOKING_STATION => COOKING_STATION_COLLISION_RADIUS,
        BOX_TYPE_SCARECROW => SCARECROW_COLLISION_RADIUS,
        BOX_TYPE_MILITARY_RATION => BOX_COLLISION_RADIUS,
        BOX_TYPE_MINE_CART => MINE_CART_COLLISION_RADIUS,
        BOX_TYPE_FISH_TRAP => FISH_TRAP_COLLISION_RADIUS,
        BOX_TYPE_WILD_BEEHIVE => WILD_BEEHIVE_COLLISION_RADIUS,
        BOX_TYPE_PLAYER_BEEHIVE => PLAYER_BEEHIVE_COLLISION_RADIUS,
        _ => BOX_COLLISION_RADIUS,
    }
}

// --- Health constants ---
pub const WOODEN_STORAGE_BOX_INITIAL_HEALTH: f32 = 750.0;
pub const WOODEN_STORAGE_BOX_MAX_HEALTH: f32 = 750.0;
pub const LARGE_WOODEN_STORAGE_BOX_INITIAL_HEALTH: f32 = 1200.0;
pub const LARGE_WOODEN_STORAGE_BOX_MAX_HEALTH: f32 = 1200.0;

// --- Box Types ---
pub const BOX_TYPE_NORMAL: u8 = 0;
pub const BOX_TYPE_LARGE: u8 = 1;
pub const BOX_TYPE_REFRIGERATOR: u8 = 2;
pub const BOX_TYPE_COMPOST: u8 = 3;
pub const BOX_TYPE_BACKPACK: u8 = 4;
// Note: Barbecue is its own entity (see barbecue.rs), not a wooden storage box type
pub const NUM_BACKPACK_SLOTS: usize = 35; // Matches NUM_CORPSE_SLOTS (30 + 5 = 35 slots)
pub const BACKPACK_INITIAL_HEALTH: f32 = 100.0; // Low health, not meant to be attacked
pub const BACKPACK_MAX_HEALTH: f32 = 100.0;

// --- Repair Bench ---
pub const BOX_TYPE_REPAIR_BENCH: u8 = 5;
pub const NUM_REPAIR_BENCH_SLOTS: usize = 1;
pub const REPAIR_BENCH_INITIAL_HEALTH: f32 = 500.0;
pub const REPAIR_BENCH_MAX_HEALTH: f32 = 500.0;

// --- Cooking Station ---
pub const BOX_TYPE_COOKING_STATION: u8 = 6;
pub const NUM_COOKING_STATION_SLOTS: usize = 0; // No inventory - proximity crafting only
pub const COOKING_STATION_INITIAL_HEALTH: f32 = 400.0;
pub const COOKING_STATION_MAX_HEALTH: f32 = 400.0;

// --- Scarecrow ---
pub const BOX_TYPE_SCARECROW: u8 = 7;
pub const NUM_SCARECROW_SLOTS: usize = 0; // No inventory - decorative/functional only (deters crows)
pub const SCARECROW_INITIAL_HEALTH: f32 = 200.0;
pub const SCARECROW_MAX_HEALTH: f32 = 200.0;

// --- Military Ration ---
pub const BOX_TYPE_MILITARY_RATION: u8 = 8;
pub const NUM_MILITARY_RATION_SLOTS: usize = 3;
pub const MILITARY_RATION_INITIAL_HEALTH: f32 = 100.0; // Low health, not meant to be attacked
pub const MILITARY_RATION_MAX_HEALTH: f32 = 100.0;

// --- Mine Cart ---
pub const BOX_TYPE_MINE_CART: u8 = 9;
pub const NUM_MINE_CART_SLOTS: usize = 3;
pub const MINE_CART_INITIAL_HEALTH: f32 = 100.0; // Low health, not meant to be attacked
pub const MINE_CART_MAX_HEALTH: f32 = 100.0;

// --- Fish Trap ---
pub const BOX_TYPE_FISH_TRAP: u8 = 10;
pub const NUM_FISH_TRAP_SLOTS: usize = 12; // Reasonable size for bait + catches
pub const FISH_TRAP_INITIAL_HEALTH: f32 = 300.0;
pub const FISH_TRAP_MAX_HEALTH: f32 = 300.0;

// --- Wild Beehive ---
pub const BOX_TYPE_WILD_BEEHIVE: u8 = 11;
pub const NUM_WILD_BEEHIVE_SLOTS: usize = 3; // Small container - 1-4 honeycomb
pub const WILD_BEEHIVE_INITIAL_HEALTH: f32 = 100.0; // Low health, not meant to be attacked
pub const WILD_BEEHIVE_MAX_HEALTH: f32 = 100.0;

// --- Player Beehive ---
pub const BOX_TYPE_PLAYER_BEEHIVE: u8 = 12;
pub const NUM_PLAYER_BEEHIVE_SLOTS: usize = 5; // Slot 0 = Queen Bee input, Slots 1-4 = Honeycomb output
pub const PLAYER_BEEHIVE_INITIAL_HEALTH: f32 = 400.0;
pub const PLAYER_BEEHIVE_MAX_HEALTH: f32 = 400.0;

// Re-export refrigerator constants for backward compatibility
pub use crate::refrigerator::{NUM_REFRIGERATOR_SLOTS, REFRIGERATOR_INITIAL_HEALTH, REFRIGERATOR_MAX_HEALTH};

// --- Import Table Traits and Concrete Types ---
// Import necessary table traits and concrete types for working with players,
// items, inventory management, and environment calculations
use crate::player as PlayerTableTrait;
use crate::Player;
use crate::items::{
    InventoryItem, ItemDefinition,
    inventory_item as InventoryItemTableTrait, 
    item_definition as ItemDefinitionTableTrait,
    add_item_to_player_inventory
};
use crate::inventory_management::{self, ItemContainer, ContainerItemClearer, merge_or_place_into_container_slot};
use crate::wooden_storage_box::wooden_storage_box as WoodenStorageBoxTableTrait;
use crate::environment::calculate_chunk_index;
use crate::models::{ContainerType, ItemLocation, InventoryLocationData, HotbarLocationData, DroppedLocationData, EquippedLocationData, ContainerLocationData};
use crate::player_inventory::{find_first_empty_player_slot, move_item_to_inventory, move_item_to_hotbar, get_player_item};
use crate::items::ItemCategory;
// Re-export refrigerator validation function for backward compatibility
pub use crate::refrigerator::is_item_allowed_in_refrigerator;

/// --- Wooden Storage Box Data Structure ---
/// Represents a storage box in the game world with position, owner, and
/// inventory slots (using individual fields instead of arrays).
/// Provides 18 slots for storing items that players can access when nearby.
#[spacetimedb::table(name = wooden_storage_box, public)]
#[derive(Clone)]
pub struct WoodenStorageBox {
    #[primary_key]
    #[auto_inc]
    pub id: u32, // Unique identifier for this storage box instance

    pub pos_x: f32,
    pub pos_y: f32,
    #[index(btree)]
    pub chunk_index: u32, // <<< ADDED chunk_index

    pub placed_by: Identity, // Who placed this storage box
    pub box_type: u8, // 0 = normal (18 slots), 1 = large (48 slots)

    // --- Inventory Slots (0-47) --- 
    // Normal box uses 0-17, Large box uses 0-47
    pub slot_instance_id_0: Option<u64>,
    pub slot_def_id_0: Option<u64>,
    pub slot_instance_id_1: Option<u64>,
    pub slot_def_id_1: Option<u64>,
    pub slot_instance_id_2: Option<u64>,
    pub slot_def_id_2: Option<u64>,
    pub slot_instance_id_3: Option<u64>,
    pub slot_def_id_3: Option<u64>,
    pub slot_instance_id_4: Option<u64>,
    pub slot_def_id_4: Option<u64>,
    pub slot_instance_id_5: Option<u64>,
    pub slot_def_id_5: Option<u64>,
    pub slot_instance_id_6: Option<u64>,
    pub slot_def_id_6: Option<u64>,
    pub slot_instance_id_7: Option<u64>,
    pub slot_def_id_7: Option<u64>,
    pub slot_instance_id_8: Option<u64>,
    pub slot_def_id_8: Option<u64>,
    pub slot_instance_id_9: Option<u64>,
    pub slot_def_id_9: Option<u64>,
    pub slot_instance_id_10: Option<u64>,
    pub slot_def_id_10: Option<u64>,
    pub slot_instance_id_11: Option<u64>,
    pub slot_def_id_11: Option<u64>,
    pub slot_instance_id_12: Option<u64>,
    pub slot_def_id_12: Option<u64>,
    pub slot_instance_id_13: Option<u64>,
    pub slot_def_id_13: Option<u64>,
    pub slot_instance_id_14: Option<u64>,
    pub slot_def_id_14: Option<u64>,
    pub slot_instance_id_15: Option<u64>,
    pub slot_def_id_15: Option<u64>,
    pub slot_instance_id_16: Option<u64>,
    pub slot_def_id_16: Option<u64>,
    pub slot_instance_id_17: Option<u64>,
    pub slot_def_id_17: Option<u64>,
    // --- Large Box Additional Slots (18-47) ---
    pub slot_instance_id_18: Option<u64>,
    pub slot_def_id_18: Option<u64>,
    pub slot_instance_id_19: Option<u64>,
    pub slot_def_id_19: Option<u64>,
    pub slot_instance_id_20: Option<u64>,
    pub slot_def_id_20: Option<u64>,
    pub slot_instance_id_21: Option<u64>,
    pub slot_def_id_21: Option<u64>,
    pub slot_instance_id_22: Option<u64>,
    pub slot_def_id_22: Option<u64>,
    pub slot_instance_id_23: Option<u64>,
    pub slot_def_id_23: Option<u64>,
    pub slot_instance_id_24: Option<u64>,
    pub slot_def_id_24: Option<u64>,
    pub slot_instance_id_25: Option<u64>,
    pub slot_def_id_25: Option<u64>,
    pub slot_instance_id_26: Option<u64>,
    pub slot_def_id_26: Option<u64>,
    pub slot_instance_id_27: Option<u64>,
    pub slot_def_id_27: Option<u64>,
    pub slot_instance_id_28: Option<u64>,
    pub slot_def_id_28: Option<u64>,
    pub slot_instance_id_29: Option<u64>,
    pub slot_def_id_29: Option<u64>,
    pub slot_instance_id_30: Option<u64>,
    pub slot_def_id_30: Option<u64>,
    pub slot_instance_id_31: Option<u64>,
    pub slot_def_id_31: Option<u64>,
    pub slot_instance_id_32: Option<u64>,
    pub slot_def_id_32: Option<u64>,
    pub slot_instance_id_33: Option<u64>,
    pub slot_def_id_33: Option<u64>,
    pub slot_instance_id_34: Option<u64>,
    pub slot_def_id_34: Option<u64>,
    pub slot_instance_id_35: Option<u64>,
    pub slot_def_id_35: Option<u64>,
    pub slot_instance_id_36: Option<u64>,
    pub slot_def_id_36: Option<u64>,
    pub slot_instance_id_37: Option<u64>,
    pub slot_def_id_37: Option<u64>,
    pub slot_instance_id_38: Option<u64>,
    pub slot_def_id_38: Option<u64>,
    pub slot_instance_id_39: Option<u64>,
    pub slot_def_id_39: Option<u64>,
    pub slot_instance_id_40: Option<u64>,
    pub slot_def_id_40: Option<u64>,
    pub slot_instance_id_41: Option<u64>,
    pub slot_def_id_41: Option<u64>,
    pub slot_instance_id_42: Option<u64>,
    pub slot_def_id_42: Option<u64>,
    pub slot_instance_id_43: Option<u64>,
    pub slot_def_id_43: Option<u64>,
    pub slot_instance_id_44: Option<u64>,
    pub slot_def_id_44: Option<u64>,
    pub slot_instance_id_45: Option<u64>,
    pub slot_def_id_45: Option<u64>,
    pub slot_instance_id_46: Option<u64>,
    pub slot_def_id_46: Option<u64>,
    pub slot_instance_id_47: Option<u64>,
    pub slot_def_id_47: Option<u64>,
    pub health: f32,
    pub max_health: f32,
    pub is_destroyed: bool,
    pub destroyed_at: Option<Timestamp>,
    pub last_hit_time: Option<Timestamp>,
    pub last_damaged_by: Option<Identity>, // ADDED: Track who last damaged this storage box
    
    // --- Respawn System (for military rations and other spawnable containers) ---
    /// When this container should respawn. Use Timestamp::UNIX_EPOCH (0) for "not respawning" or "partially looted".
    /// This allows efficient btree index range queries: .respawn_at().filter(1..=now)
    #[index(btree)]
    pub respawn_at: Timestamp,
    
    // --- Monument Placeable System ---
    pub is_monument: bool, // If true, this is a permanent monument placeable (indestructible, public access)
    pub active_user_id: Option<Identity>, // Player currently using this container (for safe zone exclusivity)
    pub active_user_since: Option<Timestamp>, // When the active user started using this container
}

/******************************************************************************
 *                           REDUCERS (Generic Handlers)                        *
 ******************************************************************************/

/// --- Move Item to Storage Box ---
/// Moves an item from the player's inventory/hotbar INTO a specified slot in the storage box.
/// Uses the generic handler from inventory_management.rs to perform the move operation.
/// The handler validates the item, checks slot availability, and handles stacking logic.
#[spacetimedb::reducer]
pub fn move_item_to_box(
    ctx: &ReducerContext, 
    box_id: u32, 
    target_slot_index: u8, 
    item_instance_id: u64 // Pass ID directly
) -> Result<(), String> {
    // Get mutable box table handle
    let mut boxes = ctx.db.wooden_storage_box();
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    // NOTE: Other tables (inventory, item_defs) are accessed within the handler via ctx

    // --- Basic Validations --- 
    let (_player, mut storage_box) = validate_box_interaction(ctx, box_id)?;
    // REMOVED: Item fetching/validation moved to handler
    // REMOVED: Target slot index validation moved to handler (using container.num_slots())
    // NOTE: Refrigerator-specific validation is now handled by refrigerator.rs reducers

    // Check if we're placing a Queen Bee in slot 0 of a player beehive (for sound)
    let is_player_beehive = storage_box.box_type == BOX_TYPE_PLAYER_BEEHIVE;
    let mut should_start_beehive_sound = false;
    if is_player_beehive && target_slot_index == 0 {
        // Check if the item being moved is a Queen Bee
        if let Some(item) = inventory_items.instance_id().find(item_instance_id) {
            if let Some(item_def) = item_defs.id().find(item.item_def_id) {
                if item_def.name == "Queen Bee" {
                    should_start_beehive_sound = true;
                }
            }
        }
    }

    // --- Call GENERIC Handler --- 
    inventory_management::handle_move_to_container_slot(
        ctx, 
        &mut storage_box, 
        target_slot_index, 
        item_instance_id // Pass the ID
        // REMOVED item references
    )?;

    // --- Commit Box Update --- 
    boxes.id().update(storage_box.clone());
    
    // Start beehive buzzing sound if Queen Bee was placed in slot 0
    if should_start_beehive_sound {
        let beehive_y_offset = BOX_COLLISION_Y_OFFSET + 100.0; // Beehives use larger offset
        let visual_center_y = storage_box.pos_y - beehive_y_offset;
        crate::sound_events::start_beehive_sound(ctx, box_id as u64, storage_box.pos_x, visual_center_y);
        log::info!("[Beehive] Started buzzing sound - Queen Bee placed in beehive {} slot 0", box_id);
    }
    
    Ok(())
}

/// --- Move Item from Storage Box ---
/// Moves an item FROM a storage box slot INTO the player's inventory/hotbar.
/// Uses the generic handler from inventory_management.rs to perform the move operation.
/// The handler validates the item, checks slot availability, and handles stacking logic.
#[spacetimedb::reducer]
pub fn move_item_from_box(
    ctx: &ReducerContext, 
    box_id: u32, 
    source_slot_index: u8,
    target_slot_type: String, // NEW: "inventory" or "hotbar"
    target_slot_index: u32    // NEW: Index within inventory or hotbar
) -> Result<(), String> {
    // Get mutable box table handle
    let mut boxes = ctx.db.wooden_storage_box();

    // --- Validations --- 
    let (_player, mut storage_box) = validate_box_interaction(ctx, box_id)?;
    // NOTE: Basic distance/existence checked by validate_box_interaction
    // NOTE: Item details, slot checks, target validation now handled by inventory_management handler

    // --- Call Handler to attempt move to player inventory FIRST --- 
    inventory_management::handle_move_from_container_slot(
        ctx, 
        &mut storage_box, // Pass mutably, handler will clear slot on success
        source_slot_index,
        target_slot_type, // Pass through
        target_slot_index // Pass through
    )?;
    // ^ If this returns Ok, it means the move/merge/swap into the player slot succeeded.

    // Check box type before moving storage_box
    let is_backpack = storage_box.box_type == BOX_TYPE_BACKPACK;
    let is_military_ration = storage_box.box_type == BOX_TYPE_MILITARY_RATION;
    let is_mine_cart = storage_box.box_type == BOX_TYPE_MINE_CART;
    let is_wild_beehive = storage_box.box_type == BOX_TYPE_WILD_BEEHIVE;
    let is_player_beehive = storage_box.box_type == BOX_TYPE_PLAYER_BEEHIVE;

    // --- Commit Box Update --- 
    // The handler modified storage_box (cleared the slot) if the move was successful.
    boxes.id().update(storage_box);
    
    // Stop beehive buzzing sound if Queen Bee was removed from slot 0
    if is_player_beehive && source_slot_index == 0 {
        crate::sound_events::stop_beehive_sound(ctx, box_id as u64);
    }

    // Auto-despawn empty backpacks
    if is_backpack {
        let _ = crate::backpack::check_and_despawn_if_empty(ctx, box_id);
    }
    
    // Auto-despawn empty military rations
    if is_military_ration {
        let _ = crate::military_ration::check_and_despawn_military_ration_if_empty(ctx, box_id);
    }
    
    // Auto-despawn empty mine carts
    if is_mine_cart {
        let _ = crate::mine_cart::check_and_despawn_mine_cart_if_empty(ctx, box_id);
    }
    
    // Auto-despawn empty wild beehives
    if is_wild_beehive {
        let _ = crate::wild_beehive::check_and_despawn_wild_beehive_if_empty(ctx, box_id);
    }

    Ok(())
}

/// Moves an item BETWEEN two slots within the same storage box.
#[spacetimedb::reducer]
pub fn move_item_within_box(
    ctx: &ReducerContext,
    box_id: u32,
    source_slot_index: u8,
    target_slot_index: u8,
) -> Result<(), String> {
    // Get mutable box table handle
    let mut boxes = ctx.db.wooden_storage_box();
    let item_defs = ctx.db.item_definition();
    // NOTE: Other tables accessed in handler via ctx

    // --- Basic Validations --- 
    let (_player, mut storage_box) = validate_box_interaction(ctx, box_id)?;
    // REMOVED: Item fetching/validation moved to handler
    // NOTE: Slot index validation moved to handler

    // Check if this is a player beehive - we need to handle sound for Queen Bee in slot 0
    let is_player_beehive = storage_box.box_type == BOX_TYPE_PLAYER_BEEHIVE;
    let mut had_queen_bee_in_slot_0 = false;
    
    if is_player_beehive {
        // Check if slot 0 currently has a Queen Bee
        if let Some(def_id) = storage_box.slot_def_id_0 {
            if let Some(item_def) = item_defs.id().find(def_id) {
                had_queen_bee_in_slot_0 = item_def.name == "Queen Bee";
            }
        }
    }

    // --- Call GENERIC Handler --- 
    inventory_management::handle_move_within_container(
        ctx, 
        &mut storage_box, 
        source_slot_index, 
        target_slot_index
        // Removed table args
    )?;

    // --- Commit Box Update --- 
    boxes.id().update(storage_box.clone());
    
    // Handle beehive sound based on Queen Bee presence in slot 0
    if is_player_beehive {
        // Check if slot 0 now has a Queen Bee
        let mut has_queen_bee_in_slot_0 = false;
        if let Some(def_id) = storage_box.slot_def_id_0 {
            if let Some(item_def) = item_defs.id().find(def_id) {
                has_queen_bee_in_slot_0 = item_def.name == "Queen Bee";
            }
        }
        
        // Start/stop sound based on change
        if !had_queen_bee_in_slot_0 && has_queen_bee_in_slot_0 {
            // Queen Bee was placed in slot 0 - start sound
            let beehive_y_offset = BOX_COLLISION_Y_OFFSET + 100.0;
            let visual_center_y = storage_box.pos_y - beehive_y_offset;
            crate::sound_events::start_beehive_sound(ctx, box_id as u64, storage_box.pos_x, visual_center_y);
            log::info!("[Beehive] Started buzzing sound - Queen Bee moved to slot 0 in beehive {}", box_id);
        } else if had_queen_bee_in_slot_0 && !has_queen_bee_in_slot_0 {
            // Queen Bee was removed from slot 0 - stop sound
            crate::sound_events::stop_beehive_sound(ctx, box_id as u64);
            log::info!("[Beehive] Stopped buzzing sound - Queen Bee moved from slot 0 in beehive {}", box_id);
        }
    }
    
    Ok(())
}

/// --- Split Stack Into Box ---
/// Splits a stack from player inventory/hotbar into a specific box slot.
/// Validates the box interaction and source item, then uses the generic container handler
/// to split the stack and move the specified quantity to the box.
#[spacetimedb::reducer]
pub fn split_stack_into_box(
    ctx: &ReducerContext,
    box_id: u32,
    target_slot_index: u8,
    source_item_instance_id: u64,
    quantity_to_split: u32,
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    let (_player, mut storage_box) = validate_box_interaction(ctx, box_id)?;
    
    // The handler will fetch the source_item, validate its location/ownership, quantity, and stackability.
    inventory_management::handle_split_into_container(
        ctx, 
        &mut storage_box, 
        target_slot_index, 
        source_item_instance_id, 
        quantity_to_split
    )?;

    boxes.id().update(storage_box);
    Ok(())
}

/// --- Split Stack From Box ---
/// Splits a stack from a box slot into the player's inventory/hotbar.
/// Validates the box interaction, then uses the generic container handler
/// to split the stack and move the specified quantity to the player's inventory.
#[spacetimedb::reducer]
pub fn split_stack_from_box(
    ctx: &ReducerContext,
    box_id: u32,
    source_slot_index: u8,
    quantity_to_split: u32,
    target_slot_type: String, 
    target_slot_index: u32,   
) -> Result<(), String> {
    let mut boxes = ctx.db.wooden_storage_box();
    let (_player, mut storage_box) = validate_box_interaction(ctx, box_id)?;
    
    inventory_management::handle_split_from_container(
        ctx, 
        &mut storage_box, 
        source_slot_index, 
        quantity_to_split,
        target_slot_type, 
        target_slot_index
    )?;
    
    // Note: When splitting FROM compost, the source stack keeps its original timestamp
    // The split item (now in player inventory) doesn't need a compost timestamp
    // If it's moved back to compost later, it will get a fresh timestamp then
    
    boxes.id().update(storage_box);
    Ok(())
}

/// --- Split Stack Within Box ---
/// Splits a stack FROM one box slot TO another within the same box.
/// Validates the box interaction, then uses the generic container handler
/// to split the stack and move the specified quantity to the target slot.
#[spacetimedb::reducer]
pub fn split_stack_within_box(
    ctx: &ReducerContext,
    box_id: u32,
    source_slot_index: u8,
    target_slot_index: u8,
    quantity_to_split: u32,
) -> Result<(), String> {
    // Get tables
    let mut boxes = ctx.db.wooden_storage_box();
    // NOTE: Other tables accessed in handler

    // --- Validations --- 
    let (_player, mut storage_box) = validate_box_interaction(ctx, box_id)?;
    // REMOVED: Item fetching/validation moved to handler
    // NOTE: Slot index/target empty validation moved to handler

    // --- Call GENERIC Handler ---
    inventory_management::handle_split_within_container(
        ctx,
        &mut storage_box,
        source_slot_index,
        target_slot_index,
        quantity_to_split
    )?;

    // --- Compost-specific: Set timestamp on new split item only ---
    // Note: Source stack keeps its original timestamp (continues from where it was)
    // Only the new split item gets a fresh timestamp (starts composting from 0)
    if storage_box.box_type == crate::wooden_storage_box::BOX_TYPE_COMPOST {
        use crate::compost::{set_compost_timestamp, is_item_compostable};
        use crate::items::{inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait};
        let mut inventory_items = ctx.db.inventory_item();
        let item_defs = ctx.db.item_definition();
        
        // Set timestamp on new split item in target slot (starts fresh)
        if let Some(new_item_id) = storage_box.get_slot_instance_id(target_slot_index) {
            if let Some(mut new_item) = inventory_items.instance_id().find(&new_item_id) {
                if let Some(item_def) = item_defs.id().find(&new_item.item_def_id) {
                    if is_item_compostable(&item_def, Some(&new_item)) {
                        set_compost_timestamp(&mut new_item, ctx.timestamp);
                        inventory_items.instance_id().update(new_item);
                        log::debug!("[Compost] Set fresh timestamp on new split item {} in compost (slot {}). Source stack keeps original timestamp.", new_item_id, target_slot_index);
                    }
                }
            }
        }
    }

    // --- Commit Box Update --- 
    boxes.id().update(storage_box);
    Ok(())
}

/// --- Quick Move From Box ---
/// Quickly moves an item FROM a box slot TO the player inventory.
/// Validates the box interaction, then uses the generic container handler
/// to move the item to the player's inventory.
#[spacetimedb::reducer]
pub fn quick_move_from_box(
    ctx: &ReducerContext, 
    box_id: u32, 
    source_slot_index: u8
) -> Result<(), String> {
    // Get mutable box table handle
    let mut boxes = ctx.db.wooden_storage_box();

    // --- Basic Validations --- 
    let (_player, mut storage_box) = validate_box_interaction(ctx, box_id)?;
    // REMOVED: Item fetching/slot empty validation moved to handler

    // --- Call Handler --- 
    inventory_management::handle_quick_move_from_container(
        ctx, 
        &mut storage_box, 
        source_slot_index
    )?;

    // Check box type before moving storage_box
    let is_backpack = storage_box.box_type == BOX_TYPE_BACKPACK;
    let is_military_ration = storage_box.box_type == BOX_TYPE_MILITARY_RATION;
    let is_mine_cart = storage_box.box_type == BOX_TYPE_MINE_CART;
    let is_wild_beehive = storage_box.box_type == BOX_TYPE_WILD_BEEHIVE;
    let is_player_beehive = storage_box.box_type == BOX_TYPE_PLAYER_BEEHIVE;

    // --- Commit Box Update --- 
    boxes.id().update(storage_box);
    
    // Stop beehive buzzing sound if Queen Bee was removed from slot 0
    if is_player_beehive && source_slot_index == 0 {
        // Queen Bee was removed from the beehive - stop the buzzing sound
        crate::sound_events::stop_beehive_sound(ctx, box_id as u64);
    }

    // Auto-despawn empty backpacks
    if is_backpack {
        let _ = crate::backpack::check_and_despawn_if_empty(ctx, box_id);
    }
    
    // Auto-despawn empty military rations
    if is_military_ration {
        let _ = crate::military_ration::check_and_despawn_military_ration_if_empty(ctx, box_id);
    }
    
    // Auto-despawn empty mine carts
    if is_mine_cart {
        let _ = crate::mine_cart::check_and_despawn_mine_cart_if_empty(ctx, box_id);
    }
    
    // Auto-despawn empty wild beehives
    if is_wild_beehive {
        let _ = crate::wild_beehive::check_and_despawn_wild_beehive_if_empty(ctx, box_id);
    }

    Ok(())
}

/// Quickly moves an item FROM player inventory/hotbar TO the first available/mergeable slot in the box.
#[spacetimedb::reducer]
pub fn quick_move_to_box(
    ctx: &ReducerContext, 
    box_id: u32, 
    item_instance_id: u64 // Pass ID directly
) -> Result<(), String> {
    // Get tables
    let mut boxes = ctx.db.wooden_storage_box();
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    // NOTE: Other tables accessed in handler via ctx

    // --- Validations --- 
    let (_player, mut storage_box) = validate_box_interaction(ctx, box_id)?;
    // REMOVED: Item fetching/validation moved to handler

    // Check if this is a player beehive and if we're moving a Queen Bee
    let is_player_beehive = storage_box.box_type == BOX_TYPE_PLAYER_BEEHIVE;
    let mut had_queen_bee_in_slot_0 = false;
    
    if is_player_beehive {
        // Check if slot 0 currently has a Queen Bee
        if let Some(def_id) = storage_box.slot_def_id_0 {
            if let Some(item_def) = item_defs.id().find(def_id) {
                had_queen_bee_in_slot_0 = item_def.name == "Queen Bee";
            }
        }
    }

    // --- Call Handler --- 
    inventory_management::handle_quick_move_to_container(
        ctx, 
        &mut storage_box, 
        item_instance_id // Pass the ID
        // REMOVED item references
    )?;

    // --- Commit Box Update --- 
    boxes.id().update(storage_box.clone());
    
    // Handle beehive sound if a Queen Bee was placed in slot 0
    if is_player_beehive && !had_queen_bee_in_slot_0 {
        // Check if slot 0 now has a Queen Bee
        if let Some(def_id) = storage_box.slot_def_id_0 {
            if let Some(item_def) = item_defs.id().find(def_id) {
                if item_def.name == "Queen Bee" {
                    let beehive_y_offset = BOX_COLLISION_Y_OFFSET + 100.0;
                    let visual_center_y = storage_box.pos_y - beehive_y_offset;
                    crate::sound_events::start_beehive_sound(ctx, box_id as u64, storage_box.pos_x, visual_center_y);
                    log::info!("[Beehive] Started buzzing sound - Queen Bee quick-moved to slot 0 in beehive {}", box_id);
                }
            }
        }
    }
    
    Ok(())
}

/******************************************************************************
 *                         REDUCERS (Box-Specific Logic)                      *
 ******************************************************************************/

/// --- Place Wooden Storage Box ---
/// Places a wooden storage box from the player's inventory into the world at specified coordinates.
/// Validates item ownership, type, and placement distance before consuming the item and creating
/// the storage box entity. Uses the generic container system for item management.
#[spacetimedb::reducer]
pub fn place_wooden_storage_box(ctx: &ReducerContext, item_instance_id: u64, world_x: f32, world_y: f32) -> Result<(), String> {
    let sender_id = ctx.sender;
    let mut inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    let mut boxes = ctx.db.wooden_storage_box();
    let players = ctx.db.player();

    log::info!("Player {:?} attempting to place wooden storage box (item instance {}) at ({}, {}).", sender_id, item_instance_id, world_x, world_y);

    // Check if position is within monument zones (ALK stations, rune stones, hot springs, quarries)
    crate::building::check_monument_zone_placement(ctx, world_x, world_y)?;

    // 1. Validate Player
    let player = players.identity().find(sender_id)
        .ok_or_else(|| "Player not found.".to_string())?;

    // 2. Validate Item to be Placed ---
    // Get the item definition to ensure it's a placeable box
    let mut item_to_place = get_player_item(ctx, item_instance_id)?;
    let item_def = item_defs.id().find(item_to_place.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found for item instance {}.", item_to_place.item_def_id, item_instance_id))?;

    // Check if the item is a Wooden Storage Box (regular or large) and is in player's inventory/hotbar
    let box_type = if item_def.name == "Wooden Storage Box" {
        BOX_TYPE_NORMAL
    } else if item_def.name == "Large Wooden Storage Box" {
        BOX_TYPE_LARGE
    } else if item_def.name == "Refrigerator" {
        BOX_TYPE_REFRIGERATOR
    } else if item_def.name == "Compost" {
        BOX_TYPE_COMPOST
    } else if item_def.name == "Backpack" {
        BOX_TYPE_BACKPACK
    } else if item_def.name == "Scarecrow" {
        BOX_TYPE_SCARECROW
    } else if item_def.name == "Fish Trap" {
        // Fish traps must be placed on shore (land adjacent to water)
        if !crate::environment::is_position_on_shore(ctx, world_x, world_y) {
            return Err("Fish trap must be placed on shore (land adjacent to water).".to_string());
        }
        BOX_TYPE_FISH_TRAP
    } else if item_def.name == "Wooden Beehive" {
        BOX_TYPE_PLAYER_BEEHIVE
    } else {
        return Err("Item is not a storage container.".to_string());
    };

    match &item_to_place.location { 
        ItemLocation::Inventory(data) => {
            if data.owner_id != sender_id {
                return Err("Item to place storage box not owned by player or not in direct possession.".to_string());
            }
        }
        ItemLocation::Hotbar(data) => {
            if data.owner_id != sender_id {
                return Err("Item to place storage box not owned by player or not in direct possession.".to_string());
            }
        }
        _ => return Err("Wooden Storage Box must be in inventory or hotbar to be placed.".to_string()),
    }

    // 3. Validate Placement Location (Collision Checks)
    let new_chunk_index = calculate_chunk_index(world_x, world_y);
    
    // Check if placement position is on water (including hot springs)
    if crate::environment::is_position_on_water(ctx, world_x, world_y) {
        return Err("Cannot place storage box on water.".to_string());
    }
    
    // Check collision with existing boxes - use type-specific collision radii
    // This prevents boxes from overlapping visually
    let new_box_radius = get_box_collision_radius(box_type);
    if boxes.iter().any(|b| {
        if b.is_destroyed { return false; } // Skip destroyed boxes
        
        // Get the collision radius for the existing box
        let existing_radius = get_box_collision_radius(b.box_type);
        
        // Account for visual center offset - beehives use a larger Y offset
        let existing_y_offset = if b.box_type == BOX_TYPE_PLAYER_BEEHIVE {
            BOX_COLLISION_Y_OFFSET + 100.0 // Match the placement offset for beehives
        } else {
            BOX_COLLISION_Y_OFFSET
        };
        let existing_visual_y = b.pos_y - existing_y_offset;
        
        // Calculate distance between centers
        let dist_sq = (b.pos_x - world_x).powi(2) + (existing_visual_y - world_y).powi(2);
        
        // Minimum distance = sum of both radii (with a small buffer)
        let min_distance = new_box_radius + existing_radius;
        let min_distance_sq = min_distance * min_distance;
        
        dist_sq < min_distance_sq
    }) {
        return Err("Too close to another structure.".to_string());
    }
    // Add other collision checks as needed (e.g., with players, other entities)

    // 4. Create the WoodenStorageBox entity
    // Determine health based on box type
    let (initial_health, max_health) = match box_type {
        BOX_TYPE_LARGE => (LARGE_WOODEN_STORAGE_BOX_INITIAL_HEALTH, LARGE_WOODEN_STORAGE_BOX_MAX_HEALTH),
        BOX_TYPE_REFRIGERATOR => {
            use crate::refrigerator::{REFRIGERATOR_INITIAL_HEALTH, REFRIGERATOR_MAX_HEALTH};
            (REFRIGERATOR_INITIAL_HEALTH, REFRIGERATOR_MAX_HEALTH)
        },
        BOX_TYPE_COMPOST => {
            use crate::compost::{COMPOST_INITIAL_HEALTH, COMPOST_MAX_HEALTH};
            (COMPOST_INITIAL_HEALTH, COMPOST_MAX_HEALTH)
        },
        BOX_TYPE_BACKPACK => (BACKPACK_INITIAL_HEALTH, BACKPACK_MAX_HEALTH),
        BOX_TYPE_SCARECROW => (SCARECROW_INITIAL_HEALTH, SCARECROW_MAX_HEALTH),
        BOX_TYPE_FISH_TRAP => (FISH_TRAP_INITIAL_HEALTH, FISH_TRAP_MAX_HEALTH),
        BOX_TYPE_PLAYER_BEEHIVE => (PLAYER_BEEHIVE_INITIAL_HEALTH, PLAYER_BEEHIVE_MAX_HEALTH),
        _ => (WOODEN_STORAGE_BOX_INITIAL_HEALTH, WOODEN_STORAGE_BOX_MAX_HEALTH),
    };
    
    // Beehives are taller (256px) and need a larger Y offset to place them lower
    let y_offset = if box_type == BOX_TYPE_PLAYER_BEEHIVE {
        BOX_COLLISION_Y_OFFSET + 100.0 // Additional 100px offset for beehives (taller structure)
    } else {
        BOX_COLLISION_Y_OFFSET
    };
    
    let new_box = WoodenStorageBox {
        id: 0, // Auto-incremented
        pos_x: world_x,
        pos_y: world_y + y_offset, // Compensate for bottom-anchoring + render offset (larger for beehives)
        chunk_index: new_chunk_index,
        placed_by: sender_id,
        box_type,
        // Slots 0-17 (used by both normal and large boxes)
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
        // Slots 18-47 (only used by large boxes, but always present in table)
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
        health: initial_health,
        max_health,
        is_destroyed: false,
        destroyed_at: None,
        last_hit_time: None,
        last_damaged_by: None,
        respawn_at: Timestamp::UNIX_EPOCH, // 0 = not respawning (player-placed boxes don't respawn)
        // Monument placeable system (player-placed boxes are not monuments)
        is_monument: false,
        active_user_id: None,
        active_user_since: None,
    };
    let inserted_box = boxes.insert(new_box);
    let box_type_name = match box_type {
        BOX_TYPE_LARGE => "Large Wooden Storage Box",
        BOX_TYPE_REFRIGERATOR => "Refrigerator",
        BOX_TYPE_COMPOST => "Compost",
        BOX_TYPE_BACKPACK => "Backpack",
        BOX_TYPE_SCARECROW => "Scarecrow",
        BOX_TYPE_FISH_TRAP => "Fish Trap",
        BOX_TYPE_PLAYER_BEEHIVE => "Wooden Beehive",
        _ => "Wooden Storage Box",
    };
    log::info!("Player {:?} placed new {} with ID {}.\nLocation: {:?}", sender_id, box_type_name, inserted_box.id, item_to_place.location);


    // 5. Consume the item from player's inventory
    if item_to_place.quantity > 1 {
        item_to_place.quantity -= 1;
        inventory_items.instance_id().update(item_to_place);
    } else {
        inventory_items.instance_id().delete(item_instance_id);
    }
    
    log::info!("Wooden Storage Box (item instance {}) consumed from player {:?} inventory after placement.", item_instance_id, sender_id);
    
    // Track quest progress for storage box placement
    if let Err(e) = crate::quests::track_quest_progress(
        ctx,
        sender_id,
        crate::quests::QuestObjectiveType::PlaceStorageBox,
        None,
        1,
    ) {
        log::error!("Failed to track quest progress for storage box placement: {}", e);
    }

    Ok(())
}

/// --- Interact with Storage Box ---
/// Allows a player to interact with a storage box if they are close enough.
/// Uses the helper function for validation before proceeding.
#[spacetimedb::reducer]
pub fn interact_with_storage_box(ctx: &ReducerContext, box_id: u32) -> Result<(), String> {
    validate_box_interaction(ctx, box_id)?; // Use helper for validation
    log::debug!("Player {:?} interaction check OK for box {}", ctx.sender, box_id);
    Ok(())
}

/// --- Pickup Storage Box ---
/// Allows a player to pick up an *empty* storage box, returning it to their inventory.
#[spacetimedb::reducer]
pub fn pickup_storage_box(ctx: &ReducerContext, box_id: u32) -> Result<(), String> {
    let sender_id = ctx.sender;
    let mut boxes_table = ctx.db.wooden_storage_box();
    let item_defs_table = ctx.db.item_definition();
    // inventory_items_table is not needed if the box must be empty

    log::info!("Player {:?} attempting to pick up storage box {}.", sender_id, box_id);

    // 1. Validate Interaction
    let (_player, storage_box_to_pickup) = validate_box_interaction(ctx, box_id)?;
    // Optional: Add ownership check if only the placer can pick it up:
    // if storage_box_to_pickup.placed_by != sender_id {
    //     return Err("You did not place this storage box.".to_string());
    // }

    // 2. Check if the box is empty (check all slots based on box type)
    for i in 0..storage_box_to_pickup.num_slots() {
        if storage_box_to_pickup.get_slot_instance_id(i as u8).is_some() {
            return Err("Cannot pick up storage box: It is not empty.".to_string());
        }
    }

    // 3. Find the correct ItemDefinition based on box type
    let item_name = match storage_box_to_pickup.box_type {
        BOX_TYPE_LARGE => "Large Wooden Storage Box",
        BOX_TYPE_REFRIGERATOR => "Refrigerator",
        BOX_TYPE_COMPOST => "Compost",
        BOX_TYPE_REPAIR_BENCH => "Repair Bench",
        BOX_TYPE_COOKING_STATION => "Cooking Station",
        BOX_TYPE_SCARECROW => "Scarecrow",
        BOX_TYPE_FISH_TRAP => "Fish Trap",
        BOX_TYPE_PLAYER_BEEHIVE => "Wooden Beehive",
        _ => "Wooden Storage Box",
    };
    let box_item_def = item_defs_table.iter()
        .find(|def| def.name == item_name)
        .ok_or_else(|| format!("ItemDefinition for '{}' not found. Cannot give item back.", item_name))?;

    // 4. Give the player back one storage box item
    // The add_item_to_player_inventory function will handle finding a slot or stacking.
    match add_item_to_player_inventory(ctx, sender_id, box_item_def.id, 1) {
        Ok(_) => log::info!("Added '{}' item to player {:?} inventory.", item_name, sender_id),
        Err(e) => {
            log::error!("Failed to give '{}' item to player {:?}: {}. Box not deleted.", item_name, sender_id, e);
            return Err(format!("Could not add Wooden Storage Box to your inventory: {}", e));
        }
    }

    // 5. Stop beehive sound if this was a player beehive (sound should already be stopped since box must be empty, but just in case)
    if storage_box_to_pickup.box_type == BOX_TYPE_PLAYER_BEEHIVE {
        crate::sound_events::stop_beehive_sound(ctx, box_id as u64);
    }
    
    // 6. Delete the WoodenStorageBox entity from the world
    boxes_table.id().delete(box_id);
    log::info!("Storage box {} picked up and removed from world by player {:?}.", box_id, sender_id);

    Ok(())
}

#[spacetimedb::reducer]
pub fn drop_item_from_box_slot_to_world(
    ctx: &ReducerContext,
    box_id: u32,
    slot_index: u8,
) -> Result<(), String> {
    let sender_id = ctx.sender;
    let player_table = ctx.db.player();
    let mut wooden_box_table = ctx.db.wooden_storage_box();

    log::info!("[DropFromBoxToWorld] Player {} attempting to drop item from box ID {}, slot index {}.", sender_id, box_id, slot_index);

    // 1. Get Player (for drop position calculation and permission, though permission is implicit by calling)
    let player = player_table.identity().find(sender_id)
        .ok_or_else(|| format!("Player {} not found.", sender_id))?;

    // 2. Get WoodenStorageBox
    // Use validate_box_interaction to also check distance
    let (_player_for_validation, mut wooden_box) = validate_box_interaction(ctx, box_id)?;
    // We refetch player here specifically for the drop location, 
    // as validate_box_interaction returns a potentially different instance.
    let player_for_drop_location = player_table.identity().find(sender_id)
        .ok_or_else(|| format!("Player {} not found for drop location.", sender_id))?;

    // 3. Call the generic handler from inventory_management
    // The handler will modify wooden_box (clear slot) and create dropped item, delete inventory_item.
    crate::inventory_management::handle_drop_from_container_slot(ctx, &mut wooden_box, slot_index, &player_for_drop_location)?;

    // Check box type before moving wooden_box
    let is_backpack = wooden_box.box_type == BOX_TYPE_BACKPACK;
    let is_military_ration = wooden_box.box_type == BOX_TYPE_MILITARY_RATION;
    let is_mine_cart = wooden_box.box_type == BOX_TYPE_MINE_CART;
    let is_wild_beehive = wooden_box.box_type == BOX_TYPE_WILD_BEEHIVE;
    let is_player_beehive = wooden_box.box_type == BOX_TYPE_PLAYER_BEEHIVE;

    // 4. Persist changes to the WoodenStorageBox
    wooden_box_table.id().update(wooden_box);
    log::info!("[DropFromBoxToWorld] Successfully dropped item from box {}, slot {}. Box updated.", box_id, slot_index);
    
    // Stop beehive buzzing sound if Queen Bee was dropped from slot 0
    if is_player_beehive && slot_index == 0 {
        crate::sound_events::stop_beehive_sound(ctx, box_id as u64);
    }

    // Auto-despawn empty backpacks
    if is_backpack {
        let _ = crate::backpack::check_and_despawn_if_empty(ctx, box_id);
    }
    
    // Auto-despawn empty military rations
    if is_military_ration {
        let _ = crate::military_ration::check_and_despawn_military_ration_if_empty(ctx, box_id);
    }
    
    // Auto-despawn empty mine carts
    if is_mine_cart {
        let _ = crate::mine_cart::check_and_despawn_mine_cart_if_empty(ctx, box_id);
    }
    
    // Auto-despawn empty wild beehives
    if is_wild_beehive {
        let _ = crate::wild_beehive::check_and_despawn_wild_beehive_if_empty(ctx, box_id);
    }

    Ok(())
}

#[spacetimedb::reducer]
pub fn split_and_drop_item_from_box_slot_to_world(
    ctx: &ReducerContext,
    box_id: u32,
    slot_index: u8,
    quantity_to_split: u32,
) -> Result<(), String> {
    let sender_id = ctx.sender;
    let player_table = ctx.db.player();
    let mut wooden_box_table = ctx.db.wooden_storage_box();

    log::info!("[SplitDropFromBoxToWorld] Player {} attempting to split {} from box ID {}, slot {}.", 
             sender_id, quantity_to_split, box_id, slot_index);

    // 1. Get Player (for drop position calculation and permission)
    // Use validate_box_interaction to also check distance
    let (_player_for_validation, mut wooden_box) = validate_box_interaction(ctx, box_id)?;
    // Refetch player for drop location
    let player_for_drop_location = player_table.identity().find(sender_id)
        .ok_or_else(|| format!("Player {} not found for drop location.", sender_id))?;


    // 3. Call the generic handler from inventory_management
    crate::inventory_management::handle_split_and_drop_from_container_slot(ctx, &mut wooden_box, slot_index, quantity_to_split, &player_for_drop_location)?;

    // Check box type before moving wooden_box
    let is_backpack = wooden_box.box_type == BOX_TYPE_BACKPACK;
    let is_military_ration = wooden_box.box_type == BOX_TYPE_MILITARY_RATION;
    let is_mine_cart = wooden_box.box_type == BOX_TYPE_MINE_CART;
    let is_wild_beehive = wooden_box.box_type == BOX_TYPE_WILD_BEEHIVE;

    // 4. Persist changes to the WoodenStorageBox (if its slot was cleared because the whole stack was dropped)
    wooden_box_table.id().update(wooden_box); 

    log::info!("[SplitDropFromBoxToWorld] Successfully split and dropped from box {}, slot {}. Box updated if slot cleared.", box_id, slot_index);

    // Auto-despawn empty backpacks
    if is_backpack {
        let _ = crate::backpack::check_and_despawn_if_empty(ctx, box_id);
    }
    
    // Auto-despawn empty military rations
    if is_military_ration {
        let _ = crate::military_ration::check_and_despawn_military_ration_if_empty(ctx, box_id);
    }
    
    // Auto-despawn empty mine carts
    if is_mine_cart {
        let _ = crate::mine_cart::check_and_despawn_mine_cart_if_empty(ctx, box_id);
    }
    
    // Auto-despawn empty wild beehives
    if is_wild_beehive {
        let _ = crate::wild_beehive::check_and_despawn_wild_beehive_if_empty(ctx, box_id);
    }
    
    Ok(())
}

/******************************************************************************
 *                            TRAIT IMPLEMENTATIONS                           *
 ******************************************************************************/

/// --- ItemContainer Implementation for WoodenStorageBox ---
/// Implements the ItemContainer trait for the WoodenStorageBox struct.
/// Provides methods to get the number of slots and access individual slots.
impl ItemContainer for WoodenStorageBox {
    fn num_slots(&self) -> usize {
        // Return slot count based on box_type
        match self.box_type {
            BOX_TYPE_LARGE => NUM_LARGE_BOX_SLOTS,
            BOX_TYPE_REFRIGERATOR => {
                use crate::refrigerator::NUM_REFRIGERATOR_SLOTS;
                NUM_REFRIGERATOR_SLOTS
            },
            BOX_TYPE_COMPOST => {
                use crate::compost::NUM_COMPOST_SLOTS;
                NUM_COMPOST_SLOTS
            },
            BOX_TYPE_BACKPACK => NUM_BACKPACK_SLOTS,
            BOX_TYPE_REPAIR_BENCH => NUM_REPAIR_BENCH_SLOTS,
            BOX_TYPE_COOKING_STATION => NUM_COOKING_STATION_SLOTS,
            BOX_TYPE_SCARECROW => NUM_SCARECROW_SLOTS,
            BOX_TYPE_MILITARY_RATION => NUM_MILITARY_RATION_SLOTS,
            BOX_TYPE_MINE_CART => NUM_MINE_CART_SLOTS,
            BOX_TYPE_FISH_TRAP => NUM_FISH_TRAP_SLOTS,
            BOX_TYPE_WILD_BEEHIVE => NUM_WILD_BEEHIVE_SLOTS,
            BOX_TYPE_PLAYER_BEEHIVE => NUM_PLAYER_BEEHIVE_SLOTS,
            _ => NUM_BOX_SLOTS,
        }
    }

    /// --- Get Slot Instance ID ---
    /// Returns the instance ID for a given slot index.
    /// Returns None if the slot index is out of bounds for this box type.
    fn get_slot_instance_id(&self, slot_index: u8) -> Option<u64> {
        // Check bounds based on box type
        if slot_index as usize >= self.num_slots() {
            return None;
        }
        match slot_index {
            0 => self.slot_instance_id_0,
            1 => self.slot_instance_id_1,
            2 => self.slot_instance_id_2,
            3 => self.slot_instance_id_3,
            4 => self.slot_instance_id_4,
            5 => self.slot_instance_id_5,
            6 => self.slot_instance_id_6,
            7 => self.slot_instance_id_7,
            8 => self.slot_instance_id_8,
            9 => self.slot_instance_id_9,
            10 => self.slot_instance_id_10,
            11 => self.slot_instance_id_11,
            12 => self.slot_instance_id_12,
            13 => self.slot_instance_id_13,
            14 => self.slot_instance_id_14,
            15 => self.slot_instance_id_15,
            16 => self.slot_instance_id_16,
            17 => self.slot_instance_id_17,
            // Large box additional slots (18-47)
            18 => self.slot_instance_id_18,
            19 => self.slot_instance_id_19,
            20 => self.slot_instance_id_20,
            21 => self.slot_instance_id_21,
            22 => self.slot_instance_id_22,
            23 => self.slot_instance_id_23,
            24 => self.slot_instance_id_24,
            25 => self.slot_instance_id_25,
            26 => self.slot_instance_id_26,
            27 => self.slot_instance_id_27,
            28 => self.slot_instance_id_28,
            29 => self.slot_instance_id_29,
            30 => self.slot_instance_id_30,
            31 => self.slot_instance_id_31,
            32 => self.slot_instance_id_32,
            33 => self.slot_instance_id_33,
            34 => self.slot_instance_id_34,
            35 => self.slot_instance_id_35,
            36 => self.slot_instance_id_36,
            37 => self.slot_instance_id_37,
            38 => self.slot_instance_id_38,
            39 => self.slot_instance_id_39,
            40 => self.slot_instance_id_40,
            41 => self.slot_instance_id_41,
            42 => self.slot_instance_id_42,
            43 => self.slot_instance_id_43,
            44 => self.slot_instance_id_44,
            45 => self.slot_instance_id_45,
            46 => self.slot_instance_id_46,
            47 => self.slot_instance_id_47,
            _ => None,
        }
    }

    /// --- Get Slot Definition ID ---
    /// Returns the definition ID for a given slot index.
    /// Returns None if the slot index is out of bounds for this box type.
    fn get_slot_def_id(&self, slot_index: u8) -> Option<u64> {
        // Check bounds based on box type
        if slot_index as usize >= self.num_slots() {
            return None;
        }
        match slot_index {
            0 => self.slot_def_id_0,
            1 => self.slot_def_id_1,
            2 => self.slot_def_id_2,
            3 => self.slot_def_id_3,
            4 => self.slot_def_id_4,
            5 => self.slot_def_id_5,
            6 => self.slot_def_id_6,
            7 => self.slot_def_id_7,
            8 => self.slot_def_id_8,
            9 => self.slot_def_id_9,
            10 => self.slot_def_id_10,
            11 => self.slot_def_id_11,
            12 => self.slot_def_id_12,
            13 => self.slot_def_id_13,
            14 => self.slot_def_id_14,
            15 => self.slot_def_id_15,
            16 => self.slot_def_id_16,
            17 => self.slot_def_id_17,
            // Large box additional slots (18-47)
            18 => self.slot_def_id_18,
            19 => self.slot_def_id_19,
            20 => self.slot_def_id_20,
            21 => self.slot_def_id_21,
            22 => self.slot_def_id_22,
            23 => self.slot_def_id_23,
            24 => self.slot_def_id_24,
            25 => self.slot_def_id_25,
            26 => self.slot_def_id_26,
            27 => self.slot_def_id_27,
            28 => self.slot_def_id_28,
            29 => self.slot_def_id_29,
            30 => self.slot_def_id_30,
            31 => self.slot_def_id_31,
            32 => self.slot_def_id_32,
            33 => self.slot_def_id_33,
            34 => self.slot_def_id_34,
            35 => self.slot_def_id_35,
            36 => self.slot_def_id_36,
            37 => self.slot_def_id_37,
            38 => self.slot_def_id_38,
            39 => self.slot_def_id_39,
            40 => self.slot_def_id_40,
            41 => self.slot_def_id_41,
            42 => self.slot_def_id_42,
            43 => self.slot_def_id_43,
            44 => self.slot_def_id_44,
            45 => self.slot_def_id_45,
            46 => self.slot_def_id_46,
            47 => self.slot_def_id_47,
            _ => None,
        }
    }

    /// --- Set Slot ---
    /// Sets the item instance ID and definition ID for a given slot index. 
    /// Returns None if the slot index is out of bounds for this box type.
    fn set_slot(&mut self, slot_index: u8, instance_id: Option<u64>, def_id: Option<u64>) {
        // Check bounds based on box type
        if slot_index as usize >= self.num_slots() {
            log::error!("[WoodenStorageBox] Attempted to set slot {} on box_type {} (max slots: {})", 
                slot_index, self.box_type, self.num_slots());
            return;
        }
        match slot_index {
            0 => { self.slot_instance_id_0 = instance_id; self.slot_def_id_0 = def_id; }
            1 => { self.slot_instance_id_1 = instance_id; self.slot_def_id_1 = def_id; }
            2 => { self.slot_instance_id_2 = instance_id; self.slot_def_id_2 = def_id; }
            3 => { self.slot_instance_id_3 = instance_id; self.slot_def_id_3 = def_id; }
            4 => { self.slot_instance_id_4 = instance_id; self.slot_def_id_4 = def_id; }
            5 => { self.slot_instance_id_5 = instance_id; self.slot_def_id_5 = def_id; }
            6 => { self.slot_instance_id_6 = instance_id; self.slot_def_id_6 = def_id; }
            7 => { self.slot_instance_id_7 = instance_id; self.slot_def_id_7 = def_id; }
            8 => { self.slot_instance_id_8 = instance_id; self.slot_def_id_8 = def_id; }
            9 => { self.slot_instance_id_9 = instance_id; self.slot_def_id_9 = def_id; }
            10 => { self.slot_instance_id_10 = instance_id; self.slot_def_id_10 = def_id; }
            11 => { self.slot_instance_id_11 = instance_id; self.slot_def_id_11 = def_id; }
            12 => { self.slot_instance_id_12 = instance_id; self.slot_def_id_12 = def_id; }
            13 => { self.slot_instance_id_13 = instance_id; self.slot_def_id_13 = def_id; }
            14 => { self.slot_instance_id_14 = instance_id; self.slot_def_id_14 = def_id; }
            15 => { self.slot_instance_id_15 = instance_id; self.slot_def_id_15 = def_id; }
            16 => { self.slot_instance_id_16 = instance_id; self.slot_def_id_16 = def_id; }
            17 => { self.slot_instance_id_17 = instance_id; self.slot_def_id_17 = def_id; }
            // Large box additional slots (18-47)
            18 => { self.slot_instance_id_18 = instance_id; self.slot_def_id_18 = def_id; }
            19 => { self.slot_instance_id_19 = instance_id; self.slot_def_id_19 = def_id; }
            20 => { self.slot_instance_id_20 = instance_id; self.slot_def_id_20 = def_id; }
            21 => { self.slot_instance_id_21 = instance_id; self.slot_def_id_21 = def_id; }
            22 => { self.slot_instance_id_22 = instance_id; self.slot_def_id_22 = def_id; }
            23 => { self.slot_instance_id_23 = instance_id; self.slot_def_id_23 = def_id; }
            24 => { self.slot_instance_id_24 = instance_id; self.slot_def_id_24 = def_id; }
            25 => { self.slot_instance_id_25 = instance_id; self.slot_def_id_25 = def_id; }
            26 => { self.slot_instance_id_26 = instance_id; self.slot_def_id_26 = def_id; }
            27 => { self.slot_instance_id_27 = instance_id; self.slot_def_id_27 = def_id; }
            28 => { self.slot_instance_id_28 = instance_id; self.slot_def_id_28 = def_id; }
            29 => { self.slot_instance_id_29 = instance_id; self.slot_def_id_29 = def_id; }
            30 => { self.slot_instance_id_30 = instance_id; self.slot_def_id_30 = def_id; }
            31 => { self.slot_instance_id_31 = instance_id; self.slot_def_id_31 = def_id; }
            32 => { self.slot_instance_id_32 = instance_id; self.slot_def_id_32 = def_id; }
            33 => { self.slot_instance_id_33 = instance_id; self.slot_def_id_33 = def_id; }
            34 => { self.slot_instance_id_34 = instance_id; self.slot_def_id_34 = def_id; }
            35 => { self.slot_instance_id_35 = instance_id; self.slot_def_id_35 = def_id; }
            36 => { self.slot_instance_id_36 = instance_id; self.slot_def_id_36 = def_id; }
            37 => { self.slot_instance_id_37 = instance_id; self.slot_def_id_37 = def_id; }
            38 => { self.slot_instance_id_38 = instance_id; self.slot_def_id_38 = def_id; }
            39 => { self.slot_instance_id_39 = instance_id; self.slot_def_id_39 = def_id; }
            40 => { self.slot_instance_id_40 = instance_id; self.slot_def_id_40 = def_id; }
            41 => { self.slot_instance_id_41 = instance_id; self.slot_def_id_41 = def_id; }
            42 => { self.slot_instance_id_42 = instance_id; self.slot_def_id_42 = def_id; }
            43 => { self.slot_instance_id_43 = instance_id; self.slot_def_id_43 = def_id; }
            44 => { self.slot_instance_id_44 = instance_id; self.slot_def_id_44 = def_id; }
            45 => { self.slot_instance_id_45 = instance_id; self.slot_def_id_45 = def_id; }
            46 => { self.slot_instance_id_46 = instance_id; self.slot_def_id_46 = def_id; }
            47 => { self.slot_instance_id_47 = instance_id; self.slot_def_id_47 = def_id; }
            _ => { log::error!("[WoodenStorageBox] Attempted to set invalid slot index: {}", slot_index); }
        }
    }

    // --- NEW Methods for ItemLocation Refactor ---
    fn get_container_type(&self) -> crate::models::ContainerType {
        ContainerType::WoodenStorageBox
    }

    fn get_container_id(&self) -> u64 {
        self.id as u64
    }
}

/// --- Helper struct to implement the ContainerItemClearer trait for WoodenStorageBox ---
/// Implements the ContainerItemClearer trait for the WoodenStorageBox struct.
/// Provides a method to clear an item from all boxes.
pub struct WoodenStorageBoxClearer;

impl ContainerItemClearer for WoodenStorageBoxClearer {
    fn clear_item(ctx: &ReducerContext, item_instance_id: u64) -> bool {
        let mut boxes = ctx.db.wooden_storage_box();
        let inventory_items = ctx.db.inventory_item(); 
        let mut box_updated = false;
        let mut box_to_update: Option<WoodenStorageBox> = None; 

        for current_box in boxes.iter() {
            let mut temp_box = current_box.clone(); 
            let mut found_in_this_box = false;
            
            for i in 0..temp_box.num_slots() as u8 {
                if temp_box.get_slot_instance_id(i) == Some(item_instance_id) {
                    log::debug!("[WoodenStorageBoxClearer] Found item {} in box {} slot {}. Clearing slot and updating item location.", item_instance_id, temp_box.id, i);
                    temp_box.set_slot(i, None, None); 
                    found_in_this_box = true;
                    box_to_update = Some(temp_box.clone()); 
                    break;
                }
            }

            if found_in_this_box {
                if let Some(mut item_to_update) = inventory_items.instance_id().find(item_instance_id) {
                    item_to_update.location = ItemLocation::Unknown;
                    inventory_items.instance_id().update(item_to_update);
                }
                box_updated = true;
                break; 
            }
        }
        if let Some(b) = box_to_update {
            boxes.id().update(b);
        }
        box_updated
    }
}

/******************************************************************************
 *                             HELPER FUNCTIONS                               *
 ******************************************************************************/

/// --- Validate Box Interaction ---
/// Validates if a player can interact with a specific box (checks existence and distance).
/// Returns Ok((Player struct instance, WoodenStorageBox struct instance)) on success, or Err(String) on failure.
/// Does NOT check ownership.
pub fn validate_box_interaction(
    ctx: &ReducerContext,
    box_id: u32,
) -> Result<(Player, WoodenStorageBox), String> { // Use corrected Player type
    let sender_id = ctx.sender;
    let players = ctx.db.player();
    let boxes = ctx.db.wooden_storage_box();

    let player = players.identity().find(sender_id).ok_or_else(|| "Player not found".to_string())?;
    let storage_box = boxes.id().find(box_id).ok_or_else(|| format!("Storage Box {} not found", box_id))?;

    if storage_box.is_destroyed {
        return Err(format!("Storage Box {} is destroyed.", box_id));
    }

    // Check distance between the interacting player and the box
    // Account for the visual center offset that was applied during placement
    // When placing, we add BOX_COLLISION_Y_OFFSET to the Y position to compensate for bottom-anchoring + render offset
    // So we need to subtract that same offset to get the actual visual center for collision detection
    let dx = player.position_x - storage_box.pos_x;
    let dy = player.position_y - (storage_box.pos_y - BOX_COLLISION_Y_OFFSET);
    if (dx * dx + dy * dy) > BOX_INTERACTION_DISTANCE_SQUARED {
        return Err("Too far away".to_string());
    }

    // NEW: Check shelter access control
    if !crate::shelter::can_player_interact_with_object_in_shelter(
        ctx,
        sender_id,
        player.position_x,
        player.position_y,
        storage_box.pos_x,
        storage_box.pos_y,
    ) {
        return Err("Cannot interact with storage box inside shelter - only the shelter owner can access it from inside".to_string());
    }

    // Check safe zone container exclusivity (only for monument placeables)
    if storage_box.is_monument {
        crate::active_effects::validate_safe_zone_container_access(
            ctx,
            storage_box.pos_x,
            storage_box.pos_y,
            storage_box.active_user_id,
            storage_box.active_user_since,
        )?;
    }

    Ok((player, storage_box))
}

/// --- Open Storage Box Container ---
/// Called when a player opens the storage box UI. Sets the active_user_id to prevent
/// other players from using this container in safe zones.
#[spacetimedb::reducer]
pub fn open_storage_box_container(ctx: &ReducerContext, box_id: u32) -> Result<(), String> {
    let (_player, mut storage_box) = validate_box_interaction(ctx, box_id)?;
    
    // Set the active user
    storage_box.active_user_id = Some(ctx.sender);
    storage_box.active_user_since = Some(ctx.timestamp);
    
    ctx.db.wooden_storage_box().id().update(storage_box);
    log::debug!("Player {:?} opened storage box {} container", ctx.sender, box_id);
    
    Ok(())
}

/// --- Close Storage Box Container ---
/// Called when a player closes the storage box UI. Clears the active_user_id to allow
/// other players to use this container.
#[spacetimedb::reducer]
pub fn close_storage_box_container(ctx: &ReducerContext, box_id: u32) -> Result<(), String> {
    let storage_box = ctx.db.wooden_storage_box().id().find(box_id)
        .ok_or_else(|| format!("Storage box {} not found", box_id))?;
    
    // Only clear if this player is the active user
    if storage_box.active_user_id == Some(ctx.sender) {
        let mut storage_box = storage_box;
        storage_box.active_user_id = None;
        storage_box.active_user_since = None;
        ctx.db.wooden_storage_box().id().update(storage_box);
        log::debug!("Player {:?} closed storage box {} container", ctx.sender, box_id);
    }
    
    Ok(())
}