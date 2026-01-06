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
use crate::rune_stone::{rune_stone as RuneStoneTableTrait, RUNE_STONE_EFFECT_RADIUS};
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

// --- Constants ---

const TILE_SIZE: f32 = TILE_SIZE_PX as f32;

// Spawn distance bands (in tiles, converted to pixels)
const RING_A_MAX_TILES: f32 = 18.0;  // No-spawn zone: 0-18 tiles
const RING_B_MIN_TILES: f32 = 19.0;  // Primary spawn: 19-34 tiles
const RING_B_MAX_TILES: f32 = 34.0;
const RING_C_MIN_TILES: f32 = 35.0;  // Distant pressure: 35-50 tiles
const RING_C_MAX_TILES: f32 = 50.0;

const RING_A_MAX_PX: f32 = RING_A_MAX_TILES * TILE_SIZE;
const RING_B_MIN_PX: f32 = RING_B_MIN_TILES * TILE_SIZE;
const RING_B_MAX_PX: f32 = RING_B_MAX_TILES * TILE_SIZE;
const RING_C_MIN_PX: f32 = RING_C_MIN_TILES * TILE_SIZE;
const RING_C_MAX_PX: f32 = RING_C_MAX_TILES * TILE_SIZE;

// Population caps (per player area)
const MAX_TOTAL_HOSTILES_NEAR_PLAYER: usize = 6;
const MAX_SHOREBOUND_NEAR_PLAYER: usize = 3;
const MAX_SHARDKIN_NEAR_PLAYER: usize = 4;
const MAX_DROWNED_WATCH_NEAR_PLAYER: usize = 1;

// Spawn timing
const SPAWN_ATTEMPT_INTERVAL_MS: u64 = 25_000; // Try spawning every 25 seconds

// Shardkin group spawn sizes
const SHARDKIN_GROUP_MIN: u32 = 2;
const SHARDKIN_GROUP_MAX: u32 = 4;

// Dawn cleanup
const DAWN_CLEANUP_CHECK_INTERVAL_MS: u64 = 2000; // Check every 2 seconds during dawn cleanup
const DAWN_CLEANUP_DURATION_MS: u64 = 12000; // Clean up over 12 seconds

// Runestone deterrence radius squared
const RUNESTONE_DETERRENCE_RADIUS_SQ: f32 = RUNE_STONE_EFFECT_RADIUS * RUNE_STONE_EFFECT_RADIUS;

// Camping detection constants
const CAMPING_STATIONARY_TIME_MS: i64 = 60_000; // 60 seconds stationary = camping
const CAMPING_MOVEMENT_THRESHOLD_PX: f32 = 500.0; // Must move 500px (~10 tiles) to reset camping timer
                                                   // This allows movement within a medium-sized base (4-5 foundations)

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
    
    // Check if it's night time
    let world_state = match ctx.db.world_state().iter().next() {
        Some(ws) => ws,
        None => return Ok(()), // No world state yet
    };
    
    // Only spawn during night (Dusk or Night phases)
    let is_night = matches!(world_state.time_of_day, TimeOfDay::Dusk | TimeOfDay::Night);
    if !is_night {
        // Check if we need to start dawn cleanup
        if matches!(world_state.time_of_day, TimeOfDay::Dawn) {
            start_dawn_cleanup_if_needed(ctx, current_time);
        }
        return Ok(());
    }
    
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
        
        try_spawn_hostiles_for_player(ctx, player, current_time, is_camping, &mut rng);
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
    
    // Try spawning in priority order: Shorebound > Shardkin > Drowned Watch
    
    // 1. Try Shorebound (stalker)
    if shorebound_count < MAX_SHOREBOUND_NEAR_PLAYER && total_hostiles < MAX_TOTAL_HOSTILES_NEAR_PLAYER {
        if rng.gen::<f32>() < 0.6 { // 60% chance to attempt Shorebound
            if let Some((x, y)) = find_spawn_position(ctx, player_x, player_y, RING_B_MIN_PX, RING_B_MAX_PX, rng) {
                spawn_hostile_npc(ctx, AnimalSpecies::Shorebound, x, y, current_time);
            }
        }
    }
    
    // 2. Try Shardkin (swarmer) - spawns in groups
    if shardkin_count < MAX_SHARDKIN_NEAR_PLAYER && total_hostiles + 1 < MAX_TOTAL_HOSTILES_NEAR_PLAYER {
        if rng.gen::<f32>() < 0.4 { // 40% chance to attempt Shardkin group
            let group_size = rng.gen_range(SHARDKIN_GROUP_MIN..=SHARDKIN_GROUP_MAX) as usize;
            let available_slots = (MAX_SHARDKIN_NEAR_PLAYER - shardkin_count)
                .min(MAX_TOTAL_HOSTILES_NEAR_PLAYER - total_hostiles);
            let actual_spawn = group_size.min(available_slots);
            
            // Find base spawn position
            if let Some((base_x, base_y)) = find_spawn_position(ctx, player_x, player_y, RING_B_MIN_PX, RING_C_MAX_PX, rng) {
                for _ in 0..actual_spawn {
                    // Scatter group members around base position
                    let offset_angle = rng.gen::<f32>() * 2.0 * PI;
                    let offset_dist = rng.gen::<f32>() * 80.0; // Up to 80px scatter
                    let spawn_x = base_x + offset_angle.cos() * offset_dist;
                    let spawn_y = base_y + offset_angle.sin() * offset_dist;
                    
                    if is_valid_spawn_position(ctx, spawn_x, spawn_y, player_x, player_y, RING_B_MIN_PX, RING_C_MAX_PX) {
                        spawn_hostile_npc(ctx, AnimalSpecies::Shardkin, spawn_x, spawn_y, current_time);
                    }
                }
            }
        }
    }
    
    // 3. Try Drowned Watch (brute) - rare, only Ring C
    // ONLY spawns if player is camping (stationary 60+ sec OR inside building)
    if drowned_watch_count < MAX_DROWNED_WATCH_NEAR_PLAYER && total_hostiles + 1 <= MAX_TOTAL_HOSTILES_NEAR_PLAYER {
        // Drowned Watch requires camping condition
        if is_camping && rng.gen::<f32>() < 0.15 { // 15% chance if camping
            if let Some((x, y)) = find_spawn_position(ctx, player_x, player_y, RING_C_MIN_PX, RING_C_MAX_PX, rng) {
                spawn_hostile_npc(ctx, AnimalSpecies::DrownedWatch, x, y, current_time);
                log::info!("👹 [HostileNPC] Drowned Watch spawned - player is camping");
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
        
        // Stop the cleanup schedule by not reinserting
        // (The scheduled table row was already consumed by this reducer call)
        return Ok(());
    }
    
    // Progressive cleanup - remove some hostiles each tick
    let progress = elapsed_ms as f32 / DAWN_CLEANUP_DURATION_MS as f32;
    let mut rng = rand::rngs::StdRng::seed_from_u64(current_time.to_micros_since_unix_epoch() as u64);
    
    let hostiles: Vec<_> = ctx.db.wild_animal().iter()
        .filter(|a| a.is_hostile_npc && a.despawn_at.is_none())
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
    
    // The schedule will auto-reschedule due to the interval
    Ok(())
}

// ============================================================================
// STRUCTURE ATTACK HELPERS
// ============================================================================

use crate::door::{door as DoorTableTrait, Door};
use crate::building::{wall_cell as WallCellTableTrait, WallCell};

/// Find the nearest door or wall that a hostile can attack
/// Returns (structure_id, structure_type, distance_sq)
/// Doors are prioritized over walls
pub fn find_nearest_attackable_structure(
    ctx: &ReducerContext,
    hostile_x: f32,
    hostile_y: f32,
    max_range: f32,
) -> Option<(u64, String, f32)> {
    let max_range_sq = max_range * max_range;
    
    // First, look for doors (preferred target)
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
    
    // Otherwise, look for walls
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
        _ => {
            return Err(format!("Unknown structure type: {}", structure_type));
        }
    }
    
    Ok(false)
}
