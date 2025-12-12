/******************************************************************************
 *                                                                            *
 * Crow Behavior - Inland Thief Bird                                         *
 *                                                                            *
 * Crows are opportunistic thief birds that patrol inland areas by flying.   *
 * They steal items directly from player inventories and follow players       *
 * who carry food. They are cunning and will peck if provoked.               *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Identity, Timestamp, Table};
use std::f32::consts::PI;
use rand::Rng;
use log;

use crate::Player;
use crate::utils::get_distance_squared;
use crate::sound_events;

// Table trait imports
use crate::player as PlayerTableTrait;
use crate::items::inventory_item as InventoryItemTableTrait;
use super::core::{
    AnimalBehavior, AnimalStats, AnimalState, MovementPattern, WildAnimal, wild_animal as WildAnimalTableTrait,
    move_towards_target, transition_to_state, emit_species_sound,
    get_player_distance, execute_flying_patrol, execute_grounded_idle, execute_flying_chase,
    is_bird_flying, update_facing_direction, set_flee_destination_away_from_threat,
};

/// Stealing constants
const STEAL_DETECTION_RADIUS: f32 = 250.0; // How far crows can detect players with items
const STEAL_DETECTION_RADIUS_SQUARED: f32 = STEAL_DETECTION_RADIUS * STEAL_DETECTION_RADIUS;
const STEAL_ATTEMPT_RADIUS: f32 = 50.0; // How close crow needs to be to steal
const STEAL_ATTEMPT_RADIUS_SQUARED: f32 = STEAL_ATTEMPT_RADIUS * STEAL_ATTEMPT_RADIUS;
const STEAL_CHANCE: f32 = 0.15; // 15% chance per attempt to successfully steal
const STEAL_COOLDOWN_MS: i64 = 5000; // 5 seconds between steal attempts

/// Food following constants  
const FOOD_FOLLOW_DISTANCE: f32 = 150.0; // Keep this distance when following players with food
const FOOD_FOLLOW_DISTANCE_SQUARED: f32 = FOOD_FOLLOW_DISTANCE * FOOD_FOLLOW_DISTANCE;

pub struct CrowBehavior;

impl AnimalBehavior for CrowBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 60.0, // Low health - easy to kill
            attack_damage: 5.0, // Weak peck damage
            attack_range: 45.0, // Short beak range
            attack_speed_ms: 1000, // Moderate attack speed
            movement_speed: 140.0, // Ground speed (rarely used)
            sprint_speed: 320.0, // Base flying speed (multiplied by FLYING_SPEED_MULTIPLIER)
            perception_range: 350.0, // Good vision for spotting players
            perception_angle_degrees: 270.0, // Wide field of view
            patrol_radius: 500.0, // Large patrol area (flying)
            chase_trigger_range: 200.0, // Chase to steal range
            flee_trigger_health_percent: 0.35, // Flee at 35% health - crows are fragile
            hide_duration_ms: 0, // Birds don't hide
        }
    }

    fn get_movement_pattern(&self) -> MovementPattern {
        MovementPattern::Wander // Crows wander while flying
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
        
        // Try to steal an item while attacking
        if animal.held_item_name.is_none() && rng.gen::<f32>() < STEAL_CHANCE * 2.0 { // Higher chance during attack
            if let Some((item_name, quantity)) = try_steal_from_player(ctx, target_player, rng) {
                animal.held_item_name = Some(item_name.clone());
                animal.held_item_quantity = Some(quantity);
                log::info!("Crow {} stole {} x{} from player {} during attack!", 
                          animal.id, item_name, quantity, target_player.identity);
                // Play crow stealing sound at player's position
                sound_events::emit_crow_stealing_sound(ctx, target_player.position_x, target_player.position_y, target_player.identity);
            }
        }
        
        // Crows peck and then flee (use Fleeing state so movement system handles it)
        animal.is_flying = true;
        set_flee_destination_away_from_threat(animal, target_player.position_x, target_player.position_y, 250.0, rng);
        transition_to_state(animal, AnimalState::Fleeing, current_time, None, "crow flee after peck");
        
        log::info!("Crow {} pecked player {} for {:.1} damage and flew away", 
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
                // Crows use Grounded state for walking and Flying for flying
                // Patrolling is also valid and defers to is_flying flag for behavior
                
                // Check for players with food to follow
                if let Some(player) = detected_player {
                    let distance = get_player_distance(animal, player);
                    
                    // Check for nearby players - flee if too close
                    if distance < 120.0 {
                        // Too close! Take off and flee
                        animal.is_flying = true;
                        set_flee_destination_away_from_threat(animal, player.position_x, player.position_y, 300.0, rng);
                        transition_to_state(animal, AnimalState::Fleeing, current_time, None, "flee from nearby player");
                        log::debug!("Crow {} fleeing from nearby player", animal.id);
                        return Ok(());
                    }
                    
                    if player_has_food(ctx, player.identity) && distance < stats.perception_range {
                        // Follow the player - take off if needed
                        animal.is_flying = true;
                        animal.investigation_x = Some(player.position_x);
                        animal.investigation_y = Some(player.position_y);
                        animal.target_player_id = Some(player.identity);
                        animal.last_food_check = Some(current_time); // Reset steal cooldown
                        transition_to_state(animal, AnimalState::Stealing, current_time, Some(player.identity), "detected food carrier");
                        log::info!("Crow {} detected player {} with food, moving to steal", animal.id, player.identity);
                    } else if animal.held_item_name.is_none() && distance < STEAL_DETECTION_RADIUS {
                        // No food but close - might steal something else
                        if should_attempt_steal(animal, current_time) && rng.gen::<f32>() < 0.3 { // 30% chance to try
                            animal.is_flying = true;
                            animal.investigation_x = Some(player.position_x);
                            animal.investigation_y = Some(player.position_y);
                            animal.target_player_id = Some(player.identity);
                            animal.last_food_check = Some(current_time);
                            transition_to_state(animal, AnimalState::Stealing, current_time, Some(player.identity), "opportunistic steal");
                            log::debug!("Crow {} attempting opportunistic steal from player {}", animal.id, player.identity);
                        }
                    }
                }
                // Normal walking/flying behavior handled by core movement system based on is_flying flag
            },
            
            AnimalState::Stealing => {
                // Attempting to steal from a player
                animal.is_flying = true; // Always fly while stealing
                
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        let distance = get_player_distance(animal, &target_player);
                        
                        // Update investigation position to track moving player
                        animal.investigation_x = Some(target_player.position_x);
                        animal.investigation_y = Some(target_player.position_y);
                        
                        if distance <= STEAL_ATTEMPT_RADIUS {
                            // Close enough - attempt steal!
                            if animal.held_item_name.is_none() {
                                if rng.gen::<f32>() < STEAL_CHANCE {
                                    if let Some((item_name, quantity)) = try_steal_from_player(ctx, &target_player, rng) {
                                        animal.held_item_name = Some(item_name.clone());
                                        animal.held_item_quantity = Some(quantity);
                                        log::info!("Crow {} stole {} x{} from player {}!", 
                                                  animal.id, item_name, quantity, target_id);
                                        // Play crow stealing sound at player's position
                                        sound_events::emit_crow_stealing_sound(ctx, target_player.position_x, target_player.position_y, target_id);
                                        
                                        // Fly away with the loot!
                                        set_flee_destination_away_from_threat(animal, target_player.position_x, target_player.position_y, 400.0, rng);
                                        transition_to_state(animal, AnimalState::Fleeing, current_time, None, "stolen and fleeing");
                                        return Ok(());
                                    }
                                }
                                
                                // Failed steal attempt - back off briefly then try again or give up
                                animal.last_food_check = Some(current_time);
                                
                                // 50% chance to give up after failed attempt
                                if rng.gen::<f32>() < 0.5 {
                                    animal.target_player_id = None;
                                    animal.investigation_x = None;
                                    animal.investigation_y = None;
                                    transition_to_state(animal, AnimalState::Flying, current_time, None, "steal failed - giving up");
                                    log::debug!("Crow {} failed steal, giving up", animal.id);
                                }
                            } else {
                                // Already have an item - flee with it
                                set_flee_destination_away_from_threat(animal, target_player.position_x, target_player.position_y, 300.0, rng);
                                transition_to_state(animal, AnimalState::Fleeing, current_time, None, "already have item");
                            }
                        }
                        // Movement toward player handled by core movement system
                    } else {
                        // Target lost - return to patrol
                        animal.target_player_id = None;
                        animal.investigation_x = None;
                        animal.investigation_y = None;
                        transition_to_state(animal, AnimalState::Flying, current_time, None, "steal target lost");
                    }
                } else {
                    // No target - return to patrol
                    animal.investigation_x = None;
                    animal.investigation_y = None;
                    transition_to_state(animal, AnimalState::Flying, current_time, None, "no steal target");
                }
            },
            
            AnimalState::Fleeing => {
                // Crows flee by flying - ensure we're in the air
                animal.is_flying = true;
                // Flee logic handled by execute_flee_logic and core movement system
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
        // Crows always flee by flying
        animal.is_flying = true;
        
        if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
            // Fly toward flee destination at high speed
            execute_flying_chase(ctx, animal, stats, target_x, target_y, dt);
            
            // Check if reached destination
            let distance_sq = get_distance_squared(animal.pos_x, animal.pos_y, target_x, target_y);
            if distance_sq < 60.0 * 60.0 {
                // Reached flee destination - return to patrol
                animal.investigation_x = None;
                animal.investigation_y = None;
                animal.target_player_id = None;
                transition_to_state(animal, AnimalState::Patrolling, current_time, None, "crow flee complete");
                log::debug!("Crow {} finished fleeing, returning to patrol", animal.id);
            }
        } else {
            // No flee destination - set one in random direction and keep fleeing
            let flee_angle = rng.gen::<f32>() * 2.0 * PI;
            let flee_distance = 300.0 + rng.gen::<f32>() * 200.0;
            animal.investigation_x = Some(animal.pos_x + flee_distance * flee_angle.cos());
            animal.investigation_y = Some(animal.pos_y + flee_distance * flee_angle.sin());
            log::debug!("Crow {} set new flee destination", animal.id);
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
        // Crows use is_flying flag to determine animation/movement type
        // This flag is the source of truth for sprite selection on client
        if animal.is_flying {
            execute_flying_patrol(ctx, animal, stats, dt, rng);
        } else {
            // Grounded - use direction-based walking patrol like crabs
            execute_grounded_idle(ctx, animal, stats, dt, rng);
        }
    }

    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool {
        // Crows "chase" players with food to follow them
        player_has_food(ctx, player.identity)
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
        // Crows drop held items and flee when damaged
        if animal.held_item_name.is_some() {
            drop_held_item(ctx, animal, current_time);
        }
        
        // Use Fleeing state so the core movement system handles flight
        animal.is_flying = true;
        set_flee_destination_away_from_threat(animal, attacker.position_x, attacker.position_y, 400.0, rng);
        transition_to_state(animal, AnimalState::Fleeing, current_time, None, "crow flee damage");
        
        log::info!("Crow {} fleeing after damage from {}", animal.id, attacker.identity);
        
        Ok(())
    }
    
    fn can_be_tamed(&self) -> bool {
        false // Crows cannot be tamed
    }
    
    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![] // No taming foods for crows
    }
    
    fn get_chase_abandonment_multiplier(&self) -> f32 {
        2.0 // Crows are fairly persistent when following
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Check if an item is food by looking up its definition in the items database
fn is_food_item(ctx: &ReducerContext, item_def_id: u64) -> bool {
    use crate::items::item_definition as ItemDefinitionTableTrait;
    use crate::items::ItemCategory;
    
    // Look up the item definition by ID
    if let Some(item_def) = ctx.db.item_definition().iter().find(|def| def.id == item_def_id) {
        // Item is food if it's a Consumable and provides hunger satiation
        item_def.category == ItemCategory::Consumable && 
        item_def.consumable_hunger_satiated.map_or(false, |hunger| hunger > 0.0)
    } else {
        false
    }
}

/// Check if a player has food in their inventory
fn player_has_food(ctx: &ReducerContext, player_id: Identity) -> bool {
    use crate::models::ItemLocation;
    
    for item in ctx.db.inventory_item().iter() {
        // Check if this item belongs to the player (in their inventory or hotbar)
        let is_player_item = match &item.location {
            ItemLocation::Inventory(data) => data.owner_id == player_id,
            ItemLocation::Hotbar(data) => data.owner_id == player_id,
            _ => false,
        };
        
        if is_player_item && is_food_item(ctx, item.item_def_id) {
            return true;
        }
    }
    false
}

/// Check if enough time has passed since last steal attempt
fn should_attempt_steal(animal: &WildAnimal, current_time: Timestamp) -> bool {
    if let Some(last_food_check) = animal.last_food_check {
        let time_since_last = current_time.to_micros_since_unix_epoch() - last_food_check.to_micros_since_unix_epoch();
        time_since_last >= STEAL_COOLDOWN_MS * 1000
    } else {
        true // No previous attempt
    }
}

/// Attempt to steal a random item from a player's inventory
fn try_steal_from_player(ctx: &ReducerContext, player: &Player, rng: &mut impl Rng) -> Option<(String, u32)> {
    use crate::models::ItemLocation;
    use crate::items::item_definition as ItemDefinitionTableTrait;
    use crate::items::inventory_item as InventoryItemTableTrait;
    
    // Collect all items from this player (in inventory or hotbar)
    let player_items: Vec<_> = ctx.db.inventory_item()
        .iter()
        .filter(|item| {
            let is_player_item = match &item.location {
                ItemLocation::Inventory(data) => data.owner_id == player.identity,
                ItemLocation::Hotbar(data) => data.owner_id == player.identity,
                _ => false,
            };
            is_player_item && item.quantity > 0
        })
        .collect();
    
    if player_items.is_empty() {
        return None;
    }
    
    // Pick a random item
    let item_index = rng.gen_range(0..player_items.len());
    let target_item = &player_items[item_index];
    
    // Look up the item name from the definition
    let item_name = ctx.db.item_definition()
        .iter()
        .find(|def| def.id == target_item.item_def_id)
        .map(|def| def.name.clone())
        .unwrap_or_else(|| format!("Unknown Item #{}", target_item.item_def_id));
    
    // Determine quantity to steal (1-2 items, but not more than available)
    let steal_quantity = rng.gen_range(1..=2.min(target_item.quantity));
    
    let remaining_quantity = target_item.quantity.saturating_sub(steal_quantity);
    let target_instance_id = target_item.instance_id;
    
    // Update or delete the item from player's inventory
    if remaining_quantity == 0 {
        // Delete the item entirely
        ctx.db.inventory_item().instance_id().delete(&target_instance_id);
    } else {
        // Update the quantity
        let mut updated_item = target_item.clone();
        updated_item.quantity = remaining_quantity;
        ctx.db.inventory_item().instance_id().update(updated_item);
    }
    
    log::info!("Crow stole {} x{} from player {} (remaining: {})", 
              item_name, steal_quantity, player.identity, remaining_quantity);
    
    Some((item_name, steal_quantity))
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
                log::error!("Failed to drop item from crow: {:?}", e);
            } else {
                log::info!("Crow {} dropped {} x{}", animal.id, item_name, quantity);
            }
        } else {
            log::error!("Crow {} could not find item definition for '{}'", animal.id, item_name);
        }
        
        // Clear the held item
        animal.held_item_name = None;
        animal.held_item_quantity = None;
    }
}

