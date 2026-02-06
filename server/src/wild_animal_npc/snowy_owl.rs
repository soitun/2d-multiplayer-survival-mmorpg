/******************************************************************************
 *                                                                            *
 * Snowy Owl Behavior - Alpine Aggressive Flying Predator                    *
 *                                                                            *
 * Snowy owls are territorial flying predators found in alpine biomes.       *
 * Unlike crows and terns, they don't steal or scavenge - they attack!       *
 * When a player gets within 200px, they become aggressive and pursue        *
 * while flying, attacking until the player escapes or they're killed.       *
 *                                                                            *
 * Characteristics:                                                          *
 * - Flying bird with patrol and chase capabilities                          *
 * - Aggressive within 200px range - attacks on sight                        *
 * - No stealing or scavenging behavior                                      *
 * - Chases while flying                                                     *
 * - Medium health and moderate damage                                       *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Timestamp, Table};
use std::f32::consts::PI;
use rand::Rng;
use log;

use crate::Player;
use crate::utils::get_distance_squared;

use crate::player as PlayerTableTrait;
use super::core::{
    AnimalBehavior, AnimalStats, AnimalState, MovementPattern, WildAnimal,
    move_towards_target, transition_to_state, emit_species_sound,
    get_player_distance, execute_flying_patrol, execute_grounded_idle, execute_flying_chase,
    set_flee_destination_away_from_threat,
    detect_and_handle_stuck_movement,
};

// Snowy owl specific constants
const OWL_AGGRESSION_RANGE: f32 = 200.0; // Attack players within this range
const OWL_AGGRESSION_RANGE_SQUARED: f32 = OWL_AGGRESSION_RANGE * OWL_AGGRESSION_RANGE;
const OWL_CHASE_ABANDON_RANGE: f32 = 400.0; // Give up chase if player gets this far

pub struct SnowyOwlBehavior;

impl AnimalBehavior for SnowyOwlBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 70.0, // Medium health - tougher than crow but not a tank
            attack_damage: 10.0, // Moderate damage - talons hurt
            attack_range: 60.0, // Reduced from 70 - decent range for talon attacks but tighter
            attack_speed_ms: 900, // Fast attack speed - aggressive predator
            movement_speed: 120.0, // Ground speed (rarely used)
            sprint_speed: 300.0, // Base flying speed (x1.8 = 540 effective) - fast flyer
            perception_range: 300.0, // Good hunter vision
            perception_angle_degrees: 270.0, // Wide field of view - owl eyes
            patrol_radius: 450.0, // Patrol area (flying)
            chase_trigger_range: OWL_AGGRESSION_RANGE, // Chase when player is within 200px
            flee_trigger_health_percent: 0.25, // Flee at 25% health
            hide_duration_ms: 0, // Birds don't hide
        }
    }

    fn get_movement_pattern(&self) -> MovementPattern {
        MovementPattern::Wander // Owls wander while flying
    }

    fn execute_attack_effects(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        target_player: &Player,
        stats: &AnimalStats,
        _current_time: Timestamp,
        rng: &mut impl Rng,
    ) -> Result<f32, String> {
        let mut damage = stats.attack_damage;
        
        // Owl talon strike - bonus damage
        damage += 2.0;
        
        // 20% chance to cause minor bleeding (talon scratch)
        if rng.gen::<f32>() < 0.20 {
            if let Err(e) = crate::active_effects::apply_bleeding_effect(
                ctx, 
                target_player.identity, 
                8.0, // Total bleed damage
                6.0, // Duration: 6 seconds
                2.0  // Tick every 2 seconds
            ) {
                log::error!("Failed to apply bleeding effect from snowy owl attack: {}", e);
            } else {
                log::info!("Snowy Owl {} scratches player {} with bleeding talons!", animal.id, target_player.identity);
            }
        }
        
        // Continue attacking - owls are persistent while in range
        // Stay flying during attack
        animal.is_flying = true;
        
        log::info!("Snowy Owl {} strikes player {} with talons for {:.1} damage", 
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
        match animal.state {
            AnimalState::Patrolling | AnimalState::Flying | AnimalState::Grounded => {
                // Check for players to attack - snowy owls are AGGRESSIVE
                if let Some(player) = detected_player {
                    let distance = get_player_distance(animal, player);
                    
                    // If player is within aggression range, attack!
                    if distance < OWL_AGGRESSION_RANGE {
                        animal.is_flying = true; // Take off to chase
                        animal.target_player_id = Some(player.identity);
                        transition_to_state(animal, AnimalState::Chasing, current_time, Some(player.identity), "owl aggression triggered");
                        
                        // 🔊 OWL SCREECH: Emit territorial screech when attacking
                        emit_species_sound(ctx, animal, player.identity, "chase_start");
                        
                        log::info!("Snowy Owl {} aggressively attacking player {} at distance {:.1}!", 
                                  animal.id, player.identity, distance);
                        return Ok(());
                    }
                }
                
                // Normal flying/grounded behavior handled by core movement system
            },
            
            AnimalState::Chasing => {
                animal.is_flying = true; // Always fly while chasing
                
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        let distance = get_player_distance(animal, &target_player);
                        
                        // Check if player escaped (got too far)
                        if distance > OWL_CHASE_ABANDON_RANGE {
                            animal.is_flying = true; // Stay flying but stop chasing
                            transition_to_state(animal, AnimalState::Flying, current_time, None, "player escaped");
                            log::debug!("Snowy Owl {} giving up chase - player escaped at distance {:.1}", animal.id, distance);
                            return Ok(());
                        }
                        
                        // Check if health is low - flee
                        let health_percent = animal.health / stats.max_health;
                        if health_percent < stats.flee_trigger_health_percent {
                            animal.is_flying = true;
                            set_flee_destination_away_from_threat(animal, target_player.position_x, target_player.position_y, 350.0, rng);
                            transition_to_state(animal, AnimalState::Fleeing, current_time, None, "low health flee");
                            log::info!("Snowy Owl {} fleeing due to low health ({:.1}%)", animal.id, health_percent * 100.0);
                            return Ok(());
                        }
                        
                        // Continue chasing - handled by execute_chase in core
                    } else {
                        // Target lost
                        transition_to_state(animal, AnimalState::Flying, current_time, None, "target lost");
                    }
                } else {
                    // No target
                    transition_to_state(animal, AnimalState::Flying, current_time, None, "no target");
                }
            },
            
            AnimalState::Fleeing => {
                animal.is_flying = true; // Always fly while fleeing
                
                // Check if reached flee destination
                if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
                    let distance_to_target_sq = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y);
                    
                    if distance_to_target_sq <= 60.0 * 60.0 {
                        // Reached flee destination - return to flying patrol
                        animal.investigation_x = None;
                        animal.investigation_y = None;
                        transition_to_state(animal, AnimalState::Flying, current_time, None, "flee complete");
                        log::debug!("Snowy Owl {} finished fleeing - returning to patrol", animal.id);
                    }
                } else {
                    // No flee target, timeout
                    let time_since_flee = current_time.to_micros_since_unix_epoch() - 
                                         animal.state_change_time.to_micros_since_unix_epoch();
                    if time_since_flee > 4_000_000 {
                        transition_to_state(animal, AnimalState::Flying, current_time, None, "flee timeout");
                    }
                }
            },
            
            _ => {} // Other states handled by core
        }
        
        Ok(())
    }

    fn execute_flee_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        dt: f32,
        _current_time: Timestamp,
        rng: &mut impl Rng,
    ) {
        animal.is_flying = true; // Always fly when fleeing
        
        let prev_x = animal.pos_x;
        let prev_y = animal.pos_y;
        
        if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
            // Use flying speed (sprint * 1.8)
            let flying_speed = stats.sprint_speed * 1.8;
            move_towards_target(ctx, animal, target_x, target_y, flying_speed, dt);
            
            // Handle getting stuck - pick new direction
            if detect_and_handle_stuck_movement(animal, prev_x, prev_y, 3.0, rng, "flee") {
                let new_angle = animal.direction_y.atan2(animal.direction_x);
                animal.investigation_x = Some(animal.pos_x + 300.0 * new_angle.cos());
                animal.investigation_y = Some(animal.pos_y + 300.0 * new_angle.sin());
            }
        } else {
            // No target - pick random flee direction
            let flee_angle = rng.gen::<f32>() * 2.0 * PI;
            let flee_distance = 300.0;
            animal.investigation_x = Some(animal.pos_x + flee_distance * flee_angle.cos());
            animal.investigation_y = Some(animal.pos_y + flee_distance * flee_angle.sin());
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
        // Use flying patrol when in the air, grounded idle when on ground
        if animal.is_flying {
            execute_flying_patrol(ctx, animal, stats, dt, rng);
        } else {
            execute_grounded_idle(ctx, animal, stats, dt, rng);
        }
    }

    fn should_chase_player(&self, _ctx: &ReducerContext, animal: &WildAnimal, _stats: &AnimalStats, player: &Player) -> bool {
        // Snowy owls only chase if player is within aggression range
        let distance_sq = get_distance_squared(
            animal.pos_x, animal.pos_y,
            player.position_x, player.position_y
        );
        
        distance_sq <= OWL_AGGRESSION_RANGE_SQUARED
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
        animal.is_flying = true; // Take off if not already
        
        let health_percent = animal.health / stats.max_health;
        
        if health_percent > stats.flee_trigger_health_percent {
            // Still healthy - retaliate aggressively
            animal.target_player_id = Some(attacker.identity);
            transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "owl retaliation");
            emit_species_sound(ctx, animal, attacker.identity, "retaliation");
            
            log::info!("Snowy Owl {} retaliating against attacker {} (Health: {:.1}%)", 
                      animal.id, attacker.identity, health_percent * 100.0);
        } else {
            // Low health - flee
            set_flee_destination_away_from_threat(animal, attacker.position_x, attacker.position_y, 350.0, rng);
            transition_to_state(animal, AnimalState::Fleeing, current_time, None, "low health flee");
            
            log::info!("Snowy Owl {} fleeing due to low health ({:.1}%)", 
                      animal.id, health_percent * 100.0);
        }
        
        Ok(())
    }
    
    fn can_be_tamed(&self) -> bool {
        false // Snowy owls cannot be tamed
    }
    
    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![]
    }
    
    fn get_chase_abandonment_multiplier(&self) -> f32 {
        2.0 // Give up at 2x aggression range (400px)
    }
}
