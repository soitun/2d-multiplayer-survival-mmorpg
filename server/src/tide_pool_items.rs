//! Tide pool washed-up item respawn system.
//!
//! Coral Fragments, Plastic Water Jug, and Vitamin Drink spawn at tide pools and persist
//! until picked up. When picked up, respawn is scheduled at a random tide pool.

use spacetimedb::{ReducerContext, Table};
use spacetimedb::spacetimedb_lib::{ScheduleAt, TimeDuration};
use std::time::Duration;
use log;
use rand::Rng;

use crate::items::item_definition as ItemDefinitionTableTrait;
use crate::tide_pool as TidePoolTableTrait;

/// Respawn delay in seconds (15 minutes - tide pool items wash up periodically)
pub const TIDE_POOL_ITEM_RESPAWN_DELAY_SECS: u64 = 900;

/// Tide pool washed-up item names (beachcombing loot)
const TIDE_POOL_WASHED_UP_ITEMS: &[&str] = &[
    "Coral Fragments",
    "Sea Glass",
    "Shell",
    "Shell Fragment",
    "Aleut Charm",
    "Rusty Hook",
    "Reed Water Bottle",
    "Old Boot",
];

/// Returns true if the item is a tide pool washed-up item (for respawn scheduling)
pub fn is_tide_pool_washed_up_item(item_name: &str) -> bool {
    TIDE_POOL_WASHED_UP_ITEMS.contains(&item_name)
}

/// Table for tracking tide pool item respawn schedule
#[spacetimedb::table(accessor = tide_pool_item_respawn, scheduled(respawn_tide_pool_item))]
#[derive(Clone)]
pub struct TidePoolItemRespawn {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub item_def_id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Scheduled reducer to respawn a tide pool item at a random tide pool
#[spacetimedb::reducer]
pub fn respawn_tide_pool_item(ctx: &ReducerContext, args: TidePoolItemRespawn) -> Result<(), String> {
    if ctx.sender() != ctx.identity() {
        return Err("respawn_tide_pool_item may only be called by the scheduler.".into());
    }

    let item_defs = ctx.db.item_definition();
    let item_def = item_defs.id().find(&args.item_def_id)
        .ok_or_else(|| format!("Item def {} not found for tide pool respawn", args.item_def_id))?;

    let pool_data: Vec<(f32, f32, f32)> = ctx.db.tide_pool()
        .iter()
        .map(|t| (t.world_x, t.world_y, t.radius_px))
        .collect();

    if pool_data.is_empty() {
        log::warn!("[TidePoolRespawn] No tide pools found, cannot respawn {}", item_def.name);
        return Ok(());
    }

    // Pick random tide pool
    let pool_idx = ctx.rng().gen_range(0..pool_data.len());
    let (pool_x, pool_y, radius_px) = pool_data[pool_idx];

    // Quantity based on item type (match spawn_tide_pool_resources)
    let (min_qty, max_qty) = match item_def.name.as_str() {
        "Coral Fragments" => (1, 3),
        "Sea Glass" => (1, 2),
        "Shell" => (1, 1),
        "Shell Fragment" => (1, 2),
        "Aleut Charm" => (1, 1),
        "Rusty Hook" => (1, 2),
        "Reed Water Bottle" => (1, 1),
        "Old Boot" => (1, 1),
        _ => (1, 1),
    };

    let quantity = ctx.rng().gen_range(min_qty..=max_qty);

    // Try to find valid beach position (up to 10 attempts)
    for _ in 0..10 {
        let angle = ctx.rng().gen::<f32>() * std::f32::consts::PI * 2.0;
        let distance = ctx.rng().gen_range(30.0..radius_px * 0.9);
        let spawn_x = pool_x + angle.cos() * distance;
        let spawn_y = pool_y + angle.sin() * distance;

        if !crate::environment::is_position_on_beach_tile(ctx, spawn_x, spawn_y) {
            continue;
        }

        if let Err(e) = crate::dropped_item::create_dropped_item_entity(ctx, args.item_def_id, quantity, spawn_x, spawn_y) {
            log::warn!("[TidePoolRespawn] Failed to spawn {} at ({:.1}, {:.1}): {}", item_def.name, spawn_x, spawn_y, e);
        } else {
            log::info!("[TidePoolRespawn] Respawned {} (qty {}) at tide pool ({:.1}, {:.1})", item_def.name, quantity, spawn_x, spawn_y);
        }
        return Ok(());
    }

    log::warn!("[TidePoolRespawn] Could not find valid beach position for {} at tide pool", item_def.name);
    Ok(())
}

/// Schedule a tide pool item respawn after the specified delay
pub fn schedule_tide_pool_item_respawn(ctx: &ReducerContext, item_def_id: u64, delay_secs: u64) {
    let respawn_table = ctx.db.tide_pool_item_respawn();
    let delay = TimeDuration::from(Duration::from_secs(delay_secs));
    let respawn_time = ctx.timestamp + delay;

    respawn_table.insert(TidePoolItemRespawn {
        id: 0,
        item_def_id,
        scheduled_at: ScheduleAt::Time(respawn_time),
    });

    if let Some(def) = ctx.db.item_definition().id().find(&item_def_id) {
        log::info!("[TidePoolRespawn] Scheduled {} respawn in {} seconds", def.name, delay_secs);
    }
}
