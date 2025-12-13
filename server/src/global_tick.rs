use spacetimedb::{ReducerContext, Table, Timestamp};
use spacetimedb::spacetimedb_lib::{ScheduleAt, TimeDuration};
use log;
use std::time::Duration;

// Import necessary functions from other modules
use crate::world_state;
use crate::environment;

// Import table trait
use crate::global_tick::GlobalTickSchedule as GlobalTickScheduleTableTrait;

pub(crate) const GLOBAL_TICK_INTERVAL_SECS: u64 = 5; // Check global state every 5 seconds (reduced from 1s for performance)

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

    // log::trace!("Processing global tick via schedule...");
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