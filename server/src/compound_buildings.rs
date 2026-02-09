// server/src/compound_buildings.rs
// ------------------------------------
// Static compound building collision definitions.
// These must match the client-side config in client/src/config/compoundBuildings.ts
// ------------------------------------

use crate::{WORLD_WIDTH_TILES, WORLD_HEIGHT_TILES, TILE_SIZE_PX};

/// Collision data for a static compound building.
/// Position is relative to world center.
pub struct CompoundBuildingCollision {
    /// X offset from world center (pixels)
    pub offset_x: f32,
    /// Y offset from world center (pixels)
    pub offset_y: f32,
    /// Collision radius (pixels)
    pub collision_radius: f32,
    /// Y offset for collision center from building anchor (pixels)
    pub collision_y_offset: f32,
}

/// Static compound building collisions.
/// 
/// IMPORTANT: These values MUST match the client config in:
/// client/src/config/compoundBuildings.ts
/// 
/// When adding/modifying buildings:
/// 1. Copy offsetX, offsetY, collisionRadius, collisionYOffset from client config
/// 2. Keep the order consistent for easier maintenance
/// 
/// NOTE: Monument collisions (shipwrecks, fishing villages, whale bone graveyards) are handled separately
/// via monument_part table since monuments are dynamically placed during world generation.
pub const COMPOUND_BUILDING_COLLISIONS: &[CompoundBuildingCollision] = &[
    // ===== GUARD POSTS (4 corners) =====
    // NOTE: Server collision DISABLED - this is just for reference/consistency with client
    CompoundBuildingCollision { offset_x: -600.0, offset_y: -600.0, collision_radius: 30.0, collision_y_offset: 0.0 },
    CompoundBuildingCollision { offset_x: 600.0, offset_y: -600.0, collision_radius: 30.0, collision_y_offset: 0.0 },
    CompoundBuildingCollision { offset_x: -600.0, offset_y: 650.0, collision_radius: 30.0, collision_y_offset: 0.0 },
    CompoundBuildingCollision { offset_x: 600.0, offset_y: 650.0, collision_radius: 30.0, collision_y_offset: 0.0 },
    
    // ===== MAIN BUILDINGS =====
    // Warehouse - REMOVED (replaced by monument large furnace placeable at same position)
    // Barracks
    CompoundBuildingCollision { offset_x: 450.0, offset_y: -300.0, collision_radius: 150.0, collision_y_offset: 0.0 },
    // Fuel Depot
    CompoundBuildingCollision { offset_x: 450.0, offset_y: 400.0, collision_radius: 140.0, collision_y_offset: 0.0 },
    // Garage (north-west area)
    CompoundBuildingCollision { offset_x: -350.0, offset_y: -680.0, collision_radius: 120.0, collision_y_offset: 0.0 },
    // Shed (north-east area, symmetric with garage)
    CompoundBuildingCollision { offset_x: 350.0, offset_y: -680.0, collision_radius: 100.0, collision_y_offset: 0.0 },
    // ALK Food Processor and Weapons Depot are monument placeables (WoodenStorageBox entities),
    // not compound buildings. Their collision is handled by the entity system.
];

/// Calculate the world center coordinates in pixels.
#[inline]
pub fn get_world_center() -> (f32, f32) {
    let center_x = (WORLD_WIDTH_TILES as f32 * TILE_SIZE_PX as f32) / 2.0;
    let center_y = (WORLD_HEIGHT_TILES as f32 * TILE_SIZE_PX as f32) / 2.0;
    (center_x, center_y)
}

/// Check if a position collides with any compound building.
/// 
/// # Arguments
/// * `pos_x` - World X position to check
/// * `pos_y` - World Y position to check
/// * `entity_radius` - Radius of the entity being checked (e.g., player radius)
/// 
/// # Returns
/// `true` if the position would collide with any building
pub fn check_compound_building_collision(pos_x: f32, pos_y: f32, entity_radius: f32) -> bool {
    // Early exit if no buildings defined
    if COMPOUND_BUILDING_COLLISIONS.is_empty() {
        return false;
    }
    
    let (center_x, center_y) = get_world_center();
    
    for building in COMPOUND_BUILDING_COLLISIONS {
        // Calculate building collision center world position
        let building_x = center_x + building.offset_x;
        let building_y = center_y + building.offset_y - building.collision_y_offset;
        
        // Check circular collision
        let dx = pos_x - building_x;
        let dy = pos_y - building_y;
        let dist_sq = dx * dx + dy * dy;
        let min_dist = building.collision_radius + entity_radius;
        
        if dist_sq < min_dist * min_dist {
            return true;
        }
    }
    
    false
}

/// Get the collision resolution vector for compound buildings.
/// Returns the push-out direction and distance if colliding.
/// 
/// # Arguments
/// * `pos_x` - World X position to check
/// * `pos_y` - World Y position to check
/// * `entity_radius` - Radius of the entity being checked
/// 
/// # Returns
/// `Some((new_x, new_y))` with resolved position if colliding, `None` if no collision
pub fn resolve_compound_building_collision(
    pos_x: f32, 
    pos_y: f32, 
    entity_radius: f32
) -> Option<(f32, f32)> {
    // Early exit if no buildings defined
    if COMPOUND_BUILDING_COLLISIONS.is_empty() {
        return None;
    }
    
    let (center_x, center_y) = get_world_center();
    let separation_distance = 1.0; // Extra separation to prevent getting stuck
    
    let mut resolved_x = pos_x;
    let mut resolved_y = pos_y;
    let mut any_collision = false;
    
    for building in COMPOUND_BUILDING_COLLISIONS {
        // Calculate building collision center world position
        let building_x = center_x + building.offset_x;
        let building_y = center_y + building.offset_y - building.collision_y_offset;
        
        // Check circular collision
        let dx = resolved_x - building_x;
        let dy = resolved_y - building_y;
        let dist_sq = dx * dx + dy * dy;
        let min_dist = building.collision_radius + entity_radius;
        
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

/// Check if a line segment intersects any compound building.
/// Useful for projectile/raycast collision.
/// 
/// # Arguments
/// * `start_x`, `start_y` - Line start position
/// * `end_x`, `end_y` - Line end position
/// 
/// # Returns
/// `true` if the line intersects any building
pub fn line_intersects_compound_building(
    start_x: f32,
    start_y: f32,
    end_x: f32,
    end_y: f32,
) -> bool {
    // Early exit if no buildings defined
    if COMPOUND_BUILDING_COLLISIONS.is_empty() {
        return false;
    }
    
    let (center_x, center_y) = get_world_center();
    
    for building in COMPOUND_BUILDING_COLLISIONS {
        let building_x = center_x + building.offset_x;
        let building_y = center_y + building.offset_y - building.collision_y_offset;
        
        // Line-circle intersection test
        let dx = end_x - start_x;
        let dy = end_y - start_y;
        let fx = start_x - building_x;
        let fy = start_y - building_y;
        
        let a = dx * dx + dy * dy;
        let b = 2.0 * (fx * dx + fy * dy);
        let c = fx * fx + fy * fy - building.collision_radius * building.collision_radius;
        
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

