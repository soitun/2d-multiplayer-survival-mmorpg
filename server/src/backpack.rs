/******************************************************************************
 *                                                                            *
 * Backpack Auto-Consolidation System                                         *
 *                                                                            *
 * Automatically creates backpack containers (BOX_TYPE_BACKPACK) when         *
 * dropped items cluster together, consolidating them to reduce world clutter.*
 * Uses scheduled reducer for periodic cleanup and immediate trigger on drop. *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Table};
use spacetimedb::spacetimedb_lib::{ScheduleAt, TimeDuration};
use log;
use std::time::Duration;

use crate::wooden_storage_box::{WoodenStorageBox, BOX_TYPE_BACKPACK, NUM_BACKPACK_SLOTS, BACKPACK_INITIAL_HEALTH, BACKPACK_MAX_HEALTH};
use crate::dropped_item::{DroppedItem, dropped_item as DroppedItemTableTrait};
use crate::wooden_storage_box::wooden_storage_box as WoodenStorageBoxTableTrait;
use crate::items::{InventoryItem, inventory_item as InventoryItemTableTrait};
use crate::environment::calculate_chunk_index;
use crate::models::{ItemLocation, ContainerLocationData, ContainerType};
use crate::inventory_management::ItemContainer; // Trait for get_slot_instance_id

// --- Constants ---
const BACKPACK_PROXIMITY_RADIUS: f32 = 128.0;
const BACKPACK_PROXIMITY_RADIUS_SQUARED: f32 = 16384.0;
const MIN_ITEMS_FOR_BACKPACK: usize = 5;
const BACKPACK_SPAWN_SPACING: f32 = 160.0;
const CONSOLIDATION_CHECK_INTERVAL_SECS: u64 = 30;

// --- Schedule Table ---
#[spacetimedb::table(name = backpack_consolidation_schedule, scheduled(check_and_consolidate_all_clusters))]
#[derive(Clone)]
pub struct BackpackConsolidationSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

// --- Initialization ---
/// Initialize the backpack consolidation system
pub fn init_backpack_consolidation_schedule(ctx: &ReducerContext) -> Result<(), String> {
    // Count existing schedules
    let mut count: usize = 0;
    for _ in ctx.db.backpack_consolidation_schedule().iter() {
        count += 1;
    }
    
    if count == 0 {
        log::info!("Starting backpack consolidation schedule (every {}s).", CONSOLIDATION_CHECK_INTERVAL_SECS);
        let interval = Duration::from_secs(CONSOLIDATION_CHECK_INTERVAL_SECS);
        let schedule = BackpackConsolidationSchedule {
            id: 0,
            scheduled_at: ScheduleAt::Interval(TimeDuration::from(interval)),
        };
        ctx.db.backpack_consolidation_schedule().insert(schedule);
        log::info!("✅ Backpack consolidation schedule started");
    } else {
        log::debug!("Backpack consolidation schedule already exists.");
    }
    Ok(())
}

// --- Scheduled Reducer ---
#[spacetimedb::reducer]
pub fn check_and_consolidate_all_clusters(
    ctx: &ReducerContext,
    _args: BackpackConsolidationSchedule
) -> Result<(), String> {
    if ctx.sender != ctx.identity() {
        return Err("Backpack consolidation can only be run by scheduler".to_string());
    }
    
    let clusters = find_dropped_item_clusters(ctx);
    log::info!("[BackpackConsolidation] Found {} item clusters", clusters.len());
    
    for (center_x, center_y, items) in clusters {
        consolidate_dropped_items_near_position(ctx, center_x, center_y, items)?;
    }
    
    Ok(())
}

// --- Core Logic ---
pub fn consolidate_dropped_items_near_position(
    ctx: &ReducerContext,
    center_x: f32,
    center_y: f32,
    mut items: Vec<DroppedItem>,
) -> Result<(), String> {
    if items.len() < MIN_ITEMS_FOR_BACKPACK {
        return Ok(());
    }
    
    // Sort by distance from center
    items.sort_by(|a, b| {
        let dist_a = (a.pos_x - center_x).powi(2) + (a.pos_y - center_y).powi(2);
        let dist_b = (b.pos_x - center_x).powi(2) + (b.pos_y - center_y).powi(2);
        dist_a.partial_cmp(&dist_b).unwrap()
    });
    
    let mut backpack_count = 0;
    let mut current_backpack: Option<WoodenStorageBox> = None;
    let mut current_slot_index = 0u8;
    
    for item in items {
        // Create new backpack if needed
        if current_backpack.is_none() || current_slot_index >= NUM_BACKPACK_SLOTS as u8 {
            let spawn_offset = backpack_count as f32 * BACKPACK_SPAWN_SPACING;
            let backpack_x = center_x + spawn_offset;
            let backpack_y = center_y;
            
            current_backpack = Some(create_backpack_at_position(ctx, backpack_x, backpack_y)?);
            current_slot_index = 0;
            backpack_count += 1;
        }
        
        // Transfer item to backpack
        if let Some(ref mut backpack) = current_backpack {
            transfer_dropped_item_to_backpack(ctx, backpack, current_slot_index, &item)?;
            current_slot_index += 1;
            
            // Delete the dropped item
            ctx.db.dropped_item().id().delete(item.id);
        }
    }
    
    // Save final backpack
    if let Some(backpack) = current_backpack {
        ctx.db.wooden_storage_box().id().update(backpack);
    }
    
    log::info!("[BackpackConsolidation] Created {} backpack(s) at ({}, {})", backpack_count, center_x, center_y);
    Ok(())
}

fn create_backpack_at_position(
    ctx: &ReducerContext,
    pos_x: f32,
    pos_y: f32,
) -> Result<WoodenStorageBox, String> {
    let backpack = WoodenStorageBox {
        id: 0,
        pos_x,
        pos_y,
        chunk_index: calculate_chunk_index(pos_x, pos_y),
        placed_by: ctx.identity(), // System-placed
        box_type: BOX_TYPE_BACKPACK,
        // All 48 slots initialized to None (only first 36 used)
        slot_instance_id_0: None, slot_def_id_0: None,
        slot_instance_id_1: None, slot_def_id_1: None,
        slot_instance_id_2: None, slot_def_id_2: None,
        slot_instance_id_3: None, slot_def_id_3: None,
        slot_instance_id_4: None, slot_def_id_4: None,
        slot_instance_id_5: None, slot_def_id_5: None,
        slot_instance_id_6: None, slot_def_id_6: None,
        slot_instance_id_7: None, slot_def_id_7: None,
        slot_instance_id_8: None, slot_def_id_8: None,
        slot_instance_id_9: None, slot_def_id_9: None,
        slot_instance_id_10: None, slot_def_id_10: None,
        slot_instance_id_11: None, slot_def_id_11: None,
        slot_instance_id_12: None, slot_def_id_12: None,
        slot_instance_id_13: None, slot_def_id_13: None,
        slot_instance_id_14: None, slot_def_id_14: None,
        slot_instance_id_15: None, slot_def_id_15: None,
        slot_instance_id_16: None, slot_def_id_16: None,
        slot_instance_id_17: None, slot_def_id_17: None,
        slot_instance_id_18: None, slot_def_id_18: None,
        slot_instance_id_19: None, slot_def_id_19: None,
        slot_instance_id_20: None, slot_def_id_20: None,
        slot_instance_id_21: None, slot_def_id_21: None,
        slot_instance_id_22: None, slot_def_id_22: None,
        slot_instance_id_23: None, slot_def_id_23: None,
        slot_instance_id_24: None, slot_def_id_24: None,
        slot_instance_id_25: None, slot_def_id_25: None,
        slot_instance_id_26: None, slot_def_id_26: None,
        slot_instance_id_27: None, slot_def_id_27: None,
        slot_instance_id_28: None, slot_def_id_28: None,
        slot_instance_id_29: None, slot_def_id_29: None,
        slot_instance_id_30: None, slot_def_id_30: None,
        slot_instance_id_31: None, slot_def_id_31: None,
        slot_instance_id_32: None, slot_def_id_32: None,
        slot_instance_id_33: None, slot_def_id_33: None,
        slot_instance_id_34: None, slot_def_id_34: None,
        slot_instance_id_35: None, slot_def_id_35: None,
        slot_instance_id_36: None, slot_def_id_36: None,
        slot_instance_id_37: None, slot_def_id_37: None,
        slot_instance_id_38: None, slot_def_id_38: None,
        slot_instance_id_39: None, slot_def_id_39: None,
        slot_instance_id_40: None, slot_def_id_40: None,
        slot_instance_id_41: None, slot_def_id_41: None,
        slot_instance_id_42: None, slot_def_id_42: None,
        slot_instance_id_43: None, slot_def_id_43: None,
        slot_instance_id_44: None, slot_def_id_44: None,
        slot_instance_id_45: None, slot_def_id_45: None,
        slot_instance_id_46: None, slot_def_id_46: None,
        slot_instance_id_47: None, slot_def_id_47: None,
        health: BACKPACK_INITIAL_HEALTH,
        max_health: BACKPACK_MAX_HEALTH,
        is_destroyed: false,
        destroyed_at: None,
        last_hit_time: None,
        last_damaged_by: None,
        // Backpacks are not monument placeables
        is_monument: false,
        active_user_id: None,
        active_user_since: None,
    };
    
    Ok(ctx.db.wooden_storage_box().insert(backpack))
}

fn transfer_dropped_item_to_backpack(
    ctx: &ReducerContext,
    backpack: &mut WoodenStorageBox,
    slot_index: u8,
    dropped_item: &DroppedItem,
) -> Result<(), String> {
    // Create InventoryItem for the backpack slot
    let inv_item = InventoryItem {
        instance_id: 0,
        item_def_id: dropped_item.item_def_id,
        quantity: dropped_item.quantity,
        location: ItemLocation::Container(ContainerLocationData {
            container_type: ContainerType::WoodenStorageBox,
            container_id: backpack.id as u64,
            slot_index,
        }),
        item_data: dropped_item.item_data.clone(),
    };
    
    let inserted = ctx.db.inventory_item().insert(inv_item);
    backpack.set_slot(slot_index, Some(inserted.instance_id), Some(dropped_item.item_def_id));
    
    Ok(())
}

fn find_dropped_item_clusters(ctx: &ReducerContext) -> Vec<(f32, f32, Vec<DroppedItem>)> {
    let mut clusters = Vec::new();
    let mut processed_items = std::collections::HashSet::new();
    
    for item in ctx.db.dropped_item().iter() {
        if processed_items.contains(&item.id) {
            continue;
        }
        
        let mut cluster_items = vec![item.clone()];
        let mut center_x = item.pos_x;
        let mut center_y = item.pos_y;
        
        // Find nearby items
        for other in ctx.db.dropped_item().iter() {
            if other.id == item.id || processed_items.contains(&other.id) {
                continue;
            }
            
            let dx = other.pos_x - center_x;
            let dy = other.pos_y - center_y;
            if dx * dx + dy * dy <= BACKPACK_PROXIMITY_RADIUS_SQUARED {
                cluster_items.push(other.clone());
                // Update centroid
                center_x = cluster_items.iter().map(|i| i.pos_x).sum::<f32>() / cluster_items.len() as f32;
                center_y = cluster_items.iter().map(|i| i.pos_y).sum::<f32>() / cluster_items.len() as f32;
            }
        }
        
        if cluster_items.len() >= MIN_ITEMS_FOR_BACKPACK {
            for ci in &cluster_items {
                processed_items.insert(ci.id);
            }
            clusters.push((center_x, center_y, cluster_items));
        }
    }
    
    clusters
}

// --- Auto-despawn when empty ---
pub fn check_and_despawn_if_empty(ctx: &ReducerContext, backpack_id: u32) -> Result<(), String> {
    let backpack = ctx.db.wooden_storage_box().id().find(backpack_id)
        .ok_or("Backpack not found")?;
    
    if backpack.box_type != BOX_TYPE_BACKPACK {
        return Ok(()); // Not a backpack
    }
    
    // Check if all slots are empty
    let mut is_empty = true;
    for i in 0..NUM_BACKPACK_SLOTS as u8 {
        if backpack.get_slot_instance_id(i).is_some() {
            is_empty = false;
            break;
        }
    }
    
    if is_empty {
        ctx.db.wooden_storage_box().id().delete(backpack_id);
        log::info!("[Backpack] Auto-despawned empty backpack {}", backpack_id);
    }
    
    Ok(())
}

