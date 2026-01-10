use spacetimedb::{ReducerContext, Table, Timestamp};
use spacetimedb::spacetimedb_lib::{ScheduleAt, TimeDuration};
use log;
use std::time::Duration;

// Import necessary functions from other modules
use crate::world_state;
use crate::environment;

// Import table traits
use crate::global_tick::GlobalTickSchedule as GlobalTickScheduleTableTrait;
use crate::player as PlayerTableTrait;

// PERFORMANCE: Increased from 5s to 15s - respawns don't need to be instant
pub(crate) const GLOBAL_TICK_INTERVAL_SECS: u64 = 15;

// --- Global Tick Schedule Table (Reverted to scheduled pattern) ---
#[spacetimedb::table(name = global_tick_schedule, scheduled(process_global_tick))]
#[derive(Clone)]
pub struct GlobalTickSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

// --- Function to Initialize the Global Tick Schedule ---
pub fn init_global_tick_schedule(ctx: &ReducerContext) -> Result<(), String> {
    let schedule_table = ctx.db.global_tick_schedule();
    if schedule_table.iter().count() == 0 {
        log::info!(
            "Starting global tick schedule (every {}s).",
            GLOBAL_TICK_INTERVAL_SECS
        );
        let interval = Duration::from_secs(GLOBAL_TICK_INTERVAL_SECS);
        crate::try_insert_schedule!(
            schedule_table,
            GlobalTickSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(TimeDuration::from(interval)),
            },
            "Global tick"
        );
    } else {
        log::debug!("Global tick schedule already exists.");
    }
    Ok(())
}

// --- Reducer to Process Global Ticks (Scheduled) ---
#[spacetimedb::reducer]
pub fn process_global_tick(ctx: &ReducerContext, _schedule: GlobalTickSchedule) -> Result<(), String> {
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("process_global_tick may only be called by the scheduler.".to_string());
    }

    // PERFORMANCE: Skip expensive processing if no players are online
    // This saves massive CPU when the server is idle
    let online_player_count = ctx.db.player().iter().filter(|p| p.is_online).count();
    if online_player_count == 0 {
        log::trace!("No players online - skipping global tick to save resources.");
        return Ok(());
    }

    let current_time = ctx.timestamp;

    // --- Tick World State ---
    match world_state::tick_world_state(ctx, current_time) {
        Ok(_) => {}
        Err(e) => log::error!("Error ticking world state during global tick: {}", e),
    }

    // --- Check Resource Respawns ---
    match environment::check_resource_respawns(ctx) {
        Ok(_) => {}
        Err(e) => log::error!("Error checking resource respawns during global tick: {}", e),
    }

    Ok(())
} 