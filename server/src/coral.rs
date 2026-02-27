/******************************************************************************
 *                                                                            *
 * Living Coral resource system - underwater harvestable corals that work     *
 * similar to stones. Requires Diving Pick to harvest and player must be      *
 * on water. Uses the combat system for damage and resource gathering.        *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{Table, ReducerContext, Identity, Timestamp};
use log;
use rand::Rng;

// Import necessary constants
use crate::PLAYER_RADIUS;
use crate::environment::{calculate_chunk_index, CHUNK_SIZE_TILES};

// --- Living Coral Constants ---

pub(crate) const LIVING_CORAL_RADIUS: f32 = 80.0; // Doubled for larger underwater presence
pub(crate) const LIVING_CORAL_COLLISION_Y_OFFSET: f32 = 60.0; // Doubled to match visual size
pub(crate) const PLAYER_LIVING_CORAL_COLLISION_DISTANCE_SQUARED: f32 = 
    (PLAYER_RADIUS + LIVING_CORAL_RADIUS) * (PLAYER_RADIUS + LIVING_CORAL_RADIUS);

// Resource and respawn constants
pub(crate) const MIN_LIVING_CORAL_RESPAWN_TIME_SECS: u64 = 1800;  // 30 minutes
pub(crate) const MAX_LIVING_CORAL_RESPAWN_TIME_SECS: u64 = 3600;  // 60 minutes

pub(crate) const LIVING_CORAL_INITIAL_HEALTH: u32 = 500;

// Resource depletion - coral yields limestone primarily
pub(crate) const LIVING_CORAL_MIN_RESOURCES: u32 = 150;
pub(crate) const LIVING_CORAL_MAX_RESOURCES: u32 = 300;

// --- Living Coral Table ---

#[spacetimedb::table(accessor = living_coral, public)]
#[derive(Clone, Debug)]
pub struct LivingCoral {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    pub health: u32,
    pub resource_remaining: u32,
    #[index(btree)]
    pub chunk_index: u32,
    /// When this coral should respawn. Use Timestamp::UNIX_EPOCH (0) for "not respawning".
    /// This allows efficient btree index range queries: .respawn_at().filter(1..=now)
    #[index(btree)]
    pub respawn_at: Timestamp,
    pub last_hit_time: Option<Timestamp>,
}

// --- Helper Functions ---

/// Create a new Living Coral at the specified position
pub fn create_living_coral(
    pos_x: f32, 
    pos_y: f32, 
    chunk_index: u32, 
    rng: &mut impl Rng
) -> LivingCoral {
    LivingCoral {
        id: 0, // auto_inc
        pos_x,
        pos_y,
        health: LIVING_CORAL_INITIAL_HEALTH,
        resource_remaining: rng.gen_range(LIVING_CORAL_MIN_RESOURCES..=LIVING_CORAL_MAX_RESOURCES),
        chunk_index,
        respawn_at: Timestamp::UNIX_EPOCH, // 0 = not respawning
        last_hit_time: None,
    }
}

/// Spawn Living Corals in underwater areas (shallow water near beaches/reefs)
/// Called during world generation
pub fn spawn_living_corals_in_chunk(
    ctx: &ReducerContext, 
    chunk_index: u32,
    target_count: u32
) -> u32 {
    use crate::{TileType, world_pos_to_tile_coords, get_tile_type_at_position, WORLD_WIDTH_TILES, TILE_SIZE_PX};
    
    let mut rng = ctx.rng();
    
    // Calculate chunk bounds in pixels
    let chunk_size = CHUNK_SIZE_TILES as f32;
    let chunks_per_row = WORLD_WIDTH_TILES / CHUNK_SIZE_TILES;
    let chunk_x = (chunk_index % chunks_per_row) as f32;
    let chunk_y = (chunk_index / chunks_per_row) as f32;
    
    let tile_size = TILE_SIZE_PX as f32;
    let chunk_start_x = chunk_x * chunk_size * tile_size;
    let chunk_start_y = chunk_y * chunk_size * tile_size;
    let chunk_end_x = chunk_start_x + (chunk_size * tile_size);
    let chunk_end_y = chunk_start_y + (chunk_size * tile_size);
    
    let mut spawned = 0;
    let mut attempts = 0;
    const MAX_ATTEMPTS: u32 = 100;
    
    while spawned < target_count && attempts < MAX_ATTEMPTS {
        attempts += 1;
        
        // Random position within chunk
        let pos_x = rng.gen_range(chunk_start_x..chunk_end_x);
        let pos_y = rng.gen_range(chunk_start_y..chunk_end_y);
        
        // Convert to tile coordinates to check tile type
        let (tile_x, tile_y) = world_pos_to_tile_coords(pos_x, pos_y);
        
        // Check if this is sea water (coral grows in sea water, not hot springs)
        if let Some(tile_type) = get_tile_type_at_position(ctx, tile_x, tile_y) {
            // Only spawn in Sea water, exclude HotSpringWater
            if !tile_type.is_sea_water() {
                continue; // Skip non-sea-water tiles (including hot springs)
            }
        } else {
            continue;
        }
        
        // Check minimum distance from existing corals
        let mut too_close = false;
        let min_distance_sq = 150.0 * 150.0;
        
        for existing_coral in ctx.db.living_coral().iter() {
            if existing_coral.respawn_at == Timestamp::UNIX_EPOCH { // Not respawning (active)
                let dx = pos_x - existing_coral.pos_x;
                let dy = pos_y - existing_coral.pos_y;
                let dist_sq = dx * dx + dy * dy;
                if dist_sq < min_distance_sq {
                    too_close = true;
                    break;
                }
            }
        }
        
        if too_close {
            continue;
        }
        
        // Spawn the coral
        let coral_chunk_index = calculate_chunk_index(pos_x, pos_y);
        let coral = create_living_coral(pos_x, pos_y, coral_chunk_index, &mut rng);
        ctx.db.living_coral().insert(coral);
        spawned += 1;
    }
    
    if spawned > 0 {
        log::info!("Spawned {} living coral(s) in chunk {}.", spawned, chunk_index);
    }
    
    spawned
}

// NOTE: Storm debris spawning has been moved to storm_debris.rs for better separation of concerns.
// See crate::storm_debris::spawn_storm_debris_on_beaches()