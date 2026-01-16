/******************************************************************************
 *                                                                            *
 * Hostile NPC Spawning System                                               *
 *                                                                            *
 * Handles spawning of hostile NPCs (Shorebound, Shardkin, DrownedWatch)     *
 * at night and despawning them at dawn.                                     *
 *                                                                            *
 * Key features:                                                              *
 * - Spawn only during night (Dusk, Night)                                  *
 * - Spawn in rings around players (outside viewport)                        *
 * - Despawn all hostiles at dawn over 10-15 seconds                        *
 * - Respect runestone deterrence radius                                     *
 * - Never spawn inside player structures                                    *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{table, reducer, ReducerContext, Timestamp, Table, ScheduleAt, TimeDuration};
use std::f32::consts::PI;
use log;
use rand::{Rng, SeedableRng};

use crate::{Player, WORLD_WIDTH_PX, WORLD_HEIGHT_PX, TILE_SIZE_PX};
use crate::utils::get_distance_squared;
use crate::environment::calculate_chunk_index;
use crate::world_state::{TimeOfDay, world_state as WorldStateTableTrait};
use crate::rune_stone::{rune_stone as RuneStoneTableTrait, RUNE_STONE_DETERRENCE_RADIUS};
use crate::building::{
    foundation_cell as FoundationCellTableTrait,
    FOUNDATION_TILE_SIZE_PX,
};
use crate::building_enclosure::is_position_inside_building;
use crate::animal_collision::validate_animal_spawn_position;

use super::core::{
    WildAnimal, AnimalSpecies, AnimalState, MovementPattern, AnimalBehavior,
    wild_animal as WildAnimalTableTrait,
};

// Table trait imports
use crate::player as PlayerTableTrait;
use crate::active_connection as ActiveConnectionTableTrait;

// Settlement intensity table imports
use crate::planted_seeds::planted_seed as PlantedSeedTableTrait;
use crate::harvestable_resource::harvestable_resource as HarvestableResourceTableTrait;
use crate::campfire::campfire as CampfireTableTrait;
use crate::furnace::furnace as FurnaceTableTrait;
use crate::barbecue::barbecue as BarbecueTableTrait;
use crate::wooden_storage_box::wooden_storage_box as WoodenStorageBoxTableTrait;
use crate::shelter::shelter as ShelterTableTrait;
use crate::lantern::lantern as LanternTableTrait;

// --- Constants ---

const TILE_SIZE: f32 = TILE_SIZE_PX as f32;

// Spawn distance bands (in tiles, converted to pixels)
// TUNED: Reduced distances so enemies actually reach the player during night
// A laptop viewport is ~1920x1080 = 40x22 tiles, half = 20x11 tiles from center
const RING_A_MAX_TILES: f32 = 12.0;  // No-spawn zone: 0-12 tiles (keeps immediate area clear)
const RING_B_MIN_TILES: f32 = 13.0;  // Primary spawn: 13-22 tiles (just outside viewport)
const RING_B_MAX_TILES: f32 = 22.0;
const RING_C_MIN_TILES: f32 = 23.0;  // Distant pressure: 23-35 tiles
const RING_C_MAX_TILES: f32 = 35.0;

const RING_A_MAX_PX: f32 = RING_A_MAX_TILES * TILE_SIZE;
const RING_B_MIN_PX: f32 = RING_B_MIN_TILES * TILE_SIZE;
const RING_B_MAX_PX: f32 = RING_B_MAX_TILES * TILE_SIZE;
const RING_C_MIN_PX: f32 = RING_C_MIN_TILES * TILE_SIZE;
const RING_C_MAX_PX: f32 = RING_C_MAX_TILES * TILE_SIZE;

// Population caps (per player area) - Increased for better night intensity
const MAX_TOTAL_HOSTILES_NEAR_PLAYER: usize = 12;   // Slightly higher cap for more action
const MAX_SHOREBOUND_NEAR_PLAYER: usize = 4;        // Maximum 4 stalkers
const MAX_SHARDKIN_NEAR_PLAYER: usize = 8;          // Medium swarms
const MAX_DROWNED_WATCH_NEAR_PLAYER: usize = 2;     // Up to 2 brutes for intense fights

// Spawn timing - Faster spawning for more constant pressure
const SPAWN_ATTEMPT_INTERVAL_MS: u64 = 6_000; // Every 6 seconds

// Shardkin group spawn sizes - Slightly larger groups
const SHARDKIN_GROUP_MIN: u32 = 2;
const SHARDKIN_GROUP_MAX: u32 = 5;  // Medium swarms

// Dawn cleanup
const DAWN_CLEANUP_CHECK_INTERVAL_MS: u64 = 2000; // Check every 2 seconds during dawn cleanup
const DAWN_CLEANUP_DURATION_MS: u64 = 12000; // Clean up over 12 seconds

// Runestone deterrence radius squared (matches light radius, not economic zone)
const RUNESTONE_DETERRENCE_RADIUS_SQ: f32 = RUNE_STONE_DETERRENCE_RADIUS * RUNE_STONE_DETERRENCE_RADIUS;

// Camping detection constants
const CAMPING_STATIONARY_TIME_MS: i64 = 60_000; // 60 seconds stationary = camping
const CAMPING_MOVEMENT_THRESHOLD_PX: f32 = 500.0; // Must move 500px (~10 tiles) to reset camping timer
                                                   // This allows movement within a medium-sized base (4-5 foundations)

// Settlement intensity constants
// The more valuable structures near a player, the more apparitions are attracted
const SETTLEMENT_CHECK_RADIUS_PX: f32 = 1500.0; // ~31 tiles - check within this radius
const SETTLEMENT_CHECK_RADIUS_SQ: f32 = SETTLEMENT_CHECK_RADIUS_PX * SETTLEMENT_CHECK_RADIUS_PX;

// Settlement intensity thresholds and multipliers
// Solo player with nothing: 0.6x spawn rate (easier start)
// Small camp (few structures): 1.0x (baseline)
// Medium settlement: 1.3x
// Large settlement with multiple players: 1.6x+
const BASE_SETTLEMENT_MULTIPLIER: f32 = 0.6; // Start low for new/solo players
const MAX_SETTLEMENT_MULTIPLIER: f32 = 2.0;  // Cap at 2x to prevent overwhelming spawns

// Value weights for different structure types (apparitions are drawn to civilization)
const VALUE_PLANTED_CROP: f32 = 3.0;      // Growing crops are valuable targets
const VALUE_MATURE_CROP: f32 = 2.0;       // Harvestable player-planted resources
const VALUE_STORAGE: f32 = 5.0;           // Storage boxes attract attention
const VALUE_FURNACE: f32 = 4.0;           // Industrial structures
const VALUE_COOKING: f32 = 3.0;           // Campfires, barbecues
const VALUE_SHELTER: f32 = 4.0;           // Player shelters
const VALUE_FOUNDATION: f32 = 1.0;        // Building foundations (capped)
const VALUE_PER_NEARBY_PLAYER: f32 = 15.0; // Each additional player adds significant value
const MAX_FOUNDATION_VALUE: f32 = 10.0;   // Cap foundation contribution to avoid wall spam

// Settlement value thresholds
const SETTLEMENT_VALUE_FOR_BASELINE: f32 = 20.0;  // This much value = 1.0x multiplier
const SETTLEMENT_VALUE_FOR_MAX: f32 = 100.0;      // This much value = max multiplier

// ============================================================================
// NIGHT PHASE SYSTEM - Creates tension arc through the night
// ============================================================================
// With 30-min cycle (20 day + 10 night), night phases create dramatic tension:
// - Early Night (Dusk/TwilightEvening 0.72-0.82): ~3.3 min - Tension builds, scouts appear
// - Peak Night (Night 0.82-0.92): ~3.3 min - Maximum pressure, swarms and stalkers
// - Desperate Hour (Midnight/TwilightMorning 0.92-1.0): ~2.6 min - Final push, brutes emerge
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum NightPhase {
    EarlyNight,    // 0.72-0.82: Tension building, scouts probe defenses
    PeakNight,     // 0.82-0.92: Maximum pressure, swarms attack
    DesperateHour, // 0.92-1.0: Final push before dawn, brutes emerge
    NotNight,      // Daytime - no spawning
}

impl NightPhase {
    pub fn from_progress(progress: f32) -> Self {
        // Night cycle: Dusk (0.72) -> TwilightEvening (0.76) -> Night (0.80) -> Midnight (0.92) -> TwilightMorning (0.97) -> Dawn (0.0)
        // Dawn (0.0-0.05) is MORNING - no spawning!
        // TwilightMorning (0.97-1.0) is the final night phase before dawn
        match progress {
            p if p >= 0.72 && p < 0.82 => NightPhase::EarlyNight,   // Dusk + TwilightEvening + early Night
            p if p >= 0.82 && p < 0.92 => NightPhase::PeakNight,    // Night
            p if p >= 0.92 => NightPhase::DesperateHour,            // Midnight + TwilightMorning (0.92-1.0)
            // IMPORTANT: p < 0.72 (including 0.0-0.05 Dawn) is NotNight - NO spawning!
            _ => NightPhase::NotNight,
        }
    }
    
    /// Get spawn rate multipliers for this phase - BALANCED spawning
    /// Returns (shorebound_mult, shardkin_mult, drowned_watch_mult)
    pub fn get_spawn_multipliers(&self) -> (f32, f32, f32) {
        match self {
            // Early Night: Build up tension - scouts appear
            NightPhase::EarlyNight => (0.7, 0.6, 0.0),      // Good pressure, no brutes yet
            // Peak Night: Full pressure
            NightPhase::PeakNight => (1.0, 1.0, 0.6),       // Full spawn rate, brutes emerge
            // Desperate Hour: Maximum intensity before dawn
            NightPhase::DesperateHour => (1.0, 1.0, 1.0),   // Everything at full
            NightPhase::NotNight => (0.0, 0.0, 0.0),
        }
    }
    
    pub fn name(&self) -> &'static str {
        match self {
            NightPhase::EarlyNight => "Early Night",
            NightPhase::PeakNight => "Peak Night", 
            NightPhase::DesperateHour => "Desperate Hour",
            NightPhase::NotNight => "Daytime",
        }
    }
}

// ============================================================================
// SETTLEMENT INTENSITY SYSTEM - More civilization = more apparition attention
// ============================================================================
// Apparitions are drawn to signs of life and civilization. A lone survivor
// with a campfire faces less pressure than a thriving settlement with farms,
// storage, and multiple residents. This creates a risk/reward dynamic:
// - Frontier living: Safer but less productive
// - Settlement building: More rewarding but attracts more danger
//
// PERFORMANCE: Uses chunk-based queries to avoid O(n) full table scans.
// Only queries chunks within SETTLEMENT_CHECK_RADIUS of the player.
// ============================================================================

use crate::environment::{CHUNK_SIZE_PX, WORLD_WIDTH_CHUNKS, WORLD_HEIGHT_CHUNKS};

/// Get all chunk indices within the settlement check radius of a position
/// Returns a Vec of chunk indices to query (typically 9-25 chunks)
fn get_nearby_chunk_indices(player_x: f32, player_y: f32) -> Vec<u32> {
    // Calculate how many chunks the radius spans
    let chunks_radius = (SETTLEMENT_CHECK_RADIUS_PX / CHUNK_SIZE_PX).ceil() as i32;
    
    // Get player's chunk coordinates
    let player_chunk_x = (player_x / CHUNK_SIZE_PX) as i32;
    let player_chunk_y = (player_y / CHUNK_SIZE_PX) as i32;
    
    let mut chunks = Vec::with_capacity(((chunks_radius * 2 + 1) * (chunks_radius * 2 + 1)) as usize);
    
    for dy in -chunks_radius..=chunks_radius {
        for dx in -chunks_radius..=chunks_radius {
            let chunk_x = player_chunk_x + dx;
            let chunk_y = player_chunk_y + dy;
            
            // Bounds check
            if chunk_x >= 0 && chunk_x < WORLD_WIDTH_CHUNKS as i32 &&
               chunk_y >= 0 && chunk_y < WORLD_HEIGHT_CHUNKS as i32 {
                let chunk_idx = (chunk_y as u32) * WORLD_WIDTH_CHUNKS + (chunk_x as u32);
                chunks.push(chunk_idx);
            }
        }
    }
    
    chunks
}

/// Calculate settlement intensity multiplier based on nearby valuable structures
/// Returns a multiplier from BASE_SETTLEMENT_MULTIPLIER to MAX_SETTLEMENT_MULTIPLIER
/// 
/// PERFORMANCE: O(chunks * items_per_chunk) instead of O(all_items)
/// Uses chunk_index btree queries and early exit optimization.
fn calculate_settlement_intensity(
    ctx: &ReducerContext,
    player_x: f32,
    player_y: f32,
    nearby_player_count: usize,
) -> f32 {
    let mut total_value: f32 = 0.0;
    
    // Pre-calculate nearby chunks once
    let nearby_chunks = get_nearby_chunk_indices(player_x, player_y);
    
    // Macro to check distance and add value (reduces code duplication)
    macro_rules! check_distance_add_value {
        ($pos_x:expr, $pos_y:expr, $value:expr) => {{
            let dx = $pos_x - player_x;
            let dy = $pos_y - player_y;
            if dx * dx + dy * dy <= SETTLEMENT_CHECK_RADIUS_SQ {
                total_value += $value;
                // Early exit if we've hit max value
                if total_value >= SETTLEMENT_VALUE_FOR_MAX {
                    return calculate_final_multiplier(total_value, nearby_player_count);
                }
            }
        }};
    }
    
    // Count planted seeds (growing crops) - uses chunk_index
    for chunk_idx in &nearby_chunks {
        for seed in ctx.db.planted_seed().chunk_index().filter(chunk_idx) {
            check_distance_add_value!(seed.pos_x, seed.pos_y, VALUE_PLANTED_CROP);
        }
    }
    
    // Count player-planted harvestable resources (mature crops) - uses chunk_index
    for chunk_idx in &nearby_chunks {
        for resource in ctx.db.harvestable_resource().chunk_index().filter(chunk_idx) {
            if resource.is_player_planted && resource.respawn_at == spacetimedb::Timestamp::UNIX_EPOCH {
                check_distance_add_value!(resource.pos_x, resource.pos_y, VALUE_MATURE_CROP);
            }
        }
    }
    
    // Count campfires - uses chunk_index
    for chunk_idx in &nearby_chunks {
        for campfire in ctx.db.campfire().chunk_index().filter(chunk_idx) {
            if !campfire.is_destroyed {
                check_distance_add_value!(campfire.pos_x, campfire.pos_y, VALUE_COOKING);
            }
        }
    }
    
    // Count storage boxes - uses chunk_index
    for chunk_idx in &nearby_chunks {
        for storage in ctx.db.wooden_storage_box().chunk_index().filter(chunk_idx) {
            if !storage.is_destroyed {
                check_distance_add_value!(storage.pos_x, storage.pos_y, VALUE_STORAGE);
            }
        }
    }
    
    // Count shelters - full table scan (typically very few shelters, no btree index)
    for shelter in ctx.db.shelter().iter() {
        if !shelter.is_destroyed {
            check_distance_add_value!(shelter.pos_x, shelter.pos_y, VALUE_SHELTER);
        }
    }
    
    // Count foundations (capped) - uses idx_chunk btree index
    let mut foundation_value: f32 = 0.0;
    'foundation_loop: for chunk_idx in &nearby_chunks {
        for foundation in ctx.db.foundation_cell().idx_chunk().filter(chunk_idx) {
            if !foundation.is_destroyed {
                let foundation_x = (foundation.cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
                let foundation_y = (foundation.cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
                let dx = foundation_x - player_x;
                let dy = foundation_y - player_y;
                if dx * dx + dy * dy <= SETTLEMENT_CHECK_RADIUS_SQ {
                    foundation_value += VALUE_FOUNDATION;
                    if foundation_value >= MAX_FOUNDATION_VALUE {
                        break 'foundation_loop; // Cap foundation contribution
                    }
                }
            }
        }
    }
    total_value += foundation_value.min(MAX_FOUNDATION_VALUE);
    
    // Skip smaller tables (furnace, barbecue, lantern) if already near max
    // These are typically few in number and don't justify the query overhead
    if total_value < SETTLEMENT_VALUE_FOR_MAX * 0.8 {
        // Count furnaces - typically few per settlement
        for chunk_idx in &nearby_chunks {
            for furnace in ctx.db.furnace().chunk_index().filter(chunk_idx) {
                if !furnace.is_destroyed {
                    check_distance_add_value!(furnace.pos_x, furnace.pos_y, VALUE_FURNACE);
                }
            }
        }
        
        // Count barbecues - full table scan (typically very few, no btree index)
        for bbq in ctx.db.barbecue().iter() {
            if !bbq.is_destroyed {
                check_distance_add_value!(bbq.pos_x, bbq.pos_y, VALUE_COOKING);
            }
        }
        
        // Count lanterns - full table scan (typically few per settlement, no btree index)
        for lantern in ctx.db.lantern().iter() {
            if !lantern.is_destroyed {
                check_distance_add_value!(lantern.pos_x, lantern.pos_y, VALUE_COOKING);
            }
        }
    }
    
    calculate_final_multiplier(total_value, nearby_player_count)
}

/// Calculate the final multiplier from total settlement value
#[inline]
fn calculate_final_multiplier(mut total_value: f32, nearby_player_count: usize) -> f32 {
    // Add value for each additional nearby player (more people = bigger target)
    if nearby_player_count > 1 {
        total_value += (nearby_player_count - 1) as f32 * VALUE_PER_NEARBY_PLAYER;
    }
    
    // Calculate multiplier based on settlement value
    // 0 value = BASE_SETTLEMENT_MULTIPLIER (0.6x)
    // SETTLEMENT_VALUE_FOR_BASELINE (20) = 1.0x
    // SETTLEMENT_VALUE_FOR_MAX (100) = MAX_SETTLEMENT_MULTIPLIER (2.0x)
    let multiplier = if total_value <= 0.0 {
        BASE_SETTLEMENT_MULTIPLIER
    } else if total_value < SETTLEMENT_VALUE_FOR_BASELINE {
        let progress = total_value / SETTLEMENT_VALUE_FOR_BASELINE;
        BASE_SETTLEMENT_MULTIPLIER + progress * (1.0 - BASE_SETTLEMENT_MULTIPLIER)
    } else if total_value < SETTLEMENT_VALUE_FOR_MAX {
        let progress = (total_value - SETTLEMENT_VALUE_FOR_BASELINE) / (SETTLEMENT_VALUE_FOR_MAX - SETTLEMENT_VALUE_FOR_BASELINE);
        1.0 + progress * (MAX_SETTLEMENT_MULTIPLIER - 1.0)
    } else {
        MAX_SETTLEMENT_MULTIPLIER
    };
    
    log::debug!("🏘️ [Settlement] Value: {:.1}, Multiplier: {:.2}x (players: {})", 
               total_value, multiplier, nearby_player_count);
    
    multiplier
}

/// Count players within the settlement check radius
fn count_nearby_players(ctx: &ReducerContext, player_x: f32, player_y: f32, exclude_identity: &spacetimedb::Identity) -> usize {
    ctx.db.player().iter()
        .filter(|p| {
            if p.is_dead || !p.is_online || &p.identity == exclude_identity {
                return false;
            }
            // Check if they have an active connection
            if ctx.db.active_connection().identity().find(&p.identity).is_none() {
                return false;
            }
            let dx = p.position_x - player_x;
            let dy = p.position_y - player_y;
            dx * dx + dy * dy <= SETTLEMENT_CHECK_RADIUS_SQ
        })
        .count()
}

// --- Player Camping Tracker Table ---
// Tracks player positions and when they started being stationary
#[table(name = player_camping_state, public)]
pub struct PlayerCampingState {
    #[primary_key]
    pub player_identity: spacetimedb::Identity,
    pub last_known_x: f32,
    pub last_known_y: f32,
    pub stationary_since: Timestamp,
}

// --- Schedule Tables ---

#[table(name = hostile_spawn_schedule, scheduled(process_hostile_spawns))]
pub struct HostileSpawnSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

#[table(name = hostile_dawn_cleanup_schedule, scheduled(process_dawn_cleanup))]
pub struct HostileDawnCleanupSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
    pub cleanup_start_time: Timestamp,
}

/// Emit hostile death sound at the given position
/// Visual effects are handled client-side when the WildAnimal is deleted
pub fn emit_hostile_death_sound(
    ctx: &ReducerContext,
    pos_x: f32,
    pos_y: f32,
    triggered_by: spacetimedb::Identity,
) {
    // Play death sound (audible to nearby players)
    if let Err(e) = crate::sound_events::emit_sound_at_position_with_distance(
        ctx,
        crate::sound_events::SoundType::HostileDeath,
        pos_x,
        pos_y,
        0.9, // High volume
        600.0, // Audible from moderate distance
        triggered_by,
    ) {
        log::error!("Failed to emit hostile death sound: {}", e);
    }
    
    log::debug!("💀 Hostile death sound emitted at ({:.0}, {:.0})", pos_x, pos_y);
}

// --- Initialization ---

/// Initialize hostile NPC spawning system
pub fn init_hostile_spawning_system(ctx: &ReducerContext) -> Result<(), String> {
    // Start the spawn schedule
    let spawn_interval = TimeDuration::from_micros((SPAWN_ATTEMPT_INTERVAL_MS * 1000) as i64);
    ctx.db.hostile_spawn_schedule().insert(HostileSpawnSchedule {
        scheduled_id: 0,
        scheduled_at: spawn_interval.into(),
    });
    
    log::info!("[HostileNPC] Initialized hostile NPC spawning system");
    Ok(())
}

// --- Spawn Processing ---

#[spacetimedb::reducer]
pub fn process_hostile_spawns(ctx: &ReducerContext, _args: HostileSpawnSchedule) -> Result<(), String> {
    if ctx.sender != ctx.identity() {
        return Err("process_hostile_spawns can only be called by the scheduler".to_string());
    }
    
    let current_time = ctx.timestamp;
    
    // PERFORMANCE: Quick check if any players are online before doing anything
    // If no players, skip all hostile spawn logic
    let has_online_players = ctx.db.player().iter().any(|p| p.is_online && !p.is_dead);
    if !has_online_players {
        return Ok(());
    }
    
    // Check if it's night time
    let world_state = match ctx.db.world_state().iter().next() {
        Some(ws) => ws,
        None => return Ok(()), // No world state yet
    };
    
    // Determine night phase from cycle progress
    let cycle_progress = world_state.cycle_progress;
    let night_phase = NightPhase::from_progress(cycle_progress);
    
    // Only spawn during actual night phases
    if night_phase == NightPhase::NotNight {
        // Check if we need to start dawn cleanup - trigger at Dawn OR Morning (failsafe)
        if matches!(world_state.time_of_day, TimeOfDay::Dawn | TimeOfDay::Morning | TimeOfDay::TwilightMorning) {
            start_dawn_cleanup_if_needed(ctx, current_time);
        }
        
        // AGGRESSIVE CLEANUP: Force-remove any hostiles that exist during daytime
        // This is a failsafe in case the scheduled cleanup didn't work
        // GRACE PERIOD: Don't delete hostiles that spawned within the last 30 seconds
        // This prevents instant deletion at the day/night transition moment
        const SPAWN_GRACE_PERIOD_US: i64 = 30_000_000; // 30 seconds in microseconds
        let current_time_us = current_time.to_micros_since_unix_epoch();
        
        let daytime_hostiles: Vec<u64> = ctx.db.wild_animal().iter()
            .filter(|a| {
                if !a.is_hostile_npc || a.health <= 0.0 {
                    return false;
                }
                // Check if hostile is past the grace period
                let spawn_time_us = a.created_at.to_micros_since_unix_epoch();
                let age_us = current_time_us - spawn_time_us;
                age_us > SPAWN_GRACE_PERIOD_US
            })
            .map(|a| a.id)
            .collect();
        
        if !daytime_hostiles.is_empty() {
            log::warn!("⚠️ [HostileNPC] Found {} hostiles during daytime ({:?}), force removing!", 
                      daytime_hostiles.len(), world_state.time_of_day);
            for id in &daytime_hostiles {
                ctx.db.wild_animal().id().delete(id);
            }
        }
        
        return Ok(());
    }
    
    // Log phase transitions for debugging
    log::debug!("🌙 [HostileNPC] Night phase: {} (progress: {:.3})", night_phase.name(), cycle_progress);
    
    // Get all online players (check active_connection table for connectivity)
    let players: Vec<_> = ctx.db.player().iter()
        .filter(|p| !p.is_dead && p.is_online && 
                ctx.db.active_connection().identity().find(&p.identity).is_some())
        .collect();
    
    if players.is_empty() {
        return Ok(());
    }
    
    // Process spawns for each player
    let mut rng = rand::rngs::StdRng::seed_from_u64(current_time.to_micros_since_unix_epoch() as u64);
    
    for player in &players {
        // Update camping state for this player
        update_player_camping_state(ctx, player, current_time);
        
        // Check if player is camping (for Drowned Watch eligibility)
        let is_camping = check_player_is_camping(ctx, player, current_time);
        
        // Calculate settlement intensity - more civilization = more apparition attention
        let nearby_player_count = count_nearby_players(ctx, player.position_x, player.position_y, &player.identity);
        let settlement_multiplier = calculate_settlement_intensity(
            ctx, 
            player.position_x, 
            player.position_y,
            nearby_player_count + 1, // Include this player in the count
        );
        
        try_spawn_hostiles_for_player(ctx, player, current_time, is_camping, night_phase, settlement_multiplier, &mut rng);
    }
    
    Ok(())
}

/// Update camping state tracking for a player
fn update_player_camping_state(ctx: &ReducerContext, player: &Player, current_time: Timestamp) {
    if let Some(mut camping_state) = ctx.db.player_camping_state().player_identity().find(&player.identity) {
        // Check if player has moved significantly
        let dx = player.position_x - camping_state.last_known_x;
        let dy = player.position_y - camping_state.last_known_y;
        let distance = (dx * dx + dy * dy).sqrt();
        
        if distance > CAMPING_MOVEMENT_THRESHOLD_PX {
            // Player moved - reset stationary timer
            camping_state.last_known_x = player.position_x;
            camping_state.last_known_y = player.position_y;
            camping_state.stationary_since = current_time;
            ctx.db.player_camping_state().player_identity().update(camping_state);
        }
        // Otherwise, keep existing stationary_since time (player hasn't moved much)
    } else {
        // Create new camping state entry
        ctx.db.player_camping_state().insert(PlayerCampingState {
            player_identity: player.identity,
            last_known_x: player.position_x,
            last_known_y: player.position_y,
            stationary_since: current_time,
        });
    }
}

/// Check if a player is "camping" (stationary 60+ sec OR inside building)
fn check_player_is_camping(ctx: &ReducerContext, player: &Player, current_time: Timestamp) -> bool {
    // Player is camping if inside a building
    if player.is_inside_building {
        return true;
    }
    
    // Check if stationary for 60+ seconds
    if let Some(camping_state) = ctx.db.player_camping_state().player_identity().find(&player.identity) {
        let stationary_ms = (current_time.to_micros_since_unix_epoch() - camping_state.stationary_since.to_micros_since_unix_epoch()) / 1000;
        if stationary_ms >= CAMPING_STATIONARY_TIME_MS {
            return true;
        }
    }
    
    false
}

fn try_spawn_hostiles_for_player(
    ctx: &ReducerContext,
    player: &Player,
    current_time: Timestamp,
    is_camping: bool,
    night_phase: NightPhase,
    settlement_multiplier: f32,
    rng: &mut impl Rng,
) {
    let player_x = player.position_x;
    let player_y = player.position_y;
    
    // Count nearby hostiles
    let (total_hostiles, shorebound_count, shardkin_count, drowned_watch_count) = 
        count_nearby_hostiles(ctx, player_x, player_y);
    
    // Check hard cap
    if total_hostiles >= MAX_TOTAL_HOSTILES_NEAR_PLAYER {
        return;
    }
    
    // Get phase-based spawn multipliers for dynamic night tension
    let (shorebound_mult, shardkin_mult, drowned_mult) = night_phase.get_spawn_multipliers();
    
    // =========================================================================
    // PHASED SPAWN RATES - Creates dramatic night arc
    // =========================================================================
    // Base chances are modified by:
    // 1. Night phase multipliers (early/peak/desperate)
    // 2. Camping status (being stationary increases pressure)
    // 3. Settlement intensity (more civilization = more apparition attention)
    // =========================================================================
    
    // 1. Try Shorebound (stalker) - Primary threat, scouts early, pressures throughout
    // Base: 55% chance, modified by phase, camping, and settlement intensity
    if shorebound_count < MAX_SHOREBOUND_NEAR_PLAYER && total_hostiles < MAX_TOTAL_HOSTILES_NEAR_PLAYER {
        let base_chance = 0.55;
        let camping_bonus = if is_camping { 0.15 } else { 0.0 };
        let final_chance = (base_chance + camping_bonus) * shorebound_mult * settlement_multiplier;
        
        if rng.gen::<f32>() < final_chance {
            if let Some((x, y)) = find_spawn_position(ctx, player_x, player_y, RING_B_MIN_PX, RING_B_MAX_PX, rng) {
                spawn_hostile_npc(ctx, AnimalSpecies::Shorebound, x, y, current_time);
                log::info!("👹 [HostileNPC] Shorebound spawned [{} phase] at ({:.0}, {:.0})", night_phase.name(), x, y);
            }
        }
    }
    
    // 2. Try Shardkin (swarmer) - Swarms emerge mid-night, peak during desperate hour
    // Base: 40% chance, modified by phase, camping, and settlement intensity
    if shardkin_count < MAX_SHARDKIN_NEAR_PLAYER && total_hostiles + 1 < MAX_TOTAL_HOSTILES_NEAR_PLAYER {
        let base_chance = 0.40;
        let camping_bonus = if is_camping { 0.20 } else { 0.0 };
        let final_chance = (base_chance + camping_bonus) * shardkin_mult * settlement_multiplier;
        
        if rng.gen::<f32>() < final_chance {
            // Group size scales with phase - bigger swarms later in night
            let min_group = match night_phase {
                NightPhase::EarlyNight => 1,
                NightPhase::PeakNight => 2,
                NightPhase::DesperateHour => 3,
                NightPhase::NotNight => 1,
            };
            let max_group = match night_phase {
                NightPhase::EarlyNight => 2,
                NightPhase::PeakNight => 4,
                NightPhase::DesperateHour => 5,
                NightPhase::NotNight => 2,
            };
            
            let group_size = rng.gen_range(min_group..=max_group) as usize;
            let available_slots = (MAX_SHARDKIN_NEAR_PLAYER - shardkin_count)
                .min(MAX_TOTAL_HOSTILES_NEAR_PLAYER - total_hostiles);
            let actual_spawn = group_size.min(available_slots);
            
            // Find base spawn position
            if let Some((base_x, base_y)) = find_spawn_position(ctx, player_x, player_y, RING_B_MIN_PX, RING_C_MAX_PX, rng) {
                let mut spawned_count = 0;
                for _ in 0..actual_spawn {
                    // Scatter group members around base position
                    let offset_angle = rng.gen::<f32>() * 2.0 * PI;
                    let offset_dist = rng.gen::<f32>() * 100.0;
                    let spawn_x = base_x + offset_angle.cos() * offset_dist;
                    let spawn_y = base_y + offset_angle.sin() * offset_dist;
                    
                    if is_valid_spawn_position(ctx, spawn_x, spawn_y, player_x, player_y, RING_B_MIN_PX, RING_C_MAX_PX) {
                        spawn_hostile_npc(ctx, AnimalSpecies::Shardkin, spawn_x, spawn_y, current_time);
                        spawned_count += 1;
                    }
                }
                if spawned_count > 0 {
                    log::info!("👹 [HostileNPC] Shardkin swarm of {} spawned [{} phase] near ({:.0}, {:.0})", 
                              spawned_count, night_phase.name(), base_x, base_y);
                }
            }
        }
    }
    
    // 3. Try Drowned Watch (brute) - Only emerges late night, terrifying finale
    // Base: 15% chance, modified by phase, camping, and settlement intensity
    // Camping bonus: +20% - large settlements attract the big ones!
    if drowned_watch_count < MAX_DROWNED_WATCH_NEAR_PLAYER && total_hostiles + 1 <= MAX_TOTAL_HOSTILES_NEAR_PLAYER {
        let base_chance = 0.15;
        let camping_bonus = if is_camping { 0.20 } else { 0.0 };
        let final_chance = (base_chance + camping_bonus) * drowned_mult * settlement_multiplier;
        
        if rng.gen::<f32>() < final_chance {
            if let Some((x, y)) = find_spawn_position(ctx, player_x, player_y, RING_C_MIN_PX, RING_C_MAX_PX, rng) {
                spawn_hostile_npc(ctx, AnimalSpecies::DrownedWatch, x, y, current_time);
                log::info!("👹 [HostileNPC] ⚠️ DROWNED WATCH spawned [{} phase] at ({:.0}, {:.0}) - camping: {}", 
                          night_phase.name(), x, y, is_camping);
            }
        }
    }
}

fn count_nearby_hostiles(ctx: &ReducerContext, player_x: f32, player_y: f32) -> (usize, usize, usize, usize) {
    let check_range_sq = RING_C_MAX_PX * RING_C_MAX_PX;
    
    let mut total = 0;
    let mut shorebound = 0;
    let mut shardkin = 0;
    let mut drowned_watch = 0;
    
    for animal in ctx.db.wild_animal().iter() {
        if !animal.is_hostile_npc {
            continue;
        }
        
        // Skip dead or despawning hostiles
        if animal.health <= 0.0 || animal.despawn_at.is_some() {
            continue;
        }
        
        let dx = animal.pos_x - player_x;
        let dy = animal.pos_y - player_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq <= check_range_sq {
            total += 1;
            match animal.species {
                AnimalSpecies::Shorebound => shorebound += 1,
                AnimalSpecies::Shardkin => shardkin += 1,
                AnimalSpecies::DrownedWatch => drowned_watch += 1,
                _ => {}
            }
        }
    }
    
    (total, shorebound, shardkin, drowned_watch)
}

fn find_spawn_position(
    ctx: &ReducerContext,
    player_x: f32,
    player_y: f32,
    min_distance: f32,
    max_distance: f32,
    rng: &mut impl Rng,
) -> Option<(f32, f32)> {
    // Try up to 10 times to find a valid position
    for _ in 0..10 {
        let angle = rng.gen::<f32>() * 2.0 * PI;
        let distance = rng.gen::<f32>() * (max_distance - min_distance) + min_distance;
        
        let spawn_x = player_x + angle.cos() * distance;
        let spawn_y = player_y + angle.sin() * distance;
        
        if is_valid_spawn_position(ctx, spawn_x, spawn_y, player_x, player_y, min_distance, max_distance) {
            return Some((spawn_x, spawn_y));
        }
    }
    
    None
}

fn is_valid_spawn_position(
    ctx: &ReducerContext,
    spawn_x: f32,
    spawn_y: f32,
    player_x: f32,
    player_y: f32,
    min_distance: f32,
    max_distance: f32,
) -> bool {
    // Check world bounds
    if spawn_x < 64.0 || spawn_x > WORLD_WIDTH_PX - 64.0 ||
       spawn_y < 64.0 || spawn_y > WORLD_HEIGHT_PX - 64.0 {
        return false;
    }
    
    // Check distance to player
    let dx = spawn_x - player_x;
    let dy = spawn_y - player_y;
    let dist_sq = dx * dx + dy * dy;
    
    if dist_sq < min_distance * min_distance || dist_sq > max_distance * max_distance {
        return false;
    }
    
    // Check if inside a building
    if is_position_inside_building(ctx, spawn_x, spawn_y) {
        return false;
    }
    
    // Check runestone deterrence
    for rune_stone in ctx.db.rune_stone().iter() {
        let rdx = spawn_x - rune_stone.pos_x;
        let rdy = spawn_y - rune_stone.pos_y;
        let rune_dist_sq = rdx * rdx + rdy * rdy;
        
        if rune_dist_sq < RUNESTONE_DETERRENCE_RADIUS_SQ {
            return false;
        }
    }
    
    // Check general spawn validation (water, collisions, etc.)
    if validate_animal_spawn_position(ctx, spawn_x, spawn_y).is_err() {
        return false;
    }
    
    true
}

fn spawn_hostile_npc(
    ctx: &ReducerContext,
    species: AnimalSpecies,
    pos_x: f32,
    pos_y: f32,
    current_time: Timestamp,
) {
    let behavior = species.get_behavior();
    let stats = behavior.get_stats();
    
    let animal = WildAnimal {
        id: 0,
        species,
        pos_x,
        pos_y,
        direction_x: 1.0,
        direction_y: 0.0,
        facing_direction: "down".to_string(),
        state: AnimalState::Patrolling,
        health: stats.max_health,
        spawn_x: pos_x,
        spawn_y: pos_y,
        target_player_id: None,
        last_attack_time: None,
        state_change_time: current_time,
        hide_until: None,
        investigation_x: None,
        investigation_y: None,
        patrol_phase: 0.0,
        scent_ping_timer: 0,
        movement_pattern: behavior.get_movement_pattern(),
        chunk_index: calculate_chunk_index(pos_x, pos_y),
        created_at: current_time,
        last_hit_time: None,
        
        // Pack fields - hostiles don't use packs
        pack_id: None,
        is_pack_leader: false,
        pack_join_time: None,
        last_pack_check: None,
        
        // Fire fear - hostiles ignore fire
        fire_fear_overridden_by: None,
        
        // Taming - hostiles can't be tamed
        tamed_by: None,
        tamed_at: None,
        heart_effect_until: None,
        crying_effect_until: None,
        last_food_check: None,
        
        // Bird fields - not used
        held_item_name: None,
        held_item_quantity: None,
        flying_target_x: None,
        flying_target_y: None,
        is_flying: false,
        
        // Hostile NPC fields
        is_hostile_npc: true,
        target_structure_id: None,
        target_structure_type: None,
        stalk_angle: 0.0,
        stalk_distance: 200.0, // Initial stalk distance
        despawn_at: None,
    };
    
    ctx.db.wild_animal().insert(animal);
    log::info!("👹 [HostileNPC] Spawned {:?} at ({:.0}, {:.0})", species, pos_x, pos_y);
}

// --- Dawn Cleanup ---

fn start_dawn_cleanup_if_needed(ctx: &ReducerContext, current_time: Timestamp) {
    // Check if there's already a cleanup schedule running
    if ctx.db.hostile_dawn_cleanup_schedule().iter().count() > 0 {
        return;
    }
    
    // Count hostiles to clean up
    let hostile_count = ctx.db.wild_animal().iter()
        .filter(|a| a.is_hostile_npc && a.health > 0.0)
        .count();
    
    if hostile_count == 0 {
        return;
    }
    
    // Start the cleanup schedule
    let check_interval = TimeDuration::from_micros((DAWN_CLEANUP_CHECK_INTERVAL_MS * 1000) as i64);
    ctx.db.hostile_dawn_cleanup_schedule().insert(HostileDawnCleanupSchedule {
        scheduled_id: 0,
        scheduled_at: check_interval.into(),
        cleanup_start_time: current_time,
    });
    
    log::info!("🌅 [HostileNPC] Starting dawn cleanup of {} hostile NPCs", hostile_count);
}

#[spacetimedb::reducer]
pub fn process_dawn_cleanup(ctx: &ReducerContext, args: HostileDawnCleanupSchedule) -> Result<(), String> {
    if ctx.sender != ctx.identity() {
        return Err("process_dawn_cleanup can only be called by the scheduler".to_string());
    }
    
    let current_time = ctx.timestamp;
    
    // CRITICAL FIX: Check if it's actually daytime before cleaning up!
    // This prevents the cleanup from running during subsequent nights
    let world_state = match ctx.db.world_state().iter().next() {
        Some(ws) => ws,
        None => {
            log::warn!("🌅 [HostileNPC] Dawn cleanup aborted - no world state");
            return Ok(());
        }
    };
    
    let night_phase = NightPhase::from_progress(world_state.cycle_progress);
    
    // If it's night again, STOP the cleanup schedule entirely
    if night_phase != NightPhase::NotNight {
        log::info!("🌙 [HostileNPC] Dawn cleanup stopped - night has returned (phase: {})", night_phase.name());
        // Don't reschedule - let the schedule die
        return Ok(());
    }
    
    let elapsed_ms = (current_time.to_micros_since_unix_epoch() - args.cleanup_start_time.to_micros_since_unix_epoch()) / 1000;
    
    // Check if cleanup is complete (all time elapsed)
    if elapsed_ms >= DAWN_CLEANUP_DURATION_MS as i64 {
        // Force remove all remaining hostiles
        let hostile_ids: Vec<u64> = ctx.db.wild_animal().iter()
            .filter(|a| a.is_hostile_npc)
            .map(|a| a.id)
            .collect();
        
        for id in &hostile_ids {
            ctx.db.wild_animal().id().delete(id);
        }
        
        if !hostile_ids.is_empty() {
            log::info!("🌅 [HostileNPC] Dawn cleanup complete - removed {} remaining hostiles", hostile_ids.len());
        }
        
        // Cleanup complete - don't reschedule
        return Ok(());
    }
    
    // Progressive cleanup - remove some hostiles each tick
    let progress = elapsed_ms as f32 / DAWN_CLEANUP_DURATION_MS as f32;
    let mut rng = rand::rngs::StdRng::seed_from_u64(current_time.to_micros_since_unix_epoch() as u64);
    
    // GRACE PERIOD: Don't delete hostiles that spawned within the last 10 seconds
    // This prevents instant deletion of hostiles that just spawned at dawn edge
    const CLEANUP_GRACE_PERIOD_US: i64 = 10_000_000; // 10 seconds in microseconds
    let current_time_us = current_time.to_micros_since_unix_epoch();
    
    let hostiles: Vec<_> = ctx.db.wild_animal().iter()
        .filter(|a| {
            if !a.is_hostile_npc || a.despawn_at.is_some() {
                return false;
            }
            // Check if hostile is past the grace period
            let spawn_time_us = a.created_at.to_micros_since_unix_epoch();
            let age_us = current_time_us - spawn_time_us;
            age_us > CLEANUP_GRACE_PERIOD_US
        })
        .collect();
    
    for hostile in hostiles {
        // Gradually increase despawn chance as cleanup progresses
        let despawn_chance = 0.1 + progress * 0.4; // 10% to 50% chance per tick
        
        if rng.gen::<f32>() < despawn_chance {
            // Mark for despawn and immediately delete
            ctx.db.wild_animal().id().delete(&hostile.id);
            log::debug!("🌅 [HostileNPC] {:?} {} dissolved at dawn", hostile.species, hostile.id);
        }
    }
    
    // Reschedule for next cleanup tick (manually control the interval)
    let check_interval = TimeDuration::from_micros((DAWN_CLEANUP_CHECK_INTERVAL_MS * 1000) as i64);
    ctx.db.hostile_dawn_cleanup_schedule().insert(HostileDawnCleanupSchedule {
        scheduled_id: 0,
        scheduled_at: check_interval.into(),
        cleanup_start_time: args.cleanup_start_time, // Keep original start time
    });
    
    Ok(())
}

// ============================================================================
// STRUCTURE ATTACK HELPERS
// ============================================================================

use crate::door::{door as DoorTableTrait, Door};
use crate::building::{wall_cell as WallCellTableTrait, WallCell};
// Note: ShelterTableTrait already imported at the top of the file

/// Find the nearest door, wall, or shelter that a hostile can attack
/// Returns (structure_id, structure_type, distance_sq)
/// Priority: doors > shelters > walls
pub fn find_nearest_attackable_structure(
    ctx: &ReducerContext,
    hostile_x: f32,
    hostile_y: f32,
    max_range: f32,
) -> Option<(u64, String, f32)> {
    let max_range_sq = max_range * max_range;
    
    // First, look for doors (preferred target - entry points)
    let mut nearest_door: Option<(u64, f32)> = None;
    for door in ctx.db.door().iter() {
        if door.is_destroyed {
            continue;
        }
        
        // Calculate door center position
        let door_x = door.pos_x;
        let door_y = door.pos_y;
        
        let dx = door_x - hostile_x;
        let dy = door_y - hostile_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < max_range_sq {
            if nearest_door.is_none() || dist_sq < nearest_door.unwrap().1 {
                nearest_door = Some((door.id, dist_sq));
            }
        }
    }
    
    // If found a door within range, use it
    if let Some((door_id, dist_sq)) = nearest_door {
        return Some((door_id, "door".to_string(), dist_sq));
    }
    
    // Second, look for shelters (tent-like structures that protect players)
    // IMPORTANT: Use AABB center position (pos_y - 200.0) for distance check
    // This matches the attack range check in core.rs
    let mut nearest_shelter: Option<(u64, f32)> = None;
    for shelter in ctx.db.shelter().iter() {
        if shelter.is_destroyed {
            continue;
        }
        
        // Use AABB collision center for shelter distance (matches attack detection)
        let shelter_aabb_center_x = shelter.pos_x;
        let shelter_aabb_center_y = shelter.pos_y - crate::shelter::SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y;
        
        let dx = shelter_aabb_center_x - hostile_x;
        let dy = shelter_aabb_center_y - hostile_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < max_range_sq {
            if nearest_shelter.is_none() || dist_sq < nearest_shelter.unwrap().1 {
                nearest_shelter = Some((shelter.id as u64, dist_sq));
            }
        }
    }
    
    // If found a shelter within range, use it
    if let Some((shelter_id, dist_sq)) = nearest_shelter {
        return Some((shelter_id, "shelter".to_string(), dist_sq));
    }
    
    // Last, look for walls
    let mut nearest_wall: Option<(u64, f32)> = None;
    for wall in ctx.db.wall_cell().iter() {
        if wall.is_destroyed {
            continue;
        }
        
        // Calculate wall center position from cell coordinates
        // Walls use foundation cell coordinates (96px grid)
        let wall_x = (wall.cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
        let wall_y = (wall.cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
        
        let dx = wall_x - hostile_x;
        let dy = wall_y - hostile_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < max_range_sq {
            if nearest_wall.is_none() || dist_sq < nearest_wall.unwrap().1 {
                nearest_wall = Some((wall.id, dist_sq));
            }
        }
    }
    
    if let Some((wall_id, dist_sq)) = nearest_wall {
        return Some((wall_id, "wall".to_string(), dist_sq));
    }
    
    None
}

/// Apply hostile NPC damage to a structure
/// BYPASSES normal melee damage reduction (hostile attacks are effective)
pub fn hostile_attack_structure(
    ctx: &ReducerContext,
    structure_id: u64,
    structure_type: &str,
    damage: f32,
    current_time: Timestamp,
) -> Result<bool, String> {
    match structure_type {
        "door" => {
            let doors = ctx.db.door();
            if let Some(mut door) = doors.id().find(structure_id) {
                if door.is_destroyed {
                    return Ok(false);
                }
                
                // HOSTILE ATTACKS BYPASS MELEE REDUCTION - full damage!
                let old_health = door.health;
                door.health = (door.health - damage).max(0.0);
                door.last_hit_time = Some(current_time);
                
                let destroyed = door.health <= 0.0;
                if destroyed {
                    door.is_destroyed = true;
                    door.destroyed_at = Some(current_time);
                    log::info!("👹 [HostileNPC] Door {} destroyed by hostile attack!", structure_id);
                } else {
                    log::info!("👹 [HostileNPC] Door {} took {:.1} damage from hostile. Health: {:.1} -> {:.1}", 
                              structure_id, damage, old_health, door.health);
                }
                
                ctx.db.door().id().update(door);
                return Ok(destroyed);
            }
        },
        "wall" => {
            let walls = ctx.db.wall_cell();
            if let Some(mut wall) = walls.id().find(structure_id) {
                if wall.is_destroyed {
                    return Ok(false);
                }
                
                // HOSTILE ATTACKS BYPASS MELEE REDUCTION - full damage!
                let old_health = wall.health;
                wall.health = (wall.health - damage).max(0.0);
                wall.last_hit_time = Some(current_time);
                
                let destroyed = wall.health <= 0.0;
                if destroyed {
                    wall.is_destroyed = true;
                    wall.destroyed_at = Some(current_time);
                    log::info!("👹 [HostileNPC] Wall {} destroyed by hostile attack!", structure_id);
                } else {
                    log::info!("👹 [HostileNPC] Wall {} took {:.1} damage from hostile. Health: {:.1} -> {:.1}", 
                              structure_id, damage, old_health, wall.health);
                }
                
                ctx.db.wall_cell().id().update(wall);
                return Ok(destroyed);
            }
        },
        "shelter" => {
            let shelters = ctx.db.shelter();
            if let Some(mut shelter) = shelters.id().find(structure_id as u32) {
                if shelter.is_destroyed {
                    return Ok(false);
                }
                
                // HOSTILE ATTACKS BYPASS MELEE REDUCTION - full damage!
                let old_health = shelter.health;
                shelter.health = (shelter.health - damage).max(0.0);
                shelter.last_hit_time = Some(current_time);
                
                let destroyed = shelter.health <= 0.0;
                if destroyed {
                    shelter.is_destroyed = true;
                    shelter.destroyed_at = Some(current_time);
                    log::info!("👹 [HostileNPC] Shelter {} destroyed by hostile attack!", structure_id);
                } else {
                    log::info!("👹 [HostileNPC] Shelter {} took {:.1} damage from hostile. Health: {:.1} -> {:.1}", 
                              structure_id, damage, old_health, shelter.health);
                }
                
                ctx.db.shelter().id().update(shelter);
                return Ok(destroyed);
            }
        },
        _ => {
            return Err(format!("Unknown structure type: {}", structure_type));
        }
    }
    
    Ok(false)
}
