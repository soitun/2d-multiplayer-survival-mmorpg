/******************************************************************************
 *                                                                            *
 * Vole Behavior - Tiny Skittish Burrowing Rodent                            *
 *                                                                            *
 * Voles are extremely timid creatures that flee at the first sign of        *
 * danger. They can burrow underground to hide from predators and players.   *
 * Found in tundra and grassland areas.                                      *
 *                                                                            *
 * Characteristics:                                                          *
 * - Very low health (fragile prey animal)                                   *
 * - Almost no attack damage (basically harmless)                            *
 * - Extremely fast when fleeing                                             *
 * - Immediately flees when any player is detected                           *
 * - Can burrow underground to hide                                          *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Timestamp};
use std::f32::consts::PI;
use rand::Rng;
use log;

use crate::Player;
use crate::utils::get_distance_squared;

use super::core::{
    AnimalBehavior, AnimalStats, AnimalState, MovementPattern, WildAnimal,
    move_towards_target, transition_to_state, 
    get_player_distance, set_flee_destination_away_from_threat,
    detect_and_handle_stuck_movement, handle_water_unstuck,
};

// Vole-specific constants
const VOLE_BURROW_DURATION_MS: u64 = 8000; // Hide underground for 8 seconds
const VOLE_FLEE_DISTANCE: f32 = 400.0; // How far to flee

pub struct VoleBehavior;

impl AnimalBehavior for VoleBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 35.0, // INCREASED from 20 - survives weak attacks so players can see them scurry!
            attack_damage: 2.0, // Basically harmless - tiny nibble
            attack_range: 30.0, // Very short range
            attack_speed_ms: 1500, // Slow attacks (voles don't fight)
            movement_speed: 140.0, // INCREASED - fast scurrying patrol for better visibility
            sprint_speed: 280.0, // INCREASED from 220 - VERY fast when fleeing
            perception_range: 250.0, // INCREASED - more alert and watchful
            perception_angle_degrees: 300.0, // INCREASED - nearly 360 awareness
            patrol_radius: 80.0, // INCREASED - more visible patrol area
            chase_trigger_range: 0.0, // NEVER chases - always flees
            flee_trigger_health_percent: 100.0, // Always flee when player detected
            hide_duration_ms: VOLE_BURROW_DURATION_MS, // Burrow duration
        }
    }

    fn get_movement_pattern(&self) -> MovementPattern {
        MovementPattern::Wander
    }

    fn execute_attack_effects(
        &self,
        _ctx: &ReducerContext,
        animal: &mut WildAnimal,
        target_player: &Player,
        stats: &AnimalStats,
        current_time: Timestamp,
        rng: &mut impl Rng,
    ) -> Result<f32, String> {
        // Voles don't really attack - if somehow they do, flee immediately after
        let damage = stats.attack_damage;
        
        // Always flee after "attacking" (defensive bite)
        set_flee_destination_away_from_threat(animal, target_player.position_x, target_player.position_y, VOLE_FLEE_DISTANCE, rng);
        transition_to_state(animal, AnimalState::Fleeing, current_time, None, "defensive bite flee");
        
        log::debug!("Vole {} defensive bite on player {} - fleeing immediately", animal.id, target_player.identity);
        
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
            AnimalState::Patrolling | AnimalState::Idle => {
                // Voles ALWAYS flee when a player is detected - highly visible scurrying behavior!
                if let Some(player) = detected_player {
                    let distance = get_player_distance(animal, player);
                    
                    // Primarily flee (visible behavior) - rarely burrow (with visual/audio feedback now!)
                    // Only 10% chance to burrow if player is VERY close
                    if distance < 100.0 && rng.gen::<f32>() < 0.1 {
                        // Rare emergency burrow - player is right on top of vole
                        animal.hide_until = Some(Timestamp::from_micros_since_unix_epoch(
                            current_time.to_micros_since_unix_epoch() + (stats.hide_duration_ms as i64 * 1000)
                        ));
                        transition_to_state(animal, AnimalState::Burrowed, current_time, None, "emergency burrow");
                        
                        // 🔊 BURROW SOUND: Emit digging sound when vole burrows
                        crate::sound_events::emit_animal_burrow_sound(ctx, animal.pos_x, animal.pos_y, player.identity);
                        
                        log::debug!("Vole {} burrowing to hide from player {} at distance {:.1}", 
                                   animal.id, player.identity, distance);
                    } else {
                        // 90% chance to flee - players should see voles scurrying away!
                        set_flee_destination_away_from_threat(animal, player.position_x, player.position_y, VOLE_FLEE_DISTANCE, rng);
                        transition_to_state(animal, AnimalState::Fleeing, current_time, None, "player spotted flee");
                        log::debug!("Vole {} fleeing from player {} at distance {:.1}", 
                                   animal.id, player.identity, distance);
                    }
                }
            },
            
            AnimalState::Burrowed => {
                // Check if hide duration has elapsed
                if let Some(hide_until) = animal.hide_until {
                    if current_time >= hide_until {
                        // Emerge from burrow
                        animal.hide_until = None;
                        
                        // If player still nearby, flee instead of patrolling
                        if let Some(player) = detected_player {
                            set_flee_destination_away_from_threat(animal, player.position_x, player.position_y, VOLE_FLEE_DISTANCE, rng);
                            transition_to_state(animal, AnimalState::Fleeing, current_time, None, "emerge and flee");
                            log::debug!("Vole {} emerging from burrow - player still nearby, fleeing!", animal.id);
                        } else {
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "emerge safe");
                            log::debug!("Vole {} emerging from burrow - coast is clear", animal.id);
                        }
                    }
                }
            },
            
            AnimalState::Fleeing => {
                // Check if reached flee destination or should burrow
                if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
                    let distance_to_target_sq = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y);
                    
                    if distance_to_target_sq <= 40.0 * 40.0 {
                        // Reached flee destination
                        animal.investigation_x = None;
                        animal.investigation_y = None;
                        
                        // If player is still in perception range, burrow
                        if let Some(player) = detected_player {
                            if get_player_distance(animal, player) < stats.perception_range {
                                animal.hide_until = Some(Timestamp::from_micros_since_unix_epoch(
                                    current_time.to_micros_since_unix_epoch() + (stats.hide_duration_ms as i64 * 1000)
                                ));
                                transition_to_state(animal, AnimalState::Burrowed, current_time, None, "flee destination burrow");
                                
                                // 🔊 BURROW SOUND: Emit digging sound when vole burrows
                                crate::sound_events::emit_animal_burrow_sound(ctx, animal.pos_x, animal.pos_y, player.identity);
                                
                                log::debug!("Vole {} reached flee destination but player nearby - burrowing!", animal.id);
                            } else {
                                transition_to_state(animal, AnimalState::Patrolling, current_time, None, "flee successful");
                            }
                        } else {
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "flee successful");
                        }
                    }
                } else {
                    // No target, timeout after 3 seconds
                    let time_since_flee = current_time.to_micros_since_unix_epoch() - 
                                         animal.state_change_time.to_micros_since_unix_epoch();
                    if time_since_flee > 3_000_000 {
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "flee timeout");
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
        let prev_x = animal.pos_x;
        let prev_y = animal.pos_y;
        
        if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
            // Sprint speed for fleeing - voles are FAST
            move_towards_target(ctx, animal, target_x, target_y, stats.sprint_speed, dt);
            
            // Handle getting stuck
            handle_water_unstuck(ctx, animal, target_x, target_y, prev_x, prev_y, 3.0, VOLE_FLEE_DISTANCE, rng);
        } else {
            // No target - head toward spawn
            move_towards_target(ctx, animal, animal.spawn_x, animal.spawn_y, stats.sprint_speed, dt);
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
        let prev_x = animal.pos_x;
        let prev_y = animal.pos_y;
        
        // Quick, erratic movements - voles are nervous
        if rng.gen::<f32>() < 0.25 { // 25% chance to change direction
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
            detect_and_handle_stuck_movement(animal, prev_x, prev_y, 2.0, rng, "patrol");
        } else {
            // Pick new direction if blocked
            let angle = rng.gen::<f32>() * 2.0 * PI;
            animal.direction_x = angle.cos();
            animal.direction_y = angle.sin();
        }
    }

    fn should_chase_player(&self, _ctx: &ReducerContext, _animal: &WildAnimal, _stats: &AnimalStats, _player: &Player) -> bool {
        // Voles NEVER chase - they only flee
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
        // When hit, primarily flee (more visible) - burrow now has visual/audio feedback!
        if rng.gen::<f32>() < 0.15 {
            // 15% chance to panic burrow
            animal.hide_until = Some(Timestamp::from_micros_since_unix_epoch(
                current_time.to_micros_since_unix_epoch() + (stats.hide_duration_ms as i64 * 1000)
            ));
            transition_to_state(animal, AnimalState::Burrowed, current_time, None, "panic burrow");
            
            // 🔊 BURROW SOUND: Emit digging sound when vole panic burrows
            crate::sound_events::emit_animal_burrow_sound(ctx, animal.pos_x, animal.pos_y, attacker.identity);
            
            log::info!("Vole {} panic burrowing after being hit!", animal.id);
        } else {
            // 85% chance to flee in panic (more visible behavior)
            set_flee_destination_away_from_threat(animal, attacker.position_x, attacker.position_y, VOLE_FLEE_DISTANCE * 1.5, rng);
            transition_to_state(animal, AnimalState::Fleeing, current_time, None, "panic flee");
            log::info!("Vole {} panic fleeing after being hit!", animal.id);
        }
        
        Ok(())
    }
    
    fn can_be_tamed(&self) -> bool {
        false // Voles are too skittish to tame
    }
    
    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![]
    }
    
    fn get_chase_abandonment_multiplier(&self) -> f32 {
        1.0 // Doesn't matter - voles never chase
    }
}
