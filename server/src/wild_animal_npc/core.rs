/******************************************************************************
 *                                                                            *
 * Core Wild Animal NPC System - Shared AI Framework                         *
 *                                                                            *
 * Provides the base framework for wild animals with extensible behaviors     *
 * through species-specific trait implementations. Handles core AI loop,      *
 * movement, collision detection, and database operations.                    *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{table, reducer, ReducerContext, Identity, Timestamp, Table, ScheduleAt, TimeDuration};
use std::time::Duration;
use std::f32::consts::PI;
use log;
use rand::{Rng, SeedableRng};

// Core game imports
use crate::{Player, PLAYER_RADIUS, WORLD_WIDTH_PX, WORLD_HEIGHT_PX};
use crate::utils::get_distance_squared;
use crate::sound_events::{self, SoundType};
use crate::spatial_grid::{SpatialGrid, EntityType};
use crate::fishing::is_water_tile;
use crate::shelter::{is_player_inside_shelter, SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y, SHELTER_AABB_HALF_WIDTH, SHELTER_AABB_HALF_HEIGHT};
use crate::animal_collision::{
    resolve_animal_collision, 
    validate_animal_spawn_position, 
    can_animal_move_to_position,
    check_animal_collision,
    check_player_collision,
    check_shelter_collision,
};

// Table trait imports
use crate::player as PlayerTableTrait;
use crate::wild_animal_npc::wild_animal as WildAnimalTableTrait;
use crate::wild_animal_npc::wild_animal_ai_schedule as WildAnimalAiScheduleTableTrait;
use crate::death_marker::death_marker as DeathMarkerTableTrait;
use crate::shelter::shelter as ShelterTableTrait;
use crate::active_equipment::active_equipment as ActiveEquipmentTableTrait;
use crate::items::item_definition as ItemDefinitionTableTrait;
use crate::campfire::campfire as CampfireTableTrait;
use crate::campfire::Campfire; // ADDED: Concrete type for pre-fetching
use crate::dropped_item::dropped_item as DroppedItemTableTrait; // Add dropped item table trait
use crate::building::foundation_cell as FoundationCellTableTrait; // ADDED: For foundation fear
use crate::building::FoundationCell; // ADDED: Concrete type for pre-fetching
// Import player progression table traits
use crate::player_progression::player_stats as PlayerStatsTableTrait;

// Collision detection constants
const ANIMAL_COLLISION_RADIUS: f32 = 32.0; // Animals maintain 32px distance from each other
const ANIMAL_PLAYER_COLLISION_RADIUS: f32 = 40.0; // Animals maintain 40px distance from players
const COLLISION_PUSHBACK_FORCE: f32 = 20.0; // How far to push back when colliding

// Fire fear constants
const FIRE_FEAR_RADIUS: f32 = 200.0; // Animals fear fire within 200px (4 tiles)
const FIRE_FEAR_RADIUS_SQUARED: f32 = FIRE_FEAR_RADIUS * FIRE_FEAR_RADIUS;
const TORCH_FEAR_RADIUS: f32 = 120.0; // Smaller fear radius for torches
const TORCH_FEAR_RADIUS_SQUARED: f32 = TORCH_FEAR_RADIUS * TORCH_FEAR_RADIUS;
const FOUNDATION_FEAR_RADIUS: f32 = 100.0; // Animals fear foundations within 100px (smaller than fire)
const FOUNDATION_FEAR_RADIUS_SQUARED: f32 = FOUNDATION_FEAR_RADIUS * FOUNDATION_FEAR_RADIUS;
const GROUP_COURAGE_THRESHOLD: usize = 3; // 3+ animals = ignore fire fear
const GROUP_DETECTION_RADIUS: f32 = 300.0; // Distance to count group members

// Pack behavior constants  
const PACK_FORMATION_RADIUS: f32 = 400.0; // Distance wolves can form packs (increased for better encounters)
const PACK_FORMATION_CHANCE: f32 = 0.20; // 20% chance per encounter to form pack (increased)
const PACK_DISSOLUTION_CHANCE: f32 = 0.03; // 3% chance per AI tick for wolf to leave pack (reduced for longer packs)
const PACK_CHECK_INTERVAL_MS: i64 = 5000; // Check pack formation/dissolution every 5 seconds (longer intervals)
const MAX_PACK_SIZE: usize = 5; // Maximum wolves per pack (epic threat requiring 4-5 coordinated players)
const PACK_COHESION_RADIUS: f32 = 350.0; // Distance pack members try to stay near alpha (increased with formation radius)

// Taming behavior constants
pub const TAMING_FOOD_DETECTION_RADIUS: f32 = 150.0; // How close animal needs to be to detect food
pub const TAMING_FOOD_DETECTION_RADIUS_SQUARED: f32 = TAMING_FOOD_DETECTION_RADIUS * TAMING_FOOD_DETECTION_RADIUS;
pub const TAMING_FOOD_CHECK_INTERVAL_MS: i64 = 500; // Check for food every 500ms
pub const TAMING_HEART_EFFECT_DURATION_MS: i64 = 3000; // Show hearts for 3 seconds after taming
pub const TAMING_FOLLOW_DISTANCE: f32 = 100.0; // How close tamed animals follow their owner
pub const TAMING_FOLLOW_DISTANCE_SQUARED: f32 = TAMING_FOLLOW_DISTANCE * TAMING_FOLLOW_DISTANCE;
pub const TAMING_PROTECT_RADIUS: f32 = 300.0; // How far tamed animals will go to protect owner
pub const TAMING_PROTECT_RADIUS_SQUARED: f32 = TAMING_PROTECT_RADIUS * TAMING_PROTECT_RADIUS;

// --- Constants ---
// PERFORMANCE OPTIMIZATION: Reduced from 125ms (8x/sec) to 500ms (2x/sec)
// This saves ~75% of reducer calls while client interpolation keeps movement smooth
pub const AI_TICK_INTERVAL_MS: u64 = 500; // AI processes 2 times per second (was 8x)
pub const MAX_ANIMALS_PER_CHUNK: u32 = 3;
pub const ANIMAL_SPAWN_COOLDOWN_SECS: u64 = 120; // 2 minutes between spawns

// VIEWPORT-BASED CULLING OPTIMIZATION
// Animals outside this range from ALL players are completely frozen (no processing)
// This is ~1.5x the viewport size to ensure smooth transitions as players move
const ANIMAL_ACTIVE_ZONE_RADIUS: f32 = 1400.0; // ~viewport diagonal + buffer
const ANIMAL_ACTIVE_ZONE_SQUARED: f32 = ANIMAL_ACTIVE_ZONE_RADIUS * ANIMAL_ACTIVE_ZONE_RADIUS;
// Minimum distance to a player for an animal to start wandering (vs staying still)
// Animals within active zone but outside this range will stay Idle (not wander)
const WANDER_ACTIVATION_DISTANCE: f32 = 900.0; // ~viewport width
const WANDER_ACTIVATION_DISTANCE_SQUARED: f32 = WANDER_ACTIVATION_DISTANCE * WANDER_ACTIVATION_DISTANCE;

// === ANIMAL WALKING SOUND CONSTANTS ===
// DISABLED: Animal walking sounds temporarily removed due to duplicate sound playback issues
// const ANIMAL_WALKING_SOUND_DISTANCE_THRESHOLD: f32 = 80.0; // Minimum distance for a footstep (normal walking)
// const ANIMAL_SPRINTING_SOUND_DISTANCE_THRESHOLD: f32 = 110.0; // Distance for footstep when sprinting (faster cadence)
// const ANIMAL_WALKING_SOUND_MIN_TIME_MS: u64 = 300; // Minimum time between footsteps (normal walking)
// const ANIMAL_SPRINTING_SOUND_MIN_TIME_MS: u64 = 250; // Minimum time between footsteps when sprinting

// Table to track walking sound cadence for each animal
// DISABLED: Animal walking sounds temporarily removed due to duplicate sound playback issues
// #[spacetimedb::table(name = animal_walking_sound_state, public)]
// #[derive(Clone, Debug)]
// pub struct AnimalWalkingSoundState {
//     #[primary_key]
//     animal_id: u64,
//     last_walking_sound_time_ms: u64,
//     total_distance_since_last_sound: f32, // Accumulated distance for cadence
//     last_pos_x: f32, // Track last position to calculate movement distance
//     last_pos_y: f32,
// }

// --- Pre-fetched AI Data (PERFORMANCE OPTIMIZATION) ---
// This struct holds all data pre-fetched once per AI tick to avoid repeated table scans
pub struct PreFetchedAIData {
    pub all_players: Vec<Player>,
    pub burning_campfires: Vec<Campfire>,
    pub active_foundations: Vec<FoundationCell>,
}

impl PreFetchedAIData {
    /// Pre-fetch all data needed for animal AI processing
    /// Called ONCE at the start of each AI tick, not per-animal
    pub fn fetch(ctx: &ReducerContext) -> Self {
        Self {
            all_players: ctx.db.player().iter()
                .filter(|p| !p.is_dead)
                .collect(),
            burning_campfires: ctx.db.campfire().iter()
                .filter(|c| c.is_burning && !c.is_destroyed)
                .collect(),
            active_foundations: ctx.db.foundation_cell().iter()
                .filter(|f| !f.is_destroyed)
                .collect(),
        }
    }
}

// --- Animal Types and Behaviors ---

#[derive(Debug, Clone, Copy, PartialEq, spacetimedb::SpacetimeType)]
pub enum AnimalSpecies {
    CinderFox,
    TundraWolf,
    CableViper,
    ArcticWalrus,
    BeachCrab,
    Tern,       // Scavenger bird that picks up dropped items and alerts other animals
    Crow,       // Thief bird that steals items from player inventory
}

#[derive(Debug, Clone, Copy, PartialEq, spacetimedb::SpacetimeType)]
pub enum AnimalState {
    Idle,          // Stationary - waiting for player to enter perception range (PERFORMANCE: no movement processing)
    Patrolling,
    Chasing,
    Attacking,
    Fleeing,
    Hiding,
    Burrowed,
    Investigating,
    Alert,
    Following,     // Following tamed player
    Protecting,    // Attacking enemies of tamed player
    Flying,        // Birds patrolling in flight over vast distances
    FlyingChase,   // Birds aggressively chasing players in flight
    Grounded,      // Birds on the ground - either still or walking in tiny circles
    Scavenging,    // Terns picking up dropped items
    Stealing,      // Crows stealing from player inventory
}

#[derive(Debug, Clone, Copy, PartialEq, spacetimedb::SpacetimeType)]
pub enum MovementPattern {
    Loop,
    Wander,
    FigureEight,
}

// --- Animal Statistics Structure ---
#[derive(Debug, Clone, spacetimedb::SpacetimeType)]
pub struct AnimalStats {
    pub max_health: f32,
    pub attack_damage: f32,
    pub attack_range: f32,
    pub attack_speed_ms: u64,
    pub movement_speed: f32,
    pub sprint_speed: f32,
    pub perception_range: f32,
    pub perception_angle_degrees: f32,
    pub patrol_radius: f32,
    pub chase_trigger_range: f32,
    pub flee_trigger_health_percent: f32,
    pub hide_duration_ms: u64,
}

// --- Main Animal Entity Table ---
#[spacetimedb::table(name = wild_animal, public)]
#[derive(Clone, Debug)]
pub struct WildAnimal {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub species: AnimalSpecies,
    pub pos_x: f32,
    pub pos_y: f32,
    pub direction_x: f32, // Normalized direction vector
    pub direction_y: f32,
    pub facing_direction: String, // "left", "right", "up", or "down" for directional sprites
    pub state: AnimalState,
    pub health: f32,
    pub spawn_x: f32, // Original spawn position for patrolling
    pub spawn_y: f32,
    pub target_player_id: Option<Identity>,
    pub last_attack_time: Option<Timestamp>,
    pub state_change_time: Timestamp,
    pub hide_until: Option<Timestamp>,
    pub investigation_x: Option<f32>, // Position being investigated
    pub investigation_y: Option<f32>,
    pub patrol_phase: f32, // For movement patterns (0.0 to 1.0)
    pub scent_ping_timer: u64, // For wolves' scent ability
    pub movement_pattern: MovementPattern,
    #[index(btree)]
    pub chunk_index: u32, // For spatial optimization
    pub created_at: Timestamp,
    pub last_hit_time: Option<Timestamp>, // For damage visual effects
    
    // Pack behavior fields
    pub pack_id: Option<u64>, // Pack this animal belongs to (None = solo)
    pub is_pack_leader: bool, // True if this animal is the alpha
    pub pack_join_time: Option<Timestamp>, // When this animal joined current pack
    pub last_pack_check: Option<Timestamp>, // Last time we checked for pack formation/dissolution
    
    // Fire fear override tracking
    pub fire_fear_overridden_by: Option<Identity>, // Player who caused fire fear override (None = normal fire fear)
    
    // Taming system fields
    pub tamed_by: Option<Identity>, // Player who tamed this animal (None = wild)
    pub tamed_at: Option<Timestamp>, // When this animal was tamed
    pub heart_effect_until: Option<Timestamp>, // When to stop showing heart effect
    pub crying_effect_until: Option<Timestamp>, // When to stop showing crying effect (hit by owner)
    pub last_food_check: Option<Timestamp>, // Last time we checked for nearby food
    
    // Bird scavenging/stealing system fields
    pub held_item_name: Option<String>, // Item name the bird is carrying (Tern scavenge / Crow steal)
    pub held_item_quantity: Option<u32>, // Quantity of the held item
    pub flying_target_x: Option<f32>, // Flying destination X for vast patrol distances
    pub flying_target_y: Option<f32>, // Flying destination Y for vast patrol distances
    pub is_flying: bool, // Whether the bird is currently in flight
}

// --- AI Processing Schedule Table ---
#[spacetimedb::table(name = wild_animal_ai_schedule, scheduled(process_wild_animal_ai))]
#[derive(Clone)]
pub struct WildAnimalAiSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

// --- Species-Specific Behavior Trait ---
pub trait AnimalBehavior {
    /// Get species-specific stats
    fn get_stats(&self) -> AnimalStats;
    
    /// Get movement pattern for this species
    fn get_movement_pattern(&self) -> MovementPattern;
    
    /// Handle species-specific attack effects
    fn execute_attack_effects(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        target_player: &Player,
        stats: &AnimalStats,
        current_time: Timestamp,
        rng: &mut impl Rng,
    ) -> Result<f32, String>; // Returns damage dealt
    
    /// Handle species-specific AI state logic
    fn update_ai_state_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        detected_player: Option<&Player>,
        current_time: Timestamp,
        rng: &mut impl Rng,
    ) -> Result<(), String>;
    
    /// Handle species-specific flee behavior
    fn execute_flee_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        dt: f32,
        current_time: Timestamp,
        rng: &mut impl Rng,
    );
    
    /// Handle species-specific patrol movement
    fn execute_patrol_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        dt: f32,
        rng: &mut impl Rng,
    );
    
    /// Determine if should chase player based on species behavior
    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool;
    
    /// Handle species-specific damage response
    fn handle_damage_response(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        attacker: &Player,
        stats: &AnimalStats,
        current_time: Timestamp,
        rng: &mut impl Rng,
    ) -> Result<(), String>;
    
    /// Check if this species can be tamed and with what food items
    fn can_be_tamed(&self) -> bool {
        false // Default: animals cannot be tamed
    }
    
    /// Get the food items that can tame this species
    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![] // Default: no taming foods
    }
    
    /// Get the chase abandonment distance multiplier for this species
    /// Multiplied by chase_trigger_range to determine when to give up chasing
    fn get_chase_abandonment_multiplier(&self) -> f32 {
        2.5 // Default: give up at 2.5x chase trigger range
    }
}

// --- Core Animal Behavior Implementation Helper ---
// Enum to hold all behavior types
pub enum AnimalBehaviorEnum {
    CinderFox(crate::wild_animal_npc::fox::CinderFoxBehavior),
    TundraWolf(crate::wild_animal_npc::wolf::TundraWolfBehavior),
    CableViper(crate::wild_animal_npc::viper::CableViperBehavior),
    ArcticWalrus(crate::wild_animal_npc::walrus::ArcticWalrusBehavior),
    BeachCrab(crate::wild_animal_npc::crab::BeachCrabBehavior),
    Tern(crate::wild_animal_npc::tern::TernBehavior),
    Crow(crate::wild_animal_npc::crow::CrowBehavior),
}

impl AnimalBehavior for AnimalBehaviorEnum {
    fn get_stats(&self) -> AnimalStats {
        match self {
            AnimalBehaviorEnum::CinderFox(behavior) => behavior.get_stats(),
            AnimalBehaviorEnum::TundraWolf(behavior) => behavior.get_stats(),
            AnimalBehaviorEnum::CableViper(behavior) => behavior.get_stats(),
            AnimalBehaviorEnum::ArcticWalrus(behavior) => behavior.get_stats(),
            AnimalBehaviorEnum::BeachCrab(behavior) => behavior.get_stats(),
            AnimalBehaviorEnum::Tern(behavior) => behavior.get_stats(),
            AnimalBehaviorEnum::Crow(behavior) => behavior.get_stats(),
        }
    }

    fn get_movement_pattern(&self) -> MovementPattern {
        match self {
            AnimalBehaviorEnum::CinderFox(behavior) => behavior.get_movement_pattern(),
            AnimalBehaviorEnum::TundraWolf(behavior) => behavior.get_movement_pattern(),
            AnimalBehaviorEnum::CableViper(behavior) => behavior.get_movement_pattern(),
            AnimalBehaviorEnum::ArcticWalrus(behavior) => behavior.get_movement_pattern(),
            AnimalBehaviorEnum::BeachCrab(behavior) => behavior.get_movement_pattern(),
            AnimalBehaviorEnum::Tern(behavior) => behavior.get_movement_pattern(),
            AnimalBehaviorEnum::Crow(behavior) => behavior.get_movement_pattern(),
        }
    }

    fn execute_attack_effects(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        target_player: &Player,
        stats: &AnimalStats,
        current_time: Timestamp,
        rng: &mut impl Rng,
    ) -> Result<f32, String> {
        match self {
            AnimalBehaviorEnum::CinderFox(behavior) => behavior.execute_attack_effects(ctx, animal, target_player, stats, current_time, rng),
            AnimalBehaviorEnum::TundraWolf(behavior) => behavior.execute_attack_effects(ctx, animal, target_player, stats, current_time, rng),
            AnimalBehaviorEnum::CableViper(behavior) => behavior.execute_attack_effects(ctx, animal, target_player, stats, current_time, rng),
            AnimalBehaviorEnum::ArcticWalrus(behavior) => behavior.execute_attack_effects(ctx, animal, target_player, stats, current_time, rng),
            AnimalBehaviorEnum::BeachCrab(behavior) => behavior.execute_attack_effects(ctx, animal, target_player, stats, current_time, rng),
            AnimalBehaviorEnum::Tern(behavior) => behavior.execute_attack_effects(ctx, animal, target_player, stats, current_time, rng),
            AnimalBehaviorEnum::Crow(behavior) => behavior.execute_attack_effects(ctx, animal, target_player, stats, current_time, rng),
        }
    }

    fn update_ai_state_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        detected_player: Option<&Player>,
        current_time: Timestamp,
        rng: &mut impl Rng,
    ) -> Result<(), String> {
        match self {
            AnimalBehaviorEnum::CinderFox(behavior) => behavior.update_ai_state_logic(ctx, animal, stats, detected_player, current_time, rng),
            AnimalBehaviorEnum::TundraWolf(behavior) => behavior.update_ai_state_logic(ctx, animal, stats, detected_player, current_time, rng),
            AnimalBehaviorEnum::CableViper(behavior) => behavior.update_ai_state_logic(ctx, animal, stats, detected_player, current_time, rng),
            AnimalBehaviorEnum::ArcticWalrus(behavior) => behavior.update_ai_state_logic(ctx, animal, stats, detected_player, current_time, rng),
            AnimalBehaviorEnum::BeachCrab(behavior) => behavior.update_ai_state_logic(ctx, animal, stats, detected_player, current_time, rng),
            AnimalBehaviorEnum::Tern(behavior) => behavior.update_ai_state_logic(ctx, animal, stats, detected_player, current_time, rng),
            AnimalBehaviorEnum::Crow(behavior) => behavior.update_ai_state_logic(ctx, animal, stats, detected_player, current_time, rng),
        }
    }

    fn execute_flee_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        dt: f32,
        current_time: Timestamp,
        rng: &mut impl Rng,
    ) {
        match self {
            AnimalBehaviorEnum::CinderFox(behavior) => behavior.execute_flee_logic(ctx, animal, stats, dt, current_time, rng),
            AnimalBehaviorEnum::TundraWolf(behavior) => behavior.execute_flee_logic(ctx, animal, stats, dt, current_time, rng),
            AnimalBehaviorEnum::CableViper(behavior) => behavior.execute_flee_logic(ctx, animal, stats, dt, current_time, rng),
            AnimalBehaviorEnum::ArcticWalrus(behavior) => behavior.execute_flee_logic(ctx, animal, stats, dt, current_time, rng),
            AnimalBehaviorEnum::BeachCrab(behavior) => behavior.execute_flee_logic(ctx, animal, stats, dt, current_time, rng),
            AnimalBehaviorEnum::Tern(behavior) => behavior.execute_flee_logic(ctx, animal, stats, dt, current_time, rng),
            AnimalBehaviorEnum::Crow(behavior) => behavior.execute_flee_logic(ctx, animal, stats, dt, current_time, rng),
        }
    }

    fn execute_patrol_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        dt: f32,
        rng: &mut impl Rng,
    ) {
        match self {
            AnimalBehaviorEnum::CinderFox(behavior) => behavior.execute_patrol_logic(ctx, animal, stats, dt, rng),
            AnimalBehaviorEnum::TundraWolf(behavior) => behavior.execute_patrol_logic(ctx, animal, stats, dt, rng),
            AnimalBehaviorEnum::CableViper(behavior) => behavior.execute_patrol_logic(ctx, animal, stats, dt, rng),
            AnimalBehaviorEnum::ArcticWalrus(behavior) => behavior.execute_patrol_logic(ctx, animal, stats, dt, rng),
            AnimalBehaviorEnum::BeachCrab(behavior) => behavior.execute_patrol_logic(ctx, animal, stats, dt, rng),
            AnimalBehaviorEnum::Tern(behavior) => behavior.execute_patrol_logic(ctx, animal, stats, dt, rng),
            AnimalBehaviorEnum::Crow(behavior) => behavior.execute_patrol_logic(ctx, animal, stats, dt, rng),
        }
    }

    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool {
        match self {
            AnimalBehaviorEnum::CinderFox(behavior) => behavior.should_chase_player(ctx, animal, stats, player),
            AnimalBehaviorEnum::TundraWolf(behavior) => behavior.should_chase_player(ctx, animal, stats, player),
            AnimalBehaviorEnum::CableViper(behavior) => behavior.should_chase_player(ctx, animal, stats, player),
            AnimalBehaviorEnum::ArcticWalrus(behavior) => behavior.should_chase_player(ctx, animal, stats, player),
            AnimalBehaviorEnum::BeachCrab(behavior) => behavior.should_chase_player(ctx, animal, stats, player),
            AnimalBehaviorEnum::Tern(behavior) => behavior.should_chase_player(ctx, animal, stats, player),
            AnimalBehaviorEnum::Crow(behavior) => behavior.should_chase_player(ctx, animal, stats, player),
        }
    }

    fn handle_damage_response(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        attacker: &Player,
        stats: &AnimalStats,
        current_time: Timestamp,
        rng: &mut impl Rng,
    ) -> Result<(), String> {
        match self {
            AnimalBehaviorEnum::CinderFox(behavior) => behavior.handle_damage_response(ctx, animal, attacker, stats, current_time, rng),
            AnimalBehaviorEnum::TundraWolf(behavior) => behavior.handle_damage_response(ctx, animal, attacker, stats, current_time, rng),
            AnimalBehaviorEnum::CableViper(behavior) => behavior.handle_damage_response(ctx, animal, attacker, stats, current_time, rng),
            AnimalBehaviorEnum::ArcticWalrus(behavior) => behavior.handle_damage_response(ctx, animal, attacker, stats, current_time, rng),
            AnimalBehaviorEnum::BeachCrab(behavior) => behavior.handle_damage_response(ctx, animal, attacker, stats, current_time, rng),
            AnimalBehaviorEnum::Tern(behavior) => behavior.handle_damage_response(ctx, animal, attacker, stats, current_time, rng),
            AnimalBehaviorEnum::Crow(behavior) => behavior.handle_damage_response(ctx, animal, attacker, stats, current_time, rng),
        }
    }

    fn can_be_tamed(&self) -> bool {
        match self {
            AnimalBehaviorEnum::CinderFox(behavior) => behavior.can_be_tamed(),
            AnimalBehaviorEnum::TundraWolf(behavior) => behavior.can_be_tamed(),
            AnimalBehaviorEnum::CableViper(behavior) => behavior.can_be_tamed(),
            AnimalBehaviorEnum::ArcticWalrus(behavior) => behavior.can_be_tamed(),
            AnimalBehaviorEnum::BeachCrab(behavior) => behavior.can_be_tamed(),
            AnimalBehaviorEnum::Tern(behavior) => behavior.can_be_tamed(),
            AnimalBehaviorEnum::Crow(behavior) => behavior.can_be_tamed(),
        }
    }

    fn get_taming_foods(&self) -> Vec<&'static str> {
        match self {
            AnimalBehaviorEnum::CinderFox(behavior) => behavior.get_taming_foods(),
            AnimalBehaviorEnum::TundraWolf(behavior) => behavior.get_taming_foods(),
            AnimalBehaviorEnum::CableViper(behavior) => behavior.get_taming_foods(),
            AnimalBehaviorEnum::ArcticWalrus(behavior) => behavior.get_taming_foods(),
            AnimalBehaviorEnum::BeachCrab(behavior) => behavior.get_taming_foods(),
            AnimalBehaviorEnum::Tern(behavior) => behavior.get_taming_foods(),
            AnimalBehaviorEnum::Crow(behavior) => behavior.get_taming_foods(),
        }
    }

    fn get_chase_abandonment_multiplier(&self) -> f32 {
        match self {
            AnimalBehaviorEnum::CinderFox(behavior) => behavior.get_chase_abandonment_multiplier(),
            AnimalBehaviorEnum::TundraWolf(behavior) => behavior.get_chase_abandonment_multiplier(),
            AnimalBehaviorEnum::CableViper(behavior) => behavior.get_chase_abandonment_multiplier(),
            AnimalBehaviorEnum::ArcticWalrus(behavior) => behavior.get_chase_abandonment_multiplier(),
            AnimalBehaviorEnum::BeachCrab(behavior) => behavior.get_chase_abandonment_multiplier(),
            AnimalBehaviorEnum::Tern(behavior) => behavior.get_chase_abandonment_multiplier(),
            AnimalBehaviorEnum::Crow(behavior) => behavior.get_chase_abandonment_multiplier(),
        }
    }
}

impl AnimalSpecies {
    pub fn get_behavior(&self) -> AnimalBehaviorEnum {
        match self {
            AnimalSpecies::CinderFox => AnimalBehaviorEnum::CinderFox(crate::wild_animal_npc::fox::CinderFoxBehavior),
            AnimalSpecies::TundraWolf => AnimalBehaviorEnum::TundraWolf(crate::wild_animal_npc::wolf::TundraWolfBehavior),
            AnimalSpecies::CableViper => AnimalBehaviorEnum::CableViper(crate::wild_animal_npc::viper::CableViperBehavior),
            AnimalSpecies::ArcticWalrus => AnimalBehaviorEnum::ArcticWalrus(crate::wild_animal_npc::walrus::ArcticWalrusBehavior),
            AnimalSpecies::BeachCrab => AnimalBehaviorEnum::BeachCrab(crate::wild_animal_npc::crab::BeachCrabBehavior),
            AnimalSpecies::Tern => AnimalBehaviorEnum::Tern(crate::wild_animal_npc::tern::TernBehavior),
            AnimalSpecies::Crow => AnimalBehaviorEnum::Crow(crate::wild_animal_npc::crow::CrowBehavior),
        }
    }

    // Backward compatibility methods - delegate to behavior trait
    pub fn get_stats(&self) -> AnimalStats {
        self.get_behavior().get_stats()
    }

    pub fn get_movement_pattern(&self) -> MovementPattern {
        self.get_behavior().get_movement_pattern()
    }
}

// --- Initialization Functions ---

pub fn init_wild_animal_ai_schedule(ctx: &ReducerContext) -> Result<(), String> {
    let schedule_table = ctx.db.wild_animal_ai_schedule();
    if schedule_table.iter().count() == 0 {
        log::info!("Starting wild animal AI schedule (every {}ms).", AI_TICK_INTERVAL_MS);
        let interval = Duration::from_millis(AI_TICK_INTERVAL_MS);
        crate::try_insert_schedule!(
            schedule_table,
            WildAnimalAiSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(TimeDuration::from(interval)),
            },
            "Wild animal AI"
        );
    }
    Ok(())
}

// --- AI Processing Reducer ---

#[spacetimedb::reducer]
pub fn process_wild_animal_ai(ctx: &ReducerContext, _schedule: WildAnimalAiSchedule) -> Result<(), String> {
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("Wild animal AI can only be processed by scheduler".to_string());
    }

    // PERFORMANCE OPTIMIZATION: Skip AI entirely if no players are online
    // This saves significant compute when the server is idle (nobody playing)
    let online_player_count = ctx.db.player().iter().filter(|p| p.is_online).count();
    if online_player_count == 0 {
        log::trace!("No players online - skipping animal AI processing to save resources.");
        return Ok(());
    }

    // Early return if there are no animals - prevents unnecessary processing
    let animal_count = ctx.db.wild_animal().iter().count();
    if animal_count == 0 {
        // No animals to process - stop the schedule to save resources
        // BUT: Don't delete the schedule - keep it running so it can restart when animals spawn
        // This fixes the issue where animals spawn but don't move because schedule was deleted
        log::debug!("No animals to process (count: {}). Schedule will continue running and restart when animals spawn.", animal_count);
        return Ok(());
    }

    let current_time = ctx.timestamp;
    let mut rng = rand::rngs::StdRng::seed_from_u64(
        (current_time.to_micros_since_unix_epoch() as u64).wrapping_add(42)
    );

    // PERFORMANCE OPTIMIZATION: Pre-fetch all data ONCE per AI tick
    // This eliminates thousands of redundant table scans per tick
    let prefetched = PreFetchedAIData::fetch(ctx);

    // Build spatial grid for efficient collision detection
    let mut spatial_grid = SpatialGrid::new();
    spatial_grid.populate_from_world(&ctx.db, current_time);

    // Process each animal
    let animals: Vec<WildAnimal> = ctx.db.wild_animal().iter().collect();
    
    for mut animal in animals {
        // CRITICAL FIX: Wrap each animal's processing in error handling to prevent one bad animal from stopping the entire AI system
        let animal_id = animal.id;
        let animal_species = animal.species;
        
        // VIEWPORT CULLING OPTIMIZATION: Skip animals far from all players
        // They remain frozen in place until a player gets close
        // Exception: Tamed animals always process (they follow their owner)
        // Exception: Animals actively chasing/fleeing should finish their action
        let is_tamed = animal.tamed_by.is_some();
        let is_active_state = matches!(animal.state, 
            AnimalState::Chasing | AnimalState::Attacking | AnimalState::Fleeing | 
            AnimalState::Following | AnimalState::Protecting | AnimalState::FlyingChase |
            AnimalState::Scavenging | AnimalState::Stealing
        );
        
        if !is_tamed && !is_active_state && !is_any_player_in_active_zone(&prefetched.all_players, &animal) {
            // Animal is far from all players and not doing anything important
            // Skip all processing - they stay frozen in place
            continue;
        }
        
        // Process this animal and catch any errors
        let process_result = (|| -> Result<(), String> {
            let behavior = animal.species.get_behavior();
            let stats = behavior.get_stats();
            
            // Find nearby players for perception checks (uses pre-fetched data)
            let nearby_players = find_nearby_players_prefetched(&prefetched.all_players, &animal, &stats);
            
            // Update AI state based on current conditions
            update_animal_ai_state(ctx, &mut animal, &behavior, &stats, &nearby_players, current_time, &mut rng)?;
            
            // Process pack behavior (formation, dissolution, etc.)
            process_pack_behavior(ctx, &mut animal, current_time, &mut rng)?;
            
            // Process taming behavior (food detection and consumption)
            process_taming_behavior(ctx, &mut animal, current_time)?;
            
            // Check for and execute attacks
            if animal.state == AnimalState::Chasing {
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        // CRITICAL FIX: Don't attack dead players - prevents duplicate corpse creation
                        if target_player.is_dead || target_player.health <= 0.0 {
                            // Player is dead - stop chasing and go idle (not wander)
                            log::info!("[WildAnimal:{}] Stopping chase - target player {} is dead (health: {:.1})", 
                                     animal.id, target_id, target_player.health);
                            transition_to_state(&mut animal, AnimalState::Idle, current_time, None, "target died");
                        } else {
                            let distance_sq = get_distance_squared(
                                animal.pos_x, animal.pos_y,
                                target_player.position_x, target_player.position_y
                            );
                            
                            // Check if in attack range and can attack
                            if distance_sq <= (stats.attack_range * stats.attack_range) && 
                               can_attack(&animal, current_time, &stats) {
                                // Execute the attack
                                execute_attack(ctx, &mut animal, &target_player, &behavior, &stats, current_time, &mut rng)?;
                            }
                        }
                    }
                }
            }
            
            // Execute movement based on current state
            execute_animal_movement(ctx, &mut animal, &behavior, &stats, current_time, &mut rng)?;
            
            // Update the animal in database
            ctx.db.wild_animal().id().update(animal);
            
            Ok(())
        })();
        
        // Log any errors but continue processing other animals
        if let Err(e) = process_result {
            log::error!("[WildAnimalAI] Error processing {:?} #{}: {}. Skipping this animal but continuing with others.", 
                       animal_species, animal_id, e);
        }
    }

    Ok(())
}

// --- AI State Management ---

fn update_animal_ai_state(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    behavior: &AnimalBehaviorEnum,
    stats: &AnimalStats,
    nearby_players: &[Player],
    current_time: Timestamp,
    rng: &mut impl Rng,
) -> Result<(), String> {
    let health_percent = animal.health / stats.max_health;
    
    // Check if should flee due to low health
    if health_percent < stats.flee_trigger_health_percent && animal.state != AnimalState::Fleeing {
        animal.state = AnimalState::Fleeing;
        animal.state_change_time = current_time;
        animal.target_player_id = None;
        // Clear fire fear override when fleeing due to low health
        animal.fire_fear_overridden_by = None;
        return Ok(());
    }
    
    // IDLE WAKE-UP: Animals in Idle state check if they should start moving
    // This happens when a player gets close enough to potentially see them
    if animal.state == AnimalState::Idle {
        // Check if any player is within detection range OR close enough to warrant wandering
        if !nearby_players.is_empty() {
            // Player detected nearby - wake up and potentially start chasing
            // Detection logic below will handle the state transition
            log::debug!("{:?} {} waking from Idle - player detected nearby", animal.species, animal.id);
            // Don't transition yet - let the normal detection logic handle it below
        } else {
            // No players in detection range - stay in Idle
            // Only skip remaining logic if no players are within wander activation distance
            // (The prefetched player data in nearby_players is filtered by perception range,
            //  so if it's empty, definitely stay idle)
            return Ok(());
        }
    }

    // CENTRALIZED FEAR LOGIC - Foundation fear applies to ALL animals regardless of group size
    // Fire/torch fear can be ignored by groups (group courage), but foundations should always be feared
    
    // Check foundation fear first (applies to ALL animals, including walruses)
    let should_fear_foundations = is_foundation_nearby(ctx, animal.pos_x, animal.pos_y);
    
    if should_fear_foundations {
        // ALL animals flee from foundations (player structures) - no group courage exception
        if let Some((foundation_x, foundation_y)) = find_closest_foundation_position(ctx, animal.pos_x, animal.pos_y) {
            transition_to_state(animal, AnimalState::Fleeing, current_time, None, "fleeing from foundation");
            
            // Species-specific flee distances from foundations
            let flee_distance = match animal.species {
                AnimalSpecies::TundraWolf => 400.0,
                AnimalSpecies::CinderFox => 320.0,
                AnimalSpecies::CableViper => 300.0,
                AnimalSpecies::ArcticWalrus => 300.0, // Walruses also fear foundations
                AnimalSpecies::BeachCrab => 200.0, // Crabs are small and scuttle away from buildings
                AnimalSpecies::Tern => 500.0, // Birds fly away from foundations
                AnimalSpecies::Crow => 450.0, // Crows fly away from foundations
            };
            
            set_flee_destination_away_from_threat(animal, foundation_x, foundation_y, flee_distance, rng);
            
            log::info!("{:?} {} FLEEING from foundation - target: ({:.1}, {:.1})", 
                      animal.species, animal.id,
                      animal.investigation_x.unwrap_or(0.0), 
                      animal.investigation_y.unwrap_or(0.0));
            
            return Ok(()); // Skip normal AI logic - animal is now fleeing from foundation
        }
    }
    
    // FIRE FEAR LOGIC - Only applies to non-walruses and non-crows, and can be ignored by groups
    // Walruses are curious about fire, crows are bold thieves that don't fear flames
    if animal.species != AnimalSpecies::ArcticWalrus && animal.species != AnimalSpecies::Crow && should_fear_fire(ctx, animal) {
        // Check for fire from players with torches
        for player in nearby_players {
            let player_has_fire = is_fire_nearby(ctx, player.position_x, player.position_y);
            
            if player_has_fire {
                // Check if fire fear is overridden for this specific player
                let should_fear_this_player = animal.fire_fear_overridden_by.map_or(true, |override_id| override_id != player.identity);
                
                if should_fear_this_player {
                    // FORCE FLEE STATE - Don't just filter players, actively flee from fire
                    transition_to_state(animal, AnimalState::Fleeing, current_time, None, "fleeing from torch");
                    
                    // Set flee destination away from the fire source
                    let flee_distance = match animal.species {
                        AnimalSpecies::TundraWolf => 950.0,   // 750 + 200 buffer
                        AnimalSpecies::CinderFox => 640.0,    // INCREASED: Proportional to new 240px chase range  
                        AnimalSpecies::CableViper => 500.0,   // 350 + 150 buffer
                        AnimalSpecies::ArcticWalrus => unreachable!(), // Already handled above
                        AnimalSpecies::BeachCrab => 300.0,    // Crabs scuttle away from fire
                        AnimalSpecies::Tern => 600.0,         // Birds fly away from fire
                        AnimalSpecies::Crow => 550.0,         // Crows fly away from fire
                    };
                    
                    set_flee_destination_away_from_threat(animal, player.position_x, player.position_y, flee_distance, rng);
                    
                    log::info!("{:?} {} FLEEING from torch - target: ({:.1}, {:.1})", 
                              animal.species, animal.id, 
                              animal.investigation_x.unwrap_or(0.0), 
                              animal.investigation_y.unwrap_or(0.0));
                    
                    return Ok(()); // Skip normal AI logic - animal is now fleeing
                }
            }
        }
        
        // Check for standalone campfires
        if let Some((fire_x, fire_y)) = find_closest_fire_position(ctx, animal.pos_x, animal.pos_y) {
            // Check if fire fear override applies for any nearby players
            let mut should_flee_from_fire = true;
            
            if let Some(override_player_id) = animal.fire_fear_overridden_by {
                for player in ctx.db.player().iter() {
                    if player.identity == override_player_id && !player.is_dead {
                        let distance_to_player = get_distance_squared(animal.pos_x, animal.pos_y, player.position_x, player.position_y).sqrt();
                        let distance_to_fire = get_distance_squared(animal.pos_x, animal.pos_y, fire_x, fire_y).sqrt();
                        
                        // If the override player is near this fire source, don't flee
                        if distance_to_player <= 300.0 && distance_to_fire <= FIRE_FEAR_RADIUS {
                            should_flee_from_fire = false;
                            break;
                        }
                    }
                }
            }
            
            if should_flee_from_fire {
                // FORCE FLEE STATE from standalone fire sources (campfires)
                transition_to_state(animal, AnimalState::Fleeing, current_time, None, "fleeing from campfire");
                
                let flee_distance = match animal.species {
                    AnimalSpecies::TundraWolf => 950.0,
                    AnimalSpecies::CinderFox => 640.0,
                    AnimalSpecies::CableViper => 500.0,
                    AnimalSpecies::ArcticWalrus => unreachable!(), // Already handled above
                    AnimalSpecies::BeachCrab => 300.0, // Crabs scuttle away from campfires
                    AnimalSpecies::Tern => 600.0, // Birds fly away from campfires
                    AnimalSpecies::Crow => 550.0, // Crows fly away from campfires
                };
                
                set_flee_destination_away_from_threat(animal, fire_x, fire_y, flee_distance, rng);
                
                log::info!("{:?} {} FLEEING from campfire - target: ({:.1}, {:.1})", 
                          animal.species, animal.id,
                          animal.investigation_x.unwrap_or(0.0), 
                          animal.investigation_y.unwrap_or(0.0));
                
                return Ok(()); // Skip normal AI logic - animal is now fleeing
            }
        }
    }
    
    // Normal AI logic - only process if not fleeing from fire
    // Filter out fire-afraid players for target selection
    let mut fire_safe_players = Vec::new();
    
    for player in nearby_players {
        let player_has_fire = is_fire_nearby(ctx, player.position_x, player.position_y);
        let should_fear_this_player = player_has_fire && 
            should_fear_fire(ctx, animal) && 
            // Only fear if no override OR override is for a different player
            animal.fire_fear_overridden_by.map_or(true, |override_id| override_id != player.identity);
        
        if !should_fear_this_player {
            fire_safe_players.push(player.clone());
        }
    }
    
    // Use fire-safe players for AI logic
    let detected_player = find_detected_player(ctx, animal, stats, &fire_safe_players);
    behavior.update_ai_state_logic(ctx, animal, stats, detected_player.as_ref(), current_time, rng)?;

    Ok(())
}

// --- Movement Execution ---

fn execute_animal_movement(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    behavior: &AnimalBehaviorEnum,
    stats: &AnimalStats,
    current_time: Timestamp,
    rng: &mut impl Rng,
) -> Result<(), String> {
    let dt = 0.125; // Matches AI tick interval (8fps)
    
    let mut is_sprinting = false;
    
    // Fire fear is now handled entirely in update_animal_ai_state() 
    // Movement system just executes whatever state the animal is in
    
    match animal.state {
        AnimalState::Patrolling => {
            // For birds in Patrolling state, use is_flying flag to determine behavior
            // This ensures proper sprite selection (walking vs flying)
            if is_flying_species(&animal.species) {
                if animal.is_flying {
                    execute_flying_patrol(ctx, animal, stats, dt, rng);
                } else {
                    execute_grounded_idle(ctx, animal, stats, dt, rng);
                }
            } else {
                // Non-birds use standard patrol
                behavior.execute_patrol_logic(ctx, animal, stats, dt, rng);
            }
        },
        
        AnimalState::Chasing => {
            if let Some(target_id) = animal.target_player_id {
                if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                    let distance_sq = get_distance_squared(
                        animal.pos_x, animal.pos_y,
                        target_player.position_x, target_player.position_y
                    );
                    let distance = distance_sq.sqrt();
                    
                    // Normal chase behavior - fire fear logic handled above
                    // 🐺 NOTE: Once an animal is chasing (e.g., you attacked it), wolf fur won't stop it!
                    // Intimidation only prevents initial detection/aggro
                    if distance > stats.attack_range * 0.9 { // Start moving when slightly outside attack range
                        // Move directly toward player - no stopping short
                        is_sprinting = true; // Chasing uses sprint speed
                        move_towards_target(ctx, animal, target_player.position_x, target_player.position_y, stats.sprint_speed, dt);
                    }
                    // If within 90% of attack range, stop moving and let attack system handle it
                }
            }
        },
        
        AnimalState::Investigating => {
            // Handle strafe movement for investigation behavior
            if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
                // Enhanced movement speed for aggressive strafing
                let strafe_speed = match animal.species {
                    AnimalSpecies::CableViper => stats.sprint_speed * 0.8, // Fast strafing for vipers
                    _ => stats.movement_speed * 1.2, // Slightly faster for other species
                };
                
                is_sprinting = strafe_speed > stats.movement_speed * 1.1; // Consider sprinting if significantly faster
                move_towards_target(ctx, animal, target_x, target_y, strafe_speed, dt);
                
                // Check if reached strafe position
                let distance_to_target = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y).sqrt();
                if distance_to_target <= 20.0 { // Within 20px of strafe target
                    // Clear investigation position - AI will set new one if needed
                    animal.investigation_x = None;
                    animal.investigation_y = None;
                }
            }
        },
        
        AnimalState::Fleeing => {
            is_sprinting = true; // Fleeing uses sprint speed
            behavior.execute_flee_logic(ctx, animal, stats, dt, current_time, rng);
        },
        
        AnimalState::Alert => {
            // Generic alert behavior - species can override this in update_ai_state_logic
            if animal.species == AnimalSpecies::TundraWolf {
                animal.scent_ping_timer += (dt * 1000.0) as u64;
                if animal.scent_ping_timer >= 3000 { // Every 3 seconds
                    animal.scent_ping_timer = 0;
                }
            }
        },
        
        AnimalState::Following => {
            // Tamed animal following their owner
            handle_tamed_following(ctx, animal, stats, current_time, dt, rng);
        },
        
        AnimalState::Protecting => {
            // Tamed animal protecting their owner from threats
            handle_tamed_protecting(ctx, animal, stats, current_time, dt, rng);
        },
        
        // ============================================================
        // BIRD-SPECIFIC STATES - Handle Flying, Grounded, Scavenging, Stealing
        // ============================================================
        
        AnimalState::Flying => {
            // Flying birds - ensure is_flying is true and execute flying patrol
            // This is the FLYING state, so bird should always be flying here
            if is_flying_species(&animal.species) {
                animal.is_flying = true; // Ensure flag is set for sprite selection
                execute_flying_patrol(ctx, animal, stats, dt, rng);
            } else {
                // Non-birds shouldn't be in Flying state, fallback to patrol
                behavior.execute_patrol_logic(ctx, animal, stats, dt, rng);
            }
        },
        
        AnimalState::FlyingChase => {
            // Flying chase toward a target
            is_sprinting = true;
            if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
                execute_flying_chase(ctx, animal, stats, target_x, target_y, dt);
            } else if let Some(target_id) = animal.target_player_id {
                if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                    execute_flying_chase(ctx, animal, stats, target_player.position_x, target_player.position_y, dt);
                }
            }
        },
        
        AnimalState::Grounded => {
            // Grounded birds - walk around using direction-based patrol (like crabs)
            // This is the GROUNDED state, so bird should always be walking here
            animal.is_flying = false; // Ensure flag is set for walking sprite selection
            execute_grounded_idle(ctx, animal, stats, dt, rng);
        },
        
        AnimalState::Scavenging => {
            // Terns scavenging dropped items - fly/walk toward investigation target
            if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
                let distance_sq = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y);
                
                if animal.is_flying {
                    // Fly toward item
                    execute_flying_chase(ctx, animal, stats, target_x, target_y, dt);
                } else if distance_sq > 100.0 * 100.0 {
                    // Too far - take off and fly
                    animal.is_flying = true;
                    execute_flying_chase(ctx, animal, stats, target_x, target_y, dt);
                } else {
                    // Walk toward item on ground
                    move_towards_target(ctx, animal, target_x, target_y, stats.movement_speed, dt);
                }
            } else {
                // No target - return to patrol
                behavior.execute_patrol_logic(ctx, animal, stats, dt, rng);
            }
        },
        
        AnimalState::Stealing => {
            // Crows stealing from players - fly toward target
            if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
                animal.is_flying = true;
                execute_flying_chase(ctx, animal, stats, target_x, target_y, dt);
            } else if let Some(target_id) = animal.target_player_id {
                if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                    animal.is_flying = true;
                    execute_flying_chase(ctx, animal, stats, target_player.position_x, target_player.position_y, dt);
                }
            } else {
                // No target - return to patrol
                behavior.execute_patrol_logic(ctx, animal, stats, dt, rng);
            }
        },
        
        AnimalState::Idle => {
            // PERFORMANCE: Idle state - animal stays completely still
            // No movement, no animation updates (except facing direction)
            // Wake-up to Patrolling is handled in update_animal_ai_state when player gets close
        },
        
        _ => {} // Other states (Attacking, Hiding, Burrowed) don't move continuously
    }

    // Keep animal within world bounds
    clamp_to_world_bounds(animal);
    
    // --- Animal Walking Sound Logic ---
    // DISABLED: Animal walking sounds temporarily removed due to duplicate sound playback issues
    // The logic below was causing sounds to play multiple times. Will be re-enabled once
    // the client-side sound event deduplication is properly implemented.
    
    Ok(())
}

// --- Combat Functions ---

fn execute_attack(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    target_player: &Player,
    behavior: &AnimalBehaviorEnum,
    stats: &AnimalStats,
    current_time: Timestamp,
    rng: &mut impl Rng,
) -> Result<(), String> {
    // Apply damage to player
    if let Some(mut target) = ctx.db.player().identity().find(&target_player.identity) {
        // <<< SAFE ZONE CHECK - Players in safe zones are immune to animal damage >>>
        if crate::active_effects::player_has_safe_zone_effect(ctx, target.identity) {
            log::info!("Animal {:?} {} attack blocked - Player {:?} is in a safe zone", 
                animal.species, animal.id, target.identity);
            return Ok(()); // No damage applied
        }
        // <<< END SAFE ZONE CHECK >>>
        
        // Get species-specific damage and effects
        let raw_damage = behavior.execute_attack_effects(ctx, animal, target_player, stats, current_time, rng)?;
        
        // <<< APPLY TYPED ARMOR RESISTANCE >>>
        // Animals use Melee damage type for their attacks
        let resistance = crate::armor::calculate_resistance_for_damage_type(ctx, target.identity, crate::models::DamageType::Melee);
        let mut final_damage = raw_damage;
        
        if resistance > 0.0 {
            let damage_reduction = raw_damage * resistance;
            final_damage = (raw_damage - damage_reduction).max(0.0);
            
            log::info!(
                "Animal {:?} {} attacking Player {:?}. Raw Damage: {:.2}, Melee Resistance: {:.2} ({:.0}%), Final Damage: {:.2}",
                animal.species, animal.id, target.identity,
                raw_damage,
                resistance,
                resistance * 100.0,
                final_damage
            );
        }
        // <<< END APPLY TYPED ARMOR RESISTANCE >>>
        
        // Apply damage
        let old_health = target.health;
        target.health = (target.health - final_damage).max(0.0);
        target.last_hit_time = Some(current_time);
        let actual_damage = old_health - target.health;
        
        // Apply knockback to player if damage was dealt
        if actual_damage > 0.0 && target.is_online {
            apply_knockback_to_player(animal, &mut target, current_time);
        }
        
        // Save values before moving target
        let target_id = target.identity;
        let target_pos_x = target.position_x;
        let target_pos_y = target.position_y;
        
        // Check if player dies
        if target.health <= 0.0 {
            handle_player_death(ctx, &mut target, animal, current_time)?;
        }
        
        ctx.db.player().identity().update(target);
        
        // Update animal's last attack time
        animal.last_attack_time = Some(current_time);
        
        // Play animal attack sound (animals use melee hit sharp sound)
        crate::sound_events::emit_melee_hit_sharp_sound(ctx, target_pos_x, target_pos_y, ctx.identity());
        log::debug!("Animal {} hit player {} - played melee_hit_sharp sound", animal.id, target_id);
    }
    
    Ok(())
}

// --- Helper Functions ---

fn find_nearby_players(ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats) -> Vec<Player> {
    ctx.db.player()
        .iter()
        .filter(|player| {
            !player.is_dead && 
            !player.is_snorkeling && // 🤿 Snorkeling players are completely hidden
            get_distance_squared(animal.pos_x, animal.pos_y, player.position_x, player.position_y) 
                <= (stats.perception_range * 1.5).powi(2)
        })
        .collect()
}

/// PERFORMANCE OPTIMIZATION: Uses pre-fetched player data instead of querying database
fn find_nearby_players_prefetched(all_players: &[Player], animal: &WildAnimal, stats: &AnimalStats) -> Vec<Player> {
    all_players
        .iter()
        .filter(|player| {
            !player.is_snorkeling && // 🤿 Snorkeling players are completely hidden
            get_distance_squared(animal.pos_x, animal.pos_y, player.position_x, player.position_y) 
                <= (stats.perception_range * 1.5).powi(2)
        })
        .cloned()
        .collect()
}

/// VIEWPORT CULLING: Check if ANY player is within the active processing zone
/// Animals outside this zone are completely frozen (no AI processing at all)
/// This is a cheap O(n) check where n = number of online players (usually 1-10)
fn is_any_player_in_active_zone(all_players: &[Player], animal: &WildAnimal) -> bool {
    for player in all_players {
        let dist_sq = get_distance_squared(
            animal.pos_x, animal.pos_y,
            player.position_x, player.position_y
        );
        if dist_sq <= ANIMAL_ACTIVE_ZONE_SQUARED {
            return true;
        }
    }
    false
}

/// WANDER ACTIVATION: Check if ANY player is close enough for animal to start wandering
/// Animals within active zone but outside this range stay in Idle state (stationary)
/// This prevents animals from wandering when they're technically "active" but not visible
fn get_closest_player_distance_squared(all_players: &[Player], animal: &WildAnimal) -> f32 {
    let mut closest_dist_sq = f32::MAX;
    for player in all_players {
        let dist_sq = get_distance_squared(
            animal.pos_x, animal.pos_y,
            player.position_x, player.position_y
        );
        if dist_sq < closest_dist_sq {
            closest_dist_sq = dist_sq;
        }
    }
    closest_dist_sq
}

/// Check if animal should be wandering (player close enough to see them)
fn should_animal_wander(all_players: &[Player], animal: &WildAnimal) -> bool {
    get_closest_player_distance_squared(all_players, animal) <= WANDER_ACTIVATION_DISTANCE_SQUARED
}

fn find_detected_player(ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, nearby_players: &[Player]) -> Option<Player> {
    for player in nearby_players {
        // 🤿 SNORKEL STEALTH: Players using snorkel are completely hidden underwater
        // Animals cannot detect snorkeling players at all - they're invisible beneath the surface
        if player.is_snorkeling {
            log::debug!("🤿 {:?} {} cannot detect player {} - snorkeling underwater",
                       animal.species, animal.id, player.identity);
            continue; // Skip this player entirely - they're hidden underwater
        }
        
        // 🐺 WOLF FUR INTIMIDATION: Animals are intimidated by players wearing full wolf fur set
        // Intimidated animals will not detect or chase the player
        // 🦭 EXCEPTION: Walruses are never intimidated - they're too massive and defensive!
        if animal.species != AnimalSpecies::ArcticWalrus && 
           crate::armor::intimidates_animals(ctx, player.identity) {
            log::debug!("🐺 {:?} {} intimidated by player {} wearing wolf fur - skipping detection",
                       animal.species, animal.id, player.identity);
            continue; // Skip this player entirely
        }
        
        let distance_sq = get_distance_squared(
            animal.pos_x, animal.pos_y,
            player.position_x, player.position_y
        );
        
        // 🥷 STEALTH MECHANIC: Crouching reduces animal detection radius by 50%
        let mut effective_perception_range = if player.is_crouching {
            stats.perception_range * 0.5 // 50% reduction when crouching
        } else {
            stats.perception_range
        };
        
        // 🦊 FOX FUR ARMOR: Detection radius bonus makes animals less likely to detect you
        // Each piece of Fox Fur armor reduces animal detection range by the bonus percentage
        let detection_bonus = crate::armor::calculate_detection_radius_bonus(ctx, player.identity);
        if detection_bonus > 0.0 {
            // Detection bonus REDUCES the animal's perception range (makes you harder to detect)
            effective_perception_range *= 1.0 - detection_bonus;
            log::debug!("🦊 Player {} has {:.1}% detection bonus, reducing animal perception to {:.1}px",
                       player.identity, detection_bonus * 100.0, effective_perception_range);
        }
        
        // 🦊 FOX FUR BOOTS: Silent movement further reduces detection range
        // Players wearing fox fur boots make no sound, reducing detection by an additional 30%
        if crate::armor::has_silent_movement(ctx, player.identity) {
            effective_perception_range *= 0.7; // 30% additional reduction
            log::debug!("🦊 Player {} has silent movement (fox fur boots), further reducing perception to {:.1}px",
                       player.identity, effective_perception_range);
        }
        
        if distance_sq <= effective_perception_range * effective_perception_range {
            // Check if within perception cone (except for Cable Viper which has 360° detection)
            if animal.species == AnimalSpecies::CableViper || 
               is_within_perception_cone(animal, player, stats) {
                
                // Log stealth detection for debugging
                if player.is_crouching {
                    log::debug!("🥷 {:?} {} detected crouching player {} at {:.1}px (reduced range: {:.1}px)", 
                               animal.species, animal.id, player.identity, 
                               distance_sq.sqrt(), effective_perception_range);
                }
                
                return Some(player.clone());
            }
        } else if player.is_crouching && distance_sq <= stats.perception_range * stats.perception_range {
            // Player would have been detected if standing, but crouching saved them
            log::debug!("🥷 {:?} {} missed crouching player {} at {:.1}px (stealth successful)", 
                       animal.species, animal.id, player.identity, distance_sq.sqrt());
        }
    }
    None
}

fn is_within_perception_cone(animal: &WildAnimal, player: &Player, stats: &AnimalStats) -> bool {
    if stats.perception_angle_degrees >= 360.0 {
        return true;
    }
    
    let to_player_x = player.position_x - animal.pos_x;
    let to_player_y = player.position_y - animal.pos_y;
    let distance = (to_player_x * to_player_x + to_player_y * to_player_y).sqrt();
    
    if distance == 0.0 {
        return true;
    }
    
    let to_player_normalized_x = to_player_x / distance;
    let to_player_normalized_y = to_player_y / distance;
    
    let dot_product = animal.direction_x * to_player_normalized_x + animal.direction_y * to_player_normalized_y;
    let angle_rad = dot_product.acos();
    let half_perception_angle_rad = (stats.perception_angle_degrees * PI / 180.0) / 2.0;
    
    angle_rad <= half_perception_angle_rad
}

pub fn can_attack(animal: &WildAnimal, current_time: Timestamp, stats: &AnimalStats) -> bool {
    if let Some(last_attack) = animal.last_attack_time {
        let time_since_attack = (current_time.to_micros_since_unix_epoch() - last_attack.to_micros_since_unix_epoch()) / 1000;
        time_since_attack >= stats.attack_speed_ms as i64
    } else {
        true
    }
}

pub fn move_towards_target(ctx: &ReducerContext, animal: &mut WildAnimal, target_x: f32, target_y: f32, speed: f32, dt: f32) {
    let dx = target_x - animal.pos_x;
    let dy = target_y - animal.pos_y;
    let distance = (dx * dx + dy * dy).sqrt();
    
    if distance > 0.0 {
        let move_distance = speed * dt;
        let normalize_factor = if distance <= move_distance {
            1.0
        } else {
            move_distance / distance
        };
        
        let proposed_x = animal.pos_x + dx * normalize_factor;
        let proposed_y = animal.pos_y + dy * normalize_factor;
        
        // Store starting position to calculate actual movement
        let start_x = animal.pos_x;
        let start_y = animal.pos_y;
        
        let is_attacking = animal.state == AnimalState::Attacking;
        let (final_x, final_y) = resolve_animal_collision(
            ctx,
            animal.id,
            animal.pos_x,
            animal.pos_y,
            proposed_x,
            proposed_y,
            is_attacking,
        );
        
        // Use centralized position update function
        update_animal_position(animal, final_x, final_y);
        
        animal.direction_x = dx / distance;
        animal.direction_y = dy / distance;
        
        // Update facing direction based on ACTUAL movement (not intended direction)
        // This prevents jittery flipping when herding/patrolling behaviors adjust target
        let actual_move_x = final_x - start_x;
        let actual_move_y = final_y - start_y;
        
        // Only change facing direction if there's significant actual movement
        // Threshold of 2.0 pixels ensures meaningful movement before flipping
        // Use the dominant axis (whichever has more movement) to determine direction
        if actual_move_x.abs() > 2.0 || actual_move_y.abs() > 2.0 {
            if actual_move_x.abs() > actual_move_y.abs() {
                // Horizontal movement is dominant
                animal.facing_direction = if actual_move_x > 0.0 { "right".to_string() } else { "left".to_string() };
            } else {
                // Vertical movement is dominant
                animal.facing_direction = if actual_move_y > 0.0 { "down".to_string() } else { "up".to_string() };
            }
        }
    }
}

/// Helper function to update animal position and ensure chunk_index stays synchronized
pub fn update_animal_position(animal: &mut WildAnimal, new_x: f32, new_y: f32) {
    animal.pos_x = new_x;
    animal.pos_y = new_y;
    animal.chunk_index = crate::environment::calculate_chunk_index(new_x, new_y);
}

fn clamp_to_world_bounds(animal: &mut WildAnimal) {
    let margin = 50.0;
    let clamped_x = animal.pos_x.clamp(margin, WORLD_WIDTH_PX - margin);
    let clamped_y = animal.pos_y.clamp(margin, WORLD_HEIGHT_PX - margin);
    
    // Use centralized position update function
    update_animal_position(animal, clamped_x, clamped_y);
}

fn apply_knockback_to_player(animal: &WildAnimal, target: &mut Player, current_time: Timestamp) {
    let dx_target_from_animal = target.position_x - animal.pos_x;
    let dy_target_from_animal = target.position_y - animal.pos_y;
    let distance_sq = dx_target_from_animal * dx_target_from_animal + dy_target_from_animal * dy_target_from_animal;
    
    if distance_sq > 0.001 {
        let distance = distance_sq.sqrt();
        let knockback_distance = match animal.species {
            AnimalSpecies::TundraWolf => 48.0,
            AnimalSpecies::CinderFox => 32.0,
            AnimalSpecies::CableViper => 24.0,
            AnimalSpecies::ArcticWalrus => 64.0, // Strongest knockback - massive walrus attack
            AnimalSpecies::BeachCrab => 16.0, // Small knockback - crab pinch
            AnimalSpecies::Tern => 8.0, // Very small knockback - bird peck
            AnimalSpecies::Crow => 12.0, // Small knockback - crow peck
        };
        
        let knockback_dx = (dx_target_from_animal / distance) * knockback_distance;
        let knockback_dy = (dy_target_from_animal / distance) * knockback_distance;
        
        let proposed_x = target.position_x + knockback_dx;
        let proposed_y = target.position_y + knockback_dy;
        
        let final_x = proposed_x.clamp(32.0, WORLD_WIDTH_PX - 32.0);
        let final_y = proposed_y.clamp(32.0, WORLD_HEIGHT_PX - 32.0);
        
        target.position_x = final_x;
        target.position_y = final_y;
        target.last_update = current_time;
        
        log::debug!("Applied knockback to player {} from {} (species: {:?}): distance={:.1}px", 
                   target.identity, animal.id, animal.species, knockback_distance);
    }
}

fn handle_player_death(ctx: &ReducerContext, target: &mut Player, animal: &WildAnimal, current_time: Timestamp) -> Result<(), String> {
    target.is_dead = true;
    target.death_timestamp = Some(current_time);
    log::info!("Player {} killed by {} (species: {:?})", 
              target.identity, animal.id, animal.species);
    
    // Drop active weapon on death (before clearing equipment and creating corpse)
    match crate::dropped_item::drop_active_weapon_on_death(ctx, target.identity, target.position_x, target.position_y) {
        Ok(Some(item_name)) => log::info!("[PlayerDeath] Dropped active weapon '{}' for player {:?} killed by wild animal", item_name, target.identity),
        Ok(None) => log::debug!("[PlayerDeath] No active weapon to drop for player {:?}", target.identity),
        Err(e) => log::error!("[PlayerDeath] Failed to drop active weapon for player {:?}: {}", target.identity, e),
    }
    
    // Clear active equipment reference
    if let Err(e) = crate::active_equipment::clear_active_item_reducer(ctx, target.identity) {
        log::error!("Failed to clear active item for player {:?} killed by wild animal: {}", target.identity, e);
    }
    
    // Clear all active effects on death (bleed, venom, burns, healing, etc.)
    crate::active_effects::clear_all_effects_on_death(ctx, target.identity);
    log::info!("[PlayerDeath] Cleared all active effects for player {:?} killed by wild animal", target.identity);
    
    // Create death marker for wild animal kill
    let death_cause = match animal.species {
        AnimalSpecies::CinderFox => "Cinder Fox",
        AnimalSpecies::TundraWolf => "Tundra Wolf", 
        AnimalSpecies::CableViper => "Cable Viper",
        AnimalSpecies::ArcticWalrus => "Arctic Walrus",
        AnimalSpecies::BeachCrab => "Beach Crab",
        AnimalSpecies::Tern => "Tern",
        AnimalSpecies::Crow => "Crow",
    };
    
    let new_death_marker = crate::death_marker::DeathMarker {
        player_id: target.identity,
        pos_x: target.position_x,
        pos_y: target.position_y,
        death_timestamp: current_time,
        killed_by: None,
        death_cause: death_cause.to_string(),
    };
    
    let death_marker_table = ctx.db.death_marker();
    if death_marker_table.player_id().find(&target.identity).is_some() {
        death_marker_table.player_id().update(new_death_marker);
        log::info!("[DeathMarker] Updated death marker for player {:?} killed by {}", target.identity, death_cause);
    } else {
        death_marker_table.insert(new_death_marker);
        log::info!("[DeathMarker] Created death marker for player {:?} killed by {}", target.identity, death_cause);
    }
    
    // Create player corpse
    if let Err(e) = crate::player_corpse::create_player_corpse(ctx, target.identity, target.position_x, target.position_y, &target.username) {
        log::error!("Failed to create corpse for player {:?} killed by wild animal: {}", target.identity, e);
    }
    
    Ok(())
}

// --- Spawning Functions ---

#[spacetimedb::reducer]
pub fn spawn_wild_animal(
    ctx: &ReducerContext,
    species: AnimalSpecies,
    pos_x: f32,
    pos_y: f32,
) -> Result<(), String> {
    if let Err(validation_error) = validate_animal_spawn_position(ctx, pos_x, pos_y) {
        return Err(format!("Cannot spawn {:?}: {}", species, validation_error));
    }
    
    let behavior = species.get_behavior();
    let stats = behavior.get_stats();
    let current_time = ctx.timestamp;
    
    // Birds (Tern and Crow) start grounded to show walking animations
    let is_bird = matches!(species, AnimalSpecies::Tern | AnimalSpecies::Crow);
    let initial_state = if is_bird {
        AnimalState::Grounded
    } else {
        AnimalState::Patrolling
    };
    
    let animal = WildAnimal {
        id: 0,
        species,
        pos_x,
        pos_y,
        direction_x: 1.0,
        direction_y: 0.0,
        facing_direction: "down".to_string(), // Default facing direction
        state: initial_state,
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
        chunk_index: crate::environment::calculate_chunk_index(pos_x, pos_y),
        created_at: current_time,
        last_hit_time: None,
        
        // Initialize pack fields - animals start solo
        pack_id: None,
        is_pack_leader: false,
        pack_join_time: None,
        last_pack_check: None,
        
        // Fire fear override tracking
        fire_fear_overridden_by: None,
        
        // Taming system fields
        tamed_by: None,
        tamed_at: None,
        heart_effect_until: None,
        crying_effect_until: None,
        last_food_check: None,
        
        // Bird scavenging/stealing system fields
        held_item_name: None,
        held_item_quantity: None,
        flying_target_x: None,
        flying_target_y: None,
        is_flying: false, // Birds start grounded (not flying)
    };
    
    ctx.db.wild_animal().insert(animal);
    
    if is_bird {
        log::info!("🐦 Spawned {:?} at ({:.0}, {:.0}) - GROUNDED (is_flying=false, walking sprite)", species, pos_x, pos_y);
    } else {
        log::info!("Spawned {:?} at ({:.0}, {:.0}) with initial state {:?}", species, pos_x, pos_y, initial_state);
    }
    
    Ok(())
}

/// Internal function to handle animal damage with optional weapon tracking
/// weapon_name: Optional weapon name for tracking weapon-specific kill achievements
pub fn damage_wild_animal_with_weapon(
    ctx: &ReducerContext,
    animal_id: u64,
    damage: f32,
    attacker_id: Identity,
    weapon_name: Option<&str>,
) -> Result<(), String> {
    let mut rng = ctx.rng();
    
    if let Some(mut animal) = ctx.db.wild_animal().id().find(&animal_id) {
        let old_health = animal.health;
        animal.health = (animal.health - damage).max(0.0);
        animal.last_hit_time = Some(ctx.timestamp);
        let actual_damage = old_health - animal.health;
        
        // Apply knockback effects
        if actual_damage > 0.0 {
            apply_damage_knockback_effects(ctx, &animal, attacker_id)?;
            
            // Play weapon hit sound when player hits animal
            if let Some(attacker) = ctx.db.player().identity().find(&attacker_id) {
                if let Some(active_item) = ctx.db.active_equipment().player_identity().find(&attacker_id) {
                    if let Some(item_def_id) = active_item.equipped_item_def_id {
                        if let Some(item_def) = ctx.db.item_definition().id().find(item_def_id) {
                            // Use the shared weapon hit sound function from combat.rs
                            crate::combat::play_weapon_hit_sound(ctx, &item_def, animal.pos_x, animal.pos_y, attacker_id);
                        }
                    }
                }
                
                // Play animal pain/growl sound when hit
                emit_species_sound(ctx, &animal, attacker_id, "hit");
            }
        }
        
        if animal.health <= 0.0 {
            log::info!("🦴 [ANIMAL DEATH] Animal {} (species: {:?}) died at ({:.1}, {:.1}) - attempting to create corpse", 
                      animal.id, animal.species, animal.pos_x, animal.pos_y);
            
            // Create animal corpse before deleting the animal
            if let Err(e) = super::animal_corpse::create_animal_corpse(
                ctx,
                animal.species,
                animal.id,
                animal.pos_x,
                animal.pos_y,
                ctx.timestamp,
                animal.created_at, // Pass spawn time to calculate time alive at harvest
            ) {
                log::error!("🦴 [ERROR] Failed to create animal corpse for {} (species: {:?}): {}", animal.id, animal.species, e);
            } else {
                log::info!("🦴 [SUCCESS] Animal corpse creation call completed successfully for animal {}", animal.id);
            }
            
            ctx.db.wild_animal().id().delete(&animal_id);
            log::info!("Wild animal {} killed by player {} - corpse created", animal_id, attacker_id);
            
            // Award XP and update stats for animal kill
            if let Err(e) = crate::player_progression::award_xp(ctx, attacker_id, crate::player_progression::XP_ANIMAL_KILLED) {
                log::error!("Failed to award XP for animal kill: {}", e);
            }
            
            // Track animals_killed stat and check achievements
            if let Err(e) = crate::player_progression::track_stat_and_check_achievements(ctx, attacker_id, "animals_killed", 1) {
                log::error!("Failed to track animal kill stat: {}", e);
            }
            
            // Track quest progress for animal kills
            if let Err(e) = crate::quests::track_quest_progress(
                ctx,
                attacker_id,
                crate::quests::QuestObjectiveType::KillAnyAnimal,
                None,
                1,
            ) {
                log::error!("Failed to track quest progress for animal kill: {}", e);
            }
            // Track specific animal type kills for quests
            let species_name = format!("{:?}", animal.species);
            if let Err(e) = crate::quests::track_quest_progress(
                ctx,
                attacker_id,
                crate::quests::QuestObjectiveType::KillSpecificAnimal,
                Some(&species_name),
                1,
            ) {
                log::error!("Failed to track specific animal quest progress: {}", e);
            }
            
            // Track weapon-specific kill achievement if weapon name provided
            if let Some(wep_name) = weapon_name {
                let weapon_stat = categorize_weapon_for_achievement(wep_name);
                if !weapon_stat.is_empty() {
                    if let Err(e) = crate::player_progression::track_stat_and_check_achievements(ctx, attacker_id, weapon_stat, 1) {
                        log::error!("Failed to track weapon kill stat '{}': {}", weapon_stat, e);
                    }
                    // Spears also count as melee kills
                    if weapon_stat == "spear_kills" {
                        if let Err(e) = crate::player_progression::track_stat_and_check_achievements(ctx, attacker_id, "melee_kills", 1) {
                            log::error!("Failed to track melee kill stat for spear: {}", e);
                        }
                    }
                }
            }
        } else {
            // 🔥 FIRE FEAR OVERRIDE: If animal was afraid of fire but got attacked, they now ignore fire and retaliate
            if let Some(attacker) = ctx.db.player().identity().find(&attacker_id) {
                let was_fire_afraid = should_fear_fire(ctx, &animal);
                
                // Check if animal was previously fleeing from fire or in a fire-influenced state
                let was_fleeing_from_fire = animal.state == AnimalState::Fleeing && was_fire_afraid;
                let was_avoiding_fire_targets = was_fire_afraid && 
                    (animal.state == AnimalState::Patrolling || animal.state == AnimalState::Alert);
                
                if (was_fleeing_from_fire || was_avoiding_fire_targets) && animal.species != AnimalSpecies::ArcticWalrus {
                    // Set fire fear override for this specific attacker
                    animal.fire_fear_overridden_by = Some(attacker.identity);
                    
                    // Override fire fear - animal now prioritizes attacking over fire avoidance
                    transition_to_state(&mut animal, AnimalState::Chasing, ctx.timestamp, Some(attacker.identity), "fire fear overridden by attack");
                    
                    // Clear flee destination if they were fleeing
                    animal.investigation_x = None;
                    animal.investigation_y = None;
                    
                    // Emit aggressive sound to indicate they're now hostile
                    emit_species_sound(ctx, &animal, attacker.identity, "fire_fear_override");
                    
                    log::info!("🔥➡️⚔️ {:?} {} was afraid of fire but got attacked - now ignoring fire from attacker {} specifically", 
                              animal.species, animal.id, attacker.identity);
                }
                
                // Continue with species-specific damage response
                let behavior = animal.species.get_behavior();
                let stats = behavior.get_stats();
                behavior.handle_damage_response(ctx, &mut animal, &attacker, &stats, ctx.timestamp, &mut rng)?;
            }
            
            ctx.db.wild_animal().id().update(animal);
        }
    }
    
    Ok(())
}

/// Categorize weapon name into achievement stat category
fn categorize_weapon_for_achievement(weapon_name: &str) -> &'static str {
    let name_lower = weapon_name.to_lowercase();
    
    // Ranged - Bow
    if name_lower.contains("bow") && !name_lower.contains("crossbow") {
        return "bow_kills";
    }
    
    // Ranged - Crossbow
    if name_lower.contains("crossbow") {
        return "crossbow_kills";
    }
    
    // Ranged - Harpoon Gun (must check before generic "gun" check)
    if name_lower.contains("harpoon gun") {
        return "harpoon_gun_kills";
    }
    
    // Ranged - Firearms (Makarov, etc.)
    if name_lower.contains("makarov") || name_lower.contains("pistol") || name_lower.contains("gun") 
       || name_lower.contains("rifle") || name_lower.contains("firearm") {
        return "gun_kills";
    }
    
    // Melee - Reed Harpoon (melee weapon, not the gun)
    // Note: "Reed Harpoon" without "Gun" is a melee weapon
    if name_lower == "reed harpoon" {
        return "spear_kills"; // Melee harpoon counts as spear
    }
    
    // Melee - Spears (specific category within melee)
    if name_lower.contains("spear") {
        // Track both spear_kills AND melee_kills for spears
        // We'll handle the dual-tracking in the caller
        return "spear_kills";
    }
    
    // Melee - All other melee weapons
    // Maces, hammers, daggers, axes, swords, cutlass, bayonet, crowbar, maul, scythe, paddle, skulls
    if name_lower.contains("mace") || name_lower.contains("hammer") || name_lower.contains("dagger") 
       || name_lower.contains("axe") || name_lower.contains("sword") || name_lower.contains("cutlass")
       || name_lower.contains("bayonet") || name_lower.contains("crowbar") || name_lower.contains("maul")
       || name_lower.contains("scythe") || name_lower.contains("paddle") || name_lower.contains("skull")
       || name_lower.contains("shiv") {
        return "melee_kills";
    }
    
    // Default - if weapon not recognized, don't track
    ""
}

/// Original reducer wrapper for backward compatibility
/// Delegates to damage_wild_animal_with_weapon with no weapon tracking
#[spacetimedb::reducer]
pub fn damage_wild_animal(
    ctx: &ReducerContext,
    animal_id: u64,
    damage: f32,
    attacker_id: Identity,
) -> Result<(), String> {
    damage_wild_animal_with_weapon(ctx, animal_id, damage, attacker_id, None)
}

/// NEW: Handle wild animal vs wild animal combat
/// This function allows wild animals (especially tamed ones) to damage other wild animals
pub fn damage_wild_animal_by_animal(
    ctx: &ReducerContext,
    target_animal_id: u64,
    damage: f32,
    attacker_animal_id: u64,
    timestamp: Timestamp,
) -> Result<bool, String> {
    // Verify both animals exist
    let attacker_animal = ctx.db.wild_animal().id().find(&attacker_animal_id)
        .ok_or_else(|| format!("Attacker animal {} not found", attacker_animal_id))?;
    
    let mut target_animal = ctx.db.wild_animal().id().find(&target_animal_id)
        .ok_or_else(|| format!("Target animal {} not found", target_animal_id))?;
    
    let old_health = target_animal.health;
    target_animal.health = (target_animal.health - damage).max(0.0);
    target_animal.last_hit_time = Some(timestamp);
    let actual_damage = old_health - target_animal.health;
    
    // Log the attack
    log::info!("🦁 [ANIMAL COMBAT] {:?} {} attacked {:?} {} for {:.1} damage. Health: {:.1} -> {:.1}",
              attacker_animal.species, attacker_animal_id,
              target_animal.species, target_animal_id,
              actual_damage, old_health, target_animal.health);
    
    if actual_damage > 0.0 {
        // Apply knockback effects between animals
        apply_animal_knockback_effects(ctx, &target_animal, &attacker_animal)?;
        
        // Play attack sound
        emit_species_sound(ctx, &attacker_animal, attacker_animal.tamed_by.unwrap_or(ctx.identity()), "attack");
        
        // Play hit sound for target
        emit_species_sound(ctx, &target_animal, attacker_animal.tamed_by.unwrap_or(ctx.identity()), "hit");
    }
    
    let animal_died = target_animal.health <= 0.0;
    
    if animal_died {
        log::info!("🦴 [ANIMAL COMBAT DEATH] Animal {} (species: {:?}) killed by animal {} at ({:.1}, {:.1})", 
                  target_animal.id, target_animal.species, attacker_animal_id, target_animal.pos_x, target_animal.pos_y);
        
        // Create animal corpse before deleting the animal
        if let Err(e) = super::animal_corpse::create_animal_corpse(
            ctx,
            target_animal.species,
            target_animal.id,
            target_animal.pos_x,
            target_animal.pos_y,
            timestamp,
            target_animal.created_at, // Pass spawn time to calculate time alive at harvest
        ) {
            log::error!("🦴 [ERROR] Failed to create animal corpse for {} (species: {:?}): {}", target_animal.id, target_animal.species, e);
        } else {
            log::info!("🦴 [SUCCESS] Animal corpse created for animal {} killed by animal {}", target_animal.id, attacker_animal_id);
        }
        
        ctx.db.wild_animal().id().delete(&target_animal_id);
    } else {
        // If target survives, handle damage response
        let target_behavior = target_animal.species.get_behavior();
        let target_stats = target_behavior.get_stats();
        
        // Make the target animal retaliate or flee based on its behavior
        // If the attacker is tamed, consider it as coming from the owner for AI purposes
        let effective_attacker_id = attacker_animal.tamed_by.unwrap_or(ctx.identity());
        
        if let Some(effective_attacker_player) = ctx.db.player().identity().find(&effective_attacker_id) {
            let mut rng = ctx.rng();
            target_behavior.handle_damage_response(ctx, &mut target_animal, &effective_attacker_player, &target_stats, timestamp, &mut rng)?;
        }
        
        ctx.db.wild_animal().id().update(target_animal);
    }
    
    Ok(animal_died)
}

/// Apply knockback effects between two animals
fn apply_animal_knockback_effects(
    ctx: &ReducerContext,
    target_animal: &WildAnimal,
    attacker_animal: &WildAnimal,
) -> Result<(), String> {
    // Calculate direction from attacker to target
    let dx_target_from_attacker = target_animal.pos_x - attacker_animal.pos_x;
    let dy_target_from_attacker = target_animal.pos_y - attacker_animal.pos_y;
    let distance_sq = dx_target_from_attacker * dx_target_from_attacker + dy_target_from_attacker * dy_target_from_attacker;
    
    if distance_sq > 0.001 {
        let distance = distance_sq.sqrt();
        
        // Apply smaller knockback for animal vs animal combat
        const ANIMAL_KNOCKBACK_DISTANCE: f32 = 12.0; // Smaller than player knockback
        
        let knockback_dx = (dx_target_from_attacker / distance) * ANIMAL_KNOCKBACK_DISTANCE;
        let knockback_dy = (dy_target_from_attacker / distance) * ANIMAL_KNOCKBACK_DISTANCE;
        
        // Update target animal position (with basic bounds checking)
        let mut updated_target = target_animal.clone();
        let new_x = (updated_target.pos_x + knockback_dx).clamp(32.0, WORLD_WIDTH_PX - 32.0);
        let new_y = (updated_target.pos_y + knockback_dy).clamp(32.0, WORLD_HEIGHT_PX - 32.0);
        
        // Use centralized position update function
        update_animal_position(&mut updated_target, new_x, new_y);
        
        ctx.db.wild_animal().id().update(updated_target);
        
        log::debug!("Applied animal knockback: {} -> {} distance={:.1}px", 
                   attacker_animal.id, target_animal.id, ANIMAL_KNOCKBACK_DISTANCE);
    }
    
    Ok(())
}

fn apply_damage_knockback_effects(ctx: &ReducerContext, animal: &WildAnimal, attacker_id: Identity) -> Result<(), String> {
    if let Some(mut attacker) = ctx.db.player().identity().find(&attacker_id) {
        if attacker.is_online {
            let dx_animal_from_attacker = animal.pos_x - attacker.position_x;
            let dy_animal_from_attacker = animal.pos_y - attacker.position_y;
            let distance_sq = dx_animal_from_attacker * dx_animal_from_attacker + dy_animal_from_attacker * dy_animal_from_attacker;
            
            if distance_sq > 0.001 {
                let distance = distance_sq.sqrt();
                
                // Apply knockback and recoil based on attack range
                if distance <= 80.0 { // Melee range
                    let attacker_recoil_distance = 16.0;
                    let attacker_recoil_dx = (-dx_animal_from_attacker / distance) * attacker_recoil_distance;
                    let attacker_recoil_dy = (-dy_animal_from_attacker / distance) * attacker_recoil_distance;
                    
                    let proposed_attacker_x = attacker.position_x + attacker_recoil_dx;
                    let proposed_attacker_y = attacker.position_y + attacker_recoil_dy;
                    
                    attacker.position_x = proposed_attacker_x.clamp(32.0, WORLD_WIDTH_PX - 32.0);
                    attacker.position_y = proposed_attacker_y.clamp(32.0, WORLD_HEIGHT_PX - 32.0);
                    attacker.last_update = ctx.timestamp;
                    
                    ctx.db.player().identity().update(attacker);
                    
                    log::debug!("Applied recoil to player {} from melee attacking wild animal {}: distance={:.1}px", 
                               attacker_id, animal.id, attacker_recoil_distance);
                }
            }
        }
    }
    Ok(())
}

// Helper function to check if a position is inside any shelter (used by all animals for collision avoidance)
pub fn is_position_in_shelter(ctx: &ReducerContext, x: f32, y: f32) -> bool {
    for shelter in ctx.db.shelter().iter() {
        if shelter.is_destroyed {
            continue;
        }
        
        // Use the same collision bounds as the shelter system
        // These constants should match the ones in shelter.rs
        const SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y: f32 = 20.0;
        const SHELTER_AABB_HALF_WIDTH: f32 = 80.0;
        const SHELTER_AABB_HALF_HEIGHT: f32 = 60.0;
        
        let shelter_aabb_center_x = shelter.pos_x;
        let shelter_aabb_center_y = shelter.pos_y - SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y;
        let aabb_left = shelter_aabb_center_x - SHELTER_AABB_HALF_WIDTH;
        let aabb_right = shelter_aabb_center_x + SHELTER_AABB_HALF_WIDTH;
        let aabb_top = shelter_aabb_center_y - SHELTER_AABB_HALF_HEIGHT;
        let aabb_bottom = shelter_aabb_center_y + SHELTER_AABB_HALF_HEIGHT;
        
        if x >= aabb_left && x <= aabb_right && y >= aabb_top && y <= aabb_bottom {
            return true;
        }
    }
    false
}

// Fire fear helper functions

/// Check if there's a foundation within fear radius (separate from fire check for walruses)
fn is_foundation_nearby(ctx: &ReducerContext, animal_x: f32, animal_y: f32) -> bool {
    use crate::building::FOUNDATION_TILE_SIZE_PX;
    for foundation in ctx.db.foundation_cell().iter() {
        if foundation.is_destroyed {
            continue;
        }
        
        // Convert foundation cell coordinates to world pixel coordinates (center of foundation cell)
        let foundation_world_x = (foundation.cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
        let foundation_world_y = (foundation.cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
        
        let dx = animal_x - foundation_world_x;
        let dy = animal_y - foundation_world_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= FOUNDATION_FEAR_RADIUS_SQUARED {
            return true;
        }
    }
    
    false
}

/// Find the closest foundation position (for walrus flee behavior)
fn find_closest_foundation_position(ctx: &ReducerContext, animal_x: f32, animal_y: f32) -> Option<(f32, f32)> {
    use crate::building::FOUNDATION_TILE_SIZE_PX;
    let mut closest_foundation_pos: Option<(f32, f32)> = None;
    let mut closest_distance_sq = f32::MAX;
    
    for foundation in ctx.db.foundation_cell().iter() {
        if foundation.is_destroyed {
            continue;
        }
        
        // Convert foundation cell coordinates to world pixel coordinates (center of foundation cell)
        let foundation_world_x = (foundation.cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
        let foundation_world_y = (foundation.cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
        
        let dx = animal_x - foundation_world_x;
        let dy = animal_y - foundation_world_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq < closest_distance_sq && distance_sq <= FOUNDATION_FEAR_RADIUS_SQUARED {
            closest_distance_sq = distance_sq;
            closest_foundation_pos = Some((foundation_world_x, foundation_world_y));
        }
    }
    
    closest_foundation_pos
}

/// Check if there's a fire source (campfire or torch) or foundation within fear radius of an animal
fn is_fire_nearby(ctx: &ReducerContext, animal_x: f32, animal_y: f32) -> bool {
    // Check for burning campfires
    for campfire in ctx.db.campfire().iter() {
        if !campfire.is_burning || campfire.is_destroyed {
            continue;
        }
        
        let dx = animal_x - campfire.pos_x;
        let dy = animal_y - campfire.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= FIRE_FEAR_RADIUS_SQUARED {
            return true;
        }
    }
    
    // Check for players with lit torches
    for player in ctx.db.player().iter() {
        if !player.is_torch_lit || player.is_dead {
            continue;
        }
        
        let dx = animal_x - player.position_x;
        let dy = animal_y - player.position_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= TORCH_FEAR_RADIUS_SQUARED {
            return true;
        }
    }
    
    // Check for foundations (animals fear player structures)
    use crate::building::FOUNDATION_TILE_SIZE_PX;
    for foundation in ctx.db.foundation_cell().iter() {
        if foundation.is_destroyed {
            continue;
        }
        
        // Convert foundation cell coordinates to world pixel coordinates (center of foundation cell)
        let foundation_world_x = (foundation.cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
        let foundation_world_y = (foundation.cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
        
        let dx = animal_x - foundation_world_x;
        let dy = animal_y - foundation_world_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= FOUNDATION_FEAR_RADIUS_SQUARED {
            return true;
        }
    }
    
    false
}

/// Count nearby animals of the same species to determine group courage
fn count_nearby_group_members(ctx: &ReducerContext, animal: &WildAnimal) -> usize {
    let mut count = 1; // Count self
    
    for other_animal in ctx.db.wild_animal().iter() {
        if other_animal.id == animal.id || other_animal.species != animal.species {
            continue;
        }
        
        let dx = animal.pos_x - other_animal.pos_x;
        let dy = animal.pos_y - other_animal.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= GROUP_DETECTION_RADIUS * GROUP_DETECTION_RADIUS {
            count += 1;
        }
    }
    
    count
}

/// Find the closest fire source position for boundary calculation
pub fn find_closest_fire_position(ctx: &ReducerContext, animal_x: f32, animal_y: f32) -> Option<(f32, f32)> {
    let mut closest_fire_pos: Option<(f32, f32)> = None;
    let mut closest_distance_sq = f32::MAX;
    
    // Check burning campfires
    for campfire in ctx.db.campfire().iter() {
        if !campfire.is_burning || campfire.is_destroyed {
            continue;
        }
        
        let dx = animal_x - campfire.pos_x;
        let dy = animal_y - campfire.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq < closest_distance_sq {
            closest_distance_sq = distance_sq;
            closest_fire_pos = Some((campfire.pos_x, campfire.pos_y));
        }
    }
    
    // Check lit torches (players)
    for player in ctx.db.player().iter() {
        if !player.is_torch_lit || player.is_dead {
            continue;
        }
        
        let dx = animal_x - player.position_x;
        let dy = animal_y - player.position_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq < closest_distance_sq {
            closest_distance_sq = distance_sq;
            closest_fire_pos = Some((player.position_x, player.position_y));
        }
    }
    
    // Check foundations (animals fear player structures)
    use crate::building::FOUNDATION_TILE_SIZE_PX;
    for foundation in ctx.db.foundation_cell().iter() {
        if foundation.is_destroyed {
            continue;
        }
        
        // Convert foundation cell coordinates to world pixel coordinates (center of foundation cell)
        let foundation_world_x = (foundation.cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
        let foundation_world_y = (foundation.cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
        
        let dx = animal_x - foundation_world_x;
        let dy = animal_y - foundation_world_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq < closest_distance_sq {
            closest_distance_sq = distance_sq;
            closest_fire_pos = Some((foundation_world_x, foundation_world_y));
        }
    }
    
    closest_fire_pos
}

/// Check if an animal should fear fire (considers group courage)
fn should_fear_fire(ctx: &ReducerContext, animal: &WildAnimal) -> bool {
    // Count nearby group members
    let group_size = count_nearby_group_members(ctx, animal);
    
    // Groups of 3+ ignore fire fear
    if group_size >= GROUP_COURAGE_THRESHOLD {
        return false;
    }
    
    // Check if fire is nearby
    is_fire_nearby(ctx, animal.pos_x, animal.pos_y)
}

/// Check if there's a campfire at the given position (for determining fear radius)
fn is_campfire_at_position(ctx: &ReducerContext, x: f32, y: f32) -> bool {
    for campfire in ctx.db.campfire().iter() {
        if !campfire.is_burning || campfire.is_destroyed {
            continue;
        }
        
        let dx = x - campfire.pos_x;
        let dy = y - campfire.pos_y;
        
        // Check if position is very close to campfire (within 10px)
        if dx * dx + dy * dy <= 100.0 {
            return true;
        }
    }
    false
}

/// Wrapper function for animal behavior compatibility - checks if position has fire nearby
/// The distance parameter is ignored since is_fire_nearby already uses appropriate thresholds
pub fn is_position_near_fire(ctx: &ReducerContext, x: f32, y: f32, _distance: f32) -> bool {
    is_fire_nearby(ctx, x, y)
}

// --- Anti-Exploit Functions (Fire Trap Escape) ---

/// Detects if an animal is trapped by campfire and player has ranged weapon - the "animal farming" exploit
pub fn is_animal_trapped_by_fire_and_ranged(ctx: &ReducerContext, animal: &WildAnimal, player: &Player) -> bool {
    // Check if animal is near fire boundary (stuck due to fire fear)
    if let Some((fire_x, fire_y)) = find_closest_fire_position(ctx, animal.pos_x, animal.pos_y) {
        let fire_distance = get_distance_squared(animal.pos_x, animal.pos_y, fire_x, fire_y).sqrt();
        
        // Check if animal is at fire boundary (180-220px from fire = trapped at edge)
        const FIRE_FEAR_RADIUS: f32 = 200.0;
        if fire_distance >= FIRE_FEAR_RADIUS * 0.9 && fire_distance <= FIRE_FEAR_RADIUS * 1.1 {
            // Check if player has ranged weapon equipped
            if has_ranged_weapon_equipped(ctx, player.identity) {
                // Check if player is close enough to exploit (within 300px)
                let player_distance = get_distance_squared(animal.pos_x, animal.pos_y, player.position_x, player.position_y).sqrt();
                return player_distance <= 300.0;
            }
        }
    }
    false
}

/// Detects if a player has a ranged weapon (bow/crossbow) equipped
pub fn has_ranged_weapon_equipped(ctx: &ReducerContext, player_id: Identity) -> bool {
    if let Some(active_equipment) = ctx.db.active_equipment().player_identity().find(&player_id) {
        if let Some(item_def_id) = active_equipment.equipped_item_def_id {
            if let Some(item_def) = ctx.db.item_definition().id().find(item_def_id) {
                return item_def.name == "Bow" || item_def.name == "Crossbow";
            }
        }
    }
    false
}

// --- Pack Management Functions ---

/// Process pack formation and dissolution for wolves
pub fn process_pack_behavior(ctx: &ReducerContext, animal: &mut WildAnimal, current_time: Timestamp, rng: &mut impl Rng) -> Result<(), String> {
    // Only wolves can form packs
    if animal.species != AnimalSpecies::TundraWolf {
        return Ok(());
    }
    
    // Check if enough time has passed since last pack check
    if let Some(last_check) = animal.last_pack_check {
        let time_since_check = (current_time.to_micros_since_unix_epoch() - last_check.to_micros_since_unix_epoch()) / 1000;
        if time_since_check < PACK_CHECK_INTERVAL_MS {
            return Ok(());
        }
    }
    
    animal.last_pack_check = Some(current_time);
    
    // If wolf is in a pack, check for dissolution
    if let Some(pack_id) = animal.pack_id {
        if should_leave_pack(ctx, animal, current_time, rng)? {
            leave_pack(ctx, animal, current_time)?;
            log::info!("Wolf {} left pack {}", animal.id, pack_id);
        }
    } else {
        // Wolf is solo, check for pack formation
        if let Some(other_wolf) = find_nearby_packable_wolf(ctx, animal) {
            attempt_pack_formation(ctx, animal, other_wolf, current_time, rng)?;
        }
    }
    
    Ok(())
}

/// Check if a wolf should leave its current pack
fn should_leave_pack(ctx: &ReducerContext, animal: &WildAnimal, current_time: Timestamp, rng: &mut impl Rng) -> Result<bool, String> {
    // Leaders are MUCH less likely to leave (stable leadership)
    let dissolution_chance = if animal.is_pack_leader {
        PACK_DISSOLUTION_CHANCE * 0.15 // Only 15% of normal chance (was 30%)
    } else {
        PACK_DISSOLUTION_CHANCE
    };
    
    // Random chance to leave
    if rng.gen::<f32>() < dissolution_chance {
        return Ok(true);
    }
    
    // Leave if pack is too small or alpha is missing
    if let Some(pack_id) = animal.pack_id {
        let pack_members = get_pack_members(ctx, pack_id);
        
        // If pack has only 1 member (this wolf), dissolve
        if pack_members.len() <= 1 {
            return Ok(true);
        }
        
        // Don't dissolve larger packs easily - they're more valuable for gameplay
        if pack_members.len() >= 3 && rng.gen::<f32>() < 0.5 {
            // 50% chance to stay even if randomly selected to leave (pack loyalty)
            return Ok(false);
        }
        
        // If no alpha in pack, someone should become alpha
        if !pack_members.iter().any(|w| w.is_pack_leader) {
            // This wolf becomes the new alpha
            return Ok(false);
        }
    }
    
    Ok(false)
}

/// Remove a wolf from its pack
fn leave_pack(ctx: &ReducerContext, animal: &mut WildAnimal, current_time: Timestamp) -> Result<(), String> {
    let old_pack_id = animal.pack_id;
    
    animal.pack_id = None;
    animal.is_pack_leader = false;
    animal.pack_join_time = None;
    
    // If this was the alpha, promote another wolf
    if let Some(pack_id) = old_pack_id {
        promote_new_alpha(ctx, pack_id, current_time)?;
    }
    
    Ok(())
}

/// Find a nearby wolf that can form a pack or merge packs
fn find_nearby_packable_wolf(ctx: &ReducerContext, animal: &WildAnimal) -> Option<WildAnimal> {
    for other_animal in ctx.db.wild_animal().iter() {
        if other_animal.id == animal.id || other_animal.species != AnimalSpecies::TundraWolf {
            continue;
        }
        
        let distance_sq = get_distance_squared(
            animal.pos_x, animal.pos_y,
            other_animal.pos_x, other_animal.pos_y
        );
        
        if distance_sq <= PACK_FORMATION_RADIUS * PACK_FORMATION_RADIUS {
            // Case 1: Solo wolf meets solo wolf
            if animal.pack_id.is_none() && other_animal.pack_id.is_none() {
                return Some(other_animal);
            }
            
            // Case 2: Solo wolf meets pack member
            if animal.pack_id.is_none() && other_animal.pack_id.is_some() {
                let pack_size = get_pack_size(ctx, other_animal.pack_id.unwrap());
                if pack_size < MAX_PACK_SIZE {
                    return Some(other_animal);
                }
            }
            
            // Case 3: Pack member meets solo wolf  
            if animal.pack_id.is_some() && other_animal.pack_id.is_none() {
                let pack_size = get_pack_size(ctx, animal.pack_id.unwrap());
                if pack_size < MAX_PACK_SIZE {
                    return Some(other_animal);
                }
            }
            
            // Case 4: Two different packs meet - alpha challenge!
            if let (Some(pack_a), Some(pack_b)) = (animal.pack_id, other_animal.pack_id) {
                if pack_a != pack_b && animal.is_pack_leader && other_animal.is_pack_leader {
                    // Two alphas meeting - potential pack merger
                    let combined_size = get_pack_size(ctx, pack_a) + get_pack_size(ctx, pack_b);
                    if combined_size <= MAX_PACK_SIZE {
                        return Some(other_animal);
                    }
                }
            }
        }
    }
    None
}

/// Attempt to form a pack between two wolves or merge existing packs
fn attempt_pack_formation(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    mut other_wolf: WildAnimal,
    current_time: Timestamp,
    rng: &mut impl Rng,
) -> Result<(), String> {
    // Random chance to form pack/merge (higher chance for pack mergers - alphas are territorial)
    let formation_chance = if animal.is_pack_leader && other_wolf.is_pack_leader {
        PACK_FORMATION_CHANCE * 0.6 // 60% of normal chance for alpha challenges
    } else {
        PACK_FORMATION_CHANCE
    };
    
    if rng.gen::<f32>() > formation_chance {
        return Ok(());
    }
    
    // Handle different scenarios
    match (animal.pack_id, other_wolf.pack_id) {
        // Case 1: Solo + Solo = New pack
        (None, None) => {
            let other_wolf_id = other_wolf.id;
            let pack_id = animal.id.max(other_wolf_id);
            let (alpha_id, _) = if rng.gen::<bool>() {
                (animal.id, other_wolf_id)
            } else {
                (other_wolf_id, animal.id)
            };
            
            animal.pack_id = Some(pack_id);
            animal.is_pack_leader = alpha_id == animal.id;
            animal.pack_join_time = Some(current_time);
            
            other_wolf.pack_id = Some(pack_id);
            other_wolf.is_pack_leader = alpha_id == other_wolf_id;
            other_wolf.pack_join_time = Some(current_time);
            
            ctx.db.wild_animal().id().update(other_wolf);
            log::info!("Wolves {} and {} formed new pack {} (alpha: {})", 
                      animal.id, other_wolf_id, pack_id, alpha_id);
        },
        
        // Case 2: Solo + Pack = Join existing pack
        (None, Some(existing_pack_id)) => {
            animal.pack_id = Some(existing_pack_id);
            animal.is_pack_leader = false;
            animal.pack_join_time = Some(current_time);
            log::info!("Solo wolf {} joined existing pack {}", animal.id, existing_pack_id);
        },
        
        // Case 3: Pack + Solo = Solo joins this pack  
        (Some(existing_pack_id), None) => {
            let other_wolf_id = other_wolf.id;
            other_wolf.pack_id = Some(existing_pack_id);
            other_wolf.is_pack_leader = false;
            other_wolf.pack_join_time = Some(current_time);
            ctx.db.wild_animal().id().update(other_wolf);
            log::info!("Solo wolf {} joined existing pack {}", other_wolf_id, existing_pack_id);
        },
        
        // Case 4: Pack + Pack = ALPHA CHALLENGE! 
        (Some(pack_a), Some(pack_b)) if pack_a != pack_b => {
            if animal.is_pack_leader && other_wolf.is_pack_leader {
                // Determine dominant alpha based on pack size, health, and random factor
                let pack_a_size = get_pack_size(ctx, pack_a);
                let pack_b_size = get_pack_size(ctx, pack_b);
                
                let animal_dominance = pack_a_size as f32 * 10.0 + animal.health * 0.1 + rng.gen::<f32>() * 20.0;
                let other_dominance = pack_b_size as f32 * 10.0 + other_wolf.health * 0.1 + rng.gen::<f32>() * 20.0;
                
                let (winning_pack, losing_pack, winning_alpha, losing_alpha) = if animal_dominance > other_dominance {
                    (pack_a, pack_b, animal.id, other_wolf.id)
                } else {
                    (pack_b, pack_a, other_wolf.id, animal.id)
                };
                
                // Merge smaller pack into larger pack
                merge_packs(ctx, winning_pack, losing_pack, winning_alpha, current_time)?;
                
                log::info!("🐺 ALPHA CHALLENGE: Pack {} (alpha {}) dominates pack {} (alpha {}) - packs merged!", 
                          winning_pack, winning_alpha, losing_pack, losing_alpha);
            }
        },
        
        _ => {} // Same pack or other edge cases
    }
    
    Ok(())
}

/// Get all members of a pack
fn get_pack_members(ctx: &ReducerContext, pack_id: u64) -> Vec<WildAnimal> {
    ctx.db.wild_animal()
        .iter()
        .filter(|animal| animal.pack_id == Some(pack_id))
        .collect()
}

/// Get the size of a pack
fn get_pack_size(ctx: &ReducerContext, pack_id: u64) -> usize {
    get_pack_members(ctx, pack_id).len()
}

/// Merge two packs after an alpha challenge
fn merge_packs(
    ctx: &ReducerContext,
    winning_pack_id: u64,
    losing_pack_id: u64,
    winning_alpha_id: u64,
    current_time: Timestamp,
) -> Result<(), String> {
    let losing_pack_members = get_pack_members(ctx, losing_pack_id);
    
    // Transfer all losing pack members to winning pack
    for mut losing_member in losing_pack_members {
        let losing_member_id = losing_member.id;
        
        // Demote losing alpha to follower
        losing_member.is_pack_leader = false;
        losing_member.pack_id = Some(winning_pack_id);
        losing_member.pack_join_time = Some(current_time);
        
        // Update in database
        ctx.db.wild_animal().id().update(losing_member);
        
        log::debug!("Wolf {} transferred from pack {} to pack {} (now follower)", 
                   losing_member_id, losing_pack_id, winning_pack_id);
    }
    
    // If merged pack exceeds size limit, some wolves leave to form new packs or go solo
    let merged_size = get_pack_size(ctx, winning_pack_id);
    if merged_size > MAX_PACK_SIZE {
        let excess_count = merged_size - MAX_PACK_SIZE;
        let all_members = get_pack_members(ctx, winning_pack_id);
        
        // Remove the newest members (last to join) to maintain pack stability
        let mut members_to_remove: Vec<_> = all_members
            .into_iter()
            .filter(|w| !w.is_pack_leader) // Never remove the alpha
            .collect();
        
        // Sort by join time (newest first) 
        members_to_remove.sort_by(|a, b| {
            b.pack_join_time.unwrap_or(current_time)
                .cmp(&a.pack_join_time.unwrap_or(current_time))
        });
        
        // Remove excess wolves
        for mut wolf_to_remove in members_to_remove.into_iter().take(excess_count) {
            let wolf_id = wolf_to_remove.id;
            wolf_to_remove.pack_id = None;
            wolf_to_remove.is_pack_leader = false;
            wolf_to_remove.pack_join_time = None;
            ctx.db.wild_animal().id().update(wolf_to_remove);
            
            log::info!("Wolf {} left pack {} due to overcrowding after merger", 
                      wolf_id, winning_pack_id);
        }
    }
    
    Ok(())
}

/// Promote a new alpha when the current alpha leaves
fn promote_new_alpha(ctx: &ReducerContext, pack_id: u64, current_time: Timestamp) -> Result<(), String> {
    let pack_members = get_pack_members(ctx, pack_id);
    
    if pack_members.is_empty() {
        return Ok(());
    }
    
    // Find the oldest pack member (first to join)
    if let Some(mut new_alpha) = pack_members
        .into_iter()
        .filter(|w| !w.is_pack_leader)
        .min_by_key(|w| w.pack_join_time.unwrap_or(current_time)) {
        
        new_alpha.is_pack_leader = true;
        let new_alpha_id = new_alpha.id;
        ctx.db.wild_animal().id().update(new_alpha);
        log::info!("Wolf {} promoted to alpha of pack {}", new_alpha_id, pack_id);
    }
    
    Ok(())
}

/// Get the alpha wolf of a pack
pub fn get_pack_alpha(ctx: &ReducerContext, pack_id: u64) -> Option<WildAnimal> {
    ctx.db.wild_animal()
        .iter()
        .find(|animal| animal.pack_id == Some(pack_id) && animal.is_pack_leader)
}

/// Check if a wolf should follow pack alpha's movement
pub fn should_follow_pack_alpha(animal: &WildAnimal, alpha: &WildAnimal) -> bool {
    if animal.is_pack_leader || animal.pack_id != alpha.pack_id {
        return false;
    }
    
    // Only follow if alpha is patrolling (not chasing/attacking)
    alpha.state == AnimalState::Patrolling || alpha.state == AnimalState::Alert
}

/// Calculate pack cohesion movement towards alpha
pub fn get_pack_cohesion_movement(animal: &WildAnimal, alpha: &WildAnimal) -> Option<(f32, f32)> {
    let distance_sq = get_distance_squared(
        animal.pos_x, animal.pos_y,
        alpha.pos_x, alpha.pos_y
    );
    
    // If too far from alpha, move towards them
    if distance_sq > PACK_COHESION_RADIUS * PACK_COHESION_RADIUS {
        let distance = distance_sq.sqrt();
        let direction_x = (alpha.pos_x - animal.pos_x) / distance;
        let direction_y = (alpha.pos_y - animal.pos_y) / distance;
        return Some((direction_x, direction_y));
    }
    
    None
}

/// **COMMON FIRE FLEE SYSTEM** - Handles torch loop prevention for all animals
/// Returns true if fire was detected and animal is now fleeing (caller should skip normal AI logic)
pub fn handle_fire_detection_and_flee(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    stats: &AnimalStats,
    player: &Player,
    current_time: Timestamp,
    rng: &mut impl Rng,
) -> bool {
    // 🦭 WALRUS EXCEPTION: Walruses don't respond to fire at all
    if animal.species == AnimalSpecies::ArcticWalrus {
        return false; // Walruses ignore fire completely
    }
    
    // Check if player has fire nearby
    if !is_position_near_fire(ctx, player.position_x, player.position_y, 100.0) {
        return false; // No fire detected
    }
    
    // Calculate species-specific flee distance beyond engagement radius
    let base_flee_distance = match animal.species {
        AnimalSpecies::TundraWolf => stats.chase_trigger_range + 200.0,   // 750 + 200 = 950px
        AnimalSpecies::CinderFox => 320.0,                               // Fixed distance for foxes
        AnimalSpecies::CableViper => stats.chase_trigger_range + 150.0,  // 350 + 150 = 500px
        AnimalSpecies::ArcticWalrus => unreachable!(), // Already handled above
        AnimalSpecies::BeachCrab => 250.0,             // Crabs scuttle away from fire
        AnimalSpecies::Tern => 500.0,                  // Birds fly away from fire
        AnimalSpecies::Crow => 450.0,                  // Crows fly away from fire
    };
    
    // Special handling for cornered foxes (don't flee if too close)
    if animal.species == AnimalSpecies::CinderFox {
        let distance_to_player = get_distance_squared(animal.pos_x, animal.pos_y, player.position_x, player.position_y).sqrt();
        let cornered_distance = 240.0; // Larger buffer from torch users for foxes
        
        if distance_to_player <= cornered_distance {
            return false; // Fox is cornered, let it fight instead of flee
        }
    }
    
    // Force animal to flee beyond engagement radius
    animal.state = AnimalState::Fleeing;
    animal.target_player_id = None;
    animal.state_change_time = current_time;
    
    // Calculate direction away from player with fire
    let dx = animal.pos_x - player.position_x;
    let dy = animal.pos_y - player.position_y;
    let distance = (dx * dx + dy * dy).sqrt();
    
    if distance > 0.0 {
        // Flee in exact opposite direction from player
        let flee_direction_x = dx / distance;
        let flee_direction_y = dy / distance;
        
        animal.investigation_x = Some(animal.pos_x + flee_direction_x * base_flee_distance);
        animal.investigation_y = Some(animal.pos_y + flee_direction_y * base_flee_distance);
    } else {
        // Fallback: flee in random direction if player position is unknown
        let flee_angle = rng.gen::<f32>() * 2.0 * PI;
        animal.investigation_x = Some(animal.pos_x + base_flee_distance * flee_angle.cos());
        animal.investigation_y = Some(animal.pos_y + base_flee_distance * flee_angle.sin());
    }
    
    log::info!("{:?} {} fleeing from torch/fire - moving beyond engagement range ({:.0}px)", 
               animal.species, animal.id, base_flee_distance);
    
    true // Fire detected and flee initiated
}

/// **COMMON SOUND EMISSION SYSTEM** - Handles species-specific growl/hiss sounds
pub fn emit_species_sound(
    ctx: &ReducerContext,
    animal: &WildAnimal, 
    player_identity: Identity,
    sound_context: &str,  // "chase_start", "cornered", "attack", etc.
) {
    match animal.species {
        AnimalSpecies::TundraWolf => {
            crate::sound_events::emit_wolf_growl_sound(ctx, animal.pos_x, animal.pos_y, player_identity);
        },
        AnimalSpecies::CinderFox => {
            crate::sound_events::emit_fox_growl_sound(ctx, animal.pos_x, animal.pos_y, player_identity);
        },
        AnimalSpecies::CableViper => {
            crate::sound_events::emit_snake_growl_sound(ctx, animal.pos_x, animal.pos_y, player_identity);
        },
        AnimalSpecies::ArcticWalrus => {
            crate::sound_events::emit_walrus_growl_sound(ctx, animal.pos_x, animal.pos_y, player_identity);
        },
        AnimalSpecies::BeachCrab => {
            crate::sound_events::emit_crab_growl_sound(ctx, animal.pos_x, animal.pos_y, player_identity);
        },
        AnimalSpecies::Tern => {
            crate::sound_events::emit_tern_growl_sound(ctx, animal.pos_x, animal.pos_y, player_identity);
        },
        AnimalSpecies::Crow => {
            crate::sound_events::emit_crow_growl_sound(ctx, animal.pos_x, animal.pos_y, player_identity);
        },
    }
    
    log::debug!("{:?} {} emitting {} sound", animal.species, animal.id, sound_context);
}

/// **COMMON STATE TRANSITION HELPER** - Standardizes state changes with logging
pub fn transition_to_state(
    animal: &mut WildAnimal,
    new_state: AnimalState,
    current_time: Timestamp,
    target_player: Option<Identity>,
    reason: &str,
) {
    let old_state = animal.state;
    animal.state = new_state;
    animal.state_change_time = current_time;
    
    // Clear fire fear override when appropriate
    match new_state {
        AnimalState::Idle => {
            // Clear fire fear override when going idle
            if animal.fire_fear_overridden_by.is_some() {
                log::debug!("{:?} {} clearing fire fear override - going idle", 
                           animal.species, animal.id);
                animal.fire_fear_overridden_by = None;
            }
            animal.target_player_id = None;
            // Clear any investigation targets
            animal.investigation_x = None;
            animal.investigation_y = None;
        },
        
        AnimalState::Patrolling => {
            // Clear fire fear override when returning to patrol
            if animal.fire_fear_overridden_by.is_some() {
                log::debug!("{:?} {} clearing fire fear override - returning to patrol", 
                           animal.species, animal.id);
                animal.fire_fear_overridden_by = None;
            }
            animal.target_player_id = None;
        },
        
        AnimalState::Fleeing => {
            // Clear fire fear override when fleeing (probably due to low health)
            if animal.fire_fear_overridden_by.is_some() {
                log::debug!("{:?} {} clearing fire fear override - fleeing", 
                           animal.species, animal.id);
                animal.fire_fear_overridden_by = None;
            }
            animal.target_player_id = target_player;
        },
        
        AnimalState::Chasing => {
            // If switching to a different target, clear fire fear override
            if let (Some(old_target), Some(new_target)) = (animal.target_player_id, target_player) {
                if old_target != new_target && animal.fire_fear_overridden_by.is_some() {
                    log::debug!("{:?} {} clearing fire fear override - switching targets", 
                               animal.species, animal.id);
                    animal.fire_fear_overridden_by = None;
                }
            }
            animal.target_player_id = target_player;
        },
        
        _ => {
            // For other states, keep target and fire fear override as is
            animal.target_player_id = target_player;
        }
    }
    
    log::debug!("{:?} {} state: {:?} -> {:?} ({})", 
               animal.species, animal.id, old_state, new_state, reason);
}

/// **COMMON DISTANCE AND DETECTION HELPERS** - Reduce boilerplate in animal behaviors
pub fn get_player_distance(animal: &WildAnimal, player: &Player) -> f32 {
    get_distance_squared(animal.pos_x, animal.pos_y, player.position_x, player.position_y).sqrt()
}

pub fn is_player_in_attack_range(animal: &WildAnimal, player: &Player, stats: &AnimalStats) -> bool {
    let distance_sq = get_distance_squared(animal.pos_x, animal.pos_y, player.position_x, player.position_y);
    distance_sq <= (stats.attack_range * stats.attack_range)
}

pub fn is_player_in_chase_range(animal: &WildAnimal, player: &Player, stats: &AnimalStats) -> bool {
    let distance_sq = get_distance_squared(animal.pos_x, animal.pos_y, player.position_x, player.position_y);
    distance_sq <= (stats.chase_trigger_range * stats.chase_trigger_range)
}

/// **COMMON FLEE DESTINATION CALCULATOR** - Standardizes flee logic
pub fn set_flee_destination_away_from_threat(
    animal: &mut WildAnimal,
    threat_x: f32,
    threat_y: f32,
    flee_distance: f32,
    rng: &mut impl Rng,
) {
    // Calculate direction away from threat
    let dx_from_threat = animal.pos_x - threat_x;
    let dy_from_threat = animal.pos_y - threat_y;
    let distance_from_threat = (dx_from_threat * dx_from_threat + dy_from_threat * dy_from_threat).sqrt();
    
    if distance_from_threat > 0.1 {
        // Flee in exact opposite direction from threat
        let flee_direction_x = dx_from_threat / distance_from_threat;
        let flee_direction_y = dy_from_threat / distance_from_threat;
        
        animal.investigation_x = Some(animal.pos_x + flee_direction_x * flee_distance);
        animal.investigation_y = Some(animal.pos_y + flee_direction_y * flee_distance);
        
        log::debug!("{:?} {} fleeing {:.0}px away from threat at ({:.1}, {:.1})", 
                   animal.species, animal.id, flee_distance, threat_x, threat_y);
    } else {
        // Fallback: random direction if threat position is unknown
        let random_angle = rng.gen::<f32>() * 2.0 * PI;
        animal.investigation_x = Some(animal.pos_x + random_angle.cos() * flee_distance);
        animal.investigation_y = Some(animal.pos_y + random_angle.sin() * flee_distance);
        
        log::debug!("{:?} {} fleeing {:.0}px in random direction (threat position unknown)", 
                   animal.species, animal.id, flee_distance);
    }
}

/// **COMMON STUCK DETECTION AND RECOVERY** - Detects when animals get stuck and picks new directions
pub fn handle_movement_stuck_recovery(
    animal: &mut WildAnimal,
    prev_x: f32,
    prev_y: f32,
    movement_threshold: f32,
    rng: &mut impl Rng,
    context: &str, // "patrol", "flee", etc.
) -> bool {
    let distance_moved = ((animal.pos_x - prev_x).powi(2) + (animal.pos_y - prev_y).powi(2)).sqrt();
    
    if distance_moved < movement_threshold {
        // Stuck! Pick new random direction
        let new_angle = rng.gen::<f32>() * 2.0 * PI;
        animal.direction_x = new_angle.cos();
        animal.direction_y = new_angle.sin();
        
        log::debug!("{:?} {} stuck during {} - changing direction", 
                   animal.species, animal.id, context);
        return true; // Was stuck
    }
    false // Not stuck
}

/// **COMMON RANDOM DIRECTION CHANGE** - Handles species-specific random direction changes during patrol
pub fn maybe_change_patrol_direction(
    animal: &mut WildAnimal,
    rng: &mut impl Rng,
) {
    let change_chance = match animal.species {
        AnimalSpecies::CinderFox => 0.18,     // Foxes are skittish
        AnimalSpecies::TundraWolf => 0.12,    // Wolves are more purposeful (solo) or 0.08 (alpha)
        AnimalSpecies::CableViper => 0.15,    // Vipers are moderate
        AnimalSpecies::ArcticWalrus => 0.06,  // Walruses are very slow and deliberate
        AnimalSpecies::BeachCrab => 0.10,     // Crabs scuttle but are fairly predictable
        AnimalSpecies::Tern => 0.05,          // Terns fly in more consistent directions
        AnimalSpecies::Crow => 0.08,          // Crows are fairly focused
    };
    
    // Adjust for pack wolves (alphas change direction less frequently)
    let effective_chance = if animal.species == AnimalSpecies::TundraWolf && animal.is_pack_leader {
        change_chance * 0.67 // 8% for alphas vs 12% for solo wolves
    } else {
        change_chance
    };
    
    if rng.gen::<f32>() < effective_chance {
        let new_angle = rng.gen::<f32>() * 2.0 * PI;
        animal.direction_x = new_angle.cos();
        animal.direction_y = new_angle.sin();
        
        log::debug!("{:?} {} changed patrol direction", animal.species, animal.id);
    }
}

/// **COMMON PATROL MOVEMENT** - Standard wandering with obstacle avoidance
pub fn execute_standard_patrol(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    stats: &AnimalStats,
    dt: f32,
    rng: &mut impl Rng,
) {
    let prev_x = animal.pos_x;
    let prev_y = animal.pos_y;
    
    // Handle species-specific random direction changes
    maybe_change_patrol_direction(animal, rng);
    
    let target_x = animal.pos_x + animal.direction_x * stats.movement_speed * dt;
    let target_y = animal.pos_y + animal.direction_y * stats.movement_speed * dt;
    
    // Check if target position is safe (avoid shelters and water)
    if !is_position_in_shelter(ctx, target_x, target_y) &&
       !crate::fishing::is_water_tile(ctx, target_x, target_y) {
        move_towards_target(ctx, animal, target_x, target_y, stats.movement_speed, dt);
        
        // Check if stuck and recover
        handle_movement_stuck_recovery(animal, prev_x, prev_y, 3.0, rng, "patrol");
    } else {
        // If target position is blocked, pick a new random direction
        let new_angle = rng.gen::<f32>() * 2.0 * PI;
        animal.direction_x = new_angle.cos();
        animal.direction_y = new_angle.sin();
    }
}

/// **COMMON FLEE MOVEMENT** - Standard fleeing with destination and obstacle avoidance
pub fn execute_standard_flee(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    stats: &AnimalStats,
    dt: f32,
    current_time: Timestamp,
    rng: &mut impl Rng,
) {
    let prev_x = animal.pos_x;
    let prev_y = animal.pos_y;
    
    // Pick a random direction to flee if none set
    if animal.investigation_x.is_none() || animal.investigation_y.is_none() {
        let flee_angle = rng.gen::<f32>() * 2.0 * PI;
        let flee_distance = match animal.species {
            AnimalSpecies::CinderFox => 600.0 + (rng.gen::<f32>() * 400.0), // 12-20m for foxes
            AnimalSpecies::TundraWolf => 400.0 + (rng.gen::<f32>() * 300.0), // 8-14m for wolves
            AnimalSpecies::CableViper => 300.0 + (rng.gen::<f32>() * 200.0), // 6-10m for vipers
            AnimalSpecies::ArcticWalrus => 100.0, // Walruses barely flee (defensive positioning only)
            AnimalSpecies::BeachCrab => 200.0 + (rng.gen::<f32>() * 100.0), // 4-6m for crabs - short scuttle
            AnimalSpecies::Tern => 800.0 + (rng.gen::<f32>() * 500.0), // 16-26m for terns - fly away
            AnimalSpecies::Crow => 600.0 + (rng.gen::<f32>() * 400.0), // 12-20m for crows - fly away
        };
        
        animal.investigation_x = Some(animal.pos_x + flee_distance * flee_angle.cos());
        animal.investigation_y = Some(animal.pos_y + flee_distance * flee_angle.sin());
        
        log::debug!("{:?} {} set flee destination: {:.0}px away", 
                   animal.species, animal.id, flee_distance);
    }
    
    if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
        move_towards_target(ctx, animal, target_x, target_y, stats.sprint_speed, dt);
        
        // Check if stuck and pick new direction
        if handle_movement_stuck_recovery(animal, prev_x, prev_y, 5.0, rng, "flee") {
            // Pick new flee direction if stuck
            let new_angle = rng.gen::<f32>() * 2.0 * PI;
            let flee_distance = 300.0;
            animal.investigation_x = Some(animal.pos_x + flee_distance * new_angle.cos());
            animal.investigation_y = Some(animal.pos_y + flee_distance * new_angle.sin());
        }
        
        // Check if reached destination or timeout
        let distance_to_target = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y).sqrt();
        let time_fleeing = current_time.to_micros_since_unix_epoch() - animal.state_change_time.to_micros_since_unix_epoch();
        
        let max_flee_time = match animal.species {
            AnimalSpecies::CinderFox => 3_000_000,  // 3 seconds
            AnimalSpecies::TundraWolf => 4_000_000, // 4 seconds  
            AnimalSpecies::CableViper => 3_000_000, // 3 seconds
            AnimalSpecies::ArcticWalrus => 1_000_000, // 1 second (walruses don't really flee)
            AnimalSpecies::BeachCrab => 2_000_000,  // 2 seconds - quick scuttle escape
            AnimalSpecies::Tern => 5_000_000,       // 5 seconds - fly away far
            AnimalSpecies::Crow => 4_000_000,       // 4 seconds - fly away
        };
        
        if distance_to_target <= 50.0 || time_fleeing > max_flee_time {
            // PERFORMANCE: Go to Idle instead of Patrolling - animal stops moving until player nearby
            transition_to_state(animal, AnimalState::Idle, current_time, None, "flee completed");
            animal.investigation_x = None;
            animal.investigation_y = None;
            log::debug!("{:?} {} finished fleeing - going idle (no wandering)", animal.species, animal.id);
        }
    }
}

// ============================================================================
// FLYING BIRD SYSTEM - Reusable for Terns, Crows, and future bird types
// ============================================================================

/// Flying patrol constants
const FLYING_PATROL_MIN_DISTANCE: f32 = 150.0;  // Minimum distance to fly when patrolling
const FLYING_PATROL_MAX_DISTANCE: f32 = 400.0;  // Maximum distance to fly when patrolling  
const FLYING_SPEED_MULTIPLIER: f32 = 1.8;       // Birds fly faster than they walk
const FLYING_HEIGHT_VISUAL: f32 = 32.0;         // Visual height offset for flying birds (not actual collision)
const GROUNDED_PATROL_RADIUS: f32 = 150.0;      // Walking patrol radius for grounded birds
const CHANCE_TO_LAND: f32 = 0.15;               // 15% chance per tick to land while flying (increased - birds should land more often)
const CHANCE_TO_TAKE_OFF: f32 = 0.008;          // 0.8% chance per tick to take off while grounded (much lower - birds should stay grounded longer)

/// **FLYING PATROL** - Birds fly around the island but frequently land to walk
pub fn execute_flying_patrol(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    stats: &AnimalStats,
    dt: f32,
    rng: &mut impl Rng,
) {
    // CRITICAL: Set flying flag to true when flying - this controls sprite selection on client
    animal.is_flying = true;
    
    // Random chance to land each tick (high chance - birds should land often)
    // At 8 ticks/second, 15% = roughly 120% per second, so they land quickly
    if rng.gen::<f32>() < CHANCE_TO_LAND {
        // Check if current position is valid for landing (not water)
        if !is_water_tile(ctx, animal.pos_x, animal.pos_y) && 
           !is_position_in_shelter(ctx, animal.pos_x, animal.pos_y) {
            animal.is_flying = false;
            animal.state = AnimalState::Grounded;
            animal.flying_target_x = None;
            animal.flying_target_y = None;
            log::info!("🐦 {:?} {} LANDED at ({:.0}, {:.0}) - now walking", 
                       animal.species, animal.id, animal.pos_x, animal.pos_y);
            return;
        }
    }
    
    // Set a flying destination if we don't have one
    if animal.flying_target_x.is_none() || animal.flying_target_y.is_none() {
        let fly_distance = FLYING_PATROL_MIN_DISTANCE + rng.gen::<f32>() * (FLYING_PATROL_MAX_DISTANCE - FLYING_PATROL_MIN_DISTANCE);
        let fly_angle = rng.gen::<f32>() * 2.0 * PI;
        
        let target_x = animal.pos_x + fly_distance * fly_angle.cos();
        let target_y = animal.pos_y + fly_distance * fly_angle.sin();
        
        // Clamp to world bounds (birds can fly anywhere, including over water)
        let clamped_x = target_x.clamp(50.0, WORLD_WIDTH_PX - 50.0);
        let clamped_y = target_y.clamp(50.0, WORLD_HEIGHT_PX - 50.0);
        
        animal.flying_target_x = Some(clamped_x);
        animal.flying_target_y = Some(clamped_y);
        
        log::debug!("{:?} {} set flying patrol destination to ({:.0}, {:.0})", 
                   animal.species, animal.id, clamped_x, clamped_y);
    }
    
    // Move toward flying destination at high speed (ignore ground obstacles)
    if let (Some(target_x), Some(target_y)) = (animal.flying_target_x, animal.flying_target_y) {
        let fly_speed = stats.sprint_speed * FLYING_SPEED_MULTIPLIER;
        
        // Calculate direction to target
        let dx = target_x - animal.pos_x;
        let dy = target_y - animal.pos_y;
        let distance = (dx * dx + dy * dy).sqrt();
        
        if distance > 20.0 {
            // Move toward target (flying ignores water/shelter collision)
            let norm_dx = dx / distance;
            let norm_dy = dy / distance;
            
            let move_amount = fly_speed * dt;
            let new_x = (animal.pos_x + norm_dx * move_amount).clamp(10.0, WORLD_WIDTH_PX - 10.0);
            let new_y = (animal.pos_y + norm_dy * move_amount).clamp(10.0, WORLD_HEIGHT_PX - 10.0);
            
            animal.pos_x = new_x;
            animal.pos_y = new_y;
            animal.direction_x = norm_dx;
            animal.direction_y = norm_dy;
            
            // Update facing direction
            update_facing_direction(animal);
            
            // Update chunk index
            animal.chunk_index = crate::environment::calculate_chunk_index(animal.pos_x, animal.pos_y);
        } else {
            // Reached flying destination - high chance to land
            animal.flying_target_x = None;
            animal.flying_target_y = None;
            
            // 40% chance to land when reaching destination
            if rng.gen::<f32>() < 0.40 {
                // Check if current position is valid for landing (not water)
                if !is_water_tile(ctx, animal.pos_x, animal.pos_y) && 
                   !is_position_in_shelter(ctx, animal.pos_x, animal.pos_y) {
                    animal.is_flying = false;
                    animal.state = AnimalState::Grounded;
                    log::debug!("{:?} {} landed after reaching flying destination", 
                               animal.species, animal.id);
                }
            }
        }
    }
}

/// **GROUNDED PATROL** - Birds on the ground walk around using direction-based movement like crabs
/// This uses the same pattern as execute_standard_patrol for smooth, organic walking
pub fn execute_grounded_idle(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    stats: &AnimalStats,
    dt: f32,
    rng: &mut impl Rng,
) {
    // CRITICAL: Ensure bird is NOT flying - this flag controls sprite selection on client
    animal.is_flying = false;
    
    // Very low random chance to take off - birds should stay grounded and walk more
    // At 8 ticks/second, 0.8% = roughly 6% chance per second to take off
    if rng.gen::<f32>() < CHANCE_TO_TAKE_OFF {
        animal.is_flying = true;
        animal.state = AnimalState::Flying;
        animal.flying_target_x = None;
        animal.flying_target_y = None;
        log::info!("🐦 {:?} {} TOOK OFF from ground - now flying", animal.species, animal.id);
        return;
    }
    
    let prev_x = animal.pos_x;
    let prev_y = animal.pos_y;
    
    // Use DIRECTION-BASED movement like crabs, not destination-based
    // This prevents the jittery back-and-forth behavior
    
    // Small chance to randomly change direction (3% per tick = ~24% per second)
    if rng.gen::<f32>() < 0.03 {
        let new_angle = rng.gen::<f32>() * 2.0 * PI;
        animal.direction_x = new_angle.cos();
        animal.direction_y = new_angle.sin();
    }
    
    // Ground walking speed - slower than flying, similar to crabs
    let ground_speed = stats.movement_speed * 0.6;
    
    // Calculate next position based on current direction
    let next_x = animal.pos_x + animal.direction_x * ground_speed * dt;
    let next_y = animal.pos_y + animal.direction_y * ground_speed * dt;
    
    // Check if next position is valid (not water, not in shelter)
    if !is_water_tile(ctx, next_x, next_y) && !is_position_in_shelter(ctx, next_x, next_y) {
        // Position is valid - move there
        move_towards_target(ctx, animal, next_x, next_y, ground_speed, dt);
    } else {
        // Blocked! Pick a new random direction away from obstacle
        let new_angle = rng.gen::<f32>() * 2.0 * PI;
        animal.direction_x = new_angle.cos();
        animal.direction_y = new_angle.sin();
    }
    
    // Check if stuck (didn't move enough) and pick new direction
    let distance_moved = ((animal.pos_x - prev_x).powi(2) + (animal.pos_y - prev_y).powi(2)).sqrt();
    if distance_moved < 1.0 {
        // Stuck - pick a new random direction
        let new_angle = rng.gen::<f32>() * 2.0 * PI;
        animal.direction_x = new_angle.cos();
        animal.direction_y = new_angle.sin();
    }
    
    // Clear any flying target since we're using direction-based movement now
    animal.flying_target_x = None;
    animal.flying_target_y = None;
}

/// **FLYING CHASE** - Birds aggressively fly-chase players for food/items
pub fn execute_flying_chase(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    stats: &AnimalStats,
    target_x: f32,
    target_y: f32,
    dt: f32,
) {
    // Ensure bird is flying
    animal.is_flying = true;
    
    // Chase at high flying speed
    let chase_speed = stats.sprint_speed * FLYING_SPEED_MULTIPLIER;
    
    // Calculate direction to target
    let dx = target_x - animal.pos_x;
    let dy = target_y - animal.pos_y;
    let distance = (dx * dx + dy * dy).sqrt();
    
    if distance > 10.0 {
        let norm_dx = dx / distance;
        let norm_dy = dy / distance;
        
        let move_amount = chase_speed * dt;
        let new_x = (animal.pos_x + norm_dx * move_amount).clamp(10.0, WORLD_WIDTH_PX - 10.0);
        let new_y = (animal.pos_y + norm_dy * move_amount).clamp(10.0, WORLD_HEIGHT_PX - 10.0);
        
        animal.pos_x = new_x;
        animal.pos_y = new_y;
        animal.direction_x = norm_dx;
        animal.direction_y = norm_dy;
        
        // Update facing direction
        update_facing_direction(animal);
        
        // Update chunk index
        animal.chunk_index = crate::environment::calculate_chunk_index(animal.pos_x, animal.pos_y);
    }
    
    // Clear any flying target since we're chasing
    animal.flying_target_x = None;
    animal.flying_target_y = None;
}

/// Check if a bird is currently flying
pub fn is_bird_flying(animal: &WildAnimal) -> bool {
    animal.is_flying
}

/// Check if a species is a bird that can fly
pub fn is_flying_species(species: &AnimalSpecies) -> bool {
    matches!(species, AnimalSpecies::Tern | AnimalSpecies::Crow)
}

/// Update the facing direction string based on direction vector
pub fn update_facing_direction(animal: &mut WildAnimal) {
    if animal.direction_x.abs() > animal.direction_y.abs() {
        // Horizontal movement is dominant
        animal.facing_direction = if animal.direction_x > 0.0 { "right".to_string() } else { "left".to_string() };
    } else {
        // Vertical movement is dominant
        animal.facing_direction = if animal.direction_y > 0.0 { "down".to_string() } else { "up".to_string() };
    }
}

// ============================================================================
// END FLYING BIRD SYSTEM
// ============================================================================

/// **COMMON CHASE DISTANCE CHECKS** - Standard logic for when to stop chasing
pub fn should_stop_chasing(
    animal: &WildAnimal,
    target_player: &Player,
    stats: &AnimalStats,
    behavior: &AnimalBehaviorEnum,
) -> bool {
    let distance = get_player_distance(animal, target_player);
    let chase_abandon_distance = stats.chase_trigger_range * behavior.get_chase_abandonment_multiplier();
    
    distance > chase_abandon_distance
}

/// **COMMON STATE TIMEOUT CHECKER** - Handles time-based state transitions
pub fn check_state_timeout(
    animal: &WildAnimal,
    current_time: Timestamp,
    timeout_ms: i64,
) -> bool {
    let time_in_state = (current_time.to_micros_since_unix_epoch() - 
                        animal.state_change_time.to_micros_since_unix_epoch()) / 1000;
    time_in_state > timeout_ms
}

/// **COMMON PLAYER HEALTH ASSESSMENT** - Evaluate player health for decision making
pub fn assess_player_threat_level(player: &Player) -> PlayerThreatLevel {
    let health_percent = player.health / crate::player_stats::PLAYER_MAX_HEALTH;
    
    if health_percent >= 0.7 {
        PlayerThreatLevel::Healthy
    } else if health_percent >= 0.4 {
        PlayerThreatLevel::Moderate
    } else if health_percent >= 0.15 {
        PlayerThreatLevel::Weak
    } else {
        PlayerThreatLevel::Critical
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PlayerThreatLevel {
    Healthy,    // 70%+ health - dangerous to attack
    Moderate,   // 40-70% health - moderate threat
    Weak,       // 15-40% health - good target for opportunistic animals
    Critical,   // <15% health - easy target
}

/// **COMMON ATTACK AFTERMATH LOGIC** - Handle common post-attack behaviors
pub fn handle_attack_aftermath(
    animal: &mut WildAnimal,
    target_player: &Player,
    current_time: Timestamp,
    rng: &mut impl Rng,
) {
    match animal.species {
        AnimalSpecies::CinderFox => {
            // Fox hit-and-run behavior based on target health
            let threat_level = assess_player_threat_level(target_player);
            
            if matches!(threat_level, PlayerThreatLevel::Healthy | PlayerThreatLevel::Moderate) {
                // Healthy target - flee after attack
                set_flee_destination_away_from_threat(animal, target_player.position_x, target_player.position_y, 320.0, rng);
                transition_to_state(animal, AnimalState::Fleeing, current_time, None, "hit and run");
                
                // Fox jumps back after attack
                let jump_distance = 80.0;
                let dx = animal.pos_x - target_player.position_x;
                let dy = animal.pos_y - target_player.position_y;
                let distance = (dx * dx + dy * dy).sqrt();
                if distance > 0.0 {
                    let new_x = animal.pos_x + (dx / distance) * jump_distance;
                    let new_y = animal.pos_y + (dy / distance) * jump_distance;
                    
                    // Use centralized position update function
                    update_animal_position(animal, new_x, new_y);
                }
                
                log::info!("Cinder Fox {} hit-and-run on healthy target - fleeing", animal.id);
            } else {
                // Weak target - stay aggressive
                transition_to_state(animal, AnimalState::Chasing, current_time, Some(target_player.identity), "continue assault");
                log::info!("Cinder Fox {} continues assault on weak target", animal.id);
            }
        },
        
        AnimalSpecies::TundraWolf => {
            // Wolves sometimes get double strikes or become more aggressive
            if rng.gen::<f32>() < 0.3 {
                animal.last_attack_time = None; // Reset for immediate second strike
                log::info!("Tundra Wolf {} enters blood rage - double strike ready!", animal.id);
            }
        },
        
        AnimalSpecies::CableViper => {
            // Vipers might retreat after venomous strike or continue attacking
            log::info!("Cable Viper {} injected venom - assessing next move", animal.id);
        },
        
        AnimalSpecies::ArcticWalrus => {
            // Walruses are relentless once engaged - no special behavior, just keep attacking
            log::info!("Arctic Walrus {} delivered crushing blow - remaining aggressive", animal.id);
        },
        
        AnimalSpecies::BeachCrab => {
            // Crabs are simple - they pinch and continue attacking
            log::info!("Beach Crab {} delivered pinch attack - continuing defense", animal.id);
        },
        
        AnimalSpecies::Tern => {
            // Terns are scavengers - they peck and then fly away
            set_flee_destination_away_from_threat(animal, target_player.position_x, target_player.position_y, 200.0, rng);
            transition_to_state(animal, AnimalState::Flying, current_time, None, "tern fly away");
            animal.is_flying = true;
            log::info!("Tern {} pecked and flew away", animal.id);
        },
        
        AnimalSpecies::Crow => {
            // Crows are opportunistic - they steal/peck and then fly away
            set_flee_destination_away_from_threat(animal, target_player.position_x, target_player.position_y, 250.0, rng);
            transition_to_state(animal, AnimalState::Flying, current_time, None, "crow fly away");
            animal.is_flying = true;
            log::info!("Crow {} attacked and flew away", animal.id);
        },
    }
}

/// **COMMON CHASE STATE HANDLER** - Standardized chase behavior
pub fn handle_chase_state(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    stats: &AnimalStats,
    current_time: Timestamp,
) -> Result<(), String> {
    if let Some(target_id) = animal.target_player_id {
        if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
            // Check if should stop chasing based on distance
            let behavior = animal.species.get_behavior();
            if should_stop_chasing(animal, &target_player, stats, &behavior) {
                // PERFORMANCE: Go to Idle instead of Patrolling - animal stops until player nearby
                transition_to_state(animal, AnimalState::Idle, current_time, None, "player escaped");
                log::debug!("{:?} {} stopping chase - going idle", animal.species, animal.id);
                return Ok(());
            }
        } else {
            // Target lost - go idle instead of wandering
            transition_to_state(animal, AnimalState::Idle, current_time, None, "target lost");
        }
    }
    Ok(())
}

/// **COMMON DAMAGE RESPONSE HANDLER** - Standard health-based reactions  
pub fn handle_standard_damage_response(
    animal: &mut WildAnimal,
    attacker: &Player,
    stats: &AnimalStats,
    current_time: Timestamp,
    rng: &mut impl Rng,
) {
    let health_percent = animal.health / stats.max_health;
    
    // Check if should flee due to low health
    if health_percent < stats.flee_trigger_health_percent {
        set_flee_destination_away_from_threat(animal, attacker.position_x, attacker.position_y, 400.0, rng);
        transition_to_state(animal, AnimalState::Fleeing, current_time, None, "low health flee");
        
        log::info!("{:?} {} fleeing due to injury ({:.1}% health)", 
                  animal.species, animal.id, health_percent * 100.0);
    } else {
        // Species-specific damage responses
        match animal.species {
            AnimalSpecies::CinderFox => {
                let threat_level = assess_player_threat_level(attacker);
                
                if matches!(threat_level, PlayerThreatLevel::Healthy | PlayerThreatLevel::Moderate) {
                    // Healthy attacker - flee
                    set_flee_destination_away_from_threat(animal, attacker.position_x, attacker.position_y, 320.0, rng);
                    transition_to_state(animal, AnimalState::Fleeing, current_time, None, "healthy attacker");
                } else {
                    // Weak attacker - become aggressive
                    transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "weak attacker");
                }
            },
            
            AnimalSpecies::TundraWolf => {
                // Wolves rarely flee - become more aggressive when hit
                if health_percent > 0.3 {
                    transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "retaliation");
                    log::info!("Tundra Wolf {} retaliating against attacker", animal.id);
                }
            },
            
            AnimalSpecies::CableViper => {
                // Vipers might enter defensive mode or continue attacking
                log::info!("Cable Viper {} damaged - entering defensive posture", animal.id);
            },
            
            AnimalSpecies::ArcticWalrus => {
                // Walruses are relentless once engaged - no special behavior, just keep attacking
                log::info!("Arctic Walrus {} delivered crushing blow - remaining aggressive", animal.id);
            },
            
            AnimalSpecies::BeachCrab => {
                // Crabs retaliate when attacked - simple defensive behavior
                transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "crab retaliation");
                log::info!("Beach Crab {} retaliating against attacker", animal.id);
            },
            
            AnimalSpecies::Tern => {
                // Terns always flee when damaged - fly away
                set_flee_destination_away_from_threat(animal, attacker.position_x, attacker.position_y, 500.0, rng);
                transition_to_state(animal, AnimalState::Flying, current_time, None, "tern flee damage");
                animal.is_flying = true;
                log::info!("Tern {} flying away after damage", animal.id);
            },
            
            AnimalSpecies::Crow => {
                // Crows flee when damaged but may drop stolen items
                set_flee_destination_away_from_threat(animal, attacker.position_x, attacker.position_y, 400.0, rng);
                transition_to_state(animal, AnimalState::Flying, current_time, None, "crow flee damage");
                animal.is_flying = true;
                log::info!("Crow {} flying away after damage", animal.id);
            },
        }
    }
}

// --- TAMING SYSTEM FUNCTIONS ---

/// Types of threats that can threaten a tamed animal's owner
#[derive(Debug, Clone)]
pub enum ThreatType {
    Player(Identity),
    WildAnimal(u64), // animal id
}

/// Efficiently detect all threats (players and wild animals) to the owner within protection range
/// This function can be used by any tamed animal species to protect their owner
pub fn detect_threats_to_owner(
    ctx: &ReducerContext, 
    protecting_animal: &WildAnimal, 
    owner: &Player
) -> Vec<ThreatType> {
    let mut threats = Vec::new();
    
    // Check player threats
    for player in ctx.db.player().iter() {
        if player.identity == owner.identity || player.is_dead || !player.is_online { 
            continue; 
        }
        
        let distance_to_owner = get_distance_squared(player.position_x, player.position_y, owner.position_x, owner.position_y).sqrt();
        let distance_to_protector = get_player_distance(protecting_animal, &player);
        
        // Player is a threat if they're close to owner and within protector's range
        if distance_to_owner <= 150.0 && distance_to_protector <= TAMING_PROTECT_RADIUS {
            threats.push(ThreatType::Player(player.identity));
        }
    }
    
    // Check wild animal threats
    for animal in ctx.db.wild_animal().iter() {
        if animal.id == protecting_animal.id { 
            continue; // Skip self
        }
        
        // Skip animals tamed by the same owner
        if let Some(other_tamed_by) = animal.tamed_by {
            if other_tamed_by == owner.identity {
                continue;
            }
        }
        
        // Only consider animals that are actively threatening the owner
        if let Some(target_id) = animal.target_player_id {
            if target_id == owner.identity && matches!(animal.state, AnimalState::Chasing | AnimalState::Attacking) {
                let distance_to_protector = ((protecting_animal.pos_x - animal.pos_x).powi(2) + 
                                            (protecting_animal.pos_y - animal.pos_y).powi(2)).sqrt();
                
                if distance_to_protector <= TAMING_PROTECT_RADIUS {
                    threats.push(ThreatType::WildAnimal(animal.id));
                }
            }
        }
    }
    
    threats
}

/// Find the closest threat from a list of threats
pub fn find_closest_threat(
    ctx: &ReducerContext,
    protecting_animal: &WildAnimal,
    threats: Vec<ThreatType>
) -> Option<ThreatType> {
    threats.into_iter().min_by(|a, b| {
        let dist_a = match a {
            ThreatType::Player(id) => {
                ctx.db.player().identity().find(id)
                    .map(|p| get_player_distance(protecting_animal, &p))
                    .unwrap_or(f32::MAX)
            },
            ThreatType::WildAnimal(id) => {
                ctx.db.wild_animal().id().find(id)
                    .map(|w| ((protecting_animal.pos_x - w.pos_x).powi(2) + 
                              (protecting_animal.pos_y - w.pos_y).powi(2)).sqrt())
                    .unwrap_or(f32::MAX)
            }
        };
        let dist_b = match b {
            ThreatType::Player(id) => {
                ctx.db.player().identity().find(id)
                    .map(|p| get_player_distance(protecting_animal, &p))
                    .unwrap_or(f32::MAX)
            },
            ThreatType::WildAnimal(id) => {
                ctx.db.wild_animal().id().find(id)
                    .map(|w| ((protecting_animal.pos_x - w.pos_x).powi(2) + 
                              (protecting_animal.pos_y - w.pos_y).powi(2)).sqrt())
                    .unwrap_or(f32::MAX)
            }
        };
        dist_a.partial_cmp(&dist_b).unwrap_or(std::cmp::Ordering::Equal)
    })
}

/// Generic helper function for tamed animals to handle threat targeting
/// Returns the target Identity that should be pursued (either player or effective target for wild animals)
pub fn handle_generic_threat_targeting(
    ctx: &ReducerContext,
    protecting_animal: &mut WildAnimal,
    owner_id: Identity,
    current_time: Timestamp,
) -> Option<Identity> {
    if let Some(owner) = ctx.db.player().identity().find(&owner_id) {
        let threats = detect_threats_to_owner(ctx, protecting_animal, &owner);
        
        if !threats.is_empty() {
            if let Some(closest_threat) = find_closest_threat(ctx, protecting_animal, threats) {
                let target_id = match &closest_threat {
                    ThreatType::Player(id) => *id,
                    ThreatType::WildAnimal(id) => {
                        // For wild animals, we target them but store as a special case
                        // The main AI system will handle this in the chase/attack logic
                        if let Some(threatening_animal) = ctx.db.wild_animal().id().find(id) {
                            // Use the threatening animal's target (our owner) or fallback to owner
                            threatening_animal.target_player_id.unwrap_or(owner_id)
                        } else {
                            owner_id // Fallback
                        }
                    }
                };
                
                transition_to_state(protecting_animal, AnimalState::Protecting, current_time, Some(target_id), "protecting owner from threat");
                
                match closest_threat {
                    ThreatType::Player(id) => {
                        log::info!("🛡️ Tamed {:?} {} protecting owner {} from player threat {}", 
                                  protecting_animal.species, protecting_animal.id, owner_id, id);
                    },
                    ThreatType::WildAnimal(id) => {
                        log::info!("🛡️ Tamed {:?} {} protecting owner {} from wild animal threat {}", 
                                  protecting_animal.species, protecting_animal.id, owner_id, id);
                    }
                }
                
                return Some(target_id);
            }
        }
    }
    
    None // No threats found
}

/// Check if an item is valid taming food for the given animal species
pub fn is_valid_taming_food(ctx: &ReducerContext, item_def_id: u64, species: AnimalSpecies) -> bool {
    if let Some(item_def) = ctx.db.item_definition().id().find(item_def_id) {
        let behavior = species.get_behavior();
        if !behavior.can_be_tamed() {
            return false;
        }
        
        let taming_foods = behavior.get_taming_foods();
        taming_foods.contains(&item_def.name.as_str())
    } else {
        false
    }
}

/// Find nearby dropped food items that this animal can eat
pub fn find_nearby_taming_food(ctx: &ReducerContext, animal: &WildAnimal) -> Vec<crate::dropped_item::DroppedItem> {
    let mut nearby_food = Vec::new();
    
    for dropped_item in ctx.db.dropped_item().iter() {
        let distance_sq = get_distance_squared(
            animal.pos_x, animal.pos_y,
            dropped_item.pos_x, dropped_item.pos_y
        );
        
        if distance_sq <= TAMING_FOOD_DETECTION_RADIUS_SQUARED {
            if is_valid_taming_food(ctx, dropped_item.item_def_id, animal.species) {
                nearby_food.push(dropped_item);
            }
        }
    }
    
    nearby_food
}

/// Handle an animal eating food and potentially becoming tamed
pub fn handle_animal_eat_food(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    dropped_item: &crate::dropped_item::DroppedItem,
    current_time: Timestamp,
) -> Result<bool, String> {
    // Find the player who dropped this food (closest player)
    let mut closest_player: Option<Player> = None;
    let mut closest_distance = f32::MAX;
    
    for player in ctx.db.player().iter() {
        if player.is_dead { continue; }
        
        let distance = get_distance_squared(
            dropped_item.pos_x, dropped_item.pos_y,
            player.position_x, player.position_y
        ).sqrt();
        
        if distance < closest_distance && distance <= 200.0 { // Must be within 200px when food was dropped
            closest_distance = distance;
            closest_player = Some(player);
        }
    }
    
    if let Some(tamer) = closest_player {
        // Animal becomes tamed by this player
        animal.tamed_by = Some(tamer.identity);
        animal.tamed_at = Some(current_time);
        animal.heart_effect_until = Some(Timestamp::from_micros_since_unix_epoch(
            current_time.to_micros_since_unix_epoch() + (TAMING_HEART_EFFECT_DURATION_MS * 1000) as i64
        ));
        
        // Change to following state
        transition_to_state(animal, AnimalState::Following, current_time, Some(tamer.identity), "tamed by food");
        
        // Clear any aggressive states
        animal.fire_fear_overridden_by = None;
        
        // Remove the dropped item from the world
        ctx.db.dropped_item().id().delete(dropped_item.id);
        
        // Emit eating sound
        emit_species_sound(ctx, animal, tamer.identity, "eating");
        
        // Emit heart effect (this would be handled client-side based on heart_effect_until field)
        // For now we'll just log it
        log::info!("💖 {:?} {} has been tamed by player {} after eating {}! Hearts appearing for {}ms", 
                  animal.species, animal.id, tamer.identity, dropped_item.item_def_id, TAMING_HEART_EFFECT_DURATION_MS);
        
        // Track walrus taming achievement specifically
        if animal.species == AnimalSpecies::ArcticWalrus {
            if let Err(e) = crate::player_progression::track_stat_and_check_achievements(ctx, tamer.identity, "walrus_tamed", 1) {
                log::error!("Failed to track walrus taming stat: {}", e);
            }
        }
        
        Ok(true) // Successfully tamed
    } else {
        // No suitable player found - just eat the food without taming
        ctx.db.dropped_item().id().delete(dropped_item.id);
        log::info!("{:?} {} ate food but no player nearby to become tamed", animal.species, animal.id);
        Ok(false) // Ate food but not tamed
    }
}

/// Process taming behavior - check for food and handle eating
pub fn process_taming_behavior(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    current_time: Timestamp,
) -> Result<(), String> {
    // Only check for food periodically to avoid performance issues
    if let Some(last_check) = animal.last_food_check {
        let time_since_check = (current_time.to_micros_since_unix_epoch() - last_check.to_micros_since_unix_epoch()) / 1000;
        if time_since_check < TAMING_FOOD_CHECK_INTERVAL_MS {
            return Ok(());
        }
    }
    
    animal.last_food_check = Some(current_time);
    
    // Don't process taming if already tamed
    if animal.tamed_by.is_some() {
        return Ok(());
    }
    
    // Check if this species can be tamed using the trait method
    let behavior = animal.species.get_behavior();
    if !behavior.can_be_tamed() {
        return Ok(());
    }
    
    // Look for nearby food
    let nearby_food = find_nearby_taming_food(ctx, animal);
    
    if let Some(food_item) = nearby_food.first() {
        // Move towards the food if not already next to it
        let distance_to_food = get_distance_squared(
            animal.pos_x, animal.pos_y,
            food_item.pos_x, food_item.pos_y
        ).sqrt();
        
        if distance_to_food > 30.0 {
            // Move towards food
            transition_to_state(animal, AnimalState::Investigating, current_time, None, "approaching food");
            animal.investigation_x = Some(food_item.pos_x);
            animal.investigation_y = Some(food_item.pos_y);
        } else {
            // Close enough to eat
            handle_animal_eat_food(ctx, animal, food_item, current_time)?;
        }
    }
    
    Ok(())
}

/// Handle following behavior for tamed animals
pub fn handle_tamed_following(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    stats: &AnimalStats,
    current_time: Timestamp,
    dt: f32,
    rng: &mut impl Rng, // Add rng parameter
) {
    if let Some(owner_id) = animal.tamed_by {
        if let Some(owner) = ctx.db.player().identity().find(&owner_id) {
            if owner.is_dead {
                // Owner is dead - animal becomes wild again after some time
                if let Some(tamed_time) = animal.tamed_at {
                    let time_since_taming = (current_time.to_micros_since_unix_epoch() - tamed_time.to_micros_since_unix_epoch()) / 1000;
                    if time_since_taming > 60000 { // 60 seconds after owner death
                        animal.tamed_by = None;
                        animal.tamed_at = None;
                        transition_to_state(animal, AnimalState::Idle, current_time, None, "owner died - becoming wild");
                        log::info!("{:?} {} became wild again after owner death - going idle", animal.species, animal.id);
                    }
                }
                return;
            }
            
            let distance_to_owner = get_distance_squared(
                animal.pos_x, animal.pos_y,
                owner.position_x, owner.position_y
            );
            
            // Check if anyone is attacking the owner
            let mut attacker: Option<Player> = None;
            for player in ctx.db.player().iter() {
                if player.identity != owner_id && !player.is_dead {
                    let distance_to_potential_threat = get_distance_squared(
                        owner.position_x, owner.position_y,
                        player.position_x, player.position_y
                    );
                    
                    // If another player is very close to owner, consider them a threat
                    if distance_to_potential_threat <= 10000.0 { // 100px
                        attacker = Some(player);
                        break;
                    }
                }
            }
            
            // Check if we should protect owner
            if let Some(threat) = attacker {
                let distance_to_threat = get_distance_squared(
                    animal.pos_x, animal.pos_y,
                    threat.position_x, threat.position_y
                );
                
                if distance_to_threat <= TAMING_PROTECT_RADIUS_SQUARED {
                    transition_to_state(animal, AnimalState::Protecting, current_time, Some(threat.identity), "protecting owner");
                    log::info!("{:?} {} protecting owner {} from threat {}", 
                              animal.species, animal.id, owner_id, threat.identity);
                }
            } else if distance_to_owner > TAMING_FOLLOW_DISTANCE_SQUARED {
                // Too far from owner - move closer
                move_towards_target(ctx, animal, owner.position_x, owner.position_y, stats.movement_speed * 1.2, dt);
            } else {
                // Close enough to owner - just chill nearby
                // Maybe wander slightly but stay close
                if rng.gen::<f32>() < 0.05 { // 5% chance to adjust position slightly
                    let angle = rng.gen::<f32>() * 2.0 * PI;
                    let wander_distance = 20.0;
                    let target_x = owner.position_x + angle.cos() * wander_distance;
                    let target_y = owner.position_y + angle.sin() * wander_distance;
                    move_towards_target(ctx, animal, target_x, target_y, stats.movement_speed * 0.5, dt);
                }
            }
        } else {
            // Owner not found - become wild again (go idle, not wander)
            animal.tamed_by = None;
            animal.tamed_at = None;
            transition_to_state(animal, AnimalState::Idle, current_time, None, "owner not found - becoming wild");
            log::info!("{:?} {} became wild again - owner not found, going idle", animal.species, animal.id);
        }
    }
}

/// Handle protecting behavior for tamed animals
pub fn handle_tamed_protecting(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    stats: &AnimalStats,
    current_time: Timestamp,
    dt: f32,
    rng: &mut impl Rng, // Add rng parameter
) {
    // Only protect if we have an owner
    let owner_id = match animal.tamed_by {
        Some(id) => id,
        None => return,
    };
    
    // Find the owner
    let owner = match ctx.db.player().identity().find(&owner_id) {
        Some(player) => player,
        None => {
            log::warn!("Tamed animal {} owner {} not found - reverting to wild", animal.id, owner_id);
            animal.tamed_by = None;
            animal.state = AnimalState::Patrolling;
            return;
        }
    };
    
    // If owner is dead or offline, stop protecting
    if owner.is_dead || !owner.is_online {
        transition_to_state(animal, AnimalState::Following, current_time, Some(owner_id), "owner dead/offline - stop protecting");
        return;
    }
    
    // Find threats to the owner (wild animals and players attacking the owner)
    let mut animal_threats = Vec::new();
    let mut player_threats = Vec::new();
    
    // Check for wild animals that might be threats (untamed or tamed by others)
    for other_animal in ctx.db.wild_animal().iter() {
        if other_animal.id == animal.id {
            continue;
        }
        
        // Skip animals tamed by the same owner
        if let Some(other_tamed_by) = other_animal.tamed_by {
            if other_tamed_by == owner_id {
                continue;
            }
        }
        
        // Check if this animal is within protection radius and potentially hostile
        let distance_to_threat = get_distance_squared(
            animal.pos_x, animal.pos_y,
            other_animal.pos_x, other_animal.pos_y
        );
        
        if distance_to_threat <= TAMING_PROTECT_RADIUS_SQUARED {
            // Check if this animal is actively hostile (chasing/attacking the owner or close enough to be a threat)
            let distance_to_owner = get_distance_squared(
                other_animal.pos_x, other_animal.pos_y,
                owner.position_x, owner.position_y
            );
            
            // Consider as threat if:
            // 1. Animal is targeting our owner specifically
            // 2. Animal is very close to owner (within attack range + buffer)
            // 3. Animal is in aggressive state and near owner
            let is_targeting_owner = other_animal.target_player_id == Some(owner_id);
            let is_close_to_owner = distance_to_owner <= (stats.attack_range + 50.0) * (stats.attack_range + 50.0);
            let is_aggressive_near_owner = matches!(other_animal.state, AnimalState::Chasing | AnimalState::Attacking) && distance_to_owner <= 400.0;
            
            if is_targeting_owner || is_close_to_owner || is_aggressive_near_owner {
                log::debug!("🛡️ [THREAT DETECTED] Tamed {:?} {} identified {:?} {} as threat to owner {}", 
                           animal.species, animal.id, 
                           other_animal.species, other_animal.id, owner_id);
                animal_threats.push(other_animal);
            }
        }
    }
    
    // Check for player threats (players very close to owner and potentially hostile)
    for other_player in ctx.db.player().iter() {
        if other_player.identity == owner_id || other_player.is_dead || !other_player.is_online {
            continue;
        }
        
        let distance_to_player = get_distance_squared(
            animal.pos_x, animal.pos_y,
            other_player.position_x, other_player.position_y
        );
        
        if distance_to_player <= TAMING_PROTECT_RADIUS_SQUARED {
            let distance_to_owner = get_distance_squared(
                other_player.position_x, other_player.position_y,
                owner.position_x, owner.position_y
            );
            
            // Consider player a threat if very close to owner (within 100px)
            if distance_to_owner <= 10000.0 { // 100px squared
                log::debug!("🛡️ [PLAYER THREAT] Tamed {:?} {} identified player {} as threat to owner {}", 
                           animal.species, animal.id, other_player.identity, owner_id);
                player_threats.push(other_player);
            }
        }
    }
    
    // Prioritize animal threats first (easier to handle), then player threats
    if let Some(threat_animal) = animal_threats.first() {
        // Handle animal vs animal combat
        let distance_to_threat = get_distance_squared(
            animal.pos_x, animal.pos_y,
            threat_animal.pos_x, threat_animal.pos_y
        );
        
        if distance_to_threat <= stats.attack_range * stats.attack_range {
            // Attack the threat animal if we can
            if can_attack(animal, current_time, stats) {
                // Use our new animal vs animal damage function
                let damage_to_deal = stats.attack_damage;
                
                match damage_wild_animal_by_animal(ctx, threat_animal.id, damage_to_deal, animal.id, current_time) {
                    Ok(target_died) => {
                        log::info!("🛡️ [PROTECTION ATTACK] Tamed {:?} {} dealt {:.1} damage to threat {:?} {} ({})", 
                                  animal.species, animal.id, damage_to_deal,
                                  threat_animal.species, threat_animal.id,
                                  if target_died { "KILLED" } else { "WOUNDED" });
                        
                        // If we killed the threat, check for more threats or return to following
                        if target_died {
                            if animal_threats.len() <= 1 && player_threats.is_empty() {
                                transition_to_state(animal, AnimalState::Following, current_time, Some(owner_id), "threat eliminated - return to following");
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("🛡️ [PROTECTION ERROR] Tamed {:?} {} failed to attack threat {}: {}", 
                                   animal.species, animal.id, threat_animal.id, e);
                    }
                }
                
                animal.last_attack_time = Some(current_time);
            }
        } else {
            // Move toward the threat
            move_towards_target(ctx, animal, threat_animal.pos_x, threat_animal.pos_y, stats.sprint_speed, dt);
            log::debug!("🛡️ [PROTECTION PURSUIT] Tamed {:?} {} pursuing threat {:?} {} (distance: {:.1}px)", 
                       animal.species, animal.id,
                       threat_animal.species, threat_animal.id,
                       distance_to_threat.sqrt());
        }
    } else if let Some(threat_player) = player_threats.first() {
        // Handle player threats (for future implementation)
        let distance_to_threat = get_distance_squared(
            animal.pos_x, animal.pos_y,
            threat_player.position_x, threat_player.position_y
        );
        
        if distance_to_threat <= stats.attack_range * stats.attack_range {
            // Attack player if in range and we can attack
            if can_attack(animal, current_time, stats) {
                // Set target for main AI loop to handle player attack
                animal.target_player_id = Some(threat_player.identity);
                animal.last_attack_time = Some(current_time);
                log::info!("🛡️ [PROTECTION PLAYER ATTACK] Tamed {:?} {} attacking player threat {}", 
                          animal.species, animal.id, threat_player.identity);
            }
        } else {
            // Move toward the player threat
            move_towards_target(ctx, animal, threat_player.position_x, threat_player.position_y, stats.sprint_speed, dt);
            log::debug!("🛡️ [PROTECTION PLAYER PURSUIT] Tamed {:?} {} pursuing player threat {} (distance: {:.1}px)", 
                       animal.species, animal.id, threat_player.identity, distance_to_threat.sqrt());
        }
    } else {
        // No threats found, return to following the owner
        transition_to_state(animal, AnimalState::Following, current_time, Some(owner_id), "no threats - return to following");
    }
}

/// **COMMON ESCAPE ANGLE CALCULATOR** - Calculate optimal flee direction away from multiple threats
pub fn calculate_escape_angle_from_threats(
    animal_x: f32, 
    animal_y: f32, 
    primary_threat_x: f32, 
    primary_threat_y: f32, 
    secondary_threat_x: f32, 
    secondary_threat_y: f32
) -> f32 {
    // Vector away from primary threat
    let away_from_primary_x = animal_x - primary_threat_x;
    let away_from_primary_y = animal_y - primary_threat_y;
    
    // Vector away from secondary threat
    let away_from_secondary_x = animal_x - secondary_threat_x;
    let away_from_secondary_y = animal_y - secondary_threat_y;
    
    // Combine vectors (weighted more toward escaping primary threat)
    let combined_x = away_from_primary_x * 0.7 + away_from_secondary_x * 0.3;
    let combined_y = away_from_primary_y * 0.7 + away_from_secondary_y * 0.3;
    
    // Calculate angle
    combined_y.atan2(combined_x)
}

/// **COMMON RANGED WEAPON DETECTION** - Check if player has bow/crossbow/pistol equipped
pub fn player_has_ranged_weapon(ctx: &ReducerContext, player_id: Identity) -> bool {
    if let Some(equipment) = ctx.db.active_equipment().player_identity().find(&player_id) {
        if let Some(item_def_id) = equipment.equipped_item_def_id {
            if let Some(item_def) = ctx.db.item_definition().id().find(item_def_id) {
                let has_ranged = item_def.name == "Hunting Bow" || item_def.name == "Crossbow" || item_def.name == "Makarov PM";
                if has_ranged {
                    log::debug!("Player {:?} has ranged weapon: {}", player_id, item_def.name);
                }
                return has_ranged;
            }
        }
    }
    false
}

/// **COMMON FIRE TRAP ESCAPE HANDLER** - Generic escape logic for animals trapped by fire + ranged
pub fn handle_fire_trap_escape(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    player: &Player,
    current_time: Timestamp,
    rng: &mut impl Rng,
) -> bool {
    if is_animal_trapped_by_fire_and_ranged(ctx, animal, player) {
        // Force flee even for animals that normally don't flee
        transition_to_state(animal, AnimalState::Fleeing, current_time, None, "fire trap escape");
        
        // Calculate escape direction away from BOTH fire AND player
        if let Some((fire_x, fire_y)) = find_closest_fire_position(ctx, animal.pos_x, animal.pos_y) {
            let flee_angle = calculate_escape_angle_from_threats(
                animal.pos_x, animal.pos_y, 
                fire_x, fire_y, 
                player.position_x, player.position_y
            );
            
            // Species-specific flee distances
            let flee_distance = match animal.species {
                AnimalSpecies::TundraWolf => 600.0,    // 12+ tiles
                AnimalSpecies::CinderFox => 640.0,     // Proportional to chase range
                AnimalSpecies::CableViper => 500.0,    // Moderate distance
                AnimalSpecies::ArcticWalrus => 200.0,  // Walruses barely flee
                AnimalSpecies::BeachCrab => 250.0,    // Crabs scuttle away quickly
                AnimalSpecies::Tern => 800.0,         // Birds fly far away
                AnimalSpecies::Crow => 700.0,         // Crows fly away
            };
            
            animal.investigation_x = Some(animal.pos_x + flee_distance * flee_angle.cos());
            animal.investigation_y = Some(animal.pos_y + flee_distance * flee_angle.sin());
            
            log::info!("🔥 {:?} {} ESCAPING fire trap! Player {} with ranged weapon detected.", 
                      animal.species, animal.id, player.identity);
            return true; // Fire trap detected and escape initiated
        }
    }
    false // No fire trap detected
}

/// **COMMON UNSTUCK DETECTION** - Detect if animal is stuck and needs direction change
pub fn detect_and_handle_stuck_movement(
    animal: &mut WildAnimal,
    prev_x: f32,
    prev_y: f32,
    movement_threshold: f32,
    rng: &mut impl Rng,
    context: &str,
) -> bool {
    let distance_moved = ((animal.pos_x - prev_x).powi(2) + (animal.pos_y - prev_y).powi(2)).sqrt();
    
    if distance_moved < movement_threshold {
        // Stuck! Pick new random direction
        let new_angle = rng.gen::<f32>() * 2.0 * PI;
        animal.direction_x = new_angle.cos();
        animal.direction_y = new_angle.sin();
        
        log::debug!("{:?} {} stuck during {} - changing direction (moved only {:.1}px)", 
                   animal.species, animal.id, context, distance_moved);
        return true; // Was stuck
    }
    false // Not stuck
}

/// **COMMON CORNERED BEHAVIOR** - Check if animal feels cornered and should attack regardless of normal behavior
pub fn is_animal_cornered(
    animal: &WildAnimal,
    player: &Player,
    cornered_distance: f32,
) -> bool {
    let distance_to_player = get_player_distance(animal, player);
    distance_to_player <= cornered_distance
}

/// **COMMON WATER UNSTUCK LOGIC** - Handle animals getting stuck on water with alternative routing
pub fn handle_water_unstuck(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    target_x: f32,
    target_y: f32,
    prev_x: f32,
    prev_y: f32,
    movement_threshold: f32,
    flee_distance: f32,
    rng: &mut impl Rng,
) -> bool {
    let distance_moved = ((animal.pos_x - prev_x).powi(2) + (animal.pos_y - prev_y).powi(2)).sqrt();
    
    if distance_moved < movement_threshold {
        // Check if target is water or if we're hitting water
        let target_is_water = crate::fishing::is_water_tile(ctx, target_x, target_y);
        let current_hitting_water = crate::fishing::is_water_tile(
            ctx, 
            animal.pos_x + (target_x - animal.pos_x).signum() * 50.0, 
            animal.pos_y + (target_y - animal.pos_y).signum() * 50.0
        );
        
        if target_is_water || current_hitting_water {
            log::warn!("{:?} {} got stuck on water! Choosing new route...", animal.species, animal.id);
            
            // Try multiple random directions to find one that's not water
            let mut attempts = 0;
            let mut found_safe_direction = false;
            
            while attempts < 8 && !found_safe_direction {
                let random_angle = rng.gen::<f32>() * 2.0 * PI;
                let new_target_x = animal.pos_x + random_angle.cos() * flee_distance;
                let new_target_y = animal.pos_y + random_angle.sin() * flee_distance;
                
                // Test direction ahead
                let test_x = animal.pos_x + random_angle.cos() * 100.0;
                let test_y = animal.pos_y + random_angle.sin() * 100.0;
                
                if !crate::fishing::is_water_tile(ctx, test_x, test_y) && 
                   !is_position_in_shelter(ctx, test_x, test_y) {
                    // Found safe direction
                    animal.investigation_x = Some(new_target_x);
                    animal.investigation_y = Some(new_target_y);
                    found_safe_direction = true;
                    log::info!("{:?} {} found safe route at angle {:.1}° - heading to ({:.1}, {:.1})", 
                              animal.species, animal.id, random_angle.to_degrees(), new_target_x, new_target_y);
                }
                attempts += 1;
            }
            
            if !found_safe_direction {
                // Last resort: emergency direction
                let emergency_angle = rng.gen::<f32>() * 2.0 * PI;
                animal.investigation_x = Some(animal.pos_x + emergency_angle.cos() * flee_distance);
                animal.investigation_y = Some(animal.pos_y + emergency_angle.sin() * flee_distance);
                log::warn!("{:?} {} using emergency escape route!", animal.species, animal.id);
            }
            
            return true; // Water unstuck was handled
        }
    }
    false // No water collision detected
}