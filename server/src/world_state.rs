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
// Fast-paced cycle for combat + survival game (Blazing Beaks + Rust style)
// 25-minute total cycle: 20 min day + 5 min night
// Players get 2-3 cycles per hour-long session, keeping action fast-paced
const DAY_DURATION_SECONDS: f32 = 1200.0; // 20 minutes  
const NIGHT_DURATION_SECONDS: f32 = 300.0;  // 5 minutes
const FULL_CYCLE_DURATION_SECONDS: f32 = DAY_DURATION_SECONDS + NIGHT_DURATION_SECONDS; // 25 minutes total

// Season duration constants for plant respawn calculations
pub const SEASON_DURATION_HOURS: f32 = 90.0 * 24.0; // 90 days per season * 24 hours per day = 2160 hours

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

// Rain warmth drain modifiers (additive with time-of-day multipliers)
pub(crate) const WARMTH_DRAIN_RAIN_LIGHT: f32 = 1.0;      // Light rain adds 1.0 per second
pub(crate) const WARMTH_DRAIN_RAIN_MODERATE: f32 = 2.0;   // Moderate rain adds 2.0 per second
pub(crate) const WARMTH_DRAIN_RAIN_HEAVY: f32 = 3.0;      // Heavy rain adds 3.0 per second
pub(crate) const WARMTH_DRAIN_RAIN_STORM: f32 = 4.0;      // Heavy storm adds 4.0 per second

// --- Weather Constants ---
// Aleutian islands are rainy but not constantly stormy - aim for ~40% rain coverage at any time
const MIN_RAIN_DURATION_SECONDS: f32 = 300.0; // 5 minutes
const MAX_RAIN_DURATION_SECONDS: f32 = 900.0; // 15 minutes
const RAIN_PROBABILITY_BASE: f32 = 0.25; // 25% base chance per day (reduced from 60% - was too aggressive)
const RAIN_PROBABILITY_SEASONAL_MODIFIER: f32 = 0.15; // Additional variability
const MIN_TIME_BETWEEN_RAIN_CYCLES: f32 = 900.0; // 15 minutes minimum between rain events (increased from 10 - give more clear time)

// Weather variation constants
// These values are tuned to create realistic weather fronts with good regional variation:
// - More chunks updated per tick = faster weather changes across the map
// - Longer propagation distance = weather fronts can spread further (more realistic)
// - Distance decay = nearby chunks more likely to share weather, distant chunks less likely
// - Lower base propagation = weather doesn't spread too uniformly, preserving regional differences
const CHUNKS_PER_UPDATE: usize = 50; // Increased from 20 - process more chunks per tick for faster variation
const WEATHER_PROPAGATION_DISTANCE: u32 = 2; // Increased from 1 - weather can spread to chunks 2 away (more realistic fronts)
const WEATHER_PROPAGATION_DECAY: f32 = 0.5; // Each distance step reduces propagation chance by 50% (distance 1 = 100%, distance 2 = 50%)

#[derive(Clone, Debug, PartialEq, spacetimedb::SpacetimeType)]
pub enum WeatherType {
    Clear,
    LightRain,
    ModerateRain,
    HeavyRain,
    HeavyStorm, // Intense rain with thunder and lightning
}

#[derive(Clone, Debug, PartialEq, spacetimedb::SpacetimeType)]
pub enum Season {
    Spring,  // Days 1-90 (March 20 - June 20)
    Summer,  // Days 91-180 (June 21 - September 20)
    Autumn,  // Days 181-270 (September 21 - December 20)
    Winter,  // Days 271-360 (December 21 - March 19)
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

    let cutoff_time = ctx.timestamp - TimeDuration::from_micros(3_000_000); // 3 seconds ago
    
    let thunder_events_table = ctx.db.thunder_event();
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
    pub day_of_year: u32, // 1-360 in our perfect calendar
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
            scheduled_at: cleanup_interval.into(), // Periodic cleanup
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

/// Propagates weather from one chunk to nearby chunks (weather fronts)
/// Stronger weather has higher propagation chance
fn propagate_weather_to_nearby_chunks(
    ctx: &ReducerContext,
    source_chunk_index: u32,
    source_weather: &WeatherType,
    mut rng: &mut impl Rng,
) -> Result<(), String> {
    // Base propagation probability based on weather intensity
    // Lower values = weather fronts spread slower = more regional variation = more clear areas
    let base_propagation_chance = match source_weather {
        WeatherType::Clear => 0.0,          // Clear weather doesn't propagate
        WeatherType::LightRain => 0.05,     // 5% - spreads slowly, creates patchy rain
        WeatherType::ModerateRain => 0.10,  // 10% - moderate spread
        WeatherType::HeavyRain => 0.18,     // 18% - spreads more but not overwhelming
        WeatherType::HeavyStorm => 0.30,    // 30% - storms spread noticeably but are rare
    };
    
    if base_propagation_chance == 0.0 {
        return Ok(());
    }
    
    // Get nearby chunks up to WEATHER_PROPAGATION_DISTANCE away
    let nearby_chunks = get_nearby_chunk_indices(source_chunk_index, WEATHER_PROPAGATION_DISTANCE);
    
    for (nearby_index, distance) in nearby_chunks {
        // Apply distance decay: each step reduces chance by WEATHER_PROPAGATION_DECAY
        let distance_multiplier = WEATHER_PROPAGATION_DECAY.powi(distance as i32 - 1);
        let propagation_chance = base_propagation_chance * distance_multiplier;
        
        // Check if we should propagate to this chunk
        if rng.gen::<f32>() < propagation_chance {
            let mut nearby_weather = get_or_create_chunk_weather(ctx, nearby_index);
            
            // Only propagate if the nearby chunk has Clear weather or weaker weather
            let should_propagate = match (&nearby_weather.current_weather, source_weather) {
                (WeatherType::Clear, _) => true, // Always propagate to clear chunks
                (WeatherType::LightRain, WeatherType::ModerateRain | WeatherType::HeavyRain | WeatherType::HeavyStorm) => true,
                (WeatherType::ModerateRain, WeatherType::HeavyRain | WeatherType::HeavyStorm) => true,
                (WeatherType::HeavyRain, WeatherType::HeavyStorm) => true,
                _ => false, // Don't overwrite stronger weather
            };
            
            if should_propagate {
                // Propagate weather (but slightly weaker)
                let propagated_weather = match source_weather {
                    WeatherType::HeavyStorm => {
                        // 80% chance to stay HeavyStorm, 20% to become HeavyRain
                        if rng.gen::<f32>() < 0.8 {
                            WeatherType::HeavyStorm
                        } else {
                            WeatherType::HeavyRain
                        }
                    }
                    WeatherType::HeavyRain => {
                        // 70% chance to stay HeavyRain, 30% to become ModerateRain
                        if rng.gen::<f32>() < 0.7 {
                            WeatherType::HeavyRain
                        } else {
                            WeatherType::ModerateRain
                        }
                    }
                    WeatherType::ModerateRain => {
                        // 60% chance to stay ModerateRain, 40% to become LightRain
                        if rng.gen::<f32>() < 0.6 {
                            WeatherType::ModerateRain
                        } else {
                            WeatherType::LightRain
                        }
                    }
                    _ => source_weather.clone(), // LightRain propagates as-is
                };
                
                nearby_weather.current_weather = propagated_weather.clone();
                nearby_weather.rain_intensity = match propagated_weather {
                    WeatherType::Clear => 0.0,
                    WeatherType::LightRain => rng.gen_range(0.2..=0.4),
                    WeatherType::ModerateRain => rng.gen_range(0.5..=0.7),
                    WeatherType::HeavyRain => rng.gen_range(0.8..=1.0),
                    WeatherType::HeavyStorm => 1.0,
                };
                nearby_weather.weather_start_time = Some(ctx.timestamp);
                nearby_weather.weather_duration = Some(rng.gen_range(MIN_RAIN_DURATION_SECONDS..=MAX_RAIN_DURATION_SECONDS));
                nearby_weather.last_update = ctx.timestamp;
                
                // Thunder/lightning disabled for now
                // TODO: Re-enable thunder system after debugging
                
                ctx.db.chunk_weather().chunk_index().update(nearby_weather);
                
                log::debug!("Weather propagated from chunk {} to chunk {}: {:?}", 
                           source_chunk_index, nearby_index, propagated_weather);
            }
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
            if next_day > 360 { // New year starts
                let next_year = world_state.year + 1;
                log::info!("New year started! Year {} -> Year {}", world_state.year, next_year);
                (1, next_year, calculate_season(1)) // Start new year with day 1
            } else {
                let season = calculate_season(next_day);
                if season != world_state.current_season {
                    log::info!("Season changed from {:?} to {:?} on day {} of year {}", 
                              world_state.current_season, season, next_day, world_state.year);
                    
                    // SEASONAL TRANSITION: Start gradual plant transition
                    if let Err(e) = start_seasonal_plant_transition(ctx, &season) {
                        log::error!("Failed to start seasonal plant transition: {}", e);
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

/// Calculates the current season based on day of year (1-360)
/// Perfect calendar: Spring (1-90), Summer (91-180), Autumn (181-270), Winter (271-360)
fn calculate_season(day_of_year: u32) -> Season {
    match day_of_year {
        1..=90 => Season::Spring,   // Days 1-90 (March 20 - June 20)
        91..=180 => Season::Summer, // Days 91-180 (June 21 - September 20)
        181..=270 => Season::Autumn, // Days 181-270 (September 21 - December 20)
        271..=360 => Season::Winter, // Days 271-360 (December 21 - March 19)
        _ => Season::Spring, // Fallback, though this shouldn't happen with our 360-day year
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
    
    // If no chunks have weather yet, initialize weather for multiple random chunks to seed the system
    // This creates multiple weather fronts across the map for more variation
    if all_chunk_weather.is_empty() {
        // Initialize weather for multiple random chunks scattered across the map
        // Use ~1% of total chunks to seed weather fronts (but cap at reasonable number)
        let total_chunks = WORLD_WIDTH_CHUNKS * WORLD_HEIGHT_CHUNKS;
        let chunks_to_init = (total_chunks / 100).max(20).min(100); // 1% of chunks, min 20, max 100
        
        for _ in 0..chunks_to_init {
            let chunk_x = rng.gen_range(0..WORLD_WIDTH_CHUNKS);
            let chunk_y = rng.gen_range(0..WORLD_HEIGHT_CHUNKS);
            let chunk_index = chunk_y * WORLD_WIDTH_CHUNKS + chunk_x;
            let mut chunk_weather = get_or_create_chunk_weather(ctx, chunk_index);
            
            // Start with rain in some chunks (20% chance) to create immediate variation
            // This gives ~20% rain coverage at game start, which will naturally evolve
            if rng.gen::<f32>() < 0.2 {
                let rain_type = match rng.gen::<f32>() {
                    x if x < 0.60 => WeatherType::LightRain,      // 60% of rain is light
                    x if x < 0.85 => WeatherType::ModerateRain,   // 25% moderate
                    x if x < 0.98 => WeatherType::HeavyRain,      // 13% heavy
                    _ => WeatherType::HeavyStorm,                 // 2% storm
                };
                
                chunk_weather.current_weather = rain_type.clone();
                chunk_weather.rain_intensity = match rain_type {
                    WeatherType::LightRain => rng.gen_range(0.2..=0.4),
                    WeatherType::ModerateRain => rng.gen_range(0.5..=0.7),
                    WeatherType::HeavyRain => rng.gen_range(0.8..=1.0),
                    WeatherType::HeavyStorm => 1.0,
                    _ => 0.0,
                };
                chunk_weather.weather_start_time = Some(now);
                chunk_weather.weather_duration = Some(rng.gen_range(MIN_RAIN_DURATION_SECONDS..=MAX_RAIN_DURATION_SECONDS));
                chunk_weather.last_update = now;
                
                ctx.db.chunk_weather().chunk_index().update(chunk_weather);
            }
        }
        
        log::info!("Initialized weather system with {} seed chunks", chunks_to_init);
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
            update_single_chunk_weather(ctx, &mut chunk_weather, world_state, elapsed_seconds, &mut rng)?;
            
            // Propagate weather to nearby chunks
            propagate_weather_to_nearby_chunks(ctx, chunk_index, &chunk_weather.current_weather, &mut rng)?;
        }
    }
    
    // Update ALL rain collectors every tick (not just in selected chunks)
    // This ensures real-time updates like broth pots/campfires
    update_all_rain_collectors(ctx, elapsed_seconds)?;
    
    Ok(())
}

/// Updates weather for a single chunk
fn update_single_chunk_weather(
    ctx: &ReducerContext,
    chunk_weather: &mut ChunkWeather,
    world_state: &WorldState,
    elapsed_seconds: f32,
    rng: &mut impl Rng,
) -> Result<(), String> {
    let now = ctx.timestamp;
    
    match chunk_weather.current_weather {
        WeatherType::Clear => {
            // Check if we should start rain
            let should_check_rain = if let Some(last_rain_end) = chunk_weather.last_rain_end_time {
                let time_since_last_rain = (now.to_micros_since_unix_epoch() - last_rain_end.to_micros_since_unix_epoch()) as f32 / 1_000_000.0;
                time_since_last_rain >= MIN_TIME_BETWEEN_RAIN_CYCLES
            } else {
                true // No previous rain recorded
            };
            
            if should_check_rain {
                // Calculate rain probability based on time of day and cycle
                let time_modifier = match world_state.time_of_day {
                    TimeOfDay::Dawn | TimeOfDay::Dusk => 1.3, // Higher chance during transitions
                    TimeOfDay::TwilightMorning | TimeOfDay::TwilightEvening => 1.2,
                    TimeOfDay::Night | TimeOfDay::Midnight => 1.1, // Slightly higher at night
                    _ => 1.0,
                };
                
                // Seasonal variation based on cycle count
                let seasonal_modifier = 1.0 + (world_state.cycle_count as f32 * 0.1).sin() * RAIN_PROBABILITY_SEASONAL_MODIFIER;
                
                let rain_probability = RAIN_PROBABILITY_BASE * time_modifier * seasonal_modifier * elapsed_seconds / FULL_CYCLE_DURATION_SECONDS;
                
                if rng.gen::<f32>() < rain_probability {
                    // Start rain! Distribution favors lighter rain (realistic for Aleutian islands)
                    let rain_type = match rng.gen::<f32>() {
                        x if x < 0.50 => WeatherType::LightRain,      // 50% - most common
                        x if x < 0.80 => WeatherType::ModerateRain,   // 30% - fairly common
                        x if x < 0.97 => WeatherType::HeavyRain,      // 17% - occasional
                        _ => WeatherType::HeavyStorm,                 // 3% - rare and dramatic
                    };
                    
                    let rain_duration = rng.gen_range(MIN_RAIN_DURATION_SECONDS..=MAX_RAIN_DURATION_SECONDS);
                    let rain_intensity = match rain_type {
                        WeatherType::LightRain => rng.gen_range(0.2..=0.4),
                        WeatherType::ModerateRain => rng.gen_range(0.5..=0.7),
                        WeatherType::HeavyRain => rng.gen_range(0.8..=1.0),
                        WeatherType::HeavyStorm => 1.0, // Maximum intensity
                        _ => 0.0,
                    };
                    
                    chunk_weather.current_weather = rain_type.clone();
                    chunk_weather.rain_intensity = rain_intensity;
                    chunk_weather.weather_start_time = Some(now);
                    chunk_weather.weather_duration = Some(rain_duration);
                    chunk_weather.last_update = now;
                    
                    // Thunder/lightning disabled for now
                    // TODO: Re-enable thunder system after debugging
                    
                    // Extinguish unprotected campfires in this chunk during heavy rain/storms
                    if matches!(rain_type, WeatherType::HeavyRain | WeatherType::HeavyStorm) {
                        extinguish_campfires_in_chunk(ctx, chunk_weather.chunk_index, &rain_type)?;
                    }
                    
                    // Update the chunk weather
                    ctx.db.chunk_weather().chunk_index().update(chunk_weather.clone());
                }
            }
        },
        WeatherType::LightRain | WeatherType::ModerateRain | WeatherType::HeavyRain | WeatherType::HeavyStorm => {
            // Check if rain should end
            if let (Some(start_time), Some(duration)) = (chunk_weather.weather_start_time, chunk_weather.weather_duration) {
                let rain_elapsed = (now.to_micros_since_unix_epoch() - start_time.to_micros_since_unix_epoch()) as f32 / 1_000_000.0;
                
                if rain_elapsed >= duration {
                    // End rain
                    chunk_weather.current_weather = WeatherType::Clear;
                    chunk_weather.rain_intensity = 0.0;
                    chunk_weather.weather_start_time = None;
                    chunk_weather.weather_duration = None;
                    chunk_weather.last_rain_end_time = Some(now);
                    chunk_weather.last_thunder_time = None;
                    chunk_weather.next_thunder_time = None;
                    chunk_weather.last_update = now;
                    
                    ctx.db.chunk_weather().chunk_index().update(chunk_weather.clone());
                } else {
                    // Thunder/lightning disabled for now
                    // TODO: Re-enable thunder system after debugging
                    
                    // Optionally vary intensity slightly during rain
                    let intensity_variation = (rain_elapsed * 0.1).sin() * 0.1;
                    let base_intensity = match chunk_weather.current_weather {
                        WeatherType::LightRain => 0.3,
                        WeatherType::ModerateRain => 0.6,
                        WeatherType::HeavyRain => 0.9,
                        WeatherType::HeavyStorm => 1.0,
                        _ => 0.0,
                    };
                    chunk_weather.rain_intensity = (base_intensity + intensity_variation).max(0.1).min(1.0);
                    chunk_weather.last_update = now;
                    
                    ctx.db.chunk_weather().chunk_index().update(chunk_weather.clone());
                }
            }
        },
    }
    
    Ok(())
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
        // Skip destroyed trees (respawn_at is set when tree is harvested)
        if tree.respawn_at.is_some() {
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
            
            match ctx.db.seasonal_plant_management_schedule().try_insert(SeasonalPlantManagementSchedule {
                schedule_id: 0, // auto_inc
                scheduled_at: spacetimedb::TimeDuration::from_micros((delay_seconds * 1_000_000) as i64).into(),
                transition_season: new_season.clone(),
                transition_progress: progress,
                spawn_batch_size: batch_size,
            }) {
                Ok(_) => {
                    log::info!("🕒 Scheduled plant spawn batch {} at +{}s (progress: {:.1}%)", 
                              batch + 1, delay_seconds, progress * 100.0);
                }
                Err(e) => {
                    log::error!("Failed to schedule plant spawn batch {}: {}", batch + 1, e);
                }
            }
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
        if resource.respawn_at.is_some() {
            // Check if this plant can grow in the new season
            if !crate::plants_database::can_grow_in_season(&resource.plant_type, new_season) {
                // Remove the respawn timer - this plant won't come back until its season
                resource.respawn_at = None;
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
            ctx.db.harvestable_resource(),
        ) {
            Ok(true) => spawned_count += 1,
            Ok(false) => { /* Condition not met, continue */ }
            Err(_) => { /* Error already logged in helper, continue */ }
        }
    }
    
    Ok(spawned_count)
} 