/******************************************************************************
 *                                                                            *
 * Wolverine Behavior - Fearless Aggressive Predator                         *
 *                                                                            *
 * Wolverines are notoriously aggressive and fearless predators. Despite     *
 * their relatively small size, they will attack animals many times their    *
 * size and NEVER back down from a fight. They are solitary hunters.         *
 *                                                                            *
 * Characteristics:                                                          *
 * - NEVER flees (0% flee threshold - fights to the death)                   *
 * - Attacks on sight - extremely aggressive                                 *
 * - High damage for their size                                              *
 * - Medium health but relentless                                            *
 * - Found in tundra, alpine, and arctic regions                             *
 * - Ignores wolf fur intimidation (too fearless to care)                    *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Timestamp, Table};
use std::f32::consts::PI;
use rand::Rng;
use log;

use crate::Player;
use crate::player as PlayerTableTrait;
use crate::utils::get_distance_squared;

use super::core::{
    AnimalBehavior, AnimalStats, AnimalState, MovementPattern, WildAnimal,
    move_towards_target, transition_to_state, emit_species_sound,
    get_player_distance, is_player_in_chase_range,
    detect_and_handle_stuck_movement, update_animal_position,
};

pub struct WolverineBehavior;

impl AnimalBehavior for WolverineBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 150.0, // Tough for their size
            attack_damage: 28.0, // High damage - wolverines are vicious
            attack_range: 86.0, // Increased from 75 to compensate for collision pushback preventing hits
            attack_speed_ms: 700, // Fast, ferocious attacks
            movement_speed: 120.0, // Steady patrol speed
            sprint_speed: 280.0, // Fast chase - wolverines are quick
            perception_range: 350.0, // Good awareness
            perception_angle_degrees: 200.0, // Wide field of view
            patrol_radius: 200.0, // Large territory
            chase_trigger_range: 300.0, // Aggressive - attacks from far
            flee_trigger_health_percent: 0.0, // NEVER FLEES - fights to death!
            hide_duration_ms: 0, // No hiding - wolverines don't hide
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
        _rng: &mut impl Rng,
    ) -> Result<f32, String> {
        let damage = stats.attack_damage;
        
        // Wolverines are relentless - they ALWAYS continue attacking
        animal.state = AnimalState::Chasing;
        animal.target_player_id = Some(target_player.identity);
        
        // Slight lunge forward after attack
        let lunge_distance = 20.0;
        let dx = target_player.position_x - animal.pos_x;
        let dy = target_player.position_y - animal.pos_y;
        let distance = (dx * dx + dy * dy).sqrt();
        if distance > 0.0 {
            let new_x = animal.pos_x + (dx / distance) * lunge_distance;
            let new_y = animal.pos_y + (dy / distance) * lunge_distance;
            update_animal_position(animal, new_x, new_y);
        }
        
        // Emit aggressive sound
        emit_species_sound(ctx, animal, target_player.identity, "attack");
        
        log::info!("Wolverine {} viciously attacks player {} for {:.1} damage - continuing assault!", 
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
        _rng: &mut impl Rng,
    ) -> Result<(), String> {
        match animal.state {
            AnimalState::Patrolling | AnimalState::Idle => {
                // Wolverines attack ANY player they detect
                if let Some(player) = detected_player {
                    // Wolverines IGNORE wolf fur intimidation - they're too fearless
                    // (Unlike other animals, we skip the intimidation check)
                    
                    if is_player_in_chase_range(animal, player, stats) {
                        // Attack immediately!
                        transition_to_state(animal, AnimalState::Chasing, current_time, Some(player.identity), "aggressive attack");
                        emit_species_sound(ctx, animal, player.identity, "chase_start");
                        
                        log::info!("Wolverine {} spotted player {} at {:.1}px - attacking!", 
                                  animal.id, player.identity, get_player_distance(animal, player));
                    }
                }
            },
            
            AnimalState::Chasing => {
                // Wolverines are RELENTLESS - they never give up chase easily
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        let distance = get_player_distance(animal, &target_player);
                        
                        // Only stop if player gets VERY far away (4x chase range)
                        // Wolverines are incredibly persistent
                        if distance > (stats.chase_trigger_range * 4.0) {
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "target escaped far");
                            log::info!("Wolverine {} lost target - player escaped very far ({}px)", animal.id, distance);
                        }
                        // Otherwise, keep chasing - wolverines don't stop!
                    } else {
                        // Target completely gone
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "target lost");
                    }
                } else {
                    // No target, look for new one
                    if let Some(player) = detected_player {
                        animal.target_player_id = Some(player.identity);
                    } else {
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "no target");
                    }
                }
            },
            
            // Wolverines should NEVER be in fleeing state, but handle it anyway
            AnimalState::Fleeing => {
                // Wolverines don't flee - immediately switch back to attacking
                if let Some(player) = detected_player {
                    transition_to_state(animal, AnimalState::Chasing, current_time, Some(player.identity), "refuses to flee");
                    log::warn!("Wolverine {} was fleeing but refuses - attacking instead!", animal.id);
                } else {
                    transition_to_state(animal, AnimalState::Patrolling, current_time, None, "no target to attack");
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
        current_time: Timestamp,
        _rng: &mut impl Rng,
    ) {
        // Wolverines should NEVER flee, but if somehow they're in flee state,
        // just patrol normally and wait for the AI to correct it
        log::warn!("Wolverine {} in flee state - this should never happen! Patrolling instead.", animal.id);
        
        // Patrol toward spawn
        move_towards_target(ctx, animal, animal.spawn_x, animal.spawn_y, stats.movement_speed, dt);
        
        // Force state correction
        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "flee override");
    }

    fn execute_patrol_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        dt: f32,
        rng: &mut impl Rng,
    ) {
        let prev_x = animal.pos_x;
        let prev_y = animal.pos_y;
        
        // Territorial wandering
        if rng.gen::<f32>() < 0.12 { // 12% chance to change direction
            let angle = rng.gen::<f32>() * 2.0 * PI;
            animal.direction_x = angle.cos();
            animal.direction_y = angle.sin();
        }
        
        let target_x = animal.pos_x + animal.direction_x * stats.movement_speed * dt;
        let target_y = animal.pos_y + animal.direction_y * stats.movement_speed * dt;
        
        // Check if target position is safe
        if !super::core::is_position_in_shelter(ctx, target_x, target_y) &&
           !crate::fishing::is_water_tile(ctx, target_x, target_y) {
            move_towards_target(ctx, animal, target_x, target_y, stats.movement_speed, dt);
            detect_and_handle_stuck_movement(animal, prev_x, prev_y, 3.0, rng, "patrol");
        } else {
            // Pick new direction if blocked
            let angle = rng.gen::<f32>() * 2.0 * PI;
            animal.direction_x = angle.cos();
            animal.direction_y = angle.sin();
        }
    }

    fn should_chase_player(&self, _ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool {
        // Wolverines ALWAYS want to chase if in range
        // They IGNORE wolf fur intimidation - they're too fearless to care!
        let distance_sq = get_distance_squared(
            animal.pos_x, animal.pos_y,
            player.position_x, player.position_y
        );
        
        distance_sq <= stats.chase_trigger_range.powi(2)
    }

    fn handle_damage_response(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        attacker: &Player,
        _stats: &AnimalStats,
        current_time: Timestamp,
        _rng: &mut impl Rng,
    ) -> Result<(), String> {
        // Wolverines ALWAYS counter-attack when hit - they never back down
        // Even at critical health, they fight!
        
        transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "enraged counter-attack");
        emit_species_sound(ctx, animal, attacker.identity, "retaliation");
        
        log::info!("Wolverine {} enraged by attack! Counter-attacking player {} (health: {:.1}%)", 
                  animal.id, attacker.identity, (animal.health / 150.0) * 100.0);
        
        Ok(())
    }
    
    fn can_be_tamed(&self) -> bool {
        false // Wolverines are too aggressive and wild to tame
    }
    
    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![]
    }
    
    fn get_chase_abandonment_multiplier(&self) -> f32 {
        4.0 // Wolverines are VERY persistent - only give up at 4x normal range
    }
}
