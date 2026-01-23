use spacetimedb::{ReducerContext, Table, Identity, Timestamp};
use log;
use crate::spatial_grid; // Assuming spatial_grid is a module in your crate
use crate::{PLAYER_RADIUS, WORLD_WIDTH_PX, WORLD_HEIGHT_PX, get_effective_player_radius}; // Global constants

// Import table traits (adjust paths as necessary)
use crate::player as PlayerTableTrait;
use crate::tree::tree as TreeTableTrait;
use crate::stone::stone as StoneTableTrait;
use crate::rune_stone::{rune_stone as RuneStoneTableTrait, RUNE_STONE_AABB_HALF_WIDTH, RUNE_STONE_AABB_HALF_HEIGHT, RUNE_STONE_COLLISION_Y_OFFSET};
use crate::cairn::{cairn as CairnTableTrait, CAIRN_AABB_HALF_WIDTH, CAIRN_AABB_HALF_HEIGHT, CAIRN_COLLISION_Y_OFFSET};
// Import sea stack types for collision detection
use crate::sea_stack::{sea_stack as SeaStackTableTrait, get_sea_stack_collision_dimensions};
use crate::wooden_storage_box::wooden_storage_box as WoodenStorageBoxTableTrait;
// Player corpses have NO collision - players can walk over them to loot
// Keeping minimal imports for spatial grid entity type matching only
use crate::player_corpse::player_corpse as PlayerCorpseTableTrait;
use crate::shelter::{
    Shelter, SHELTER_COLLISION_WIDTH, SHELTER_COLLISION_HEIGHT,
    SHELTER_AABB_HALF_WIDTH, SHELTER_AABB_HALF_HEIGHT,
    SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y
};
use crate::shelter::shelter as ShelterTableTrait;
// Import rain collector types for collision detection
use crate::rain_collector::{RainCollector, RAIN_COLLECTOR_COLLISION_RADIUS, RAIN_COLLECTOR_COLLISION_Y_OFFSET};
use crate::rain_collector::rain_collector as RainCollectorTableTrait;
// Import furnace types for collision detection
use crate::furnace::{Furnace, FURNACE_COLLISION_RADIUS, FURNACE_COLLISION_Y_OFFSET};
use crate::furnace::furnace as FurnaceTableTrait;
// Import homestead hearth types for collision detection
use crate::homestead_hearth::{HomesteadHearth, HEARTH_COLLISION_RADIUS, HEARTH_COLLISION_Y_OFFSET};
use crate::homestead_hearth::homestead_hearth as HomesteadHearthTableTrait;
// Import basalt column types for collision detection
use crate::basalt_column::{BasaltColumn, BASALT_COLUMN_RADIUS, BASALT_COLUMN_COLLISION_Y_OFFSET};
use crate::basalt_column::basalt_column as BasaltColumnTableTrait;
// Import ALK station types for collision detection
use crate::alk::{
    AlkStation, 
    ALK_STATION_COLLISION_RADIUS, 
    ALK_STATION_COLLISION_Y_OFFSET,
    ALK_STATION_AABB_HALF_WIDTH,
    ALK_STATION_AABB_HALF_HEIGHT,
    ALK_STATION_COLLISION_HEIGHT,
    ALK_CENTRAL_COMPOUND_AABB_HALF_HEIGHT,
    ALK_CENTRAL_COMPOUND_COLLISION_Y_OFFSET
};
use crate::alk::alk_station as AlkStationTableTrait;
// Import lantern table trait for ward collision detection (regular lanterns have no collision)
use crate::lantern::lantern as LanternTableTrait;
// Import turret table trait for turret collision detection
use crate::turret::turret as TurretTableTrait;
use crate::turret::{TURRET_COLLISION_RADIUS, TURRET_COLLISION_Y_OFFSET};
// Ward collision constants - wards are larger and need collision
const WARD_COLLISION_RADIUS: f32 = 40.0; // Wards are larger than regular lanterns
const WARD_COLLISION_Y_OFFSET: f32 = 80.0; // Offset collision upward to match visual center
// Import wall cell table trait for collision detection
use crate::building::{wall_cell as WallCellTableTrait, FOUNDATION_TILE_SIZE_PX};
// Import door table trait for anti-tunneling collision detection
use crate::door::door as DoorTableTrait;
use crate::TILE_SIZE_PX;
// Import compound building collision system
// compound_buildings import removed - collision handled client-side only

/// Calculates initial collision and applies sliding.
/// Returns the new (x, y) position after potential sliding.
pub fn calculate_slide_collision(
    ctx: &ReducerContext,
    sender_id: Identity,
    current_player_pos_x: f32,
    current_player_pos_y: f32,
    proposed_x: f32,
    proposed_y: f32,
    server_dx: f32, // Original displacement vector for this frame
    server_dy: f32,
) -> (f32, f32) {
    // PERFORMANCE: Use cached spatial grid instead of creating new one
    let grid = spatial_grid::get_cached_spatial_grid(&ctx.db, ctx.timestamp);
    calculate_slide_collision_with_grid(grid, ctx, sender_id, current_player_pos_x, current_player_pos_y, proposed_x, proposed_y, server_dx, server_dy)
}

/// Optimized version that uses a pre-built spatial grid for slide collision
pub fn calculate_slide_collision_with_grid(
    grid: &spatial_grid::SpatialGrid,
    ctx: &ReducerContext,
    sender_id: Identity,
    current_player_pos_x: f32,
    current_player_pos_y: f32,
    proposed_x: f32,
    proposed_y: f32,
    server_dx: f32, // Original displacement vector for this frame
    server_dy: f32,
) -> (f32, f32) {
    let mut final_x = proposed_x;
    let mut final_y = proposed_y;
    
    // 🚀 GRAVITY WELL FIX: Add minimum separation for sliding collision
    const SLIDE_SEPARATION_DISTANCE: f32 = 8.0; // Ensure separation after sliding
    
    // ==========================================================================
    // CRITICAL: ANTI-TUNNELING WALL & DOOR CHECK (before all other collision)
    // Players can move very fast during dodge rolls (600+ px/s) and tunnel through thin walls.
    // Check for wall/door collisions along the ENTIRE movement path, not just destination.
    // Use full PLAYER_RADIUS for anti-tunneling (conservative - catches all potential collisions)
    // ==========================================================================
    if let Some(blocked_pos) = check_wall_line_collision_player(&ctx.db, current_player_pos_x, current_player_pos_y, proposed_x, proposed_y, PLAYER_RADIUS) {
        log::info!("[PlayerCollision] Player {:?} BLOCKED by wall during movement from ({:.1},{:.1}) to ({:.1},{:.1}) - stopped at ({:.1},{:.1})", 
                   sender_id, current_player_pos_x, current_player_pos_y, proposed_x, proposed_y, blocked_pos.0, blocked_pos.1);
        final_x = blocked_pos.0;
        final_y = blocked_pos.1;
        // Continue to apply sliding and other collision from this blocked position
    }
    
    if let Some(blocked_pos) = check_door_line_collision_player(ctx, current_player_pos_x, current_player_pos_y, final_x, final_y, PLAYER_RADIUS) {
        log::info!("[PlayerCollision] Player {:?} BLOCKED by door during movement from ({:.1},{:.1}) to ({:.1},{:.1}) - stopped at ({:.1},{:.1})", 
                   sender_id, current_player_pos_x, current_player_pos_y, final_x, final_y, blocked_pos.0, blocked_pos.1);
        final_x = blocked_pos.0;
        final_y = blocked_pos.1;
    }

    let players = ctx.db.player();
    let trees = ctx.db.tree();
    let stones = ctx.db.stone();
    let rune_stones = ctx.db.rune_stone(); // Access rune stone table
    let cairns = ctx.db.cairn(); // Access cairn table
    let sea_stacks = ctx.db.sea_stack(); // Access sea stack table for AABB collision
    let wooden_storage_boxes = ctx.db.wooden_storage_box();
    let player_corpses = ctx.db.player_corpse(); // Access player_corpse table
    let shelters = ctx.db.shelter(); // Access shelter table
    let rain_collectors = ctx.db.rain_collector(); // Access rain collector table
    let furnaces = ctx.db.furnace(); // Access furnace table
    let homestead_hearths = ctx.db.homestead_hearth(); // Access homestead hearth table
    let basalt_columns = ctx.db.basalt_column(); // Access basalt column table
    let alk_stations = ctx.db.alk_station(); // Access ALK delivery station table
    let lanterns = ctx.db.lantern(); // Access lantern table (for ward collision)
    let turrets = ctx.db.turret(); // Access turret table (for turret collision)
    let wall_cells = ctx.db.wall_cell(); // Access wall cell table
    
    // GET: Current player's crouching state for effective radius calculation
    let current_player = players.identity().find(&sender_id);
    let current_player_radius = if let Some(player) = current_player {
        get_effective_player_radius(player.is_crouching)
    } else {
        PLAYER_RADIUS // Fallback to default radius
    };

    let nearby_entities = grid.get_entities_in_range(final_x, final_y);

    for entity in &nearby_entities {
        match entity {
            spatial_grid::EntityType::Player(other_identity) => {
                if *other_identity == sender_id { continue; }
                if let Some(other_player) = players.identity().find(other_identity) {
                    if other_player.is_dead || !other_player.is_online { continue; } // Skip dead and offline players
                    let dx = final_x - other_player.position_x;
                    let dy = final_y - other_player.position_y;
                    let dist_sq = dx * dx + dy * dy;
                    let min_dist = (current_player_radius * 2.0) + SLIDE_SEPARATION_DISTANCE; // Add separation
                    let min_dist_sq = min_dist * min_dist;

                    if dist_sq < min_dist_sq {
                        log::debug!("Player-Player collision for slide: {:?} vs {:?}", sender_id, other_identity);
                        let collision_normal_x = dx;
                        let collision_normal_y = dy;
                        let normal_mag_sq = dist_sq;

                        if normal_mag_sq > 0.0 {
                            let normal_mag = normal_mag_sq.sqrt();
                            let norm_x = collision_normal_x / normal_mag;
                            let norm_y = collision_normal_y / normal_mag;
                            let dot_product = server_dx * norm_x + server_dy * norm_y;
                            
                            // Only slide if moving toward the object (dot_product < 0)
                            if dot_product < 0.0 {
                                let projection_x = dot_product * norm_x;
                                let projection_y = dot_product * norm_y;
                                let slide_dx = server_dx - projection_x;
                                let slide_dy = server_dy - projection_y;
                                final_x = current_player_pos_x + slide_dx;
                                final_y = current_player_pos_y + slide_dy;
                                
                                // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                let final_dx = final_x - other_player.position_x;
                                let final_dy = final_y - other_player.position_y;
                                let final_dist = (final_dx * final_dx + final_dy * final_dy).sqrt();
                                if final_dist < min_dist {
                                    let separation_direction = if final_dist > 0.001 {
                                        (final_dx / final_dist, final_dy / final_dist)
                                    } else {
                                        (1.0, 0.0) // Default direction
                                    };
                                    final_x = other_player.position_x + separation_direction.0 * min_dist;
                                    final_y = other_player.position_y + separation_direction.1 * min_dist;
                                }
                            }
                            final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                            final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                        }
                    }
                }
            },
            spatial_grid::EntityType::Tree(tree_id) => {
                 if let Some(tree) = trees.id().find(tree_id) {
                    if tree.health == 0 { continue; }
                    let tree_collision_y = tree.pos_y - crate::tree::TREE_COLLISION_Y_OFFSET;
                    let dx = final_x - tree.pos_x;
                    let dy = final_y - tree_collision_y;
                    let dist_sq = dx * dx + dy * dy;
                    let min_dist = current_player_radius + crate::tree::TREE_TRUNK_RADIUS + SLIDE_SEPARATION_DISTANCE; // Add separation
                    let min_dist_sq = min_dist * min_dist;
                    
                    if dist_sq < min_dist_sq {
                        log::debug!("Player-Tree collision for slide: {:?} vs tree {}", sender_id, tree.id);
                         let collision_normal_x = dx;
                         let collision_normal_y = dy;
                         let normal_mag_sq = dist_sq;
                         if normal_mag_sq > 0.0 {
                            let normal_mag = normal_mag_sq.sqrt();
                            let norm_x = collision_normal_x / normal_mag;
                            let norm_y = collision_normal_y / normal_mag;
                            let dot_product = server_dx * norm_x + server_dy * norm_y;
                            
                            // Only slide if moving toward the object (dot_product < 0)
                            if dot_product < 0.0 {
                                let projection_x = dot_product * norm_x;
                                let projection_y = dot_product * norm_y;
                                let slide_dx = server_dx - projection_x;
                                let slide_dy = server_dy - projection_y;
                                final_x = current_player_pos_x + slide_dx;
                                final_y = current_player_pos_y + slide_dy;
                                
                                // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                let final_dx = final_x - tree.pos_x;
                                let final_dy = final_y - tree_collision_y;
                                let final_dist = (final_dx * final_dx + final_dy * final_dy).sqrt();
                                if final_dist < min_dist {
                                    let separation_direction = if final_dist > 0.001 {
                                        (final_dx / final_dist, final_dy / final_dist)
                                    } else {
                                        (1.0, 0.0) // Default direction
                                    };
                                    final_x = tree.pos_x + separation_direction.0 * min_dist;
                                    final_y = tree_collision_y + separation_direction.1 * min_dist;
                                }
                            }
                            final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                            final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                        }
                    }
                }
            },
            spatial_grid::EntityType::Stone(stone_id) => {
                 if let Some(stone) = stones.id().find(stone_id) {
                     if stone.health == 0 { continue; }
                     let stone_collision_y = stone.pos_y - crate::stone::STONE_COLLISION_Y_OFFSET;
                     let dx = final_x - stone.pos_x;
                     let dy = final_y - stone_collision_y;
                     let dist_sq = dx * dx + dy * dy;
                     let min_dist = current_player_radius + crate::stone::STONE_RADIUS + SLIDE_SEPARATION_DISTANCE; // Add separation
                     let min_dist_sq = min_dist * min_dist;
                     
                     if dist_sq < min_dist_sq {
                        log::debug!("Player-Stone collision for slide: {:?} vs stone {}", sender_id, stone.id);
                         let collision_normal_x = dx;
                         let collision_normal_y = dy;
                         let normal_mag_sq = dist_sq;
                         if normal_mag_sq > 0.0 {
                             let normal_mag = normal_mag_sq.sqrt();
                             let norm_x = collision_normal_x / normal_mag;
                             let norm_y = collision_normal_y / normal_mag;
                             let dot_product = server_dx * norm_x + server_dy * norm_y;
                             
                             // Only slide if moving toward the object (dot_product < 0)
                             if dot_product < 0.0 {
                                 let projection_x = dot_product * norm_x;
                                 let projection_y = dot_product * norm_y;
                                 let slide_dx = server_dx - projection_x;
                                 let slide_dy = server_dy - projection_y;
                                 final_x = current_player_pos_x + slide_dx;
                                 final_y = current_player_pos_y + slide_dy;
                                 
                                 // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                 let final_dx = final_x - stone.pos_x;
                                 let final_dy = final_y - stone_collision_y;
                                 let final_dist = (final_dx * final_dx + final_dy * final_dy).sqrt();
                                 if final_dist < min_dist {
                                     let separation_direction = if final_dist > 0.001 {
                                         (final_dx / final_dist, final_dy / final_dist)
                                     } else {
                                         (1.0, 0.0) // Default direction
                                     };
                                     final_x = stone.pos_x + separation_direction.0 * min_dist;
                                     final_y = stone_collision_y + separation_direction.1 * min_dist;
                                 }
                             }
                             final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                             final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                         }
                     }
                 }
            },
           spatial_grid::EntityType::BasaltColumn(basalt_id) => {
                if let Some(basalt) = basalt_columns.id().find(basalt_id) {
                     let basalt_collision_y = basalt.pos_y - BASALT_COLUMN_COLLISION_Y_OFFSET;
                     let dx = final_x - basalt.pos_x;
                     let dy = final_y - basalt_collision_y;
                     let dist_sq = dx * dx + dy * dy;
                     let min_dist = current_player_radius + BASALT_COLUMN_RADIUS + SLIDE_SEPARATION_DISTANCE;
                     let min_dist_sq = min_dist * min_dist;
                     
                     if dist_sq < min_dist_sq {
                        log::debug!("Player-BasaltColumn collision for slide: {:?} vs basalt {}", sender_id, basalt.id);
                         let collision_normal_x = dx;
                         let collision_normal_y = dy;
                         let normal_mag_sq = dist_sq;
                         if normal_mag_sq > 0.0 {
                             let normal_mag = normal_mag_sq.sqrt();
                             let norm_x = collision_normal_x / normal_mag;
                             let norm_y = collision_normal_y / normal_mag;
                             let dot_product = server_dx * norm_x + server_dy * norm_y;
                             
                             // Only slide if moving toward the object (dot_product < 0)
                             if dot_product < 0.0 {
                                 let projection_x = dot_product * norm_x;
                                 let projection_y = dot_product * norm_y;
                                 let slide_dx = server_dx - projection_x;
                                 let slide_dy = server_dy - projection_y;
                                 final_x = current_player_pos_x + slide_dx;
                                 final_y = current_player_pos_y + slide_dy;
                                 
                                 // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                 let final_dx = final_x - basalt.pos_x;
                                 let final_dy = final_y - basalt_collision_y;
                                 let final_dist = (final_dx * final_dx + final_dy * final_dy).sqrt();
                                 if final_dist < min_dist {
                                     let separation_direction = if final_dist > 0.001 {
                                         (final_dx / final_dist, final_dy / final_dist)
                                     } else {
                                         (1.0, 0.0) // Default direction
                                     };
                                     final_x = basalt.pos_x + separation_direction.0 * min_dist;
                                     final_y = basalt_collision_y + separation_direction.1 * min_dist;
                                 }
                             }
                            final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                            final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                        }
                    }
                }
           },
           spatial_grid::EntityType::AlkStation(station_id) => {
                if let Some(station) = alk_stations.station_id().find(station_id) {
                    if station.is_active {
                        // AABB collision - central compound uses half height from top, substations use bottom 1/3
                        let is_central_compound = station.station_id == 0;
                        let station_aabb_center_x = station.world_pos_x;
                        let sprite_bottom = station.world_pos_y + 0.0; // ALK_STATION_Y_OFFSET is 0
                        let (aabb_half_height, aabb_half_width, y_offset) = if is_central_compound {
                            (ALK_CENTRAL_COMPOUND_AABB_HALF_HEIGHT, ALK_STATION_AABB_HALF_WIDTH, ALK_CENTRAL_COMPOUND_COLLISION_Y_OFFSET)
                        } else {
                            (ALK_STATION_AABB_HALF_HEIGHT, ALK_STATION_AABB_HALF_WIDTH, 0.0)
                        };
                        let station_aabb_center_y = sprite_bottom - aabb_half_height - y_offset;
                        
                        // AABB collision detection
                        let closest_x = final_x.max(station_aabb_center_x - aabb_half_width).min(station_aabb_center_x + aabb_half_width);
                        let closest_y = final_y.max(station_aabb_center_y - aabb_half_height).min(station_aabb_center_y + aabb_half_height);
                        
                        let dx_aabb = final_x - closest_x;
                        let dy_aabb = final_y - closest_y;
                        let dist_sq_aabb = dx_aabb * dx_aabb + dy_aabb * dy_aabb;
                        let player_radius_sq = current_player_radius * current_player_radius;
                        
                        if dist_sq_aabb < player_radius_sq {
                            log::debug!("Player-AlkStation AABB collision for slide: {:?} vs station {}", sender_id, station.station_id);
                            let collision_normal_x = dx_aabb;
                            let collision_normal_y = dy_aabb;
                            let normal_mag_sq = dist_sq_aabb;
                            
                            if normal_mag_sq > 0.0 {
                                let normal_mag = normal_mag_sq.sqrt();
                                let norm_x = collision_normal_x / normal_mag;
                                let norm_y = collision_normal_y / normal_mag;
                                let dot_product = server_dx * norm_x + server_dy * norm_y;
                                
                                // Only slide if moving toward the object (dot_product < 0)
                                if dot_product < 0.0 {
                                    let projection_x = dot_product * norm_x;
                                    let projection_y = dot_product * norm_y;
                                    let slide_dx = server_dx - projection_x;
                                    let slide_dy = server_dy - projection_y;
                                    final_x = current_player_pos_x + slide_dx;
                                    final_y = current_player_pos_y + slide_dy;
                                    
                                    // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                    let final_closest_x = final_x.max(station_aabb_center_x - aabb_half_width).min(station_aabb_center_x + aabb_half_width);
                                    let final_closest_y = final_y.max(station_aabb_center_y - aabb_half_height).min(station_aabb_center_y + aabb_half_height);
                                    let final_dx = final_x - final_closest_x;
                                    let final_dy = final_y - final_closest_y;
                                    let final_dist_sq = final_dx * final_dx + final_dy * final_dy;
                                    let min_separation_sq = current_player_radius * current_player_radius;
                                    if final_dist_sq < min_separation_sq {
                                        let final_dist = final_dist_sq.sqrt();
                                        let separation_direction = if final_dist > 0.001 {
                                            (final_dx / final_dist, final_dy / final_dist)
                                        } else {
                                            (1.0, 0.0) // Default direction
                                        };
                                        final_x = final_closest_x + separation_direction.0 * (current_player_radius + SLIDE_SEPARATION_DISTANCE);
                                        final_y = final_closest_y + separation_direction.1 * (current_player_radius + SLIDE_SEPARATION_DISTANCE);
                                    }
                                }
                                final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                                final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                            }
                        }
                    }
                }
           },
           spatial_grid::EntityType::RuneStone(rune_stone_id) => {
                 if let Some(rune_stone) = rune_stones.id().find(rune_stone_id) {
                     // AABB collision - 48x48 box centered at pos_x, pos_y - offset
                     let rune_stone_aabb_center_x = rune_stone.pos_x;
                     let rune_stone_aabb_center_y = rune_stone.pos_y - RUNE_STONE_COLLISION_Y_OFFSET;
                     
                     // AABB collision detection
                     let closest_x = final_x.max(rune_stone_aabb_center_x - RUNE_STONE_AABB_HALF_WIDTH).min(rune_stone_aabb_center_x + RUNE_STONE_AABB_HALF_WIDTH);
                     let closest_y = final_y.max(rune_stone_aabb_center_y - RUNE_STONE_AABB_HALF_HEIGHT).min(rune_stone_aabb_center_y + RUNE_STONE_AABB_HALF_HEIGHT);
                     
                     let dx_aabb = final_x - closest_x;
                     let dy_aabb = final_y - closest_y;
                     let dist_sq_aabb = dx_aabb * dx_aabb + dy_aabb * dy_aabb;
                     let player_radius_sq = current_player_radius * current_player_radius;
                     
                     if dist_sq_aabb < player_radius_sq {
                        log::debug!("Player-RuneStone AABB collision for slide: {:?} vs rune stone {}", sender_id, rune_stone.id);
                         let collision_normal_x = dx_aabb;
                         let collision_normal_y = dy_aabb;
                         let normal_mag_sq = dist_sq_aabb;
                         if normal_mag_sq > 0.0 {
                             let normal_mag = normal_mag_sq.sqrt();
                             let norm_x = collision_normal_x / normal_mag;
                             let norm_y = collision_normal_y / normal_mag;
                             let dot_product = server_dx * norm_x + server_dy * norm_y;
                             
                             // Only slide if moving toward the object (dot_product < 0)
                             if dot_product < 0.0 {
                                 let projection_x = dot_product * norm_x;
                                 let projection_y = dot_product * norm_y;
                                 let slide_dx = server_dx - projection_x;
                                 let slide_dy = server_dy - projection_y;
                                 final_x = current_player_pos_x + slide_dx;
                                 final_y = current_player_pos_y + slide_dy;
                                 
                                 // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                 let final_closest_x = final_x.max(rune_stone_aabb_center_x - RUNE_STONE_AABB_HALF_WIDTH).min(rune_stone_aabb_center_x + RUNE_STONE_AABB_HALF_WIDTH);
                                 let final_closest_y = final_y.max(rune_stone_aabb_center_y - RUNE_STONE_AABB_HALF_HEIGHT).min(rune_stone_aabb_center_y + RUNE_STONE_AABB_HALF_HEIGHT);
                                 let final_dx = final_x - final_closest_x;
                                 let final_dy = final_y - final_closest_y;
                                 let final_dist_sq = final_dx * final_dx + final_dy * final_dy;
                                 if final_dist_sq < player_radius_sq {
                                     let final_dist = final_dist_sq.sqrt();
                                     let separation_direction = if final_dist > 0.001 {
                                         (final_dx / final_dist, final_dy / final_dist)
                                     } else {
                                         (1.0, 0.0) // Default direction
                                     };
                                     let min_separation = current_player_radius + SLIDE_SEPARATION_DISTANCE;
                                     final_x = final_closest_x + separation_direction.0 * min_separation;
                                     final_y = final_closest_y + separation_direction.1 * min_separation;
                                 }
                             }
                             final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                             final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                         }
                     }
                 }
            },
            spatial_grid::EntityType::Cairn(cairn_id) => {
                 if let Some(cairn) = cairns.id().find(cairn_id) {
                     // AABB collision - 96x48 box centered at pos_x, pos_y - offset
                     let cairn_aabb_center_x = cairn.pos_x;
                     let cairn_aabb_center_y = cairn.pos_y - CAIRN_COLLISION_Y_OFFSET;
                     
                     // AABB collision detection
                     let closest_x = final_x.max(cairn_aabb_center_x - CAIRN_AABB_HALF_WIDTH).min(cairn_aabb_center_x + CAIRN_AABB_HALF_WIDTH);
                     let closest_y = final_y.max(cairn_aabb_center_y - CAIRN_AABB_HALF_HEIGHT).min(cairn_aabb_center_y + CAIRN_AABB_HALF_HEIGHT);
                     
                     let dx_aabb = final_x - closest_x;
                     let dy_aabb = final_y - closest_y;
                     let dist_sq_aabb = dx_aabb * dx_aabb + dy_aabb * dy_aabb;
                     let player_radius_sq = current_player_radius * current_player_radius;
                     
                     if dist_sq_aabb < player_radius_sq {
                        log::debug!("Player-Cairn AABB collision for slide: {:?} vs cairn {}", sender_id, cairn.id);
                         let collision_normal_x = dx_aabb;
                         let collision_normal_y = dy_aabb;
                         let normal_mag_sq = dist_sq_aabb;
                         if normal_mag_sq > 0.0 {
                             let normal_mag = normal_mag_sq.sqrt();
                             let norm_x = collision_normal_x / normal_mag;
                             let norm_y = collision_normal_y / normal_mag;
                             let dot_product = server_dx * norm_x + server_dy * norm_y;
                             
                             // Only slide if moving toward the object (dot_product < 0)
                             if dot_product < 0.0 {
                                 let projection_x = dot_product * norm_x;
                                 let projection_y = dot_product * norm_y;
                                 let slide_dx = server_dx - projection_x;
                                 let slide_dy = server_dy - projection_y;
                                 final_x = current_player_pos_x + slide_dx;
                                 final_y = current_player_pos_y + slide_dy;
                                 
                                 // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                 let final_closest_x = final_x.max(cairn_aabb_center_x - CAIRN_AABB_HALF_WIDTH).min(cairn_aabb_center_x + CAIRN_AABB_HALF_WIDTH);
                                 let final_closest_y = final_y.max(cairn_aabb_center_y - CAIRN_AABB_HALF_HEIGHT).min(cairn_aabb_center_y + CAIRN_AABB_HALF_HEIGHT);
                                 let final_dx = final_x - final_closest_x;
                                 let final_dy = final_y - final_closest_y;
                                 let final_dist_sq = final_dx * final_dx + final_dy * final_dy;
                                 if final_dist_sq < player_radius_sq {
                                     let final_dist = final_dist_sq.sqrt();
                                     let separation_direction = if final_dist > 0.001 {
                                         (final_dx / final_dist, final_dy / final_dist)
                                     } else {
                                         (1.0, 0.0) // Default direction
                                     };
                                     let min_separation = current_player_radius + SLIDE_SEPARATION_DISTANCE;
                                     final_x = final_closest_x + separation_direction.0 * min_separation;
                                     final_y = final_closest_y + separation_direction.1 * min_separation;
                                 }
                             }
                             final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                             final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                         }
                     }
                 }
            },
            spatial_grid::EntityType::SeaStack(sea_stack_id) => {
                if let Some(sea_stack) = sea_stacks.id().find(sea_stack_id) {
                    // SCALED AABB collision - dimensions scale with sea stack's scale property
                    let (half_width, half_height, y_offset) = get_sea_stack_collision_dimensions(sea_stack.scale);
                    let sea_stack_aabb_center_x = sea_stack.pos_x;
                    let sea_stack_aabb_center_y = sea_stack.pos_y - y_offset;
                    
                    // AABB collision detection
                    let closest_x = final_x.max(sea_stack_aabb_center_x - half_width).min(sea_stack_aabb_center_x + half_width);
                    let closest_y = final_y.max(sea_stack_aabb_center_y - half_height).min(sea_stack_aabb_center_y + half_height);
                    
                    let dx_aabb = final_x - closest_x;
                    let dy_aabb = final_y - closest_y;
                    let dist_sq_aabb = dx_aabb * dx_aabb + dy_aabb * dy_aabb;
                    let player_radius_sq = current_player_radius * current_player_radius;
                    
                    if dist_sq_aabb < player_radius_sq {
                        log::debug!("Player-SeaStack AABB collision for slide: {:?} vs sea_stack {} (scale: {})", sender_id, sea_stack.id, sea_stack.scale);
                        let collision_normal_x = dx_aabb;
                        let collision_normal_y = dy_aabb;
                        let normal_mag_sq = dist_sq_aabb;
                        if normal_mag_sq > 0.0 {
                            let normal_mag = normal_mag_sq.sqrt();
                            let norm_x = collision_normal_x / normal_mag;
                            let norm_y = collision_normal_y / normal_mag;
                            let dot_product = server_dx * norm_x + server_dy * norm_y;
                            
                            // Only slide if moving toward the object (dot_product < 0)
                            if dot_product < 0.0 {
                                let projection_x = dot_product * norm_x;
                                let projection_y = dot_product * norm_y;
                                let slide_dx = server_dx - projection_x;
                                let slide_dy = server_dy - projection_y;
                                final_x = current_player_pos_x + slide_dx;
                                final_y = current_player_pos_y + slide_dy;
                                
                                // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                let final_closest_x = final_x.max(sea_stack_aabb_center_x - half_width).min(sea_stack_aabb_center_x + half_width);
                                let final_closest_y = final_y.max(sea_stack_aabb_center_y - half_height).min(sea_stack_aabb_center_y + half_height);
                                let final_dx = final_x - final_closest_x;
                                let final_dy = final_y - final_closest_y;
                                let final_dist_sq = final_dx * final_dx + final_dy * final_dy;
                                if final_dist_sq < player_radius_sq {
                                    let final_dist = final_dist_sq.sqrt();
                                    let separation_direction = if final_dist > 0.001 {
                                        (final_dx / final_dist, final_dy / final_dist)
                                    } else {
                                        (1.0, 0.0) // Default direction
                                    };
                                    let min_separation = current_player_radius + SLIDE_SEPARATION_DISTANCE;
                                    final_x = final_closest_x + separation_direction.0 * min_separation;
                                    final_y = final_closest_y + separation_direction.1 * min_separation;
                                }
                            }
                            final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                            final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                        }
                    }
                }
            },
            spatial_grid::EntityType::WoodenStorageBox(box_id) => {
                if let Some(box_instance) = wooden_storage_boxes.id().find(box_id) {
                    let box_collision_y = box_instance.pos_y - crate::wooden_storage_box::BOX_COLLISION_Y_OFFSET;
                    let dx = final_x - box_instance.pos_x;
                    let dy = final_y - box_collision_y;
                    let dist_sq = dx * dx + dy * dy;
                    let min_dist = current_player_radius + crate::wooden_storage_box::BOX_COLLISION_RADIUS + SLIDE_SEPARATION_DISTANCE; // Add separation
                    let min_dist_sq = min_dist * min_dist;
                    
                    if dist_sq < min_dist_sq {
                        log::debug!("Player-Box collision for slide: {:?} vs box {}", sender_id, box_instance.id);
                         let collision_normal_x = dx;
                         let collision_normal_y = dy;
                         let normal_mag_sq = dist_sq;
                         if normal_mag_sq > 0.0 {
                             let normal_mag = normal_mag_sq.sqrt();
                             let norm_x = collision_normal_x / normal_mag;
                             let norm_y = collision_normal_y / normal_mag;
                             let dot_product = server_dx * norm_x + server_dy * norm_y;
                             
                             // Only slide if moving toward the object (dot_product < 0)
                             if dot_product < 0.0 {
                                 let projection_x = dot_product * norm_x;
                                 let projection_y = dot_product * norm_y;
                                 let slide_dx = server_dx - projection_x;
                                 let slide_dy = server_dy - projection_y;
                                 final_x = current_player_pos_x + slide_dx;
                                 final_y = current_player_pos_y + slide_dy;
                                 
                                 // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                 let final_dx = final_x - box_instance.pos_x;
                                 let final_dy = final_y - box_collision_y;
                                 let final_dist = (final_dx * final_dx + final_dy * final_dy).sqrt();
                                 if final_dist < min_dist {
                                     let separation_direction = if final_dist > 0.001 {
                                         (final_dx / final_dist, final_dy / final_dist)
                                     } else {
                                         (1.0, 0.0) // Default direction
                                     };
                                     final_x = box_instance.pos_x + separation_direction.0 * min_dist;
                                     final_y = box_collision_y + separation_direction.1 * min_dist;
                                 }
                             }
                             final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                             final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                         }
                    }
                }
            },
            spatial_grid::EntityType::RainCollector(rain_collector_id) => { // ADDED RainCollector slide logic
                if let Some(rain_collector) = rain_collectors.id().find(rain_collector_id) {
                    if rain_collector.is_destroyed { continue; }
                    let rain_collector_collision_y = rain_collector.pos_y - RAIN_COLLECTOR_COLLISION_Y_OFFSET;
                    let dx = final_x - rain_collector.pos_x;
                    let dy = final_y - rain_collector_collision_y;
                    let dist_sq = dx * dx + dy * dy;
                    let min_dist = current_player_radius + RAIN_COLLECTOR_COLLISION_RADIUS + SLIDE_SEPARATION_DISTANCE; // Add separation
                    let min_dist_sq = min_dist * min_dist;

                    if dist_sq < min_dist_sq {
                        log::debug!("Player-RainCollector collision for slide: {:?} vs rain collector {}", sender_id, rain_collector.id);
                        let collision_normal_x = dx;
                        let collision_normal_y = dy;
                        let normal_mag_sq = dist_sq;
                        if normal_mag_sq > 0.0 {
                            let normal_mag = normal_mag_sq.sqrt();
                            let norm_x = collision_normal_x / normal_mag;
                            let norm_y = collision_normal_y / normal_mag;
                            let dot_product = server_dx * norm_x + server_dy * norm_y;
                            
                            // Only slide if moving toward the object (dot_product < 0)
                            if dot_product < 0.0 {
                                let projection_x = dot_product * norm_x;
                                let projection_y = dot_product * norm_y;
                                let slide_dx = server_dx - projection_x;
                                let slide_dy = server_dy - projection_y;
                                final_x = current_player_pos_x + slide_dx;
                                final_y = current_player_pos_y + slide_dy;
                                
                                // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                let final_dx = final_x - rain_collector.pos_x;
                                let final_dy = final_y - rain_collector_collision_y;
                                let final_dist = (final_dx * final_dx + final_dy * final_dy).sqrt();
                                if final_dist < min_dist {
                                    let separation_direction = if final_dist > 0.001 {
                                        (final_dx / final_dist, final_dy / final_dist)
                                    } else {
                                        (1.0, 0.0) // Default direction
                                    };
                                    final_x = rain_collector.pos_x + separation_direction.0 * min_dist;
                                    final_y = rain_collector_collision_y + separation_direction.1 * min_dist;
                                }
                            }
                            final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                            final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                        }
                    }
                }
            },
            spatial_grid::EntityType::Shelter(shelter_id) => { // ADDED Shelter slide logic
                if let Some(shelter) = shelters.id().find(shelter_id) {
                    if shelter.is_destroyed { continue; }
                    // Collision only for non-owners
                    if shelter.placed_by == sender_id { continue; }

                    let shelter_aabb_center_x = shelter.pos_x;
                    let shelter_aabb_center_y = shelter.pos_y - SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y;

                    // AABB collision detection
                    let closest_x = final_x.max(shelter_aabb_center_x - SHELTER_AABB_HALF_WIDTH).min(shelter_aabb_center_x + SHELTER_AABB_HALF_WIDTH);
                    let closest_y = final_y.max(shelter_aabb_center_y - SHELTER_AABB_HALF_HEIGHT).min(shelter_aabb_center_y + SHELTER_AABB_HALF_HEIGHT);

                    let dx_aabb = final_x - closest_x;
                    let dy_aabb = final_y - closest_y;
                    let dist_sq_aabb = dx_aabb * dx_aabb + dy_aabb * dy_aabb;
                    let player_radius_sq = current_player_radius * current_player_radius;

                    if dist_sq_aabb < player_radius_sq {
                        log::debug!(
                            "[ShelterSlideCollision] Player {:?} vs Shelter {}: PlayerY: {:.1}, ShelterBaseY: {:.1}, OffsetConst: {:.1}, AABBCenterY: {:.1}, AABBHalfHeightConst: {:.1}, ClosestY: {:.1}, DistSq: {:.1}, PlayerRadSq: {:.1}",
                            sender_id, shelter.id,
                            final_y, // Player's current Y
                            shelter.pos_y,
                            SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y,
                            shelter_aabb_center_y,
                            SHELTER_AABB_HALF_HEIGHT,
                            closest_y,
                            dist_sq_aabb,
                            player_radius_sq
                        );
                        let collision_normal_x = dx_aabb;
                        let collision_normal_y = dy_aabb;
                        let normal_mag_sq = dist_sq_aabb;

                        if normal_mag_sq > 0.0 {
                            let normal_mag = normal_mag_sq.sqrt();
                            let norm_x = collision_normal_x / normal_mag;
                            let norm_y = collision_normal_y / normal_mag;
                            let dot_product = server_dx * norm_x + server_dy * norm_y;
                            if dot_product > 0.0 { // Moving towards the shelter AABB
                                let projection_x = dot_product * norm_x;
                                let projection_y = dot_product * norm_y;
                                let slide_dx = server_dx - projection_x;
                                let slide_dy = server_dy - projection_y;
                                final_x = current_player_pos_x + slide_dx;
                                final_y = current_player_pos_y + slide_dy;
                                final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                                final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                            }
                        } else {
                            // Player center is exactly on the closest point, attempt small slide or revert
                            // This case is less likely with AABB but good to handle
                            final_x = current_player_pos_x;
                            final_y = current_player_pos_y;
                        }
                    } else { // ADDED ELSE FOR DEBUGGING
                        log::debug!(
                            "[ShelterSlideNOCollision] Player {:?} vs Shelter {}: PlayerY: {:.1}, ShelterBaseY: {:.1}, OffsetConst: {:.1}, AABBCenterY: {:.1}, AABBHalfHeightConst: {:.1}, ClosestY: {:.1}, DistSq: {:.1} (NO COLLISION >= {:.1})",
                            sender_id, shelter.id,
                            final_y,
                            shelter.pos_y,
                            SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y,
                            shelter_aabb_center_y,
                            SHELTER_AABB_HALF_HEIGHT,
                            closest_y,
                            dist_sq_aabb,
                            player_radius_sq
                        );
                    }
                }
            },
            spatial_grid::EntityType::PlayerCorpse(_corpse_id) => {
                // Player corpses have NO collision - players can walk over them to loot
                // This allows easy looting of offline player corpses and death corpses
                continue;
            },
            spatial_grid::EntityType::Furnace(furnace_id) => { // ADDED Furnace slide logic
                if let Some(furnace) = furnaces.id().find(furnace_id) {
                    if furnace.is_destroyed { continue; }
                    // Use FURNACE_COLLISION_Y_OFFSET from furnace module
                    let furnace_collision_y = furnace.pos_y - crate::furnace::FURNACE_COLLISION_Y_OFFSET;
                    let dx = final_x - furnace.pos_x;
                    let dy = final_y - furnace_collision_y;
                    let dist_sq = dx * dx + dy * dy;
                    let min_dist = current_player_radius + crate::furnace::FURNACE_COLLISION_RADIUS + SLIDE_SEPARATION_DISTANCE; // Add separation
                    let min_dist_sq = min_dist * min_dist;

                    if dist_sq < min_dist_sq {
                        log::debug!("Player-Furnace collision for slide: {:?} vs furnace {}", sender_id, furnace.id);
                        let collision_normal_x = dx;
                        let collision_normal_y = dy;
                        let normal_mag_sq = dist_sq;
                        if normal_mag_sq > 0.0 {
                            let normal_mag = normal_mag_sq.sqrt();
                            let norm_x = collision_normal_x / normal_mag;
                            let norm_y = collision_normal_y / normal_mag;
                            let dot_product = server_dx * norm_x + server_dy * norm_y;
                            
                            // Only slide if moving toward the object (dot_product < 0)
                            if dot_product < 0.0 {
                                let projection_x = dot_product * norm_x;
                                let projection_y = dot_product * norm_y;
                                let slide_dx = server_dx - projection_x;
                                let slide_dy = server_dy - projection_y;
                                final_x = current_player_pos_x + slide_dx;
                                final_y = current_player_pos_y + slide_dy;
                                
                                // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                let final_dx = final_x - furnace.pos_x;
                                let final_dy = final_y - furnace_collision_y;
                                let final_dist = (final_dx * final_dx + final_dy * final_dy).sqrt();
                                if final_dist < min_dist {
                                    let separation_direction = if final_dist > 0.001 {
                                        (final_dx / final_dist, final_dy / final_dist)
                                    } else {
                                        (1.0, 0.0) // Default direction
                                    };
                                    final_x = furnace.pos_x + separation_direction.0 * min_dist;
                                    final_y = furnace_collision_y + separation_direction.1 * min_dist;
                                }
                            }
                            final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                            final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                        }
                    }
                }
            },
            spatial_grid::EntityType::HomesteadHearth(hearth_id) => { // ADDED HomesteadHearth slide logic
                if let Some(hearth) = homestead_hearths.id().find(hearth_id) {
                    if hearth.is_destroyed { continue; }
                    let hearth_collision_y = hearth.pos_y - HEARTH_COLLISION_Y_OFFSET;
                    let dx = final_x - hearth.pos_x;
                    let dy = final_y - hearth_collision_y;
                    let dist_sq = dx * dx + dy * dy;
                    let min_dist = current_player_radius + HEARTH_COLLISION_RADIUS + SLIDE_SEPARATION_DISTANCE;
                    let min_dist_sq = min_dist * min_dist;

                    if dist_sq < min_dist_sq {
                        log::debug!("Player-HomesteadHearth collision for slide: {:?} vs hearth {}", sender_id, hearth.id);
                        let collision_normal_x = dx;
                        let collision_normal_y = dy;
                        let normal_mag_sq = dist_sq;
                        if normal_mag_sq > 0.0 {
                            let normal_mag = normal_mag_sq.sqrt();
                            let norm_x = collision_normal_x / normal_mag;
                            let norm_y = collision_normal_y / normal_mag;
                            let dot_product = server_dx * norm_x + server_dy * norm_y;
                            
                            // Only slide if moving toward the object (dot_product < 0)
                            if dot_product < 0.0 {
                                let projection_x = dot_product * norm_x;
                                let projection_y = dot_product * norm_y;
                                let slide_dx = server_dx - projection_x;
                                let slide_dy = server_dy - projection_y;
                                final_x = current_player_pos_x + slide_dx;
                                final_y = current_player_pos_y + slide_dy;
                                
                                // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                let final_dx = final_x - hearth.pos_x;
                                let final_dy = final_y - hearth_collision_y;
                                let final_dist = (final_dx * final_dx + final_dy * final_dy).sqrt();
                                if final_dist < min_dist {
                                    let separation_direction = if final_dist > 0.001 {
                                        (final_dx / final_dist, final_dy / final_dist)
                                    } else {
                                        (1.0, 0.0) // Default direction
                                    };
                                    final_x = hearth.pos_x + separation_direction.0 * min_dist;
                                    final_y = hearth_collision_y + separation_direction.1 * min_dist;
                                }
                            }
                            final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                            final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                        }
                    }
                }
            },
            spatial_grid::EntityType::Lantern(lantern_id) => {
                // Lanterns: Only wards (lantern_type > 0) have collision, regular lanterns intentionally have no collision
                if let Some(lantern) = lanterns.id().find(lantern_id) {
                    if lantern.is_destroyed { continue; }
                    // Only wards have collision (lantern_type: 1 = Ancestral Ward, 2 = Signal Disruptor, 3 = Memory Beacon)
                    if lantern.lantern_type == 0 { continue; } // Skip regular lanterns
                    
                    let ward_collision_y = lantern.pos_y - WARD_COLLISION_Y_OFFSET;
                    let dx = final_x - lantern.pos_x;
                    let dy = final_y - ward_collision_y;
                    let dist_sq = dx * dx + dy * dy;
                    let min_dist = current_player_radius + WARD_COLLISION_RADIUS + SLIDE_SEPARATION_DISTANCE;
                    let min_dist_sq = min_dist * min_dist;

                    if dist_sq < min_dist_sq {
                        log::debug!("Player-Ward collision for slide: {:?} vs ward {}", sender_id, lantern.id);
                        let collision_normal_x = dx;
                        let collision_normal_y = dy;
                        let normal_mag_sq = dist_sq;
                        if normal_mag_sq > 0.0 {
                            let normal_mag = normal_mag_sq.sqrt();
                            let norm_x = collision_normal_x / normal_mag;
                            let norm_y = collision_normal_y / normal_mag;
                            let dot_product = server_dx * norm_x + server_dy * norm_y;

                            // Only slide if moving toward the object (dot_product < 0)
                            if dot_product < 0.0 {
                                let projection_x = dot_product * norm_x;
                                let projection_y = dot_product * norm_y;
                                let slide_dx = server_dx - projection_x;
                                let slide_dy = server_dy - projection_y;
                                final_x = current_player_pos_x + slide_dx;
                                final_y = current_player_pos_y + slide_dy;

                                // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                let final_dx = final_x - lantern.pos_x;
                                let final_dy = final_y - ward_collision_y;
                                let final_dist = (final_dx * final_dx + final_dy * final_dy).sqrt();
                                if final_dist < min_dist {
                                    let separation_direction = if final_dist > 0.001 {
                                        (final_dx / final_dist, final_dy / final_dist)
                                    } else {
                                        (1.0, 0.0) // Default direction
                                    };
                                    final_x = lantern.pos_x + separation_direction.0 * min_dist;
                                    final_y = ward_collision_y + separation_direction.1 * min_dist;
                                }
                            }
                            final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                            final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                        }
                    }
                }
            },
            spatial_grid::EntityType::Turret(turret_id) => {
                // Turrets have collision (same as wards - 256x256 sprites)
                if let Some(turret) = turrets.id().find(turret_id) {
                    if turret.is_destroyed { continue; }
                    
                    let turret_collision_y = turret.pos_y - TURRET_COLLISION_Y_OFFSET;
                    let dx = final_x - turret.pos_x;
                    let dy = final_y - turret_collision_y;
                    let dist_sq = dx * dx + dy * dy;
                    let min_dist = current_player_radius + TURRET_COLLISION_RADIUS + SLIDE_SEPARATION_DISTANCE;
                    let min_dist_sq = min_dist * min_dist;

                    if dist_sq < min_dist_sq {
                        log::debug!("Player-Turret collision for slide: {:?} vs turret {}", sender_id, turret.id);
                        let collision_normal_x = dx;
                        let collision_normal_y = dy;
                        let normal_mag_sq = dist_sq;
                        if normal_mag_sq > 0.0 {
                            let normal_mag = normal_mag_sq.sqrt();
                            let norm_x = collision_normal_x / normal_mag;
                            let norm_y = collision_normal_y / normal_mag;
                            let dot_product = server_dx * norm_x + server_dy * norm_y;

                            // Only slide if moving toward the object (dot_product < 0)
                            if dot_product < 0.0 {
                                let projection_x = dot_product * norm_x;
                                let projection_y = dot_product * norm_y;
                                let slide_dx = server_dx - projection_x;
                                let slide_dy = server_dy - projection_y;
                                final_x = current_player_pos_x + slide_dx;
                                final_y = current_player_pos_y + slide_dy;

                                // 🛡️ SEPARATION ENFORCEMENT: Ensure minimum separation after sliding
                                let final_dx = final_x - turret.pos_x;
                                let final_dy = final_y - turret_collision_y;
                                let final_dist = (final_dx * final_dx + final_dy * final_dy).sqrt();
                                if final_dist < min_dist {
                                    let separation_direction = if final_dist > 0.001 {
                                        (final_dx / final_dist, final_dy / final_dist)
                                    } else {
                                        (1.0, 0.0) // Default direction
                                    };
                                    final_x = turret.pos_x + separation_direction.0 * min_dist;
                                    final_y = turret_collision_y + separation_direction.1 * min_dist;
                                }
                            }
                            final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                            final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                        }
                    }
                }
            },
            _ => {} // Campfire, etc. - no slide collision
        }
    }
    
    // Check wall collisions - walls are static and positioned on foundation cell edges
    // CRITICAL FIX: Walls use FOUNDATION_TILE_SIZE_PX (96px) coordinates, NOT TILE_SIZE_PX (48px)!
    const WALL_COLLISION_THICKNESS: f32 = 6.0; // Thin collision thickness (slightly thicker than visual 4px)
    const CHECK_RADIUS_CELLS: i32 = 2; // Check walls within 2 foundation cells
    
    let player_cell_x = (final_x / FOUNDATION_TILE_SIZE_PX as f32).floor() as i32;
    let player_cell_y = (final_y / FOUNDATION_TILE_SIZE_PX as f32).floor() as i32;
    
    for cell_offset_x in -CHECK_RADIUS_CELLS..=CHECK_RADIUS_CELLS {
        for cell_offset_y in -CHECK_RADIUS_CELLS..=CHECK_RADIUS_CELLS {
            let check_cell_x = player_cell_x + cell_offset_x;
            let check_cell_y = player_cell_y + cell_offset_y;
            
            // Find walls on this foundation cell
            for wall in wall_cells.idx_cell_coords().filter((check_cell_x, check_cell_y)) {
                if wall.is_destroyed { continue; }
                
                // Calculate wall edge collision bounds using foundation cell size (96px)
                let cell_left = check_cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32;
                let cell_top = check_cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32;
                let cell_right = cell_left + FOUNDATION_TILE_SIZE_PX as f32;
                let cell_bottom = cell_top + FOUNDATION_TILE_SIZE_PX as f32;
                
                // Determine wall edge bounds based on edge direction
                // Edge 0 = North (top), 1 = East (right), 2 = South (bottom), 3 = West (left)
                let (wall_min_x, wall_max_x, wall_min_y, wall_max_y) = match wall.edge {
                    0 => { // North (top edge) - horizontal line
                        (cell_left, cell_right, cell_top - WALL_COLLISION_THICKNESS / 2.0, cell_top + WALL_COLLISION_THICKNESS / 2.0)
                    },
                    1 => { // East (right edge) - vertical line
                        (cell_right - WALL_COLLISION_THICKNESS / 2.0, cell_right + WALL_COLLISION_THICKNESS / 2.0, cell_top, cell_bottom)
                    },
                    2 => { // South (bottom edge) - horizontal line
                        (cell_left, cell_right, cell_bottom - WALL_COLLISION_THICKNESS / 2.0, cell_bottom + WALL_COLLISION_THICKNESS / 2.0)
                    },
                    3 => { // West (left edge) - vertical line
                        (cell_left - WALL_COLLISION_THICKNESS / 2.0, cell_left + WALL_COLLISION_THICKNESS / 2.0, cell_top, cell_bottom)
                    },
                    _ => continue, // Skip diagonal or invalid edges
                };
                
                // Check if player circle intersects wall AABB
                let closest_x = final_x.max(wall_min_x).min(wall_max_x);
                let closest_y = final_y.max(wall_min_y).min(wall_max_y);
                let dx = final_x - closest_x;
                let dy = final_y - closest_y;
                let dist_sq = dx * dx + dy * dy;
                
                if dist_sq < current_player_radius * current_player_radius {
                    // Collision detected - calculate slide response
                    let dist = dist_sq.sqrt();
                    if dist > 0.001 {
                        let norm_x = dx / dist;
                        let norm_y = dy / dist;
                        let dot_product = server_dx * norm_x + server_dy * norm_y;
                        
                        // Only slide if moving toward the wall (dot_product < 0)
                        if dot_product < 0.0 {
                            let projection_x = dot_product * norm_x;
                            let projection_y = dot_product * norm_y;
                            let slide_dx = server_dx - projection_x;
                            let slide_dy = server_dy - projection_y;
                            final_x = current_player_pos_x + slide_dx;
                            final_y = current_player_pos_y + slide_dy;
                            
                            // Ensure minimum separation
                            let final_dx = final_x - closest_x;
                            let final_dy = final_y - closest_y;
                            let final_dist = (final_dx * final_dx + final_dy * final_dy).sqrt();
                            let min_dist = current_player_radius + SLIDE_SEPARATION_DISTANCE;
                            if final_dist < min_dist {
                                let separation_direction = if final_dist > 0.001 {
                                    (final_dx / final_dist, final_dy / final_dist)
                                } else {
                                    // Push away from wall center
                                    let wall_center_x = (wall_min_x + wall_max_x) / 2.0;
                                    let wall_center_y = (wall_min_y + wall_max_y) / 2.0;
                                    let center_dx = final_x - wall_center_x;
                                    let center_dy = final_y - wall_center_y;
                                    let center_dist = (center_dx * center_dx + center_dy * center_dy).sqrt();
                                    if center_dist > 0.001 {
                                        (center_dx / center_dist, center_dy / center_dist)
                                    } else {
                                        (1.0, 0.0) // Default direction
                                    }
                                };
                                final_x = closest_x + separation_direction.0 * min_dist;
                                final_y = closest_y + separation_direction.1 * min_dist;
                            }
                        }
                    }
                    final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
                    final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
                }
            }
        }
    }
    
    // Check door collisions - closed doors block movement
    if let Some((pushback_x, pushback_y)) = crate::door::check_door_collision(ctx, final_x, final_y, current_player_radius) {
        final_x = current_player_pos_x + pushback_x;
        final_y = current_player_pos_y + pushback_y;
        final_x = final_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
        final_y = final_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);
        log::debug!("[SlideCollision] Player {:?} pushed back by door: ({:.1}, {:.1})", sender_id, pushback_x, pushback_y);
    }
    
    // Compound building collision REMOVED - buildings are purely decorative
    
    (final_x, final_y)
}

/// Resolves collisions by iteratively pushing the player out of overlapping objects.
/// Returns the resolved (x, y) position.
pub fn resolve_push_out_collision(
    ctx: &ReducerContext,
    sender_id: Identity,
    initial_x: f32, // Position after potential slide
    initial_y: f32,
) -> (f32, f32) {
    // PERFORMANCE: Use cached spatial grid instead of creating new one
    let grid = spatial_grid::get_cached_spatial_grid(&ctx.db, ctx.timestamp);
    resolve_push_out_collision_with_grid(grid, ctx, sender_id, initial_x, initial_y)
}

/// Optimized version that uses a pre-built spatial grid for push-out collision
pub fn resolve_push_out_collision_with_grid(
    grid: &spatial_grid::SpatialGrid,
    ctx: &ReducerContext,
    sender_id: Identity,
    initial_x: f32, // Position after potential slide
    initial_y: f32,
) -> (f32, f32) {
    log::debug!("[PushOutStart] Player {:?} starting push-out at ({:.1}, {:.1})", sender_id, initial_x, initial_y);
    
    let mut resolved_x = initial_x;
    let mut resolved_y = initial_y;
    let resolution_iterations = 2; // REDUCED from 5 to 2 for performance in dense areas
    // 🚀 GRAVITY WELL FIX: Much larger separation to prevent trapping
    let separation_distance = 10.0; // Increased from 0.01 to 10.0 pixels for proper separation

    let players = ctx.db.player();
    let trees = ctx.db.tree();
    let stones = ctx.db.stone();
    let rune_stones = ctx.db.rune_stone(); // Access rune stone table for push-out
    let cairns = ctx.db.cairn(); // Access cairn table for push-out
    let sea_stacks = ctx.db.sea_stack(); // Access sea stack table for push-out
    let wooden_storage_boxes = ctx.db.wooden_storage_box();
    let player_corpses = ctx.db.player_corpse(); // Access player_corpse table
    let shelters = ctx.db.shelter(); // Access shelter table
    let rain_collectors = ctx.db.rain_collector(); // Access rain collector table
    let furnaces = ctx.db.furnace(); // Access furnace table
    let homestead_hearths = ctx.db.homestead_hearth(); // Access homestead hearth table
    let basalt_columns = ctx.db.basalt_column(); // Access basalt column table
    let alk_stations = ctx.db.alk_station(); // Access ALK delivery station table
    let lanterns = ctx.db.lantern(); // Access lantern table (for ward collision)
    let turrets = ctx.db.turret(); // Access turret table (for turret collision)
    let wall_cells = ctx.db.wall_cell(); // Access wall cell table
    
    // GET: Current player's crouching state for effective radius calculation
    let current_player = players.identity().find(&sender_id);
    let current_player_radius = if let Some(player) = current_player {
        get_effective_player_radius(player.is_crouching)
    } else {
        PLAYER_RADIUS // Fallback to default radius
    };
    
    // OPTIMIZATION: Pre-calculate nearby entities once
    let nearby_entities_resolve = grid.get_entities_in_range(resolved_x, resolved_y);
    
    // OPTIMIZATION: Early exit if no entities nearby
    if nearby_entities_resolve.is_empty() {
        return (resolved_x, resolved_y);
    }

    for _iter in 0..resolution_iterations {
        let mut overlap_found_in_iter = false;
        
        log::debug!("[PushOutIter] Player {:?} iteration {} at ({:.1}, {:.1}), found {} nearby entities", 
                   sender_id, _iter, resolved_x, resolved_y, nearby_entities_resolve.len());

        for entity in &nearby_entities_resolve {
             match entity {
                 spatial_grid::EntityType::Player(other_identity) => {
                    log::debug!("[PushOutEntityType] Found Player: {:?}", other_identity);
                    if *other_identity == sender_id { continue; }
                    if let Some(other_player) = players.identity().find(other_identity) {
                         if other_player.is_dead || !other_player.is_online { continue; } // Skip dead and offline players
                         let dx = resolved_x - other_player.position_x;
                         let dy = resolved_y - other_player.position_y;
                         let dist_sq = dx * dx + dy * dy;
                         let min_dist = current_player_radius * 2.0 + separation_distance;
                         let min_dist_sq = min_dist * min_dist;
                         
                         // OPTIMIZATION: Early exit with exact distance check
                         if dist_sq >= min_dist_sq || dist_sq <= 0.0 {
                             continue;
                         }
                         
                         overlap_found_in_iter = true;
                         let distance = dist_sq.sqrt();
                         let overlap = (min_dist - distance) + separation_distance;
                         resolved_x += (dx / distance) * overlap;
                         resolved_y += (dy / distance) * overlap;
                    }
                },
                 spatial_grid::EntityType::Tree(tree_id) => {
                     log::debug!("[PushOutEntityType] Found Tree: {}", tree_id);
                     if let Some(tree) = trees.id().find(tree_id) {
                         if tree.health == 0 { continue; }
                         let tree_collision_y = tree.pos_y - crate::tree::TREE_COLLISION_Y_OFFSET;
                         let dx = resolved_x - tree.pos_x;
                         let dy = resolved_y - tree_collision_y;
                         let dist_sq = dx * dx + dy * dy;
                         let min_dist = current_player_radius + crate::tree::TREE_TRUNK_RADIUS + separation_distance;
                         let min_dist_sq = min_dist * min_dist;
                         
                         // OPTIMIZATION: Early exit with exact distance check
                         if dist_sq >= min_dist_sq || dist_sq <= 0.0 {
                             continue;
                         }
                         
                         overlap_found_in_iter = true;
                         let distance = dist_sq.sqrt();
                         let overlap = (min_dist - distance) + separation_distance;
                         resolved_x += (dx / distance) * overlap;
                         resolved_y += (dy / distance) * overlap;
                     }
                },
                 spatial_grid::EntityType::Stone(stone_id) => {
                    log::debug!("[PushOutEntityType] Found Stone: {}", stone_id);
                    if let Some(stone) = stones.id().find(stone_id) {
                        if stone.health == 0 { continue; }
                        let stone_collision_y = stone.pos_y - crate::stone::STONE_COLLISION_Y_OFFSET;
                        let dx = resolved_x - stone.pos_x;
                        let dy = resolved_y - stone_collision_y;
                        let dist_sq = dx * dx + dy * dy;
                        let min_dist = current_player_radius + crate::stone::STONE_RADIUS + separation_distance;
                        let min_dist_sq = min_dist * min_dist;
                        
                        // OPTIMIZATION: Early exit with exact distance check
                        if dist_sq >= min_dist_sq || dist_sq <= 0.0 {
                            continue;
                        }
                        
                        overlap_found_in_iter = true;
                        let distance = dist_sq.sqrt();
                        let overlap = (min_dist - distance) + separation_distance;
                        resolved_x += (dx / distance) * overlap;
                        resolved_y += (dy / distance) * overlap;
                    }
                },
                 spatial_grid::EntityType::BasaltColumn(basalt_id) => {
                    log::debug!("[PushOutEntityType] Found BasaltColumn: {}", basalt_id);
                    if let Some(basalt) = basalt_columns.id().find(basalt_id) {
                        let basalt_collision_y = basalt.pos_y - BASALT_COLUMN_COLLISION_Y_OFFSET;
                        let dx = resolved_x - basalt.pos_x;
                        let dy = resolved_y - basalt_collision_y;
                        let dist_sq = dx * dx + dy * dy;
                        let min_dist = current_player_radius + BASALT_COLUMN_RADIUS + separation_distance;
                        let min_dist_sq = min_dist * min_dist;
                        
                        // OPTIMIZATION: Early exit with exact distance check
                        if dist_sq >= min_dist_sq || dist_sq <= 0.0 {
                            continue;
                        }
                        
                        overlap_found_in_iter = true;
                        let distance = dist_sq.sqrt();
                        let overlap = (min_dist - distance) + separation_distance;
                        resolved_x += (dx / distance) * overlap;
                        resolved_y += (dy / distance) * overlap;
                    }
                },
                spatial_grid::EntityType::AlkStation(station_id) => {
                    log::debug!("[PushOutEntityType] Found AlkStation: {}", station_id);
                    if let Some(station) = alk_stations.station_id().find(station_id) {
                        if !station.is_active { continue; }
                        
                        // AABB collision - central compound uses half height from top, substations use bottom 1/3
                        let is_central_compound = station.station_id == 0;
                        let station_aabb_center_x = station.world_pos_x;
                        let sprite_bottom = station.world_pos_y + 0.0; // ALK_STATION_Y_OFFSET is 0
                        let (aabb_half_height, aabb_half_width, y_offset) = if is_central_compound {
                            (ALK_CENTRAL_COMPOUND_AABB_HALF_HEIGHT, ALK_STATION_AABB_HALF_WIDTH, ALK_CENTRAL_COMPOUND_COLLISION_Y_OFFSET)
                        } else {
                            (ALK_STATION_AABB_HALF_HEIGHT, ALK_STATION_AABB_HALF_WIDTH, 0.0)
                        };
                        let station_aabb_center_y = sprite_bottom - aabb_half_height - y_offset;
                        
                        // AABB collision detection for push-out
                        let closest_x = resolved_x.max(station_aabb_center_x - aabb_half_width).min(station_aabb_center_x + aabb_half_width);
                        let closest_y = resolved_y.max(station_aabb_center_y - aabb_half_height).min(station_aabb_center_y + aabb_half_height);
                        
                        let dx_resolve = resolved_x - closest_x;
                        let dy_resolve = resolved_y - closest_y;
                        let dist_sq_resolve = dx_resolve * dx_resolve + dy_resolve * dy_resolve;
                        let player_radius_sq = current_player_radius * current_player_radius;
                        
                        // OPTIMIZATION: Early exit with exact distance check
                        if dist_sq_resolve >= player_radius_sq {
                            continue;
                        }
                        
                        overlap_found_in_iter = true;
                        if dist_sq_resolve > 0.0 {
                            let distance = dist_sq_resolve.sqrt();
                            let overlap = (current_player_radius - distance) + separation_distance;
                            resolved_x += (dx_resolve / distance) * overlap;
                            resolved_y += (dy_resolve / distance) * overlap;
                        } else {
                            // Player center is inside the AABB - push to nearest face
                            let aabb_left = station_aabb_center_x - aabb_half_width;
                            let aabb_right = station_aabb_center_x + aabb_half_width;
                            let aabb_top = station_aabb_center_y - aabb_half_height;
                            let aabb_bottom = station_aabb_center_y + aabb_half_height;
                            
                            let dist_to_left = resolved_x - aabb_left;
                            let dist_to_right = aabb_right - resolved_x;
                            let dist_to_top = resolved_y - aabb_top;
                            let dist_to_bottom = aabb_bottom - resolved_y;
                            
                            let min_dist = dist_to_left.min(dist_to_right).min(dist_to_top).min(dist_to_bottom);
                            
                            if min_dist == dist_to_left {
                                resolved_x = aabb_left - current_player_radius - separation_distance;
                            } else if min_dist == dist_to_right {
                                resolved_x = aabb_right + current_player_radius + separation_distance;
                            } else if min_dist == dist_to_top {
                                resolved_y = aabb_top - current_player_radius - separation_distance;
                            } else {
                                resolved_y = aabb_bottom + current_player_radius + separation_distance;
                            }
                        }
                    }
                },
                spatial_grid::EntityType::RuneStone(rune_stone_id) => {
                    log::debug!("[PushOutEntityType] Found RuneStone: {}", rune_stone_id);
                    if let Some(rune_stone) = rune_stones.id().find(rune_stone_id) {
                        // AABB collision - 48x48 box centered at pos_x, pos_y - offset
                        let rune_stone_aabb_center_x = rune_stone.pos_x;
                        let rune_stone_aabb_center_y = rune_stone.pos_y - RUNE_STONE_COLLISION_Y_OFFSET;
                        
                        // AABB collision detection for push-out
                        let closest_x = resolved_x.max(rune_stone_aabb_center_x - RUNE_STONE_AABB_HALF_WIDTH).min(rune_stone_aabb_center_x + RUNE_STONE_AABB_HALF_WIDTH);
                        let closest_y = resolved_y.max(rune_stone_aabb_center_y - RUNE_STONE_AABB_HALF_HEIGHT).min(rune_stone_aabb_center_y + RUNE_STONE_AABB_HALF_HEIGHT);
                        
                        let dx_resolve = resolved_x - closest_x;
                        let dy_resolve = resolved_y - closest_y;
                        let dist_sq_resolve = dx_resolve * dx_resolve + dy_resolve * dy_resolve;
                        let player_radius_sq = current_player_radius * current_player_radius;
                        
                        // OPTIMIZATION: Early exit with exact distance check
                        if dist_sq_resolve >= player_radius_sq {
                            continue;
                        }
                        
                        overlap_found_in_iter = true;
                        if dist_sq_resolve > 0.0 {
                            let distance = dist_sq_resolve.sqrt();
                            let overlap = (current_player_radius - distance) + separation_distance;
                            resolved_x += (dx_resolve / distance) * overlap;
                            resolved_y += (dy_resolve / distance) * overlap;
                        } else {
                            // Player center is inside the AABB - push to nearest face
                            let aabb_left = rune_stone_aabb_center_x - RUNE_STONE_AABB_HALF_WIDTH;
                            let aabb_right = rune_stone_aabb_center_x + RUNE_STONE_AABB_HALF_WIDTH;
                            let aabb_top = rune_stone_aabb_center_y - RUNE_STONE_AABB_HALF_HEIGHT;
                            let aabb_bottom = rune_stone_aabb_center_y + RUNE_STONE_AABB_HALF_HEIGHT;
                            
                            let dist_to_left = (resolved_x - aabb_left).abs();
                            let dist_to_right = (resolved_x - aabb_right).abs();
                            let dist_to_top = (resolved_y - aabb_top).abs();
                            let dist_to_bottom = (resolved_y - aabb_bottom).abs();
                            
                            let min_dist = dist_to_left.min(dist_to_right).min(dist_to_top).min(dist_to_bottom);
                            
                            if min_dist == dist_to_left {
                                resolved_x = aabb_left - current_player_radius - separation_distance;
                            } else if min_dist == dist_to_right {
                                resolved_x = aabb_right + current_player_radius + separation_distance;
                            } else if min_dist == dist_to_top {
                                resolved_y = aabb_top - current_player_radius - separation_distance;
                            } else {
                                resolved_y = aabb_bottom + current_player_radius + separation_distance;
                            }
                        }
                    }
                },
                spatial_grid::EntityType::Cairn(cairn_id) => {
                    log::debug!("[PushOutEntityType] Found Cairn: {}", cairn_id);
                    if let Some(cairn) = cairns.id().find(cairn_id) {
                        // AABB collision - 96x48 box centered at pos_x, pos_y - offset
                        let cairn_aabb_center_x = cairn.pos_x;
                        let cairn_aabb_center_y = cairn.pos_y - CAIRN_COLLISION_Y_OFFSET;
                        
                        // AABB collision detection for push-out
                        let closest_x = resolved_x.max(cairn_aabb_center_x - CAIRN_AABB_HALF_WIDTH).min(cairn_aabb_center_x + CAIRN_AABB_HALF_WIDTH);
                        let closest_y = resolved_y.max(cairn_aabb_center_y - CAIRN_AABB_HALF_HEIGHT).min(cairn_aabb_center_y + CAIRN_AABB_HALF_HEIGHT);
                        
                        let dx_resolve = resolved_x - closest_x;
                        let dy_resolve = resolved_y - closest_y;
                        let dist_sq_resolve = dx_resolve * dx_resolve + dy_resolve * dy_resolve;
                        let player_radius_sq = current_player_radius * current_player_radius;
                        
                        // OPTIMIZATION: Early exit with exact distance check
                        if dist_sq_resolve >= player_radius_sq {
                            continue;
                        }
                        
                        overlap_found_in_iter = true;
                        if dist_sq_resolve > 0.0 {
                            let distance = dist_sq_resolve.sqrt();
                            let overlap = (current_player_radius - distance) + separation_distance;
                            resolved_x += (dx_resolve / distance) * overlap;
                            resolved_y += (dy_resolve / distance) * overlap;
                        } else {
                            // Player center is inside the AABB - push to nearest face
                            let aabb_left = cairn_aabb_center_x - CAIRN_AABB_HALF_WIDTH;
                            let aabb_right = cairn_aabb_center_x + CAIRN_AABB_HALF_WIDTH;
                            let aabb_top = cairn_aabb_center_y - CAIRN_AABB_HALF_HEIGHT;
                            let aabb_bottom = cairn_aabb_center_y + CAIRN_AABB_HALF_HEIGHT;
                            
                            let dist_to_left = (resolved_x - aabb_left).abs();
                            let dist_to_right = (resolved_x - aabb_right).abs();
                            let dist_to_top = (resolved_y - aabb_top).abs();
                            let dist_to_bottom = (resolved_y - aabb_bottom).abs();
                            
                            let min_dist = dist_to_left.min(dist_to_right).min(dist_to_top).min(dist_to_bottom);
                            
                            if min_dist == dist_to_left {
                                resolved_x = aabb_left - current_player_radius - separation_distance;
                            } else if min_dist == dist_to_right {
                                resolved_x = aabb_right + current_player_radius + separation_distance;
                            } else if min_dist == dist_to_top {
                                resolved_y = aabb_top - current_player_radius - separation_distance;
                            } else {
                                resolved_y = aabb_bottom + current_player_radius + separation_distance;
                            }
                        }
                    }
                },
                spatial_grid::EntityType::SeaStack(sea_stack_id) => {
                    log::debug!("[PushOutEntityType] Found SeaStack: {}", sea_stack_id);
                    if let Some(sea_stack) = sea_stacks.id().find(sea_stack_id) {
                        // SCALED AABB collision - dimensions scale with sea stack's scale property
                        let (half_width, half_height, y_offset) = get_sea_stack_collision_dimensions(sea_stack.scale);
                        let sea_stack_aabb_center_x = sea_stack.pos_x;
                        let sea_stack_aabb_center_y = sea_stack.pos_y - y_offset;
                        
                        // AABB collision detection for push-out
                        let closest_x = resolved_x.max(sea_stack_aabb_center_x - half_width).min(sea_stack_aabb_center_x + half_width);
                        let closest_y = resolved_y.max(sea_stack_aabb_center_y - half_height).min(sea_stack_aabb_center_y + half_height);
                        
                        let dx_resolve = resolved_x - closest_x;
                        let dy_resolve = resolved_y - closest_y;
                        let dist_sq_resolve = dx_resolve * dx_resolve + dy_resolve * dy_resolve;
                        let player_radius_sq = current_player_radius * current_player_radius;
                        
                        // OPTIMIZATION: Early exit with exact distance check
                        if dist_sq_resolve >= player_radius_sq {
                            continue;
                        }
                        
                        overlap_found_in_iter = true;
                        if dist_sq_resolve > 0.0 {
                            let distance = dist_sq_resolve.sqrt();
                            let overlap = (current_player_radius - distance) + separation_distance;
                            resolved_x += (dx_resolve / distance) * overlap;
                            resolved_y += (dy_resolve / distance) * overlap;
                        } else {
                            // Player center is inside the AABB - push to nearest face
                            let aabb_left = sea_stack_aabb_center_x - half_width;
                            let aabb_right = sea_stack_aabb_center_x + half_width;
                            let aabb_top = sea_stack_aabb_center_y - half_height;
                            let aabb_bottom = sea_stack_aabb_center_y + half_height;
                            
                            let dist_to_left = (resolved_x - aabb_left).abs();
                            let dist_to_right = (resolved_x - aabb_right).abs();
                            let dist_to_top = (resolved_y - aabb_top).abs();
                            let dist_to_bottom = (resolved_y - aabb_bottom).abs();
                            
                            let min_dist = dist_to_left.min(dist_to_right).min(dist_to_top).min(dist_to_bottom);
                            
                            if min_dist == dist_to_left {
                                resolved_x = aabb_left - current_player_radius - separation_distance;
                            } else if min_dist == dist_to_right {
                                resolved_x = aabb_right + current_player_radius + separation_distance;
                            } else if min_dist == dist_to_top {
                                resolved_y = aabb_top - current_player_radius - separation_distance;
                            } else {
                                resolved_y = aabb_bottom + current_player_radius + separation_distance;
                            }
                        }
                    }
                },
                 spatial_grid::EntityType::WoodenStorageBox(box_id) => {
                     log::debug!("[PushOutEntityType] Found WoodenStorageBox: {}", box_id);
                     if let Some(box_instance) = wooden_storage_boxes.id().find(box_id) {
                         let box_collision_y = box_instance.pos_y - crate::wooden_storage_box::BOX_COLLISION_Y_OFFSET;
                         let dx = resolved_x - box_instance.pos_x;
                         let dy = resolved_y - box_collision_y;
                         let dist_sq = dx * dx + dy * dy;
                         let min_dist = current_player_radius + crate::wooden_storage_box::BOX_COLLISION_RADIUS + separation_distance;
                         let min_dist_sq = min_dist * min_dist;
                         
                         // OPTIMIZATION: Early exit with exact distance check
                         if dist_sq >= min_dist_sq || dist_sq <= 0.0 {
                             continue;
                         }
                         
                         overlap_found_in_iter = true;
                         let distance = dist_sq.sqrt();
                         let overlap = (min_dist - distance) + separation_distance;
                         resolved_x += (dx / distance) * overlap;
                         resolved_y += (dy / distance) * overlap;
                     }
                },
                spatial_grid::EntityType::RainCollector(rain_collector_id) => {
                    log::debug!("[PushOutEntityType] Found RainCollector: {}", rain_collector_id);
                    if let Some(rain_collector) = rain_collectors.id().find(rain_collector_id) {
                        if rain_collector.is_destroyed { continue; }
                        let rain_collector_collision_y = rain_collector.pos_y - RAIN_COLLECTOR_COLLISION_Y_OFFSET;
                        let dx = resolved_x - rain_collector.pos_x;
                        let dy = resolved_y - rain_collector_collision_y;
                        let dist_sq = dx * dx + dy * dy;
                        let min_dist = current_player_radius + RAIN_COLLECTOR_COLLISION_RADIUS + separation_distance;
                        let min_dist_sq = min_dist * min_dist;
                        
                        // OPTIMIZATION: Early exit with exact distance check
                        if dist_sq >= min_dist_sq || dist_sq <= 0.0 {
                            continue;
                        }
                        
                        overlap_found_in_iter = true;
                        let distance = dist_sq.sqrt();
                        let overlap = (min_dist - distance) + separation_distance;
                        resolved_x += (dx / distance) * overlap;
                        resolved_y += (dy / distance) * overlap;
                    }
                },
                spatial_grid::EntityType::Shelter(shelter_id) => {
                    log::debug!("[PushOutEntityType] Found Shelter: {}", shelter_id);
                    log::debug!("[PushOutShelterFound] Player {:?} found shelter {} in push-out", sender_id, shelter_id);
                    if let Some(shelter) = shelters.id().find(shelter_id) {
                        if shelter.is_destroyed { 
                            log::debug!("[PushOutShelterDestroyed] Shelter {} is destroyed, skipping", shelter_id);
                            continue; 
                        }
                        // Collision only for non-owners
                        if shelter.placed_by == sender_id { 
                            log::debug!("[PushOutShelterOwner] Player {:?} is owner of shelter {}, skipping collision", sender_id, shelter_id);
                            continue; 
                        }
                        
                        log::debug!("[PushOutShelterProcessing] Player {:?} (non-owner) processing collision with shelter {}", sender_id, shelter_id);

                        let shelter_aabb_center_x = shelter.pos_x;
                        let shelter_aabb_center_y = shelter.pos_y - SHELTER_AABB_CENTER_Y_OFFSET_FROM_POS_Y;

                        // AABB collision detection for push-out
                        let closest_x = resolved_x.max(shelter_aabb_center_x - SHELTER_AABB_HALF_WIDTH).min(shelter_aabb_center_x + SHELTER_AABB_HALF_WIDTH);
                        let closest_y = resolved_y.max(shelter_aabb_center_y - SHELTER_AABB_HALF_HEIGHT).min(shelter_aabb_center_y + SHELTER_AABB_HALF_HEIGHT);
                        
                        let dx_resolve = resolved_x - closest_x;
                        let dy_resolve = resolved_y - closest_y;
                        let dist_sq_resolve = dx_resolve * dx_resolve + dy_resolve * dy_resolve;
                        let player_radius_sq = current_player_radius * current_player_radius;
                        
                        // OPTIMIZATION: Early exit with exact distance check
                        if dist_sq_resolve >= player_radius_sq {
                            continue;
                        }
                        
                        log::debug!(
                            "[PushOutShelterAABB] Player {:?} vs Shelter {}: PlayerPos: ({:.1}, {:.1}), ShelterBase: ({:.1}, {:.1}), AABBCenter: ({:.1}, {:.1}), AABBBounds: ({:.1}-{:.1}, {:.1}-{:.1}), Closest: ({:.1}, {:.1}), DistSq: {:.1}, PlayerRadSq: {:.1}",
                            sender_id, shelter_id,
                            resolved_x, resolved_y,
                            shelter.pos_x, shelter.pos_y,
                            shelter_aabb_center_x, shelter_aabb_center_y,
                            shelter_aabb_center_x - SHELTER_AABB_HALF_WIDTH, shelter_aabb_center_x + SHELTER_AABB_HALF_WIDTH,
                            shelter_aabb_center_y - SHELTER_AABB_HALF_HEIGHT, shelter_aabb_center_y + SHELTER_AABB_HALF_HEIGHT,
                            closest_x, closest_y,
                            dist_sq_resolve,
                            player_radius_sq
                        );
                        
                        overlap_found_in_iter = true;
                        if dist_sq_resolve > 0.0 {
                            let distance = dist_sq_resolve.sqrt();
                            let overlap = (current_player_radius - distance) + separation_distance;
                            resolved_x += (dx_resolve / distance) * overlap;
                            resolved_y += (dy_resolve / distance) * overlap;
                            log::debug!(
                                "[ShelterPushNormal] Player {:?} vs Shelter {}: ResolvedXY: ({:.1}, {:.1}), Distance: {:.1}, Overlap: {:.1}",
                                sender_id, shelter.id, resolved_x, resolved_y, distance, overlap
                            );
                        } else {
                            // Player center is inside the AABB - push to nearest face
                            log::debug!(
                                "[ShelterPushInside] Player {:?} vs Shelter {}: ResolvedXY: ({:.1}, {:.1}), AABBCenter: ({:.1}, {:.1}), AABBHalfSize: ({:.1}, {:.1})",
                                sender_id, shelter.id, resolved_x, resolved_y, shelter_aabb_center_x, shelter_aabb_center_y, SHELTER_AABB_HALF_WIDTH, SHELTER_AABB_HALF_HEIGHT
                            );
                            
                            // Calculate AABB bounds for clarity
                            let aabb_left = shelter_aabb_center_x - SHELTER_AABB_HALF_WIDTH;
                            let aabb_right = shelter_aabb_center_x + SHELTER_AABB_HALF_WIDTH;
                            let aabb_top = shelter_aabb_center_y - SHELTER_AABB_HALF_HEIGHT;
                            let aabb_bottom = shelter_aabb_center_y + SHELTER_AABB_HALF_HEIGHT;
                            
                            log::debug!(
                                "[ShelterPushBounds] AABB bounds: Left: {:.1}, Right: {:.1}, Top: {:.1}, Bottom: {:.1}",
                                aabb_left, aabb_right, aabb_top, aabb_bottom
                            );
                            
                            // Calculate penetration depth on each axis
                            let penetration_left = (resolved_x - aabb_left).abs();
                            let penetration_right = (aabb_right - resolved_x).abs();
                            let penetration_top = (resolved_y - aabb_top).abs();
                            let penetration_bottom = (aabb_bottom - resolved_y).abs();
                            
                            log::debug!(
                                "[ShelterPushPenetration] Penetrations - Left: {:.1}, Right: {:.1}, Top: {:.1}, Bottom: {:.1}",
                                penetration_left, penetration_right, penetration_top, penetration_bottom
                            );
                            
                            // Find the minimum penetration (closest face)
                            let min_x_penetration = penetration_left.min(penetration_right);
                            let min_y_penetration = penetration_top.min(penetration_bottom);
                            
                            if min_x_penetration < min_y_penetration {
                                // Push horizontally
                                if penetration_left < penetration_right {
                                    resolved_x = aabb_left - current_player_radius - separation_distance;
                                } else {
                                    resolved_x = aabb_right + current_player_radius + separation_distance;
                                }
                            } else {
                                // Push vertically
                                if penetration_top < penetration_bottom {
                                    resolved_y = aabb_top - current_player_radius - separation_distance;
                                } else {
                                    resolved_y = aabb_bottom + current_player_radius + separation_distance;
                                }
                            }
                        }
                    }
                },
                spatial_grid::EntityType::PlayerCorpse(_corpse_id) => {
                    // Player corpses have NO collision - players can walk over them to loot
                    continue;
                },
                spatial_grid::EntityType::Furnace(furnace_id) => {
                    log::debug!("[PushOutEntityType] Found Furnace: {}", furnace_id);
                    if let Some(furnace) = furnaces.id().find(furnace_id) {
                        if furnace.is_destroyed { continue; }
                        let furnace_collision_y = furnace.pos_y - crate::furnace::FURNACE_COLLISION_Y_OFFSET;
                        let dx = resolved_x - furnace.pos_x;
                        let dy = resolved_y - furnace_collision_y;
                        let dist_sq = dx * dx + dy * dy;
                        let min_dist = current_player_radius + crate::furnace::FURNACE_COLLISION_RADIUS + separation_distance;
                        let min_dist_sq = min_dist * min_dist;
                        
                        // OPTIMIZATION: Early exit with exact distance check
                        if dist_sq >= min_dist_sq || dist_sq <= 0.0 {
                            continue;
                        }
                        
                        overlap_found_in_iter = true;
                        let distance = dist_sq.sqrt();
                        let overlap = (min_dist - distance) + separation_distance;
                        resolved_x += (dx / distance) * overlap;
                        resolved_y += (dy / distance) * overlap;
                    }
                },
                spatial_grid::EntityType::HomesteadHearth(hearth_id) => {
                    log::debug!("[PushOutEntityType] Found HomesteadHearth: {}", hearth_id);
                    if let Some(hearth) = homestead_hearths.id().find(hearth_id) {
                        if hearth.is_destroyed { continue; }
                        let hearth_collision_y = hearth.pos_y - HEARTH_COLLISION_Y_OFFSET;
                        let dx = resolved_x - hearth.pos_x;
                        let dy = resolved_y - hearth_collision_y;
                        let dist_sq = dx * dx + dy * dy;
                        let min_dist = current_player_radius + HEARTH_COLLISION_RADIUS + separation_distance;
                        let min_dist_sq = min_dist * min_dist;
                        
                        // OPTIMIZATION: Early exit with exact distance check
                        if dist_sq >= min_dist_sq || dist_sq <= 0.0 {
                            continue;
                        }
                        
                        overlap_found_in_iter = true;
                        let distance = dist_sq.sqrt();
                        let overlap = (min_dist - distance) + separation_distance;
                        resolved_x += (dx / distance) * overlap;
                        resolved_y += (dy / distance) * overlap;
                    }
                },
                spatial_grid::EntityType::Lantern(lantern_id) => {
                    // Lanterns: Only wards (lantern_type > 0) have collision, regular lanterns intentionally have no collision
                    log::debug!("[PushOutEntityType] Found Lantern/Ward: {}", lantern_id);
                    if let Some(lantern) = lanterns.id().find(lantern_id) {
                        if lantern.is_destroyed { continue; }
                        // Only wards have collision (lantern_type: 1 = Ancestral Ward, 2 = Signal Disruptor, 3 = Memory Beacon)
                        if lantern.lantern_type == 0 { continue; } // Skip regular lanterns
                        
                        let ward_collision_y = lantern.pos_y - WARD_COLLISION_Y_OFFSET;
                        let dx = resolved_x - lantern.pos_x;
                        let dy = resolved_y - ward_collision_y;
                        let dist_sq = dx * dx + dy * dy;
                        let min_dist = current_player_radius + WARD_COLLISION_RADIUS + separation_distance;
                        let min_dist_sq = min_dist * min_dist;
                        
                        // OPTIMIZATION: Early exit with exact distance check
                        if dist_sq >= min_dist_sq || dist_sq <= 0.0 {
                            continue;
                        }
                        
                        overlap_found_in_iter = true;
                        let distance = dist_sq.sqrt();
                        let overlap = (min_dist - distance) + separation_distance;
                        resolved_x += (dx / distance) * overlap;
                        resolved_y += (dy / distance) * overlap;
                    }
                },
                spatial_grid::EntityType::Turret(turret_id) => {
                    // Turrets have collision (same as wards - 256x256 sprites)
                    log::debug!("[PushOutEntityType] Found Turret: {}", turret_id);
                    if let Some(turret) = turrets.id().find(turret_id) {
                        if turret.is_destroyed { continue; }
                        
                        let turret_collision_y = turret.pos_y - TURRET_COLLISION_Y_OFFSET;
                        let dx = resolved_x - turret.pos_x;
                        let dy = resolved_y - turret_collision_y;
                        let dist_sq = dx * dx + dy * dy;
                        let min_dist = current_player_radius + TURRET_COLLISION_RADIUS + separation_distance;
                        let min_dist_sq = min_dist * min_dist;
                        
                        // OPTIMIZATION: Early exit with exact distance check
                        if dist_sq >= min_dist_sq || dist_sq <= 0.0 {
                            continue;
                        }
                        
                        let distance = dist_sq.sqrt();
                        if distance < min_dist {
                            let overlap = (min_dist - distance) + separation_distance;
                            resolved_x += (dx / distance) * overlap;
                            resolved_y += (dy / distance) * overlap;
                        }
                    }
                },
                _ => {} // Campfire, etc. - no push-out resolution
             }
        }

        // Check door collisions - closed doors block movement (not in spatial grid)
        if let Some((pushback_x, pushback_y)) = crate::door::check_door_collision(ctx, resolved_x, resolved_y, current_player_radius) {
            resolved_x += pushback_x;
            resolved_y += pushback_y;
            overlap_found_in_iter = true;
        }
        
        // Check wall collisions for push-out - walls are NOT in spatial grid, checked via foundation cell coordinates
        // CRITICAL FIX: Walls use FOUNDATION_TILE_SIZE_PX (96px), NOT TILE_SIZE_PX (48px)!
        // This fixes wall clipping by pushing players out of walls they've somehow ended up inside
        const WALL_COLLISION_THICKNESS: f32 = 6.0; // Same as slide collision
        const CHECK_RADIUS_CELLS: i32 = 2; // Check walls within 2 foundation cells
        
        let player_cell_x = (resolved_x / FOUNDATION_TILE_SIZE_PX as f32).floor() as i32;
        let player_cell_y = (resolved_y / FOUNDATION_TILE_SIZE_PX as f32).floor() as i32;
        
        for cell_offset_x in -CHECK_RADIUS_CELLS..=CHECK_RADIUS_CELLS {
            for cell_offset_y in -CHECK_RADIUS_CELLS..=CHECK_RADIUS_CELLS {
                let check_cell_x = player_cell_x + cell_offset_x;
                let check_cell_y = player_cell_y + cell_offset_y;
                
                // Find walls on this foundation cell
                for wall in wall_cells.idx_cell_coords().filter((check_cell_x, check_cell_y)) {
                    if wall.is_destroyed { continue; }
                    
                    // Calculate wall edge collision bounds using foundation cell size (96px)
                    let cell_left = check_cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32;
                    let cell_top = check_cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32;
                    let cell_right = cell_left + FOUNDATION_TILE_SIZE_PX as f32;
                    let cell_bottom = cell_top + FOUNDATION_TILE_SIZE_PX as f32;
                    
                    // Determine wall edge bounds based on edge direction
                    // Edge 0 = North (top), 1 = East (right), 2 = South (bottom), 3 = West (left)
                    let (wall_min_x, wall_max_x, wall_min_y, wall_max_y) = match wall.edge {
                        0 => { // North (top edge) - horizontal line
                            (cell_left, cell_right, cell_top - WALL_COLLISION_THICKNESS / 2.0, cell_top + WALL_COLLISION_THICKNESS / 2.0)
                        },
                        1 => { // East (right edge) - vertical line
                            (cell_right - WALL_COLLISION_THICKNESS / 2.0, cell_right + WALL_COLLISION_THICKNESS / 2.0, cell_top, cell_bottom)
                        },
                        2 => { // South (bottom edge) - horizontal line
                            (cell_left, cell_right, cell_bottom - WALL_COLLISION_THICKNESS / 2.0, cell_bottom + WALL_COLLISION_THICKNESS / 2.0)
                        },
                        3 => { // West (left edge) - vertical line
                            (cell_left - WALL_COLLISION_THICKNESS / 2.0, cell_left + WALL_COLLISION_THICKNESS / 2.0, cell_top, cell_bottom)
                        },
                        _ => continue, // Skip diagonal or invalid edges
                    };
                    
                    // Check if player circle intersects wall AABB
                    let closest_x = resolved_x.max(wall_min_x).min(wall_max_x);
                    let closest_y = resolved_y.max(wall_min_y).min(wall_max_y);
                    let dx = resolved_x - closest_x;
                    let dy = resolved_y - closest_y;
                    let dist_sq = dx * dx + dy * dy;
                    
                    if dist_sq < current_player_radius * current_player_radius {
                        // Player is overlapping wall - push them out
                        overlap_found_in_iter = true;
                        
                        if dist_sq > 0.001 {
                            // Push directly away from closest point on wall
                            let dist = dist_sq.sqrt();
                            let push_amount = current_player_radius - dist + separation_distance;
                            resolved_x += (dx / dist) * push_amount;
                            resolved_y += (dy / dist) * push_amount;
                        } else {
                            // Player center is exactly on or inside wall - push perpendicular to wall
                            match wall.edge {
                                0 => { // North wall - push down (positive Y)
                                    resolved_y = wall_max_y + current_player_radius + separation_distance;
                                },
                                1 => { // East wall - push left (negative X)
                                    resolved_x = wall_min_x - current_player_radius - separation_distance;
                                },
                                2 => { // South wall - push up (negative Y)
                                    resolved_y = wall_min_y - current_player_radius - separation_distance;
                                },
                                3 => { // West wall - push right (positive X)
                                    resolved_x = wall_max_x + current_player_radius + separation_distance;
                                },
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
        
        // Compound building collision REMOVED - handled client-side only

        resolved_x = resolved_x.max(current_player_radius).min(WORLD_WIDTH_PX - current_player_radius);
        resolved_y = resolved_y.max(current_player_radius).min(WORLD_HEIGHT_PX - current_player_radius);

        if !overlap_found_in_iter {
            break;
        }
        if _iter == resolution_iterations - 1 {
             log::warn!("Push-out collision resolution reached max iterations for {:?}. Position: ({}, {})", sender_id, resolved_x, resolved_y);
        }
    }
    (resolved_x, resolved_y)
}

/// PERFORMANCE OPTIMIZED: Combined collision function that creates spatial grid once
/// This should be used instead of calling slide and push-out separately
pub fn calculate_optimized_collision(
    ctx: &ReducerContext,
    sender_id: Identity,
    current_player_pos_x: f32,
    current_player_pos_y: f32,
    proposed_x: f32,
    proposed_y: f32,
    server_dx: f32,
    server_dy: f32,
) -> (f32, f32) {
    // PERFORMANCE CRITICAL: Create spatial grid only once for both operations
    let grid = spatial_grid::get_cached_spatial_grid(&ctx.db, ctx.timestamp);
    
    // Step 1: Apply sliding collision
    let (slid_x, slid_y) = calculate_slide_collision_with_grid(
        grid, ctx, sender_id, current_player_pos_x, current_player_pos_y, 
        proposed_x, proposed_y, server_dx, server_dy
    );
    
    // Step 2: Apply push-out collision using same grid
    let slide_distance = ((slid_x - proposed_x).powi(2) + (slid_y - proposed_y).powi(2)).sqrt();
    if slide_distance > 3.0 {
        // If sliding moved us significantly, trust the slide result (anti-gravity well)
        log::debug!("Player {:?} slide correction of {:.1}px applied, skipping push-out", sender_id, slide_distance);
        (slid_x, slid_y)
    } else {
        // Apply gentle push-out using the same spatial grid
        let push_result = resolve_push_out_collision_with_grid(grid, ctx, sender_id, slid_x, slid_y);
        
        // Verify the push-out didn't move us too far from intended position
        let push_distance = ((push_result.0 - slid_x).powi(2) + (push_result.1 - slid_y).powi(2)).sqrt();
        if push_distance > 20.0 {
            log::debug!("Player {:?} push-out distance {:.1}px too large, using slide result", sender_id, push_distance);
            (slid_x, slid_y)
        } else {
            push_result
        }
    }
}

// ==========================================================================
// ANTI-TUNNELING FUNCTIONS FOR PLAYER MOVEMENT
// Prevents fast-moving players (especially during dodge rolls) from passing through walls
// ==========================================================================

/// ANTI-TUNNELING: Check if a player movement line crosses any walls
/// Returns the safe position just before hitting the wall, or None if path is clear
fn check_wall_line_collision_player<DB: WallCellTableTrait>(
    db: &DB,
    start_x: f32,
    start_y: f32,
    end_x: f32,
    end_y: f32,
    player_radius: f32,
) -> Option<(f32, f32)> {
    const WALL_THICKNESS: f32 = 12.0; // Slightly thicker for line check to catch edge cases
    const STEP_SIZE: f32 = 15.0; // Check every 15 pixels along the path (more frequent than animals)
    
    let dx = end_x - start_x;
    let dy = end_y - start_y;
    let distance = (dx * dx + dy * dy).sqrt();
    
    if distance < 1.0 {
        return None; // Not moving significantly
    }
    
    // Number of steps to check along the path
    let num_steps = ((distance / STEP_SIZE).ceil() as i32).max(1);
    
    // Calculate which foundation cells to check (the movement might cross multiple cells)
    let min_cell_x = ((start_x.min(end_x) - player_radius) / FOUNDATION_TILE_SIZE_PX as f32).floor() as i32 - 1;
    let max_cell_x = ((start_x.max(end_x) + player_radius) / FOUNDATION_TILE_SIZE_PX as f32).ceil() as i32 + 1;
    let min_cell_y = ((start_y.min(end_y) - player_radius) / FOUNDATION_TILE_SIZE_PX as f32).floor() as i32 - 1;
    let max_cell_y = ((start_y.max(end_y) + player_radius) / FOUNDATION_TILE_SIZE_PX as f32).ceil() as i32 + 1;
    
    let wall_cells = db.wall_cell();
    
    // Collect all walls in the movement area
    let mut walls_to_check: Vec<_> = Vec::new();
    for cell_x in min_cell_x..=max_cell_x {
        for cell_y in min_cell_y..=max_cell_y {
            for wall in wall_cells.idx_cell_coords().filter((cell_x, cell_y)) {
                if wall.is_destroyed { continue; }
                walls_to_check.push((cell_x, cell_y, wall.edge));
            }
        }
    }
    
    if walls_to_check.is_empty() {
        return None; // No walls in the area
    }
    
    // Check each step along the movement path
    for step in 0..=num_steps {
        let t = step as f32 / num_steps as f32;
        let check_x = start_x + dx * t;
        let check_y = start_y + dy * t;
        
        // Check against all walls we collected
        for &(cell_x, cell_y, edge) in &walls_to_check {
            let cell_left = cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32;
            let cell_top = cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32;
            let cell_right = cell_left + FOUNDATION_TILE_SIZE_PX as f32;
            let cell_bottom = cell_top + FOUNDATION_TILE_SIZE_PX as f32;
            
            let (wall_min_x, wall_max_x, wall_min_y, wall_max_y) = match edge {
                0 => (cell_left, cell_right, cell_top - WALL_THICKNESS / 2.0, cell_top + WALL_THICKNESS / 2.0),
                1 => (cell_right - WALL_THICKNESS / 2.0, cell_right + WALL_THICKNESS / 2.0, cell_top, cell_bottom),
                2 => (cell_left, cell_right, cell_bottom - WALL_THICKNESS / 2.0, cell_bottom + WALL_THICKNESS / 2.0),
                3 => (cell_left - WALL_THICKNESS / 2.0, cell_left + WALL_THICKNESS / 2.0, cell_top, cell_bottom),
                _ => continue,
            };
            
            // Check if position intersects wall
            let closest_x = check_x.max(wall_min_x).min(wall_max_x);
            let closest_y = check_y.max(wall_min_y).min(wall_max_y);
            let dx_to_wall = check_x - closest_x;
            let dy_to_wall = check_y - closest_y;
            let dist_sq = dx_to_wall * dx_to_wall + dy_to_wall * dy_to_wall;
            
            if dist_sq < player_radius * player_radius {
                // Found collision! Return position one step back (safe position)
                if step == 0 {
                    // Already colliding at start - stay at start
                    return Some((start_x, start_y));
                }
                // Go back one step and add buffer
                let safe_t = ((step - 1) as f32 / num_steps as f32).max(0.0);
                let safe_x = start_x + dx * safe_t;
                let safe_y = start_y + dy * safe_t;
                return Some((safe_x, safe_y));
            }
        }
    }
    
    None // Path is clear
}

/// ANTI-TUNNELING: Check if a player movement line crosses any closed doors
/// Returns the safe position just before hitting the door, or None if path is clear
fn check_door_line_collision_player(
    ctx: &ReducerContext,
    start_x: f32,
    start_y: f32,
    end_x: f32,
    end_y: f32,
    player_radius: f32,
) -> Option<(f32, f32)> {
    const DOOR_THICKNESS: f32 = 12.0; // Slightly thicker for line check
    const STEP_SIZE: f32 = 15.0; // Check every 15 pixels along the path
    
    let dx = end_x - start_x;
    let dy = end_y - start_y;
    let distance = (dx * dx + dy * dy).sqrt();
    
    if distance < 1.0 {
        return None; // Not moving significantly
    }
    
    // Number of steps to check along the path
    let num_steps = ((distance / STEP_SIZE).ceil() as i32).max(1);
    
    // Calculate which foundation cells to check
    let min_cell_x = ((start_x.min(end_x) - player_radius) / FOUNDATION_TILE_SIZE_PX as f32).floor() as i32 - 1;
    let max_cell_x = ((start_x.max(end_x) + player_radius) / FOUNDATION_TILE_SIZE_PX as f32).ceil() as i32 + 1;
    let min_cell_y = ((start_y.min(end_y) - player_radius) / FOUNDATION_TILE_SIZE_PX as f32).floor() as i32 - 1;
    let max_cell_y = ((start_y.max(end_y) + player_radius) / FOUNDATION_TILE_SIZE_PX as f32).ceil() as i32 + 1;
    
    let doors = ctx.db.door();
    
    // Collect all closed doors in the movement area
    let mut doors_to_check: Vec<_> = Vec::new();
    for cell_x in min_cell_x..=max_cell_x {
        for cell_y in min_cell_y..=max_cell_y {
            for door in doors.idx_cell_coords().filter((cell_x, cell_y)) {
                if door.is_destroyed || door.is_open { continue; }
                doors_to_check.push((cell_x, cell_y, door.edge));
            }
        }
    }
    
    if doors_to_check.is_empty() {
        return None; // No closed doors in the area
    }
    
    // Check each step along the movement path
    for step in 0..=num_steps {
        let t = step as f32 / num_steps as f32;
        let check_x = start_x + dx * t;
        let check_y = start_y + dy * t;
        
        // Check against all doors we collected
        for &(cell_x, cell_y, edge) in &doors_to_check {
            let cell_left = cell_x as f32 * FOUNDATION_TILE_SIZE_PX as f32;
            let cell_top = cell_y as f32 * FOUNDATION_TILE_SIZE_PX as f32;
            let cell_right = cell_left + FOUNDATION_TILE_SIZE_PX as f32;
            let cell_bottom = cell_top + FOUNDATION_TILE_SIZE_PX as f32;
            
            // Doors are only on North (0) or South (2) edges
            let (door_min_x, door_max_x, door_min_y, door_max_y) = match edge {
                0 => (cell_left, cell_right, cell_top - DOOR_THICKNESS / 2.0, cell_top + DOOR_THICKNESS / 2.0),
                2 => {
                    // South doors have collision positioned higher
                    let collision_y = cell_bottom - 24.0;
                    (cell_left, cell_right, collision_y - DOOR_THICKNESS / 2.0, collision_y + DOOR_THICKNESS / 2.0)
                },
                _ => continue,
            };
            
            // Check if position intersects door
            let closest_x = check_x.max(door_min_x).min(door_max_x);
            let closest_y = check_y.max(door_min_y).min(door_max_y);
            let dx_to_door = check_x - closest_x;
            let dy_to_door = check_y - closest_y;
            let dist_sq = dx_to_door * dx_to_door + dy_to_door * dy_to_door;
            
            if dist_sq < player_radius * player_radius {
                // Found collision! Return position one step back
                if step == 0 {
                    return Some((start_x, start_y));
                }
                let safe_t = ((step - 1) as f32 / num_steps as f32).max(0.0);
                let safe_x = start_x + dx * safe_t;
                let safe_y = start_y + dy * safe_t;
                return Some((safe_x, safe_y));
            }
        }
    }
    
    None // Path is clear
}
