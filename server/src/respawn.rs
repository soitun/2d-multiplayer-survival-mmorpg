use rand::Rng; // Add rand for random respawn location
use spacetimedb::{ReducerContext, Identity, Timestamp, Table, log};
use rand::prelude::*;

// Import table traits
use crate::player;
use crate::items::item_definition;
use crate::active_equipment; // Import the module itself for clear_active_item_reducer

// Import functions from other modules
use crate::crafting_queue;
use crate::items;

// Import global constants from lib.rs
use crate::{TILE_SIZE_PX, WORLD_WIDTH_PX, WORLD_HEIGHT_PX, TileType};

// Import player starting constants
use crate::player_stats::{PLAYER_STARTING_HUNGER, PLAYER_STARTING_THIRST};

// Import table traits for database access
use crate::tree::tree as TreeTableTrait;
use crate::stone::stone as StoneTableTrait;
use crate::campfire::campfire as CampfireTableTrait;
use crate::wooden_storage_box::wooden_storage_box as WoodenStorageBoxTableTrait;
use crate::world_tile as WorldTileTableTrait;
use crate::coastal_spawn_point as CoastalSpawnPointTableTrait;

// Import necessary modules and constants
use crate::{Player, WORLD_WIDTH_TILES, WORLD_HEIGHT_TILES, world_pos_to_tile_coords, get_tile_type_at_position, PLAYER_RADIUS};
use crate::environment::calculate_chunk_index;
use crate::death_marker::{DeathMarker, death_marker as DeathMarkerTableTrait};

// Respawn Collision Check Constants
pub const RESPAWN_CHECK_RADIUS: f32 = TILE_SIZE_PX as f32 * 3.0; // 3 tiles radius (144 pixels) for realistic proximity blocking
pub const RESPAWN_CHECK_RADIUS_SQ: f32 = RESPAWN_CHECK_RADIUS * RESPAWN_CHECK_RADIUS;
pub const MAX_RESPAWN_OFFSET_ATTEMPTS: u32 = 8; // Max times to try offsetting
pub const RESPAWN_OFFSET_DISTANCE: f32 = TILE_SIZE_PX as f32 * 0.5; // How far to offset each attempt

/// Get neighboring chunk indices for a given chunk (3x3 grid)
fn get_neighboring_chunks(center_chunk: u32) -> Vec<u32> {
    use crate::environment::WORLD_WIDTH_CHUNKS;
    
    let chunks_per_row = WORLD_WIDTH_CHUNKS as i32;
    let center_x = (center_chunk as i32) % chunks_per_row;
    let center_y = (center_chunk as i32) / chunks_per_row;
    
    let mut chunks = Vec::with_capacity(9);
    
    for dy in -1..=1i32 {
        for dx in -1..=1i32 {
            let nx = center_x + dx;
            let ny = center_y + dy;
            
            if nx >= 0 && ny >= 0 && nx < chunks_per_row && ny < chunks_per_row {
                chunks.push((ny * chunks_per_row + nx) as u32);
            }
        }
    }
    
    chunks
}

/// Check for collisions at spawn position using chunk-based filtering
fn check_spawn_collision(
    ctx: &ReducerContext,
    spawn_x: f32,
    spawn_y: f32,
    sender_id: Identity,
    neighboring_chunks: &[u32],
    last_collision_reason: &mut String,
) -> bool {
    last_collision_reason.clear();
    
    // Check collision with other players (full scan - players move around)
    for other_player in ctx.db.player().iter() {
        if other_player.is_dead || other_player.identity == sender_id { continue; }
        let dx = spawn_x - other_player.position_x;
        let dy = spawn_y - other_player.position_y;
        let distance_sq = dx * dx + dy * dy;
        let min_distance_sq = crate::PLAYER_RADIUS * crate::PLAYER_RADIUS * 2.0;
        if distance_sq < min_distance_sq {
            *last_collision_reason = format!("Player collision (dist: {:.1})", distance_sq.sqrt());
            return true;
        }
    }
    
    // Check collision with trees (chunk-filtered)
    for chunk_idx in neighboring_chunks {
        for tree in ctx.db.tree().chunk_index().filter(*chunk_idx) {
            if tree.health == 0 { continue; }
            let dx = spawn_x - tree.pos_x;
            let dy = spawn_y - (tree.pos_y - crate::tree::TREE_COLLISION_Y_OFFSET);
            let distance_sq = dx * dx + dy * dy;
            if distance_sq < (crate::tree::PLAYER_TREE_COLLISION_DISTANCE_SQUARED * 0.8) {
                *last_collision_reason = format!("Tree at ({:.0}, {:.0})", tree.pos_x, tree.pos_y);
                return true;
            }
        }
    }
    
    // Check collision with stones (chunk-filtered)
    for chunk_idx in neighboring_chunks {
        for stone in ctx.db.stone().chunk_index().filter(*chunk_idx) {
            if stone.health == 0 { continue; }
            let dx = spawn_x - stone.pos_x;
            let dy = spawn_y - (stone.pos_y - crate::stone::STONE_COLLISION_Y_OFFSET);
            let distance_sq = dx * dx + dy * dy;
            if distance_sq < (crate::stone::PLAYER_STONE_COLLISION_DISTANCE_SQUARED * 0.8) {
                *last_collision_reason = format!("Stone at ({:.0}, {:.0})", stone.pos_x, stone.pos_y);
                return true;
            }
        }
    }
    
    // Check collision with campfires (chunk-filtered)
    for chunk_idx in neighboring_chunks {
        for campfire in ctx.db.campfire().chunk_index().filter(*chunk_idx) {
            let dx = spawn_x - campfire.pos_x;
            let dy = spawn_y - (campfire.pos_y - crate::campfire::CAMPFIRE_COLLISION_Y_OFFSET);
            let distance_sq = dx * dx + dy * dy;
            if distance_sq < (crate::campfire::PLAYER_CAMPFIRE_COLLISION_DISTANCE_SQUARED * 0.8) {
                *last_collision_reason = format!("Campfire at ({:.0}, {:.0})", campfire.pos_x, campfire.pos_y);
                return true;
            }
        }
    }
    
    // Check collision with wooden storage boxes (chunk-filtered)
    for chunk_idx in neighboring_chunks {
        for box_instance in ctx.db.wooden_storage_box().chunk_index().filter(*chunk_idx) {
            let dx = spawn_x - box_instance.pos_x;
            let dy = spawn_y - (box_instance.pos_y - crate::wooden_storage_box::BOX_COLLISION_Y_OFFSET);
            let distance_sq = dx * dx + dy * dy;
            if distance_sq < (crate::wooden_storage_box::PLAYER_BOX_COLLISION_DISTANCE_SQUARED * 0.8) {
                *last_collision_reason = format!("Storage box at ({:.0}, {:.0})", box_instance.pos_x, box_instance.pos_y);
                return true;
            }
        }
    }
    
    false
}

/// Reducer that handles random respawn requests from dead players.
/// 
/// This reducer is called by the client when a dead player wants to respawn at a random location.
/// It verifies the player is dead, clears their crafting queue, and grants them basic starting items
/// before placing them at a new random position on valid land tiles (avoiding water).
#[spacetimedb::reducer]
pub fn respawn_randomly(ctx: &ReducerContext) -> Result<(), String> { // Renamed function
    let sender_id = ctx.sender;
    let players = ctx.db.player();
    let item_defs = ctx.db.item_definition();

    log::info!("RESPAWN_RANDOMLY called by player {:?}", sender_id);

    // Find the player requesting respawn
    let mut player = players.identity().find(&sender_id)
        .ok_or_else(|| "Player not found".to_string())?;

    // Check if the player is actually dead
    if !player.is_dead {
        log::warn!("Player {:?} requested respawn but is not dead.", sender_id);
        return Err("You are not dead.".to_string());
    }

    log::info!("Respawning player {} ({:?}). Crafting queue will be cleared.", player.username, sender_id);

    // --- Clear Crafting Queue & Refund ---
    crafting_queue::clear_player_crafting_queue(ctx, sender_id);
    // --- END Clear Crafting Queue ---

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

    // --- Find Valid Coastal Beach Spawn Position (OPTIMIZED: uses pre-computed spawn points) ---
    
    // Collect south-half coastal spawn points from pre-computed table
    let coastal_spawn_points: Vec<_> = ctx.db.coastal_spawn_point()
        .iter()
        .filter(|sp| sp.is_south_half)
        .collect();
    
    log::info!("Using {} pre-computed south-half coastal spawn points for respawn", coastal_spawn_points.len());
    
    // MANDATORY: Must have coastal spawn points
    if coastal_spawn_points.is_empty() {
        return Err("CRITICAL ERROR: No south half coastal spawn points found! Cannot respawn player.".to_string());
    }
    
    // Find a valid spawn point with chunk-based collision detection
    let mut spawn_x: f32;
    let mut spawn_y: f32;
    let max_spawn_attempts = 50;
    let mut spawn_attempt = 0;
    let mut last_collision_reason = String::new();
    
    loop {
        // Pick a random spawn point
        let random_index = ctx.rng().gen_range(0..coastal_spawn_points.len());
        let selected_spawn = &coastal_spawn_points[random_index];
        
        spawn_x = selected_spawn.world_x;
        spawn_y = selected_spawn.world_y;
        
        // Get neighboring chunks for collision checks (3x3 grid around spawn chunk)
        let spawn_chunk = selected_spawn.chunk_index;
        let neighboring_chunks = get_neighboring_chunks(spawn_chunk);
        
        // Check for collisions using chunk-based filtering
        let collision = check_spawn_collision(
            ctx, spawn_x, spawn_y, sender_id, &neighboring_chunks, &mut last_collision_reason
        );
        
        if !collision {
            log::info!("SUCCESS: Respawn found at ({:.1}, {:.1}) tile ({}, {}) after {} attempts", 
                      spawn_x, spawn_y, selected_spawn.tile_x, selected_spawn.tile_y, spawn_attempt + 1);
            break;
        }
        
        spawn_attempt += 1;
        if spawn_attempt >= max_spawn_attempts {
            log::warn!("Could not find collision-free respawn after {} attempts. FORCING at ({:.1}, {:.1}) - {}", 
                      max_spawn_attempts, spawn_x, spawn_y, last_collision_reason);
            break;
        }
    }
    // --- End Find Valid Coastal Beach Spawn Position ---

    // --- RE-FETCH the player record to get the latest data before updating ---
    let mut current_player = players.identity().find(&sender_id)
        .ok_or_else(|| "Player not found during respawn update".to_string())?;
    
    // --- Set Position to Found Land Location ---
    current_player.position_x = spawn_x;
    current_player.position_y = spawn_y;
    current_player.direction = "down".to_string();

    // --- Reset Stats and State ---
    current_player.health = 100.0;
    current_player.hunger = PLAYER_STARTING_HUNGER;
    current_player.thirst = PLAYER_STARTING_THIRST;
    current_player.warmth = 100.0;
    current_player.stamina = 100.0;
    current_player.insanity = 0.0; // Reset insanity on respawn
    current_player.shard_carry_start_time = None; // Reset shard carry time on respawn
    current_player.jump_start_time_ms = 0;
    current_player.is_sprinting = false;
    current_player.is_dead = false; // Mark as alive again
    current_player.death_timestamp = None; // Clear death timestamp
    current_player.last_hit_time = None;
    current_player.is_torch_lit = false; // Ensure torch is unlit on respawn
    current_player.is_knocked_out = false; // Reset knocked out state
    current_player.knocked_out_at = None; // Clear knocked out timestamp
    current_player.is_aiming_throw = false; // Reset throw-aiming state

    // CRITICAL FIX: Reset client movement sequence to force position sync
    // This prevents client-side prediction from overriding the respawn position
    current_player.client_movement_sequence = 0;
    
    // Also reset water status since we're spawning on beach (land)
    current_player.is_on_water = false;

    // --- Update Timestamp ---
    current_player.last_update = ctx.timestamp;
    current_player.last_stat_update = ctx.timestamp; // Reset stat timestamp on respawn
    current_player.last_respawn_time = ctx.timestamp; // Track respawn time for fat accumulation

    // --- Apply Player Changes ---
    players.identity().update(current_player);
    log::info!("Player {:?} respawned on land at ({:.1}, {:.1}).", sender_id, spawn_x, spawn_y);
    log::info!("RESPAWN SUCCESS: Player position updated to ({:.1}, {:.1})", spawn_x, spawn_y);

    // Ensure item is unequipped on respawn
    match active_equipment::clear_active_item_reducer(ctx, sender_id) {
        Ok(_) => log::info!("Ensured active item is cleared for respawned player {:?}", sender_id),
        Err(e) => log::error!("Failed to clear active item for respawned player {:?}: {}", sender_id, e),
    }

    Ok(())
}