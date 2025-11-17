/******************************************************************************
 *                                                                            *
 * Defines the BrothPot entity, its data structure, and associated logic.    *
 * Handles broth cooking, water desalination, stirring mini-game, and        *
 * recipe management. Broth pots snap to campfire positions and can be       *
 * picked up when empty (like lanterns/storage boxes).                       *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{Identity, Timestamp, ReducerContext, Table, log, SpacetimeType, TimeDuration, ScheduleAt};
use std::cmp::min;

// Import models
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
use crate::player_inventory::{find_first_empty_player_slot};
use crate::environment::calculate_chunk_index;
use crate::campfire::{campfire as CampfireTableTrait, Campfire};
use crate::world_state::{WeatherType, get_weather_for_position};
use crate::sound_events;

// --- Constants ---
pub const NUM_INGREDIENT_SLOTS: usize = 3;
pub const MAX_WATER_CAPACITY_ML: u32 = 5000; // 5 liters
pub const BROTH_POT_INITIAL_HEALTH: f32 = 100.0;
pub const BROTH_POT_MAX_HEALTH: f32 = 100.0;
pub const BROTH_POT_PROCESS_INTERVAL_SECS: u64 = 1;
pub const PLAYER_BROTH_POT_INTERACTION_DISTANCE: f32 = 200.0;
pub const PLAYER_BROTH_POT_INTERACTION_DISTANCE_SQUARED: f32 = 
    PLAYER_BROTH_POT_INTERACTION_DISTANCE * PLAYER_BROTH_POT_INTERACTION_DISTANCE;

// --- Rain Collection Constants (similar to rain collectors) ---
// Collection rates per second based on weather type (ml per second)
pub const LIGHT_RAIN_COLLECTION_RATE_ML_PER_SEC: f32 = 10.0;    // 10ml/sec = 600ml/min
pub const MODERATE_RAIN_COLLECTION_RATE_ML_PER_SEC: f32 = 30.0; // 30ml/sec = 1800ml/min
pub const HEAVY_RAIN_COLLECTION_RATE_ML_PER_SEC: f32 = 60.0;    // 60ml/sec = 3600ml/min
pub const HEAVY_STORM_COLLECTION_RATE_ML_PER_SEC: f32 = 100.0;  // 100ml/sec = 6000ml/min

// Stirring constants
pub const STIR_QUALITY_DECAY_RATE_PER_SEC: f32 = 0.05; // 5% per second
pub const STIR_QUALITY_BOOST_AMOUNT: f32 = 0.3; // 30% boost per stir
pub const MIN_STIR_QUALITY_FOR_SUCCESS: f32 = 0.3; // Need at least 30% quality
pub const SPOILAGE_THRESHOLD: f32 = 0.2; // Spoils below 20% quality

/// --- Broth Pot Data Structure ---
/// Represents a broth pot placed on a campfire for cooking broth, desalinating water, etc.
#[spacetimedb::table(name = broth_pot, public)]
#[derive(Clone, Debug)]
pub struct BrothPot {
    #[primary_key]
    #[auto_inc]
    pub id: u32,
    pub pos_x: f32,
    pub pos_y: f32,
    pub chunk_index: u32,
    pub placed_by: Identity,
    pub placed_at: Timestamp,
    pub attached_to_campfire_id: Option<u32>, // Which campfire it's on
    
    // Water System
    pub water_level_ml: u32, // Current water (0-5000ml)
    pub max_water_capacity_ml: u32, // 5000ml capacity
    pub is_seawater: bool, // True if contains seawater (needs desalination)
    pub is_desalinating: bool, // True if currently desalinating
    
    // Ingredient Slots (3 slots for recipe ingredients)
    pub ingredient_instance_id_0: Option<u64>,
    pub ingredient_def_id_0: Option<u64>,
    pub ingredient_instance_id_1: Option<u64>,
    pub ingredient_def_id_1: Option<u64>,
    pub ingredient_instance_id_2: Option<u64>,
    pub ingredient_def_id_2: Option<u64>,
    
    // Water Container Slot (for transferring water FROM container TO pot)
    pub water_container_instance_id: Option<u64>,
    pub water_container_def_id: Option<u64>,
    
    // Cooking State
    pub is_cooking: bool,
    pub current_recipe_name: Option<String>, // Which recipe is being cooked
    pub cooking_progress_secs: f32, // How long it's been cooking
    pub required_cooking_time_secs: f32, // Total time needed
    
    // Stirring Mini-game
    pub stir_quality: f32, // 0.0-1.0 quality meter (starts at 1.0)
    pub last_stirred_at: Option<Timestamp>,
    
    // Output
    pub output_item_instance_id: Option<u64>,
    pub output_item_def_id: Option<u64>,
    pub is_spoiled: bool, // True if left unattended too long
    
    // Health & State
    pub health: f32,
    pub max_health: f32,
    pub is_destroyed: bool,
    pub destroyed_at: Option<Timestamp>,
    pub last_hit_time: Option<Timestamp>,
    pub last_damaged_by: Option<Identity>,
}

// --- Scheduled Processing Table ---
#[spacetimedb::table(name = broth_pot_processing_schedule, scheduled(process_broth_pot_logic_scheduled))]
#[derive(Clone)]
pub struct BrothPotProcessingSchedule {
    #[primary_key]
    pub broth_pot_id: u64,
    pub scheduled_at: ScheduleAt,
}

/******************************************************************************
 *                           TRAIT IMPLEMENTATIONS                            *
 ******************************************************************************/

/// --- ItemContainer Implementation for BrothPot ---
impl ItemContainer for BrothPot {
    fn num_slots(&self) -> usize {
        NUM_INGREDIENT_SLOTS
    }

    fn get_slot_instance_id(&self, slot_index: u8) -> Option<u64> {
        if slot_index >= NUM_INGREDIENT_SLOTS as u8 { return None; }
        match slot_index {
            0 => self.ingredient_instance_id_0,
            1 => self.ingredient_instance_id_1,
            2 => self.ingredient_instance_id_2,
            _ => None,
        }
    }

    fn get_slot_def_id(&self, slot_index: u8) -> Option<u64> {
        if slot_index >= NUM_INGREDIENT_SLOTS as u8 { return None; }
        match slot_index {
            0 => self.ingredient_def_id_0,
            1 => self.ingredient_def_id_1,
            2 => self.ingredient_def_id_2,
            _ => None,
        }
    }

    fn set_slot(&mut self, slot_index: u8, instance_id: Option<u64>, def_id: Option<u64>) {
        if slot_index >= NUM_INGREDIENT_SLOTS as u8 { return; }
        match slot_index {
            0 => { self.ingredient_instance_id_0 = instance_id; self.ingredient_def_id_0 = def_id; },
            1 => { self.ingredient_instance_id_1 = instance_id; self.ingredient_def_id_1 = def_id; },
            2 => { self.ingredient_instance_id_2 = instance_id; self.ingredient_def_id_2 = def_id; },
            _ => {},
        }
    }

    fn get_container_type(&self) -> ContainerType {
        ContainerType::BrothPot
    }

    fn get_container_id(&self) -> u64 {
        self.id as u64
    }
}

/// --- Helper struct to implement the ContainerItemClearer trait ---
pub struct BrothPotClearer;

impl ContainerItemClearer for BrothPotClearer {
    fn clear_item(ctx: &ReducerContext, item_instance_id: u64) -> bool {
        clear_item_from_broth_pot_slots(ctx, item_instance_id)
    }
}

/******************************************************************************
 *                             HELPER FUNCTIONS                               *
 ******************************************************************************/

/// --- Broth Pot Interaction Validation ---
/// Validates if a player can interact with a specific broth pot (checks existence and distance).
fn validate_broth_pot_interaction(
    ctx: &ReducerContext,
    broth_pot_id: u32,
) -> Result<(Player, BrothPot), String> {
    let sender_id = ctx.sender;
    let players = ctx.db.player();
    let broth_pots = ctx.db.broth_pot();

    let player = players.identity().find(sender_id)
        .ok_or_else(|| "Player not found".to_string())?;
    let broth_pot = broth_pots.id().find(broth_pot_id)
        .ok_or_else(|| format!("Broth pot {} not found", broth_pot_id))?;

    // Check distance
    let dx = player.position_x - broth_pot.pos_x;
    let dy = player.position_y - broth_pot.pos_y;
    let dist_sq = dx * dx + dy * dy;

    if dist_sq > PLAYER_BROTH_POT_INTERACTION_DISTANCE_SQUARED {
        return Err("Too far away from broth pot".to_string());
    }

    Ok((player, broth_pot))
}

/// --- Clear Item From Broth Pot Slots ---
/// Removes a specific item instance from any broth pot slot it might be in.
pub(crate) fn clear_item_from_broth_pot_slots(ctx: &ReducerContext, item_instance_id_to_clear: u64) -> bool {
    let inventory_table = ctx.db.inventory_item();
    let mut item_found_and_cleared = false;

    for mut broth_pot in ctx.db.broth_pot().iter() {
        let mut broth_pot_modified = false;
        for i in 0..broth_pot.num_slots() as u8 {
            if broth_pot.get_slot_instance_id(i) == Some(item_instance_id_to_clear) {
                log::debug!(
                    "Item {} found in broth pot {} slot {}. Clearing slot.",
                    item_instance_id_to_clear, broth_pot.id, i
                );
                if let Some(mut item) = inventory_table.instance_id().find(item_instance_id_to_clear) {
                    item.location = ItemLocation::Unknown;
                    inventory_table.instance_id().update(item);
                }
                broth_pot.set_slot(i, None, None);
                broth_pot_modified = true;
                item_found_and_cleared = true;
            }
        }
        if broth_pot_modified {
            ctx.db.broth_pot().id().update(broth_pot);
        }
    }
    item_found_and_cleared
}

/// --- Check if Broth Pot is Empty ---
/// Returns true if pot has no water, no ingredients, no output, and no water container
pub(crate) fn is_broth_pot_empty(broth_pot: &BrothPot) -> bool {
    // Check water
    if broth_pot.water_level_ml > 0 {
        return false;
    }
    
    // Check ingredient slots
    for i in 0..NUM_INGREDIENT_SLOTS as u8 {
        if broth_pot.get_slot_instance_id(i).is_some() {
            return false;
        }
    }
    
    // Check water container slot
    if broth_pot.water_container_instance_id.is_some() {
        return false;
    }
    
    // Check output slot
    if broth_pot.output_item_instance_id.is_some() {
        return false;
    }
    
    true
}

/******************************************************************************
 *                           REDUCERS (Placement & Pickup)                    *
 ******************************************************************************/

/// --- Place Broth Pot on Campfire ---
/// Places a broth pot item from player inventory onto a campfire
#[spacetimedb::reducer]
pub fn place_broth_pot_on_campfire(
    ctx: &ReducerContext,
    item_instance_id: u64,
    campfire_id: u32
) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    let players = ctx.db.player();
    let mut campfires = ctx.db.campfire();
    let broth_pots = ctx.db.broth_pot();

    log::info!(
        "[PlaceBrothPot] Player {:?} attempting to place item {} on campfire {}",
        sender_id, item_instance_id, campfire_id
    );

    // --- 1. Validate Player ---
    let player = players.identity().find(sender_id)
        .ok_or_else(|| "Player not found".to_string())?;

    if player.is_dead {
        return Err("Cannot place broth pot while dead.".to_string());
    }
    if player.is_knocked_out {
        return Err("Cannot place broth pot while knocked out.".to_string());
    }

    // --- 2. Validate Campfire ---
    let mut campfire = campfires.id().find(campfire_id)
        .ok_or_else(|| format!("Campfire {} not found", campfire_id))?;

    // Check distance to campfire
    let dx = player.position_x - campfire.pos_x;
    let dy = player.position_y - campfire.pos_y;
    let dist_sq = dx * dx + dy * dy;
    if dist_sq > PLAYER_BROTH_POT_INTERACTION_DISTANCE_SQUARED {
        return Err("Too far away from campfire to place broth pot.".to_string());
    }

    // Check if campfire already has a broth pot
    if campfire.attached_broth_pot_id.is_some() {
        return Err("This campfire already has a broth pot attached.".to_string());
    }

    // --- 3. Validate Item ---
    let broth_pot_def_id = item_defs.iter()
        .find(|def| def.name == "Cerametal Field Cauldron Mk. II")
        .map(|def| def.id)
        .ok_or_else(|| "Item definition for 'Cerametal Field Cauldron Mk. II' not found.".to_string())?;

    let item_to_consume = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item instance {} not found.", item_instance_id))?;

    // Validate ownership and location
    match item_to_consume.location {
        ItemLocation::Inventory(data) => {
            if data.owner_id != sender_id {
                return Err(format!("Item instance {} not owned by player {:?}.", item_instance_id, sender_id));
            }
        }
        ItemLocation::Hotbar(data) => {
            if data.owner_id != sender_id {
                return Err(format!("Item instance {} not owned by player {:?}.", item_instance_id, sender_id));
            }
        }
        _ => {
            return Err(format!("Item instance {} must be in inventory or hotbar to be placed.", item_instance_id));
        }
    }

    if item_to_consume.item_def_id != broth_pot_def_id {
        return Err(format!("Item instance {} is not a Cerametal Field Cauldron Mk. II.", item_instance_id));
    }

    // --- 4. Consume the Item ---
    log::info!(
        "[PlaceBrothPot] Consuming item instance {} from player {:?}",
        item_instance_id, sender_id
    );
    inventory_items.instance_id().delete(item_instance_id);

    // --- 5. Create Broth Pot Entity ---
    let current_time = ctx.timestamp;
    let chunk_idx = calculate_chunk_index(campfire.pos_x, campfire.pos_y);

    // Snap to campfire position (with slight Y offset for visual stacking)
    let pot_pos_x = campfire.pos_x;
    let pot_pos_y = campfire.pos_y - 60.0; // Offset above campfire

    let new_broth_pot = BrothPot {
        id: 0, // Auto-incremented
        pos_x: pot_pos_x,
        pos_y: pot_pos_y,
        chunk_index: chunk_idx,
        placed_by: sender_id,
        placed_at: current_time,
        attached_to_campfire_id: Some(campfire_id),
        
        // Water system - starts empty
        water_level_ml: 0,
        max_water_capacity_ml: MAX_WATER_CAPACITY_ML,
        is_seawater: false,
        is_desalinating: false,
        
        // Ingredient slots - all empty
        ingredient_instance_id_0: None,
        ingredient_def_id_0: None,
        ingredient_instance_id_1: None,
        ingredient_def_id_1: None,
        ingredient_instance_id_2: None,
        ingredient_def_id_2: None,
        
        // Water container slot - empty
        water_container_instance_id: None,
        water_container_def_id: None,
        
        // Cooking state - not cooking
        is_cooking: false,
        current_recipe_name: None,
        cooking_progress_secs: 0.0,
        required_cooking_time_secs: 0.0,
        
        // Stirring - perfect quality at start
        stir_quality: 1.0,
        last_stirred_at: None,
        
        // Output - empty
        output_item_instance_id: None,
        output_item_def_id: None,
        is_spoiled: false,
        
        // Health
        health: BROTH_POT_INITIAL_HEALTH,
        max_health: BROTH_POT_MAX_HEALTH,
        is_destroyed: false,
        destroyed_at: None,
        last_hit_time: None,
        last_damaged_by: None,
    };

    let inserted_pot = broth_pots.try_insert(new_broth_pot)
        .map_err(|e| format!("Failed to insert broth pot entity: {}", e))?;
    let new_pot_id = inserted_pot.id;

    // --- 6. Link Campfire to Broth Pot ---
    campfire.attached_broth_pot_id = Some(new_pot_id);
    campfires.id().update(campfire);

    log::info!(
        "Player {} placed broth pot {} on campfire {} at ({:.1}, {:.1})",
        player.username, new_pot_id, campfire_id, pot_pos_x, pot_pos_y
    );

    // Schedule processing for rain collection
    schedule_next_broth_pot_processing(ctx, new_pot_id)?;

    Ok(())
}

/// --- Pickup Broth Pot ---
/// Picks up a broth pot from a campfire. Water will spill out if present.
#[spacetimedb::reducer]
pub fn pickup_broth_pot(ctx: &ReducerContext, broth_pot_id: u32) -> Result<(), String> {
    let (_player, mut broth_pot) = validate_broth_pot_interaction(ctx, broth_pot_id)?;
    
    // Check if pot has ingredients or output (water can spill)
    let has_ingredients = broth_pot.ingredient_instance_id_0.is_some() ||
                         broth_pot.ingredient_instance_id_1.is_some() ||
                         broth_pot.ingredient_instance_id_2.is_some();
    let has_output = broth_pot.output_item_instance_id.is_some();
    
    if has_ingredients || has_output {
        return Err("Cannot pickup broth pot - it must be empty of ingredients and output (water will spill).".to_string());
    }
    
    // Capture position and water level before clearing for sound effect
    let pot_pos_x = broth_pot.pos_x;
    let pot_pos_y = broth_pot.pos_y;
    let had_water = broth_pot.water_level_ml > 0;
    
    // Get campfire position for dropping water container below it
    let campfire_y = if let Some(campfire_id) = broth_pot.attached_to_campfire_id {
        ctx.db.campfire().id().find(campfire_id)
            .map(|cf| cf.pos_y)
            .unwrap_or(pot_pos_y) // Fallback to pot position if campfire not found
    } else {
        pot_pos_y // Fallback to pot position if no campfire attached
    };
    
    // Check if there's a water container in the slot and drop it if present
    let items = ctx.db.inventory_item();
    if let Some(water_container_instance_id) = broth_pot.water_container_instance_id {
        if let Some(water_container_item) = items.instance_id().find(&water_container_instance_id) {
            // Get item definition for the water container
            let item_defs = ctx.db.item_definition();
            let water_container_def = item_defs.id().find(&water_container_item.item_def_id)
                .ok_or_else(|| "Water container item definition not found.".to_string())?;
            
            // Drop the water container below the campfire (south of it)
            // Pot is 60px above campfire, so drop container at campfire Y + offset to be below campfire
            // Use create_dropped_item_entity_with_data to preserve water content
            if let Err(e) = crate::dropped_item::create_dropped_item_entity_with_data(
                ctx,
                water_container_item.item_def_id,
                water_container_item.quantity,
                pot_pos_x,
                campfire_y + crate::dropped_item::DROP_OFFSET, // Drop below campfire (south)
                water_container_item.item_data.clone(), // Preserve water content data
            ) {
                log::error!("Failed to drop water container {} when picking up broth pot {}: {}", 
                           water_container_instance_id, broth_pot_id, e);
                // Continue anyway - don't fail the pickup if drop fails
            } else {
                log::info!("Dropped water container {} ({}) when picking up broth pot {}", 
                          water_container_instance_id, water_container_def.name, broth_pot_id);
            }
            
            // Delete the inventory item (it's now a dropped item)
            items.instance_id().delete(water_container_instance_id);
        }
    }
    
    // Clear water (spills out)
    broth_pot.water_level_ml = 0;
    broth_pot.is_seawater = false;
    broth_pot.water_container_instance_id = None;
    broth_pot.water_container_def_id = None;
    
    // Get broth pot item definition
    let item_defs = ctx.db.item_definition();
    let broth_pot_def = item_defs.iter()
        .find(|def| def.name == "Cerametal Field Cauldron Mk. II")
        .ok_or_else(|| "Broth pot item definition not found.".to_string())?;
    
    // Add broth pot item to player inventory
    let new_location = find_first_empty_player_slot(ctx, ctx.sender)
        .ok_or_else(|| "Player inventory is full, cannot pickup broth pot.".to_string())?;
    
    let new_pot_item = InventoryItem {
        instance_id: 0, // Auto-inc
        item_def_id: broth_pot_def.id,
        quantity: 1,
        location: new_location,
        item_data: None,
    };
    
    ctx.db.inventory_item().try_insert(new_pot_item)
        .map_err(|e| format!("Failed to insert broth pot item: {}", e))?;
    
    // Clear campfire's broth pot reference
    if let Some(campfire_id) = broth_pot.attached_to_campfire_id {
        if let Some(mut campfire) = ctx.db.campfire().id().find(campfire_id) {
            campfire.attached_broth_pot_id = None;
            ctx.db.campfire().id().update(campfire);
        }
    }
    
    // Remove processing schedule
    ctx.db.broth_pot_processing_schedule().broth_pot_id().delete(broth_pot_id as u64);
    
    // Delete the broth pot entity
    ctx.db.broth_pot().id().delete(broth_pot_id);
    
    // Emit spill sound effect if water was present (client will also play for instant feedback)
    if had_water {
        sound_events::emit_filling_container_sound(ctx, pot_pos_x, pot_pos_y, ctx.sender);
    }
    
    log::info!("Player {:?} picked up broth pot {} (water spilled: {})", ctx.sender, broth_pot_id, had_water);
    Ok(())
}

/******************************************************************************
 *                           REDUCERS (Basic Interaction)                     *
 ******************************************************************************/

/// --- Quick Move to Broth Pot ---
/// Quickly moves an item from player inventory/hotbar to the first available/mergeable slot in the broth pot.
#[spacetimedb::reducer]
pub fn quick_move_to_broth_pot(
    ctx: &ReducerContext,
    broth_pot_id: u32,
    item_instance_id: u64,
) -> Result<(), String> {
    let (_player, mut broth_pot) = validate_broth_pot_interaction(ctx, broth_pot_id)?;
    inventory_management::handle_quick_move_to_container(ctx, &mut broth_pot, item_instance_id)?;
    ctx.db.broth_pot().id().update(broth_pot.clone());
    schedule_next_broth_pot_processing(ctx, broth_pot_id);
    Ok(())
}

/// --- Broth Pot Interaction Check ---
#[spacetimedb::reducer]
pub fn interact_with_broth_pot(ctx: &ReducerContext, broth_pot_id: u32) -> Result<(), String> {
    let (_player, _broth_pot) = validate_broth_pot_interaction(ctx, broth_pot_id)?;
    Ok(())
}

/// --- Move Item to Broth Pot Water Container Slot ---
/// Moves a water container from player inventory to the broth pot's water container slot.
#[spacetimedb::reducer]
pub fn move_item_to_broth_pot_water_container(
    ctx: &ReducerContext,
    broth_pot_id: u32,
    item_instance_id: u64,
) -> Result<(), String> {
    log::info!("Player {} moving item {} to broth pot {} water container slot", 
               ctx.sender, item_instance_id, broth_pot_id);

    // --- Validate interaction ---
    let (_player, mut broth_pot) = validate_broth_pot_interaction(ctx, broth_pot_id)?;

    // --- Check if slot is already occupied ---
    if broth_pot.water_container_instance_id.is_some() {
        return Err("Water container slot is already occupied.".to_string());
    }

    // --- Get item and validate it's a water container ---
    let items = ctx.db.inventory_item();
    let mut item = items.instance_id().find(&item_instance_id)
        .ok_or_else(|| "Item not found.".to_string())?;

    // --- Verify ownership ---
    let owns_item = match &item.location {
        ItemLocation::Inventory(data) => data.owner_id == ctx.sender,
        ItemLocation::Hotbar(data) => data.owner_id == ctx.sender,
        ItemLocation::Equipped(data) => data.owner_id == ctx.sender,
        _ => false,
    };
    
    if !owns_item {
        return Err("You don't own this item.".to_string());
    }

    // --- Get item definition ---
    let item_defs = ctx.db.item_definition();
    let item_def = item_defs.id().find(&item.item_def_id)
        .ok_or_else(|| "Item definition not found.".to_string())?;

    // --- Verify it's a water container ---
    let allowed_items = ["Reed Water Bottle", "Plastic Water Jug"];
    if !allowed_items.contains(&item_def.name.as_str()) {
        return Err(format!("Only water containers can be placed in the water container slot. '{}' is not allowed.", item_def.name));
    }

    // --- Move item to water container slot ---
    broth_pot.water_container_instance_id = Some(item_instance_id);
    broth_pot.water_container_def_id = Some(item.item_def_id);

    // --- Update item location to container ---
    // Use slot_index 0 for water container slot (separate from ingredient slots 0-2)
    item.location = ItemLocation::Container(crate::models::ContainerLocationData {
        container_type: ContainerType::BrothPot,
        container_id: broth_pot.id as u64,
        slot_index: 0, // Water container slot uses index 0
    });
    items.instance_id().update(item);

    // --- Update broth pot ---
    ctx.db.broth_pot().id().update(broth_pot);

    log::info!("Successfully moved {} to broth pot {} water container slot", item_def.name, broth_pot_id);
    Ok(())
}

/// --- Move Item from Broth Pot Water Container Slot ---
/// Moves the water container from the broth pot's water container slot to player inventory/hotbar.
#[spacetimedb::reducer]
pub fn move_item_from_broth_pot_water_container(
    ctx: &ReducerContext,
    broth_pot_id: u32,
    target_slot_type: String,
    target_slot_index: u32,
) -> Result<(), String> {
    log::info!("Player {} moving item from broth pot {} water container slot to {} slot {}", 
               ctx.sender, broth_pot_id, target_slot_type, target_slot_index);

    // --- Validate interaction ---
    let (_player, mut broth_pot) = validate_broth_pot_interaction(ctx, broth_pot_id)?;

    // --- Check if slot has an item ---
    let container_instance_id = broth_pot.water_container_instance_id
        .ok_or_else(|| "Water container slot is empty.".to_string())?;

    // --- Get the item ---
    let items = ctx.db.inventory_item();
    let mut item = items.instance_id().find(&container_instance_id)
        .ok_or_else(|| "Item not found.".to_string())?;

    // --- Clear the slot ---
    broth_pot.water_container_instance_id = None;
    broth_pot.water_container_def_id = None;

    // --- Determine target location and update item location BEFORE calling move functions ---
    // This is necessary because move_item_to_inventory/move_item_to_hotbar reject items in containers
    let target_location = match target_slot_type.as_str() {
        "inventory" => {
            crate::models::ItemLocation::Inventory(crate::models::InventoryLocationData {
                owner_id: ctx.sender,
                slot_index: target_slot_index as u16,
            })
        },
        "hotbar" => {
            crate::models::ItemLocation::Hotbar(crate::models::HotbarLocationData {
                owner_id: ctx.sender,
                slot_index: target_slot_index as u8,
            })
        },
        _ => {
            return Err(format!("Invalid target slot type: {}", target_slot_type));
        }
    };

    // Update item location to target location first (this allows move_item_to_inventory/hotbar to work)
    item.location = target_location.clone();
    items.instance_id().update(item);

    // --- Move item to player inventory/hotbar (now that location is updated, it will pass validation) ---
    match target_slot_type.as_str() {
        "inventory" => {
            crate::player_inventory::move_item_to_inventory(ctx, container_instance_id, target_slot_index as u16)?;
        },
        "hotbar" => {
            crate::player_inventory::move_item_to_hotbar(ctx, container_instance_id, target_slot_index as u8)?;
        },
        _ => {
            return Err(format!("Invalid target slot type: {}", target_slot_type));
        }
    }

    // --- Update broth pot ---
    ctx.db.broth_pot().id().update(broth_pot);

    log::info!("Successfully moved water container from broth pot {} to player {} slot {}", 
               broth_pot_id, target_slot_type, target_slot_index);
    Ok(())
}

/// --- Quick Move from Broth Pot Water Container Slot ---
/// Quickly moves the water container from the broth pot's water container slot to player inventory/hotbar.
#[spacetimedb::reducer]
pub fn quick_move_from_broth_pot_water_container(
    ctx: &ReducerContext,
    broth_pot_id: u32,
) -> Result<(), String> {
    log::info!("Player {} quick moving item from broth pot {} water container slot", 
               ctx.sender, broth_pot_id);

    // --- Validate interaction ---
    let (_player, mut broth_pot) = validate_broth_pot_interaction(ctx, broth_pot_id)?;

    // --- Check if slot has an item ---
    let container_instance_id = broth_pot.water_container_instance_id
        .ok_or_else(|| "Water container slot is empty.".to_string())?;

    // --- Get the item ---
    let items = ctx.db.inventory_item();
    let mut item = items.instance_id().find(&container_instance_id)
        .ok_or_else(|| "Item not found.".to_string())?;

    // --- Clear the slot ---
    broth_pot.water_container_instance_id = None;
    broth_pot.water_container_def_id = None;

    // --- Find first available player slot ---
    let target_location_opt = crate::player_inventory::find_first_empty_player_slot(ctx, ctx.sender);
    
    if let Some(target_location) = target_location_opt {
        // Update item location first
        item.location = target_location.clone();
        items.instance_id().update(item);

        // Move item to player inventory/hotbar
        match target_location {
            ItemLocation::Inventory(ref data) => {
                crate::player_inventory::move_item_to_inventory(ctx, container_instance_id, data.slot_index)?;
            },
            ItemLocation::Hotbar(ref data) => {
                crate::player_inventory::move_item_to_hotbar(ctx, container_instance_id, data.slot_index)?;
            },
            _ => {
                return Err("Invalid target location for quick move.".to_string());
            }
        }
    } else {
        return Err("No available inventory or hotbar slots.".to_string());
    }

    // --- Update broth pot ---
    ctx.db.broth_pot().id().update(broth_pot);

    log::info!("Successfully quick moved water container from broth pot {}", broth_pot_id);
    Ok(())
}

/// --- Quick Move to Broth Pot Water Container Slot ---
/// Quickly moves a water container from player inventory/hotbar to the broth pot's water container slot.
#[spacetimedb::reducer]
pub fn quick_move_to_broth_pot_water_container(
    ctx: &ReducerContext,
    broth_pot_id: u32,
    item_instance_id: u64,
) -> Result<(), String> {
    log::info!("Player {} quick moving item {} to broth pot {} water container slot", 
               ctx.sender, item_instance_id, broth_pot_id);

    // --- Validate interaction ---
    let (_player, mut broth_pot) = validate_broth_pot_interaction(ctx, broth_pot_id)?;

    // --- Check if slot is already occupied ---
    if broth_pot.water_container_instance_id.is_some() {
        return Err("Water container slot is already occupied.".to_string());
    }

    // --- Get item and validate it's a water container ---
    let items = ctx.db.inventory_item();
    let mut item = items.instance_id().find(&item_instance_id)
        .ok_or_else(|| "Item not found.".to_string())?;

    // --- Verify ownership ---
    let owns_item = match &item.location {
        ItemLocation::Inventory(data) => data.owner_id == ctx.sender,
        ItemLocation::Hotbar(data) => data.owner_id == ctx.sender,
        ItemLocation::Equipped(data) => data.owner_id == ctx.sender,
        _ => false,
    };
    
    if !owns_item {
        return Err("You don't own this item.".to_string());
    }

    // --- Get item definition ---
    let item_defs = ctx.db.item_definition();
    let item_def = item_defs.id().find(&item.item_def_id)
        .ok_or_else(|| "Item definition not found.".to_string())?;

    // --- Verify it's a water container ---
    let allowed_items = ["Reed Water Bottle", "Plastic Water Jug"];
    if !allowed_items.contains(&item_def.name.as_str()) {
        return Err(format!("Only water containers can be placed in the water container slot. '{}' is not allowed.", item_def.name));
    }

    // --- Move item to water container slot ---
    broth_pot.water_container_instance_id = Some(item_instance_id);
    broth_pot.water_container_def_id = Some(item.item_def_id);

    // --- Update item location to container ---
    item.location = ItemLocation::Container(crate::models::ContainerLocationData {
        container_type: ContainerType::BrothPot,
        container_id: broth_pot.id as u64,
        slot_index: 0, // Water container slot uses index 0
    });
    items.instance_id().update(item);

    // --- Update broth pot ---
    ctx.db.broth_pot().id().update(broth_pot);

    log::info!("Successfully quick moved {} to broth pot {} water container slot", item_def.name, broth_pot_id);
    Ok(())
}

/// --- Transfer Water from Container to Pot ---
/// Transfers water FROM the water container slot TO the broth pot
/// (Opposite direction of rain collector - rain collector fills container, this empties container into pot)
#[spacetimedb::reducer]
pub fn transfer_water_from_container_to_pot(
    ctx: &ReducerContext,
    broth_pot_id: u32,
) -> Result<(), String> {
    log::info!("Player {} attempting to transfer water from container slot to broth pot {}", 
               ctx.sender, broth_pot_id);

    // --- Validate interaction ---
    let (_player, mut broth_pot) = validate_broth_pot_interaction(ctx, broth_pot_id)?;

    // --- Check if water container slot has an item ---
    let container_instance_id = broth_pot.water_container_instance_id
        .ok_or_else(|| "No water container in slot.".to_string())?;

    // --- Get the water container item ---
    let items = ctx.db.inventory_item();
    let mut container_item = items.instance_id().find(&container_instance_id)
        .ok_or_else(|| "Water container not found.".to_string())?;

    // --- Get item definition ---
    let item_defs = ctx.db.item_definition();
    let container_def = item_defs.id().find(&container_item.item_def_id)
        .ok_or_else(|| "Item definition not found.".to_string())?;

    // --- Verify it's a water container ---
    let allowed_items = ["Reed Water Bottle", "Plastic Water Jug"];
    if !allowed_items.contains(&container_def.name.as_str()) {
        return Err(format!("Only water containers can be used. '{}' is not allowed.", container_def.name));
    }

    // --- Get current water content from container ---
    let container_water_ml = crate::items::get_water_content(&container_item)
        .unwrap_or(0.0) * 1000.0; // Convert liters to ml

    if container_water_ml <= 0.0 {
        return Err("Water container is empty.".to_string());
    }

    // --- Calculate how much water can fit in the pot ---
    let available_capacity_ml = (broth_pot.max_water_capacity_ml - broth_pot.water_level_ml) as f32;
    
    if available_capacity_ml <= 0.0 {
        return Err("Broth pot is already full.".to_string());
    }

    // --- Transfer water (limited by container content and pot capacity) ---
    let water_to_transfer_ml = container_water_ml.min(available_capacity_ml);
    let new_pot_water_ml = broth_pot.water_level_ml as f32 + water_to_transfer_ml;
    broth_pot.water_level_ml = new_pot_water_ml as u32;

    // --- Capture values before move ---
    let pot_pos_x = broth_pot.pos_x;
    let pot_pos_y = broth_pot.pos_y;
    let max_capacity_ml = broth_pot.max_water_capacity_ml;
    
    // --- Check if container had seawater (for desalination tracking) ---
    // Note: We'll need to track this when containers are filled, but for now assume fresh water
    // TODO: Track seawater when containers are filled from salt water sources
    let was_seawater = false; // Placeholder - should check container's seawater flag if we add it

    // --- Update seawater status if transferring seawater ---
    if was_seawater {
        broth_pot.is_seawater = true;
    }

    // --- Empty the container ---
    let remaining_container_water_l = (container_water_ml - water_to_transfer_ml) / 1000.0;
    crate::items::set_water_content(&mut container_item, remaining_container_water_l)?;
    items.instance_id().update(container_item);

    // --- Update the broth pot ---
    ctx.db.broth_pot().id().update(broth_pot);

    // --- Emit filling sound effect ---
    sound_events::emit_filling_container_sound(ctx, pot_pos_x, pot_pos_y, ctx.sender);

    // --- Re-schedule processing if needed ---
    schedule_next_broth_pot_processing(ctx, broth_pot_id)?;

    log::info!("Successfully transferred {:.1}ml from {} to broth pot {} (now has {:.1}ml/{:.1}ml)", 
               water_to_transfer_ml, container_def.name, broth_pot_id, 
               new_pot_water_ml, max_capacity_ml);

    Ok(())
}

/// --- Scheduled Processing ---
/// Handles cooking logic, stirring decay, and rain collection
#[spacetimedb::reducer]
pub fn process_broth_pot_logic_scheduled(
    ctx: &ReducerContext,
    schedule_args: BrothPotProcessingSchedule
) -> Result<(), String> {
    // Security check
    if ctx.sender != ctx.identity() {
        return Err("Unauthorized scheduler invocation".to_string());
    }
    
    let broth_pot_id = schedule_args.broth_pot_id as u32;
    let mut broth_pot = ctx.db.broth_pot().id().find(broth_pot_id)
        .ok_or_else(|| format!("Broth pot {} not found", broth_pot_id))?;
    
    if broth_pot.is_destroyed {
        // Remove schedule if pot is destroyed
        ctx.db.broth_pot_processing_schedule().broth_pot_id().delete(schedule_args.broth_pot_id);
        return Ok(());
    }
    
    // Calculate elapsed time since last processing (approximately 1 second per tick)
    let elapsed_seconds = 1.0; // BROTH_POT_PROCESS_INTERVAL_SECS
    
    // --- Rain Collection ---
    // Check if it's raining at the broth pot's location
    let chunk_weather = get_weather_for_position(ctx, broth_pot.pos_x, broth_pot.pos_y);
    
    if chunk_weather.current_weather != WeatherType::Clear {
        // Get collection rate based on weather type
        let collection_rate_ml_per_sec = match chunk_weather.current_weather {
            WeatherType::LightRain => LIGHT_RAIN_COLLECTION_RATE_ML_PER_SEC,
            WeatherType::ModerateRain => MODERATE_RAIN_COLLECTION_RATE_ML_PER_SEC,
            WeatherType::HeavyRain => HEAVY_RAIN_COLLECTION_RATE_ML_PER_SEC,
            WeatherType::HeavyStorm => HEAVY_STORM_COLLECTION_RATE_ML_PER_SEC,
            WeatherType::Clear => 0.0, // Already handled above
        };
        
        if collection_rate_ml_per_sec > 0.0 {
            // Calculate water to add this tick
            let water_to_add_ml = collection_rate_ml_per_sec * elapsed_seconds;
            
            if water_to_add_ml > 0.0 {
                // Add water, respecting capacity limit
                let current_water = broth_pot.water_level_ml as f32;
                let new_water = (current_water + water_to_add_ml).min(broth_pot.max_water_capacity_ml as f32);
                broth_pot.water_level_ml = new_water as u32;
                
                log::debug!("[BrothPot] Pot {} collected {:.1}ml during {:?}. Water: {:.1}ml/{:.1}ml", 
                           broth_pot_id, water_to_add_ml, chunk_weather.current_weather, 
                           broth_pot.water_level_ml, broth_pot.max_water_capacity_ml);
            }
        }
    }
    
    // TODO: Implement cooking logic, stirring decay, etc. (Phase 7)
    
    // Update the broth pot
    ctx.db.broth_pot().id().update(broth_pot);
    
    // Re-schedule if still needs processing
    schedule_next_broth_pot_processing(ctx, broth_pot_id)?;
    
    Ok(())
}

/// --- Schedule Next Processing ---
/// Schedules or re-schedules the main processing logic for a broth pot.
#[spacetimedb::reducer]
pub fn schedule_next_broth_pot_processing(ctx: &ReducerContext, broth_pot_id: u32) -> Result<(), String> {
    let mut schedules = ctx.db.broth_pot_processing_schedule();
    let broth_pot_opt = ctx.db.broth_pot().id().find(broth_pot_id);

    // If broth pot doesn't exist or is destroyed, remove schedule
    if broth_pot_opt.is_none() || broth_pot_opt.as_ref().map_or(false, |bp| bp.is_destroyed) {
        schedules.broth_pot_id().delete(broth_pot_id as u64);
        return Ok(());
    }

    let broth_pot = broth_pot_opt.unwrap();

    // Schedule if cooking, desalinating, OR if pot has capacity for rain collection
    let needs_processing = broth_pot.is_cooking || 
                          broth_pot.is_desalinating || 
                          (broth_pot.water_level_ml < broth_pot.max_water_capacity_ml);

    if needs_processing {
        let interval = TimeDuration::from_micros((BROTH_POT_PROCESS_INTERVAL_SECS * 1_000_000) as i64);
        let schedule_entry = BrothPotProcessingSchedule {
            broth_pot_id: broth_pot_id as u64,
            scheduled_at: interval.into(),
        };

        if schedules.broth_pot_id().find(broth_pot_id as u64).is_some() {
            let mut existing_schedule = schedules.broth_pot_id().find(broth_pot_id as u64).unwrap();
            existing_schedule.scheduled_at = interval.into();
            schedules.broth_pot_id().update(existing_schedule);
        } else {
            match schedules.try_insert(schedule_entry) {
                Ok(_) => log::debug!("[BrothPot] Scheduled processing for pot {}", broth_pot_id),
                Err(e) => log::error!("[BrothPot] Failed to schedule pot {}: {}", broth_pot_id, e),
            }
        }
    } else {
        // Not cooking/desalinating, remove schedule
        schedules.broth_pot_id().delete(broth_pot_id as u64);
    }

    Ok(())
}

