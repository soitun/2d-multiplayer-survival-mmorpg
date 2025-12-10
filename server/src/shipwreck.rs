// server/src/shipwreck.rs
// ------------------------------------
// Shipwreck monument collision definitions.
// Shipwrecks are dynamically placed during world generation and stored in shipwreck_part table.
// Client-side rendering, server-side collision validation.
// ------------------------------------

use crate::ReducerContext;
use crate::shipwreck_part as ShipwreckPartTableTrait;
use spacetimedb::Table;

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
    for part in ctx.db.shipwreck_part().iter() {
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
    
    for part in ctx.db.shipwreck_part().iter() {
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
    for part in ctx.db.shipwreck_part().iter() {
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

