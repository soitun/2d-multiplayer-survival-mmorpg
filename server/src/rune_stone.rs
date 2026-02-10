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

// Collision settings - 110x48 AABB collision (wide to match monument base)
pub(crate) const RUNE_STONE_AABB_HALF_WIDTH: f32 = 55.0; // Half-width for 110px wide AABB (matches monument base)
pub(crate) const RUNE_STONE_AABB_HALF_HEIGHT: f32 = 24.0; // Half-height for 48px tall AABB
pub(crate) const RUNE_STONE_COLLISION_Y_OFFSET: f32 = 24.0; // Y offset for AABB center from pos_y
// Maximum collision distance squared (player radius + half diagonal of AABB)
pub(crate) const PLAYER_RUNE_STONE_COLLISION_DISTANCE_SQUARED: f32 = 
    (PLAYER_RADIUS + RUNE_STONE_AABB_HALF_WIDTH * 1.414) * (PLAYER_RADIUS + RUNE_STONE_AABB_HALF_WIDTH * 1.414);

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
pub(crate) const MIN_RUNE_STONE_ALK_STATION_DISTANCE_PX: f32 = 2000.0; // Minimum distance from ALK central compound and substations
pub(crate) const MIN_RUNE_STONE_ALK_STATION_DISTANCE_SQ: f32 = MIN_RUNE_STONE_ALK_STATION_DISTANCE_PX * MIN_RUNE_STONE_ALK_STATION_DISTANCE_PX;
pub(crate) const MIN_RUNE_STONE_MONUMENT_DISTANCE_PX: f32 = 2000.0; // Minimum distance from any monument (shipwreck, fishing village, whale bone, hunting village, drone, weather station, wolf den)
pub(crate) const MIN_RUNE_STONE_MONUMENT_DISTANCE_SQ: f32 = MIN_RUNE_STONE_MONUMENT_DISTANCE_PX * MIN_RUNE_STONE_MONUMENT_DISTANCE_PX;

// Effect Radius (in pixels) - MASSIVE economic zones for PvP hotspots
pub(crate) const RUNE_STONE_EFFECT_RADIUS: f32 = 2000.0; // Huge AoE radius - true economic centers
pub(crate) const RUNE_STONE_EFFECT_RADIUS_SQUARED: f32 = RUNE_STONE_EFFECT_RADIUS * RUNE_STONE_EFFECT_RADIUS;

// Green (Agrarian) Effect Constants - ALL plants grow faster
pub(crate) const GREEN_RUNE_GROWTH_BOOST_MULTIPLIER: f32 = 1.5; // 1.5x growth rate for ALL plants
pub(crate) const GREEN_RUNE_MAX_EFFECT_DISTANCE: f32 = RUNE_STONE_EFFECT_RADIUS;

// Red (Production) Effect Constants - ALL crafting is faster + controlled item spawning
pub(crate) const RED_RUNE_CRAFTING_TIME_REDUCTION: f32 = 0.667; // 1.5x crafting speed (0.667x time = 1.5x speed)
pub(crate) const RED_RUNE_ITEMS_PER_NIGHT_MIN: u32 = 2; // Normal night: 2-3 items
pub(crate) const RED_RUNE_ITEMS_PER_NIGHT_MAX: u32 = 3;
pub(crate) const RED_RUNE_ITEMS_PER_NIGHT_FULL_MOON_MIN: u32 = 5; // Full moon: 5-6 items
pub(crate) const RED_RUNE_ITEMS_PER_NIGHT_FULL_MOON_MAX: u32 = 6;
pub(crate) const RED_RUNE_ITEM_SPAWN_INTERVAL_SECS: u64 = 60; // Check every 60 seconds
pub(crate) const RED_RUNE_ITEM_SPAWN_RADIUS: f32 = RUNE_STONE_EFFECT_RADIUS;
pub(crate) const RED_RUNE_ITEM_MIN_DISTANCE: f32 = 150.0;
pub(crate) const RED_RUNE_ITEM_CHECK_RADIUS: f32 = 500.0; // Radius to check for existing items

// Green (Agrarian) Effect Constants - Controlled seed spawning
pub(crate) const GREEN_RUNE_SEEDS_PER_NIGHT_MIN: u32 = 2; // Normal night: 2-3 seeds
pub(crate) const GREEN_RUNE_SEEDS_PER_NIGHT_MAX: u32 = 3;
pub(crate) const GREEN_RUNE_SEEDS_PER_NIGHT_FULL_MOON_MIN: u32 = 5; // Full moon: 5-6 seeds
pub(crate) const GREEN_RUNE_SEEDS_PER_NIGHT_FULL_MOON_MAX: u32 = 6;
pub(crate) const GREEN_RUNE_SEED_SPAWN_INTERVAL_SECS: u64 = 60; // Check every 60 seconds
pub(crate) const GREEN_RUNE_SEED_SPAWN_RADIUS: f32 = RUNE_STONE_EFFECT_RADIUS;
pub(crate) const GREEN_RUNE_SEED_MIN_DISTANCE: f32 = 150.0;
pub(crate) const GREEN_RUNE_SEED_CHECK_RADIUS: f32 = 500.0; // Radius to check for existing seeds

// Blue (Memory Shard) Effect Constants - Controlled shard spawning
// Only spawn if previous night's shards have been picked up
pub(crate) const BLUE_RUNE_SHARDS_PER_NIGHT_MIN: u32 = 2; // Normal night: 2-3 shards
pub(crate) const BLUE_RUNE_SHARDS_PER_NIGHT_MAX: u32 = 3;
pub(crate) const BLUE_RUNE_SHARDS_PER_NIGHT_FULL_MOON_MIN: u32 = 5; // Full moon: 5-6 shards
pub(crate) const BLUE_RUNE_SHARDS_PER_NIGHT_FULL_MOON_MAX: u32 = 6;
pub(crate) const BLUE_RUNE_SHARD_SPAWN_INTERVAL_SECS: u64 = 60; // Check every 60 seconds
pub(crate) const BLUE_RUNE_SHARD_SPAWN_RADIUS: f32 = RUNE_STONE_EFFECT_RADIUS;
pub(crate) const BLUE_RUNE_SHARD_MIN_DISTANCE: f32 = 150.0;
pub(crate) const BLUE_RUNE_SHARD_CHECK_RADIUS: f32 = 500.0; // Radius to check for existing shards

// Night Lighting Constants
pub(crate) const RUNE_STONE_LIGHT_RADIUS: f32 = 400.0; // Light radius for night glow

// Hostile NPC Deterrence Constants - Apparitions can't enter the light radius
pub const RUNE_STONE_DETERRENCE_RADIUS: f32 = RUNE_STONE_LIGHT_RADIUS; // Matches light radius

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

/// Count dropped items near a rune stone within a given radius
/// Used to check if previous night's spawns haven't been picked up
fn count_dropped_items_near_rune(
    ctx: &spacetimedb::ReducerContext,
    rune_x: f32,
    rune_y: f32,
    check_radius: f32,
    item_def_id_filter: Option<u64>, // Optional filter for specific item type
) -> u32 {
    let check_radius_sq = check_radius * check_radius;
    let mut count = 0u32;
    
    for dropped_item in ctx.db.dropped_item().iter() {
        // If filter is specified, only count matching items
        if let Some(filter_id) = item_def_id_filter {
            if dropped_item.item_def_id != filter_id {
                continue;
            }
        }
        
        let dx = dropped_item.pos_x - rune_x;
        let dy = dropped_item.pos_y - rune_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq <= check_radius_sq {
            count += 1;
        }
    }
    
    count
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
    use crate::player as PlayerTableTrait;
    
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("spawn_memory_shards_at_night may only be called by the scheduler.".to_string());
    }

    // PERFORMANCE: Skip if no players online
    let has_online_players = ctx.db.player().iter().any(|p| p.is_online);
    if !has_online_players {
        return Ok(());
    }

    use spacetimedb::TimeDuration;
    use std::time::Duration;
    use rand::Rng;
    
    let world_state = ctx.db.world_state().iter().next().ok_or_else(|| {
        "WorldState singleton not found".to_string()
    })?;
    
    let time_of_day = &world_state.time_of_day;
    let is_full_moon = world_state.is_full_moon;
    
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
    
    // Determine spawn count based on full moon
    let (min_shards, max_shards) = if is_full_moon {
        (BLUE_RUNE_SHARDS_PER_NIGHT_FULL_MOON_MIN, BLUE_RUNE_SHARDS_PER_NIGHT_FULL_MOON_MAX)
    } else {
        (BLUE_RUNE_SHARDS_PER_NIGHT_MIN, BLUE_RUNE_SHARDS_PER_NIGHT_MAX)
    };
    
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
            
            // Check if there are unpicked shards from the previous night
            let existing_shards = count_dropped_items_near_rune(
                ctx,
                rune_stone.pos_x,
                rune_stone.pos_y,
                BLUE_RUNE_SHARD_CHECK_RADIUS,
                Some(memory_shard_def_id),
            );
            
            if existing_shards > 0 {
                // Previous shards haven't been picked up - skip spawning this night
                log::info!(
                    "Blue rune stone {} has {} unpicked shards nearby, skipping spawn this night",
                    rune_stone.id, existing_shards
                );
                // Mark as already spawned max to prevent spawning this night
                config.shards_spawned_this_night = max_shards;
                rune_stones_to_update.push((rune_stone.id, config));
                continue;
            }
        }
        
        // Check if we've already spawned for this night
        if config.shards_spawned_this_night > 0 {
            rune_stones_to_update.push((rune_stone.id, config));
            continue;
        }
        
        // Spawn all shards for this night at once (2-3 normal, 5-6 full moon)
        let shards_to_spawn = rng.gen_range(min_shards..=max_shards);
        let mut spawned_count = 0;
        
        for _ in 0..shards_to_spawn {
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
                    spawn_x: None,
                    spawn_y: None,
                });
                
                spawned_count += 1;
            }
        }
        
        config.shards_spawned_this_night = spawned_count;
        config.last_shard_spawn_time = Some(current_time);
        
        if spawned_count > 0 {
            log::info!(
                "Blue rune stone {} spawned {} memory shards{}",
                rune_stone.id, spawned_count,
                if is_full_moon { " (full moon bonus!)" } else { "" }
            );
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
    use crate::player as PlayerTableTrait;
    
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("spawn_items_at_night may only be called by the scheduler.".to_string());
    }

    // PERFORMANCE: Skip if no players online
    let has_online_players = ctx.db.player().iter().any(|p| p.is_online);
    if !has_online_players {
        return Ok(());
    }

    use spacetimedb::TimeDuration;
    use std::time::Duration;
    use rand::Rng;
    
    let world_state = ctx.db.world_state().iter().next().ok_or_else(|| {
        "WorldState singleton not found".to_string()
    })?;
    
    let time_of_day = &world_state.time_of_day;
    let is_full_moon = world_state.is_full_moon;
    
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
    
    // Determine spawn count based on full moon
    let (min_items, max_items) = if is_full_moon {
        (RED_RUNE_ITEMS_PER_NIGHT_FULL_MOON_MIN, RED_RUNE_ITEMS_PER_NIGHT_FULL_MOON_MAX)
    } else {
        (RED_RUNE_ITEMS_PER_NIGHT_MIN, RED_RUNE_ITEMS_PER_NIGHT_MAX)
    };
    
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
            
            // Check if there are unpicked items from the previous night
            // We check for any dropped items (no filter) since red runes spawn various craftable items
            let existing_items = count_dropped_items_near_rune(
                ctx,
                rune_stone.pos_x,
                rune_stone.pos_y,
                RED_RUNE_ITEM_CHECK_RADIUS,
                None, // Check for any dropped item
            );
            
            if existing_items > 0 {
                // Previous items haven't been picked up - skip spawning this night
                log::info!(
                    "Red rune stone {} has {} unpicked items nearby, skipping spawn this night",
                    rune_stone.id, existing_items
                );
                // Mark as already spawned max to prevent spawning this night
                config.items_spawned_this_night = max_items;
                rune_stones_to_update.push((rune_stone.id, config));
                continue;
            }
        }
        
        // Check if we've already spawned for this night
        if config.items_spawned_this_night > 0 {
            rune_stones_to_update.push((rune_stone.id, config));
            continue;
        }
        
        // Get all craftable items once
        let craftable_items: Vec<_> = ctx.db.item_definition().iter()
            .filter(|item| item.crafting_cost.is_some())
            .collect();
        
        if craftable_items.is_empty() {
            rune_stones_to_update.push((rune_stone.id, config));
            continue;
        }
        
        // Spawn all items for this night at once (2-3 normal, 5-6 full moon)
        let items_to_spawn = rng.gen_range(min_items..=max_items);
        let mut spawned_count = 0;
        
        for _ in 0..items_to_spawn {
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
                    spawn_x: None,
                    spawn_y: None,
                });
                
                spawned_count += 1;
            }
        }
        
        config.items_spawned_this_night = spawned_count;
        config.last_item_spawn_time = Some(current_time);
        
        if spawned_count > 0 {
            log::info!(
                "Red rune stone {} spawned {} items{}",
                rune_stone.id, spawned_count,
                if is_full_moon { " (full moon bonus!)" } else { "" }
            );
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
    use crate::player as PlayerTableTrait;
    
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("spawn_seeds_at_night may only be called by the scheduler.".to_string());
    }

    // PERFORMANCE: Skip if no players online
    let has_online_players = ctx.db.player().iter().any(|p| p.is_online);
    if !has_online_players {
        return Ok(());
    }

    use spacetimedb::TimeDuration;
    use std::time::Duration;
    use rand::Rng;
    
    let world_state = ctx.db.world_state().iter().next().ok_or_else(|| {
        "WorldState singleton not found".to_string()
    })?;
    
    let time_of_day = &world_state.time_of_day;
    let current_season = world_state.current_season.clone();
    let is_full_moon = world_state.is_full_moon;
    
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
    
    // Determine spawn count based on full moon
    let (min_seeds, max_seeds) = if is_full_moon {
        (GREEN_RUNE_SEEDS_PER_NIGHT_FULL_MOON_MIN, GREEN_RUNE_SEEDS_PER_NIGHT_FULL_MOON_MAX)
    } else {
        (GREEN_RUNE_SEEDS_PER_NIGHT_MIN, GREEN_RUNE_SEEDS_PER_NIGHT_MAX)
    };
    
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
            
            // Check if there are unpicked seeds from the previous night
            // We check for any dropped items (no filter) since seeds spawn nearby
            let existing_seeds = count_dropped_items_near_rune(
                ctx,
                rune_stone.pos_x,
                rune_stone.pos_y,
                GREEN_RUNE_SEED_CHECK_RADIUS,
                None, // Check for any dropped item
            );
            
            if existing_seeds > 0 {
                // Previous seeds haven't been picked up - skip spawning this night
                log::info!(
                    "Green rune stone {} has {} unpicked items nearby, skipping spawn this night",
                    rune_stone.id, existing_seeds
                );
                // Mark as already spawned max to prevent spawning this night
                config.seeds_spawned_this_night = max_seeds;
                rune_stones_to_update.push((rune_stone.id, config));
                continue;
            }
        }
        
        // Check if we've already spawned for this night
        if config.seeds_spawned_this_night > 0 {
            rune_stones_to_update.push((rune_stone.id, config));
            continue;
        }
        
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
        
        // Spawn all seeds for this night at once (2-3 normal, 5-6 full moon)
        let seeds_to_spawn = rng.gen_range(min_seeds..=max_seeds);
        let mut spawned_count = 0;
        let mut spawned_seed_names = Vec::new();
        
        for _ in 0..seeds_to_spawn {
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
                    spawn_x: None,
                    spawn_y: None,
                });
                
                spawned_count += 1;
                spawned_seed_names.push(seed_name.clone());
            }
        }
        
        config.seeds_spawned_this_night = spawned_count;
        config.last_seed_spawn_time = Some(current_time);
        
        if spawned_count > 0 {
            log::info!(
                "Green rune stone {} spawned {} seeds in {:?}: {:?}{}",
                rune_stone.id, spawned_count, current_season, spawned_seed_names,
                if is_full_moon { " (full moon bonus!)" } else { "" }
            );
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

