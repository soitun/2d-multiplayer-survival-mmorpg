/******************************************************************************
 *                                                                            *
 * Defines the Barbecue entity, its data structure, and associated logic.    *
 * Handles interactions like placing the barbecue, adding/removing items,   *
 * splitting stacks, and managing items within the barbecue's slots.          *
 * Uses generic handlers from inventory_management.rs where applicable.      *
 * Functions exactly like a campfire but with 12 slots instead of 5.        *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{Identity, Timestamp, ReducerContext, Table, log, SpacetimeType, TimeDuration, ScheduleAt};
use std::cmp::min;
use rand::Rng;

// Import new models
use crate::models::{ContainerType, ItemLocation, ContainerLocationData};
use crate::cooking::CookingProgress;

// Import table traits and concrete types
use crate::player as PlayerTableTrait;
use crate::Player;
use crate::items::{
    inventory_item as InventoryItemTableTrait,
    item_definition as ItemDefinitionTableTrait,
    InventoryItem, ItemDefinition,
    calculate_merge_result, split_stack_helper, add_item_to_player_inventory
};
use crate::inventory_management::{self, ItemContainer, ContainerItemClearer, merge_or_place_into_container_slot};
use crate::player_inventory::{move_item_to_inventory, move_item_to_hotbar, find_first_empty_player_slot, get_player_item};
use crate::environment::calculate_chunk_index;
use crate::dropped_item::create_dropped_item_entity;
use crate::sound_events::{start_barbecue_sound, stop_barbecue_sound};
use crate::world_state::world_state as WorldStateTableTrait;
use crate::world_state::WeatherType;
use crate::shelter::shelter as ShelterTableTrait;
use crate::tree::tree as TreeTableTrait;

// --- Constants ---
pub(crate) const BARBECUE_COLLISION_RADIUS: f32 = 20.0;
pub(crate) const BARBECUE_COLLISION_Y_OFFSET: f32 = 0.0;
pub(crate) const PLAYER_BARBECUE_COLLISION_DISTANCE_SQUARED: f32 = 
    (super::PLAYER_RADIUS + BARBECUE_COLLISION_RADIUS) * (super::PLAYER_RADIUS + BARBECUE_COLLISION_RADIUS);
pub(crate) const BARBECUE_BARBECUE_COLLISION_DISTANCE_SQUARED: f32 = 
    (BARBECUE_COLLISION_RADIUS * 2.0) * (BARBECUE_COLLISION_RADIUS * 2.0);

// --- Placement constants ---
pub(crate) const BARBECUE_PLACEMENT_MAX_DISTANCE: f32 = 96.0;
pub(crate) const BARBECUE_PLACEMENT_MAX_DISTANCE_SQUARED: f32 = BARBECUE_PLACEMENT_MAX_DISTANCE * BARBECUE_PLACEMENT_MAX_DISTANCE;

// --- Initial amounts ---
pub const INITIAL_BARBECUE_FUEL_AMOUNT: u32 = 50;

// --- Health constants ---
pub const BARBECUE_INITIAL_HEALTH: f32 = 100.0;
pub const BARBECUE_MAX_HEALTH: f32 = 100.0;

// Interaction constants
pub(crate) const PLAYER_BARBECUE_INTERACTION_DISTANCE: f32 = 96.0;
pub(crate) const PLAYER_BARBECUE_INTERACTION_DISTANCE_SQUARED: f32 = 
    PLAYER_BARBECUE_INTERACTION_DISTANCE * PLAYER_BARBECUE_INTERACTION_DISTANCE;

// Fuel constants
pub(crate) const FUEL_CONSUME_INTERVAL_SECS: u64 = 5;
pub const NUM_BARBECUE_SLOTS: usize = 12;
const FUEL_CHECK_INTERVAL_SECS: u64 = 1;
pub const BARBECUE_PROCESS_INTERVAL_SECS: u64 = 1;
const CHARCOAL_PRODUCTION_CHANCE: u8 = 75;

/// --- Barbecue Data Structure ---
/// Represents a barbecue in the game world with position, owner, burning state,
/// fuel slots (using individual fields instead of arrays), and fuel consumption timing.
#[spacetimedb::table(name = barbecue, public)]
#[derive(Clone)]
pub struct Barbecue {
    #[primary_key]
    #[auto_inc]
    pub id: u32,
    pub pos_x: f32,
    pub pos_y: f32,
    pub chunk_index: u32,
    pub placed_by: Identity,
    pub placed_at: Timestamp,
    pub is_burning: bool,
    
    // 12 slots for items
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
    
    pub current_fuel_def_id: Option<u64>,
    pub remaining_fuel_burn_time_secs: Option<f32>,
    pub health: f32,
    pub max_health: f32,
    pub is_destroyed: bool,
    pub destroyed_at: Option<Timestamp>,
    pub last_hit_time: Option<Timestamp>,
    pub last_damaged_by: Option<Identity>,

    // Cooking progress for each slot
    pub slot_0_cooking_progress: Option<CookingProgress>,
    pub slot_1_cooking_progress: Option<CookingProgress>,
    pub slot_2_cooking_progress: Option<CookingProgress>,
    pub slot_3_cooking_progress: Option<CookingProgress>,
    pub slot_4_cooking_progress: Option<CookingProgress>,
    pub slot_5_cooking_progress: Option<CookingProgress>,
    pub slot_6_cooking_progress: Option<CookingProgress>,
    pub slot_7_cooking_progress: Option<CookingProgress>,
    pub slot_8_cooking_progress: Option<CookingProgress>,
    pub slot_9_cooking_progress: Option<CookingProgress>,
    pub slot_10_cooking_progress: Option<CookingProgress>,
    pub slot_11_cooking_progress: Option<CookingProgress>,
}

// Schedule Table for per-barbecue processing
#[spacetimedb::table(name = barbecue_processing_schedule, scheduled(process_barbecue_logic_scheduled))]
#[derive(Clone)]
pub struct BarbecueProcessingSchedule {
    #[primary_key]
    pub barbecue_id: u64,
    pub scheduled_at: ScheduleAt,
}

/******************************************************************************
 *                           REDUCERS (Generic Handlers)                        *
 ******************************************************************************/

/// --- Add Item to Barbecue ---
#[spacetimedb::reducer]
pub fn move_item_to_barbecue(ctx: &ReducerContext, barbecue_id: u32, target_slot_index: u8, item_instance_id: u64) -> Result<(), String> {
    let (_player, mut barbecue) = validate_barbecue_interaction(ctx, barbecue_id)?;
    
    // Validate item type - prevent water bottles and cauldrons
    let items = ctx.db.inventory_item();
    let item = items.instance_id().find(&item_instance_id)
        .ok_or_else(|| "Item not found.".to_string())?;
    let item_defs = ctx.db.item_definition();
    let item_def = item_defs.id().find(&item.item_def_id)
        .ok_or_else(|| "Item definition not found.".to_string())?;
    
    let blocked_items = ["Reed Water Bottle", "Plastic Water Jug", "Cerametal Field Cauldron Mk. II"];
    if blocked_items.contains(&item_def.name.as_str()) {
        return Err(format!("Cannot place '{}' in barbecue. Use the broth pot's water container slot for water bottles, or place the cauldron on a campfire.", item_def.name));
    }
    
    inventory_management::handle_move_to_container_slot(ctx, &mut barbecue, target_slot_index, item_instance_id)?;
    ctx.db.barbecue().id().update(barbecue.clone());
    schedule_next_barbecue_processing(ctx, barbecue_id);
    Ok(())
}

/// --- Remove Item from Barbecue ---
#[spacetimedb::reducer]
pub fn quick_move_from_barbecue(ctx: &ReducerContext, barbecue_id: u32, source_slot_index: u8) -> Result<(), String> {
    let (_player, mut barbecue) = validate_barbecue_interaction(ctx, barbecue_id)?;
    
    inventory_management::handle_quick_move_from_container(ctx, &mut barbecue, source_slot_index)?;
    let still_has_fuel = check_if_barbecue_has_fuel(ctx, &barbecue);
    if !still_has_fuel && barbecue.is_burning {
        barbecue.is_burning = false;
        barbecue.current_fuel_def_id = None;
        barbecue.remaining_fuel_burn_time_secs = None;
        log::info!("Barbecue {} extinguished as last valid fuel was removed.", barbecue_id);
    }
    ctx.db.barbecue().id().update(barbecue.clone());
    schedule_next_barbecue_processing(ctx, barbecue_id);
    Ok(())
}

/// --- Split Stack Into Barbecue ---
#[spacetimedb::reducer]
pub fn split_stack_into_barbecue(
    ctx: &ReducerContext,
    source_item_instance_id: u64,
    quantity_to_split: u32,
    target_barbecue_id: u32,
    target_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut barbecue) = validate_barbecue_interaction(ctx, target_barbecue_id)?;
    
    let items = ctx.db.inventory_item();
    let source_item = items.instance_id().find(&source_item_instance_id)
        .ok_or_else(|| "Source item not found.".to_string())?;
    let item_defs = ctx.db.item_definition();
    let item_def = item_defs.id().find(&source_item.item_def_id)
        .ok_or_else(|| "Item definition not found.".to_string())?;
    
    let blocked_items = ["Reed Water Bottle", "Plastic Water Jug", "Cerametal Field Cauldron Mk. II"];
    if blocked_items.contains(&item_def.name.as_str()) {
        return Err(format!("Cannot place '{}' in barbecue. Use the broth pot's water container slot for water bottles, or place the cauldron on a campfire.", item_def.name));
    }
    
    let mut source_item_mut = get_player_item(ctx, source_item_instance_id)?;
    let new_item_target_location = ItemLocation::Container(ContainerLocationData {
        container_type: ContainerType::Barbecue,
        container_id: barbecue.id as u64,
        slot_index: target_slot_index,
    });
    let new_item_instance_id = split_stack_helper(ctx, &mut source_item_mut, quantity_to_split, new_item_target_location)?;
    
    let mut new_item = ctx.db.inventory_item().instance_id().find(new_item_instance_id)
        .ok_or_else(|| format!("Failed to find newly split item instance {}", new_item_instance_id))?;
    let new_item_def = ctx.db.item_definition().id().find(new_item.item_def_id)
        .ok_or_else(|| format!("Failed to find definition for new item {}", new_item.item_def_id))?;

    merge_or_place_into_container_slot(ctx, &mut barbecue, target_slot_index, &mut new_item, &new_item_def)?;
    
    ctx.db.inventory_item().instance_id().update(source_item);
    ctx.db.barbecue().id().update(barbecue.clone());
    schedule_next_barbecue_processing(ctx, target_barbecue_id);
    Ok(())
}

/// --- Quick Move to Barbecue ---
#[spacetimedb::reducer]
pub fn quick_move_to_barbecue(
    ctx: &ReducerContext,
    barbecue_id: u32,
    item_instance_id: u64,
) -> Result<(), String> {
    let (_player, mut barbecue) = validate_barbecue_interaction(ctx, barbecue_id)?;
    
    let items = ctx.db.inventory_item();
    let item = items.instance_id().find(&item_instance_id)
        .ok_or_else(|| "Item not found.".to_string())?;
    let item_defs = ctx.db.item_definition();
    let item_def = item_defs.id().find(&item.item_def_id)
        .ok_or_else(|| "Item definition not found.".to_string())?;
    
    let blocked_items = ["Reed Water Bottle", "Plastic Water Jug", "Cerametal Field Cauldron Mk. II"];
    if blocked_items.contains(&item_def.name.as_str()) {
        return Err(format!("Cannot place '{}' in barbecue. Use the broth pot's water container slot for water bottles, or place the cauldron on a campfire.", item_def.name));
    }
    
    inventory_management::handle_quick_move_to_container(ctx, &mut barbecue, item_instance_id)?;
    ctx.db.barbecue().id().update(barbecue.clone());
    schedule_next_barbecue_processing(ctx, barbecue_id);
    Ok(())
}

/// --- Barbecue Internal Item Movement ---
/// Moves/merges/swaps an item BETWEEN two slots within the same barbecue.
#[spacetimedb::reducer]
pub fn move_item_within_barbecue(
    ctx: &ReducerContext,
    barbecue_id: u32,
    source_slot_index: u8,
    target_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut barbecue) = validate_barbecue_interaction(ctx, barbecue_id)?;
    
    // Save cooking progress before move (since set_slot clears it)
    use crate::cooking::CookableAppliance;
    let source_progress = barbecue.get_slot_cooking_progress(source_slot_index);
    let target_progress = barbecue.get_slot_cooking_progress(target_slot_index);
    let source_had_item = barbecue.get_slot_instance_id(source_slot_index).is_some();
    let target_had_item = barbecue.get_slot_instance_id(target_slot_index).is_some();
    
    inventory_management::handle_move_within_container(ctx, &mut barbecue, source_slot_index, target_slot_index)?;
    
    // Transfer cooking progress based on what happened:
    // - Move to empty slot: source progress -> target
    // - Swap: exchange progress
    // - Merge: target keeps its progress (items combined there)
    if source_had_item && !target_had_item {
        // Move to empty slot: transfer source progress to target
        barbecue.set_slot_cooking_progress(target_slot_index, source_progress);
    } else if source_had_item && target_had_item {
        // Check if it was a swap (source slot now has an item) or merge (source slot empty)
        if barbecue.get_slot_instance_id(source_slot_index).is_some() {
            // Swap: exchange cooking progress
            barbecue.set_slot_cooking_progress(target_slot_index, source_progress);
            barbecue.set_slot_cooking_progress(source_slot_index, target_progress);
        }
        // If merge: target keeps its progress (already in place), source was cleared
    }
    
    ctx.db.barbecue().id().update(barbecue.clone());
    schedule_next_barbecue_processing(ctx, barbecue_id);
    Ok(())
}

/// --- Barbecue Internal Stack Splitting ---
/// Splits a stack FROM one barbecue slot TO another within the same barbecue.
#[spacetimedb::reducer]
pub fn split_stack_within_barbecue(
    ctx: &ReducerContext,
    barbecue_id: u32,
    source_slot_index: u8,
    quantity_to_split: u32,
    target_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut barbecue) = validate_barbecue_interaction(ctx, barbecue_id)?;
    
    inventory_management::handle_split_within_container(ctx, &mut barbecue, source_slot_index, target_slot_index, quantity_to_split)?;
    ctx.db.barbecue().id().update(barbecue.clone());
    schedule_next_barbecue_processing(ctx, barbecue_id);
    Ok(())
}

/// --- Move From Barbecue to Player ---
/// Moves a specific item FROM a barbecue slot TO a specific player inventory/hotbar slot.
#[spacetimedb::reducer]
pub fn move_item_from_barbecue_to_player_slot(
    ctx: &ReducerContext,
    barbecue_id: u32,
    source_slot_index: u8,
    target_slot_type: String,
    target_slot_index: u32,
) -> Result<(), String> {
    let (_player, mut barbecue) = validate_barbecue_interaction(ctx, barbecue_id)?;
    
    inventory_management::handle_move_from_container_slot(ctx, &mut barbecue, source_slot_index, target_slot_type, target_slot_index)?;
    let still_has_fuel = check_if_barbecue_has_fuel(ctx, &barbecue);
    if !still_has_fuel && barbecue.is_burning {
        barbecue.is_burning = false;
        barbecue.current_fuel_def_id = None;
        barbecue.remaining_fuel_burn_time_secs = None;
    }
    ctx.db.barbecue().id().update(barbecue.clone());
    schedule_next_barbecue_processing(ctx, barbecue_id);
    Ok(())
}

/// --- Split From Barbecue to Player ---
/// Splits a stack FROM a barbecue slot TO a specific player inventory/hotbar slot.
#[spacetimedb::reducer]
pub fn split_stack_from_barbecue(
    ctx: &ReducerContext,
    source_barbecue_id: u32,
    source_slot_index: u8,
    quantity_to_split: u32,
    target_slot_type: String,
    target_slot_index: u32,
) -> Result<(), String> {
    let mut barbecues = ctx.db.barbecue();
    let (_player, mut barbecue) = validate_barbecue_interaction(ctx, source_barbecue_id)?;

    log::info!(
        "[SplitFromBarbecue] Player {:?} delegating split {} from barbecue {} slot {} to {} slot {}",
        ctx.sender, quantity_to_split, source_barbecue_id, source_slot_index, target_slot_type, target_slot_index
    );

    inventory_management::handle_split_from_container(
        ctx,
        &mut barbecue,
        source_slot_index,
        quantity_to_split,
        target_slot_type,
        target_slot_index
    )?;

    barbecues.id().update(barbecue);
    Ok(())
}

/// --- Drop Item From Barbecue Slot to World ---
#[spacetimedb::reducer]
pub fn drop_item_from_barbecue_slot_to_world(
    ctx: &ReducerContext,
    barbecue_id: u32,
    slot_index: u8,
) -> Result<(), String> {
    let (player, mut barbecue) = validate_barbecue_interaction(ctx, barbecue_id)?;
    
    log::info!("[DropFromBarbecueToWorld] Player {} attempting to drop from barbecue ID {}, slot {}.", 
             ctx.sender, barbecue_id, slot_index);
    
    inventory_management::handle_drop_from_container_slot(ctx, &mut barbecue, slot_index, &player)?;
    let still_has_fuel = check_if_barbecue_has_fuel(ctx, &barbecue);
    if !still_has_fuel && barbecue.is_burning {
        barbecue.is_burning = false;
        barbecue.current_fuel_def_id = None;
        barbecue.remaining_fuel_burn_time_secs = None;
    }
    ctx.db.barbecue().id().update(barbecue.clone());
    schedule_next_barbecue_processing(ctx, barbecue_id);
    Ok(())
}

/// --- Split and Drop Item from Barbecue Slot to World ---
#[spacetimedb::reducer]
pub fn split_and_drop_item_from_barbecue_slot_to_world(
    ctx: &ReducerContext,
    barbecue_id: u32,
    slot_index: u8,
    quantity_to_split: u32,
) -> Result<(), String> {
    let (player, mut barbecue) = validate_barbecue_interaction(ctx, barbecue_id)?;
    
    log::info!("[SplitDropFromBarbecueToWorld] Player {} attempting to split {} from barbecue ID {}, slot {}.", 
             ctx.sender, quantity_to_split, barbecue_id, slot_index);
    
    inventory_management::handle_split_and_drop_from_container_slot(ctx, &mut barbecue, slot_index, quantity_to_split, &player)?;
    ctx.db.barbecue().id().update(barbecue.clone());
    schedule_next_barbecue_processing(ctx, barbecue_id);
    Ok(())
}

/******************************************************************************
 *                       REDUCERS (Barbecue-Specific Logic)                   *
 ******************************************************************************/

/// --- Barbecue Interaction Check ---
#[spacetimedb::reducer]
pub fn interact_with_barbecue(ctx: &ReducerContext, barbecue_id: u32) -> Result<(), String> {
    let (_player, _barbecue) = validate_barbecue_interaction(ctx, barbecue_id)?;
    Ok(())
}

/// --- Barbecue Burning State Toggle ---
#[spacetimedb::reducer]
pub fn toggle_barbecue_burning(ctx: &ReducerContext, barbecue_id: u32) -> Result<(), String> {
    let (_player, mut barbecue) = validate_barbecue_interaction(ctx, barbecue_id)?;
    if barbecue.is_burning {
        barbecue.is_burning = false;
        barbecue.current_fuel_def_id = None;
        barbecue.remaining_fuel_burn_time_secs = None;
        log::info!("Barbecue {} extinguished by player {:?}.", barbecue.id, ctx.sender);
        stop_barbecue_sound(ctx, barbecue.id as u64);
        crate::sound_events::emit_barbecue_off_sound(ctx, barbecue.pos_x, barbecue.pos_y, ctx.sender);
    } else {
        if !check_if_barbecue_has_fuel(ctx, &barbecue) {
            return Err("Cannot light barbecue, requires fuel.".to_string());
        }
        
        if is_barbecue_in_heavy_rain(ctx, &barbecue) && !is_barbecue_protected_from_rain(ctx, &barbecue) {
            return Err("Cannot light barbecue in heavy rain unless it's inside a shelter or near a tree.".to_string());
        }
        
        barbecue.is_burning = true;
        log::info!("Barbecue {} lit by player {:?}.", barbecue.id, ctx.sender);
        start_barbecue_sound(ctx, barbecue.id as u64, barbecue.pos_x, barbecue.pos_y);
        crate::sound_events::emit_barbecue_on_sound(ctx, barbecue.pos_x, barbecue.pos_y, ctx.sender);
    }
    ctx.db.barbecue().id().update(barbecue.clone());
    schedule_next_barbecue_processing(ctx, barbecue_id);
    Ok(())
}

/// --- Place Barbecue ---
#[spacetimedb::reducer]
pub fn place_barbecue(ctx: &ReducerContext, item_instance_id: u64, world_x: f32, world_y: f32) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    let players = ctx.db.player();
    let barbecues = ctx.db.barbecue();

    let barbecue_def_id = item_defs.iter()
        .find(|def| def.name == "Barbecue")
        .map(|def| def.id)
        .ok_or_else(|| "Item definition for 'Barbecue' not found.".to_string())?;

    let wood_def_id = item_defs.iter()
        .find(|def| def.name == "Wood")
        .map(|def| def.id)
        .ok_or_else(|| "Item definition for 'Wood' not found.".to_string())?;

    log::info!(
        "[PlaceBarbecue] Player {:?} attempting placement of item {} at ({:.1}, {:.1})",
        sender_id, item_instance_id, world_x, world_y
    );

    crate::building::check_monument_zone_placement(ctx, world_x, world_y)?;

    let player = players.identity().find(sender_id)
        .ok_or_else(|| "Player not found".to_string())?;

    if player.is_dead {
        return Err("Cannot place barbecue while dead.".to_string());
    }
    if player.is_knocked_out {
        return Err("Cannot place barbecue while knocked out.".to_string());
    }

    let dx_place = world_x - player.position_x;
    let dy_place = world_y - player.position_y;
    let dist_sq_place = dx_place * dx_place + dy_place * dy_place;
    if dist_sq_place > BARBECUE_PLACEMENT_MAX_DISTANCE_SQUARED {
        return Err(format!("Cannot place barbecue too far away ({} > {}).",
                dist_sq_place.sqrt(), BARBECUE_PLACEMENT_MAX_DISTANCE));
    }
    
    if crate::building::is_position_on_wall(ctx, world_x, world_y) {
        return Err("Cannot place barbecue on a wall.".to_string());
    }
    
    let tile_x = (world_x / crate::TILE_SIZE_PX as f32).floor() as i32;
    let tile_y = (world_y / crate::TILE_SIZE_PX as f32).floor() as i32;
    if let Some(tile_type) = crate::get_tile_type_at_position(ctx, tile_x, tile_y) {
        if tile_type.is_water() {
            return Err("Cannot place barbecue on water.".to_string());
        }
    }
    
    for other_barbecue in barbecues.iter() {
        let dx = world_x - other_barbecue.pos_x;
        let dy = world_y - other_barbecue.pos_y;
        let dist_sq = dx * dx + dy * dy;
        if dist_sq < BARBECUE_BARBECUE_COLLISION_DISTANCE_SQUARED {
            return Err("Cannot place barbecue too close to another barbecue.".to_string());
        }
    }

    let item_to_consume = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item instance {} not found.", item_instance_id))?;

    match item_to_consume.location {
        ItemLocation::Inventory(data) => {
            if data.owner_id != sender_id {
                return Err(format!("Item instance {} for barbecue not owned by player {:?}.", item_instance_id, sender_id));
            }
        }
        ItemLocation::Hotbar(data) => {
            if data.owner_id != sender_id {
                return Err(format!("Item instance {} for barbecue not owned by player {:?}.", item_instance_id, sender_id));
            }
        }
        _ => {
            return Err(format!("Item instance {} must be in inventory or hotbar to be placed.", item_instance_id));
        }
    }
    if item_to_consume.item_def_id != barbecue_def_id {
        return Err(format!("Item instance {} is not a Barbecue (expected def {}, got {}).",
                        item_instance_id, barbecue_def_id, item_to_consume.item_def_id));
    }

    log::info!(
        "[PlaceBarbecue] Consuming item instance {} (Def ID: {}) from player {:?}",
        item_instance_id, barbecue_def_id, sender_id
    );
    inventory_items.instance_id().delete(item_instance_id);

    let current_time = ctx.timestamp;
    let chunk_idx = calculate_chunk_index(world_x, world_y);

    let initial_fuel_item_def = ctx.db.item_definition().id().find(wood_def_id)
        .ok_or_else(|| "Wood item definition not found for initial fuel.".to_string())?;

    let fuel_burn_duration = initial_fuel_item_def.fuel_burn_duration_secs.unwrap_or(60.0);

    let fuel_location = ItemLocation::Container(ContainerLocationData {
        container_type: ContainerType::Barbecue,
        container_id: 0, // Will be updated after insertion
        slot_index: 0,
    });

    let fuel_item = InventoryItem {
        instance_id: 0,
        item_def_id: wood_def_id,
        quantity: INITIAL_BARBECUE_FUEL_AMOUNT,
        location: fuel_location,
        item_data: None,
    };

    let inserted_fuel = inventory_items.try_insert(fuel_item)
        .map_err(|e| format!("Failed to insert initial fuel: {}", e))?;

    let new_barbecue = Barbecue {
        id: 0,
        pos_x: world_x,
        pos_y: world_y + 42.0,
        chunk_index: chunk_idx,
        placed_by: sender_id,
        placed_at: current_time,
        is_burning: false,
        slot_instance_id_0: Some(inserted_fuel.instance_id),
        slot_def_id_0: Some(wood_def_id),
        slot_instance_id_1: None,
        slot_def_id_1: None,
        slot_instance_id_2: None,
        slot_def_id_2: None,
        slot_instance_id_3: None,
        slot_def_id_3: None,
        slot_instance_id_4: None,
        slot_def_id_4: None,
        slot_instance_id_5: None,
        slot_def_id_5: None,
        slot_instance_id_6: None,
        slot_def_id_6: None,
        slot_instance_id_7: None,
        slot_def_id_7: None,
        slot_instance_id_8: None,
        slot_def_id_8: None,
        slot_instance_id_9: None,
        slot_def_id_9: None,
        slot_instance_id_10: None,
        slot_def_id_10: None,
        slot_instance_id_11: None,
        slot_def_id_11: None,
        current_fuel_def_id: None,
        remaining_fuel_burn_time_secs: None,
        health: BARBECUE_INITIAL_HEALTH,
        max_health: BARBECUE_MAX_HEALTH,
        is_destroyed: false,
        destroyed_at: None,
        last_hit_time: None,
        last_damaged_by: None,
        slot_0_cooking_progress: None,
        slot_1_cooking_progress: None,
        slot_2_cooking_progress: None,
        slot_3_cooking_progress: None,
        slot_4_cooking_progress: None,
        slot_5_cooking_progress: None,
        slot_6_cooking_progress: None,
        slot_7_cooking_progress: None,
        slot_8_cooking_progress: None,
        slot_9_cooking_progress: None,
        slot_10_cooking_progress: None,
        slot_11_cooking_progress: None,
    };

    let inserted_barbecue = barbecues.try_insert(new_barbecue)
        .map_err(|e| format!("Failed to insert barbecue: {}", e))?;

    let new_barbecue_id = inserted_barbecue.id;
    let fuel_instance_id = inserted_fuel.instance_id;

    let mut updated_fuel = inserted_fuel;
    updated_fuel.location = ItemLocation::Container(ContainerLocationData {
        container_type: ContainerType::Barbecue,
        container_id: new_barbecue_id as u64,
        slot_index: 0,
    });
    inventory_items.instance_id().update(updated_fuel);

    let mut barbecue_to_update = inserted_barbecue;
    barbecue_to_update.slot_instance_id_0 = Some(fuel_instance_id);
    barbecue_to_update.slot_def_id_0 = Some(wood_def_id);
    
    let is_burning_for_log = barbecue_to_update.is_burning;
    barbecues.id().update(barbecue_to_update);
    
    log::info!("Player {} placed a barbecue {} at ({:.1}, {:.1}) with initial fuel (Item {} in slot 0). Burning state: {}.",
             player.username, new_barbecue_id, world_x, world_y, fuel_instance_id, is_burning_for_log);

    match schedule_next_barbecue_processing(ctx, new_barbecue_id) {
        Ok(_) => log::debug!("[PlaceBarbecue] Successfully scheduled initial processing for barbecue {}.", new_barbecue_id),
        Err(e) => log::warn!("[PlaceBarbecue] Failed to schedule initial processing for barbecue {}: {}. Processing will start when lit.", new_barbecue_id, e),
    }

    Ok(())
}

/// --- Pickup Barbecue ---
#[spacetimedb::reducer]
pub fn pickup_barbecue(ctx: &ReducerContext, barbecue_id: u32) -> Result<(), String> {
    let sender_id = ctx.sender;
    let mut barbecues = ctx.db.barbecue();
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();

    let mut barbecue = barbecues.id().find(barbecue_id)
        .ok_or_else(|| format!("Barbecue {} not found.", barbecue_id))?;

    if barbecue.is_destroyed {
        return Err("Cannot pickup destroyed barbecue.".to_string());
    }

    if barbecue.placed_by != sender_id {
        return Err("Only the player who placed this barbecue can pick it up.".to_string());
    }

    // Check if barbecue is empty (all slots empty)
    let mut is_empty = true;
    for i in 0..NUM_BARBECUE_SLOTS as u8 {
        if barbecue.get_slot_instance_id(i).is_some() {
            is_empty = false;
            break;
        }
    }

    if !is_empty {
        return Err("Cannot pickup barbecue with items inside.".to_string());
    }

    // Cancel any scheduled processing
    ctx.db.barbecue_processing_schedule().barbecue_id().delete(barbecue_id as u64);

    // Stop sound if burning
    if barbecue.is_burning {
        stop_barbecue_sound(ctx, barbecue.id as u64);
    }

    // Create barbecue item
    let barbecue_def_id = item_defs.iter()
        .find(|def| def.name == "Barbecue")
        .map(|def| def.id)
        .ok_or_else(|| "Item definition for 'Barbecue' not found.".to_string())?;

    let player = ctx.db.player().identity().find(sender_id)
        .ok_or_else(|| "Player not found".to_string())?;

    let target_location = find_first_empty_player_slot(ctx, sender_id)
        .ok_or_else(|| "Player inventory is full.".to_string())?;

    let barbecue_item = InventoryItem {
        instance_id: 0,
        item_def_id: barbecue_def_id,
        quantity: 1,
        location: target_location,
        item_data: None,
    };

    inventory_items.try_insert(barbecue_item)
        .map_err(|e| format!("Failed to create barbecue item: {}", e))?;

    // Delete the barbecue entity
    barbecues.id().delete(barbecue_id);

    log::info!("Player {} picked up barbecue {}.", player.username, barbecue_id);
    Ok(())
}

/******************************************************************************
 *                           HELPER FUNCTIONS                                  *
 ******************************************************************************/

fn validate_barbecue_interaction(ctx: &ReducerContext, barbecue_id: u32) -> Result<(Player, Barbecue), String> {
    let player = ctx.db.player().identity().find(ctx.sender)
        .ok_or_else(|| "Player not found".to_string())?;

    if player.is_dead {
        return Err("Cannot interact with barbecue while dead.".to_string());
    }

    let barbecue = ctx.db.barbecue().id().find(barbecue_id)
        .ok_or_else(|| format!("Barbecue {} not found.", barbecue_id))?;

    if barbecue.is_destroyed {
        return Err("Cannot interact with destroyed barbecue.".to_string());
    }

    let dx = player.position_x - barbecue.pos_x;
    let dy = player.position_y - barbecue.pos_y;
    let dist_sq = dx * dx + dy * dy;

    if dist_sq > PLAYER_BARBECUE_INTERACTION_DISTANCE_SQUARED {
        return Err(format!("Too far from barbecue (distance: {:.1}, max: {:.1}).",
                dist_sq.sqrt(), PLAYER_BARBECUE_INTERACTION_DISTANCE));
    }

    Ok((player, barbecue))
}

fn check_if_barbecue_has_fuel(ctx: &ReducerContext, barbecue: &Barbecue) -> bool {
    let item_defs = ctx.db.item_definition();
    
    for i in 0..NUM_BARBECUE_SLOTS as u8 {
        if let Some(def_id) = barbecue.get_slot_def_id(i) {
            if let Some(item_def) = item_defs.id().find(def_id) {
                if item_def.fuel_burn_duration_secs.is_some() {
                    if let Some(instance_id) = barbecue.get_slot_instance_id(i) {
                        if let Some(item) = ctx.db.inventory_item().instance_id().find(instance_id) {
                            if item.quantity > 0 {
                                return true;
                            }
                        }
                    }
                }
            }
        }
    }
    false
}

fn find_and_set_burn_time_for_fuel_unit(
    ctx: &ReducerContext,
    barbecue: &mut Barbecue,
    instance_id: u64,
    def_id: u64,
    _slot_index: u8,
) -> bool {
    if let Some(item_def) = ctx.db.item_definition().id().find(def_id) {
        if let Some(burn_duration) = item_def.fuel_burn_duration_secs {
            barbecue.current_fuel_def_id = Some(def_id);
            barbecue.remaining_fuel_burn_time_secs = Some(burn_duration);
            return true;
        }
    }
    false
}

fn is_barbecue_in_heavy_rain(ctx: &ReducerContext, barbecue: &Barbecue) -> bool {
    let chunk_weather = crate::world_state::get_weather_for_position(ctx, barbecue.pos_x, barbecue.pos_y);
    matches!(chunk_weather.current_weather, WeatherType::HeavyRain | WeatherType::HeavyStorm)
}

fn is_barbecue_protected_from_rain(ctx: &ReducerContext, barbecue: &Barbecue) -> bool {
    for shelter in ctx.db.shelter().iter() {
        if shelter.is_destroyed {
            continue;
        }
        
        let shelter_aabb_center_x = shelter.pos_x;
        let shelter_aabb_center_y = shelter.pos_y - crate::shelter::SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y;
        let aabb_left = shelter_aabb_center_x - crate::shelter::SHELTER_AABB_HALF_WIDTH;
        let aabb_right = shelter_aabb_center_x + crate::shelter::SHELTER_AABB_HALF_WIDTH;
        let aabb_top = shelter_aabb_center_y - crate::shelter::SHELTER_AABB_HALF_HEIGHT;
        let aabb_bottom = shelter_aabb_center_y + crate::shelter::SHELTER_AABB_HALF_HEIGHT;
        
        if barbecue.pos_x >= aabb_left && barbecue.pos_x <= aabb_right &&
           barbecue.pos_y >= aabb_top && barbecue.pos_y <= aabb_bottom {
            return true;
        }
    }
    
    if crate::building_enclosure::is_position_inside_building(ctx, barbecue.pos_x, barbecue.pos_y) {
        return true;
    }
    
    const TREE_PROTECTION_DISTANCE_SQ: f32 = 100.0 * 100.0;
    
    for tree in ctx.db.tree().iter() {
        if tree.respawn_at.is_some() {
            continue;
        }
        
        let dx = barbecue.pos_x - tree.pos_x;
        let dy = barbecue.pos_y - tree.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= TREE_PROTECTION_DISTANCE_SQ {
            return true;
        }
    }
    
    false
}

fn has_reed_bellows(ctx: &ReducerContext, barbecue: &Barbecue) -> bool {
    let item_defs_table = ctx.db.item_definition();
    
    for slot_index in 0..NUM_BARBECUE_SLOTS {
        if let Some(fuel_def_id) = barbecue.get_slot_def_id(slot_index as u8) {
            if let Some(item_def) = item_defs_table.id().find(fuel_def_id) {
                if item_def.name == "Reed Bellows" {
                    return true;
                }
            }
        }
    }
    false
}

fn get_fuel_burn_rate_multiplier(ctx: &ReducerContext, barbecue: &Barbecue) -> f32 {
    if has_reed_bellows(ctx, barbecue) {
        1.5
    } else {
        1.0
    }
}

fn get_cooking_speed_multiplier(ctx: &ReducerContext, barbecue: &Barbecue) -> f32 {
    let mut multiplier = 1.0;
    
    if has_reed_bellows(ctx, barbecue) {
        multiplier *= 1.2;
    }
    
    if crate::rune_stone::is_position_in_green_rune_zone(ctx, barbecue.pos_x, barbecue.pos_y) {
        multiplier *= 2.0;
    }
    
    multiplier
}

fn has_metal_ore_in_barbecue(ctx: &ReducerContext, barbecue: &Barbecue) -> bool {
    let item_defs_table = ctx.db.item_definition();
    
    for slot_index in 0..NUM_BARBECUE_SLOTS {
        if let Some(fuel_def_id) = barbecue.get_slot_def_id(slot_index as u8) {
            if let Some(item_def) = item_defs_table.id().find(fuel_def_id) {
                if item_def.name == "Metal Ore" {
                    return true;
                }
            }
        }
    }
    false
}

fn get_item_def_by_name<'a>(ctx: &'a ReducerContext, name: &str) -> Option<ItemDefinition> {
    ctx.db.item_definition().iter().find(|def| def.name == name)
}

fn try_add_charcoal_to_barbecue_or_drop(
    ctx: &ReducerContext,
    barbecue: &mut Barbecue,
    charcoal_def: &ItemDefinition,
    quantity: u32
) -> Result<bool, String> {
    let mut inventory_items_table = ctx.db.inventory_item();
    let charcoal_def_id = charcoal_def.id;
    let charcoal_stack_size = charcoal_def.stack_size;
    let mut charcoal_added_to_barbecue_slots = false;

    for i in 0..NUM_BARBECUE_SLOTS as u8 {
        if barbecue.get_slot_def_id(i) == Some(charcoal_def_id) {
            if let Some(instance_id) = barbecue.get_slot_instance_id(i) {
                if let Some(mut existing_charcoal_item) = inventory_items_table.instance_id().find(instance_id) {
                    if existing_charcoal_item.quantity < charcoal_stack_size {
                        let can_add = charcoal_stack_size - existing_charcoal_item.quantity;
                        let to_add = min(quantity, can_add);
                        existing_charcoal_item.quantity += to_add;
                        inventory_items_table.instance_id().update(existing_charcoal_item);
                        return Ok(false);
                    }
                }
            }
        }
    }

    for i in 0..NUM_BARBECUE_SLOTS as u8 {
        if barbecue.get_slot_instance_id(i).is_none() {
            let new_charcoal_location = ItemLocation::Container(ContainerLocationData {
                container_type: ContainerType::Barbecue,
                container_id: barbecue.id as u64,
                slot_index: i,
            });
            let new_charcoal_item = InventoryItem {
                instance_id: 0,
                item_def_id: charcoal_def_id,
                quantity,
                location: new_charcoal_location,
                item_data: None,
            };
            match inventory_items_table.try_insert(new_charcoal_item) {
                Ok(inserted_item) => {
                    barbecue.set_slot(i, Some(inserted_item.instance_id), Some(charcoal_def_id));
                    charcoal_added_to_barbecue_slots = true;
                    return Ok(charcoal_added_to_barbecue_slots);
                }
                Err(_) => {
                    break;
                }
            }
        }
    }

    let drop_x = barbecue.pos_x;
    let drop_y = barbecue.pos_y + crate::dropped_item::DROP_OFFSET / 2.0;
    create_dropped_item_entity(ctx, charcoal_def_id, quantity, drop_x, drop_y)?;
    
    Ok(charcoal_added_to_barbecue_slots)
}

/******************************************************************************
 *                    SCHEDULED PROCESSING                                     *
 ******************************************************************************/

/// Scheduled reducer for processing barbecue logic (fuel consumption, cooking, etc.)
#[spacetimedb::reducer]
pub fn process_barbecue_logic_scheduled(ctx: &ReducerContext, schedule: BarbecueProcessingSchedule) -> Result<(), String> {
    if ctx.sender != ctx.identity() {
        return Err("process_barbecue_logic_scheduled may not be invoked by clients, only via scheduling.".into());
    }

    let barbecue_id = schedule.barbecue_id as u32;
    let mut barbecues_table = ctx.db.barbecue();
    let mut inventory_items_table = ctx.db.inventory_item();
    let item_definition_table = ctx.db.item_definition();

    let mut barbecue = match barbecues_table.id().find(barbecue_id) {
        Some(bbq) => bbq,
        None => {
            log::warn!("[ProcessBarbecueScheduled] Barbecue {} not found for scheduled processing. Schedule might be stale. Not rescheduling.", barbecue_id);
            ctx.db.barbecue_processing_schedule().barbecue_id().delete(barbecue_id as u64);
            return Ok(());
        }
    };

    if barbecue.is_destroyed {
        log::debug!("[ProcessBarbecueScheduled] Barbecue {} is destroyed. Skipping processing and removing schedule.", barbecue_id);
        ctx.db.barbecue_processing_schedule().barbecue_id().delete(barbecue_id as u64);
        return Ok(());
    }

    let mut made_changes_to_barbecue_struct = false;
    let mut produced_charcoal_and_modified_barbecue_struct = false;

    if barbecue.is_burning {
        // Note: Barbecues do NOT extinguish in rain - they're covered/protected by design
        // Note: Barbecues do NOT have fire damage zones - they're elevated cooking appliances
        let time_increment = BARBECUE_PROCESS_INTERVAL_SECS as f32;

        let active_fuel_instance_id_for_cooking_check = barbecue.current_fuel_def_id.and_then(|fuel_def_id| {
            (0..NUM_BARBECUE_SLOTS as u8).find_map(|slot_idx_check| {
                if barbecue.get_slot_def_id(slot_idx_check) == Some(fuel_def_id) {
                    if let Some(instance_id_check) = barbecue.get_slot_instance_id(slot_idx_check) {
                        if barbecue.remaining_fuel_burn_time_secs.is_some() && barbecue.remaining_fuel_burn_time_secs.unwrap_or(0.0) > 0.0 {
                            return Some(instance_id_check);
                        }
                    }
                }
                None
            })
        });

        let cooking_speed_multiplier = get_cooking_speed_multiplier(ctx, &barbecue);
        let adjusted_cooking_time_increment = time_increment * cooking_speed_multiplier;
        
        if !has_metal_ore_in_barbecue(ctx, &barbecue) {
            match crate::cooking::process_appliance_cooking_tick(ctx, &mut barbecue, adjusted_cooking_time_increment, active_fuel_instance_id_for_cooking_check) {
                Ok(cooking_modified_appliance) => {
                    if cooking_modified_appliance {
                        made_changes_to_barbecue_struct = true;
                    }
                }
                Err(_) => {}
            }
        }

        if let Some(mut remaining_time) = barbecue.remaining_fuel_burn_time_secs {
            if remaining_time > 0.0 {
                let fuel_burn_multiplier = get_fuel_burn_rate_multiplier(ctx, &barbecue);
                let adjusted_time_increment = time_increment / fuel_burn_multiplier;
                remaining_time -= adjusted_time_increment;

                if remaining_time <= 0.0 {
                    let mut consumed_and_reloaded_from_stack = false;
                    let mut active_fuel_slot_idx_found: Option<u8> = None;

                    for i in 0..NUM_BARBECUE_SLOTS as u8 {
                        if barbecue.get_slot_def_id(i) == barbecue.current_fuel_def_id {
                            if let Some(instance_id) = barbecue.get_slot_instance_id(i) {
                                if let Some(mut fuel_item) = inventory_items_table.instance_id().find(instance_id) {
                                    active_fuel_slot_idx_found = Some(i);
                                    let consumed_item_def_id_for_charcoal = fuel_item.item_def_id;
                                    fuel_item.quantity -= 1;

                                    if fuel_item.quantity > 0 {
                                        inventory_items_table.instance_id().update(fuel_item.clone());
                                        if let Some(item_def) = item_definition_table.id().find(fuel_item.item_def_id) {
                                            if let Some(burn_duration_per_unit) = item_def.fuel_burn_duration_secs {
                                                barbecue.remaining_fuel_burn_time_secs = Some(burn_duration_per_unit);
                                                consumed_and_reloaded_from_stack = true;
                                            } else {
                                                barbecue.current_fuel_def_id = None;
                                                barbecue.remaining_fuel_burn_time_secs = None;
                                            }
                                        } else {
                                            barbecue.current_fuel_def_id = None;
                                            barbecue.remaining_fuel_burn_time_secs = None;
                                        }
                                    } else {
                                        inventory_items_table.instance_id().delete(instance_id);
                                        barbecue.set_slot(i, None, None);
                                        barbecue.current_fuel_def_id = None;
                                        barbecue.remaining_fuel_burn_time_secs = None;
                                    }
                                    made_changes_to_barbecue_struct = true;

                                    if let Some(consumed_def) = item_definition_table.id().find(consumed_item_def_id_for_charcoal) {
                                        if consumed_def.name == "Wood" && ctx.rng().gen_range(0..100) < CHARCOAL_PRODUCTION_CHANCE {
                                            if let Some(charcoal_def) = get_item_def_by_name(ctx, "Charcoal") {
                                                if try_add_charcoal_to_barbecue_or_drop(ctx, &mut barbecue, &charcoal_def, 1).unwrap_or(false) {
                                                    produced_charcoal_and_modified_barbecue_struct = true;
                                                }
                                            }
                                        }
                                    }
                                    break;
                                } else {
                                    barbecue.current_fuel_def_id = None;
                                    barbecue.remaining_fuel_burn_time_secs = None;
                                    made_changes_to_barbecue_struct = true;
                                    break;
                                }
                            }
                        }
                    }
                    if !consumed_and_reloaded_from_stack && barbecue.current_fuel_def_id.is_some() && active_fuel_slot_idx_found.is_none() {
                        barbecue.current_fuel_def_id = None;
                        barbecue.remaining_fuel_burn_time_secs = None;
                        made_changes_to_barbecue_struct = true;
                    }
                } else {
                    barbecue.remaining_fuel_burn_time_secs = Some(remaining_time);
                    made_changes_to_barbecue_struct = true;
                }
            } else {
                barbecue.current_fuel_def_id = None;
                barbecue.remaining_fuel_burn_time_secs = None;
                made_changes_to_barbecue_struct = true;
            }
        }
        
        if barbecue.current_fuel_def_id.is_none() {
            let mut new_fuel_loaded = false;
            for i in 0..NUM_BARBECUE_SLOTS as u8 {
                if let (Some(instance_id), Some(def_id)) = (barbecue.get_slot_instance_id(i), barbecue.get_slot_def_id(i)) {
                    if let Some(fuel_item_check) = inventory_items_table.instance_id().find(instance_id) {
                        if fuel_item_check.quantity > 0 {
                            if find_and_set_burn_time_for_fuel_unit(ctx, &mut barbecue, instance_id, def_id, i) {
                                new_fuel_loaded = true;
                                made_changes_to_barbecue_struct = true;
                                break;
                            }
                        } else {
                            barbecue.set_slot(i, None, None);
                            made_changes_to_barbecue_struct = true;
                        }
                    } else {
                        barbecue.set_slot(i, None, None);
                        made_changes_to_barbecue_struct = true;
                    }
                }
            }
            if !new_fuel_loaded {
                barbecue.is_burning = false;
                made_changes_to_barbecue_struct = true;
                stop_barbecue_sound(ctx, barbecue.id as u64);
            }
        }
    }

    if made_changes_to_barbecue_struct || produced_charcoal_and_modified_barbecue_struct {
        barbecues_table.id().update(barbecue);
    }

    schedule_next_barbecue_processing(ctx, barbecue_id)?;
    Ok(())
}

/// Schedules or re-schedules the main processing logic for a barbecue.
#[spacetimedb::reducer]
pub fn schedule_next_barbecue_processing(ctx: &ReducerContext, barbecue_id: u32) -> Result<(), String> {
    let mut schedules = ctx.db.barbecue_processing_schedule();
    let barbecue_opt = ctx.db.barbecue().id().find(barbecue_id);

    if barbecue_opt.is_none() || barbecue_opt.as_ref().map_or(false, |bbq| bbq.is_destroyed) {
        schedules.barbecue_id().delete(barbecue_id as u64);
        return Ok(());
    }

    let barbecue = barbecue_opt.unwrap();
    let has_fuel = check_if_barbecue_has_fuel(ctx, &barbecue);

    if barbecue.is_burning {
        if has_fuel {
            let interval = TimeDuration::from_micros((BARBECUE_PROCESS_INTERVAL_SECS * 1_000_000) as i64);
            let schedule_entry = BarbecueProcessingSchedule {
                barbecue_id: barbecue_id as u64,
                scheduled_at: ScheduleAt::Interval(interval),
            };
            if schedules.barbecue_id().find(barbecue_id as u64).is_some() {
                let mut existing_schedule = schedules.barbecue_id().find(barbecue_id as u64).unwrap();
                existing_schedule.scheduled_at = ScheduleAt::Interval(interval);
                schedules.barbecue_id().update(existing_schedule);
            } else {
                match schedules.try_insert(schedule_entry) {
                    Ok(_) => {}
                    Err(_) => {
                        if let Some(mut existing_schedule_fallback) = schedules.barbecue_id().find(barbecue_id as u64) {
                            existing_schedule_fallback.scheduled_at = ScheduleAt::Interval(interval);
                            schedules.barbecue_id().update(existing_schedule_fallback);
                        }
                    }
                }
            }
        } else {
            schedules.barbecue_id().delete(barbecue_id as u64);
            if barbecue.is_burning {
                let mut updated_barbecue = barbecue;
                updated_barbecue.is_burning = false;
                updated_barbecue.current_fuel_def_id = None;
                updated_barbecue.remaining_fuel_burn_time_secs = None;
                ctx.db.barbecue().id().update(updated_barbecue);
                stop_barbecue_sound(ctx, barbecue_id as u64);
            }
        }
    } else {
        schedules.barbecue_id().delete(barbecue_id as u64);
    }

    Ok(())
}

/******************************************************************************
 *                    TRAIT IMPLEMENTATIONS                                    *
 ******************************************************************************/

impl ItemContainer for Barbecue {
    fn num_slots(&self) -> usize {
        NUM_BARBECUE_SLOTS
    }

    fn get_slot_instance_id(&self, slot_index: u8) -> Option<u64> {
        if slot_index >= NUM_BARBECUE_SLOTS as u8 { return None; }
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
            _ => None,
        }
    }

    fn get_slot_def_id(&self, slot_index: u8) -> Option<u64> {
        if slot_index >= NUM_BARBECUE_SLOTS as u8 { return None; }
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
            _ => None,
        }
    }

    fn set_slot(&mut self, slot_index: u8, instance_id: Option<u64>, def_id: Option<u64>) {
        if slot_index >= NUM_BARBECUE_SLOTS as u8 { return; }
        match slot_index {
            0 => { self.slot_instance_id_0 = instance_id; self.slot_def_id_0 = def_id; if instance_id.is_none() { self.slot_0_cooking_progress = None; } },
            1 => { self.slot_instance_id_1 = instance_id; self.slot_def_id_1 = def_id; if instance_id.is_none() { self.slot_1_cooking_progress = None; } },
            2 => { self.slot_instance_id_2 = instance_id; self.slot_def_id_2 = def_id; if instance_id.is_none() { self.slot_2_cooking_progress = None; } },
            3 => { self.slot_instance_id_3 = instance_id; self.slot_def_id_3 = def_id; if instance_id.is_none() { self.slot_3_cooking_progress = None; } },
            4 => { self.slot_instance_id_4 = instance_id; self.slot_def_id_4 = def_id; if instance_id.is_none() { self.slot_4_cooking_progress = None; } },
            5 => { self.slot_instance_id_5 = instance_id; self.slot_def_id_5 = def_id; if instance_id.is_none() { self.slot_5_cooking_progress = None; } },
            6 => { self.slot_instance_id_6 = instance_id; self.slot_def_id_6 = def_id; if instance_id.is_none() { self.slot_6_cooking_progress = None; } },
            7 => { self.slot_instance_id_7 = instance_id; self.slot_def_id_7 = def_id; if instance_id.is_none() { self.slot_7_cooking_progress = None; } },
            8 => { self.slot_instance_id_8 = instance_id; self.slot_def_id_8 = def_id; if instance_id.is_none() { self.slot_8_cooking_progress = None; } },
            9 => { self.slot_instance_id_9 = instance_id; self.slot_def_id_9 = def_id; if instance_id.is_none() { self.slot_9_cooking_progress = None; } },
            10 => { self.slot_instance_id_10 = instance_id; self.slot_def_id_10 = def_id; if instance_id.is_none() { self.slot_10_cooking_progress = None; } },
            11 => { self.slot_instance_id_11 = instance_id; self.slot_def_id_11 = def_id; if instance_id.is_none() { self.slot_11_cooking_progress = None; } },
            _ => {},
        }
    }

    fn get_container_type(&self) -> ContainerType {
        ContainerType::Barbecue
    }

    fn get_container_id(&self) -> u64 {
        self.id as u64
    }
}

pub struct BarbecueClearer;

/// --- Clear Item From Barbecue Slots ---
/// Removes a specific item instance from any barbecue slot it might be in.
/// Used when items are deleted or moved to ensure consistency across containers.
pub(crate) fn clear_item_from_barbecue_slots(ctx: &ReducerContext, item_instance_id_to_clear: u64) -> bool {
    let inventory_table = ctx.db.inventory_item();
    let mut item_found_and_cleared = false;

    for mut barbecue in ctx.db.barbecue().iter() {
        let mut barbecue_modified = false;
        for i in 0..NUM_BARBECUE_SLOTS as u8 {
            if barbecue.get_slot_instance_id(i) == Some(item_instance_id_to_clear) {
                log::debug!(
                    "Item {} found in barbecue {} slot {}. Clearing slot.",
                    item_instance_id_to_clear, barbecue.id, i
                );
                // Update item's location to Unknown before clearing from container and deleting
                if let Some(mut item) = inventory_table.instance_id().find(item_instance_id_to_clear) {
                    item.location = ItemLocation::Unknown;
                    inventory_table.instance_id().update(item);
                }
                // It's assumed the caller will delete the InventoryItem itself after clearing it from all potential containers.
                // This function just clears the reference from this specific container type.
                barbecue.set_slot(i, None, None);
                barbecue_modified = true;
                item_found_and_cleared = true; // Mark that we found and cleared it at least once
                // Do not break here, an item ID (though should be unique) might theoretically appear in multiple barbecues if DB was manually edited.
            }
        }
        if barbecue_modified {
            ctx.db.barbecue().id().update(barbecue);
        }
    }
    item_found_and_cleared
}

impl ContainerItemClearer for BarbecueClearer {
    fn clear_item(ctx: &ReducerContext, item_instance_id: u64) -> bool {
        // This specific implementation iterates all barbecues to find and remove the item.
        // This is different from container-specific reducers which operate on a single container ID.
        clear_item_from_barbecue_slots(ctx, item_instance_id)
    }
}

impl crate::cooking::CookableAppliance for Barbecue {
    fn get_slot_cooking_progress(&self, slot_index: u8) -> Option<CookingProgress> {
        match slot_index {
            0 => self.slot_0_cooking_progress.clone(),
            1 => self.slot_1_cooking_progress.clone(),
            2 => self.slot_2_cooking_progress.clone(),
            3 => self.slot_3_cooking_progress.clone(),
            4 => self.slot_4_cooking_progress.clone(),
            5 => self.slot_5_cooking_progress.clone(),
            6 => self.slot_6_cooking_progress.clone(),
            7 => self.slot_7_cooking_progress.clone(),
            8 => self.slot_8_cooking_progress.clone(),
            9 => self.slot_9_cooking_progress.clone(),
            10 => self.slot_10_cooking_progress.clone(),
            11 => self.slot_11_cooking_progress.clone(),
            _ => None,
        }
    }

    fn set_slot_cooking_progress(&mut self, slot_index: u8, progress: Option<CookingProgress>) {
        match slot_index {
            0 => self.slot_0_cooking_progress = progress,
            1 => self.slot_1_cooking_progress = progress,
            2 => self.slot_2_cooking_progress = progress,
            3 => self.slot_3_cooking_progress = progress,
            4 => self.slot_4_cooking_progress = progress,
            5 => self.slot_5_cooking_progress = progress,
            6 => self.slot_6_cooking_progress = progress,
            7 => self.slot_7_cooking_progress = progress,
            8 => self.slot_8_cooking_progress = progress,
            9 => self.slot_9_cooking_progress = progress,
            10 => self.slot_10_cooking_progress = progress,
            11 => self.slot_11_cooking_progress = progress,
            _ => { log::warn!("[CookableAppliance] Attempted to set cooking progress for invalid Barbecue slot: {}", slot_index); }
        }
    }

    fn get_appliance_world_position(&self) -> (f32, f32) {
        (self.pos_x, self.pos_y)
    }
}
