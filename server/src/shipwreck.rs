// server/src/shipwreck.rs
// ------------------------------------
// Shipwreck monument collision definitions and protection zones.
// Shipwrecks are dynamically placed during world generation and stored in shipwreck_part table.
// Client-side rendering, server-side collision validation.
// 
// PROTECTION SYSTEM:
// Shipwreck parts serve as protected "safe zones" for new players:
// - Players inside a shipwreck part's protection radius get the "indoors" effect
// - Hostile NPCs (Shorebound, Shardkin, DrownedWatch) won't approach players inside shipwrecks
// - At night, shipwrecks emit eerie blue/purple glow and particles (client-side)
// ------------------------------------

use crate::ReducerContext;
use crate::monument_part as MonumentPartTableTrait;
use crate::MonumentType;
use spacetimedb::Table;

/// Protection radius for shipwreck parts (in pixels)
/// Players within this radius of any shipwreck part are considered "indoors"
/// This is a tight radius around the actual ship hull parts for shelter effect
pub const SHIPWRECK_PROTECTION_RADIUS: f32 = 192.0;
pub const SHIPWRECK_PROTECTION_RADIUS_SQ: f32 = SHIPWRECK_PROTECTION_RADIUS * SHIPWRECK_PROTECTION_RADIUS;

/// Y-offset for protection zone center (in pixels)
/// Shipwreck sprites are 512px tall with anchor at bottom (worldY)
/// The visual center is ~220px above the anchor point
/// This offset ensures the protection zone matches the visual center of the ship parts
pub const SHIPWRECK_PROTECTION_Y_OFFSET: f32 = 220.0;

/// NPC exclusion zone radius - matches building restriction radius
/// Hostile NPCs will actively avoid entering this entire zone
/// This is much larger than protection radius to prevent NPC griefing
pub const SHIPWRECK_NPC_EXCLUSION_RADIUS: f32 = 1500.0;
pub const SHIPWRECK_NPC_EXCLUSION_RADIUS_SQ: f32 = SHIPWRECK_NPC_EXCLUSION_RADIUS * SHIPWRECK_NPC_EXCLUSION_RADIUS;

/// Check if a position collides with any shipwreck part.
/// 
/// # Arguments
/// * `ctx` - ReducerContext to access shipwreck_part table
/// * `pos_x` - World X position to check
/// * `pos_y` - World Y position to check
/// * `entity_radius` - Radius of the entity being checked (e.g., player radius)
/// 
/// # Returns
/// `true` if the position would collide with any shipwreck part
pub fn check_shipwreck_collision(ctx: &ReducerContext, pos_x: f32, pos_y: f32, entity_radius: f32) -> bool {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::Shipwreck {
            continue;
        }
        let dx = pos_x - part.world_x;
        let dy = pos_y - part.world_y;
        let dist_sq = dx * dx + dy * dy;
        let min_dist = part.collision_radius + entity_radius;
        
        if dist_sq < min_dist * min_dist {
            return true;
        }
    }
    
    false
}

/// Get the collision resolution vector for shipwrecks.
/// Returns the push-out direction and distance if colliding.
/// 
/// # Arguments
/// * `ctx` - ReducerContext to access shipwreck_part table
/// * `pos_x` - World X position to check
/// * `pos_y` - World Y position to check
/// * `entity_radius` - Radius of the entity being checked
/// 
/// # Returns
/// `Some((new_x, new_y))` with resolved position if colliding, `None` if no collision
pub fn resolve_shipwreck_collision(
    ctx: &ReducerContext,
    pos_x: f32, 
    pos_y: f32, 
    entity_radius: f32
) -> Option<(f32, f32)> {
    let separation_distance = 1.0; // Extra separation to prevent getting stuck
    
    let mut resolved_x = pos_x;
    let mut resolved_y = pos_y;
    let mut any_collision = false;
    
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::Shipwreck {
            continue;
        }
        let dx = resolved_x - part.world_x;
        let dy = resolved_y - part.world_y;
        let dist_sq = dx * dx + dy * dy;
        let min_dist = part.collision_radius + entity_radius;
        
        if dist_sq < min_dist * min_dist {
            any_collision = true;
            
            // Calculate push-out direction
            let dist = dist_sq.sqrt();
            if dist > 0.001 {
                // Normalize and push out
                let nx = dx / dist;
                let ny = dy / dist;
                let push_dist = min_dist - dist + separation_distance;
                resolved_x += nx * push_dist;
                resolved_y += ny * push_dist;
            } else {
                // Entity is exactly at center, push in arbitrary direction
                resolved_x += min_dist + separation_distance;
            }
        }
    }
    
    if any_collision {
        Some((resolved_x, resolved_y))
    } else {
        None
    }
}

/// Check if a line segment intersects any shipwreck part.
/// Useful for projectile/raycast collision.
/// 
/// # Arguments
/// * `ctx` - ReducerContext to access shipwreck_part table
/// * `start_x`, `start_y` - Line start position
/// * `end_x`, `end_y` - Line end position
/// 
/// # Returns
/// `true` if the line intersects any shipwreck part
pub fn line_intersects_shipwreck(
    ctx: &ReducerContext,
    start_x: f32,
    start_y: f32,
    end_x: f32,
    end_y: f32,
) -> bool {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::Shipwreck {
            continue;
        }
        // Line-circle intersection test for shipwreck parts
        let dx = end_x - start_x;
        let dy = end_y - start_y;
        let fx = start_x - part.world_x;
        let fy = start_y - part.world_y;
        
        let a = dx * dx + dy * dy;
        let b = 2.0 * (fx * dx + fy * dy);
        let c = fx * fx + fy * fy - part.collision_radius * part.collision_radius;
        
        let discriminant = b * b - 4.0 * a * c;
        
        if discriminant >= 0.0 {
            let discriminant_sqrt = discriminant.sqrt();
            let t1 = (-b - discriminant_sqrt) / (2.0 * a);
            let t2 = (-b + discriminant_sqrt) / (2.0 * a);
            
            // Check if intersection is within line segment (t in [0, 1])
            if (t1 >= 0.0 && t1 <= 1.0) || (t2 >= 0.0 && t2 <= 1.0) {
                return true;
            }
        }
    }
    
    false
}

/// Check if a position is within the protection radius of any shipwreck part.
/// Players within this radius are considered "indoors" for the purpose of:
/// - Hostile NPC behavior (they won't approach)
/// - Status effects (warmth protection similar to shelters)
/// - New player safe zone protection
///
/// NOTE: Protection zone is centered at the VISUAL CENTER of shipwreck parts,
/// not at the anchor point (worldY). This is achieved by applying SHIPWRECK_PROTECTION_Y_OFFSET.
///
/// # Arguments
/// * `ctx` - ReducerContext to access shipwreck_part table
/// * `pos_x` - World X position to check
/// * `pos_y` - World Y position to check
///
/// # Returns
/// `true` if the position is within protection radius of any shipwreck part
pub fn is_position_protected_by_shipwreck(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::Shipwreck {
            continue;
        }
        let dx = pos_x - part.world_x;
        // Apply Y-offset to check distance from visual center, not anchor point
        let dy = pos_y - (part.world_y - SHIPWRECK_PROTECTION_Y_OFFSET);
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < SHIPWRECK_PROTECTION_RADIUS_SQ {
            return true;
        }
    }
    
    false
}

/// Get the nearest shipwreck part to a position within protection radius.
/// Returns Some((part_id, distance_squared)) if within protection range.
/// 
/// NOTE: Uses visual center offset (SHIPWRECK_PROTECTION_Y_OFFSET) for distance calculation.
///
/// # Arguments
/// * `ctx` - ReducerContext to access shipwreck_part table
/// * `pos_x` - World X position to check
/// * `pos_y` - World Y position to check
///
/// # Returns
/// `Some((part_id, distance_squared))` if near a shipwreck, `None` otherwise
pub fn get_nearest_shipwreck_part(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> Option<(u64, f32)> {
    let mut nearest: Option<(u64, f32)> = None;
    
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::Shipwreck {
            continue;
        }
        let dx = pos_x - part.world_x;
        // Apply Y-offset to check distance from visual center, not anchor point
        let dy = pos_y - (part.world_y - SHIPWRECK_PROTECTION_Y_OFFSET);
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < SHIPWRECK_PROTECTION_RADIUS_SQ {
            match nearest {
                None => nearest = Some((part.id, dist_sq)),
                Some((_, prev_dist_sq)) if dist_sq < prev_dist_sq => {
                    nearest = Some((part.id, dist_sq));
                }
                _ => {}
            }
        }
    }
    
    nearest
}

/// Check if a position is within the NPC exclusion zone of any shipwreck.
/// Hostile NPCs should actively avoid entering this entire area.
/// Returns Some((center_x, center_y, distance)) if inside exclusion zone.
pub fn is_position_in_shipwreck_exclusion_zone(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> Option<(f32, f32, f32)> {
    // Only check the center piece for the exclusion zone (not each individual part)
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::Shipwreck || !part.is_center {
            continue;
        }
        let dx = pos_x - part.world_x;
        let dy = pos_y - part.world_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < SHIPWRECK_NPC_EXCLUSION_RADIUS_SQ {
            return Some((part.world_x, part.world_y, dist_sq.sqrt()));
        }
    }
    
    None
}
