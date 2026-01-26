/*
 * server/src/monument.rs
 *
 * Purpose: Manages monument entities - generation, placement, and clearance zones.
 *          Monuments are special world structures (shipwrecks, ruins, etc.)
 *          that take precedence over natural obstacles like trees and stones.
 *
 * Responsibilities:
 *   - Generate monument positions during world creation
 *   - Provide clearance checking to prevent obstacles from spawning near monuments
 *   - Support multiple monument types (shipwrecks, ruins, crash sites, etc.)
 *   - Define clearance radii for different monument types
 *   - Allow easy extension for new monument types
 */

use spacetimedb::{ReducerContext, Table, Timestamp};
use crate::monument_part as MonumentPartTableTrait;
use crate::MonumentType;
use crate::items::item_definition as ItemDefinitionTableTrait;
use crate::harvestable_resource::harvestable_resource as HarvestableResourceTableTrait;
use crate::barrel::barrel as BarrelTableTrait;
use noise::{NoiseFn, Perlin};
use std::collections::HashSet;
use rand::Rng;
use log;

/// Clearance radius for different monument types (in pixels)
/// Monuments will clear obstacles within this radius for visibility
pub mod clearance {
    /// Shipwreck parts - clear a 12-tile radius (600px)
    pub const SHIPWRECK: f32 = 600.0;
    
    /// Fishing village parts - clear a 10-tile radius (500px)
    pub const FISHING_VILLAGE: f32 = 500.0;
    
    /// Whale bone graveyard parts - clear an 11-tile radius (550px)
    pub const WHALE_BONE_GRAVEYARD: f32 = 550.0;
    
    /// Hunting village parts - clear a 10-tile radius (500px) same as fishing village
    /// Trees around the village are spawned separately, not blocked by this
    pub const HUNTING_VILLAGE: f32 = 500.0;
    
    // Future monument types can be added here:
    // pub const RUINS: f32 = 400.0;
    // pub const CRASH_SITE: f32 = 350.0;
    // etc.
}

/// Checks if the given world position is too close to any monument
/// Monuments take precedence and clear a radius around them for visibility
/// Returns true if the position is within the clearance radius of any monument
pub fn is_position_near_monument(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    // Check shipwreck monuments
    if is_near_shipwreck(ctx, pos_x, pos_y) {
        return true;
    }
    
    // Check fishing village monuments
    if is_near_fishing_village(ctx, pos_x, pos_y) {
        return true;
    }
    
    // Check whale bone graveyard monuments
    if is_near_whale_bone_graveyard(ctx, pos_x, pos_y) {
        return true;
    }
    
    // Hunting village check temporarily disabled - trees blocked everywhere bug
    // if is_near_hunting_village(ctx, pos_x, pos_y) {
    //     return true;
    // }
    
    // Future monument checks can be added here:
    // if is_near_ruins(ctx, pos_x, pos_y) { return true; }
    // if is_near_crash_site(ctx, pos_x, pos_y) { return true; }
    
    false // Not near any monument
}

/// Checks if position is near any shipwreck part
fn is_near_shipwreck(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    let clearance_sq = clearance::SHIPWRECK * clearance::SHIPWRECK;
    
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::Shipwreck {
            continue;
        }
        let dx = pos_x - part.world_x;
        let dy = pos_y - part.world_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < clearance_sq {
            return true;
        }
    }
    
    false
}

/// Checks if position is near any fishing village part
fn is_near_fishing_village(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    let clearance_sq = clearance::FISHING_VILLAGE * clearance::FISHING_VILLAGE;
    
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::FishingVillage {
            continue;
        }
        let dx = pos_x - part.world_x;
        let dy = pos_y - part.world_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < clearance_sq {
            return true;
        }
    }
    
    false
}

/// Checks if position is near any whale bone graveyard part
fn is_near_whale_bone_graveyard(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    let clearance_sq = clearance::WHALE_BONE_GRAVEYARD * clearance::WHALE_BONE_GRAVEYARD;
    
    for part in ctx.db.monument_part().iter() {
        if part.monument_type != MonumentType::WhaleBoneGraveyard {
            continue;
        }
        let dx = pos_x - part.world_x;
        let dy = pos_y - part.world_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < clearance_sq {
            return true;
        }
    }
    
    false
}

/// Checks if position is near the hunting village CENTER (lodge only)
/// Only checks center piece to avoid creating massive exclusion zones from multiple parts
fn is_near_hunting_village(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    let clearance_sq = clearance::HUNTING_VILLAGE * clearance::HUNTING_VILLAGE;
    
    for part in ctx.db.monument_part().iter() {
        // Only check the CENTER (lodge) of hunting village, not every part
        // This prevents a massive exclusion zone from multiple overlapping radii
        if part.monument_type != MonumentType::HuntingVillage || !part.is_center {
            continue;
        }
        let dx = pos_x - part.world_x;
        let dy = pos_y - part.world_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < clearance_sq {
            return true;
        }
    }
    
    false
}

// =============================================================================
// MONUMENT GENERATION
// =============================================================================

/// Generate shipwreck monument on south beach
/// Returns (center_positions, crash_parts) where:
/// - center_positions: Vec of (x, y) in world pixels for hull1.png center piece
/// - crash_parts: Vec of (x, y, image_path) for additional crash debris scattered along beach
pub fn generate_shipwreck(
    noise: &Perlin,
    shore_distance: &[Vec<f64>],
    river_network: &[Vec<bool>],
    lake_map: &[Vec<bool>],
    width: usize,
    height: usize,
) -> (Vec<(f32, f32)>, Vec<(f32, f32, String)>) {
    let mut shipwreck_centers = Vec::new();
    let mut shipwreck_parts = Vec::new();
    
    log::info!("🚢 Generating shipwreck monument on south beach...");
    
    // Find south beach tiles (bottom 1/3 of map for more beach tiles, beach tiles only)
    // Focus on southern beach where there are more beach tiles available
    let map_height_third = height * 2 / 3; // Start at 2/3 down the map (bottom third)
    let beach_threshold = 12.0; // Same threshold as beach generation
    let min_distance_from_edge = 20;
    
    let mut candidate_positions = Vec::new();
    
    // Search bottom third of map for beach tiles (more beach tiles here)
    for y in (map_height_third + min_distance_from_edge)..(height - min_distance_from_edge) {
        for x in min_distance_from_edge..(width - min_distance_from_edge) {
            let shore_dist = shore_distance[y][x];
            
            // Must be beach tile (not water, not deep inland)
            if shore_dist >= 0.0 && shore_dist < beach_threshold {
                // Must not be on river or lake
                if river_network[y][x] || lake_map[y][x] {
                    continue;
                }
                
                // Must be walkable land (not water)
                if shore_dist < 0.0 {
                    continue;
                }
                
                candidate_positions.push((x, y));
            }
        }
    }
    
    if candidate_positions.is_empty() {
        log::warn!("🚢 No valid south beach positions found for shipwreck");
        return (shipwreck_centers, shipwreck_parts);
    }
    
    // Select one position using noise for deterministic placement
    let mut best_score = f64::NEG_INFINITY;
    let mut best_position: Option<(usize, usize)> = None;
    
    for &(x, y) in &candidate_positions {
        let noise_val = noise.get([x as f64 * 0.01, y as f64 * 0.01, 10000.0]);
        if noise_val > best_score {
            best_score = noise_val;
            best_position = Some((x, y));
        }
    }
    
    if let Some((center_x, center_y)) = best_position {
        // Convert tile position to world pixels
        let center_world_x = (center_x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
        let center_world_y = (center_y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
        
        shipwreck_centers.push((center_world_x, center_world_y));
        
        log::info!("🚢✨ PLACED SHIPWRECK CENTER at tile ({}, {}) = 📍 World Position: ({:.0}, {:.0}) ✨",
                   center_x, center_y, center_world_x, center_world_y);
        
        // Generate crash parts scattered along the beach (east and west of center)
        let min_distance_tiles = 15; // Minimum distance from center (about 720px)
        let max_distance_tiles = 50; // Maximum distance for wider spread (about 2400px)
        let tile_size_px = crate::TILE_SIZE_PX as f32;
        
        // Directions: east and west along the beach, with slight north/south variation
        let directions = [
            (1.0, 0.0),       // East
            (-1.0, 0.0),      // West
            (1.0, 0.3),       // East-southeast
            (-1.0, 0.3),      // West-southeast
            (1.0, -0.3),      // East-northeast
            (-1.0, -0.3),     // West-northeast
        ];
        
        // ALWAYS spawn exactly 6 crash parts (no randomness)
        // Center uses hull1.png, so parts use hull2.png through hull6.png + hull1.png (6 images for 6 parts)
        // One part will duplicate center's hull1.png, but that's acceptable since center is marked differently
        let num_parts = 6;
        let mut placed_parts = Vec::new();
        
        // Pre-assign image numbers: Start with hull6.png, hull5.png, hull4.png (harder to place, try first)
        // Then hull3.png, hull2.png, hull1.png (easier to place)
        // This ensures hull6.png gets placed before we run out of attempts
        // Parts: [hull6, hull5, hull4, hull3, hull2, hull1] - hull1 duplicates center but that's OK
        let part_image_nums: Vec<u32> = vec![6, 5, 4, 3, 2, 1]; // Reverse order: hull6 first, hull1 last
        
        for i in 0..num_parts {
            // Pre-assigned unique image for this part (hull6.png gets tried first)
            let image_num = part_image_nums[i];
            let image_path = format!("hull{}.png", image_num);
            
            let mut attempts = 0;
            // Increased attempts: hull6.png (part 0) gets 3000 attempts, others get 2000
            // This ensures all parts have a good chance of placement, especially on southern beach
            let max_attempts_normal = if i == 0 { 1500 } else { 1000 }; // More attempts for hull6.png
            let max_attempts_relaxed = if i == 0 { 1500 } else { 1000 }; // More relaxed attempts for hull6.png
            let total_max_attempts = max_attempts_normal + max_attempts_relaxed;
            let mut placed = false;
            
            loop {
                if attempts >= total_max_attempts {
                    log::error!("🚢 CRITICAL: Failed to place shipwreck part #{} (hull{}.png) after {} attempts.", i + 1, image_num, total_max_attempts);
                    break;
                }
                
                let relaxed_mode = attempts >= max_attempts_normal;
                // Extra relaxed mode for hull6.png (part 0) - be very permissive
                let extra_relaxed = relaxed_mode && i == 0;
                
                // Pick a direction (cycle through all directions for variety)
                let dir_idx = (i + (attempts / 10)) % directions.len();
                let (dir_x, dir_y) = directions[dir_idx];
                
                // Vary distance from center
                let distance_factor = noise.get([
                    center_x as f64 * 0.05 + i as f64 + attempts as f64 * 0.1, 
                    center_y as f64 * 0.05 + i as f64 + attempts as f64 * 0.1, 
                    10002.0
                ]);
                let distance_range = max_distance_tiles - min_distance_tiles;
                let distance_tiles = min_distance_tiles as f32 + (distance_factor.abs() as f32 * distance_range as f32);
                
                // Calculate part position in tiles
                let part_tile_x = center_x as f32 + dir_x * distance_tiles;
                let part_tile_y = center_y as f32 + dir_y * distance_tiles;
                let part_tile_x_int = part_tile_x.round() as i32;
                let part_tile_y_int = part_tile_y.round() as i32;
                
                // Bounds check - more relaxed for hull6.png
                let bounds_margin = if extra_relaxed { 3 } else if relaxed_mode { 5 } else { 10 };
                if part_tile_x_int < bounds_margin || part_tile_y_int < bounds_margin || 
                   part_tile_x_int >= (width as i32 - bounds_margin) || part_tile_y_int >= (height as i32 - bounds_margin) {
                    attempts += 1;
                    continue;
                }
                
                let px = part_tile_x_int as usize;
                let py = part_tile_y_int as usize;
                
                // Must be on land (not water, not river, not lake)
                let part_shore_dist = shore_distance[py][px];
                if part_shore_dist < 0.0 || river_network[py][px] || lake_map[py][px] {
                    attempts += 1;
                    continue;
                }
                
                // Must be at least 5 tiles from shore/water - relaxed for hull6.png and relaxed mode
                // More relaxed since we're focusing on southern beach with more beach tiles
                let min_water_dist = if extra_relaxed { 2.0 } else if relaxed_mode { 3.0 } else { 4.0 };
                if part_shore_dist < min_water_dist {
                    attempts += 1;
                    continue;
                }
                
                // Must be on beach or near beach - more relaxed for hull6.png and relaxed mode
                // Southern beach has more beach tiles, so we can be more permissive
                let max_inland = if extra_relaxed { 70.0 } else if relaxed_mode { 60.0 } else { 50.0 };
                if part_shore_dist > max_inland {
                    attempts += 1;
                    continue;
                }
                
                // Check minimum distance from other parts - more relaxed for hull6.png and relaxed mode
                // Reduced since southern beach has more space
                let min_part_distance = if extra_relaxed { 8.0 } else if relaxed_mode { 12.0 } else { 18.0 };
                let mut too_close = false;
                for &(other_x, other_y, _) in &placed_parts {
                    let other_tile_x = (other_x / tile_size_px) as f32;
                    let other_tile_y = (other_y / tile_size_px) as f32;
                    let dx = part_tile_x - other_tile_x;
                    let dy = part_tile_y - other_tile_y;
                    let dist_sq = dx * dx + dy * dy;
                    if dist_sq < min_part_distance * min_part_distance {
                        too_close = true;
                        break;
                    }
                }
                
                if too_close {
                    attempts += 1;
                    continue;
                }
                
                // Valid position found! Convert to world pixels
                let part_world_x = (part_tile_x_int as f32 + 0.5) * tile_size_px;
                let part_world_y = (part_tile_y_int as f32 + 0.5) * tile_size_px;
                
                // Use the pre-assigned unique image
                placed_parts.push((part_world_x, part_world_y, image_path.clone()));
                shipwreck_parts.push((part_world_x, part_world_y, image_path));
                
                log::info!("🚢✨ PLACED SHIPWRECK PART #{} (hull{}.png) at tile ({}, {}) = 📍 World Position: ({:.0}, {:.0}) {} ✨",
                           i + 1, image_num, px, py, part_world_x, part_world_y, if relaxed_mode { "(RELAXED)" } else { "" });
                placed = true;
                break;
            }
            
            if !placed {
                log::error!("🚢 CRITICAL: Part #{} (hull{}.png) was NOT placed! Only {} parts placed so far.", i + 1, image_num, placed_parts.len());
            }
        }
        
        log::info!("🚢 Shipwreck generation complete: 1 center + {} crash parts", shipwreck_parts.len());
    } else {
        log::warn!("🚢 Failed to select shipwreck position");
    }
    
    (shipwreck_centers, shipwreck_parts)
}

/// Generate fishing village monument on south beach (opposite side from shipwreck)
/// Aleut-style fishing village with huts, dock, smoke racks, and central campfire.
/// Returns (center_position, village_parts) where:
/// - center_position: (x, y) in world pixels for campfire center piece
/// - village_parts: Vec of (x, y, image_path, part_type) for all village structures
pub fn generate_fishing_village(
    noise: &Perlin,
    shore_distance: &[Vec<f64>],
    river_network: &[Vec<bool>],
    lake_map: &[Vec<bool>],
    shipwreck_centers: &[(f32, f32)], // Avoid placing near shipwreck
    width: usize,
    height: usize,
) -> (Option<(f32, f32)>, Vec<(f32, f32, String, String)>) {
    let mut village_center: Option<(f32, f32)> = None;
    let mut village_parts: Vec<(f32, f32, String, String)> = Vec::new();
    
    log::info!("🏘️ Generating fishing village monument on south beach...");
    
    // Find south beach tiles - VERY close to shore (2-6 tiles from water)
    let map_height_third = height * 2 / 3; // Start at 2/3 down the map (bottom third)
    let min_shore_dist = 2.0;  // At least 2 tiles from water (not IN water)
    let max_shore_dist = 6.0;  // At most 6 tiles from water (right on the beach!)
    let min_distance_from_edge = 25;
    let min_distance_from_shipwreck = 80.0; // Minimum tiles away from shipwreck
    
    let mut candidate_positions = Vec::new();
    
    // Search bottom third of map for beach tiles RIGHT at the shore
    for y in (map_height_third + min_distance_from_edge)..(height - min_distance_from_edge) {
        for x in min_distance_from_edge..(width - min_distance_from_edge) {
            let shore_dist = shore_distance[y][x];
            
            // Must be very close to shore - right on the beach!
            if shore_dist >= min_shore_dist && shore_dist <= max_shore_dist {
                // Must not be on river or lake
                if river_network[y][x] || lake_map[y][x] {
                    continue;
                }
                
                // Check distance from shipwreck - must be far away
                let tile_world_x = (x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                let tile_world_y = (y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                
                let mut too_close_to_shipwreck = false;
                for &(shipwreck_x, shipwreck_y) in shipwreck_centers {
                    let dx = tile_world_x - shipwreck_x;
                    let dy = tile_world_y - shipwreck_y;
                    let dist_tiles = (dx * dx + dy * dy).sqrt() / crate::TILE_SIZE_PX as f32;
                    if dist_tiles < min_distance_from_shipwreck {
                        too_close_to_shipwreck = true;
                        break;
                    }
                }
                
                if too_close_to_shipwreck {
                    continue;
                }
                
                candidate_positions.push((x, y, shore_dist));
            }
        }
    }
    
    if candidate_positions.is_empty() {
        log::warn!("🏘️ No valid south beach positions found for fishing village");
        return (village_center, village_parts);
    }
    
    log::info!("🏘️ Found {} candidate positions for fishing village (shore_dist {}-{})", 
               candidate_positions.len(), min_shore_dist, max_shore_dist);
    
    // Select position using noise - prefer positions closer to water
    let mut best_score = f64::NEG_INFINITY;
    let mut best_position: Option<(usize, usize)> = None;
    
    for &(x, y, shore_dist) in &candidate_positions {
        // Score: noise value + bonus for being closer to water
        let noise_val = noise.get([x as f64 * 0.01, y as f64 * 0.01, 20000.0]);
        let shore_bonus = (max_shore_dist - shore_dist) / max_shore_dist * 0.5; // Bonus for closer to water
        let score = noise_val + shore_bonus;
        
        if score > best_score {
            best_score = score;
            best_position = Some((x, y));
        }
    }
    
    if let Some((center_x, center_y)) = best_position {
        let tile_size_px = crate::TILE_SIZE_PX as f32;
        let center_world_x = (center_x as f32 + 0.5) * tile_size_px;
        let center_world_y = (center_y as f32 + 0.5) * tile_size_px;
        
        // Determine which direction the water is using shore_distance gradient
        // Just sample 8 directions and find which has lowest shore_distance
        let sample_dist = 8; // Sample 8 tiles away
        let directions: [(i32, i32); 8] = [
            (1, 0), (1, 1), (0, 1), (-1, 1),  // E, SE, S, SW
            (-1, 0), (-1, -1), (0, -1), (1, -1), // W, NW, N, NE
        ];
        
        let mut water_direction_x = 0.0f32;
        let mut water_direction_y = 0.0f32;
        
        for &(dx, dy) in &directions {
            let nx = (center_x as i32 + dx * sample_dist).clamp(0, width as i32 - 1) as usize;
            let ny = (center_y as i32 + dy * sample_dist).clamp(0, height as i32 - 1) as usize;
            let dist = shore_distance[ny][nx];
            
            // Weight by how much closer to water this direction is (lower = closer)
            // Negative shore_dist means water, so lower values = more towards water
            let weight = (shore_distance[center_y][center_x] - dist).max(0.0) as f32;
            water_direction_x += dx as f32 * weight;
            water_direction_y += dy as f32 * weight;
        }
        
        // Normalize water direction
        let water_dir_len = (water_direction_x * water_direction_x + water_direction_y * water_direction_y).sqrt();
        if water_dir_len > 0.01 {
            water_direction_x /= water_dir_len;
            water_direction_y /= water_dir_len;
        } else {
            // Default: assume water is to the south
            water_direction_x = 0.0;
            water_direction_y = 1.0;
        }
        
        // Calculate angle to water (for orienting the village)
        let water_angle = water_direction_y.atan2(water_direction_x);
        let inland_angle = water_angle + std::f32::consts::PI; // Opposite direction
        
        log::info!("🏘️ Water direction: ({:.2}, {:.2}), angle: {:.2} rad", 
                   water_direction_x, water_direction_y, water_angle);
        
        village_center = Some((center_world_x, center_world_y));
        
        log::info!("🏘️✨ PLACED FISHING VILLAGE CENTER (campfire) at tile ({}, {}) = 📍 World Position: ({:.0}, {:.0}) ✨",
                   center_x, center_y, center_world_x, center_world_y);
        
        // Village layout - spread out along the beach with PROPER spacing
        // =============================================================================
        // SIMPLE GRID-BASED LAYOUT - Fixed offsets from campfire center
        // Much more reliable than angle-based placement!
        // =============================================================================
        // Layout (in local coords where +X is perpendicular to shore, +Y is along shore):
        //
        //     HUT1 (-480, -500)     HUT3 (0, -700)     HUT2 (+480, -500)   <- INLAND
        //                                    
        //     SMOKE1 (-320, -200)  CAMPFIRE (0, 0)   SMOKE2 (+320, -200)
        //                                    
        //                              DOCK (280, +350)                   <- WATER
        //
        // We rotate these offsets based on water_direction to orient the village
        // =============================================================================
        
        log::info!("🏘️ Using grid layout with water direction ({:.2}, {:.2})", 
                   water_direction_x, water_direction_y);
        
        // Structure definitions: (part_type, image_name, offset_along_shore, offset_towards_water)
        // Positive offset_towards_water = towards water
        // Positive offset_along_shore = "right" when facing water
        // NOTE: Campfire is already ON the beach (2-6 tiles from water), so towards_water
        //       offsets need careful tuning - positive values go INTO water!
        // LAYOUT: Spread out for spacious village feel with visual campfire at center
        let structure_configs: [(&str, &str, f32, f32); 7] = [
            // Campfire - CENTER PIECE - using visual doodad fv_campfire.png
            ("campfire", "fv_campfire.png", 0.0, 0.0),
            
            // Huts - set back INLAND from campfire (negative = away from water), spread wider
            ("hut", "fv_lodge.png", -480.0, -500.0),    // Inland-left
            ("hut", "fv_hut2.png", 480.0, -500.0),     // Inland-right
            ("hut", "fv_hut3.png", 0.0, -700.0),       // Far inland center
            
            // Smoke racks - further from campfire, flanking it with more space
            ("smokerack", "fv_smokerack1.png", -320.0, -200.0),
            ("smokerack", "fv_smokerack2.png", 320.0, -200.0),
            
            // Dock - EXTENDING INTO WATER, positioned away from smokeracks
            ("dock", "fv_dock.png", 280.0, 350.0),     // Right of campfire, extending into water
        ];
        
        // Calculate perpendicular direction (along the shore)
        // If water is (wx, wy), perpendicular is (-wy, wx)
        let shore_dir_x = -water_direction_y;
        let shore_dir_y = water_direction_x;
        
        for (part_type, image_name, offset_along_shore, offset_towards_water) in structure_configs.iter() {
            // Transform local offsets to world coordinates using water direction
            // offset_towards_water uses water_direction
            // offset_along_shore uses perpendicular direction
            let world_offset_x = water_direction_x * offset_towards_water + shore_dir_x * offset_along_shore;
            let world_offset_y = water_direction_y * offset_towards_water + shore_dir_y * offset_along_shore;
            
            let part_world_x = center_world_x + world_offset_x;
            let part_world_y = center_world_y + world_offset_y;
            
            // Convert to tile coords for validation
            let part_tile_x = (part_world_x / tile_size_px) as i32;
            let part_tile_y = (part_world_y / tile_size_px) as i32;
            
            // Bounds check
            if part_tile_x < 5 || part_tile_y < 5 || 
               part_tile_x >= (width as i32 - 5) || part_tile_y >= (height as i32 - 5) {
                log::warn!("🏘️ {} out of bounds at tile ({}, {})", part_type, part_tile_x, part_tile_y);
                continue;
            }
            
            let px = part_tile_x as usize;
            let py = part_tile_y as usize;
            
            // Check terrain - RELAXED constraints (we trust the grid layout)
            let part_shore_dist = shore_distance[py][px];
            
            // Skip only if in deep water or on river/lake
            if *part_type == "dock" {
                // Dock extends INTO water - allow up to 20 tiles into water
                // Campfire at shore_dist 2-6 + dock offset 300px (~6.3 tiles) = dock at -0.3 to -4.3 tiles
                // Being very permissive to ensure dock spawns reliably
                if part_shore_dist < -20.0 || river_network[py][px] || lake_map[py][px] {
                    log::warn!("🏘️ {} terrain invalid: shore_dist={:.1} (limit -20.0)", part_type, part_shore_dist);
                    continue;
                }
                log::info!("🏘️ Dock position check passed: shore_dist={:.1}", part_shore_dist);
            } else {
                // Huts and smoke racks must be on land
                if part_shore_dist < -1.0 || river_network[py][px] || lake_map[py][px] {
                    log::warn!("🏘️ {} terrain invalid: shore_dist={:.1}", part_type, part_shore_dist);
                    continue;
                }
            }
            
            // Place the structure!
            village_parts.push((part_world_x, part_world_y, image_name.to_string(), part_type.to_string()));
            
            log::info!("🏘️✨ PLACED {} ({}) at ({:.0}, {:.0}), offset=({:.0}, {:.0}) ✨",
                       part_type.to_uppercase(), image_name, part_world_x, part_world_y,
                       offset_along_shore, offset_towards_water);
        }
        
        log::info!("🏘️ Fishing village generation complete: {} total structures", village_parts.len());
    } else {
        log::warn!("🏘️ Failed to select fishing village position");
    }
    
    (village_center, village_parts)
}

/// Generate whale bone graveyard monument on beach (separate from shipwreck and fishing village)
/// Ancient whale bone graveyard with hermit's hut, various whale bone parts scattered on beach.
/// Returns (center_position, graveyard_parts) where:
/// - center_position: (x, y) in world pixels for ribcage center piece
/// - graveyard_parts: Vec of (x, y, image_path, part_type) for all whale bone structures
pub fn generate_whale_bone_graveyard(
    noise: &Perlin,
    shore_distance: &[Vec<f64>],
    river_network: &[Vec<bool>],
    lake_map: &[Vec<bool>],
    shipwreck_centers: &[(f32, f32)], // Avoid placing near shipwreck
    fishing_village_center: Option<(f32, f32)>, // Avoid placing near fishing village
    width: usize,
    height: usize,
) -> (Option<(f32, f32)>, Vec<(f32, f32, String, String)>) {
    let mut graveyard_center: Option<(f32, f32)> = None;
    let mut graveyard_parts: Vec<(f32, f32, String, String)> = Vec::new();
    
    log::info!("🦴 Generating whale bone graveyard monument on beach...");
    
    // Find beach tiles - prefer DIFFERENT area from shipwreck and fishing village
    // Focus on the bottom third of the map (beach tiles here)
    let map_height_third = height * 2 / 3;
    let min_shore_dist = 3.0;  // At least 3 tiles from water (not IN water)
    let max_shore_dist = 12.0; // At most 12 tiles from water (on the beach)
    let min_distance_from_edge = 30;
    let min_distance_from_shipwreck = 100.0; // Minimum tiles away from shipwreck
    let min_distance_from_fishing_village = 80.0; // Minimum tiles away from fishing village
    
    let mut candidate_positions = Vec::new();
    
    // Search bottom third of map for beach tiles
    for y in (map_height_third + min_distance_from_edge)..(height - min_distance_from_edge) {
        for x in min_distance_from_edge..(width - min_distance_from_edge) {
            let shore_dist = shore_distance[y][x];
            
            // Must be on beach (not water, not too far inland)
            if shore_dist >= min_shore_dist && shore_dist <= max_shore_dist {
                // Must not be on river or lake
                if river_network[y][x] || lake_map[y][x] {
                    continue;
                }
                
                // Check distance from shipwreck - must be far away
                let tile_world_x = (x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                let tile_world_y = (y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                
                let mut too_close_to_monument = false;
                for &(shipwreck_x, shipwreck_y) in shipwreck_centers {
                    let dx = tile_world_x - shipwreck_x;
                    let dy = tile_world_y - shipwreck_y;
                    let dist_tiles = (dx * dx + dy * dy).sqrt() / crate::TILE_SIZE_PX as f32;
                    if dist_tiles < min_distance_from_shipwreck {
                        too_close_to_monument = true;
                        break;
                    }
                }
                
                // Check distance from fishing village
                if let Some((fv_x, fv_y)) = fishing_village_center {
                    let dx = tile_world_x - fv_x;
                    let dy = tile_world_y - fv_y;
                    let dist_tiles = (dx * dx + dy * dy).sqrt() / crate::TILE_SIZE_PX as f32;
                    if dist_tiles < min_distance_from_fishing_village {
                        too_close_to_monument = true;
                    }
                }
                
                if too_close_to_monument {
                    continue;
                }
                
                candidate_positions.push((x, y, shore_dist));
            }
        }
    }
    
    if candidate_positions.is_empty() {
        log::warn!("🦴 No valid beach positions found for whale bone graveyard");
        return (graveyard_center, graveyard_parts);
    }
    
    log::info!("🦴 Found {} candidate positions for whale bone graveyard (shore_dist {}-{})", 
               candidate_positions.len(), min_shore_dist, max_shore_dist);
    
    // Select position using noise - prefer positions with moderate beach width
    let mut best_score = f64::NEG_INFINITY;
    let mut best_position: Option<(usize, usize)> = None;
    
    for &(x, y, shore_dist) in &candidate_positions {
        // Score: noise value + bonus for being in sweet spot of beach (not too close to water, not too inland)
        let noise_val = noise.get([x as f64 * 0.01, y as f64 * 0.01, 30000.0]); // Different seed than other monuments
        let beach_bonus = 1.0 - ((shore_dist - 7.0).abs() / 7.0).min(1.0) * 0.5; // Peak at shore_dist ~7
        let score = noise_val + beach_bonus;
        
        if score > best_score {
            best_score = score;
            best_position = Some((x, y));
        }
    }
    
    if let Some((center_x, center_y)) = best_position {
        let tile_size_px = crate::TILE_SIZE_PX as f32;
        let center_world_x = (center_x as f32 + 0.5) * tile_size_px;
        let center_world_y = (center_y as f32 + 0.5) * tile_size_px;
        
        graveyard_center = Some((center_world_x, center_world_y));
        
        log::info!("🦴✨ PLACED WHALE BONE GRAVEYARD CENTER (hermit hut) at tile ({}, {}) = 📍 World Position: ({:.0}, {:.0}) ✨",
                   center_x, center_y, center_world_x, center_world_y);
        
        // =============================================================================
        // WHALE BONE GRAVEYARD LAYOUT
        // =============================================================================
        // The hermit's hut is the center of the graveyard, surrounded by whale bones
        // Bones are spread far apart to create a sprawling, ancient graveyard feel
        // The hermit tends his campfire near the hut
        //
        // Layout (in local coords) - spread out ~2x further:
        //              RIBCAGE (-150, -450)
        //     SKULL (-450, -200)               SPINE (450, -150)
        //                    HUT (0, 0) <- CENTER
        //                    CAMPFIRE (80, 120)
        //              JAWBONE (200, 400)
        //
        // =============================================================================
        
        // Structure definitions: (part_type, image_name, offset_x, offset_y)
        // Using same coordinate system as fishing village (water direction not critical for graveyard)
        // Note: Functional campfire is spawned via monument placeables, not as a visual doodad
        let structure_configs: [(&str, &str, f32, f32); 5] = [
            // Hermit's hut - CENTER PIECE - the heart of the graveyard
            ("hermit_hut", "wbg_hermit_hut.png", 0.0, 0.0),
            
            // Large whale ribcage - north, prominent landmark
            ("ribcage", "wbg_ribcage.png", -150.0, -450.0),
            
            // Whale skull - far north-west
            ("skull", "wbg_skull.png", -450.0, -200.0),
            
            // Whale spine - far north-east
            ("spine", "wbg_spine.png", 450.0, -150.0),
            
            // Whale jawbone - south, near the water
            ("jawbone", "wbg_jawbone.png", 200.0, 400.0),
        ];
        
        for (part_type, image_name, offset_x, offset_y) in structure_configs.iter() {
            let part_world_x = center_world_x + offset_x;
            let part_world_y = center_world_y + offset_y;
            
            // Convert to tile coords for validation
            let part_tile_x = (part_world_x / tile_size_px) as i32;
            let part_tile_y = (part_world_y / tile_size_px) as i32;
            
            // Bounds check
            if part_tile_x < 5 || part_tile_y < 5 || 
               part_tile_x >= (width as i32 - 5) || part_tile_y >= (height as i32 - 5) {
                log::warn!("🦴 {} out of bounds at tile ({}, {})", part_type, part_tile_x, part_tile_y);
                continue;
            }
            
            let px = part_tile_x as usize;
            let py = part_tile_y as usize;
            
            // Check terrain - allow some flexibility for bone placement
            let part_shore_dist = shore_distance[py][px];
            
            // Skip only if in water or on river/lake
            if part_shore_dist < -1.0 || river_network[py][px] || lake_map[py][px] {
                log::warn!("🦴 {} terrain invalid: shore_dist={:.1}", part_type, part_shore_dist);
                continue;
            }
            
            // Determine if this is the center piece (hermit hut is the heart of the graveyard)
            let is_center = *part_type == "hermit_hut";
            
            // Place the structure!
            graveyard_parts.push((part_world_x, part_world_y, image_name.to_string(), part_type.to_string()));
            
            log::info!("🦴✨ PLACED {} ({}) at ({:.0}, {:.0}), offset=({:.0}, {:.0}) ✨",
                       part_type.to_uppercase(), image_name, part_world_x, part_world_y,
                       offset_x, offset_y);
        }
        
        log::info!("🦴 Whale bone graveyard generation complete: {} total structures", graveyard_parts.len());
    } else {
        log::warn!("🦴 Failed to select whale bone graveyard position");
    }
    
    (graveyard_center, graveyard_parts)
}

/// Generate hunting village monument in a forest biome
/// Boreal Aleutian-style hunting village with lodge, huts, campfire, and surrounding tree ring.
/// Returns (center_position, village_parts) where:
/// - center_position: (x, y) in world pixels for lodge center piece
/// - village_parts: Vec of (x, y, image_path, part_type) for all village structures
pub fn generate_hunting_village(
    noise: &Perlin,
    shore_distance: &[Vec<f64>],
    river_network: &[Vec<bool>],
    lake_map: &[Vec<bool>],
    forest_areas: &[Vec<bool>],
    tundra_areas: &[Vec<bool>],
    hot_spring_centers: &[(f32, f32, i32)],
    shipwreck_centers: &[(f32, f32)],
    fishing_village_center: Option<(f32, f32)>,
    whale_bone_graveyard_center: Option<(f32, f32)>,
    width: usize,
    height: usize,
) -> (Option<(f32, f32)>, Vec<(f32, f32, String, String)>) {
    let mut village_center: Option<(f32, f32)> = None;
    let mut village_parts: Vec<(f32, f32, String, String)> = Vec::new();
    
    log::info!("🏕️ Generating hunting village monument in forest biome...");
    
    // Find suitable forest tiles - must be in FOREST biome (NOT tundra), away from water and rivers
    // Focus on middle-northern area of the map (forest-rich zone)
    let map_height_quarter = height / 4; // Start at 1/4 down the map
    let map_height_three_quarters = height * 3 / 4; // End at 3/4 down
    let min_shore_dist = 15.0;  // At least 15 tiles from water (deep in forest)
    let min_distance_from_edge = 40;
    let min_distance_from_shipwreck = 100.0; // Minimum tiles away from shipwreck
    let min_distance_from_fishing_village = 80.0; // Minimum tiles away from fishing village
    let min_distance_from_whale_graveyard = 80.0; // Minimum tiles away from whale graveyard
    let min_distance_from_hot_spring = 60.0; // Minimum tiles away from hot springs
    let min_distance_from_river = 8; // Minimum tiles away from rivers
    
    let mut candidate_positions = Vec::new();
    
    // Search middle portion of map for forest tiles
    for y in (map_height_quarter + min_distance_from_edge)..(map_height_three_quarters - min_distance_from_edge) {
        for x in min_distance_from_edge..(width - min_distance_from_edge) {
            let shore_dist = shore_distance[y][x];
            
            // Must be deep inland, in a forest area, and NOT in tundra
            if shore_dist >= min_shore_dist && forest_areas[y][x] && !tundra_areas[y][x] {
                // Must not be on river or lake
                if river_network[y][x] || lake_map[y][x] {
                    continue;
                }
                
                // Check if too close to a river (check surrounding tiles)
                let mut too_close_to_river = false;
                for check_dy in -(min_distance_from_river as i32)..=(min_distance_from_river as i32) {
                    for check_dx in -(min_distance_from_river as i32)..=(min_distance_from_river as i32) {
                        let check_x = x as i32 + check_dx;
                        let check_y = y as i32 + check_dy;
                        if check_x >= 0 && check_y >= 0 && 
                           (check_x as usize) < width && (check_y as usize) < height {
                            if river_network[check_y as usize][check_x as usize] {
                                too_close_to_river = true;
                                break;
                            }
                        }
                    }
                    if too_close_to_river { break; }
                }
                
                if too_close_to_river {
                    continue;
                }
                
                // Check distance from other monuments and special features
                let tile_world_x = (x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                let tile_world_y = (y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                
                let mut too_close = false;
                
                // Check distance from shipwreck
                for &(shipwreck_x, shipwreck_y) in shipwreck_centers {
                    let dx = tile_world_x - shipwreck_x;
                    let dy = tile_world_y - shipwreck_y;
                    let dist_tiles = (dx * dx + dy * dy).sqrt() / crate::TILE_SIZE_PX as f32;
                    if dist_tiles < min_distance_from_shipwreck {
                        too_close = true;
                        break;
                    }
                }
                
                // Check distance from hot springs
                if !too_close {
                    for &(hs_x, hs_y, hs_radius) in hot_spring_centers {
                        let dx = tile_world_x - hs_x;
                        let dy = tile_world_y - hs_y;
                        let dist_tiles = (dx * dx + dy * dy).sqrt() / crate::TILE_SIZE_PX as f32;
                        // Must be further than the hot spring radius + buffer
                        let min_dist = min_distance_from_hot_spring + hs_radius as f32;
                        if dist_tiles < min_dist {
                            too_close = true;
                            break;
                        }
                    }
                }
                
                // Check distance from fishing village
                if !too_close {
                    if let Some((fv_x, fv_y)) = fishing_village_center {
                        let dx = tile_world_x - fv_x;
                        let dy = tile_world_y - fv_y;
                        let dist_tiles = (dx * dx + dy * dy).sqrt() / crate::TILE_SIZE_PX as f32;
                        if dist_tiles < min_distance_from_fishing_village {
                            too_close = true;
                        }
                    }
                }
                
                // Check distance from whale bone graveyard
                if !too_close {
                    if let Some((wbg_x, wbg_y)) = whale_bone_graveyard_center {
                        let dx = tile_world_x - wbg_x;
                        let dy = tile_world_y - wbg_y;
                        let dist_tiles = (dx * dx + dy * dy).sqrt() / crate::TILE_SIZE_PX as f32;
                        if dist_tiles < min_distance_from_whale_graveyard {
                            too_close = true;
                        }
                    }
                }
                
                if too_close {
                    continue;
                }
                
                candidate_positions.push((x, y, shore_dist));
            }
        }
    }
    
    if candidate_positions.is_empty() {
        log::warn!("🏕️ No valid forest positions found for hunting village");
        return (village_center, village_parts);
    }
    
    log::info!("🏕️ Found {} candidate positions for hunting village in forest biome", 
               candidate_positions.len());
    
    // Select position using noise - prefer positions deeper in forest
    let mut best_score = f64::NEG_INFINITY;
    let mut best_position: Option<(usize, usize)> = None;
    
    for &(x, y, shore_dist) in &candidate_positions {
        // Score: noise value + bonus for being deeper inland
        let noise_val = noise.get([x as f64 * 0.01, y as f64 * 0.01, 40000.0]); // Different seed than other monuments
        let inland_bonus = (shore_dist - min_shore_dist).min(30.0) / 30.0 * 0.3; // Bonus for deeper inland
        let score = noise_val + inland_bonus;
        
        if score > best_score {
            best_score = score;
            best_position = Some((x, y));
        }
    }
    
    if let Some((center_x, center_y)) = best_position {
        let tile_size_px = crate::TILE_SIZE_PX as f32;
        let center_world_x = (center_x as f32 + 0.5) * tile_size_px;
        let center_world_y = (center_y as f32 + 0.5) * tile_size_px;
        
        village_center = Some((center_world_x, center_world_y));
        
        log::info!("🏕️✨ PLACED HUNTING VILLAGE CENTER (lodge) at tile ({}, {}) = 📍 World Position: ({:.0}, {:.0}) ✨",
                   center_x, center_y, center_world_x, center_world_y);
        
        // =============================================================================
        // HUNTING VILLAGE LAYOUT
        // =============================================================================
        // The campfire is in the CENTER courtyard, surrounded by the 4 buildings.
        // The lodge is the center piece (for zone calculations), with huts forming
        // a protective semi-circle to the north. Drying rack next to campfire.
        //
        // Layout (in local coords):
        //
        //                    HUT3 (0, -500)                        <- FAR NORTH
        //     HUT1 (-520, -280)               HUT2 (+520, -280)    <- NW/NE flanks
        //                                    
        //          DRYING_RACK (-120, -180)  CAMPFIRE (0, -180)    <- CENTRAL COURTYARD
        //                                    
        //                    LODGE (0, 0)                          <- SOUTH (zone anchor)
        //
        // The campfire sits in the middle courtyard between all 4 buildings,
        // creating a cozy gathering space. Tree ring spawned during world generation.
        // =============================================================================
        
        // Structure definitions: (part_type, image_name, offset_x, offset_y)
        let structure_configs: [(&str, &str, f32, f32); 6] = [
            // Main lodge - CENTER PIECE - the heart of the hunting village (zone anchor)
            ("lodge", "hv_lodge.png", 0.0, 0.0),
            
            // Hunting huts - arranged in a semi-circle to the north (spread out more)
            ("hut", "hv_hut1.png", -520.0, -280.0),  // Northwest flank
            ("hut", "hv_hut2.png", 520.0, -280.0),   // Northeast flank
            ("hut", "hv_hut3.png", 0.0, -500.0),     // Far north (back of semi-circle)
            
            // Campfire - in the central courtyard between all 4 buildings
            ("campfire", "fv_campfire.png", 0.0, -180.0),
            
            // Drying rack for pelts and meat - right next to the campfire
            ("drying_rack", "hv_drying_rack.png", -120.0, -180.0),
        ];
        
        for (part_type, image_name, offset_x, offset_y) in structure_configs.iter() {
            let part_world_x = center_world_x + offset_x;
            let part_world_y = center_world_y + offset_y;
            
            // Convert to tile coords for validation
            let part_tile_x = (part_world_x / tile_size_px) as i32;
            let part_tile_y = (part_world_y / tile_size_px) as i32;
            
            // Bounds check
            if part_tile_x < 5 || part_tile_y < 5 || 
               part_tile_x >= (width as i32 - 5) || part_tile_y >= (height as i32 - 5) {
                log::warn!("🏕️ {} out of bounds at tile ({}, {})", part_type, part_tile_x, part_tile_y);
                continue;
            }
            
            let px = part_tile_x as usize;
            let py = part_tile_y as usize;
            
            // Check terrain - must be on land, not water/river/lake
            let part_shore_dist = shore_distance[py][px];
            
            if part_shore_dist < 0.0 || river_network[py][px] || lake_map[py][px] {
                log::warn!("🏕️ {} terrain invalid: shore_dist={:.1}", part_type, part_shore_dist);
                continue;
            }
            
            // Place the structure!
            village_parts.push((part_world_x, part_world_y, image_name.to_string(), part_type.to_string()));
            
            log::info!("🏕️✨ PLACED {} ({}) at ({:.0}, {:.0}), offset=({:.0}, {:.0}) ✨",
                       part_type.to_uppercase(), image_name, part_world_x, part_world_y,
                       offset_x, offset_y);
        }
        
        log::info!("🏕️ Hunting village generation complete: {} total structures", village_parts.len());
    } else {
        log::warn!("🏕️ Failed to select hunting village position");
    }
    
    (village_center, village_parts)
}

// =============================================================================
// MONUMENT DECORATIONS (Flavor Items)
// =============================================================================

/// Configuration for what decorations spawn around a monument type
#[derive(Clone, Debug)]
pub struct MonumentDecorationConfig {
    /// Item name to spawn (must exist in item_definition table)
    pub item_name: String,
    /// Minimum quantity per spawn
    pub min_quantity: u32,
    /// Maximum quantity per spawn
    pub max_quantity: u32,
    /// Spawn chance per monument part (0.0 to 1.0)
    pub spawn_chance: f32,
    /// Minimum distance from monument part (pixels)
    pub min_distance: f32,
    /// Maximum distance from monument part (pixels)
    pub max_distance: f32,
}

/// Configuration for harvestable resources around monuments
#[derive(Clone, Debug)]
pub struct MonumentHarvestableConfig {
    /// Plant type to spawn
    pub plant_type: crate::plants_database::PlantType,
    /// Spawn chance per monument part (0.0 to 1.0)
    pub spawn_chance: f32,
    /// Minimum distance from monument part (pixels)
    pub min_distance: f32,
    /// Maximum distance from monument part (pixels)
    pub max_distance: f32,
}

/// Shipwreck-specific decoration configuration
/// Currently empty - shipwrecks use harvestable resources instead of one-time decorations
pub fn get_shipwreck_decorations() -> Vec<MonumentDecorationConfig> {
    vec![
        // Memory Shards are now spawned as harvestable resources (respawn!)
        // See get_shipwreck_harvestables() for Memory Shard spawning
    ]
}

/// Shipwreck-specific harvestable resource configuration
/// Spawns Beach Wood Piles and Memory Shards around shipwreck parts
pub fn get_shipwreck_harvestables() -> Vec<MonumentHarvestableConfig> {
    vec![
        // Beach Wood Pile - common, scattered around wreckage
        // Increased spawn chance and allow multiple spawns per part
        MonumentHarvestableConfig {
            plant_type: crate::plants_database::PlantType::BeachWoodPile,
            spawn_chance: 0.85, // 85% chance per part (increased from 60%)
            min_distance: 80.0,
            max_distance: 200.0,
        },
        // Second Beach Wood Pile spawn - additional chance for more driftwood
        MonumentHarvestableConfig {
            plant_type: crate::plants_database::PlantType::BeachWoodPile,
            spawn_chance: 0.50, // 50% chance for second pile per part
            min_distance: 100.0,
            max_distance: 250.0,
        },
        // Memory Shard - ancient tech debris washed up with the wreckage (RESPAWNS!)
        // Shipwrecks become reliable Memory Shard farming spots
        MonumentHarvestableConfig {
            plant_type: crate::plants_database::PlantType::MemoryShard,
            spawn_chance: 0.45, // 45% per part = ~3-4 shards per shipwreck
            min_distance: 60.0,
            max_distance: 180.0,
        },
        // Second Memory Shard spawn - bonus chance for extra shards
        MonumentHarvestableConfig {
            plant_type: crate::plants_database::PlantType::MemoryShard,
            spawn_chance: 0.25, // 25% chance for bonus spawn
            min_distance: 90.0,
            max_distance: 220.0,
        },
    ]
}

/// Whale Bone Graveyard-specific decoration configuration
/// Currently empty - whale bone graveyard uses harvestable resources instead
pub fn get_whale_bone_graveyard_decorations() -> Vec<MonumentDecorationConfig> {
    vec![
        // No one-time decorations - all resources respawn
    ]
}

/// Whale Bone Graveyard-specific harvestable resource configuration
/// Spawns Beach Wood Piles (driftwood) and Stone Piles (whale bones = bone meal) around bone parts
pub fn get_whale_bone_graveyard_harvestables() -> Vec<MonumentHarvestableConfig> {
    vec![
        // Bone Pile - whale bone fragments scattered throughout the graveyard
        // Primary source of bone fragments at this monument
        MonumentHarvestableConfig {
            plant_type: crate::plants_database::PlantType::BonePile,
            spawn_chance: 0.80, // 80% chance per part - abundant bone fragments
            min_distance: 50.0,
            max_distance: 160.0,
        },
        // Second Bone Pile spawn - more bone fragments
        MonumentHarvestableConfig {
            plant_type: crate::plants_database::PlantType::BonePile,
            spawn_chance: 0.50, // 50% chance for second pile
            min_distance: 70.0,
            max_distance: 180.0,
        },
        // Beach Wood Pile - driftwood scattered among the bones
        MonumentHarvestableConfig {
            plant_type: crate::plants_database::PlantType::BeachWoodPile,
            spawn_chance: 0.60, // 60% chance per part (reduced from 70%)
            min_distance: 60.0,
            max_distance: 180.0,
        },
        // Stone Pile - occasional stone debris
        MonumentHarvestableConfig {
            plant_type: crate::plants_database::PlantType::StonePile,
            spawn_chance: 0.35, // 35% per part (reduced from 50%)
            min_distance: 50.0,
            max_distance: 150.0,
        },
        // Memory Shard - mysterious ancient tech found among the bones
        // Perhaps the hermit has been collecting them?
        MonumentHarvestableConfig {
            plant_type: crate::plants_database::PlantType::MemoryShard,
            spawn_chance: 0.30, // 30% per part = ~2 shards per graveyard
            min_distance: 70.0,
            max_distance: 160.0,
        },
    ]
}

/// Spawns decorations around monument parts
/// Efficiently collects all positions first, then spawns items
pub fn spawn_monument_decorations(
    ctx: &ReducerContext,
    monument_part_positions: &[(f32, f32)],
    decoration_configs: &[MonumentDecorationConfig],
) -> Result<(), String> {
    if monument_part_positions.is_empty() {
        return Ok(()); // No parts, nothing to decorate
    }
    
    let item_defs = ctx.db.item_definition();
    let mut decorations_to_spawn: Vec<(f32, f32, u64, u32)> = Vec::new(); // (x, y, item_def_id, quantity)
    
    // Collect all decoration spawn positions
    for &(part_x, part_y) in monument_part_positions {
        for config in decoration_configs {
            // Roll for spawn chance
            let roll: f32 = ctx.rng().gen();
            if roll > config.spawn_chance {
                continue; // This decoration doesn't spawn for this part
            }
            
            // Find item definition
            let item_def_id = match item_defs.iter().find(|def| def.name == config.item_name) {
                Some(def) => def.id,
                None => {
                    log::warn!("[MonumentDecorations] Item '{}' not found in database, skipping", config.item_name);
                    continue;
                }
            };
            
            // Determine quantity
            let quantity = if config.min_quantity == config.max_quantity {
                config.min_quantity
            } else {
                ctx.rng().gen_range(config.min_quantity..=config.max_quantity)
            };
            
            // Calculate spawn position (random angle and distance from part)
            let angle = ctx.rng().gen_range(0.0..(2.0 * std::f32::consts::PI));
            let distance = ctx.rng().gen_range(config.min_distance..config.max_distance);
            let spawn_x = part_x + angle.cos() * distance;
            let spawn_y = part_y + angle.sin() * distance;
            
            decorations_to_spawn.push((spawn_x, spawn_y, item_def_id, quantity));
        }
    }
    
    log::info!("[MonumentDecorations] Collected {} decoration spawns around {} monument parts", 
               decorations_to_spawn.len(), monument_part_positions.len());
    
    // Spawn all collected decorations
    let mut spawned_count = 0;
    for (spawn_x, spawn_y, item_def_id, quantity) in decorations_to_spawn {
        match crate::dropped_item::create_dropped_item_entity(ctx, item_def_id, quantity, spawn_x, spawn_y) {
            Ok(_) => {
                spawned_count += 1;
                log::debug!("[MonumentDecorations] Spawned {}x item {} at ({:.1}, {:.1})", 
                           quantity, item_def_id, spawn_x, spawn_y);
            }
            Err(e) => {
                log::warn!("[MonumentDecorations] Failed to spawn decoration at ({:.1}, {:.1}): {}", 
                          spawn_x, spawn_y, e);
            }
        }
    }
    
    log::info!("[MonumentDecorations] Successfully spawned {} decorations", spawned_count);
    Ok(())
}

/// Spawns harvestable resources around monument parts
/// Efficiently collects all positions first, then spawns harvestable resources
pub fn spawn_monument_harvestables(
    ctx: &ReducerContext,
    monument_part_positions: &[(f32, f32)],
    harvestable_configs: &[MonumentHarvestableConfig],
) -> Result<(), String> {
    if monument_part_positions.is_empty() {
        return Ok(()); // No parts, nothing to spawn
    }
    
    let harvestable_resources = ctx.db.harvestable_resource();
    let mut harvestables_to_spawn: Vec<(f32, f32, crate::plants_database::PlantType)> = Vec::new();
    
    // Collect all harvestable spawn positions
    for &(part_x, part_y) in monument_part_positions {
        for config in harvestable_configs {
            // Roll for spawn chance
            let roll: f32 = ctx.rng().gen();
            if roll > config.spawn_chance {
                continue; // This harvestable doesn't spawn for this part
            }
            
            // Calculate spawn position (random angle and distance from part)
            let angle = ctx.rng().gen_range(0.0..(2.0 * std::f32::consts::PI));
            let distance = ctx.rng().gen_range(config.min_distance..config.max_distance);
            let spawn_x = part_x + angle.cos() * distance;
            let spawn_y = part_y + angle.sin() * distance;
            
            harvestables_to_spawn.push((spawn_x, spawn_y, config.plant_type));
        }
    }
    
    log::info!("[MonumentHarvestables] Collected {} harvestable spawns around {} monument parts", 
               harvestables_to_spawn.len(), monument_part_positions.len());
    
    // Spawn all collected harvestables
    let mut spawned_count = 0;
    for (spawn_x, spawn_y, plant_type) in harvestables_to_spawn {
        // Validate position: coastal resources must be on beach tiles
        let is_coastal_resource = plant_type == crate::plants_database::PlantType::BeachWoodPile ||
                                   plant_type == crate::plants_database::PlantType::MemoryShard;
        if is_coastal_resource {
            if !crate::environment::is_position_on_beach_tile(ctx, spawn_x, spawn_y) {
                log::debug!("[MonumentHarvestables] Skipping {:?} at ({:.1}, {:.1}) - not on beach", plant_type, spawn_x, spawn_y);
                continue;
            }
        }
        
        let chunk_idx = crate::environment::calculate_chunk_index(spawn_x, spawn_y);
        
        // Create harvestable resource
        let harvestable = crate::harvestable_resource::create_harvestable_resource(
            plant_type,
            spawn_x,
            spawn_y,
            chunk_idx,
            false // Mark as wild (not player-planted)
        );
        
        match harvestable_resources.try_insert(harvestable) {
            Ok(inserted) => {
                spawned_count += 1;
                log::debug!("[MonumentHarvestables] Spawned {:?} at ({:.1}, {:.1})", 
                           plant_type, spawn_x, spawn_y);
            }
            Err(e) => {
                log::warn!("[MonumentHarvestables] Failed to spawn {:?} at ({:.1}, {:.1}): {}", 
                          plant_type, spawn_x, spawn_y, e);
            }
        }
    }
    
    log::info!("[MonumentHarvestables] Successfully spawned {} harvestable resources", spawned_count);
    Ok(())
}

/// Spawns beach barrels around shipwreck monument parts
/// Uses barrel.rs system but spawns specifically around shipwreck locations
pub fn spawn_shipwreck_barrels(
    ctx: &ReducerContext,
    monument_part_positions: &[(f32, f32)],
) -> Result<(), String> {
    if monument_part_positions.is_empty() {
        return Ok(());
    }
    
    use crate::barrel::{Barrel, BARREL_INITIAL_HEALTH, SEA_BARREL_VARIANT_START, SEA_BARREL_VARIANT_END};
    use crate::environment::calculate_chunk_index;
    use crate::barrel::{has_barrel_collision, has_player_barrel_collision};
    use rand::Rng;
    
    let barrels = ctx.db.barrel();
    let mut spawned_count = 0;
    
    // Spawn 2-4 beach barrels per shipwreck part (70% chance per part - increased from 30%)
    for &(part_x, part_y) in monument_part_positions {
        let spawn_roll: f32 = ctx.rng().gen();
        if spawn_roll > 0.70 {
            continue; // 30% chance to skip this part (was 70%)
        }
        
        // Determine how many barrels (2-4) - increased from 1-2
        let barrel_count = if ctx.rng().gen::<f32>() < 0.4 {
            2 // 40% chance for 2 barrels
        } else if ctx.rng().gen::<f32>() < 0.8 {
            3 // 40% chance for 3 barrels
        } else {
            4 // 20% chance for 4 barrels
        };
        
        for barrel_idx in 0..barrel_count {
            let mut attempts = 0;
            const MAX_ATTEMPTS: u32 = 10;
            
            while attempts < MAX_ATTEMPTS {
                attempts += 1;
                
                // Generate position around the shipwreck part
                let angle = (barrel_idx as f32) * (2.0 * std::f32::consts::PI / barrel_count as f32) +
                           ctx.rng().gen_range(-0.5..0.5);
                let distance = ctx.rng().gen_range(150.0..350.0); // Further from parts than items
                let barrel_x = part_x + angle.cos() * distance;
                let barrel_y = part_y + angle.sin() * distance;
                
                // Validate position: must be on beach
                if !crate::environment::is_position_on_beach_tile(ctx, barrel_x, barrel_y) {
                    continue;
                }
                
                // Check collisions
                if has_barrel_collision(ctx, barrel_x, barrel_y, None) ||
                   has_player_barrel_collision(ctx, barrel_x, barrel_y) {
                    continue;
                }
                
                // Spawn beach barrel (sea variants 3, 4, 5)
                let variant = ctx.rng().gen_range(SEA_BARREL_VARIANT_START..SEA_BARREL_VARIANT_END);
                let chunk_idx = calculate_chunk_index(barrel_x, barrel_y);
                
                let new_barrel = Barrel {
                    id: 0,
                    pos_x: barrel_x,
                    pos_y: barrel_y,
                    chunk_index: chunk_idx,
                    health: BARREL_INITIAL_HEALTH,
                    variant,
                    last_hit_time: None,
                    respawn_at: Timestamp::UNIX_EPOCH, // 0 = not respawning
                    cluster_id: 0, // Individual spawns, not clusters
                };
                
                match barrels.try_insert(new_barrel) {
                    Ok(inserted_barrel) => {
                        spawned_count += 1;
                        log::info!("[ShipwreckBarrels] Spawned beach barrel #{} (variant {}) at ({:.1}, {:.1}) near shipwreck part",
                                  inserted_barrel.id, variant, barrel_x, barrel_y);
                        break; // Successfully spawned
                    }
                    Err(e) => {
                        log::warn!("[ShipwreckBarrels] Failed to insert barrel: {}", e);
                        // Continue to try another position
                    }
                }
            }
        }
    }
    
    log::info!("[ShipwreckBarrels] Spawned {} beach barrels around shipwreck monument", spawned_count);
    Ok(())
}

/// Spawns military rations around shipwreck monument parts
/// Spawns on ground (not water) around shipwreck parts
pub fn spawn_shipwreck_military_rations(
    ctx: &ReducerContext,
    monument_part_positions: &[(f32, f32)],
) -> Result<(), String> {
    if monument_part_positions.is_empty() {
        return Ok(());
    }
    
    use crate::environment::calculate_chunk_index;
    use crate::wooden_storage_box::{BOX_TYPE_MILITARY_RATION, wooden_storage_box as WoodenStorageBoxTableTrait};
    use rand::Rng;
    
    let mut spawned_count = 0;
    
    // Spawn max 1 military ration per shipwreck part (60% chance per part)
    for &(part_x, part_y) in monument_part_positions {
        let spawn_roll: f32 = ctx.rng().gen();
        if spawn_roll > 0.60 {
            continue; // 40% chance to skip this part
        }
        
        // Check if there's already a military ration near this shipwreck part (within 200px)
        let existing_boxes = ctx.db.wooden_storage_box();
        let mut has_existing_ration = false;
        for existing_box in existing_boxes.iter() {
            if existing_box.box_type == BOX_TYPE_MILITARY_RATION {
                let dx = part_x - existing_box.pos_x;
                let dy = part_y - existing_box.pos_y;
                if dx * dx + dy * dy < 200.0 * 200.0 { // 200px check for shipwreck part area
                    has_existing_ration = true;
                    break;
                }
            }
        }
        
        if has_existing_ration {
            continue; // Skip this part if there's already a ration nearby
        }
        
        // Try to spawn 1 military ration near this shipwreck part
        let mut attempts = 0;
        const MAX_ATTEMPTS: u32 = 10;
        
        while attempts < MAX_ATTEMPTS {
            attempts += 1;
            
            // Generate position around the shipwreck part
            let angle = ctx.rng().gen_range(0.0..std::f32::consts::PI * 2.0);
            let distance = ctx.rng().gen_range(100.0..250.0); // Distance from parts
            let ration_x = part_x + angle.cos() * distance;
            let ration_y = part_y + angle.sin() * distance;
            
            // Validate position: must be on ground (not water)
            // Check tile type at this position
            let tile_x = (ration_x / crate::TILE_SIZE_PX as f32).floor() as i32;
            let tile_y = (ration_y / crate::TILE_SIZE_PX as f32).floor() as i32;
            if let Some(tile_type) = crate::get_tile_type_at_position(ctx, tile_x, tile_y) {
                if tile_type.is_water() {
                    continue; // Skip water tiles
                }
            }
            
            // Check collision with existing barrels
            use crate::barrel::{has_barrel_collision, has_player_barrel_collision};
            if has_barrel_collision(ctx, ration_x, ration_y, None) ||
               has_player_barrel_collision(ctx, ration_x, ration_y) {
                continue;
            }
            
            // Check collision with existing military rations
            let existing_boxes = ctx.db.wooden_storage_box();
            let mut too_close = false;
            for existing_box in existing_boxes.iter() {
                if existing_box.box_type == BOX_TYPE_MILITARY_RATION {
                    let dx = ration_x - existing_box.pos_x;
                    let dy = ration_y - existing_box.pos_y;
                    if dx * dx + dy * dy < 100.0 * 100.0 { // 100px minimum distance
                        too_close = true;
                        break;
                    }
                }
            }
            
            if too_close {
                continue;
            }
            
            // Spawn military ration
            let chunk_idx = calculate_chunk_index(ration_x, ration_y);
            match crate::military_ration::spawn_military_ration_with_loot(ctx, ration_x, ration_y, chunk_idx) {
                Ok(_) => {
                    spawned_count += 1;
                    log::info!("[ShipwreckRations] Spawned military ration at ({:.1}, {:.1}) near shipwreck part",
                              ration_x, ration_y);
                    break; // Successfully spawned
                }
                Err(e) => {
                    log::warn!("[ShipwreckRations] Failed to spawn military ration: {}", e);
                    // Continue to try another position
                }
            }
        }
    }
    
    log::info!("[ShipwreckRations] Spawned {} military rations around shipwreck monument", spawned_count);
    Ok(())
}

/// Spawns beach barrels around whale bone graveyard monument parts
/// Uses barrel.rs system but spawns specifically around whale bone graveyard locations
pub fn spawn_whale_bone_graveyard_barrels(
    ctx: &ReducerContext,
    monument_part_positions: &[(f32, f32)],
    center_position: Option<(f32, f32)>,
) -> Result<(), String> {
    if monument_part_positions.is_empty() {
        return Ok(());
    }
    
    use crate::barrel::{Barrel, BARREL_INITIAL_HEALTH, SEA_BARREL_VARIANT_START, SEA_BARREL_VARIANT_END};
    use crate::environment::calculate_chunk_index;
    use crate::barrel::{has_barrel_collision, has_player_barrel_collision};
    use rand::Rng;
    
    let barrels = ctx.db.barrel();
    let mut spawned_count = 0;
    
    // Threshold to identify hermit hut (center piece) - within 10 pixels
    const HERMIT_HUT_THRESHOLD: f32 = 10.0;
    
    // Spawn 1-2 beach barrels per whale bone part (50% chance per part)
    for &(part_x, part_y) in monument_part_positions {
        let spawn_roll: f32 = ctx.rng().gen();
        if spawn_roll > 0.50 {
            continue; // 50% chance to skip this part
        }
        
        // Check if this is the hermit hut (center piece)
        let is_hermit_hut = if let Some((center_x, center_y)) = center_position {
            let dx = part_x - center_x;
            let dy = part_y - center_y;
            (dx * dx + dy * dy).sqrt() < HERMIT_HUT_THRESHOLD
        } else {
            false
        };
        
        // Use larger distance range for hermit hut to spawn barrels further away
        let (min_distance, max_distance) = if is_hermit_hut {
            (200.0, 450.0) // Further from hermit hut
        } else {
            (120.0, 300.0) // Normal distance for other parts
        };
        
        // Determine how many barrels (1-2)
        let barrel_count = if ctx.rng().gen::<f32>() < 0.5 {
            1 // 50% chance for 1 barrel
        } else {
            2 // 50% chance for 2 barrels
        };
        
        for barrel_idx in 0..barrel_count {
            let mut attempts = 0;
            const MAX_ATTEMPTS: u32 = 10;
            
            while attempts < MAX_ATTEMPTS {
                attempts += 1;
                
                // Generate position around the whale bone part
                let angle = (barrel_idx as f32) * (2.0 * std::f32::consts::PI / barrel_count as f32) +
                           ctx.rng().gen_range(-0.5..0.5);
                let distance = ctx.rng().gen_range(min_distance..max_distance);
                let barrel_x = part_x + angle.cos() * distance;
                let barrel_y = part_y + angle.sin() * distance;
                
                // Validate position: must be on beach
                if !crate::environment::is_position_on_beach_tile(ctx, barrel_x, barrel_y) {
                    continue;
                }
                
                // Check collisions
                if has_barrel_collision(ctx, barrel_x, barrel_y, None) ||
                   has_player_barrel_collision(ctx, barrel_x, barrel_y) {
                    continue;
                }
                
                // Spawn beach barrel (sea variants 3, 4, 5)
                let variant = ctx.rng().gen_range(SEA_BARREL_VARIANT_START..SEA_BARREL_VARIANT_END);
                let chunk_idx = calculate_chunk_index(barrel_x, barrel_y);
                
                let new_barrel = Barrel {
                    id: 0,
                    pos_x: barrel_x,
                    pos_y: barrel_y,
                    chunk_index: chunk_idx,
                    health: BARREL_INITIAL_HEALTH,
                    variant,
                    last_hit_time: None,
                    respawn_at: Timestamp::UNIX_EPOCH, // 0 = not respawning
                    cluster_id: 0, // Individual spawns, not clusters
                };
                
                match barrels.try_insert(new_barrel) {
                    Ok(inserted_barrel) => {
                        spawned_count += 1;
                        log::info!("[WhaleBoneGraveyardBarrels] Spawned beach barrel #{} (variant {}) at ({:.1}, {:.1})",
                                  inserted_barrel.id, variant, barrel_x, barrel_y);
                        break; // Successfully spawned
                    }
                    Err(e) => {
                        log::warn!("[WhaleBoneGraveyardBarrels] Failed to insert barrel: {}", e);
                    }
                }
            }
        }
    }
    
    log::info!("[WhaleBoneGraveyardBarrels] Spawned {} beach barrels around whale bone graveyard monument", spawned_count);
    Ok(())
}

/// Spawns military rations around whale bone graveyard monument parts
/// Fewer than shipwreck (40% chance vs 60%) - the hermit has already picked through most of them
pub fn spawn_whale_bone_graveyard_military_rations(
    ctx: &ReducerContext,
    monument_part_positions: &[(f32, f32)],
) -> Result<(), String> {
    if monument_part_positions.is_empty() {
        return Ok(());
    }
    
    use crate::environment::calculate_chunk_index;
    use crate::wooden_storage_box::{BOX_TYPE_MILITARY_RATION, wooden_storage_box as WoodenStorageBoxTableTrait};
    use rand::Rng;
    
    let mut spawned_count = 0;
    
    // Spawn max 1 military ration per part (40% chance per part - less than shipwreck)
    for &(part_x, part_y) in monument_part_positions {
        let spawn_roll: f32 = ctx.rng().gen();
        if spawn_roll > 0.40 {
            continue; // 60% chance to skip this part
        }
        
        // Check if there's already a military ration nearby (within 200px)
        let existing_boxes = ctx.db.wooden_storage_box();
        let mut has_existing_ration = false;
        for existing_box in existing_boxes.iter() {
            if existing_box.box_type == BOX_TYPE_MILITARY_RATION {
                let dx = part_x - existing_box.pos_x;
                let dy = part_y - existing_box.pos_y;
                if dx * dx + dy * dy < 200.0 * 200.0 {
                    has_existing_ration = true;
                    break;
                }
            }
        }
        
        if has_existing_ration {
            continue;
        }
        
        // Try to spawn 1 military ration near this part
        let mut attempts = 0;
        const MAX_ATTEMPTS: u32 = 10;
        
        while attempts < MAX_ATTEMPTS {
            attempts += 1;
            
            // Generate position around the part
            let angle = ctx.rng().gen_range(0.0..std::f32::consts::PI * 2.0);
            let distance = ctx.rng().gen_range(80.0..200.0);
            let ration_x = part_x + angle.cos() * distance;
            let ration_y = part_y + angle.sin() * distance;
            
            // Validate position: must be on ground (not water)
            let tile_x = (ration_x / crate::TILE_SIZE_PX as f32).floor() as i32;
            let tile_y = (ration_y / crate::TILE_SIZE_PX as f32).floor() as i32;
            if let Some(tile_type) = crate::get_tile_type_at_position(ctx, tile_x, tile_y) {
                if tile_type.is_water() {
                    continue;
                }
            }
            
            // Check collision with existing barrels
            use crate::barrel::{has_barrel_collision, has_player_barrel_collision};
            if has_barrel_collision(ctx, ration_x, ration_y, None) ||
               has_player_barrel_collision(ctx, ration_x, ration_y) {
                continue;
            }
            
            // Check collision with existing military rations
            let existing_boxes = ctx.db.wooden_storage_box();
            let mut too_close = false;
            for existing_box in existing_boxes.iter() {
                if existing_box.box_type == BOX_TYPE_MILITARY_RATION {
                    let dx = ration_x - existing_box.pos_x;
                    let dy = ration_y - existing_box.pos_y;
                    if dx * dx + dy * dy < 100.0 * 100.0 {
                        too_close = true;
                        break;
                    }
                }
            }
            
            if too_close {
                continue;
            }
            
            // Spawn military ration
            let chunk_idx = calculate_chunk_index(ration_x, ration_y);
            match crate::military_ration::spawn_military_ration_with_loot(ctx, ration_x, ration_y, chunk_idx) {
                Ok(_) => {
                    spawned_count += 1;
                    log::info!("[WhaleBoneGraveyardRations] Spawned military ration at ({:.1}, {:.1})",
                              ration_x, ration_y);
                    break;
                }
                Err(e) => {
                    log::warn!("[WhaleBoneGraveyardRations] Failed to spawn military ration: {}", e);
                }
            }
        }
    }
    
    log::info!("[WhaleBoneGraveyardRations] Spawned {} military rations around whale bone graveyard monument", spawned_count);
    Ok(())
}

// Future monument decoration configs can be added here:
/*
/// Ruins-specific decoration configuration
pub fn get_ruins_decorations() -> Vec<MonumentDecorationConfig> {
    vec![
        MonumentDecorationConfig {
            item_name: "Memory Shard".to_string(),
            min_quantity: 1,
            max_quantity: 3,
            spawn_chance: 0.40,
            min_distance: 50.0,
            max_distance: 150.0,
        },
        // ... more ruins-specific items
    ]
}
*/

// Future monument generators can be added here:
/*
/// Generate ruins monument in north forest clearings
pub fn generate_ruins(
    noise: &Perlin,
    forest_areas: &[Vec<bool>],
    width: usize,
    height: usize,
) -> (Vec<(f32, f32)>, Vec<(f32, f32, String)>) {
    // ... ruins generation logic ...
}
*/

// =============================================================================
// MONUMENT CLEARANCE CHECKING
// =============================================================================

// Future monument type checkers can be added here:
/*
/// Checks if position is near any ruins monument
fn is_near_ruins(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    let clearance_sq = clearance::RUINS * clearance::RUINS;
    
    for ruins in ctx.db.ruins_part().iter() {
        let dx = pos_x - ruins.world_x;
        let dy = pos_y - ruins.world_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < clearance_sq {
            return true;
        }
    }
    
    false
}

/// Checks if position is near any crash site monument
fn is_near_crash_site(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    let clearance_sq = clearance::CRASH_SITE * clearance::CRASH_SITE;
    
    for crash_site in ctx.db.crash_site_part().iter() {
        let dx = pos_x - crash_site.world_x;
        let dy = pos_y - crash_site.world_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < clearance_sq {
            return true;
        }
    }
    
    false
}
*/

// =============================================================================
// MONUMENT PLACEABLES SYSTEM
// =============================================================================
// Monument placeables are permanent, indestructible containers (campfires, furnaces,
// rain collectors, etc.) that are spawned at safe zone monuments during world generation.
// These allow players to use crafting/processing stations in safe zones without
// needing to place their own structures.

use crate::campfire::{Campfire, CAMPFIRE_INITIAL_HEALTH, CAMPFIRE_MAX_HEALTH, INITIAL_CAMPFIRE_FUEL_AMOUNT};
use crate::furnace::{Furnace, FURNACE_INITIAL_HEALTH, FURNACE_MAX_HEALTH, INITIAL_FURNACE_FUEL_AMOUNT};
use crate::rain_collector::{RainCollector, RAIN_COLLECTOR_INITIAL_HEALTH, RAIN_COLLECTOR_MAX_HEALTH};
use crate::lantern::{Lantern, LANTERN_INITIAL_HEALTH, LANTERN_MAX_HEALTH};
use crate::wooden_storage_box::{
    WoodenStorageBox, BOX_TYPE_COOKING_STATION, BOX_TYPE_REPAIR_BENCH,
    COOKING_STATION_INITIAL_HEALTH, COOKING_STATION_MAX_HEALTH,
    REPAIR_BENCH_INITIAL_HEALTH, REPAIR_BENCH_MAX_HEALTH,
    BOX_COLLISION_Y_OFFSET,
};
use crate::campfire::campfire as CampfireTableTrait;
use crate::furnace::furnace as FurnaceTableTrait;
use crate::rain_collector::rain_collector as RainCollectorTableTrait;
use crate::lantern::lantern as LanternTableTrait;
use crate::wooden_storage_box::wooden_storage_box as WoodenStorageBoxTableTrait;
use crate::environment::calculate_chunk_index;
use spacetimedb::Identity;

/// Types of placeables that can be spawned at monuments
#[derive(Clone, Debug, PartialEq)]
pub enum MonumentPlaceableType {
    Campfire,
    Furnace,
    RainCollector,
    Lantern,
    CookingStation,
    RepairBench,
}

/// Configuration for a single monument placeable
#[derive(Clone, Debug)]
pub struct MonumentPlaceableConfig {
    /// Type of placeable to spawn
    pub placeable_type: MonumentPlaceableType,
    /// X offset from monument center (positive = east)
    pub offset_x: f32,
    /// Y offset from monument center (positive = south)
    pub offset_y: f32,
    /// Initial fuel amount for campfires/furnaces (None = use default)
    pub initial_fuel: Option<u32>,
}

impl MonumentPlaceableConfig {
    pub fn campfire(offset_x: f32, offset_y: f32) -> Self {
        Self {
            placeable_type: MonumentPlaceableType::Campfire,
            offset_x,
            offset_y,
            initial_fuel: Some(INITIAL_CAMPFIRE_FUEL_AMOUNT),
        }
    }
    
    pub fn furnace(offset_x: f32, offset_y: f32) -> Self {
        Self {
            placeable_type: MonumentPlaceableType::Furnace,
            offset_x,
            offset_y,
            initial_fuel: Some(INITIAL_FURNACE_FUEL_AMOUNT),
        }
    }
    
    pub fn rain_collector(offset_x: f32, offset_y: f32) -> Self {
        Self {
            placeable_type: MonumentPlaceableType::RainCollector,
            offset_x,
            offset_y,
            initial_fuel: None,
        }
    }
    
    pub fn cooking_station(offset_x: f32, offset_y: f32) -> Self {
        Self {
            placeable_type: MonumentPlaceableType::CookingStation,
            offset_x,
            offset_y,
            initial_fuel: None,
        }
    }
    
    pub fn repair_bench(offset_x: f32, offset_y: f32) -> Self {
        Self {
            placeable_type: MonumentPlaceableType::RepairBench,
            offset_x,
            offset_y,
            initial_fuel: None,
        }
    }
    
    pub fn lantern(offset_x: f32, offset_y: f32) -> Self {
        Self {
            placeable_type: MonumentPlaceableType::Lantern,
            offset_x,
            offset_y,
            initial_fuel: None,
        }
    }
}

/// Get monument placeables for the Central ALK Compound
/// The central compound is at a fixed position in the world center
pub fn get_central_compound_placeables() -> Vec<MonumentPlaceableConfig> {
    vec![
        // Two campfires on opposite sides
        MonumentPlaceableConfig::campfire(-150.0, 200.0),
        MonumentPlaceableConfig::campfire(150.0, 200.0),
        // Two furnaces further back
        MonumentPlaceableConfig::furnace(-300.0, -100.0),
        MonumentPlaceableConfig::furnace(300.0, -100.0),
        // Rain collector off to the side
        MonumentPlaceableConfig::rain_collector(-250.0, 50.0),
    ]
}

/// Get monument placeables for the Shipwreck monument
pub fn get_shipwreck_placeables() -> Vec<MonumentPlaceableConfig> {
    vec![
        // Single campfire north of the main shipwreck part (hull1.png center)
        MonumentPlaceableConfig::campfire(0.0, -200.0),
    ]
}

/// Get monument placeables for the Fishing Village monument
/// NOTE: No functional campfire - using visual doodad fv_campfire.png instead
pub fn get_fishing_village_placeables() -> Vec<MonumentPlaceableConfig> {
    vec![
        // No placeables - the campfire is now a visual doodad (fv_campfire.png)
        // This keeps the village purely decorative and allows existing campfires to work
    ]
}

/// Get monument placeables for the Whale Bone Graveyard monument
pub fn get_whale_bone_graveyard_placeables() -> Vec<MonumentPlaceableConfig> {
    vec![
        // Single campfire near the hermit's hut (which is now at center 0, 0)
        // Placed slightly in front and to the right of the hut for player access
        MonumentPlaceableConfig::campfire(80.0, 120.0),
    ]
}

/// Get monument placeables for the Hunting Village monument
/// Provides a functional campfire for cooking and warmth
pub fn get_hunting_village_placeables() -> Vec<MonumentPlaceableConfig> {
    vec![
        // No functional placeables - the campfire is a visual doodad (fv_campfire.png)
        // like Fishing Village. The visual campfire provides cozy effect via zone check.
        // If functional campfire is desired later, uncomment below:
        // MonumentPlaceableConfig::campfire(0.0, 250.0), // South of lodge
    ]
}

/// Get monument placeables for Hot Springs
/// A cozy campfire on the beach near the hot spring pool adds atmosphere
pub fn get_hot_spring_placeables() -> Vec<MonumentPlaceableConfig> {
    vec![
        // Single campfire on the beach, offset from the hot spring center
        // Hot springs have ~7-9 tile radius (336-432px), so we need 450+ px offset
        // to place the campfire on the beach outside the water pool
        MonumentPlaceableConfig::campfire(480.0, -100.0),
    ]
}

/// Hunting Village-specific harvestable resource configuration
/// Spawns wood piles and hunting-related resources around the village
pub fn get_hunting_village_harvestables() -> Vec<MonumentHarvestableConfig> {
    vec![
        // Wood pile - forest resources near the village
        MonumentHarvestableConfig {
            plant_type: crate::plants_database::PlantType::StonePile,
            spawn_chance: 0.50, // 50% per part
            min_distance: 80.0,
            max_distance: 200.0,
        },
    ]
}

/// Spawn monument placeables at the given monument center position
/// Uses a sentinel identity for placed_by to indicate system-placed
pub fn spawn_monument_placeables(
    ctx: &ReducerContext,
    monument_name: &str,
    monument_center_x: f32,
    monument_center_y: f32,
    configs: &[MonumentPlaceableConfig],
) -> Result<u32, String> {
    let mut spawned_count = 0u32;
    let current_time = ctx.timestamp;
    
    // Use module identity as the "owner" of monument placeables
    let monument_owner = ctx.identity();
    
    for config in configs {
        let world_x = monument_center_x + config.offset_x;
        let world_y = monument_center_y + config.offset_y;
        let chunk_idx = calculate_chunk_index(world_x, world_y);
        
        match config.placeable_type {
            MonumentPlaceableType::Campfire => {
                let campfire = Campfire {
                    id: 0, // Auto-increment
                    pos_x: world_x,
                    pos_y: world_y + 42.0, // Same Y offset as player-placed
                    chunk_index: chunk_idx,
                    placed_by: monument_owner,
                    placed_at: current_time,
                    is_burning: false,
                    slot_instance_id_0: None, slot_def_id_0: None,
                    slot_instance_id_1: None, slot_def_id_1: None,
                    slot_instance_id_2: None, slot_def_id_2: None,
                    slot_instance_id_3: None, slot_def_id_3: None,
                    slot_instance_id_4: None, slot_def_id_4: None,
                    current_fuel_def_id: None,
                    remaining_fuel_burn_time_secs: None,
                    health: CAMPFIRE_INITIAL_HEALTH,
                    max_health: CAMPFIRE_MAX_HEALTH,
                    is_destroyed: false,
                    destroyed_at: None,
                    last_hit_time: None,
                    last_damaged_by: None,
                    slot_0_cooking_progress: None,
                    slot_1_cooking_progress: None,
                    slot_2_cooking_progress: None,
                    slot_3_cooking_progress: None,
                    slot_4_cooking_progress: None,
                    last_damage_application_time: None,
                    is_player_in_hot_zone: false,
                    attached_broth_pot_id: None,
                    // Mark as monument placeable
                    is_monument: true,
                    active_user_id: None,
                    active_user_since: None,
                };
                
                match ctx.db.campfire().try_insert(campfire) {
                    Ok(inserted) => {
                        spawned_count += 1;
                        log::info!("[MonumentPlaceables] Spawned monument campfire {} at ({:.1}, {:.1}) for {}", 
                            inserted.id, world_x, world_y, monument_name);
                    }
                    Err(e) => {
                        log::warn!("[MonumentPlaceables] Failed to spawn campfire at ({:.1}, {:.1}): {}", 
                            world_x, world_y, e);
                    }
                }
            }
            
            MonumentPlaceableType::Furnace => {
                let furnace = Furnace {
                    id: 0,
                    pos_x: world_x,
                    pos_y: world_y + 42.0, // Same Y offset as player-placed
                    chunk_index: chunk_idx,
                    placed_by: monument_owner,
                    placed_at: current_time,
                    is_burning: false,
                    slot_instance_id_0: None, slot_def_id_0: None,
                    slot_instance_id_1: None, slot_def_id_1: None,
                    slot_instance_id_2: None, slot_def_id_2: None,
                    slot_instance_id_3: None, slot_def_id_3: None,
                    slot_instance_id_4: None, slot_def_id_4: None,
                    current_fuel_def_id: None,
                    remaining_fuel_burn_time_secs: None,
                    health: FURNACE_INITIAL_HEALTH,
                    max_health: FURNACE_MAX_HEALTH,
                    is_destroyed: false,
                    destroyed_at: None,
                    last_hit_time: None,
                    last_damaged_by: None,
                    slot_0_cooking_progress: None,
                    slot_1_cooking_progress: None,
                    slot_2_cooking_progress: None,
                    slot_3_cooking_progress: None,
                    slot_4_cooking_progress: None,
                    // Mark as monument placeable
                    is_monument: true,
                    active_user_id: None,
                    active_user_since: None,
                };
                
                match ctx.db.furnace().try_insert(furnace) {
                    Ok(inserted) => {
                        spawned_count += 1;
                        log::info!("[MonumentPlaceables] Spawned monument furnace {} at ({:.1}, {:.1}) for {}", 
                            inserted.id, world_x, world_y, monument_name);
                    }
                    Err(e) => {
                        log::warn!("[MonumentPlaceables] Failed to spawn furnace at ({:.1}, {:.1}): {}", 
                            world_x, world_y, e);
                    }
                }
            }
            
            MonumentPlaceableType::RainCollector => {
                let collector = RainCollector {
                    id: 0,
                    pos_x: world_x,
                    pos_y: world_y,
                    chunk_index: chunk_idx,
                    placed_by: monument_owner,
                    placed_at: current_time,
                    slot_0_instance_id: None,
                    slot_0_def_id: None,
                    health: RAIN_COLLECTOR_INITIAL_HEALTH,
                    max_health: RAIN_COLLECTOR_MAX_HEALTH,
                    is_destroyed: false,
                    destroyed_at: None,
                    last_hit_time: None,
                    last_damaged_by: None,
                    total_water_collected: 0.0,
                    last_collection_time: None,
                    is_salt_water: false,
                    // Mark as monument placeable
                    is_monument: true,
                    active_user_id: None,
                    active_user_since: None,
                };
                
                match ctx.db.rain_collector().try_insert(collector) {
                    Ok(inserted) => {
                        spawned_count += 1;
                        log::info!("[MonumentPlaceables] Spawned monument rain collector {} at ({:.1}, {:.1}) for {}", 
                            inserted.id, world_x, world_y, monument_name);
                    }
                    Err(e) => {
                        log::warn!("[MonumentPlaceables] Failed to spawn rain collector at ({:.1}, {:.1}): {}", 
                            world_x, world_y, e);
                    }
                }
            }
            
            MonumentPlaceableType::Lantern => {
                let lantern = Lantern {
                    id: 0, // Auto-increment
                    pos_x: world_x,
                    pos_y: world_y + 32.0, // Same Y offset as player-placed
                    chunk_index: chunk_idx,
                    placed_by: monument_owner,
                    placed_at: current_time,
                    is_burning: false,
                    fuel_instance_id_0: None,
                    fuel_def_id_0: None,
                    current_fuel_def_id: None,
                    remaining_fuel_burn_time_secs: None,
                    health: LANTERN_INITIAL_HEALTH,
                    max_health: LANTERN_MAX_HEALTH,
                    is_destroyed: false,
                    destroyed_at: None,
                    last_hit_time: None,
                    last_damaged_by: None,
                    is_monument: true, // Mark as monument placeable
                    lantern_type: 0, // Regular lantern (not a ward)
                };
                
                match ctx.db.lantern().try_insert(lantern) {
                    Ok(inserted) => {
                        spawned_count += 1;
                        log::info!("[MonumentPlaceables] Spawned monument lantern {} at ({:.1}, {:.1}) for {}", 
                            inserted.id, world_x, world_y, monument_name);
                    }
                    Err(e) => {
                        log::warn!("[MonumentPlaceables] Failed to spawn lantern at ({:.1}, {:.1}): {}", 
                            world_x, world_y, e);
                    }
                }
            }
            
            MonumentPlaceableType::CookingStation => {
                let cooking_station = WoodenStorageBox {
                    id: 0,
                    pos_x: world_x,
                    pos_y: world_y + BOX_COLLISION_Y_OFFSET,
                    chunk_index: chunk_idx,
                    placed_by: monument_owner,
                    box_type: BOX_TYPE_COOKING_STATION,
                    slot_instance_id_0: None, slot_def_id_0: None,
                    slot_instance_id_1: None, slot_def_id_1: None,
                    slot_instance_id_2: None, slot_def_id_2: None,
                    slot_instance_id_3: None, slot_def_id_3: None,
                    slot_instance_id_4: None, slot_def_id_4: None,
                    slot_instance_id_5: None, slot_def_id_5: None,
                    slot_instance_id_6: None, slot_def_id_6: None,
                    slot_instance_id_7: None, slot_def_id_7: None,
                    slot_instance_id_8: None, slot_def_id_8: None,
                    slot_instance_id_9: None, slot_def_id_9: None,
                    slot_instance_id_10: None, slot_def_id_10: None,
                    slot_instance_id_11: None, slot_def_id_11: None,
                    slot_instance_id_12: None, slot_def_id_12: None,
                    slot_instance_id_13: None, slot_def_id_13: None,
                    slot_instance_id_14: None, slot_def_id_14: None,
                    slot_instance_id_15: None, slot_def_id_15: None,
                    slot_instance_id_16: None, slot_def_id_16: None,
                    slot_instance_id_17: None, slot_def_id_17: None,
                    slot_instance_id_18: None, slot_def_id_18: None,
                    slot_instance_id_19: None, slot_def_id_19: None,
                    slot_instance_id_20: None, slot_def_id_20: None,
                    slot_instance_id_21: None, slot_def_id_21: None,
                    slot_instance_id_22: None, slot_def_id_22: None,
                    slot_instance_id_23: None, slot_def_id_23: None,
                    slot_instance_id_24: None, slot_def_id_24: None,
                    slot_instance_id_25: None, slot_def_id_25: None,
                    slot_instance_id_26: None, slot_def_id_26: None,
                    slot_instance_id_27: None, slot_def_id_27: None,
                    slot_instance_id_28: None, slot_def_id_28: None,
                    slot_instance_id_29: None, slot_def_id_29: None,
                    slot_instance_id_30: None, slot_def_id_30: None,
                    slot_instance_id_31: None, slot_def_id_31: None,
                    slot_instance_id_32: None, slot_def_id_32: None,
                    slot_instance_id_33: None, slot_def_id_33: None,
                    slot_instance_id_34: None, slot_def_id_34: None,
                    slot_instance_id_35: None, slot_def_id_35: None,
                    slot_instance_id_36: None, slot_def_id_36: None,
                    slot_instance_id_37: None, slot_def_id_37: None,
                    slot_instance_id_38: None, slot_def_id_38: None,
                    slot_instance_id_39: None, slot_def_id_39: None,
                    slot_instance_id_40: None, slot_def_id_40: None,
                    slot_instance_id_41: None, slot_def_id_41: None,
                    slot_instance_id_42: None, slot_def_id_42: None,
                    slot_instance_id_43: None, slot_def_id_43: None,
                    slot_instance_id_44: None, slot_def_id_44: None,
                    slot_instance_id_45: None, slot_def_id_45: None,
                    slot_instance_id_46: None, slot_def_id_46: None,
                    slot_instance_id_47: None, slot_def_id_47: None,
                    health: COOKING_STATION_INITIAL_HEALTH,
                    max_health: COOKING_STATION_MAX_HEALTH,
                    is_destroyed: false,
                    destroyed_at: None,
                    last_hit_time: None,
                    last_damaged_by: None,
                    respawn_at: Timestamp::UNIX_EPOCH, // 0 = not respawning (monument placeables don't respawn)
                    // Mark as monument placeable
                    is_monument: true,
                    active_user_id: None,
                    active_user_since: None,
                };
                
                match ctx.db.wooden_storage_box().try_insert(cooking_station) {
                    Ok(inserted) => {
                        spawned_count += 1;
                        log::info!("[MonumentPlaceables] Spawned monument cooking station {} at ({:.1}, {:.1}) for {}", 
                            inserted.id, world_x, world_y, monument_name);
                    }
                    Err(e) => {
                        log::warn!("[MonumentPlaceables] Failed to spawn cooking station at ({:.1}, {:.1}): {}", 
                            world_x, world_y, e);
                    }
                }
            }
            
            MonumentPlaceableType::RepairBench => {
                let repair_bench = WoodenStorageBox {
                    id: 0,
                    pos_x: world_x,
                    pos_y: world_y + BOX_COLLISION_Y_OFFSET,
                    chunk_index: chunk_idx,
                    placed_by: monument_owner,
                    box_type: BOX_TYPE_REPAIR_BENCH,
                    slot_instance_id_0: None, slot_def_id_0: None,
                    slot_instance_id_1: None, slot_def_id_1: None,
                    slot_instance_id_2: None, slot_def_id_2: None,
                    slot_instance_id_3: None, slot_def_id_3: None,
                    slot_instance_id_4: None, slot_def_id_4: None,
                    slot_instance_id_5: None, slot_def_id_5: None,
                    slot_instance_id_6: None, slot_def_id_6: None,
                    slot_instance_id_7: None, slot_def_id_7: None,
                    slot_instance_id_8: None, slot_def_id_8: None,
                    slot_instance_id_9: None, slot_def_id_9: None,
                    slot_instance_id_10: None, slot_def_id_10: None,
                    slot_instance_id_11: None, slot_def_id_11: None,
                    slot_instance_id_12: None, slot_def_id_12: None,
                    slot_instance_id_13: None, slot_def_id_13: None,
                    slot_instance_id_14: None, slot_def_id_14: None,
                    slot_instance_id_15: None, slot_def_id_15: None,
                    slot_instance_id_16: None, slot_def_id_16: None,
                    slot_instance_id_17: None, slot_def_id_17: None,
                    slot_instance_id_18: None, slot_def_id_18: None,
                    slot_instance_id_19: None, slot_def_id_19: None,
                    slot_instance_id_20: None, slot_def_id_20: None,
                    slot_instance_id_21: None, slot_def_id_21: None,
                    slot_instance_id_22: None, slot_def_id_22: None,
                    slot_instance_id_23: None, slot_def_id_23: None,
                    slot_instance_id_24: None, slot_def_id_24: None,
                    slot_instance_id_25: None, slot_def_id_25: None,
                    slot_instance_id_26: None, slot_def_id_26: None,
                    slot_instance_id_27: None, slot_def_id_27: None,
                    slot_instance_id_28: None, slot_def_id_28: None,
                    slot_instance_id_29: None, slot_def_id_29: None,
                    slot_instance_id_30: None, slot_def_id_30: None,
                    slot_instance_id_31: None, slot_def_id_31: None,
                    slot_instance_id_32: None, slot_def_id_32: None,
                    slot_instance_id_33: None, slot_def_id_33: None,
                    slot_instance_id_34: None, slot_def_id_34: None,
                    slot_instance_id_35: None, slot_def_id_35: None,
                    slot_instance_id_36: None, slot_def_id_36: None,
                    slot_instance_id_37: None, slot_def_id_37: None,
                    slot_instance_id_38: None, slot_def_id_38: None,
                    slot_instance_id_39: None, slot_def_id_39: None,
                    slot_instance_id_40: None, slot_def_id_40: None,
                    slot_instance_id_41: None, slot_def_id_41: None,
                    slot_instance_id_42: None, slot_def_id_42: None,
                    slot_instance_id_43: None, slot_def_id_43: None,
                    slot_instance_id_44: None, slot_def_id_44: None,
                    slot_instance_id_45: None, slot_def_id_45: None,
                    slot_instance_id_46: None, slot_def_id_46: None,
                    slot_instance_id_47: None, slot_def_id_47: None,
                    health: REPAIR_BENCH_INITIAL_HEALTH,
                    max_health: REPAIR_BENCH_MAX_HEALTH,
                    is_destroyed: false,
                    destroyed_at: None,
                    last_hit_time: None,
                    last_damaged_by: None,
                    respawn_at: Timestamp::UNIX_EPOCH, // 0 = not respawning (monument placeables don't respawn)
                    // Mark as monument placeable
                    is_monument: true,
                    active_user_id: None,
                    active_user_since: None,
                };
                
                match ctx.db.wooden_storage_box().try_insert(repair_bench) {
                    Ok(inserted) => {
                        spawned_count += 1;
                        log::info!("[MonumentPlaceables] Spawned monument repair bench {} at ({:.1}, {:.1}) for {}", 
                            inserted.id, world_x, world_y, monument_name);
                    }
                    Err(e) => {
                        log::warn!("[MonumentPlaceables] Failed to spawn repair bench at ({:.1}, {:.1}): {}", 
                            world_x, world_y, e);
                    }
                }
            }
        }
    }
    
    log::info!("[MonumentPlaceables] Spawned {} placeables for {} at ({:.1}, {:.1})", 
        spawned_count, monument_name, monument_center_x, monument_center_y);
    
    Ok(spawned_count)
}

// =============================================================================
// REED MARSH RESOURCE SPAWNING
// =============================================================================

/// Spawns reeds, water barrels, and memory shards around reed marsh centers
/// Reed marshes are natural wetland areas - great for farming reeds, barrels, memory shards, and hunting terns
pub fn spawn_reed_marsh_resources(ctx: &ReducerContext) -> Result<(), String> {
    use crate::reed_marsh as ReedMarshTableTrait;
    use crate::barrel::{Barrel, BARREL_INITIAL_HEALTH, SEA_BARREL_VARIANT_START, SEA_BARREL_VARIANT_END};
    use crate::harvestable_resource::{HarvestableResource, create_harvestable_resource};
    use crate::plants_database::PlantType;
    use crate::environment::calculate_chunk_index;
    
    // Collect marsh data first to avoid borrow issues
    let marsh_data: Vec<(f32, f32, f32)> = ctx.db.reed_marsh()
        .iter()
        .map(|m| (m.world_x, m.world_y, m.radius_px))
        .collect();
    
    if marsh_data.is_empty() {
        log::info!("[ReedMarsh] No reed marshes found to spawn resources in");
        return Ok(());
    }
    
    let mut total_reeds = 0;
    let mut total_barrels = 0;
    let mut total_shards = 0;
    
    for (marsh_x, marsh_y, radius_px) in &marsh_data {
        let mut marsh_reeds = 0;
        let mut marsh_barrels = 0;
        let mut marsh_shards = 0;
        
        // Spawn reeds (main resource) - 5-8 reed plants per marsh
        // Reeds grow along the marshy edges of rivers and lakes
        let reed_count = ctx.rng().gen_range(5..=8);
        for _ in 0..reed_count {
            let angle = ctx.rng().gen::<f32>() * std::f32::consts::PI * 2.0;
            let distance = ctx.rng().gen_range(30.0..*radius_px);
            let spawn_x = marsh_x + angle.cos() * distance;
            let spawn_y = marsh_y + angle.sin() * distance;
            
            let chunk_idx = calculate_chunk_index(spawn_x, spawn_y);
            
            let reed = create_harvestable_resource(
                PlantType::Reed,
                spawn_x,
                spawn_y,
                chunk_idx,
                false // Not player planted
            );
            
            ctx.db.harvestable_resource().insert(reed);
            marsh_reeds += 1;
        }
        
        // Spawn water barrels (1-2 per marsh) - washed up cargo and flotsam
        let barrel_count = ctx.rng().gen_range(1..=2);
        for _ in 0..barrel_count {
            let angle = ctx.rng().gen::<f32>() * std::f32::consts::PI * 2.0;
            let distance = ctx.rng().gen_range(50.0..*radius_px * 0.9);
            let spawn_x = marsh_x + angle.cos() * distance;
            let spawn_y = marsh_y + angle.sin() * distance;
            
            let chunk_idx = calculate_chunk_index(spawn_x, spawn_y);
            // Use sea barrel variants (washed up look)
            let variant = ctx.rng().gen_range(SEA_BARREL_VARIANT_START..SEA_BARREL_VARIANT_END);
            
            let barrel = Barrel {
                id: 0, // auto_inc
                pos_x: spawn_x,
                pos_y: spawn_y,
                chunk_index: chunk_idx,
                health: BARREL_INITIAL_HEALTH,
                variant,
                last_hit_time: None,
                respawn_at: spacetimedb::Timestamp::UNIX_EPOCH, // 0 = not respawning
                cluster_id: 0, // Reed marsh barrels don't belong to a cluster
            };
            
            ctx.db.barrel().insert(barrel);
            marsh_barrels += 1;
        }
        
        // Spawn memory shards (50% chance for 1 shard per marsh)
        // Debris washed up from the crashed ship finds its way to these wetlands
        if ctx.rng().gen::<f32>() < 0.50 {
            let angle = ctx.rng().gen::<f32>() * std::f32::consts::PI * 2.0;
            let distance = ctx.rng().gen_range(40.0..*radius_px * 0.85);
            let spawn_x = marsh_x + angle.cos() * distance;
            let spawn_y = marsh_y + angle.sin() * distance;
            
            let chunk_idx = calculate_chunk_index(spawn_x, spawn_y);
            
            let shard = create_harvestable_resource(
                PlantType::MemoryShard,
                spawn_x,
                spawn_y,
                chunk_idx,
                false // Not player planted
            );
            
            ctx.db.harvestable_resource().insert(shard);
            marsh_shards += 1;
        }
        
        log::debug!("🌾 [ReedMarsh] ({:.0}, {:.0}): {} reeds, {} barrels, {} shards",
                   marsh_x, marsh_y, marsh_reeds, marsh_barrels, marsh_shards);
        
        total_reeds += marsh_reeds;
        total_barrels += marsh_barrels;
        total_shards += marsh_shards;
    }
    
    log::info!("🌾 [ReedMarsh] Total spawned: {} reeds, {} barrels, {} memory shards across {} marshes",
               total_reeds, total_barrels, total_shards, marsh_data.len());
    
    Ok(())
}

