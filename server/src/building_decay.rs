/******************************************************************************
 *                                                                            *
 * Building Decay System                                                      *
 *                                                                            *
 * Handles decay for foundations, walls, and doors. Buildings connected to  *
 * a homestead hearth with sufficient upkeep resources are protected from    *
 * decay. Decay damage is applied periodically to unprotected buildings.     *
 *                                                                            *
 * DECAY MECHANICS:                                               *
 *                                                                            *
 * Decay Rates (per hour):                                                    *
 * - Wood:   20 damage/hour → Foundation decays in ~25 hours (~1 day)         *
 * - Stone:  6 damage/hour  → Foundation decays in ~166 hours (~7 days)       *
 * - Metal:  2 damage/hour  → Foundation decays in ~1000 hours (~42 days)      *
 * - Twig:   No decay (no upkeep cost, so no protection needed)               *
 *                                                                            *
 * Examples:                                                                   *
 * - Small wood base (5 foundations, 10 walls):                               *
 *   • Upkeep: 50 wood/hour (5×10 + 10×5)                                    *
 *   • Decay time if unprotected: ~25 hours                                   *
 *   • Protection cost: 50 wood/hour in hearth                               *
 *                                                                            *
 * - Medium stone base (10 foundations, 20 walls):                            *
 *   • Upkeep: 200 stone/hour (10×10 + 20×5)                                  *
 *   • Decay time if unprotected: ~166 hours (~7 days)                        *
 *   • Protection cost: 200 stone/hour in hearth                              *
 *                                                                            *
 * - Large metal base (20 foundations, 40 walls):                             *
 *   • Upkeep: 220 metal/hour (20×5 + 40×3)                                   *
 *   • Decay time if unprotected: ~1000 hours (~42 days)                       *
 *   • Protection cost: 220 metal/hour in hearth                              *
 *                                                                            *
 * Grace Period:                                                               *
 * - Buildings have 1 hour grace period after placement before decay starts   *
 * - This gives players time to set up hearth and deposit resources           *
 *                                                                            *
 * Protection:                                                                 *
 * - Buildings connected to a hearth foundation are protected                  *
 * - Protection requires hearth to have sufficient upkeep resources           *
 * - Upkeep is consumed every hour from hearth inventory                      *
 * - If resources run out, buildings immediately start decaying                *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{Identity, Timestamp, ReducerContext, Table, log, TimeDuration, ScheduleAt};
use std::time::Duration;
use crate::building::{FoundationCell, WallCell, foundation_cell, wall_cell};
use crate::homestead_hearth::{HomesteadHearth, homestead_hearth, calculate_upkeep_costs, get_hearth_resources, find_hearth_foundation, find_connected_foundations};
use crate::building::FOUNDATION_TILE_SIZE_PX;

// --- Constants ---
use crate::player as PlayerTableTrait;

// PERFORMANCE: Decay processing interval (check every 15 minutes)
// Building decay happens over days - no need for frequent checks
pub const DECAY_PROCESS_INTERVAL_SECONDS: u64 = 900; // 15 minutes

// Decay damage per interval (tier-dependent, applied every 5 minutes)
// These values result in the following decay times for foundations:
// - Wood: 20 damage/hour → 500 HP foundation decays in ~25 hours (~1 day)
// - Stone: 6 damage/hour → 1000 HP foundation decays in ~166 hours (~7 days)
// - Metal: 2 damage/hour → 2000 HP foundation decays in ~1000 hours (~42 days)
pub const DECAY_DAMAGE_WOOD_PER_INTERVAL: f32 = 1.67; // ~20 damage/hour (25 hours for foundation)
pub const DECAY_DAMAGE_STONE_PER_INTERVAL: f32 = 0.5; // ~6 damage/hour (166 hours for foundation)
pub const DECAY_DAMAGE_METAL_PER_INTERVAL: f32 = 0.167; // ~2 damage/hour (1000 hours for foundation)

// Minimum time since placement before decay starts (grace period)
pub const DECAY_GRACE_PERIOD_SECONDS: u64 = 3600; // 1 hour grace period

/// Get decay damage per interval based on building tier
pub fn get_decay_damage_per_interval(tier: u8) -> f32 {
    match tier {
        1 => DECAY_DAMAGE_WOOD_PER_INTERVAL,   // Wood tier
        2 => DECAY_DAMAGE_STONE_PER_INTERVAL,  // Stone tier
        3 => DECAY_DAMAGE_METAL_PER_INTERVAL,  // Metal tier
        _ => 0.0, // Twig tier doesn't decay (no upkeep cost)
    }
}

// --- Decay Schedule Table ---

#[spacetimedb::table(accessor = building_decay_schedule, scheduled(process_building_decay))]
#[derive(Clone)]
pub struct BuildingDecaySchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Initialize the building decay processing schedule
pub fn init_building_decay_schedule(ctx: &ReducerContext) -> Result<(), String> {
    let schedule_table = ctx.db.building_decay_schedule();
    if schedule_table.iter().count() == 0 {
        log::info!(
            "Starting building decay processing schedule (every {}s).",
            DECAY_PROCESS_INTERVAL_SECONDS
        );
        let interval = Duration::from_secs(DECAY_PROCESS_INTERVAL_SECONDS);
        crate::try_insert_schedule!(
            schedule_table,
            BuildingDecaySchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(TimeDuration::from(interval)),
            },
            "Building decay"
        );
    } else {
        log::debug!("Building decay schedule already exists.");
    }
    Ok(())
}

/// Check if a building is protected from decay by a hearth
/// A building is protected if:
/// 1. It's connected to a foundation with a hearth
/// 2. The hearth has sufficient resources to pay upkeep
fn is_building_protected(
    ctx: &ReducerContext,
    foundation: &FoundationCell,
) -> bool {
    let hearths = ctx.db.homestead_hearth();
    
    // Find all hearths and check if any protect this foundation
    for hearth in hearths.iter() {
        if hearth.is_destroyed {
            continue;
        }
        
        // Find the foundation the hearth is on
        let hearth_foundation = match find_hearth_foundation(ctx, &hearth) {
            Some(foundation) => foundation,
            None => continue, // Hearth not on a foundation, skip
        };
        
        // Find all foundations connected to the hearth's foundation
        let connected_foundations = find_connected_foundations(ctx, &hearth_foundation);
        
        // Check if our foundation is in the connected set
        let is_connected = connected_foundations.iter().any(|f| f.id == foundation.id);
        
        if !is_connected {
            continue; // Not connected to this hearth
        }
        
        // Check if hearth has sufficient resources for upkeep
        let costs = calculate_upkeep_costs(ctx, &hearth);
        let (available_wood, available_stone, available_metal) = get_hearth_resources(ctx, &hearth);
        
        let has_sufficient_resources = available_wood >= costs.wood 
            && available_stone >= costs.stone 
            && available_metal >= costs.metal;
        
        if has_sufficient_resources {
            return true; // Protected by this hearth
        }
    }
    
    false // Not protected by any hearth
}

/// Check if a wall is protected from decay
/// A wall is protected if its foundation is protected
fn is_wall_protected(
    ctx: &ReducerContext,
    wall: &WallCell,
) -> bool {
    let foundations = ctx.db.foundation_cell();
    
    // Find the foundation this wall is on
    for foundation in foundations.idx_cell_coords().filter((wall.cell_x, wall.cell_y)) {
        if !foundation.is_destroyed {
            return is_building_protected(ctx, &foundation);
        }
    }
    
    false // No foundation found, not protected
}

/// Apply decay damage to a foundation
fn apply_foundation_decay(
    ctx: &ReducerContext,
    foundation: &mut FoundationCell,
) {
    let decay_damage = get_decay_damage_per_interval(foundation.tier);
    if decay_damage <= 0.0 {
        return; // Twig tier doesn't decay
    }
    
    foundation.health = (foundation.health - decay_damage).max(0.0);
    
    log::info!(
        "[Decay] Applied {:.2} damage to foundation {} (tier {}) at ({}, {}). Health: {:.1}/{:.1}",
        decay_damage,
        foundation.id,
        foundation.tier,
        foundation.cell_x,
        foundation.cell_y,
        foundation.health,
        foundation.max_health
    );
    
    // Check if foundation should be destroyed
    if foundation.health <= 0.0 {
        foundation.health = 0.0;
        foundation.is_destroyed = true;
        foundation.destroyed_at = Some(ctx.timestamp);
        
        log::info!(
            "[Decay] Foundation {} at ({}, {}) destroyed by decay",
            foundation.id,
            foundation.cell_x,
            foundation.cell_y
        );
        
        // Cascading destruction: Destroy all walls on this foundation
        let walls = ctx.db.wall_cell();
        let mut destroyed_wall_count = 0;
        for wall in walls.idx_cell_coords().filter((foundation.cell_x, foundation.cell_y)) {
            if !wall.is_destroyed {
                let mut updated_wall = wall.clone();
                updated_wall.is_destroyed = true;
                updated_wall.destroyed_at = Some(ctx.timestamp);
                walls.id().update(updated_wall);
                destroyed_wall_count += 1;
                
                log::info!(
                    "[Decay] Cascading destruction: Destroyed wall {} on decayed foundation {}",
                    wall.id,
                    foundation.id
                );
            }
        }
        
        if destroyed_wall_count > 0 {
            log::info!(
                "[Decay] Destroyed {} walls on decayed foundation {}",
                destroyed_wall_count,
                foundation.id
            );
        }
    }
}

/// Apply decay damage to a wall
fn apply_wall_decay(
    ctx: &ReducerContext,
    wall: &mut WallCell,
) {
    let decay_damage = get_decay_damage_per_interval(wall.tier);
    if decay_damage <= 0.0 {
        return; // Twig tier doesn't decay
    }
    
    wall.health = (wall.health - decay_damage).max(0.0);
    
    log::info!(
        "[Decay] Applied {:.2} damage to wall {} (tier {}) at ({}, {}). Health: {:.1}/{:.1}",
        decay_damage,
        wall.id,
        wall.tier,
        wall.cell_x,
        wall.cell_y,
        wall.health,
        wall.max_health
    );
    
    // Check if wall should be destroyed
    if wall.health <= 0.0 {
        wall.health = 0.0;
        wall.is_destroyed = true;
        wall.destroyed_at = Some(ctx.timestamp);
        
        log::info!(
            "[Decay] Wall {} at ({}, {}) destroyed by decay",
            wall.id,
            wall.cell_x,
            wall.cell_y
        );
    }
}

/// Scheduled reducer to process building decay
#[spacetimedb::reducer]
pub fn process_building_decay(ctx: &ReducerContext, _schedule: BuildingDecaySchedule) -> Result<(), String> {
    // Security check - only allow scheduler to call this
    if ctx.sender() != ctx.identity() {
        return Err("process_building_decay may only be called by the scheduler.".to_string());
    }

    // PERFORMANCE: Skip decay processing if no players are online
    // Building decay is a background process - no urgency when server is empty
    let online_player_count = ctx.db.player().iter().filter(|p| p.is_online).count();
    if online_player_count == 0 {
        return Ok(());
    }

    let current_time = ctx.timestamp;
    let foundations = ctx.db.foundation_cell();
    let walls = ctx.db.wall_cell();
    
    let grace_period_micros = (DECAY_GRACE_PERIOD_SECONDS as i64) * 1_000_000;
    
    // Process foundation decay
    let mut foundations_to_update = Vec::new();
    for foundation in foundations.iter() {
        if foundation.is_destroyed {
            continue;
        }
        
        // Check grace period
        let time_since_placement = current_time.to_micros_since_unix_epoch()
            .saturating_sub(foundation.placed_at.to_micros_since_unix_epoch());
        
        if time_since_placement < grace_period_micros {
            continue; // Still in grace period
        }
        
        // Check if protected by hearth
        if is_building_protected(ctx, &foundation) {
            continue; // Protected, skip decay
        }
        
        // Apply decay
        let mut foundation_mut = foundation.clone();
        apply_foundation_decay(ctx, &mut foundation_mut);
        foundations_to_update.push(foundation_mut);
    }
    
    // Update foundations
    for foundation in foundations_to_update {
        ctx.db.foundation_cell().id().update(foundation);
    }
    
    // Process wall decay
    let mut walls_to_update = Vec::new();
    for wall in walls.iter() {
        if wall.is_destroyed {
            continue;
        }
        
        // Check grace period
        let time_since_placement = current_time.to_micros_since_unix_epoch()
            .saturating_sub(wall.placed_at.to_micros_since_unix_epoch());
        
        if time_since_placement < grace_period_micros {
            continue; // Still in grace period
        }
        
        // Check if protected by hearth (via foundation)
        if is_wall_protected(ctx, &wall) {
            continue; // Protected, skip decay
        }
        
        // Apply decay
        let mut wall_mut = wall.clone();
        apply_wall_decay(ctx, &mut wall_mut);
        walls_to_update.push(wall_mut);
    }
    
    // Update walls
    for wall in walls_to_update {
        ctx.db.wall_cell().id().update(wall);
    }
    
    Ok(())
}
