/******************************************************************************
 *                                                                            *
 * Shardkin Behavior - Night Swarmer Enemy                                   *
 *                                                                            *
 * Small, fast, aggressive swarm enemy that attacks on contact.              *
 * Forces players to keep moving or face overwhelming numbers.               *
 *                                                                            *
 * Key behaviors:                                                             *
 * - Spawns only at night in groups of 2-4                                   *
 * - Ring B or Ring C (19-50 tiles from player)                             *
 * - Small and fast, attacks immediately on sight                            *
 * - May attack structures when player is camping                            *
 * - Structure attacks bypass normal melee defenses                          *
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
    // Flashlight hesitation system - apparitions slow down and won't escalate when in beam
    is_in_player_flashlight_beam, FLASHLIGHT_HESITATION_SPEED_MULTIPLIER,
};

pub struct ShardkinBehavior;

// Shardkin-specific constants
const STRUCTURE_ATTACK_CHANCE: f32 = 0.30; // 30% chance to attack structures when player camping
const STRUCTURE_ATTACK_DAMAGE: f32 = 5.0; // Low damage to structures (primarily creates urgency)
const SHELTER_STANDOFF_DISTANCE: f32 = 240.0; // Distance to maintain from sheltered players

impl AnimalBehavior for ShardkinBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 45.0, // Very low health - dies quickly
            attack_damage: 12.0, // Low damage per hit
            attack_range: 69.0, // Increased from 60 to compensate for collision pushback preventing hits
            attack_speed_ms: 300, // Extremely fast attacks (swarm bites!)
            movement_speed: 140.0, // Moderate patrol - slightly slower than player walk (200)
            sprint_speed: 240.0, // Slightly faster than player walk, slower than sprint (400) - escapable
            perception_range: 600.0, // Extended detection
            perception_angle_degrees: 360.0, // Full awareness (swarm behavior)
            patrol_radius: 300.0, // Stays closer together
            chase_trigger_range: 700.0, // Very aggressive chase range
            flee_trigger_health_percent: 0.0, // Never flees
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
        
        // Shardkin attacks are rapid but individually weak
        // The danger comes from multiple Shardkin attacking at once
        
        log::info!("Shardkin {} bites player {} for {} damage", animal.id, target_player.identity, damage);
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
                    // FLASHLIGHT HESITATION: If in player's flashlight beam, don't escalate to chasing
                    // The light keeps apparitions hesitant - they stay in patrol mode
                    let in_flashlight_beam = is_in_player_flashlight_beam(player, animal.pos_x, animal.pos_y);
                    if in_flashlight_beam {
                        // Stay in patrol state, don't chase while blinded by light
                        log::debug!("Shardkin {} hesitates - caught in flashlight beam", animal.id);
                        return Ok(());
                    }
                    
                    // Shardkin immediately chase - no stalking
                    transition_to_state(animal, AnimalState::Chasing, current_time, Some(player.identity), "spotted player - immediate chase");
                    emit_species_sound(ctx, animal, player.identity, "chase_start");
                    log::debug!("Shardkin {} immediately chasing player {}", animal.id, player.identity);
                }
            },
            
            AnimalState::Chasing => {
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        let distance = get_player_distance(animal, &target_player);
                        
                        // FLASHLIGHT HESITATION: If caught in beam while chasing, revert to patrol
                        // The light disrupts their aggression
                        let in_flashlight_beam = is_in_player_flashlight_beam(&target_player, animal.pos_x, animal.pos_y);
                        if in_flashlight_beam {
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "flashlight disrupted chase");
                            log::debug!("Shardkin {} breaks chase - caught in flashlight beam", animal.id);
                            return Ok(());
                        }
                        
                        // Check if should give up chase
                        if distance > stats.chase_trigger_range * 1.2 {
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "player too far");
                            return Ok(());
                        }
                        
                        // If player is sheltered, maintain standoff distance
                        // Shardkin circles outside the shelter waiting for player to emerge
                        if target_player.is_inside_building {
                            // Only initiate circling behavior, don't try to approach closer
                            if distance < SHELTER_STANDOFF_DISTANCE {
                                // Push back to standoff distance
                                let dx = animal.pos_x - target_player.position_x;
                                let dy = animal.pos_y - target_player.position_y;
                                if distance > 1.0 {
                                    let push_dist = SHELTER_STANDOFF_DISTANCE - distance + 15.0;
                                    let push_x = (dx / distance) * push_dist;
                                    let push_y = (dy / distance) * push_dist;
                                    update_animal_position(animal, animal.pos_x + push_x, animal.pos_y + push_y);
                                }
                            }
                            // Stay in chasing state but effectively patrol near shelter
                            return Ok(());
                        }
                        
                        // Check if player is camping and we should attack structures
                        // (Currently disabled - structure attack not implemented for Shardkin)
                        if target_player.is_inside_building && rng.gen::<f32>() < STRUCTURE_ATTACK_CHANCE * 0.01 {
                            // Look for a structure to attack (handled by structure attack system)
                            // For now, continue chasing until structure attack logic is added
                        }
                    } else {
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "target lost");
                    }
                }
            },
            
            AnimalState::AttackingStructure => {
                // Structure attack logic handled elsewhere
                // If no structure target, return to chasing
                if animal.target_structure_id.is_none() {
                    if let Some(target_id) = animal.target_player_id {
                        transition_to_state(animal, AnimalState::Chasing, current_time, Some(target_id), "structure destroyed - chase player");
                    } else {
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "no targets");
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
        // Shardkin never flee - they swarm until death
        if let Some(target_id) = animal.target_player_id {
            transition_to_state(animal, AnimalState::Chasing, current_time, Some(target_id), "shardkin never flee");
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
        // If chasing a sheltered player, circle at standoff distance instead of standard patrol
        if animal.state == AnimalState::Chasing {
            if let Some(target_id) = animal.target_player_id {
                if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                    if target_player.is_inside_building {
                        // Circle around the shelter at standoff distance
                        let dx = animal.pos_x - target_player.position_x;
                        let dy = animal.pos_y - target_player.position_y;
                        let distance = (dx * dx + dy * dy).sqrt();
                        
                        // Calculate orbit angle and circle around
                        let current_angle = dy.atan2(dx);
                        let orbit_speed = 1.2; // Radians per second
                        let new_angle = current_angle + orbit_speed * dt;
                        
                        // Target position on circle
                        let target_x = target_player.position_x + SHELTER_STANDOFF_DISTANCE * new_angle.cos();
                        let target_y = target_player.position_y + SHELTER_STANDOFF_DISTANCE * new_angle.sin();
                        
                        move_towards_target(ctx, animal, target_x, target_y, stats.movement_speed, dt);
                        
                        // Enforce minimum distance from shelter
                        let new_dx = animal.pos_x - target_player.position_x;
                        let new_dy = animal.pos_y - target_player.position_y;
                        let new_dist = (new_dx * new_dx + new_dy * new_dy).sqrt();
                        
                        if new_dist < SHELTER_STANDOFF_DISTANCE && new_dist > 1.0 {
                            let push_dist = SHELTER_STANDOFF_DISTANCE - new_dist + 10.0;
                            let push_x = (new_dx / new_dist) * push_dist;
                            let push_y = (new_dy / new_dist) * push_dist;
                            update_animal_position(animal, animal.pos_x + push_x, animal.pos_y + push_y);
                        }
                        return;
                    }
                }
            }
        }
        
        // Standard patrol behavior - Shardkin wander quickly
        execute_standard_patrol(ctx, animal, stats, dt, rng);
    }

    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool {
        // Always chase if player is detected and alive
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
        // When damaged, immediately chase attacker with increased aggression
        transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "damaged - swarm attacker");
        emit_species_sound(ctx, animal, attacker.identity, "chase_start");
        log::debug!("Shardkin {} swarms toward attacker {}", animal.id, attacker.identity);
        Ok(())
    }

    fn can_be_tamed(&self) -> bool {
        false
    }

    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![]
    }

    fn get_chase_abandonment_multiplier(&self) -> f32 {
        4.0 // Very persistent - maintains ranged combat at 400-600px without giving up
    }
}

/// Get structure damage for Shardkin attacks
pub fn get_shardkin_structure_damage() -> f32 {
    STRUCTURE_ATTACK_DAMAGE
}
