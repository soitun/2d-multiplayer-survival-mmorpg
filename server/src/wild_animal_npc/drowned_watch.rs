/******************************************************************************
 *                                                                            *
 * Drowned Watch Behavior - Night Brute Enemy                                *
 *                                                                            *
 * Slow, heavy threat and primary structure attacker.                        *
 * Moves deliberately, doesn't chase far, but deals massive damage.          *
 *                                                                            *
 * Key behaviors:                                                             *
 * - Spawns only at night, very rare (max 1 per player area)                 *
 * - Ring C only (35-50 tiles from player)                                   *
 * - Requires player camping (60+ seconds stationary or in base)             *
 * - Very slow but high durability and damage                                *
 * - Primary structure attacker - targets doors first, then walls            *
 * - Stops attacking structures if player exits base or engages directly     *
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
};

pub struct DrownedWatchBehavior;

// DrownedWatch-specific constants
const STRUCTURE_ATTACK_DAMAGE: f32 = 35.0; // Heavy damage to structures
const STRUCTURE_ATTACK_RANGE: f32 = 100.0; // Range to attack structures
const MAX_CHASE_DISTANCE: f32 = 400.0; // Won't chase far from original target
const PLAYER_DISENGAGE_DISTANCE: f32 = 150.0; // If player gets this close while attacking structure, switch to player

impl AnimalBehavior for DrownedWatchBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 400.0, // Very high health - takes a lot to kill
            attack_damage: 50.0, // Heavy damage against players
            attack_range: 90.0, // Extended melee reach
            attack_speed_ms: 1200, // Faster attacks
            movement_speed: 240.0, // DOUBLED: Faster patrol
            sprint_speed: 360.0, // DOUBLED: Faster chase
            perception_range: 500.0, // Extended detection
            perception_angle_degrees: 220.0, // Wider awareness
            patrol_radius: 300.0, // Patrols larger area
            chase_trigger_range: 450.0, // Extended chase range
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
        let mut damage = stats.attack_damage;
        
        // DrownedWatch has a chance to stun (knockback effect)
        if rng.gen::<f32>() < 0.25 {
            // TODO: Apply stun/knockback when that system exists
            log::info!("DrownedWatch {} delivers a stunning blow to player {}!", animal.id, target_player.identity);
            damage += 10.0; // Bonus damage on stunning hit
        }
        
        log::info!("DrownedWatch {} crushes player {} for {} damage", animal.id, target_player.identity, damage);
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
                    // Check if player is camping (inside building) - prioritize structure attack
                    if player.is_inside_building {
                        // Look for structures to attack (doors preferred)
                        // For now, chase toward the player's base
                        transition_to_state(animal, AnimalState::Chasing, current_time, Some(player.identity), "player camping - approach base");
                        emit_species_sound(ctx, animal, player.identity, "chase_start");
                        log::debug!("DrownedWatch {} approaching camping player's base", animal.id);
                    } else {
                        // Player not camping - slowly approach
                        transition_to_state(animal, AnimalState::Chasing, current_time, Some(player.identity), "detected player");
                        emit_species_sound(ctx, animal, player.identity, "chase_start");
                    }
                }
            },
            
            AnimalState::Chasing => {
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        let distance = get_player_distance(animal, &target_player);
                        
                        // DrownedWatch doesn't chase far
                        if distance > MAX_CHASE_DISTANCE {
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "won't chase far");
                            return Ok(());
                        }
                        
                        // If player is camping and we're near the base, look for structures
                        if target_player.is_inside_building && distance < STRUCTURE_ATTACK_RANGE * 2.0 {
                            // Transition to structure attack mode (handled by structure attack system)
                            // The actual structure finding logic will be in the structure attack helper
                        }
                    } else {
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "target lost");
                    }
                }
            },
            
            AnimalState::AttackingStructure => {
                // Check if player has exited the building or engaged directly
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        let distance = get_player_distance(animal, &target_player);
                        
                        // If player exits building or gets very close, switch to attacking player
                        if !target_player.is_inside_building || distance < PLAYER_DISENGAGE_DISTANCE {
                            transition_to_state(animal, AnimalState::Chasing, current_time, Some(target_id), "player exited/engaged - switch to player");
                            animal.target_structure_id = None;
                            animal.target_structure_type = None;
                            log::debug!("DrownedWatch {} stops attacking structure - targeting player", animal.id);
                        }
                    }
                }
                
                // If structure is destroyed, find another or chase player
                if animal.target_structure_id.is_none() {
                    if let Some(target_id) = animal.target_player_id {
                        transition_to_state(animal, AnimalState::Chasing, current_time, Some(target_id), "structure destroyed");
                    } else {
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "no targets");
                    }
                }
            },
            
            AnimalState::Attacking => {
                // After attack, continue chasing (slowly)
                if !can_attack(animal, current_time, stats) {
                    if let Some(target_id) = animal.target_player_id {
                        transition_to_state(animal, AnimalState::Chasing, current_time, Some(target_id), "post-attack");
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
        // DrownedWatch NEVER flees - stands ground
        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "brutes don't flee");
    }

    fn execute_patrol_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        dt: f32,
        rng: &mut impl Rng,
    ) {
        // Slow, deliberate patrol
        execute_standard_patrol(ctx, animal, stats, dt, rng);
    }

    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool {
        if player.is_dead {
            return false;
        }
        
        let distance = get_player_distance(animal, player);
        // Only chase if relatively close - DrownedWatch is a territorial threat
        distance < stats.chase_trigger_range && distance < MAX_CHASE_DISTANCE
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
        // When damaged, stop attacking structures and focus on the attacker
        animal.target_structure_id = None;
        animal.target_structure_type = None;
        transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "damaged - focus attacker");
        emit_species_sound(ctx, animal, attacker.identity, "chase_start");
        log::debug!("DrownedWatch {} turns toward attacker {}", animal.id, attacker.identity);
        Ok(())
    }

    fn can_be_tamed(&self) -> bool {
        false
    }

    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![]
    }

    fn get_chase_abandonment_multiplier(&self) -> f32 {
        1.0 // Gives up chase at exactly chase range (doesn't pursue far)
    }
}

/// Get structure damage for DrownedWatch attacks
pub fn get_drowned_watch_structure_damage() -> f32 {
    STRUCTURE_ATTACK_DAMAGE
}
