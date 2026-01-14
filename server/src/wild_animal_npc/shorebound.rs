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

// Shorebound-specific constants - AGGRESSIVE: They attack quickly!
const STALK_MIN_DISTANCE: f32 = 80.0; // Minimum circling distance (closer!)
const STALK_MAX_DISTANCE: f32 = 150.0; // Maximum circling distance (closer!)
const SHELTER_STANDOFF_DISTANCE: f32 = 240.0; // Distance to maintain from sheltered players
const STALK_ORBIT_SPEED: f32 = 1.5; // Radians per second for circling (faster orbiting)
const STALK_APPROACH_RATE: f32 = 40.0; // How fast to approach while stalking (much faster)
const STALK_RETREAT_RATE: f32 = 25.0; // How fast to back off
const STALK_DURATION_MIN_MS: i64 = 1000; // Minimum stalking time before charge (1s - quick!)
const STALK_DURATION_MAX_MS: i64 = 4000; // Maximum stalking time before charge (4s max)
const CHARGE_DECISION_CHANCE: f32 = 0.50; // 50% chance per AI tick to decide to charge (very aggressive!)

impl AnimalBehavior for ShoreboundBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 80.0, // Low health - can be killed quickly
            attack_damage: 18.0, // Moderate damage
            attack_range: 95.0, // Extended range to hit from collision distance
            attack_speed_ms: 500, // Very fast attacks
            movement_speed: 130.0, // Moderate patrol - slower than player walk (200)
            sprint_speed: 220.0, // Slower than player sprint (400) - can be outrun
            perception_range: 700.0, // Extended detection range
            perception_angle_degrees: 300.0, // Very wide awareness
            patrol_radius: 400.0, // Large patrol area
            chase_trigger_range: 600.0, // Extended chase range
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
                        
                        // If player is sheltered, maintain standoff distance and just circle
                        // Shorebound doesn't attack structures, so just wait outside
                        if target_player.is_inside_building {
                            // Keep circling at standoff distance, don't charge
                            animal.stalk_distance = animal.stalk_distance.max(SHELTER_STANDOFF_DISTANCE);
                            return Ok(()); // Stay in stalking state, don't charge
                        }
                        
                        // AGGRESSIVE: If already in attack range during stalking, immediately charge!
                        if distance <= stats.attack_range * 1.2 {
                            transition_to_state(animal, AnimalState::Chasing, current_time, Some(target_id), "in range - immediate charge!");
                            emit_species_sound(ctx, animal, target_id, "alert_to_chase");
                            log::debug!("Shorebound {} in attack range - charging!", animal.id);
                            return Ok(());
                        }
                        
                        // Calculate time spent stalking
                        let stalk_duration_ms = (current_time.to_micros_since_unix_epoch() -
                            animal.state_change_time.to_micros_since_unix_epoch()) / 1000;
                        
                        // Decide whether to charge - AGGRESSIVE: Lower threshold, higher chance
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
                        let distance = get_player_distance(animal, &target_player);
                        
                        // If player entered a shelter, go back to stalking at standoff distance
                        // Shorebound doesn't attack structures
                        if target_player.is_inside_building {
                            transition_to_state(animal, AnimalState::Stalking, current_time, Some(target_id), "player sheltered - circle outside");
                            // Set stalk distance to standoff distance
                            let dx = animal.pos_x - target_player.position_x;
                            let dy = animal.pos_y - target_player.position_y;
                            animal.stalk_angle = dy.atan2(dx);
                            animal.stalk_distance = SHELTER_STANDOFF_DISTANCE.max(distance);
                            return Ok(());
                        }
                        
                        if !is_player_in_chase_range(animal, &target_player, stats) {
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
                    
                    // Determine minimum distance based on whether player is sheltered
                    let min_distance = if target_player.is_inside_building {
                        SHELTER_STANDOFF_DISTANCE // Keep distance from shelter
                    } else {
                        STALK_MIN_DISTANCE + 20.0
                    };
                    
                    // Gradually approach, but respect minimum distance
                    if animal.stalk_distance > min_distance {
                        animal.stalk_distance -= STALK_APPROACH_RATE * dt;
                        animal.stalk_distance = animal.stalk_distance.max(min_distance);
                    }
                    
                    // Calculate target position on circle around player
                    let target_x = target_player.position_x + animal.stalk_distance * animal.stalk_angle.cos();
                    let target_y = target_player.position_y + animal.stalk_distance * animal.stalk_angle.sin();
                    
                    // Move towards that position
                    move_towards_target(ctx, animal, target_x, target_y, stats.movement_speed, dt);
                    
                    // COLLISION ENFORCEMENT: Ensure we don't end up inside the player/shelter
                    let dx = animal.pos_x - target_player.position_x;
                    let dy = animal.pos_y - target_player.position_y;
                    let distance = (dx * dx + dy * dy).sqrt();
                    
                    // Use larger minimum distance if player is sheltered
                    let enforce_min_dist = if target_player.is_inside_building {
                        SHELTER_STANDOFF_DISTANCE
                    } else {
                        60.0 // Normal minimum distance during stalking
                    };
                    
                    if distance < enforce_min_dist && distance > 1.0 {
                        // Push away from player/shelter
                        let push_distance = enforce_min_dist - distance + 10.0;
                        let push_x = (dx / distance) * push_distance;
                        let push_y = (dy / distance) * push_distance;
                        super::core::update_animal_position(animal, animal.pos_x + push_x, animal.pos_y + push_y);
                    }
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
