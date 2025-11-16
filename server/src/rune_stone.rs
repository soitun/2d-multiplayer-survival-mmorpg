/******************************************************************************
 *                                                                            *
 * Defines the rune stone system - mystical monuments that provide passive   *
 * effects. Three types:                                                      *
 * - Green (Agrarian): Boosts growth of season-specific plants               *
 * - Red (Production): Reduces crafting time for specific items             *
 * - Blue (Memory Shard): Spawns memory shards at night                     *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{SpacetimeType, Timestamp, Table};
use crate::{PLAYER_RADIUS};
use crate::world_state::{Season, world_state as WorldStateTableTrait};
use crate::items::item_definition as ItemDefinitionTableTrait;
use crate::dropped_item::dropped_item as DroppedItemTableTrait;
use crate::harvestable_resource::harvestable_resource as HarvestableResourceTableTrait;

// --- Rune Stone Constants ---

// Collision settings
pub(crate) const RUNE_STONE_RADIUS: f32 = 40.0; // Slightly larger than trees
pub(crate) const RUNE_STONE_COLLISION_Y_OFFSET: f32 = 50.0;
pub(crate) const PLAYER_RUNE_STONE_COLLISION_DISTANCE_SQUARED: f32 = 
    (PLAYER_RADIUS + RUNE_STONE_RADIUS) * (PLAYER_RADIUS + RUNE_STONE_RADIUS);

// Spawning Parameters - Balanced for gameplay
// Reduced density for 400x400 map: ~8-12 rune stones total (was 29)
// Player can walk ~400 tiles in ~30 seconds, so spacing should be meaningful
pub(crate) const RUNE_STONE_DENSITY_PERCENT: f32 = 0.0001; // 0.01% of map tiles (~1 per 10,000 tiles)
pub(crate) const RUNE_STONE_SPAWN_NOISE_FREQUENCY: f64 = 4.0; // Lower frequency for more spread out
pub(crate) const RUNE_STONE_SPAWN_NOISE_THRESHOLD: f64 = 0.75; // Higher threshold for rarer spawns
pub(crate) const RUNE_STONE_SPAWN_WORLD_MARGIN_TILES: u32 = 5; // Keep away from edges
pub(crate) const MAX_RUNE_STONE_SEEDING_ATTEMPTS_FACTOR: u32 = 10; // More attempts for rare spawns
pub(crate) const MIN_RUNE_STONE_DISTANCE_PX: f32 = 1200.0; // Very far apart - rare and special monuments
pub(crate) const MIN_RUNE_STONE_DISTANCE_SQ: f32 = MIN_RUNE_STONE_DISTANCE_PX * MIN_RUNE_STONE_DISTANCE_PX;
pub(crate) const MIN_RUNE_STONE_TREE_DISTANCE_SQ: f32 = 100.0 * 100.0; // Minimum distance from trees (100px)
pub(crate) const MIN_RUNE_STONE_STONE_DISTANCE_SQ: f32 = 100.0 * 100.0; // Minimum distance from stones (100px)
pub(crate) const MIN_RUNE_STONE_BARREL_DISTANCE_SQ: f32 = 80.0 * 80.0; // Minimum distance from barrels (80px)

// Effect Radius (in pixels) - MASSIVE economic zones for PvP hotspots
pub(crate) const RUNE_STONE_EFFECT_RADIUS: f32 = 2000.0; // Huge AoE radius - true economic centers
pub(crate) const RUNE_STONE_EFFECT_RADIUS_SQUARED: f32 = RUNE_STONE_EFFECT_RADIUS * RUNE_STONE_EFFECT_RADIUS;

// Green (Agrarian) Effect Constants - ALL plants grow faster
pub(crate) const GREEN_RUNE_GROWTH_BOOST_MULTIPLIER: f32 = 1.5; // 1.5x growth rate for ALL plants
pub(crate) const GREEN_RUNE_MAX_EFFECT_DISTANCE: f32 = RUNE_STONE_EFFECT_RADIUS;

// Red (Production) Effect Constants - ALL crafting is faster
pub(crate) const RED_RUNE_CRAFTING_TIME_REDUCTION: f32 = 0.667; // 1.5x crafting speed (0.667x time = 1.5x speed)
pub(crate) const RED_RUNE_ITEMS_PER_NIGHT: u32 = 8; // Max items per night
pub(crate) const RED_RUNE_ITEM_SPAWN_INTERVAL_SECS: u64 = 180; // One item every 3 minutes during night
pub(crate) const RED_RUNE_ITEM_SPAWN_RADIUS: f32 = RUNE_STONE_EFFECT_RADIUS;
pub(crate) const RED_RUNE_ITEM_MIN_DISTANCE: f32 = 150.0;

// Green (Agrarian) Effect Constants
pub(crate) const GREEN_RUNE_PLANTS_PER_NIGHT: u32 = 10; // Max plants per night
pub(crate) const GREEN_RUNE_PLANT_SPAWN_INTERVAL_SECS: u64 = 150; // One plant every 2.5 minutes during night
pub(crate) const GREEN_RUNE_PLANT_SPAWN_RADIUS: f32 = RUNE_STONE_EFFECT_RADIUS;
pub(crate) const GREEN_RUNE_PLANT_MIN_DISTANCE: f32 = 150.0;

// Blue (Memory Shard) Effect Constants - Increased for PvP hotspots
pub(crate) const BLUE_RUNE_SHARDS_PER_NIGHT: u32 = 15; // Max shards per night (increased from 5)
pub(crate) const BLUE_RUNE_SHARD_SPAWN_INTERVAL_SECS: u64 = 120; // One shard every 2 minutes during night (faster spawn rate)
pub(crate) const BLUE_RUNE_SHARD_SPAWN_RADIUS: f32 = RUNE_STONE_EFFECT_RADIUS; // Spawn within full effect radius
pub(crate) const BLUE_RUNE_SHARD_MIN_DISTANCE: f32 = 150.0; // Minimum distance from rune stone (spawn away from center)

// Night Lighting Constants
pub(crate) const RUNE_STONE_LIGHT_RADIUS: f32 = 400.0; // Light radius for night glow

// --- Rune Stone Types ---

#[derive(Clone, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, SpacetimeType)]
pub enum RuneStoneType {
    Green,  // Agrarian - boosts plant growth
    Red,    // Production - reduces crafting time
    Blue,   // Memory Shard - spawns shards at night
}

// Simplified configs - no need to track specific items/plants anymore
// The rune stones now boost ALL crafting/growth universally at 1.5x

#[derive(Clone, Debug, SpacetimeType)]
pub struct AgrarianEffectConfig {
    pub plants_spawned_this_night: u32, // Track plants spawned in current night cycle
    pub last_plant_spawn_time: Option<Timestamp>, // When last plant was spawned
    pub night_start_time: Option<Timestamp>, // When current night started
}

#[derive(Clone, Debug, SpacetimeType)]
pub struct ProductionEffectConfig {
    pub items_spawned_this_night: u32, // Track items spawned in current night cycle
    pub last_item_spawn_time: Option<Timestamp>, // When last item was spawned
    pub night_start_time: Option<Timestamp>, // When current night started
}

#[derive(Clone, Debug, SpacetimeType)]
pub struct MemoryShardEffectConfig {
    pub shards_spawned_this_night: u32, // Track shards spawned in current night cycle
    pub last_shard_spawn_time: Option<Timestamp>, // When last shard was spawned
    pub night_start_time: Option<Timestamp>, // When current night started
}

#[spacetimedb::table(name = rune_stone, public)]
#[derive(Clone)]
pub struct RuneStone {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    #[index(btree)]
    pub chunk_index: u32,
    pub rune_type: RuneStoneType,
    
    // Effect configurations (only one will be populated based on rune_type)
    pub agrarian_config: Option<AgrarianEffectConfig>,
    pub production_config: Option<ProductionEffectConfig>,
    pub memory_shard_config: Option<MemoryShardEffectConfig>,
}

// --- Scheduled Reducer Tables ---

#[spacetimedb::table(name = rune_stone_shard_spawn_schedule, scheduled(spawn_memory_shards_at_night))]
#[derive(Clone)]
pub struct RuneStoneShardSpawnSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: spacetimedb::spacetimedb_lib::ScheduleAt,
}

#[spacetimedb::table(name = rune_stone_item_spawn_schedule, scheduled(spawn_items_at_night))]
#[derive(Clone)]
pub struct RuneStoneItemSpawnSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: spacetimedb::spacetimedb_lib::ScheduleAt,
}

#[spacetimedb::table(name = rune_stone_plant_spawn_schedule, scheduled(spawn_plants_at_night))]
#[derive(Clone)]
pub struct RuneStonePlantSpawnSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: spacetimedb::spacetimedb_lib::ScheduleAt,
}

// --- Helper Functions ---

/// Check if a position is within range of a green rune stone that boosts the given plant type
/// Get growth multiplier for ALL plants near green rune stones
/// Simplified: 1.5x growth for ANY plant within 2000px of a green rune stone
pub fn get_green_rune_growth_multiplier(
    ctx: &spacetimedb::ReducerContext,
    plant_x: f32,
    plant_y: f32,
    plant_type: &crate::plants_database::PlantType,
) -> f32 {
    // Memory shards are technological debris, not biological plants - they can't be "grown"
    if *plant_type == crate::plants_database::PlantType::MemoryShard {
        return 1.0; // No bonus for memory shards
    }
    
    // Check all green rune stones - if plant is within range of ANY green rune, it gets the bonus
    for rune_stone in ctx.db.rune_stone().iter() {
        if rune_stone.rune_type != RuneStoneType::Green {
            continue;
        }
        
        // Check distance
        let dx = plant_x - rune_stone.pos_x;
        let dy = plant_y - rune_stone.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= RUNE_STONE_EFFECT_RADIUS_SQUARED {
            // 1.5x growth for ALL plants in the zone
            return GREEN_RUNE_GROWTH_BOOST_MULTIPLIER;
        }
    }
    
    1.0 // No bonus
}

/// Get crafting time multiplier for ALL items near red rune stones
/// Simplified: 1.5x crafting speed for ANY item within 2000px of a red rune stone
pub fn get_red_rune_crafting_time_multiplier(
    ctx: &spacetimedb::ReducerContext,
    player_x: f32,
    player_y: f32,
    _item_def_id: u64, // No longer needed - all items get the bonus
) -> f32 {
    // Check all red rune stones - if player is within range of ANY red rune, they get the bonus
    for rune_stone in ctx.db.rune_stone().iter() {
        if rune_stone.rune_type != RuneStoneType::Red {
            continue;
        }
        
        // Check distance
        let dx = player_x - rune_stone.pos_x;
        let dy = player_y - rune_stone.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= RUNE_STONE_EFFECT_RADIUS_SQUARED {
            // 1.5x crafting speed for ALL items in the zone (0.667x time = 1.5x speed)
            return RED_RUNE_CRAFTING_TIME_REDUCTION;
        }
    }
    
    1.0 // No reduction
}

/// Scheduled reducer to spawn memory shards from blue rune stones at night
#[spacetimedb::reducer]
pub fn spawn_memory_shards_at_night(
    ctx: &spacetimedb::ReducerContext,
    _schedule: RuneStoneShardSpawnSchedule,
) -> Result<(), String> {
    use spacetimedb::TimeDuration;
    use std::time::Duration;
    use rand::Rng;
    
    let world_state = ctx.db.world_state().iter().next().ok_or_else(|| {
        "WorldState singleton not found".to_string()
    })?;
    
    let time_of_day = &world_state.time_of_day;
    
    // Only spawn during night periods (twilight evening to twilight morning)
    let is_night_period = matches!(
        time_of_day,
        crate::world_state::TimeOfDay::TwilightEvening
            | crate::world_state::TimeOfDay::Night
            | crate::world_state::TimeOfDay::Midnight
            | crate::world_state::TimeOfDay::TwilightMorning
    );
    
    if !is_night_period {
        // Not night time, reschedule for later
        let check_interval = TimeDuration::from(Duration::from_secs(BLUE_RUNE_SHARD_SPAWN_INTERVAL_SECS));
        ctx.db.rune_stone_shard_spawn_schedule().insert(RuneStoneShardSpawnSchedule {
            id: 0,
            scheduled_at: check_interval.into(),
        });
        return Ok(());
    }
    
    // Find Memory Shard item definition
    let memory_shard_def_id = ctx.db.item_definition().iter()
        .find(|def| def.name == "Memory Shard")
        .map(|def| def.id);
    
    let memory_shard_def_id = match memory_shard_def_id {
        Some(id) => id,
        None => {
            log::warn!("Memory Shard item definition not found, skipping shard spawn");
            return Ok(());
        }
    };
    
    let mut rng = ctx.rng();
    let current_time = ctx.timestamp;
    
    // Process all blue rune stones
    let mut rune_stones_to_update = Vec::new();
    
    for rune_stone in ctx.db.rune_stone().iter() {
        if rune_stone.rune_type != RuneStoneType::Blue {
            continue;
        }
        
        let mut config = rune_stone.memory_shard_config.clone().unwrap_or_else(|| {
            MemoryShardEffectConfig {
                shards_spawned_this_night: 0,
                last_shard_spawn_time: None,
                night_start_time: None,
            }
        });
        
        // Check if this is a new night cycle (reset counter)
        let is_new_night = match config.night_start_time {
            Some(night_start) => {
                // Check if we've transitioned to a new night
                // Simple check: if last spawn was more than 30 minutes ago, assume new night
                let time_since_night_start = current_time.to_micros_since_unix_epoch()
                    .saturating_sub(night_start.to_micros_since_unix_epoch());
                time_since_night_start > 30 * 60 * 1_000_000 // 30 minutes in microseconds
            }
            None => true, // First night
        };
        
        if is_new_night {
            config.shards_spawned_this_night = 0;
            config.night_start_time = Some(current_time);
        }
        
        // Check if we can spawn more shards this night
        if config.shards_spawned_this_night >= BLUE_RUNE_SHARDS_PER_NIGHT {
            // Still need to update config even if not spawning
            rune_stones_to_update.push((rune_stone.id, config));
            continue; // Already spawned max shards this night
        }
        
        // Check if enough time has passed since last spawn
        let can_spawn = match config.last_shard_spawn_time {
            Some(last_spawn) => {
                let time_since_last = current_time.to_micros_since_unix_epoch()
                    .saturating_sub(last_spawn.to_micros_since_unix_epoch());
                time_since_last >= (BLUE_RUNE_SHARD_SPAWN_INTERVAL_SECS * 1_000_000) as i64
            }
            None => true, // First spawn of the night
        };
        
        if can_spawn {
            // Spawn a memory shard away from the rune stone center, within its radius
            // This creates PvP hotspots around the rune stone, not directly on it
            let angle = rng.gen_range(0.0..std::f32::consts::TAU);
            let distance = rng.gen_range(BLUE_RUNE_SHARD_MIN_DISTANCE..BLUE_RUNE_SHARD_SPAWN_RADIUS);
            let shard_x = rune_stone.pos_x + angle.cos() * distance;
            let shard_y = rune_stone.pos_y + angle.sin() * distance;
            
            // Check if position is valid (not in water, etc.)
            if !crate::environment::is_position_on_water(ctx, shard_x, shard_y) {
                let chunk_idx = crate::environment::calculate_chunk_index(shard_x, shard_y);
                
                // Create dropped item
                ctx.db.dropped_item().insert(crate::dropped_item::DroppedItem {
                    id: 0,
                    item_def_id: memory_shard_def_id,
                    quantity: 1,
                    pos_x: shard_x,
                    pos_y: shard_y,
                    chunk_index: chunk_idx,
                    created_at: current_time,
                    item_data: None,
                });
                
                config.shards_spawned_this_night += 1;
                config.last_shard_spawn_time = Some(current_time);
                
                log::info!(
                    "Blue rune stone {} spawned memory shard {} at ({:.1}, {:.1})",
                    rune_stone.id, config.shards_spawned_this_night, shard_x, shard_y
                );
            }
        }
        
        // Store config for update
        rune_stones_to_update.push((rune_stone.id, config));
    }
    
    // Update all rune stones
    for (rune_stone_id, config) in rune_stones_to_update {
        if let Some(mut rune_stone) = ctx.db.rune_stone().id().find(&rune_stone_id) {
            rune_stone.memory_shard_config = Some(config);
            ctx.db.rune_stone().id().update(rune_stone);
        }
    }
    
    // Reschedule for next check
    let check_interval = TimeDuration::from(Duration::from_secs(BLUE_RUNE_SHARD_SPAWN_INTERVAL_SECS));
    ctx.db.rune_stone_shard_spawn_schedule().insert(RuneStoneShardSpawnSchedule {
        id: 0,
        scheduled_at: check_interval.into(),
    });
    
    Ok(())
}

/// Scheduled reducer to spawn items from red rune stones at night
#[spacetimedb::reducer]
pub fn spawn_items_at_night(
    ctx: &spacetimedb::ReducerContext,
    _schedule: RuneStoneItemSpawnSchedule,
) -> Result<(), String> {
    use spacetimedb::TimeDuration;
    use std::time::Duration;
    use rand::Rng;
    
    let world_state = ctx.db.world_state().iter().next().ok_or_else(|| {
        "WorldState singleton not found".to_string()
    })?;
    
    let time_of_day = &world_state.time_of_day;
    
    // Only spawn during night periods
    let is_night_period = matches!(
        time_of_day,
        crate::world_state::TimeOfDay::TwilightEvening
            | crate::world_state::TimeOfDay::Night
            | crate::world_state::TimeOfDay::Midnight
            | crate::world_state::TimeOfDay::TwilightMorning
    );
    
    if !is_night_period {
        let check_interval = TimeDuration::from(Duration::from_secs(RED_RUNE_ITEM_SPAWN_INTERVAL_SECS));
        ctx.db.rune_stone_item_spawn_schedule().insert(RuneStoneItemSpawnSchedule {
            id: 0,
            scheduled_at: check_interval.into(),
        });
        return Ok(());
    }
    
    let mut rng = ctx.rng();
    let current_time = ctx.timestamp;
    
    // Process all red rune stones
    let mut rune_stones_to_update = Vec::new();
    
    for rune_stone in ctx.db.rune_stone().iter() {
        if rune_stone.rune_type != RuneStoneType::Red {
            continue;
        }
        
        let mut config = match rune_stone.production_config.clone() {
            Some(c) => c,
            None => continue, // Skip if no config
        };
        
        // Check if this is a new night cycle (reset counter)
        let is_new_night = match config.night_start_time {
            Some(night_start) => {
                let time_since_night_start = current_time.to_micros_since_unix_epoch()
                    .saturating_sub(night_start.to_micros_since_unix_epoch());
                time_since_night_start > 30 * 60 * 1_000_000 // 30 minutes
            }
            None => true,
        };
        
        if is_new_night {
            config.items_spawned_this_night = 0;
            config.night_start_time = Some(current_time);
        }
        
        // Check if we can spawn more items this night
        if config.items_spawned_this_night >= RED_RUNE_ITEMS_PER_NIGHT {
            rune_stones_to_update.push((rune_stone.id, config));
            continue;
        }
        
        // Check if enough time has passed since last spawn
        let can_spawn = match config.last_item_spawn_time {
            Some(last_spawn) => {
                let time_since_last = current_time.to_micros_since_unix_epoch()
                    .saturating_sub(last_spawn.to_micros_since_unix_epoch());
                time_since_last >= (RED_RUNE_ITEM_SPAWN_INTERVAL_SECS * 1_000_000) as i64
            }
            None => true,
        };
        
        if can_spawn {
            // Pick a random craftable item from ALL craftable items (items with crafting_cost)
            let craftable_items: Vec<_> = ctx.db.item_definition().iter()
                .filter(|item| item.crafting_cost.is_some())
                .collect();
            
            if craftable_items.is_empty() {
                rune_stones_to_update.push((rune_stone.id, config));
                continue;
            }
            
            let item_def_id = craftable_items[rng.gen_range(0..craftable_items.len())].id;
            
            // Spawn item away from rune stone center
            let angle = rng.gen_range(0.0..std::f32::consts::TAU);
            let distance = rng.gen_range(RED_RUNE_ITEM_MIN_DISTANCE..RED_RUNE_ITEM_SPAWN_RADIUS);
            let item_x = rune_stone.pos_x + angle.cos() * distance;
            let item_y = rune_stone.pos_y + angle.sin() * distance;
            
            // Check if position is valid
            if !crate::environment::is_position_on_water(ctx, item_x, item_y) {
                let chunk_idx = crate::environment::calculate_chunk_index(item_x, item_y);
                
                // Create dropped item
                ctx.db.dropped_item().insert(crate::dropped_item::DroppedItem {
                    id: 0,
                    item_def_id,
                    quantity: 1,
                    pos_x: item_x,
                    pos_y: item_y,
                    chunk_index: chunk_idx,
                    created_at: current_time,
                    item_data: None,
                });
                
                config.items_spawned_this_night += 1;
                config.last_item_spawn_time = Some(current_time);
                
                log::info!(
                    "Red rune stone {} spawned item (def_id: {}) {} at ({:.1}, {:.1})",
                    rune_stone.id, item_def_id, config.items_spawned_this_night, item_x, item_y
                );
            }
        }
        
        rune_stones_to_update.push((rune_stone.id, config));
    }
    
    // Update all rune stones
    for (rune_stone_id, config) in rune_stones_to_update {
        if let Some(mut rune_stone) = ctx.db.rune_stone().id().find(&rune_stone_id) {
            rune_stone.production_config = Some(config);
            ctx.db.rune_stone().id().update(rune_stone);
        }
    }
    
    // Reschedule
    let check_interval = TimeDuration::from(Duration::from_secs(RED_RUNE_ITEM_SPAWN_INTERVAL_SECS));
    ctx.db.rune_stone_item_spawn_schedule().insert(RuneStoneItemSpawnSchedule {
        id: 0,
        scheduled_at: check_interval.into(),
    });
    
    Ok(())
}

/// Scheduled reducer to spawn plants from green rune stones at night
#[spacetimedb::reducer]
pub fn spawn_plants_at_night(
    ctx: &spacetimedb::ReducerContext,
    _schedule: RuneStonePlantSpawnSchedule,
) -> Result<(), String> {
    use spacetimedb::TimeDuration;
    use std::time::Duration;
    use rand::Rng;
    
    let world_state = ctx.db.world_state().iter().next().ok_or_else(|| {
        "WorldState singleton not found".to_string()
    })?;
    
    let time_of_day = &world_state.time_of_day;
    let current_season = world_state.current_season.clone();
    
    // Only spawn during night periods
    let is_night_period = matches!(
        time_of_day,
        crate::world_state::TimeOfDay::TwilightEvening
            | crate::world_state::TimeOfDay::Night
            | crate::world_state::TimeOfDay::Midnight
            | crate::world_state::TimeOfDay::TwilightMorning
    );
    
    if !is_night_period {
        let check_interval = TimeDuration::from(Duration::from_secs(GREEN_RUNE_PLANT_SPAWN_INTERVAL_SECS));
        ctx.db.rune_stone_plant_spawn_schedule().insert(RuneStonePlantSpawnSchedule {
            id: 0,
            scheduled_at: check_interval.into(),
        });
        return Ok(());
    }
    
    let mut rng = ctx.rng();
    let current_time = ctx.timestamp;
    
    // Process all green rune stones
    let mut rune_stones_to_update = Vec::new();
    
    for rune_stone in ctx.db.rune_stone().iter() {
        if rune_stone.rune_type != RuneStoneType::Green {
            continue;
        }
        
        let mut config = match rune_stone.agrarian_config.clone() {
            Some(c) => c,
            None => continue,
        };
        
        // Get the plant type for current season
        let plant_type = match current_season {
            crate::world_state::Season::Spring => crate::plants_database::PlantType::Carrot,
            crate::world_state::Season::Summer => crate::plants_database::PlantType::Potato,
            crate::world_state::Season::Autumn => crate::plants_database::PlantType::Pumpkin,
            crate::world_state::Season::Winter => crate::plants_database::PlantType::Beets,
        };
        
        // Check if this is a new night cycle
        let is_new_night = match config.night_start_time {
            Some(night_start) => {
                let time_since_night_start = current_time.to_micros_since_unix_epoch()
                    .saturating_sub(night_start.to_micros_since_unix_epoch());
                time_since_night_start > 30 * 60 * 1_000_000
            }
            None => true,
        };
        
        if is_new_night {
            config.plants_spawned_this_night = 0;
            config.night_start_time = Some(current_time);
        }
        
        // Check if we can spawn more plants this night
        if config.plants_spawned_this_night >= GREEN_RUNE_PLANTS_PER_NIGHT {
            rune_stones_to_update.push((rune_stone.id, config));
            continue;
        }
        
        // Check if enough time has passed since last spawn
        let can_spawn = match config.last_plant_spawn_time {
            Some(last_spawn) => {
                let time_since_last = current_time.to_micros_since_unix_epoch()
                    .saturating_sub(last_spawn.to_micros_since_unix_epoch());
                time_since_last >= (GREEN_RUNE_PLANT_SPAWN_INTERVAL_SECS * 1_000_000) as i64
            }
            None => true,
        };
        
        if can_spawn {
            // Spawn plant away from rune stone center
            let angle = rng.gen_range(0.0..std::f32::consts::TAU);
            let distance = rng.gen_range(GREEN_RUNE_PLANT_MIN_DISTANCE..GREEN_RUNE_PLANT_SPAWN_RADIUS);
            let plant_x = rune_stone.pos_x + angle.cos() * distance;
            let plant_y = rune_stone.pos_y + angle.sin() * distance;
            
            // Check if position is valid
            if !crate::environment::is_position_on_water(ctx, plant_x, plant_y) {
                let chunk_idx = crate::environment::calculate_chunk_index(plant_x, plant_y);
                
                // Create harvestable resource (spawns fully grown, ready to harvest)
                ctx.db.harvestable_resource().insert(crate::harvestable_resource::HarvestableResource {
                    id: 0,
                    plant_type,
                    pos_x: plant_x,
                    pos_y: plant_y,
                    chunk_index: chunk_idx,
                    respawn_at: None, // Not a respawning wild plant
                    is_player_planted: false, // Spawned by rune stone, not player
                });
                
                config.plants_spawned_this_night += 1;
                config.last_plant_spawn_time = Some(current_time);
                
                log::info!(
                    "Green rune stone {} spawned {:?} plant {} at ({:.1}, {:.1})",
                    rune_stone.id, plant_type, config.plants_spawned_this_night, plant_x, plant_y
                );
            }
        }
        
        rune_stones_to_update.push((rune_stone.id, config));
    }
    
    // Update all rune stones
    for (rune_stone_id, config) in rune_stones_to_update {
        if let Some(mut rune_stone) = ctx.db.rune_stone().id().find(&rune_stone_id) {
            rune_stone.agrarian_config = Some(config);
            ctx.db.rune_stone().id().update(rune_stone);
        }
    }
    
    // Reschedule
    let check_interval = TimeDuration::from(Duration::from_secs(GREEN_RUNE_PLANT_SPAWN_INTERVAL_SECS));
    ctx.db.rune_stone_plant_spawn_schedule().insert(RuneStonePlantSpawnSchedule {
        id: 0,
        scheduled_at: check_interval.into(),
    });
    
    Ok(())
}

/// Initialize the rune stone shard spawning system
pub fn init_rune_stone_shard_spawning(ctx: &spacetimedb::ReducerContext) -> Result<(), String> {
    use spacetimedb::TimeDuration;
    use std::time::Duration;
    
    // Only start if no existing schedule
    if ctx.db.rune_stone_shard_spawn_schedule().count() == 0 {
        let check_interval = TimeDuration::from(Duration::from_secs(BLUE_RUNE_SHARD_SPAWN_INTERVAL_SECS));
        
        ctx.db.rune_stone_shard_spawn_schedule().insert(RuneStoneShardSpawnSchedule {
            id: 0,
            scheduled_at: check_interval.into(),
        });
        
        log::info!("Initialized rune stone shard spawning system");
    }
    
    Ok(())
}

/// Initialize the rune stone item spawning system
pub fn init_rune_stone_item_spawning(ctx: &spacetimedb::ReducerContext) -> Result<(), String> {
    use spacetimedb::TimeDuration;
    use std::time::Duration;
    
    if ctx.db.rune_stone_item_spawn_schedule().count() == 0 {
        let check_interval = TimeDuration::from(Duration::from_secs(RED_RUNE_ITEM_SPAWN_INTERVAL_SECS));
        
        ctx.db.rune_stone_item_spawn_schedule().insert(RuneStoneItemSpawnSchedule {
            id: 0,
            scheduled_at: check_interval.into(),
        });
        
        log::info!("Initialized rune stone item spawning system");
    }
    
    Ok(())
}

/// Initialize the rune stone plant spawning system
pub fn init_rune_stone_plant_spawning(ctx: &spacetimedb::ReducerContext) -> Result<(), String> {
    use spacetimedb::TimeDuration;
    use std::time::Duration;
    
    if ctx.db.rune_stone_plant_spawn_schedule().count() == 0 {
        let check_interval = TimeDuration::from(Duration::from_secs(GREEN_RUNE_PLANT_SPAWN_INTERVAL_SECS));
        
        ctx.db.rune_stone_plant_spawn_schedule().insert(RuneStonePlantSpawnSchedule {
            id: 0,
            scheduled_at: check_interval.into(),
        });
        
        log::info!("Initialized rune stone plant spawning system");
    }
    
    Ok(())
}

// Note: Table trait is automatically generated by SpacetimeDB
// Access via ctx.db.rune_stone() directly

