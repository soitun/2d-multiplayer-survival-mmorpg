/******************************************************************************
 *                                                                            *
 * Defines the SleepingBag entity, its data structure, and associated logic.  *
 * Handles placing the sleeping bag, interaction checks, and picking it up.   *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{Identity, ReducerContext, Table, Timestamp, TimeDuration, ScheduleAt};
use log;
use rand::Rng;

// --- Constants --- 
pub(crate) const SLEEPING_BAG_COLLISION_RADIUS: f32 = 18.0; // Width approx 36
pub(crate) const SLEEPING_BAG_COLLISION_Y_OFFSET: f32 = 5.0; // Low profile
pub(crate) const PLAYER_SLEEPING_BAG_COLLISION_DISTANCE_SQUARED: f32 = (super::PLAYER_RADIUS + SLEEPING_BAG_COLLISION_RADIUS) * (super::PLAYER_RADIUS + SLEEPING_BAG_COLLISION_RADIUS);
const SLEEPING_BAG_INTERACTION_DISTANCE_SQUARED: f32 = 64.0 * 64.0; // Same as box/campfire
pub(crate) const SLEEPING_BAG_SLEEPING_BAG_COLLISION_DISTANCE_SQUARED: f32 = (SLEEPING_BAG_COLLISION_RADIUS * 2.0) * (SLEEPING_BAG_COLLISION_RADIUS * 2.0);
const PLACEMENT_RANGE_SQ: f32 = 128.0 * 128.0; // Increased placement range for 96x96 sleeping bag

// --- Deterioration Constants ---
const SLEEPING_BAG_DETERIORATION_CHECK_INTERVAL_SECS: i64 = 3600; // Check every hour
const SLEEPING_BAG_DETERIORATION_DAMAGE_PER_HOUR: f32 = 250.0 / 24.0; // ~10.42 health per hour (takes 24 hours to fully deteriorate)
const TREE_PROTECTION_DISTANCE_SQ: f32 = 100.0 * 100.0; // 100px protection radius (same as campfire)

// --- Import Dependencies ---
use crate::environment::calculate_chunk_index;
use crate::sleeping_bag::sleeping_bag as SleepingBagTableTrait; // Import self trait
use crate::Player; // Import Player struct directly from crate root
use crate::player as PlayerTableTrait; // Import the trait for ctx.db.player()
use crate::items::{
    InventoryItem, ItemDefinition,
    inventory_item as InventoryItemTableTrait, 
    item_definition as ItemDefinitionTableTrait,
    add_item_to_player_inventory, // For pickup
};
// Remove Filter imports as they are gated behind unstable feature
// use spacetimedb::{client_visibility_filter, Filter}; 
// Add imports needed for inventory/item logic
use crate::active_equipment; 
use crate::crafting_queue;
use crate::models::{ItemLocation, EquipmentSlotType}; // Removed PlayerActivity
use crate::player_stats::{PLAYER_STARTING_HUNGER, PLAYER_STARTING_THIRST};
use crate::tree::tree as TreeTableTrait;
use crate::shelter::shelter as ShelterTableTrait;
use crate::sleeping_bag::sleeping_bag_deterioration_schedule as SleepingBagDeteriorationScheduleTableTrait;

/// --- Sleeping Bag Data Structure ---
/// Represents a placed sleeping bag in the world.
#[spacetimedb::table(name = sleeping_bag, public)]
#[derive(Clone)]
pub struct SleepingBag {
    #[primary_key]
    #[auto_inc]
    pub id: u32, // Unique identifier

    pub pos_x: f32,
    pub pos_y: f32,
    pub chunk_index: u32, 

    pub placed_by: Identity, // Who placed this sleeping bag
    pub placed_at: Timestamp, // When it was placed
    // Add future fields here (e.g., is_occupied, owner_identity for respawn)

    // --- Destruction Fields ---
    pub health: f32,
    pub max_health: f32,
    pub is_destroyed: bool,
    pub destroyed_at: Option<Timestamp>,
    pub last_hit_time: Option<Timestamp>,
}

/// --- Row-Level Security Filter ---
/// Clients can only subscribe to sleeping bags they placed themselves.
// Temporarily disable the filter due to potential host stack overflow
// #[client_visibility_filter]
// const ONLY_OWNED_SLEEPING_BAGS: Filter = Filter::Sql("SELECT * FROM sleeping_bag WHERE placed_by = :sender");

/// --- Deterioration Schedule Table ---
/// Schedules periodic deterioration checks for sleeping bags
#[spacetimedb::table(name = sleeping_bag_deterioration_schedule, scheduled(process_sleeping_bag_deterioration))]
#[derive(Clone)]
pub struct SleepingBagDeteriorationSchedule {
    #[primary_key]
    pub sleeping_bag_id: u64, // Links to SleepingBag.id (u64 required for scheduled tables)
    pub scheduled_at: ScheduleAt,
}

/******************************************************************************
 *                                REDUCERS                                    *
 ******************************************************************************/

/// --- Place Sleeping Bag ---
/// Places a sleeping bag from the player's inventory into the world.
#[spacetimedb::reducer]
pub fn place_sleeping_bag(ctx: &ReducerContext, item_instance_id: u64, world_x: f32, world_y: f32) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    let players = ctx.db.player();
    let sleeping_bags = ctx.db.sleeping_bag(); 

    log::info!(
        "[PlaceSleepingBag] Player {:?} attempting placement of item {} at ({:.1}, {:.1})",
        sender_id, item_instance_id, world_x, world_y
    );

    // Check if position is within monument zones (ALK stations, rune stones, hot springs, quarries)
    crate::building::check_monument_zone_placement(ctx, world_x, world_y)?;

    // 1. Find the 'Sleeping Bag' Item Definition ID
    let bag_def_id = item_defs.iter()
        .find(|def| def.name == "Sleeping Bag")
        .map(|def| def.id)
        .ok_or_else(|| "Sleeping Bag definition not found.".to_string())?;

    // 2. Find the specific item instance and validate
    let item_to_consume = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item instance {} not found.", item_instance_id))?;
    
    // Validate ownership and location
    let is_owned_and_in_player_slots = match &item_to_consume.location {
        ItemLocation::Inventory(crate::models::InventoryLocationData { owner_id, .. }) => *owner_id == sender_id,
        ItemLocation::Hotbar(crate::models::HotbarLocationData { owner_id, .. }) => *owner_id == sender_id,
        _ => false,
    };

    if !is_owned_and_in_player_slots {
        return Err(format!(
            "Item instance {} must be in your inventory or hotbar to be placed. Location: {:?}", 
            item_instance_id, item_to_consume.location
        ));
    }

    if item_to_consume.item_def_id != bag_def_id {
        return Err(format!("Item instance {} is not a Sleeping Bag.", item_instance_id));
    }

    // 3. Validate Placement Distance
    if let Some(player) = players.identity().find(sender_id) {
        let dx = player.position_x - world_x;
        let dy = player.position_y - world_y;
        if (dx * dx + dy * dy) > PLACEMENT_RANGE_SQ {
            return Err("Placement location is too far away.".to_string());
        }
    } else {
        return Err("Could not find player data.".to_string());
    }

    // 4. Check if placement position is on a wall
    if crate::building::is_position_on_wall(ctx, world_x, world_y) {
        return Err("Cannot place sleeping bag on a wall.".to_string());
    }

    // Check if placement position is on water (including hot springs)
    if crate::environment::is_position_on_water(ctx, world_x, world_y) {
        return Err("Cannot place sleeping bag on water.".to_string());
    }

    // 5. Validate Collision with other Sleeping Bags
    for other_bag in sleeping_bags.iter() {
        let dx = world_x - other_bag.pos_x;
        let dy = world_y - other_bag.pos_y;
        if (dx * dx + dy * dy) < SLEEPING_BAG_SLEEPING_BAG_COLLISION_DISTANCE_SQUARED {
            return Err("Cannot place sleeping bag too close to another.".to_string());
        }
    }
    // 5b. Check overlap with ALL placeables (campfires, furnaces, stashes, etc.)
    crate::placeable_collision::check_placeable_overlap(ctx, world_x, world_y, 48.0, 48.0)?;

    // 6. Consume the Item
    log::info!(
        "[PlaceSleepingBag] Consuming item instance {} from player {:?}",
        item_instance_id, sender_id
    );
    inventory_items.instance_id().delete(item_instance_id);

    // 6. Create the SleepingBag Entity
    let chunk_idx = calculate_chunk_index(world_x, world_y);
    // Adjust Y position to compensate for client-side bottom-center anchoring
    // Client renders at posY - drawHeight, so we add half height to center on click position
    let adjusted_y = world_y + 48.0; // Half of SLEEPING_BAG_HEIGHT (96/2 = 48)
    let new_bag = SleepingBag {
        id: 0, // Auto-incremented
        pos_x: world_x,
        pos_y: adjusted_y,
        chunk_index: chunk_idx,
        placed_by: sender_id,
        placed_at: ctx.timestamp,
        // --- Destruction Fields Initialization ---
        health: 250.0,
        max_health: 250.0,
        is_destroyed: false,
        destroyed_at: None,
        last_hit_time: None,
    };
    let inserted_bag = sleeping_bags.insert(new_bag);
    
    // Schedule deterioration processing for the new sleeping bag
    schedule_sleeping_bag_deterioration(ctx, inserted_bag.id as u64);

    log::info!(
        "[PlaceSleepingBag] Successfully placed Sleeping Bag {} at ({:.1}, {:.1}) by {:?}",
        inserted_bag.id, world_x, world_y, sender_id
    );
    
    // Track quest progress for sleeping bag placement
    if let Err(e) = crate::quests::track_quest_progress(
        ctx,
        sender_id,
        crate::quests::QuestObjectiveType::PlaceSleepingBag,
        None,
        1,
    ) {
        log::error!("Failed to track quest progress for sleeping bag placement: {}", e);
    }

    Ok(())
}

/// --- Respawn at Sleeping Bag ---
/// Allows a dead player to respawn at a sleeping bag they placed.
#[spacetimedb::reducer]
pub fn respawn_at_sleeping_bag(ctx: &ReducerContext, bag_id: u32) -> Result<(), String> {
    let sender_id = ctx.sender;
    let players = ctx.db.player();
    let sleeping_bags = ctx.db.sleeping_bag();
    let item_defs = ctx.db.item_definition();
    let inventory = ctx.db.inventory_item();

    log::info!(
        "[RespawnAtSleepingBag] Player {:?} attempting respawn at bag {}",
        sender_id, bag_id
    );

    // 1. Find Player and check if dead
    let mut player = players.identity().find(sender_id)
        .ok_or_else(|| "Player not found".to_string())?;

    if !player.is_dead {
        return Err("Player is not dead.".to_string());
    }

    // 2. Find Sleeping Bag
    let sleeping_bag = sleeping_bags.id().find(bag_id)
        .ok_or_else(|| format!("Sleeping Bag {} not found", bag_id))?;

    // 3. Verify Ownership
    if sleeping_bag.placed_by != sender_id {
        return Err("Cannot respawn at a sleeping bag you didn't place.".to_string());
    }

    log::info!(
        "Respawning player {} ({:?}) at sleeping bag {}. Clearing inventory and crafting queue...", 
        player.username, sender_id, bag_id
    );

    // --- Safeguard - Clear Player Inventory AGAIN ---
    let mut items_to_delete = Vec::new();
    for item in inventory.iter().filter(|item| {
        match &item.location {
            ItemLocation::Inventory(crate::models::InventoryLocationData { owner_id, .. }) => *owner_id == sender_id,
            ItemLocation::Hotbar(crate::models::HotbarLocationData { owner_id, .. }) => *owner_id == sender_id,
            ItemLocation::Equipped(crate::models::EquippedLocationData { owner_id, .. }) => *owner_id == sender_id,
            _ => false, // Only clear items directly associated with the player's active slots
        }
    }) {
        items_to_delete.push(item.instance_id);
    }
    let delete_count = items_to_delete.len();
    if delete_count > 0 {
        log::warn!("[Respawn Safeguard] Found {} items still associated with player {:?} during respawn at bag. Deleting them now.", delete_count, sender_id);
        for item_instance_id in items_to_delete {
            if !inventory.instance_id().delete(item_instance_id) {
                log::error!("[Respawn Safeguard] Failed to delete leftover item instance {} for player {:?}.", item_instance_id, sender_id);
            }
        }
    }
    // --- END Safeguard ---

    // --- Clear Crafting Queue & Refund ---
    crafting_queue::clear_player_crafting_queue(ctx, sender_id);

    // --- Grant Starting Items (using centralized function) ---
    log::info!("Granting starting items to respawned player: {}", player.username);
    match crate::starting_items::grant_starting_items(ctx, sender_id, &player.username) {
        Ok(_) => {
            log::info!("Successfully granted starting items to respawned player: {}", player.username);
        }
        Err(e) => {
            log::error!("Error granting starting items to respawned player {}: {}", player.username, e);
            // Continue with respawn even if item granting fails
        }
    }
    // --- End Grant Starting Items ---

    // 4. Respawn Player at Bag Location (Reset stats)
    player.is_dead = false;
    player.health = crate::player_stats::PLAYER_MAX_HEALTH; // Use fully qualified path
    player.position_x = sleeping_bag.pos_x;
    player.position_y = sleeping_bag.pos_y;
    player.death_timestamp = None; // Clear death timestamp
    // Reset other stats like in respawn_randomly
    player.hunger = PLAYER_STARTING_HUNGER;
    player.thirst = PLAYER_STARTING_THIRST;
    player.warmth = 100.0;
    player.stamina = 100.0;
    player.insanity = 0.0; // Reset insanity on respawn
    player.shard_carry_start_time = None; // Reset shard carry time on respawn
    player.jump_start_time_ms = 0;
    player.is_sprinting = false;
    player.last_hit_time = None;
    player.is_torch_lit = false; // Ensure torch is unlit on respawn
    player.is_knocked_out = false; // Reset knocked out state
    player.knocked_out_at = None; // Clear knocked out timestamp
    player.is_aiming_throw = false; // Reset throw-aiming state
    player.direction = "down".to_string(); // Reset direction
    
    // CRITICAL FIX: Reset client movement sequence to force position sync
    // This prevents client-side prediction from overriding the respawn position
    player.client_movement_sequence = 0;
    
    // Also reset water status since we're spawning at sleeping bag (land)
    player.is_on_water = false;
    
    // Update timestamps
    player.last_update = ctx.timestamp;
    player.last_stat_update = ctx.timestamp;
    player.last_respawn_time = ctx.timestamp; // Track respawn time for fat accumulation

    players.identity().update(player);

    // Ensure item is unequipped on respawn
    match crate::active_equipment::clear_active_item_reducer(ctx, sender_id) {
        Ok(_) => log::info!("Ensured active item is cleared for respawned player {:?}", sender_id),
        Err(e) => log::error!("Failed to clear active item for respawned player {:?}: {}", sender_id, e),
    }

    log::info!(
        "[RespawnAtSleepingBag] Player {:?} respawned successfully at bag {} ({:.1}, {:.1})",
        sender_id, bag_id, sleeping_bag.pos_x, sleeping_bag.pos_y
    );

    Ok(())
}

/// --- Interact with Sleeping Bag ---
/// Basic interaction check (currently just distance).
#[spacetimedb::reducer]
pub fn interact_with_sleeping_bag(ctx: &ReducerContext, bag_id: u32) -> Result<(), String> {
    validate_sleeping_bag_interaction(ctx, bag_id)?; // Use helper for validation
    log::debug!("Player {:?} interaction check OK for sleeping bag {}", ctx.sender, bag_id);
    // Currently no action on interact, but check succeeds if close enough.
    Ok(())
}

/// --- Scheduled Deterioration Processing ---
/// Processes deterioration for a sleeping bag if it's not protected.
/// This reducer is called periodically for each sleeping bag.
#[spacetimedb::reducer]
pub fn process_sleeping_bag_deterioration(ctx: &ReducerContext, schedule_args: SleepingBagDeteriorationSchedule) -> Result<(), String> {
    // Security check: only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("process_sleeping_bag_deterioration may only be called by the scheduler.".to_string());
    }

    let bag_id = schedule_args.sleeping_bag_id as u32; // Convert from u64 to u32 for lookup
    let sleeping_bags = ctx.db.sleeping_bag();
    
    // Find the sleeping bag
    let mut sleeping_bag = match sleeping_bags.id().find(bag_id) {
        Some(bag) => bag,
        None => {
            // Sleeping bag was destroyed or removed, clean up schedule
            log::debug!("[SleepingBagDeterioration] Sleeping bag {} not found, removing schedule.", bag_id);
            ctx.db.sleeping_bag_deterioration_schedule().sleeping_bag_id().delete(schedule_args.sleeping_bag_id);
            return Ok(());
        }
    };

    // Skip if already destroyed
    if sleeping_bag.is_destroyed {
        log::debug!("[SleepingBagDeterioration] Sleeping bag {} is destroyed, removing schedule.", bag_id);
        ctx.db.sleeping_bag_deterioration_schedule().sleeping_bag_id().delete(schedule_args.sleeping_bag_id);
        return Ok(());
    }

    // Check if sleeping bag is protected (indoors or under tree)
    let is_protected = is_sleeping_bag_protected(ctx, &sleeping_bag);

    if !is_protected {
        // Apply deterioration damage
        sleeping_bag.health -= SLEEPING_BAG_DETERIORATION_DAMAGE_PER_HOUR;
        
        log::debug!(
            "[SleepingBagDeterioration] Sleeping bag {} took {:.2} damage (health: {:.2}/{:.2})",
            bag_id, SLEEPING_BAG_DETERIORATION_DAMAGE_PER_HOUR, sleeping_bag.health, sleeping_bag.max_health
        );

        // Check if destroyed
        if sleeping_bag.health <= 0.0 {
            sleeping_bag.health = 0.0;
            sleeping_bag.is_destroyed = true;
            sleeping_bag.destroyed_at = Some(ctx.timestamp);
            log::info!(
                "[SleepingBagDeterioration] Sleeping bag {} has deteriorated completely and been destroyed.",
                bag_id
            );
            sleeping_bags.id().update(sleeping_bag);
            // Remove schedule when destroyed
            ctx.db.sleeping_bag_deterioration_schedule().sleeping_bag_id().delete(schedule_args.sleeping_bag_id);
            return Ok(());
        }
        
        sleeping_bags.id().update(sleeping_bag);
    } else {
        log::debug!(
            "[SleepingBagDeterioration] Sleeping bag {} is protected, no deterioration.",
            bag_id
        );
    }

    // Reschedule for next check
    schedule_sleeping_bag_deterioration(ctx, schedule_args.sleeping_bag_id);

    Ok(())
}

/******************************************************************************
 *                             HELPER FUNCTIONS                               *
 ******************************************************************************/

/// --- Validate Sleeping Bag Interaction ---
/// Checks if a player is close enough to interact with a specific sleeping bag.
fn validate_sleeping_bag_interaction(
    ctx: &ReducerContext,
    bag_id: u32,
) -> Result<(Player, SleepingBag), String> {
    let sender_id = ctx.sender;
    let players = ctx.db.player();
    let sleeping_bags = ctx.db.sleeping_bag();

    let player = players.identity().find(sender_id)
        .ok_or_else(|| "Player not found".to_string())?;
    let sleeping_bag = sleeping_bags.id().find(bag_id)
        .ok_or_else(|| format!("Sleeping Bag {} not found", bag_id))?;

    if sleeping_bag.is_destroyed {
        return Err(format!("Sleeping Bag {} is destroyed.", bag_id));
    }

    // Check distance
    let dx = player.position_x - sleeping_bag.pos_x;
    let dy = player.position_y - sleeping_bag.pos_y;
    if (dx * dx + dy * dy) > SLEEPING_BAG_INTERACTION_DISTANCE_SQUARED {
        return Err("Too far away".to_string());
    }
    Ok((player, sleeping_bag))
}

/// --- Check if Sleeping Bag is Protected ---
/// Returns true if the sleeping bag is protected from deterioration by:
/// - Being inside a shelter
/// - Being inside an enclosed building
/// - Being near a tree (within 100px)
fn is_sleeping_bag_protected(ctx: &ReducerContext, sleeping_bag: &SleepingBag) -> bool {
    // Check if inside any shelter
    for shelter in ctx.db.shelter().iter() {
        if shelter.is_destroyed {
            continue;
        }
        
        // Use the same shelter collision detection logic as in shelter.rs
        let shelter_aabb_center_x = shelter.pos_x;
        let shelter_aabb_center_y = shelter.pos_y - crate::shelter::SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y;
        let aabb_left = shelter_aabb_center_x - crate::shelter::SHELTER_AABB_HALF_WIDTH;
        let aabb_right = shelter_aabb_center_x + crate::shelter::SHELTER_AABB_HALF_WIDTH;
        let aabb_top = shelter_aabb_center_y - crate::shelter::SHELTER_AABB_HALF_HEIGHT;
        let aabb_bottom = shelter_aabb_center_y + crate::shelter::SHELTER_AABB_HALF_HEIGHT;
        
        // Check if sleeping bag position is inside shelter AABB
        if sleeping_bag.pos_x >= aabb_left && sleeping_bag.pos_x <= aabb_right &&
           sleeping_bag.pos_y >= aabb_top && sleeping_bag.pos_y <= aabb_bottom {
            return true;
        }
    }
    
    // Check if inside an enclosed building
    if crate::building_enclosure::is_position_inside_building(ctx, sleeping_bag.pos_x, sleeping_bag.pos_y) {
        return true;
    }
    
    // Check if within 100px of any tree (protected by tree cover)
    for tree in ctx.db.tree().iter() {
        // Skip destroyed trees (respawn_at > UNIX_EPOCH when tree is harvested)
        if tree.respawn_at > Timestamp::UNIX_EPOCH {
            continue;
        }
        
        // Calculate distance squared between sleeping bag and tree
        let dx = sleeping_bag.pos_x - tree.pos_x;
        let dy = sleeping_bag.pos_y - tree.pos_y;
        let distance_squared = dx * dx + dy * dy;
        
        if distance_squared <= TREE_PROTECTION_DISTANCE_SQ {
            return true;
        }
    }
    
    false
}

/// --- Schedule Sleeping Bag Deterioration ---
/// Schedules or re-schedules the deterioration processing for a sleeping bag.
pub(crate) fn schedule_sleeping_bag_deterioration(ctx: &ReducerContext, bag_id: u64) {
    let schedules = ctx.db.sleeping_bag_deterioration_schedule();
    let interval = TimeDuration::from_micros(SLEEPING_BAG_DETERIORATION_CHECK_INTERVAL_SECS * 1_000_000);
    
    // Check if schedule already exists
    if let Some(mut existing_schedule) = schedules.sleeping_bag_id().find(bag_id) {
        // Update existing schedule
        existing_schedule.scheduled_at = ScheduleAt::Interval(interval);
        schedules.sleeping_bag_id().update(existing_schedule);
        log::debug!("[ScheduleSleepingBagDeterioration] Updated deterioration schedule for sleeping bag {}.", bag_id);
    } else {
        // Insert new schedule
        let schedule_entry = SleepingBagDeteriorationSchedule {
            sleeping_bag_id: bag_id,
            scheduled_at: ScheduleAt::Interval(interval),
        };
        match schedules.try_insert(schedule_entry) {
            Ok(_) => log::debug!("[ScheduleSleepingBagDeterioration] Scheduled deterioration for sleeping bag {}.", bag_id),
            Err(e) => log::warn!("[ScheduleSleepingBagDeterioration] Failed to schedule deterioration for sleeping bag {}: {:?}", bag_id, e),
        }
    }
}