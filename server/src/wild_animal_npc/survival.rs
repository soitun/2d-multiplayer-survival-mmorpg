/******************************************************************************
 *                                                                            *
 * Animal Survival System - Hunger and Thirst Management                     *
 *                                                                            *
 * Handles animal hunger and thirst mechanics, including seeking food/water, *
 * consuming resources, and maintaining survival meters.                     *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Timestamp, Table};
use log;

use crate::wild_animal_npc::core::{
    WildAnimal, AnimalState, transition_to_state,
    ANIMAL_MAX_HUNGER, ANIMAL_MAX_THIRST,
    ANIMAL_HUNGER_DECAY_PER_SECOND, ANIMAL_THIRST_DECAY_PER_SECOND,
    ANIMAL_HUNGER_SEEK_THRESHOLD, ANIMAL_THIRST_SEEK_THRESHOLD,
    ANIMAL_RESOURCE_DETECTION_RADIUS, ANIMAL_RESOURCE_DETECTION_RADIUS_SQUARED,
    ANIMAL_DRINKING_DURATION_MS, ANIMAL_EATING_DURATION_MS,
    ANIMAL_THIRST_RESTORE_AMOUNT, ANIMAL_HUNGER_RESTORE_AMOUNT,
};
use crate::utils::get_distance_squared;
use crate::fishing::is_water_tile;
use crate::harvestable_resource::harvestable_resource as HarvestableResourceTableTrait;
use crate::environment::calculate_chunk_index;

/// Main survival processing function - called every AI tick
pub fn process_survival_needs(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    current_time: Timestamp,
) -> Result<(), String> {
    // ⚠️ DISABLED: Hunger/thirst system temporarily disabled to reduce server lag
    // Animals will no longer seek food/water or decay their survival meters
    return Ok(());
    
    // Don't process survival for tamed animals (they're fed by their owners)
    if animal.tamed_by.is_some() {
        return Ok(());
    }
    
    // Calculate time delta for hunger/thirst decay
    let time_delta_seconds = 0.125; // AI tick interval (8 times per second)
    
    // Decay hunger and thirst over time
    animal.hunger = (animal.hunger - ANIMAL_HUNGER_DECAY_PER_SECOND * time_delta_seconds).max(0.0);
    animal.thirst = (animal.thirst - ANIMAL_THIRST_DECAY_PER_SECOND * time_delta_seconds).max(0.0);
    
    // Handle current survival state
    match animal.state {
        AnimalState::Eating => {
            handle_eating_state(ctx, animal, current_time)?;
        },
        AnimalState::Drinking => {
            handle_drinking_state(ctx, animal, current_time)?;
        },
        AnimalState::SeekingFood => {
            handle_seeking_food_state(ctx, animal, current_time)?;
        },
        AnimalState::SeekingWater => {
            handle_seeking_water_state(ctx, animal, current_time)?;
        },
        _ => {
            // OPTIMIZATION: Only search for resources when actually needed (below threshold)
            // This prevents unnecessary searches every AI tick
            
            // Thirst takes priority over hunger (more urgent)
            if animal.thirst < ANIMAL_THIRST_SEEK_THRESHOLD {
                // OPTIMIZATION: Only search if we don't already have a target
                // This prevents re-searching every tick while seeking
                if animal.target_water_x.is_none() {
                    if let Some((water_x, water_y)) = find_nearest_water_source(ctx, animal) {
                        animal.target_water_x = Some(water_x);
                        animal.target_water_y = Some(water_y);
                        transition_to_state(animal, AnimalState::SeekingWater, current_time, None, "thirsty - seeking water");
                        log::info!("{:?} {} is thirsty ({:.1}%) - seeking water at ({:.1}, {:.1})", 
                                  animal.species, animal.id, animal.thirst, water_x, water_y);
                    } else {
                        // No water found - animal will keep patrolling and retry next time thirst drops
                        log::debug!("{:?} {} is thirsty but no water found within {}px", 
                                   animal.species, animal.id, 300.0);
                    }
                }
            } else if animal.hunger < ANIMAL_HUNGER_SEEK_THRESHOLD {
                // OPTIMIZATION: Only search if we don't already have a target
                if animal.target_resource_id.is_none() {
                    if let Some(resource_id) = find_nearest_harvestable_resource(ctx, animal) {
                        animal.target_resource_id = Some(resource_id);
                        transition_to_state(animal, AnimalState::SeekingFood, current_time, None, "hungry - seeking food");
                        log::info!("{:?} {} is hungry ({:.1}%) - seeking food (resource {})", 
                                  animal.species, animal.id, animal.hunger, resource_id);
                    } else {
                        // No food found - animal will keep patrolling and retry as hunger drops further
                        log::debug!("{:?} {} is hungry but no food found within {}px", 
                                   animal.species, animal.id, 300.0);
                    }
                }
            }
        }
    }
    
    Ok(())
}

/// Handle eating state - consume harvestable resource
fn handle_eating_state(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    current_time: Timestamp,
) -> Result<(), String> {
    // Check if eating duration has elapsed
    if let Some(start_time) = animal.survival_action_start_time {
        let elapsed_ms = (current_time.to_micros_since_unix_epoch() - start_time.to_micros_since_unix_epoch()) / 1000;
        
        if elapsed_ms >= ANIMAL_EATING_DURATION_MS {
            // Finished eating - restore hunger
            animal.hunger = (animal.hunger + ANIMAL_HUNGER_RESTORE_AMOUNT).min(ANIMAL_MAX_HUNGER);
            
            // Consume the harvestable resource
            if let Some(resource_id) = animal.target_resource_id {
                if let Some(resource) = ctx.db.harvestable_resource().id().find(&resource_id) {
                    // Delete the resource (animal ate it)
                    ctx.db.harvestable_resource().id().delete(&resource_id);
                    log::info!("{:?} {} finished eating {:?} - hunger restored to {:.1}%", 
                              animal.species, animal.id, resource.plant_type, animal.hunger);
                } else {
                    log::warn!("{:?} {} finished eating but resource {} was already gone", 
                              animal.species, animal.id, resource_id);
                }
            }
            
            // Clear eating state and return to patrolling
            animal.target_resource_id = None;
            animal.survival_action_start_time = None;
            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "finished eating");
        }
    } else {
        // No start time set - this shouldn't happen, but recover gracefully
        log::warn!("{:?} {} in eating state but no start time - resetting", animal.species, animal.id);
        animal.survival_action_start_time = Some(current_time);
    }
    
    Ok(())
}

/// Handle drinking state - restore thirst at water source
fn handle_drinking_state(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    current_time: Timestamp,
) -> Result<(), String> {
    // Check if drinking duration has elapsed
    if let Some(start_time) = animal.survival_action_start_time {
        let elapsed_ms = (current_time.to_micros_since_unix_epoch() - start_time.to_micros_since_unix_epoch()) / 1000;
        
        if elapsed_ms >= ANIMAL_DRINKING_DURATION_MS {
            // Finished drinking - restore thirst
            animal.thirst = (animal.thirst + ANIMAL_THIRST_RESTORE_AMOUNT).min(ANIMAL_MAX_THIRST);
            
            log::info!("{:?} {} finished drinking - thirst restored to {:.1}%", 
                      animal.species, animal.id, animal.thirst);
            
            // Clear drinking state and return to patrolling
            animal.target_water_x = None;
            animal.target_water_y = None;
            animal.survival_action_start_time = None;
            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "finished drinking");
        }
    } else {
        // No start time set - this shouldn't happen, but recover gracefully
        log::warn!("{:?} {} in drinking state but no start time - resetting", animal.species, animal.id);
        animal.survival_action_start_time = Some(current_time);
    }
    
    Ok(())
}

/// Handle seeking food state - move toward harvestable resource
fn handle_seeking_food_state(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    current_time: Timestamp,
) -> Result<(), String> {
    if let Some(resource_id) = animal.target_resource_id {
        if let Some(resource) = ctx.db.harvestable_resource().id().find(&resource_id) {
            // Check if resource is still available (not harvested)
            if resource.respawn_at.is_some() {
                // Resource was harvested - find a new one
                log::info!("{:?} {} target resource {} was harvested - finding new food", 
                          animal.species, animal.id, resource_id);
                animal.target_resource_id = None;
                transition_to_state(animal, AnimalState::Patrolling, current_time, None, "food source gone");
                return Ok(());
            }
            
            // Check if we've reached the resource
            let distance_sq = get_distance_squared(
                animal.pos_x, animal.pos_y,
                resource.pos_x, resource.pos_y
            );
            
            if distance_sq <= 900.0 { // Within 30px
                // Start eating
                animal.survival_action_start_time = Some(current_time);
                transition_to_state(animal, AnimalState::Eating, current_time, None, "reached food - starting to eat");
                log::info!("{:?} {} reached food (resource {}) - starting to eat", 
                          animal.species, animal.id, resource_id);
            }
        } else {
            // Resource doesn't exist anymore - find a new one
            log::info!("{:?} {} target resource {} disappeared - finding new food", 
                      animal.species, animal.id, resource_id);
            animal.target_resource_id = None;
            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "food source disappeared");
        }
    } else {
        // No target resource - this shouldn't happen, return to patrolling
        log::warn!("{:?} {} seeking food but no target resource - returning to patrol", 
                  animal.species, animal.id);
        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "no food target");
    }
    
    Ok(())
}

/// Handle seeking water state - move toward water source
fn handle_seeking_water_state(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    current_time: Timestamp,
) -> Result<(), String> {
    if let (Some(target_x), Some(target_y)) = (animal.target_water_x, animal.target_water_y) {
        // Check if target is still water
        if !is_water_tile(ctx, target_x, target_y) {
            // Water source is gone (shouldn't happen but handle it)
            log::warn!("{:?} {} target water at ({:.1}, {:.1}) is no longer water - finding new source", 
                      animal.species, animal.id, target_x, target_y);
            animal.target_water_x = None;
            animal.target_water_y = None;
            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "water source gone");
            return Ok(());
        }
        
        // Check if we've reached the water
        let distance_sq = get_distance_squared(
            animal.pos_x, animal.pos_y,
            target_x, target_y
        );
        
        if distance_sq <= 1600.0 { // Within 40px (edge of water tile)
            // Start drinking
            animal.survival_action_start_time = Some(current_time);
            transition_to_state(animal, AnimalState::Drinking, current_time, None, "reached water - starting to drink");
            log::info!("{:?} {} reached water at ({:.1}, {:.1}) - starting to drink", 
                      animal.species, animal.id, target_x, target_y);
        }
    } else {
        // No target water - this shouldn't happen, return to patrolling
        log::warn!("{:?} {} seeking water but no target position - returning to patrol", 
                  animal.species, animal.id);
        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "no water target");
    }
    
    Ok(())
}

/// Find the nearest harvestable resource within detection radius
/// OPTIMIZED: Uses chunk-based spatial indexing to reduce search space
fn find_nearest_harvestable_resource(
    ctx: &ReducerContext,
    animal: &WildAnimal,
) -> Option<u64> {
    let mut nearest_resource_id: Option<u64> = None;
    let mut nearest_distance_sq = ANIMAL_RESOURCE_DETECTION_RADIUS_SQUARED;
    
    // Calculate which chunks to search based on detection radius
    let animal_chunk = animal.chunk_index;
    let chunks_to_search = get_nearby_chunks(animal.pos_x, animal.pos_y, ANIMAL_RESOURCE_DETECTION_RADIUS);
    
    // Only search resources in nearby chunks (massive performance improvement)
    for chunk_idx in chunks_to_search {
        for resource in ctx.db.harvestable_resource().chunk_index().filter(&chunk_idx) {
            // Skip resources that are already harvested (waiting for respawn)
            if resource.respawn_at.is_some() {
                continue;
            }
            
            let distance_sq = get_distance_squared(
                animal.pos_x, animal.pos_y,
                resource.pos_x, resource.pos_y
            );
            
            if distance_sq < nearest_distance_sq {
                nearest_distance_sq = distance_sq;
                nearest_resource_id = Some(resource.id);
            }
        }
    }
    
    nearest_resource_id
}

/// Find the nearest water source within detection radius
/// OPTIMIZED: Uses spiral search pattern with early termination
fn find_nearest_water_source(
    ctx: &ReducerContext,
    animal: &WildAnimal,
) -> Option<(f32, f32)> {
    let search_radius = 300.0; // Same as ANIMAL_RESOURCE_DETECTION_RADIUS
    let sample_step = 50.0; // Check every 50px (1 tile)
    
    // OPTIMIZATION 1: Check immediate vicinity first (most likely to find water nearby)
    let quick_check_radius = 100.0; // Check 2 tiles around first
    let quick_step = 50.0;
    
    for offset_x in (-quick_check_radius as i32..=quick_check_radius as i32).step_by(quick_step as usize) {
        for offset_y in (-quick_check_radius as i32..=quick_check_radius as i32).step_by(quick_step as usize) {
            let test_x = animal.pos_x + offset_x as f32;
            let test_y = animal.pos_y + offset_y as f32;
            
            if test_x >= 0.0 && test_x < crate::WORLD_WIDTH_PX && 
               test_y >= 0.0 && test_y < crate::WORLD_HEIGHT_PX {
                if is_water_tile(ctx, test_x, test_y) {
                    // Found water nearby - return immediately (early termination)
                    return Some((test_x, test_y));
                }
            }
        }
    }
    
    // OPTIMIZATION 2: If no water found nearby, use sparse sampling for full radius
    // Sample every 100px instead of 50px for distant searches (4x fewer checks)
    let sparse_step = 100.0;
    let mut nearest_water_pos: Option<(f32, f32)> = None;
    let mut nearest_distance_sq = f32::MAX;
    
    let start_x = (animal.pos_x - search_radius).max(0.0);
    let end_x = (animal.pos_x + search_radius).min(crate::WORLD_WIDTH_PX);
    let start_y = (animal.pos_y - search_radius).max(0.0);
    let end_y = (animal.pos_y + search_radius).min(crate::WORLD_HEIGHT_PX);
    
    let mut test_x = start_x;
    while test_x <= end_x {
        let mut test_y = start_y;
        while test_y <= end_y {
            // Skip points we already checked in quick search
            let dx = (test_x - animal.pos_x).abs();
            let dy = (test_y - animal.pos_y).abs();
            if dx <= quick_check_radius && dy <= quick_check_radius {
                test_y += sparse_step;
                continue;
            }
            
            if is_water_tile(ctx, test_x, test_y) {
                let distance_sq = get_distance_squared(
                    animal.pos_x, animal.pos_y,
                    test_x, test_y
                );
                
                if distance_sq < nearest_distance_sq {
                    nearest_distance_sq = distance_sq;
                    nearest_water_pos = Some((test_x, test_y));
                }
            }
            test_y += sparse_step;
        }
        test_x += sparse_step;
    }
    
    nearest_water_pos
}

/// Calculate which chunks to search based on position and radius
/// OPTIMIZATION: Returns only chunks that overlap with the search radius
fn get_nearby_chunks(pos_x: f32, pos_y: f32, radius: f32) -> Vec<u32> {
    let mut chunks = Vec::with_capacity(9); // Most cases will be 1-9 chunks
    
    // Calculate bounding box
    let min_x = (pos_x - radius).max(0.0);
    let max_x = (pos_x + radius).min(crate::WORLD_WIDTH_PX);
    let min_y = (pos_y - radius).max(0.0);
    let max_y = (pos_y + radius).min(crate::WORLD_HEIGHT_PX);
    
    // Sample corners and center to find all overlapping chunks
    let sample_points = vec![
        (min_x, min_y),           // Top-left
        (max_x, min_y),           // Top-right
        (min_x, max_y),           // Bottom-left
        (max_x, max_y),           // Bottom-right
        (pos_x, pos_y),           // Center
        ((min_x + max_x) / 2.0, min_y), // Top-center
        ((min_x + max_x) / 2.0, max_y), // Bottom-center
        (min_x, (min_y + max_y) / 2.0), // Left-center
        (max_x, (min_y + max_y) / 2.0), // Right-center
    ];
    
    for (x, y) in sample_points {
        let chunk = calculate_chunk_index(x, y);
        if !chunks.contains(&chunk) {
            chunks.push(chunk);
        }
    }
    
    chunks
}

