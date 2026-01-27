/******************************************************************************
 *                                                                            *
 * Caribou Behavior - Skittish Herd Herbivore                                *
 *                                                                            *
 * Caribou are large herbivores that live in herds in tundra and alpine      *
 * regions. They are skittish and will flee when players approach, running   *
 * very fast when spooked. They only become aggressive when critically       *
 * wounded (cornered), at which point they will charge and attack with       *
 * their antlers.                                                             *
 *                                                                            *
 * BEHAVIOR SUMMARY:                                                          *
 *   - Default: Slow patrol in herd, grazing behavior                        *
 *   - When player approaches: Get spooked and flee at high speed            *
 *   - When low health (<30%): Cornered - fights back aggressively           *
 *   - Tameable with vegetarian food (berries, vegetables, mushrooms)        *
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
    AnimalBehavior, AnimalStats, AnimalState, MovementPattern, WildAnimal, AnimalSpecies,
    move_towards_target, can_attack, transition_to_state, emit_species_sound,
    execute_standard_patrol, get_player_distance, is_player_in_chase_range, wild_animal,
    TAMING_PROTECT_RADIUS, ThreatType, detect_threats_to_owner, find_closest_threat,
    handle_generic_threat_targeting, detect_and_handle_stuck_movement, set_flee_destination_away_from_threat,
};

// Caribou-specific constants
const CARIBOU_SPOOK_DISTANCE: f32 = 350.0; // Distance at which caribou get spooked by players
const CARIBOU_SPOOK_DISTANCE_SQUARED: f32 = CARIBOU_SPOOK_DISTANCE * CARIBOU_SPOOK_DISTANCE;
const CARIBOU_HERD_DETECTION_RADIUS: f32 = 1400.0; // Large radius so scattered caribou can reconvene after fleeing
const CARIBOU_HERD_CLOSE_DISTANCE: f32 = 400.0; // Distance at which caribou consider themselves "close enough" to herd
const CARIBOU_LOW_HEALTH_THRESHOLD: f32 = 0.30; // Below 30% health, caribou fight back

pub struct CaribouBehavior;

// Caribou-specific trait (for future extensions)
pub trait CaribouTrait {
    // Caribou-specific methods if needed
}

impl CaribouTrait for CaribouBehavior {}

impl AnimalBehavior for CaribouBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 120.0, // Reduced for balanced hunting - ~4 hits with spear (25-35 damage)
            attack_damage: 30.0, // Strong antler charge when cornered
            attack_range: 80.0, // Decent range with antlers
            attack_speed_ms: 1500, // Moderate attack speed
            movement_speed: 100.0, // Slow patrol speed (grazing)
            sprint_speed: 550.0, // VERY fast when spooked - hard to catch
            perception_range: 400.0, // Good awareness of surroundings
            perception_angle_degrees: 270.0, // Wide field of view (prey animal)
            patrol_radius: 250.0, // Larger patrol area for grazing
            chase_trigger_range: 150.0, // Only "chase" when cornered (short range)
            flee_trigger_health_percent: 0.30, // Fight when below 30% health instead of fleeing
            hide_duration_ms: 0, // Caribou don't hide
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
        
        // Caribou antler charge - strong knockback
        log::info!("Caribou {} delivers antler charge to player {}!", 
                  animal.id, target_player.identity);
        
        // 20% chance to cause bleeding from antler wounds
        if rng.gen::<f32>() < 0.2 {
            if let Err(e) = crate::active_effects::apply_bleeding_effect(
                ctx, 
                target_player.identity, 
                15.0, // Moderate bleeding damage
                12.0, // Duration: 12 seconds
                3.0   // Tick every 3 seconds
            ) {
                log::error!("Failed to apply bleeding effect from caribou attack: {}", e);
            } else {
                log::info!("Caribou {} causes bleeding with antler charge!", animal.id);
            }
        }
        
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
        let health_percent = animal.health / stats.max_health;
        
        // 🦌 TAMED CARIBOU BEHAVIOR: Follow owner and protect them
        if let Some(owner_id) = animal.tamed_by {
            if let Some(player) = detected_player {
                if player.identity == owner_id {
                    // This is our owner - don't be afraid
                    if matches!(animal.state, AnimalState::Fleeing | AnimalState::Alert) {
                        transition_to_state(animal, AnimalState::Following, current_time, Some(owner_id), "owner detected - following");
                    }
                    return Ok(());
                }
            }
            
            // Check for threats to our owner
            if handle_generic_threat_targeting(ctx, animal, owner_id, current_time).is_some() {
                return Ok(());
            }
            
            // If in Following or Protecting state, let core taming system handle movement
            if matches!(animal.state, AnimalState::Following | AnimalState::Protecting) {
                return Ok(());
            }
            
            // Default to following if tamed
            transition_to_state(animal, AnimalState::Following, current_time, Some(owner_id), "tamed - defaulting to follow");
            return Ok(());
        }
        
        // 🦌 WILD CARIBOU BEHAVIOR
        match animal.state {
            AnimalState::Patrolling => {
                if let Some(player) = detected_player {
                    let distance_sq = get_distance_squared(
                        animal.pos_x, animal.pos_y,
                        player.position_x, player.position_y
                    );
                    
                    // Check if player is close enough to spook the caribou
                    if distance_sq <= CARIBOU_SPOOK_DISTANCE_SQUARED {
                        // Caribou are skittish - flee immediately!
                        set_flee_destination_away_from_threat(
                            animal, 
                            player.position_x, 
                            player.position_y, 
                            600.0, // Flee far away
                            rng
                        );
                        transition_to_state(animal, AnimalState::Fleeing, current_time, None, "spooked by player");
                        
                        // Emit spooked sound
                        emit_species_sound(ctx, animal, player.identity, "spooked");
                        
                        log::info!("🦌 Caribou {} spooked by player {} at distance {:.1}px - fleeing!", 
                                  animal.id, player.identity, distance_sq.sqrt());
                        
                        // Alert nearby herd members
                        alert_nearby_caribou_herd(ctx, animal, player.position_x, player.position_y, current_time);
                        
                        return Ok(());
                    }
                }
            },
            
            AnimalState::Fleeing => {
                // Check if we're cornered (low health while fleeing)
                if health_percent < CARIBOU_LOW_HEALTH_THRESHOLD {
                    if let Some(player) = detected_player {
                        let distance = get_player_distance(animal, player);
                        
                        // If player is close and we're low health, turn and fight!
                        if distance < 200.0 {
                            transition_to_state(animal, AnimalState::Chasing, current_time, Some(player.identity), "cornered caribou");
                            animal.investigation_x = None;
                            animal.investigation_y = None;
                            
                            emit_species_sound(ctx, animal, player.identity, "cornered");
                            
                            log::info!("🦌 Caribou {} cornered at low health ({:.1}%) - fighting back!", 
                                      animal.id, health_percent * 100.0);
                            return Ok(());
                        }
                    }
                }
                
                // Continue fleeing - check if reached destination
                if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
                    let distance_to_target_sq = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y);
                    
                    if distance_to_target_sq <= 60.0 * 60.0 {
                        // Reached flee destination
                        animal.investigation_x = None;
                        animal.investigation_y = None;
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "reached safety");
                        log::debug!("Caribou {} reached safety, resuming grazing", animal.id);
                    }
                } else {
                    // No flee target - timeout and return to patrol
                    let time_since_flee = current_time.to_micros_since_unix_epoch() - 
                                         animal.state_change_time.to_micros_since_unix_epoch();
                    
                    if time_since_flee > 4_000_000 { // 4 seconds timeout
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "flee timeout");
                    }
                }
            },
            
            AnimalState::Chasing => {
                // Cornered caribou - only chase if low health, otherwise return to fleeing
                if health_percent >= CARIBOU_LOW_HEALTH_THRESHOLD {
                    // Health recovered or wasn't that low - go back to fleeing
                    if let Some(player) = detected_player {
                        set_flee_destination_away_from_threat(
                            animal, 
                            player.position_x, 
                            player.position_y, 
                            500.0,
                            rng
                        );
                        transition_to_state(animal, AnimalState::Fleeing, current_time, None, "not cornered anymore");
                        log::debug!("Caribou {} health recovered - fleeing instead of fighting", animal.id);
                        return Ok(());
                    }
                }
                
                // Still low health - continue fighting
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        let distance = get_player_distance(animal, &target_player);
                        
                        // Stop chasing if player gets too far (caribou don't pursue)
                        if distance > stats.chase_trigger_range * 2.0 {
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "player escaped");
                        }
                    } else {
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "target lost");
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
        // Use SPRINT SPEED for fleeing - caribou are very fast when spooked!
        if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
            move_towards_target(ctx, animal, target_x, target_y, stats.sprint_speed, dt);
        } else {
            // No specific flee target - head away from spawn at sprint speed
            let angle = rng.gen::<f32>() * 2.0 * PI;
            let flee_x = animal.pos_x + angle.cos() * 500.0;
            let flee_y = animal.pos_y + angle.sin() * 500.0;
            move_towards_target(ctx, animal, flee_x, flee_y, stats.sprint_speed, dt);
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
        // Caribou patrol slowly - grazing behavior
        // Try to stay near other caribou (herd behavior)
        if rng.gen::<f32>() < 0.15 { // 15% chance to check for herd (increased for better reconvening)
            if let Some((herd_x, herd_y)) = find_nearby_caribou_herd_center(ctx, animal) {
                let distance_to_herd = ((animal.pos_x - herd_x).powi(2) + (animal.pos_y - herd_y).powi(2)).sqrt();
                
                // If too far from herd, bias movement toward them
                if distance_to_herd > CARIBOU_HERD_CLOSE_DISTANCE {
                    let dx = herd_x - animal.pos_x;
                    let dy = herd_y - animal.pos_y;
                    let distance = (dx * dx + dy * dy).sqrt();
                    
                    if distance > 0.0 {
                        // Bias direction toward herd
                        let herd_weight = 0.5;
                        let random_angle = rng.gen::<f32>() * 2.0 * PI;
                        let herd_angle = dy.atan2(dx);
                        
                        animal.direction_x = herd_weight * herd_angle.cos() + (1.0 - herd_weight) * random_angle.cos();
                        animal.direction_y = herd_weight * herd_angle.sin() + (1.0 - herd_weight) * random_angle.sin();
                        
                        // Normalize
                        let length = (animal.direction_x * animal.direction_x + animal.direction_y * animal.direction_y).sqrt();
                        if length > 0.0 {
                            animal.direction_x /= length;
                            animal.direction_y /= length;
                        }
                    }
                }
            }
        }
        
        // Random direction changes (slow, grazing behavior)
        if rng.gen::<f32>() < 0.08 { // 8% chance to change direction
            let angle = rng.gen::<f32>() * 2.0 * PI;
            animal.direction_x = angle.cos();
            animal.direction_y = angle.sin();
        }
        
        // Move at slow patrol speed
        let target_x = animal.pos_x + animal.direction_x * stats.movement_speed * dt;
        let target_y = animal.pos_y + animal.direction_y * stats.movement_speed * dt;
        
        // Check if target position is safe
        if !super::core::is_position_in_shelter(ctx, target_x, target_y) &&
           !crate::fishing::is_water_tile(ctx, target_x, target_y) {
            move_towards_target(ctx, animal, target_x, target_y, stats.movement_speed, dt);
        } else {
            // Pick new direction if blocked
            let angle = rng.gen::<f32>() * 2.0 * PI;
            animal.direction_x = angle.cos();
            animal.direction_y = angle.sin();
        }
    }

    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool {
        // Caribou only chase when cornered (low health)
        let health_percent = animal.health / stats.max_health;
        
        if health_percent < CARIBOU_LOW_HEALTH_THRESHOLD {
            // Cornered - will fight back
            let distance_sq = get_distance_squared(
                animal.pos_x, animal.pos_y,
                player.position_x, player.position_y
            );
            
            return distance_sq <= stats.chase_trigger_range.powi(2);
        }
        
        // Not cornered - caribou don't chase, they flee
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
        // Check if tamed - don't attack owner
        if let Some(owner_id) = animal.tamed_by {
            if attacker.identity == owner_id {
                // Our owner hit us - show crying effect but don't retaliate
                animal.crying_effect_until = Some(Timestamp::from_micros_since_unix_epoch(
                    current_time.to_micros_since_unix_epoch() + 3000000
                ));
                emit_species_sound(ctx, animal, attacker.identity, "confused");
                log::info!("🦌💧 Tamed Caribou {} was hit by owner {} - showing crying effect", animal.id, owner_id);
                return Ok(());
            }
            
            // Someone else attacked us - defend ourselves
            transition_to_state(animal, AnimalState::Protecting, current_time, Some(attacker.identity), "defending against attacker");
            emit_species_sound(ctx, animal, attacker.identity, "retaliation");
            log::info!("🦌 Tamed Caribou {} defending against attacker {}", animal.id, attacker.identity);
            return Ok(());
        }
        
        // Wild caribou damage response
        let health_percent = animal.health / stats.max_health;
        
        if health_percent < CARIBOU_LOW_HEALTH_THRESHOLD {
            // Cornered at low health - fight back!
            transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "cornered caribou fight");
            emit_species_sound(ctx, animal, attacker.identity, "retaliation");
            log::info!("🦌 Caribou {} cornered at {:.1}% health - fighting back against {}!", 
                      animal.id, health_percent * 100.0, attacker.identity);
        } else {
            // Not cornered - flee!
            set_flee_destination_away_from_threat(animal, attacker.position_x, attacker.position_y, 600.0, rng);
            transition_to_state(animal, AnimalState::Fleeing, current_time, None, "caribou flee from damage");
            emit_species_sound(ctx, animal, attacker.identity, "spooked");
            log::info!("🦌 Caribou {} fleeing from attacker {} (health: {:.1}%)", 
                      animal.id, attacker.identity, health_percent * 100.0);
        }
        
        Ok(())
    }
    
    fn can_be_tamed(&self) -> bool {
        true // Caribou can be tamed with vegetarian foods
    }
    
    fn get_taming_foods(&self) -> Vec<&'static str> {
        // Caribou are herbivores - they eat berries, vegetables, and mushrooms
        vec![
            // Berries (caribou love these)
            "Lingonberries", "Cloudberries", "Bilberries", "Crowberries", 
            "Wild Strawberries", "Rowan Berries", "Cranberries",
            // Vegetables
            "Carrot", "Cooked Carrot", "Potato", "Cooked Potato",
            "Cabbage", "Cooked Cabbage", "Beet", "Cooked Beet",
            // Mushrooms (safe ones)
            "Chanterelle", "Cooked Chanterelle", "Porcini", "Cooked Porcini",
            "Shaggy Ink Cap", "Cooked Shaggy Ink Cap",
            // Arctic plants
            "Arctic Lichen", "Mountain Moss", "Arctic Poppy",
            "Fireweed Shoots", "Scurvy Grass",
        ]
    }
    
    fn get_chase_abandonment_multiplier(&self) -> f32 {
        1.5 // Caribou give up chasing quickly - they prefer to flee
    }
}

/// Find the center of nearby caribou herd members
fn find_nearby_caribou_herd_center(ctx: &ReducerContext, current_caribou: &WildAnimal) -> Option<(f32, f32)> {
    let mut nearby_caribou = Vec::new();
    
    for caribou in ctx.db.wild_animal().iter() {
        if caribou.id != current_caribou.id && matches!(caribou.species, AnimalSpecies::Caribou) {
            let distance = ((current_caribou.pos_x - caribou.pos_x).powi(2) + 
                           (current_caribou.pos_y - caribou.pos_y).powi(2)).sqrt();
            
            if distance <= CARIBOU_HERD_DETECTION_RADIUS {
                nearby_caribou.push(caribou);
            }
        }
    }
    
    if nearby_caribou.is_empty() {
        return None;
    }
    
    // Calculate center of nearby caribou
    let total_x: f32 = nearby_caribou.iter().map(|c| c.pos_x).sum();
    let total_y: f32 = nearby_caribou.iter().map(|c| c.pos_y).sum();
    let count = nearby_caribou.len() as f32;
    
    Some((total_x / count, total_y / count))
}

/// Alert nearby caribou herd members when one is spooked
fn alert_nearby_caribou_herd(
    ctx: &ReducerContext, 
    spooked_caribou: &WildAnimal, 
    threat_x: f32, 
    threat_y: f32,
    current_time: Timestamp
) {
    let alert_radius = CARIBOU_HERD_DETECTION_RADIUS * 1.5; // Alert slightly further than normal herd range
    let mut rng = ctx.rng();
    
    for mut caribou in ctx.db.wild_animal().iter() {
        if caribou.id != spooked_caribou.id && matches!(caribou.species, AnimalSpecies::Caribou) {
            let distance = ((spooked_caribou.pos_x - caribou.pos_x).powi(2) + 
                           (spooked_caribou.pos_y - caribou.pos_y).powi(2)).sqrt();
            
            if distance <= alert_radius {
                // Alert this caribou too!
                if caribou.state == AnimalState::Patrolling || caribou.state == AnimalState::Idle {
                    // Set flee destination away from threat
                    let angle = (caribou.pos_y - threat_y).atan2(caribou.pos_x - threat_x);
                    let flee_distance = 400.0 + rng.gen::<f32>() * 200.0;
                    caribou.investigation_x = Some(caribou.pos_x + angle.cos() * flee_distance);
                    caribou.investigation_y = Some(caribou.pos_y + angle.sin() * flee_distance);
                    caribou.state = AnimalState::Fleeing;
                    caribou.state_change_time = current_time;
                    
                    let caribou_id = caribou.id; // Store ID before move
                    ctx.db.wild_animal().id().update(caribou);
                    
                    log::debug!("🦌 Caribou {} alerted by herd member - fleeing!", caribou_id);
                }
            }
        }
    }
}
