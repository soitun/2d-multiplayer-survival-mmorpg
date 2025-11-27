/******************************************************************************
 *                                                                            *
 * Tern Behavior - Coastal Scavenger Bird                                    *
 *                                                                            *
 * Terns are scavenger birds that patrol beaches by flying vast distances.   *
 * They pick up dropped items from the ground and alert other animals when   *
 * they spot players. They are non-aggressive but will peck if cornered.     *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Identity, Timestamp, Table};
use std::f32::consts::PI;
use rand::Rng;
use log;

use crate::Player;
use crate::dropped_item::DroppedItem;
use crate::utils::get_distance_squared;

// Table trait imports
use crate::player as PlayerTableTrait;
use crate::dropped_item::dropped_item as DroppedItemTableTrait;
use super::core::{
    AnimalBehavior, AnimalStats, AnimalState, MovementPattern, WildAnimal, wild_animal as WildAnimalTableTrait,
    move_towards_target, transition_to_state, emit_species_sound,
    get_player_distance, execute_flying_patrol, execute_grounded_idle, execute_flying_chase,
    is_bird_flying, update_facing_direction, set_flee_destination_away_from_threat,
};

/// Scavenging constants
const SCAVENGE_DETECTION_RADIUS: f32 = 200.0; // How far terns can detect dropped items
const SCAVENGE_DETECTION_RADIUS_SQUARED: f32 = SCAVENGE_DETECTION_RADIUS * SCAVENGE_DETECTION_RADIUS;
const SCAVENGE_PICKUP_RADIUS: f32 = 30.0; // How close tern needs to be to pick up item
const SCAVENGE_PICKUP_RADIUS_SQUARED: f32 = SCAVENGE_PICKUP_RADIUS * SCAVENGE_PICKUP_RADIUS;

/// Alert constants
const ALERT_RADIUS: f32 = 400.0; // How far the alert reaches
const ALERT_RADIUS_SQUARED: f32 = ALERT_RADIUS * ALERT_RADIUS;

pub struct TernBehavior;

impl AnimalBehavior for TernBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 80.0, // Low health - easy to kill
            attack_damage: 6.0, // Weak peck damage
            attack_range: 40.0, // Short beak range
            attack_speed_ms: 1200, // Slow attack speed
            movement_speed: 120.0, // Ground speed (rarely used)
            sprint_speed: 280.0, // Base flying speed (multiplied by FLYING_SPEED_MULTIPLIER)
            perception_range: 400.0, // Good vision for spotting items and players
            perception_angle_degrees: 270.0, // Wide field of view
            patrol_radius: 600.0, // Large patrol area (flying)
            chase_trigger_range: 150.0, // Only chase to scavenge items
            flee_trigger_health_percent: 0.4, // Flee at 40% health - birds are fragile
            hide_duration_ms: 0, // Birds don't hide
        }
    }

    fn get_movement_pattern(&self) -> MovementPattern {
        MovementPattern::Wander // Terns wander while flying
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
        
        // Terns peck and then fly away - they're not fighters
        set_flee_destination_away_from_threat(animal, target_player.position_x, target_player.position_y, 300.0, rng);
        transition_to_state(animal, AnimalState::Flying, current_time, None, "tern flee after peck");
        animal.is_flying = true;
        
        log::info!("Tern {} pecked player {} for {:.1} damage and flew away", 
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
            AnimalState::Patrolling | AnimalState::Flying => {
                // Default flying patrol for terns
                if !animal.is_flying {
                    // Take off if not flying
                    animal.is_flying = true;
                    transition_to_state(animal, AnimalState::Flying, current_time, None, "tern takeoff");
                }
                
                // Check for dropped items to scavenge (only if not already carrying)
                if animal.held_item_name.is_none() {
                    if let Some((item_id, item_x, item_y)) = find_nearby_dropped_item(ctx, animal.pos_x, animal.pos_y) {
                        // Found a dropped item - go scavenge it
                        animal.investigation_x = Some(item_x);
                        animal.investigation_y = Some(item_y);
                        transition_to_state(animal, AnimalState::Scavenging, current_time, None, "found dropped item");
                        log::info!("Tern {} found dropped item at ({:.0}, {:.0})", animal.id, item_x, item_y);
                    }
                }
                
                // Alert other animals when detecting a player
                if let Some(player) = detected_player {
                    // Emit alert screech
                    emit_species_sound(ctx, animal, player.identity, "alert");
                    alert_nearby_animals(ctx, animal, player, current_time);
                }
            },
            
            AnimalState::Grounded => {
                // Random chance to take off
                if rng.gen::<f32>() < 0.03 { // 3% chance per tick
                    animal.is_flying = true;
                    transition_to_state(animal, AnimalState::Flying, current_time, None, "tern takeoff");
                }
                
                // Check for nearby dropped items while grounded
                if animal.held_item_name.is_none() {
                    if let Some((item_id, item_x, item_y)) = find_nearby_dropped_item(ctx, animal.pos_x, animal.pos_y) {
                        animal.investigation_x = Some(item_x);
                        animal.investigation_y = Some(item_y);
                        transition_to_state(animal, AnimalState::Scavenging, current_time, None, "found dropped item grounded");
                    }
                }
                
                // Alert if player detected
                if let Some(player) = detected_player {
                    let distance = get_player_distance(animal, player);
                    if distance < 150.0 {
                        // Too close! Take off and flee
                        animal.is_flying = true;
                        set_flee_destination_away_from_threat(animal, player.position_x, player.position_y, 400.0, rng);
                        transition_to_state(animal, AnimalState::Flying, current_time, None, "flee from player");
                    } else {
                        alert_nearby_animals(ctx, animal, player, current_time);
                    }
                }
            },
            
            AnimalState::Scavenging => {
                // Move toward the dropped item
                if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
                    let distance_sq = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y);
                    
                    if distance_sq <= SCAVENGE_PICKUP_RADIUS_SQUARED {
                        // Try to pick up the item
                        if let Some((item_name, quantity)) = try_pickup_dropped_item(ctx, target_x, target_y) {
                            animal.held_item_name = Some(item_name.clone());
                            animal.held_item_quantity = Some(quantity);
                            log::info!("Tern {} picked up {} x{}", animal.id, item_name, quantity);
                        }
                        
                        // Return to flying patrol after scavenging attempt
                        animal.investigation_x = None;
                        animal.investigation_y = None;
                        animal.is_flying = true;
                        transition_to_state(animal, AnimalState::Flying, current_time, None, "scavenge complete");
                    } else {
                        // Fly toward the item if far away, walk if close
                        if distance_sq > 100.0 * 100.0 {
                            animal.is_flying = true;
                        }
                    }
                } else {
                    // No target - return to patrol
                    animal.is_flying = true;
                    transition_to_state(animal, AnimalState::Flying, current_time, None, "no scavenge target");
                }
                
                // Still alert other animals if player detected
                if let Some(player) = detected_player {
                    let distance = get_player_distance(animal, player);
                    if distance < 100.0 {
                        // Abort scavenging and flee
                        animal.investigation_x = None;
                        animal.investigation_y = None;
                        animal.is_flying = true;
                        set_flee_destination_away_from_threat(animal, player.position_x, player.position_y, 400.0, rng);
                        transition_to_state(animal, AnimalState::Flying, current_time, None, "abort scavenge flee");
                    }
                }
            },
            
            AnimalState::Fleeing => {
                // Terns flee by flying
                if !animal.is_flying {
                    animal.is_flying = true;
                }
                
                // Check if fled far enough
                if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
                    let distance_sq = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y);
                    
                    if distance_sq < 50.0 * 50.0 {
                        // Reached flee destination - return to flying patrol
                        animal.investigation_x = None;
                        animal.investigation_y = None;
                        transition_to_state(animal, AnimalState::Flying, current_time, None, "flee complete");
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
        // Terns flee by flying - use flying chase mechanics toward flee destination
        animal.is_flying = true;
        
        if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
            execute_flying_chase(ctx, animal, stats, target_x, target_y, dt);
            
            // Check if reached destination
            let distance_sq = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y);
            if distance_sq < 50.0 * 50.0 {
                animal.investigation_x = None;
                animal.investigation_y = None;
                transition_to_state(animal, AnimalState::Flying, current_time, None, "flee complete");
            }
        } else {
            // No flee destination - just fly in random direction
            execute_flying_patrol(ctx, animal, stats, dt, rng);
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
        // Terns patrol by flying
        if animal.is_flying || animal.state == AnimalState::Flying {
            execute_flying_patrol(ctx, animal, stats, dt, rng);
        } else {
            execute_grounded_idle(ctx, animal, stats, dt, rng);
        }
    }

    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool {
        // Terns don't chase players - they only scavenge and flee
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
        // Terns always flee when damaged - drop held item and fly away
        if animal.held_item_name.is_some() {
            // Drop the held item
            drop_held_item(ctx, animal, current_time);
        }
        
        animal.is_flying = true;
        set_flee_destination_away_from_threat(animal, attacker.position_x, attacker.position_y, 500.0, rng);
        transition_to_state(animal, AnimalState::Flying, current_time, None, "tern flee damage");
        
        log::info!("Tern {} fleeing after damage from {}", animal.id, attacker.identity);
        
        Ok(())
    }
    
    fn can_be_tamed(&self) -> bool {
        false // Terns cannot be tamed
    }
    
    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![] // No taming foods for terns
    }
    
    fn get_chase_abandonment_multiplier(&self) -> f32 {
        1.5 // Terns give up very quickly
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Find a nearby dropped item for scavenging
fn find_nearby_dropped_item(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> Option<(u64, f32, f32)> {
    let mut closest_item: Option<(u64, f32, f32)> = None;
    let mut closest_distance_sq = SCAVENGE_DETECTION_RADIUS_SQUARED;
    
    for item in ctx.db.dropped_item().iter() {
        let distance_sq = get_distance_squared(pos_x, pos_y, item.pos_x, item.pos_y);
        
        if distance_sq < closest_distance_sq {
            closest_distance_sq = distance_sq;
            closest_item = Some((item.id as u64, item.pos_x, item.pos_y));
        }
    }
    
    closest_item
}

/// Try to pick up a dropped item at the specified position
fn try_pickup_dropped_item(ctx: &ReducerContext, target_x: f32, target_y: f32) -> Option<(String, u32)> {
    use crate::items::item_definition as ItemDefinitionTableTrait;
    
    // Find the closest dropped item at the target position
    for item in ctx.db.dropped_item().iter() {
        let distance_sq = get_distance_squared(target_x, target_y, item.pos_x, item.pos_y);
        
        if distance_sq < SCAVENGE_PICKUP_RADIUS_SQUARED {
            // Look up the item name from the definition
            let item_name = ctx.db.item_definition()
                .id()
                .find(item.item_def_id)
                .map(|def| def.name.clone())
                .unwrap_or_else(|| format!("Unknown Item #{}", item.item_def_id));
            
            let quantity = item.quantity;
            
            // Delete the dropped item from the world
            if ctx.db.dropped_item().id().delete(&item.id) {
                log::info!("Tern scavenged dropped item: {} x{} (ID: {})", item_name, quantity, item.id);
                return Some((item_name, quantity));
            }
        }
    }
    
    None
}

/// Drop the held item back into the world
fn drop_held_item(ctx: &ReducerContext, animal: &mut WildAnimal, current_time: Timestamp) {
    use crate::items::item_definition as ItemDefinitionTableTrait;
    
    if let (Some(item_name), Some(quantity)) = (&animal.held_item_name, animal.held_item_quantity) {
        // Look up the item definition ID by name
        let item_def_id = ctx.db.item_definition()
            .iter()
            .find(|def| def.name == *item_name)
            .map(|def| def.id);
        
        if let Some(def_id) = item_def_id {
            // Create a dropped item at the animal's position
            if let Err(e) = crate::dropped_item::create_dropped_item_entity(
                ctx,
                def_id,
                quantity,
                animal.pos_x,
                animal.pos_y,
            ) {
                log::error!("Failed to drop item from tern: {:?}", e);
            } else {
                log::info!("Tern {} dropped {} x{}", animal.id, item_name, quantity);
            }
        } else {
            log::error!("Tern {} could not find item definition for '{}'", animal.id, item_name);
        }
        
        // Clear the held item
        animal.held_item_name = None;
        animal.held_item_quantity = None;
    }
}

/// Alert nearby animals about a player's presence
fn alert_nearby_animals(ctx: &ReducerContext, tern: &WildAnimal, player: &Player, current_time: Timestamp) {
    // Find nearby wild animals and make them alert
    for mut animal in ctx.db.wild_animal().iter() {
        if animal.id == tern.id {
            continue; // Skip self
        }
        
        let distance_sq = get_distance_squared(tern.pos_x, tern.pos_y, animal.pos_x, animal.pos_y);
        
        if distance_sq < ALERT_RADIUS_SQUARED {
            // Make the animal alert if it's patrolling
            if animal.state == AnimalState::Patrolling {
                let animal_id = animal.id; // Save id before move
                animal.state = AnimalState::Alert;
                animal.state_change_time = current_time;
                animal.target_player_id = Some(player.identity);
                
                // Update the animal in the database
                ctx.db.wild_animal().id().update(animal);
                
                log::debug!("Tern {} alerted animal {} about player {}", tern.id, animal_id, player.identity);
            }
        }
    }
}

