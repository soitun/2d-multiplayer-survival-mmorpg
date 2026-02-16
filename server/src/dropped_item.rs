//! # Dropped Item System
//! 
//! This module handles items that are dropped in the world and provides automatic
//! inventory overflow handling. When a player's inventory is full and they attempt
//! to pick up items or harvest resources, those items are automatically dropped
//! near the player instead of being lost.
//!
//! ## Key Features:
//! - Players can pick up dropped items if they're close enough
//! - Items automatically despawn after their configured respawn time
//! - **Automatic dropping**: When inventory is full, items are dropped near the player
//! - Public API for other modules to give items with fallback dropping

use spacetimedb::{Identity, ReducerContext, SpacetimeType, Table, Timestamp, TimeDuration};
use log;
// Use the specific import path from Blackholio
use spacetimedb::spacetimedb_lib::ScheduleAt;
// Import Duration for interval
use std::time::Duration;
// Import for random drop offset
use rand::{Rng, SeedableRng};

// Import necessary items from other modules
// Need to use the generated table trait alias for InventoryItemTable operations
use crate::items::inventory_item as InventoryItemTableTrait;
use crate::items::item_definition as ItemDefinitionTableTrait; // Import ItemDefinition trait
use crate::player as PlayerTableTrait; // Import Player trait
use crate::items::{add_item_to_player_inventory, add_item_to_player_inventory_with_data, InventoryItem, ItemDefinition};
// Corrected imports for Player and PLAYER_RADIUS from crate root
use crate::{Player, PLAYER_RADIUS}; 
use crate::utils::get_distance_squared; // Assuming a utility function for distance
use crate::environment::calculate_chunk_index; // Assuming helper is here or in utils
use crate::active_equipment::active_equipment as ActiveEquipmentTableTrait; // For dropping active weapon on death

// Define the table for items dropped in the world
#[spacetimedb::table(name = dropped_item, public)]
#[derive(Clone, Debug)]
pub struct DroppedItem {
    #[primary_key]
    #[auto_inc]
    pub id: u64,               // Unique ID for this dropped item instance
    pub item_def_id: u64,      // Links to ItemDefinition table
    pub quantity: u32,         // How many of this item are in the sack
    pub pos_x: f32,            // World X position (final landing position)
    pub pos_y: f32,            // World Y position (final landing position)
    #[index(btree)]
    pub chunk_index: u32,      // <<< ADDED chunk_index
    pub created_at: Timestamp, // When the item was dropped (for potential cleanup)
    pub item_data: Option<String>, // <<< ADDED: JSON data from original item (preserves water content, etc.)
    // Arc animation fields - for items that fall from a height (e.g., fruits from trees)
    pub spawn_x: Option<f32>,  // Starting X position for arc animation (None = no animation)
    pub spawn_y: Option<f32>,  // Starting Y position for arc animation (None = no animation)
}

// --- Schedule Table --- 
// Link reducer via scheduled(), remove public for now, ensure field is scheduled_at
#[spacetimedb::table(name = dropped_item_despawn_schedule, scheduled(despawn_expired_items))]
#[derive(Clone)]
pub struct DroppedItemDespawnSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64, 
    pub scheduled_at: ScheduleAt, 
}

// Constants
const PICKUP_RADIUS: f32 = 120.0; // Balanced range: 87% increase from original 64px, won't override nearby placeables
const PICKUP_RADIUS_SQUARED: f32 = PICKUP_RADIUS * PICKUP_RADIUS;
pub(crate) const DROP_OFFSET: f32 = 40.0; // How far in front of the player to drop the item
const DESPAWN_CHECK_INTERVAL_SECS: u64 = 60; // Check every 1 minute

/// Monument loot items that persist until picked up. They never despawn on their own;
/// respawn is scheduled only when a player picks them up.
const MONUMENT_LOOT_NEVER_DESPAWN: &[&str] = &["Transistor Radio", "Bone Carving Kit"];

// --- Reducers ---

/// Called by the client when they attempt to pick up a dropped item.
#[spacetimedb::reducer]
pub fn pickup_dropped_item(ctx: &ReducerContext, dropped_item_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender;
    let dropped_items_table = ctx.db.dropped_item();
    let players_table = ctx.db.player();
    let item_defs_table = ctx.db.item_definition(); // Needed for logging

    log::info!("[PickupDropped] Player {:?} attempting to pick up dropped item ID {}", sender_id, dropped_item_id);

    // 1. Find the Player
    let player = players_table.identity().find(sender_id)
        .ok_or_else(|| "Player not found.".to_string())?;

    // 2. Find the DroppedItem
    let dropped_item = dropped_items_table.id().find(dropped_item_id)
        .ok_or_else(|| format!("Dropped item with ID {} not found.", dropped_item_id))?;

    // 3. Check Proximity
    let distance_sq = get_distance_squared(player.position_x, player.position_y, dropped_item.pos_x, dropped_item.pos_y);

    if distance_sq > PICKUP_RADIUS_SQUARED {
         log::warn!("[PickupDropped] Player {:?} too far from item {} (DistSq: {:.1} > {:.1})",
                   sender_id, dropped_item_id, distance_sq, PICKUP_RADIUS_SQUARED);
        return Err("Too far away to pick up the item.".to_string());
    }

    // 4. Attempt to give item to player (inventory or drop near player if full)
    log::info!("[PickupDropped] Player {:?} is close enough. Attempting to give item def {} (qty {}).",
             sender_id, dropped_item.item_def_id, dropped_item.quantity);

    // Get item name for logging
    let item_name = item_defs_table.id().find(dropped_item.item_def_id)
                       .map(|def| def.name.clone())
                       .unwrap_or_else(|| format!("[Def ID {}]", dropped_item.item_def_id));

    // Use the new helper that handles full inventory by dropping near player, preserving item data
    match give_item_to_player_or_drop_with_data(ctx, sender_id, dropped_item.item_def_id, dropped_item.quantity, dropped_item.item_data.clone()) {
        Ok(added_to_inventory) => {
            // 5. Delete the original dropped item regardless of whether it went to inventory or was re-dropped
            dropped_items_table.id().delete(dropped_item_id);
            
            // Emit pickup sound at the dropped item's position
            crate::sound_events::emit_pickup_item_sound(ctx, dropped_item.pos_x, dropped_item.pos_y, sender_id);
            
            // 6. Check if this is a Memory Shard and trigger tutorial if player hasn't seen it
            // IMPORTANT: Only trigger AFTER SOVA intro is done - intro is non-interruptable
            if added_to_inventory && item_name == "Memory Shard" {
                // Re-fetch player to get fresh state
                if let Some(mut player_for_tutorial) = players_table.identity().find(sender_id) {
                    if player_for_tutorial.has_seen_sova_intro && !player_for_tutorial.has_seen_memory_shard_tutorial {
                        // First memory shard pickup after intro - trigger SOVA tutorial!
                        crate::sound_events::emit_sova_memory_shard_tutorial_sound(
                            ctx, 
                            player_for_tutorial.position_x, 
                            player_for_tutorial.position_y, 
                            sender_id
                        );
                        
                        // Mark tutorial as seen
                        player_for_tutorial.has_seen_memory_shard_tutorial = true;
                        players_table.identity().update(player_for_tutorial);
                        
                        log::info!("[PickupDropped] First Memory Shard pickup for player {:?} - SOVA tutorial triggered!", sender_id);
                    }
                }
            }
            
            if added_to_inventory {
                log::info!("[PickupDropped] Successfully picked up item '{}' (ID {}) and added to inventory for player {:?}",
                         item_name, dropped_item_id, sender_id);
                
                // Track item collection for quest progress (only if actually added to inventory)
                if let Err(e) = crate::quests::track_quest_progress(
                    ctx,
                    sender_id,
                    crate::quests::QuestObjectiveType::CollectSpecificItem,
                    Some(&item_name),
                    dropped_item.quantity,
                ) {
                    log::error!("[PickupDropped] Failed to track item collection quest progress: {}", e);
                }
                
                // 7. Check if this is a Bone Carving Kit and schedule respawn
                if item_name == "Bone Carving Kit" {
                    crate::bone_carving::schedule_kit_respawn(
                        ctx, 
                        crate::whale_bone_graveyard::BONE_CARVING_KIT_RESPAWN_DELAY_SECS
                    );
                    log::info!("[PickupDropped] Bone Carving Kit picked up - scheduled respawn in 30 minutes");
                }
                
                // 8. Check if this is a Transistor Radio and schedule respawn
                if item_name == "Transistor Radio" {
                    crate::transistor_radio::schedule_radio_respawn(
                        ctx, 
                        crate::transistor_radio::TRANSISTOR_RADIO_RESPAWN_DELAY_SECS
                    );
                    log::info!("[PickupDropped] Transistor Radio picked up - scheduled respawn in 30 minutes");
                }
            } else {
                log::info!("[PickupDropped] Inventory full, moved item '{}' (ID {}) closer to player {:?}",
                         item_name, dropped_item_id, sender_id);
            }
            Ok(())
        }
        Err(e) => {
            // If both inventory and dropping failed, leave the original dropped item in the world
            log::error!("[PickupDropped] Failed to handle pickup for item {} '{}' for player {:?}: {}",
                      dropped_item_id, item_name, sender_id, e);
            Err(format!("Could not pick up item: {}", e))
        }
    }
}

// --- Scheduled Despawn Reducer ---

/// Scheduled reducer that runs periodically to remove expired dropped items.
// Add the reducer macro back
#[spacetimedb::reducer]
pub fn despawn_expired_items(ctx: &ReducerContext, _schedule: DroppedItemDespawnSchedule) -> Result<(), String> {
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("despawn_expired_items may only be called by the scheduler.".to_string());
    }

    // PERFORMANCE: Early exit if no dropped items exist
    let dropped_items_table = ctx.db.dropped_item();
    if dropped_items_table.iter().next().is_none() {
        return Ok(());
    }

    let current_time = ctx.timestamp;
    let item_defs_table = ctx.db.item_definition(); // <<< ADDED: Need ItemDefinition table
    let mut items_to_despawn: Vec<u64> = Vec::new();
    let mut despawn_count = 0;

    log::trace!("[DespawnCheck] Running scheduled check for expired dropped items at {:?}", current_time);

    for item in dropped_items_table.iter() {
        let (item_def_respawn_seconds, is_monument_loot) = match item_defs_table.id().find(item.item_def_id) {
            Some(def) => {
                let respawn = def.respawn_time_seconds.unwrap_or(300);
                let is_monument = MONUMENT_LOOT_NEVER_DESPAWN.contains(&def.name.as_str());
                (respawn, is_monument)
            }
            None => {
                log::warn!("[DespawnCheck] ItemDefinition not found for dropped item ID {} (DefID {}). Using default despawn time.", item.id, item.item_def_id);
                (300, false)
            }
        };

        // Monument loot (Transistor Radio, Bone Carving Kit) persists until picked up
        if is_monument_loot {
            continue;
        }

        // Calculate elapsed time in microseconds
        let elapsed_micros = current_time.to_micros_since_unix_epoch()
                               .saturating_sub(item.created_at.to_micros_since_unix_epoch());
        // Ensure comparison is between i64
        let elapsed_seconds = (elapsed_micros / 1_000_000) as i64;

        if elapsed_seconds >= item_def_respawn_seconds as i64 { // <<< MODIFIED: Use item_def_respawn_seconds
            log::info!("[DespawnCheck] Despawning item ID {} (DefID {}, created at {:?}, elapsed: {}s, despawn_time: {}s)", 
                     item.id, item.item_def_id, item.created_at, elapsed_seconds, item_def_respawn_seconds);
            items_to_despawn.push(item.id);
        }
    }

    // Delete the expired items
    for item_id in items_to_despawn {
        if dropped_items_table.id().find(item_id).is_some() { // Check if still exists
            dropped_items_table.id().delete(item_id);
            despawn_count += 1;
        } else {
            log::warn!("[DespawnCheck] Tried to despawn item ID {}, but it was already gone.", item_id);
        }
    }

    if despawn_count > 0 {
        log::info!("[DespawnCheck] Despawned {} items.", despawn_count);
    }

    Ok(())
}

// --- Helper Functions (Internal to this module) ---

/// Attempts to give an item to a player's inventory. If the inventory is full or cannot stack,
/// creates a dropped item near the player instead.
/// Returns Ok(true) if added to inventory, Ok(false) if dropped near player, Err if failed completely.
pub(crate) fn give_item_to_player_or_drop(
    ctx: &ReducerContext,
    player_id: Identity,
    item_def_id: u64,
    quantity: u32,
) -> Result<bool, String> {
    give_item_to_player_or_drop_with_data(ctx, player_id, item_def_id, quantity, None)
}

/// Attempts to give an item to a player's inventory with preserved item data. If the inventory is full or cannot stack,
/// creates a dropped item near the player instead.
/// Returns Ok(true) if added to inventory, Ok(false) if dropped near player, Err if failed completely.
pub(crate) fn give_item_to_player_or_drop_with_data(
    ctx: &ReducerContext,
    player_id: Identity,
    item_def_id: u64,
    quantity: u32,
    item_data: Option<String>,
) -> Result<bool, String> {
    // First try to add to inventory with preserved data
    match add_item_to_player_inventory_with_data(ctx, player_id, item_def_id, quantity, item_data.clone()) {
        Ok(_) => {
            log::debug!("[GiveOrDrop] Successfully added item def {} (qty {}) to player {} inventory", 
                       item_def_id, quantity, player_id);
            Ok(true) // Successfully added to inventory
        }
        Err(inventory_error) => {
            log::info!("[GiveOrDrop] Failed to add to inventory ({}), creating dropped item near player {}", 
                      inventory_error, player_id);
            
            // Get player for drop position calculation
            let player = ctx.db.player().identity().find(player_id)
                .ok_or_else(|| format!("Player {} not found for drop calculation", player_id))?;
            
            // Calculate drop position near player
            let (drop_x, drop_y) = calculate_drop_position(&player);
            
            // Create dropped item near player with preserved data
            create_dropped_item_entity_with_data(ctx, item_def_id, quantity, drop_x, drop_y, item_data)?;
            
            log::info!("[GiveOrDrop] Created dropped item near player {} at ({:.1}, {:.1}) for item def {} (qty {})", 
                      player_id, drop_x, drop_y, item_def_id, quantity);
            
            Ok(false) // Item was dropped, not added to inventory
        }
    }
}

/// Creates a DroppedItem entity in the world.
/// Assumes validation (like position checks) might happen before calling this.
pub(crate) fn create_dropped_item_entity(
    ctx: &ReducerContext,
    item_def_id: u64,
    quantity: u32,
    pos_x: f32,
    pos_y: f32,
) -> Result<(), String> { // Changed return type to Result<(), String> as we don't need the entity back
    create_dropped_item_entity_with_data(ctx, item_def_id, quantity, pos_x, pos_y, None)
}

/// Creates a DroppedItem entity in the world with optional item data preservation.
/// Use this when dropping items that have special data (like water content).
pub(crate) fn create_dropped_item_entity_with_data(
    ctx: &ReducerContext,
    item_def_id: u64,
    quantity: u32,
    pos_x: f32,
    pos_y: f32,
    item_data: Option<String>,
) -> Result<(), String> {
    create_dropped_item_entity_internal(ctx, item_def_id, quantity, pos_x, pos_y, item_data, true)
}

/// Creates a DroppedItem entity WITHOUT triggering automatic consolidation.
/// Use this for batch drops (e.g., when destroying containers) to avoid creating multiple backpacks.
/// After all items are dropped, call `trigger_consolidation_at_position` once.
pub(crate) fn create_dropped_item_entity_no_consolidation(
    ctx: &ReducerContext,
    item_def_id: u64,
    quantity: u32,
    pos_x: f32,
    pos_y: f32,
) -> Result<(), String> {
    create_dropped_item_entity_internal(ctx, item_def_id, quantity, pos_x, pos_y, None, false)
}

/// Creates a DroppedItem entity with arc animation (for fruits falling from trees).
/// The item will animate from (spawn_x, spawn_y) to (pos_x, pos_y) on the client.
pub(crate) fn create_dropped_item_with_arc(
    ctx: &ReducerContext,
    item_def_id: u64,
    quantity: u32,
    pos_x: f32,
    pos_y: f32,
    spawn_x: f32,
    spawn_y: f32,
) -> Result<(), String> {
    create_dropped_item_entity_internal_v2(ctx, item_def_id, quantity, pos_x, pos_y, None, true, Some(spawn_x), Some(spawn_y))
}

/// Internal function that creates a DroppedItem with optional consolidation trigger and arc animation.
fn create_dropped_item_entity_internal(
    ctx: &ReducerContext,
    item_def_id: u64,
    quantity: u32,
    pos_x: f32,
    pos_y: f32,
    item_data: Option<String>,
    trigger_consolidation: bool,
) -> Result<(), String> {
    create_dropped_item_entity_internal_v2(ctx, item_def_id, quantity, pos_x, pos_y, item_data, trigger_consolidation, None, None)
}

/// Internal function that creates a DroppedItem with all options.
fn create_dropped_item_entity_internal_v2(
    ctx: &ReducerContext,
    item_def_id: u64,
    quantity: u32,
    pos_x: f32,
    pos_y: f32,
    item_data: Option<String>,
    trigger_consolidation: bool,
    spawn_x: Option<f32>,
    spawn_y: Option<f32>,
) -> Result<(), String> {
    // --- ADD: Calculate chunk index ---
    let chunk_idx = calculate_chunk_index(pos_x, pos_y);
    // --- END ADD ---
     let new_dropped_item = DroppedItem {
        id: 0, // Auto-incremented
        item_def_id,
        quantity,
        pos_x,
        pos_y,
        chunk_index: chunk_idx, // <<< SET chunk_index
        created_at: ctx.timestamp,
        item_data, // <<< ADDED: Store the item data
        spawn_x,   // Arc animation start X (None = no animation)
        spawn_y,   // Arc animation start Y (None = no animation)
    };

    match ctx.db.dropped_item().try_insert(new_dropped_item) {
        Ok(_) => {
            log::info!("[CreateDroppedItem] Created dropped item entity (DefID: {}, Qty: {}) at ({:.1}, {:.1})",
                     item_def_id, quantity, pos_x, pos_y);
            
            // Only check for consolidation if requested (skip for batch drops)
            if trigger_consolidation {
                // Quick check for nearby items to trigger consolidation
                let nearby_items: Vec<DroppedItem> = ctx.db.dropped_item().iter()
                    .filter(|item| {
                        let dx = item.pos_x - pos_x;
                        let dy = item.pos_y - pos_y;
                        dx * dx + dy * dy <= 16384.0 // 128px radius squared
                    })
                    .collect();
                
                if nearby_items.len() >= 5 {
                    log::info!("[CreateDroppedItem] Detected {} nearby items, triggering consolidation", nearby_items.len());
                    let _ = crate::backpack::consolidate_dropped_items_near_position(
                        ctx, pos_x, pos_y, nearby_items
                    );
                }
            }
            
            Ok(())
        },
        Err(e) => {
            log::error!("[CreateDroppedItem] Failed to insert dropped item: {}", e);
            Err(format!("Failed to create dropped item entity: {}", e))
        }
    }
}

/// Triggers backpack consolidation at a specific position.
/// Call this after batch-dropping items to consolidate them into backpacks.
pub(crate) fn trigger_consolidation_at_position(ctx: &ReducerContext, pos_x: f32, pos_y: f32) {
    let nearby_items: Vec<DroppedItem> = ctx.db.dropped_item().iter()
        .filter(|item| {
            let dx = item.pos_x - pos_x;
            let dy = item.pos_y - pos_y;
            dx * dx + dy * dy <= 16384.0 // 128px radius squared
        })
        .collect();
    
    if nearby_items.len() >= 5 {
        log::info!("[TriggerConsolidation] Detected {} nearby items at ({:.1}, {:.1}), triggering consolidation", 
                 nearby_items.len(), pos_x, pos_y);
        let _ = crate::backpack::consolidate_dropped_items_near_position(ctx, pos_x, pos_y, nearby_items);
    }
}

/// Calculates a position slightly in front of the player based on their direction.
pub(crate) fn calculate_drop_position(player: &Player) -> (f32, f32) {
    let mut drop_x = player.position_x;
    let mut drop_y = player.position_y;

    match player.direction.as_str() {
        "up" => drop_y -= DROP_OFFSET,
        "down" => drop_y += DROP_OFFSET,
        "left" => drop_x -= DROP_OFFSET,
        "right" => drop_x += DROP_OFFSET,
        _ => drop_y += DROP_OFFSET, // Default to dropping below if direction is weird
    }

    // Basic boundary clamping (could add collision checks later if needed)
    // Using player radius as a buffer from the edge
    drop_x = drop_x.max(PLAYER_RADIUS).min(crate::WORLD_WIDTH_PX - PLAYER_RADIUS);
    drop_y = drop_y.max(PLAYER_RADIUS).min(crate::WORLD_HEIGHT_PX - PLAYER_RADIUS);

    (drop_x, drop_y)
}

// --- Init Helper (Called from lib.rs) ---
pub(crate) fn init_dropped_item_schedule(ctx: &ReducerContext) -> Result<(), String> {
    let schedule_table = ctx.db.dropped_item_despawn_schedule();
    if schedule_table.iter().count() == 0 {
        log::info!("Starting dropped item despawn schedule (every {}s).", DESPAWN_CHECK_INTERVAL_SECS);
        let interval = Duration::from_secs(DESPAWN_CHECK_INTERVAL_SECS);
        crate::try_insert_schedule!(
            schedule_table,
            DroppedItemDespawnSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(TimeDuration::from(interval)),
            },
            "Dropped item despawn"
        );
    } else {
        log::debug!("Dropped item despawn schedule already exists.");
    }
    Ok(())
}

// --- Public API Functions for Other Modules ---

/// Public API for giving items to players with automatic dropping fallback.
/// This should be used by harvesting, crafting, and other systems that give items to players.
/// If the player's inventory is full, the item will be dropped near the player instead.
/// Returns Ok(true) if added to inventory, Ok(false) if dropped near player.
pub fn try_give_item_to_player(
    ctx: &ReducerContext,
    player_id: Identity,
    item_def_id: u64,
    quantity: u32,
) -> Result<bool, String> {
    give_item_to_player_or_drop(ctx, player_id, item_def_id, quantity)
}

/// Public API for giving items to players with item data preservation and automatic dropping fallback.
/// Use this when giving items that have special data (like water content).
/// Returns Ok(true) if added to inventory, Ok(false) if dropped near player.
pub fn try_give_item_to_player_with_data(
    ctx: &ReducerContext,
    player_id: Identity,
    item_def_id: u64,
    quantity: u32,
    item_data: Option<String>,
) -> Result<bool, String> {
    give_item_to_player_or_drop_with_data(ctx, player_id, item_def_id, quantity, item_data)
}

// --- Death Drop Constants ---
const DEATH_DROP_MIN_OFFSET: f32 = 30.0;  // Minimum distance from death position
const DEATH_DROP_MAX_OFFSET: f32 = 60.0;  // Maximum distance from death position

/// Drops the player's currently active/equipped weapon near their death position.
/// This creates a dropped item with a random offset so attackers can quickly grab it.
/// Returns Ok(Some(item_name)) if an item was dropped, Ok(None) if nothing was equipped.
/// 
/// IMPORTANT: Call this BEFORE create_player_corpse() and clear_active_item_reducer()
/// so the item is removed from inventory before being transferred to corpse.
pub fn drop_active_weapon_on_death(
    ctx: &ReducerContext,
    player_id: Identity,
    death_x: f32,
    death_y: f32,
) -> Result<Option<String>, String> {
    let active_equipments = ctx.db.active_equipment();
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    
    // Get active equipment for player
    let equipment = match active_equipments.player_identity().find(&player_id) {
        Some(eq) => eq,
        None => {
            log::debug!("[DeathDrop] Player {:?} has no ActiveEquipment record", player_id);
            return Ok(None);
        }
    };
    
    // Check if they have an equipped item
    let equipped_instance_id = match equipment.equipped_item_instance_id {
        Some(id) => id,
        None => {
            log::debug!("[DeathDrop] Player {:?} has no equipped item", player_id);
            return Ok(None);
        }
    };
    
    // Get the inventory item
    let equipped_item = match inventory_items.instance_id().find(equipped_instance_id) {
        Some(item) => item,
        None => {
            log::warn!("[DeathDrop] Equipped item instance {} not found in inventory", equipped_instance_id);
            return Ok(None);
        }
    };
    
    // Get item definition for logging and name
    let item_def = match item_defs.id().find(equipped_item.item_def_id) {
        Some(def) => def,
        None => {
            log::warn!("[DeathDrop] Item definition {} not found", equipped_item.item_def_id);
            return Ok(None);
        }
    };
    
    let item_name = item_def.name.clone();
    
    // Generate random offset for drop position
    let mut rng = rand::rngs::StdRng::from_rng(ctx.rng())
        .map_err(|e| format!("Failed to create RNG: {}", e))?;
    
    // Random angle in radians (0 to 2π)
    let angle: f32 = rng.gen_range(0.0..std::f32::consts::TAU);
    // Random distance within range
    let distance: f32 = rng.gen_range(DEATH_DROP_MIN_OFFSET..DEATH_DROP_MAX_OFFSET);
    
    // Calculate drop position
    let drop_x = (death_x + angle.cos() * distance)
        .max(PLAYER_RADIUS)
        .min(crate::WORLD_WIDTH_PX - PLAYER_RADIUS);
    let drop_y = (death_y + angle.sin() * distance)
        .max(PLAYER_RADIUS)
        .min(crate::WORLD_HEIGHT_PX - PLAYER_RADIUS);
    
    // Create dropped item with preserved item_data (for things like water containers)
    create_dropped_item_entity_with_data(
        ctx,
        equipped_item.item_def_id,
        equipped_item.quantity,
        drop_x,
        drop_y,
        equipped_item.item_data.clone(),
    )?;
    
    log::info!(
        "[DeathDrop] Player {:?} dropped '{}' (Instance: {}) at ({:.1}, {:.1}) - death was at ({:.1}, {:.1})",
        player_id, item_name, equipped_instance_id, drop_x, drop_y, death_x, death_y
    );
    
    // Delete the item from inventory so it doesn't also go to corpse
    inventory_items.instance_id().delete(equipped_instance_id);
    
    Ok(Some(item_name))
}

/// Debug reducer to spawn an item by name in front of the player (for testing)
/// Takes an item name (must match exactly) and quantity
#[spacetimedb::reducer]
pub fn debug_spawn_item(ctx: &ReducerContext, item_name: String, quantity: u32) -> Result<(), String> {
    if quantity == 0 {
        return Err("Quantity must be at least 1".to_string());
    }
    
    // Find the item definition by name
    let item_def_table = ctx.db.item_definition();
    let item_def = item_def_table.iter()
        .find(|def| def.name == item_name)
        .ok_or_else(|| format!("Item '{}' not found in item database", item_name))?;
    
    let item_def_id = item_def.id;
    let stack_size = item_def.stack_size;
    let is_stackable = item_def.is_stackable;
    
    // Get the player's position
    let player = ctx.db.player().identity().find(&ctx.sender)
        .ok_or_else(|| "Player not found".to_string())?;
    
    // Calculate drop position in front of player
    let (drop_x, drop_y) = calculate_drop_position(&player);
    
    // If the item is stackable and quantity exceeds stack size, create multiple drops
    let mut remaining = quantity;
    let mut drops_created = 0u32;
    
    while remaining > 0 {
        let drop_qty = if is_stackable {
            remaining.min(stack_size)
        } else {
            1 // Non-stackable items drop 1 at a time
        };
        
        // Add small random offset for multiple drops so they don't overlap exactly
        let offset_x = if drops_created > 0 {
            let mut rng = ctx.rng();
            (rng.gen::<f32>() - 0.5) * 40.0
        } else {
            0.0
        };
        let offset_y = if drops_created > 0 {
            let mut rng = ctx.rng();
            (rng.gen::<f32>() - 0.5) * 40.0
        } else {
            0.0
        };
        
        create_dropped_item_entity(
            ctx,
            item_def_id,
            drop_qty,
            (drop_x + offset_x).max(PLAYER_RADIUS).min(crate::WORLD_WIDTH_PX - PLAYER_RADIUS),
            (drop_y + offset_y).max(PLAYER_RADIUS).min(crate::WORLD_HEIGHT_PX - PLAYER_RADIUS),
        )?;
        
        remaining -= drop_qty;
        drops_created += 1;
    }
    
    log::info!(
        "📦 Debug spawned {} '{}' (DefID: {}) near player {:?} at ({:.1}, {:.1}) in {} drop(s)",
        quantity, item_name, item_def_id, ctx.sender, drop_x, drop_y, drops_created
    );
    
    Ok(())
}