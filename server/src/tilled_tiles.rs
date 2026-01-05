/******************************************************************************
 *                                                                            *
 * Tilled Tiles System - Allows players to till terrain for farming.          *
 * Tilled tiles provide a +50% growth bonus to planted seeds.                 *
 * Tiles revert to their original type after 48 hours.                        *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{table, reducer, ReducerContext, Identity, Timestamp, Table, log, TimeDuration};
use spacetimedb::spacetimedb_lib::ScheduleAt;
use std::time::Duration;

use crate::{TileType, TILE_SIZE_PX, world_pos_to_tile_coords};
use crate::environment::{CHUNK_SIZE_TILES, is_position_on_monument};
// Import table traits for database access
use crate::world_chunk_data;
use crate::player;
use crate::active_equipment::active_equipment;
use crate::items::inventory_item;
use crate::items::item_definition;
// Import sound events
use crate::sound_events::{emit_sound_at_position_with_distance, SoundType};

// --- Constants ---

/// Duration in seconds before tilled tiles revert (48 real hours)
pub const TILLED_TILE_DURATION_SECS: u64 = 48 * 60 * 60; // 172800 seconds = 48 hours

/// How often to check for tiles to revert (every 5 minutes)
pub const TILLED_TILE_REVERSION_CHECK_INTERVAL_SECS: u64 = 300;

/// Growth bonus multiplier for prepared soil (Dirt or Tilled)
pub const PREPARED_SOIL_GROWTH_MULTIPLIER: f32 = 1.5; // +50% growth

// --- Tilled Tile Metadata Table ---

/// Stores metadata about tilled tiles for tracking reversion
#[spacetimedb::table(name = tilled_tile_metadata, public)]
#[derive(Clone, Debug)]
pub struct TilledTileMetadata {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    /// World tile X coordinate
    pub tile_x: i32,
    /// World tile Y coordinate  
    pub tile_y: i32,
    /// Original tile type (as u8) to revert to
    pub original_tile_type: u8,
    /// When this tile was tilled
    pub tilled_at: Timestamp,
    /// When this tile should revert
    pub reverts_at: Timestamp,
    /// Identity of player who tilled this tile
    pub tilled_by: Identity,
}

// --- Reversion Schedule Table ---

#[spacetimedb::table(name = tilled_tile_reversion_schedule, scheduled(process_tilled_tile_reversions))]
#[derive(Clone)]
pub struct TilledTileReversionSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

// --- Initialization ---

/// Initialize the tilled tile reversion system (called from main init)
pub fn init_tilled_tile_system(ctx: &ReducerContext) -> Result<(), String> {
    // Only start if no existing schedule
    if ctx.db.tilled_tile_reversion_schedule().count() == 0 {
        let reversion_interval = TimeDuration::from(Duration::from_secs(TILLED_TILE_REVERSION_CHECK_INTERVAL_SECS));
        
        crate::try_insert_schedule!(
            ctx.db.tilled_tile_reversion_schedule(),
            TilledTileReversionSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(reversion_interval),
            },
            "Tilled tile reversion"
        );
    }
    
    Ok(())
}

// --- Helper Functions ---

/// Check if a tile at the given world position is already tilled
pub fn is_tile_tilled(ctx: &ReducerContext, tile_x: i32, tile_y: i32) -> bool {
    for metadata in ctx.db.tilled_tile_metadata().iter() {
        if metadata.tile_x == tile_x && metadata.tile_y == tile_y {
            return true;
        }
    }
    false
}

/// Get the growth multiplier for prepared soil (Dirt or Tilled tiles)
/// Returns 1.5 (50% bonus) if on prepared soil, 1.0 otherwise
pub fn get_soil_growth_multiplier(ctx: &ReducerContext, plant_x: f32, plant_y: f32) -> f32 {
    let (tile_x, tile_y) = world_pos_to_tile_coords(plant_x, plant_y);
    
    if let Some(tile_type) = crate::get_tile_type_at_position(ctx, tile_x, tile_y) {
        if tile_type.is_prepared_soil() {
            return PREPARED_SOIL_GROWTH_MULTIPLIER;
        }
    }
    
    1.0 // No bonus
}

/// Result of attempting to till a tile
#[derive(Debug, Clone, PartialEq)]
pub enum TillResult {
    /// Successfully tilled the tile
    Success,
    /// Tile is already tilled (natural dirt counts as already prepared)
    AlreadyTilled,
    /// Tile type cannot be tilled (water, monument area, asphalt, etc.)
    CannotTill,
    /// Error during tilling operation
    Error(String),
}

/// Till a tile at the specified world coordinates
/// Returns TillResult indicating success or the specific failure reason
pub fn till_tile_at_position(
    ctx: &ReducerContext,
    world_x: f32,
    world_y: f32,
    tilled_by: Identity,
) -> TillResult {
    // Convert world position to tile coordinates
    let (tile_x, tile_y) = world_pos_to_tile_coords(world_x, world_y);
    
    // Check if position is on a monument (not tillable)
    if is_position_on_monument(ctx, world_x, world_y) {
        log::debug!("Cannot till at ({}, {}): monument area", tile_x, tile_y);
        return TillResult::CannotTill;
    }
    
    // Check if tile is already tilled
    if is_tile_tilled(ctx, tile_x, tile_y) {
        log::debug!("Tile at ({}, {}) is already tilled", tile_x, tile_y);
        return TillResult::AlreadyTilled;
    }
    
    // Get current tile type
    let current_tile_type = match crate::get_tile_type_at_position(ctx, tile_x, tile_y) {
        Some(t) => t,
        None => {
            log::warn!("Could not get tile type at ({}, {})", tile_x, tile_y);
            return TillResult::Error("Could not get tile type".to_string());
        }
    };
    
    // Check if tile type can be tilled
    // Natural Dirt is already "prepared soil" - treat as already tilled
    if current_tile_type == TileType::Dirt {
        log::debug!("Tile at ({}, {}) is natural dirt (already prepared)", tile_x, tile_y);
        return TillResult::AlreadyTilled;
    }
    
    // Check if this tile type can be tilled
    if !current_tile_type.can_be_tilled() {
        log::debug!("Tile type {:?} at ({}, {}) cannot be tilled", current_tile_type, tile_x, tile_y);
        return TillResult::CannotTill;
    }
    
    // Store original tile type for reversion
    let original_type_u8 = current_tile_type.to_u8();
    
    // Update the world chunk data to change the tile to Tilled
    match update_tile_in_chunk(ctx, tile_x, tile_y, TileType::Tilled) {
        Ok(false) | Err(_) => {
            return TillResult::Error("Failed to update tile in chunk data".to_string());
        }
        Ok(true) => {}
    }
    
    // Store metadata for reversion
    let now = ctx.timestamp;
    let reverts_at = now + TimeDuration::from(Duration::from_secs(TILLED_TILE_DURATION_SECS));
    
    let metadata = TilledTileMetadata {
        id: 0, // Auto-increment
        tile_x,
        tile_y,
        original_tile_type: original_type_u8,
        tilled_at: now,
        reverts_at,
        tilled_by,
    };
    
    match ctx.db.tilled_tile_metadata().try_insert(metadata) {
        Ok(_) => {
            log::info!("Tilled tile at ({}, {}) by {:?}, reverts at {:?}", 
                      tile_x, tile_y, tilled_by, reverts_at);
            TillResult::Success
        }
        Err(e) => {
            log::error!("Failed to insert tilled tile metadata: {:?}", e);
            TillResult::Error("Failed to store tilled tile metadata".to_string())
        }
    }
}

/// Update a tile in the world chunk data
fn update_tile_in_chunk(ctx: &ReducerContext, tile_x: i32, tile_y: i32, new_type: TileType) -> Result<bool, String> {
    // Calculate chunk coordinates
    let chunk_x = tile_x / CHUNK_SIZE_TILES as i32;
    let chunk_y = tile_y / CHUNK_SIZE_TILES as i32;
    
    // Find the chunk
    let chunks: Vec<_> = ctx.db.world_chunk_data()
        .idx_chunk_coords()
        .filter((chunk_x, chunk_y))
        .collect();
    
    if chunks.is_empty() {
        log::warn!("No chunk found at ({}, {})", chunk_x, chunk_y);
        return Ok(false);
    }
    
    let mut chunk = chunks.into_iter().next().unwrap();
    
    // Calculate local tile position within the chunk
    let local_tile_x = (tile_x % CHUNK_SIZE_TILES as i32) as usize;
    let local_tile_y = (tile_y % CHUNK_SIZE_TILES as i32) as usize;
    
    // Handle negative tile coordinates
    let local_tile_x = if tile_x < 0 && local_tile_x != 0 {
        CHUNK_SIZE_TILES as usize - local_tile_x
    } else {
        local_tile_x
    };
    let local_tile_y = if tile_y < 0 && local_tile_y != 0 {
        CHUNK_SIZE_TILES as usize - local_tile_y
    } else {
        local_tile_y
    };
    
    let tile_index = local_tile_y * CHUNK_SIZE_TILES as usize + local_tile_x;
    
    if tile_index >= chunk.tile_types.len() {
        log::error!("Tile index {} out of bounds for chunk at ({}, {})", tile_index, chunk_x, chunk_y);
        return Err("Tile index out of bounds".to_string());
    }
    
    // Update the tile type
    chunk.tile_types[tile_index] = new_type.to_u8();
    
    // Update the chunk in the database
    ctx.db.world_chunk_data().id().update(chunk);
    
    Ok(true)
}

/// Revert a tilled tile to its original type
fn revert_tilled_tile(ctx: &ReducerContext, metadata: &TilledTileMetadata) -> Result<(), String> {
    // Get the original tile type
    let original_type = match TileType::from_u8(metadata.original_tile_type) {
        Some(t) => t,
        None => {
            log::error!("Invalid original tile type {} for tilled tile at ({}, {})", 
                       metadata.original_tile_type, metadata.tile_x, metadata.tile_y);
            return Err("Invalid original tile type".to_string());
        }
    };
    
    // Log before moving the value
    log::info!("Reverting tilled tile at ({}, {}) back to {:?}", 
              metadata.tile_x, metadata.tile_y, original_type);
    
    // Update the chunk data (clone since TileType doesn't implement Copy)
    update_tile_in_chunk(ctx, metadata.tile_x, metadata.tile_y, original_type.clone())?;
    
    // Delete the metadata
    ctx.db.tilled_tile_metadata().id().delete(metadata.id);
    
    Ok(())
}

// --- Scheduled Reducer ---

/// Scheduled reducer to process tilled tile reversions
#[spacetimedb::reducer]
pub fn process_tilled_tile_reversions(
    ctx: &ReducerContext,
    _schedule: TilledTileReversionSchedule,
) -> Result<(), String> {
    // Security check - only scheduler can run this
    if ctx.sender != ctx.identity() {
        return Err("Tilled tile reversion can only be run by scheduler".to_string());
    }
    
    let now = ctx.timestamp;
    let mut reverted_count = 0;
    
    // Collect tiles that need to be reverted
    let tiles_to_revert: Vec<_> = ctx.db.tilled_tile_metadata()
        .iter()
        .filter(|m| m.reverts_at <= now)
        .collect();
    
    // Revert each expired tile
    for metadata in tiles_to_revert {
        match revert_tilled_tile(ctx, &metadata) {
            Ok(_) => reverted_count += 1,
            Err(e) => log::error!("Failed to revert tilled tile at ({}, {}): {}", 
                                 metadata.tile_x, metadata.tile_y, e),
        }
    }
    
    if reverted_count > 0 {
        log::info!("Reverted {} tilled tiles", reverted_count);
    }
    
    Ok(())
}

// --- Public Reducer for Tilling ---

/// Reducer called when a player uses a tiller tool
#[spacetimedb::reducer]
pub fn till_ground(ctx: &ReducerContext, world_x: f32, world_y: f32) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Verify player exists
    let player = ctx.db.player().identity().find(&player_id)
        .ok_or_else(|| "Player not found".to_string())?;
    
    // Check if player has a tiller equipped
    let equipped_item = ctx.db.active_equipment().player_identity().find(player_id);
    let has_tiller = match equipped_item {
        Some(equip) => {
            if let Some(item_instance_id) = equip.equipped_item_instance_id {
                if let Some(item) = ctx.db.inventory_item().instance_id().find(item_instance_id) {
                    // Look up the item definition by ID
                    if let Some(def) = ctx.db.item_definition().id().find(item.item_def_id) {
                        def.name.contains("Tiller")
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            }
        }
        None => false,
    };
    
    if !has_tiller {
        return Err("Must have a tiller equipped to till ground".to_string());
    }
    
    // Check distance from player (interaction range)
    let dx = world_x - player.position_x;
    let dy = world_y - player.position_y;
    let distance_sq = dx * dx + dy * dy;
    let max_range_sq = (TILE_SIZE_PX as f32 * 2.0).powi(2); // 2 tiles range
    
    if distance_sq > max_range_sq {
        return Err("Target is too far away".to_string());
    }
    
    // Attempt to till the tile
    match till_tile_at_position(ctx, world_x, world_y, player_id) {
        TillResult::Success => {
            // Play sound effect
            let _ = emit_sound_at_position_with_distance(
                ctx,
                SoundType::TillDirt,
                world_x,
                world_y,
                1.0,
                100.0,
                player_id,
            );
            Ok(())
        }
        TillResult::AlreadyTilled => {
            let _ = emit_sound_at_position_with_distance(
                ctx,
                SoundType::ErrorTillingDirt,
                world_x,
                world_y,
                1.0,
                50.0,
                player_id,
            );
            Err("This soil is already prepared".to_string())
        }
        TillResult::CannotTill => {
            let _ = emit_sound_at_position_with_distance(
                ctx,
                SoundType::ErrorTillingFailed,
                world_x,
                world_y,
                1.0,
                50.0,
                player_id,
            );
            Err("This ground cannot be tilled".to_string())
        }
        TillResult::Error(e) => Err(e)
    }
}
