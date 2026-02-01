/******************************************************************************
 *                                                                            *
 * Fire Patch System - Handles fire patches created by fire arrows that can  *
 * damage wooden structures, destroy planted seeds (crop sabotage), and burn *
 * players who step on them. Fire patches can spread to nearby wooden        *
 * structures and crop fields unless it's heavily raining (HeavyRain or      *
 * HeavyStorm). They can be extinguished by water patches or naturally       *
 * expire over time. Consistent with campfire rain rules.                    *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{table, reducer, ReducerContext, Identity, Timestamp, ScheduleAt, Table};
use log;

use crate::environment::calculate_chunk_index;
use crate::utils::get_distance_squared;
use crate::wild_animal_npc::wild_animal as WildAnimalTableTrait;
use crate::world_state::world_state as WorldStateTableTrait;

// --- Fire Patch Constants ---
pub const FIRE_PATCH_RADIUS: f32 = 40.0; // Visual radius of fire patch (doubled from 20.0)
pub const FIRE_PATCH_COLLISION_RADIUS: f32 = 30.0; // Collision detection radius for burning players (doubled from 15.0)
pub const FIRE_PATCH_STRUCTURE_DAMAGE_RADIUS: f32 = 50.0; // Radius for damaging structures (doubled from 25.0)
pub const FIRE_PATCH_BASE_DURATION_SECS: u64 = 15; // 15 seconds base duration on ground
pub const FIRE_PATCH_WOOD_DURATION_SECS: u64 = 30; // 30 seconds when burning wooden structures
pub const FIRE_PATCH_CLEANUP_INTERVAL_SECS: u64 = 5; // Check for expired patches every 5 seconds
pub const FIRE_PATCH_DAMAGE_INTERVAL_SECS: f32 = 2.0; // Apply damage every 2 seconds (gives time for white flash to reset)
pub const FIRE_PATCH_PLAYER_BURN_DAMAGE: f32 = 3.0; // Damage per tick to players
pub const FIRE_PATCH_PLAYER_BURN_DURATION: f32 = 5.0; // 5 seconds of burn effect
pub const FIRE_PATCH_STRUCTURE_DAMAGE_PER_TICK: f32 = 2.0; // Damage per tick to structures
pub const FIRE_PATCH_NPC_DAMAGE: f32 = 5.0; // Damage per tick to hostile NPCs
pub const FIRE_PROPAGATION_CHANCE: f32 = 0.10; // 10% chance to spread to nearby wooden structures (reduced from 15% to prevent chain reactions)
pub const FIRE_PATCH_SEED_DAMAGE_RADIUS: f32 = 40.0; // Radius for damaging planted seeds (smaller than structures)
pub const FIRE_PROPAGATION_TO_SEED_CHANCE: f32 = 0.15; // 15% chance to spread to nearby planted seeds (crop fields are dry and flammable)

// --- Fire Patch Table ---
#[table(name = fire_patch, public)]
#[derive(Clone, Debug)]
pub struct FirePatch {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    pub chunk_index: u32,
    pub created_at: Timestamp,
    pub expires_at: Timestamp,
    pub created_by: Identity,
    pub current_intensity: f32, // Visual intensity (1.0 = fully burning, 0.0 = extinguished)
    pub is_on_wooden_structure: bool, // Whether this fire is burning a wooden structure
    pub attached_wall_id: Option<u64>, // If burning a wall
    pub attached_foundation_id: Option<u64>, // If burning a foundation
    pub last_damage_tick: Timestamp, // Last time damage was applied
}

// --- Fire Patch Cleanup Schedule ---
#[table(name = fire_patch_cleanup_schedule, scheduled(cleanup_expired_fire_patches))]
#[derive(Clone, Debug)]
pub struct FirePatchCleanupSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

// --- Fire Patch Damage Processing Schedule (like campfires) ---
#[table(name = fire_patch_damage_schedule, scheduled(process_fire_patch_damage))]
#[derive(Clone, Debug)]
pub struct FirePatchDamageSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

// --- Initialization ---
pub fn init_fire_patch_system(ctx: &ReducerContext) -> Result<(), String> {
    // Check if cleanup schedule already exists
    if ctx.db.fire_patch_cleanup_schedule().iter().next().is_some() {
        log::info!("[FirePatchInit] Cleanup schedule already exists, skipping initialization");
        return Ok(());
    }

    // Schedule periodic cleanup
    let cleanup_interval = spacetimedb::TimeDuration::from_micros(FIRE_PATCH_CLEANUP_INTERVAL_SECS as i64 * 1_000_000);
    
    crate::try_insert_schedule!(
        ctx.db.fire_patch_cleanup_schedule(),
        FirePatchCleanupSchedule {
            id: 0,
            scheduled_at: ScheduleAt::Interval(cleanup_interval),
        },
        "Fire patch cleanup"
    );

    // Schedule periodic damage processing (like campfires)
    let damage_interval = spacetimedb::TimeDuration::from_micros(FIRE_PATCH_DAMAGE_INTERVAL_SECS as i64 * 1_000_000);
    
    crate::try_insert_schedule!(
        ctx.db.fire_patch_damage_schedule(),
        FirePatchDamageSchedule {
            id: 0,
            scheduled_at: ScheduleAt::Interval(damage_interval),
        },
        "Fire patch damage"
    );

    log::info!("[FirePatchInit] Fire patch system initialized with cleanup interval of {} seconds and damage interval of {} seconds", 
        FIRE_PATCH_CLEANUP_INTERVAL_SECS, FIRE_PATCH_DAMAGE_INTERVAL_SECS);
    Ok(())
}

// --- Helper Functions ---

/// Checks if there's already a fire patch at a location
fn has_fire_patch_at_location(ctx: &ReducerContext, x: f32, y: f32) -> bool {
    let radius_sq = FIRE_PATCH_RADIUS * FIRE_PATCH_RADIUS;
    
    ctx.db.fire_patch().iter().any(|patch| {
        let dx = patch.pos_x - x;
        let dy = patch.pos_y - y;
        let dist_sq = dx * dx + dy * dy;
        dist_sq < radius_sq
    })
}

/// Creates a fire patch at the specified location
pub fn create_fire_patch(
    ctx: &ReducerContext,
    pos_x: f32,
    pos_y: f32,
    created_by: Identity,
    is_on_wooden_structure: bool,
    attached_wall_id: Option<u64>,
    attached_foundation_id: Option<u64>,
) -> Result<u64, String> {
    // Check if there's already a fire patch here
    if has_fire_patch_at_location(ctx, pos_x, pos_y) {
        return Err("Fire patch already exists at this location".to_string());
    }

    let chunk_index = calculate_chunk_index(pos_x, pos_y);
    let current_time = ctx.timestamp;
    
    // Determine duration based on what's burning
    let duration_secs = if is_on_wooden_structure {
        FIRE_PATCH_WOOD_DURATION_SECS
    } else {
        FIRE_PATCH_BASE_DURATION_SECS
    };
    
    let expires_at = current_time + spacetimedb::TimeDuration::from_micros(duration_secs as i64 * 1_000_000);

    let fire_patch = FirePatch {
        id: 0,
        pos_x,
        pos_y,
        chunk_index,
        created_at: current_time,
        expires_at,
        created_by,
        current_intensity: 1.0,
        is_on_wooden_structure,
        attached_wall_id,
        attached_foundation_id,
        last_damage_tick: current_time,
    };

    match ctx.db.fire_patch().try_insert(fire_patch) {
        Ok(inserted) => {
            log::info!(
                "[FirePatch] Created fire patch {} at ({:.1}, {:.1}) by player {:?} (on_wood: {}, duration: {}s)",
                inserted.id, pos_x, pos_y, created_by, is_on_wooden_structure, duration_secs
            );
            Ok(inserted.id)
        }
        Err(e) => {
            log::error!("[FirePatch] Failed to create fire patch: {:?}", e);
            Err("Failed to create fire patch".to_string())
        }
    }
}

/// Scheduled reducer to process fire patch damage (exactly like campfires)
#[reducer]
pub fn process_fire_patch_damage(ctx: &ReducerContext, _args: FirePatchDamageSchedule) -> Result<(), String> {
    use crate::player;
    use spacetimedb::Table;
    
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("process_fire_patch_damage can only be called by scheduler".to_string());
    }
    
    // PERFORMANCE: Skip if no fire patches exist
    if ctx.db.fire_patch().iter().next().is_none() {
        return Ok(());
    }
    
    let current_time = ctx.timestamp;
    let radius_sq = FIRE_PATCH_COLLISION_RADIUS * FIRE_PATCH_COLLISION_RADIUS;
    
    // Get all online players
    let online_players: Vec<_> = ctx.db.player().iter()
        .filter(|p| p.is_online && !p.is_dead)
        .collect();
    
    // Check each fire patch
    for mut fire_patch in ctx.db.fire_patch().iter() {
        // Check each online player
        for player in &online_players {
            let dx = fire_patch.pos_x - player.position_x;
            let dy = fire_patch.pos_y - player.position_y;
            let dist_sq = dx * dx + dy * dy;
            
            if dist_sq < radius_sq {
                // Fire patches only damage players with active PvP status
                let player_pvp_active = crate::combat::is_pvp_active_for_player(player, current_time);
                
                // Only damage players if they have PvP enabled
                if player_pvp_active {
                    // Player is in fire patch - apply burn effect (exactly like campfires)
                    match crate::active_effects::apply_burn_effect(
                        ctx,
                        player.identity,
                        FIRE_PATCH_PLAYER_BURN_DAMAGE * (FIRE_PATCH_PLAYER_BURN_DURATION / FIRE_PATCH_DAMAGE_INTERVAL_SECS),
                        FIRE_PATCH_PLAYER_BURN_DURATION,
                        FIRE_PATCH_DAMAGE_INTERVAL_SECS,
                        0, // Environmental source (same as campfires)
                    ) {
                        Ok(_) => {
                            // Update last damage tick
                            fire_patch.last_damage_tick = current_time;
                            ctx.db.fire_patch().id().update(fire_patch.clone());
                            log::info!("[FirePatch] Applied/stacked burn effect for player {:?} from fire patch {}", player.identity, fire_patch.id);
                        }
                        Err(e) => log::error!("[FirePatch] Failed to apply burn effect for player {:?}: {}", player.identity, e),
                    }
                }
            }
        }
        
        // Check each hostile NPC (always damaged by fire)
        for mut animal in ctx.db.wild_animal().iter() {
            if !animal.is_hostile_npc || animal.health <= 0.0 {
                continue;
            }
            
            let dx = fire_patch.pos_x - animal.pos_x;
            let dy = fire_patch.pos_y - animal.pos_y;
            let dist_sq = dx * dx + dy * dy;
            
            if dist_sq < radius_sq {
                // Apply damage directly (hostile NPCs don't have burn effects)
                animal.health = (animal.health - FIRE_PATCH_NPC_DAMAGE).max(0.0);
                ctx.db.wild_animal().id().update(animal.clone());
                
                // Update last damage tick
                fire_patch.last_damage_tick = current_time;
                ctx.db.fire_patch().id().update(fire_patch.clone());
                
                log::info!("[FirePatch] Applied {} damage to hostile NPC {} from fire patch {}", 
                    FIRE_PATCH_NPC_DAMAGE, animal.id, fire_patch.id);
            }
        }
    }
    
    Ok(())
}

/// Applies fire damage to wooden structures near fire patches
/// Fire can spread to nearby wooden structures (unless it's raining)
pub fn apply_fire_damage_to_structures(ctx: &ReducerContext) -> Result<(), String> {
    use crate::building::{wall_cell, foundation_cell, FOUNDATION_TILE_SIZE_PX};
    use crate::world_state::WeatherType;
    use rand::{Rng, SeedableRng};
    
    let current_time = ctx.timestamp;
    let mut rng = rand::rngs::StdRng::seed_from_u64(current_time.to_micros_since_unix_epoch() as u64);
    
    for mut fire_patch in ctx.db.fire_patch().iter() {
        // Check if enough time has passed since last damage tick
        let time_since_last_tick = current_time.to_micros_since_unix_epoch() 
            - fire_patch.last_damage_tick.to_micros_since_unix_epoch();
        let tick_interval_micros = (FIRE_PATCH_DAMAGE_INTERVAL_SECS * 1_000_000.0) as i64;
        
        if time_since_last_tick < tick_interval_micros {
            continue; // Not time for next damage tick yet
        }
        
        // Update last damage tick
        fire_patch.last_damage_tick = current_time;
        ctx.db.fire_patch().id().update(fire_patch.clone());
        
        // Check if it's raining HEAVILY at this fire patch's location (affects spread, not damage)
        // Consistent with campfires: only HeavyRain and HeavyStorm suppress fire spread
        // Light and Moderate rain don't affect fire spread
        let chunk_weather = crate::world_state::get_weather_for_position(ctx, fire_patch.pos_x, fire_patch.pos_y);
        let is_heavy_rain = matches!(
            chunk_weather.current_weather,
            WeatherType::HeavyRain | WeatherType::HeavyStorm
        );
        
        let radius_sq = FIRE_PATCH_STRUCTURE_DAMAGE_RADIUS * FIRE_PATCH_STRUCTURE_DAMAGE_RADIUS;
        
        // Check walls - ONLY Twig (0) and Wood (1) tiers can be damaged by fire
        // Stone (2) and Metal (3) are fire-resistant
        for mut wall in ctx.db.wall_cell().iter() {
            if wall.is_destroyed {
                continue;
            }
            
            // Skip fire-resistant tiers (Stone = 2, Metal = 3)
            if wall.tier >= 2 {
                continue; // Stone and Metal walls don't burn
            }
            
            // Calculate wall center position
            let wall_world_x = (wall.cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
            let wall_world_y = (wall.cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
            
            let dx = wall_world_x - fire_patch.pos_x;
            let dy = wall_world_y - fire_patch.pos_y;
            let dist_sq = dx * dx + dy * dy;
            
            if dist_sq < radius_sq {
                // Apply fire damage to wall (Twig/Wood only)
                wall.health = (wall.health - FIRE_PATCH_STRUCTURE_DAMAGE_PER_TICK).max(0.0);
                wall.last_hit_time = Some(current_time);
                
                let tier_name = if wall.tier == 0 { "Twig" } else { "Wood" };
                log::info!(
                    "[FirePatch] Fire patch {} damaged {} wall {} for {:.1} damage (health: {:.1})",
                    fire_patch.id, tier_name, wall.id, FIRE_PATCH_STRUCTURE_DAMAGE_PER_TICK, wall.health
                );
                
                if wall.health <= 0.0 {
                    wall.is_destroyed = true;
                    wall.destroyed_at = Some(current_time);
                    log::info!("[FirePatch] {} wall {} destroyed by fire", tier_name, wall.id);
                }
                
                let wall_id = wall.id; // Save ID before moving wall
                ctx.db.wall_cell().id().update(wall);
                
                // Chance to propagate fire to adjacent wooden structures (only if not heavy rain)
                if !is_heavy_rain && rng.gen::<f32>() < FIRE_PROPAGATION_CHANCE {
                    // Try to create a new fire patch near this wall
                    let offset_x = rng.gen_range(-30.0..30.0);
                    let offset_y = rng.gen_range(-30.0..30.0);
                    let _ = create_fire_patch(
                        ctx,
                        wall_world_x + offset_x,
                        wall_world_y + offset_y,
                        fire_patch.created_by,
                        true,
                        Some(wall_id),
                        None,
                    );
                }
            }
        }
        
        // Check foundations - ONLY Twig (0) and Wood (1) tiers can be damaged by fire
        // Stone (2) and Metal (3) are fire-resistant
        for mut foundation in ctx.db.foundation_cell().iter() {
            if foundation.is_destroyed {
                continue;
            }
            
            // Skip fire-resistant tiers (Stone = 2, Metal = 3)
            if foundation.tier >= 2 {
                continue; // Stone and Metal foundations don't burn
            }
            
            // Calculate foundation center position
            let foundation_world_x = (foundation.cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
            let foundation_world_y = (foundation.cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32) + (FOUNDATION_TILE_SIZE_PX as f32 / 2.0);
            
            let dx = foundation_world_x - fire_patch.pos_x;
            let dy = foundation_world_y - fire_patch.pos_y;
            let dist_sq = dx * dx + dy * dy;
            
            if dist_sq < radius_sq {
                // Apply fire damage to foundation (Twig/Wood only)
                foundation.health = (foundation.health - FIRE_PATCH_STRUCTURE_DAMAGE_PER_TICK).max(0.0);
                foundation.last_hit_time = Some(current_time);
                
                let tier_name = if foundation.tier == 0 { "Twig" } else { "Wood" };
                log::info!(
                    "[FirePatch] Fire patch {} damaged {} foundation {} for {:.1} damage (health: {:.1})",
                    fire_patch.id, tier_name, foundation.id, FIRE_PATCH_STRUCTURE_DAMAGE_PER_TICK, foundation.health
                );
                
                if foundation.health <= 0.0 {
                    foundation.is_destroyed = true;
                    foundation.destroyed_at = Some(current_time);
                    log::info!("[FirePatch] {} foundation {} destroyed by fire", tier_name, foundation.id);
                }
                
                let foundation_id = foundation.id; // Save ID before moving foundation
                ctx.db.foundation_cell().id().update(foundation);
                
                // Chance to propagate fire (only to other wooden structures, only if not heavy rain)
                if !is_heavy_rain && rng.gen::<f32>() < FIRE_PROPAGATION_CHANCE {
                    let offset_x = rng.gen_range(-30.0..30.0);
                    let offset_y = rng.gen_range(-30.0..30.0);
                    let _ = create_fire_patch(
                        ctx,
                        foundation_world_x + offset_x,
                        foundation_world_y + offset_y,
                        fire_patch.created_by,
                        true,
                        None,
                        Some(foundation_id),
                    );
                }
            }
        }
    }
    
    Ok(())
}

/// Applies fire damage to planted seeds near fire patches (destroys crops)
/// Fire can spread from burned seeds to nearby seeds (crop field fires)
/// Fire does NOT spread in heavy rain - consistent with campfire rules
pub fn apply_fire_damage_to_planted_seeds(ctx: &ReducerContext) -> Result<(), String> {
    use crate::planted_seeds::planted_seed as PlantedSeedTableTrait;
    use crate::world_state::WeatherType;
    use rand::{Rng, SeedableRng};
    
    let current_time = ctx.timestamp;
    let mut rng = rand::rngs::StdRng::seed_from_u64(current_time.to_micros_since_unix_epoch() as u64);
    
    let radius_sq = FIRE_PATCH_SEED_DAMAGE_RADIUS * FIRE_PATCH_SEED_DAMAGE_RADIUS;
    let mut seeds_to_destroy: Vec<(u64, f32, f32, spacetimedb::Identity, bool)> = Vec::new(); // Added: is_heavy_rain flag
    
    // Check each fire patch against planted seeds
    for fire_patch in ctx.db.fire_patch().iter() {
        // Check if it's raining HEAVILY at this fire patch's location (affects spread, not damage)
        // Consistent with campfires: only HeavyRain and HeavyStorm suppress fire spread
        // Light and Moderate rain don't affect fire spread
        let chunk_weather = crate::world_state::get_weather_for_position(ctx, fire_patch.pos_x, fire_patch.pos_y);
        let is_heavy_rain = matches!(
            chunk_weather.current_weather,
            WeatherType::HeavyRain | WeatherType::HeavyStorm
        );
        
        // Find planted seeds within the fire patch radius
        for seed in ctx.db.planted_seed().iter() {
            let dx = seed.pos_x - fire_patch.pos_x;
            let dy = seed.pos_y - fire_patch.pos_y;
            let dist_sq = dx * dx + dy * dy;
            
            if dist_sq < radius_sq {
                // This seed is in the fire - mark for destruction
                // Store position for potential fire spread and rain status
                seeds_to_destroy.push((seed.id, seed.pos_x, seed.pos_y, fire_patch.created_by, is_heavy_rain));
            }
        }
    }
    
    // Destroy the seeds and potentially spread fire (only if not heavy rain)
    for (seed_id, seed_x, seed_y, fire_creator, is_heavy_rain) in seeds_to_destroy {
        // Get the seed info before deleting
        if let Some(seed) = ctx.db.planted_seed().id().find(seed_id) {
            log::info!(
                "[FirePatch] Fire destroyed planted seed {} ({}) at ({:.1}, {:.1}) - growth was {:.1}%{}",
                seed_id, seed.seed_type, seed_x, seed_y, seed.growth_progress * 100.0,
                if is_heavy_rain { " (heavy rain prevented spread)" } else { "" }
            );
            
            // Delete the seed
            ctx.db.planted_seed().id().delete(seed_id);
            
            // Chance to spread fire to nearby seeds (crop field fire spread)
            // Fire does NOT spread in heavy rain - consistent with campfire rules
            if !is_heavy_rain && rng.gen::<f32>() < FIRE_PROPAGATION_TO_SEED_CHANCE {
                // Try to create a new fire patch near the burned seed
                let offset_x = rng.gen_range(-50.0..50.0);
                let offset_y = rng.gen_range(-50.0..50.0);
                let _ = create_fire_patch(
                    ctx,
                    seed_x + offset_x,
                    seed_y + offset_y,
                    fire_creator,
                    false, // Not on wooden structure
                    None,
                    None,
                );
            }
        }
    }
    
    Ok(())
}

/// Checks if water patches can extinguish fire patches
pub fn check_water_extinguishes_fire(ctx: &ReducerContext) -> Result<(), String> {
    use crate::water_patch::water_patch as WaterPatchTableTrait;
    
    let mut fire_patches_to_remove: Vec<u64> = Vec::new();
    
    for fire_patch in ctx.db.fire_patch().iter() {
        // Check if any water patch overlaps with this fire patch
        for water_patch in ctx.db.water_patch().iter() {
            let dx = fire_patch.pos_x - water_patch.pos_x;
            let dy = fire_patch.pos_y - water_patch.pos_y;
            let dist_sq = dx * dx + dy * dy;
            
            // If water and fire patches overlap, extinguish the fire
            let overlap_radius = FIRE_PATCH_RADIUS + crate::water_patch::WATER_PATCH_RADIUS;
            if dist_sq < (overlap_radius * overlap_radius) {
                log::info!(
                    "[FirePatch] Water patch {} extinguished fire patch {} at ({:.1}, {:.1})",
                    water_patch.id, fire_patch.id, fire_patch.pos_x, fire_patch.pos_y
                );
                fire_patches_to_remove.push(fire_patch.id);
                break;
            }
        }
    }
    
    // Remove extinguished fire patches
    for fire_id in fire_patches_to_remove {
        ctx.db.fire_patch().id().delete(&fire_id);
    }
    
    Ok(())
}

/// Scheduled reducer to clean up expired fire patches
#[reducer]
pub fn cleanup_expired_fire_patches(ctx: &ReducerContext, _args: FirePatchCleanupSchedule) -> Result<(), String> {
    // Security check
    if ctx.sender != ctx.identity() {
        return Err("Only the module can run scheduled cleanup".to_string());
    }
    
    // PERFORMANCE: Skip if no fire patches exist
    if ctx.db.fire_patch().iter().next().is_none() {
        return Ok(());
    }
    
    let current_time = ctx.timestamp;
    let mut expired_patches: Vec<u64> = Vec::new();
    
    // Find expired patches
    for fire_patch in ctx.db.fire_patch().iter() {
        if current_time >= fire_patch.expires_at {
            expired_patches.push(fire_patch.id);
        }
    }
    
    // Remove expired patches
    for patch_id in &expired_patches {
        ctx.db.fire_patch().id().delete(patch_id);
    }
    
    if !expired_patches.is_empty() {
        log::info!("[FirePatch] Cleaned up {} expired fire patches", expired_patches.len());
    }
    
    // Apply fire damage to structures
    apply_fire_damage_to_structures(ctx)?;
    
    // Apply fire damage to planted seeds (crop sabotage)
    apply_fire_damage_to_planted_seeds(ctx)?;
    
    // Check if water extinguishes fire
    check_water_extinguishes_fire(ctx)?;
    
    Ok(())
}

