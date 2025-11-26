/******************************************************************************
 *                                                                            *
 * Arctic Walrus Behavior - Defensive Beach Guardian                         *
 *                                                                            *
 * Walruses are massive, slow defensive animals that patrol beaches.         *
 * They only attack when provoked (attacked first), never flee from threats, *
 * and are extremely persistent once engaged.                                *
 * Strong but slow with equal movement and sprint speeds.                    *
 *                                                                            *
 * UNIQUE TRAIT: Walruses are CURIOUS about light sources (campfires,        *
 * lanterns). Instead of fearing fire like other animals, they will          *
 * investigate and slowly circle around warm glowing lights, watching        *
 * with fascination while keeping a safe distance.                           *
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
use crate::campfire::campfire as CampfireTableTrait;
use crate::lantern::lantern as LanternTableTrait;
use super::core::{
    AnimalBehavior, AnimalStats, AnimalState, MovementPattern, WildAnimal, AnimalSpecies,
    move_towards_target, can_attack, transition_to_state, emit_species_sound,
    execute_standard_patrol, get_player_distance, is_player_in_chase_range, wild_animal,
    TAMING_PROTECT_RADIUS, ThreatType, detect_threats_to_owner, find_closest_threat,
    handle_generic_threat_targeting, detect_and_handle_stuck_movement,
};

// Walrus light curiosity constants
const LIGHT_CURIOSITY_DETECTION_RADIUS: f32 = 350.0; // How far walrus can detect light sources
const LIGHT_CURIOSITY_DETECTION_RADIUS_SQUARED: f32 = LIGHT_CURIOSITY_DETECTION_RADIUS * LIGHT_CURIOSITY_DETECTION_RADIUS;
const LIGHT_CURIOSITY_MIN_DISTANCE: f32 = 120.0; // Minimum distance to keep from light source
const LIGHT_CURIOSITY_MAX_DISTANCE: f32 = 180.0; // Maximum distance to orbit at
const LIGHT_CURIOSITY_ORBIT_SPEED: f32 = 0.4; // Radians per second for circling (slow, curious pace)
const LIGHT_CURIOSITY_CHANCE: f32 = 0.02; // 2% chance per tick to notice light when patrolling

pub struct ArcticWalrusBehavior;

// Walrus-specific trait (for future extensions if needed)
pub trait WalrusBehavior {
    // Walruses have simple behavior - no special methods needed for now
}

impl WalrusBehavior for ArcticWalrusBehavior {
    // Implementation placeholder for future walrus-specific behaviors
}

impl AnimalBehavior for ArcticWalrusBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 400.0, // Very tanky - takes 8 bow shots to kill
            attack_damage: 35.0, // High damage but slow attacks
            attack_range: 96.0, // Large attack range due to size
            attack_speed_ms: 2000, // Very slow attacks (2 seconds)
            movement_speed: 120.0, // Very slow patrol speed
            sprint_speed: 120.0, // Same as movement speed - walruses can't sprint
            perception_range: 300.0, // Moderate detection range
            perception_angle_degrees: 180.0, // Standard forward-facing vision
            patrol_radius: 200.0, // Small patrol area - stay on beaches
            chase_trigger_range: 400.0, // Will chase far once provoked
            flee_trigger_health_percent: 0.0, // Never flees (0% = never flee)
            hide_duration_ms: 0, // Walruses don't hide
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
        
        // Walrus tusk strike - massive damage and knockback
        log::info!("Arctic Walrus {} delivers crushing tusk strike to player {}!", 
                  animal.id, target_player.identity);
        
        // 30% chance to cause bleeding from tusk wounds
        if rng.gen::<f32>() < 0.3 {
            if let Err(e) = crate::active_effects::apply_bleeding_effect(
                ctx, 
                target_player.identity, 
                20.0, // Heavy bleeding damage
                15.0, // Duration: 15 seconds
                3.0   // Tick every 3 seconds
            ) {
                log::error!("Failed to apply bleeding effect from walrus attack: {}", e);
            } else {
                log::info!("Arctic Walrus {} causes severe bleeding with tusk strike!", animal.id);
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
        // 🦭 WALRUS DEFENSIVE BEHAVIOR: Only attack when provoked
        // Walruses ignore fire and never flee - they are purely reactive
        
        // 🐕 TAMED WALRUS BEHAVIOR: If tamed, follow owner and protect them
        if let Some(owner_id) = animal.tamed_by {
            // Tamed walruses don't attack their owner or patrol aggressively
            if let Some(player) = detected_player {
                if player.identity == owner_id {
                    // This is our owner - don't be aggressive
                    if matches!(animal.state, AnimalState::Chasing | AnimalState::Alert) {
                        transition_to_state(animal, AnimalState::Following, current_time, Some(owner_id), "owner detected - following");
                    }
                    return Ok(());
                }
            }
            
            // Check for threats to our owner using the generic threat detection system
            if handle_generic_threat_targeting(ctx, animal, owner_id, current_time).is_some() {
                        return Ok(());
            }
            
            // If we're in Following or Protecting state, let the core taming system handle movement
            if matches!(animal.state, AnimalState::Following | AnimalState::Protecting) {
                return Ok(());
            }
            
            // Otherwise, default to following if tamed
            transition_to_state(animal, AnimalState::Following, current_time, Some(owner_id), "tamed - defaulting to follow");
            return Ok(());
        }
        
        // 🦭 WILD WALRUS BEHAVIOR: Normal defensive walrus logic
        match animal.state {
            AnimalState::Patrolling => {
                // First check for nearby players that might make us alert
                if let Some(player) = detected_player {
                    let distance = get_player_distance(animal, player);
                    
                    // Walruses only become alert when players get close - they don't attack unprovoked
                    if distance <= stats.perception_range * 0.6 { // 60% of perception range for alert
                        transition_to_state(animal, AnimalState::Alert, current_time, None, "player nearby");
                        
                        // 🔊 WALRUS SOUND: Emit warning bellow when player gets close
                        emit_species_sound(ctx, animal, player.identity, "warning");
                        
                        log::info!("Arctic Walrus {} becomes alert - player {} approaching at {:.1}px", 
                                  animal.id, player.identity, distance);
                        return Ok(());
                    }
                }
                
                // 🔥 LIGHT CURIOSITY: Check for nearby light sources (campfires, lanterns)
                // Walruses are curious about warm glowing lights - they'll investigate!
                if rng.gen::<f32>() < LIGHT_CURIOSITY_CHANCE {
                    if let Some((light_x, light_y, _distance_sq)) = find_nearest_light_source(ctx, animal.pos_x, animal.pos_y) {
                        // Set investigation target to the light source
                        animal.investigation_x = Some(light_x);
                        animal.investigation_y = Some(light_y);
                        
                        transition_to_state(animal, AnimalState::Investigating, current_time, None, "curious about light");
                        
                        log::info!("🦭🔥 Arctic Walrus {} curious about light source at ({:.1}, {:.1}) - investigating!", 
                                  animal.id, light_x, light_y);
                    }
                }
            },
            
            AnimalState::Investigating => {
                // 🔥 LIGHT CURIOSITY BEHAVIOR: Circle around light sources at safe distance
                if let (Some(light_x), Some(light_y)) = (animal.investigation_x, animal.investigation_y) {
                    // Check if the light source is still active
                    let light_still_active = find_nearest_light_source(ctx, light_x, light_y)
                        .map(|(lx, ly, _)| {
                            let dx = lx - light_x;
                            let dy = ly - light_y;
                            (dx * dx + dy * dy) < 100.0 // Within 10px = same light source
                        })
                        .unwrap_or(false);
                    
                    if !light_still_active {
                        // Light went out or was destroyed - return to patrol
                        animal.investigation_x = None;
                        animal.investigation_y = None;
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "light source gone");
                        log::debug!("Arctic Walrus {} - light source gone, returning to patrol", animal.id);
                        return Ok(());
                    }
                    
                    // Check if player gets too close while investigating
                    if let Some(player) = detected_player {
                        let distance = get_player_distance(animal, player);
                        if distance <= stats.perception_range * 0.4 { // Alert at 40% range while investigating
                            animal.investigation_x = None;
                            animal.investigation_y = None;
                            transition_to_state(animal, AnimalState::Alert, current_time, None, "player too close");
                            emit_species_sound(ctx, animal, player.identity, "warning");
                            log::info!("Arctic Walrus {} becomes alert - player interrupted light watching", animal.id);
                            return Ok(());
                        }
                    }
                    
                    // 🔄 Execute orbiting movement around the light source
                    // Using AI tick interval approximation (~66ms per tick)
                    let dt = 0.066_f32;
                    execute_light_curiosity_orbit(animal, light_x, light_y, dt, stats, rng);
                    
                    // Occasionally emit a curious grunt while watching the light
                    if rng.gen::<f32>() < 0.005 { // 0.5% chance per tick
                        crate::sound_events::emit_walrus_growl_sound(ctx, animal.pos_x, animal.pos_y, ctx.identity());
                        log::debug!("Arctic Walrus {} grunts curiously at the light", animal.id);
                    }
                    
                    // Randomly decide to stop watching after some time (average ~1 minute watching)
                    if rng.gen::<f32>() < 0.001 {
                        animal.investigation_x = None;
                        animal.investigation_y = None;
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "lost interest in light");
                        log::debug!("Arctic Walrus {} lost interest in light, resuming patrol", animal.id);
                    }
                } else {
                    // No investigation target - return to patrol
                    transition_to_state(animal, AnimalState::Patrolling, current_time, None, "no investigation target");
                }
            },
            
            AnimalState::Alert => {
                if let Some(player) = detected_player {
                    let distance = get_player_distance(animal, player);
                    
                    // Stay alert while player is nearby, return to patrol if they leave
                    if distance > stats.perception_range {
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "player left area");
                        log::debug!("Arctic Walrus {} returning to patrol - player moved away", animal.id);
                    }
                    // Note: Walruses in Alert state will only attack if damaged (see handle_damage_response)
                } else {
                    // No player detected - return to patrol
                    transition_to_state(animal, AnimalState::Patrolling, current_time, None, "no player detected");
                }
            },
            
            AnimalState::Chasing => {
                // Once provoked, walruses are extremely persistent
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        let distance = get_player_distance(animal, &target_player);
                        
                        // Walruses chase much further than other animals once provoked
                        if distance > (stats.chase_trigger_range * 3.0) { // 3x normal range
                            transition_to_state(animal, AnimalState::Patrolling, current_time, None, "player escaped");
                            log::debug!("Arctic Walrus {} ending chase - player very far away", animal.id);
                        }
                    } else {
                        // Target lost
                        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "target lost");
                    }
                }
            },
            
            AnimalState::Fleeing => {
                // Walruses never flee - immediately return to patrol if somehow set to fleeing
                transition_to_state(animal, AnimalState::Patrolling, current_time, None, "walruses never flee");
                log::warn!("Arctic Walrus {} was set to fleeing state - walruses never flee!", animal.id);
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
        // Walruses never flee - immediately transition back to patrol
        transition_to_state(animal, AnimalState::Patrolling, current_time, None, "walruses never flee");
        animal.investigation_x = None;
        animal.investigation_y = None;
        log::warn!("Arctic Walrus {} attempted to flee - corrected to patrol state", animal.id);
    }

    fn execute_patrol_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        dt: f32,
        rng: &mut impl Rng,
    ) {
        // 🔊 WALRUS RANDOM GROWLING: Walruses make sounds randomly while patrolling
        if rng.gen::<f32>() < 0.008 { // 0.8% chance per tick = roughly every 2-4 seconds (more vocal than before)
            crate::sound_events::emit_walrus_growl_sound(ctx, animal.pos_x, animal.pos_y, ctx.identity());
            log::debug!("Arctic Walrus {} emits territorial growl while patrolling", animal.id);
        }
        
        // MODIFIED PATROL: Walruses move less and stay closer to their spawn point and group
        let modified_stats = AnimalStats {
            patrol_radius: 80.0, // Much smaller patrol radius
            movement_speed: stats.movement_speed * 0.6, // Move 40% slower during patrol
            ..stats.clone()
        };
        
        // Try to stay near other walruses (group behavior)
        if rng.gen::<f32>() < 0.15 { // 15% chance to check for nearby walruses
            if let Some((group_x, group_y)) = find_nearby_walrus_group_center(ctx, animal) {
                let distance_to_group = ((animal.pos_x - group_x).powi(2) + (animal.pos_y - group_y).powi(2)).sqrt();
                
                // If too far from group, bias movement toward them
                if distance_to_group > 120.0 { // Move toward group if more than 120px away
                    let dx = group_x - animal.pos_x;
                    let dy = group_y - animal.pos_y;
                    let group_distance = (dx * dx + dy * dy).sqrt();
                    
                    if group_distance > 0.0 {
                        // Bias direction toward group with some randomness
                        let group_weight = 0.6; // 60% toward group, 40% random patrol
                        let random_angle = rng.gen::<f32>() * 2.0 * PI;
                        let group_angle = dy.atan2(dx);
                        
                        animal.direction_x = group_weight * group_angle.cos() + (1.0 - group_weight) * random_angle.cos();
                        animal.direction_y = group_weight * group_angle.sin() + (1.0 - group_weight) * random_angle.sin();
                        
                        // Normalize the direction
                        let length = (animal.direction_x * animal.direction_x + animal.direction_y * animal.direction_y).sqrt();
                        if length > 0.0 {
                            animal.direction_x /= length;
                            animal.direction_y /= length;
                        }
                        
                        log::debug!("Arctic Walrus {} moving toward walrus group at ({:.1}, {:.1})", 
                                   animal.id, group_x, group_y);
                    }
                }
            }
        }
        
        execute_standard_patrol(ctx, animal, &modified_stats, dt, rng);
        
        // Additional check to keep walruses on beaches/coastal areas
        // If they wander too far from beach tiles, gently guide them back
        if rng.gen::<f32>() < 0.1 { // 10% chance per tick to check beach proximity
            if !is_position_on_beach_or_coastal(ctx, animal.pos_x, animal.pos_y) {
                // Find direction toward nearest beach and bias movement
                if let Some((beach_x, beach_y)) = find_nearest_beach_tile(ctx, animal.pos_x, animal.pos_y) {
                    let dx = beach_x - animal.pos_x;
                    let dy = beach_y - animal.pos_y;
                    let distance = (dx * dx + dy * dy).sqrt();
                    
                    if distance > 0.0 {
                        // Bias direction toward beach with some randomness
                        let beach_weight = 0.7; // 70% toward beach, 30% random
                        let random_angle = rng.gen::<f32>() * 2.0 * PI;
                        let beach_angle = dy.atan2(dx);
                        
                        animal.direction_x = beach_weight * beach_angle.cos() + (1.0 - beach_weight) * random_angle.cos();
                        animal.direction_y = beach_weight * beach_angle.sin() + (1.0 - beach_weight) * random_angle.sin();
                        
                        // Normalize the direction
                        let length = (animal.direction_x * animal.direction_x + animal.direction_y * animal.direction_y).sqrt();
                        if length > 0.0 {
                            animal.direction_x /= length;
                            animal.direction_y /= length;
                        }
                        
                        log::debug!("Arctic Walrus {} guided back toward beach area", animal.id);
                    }
                }
            }
        }
    }

    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool {
        // Walruses never chase unprovoked - they only attack when damaged first
        // This function should only return true if the walrus is already in a hostile state
        // due to being attacked (which is handled in handle_damage_response)
        // Note: Intimidation doesn't apply to walruses since they don't chase anyway
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
        // 🐕 TAMED WALRUS: Don't attack the owner who tamed us
        if let Some(owner_id) = animal.tamed_by {
            if attacker.identity == owner_id {
                // Our owner hit us - just make a sad sound but don't retaliate
                // Show crying effect for 3 seconds
                animal.crying_effect_until = Some(Timestamp::from_micros_since_unix_epoch(
                    current_time.to_micros_since_unix_epoch() + 3000000 // 3 seconds in microseconds
                ));
                
                emit_species_sound(ctx, animal, attacker.identity, "confused");
                log::info!("🦭💧 Tamed Walrus {} was hit by owner {} - showing crying effect", animal.id, owner_id);
                return Ok(());
            }
            
            // Someone else attacked us while we're tamed - protect our owner by attacking the threat
            transition_to_state(animal, AnimalState::Protecting, current_time, Some(attacker.identity), "defending against attacker");
            emit_species_sound(ctx, animal, attacker.identity, "retaliation");
            log::info!("🦭 Tamed Walrus {} defending against attacker {} (owner: {})", 
                      animal.id, attacker.identity, owner_id);
            return Ok(());
        }
        
        // 🦭 WILD WALRUS RETALIATION: When attacked, walruses become extremely aggressive
        // They never flee and will chase the attacker relentlessly
        // 🐺 NOTE: Walruses are NOT intimidated by wolf fur - they're too massive and defensive!
        
        transition_to_state(animal, AnimalState::Chasing, current_time, Some(attacker.identity), "walrus retaliation");
        
        // 🔊 WALRUS SOUND: Emit aggressive bellow when provoked
        emit_species_sound(ctx, animal, attacker.identity, "retaliation");
        
        log::info!("🦭 Arctic Walrus {} PROVOKED by player {}! Entering aggressive state - walruses never back down!", 
                  animal.id, attacker.identity);
        
        Ok(())
    }
    
    fn can_be_tamed(&self) -> bool {
        true // Walruses can be tamed with fish
    }
    
    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec!["Raw Twigfish", "Cooked Twigfish"] // Fish items that can tame walruses
    }
    
    fn get_chase_abandonment_multiplier(&self) -> f32 {
        4.0 // Walruses are extremely persistent - give up at 4.0x chase trigger range (very territorial)
    }
}

// Helper functions for beach navigation

/// Check if position is on beach or coastal area (beach tile or adjacent to water)
fn is_position_on_beach_or_coastal(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    // Convert pixel position to tile coordinates
    let tile_x = (pos_x / crate::TILE_SIZE_PX as f32).floor() as i32;
    let tile_y = (pos_y / crate::TILE_SIZE_PX as f32).floor() as i32;
    
    // Check if current tile is beach
    if let Some(tile_type) = crate::get_tile_type_at_position(ctx, tile_x, tile_y) {
        if tile_type == crate::TileType::Beach {
            return true;
        }
        
        // If not beach, check if it's adjacent to water (coastal area)
        if tile_type == crate::TileType::Grass || tile_type == crate::TileType::Dirt {
            // Check surrounding tiles for water
            for dy in -1..=1 {
                for dx in -1..=1 {
                    if dx == 0 && dy == 0 { continue; }
                    
                    let check_x = tile_x + dx;
                    let check_y = tile_y + dy;
                    
                    if let Some(adjacent_tile_type) = crate::get_tile_type_at_position(ctx, check_x, check_y) {
                        if adjacent_tile_type.is_water() || adjacent_tile_type == crate::TileType::Beach {
                            return true; // Adjacent to water/beach = coastal (includes Sea and HotSpringWater)
                        }
                    }
                }
            }
        }
    }
    
    false
}

/// Find the nearest beach tile to guide walrus movement
fn find_nearest_beach_tile(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> Option<(f32, f32)> {
    let current_tile_x = (pos_x / crate::TILE_SIZE_PX as f32).floor() as i32;
    let current_tile_y = (pos_y / crate::TILE_SIZE_PX as f32).floor() as i32;
    
    let search_radius = 10; // Search within 10 tiles
    let mut closest_beach: Option<(i32, i32)> = None;
    let mut closest_distance_sq = f32::MAX;
    
    // Search in expanding radius for beach tiles
    for dy in -search_radius..=search_radius {
        for dx in -search_radius..=search_radius {
            let check_x = current_tile_x + dx;
            let check_y = current_tile_y + dy;
            
            // Check bounds
            if check_x < 0 || check_y < 0 || 
               check_x >= crate::WORLD_WIDTH_TILES as i32 || check_y >= crate::WORLD_HEIGHT_TILES as i32 {
                continue;
            }
            
            if let Some(tile_type) = crate::get_tile_type_at_position(ctx, check_x, check_y) {
                if tile_type == crate::TileType::Beach {
                    let distance_sq = (dx * dx + dy * dy) as f32;
                    if distance_sq < closest_distance_sq {
                        closest_distance_sq = distance_sq;
                        closest_beach = Some((check_x, check_y));
                    }
                }
            }
        }
    }
    
    // Convert tile coordinates back to world position
    if let Some((beach_tile_x, beach_tile_y)) = closest_beach {
        let beach_world_x = (beach_tile_x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
        let beach_world_y = (beach_tile_y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
        Some((beach_world_x, beach_world_y))
    } else {
        None
    }
}

/// Find the center of nearby walruses to encourage group behavior
fn find_nearby_walrus_group_center(ctx: &ReducerContext, current_walrus: &WildAnimal) -> Option<(f32, f32)> {
    let search_radius = 200.0; // Look for walruses within 200 pixels
    let mut nearby_walruses = Vec::new();
    
    for walrus in ctx.db.wild_animal().iter() {
        if walrus.id != current_walrus.id && matches!(walrus.species, AnimalSpecies::ArcticWalrus) {
            let distance = ((current_walrus.pos_x - walrus.pos_x).powi(2) + 
                           (current_walrus.pos_y - walrus.pos_y).powi(2)).sqrt();
            
            if distance <= search_radius {
                nearby_walruses.push(walrus);
            }
        }
    }
    
    if nearby_walruses.is_empty() {
        return None;
    }
    
    // Calculate center of nearby walruses
    let total_x: f32 = nearby_walruses.iter().map(|w| w.pos_x).sum();
    let total_y: f32 = nearby_walruses.iter().map(|w| w.pos_y).sum();
    let count = nearby_walruses.len() as f32;
    
    Some((total_x / count, total_y / count))
}

/******************************************************************************
 *                       LIGHT CURIOSITY BEHAVIOR                             *
 *                                                                            *
 * Walruses are curious about light sources (campfires, lanterns).            *
 * They will keep their distance but hover relatively close and circle       *
 * around player campfires - watching the warm glow with interest.           *
 ******************************************************************************/

/// Find the closest active light source (burning campfire or lit lantern) within detection range
fn find_nearest_light_source(ctx: &ReducerContext, walrus_x: f32, walrus_y: f32) -> Option<(f32, f32, f32)> {
    let mut closest_light: Option<(f32, f32, f32)> = None; // (x, y, distance_sq)
    let mut closest_distance_sq = LIGHT_CURIOSITY_DETECTION_RADIUS_SQUARED;
    
    // Check burning campfires
    for campfire in ctx.db.campfire().iter() {
        if !campfire.is_burning || campfire.is_destroyed {
            continue;
        }
        
        let dx = walrus_x - campfire.pos_x;
        let dy = walrus_y - campfire.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= LIGHT_CURIOSITY_DETECTION_RADIUS_SQUARED && distance_sq < closest_distance_sq {
            closest_distance_sq = distance_sq;
            closest_light = Some((campfire.pos_x, campfire.pos_y, distance_sq));
        }
    }
    
    // Check lit lanterns
    for lantern in ctx.db.lantern().iter() {
        if !lantern.is_burning || lantern.is_destroyed {
            continue;
        }
        
        let dx = walrus_x - lantern.pos_x;
        let dy = walrus_y - lantern.pos_y;
        let distance_sq = dx * dx + dy * dy;
        
        if distance_sq <= LIGHT_CURIOSITY_DETECTION_RADIUS_SQUARED && distance_sq < closest_distance_sq {
            closest_distance_sq = distance_sq;
            closest_light = Some((lantern.pos_x, lantern.pos_y, distance_sq));
        }
    }
    
    closest_light
}

/// Execute circling behavior around a light source
/// Walrus will orbit at a safe distance, slowly circling the light with curiosity
fn execute_light_curiosity_orbit(
    animal: &mut WildAnimal, 
    light_x: f32, 
    light_y: f32, 
    dt: f32,
    stats: &AnimalStats,
    rng: &mut impl Rng,
) {
    let dx = animal.pos_x - light_x;
    let dy = animal.pos_y - light_y;
    let current_distance = (dx * dx + dy * dy).sqrt();
    
    // Calculate current angle from light to walrus
    let current_angle = dy.atan2(dx);
    
    // Advance the orbit angle (walruses circle slowly, clockwise)
    // Add some randomness to make it look more natural
    let orbit_variation = if rng.gen::<f32>() < 0.1 { rng.gen::<f32>() * 0.2 - 0.1 } else { 0.0 };
    let new_angle = current_angle + (LIGHT_CURIOSITY_ORBIT_SPEED + orbit_variation) * dt;
    
    // Determine target orbit distance (within min/max range)
    let target_distance = (LIGHT_CURIOSITY_MIN_DISTANCE + LIGHT_CURIOSITY_MAX_DISTANCE) / 2.0;
    
    // Calculate target position on the orbit circle
    let target_x = light_x + target_distance * new_angle.cos();
    let target_y = light_y + target_distance * new_angle.sin();
    
    // Calculate direction to target orbit position
    let move_dx = target_x - animal.pos_x;
    let move_dy = target_y - animal.pos_y;
    let move_distance = (move_dx * move_dx + move_dy * move_dy).sqrt();
    
    if move_distance > 1.0 {
        // Normalize direction
        animal.direction_x = move_dx / move_distance;
        animal.direction_y = move_dy / move_distance;
        
        // Move at slow patrol speed (walruses are curious, not urgent)
        let move_speed = stats.movement_speed * 0.5 * dt; // Half patrol speed
        
        animal.pos_x += animal.direction_x * move_speed;
        animal.pos_y += animal.direction_y * move_speed;
        
        // Update facing direction based on movement
        if animal.direction_x > 0.1 {
            animal.facing_direction = "right".to_string();
        } else if animal.direction_x < -0.1 {
            animal.facing_direction = "left".to_string();
        }
    }
    
    // If too close to the light, back off
    if current_distance < LIGHT_CURIOSITY_MIN_DISTANCE {
        // Move away from light
        if current_distance > 0.0 {
            let away_x = dx / current_distance;
            let away_y = dy / current_distance;
            let backup_speed = stats.movement_speed * 0.3 * dt;
            
            animal.pos_x += away_x * backup_speed;
            animal.pos_y += away_y * backup_speed;
        }
    }
}