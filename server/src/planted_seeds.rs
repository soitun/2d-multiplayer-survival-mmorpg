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
    #[index(btree)]
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
    /// For tree saplings only: the specific tree type this will become when mature.
    /// Determined at planting time based on seed type + biome. None for non-tree plants.
    pub target_tree_type: Option<crate::tree::TreeType>,
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

/// Calculate shade-loving plant bonus multiplier based on environmental conditions
/// - Mushrooms thrive in darkness: tree cover AND night time bonuses
/// - Berries prefer partial shade: tree cover bonus only (they still need sunlight)
/// Returns a multiplier bonus (e.g., 1.5x = 50% bonus) for plants in ideal conditions
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
    
    // Check if this is a berry plant type (berry bushes grow well in forest edges)
    let is_berry = matches!(plant_type,
        PlantType::Lingonberries |
        PlantType::Cloudberries |
        PlantType::Bilberries |
        PlantType::WildStrawberries |
        PlantType::RowanBerries |
        PlantType::Cranberries |
        PlantType::Crowberry
    );
    
    // Check if this is a shade-tolerant herbaceous plant (forest edge species)
    // These plants evolved in forest margins and tolerate partial shade
    let is_shade_tolerant_herb = matches!(plant_type,
        PlantType::BorealNettle |  // Nettles thrive in forest edges and disturbed areas
        PlantType::Chicory         // Deep-rooted, tolerates woodland edges
    );
    
    // Exit early if not a shade-loving plant
    if !is_mushroom && !is_berry && !is_shade_tolerant_herb {
        return 1.0; // No bonus for other plants
    }
    
    let mut bonus_factors = Vec::new();
    
    // 1. Tree cover bonus - shade-loving plants grow better near trees
    // Mushrooms, berries, and forest-edge herbs naturally thrive with partial shade
    const TREE_COVER_DISTANCE_SQ: f32 = 150.0 * 150.0; // Same as spawn validation distance
    for tree in ctx.db.tree().iter() {
        let dx = plant_x - tree.pos_x;
        let dy = plant_y - tree.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= TREE_COVER_DISTANCE_SQ {
            // Closer trees = more bonus
            let distance = distance_sq.sqrt();
            // Mushrooms: up to 1.5x at very close range (they love shade)
            // Berries: up to 1.35x at very close range (partial shade)
            // Shade-tolerant herbs (nettle, chicory): up to 1.30x (forest edge plants)
            let max_bonus = if is_mushroom { 0.5 } else if is_berry { 0.35 } else { 0.30 };
            let proximity_bonus = 1.0 + (1.0 - (distance / 150.0).min(1.0)) * max_bonus;
            bonus_factors.push(proximity_bonus);
            break; // Only need one tree for cover
        }
    }
    
    // 2. Night time bonus - MUSHROOMS ONLY (berries need sunlight for photosynthesis)
    if is_mushroom {
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

// =============================================================================
// ECOLOGICAL BONUS MULTIPLIERS
// These functions provide enhanced bonuses for plants based on real-world ecology
// =============================================================================

/// Check if a plant type is water-loving (benefits more from moisture)
/// These plants evolved in wet environments and thrive near water sources
fn is_water_loving_plant(plant_type: &PlantType) -> bool {
    matches!(plant_type,
        PlantType::BorealNettle |    // Nettles love moist, nutrient-rich soil
        PlantType::Cranberries |     // Bog plant, needs very wet conditions
        PlantType::Corn |            // Traditional "Three Sisters" - grows near water
        PlantType::Reed |            // Aquatic/wetland plant
        PlantType::Cabbage           // Leafy vegetable needs consistent moisture
    )
}

/// Calculate enhanced water bonus multiplier for water-loving plants
/// Returns a multiplier to amplify the base water patch bonus
/// Water-loving plants get 50% more benefit from water patches
pub fn get_water_loving_multiplier(plant_type: &PlantType, base_water_multiplier: f32) -> f32 {
    if !is_water_loving_plant(plant_type) {
        return base_water_multiplier; // No enhancement for other plants
    }
    
    // If water bonus is active (>1.0), enhance it by 50%
    // E.g., 1.5x water bonus becomes 1.75x for water-loving plants
    if base_water_multiplier > 1.0 {
        let bonus_portion = base_water_multiplier - 1.0;
        1.0 + (bonus_portion * 1.5) // 50% more benefit from water
    } else {
        base_water_multiplier // No enhancement if no water bonus
    }
}

/// Check if a plant type is nitrogen-loving (benefits more from fertilizer)
/// These are heavy-feeding plants that evolved in nutrient-rich environments
fn is_nitrogen_loving_plant(plant_type: &PlantType) -> bool {
    matches!(plant_type,
        PlantType::BorealNettle |    // Famous nitrogen indicator plant
        PlantType::Corn |            // Heavy nitrogen feeder
        PlantType::Cabbage |         // Heavy feeding brassica
        PlantType::Pumpkin           // Vigorous grower, heavy feeder
    )
}

/// Calculate enhanced fertilizer bonus multiplier for nitrogen-loving plants
/// Returns a multiplier to amplify the base fertilizer patch bonus
/// Nitrogen-loving plants get 75% more benefit from fertilizer
pub fn get_nitrogen_loving_multiplier(plant_type: &PlantType, base_fertilizer_multiplier: f32) -> f32 {
    if !is_nitrogen_loving_plant(plant_type) {
        return base_fertilizer_multiplier; // No enhancement for other plants
    }
    
    // If fertilizer bonus is active (>1.0), enhance it by 75%
    // E.g., 2.0x fertilizer bonus becomes 2.75x for nitrogen-loving plants
    if base_fertilizer_multiplier > 1.0 {
        let bonus_portion = base_fertilizer_multiplier - 1.0;
        1.0 + (bonus_portion * 1.75) // 75% more benefit from fertilizer
    } else {
        base_fertilizer_multiplier // No enhancement if no fertilizer bonus
    }
}

/// Check if a plant type is a root crop (benefits more from tilled soil)
/// Root vegetables need loose, well-worked soil for proper root development
fn is_root_crop(plant_type: &PlantType) -> bool {
    matches!(plant_type,
        PlantType::Potato |      // Tubers need loose soil to expand
        PlantType::Carrot |      // Long roots need stone-free, loose soil
        PlantType::Beets |       // Root vegetable needs well-worked soil
        PlantType::Horseradish   // Deep tap root needs loose soil
    )
}

/// Calculate enhanced soil bonus multiplier for root crops
/// Returns a multiplier to amplify the base tilled soil bonus
/// Root crops get 60% more benefit from prepared soil
pub fn get_root_crop_soil_multiplier(plant_type: &PlantType, base_soil_multiplier: f32) -> f32 {
    if !is_root_crop(plant_type) {
        return base_soil_multiplier; // No enhancement for other plants
    }
    
    // If soil bonus is active (>1.0), enhance it by 60%
    // E.g., 1.5x soil bonus becomes 1.8x for root crops
    if base_soil_multiplier > 1.0 {
        let bonus_portion = base_soil_multiplier - 1.0;
        1.0 + (bonus_portion * 1.6) // 60% more benefit from prepared soil
    } else {
        base_soil_multiplier // No enhancement if no soil bonus
    }
}

/// Check if a plant type is beach-specific (native to sandy/coastal environments)
/// Beach-specific plants don't suffer growth penalties on beach tiles
fn is_beach_specific_plant(plant_type: &PlantType) -> bool {
    matches!(plant_type,
        PlantType::BeachLymeGrass |
        PlantType::ScurvyGrass |
        PlantType::SeaPlantain |
        PlantType::Glasswort |
        PlantType::SeaweedBed |  // Underwater/coastal plant
        PlantType::Reed |         // Water/wetland plant
        PlantType::BeachWoodPile  // Beach debris
    )
}

/// Calculate beach tile growth penalty for non-beach plants
/// Non-beach plants struggle in sandy/saline soil conditions
/// Returns a multiplier: 0.5 (50% growth rate) for non-beach plants on beach, 1.0 otherwise
const BEACH_TILE_GROWTH_PENALTY: f32 = 0.5; // 50% growth rate = takes 2x longer

fn get_beach_tile_penalty_multiplier(ctx: &ReducerContext, plant_x: f32, plant_y: f32, plant_type: &PlantType) -> f32 {
    // Beach-specific plants thrive on beach tiles - no penalty
    if is_beach_specific_plant(plant_type) {
        return 1.0;
    }
    
    // Check if the plant is on a beach tile
    if crate::environment::is_position_on_beach_tile(ctx, plant_x, plant_y) {
        log::debug!("Plant at ({:.1}, {:.1}) is on beach tile - applying {:.0}% growth penalty",
                   plant_x, plant_y, (1.0 - BEACH_TILE_GROWTH_PENALTY) * 100.0);
        return BEACH_TILE_GROWTH_PENALTY;
    }
    
    1.0 // No penalty for non-beach tiles
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

/// Calculate the initial growth multiplier for a newly planted seed
/// This gives a quick estimate based on current conditions (refined by growth ticks)
fn calculate_initial_growth_multiplier(
    ctx: &ReducerContext,
    pos_x: f32,
    pos_y: f32,
    plant_type: &PlantType,
) -> f32 {
    // Get base multipliers
    let (base_time_multiplier, _season, current_time_of_day) = calculate_growth_rate_multiplier(ctx);
    
    // Calculate individual multipliers with ecological bonuses
    // Water-loving plants (nettle, cranberries, corn, reed, cabbage) get 50% more benefit
    let base_water_mult = crate::water_patch::get_water_patch_growth_multiplier(ctx, pos_x, pos_y);
    let water_multiplier = get_water_loving_multiplier(plant_type, base_water_mult);
    
    let fertilizer_multiplier = 1.0; // No fertilizer patches at planting time (would need a planted seed)
    
    // Root crops (potato, carrot, beets, horseradish) get 60% more benefit from tilled soil
    let base_soil_mult = crate::tilled_tiles::get_soil_growth_multiplier(ctx, pos_x, pos_y);
    let soil_multiplier = get_root_crop_soil_multiplier(plant_type, base_soil_mult);
    
    let green_rune_multiplier = crate::rune_stone::get_green_rune_growth_multiplier(ctx, pos_x, pos_y, plant_type);
    let beach_multiplier = get_beach_tile_penalty_multiplier(ctx, pos_x, pos_y, plant_type);
    
    // Calculate shade-loving plant bonus if applicable (mushrooms, berries, nettle, chicory)
    let mushroom_bonus = get_mushroom_bonus_multiplier(ctx, pos_x, pos_y, plant_type, &current_time_of_day);
    
    // If green rune stone is active, apply positive bonuses only (ignore penalties)
    if green_rune_multiplier > 1.0 {
        green_rune_multiplier * water_multiplier * mushroom_bonus * soil_multiplier
    } else {
        // Apply base time multiplier (which includes time of day effects)
        // Note: We don't have full environmental data at planting, so this is an estimate
        base_time_multiplier.max(0.1) * water_multiplier * mushroom_bonus * soil_multiplier * beach_multiplier
    }
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

/// Validate seaweed frond planting location
/// Seaweed fronds can only be planted on water tiles (no snorkeling required)
/// Unlike reed rhizomes (which must be near shore), seaweed can be planted anywhere in water
fn validate_seaweed_frond_planting(_ctx: &ReducerContext, _player_id: spacetimedb::Identity, x: f32, y: f32) -> Result<(), String> {
    // Check if it's a water tile - that's the only requirement
    if !is_water_tile(_ctx, x, y) {
        return Err("Seaweed Frond can only be planted on water tiles".to_string());
    }
    
    // No snorkeling requirement - players can plant from the surface
    // No shore distance restriction - seaweed can be planted anywhere in water
    log::info!("Seaweed Frond planting validated at ({:.1}, {:.1})", x, y);
    Ok(())
}

// --- Alpine Plant Validation ---

/// Validate arctic lichen spores planting location
/// Arctic Lichen can only be planted on alpine tiles
fn validate_arctic_lichen_planting(ctx: &ReducerContext, x: f32, y: f32) -> Result<(), String> {
    if !crate::environment::is_position_on_alpine_tile(ctx, x, y) {
        return Err("Lichen Spores can only be planted on alpine mountain tiles".to_string());
    }
    log::info!("Arctic Lichen planting validated at ({:.1}, {:.1})", x, y);
    Ok(())
}

/// Validate mountain moss spores planting location
/// Mountain Moss can only be planted on alpine tiles
fn validate_mountain_moss_planting(ctx: &ReducerContext, x: f32, y: f32) -> Result<(), String> {
    if !crate::environment::is_position_on_alpine_tile(ctx, x, y) {
        return Err("Moss Spores can only be planted on alpine mountain tiles".to_string());
    }
    log::info!("Mountain Moss planting validated at ({:.1}, {:.1})", x, y);
    Ok(())
}

/// Validate arctic poppy seeds planting location
/// Arctic Poppy can only be planted on alpine tiles
fn validate_arctic_poppy_planting(ctx: &ReducerContext, x: f32, y: f32) -> Result<(), String> {
    if !crate::environment::is_position_on_alpine_tile(ctx, x, y) {
        return Err("Arctic Poppy Seeds can only be planted on alpine mountain tiles".to_string());
    }
    log::info!("Arctic Poppy planting validated at ({:.1}, {:.1})", x, y);
    Ok(())
}

/// Validate arctic hairgrass seeds planting location
/// Arctic Hairgrass can only be planted on alpine tiles
fn validate_arctic_hairgrass_planting(ctx: &ReducerContext, x: f32, y: f32) -> Result<(), String> {
    if !crate::environment::is_position_on_alpine_tile(ctx, x, y) {
        return Err("Arctic Hairgrass Seeds can only be planted on alpine mountain tiles".to_string());
    }
    log::info!("Arctic Hairgrass planting validated at ({:.1}, {:.1})", x, y);
    Ok(())
}

// --- Tundra Plant Validation ---

/// Validate crowberry seeds planting location
/// Crowberry can only be planted on tundra tiles
fn validate_crowberry_planting(ctx: &ReducerContext, x: f32, y: f32) -> Result<(), String> {
    if !crate::environment::is_position_on_tundra_tile(ctx, x, y) {
        return Err("Crowberry Seeds can only be planted on tundra tiles".to_string());
    }
    log::info!("Crowberry planting validated at ({:.1}, {:.1})", x, y);
    Ok(())
}

/// Validate fireweed seeds planting location
/// Fireweed can only be planted on tundra tiles
fn validate_fireweed_planting(ctx: &ReducerContext, x: f32, y: f32) -> Result<(), String> {
    if !crate::environment::is_position_on_tundra_tile(ctx, x, y) {
        return Err("Fireweed Seeds can only be planted on tundra tiles".to_string());
    }
    log::info!("Fireweed planting validated at ({:.1}, {:.1})", x, y);
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
    
    // Special validation for Seaweed Frond - must be planted underwater while snorkeling
    if item_def.name == "Seaweed Frond" {
        if let Err(e) = validate_seaweed_frond_planting(ctx, player_id, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Seaweed Frond validation failed: {}", e);
            return Err(e);
        }
    }
    
    // === ALPINE PLANT VALIDATIONS ===
    
    // Special validation for Lichen Spores - must be planted on alpine tiles
    if item_def.name == "Lichen Spores" {
        if let Err(e) = validate_arctic_lichen_planting(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Lichen Spores validation failed: {}", e);
            return Err(e);
        }
    }
    
    // Special validation for Moss Spores - must be planted on alpine tiles
    if item_def.name == "Moss Spores" {
        if let Err(e) = validate_mountain_moss_planting(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Moss Spores validation failed: {}", e);
            return Err(e);
        }
    }
    
    // Special validation for Arctic Poppy Seeds - must be planted on alpine tiles
    if item_def.name == "Arctic Poppy Seeds" {
        if let Err(e) = validate_arctic_poppy_planting(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Arctic Poppy Seeds validation failed: {}", e);
            return Err(e);
        }
    }
    
    // Special validation for Arctic Hairgrass Seeds - must be planted on alpine tiles
    if item_def.name == "Arctic Hairgrass Seeds" {
        if let Err(e) = validate_arctic_hairgrass_planting(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Arctic Hairgrass Seeds validation failed: {}", e);
            return Err(e);
        }
    }
    
    // === TUNDRA PLANT VALIDATIONS ===
    
    // Special validation for Crowberry Seeds - must be planted on tundra tiles
    if item_def.name == "Crowberry Seeds" {
        if let Err(e) = validate_crowberry_planting(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Crowberry Seeds validation failed: {}", e);
            return Err(e);
        }
    }
    
    // Special validation for Fireweed Seeds - must be planted on tundra tiles
    if item_def.name == "Fireweed Seeds" {
        if let Err(e) = validate_fireweed_planting(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Fireweed Seeds validation failed: {}", e);
            return Err(e);
        }
    }
    
    // Validation for normal plants (non-water, non-beach) - cannot be planted on water
    // Reed Rhizome requires water, so skip this check for it
    // Seaweed Frond requires deep water, so skip this check for it
    // Beach plants require beach tiles, so skip this check for them
    if item_def.name != "Reed Rhizome" 
        && item_def.name != "Seaweed Frond"
        && item_def.name != "Beach Lyme Grass Seeds"
        && item_def.name != "Scurvy Grass Seeds"
        && item_def.name != "Sea Plantain Seeds"
        && item_def.name != "Glasswort Seeds" {
        if is_water_tile(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: {} cannot be planted on water tiles", item_def.name);
            return Err(format!("{} cannot be planted on water tiles", item_def.name));
        }
    }
    
    // === TREE SEED VALIDATION ===
    // Tree seeds (Pinecone, Birch Catkin) have special planting restrictions
    let is_pinecone = item_def.name == "Pinecone";
    let is_birch_catkin = item_def.name == "Birch Catkin";
    let is_tree_seed = is_pinecone || is_birch_catkin;
    
    if is_tree_seed {
        // === BIOME RESTRICTIONS ===
        // Conifers (Pinecone) cannot be planted on beach tiles - they don't survive salt spray
        if is_pinecone && crate::environment::is_position_on_beach_tile(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Pinecone cannot be planted on beach tiles - conifers don't grow on beaches");
            return Err("Cannot plant Pinecone on beach - conifer trees don't grow in sandy, salt-spray environments.".to_string());
        }
        
        // Birch Catkin can be planted on: Grass, Forest, Beach, Tundra (NOT Alpine - too rocky)
        if is_birch_catkin && crate::environment::is_position_on_alpine_tile(ctx, plant_pos_x, plant_pos_y) {
            log::error!("PLANT_SEED: Birch Catkin cannot be planted on alpine tiles - too rocky for deciduous trees");
            return Err("Cannot plant Birch Catkin on alpine terrain - the rocky soil can't support deciduous trees.".to_string());
        }
        
        // Tree seeds need clearance from other planted seeds
        // Using tree trunk radius (24px) + additional buffer for the tree crown (120px total)
        // This ensures the tree won't immediately engulf adjacent plants when it matures
        const TREE_SEED_MIN_DISTANCE_FROM_OTHER_SEEDS: f32 = 120.0;
        const TREE_SEED_MIN_DISTANCE_SQ: f32 = TREE_SEED_MIN_DISTANCE_FROM_OTHER_SEEDS * TREE_SEED_MIN_DISTANCE_FROM_OTHER_SEEDS;
        
        // Check distance to all other planted seeds
        for other_seed in ctx.db.planted_seed().iter() {
            let dx = plant_pos_x - other_seed.pos_x;
            let dy = plant_pos_y - other_seed.pos_y;
            let distance_sq = dx * dx + dy * dy;
            
            if distance_sq < TREE_SEED_MIN_DISTANCE_SQ {
                let distance = distance_sq.sqrt();
                log::error!("PLANT_SEED: {} cannot be planted within {} pixels of other seeds (found {} at {:.1}px away)", 
                    item_def.name, TREE_SEED_MIN_DISTANCE_FROM_OTHER_SEEDS, other_seed.seed_type, distance);
                return Err(format!(
                    "Cannot plant {} here - too close to another planted seed ({} at {:.0}px away). Trees need at least {:.0}px clearance from other plants.",
                    item_def.name, other_seed.seed_type, distance, TREE_SEED_MIN_DISTANCE_FROM_OTHER_SEEDS
                ));
            }
        }
        
        log::info!("PLANT_SEED: Tree seed {} passed all planting checks", item_def.name);
    }
    
    // === DETERMINE TARGET TREE TYPE FOR TREE SEEDS ===
    // For tree seeds (Pinecone, Birch Catkin), determine the exact tree type NOW based on biome
    // This is stored in the PlantedSeed so the client can render the correct sprite during growth
    let target_tree_type: Option<crate::tree::TreeType> = if is_tree_seed {
        use crate::tree::TreeType;
        
        let is_beach = crate::environment::is_position_on_beach_tile(ctx, plant_pos_x, plant_pos_y);
        let is_alpine = crate::environment::is_position_on_alpine_tile(ctx, plant_pos_x, plant_pos_y);
        let is_tundra = crate::environment::is_position_on_tundra_tile(ctx, plant_pos_x, plant_pos_y);
        
        let roll: u32 = ctx.rng().gen_range(0..100);
        
        let tree_type = if is_pinecone {
            // Conifers (Pinecone) - note: beach is blocked at planting time
            if is_alpine {
                // Alpine: DwarfPine and MountainHemlockSnow (adapted to high altitude)
                if roll < 65 {
                    TreeType::DwarfPine           // 65% - Stunted alpine tree
                } else {
                    TreeType::MountainHemlockSnow // 35% - Snow-covered hemlock
                }
            } else if is_tundra {
                // Tundra: KrummholzSpruce (twisted wind-sculpted) dominates
                if roll < 80 {
                    TreeType::KrummholzSpruce  // 80% - Twisted wind-sculpted spruce
                } else {
                    TreeType::DwarfPine        // 20% - Stunted dwarf pine
                }
            } else {
                // Temperate (grass/forest): Full-size conifers
                if roll < 50 {
                    TreeType::SitkaSpruce       // 50% - Classic tall spruce
                } else if roll < 80 {
                    TreeType::MountainHemlock2  // 30% - Common hemlock variant
                } else {
                    TreeType::MountainHemlock   // 20% - Less common hemlock
                }
            }
        } else {
            // Deciduous (Birch Catkin) - note: alpine is blocked at planting time
            if is_beach {
                // Beach: SitkaAlder variants (salt-tolerant)
                if roll < 55 {
                    TreeType::SitkaAlder   // 55% - Alder variant A
                } else {
                    TreeType::SitkaAlder2  // 45% - Alder variant B
                }
            } else if is_tundra {
                // Tundra: ArcticWillow (cold-hardy shrub-tree)
                TreeType::ArcticWillow  // 100% - Only deciduous that survives here
            } else {
                // Temperate (grass/forest): SiberianBirch
                TreeType::SiberianBirch  // 100% - Classic white bark birch
            }
        };
        
        log::info!("PLANT_SEED: Tree type {:?} determined for {} (beach={}, alpine={}, tundra={})", 
            tree_type, item_def.name, is_beach, is_alpine, is_tundra);
        Some(tree_type)
    } else {
        None // Non-tree plants don't have a target tree type
    };
    
    // Convert click position to tile coordinates and snap to tile center
    // All planted seeds snap to tile center for consistent one-per-tile behavior
    let (tile_x, tile_y) = crate::world_pos_to_tile_coords(plant_pos_x, plant_pos_y);
    let final_plant_x = (tile_x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
    let final_plant_y = (tile_y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
    
    log::info!("PLANT_SEED: Snapping to tile center at ({:.1}, {:.1}) for tile ({}, {})", 
              final_plant_x, final_plant_y, tile_x, tile_y);
    
    // Check if there's already a planted seed on this tile (one seed per tile)
    let existing_seed_on_tile = ctx.db.planted_seed().iter().any(|seed| {
        let (seed_tile_x, seed_tile_y) = crate::world_pos_to_tile_coords(seed.pos_x, seed.pos_y);
        seed_tile_x == tile_x && seed_tile_y == tile_y
    });
    
    if existing_seed_on_tile {
        log::error!("PLANT_SEED: There's already a seed planted on tile ({}, {})", tile_x, tile_y);
        return Err("There's already a seed planted on this tile".to_string());
    }
    
    // Calculate growth time (using centralized database values)
    let growth_time_secs = if min_growth_time_secs >= max_growth_time_secs {
        min_growth_time_secs
    } else {
        ctx.rng().gen_range(min_growth_time_secs..=max_growth_time_secs)
    };
    
    // Calculate initial growth multiplier based on current environmental conditions
    // This gives a better initial estimate for will_mature_at (will be refined by growth ticks)
    let initial_multiplier = calculate_initial_growth_multiplier(ctx, final_plant_x, final_plant_y, &plant_type);
    let adjusted_growth_secs = if initial_multiplier > 0.0 {
        (growth_time_secs as f32 / initial_multiplier) as u64
    } else {
        growth_time_secs * 10 // Very slow if no growth (night time, etc.)
    };
    
    let maturity_time = ctx.timestamp + TimeDuration::from(Duration::from_secs(adjusted_growth_secs));
    let chunk_index = calculate_chunk_index(final_plant_x, final_plant_y);
    
    log::info!("PLANT_SEED: Creating planted seed - growth time: {}s, chunk: {}", growth_time_secs, chunk_index);
    
    // Create the planted seed with initial maturity estimate
    // Note: will_mature_at will be dynamically updated based on environmental conditions
    let planted_seed = PlantedSeed {
        id: 0, // Auto-inc
        pos_x: final_plant_x,
        pos_y: final_plant_y,
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
        target_tree_type, // For tree saplings: the specific tree type this will become
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
    
    log::info!("PLANT_SEED: SUCCESS - Player {:?} planted {} at ({:.1}, {:.1}) on tile ({}, {}) - will mature in {} seconds", 
              player_id, item_def.name, final_plant_x, final_plant_y, tile_x, tile_y, growth_time_secs);
    
    // Track seeds_planted stat for farming achievements
    if let Err(e) = crate::player_progression::track_stat_and_check_achievements(ctx, player_id, "seeds_planted", 1) {
        log::warn!("Failed to track seed planting stat: {}", e);
    }
    
    // Track quest progress for planting
    if let Err(e) = crate::quests::track_quest_progress(
        ctx,
        player_id,
        crate::quests::QuestObjectiveType::PlantSeed,
        None,
        1,
    ) {
        log::warn!("Failed to track quest progress for seed planting: {}", e);
    }
    
    // Emit plant seed sound
    crate::sound_events::emit_plant_seed_sound(ctx, final_plant_x, final_plant_y, player_id);
    
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
    
    // PERFORMANCE: Skip if no planted seeds exist
    if ctx.db.planted_seed().iter().next().is_none() {
        return Ok(());
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
        
        // Check if plant dies from severe weather (underwater plants are immune - storms don't affect them)
        let is_underwater_plant_for_death_check = matches!(plant.plant_type, PlantType::SeaweedBed);
        if !is_underwater_plant_for_death_check && check_plant_death_from_weather(ctx, &chunk_weather.current_weather) {
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
        
        // Check if this is an underwater plant (SeaweedBed)
        // Underwater plants are NOT affected by surface conditions:
        // - No time of day effect (light is diffused and constant underwater)
        // - No weather effect (storms don't affect underwater growth)
        // - No cloud cover effect (irrelevant underwater)
        // - No light source effect (campfires/lanterns are on land)
        // - No shelter penalty (can't build shelters underwater)
        // - No water patch bonus (already in water)
        // - No fertilizer bonus (can't fertilize underwater)
        // Only crowding penalty still applies (plants compete for space)
        let is_underwater_plant = matches!(plant.plant_type, PlantType::SeaweedBed);
        
        // Define variables outside of the if/else for logging purposes
        // These will be set to 1.0 for underwater plants (no effect)
        let mut weather_multiplier = 1.0f32;
        let mut cloud_multiplier = 1.0f32;
        let mut light_multiplier = 1.0f32;
        let mut crowding_multiplier: f32;
        let mut shelter_multiplier = 1.0f32;
        let mut water_multiplier = 1.0f32;
        let mut fertilizer_multiplier = 1.0f32;
        let mut mushroom_bonus = 1.0f32;
        let mut soil_multiplier = 1.0f32;
        let mut beach_multiplier = 1.0f32;
        
        let total_growth_multiplier = if is_underwater_plant {
            // Underwater plants grow at a constant rate, only affected by crowding
            crowding_multiplier = get_crowding_penalty_multiplier(ctx, plant.pos_x, plant.pos_y, plant.id);
            1.0 * crowding_multiplier // Base 1.0x growth, only crowding penalty applies
        } else {
            // Normal surface plants - apply all environmental modifiers
            weather_multiplier = get_weather_growth_multiplier(&chunk_weather.current_weather, chunk_weather.rain_intensity);
            
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
            
            cloud_multiplier = if is_mushroom {
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
            light_multiplier = get_light_source_growth_multiplier(ctx, plant.pos_x, plant.pos_y);
            
            // Calculate crowding penalty for this specific plant
            crowding_multiplier = get_crowding_penalty_multiplier(ctx, plant.pos_x, plant.pos_y, plant.id);
            
            // Calculate shelter penalty for this specific plant
            shelter_multiplier = get_shelter_penalty_multiplier(ctx, plant.pos_x, plant.pos_y);
            
            // Calculate water patch bonus for this specific plant
            // Water-loving plants (nettle, cranberries, corn, reed, cabbage) get 50% more benefit
            let base_water_mult = crate::water_patch::get_water_patch_growth_multiplier(ctx, plant.pos_x, plant.pos_y);
            water_multiplier = get_water_loving_multiplier(&plant.plant_type, base_water_mult);
            
            // Calculate fertilizer bonus for this specific plant (checks for nearby patches)
            // Nitrogen-loving plants (nettle, corn, cabbage, pumpkin) get 75% more benefit
            let base_fertilizer_mult = get_fertilizer_growth_multiplier(ctx, &plant);
            fertilizer_multiplier = get_nitrogen_loving_multiplier(&plant.plant_type, base_fertilizer_mult);
            
            // Calculate mushroom-specific bonus (tree cover and night time only - cloud is handled above)
            // Also applies to berries (tree cover only) and shade-tolerant herbs (nettle, chicory)
            mushroom_bonus = get_mushroom_bonus_multiplier(ctx, plant.pos_x, plant.pos_y, &plant.plant_type, &current_time_of_day);
            
            // Calculate prepared soil bonus (Dirt or Tilled tiles get +50% growth)
            // Root crops (potato, carrot, beets, horseradish) get 60% more benefit from tilled soil
            let base_soil_mult = crate::tilled_tiles::get_soil_growth_multiplier(ctx, plant.pos_x, plant.pos_y);
            soil_multiplier = get_root_crop_soil_multiplier(&plant.plant_type, base_soil_mult);
            
            // Calculate beach tile penalty (non-beach plants struggle in sandy/saline soil)
            beach_multiplier = get_beach_tile_penalty_multiplier(ctx, plant.pos_x, plant.pos_y, &plant.plant_type);
            
            // Calculate green rune stone bonus (agrarian effect)
            let green_rune_multiplier = crate::rune_stone::get_green_rune_growth_multiplier(ctx, plant.pos_x, plant.pos_y, &plant.plant_type);
            
            // PvP-oriented: If green rune stone is active, stack ALL positive bonuses but ignore penalties
            // This guarantees good growth for farmers near green rune stones
            if green_rune_multiplier > 1.0 {
                // Green rune stone active - apply ALL positive bonuses, ignore penalties (cloud, crowding, shelter, night, beach)
                // Positive bonuses: rune stone, water, fertilizer, soil, mushroom, light (if beneficial)
                let positive_light = light_multiplier.max(1.0); // Only keep light bonus, not penalty
                green_rune_multiplier * water_multiplier * fertilizer_multiplier * mushroom_bonus * soil_multiplier * positive_light
            } else {
                // No green rune stone - apply all normal modifiers (including penalties)
                base_growth_multiplier * cloud_multiplier * light_multiplier * crowding_multiplier * shelter_multiplier * water_multiplier * fertilizer_multiplier * mushroom_bonus * soil_multiplier * beach_multiplier
            }
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
                log::debug!("Plant {} ({}) grew from {:.1}% to {:.1}% (time: {:.2}x, weather: {:.2}x, cloud: {:.2}x, light: {:.2}x, crowding: {:.2}x, shelter: {:.2}x, water: {:.2}x, fertilizer: {:.2}x, mushroom: {:.2}x, soil: {:.2}x, beach: {:.2}x, total: {:.2}x) [chunk weather: {:?}]", 
                           plant_id, plant_type, old_progress * 100.0, progress_pct, 
                           base_time_multiplier, weather_multiplier, cloud_multiplier, light_multiplier, crowding_multiplier, shelter_multiplier, water_multiplier, fertilizer_multiplier, mushroom_bonus, soil_multiplier, beach_multiplier, total_growth_multiplier, chunk_weather.current_weather);
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

/// Converts a planted seed into its corresponding entity (tree or harvestable resource)
fn grow_plant_to_resource(ctx: &ReducerContext, plant: &PlantedSeed) -> Result<(), String> {
    // Plant type is now stored directly in the planted seed (from centralized database)
    let plant_type = plant.plant_type;
    
    // Check if this is a tree sapling (becomes a Tree entity, not HarvestableResource)
    let is_tree_sapling = matches!(
        plant_type,
        PlantType::ConiferSapling | PlantType::DeciduousSapling
    );
    
    if is_tree_sapling {
        // Tree saplings grow into actual Tree entities
        return grow_tree_sapling_to_tree(ctx, plant);
    }
    
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

/// Grows a tree sapling into an actual Tree entity
/// Player-planted trees:
/// - Don't respawn when chopped (deleted permanently)
/// - Yield 60% of normal wood
/// Tree type was determined at planting time and stored in target_tree_type
fn grow_tree_sapling_to_tree(ctx: &ReducerContext, plant: &PlantedSeed) -> Result<(), String> {
    use crate::tree::{Tree, PLAYER_PLANTED_RESOURCES_MIN, PLAYER_PLANTED_RESOURCES_MAX, TREE_INITIAL_HEALTH};
    use rand::Rng;
    
    // Use the tree type that was determined at planting time
    let tree_type = plant.target_tree_type.clone().ok_or_else(|| {
        log::error!("grow_tree_sapling_to_tree called but target_tree_type is None for plant {:?}", plant.plant_type);
        format!("Tree sapling has no target_tree_type set: {:?}", plant.plant_type)
    })?;
    
    log::info!(
        "🌱 Tree sapling maturing into {:?} at ({:.1}, {:.1})", 
        tree_type, plant.pos_x, plant.pos_y
    );
    
    // Calculate reduced resources for player-planted trees (60% of normal)
    let resource_amount = ctx.rng().gen_range(PLAYER_PLANTED_RESOURCES_MIN..=PLAYER_PLANTED_RESOURCES_MAX);
    
    // Create the tree entity
    let new_tree = Tree {
        id: 0, // Auto-inc
        pos_x: plant.pos_x,
        pos_y: plant.pos_y,
        health: TREE_INITIAL_HEALTH,
        resource_remaining: resource_amount,
        tree_type: tree_type.clone(),
        chunk_index: plant.chunk_index,
        last_hit_time: None,
        respawn_at: spacetimedb::Timestamp::UNIX_EPOCH, // Not respawning (active tree)
        is_player_planted: true, // Mark as player-planted for reduced yield and no respawn
    };
    
    match ctx.db.tree().try_insert(new_tree) {
        Ok(inserted_tree) => {
            log::info!(
                "🌳 Tree sapling matured! {:?} from {} at ({:.1}, {:.1}), Tree ID: {}, Resources: {}",
                tree_type, plant.seed_type, plant.pos_x, plant.pos_y, inserted_tree.id, resource_amount
            );
            
            // Emit a special sound for tree maturation (like a rustle)
            crate::sound_events::emit_tree_creaking_sound(ctx, plant.pos_x, plant.pos_y, plant.planted_by);
            
            Ok(())
        }
        Err(e) => {
            log::error!(
                "Failed to create tree from {:?} sapling at ({:.1}, {:.1}): {}",
                tree_type, plant.pos_x, plant.pos_y, e
            );
            Err(format!("Failed to create tree: {}", e))
        }
    }
} 