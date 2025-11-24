use spacetimedb::{ReducerContext, Table, Timestamp, Identity};
use noise::{NoiseFn, Perlin, Seedable};
use log;
use crate::{WorldTile, TileType, WorldGenConfig, MinimapCache, WORLD_WIDTH_TILES, WORLD_HEIGHT_TILES};

// Import the table trait
use crate::world_tile as WorldTileTableTrait;
use crate::minimap_cache as MinimapCacheTableTrait;
use crate::world_chunk_data as WorldChunkDataTableTrait;

use rand::{Rng, SeedableRng};
use rand::rngs::StdRng;
use std::collections::HashMap;

// --- Hot Spring Constants (moved from hot_spring.rs) ---
/// Base density for 600x600 map (360k tiles²) = 4 hot springs (increased for better visibility)
const HOT_SPRING_BASE_COUNT: u32 = 4;
// Use actual world size from lib.rs for base area calculation
const HOT_SPRING_BASE_AREA_TILES: f32 = (crate::WORLD_WIDTH_TILES * crate::WORLD_HEIGHT_TILES) as f32; // 600x600 = 360k tiles

// --- Quarry Constants ---
/// Base density for 600x600 map (360k tiles²) = 2 large quarries (north)
const QUARRY_LARGE_BASE_COUNT: u32 = 2; // 2 large quarries for 600x600 map
/// Base density for 600x600 map = 4 small quarries (south)
const QUARRY_SMALL_BASE_COUNT: u32 = 4; // 4 small quarries on south side for 600x600 map
// Use actual world size from lib.rs for base area calculation
const QUARRY_BASE_AREA_TILES: f32 = (crate::WORLD_WIDTH_TILES * crate::WORLD_HEIGHT_TILES) as f32; // 600x600 = 360k tiles
// Large quarries (north/central)
const QUARRY_LARGE_MIN_RADIUS_TILES: i32 = 18;
const QUARRY_LARGE_MAX_RADIUS_TILES: i32 = 25;
// Small quarries (south - for PvP/warmth)
const QUARRY_SMALL_MIN_RADIUS_TILES: i32 = 9;  // Half size
const QUARRY_SMALL_MAX_RADIUS_TILES: i32 = 12; // Half size
const MIN_QUARRY_DISTANCE: f32 = 120.0; // Minimum distance between large quarries
const MIN_SMALL_QUARRY_DISTANCE: f32 = 60.0; // Minimum distance between small quarries
const MIN_QUARRY_TO_HOT_SPRING_DISTANCE: f32 = 80.0; // Keep quarries away from hot springs

#[spacetimedb::reducer]
pub fn generate_world(ctx: &ReducerContext, config: WorldGenConfig) -> Result<(), String> {
    log::info!(
        "Starting world generation with seed {} ({}x{} tiles, {} chunk size)",
        config.seed, config.world_width_tiles, config.world_height_tiles, config.chunk_size
    );

    // TEMPORARILY REMOVED: Security check for testing
    // if ctx.sender != ctx.identity() {
    //     return Err("Only server can generate world".to_string());
    // }
    
    // Clear existing tiles
    let deleted_count = ctx.db.world_tile().iter().count();
    if deleted_count > 0 {
        log::info!("Clearing {} existing world tiles", deleted_count);
        // Delete all existing tiles
        for tile in ctx.db.world_tile().iter() {
            ctx.db.world_tile().id().delete(&tile.id);
        }
    }
    
    // Use the seed to create reproducible noise
    let noise = Perlin::new(config.seed as u32);
    
    // Pre-generate all world features at once for consistency
    let world_features = generate_world_features(&config, &noise);
    
    // Generate world in chunks
    let chunks_x = (config.world_width_tiles + config.chunk_size - 1) / config.chunk_size;
    let chunks_y = (config.world_height_tiles + config.chunk_size - 1) / config.chunk_size;
    
    let mut total_tiles = 0;
    for chunk_y in 0..chunks_y as i32 {
        for chunk_x in 0..chunks_x as i32 {
            match generate_chunk(ctx, &config, &noise, &world_features, chunk_x, chunk_y) {
                Ok(tiles_in_chunk) => {
                    total_tiles += tiles_in_chunk;
                }
                Err(e) => {
                    log::error!("Failed to generate chunk ({}, {}): {}", chunk_x, chunk_y, e);
                    return Err(format!("Chunk generation failed: {}", e));
                }
            }
        }
    }

    log::info!("Base world generation complete. Generated {} tiles in {} chunks.", total_tiles, chunks_x * chunks_y);
    
    // REMOVED: Post-processing adjacency validation (was causing terrain artifacts)
    // The autotile system handles transitions properly, no need for strict adjacency rules
    
    // Sea stacks will be generated in environment.rs alongside trees and stones
    
    log::info!("World generation complete!");
    Ok(())
}

// Structure to hold pre-generated world features
struct WorldFeatures {
    heightmap: Vec<Vec<f64>>,
    shore_distance: Vec<Vec<f64>>,
    river_network: Vec<Vec<bool>>,
    lake_map: Vec<Vec<bool>>,
    road_network: Vec<Vec<bool>>,
    dirt_paths: Vec<Vec<bool>>,
    hot_spring_water: Vec<Vec<bool>>, // Hot spring water (inner pool)
    hot_spring_beach: Vec<Vec<bool>>, // Hot spring beach (shore)
    quarry_dirt: Vec<Vec<bool>>, // Quarry dirt areas (circular cleared zones)
    quarry_roads: Vec<Vec<bool>>, // Quarry access roads (dirt roads leading in)
    quarry_centers: Vec<(f32, f32, i32)>, // Quarry center positions (x, y, radius) for entity spawning
    width: usize,
    height: usize,
}

fn generate_world_features(config: &WorldGenConfig, noise: &Perlin) -> WorldFeatures {
    let width = config.world_width_tiles as usize;
    let height = config.world_height_tiles as usize;
    
    // Generate heightmap with multiple octaves for realistic terrain
    let mut heightmap = vec![vec![0.0; width]; height];
    for y in 0..height {
        for x in 0..width {
            let mut height_val = 0.0;
            let mut amplitude = 1.0;
            let mut frequency = 0.005;
            
            // Multiple octaves for realistic terrain
            for _ in 0..4 {
                height_val += noise.get([x as f64 * frequency, y as f64 * frequency]) * amplitude;
                amplitude *= 0.5;
                frequency *= 2.0;
            }
            heightmap[y][x] = height_val;
        }
    }
    
    // Generate wavy shore distance map
    let shore_distance = generate_wavy_shore_distance(config, noise, width, height);
    
    // Generate river network flowing to sea
    let river_network = generate_river_network(config, noise, &shore_distance, width, height);
    
    // Generate inland lakes
    let lake_map = generate_lakes(config, noise, &shore_distance, width, height);
    
    // Generate road network from corners to center
    let road_network = generate_road_network(config, noise, width, height);
    
    // Generate additional dirt paths
    let dirt_paths = generate_dirt_paths(config, noise, &road_network, width, height);
    
    // Generate hot spring locations (large water pools with beach shores)
    // Pass river and lake data to ensure hot springs don't spawn near ANY water
    let (hot_spring_water, hot_spring_beach) = generate_hot_springs(config, noise, &shore_distance, &river_network, &lake_map, width, height);
    
    // Generate quarry locations (dirt areas with enhanced stone spawning)
    // Pass hot spring data to ensure quarries don't spawn near hot springs
    let (quarry_dirt, quarry_roads, quarry_centers) = generate_quarries(config, noise, &shore_distance, &river_network, &lake_map, &hot_spring_water, &road_network, width, height);
    
    WorldFeatures {
        heightmap,
        shore_distance,
        river_network,
        lake_map,
        road_network,
        dirt_paths,
        hot_spring_water,
        hot_spring_beach,
        quarry_dirt,
        quarry_roads,
        quarry_centers,
        width,
        height,
    }
}

fn generate_scattered_islands(
    shore_distance: &mut Vec<Vec<f64>>, 
    noise: &Perlin, 
    width: usize, 
    height: usize, 
    base_island_radius: f64,
    center_x: f64,
    center_y: f64
) {
    log::info!("Generating a few scattered small islands throughout the sea (3-5 total)");
    
    // Generate only small islands (no mini/tiny - just 3-5 scattered islands)
    generate_island_layer(shore_distance, noise, width, height, base_island_radius, center_x, center_y,
                         base_island_radius * 0.12, // 12% of main island size - nice medium size
                         80.0, // Minimum distance from main island (stay well away)
                         80.0, // Large minimum distance between islands (spread them out)
                         0.015, // Much lower frequency for fewer placements
                         0.3,   // Very high threshold (much more selective)
                         4000.0); // Noise seed offset
}

fn generate_island_layer(
    shore_distance: &mut Vec<Vec<f64>>, 
    noise: &Perlin, 
    width: usize, 
    height: usize, 
    base_island_radius: f64,
    center_x: f64,
    center_y: f64,
    island_radius: f64,
    min_distance_from_main: f64,
    min_distance_between: f64,
    noise_frequency: f64,
    noise_threshold: f64,
    noise_seed: f64
) {
    let mut island_positions = Vec::new();
    
    // First pass: Find potential island positions using noise
    for y in 30..height-30 { // Stay away from edges
        for x in 30..width-30 {
            // Check if this point is in deep water (far from any existing land)
            if shore_distance[y][x] < -15.0 { // Deep water only
                let distance_from_main = ((x as f64 - center_x).powi(2) + (y as f64 - center_y).powi(2)).sqrt();
                
                // Check minimum distance from main island
                if distance_from_main > min_distance_from_main {
                    // Use noise to determine if an island should be here
                    let island_noise = noise.get([x as f64 * noise_frequency, y as f64 * noise_frequency, noise_seed]);
                    
                    if island_noise > noise_threshold {
                        // Check distance from other islands of this layer
                        let mut too_close = false;
                        for (other_x, other_y, _) in &island_positions {
                            let distance = ((x as f64 - other_x).powi(2) + (y as f64 - other_y).powi(2)).sqrt();
                            if distance < min_distance_between {
                                too_close = true;
                                break;
                            }
                        }
                        
                        if !too_close {
                            island_positions.push((x as f64, y as f64, island_radius));
                        }
                    }
                }
            }
        }
    }
    
    log::info!("Placing {} islands of radius {:.1}", island_positions.len(), island_radius);
    
    // Second pass: Actually create the islands
    for (island_x, island_y, radius) in island_positions {
        let search_radius = (radius + 5.0) as usize;
        
        for y in ((island_y as usize).saturating_sub(search_radius))..=((island_y as usize) + search_radius).min(height - 1) {
            for x in ((island_x as usize).saturating_sub(search_radius))..=((island_x as usize) + search_radius).min(width - 1) {
                let dx = x as f64 - island_x;
                let dy = y as f64 - island_y;
                let distance_from_island_center = (dx * dx + dy * dy).sqrt();
                
                // Add organic shape variation
                let shape_noise = noise.get([x as f64 * 0.08, y as f64 * 0.08, noise_seed + 1000.0]);
                let shape_variation = shape_noise * (radius * 0.3); // Vary shape by up to 30% of radius
                let adjusted_radius = radius + shape_variation;
                
                if distance_from_island_center < adjusted_radius {
                    // Only create island if this point is currently water
                    if shore_distance[y][x] < 0.0 {
                        // Create a smooth falloff from center to edge
                        let falloff = 1.0 - (distance_from_island_center / adjusted_radius);
                        let new_shore_distance = falloff * radius * 0.8; // Make it slightly smaller than the radius for natural look
                        
                        // Only update if this would create land or make existing land more prominent
                        if new_shore_distance > shore_distance[y][x] {
                            shore_distance[y][x] = new_shore_distance;
                        }
                    }
                }
            }
        }
    }
}

fn generate_wavy_shore_distance(config: &WorldGenConfig, noise: &Perlin, width: usize, height: usize) -> Vec<Vec<f64>> {
    let mut shore_distance = vec![vec![-100.0; width]; height]; // Start with deep water everywhere
    let center_x = width as f64 / 2.0;
    let center_y = height as f64 / 2.0;
    
    // Main island - back to original size
    let base_island_radius = (width.min(height) as f64 * 0.35).min(center_x.min(center_y) - 20.0); // Back to original 0.35
    
    // Generate main island
    for y in 0..height {
        for x in 0..width {
            let dx = x as f64 - center_x;
            let dy = y as f64 - center_y;
            let distance_from_center = (dx * dx + dy * dy).sqrt();
            
            // Create wavy shores using multiple noise functions
            let shore_noise1 = noise.get([x as f64 * 0.015, y as f64 * 0.015, 1000.0]);
            let shore_noise2 = noise.get([x as f64 * 0.008, y as f64 * 0.012, 2000.0]);
            let shore_noise3 = noise.get([x as f64 * 0.025, y as f64 * 0.025, 3000.0]);
            
            // Combine noise for realistic wavy shores
            let shore_variation = shore_noise1 * 18.0 + shore_noise2 * 30.0 + shore_noise3 * 10.0;
            let adjusted_radius = base_island_radius + shore_variation;
            
            // Distance from shore (negative = water, positive = land)
            shore_distance[y][x] = adjusted_radius - distance_from_center;
        }
    }
    
    // Add 2 separate islands in corners with proper water gaps
    let corner_positions = [
        (width / 5, height / 5),           // Top-left corner area (moved further from edge)
        (width * 4 / 5, height / 5),       // Top-right corner area  
        (width / 5, height * 4 / 5),       // Bottom-left corner area
        (width * 4 / 5, height * 4 / 5),   // Bottom-right corner area
    ];
    
    // Select 2 corners that won't overlap with main island
    let selected_corners = [
        corner_positions[(width + height) % 4],       
        corner_positions[(width + height + 2) % 4],   
    ];
    
    let secondary_island_radius = base_island_radius * 0.4; // Larger islands (40% of main)
    let min_separation_distance = base_island_radius * 0.6; // Reduced minimum distance to allow larger islands
    
    for (island_x, island_y) in selected_corners {
        // Check if this corner is far enough from main island
        let dist_from_main = ((island_x as f64 - center_x).powi(2) + (island_y as f64 - center_y).powi(2)).sqrt();
        
        if dist_from_main > min_separation_distance {
            for y in 0..height {
                for x in 0..width {
                    let dx = x as f64 - island_x as f64;
                    let dy = y as f64 - island_y as f64;
                    let distance_from_island_center = (dx * dx + dy * dy).sqrt();
                    
                    // Add wavy shores to secondary islands
                    let shore_noise = noise.get([x as f64 * 0.03, y as f64 * 0.03, (island_x + island_y) as f64]);
                    let island_variation = shore_noise * 8.0; // Smaller variation for smaller islands
                    let island_adjusted_radius = secondary_island_radius + island_variation;
                    
                    // Only create land if this point is close to THIS island AND far from main island
                    let island_shore_distance = island_adjusted_radius - distance_from_island_center;
                    let main_island_distance = ((x as f64 - center_x).powi(2) + (y as f64 - center_y).powi(2)).sqrt();
                    
                    // Only create secondary island land if:
                    // 1. Point is within secondary island radius
                    // 2. Point is far enough from main island center
                    if island_shore_distance > 0.0 && main_island_distance > base_island_radius + 20.0 {
                        shore_distance[y][x] = island_shore_distance;
                    }
                }
            }
        }
    }
    
    // Generate scattered small and mini islands throughout the sea
    generate_scattered_islands(&mut shore_distance, noise, width, height, base_island_radius, center_x, center_y);
    
    shore_distance
}

fn generate_river_network(config: &WorldGenConfig, noise: &Perlin, shore_distance: &[Vec<f64>], width: usize, height: usize) -> Vec<Vec<bool>> {
    let mut rivers = vec![vec![false; width]; height];
    
    if config.river_frequency <= 0.0 {
        log::info!("River frequency is 0, no rivers will be generated");
        return rivers;
    }
    
    log::info!("Generating clean main rivers with natural meanders (NO tributaries)");
    
    // Scale river parameters with map size - all rivers same width for consistency
            let map_scale = ((width * height) as f64 / (WORLD_WIDTH_TILES as f64 * WORLD_HEIGHT_TILES as f64)).sqrt();
    let river_width = (3.0 * map_scale).max(2.0) as i32; // Same width for all rivers
    
    // Generate ONLY 2 main rivers with beautiful meandering (avoiding center)
    // River 1: Flows from north highlands to southeast coast
    trace_highly_meandering_river(&mut rivers, noise, 
                      width / 2 - width / 8, height / 5,     // Start: North area
                      width * 4 / 5, height * 4 / 5,         // End: Southeast area
                      width, height, river_width, 1000);
    
    // River 2: Flows from northwest highlands to south coast
    trace_highly_meandering_river(&mut rivers, noise,
                      width / 4, height / 3,                 // Start: Northwest area  
                      width / 2 + width / 6, height * 5 / 6, // End: South area
                      width, height, river_width, 2000);
    
    // REMOVED: All tributary and distributary generation
    // NO MORE: generate_spaced_tributaries()
    // NO MORE: generate_spaced_distributaries()
    
    log::info!("Generated 2 clean main rivers with natural meanders (width: {})", river_width);
    
    rivers
}

// Helper function to check if a point is too close to the center compound
fn is_too_close_to_center_compound(x: usize, y: usize, width: usize, height: usize) -> bool {
    let center_x = width / 2;
    let center_y = height / 2;
    let compound_size = 8;
    let buffer = 25; // Stay well away from the compound
    
    let min_x = center_x.saturating_sub(compound_size + buffer);
    let max_x = (center_x + compound_size + buffer).min(width - 1);
    let min_y = center_y.saturating_sub(compound_size + buffer);
    let max_y = (center_y + compound_size + buffer).min(height - 1);
    
    x >= min_x && x <= max_x && y >= min_y && y <= max_y
}

fn trace_highly_meandering_river(rivers: &mut Vec<Vec<bool>>, noise: &Perlin, start_x: usize, start_y: usize, end_x: usize, end_y: usize, width: usize, height: usize, river_width: i32, noise_seed: i32) {
    let mut current_x = start_x as f64;
    let mut current_y = start_y as f64;
    
    let total_distance = ((end_x as f64 - start_x as f64).powi(2) + (end_y as f64 - start_y as f64).powi(2)).sqrt();
    let num_steps = (total_distance * 4.0) as usize; // Keep the high step count for smooth curves
    
    // Track our general flow direction but allow huge deviations
    let overall_dx = end_x as f64 - start_x as f64;
    let overall_dy = end_y as f64 - start_y as f64;
    
    for step in 0..num_steps {
        let progress = step as f64 / num_steps as f64;
        
        // LOOSE target guidance - much less direct than before
        let loose_target_x = start_x as f64 + overall_dx * progress;
        let loose_target_y = start_y as f64 + overall_dy * progress;
        
        // Create LARGE, flowing meanders with very low frequency noise for big curves
        let meander_scale1 = 0.0008; // Huge sweeping curves
        let meander_scale2 = 0.002;  // Large secondary curves
        let meander_scale3 = 0.006;  // Medium curves
        let meander_scale4 = 0.015;  // Fine detail
        
        // Multiple noise octaves for complex, natural meandering
        let noise1_x = noise.get([current_x * meander_scale1, current_y * meander_scale1, noise_seed as f64]);
        let noise1_y = noise.get([current_x * meander_scale1, current_y * meander_scale1, (noise_seed + 500) as f64]);
        
        let noise2_x = noise.get([current_x * meander_scale2, current_y * meander_scale2, (noise_seed + 1000) as f64]);
        let noise2_y = noise.get([current_x * meander_scale2, current_y * meander_scale2, (noise_seed + 1500) as f64]);
        
        let noise3_x = noise.get([current_x * meander_scale3, current_y * meander_scale3, (noise_seed + 2000) as f64]);
        let noise3_y = noise.get([current_x * meander_scale3, current_y * meander_scale3, (noise_seed + 2500) as f64]);
        
        let noise4_x = noise.get([current_x * meander_scale4, current_y * meander_scale4, (noise_seed + 3000) as f64]);
        let noise4_y = noise.get([current_x * meander_scale4, current_y * meander_scale4, (noise_seed + 3500) as f64]);
        
        // Create natural meandering but with CONTROLLED amplitudes to prevent gaps
        let meander_x = noise1_x * 25.0 + noise2_x * 15.0 + noise3_x * 8.0 + noise4_x * 3.0; // REDUCED: Still large but controlled (was 50.0 + 35.0 + 20.0 + 8.0)
        let meander_y = noise1_y * 25.0 + noise2_y * 15.0 + noise3_y * 8.0 + noise4_y * 3.0; // Prevents huge jumps
        
        // Add directional bias that changes over time for realistic river behavior
        let flow_bias = (progress * std::f64::consts::PI * 3.0).sin() * 8.0; // REDUCED: Still oscillating but controlled (was 15.0)
        let perpendicular_bias = (progress * std::f64::consts::PI * 2.5).cos() * 6.0; // REDUCED: Cross-flow (was 12.0)
        
        // Calculate flow direction with controlled meandering
        let flow_x = meander_x + flow_bias;
        let flow_y = meander_y + perpendicular_bias;
        
        // VERY loose guidance toward target - allow large deviations
        let target_pull_strength = 0.12; // SLIGHTLY INCREASED: Better connectivity (was 0.08)
        let target_pull_x = (loose_target_x - current_x) * target_pull_strength;
        let target_pull_y = (loose_target_y - current_y) * target_pull_strength;
        
        // Combine organic flow with minimal target guidance
        let desired_x = current_x + flow_x + target_pull_x;
        let desired_y = current_y + flow_y + target_pull_y;
        
        // CRITICAL FIX: Limit maximum step size to prevent gaps
        let max_step_size = 3.5; // ADDED: Maximum distance per step to ensure connectivity
        let step_dx = desired_x - current_x;
        let step_dy = desired_y - current_y;
        let step_distance = (step_dx * step_dx + step_dy * step_dy).sqrt();
        
        let (new_x, new_y) = if step_distance > max_step_size {
            // Scale down the step to maximum allowed size while preserving direction
            let scale = max_step_size / step_distance;
            (current_x + step_dx * scale, current_y + step_dy * scale)
        } else {
            (desired_x, desired_y)
        };
        
        // Check if new position is too close to center compound
        if is_too_close_to_center_compound(new_x as usize, new_y as usize, width, height) {
            // Add gentle repulsion force away from center
            let center_x = width as f64 / 2.0;
            let center_y = height as f64 / 2.0;
            let repulsion_strength = 25.0;
            
            let dx_from_center = new_x - center_x;
            let dy_from_center = new_y - center_y;
            let distance_from_center = (dx_from_center * dx_from_center + dy_from_center * dy_from_center).sqrt();
            
            if distance_from_center > 0.0 {
                let repulsion_x = (dx_from_center / distance_from_center) * repulsion_strength;
                let repulsion_y = (dy_from_center / distance_from_center) * repulsion_strength;
                
                current_x = new_x + repulsion_x;
                current_y = new_y + repulsion_y;
            } else {
                current_x = new_x + repulsion_strength;
                current_y = new_y + repulsion_strength;
            }
        } else {
            current_x = new_x;
            current_y = new_y;
        }
        
        // Keep within bounds with buffer
        current_x = current_x.max(25.0).min(width as f64 - 25.0);
        current_y = current_y.max(25.0).min(height as f64 - 25.0);
        
        // Stronger guidance in final 20% to ensure we reach target
        if progress > 0.8 {
            let final_guidance_strength = (progress - 0.8) * 0.6; // Gradually increase guidance
            let final_pull_x = (end_x as f64 - current_x) * final_guidance_strength;
            let final_pull_y = (end_y as f64 - current_y) * final_guidance_strength;
            current_x += final_pull_x;
            current_y += final_pull_y;
        }
        
        // Draw river with full width
        draw_river_segment(rivers, current_x as i32, current_y as i32, river_width, width, height);
    }
}

fn draw_river_segment(rivers: &mut Vec<Vec<bool>>, center_x: i32, center_y: i32, river_width: i32, width: usize, height: usize) {
    let radius = river_width;
    
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            let x = center_x + dx;
            let y = center_y + dy;
            
            // Check bounds
            if x >= 0 && y >= 0 && (x as usize) < width && (y as usize) < height {
                // Create natural river shape (circular with soft edges)
                let distance_sq = dx * dx + dy * dy;
                let radius_sq = radius * radius;
                
                if distance_sq <= radius_sq {
                    // Add some variation to river edges for natural look
                    let edge_factor = distance_sq as f64 / radius_sq as f64;
                    if edge_factor < 0.8 || (edge_factor < 1.0 && (x + y) % 3 != 0) {
                        rivers[y as usize][x as usize] = true;
                    }
                }
            }
        }
    }
}

fn generate_lakes(config: &WorldGenConfig, noise: &Perlin, shore_distance: &[Vec<f64>], width: usize, height: usize) -> Vec<Vec<bool>> {
    let mut lakes = vec![vec![false; width]; height];
    
    // Scale lake density with map size
    let map_scale = (width * height) as f64 / (WORLD_WIDTH_TILES as f64 * WORLD_HEIGHT_TILES as f64); // Relative to base map size
    let base_lake_density = 0.012; // Base sampling frequency for lakes
    let scaled_density = base_lake_density * map_scale.sqrt();
    
    // Generate lake centers in safe inland areas
    let mut lake_centers = Vec::new();
    
    // Multiple passes for different lake types and sizes
    // Pass 1: Large central lakes deep inland
    for y in 25..height-25 {
        for x in 25..width-25 {
            if shore_distance[y][x] > 40.0 { // Deep inland for large lakes
                let lake_noise = noise.get([x as f64 * scaled_density * 0.8, y as f64 * scaled_density * 0.8, 5000.0]);
                if lake_noise > 0.6 { // Higher threshold for large lakes
                    lake_centers.push((x, y, 2)); // Size type 2 = large
                }
            }
        }
    }
    
    // Pass 2: Medium lakes moderately inland  
    for y in 20..height-20 {
        for x in 20..width-20 {
            if shore_distance[y][x] > 25.0 { // Moderately inland
                let lake_noise = noise.get([x as f64 * scaled_density, y as f64 * scaled_density, 5500.0]);
                if lake_noise > 0.45 { // Medium threshold for medium lakes
                    lake_centers.push((x, y, 1)); // Size type 1 = medium
                }
            }
        }
    }
    
    // Pass 3: Small lakes closer to shore (like ponds)
    for y in 15..height-15 {
        for x in 15..width-15 {
            if shore_distance[y][x] > 18.0 { // Closer to shore
                let lake_noise = noise.get([x as f64 * scaled_density * 1.2, y as f64 * scaled_density * 1.2, 6000.0]);
                if lake_noise > 0.3 { // Lower threshold for small lakes
                    lake_centers.push((x, y, 0)); // Size type 0 = small
                }
            }
        }
    }
    
    // Scale total lake count with map size
    let max_lakes = (35.0 * map_scale) as usize; // Significantly increased from 12
    lake_centers.truncate(max_lakes);
    
    // Generate lakes around centers with size-based radius
    for (center_x, center_y, size_type) in lake_centers {
        let base_radius = match size_type {
            2 => 18.0, // Large lakes
            1 => 12.0, // Medium lakes  
            0 => 6.0,  // Small lakes/ponds
            _ => 8.0,  // Fallback
        };
        
        let lake_radius = base_radius + noise.get([center_x as f64 * 0.1, center_y as f64 * 0.1, 6000.0]) * (base_radius * 0.4);
        
        let search_radius = (lake_radius + 8.0) as usize;
        for y in (center_y.saturating_sub(search_radius))..=(center_y + search_radius).min(height - 1) {
            for x in (center_x.saturating_sub(search_radius))..=(center_x + search_radius).min(width - 1) {
                let dx = x as f64 - center_x as f64;
                let dy = y as f64 - center_y as f64;
                let distance = (dx * dx + dy * dy).sqrt();
                
                // Add organic shape variation
                let shape_noise = noise.get([x as f64 * 0.05, y as f64 * 0.05, 7000.0]);
                let adjusted_radius = lake_radius + shape_noise * (base_radius * 0.3);
                
                if distance < adjusted_radius {
                    lakes[y][x] = true;
                }
            }
        }
    }
    
    lakes
}

fn generate_road_network(config: &WorldGenConfig, noise: &Perlin, width: usize, height: usize) -> Vec<Vec<bool>> {
    let mut roads = vec![vec![false; width]; height];
    
    if config.road_density <= 0.0 {
        return roads;
    }
    
    let center_x = width / 2;
    let center_y = height / 2;
    let center_size = 8; // Size of central compound area
    
    // Create central compound (square area)
    for y in (center_y - center_size)..=(center_y + center_size) {
        for x in (center_x - center_size)..=(center_x + center_size) {
            if x < width && y < height {
                roads[y][x] = true;
            }
        }
    }
    
    // Roads from corners to center (the original cross pattern)
    let corners = [
        (20, 20),                    // Top-left
        (width - 21, 20),            // Top-right  
        (20, height - 21),           // Bottom-left
        (width - 21, height - 21),   // Bottom-right
    ];
    
    for (corner_x, corner_y) in corners {
        trace_road_to_center(&mut roads, corner_x, corner_y, center_x, center_y, width, height);
    }
    
    // Add ring road around the main island
    trace_ring_road(&mut roads, noise, center_x, center_y, width, height);
    
    roads
}

fn trace_road_to_center(roads: &mut Vec<Vec<bool>>, start_x: usize, start_y: usize, target_x: usize, target_y: usize, width: usize, height: usize) {
    let mut x = start_x as i32;
    let mut y = start_y as i32;
    let target_x = target_x as i32;
    let target_y = target_y as i32;
    
    // Helper function to safely mark road tiles
    let mut mark_road_tile = |px: i32, py: i32| {
        for dy_offset in -2..=2 {
            for dx_offset in -2..=2 {
                let road_x = px + dx_offset;
                let road_y = py + dy_offset;
                // Check bounds BEFORE casting to usize to avoid wrapping
                if road_x >= 0 && road_y >= 0 && road_x < width as i32 && road_y < height as i32 {
                    roads[road_y as usize][road_x as usize] = true;
                }
            }
        }
    };
    
    // Draw the starting position first
    mark_road_tile(x, y);
    
    // Simple pathfinding toward center - continue until we actually reach it
    while x != target_x || y != target_y {
        // Move toward target
        if (x - target_x).abs() > (y - target_y).abs() {
            x += if target_x > x { 1 } else { -1 };
        } else {
            y += if target_y > y { 1 } else { -1 };
        }
        
        // Mark road (with width - 5x5 for better coverage)
        mark_road_tile(x, y);
    }
    
    // Ensure final position is drawn
    mark_road_tile(target_x, target_y);
}

fn trace_ring_road(roads: &mut Vec<Vec<bool>>, noise: &Perlin, center_x: usize, center_y: usize, width: usize, height: usize) {
    let center_x_f = center_x as f64;
    let center_y_f = center_y as f64;
    
    // Calculate ring road radius - position it between the center and the island edge
    // The main island has radius of about 35% of map size, so place ring at about 60% to stay on land
    let base_ring_radius = (width.min(height) as f64 * 0.25).min(center_x_f.min(center_y_f) - 30.0);
    
    // Number of points around the circle - higher for smoother road
    let num_points = (base_ring_radius * 0.8) as usize; // Adjust density based on radius
    let angle_step = 2.0 * std::f64::consts::PI / num_points as f64;
    
    let mut ring_points = Vec::new();
    
    // Generate ring points with organic variation
    for i in 0..num_points {
        let base_angle = i as f64 * angle_step;
        
        // Add noise-based variation to make the ring more organic
        let noise_x = center_x_f + base_angle.cos() * 20.0;
        let noise_y = center_y_f + base_angle.sin() * 20.0;
        let radius_noise = noise.get([noise_x * 0.01, noise_y * 0.01, 8000.0]);
        let angle_noise = noise.get([noise_x * 0.015, noise_y * 0.015, 8500.0]);
        
        // Vary the radius and angle slightly for organic look
        let varied_radius = base_ring_radius + radius_noise * 15.0; // ±15 tile variation
        let varied_angle = base_angle + angle_noise * 0.3; // ±0.3 radian variation
        
        // Calculate point position
        let x = center_x_f + varied_angle.cos() * varied_radius;
        let y = center_y_f + varied_angle.sin() * varied_radius;
        
        // Ensure point is within bounds with some margin
        let x = x.max(25.0).min(width as f64 - 25.0);
        let y = y.max(25.0).min(height as f64 - 25.0);
        
        ring_points.push((x as i32, y as i32));
    }
    
    // Connect the ring points to form a continuous road
    for i in 0..ring_points.len() {
        let current = ring_points[i];
        let next = ring_points[(i + 1) % ring_points.len()]; // Wrap around to close the ring
        
        // Draw road segment between current and next point
        draw_road_segment_between_points(roads, current.0, current.1, next.0, next.1, width, height);
    }
    
    // Connect ring road to the main cross roads at strategic points
    connect_ring_to_cross_roads(roads, &ring_points, center_x, center_y, width, height);
}

fn draw_road_segment_between_points(roads: &mut Vec<Vec<bool>>, x1: i32, y1: i32, x2: i32, y2: i32, width: usize, height: usize) {
    // Use Bresenham's line algorithm to draw road between two points
    let dx = (x2 - x1).abs();
    let dy = (y2 - y1).abs();
    let sx = if x1 < x2 { 1 } else { -1 };
    let sy = if y1 < y2 { 1 } else { -1 };
    let mut err = dx - dy;
    
    let mut x = x1;
    let mut y = y1;
    
    // Helper function to safely mark road tiles
    let mut mark_road_tile = |px: i32, py: i32| {
        for dy_offset in -2..=2 {
            for dx_offset in -2..=2 {
                let road_x = px + dx_offset;
                let road_y = py + dy_offset;
                // Check bounds BEFORE casting to usize to avoid wrapping
                if road_x >= 0 && road_y >= 0 && road_x < width as i32 && road_y < height as i32 {
                    roads[road_y as usize][road_x as usize] = true;
                }
            }
        }
    };
    
    loop {
        // Draw road with width (5x5 for better coverage on diagonal roads)
        mark_road_tile(x, y);
        
        if x == x2 && y == y2 {
            break;
        }
        
        let e2 = 2 * err;
        if e2 > -dy {
            err -= dy;
            x += sx;
        }
        if e2 < dx {
            err += dx;
            y += sy;
        }
    }
    
    // Ensure final position is drawn
    mark_road_tile(x2, y2);
}

fn connect_ring_to_cross_roads(roads: &mut Vec<Vec<bool>>, ring_points: &[(i32, i32)], center_x: usize, center_y: usize, width: usize, height: usize) {
    // Find 4 connection points on the ring road that align roughly with the cross roads
    let quarter_points = ring_points.len() / 4;
    
    let connection_indices = [
        0,                           // North
        quarter_points,              // East  
        quarter_points * 2,          // South
        quarter_points * 3,          // West
    ];
    
    // Connect each quarter point to an intermediate point between ring and center
    for &idx in &connection_indices {
        if idx < ring_points.len() {
            let ring_point = ring_points[idx];
            
            // Calculate intermediate point (halfway between ring and center)
            let intermediate_x = (ring_point.0 + center_x as i32) / 2;
            let intermediate_y = (ring_point.1 + center_y as i32) / 2;
            
            // Draw connecting road from ring to intermediate point
            draw_road_segment_between_points(roads, ring_point.0, ring_point.1, intermediate_x, intermediate_y, width, height);
        }
    }
}

fn generate_dirt_paths(config: &WorldGenConfig, noise: &Perlin, road_network: &[Vec<bool>], width: usize, height: usize) -> Vec<Vec<bool>> {
    // DISABLED: No more dirt paths to prevent loops
    // Only keep the main cross-island roads (handled in road_network)
    vec![vec![false; width]; height]
}

fn generate_hot_springs(
    config: &WorldGenConfig, 
    noise: &Perlin, 
    shore_distance: &[Vec<f64>], 
    river_network: &[Vec<bool>],
    lake_map: &[Vec<bool>],
    width: usize, 
    height: usize
) -> (Vec<Vec<bool>>, Vec<Vec<bool>>) {
    let mut hot_spring_water = vec![vec![false; width]; height];
    let mut hot_spring_beach = vec![vec![false; width]; height];
    
    log::info!("🌊 GENERATING HOT SPRING WATER POOLS (960-1920px diameter = LARGE FEATURES!)...");
    log::info!("🌊 Map size: {}x{} tiles = {}x{}px (1 tile = 48px)", width, height, width * 48, height * 48);
    
    // Calculate how many hot springs to generate based on map size
    let map_area_tiles = (width * height) as f32;
    let scale_factor = (map_area_tiles / HOT_SPRING_BASE_AREA_TILES).sqrt();
    let target_hot_spring_count = ((HOT_SPRING_BASE_COUNT as f32) * scale_factor).round().max(2.0) as usize;
    
    log::info!("🌊 Target hot springs: {} (map: {}x{} tiles, scale factor: {:.2}x)", target_hot_spring_count, width, height, scale_factor);
    
    // Step 1: Collect candidate positions in TWO categories:
    // Category A: DEEP inland (for dense forest hot springs)
    // Category B: Moderately inland (for regular hot springs)
    let min_distance_from_edge = 25; // Increased from 15 - stay well away from edges
    let deep_inland_min_distance = 40.0; // DEEP inland for forest hot springs
    let moderate_inland_min_distance = 25.0; // Moderately inland for regular hot springs
    
    let mut deep_inland_positions = Vec::new();
    let mut moderate_inland_positions = Vec::new();
    
    for y in min_distance_from_edge..(height - min_distance_from_edge) {
        for x in min_distance_from_edge..(width - min_distance_from_edge) {
            let shore_dist = shore_distance[y][x];
            
            // Check if position is NOT adjacent to any water tiles (rivers, lakes, ocean)
            let is_adjacent_to_water = check_adjacent_water_with_features(
                shore_distance, 
                river_network, 
                lake_map, 
                x, 
                y, 
                width, 
                height
            );
            
            if !is_adjacent_to_water {
                // Deep inland - perfect for dense forest hot springs
                if shore_dist > deep_inland_min_distance {
                    deep_inland_positions.push((x, y));
                }
                // Moderately inland - for regular hot springs
                else if shore_dist > moderate_inland_min_distance {
                    moderate_inland_positions.push((x, y));
                }
            }
        }
    }
    
    log::info!("🌊 Found {} deep inland positions (forest hot springs)", deep_inland_positions.len());
    log::info!("🌊 Found {} moderate inland positions (regular hot springs)", moderate_inland_positions.len());
    
    if deep_inland_positions.is_empty() && moderate_inland_positions.is_empty() {
        log::error!("⚠️⚠️⚠️ NO VALID POSITIONS FOUND FOR HOT SPRINGS! ⚠️⚠️⚠️");
        log::error!("Map size: {}x{} tiles, min_distance_from_edge: {}", 
                   width, height, min_distance_from_edge);
        return (hot_spring_water, hot_spring_beach);
    }
    
    // Step 2: Select hot spring positions with GUARANTEED deep inland placement
    let mut hot_spring_centers = Vec::new();
    let min_distance_between = 100.0; // Good spacing between hot springs
    
    // PRIORITY 1: Place at least ONE hot spring in deep inland (dense forest area)
    if !deep_inland_positions.is_empty() {
        log::info!("🌊 Placing FOREST hot spring (deep inland)...");
        
        // Score deep inland positions by noise
        let mut deep_scores: Vec<(usize, f64)> = deep_inland_positions.iter()
            .enumerate()
            .map(|(idx, &(x, y))| {
                let noise_val = noise.get([x as f64 * 0.01, y as f64 * 0.01, 9000.0]);
                (idx, noise_val)
            })
            .collect();
        deep_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        
        // Place the first deep inland hot spring
        if let Some((idx, _)) = deep_scores.first() {
            let (x, y) = deep_inland_positions[*idx];
            
            // DOUBLE-CHECK: Verify this position is not near water (extra safety)
            let is_near_water = check_adjacent_water_with_features(
                shore_distance,
                river_network,
                lake_map,
                x,
                y,
                width,
                height
            );
            
            if !is_near_water {
                let radius_noise = noise.get([x as f64 * 0.05, y as f64 * 0.05, 9500.0]);
                let radius_tiles = (15.0 + radius_noise * 5.0) as i32;
                
                hot_spring_centers.push((x as f32, y as f32, radius_tiles));
                let world_x_px = (x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                let world_y_px = (y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                log::info!("🌊✨ PLACED FOREST HOT SPRING #1 at tile ({}, {}) = 📍 World Position: ({:.0}, {:.0}) with radius {} tiles ✨", 
                           x, y, world_x_px, world_y_px, radius_tiles);
            } else {
                log::warn!("🌊 First deep inland position was too close to water, will try others in main loop");
            }
        }
    }
    
    // PRIORITY 2: Fill remaining slots from both deep and moderate positions
    // Combine all remaining candidates
    let mut all_candidates = Vec::new();
    all_candidates.extend(deep_inland_positions.iter().map(|&pos| (pos, true))); // true = deep inland
    all_candidates.extend(moderate_inland_positions.iter().map(|&pos| (pos, false))); // false = moderate
    
    // Score all candidates
    let mut candidate_scores: Vec<(usize, f64, bool)> = all_candidates.iter()
        .enumerate()
        .map(|(idx, &((x, y), is_deep))| {
            let noise_val = noise.get([x as f64 * 0.01, y as f64 * 0.01, 9000.0]);
            (idx, noise_val, is_deep)
        })
        .collect();
    
    // Sort by noise score (highest first) for deterministic selection
    candidate_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    
    // Select remaining hot spring positions ensuring minimum distance
    let max_attempts = all_candidates.len().min(1000);
    let mut attempts = 0;
    
    for (candidate_idx, _score, is_deep) in &candidate_scores {
        if attempts >= max_attempts {
            log::warn!("🌊 Reached max attempts ({}) for hot spring placement", max_attempts);
            break;
        }
        attempts += 1;
        
        // Stop when we have enough hot springs
        if hot_spring_centers.len() >= target_hot_spring_count {
            break;
        }
        
        let ((x, y), _) = all_candidates[*candidate_idx];
        
        // Check distance from already placed hot springs
        let mut too_close = false;
        for (other_x, other_y, _) in &hot_spring_centers {
            let dx: f32 = x as f32 - *other_x;
            let dy: f32 = y as f32 - *other_y;
            let dist: f32 = (dx * dx + dy * dy).sqrt();
            if dist < min_distance_between {
                too_close = true;
                break;
            }
        }
        
        if !too_close {
            // DOUBLE-CHECK: Verify this position is still not near water (extra safety)
            let is_near_water = check_adjacent_water_with_features(
                shore_distance,
                river_network,
                lake_map,
                x,
                y,
                width,
                height
            );
            
            if is_near_water {
                // Skip this position - it's too close to water
                continue;
            }
            
            // Vary radius slightly using noise for organic look
            let radius_noise = noise.get([x as f64 * 0.05, y as f64 * 0.05, 9500.0]);
            let radius_tiles = (15.0 + radius_noise * 5.0) as i32; // 10-20 tiles radius
            
            hot_spring_centers.push((x as f32, y as f32, radius_tiles));
            let world_x_px = (x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
            let world_y_px = (y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
            let location_type = if *is_deep { "DEEP FOREST" } else { "INLAND" };
            log::info!("🌊✨ PLACED {} HOT SPRING #{} at tile ({}, {}) = 📍 World Position: ({:.0}, {:.0}) with radius {} tiles ✨", 
                       location_type, hot_spring_centers.len(), x, y, world_x_px, world_y_px, radius_tiles);
        }
    }
    
    log::info!("🌊 Hot spring placement complete: {} placed out of {} target", 
               hot_spring_centers.len(), target_hot_spring_count);
    
    // Log final summary with all hot spring positions for easy finding
    if hot_spring_centers.is_empty() {
        log::error!("⚠️⚠️⚠️ NO HOT SPRINGS WERE PLACED! ⚠️⚠️⚠️");
        log::error!("Map size: {}x{} tiles, min_distance_from_edge: {}", 
                   width, height, min_distance_from_edge);
        log::error!("Found {} deep inland and {} moderate inland positions but none met spacing requirements", 
                   deep_inland_positions.len(), moderate_inland_positions.len());
    } else {
        log::info!("🌊✨ HOT SPRING LOCATIONS SUMMARY ✨🌊");
        for (idx, (center_x, center_y, radius)) in hot_spring_centers.iter().enumerate() {
            let world_x_px = (*center_x + 0.5) * crate::TILE_SIZE_PX as f32;
            let world_y_px = (*center_y + 0.5) * crate::TILE_SIZE_PX as f32;
            log::info!("  #{}: Position ({:.0}, {:.0}) - Radius {} tiles ({}px diameter) - BRIGHT WHITE on minimap!", 
                       idx + 1, world_x_px, world_y_px, radius, radius * 2 * crate::TILE_SIZE_PX as i32);
        }
        log::info!("🌊 Look for BRIGHT WHITE/CYAN spots on your minimap - those are hot springs!");
    }
    
    // Now mark the hot spring areas in the map (water and beach layers)
    for (center_x, center_y, radius_tiles) in &hot_spring_centers {
        let center_x = *center_x as i32;
        let center_y = *center_y as i32;
        
        for dy in -*radius_tiles..=*radius_tiles {
            for dx in -*radius_tiles..=*radius_tiles {
                let tile_x = center_x + dx;
                let tile_y = center_y + dy;
                
                // Check bounds
                if tile_x < 0 || tile_y < 0 || tile_x >= width as i32 || tile_y >= height as i32 {
                    continue;
                }
                
                // Calculate distance from center
                let dist = ((dx * dx + dy * dy) as f32).sqrt();
                let dist_normalized = dist / *radius_tiles as f32;
                
                // Add organic noise
                let noise_val = noise.get([tile_x as f64 * 0.3, tile_y as f64 * 0.3]) as f32;
                let noise_offset = noise_val * 0.2;
                
                // Create concentric layers: inner water, outer beach (2-3 tiles wide)
                if dist_normalized < 0.7 + noise_offset * 0.5 {
                    // Inner water pool
                    hot_spring_water[tile_y as usize][tile_x as usize] = true;
                } else if dist_normalized < 1.0 + noise_offset {
                    // Outer beach shore (2-3 tiles wide)
                    hot_spring_beach[tile_y as usize][tile_x as usize] = true;
                }
            }
        }
    }
    
    log::info!("Generated {} hot spring pools with water and beach layers", hot_spring_centers.len());
    (hot_spring_water, hot_spring_beach)
}

fn generate_quarries(
    config: &WorldGenConfig,
    noise: &Perlin,
    shore_distance: &[Vec<f64>],
    river_network: &[Vec<bool>],
    lake_map: &[Vec<bool>],
    hot_spring_water: &[Vec<bool>],
    road_network: &[Vec<bool>],
    width: usize,
    height: usize
) -> (Vec<Vec<bool>>, Vec<Vec<bool>>, Vec<(f32, f32, i32)>) {
    let mut quarry_dirt = vec![vec![false; width]; height];
    let mut quarry_roads = vec![vec![false; width]; height];
    
    log::info!("🏔️ GENERATING QUARRIES (large northern + small southern PvP spots)...");
    log::info!("🏔️ Map size: {}x{} tiles = {}x{}px (1 tile = 48px)", width, height, width * 48, height * 48);
    
    // Calculate how many quarries to generate based on map size
    // Uses smooth mathematical scaling that works for all map sizes
    let map_area_tiles = (width * height) as f32;
    let scale_factor = (map_area_tiles / QUARRY_BASE_AREA_TILES).sqrt();
    
    // Smooth scaling formula: count = base * scale_factor^0.85
    // The exponent 0.85 creates a sublinear curve that:
    // - Scales down gracefully for small maps (doesn't go to 0 too quickly)
    // - Gives exactly the base count at 600x600 (scale_factor = 1.0)
    // - Scales up proportionally for large maps
    // Examples:
    // - 300x300 (scale=0.5): 2^0.85 * 0.5^0.85 = 1.1 large, 2.2 small
    // - 450x450 (scale=0.75): 2^0.85 * 0.75^0.85 = 1.5 large, 3.1 small
    // - 600x600 (scale=1.0): 2^0.85 * 1.0^0.85 = 2.0 large, 4.0 small ✓
    // - 800x800 (scale=1.33): 2^0.85 * 1.33^0.85 = 2.5 large, 5.0 small
    let target_large_quarry_count = ((QUARRY_LARGE_BASE_COUNT as f32) * scale_factor.powf(0.85))
        .round()
        .max(0.0) as usize;
    
    let target_small_quarry_count = ((QUARRY_SMALL_BASE_COUNT as f32) * scale_factor.powf(0.85))
        .round()
        .max(1.0) as usize; // Always at least 1 small quarry
    
    log::info!("🏔️ Target large quarries (north): {} | Target small quarries (south): {} (scale factor: {:.2}x)", 
               target_large_quarry_count, target_small_quarry_count, scale_factor);
    
    // Collect candidate positions separately for north and south regions
    let min_distance_from_edge = 25;
    let min_inland_distance = 30.0; // Stay well inland
    let map_height_half = height / 2;
    
    let mut candidate_positions_north = Vec::new();
    let mut candidate_positions_south = Vec::new();
    
    for y in min_distance_from_edge..(height - min_distance_from_edge) {
        for x in min_distance_from_edge..(width - min_distance_from_edge) {
            let shore_dist = shore_distance[y][x];
            
            // Must be inland
            if shore_dist < min_inland_distance {
                continue;
            }
            
            // Check if NOT adjacent to any water tiles (rivers, lakes, ocean, hot springs)
            let is_adjacent_to_water = check_adjacent_water_with_features(
                shore_distance,
                river_network,
                lake_map,
                x,
                y,
                width,
                height
            );
            
            if is_adjacent_to_water {
                continue;
            }
            
            // Check if NOT near hot springs
            if hot_spring_water[y][x] {
                continue;
            }
            
            // Check if NOT in central compound (avoid roads for large quarries only)
            // Small quarries can be near roads for accessibility
            let is_on_road = road_network[y][x];
            
            // Separate north and south candidates
            if y < map_height_half {
                // North half - large quarries, avoid roads
                if !is_on_road {
                    candidate_positions_north.push((x, y));
                }
            } else {
                // South half - small quarries, can be near roads
                candidate_positions_south.push((x, y));
            }
        }
    }
    
    log::info!("🏔️ Found {} candidate positions for LARGE quarries (north)", candidate_positions_north.len());
    log::info!("🏔️ Found {} candidate positions for SMALL quarries (south)", candidate_positions_south.len());
    
    if candidate_positions_north.is_empty() && candidate_positions_south.is_empty() {
        log::error!("⚠️⚠️⚠️ NO VALID POSITIONS FOUND FOR QUARRIES! ⚠️⚠️⚠️");
        return (quarry_dirt, quarry_roads, Vec::new());
    }
    
    // Select quarry positions with good spacing using proper RNG
    let mut quarry_centers = Vec::new();
    let mut rng = StdRng::seed_from_u64(config.seed);
    
    // PHASE 1: Place LARGE quarries in NORTH half
    log::info!("🏔️ PHASE 1: Placing {} LARGE quarries in NORTH half...", target_large_quarry_count);
    if !candidate_positions_north.is_empty() {
        for attempt in 0..(target_large_quarry_count * 20) {
            if quarry_centers.iter().filter(|(_, _, _, is_large)| *is_large).count() >= target_large_quarry_count {
                break;
            }
            
            // Pick a random candidate from north
            let idx = rng.gen_range(0..candidate_positions_north.len());
            let (x, y) = candidate_positions_north[idx];
            
            // Check distance from existing quarries
            let mut too_close = false;
            for (qx, qy, _, _) in &quarry_centers {
                let dx = x as f32 - qx;
                let dy = y as f32 - qy;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist < MIN_QUARRY_DISTANCE {
                    too_close = true;
                    break;
                }
            }
            
            if !too_close {
                // Vary radius slightly
                let radius_tiles = rng.gen_range(QUARRY_LARGE_MIN_RADIUS_TILES..=QUARRY_LARGE_MAX_RADIUS_TILES);
                
                quarry_centers.push((x as f32, y as f32, radius_tiles, true)); // true = large quarry
                let world_x_px = (x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                let world_y_px = (y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                log::info!("🏔️✨ PLACED LARGE QUARRY #{} at tile ({}, {}) = 📍 World Position: ({:.0}, {:.0}) with radius {} tiles ✨",
                           quarry_centers.iter().filter(|(_, _, _, is_large)| *is_large).count(), x, y, world_x_px, world_y_px, radius_tiles);
            }
        }
    }
    
    // PHASE 2: Place SMALL quarries in SOUTH half
    log::info!("🏔️ PHASE 2: Placing {} SMALL quarries in SOUTH half (PvP/warmth spots)...", target_small_quarry_count);
    if !candidate_positions_south.is_empty() {
        for attempt in 0..(target_small_quarry_count * 20) {
            if quarry_centers.iter().filter(|(_, _, _, is_large)| !*is_large).count() >= target_small_quarry_count {
                break;
            }
            
            // Pick a random candidate from south
            let idx = rng.gen_range(0..candidate_positions_south.len());
            let (x, y) = candidate_positions_south[idx];
            
            // Check distance from existing quarries (smaller minimum distance for small quarries)
            let mut too_close = false;
            for (qx, qy, _, other_is_large) in &quarry_centers {
                let dx = x as f32 - qx;
                let dy = y as f32 - qy;
                let dist = (dx * dx + dy * dy).sqrt();
                // Use smaller distance for small-to-small, larger for small-to-large
                let min_dist = if *other_is_large { MIN_QUARRY_DISTANCE } else { MIN_SMALL_QUARRY_DISTANCE };
                if dist < min_dist {
                    too_close = true;
                    break;
                }
            }
            
            if !too_close {
                // Vary radius slightly for small quarries
                let radius_tiles = rng.gen_range(QUARRY_SMALL_MIN_RADIUS_TILES..=QUARRY_SMALL_MAX_RADIUS_TILES);
                
                quarry_centers.push((x as f32, y as f32, radius_tiles, false)); // false = small quarry
                let world_x_px = (x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                let world_y_px = (y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                log::info!("🏔️✨ PLACED SMALL QUARRY #{} at tile ({}, {}) = 📍 World Position: ({:.0}, {:.0}) with radius {} tiles ✨",
                           quarry_centers.iter().filter(|(_, _, _, is_large)| !*is_large).count(), x, y, world_x_px, world_y_px, radius_tiles);
            }
        }
    }
    
    let large_count = quarry_centers.iter().filter(|(_, _, _, is_large)| *is_large).count();
    let small_count = quarry_centers.iter().filter(|(_, _, _, is_large)| !*is_large).count();
    log::info!("🏔️ Quarry placement complete: {} large (north) + {} small (south) = {} total",
               large_count, small_count, quarry_centers.len());
    
    // Log all quarry centers for easy navigation
    log::info!("🏔️ ========== QUARRY LOCATIONS ==========");
    for (idx, (center_x, center_y, radius_tiles, is_large)) in quarry_centers.iter().enumerate() {
        let world_x_px = (*center_x + 0.5) * crate::TILE_SIZE_PX as f32;
        let world_y_px = (*center_y + 0.5) * crate::TILE_SIZE_PX as f32;
        let quarry_type = if *is_large { "LARGE" } else { "SMALL" };
        log::info!("🏔️ QUARRY #{} ({}): World Position ({:.0}, {:.0}) | Radius: {} tiles", 
                   idx + 1, quarry_type, world_x_px, world_y_px, radius_tiles);
    }
    log::info!("🏔️ =======================================");
    
    // Convert quarry_centers to the format expected by environment.rs (without is_large flag)
    let quarry_centers_for_entities: Vec<(f32, f32, i32)> = quarry_centers.iter()
        .map(|(x, y, r, _)| (*x, *y, *r))
        .collect();
    
    // Mark the quarry areas in the map (dirt layers)
    for (center_x, center_y, radius_tiles, _) in &quarry_centers {
        let center_x = *center_x as i32;
        let center_y = *center_y as i32;
        
        // Create circular dirt area
        for dy in -*radius_tiles..=*radius_tiles {
            for dx in -*radius_tiles..=*radius_tiles {
                let tile_x = center_x + dx;
                let tile_y = center_y + dy;
                
                // Check bounds
                if tile_x < 0 || tile_y < 0 || tile_x >= width as i32 || tile_y >= height as i32 {
                    continue;
                }
                
                // Calculate distance from center
                let dist = ((dx * dx + dy * dy) as f32).sqrt();
                let dist_normalized = dist / *radius_tiles as f32;
                
                // Add organic noise
                let noise_val = noise.get([tile_x as f64 * 0.3, tile_y as f64 * 0.3]) as f32;
                let noise_offset = noise_val * 0.15;
                
                // Create dirt area (slightly irregular edge)
                if dist_normalized < 1.0 + noise_offset {
                    quarry_dirt[tile_y as usize][tile_x as usize] = true;
                }
            }
        }
        
        // Create dirt road leading to nearest main road
        create_quarry_access_road(&mut quarry_roads, road_network, center_x, center_y, *radius_tiles, width, height, noise);
    }
    
    log::info!("Generated {} quarries with dirt areas and access roads", quarry_centers_for_entities.len());
    (quarry_dirt, quarry_roads, quarry_centers_for_entities)
}

fn create_quarry_access_road(
    quarry_roads: &mut Vec<Vec<bool>>,
    road_network: &[Vec<bool>],
    quarry_x: i32,
    quarry_y: i32,
    quarry_radius: i32,
    width: usize,
    height: usize,
    noise: &Perlin
) {
    // Find nearest main road tile
    let mut nearest_road_pos: Option<(i32, i32)> = None;
    let mut nearest_dist_sq = f32::MAX;
    let search_radius = 100; // Search within 100 tiles
    
    for dy in -search_radius..=search_radius {
        for dx in -search_radius..=search_radius {
            let check_x = quarry_x + dx;
            let check_y = quarry_y + dy;
            
            if check_x < 0 || check_y < 0 || check_x >= width as i32 || check_y >= height as i32 {
                continue;
            }
            
            if road_network[check_y as usize][check_x as usize] {
                let dist_sq = (dx * dx + dy * dy) as f32;
                if dist_sq < nearest_dist_sq {
                    nearest_dist_sq = dist_sq;
                    nearest_road_pos = Some((check_x, check_y));
                }
            }
        }
    }
    
    // If we found a road, create a path to it
    if let Some((road_x, road_y)) = nearest_road_pos {
        // Start from edge of quarry (not center)
        let dx = road_x - quarry_x;
        let dy = road_y - quarry_y;
        let angle = (dy as f32).atan2(dx as f32);
        let start_x = quarry_x + (angle.cos() * quarry_radius as f32) as i32;
        let start_y = quarry_y + (angle.sin() * quarry_radius as f32) as i32;
        
        // Draw road from quarry edge to main road
        draw_road_segment_between_points(quarry_roads, start_x, start_y, road_x, road_y, width, height);
    }
}

fn generate_chunk(
    ctx: &ReducerContext, 
    config: &WorldGenConfig, 
    noise: &Perlin, 
    world_features: &WorldFeatures,
    chunk_x: i32, 
    chunk_y: i32
) -> Result<u32, String> {
    let mut tiles_in_chunk = 0;
    
    for local_y in 0..config.chunk_size {
        for local_x in 0..config.chunk_size {
            let world_x = chunk_x * config.chunk_size as i32 + local_x as i32;
            let world_y = chunk_y * config.chunk_size as i32 + local_y as i32;
            
            // Skip tiles outside world bounds
            if world_x >= config.world_width_tiles as i32 || world_y >= config.world_height_tiles as i32 {
                continue;
            }
            
            let tile_type = determine_realistic_tile_type(
                config, noise, world_features, world_x, world_y
            );
            
            let variant = generate_tile_variant(noise, world_x, world_y, &tile_type);
            
            ctx.db.world_tile().insert(WorldTile {
                id: 0, // auto_inc
                chunk_x,
                chunk_y,
                tile_x: local_x as i32,
                tile_y: local_y as i32,
                world_x,
                world_y,
                tile_type,
                variant,
                biome_data: None,
            });
            
            tiles_in_chunk += 1;
        }
    }
    
    Ok(tiles_in_chunk)
}

fn determine_realistic_tile_type(
    config: &WorldGenConfig,
    noise: &Perlin,
    features: &WorldFeatures,
    world_x: i32,
    world_y: i32,
) -> TileType {
    let x = world_x as usize;
    let y = world_y as usize;
    
    if x >= features.width || y >= features.height {
        return TileType::Sea;
    }
    
    let shore_distance = features.shore_distance[y][x];
    
    // Sea (beyond the shore)
    if shore_distance < -5.0 {
        return TileType::Sea;
    }
    
    // CRITICAL FIX: Check rivers and lakes BEFORE beach check
    // Rivers and lakes should be Sea, not Beach!
    // Rivers take priority and flow into sea
    if features.river_network[y][x] {
        return TileType::Sea;
    }
    
    // Lakes
    if features.lake_map[y][x] {
        return TileType::Sea;
    }
    
    // Hot spring water (inner pool) - just like rivers and lakes
    if features.hot_spring_water[y][x] {
        return TileType::HotSpringWater;
        }
        
    // Hot spring beach (shore) - just like regular beaches
    if features.hot_spring_beach[y][x] {
        return TileType::Beach;
    }
    
    // Beach areas around water - CHECK AFTER rivers/lakes/hot springs
    if shore_distance < 10.0 || is_near_water(features, x, y) {
        return TileType::Beach;
    }
    
    // Roads can cross deep water (rivers/lakes) but NOT beaches
    // Check roads AFTER beaches so beaches take priority
    if features.road_network[y][x] {
        return TileType::DirtRoad;
    }
    
    // Quarry dirt areas - use dedicated Quarry tile type (visually identical to Dirt)
    if features.quarry_dirt[y][x] {
        return TileType::Quarry;
    }
    
    // Quarry access roads - use regular DirtRoad tile type
    if features.quarry_roads[y][x] {
        return TileType::DirtRoad;
    }
    
    // Dirt patches using noise
    let dirt_noise = noise.get([world_x as f64 * 0.02, world_y as f64 * 0.015]);
    if dirt_noise > 0.4 && dirt_noise < 0.6 {
        if config.dirt_patch_frequency > 0.0 {
            let dirt_threshold = 0.15 + (config.dirt_patch_frequency as f64 * 0.25);
            if (dirt_noise - 0.5).abs() < dirt_threshold {
                return TileType::Dirt;
            }
        }
    }
    
    // Default to grass
    TileType::Grass
}

fn is_near_water(features: &WorldFeatures, x: usize, y: usize) -> bool {
    // Check if any adjacent tiles have water
    for dy in -3..=3i32 {
        for dx in -3..=3i32 {
            let check_x = (x as i32 + dx) as usize;
            let check_y = (y as i32 + dy) as usize;
            
            if check_x < features.width && check_y < features.height {
                if features.river_network[check_y][check_x] || 
                   features.lake_map[check_y][check_x] ||
                   features.shore_distance[check_y][check_x] < -2.0 {
                    return true;
                }
            }
        }
    }
    false
}

// Helper function to check if a position is adjacent to water tiles (including rivers and lakes)
fn check_adjacent_water_with_features(
    shore_distance: &[Vec<f64>], 
    river_network: &[Vec<bool>],
    lake_map: &[Vec<bool>],
    x: usize, 
    y: usize, 
    width: usize, 
    height: usize
) -> bool {
    // Check a LARGE radius (15 tiles) to ensure hot springs are WELL away from ANY water
    // This prevents hot springs from spawning on the edges of rivers and lakes
    for dy in -15..=15i32 {
        for dx in -15..=15i32 {
            if dx == 0 && dy == 0 {
                continue; // Skip the center tile
            }
            
            let check_x = x as i32 + dx;
            let check_y = y as i32 + dy;
            
            // Bounds check
            if check_x >= 0 && check_y >= 0 && (check_x as usize) < width && (check_y as usize) < height {
                let cx = check_x as usize;
                let cy = check_y as usize;
                
                // Check for ANY type of water:
                // 1. Rivers
                if river_network[cy][cx] {
                    return true;
                }
                
                // 2. Lakes
                if lake_map[cy][cx] {
                    return true;
                }
                
                // 3. Ocean/sea (negative shore distance or very close to shore)
                if shore_distance[cy][cx] < 10.0 {
                    return true;
                }
            }
        }
    }
    false
}

fn generate_tile_variant(noise: &Perlin, x: i32, y: i32, tile_type: &TileType) -> u8 {
    let variant_noise = noise.get([x as f64 * 0.1, y as f64 * 0.1, 100.0]);
    
    // Different variant ranges for different tile types
    match tile_type {
        TileType::Grass => {
            // More variation for grass tiles
            ((variant_noise + 1.0) * 127.5) as u8
        },
        TileType::Sea => {
            // Less variation for water (for consistent animation)
            ((variant_noise + 1.0) * 63.75) as u8
        },
        TileType::Beach => {
            // Sandy variation
            ((variant_noise + 1.0) * 85.0 + 40.0) as u8
        },
        _ => {
            // Standard variation for other tiles
            ((variant_noise + 1.0) * 95.0 + 32.0) as u8
        }
    }
}

#[spacetimedb::reducer]
pub fn generate_minimap_data(ctx: &ReducerContext, minimap_width: u32, minimap_height: u32) -> Result<(), String> {
    log::info!("Generating minimap data ({}x{}) from stored world tiles via streaming", minimap_width, minimap_height);
    
    // OPTIMIZED: Streaming generation (O(N) time, O(1) memory overhead)
    // Instead of loading 360,000 tiles into a HashMap (huge allocation),
    // we initialize the minimap buffer and iterate the tiles once,
    // projecting each tile directly onto the minimap pixels.
    
    // Initialize minimap data with Sea color (0)
    let mut minimap_data = vec![0u8; (minimap_width * minimap_height) as usize];
    
    // Calculate scaling factors
    let scale_x = minimap_width as f64 / WORLD_WIDTH_TILES as f64;
    let scale_y = minimap_height as f64 / WORLD_HEIGHT_TILES as f64;
    
    // Stream all tiles and project onto minimap
    for tile in ctx.db.world_tile().iter() {
        // Calculate target pixel on minimap
        let pixel_x = (tile.world_x as f64 * scale_x) as usize;
        let pixel_y = (tile.world_y as f64 * scale_y) as usize;
        
        // Bounds check
        if pixel_x < minimap_width as usize && pixel_y < minimap_height as usize {
            // Determine color value
            let color_value = match tile.tile_type {
                TileType::Sea => 0,        // Dark blue water
                TileType::Beach => 64,     // Muted sandy beach
                TileType::Sand => 96,      // Darker sand
                TileType::Grass => 128,    // Muted forest green
                TileType::Dirt => 192,     // Dark brown dirt
                TileType::DirtRoad => 224, // Very dark brown roads
                TileType::HotSpringWater => 255, // BRIGHT WHITE/CYAN - highly visible hot springs!
                TileType::Quarry => 192,   // Same as Dirt (visually identical)
            };
            
            // Write directly to buffer (overwriting if multiple tiles map to same pixel is fine/expected)
            minimap_data[pixel_y * minimap_width as usize + pixel_x] = color_value;
        }
    }
    
    // Clear any existing minimap cache
    for cache in ctx.db.minimap_cache().iter() {
        ctx.db.minimap_cache().id().delete(&cache.id);
    }
    
    // Store the new minimap data
    ctx.db.minimap_cache().insert(MinimapCache {
        id: 0, // auto_inc
        width: minimap_width,
        height: minimap_height,
        data: minimap_data,
        generated_at: ctx.timestamp,
    });
    
    log::info!("Minimap data generated successfully via streaming");
    Ok(())
}

#[spacetimedb::reducer]
pub fn get_minimap_data(ctx: &ReducerContext) -> Result<(), String> {
    // This reducer just triggers the minimap data to be sent to clients
    // The actual data is retrieved via subscription to the minimap_cache table
    log::info!("Minimap data requested");
    Ok(())
}

pub fn generate_compressed_chunk_data(ctx: &ReducerContext) -> Result<(), String> {
    log::info!("Generating compressed chunk data from world tiles...");
    
    let world_tiles = ctx.db.world_tile();
    let world_chunk_data = ctx.db.world_chunk_data();
    
    // Group tiles by chunk coordinates
    let mut chunk_tiles: std::collections::HashMap<(i32, i32), Vec<crate::WorldTile>> = std::collections::HashMap::new();
    
    for tile in world_tiles.iter() {
        let chunk_key = (tile.chunk_x, tile.chunk_y);
        chunk_tiles.entry(chunk_key).or_insert_with(Vec::new).push(tile);
    }
    
    let mut chunks_processed = 0;
    let total_chunks = chunk_tiles.len();
    
    for ((chunk_x, chunk_y), mut tiles) in chunk_tiles {
        // Sort tiles by their local position for consistent ordering
        tiles.sort_by(|a, b| {
            a.tile_y.cmp(&b.tile_y).then(a.tile_x.cmp(&b.tile_x))
        });
        
        // Calculate expected chunk size (should be CHUNK_SIZE_TILES x CHUNK_SIZE_TILES)
        let chunk_size = crate::environment::CHUNK_SIZE_TILES;
        let expected_tile_count = (chunk_size * chunk_size) as usize;
        
        // Initialize compressed arrays
        let mut tile_types = Vec::with_capacity(expected_tile_count);
        let mut variants = Vec::with_capacity(expected_tile_count);
        
        // Create a grid to ensure proper ordering
        let mut tile_grid: std::collections::HashMap<(i32, i32), &crate::WorldTile> = std::collections::HashMap::new();
        for tile in &tiles {
            tile_grid.insert((tile.tile_x, tile.tile_y), tile);
        }
        
        // Fill arrays in row-major order (y first, then x)
        for local_y in 0..chunk_size as i32 {
            for local_x in 0..chunk_size as i32 {
                if let Some(tile) = tile_grid.get(&(local_x, local_y)) {
                    tile_types.push(tile.tile_type.to_u8());
                    variants.push(tile.variant);
                } else {
                    // Fill missing tiles with default values (shouldn't happen in a well-generated world)
                    tile_types.push(crate::TileType::Grass.to_u8());
                    variants.push(0);
                    log::warn!("Missing tile at chunk ({}, {}) local position ({}, {})", 
                              chunk_x, chunk_y, local_x, local_y);
                }
            }
        }
        
        // Create compressed chunk data
        let compressed_chunk = crate::WorldChunkData {
            id: 0, // auto_inc
            chunk_x,
            chunk_y,
            chunk_size,
            tile_types,
            variants,
            generated_at: ctx.timestamp,
        };
        
        // Insert compressed chunk data
        match world_chunk_data.try_insert(compressed_chunk) {
            Ok(_) => {
                chunks_processed += 1;
                if chunks_processed % 100 == 0 || chunks_processed == total_chunks {
                    log::info!("Compressed chunk data: {}/{} chunks processed", chunks_processed, total_chunks);
                }
            }
            Err(e) => {
                log::error!("Failed to insert compressed chunk data for chunk ({}, {}): {}", 
                           chunk_x, chunk_y, e);
            }
        }
    }
    
    log::info!("Compressed chunk data generation complete: {} chunks processed from {} total world tiles", 
               chunks_processed, world_tiles.iter().count());
    
    Ok(())
} 