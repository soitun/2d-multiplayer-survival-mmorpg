/******************************************************************************
 *                                                                            *
 * Salmon Shark Behavior - Aquatic Apex Predator                             *
 *                                                                            *
 * Salmon Sharks are extremely fast, aggressive aquatic hunters that         *
 * spawn and swim exclusively in water. They are lone hunters and            *
 * persistent predators that rarely give up chase.                           *
 *                                                                            *
 * KEY CHARACTERISTICS:                                                       *
 *   - Water-only: Can ONLY exist in Sea tiles (water)                       *
 *   - Very fast: High movement and sprint speeds in water                   *
 *   - High damage: Devastating bite attacks                                 *
 *   - Persistent: Rarely abandons chase (10x normal multiplier)            *
 *   - Lone hunter: Does not herd or group                                   *
 *   - Cannot be tamed                                                        *
 *                                                                            *
 * COMBAT BALANCE:                                                            *
 *   - Primary counter: Reed Harpoon Gun/Darts                               *
 *   - Escape requirement: Reed Flippers for players to outrun               *
 *   - HP balanced for ~3-5 harpoon dart hits                                *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{ReducerContext, Timestamp, Table};
use rand::Rng;
use log;

use crate::Player;
use crate::utils::get_distance_squared;

// Table trait imports
use crate::player as PlayerTableTrait;
use super::core::{
    AnimalBehavior, AnimalStats, AnimalState, MovementPattern, WildAnimal,
    move_towards_target, can_attack, transition_to_state, emit_species_sound,
    get_player_distance, wild_animal,
};

// Salmon Shark constants
const SHARK_PATROL_WATER_CHECK_RADIUS: i32 = 3; // Check tiles within 3 tile radius for water
const SHARK_CHASE_WATER_RANGE: f32 = 1200.0; // Will chase players up to 1200px while in water

pub struct SalmonSharkBehavior;

impl AnimalBehavior for SalmonSharkBehavior {
    fn get_stats(&self) -> AnimalStats {
        AnimalStats {
            max_health: 150.0, // Moderate health - 3-5 harpoon hits
            attack_damage: 45.0, // High damage - devastating bite
            attack_range: 73.0, // Increased from 64 to compensate for collision pushback preventing hits
            attack_speed_ms: 1200, // Fast attack cycle
            movement_speed: 180.0, // Very fast patrol speed in water
            sprint_speed: 280.0, // Extremely fast chase speed - requires flippers to outrun
            perception_range: 400.0, // Good detection range in water
            perception_angle_degrees: 270.0, // Wide perception cone (sharks sense movement)
            patrol_radius: 350.0, // Large patrol area in water
            chase_trigger_range: 350.0, // Will chase from decent distance
            flee_trigger_health_percent: 0.0, // Sharks never flee (apex predator)
            hide_duration_ms: 0, // Sharks don't hide
        }
    }

    fn get_movement_pattern(&self) -> MovementPattern {
        MovementPattern::Wander // Wander pattern in water
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
        
        // Shark bite attack - high damage and chance for bleeding
        log::info!("🦈 Salmon Shark {} delivers devastating bite to player {}!", 
                  animal.id, target_player.identity);
        
        // 50% chance to cause severe bleeding from shark bite
        if rng.gen::<f32>() < 0.5 {
            if let Err(e) = crate::active_effects::apply_bleeding_effect(
                ctx, 
                target_player.identity, 
                25.0, // Severe bleeding damage
                20.0, // Duration: 20 seconds
                4.0   // Tick every 4 seconds
            ) {
                log::error!("Failed to apply bleeding effect from shark bite: {}", e);
            } else {
                log::info!("🦈💉 Salmon Shark {} causes severe bleeding with bite!", animal.id);
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
        // 🦈 SALMON SHARK WATER CONSTRAINT: Only operate in water
        // Check if shark is on water tile - if not, try to return to water
        if !is_position_on_water(ctx, animal.pos_x, animal.pos_y) {
            // Shark stranded! Try to find nearest water and return
            if let Some((water_x, water_y)) = find_nearest_water_tile(ctx, animal.pos_x, animal.pos_y) {
                animal.investigation_x = Some(water_x);
                animal.investigation_y = Some(water_y);
                transition_to_state(animal, AnimalState::Swimming, current_time, None, "returning to water");
                log::warn!("🦈 Salmon Shark {} stranded on land! Returning to water at ({:.1}, {:.1})", 
                          animal.id, water_x, water_y);
            }
            return Ok(());
        }
        
        match animal.state {
            AnimalState::Idle => {
                // Sharks don't stay idle - they patrol/swim constantly
                transition_to_state(animal, AnimalState::Swimming, current_time, None, "sharks always swim");
            },
            
            AnimalState::Patrolling | AnimalState::Swimming => {
                // Swimming behavior - actively looking for prey
                if let Some(player) = detected_player {
                    // Check if player is in water (snorkeling)
                    if player.is_snorkeling {
                        let distance = get_player_distance(animal, player);
                        
                        if distance <= stats.chase_trigger_range {
                            // Chase the player in water!
                            transition_to_state(animal, AnimalState::SwimmingChase, current_time, Some(player.identity), "prey detected in water");
                            
                            // 🔊 SHARK SOUND: Silent but deadly - just log for now
                            log::info!("🦈 Salmon Shark {} detected underwater prey {} at {:.1}px - initiating chase!", 
                                      animal.id, player.identity, distance);
                            return Ok(());
                        }
                    }
                }
                
                // Ensure we're in Swimming state (not generic Patrolling)
                if !matches!(animal.state, AnimalState::Swimming) {
                    transition_to_state(animal, AnimalState::Swimming, current_time, None, "aquatic patrol");
                }
            },
            
            AnimalState::Chasing | AnimalState::SwimmingChase => {
                // Aggressive underwater chase - sharks are extremely persistent
                if let Some(target_id) = animal.target_player_id {
                    if let Some(target_player) = ctx.db.player().identity().find(&target_id) {
                        let distance = get_player_distance(animal, &target_player);
                        
                        // Check if target left the water
                        if !target_player.is_snorkeling {
                            // Target surfaced - patrol near where they surfaced
                            transition_to_state(animal, AnimalState::Swimming, current_time, None, "prey surfaced");
                            log::info!("🦈 Salmon Shark {} lost target {} - prey surfaced", animal.id, target_id);
                            return Ok(());
                        }
                        
                        // Sharks chase VERY far (10x normal abandonment range)
                        let abandonment_distance = stats.chase_trigger_range * self.get_chase_abandonment_multiplier();
                        if distance > abandonment_distance {
                            transition_to_state(animal, AnimalState::Swimming, current_time, None, "prey escaped");
                            log::debug!("🦈 Salmon Shark {} abandoning chase - prey too far", animal.id);
                        }
                    } else {
                        // Target lost (disconnected?)
                        transition_to_state(animal, AnimalState::Swimming, current_time, None, "target lost");
                    }
                }
                
                // Ensure we're in SwimmingChase state (not generic Chasing)
                if matches!(animal.state, AnimalState::Chasing) {
                    transition_to_state(animal, AnimalState::SwimmingChase, current_time, animal.target_player_id, "aquatic chase");
                }
            },
            
            AnimalState::Attacking => {
                // Standard attack state - handled by core system
            },
            
            AnimalState::Fleeing => {
                // Sharks never flee - they're apex predators
                transition_to_state(animal, AnimalState::Swimming, current_time, None, "sharks never flee");
                log::warn!("🦈 Salmon Shark {} was set to fleeing state - sharks never flee!", animal.id);
            },
            
            _ => {
                // Other states - default to swimming for sharks
                transition_to_state(animal, AnimalState::Swimming, current_time, None, "default to swimming");
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
        // Sharks never flee - immediately transition back to swimming
        transition_to_state(animal, AnimalState::Swimming, current_time, None, "sharks never flee");
        log::warn!("🦈 Salmon Shark {} attempted to flee - corrected to swimming state", animal.id);
    }

    fn execute_patrol_logic(
        &self,
        ctx: &ReducerContext,
        animal: &mut WildAnimal,
        stats: &AnimalStats,
        dt: f32,
        rng: &mut impl Rng,
    ) {
        // 🦈 WATER-ONLY PATROL: Sharks only patrol in water tiles
        execute_water_patrol(ctx, animal, stats, dt, rng);
    }

    fn should_chase_player(&self, ctx: &ReducerContext, animal: &WildAnimal, stats: &AnimalStats, player: &Player) -> bool {
        // Sharks only chase players who are in the water (snorkeling)
        if !player.is_snorkeling {
            return false;
        }
        
        // Check if shark is in water
        if !is_position_on_water(ctx, animal.pos_x, animal.pos_y) {
            return false;
        }
        
        // Chase if within range
        let distance = get_player_distance(animal, player);
        distance <= stats.chase_trigger_range
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
        // 🦈 SHARK AGGRESSION: When attacked, sharks become even more aggressive
        // They will relentlessly chase the attacker
        
        // If attacker is in water, chase them
        if attacker.is_snorkeling {
            transition_to_state(animal, AnimalState::SwimmingChase, current_time, Some(attacker.identity), "shark retaliation");
            log::info!("🦈 Salmon Shark {} ENRAGED by player {}! Initiating aggressive pursuit!", 
                      animal.id, attacker.identity);
        } else {
            // Attacker is on surface - patrol near the area
            animal.investigation_x = Some(attacker.position_x);
            animal.investigation_y = Some(attacker.position_y);
            transition_to_state(animal, AnimalState::Swimming, current_time, None, "circling attack location");
            log::info!("🦈 Salmon Shark {} attacked by surface player {} - circling area", 
                      animal.id, attacker.identity);
        }
        
        Ok(())
    }
    
    fn can_be_tamed(&self) -> bool {
        false // Sharks cannot be tamed - they're wild apex predators
    }
    
    fn get_taming_foods(&self) -> Vec<&'static str> {
        vec![] // No taming foods - sharks can't be tamed
    }
    
    fn get_chase_abandonment_multiplier(&self) -> f32 {
        10.0 // Extremely persistent - give up at 10x chase trigger range (rarely abandons)
    }
}

// ============================================================================
// Helper functions for water-based behavior
// ============================================================================

/// Check if a position is on a water tile (Sea)
fn is_position_on_water(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    let tile_x = (pos_x / crate::TILE_SIZE_PX as f32).floor() as i32;
    let tile_y = (pos_y / crate::TILE_SIZE_PX as f32).floor() as i32;
    
    if let Some(tile_type) = crate::get_tile_type_at_position(ctx, tile_x, tile_y) {
        // Only Sea tiles count as water for sharks (not hot springs)
        tile_type == crate::TileType::Sea
    } else {
        false
    }
}

/// Find the nearest water tile to guide shark back to water
fn find_nearest_water_tile(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> Option<(f32, f32)> {
    let current_tile_x = (pos_x / crate::TILE_SIZE_PX as f32).floor() as i32;
    let current_tile_y = (pos_y / crate::TILE_SIZE_PX as f32).floor() as i32;
    
    let search_radius = 15; // Search within 15 tiles
    let mut closest_water: Option<(i32, i32)> = None;
    let mut closest_distance_sq = f32::MAX;
    
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
                if tile_type == crate::TileType::Sea {
                    let distance_sq = (dx * dx + dy * dy) as f32;
                    if distance_sq < closest_distance_sq {
                        closest_distance_sq = distance_sq;
                        closest_water = Some((check_x, check_y));
                    }
                }
            }
        }
    }
    
    // Convert tile coordinates back to world position
    if let Some((water_tile_x, water_tile_y)) = closest_water {
        let water_world_x = (water_tile_x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
        let water_world_y = (water_tile_y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
        Some((water_world_x, water_world_y))
    } else {
        None
    }
}

/// Execute water-only patrol behavior for sharks
fn execute_water_patrol(
    ctx: &ReducerContext,
    animal: &mut WildAnimal,
    stats: &AnimalStats,
    dt: f32,
    rng: &mut impl Rng,
) {
    use std::f32::consts::PI;
    
    // Store starting position for facing direction update
    let start_x = animal.pos_x;
    let start_y = animal.pos_y;
    
    // Check if current position is on water
    if !is_position_on_water(ctx, animal.pos_x, animal.pos_y) {
        // Not on water - find nearest water and head there
        if let Some((water_x, water_y)) = find_nearest_water_tile(ctx, animal.pos_x, animal.pos_y) {
            let dx = water_x - animal.pos_x;
            let dy = water_y - animal.pos_y;
            let dist = (dx * dx + dy * dy).sqrt();
            
            if dist > 0.0 {
                animal.direction_x = dx / dist;
                animal.direction_y = dy / dist;
                
                let speed = stats.movement_speed * dt;
                animal.pos_x += animal.direction_x * speed;
                animal.pos_y += animal.direction_y * speed;
            }
        }
        return;
    }
    
    // Periodically change direction (wander pattern)
    if rng.gen::<f32>() < 0.02 { // 2% chance per tick to change direction
        let angle = rng.gen::<f32>() * 2.0 * PI;
        animal.direction_x = angle.cos();
        animal.direction_y = angle.sin();
    }
    
    // Calculate potential new position
    let speed = stats.movement_speed * dt;
    let new_x = animal.pos_x + animal.direction_x * speed;
    let new_y = animal.pos_y + animal.direction_y * speed;
    
    // Check if new position would be on water
    if is_position_on_water(ctx, new_x, new_y) {
        // Valid water position - move there
        animal.pos_x = new_x;
        animal.pos_y = new_y;
    } else {
        // Would leave water - bounce off the boundary
        // Try to find a valid direction
        for _ in 0..8 {
            let angle = rng.gen::<f32>() * 2.0 * PI;
            let test_dir_x = angle.cos();
            let test_dir_y = angle.sin();
            let test_x = animal.pos_x + test_dir_x * speed;
            let test_y = animal.pos_y + test_dir_y * speed;
            
            if is_position_on_water(ctx, test_x, test_y) {
                animal.direction_x = test_dir_x;
                animal.direction_y = test_dir_y;
                animal.pos_x = test_x;
                animal.pos_y = test_y;
                break;
            }
        }
    }
    
    // World boundary constraints
    let half_tile = crate::TILE_SIZE_PX as f32 / 2.0;
    let max_x = (crate::WORLD_WIDTH_TILES as f32 * crate::TILE_SIZE_PX as f32) - half_tile;
    let max_y = (crate::WORLD_HEIGHT_TILES as f32 * crate::TILE_SIZE_PX as f32) - half_tile;
    animal.pos_x = animal.pos_x.clamp(half_tile, max_x);
    animal.pos_y = animal.pos_y.clamp(half_tile, max_y);
    
    // Update facing direction based on actual movement delta (4 directions)
    let actual_move_x = animal.pos_x - start_x;
    let actual_move_y = animal.pos_y - start_y;
    if actual_move_x.abs() > 0.5 || actual_move_y.abs() > 0.5 {
        if actual_move_x.abs() > actual_move_y.abs() {
            animal.facing_direction = if actual_move_x > 0.0 { "right".to_string() } else { "left".to_string() };
        } else {
            animal.facing_direction = if actual_move_y > 0.0 { "down".to_string() } else { "up".to_string() };
        }
    }
}
