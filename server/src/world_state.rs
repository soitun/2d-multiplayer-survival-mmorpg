use spacetimedb::{ReducerContext, Table, Timestamp, TimeDuration, ScheduleAt};
use log;
use std::f32::consts::PI;
use rand::Rng;
use crate::campfire::Campfire;
use crate::campfire::campfire as CampfireTableTrait;
use crate::campfire::campfire_processing_schedule as CampfireProcessingScheduleTableTrait;
use crate::items::inventory_item as InventoryItemTableTrait;
use crate::items::InventoryItem;
use crate::shelter::shelter as ShelterTableTrait;
use crate::tree::tree as TreeTableTrait;
use crate::rain_collector::rain_collector as RainCollectorTableTrait; // ADDED: For rain collector water collection
use crate::player; // ADDED: Import player module for chunk weather system
use crate::world_state::world_state as WorldStateTableTrait;
use crate::world_state::thunder_event as ThunderEventTableTrait;
use crate::world_state::thunder_event_cleanup_schedule as ThunderEventCleanupScheduleTableTrait;
use crate::world_state::seasonal_plant_management_schedule as SeasonalPlantManagementScheduleTableTrait;
use crate::world_state::chunk_weather as ChunkWeatherTableTrait;
use crate::harvestable_resource::harvestable_resource as HarvestableResourceTableTrait;
use crate::sound_events;
use crate::environment::{calculate_chunk_index, WORLD_WIDTH_CHUNKS, WORLD_HEIGHT_CHUNKS};

// Define fuel consumption rate (items per second)
const FUEL_ITEM_CONSUME_PER_SECOND: f32 = 0.2; // e.g., 1 wood every 5 seconds

// --- Constants ---
// Balanced cycle for survival game with meaningful night threat
// 30-minute total cycle: 20 min day + 10 min night
// Night has 3 phases: Early tension (Dusk), Peak pressure (Night), Desperate hour (Midnight)
// Players get 2 full cycles per hour-long session
const DAY_DURATION_SECONDS: f32 = 1200.0; // 20 minutes  
const NIGHT_DURATION_SECONDS: f32 = 600.0;  // 10 minutes (doubled for meaningful night arc)
const FULL_CYCLE_DURATION_SECONDS: f32 = DAY_DURATION_SECONDS + NIGHT_DURATION_SECONDS; // 30 minutes total

// Season duration constants for plant respawn calculations
// 240 in-game days per season × 30 min per day = 120 real hours = 5 real days per season
pub const DAYS_PER_SEASON: u32 = 240;
pub const SEASON_DURATION_HOURS: f32 = 240.0 * 24.0; // 240 days per season * 24 hours per day = 5760 hours

// Full moon occurs roughly every 3 cycles (adjust as needed)
const FULL_MOON_CYCLE_INTERVAL: u32 = 3;

// Update interval for the tick reducer (e.g., every 5 seconds)
// const TICK_INTERVAL_SECONDS: u64 = 5; // We are currently ticking on player move

// Base warmth drain rate per second
pub(crate) const BASE_WARMTH_DRAIN_PER_SECOND: f32 = 0.5; 
// Multipliers for warmth drain based on time of day
pub(crate) const WARMTH_DRAIN_MULTIPLIER_NIGHT: f32 = 2.0;
pub(crate) const WARMTH_DRAIN_MULTIPLIER_MIDNIGHT: f32 = 3.0;
pub(crate) const WARMTH_DRAIN_MULTIPLIER_DAWN_DUSK: f32 = 1.5;

// Rain warmth drain modifiers (balanced for fair gameplay)
// Daytime should remain safe even with heavy rain, nighttime should be challenging but manageable
pub(crate) const WARMTH_DRAIN_RAIN_LIGHT: f32 = 0.2;      // Light rain: -0.2/sec
pub(crate) const WARMTH_DRAIN_RAIN_MODERATE: f32 = 0.4;   // Moderate rain: -0.4/sec
pub(crate) const WARMTH_DRAIN_RAIN_HEAVY: f32 = 0.7;      // Heavy rain: -0.7/sec (daytime +1.0 - 0.7 = +0.3/sec safe)
pub(crate) const WARMTH_DRAIN_RAIN_STORM: f32 = 1.0;      // Heavy storm: -1.0/sec (daytime +1.0 - 1.0 = 0.0/sec stable)

// --- Weather Constants ---
// Aleutian islands are rainy but not constantly stormy - aim for ~25% rain coverage at any time
const MIN_RAIN_DURATION_SECONDS: f32 = 180.0; // 3 minutes (reduced from 5 - shorter rain events)
const MAX_RAIN_DURATION_SECONDS: f32 = 480.0; // 8 minutes (reduced from 15 - much shorter max duration)
const RAIN_PROBABILITY_BASE: f32 = 0.005; // Per-second probability - increased for more frequent rain starts
const RAIN_PROBABILITY_SEASONAL_MODIFIER: f32 = 0.10; // Additional variability (reduced from 0.15)
const MIN_TIME_BETWEEN_RAIN_CYCLES: f32 = 600.0; // 10 minutes minimum between rain events (reduced to allow more frequent rain)

// === EMERGENT WEATHER SYSTEM CONSTANTS ===
// Complex adaptive system approach: simple local rules create large-scale coherent weather fronts
// Key principles:
// - Neighbor consensus: chunks conform to their neighborhood majority
// - Interior stability: chunks surrounded by same weather are rock-stable
// - Edge-only evolution: only boundary chunks between weather types can change
// - Inertia: established weather resists change
// - Symmetry: Clear weather is a first-class type, forms large fronts just like rain

const CHUNKS_PER_UPDATE: usize = 40; // Process more chunks per tick for responsive weather evolution

// --- Neighbor Consensus Parameters ---
// Chunks conform to the dominant weather type in their neighborhood
const CONSENSUS_THRESHOLD: f32 = 0.5; // Need 50%+ of neighbors to agree before changing (4+ of 8 neighbors)
const CONSENSUS_CONFORM_BASE_CHANCE: f32 = 0.25; // 25% base chance - faster edge evolution!

// --- Interior Stability Parameters ---
// Chunks deep inside a weather front are stable but CAN change
const INTERIOR_NEIGHBOR_THRESHOLD: u32 = 6; // 6+ same-weather neighbors = interior chunk
const INTERIOR_CHANGE_CHANCE: f32 = 0.02; // 2% chance per update - allows gradual front drift

// --- Weather Inertia (Momentum) ---
// Weather that has persisted longer is harder to displace
const WEATHER_INERTIA_SCALE_SECONDS: f32 = 180.0; // 3 minutes to reach max stability (was 5)
const WEATHER_INERTIA_MAX: f32 = 0.3; // Only 30% max resistance (was 50%) - more dynamic!

// --- Nucleation Parameters ---
// New weather can spontaneously appear - this is how new fronts are born
// INCREASED: Weather should be dynamic, not frozen!
const SPONTANEOUS_RAIN_CHANCE: f32 = 0.015; // 1.5% per update - new rain fronts spawn frequently
const SPONTANEOUS_CLEAR_CHANCE: f32 = 0.012; // 1.2% per update - clearing also happens
const NUCLEATION_ISOLATION_THRESHOLD: u32 = 4; // Up to 4 neighbors - more nucleation opportunities

// --- Weather Type Transition Rules ---
// When weather changes, it transitions gradually (storms weaken before clearing)
// This creates smooth boundaries between weather types
const GRADUAL_TRANSITION_CHANCE: f32 = 0.7; // 70% chance to transition gradually vs jump to neighbor weather

// --- Active Propagation (supplements consensus system) ---
// Propagation helps fronts move faster by actively spreading weather to neighbors
// With consensus as the primary mechanism, propagation is now symmetric
const WEATHER_PROPAGATION_DISTANCE: u32 = 2; // Spread to chunks up to 2 away
const BASE_PROPAGATION_CHANCE: f32 = 0.08; // 8% base chance per update (same for all weather types - symmetric!)

// --- Legacy Constants (kept for compatibility with duration/timing logic) ---
const WEATHER_FRONT_MIN_DURATION_MINUTES: f32 = 3.0; // Minimum time before weather can change
const WEATHER_FRONT_MAX_DURATION_MINUTES: f32 = 20.0; // After this, weather becomes more susceptible to change

// --- Seasonal Weather Modifiers ---
// These modify base weather constants based on current season (Aleutian Islands climate)
// Spring: Mild, frequent light showers, moderate overall
// Summer: Drier, shorter rain events, less intense
// Autumn: Wettest season, long storms, frequent heavy rain
// Winter: Cold storms, moderate frequency but intense and long-lasting

/// Seasonal weather configuration
#[derive(Clone, Debug)]
pub struct SeasonalWeatherConfig {
    /// Multiplier for base rain probability (1.0 = normal)
    pub rain_probability_multiplier: f32,
    /// Multiplier for rain duration (1.0 = normal)
    pub duration_multiplier: f32,
    /// Multiplier for weather propagation speed (1.0 = normal)
    pub propagation_multiplier: f32,
    /// Probability distribution for rain types [light, moderate, heavy, storm]
    /// Must sum to 1.0
    pub rain_type_distribution: [f32; 4],
    /// Multiplier for weather decay rate (higher = faster clearing)
    pub decay_multiplier: f32,
    /// Minimum time between rain cycles multiplier
    pub rain_cooldown_multiplier: f32,
}

impl SeasonalWeatherConfig {
    /// Get weather configuration for a specific season
    pub fn for_season(season: &Season) -> Self {
        match season {
            Season::Spring => Self {
                // Spring: Mix of light showers and occasional storms
                rain_probability_multiplier: 1.2,      // 20% more likely to rain
                duration_multiplier: 0.9,              // Slightly shorter events
                propagation_multiplier: 1.0,           // Normal spread
                rain_type_distribution: [0.40, 0.30, 0.20, 0.10], // 10% storms (was 3%)
                decay_multiplier: 1.1,                 // Slightly faster clearing
                rain_cooldown_multiplier: 0.8,         // Less time between showers
            },
            Season::Summer => Self {
                // Summer: Driest, but when it rains it can storm HARD
                rain_probability_multiplier: 0.5,      // 50% less likely to rain
                duration_multiplier: 0.7,              // Much shorter events
                propagation_multiplier: 0.8,           // Slower spread (isolated storms)
                rain_type_distribution: [0.25, 0.30, 0.30, 0.15], // 15% storms - summer thunderstorms!
                decay_multiplier: 1.5,                 // Faster clearing (hot sun)
                rain_cooldown_multiplier: 1.5,         // More time between rain
            },
            Season::Autumn => Self {
                // Autumn: Wettest season, frequent heavy storms
                rain_probability_multiplier: 1.8,      // 80% more likely to rain
                duration_multiplier: 1.5,              // Much longer events
                propagation_multiplier: 1.3,           // Faster spread (large fronts)
                rain_type_distribution: [0.15, 0.25, 0.35, 0.25], // 25% storms - autumn gales!
                decay_multiplier: 0.6,                 // Slower clearing (persistent)
                rain_cooldown_multiplier: 0.5,         // Little break between storms
            },
            Season::Winter => Self {
                // Winter: Cold INTENSE storms, dramatic weather
                rain_probability_multiplier: 1.3,      // 30% more likely
                duration_multiplier: 1.8,              // Very long-lasting storms
                propagation_multiplier: 1.2,           // Good spread
                rain_type_distribution: [0.10, 0.20, 0.40, 0.30], // 30% storms - winter gales!
                decay_multiplier: 0.4,                 // Very slow clearing (cold)
                rain_cooldown_multiplier: 0.7,         // Moderate breaks
            },
        }
    }
    
    /// Select a rain type based on the seasonal distribution
    pub fn select_rain_type(&self, roll: f32) -> WeatherType {
        let [light, moderate, heavy, _storm] = self.rain_type_distribution;
        
        if roll < light {
            WeatherType::LightRain
        } else if roll < light + moderate {
            WeatherType::ModerateRain
        } else if roll < light + moderate + heavy {
            WeatherType::HeavyRain
        } else {
            WeatherType::HeavyStorm
        }
    }
}

/// Reseeds weather for a new season - clears existing chunk weather and creates new fronts
/// Called both during natural season transitions and debug season changes
fn reseed_weather_for_season(ctx: &ReducerContext, new_season: &Season) -> Result<(u32, u32), String> {
    let now = ctx.timestamp;
    let mut rng = ctx.rng();
    
    // Clear all existing chunk weather
    let chunk_weather_table = ctx.db.chunk_weather();
    let all_chunk_indices: Vec<u32> = chunk_weather_table.iter()
        .map(|cw| cw.chunk_index)
        .collect();
    
    let cleared_count = all_chunk_indices.len() as u32;
    for chunk_index in all_chunk_indices {
        chunk_weather_table.chunk_index().delete(chunk_index);
    }
    
    // Get seasonal configuration
    let seasonal_config = SeasonalWeatherConfig::for_season(new_season);
    
    // Scale number of fronts based on map size AND season
    let total_tiles = crate::WORLD_WIDTH_PX * crate::WORLD_HEIGHT_PX;
    let base_fronts = ((total_tiles as f32 / (400.0 * 400.0)).sqrt().ceil() as u32).max(1).min(6);
    let seasonal_front_modifier = seasonal_config.rain_probability_multiplier;
    let num_fronts = ((base_fronts as f32 * seasonal_front_modifier).round() as u32).max(1).min(8);
    
    let mut rainy_chunks_count = 0u32;
    
    for _front_idx in 0..num_fronts {
        // Pick a random center point for this weather front
        let center_x = rng.gen_range(0..WORLD_WIDTH_CHUNKS);
        let center_y = rng.gen_range(0..WORLD_HEIGHT_CHUNKS);
        
        // Use SEASONAL rain type distribution
        let rain_type = seasonal_config.select_rain_type(rng.gen::<f32>());
        
        // Create a larger cluster of rainy chunks around the center
        // Needs to be big enough to have "interior" chunks that survive consensus
        let front_radius = 3; // 7x7 area
        
        for dy in -(front_radius as i32)..=(front_radius as i32) {
            for dx in -(front_radius as i32)..=(front_radius as i32) {
                let chunk_x = (center_x as i32 + dx).max(0).min(WORLD_WIDTH_CHUNKS as i32 - 1) as u32;
                let chunk_y = (center_y as i32 + dy).max(0).min(WORLD_HEIGHT_CHUNKS as i32 - 1) as u32;
                let chunk_index = chunk_y * WORLD_WIDTH_CHUNKS + chunk_x;
                
                // Most chunks in the radius get rain - only edges are uncertain
                let distance_from_center = ((dx * dx + dy * dy) as f32).sqrt();
                let rain_chance = 1.0 - (distance_from_center / (front_radius as f32 + 1.0)) * 0.4; // Gentler falloff
                
                if rng.gen::<f32>() < rain_chance {
                    let chunk_weather = ChunkWeather {
                        chunk_index,
                        current_weather: rain_type.clone(),
                        rain_intensity: match rain_type {
                            WeatherType::LightRain => rng.gen_range(0.2..=0.4),
                            WeatherType::ModerateRain => rng.gen_range(0.5..=0.7),
                            WeatherType::HeavyRain => rng.gen_range(0.8..=1.0),
                            WeatherType::HeavyStorm => 1.0,
                            _ => 0.0,
                        },
                        weather_start_time: Some(now),
                        weather_duration: Some(
                            rng.gen_range(MIN_RAIN_DURATION_SECONDS..=MAX_RAIN_DURATION_SECONDS) 
                            * seasonal_config.duration_multiplier
                        ),
                        last_rain_end_time: None,
                        last_thunder_time: None,
                        next_thunder_time: None,
                        last_update: now,
                    };
                    
                    match ctx.db.chunk_weather().try_insert(chunk_weather) {
                        Ok(_) => rainy_chunks_count += 1,
                        Err(_) => {} // Chunk already exists, skip
                    }
                }
            }
        }
    }
    
    Ok((cleared_count, rainy_chunks_count))
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, spacetimedb::SpacetimeType)]
pub enum WeatherType {
    Clear,
    LightRain,
    ModerateRain,
    HeavyRain,
    HeavyStorm, // Intense rain with thunder and lightning
}

#[derive(Clone, Debug, PartialEq, spacetimedb::SpacetimeType)]
pub enum Season {
    Spring,  // Days 1-240 (~5 real days)
    Summer,  // Days 241-480 (~5 real days)
    Autumn,  // Days 481-720 (~5 real days)
    Winter,  // Days 721-960 (~5 real days)
}

#[derive(Clone, Debug, PartialEq, spacetimedb::SpacetimeType)]
pub enum TimeOfDay {
    TwilightMorning, // Purple hue BEFORE dawn (pre-dawn twilight) - 0.97-1.0 (wraps around)
    Dawn,    // Transition from night to day - 0.0-0.05
    Morning, // Early day - 0.05-0.35
    Noon,    // Midday, brightest - 0.35-0.55
    Afternoon, // Late day - 0.55-0.72
    Dusk,    // Transition from day to night - 0.72-0.76
    TwilightEvening, // Purple hue after dusk - 0.76-0.80
    Night,   // Darkest part - 0.80-0.92
    Midnight, // Middle of the night - 0.92-0.97 (comes before TwilightMorning)
}

#[spacetimedb::table(name = thunder_event, public)]
#[derive(Clone, Debug)]
pub struct ThunderEvent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub chunk_index: u32, // Which chunk this thunder occurred in
    pub timestamp: Timestamp,
    pub intensity: f32, // 0.5 to 1.0 for flash intensity
}

/// Schedule table for cleaning up old thunder events
#[spacetimedb::table(name = thunder_event_cleanup_schedule, scheduled(cleanup_old_thunder_events))]
#[derive(Clone, Debug)]
pub struct ThunderEventCleanupSchedule {
    #[primary_key]
    #[auto_inc]
    pub schedule_id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Clean up thunder events older than 3 seconds to prevent table bloat and infinite repeats
#[spacetimedb::reducer]
pub fn cleanup_old_thunder_events(ctx: &ReducerContext, _args: ThunderEventCleanupSchedule) -> Result<(), String> {
    // Security check - only allow scheduler to run this
    if ctx.sender != ctx.identity() {
        return Err("Thunder event cleanup can only be run by scheduler".to_string());
    }

    let thunder_events_table = ctx.db.thunder_event();
    
    // PERFORMANCE: Early exit if no thunder events exist
    if thunder_events_table.iter().next().is_none() {
        return Ok(());
    }

    let cutoff_time = ctx.timestamp - TimeDuration::from_micros(3_000_000); // 3 seconds ago
    let old_events: Vec<u64> = thunder_events_table.iter()
        .filter(|event| event.timestamp < cutoff_time)
        .map(|event| event.id)
        .collect();

    let removed_count = old_events.len();
    for event_id in old_events {
        thunder_events_table.id().delete(event_id);
    }

    if removed_count > 0 {
        log::info!("🗑️ Cleaned up {} old thunder events", removed_count);
    }

    Ok(())
}

/// Manual cleanup reducer that can be called by clients to clear all thunder events
/// This is a temporary fix until the scheduled cleanup is working properly
#[spacetimedb::reducer]
pub fn manual_cleanup_thunder_events(ctx: &ReducerContext) -> Result<(), String> {
    let thunder_events_table = ctx.db.thunder_event();
    let all_events: Vec<u64> = thunder_events_table.iter().map(|event| event.id).collect();
    let cleanup_count = all_events.len();
    
    for event_id in all_events {
        thunder_events_table.id().delete(event_id);
    }
    
    log::info!("🗑️ Manual cleanup: Removed {} thunder events", cleanup_count);
    Ok(())
}

#[spacetimedb::table(name = world_state, public)]
#[derive(Clone)]
pub struct WorldState {
    #[primary_key]
    #[auto_inc]
    pub id: u32, // Now a regular primary key
    pub cycle_progress: f32, // 0.0 to 1.0 representing position in the full day/night cycle
    pub time_of_day: TimeOfDay,
    pub cycle_count: u32, // How many full cycles have passed
    pub is_full_moon: bool, // Flag for special night lighting
    pub last_tick: Timestamp,
    // Season tracking
    pub current_season: Season,
    pub day_of_year: u32, // 1-960 in our perfect calendar (4 seasons × 240 days)
    pub year: u32, // Which year we're in
    // Weather fields
    pub current_weather: WeatherType,
    pub rain_intensity: f32, // 0.0 to 1.0, for client-side rendering intensity
    pub weather_start_time: Option<Timestamp>, // When current weather started
    pub weather_duration: Option<f32>, // How long current weather should last (seconds)
    pub last_rain_end_time: Option<Timestamp>, // When rain last ended (for spacing)
    // Thunder/Lightning fields
    pub last_thunder_time: Option<Timestamp>, // When thunder last occurred
    pub next_thunder_time: Option<Timestamp>, // When next thunder should occur
}

#[spacetimedb::table(name = seasonal_plant_management_schedule, scheduled(manage_seasonal_plants))]
#[derive(Clone, Debug)]
pub struct SeasonalPlantManagementSchedule {
    #[primary_key]
    #[auto_inc]
    pub schedule_id: u64,
    pub scheduled_at: spacetimedb::ScheduleAt,
    pub transition_season: Season, // The season we're transitioning to
    pub transition_progress: f32,  // 0.0 to 1.0 - how far through the transition we are
    pub spawn_batch_size: u32,     // How many plants to spawn per batch
}

// --- Chunk-Based Weather System ---
#[spacetimedb::table(name = chunk_weather, public)]
#[derive(Clone, Debug)]
pub struct ChunkWeather {
    #[primary_key]
    pub chunk_index: u32, // Chunk index (row-major ordering)
    pub current_weather: WeatherType,
    pub rain_intensity: f32, // 0.0 to 1.0, for client-side rendering intensity
    pub weather_start_time: Option<Timestamp>, // When current weather started
    pub weather_duration: Option<f32>, // How long current weather should last (seconds)
    pub last_rain_end_time: Option<Timestamp>, // When rain last ended (for spacing)
    // Thunder/Lightning fields (per chunk)
    pub last_thunder_time: Option<Timestamp>, // When thunder last occurred
    pub next_thunder_time: Option<Timestamp>, // When next thunder should occur
    pub last_update: Timestamp, // Last time this chunk's weather was updated
}

// Reducer to initialize the world state if it doesn't exist
#[spacetimedb::reducer]
pub fn seed_world_state(ctx: &ReducerContext) -> Result<(), String> {
    let world_states = ctx.db.world_state();
    if world_states.iter().count() == 0 {
        log::info!("Seeding initial WorldState.");
        world_states.try_insert(WorldState {
            id: 0, // Autoinc takes care of this, but good practice
            cycle_progress: 0.25, // Start at morning
            time_of_day: TimeOfDay::Morning,
            cycle_count: 0,
            is_full_moon: false,
            last_tick: ctx.timestamp,
            current_season: Season::Spring,
            day_of_year: 1,
            year: 1,
            current_weather: WeatherType::Clear,
            rain_intensity: 0.0,
            weather_start_time: None,
            weather_duration: None,
            last_rain_end_time: None,
            last_thunder_time: None,
            next_thunder_time: None,
        })?;
        
        // Initialize thunder event cleanup system (runs every 5 seconds)
        let cleanup_interval = TimeDuration::from_micros(5_000_000); // 5 seconds
        let cleanup_schedule = ThunderEventCleanupSchedule {
            schedule_id: 0,
            scheduled_at: ScheduleAt::Interval(cleanup_interval), // Periodic cleanup
        };
        match ctx.db.thunder_event_cleanup_schedule().try_insert(cleanup_schedule) {
            Ok(_) => log::info!("⚡ Thunder event cleanup system initialized"),
            Err(e) => log::error!("Failed to initialize thunder cleanup system: {:?}", e),
        }
        
    } else {
        log::debug!("WorldState already seeded.");
    }
    
    // IMMEDIATE CLEANUP: Clear any existing thunder events on startup (runs every time, not just first seed)
    // This fixes the issue of accumulated events from before the cleanup system existed
    let thunder_events_table = ctx.db.thunder_event();
    let all_events: Vec<u64> = thunder_events_table.iter().map(|event| event.id).collect();
    let cleanup_count = all_events.len();
    for event_id in all_events {
        thunder_events_table.id().delete(event_id);
    }
    if cleanup_count > 0 {
        log::info!("🗑️ Cleaned up {} accumulated thunder events on startup", cleanup_count);
    }
    
    Ok(())
}

// --- Chunk Weather Helper Functions ---

/// Gets or creates weather data for a specific chunk
fn get_or_create_chunk_weather(ctx: &ReducerContext, chunk_index: u32) -> ChunkWeather {
    let chunk_weather_table = ctx.db.chunk_weather();
    
    if let Some(weather) = chunk_weather_table.chunk_index().find(&chunk_index) {
        return weather.clone();
    }
    
    // Create new chunk weather with default Clear weather
    let new_weather = ChunkWeather {
        chunk_index,
        current_weather: WeatherType::Clear,
        rain_intensity: 0.0,
        weather_start_time: None,
        weather_duration: None,
        last_rain_end_time: None,
        last_thunder_time: None,
        next_thunder_time: None,
        last_update: ctx.timestamp,
    };
    
    match chunk_weather_table.try_insert(new_weather.clone()) {
        Ok(_) => new_weather,
        Err(_) => {
            // If insert failed, try to get it again (race condition)
            chunk_weather_table.chunk_index().find(&chunk_index)
                .map(|w| w.clone())
                .unwrap_or(new_weather)
        }
    }
}

/// Counts how many neighboring chunks have similar weather (for front detection)
/// Returns count of immediate neighbors (distance 1) with same or stronger weather
fn count_weather_neighbors(ctx: &ReducerContext, chunk_index: u32, weather_type: &WeatherType) -> u32 {
    let chunk_x = (chunk_index % WORLD_WIDTH_CHUNKS) as i32;
    let chunk_y = (chunk_index / WORLD_WIDTH_CHUNKS) as i32;
    let chunk_weather_table = ctx.db.chunk_weather();
    
    let mut neighbor_count = 0;
    
    // Check 8 immediate neighbors (including diagonals)
    for dy in -1..=1 {
        for dx in -1..=1 {
            if dx == 0 && dy == 0 {
                continue; // Skip self
            }
            
            let check_x = chunk_x + dx;
            let check_y = chunk_y + dy;
            
            // Bounds check
            if check_x >= 0 && check_x < WORLD_WIDTH_CHUNKS as i32 &&
               check_y >= 0 && check_y < WORLD_HEIGHT_CHUNKS as i32 {
                let nearby_index = (check_y as u32) * WORLD_WIDTH_CHUNKS + (check_x as u32);
                
                if let Some(nearby_weather) = chunk_weather_table.chunk_index().find(&nearby_index) {
                    // Count if neighbor has same or stronger weather
                    let is_similar = match (weather_type, &nearby_weather.current_weather) {
                        (WeatherType::HeavyStorm, WeatherType::HeavyStorm) => true,
                        (WeatherType::HeavyStorm, WeatherType::HeavyRain) => true,
                        (WeatherType::HeavyRain, WeatherType::HeavyStorm | WeatherType::HeavyRain) => true,
                        (WeatherType::ModerateRain, WeatherType::HeavyStorm | WeatherType::HeavyRain | WeatherType::ModerateRain) => true,
                        (WeatherType::LightRain, WeatherType::HeavyStorm | WeatherType::HeavyRain | WeatherType::ModerateRain | WeatherType::LightRain) => true,
                        _ => false,
                    };
                    
                    if is_similar {
                        neighbor_count += 1;
                    }
                }
            }
        }
    }
    
    neighbor_count
}

// === EMERGENT WEATHER SYSTEM HELPER FUNCTIONS ===

/// Gets all 8 immediate neighbor chunk indices (or fewer at map edges)
fn get_immediate_neighbors(chunk_index: u32) -> Vec<u32> {
    let chunk_x = (chunk_index % WORLD_WIDTH_CHUNKS) as i32;
    let chunk_y = (chunk_index / WORLD_WIDTH_CHUNKS) as i32;
    let mut neighbors = Vec::with_capacity(8);
    
    for dy in -1..=1 {
        for dx in -1..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }
            let check_x = chunk_x + dx;
            let check_y = chunk_y + dy;
            if check_x >= 0 && check_x < WORLD_WIDTH_CHUNKS as i32 &&
               check_y >= 0 && check_y < WORLD_HEIGHT_CHUNKS as i32 {
                let neighbor_index = (check_y as u32) * WORLD_WIDTH_CHUNKS + (check_x as u32);
                neighbors.push(neighbor_index);
            }
        }
    }
    neighbors
}

/// Counts neighbors by weather type - returns a map of weather type to count
/// Also returns total neighbor count (may be <8 at map edges)
fn count_neighbors_by_weather_type(ctx: &ReducerContext, chunk_index: u32) -> (std::collections::HashMap<WeatherType, u32>, u32) {
    use std::collections::HashMap;
    let neighbors = get_immediate_neighbors(chunk_index);
    let total = neighbors.len() as u32;
    let mut counts: HashMap<WeatherType, u32> = HashMap::new();
    
    let chunk_weather_table = ctx.db.chunk_weather();
    
    for neighbor_idx in neighbors {
        let weather = if let Some(nw) = chunk_weather_table.chunk_index().find(&neighbor_idx) {
            nw.current_weather.clone()
        } else {
            WeatherType::Clear // Uninitialized chunks default to Clear
        };
        *counts.entry(weather).or_insert(0) += 1;
    }
    
    (counts, total)
}

/// Groups weather types into "rainy" vs "clear" for consensus calculation
/// Returns (clear_count, rainy_count, total)
fn count_neighbors_rainy_vs_clear(ctx: &ReducerContext, chunk_index: u32) -> (u32, u32, u32) {
    let (counts, total) = count_neighbors_by_weather_type(ctx, chunk_index);
    
    let clear_count = *counts.get(&WeatherType::Clear).unwrap_or(&0);
    let rainy_count = total - clear_count; // Everything else is some form of rain
    
    (clear_count, rainy_count, total)
}

/// Gets the dominant neighbor weather type and consensus strength
/// Returns (dominant_weather, consensus_strength) where consensus is 0.0 to 1.0
fn get_neighbor_consensus(ctx: &ReducerContext, chunk_index: u32) -> (WeatherType, f32) {
    let (counts, total) = count_neighbors_by_weather_type(ctx, chunk_index);
    
    if total == 0 {
        return (WeatherType::Clear, 0.0);
    }
    
    // Find the weather type with most neighbors
    let (dominant, count) = counts.into_iter()
        .max_by_key(|(_, c)| *c)
        .unwrap_or((WeatherType::Clear, 0));
    
    let consensus = count as f32 / total as f32;
    (dominant, consensus)
}

/// Checks if a chunk is "interior" - surrounded by same weather type
/// Interior chunks are extremely stable and resist change
fn is_interior_chunk(ctx: &ReducerContext, chunk_index: u32, current_weather: &WeatherType) -> bool {
    let (counts, _total) = count_neighbors_by_weather_type(ctx, chunk_index);
    let same_weather_count = *counts.get(current_weather).unwrap_or(&0);
    same_weather_count >= INTERIOR_NEIGHBOR_THRESHOLD
}

/// Calculates weather inertia (stability from persistence)
/// Weather that has lasted longer is harder to change
/// Returns 0.0 to WEATHER_INERTIA_MAX
fn get_weather_inertia(chunk_weather: &ChunkWeather, now: spacetimedb::Timestamp) -> f32 {
    if let Some(start) = chunk_weather.weather_start_time {
        let duration_secs = (now.to_micros_since_unix_epoch() - start.to_micros_since_unix_epoch()) as f32 / 1_000_000.0;
        let normalized = (duration_secs / WEATHER_INERTIA_SCALE_SECONDS).min(1.0);
        normalized * WEATHER_INERTIA_MAX
    } else {
        0.0
    }
}

/// Checks if a chunk can nucleate new weather (spontaneous change in isolated area)
/// Nucleation only happens when the chunk is relatively isolated from similar weather
fn can_nucleate_weather(ctx: &ReducerContext, chunk_index: u32, target_weather_is_rainy: bool) -> bool {
    let (clear_count, rainy_count, _total) = count_neighbors_rainy_vs_clear(ctx, chunk_index);
    
    if target_weather_is_rainy {
        // Want to nucleate rain: must have very few rainy neighbors
        rainy_count <= NUCLEATION_ISOLATION_THRESHOLD
    } else {
        // Want to nucleate clear: must have very few clear neighbors  
        clear_count <= NUCLEATION_ISOLATION_THRESHOLD
    }
}

/// Determines what weather a chunk should transition to based on neighbor consensus
/// Returns Some(new_weather) if chunk should change, None if it should stay
fn should_conform_to_neighbors(
    ctx: &ReducerContext,
    chunk_index: u32,
    current_weather: &WeatherType,
    inertia: f32,
    rng: &mut impl Rng,
) -> Option<WeatherType> {
    let (dominant_neighbor, consensus) = get_neighbor_consensus(ctx, chunk_index);
    
    // No change if consensus below threshold
    if consensus < CONSENSUS_THRESHOLD {
        return None;
    }
    
    // No change if already matches dominant
    if dominant_neighbor == *current_weather {
        return None;
    }
    
    // Calculate conform chance based on consensus strength and inertia
    // Higher consensus = higher chance, higher inertia = lower chance
    let consensus_bonus = (consensus - CONSENSUS_THRESHOLD) * 2.0; // 0.5 = 0%, 0.75 = 50%, 1.0 = 100%
    let conform_chance = CONSENSUS_CONFORM_BASE_CHANCE * (1.0 + consensus_bonus) * (1.0 - inertia);
    
    if rng.gen::<f32>() < conform_chance {
        // Decide whether to transition gradually or jump directly to neighbor weather
        if rng.gen::<f32>() < GRADUAL_TRANSITION_CHANCE {
            // Gradual transition - step toward dominant weather
            Some(gradual_weather_transition(current_weather, &dominant_neighbor))
        } else {
            // Direct jump to neighbor weather
            Some(dominant_neighbor)
        }
    } else {
        None
    }
}

/// Returns a gradual transition step from current weather toward target weather
/// e.g., HeavyStorm -> HeavyRain -> ModerateRain -> LightRain -> Clear (and vice versa)
fn gradual_weather_transition(current: &WeatherType, target: &WeatherType) -> WeatherType {
    // Define weather "intensity" for ordering
    let intensity = |w: &WeatherType| -> i32 {
        match w {
            WeatherType::Clear => 0,
            WeatherType::LightRain => 1,
            WeatherType::ModerateRain => 2,
            WeatherType::HeavyRain => 3,
            WeatherType::HeavyStorm => 4,
        }
    };
    
    let current_intensity = intensity(current);
    let target_intensity = intensity(target);
    
    // Step one level toward target
    let new_intensity = if target_intensity > current_intensity {
        current_intensity + 1
    } else if target_intensity < current_intensity {
        current_intensity - 1
    } else {
        current_intensity // Already at target
    };
    
    // Convert back to weather type
    match new_intensity {
        0 => WeatherType::Clear,
        1 => WeatherType::LightRain,
        2 => WeatherType::ModerateRain,
        3 => WeatherType::HeavyRain,
        _ => WeatherType::HeavyStorm,
    }
}

/// Gets nearby chunk indices for weather propagation (including diagonals)
/// Returns chunks within propagation_distance with their distance from source
/// Returns Vec<(chunk_index, distance)> where distance is 1 for immediate neighbors, 2 for next ring, etc.
fn get_nearby_chunk_indices(chunk_index: u32, propagation_distance: u32) -> Vec<(u32, u32)> {
    // Convert 1D chunk index to 2D coordinates
    let chunk_x = (chunk_index % WORLD_WIDTH_CHUNKS) as i32;
    let chunk_y = (chunk_index / WORLD_WIDTH_CHUNKS) as i32;
    
    let mut nearby_chunks = Vec::new();
    let max_distance = propagation_distance as i32;
    
    // Check all chunks within propagation distance (including diagonals)
    for dy in -max_distance..=max_distance {
        for dx in -max_distance..=max_distance {
            if dx == 0 && dy == 0 {
                continue; // Skip the center chunk itself
            }
            
            // Calculate Chebyshev distance (max of dx and dy) for diagonal movement
            let distance = dx.abs().max(dy.abs()) as u32;
            
            let check_x = chunk_x + dx;
            let check_y = chunk_y + dy;
            
            // Bounds check
            if check_x >= 0 && check_x < WORLD_WIDTH_CHUNKS as i32 &&
               check_y >= 0 && check_y < WORLD_HEIGHT_CHUNKS as i32 {
                let nearby_index = (check_y as u32) * WORLD_WIDTH_CHUNKS + (check_x as u32);
                nearby_chunks.push((nearby_index, distance));
            }
        }
    }
    
    nearby_chunks
}

/// Propagates weather from one chunk to nearby chunks (SYMMETRIC - supplements consensus system)
/// With the new emergent weather system, propagation is symmetric:
/// - Clear weather and Rain weather propagate at the SAME rate
/// - The consensus system is the primary mechanism for coherent fronts
/// - Propagation helps fronts move faster by actively spreading to neighbors
fn propagate_weather_to_nearby_chunks(
    ctx: &ReducerContext,
    source_chunk_index: u32,
    source_weather: &WeatherType,
    rng: &mut impl Rng,
) -> Result<(), String> {
    let now = ctx.timestamp;
    
    // Get nearby chunks (immediate neighbors only for simplicity)
    let nearby_chunks = get_nearby_chunk_indices(source_chunk_index, WEATHER_PROPAGATION_DISTANCE);
    
    for (nearby_index, distance) in nearby_chunks {
        let mut nearby_weather = get_or_create_chunk_weather(ctx, nearby_index);
        
        // Skip if neighbor already has the same weather type
        if nearby_weather.current_weather == *source_weather {
            continue;
        }
        
        // SYMMETRIC: All weather types have the same base propagation chance
        // The consensus system handles which weather "wins" - propagation just helps spread
        let propagation_chance = BASE_PROPAGATION_CHANCE / (distance as f32); // Distance decay
        
        // Check inertia of the target chunk - established weather resists change
        let target_inertia = get_weather_inertia(&nearby_weather, now);
        let effective_chance = propagation_chance * (1.0 - target_inertia * 0.5); // Inertia reduces chance by up to 50%
        
        if rng.gen::<f32>() < effective_chance {
            // Use gradual transition instead of direct replacement
            let new_weather = gradual_weather_transition(&nearby_weather.current_weather, source_weather);
            
            // Check if HeavyStorm is ending (for storm debris)
            let was_heavy_storm = matches!(nearby_weather.current_weather, WeatherType::HeavyStorm);
            
            // Apply the weather change
            nearby_weather.current_weather = new_weather.clone();
            nearby_weather.weather_start_time = Some(now);
            nearby_weather.last_update = now;
            
            match &new_weather {
                WeatherType::Clear => {
                    nearby_weather.rain_intensity = 0.0;
                    nearby_weather.weather_duration = None;
                    nearby_weather.last_rain_end_time = Some(now);
                    nearby_weather.last_thunder_time = None;
                    nearby_weather.next_thunder_time = None;
                },
                _ => {
                    nearby_weather.rain_intensity = match new_weather {
                        WeatherType::LightRain => rng.gen_range(0.2..=0.4),
                        WeatherType::ModerateRain => rng.gen_range(0.5..=0.7),
                        WeatherType::HeavyRain => rng.gen_range(0.8..=1.0),
                        WeatherType::HeavyStorm => 1.0,
                        _ => 0.0,
                    };
                    nearby_weather.weather_duration = Some(rng.gen_range(MIN_RAIN_DURATION_SECONDS..=MAX_RAIN_DURATION_SECONDS));
                }
            }
            
            ctx.db.chunk_weather().chunk_index().update(nearby_weather.clone());
            
            // Spawn storm debris on beaches when HeavyStorm ends
            if was_heavy_storm && !matches!(new_weather, WeatherType::HeavyStorm) {
                if let Err(e) = crate::storm_debris::spawn_storm_debris_on_beaches(ctx, nearby_index) {
                    log::error!("Failed to spawn storm debris after HeavyStorm ended in chunk {}: {}", nearby_index, e);
                }
            }
            
            log::debug!("Weather propagated from chunk {} to chunk {}: {:?} -> {:?}", 
                       source_chunk_index, nearby_index, source_weather, new_weather);
        }
    }
    
    Ok(())
}

/// Gets weather for a specific chunk (public API)
pub fn get_weather_for_chunk(ctx: &ReducerContext, chunk_index: u32) -> ChunkWeather {
    get_or_create_chunk_weather(ctx, chunk_index)
}

/// Gets weather for a position (convenience function)
pub fn get_weather_for_position(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> ChunkWeather {
    let chunk_index = calculate_chunk_index(pos_x, pos_y);
    get_weather_for_chunk(ctx, chunk_index)
}

// Debug reducer to manually set weather (only for testing)
#[spacetimedb::reducer]
pub fn debug_set_weather(ctx: &ReducerContext, weather_type_str: String) -> Result<(), String> {
    let now = ctx.timestamp;
    let mut rng = ctx.rng();

    let weather_type = match weather_type_str.as_str() {
        "Clear" => WeatherType::Clear,
        "LightRain" => WeatherType::LightRain,
        "ModerateRain" => WeatherType::ModerateRain,
        "HeavyRain" => WeatherType::HeavyRain,
        "HeavyStorm" => WeatherType::HeavyStorm,
        _ => return Err(format!("Invalid weather type: {}", weather_type_str)),
    };

    let mut world_state = ctx.db.world_state().iter().next().ok_or_else(|| {
        log::error!("WorldState singleton not found during debug weather set!");
        "WorldState singleton not found".to_string()
    })?;
    
    // 🌧️ Stop rain sounds if we're changing away from rainy weather
    if matches!(world_state.current_weather, WeatherType::HeavyRain | WeatherType::HeavyStorm) 
        && !matches!(weather_type, WeatherType::HeavyRain | WeatherType::HeavyStorm) {
        sound_events::stop_heavy_storm_rain_sound(ctx);
        log::info!("🌧️ Stopped heavy rain sound due to debug weather change: {:?} -> {:?}", world_state.current_weather, weather_type);
    }
    
    if matches!(world_state.current_weather, WeatherType::LightRain | WeatherType::ModerateRain) 
        && !matches!(weather_type, WeatherType::LightRain | WeatherType::ModerateRain) {
        sound_events::stop_normal_rain_sound(ctx);
        log::info!("🌦️ Stopped normal rain sound due to debug weather change: {:?} -> {:?}", world_state.current_weather, weather_type);
    }
    
    // Set the weather immediately
    world_state.current_weather = weather_type.clone();
    world_state.weather_start_time = Some(now);
    world_state.rain_intensity = match weather_type {
        WeatherType::Clear => 0.0,
        WeatherType::LightRain => 0.3,
        WeatherType::ModerateRain => 0.6,
        WeatherType::HeavyRain => 0.9,
        WeatherType::HeavyStorm => 1.0,
    };
    world_state.weather_duration = Some(600.0); // 10 minutes
    
    // Update the database
    ctx.db.world_state().id().update(world_state.clone());
    
    // Handle campfire extinguishing if it's heavy weather
    if matches!(weather_type, WeatherType::HeavyRain | WeatherType::HeavyStorm) {
        extinguish_unprotected_campfires(ctx, &weather_type)?;
    }
    
    // Handle HeavyStorm-specific setup (thunder scheduling)
    // Thunder/lightning disabled for now
    // TODO: Re-enable thunder system after debugging
    
    // 🌧️ Start continuous rain sounds based on weather type
    if matches!(weather_type, WeatherType::HeavyRain | WeatherType::HeavyStorm) {
        if let Err(e) = sound_events::start_heavy_storm_rain_sound(ctx) {
            log::error!("Failed to start heavy rain sound: {}", e);
        } else {
            log::info!("🌧️ Started heavy rain sound for debug weather change: {:?}", weather_type);
        }
    } else if matches!(weather_type, WeatherType::LightRain | WeatherType::ModerateRain) {
        if let Err(e) = sound_events::start_normal_rain_sound(ctx) {
            log::error!("Failed to start normal rain sound: {}", e);
        } else {
            log::info!("🌦️ Started normal rain sound for debug weather change: {:?}", weather_type);
        }
    }
    
    // Also update chunk weather for the caller's current chunk (if they're a player)
    // This ensures the debug weather shows up in the chunk-based system
    if let Some(player) = ctx.db.player().identity().find(&ctx.sender) {
        let chunk_index = calculate_chunk_index(player.position_x, player.position_y);
        let mut chunk_weather = get_or_create_chunk_weather(ctx, chunk_index);
        
        chunk_weather.current_weather = weather_type.clone();
        chunk_weather.rain_intensity = match weather_type {
            WeatherType::Clear => 0.0,
            WeatherType::LightRain => 0.3,
            WeatherType::ModerateRain => 0.6,
            WeatherType::HeavyRain => 0.9,
            WeatherType::HeavyStorm => 1.0,
        };
        chunk_weather.weather_start_time = Some(now);
        chunk_weather.weather_duration = Some(600.0); // 10 minutes
        chunk_weather.last_update = now;
        
        // Thunder/lightning disabled for now
        // TODO: Re-enable thunder system after debugging
        chunk_weather.next_thunder_time = None;
        chunk_weather.last_thunder_time = None;
        
        ctx.db.chunk_weather().chunk_index().update(chunk_weather);
        log::info!("Debug: Chunk {} weather set to {:?} (player position: {:.1}, {:.1})", chunk_index, weather_type, player.position_x, player.position_y);
    }
    
    log::info!("Debug: Weather manually set to {:?}", weather_type);
    Ok(())
}

// Debug reducer to manually set season (only for testing)
// This clears all chunk weather and reseeds based on the new season's configuration
#[spacetimedb::reducer]
pub fn debug_set_season(ctx: &ReducerContext, season_str: String) -> Result<(), String> {
    let new_season = match season_str.as_str() {
        "Spring" => Season::Spring,
        "Summer" => Season::Summer,
        "Autumn" | "Fall" => Season::Autumn,
        "Winter" => Season::Winter,
        _ => return Err(format!("Invalid season: {}. Use: Spring, Summer, Autumn/Fall, Winter", season_str)),
    };

    let mut world_state = ctx.db.world_state().iter().next().ok_or_else(|| {
        log::error!("WorldState singleton not found during debug season set!");
        "WorldState singleton not found".to_string()
    })?;
    
    let old_season = world_state.current_season.clone();
    
    // Set the season
    world_state.current_season = new_season.clone();
    
    // Update day_of_year to match the season (middle of each 240-day season)
    world_state.day_of_year = match new_season {
        Season::Spring => 120,  // Middle of Spring (day 120 of 1-240)
        Season::Summer => 360,  // Middle of Summer (day 360 of 241-480)
        Season::Autumn => 600,  // Middle of Autumn (day 600 of 481-720)
        Season::Winter => 840,  // Middle of Winter (day 840 of 721-960)
    };
    
    world_state.last_tick = ctx.timestamp;
    
    // Update the database
    ctx.db.world_state().id().update(world_state.clone());
    
    // Reseed weather for the new season using shared helper
    let (cleared_count, rainy_chunks_count) = reseed_weather_for_season(ctx, &new_season)?;
    
    // Log the results
    let config = SeasonalWeatherConfig::for_season(&new_season);
    log::info!("✅ Debug: Season changed from {:?} to {:?}", old_season, new_season);
    log::info!("🗑️ Cleared {} chunk weather entries", cleared_count);
    log::info!("🌧️ Created {} rainy chunks for {:?}", rainy_chunks_count, new_season);
    log::info!("  Weather config: rain_prob={:.2}x, duration={:.2}x, decay={:.2}x, propagation={:.2}x", 
               config.rain_probability_multiplier, 
               config.duration_multiplier, 
               config.decay_multiplier,
               config.propagation_multiplier);
    log::info!("  Rain type distribution: light={:.0}%, moderate={:.0}%, heavy={:.0}%, storm={:.0}%",
               config.rain_type_distribution[0] * 100.0,
               config.rain_type_distribution[1] * 100.0,
               config.rain_type_distribution[2] * 100.0,
               config.rain_type_distribution[3] * 100.0);
    
    Ok(())
}

// Debug reducer to manually set time of day (only for testing)
#[spacetimedb::reducer]
pub fn debug_set_time(ctx: &ReducerContext, time_type_str: String) -> Result<(), String> {
    let (new_progress, new_time_of_day) = match time_type_str.as_str() {
        "Dawn" => (0.02, TimeOfDay::Dawn),
        "TwilightMorning" => (0.985, TimeOfDay::TwilightMorning), // Pre-dawn twilight (0.97-1.0, wraps around)
        "Morning" => (0.20, TimeOfDay::Morning),
        "Noon" => (0.40, TimeOfDay::Noon),
        "Afternoon" => (0.55, TimeOfDay::Afternoon),
        "Dusk" => (0.74, TimeOfDay::Dusk), // Middle of Dusk range (0.72-0.76)
        "TwilightEvening" => (0.78, TimeOfDay::TwilightEvening), // Evening twilight (0.76-0.80)
        "Night" => (0.86, TimeOfDay::Night),     // Regular night (0.80-0.92)
        "Midnight" => (0.945, TimeOfDay::Midnight), // Deep night (0.92-0.97)
        _ => return Err(format!("Invalid time type: {}", time_type_str)),
    };

    let mut world_state = ctx.db.world_state().iter().next().ok_or_else(|| {
        log::error!("WorldState singleton not found during debug time set!");
        "WorldState singleton not found".to_string()
    })?;
    
    // Set the time immediately
    world_state.cycle_progress = new_progress;
    world_state.time_of_day = new_time_of_day.clone();
    world_state.last_tick = ctx.timestamp;
    
    // Force regular night (not full moon) when setting debug time
    // Set cycle count to a non-full-moon value (1 or 2, since full moons occur on multiples of 3)
    world_state.cycle_count = 1; // This ensures it's not a full moon cycle
    world_state.is_full_moon = false;
    
    // Update the database
    ctx.db.world_state().id().update(world_state.clone());
    
    log::info!("Debug: Time manually set to {:?} (progress: {:.2})", new_time_of_day, new_progress);
    Ok(())
}

// Reducer to advance the time of day
#[spacetimedb::reducer]
pub fn tick_world_state(ctx: &ReducerContext, _timestamp: Timestamp) -> Result<(), String> {
    let mut world_state = ctx.db.world_state().iter().next().ok_or_else(|| {
        log::error!("WorldState singleton not found during tick!");
        "WorldState singleton not found".to_string()
    })?;

    let now = ctx.timestamp;
    let last_tick_time = world_state.last_tick;
    let elapsed_micros = now.to_micros_since_unix_epoch().saturating_sub(last_tick_time.to_micros_since_unix_epoch());
    let elapsed_seconds = (elapsed_micros as f64 / 1_000_000.0) as f32;

    // Update the world state only if time actually passed
    if elapsed_seconds > 0.0 {
        let progress_delta = elapsed_seconds / FULL_CYCLE_DURATION_SECONDS;
        
        // Calculate potential progress before wrapping
        let potential_next_progress = world_state.cycle_progress + progress_delta;
        
        // Determine actual new progress (after wrapping)
        let new_progress = potential_next_progress % 1.0;
        
        // Determine if the cycle wrapped during this tick
        let did_wrap = potential_next_progress >= 1.0;
        
        // Determine the correct cycle count for the new_progress point
        let new_cycle_count = if did_wrap { 
            let next_count = world_state.cycle_count.wrapping_add(1); // Use wrapping_add for safety
            log::info!("New cycle started ({} -> {}).", world_state.cycle_count, next_count);
            next_count
        } else { 
            world_state.cycle_count 
        };
        
        // Update season and calendar when a new day starts (cycle wraps)
        let (new_day_of_year, new_year, new_season) = if did_wrap {
            let next_day = world_state.day_of_year + 1;
            if next_day > 960 { // New year starts (960 days = 4 seasons × 240 days)
                let next_year = world_state.year + 1;
                log::info!("New year started! Year {} -> Year {}", world_state.year, next_year);
                (1, next_year, calculate_season(1)) // Start new year with day 1
            } else {
                let season = calculate_season(next_day);
                if season != world_state.current_season {
                    log::info!("🍃 Season changed from {:?} to {:?} on day {} of year {}", 
                              world_state.current_season, season, next_day, world_state.year);
                    
                    // SEASONAL TRANSITION: Start gradual plant transition
                    if let Err(e) = start_seasonal_plant_transition(ctx, &season) {
                        log::error!("Failed to start seasonal plant transition: {}", e);
                    }
                    
                    // SEASONAL WEATHER TRANSITION: Reseed weather patterns for the new season
                    match reseed_weather_for_season(ctx, &season) {
                        Ok((cleared, created)) => {
                            let config = SeasonalWeatherConfig::for_season(&season);
                            log::info!("🌧️ Weather reseeded for {:?}: cleared {} chunks, created {} rainy chunks", 
                                      season, cleared, created);
                            log::info!("  Weather config: rain_prob={:.2}x, duration={:.2}x, decay={:.2}x", 
                                      config.rain_probability_multiplier, 
                                      config.duration_multiplier, 
                                      config.decay_multiplier);
                        }
                        Err(e) => {
                            log::error!("Failed to reseed weather for season transition: {}", e);
                        }
                    }
                }
                (next_day, world_state.year, season)
            }
        } else {
            (world_state.day_of_year, world_state.year, world_state.current_season)
        };
        
        // Determine full moon status based on the *correct* cycle count for this progress
        let new_is_full_moon = new_cycle_count % FULL_MOON_CYCLE_INTERVAL == 0;
        if did_wrap {
             log::info!("Cycle {} Full Moon status: {}", new_cycle_count, new_is_full_moon);
        }

        // Determine the new TimeOfDay based on new_progress
        // Day is now 0.0 to 0.8 (20min), Night is 0.8 to 1.0 (5min)
        // Progress thresholds remain the same (0.0-1.0), durations scale proportionally
        // Correct cycle order: Night -> Midnight -> TwilightMorning -> Dawn -> Morning -> Noon -> Afternoon -> Dusk -> TwilightEvening -> Night
        // Ranges: Night (0.80-0.92) -> Midnight (0.92-0.97) -> TwilightMorning (0.97-1.0) -> Dawn (0.0-0.05) -> ...
        let new_time_of_day = match new_progress {
            // Check TwilightMorning FIRST (0.97-1.0) - wraps around, comes AFTER Midnight
            p if p >= 0.97 => TimeOfDay::TwilightMorning, // Purple (0.97 - 1.0) - wraps around
            // Then check Midnight (0.92-0.97) - comes after Night, before TwilightMorning
            p if p >= 0.92 && p < 0.97 => TimeOfDay::Midnight, // Very Dark Blue/Black (0.92 - 0.97)
            // Then check Dawn (0.0-0.05) - comes AFTER TwilightMorning (wraps around)
            p if p < 0.05 => TimeOfDay::Dawn,     // Orange (0.0 - 0.05) - 1.25min
            p if p < 0.35 => TimeOfDay::Morning,   // Yellow (0.05 - 0.35) - 7.5min
            p if p < 0.55 => TimeOfDay::Noon,      // Bright Yellow (0.35 - 0.55) - 5min
            p if p < 0.72 => TimeOfDay::Afternoon, // Yellow (0.55 - 0.72) - 4.25min
            p if p < 0.76 => TimeOfDay::Dusk,      // Orange (0.72 - 0.76) - 1min
            p if p < 0.80 => TimeOfDay::TwilightEvening, // Purple (0.76 - 0.80) - 1min
            p if p < 0.92 => TimeOfDay::Night,     // Dark Blue (0.80 - 0.92) - 3min
            _             => TimeOfDay::Midnight, // Fallback (should never reach here)
        };

        // BEACON EVENT: Trigger beacon spawn check when transitioning TO Dusk
        // Only trigger once when time_of_day changes from non-Dusk to Dusk
        let old_time_of_day = world_state.time_of_day.clone();
        if old_time_of_day != TimeOfDay::Dusk && new_time_of_day == TimeOfDay::Dusk {
            log::info!("🌅 Time of day transitioning to Dusk - checking beacon spawn...");
            crate::beacon_event::on_dusk_started(ctx);
        }

        // Assign the calculated new values to the world_state object
        world_state.cycle_progress = new_progress;
        world_state.time_of_day = new_time_of_day;
        world_state.cycle_count = new_cycle_count;
        world_state.is_full_moon = new_is_full_moon; // Use the correctly determined flag
        world_state.last_tick = now;
        world_state.current_season = new_season;
        world_state.day_of_year = new_day_of_year;
        world_state.year = new_year;

        // Pass a clone to update
        ctx.db.world_state().id().update(world_state.clone());
        
        // Update chunk-based weather after updating time
        update_chunk_weather_system(ctx, &world_state, elapsed_seconds)?;
        
        // log::debug!("World tick: Progress {:.2}, Time: {:?}, Cycle: {}, Full Moon: {}, Season: {:?} (Day {} of Year {}), Weather: {:?}", 
        //            new_progress, world_state.time_of_day, new_cycle_count, new_is_full_moon, 
        //            world_state.current_season, world_state.day_of_year, world_state.year, world_state.current_weather);
    }

    Ok(())
}

/// Calculates the current season based on day of year (1-960)
/// Perfect calendar: Spring (1-240), Summer (241-480), Autumn (481-720), Winter (721-960)
/// Each season = 240 in-game days = 5 real-life days
fn calculate_season(day_of_year: u32) -> Season {
    match day_of_year {
        1..=240 => Season::Spring,    // Days 1-240 (~5 real days)
        241..=480 => Season::Summer,  // Days 241-480 (~5 real days)
        481..=720 => Season::Autumn,  // Days 481-720 (~5 real days)
        721..=960 => Season::Winter,  // Days 721-960 (~5 real days)
        _ => Season::Spring, // Fallback, though this shouldn't happen with our 960-day year
    }
}

/// Updates ALL rain collectors every tick based on their chunk's weather
/// This ensures real-time updates like broth pots/campfires
fn update_all_rain_collectors(
    ctx: &ReducerContext,
    elapsed_seconds: f32,
) -> Result<(), String> {
    let chunk_weather_table = ctx.db.chunk_weather();
    let mut updated_count = 0;
    let mut total_water_added = 0.0;
    
    // Update all active rain collectors
    for mut collector in ctx.db.rain_collector().iter() {
        if collector.is_destroyed {
            continue;
        }
        
        // Check capacity limit
        if collector.total_water_collected >= crate::rain_collector::RAIN_COLLECTOR_MAX_WATER {
            continue;
        }
        
        // Skip if collector is inside a building (can't collect rain indoors)
        if crate::building_enclosure::is_position_inside_building(ctx, collector.pos_x, collector.pos_y) {
            continue;
        }
        
        // Get weather for this collector's chunk
        let chunk_index = calculate_chunk_index(collector.pos_x, collector.pos_y);
        let chunk_weather = chunk_weather_table.chunk_index().find(&chunk_index);
        
        // Skip if no weather data or clear weather
        if chunk_weather.is_none() {
            continue;
        }
        
        let chunk_weather = chunk_weather.unwrap();
        if chunk_weather.current_weather == WeatherType::Clear {
            continue;
        }
        
        // Get collection rate based on weather type
        let collection_rate = match chunk_weather.current_weather {
            WeatherType::LightRain => crate::rain_collector::LIGHT_RAIN_COLLECTION_RATE,
            WeatherType::ModerateRain => crate::rain_collector::MODERATE_RAIN_COLLECTION_RATE,
            WeatherType::HeavyRain => crate::rain_collector::HEAVY_RAIN_COLLECTION_RATE,
            WeatherType::HeavyStorm => crate::rain_collector::HEAVY_STORM_COLLECTION_RATE,
            WeatherType::Clear => continue, // Already handled above
        };
        
        // Calculate water to add this tick
        let water_to_add = collection_rate * elapsed_seconds;
        
        if water_to_add <= 0.0 {
            continue;
        }
        
        // Add water to collector
        let water_before = collector.total_water_collected;
        let collector_id = collector.id; // Capture ID before move
        collector.total_water_collected = (collector.total_water_collected + water_to_add)
            .min(crate::rain_collector::RAIN_COLLECTOR_MAX_WATER);
        let water_after = collector.total_water_collected;
        collector.last_collection_time = Some(ctx.timestamp);
        
        // --- Reset salt water status when collecting fresh rainwater ---
        // Rain is always fresh water, so if we're adding water and collector was empty, reset to fresh
        if water_before <= 0.0 {
            collector.is_salt_water = false;
        }
        
        // Update the collector in the database
        ctx.db.rain_collector().id().update(collector);
        updated_count += 1;
        total_water_added += water_after - water_before;
        
        log::debug!("Collector {} water: {:.1} -> {:.1} (max: {}) during {:?}", 
                   collector_id, water_before, water_after, 
                   crate::rain_collector::RAIN_COLLECTOR_MAX_WATER, chunk_weather.current_weather);
    }
    
    if updated_count > 0 {
        log::debug!("Added {:.1}L total water to {} rain collectors this tick", 
                   total_water_added, updated_count);
    }
    
    Ok(())
}

/// Updates chunk-based weather system - processes weather for all chunks
/// Only processes a subset of chunks per tick for performance (staggered updates)
fn update_chunk_weather_system(ctx: &ReducerContext, world_state: &WorldState, elapsed_seconds: f32) -> Result<(), String> {
    let now = ctx.timestamp;
    let mut rng = ctx.rng();
    
    // Process a random subset of chunks each tick (for performance)
    // This creates natural variation while keeping updates manageable
    
    let chunk_weather_table = ctx.db.chunk_weather();
    let all_chunk_weather: Vec<ChunkWeather> = chunk_weather_table.iter().collect();
    let total_possible_chunks = WORLD_WIDTH_CHUNKS * WORLD_HEIGHT_CHUNKS;
    
    // Count how many chunks have rainy weather
    let rainy_chunk_count = all_chunk_weather.iter()
        .filter(|cw| !matches!(cw.current_weather, WeatherType::Clear))
        .count();
    
    // AGGRESSIVE INITIALIZATION: If we don't have enough chunks initialized OR not enough rain
    // Initialize the ENTIRE map with weather!
    let chunks_initialized = all_chunk_weather.len();
    let needs_full_init = chunks_initialized < (total_possible_chunks as usize / 2); // Less than 50% of map has weather chunks
    let needs_rain_init = rainy_chunk_count < 10; // Less than 10 rainy chunks
    
    if needs_full_init || needs_rain_init {
        log::info!("🌧️ FULL WEATHER INITIALIZATION: {} chunks exist, {} rainy, {} total possible", 
                   chunks_initialized, rainy_chunk_count, total_possible_chunks);
        
        let seasonal_config = SeasonalWeatherConfig::for_season(&world_state.current_season);
        
        // Create multiple large weather fronts spread across the map
        // Aim for ~25-35% rain coverage
        let num_fronts = 6.max((total_possible_chunks / 150) as u32).min(12); // More fronts for bigger maps
        let front_radius = 5; // 11x11 chunk areas = ~100 chunks per front
        
        log::info!("🌧️ Creating {} weather fronts with radius {} for {:?}", 
                   num_fronts, front_radius, world_state.current_season);
        
        for front_idx in 0..num_fronts {
            // Spread fronts across the map using a grid pattern with randomization
            let grid_cols = (num_fronts as f32).sqrt().ceil() as u32;
            let grid_rows = (num_fronts + grid_cols - 1) / grid_cols;
            let col = front_idx % grid_cols;
            let row = front_idx / grid_cols;
            
            // Base position from grid, then add randomization
            let base_x = (col as f32 + 0.5) * (WORLD_WIDTH_CHUNKS as f32 / grid_cols as f32);
            let base_y = (row as f32 + 0.5) * (WORLD_HEIGHT_CHUNKS as f32 / grid_rows as f32);
            let center_x = ((base_x + rng.gen_range(-3.0..3.0)) as u32).min(WORLD_WIDTH_CHUNKS - 1);
            let center_y = ((base_y + rng.gen_range(-3.0..3.0)) as u32).min(WORLD_HEIGHT_CHUNKS - 1);
            
            // Use SEASONAL rain type distribution
            let rain_type = seasonal_config.select_rain_type(rng.gen::<f32>());
            
            // Create a large cluster of rainy chunks
            for dy in -(front_radius as i32)..=(front_radius as i32) {
                for dx in -(front_radius as i32)..=(front_radius as i32) {
                    let chunk_x = (center_x as i32 + dx).max(0).min(WORLD_WIDTH_CHUNKS as i32 - 1) as u32;
                    let chunk_y = (center_y as i32 + dy).max(0).min(WORLD_HEIGHT_CHUNKS as i32 - 1) as u32;
                    let chunk_index = chunk_y * WORLD_WIDTH_CHUNKS + chunk_x;
                    
                    // High probability of rain within the front
                    let distance_from_center = ((dx * dx + dy * dy) as f32).sqrt();
                    let rain_chance = 1.0 - (distance_from_center / (front_radius as f32 + 1.0)) * 0.3;
                    
                    if rng.gen::<f32>() < rain_chance {
                        let mut chunk_weather = get_or_create_chunk_weather(ctx, chunk_index);
                        
                        chunk_weather.current_weather = rain_type.clone();
                        chunk_weather.rain_intensity = match rain_type {
                            WeatherType::LightRain => rng.gen_range(0.2..=0.4),
                            WeatherType::ModerateRain => rng.gen_range(0.5..=0.7),
                            WeatherType::HeavyRain => rng.gen_range(0.8..=1.0),
                            WeatherType::HeavyStorm => 1.0,
                            _ => 0.0,
                        };
                        chunk_weather.weather_start_time = Some(now);
                        let base_duration = rng.gen_range(MIN_RAIN_DURATION_SECONDS..=MAX_RAIN_DURATION_SECONDS);
                        chunk_weather.weather_duration = Some(base_duration * seasonal_config.duration_multiplier);
                        chunk_weather.last_update = now;
                        
                        ctx.db.chunk_weather().chunk_index().update(chunk_weather);
                    }
                }
            }
            
            log::info!("🌧️ Created front #{} at ({}, {}) with {:?}", front_idx + 1, center_x, center_y, rain_type);
        }
        
        // NOW initialize ALL remaining chunks as Clear (so the entire map has weather data)
        log::info!("🌧️ Initializing all remaining chunks as Clear...");
        let mut clear_count = 0u32;
        for chunk_y in 0..WORLD_HEIGHT_CHUNKS {
            for chunk_x in 0..WORLD_WIDTH_CHUNKS {
                let chunk_index = chunk_y * WORLD_WIDTH_CHUNKS + chunk_x;
                if chunk_weather_table.chunk_index().find(&chunk_index).is_none() {
                    let chunk_weather = ChunkWeather {
                        chunk_index,
                        current_weather: WeatherType::Clear,
                        rain_intensity: 0.0,
                        weather_start_time: Some(now),
                        weather_duration: None,
                        last_rain_end_time: None,
                        last_thunder_time: None,
                        next_thunder_time: None,
                        last_update: now,
                    };
                    if let Ok(_) = ctx.db.chunk_weather().try_insert(chunk_weather) {
                        clear_count += 1;
                    }
                }
            }
        }
        
        // Final count
        let final_rainy = ctx.db.chunk_weather().iter()
            .filter(|cw| !matches!(cw.current_weather, WeatherType::Clear))
            .count();
        let final_total = ctx.db.chunk_weather().iter().count();
        
        log::info!("🌧️ Weather initialization complete: {} rainy chunks, {} clear chunks, {} total ({}% rain coverage)", 
                   final_rainy, clear_count, final_total, (final_rainy * 100) / final_total.max(1));
        
        return Ok(());
    }
    
    // Ensure chunks with players in them are initialized (so players always see weather)
    let mut player_chunks_set = std::collections::HashSet::new();
    for player in ctx.db.player().iter() {
        let chunk_index = calculate_chunk_index(player.position_x, player.position_y);
        player_chunks_set.insert(chunk_index);
        
        // Initialize chunk weather if it doesn't exist yet
        if chunk_weather_table.chunk_index().find(&chunk_index).is_none() {
            get_or_create_chunk_weather(ctx, chunk_index);
        }
    }
    
    // Refresh all_chunk_weather after initializing player chunks
    let all_chunk_weather: Vec<ChunkWeather> = chunk_weather_table.iter().collect();
    
    // Calculate global storm coverage for emergent balancing
    // If coverage is high, we increase decay rates to prevent map-wide lockups
    let stormy_chunks_count = all_chunk_weather.iter()
        .filter(|cw| matches!(cw.current_weather, WeatherType::HeavyStorm | WeatherType::HeavyRain | WeatherType::ModerateRain))
        .count();
    let total_known_chunks = all_chunk_weather.len().max(1);
    let storm_coverage = stormy_chunks_count as f32 / total_known_chunks as f32;
    
    // Select chunks to update this tick (random sampling)
    // Prioritize chunks with players in them, then randomly sample others
    let mut chunks_to_update: Vec<u32> = Vec::new();
    
    // First, add player chunks (up to half of CHUNKS_PER_UPDATE)
    let player_chunks_vec: Vec<u32> = player_chunks_set.into_iter().collect();
    let player_chunks_to_update = player_chunks_vec.len().min(CHUNKS_PER_UPDATE / 2);
    chunks_to_update.extend(player_chunks_vec.into_iter().take(player_chunks_to_update));
    
    // Then add random chunks to fill the rest
    if all_chunk_weather.len() <= CHUNKS_PER_UPDATE - chunks_to_update.len() {
        // Add all remaining chunks
        let existing_indices: Vec<u32> = all_chunk_weather.iter()
            .map(|cw| cw.chunk_index)
            .filter(|idx| !chunks_to_update.contains(idx))
            .collect();
        chunks_to_update.extend(existing_indices);
    } else {
        // Randomly sample remaining chunks
        use rand::seq::SliceRandom;
        let mut indices: Vec<u32> = all_chunk_weather.iter()
            .map(|cw| cw.chunk_index)
            .filter(|idx| !chunks_to_update.contains(idx))
            .collect();
        indices.shuffle(&mut rng);
        let remaining_slots = CHUNKS_PER_UPDATE - chunks_to_update.len();
        chunks_to_update.extend(indices.into_iter().take(remaining_slots));
    }
    
    // Update each selected chunk
    for chunk_index in chunks_to_update {
        if let Some(mut chunk_weather) = chunk_weather_table.chunk_index().find(&chunk_index) {
            update_single_chunk_weather(ctx, &mut chunk_weather, world_state, elapsed_seconds, &mut rng, storm_coverage)?;
            
            // ALWAYS propagate from rainy chunks to help fronts expand
            // Only 30% of the time for clear chunks to prevent clear from dominating
            let propagation_chance = if matches!(chunk_weather.current_weather, WeatherType::Clear) {
                0.3
            } else {
                0.8 // High chance to propagate rain - helps fronts grow!
            };
            
            if rng.gen::<f32>() < propagation_chance {
                propagate_weather_to_nearby_chunks(ctx, chunk_index, &chunk_weather.current_weather, &mut rng)?;
            }
        }
    }
    
    // EXPANSION: Also create and initialize some random chunks to expand the weather system
    // This ensures weather can reach all parts of the map, not just where players are
    let total_chunks = WORLD_WIDTH_CHUNKS * WORLD_HEIGHT_CHUNKS;
    let expansion_count = 5.min(total_chunks as usize / 50); // Create up to 5 new random chunks per tick
    for _ in 0..expansion_count {
        let random_chunk = rng.gen_range(0..total_chunks);
        if chunk_weather_table.chunk_index().find(&random_chunk).is_none() {
            // Create this chunk - it will start as Clear and can nucleate rain
            get_or_create_chunk_weather(ctx, random_chunk);
        }
    }
    
    // Update ALL rain collectors every tick (not just in selected chunks)
    // This ensures real-time updates like broth pots/campfires
    update_all_rain_collectors(ctx, elapsed_seconds)?;
    
    Ok(())
}

/// Updates weather for a single chunk using EMERGENT WEATHER SYSTEM
/// Key principles:
/// - Neighbor consensus: chunks conform to their neighborhood majority
/// - Interior stability: chunks surrounded by same weather are rock-stable  
/// - Edge-only evolution: only boundary chunks between weather types can change
/// - Inertia: established weather resists change
/// - Symmetry: Clear weather is a first-class type (forms large fronts just like rain)
fn update_single_chunk_weather(
    ctx: &ReducerContext,
    chunk_weather: &mut ChunkWeather,
    world_state: &WorldState,
    _tick_elapsed_seconds: f32,
    rng: &mut impl Rng,
    storm_coverage: f32, // Still used for negative feedback at extreme coverage
) -> Result<(), String> {
    let now = ctx.timestamp;
    let chunk_index = chunk_weather.chunk_index;
    let current_weather = chunk_weather.current_weather.clone();
    let seasonal_config = SeasonalWeatherConfig::for_season(&world_state.current_season);
    
    // === STEP 1: INTERIOR STABILITY CHECK ===
    // Chunks deep inside a weather front are extremely stable - skip most logic
    let is_interior = is_interior_chunk(ctx, chunk_index, &current_weather);
    
    if is_interior {
        // Interior chunks only change with very low probability (prevents permanent lockup)
        if rng.gen::<f32>() < INTERIOR_CHANGE_CHANCE {
            // Even interior chunks can slowly evolve - check neighbor consensus
            let inertia = get_weather_inertia(chunk_weather, now);
            if let Some(new_weather) = should_conform_to_neighbors(ctx, chunk_index, &current_weather, inertia, rng) {
                apply_weather_change(ctx, chunk_weather, new_weather, now, rng, &seasonal_config)?;
            }
        }
        // Update timestamp and return - interior chunks are stable
        chunk_weather.last_update = now;
        update_rain_intensity_visual(chunk_weather, now);
        ctx.db.chunk_weather().chunk_index().update(chunk_weather.clone());
        return Ok(());
    }
    
    // === STEP 2: EDGE CHUNK - CHECK NEIGHBOR CONSENSUS ===
    // Edge chunks (at boundaries between weather types) evolve based on neighbor majority
    let inertia = get_weather_inertia(chunk_weather, now);
    
    if let Some(new_weather) = should_conform_to_neighbors(ctx, chunk_index, &current_weather, inertia, rng) {
        // Chunk is conforming to neighbor consensus
        apply_weather_change(ctx, chunk_weather, new_weather, now, rng, &seasonal_config)?;
    } else {
        // === STEP 3: NUCLEATION - SPONTANEOUS WEATHER CHANGE ===
        // Very rare spontaneous weather changes in isolated areas (creates new fronts)
        let is_currently_rainy = !matches!(current_weather, WeatherType::Clear);
        
        // Apply seasonal modifier to nucleation chances
        let rain_nucleation_chance = SPONTANEOUS_RAIN_CHANCE * seasonal_config.rain_probability_multiplier;
        let clear_nucleation_chance = SPONTANEOUS_CLEAR_CHANCE * seasonal_config.decay_multiplier;
        
        // Negative feedback: reduce rain nucleation if coverage is very high
        let coverage_damper = if storm_coverage > 0.4 {
            1.0 / (1.0 + (storm_coverage - 0.4) * 3.0)
        } else {
            1.0
        };
        
        // Negative feedback: reduce clear nucleation if coverage is very low  
        let clear_coverage_boost = if storm_coverage < 0.2 {
            0.3 // Much less likely to clear if barely any rain
        } else {
            1.0
        };
        
        if !is_currently_rainy {
            // Currently clear - check for rain nucleation
            if can_nucleate_weather(ctx, chunk_index, true) {
                if rng.gen::<f32>() < rain_nucleation_chance * coverage_damper * (1.0 - inertia) {
                    // Nucleate rain! Use seasonal distribution for rain type
                    let rain_type = seasonal_config.select_rain_type(rng.gen::<f32>());
                    log::info!("🌧️ Rain nucleated in chunk {} ({:?}) - isolated area spawning new front", 
                              chunk_index, rain_type);
                    apply_weather_change(ctx, chunk_weather, rain_type, now, rng, &seasonal_config)?;
                }
            }
        } else {
            // Currently rainy - check for clear nucleation
            if can_nucleate_weather(ctx, chunk_index, false) {
                if rng.gen::<f32>() < clear_nucleation_chance * clear_coverage_boost * (1.0 - inertia) {
                    // Nucleate clearing!
                    log::info!("🌤️ Clear nucleated in chunk {} - isolated area spawning new clear front", chunk_index);
                    apply_weather_change(ctx, chunk_weather, WeatherType::Clear, now, rng, &seasonal_config)?;
                }
            }
        }
    }
    
    // === STEP 4: UPDATE VISUALS ===
    chunk_weather.last_update = now;
    update_rain_intensity_visual(chunk_weather, now);
    ctx.db.chunk_weather().chunk_index().update(chunk_weather.clone());
    
    // === STEP 5: PERIODIC STORM DEBRIS SPAWNING (HeavyStorm only) ===
    // Instead of ONLY waiting for storm to end, also spawn debris periodically DURING the storm.
    // This rewards players who build in storm zones - long-lasting fronts = more debris opportunities.
    // The storm_debris::spawn_storm_debris_on_beaches() function already checks if chunk is "picked clean"
    // so this won't spam debris - it only spawns if no existing debris is present.
    if matches!(chunk_weather.current_weather, WeatherType::HeavyStorm) {
        // ~0.8% chance per tick = roughly 1 spawn attempt every ~125 ticks
        // With 40 chunks processed per tick, storm chunks get checked frequently
        // Combined with "picked clean" check, this gives coastal storm bases ongoing debris
        const STORM_DEBRIS_PER_TICK_CHANCE: f32 = 0.008;
        
        if rng.gen::<f32>() < STORM_DEBRIS_PER_TICK_CHANCE {
            if let Err(e) = crate::storm_debris::spawn_storm_debris_on_beaches(ctx, chunk_index) {
                log::debug!("Periodic storm debris spawn failed for chunk {}: {}", chunk_index, e);
            }
        }
    }
    
    Ok(())
}

/// Applies a weather change to a chunk, handling all side effects
fn apply_weather_change(
    ctx: &ReducerContext,
    chunk_weather: &mut ChunkWeather,
    new_weather: WeatherType,
    now: spacetimedb::Timestamp,
    rng: &mut impl Rng,
    seasonal_config: &SeasonalWeatherConfig,
) -> Result<(), String> {
    let old_weather = chunk_weather.current_weather.clone();
    let chunk_index = chunk_weather.chunk_index;
    
    // Don't do anything if weather isn't actually changing
    if new_weather == old_weather {
        return Ok(());
    }
    
    chunk_weather.current_weather = new_weather.clone();
    chunk_weather.weather_start_time = Some(now);
    
    // Set appropriate duration and intensity
    match &new_weather {
        WeatherType::Clear => {
            chunk_weather.rain_intensity = 0.0;
            chunk_weather.weather_duration = None;
            chunk_weather.last_rain_end_time = Some(now);
            chunk_weather.last_thunder_time = None;
            chunk_weather.next_thunder_time = None;
            
            log::debug!("🌤️ Chunk {} changed from {:?} to Clear", chunk_index, old_weather);
        },
        rain_type => {
            let base_duration = rng.gen_range(MIN_RAIN_DURATION_SECONDS..=MAX_RAIN_DURATION_SECONDS);
            chunk_weather.weather_duration = Some(base_duration * seasonal_config.duration_multiplier);
            
            chunk_weather.rain_intensity = match rain_type {
                WeatherType::LightRain => rng.gen_range(0.2..=0.4),
                WeatherType::ModerateRain => rng.gen_range(0.5..=0.7),
                WeatherType::HeavyRain => rng.gen_range(0.8..=1.0),
                WeatherType::HeavyStorm => 1.0,
                _ => 0.0,
            };
            
            // Extinguish unprotected campfires in this chunk during heavy rain/storms
            if matches!(rain_type, WeatherType::HeavyRain | WeatherType::HeavyStorm) {
                if !matches!(old_weather, WeatherType::HeavyRain | WeatherType::HeavyStorm) {
                    // Only extinguish when transitioning INTO heavy weather
                    extinguish_campfires_in_chunk(ctx, chunk_index, rain_type)?;
                }
            }
            
            log::debug!("🌧️ Chunk {} changed from {:?} to {:?}", chunk_index, old_weather, rain_type);
        }
    }
    
    Ok(())
}

/// Updates rain intensity for visual variation (cosmetic only)
fn update_rain_intensity_visual(chunk_weather: &mut ChunkWeather, now: spacetimedb::Timestamp) {
    if let Some(start_time) = chunk_weather.weather_start_time {
        let elapsed = (now.to_micros_since_unix_epoch() - start_time.to_micros_since_unix_epoch()) as f32 / 1_000_000.0;
        let intensity_variation = (elapsed * 0.1).sin() * 0.1;
        
        let base_intensity = match chunk_weather.current_weather {
            WeatherType::Clear => 0.0,
            WeatherType::LightRain => 0.3,
            WeatherType::ModerateRain => 0.6,
            WeatherType::HeavyRain => 0.9,
            WeatherType::HeavyStorm => 1.0,
        };
        
        if base_intensity > 0.0 {
            chunk_weather.rain_intensity = (base_intensity + intensity_variation).max(0.1).min(1.0);
        }
    }
}

/// Extinguishes campfires in a specific chunk during heavy weather
fn extinguish_campfires_in_chunk(ctx: &ReducerContext, chunk_index: u32, weather_type: &WeatherType) -> Result<(), String> {
    let mut extinguished_count = 0;
    
    // Get chunk bounds
    let chunk_x = (chunk_index % WORLD_WIDTH_CHUNKS) as i32;
    let chunk_y = (chunk_index / WORLD_WIDTH_CHUNKS) as i32;
    let chunk_min_x = (chunk_x as f32) * crate::environment::CHUNK_SIZE_PX;
    let chunk_max_x = ((chunk_x + 1) as f32) * crate::environment::CHUNK_SIZE_PX;
    let chunk_min_y = (chunk_y as f32) * crate::environment::CHUNK_SIZE_PX;
    let chunk_max_y = ((chunk_y + 1) as f32) * crate::environment::CHUNK_SIZE_PX;
    
    for mut campfire in ctx.db.campfire().iter() {
        if !campfire.is_burning || campfire.is_destroyed {
            continue;
        }
        
        // Check if campfire is in this chunk
        if campfire.pos_x < chunk_min_x || campfire.pos_x >= chunk_max_x ||
           campfire.pos_y < chunk_min_y || campfire.pos_y >= chunk_max_y {
            continue;
        }
        
        // Check if campfire is protected
        let is_shelter_protected = is_campfire_inside_shelter(ctx, &campfire);
        let is_tree_protected = is_campfire_near_tree(ctx, &campfire);
        let is_protected = is_shelter_protected || is_tree_protected;
        
        if !is_protected {
            // Extinguish the campfire
            campfire.is_burning = false;
            campfire.current_fuel_def_id = None;
            campfire.remaining_fuel_burn_time_secs = None;
            
            crate::sound_events::stop_campfire_sound(ctx, campfire.id as u64);
            ctx.db.campfire().id().update(campfire.clone());
            ctx.db.campfire_processing_schedule().campfire_id().delete(campfire.id as u64);
            
            extinguished_count += 1;
        }
    }
    
    if extinguished_count > 0 {
        log::debug!("{:?} extinguished {} unprotected campfires in chunk {}", weather_type, extinguished_count, chunk_index);
    }
    
    Ok(())
}

// Helper function potentially needed later for client-side interpolation/lighting
pub fn get_light_intensity(progress: f32) -> f32 {
    // Simple sinusoidal model: peaks at noon (0.5 progress), troughs at midnight (0.0/1.0 progress)
    // Map progress [0, 1] to angle [0, 2*PI]
    let angle = progress * 2.0 * PI;
    // Use sin, shift phase so peak is at 0.5 progress (angle = PI)
    // sin(angle - PI/2) would peak at 0.5, but we want noon bright (intensity 1) and midnight dark (intensity 0)
    // Let's use a shifted cosine: cos(angle) peaks at 0 and 1. We want peak at 0.5.
    // cos(angle - PI) peaks at angle=PI (progress=0.5).
    // The range is [-1, 1]. We need [0, 1]. So (cos(angle - PI) + 1) / 2
    let intensity = (f32::cos(angle - PI) + 1.0) / 2.0;
    intensity.max(0.0).min(1.0) // Clamp just in case
}

/// Gets the current rain warmth drain modifier based on chunk weather and player position
/// This should be ADDED to the base warmth drain (stacks with time-of-day multipliers)
/// Returns 0.0 if player is protected by tree cover (within 100px of any tree)
pub fn get_rain_warmth_drain_modifier(ctx: &ReducerContext, player_x: f32, player_y: f32) -> f32 {
    use crate::player;
    
    // Get weather for the player's current chunk
    let chunk_weather = get_weather_for_position(ctx, player_x, player_y);
    
    log::debug!("Chunk {} weather: {:?}, rain intensity: {:.2}", chunk_weather.chunk_index, chunk_weather.current_weather, chunk_weather.rain_intensity);
    
    // If it's clear weather, no rain effect
    if chunk_weather.current_weather == WeatherType::Clear {
        return 0.0;
    }
    
    // Check if player is protected by tree cover using the status effect system
    // We need to find the player to get their identity
    let mut player_id_opt = None;
    for player in ctx.db.player().iter() {
        if (player.position_x - player_x).abs() < 1.0 && (player.position_y - player_y).abs() < 1.0 {
            player_id_opt = Some(player.identity);
            break;
        }
    }
    
    if let Some(player_id) = player_id_opt {
        let has_tree_cover = crate::active_effects::player_has_tree_cover_effect(ctx, player_id);
        
        if has_tree_cover {
            return 0.0; // Protected by tree cover, no rain warmth drain
        }
    }
    
    // Apply rain warmth drain based on chunk weather intensity
    let drain_amount = match chunk_weather.current_weather {
        WeatherType::Clear => 0.0,
        WeatherType::LightRain => WARMTH_DRAIN_RAIN_LIGHT,
        WeatherType::ModerateRain => WARMTH_DRAIN_RAIN_MODERATE,
        WeatherType::HeavyRain => WARMTH_DRAIN_RAIN_HEAVY,
        WeatherType::HeavyStorm => WARMTH_DRAIN_RAIN_STORM,
    };
    
    drain_amount
}

/// Extinguishes all campfires that are not protected by shelters or trees during heavy rain/storms
/// NOTE: This function is now deprecated in favor of chunk-based extinguishing
/// Kept for backward compatibility with debug_set_weather
fn extinguish_unprotected_campfires(ctx: &ReducerContext, weather_type: &WeatherType) -> Result<(), String> {
    // For global weather changes (debug), extinguish campfires in all chunks with heavy weather
    // In practice, chunk-based weather handles this automatically
    let mut extinguished_count = 0;
    
    for mut campfire in ctx.db.campfire().iter() {
        if !campfire.is_burning || campfire.is_destroyed {
            continue;
        }
        
        // Get weather for this campfire's chunk
        let chunk_weather = get_weather_for_position(ctx, campfire.pos_x, campfire.pos_y);
        
        // Only extinguish if this chunk has heavy weather
        if !matches!(chunk_weather.current_weather, WeatherType::HeavyRain | WeatherType::HeavyStorm) {
            continue;
        }
        
        // Check if campfire is protected
        let is_shelter_protected = is_campfire_inside_shelter(ctx, &campfire);
        let is_tree_protected = is_campfire_near_tree(ctx, &campfire);
        let is_protected = is_shelter_protected || is_tree_protected;
        
        if !is_protected {
            // Extinguish the campfire
            campfire.is_burning = false;
            campfire.current_fuel_def_id = None;
            campfire.remaining_fuel_burn_time_secs = None;
            
            crate::sound_events::stop_campfire_sound(ctx, campfire.id as u64);
            ctx.db.campfire().id().update(campfire.clone());
            ctx.db.campfire_processing_schedule().campfire_id().delete(campfire.id as u64);
            
            extinguished_count += 1;
        }
    }
    
    if extinguished_count > 0 {
        log::info!("{:?} extinguished {} unprotected campfires", weather_type, extinguished_count);
    }
    
    Ok(())
}

/// Checks if a campfire is inside any shelter (protected from rain)
fn is_campfire_inside_shelter(ctx: &ReducerContext, campfire: &Campfire) -> bool {
    for shelter in ctx.db.shelter().iter() {
        if shelter.is_destroyed {
            continue;
        }
        
        // Use the same shelter collision detection logic as in shelter.rs
        let shelter_aabb_center_x = shelter.pos_x;
        let shelter_aabb_center_y = shelter.pos_y - crate::shelter::SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y;
        let aabb_left = shelter_aabb_center_x - crate::shelter::SHELTER_AABB_HALF_WIDTH;
        let aabb_right = shelter_aabb_center_x + crate::shelter::SHELTER_AABB_HALF_WIDTH;
        let aabb_top = shelter_aabb_center_y - crate::shelter::SHELTER_AABB_HALF_HEIGHT;
        let aabb_bottom = shelter_aabb_center_y + crate::shelter::SHELTER_AABB_HALF_HEIGHT;
        
        // Check if campfire position is inside shelter AABB
        if campfire.pos_x >= aabb_left && campfire.pos_x <= aabb_right &&
           campfire.pos_y >= aabb_top && campfire.pos_y <= aabb_bottom {
            log::info!(
                "[ShelterRainProtection] Campfire {} at ({:.1}, {:.1}) IS PROTECTED by Shelter {} AABB",
                campfire.id, campfire.pos_x, campfire.pos_y, shelter.id
            );
            return true;
        } else {
            log::debug!(
                "[ShelterRainProtection] Campfire {} at ({:.1}, {:.1}) is NOT inside Shelter {} AABB",
                campfire.id, campfire.pos_x, campfire.pos_y, shelter.id
            );
        }
    }
    
    log::debug!(
        "[ShelterRainProtection] Campfire {} at ({:.1}, {:.1}) is NOT protected by any shelter",
        campfire.id, campfire.pos_x, campfire.pos_y
    );
    false
}

/// Checks if a campfire is within 100px of any tree (protected from rain by tree cover)
fn is_campfire_near_tree(ctx: &ReducerContext, campfire: &Campfire) -> bool {
    const TREE_PROTECTION_DISTANCE_SQ: f32 = 100.0 * 100.0; // 100px protection radius
    
    for tree in ctx.db.tree().iter() {
        // Skip destroyed trees (respawn_at > UNIX_EPOCH when tree is harvested)
        if tree.respawn_at > Timestamp::UNIX_EPOCH {
            continue;
        }
        
        // Calculate distance squared between campfire and tree
        let dx = campfire.pos_x - tree.pos_x;
        let dy = campfire.pos_y - tree.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        // Check if campfire is within protection distance of this tree
        if distance_sq <= TREE_PROTECTION_DISTANCE_SQ {
            return true;
        }
    }
    
    false
}

/// Gets the current season from the world state singleton
pub fn get_current_season(ctx: &ReducerContext) -> Result<Season, String> {
    let world_state = ctx.db.world_state().iter().next()
        .ok_or_else(|| "WorldState singleton not found".to_string())?;
    Ok(world_state.current_season)
}

/// Starts a gradual seasonal plant transition when the season changes
fn start_seasonal_plant_transition(ctx: &ReducerContext, new_season: &Season) -> Result<(), String> {
    log::info!("🌱 Starting seasonal plant transition to {:?}", new_season);
    
    // Clear any existing seasonal transition schedules
    for schedule in ctx.db.seasonal_plant_management_schedule().iter() {
        ctx.db.seasonal_plant_management_schedule().schedule_id().delete(schedule.schedule_id);
    }
    
    // Remove respawn timers from plants that can't grow in the new season
    let removed_count = remove_non_seasonal_plant_respawns(ctx, new_season)?;
    log::info!("🍂 Removed {} non-seasonal plant respawn timers", removed_count);
    
    // Calculate how many new plants we need to spawn for this season
    let target_new_plants = calculate_seasonal_plant_targets(ctx, new_season)?;
    log::info!("🌱 Planning to spawn {} new seasonal plants over time", target_new_plants);
    
    if target_new_plants > 0 {
        // Schedule gradual spawning over 10 minutes (10 batches, 1 minute apart)
        const TRANSITION_DURATION_MINUTES: u32 = 10;
        const SPAWN_INTERVAL_SECONDS: u64 = 60;
        let batch_size = (target_new_plants / TRANSITION_DURATION_MINUTES).max(1);
        
        for batch in 0..TRANSITION_DURATION_MINUTES {
            let delay_seconds = (batch as u64) * SPAWN_INTERVAL_SECONDS;
            let progress = (batch as f32) / (TRANSITION_DURATION_MINUTES as f32);
            let scheduled_time = ctx.timestamp + spacetimedb::TimeDuration::from_micros((delay_seconds * 1_000_000) as i64);
            
            crate::try_insert_schedule!(
                ctx.db.seasonal_plant_management_schedule(),
                SeasonalPlantManagementSchedule {
                    schedule_id: 0,
                    scheduled_at: spacetimedb::spacetimedb_lib::ScheduleAt::Time(scheduled_time),
                    transition_season: new_season.clone(),
                    transition_progress: progress,
                    spawn_batch_size: batch_size,
                },
                "Seasonal plant management"
            );
        }
    }
    
    Ok(())
}

/// Scheduled reducer that gradually spawns new seasonal plants
#[spacetimedb::reducer]
pub fn manage_seasonal_plants(ctx: &ReducerContext, args: SeasonalPlantManagementSchedule) -> Result<(), String> {
    // Security check
    if ctx.sender != ctx.identity() {
        return Err("Reducer manage_seasonal_plants may not be invoked by clients, only via scheduling.".into());
    }
    
    log::info!("🌱 Managing seasonal plants: {:?} batch (progress: {:.1}%, batch size: {})", 
              args.transition_season, args.transition_progress * 100.0, args.spawn_batch_size);
    
    // Spawn a batch of new seasonal plants
    let spawned_count = spawn_seasonal_plant_batch(ctx, &args.transition_season, args.spawn_batch_size)?;
    log::info!("🌿 Spawned {} new {:?} plants (batch progress: {:.1}%)", 
              spawned_count, args.transition_season, args.transition_progress * 100.0);
    
    Ok(())
}

/// Removes respawn timers from plants that can't grow in the new season
fn remove_non_seasonal_plant_respawns(ctx: &ReducerContext, new_season: &Season) -> Result<u32, String> {
    let mut removed_count = 0;
    
    // Get all harvestable resources with respawn timers
    for mut resource in ctx.db.harvestable_resource().iter() {
        if resource.respawn_at > Timestamp::UNIX_EPOCH {
            // Check if this plant can grow in the new season
            if !crate::plants_database::can_grow_in_season(&resource.plant_type, new_season) {
                // Remove the respawn timer - this plant won't come back until its season
                resource.respawn_at = Timestamp::UNIX_EPOCH; // 0 = not respawning
                ctx.db.harvestable_resource().id().update(resource);
                removed_count += 1;
            }
        }
    }
    
    Ok(removed_count)
}

/// Calculates how many new plants should be spawned for the new season
fn calculate_seasonal_plant_targets(ctx: &ReducerContext, new_season: &Season) -> Result<u32, String> {
    use crate::plants_database::{PLANT_CONFIGS, can_grow_in_season};
    use crate::{WORLD_WIDTH_TILES, WORLD_HEIGHT_TILES};
    
    let total_tiles = WORLD_WIDTH_TILES * WORLD_HEIGHT_TILES;
    let mut target_new_plants = 0;
    
    // Calculate how many plants we should have for each plant type in this season
    for (plant_type, config) in PLANT_CONFIGS.iter() {
        if can_grow_in_season(plant_type, new_season) {
            // Calculate expected count for this plant type
            let expected_count = (total_tiles as f32 * config.density_percent) as u32;
            
            // Count how many we currently have (active + respawning)
            let current_count = ctx.db.harvestable_resource().iter()
                .filter(|r| r.plant_type == *plant_type)
                .count() as u32;
            
            // Calculate how many more we need
            if current_count < expected_count {
                let needed = expected_count - current_count;
                target_new_plants += needed;
                log::debug!("🌱 {:?}: have {}, need {}, adding {}", 
                           plant_type, current_count, expected_count, needed);
            }
        }
    }
    
    Ok(target_new_plants)
}

/// Spawns a batch of new seasonal plants across the world
fn spawn_seasonal_plant_batch(ctx: &ReducerContext, season: &Season, batch_size: u32) -> Result<u32, String> {
    use crate::plants_database::{PLANT_CONFIGS, can_grow_in_season};
    use crate::environment::{calculate_chunk_index, validate_spawn_location};
    use crate::tree::tree as TreeTableTrait;
    use crate::stone::stone as StoneTableTrait;
    use crate::harvestable_resource::harvestable_resource as HarvestableResourceTableTrait;
    use crate::utils::attempt_single_spawn;
    use noise::{NoiseFn, Fbm, Perlin};
    use rand::{Rng, SeedableRng};
    use rand::rngs::StdRng;
    use std::collections::HashSet;
    
    let mut rng = StdRng::from_rng(ctx.rng()).map_err(|e| format!("Failed to seed RNG: {}", e))?;
    let fbm = Fbm::<Perlin>::new(ctx.rng().gen());
    
    // Get existing positions to avoid overlaps
    let tree_positions: Vec<(f32, f32)> = ctx.db.tree().iter()
        .map(|t| (t.pos_x, t.pos_y))
        .collect();
    let stone_positions: Vec<(f32, f32)> = ctx.db.stone().iter()
        .map(|s| (s.pos_x, s.pos_y))
        .collect();
    let mut occupied_tiles = HashSet::<(u32, u32)>::new();
    let mut spawned_positions = Vec::<(f32, f32)>::new();
    
    // Build a list of seasonal plants that can grow in this season
    let seasonal_plants: Vec<_> = PLANT_CONFIGS.iter()
        .filter(|(plant_type, _)| can_grow_in_season(plant_type, season))
        .collect();
    
    if seasonal_plants.is_empty() {
        return Ok(0);
    }
    
    let mut spawned_count = 0;
    let max_attempts = batch_size * 5; // Allow some failed attempts
    
    for attempt in 0..max_attempts {
        if spawned_count >= batch_size {
            break;
        }
        
        // Randomly select a plant type for this season
        let (plant_type, config) = seasonal_plants[rng.gen_range(0..seasonal_plants.len())];
        
        // Use the same spawning logic as the initial seeding
        match crate::utils::attempt_single_spawn(
            &mut rng,
            &mut occupied_tiles,
            &mut spawned_positions,
            &tree_positions,
            &stone_positions,
            5, crate::WORLD_WIDTH_TILES - 5, 5, crate::WORLD_HEIGHT_TILES - 5, // Spawn bounds
            &fbm,
            0.1, // noise frequency
            config.noise_threshold as f64,
            config.min_distance_sq,
            config.min_tree_distance_sq,
            config.min_stone_distance_sq,
            |pos_x, pos_y, _extra: ()| {
                let chunk_idx = calculate_chunk_index(pos_x, pos_y);
                crate::harvestable_resource::create_harvestable_resource(
                    *plant_type,
                    pos_x,
                    pos_y,
                    chunk_idx,
                    false // Mark as wild plant (not player-planted)
                )
            },
            (),
            |pos_x, pos_y| {
                // Block water for most plants, allow inland water for reeds
                let allow_water_spawn = matches!(config.spawn_condition, crate::plants_database::SpawnCondition::InlandWater);
                let water_blocked = if allow_water_spawn {
                    !crate::environment::is_position_on_inland_water(ctx, pos_x, pos_y)
                } else {
                    crate::environment::is_position_on_water(ctx, pos_x, pos_y)
                };
                
                water_blocked || !validate_spawn_location(
                    ctx, pos_x, pos_y, 
                    &config.spawn_condition,
                    &tree_positions, &stone_positions
                )
            },
            |_pos_x, _pos_y| config.noise_threshold as f64, // Base threshold for plants
            |_pos_x, _pos_y| config.min_distance_sq, // Base distance for plants
            ctx.db.harvestable_resource(),
        ) {
            Ok(true) => spawned_count += 1,
            Ok(false) => { /* Condition not met, continue */ }
            Err(_) => { /* Error already logged in helper, continue */ }
        }
    }
    
    Ok(spawned_count)
} 