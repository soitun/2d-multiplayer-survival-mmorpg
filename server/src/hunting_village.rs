// server/src/hunting_village.rs
// ------------------------------------
// Hunting Village monument collision definitions and protection zones.
// Hunting villages are dynamically placed during world generation in forest biomes.
// Client-side rendering, server-side collision validation.
// 
// THEME:
// A boreal Aleutian-style hunting village nestled in a forest clearing,
// surrounded by a ring of trees. A safe haven for weary travelers.
//
// PARTS:
// - hv_lodge.png: Main lodge building (center piece, main landmark)
// - hv_hut1.png: Small hunting hut
// - hv_hut2.png: Small hunting hut (variant)
// - hv_hut3.png: Small hunting hut (variant)
// - fv_campfire.png: Campfire (reusing fishing village asset)
// - hv_drying_rack.png: Drying rack for pelts and meat
// ------------------------------------

use crate::ReducerContext;
use crate::monument_part as MonumentPartTableTrait;
use crate::MonumentType;
use spacetimedb::Table;

// =============================================================================
// HUNTING VILLAGE PROTECTION CONSTANTS
// =============================================================================

/// Safe zone radius for the hunting village (in pixels)
/// Players within this radius are protected from PvP and hostile NPC attacks
/// Similar to Fishing Village - a communal safe haven
pub const HUNTING_VILLAGE_SAFE_ZONE_RADIUS: f32 = 600.0;
pub const HUNTING_VILLAGE_SAFE_ZONE_RADIUS_SQ: f32 = HUNTING_VILLAGE_SAFE_ZONE_RADIUS * HUNTING_VILLAGE_SAFE_ZONE_RADIUS;

/// NPC exclusion zone radius - matches building restriction radius
/// Hostile NPCs will actively avoid entering this entire zone
/// This is much larger than safe zone radius to prevent NPC griefing
pub const HUNTING_VILLAGE_NPC_EXCLUSION_RADIUS: f32 = 1200.0;
pub const HUNTING_VILLAGE_NPC_EXCLUSION_RADIUS_SQ: f32 = HUNTING_VILLAGE_NPC_EXCLUSION_RADIUS * HUNTING_VILLAGE_NPC_EXCLUSION_RADIUS;

/// Cozy effect radius - players near the campfire feel cozy (warmth, comfort)
pub const HUNTING_VILLAGE_COZY_RADIUS: f32 = 400.0;
pub const HUNTING_VILLAGE_COZY_RADIUS_SQ: f32 = HUNTING_VILLAGE_COZY_RADIUS * HUNTING_VILLAGE_COZY_RADIUS;

/// Y-offset for zone center (in pixels)
/// Adjusts zone center to match visual center of the monument
pub const HUNTING_VILLAGE_ZONE_Y_OFFSET: f32 = 0.0;

// =============================================================================
// HUNTING VILLAGE ZONE CHECKS
// =============================================================================

/// Checks if a position is within the hunting village safe zone
/// Returns true if the position is within safe zone radius of the center piece (lodge)
pub fn is_position_in_hunting_village_safe_zone(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    for part in ctx.db.monument_part().iter() {
        // Only check against the center piece for zone determination
        if part.monument_type != MonumentType::HuntingVillage || !part.is_center {
            continue;
        }
        let dx = pos_x - part.world_x;
        let dy = pos_y - (part.world_y - HUNTING_VILLAGE_ZONE_Y_OFFSET);
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq <= HUNTING_VILLAGE_SAFE_ZONE_RADIUS_SQ {
            return true;
        }
    }
    
    false
}

/// Gets the hunting village center position if it exists
/// Returns Some((x, y)) of the village center (lodge), or None if not found
pub fn get_hunting_village_center(ctx: &ReducerContext) -> Option<(f32, f32)> {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type == MonumentType::HuntingVillage && part.is_center {
            return Some((part.world_x, part.world_y));
        }
    }
    None
}

/// Check if a position is within the NPC exclusion zone of the hunting village
/// Hostile NPCs should actively avoid entering this entire area
/// Returns Some((center_x, center_y, distance)) if inside exclusion zone
pub fn is_position_in_hunting_village_exclusion_zone(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> Option<(f32, f32, f32)> {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::HuntingVillage || !part.is_center {
            continue;
        }
        let dx = pos_x - part.world_x;
        let dy = pos_y - part.world_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < HUNTING_VILLAGE_NPC_EXCLUSION_RADIUS_SQ {
            return Some((part.world_x, part.world_y, dist_sq.sqrt()));
        }
    }
    
    None
}

/// Check if a position is within the cozy radius of the hunting village
/// Players within this zone get the cozy effect (warmth, comfort)
pub fn is_position_in_hunting_village_cozy_zone(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::HuntingVillage {
            continue;
        }
        // Check against the campfire part for cozy zone, or fallback to center
        if part.part_type == "campfire" || part.is_center {
            let dx = pos_x - part.world_x;
            let dy = pos_y - part.world_y;
            let dist_sq = dx * dx + dy * dy;
            
            if dist_sq <= HUNTING_VILLAGE_COZY_RADIUS_SQ {
                return true;
            }
        }
    }
    
    false
}

// =============================================================================
// HUNTING VILLAGE COLLISION (Disabled for walkability)
// =============================================================================

/// Check if a position collides with any hunting village part.
/// NOTE: Currently returns false since hunting village has no collision for better exploration.
pub fn check_hunting_village_collision(ctx: &ReducerContext, pos_x: f32, pos_y: f32, entity_radius: f32) -> bool {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::HuntingVillage {
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

/// Get the collision resolution vector for hunting village.
/// Returns the push-out direction and distance if colliding.
/// NOTE: Currently returns None since hunting village has no collision.
pub fn resolve_hunting_village_collision(
    ctx: &ReducerContext,
    pos_x: f32, 
    pos_y: f32, 
    entity_radius: f32
) -> Option<(f32, f32)> {
    let separation_distance = 1.0;
    
    let mut resolved_x = pos_x;
    let mut resolved_y = pos_y;
    let mut any_collision = false;
    
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::HuntingVillage {
            continue;
        }
        if part.collision_radius <= 0.0 {
            continue;
        }
        
        let dx = resolved_x - part.world_x;
        let dy = resolved_y - part.world_y;
        let dist_sq = dx * dx + dy * dy;
        let min_dist = part.collision_radius + entity_radius;
        
        if dist_sq < min_dist * min_dist {
            any_collision = true;
            
            let dist = dist_sq.sqrt();
            if dist > 0.001 {
                let nx = dx / dist;
                let ny = dy / dist;
                let push_dist = min_dist - dist + separation_distance;
                resolved_x += nx * push_dist;
                resolved_y += ny * push_dist;
            } else {
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

/// Check if a line segment intersects any hunting village part.
/// Useful for projectile/raycast collision.
/// NOTE: Currently returns false since hunting village has no collision.
pub fn line_intersects_hunting_village(
    ctx: &ReducerContext,
    start_x: f32,
    start_y: f32,
    end_x: f32,
    end_y: f32,
) -> bool {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::HuntingVillage {
            continue;
        }
        if part.collision_radius <= 0.0 {
            continue;
        }
        
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
            
            if (t1 >= 0.0 && t1 <= 1.0) || (t2 >= 0.0 && t2 <= 1.0) {
                return true;
            }
        }
    }
    
    false
}
