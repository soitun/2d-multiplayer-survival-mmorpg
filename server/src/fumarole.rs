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
pub(crate) const FUMAROLE_WARMTH_RADIUS: f32 = 200.0; // 200px radius warmth protection
pub(crate) const FUMAROLE_WARMTH_RADIUS_SQUARED: f32 = FUMAROLE_WARMTH_RADIUS * FUMAROLE_WARMTH_RADIUS;

// Spawning constants
pub(crate) const FUMAROLES_PER_QUARRY_MIN: u32 = 2;
pub(crate) const FUMAROLES_PER_QUARRY_MAX: u32 = 4;
pub(crate) const MIN_FUMAROLE_DISTANCE_PX: f32 = 120.0; // Minimum distance between fumaroles
pub(crate) const MIN_FUMAROLE_DISTANCE_SQ: f32 = MIN_FUMAROLE_DISTANCE_PX * MIN_FUMAROLE_DISTANCE_PX;

// Container constants
pub const NUM_FUMAROLE_SLOTS: usize = 6; // 6 slots for items to incinerate
const FUMAROLE_PROCESS_INTERVAL_SECS: u64 = 2; // Process every 2 seconds (fast incineration)
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
    pub id: u64,
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
    
    pub attached_broth_pot_id: Option<u32>, // Broth pot placed on this fumarole
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
            attached_broth_pot_id: None,
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
pub fn move_item_to_fumarole(ctx: &ReducerContext, fumarole_id: u64, target_slot_index: u8, item_instance_id: u64) -> Result<(), String> {
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
pub fn quick_move_from_fumarole(ctx: &ReducerContext, fumarole_id: u64, source_slot_index: u8) -> Result<(), String> {
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
    target_fumarole_id: u64,
    target_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut fumarole) = validate_fumarole_interaction(ctx, target_fumarole_id)?;
    
    if fumarole.attached_broth_pot_id.is_some() {
        return Err("Cannot add items to fumarole while broth pot is attached.".to_string());
    }
    
    let mut source_item_mut = get_player_item(ctx, source_item_instance_id)?;
    let new_item_target_location = ItemLocation::Container(ContainerLocationData {
        container_type: ContainerType::Fumarole,
        container_id: fumarole.id,
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
    fumarole_id: u64,
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
    fumarole_id: u64,
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
    fumarole_id: u64,
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
    fumarole_id: u64,
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
    source_fumarole_id: u64,
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
    source_fumarole_id: u64,
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
    fumarole_id: u64,
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
    fumarole_id: u64,
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
pub fn interact_with_fumarole(ctx: &ReducerContext, fumarole_id: u64) -> Result<(), String> {
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

    let fumarole_id = schedule_args.fumarole_id;
    let mut fumaroles_table = ctx.db.fumarole();
    let mut inventory_items_table = ctx.db.inventory_item();

    let mut fumarole = match fumaroles_table.id().find(fumarole_id) {
        Some(f) => f,
        None => {
            log::warn!("[ProcessFumaroleScheduled] Fumarole {} not found. Removing schedule.", fumarole_id);
            ctx.db.fumarole_processing_schedule().fumarole_id().delete(fumarole_id);
            return Ok(());
        }
    };

    let mut made_changes = false;

    // Process each slot - incinerate items and produce charcoal
    for slot_idx in 0..NUM_FUMAROLE_SLOTS as u8 {
        if let Some(instance_id) = fumarole.get_slot_instance_id(slot_idx) {
            if let Some(mut item) = inventory_items_table.instance_id().find(instance_id) {
                // Consume 1 unit from the item
                item.quantity = item.quantity.saturating_sub(1);
                
                if item.quantity > 0 {
                    inventory_items_table.instance_id().update(item);
                } else {
                    // Item fully consumed - remove from slot
                    inventory_items_table.instance_id().delete(instance_id);
                    fumarole.set_slot(slot_idx, None, None);
                    made_changes = true;
                }
                
                // Produce charcoal
                if let Some(charcoal_def) = get_item_def_by_name(ctx, "Charcoal") {
                    if try_add_charcoal_to_fumarole_or_drop(ctx, &mut fumarole, &charcoal_def, CHARCOAL_PRODUCTION_AMOUNT).unwrap_or(false) {
                        made_changes = true;
                    }
                }
            }
        }
    }

    if made_changes {
        fumaroles_table.id().update(fumarole);
    }

    schedule_next_fumarole_processing(ctx, fumarole_id)?;
    Ok(())
}

/// Schedules or re-schedules the processing logic for a fumarole
#[spacetimedb::reducer]
pub fn schedule_next_fumarole_processing(ctx: &ReducerContext, fumarole_id: u64) -> Result<(), String> {
    let mut schedules = ctx.db.fumarole_processing_schedule();
    let fumarole_opt = ctx.db.fumarole().id().find(fumarole_id);

    if fumarole_opt.is_none() {
        schedules.fumarole_id().delete(fumarole_id);
        return Ok(());
    }

    let fumarole = fumarole_opt.unwrap();
    let has_items = check_if_fumarole_has_items(ctx, &fumarole);

    if has_items {
        let interval = TimeDuration::from_micros((FUMAROLE_PROCESS_INTERVAL_SECS * 1_000_000) as i64);
        let schedule_entry = FumaroleProcessingSchedule {
            fumarole_id,
            scheduled_at: ScheduleAt::Interval(interval),
        };
        
        if schedules.fumarole_id().find(fumarole_id).is_some() {
            let mut existing_schedule = schedules.fumarole_id().find(fumarole_id).unwrap();
            existing_schedule.scheduled_at = ScheduleAt::Interval(interval);
            schedules.fumarole_id().update(existing_schedule);
        } else {
            match schedules.try_insert(schedule_entry) {
                Ok(_) => {},
                Err(e) => {
                    if let Some(mut existing_schedule) = schedules.fumarole_id().find(fumarole_id) {
                        existing_schedule.scheduled_at = ScheduleAt::Interval(interval);
                        schedules.fumarole_id().update(existing_schedule);
                    } else {
                        return Err(format!("Failed to insert or update schedule for fumarole {}: {}", fumarole_id, e));
                    }
                }
            }
        }
    } else {
        schedules.fumarole_id().delete(fumarole_id);
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
        self.id
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
    fumarole_id: u64,
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

    Ok((player, fumarole))
}

fn check_if_fumarole_has_items(ctx: &ReducerContext, fumarole: &Fumarole) -> bool {
    for i in 0..NUM_FUMAROLE_SLOTS {
        if let Some(instance_id) = fumarole.get_slot_instance_id(i as u8) {
            if let Some(item_instance) = ctx.db.inventory_item().instance_id().find(instance_id) {
                if item_instance.quantity > 0 {
                    return true;
                }
            }
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
                container_id: fumarole.id,
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

