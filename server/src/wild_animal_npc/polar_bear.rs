/******************************************************************************
 *                                                                            *
 * Polar Bear Behavior - Alpine Apex Predator                                *
 *                                                                            *
 * Polar Bears are massive, solitary apex predators found in alpine biomes.  *
 * They are extremely dangerous, with high health and devastating attacks.   *
 * Unlike wolves, they hunt alone and never flee from combat.                *
 *                                                                            *
 * Characteristics:                                                          *
 * - Very high health (tank-like durability)                                 *
 * - High attack damage (devastating swipes)                                 *
 * - Solitary hunter (no pack behavior)                                      *
 * - Never flees - fights to the death                                       *
 * - Slower patrol but fast sprint when chasing                              *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Timestamp};
use std::f32::consts::PI;
use rand::Rng;
use log;

use crate::Player;
use crate::utils::get_distance_squared;
use crate::player as PlayerTableTrait;

use crate::fishing::is_water_tile;
use super::core::{
    AnimalBehavior, AnimalStats, AnimalState, MovementPattern, WildAnimal,
    move_towards_target, transition_to_state, emit_species_sound,
    is_player_in_chase_range, get_player_distance,
    set_flee_destination_away_from_threat,
    handle_fire_trap_escape, detect_and_handle_stuck_movement,
    is_position_in_shelter,
};

pub struct PolarBearBehavior;

impl AnimalBehavior for PolarBearBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 300.0, // Very tanky - requires significant effort to kill
            attack_damage: 35.0, // Devastating swipes
            attack_range: 68.0, // Reduced from 80 - still has reach due to size but gives players more room
            attack_speed_ms: 1200, // Slower but powerful attacks
            movement_speed: 160.0, // Slow patrol - bears are lumbering
            sprint_speed: 500.0, // Fast sprint when chasing - can catch players
            perception_range: 600.0, // Good predator senses
            perception_angle_degrees: 180.0, // Standard forward vision
            patrol_radius: 400.0, // Large territory
            chase_trigger_range: 500.0, // Will chase players from moderate distance
            flee_trigger_health_percent: 0.0, // NEVER flees - apex predator mentality
            hide_duration_ms: 0, // Bears don't hide
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
        _current_time: Timestamp,
        rng: &mut impl Rng,
    ) -> Result<f32, String> {
        let mut damage = stats.attack_damage;
        
        // Polar bears are apex predators - bonus damage
        damage += 10.0;
        
        // 30% chance to cause bleeding (savage claws)
        if rng.gen::<f32>() < 0.30 {
            if let Err(e) = crate::active_effects::apply_bleeding_effect(
                ctx, 
                target_player.identity, 
                20.0, // Total bleed damage - higher than wolf
                12.0, // Duration: 12 seconds
                2.0   // Tick every 2 seconds
            ) {
                log::error!("Failed to apply bleeding effect from polar bear attack: {}", e);
            } else {
                log::info!("Polar Bear {} mauls player {} with bleeding claws!", animal.id, target_player.identity);
            }
        }
        
        // 15% chance for a stunning blow (bear swipe knocks player down briefly)
        if rng.gen::<f32>() < 0.15 {
            log::info!("Polar Bear {} lands a stunning blow on player {}!", animal.id, target_player.identity);
            // Extra damage on stun
            damage += 5.0;
        }
        
        log::info!("Polar Bear {} mauls player {} for {:.1} damage", 
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
        // 🔥 FIRE TRAP ESCAPE LOGIC - Use centralized escape handler
        if let Some(player) = detected_player {
            if handle_fire_trap_escape(ctx, animal, player, current_time, rng) {
                return Ok(()); // Fire trap escape initiated - skip normal AI logic
            }
        }

        match animal.state {
            AnimalState::Patrolling => {
                if let Some(player) = detected_player {
                    // Polar bears are AGGRESSIVE BY DEFAULT
                    if self.should_chase_player(ctx, animal, stats, player) {
                        transition_to_state(animal, AnimalState::Chasing, current_time, Some(player.identity), "apex predator chase");
                        
                        // 🔊 BEAR ROAR: Emit intimidating roar when starting to chase
                        emit_species_sound(ctx, animal, player.identity, "chase_start");
                        
                        log::info!("Polar Bear {} aggressively chasing player {} - apex predator attack!", 
                                  animal.id, player.identity);
                    }
                }
            },
            
            AnimalState::Chasing => {
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        // Check if should stop chasing (polar bears are persistent)
                        if !is_player_in_chase_range(animal, &target_player, stats) {
                            let distance = get_player_distance(animal, &target_player);
                            if distance > stats.chase_trigger_range * self.get_chase_abandonment_multiplier() {
                                transition_to_state(animal, AnimalState::Patrolling, current_time, None, "player escaped");
                                log::debug!("Polar Bear {} stopping chase - player too far", animal.id);
                            }
                        }
                    } else {
                        // Target lost
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "target lost");
                    }
                }
            },
            
            AnimalState::Alert => {
                // Bears don't stay alert long - they're aggressive
                let time_in_state = (current_time.to_micros_since_unix_epoch() -
                                    animal.state_change_time.to_micros_since_unix_epoch()) / 1000;
                
                if time_in_state > 1000 { // Only 1 second alert before chase
                    if let Some(player) = detected_player {
                        if self.should_chase_player(ctx, animal, stats, player) {
                            transition_to_state(animal, AnimalState::Chasing, current_time, Some(player.identity), "alert to chase");
                            emit_species_sound(ctx, animal, player.identity, "alert_to_chase");
                        } else {
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "alert timeout");
                        }
                    } else {
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "alert timeout - no target");
                    }
                }
            },
            
            AnimalState::Fleeing => {
                // Polar bears should rarely flee, but handle it if somehow in this state
                // Check if fled far enough to return to patrolling
                if let Some(investigation_x) = animal.investigation_x {
                    if let Some(investigation_y) = animal.investigation_y {
                        let distance_to_flee_target = get_distance_squared(
                            animal.pos_x, animal.pos_y,
                            investigation_x, investigation_y
                        );
                        
                        if distance_to_flee_target < 100.0 {
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "flee complete");
                            animal.investigation_x = None;
                            animal.investigation_y = None;
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
        // Polar bears rarely flee, but if they do (e.g., from fire)
        let prev_x = animal.pos_x;
        let prev_y = animal.pos_y;
        
        if animal.investigation_x.is_none() || animal.investigation_y.is_none() {
            let flee_angle = rng.gen::<f32>() * 2.0 * PI;
            let flee_distance = 300.0 + (rng.gen::<f32>() * 200.0);
            animal.investigation_x = Some(animal.pos_x + flee_distance * flee_angle.cos());
            animal.investigation_y = Some(animal.pos_y + flee_distance * flee_angle.sin());
        }
        
        if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
            move_towards_target(ctx, animal, target_x, target_y, stats.sprint_speed, dt);
            
            if detect_and_handle_stuck_movement(animal, prev_x, prev_y, 8.0, rng, "fleeing") {
                let new_angle = animal.direction_y.atan2(animal.direction_x);
                let flee_distance = 300.0;
                animal.investigation_x = Some(animal.pos_x + flee_distance * new_angle.cos());
                animal.investigation_y = Some(animal.pos_y + flee_distance * new_angle.sin());
            }
            
            let distance_to_target = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y).sqrt();
            let time_fleeing = current_time.to_micros_since_unix_epoch() - animal.state_change_time.to_micros_since_unix_epoch();
            
            if distance_to_target <= 80.0 || time_fleeing > 3_000_000 {
                animal.state = AnimalState::Patrolling;
                animal.target_player_id = None;
                animal.investigation_x = None;
                animal.investigation_y = None;
                animal.state_change_time = current_time;
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
        let prev_x = animal.pos_x;
        let prev_y = animal.pos_y;
        
        // Bears are slow and methodical when patrolling
        if rng.gen::<f32>() < 0.06 { // 6% chance to change direction - slow meandering
            let angle = rng.gen::<f32>() * 2.0 * PI;
            animal.direction_x = angle.cos();
            animal.direction_y = angle.sin();
        }
        
        let target_x = animal.pos_x + animal.direction_x * stats.movement_speed * dt;
        let target_y = animal.pos_y + animal.direction_y * stats.movement_speed * dt;
        
        // Avoid water and shelters
        if !is_water_tile(ctx, target_x, target_y) && 
           !is_position_in_shelter(ctx, target_x, target_y) {
            move_towards_target(ctx, animal, target_x, target_y, stats.movement_speed, dt);
            detect_and_handle_stuck_movement(animal, prev_x, prev_y, 5.0, rng, "patrol");
        } else {
            let angle = rng.gen::<f32>() * 2.0 * PI;
            animal.direction_x = angle.cos();
            animal.direction_y = angle.sin();
        }
    }

    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool {
        // 🐺 WOLF FUR INTIMIDATION: Even polar bears are somewhat cautious of wolf fur wearers
        if crate::armor::intimidates_animals(ctx, player.identity) {
            log::debug!("Polar Bear {} slightly intimidated by player {} - will still chase but more cautiously",
                       animal.id, player.identity);
            // Bears still chase, but at reduced range when player wears wolf fur
            let reduced_range = stats.chase_trigger_range * 0.6;
            let distance_sq = get_distance_squared(
                animal.pos_x, animal.pos_y,
                player.position_x, player.position_y
            );
            return distance_sq <= reduced_range.powi(2);
        }
        
        let distance_sq = get_distance_squared(
            animal.pos_x, animal.pos_y,
            player.position_x, player.position_y
        );
        
        // Polar bears are fearless - will chase at any health level
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
        // Polar bears ALWAYS retaliate - they never back down
        transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "polar bear retaliation");
        emit_species_sound(ctx, animal, attacker.identity, "retaliation");
        
        log::info!("Polar Bear {} enraged - retaliating against attacker {}!", 
                  animal.id, attacker.identity);
        
        Ok(())
    }
    
    fn can_be_tamed(&self) -> bool {
        false // Polar bears cannot be tamed - too dangerous
    }
    
    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![]
    }
    
    fn get_chase_abandonment_multiplier(&self) -> f32 {
        2.5 // Polar bears are persistent but not as much as wolves
    }
}
