/******************************************************************************
 *                                                                            *
 * Beach Crab Behavior - Slow Beach Scavenger                                *
 *                                                                            *
 * Crabs are slow-moving, passive beach creatures that only attack when      *
 * provoked (attacked first). They deal light damage with their pincers      *
 * and drop unique resources like crab meat, carapace, and claws.            *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Identity, Timestamp, Table};
use std::f32::consts::PI;
use rand::Rng;
use log;

use crate::{Player};
use crate::utils::get_distance_squared;

// Table trait imports
use crate::player as PlayerTableTrait;
use super::core::{
    AnimalBehavior, AnimalStats, AnimalState, MovementPattern, WildAnimal, AnimalSpecies,
    move_towards_target, can_attack, transition_to_state, emit_species_sound,
    execute_standard_patrol, get_player_distance, is_player_in_chase_range, wild_animal,
    detect_and_handle_stuck_movement,
};

pub struct BeachCrabBehavior;

impl AnimalBehavior for BeachCrabBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 60.0, // Low health - easy to kill
            attack_damage: 8.0, // Light pinch damage
            attack_range: 97.0, // Increased from 85 to compensate for collision pushback preventing hits
            attack_speed_ms: 1500, // Slow attacks (1.5 seconds)
            movement_speed: 80.0, // Very slow patrol speed
            sprint_speed: 120.0, // Slightly faster when chasing/fleeing
            perception_range: 150.0, // Small detection range
            perception_angle_degrees: 180.0, // Wide vision (crabs have compound eyes)
            patrol_radius: 100.0, // Small patrol area - stay on beaches
            chase_trigger_range: 200.0, // Short chase range
            flee_trigger_health_percent: 0.25, // Flee at 25% health
            hide_duration_ms: 0, // Crabs don't hide
        }
    }

    fn get_movement_pattern(&self) -> MovementPattern {
        MovementPattern::Wander
    }

    fn execute_attack_effects(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        target_player: &Player,
        stats: &AnimalStats,
        current_time: Timestamp,
        rng: &mut impl Rng,
    ) -> Result<f32, String> {
        let damage = stats.attack_damage;
        
        // Simple pinch attack - no special effects
        log::info!("Beach Crab {} pinches player {} for {:.1} damage", 
                  animal.id, target_player.identity, damage);
        
        Ok(damage)
    }

    fn update_ai_state_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        detected_player: Option<&Player>,
        current_time: Timestamp,
        rng: &mut impl Rng,
    ) -> Result<(), String> {
        // 🦀 CRAB DEFENSIVE BEHAVIOR: Only attack when provoked
        // Crabs are passive unless attacked first
        
        match animal.state {
            AnimalState::Patrolling => {
                // Crabs don't become aggressive on their own - they're passive
                // They only attack if damaged (handled in handle_damage_response)
                if let Some(player) = detected_player {
                    let distance = get_player_distance(animal, player);
                    
                    // Crabs become alert when players get very close
                    if distance <= stats.perception_range * 0.5 { // 50% of perception range
                        transition_to_state(animal, AnimalState::Alert, current_time, None, "player nearby");
                        log::debug!("Beach Crab {} alert - player {} approaching at {:.1}px", 
                                  animal.id, player.identity, distance);
                    }
                }
            },
            
            AnimalState::Alert => {
                if let Some(player) = detected_player {
                    let distance = get_player_distance(animal, player);
                    
                    // Stay alert while player is nearby, return to patrol if they leave
                    if distance > stats.perception_range {
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "player left area");
                        log::debug!("Beach Crab {} returning to patrol - player moved away", animal.id);
                    }
                    // Note: Crabs in Alert state will only attack if damaged
                } else {
                    // No player detected - return to patrol
                    transition_to_state(animal, AnimalState::Patrolling, current_time, None, "no player detected");
                }
            },
            
            AnimalState::Chasing => {
                // Once provoked, crabs will chase but give up quickly
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        let distance = get_player_distance(animal, &target_player);
                        
                        // Crabs give up chase relatively quickly
                        if distance > (stats.chase_trigger_range * 2.0) {
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "player escaped");
                            log::debug!("Beach Crab {} ending chase - player too far away", animal.id);
                        }
                    } else {
                        // Target lost
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "target lost");
                    }
                }
            },
            
            AnimalState::Fleeing => {
                // Check if fled far enough to return to patrolling
                if let Some(investigation_x) = animal.investigation_x {
                    if let Some(investigation_y) = animal.investigation_y {
                        let distance_to_flee_target = get_distance_squared(
                            animal.pos_x, animal.pos_y,
                            investigation_x, investigation_y
                        );
                        
                        if distance_to_flee_target < 100.0 {
                            // Reached flee destination - return to patrol
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "reached flee destination");
                            animal.investigation_x = None;
                            animal.investigation_y = None;
                            log::debug!("Beach Crab {} finished fleeing - returning to patrol", animal.id);
                        }
                    }
                }
            },
            
            _ => {} // Other states handled by core system
        }
        
        Ok(())
    }

    fn execute_flee_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        dt: f32,
        current_time: Timestamp,
        rng: &mut impl Rng,
    ) {
        // Store previous position to detect if stuck
        let prev_x = animal.pos_x;
        let prev_y = animal.pos_y;
        
        // Pick a random direction to flee
        if animal.investigation_x.is_none() || animal.investigation_y.is_none() {
            let flee_angle = rng.gen::<f32>() * 2.0 * PI;
            let flee_distance = 150.0 + (rng.gen::<f32>() * 100.0); // 3-5m flee
            animal.investigation_x = Some(animal.pos_x + flee_distance * flee_angle.cos());
            animal.investigation_y = Some(animal.pos_y + flee_distance * flee_angle.sin());
        }
        
        if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
            move_towards_target(ctx, animal, target_x, target_y, stats.sprint_speed, dt);
            
            // Check if stuck
            if detect_and_handle_stuck_movement(animal, prev_x, prev_y, 5.0, rng, "fleeing") {
                let new_angle = animal.direction_y.atan2(animal.direction_x);
                let flee_distance = 150.0;
                animal.investigation_x = Some(animal.pos_x + flee_distance * new_angle.cos());
                animal.investigation_y = Some(animal.pos_y + flee_distance * new_angle.sin());
            }
            
            // Check if reached flee destination or fled long enough
            let distance_to_target = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y).sqrt();
            let time_fleeing = current_time.to_micros_since_unix_epoch() - animal.state_change_time.to_micros_since_unix_epoch();
            
            if distance_to_target <= 50.0 || time_fleeing > 2_000_000 { // 2 seconds max flee
                animal.state = AnimalState::Patrolling;
                animal.target_player_id = None;
                animal.investigation_x = None;
                animal.investigation_y = None;
                animal.state_change_time = current_time;
                log::debug!("Beach Crab {} finished fleeing", animal.id);
            }
        }
    }

    fn execute_patrol_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        dt: f32,
        rng: &mut impl Rng,
    ) {
        // MODIFIED PATROL: Crabs move slowly and stay on beaches
        let modified_stats = AnimalStats {
            patrol_radius: 60.0, // Very small patrol radius
            movement_speed: stats.movement_speed * 0.7, // Move 30% slower during patrol
            ..stats.clone()
        };
        
        execute_standard_patrol(ctx, animal, &modified_stats, dt, rng);
        
        // Additional check to keep crabs on beaches/coastal areas
        if rng.gen::<f32>() < 0.08 { // 8% chance per tick to check beach proximity
            if !is_position_on_beach_or_coastal(ctx, animal.pos_x, animal.pos_y) {
                // Find direction toward nearest beach and bias movement
                if let Some((beach_x, beach_y)) = find_nearest_beach_tile(ctx, animal.pos_x, animal.pos_y) {
                    let dx = beach_x - animal.pos_x;
                    let dy = beach_y - animal.pos_y;
                    let distance = (dx * dx + dy * dy).sqrt();
                    
                    if distance > 0.0 {
                        // Bias direction toward beach
                        let beach_weight = 0.8; // 80% toward beach, 20% random
                        let random_angle = rng.gen::<f32>() * 2.0 * PI;
                        let beach_angle = dy.atan2(dx);
                        
                        animal.direction_x = beach_weight * beach_angle.cos() + (1.0 - beach_weight) * random_angle.cos();
                        animal.direction_y = beach_weight * beach_angle.sin() + (1.0 - beach_weight) * random_angle.sin();
                        
                        // Normalize the direction
                        let length = (animal.direction_x * animal.direction_x + animal.direction_y * animal.direction_y).sqrt();
                        if length > 0.0 {
                            animal.direction_x /= length;
                            animal.direction_y /= length;
                        }
                        
                        log::debug!("Beach Crab {} guided back toward beach area", animal.id);
                    }
                }
            }
        }
    }

    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool {
        // Crabs never chase unprovoked - they only attack when damaged first
        // This function should only return true if the crab is already in a hostile state
        false
    }

    fn handle_damage_response(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        attacker: &Player,
        stats: &AnimalStats,
        current_time: Timestamp,
        rng: &mut impl Rng,
    ) -> Result<(), String> {
        // 🦀 CRAB RETALIATION: When attacked, crabs either fight back or flee
        let health_percent = animal.health / stats.max_health;
        
        if health_percent > stats.flee_trigger_health_percent {
            // High health - retaliate with pincer attack
            transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "crab retaliation");
            
            // 🔊 CRAB SOUND: Emit growl when retaliating
            emit_species_sound(ctx, animal, attacker.identity, "retaliation");
            
            log::info!("🦀 Beach Crab {} retaliating against attacker {} (Health: {:.1}%)", 
                      animal.id, attacker.identity, health_percent * 100.0);
        } else {
            // Low health - flee
            let flee_angle = rng.gen::<f32>() * 2.0 * PI;
            let flee_distance = 150.0;
            animal.investigation_x = Some(animal.pos_x + flee_distance * flee_angle.cos());
            animal.investigation_y = Some(animal.pos_y + flee_distance * flee_angle.sin());
            transition_to_state(animal, AnimalState::Fleeing, current_time, None, "low health flee");
            
            log::info!("🦀 Beach Crab {} fleeing due to low health ({:.1}%)", 
                      animal.id, health_percent * 100.0);
        }
        
        Ok(())
    }
    
    fn can_be_tamed(&self) -> bool {
        false // Crabs cannot be tamed
    }
    
    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![] // No taming foods for crabs
    }
    
    fn get_chase_abandonment_multiplier(&self) -> f32 {
        2.0 // Crabs give up quickly - give up at 2.0x chase trigger range
    }
}

// Helper functions for beach navigation (similar to walrus.rs)

/// Check if position is on beach or coastal area (beach tile or adjacent to water)
fn is_position_on_beach_or_coastal(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    // Convert pixel position to tile coordinates
    let tile_x = (pos_x / crate::TILE_SIZE_PX as f32).floor() as i32;
    let tile_y = (pos_y / crate::TILE_SIZE_PX as f32).floor() as i32;
    
    // Check if current tile is beach
    if let Some(tile_type) = crate::get_tile_type_at_position(ctx, tile_x, tile_y) {
        if tile_type == crate::TileType::Beach {
            return true;
        }
        
        // If not beach, check if it's adjacent to water (coastal area)
        if tile_type == crate::TileType::Grass || tile_type == crate::TileType::Dirt || tile_type == crate::TileType::Sand {
            // Check surrounding tiles for water
            for dy in -1..=1 {
                for dx in -1..=1 {
                    if dx == 0 && dy == 0 { continue; }
                    
                    let check_x = tile_x + dx;
                    let check_y = tile_y + dy;
                    
                    if let Some(adjacent_tile_type) = crate::get_tile_type_at_position(ctx, check_x, check_y) {
                        if adjacent_tile_type.is_water() || adjacent_tile_type == crate::TileType::Beach {
                            return true; // Adjacent to water/beach = coastal
                        }
                    }
                }
            }
        }
    }
    
    false
}

/// Find the nearest beach tile to guide crab movement
fn find_nearest_beach_tile(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> Option<(f32, f32)> {
    let current_tile_x = (pos_x / crate::TILE_SIZE_PX as f32).floor() as i32;
    let current_tile_y = (pos_y / crate::TILE_SIZE_PX as f32).floor() as i32;
    
    let search_radius = 8; // Search within 8 tiles
    let mut closest_beach: Option<(i32, i32)> = None;
    let mut closest_distance_sq = f32::MAX;
    
    // Search in expanding radius for beach tiles
    for dy in -search_radius..=search_radius {
        for dx in -search_radius..=search_radius {
            let check_x = current_tile_x + dx;
            let check_y = current_tile_y + dy;
            
            // Check bounds
            if check_x < 0 || check_y < 0 || 
               check_x >= crate::WORLD_WIDTH_TILES as i32 || check_y >= crate::WORLD_HEIGHT_TILES as i32 {
                continue;
            }
            
            if let Some(tile_type) = crate::get_tile_type_at_position(ctx, check_x, check_y) {
                if tile_type == crate::TileType::Beach {
                    let distance_sq = (dx * dx + dy * dy) as f32;
                    if distance_sq < closest_distance_sq {
                        closest_distance_sq = distance_sq;
                        closest_beach = Some((check_x, check_y));
                    }
                }
            }
        }
    }
    
    // Convert tile coordinates back to world position
    if let Some((beach_tile_x, beach_tile_y)) = closest_beach {
        let beach_world_x = (beach_tile_x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
        let beach_world_y = (beach_tile_y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
        Some((beach_world_x, beach_world_y))
    } else {
        None
    }
}

