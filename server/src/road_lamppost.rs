//! # Aleutian Whale Oil Road Lampposts
//!
//! Environmental doodads placed along dirt roads - Aleut-style carved lampposts
//! with whale oil lanterns that emit light at night.
//!
//! - Spawned sparsely and evenly along dirt roads
//! - Excluded from ALK central compound
//! - Sometimes (rarely) near barrel clusters
//! - No collision, visual and light only

use spacetimedb::{ReducerContext, SpacetimeType, Table};
use log;
use rand::Rng;

use crate::barrel::barrel as BarrelTableTrait;
use crate::environment::{calculate_chunk_index, is_position_in_central_compound};

/// Minimum distance between lampposts (pixels) - sparse placement, further apart
const MIN_LAMPPOST_DISTANCE_SQ: f32 = 700.0 * 700.0; // 700px between lampposts
/// Density: one lamppost per roughly this many road tiles (reduced by ~70% from original)
const ROAD_TILES_PER_LAMPPOST: f32 = 267.0; // Was 80; 80/0.3 ≈ 267 for 70% fewer spawns
/// Distance within which a lamppost is considered "near a barrel cluster" (for flavor)
const NEAR_BARREL_RADIUS_SQ: f32 = 250.0 * 250.0;

#[spacetimedb::table(name = road_lamppost, public)]
#[derive(Clone, Debug)]
pub struct RoadLamppost {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    #[index(btree)]
    pub chunk_index: u32,
    /// True if this lamppost was placed near a barrel cluster (for flavor)
    pub near_barrel_cluster: bool,
}

/// Spawn Aleutian whale oil lampposts along dirt roads.
/// Excludes ALK central compound. Spaced evenly but sparsely.
/// Rarely placed near barrel clusters.
pub fn spawn_road_lampposts(
    ctx: &ReducerContext,
    dirt_road_tiles: Vec<(i32, i32)>,
    barrel_cluster_positions: &[(f32, f32)],
) -> Result<u32, String> {
    let lampposts = ctx.db.road_lamppost();

    if lampposts.iter().count() > 0 {
        log::info!("[RoadLamppost] Lampposts already exist, skipping spawn");
        return Ok(0);
    }

    if dirt_road_tiles.is_empty() {
        log::info!("[RoadLamppost] No dirt road tiles available");
        return Ok(0);
    }

    // Target count: sparse - one per ~80 road tiles, cap by road availability
    let target_count = ((dirt_road_tiles.len() as f32) / ROAD_TILES_PER_LAMPPOST)
        .floor()
        .max(1.0) as u32;

    let max_attempts = target_count * 12;
    let mut spawned = 0u32;
    let mut spawn_positions: Vec<(f32, f32)> = Vec::new();

    log::info!(
        "[RoadLamppost] Spawning up to {} lampposts on {} dirt road tiles (excluding ALK compound)",
        target_count,
        dirt_road_tiles.len()
    );

    for _ in 0..max_attempts {
        if spawned >= target_count {
            break;
        }

        // Randomly pick a dirt road tile
        let tile_idx = ctx.rng().gen_range(0..dirt_road_tiles.len());
        let (tile_x, tile_y) = dirt_road_tiles[tile_idx];

        // Convert to world position (center of tile with slight random offset)
        let offset_x = ctx.rng().gen_range(-0.25..0.25) * crate::TILE_SIZE_PX as f32;
        let offset_y = ctx.rng().gen_range(-0.25..0.25) * crate::TILE_SIZE_PX as f32;
        let pos_x = (tile_x as f32 + 0.5) * crate::TILE_SIZE_PX as f32 + offset_x;
        let pos_y = (tile_y as f32 + 0.5) * crate::TILE_SIZE_PX as f32 + offset_y;

        // Exclude ALK central compound
        if is_position_in_central_compound(pos_x, pos_y) {
            continue;
        }

        // Check minimum distance from existing lampposts
        let mut too_close = false;
        for &(other_x, other_y) in &spawn_positions {
            let dx = pos_x - other_x;
            let dy = pos_y - other_y;
            if dx * dx + dy * dy < MIN_LAMPPOST_DISTANCE_SQ {
                too_close = true;
                break;
            }
        }
        if too_close {
            continue;
        }

        // Check minimum distance from barrels (don't overlap)
        let mut too_close_to_barrel = false;
        for barrel_entity in ctx.db.barrel().iter() {
            if barrel_entity.health == 0.0 {
                continue;
            }
            let dx = pos_x - barrel_entity.pos_x;
            let dy = pos_y - barrel_entity.pos_y;
            if dx * dx + dy * dy < 80.0 * 80.0 {
                too_close_to_barrel = true;
                break;
            }
        }
        if too_close_to_barrel {
            continue;
        }

        // Check monument collision (no lampposts inside monument buildings)
        if crate::monument::is_position_inside_monument_building(ctx, pos_x, pos_y) {
            continue;
        }

        // Mark if this lamppost ended up near a barrel cluster (for flavor)
        let near_barrel = barrel_cluster_positions.iter().any(|&(bx, by)| {
            let dx = pos_x - bx;
            let dy = pos_y - by;
            dx * dx + dy * dy < NEAR_BARREL_RADIUS_SQ
        });

        let chunk_idx = calculate_chunk_index(pos_x, pos_y);

        let new_lamppost = RoadLamppost {
            id: 0,
            pos_x,
            pos_y,
            chunk_index: chunk_idx,
            near_barrel_cluster: near_barrel,
        };

        match lampposts.try_insert(new_lamppost) {
            Ok(_) => {
                spawn_positions.push((pos_x, pos_y));
                spawned += 1;
                log::debug!(
                    "[RoadLamppost] Spawned lamppost {} at ({:.1}, {:.1}) near_barrel={}",
                    spawned,
                    pos_x,
                    pos_y,
                    near_barrel
                );
            }
            Err(e) => {
                log::warn!("[RoadLamppost] Failed to insert: {}", e);
            }
        }
    }

    log::info!(
        "[RoadLamppost] Spawned {} Aleutian whale oil lampposts along dirt roads",
        spawned
    );
    Ok(spawned)
}
