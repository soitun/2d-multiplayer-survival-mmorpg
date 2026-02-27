/*!
 * Drone flyover event - periodic eerie drone that crosses the island.
 * Renders as a shadow (like clouds), emits high-distance sound.
 */

use spacetimedb::{ReducerContext, Table, Timestamp, TimeDuration, ScheduleAt, reducer};
use rand::Rng;
use log;

use crate::{WORLD_WIDTH_PX, WORLD_HEIGHT_PX};
use crate::player as PlayerTableTrait;
use crate::sound_events::{emit_sound_at_position_with_distance_and_velocity, SoundType};

// --- Constants ---

/// Drone speed in px/sec - fast for dramatic whoosh (duration computed from distance)
const DRONE_SPEED_PX_PER_SEC: f32 = 1400.0;
/// Debug: how far from player the drone starts (very far for full approach)
const DEBUG_DRONE_START_OFFSET: f32 = 8000.0;
/// Sound emit interval during flight (seconds) - more frequent for smoother approach/recede
const DRONE_SOUND_INTERVAL_SECS: f32 = 1.0;
/// Max hearing distance for drone sound - very high for eerie distant effect
const DRONE_SOUND_MAX_DISTANCE: f32 = 3500.0;
/// Real-time seconds per in-game day (30 min)
const SECS_PER_GAME_DAY: u64 = 1800;

// --- Tables ---

#[spacetimedb::table(accessor = drone_event, public)]
#[derive(Clone, Debug)]
pub struct DroneEvent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub start_x: f32,
    pub start_y: f32,
    pub end_x: f32,
    pub end_y: f32,
    pub start_time: Timestamp,
    pub duration_micros: i64,
    /// Direction X (normalized) for flight path
    pub direction_x: f32,
    pub direction_y: f32,
}

#[spacetimedb::table(accessor = drone_daily_schedule, scheduled(process_drone_daily))]
#[derive(Clone, Debug)]
pub struct DroneDailySchedule {
    #[primary_key]
    #[auto_inc]
    pub schedule_id: u64,
    pub scheduled_at: ScheduleAt,
}

#[spacetimedb::table(accessor = drone_flight_schedule, scheduled(process_drone_flight_tick))]
#[derive(Clone, Debug)]
pub struct DroneFlightSchedule {
    #[primary_key]
    #[auto_inc]
    pub schedule_id: u64,
    pub scheduled_at: ScheduleAt,
    pub drone_id: u64,
    pub tick_count: u32,
}

// --- Helpers ---

fn compute_drone_position(
    start_x: f32, start_y: f32,
    end_x: f32, end_y: f32,
    start_time: Timestamp,
    duration_micros: i64,
    now: Timestamp,
) -> Option<(f32, f32)> {
    let elapsed = now.to_micros_since_unix_epoch().saturating_sub(start_time.to_micros_since_unix_epoch());
    if elapsed < 0 || elapsed >= duration_micros {
        return None;
    }
    let t = (elapsed as f32) / (duration_micros as f32);
    let x = start_x + (end_x - start_x) * t;
    let y = start_y + (end_y - start_y) * t;
    Some((x, y))
}

/// Compute where a line from (sx,sy) in direction (dx,dy) hits the map boundary.
/// Returns (end_x, end_y) at the boundary (or just past it).
fn compute_end_at_boundary(
    start_x: f32, start_y: f32,
    dir_x: f32, dir_y: f32,
    world_width: f32, world_height: f32,
    margin: f32,
) -> (f32, f32) {
    let mut t_min = f32::MAX;
    let eps = 1e-6;

    if dir_x.abs() > eps {
        let t_right = (world_width - margin - start_x) / dir_x;
        if t_right > 0.0 && t_right < t_min { t_min = t_right; }
        let t_left = (margin - start_x) / dir_x;
        if t_left > 0.0 && t_left < t_min { t_min = t_left; }
    }
    if dir_y.abs() > eps {
        let t_bottom = (world_height - margin - start_y) / dir_y;
        if t_bottom > 0.0 && t_bottom < t_min { t_min = t_bottom; }
        let t_top = (margin - start_y) / dir_y;
        if t_top > 0.0 && t_top < t_min { t_min = t_top; }
    }
    if t_min == f32::MAX {
        t_min = (world_width + world_height) / DRONE_SPEED_PX_PER_SEC;
    }
    let end_x = start_x + dir_x * t_min;
    let end_y = start_y + dir_y * t_min;
    (end_x, end_y)
}

/// Spawn a drone event. For natural spawn: random path edge-to-edge. For debug: start far, fly over player to edge.
pub fn spawn_drone_event(
    ctx: &ReducerContext,
    target_player_x: Option<f32>,
    target_player_y: Option<f32>,
) -> Result<(), String> {
    let mut rng = ctx.rng();
    let world_width = WORLD_WIDTH_PX;
    let world_height = WORLD_HEIGHT_PX;
    let margin = 300.0;

    let (start_x, start_y, end_x, end_y) = if let (Some(px), Some(py)) = (target_player_x, target_player_y) {
        // Debug: start very far from player, fly over him, continue to map edge then disappear
        let angle = rng.gen_range(0.0..std::f32::consts::TAU);
        let dir_x = angle.cos();
        let dir_y = angle.sin();
        // Start far behind player (opposite to flight direction)
        let start_x = (px - dir_x * DEBUG_DRONE_START_OFFSET).clamp(margin, world_width - margin);
        let start_y = (py - dir_y * DEBUG_DRONE_START_OFFSET).clamp(margin, world_height - margin);
        let (end_x, end_y) = compute_end_at_boundary(start_x, start_y, dir_x, dir_y, world_width, world_height, margin);
        (start_x, start_y, end_x, end_y)
    } else {
        // Natural: start at one map edge, fly straight to the opposite edge (same as debug conceptually)
        // Options: horizontal, vertical, or diagonal corner-to-corner
        match rng.gen_range(0..3) {
            0 => {
                // Horizontal: left edge -> right edge or vice versa
                let y = rng.gen_range(margin..(world_height - margin));
                let reverse = rng.gen_bool(0.5);
                if reverse {
                    (world_width - margin, y, margin, y)
                } else {
                    (margin, y, world_width - margin, y)
                }
            }
            1 => {
                // Vertical: top edge -> bottom edge or vice versa
                let x = rng.gen_range(margin..(world_width - margin));
                let reverse = rng.gen_bool(0.5);
                if reverse {
                    (x, world_height - margin, x, margin)
                } else {
                    (x, margin, x, world_height - margin)
                }
            }
            _ => {
                // Diagonal: corner to opposite corner (full map traversal)
                let corners = [
                    (margin, margin, world_width - margin, world_height - margin),
                    (world_width - margin, margin, margin, world_height - margin),
                    (margin, world_height - margin, world_width - margin, margin),
                    (world_width - margin, world_height - margin, margin, margin),
                ];
                corners[rng.gen_range(0..4)]
            }
        }
    };

    let dx = end_x - start_x;
    let dy = end_y - start_y;
    let len = (dx * dx + dy * dy).sqrt();
    let (dir_x, dir_y) = if len > 0.001 {
        (dx / len, dy / len)
    } else {
        (1.0, 0.0)
    };

    let distance = len;
    let duration_secs = distance / DRONE_SPEED_PX_PER_SEC;
    let duration_micros = (duration_secs * 1_000_000.0) as i64;
    let start_time = ctx.timestamp;

    let drone = DroneEvent {
        id: 0,
        start_x,
        start_y,
        end_x,
        end_y,
        start_time,
        duration_micros,
        direction_x: dir_x,
        direction_y: dir_y,
    };

    let inserted = ctx.db.drone_event().try_insert(drone).map_err(|e| format!("{:?}", e))?;

    // Schedule first flight tick (sound)
    let first_tick_delay = TimeDuration::from_micros((DRONE_SOUND_INTERVAL_SECS * 500_000.0) as i64); // 0.5s for first tick
    ctx.db.drone_flight_schedule().insert(DroneFlightSchedule {
        schedule_id: 0,
        scheduled_at: ScheduleAt::Time(ctx.timestamp + first_tick_delay),
        drone_id: inserted.id,
        tick_count: 0,
    });

    log::info!("Drone {} spawned from ({:.0},{:.0}) to ({:.0},{:.0})", inserted.id, start_x, start_y, end_x, end_y);
    Ok(())
}

// --- Scheduled Reducers ---

#[reducer]
pub fn process_drone_daily(ctx: &ReducerContext, _schedule: DroneDailySchedule) -> Result<(), String> {
    if ctx.sender() != ctx.identity() {
        return Err("Drone daily schedule can only run from scheduler".into());
    }

    // Skip if no players online
    if ctx.db.player().iter().filter(|p| p.is_online).count() == 0 {
        return Ok(());
    }

    spawn_drone_event(ctx, None, None)?;
    Ok(())
}

#[reducer]
pub fn process_drone_flight_tick(ctx: &ReducerContext, schedule: DroneFlightSchedule) -> Result<(), String> {
    if ctx.sender() != ctx.identity() {
        return Err("Drone flight tick can only run from scheduler".into());
    }

    let drone = match ctx.db.drone_event().id().find(schedule.drone_id) {
        Some(d) => d,
        None => {
            // Drone already removed, clean up schedule
            ctx.db.drone_flight_schedule().schedule_id().delete(schedule.schedule_id);
            return Ok(());
        }
    };

    let now = ctx.timestamp;
    let elapsed_micros = now.to_micros_since_unix_epoch().saturating_sub(drone.start_time.to_micros_since_unix_epoch());

    if elapsed_micros >= drone.duration_micros {
        // Drone finished - remove it and schedule
        ctx.db.drone_event().id().delete(drone.id);
        ctx.db.drone_flight_schedule().schedule_id().delete(schedule.schedule_id);
        log::info!("Drone {} finished and removed", drone.id);
        return Ok(());
    }

    let (pos_x, pos_y) = match compute_drone_position(
        drone.start_x, drone.start_y, drone.end_x, drone.end_y,
        drone.start_time, drone.duration_micros, now,
    ) {
        Some(p) => p,
        None => return Ok(()),
    };

    // Emit sound at current position with velocity for Doppler effect (every 1s = every 2nd tick)
    if schedule.tick_count % 2 == 0 {
        let vel_x = drone.direction_x * DRONE_SPEED_PX_PER_SEC;
        let vel_y = drone.direction_y * DRONE_SPEED_PX_PER_SEC;
        let _ = emit_sound_at_position_with_distance_and_velocity(
            ctx,
            SoundType::DroneFlying,
            pos_x,
            pos_y,
            1.0,
            DRONE_SOUND_MAX_DISTANCE,
            ctx.identity(),
            vel_x,
            vel_y,
        );
    }

    // Reschedule next tick
    let tick_interval = TimeDuration::from_micros(500_000); // 0.5 seconds
    ctx.db.drone_flight_schedule().insert(DroneFlightSchedule {
        schedule_id: 0,
        scheduled_at: ScheduleAt::Time(now + tick_interval),
        drone_id: drone.id,
        tick_count: schedule.tick_count + 1,
    });
    ctx.db.drone_flight_schedule().schedule_id().delete(schedule.schedule_id);

    Ok(())
}

// --- Init ---

pub fn init_drone_system(ctx: &ReducerContext) {
    if ctx.db.drone_daily_schedule().iter().next().is_none() {
        ctx.db.drone_daily_schedule().insert(DroneDailySchedule {
            schedule_id: 0,
            scheduled_at: ScheduleAt::Interval(TimeDuration::from_micros(SECS_PER_GAME_DAY as i64 * 1_000_000)),
        });
        log::info!("Drone daily schedule initialized (every {} real seconds)", SECS_PER_GAME_DAY);
    }
}

// --- Debug Reducer ---

#[reducer]
pub fn debug_simulate_drone(ctx: &ReducerContext) -> Result<(), String> {
    let player = ctx.db.player()
        .identity()
        .find(&ctx.sender())
        .ok_or_else(|| "Player not found".to_string())?;

    if !player.is_online {
        return Err("Must be online to simulate drone".to_string());
    }

    spawn_drone_event(ctx, Some(player.position_x), Some(player.position_y))
}
