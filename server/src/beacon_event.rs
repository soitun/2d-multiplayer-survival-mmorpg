/******************************************************************************
 *                                                                            *
 * Memory Beacon Server Event System                                          *
 *                                                                            *
 * Spawns Memory Resonance Beacons at Dusk as server events (like airdrops    *
 * in Rust). Players race to the beacon location, insert batteries, and       *
 * farm hostile NPCs for memory shards.                                       *
 *                                                                            *
 * Key features:                                                              *
 * - Spawns only at Dusk with a percentage chance                            *
 * - Only one beacon can exist at a time                                      *
 * - Requires at least 1 player online                                        *
 * - Spawns away from water, monuments, and player bases                     *
 * - Shows on minimap for all players                                         *
 * - Lasts 90 minutes (~3 night cycles) before despawning                     *
 * - INVINCIBLE - cannot be damaged (prevents griefing)                       *
 * - Broadcasts chat notification when spawned                                *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{table, ReducerContext, Table, Timestamp, TimeDuration};
use rand::{Rng, SeedableRng};
use log;

// Import table traits
use crate::lantern::{
    Lantern, lantern as LanternTableTrait,
    LANTERN_TYPE_MEMORY_BEACON, MEMORY_BEACON_HEALTH,
};
use crate::player as PlayerTableTrait;
use crate::chat::message as MessageTableTrait;
use crate::building::{foundation_cell as FoundationCellTableTrait, FOUNDATION_TILE_SIZE_PX};
use crate::environment::{is_position_on_water, calculate_chunk_index};
use crate::{WORLD_WIDTH_PX, WORLD_HEIGHT_PX};

// === CONSTANTS ===

/// Percentage chance of beacon spawning at Dusk (0.0 - 1.0)
/// 40% chance means roughly every 2-3 days a beacon will spawn
pub const BEACON_SPAWN_CHANCE: f32 = 0.40;  // 40% chance at each Dusk

/// How long the beacon lasts before despawning (in seconds)
/// 90 minutes = 5400 seconds, covers ~3 full night cycles
pub const BEACON_EVENT_LIFETIME_SECS: u64 = 5400;  // 90 minutes

/// Minimum distance from player bases (foundations)
pub const MIN_DISTANCE_FROM_BASES_PX: f32 = 1500.0;
pub const MIN_DISTANCE_FROM_BASES_SQ: f32 = MIN_DISTANCE_FROM_BASES_PX * MIN_DISTANCE_FROM_BASES_PX;

/// Minimum distance from monuments (ALK stations, rune stones, etc.)
pub const MIN_DISTANCE_FROM_MONUMENTS_PX: f32 = 1000.0;

/// Maximum spawn attempts before giving up
pub const MAX_SPAWN_ATTEMPTS: u32 = 100;

/// Minimum distance from world edges (in pixels)
pub const WORLD_EDGE_BUFFER_PX: f32 = 500.0;

// === TABLES ===

/// Tracks active beacon drop events
/// Only one can exist at a time - checked before spawning new one
#[spacetimedb::table(accessor = beacon_drop_event, public)]
#[derive(Clone, Debug)]
pub struct BeaconDropEvent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub lantern_id: u32,       // Reference to the actual Lantern entity
    pub world_x: f32,
    pub world_y: f32,
    pub grid_x: i32,           // Grid coordinates for chat message
    pub grid_y: i32,
    pub spawned_at: Timestamp,
    pub expires_at: Timestamp, // 90 minutes after spawn
    pub is_active: bool,       // False once expired or destroyed
}

// === DUSK TRIGGER ===

/// Called from world_state.rs when time transitions to Dusk
/// Rolls a percentage chance and spawns a beacon if conditions are met
pub fn on_dusk_started(ctx: &ReducerContext) {
    log::info!("[BeaconEvent] Dusk has started, checking beacon spawn conditions...");
    
    // Check if at least 1 player is online
    let online_players = ctx.db.player().iter().filter(|p| p.is_online).count();
    if online_players == 0 {
        log::debug!("[BeaconEvent] No players online, skipping spawn check");
        return;
    }
    
    // Check if a beacon already exists (only one at a time)
    let existing_beacon = ctx.db.beacon_drop_event().iter().find(|b| b.is_active);
    if existing_beacon.is_some() {
        log::debug!("[BeaconEvent] Active beacon event already exists, skipping spawn");
        return;
    }
    
    // Also check for any Memory Beacon lanterns that might exist without BeaconDropEvent record
    let existing_lantern = ctx.db.lantern().iter().find(|l| 
        l.lantern_type == LANTERN_TYPE_MEMORY_BEACON && !l.is_destroyed
    );
    if existing_lantern.is_some() {
        log::debug!("[BeaconEvent] Memory beacon lantern already exists, skipping spawn");
        return;
    }
    
    // Roll the spawn chance
    let mut rng = ctx.rng();
    let roll: f32 = rng.gen();
    
    if roll > BEACON_SPAWN_CHANCE {
        log::info!("[BeaconEvent] Spawn roll failed ({:.1}% > {:.1}% threshold), no beacon this Dusk", 
                  roll * 100.0, BEACON_SPAWN_CHANCE * 100.0);
        return;
    }
    
    log::info!("[BeaconEvent] Spawn roll succeeded ({:.1}% <= {:.1}% threshold)! Attempting to spawn beacon...", 
              roll * 100.0, BEACON_SPAWN_CHANCE * 100.0);
    
    // Try to spawn a beacon
    match try_spawn_beacon(ctx) {
        Ok(()) => {
            log::info!("[BeaconEvent] ⚡ Beacon spawned successfully!");
        }
        Err(e) => {
            log::warn!("[BeaconEvent] Failed to spawn beacon: {}", e);
        }
    }
}

// === SPAWN LOGIC ===

/// Try to find a valid position and spawn a beacon
fn try_spawn_beacon(ctx: &ReducerContext) -> Result<(), String> {
    let mut rng = rand::rngs::StdRng::seed_from_u64(
        ctx.timestamp.to_micros_since_unix_epoch() as u64
    );
    
    // Try multiple positions
    for attempt in 0..MAX_SPAWN_ATTEMPTS {
        // Generate random position within world bounds (with edge buffer)
        let pos_x = rng.gen_range(WORLD_EDGE_BUFFER_PX..(WORLD_WIDTH_PX as f32 - WORLD_EDGE_BUFFER_PX));
        let pos_y = rng.gen_range(WORLD_EDGE_BUFFER_PX..(WORLD_HEIGHT_PX as f32 - WORLD_EDGE_BUFFER_PX));
        
        // Validate position
        if is_valid_spawn_position(ctx, pos_x, pos_y) {
            return spawn_beacon_at(ctx, pos_x, pos_y);
        }
        
        if attempt % 20 == 0 {
            log::debug!("[BeaconEvent] Spawn attempt {} failed, trying more positions...", attempt + 1);
        }
    }
    
    Err(format!("Failed to find valid spawn position after {} attempts", MAX_SPAWN_ATTEMPTS))
}

/// Check if a position is valid for beacon spawning
fn is_valid_spawn_position(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    // 1. Not on water
    if is_position_on_water(ctx, pos_x, pos_y) {
        return false;
    }
    
    // 2. Not near ALK stations/rune stones/hot springs/quarries
    if crate::building::check_monument_zone_placement(ctx, pos_x, pos_y).is_err() {
        return false;
    }
    
    // 3. Not near monuments (shipwreck, fishing village)
    if crate::monument::is_position_near_monument(ctx, pos_x, pos_y) {
        return false;
    }
    
    // 4. Not near player bases (foundations)
    if is_near_player_base(ctx, pos_x, pos_y) {
        return false;
    }
    
    // 5. Not inside building enclosures
    if crate::building_enclosure::is_position_inside_building(ctx, pos_x, pos_y) {
        return false;
    }
    
    true
}

/// Check if position is too close to any player foundations
fn is_near_player_base(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    for foundation in ctx.db.foundation_cell().iter() {
        if foundation.is_destroyed {
            continue;
        }
        
        // Convert foundation cell to world coordinates
        let foundation_x = (foundation.cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32) 
            + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
        let foundation_y = (foundation.cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32) 
            + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
        
        let dx = pos_x - foundation_x;
        let dy = pos_y - foundation_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < MIN_DISTANCE_FROM_BASES_SQ {
            return true;
        }
    }
    
    false
}

/// Spawn a beacon at the given position
fn spawn_beacon_at(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> Result<(), String> {
    let current_time = ctx.timestamp;
    let chunk_index = calculate_chunk_index(pos_x, pos_y);
    
    // Calculate grid coordinates for chat message
    let grid_x = (pos_x / crate::TILE_SIZE_PX as f32).floor() as i32;
    let grid_y = (pos_y / crate::TILE_SIZE_PX as f32).floor() as i32;
    
    // Create the beacon lantern entity
    // Note: is_monument = true marks it as a server event beacon (not player-placed)
    // Server event beacons are INVINCIBLE and have longer lifetime
    let beacon = Lantern {
        id: 0, // Auto-inc
        pos_x,
        pos_y,
        chunk_index,
        placed_by: ctx.identity(), // Server identity
        placed_at: current_time,
        is_burning: false, // Starts without fuel
        fuel_instance_id_0: None,
        fuel_def_id_0: None,
        current_fuel_def_id: None,
        remaining_fuel_burn_time_secs: None,
        health: MEMORY_BEACON_HEALTH,
        max_health: MEMORY_BEACON_HEALTH,
        is_destroyed: false,
        destroyed_at: None,
        last_hit_time: None,
        last_damaged_by: None,
        is_monument: true, // CRITICAL: Marks as server event beacon (invincible + longer lifetime)
        lantern_type: LANTERN_TYPE_MEMORY_BEACON,
    };
    
    let inserted_beacon = ctx.db.lantern().insert(beacon);
    let lantern_id = inserted_beacon.id;
    
    log::info!("[BeaconEvent] ⚡ Spawned beacon {} at ({:.0}, {:.0}) grid [{}, {}]", 
              lantern_id, pos_x, pos_y, grid_x, grid_y);
    
    // Create the beacon drop event record
    let expires_at = current_time + TimeDuration::from_micros((BEACON_EVENT_LIFETIME_SECS * 1_000_000) as i64);
    
    let event = BeaconDropEvent {
        id: 0,
        lantern_id,
        world_x: pos_x,
        world_y: pos_y,
        grid_x,
        grid_y,
        spawned_at: current_time,
        expires_at,
        is_active: true,
    };
    
    ctx.db.beacon_drop_event().insert(event);
    
    // Send global chat announcement
    send_beacon_spawn_announcement(ctx, grid_x, grid_y);
    
    // Schedule the lantern processing (for fuel burn, auto-destruct, etc.)
    crate::lantern::schedule_next_lantern_processing(ctx, lantern_id);
    
    Ok(())
}

/// Send a chat message announcing the beacon spawn
/// Note: grid_x and grid_y here are the raw tile coordinates (pos / TILE_SIZE)
/// We need to convert them to the same grid system the client minimap uses
fn send_beacon_spawn_announcement(ctx: &ReducerContext, grid_x: i32, grid_y: i32) {
    // Calculate grid cell size to match client minimap display
    // Client formula: Math.round((Math.round(SERVER_WORLD_WIDTH_TILES / 5) + 1) / Math.SQRT2 * TILE_SIZE)
    // This is ~4107 pixels for a 600-tile world
    let world_width_tiles = crate::WORLD_WIDTH_TILES as f32;
    let tile_size = crate::TILE_SIZE_PX as f32;
    
    // Match client's MINIMAP_GRID_DIAGONAL_TILES = Math.round(SERVER_WORLD_WIDTH_TILES / 5) + 1
    let grid_diagonal_tiles = (world_width_tiles / 5.0).round() + 1.0;
    // Match client's MINIMAP_GRID_CELL_SIZE_PIXELS = Math.round((diagonal / sqrt(2)) * TILE_SIZE)
    let grid_cell_size_pixels = ((grid_diagonal_tiles / std::f32::consts::SQRT_2) * tile_size).round();
    
    // Convert tile coordinates to world pixels, then to grid cell
    let world_x = grid_x as f32 * tile_size;
    let world_y = grid_y as f32 * tile_size;
    
    // Calculate which grid cell this position falls into (matching client's col/row calculation)
    let grid_col = (world_x / grid_cell_size_pixels).floor() as i32;
    let grid_row = (world_y / grid_cell_size_pixels).floor() as i32;
    
    // Convert to letter+number format (A1, B2, etc.) - matching client's String.fromCharCode(65 + col)
    let grid_letter = ((grid_col as u8).min(25) + b'A') as char; // Cap at 'Z' for safety
    let grid_number = grid_row + 1; // Client uses (row + 1)
    
    let message = crate::chat::Message {
        id: 0,
        sender: ctx.identity(), // Server identity
        sender_username: "[SERVER]".to_string(),
        sender_title: None,
        text: format!("A Memory Resonance Beacon has materialized at grid {}{}! Race to claim it before it fades!", 
                     grid_letter, grid_number),
        sent: ctx.timestamp,
    };
    
    ctx.db.message().insert(message);
    log::info!("[BeaconEvent] Announced beacon spawn at grid {}{} (from tile coords [{}, {}], world pos [{:.0}, {:.0}], cell_size={:.0})", 
               grid_letter, grid_number, grid_x, grid_y, world_x, world_y, grid_cell_size_pixels);
}

// === CLEANUP ===

/// Clean up expired beacon events (called from lantern processing or global tick)
pub fn cleanup_expired_beacon_events(ctx: &ReducerContext) {
    let current_time = ctx.timestamp;
    
    // Find and deactivate expired events
    let expired_events: Vec<BeaconDropEvent> = ctx.db.beacon_drop_event()
        .iter()
        .filter(|e| e.is_active && current_time >= e.expires_at)
        .collect();
    
    for mut event in expired_events {
        event.is_active = false;
        ctx.db.beacon_drop_event().id().update(event.clone());
        
        // Also destroy the associated lantern if it still exists
        if let Some(mut lantern) = ctx.db.lantern().id().find(&event.lantern_id) {
            if !lantern.is_destroyed {
                lantern.is_destroyed = true;
                lantern.destroyed_at = Some(current_time);
                ctx.db.lantern().id().update(lantern);
                log::info!("[BeaconEvent] Expired beacon {} destroyed at ({:.0}, {:.0})", 
                          event.lantern_id, event.world_x, event.world_y);
            }
        }
    }
}

/// Mark beacon event as inactive when its lantern is destroyed
pub fn on_beacon_destroyed(ctx: &ReducerContext, lantern_id: u32) {
    // Find the event for this lantern
    if let Some(mut event) = ctx.db.beacon_drop_event()
        .iter()
        .find(|e| e.lantern_id == lantern_id && e.is_active) 
    {
        event.is_active = false;
        ctx.db.beacon_drop_event().id().update(event);
        log::info!("[BeaconEvent] Beacon event for lantern {} marked inactive", lantern_id);
    }
}

/// Check if a lantern is a server event beacon (used for invincibility check)
pub fn is_server_event_beacon(lantern: &Lantern) -> bool {
    lantern.lantern_type == LANTERN_TYPE_MEMORY_BEACON && lantern.is_monument
}

// === INITIALIZATION ===

/// Initialize the beacon event system (called from init_module)
/// No scheduled task needed - beacons spawn on Dusk transition
pub fn init_beacon_event_system(ctx: &ReducerContext) {
    // Just log initialization - actual spawning happens via on_dusk_started()
    log::info!("[BeaconEvent] Beacon event system initialized. Beacons will spawn at Dusk with {:.0}% chance.", 
              BEACON_SPAWN_CHANCE * 100.0);
    
    // Clean up any stale beacon events from previous runs
    cleanup_expired_beacon_events(ctx);
}
