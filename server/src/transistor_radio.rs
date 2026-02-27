/*
 * server/src/transistor_radio.rs
 *
 * Purpose: Transistor Radio spawning and respawn system.
 * The Transistor Radio is a unique item found at the Crashed Research Drone monument.
 * Players can pick it up and use it to listen to radio stations (future feature).
 */

use spacetimedb::{ReducerContext, Table, TimeDuration, ScheduleAt};
use log;
use std::time::Duration;

use crate::items::{InventoryItem, ItemDefinition};
use crate::items::{inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait};
use crate::dropped_item::{DroppedItem, dropped_item as DroppedItemTableTrait};
use crate::environment::calculate_chunk_index;
use crate::{MonumentPart, MonumentType, monument_part as MonumentPartTableTrait};

/// Transistor Radio respawn delay in seconds (30 minutes - same as Bone Carving Kit)
pub const TRANSISTOR_RADIO_RESPAWN_DELAY_SECS: u64 = 1800;

/// Table for tracking transistor radio respawn schedule
#[spacetimedb::table(accessor = transistor_radio_respawn, scheduled(respawn_transistor_radio))]
#[derive(Clone)]
pub struct TransistorRadioRespawn {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Get the center position of the Crashed Research Drone monument
pub fn get_crashed_research_drone_center(ctx: &ReducerContext) -> Option<(f32, f32)> {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type == MonumentType::CrashedResearchDrone && part.is_center {
            return Some((part.world_x, part.world_y));
        }
    }
    None
}

/// Spawn a Transistor Radio at the Crashed Research Drone monument
/// Only spawns if no radio currently exists in the world
pub fn spawn_transistor_radio(ctx: &ReducerContext) -> Result<(), String> {
    let dropped_item_table = ctx.db.dropped_item();
    let item_def_table = ctx.db.item_definition();
    
    // Get Transistor Radio definition
    let radio_def = item_def_table.iter()
        .find(|def| def.name == "Transistor Radio")
        .ok_or("Transistor Radio item definition not found.")?;
    
    // Check if a radio already exists as a dropped item
    let radio_exists = dropped_item_table.iter()
        .any(|item| item.item_def_id == radio_def.id);
    
    if radio_exists {
        log::info!("Transistor Radio already exists in the world, skipping spawn.");
        return Ok(());
    }
    
    // Get Crashed Research Drone center position
    let (center_x, center_y) = get_crashed_research_drone_center(ctx)
        .ok_or("Crashed Research Drone monument center not found.")?;
    
    // Spawn at a fixed offset south of the drone center - outside the harvestable (60-200px)
    // and barrel (80-200px) spawn rings, so the radio won't be hidden among other loot.
    // 240px south = clear, prominent spot where nothing else spawns.
    const RADIO_OFFSET_X: f32 = 0.0;
    const RADIO_OFFSET_Y: f32 = 240.0;
    let spawn_x = center_x + RADIO_OFFSET_X;
    let spawn_y = center_y + RADIO_OFFSET_Y;
    
    // Calculate chunk index for the spawn position
    let chunk_index = calculate_chunk_index(spawn_x, spawn_y);
    
    // Create the dropped item
    let dropped_item = DroppedItem {
        id: 0, // Auto-increment
        item_def_id: radio_def.id,
        quantity: 1,
        pos_x: spawn_x,
        pos_y: spawn_y,
        chunk_index,
        created_at: ctx.timestamp,
        item_data: None,
        spawn_x: None,
        spawn_y: None,
    };
    
    dropped_item_table.insert(dropped_item);
    
    log::info!(
        "Transistor Radio spawned at Crashed Research Drone ({:.1}, {:.1})",
        spawn_x, spawn_y
    );
    
    Ok(())
}

/// Check if a Transistor Radio exists in the world (as dropped item or in any player inventory)
pub fn transistor_radio_exists_in_world(ctx: &ReducerContext) -> bool {
    let dropped_item_table = ctx.db.dropped_item();
    let item_def_table = ctx.db.item_definition();
    let inventory_table = ctx.db.inventory_item();
    
    // Get Transistor Radio definition
    let radio_def = match item_def_table.iter().find(|def| def.name == "Transistor Radio") {
        Some(def) => def,
        None => return false,
    };
    
    // Check dropped items
    if dropped_item_table.iter().any(|item| item.item_def_id == radio_def.id) {
        return true;
    }
    
    // Check player inventories/hotbars
    if inventory_table.iter().any(|item| item.item_def_id == radio_def.id) {
        return true;
    }
    
    false
}

/// Scheduled reducer to respawn the Transistor Radio at the Crashed Research Drone
#[spacetimedb::reducer]
pub fn respawn_transistor_radio(ctx: &ReducerContext, _args: TransistorRadioRespawn) -> Result<(), String> {
    // Only allow the scheduler to call this
    if ctx.sender() != ctx.identity() {
        return Err("Transistor Radio respawn can only be triggered by scheduler.".to_string());
    }

    // Spawn the radio at the crashed research drone
    spawn_transistor_radio(ctx)?;

    log::info!("Transistor Radio respawned at Crashed Research Drone");
    Ok(())
}

/// Schedule a transistor radio respawn after the specified delay
pub fn schedule_radio_respawn(ctx: &ReducerContext, delay_secs: u64) {
    let respawn_table = ctx.db.transistor_radio_respawn();
    
    let delay = TimeDuration::from(Duration::from_secs(delay_secs));
    let respawn_time = ctx.timestamp + delay;
    
    respawn_table.insert(TransistorRadioRespawn {
        id: 0, // Auto-increment
        scheduled_at: ScheduleAt::Time(respawn_time),
    });

    log::info!("Scheduled Transistor Radio respawn in {} seconds", delay_secs);
}
