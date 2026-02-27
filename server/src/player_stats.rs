use spacetimedb::{Identity, ReducerContext, Table, Timestamp, TimeDuration};
use spacetimedb::spacetimedb_lib::ScheduleAt;
use spacetimedb::table;
use log;
use std::time::Duration;

use crate::inventory_management::ItemContainer;

// Import table traits for player progression tables
use crate::player_progression::player_stats as PlayerStatsTableTrait;
use crate::player_progression::comparative_stat_notification as ComparativeStatNotificationTableTrait;

// --- StatThresholdsConfig Table Definition (Formerly GameConfig) ---
pub const DEFAULT_LOW_NEED_THRESHOLD: f32 = 20.0;

#[table(accessor = stat_thresholds_config, public)]
#[derive(Clone, Debug)]
pub struct StatThresholdsConfig {
    #[primary_key]
    pub id: u8, // Singleton table, ID will always be 0
    pub low_need_threshold: f32,
    // Add other global config values here in the future
}

pub fn init_stat_thresholds_config(ctx: &ReducerContext) -> Result<(), String> {
    let config_table = ctx.db.stat_thresholds_config();
    if config_table.iter().count() == 0 {
        log::info!(
            "Initializing StatThresholdsConfig table with default low_need_threshold: {}",
            DEFAULT_LOW_NEED_THRESHOLD
        );
        match config_table.try_insert(StatThresholdsConfig {
            id: 0,
            low_need_threshold: DEFAULT_LOW_NEED_THRESHOLD,
        }) {
            Ok(_) => log::info!("StatThresholdsConfig table initialized in player_stats."),
            Err(e) => {
                log::error!("Failed to initialize StatThresholdsConfig table in player_stats: {}", e);
                return Err(format!("Failed to init StatThresholdsConfig in player_stats: {}", e));
            }
        }
    } else {
        log::debug!("StatThresholdsConfig table already initialized (in player_stats).");
    }
    Ok(())
}
// --- End StatThresholdsConfig Table Definition ---

// Define Constants locally
// Hunger drains from 250 to 0 in 3 hours
const HUNGER_DRAIN_PER_SECOND: f32 = 250.0 / (3.0 * 60.0 * 60.0);
// Thirst drains from 250 to 0 in 2 hours
const THIRST_DRAIN_PER_SECOND: f32 = 250.0 / (2.0 * 60.0 * 60.0);
// Make stat constants pub(crate) as well for consistency, although not strictly needed if only used here
// pub(crate) const STAMINA_DRAIN_PER_SECOND: f32 = 8.0; // REMOVED: No stamina drain from sprinting
// pub(crate) const STAMINA_RECOVERY_PER_SECOND: f32 = 3.0; // REMOVED: No stamina processing
pub(crate) const HEALTH_LOSS_PER_SEC_LOW_THIRST: f32 = 0.5;
pub(crate) const HEALTH_LOSS_PER_SEC_LOW_HUNGER: f32 = 0.4;
pub(crate) const HEALTH_LOSS_MULTIPLIER_AT_ZERO: f32 = 2.0;
pub(crate) const HEALTH_RECOVERY_THRESHOLD: f32 = 51.0;
pub(crate) const HEALTH_RECOVERY_PER_SEC: f32 = 1.0;
pub(crate) const HEALTH_LOSS_PER_SEC_LOW_WARMTH: f32 = 0.25;
pub(crate) const WARMTH_DAMAGE_THRESHOLD: f32 = 6.67; // Health loss starts when warmth drops below this (3x lower than low_need_threshold of 20.0)

// Add the constants moved from lib.rs and make them pub(crate)
pub(crate) const SPRINT_SPEED_MULTIPLIER: f32 = 1.75; // MUST MATCH CLIENT (1.75x for meaningful but controlled boost)
pub(crate) const JUMP_COOLDOWN_MS: u64 = 300; // Reduced to 300ms for faster jumping
// NOTE: Speed penalties are now handled by the exhausted effect in active_effects.rs

// Add torch warmth constant
// Neutralizes night cold (-1.5) but midnight (-2.0) still causes slow warmth loss
pub(crate) const TORCH_WARMTH_PER_SECOND: f32 = 1.75;

// Tree cover hydration conservation constant
pub(crate) const TREE_COVER_HYDRATION_REDUCTION_MULTIPLIER: f32 = 0.75; // 25% reduction in thirst drain (75% of normal rate)

// Indoor warmth protection constant
// Reduces negative warmth drain when inside shelters or enclosed buildings
// 0.65 = 35% reduction in cold drain (still get cold, but slower)
// Example: -2.0 warmth/sec (midnight) becomes -1.3 warmth/sec when indoors
pub(crate) const INDOOR_WARMTH_PROTECTION_MULTIPLIER: f32 = 0.65;

// Add dodge roll stamina cost constant
pub(crate) const DODGE_ROLL_STAMINA_COST: f32 = 10.0;

// Add constants for max values
pub(crate) const PLAYER_MAX_HUNGER: f32 = 250.0;
pub(crate) const PLAYER_MAX_THIRST: f32 = 250.0;
pub(crate) const HUNGER_RECOVERY_THRESHOLD: f32 = 127.5; // ~51% of 250
pub(crate) const THIRST_RECOVERY_THRESHOLD: f32 = 127.5; // ~51% of 250

// Insanity system constants - BALANCED FOR GAMEPLAY
// Design philosophy: Quick in-and-out shard runs are safe, long hauls are dangerous
// Dropping shards quickly = rapid recovery, but getting greedy (50%+ insanity) = slow recovery
pub(crate) const PLAYER_MAX_INSANITY: f32 = 100.0; // Max insanity value (triggers Entrainment)
pub(crate) const INSANITY_BASE_INCREASE_PER_SECOND: f32 = 0.012; // Lower base rate, but time multiplier makes it dangerous
pub(crate) const INSANITY_MINING_INCREASE: f32 = 1.5; // Insanity increase when mining a memory shard node
pub(crate) const INSANITY_SHARD_SCALING_EXPONENT: f32 = 0.35; // More gradual scaling: shard_count^0.35
// This means: 1 shard = 1x, 10 shards = 2.2x, 50 shards = 3.6x, 100 shards = 4.5x, 500 shards = 7.4x

// NEW: Minimum shard count before insanity kicks in
// This makes the game accessible for new players who need time to:
// 1. Learn basic survival mechanics (food, water, warmth)
// 2. Explore and accidentally collect shards from random nodes
// 3. Build their first base (Shelter + Wooden Storage Box)
// 4. Understand the mine → deposit → spend gameplay loop
// 
// Threshold of 200 = ~2-3 memory nodes worth, enough for the "learning phase"
// Insanity only becomes a concern AFTER they have infrastructure to deposit shards
// This allows safe collection of enough shards for several Tier 1-2 upgrades (60-280 shards each)
pub(crate) const INSANITY_MINIMUM_SHARD_THRESHOLD: u32 = 200;

// Time-based multiplier: the longer you carry shards, the worse it gets
// Creates urgency to drop off shards regularly rather than hoarding during long sessions
pub(crate) const INSANITY_TIME_MULTIPLIER_MAX: f32 = 8.0; // Maximum time-based multiplier (8x at 15+ minutes)
pub(crate) const INSANITY_TIME_SCALE_SECONDS: f32 = 900.0; // Reaches ~7x at 15 minutes (900 seconds)
// Time progression: 0 min = 1x, 5 min = 2.5x, 10 min = 5x, 15 min = 7x, 20+ min = 8x cap

// Decay rates - KEY TO THE NEW SYSTEM
// Below threshold: rapid decay rewards quick drop-offs and safe play
// Above threshold: slow decay punishes getting greedy, creates tension
pub(crate) const INSANITY_RAPID_DECAY_THRESHOLD: f32 = 50.0; // Below 50% = rapid decay when dropping shards
pub(crate) const INSANITY_RAPID_DECAY_PER_SECOND: f32 = 2.0; // Very fast recovery (50% to 0% in ~25 seconds)
pub(crate) const INSANITY_SLOW_DECAY_PER_SECOND: f32 = 0.35; // Moderate recovery at high insanity (~2.4 minutes from 100% to 50%)

// Insanity threshold constants for SOVA sound triggers (client-side sounds)
pub(crate) const INSANITY_THRESHOLD_25: f32 = 25.0; // First warning threshold
pub(crate) const INSANITY_THRESHOLD_50: f32 = 50.0; // Moderate warning threshold
pub(crate) const INSANITY_THRESHOLD_75: f32 = 75.0; // Severe warning threshold
pub(crate) const INSANITY_THRESHOLD_90: f32 = 90.0; // Critical warning threshold
pub(crate) const INSANITY_THRESHOLD_100: f32 = 100.0; // Maximum threshold (Entrainment)

// Add constants for starting values (when spawning/respawning)
// Increased from 40% to 60% to give new players more breathing room before survival pressure kicks in
pub(crate) const PLAYER_STARTING_HUNGER: f32 = 150.0; // Start at 60% of max (150/250)
pub(crate) const PLAYER_STARTING_THIRST: f32 = 150.0; // Start at 60% of max (150/250)

// Cold-induced hunger drain constants
pub(crate) const HUNGER_DRAIN_MULTIPLIER_LOW_WARMTH: f32 = 1.5; // 50% faster hunger drain when cold
pub(crate) const HUNGER_DRAIN_MULTIPLIER_ZERO_WARMTH: f32 = 2.0; // 100% faster hunger drain when freezing

// Biome-based warmth decay multipliers (affects how fast you get cold in arctic biomes)
// These multiply the base negative warmth change rate
// BALANCE NOTES:
// - Tundra: 50% faster cold drain - noticeable but manageable with basic gear
// - Alpine: 100% faster cold drain - dangerous, needs good armor or fire
// - These stack with rain (+1.5 warmth drain) and wetness (+0.5 warmth drain)
// - Armor cold resistance helps mitigate the damage, not the decay rate
// - Players need fur/warm armor to survive extended time in arctic regions
pub(crate) const TUNDRA_WARMTH_DECAY_MULTIPLIER: f32 = 1.5;  // 50% faster cold drain in tundra
pub(crate) const ALPINE_WARMTH_DECAY_MULTIPLIER: f32 = 2.0;  // 100% faster cold drain in alpine (harsh!)

// Import necessary items from the main lib module or other modules
use crate::{
    Player, // Player struct
    world_state::{self, TimeOfDay, BASE_WARMTH_DRAIN_PER_SECOND, WARMTH_DRAIN_MULTIPLIER_DAWN_DUSK, WARMTH_DRAIN_MULTIPLIER_NIGHT, WARMTH_DRAIN_MULTIPLIER_MIDNIGHT},
    campfire::{self, Campfire, WARMTH_RADIUS_SQUARED, WARMTH_PER_SECOND},
    active_equipment, // For unequipping on death
    player_corpse::{self, PlayerCorpse, NUM_CORPSE_SLOTS, PlayerCorpseDespawnSchedule},
    environment::calculate_chunk_index,
};

// Import table traits
use crate::Player as PlayerTableTrait;
use crate::world_state::world_state as WorldStateTableTrait;
use crate::campfire::campfire as CampfireTableTrait;
use crate::active_equipment::active_equipment as ActiveEquipmentTableTrait; // Needed for unequip on death
use crate::player; // Added missing import for Player trait
use crate::player_stats::PlayerStatSchedule as PlayerStatScheduleTableTrait; // Added Self trait import
use crate::items::inventory_item as InventoryItemTableTrait; // <<< ADDED
use crate::player_corpse::player_corpse as PlayerCorpseTableTrait; // <<< ADDED
use crate::player_corpse::player_corpse_despawn_schedule as PlayerCorpseDespawnScheduleTableTrait; // <<< ADDED
use crate::items::item_definition as ItemDefinitionTableTrait; // <<< ADDED missing import
use crate::armor; // <<< ADDED for warmth bonus
use crate::death_marker; // <<< ADDED for DeathMarker
use crate::death_marker::death_marker as DeathMarkerTableTrait; // <<< ADDED DeathMarker table trait
use crate::shelter; // <<< ADDED for shelter warmth bonus
use crate::active_effects::{active_consumable_effect as ActiveConsumableEffectTableTrait, EffectType, update_player_cozy_status, player_has_cozy_effect, COZY_HEALTH_REGEN_MULTIPLIER}; // <<< ADDED for checking damaging effects and cozy

// PERFORMANCE: Increased from 1s to 2s - stat changes are gradual, 2x slower is acceptable
pub(crate) const PLAYER_STAT_UPDATE_INTERVAL_SECS: u64 = 2;

// Helper function to check if a player has any active damaging effects
fn player_has_damaging_effects(ctx: &ReducerContext, player_id: Identity) -> bool {
    for effect in ctx.db.active_consumable_effect().iter() {
        if effect.player_id == player_id {
            match effect.effect_type {
                EffectType::Bleed | EffectType::Burn | EffectType::SeawaterPoisoning | EffectType::FoodPoisoning => {
                    return true;
                }
                _ => {} // Other effects don't block passive regen
            }
        }
    }
    false
}

/// Get the biome-based warmth decay multiplier at a given position.
/// Returns 1.0 for normal biomes, higher values for colder biomes (tundra/alpine).
/// This multiplier is applied to negative warmth changes to make arctic regions more dangerous.
pub fn get_biome_warmth_multiplier(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> f32 {
    // Convert world position to tile coordinates
    let (tile_x, tile_y) = crate::world_pos_to_tile_coords(pos_x, pos_y);
    
    // Get the tile type at this position
    if let Some(tile_type) = crate::get_tile_type_at_position(ctx, tile_x, tile_y) {
        if tile_type.is_alpine() {
            // Alpine is the harshest - 2x faster cold drain
            return ALPINE_WARMTH_DECAY_MULTIPLIER;
        } else if tile_type.is_tundra() {
            // Tundra is moderately harsh - 1.5x faster cold drain
            return TUNDRA_WARMTH_DECAY_MULTIPLIER;
        }
    }
    
    // Default: no multiplier for temperate biomes
    1.0
}

// --- Player Stat Schedule Table (Reverted to scheduled pattern) ---
#[spacetimedb::table(accessor = player_stat_schedule, scheduled(process_player_stats))]
#[derive(Clone)]
pub struct PlayerStatSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64, // Changed PK name to id
    pub scheduled_at: ScheduleAt, // Added scheduled_at field
}

// --- Function to Initialize the Stat Update Schedule ---
pub fn init_player_stat_schedule(ctx: &ReducerContext) -> Result<(), String> {
    let schedule_table = ctx.db.player_stat_schedule();
    if schedule_table.iter().count() == 0 {
        log::info!(
            "Starting player stat update schedule (every {}s).",
            PLAYER_STAT_UPDATE_INTERVAL_SECS
        );
        let interval = Duration::from_secs(PLAYER_STAT_UPDATE_INTERVAL_SECS);
        crate::try_insert_schedule!(
            schedule_table,
            PlayerStatSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(TimeDuration::from(interval)),
            },
            "Player stat"
        );
    } else {
        log::debug!("Player stat schedule already exists.");
    }
    Ok(())
}

// --- Reducer to Process ALL Player Stat Updates (Scheduled) ---
#[spacetimedb::reducer]
pub fn process_player_stats(ctx: &ReducerContext, _schedule: PlayerStatSchedule) -> Result<(), String> {
    // Security check - only allow scheduler to call this
    if ctx.sender() != ctx.identity() {
        return Err("process_player_stats may only be called by the scheduler.".to_string());
    }

    let players = ctx.db.player();
    
    // PERFORMANCE: Skip entirely if no players are online
    // This is the biggest CPU saver - this reducer runs every 2s
    let has_online_players = players.iter().any(|p| p.is_online);
    if !has_online_players {
        return Ok(());
    }

    log::trace!("Processing player stats via schedule...");
    let current_time = ctx.timestamp;
    let world_states = ctx.db.world_state();
    let campfires = ctx.db.campfire();

    // Pre-collect village campfire positions (at most 2 in the world: fishing + hunting).
    // Doing this once here avoids a full monument_part scan for every player.
    let village_campfire_positions: Vec<(f32, f32)> = {
        use crate::monument_part as MonumentPartTableTrait;
        use crate::MonumentType;
        ctx.db.monument_part().iter()
            .filter(|p| {
                (p.monument_type == MonumentType::FishingVillage || p.monument_type == MonumentType::HuntingVillage)
                    && p.part_type == "campfire"
            })
            .map(|p| (p.world_x, p.world_y))
            .collect()
    };

    let game_config_table = ctx.db.stat_thresholds_config();
    let config = game_config_table.iter().next()
        .ok_or_else(|| "StatThresholdsConfig not found. Critical error during stat processing.".to_string())?;
    let low_need_threshold = config.low_need_threshold;

    let world_state = world_states.iter().next()
        .ok_or_else(|| "WorldState not found during stat processing".to_string())?;

    for player_ref in players.iter() {
        let player_id = player_ref.identity;

        // CRITICAL FIX: Re-fetch player record at START to get latest position
        // This ensures all position-dependent calculations use current position
        let mut player = players.identity().find(&player_id)
            .expect("Player should exist during stats processing");

        // --- Clear stale hit time to prevent stuck white hit flash state ---
        // Hit effect duration is ~500ms (200ms shake + 300ms latency buffer)
        // BUT burn effects tick every 2 seconds, so we need to keep last_hit_time valid
        // between burn ticks to ensure client sees continuous damage feedback
        // Clear if older than 2.5 seconds (longer than burn tick interval of 2s)
        let mut should_clear_hit_time = false;
        if let Some(last_hit_time) = player.last_hit_time {
            let hit_age_micros = current_time.to_micros_since_unix_epoch()
                .saturating_sub(last_hit_time.to_micros_since_unix_epoch());
            let hit_age_ms = hit_age_micros / 1_000;
            
            if hit_age_ms > 2500 {
                // Hit effect has expired - mark for clearing to prevent stuck white state
                should_clear_hit_time = true;
                player.last_hit_time = None;
                log::trace!("Cleared stale last_hit_time for player {:?} (age: {}ms)", player_id, hit_age_ms);
            }
        }

        // --- Skip stat processing for offline players --- 
        if !player.is_online {
            log::trace!("Skipping stat processing for offline player {:?}", player_id);
            // Still update player to persist last_hit_time cleanup if it was cleared
            if should_clear_hit_time {
                players.identity().update(player.clone());
            }
            continue; // Move to the next player in the loop
        }

        if player.is_dead {
            // Still update player to persist last_hit_time cleanup if it was cleared
            if should_clear_hit_time {
                players.identity().update(player.clone());
            }
            continue;
        }

        // --- Skip stat decay for knocked out players (they are immune to environmental damage) ---
        if player.is_knocked_out {
            log::trace!("Skipping stat decay for knocked out player {:?} (immune to environmental damage)", player_id);
            // Still update the stat timestamp to prevent large future deltas when they recover
            player.last_stat_update = current_time;
            players.identity().update(player.clone());
            continue;
        }

        // Use the dedicated stat update timestamp
        let last_stat_update_time = player.last_stat_update;
        let elapsed_micros = current_time.to_micros_since_unix_epoch().saturating_sub(last_stat_update_time.to_micros_since_unix_epoch());

        let elapsed_seconds = (elapsed_micros as f64 / 1_000_000.0) as f32;

        // --- Calculate Stat Changes ---
        
        // Calculate hunger drain with cold multiplier
        let mut hunger_drain_rate = HUNGER_DRAIN_PER_SECOND;
        if player.warmth <= 0.0 {
            hunger_drain_rate *= HUNGER_DRAIN_MULTIPLIER_ZERO_WARMTH;
            log::trace!("Player {:?} is freezing - hunger drain increased by {:.1}x to {:.4}/sec", 
                player_id, HUNGER_DRAIN_MULTIPLIER_ZERO_WARMTH, hunger_drain_rate);
        } else if player.warmth < low_need_threshold {
            hunger_drain_rate *= HUNGER_DRAIN_MULTIPLIER_LOW_WARMTH;
            log::trace!("Player {:?} is cold - hunger drain increased by {:.1}x to {:.4}/sec", 
                player_id, HUNGER_DRAIN_MULTIPLIER_LOW_WARMTH, hunger_drain_rate);
        }
        
        // <<< BROTH EFFECT: StaminaBoost reduces hunger drain by 50% >>>
        if crate::active_effects::player_has_stamina_boost_effect(ctx, player_id) {
            hunger_drain_rate *= crate::active_effects::STAMINA_BOOST_DRAIN_REDUCTION;
            log::trace!("Player {:?} has StaminaBoost broth - hunger drain reduced by {:.0}% to {:.4}/sec", 
                player_id, (1.0 - crate::active_effects::STAMINA_BOOST_DRAIN_REDUCTION) * 100.0, hunger_drain_rate);
        }
        // <<< END BROTH EFFECT >>>
        
        let new_hunger = (player.hunger - (elapsed_seconds * hunger_drain_rate)).max(0.0).min(PLAYER_MAX_HUNGER);
        
        // Calculate thirst drain with tree cover reduction
        let mut thirst_drain_rate = THIRST_DRAIN_PER_SECOND;
        if crate::active_effects::player_has_tree_cover_effect(ctx, player_id) {
            thirst_drain_rate *= TREE_COVER_HYDRATION_REDUCTION_MULTIPLIER;
            log::trace!("Player {:?} has tree cover - thirst drain reduced by {:.0}% to {:.4}/sec", 
                player_id, (1.0 - TREE_COVER_HYDRATION_REDUCTION_MULTIPLIER) * 100.0, thirst_drain_rate);
        }
        
        // <<< BROTH EFFECT: StaminaBoost reduces thirst drain by 50% >>>
        if crate::active_effects::player_has_stamina_boost_effect(ctx, player_id) {
            thirst_drain_rate *= crate::active_effects::STAMINA_BOOST_DRAIN_REDUCTION;
            log::trace!("Player {:?} has StaminaBoost broth - thirst drain reduced by {:.0}% to {:.4}/sec", 
                player_id, (1.0 - crate::active_effects::STAMINA_BOOST_DRAIN_REDUCTION) * 100.0, thirst_drain_rate);
        }
        // <<< END BROTH EFFECT >>>
        
        let new_thirst = (player.thirst - (elapsed_seconds * thirst_drain_rate)).max(0.0).min(PLAYER_MAX_THIRST);

        // Calculate Warmth
        // BALANCED WARMTH LOGIC: Daytime safe, nighttime challenging but fair
        // Daytime: Strong warmth gain to offset rain
        // Nighttime: Slow drain gives time to find shelter/warmth sources
        let base_warmth_change_per_sec = match world_state.time_of_day {
            TimeOfDay::Midnight => -0.10,  // ~16.7 min to 0 warmth
            TimeOfDay::Night => -0.08,     // ~20.8 min to 0 warmth
            TimeOfDay::TwilightEvening => -0.03,  // ~55 min to 0 warmth
            TimeOfDay::Dusk => 0.2,        // Slight gain to offset rain (was 0.0)
            TimeOfDay::Afternoon => 1.2,   // Increased from 1.0 for better rain resistance
            TimeOfDay::Noon => 2.0,        // Peak warmth gain
            TimeOfDay::Morning => 1.2,     // Increased from 1.0 for better rain resistance
            TimeOfDay::TwilightMorning => 0.7,  // Increased from 0.5 for better rain resistance
            TimeOfDay::Dawn => 0.2,         // Slight gain to offset rain (was 0.0)
        };

        // <<< APPLY BIOME-BASED WARMTH DECAY MULTIPLIER >>>
        // Tundra and Alpine biomes have faster warmth decay (get colder faster)
        // This multiplier only affects NEGATIVE warmth changes - daytime warmth gain is unaffected
        let biome_multiplier = get_biome_warmth_multiplier(ctx, player.position_x, player.position_y);
        let mut biome_adjusted_warmth_change = if base_warmth_change_per_sec < 0.0 && biome_multiplier > 1.0 {
            let adjusted = base_warmth_change_per_sec * biome_multiplier;
            log::trace!(
                "Player {:?} in cold biome - warmth decay multiplied by {:.1}x (from {:.3} to {:.3} warmth/sec)",
                player_id, biome_multiplier, base_warmth_change_per_sec, adjusted
            );
            adjusted
        } else {
            base_warmth_change_per_sec
        };
        // <<< END BIOME-BASED WARMTH DECAY MULTIPLIER >>>
        
        // <<< BROTH EFFECT: WarmthBoost reduces warmth decay by 50% >>>
        if biome_adjusted_warmth_change < 0.0 && crate::active_effects::player_has_warmth_boost_effect(ctx, player_id) {
            let original = biome_adjusted_warmth_change;
            biome_adjusted_warmth_change *= crate::active_effects::WARMTH_BOOST_DECAY_REDUCTION;
            log::trace!("Player {:?} has WarmthBoost broth - warmth decay reduced by {:.0}% (from {:.3} to {:.3} warmth/sec)",
                player_id, (1.0 - crate::active_effects::WARMTH_BOOST_DECAY_REDUCTION) * 100.0, original, biome_adjusted_warmth_change);
        }
        // <<< END BROTH EFFECT >>>

        // Apply indoor warmth protection to reduce cold drain (but not eliminate it)
        let mut total_warmth_change_per_sec = biome_adjusted_warmth_change;
        if player.is_inside_building && biome_adjusted_warmth_change < 0.0 {
            // Reduce negative warmth drain by 35% when indoors (applies AFTER biome multiplier)
            total_warmth_change_per_sec = biome_adjusted_warmth_change * INDOOR_WARMTH_PROTECTION_MULTIPLIER;
            log::trace!(
                "Player {:?} is indoors - cold drain reduced by {:.0}% (from {:.2} to {:.2} warmth/sec)",
                player_id,
                (1.0 - INDOOR_WARMTH_PROTECTION_MULTIPLIER) * 100.0,
                biome_adjusted_warmth_change,
                total_warmth_change_per_sec
            );
        }

        for fire in campfires.iter() {
            // Only gain warmth from burning campfires
            if fire.is_burning {
                let dx = player.position_x - fire.pos_x;
                let dy = player.position_y - fire.pos_y;
                if (dx * dx + dy * dy) < WARMTH_RADIUS_SQUARED {
                    total_warmth_change_per_sec += WARMTH_PER_SECOND;
                    log::trace!("Player {:?} gaining warmth from campfire {}", player_id, fire.id);
                }
            }
        }

        // Village campfires (fishing/hunting) are always burning - same warmth gain, larger radius
        const VILLAGE_CAMPFIRE_WARMTH_RADIUS_SQ: f32 = 450.0 * 450.0;
        for &(vx, vy) in &village_campfire_positions {
            let dx = player.position_x - vx;
            let dy = player.position_y - vy;
            if (dx * dx + dy * dy) < VILLAGE_CAMPFIRE_WARMTH_RADIUS_SQ {
                total_warmth_change_per_sec += WARMTH_PER_SECOND;
                log::trace!("Player {:?} gaining warmth from village campfire at ({:.0}, {:.0})", player_id, vx, vy);
                break; // Only one village campfire can be in range at a time
            }
        }

        // <<< ADD WARMTH BONUS FROM LIT TORCH >>>
        if player.is_torch_lit {
            total_warmth_change_per_sec += TORCH_WARMTH_PER_SECOND;
            log::trace!("Player {:?} gaining {:.2} warmth/sec from lit torch.", player_id, TORCH_WARMTH_PER_SECOND);
        }
        // <<< END WARMTH BONUS FROM LIT TORCH >>>

        // <<< ADD WARMTH BONUS FROM ARMOR >>>
        let armor_warmth_bonus_per_interval = armor::calculate_total_warmth_bonus(ctx, player_id);
        // Assuming PLAYER_STAT_UPDATE_INTERVAL_SECS is the interval length in seconds for this stat processing.
        // If the bonus is defined as points per second, it can be added directly.
        // If it's meant as points per processing interval, then we divide by the interval.
        // For simplicity, let's assume warmth_bonus in ItemDefinition is points per second.
        if armor_warmth_bonus_per_interval > 0.0 {
            total_warmth_change_per_sec += armor_warmth_bonus_per_interval; 
            log::trace!(
                "Player {:?} gaining {:.2} warmth/sec from armor bonus.", 
                player_id, armor_warmth_bonus_per_interval
            );
        }
        // <<< END WARMTH BONUS FROM ARMOR >>>

        // <<< ADD COZY EFFECT MANAGEMENT >>>
        // Update cozy status based on proximity to campfires and owned shelters
        if let Err(e) = update_player_cozy_status(ctx, player_id, player.position_x, player.position_y) {
            log::warn!("Failed to update cozy status for player {:?}: {}", player_id, e);
        }
        // <<< END COZY EFFECT MANAGEMENT >>>

        // <<< ADD TREE COVER EFFECT MANAGEMENT >>>
        // Update tree cover status based on proximity to trees
        if let Err(e) = crate::active_effects::update_player_tree_cover_status(ctx, player_id, player.position_x, player.position_y) {
            log::warn!("Failed to update tree cover status for player {:?}: {}", player_id, e);
        }
        // <<< END TREE COVER EFFECT MANAGEMENT >>>

        // <<< ADD RUNE STONE ZONE EFFECT MANAGEMENT >>>
        // Update rune stone zone effects based on proximity to rune stones
        if let Err(e) = crate::active_effects::update_player_rune_stone_zone_effects(ctx, player_id, player.position_x, player.position_y) {
            log::warn!("Failed to update rune stone zone effects for player {:?}: {}", player_id, e);
        }
        // <<< END RUNE STONE ZONE EFFECT MANAGEMENT >>>

        // <<< ADD HOT SPRING HEALING EFFECT MANAGEMENT >>>
        // Update hot spring healing status based on player position
        if let Err(e) = crate::active_effects::update_player_hot_spring_status(ctx, player_id, player.position_x, player.position_y) {
            log::warn!("Failed to update hot spring status for player {:?}: {}", player_id, e);
        }
        // <<< END HOT SPRING HEALING EFFECT MANAGEMENT >>>

        // <<< ADD FUMAROLE WARMTH PROTECTION EFFECT MANAGEMENT >>>
        // Update fumarole warmth protection status based on player position
        if let Err(e) = crate::active_effects::update_player_fumarole_status(ctx, player_id, player.position_x, player.position_y) {
            log::warn!("Failed to update fumarole status for player {:?}: {}", player_id, e);
        }
        // <<< END FUMAROLE WARMTH PROTECTION EFFECT MANAGEMENT >>>

        // <<< ADD SAFE ZONE EFFECT MANAGEMENT >>>
        // Update safe zone status based on player position (near ALK monuments and fishing village)
        if let Err(e) = crate::active_effects::update_player_safe_zone_status(ctx, player_id, player.position_x, player.position_y) {
            log::warn!("Failed to update safe zone status for player {:?}: {}", player_id, e);
        }
        // <<< END SAFE ZONE EFFECT MANAGEMENT >>>
        
        // <<< ADD FISHING VILLAGE BONUS EFFECT MANAGEMENT >>>
        // Update fishing village bonus status based on player position (2x fishing hauls near Aleut village)
        if let Err(e) = crate::active_effects::update_player_fishing_village_status(ctx, player_id, player.position_x, player.position_y) {
            log::warn!("Failed to update fishing village bonus status for player {:?}: {}", player_id, e);
        }
        // <<< END FISHING VILLAGE BONUS EFFECT MANAGEMENT >>>
        
        // <<< ADD LAGUNOV'S GHOST (SHIPWRECK PROTECTION) EFFECT MANAGEMENT >>>
        // Update Lagunov's Ghost status based on player position (informational - hostile NPCs avoid shipwrecks)
        if let Err(e) = crate::active_effects::update_lagunov_ghost_status(ctx, player_id, player.position_x, player.position_y) {
            log::warn!("Failed to update Lagunov's Ghost status for player {:?}: {}", player_id, e);
        }
        // <<< END LAGUNOV'S GHOST EFFECT MANAGEMENT >>>
        
        // <<< ADD MEMORY BEACON SANITY EFFECT MANAGEMENT >>>
        // Update Memory Beacon sanity status based on player position (display-only - shows insanity immunity)
        if let Err(e) = crate::active_effects::update_player_memory_beacon_status(ctx, player_id, player.position_x, player.position_y) {
            log::warn!("Failed to update Memory Beacon sanity status for player {:?}: {}", player_id, e);
        }
        // <<< END MEMORY BEACON SANITY EFFECT MANAGEMENT >>>

        // <<< ADD COOKING STATION PROXIMITY EFFECT MANAGEMENT >>>
        // Update cooking station status based on player position (enables advanced food recipes)
        if let Err(e) = crate::active_effects::update_cooking_station_proximity(ctx, player_id, player.position_x, player.position_y) {
            log::warn!("Failed to update cooking station proximity for player {:?}: {}", player_id, e);
        }
        // <<< END COOKING STATION PROXIMITY EFFECT MANAGEMENT >>>

        // <<< HOT SPRING COLD IMMUNITY & WARMTH RECOVERY >>>
        // Players in hot springs are immune to ALL cold effects AND gain warmth rapidly
        let is_in_hot_spring = crate::active_effects::player_has_hot_spring_effect(ctx, player_id);
        if is_in_hot_spring {
            // Neutralize ALL negative warmth changes - hot springs provide complete cold immunity
            if total_warmth_change_per_sec < 0.0 {
                log::info!("Player {:?} in hot spring - negating {:.2} warmth drain (COLD IMMUNE)", 
                    player_id, total_warmth_change_per_sec);
                total_warmth_change_per_sec = 0.0; // No warmth loss in hot springs!
            }
            // Add rapid warmth recovery (8.0 warmth/sec - same as fumaroles)
            const HOT_SPRING_WARMTH_PER_SECOND: f32 = 8.0;
            total_warmth_change_per_sec += HOT_SPRING_WARMTH_PER_SECOND;
            log::info!("Player {:?} gaining {:.2} warmth/sec from hot spring (total warmth change: {:.2})", 
                player_id, HOT_SPRING_WARMTH_PER_SECOND, total_warmth_change_per_sec);
        }
        // <<< END HOT SPRING COLD IMMUNITY & WARMTH RECOVERY >>>

        // <<< FUMAROLE WARMTH PROTECTION & RECOVERY >>>
        // Players near fumaroles are protected from ALL warmth decay AND gain warmth rapidly
        let is_near_fumarole = crate::active_effects::player_has_fumarole_effect(ctx, player_id);
        if is_near_fumarole {
            // Neutralize ALL negative warmth changes - fumaroles provide complete warmth protection
            if total_warmth_change_per_sec < 0.0 {
                log::info!("Player {:?} near fumarole - negating {:.2} warmth drain (WARMTH PROTECTED)", 
                    player_id, total_warmth_change_per_sec);
                total_warmth_change_per_sec = 0.0; // No warmth loss near fumaroles!
            }
            // Add rapid warmth recovery (8.0 warmth/sec - 60% faster than campfires, similar feel to hot springs)
            const FUMAROLE_WARMTH_PER_SECOND: f32 = 8.0;
            total_warmth_change_per_sec += FUMAROLE_WARMTH_PER_SECOND;
            log::info!("Player {:?} gaining {:.2} warmth/sec from fumarole (total warmth change: {:.2})", 
                player_id, FUMAROLE_WARMTH_PER_SECOND, total_warmth_change_per_sec);
        }
        // <<< END FUMAROLE WARMTH PROTECTION & RECOVERY >>>

        // <<< WET EFFECT MANAGEMENT MOVED TO EFFECT PROCESSING SYSTEM >>>
        // Wet effects are now handled in active_effects.rs every 2 seconds
        // This prevents conflicts between the 1-second player stats and 2-second effect processing
        // <<< END WET EFFECT MANAGEMENT >>>

        // <<< ADD RAIN WARMTH DRAIN >>>
        // Only apply if NOT in hot spring (hot springs provide immunity)
        if !is_in_hot_spring {
            let rain_warmth_drain = world_state::get_rain_warmth_drain_modifier(ctx, player.position_x, player.position_y);
            log::info!("Rain warmth drain check: player at ({:.1}, {:.1}), drain = {:.2}", player.position_x, player.position_y, rain_warmth_drain);
            if rain_warmth_drain > 0.0 {
                total_warmth_change_per_sec -= rain_warmth_drain; // Subtract rain drain
                log::info!(
                    "Player {:?} losing {:.2} warmth/sec from rain (total warmth change now: {:.2})", 
                    player_id, rain_warmth_drain, total_warmth_change_per_sec
                );
            } else {
                log::info!("Player {:?} protected from rain or no rain active", player_id);
            }
        }
        // <<< END RAIN WARMTH DRAIN >>>

        // <<< ADD WET EFFECT WARMTH DRAIN >>>
        // Only apply if NOT in hot spring (hot springs provide immunity)
        if !is_in_hot_spring && crate::active_effects::player_has_wet_effect(ctx, player_id) {
            total_warmth_change_per_sec -= crate::wet::WET_WARMTH_DRAIN_PER_SECOND;
            log::trace!("Player {:?} losing {:.2} warmth/sec from being wet (total warmth change now: {:.2})", 
                player_id, crate::wet::WET_WARMTH_DRAIN_PER_SECOND, total_warmth_change_per_sec);
        }
        // <<< END WET EFFECT WARMTH DRAIN >>>

        let new_warmth = (player.warmth + (total_warmth_change_per_sec * elapsed_seconds))
                         .max(0.0).min(100.0);

        // <<< INSANITY SYSTEM: Time-based scaling with rapid recovery mechanics >>>
        // Design: Quick in-and-out shard runs are safe, long hauls are dangerous
        // Dropping shards quickly = rapid recovery (if under 50%), but getting greedy = slow recovery
        
        // Count memory shards in player's inventory/hotbar (not in chests)
        let memory_shard_name = "Memory Shard";
        let memory_shard_def_id = ctx.db.item_definition().iter()
            .find(|def| def.name == memory_shard_name)
            .map(|def| def.id);
        
        let mut memory_shard_count = 0u32;
        if let Some(def_id) = memory_shard_def_id {
            for inventory_item in ctx.db.inventory_item().iter() {
                // Only count items in inventory or hotbar (not chests, equipment, etc.)
                match &inventory_item.location {
                    crate::models::ItemLocation::Inventory(data) if data.owner_id == player_id => {
                        if inventory_item.item_def_id == def_id {
                            memory_shard_count += inventory_item.quantity;
                        }
                    }
                    crate::models::ItemLocation::Hotbar(data) if data.owner_id == player_id => {
                        if inventory_item.item_def_id == def_id {
                            memory_shard_count += inventory_item.quantity;
                        }
                    }
                    _ => {} // Ignore items in chests, equipment, etc.
                }
            }
        }
        
        // SOVA 200 Memory Shards Tutorial: First time player holds 200+ shards
        // Warns about mind instability, purple vision, dropping/storing, and Memory Grid (G key)
        let mut triggered_200_shard_tutorial = false;
        if memory_shard_count >= 200
            && !crate::has_seen_tutorial(&player, crate::TUTORIAL_ID_MEMORY_SHARD_200)
        {
            crate::sound_events::emit_sova_memory_shard_200_tutorial_sound(
                ctx,
                player.position_x,
                player.position_y,
                player_id,
            );
            triggered_200_shard_tutorial = true;
            log::info!("[SOVA Tutorial] 200 memory shards tutorial triggered for player {:?}", player_id);
        }

        // Track shard carry start time for time-based insanity scaling
        // NOTE: Only track time when carrying ENOUGH shards to trigger insanity (100+)
        let mut shard_carry_start_time_to_update = player.shard_carry_start_time;
        
        // Update shard carry start time tracking
        // Only start tracking when player has enough shards to trigger insanity
        if memory_shard_count >= INSANITY_MINIMUM_SHARD_THRESHOLD && player.shard_carry_start_time.is_none() {
            // Started carrying enough shards for insanity - record the time
            shard_carry_start_time_to_update = Some(current_time);
            log::info!("Player {:?} started carrying {} memory shards (>= {} threshold)", player_id, memory_shard_count, INSANITY_MINIMUM_SHARD_THRESHOLD);
        } else if memory_shard_count < INSANITY_MINIMUM_SHARD_THRESHOLD && player.shard_carry_start_time.is_some() {
            // Dropped below threshold - clear the time
            shard_carry_start_time_to_update = None;
            log::info!("Player {:?} dropped below {} memory shard threshold (now has {})", player_id, INSANITY_MINIMUM_SHARD_THRESHOLD, memory_shard_count);
        }
        
        // Calculate insanity change: increases when holding ENOUGH shards (100+) with TIME-BASED SCALING
        // IMPORTANT: Insanity does NOT build up if you have less than 100 shards (new player friendly)
        // IMPORTANT: Insanity increase is HALTED while in ALK station safe zones
        let mut insanity_change_per_sec = 0.0;
        
        // Check if player is in an ALK station safe zone (central compound or substations)
        let is_in_alk_safe_zone = crate::active_effects::is_player_in_safe_zone(ctx, player.position_x, player.position_y);
        
        // Only increase insanity if carrying 100+ shards AND not in a safe zone
        if memory_shard_count >= INSANITY_MINIMUM_SHARD_THRESHOLD && !is_in_alk_safe_zone {
            // Calculate time-based multiplier: the longer you carry shards, the worse it gets
            // This creates urgency to drop off shards regularly rather than hoarding
            let time_multiplier = if let Some(start_time) = shard_carry_start_time_to_update {
                let carry_time_micros = current_time.to_micros_since_unix_epoch()
                    .saturating_sub(start_time.to_micros_since_unix_epoch());
                let carry_time_seconds = carry_time_micros as f32 / 1_000_000.0;
                
                // Logarithmic-exponential hybrid: starts slow, accelerates, then caps
                // Formula: 1.0 + (time / scale)^0.7, capped at max
                // 0 min = 1x, 5 min = 2.5x, 10 min = 5x, 15 min = 7x, 20+ min = 8x
                let time_factor = (carry_time_seconds / INSANITY_TIME_SCALE_SECONDS).powf(0.7);
                (1.0 + time_factor * (INSANITY_TIME_MULTIPLIER_MAX - 1.0)).min(INSANITY_TIME_MULTIPLIER_MAX)
            } else {
                1.0 // No time tracked yet
            };
            
            // Shard count scaling with diminishing returns
            // Formula: shard_count^0.35 means: 1 shard = 1x, 10 shards = 2.2x, 100 shards = 4.5x
            let shard_count_f32 = memory_shard_count as f32;
            let shard_multiplier = shard_count_f32.powf(INSANITY_SHARD_SCALING_EXPONENT);
            
            // Final insanity increase = base * shard_multiplier * time_multiplier
            // No exponential current-insanity factor - time already creates enough pressure
            insanity_change_per_sec = INSANITY_BASE_INCREASE_PER_SECOND * shard_multiplier * time_multiplier;
            
            log::trace!(
                "Player {:?} insanity: {} shards, time_mult={:.2}x, shard_mult={:.2}x, rate={:.4}/sec",
                player_id, memory_shard_count, time_multiplier, shard_multiplier, insanity_change_per_sec
            );
        } else if memory_shard_count >= INSANITY_MINIMUM_SHARD_THRESHOLD && is_in_alk_safe_zone {
            // Player is holding enough shards but in ALK safe zone - insanity increase is halted
            // Time multiplier continues to accumulate (they're still carrying shards)
            // This gives players time to rest after completing contracts before heading back to base
            insanity_change_per_sec = 0.0;
            log::trace!("Player {:?} is in ALK safe zone - insanity increase halted (holding {} shards)", 
                player_id, memory_shard_count);
        } else if memory_shard_count > 0 && memory_shard_count < INSANITY_MINIMUM_SHARD_THRESHOLD {
            // Player has shards but not enough to trigger insanity (new player friendly!)
            // Still allow insanity to decay if they had it before
            let current_insanity = player.insanity;
            
            if current_insanity > 0.0 {
                if current_insanity < INSANITY_RAPID_DECAY_THRESHOLD {
                    insanity_change_per_sec = -INSANITY_RAPID_DECAY_PER_SECOND;
                } else {
                    insanity_change_per_sec = -INSANITY_SLOW_DECAY_PER_SECOND;
                }
                log::trace!(
                    "Player {:?} has {} shards (below {} threshold) - insanity decaying at {:.2}/sec",
                    player_id, memory_shard_count, INSANITY_MINIMUM_SHARD_THRESHOLD, insanity_change_per_sec
                );
            }
        } else {
            // Not holding memory shards - DECAY insanity
            // KEY MECHANIC: Rapid decay if under 50%, slow decay if 50%+
            // This rewards quick drop-offs and punishes getting too greedy
            let current_insanity = player.insanity;
            
            if current_insanity > 0.0 {
                if current_insanity < INSANITY_RAPID_DECAY_THRESHOLD {
                    // Below 50% - rapid recovery (safe play rewarded)
                    // Can go from 50% to 0% in ~25 seconds
                    insanity_change_per_sec = -INSANITY_RAPID_DECAY_PER_SECOND;
                    log::trace!(
                        "Player {:?} insanity rapid decay: {:.1}% -> rate={:.2}/sec (below threshold)",
                        player_id, current_insanity, insanity_change_per_sec
                    );
                } else {
                    // 50%+ - slow recovery (punishment for getting greedy)
                    // Takes ~2.4 minutes to recover from 100% to 50%
                    insanity_change_per_sec = -INSANITY_SLOW_DECAY_PER_SECOND;
                    log::trace!(
                        "Player {:?} insanity slow decay: {:.1}% -> rate={:.2}/sec (above threshold)",
                        player_id, current_insanity, insanity_change_per_sec
                    );
                }
            }
        }
        
        // MEMORY BEACON SANITY HAVEN: If player is inside an active Memory Beacon zone,
        // immediately clear all insanity and prevent any accumulation.
        // This is the unique benefit of Memory Beacons over Signal Disruptors.
        let is_in_memory_beacon_zone = crate::wild_animal_npc::hostile_spawning::is_position_in_memory_beacon_zone(
            ctx, player.position_x, player.position_y
        );
        
        let new_insanity = if is_in_memory_beacon_zone {
            // Memory Beacon zone: immediately nuke insanity to 0
            if player.insanity > 0.0 {
                log::info!("Player {:?} is in Memory Beacon zone - insanity cleared ({:.1}% -> 0%)", 
                    player_id, player.insanity);
            }
            0.0
        } else {
            // Normal insanity calculation
            (player.insanity + (insanity_change_per_sec * elapsed_seconds))
                .max(0.0).min(PLAYER_MAX_INSANITY)
        };
        
        // Detect insanity threshold crossings for SOVA sound triggers (client-side sounds)
        // Check thresholds in descending order to catch the highest one crossed
        let mut new_threshold = player.last_insanity_threshold;
        if new_insanity >= INSANITY_THRESHOLD_100 && player.last_insanity_threshold < INSANITY_THRESHOLD_100 {
            new_threshold = INSANITY_THRESHOLD_100;
            log::info!("Player {:?} crossed insanity threshold 100% - SOVA sound trigger", player_id);
        } else if new_insanity >= INSANITY_THRESHOLD_90 && player.last_insanity_threshold < INSANITY_THRESHOLD_90 {
            new_threshold = INSANITY_THRESHOLD_90;
            log::info!("Player {:?} crossed insanity threshold 90% - SOVA sound trigger", player_id);
        } else if new_insanity >= INSANITY_THRESHOLD_75 && player.last_insanity_threshold < INSANITY_THRESHOLD_75 {
            new_threshold = INSANITY_THRESHOLD_75;
            log::info!("Player {:?} crossed insanity threshold 75% - SOVA sound trigger", player_id);
        } else if new_insanity >= INSANITY_THRESHOLD_50 && player.last_insanity_threshold < INSANITY_THRESHOLD_50 {
            new_threshold = INSANITY_THRESHOLD_50;
            log::info!("Player {:?} crossed insanity threshold 50% - SOVA sound trigger", player_id);
        } else if new_insanity >= INSANITY_THRESHOLD_25 && player.last_insanity_threshold < INSANITY_THRESHOLD_25 {
            new_threshold = INSANITY_THRESHOLD_25;
            log::info!("Player {:?} crossed insanity threshold 25% - SOVA sound trigger", player_id);
        }
        // Note: Thresholds reset when insanity drops below them (for re-triggering sounds)
        // This allows sounds to play again if player recovers and crosses threshold again
        else if new_insanity < player.last_insanity_threshold {
            // Reset threshold if insanity dropped below current threshold
            // Find the highest threshold still below current insanity
            if new_insanity < INSANITY_THRESHOLD_25 {
                new_threshold = 0.0;
            } else if new_insanity < INSANITY_THRESHOLD_50 {
                new_threshold = INSANITY_THRESHOLD_25;
            } else if new_insanity < INSANITY_THRESHOLD_75 {
                new_threshold = INSANITY_THRESHOLD_50;
            } else if new_insanity < INSANITY_THRESHOLD_90 {
                new_threshold = INSANITY_THRESHOLD_75;
            } else if new_insanity < INSANITY_THRESHOLD_100 {
                new_threshold = INSANITY_THRESHOLD_90;
            }
        }
        
        // Track insanity achievements when crossing thresholds (only on INCREASE, not decrease)
        // This triggers achievement unlocks for reaching each insanity level
        if new_threshold > player.last_insanity_threshold {
            if let Err(e) = crate::player_progression::track_insanity_threshold(ctx, player_id, new_threshold, new_insanity) {
                log::warn!("Failed to track insanity achievement for player {:?}: {}", player_id, e);
            }
        }
        
        // Check if insanity reached max - apply Entrainment effect (permanent debuff)
        if new_insanity >= PLAYER_MAX_INSANITY && !crate::active_effects::player_has_entrainment_effect(ctx, player_id) {
            log::warn!("Player {:?} reached maximum insanity ({:.1}) - applying Entrainment effect!", player_id, new_insanity);
            if let Err(e) = crate::active_effects::apply_entrainment_effect(ctx, player_id) {
                log::error!("Failed to apply Entrainment effect to player {:?}: {}", player_id, e);
            }
        }
        // <<< END INSANITY SYSTEM >>>

        // Stamina processing removed - players can sprint without stamina cost

        // <<< ADD EXHAUSTED EFFECT MANAGEMENT >>>
        // Update exhausted status based on low hunger, thirst, or warmth
        if let Err(e) = crate::active_effects::update_player_exhausted_status(ctx, player_id, new_hunger, new_thirst, new_warmth, low_need_threshold) {
            log::warn!("Failed to update exhausted status for player {:?}: {}", player_id, e);
        }
        // <<< END EXHAUSTED EFFECT MANAGEMENT >>>

        // Calculate Health
        let mut health_change_per_sec: f32 = 0.0;
        if new_thirst <= 0.0 {
            health_change_per_sec -= HEALTH_LOSS_PER_SEC_LOW_THIRST * HEALTH_LOSS_MULTIPLIER_AT_ZERO;
        } else if new_thirst < low_need_threshold {
            health_change_per_sec -= HEALTH_LOSS_PER_SEC_LOW_THIRST;
        }
        if new_hunger <= 0.0 {
            health_change_per_sec -= HEALTH_LOSS_PER_SEC_LOW_HUNGER * HEALTH_LOSS_MULTIPLIER_AT_ZERO;
        } else if new_hunger < low_need_threshold {
            health_change_per_sec -= HEALTH_LOSS_PER_SEC_LOW_HUNGER;
        }
        // <<< CHECK COLD IMMUNITY AND RESISTANCE FROM ARMOR >>>
        let has_cold_immunity = crate::armor::has_armor_immunity(ctx, player_id, crate::models::ImmunityType::Cold);
        let cold_resistance = crate::armor::calculate_cold_resistance(ctx, player_id);
        
        if new_warmth <= 0.0 {
            if has_cold_immunity {
                log::trace!("Player {:?} is immune to cold damage (armor immunity) despite warmth at {:.1}", player_id, new_warmth);
            } else {
                let mut cold_damage = HEALTH_LOSS_PER_SEC_LOW_WARMTH * HEALTH_LOSS_MULTIPLIER_AT_ZERO;
                // Apply wet effect multiplier to cold damage
                if crate::active_effects::player_has_wet_effect(ctx, player_id) {
                    cold_damage *= crate::wet::WET_COLD_DAMAGE_MULTIPLIER;
                    log::trace!("Player {:?} has wet effect - cold damage multiplied by {:.1}x (from {:.3} to {:.3}/sec)", 
                        player_id, crate::wet::WET_COLD_DAMAGE_MULTIPLIER, 
                        HEALTH_LOSS_PER_SEC_LOW_WARMTH * HEALTH_LOSS_MULTIPLIER_AT_ZERO, cold_damage);
                }
                // Apply cold resistance from armor (graduated based on pieces worn)
                cold_damage *= 1.0 - cold_resistance;
                if cold_resistance > 0.0 {
                    log::trace!("Player {:?} has {:.1}% cold resistance from armor, reducing cold damage to {:.3}/sec", 
                        player_id, cold_resistance * 100.0, cold_damage);
                }
                // <<< BROTH EFFECT: ColdResistance reduces cold damage by 50% >>>
                if crate::active_effects::player_has_cold_resistance_effect(ctx, player_id) {
                    cold_damage *= crate::active_effects::COLD_RESISTANCE_REDUCTION;
                    log::trace!("Player {:?} has ColdResistance broth - cold damage reduced by {:.0}% to {:.3}/sec", 
                        player_id, (1.0 - crate::active_effects::COLD_RESISTANCE_REDUCTION) * 100.0, cold_damage);
                }
                // <<< END BROTH EFFECT >>>
                health_change_per_sec -= cold_damage;
            }
        } else if new_warmth < WARMTH_DAMAGE_THRESHOLD {
            if has_cold_immunity {
                log::trace!("Player {:?} is immune to cold damage (armor immunity) despite low warmth at {:.1}", player_id, new_warmth);
            } else {
                let mut cold_damage = HEALTH_LOSS_PER_SEC_LOW_WARMTH;
                // Apply wet effect multiplier to cold damage
                if crate::active_effects::player_has_wet_effect(ctx, player_id) {
                    cold_damage *= crate::wet::WET_COLD_DAMAGE_MULTIPLIER;
                    log::trace!("Player {:?} has wet effect - cold damage multiplied by {:.1}x (from {:.3} to {:.3}/sec)", 
                        player_id, crate::wet::WET_COLD_DAMAGE_MULTIPLIER, HEALTH_LOSS_PER_SEC_LOW_WARMTH, cold_damage);
                }
                // Apply cold resistance from armor (graduated based on pieces worn)
                cold_damage *= 1.0 - cold_resistance;
                if cold_resistance > 0.0 {
                    log::trace!("Player {:?} has {:.1}% cold resistance from armor, reducing cold damage to {:.3}/sec", 
                        player_id, cold_resistance * 100.0, cold_damage);
                }
                // <<< BROTH EFFECT: ColdResistance reduces cold damage by 50% >>>
                if crate::active_effects::player_has_cold_resistance_effect(ctx, player_id) {
                    cold_damage *= crate::active_effects::COLD_RESISTANCE_REDUCTION;
                    log::trace!("Player {:?} has ColdResistance broth - cold damage reduced by {:.0}% to {:.3}/sec", 
                        player_id, (1.0 - crate::active_effects::COLD_RESISTANCE_REDUCTION) * 100.0, cold_damage);
                }
                // <<< END BROTH EFFECT >>>
                health_change_per_sec -= cold_damage;
            }
        }
        // <<< END COLD IMMUNITY CHECK >>>

        // Health recovery only if needs are met and not taking damage from any source
        if health_change_per_sec == 0.0 && // No damage from needs
           player.health >= HEALTH_RECOVERY_THRESHOLD && // ADDED: Only regen if health is already high
           new_hunger >= HUNGER_RECOVERY_THRESHOLD &&
           new_thirst >= THIRST_RECOVERY_THRESHOLD &&
           new_warmth >= low_need_threshold && // Ensure warmth is also at a decent level
           !player_has_damaging_effects(ctx, player_id) { // ADDED: No active damaging effects (bleed, burn, poisoning)
            
            let mut health_regen = HEALTH_RECOVERY_PER_SEC;
            
            // Apply cozy bonus to health regeneration
            if player_has_cozy_effect(ctx, player_id) {
                health_regen *= COZY_HEALTH_REGEN_MULTIPLIER;
                log::trace!(
                    "Player {:?} has cozy effect - health regen boosted from {:.3} to {:.3}/sec", 
                    player_id, HEALTH_RECOVERY_PER_SEC, health_regen
                );
            }
            
            health_change_per_sec += health_regen;
        }

        // <<< ADD HOT SPRING HEALING >>>
        // Hot springs provide continuous healing regardless of other conditions
        if crate::active_effects::player_has_hot_spring_effect(ctx, player_id) {
            const HOT_SPRING_HEAL_PER_SEC: f32 = 2.0; // Health points per second when in hot spring
            health_change_per_sec += HOT_SPRING_HEAL_PER_SEC;
            log::trace!(
                "Player {:?} in hot spring - gaining {:.2} health/sec", 
                player_id, HOT_SPRING_HEAL_PER_SEC
            );
        }
        // <<< END HOT SPRING HEALING >>>

        let health_change = health_change_per_sec * elapsed_seconds;
        let mut final_health = player.health + health_change;
        final_health = final_health.min(PLAYER_MAX_HEALTH); // Clamp health to max

        // --- Handle Death ---
        if final_health <= 0.0 && !player.is_dead {
            log::info!("Player {} ({:?}) died from stats decay (Health: {}).", 
                     player.username, player_id, final_health);
            player.is_dead = true;
            player.death_timestamp = Some(ctx.timestamp); // Set death timestamp

            // Drop active weapon on death (before clearing equipment and creating corpse)
            match crate::dropped_item::drop_active_weapon_on_death(ctx, player_id, player.position_x, player.position_y) {
                Ok(Some(item_name)) => log::info!("[PlayerDeath] Dropped active weapon '{}' for player {:?} dying from stats decay", item_name, player_id),
                Ok(None) => log::debug!("[PlayerDeath] No active weapon to drop for player {:?}", player_id),
                Err(e) => log::error!("[PlayerDeath] Failed to drop active weapon for player {:?}: {}", player_id, e),
            }

            // Clear active equipment reference
            match crate::active_equipment::clear_active_item_reducer(ctx, player_id) {
                Ok(_) => log::info!("[PlayerDeath] Active item cleared for player {}", player_id),
                Err(e) => log::error!("[PlayerDeath] Failed to clear active item for player {}: {}", player_id, e),
            }

            // Clear all active effects on death (bleed, venom, burns, healing, etc.)
            crate::active_effects::clear_all_effects_on_death(ctx, player_id);
            log::info!("[PlayerDeath] Cleared all active effects for dying player {:?}", player_id);

            // Create corpse
            match player_corpse::create_player_corpse(ctx, player_id, player.position_x, player.position_y, &player.username) {
                Ok(_) => {
                    log::info!("Successfully created corpse via stats decay for player {:?}", player_id);
                }
                Err(e) => {
                    log::error!("Failed to create corpse via stats decay for player {:?}: {}", player_id, e);
                }
            }

            // --- Create/Update DeathMarker ---
            let new_death_marker = death_marker::DeathMarker {
                player_id: player.identity, // Use player_id directly
                pos_x: player.position_x,
                pos_y: player.position_y,
                death_timestamp: ctx.timestamp,
                killed_by: None, // Environmental death - no killer
                death_cause: "Environment".to_string(), // Simple environmental death cause
            };
            let death_marker_table = ctx.db.death_marker();
            if death_marker_table.player_id().find(&player.identity).is_some() {
                death_marker_table.player_id().update(new_death_marker);
                log::info!("[DeathMarker] Updating death marker for player {:?} due to stats decay.", player.identity);
            } else {
                death_marker_table.insert(new_death_marker);
                log::info!("[DeathMarker] Inserting new death marker for player {:?} due to stats decay.", player.identity);
            }
            // --- End DeathMarker ---
            
            // --- Calculate Comparative Stats on Death ---
            let mut stats = crate::player_progression::get_or_init_player_stats(ctx, player_id);
            
            // Calculate survival time for this run
            let survival_time: u64 = if let Some(start_time) = stats.current_survival_start {
                let elapsed_micros = ctx.timestamp.to_micros_since_unix_epoch()
                    .saturating_sub(start_time.to_micros_since_unix_epoch());
                (elapsed_micros / 1_000_000) as u64 // Convert to seconds
            } else {
                0
            };
            
            // Update longest survival if this run was longer
            if survival_time > stats.longest_survival_seconds {
                stats.longest_survival_seconds = survival_time;
            }
            
            // Update longest survival and save stats before deaths tracking
            stats.updated_at = ctx.timestamp;
            ctx.db.player_stats().player_id().update(stats.clone());
            
            // Calculate percentile for survival time
            let all_survival_times: Vec<u64> = ctx.db.player_stats()
                .iter()
                .map(|s| s.longest_survival_seconds)
                .collect();
            let percentile = crate::player_progression::calculate_percentile(stats.longest_survival_seconds, &all_survival_times);
            
            // Send comparative stat notification
            let notif = crate::player_progression::ComparativeStatNotification {
                id: 0,
                player_id,
                stat_name: "Longest Survival".to_string(),
                player_value: stats.longest_survival_seconds,
                percentile,
                message: format!("Your longest survival was longer than {:.1}% of players", percentile),
                created_at: ctx.timestamp,
            };
            ctx.db.comparative_stat_notification().insert(notif);
            
            // Track deaths stat and check achievements (including first_death)
            if let Err(e) = crate::player_progression::track_stat_and_check_achievements(ctx, player_id, "deaths", 1) {
                log::error!("Failed to track death stat: {}", e);
            }
            // --- End Comparative Stats ---
        }

        // --- Track Survival Time for Daily Quest ---
        // OPTIMIZATION: Only check near minute boundaries to reduce DB lookups from 60/min to ~2/min
        // We check in the first 2 seconds of each minute to ensure we don't miss any minute crossings
        let seconds_into_minute = (current_time.to_micros_since_unix_epoch() / 1_000_000) % 60;
        if seconds_into_minute < 2 {
            let stats_table = ctx.db.player_stats();
            let mut player_stats = crate::player_progression::get_or_init_player_stats(ctx, player_id);
            
            // Calculate total minutes survived since current_survival_start
            if let Some(start_time) = player_stats.current_survival_start {
                let elapsed_micros = current_time.to_micros_since_unix_epoch()
                    .saturating_sub(start_time.to_micros_since_unix_epoch());
                let total_seconds_survived = elapsed_micros / 1_000_000;
                let total_minutes_survived = (total_seconds_survived / 60) as u32;
                
                // If we've survived new minutes, track them for the quest
                if total_minutes_survived > player_stats.survival_quest_minutes_tracked {
                    let new_minutes = total_minutes_survived - player_stats.survival_quest_minutes_tracked;
                    
                    // Track quest progress for SurviveMinutes
                    if let Err(e) = crate::quests::track_quest_progress(
                        ctx,
                        player_id,
                        crate::quests::QuestObjectiveType::SurviveMinutes,
                        None,
                        new_minutes,
                    ) {
                        log::warn!("Failed to track SurviveMinutes quest progress for player {:?}: {}", player_id, e);
                    } else {
                        log::trace!("Tracked {} new survival minutes for player {:?} (total: {})", 
                            new_minutes, player_id, total_minutes_survived);
                    }
                    
                    // Update the tracked minutes
                    player_stats.survival_quest_minutes_tracked = total_minutes_survived;
                    player_stats.updated_at = current_time;
                    stats_table.player_id().update(player_stats);
                }
            }
        }
        // --- End Survival Time Tracking ---
        
        // --- Update Player Table ---

        let stats_changed = (player.health - final_health).abs() > 0.01 ||
                            (player.hunger - new_hunger).abs() > 0.01 ||
                            (player.thirst - new_thirst).abs() > 0.01 ||
                            (player.warmth - new_warmth).abs() > 0.01 ||
                            (player.insanity - new_insanity).abs() > 0.01 ||
                            (player.last_insanity_threshold - new_threshold).abs() > 0.01 ||
                            player.is_dead; // Also update if other stats changed OR if player died

        if stats_changed {
            // CRITICAL FIX: Only update the specific fields that changed to prevent race conditions
            // with movement system that updates position simultaneously
            
            // Re-fetch the current player record to get the latest position/direction
            let mut current_player = players.identity().find(&player_id)
                .expect("Player should exist during stats update");
            
            // Only update the stats fields, preserving position and direction
            current_player.health = final_health;
            current_player.hunger = new_hunger;
            current_player.thirst = new_thirst;
            current_player.warmth = new_warmth;
            current_player.insanity = new_insanity;
            current_player.last_insanity_threshold = new_threshold;
            current_player.shard_carry_start_time = shard_carry_start_time_to_update;
            if triggered_200_shard_tutorial {
                crate::mark_tutorial_seen_in_player(&mut current_player, crate::TUTORIAL_ID_MEMORY_SHARD_200);
            }
            current_player.is_dead = player.is_dead;
            current_player.death_timestamp = player.death_timestamp;
            current_player.last_stat_update = current_time;
            // Preserve cleared last_hit_time if it was cleared above
            // Only clear if the current player's hit time is still stale (to avoid overwriting new hits)
            // Use 2500ms threshold to match burn tick interval (2s) + buffer
            if should_clear_hit_time {
                if let Some(current_hit_time) = current_player.last_hit_time {
                    let current_hit_age_micros = current_time.to_micros_since_unix_epoch()
                        .saturating_sub(current_hit_time.to_micros_since_unix_epoch());
                    let current_hit_age_ms = current_hit_age_micros / 1_000;
                    if current_hit_age_ms > 2500 {
                        current_player.last_hit_time = None;
                    }
                } else {
                    current_player.last_hit_time = None;
                }
            }

            players.identity().update(current_player);
            log::trace!("[StatsUpdate] Updated stats for player {:?}. Health: {:.1}, Hunger: {:.1}, Thirst: {:.1}, Warmth: {:.1}, Dead: {}",
                      player_id, final_health, new_hunger, new_thirst, new_warmth, player.is_dead);
        } else {
             log::trace!("No significant stat changes for player {:?}, skipping update.", player_id);
             // Re-fetch current player record to avoid overwriting position updates
             let mut current_player = players.identity().find(&player_id)
                 .expect("Player should exist during stats update");
             current_player.last_stat_update = current_time;
             if triggered_200_shard_tutorial {
                 crate::mark_tutorial_seen_in_player(&mut current_player, crate::TUTORIAL_ID_MEMORY_SHARD_200);
             }
             // Only clear last_hit_time if we explicitly marked it for clearing (stale hit time)
             // AND the current value is still stale - don't overwrite NEW hits from other reducers
             // Use 2500ms threshold to match burn tick interval (2s) + buffer
             if should_clear_hit_time {
                 if let Some(current_hit_time) = current_player.last_hit_time {
                     let current_hit_age_micros = current_time.to_micros_since_unix_epoch()
                         .saturating_sub(current_hit_time.to_micros_since_unix_epoch());
                     let current_hit_age_ms = current_hit_age_micros / 1_000;
                     if current_hit_age_ms > 2500 {
                         current_player.last_hit_time = None;
                     }
                 }
             }
             players.identity().update(current_player);
             log::trace!("Updated player {:?} last_stat_update timestamp anyway.", player_id);
        }
    }

    // Note: Matron's Chest (hearth) no longer provides cozy effect - removed hearth cozy update

    // No rescheduling needed here, the table's ScheduleAt::Interval handles it
    Ok(())
}

pub const PLAYER_MAX_HEALTH: f32 = 100.0; // Define MAX_HEALTH here