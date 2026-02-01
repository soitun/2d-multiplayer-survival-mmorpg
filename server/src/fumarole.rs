/******************************************************************************
 *                                                                            *
 * Defines the Fumarole entity, its data structure, and associated logic.    *
 * Fumaroles are always-on geothermal vents that incinerate items for        *
 * charcoal production. They function as containers with 6 slots and provide *
 * passive warmth. Items placed in fumaroles are destroyed and converted to  *
 * charcoal at a constant fast rate, making them valuable PvP hotspots.      *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{Identity, Timestamp, ReducerContext, Table, log, SpacetimeType, TimeDuration, ScheduleAt};
use std::cmp::min;

// Import new models
use crate::models::{ContainerType, ItemLocation, ContainerLocationData};

// Import table traits and concrete types
use crate::player as PlayerTableTrait;
use crate::Player;
use crate::items::{
    inventory_item as InventoryItemTableTrait,
    item_definition as ItemDefinitionTableTrait,
    InventoryItem, ItemDefinition,
};
use crate::inventory_management::{self, ItemContainer, ContainerItemClearer};
use crate::player_inventory::{get_player_item};
use crate::environment::calculate_chunk_index;
use crate::dropped_item::create_dropped_item_entity;

// --- Fumarole Constants ---

// Collision constants (fumaroles have NO collision - players walk over them)
pub(crate) const FUMAROLE_RADIUS: f32 = 30.0; // Visual size reference only
pub(crate) const FUMAROLE_COLLISION_Y_OFFSET: f32 = 0.0; // No collision, but for reference

// Interaction constants
pub(crate) const PLAYER_FUMAROLE_INTERACTION_DISTANCE: f32 = 96.0;
pub(crate) const PLAYER_FUMAROLE_INTERACTION_DISTANCE_SQUARED: f32 = 
    PLAYER_FUMAROLE_INTERACTION_DISTANCE * PLAYER_FUMAROLE_INTERACTION_DISTANCE;

// Warmth constants - fumaroles provide passive warmth protection
pub(crate) const FUMAROLE_WARMTH_RADIUS: f32 = 600.0; // 600px radius warmth protection (3x original for large heat area)
pub(crate) const FUMAROLE_WARMTH_RADIUS_SQUARED: f32 = FUMAROLE_WARMTH_RADIUS * FUMAROLE_WARMTH_RADIUS;

// Spawning constants
pub(crate) const FUMAROLES_PER_QUARRY_MIN: u32 = 2;
pub(crate) const FUMAROLES_PER_QUARRY_MAX: u32 = 4;
pub(crate) const MIN_FUMAROLE_DISTANCE_PX: f32 = 120.0; // Minimum distance between fumaroles
pub(crate) const MIN_FUMAROLE_DISTANCE_SQ: f32 = MIN_FUMAROLE_DISTANCE_PX * MIN_FUMAROLE_DISTANCE_PX;

// Container constants
pub const NUM_FUMAROLE_SLOTS: usize = 6; // 6 slots for items to incinerate
const FUMAROLE_PROCESS_INTERVAL_SECS: u64 = 1; // Process every 1 second (for burn damage)
const FUMAROLE_ITEM_CONSUMPTION_TICKS: u64 = 2; // Consume 1 item every 2 ticks (2 seconds, doubled speed)
const CHARCOAL_PRODUCTION_AMOUNT: u32 = 3; // Produce 3 charcoal per item (rewarding for PvP hotspot)

/// --- Fumarole Data Structure ---
/// Represents a geothermal vent in quarry areas that provides warmth and incinerates items.
/// Fumaroles are permanent features with no collision - players can walk over them.
/// Items placed in fumaroles are destroyed and converted to charcoal at a fast rate.
#[spacetimedb::table(name = fumarole, public)]
#[derive(Clone)]
pub struct Fumarole {
    #[primary_key]
    #[auto_inc]
    pub id: u32,
    pub pos_x: f32,
    pub pos_y: f32,
    #[index(btree)]
    pub chunk_index: u32, // For spatial filtering/queries
    
    // Container slots (6 slots for items to incinerate)
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
    
    // Cooking progress for each slot (for UI progress overlays)
    pub slot_0_cooking_progress: Option<crate::cooking::CookingProgress>,
    pub slot_1_cooking_progress: Option<crate::cooking::CookingProgress>,
    pub slot_2_cooking_progress: Option<crate::cooking::CookingProgress>,
    pub slot_3_cooking_progress: Option<crate::cooking::CookingProgress>,
    pub slot_4_cooking_progress: Option<crate::cooking::CookingProgress>,
    pub slot_5_cooking_progress: Option<crate::cooking::CookingProgress>,
    
    pub attached_broth_pot_id: Option<u32>, // Broth pot placed on this fumarole
    pub consumption_tick_counter: u64, // Tracks ticks for item consumption (every 5 ticks = 1 item consumed)
    pub is_submerged: bool, // NEW: True if fumarole is underwater (in coral reef zones)
}

impl Fumarole {
    /// Creates a new fumarole at the specified position
    pub fn new(pos_x: f32, pos_y: f32, chunk_index: u32) -> Self {
        Self {
            id: 0, // Auto-incremented
            pos_x,
            pos_y,
            chunk_index,
            slot_instance_id_0: None,
            slot_def_id_0: None,
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
            slot_0_cooking_progress: None,
            slot_1_cooking_progress: None,
            slot_2_cooking_progress: None,
            slot_3_cooking_progress: None,
            slot_4_cooking_progress: None,
            slot_5_cooking_progress: None,
            attached_broth_pot_id: None,
            consumption_tick_counter: 0,
            is_submerged: false, // Default to above-water fumaroles
        }
    }
    
    /// Creates a new submerged fumarole at the specified position (for coral reef zones)
    pub fn new_submerged(pos_x: f32, pos_y: f32, chunk_index: u32) -> Self {
        Self {
            id: 0, // Auto-incremented
            pos_x,
            pos_y,
            chunk_index,
            slot_instance_id_0: None,
            slot_def_id_0: None,
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
            slot_0_cooking_progress: None,
            slot_1_cooking_progress: None,
            slot_2_cooking_progress: None,
            slot_3_cooking_progress: None,
            slot_4_cooking_progress: None,
            slot_5_cooking_progress: None,
            attached_broth_pot_id: None,
            consumption_tick_counter: 0,
            is_submerged: true, // Mark as submerged
        }
    }
    
    /// Get cooking progress for a slot
    pub fn get_cooking_progress(&self, slot_index: u8) -> Option<crate::cooking::CookingProgress> {
        match slot_index {
            0 => self.slot_0_cooking_progress.clone(),
            1 => self.slot_1_cooking_progress.clone(),
            2 => self.slot_2_cooking_progress.clone(),
            3 => self.slot_3_cooking_progress.clone(),
            4 => self.slot_4_cooking_progress.clone(),
            5 => self.slot_5_cooking_progress.clone(),
            _ => None,
        }
    }
    
    /// Set cooking progress for a slot
    pub fn set_cooking_progress(&mut self, slot_index: u8, progress: Option<crate::cooking::CookingProgress>) {
        match slot_index {
            0 => self.slot_0_cooking_progress = progress,
            1 => self.slot_1_cooking_progress = progress,
            2 => self.slot_2_cooking_progress = progress,
            3 => self.slot_3_cooking_progress = progress,
            4 => self.slot_4_cooking_progress = progress,
            5 => self.slot_5_cooking_progress = progress,
            _ => {},
        }
    }
}

// Schedule Table for per-fumarole processing
#[spacetimedb::table(name = fumarole_processing_schedule, scheduled(process_fumarole_logic_scheduled))]
#[derive(Clone)]
pub struct FumaroleProcessingSchedule {
    #[primary_key]
    pub fumarole_id: u64,
    pub scheduled_at: ScheduleAt,
}

/******************************************************************************
 *                           REDUCERS (Generic Handlers)                     *
 ******************************************************************************/

/// --- Add Item to Fumarole ---
#[spacetimedb::reducer]
pub fn move_item_to_fumarole(ctx: &ReducerContext, fumarole_id: u32, target_slot_index: u8, item_instance_id: u64) -> Result<(), String> {
    let (_player, mut fumarole) = validate_fumarole_interaction(ctx, fumarole_id)?;
    
    // --- SECURITY: Prevent interaction with fumarole slots when broth pot is attached ---
    if fumarole.attached_broth_pot_id.is_some() {
        return Err("Cannot add items to fumarole while broth pot is attached. Remove the broth pot first.".to_string());
    }
    
    inventory_management::handle_move_to_container_slot(ctx, &mut fumarole, target_slot_index, item_instance_id)?;
    ctx.db.fumarole().id().update(fumarole.clone());
    schedule_next_fumarole_processing(ctx, fumarole_id)?;
    Ok(())
}

/// --- Remove Item from Fumarole ---
#[spacetimedb::reducer]
pub fn quick_move_from_fumarole(ctx: &ReducerContext, fumarole_id: u32, source_slot_index: u8) -> Result<(), String> {
    let (_player, mut fumarole) = validate_fumarole_interaction(ctx, fumarole_id)?;
    
    // --- SECURITY: Prevent interaction when broth pot is attached ---
    if fumarole.attached_broth_pot_id.is_some() {
        return Err("Cannot remove items from fumarole while broth pot is attached. Remove the broth pot first.".to_string());
    }
    
    inventory_management::handle_quick_move_from_container(ctx, &mut fumarole, source_slot_index)?;
    ctx.db.fumarole().id().update(fumarole.clone());
    schedule_next_fumarole_processing(ctx, fumarole_id)?;
    Ok(())
}

/// --- Split Stack Into Fumarole ---
#[spacetimedb::reducer]
pub fn split_stack_into_fumarole(
    ctx: &ReducerContext,
    source_item_instance_id: u64,
    quantity_to_split: u32,
    target_fumarole_id: u32,
    target_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut fumarole) = validate_fumarole_interaction(ctx, target_fumarole_id)?;
    
    if fumarole.attached_broth_pot_id.is_some() {
        return Err("Cannot add items to fumarole while broth pot is attached.".to_string());
    }
    
    let mut source_item_mut = get_player_item(ctx, source_item_instance_id)?;
    let new_item_target_location = ItemLocation::Container(ContainerLocationData {
        container_type: ContainerType::Fumarole,
        container_id: fumarole.id as u64,
        slot_index: target_slot_index,
    });
    let new_item_instance_id = crate::items::split_stack_helper(ctx, &mut source_item_mut, quantity_to_split, new_item_target_location)?;
    
    let mut new_item = ctx.db.inventory_item().instance_id().find(new_item_instance_id)
        .ok_or_else(|| format!("Failed to find newly split item instance {}", new_item_instance_id))?;
    let new_item_def = ctx.db.item_definition().id().find(new_item.item_def_id)
        .ok_or_else(|| format!("Failed to find definition for new item {}", new_item.item_def_id))?;

    crate::inventory_management::merge_or_place_into_container_slot(ctx, &mut fumarole, target_slot_index, &mut new_item, &new_item_def)?;
    
    ctx.db.inventory_item().instance_id().update(source_item_mut);
    ctx.db.fumarole().id().update(fumarole.clone());
    schedule_next_fumarole_processing(ctx, target_fumarole_id)?;
    Ok(())
}

/// --- Fumarole Internal Item Movement ---
#[spacetimedb::reducer]
pub fn move_item_within_fumarole(
    ctx: &ReducerContext,
    fumarole_id: u32,
    source_slot_index: u8,
    target_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut fumarole) = validate_fumarole_interaction(ctx, fumarole_id)?;
    
    if fumarole.attached_broth_pot_id.is_some() {
        return Err("Cannot move items in fumarole while broth pot is attached.".to_string());
    }
    
    inventory_management::handle_move_within_container(ctx, &mut fumarole, source_slot_index, target_slot_index)?;
    ctx.db.fumarole().id().update(fumarole.clone());
    schedule_next_fumarole_processing(ctx, fumarole_id)?;
    Ok(())
}

/// --- Fumarole Internal Stack Splitting ---
#[spacetimedb::reducer]
pub fn split_stack_within_fumarole(
    ctx: &ReducerContext,
    fumarole_id: u32,
    source_slot_index: u8,
    quantity_to_split: u32,
    target_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut fumarole) = validate_fumarole_interaction(ctx, fumarole_id)?;
    
    if fumarole.attached_broth_pot_id.is_some() {
        return Err("Cannot split items in fumarole while broth pot is attached.".to_string());
    }
    
    inventory_management::handle_split_within_container(ctx, &mut fumarole, source_slot_index, target_slot_index, quantity_to_split)?;
    ctx.db.fumarole().id().update(fumarole.clone());
    schedule_next_fumarole_processing(ctx, fumarole_id)?;
    Ok(())
}

/// --- Quick Move to Fumarole ---
#[spacetimedb::reducer]
pub fn quick_move_to_fumarole(
    ctx: &ReducerContext,
    fumarole_id: u32,
    item_instance_id: u64,
) -> Result<(), String> {
    let (_player, mut fumarole) = validate_fumarole_interaction(ctx, fumarole_id)?;
    
    if fumarole.attached_broth_pot_id.is_some() {
        return Err("Cannot add items to fumarole while broth pot is attached.".to_string());
    }
    
    inventory_management::handle_quick_move_to_container(ctx, &mut fumarole, item_instance_id)?;
    ctx.db.fumarole().id().update(fumarole.clone());
    schedule_next_fumarole_processing(ctx, fumarole_id)?;
    Ok(())
}

/// --- Move From Fumarole to Player ---
#[spacetimedb::reducer]
pub fn move_item_from_fumarole_to_player_slot(
    ctx: &ReducerContext,
    fumarole_id: u32,
    source_slot_index: u8,
    target_slot_type: String,
    target_slot_index: u32,
) -> Result<(), String> {
    let (_player, mut fumarole) = validate_fumarole_interaction(ctx, fumarole_id)?;
    
    if fumarole.attached_broth_pot_id.is_some() {
        return Err("Cannot remove items from fumarole while broth pot is attached.".to_string());
    }
    
    inventory_management::handle_move_from_container_slot(ctx, &mut fumarole, source_slot_index, target_slot_type, target_slot_index)?;
    ctx.db.fumarole().id().update(fumarole.clone());
    schedule_next_fumarole_processing(ctx, fumarole_id)?;
    Ok(())
}

/// --- Split From Fumarole to Player ---
#[spacetimedb::reducer]
pub fn split_stack_from_fumarole(
    ctx: &ReducerContext,
    source_fumarole_id: u32,
    source_slot_index: u8,
    quantity_to_split: u32,
    target_slot_type: String,
    target_slot_index: u32,
) -> Result<(), String> {
    let (_player, mut fumarole) = validate_fumarole_interaction(ctx, source_fumarole_id)?;
    
    inventory_management::handle_split_from_container(
        ctx,
        &mut fumarole,
        source_slot_index,
        quantity_to_split,
        target_slot_type,
        target_slot_index
    )?;
    
    ctx.db.fumarole().id().update(fumarole);
    Ok(())
}

/// --- Split and Move From Fumarole ---
/// Splits a stack FROM a fumarole slot and moves/merges the new stack 
/// TO a target slot (player inventory/hotbar, or another fumarole slot).
#[spacetimedb::reducer]
pub fn split_and_move_from_fumarole(
    ctx: &ReducerContext,
    source_fumarole_id: u32,
    source_slot_index: u8,
    quantity_to_split: u32,
    target_slot_type: String,    // "inventory", "hotbar", or "fumarole_slot"
    target_slot_index: u32,     // Numeric index for inventory/hotbar/fumarole
) -> Result<(), String> {
    let sender_id = ctx.sender;
    let fumaroles = ctx.db.fumarole();
    let mut inventory_items = ctx.db.inventory_item();

    log::info!(
        "[SplitMoveFromFumarole] Player {:?} splitting {} from fumarole {} slot {} to {} slot {}",
        sender_id, quantity_to_split, source_fumarole_id, source_slot_index, target_slot_type, target_slot_index
    );

    // --- 1. Find Source Fumarole & Item ID --- 
    let fumarole = fumaroles.id().find(source_fumarole_id)
        .ok_or(format!("Source fumarole {} not found", source_fumarole_id))?;
    
    if source_slot_index >= NUM_FUMAROLE_SLOTS as u8 {
        return Err(format!("Invalid source slot index: {}", source_slot_index));
    }

    let source_instance_id = match source_slot_index {
        0 => fumarole.slot_instance_id_0,
        1 => fumarole.slot_instance_id_1,
        2 => fumarole.slot_instance_id_2,
        3 => fumarole.slot_instance_id_3,
        4 => fumarole.slot_instance_id_4,
        5 => fumarole.slot_instance_id_5,
        _ => None,
    }.ok_or(format!("No item found in source fumarole slot {}", source_slot_index))?;

    // --- 2. Get Source Item & Validate Split --- 
    let mut source_item = inventory_items.instance_id().find(source_instance_id)
        .ok_or("Source item instance not found in inventory table")?;

    let item_def = ctx.db.item_definition().id().find(source_item.item_def_id)
        .ok_or_else(|| format!("Definition not found for item ID {}", source_item.item_def_id))?;
    
    if !item_def.is_stackable {
        return Err(format!("Item '{}' is not stackable.", item_def.name));
    }
    if quantity_to_split == 0 {
        return Err("Cannot split a quantity of 0.".to_string());
    }
    if quantity_to_split >= source_item.quantity {
        return Err(format!("Cannot split {} items, only {} available.", quantity_to_split, source_item.quantity));
    }

    // --- 3. Perform Split --- 
    let initial_location_for_new_split_item = 
        crate::player_inventory::find_first_empty_player_slot(ctx, sender_id)
            .ok_or_else(|| "Player inventory is full, cannot create split stack.".to_string())?;

    let new_item_instance_id = crate::items::split_stack_helper(ctx, &mut source_item, quantity_to_split, initial_location_for_new_split_item)?;
    inventory_items.instance_id().update(source_item.clone());

    let new_item_for_move = inventory_items.instance_id().find(new_item_instance_id)
        .ok_or_else(|| format!("Failed to find newly split item instance {} for moving", new_item_instance_id))?;

    // --- 4. Move/Merge the NEW Stack from its initial player location to the FINAL target --- 
    log::debug!("[SplitMoveFromFumarole] Moving new stack {} from its initial player location {:?} to final target {} slot {}", 
                new_item_instance_id, new_item_for_move.location, target_slot_type, target_slot_index);
    
    match target_slot_type.as_str() {
        "inventory" => {
            crate::player_inventory::move_item_to_inventory(ctx, new_item_instance_id, target_slot_index as u16)
        },
        "hotbar" => {
            crate::player_inventory::move_item_to_hotbar(ctx, new_item_instance_id, target_slot_index as u8)
        },
        "fumarole_slot" => {
            // Moving to a slot in the *same* or *another* fumarole
            move_item_to_fumarole(ctx, source_fumarole_id, target_slot_index as u8, new_item_instance_id)
        },
        _ => {
            log::error!("[SplitMoveFromFumarole] Invalid target_slot_type: {}", target_slot_type);
            inventory_items.instance_id().delete(new_item_instance_id);
            Err(format!("Invalid target slot type for split: {}", target_slot_type))
        }
    }
}

/// --- Drop Item from Fumarole Slot to World ---
#[spacetimedb::reducer]
pub fn drop_item_from_fumarole_slot_to_world(
    ctx: &ReducerContext,
    fumarole_id: u32,
    slot_index: u8,
) -> Result<(), String> {
    let (player, mut fumarole) = validate_fumarole_interaction(ctx, fumarole_id)?;
    
    if fumarole.attached_broth_pot_id.is_some() {
        return Err("Cannot drop items from fumarole while broth pot is attached.".to_string());
    }
    
    crate::inventory_management::handle_drop_from_container_slot(ctx, &mut fumarole, slot_index, &player)?;
    ctx.db.fumarole().id().update(fumarole);
    Ok(())
}

/// --- Split and Drop Item from Fumarole Slot to World ---
#[spacetimedb::reducer]
pub fn split_and_drop_item_from_fumarole_slot_to_world(
    ctx: &ReducerContext,
    fumarole_id: u32,
    slot_index: u8,
    quantity_to_split: u32,
) -> Result<(), String> {
    let (player, mut fumarole) = validate_fumarole_interaction(ctx, fumarole_id)?;
    
    if fumarole.attached_broth_pot_id.is_some() {
        return Err("Cannot drop items from fumarole while broth pot is attached.".to_string());
    }
    
    crate::inventory_management::handle_split_and_drop_from_container_slot(ctx, &mut fumarole, slot_index, quantity_to_split, &player)?;
    ctx.db.fumarole().id().update(fumarole);
    Ok(())
}

/******************************************************************************
 *                       REDUCERS (Fumarole-Specific Logic)                  *
 ******************************************************************************/

/// --- Fumarole Interaction Check ---
#[spacetimedb::reducer]
pub fn interact_with_fumarole(ctx: &ReducerContext, fumarole_id: u32) -> Result<(), String> {
    let (_player, _fumarole) = validate_fumarole_interaction(ctx, fumarole_id)?;
    Ok(())
}

/******************************************************************************
 *                           SCHEDULED REDUCERS                              *
 ******************************************************************************/

/// Scheduled reducer: Processes fumarole incineration logic
#[spacetimedb::reducer]
pub fn process_fumarole_logic_scheduled(ctx: &ReducerContext, schedule_args: FumaroleProcessingSchedule) -> Result<(), String> {
    if ctx.sender != ctx.identity() {
        log::warn!("[ProcessFumaroleScheduled] Unauthorized attempt by {:?}", ctx.sender);
        return Err("Unauthorized scheduler invocation".to_string());
    }

    let schedule_fumarole_id = schedule_args.fumarole_id; // u64 from schedule table
    let fumarole_id = schedule_fumarole_id as u32; // Convert to u32 for table lookup
    let mut fumaroles_table = ctx.db.fumarole();
    let mut inventory_items_table = ctx.db.inventory_item();

    let mut fumarole = match fumaroles_table.id().find(fumarole_id) {
        Some(f) => f,
        None => {
            log::warn!("[ProcessFumaroleScheduled] Fumarole {} not found. Removing schedule.", fumarole_id);
            ctx.db.fumarole_processing_schedule().fumarole_id().delete(schedule_fumarole_id);
            return Ok(());
        }
    };

    let mut made_changes = false;
    
    // Get charcoal definition once for comparison
    let charcoal_def = get_item_def_by_name(ctx, "Charcoal");
    let charcoal_def_id = charcoal_def.as_ref().map(|d| d.id);

    log::info!("[ProcessFumarole] START processing fumarole {} at time {:?}", fumarole_id, ctx.timestamp);

    // --- FUMAROLE BURN DAMAGE LOGIC ---
    // Apply burn damage to players standing on the fumarole (same as campfire)
    const FUMAROLE_DAMAGE_RADIUS_SQUARED: f32 = 1600.0; // Same as campfire
    const FUMAROLE_DAMAGE_PER_TICK: f32 = 5.0; // Same as campfire
    const FUMAROLE_DAMAGE_EFFECT_DURATION_SECONDS: u64 = 3; // Same as campfire
    const FUMAROLE_BURN_TICK_INTERVAL_SECONDS: f32 = 1.0; // Doubled speed (was 2.0)
    const VISUAL_CENTER_Y_OFFSET: f32 = 42.0; // Same as campfire
    
    for player_entity in ctx.db.player().iter() {
        if player_entity.is_dead { continue; } // Skip dead players
        
        let dx = player_entity.position_x - fumarole.pos_x;
        let dy = player_entity.position_y - (fumarole.pos_y - VISUAL_CENTER_Y_OFFSET);
        let dist_sq = dx * dx + dy * dy;

        if dist_sq < FUMAROLE_DAMAGE_RADIUS_SQUARED {
            // Apply burn effect using the centralized function from active_effects.rs
            match crate::active_effects::apply_burn_effect(
                ctx, 
                player_entity.identity, 
                FUMAROLE_DAMAGE_PER_TICK, 
                FUMAROLE_DAMAGE_EFFECT_DURATION_SECONDS as f32, 
                FUMAROLE_BURN_TICK_INTERVAL_SECONDS,
                0 // 0 for environmental/fumarole source
            ) {
                Ok(_) => {
                    log::debug!("[ProcessFumarole {}] Applied burn effect to player {:?}", fumarole_id, player_entity.identity);
                }
                Err(e) => {
                    log::error!("[ProcessFumarole {}] Failed to apply burn effect to player {:?}: {}", fumarole_id, player_entity.identity, e);
                }
            }
        }
    }
    // --- END FUMAROLE BURN DAMAGE LOGIC ---

    // Increment consumption tick counter
    fumarole.consumption_tick_counter += 1;
    made_changes = true;
    
    // Only consume items every FUMAROLE_ITEM_CONSUMPTION_TICKS (2 seconds, doubled speed)
    let should_consume_items = fumarole.consumption_tick_counter >= FUMAROLE_ITEM_CONSUMPTION_TICKS;
    
    if should_consume_items {
        fumarole.consumption_tick_counter = 0; // Reset counter
        log::info!("[ProcessFumarole] Consumption tick reached - processing items");
    }
    
    // Update cooking progress for each slot (every tick for smooth progress display)
    let progress_per_tick = FUMAROLE_PROCESS_INTERVAL_SECS as f32; // 1 second per tick
    let target_cook_time = (FUMAROLE_ITEM_CONSUMPTION_TICKS * FUMAROLE_PROCESS_INTERVAL_SECS) as f32; // Total time to consume
    
    for slot_idx in 0..NUM_FUMAROLE_SLOTS as u8 {
        if let Some(instance_id) = fumarole.get_slot_instance_id(slot_idx) {
            if let Some(item) = inventory_items_table.instance_id().find(instance_id) {
                // Skip charcoal - don't show progress for output items
                if charcoal_def_id == Some(item.item_def_id) {
                    fumarole.set_cooking_progress(slot_idx, None);
                    continue;
                }
                
                // Get or create cooking progress for this slot
                let current_progress = fumarole.get_cooking_progress(slot_idx);
                let new_progress = match current_progress {
                    Some(mut progress) => {
                        progress.current_cook_time_secs += progress_per_tick;
                        // Cap at target (will be reset when item is consumed)
                        if progress.current_cook_time_secs > target_cook_time {
                            progress.current_cook_time_secs = target_cook_time;
                        }
                        progress
                    }
                    None => {
                        // Get item name for display
                        let item_name = ctx.db.item_definition().id().find(item.item_def_id)
                            .map(|def| def.name.clone())
                            .unwrap_or_else(|| "Unknown".to_string());
                        crate::cooking::CookingProgress {
                            current_cook_time_secs: progress_per_tick,
                            target_cook_time_secs: target_cook_time,
                            target_item_def_name: format!("Charcoal (from {})", item_name),
                        }
                    }
                };
                fumarole.set_cooking_progress(slot_idx, Some(new_progress));
            } else {
                // Item not found, clear progress
                fumarole.set_cooking_progress(slot_idx, None);
            }
        } else {
            // No item in slot, clear progress
            fumarole.set_cooking_progress(slot_idx, None);
        }
    }

    // Process each slot - incinerate items and produce charcoal (only on consumption ticks)
    if should_consume_items {
        for slot_idx in 0..NUM_FUMAROLE_SLOTS as u8 {
            if let Some(instance_id) = fumarole.get_slot_instance_id(slot_idx) {
                log::info!("[ProcessFumarole] Slot {} has item instance {}", slot_idx, instance_id);
                if let Some(mut item) = inventory_items_table.instance_id().find(instance_id) {
                    // Skip charcoal - don't incinerate the output!
                    if charcoal_def_id == Some(item.item_def_id) {
                        log::info!("[ProcessFumarole] Slot {} contains CHARCOAL (qty: {}), skipping", slot_idx, item.quantity);
                        continue;
                    }
                    
                    log::info!("[ProcessFumarole] Slot {} incinerating item def {} (qty: {} -> {})", slot_idx, item.item_def_id, item.quantity, item.quantity.saturating_sub(1));
                    
                    // Consume 1 unit from the item
                    item.quantity = item.quantity.saturating_sub(1);
                    made_changes = true;
                    let remaining_qty = item.quantity; // Capture before move
                    
                    // Reset cooking progress after consumption (will start fresh for next unit)
                    fumarole.set_cooking_progress(slot_idx, None);
                    
                    if remaining_qty > 0 {
                        inventory_items_table.instance_id().update(item);
                        log::info!("[ProcessFumarole] Item updated, remaining qty: {}", remaining_qty);
                    } else {
                        // Item fully consumed - remove from slot
                        inventory_items_table.instance_id().delete(instance_id);
                        fumarole.set_slot(slot_idx, None, None);
                        log::info!("[ProcessFumarole] Item FULLY CONSUMED, slot {} cleared", slot_idx);
                    }
                    
                    // Produce charcoal for each item incinerated
                    if let Some(ref charcoal) = charcoal_def {
                        log::info!("[ProcessFumarole] Producing {} charcoal...", CHARCOAL_PRODUCTION_AMOUNT);
                        match try_add_charcoal_to_fumarole_or_drop(ctx, &mut fumarole, charcoal, CHARCOAL_PRODUCTION_AMOUNT) {
                            Ok(charcoal_modified_fumarole) => {
                                if charcoal_modified_fumarole {
                                    made_changes = true; // Charcoal was added to slots
                                    log::info!("[ProcessFumarole] Charcoal added to fumarole slots");
                                } else {
                                    log::info!("[ProcessFumarole] Charcoal stacked or dropped");
                                }
                            }
                            Err(e) => {
                                log::warn!("[ProcessFumarole] Failed to produce charcoal: {}", e);
                            }
                        }
                    } else {
                        log::warn!("[ProcessFumarole] Charcoal definition not found!");
                    }
                }
            }
        }
    }

    log::info!("[ProcessFumarole] END processing fumarole {}, made_changes: {}", fumarole_id, made_changes);

    // Always update the fumarole to persist slot changes
    if made_changes {
        fumaroles_table.id().update(fumarole);
    }

    // Call schedule_next to determine if we should continue or stop
    schedule_next_fumarole_processing(ctx, fumarole_id)?;
    
    Ok(())
}

/// Schedules or re-schedules the processing logic for a fumarole
#[spacetimedb::reducer]
pub fn schedule_next_fumarole_processing(ctx: &ReducerContext, fumarole_id: u32) -> Result<(), String> {
    let mut schedules = ctx.db.fumarole_processing_schedule();
    let fumarole_opt = ctx.db.fumarole().id().find(fumarole_id);
    let schedule_id = fumarole_id as u64; // Schedule table requires u64

    if fumarole_opt.is_none() {
        log::info!("[ScheduleFumarole] Fumarole {} not found, removing schedule", fumarole_id);
        schedules.fumarole_id().delete(schedule_id);
        return Ok(());
    }

    let fumarole = fumarole_opt.unwrap();
    let has_items = check_if_fumarole_has_items(ctx, &fumarole);
    
    log::info!("[ScheduleFumarole] Fumarole {} has_items_to_incinerate: {}", fumarole_id, has_items);

    // Always keep the schedule running (for burn damage even when empty)
    let interval = TimeDuration::from_micros((FUMAROLE_PROCESS_INTERVAL_SECS * 1_000_000) as i64);
    let schedule_entry = FumaroleProcessingSchedule {
        fumarole_id: schedule_id,
        scheduled_at: ScheduleAt::Interval(interval),
    };
    
    if schedules.fumarole_id().find(schedule_id).is_some() {
        let mut existing_schedule = schedules.fumarole_id().find(schedule_id).unwrap();
        existing_schedule.scheduled_at = ScheduleAt::Interval(interval);
        schedules.fumarole_id().update(existing_schedule);
        log::info!("[ScheduleFumarole] Updated existing schedule for fumarole {}", fumarole_id);
    } else {
        match schedules.try_insert(schedule_entry) {
            Ok(_) => {
                log::info!("[ScheduleFumarole] Created new schedule for fumarole {}", fumarole_id);
            },
            Err(e) => {
                if let Some(mut existing_schedule) = schedules.fumarole_id().find(schedule_id) {
                    existing_schedule.scheduled_at = ScheduleAt::Interval(interval);
                    schedules.fumarole_id().update(existing_schedule);
                    log::info!("[ScheduleFumarole] Fallback update for fumarole {}", fumarole_id);
                } else {
                    return Err(format!("Failed to insert or update schedule for fumarole {}: {}", fumarole_id, e));
                }
            }
        }
    }

    Ok(())
}

/******************************************************************************
 *                            TRAIT IMPLEMENTATIONS                           *
 ******************************************************************************/

impl ItemContainer for Fumarole {
    fn num_slots(&self) -> usize {
        NUM_FUMAROLE_SLOTS
    }

    fn get_slot_instance_id(&self, slot_index: u8) -> Option<u64> {
        if slot_index >= NUM_FUMAROLE_SLOTS as u8 { return None; }
        match slot_index {
            0 => self.slot_instance_id_0,
            1 => self.slot_instance_id_1,
            2 => self.slot_instance_id_2,
            3 => self.slot_instance_id_3,
            4 => self.slot_instance_id_4,
            5 => self.slot_instance_id_5,
            _ => None,
        }
    }

    fn get_slot_def_id(&self, slot_index: u8) -> Option<u64> {
        if slot_index >= NUM_FUMAROLE_SLOTS as u8 { return None; }
        match slot_index {
            0 => self.slot_def_id_0,
            1 => self.slot_def_id_1,
            2 => self.slot_def_id_2,
            3 => self.slot_def_id_3,
            4 => self.slot_def_id_4,
            5 => self.slot_def_id_5,
            _ => None,
        }
    }

    fn set_slot(&mut self, slot_index: u8, instance_id: Option<u64>, def_id: Option<u64>) {
        if slot_index >= NUM_FUMAROLE_SLOTS as u8 { return; }
        match slot_index {
            0 => { self.slot_instance_id_0 = instance_id; self.slot_def_id_0 = def_id; },
            1 => { self.slot_instance_id_1 = instance_id; self.slot_def_id_1 = def_id; },
            2 => { self.slot_instance_id_2 = instance_id; self.slot_def_id_2 = def_id; },
            3 => { self.slot_instance_id_3 = instance_id; self.slot_def_id_3 = def_id; },
            4 => { self.slot_instance_id_4 = instance_id; self.slot_def_id_4 = def_id; },
            5 => { self.slot_instance_id_5 = instance_id; self.slot_def_id_5 = def_id; },
            _ => {},
        }
    }

    fn get_container_type(&self) -> ContainerType {
        ContainerType::Fumarole
    }

    fn get_container_id(&self) -> u64 {
        self.id as u64 // Cast u32 to u64 for trait
    }
}

pub struct FumaroleClearer;

pub(crate) fn clear_item_from_fumarole_slots(ctx: &ReducerContext, item_instance_id_to_clear: u64) -> bool {
    let inventory_table = ctx.db.inventory_item();
    let mut item_found_and_cleared = false;

    for mut fumarole in ctx.db.fumarole().iter() {
        let mut fumarole_modified = false;
        for i in 0..fumarole.num_slots() as u8 {
            if fumarole.get_slot_instance_id(i) == Some(item_instance_id_to_clear) {
                if let Some(mut item) = inventory_table.instance_id().find(item_instance_id_to_clear) {
                    item.location = ItemLocation::Unknown;
                    inventory_table.instance_id().update(item);
                }
                fumarole.set_slot(i, None, None);
                fumarole_modified = true;
                item_found_and_cleared = true;
            }
        }
        if fumarole_modified {
            ctx.db.fumarole().id().update(fumarole);
        }
    }
    item_found_and_cleared
}

impl ContainerItemClearer for FumaroleClearer {
    fn clear_item(ctx: &ReducerContext, item_instance_id: u64) -> bool {
        clear_item_from_fumarole_slots(ctx, item_instance_id)
    }
}

/******************************************************************************
 *                             HELPER FUNCTIONS                               *
 ******************************************************************************/

fn validate_fumarole_interaction(
    ctx: &ReducerContext,
    fumarole_id: u32,
) -> Result<(Player, Fumarole), String> {
    let sender_id = ctx.sender;
    let players = ctx.db.player();
    let fumaroles = ctx.db.fumarole();

    let player = players.identity().find(sender_id)
        .ok_or_else(|| "Player not found".to_string())?;
    let fumarole = fumaroles.id().find(fumarole_id)
        .ok_or_else(|| format!("Fumarole {} not found", fumarole_id))?;

    let dx = player.position_x - fumarole.pos_x;
    let dy = player.position_y - fumarole.pos_y;
    let dist_sq = dx * dx + dy * dy;

    if dist_sq > PLAYER_FUMAROLE_INTERACTION_DISTANCE_SQUARED {
        return Err("Too far away from fumarole".to_string());
    }
    
    // Check if submerged fumarole requires diving
    if fumarole.is_submerged && !player.is_on_water {
        return Err("You must be diving to interact with this fumarole.".to_string());
    }

    Ok((player, fumarole))
}

fn check_if_fumarole_has_items(ctx: &ReducerContext, fumarole: &Fumarole) -> bool {
    // Get charcoal def ID to exclude from check - we only want to process non-charcoal items
    let charcoal_def_id = get_item_def_by_name(ctx, "Charcoal").map(|d| d.id);
    
    for i in 0..NUM_FUMAROLE_SLOTS {
        if let Some(instance_id) = fumarole.get_slot_instance_id(i as u8) {
            if let Some(item_instance) = ctx.db.inventory_item().instance_id().find(instance_id) {
                // Skip charcoal - we only care about items that need to be incinerated
                if charcoal_def_id == Some(item_instance.item_def_id) {
                    continue;
                }
                if item_instance.quantity > 0 {
                    return true;
                }
            }
        }
    }
    false
}

/// Check if fumarole has items to incinerate based on slot def IDs (doesn't need DB lookup)
fn check_if_fumarole_has_items_direct(fumarole: &Fumarole, charcoal_def_id: Option<u64>) -> bool {
    for i in 0..NUM_FUMAROLE_SLOTS {
        if let Some(def_id) = fumarole.get_slot_def_id(i as u8) {
            // Skip charcoal - we only care about items that need to be incinerated
            if charcoal_def_id == Some(def_id) {
                continue;
            }
            // Has a non-charcoal item
            return true;
        }
    }
    false
}

fn get_item_def_by_name(ctx: &ReducerContext, name: &str) -> Option<ItemDefinition> {
    ctx.db.item_definition().iter().find(|def| def.name == name)
}

fn try_add_charcoal_to_fumarole_or_drop(
    ctx: &ReducerContext,
    fumarole: &mut Fumarole,
    charcoal_def: &ItemDefinition,
    quantity: u32
) -> Result<bool, String> {
    let mut inventory_items_table = ctx.db.inventory_item();
    let charcoal_def_id = charcoal_def.id;
    let charcoal_stack_size = charcoal_def.stack_size;
    let mut charcoal_added_to_slots = false;

    // Try to stack with existing charcoal
    for i in 0..NUM_FUMAROLE_SLOTS as u8 {
        if fumarole.get_slot_def_id(i) == Some(charcoal_def_id) {
            if let Some(instance_id) = fumarole.get_slot_instance_id(i) {
                if let Some(mut existing_charcoal) = inventory_items_table.instance_id().find(instance_id) {
                    if existing_charcoal.quantity < charcoal_stack_size {
                        let can_add = charcoal_stack_size - existing_charcoal.quantity;
                        let to_add = min(quantity, can_add);
                        existing_charcoal.quantity += to_add;
                        inventory_items_table.instance_id().update(existing_charcoal);
                        return Ok(false);
                    }
                }
            }
        }
    }

    // Try to place in empty slot
    for i in 0..NUM_FUMAROLE_SLOTS as u8 {
        if fumarole.get_slot_instance_id(i).is_none() {
            let new_charcoal_location = ItemLocation::Container(ContainerLocationData {
                container_type: ContainerType::Fumarole,
                container_id: fumarole.id as u64,
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
                    fumarole.set_slot(i, Some(inserted_item.instance_id), Some(charcoal_def_id));
                    charcoal_added_to_slots = true;
                    return Ok(charcoal_added_to_slots);
                }
                Err(_) => break,
            }
        }
    }

    // Drop if full
    let drop_x = fumarole.pos_x;
    let drop_y = fumarole.pos_y + crate::dropped_item::DROP_OFFSET / 2.0;
    create_dropped_item_entity(ctx, charcoal_def_id, quantity, drop_x, drop_y)?;
    
    Ok(charcoal_added_to_slots)
}


