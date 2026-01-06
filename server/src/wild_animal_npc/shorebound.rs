/******************************************************************************
 *                                                                            *
 * Shorebound Behavior - Night Stalker Enemy                                 *
 *                                                                            *
 * Fast, low-health night enemy that circles and pressures players.          *
 * Approaches cautiously, breaks off when player retreats, circles and       *
 * pressures before eventually charging to attack.                           *
 *                                                                            *
 * Key behaviors:                                                             *
 * - Spawns only at night in Ring B (19-34 tiles from player)               *
 * - Fast movement, low health                                               *
 * - Stalks by circling player at medium distance                           *
 * - Eventually decides to charge and attack                                 *
 * - Does NOT attack structures - patrols outside bases                     *
 * - Despawns at dawn                                                        *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Identity, Timestamp, Table};
use std::f32::consts::PI;
use rand::Rng;
use log;

use crate::Player;
use crate::utils::get_distance_squared;

// Table trait imports
use crate::player as PlayerTableTrait;
use super::core::{
    AnimalBehavior, AnimalStats, AnimalState, MovementPattern, WildAnimal,
    move_towards_target, can_attack, transition_to_state, emit_species_sound,
    is_player_in_chase_range, get_player_distance,
    execute_standard_patrol, wild_animal,
    set_flee_destination_away_from_threat,
    update_animal_position,
};

pub struct ShoreboundBehavior;

// Shorebound-specific constants
const STALK_MIN_DISTANCE: f32 = 150.0; // Minimum circling distance
const STALK_MAX_DISTANCE: f32 = 300.0; // Maximum circling distance
const STALK_ORBIT_SPEED: f32 = 0.8; // Radians per second for circling
const STALK_APPROACH_RATE: f32 = 15.0; // How fast to approach while stalking
const STALK_RETREAT_RATE: f32 = 25.0; // How fast to back off
const STALK_DURATION_MIN_MS: i64 = 5000; // Minimum stalking time before charge (5s)
const STALK_DURATION_MAX_MS: i64 = 15000; // Maximum stalking time before charge (15s)
const CHARGE_DECISION_CHANCE: f32 = 0.15; // 15% chance per AI tick to decide to charge

impl AnimalBehavior for ShoreboundBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 80.0, // Low health - can be killed quickly
            attack_damage: 18.0, // Moderate damage
            attack_range: 60.0, // Short melee range
            attack_speed_ms: 600, // Fast attacks
            movement_speed: 280.0, // Fast patrol speed
            sprint_speed: 520.0, // Very fast sprint - faster than player
            perception_range: 600.0, // Good detection range
            perception_angle_degrees: 270.0, // Wide awareness
            patrol_radius: 400.0, // Large patrol area
            chase_trigger_range: 500.0, // Long chase range
            flee_trigger_health_percent: 0.0, // Never flees - fights to death
            hide_duration_ms: 0, // Doesn't hide
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
        
        // Shorebound has a chance to cause a brief slow effect
        if rng.gen::<f32>() < 0.20 {
            // TODO: Apply slow effect when that system exists
            log::info!("Shorebound {} lands a slowing strike on player {}!", animal.id, target_player.identity);
        }
        
        log::info!("Shorebound {} attacks player {} for {} damage", animal.id, target_player.identity, damage);
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
        match animal.state {
            AnimalState::Idle | AnimalState::Patrolling => {
                if let Some(player) = detected_player {
                    // Transition to stalking instead of immediate chase
                    transition_to_state(animal, AnimalState::Stalking, current_time, Some(player.identity), "detected player - begin stalking");
                    
                    // Initialize stalking parameters
                    let dx = animal.pos_x - player.position_x;
                    let dy = animal.pos_y - player.position_y;
                    animal.stalk_angle = dy.atan2(dx);
                    animal.stalk_distance = (dx * dx + dy * dy).sqrt().clamp(STALK_MIN_DISTANCE, STALK_MAX_DISTANCE);
                    
                    // Emit growl sound
                    emit_species_sound(ctx, animal, player.identity, "chase_start");
                    
                    log::debug!("Shorebound {} begins stalking player {}", animal.id, player.identity);
                }
            },
            
            AnimalState::Stalking => {
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        let distance = get_player_distance(animal, &target_player);
                        
                        // Check if player is too far - return to patrol
                        if distance > stats.chase_trigger_range * 1.5 {
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "player too far - lost interest");
                            return Ok(());
                        }
                        
                        // Calculate time spent stalking
                        let stalk_duration_ms = (current_time.to_micros_since_unix_epoch() -
                            animal.state_change_time.to_micros_since_unix_epoch()) / 1000;
                        
                        // Decide whether to charge
                        let should_charge = stalk_duration_ms > STALK_DURATION_MIN_MS && 
                            (stalk_duration_ms > STALK_DURATION_MAX_MS || rng.gen::<f32>() < CHARGE_DECISION_CHANCE);
                        
                        if should_charge {
                            transition_to_state(animal, AnimalState::Chasing, current_time, Some(target_id), "charge decision - attacking!");
                            emit_species_sound(ctx, animal, target_id, "alert_to_chase");
                            log::debug!("Shorebound {} decides to charge player {}", animal.id, target_id);
                        }
                    } else {
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "target lost");
                    }
                }
            },
            
            AnimalState::Chasing => {
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        if !is_player_in_chase_range(animal, &target_player, stats) {
                            let distance = get_player_distance(animal, &target_player);
                            if distance > stats.chase_trigger_range * 1.3 {
                                // Go back to stalking instead of patrol
                                transition_to_state(animal, AnimalState::Stalking, current_time, Some(target_id), "player retreated - resume stalking");
                            }
                        }
                    } else {
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "target lost");
                    }
                }
            },
            
            AnimalState::Attacking => {
                // After attack, continue chasing
                if !can_attack(animal, current_time, stats) {
                    if let Some(target_id) = animal.target_player_id {
                        transition_to_state(animal, AnimalState::Chasing, current_time, Some(target_id), "post-attack chase");
                    }
                }
            },
            
            AnimalState::Despawning => {
                // Being removed at dawn - no AI processing
            },
            
            _ => {
                // Handle other states by returning to patrol
                transition_to_state(animal, AnimalState::Patrolling, current_time, None, "unknown state - reset");
            }
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
        // Shorebound doesn't flee - instead goes back to stalking
        if let Some(target_id) = animal.target_player_id {
            transition_to_state(animal, AnimalState::Stalking, current_time, Some(target_id), "not fleeing - resume stalking");
        } else {
            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "no target - patrol");
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
        // If stalking, execute special circling behavior
        if animal.state == AnimalState::Stalking {
            if let Some(target_id) = animal.target_player_id {
                if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                    // Update orbit angle
                    animal.stalk_angle += STALK_ORBIT_SPEED * dt;
                    if animal.stalk_angle > 2.0 * PI {
                        animal.stalk_angle -= 2.0 * PI;
                    }
                    
                    // Gradually approach
                    if animal.stalk_distance > STALK_MIN_DISTANCE + 20.0 {
                        animal.stalk_distance -= STALK_APPROACH_RATE * dt;
                    }
                    
                    // Calculate target position on circle around player
                    let target_x = target_player.position_x + animal.stalk_distance * animal.stalk_angle.cos();
                    let target_y = target_player.position_y + animal.stalk_distance * animal.stalk_angle.sin();
                    
                    // Move towards that position
                    move_towards_target(ctx, animal, target_x, target_y, stats.movement_speed, dt);
                    return;
                }
            }
        }
        
        // Standard patrol for non-stalking states
        execute_standard_patrol(ctx, animal, stats, dt, rng);
    }

    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool {
        // Always willing to chase if player is detected and alive
        !player.is_dead && is_player_in_chase_range(animal, player, stats)
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
        // When damaged, immediately switch to chasing the attacker
        transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "damaged - retaliate");
        emit_species_sound(ctx, animal, attacker.identity, "chase_start");
        log::debug!("Shorebound {} retaliates against attacker {}", animal.id, attacker.identity);
        Ok(())
    }

    fn can_be_tamed(&self) -> bool {
        false // Night enemies cannot be tamed
    }

    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![]
    }

    fn get_chase_abandonment_multiplier(&self) -> f32 {
        1.5 // Gives up chase at 1.5x chase range (fairly persistent)
    }
}
