/******************************************************************************
 *                                                                            *
 * Combat Ladle Heating System                                                *
 *                                                                            *
 * Allows players to "heat" a Combat Ladle in fire sources (campfire,         *
 * furnace, large furnace). After 5 seconds of heating, the ladle becomes    *
 * "hot" (tracked in item_data). Burn on hit and 2x wildlife damage apply    *
 * regardless. Gloves only prevent burn damage to the player (self-burn).    *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Table};
use serde::{Deserialize, Serialize};
use crate::items::{InventoryItem, inventory_item as InventoryItemTableTrait};
use crate::items::item_definition as ItemDefinitionTableTrait;
use crate::inventory_management::ItemContainer;
use crate::cooking::CookingProgress;
use crate::sound_events;
use log;

pub const COMBAT_LADLE_HEAT_TIME_SECS: f32 = 5.0;
pub const HOT_LADLE_DURATION_MICROS: i64 = 30 * 60 * 1_000_000; // 30 minutes in microseconds
const HOT_LADLE_TARGET_KEY: &str = "__hot_combat_ladle__";

/// Item_data JSON for hot combat ladle
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HotCombatLadleData {
    pub is_hot: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heated_at_micros: Option<i64>,
}

/// Returns true if the item is a Combat Ladle
pub fn is_combat_ladle(item_def_name: &str) -> bool {
    item_def_name == "Combat Ladle"
}

/// Returns true if the combat ladle is currently hot (not expired).
/// `current_time_micros` is the current timestamp in microseconds since unix epoch.
pub fn is_combat_ladle_hot_at(item: &InventoryItem, current_time_micros: i64) -> bool {
    item.item_data.as_ref().and_then(|data| {
        serde_json::from_str::<HotCombatLadleData>(data).ok()
    }).map_or(false, |d| {
        if !d.is_hot { return false; }
        match d.heated_at_micros {
            Some(heated_at) => (current_time_micros - heated_at) < HOT_LADLE_DURATION_MICROS,
            None => true, // Legacy data without timestamp — treat as hot
        }
    })
}

/// Convenience: check if combat ladle is hot using a ReducerContext timestamp.
pub fn is_combat_ladle_hot(item: &InventoryItem) -> bool {
    // For backward compat — checks is_hot flag only (no expiration).
    // Server code that needs expiration should use is_combat_ladle_hot_at.
    item.item_data.as_ref().and_then(|data| {
        serde_json::from_str::<HotCombatLadleData>(data).ok()
    }).map_or(false, |d| d.is_hot)
}

/// If the combat ladle's heat has expired, clears is_hot and returns true.
/// Returns false if still hot or not a hot ladle.
pub fn check_and_expire_hot_ladle(ctx: &ReducerContext, item: &InventoryItem) -> bool {
    let data = match item.item_data.as_ref().and_then(|d| serde_json::from_str::<HotCombatLadleData>(d).ok()) {
        Some(d) if d.is_hot => d,
        _ => return false,
    };
    let current_micros = ctx.timestamp.to_micros_since_unix_epoch();
    let expired = match data.heated_at_micros {
        Some(heated_at) => (current_micros - heated_at) >= HOT_LADLE_DURATION_MICROS,
        None => false, // No timestamp — can't expire
    };
    if expired {
        let mut updated_item = item.clone();
        updated_item.item_data = None; // Clear hot state
        ctx.db.inventory_item().instance_id().update(updated_item);
        log::info!("[CombatLadleHeating] Ladle instance {} cooled down (30 min expired)", item.instance_id);
        true
    } else {
        false
    }
}

/// Marks a combat ladle as hot by setting its item_data
pub fn mark_combat_ladle_hot(ctx: &ReducerContext, item_instance_id: u64, heated_at_micros: i64) -> Result<(), String> {
    let inventory_items = ctx.db.inventory_item();
    let mut item = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Combat ladle instance {} not found", item_instance_id))?;

    let data = HotCombatLadleData {
        is_hot: true,
        heated_at_micros: Some(heated_at_micros),
    };
    item.item_data = Some(serde_json::to_string(&data).map_err(|e| e.to_string())?);
    inventory_items.instance_id().update(item);
    log::info!("[CombatLadleHeating] Marked combat ladle instance {} as hot", item_instance_id);
    Ok(())
}

/// Process combat ladle heating in a fire appliance.
/// Uses cooking progress with special target "__hot_combat_ladle__".
/// When progress hits 5 seconds, marks item as hot instead of transforming.
pub fn process_combat_ladle_heating<T: ItemContainer + crate::cooking::CookableAppliance>(
    ctx: &ReducerContext,
    appliance: &mut T,
    time_increment: f32,
    active_fuel_instance_id: Option<u64>,
) -> bool
where
    T: Clone,
{
    let mut appliance_struct_modified = false;
    let item_definition_table = ctx.db.item_definition();
    let mut inventory_items_table = ctx.db.inventory_item();

    for i in 0..appliance.num_slots() as u8 {
        let is_this_slot_active_fuel = if let Some(active_id) = active_fuel_instance_id {
            appliance.get_slot_instance_id(i) == Some(active_id)
        } else {
            false
        };

        if is_this_slot_active_fuel {
            continue;
        }

        if let Some(current_item_instance_id) = appliance.get_slot_instance_id(i) {
            if let Some(current_item_def_id) = appliance.get_slot_def_id(i) {
                if let Some(current_item_def) = item_definition_table.id().find(current_item_def_id) {
                    if !is_combat_ladle(&current_item_def.name) {
                        continue;
                    }

                    let mut slot_progress = appliance.get_slot_cooking_progress(i);

                    let item = match inventory_items_table.instance_id().find(current_item_instance_id) {
                        Some(it) => it,
                        None => continue,
                    };
                    let current_micros = ctx.timestamp.to_micros_since_unix_epoch();
                    if is_combat_ladle_hot_at(&item, current_micros) {
                        // Still hot — no need to reheat
                        if slot_progress.is_some() {
                            appliance.set_slot_cooking_progress(i, None);
                            appliance_struct_modified = true;
                        }
                        continue;
                    }
                    // If it was hot but expired, clear the stale data so it can be re-heated
                    if is_combat_ladle_hot(&item) {
                        let mut updated = item.clone();
                        updated.item_data = None;
                        ctx.db.inventory_item().instance_id().update(updated);
                        log::info!("[CombatLadleHeating] Ladle instance {} expired in appliance, clearing hot state for re-heating", current_item_instance_id);
                    }

                    if let Some(mut progress_data) = slot_progress.take() {
                        if progress_data.target_item_def_name != HOT_LADLE_TARGET_KEY {
                            slot_progress = Some(progress_data);
                            appliance.set_slot_cooking_progress(i, slot_progress);
                            continue;
                        }

                        progress_data.current_cook_time_secs += time_increment;

                        if progress_data.current_cook_time_secs >= COMBAT_LADLE_HEAT_TIME_SECS {
                            if let Err(e) = mark_combat_ladle_hot(
                                ctx,
                                current_item_instance_id,
                                ctx.timestamp.to_micros_since_unix_epoch(),
                            ) {
                                log::error!("[CombatLadleHeating] Failed to mark ladle hot: {}", e);
                            } else {
                                appliance_struct_modified = true;
                                let (pos_x, pos_y) = appliance.get_appliance_world_position();
                                sound_events::emit_done_cooking_sound(ctx, pos_x, pos_y, ctx.identity());
                            }
                            slot_progress = None;
                        } else {
                            slot_progress = Some(progress_data);
                        }
                    } else {
                        slot_progress = Some(CookingProgress {
                            current_cook_time_secs: 0.0,
                            target_cook_time_secs: COMBAT_LADLE_HEAT_TIME_SECS,
                            target_item_def_name: HOT_LADLE_TARGET_KEY.to_string(),
                        });
                    }

                    if appliance.get_slot_cooking_progress(i) != slot_progress {
                        appliance.set_slot_cooking_progress(i, slot_progress);
                        appliance_struct_modified = true;
                    }
                }
            }
        }
    }

    appliance_struct_modified
}
