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

// Campfire and barbecue imports for food stealing
use crate::campfire::campfire as CampfireTableTrait;
use crate::campfire::{Campfire, NUM_FUEL_SLOTS as NUM_CAMPFIRE_SLOTS};
use crate::barbecue::barbecue as BarbecueTableTrait;
use crate::barbecue::{Barbecue, NUM_BARBECUE_SLOTS};
use crate::inventory_management::ItemContainer;
use crate::models::{ContainerType, ItemLocation, ContainerLocationData};

// Scarecrow imports for deterrence
use crate::wooden_storage_box::{wooden_storage_box as WoodenStorageBoxTableTrait, BOX_TYPE_SCARECROW};

// Farm destruction imports (planted seeds and player crops)
use crate::planted_seeds::planted_seed as PlantedSeedTableTrait;
use crate::harvestable_resource::harvestable_resource as HarvestableResourceTableTrait;

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

/// Campfire/Barbecue food stealing constants
/// Crows are bold thieves that don't fear fire - they'll swoop in to steal food from cooking fires!
const CAMPFIRE_FOOD_DETECTION_RADIUS: f32 = 400.0; // How far crows can detect food in campfires
const CAMPFIRE_FOOD_DETECTION_RADIUS_SQUARED: f32 = CAMPFIRE_FOOD_DETECTION_RADIUS * CAMPFIRE_FOOD_DETECTION_RADIUS;
const CAMPFIRE_STEAL_ATTEMPT_RADIUS: f32 = 60.0; // How close crow needs to be to steal from campfire
const CAMPFIRE_STEAL_ATTEMPT_RADIUS_SQUARED: f32 = CAMPFIRE_STEAL_ATTEMPT_RADIUS * CAMPFIRE_STEAL_ATTEMPT_RADIUS;
const CAMPFIRE_STEAL_CHANCE: f32 = 0.25; // 25% chance per attempt to steal from campfire (higher than player)
const CAMPFIRE_FOOD_CHECK_COOLDOWN_MS: i64 = 3000; // 3 seconds between campfire food checks

/// Scarecrow deterrence constants
/// Scarecrows protect campfires and barbecues from crow theft within a large radius!
const SCARECROW_DETERRENCE_RADIUS: f32 = 750.0; // Scarecrow protection radius in pixels
const SCARECROW_DETERRENCE_RADIUS_SQUARED: f32 = SCARECROW_DETERRENCE_RADIUS * SCARECROW_DETERRENCE_RADIUS;

/// Farm destruction constants
/// Crows will destroy player-planted crops and growing seeds!
const FARM_DETECTION_RADIUS: f32 = 350.0; // How far crows can detect farms
const FARM_DETECTION_RADIUS_SQUARED: f32 = FARM_DETECTION_RADIUS * FARM_DETECTION_RADIUS;
const FARM_DESTROY_ATTEMPT_RADIUS: f32 = 40.0; // How close crow needs to be to destroy
const FARM_DESTROY_ATTEMPT_RADIUS_SQUARED: f32 = FARM_DESTROY_ATTEMPT_RADIUS * FARM_DESTROY_ATTEMPT_RADIUS;
const FARM_DESTROY_CHANCE: f32 = 0.35; // 35% chance per attempt to destroy a crop/seed
const FARM_CHECK_COOLDOWN_MS: i64 = 4000; // 4 seconds between farm checks

pub struct CrowBehavior;

impl AnimalBehavior for CrowBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 60.0, // Low health - easy to kill
            attack_damage: 5.0, // Weak peck damage
            attack_range: 85.0, // Extended range to stay engaged after collision pushback
            attack_speed_ms: 1000, // Moderate attack speed
            movement_speed: 140.0, // Ground speed (rarely used)
            sprint_speed: 280.0, // Base flying speed (x1.8 = 504 effective) - same as tern
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
                
                // 🎃 SCARECROW CHECK 🎃
                // First check if the crow itself is near a scarecrow - if so, flee!
                if let Some((scarecrow_x, scarecrow_y)) = find_nearest_scarecrow(ctx, animal.pos_x, animal.pos_y) {
                    // Scarecrow nearby! The crow should flee in the opposite direction
                    animal.is_flying = true;
                    set_flee_destination_away_from_threat(animal, scarecrow_x, scarecrow_y, 400.0, rng);
                    transition_to_state(animal, AnimalState::Fleeing, current_time, None, "scared by scarecrow");
                    log::debug!("🎃 Crow {} scared away by scarecrow at ({:.1}, {:.1})", animal.id, scarecrow_x, scarecrow_y);
                    return Ok(());
                }
                
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
                    
                    // 🎃 Don't steal from players near scarecrows!
                    let player_near_scarecrow = is_position_near_scarecrow(ctx, player.position_x, player.position_y);
                    
                    if !player_near_scarecrow && player_has_food(ctx, player.identity) && distance < stats.perception_range {
                        // Follow the player - take off if needed
                        animal.is_flying = true;
                        animal.investigation_x = Some(player.position_x);
                        animal.investigation_y = Some(player.position_y);
                        animal.target_player_id = Some(player.identity);
                        animal.last_food_check = Some(current_time); // Reset steal cooldown
                        transition_to_state(animal, AnimalState::Stealing, current_time, Some(player.identity), "detected food carrier");
                        log::info!("Crow {} detected player {} with food, moving to steal", animal.id, player.identity);
                        return Ok(());
                    } else if !player_near_scarecrow && animal.held_item_name.is_none() && distance < STEAL_DETECTION_RADIUS {
                        // No food but close - might steal something else
                        if should_attempt_steal(animal, current_time) && rng.gen::<f32>() < 0.3 { // 30% chance to try
                            animal.is_flying = true;
                            animal.investigation_x = Some(player.position_x);
                            animal.investigation_y = Some(player.position_y);
                            animal.target_player_id = Some(player.identity);
                            animal.last_food_check = Some(current_time);
                            transition_to_state(animal, AnimalState::Stealing, current_time, Some(player.identity), "opportunistic steal");
                            log::debug!("Crow {} attempting opportunistic steal from player {}", animal.id, player.identity);
                            return Ok(());
                        }
                    }
                }
                
                // 🔥 CAMPFIRE/BARBECUE FOOD STEALING 🔥
                // Crows are bold thieves that don't fear fire - they'll swoop in to steal food!
                if animal.held_item_name.is_none() && should_attempt_campfire_steal(animal, current_time) {
                    if let Some(target) = find_nearest_cooking_container_with_food(ctx, animal.pos_x, animal.pos_y) {
                        let (target_x, target_y) = match &target {
                            CookingContainerTarget::Campfire { pos_x, pos_y, .. } => (*pos_x, *pos_y),
                            CookingContainerTarget::Barbecue { pos_x, pos_y, .. } => (*pos_x, *pos_y),
                        };
                        
                        // 🎃 Don't steal from cooking fires near scarecrows!
                        if is_position_near_scarecrow(ctx, target_x, target_y) {
                            log::debug!("🎃 Crow {} detected food at ({:.1}, {:.1}) but it's protected by a scarecrow!", 
                                      animal.id, target_x, target_y);
                            // Skip this target, the scarecrow scares us away
                        } else {
                            // Check chance to notice the food (30% per tick when patrolling)
                            if rng.gen::<f32>() < 0.30 {
                                animal.is_flying = true;
                                animal.investigation_x = Some(target_x);
                                animal.investigation_y = Some(target_y);
                                animal.target_player_id = None; // No player target
                                animal.last_food_check = Some(current_time);
                                
                                // Store target info in the animal's state for later use
                                // We'll use held_item_name temporarily to store target type (hacky but works)
                                match &target {
                                    CookingContainerTarget::Campfire { id, .. } => {
                                        animal.held_item_name = Some(format!("__CAMPFIRE_TARGET:{}", id));
                                    }
                                    CookingContainerTarget::Barbecue { id, .. } => {
                                        animal.held_item_name = Some(format!("__BARBECUE_TARGET:{}", id));
                                    }
                                }
                                
                                transition_to_state(animal, AnimalState::Stealing, current_time, None, "detected food in cooking fire");
                                log::info!("🐦🔥 Crow {} detected food in nearby cooking fire at ({:.1}, {:.1}), moving to steal!", 
                                          animal.id, target_x, target_y);
                            }
                        }
                    }
                }
                
                // 🌾 FARM DESTRUCTION 🌾
                // Crows will destroy player-planted crops and growing seeds!
                if animal.held_item_name.is_none() && should_attempt_farm_destruction(animal, current_time) {
                    if let Some(target) = find_nearest_farm_target(ctx, animal.pos_x, animal.pos_y) {
                        let (target_x, target_y) = match &target {
                            FarmTarget::PlantedSeed { pos_x, pos_y, .. } => (*pos_x, *pos_y),
                            FarmTarget::HarvestableCrop { pos_x, pos_y, .. } => (*pos_x, *pos_y),
                        };
                        
                        // 🎃 Don't destroy farms near scarecrows!
                        if is_position_near_scarecrow(ctx, target_x, target_y) {
                            log::debug!("🎃 Crow {} detected farm at ({:.1}, {:.1}) but it's protected by a scarecrow!", 
                                      animal.id, target_x, target_y);
                            // Skip this target, the scarecrow scares us away
                        } else {
                            // Check chance to notice the farm (25% per tick when patrolling)
                            if rng.gen::<f32>() < 0.25 {
                                animal.is_flying = true;
                                animal.investigation_x = Some(target_x);
                                animal.investigation_y = Some(target_y);
                                animal.target_player_id = None; // No player target
                                animal.last_food_check = Some(current_time);
                                
                                // Store target info in the animal's state
                                match &target {
                                    FarmTarget::PlantedSeed { id, .. } => {
                                        animal.held_item_name = Some(format!("__PLANTED_SEED:{}", id));
                                    }
                                    FarmTarget::HarvestableCrop { id, .. } => {
                                        animal.held_item_name = Some(format!("__HARVESTABLE_CROP:{}", id));
                                    }
                                }
                                
                                transition_to_state(animal, AnimalState::Stealing, current_time, None, "detected player farm");
                                log::info!("🐦🌾 Crow {} detected player farm at ({:.1}, {:.1}), moving to destroy!", 
                                          animal.id, target_x, target_y);
                            }
                        }
                    }
                }
                // Normal walking/flying behavior handled by core movement system based on is_flying flag
            },
            
            AnimalState::Stealing => {
                // Attempting to steal from a player OR a campfire/barbecue
                animal.is_flying = true; // Always fly while stealing
                
                // Check if we're targeting a cooking container instead of a player
                let is_targeting_cooking_container = animal.held_item_name.as_ref()
                    .map(|s| s.starts_with("__CAMPFIRE_TARGET:") || s.starts_with("__BARBECUE_TARGET:"))
                    .unwrap_or(false);
                
                if is_targeting_cooking_container {
                    // === CAMPFIRE/BARBECUE STEALING ===
                    if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
                        let dx = animal.pos_x - target_x;
                        let dy = animal.pos_y - target_y;
                        let distance_sq = dx * dx + dy * dy;
                        
                        if distance_sq <= CAMPFIRE_STEAL_ATTEMPT_RADIUS_SQUARED {
                            // Close enough - attempt steal from cooking container!
                            let target_info = animal.held_item_name.clone().unwrap_or_default();
                            animal.held_item_name = None; // Clear the target marker
                            
                            if rng.gen::<f32>() < CAMPFIRE_STEAL_CHANCE {
                                let stolen = if target_info.starts_with("__CAMPFIRE_TARGET:") {
                                    let id_str = target_info.strip_prefix("__CAMPFIRE_TARGET:").unwrap_or("0");
                                    let campfire_id: u32 = id_str.parse().unwrap_or(0);
                                    try_steal_from_campfire(ctx, campfire_id, rng)
                                } else if target_info.starts_with("__BARBECUE_TARGET:") {
                                    let id_str = target_info.strip_prefix("__BARBECUE_TARGET:").unwrap_or("0");
                                    let barbecue_id: u32 = id_str.parse().unwrap_or(0);
                                    try_steal_from_barbecue(ctx, barbecue_id, rng)
                                } else {
                                    None
                                };
                                
                                if let Some((item_name, quantity)) = stolen {
                                    animal.held_item_name = Some(item_name.clone());
                                    animal.held_item_quantity = Some(quantity);
                                    log::info!("🐦🔥 Crow {} stole {} x{} from cooking fire and is fleeing!", 
                                              animal.id, item_name, quantity);
                                    
                                    // Play crow stealing sound at the cooking fire's position
                                    // Use a dummy identity since there's no player target
                                    sound_events::emit_crow_stealing_sound(ctx, target_x, target_y, ctx.identity());
                                    
                                    // Fly away with the loot!
                                    set_flee_destination_away_from_threat(animal, target_x, target_y, 500.0, rng);
                                    transition_to_state(animal, AnimalState::Fleeing, current_time, None, "stole from fire and fleeing");
                                    return Ok(());
                                }
                            }
                            
                            // Failed steal attempt - give up and return to patrol
                            animal.last_food_check = Some(current_time);
                            animal.investigation_x = None;
                            animal.investigation_y = None;
                            transition_to_state(animal, AnimalState::Flying, current_time, None, "campfire steal failed");
                            log::debug!("Crow {} failed to steal from cooking fire, returning to patrol", animal.id);
                        }
                        // Movement toward cooking container handled by core movement system
                    } else {
                        // No target position - clear state and return to patrol
                        animal.held_item_name = None;
                        animal.investigation_x = None;
                        animal.investigation_y = None;
                        transition_to_state(animal, AnimalState::Flying, current_time, None, "lost cooking fire target");
                    }
                } else {
                    // Check if we're targeting a farm (planted seed or harvestable crop)
                    let is_targeting_farm = animal.held_item_name.as_ref()
                        .map(|s| s.starts_with("__PLANTED_SEED:") || s.starts_with("__HARVESTABLE_CROP:"))
                        .unwrap_or(false);
                    
                    if is_targeting_farm {
                        // === FARM DESTRUCTION ===
                        if let (Some(target_x), Some(target_y)) = (animal.investigation_x, animal.investigation_y) {
                            let dx = animal.pos_x - target_x;
                            let dy = animal.pos_y - target_y;
                            let distance_sq = dx * dx + dy * dy;
                            
                            if distance_sq <= FARM_DESTROY_ATTEMPT_RADIUS_SQUARED {
                                // Close enough - attempt to destroy the farm!
                                let target_info = animal.held_item_name.clone().unwrap_or_default();
                                animal.held_item_name = None; // Clear the target marker
                                
                                if rng.gen::<f32>() < FARM_DESTROY_CHANCE {
                                    let destroyed = if target_info.starts_with("__PLANTED_SEED:") {
                                        let id_str = target_info.strip_prefix("__PLANTED_SEED:").unwrap_or("0");
                                        let seed_id: u64 = id_str.parse().unwrap_or(0);
                                        try_destroy_planted_seed(ctx, seed_id)
                                    } else if target_info.starts_with("__HARVESTABLE_CROP:") {
                                        let id_str = target_info.strip_prefix("__HARVESTABLE_CROP:").unwrap_or("0");
                                        let crop_id: u64 = id_str.parse().unwrap_or(0);
                                        try_destroy_harvestable_crop(ctx, crop_id)
                                    } else {
                                        false
                                    };
                                    
                                    if destroyed {
                                        log::info!("🐦🌾 Crow {} destroyed a farm crop at ({:.1}, {:.1}) and is fleeing!", 
                                                  animal.id, target_x, target_y);
                                        
                                        // Play crow stealing sound at the farm's position
                                        sound_events::emit_crow_stealing_sound(ctx, target_x, target_y, ctx.identity());
                                        
                                        // Fly away after destruction!
                                        set_flee_destination_away_from_threat(animal, target_x, target_y, 400.0, rng);
                                        transition_to_state(animal, AnimalState::Fleeing, current_time, None, "destroyed farm and fleeing");
                                        return Ok(());
                                    }
                                }
                                
                                // Failed destruction attempt - give up and return to patrol
                                animal.last_food_check = Some(current_time);
                                animal.investigation_x = None;
                                animal.investigation_y = None;
                                transition_to_state(animal, AnimalState::Flying, current_time, None, "farm destruction failed");
                                log::debug!("Crow {} failed to destroy farm, returning to patrol", animal.id);
                            }
                            // Movement toward farm handled by core movement system
                        } else {
                            // No target position - clear state and return to patrol
                            animal.held_item_name = None;
                            animal.investigation_x = None;
                            animal.investigation_y = None;
                            transition_to_state(animal, AnimalState::Flying, current_time, None, "lost farm target");
                        }
                    } else if let Some(target_id) = animal.target_player_id {
                        // === PLAYER STEALING ===
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
                        animal.held_item_name = None;
                        animal.investigation_x = None;
                        animal.investigation_y = None;
                        transition_to_state(animal, AnimalState::Flying, current_time, None, "no steal target");
                    }
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

/// Check if enough time has passed since last campfire/barbecue food check
fn should_attempt_campfire_steal(animal: &WildAnimal, current_time: Timestamp) -> bool {
    if let Some(last_food_check) = animal.last_food_check {
        let time_since_last = current_time.to_micros_since_unix_epoch() - last_food_check.to_micros_since_unix_epoch();
        time_since_last >= CAMPFIRE_FOOD_CHECK_COOLDOWN_MS * 1000
    } else {
        true // No previous attempt
    }
}

/// Check if a position is within the deterrence radius of any scarecrow
/// Scarecrows are WoodenStorageBox entities with box_type == BOX_TYPE_SCARECROW
fn is_position_near_scarecrow(ctx: &ReducerContext, x: f32, y: f32) -> bool {
    for storage_box in ctx.db.wooden_storage_box().iter() {
        if storage_box.box_type == BOX_TYPE_SCARECROW {
            let dx = x - storage_box.pos_x;
            let dy = y - storage_box.pos_y;
            let distance_sq = dx * dx + dy * dy;
            if distance_sq <= SCARECROW_DETERRENCE_RADIUS_SQUARED {
                return true;
            }
        }
    }
    false
}

/// Find the nearest scarecrow to a position if within deterrence range
/// Returns the scarecrow position if found
fn find_nearest_scarecrow(ctx: &ReducerContext, x: f32, y: f32) -> Option<(f32, f32)> {
    let mut closest: Option<(f32, f32, f32)> = None; // (pos_x, pos_y, dist_sq)
    
    for storage_box in ctx.db.wooden_storage_box().iter() {
        if storage_box.box_type == BOX_TYPE_SCARECROW {
            let dx = x - storage_box.pos_x;
            let dy = y - storage_box.pos_y;
            let distance_sq = dx * dx + dy * dy;
            if distance_sq <= SCARECROW_DETERRENCE_RADIUS_SQUARED {
                let current_dist = closest.as_ref().map_or(f32::MAX, |(_, _, d)| *d);
                if distance_sq < current_dist {
                    closest = Some((storage_box.pos_x, storage_box.pos_y, distance_sq));
                }
            }
        }
    }
    
    closest.map(|(x, y, _)| (x, y))
}

// ============================================================================
// FARM DESTRUCTION FUNCTIONS
// Crows will destroy player-planted crops and growing seeds! These pesky birds
// are the natural enemy of farmers - they eat seeds and destroy young crops.
// ============================================================================

/// Enum to track what type of farm target the crow is targeting
#[derive(Clone, Debug)]
enum FarmTarget {
    PlantedSeed { id: u64, pos_x: f32, pos_y: f32 },
    HarvestableCrop { id: u64, pos_x: f32, pos_y: f32 },
}

/// Check if enough time has passed since last farm destruction check
fn should_attempt_farm_destruction(animal: &WildAnimal, current_time: Timestamp) -> bool {
    if let Some(last_food_check) = animal.last_food_check {
        let time_since_last = current_time.to_micros_since_unix_epoch() - last_food_check.to_micros_since_unix_epoch();
        time_since_last >= FARM_CHECK_COOLDOWN_MS * 1000
    } else {
        true // No previous attempt
    }
}

/// Find the nearest farm target (planted seed or player-planted harvestable) within detection range
fn find_nearest_farm_target(ctx: &ReducerContext, crow_x: f32, crow_y: f32) -> Option<FarmTarget> {
    let mut closest_target: Option<(FarmTarget, f32)> = None;
    
    // Check planted seeds (always player-planted, always valid targets)
    for seed in ctx.db.planted_seed().iter() {
        let dx = crow_x - seed.pos_x;
        let dy = crow_y - seed.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= FARM_DETECTION_RADIUS_SQUARED {
            let current_dist = closest_target.as_ref().map_or(f32::MAX, |(_, d)| *d);
            if distance_sq < current_dist {
                closest_target = Some((FarmTarget::PlantedSeed {
                    id: seed.id,
                    pos_x: seed.pos_x,
                    pos_y: seed.pos_y,
                }, distance_sq));
            }
        }
    }
    
    // Check harvestable resources (only player-planted ones!)
    for resource in ctx.db.harvestable_resource().iter() {
        // Skip wild plants (only destroy player-planted crops)
        if !resource.is_player_planted {
            continue;
        }
        
        // Skip resources that are already harvested (waiting for respawn)
        if resource.respawn_at.is_some() {
            continue;
        }
        
        let dx = crow_x - resource.pos_x;
        let dy = crow_y - resource.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= FARM_DETECTION_RADIUS_SQUARED {
            let current_dist = closest_target.as_ref().map_or(f32::MAX, |(_, d)| *d);
            if distance_sq < current_dist {
                closest_target = Some((FarmTarget::HarvestableCrop {
                    id: resource.id,
                    pos_x: resource.pos_x,
                    pos_y: resource.pos_y,
                }, distance_sq));
            }
        }
    }
    
    closest_target.map(|(target, _)| target)
}

/// Attempt to destroy a planted seed. Returns true if successful.
fn try_destroy_planted_seed(ctx: &ReducerContext, seed_id: u64) -> bool {
    if let Some(seed) = ctx.db.planted_seed().id().find(seed_id) {
        // Delete the planted seed - it's been destroyed by the crow!
        ctx.db.planted_seed().id().delete(seed_id);
        log::info!("🐦🌾 Crow destroyed planted seed '{}' (ID: {}) at ({:.1}, {:.1})", 
                  seed.seed_type, seed_id, seed.pos_x, seed.pos_y);
        true
    } else {
        log::debug!("Planted seed {} not found for crow destruction", seed_id);
        false
    }
}

/// Attempt to destroy a harvestable crop. Returns true if successful.
/// Instead of deleting, we set respawn_at to trigger respawn (simulating the crop being ruined)
fn try_destroy_harvestable_crop(ctx: &ReducerContext, crop_id: u64) -> bool {
    use std::time::Duration;
    use spacetimedb::TimeDuration;
    
    if let Some(mut crop) = ctx.db.harvestable_resource().id().find(crop_id) {
        // Only destroy if not already harvested
        if crop.respawn_at.is_some() {
            return false;
        }
        
        // Set respawn time far in the future to simulate the crop being destroyed
        // The crop will eventually respawn but the player loses this harvest
        let respawn_delay_secs = 300; // 5 minutes respawn after crow destruction
        let respawn_time = ctx.timestamp + TimeDuration::from(Duration::from_secs(respawn_delay_secs));
        crop.respawn_at = Some(respawn_time);
        ctx.db.harvestable_resource().id().update(crop.clone());
        
        log::info!("🐦🌾 Crow destroyed harvestable crop {:?} (ID: {}) at ({:.1}, {:.1})", 
                  crop.plant_type, crop_id, crop.pos_x, crop.pos_y);
        true
    } else {
        log::debug!("Harvestable crop {} not found for crow destruction", crop_id);
        false
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

// ============================================================================
// CAMPFIRE/BARBECUE FOOD STEALING FUNCTIONS
// Crows are bold thieves that don't fear fire! They'll swoop in to steal
// food items directly from burning campfires and barbecues.
// ============================================================================

/// Enum to track what type of cooking container the crow is targeting
#[derive(Clone, Debug)]
enum CookingContainerTarget {
    Campfire { id: u32, pos_x: f32, pos_y: f32 },
    Barbecue { id: u32, pos_x: f32, pos_y: f32 },
}

/// Find the nearest campfire or barbecue that has food items within detection range
fn find_nearest_cooking_container_with_food(ctx: &ReducerContext, crow_x: f32, crow_y: f32) -> Option<CookingContainerTarget> {
    let mut closest_target: Option<(CookingContainerTarget, f32)> = None;
    
    // Check campfires for food
    for campfire in ctx.db.campfire().iter() {
        if campfire.is_destroyed {
            continue;
        }
        
        let dx = crow_x - campfire.pos_x;
        let dy = crow_y - campfire.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= CAMPFIRE_FOOD_DETECTION_RADIUS_SQUARED {
            // Check if this campfire has food items
            if campfire_has_food(ctx, &campfire) {
                let current_dist = closest_target.as_ref().map_or(f32::MAX, |(_, d)| *d);
                if distance_sq < current_dist {
                    closest_target = Some((CookingContainerTarget::Campfire {
                        id: campfire.id,
                        pos_x: campfire.pos_x,
                        pos_y: campfire.pos_y,
                    }, distance_sq));
                }
            }
        }
    }
    
    // Check barbecues for food
    for barbecue in ctx.db.barbecue().iter() {
        if barbecue.is_destroyed {
            continue;
        }
        
        let dx = crow_x - barbecue.pos_x;
        let dy = crow_y - barbecue.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= CAMPFIRE_FOOD_DETECTION_RADIUS_SQUARED {
            // Check if this barbecue has food items
            if barbecue_has_food(ctx, &barbecue) {
                let current_dist = closest_target.as_ref().map_or(f32::MAX, |(_, d)| *d);
                if distance_sq < current_dist {
                    closest_target = Some((CookingContainerTarget::Barbecue {
                        id: barbecue.id,
                        pos_x: barbecue.pos_x,
                        pos_y: barbecue.pos_y,
                    }, distance_sq));
                }
            }
        }
    }
    
    closest_target.map(|(target, _)| target)
}

/// Check if a campfire has any food items in its slots
fn campfire_has_food(ctx: &ReducerContext, campfire: &Campfire) -> bool {
    for slot_index in 0..NUM_CAMPFIRE_SLOTS as u8 {
        if let Some(instance_id) = campfire.get_slot_instance_id(slot_index) {
            if let Some(def_id) = campfire.get_slot_def_id(slot_index) {
                if is_food_item(ctx, def_id) {
                    // Also check that the item has quantity > 0
                    if let Some(item) = ctx.db.inventory_item().instance_id().find(&instance_id) {
                        if item.quantity > 0 {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

/// Check if a barbecue has any food items in its slots
fn barbecue_has_food(ctx: &ReducerContext, barbecue: &Barbecue) -> bool {
    for slot_index in 0..NUM_BARBECUE_SLOTS as u8 {
        if let Some(instance_id) = barbecue.get_slot_instance_id(slot_index) {
            if let Some(def_id) = barbecue.get_slot_def_id(slot_index) {
                if is_food_item(ctx, def_id) {
                    // Also check that the item has quantity > 0
                    if let Some(item) = ctx.db.inventory_item().instance_id().find(&instance_id) {
                        if item.quantity > 0 {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

/// Attempt to steal food from a campfire. Returns (item_name, quantity) if successful.
fn try_steal_from_campfire(ctx: &ReducerContext, campfire_id: u32, rng: &mut impl Rng) -> Option<(String, u32)> {
    use crate::items::item_definition as ItemDefinitionTableTrait;
    
    let campfire = ctx.db.campfire().id().find(campfire_id)?;
    
    // Collect all food items from this campfire's slots
    let mut food_slots: Vec<(u8, u64, u64)> = Vec::new(); // (slot_index, instance_id, def_id)
    
    for slot_index in 0..NUM_CAMPFIRE_SLOTS as u8 {
        if let (Some(instance_id), Some(def_id)) = (campfire.get_slot_instance_id(slot_index), campfire.get_slot_def_id(slot_index)) {
            if is_food_item(ctx, def_id) {
                if let Some(item) = ctx.db.inventory_item().instance_id().find(&instance_id) {
                    if item.quantity > 0 {
                        food_slots.push((slot_index, instance_id, def_id));
                    }
                }
            }
        }
    }
    
    if food_slots.is_empty() {
        return None;
    }
    
    // Pick a random food slot
    let (slot_index, instance_id, def_id) = food_slots[rng.gen_range(0..food_slots.len())];
    
    // Get the item details
    let item = ctx.db.inventory_item().instance_id().find(&instance_id)?;
    let item_def = ctx.db.item_definition().id().find(&def_id)?;
    
    // Steal 1 item from the stack
    let steal_quantity = 1.min(item.quantity);
    let remaining = item.quantity - steal_quantity;
    
    // Update or delete the item
    if remaining == 0 {
        ctx.db.inventory_item().instance_id().delete(&instance_id);
        // Clear the slot in the campfire
        let mut updated_campfire = campfire;
        updated_campfire.set_slot(slot_index, None, None);
        ctx.db.campfire().id().update(updated_campfire);
    } else {
        let mut updated_item = item;
        updated_item.quantity = remaining;
        ctx.db.inventory_item().instance_id().update(updated_item);
    }
    
    log::info!("🐦🔥 Crow stole {} x{} from campfire {} slot {} (remaining: {})", 
              item_def.name, steal_quantity, campfire_id, slot_index, remaining);
    
    Some((item_def.name.clone(), steal_quantity))
}

/// Attempt to steal food from a barbecue. Returns (item_name, quantity) if successful.
fn try_steal_from_barbecue(ctx: &ReducerContext, barbecue_id: u32, rng: &mut impl Rng) -> Option<(String, u32)> {
    use crate::items::item_definition as ItemDefinitionTableTrait;
    
    let barbecue = ctx.db.barbecue().id().find(barbecue_id)?;
    
    // Collect all food items from this barbecue's slots
    let mut food_slots: Vec<(u8, u64, u64)> = Vec::new(); // (slot_index, instance_id, def_id)
    
    for slot_index in 0..NUM_BARBECUE_SLOTS as u8 {
        if let (Some(instance_id), Some(def_id)) = (barbecue.get_slot_instance_id(slot_index), barbecue.get_slot_def_id(slot_index)) {
            if is_food_item(ctx, def_id) {
                if let Some(item) = ctx.db.inventory_item().instance_id().find(&instance_id) {
                    if item.quantity > 0 {
                        food_slots.push((slot_index, instance_id, def_id));
                    }
                }
            }
        }
    }
    
    if food_slots.is_empty() {
        return None;
    }
    
    // Pick a random food slot
    let (slot_index, instance_id, def_id) = food_slots[rng.gen_range(0..food_slots.len())];
    
    // Get the item details
    let item = ctx.db.inventory_item().instance_id().find(&instance_id)?;
    let item_def = ctx.db.item_definition().id().find(&def_id)?;
    
    // Steal 1 item from the stack
    let steal_quantity = 1.min(item.quantity);
    let remaining = item.quantity - steal_quantity;
    
    // Update or delete the item
    if remaining == 0 {
        ctx.db.inventory_item().instance_id().delete(&instance_id);
        // Clear the slot in the barbecue
        let mut updated_barbecue = barbecue;
        updated_barbecue.set_slot(slot_index, None, None);
        ctx.db.barbecue().id().update(updated_barbecue);
    } else {
        let mut updated_item = item;
        updated_item.quantity = remaining;
        ctx.db.inventory_item().instance_id().update(updated_item);
    }
    
    log::info!("🐦🍖 Crow stole {} x{} from barbecue {} slot {} (remaining: {})", 
              item_def.name, steal_quantity, barbecue_id, slot_index, remaining);
    
    Some((item_def.name.clone(), steal_quantity))
}

