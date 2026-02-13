use spacetimedb::{ReducerContext, Table, Timestamp, Identity};
use noise::{NoiseFn, Perlin, Seedable};
use log;
use crate::{WorldTile, TileType, WorldGenConfig, MinimapCache, MonumentPart, MonumentType, LargeQuarry, LargeQuarryType, ReedMarsh, WORLD_WIDTH_TILES, WORLD_HEIGHT_TILES};

// Import the table trait
use crate::world_tile as WorldTileTableTrait;
use crate::minimap_cache as MinimapCacheTableTrait;
use crate::world_chunk_data as WorldChunkDataTableTrait;
use crate::monument_part as MonumentPartTableTrait;
use crate::large_quarry as LargeQuarryTableTrait;
use crate::reed_marsh as ReedMarshTableTrait;

use rand::{Rng, SeedableRng};
use rand::rngs::StdRng;
use std::collections::HashMap;

// --- Hot Spring Constants (moved from hot_spring.rs) ---
/// Base density for 600x600 map (360k tiles²) = 4 hot springs (increased for better visibility)
const HOT_SPRING_BASE_COUNT: u32 = 4;
// Use actual world size from lib.rs for base area calculation
const HOT_SPRING_BASE_AREA_TILES: f32 = (crate::WORLD_WIDTH_TILES * crate::WORLD_HEIGHT_TILES) as f32; // 600x600 = 360k tiles

// --- Quarry Constants ---
/// Base density for 600x600 map (360k tiles²) - FIXED baseline for scaling
const QUARRY_BASE_AREA_TILES: f32 = 360_000.0; // 600x600 = 360k tiles (FIXED baseline)
/// Base counts for 600x600 map - will scale up with larger maps
const QUARRY_LARGE_BASE_COUNT: u32 = 3; // 3 large quarries for 600x600 map (north)
const QUARRY_SMALL_BASE_COUNT: u32 = 6; // 6 small quarries for 600x600 map (south PvP spots)
// Large quarries (north/central)
const QUARRY_LARGE_MIN_RADIUS_TILES: i32 = 18;
const QUARRY_LARGE_MAX_RADIUS_TILES: i32 = 25;
// Small quarries (south - for PvP/warmth)
const QUARRY_SMALL_MIN_RADIUS_TILES: i32 = 10;  // Slightly larger
const QUARRY_SMALL_MAX_RADIUS_TILES: i32 = 14;  // Slightly larger
const MIN_QUARRY_DISTANCE: f32 = 100.0; // Reduced for more placement options
const MIN_SMALL_QUARRY_DISTANCE: f32 = 50.0; // Reduced for more small quarries
const MIN_QUARRY_TO_HOT_SPRING_DISTANCE: f32 = 80.0; // Keep quarries away from hot springs

// --- Reed Marsh Constants ---
/// Base count for 600x600 map - more marshes for organic distribution along waterways
const REED_MARSH_BASE_COUNT: u32 = 16;
/// Minimum water tile count in area to qualify as a marsh location (lowered for more positions)
const REED_MARSH_MIN_WATER_TILES: usize = 6;
/// Radius of reed marsh zone in pixels (building restriction area)
const REED_MARSH_RADIUS_PX: f32 = 250.0; // ~5 tiles radius - smaller for denser placement
/// Minimum distance between reed marshes in pixels (reduced for natural clustering along waterways)
const MIN_REED_MARSH_DISTANCE: f32 = 350.0; // Allow marshes to cluster organically
/// Minimum distance for same-waterway marshes (even closer for river chains)
const MIN_REED_MARSH_CHAIN_DISTANCE: f32 = 200.0;

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
    
    // Clear existing monument parts (unified table for all monument types)
    let monument_parts_count = ctx.db.monument_part().iter().count();
    if monument_parts_count > 0 {
        log::info!("Clearing {} existing monument parts", monument_parts_count);
        for part in ctx.db.monument_part().iter() {
            ctx.db.monument_part().id().delete(&part.id);
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
    
    // Store shipwreck positions in database table for client access (one-time read, then static)
    // Following compound buildings pattern: client-side rendering, server-side collision only
    // Center uses hull7.png (to avoid duplication), parts use hull1.png through hull6.png (6 unique parts)
    for (center_x, center_y) in &world_features.shipwreck_centers {
        ctx.db.monument_part().insert(MonumentPart {
            id: 0, // auto_inc
            monument_type: MonumentType::Shipwreck,
            world_x: *center_x,
            world_y: *center_y,
            image_path: "hull7.png".to_string(), // Center uses hull7.png to avoid duplication with parts
            part_type: "center".to_string(),
            is_center: true,
            collision_radius: 80.0, // Collision radius for center piece
        });
    }
    
    for (part_x, part_y, image_path) in &world_features.shipwreck_parts {
        ctx.db.monument_part().insert(MonumentPart {
            id: 0, // auto_inc
            monument_type: MonumentType::Shipwreck,
            world_x: *part_x,
            world_y: *part_y,
            image_path: image_path.clone(),
            part_type: "hull".to_string(), // Generic part type for shipwreck parts
            is_center: false,
            collision_radius: 40.0, // Smaller collision radius for crash parts
        });
    }
    
    if !world_features.shipwreck_centers.is_empty() {
        log::info!("Stored {} shipwreck parts in database (1 center + {} crash parts) - client reads once, then treats as static config", 
                   world_features.shipwreck_centers.len() + world_features.shipwreck_parts.len(),
                   world_features.shipwreck_parts.len());
        
        // Spawn respawnable resources around shipwreck monument (harvestables and barrels only)
        // Note: We don't spawn dropped items here because they don't respawn - only respawnable resources
        let mut shipwreck_positions = Vec::new();
        // Add center positions
        for (center_x, center_y) in &world_features.shipwreck_centers {
            shipwreck_positions.push((*center_x, *center_y));
        }
        // Add part positions
        for (part_x, part_y, _) in &world_features.shipwreck_parts {
            shipwreck_positions.push((*part_x, *part_y));
        }
        
        // Spawn harvestable resources (Beach Wood Piles) - these respawn
        let harvestable_configs = crate::monument::get_shipwreck_harvestables();
        if let Err(e) = crate::monument::spawn_monument_harvestables(ctx, &shipwreck_positions, &harvestable_configs) {
            log::warn!("Failed to spawn shipwreck harvestables: {}", e);
        }
        
        // Spawn beach barrels around shipwreck parts - these respawn
        if let Err(e) = crate::monument::spawn_shipwreck_barrels(ctx, &shipwreck_positions) {
            log::warn!("Failed to spawn shipwreck barrels: {}", e);
        }
        
        // Spawn military rations around shipwreck parts - these respawn
        if let Err(e) = crate::monument::spawn_shipwreck_military_rations(ctx, &shipwreck_positions) {
            log::warn!("Failed to spawn shipwreck military rations: {}", e);
        }
        
        // Spawn decorations (Memory Shards) - one-time loot scattered in the wreckage
        // These don't respawn but provide initial exploration rewards
        let decoration_configs = crate::monument::get_shipwreck_decorations();
        if let Err(e) = crate::monument::spawn_monument_decorations(ctx, &shipwreck_positions, &decoration_configs) {
            log::warn!("Failed to spawn shipwreck decorations: {}", e);
        }
        
        // Spawn monument placeables (campfires, etc.) at shipwreck for player use
        if let Some(&(center_x, center_y)) = world_features.shipwreck_centers.first() {
            let placeable_configs = crate::monument::get_shipwreck_placeables();
            match crate::monument::spawn_monument_placeables(ctx, "Shipwreck", center_x, center_y, &placeable_configs) {
                Ok(count) => log::info!("🚢 Spawned {} monument placeables at Shipwreck", count),
                Err(e) => log::warn!("Failed to spawn shipwreck placeables: {}", e),
            }
        }
    }
    
    // Store fishing village positions in database table for client access (one-time read, then static)
    // Following compound buildings pattern: client-side rendering, NO collision per user request
    if let Some((center_x, center_y)) = world_features.fishing_village_center {
        // All parts are stored (center marker is first in the parts list for zone calculations)
        for (part_x, part_y, image_path, part_type) in &world_features.fishing_village_parts {
            ctx.db.monument_part().insert(MonumentPart {
                id: 0, // auto_inc
                monument_type: MonumentType::FishingVillage,
                world_x: *part_x,
                world_y: *part_y,
                image_path: image_path.clone(),
                part_type: part_type.clone(),
                is_center: *part_type == "campfire", // Campfire is the center (visual doodad)
                collision_radius: 0.0, // NO collision per user request
            });
        }
        
        log::info!("🏘️ Stored {} fishing village parts in database - client reads once, then treats as static config",
                   world_features.fishing_village_parts.len());
        
        // Start continuous campfire sound for fishing village communal campfire (fv_campfire - always burning)
        for (part_x, part_y, _, part_type) in &world_features.fishing_village_parts {
            if *part_type == "campfire" {
                crate::sound_events::start_village_campfire_sound(
                    ctx,
                    crate::sound_events::VillageCampfireType::FishingVillage,
                    *part_x,
                    *part_y,
                );
                break; // Only one campfire per village
            }
        }
        
        // Spawn monument placeables (campfires, rain collectors) at fishing village for player use
        let placeable_configs = crate::monument::get_fishing_village_placeables();
        match crate::monument::spawn_monument_placeables(ctx, "Fishing Village", center_x, center_y, &placeable_configs) {
            Ok(count) => log::info!("🏘️ Spawned {} monument placeables at Fishing Village", count),
            Err(e) => log::warn!("Failed to spawn fishing village placeables: {}", e),
        }
    }
    
    // Store whale bone graveyard positions in database table for client access (one-time read, then static)
    // Following compound buildings pattern: client-side rendering, NO collision for walkability
    if let Some((center_x, center_y)) = world_features.whale_bone_graveyard_center {
        // All parts are stored (hermit hut is the center piece)
        for (part_x, part_y, image_path, part_type) in &world_features.whale_bone_graveyard_parts {
            ctx.db.monument_part().insert(MonumentPart {
                id: 0, // auto_inc
                monument_type: MonumentType::WhaleBoneGraveyard,
                world_x: *part_x,
                world_y: *part_y,
                image_path: image_path.clone(),
                part_type: part_type.clone(),
                is_center: *part_type == "hermit_hut", // Hermit hut is the center of the graveyard
                collision_radius: 0.0, // NO collision for walkability
            });
        }
        
        log::info!("🦴 Stored {} whale bone graveyard parts in database - client reads once, then treats as static config",
                   world_features.whale_bone_graveyard_parts.len());
        
        // Spawn respawnable resources around whale bone graveyard monument
        let mut graveyard_positions = Vec::new();
        for (part_x, part_y, _, _) in &world_features.whale_bone_graveyard_parts {
            graveyard_positions.push((*part_x, *part_y));
        }
        
        // Spawn harvestable resources (Beach Wood Piles, Stone Piles) - these respawn
        let harvestable_configs = crate::monument::get_whale_bone_graveyard_harvestables();
        if let Err(e) = crate::monument::spawn_monument_harvestables(ctx, &graveyard_positions, &harvestable_configs) {
            log::warn!("Failed to spawn whale bone graveyard harvestables: {}", e);
        }
        
        // Spawn beach barrels around whale bone graveyard parts - these respawn
        // Pass center position so hermit hut barrels spawn further away
        if let Err(e) = crate::monument::spawn_whale_bone_graveyard_barrels(ctx, &graveyard_positions, Some((center_x, center_y))) {
            log::warn!("Failed to spawn whale bone graveyard barrels: {}", e);
        }
        
        // Spawn military rations around whale bone graveyard parts (fewer than shipwreck)
        if let Err(e) = crate::monument::spawn_whale_bone_graveyard_military_rations(ctx, &graveyard_positions) {
            log::warn!("Failed to spawn whale bone graveyard military rations: {}", e);
        }
        
        // Spawn decorations (one-time items)
        let decoration_configs = crate::monument::get_whale_bone_graveyard_decorations();
        if let Err(e) = crate::monument::spawn_monument_decorations(ctx, &graveyard_positions, &decoration_configs) {
            log::warn!("Failed to spawn whale bone graveyard decorations: {}", e);
        }
        
        // Spawn monument placeables (campfire near hermit's hut) for player use
        let placeable_configs = crate::monument::get_whale_bone_graveyard_placeables();
        match crate::monument::spawn_monument_placeables(ctx, "Whale Bone Graveyard", center_x, center_y, &placeable_configs) {
            Ok(count) => log::info!("🦴 Spawned {} monument placeables at Whale Bone Graveyard", count),
            Err(e) => log::warn!("Failed to spawn whale bone graveyard placeables: {}", e),
        }
        
        // Spawn the unique Bone Carving Kit at the whale bone graveyard center
        match crate::whale_bone_graveyard::spawn_bone_carving_kit(ctx) {
            Ok(_) => log::info!("🦴 Spawned Bone Carving Kit at Whale Bone Graveyard"),
            Err(e) => log::warn!("Failed to spawn Bone Carving Kit: {}", e),
        }
    }
    
    // Store hunting village positions in database table for client access (one-time read, then static)
    // Following compound buildings pattern: client-side rendering, NO collision for walkability
    if let Some((center_x, center_y)) = world_features.hunting_village_center {
        // All parts are stored (lodge is the center piece)
        for (part_x, part_y, image_path, part_type) in &world_features.hunting_village_parts {
            ctx.db.monument_part().insert(MonumentPart {
                id: 0, // auto_inc
                monument_type: MonumentType::HuntingVillage,
                world_x: *part_x,
                world_y: *part_y,
                image_path: image_path.clone(),
                part_type: part_type.clone(),
                is_center: *part_type == "lodge", // Lodge is the center of the village
                collision_radius: 0.0, // NO collision for walkability
            });
        }
        
        log::info!("🏕️ Stored {} hunting village parts in database - client reads once, then treats as static config",
                   world_features.hunting_village_parts.len());
        
        // Start continuous campfire sound for hunting village communal campfire (fv_campfire - always burning)
        for (part_x, part_y, _, part_type) in &world_features.hunting_village_parts {
            if *part_type == "campfire" {
                crate::sound_events::start_village_campfire_sound(
                    ctx,
                    crate::sound_events::VillageCampfireType::HuntingVillage,
                    *part_x,
                    *part_y,
                );
                break; // Only one campfire per village
            }
        }
        
        // Spawn harvestable resources in a dedicated garden grid (south of lodge)
        // Avoids overlap with buildings - neat row/grid layout like a little garden
        let mut village_positions = Vec::new();
        for (part_x, part_y, _, _) in &world_features.hunting_village_parts {
            village_positions.push((*part_x, *part_y));
        }
        let harvestable_configs = crate::monument::get_hunting_village_harvestables();
        match crate::monument::spawn_hunting_village_harvestables(ctx, center_x, center_y, &village_positions, &harvestable_configs) {
            Ok(count) => log::info!("🏕️ Spawned {} harvestables in hunting village garden", count),
            Err(e) => log::warn!("Failed to spawn hunting village harvestables: {}", e),
        }
        
        // Spawn monument placeables for player use
        let placeable_configs = crate::monument::get_hunting_village_placeables();
        match crate::monument::spawn_monument_placeables(ctx, "Hunting Village", center_x, center_y, &placeable_configs) {
            Ok(count) => log::info!("🏕️ Spawned {} monument placeables at Hunting Village", count),
            Err(e) => log::warn!("Failed to spawn hunting village placeables: {}", e),
        }
        // NOTE: Trees around hunting village come from natural seed_environment spawning
    }
    
    // Store crashed research drone positions in database table for client access
    // This is a dangerous crash site in the tundra - NOT a safe zone, NO buffs
    if let Some((center_x, center_y)) = world_features.crashed_research_drone_center {
        // Store the single drone part (center piece)
        for (part_x, part_y, image_path, part_type) in &world_features.crashed_research_drone_parts {
            ctx.db.monument_part().insert(MonumentPart {
                id: 0, // auto_inc
                monument_type: MonumentType::CrashedResearchDrone,
                world_x: *part_x,
                world_y: *part_y,
                image_path: image_path.clone(),
                part_type: part_type.clone(),
                is_center: true, // Single part is always center
                collision_radius: 0.0, // NO collision for walkability
            });
        }
        
        log::info!("🛸 Stored {} crashed research drone parts in database - client reads once, then treats as static config",
                   world_features.crashed_research_drone_parts.len());
        
        // Collect part positions for spawning
        let drone_positions: Vec<(f32, f32)> = world_features.crashed_research_drone_parts
            .iter()
            .map(|(part_x, part_y, _, _)| (*part_x, *part_y))
            .collect();
        
        // Use coordinated spawn function to avoid overlapping entities
        // This spawns placeables, harvestables, and barrels with collision avoidance
        match crate::monument::spawn_crashed_research_drone_all(ctx, center_x, center_y, &drone_positions) {
            Ok((placeables, harvestables, barrels)) => {
                log::info!("🛸 Crashed Research Drone spawned: {} placeables, {} harvestables, {} barrels (with collision avoidance)",
                          placeables, harvestables, barrels);
            }
            Err(e) => {
                log::warn!("Failed to spawn crashed research drone entities: {}", e);
            }
        }
        
        // Spawn the unique Transistor Radio at the Crashed Research Drone
        match crate::transistor_radio::spawn_transistor_radio(ctx) {
            Ok(_) => log::info!("📻 Spawned Transistor Radio at Crashed Research Drone"),
            Err(e) => log::warn!("Failed to spawn Transistor Radio: {}", e),
        }
    }
    
    // Store weather station positions in database table for client access
    // This is a weather monitoring station in the alpine biome - NOT a safe zone
    if let Some((center_x, center_y)) = world_features.weather_station_center {
        // Store the single radar dish part (center piece)
        for (part_x, part_y, image_path, part_type) in &world_features.weather_station_parts {
            ctx.db.monument_part().insert(MonumentPart {
                id: 0, // auto_inc
                monument_type: MonumentType::WeatherStation,
                world_x: *part_x,
                world_y: *part_y,
                image_path: image_path.clone(),
                part_type: part_type.clone(),
                is_center: true, // Single part is always center
                collision_radius: 0.0, // NO collision for walkability
            });
        }
        
        log::info!("📡 Stored {} weather station parts in database - client reads once, then treats as static config",
                   world_features.weather_station_parts.len());
        
        // Spawn barrels around the weather station
        match crate::monument::spawn_weather_station_barrels(ctx, center_x, center_y) {
            Ok(barrel_count) => {
                log::info!("📡 Weather Station spawned: {} barrels", barrel_count);
            }
            Err(e) => {
                log::warn!("Failed to spawn weather station barrels: {}", e);
            }
        }
    }
    
    // Store wolf den positions in database table for client access
    // These are wolf pack spawn points in the tundra biome - NOT safe zones
    // Can have up to 2 wolf dens
    if !world_features.wolf_den_centers.is_empty() {
        // Store all wolf mound parts (center pieces)
        for (part_x, part_y, image_path, part_type) in &world_features.wolf_den_parts {
            ctx.db.monument_part().insert(MonumentPart {
                id: 0, // auto_inc
                monument_type: MonumentType::WolfDen,
                world_x: *part_x,
                world_y: *part_y,
                image_path: image_path.clone(),
                part_type: part_type.clone(),
                is_center: true, // Single part per den is always center
                collision_radius: 0.0, // NO collision for walkability
            });
        }
        
        log::info!("🐺 Stored {} wolf den parts ({} dens) in database - client reads once, then treats as static config",
                   world_features.wolf_den_parts.len(), world_features.wolf_den_centers.len());
        
        // Spawn a pack of wolves around each wolf den (3-4 wolves per den)
        use crate::wild_animal_npc::AnimalSpecies;
        let mut total_wolves_spawned = 0u32;
        
        for (den_idx, (center_x, center_y)) in world_features.wolf_den_centers.iter().enumerate() {
            let wolf_count = 3 + (ctx.rng().gen::<u32>() % 2); // 3-4 wolves per den
            let mut wolves_spawned = 0u32;
            
            for i in 0..wolf_count {
                // Spawn wolves in a ring around the den
                let angle = (i as f32) * (2.0 * std::f32::consts::PI / wolf_count as f32) 
                           + ctx.rng().gen_range(-0.3..0.3);
                let distance = ctx.rng().gen_range(80.0..180.0);
                let wolf_x = center_x + angle.cos() * distance;
                let wolf_y = center_y + angle.sin() * distance;
                
                // Spawn the wolf
                match crate::wild_animal_npc::spawn_wild_animal(ctx, AnimalSpecies::TundraWolf, wolf_x, wolf_y) {
                    Ok(_) => {
                        wolves_spawned += 1;
                        total_wolves_spawned += 1;
                    }
                    Err(e) => {
                        log::warn!("Failed to spawn wolf at wolf den #{}: {}", den_idx + 1, e);
                    }
                }
            }
            
            log::info!("🐺 Wolf Den #{} spawned: {} wolves in pack", den_idx + 1, wolves_spawned);
        }
        
        log::info!("🐺 Total wolves spawned at {} wolf dens: {}", world_features.wolf_den_centers.len(), total_wolves_spawned);
    }
    
    // Store large quarry positions and types in database for client minimap display
    // Similar to shipwreck - client reads once, then treats as static config
    for (tile_x, tile_y, radius, quarry_type) in &world_features.large_quarry_centers {
        // Convert tile position to world pixel position (center of quarry)
        let world_x_px = (*tile_x + 0.5) * crate::TILE_SIZE_PX as f32;
        let world_y_px = (*tile_y + 0.5) * crate::TILE_SIZE_PX as f32;
        
        ctx.db.large_quarry().insert(LargeQuarry {
            id: 0, // auto_inc
            world_x: world_x_px,
            world_y: world_y_px,
            radius_tiles: *radius,
            quarry_type: quarry_type.clone(),
        });
    }
    
    if !world_features.large_quarry_centers.is_empty() {
        log::info!("Stored {} large quarry locations in database - client reads once for minimap labels", 
                   world_features.large_quarry_centers.len());
    }
    
    // Store reed marsh positions in database for building restrictions and resource spawning
    // Reed marshes are environmental monuments in larger rivers (tern hunting, reed collection)
    for (world_x, world_y) in &world_features.reed_marsh_centers {
        ctx.db.reed_marsh().insert(ReedMarsh {
            id: 0, // auto_inc
            world_x: *world_x,
            world_y: *world_y,
            radius_px: REED_MARSH_RADIUS_PX,
        });
    }
    
    if !world_features.reed_marsh_centers.is_empty() {
        log::info!("🌾 Stored {} reed marsh locations in database", world_features.reed_marsh_centers.len());
        
        // Spawn resources in reed marshes (reeds, barrels, memory shards)
        if let Err(e) = crate::monument::spawn_reed_marsh_resources(ctx) {
            log::warn!("Failed to spawn reed marsh resources: {}", e);
        }
    }
    
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
    hot_spring_centers: Vec<(f32, f32, i32)>, // Hot spring centers (x, y, radius) for forest generation
    quarry_dirt: Vec<Vec<bool>>, // Quarry dirt areas (circular cleared zones)
    quarry_roads: Vec<Vec<bool>>, // Quarry access roads (dirt roads leading in)
    quarry_centers: Vec<(f32, f32, i32)>, // Quarry center positions (x, y, radius) for entity spawning
    large_quarry_centers: Vec<(f32, f32, i32, LargeQuarryType)>, // Large quarry centers with type (x, y, radius, type)
    asphalt_compound: Vec<Vec<bool>>, // Central compound and mini-compounds (paved asphalt)
    compound_dirt_ring: Vec<Vec<bool>>, // Rough dirt ring around asphalt compound for organic transition
    forest_areas: Vec<Vec<bool>>, // Dense forested areas
    tundra_areas: Vec<Vec<bool>>, // Arctic tundra (northern regions)
    alpine_areas: Vec<Vec<bool>>, // High-altitude rocky terrain (far north)
    island_positions: Vec<(f64, f64, f64)>, // Scattered island centers (x, y, radius) for biome assignment
    shipwreck_centers: Vec<(f32, f32)>, // Shipwreck center positions (x, y) in world pixels - center piece
    shipwreck_parts: Vec<(f32, f32, String)>, // Shipwreck crash parts (x, y, image_path) in world pixels
    fishing_village_center: Option<(f32, f32)>, // Fishing village center position (campfire) in world pixels
    fishing_village_parts: Vec<(f32, f32, String, String)>, // Fishing village parts (x, y, image_path, part_type) in world pixels
    whale_bone_graveyard_center: Option<(f32, f32)>, // Whale bone graveyard center position (ribcage) in world pixels
    whale_bone_graveyard_parts: Vec<(f32, f32, String, String)>, // Whale bone graveyard parts (x, y, image_path, part_type) in world pixels
    hunting_village_center: Option<(f32, f32)>, // Hunting village center position (lodge) in world pixels
    hunting_village_parts: Vec<(f32, f32, String, String)>, // Hunting village parts (x, y, image_path, part_type) in world pixels
    crashed_research_drone_center: Option<(f32, f32)>, // Crashed research drone center position in world pixels
    crashed_research_drone_parts: Vec<(f32, f32, String, String)>, // Crashed research drone parts (x, y, image_path, part_type) in world pixels
    weather_station_center: Option<(f32, f32)>, // Weather station center position in world pixels (alpine biome)
    weather_station_parts: Vec<(f32, f32, String, String)>, // Weather station parts (x, y, image_path, part_type) in world pixels
    wolf_den_centers: Vec<(f32, f32)>, // Wolf den center positions in world pixels (tundra biome) - up to 2 dens
    wolf_den_parts: Vec<(f32, f32, String, String)>, // Wolf den parts (x, y, image_path, part_type) in world pixels
    coral_reef_zones: Vec<Vec<bool>>, // Coral reef zones (deep sea areas for living coral)
    reed_marsh_centers: Vec<(f32, f32)>, // Reed marsh center positions (x, y) in world pixels
    fishing_village_roads: Vec<Vec<bool>>, // Dirt road tiles in fishing village (for lampposts)
    hunting_village_roads: Vec<Vec<bool>>, // Dirt road tiles in hunting village (circle + spur)
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
    
    // Generate wavy shore distance map (returns island positions too)
    let (shore_distance, island_positions) = generate_wavy_shore_distance_with_islands(config, noise, width, height);
    
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
    // Also returns centers for surrounding forest generation
    let (hot_spring_water, hot_spring_beach, hot_spring_centers) = generate_hot_springs(config, noise, &shore_distance, &river_network, &lake_map, width, height);
    
    // Generate quarry locations (dirt areas with enhanced stone spawning)
    // Pass hot spring data to ensure quarries don't spawn near hot springs
    let (quarry_dirt, quarry_roads, quarry_centers, large_quarry_centers) = generate_quarries(config, noise, &shore_distance, &river_network, &lake_map, &hot_spring_water, &road_network, width, height);
    
    // Generate asphalt compounds (central compound + organic dirt ring around it)
    let (asphalt_compound, compound_dirt_ring) = generate_asphalt_compounds(config, noise, &shore_distance, &road_network, width, height);
    
    // Generate latitude-based biome areas (Tundra and Alpine for northern regions)
    let (tundra_areas, alpine_areas) = generate_latitude_biomes(config, noise, &shore_distance, width, height);
    
    // Generate forest areas (dense forested regions with higher tree density)
    // Now respects biome boundaries - no forests in tundra/alpine
    // Also adds dense forest rings around hot springs with organic paths
    let forest_areas = generate_forest_areas_with_biomes(config, noise, &shore_distance, &river_network, &lake_map, &road_network, &hot_spring_water, &hot_spring_beach, &hot_spring_centers, &quarry_dirt, &tundra_areas, &alpine_areas, width, height);
    
    // Generate shipwreck monument on south beach (now handled by monument module)
    let (shipwreck_centers, shipwreck_parts) = crate::monument::generate_shipwreck(noise, &shore_distance, &river_network, &lake_map, width, height);
    
    // Generate fishing village monument on south beach (opposite side from shipwreck)
    // Must be at least 2000px (~42 tiles) away from hot springs
    let (fishing_village_center, fishing_village_parts) = crate::monument::generate_fishing_village(
        noise, &shore_distance, &river_network, &lake_map, &shipwreck_centers, &hot_spring_centers, width, height
    );
    
    // Generate whale bone graveyard monument on beach (separate from shipwreck and fishing village)
    // Must be at least 2000px (~42 tiles) away from hot springs
    let (whale_bone_graveyard_center, whale_bone_graveyard_parts) = crate::monument::generate_whale_bone_graveyard(
        noise, &shore_distance, &river_network, &lake_map, &shipwreck_centers, fishing_village_center, &hot_spring_centers, width, height
    );
    
    // Extract large quarry positions for monument distance checks (without type info)
    // MOVED BEFORE hunting village so all inland monuments can check against quarries
    let large_quarry_positions: Vec<(f32, f32, i32)> = large_quarry_centers.iter()
        .map(|(x, y, r, _)| (*x, *y, *r))
        .collect();
    
    // Generate hunting village monument in forest biome (safe zone with tree ring)
    // Must be in forest (not tundra), away from hot springs, quarries, and other monuments
    let (hunting_village_center, hunting_village_parts) = crate::monument::generate_hunting_village(
        noise, &shore_distance, &river_network, &lake_map, &forest_areas, &tundra_areas, &hot_spring_centers,
        &shipwreck_centers, fishing_village_center, whale_bone_graveyard_center, &large_quarry_positions, width, height
    );
    
    // Generate crashed research drone monument in tundra biome (dangerous crash site)
    // Spawns barrels, memory shards, sulfur piles, and metal ore piles - NOT a safe zone
    let (crashed_research_drone_center, crashed_research_drone_parts) = crate::monument::generate_crashed_research_drone(
        noise, &shore_distance, &river_network, &lake_map, &tundra_areas, &hot_spring_centers,
        &shipwreck_centers, fishing_village_center, whale_bone_graveyard_center, hunting_village_center, 
        &large_quarry_positions, width, height
    );
    
    // Generate weather station monument in alpine biome (far north)
    // Single radar dish structure with barrels - NOT a safe zone
    // Must be away from hot springs, quarries, and other monuments
    let (weather_station_center, weather_station_parts) = crate::monument::generate_weather_station(
        noise, &shore_distance, &river_network, &lake_map, &alpine_areas, &hot_spring_centers,
        &shipwreck_centers, fishing_village_center, whale_bone_graveyard_center, hunting_village_center,
        crashed_research_drone_center, &large_quarry_positions, width, height
    );
    
    // Generate wolf den monuments in tundra biome (wolf pack spawn points)
    // Single wolf mound structures - spawns a pack of wolves each - NOT safe zones
    // Can spawn up to 2 wolf dens in the tundra
    // Must be away from hot springs, quarries, and other monuments
    let (wolf_den_centers, wolf_den_parts) = crate::monument::generate_wolf_den(
        noise, &shore_distance, &river_network, &lake_map, &tundra_areas, &hot_spring_centers,
        &shipwreck_centers, fishing_village_center, whale_bone_graveyard_center, hunting_village_center,
        crashed_research_drone_center, weather_station_center, &large_quarry_positions, width, height
    );
    
    // Generate coral reef zones (deep sea areas for living coral spawning)
    let coral_reef_zones = generate_coral_reef_zones(config, noise, &shore_distance, width, height);
    
    // Generate reed marsh centers (wide river sections for tern hunting and reed collection)
    let reed_marsh_centers = generate_reed_marsh_centers(config, noise, &river_network, &lake_map, &shore_distance, width, height);
    
    // Generate village dirt roads (fishing + hunting) - for lampposts and village atmosphere
    let (fishing_village_roads, hunting_village_roads) = generate_village_roads(
        &road_network,
        &dirt_paths,
        fishing_village_center,
        &fishing_village_parts,
        hunting_village_center,
        &hunting_village_parts,
        noise,
        width,
        height,
    );
    
    WorldFeatures {
        heightmap,
        shore_distance,
        river_network,
        lake_map,
        road_network,
        dirt_paths,
        hot_spring_water,
        hot_spring_beach,
        hot_spring_centers,
        quarry_dirt,
        quarry_roads,
        quarry_centers,
        large_quarry_centers,
        asphalt_compound,
        compound_dirt_ring,
        forest_areas,
        tundra_areas,
        alpine_areas,
        island_positions,
        shipwreck_centers,
        shipwreck_parts,
        fishing_village_center,
        fishing_village_parts,
        whale_bone_graveyard_center,
        whale_bone_graveyard_parts,
        hunting_village_center,
        hunting_village_parts,
        crashed_research_drone_center,
        crashed_research_drone_parts,
        weather_station_center,
        weather_station_parts,
        wolf_den_centers,
        wolf_den_parts,
        coral_reef_zones,
        reed_marsh_centers,
        fishing_village_roads,
        hunting_village_roads,
        width,
        height,
    }
}

/// Generate dirt road tiles for fishing and hunting villages.
/// - Fishing village: small path around campfire and along structures
/// - Hunting village: rough circular plaza + spur road leading toward main road network
fn generate_village_roads(
    road_network: &[Vec<bool>],
    dirt_paths: &[Vec<bool>],
    fishing_village_center: Option<(f32, f32)>,
    fishing_village_parts: &[(f32, f32, String, String)],
    hunting_village_center: Option<(f32, f32)>,
    hunting_village_parts: &[(f32, f32, String, String)],
    noise: &Perlin,
    width: usize,
    height: usize,
) -> (Vec<Vec<bool>>, Vec<Vec<bool>>) {
    let tile_size_px = crate::TILE_SIZE_PX as f32;
    let mut fishing_roads = vec![vec![false; width]; height];
    let mut hunting_roads = vec![vec![false; width]; height];

    // --- Fishing village: small dirt path around campfire and between structures ---
    if let Some((center_px_x, center_px_y)) = fishing_village_center {
        let center_tx = (center_px_x / tile_size_px).floor() as i32;
        let center_ty = (center_px_y / tile_size_px).floor() as i32;
        // Path radius ~4-5 tiles around campfire
        let path_radius = 5i32;
        for dy in -path_radius..=path_radius {
            for dx in -path_radius..=path_radius {
                let tx = center_tx + dx;
                let ty = center_ty + dy;
                if tx >= 0 && ty >= 0 && (tx as usize) < width && (ty as usize) < height {
                    let dist = ((dx * dx + dy * dy) as f64).sqrt();
                    let shape_noise = noise.get([tx as f64 * 0.15, ty as f64 * 0.15, 55000.0]);
                    let adjusted_radius = path_radius as f64 + shape_noise * 1.5;
                    if dist < adjusted_radius {
                        fishing_roads[ty as usize][tx as usize] = true;
                    }
                }
            }
        }
        // Add path tiles near other structures (huts, dock, smokeracks)
        for (part_px_x, part_px_y, _, _) in fishing_village_parts {
            let pt_tx = (part_px_x / tile_size_px).floor() as i32;
            let pt_ty = (part_px_y / tile_size_px).floor() as i32;
            for dy in -2..=2 {
                for dx in -2..=2 {
                    let tx = pt_tx + dx;
                    let ty = pt_ty + dy;
                    if tx >= 0 && ty >= 0 && (tx as usize) < width && (ty as usize) < height {
                        fishing_roads[ty as usize][tx as usize] = true;
                    }
                }
            }
        }
        log::info!("🏘️ Generated fishing village dirt roads (campfire + structure paths)");
    }

    // --- Hunting village: rough circular plaza + spur road leading toward main road ---
    if let Some((center_px_x, center_px_y)) = hunting_village_center {
        let center_tx = (center_px_x / tile_size_px).floor() as i32;
        let center_ty = (center_px_y / tile_size_px).floor() as i32;

        // Rough circle in center (~10-12 tiles radius) - buildings sit on it
        let circle_radius = 12i32;
        for dy in -circle_radius..=circle_radius {
            for dx in -circle_radius..=circle_radius {
                let tx = center_tx + dx;
                let ty = center_ty + dy;
                if tx >= 0 && ty >= 0 && (tx as usize) < width && (ty as usize) < height {
                    let dist = ((dx * dx + dy * dy) as f64).sqrt();
                    let shape_noise = noise.get([tx as f64 * 0.12, ty as f64 * 0.12, 60000.0]);
                    let adjusted_radius = circle_radius as f64 + shape_noise * 2.0;
                    if dist < adjusted_radius {
                        hunting_roads[ty as usize][tx as usize] = true;
                    }
                }
            }
        }

        // Spur road: find nearest road_network or dirt_paths, draw path from village toward it
        let search_radius = 80i32;
        let mut nearest_pos: Option<(i32, i32)> = None;
        let mut nearest_dist_sq = i32::MAX;

        for dy in -search_radius..=search_radius {
            for dx in -search_radius..=search_radius {
                let check_x = center_tx + dx;
                let check_y = center_ty + dy;
                if check_x < 0 || check_y < 0 || (check_x as usize) >= width || (check_y as usize) >= height {
                    continue;
                }
                let has_road = road_network[check_y as usize][check_x as usize]
                    || dirt_paths[check_y as usize][check_x as usize];
                if has_road {
                    let dist_sq = dx * dx + dy * dy;
                    if dist_sq < nearest_dist_sq {
                        nearest_dist_sq = dist_sq;
                        nearest_pos = Some((check_x, check_y));
                    }
                }
            }
        }

        if let Some((road_x, road_y)) = nearest_pos {
            let dx = road_x - center_tx;
            let dy = road_y - center_ty;
            let angle = (dy as f32).atan2(dx as f32);
            let start_tx = center_tx + (angle.cos() * circle_radius as f32) as i32;
            let start_ty = center_ty + (angle.sin() * circle_radius as f32) as i32;
            draw_village_road_spur(&mut hunting_roads, start_tx, start_ty, road_x, road_y, width, height);
        } else {
            // No main road nearby - draw spur south for ~15 tiles (toward map center / beach)
            let spur_len = 15i32;
            let end_tx = center_tx;
            let end_ty = (center_ty + spur_len).min(height as i32 - 1);
            draw_village_road_spur(&mut hunting_roads, center_tx, center_ty, end_tx, end_ty, width, height);
        }
        log::info!("🏕️ Generated hunting village dirt roads (circle + spur)");
    }

    (fishing_roads, hunting_roads)
}

/// Draw a narrow (3x3) dirt road spur between two points
fn draw_village_road_spur(
    roads: &mut Vec<Vec<bool>>,
    x1: i32,
    y1: i32,
    x2: i32,
    y2: i32,
    width: usize,
    height: usize,
) {
    let dx = (x2 - x1).abs();
    let dy = (y2 - y1).abs();
    let sx = if x1 < x2 { 1 } else { -1 };
    let sy = if y1 < y2 { 1 } else { -1 };
    let mut err = dx - dy;

    let mut x = x1;
    let mut y = y1;

    let mark = |roads: &mut Vec<Vec<bool>>, px: i32, py: i32| {
        for dy_off in -1..=1 {
            for dx_off in -1..=1 {
                let rx = px + dx_off;
                let ry = py + dy_off;
                if rx >= 0 && ry >= 0 && (rx as usize) < width && (ry as usize) < height {
                    roads[ry as usize][rx as usize] = true;
                }
            }
        }
    };

    loop {
        mark(roads, x, y);
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
    mark(roads, x2, y2);
}

fn generate_scattered_islands(
    shore_distance: &mut Vec<Vec<f64>>, 
    noise: &Perlin, 
    width: usize, 
    height: usize, 
    base_island_radius: f64,
    center_x: f64,
    center_y: f64
) -> Vec<(f64, f64, f64)> {
    // Scale island count with map size - fewer islands on larger maps
    let map_area = (width * height) as f64;
    let base_area = 360_000.0; // 600x600 baseline
    let scale_factor = (base_area / map_area).sqrt().max(0.3).min(1.0); // Reduce islands on larger maps
    
    // Increase noise threshold to be more selective (fewer islands)
    let adjusted_threshold = 0.3 + (1.0 - scale_factor) * 0.2; // Higher threshold = fewer islands
    
    log::info!("Generating scattered islands (scale factor: {:.2}, threshold: {:.2})", scale_factor, adjusted_threshold);
    
    // Generate only small islands with reduced count on larger maps
    generate_island_layer_with_positions(shore_distance, noise, width, height, base_island_radius, center_x, center_y,
                         base_island_radius * 0.12, // 12% of main island size - nice medium size
                         80.0, // Minimum distance from main island (stay well away)
                         100.0 / scale_factor, // Larger minimum distance on larger maps
                         0.015 * scale_factor, // Lower frequency for fewer placements on larger maps
                         adjusted_threshold,   // Higher threshold = more selective
                         4000.0) // Noise seed offset
}

fn generate_island_layer_with_positions(
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
) -> Vec<(f64, f64, f64)> {
    let mut island_positions: Vec<(f64, f64, f64)> = Vec::new();
    
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
    for (island_x, island_y, radius) in &island_positions {
        let search_radius = (*radius + 5.0) as usize;
        
        for y in ((*island_y as usize).saturating_sub(search_radius))..=((*island_y as usize) + search_radius).min(height - 1) {
            for x in ((*island_x as usize).saturating_sub(search_radius))..=((*island_x as usize) + search_radius).min(width - 1) {
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
    
    island_positions
}

/// Generate shore distance map with expanded south beaches and return island positions
fn generate_wavy_shore_distance_with_islands(config: &WorldGenConfig, noise: &Perlin, width: usize, height: usize) -> (Vec<Vec<f64>>, Vec<(f64, f64, f64)>) {
    let mut shore_distance = vec![vec![-100.0; width]; height]; // Start with deep water everywhere
    let center_x = width as f64 / 2.0;
    let center_y = height as f64 / 2.0;
    
    // Main island - back to original size
    let base_island_radius = (width.min(height) as f64 * 0.35).min(center_x.min(center_y) - 20.0);
    
    // EXPANDED SOUTH BEACHES: Stretch the main island shape southward
    // The south side gets 1.3x the radius to create larger beach zones
    let south_stretch_factor = 1.3;
    
    // Generate main island with asymmetric shape (larger to the south)
    for y in 0..height {
        for x in 0..width {
            let dx = x as f64 - center_x;
            let dy = y as f64 - center_y;
            
            // Apply south stretch: if y > center, stretch the island radius
            let effective_dy = if dy > 0.0 {
                dy / south_stretch_factor // Points south of center are "closer" to center
            } else {
                dy
            };
            
            let distance_from_center = (dx * dx + effective_dy * effective_dy).sqrt();
            
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
    
    // Track corner island positions for biome assignment
    let mut all_island_positions: Vec<(f64, f64, f64)> = Vec::new();
    
    for (island_x, island_y) in selected_corners {
        // Check if this corner is far enough from main island
        let dist_from_main = ((island_x as f64 - center_x).powi(2) + (island_y as f64 - center_y).powi(2)).sqrt();
        
        if dist_from_main > min_separation_distance {
            all_island_positions.push((island_x as f64, island_y as f64, secondary_island_radius));
            
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
    
    // Generate scattered small and mini islands throughout the sea (reduced count on larger maps)
    let scattered_islands = generate_scattered_islands(&mut shore_distance, noise, width, height, base_island_radius, center_x, center_y);
    all_island_positions.extend(scattered_islands);
    
    log::info!("Total islands generated: {} (including corner and scattered)", all_island_positions.len());
    
    (shore_distance, all_island_positions)
}

// Keep the old function for backward compatibility (but it won't be used)
#[allow(dead_code)]
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
    
    log::info!("Generating rivers that scale with map size");
    
    // PROPER SCALING: Base everything on 600x600 map
    let base_area = 360_000.0_f64; // 600x600
    let current_area = (width * height) as f64;
    let map_scale = (current_area / base_area).sqrt();
    
    // River width scales with map size - WIDER on larger maps
    let river_width = (3.0 + map_scale * 2.0).min(8.0).max(3.0) as i32;
    
    // Number of rivers scales with map size
    let base_river_count = 2;
    let river_count = ((base_river_count as f64) * map_scale).round().max(2.0).min(5.0) as usize;
    
    log::info!("Map scale: {:.2}x -> {} rivers with width {}", map_scale, river_count, river_width);
    
    // Generate rivers with varied paths across the island
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
    
    // Additional rivers for larger maps
    if river_count >= 3 {
        // River 3: Flows from northeast to southwest coast
        trace_highly_meandering_river(&mut rivers, noise,
                          width * 3 / 4, height / 4,         // Start: Northeast
                          width / 5, height * 3 / 4,         // End: Southwest
                          width, height, river_width, 3000);
    }
    
    if river_count >= 4 {
        // River 4: Flows from center-north to west coast
        trace_highly_meandering_river(&mut rivers, noise,
                          width / 2 + width / 10, height / 6, // Start: North-central
                          width / 6, height / 2,               // End: West coast
                          width, height, river_width - 1, 4000); // Slightly narrower
    }
    
    if river_count >= 5 {
        // River 5: Flows from east to south
        trace_highly_meandering_river(&mut rivers, noise,
                          width * 4 / 5, height * 2 / 5,      // Start: East
                          width / 2, height * 5 / 6,          // End: South
                          width, height, river_width - 1, 5000); // Slightly narrower
    }
    
    log::info!("Generated {} rivers with natural meanders (width: {})", river_count, river_width);
    
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
    
    // PROPER SCALING: Base everything on 600x600 map
    let base_area = 360_000.0_f64; // 600x600 (FIXED baseline)
    let current_area = (width * height) as f64;
    let map_scale = (current_area / base_area).sqrt();
    
    let base_lake_density = 0.010; // Slightly lower frequency for better distribution
    let scaled_density = base_lake_density / map_scale; // Lower density for larger maps (more lakes naturally)
    
    log::info!("Lake generation - map scale: {:.2}x", map_scale);
    
    // Generate lake centers in safe inland areas
    let mut lake_centers = Vec::new();
    
    // Multiple passes for different lake types and sizes
    // LARGER RADII for bigger lakes on larger maps
    
    // Pass 1: Large central lakes deep inland (VERY LARGE on big maps)
    for y in 30..height-30 {
        for x in 30..width-30 {
            if shore_distance[y][x] > 45.0 { // Deep inland for large lakes
                let lake_noise = noise.get([x as f64 * scaled_density * 0.7, y as f64 * scaled_density * 0.7, 5000.0]);
                if lake_noise > 0.55 { // Slightly lower threshold for more large lakes
                    lake_centers.push((x, y, 2)); // Size type 2 = large
                }
            }
        }
    }
    
    // Pass 2: Medium lakes moderately inland  
    for y in 25..height-25 {
        for x in 25..width-25 {
            if shore_distance[y][x] > 30.0 { // Moderately inland
                let lake_noise = noise.get([x as f64 * scaled_density, y as f64 * scaled_density, 5500.0]);
                if lake_noise > 0.40 { // Lower threshold for more lakes
                    lake_centers.push((x, y, 1)); // Size type 1 = medium
                }
            }
        }
    }
    
    // Pass 3: Small lakes closer to shore (like ponds)
    for y in 20..height-20 {
        for x in 20..width-20 {
            if shore_distance[y][x] > 22.0 { // Closer to shore
                let lake_noise = noise.get([x as f64 * scaled_density * 1.1, y as f64 * scaled_density * 1.1, 6000.0]);
                if lake_noise > 0.28 { // Lower threshold for more small lakes
                    lake_centers.push((x, y, 0)); // Size type 0 = small
                }
            }
        }
    }
    
    // Scale total lake count with map size - MORE lakes on larger maps
    let base_lake_count = 40.0;
    let max_lakes = (base_lake_count * map_scale * map_scale).max(20.0) as usize; // Quadratic scaling
    lake_centers.truncate(max_lakes);
    
    log::info!("Selected {} lake positions (max allowed: {})", lake_centers.len(), max_lakes);
    
    // Generate lakes around centers with size-based radius
    // SCALE lake sizes with map size for proportional lakes
    let lake_size_scale = map_scale.max(1.0); // Lakes get bigger on larger maps
    
    for (center_x, center_y, size_type) in lake_centers {
        // Base radii SCALED with map size
        let base_radius = match size_type {
            2 => 22.0 * lake_size_scale, // Large lakes - BIGGER
            1 => 14.0 * lake_size_scale, // Medium lakes  
            0 => 8.0 * lake_size_scale,  // Small lakes/ponds
            _ => 10.0 * lake_size_scale, // Fallback
        };
        
        let lake_radius = base_radius + noise.get([center_x as f64 * 0.1, center_y as f64 * 0.1, 6000.0]) * (base_radius * 0.4);
        
        let search_radius = (lake_radius + 10.0) as usize;
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
) -> (Vec<Vec<bool>>, Vec<Vec<bool>>, Vec<(f32, f32, i32)>) {
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
        return (hot_spring_water, hot_spring_beach, Vec::new());
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
    (hot_spring_water, hot_spring_beach, hot_spring_centers)
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
) -> (Vec<Vec<bool>>, Vec<Vec<bool>>, Vec<(f32, f32, i32)>, Vec<(f32, f32, i32, LargeQuarryType)>) {
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
        return (quarry_dirt, quarry_roads, Vec::new(), Vec::new());
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
    
    // Assign quarry types to LARGE quarries (Stone, Sulfur, Metal)
    // Ensure one of each type spawns, then assign remaining randomly
    let large_quarries: Vec<_> = quarry_centers.iter()
        .filter(|(_, _, _, is_large)| *is_large)
        .collect();
    
    let mut large_quarry_centers: Vec<(f32, f32, i32, LargeQuarryType)> = Vec::new();
    
    // Guaranteed types (one of each) - assign in order: Stone, Sulfur, Metal
    let guaranteed_types = [LargeQuarryType::Stone, LargeQuarryType::Sulfur, LargeQuarryType::Metal];
    
    for (idx, (x, y, r, _)) in large_quarries.iter().enumerate() {
        let quarry_type = if idx < guaranteed_types.len() {
            // First 3 large quarries get guaranteed types
            guaranteed_types[idx].clone()
        } else {
            // Additional large quarries get random types
            match rng.gen_range(0..3) {
                0 => LargeQuarryType::Stone,
                1 => LargeQuarryType::Sulfur,
                _ => LargeQuarryType::Metal,
            }
        };
        
        large_quarry_centers.push((*x, *y, *r, quarry_type));
    }
    
    // Log all quarry centers for easy navigation
    log::info!("🏔️ ========== QUARRY LOCATIONS ==========");
    for (idx, (center_x, center_y, radius_tiles, is_large)) in quarry_centers.iter().enumerate() {
        let world_x_px = (*center_x + 0.5) * crate::TILE_SIZE_PX as f32;
        let world_y_px = (*center_y + 0.5) * crate::TILE_SIZE_PX as f32;
        let quarry_type = if *is_large { "LARGE" } else { "SMALL" };
        log::info!("🏔️ QUARRY #{} ({}): World Position ({:.0}, {:.0}) | Radius: {} tiles", 
                   idx + 1, quarry_type, world_x_px, world_y_px, radius_tiles);
    }
    
    // Log large quarry types
    log::info!("🏔️ ========== LARGE QUARRY TYPES ==========");
    for (idx, (x, y, r, qtype)) in large_quarry_centers.iter().enumerate() {
        let world_x_px = (*x + 0.5) * crate::TILE_SIZE_PX as f32;
        let world_y_px = (*y + 0.5) * crate::TILE_SIZE_PX as f32;
        let type_name = match qtype {
            LargeQuarryType::Stone => "STONE QUARRY",
            LargeQuarryType::Sulfur => "SULFUR QUARRY",
            LargeQuarryType::Metal => "METAL QUARRY",
        };
        log::info!("🏔️ LARGE QUARRY #{} ({}): World Position ({:.0}, {:.0}) | Radius: {} tiles", 
                   idx + 1, type_name, world_x_px, world_y_px, r);
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
    
    log::info!("Generated {} quarries with dirt areas and access roads ({} large with types)", 
               quarry_centers_for_entities.len(), large_quarry_centers.len());
    (quarry_dirt, quarry_roads, quarry_centers_for_entities, large_quarry_centers)
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

/// Generate asphalt compound areas with organic irregular edges and a surrounding dirt ring
/// - Central compound: The main paved area at the center of the map (~41x41 tiles)
/// - Dirt ring: A rough, noise-driven ring of dirt around the asphalt for organic look
fn generate_asphalt_compounds(
    _config: &WorldGenConfig,
    noise: &Perlin,
    shore_distance: &[Vec<f64>],
    road_network: &[Vec<bool>],
    width: usize,
    height: usize,
) -> (Vec<Vec<bool>>, Vec<Vec<bool>>) {
    let mut asphalt = vec![vec![false; width]; height];
    let mut dirt_ring = vec![vec![false; width]; height];
    
    let center_x = width / 2;
    let center_y = height / 2;
    let compound_size = 20; // ~40x40 tile area for central compound
    let dirt_ring_base_width: f64 = 4.0; // Base width of dirt ring (3-5 tiles)
    let scan_radius = compound_size + 8; // Scan area large enough to cover asphalt + dirt ring + noise margin
    
    // Create central asphalt compound with irregular (noisy) edges
    // and a surrounding dirt ring that transitions organically into the terrain
    for y in (center_y.saturating_sub(scan_radius))..=(center_y + scan_radius).min(height - 1) {
        for x in (center_x.saturating_sub(scan_radius))..=(center_x + scan_radius).min(width - 1) {
            let dx = x as f64 - center_x as f64;
            let dy = y as f64 - center_y as f64;
            
            // Chebyshev distance gives a square shape
            let dist = dx.abs().max(dy.abs());
            
            // Use noise to create irregular edges on the asphalt boundary
            // High frequency noise for bumpy, organic edges (offset seed to avoid terrain correlation)
            let edge_noise = noise.get([x as f64 * 0.18 + 777.0, y as f64 * 0.18 + 777.0]);
            // Lower frequency for broad undulations in the dirt ring
            let ring_noise = noise.get([x as f64 * 0.1 + 1234.0, y as f64 * 0.1 + 1234.0]);
            
            // Asphalt boundary varies by ±2.5 tiles from the nominal compound_size
            let asphalt_boundary = compound_size as f64 + edge_noise * 2.5;
            
            // Dirt ring extends beyond asphalt with its own noisy outer boundary
            // Width varies from ~2 to ~6 tiles depending on noise
            let dirt_outer_boundary = asphalt_boundary + dirt_ring_base_width + ring_noise * 2.0;
            
            if dist <= asphalt_boundary {
                asphalt[y][x] = true;
            } else if dist <= dirt_outer_boundary {
                dirt_ring[y][x] = true;
            }
        }
    }
    
    log::info!("Created central compound at ({}, {}) with size {} and organic dirt ring", 
               center_x, center_y, compound_size);
    
    log::info!("Generated asphalt compounds with dirt ring (central compound only)");
    (asphalt, dirt_ring)
}

// Shipwreck generation logic moved to monument.rs module

/// Generate forest areas using noise-based distribution (OLD VERSION - kept for reference)
/// Forests are dense vegetation areas that complement meadows (Grass) and clearings (Dirt)
#[allow(dead_code)]
fn generate_forest_areas(
    _config: &WorldGenConfig,
    noise: &Perlin,
    shore_distance: &[Vec<f64>],
    river_network: &[Vec<bool>],
    lake_map: &[Vec<bool>],
    road_network: &[Vec<bool>],
    hot_spring_water: &[Vec<bool>],
    quarry_dirt: &[Vec<bool>],
    width: usize,
    height: usize,
) -> Vec<Vec<bool>> {
    let mut forest = vec![vec![false; width]; height];
    
    // Forest generation parameters
    let forest_noise_scale = 0.008; // Large-scale forest regions
    let forest_threshold = 0.25; // Higher = less forest coverage (0.0-1.0)
    let min_shore_distance = 20.0; // Forests don't grow too close to shore
    let forest_edge_noise_scale = 0.05; // Fine detail for forest edges
    
    for y in 0..height {
        for x in 0..width {
            // Skip tiles that shouldn't have forests
            let shore_dist = shore_distance[y][x];
            
            // No forests on/near water, beaches, roads, quarries, hot springs
            if shore_dist < min_shore_distance {
                continue;
            }
            if river_network[y][x] || lake_map[y][x] {
                continue;
            }
            if road_network[y][x] {
                continue;
            }
            if hot_spring_water[y][x] {
                continue;
            }
            if quarry_dirt[y][x] {
                continue;
            }
            
            // Use multiple noise layers for natural-looking forest distribution
            let base_noise = noise.get([x as f64 * forest_noise_scale, y as f64 * forest_noise_scale]);
            let detail_noise = noise.get([x as f64 * forest_edge_noise_scale, y as f64 * forest_edge_noise_scale]);
            
            // Combine noise layers (base determines regions, detail adds edge variation)
            let combined_noise = (base_noise * 0.7 + detail_noise * 0.3 + 1.0) / 2.0; // Normalize to 0-1
            
            // Forests grow where noise exceeds threshold
            if combined_noise > forest_threshold {
                // Additional distance-from-water factor (forests denser inland)
                let inland_bonus = ((shore_dist - min_shore_distance) / 50.0).min(0.2);
                if combined_noise + inland_bonus > forest_threshold {
                    forest[y][x] = true;
                }
            }
        }
    }
    
    // Count forest tiles for logging
    let forest_count: usize = forest.iter().flat_map(|row| row.iter()).filter(|&&b| b).count();
    let total_tiles = width * height;
    let forest_percentage = (forest_count as f64 / total_tiles as f64) * 100.0;
    
    log::info!("Generated {} forest tiles ({:.1}% of map)", forest_count, forest_percentage);
    forest
}

/// Generate latitude-based biome areas for realistic Aleutian island geography
/// - South: Grass/Meadows (temperate) - ~40% of land
/// - Middle: Tundra (arctic grassland) - ~35% of land  
/// - North: Alpine (rocky, harsh terrain) - ~25% of land (EXPANDED - should feel like its own biome)
fn generate_latitude_biomes(
    _config: &WorldGenConfig,
    noise: &Perlin,
    shore_distance: &[Vec<f64>],
    width: usize,
    height: usize,
) -> (Vec<Vec<bool>>, Vec<Vec<bool>>) {
    let mut tundra = vec![vec![false; width]; height];
    let mut alpine = vec![vec![false; width]; height];
    
    // EXPANDED BIOMES: Alpine should feel like its own large region
    // Latitude thresholds (0.0 = north, 1.0 = south)
    let alpine_threshold = 0.35;  // Top 35% of map is alpine (EXPANDED from 28%)
    let tundra_threshold = 0.58;  // 35-58% from top is tundra (23% of map - REDUCED from 32%)
    // Below 58% (42% of map) is temperate (grass/forest)
    
    // Noise scales for natural, irregular biome boundaries with MORE variation
    let boundary_noise_scale = 0.012; // Larger features
    let detail_noise_scale = 0.035;
    let large_scale_noise = 0.005; // Very large-scale variation
    
    for y in 0..height {
        // Calculate latitude progress (0.0 = top/north, 1.0 = bottom/south)
        let latitude = y as f64 / height as f64;
        
        for x in 0..width {
            // Skip water areas
            if shore_distance[y][x] < 0.0 {
                continue;
            }
            
            // Add multiple noise layers for organic, wavy biome boundaries
            let boundary_noise = noise.get([x as f64 * boundary_noise_scale, y as f64 * boundary_noise_scale, 7000.0]);
            let detail_noise = noise.get([x as f64 * detail_noise_scale, y as f64 * detail_noise_scale, 7500.0]);
            let large_noise = noise.get([x as f64 * large_scale_noise, y as f64 * large_scale_noise, 7800.0]);
            
            // Combined noise creates more dramatic, natural biome boundaries
            // Large scale noise creates sweeping north-south variations
            let noise_offset = boundary_noise * 0.10 + detail_noise * 0.04 + large_noise * 0.06;
            let effective_latitude = latitude + noise_offset;
            
            // Determine biome based on effective latitude
            if effective_latitude < alpine_threshold {
                alpine[y][x] = true;
            } else if effective_latitude < tundra_threshold {
                tundra[y][x] = true;
            }
            // Everything else is temperate (grass/forest) - no flag needed
        }
    }
    
    // Count biome tiles for logging
    let alpine_count: usize = alpine.iter().flat_map(|row| row.iter()).filter(|&&b| b).count();
    let tundra_count: usize = tundra.iter().flat_map(|row| row.iter()).filter(|&&b| b).count();
    let total_land_tiles: usize = shore_distance.iter()
        .flat_map(|row| row.iter())
        .filter(|&&d| d >= 0.0)
        .count();
    
    log::info!("Generated latitude biomes: {} alpine tiles ({:.1}%), {} tundra tiles ({:.1}%)", 
               alpine_count, (alpine_count as f64 / total_land_tiles.max(1) as f64) * 100.0,
               tundra_count, (tundra_count as f64 / total_land_tiles.max(1) as f64) * 100.0);
    
    (tundra, alpine)
}

/// Generate forest areas that respect latitude biome boundaries
/// Forests are SPARSE organic patches with very high tree density - NOT dominant terrain
/// Grass meadows should dominate the south, with forests being occasional dense groves
/// SPECIAL: Hot springs are surrounded by dense forest rings with organic paths leading in
fn generate_forest_areas_with_biomes(
    _config: &WorldGenConfig,
    noise: &Perlin,
    shore_distance: &[Vec<f64>],
    river_network: &[Vec<bool>],
    lake_map: &[Vec<bool>],
    road_network: &[Vec<bool>],
    hot_spring_water: &[Vec<bool>],
    hot_spring_beach: &[Vec<bool>],
    hot_spring_centers: &[(f32, f32, i32)],
    quarry_dirt: &[Vec<bool>],
    tundra_areas: &[Vec<bool>],
    alpine_areas: &[Vec<bool>],
    width: usize,
    height: usize,
) -> Vec<Vec<bool>> {
    let mut forest = vec![vec![false; width]; height];
    
    // Forest generation parameters - Adjusted for larger, longer forests, especially in south
    // Forests should be ~12-15% of land (increased from 8-12%)
    let forest_noise_scale = 0.008; // Lower frequency = larger patches (was 0.012)
    let forest_threshold = 0.50; // Lower threshold = more forests (was 0.62)
    let min_shore_distance = 25.0; // Forests stay further from shore
    let forest_edge_noise_scale = 0.06; // Fine detail for organic forest edges
    let secondary_noise_scale = 0.003; // Lower frequency = larger forest regions (was 0.004)
    
    // ===== PHASE 1: Generate dense forest rings around hot springs =====
    // Each hot spring should feel like a hidden clearing in dense woods
    log::info!("🌲 Generating dense forest rings around {} hot springs...", hot_spring_centers.len());
    
    for (center_x, center_y, water_radius) in hot_spring_centers {
        let cx = *center_x as i32;
        let cy = *center_y as i32;
        let water_r = *water_radius;
        
        // Forest ring parameters
        let forest_inner_radius = water_r + 4;  // Start forest just outside beach (4 tiles from water edge)
        let forest_outer_radius = water_r + 20; // Dense forest extends 16 tiles beyond water
        let path_width = 3; // Width of the path in tiles
        
        // Determine path direction (random but deterministic based on position)
        // Use noise to pick a direction that feels natural
        let path_angle_noise = noise.get([*center_x as f64 * 0.1, *center_y as f64 * 0.1, 8888.0]);
        let path_angle = (path_angle_noise + 1.0) * std::f64::consts::PI; // 0 to 2*PI
        
        // Create the forest ring with an organic path cut through
        for dy in -forest_outer_radius..=forest_outer_radius {
            for dx in -forest_outer_radius..=forest_outer_radius {
                let tile_x = cx + dx;
                let tile_y = cy + dy;
                
                // Bounds check
                if tile_x < 0 || tile_y < 0 || tile_x >= width as i32 || tile_y >= height as i32 {
                    continue;
                }
                
                let tx = tile_x as usize;
                let ty = tile_y as usize;
                
                // Skip if in tundra/alpine
                if tundra_areas[ty][tx] || alpine_areas[ty][tx] {
                    continue;
                }
                
                // Skip water, beach, roads
                if hot_spring_water[ty][tx] || hot_spring_beach[ty][tx] {
                    continue;
                }
                if river_network[ty][tx] || lake_map[ty][tx] {
                    continue;
                }
                if road_network[ty][tx] {
                    continue;
                }
                if shore_distance[ty][tx] < 0.0 {
                    continue; // Skip ocean
                }
                
                // Calculate distance from hot spring center
                let dist = ((dx * dx + dy * dy) as f32).sqrt();
                
                // Check if this tile is in the forest ring zone
                if dist >= forest_inner_radius as f32 && dist <= forest_outer_radius as f32 {
                    // Calculate angle from center to this tile
                    let tile_angle = (dy as f64).atan2(dx as f64);
                    
                    // Check if this tile is in the path corridor
                    let angle_diff = (tile_angle - path_angle).abs();
                    let angle_diff_wrapped = angle_diff.min(2.0 * std::f64::consts::PI - angle_diff);
                    
                    // Path width varies with distance (wider at edge, narrower near spring)
                    let dist_factor = (dist - forest_inner_radius as f32) / (forest_outer_radius - forest_inner_radius) as f32;
                    let effective_path_width = (path_width as f32 * (0.5 + dist_factor * 0.5)) / dist.max(1.0);
                    let is_in_path = angle_diff_wrapped < effective_path_width as f64;
                    
                    if !is_in_path {
                        // Add organic edge variation using noise
                        let edge_noise = noise.get([tile_x as f64 * 0.08, tile_y as f64 * 0.08, 6500.0]);
                        let inner_variation = edge_noise * 2.0;
                        let outer_variation = edge_noise * 3.0;
                        
                        let adjusted_inner = forest_inner_radius as f64 + inner_variation;
                        let adjusted_outer = forest_outer_radius as f64 + outer_variation;
                        
                        if dist as f64 >= adjusted_inner && dist as f64 <= adjusted_outer {
                            forest[ty][tx] = true;
                        }
                    }
                }
            }
        }
    }
    
    // ===== PHASE 2: Generate sparse organic forest patches elsewhere =====
    for y in 0..height {
        for x in 0..width {
            // Skip tiles that shouldn't have forests
            let shore_dist = shore_distance[y][x];
            
            // No forests in tundra or alpine biomes (too cold/rocky)
            if tundra_areas[y][x] || alpine_areas[y][x] {
                continue;
            }
            
            // No forests on/near water, beaches, roads, quarries, hot springs
            if shore_dist < min_shore_distance {
                continue;
            }
            if river_network[y][x] || lake_map[y][x] {
                continue;
            }
            if road_network[y][x] {
                continue;
            }
            if hot_spring_water[y][x] || hot_spring_beach[y][x] {
                continue;
            }
            if quarry_dirt[y][x] {
                continue;
            }
            
            // Skip if already marked as forest (from hot spring rings)
            if forest[y][x] {
                continue;
            }
            
            // Use multiple noise layers for natural-looking forest distribution
            let base_noise = noise.get([x as f64 * forest_noise_scale, y as f64 * forest_noise_scale, 6000.0]);
            let detail_noise = noise.get([x as f64 * forest_edge_noise_scale, y as f64 * forest_edge_noise_scale, 6100.0]);
            let large_scale_noise = noise.get([x as f64 * secondary_noise_scale, y as f64 * secondary_noise_scale, 6200.0]);
            
            // Combine noise layers - base determines regions, detail adds organic edges
            // Large scale noise creates natural variation in where forests can appear
            let combined_noise = (base_noise * 0.5 + detail_noise * 0.2 + large_scale_noise * 0.3 + 1.0) / 2.0;
            
            // SOUTH BIAS: Encourage more forests in the south (temperate region)
            // y=0 is north, y=height is south. South starts around y=height*0.6
            let south_factor = if y as f32 > height as f32 * 0.6 {
                // In south (temperate region): boost forest likelihood
                let south_progress = ((y as f32 - height as f32 * 0.6) / (height as f32 * 0.4)).min(1.0);
                0.12 * south_progress // Up to 0.12 bonus in deep south
            } else {
                0.0 // No bonus in north/middle
            };
            
            // Additional organic shaping - forests cluster in certain areas
            let cluster_noise = noise.get([x as f64 * 0.025, y as f64 * 0.025, 6300.0]);
            let cluster_factor = (cluster_noise + 1.0) / 2.0; // 0-1 range
            
            // Forests grow where threshold is exceeded, with south bias and cluster factor
            // Reduced cluster penalty to allow more forests
            let effective_threshold = forest_threshold + (1.0 - cluster_factor) * 0.10 - south_factor as f64;
            
            if combined_noise > effective_threshold {
                forest[y][x] = true;
            }
        }
    }
    
    // Count forest tiles for logging
    let forest_count: usize = forest.iter().flat_map(|row| row.iter()).filter(|&&b| b).count();
    let total_land_tiles: usize = shore_distance.iter()
        .flat_map(|row| row.iter())
        .filter(|&&d| d >= 0.0)
        .count();
    let forest_percentage = (forest_count as f64 / total_land_tiles.max(1) as f64) * 100.0;
    
    log::info!("Generated {} forest tiles ({:.1}% of land) - including hot spring rings", forest_count, forest_percentage);
    forest
}


/// Generate coral reef zones (deep sea areas for living coral spawning)
/// Coral reefs spawn in deep sea areas (shore_distance < -15 tiles from shore)
/// Uses noise-based clustering similar to forest generation
fn generate_coral_reef_zones(
    config: &WorldGenConfig,
    noise: &Perlin,
    shore_distance: &[Vec<f64>],
    width: usize,
    height: usize,
) -> Vec<Vec<bool>> {
    let mut coral_reef = vec![vec![false; width]; height];
    
    // Coral reef generation parameters
    let reef_noise_scale = 0.012; // Large-scale reef regions
    let reef_threshold = 0.35; // Higher = less reef coverage
    let min_shore_distance = -15.0; // Must be at least 15 tiles from shore (deep sea)
    let max_shore_distance = -30.0; // Don't spawn too far out (optional max distance)
    
    let mut reef_count = 0;
    
    for y in 0..height {
        for x in 0..width {
            let shore_dist = shore_distance[y][x];
            
            // Only spawn in deep sea (far from shore)
            if shore_dist > min_shore_distance || shore_dist < max_shore_distance {
                continue;
            }
            
            // Use noise to create organic reef clusters
            let noise_val = noise.get([x as f64 * reef_noise_scale, y as f64 * reef_noise_scale]);
            
            if noise_val > reef_threshold {
                coral_reef[y][x] = true;
                reef_count += 1;
            }
        }
    }
    
    let reef_percentage = (reef_count as f64 / (width * height) as f64) * 100.0;
    log::info!("Generated {} coral reef tiles ({:.2}% of map) - deep sea areas", reef_count, reef_percentage);
    coral_reef
}

/// Generate reed marsh centers organically along rivers and lakes
/// Reed marshes are natural wetland areas where players can hunt terns, collect reeds,
/// find washed-up barrels, and scavenge memory shards. They cluster naturally along
/// waterways forming chains of wetlands.
fn generate_reed_marsh_centers(
    config: &WorldGenConfig,
    noise: &Perlin,
    river_network: &[Vec<bool>],
    lake_map: &[Vec<bool>],
    shore_distance: &[Vec<f64>],
    width: usize,
    height: usize,
) -> Vec<(f32, f32)> {
    let mut marsh_centers: Vec<(f32, f32)> = Vec::new();
    
    // Scale count with map size - more marshes for larger maps
    let map_area_tiles = (width * height) as f32;
    let base_area_tiles = 360_000.0; // 600x600 baseline
    let scale_factor = (map_area_tiles / base_area_tiles).sqrt();
    
    // Target count: ~16 on 600x600, scales naturally with larger maps
    // Use 0.9 power for slightly sub-linear scaling (very large maps don't need proportionally as many)
    let target_count = ((REED_MARSH_BASE_COUNT as f32) * scale_factor.powf(0.9))
        .round()
        .max(6.0) as usize; // Minimum 6 marshes even on small maps
    
    log::info!("🌾 Generating organic reed marsh distribution along waterways (target: {}, scale factor: {:.2}x)", target_count, scale_factor);
    
    // Scan the map for good marsh locations with finer granularity
    let scan_step = 8; // Finer scan for more candidate positions
    let check_radius = 5; // Smaller radius for precise placement along water edges
    let min_water_tiles = ((REED_MARSH_MIN_WATER_TILES as f32) * scale_factor.max(0.4)).max(4.0) as usize;
    
    // Structure to track marsh candidates with detailed scoring
    struct MarshCandidate {
        x: f32,
        y: f32,
        water_score: usize,    // Combined river + lake tiles
        river_score: usize,    // River tiles specifically (for chaining)
        lake_score: usize,     // Lake tiles specifically
        edge_score: usize,     // Land tiles adjacent to water (marshy edges)
        is_river: bool,        // Primarily river marsh vs lake marsh
        noise_bonus: f32,      // Noise-based organic variation
    }
    
    let mut candidates: Vec<MarshCandidate> = Vec::new();
    
    for scan_y in (check_radius..height.saturating_sub(check_radius)).step_by(scan_step) {
        for scan_x in (check_radius..width.saturating_sub(check_radius)).step_by(scan_step) {
            let mut river_count = 0;
            let mut lake_count = 0;
            let mut edge_count = 0; // Land tiles adjacent to water
            
            for dy in -(check_radius as i32)..=(check_radius as i32) {
                for dx in -(check_radius as i32)..=(check_radius as i32) {
                    let check_x = (scan_x as i32 + dx) as usize;
                    let check_y = (scan_y as i32 + dy) as usize;
                    
                    if check_x < width && check_y < height {
                        let is_river = river_network[check_y][check_x];
                        let is_lake = lake_map[check_y][check_x];
                        
                        if is_river {
                            river_count += 1;
                        }
                        if is_lake {
                            lake_count += 1;
                        }
                        
                        // Count edge tiles - land tiles that touch water (creates marshy shoreline feel)
                        if !is_river && !is_lake && shore_distance[check_y][check_x] > 0.0 {
                            let mut adjacent_to_water = false;
                            for ny in -1..=1i32 {
                                for nx in -1..=1i32 {
                                    let ax = (check_x as i32 + nx) as usize;
                                    let ay = (check_y as i32 + ny) as usize;
                                    if ax < width && ay < height {
                                        if river_network[ay][ax] || lake_map[ay][ax] {
                                            adjacent_to_water = true;
                                            break;
                                        }
                                    }
                                }
                                if adjacent_to_water { break; }
                            }
                            if adjacent_to_water {
                                edge_count += 1;
                            }
                        }
                    }
                }
            }
            
            let water_score = river_count + lake_count;
            
            // Good marsh locations need:
            // - Some water (river or lake) - lowered threshold for more organic spread
            // - At least 2 edge tiles (minimal marshy shoreline)
            // - Must be inland (not ocean coast)
            if water_score >= min_water_tiles && edge_count >= 2 {
                let shore_dist = shore_distance[scan_y][scan_x];
                if shore_dist > 8.0 { // Must be inland (not ocean shoreline)
                    let world_x_px = (scan_x as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                    let world_y_px = (scan_y as f32 + 0.5) * crate::TILE_SIZE_PX as f32;
                    
                    // Add noise-based organic variation to scoring
                    // This creates natural clustering in some areas and gaps in others
                    let noise_val = noise.get([scan_x as f64 * 0.02, scan_y as f64 * 0.02, 7.77]) as f32;
                    let noise_bonus = (noise_val + 1.0) * 0.5; // Normalize to 0-1
                    
                    candidates.push(MarshCandidate {
                        x: world_x_px,
                        y: world_y_px,
                        water_score,
                        river_score: river_count,
                        lake_score: lake_count,
                        edge_score: edge_count,
                        is_river: river_count > lake_count,
                        noise_bonus,
                    });
                }
            }
        }
    }
    
    // Sort by combined organic score - best marsh locations first
    // Balance water coverage, marshy edges, and noise variation for organic feel
    candidates.sort_by(|a, b| {
        // Base score from water and edges
        let base_a = a.water_score as f32 * 1.5 + a.edge_score as f32 * 2.5;
        let base_b = b.water_score as f32 * 1.5 + b.edge_score as f32 * 2.5;
        
        // Apply noise bonus for organic variation (multiplier between 0.7 and 1.3)
        let score_a = base_a * (0.7 + a.noise_bonus * 0.6);
        let score_b = base_b * (0.7 + b.noise_bonus * 0.6);
        
        score_b.partial_cmp(&score_a).unwrap_or(std::cmp::Ordering::Equal)
    });
    
    log::info!("🌾 Found {} potential reed marsh positions along waterways", candidates.len());
    
    // Select marsh positions with variable distance constraints for organic clustering
    let base_min_dist_sq = MIN_REED_MARSH_DISTANCE * MIN_REED_MARSH_DISTANCE;
    let chain_min_dist_sq = MIN_REED_MARSH_CHAIN_DISTANCE * MIN_REED_MARSH_CHAIN_DISTANCE;
    
    let mut river_marshes = 0;
    let mut lake_marshes = 0;
    
    // Track which marshes are part of "chains" along the same waterway
    struct PlacedMarsh {
        x: f32,
        y: f32,
        is_river: bool,
    }
    let mut placed_marshes: Vec<PlacedMarsh> = Vec::new();
    
    for candidate in &candidates {
        if marsh_centers.len() >= target_count {
            break;
        }
        
        // Check distance from existing marshes with variable constraints
        // River marshes along the same river can be closer (forming chains)
        // Different type marshes (river vs lake) need more distance
        let mut too_close = false;
        for placed in &placed_marshes {
            let dx = candidate.x - placed.x;
            let dy = candidate.y - placed.y;
            let dist_sq = dx * dx + dy * dy;
            
            // Same type (river-river or lake-lake) can be closer for natural chains
            let min_dist_sq = if candidate.is_river == placed.is_river {
                chain_min_dist_sq
            } else {
                base_min_dist_sq
            };
            
            if dist_sq < min_dist_sq {
                too_close = true;
                break;
            }
        }
        
        if !too_close {
            marsh_centers.push((candidate.x, candidate.y));
            placed_marshes.push(PlacedMarsh {
                x: candidate.x,
                y: candidate.y,
                is_river: candidate.is_river,
            });
            
            let marsh_type = if candidate.is_river { "river" } else { "lake" };
            if candidate.is_river { river_marshes += 1; } else { lake_marshes += 1; }
            
            log::info!("🌾 Reed Marsh #{} ({}): ({:.0}, {:.0}) - water: {}, edges: {}, noise: {:.2}", 
                       marsh_centers.len(), marsh_type, candidate.x, candidate.y, 
                       candidate.water_score, candidate.edge_score, candidate.noise_bonus);
        }
    }
    
    // If we haven't hit target, do a second pass with relaxed constraints
    // This ensures we get organic coverage even in sparser water areas
    if marsh_centers.len() < target_count && candidates.len() > marsh_centers.len() {
        let relaxed_chain_dist_sq = (MIN_REED_MARSH_CHAIN_DISTANCE * 0.7).powi(2);
        
        for candidate in &candidates {
            if marsh_centers.len() >= target_count {
                break;
            }
            
            // Skip if already placed
            let already_placed = placed_marshes.iter().any(|p| 
                (p.x - candidate.x).abs() < 10.0 && (p.y - candidate.y).abs() < 10.0
            );
            if already_placed { continue; }
            
            let mut too_close = false;
            for placed in &placed_marshes {
                let dx = candidate.x - placed.x;
                let dy = candidate.y - placed.y;
                let dist_sq = dx * dx + dy * dy;
                
                if dist_sq < relaxed_chain_dist_sq {
                    too_close = true;
                    break;
                }
            }
            
            if !too_close {
                marsh_centers.push((candidate.x, candidate.y));
                placed_marshes.push(PlacedMarsh {
                    x: candidate.x,
                    y: candidate.y,
                    is_river: candidate.is_river,
                });
                
                let marsh_type = if candidate.is_river { "river" } else { "lake" };
                if candidate.is_river { river_marshes += 1; } else { lake_marshes += 1; }
                
                log::info!("🌾 Reed Marsh #{} ({}, relaxed): ({:.0}, {:.0})", 
                           marsh_centers.len(), marsh_type, candidate.x, candidate.y);
            }
        }
    }
    
    log::info!("🌾 Generated {} organic reed marsh zones ({} along rivers, {} around lakes)", 
               marsh_centers.len(), river_marshes, lake_marshes);
    marsh_centers
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
    
    // Hot spring water (inner pool) - uses distinct HotSpringWater tile type (teal/turquoise)
    if features.hot_spring_water[y][x] {
        return TileType::HotSpringWater;
    }
        
    // Hot spring beach (shore) - just like regular beaches
    if features.hot_spring_beach[y][x] {
        return TileType::Beach;
    }
    
    // Beach areas around water - CHECK AFTER rivers/lakes/hot springs
    // ASPHALT COMPOUNDS: Central compound and mini-compounds at road terminals
    // Check FIRST - terminal compounds take priority over beach tiles for clear visibility
    // This allows terminal compounds to overlap onto beach areas
    if features.asphalt_compound[y][x] {
        return TileType::Asphalt;
    }
    
    // DIRT RING: Rough organic dirt transition around the asphalt compound
    // Checked right after asphalt so the ring overrides beach/grass/etc.
    if features.compound_dirt_ring[y][x] {
        return TileType::Dirt;
    }
    
    // EXPANDED: South side of main island gets 2-3x larger beach zones
    let center_y = features.height as i32 / 2;
    let is_south_side = world_y > center_y;
    
    // Base beach threshold - slightly larger overall
    let mut beach_threshold = 12.0;
    
    // Expand beach significantly on south side of main island
    if is_south_side && shore_distance > 0.0 && shore_distance < 60.0 {
        // Gradual expansion: max at the southern edge, tapering toward center
        let south_progress = (world_y - center_y) as f64 / (features.height as i32 - center_y) as f64;
        beach_threshold = 12.0 + (35.0 * south_progress); // Ranges from 12 to 47 tiles (much larger south beaches)
    }
    
    let near_water = is_near_water(features, x, y);
    if shore_distance < beach_threshold || near_water {
        return TileType::Beach;
    }
    
    // Roads can cross deep water (rivers/lakes) but NOT beaches
    // Check roads AFTER asphalt compounds so compound centers are paved
    if features.road_network[y][x] {
        return TileType::DirtRoad;
    }
    
    // Quarry areas - use dedicated Quarry tile type (rocky gray-brown texture)
    if features.quarry_dirt[y][x] {
        return TileType::Quarry;
    }
    
    // Quarry access roads - use regular DirtRoad tile type
    if features.quarry_roads[y][x] {
        return TileType::DirtRoad;
    }

    // Village dirt roads - fishing and hunting villages (for lampposts and atmosphere)
    if features.fishing_village_roads[y][x] {
        return TileType::DirtRoad;
    }
    if features.hunting_village_roads[y][x] {
        return TileType::DirtRoad;
    }
    
    // ALPINE BIOME: Rocky, sparse terrain in far north
    // Check BEFORE forest since alpine has no forests
    if features.alpine_areas[y][x] {
        return TileType::Alpine;
    }
    
    // TUNDRA BIOME: Arctic grassland in northern regions
    // Check BEFORE forest since tundra has no forests  
    if features.tundra_areas[y][x] {
        // Tundra can still have dirt patches (exposed permafrost)
        let dirt_noise = noise.get([world_x as f64 * 0.02, world_y as f64 * 0.015]);
        if dirt_noise > 0.45 && dirt_noise < 0.55 {
            return TileType::Dirt;
        }
        
        // TUNDRA GRASS PATCHES: Use different noise frequency for grass patches
        // Creates meadow-like areas within tundra similar to temperate grass
        let tundra_grass_noise = noise.get([
            world_x as f64 * 0.008 + 500.0,  // Offset to get different pattern from dirt
            world_y as f64 * 0.008 + 500.0
        ]);
        // Spawn TundraGrass in clustered regions (when noise is high)
        // ~25-30% of tundra will be grassy patches
        if tundra_grass_noise > 0.35 {
            return TileType::TundraGrass;
        }
        
        return TileType::Tundra;
    }
    
    // FOREST AREAS: Dense forested regions with higher tree density
    // Only in temperate zones (south of tundra line)
    if features.forest_areas[y][x] {
        return TileType::Forest;
    }
    
    // Dirt patches using noise (in temperate zone)
    let dirt_noise = noise.get([world_x as f64 * 0.02, world_y as f64 * 0.015]);
    if dirt_noise > 0.4 && dirt_noise < 0.6 {
        if config.dirt_patch_frequency > 0.0 {
            let dirt_threshold = 0.15 + (config.dirt_patch_frequency as f64 * 0.25);
            if (dirt_noise - 0.5).abs() < dirt_threshold {
                return TileType::Dirt;
            }
        }
    }
    
    // Default to grass (meadow areas) - temperate zone only
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
                TileType::Quarry => 192,   // Same as Dirt (rocky brown)
                TileType::Asphalt => 48,   // Dark gray (paved compounds)
                TileType::Forest => 100,   // Darker green (dense forest)
                TileType::Tundra => 140,   // Pale greenish-gray (arctic grassland)
                TileType::Alpine => 180,   // Light gray (rocky terrain)
                TileType::TundraGrass => 120, // Slightly greener than Tundra (grassy patches)
                TileType::Tilled => 200,   // Slightly darker than Dirt (freshly tilled soil)
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