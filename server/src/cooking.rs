use spacetimedb::{Identity, SpacetimeType, ReducerContext, Timestamp, Table, log};
use crate::models::{ItemLocation, ContainerType, ContainerLocationData}; // May need more specific imports later
use crate::items::{InventoryItem, ItemDefinition, inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait}; // For function signatures
use std::cmp::min;
use crate::dropped_item; // For DROP_OFFSET and create_dropped_item_entity
use crate::sound_events::{self, SoundType}; // For emitting cooking completion sound
use crate::inventory_management::ItemContainer; // For trait inheritance

/// Threshold step size for cooking progress updates sent to clients.
/// Progress is only committed to the appliance struct when it crosses a 5% boundary,
/// dramatically reducing the number of row updates pushed over the network.
const COOKING_PROGRESS_THRESHOLD_STEP: f32 = 0.05; // 5% increments

// CookingProgress struct (moved from campfire.rs)
#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub struct CookingProgress {
    pub current_cook_time_secs: f32,
    pub target_cook_time_secs: f32,
    pub target_item_def_name: String,
}

impl CookingProgress {
    /// Returns the progress fraction (0.0 to 1.0) quantized to the nearest threshold step.
    /// Used to determine if the visible progress has changed enough to warrant a DB update.
    fn quantized_progress(&self) -> u32 {
        if self.target_cook_time_secs <= 0.0 {
            return 0;
        }
        let fraction = self.current_cook_time_secs / self.target_cook_time_secs;
        // Quantize to threshold steps (e.g. 5% = 20 steps from 0 to 1.0)
        (fraction / COOKING_PROGRESS_THRESHOLD_STEP) as u32
    }
}

// Trait for appliances that can cook/transform items
// Extends ItemContainer to inherit slot access methods and avoid duplication
pub trait CookableAppliance: ItemContainer {
    // --- Cooking Progress Access ---
    fn get_slot_cooking_progress(&self, slot_index: u8) -> Option<CookingProgress>;
    fn set_slot_cooking_progress(&mut self, slot_index: u8, progress: Option<CookingProgress>);

    // --- Appliance World Position ---
    fn get_appliance_world_position(&self) -> (f32, f32); // For dropping items
}

/// OPTIMIZED: Fast-path transform that tries to directly increment an existing output stack
/// before falling back to the expensive create-then-place path.
/// This avoids creating a temporary InventoryItem (insert + delete) in the common case
/// where an output stack already exists with space. Reduces 3 DB ops to 1.
///
/// Returns Ok((new_item_def, appliance_struct_modified)) on success.
pub(crate) fn transform_and_place_item_in_appliance<T: CookableAppliance>(
    ctx: &ReducerContext,
    appliance: &mut T,
    slot_index: u8,
    new_item_def_name: &str,
) -> Result<(ItemDefinition, bool), String> {
    let item_defs_table = ctx.db.item_definition();
    let mut inventory_items_table = ctx.db.inventory_item();

    let new_item_def = item_defs_table
        .iter()
        .find(|def| def.name == new_item_def_name)
        .ok_or_else(|| format!("[TransformItem] Target item definition '{}' not found.", new_item_def_name))?;

    let source_item_instance_id = appliance.get_slot_instance_id(slot_index)
        .ok_or_else(|| format!("[TransformItem] No item instance found in appliance slot {} to transform.", slot_index))?;
    
    let mut source_item = inventory_items_table.instance_id().find(source_item_instance_id)
        .ok_or_else(|| format!("[TransformItem] Source item instance {} not found in DB for slot {}.", source_item_instance_id, slot_index))?;

    // Get the source item definition to check for crafting_output_quantity
    let source_item_def = item_defs_table.id().find(source_item.item_def_id)
        .ok_or_else(|| format!("[TransformItem] Source item definition {} not found.", source_item.item_def_id))?;

    // Determine output quantity: use crafting_output_quantity if available, otherwise default to 1
    let output_quantity = source_item_def.crafting_output_quantity.unwrap_or(1);

    if source_item.quantity == 0 {
        log::error!("[TransformItem] Attempted to transform item {} in slot {} with quantity 0.", source_item_instance_id, slot_index);
        return Err(format!("Cannot transform item in slot {} with 0 quantity.", slot_index));
    }

    let appliance_id_for_log = appliance.get_container_id();
    let new_item_def_id = new_item_def.id;

    // --- FAST PATH: Try to directly increment an existing output stack ---
    // This avoids creating a temporary item, trying to merge it, then deleting it.
    // In the common case (e.g. metal frags accumulating), this turns 3 DB ops into 1.
    let mut remaining_to_place = output_quantity;
    let mut fast_path_succeeded = false;
    
    for i in 0..appliance.num_slots() as u8 {
        if remaining_to_place == 0 { break; }
        if appliance.get_slot_def_id(i) == Some(new_item_def_id) {
            if let Some(target_instance_id) = appliance.get_slot_instance_id(i) {
                if let Some(mut target_item) = inventory_items_table.instance_id().find(target_instance_id) {
                    let space = new_item_def.stack_size.saturating_sub(target_item.quantity);
                    if space > 0 {
                        let to_add = std::cmp::min(space, remaining_to_place);
                        target_item.quantity += to_add;
                        inventory_items_table.instance_id().update(target_item);
                        remaining_to_place -= to_add;
                        log::debug!("[TransformItem] Appliance {}: Fast-path stacked {} of {} onto slot {}.", 
                                 appliance_id_for_log, to_add, new_item_def_name, i);
                    }
                }
            }
        }
    }

    if remaining_to_place == 0 {
        fast_path_succeeded = true;
    }

    // Now consume 1 unit from source (after we know placement will work or we'll use slow path)
    source_item.quantity -= 1;
    
    if source_item.quantity == 0 {
        inventory_items_table.instance_id().delete(source_item_instance_id);
        appliance.set_slot(slot_index, None, None); 
        log::debug!("[TransformItem] Consumed last unit of item instance {} from appliance {} slot {}. Slot cleared.", 
                 source_item_instance_id, appliance_id_for_log, slot_index);
    } else {
        inventory_items_table.instance_id().update(source_item.clone());
        log::debug!("[TransformItem] Consumed 1 unit from stack {} in appliance {} slot {}. Remaining qty: {}.", 
                 source_item_instance_id, appliance_id_for_log, slot_index, source_item.quantity);
    }

    if fast_path_succeeded {
        // Fast path worked - no temporary item created, appliance struct NOT modified (only InventoryItem quantities changed)
        return Ok((new_item_def.clone(), true)); // true because source slot may have changed
    }

    // --- SLOW PATH: Create a new item and place it (empty slot or drop) ---
    // Only reached when no existing stack had space
    let new_inventory_item = InventoryItem {
        instance_id: 0, 
        item_def_id: new_item_def_id,
        quantity: remaining_to_place,
        location: ItemLocation::Unknown,
        item_data: None,
    };

    let inserted_item = inventory_items_table.try_insert(new_inventory_item)
        .map_err(|e| format!("[TransformItem] Failed to insert new transformed item '{}': {}", new_item_def_name, e))?;
    log::debug!("[TransformItem] Appliance {}: Slow-path produced {} unit(s) of {} (Instance {}) from slot {}.", 
             appliance_id_for_log, remaining_to_place, new_item_def_name, inserted_item.instance_id, slot_index);

    let new_instance_id = inserted_item.instance_id;
    let mut appliance_modified = true; // Source slot was already modified above

    // Try to place in an empty slot
    let mut placed = false;
    for i in 0..appliance.num_slots() as u8 {
        if appliance.get_slot_instance_id(i).is_none() {
            if let Some(mut item_to_place) = inventory_items_table.instance_id().find(new_instance_id) {
                item_to_place.location = ItemLocation::Container(ContainerLocationData {
                    container_type: appliance.get_container_type(),
                    container_id: appliance.get_container_id(),
                    slot_index: i,
                });
                inventory_items_table.instance_id().update(item_to_place);
                appliance.set_slot(i, Some(new_instance_id), Some(new_item_def_id));
                log::debug!("[TransformItem] Appliance {}: Placed item into empty slot {}.", appliance_id_for_log, i);
                placed = true;
                break;
            }
        }
    }

    if !placed {
        // Drop the item - all slots full
        let (appliance_x, appliance_y) = appliance.get_appliance_world_position();
        let drop_qty = if let Some(item) = inventory_items_table.instance_id().find(new_instance_id) {
            item.quantity
        } else { remaining_to_place };
        
        inventory_items_table.instance_id().delete(new_instance_id);
        dropped_item::create_dropped_item_entity(ctx, new_item_def_id, drop_qty, appliance_x, appliance_y + dropped_item::DROP_OFFSET / 2.0)?;
        log::info!("[TransformItem] Appliance {}: Slots full. Dropped {} unit(s) of {}.", 
                 appliance_id_for_log, drop_qty, new_item_def_name);
    }

    Ok((new_item_def.clone(), appliance_modified))
}

// --- Main Processing Function for Cookable Appliances ---
// OPTIMIZED: Uses threshold-based progress updates to reduce network traffic.
// Instead of updating the appliance row every tick (every 1s), progress is only
// committed when it crosses a quantization boundary (5% of total cook time).
// This reduces network updates by ~20x for a typical cooking operation.
pub fn process_appliance_cooking_tick<T: CookableAppliance>(
    ctx: &ReducerContext,
    appliance: &mut T,
    time_increment: f32,
    active_fuel_instance_id: Option<u64>,
) -> Result<bool, String> {
    let mut appliance_struct_modified = false;
    let mut cooking_completed_this_tick = false;
    let mut burning_completed_this_tick = false;
    let item_definition_table = ctx.db.item_definition();

    for i in 0..appliance.num_slots() as u8 {
        let mut slot_cooking_progress_opt = appliance.get_slot_cooking_progress(i);

        // Check if current slot is the active fuel slot
        let is_this_slot_active_fuel = if let Some(active_id) = active_fuel_instance_id {
            appliance.get_slot_instance_id(i) == Some(active_id)
        } else {
            false
        };

        if is_this_slot_active_fuel {
            if slot_cooking_progress_opt.is_some() {
                appliance.set_slot_cooking_progress(i, None);
                appliance_struct_modified = true;
            }
            continue;
        }

        if let Some(current_item_instance_id) = appliance.get_slot_instance_id(i) {
            if let Some(current_item_def_id) = appliance.get_slot_def_id(i) {
                if let Some(current_item_def) = item_definition_table.id().find(current_item_def_id) {
                    if let Some(mut progress_data) = slot_cooking_progress_opt.take() {
                        let old_quantized = progress_data.quantized_progress();
                        progress_data.current_cook_time_secs += time_increment;

                        if progress_data.current_cook_time_secs >= progress_data.target_cook_time_secs {
                            // Cooking complete - always triggers an update
                            let is_desirable_cooking = !progress_data.target_item_def_name.starts_with("Burnt") 
                                && progress_data.target_item_def_name != "Charcoal";
                            if is_desirable_cooking {
                                cooking_completed_this_tick = true;
                            } else if progress_data.target_item_def_name.starts_with("Burnt") {
                                burning_completed_this_tick = true;
                            }
                            match transform_and_place_item_in_appliance(ctx, appliance, i, &progress_data.target_item_def_name) {
                                Ok((_transformed_item_def, modified)) => {
                                    if modified { appliance_struct_modified = true; }

                                    // Check if source slot still has items that need cooking
                                    if let Some(source_instance_after_transform) = appliance.get_slot_instance_id(i) {
                                        if let Some(source_item_details) = ctx.db.inventory_item().instance_id().find(source_instance_after_transform) {
                                            if source_item_details.quantity > 0 {
                                                if let Some(raw_def) = item_definition_table.id().find(source_item_details.item_def_id) {
                                                    if let (Some(raw_target_name), Some(raw_target_time)) = (&raw_def.cooked_item_def_name, raw_def.cook_time_secs) {
                                                        if raw_target_time > 0.0 {
                                                            slot_cooking_progress_opt = Some(CookingProgress {
                                                                current_cook_time_secs: 0.0,
                                                                target_cook_time_secs: raw_target_time,
                                                                target_item_def_name: raw_target_name.clone(),
                                                            });
                                                        } else { slot_cooking_progress_opt = None; }
                                                    } else { slot_cooking_progress_opt = None; }
                                                } else { slot_cooking_progress_opt = None; }
                                            } else { slot_cooking_progress_opt = None; }
                                        } else { slot_cooking_progress_opt = None; }
                                    } else {
                                        slot_cooking_progress_opt = None;
                                    }
                                }
                                Err(e) => {
                                    log::error!("[ApplianceCooking] Appliance {}: Error transforming item in slot {}: {}.", 
                                             appliance.get_container_id(), i, e);
                                    slot_cooking_progress_opt = None;
                                }
                            }
                        } else {
                            // Cooking in progress - THRESHOLD CHECK:
                            // Only mark as modified if progress crossed a quantization boundary.
                            let new_quantized = progress_data.quantized_progress();
                            if new_quantized != old_quantized {
                                // Crossed a threshold - commit this progress to the appliance struct
                                slot_cooking_progress_opt = Some(progress_data);
                            } else {
                                // No threshold crossed - keep the internal progress updated in memory
                                // but do NOT mark appliance_struct_modified so we skip the DB write.
                                // We still need to store the updated time so it's not lost between ticks.
                                slot_cooking_progress_opt = Some(progress_data);
                                // Skip the dirty-check below by explicitly setting and continuing
                                let prev = appliance.get_slot_cooking_progress(i);
                                // Always write the in-memory progress (cheap) but DON'T flag struct as modified
                                appliance.set_slot_cooking_progress(i, slot_cooking_progress_opt);
                                continue; // Skip the threshold-based dirty check below
                            }
                        }
                    } else {
                        // No current progress, check if item *should* start cooking
                        if let (Some(target_name), Some(target_time)) = (&current_item_def.cooked_item_def_name, current_item_def.cook_time_secs) {
                            if target_time > 0.0 {
                                slot_cooking_progress_opt = Some(CookingProgress {
                                    current_cook_time_secs: 0.0, 
                                    target_cook_time_secs: target_time,
                                    target_item_def_name: target_name.clone(),
                                });
                            }
                        }
                    }
                }
            }
        } else if slot_cooking_progress_opt.is_some() {
            slot_cooking_progress_opt = None;
        }

        // Update appliance's slot cooking progress
        let previous_slot_progress = appliance.get_slot_cooking_progress(i);
        if previous_slot_progress != slot_cooking_progress_opt {
            appliance.set_slot_cooking_progress(i, slot_cooking_progress_opt);
            appliance_struct_modified = true;
        }
    }
    
    if cooking_completed_this_tick {
        let (pos_x, pos_y) = appliance.get_appliance_world_position();
        sound_events::emit_done_cooking_sound(ctx, pos_x, pos_y, ctx.identity());
    }
    
    if burning_completed_this_tick {
        let (pos_x, pos_y) = appliance.get_appliance_world_position();
        sound_events::emit_done_burning_sound(ctx, pos_x, pos_y, ctx.identity());
    }
    
    Ok(appliance_struct_modified)
}

