// server/src/fishing_village.rs
// ------------------------------------
// Fishing village monument collision definitions and fishing bonuses.
// Fishing villages are dynamically placed during world generation and stored in fishing_village_part table.
// Client-side rendering, server-side collision validation.
// NOTE: Per user request, fishing village buildings have NO collision (collision_radius = 0)
// ------------------------------------

use crate::ReducerContext;
use crate::monument_part as MonumentPartTableTrait;
use crate::MonumentType;
use spacetimedb::Table;

// =============================================================================
// FISHING VILLAGE BONUS CONSTANTS
// =============================================================================

/// Radius around the fishing village center where fishing bonuses apply (in pixels)
/// This is larger than the village itself to cover nearby fishing waters
/// 1200px = ~25 tiles of fishing area around the village
pub const FISHING_VILLAGE_BONUS_RADIUS: f32 = 1200.0;
pub const FISHING_VILLAGE_BONUS_RADIUS_SQ: f32 = FISHING_VILLAGE_BONUS_RADIUS * FISHING_VILLAGE_BONUS_RADIUS;

/// Fishing haul multiplier when fishing near the village (2x catches)
pub const FISHING_VILLAGE_HAUL_MULTIPLIER: f32 = 2.0;

/// Bonus fish chance multiplier when fishing near the village
pub const FISHING_VILLAGE_BONUS_FISH_CHANCE_MULTIPLIER: f32 = 1.5;

/// Premium tier chance bonus when fishing near the village (Aleut fishing expertise)
pub const FISHING_VILLAGE_PREMIUM_TIER_BONUS: f32 = 0.05; // +5% chance for premium fish

// =============================================================================
// FISHING VILLAGE BONUS CHECKS
// =============================================================================

/// Checks if a position is within the fishing village bonus zone
/// The bonus zone is larger than the village itself to cover nearby fishing waters
/// Returns true if the position qualifies for fishing bonuses
pub fn is_position_in_fishing_village_zone(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    for part in ctx.db.monument_part().iter() {
        // Only check against the center piece for zone determination
        if part.monument_type != MonumentType::FishingVillage || !part.is_center {
            continue;
        }
        let dx = pos_x - part.world_x;
        let dy = pos_y - part.world_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq <= FISHING_VILLAGE_BONUS_RADIUS_SQ {
            return true;
        }
    }
    
    false
}

/// Gets the fishing village center position if it exists
/// Returns Some((x, y)) of the village center, or None if not found
pub fn get_fishing_village_center(ctx: &ReducerContext) -> Option<(f32, f32)> {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type == MonumentType::FishingVillage && part.is_center {
            return Some((part.world_x, part.world_y));
        }
    }
    None
}

/// Check if a position collides with any fishing village part.
/// NOTE: Currently returns false since fishing village has no collision per user request.
/// 
/// # Arguments
/// * `ctx` - ReducerContext to access fishing_village_part table
/// * `pos_x` - World X position to check
/// * `pos_y` - World Y position to check
/// * `entity_radius` - Radius of the entity being checked (e.g., player radius)
/// 
/// # Returns
/// `true` if the position would collide with any fishing village part
pub fn check_fishing_village_collision(ctx: &ReducerContext, pos_x: f32, pos_y: f32, entity_radius: f32) -> bool {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::FishingVillage {
            continue;
        }
        // Skip parts with 0 collision radius (no collision)
        if part.collision_radius <= 0.0 {
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

/// Get the collision resolution vector for fishing village.
/// Returns the push-out direction and distance if colliding.
/// NOTE: Currently returns None since fishing village has no collision per user request.
/// 
/// # Arguments
/// * `ctx` - ReducerContext to access fishing_village_part table
/// * `pos_x` - World X position to check
/// * `pos_y` - World Y position to check
/// * `entity_radius` - Radius of the entity being checked
/// 
/// # Returns
/// `Some((new_x, new_y))` with resolved position if colliding, `None` if no collision
pub fn resolve_fishing_village_collision(
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
        if part.monument_type != MonumentType::FishingVillage {
            continue;
        }
        // Skip parts with 0 collision radius (no collision)
        if part.collision_radius <= 0.0 {
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

/// Check if a line segment intersects any fishing village part.
/// Useful for projectile/raycast collision.
/// NOTE: Currently returns false since fishing village has no collision per user request.
/// 
/// # Arguments
/// * `ctx` - ReducerContext to access fishing_village_part table
/// * `start_x`, `start_y` - Line start position
/// * `end_x`, `end_y` - Line end position
/// 
/// # Returns
/// `true` if the line intersects any fishing village part
pub fn line_intersects_fishing_village(
    ctx: &ReducerContext,
    start_x: f32,
    start_y: f32,
    end_x: f32,
    end_y: f32,
) -> bool {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::FishingVillage {
            continue;
        }
        // Skip parts with 0 collision radius (no collision)
        if part.collision_radius <= 0.0 {
            continue;
        }
        
        // Line-circle intersection test for fishing village parts
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
