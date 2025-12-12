/******************************************************************************
 *                                                                            *
 * Defines the rune stone system - mystical monuments that provide passive   *
 * effects. Three types:                                                      *
 * - Green (Agrarian): Boosts growth of season-specific plants               *
 * - Red (Production): Reduces crafting time for specific items             *
 * - Blue (Memory Shard): Spawns memory shards at night                     *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{SpacetimeType, Timestamp, Table, ScheduleAt};
use crate::{PLAYER_RADIUS};
use crate::world_state::{Season, world_state as WorldStateTableTrait};
use crate::items::item_definition as ItemDefinitionTableTrait;
use crate::dropped_item::dropped_item as DroppedItemTableTrait;
use crate::harvestable_resource::harvestable_resource as HarvestableResourceTableTrait;

// --- Rune Stone Constants ---

// Collision settings - reduced for better gameplay feel
pub(crate) const RUNE_STONE_RADIUS: f32 = 50.0; // Reduced from 80.0 for smaller collision
pub(crate) const RUNE_STONE_COLLISION_Y_OFFSET: f32 = 60.0; // Reduced from 100.0 for lower collision
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
pub(crate) const MIN_RUNE_STONE_TREE_DISTANCE_SQ: f32 = 300.0 * 300.0; // Minimum distance from trees (300px = ~6 tiles)
pub(crate) const MIN_RUNE_STONE_STONE_DISTANCE_SQ: f32 = 100.0 * 100.0; // Minimum distance from stones (100px)
pub(crate) const MIN_RUNE_STONE_BARREL_DISTANCE_SQ: f32 = 300.0 * 300.0; // Minimum distance from barrels (300px = ~6 tiles)
pub(crate) const MIN_RUNE_STONE_HOT_SPRING_DISTANCE_SQ: f32 = 800.0 * 800.0; // Minimum distance from hot springs (800px = ~16 tiles)
pub(crate) const MIN_RUNE_STONE_QUARRY_DISTANCE_SQ: f32 = 800.0 * 800.0; // Minimum distance from quarries (800px = ~16 tiles)

// Effect Radius (in pixels) - MASSIVE economic zones for PvP hotspots
pub(crate) const RUNE_STONE_EFFECT_RADIUS: f32 = 2000.0; // Huge AoE radius - true economic centers
pub(crate) const RUNE_STONE_EFFECT_RADIUS_SQUARED: f32 = RUNE_STONE_EFFECT_RADIUS * RUNE_STONE_EFFECT_RADIUS;

// Green (Agrarian) Effect Constants - ALL plants grow faster
pub(crate) const GREEN_RUNE_GROWTH_BOOST_MULTIPLIER: f32 = 1.5; // 1.5x growth rate for ALL plants
pub(crate) const GREEN_RUNE_MAX_EFFECT_DISTANCE: f32 = RUNE_STONE_EFFECT_RADIUS;

// Red (Production) Effect Constants - ALL crafting is faster + MASSIVE item spawning
pub(crate) const RED_RUNE_CRAFTING_TIME_REDUCTION: f32 = 0.667; // 1.5x crafting speed (0.667x time = 1.5x speed)
pub(crate) const RED_RUNE_ITEMS_PER_NIGHT: u32 = 60; // Max items per night (7.5x increase!)
pub(crate) const RED_RUNE_ITEM_SPAWN_INTERVAL_SECS: u64 = 50; // Check every 50 seconds (was 180)
pub(crate) const RED_RUNE_MIN_ITEMS_PER_BURST: u32 = 1; // Minimum items per spawn burst
pub(crate) const RED_RUNE_MAX_ITEMS_PER_BURST: u32 = 3; // Maximum items per spawn burst (randomized)
pub(crate) const RED_RUNE_ITEM_SPAWN_RADIUS: f32 = RUNE_STONE_EFFECT_RADIUS;
pub(crate) const RED_RUNE_ITEM_MIN_DISTANCE: f32 = 150.0;

// Green (Agrarian) Effect Constants - Moderate seed spawning
pub(crate) const GREEN_RUNE_SEEDS_PER_NIGHT: u32 = 12; // Max seeds per night (reasonable amount)
pub(crate) const GREEN_RUNE_SEED_SPAWN_INTERVAL_SECS: u64 = 120; // Check every 2 minutes
pub(crate) const GREEN_RUNE_MIN_SEEDS_PER_BURST: u32 = 1; // Minimum seeds per spawn burst
pub(crate) const GREEN_RUNE_MAX_SEEDS_PER_BURST: u32 = 2; // Maximum seeds per spawn burst (randomized)
pub(crate) const GREEN_RUNE_SEED_SPAWN_RADIUS: f32 = RUNE_STONE_EFFECT_RADIUS;
pub(crate) const GREEN_RUNE_SEED_MIN_DISTANCE: f32 = 150.0;

// Blue (Memory Shard) Effect Constants - BOOSTED for fast early progression
// Night lasts 5 minutes (300 seconds), shards spawn every 30 seconds = ~10 spawns per night
// With 25 shards max and 1-2 per spawn, expect ~15-20 shards/night/rune
pub(crate) const BLUE_RUNE_SHARDS_PER_NIGHT: u32 = 25; // Max shards per night (doubled for early game rush)
pub(crate) const BLUE_RUNE_SHARD_SPAWN_INTERVAL_SECS: u64 = 30; // Spawn every 30 seconds during night (4x faster!)
pub(crate) const BLUE_RUNE_MIN_SHARDS_PER_BURST: u32 = 1; // Minimum shards per spawn
pub(crate) const BLUE_RUNE_MAX_SHARDS_PER_BURST: u32 = 2; // Maximum shards per spawn (1-2 random)
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
    pub seeds_spawned_this_night: u32, // Track seeds spawned in current night cycle
    pub last_seed_spawn_time: Option<Timestamp>, // When last seed was spawned
    pub night_start_time: Option<Timestamp>, // When current night started
    pub seed_loot_table: Vec<String>, // List of seed item names this rune stone can spawn (randomized at world gen)
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

#[spacetimedb::table(name = rune_stone_seed_spawn_schedule, scheduled(spawn_seeds_at_night))]
#[derive(Clone)]
pub struct RuneStoneSeedSpawnSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: spacetimedb::spacetimedb_lib::ScheduleAt,
}

// --- Helper Functions ---

/// Generate a random seed loot table for a green rune stone
/// Each rune stone gets 2-4 random seed types from all available plantable seeds
/// This creates variety and permanence across server wipes
pub fn generate_random_seed_loot_table(rng: &mut impl rand::Rng) -> Vec<String> {
    // Get all plantable seed types from centralized plant database
    // This automatically stays in sync with the plant configuration
    let all_seeds = crate::plants_database::get_all_seed_types();
    
    // Each rune stone gets 2-4 random seed types
    let num_seeds = rng.gen_range(2..=4);
    
    // Shuffle and take first N seeds
    let mut shuffled = all_seeds.clone();
    use rand::seq::SliceRandom;
    shuffled.shuffle(rng);
    
    shuffled.into_iter()
        .take(num_seeds)
        .map(|s| s.to_string())
        .collect()
}

/// Filter a seed loot table to only include seeds that can grow in the current season
/// Returns the filtered list of seed names
fn filter_seeds_by_season(seed_names: &[String], current_season: &Season) -> Vec<String> {
    use crate::plants_database::{get_plant_type_by_seed, can_grow_in_season};
    
    seed_names.iter()
        .filter(|seed_name| {
            // Get the plant type for this seed
            if let Some(plant_type) = get_plant_type_by_seed(seed_name) {
                // Check if this plant can grow in the current season
                can_grow_in_season(&plant_type, current_season)
            } else {
                // If we can't find the plant type, don't spawn it (safety)
                log::warn!("Could not find plant type for seed: {}", seed_name);
                false
            }
        })
        .cloned()
        .collect()
}

/// Check if a position is within range of a green rune stone
/// Returns true if the position is within 2000px of any green rune stone
pub fn is_position_in_green_rune_zone(
    ctx: &spacetimedb::ReducerContext,
    pos_x: f32,
    pos_y: f32,
) -> bool {
    // Check all green rune stones - if position is within range of ANY green rune, return true
    for rune_stone in ctx.db.rune_stone().iter() {
        if rune_stone.rune_type != RuneStoneType::Green {
            continue;
        }
        
        // Check distance
        let dx = pos_x - rune_stone.pos_x;
        let dy = pos_y - rune_stone.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= RUNE_STONE_EFFECT_RADIUS_SQUARED {
            return true;
        }
    }
    
    false // Not in green rune zone
}

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

/// Check if a position is within range of a red rune stone
/// Returns true if the position is within 2000px of any red rune stone
pub fn is_position_in_red_rune_zone(
    ctx: &spacetimedb::ReducerContext,
    pos_x: f32,
    pos_y: f32,
) -> bool {
    // Check all red rune stones - if position is within range of ANY red rune, return true
    for rune_stone in ctx.db.rune_stone().iter() {
        if rune_stone.rune_type != RuneStoneType::Red {
            continue;
        }
        
        // Check distance
        let dx = pos_x - rune_stone.pos_x;
        let dy = pos_y - rune_stone.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= RUNE_STONE_EFFECT_RADIUS_SQUARED {
            return true;
        }
    }
    
    false // Not in red rune zone
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
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("spawn_memory_shards_at_night may only be called by the scheduler.".to_string());
    }

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
        let scheduled_time = ctx.timestamp + check_interval;
        crate::try_insert_schedule!(
            ctx.db.rune_stone_shard_spawn_schedule(),
            RuneStoneShardSpawnSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Time(scheduled_time),
            },
            "Rune stone shard spawn (reschedule)"
        );
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
            // Spawn a BURST of memory shards (1-2 per spawn) away from the rune stone center
            // This creates PvP hotspots around the rune stone, not directly on it
            let shards_to_spawn = rng.gen_range(BLUE_RUNE_MIN_SHARDS_PER_BURST..=BLUE_RUNE_MAX_SHARDS_PER_BURST);
            let mut spawned_this_burst = 0;
            
            for _ in 0..shards_to_spawn {
                // Check if we've hit the night cap
                if config.shards_spawned_this_night >= BLUE_RUNE_SHARDS_PER_NIGHT {
                    break;
                }
                
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
                    spawned_this_burst += 1;
                }
            }
            
            config.last_shard_spawn_time = Some(current_time);
            
            if spawned_this_burst > 0 {
                log::info!(
                    "Blue rune stone {} spawned {} memory shards (total: {}/{})",
                    rune_stone.id, spawned_this_burst, config.shards_spawned_this_night, BLUE_RUNE_SHARDS_PER_NIGHT
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
    let scheduled_time = ctx.timestamp + check_interval;
    crate::try_insert_schedule!(
        ctx.db.rune_stone_shard_spawn_schedule(),
        RuneStoneShardSpawnSchedule {
            id: 0,
            scheduled_at: ScheduleAt::Time(scheduled_time),
        },
        "Rune stone shard spawn (reschedule)"
    );
    
    Ok(())
}

/// Scheduled reducer to spawn items from red rune stones at night
#[spacetimedb::reducer]
pub fn spawn_items_at_night(
    ctx: &spacetimedb::ReducerContext,
    _schedule: RuneStoneItemSpawnSchedule,
) -> Result<(), String> {
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("spawn_items_at_night may only be called by the scheduler.".to_string());
    }

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
        let scheduled_time = ctx.timestamp + check_interval;
        crate::try_insert_schedule!(
            ctx.db.rune_stone_item_spawn_schedule(),
            RuneStoneItemSpawnSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Time(scheduled_time),
            },
            "Rune stone item spawn (reschedule)"
        );
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
            // Get all craftable items once
            let craftable_items: Vec<_> = ctx.db.item_definition().iter()
                .filter(|item| item.crafting_cost.is_some())
                .collect();
            
            if craftable_items.is_empty() {
                rune_stones_to_update.push((rune_stone.id, config));
                continue;
            }
            
            // Spawn a BURST of items (randomized 1-3 items per spawn)
            let items_to_spawn = rng.gen_range(RED_RUNE_MIN_ITEMS_PER_BURST..=RED_RUNE_MAX_ITEMS_PER_BURST);
            let mut spawned_this_burst = 0;
            
            for _ in 0..items_to_spawn {
                // Check if we've hit the night cap
                if config.items_spawned_this_night >= RED_RUNE_ITEMS_PER_NIGHT {
                    break;
                }
                
                // Pick a random craftable item
                let item_def_id = craftable_items[rng.gen_range(0..craftable_items.len())].id;
                
                // Spawn item away from rune stone center in random location
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
                    spawned_this_burst += 1;
                }
            }
            
            config.last_item_spawn_time = Some(current_time);
            
            if spawned_this_burst > 0 {
                log::info!(
                    "Red rune stone {} spawned {} items (total: {})",
                    rune_stone.id, spawned_this_burst, config.items_spawned_this_night
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
    let scheduled_time = ctx.timestamp + check_interval;
    crate::try_insert_schedule!(
        ctx.db.rune_stone_item_spawn_schedule(),
        RuneStoneItemSpawnSchedule {
            id: 0,
            scheduled_at: ScheduleAt::Time(scheduled_time),
        },
        "Rune stone item spawn (reschedule)"
    );
    
    Ok(())
}

/// Scheduled reducer to spawn seeds from green rune stones at night
#[spacetimedb::reducer]
pub fn spawn_seeds_at_night(
    ctx: &spacetimedb::ReducerContext,
    _schedule: RuneStoneSeedSpawnSchedule,
) -> Result<(), String> {
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("spawn_seeds_at_night may only be called by the scheduler.".to_string());
    }

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
        let check_interval = TimeDuration::from(Duration::from_secs(GREEN_RUNE_SEED_SPAWN_INTERVAL_SECS));
        let scheduled_time = ctx.timestamp + check_interval;
        crate::try_insert_schedule!(
            ctx.db.rune_stone_seed_spawn_schedule(),
            RuneStoneSeedSpawnSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Time(scheduled_time),
            },
            "Rune stone seed spawn (reschedule)"
        );
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
            config.seeds_spawned_this_night = 0;
            config.night_start_time = Some(current_time);
        }
        
        // Check if we can spawn more seeds this night
        if config.seeds_spawned_this_night >= GREEN_RUNE_SEEDS_PER_NIGHT {
            rune_stones_to_update.push((rune_stone.id, config));
            continue;
        }
        
        // Check if enough time has passed since last spawn
        let can_spawn = match config.last_seed_spawn_time {
            Some(last_spawn) => {
                let time_since_last = current_time.to_micros_since_unix_epoch()
                    .saturating_sub(last_spawn.to_micros_since_unix_epoch());
                time_since_last >= (GREEN_RUNE_SEED_SPAWN_INTERVAL_SECS * 1_000_000) as i64
            }
            None => true,
        };
        
        if can_spawn {
            // Check if this rune stone has a loot table
            if config.seed_loot_table.is_empty() {
                log::warn!("Green rune stone {} has empty loot table, skipping spawn", rune_stone.id);
                rune_stones_to_update.push((rune_stone.id, config));
                continue;
            }
            
            // Filter loot table to only include seeds that can grow in current season
            let seasonal_seeds = filter_seeds_by_season(&config.seed_loot_table, &current_season);
            
            if seasonal_seeds.is_empty() {
                // No seeds can grow in current season, skip spawning
                log::debug!(
                    "Green rune stone {} has no seeds that can grow in {:?}, skipping spawn",
                    rune_stone.id, current_season
                );
                rune_stones_to_update.push((rune_stone.id, config));
                continue;
            }
            
            // Spawn a BURST of seeds (randomized 1-2 seeds per spawn)
            let seeds_to_spawn = rng.gen_range(GREEN_RUNE_MIN_SEEDS_PER_BURST..=GREEN_RUNE_MAX_SEEDS_PER_BURST);
            let mut spawned_this_burst = 0;
            let mut spawned_seed_names = Vec::new();
            
            for _ in 0..seeds_to_spawn {
                // Check if we've hit the night cap
                if config.seeds_spawned_this_night >= GREEN_RUNE_SEEDS_PER_NIGHT {
                    break;
                }
                
                // Pick a random seed from the SEASONAL loot table
                let seed_name = &seasonal_seeds[rng.gen_range(0..seasonal_seeds.len())];
                
                // Find the seed item definition
                let seed_def_id = ctx.db.item_definition().iter()
                    .find(|def| &def.name == seed_name)
                    .map(|def| def.id);
                
                let seed_def_id = match seed_def_id {
                    Some(id) => id,
                    None => {
                        log::warn!("Seed '{}' not found in item definitions", seed_name);
                        continue;
                    }
                };
                
                // Spawn seed away from rune stone center in random location
                let angle = rng.gen_range(0.0..std::f32::consts::TAU);
                let distance = rng.gen_range(GREEN_RUNE_SEED_MIN_DISTANCE..GREEN_RUNE_SEED_SPAWN_RADIUS);
                let seed_x = rune_stone.pos_x + angle.cos() * distance;
                let seed_y = rune_stone.pos_y + angle.sin() * distance;
                
                // Check if position is valid
                if !crate::environment::is_position_on_water(ctx, seed_x, seed_y) {
                    let chunk_idx = crate::environment::calculate_chunk_index(seed_x, seed_y);
                    
                    // Create dropped seed item
                    ctx.db.dropped_item().insert(crate::dropped_item::DroppedItem {
                        id: 0,
                        item_def_id: seed_def_id,
                        quantity: 1,
                        pos_x: seed_x,
                        pos_y: seed_y,
                        chunk_index: chunk_idx,
                        created_at: current_time,
                        item_data: None,
                    });
                    
                    config.seeds_spawned_this_night += 1;
                    spawned_this_burst += 1;
                    spawned_seed_names.push(seed_name.clone());
                }
            }
            
            config.last_seed_spawn_time = Some(current_time);
            
            if spawned_this_burst > 0 {
                log::info!(
                    "Green rune stone {} spawned {} seeds in {:?}: {:?} (total: {})",
                    rune_stone.id, spawned_this_burst, current_season, spawned_seed_names, config.seeds_spawned_this_night
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
    let check_interval = TimeDuration::from(Duration::from_secs(GREEN_RUNE_SEED_SPAWN_INTERVAL_SECS));
    let scheduled_time = ctx.timestamp + check_interval;
    crate::try_insert_schedule!(
        ctx.db.rune_stone_seed_spawn_schedule(),
        RuneStoneSeedSpawnSchedule {
            id: 0,
            scheduled_at: ScheduleAt::Time(scheduled_time),
        },
        "Rune stone seed spawn (reschedule)"
    );
    
    Ok(())
}

/// Initialize the rune stone shard spawning system
pub fn init_rune_stone_shard_spawning(ctx: &spacetimedb::ReducerContext) -> Result<(), String> {
    use spacetimedb::TimeDuration;
    use std::time::Duration;
    
    // Only start if no existing schedule
    if ctx.db.rune_stone_shard_spawn_schedule().count() == 0 {
        let check_interval = TimeDuration::from(Duration::from_secs(BLUE_RUNE_SHARD_SPAWN_INTERVAL_SECS));
        let scheduled_time = ctx.timestamp + check_interval;
        
        crate::try_insert_schedule!(
            ctx.db.rune_stone_shard_spawn_schedule(),
            RuneStoneShardSpawnSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Time(scheduled_time),
            },
            "Rune stone shard spawning"
        );
    }
    
    Ok(())
}

/// Initialize the rune stone item spawning system
pub fn init_rune_stone_item_spawning(ctx: &spacetimedb::ReducerContext) -> Result<(), String> {
    use spacetimedb::TimeDuration;
    use std::time::Duration;
    
    if ctx.db.rune_stone_item_spawn_schedule().count() == 0 {
        let check_interval = TimeDuration::from(Duration::from_secs(RED_RUNE_ITEM_SPAWN_INTERVAL_SECS));
        let scheduled_time = ctx.timestamp + check_interval;
        
        crate::try_insert_schedule!(
            ctx.db.rune_stone_item_spawn_schedule(),
            RuneStoneItemSpawnSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Time(scheduled_time),
            },
            "Rune stone item spawning"
        );
    }
    
    Ok(())
}

/// Initialize the rune stone seed spawning system
pub fn init_rune_stone_seed_spawning(ctx: &spacetimedb::ReducerContext) -> Result<(), String> {
    use spacetimedb::TimeDuration;
    use std::time::Duration;
    
    if ctx.db.rune_stone_seed_spawn_schedule().count() == 0 {
        let check_interval = TimeDuration::from(Duration::from_secs(GREEN_RUNE_SEED_SPAWN_INTERVAL_SECS));
        let scheduled_time = ctx.timestamp + check_interval;
        
        crate::try_insert_schedule!(
            ctx.db.rune_stone_seed_spawn_schedule(),
            RuneStoneSeedSpawnSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Time(scheduled_time),
            },
            "Rune stone seed spawning"
        );
    }
    
    Ok(())
}

// Note: Table trait is automatically generated by SpacetimeDB
// Access via ctx.db.rune_stone() directly

