/******************************************************************************
 *                                                                            *
 * Cable Viper Behavior - Ambush Predator with Persistent Venom              *
 *                                                                            *
 * Vipers are slow ambush predators that inject persistent venom that        *
 * requires Anti-Venom to cure and can strike from long range with           *
 * lightning-fast dashes.                                                    *
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
    AnimalBehavior, AnimalStats, AnimalState, MovementPattern, WildAnimal,
    move_towards_target,
    transition_to_state,
    emit_species_sound, get_player_distance,
    set_flee_destination_away_from_threat,
    detect_and_handle_stuck_movement,
};

pub struct CableViperBehavior;

// Viper-specific trait (for future extensions if needed)
pub trait ViperBehavior {
    // Vipers have simple behavior - no special methods needed for now
}

impl ViperBehavior for CableViperBehavior {}

impl AnimalBehavior for CableViperBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 200.0, // 2-3 bow shots to kill
            attack_damage: 22.0, // Balanced melee damage (venom provides additional DOT)
            attack_range: 95.0, // Reduced from 120 - still has long strike range but less oppressive
            attack_speed_ms: 1500, // Slower but devastating strikes
            movement_speed: 60.0,  // Very slow movement (ambush predator)
            sprint_speed: 400.0,   // Lightning fast dash when attacking
            perception_range: 300.0, // Medium detection range
            perception_angle_degrees: 360.0, // Vibration sensing
            patrol_radius: 60.0, // 2m figure-eight
            chase_trigger_range: 250.0, // Chase range
            flee_trigger_health_percent: 0.1, // Only flees when critically wounded (10%)
            hide_duration_ms: 0, // No burrowing behavior
        }
    }

    fn get_movement_pattern(&self) -> MovementPattern {
        MovementPattern::FigureEight
    }

    fn execute_attack_effects(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        target_player: &Player,
        stats: &AnimalStats,
        _current_time: Timestamp,
        _rng: &mut impl Rng,
    ) -> Result<f32, String> {
        let damage = stats.attack_damage;
        
        // Apply persistent venom damage over time (lasts until cured with Anti-Venom)
        if let Err(e) = crate::active_effects::apply_venom_effect(
            ctx,
            target_player.identity,
            f32::MAX, // Infinite damage pool - will only be stopped by Anti-Venom
            86400.0 * 365.0, // Duration: 1 year (effectively permanent until cured)
            5.0   // Tick every 5 seconds for slow but steady damage
        ) {
            log::error!("Failed to apply persistent venom effect from viper strike: {}", e);
        } else {
            log::info!("Cable Viper {} injects deadly persistent venom into player {}! Only Anti-Venom can cure this.", animal.id, target_player.identity);
        }
        
        log::info!("Cable Viper {} strikes with venomous fangs!", animal.id);
        
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
            AnimalState::Patrolling => {
                if let Some(player) = detected_player {
                    let distance = super::core::get_player_distance(animal, player);
                    
                    log::debug!("Cable Viper {} evaluating player at {:.1}px", animal.id, distance);
                    
                    if distance <= stats.attack_range {
                        // Close enough to strike - transition to chasing for melee attack
                        super::core::transition_to_state(animal, AnimalState::Chasing, current_time, Some(player.identity), "melee attack mode");
                        
                        // 🔊 SNAKE GROWL: Emit menacing hiss when entering strike range
                        super::core::emit_species_sound(ctx, animal, player.identity, "strike_range");
                        
                        log::debug!("Cable Viper {} in strike range - entering melee attack mode", animal.id);
                    } else if distance <= stats.chase_trigger_range {
                        // Not in strike range, start chasing to get closer
                        super::core::transition_to_state(animal, AnimalState::Chasing, current_time, Some(player.identity), "stalking");
                        
                        // 🔊 SNAKE GROWL: Emit threatening hiss when starting to stalk
                        super::core::emit_species_sound(ctx, animal, player.identity, "stalk");
                        
                        log::debug!("Cable Viper {} stalking player {}", animal.id, player.identity);
                    }
                }
            },
            
            AnimalState::Chasing => {
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        let distance = super::core::get_player_distance(animal, &target_player);
                        
                        // Only stop chasing if player gets very far away
                        if distance > (stats.chase_trigger_range * 1.5) {
                            super::core::transition_to_state(animal, AnimalState::Patrolling, current_time, None, "player too far");
                            log::debug!("Cable Viper {} stopping chase - player too far", animal.id);
                        }
                    } else {
                        // Target lost
                        super::core::transition_to_state(animal, AnimalState::Patrolling, current_time, None, "target lost");
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
                            super::core::transition_to_state(animal, AnimalState::Patrolling, current_time, None, "reached flee destination");
                            animal.investigation_x = None;
                            animal.investigation_y = None;
                            log::debug!("Cable Viper {} finished fleeing - returning to patrol", animal.id);
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
        
        // Pick a random direction to flee (don't return to spawn)
        if animal.investigation_x.is_none() || animal.investigation_y.is_none() {
            let flee_angle = rng.gen::<f32>() * 2.0 * PI;
            let flee_distance = 300.0 + (rng.gen::<f32>() * 200.0); // 6-10m flee
            animal.investigation_x = Some(animal.pos_x + flee_distance * flee_angle.cos());
            animal.investigation_y = Some(animal.pos_y + flee_distance * flee_angle.sin());
        }
        
        if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
            move_towards_target(ctx, animal, target_x, target_y, stats.sprint_speed, dt);
            
            // Check if stuck - use centralized handler
            if detect_and_handle_stuck_movement(animal, prev_x, prev_y, 5.0, rng, "fleeing") {
                // Update investigation target if direction changed
                let new_angle = animal.direction_y.atan2(animal.direction_x);
                let flee_distance = 300.0;
                animal.investigation_x = Some(animal.pos_x + flee_distance * new_angle.cos());
                animal.investigation_y = Some(animal.pos_y + flee_distance * new_angle.sin());
            }
            
            // Check if reached flee destination or fled long enough
            let distance_to_target = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y).sqrt();
            let time_fleeing = current_time.to_micros_since_unix_epoch() - animal.state_change_time.to_micros_since_unix_epoch();
            
            if distance_to_target <= 50.0 || time_fleeing > 3_000_000 { // 3 seconds max flee
                animal.state = AnimalState::Patrolling;
                animal.target_player_id = None;
                animal.investigation_x = None;
                animal.investigation_y = None;
                animal.state_change_time = current_time;
                log::debug!("Cable Viper {} finished fleeing - continuing patrol", animal.id);
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
        // Store previous position to detect if stuck
        let prev_x = animal.pos_x;
        let prev_y = animal.pos_y;
        
        // Random wandering instead of fixed spawn-based pattern
        if rng.gen::<f32>() < 0.15 { // 15% chance to change direction
            let angle = rng.gen::<f32>() * 2.0 * PI;
            animal.direction_x = angle.cos();
            animal.direction_y = angle.sin();
        }
        
        let target_x = animal.pos_x + animal.direction_x * stats.movement_speed * dt;
        let target_y = animal.pos_y + animal.direction_y * stats.movement_speed * dt;
        
        // Check if target position is safe (avoid shelters and water)
        if !super::core::is_position_in_shelter(ctx, target_x, target_y) &&
           !crate::fishing::is_water_tile(ctx, target_x, target_y) {
            move_towards_target(ctx, animal, target_x, target_y, stats.movement_speed, dt);
            
            // Check if stuck - use centralized handler
            detect_and_handle_stuck_movement(animal, prev_x, prev_y, 3.0, rng, "patrol");
        } else {
            // If target position is blocked, pick a new random direction
            let angle = rng.gen::<f32>() * 2.0 * PI;
            animal.direction_x = angle.cos();
            animal.direction_y = angle.sin();
        }
    }

    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, _player: &Player) -> bool {
        // 🐺 WOLF FUR INTIMIDATION: Animals are intimidated by players wearing wolf fur
        if crate::armor::intimidates_animals(ctx, _player.identity) {
            log::debug!("🐍 Viper {} intimidated by player {} wearing wolf fur - will not chase",
                       animal.id, _player.identity);
            return false;
        }
        
        let distance_sq = get_distance_squared(
            animal.pos_x, animal.pos_y,
            _player.position_x, _player.position_y
        );
        
        // Vipers are ambush predators - attack when in range
        distance_sq <= stats.chase_trigger_range.powi(2)
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
        // 🐍 CABLE VIPER DEFENSIVE RESPONSE: Assess threat and respond accordingly
        let health_percent = animal.health / stats.max_health;
        let distance_to_attacker = get_player_distance(animal, attacker);
        
        // Vipers are defensive but will fight back when cornered
        if health_percent < 0.3 {
            // Very low health - definitely flee
            set_flee_destination_away_from_threat(animal, attacker.position_x, attacker.position_y, 400.0, rng);
            transition_to_state(animal, AnimalState::Fleeing, current_time, None, "critical health flee");
            
            log::info!("Cable Viper {} fleeing due to critical health ({:.1}%)", 
                      animal.id, health_percent * 100.0);
        } else if distance_to_attacker <= 150.0 {
            // Close range - fight back with venom
            transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "viper retaliation");
            emit_species_sound(ctx, animal, attacker.identity, "retaliation");
            
            log::info!("Cable Viper {} retaliating at close range against {} (Health: {:.1}%)", 
                      animal.id, attacker.identity, health_percent * 100.0);
        } else {
            // Far range - retreat and reassess
            set_flee_destination_away_from_threat(animal, attacker.position_x, attacker.position_y, 200.0, rng);
            transition_to_state(animal, AnimalState::Fleeing, current_time, None, "tactical retreat");
            
            log::info!("Cable Viper {} tactically retreating from distant threat", animal.id);
        }
        
        Ok(())
    }
    
    fn can_be_tamed(&self) -> bool {
        false // Vipers are not tameable (too dangerous and solitary)
    }
    
    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![] // No taming foods for vipers
    }
    
    fn get_chase_abandonment_multiplier(&self) -> f32 {
        4.0 // Persistent in ranged mode - maintains distance at 400-600px without giving up
    }
}
