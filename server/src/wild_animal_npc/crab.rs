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
use crate::tide_pool as TidePoolTableTrait;
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
        // MODIFIED PATROL: Crabs move slowly and stick to their tide pool (bias back when outside)
        // When attacked, flee logic runs instead - animals can flee away from their zone
        let modified_stats = AnimalStats {
            patrol_radius: 60.0, // Very small patrol radius
            movement_speed: stats.movement_speed * 0.7, // Move 30% slower during patrol
            ..stats.clone()
        };
        
        execute_standard_patrol(ctx, animal, &modified_stats, dt, rng);
        
        // Tide pool sticking: Only for crabs that SPAWNED in a tide pool (random beach spawns don't get bias)
        if rng.gen::<f32>() < 0.08 { // 8% chance per tick to check tide pool proximity
            let spawn_in_tide_pool = crate::environment::is_position_in_tide_pool(ctx, animal.spawn_x, animal.spawn_y);
            if spawn_in_tide_pool && !is_position_in_tide_pool(ctx, animal.pos_x, animal.pos_y) {
                // Find nearest tide pool and bias movement back toward it
                if let Some((pool_x, pool_y)) = find_nearest_tide_pool(ctx, animal.pos_x, animal.pos_y) {
                    let dx = pool_x - animal.pos_x;
                    let dy = pool_y - animal.pos_y;
                    let distance = (dx * dx + dy * dy).sqrt();
                    
                    if distance > 0.0 {
                        // Bias direction toward tide pool center
                        let pool_weight = 0.8; // 80% toward pool, 20% random
                        let random_angle = rng.gen::<f32>() * 2.0 * PI;
                        let pool_angle = dy.atan2(dx);
                        
                        animal.direction_x = pool_weight * pool_angle.cos() + (1.0 - pool_weight) * random_angle.cos();
                        animal.direction_y = pool_weight * pool_angle.sin() + (1.0 - pool_weight) * random_angle.sin();
                        
                        // Normalize the direction
                        let length = (animal.direction_x * animal.direction_x + animal.direction_y * animal.direction_y).sqrt();
                        if length > 0.0 {
                            animal.direction_x /= length;
                            animal.direction_y /= length;
                        }
                        
                        log::debug!("Beach Crab {} guided back toward tide pool", animal.id);
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

fn is_position_in_tide_pool(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    crate::environment::is_position_in_tide_pool(ctx, pos_x, pos_y)
}

fn find_nearest_tide_pool(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> Option<(f32, f32)> {
    let mut closest_pool: Option<(f32, f32)> = None;
    let mut closest_distance_sq = f32::MAX;
    for pool in ctx.db.tide_pool().iter() {
        let dx = pos_x - pool.world_x;
        let dy = pos_y - pool.world_y;
        let distance_sq = dx * dx + dy * dy;
        if distance_sq < closest_distance_sq {
            closest_distance_sq = distance_sq;
            closest_pool = Some((pool.world_x, pool.world_y));
        }
    }
    closest_pool
}


