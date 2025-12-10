/******************************************************************************
 *                                                                            *
 * Defines the planted seeds farming system including planting, growth,       *
 * and harvesting mechanics. Players can plant seeds which grow over time     *
 * into harvestable resources, creating a sustainable farming cycle.          *
 *                                                                            *
 ******************************************************************************/

// Standard library imports
use std::time::Duration;

// SpacetimeDB imports
use spacetimedb::{table, reducer, ReducerContext, Identity, Timestamp, Table, log, TimeDuration};
use spacetimedb::spacetimedb_lib::ScheduleAt;
use rand::Rng;

// Table trait imports for database access
use crate::items::{inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait};
use crate::player as PlayerTableTrait;
use crate::environment::calculate_chunk_index;
use crate::harvestable_resource::{harvestable_resource as HarvestableResourceTableTrait};
use crate::plants_database::PlantType;
use crate::world_state::{world_state as WorldStateTableTrait, WeatherType, TimeOfDay};
use crate::cloud::cloud as CloudTableTrait;
use crate::campfire::campfire as CampfireTableTrait;
use crate::lantern::lantern as LanternTableTrait;
use crate::shelter::shelter as ShelterTableTrait;
use crate::tree::tree as TreeTableTrait;
use crate::fertilizer_patch::fertilizer_patch as FertilizerPatchTableTrait;
// Import water tile detection from fishing module
use crate::fishing::is_water_tile;

// --- Planted Seed Tracking Table ---

#[spacetimedb::table(name = planted_seed, public)]
#[derive(Clone, Debug)]
pub struct PlantedSeed {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    pub chunk_index: u32,
    pub seed_type: String,        // "Seed Potato", "Corn Seeds", etc.
    pub plant_type: PlantType,    // What plant this will become when mature
    pub planted_at: Timestamp,    // When it was planted
    pub will_mature_at: Timestamp, // When it becomes harvestable (dynamically updated)
    pub planted_by: Identity,     // Who planted it
    pub growth_progress: f32,     // 0.0 to 1.0 - actual growth accumulated
    pub base_growth_time_secs: u64, // Base time needed to reach maturity
    pub last_growth_update: Timestamp, // Last time growth was calculated
    pub fertilized_at: Option<Timestamp>, // When fertilizer was applied (None = not fertilized)
}

// --- Growth Schedule Table ---

#[spacetimedb::table(name = planted_seed_growth_schedule, scheduled(check_plant_growth))]
#[derive(Clone)]
pub struct PlantedSeedGrowthSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

// --- Growth Configuration ---
// Now using centralized plants_database.rs configuration

/// Get growth configuration for a seed type from the central plants database
fn get_growth_config_from_database(seed_type: &str) -> Option<(u64, u64, PlantType)> {
    log::info!("get_growth_config_from_database: Looking up seed type '{}'", seed_type);
    
    // Convert seed type to plant type using centralized metadata provider
    let plant_type = crate::metadata_providers::get_plant_type_from_seed_name(seed_type)?;
    log::info!("get_growth_config_from_database: Found plant type {:?} for seed '{}'", plant_type, seed_type);
    
    // Get the plant config from the central database
    let config = crate::plants_database::get_plant_config(&plant_type)?;
    log::info!("get_growth_config_from_database: Found config for {:?}", plant_type);
    
    // Return (min_growth_time_secs, max_growth_time_secs, plant_type)
    // Growth time comes from the central database's min/max_respawn_time_secs
    // For planted seeds, we use the respawn times as base growth times
    Some((config.min_respawn_time_secs, config.max_respawn_time_secs, plant_type))
}

// --- Constants ---

const PLANT_GROWTH_CHECK_INTERVAL_SECS: u64 = 30; // Check every 30 seconds

// --- Growth Rate Modifiers ---

/// Growth rate multipliers based on time of day
fn get_time_of_day_growth_multiplier(time_of_day: &TimeOfDay) -> f32 {
    match time_of_day {
        TimeOfDay::Dawn => 0.3,           // Slow growth at dawn
        TimeOfDay::TwilightMorning => 0.5, // Building up
        TimeOfDay::Morning => 1.0,        // Normal growth
        TimeOfDay::Noon => 1.5,           // Peak growth (most sunlight)
        TimeOfDay::Afternoon => 1.2,     // Good growth
        TimeOfDay::Dusk => 0.4,           // Slowing down
        TimeOfDay::TwilightEvening => 0.2, // Very slow
        TimeOfDay::Night => 0.0,          // No growth at night
        TimeOfDay::Midnight => 0.0,       // No growth at midnight
    }
}

/// Growth rate multipliers based on weather conditions
fn get_weather_growth_multiplier(weather: &WeatherType, rain_intensity: f32) -> f32 {
    match weather {
        WeatherType::Clear => 1.0,        // Normal growth
        WeatherType::LightRain => 1.3,    // Light rain helps growth
        WeatherType::ModerateRain => 1.6, // Moderate rain is very beneficial
        WeatherType::HeavyRain => 1.4,    // Heavy rain is good but not as much
        WeatherType::HeavyStorm => 0.8,   // Storm conditions slow growth
    }
}

/// Check if a plant dies due to severe weather conditions
/// Returns true if the plant should die
fn check_plant_death_from_weather(ctx: &ReducerContext, weather: &WeatherType) -> bool {
    match weather {
        WeatherType::HeavyRain => {
            // 2% chance per growth check to die in heavy rain
            ctx.rng().gen_range(0..100) < 2
        }
        WeatherType::HeavyStorm => {
            // 5% chance per growth check to die in heavy storm
            ctx.rng().gen_range(0..100) < 5
        }
        _ => false, // No death chance in other weather conditions
    }
}

/// Calculate cloud cover growth modifier for a specific planted seed
/// Returns a multiplier between 0.4 (heavy cloud cover) and 1.0 (no clouds)
fn get_cloud_cover_growth_multiplier(ctx: &ReducerContext, plant_x: f32, plant_y: f32) -> f32 {
    // Check if any clouds are covering this plant
    let mut cloud_coverage = 0.0f32;
    
    for cloud in ctx.db.cloud().iter() {
        // Calculate distance from plant to cloud center
        let dx = plant_x - cloud.pos_x;
        let dy = plant_y - cloud.pos_y;
        
        // Use elliptical coverage area based on cloud dimensions
        let half_width = cloud.width / 2.0;
        let half_height = cloud.height / 2.0;
        
        // Check if plant is within cloud's shadow area
        // Using simple ellipse formula: (x/a)² + (y/b)² <= 1
        if half_width > 0.0 && half_height > 0.0 {
            let normalized_x = dx / half_width;
            let normalized_y = dy / half_height;
            let distance_squared = normalized_x * normalized_x + normalized_y * normalized_y;
            
            if distance_squared <= 1.0 {
                // Plant is under this cloud - calculate coverage intensity
                // Closer to center = more coverage, fade out towards edges
                let coverage_intensity = (1.0 - distance_squared.sqrt()).max(0.0);
                
                // Factor in cloud opacity for coverage strength
                let effective_coverage = coverage_intensity * cloud.current_opacity;
                
                // Accumulate coverage (multiple clouds can overlap)
                cloud_coverage = (cloud_coverage + effective_coverage).min(1.0);
            }
        }
    }   
    
    // Convert coverage to growth multiplier
    // 0% coverage = 1.0x growth (full sunlight)
    // 100% coverage = 0.4x growth (significantly reduced but not stopped)
    let multiplier = 1.0 - (cloud_coverage * 0.6); // Reduces by up to 60%
    
    multiplier.max(0.4) // Ensure minimum 40% growth rate
}

/// Calculate light source growth modifier for a specific planted seed
/// Returns a multiplier that can enhance or reduce growth based on nearby light sources
fn get_light_source_growth_multiplier(ctx: &ReducerContext, plant_x: f32, plant_y: f32) -> f32 {
    let mut total_light_effect = 0.0f32;
    
    // Check nearby campfires (negative effect - too much heat/smoke)
    for campfire in ctx.db.campfire().iter() {
        if campfire.is_burning && !campfire.is_destroyed {
            let dx = plant_x - campfire.pos_x;
            let dy = plant_y - campfire.pos_y;
            let distance = (dx * dx + dy * dy).sqrt();
            
            // Campfire negative effect radius: 0-120 pixels
            const CAMPFIRE_MAX_EFFECT_DISTANCE: f32 = 120.0;
            const CAMPFIRE_OPTIMAL_DISTANCE: f32 = 80.0; // Distance where effect starts to diminish
            
            if distance < CAMPFIRE_MAX_EFFECT_DISTANCE {
                let effect_strength = if distance < CAMPFIRE_OPTIMAL_DISTANCE {
                    // Close to campfire: strong negative effect (too hot/smoky)
                    1.0 - (distance / CAMPFIRE_OPTIMAL_DISTANCE)
                } else {
                    // Far from campfire: diminishing negative effect
                    (CAMPFIRE_MAX_EFFECT_DISTANCE - distance) / (CAMPFIRE_MAX_EFFECT_DISTANCE - CAMPFIRE_OPTIMAL_DISTANCE)
                };
                
                // Campfire reduces growth by up to 40% when very close
                total_light_effect -= effect_strength * 0.4;
            }
        }
    }
    
    // Check nearby lanterns (positive effect - gentle light for photosynthesis)
    for lantern in ctx.db.lantern().iter() {
        if lantern.is_burning && !lantern.is_destroyed {
            let dx = plant_x - lantern.pos_x;
            let dy = plant_y - lantern.pos_y;
            let distance = (dx * dx + dy * dy).sqrt();
            
            // Lantern positive effect radius: 0-100 pixels
            const LANTERN_MAX_EFFECT_DISTANCE: f32 = 100.0;
            const LANTERN_OPTIMAL_DISTANCE: f32 = 60.0; // Distance for maximum benefit
            
            if distance < LANTERN_MAX_EFFECT_DISTANCE {
                let effect_strength = if distance < LANTERN_OPTIMAL_DISTANCE {
                    // Close to lantern: strong positive effect
                    1.0 - (distance / LANTERN_OPTIMAL_DISTANCE)
                } else {
                    // Far from lantern: diminishing positive effect
                    (LANTERN_MAX_EFFECT_DISTANCE - distance) / (LANTERN_MAX_EFFECT_DISTANCE - LANTERN_OPTIMAL_DISTANCE)
                };
                
                // Lantern can boost growth by up to 80% when very close
                // This is enough to provide normal growth even at night (0.0x base rate)
                total_light_effect += effect_strength * 0.8;
            }
        }
    }
    
    // Convert total light effect to growth multiplier
    // Base multiplier is 1.0, then add/subtract light effects
    let multiplier = 1.0 + total_light_effect;
    
    // Clamp between reasonable bounds
    // Minimum 0.2x (campfires can significantly slow growth but not stop it)
    // Maximum 2.0x (lanterns can provide substantial boost but not unlimited)
    multiplier.max(0.2).min(2.0)
}

/// Calculate crowding penalty for a specific planted seed based on nearby plants
/// Returns a multiplier between 0.1 (severely crowded) and 1.0 (no crowding)
fn get_crowding_penalty_multiplier(ctx: &ReducerContext, plant_x: f32, plant_y: f32, plant_id: u64) -> f32 {
    let mut crowding_penalty = 0.0f32;
    
    // Distance thresholds for different penalty levels
    const SEVERE_CROWDING_DISTANCE_SQ: f32 = 30.0 * 30.0;  // 30px - severe penalty
    const MODERATE_CROWDING_DISTANCE_SQ: f32 = 50.0 * 50.0; // 50px - moderate penalty  
    const LIGHT_CROWDING_DISTANCE_SQ: f32 = 80.0 * 80.0;   // 80px - light penalty
    
    // Check all other planted seeds for crowding effects
    for other_plant in ctx.db.planted_seed().iter() {
        // Skip self
        if other_plant.id == plant_id {
            continue;
        }
        
        // Calculate distance to other plant
        let dx = plant_x - other_plant.pos_x;
        let dy = plant_y - other_plant.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        // Apply penalties based on distance
        if distance_sq <= SEVERE_CROWDING_DISTANCE_SQ {
            // Severe crowding: 70% growth reduction
            crowding_penalty += 0.7;
        } else if distance_sq <= MODERATE_CROWDING_DISTANCE_SQ {
            // Moderate crowding: 40% growth reduction
            crowding_penalty += 0.4;
        } else if distance_sq <= LIGHT_CROWDING_DISTANCE_SQ {
            // Light crowding: 15% growth reduction
            crowding_penalty += 0.15;
        }
        // Beyond 80px: no penalty
    }
    
    // Convert penalty to multiplier
    // Cap maximum penalty at 90% (minimum 10% growth rate)
    let total_penalty = crowding_penalty.min(0.9);
    let multiplier = 1.0 - total_penalty;
    
    // Log significant crowding effects
    if total_penalty > 0.2 {
        log::debug!("Plant at ({:.1}, {:.1}) has {:.1}% crowding penalty (growth rate: {:.1}%)", 
                   plant_x, plant_y, total_penalty * 100.0, multiplier * 100.0);
    }
    
    multiplier.max(0.1) // Ensure minimum 10% growth rate
}

/// Calculate mushroom-specific bonus multiplier based on low-light conditions
/// Mushrooms thrive in darkness: tree cover, cloud cover, and night time
/// Returns a multiplier bonus (e.g., 1.5x = 50% bonus) for mushrooms in ideal conditions
fn get_mushroom_bonus_multiplier(ctx: &ReducerContext, plant_x: f32, plant_y: f32, plant_type: &PlantType, time_of_day: &crate::world_state::TimeOfDay) -> f32 {
    // Check if this is a mushroom plant type
    let is_mushroom = matches!(plant_type,
        PlantType::Chanterelle |
        PlantType::Porcini |
        PlantType::FlyAgaric |
        PlantType::ShaggyInkCap |
        PlantType::DeadlyWebcap |
        PlantType::DestroyingAngel
    );
    
    if !is_mushroom {
        return 1.0; // No bonus for non-mushroom plants
    }
    
    let mut bonus_factors = Vec::new();
    
    // 1. Tree cover bonus - mushrooms grow better near trees
    const TREE_COVER_DISTANCE_SQ: f32 = 150.0 * 150.0; // Same as spawn validation distance
    let mut has_tree_cover = false;
    for tree in ctx.db.tree().iter() {
        let dx = plant_x - tree.pos_x;
        let dy = plant_y - tree.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= TREE_COVER_DISTANCE_SQ {
            has_tree_cover = true;
            // Closer trees = more bonus (up to 1.5x at very close range)
            let distance = distance_sq.sqrt();
            let proximity_bonus = 1.0 + (1.0 - (distance / 150.0).min(1.0)) * 0.5; // 1.0x to 1.5x
            bonus_factors.push(proximity_bonus);
            break; // Only need one tree for cover
        }
    }
    
    // 2. Night time bonus - mushrooms grow better in darkness
    let night_bonus = match time_of_day {
        crate::world_state::TimeOfDay::Night => 1.5,      // 50% bonus at night
        crate::world_state::TimeOfDay::Midnight => 1.6,   // 60% bonus at midnight (darkest)
        crate::world_state::TimeOfDay::TwilightEvening => 1.3, // 30% bonus at evening twilight
        crate::world_state::TimeOfDay::TwilightMorning => 1.3, // 30% bonus at morning twilight
        crate::world_state::TimeOfDay::Dusk => 1.2,       // 20% bonus at dusk
        crate::world_state::TimeOfDay::Dawn => 1.1,       // 10% bonus at dawn
        _ => 1.0, // No bonus during day
    };
    if night_bonus > 1.0 {
        bonus_factors.push(night_bonus);
    }
    
    // Calculate combined bonus
    // If multiple factors apply, average them (prevents excessive stacking)
    if bonus_factors.is_empty() {
        1.0 // No bonus
    } else {
        // Average the bonuses to prevent excessive stacking
        let average_bonus = bonus_factors.iter().sum::<f32>() / bonus_factors.len() as f32;
        // Cap at 2.0x maximum (100% bonus)
        average_bonus.min(2.0)
    }
}

/// Calculate shelter penalty for a specific planted seed
/// Returns a multiplier of 0.1 (90% penalty) if inside any shelter, 1.0 otherwise
fn get_shelter_penalty_multiplier(ctx: &ReducerContext, plant_x: f32, plant_y: f32) -> f32 {
    // Check if plant is inside any shelter
    for shelter in ctx.db.shelter().iter() {
        if shelter.is_destroyed { 
            continue; 
        }
        
        // Use the shelter's collision detection logic to check if plant is inside
        if crate::shelter::is_player_inside_shelter(plant_x, plant_y, &shelter) {
            log::info!(
                "Plant at ({:.1}, {:.1}) is inside Shelter {} - applying 90% growth penalty", 
                plant_x, plant_y, shelter.id
            );
            return 0.1; // 90% penalty - only 10% growth rate
        }
    }
    
    1.0 // No penalty if not inside any shelter
}

/// Get the growth bonus multiplier for a planted seed based on nearby fertilizer patches
/// Returns multiplier based on proximity to fertilizer patches (similar to water patches)
/// Fertilizer provides a significant boost: up to 100% faster growth when very close to patch
fn get_fertilizer_growth_multiplier(ctx: &ReducerContext, plant: &PlantedSeed) -> f32 {
    // Check for nearby fertilizer patches (like water patches work)
    crate::fertilizer_patch::get_fertilizer_patch_growth_multiplier(ctx, plant.pos_x, plant.pos_y)
}

/// Calculate the effective growth rate for current conditions
/// Returns (base_multiplier, current_season, time_of_day)
fn calculate_growth_rate_multiplier(ctx: &ReducerContext) -> (f32, crate::world_state::Season, crate::world_state::TimeOfDay) {
    // Get current world state for time of day and season
    let world_state = match ctx.db.world_state().iter().next() {
        Some(state) => state,
        None => {
            log::warn!("No WorldState found for growth calculation, using default multiplier");
            return (0.5, crate::world_state::Season::Spring, crate::world_state::TimeOfDay::Noon);
        }
    };
    
    let time_multiplier = get_time_of_day_growth_multiplier(&world_state.time_of_day);
    
    // NOTE: Weather multiplier is now calculated per-plant based on chunk weather
    // This function only returns the time-of-day multiplier as the base
    
    log::debug!("Base growth multiplier (time only): {:.2} (time={:?})", 
               time_multiplier, world_state.time_of_day);
    
    (time_multiplier, world_state.current_season, world_state.time_of_day)
}

// --- Initialization ---

/// Initialize the plant growth checking system (called from main init)
pub fn init_plant_growth_system(ctx: &ReducerContext) -> Result<(), String> {
    // Only start if no existing schedule
    if ctx.db.planted_seed_growth_schedule().count() == 0 {
        let check_interval = TimeDuration::from(Duration::from_secs(PLANT_GROWTH_CHECK_INTERVAL_SECS));
        
        crate::try_insert_schedule!(
            ctx.db.planted_seed_growth_schedule(),
            PlantedSeedGrowthSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(check_interval),
            },
            "Plant growth"
        );
    }
    
    Ok(())
}

// --- Shore Distance Calculation ---

/// Calculate distance from a position to the nearest shore
/// Returns distance in pixels (same units as world coordinates)
/// Adapted from FishingManager.tsx logic but optimized for server use
fn calculate_shore_distance(ctx: &ReducerContext, x: f32, y: f32) -> f32 {
    // Use efficient radial search instead of grid search
    // This reduces checks from ~1,000 to ~50-100 and stops early when shore is found
    
    const MAX_SEARCH_RADIUS: f32 = 200.0; // Maximum search distance in pixels (increased from 200 to match new 50m limit)
    const RADIUS_STEP: f32 = 16.0; // Check every 16 pixels radially
    const ANGLE_STEP: f32 = std::f32::consts::PI / 8.0; // Check 16 directions (22.5° apart)
    
    let mut min_distance = MAX_SEARCH_RADIUS;
    
    // Search outward in concentric circles
    let mut radius = RADIUS_STEP;
    while radius <= MAX_SEARCH_RADIUS {
        let mut found_shore_at_this_radius = false;
        
        // Check points around the circle at this radius
        let mut angle = 0.0;
        while angle < std::f32::consts::PI * 2.0 {
            let check_x = x + angle.cos() * radius;
            let check_y = y + angle.sin() * radius;
            
            // If this position is not water (i.e., it's shore/land)
            if !is_water_tile(ctx, check_x, check_y) {
                min_distance = min_distance.min(radius);
                found_shore_at_this_radius = true;
            }
            
            angle += ANGLE_STEP;
        }
        
        // Early exit: if we found shore at this radius, we don't need to search further
        // (since we're searching outward, this is likely the minimum distance)
        if found_shore_at_this_radius {
            break;
        }
        
        radius += RADIUS_STEP;
    }
    
    min_distance
}

/// Validate reed rhizome planting location
/// Reed rhizomes can only be planted on water tiles within 50 meters of shore
fn validate_reed_rhizome_planting(ctx: &ReducerContext, x: f32, y: f32) -> Result<(), String> {
    // First check if it's a water tile
    if !is_water_tile(ctx, x, y) {
        return Err("Reed Rhizome can only be planted in water".to_string());
    }
    
    // Check distance to shore (20 meters = ~200 pixels at current scale)
    const MAX_SHORE_DISTANCE: f32 = 200.0;
    let shore_distance = calculate_shore_distance(ctx, x, y);
    
    if shore_distance > MAX_SHORE_DISTANCE {
        return Err(format!("Reed Rhizome must be planted within 50m of shore (current distance: {:.1}m)", shore_distance / 10.0));
    }
    
    log::info!("Reed Rhizome planting validated at ({:.1}, {:.1}) - {:.1}m from shore", x, y, shore_distance / 10.0);
    Ok(())
}

/// Validate beach lyme grass planting location
/// Beach lyme grass can only be planted on beach tiles
fn validate_beach_lyme_grass_planting(ctx: &ReducerContext, x: f32, y: f32) -> Result<(), String> {
    // Check if it's a beach tile
    if !crate::environment::is_position_on_beach_tile(ctx, x, y) {
        return Err("Beach Lyme Grass Seeds can only be planted on beach tiles".to_string());
    }
    
    log::info!("Beach Lyme Grass planting validated at ({:.1}, {:.1})", x, y);
    Ok(())
}

/// Validate scurvy grass planting location
/// Scurvy grass can only be planted on beach tiles
fn validate_scurvy_grass_planting(ctx: &ReducerContext, x: f32, y: f32) -> Result<(), String> {
    // Check if it's a beach tile
    if !crate::environment::is_position_on_beach_tile(ctx, x, y) {
        return Err("Scurvy Grass Seeds can only be planted on beach tiles".to_string());
    }
    
    log::info!("Scurvy Grass planting validated at ({:.1}, {:.1})", x, y);
    Ok(())
}

/// Validate sea plantain planting location
/// Sea plantain can only be planted on beach tiles
fn validate_sea_plantain_planting(ctx: &ReducerContext, x: f32, y: f32) -> Result<(), String> {
    // Check if it's a beach tile
    if !crate::environment::is_position_on_beach_tile(ctx, x, y) {
        return Err("Sea Plantain Seeds can only be planted on beach tiles".to_string());
    }
    
    log::info!("Sea Plantain planting validated at ({:.1}, {:.1})", x, y);
    Ok(())
}

/// Validate glasswort planting location
/// Glasswort can only be planted on beach tiles
fn validate_glasswort_planting(ctx: &ReducerContext, x: f32, y: f32) -> Result<(), String> {
    // Check if it's a beach tile
    if !crate::environment::is_position_on_beach_tile(ctx, x, y) {
        return Err("Glasswort Seeds can only be planted on beach tiles".to_string());
    }
    
    log::info!("Glasswort planting validated at ({:.1}, {:.1})", x, y);
    Ok(())
}

// --- Planting Reducer ---

/// Plants a seed item on the ground to grow into a resource
#[spacetimedb::reducer]
pub fn plant_seed(
    ctx: &ReducerContext, 
    item_instance_id: u64, 
    plant_pos_x: f32, 
    plant_pos_y: f32
) -> Result<(), String> {
    let player_id = ctx.sender;
    
    log::info!("PLANT_SEED: Player {:?} attempting to plant item {} at ({:.1}, {:.1})", 
              player_id, item_instance_id, plant_pos_x, plant_pos_y);
    
    // Check if position is within monument zones (ALK stations, rune stones, hot springs, quarries)
    crate::building::check_monument_zone_placement(ctx, plant_pos_x, plant_pos_y)?;
    
    // Find the player
    let player = ctx.db.player().identity().find(player_id)
        .ok_or_else(|| {
            log::error!("PLANT_SEED: Player not found: {:?}", player_id);
            "Player not found".to_string()
        })?;
    
    // Check distance from player (can't plant too far away)
    let dx = player.position_x - plant_pos_x;
    let dy = player.position_y - plant_pos_y;
    let distance_sq = dx * dx + dy * dy;
    const MAX_PLANTING_DISTANCE_SQ: f32 = 150.0 * 150.0;
    
    log::info!("PLANT_SEED: Player at ({:.1}, {:.1}), planting at ({:.1}, {:.1}), distance: {:.1}px", 
              player.position_x, player.position_y, plant_pos_x, plant_pos_y, distance_sq.sqrt());
    
    if distance_sq > MAX_PLANTING_DISTANCE_SQ {
        log::error!("PLANT_SEED: Too far away - distance {:.1}px > {:.1}px max", 
                   distance_sq.sqrt(), MAX_PLANTING_DISTANCE_SQ.sqrt());
        return Err("Too far away to plant there".to_string());
    }
    
    // Find the seed item in player's inventory
    let seed_item = ctx.db.inventory_item().instance_id().find(item_instance_id)
        .ok_or_else(|| {
            log::error!("PLANT_SEED: Seed item not found: {}", item_instance_id);
            "Seed item not found".to_string()
        })?;
    
    log::info!("PLANT_SEED: Found seed item: {} (quantity: {})", seed_item.item_def_id, seed_item.quantity);
    
    // Validate ownership
    let item_location = &seed_item.location;
    let is_owned = match item_location {
        crate::models::ItemLocation::Inventory(data) => data.owner_id == player_id,
        crate::models::ItemLocation::Hotbar(data) => data.owner_id == player_id,
        _ => false,
    };
    
    if !is_owned {
        log::error!("PLANT_SEED: Player {:?} doesn't own item {}", player_id, item_instance_id);
        return Err("You don't own this item".to_string());
    }
    
    // Get the item definition
    let item_def = ctx.db.item_definition().id().find(seed_item.item_def_id)
        .ok_or_else(|| {
            log::error!("PLANT_SEED: Item definition not found: {}", seed_item.item_def_id);
            "Item definition not found".to_string()
        })?;
    
    log::info!("PLANT_SEED: Item definition found: {}", item_def.name);
    
    // Verify it's a plantable seed (using centralized database)
    log::info!("PLANT_SEED: Checking if '{}' is plantable...", item_def.name);
    let (min_growth_time_secs, max_growth_time_secs, plant_type) = get_growth_config_from_database(&item_def.name)
        .ok_or_else(|| {
            log::error!("PLANT_SEED: '{}' is not a plantable seed", item_def.name);
            format!("'{}' is not a plantable seed", item_def.name)
        })?;
    
    log::info!("PLANT_SEED: '{}' is plantable! Plant type: {:?}, growth time: {}-{} seconds", 
              item_def.name, plant_type, min_growth_time_secs, max_growth_time_secs);
    
    // Special validation for Reed Rhizome - must be planted on water near shore
    if item_def.name == "Reed Rhizome" {
        if let Err(e) = validate_reed_rhizome_planting(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Reed Rhizome validation failed: {}", e);
            return Err(e);
        }
    }
    
    // Special validation for Beach Lyme Grass Seeds - must be planted on beach tiles
    if item_def.name == "Beach Lyme Grass Seeds" {
        if let Err(e) = validate_beach_lyme_grass_planting(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Beach Lyme Grass Seeds validation failed: {}", e);
            return Err(e);
        }
    }

    // Special validation for Scurvy Grass Seeds - must be planted on beach tiles
    if item_def.name == "Scurvy Grass Seeds" {
        if let Err(e) = validate_scurvy_grass_planting(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Scurvy Grass Seeds validation failed: {}", e);
            return Err(e);
        }
    }

    // Special validation for Sea Plantain Seeds - must be planted on beach tiles
    if item_def.name == "Sea Plantain Seeds" {
        if let Err(e) = validate_sea_plantain_planting(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Sea Plantain Seeds validation failed: {}", e);
            return Err(e);
        }
    }

    // Special validation for Glasswort Seeds - must be planted on beach tiles
    if item_def.name == "Glasswort Seeds" {
        if let Err(e) = validate_glasswort_planting(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Glasswort Seeds validation failed: {}", e);
            return Err(e);
        }
    }
    
    // Validation for normal plants (non-water, non-beach) - cannot be planted on water
    // Reed Rhizome requires water, so skip this check for it
    // Beach plants require beach tiles, so skip this check for them
    if item_def.name != "Reed Rhizome" 
        && item_def.name != "Beach Lyme Grass Seeds"
        && item_def.name != "Scurvy Grass Seeds"
        && item_def.name != "Sea Plantain Seeds"
        && item_def.name != "Glasswort Seeds" {
        if is_water_tile(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: {} cannot be planted on water tiles", item_def.name);
            return Err(format!("{} cannot be planted on water tiles", item_def.name));
        }
    }
    
    // Calculate growth time (using centralized database values)
    let growth_time_secs = if min_growth_time_secs >= max_growth_time_secs {
        min_growth_time_secs
    } else {
        ctx.rng().gen_range(min_growth_time_secs..=max_growth_time_secs)
    };
    
    let maturity_time = ctx.timestamp + TimeDuration::from(Duration::from_secs(growth_time_secs));
    let chunk_index = calculate_chunk_index(plant_pos_x, plant_pos_y);
    
    log::info!("PLANT_SEED: Creating planted seed - growth time: {}s, chunk: {}", growth_time_secs, chunk_index);
    
    // Create the planted seed with initial maturity estimate
    // Note: will_mature_at will be dynamically updated based on environmental conditions
    let planted_seed = PlantedSeed {
        id: 0, // Auto-inc
        pos_x: plant_pos_x,
        pos_y: plant_pos_y,
        chunk_index,
        seed_type: item_def.name.clone(),
        plant_type: plant_type, // Store the target plant type from centralized database
        planted_at: ctx.timestamp,
        will_mature_at: maturity_time, // Initial estimate, will be updated dynamically
        planted_by: player_id,
        growth_progress: 0.0,
        base_growth_time_secs: growth_time_secs,
        last_growth_update: ctx.timestamp,
        fertilized_at: None, // Not fertilized initially
    };
    
    match ctx.db.planted_seed().try_insert(planted_seed) {
        Ok(inserted) => {
            log::info!("PLANT_SEED: Successfully inserted planted seed with ID: {}", inserted.id);
        }
        Err(e) => {
            log::error!("PLANT_SEED: Failed to insert planted seed: {}", e);
            return Err(format!("Failed to plant seed: {}", e));
        }
    }
    
    // Remove the seed item from inventory (consume 1)
    if seed_item.quantity > 1 {
        let mut updated_item = seed_item;
        updated_item.quantity -= 1;
        let new_quantity = updated_item.quantity; // Store quantity before move
        ctx.db.inventory_item().instance_id().update(updated_item);
        log::info!("PLANT_SEED: Reduced seed quantity to {}", new_quantity);
    } else {
        ctx.db.inventory_item().instance_id().delete(item_instance_id);
        log::info!("PLANT_SEED: Deleted last seed item");
    }
    
    log::info!("PLANT_SEED: SUCCESS - Player {:?} planted {} at ({:.1}, {:.1}) - will mature in {} seconds", 
              player_id, item_def.name, plant_pos_x, plant_pos_y, growth_time_secs);
    
    // Emit plant seed sound
    crate::sound_events::emit_plant_seed_sound(ctx, plant_pos_x, plant_pos_y, player_id);
    
    Ok(())
}

/// Apply fertilizer to nearby crops (triggered by left-click with fertilizer equipped)
#[spacetimedb::reducer]
pub fn apply_fertilizer(ctx: &ReducerContext, fertilizer_instance_id: u64) -> Result<(), String> {
    let player_id = ctx.sender;
    
    log::info!("Player {} attempting to apply fertilizer with item {}", player_id, fertilizer_instance_id);
    
    // Find the player
    let player = ctx.db.player().identity().find(&player_id)
        .ok_or_else(|| "Player not found".to_string())?;
    
    // Find the fertilizer item
    let mut fertilizer_item = ctx.db.inventory_item().instance_id().find(&fertilizer_instance_id)
        .ok_or_else(|| "Fertilizer item not found".to_string())?;
    
    // Verify ownership
    let owns_fertilizer = match &fertilizer_item.location {
        crate::models::ItemLocation::Inventory(data) => data.owner_id == player_id,
        crate::models::ItemLocation::Hotbar(data) => data.owner_id == player_id,
        crate::models::ItemLocation::Equipped(data) => data.owner_id == player_id,
        _ => false,
    };
    
    if !owns_fertilizer {
        return Err("You don't own this fertilizer".to_string());
    }
    
    // Get fertilizer definition
    let fertilizer_def = ctx.db.item_definition().id().find(&fertilizer_item.item_def_id)
        .ok_or_else(|| "Fertilizer definition not found".to_string())?;
    
    // Check if it's actually fertilizer
    if fertilizer_def.name != "Fertilizer" {
        return Err("This item is not fertilizer".to_string());
    }
    
    // Check if player has any fertilizer
    if fertilizer_item.quantity == 0 {
        return Err("Fertilizer bag is empty".to_string());
    }
    
    // Calculate where fertilizer should be applied (in front of player based on facing direction)
    let facing_angle = match player.direction.as_str() {
        "up" => -std::f32::consts::PI / 2.0,
        "down" => std::f32::consts::PI / 2.0,
        "right" => 0.0,
        "left" => std::f32::consts::PI,
        "up_right" => -std::f32::consts::PI / 4.0,
        "up_left" => -3.0 * std::f32::consts::PI / 4.0,
        "down_right" => std::f32::consts::PI / 4.0,
        "down_left" => 3.0 * std::f32::consts::PI / 4.0,
        _ => std::f32::consts::PI / 2.0, // Default to down
    };
    
    // Apply fertilizer in front of player (similar to water placement)
    const FERTILIZER_APPLICATION_DISTANCE: f32 = 80.0; // Distance in front of player
    let fertilizer_x = player.position_x + (facing_angle.cos() * FERTILIZER_APPLICATION_DISTANCE);
    let fertilizer_y = player.position_y + (facing_angle.sin() * FERTILIZER_APPLICATION_DISTANCE);
    
    // Check if there's already a fertilizer patch at this location (prevent stacking)
    let has_patch_at_location = {
        let mut has_patch = false;
        for patch in ctx.db.fertilizer_patch().iter() {
            let dx = patch.pos_x - fertilizer_x;
            let dy = patch.pos_y - fertilizer_y;
            let distance_sq = dx * dx + dy * dy;
            
            // If there's already a patch within collision radius, consider it occupied
            if distance_sq <= (crate::fertilizer_patch::FERTILIZER_PATCH_COLLISION_RADIUS * crate::fertilizer_patch::FERTILIZER_PATCH_COLLISION_RADIUS) {
                has_patch = true;
                break;
            }
        }
        has_patch
    };
    
    if has_patch_at_location {
        return Err("There's already fertilizer at this location".to_string());
    }
    
    // Consume 1 fertilizer (always consume 1, regardless of nearby crops)
    // The patch will affect any crops planted nearby, just like water patches
    if fertilizer_item.quantity > 1 {
        fertilizer_item.quantity -= 1;
        ctx.db.inventory_item().instance_id().update(fertilizer_item);
    } else {
        // Used all fertilizer, delete the item
        ctx.db.inventory_item().instance_id().delete(fertilizer_instance_id);
    }
    
    // Create fertilizer patch at application location (always create, like water patches)
    if let Err(e) = crate::fertilizer_patch::create_fertilizer_patch(ctx, fertilizer_x, fertilizer_y, player_id) {
        log::error!("Failed to create fertilizer patch: {}", e);
        return Err(format!("Failed to create fertilizer patch: {}", e));
    }
    
    log::info!("Player {} created fertilizer patch at ({:.1}, {:.1})", 
              player_id, fertilizer_x, fertilizer_y);
    
    // Emit fertilizer application sound effect
    crate::sound_events::emit_plant_seed_sound(ctx, fertilizer_x, fertilizer_y, player_id);
    
    Ok(())
}

// --- Scheduled Growth Checker ---

/// Scheduled reducer that checks for plants ready to mature
#[spacetimedb::reducer]
pub fn check_plant_growth(ctx: &ReducerContext, _args: PlantedSeedGrowthSchedule) -> Result<(), String> {
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("This reducer can only be called by the scheduler".to_string());
    }
    
    let current_time = ctx.timestamp;
    let (base_time_multiplier, current_season, current_time_of_day) = calculate_growth_rate_multiplier(ctx);
    let mut plants_updated = 0;
    let mut plants_matured = 0;
    let mut plants_dormant = 0;
    let mut plants_died = 0;
    
    // Process all planted seeds to update their growth
    let all_plants: Vec<PlantedSeed> = ctx.db.planted_seed().iter().collect();
    
    for mut plant in all_plants {
        // Calculate time elapsed since last update
        let elapsed_micros = current_time.to_micros_since_unix_epoch()
            .saturating_sub(plant.last_growth_update.to_micros_since_unix_epoch());
        let elapsed_seconds = (elapsed_micros as f64 / 1_000_000.0) as f32;
        
        if elapsed_seconds <= 0.0 {
            continue; // No time has passed
        }
        
        // Check if this plant can grow in the current season
        if !crate::plants_database::can_grow_in_season(&plant.plant_type, &current_season) {
            // Plant is dormant this season - update last_growth_update but don't grow
            let plant_id = plant.id;
            let plant_type = plant.plant_type;
            let plant_pos_x = plant.pos_x;
            let plant_pos_y = plant.pos_y;
            let plant_progress = plant.growth_progress;
            
            plant.last_growth_update = current_time;
            ctx.db.planted_seed().id().update(plant);
            plants_dormant += 1;
            
            log::debug!("Plant {} ({:?}) is dormant during {:?} season at ({:.1}, {:.1}) - progress: {:.1}%", 
                       plant_id, plant_type, current_season, plant_pos_x, plant_pos_y, plant_progress * 100.0);
            continue;
        }
        
        // Get chunk-specific weather for this plant's location
        let chunk_weather = crate::world_state::get_weather_for_position(ctx, plant.pos_x, plant.pos_y);
        
        // Check if plant dies from severe weather
        if check_plant_death_from_weather(ctx, &chunk_weather.current_weather) {
            let plant_id = plant.id;
            let plant_type = plant.seed_type.clone();
            let plant_pos_x = plant.pos_x;
            let plant_pos_y = plant.pos_y;
            let weather = chunk_weather.current_weather;
            
            // Delete the plant - it died from weather
            ctx.db.planted_seed().id().delete(plant.id);
            plants_died += 1;
            
            log::info!("Plant {} ({}) died from {:?} at ({:.1}, {:.1}) - progress was {:.1}%", 
                      plant_id, plant_type, weather, plant_pos_x, plant_pos_y, plant.growth_progress * 100.0);
            
            continue; // Skip to next plant
        }
        
        let weather_multiplier = get_weather_growth_multiplier(&chunk_weather.current_weather, chunk_weather.rain_intensity);
        
        // Calculate base growth multiplier (time * weather)
        let base_growth_multiplier = base_time_multiplier * weather_multiplier;
        
        // Calculate cloud cover effect for this specific plant
        // For mushrooms, clouds help growth, so we'll handle it differently
        let is_mushroom = matches!(plant.plant_type,
            PlantType::Chanterelle |
            PlantType::Porcini |
            PlantType::FlyAgaric |
            PlantType::ShaggyInkCap |
            PlantType::DeadlyWebcap |
            PlantType::DestroyingAngel
        );
        
        let cloud_multiplier = if is_mushroom {
            // For mushrooms, clouds help - invert the normal cloud penalty
            let normal_cloud_mult = get_cloud_cover_growth_multiplier(ctx, plant.pos_x, plant.pos_y);
            // Normal: 0.4 (heavy clouds) to 1.0 (no clouds) - penalizes growth
            // Mushrooms: invert to 1.0 (heavy clouds) to 0.4 (no clouds) - helps growth
            // But we want it to help, so: 1.0 + (1.0 - normal_mult) * 0.6
            // Heavy clouds (0.4) → 1.36x, No clouds (1.0) → 1.0x
            1.0 + (1.0 - normal_cloud_mult) * 0.6
        } else {
            // For regular plants, clouds reduce growth as normal
            get_cloud_cover_growth_multiplier(ctx, plant.pos_x, plant.pos_y)
        };
        
        // Calculate light source effect for this specific plant
        let light_multiplier = get_light_source_growth_multiplier(ctx, plant.pos_x, plant.pos_y);
        
        // Calculate crowding penalty for this specific plant
        let crowding_multiplier = get_crowding_penalty_multiplier(ctx, plant.pos_x, plant.pos_y, plant.id);
        
        // Calculate shelter penalty for this specific plant
        let shelter_multiplier = get_shelter_penalty_multiplier(ctx, plant.pos_x, plant.pos_y);
        
        // Calculate water patch bonus for this specific plant
        let water_multiplier = crate::water_patch::get_water_patch_growth_multiplier(ctx, plant.pos_x, plant.pos_y);
        
        // Calculate fertilizer bonus for this specific plant (checks for nearby patches)
        let fertilizer_multiplier = get_fertilizer_growth_multiplier(ctx, &plant);
        
        // Calculate mushroom-specific bonus (tree cover and night time only - cloud is handled above)
        let mushroom_bonus = get_mushroom_bonus_multiplier(ctx, plant.pos_x, plant.pos_y, &plant.plant_type, &current_time_of_day);
        
        // Calculate green rune stone bonus (agrarian effect)
        let green_rune_multiplier = crate::rune_stone::get_green_rune_growth_multiplier(ctx, plant.pos_x, plant.pos_y, &plant.plant_type);
        
        // PvP-oriented: If green rune stone is active, guarantee 2x growth regardless of other conditions
        let total_growth_multiplier = if green_rune_multiplier > 1.0 {
            // Green rune stone active - guarantee 2x growth (ignore other penalties/bonuses)
            green_rune_multiplier
        } else {
            // No green rune stone - apply all normal modifiers
            base_growth_multiplier * cloud_multiplier * light_multiplier * crowding_multiplier * shelter_multiplier * water_multiplier * fertilizer_multiplier * mushroom_bonus
        };
        
        // Calculate growth progress increment
        let base_growth_rate = 1.0 / plant.base_growth_time_secs as f32; // Progress per second at 1x multiplier
        let actual_growth_rate = base_growth_rate * total_growth_multiplier;
        let growth_increment = actual_growth_rate * elapsed_seconds;
        
        // Update growth progress
        let old_progress = plant.growth_progress;
        plant.growth_progress = (plant.growth_progress + growth_increment).min(1.0);
        plant.last_growth_update = current_time;
        
        // Update estimated maturity time based on current growth rate
        if total_growth_multiplier > 0.0 && plant.growth_progress < 1.0 {
            let remaining_progress = 1.0 - plant.growth_progress;
            let estimated_remaining_seconds = remaining_progress / actual_growth_rate;
            plant.will_mature_at = current_time + TimeDuration::from_micros((estimated_remaining_seconds * 1_000_000.0) as i64);
        }
        
        // Check if plant has matured
        if plant.growth_progress >= 1.0 {
            // Plant is ready to mature!
            let plant_clone = plant.clone(); // Clone for logging and resource creation
            match grow_plant_to_resource(ctx, &plant_clone) {
                Ok(()) => {
                    plants_matured += 1;
                    // Remove the planted seed entry
                    ctx.db.planted_seed().id().delete(plant.id);
                    log::info!("Plant {} ({}) matured at ({:.1}, {:.1}) after {:.1}% growth", 
                              plant_clone.id, plant_clone.seed_type, plant_clone.pos_x, plant_clone.pos_y, plant_clone.growth_progress * 100.0);
                }
                Err(e) => {
                    log::error!("Failed to grow plant {} ({}): {}", plant.id, plant.seed_type, e);
                    // Update the plant anyway to track progress
                    ctx.db.planted_seed().id().update(plant);
                    plants_updated += 1;
                }
            }
        } else {
            // Update the plant with new progress
            let plant_id = plant.id;
            let plant_type = plant.seed_type.clone();
            let progress_pct = plant.growth_progress * 100.0;
            ctx.db.planted_seed().id().update(plant);
            plants_updated += 1;
            
            if growth_increment > 0.0 {
                log::debug!("Plant {} ({}) grew from {:.1}% to {:.1}% (time: {:.2}x, weather: {:.2}x, cloud: {:.2}x, light: {:.2}x, crowding: {:.2}x, shelter: {:.2}x, water: {:.2}x, fertilizer: {:.2}x, mushroom: {:.2}x, total: {:.2}x) [chunk weather: {:?}]", 
                           plant_id, plant_type, old_progress * 100.0, progress_pct, 
                           base_time_multiplier, weather_multiplier, cloud_multiplier, light_multiplier, crowding_multiplier, shelter_multiplier, water_multiplier, fertilizer_multiplier, mushroom_bonus, total_growth_multiplier, chunk_weather.current_weather);
            }
        }
    }
    
    if plants_matured > 0 || plants_updated > 0 || plants_dormant > 0 || plants_died > 0 {
        log::info!("Growth check: {} plants matured, {} plants updated, {} plants dormant, {} plants died from weather (season: {:?}, time multiplier: {:.2}x)", 
                  plants_matured, plants_updated, plants_dormant, plants_died, current_season, base_time_multiplier);
    }
    
    Ok(())
}

// --- Growth Helper Functions ---

/// Converts a planted seed into its corresponding harvestable resource
fn grow_plant_to_resource(ctx: &ReducerContext, plant: &PlantedSeed) -> Result<(), String> {
    // Plant type is now stored directly in the planted seed (from centralized database)
    let plant_type = plant.plant_type;
    
    // Create the harvestable resource using the unified system
    let harvestable_resource = crate::harvestable_resource::create_harvestable_resource(
        plant_type, // No need to clone since PlantType now implements Copy
        plant.pos_x,
        plant.pos_y,
        plant.chunk_index,
        true // Mark as player-planted to avoid seasonal respawn multiplier
    );
    
    match ctx.db.harvestable_resource().try_insert(harvestable_resource) {
        Ok(inserted_resource) => {
            log::info!(
                "Successfully grew {:?} from {} at ({:.1}, {:.1}), ID: {}",
                plant_type, plant.seed_type, plant.pos_x, plant.pos_y, inserted_resource.id
            );
            Ok(())
        }
        Err(e) => {
            log::error!(
                "Failed to insert grown {:?} from {}: {}",
                plant_type, plant.seed_type, e
            );
            Err(format!("Failed to create harvestable resource: {}", e))
        }
    }
} 