// server/src/whale_bone_graveyard.rs
// ------------------------------------
// Whale Bone Graveyard monument collision definitions and protection zones.
// Whale bone graveyards are dynamically placed during world generation and stored in whale_bone_graveyard_part table.
// Client-side rendering, server-side collision validation.
// 
// THEME:
// An ancient whale bone graveyard on the beach where whales came to die over the ages.
// An old hermit has made his home among the bones, studying their mysteries.
//
// PARTS:
// - wbg_ribcage.png: Large whale ribcage (center piece, main landmark)
// - wbg_skull.png: Massive whale skull
// - wbg_spine.png: Whale spine/vertebrae section
// - wbg_jawbone.png: Large whale jawbone
// - wbg_hermit_hut.png: Small hut made from whale bones and driftwood
// - (optional) wbg_campfire.png: Campfire near the hermit's hut (or use monument campfire)
// ------------------------------------

use crate::ReducerContext;
use crate::monument_part as MonumentPartTableTrait;
use crate::MonumentType;
use spacetimedb::Table;

// =============================================================================
// WHALE BONE GRAVEYARD PROTECTION CONSTANTS
// =============================================================================

/// Protection radius for whale bone graveyard parts (in pixels)
/// Players within this radius are considered to have shelter from hostile NPCs
/// This is a wider radius than the individual bone parts for overall monument feel
pub const WHALE_BONE_GRAVEYARD_PROTECTION_RADIUS: f32 = 200.0;
pub const WHALE_BONE_GRAVEYARD_PROTECTION_RADIUS_SQ: f32 = WHALE_BONE_GRAVEYARD_PROTECTION_RADIUS * WHALE_BONE_GRAVEYARD_PROTECTION_RADIUS;

/// Y-offset for protection zone center (in pixels)
/// Whale bone sprites may be tall with anchor at bottom
/// This offset ensures the protection zone matches the visual center
pub const WHALE_BONE_GRAVEYARD_PROTECTION_Y_OFFSET: f32 = 150.0;

/// NPC exclusion zone radius - matches building restriction radius
/// Hostile NPCs will actively avoid entering this entire zone
/// This is much larger than protection radius to prevent NPC griefing
pub const WHALE_BONE_GRAVEYARD_NPC_EXCLUSION_RADIUS: f32 = 1200.0;
pub const WHALE_BONE_GRAVEYARD_NPC_EXCLUSION_RADIUS_SQ: f32 = WHALE_BONE_GRAVEYARD_NPC_EXCLUSION_RADIUS * WHALE_BONE_GRAVEYARD_NPC_EXCLUSION_RADIUS;

/// Safe zone radius for the whale bone graveyard
/// Players within this radius are protected from PvP damage (like fishing village)
pub const WHALE_BONE_GRAVEYARD_SAFE_ZONE_RADIUS: f32 = 600.0;
pub const WHALE_BONE_GRAVEYARD_SAFE_ZONE_RADIUS_SQ: f32 = WHALE_BONE_GRAVEYARD_SAFE_ZONE_RADIUS * WHALE_BONE_GRAVEYARD_SAFE_ZONE_RADIUS;

/// Cozy effect radius - players near the hermit's campfire feel cozy
pub const WHALE_BONE_GRAVEYARD_COZY_RADIUS: f32 = 400.0;
pub const WHALE_BONE_GRAVEYARD_COZY_RADIUS_SQ: f32 = WHALE_BONE_GRAVEYARD_COZY_RADIUS * WHALE_BONE_GRAVEYARD_COZY_RADIUS;

// =============================================================================
// WHALE BONE GRAVEYARD ZONE CHECKS
// =============================================================================

/// Checks if a position is within the whale bone graveyard protection zone
/// Returns true if the position is within protection radius of the center piece (ribcage)
pub fn is_position_in_whale_bone_graveyard_zone(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    for part in ctx.db.monument_part().iter() {
        // Only check against the center piece (ribcage) for zone determination
        if part.monument_type != MonumentType::WhaleBoneGraveyard || !part.is_center {
            continue;
        }
        let dx = pos_x - part.world_x;
        let dy = pos_y - (part.world_y - WHALE_BONE_GRAVEYARD_PROTECTION_Y_OFFSET);
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq <= WHALE_BONE_GRAVEYARD_PROTECTION_RADIUS_SQ {
            return true;
        }
    }
    
    false
}

/// Gets the whale bone graveyard center position if it exists
/// Returns Some((x, y)) of the graveyard center (ribcage), or None if not found
pub fn get_whale_bone_graveyard_center(ctx: &ReducerContext) -> Option<(f32, f32)> {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type == MonumentType::WhaleBoneGraveyard && part.is_center {
            return Some((part.world_x, part.world_y));
        }
    }
    None
}

/// Check if a position is within the NPC exclusion zone of the whale bone graveyard
/// Hostile NPCs should actively avoid entering this entire area
/// Returns Some((center_x, center_y, distance)) if inside exclusion zone
pub fn is_position_in_whale_bone_graveyard_exclusion_zone(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> Option<(f32, f32, f32)> {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::WhaleBoneGraveyard || !part.is_center {
            continue;
        }
        let dx = pos_x - part.world_x;
        let dy = pos_y - part.world_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < WHALE_BONE_GRAVEYARD_NPC_EXCLUSION_RADIUS_SQ {
            return Some((part.world_x, part.world_y, dist_sq.sqrt()));
        }
    }
    
    None
}

/// Check if a position is within the safe zone of the whale bone graveyard
/// Players within this zone are protected from PvP damage
pub fn is_position_in_whale_bone_graveyard_safe_zone(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::WhaleBoneGraveyard || !part.is_center {
            continue;
        }
        let dx = pos_x - part.world_x;
        let dy = pos_y - part.world_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq <= WHALE_BONE_GRAVEYARD_SAFE_ZONE_RADIUS_SQ {
            return true;
        }
    }
    
    false
}

/// Check if a position is within the cozy radius of the whale bone graveyard
/// Players within this zone get the cozy effect (warmth, comfort)
pub fn is_position_in_whale_bone_graveyard_cozy_zone(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::WhaleBoneGraveyard {
            continue;
        }
        // Check against the campfire part for cozy zone, or fallback to center
        if part.part_type == "campfire" || part.is_center {
            let dx = pos_x - part.world_x;
            let dy = pos_y - part.world_y;
            let dist_sq = dx * dx + dy * dy;
            
            if dist_sq <= WHALE_BONE_GRAVEYARD_COZY_RADIUS_SQ {
                return true;
            }
        }
    }
    
    false
}

// =============================================================================
// WHALE BONE GRAVEYARD COLLISION (Optional - currently disabled for walkability)
// =============================================================================

/// Check if a position collides with any whale bone graveyard part.
/// NOTE: Currently returns false since whale bone graveyard has no collision for better exploration.
/// 
/// # Arguments
/// * `ctx` - ReducerContext to access whale_bone_graveyard_part table
/// * `pos_x` - World X position to check
/// * `pos_y` - World Y position to check
/// * `entity_radius` - Radius of the entity being checked (e.g., player radius)
/// 
/// # Returns
/// `true` if the position would collide with any whale bone graveyard part
pub fn check_whale_bone_graveyard_collision(ctx: &ReducerContext, pos_x: f32, pos_y: f32, entity_radius: f32) -> bool {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::WhaleBoneGraveyard {
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

/// Get the collision resolution vector for whale bone graveyard.
/// Returns the push-out direction and distance if colliding.
/// NOTE: Currently returns None since whale bone graveyard has no collision.
/// 
/// # Arguments
/// * `ctx` - ReducerContext to access whale_bone_graveyard_part table
/// * `pos_x` - World X position to check
/// * `pos_y` - World Y position to check
/// * `entity_radius` - Radius of the entity being checked
/// 
/// # Returns
/// `Some((new_x, new_y))` with resolved position if colliding, `None` if no collision
pub fn resolve_whale_bone_graveyard_collision(
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
        if part.monument_type != MonumentType::WhaleBoneGraveyard {
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

/// Check if a line segment intersects any whale bone graveyard part.
/// Useful for projectile/raycast collision.
/// NOTE: Currently returns false since whale bone graveyard has no collision.
/// 
/// # Arguments
/// * `ctx` - ReducerContext to access whale_bone_graveyard_part table
/// * `start_x`, `start_y` - Line start position
/// * `end_x`, `end_y` - Line end position
/// 
/// # Returns
/// `true` if the line intersects any whale bone graveyard part
pub fn line_intersects_whale_bone_graveyard(
    ctx: &ReducerContext,
    start_x: f32,
    start_y: f32,
    end_x: f32,
    end_y: f32,
) -> bool {
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::WhaleBoneGraveyard {
            continue;
        }
        // Skip parts with 0 collision radius (no collision)
        if part.collision_radius <= 0.0 {
            continue;
        }
        
        // Line-circle intersection test for whale bone graveyard parts
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
