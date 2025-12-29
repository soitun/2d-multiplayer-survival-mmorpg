use spacetimedb::{SpacetimeType, Timestamp, Table, ReducerContext, Identity, TimeDuration};
use rand::Rng;

// Import table traits
use crate::player as PlayerTableTrait;
use crate::items::item_definition as ItemDefinitionTableTrait;
use crate::tree::tree as TreeTableTrait;
use crate::stone::stone as StoneTableTrait;
use crate::building::foundation_cell as FoundationCellTableTrait;
use crate::sound_events::{emit_sound_at_position, SoundType};

// --- Grass-Specific Constants ---

// Plant Fiber Drop Constants
// Boosted to make grass cutting a more viable fiber source
// At 8% chance with 12-18 drop, ~100 grass cuts = ~120 fiber (meaningful but still less than dedicated plants)
pub(crate) const PLANT_FIBER_DROP_CHANCE: f32 = 0.08; // 8% chance to drop fiber (was 4%)
pub(crate) const PLANT_FIBER_MIN_DROP: u32 = 12; // Minimum fiber dropped (was 8)
pub(crate) const PLANT_FIBER_MAX_DROP: u32 = 18; // Maximum fiber dropped (was 12)
pub(crate) const GRASS_INTERACTION_DISTANCE: f32 = 80.0; // Max distance to interact with grass
pub(crate) const GRASS_INTERACTION_DISTANCE_SQ: f32 = GRASS_INTERACTION_DISTANCE * GRASS_INTERACTION_DISTANCE;

// Grass Spawning Parameters - Optimized for dense "seas" of grass
pub(crate) const GRASS_DENSITY_PERCENT: f32 = 0.18; // Used for noise-based density calculation
pub(crate) const GRASS_SPAWN_NOISE_FREQUENCY: f64 = 1.2; // Much lower frequency = HUGE contiguous patches/regions (was 2.5, originally 10.0)
pub(crate) const GRASS_SPAWN_NOISE_THRESHOLD: f64 = 0.30; // Much lower threshold = very easy spawning, creates massive "seas" (was 0.45, originally 0.65)
pub(crate) const GRASS_SPAWN_WORLD_MARGIN_TILES: u32 = 2; // Margin from world edges
pub(crate) const MAX_GRASS_SEEDING_ATTEMPTS_FACTOR: u32 = 4; // Reduced from 5 to 4 for faster seeding
pub(crate) const MIN_GRASS_DISTANCE_PX: f32 = 3.0; // Reduced from 10.0 to 3.0 for much denser patches
pub(crate) const MIN_GRASS_DISTANCE_SQ: f32 = MIN_GRASS_DISTANCE_PX * MIN_GRASS_DISTANCE_PX;
// Distances from other objects
pub(crate) const MIN_GRASS_TREE_DISTANCE_PX: f32 = 50.0; 
pub(crate) const MIN_GRASS_TREE_DISTANCE_SQ: f32 = MIN_GRASS_TREE_DISTANCE_PX * MIN_GRASS_TREE_DISTANCE_PX;
pub(crate) const MIN_GRASS_STONE_DISTANCE_PX: f32 = 40.0;
pub(crate) const MIN_GRASS_STONE_DISTANCE_SQ: f32 = MIN_GRASS_STONE_DISTANCE_PX * MIN_GRASS_STONE_DISTANCE_PX;


pub(crate) const GRASS_INITIAL_HEALTH: u32 = 1; // Changed to 1 for one-hit destruction
pub(crate) const MIN_GRASS_RESPAWN_TIME_SECS: u64 = 60; // 1 minute
pub(crate) const MAX_GRASS_RESPAWN_TIME_SECS: u64 = 180; // 3 minutes

// NEW: Grass disturbance constants
pub(crate) const GRASS_DISTURBANCE_RADIUS: f32 = 48.0; // Doubled from 24.0 - Radius around player to check for grass disturbance
pub(crate) const GRASS_DISTURBANCE_RADIUS_SQ: f32 = GRASS_DISTURBANCE_RADIUS * GRASS_DISTURBANCE_RADIUS;
pub(crate) const GRASS_DISTURBANCE_DURATION_SECS: f32 = 1.5; // How long the disturbance effect lasts
pub(crate) const GRASS_DISTURBANCE_STRENGTH: f32 = 2.0; // Multiplier for disturbance sway intensity

// PERFORMANCE FLAG: Disable grass disturbance entirely for testing
pub(crate) const DISABLE_GRASS_DISTURBANCE: bool = true; // TESTING: Completely disable grass disturbance to isolate lag source

// --- Grass Enums and Structs ---

// Define different types/visuals of grass if needed later
#[derive(Clone, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, SpacetimeType)]
pub enum GrassAppearanceType {
    // Land foliage
    PatchA, // Default patch
    PatchB, // Another variant
    PatchC, // Yet another variant
    PatchD, // Additional variant (grass4.png)
    PatchE, // Additional variant (grass5.png)
    TallGrassA,
    TallGrassB,
    BushRounded,
    BushSpiky,
    BushFlowering,
    BramblesA,
    BramblesB,
    
    // Tundra foliage
    TundraPatchA,      // grass1_tundra.png
    TundraPatchB,      // grass2_tundra.png
    TundraPatchC,      // grass_tundra3.png
    TundraPatchD,      // grass_tundra4.png
    TallGrassTundraA,  // tall_grass_tundra_a.png
    TallGrassTundraB,  // tall_grass_tundra_b.png
    
    // Alpine foliage
    AlpinePatchA,      // grass_alpine1.png
    AlpinePatchB,      // grass_alpine2.png
    AlpinePatchC,      // grass_alpine3.png
    AlpinePatchD,      // grass_alpine4.png
    TallGrassAlpineA,  // tall_grass_alpine_a.png
    TallGrassAlpineB,  // tall_grass_alpine_b.png
    
    // Beach foliage
    BeachGrassA,     // Coastal dune grass
}

// --- NEW: Helper function to check if grass type is a bramble (indestructible) ---
impl GrassAppearanceType {
    /// Returns true if this grass type is a bramble and should be indestructible
    pub fn is_bramble(&self) -> bool {
        matches!(self, GrassAppearanceType::BramblesA | GrassAppearanceType::BramblesB)
    }
    
    /// Returns true if this grass type is beach foliage that should spawn on beach tiles
    pub fn is_beach_foliage(&self) -> bool {
        matches!(self, GrassAppearanceType::BeachGrassA)
    }
}

// Helper function for backwards compatibility and external use
pub fn is_grass_type_bramble(appearance_type: &GrassAppearanceType) -> bool {
    appearance_type.is_bramble()
}

#[spacetimedb::table(name = grass, public, index(name = idx_chunk_health, btree(columns = [chunk_index, health])))]
#[derive(Clone, Debug)]
pub struct Grass {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    pub health: u32,
    pub appearance_type: GrassAppearanceType, // For different sprites/sway
    #[index(btree)]
    pub chunk_index: u32,
    pub last_hit_time: Option<Timestamp>, // When it was last "chopped"
    pub respawn_at: Option<Timestamp>,    // When it should reappear after being chopped
    // For client-side sway animation, to give each patch a unique offset
    pub sway_offset_seed: u32, 
    pub sway_speed: f32, // RENAMED: Was sway_speed_multiplier. This is now the actual speed.
    // NEW: Player disturbance tracking
    pub disturbed_at: Option<Timestamp>, // When grass was last disturbed by player movement
    pub disturbance_direction_x: f32,    // X component of disturbance direction (opposite to player movement)
    pub disturbance_direction_y: f32,    // Y component of disturbance direction (opposite to player movement)
} 

// --- NEW: Grass Respawn Scheduling --- 

/// Data needed to recreate a grass entity.
/// We don't store the original ID because the new grass will get a new auto_inc ID.
#[derive(Clone, Debug, SpacetimeType)]
pub struct GrassRespawnData {
    pub pos_x: f32,
    pub pos_y: f32,
    pub appearance_type: GrassAppearanceType,
    pub chunk_index: u32,
    pub sway_offset_seed: u32,
    pub sway_speed: f32, // RENAMED: Was sway_speed_multiplier. This is now the actual speed.
    // NOTE: We don't include disturbance data in respawn - grass respawns in undisturbed state
}

#[spacetimedb::table(name = grass_respawn_schedule, scheduled(process_grass_respawn))]
#[derive(Clone, Debug)]
pub struct GrassRespawnSchedule {
    #[primary_key]
    #[auto_inc]
    pub schedule_id: u64, // Unique ID for this respawn event
    pub respawn_data: GrassRespawnData, // The data needed to recreate the grass
    pub scheduled_at: spacetimedb::ScheduleAt, // When this respawn should occur
}

#[spacetimedb::reducer]
pub fn process_grass_respawn(ctx: &spacetimedb::ReducerContext, schedule_entry: GrassRespawnSchedule) -> Result<(), String> {
    // Security check: Only the module itself should trigger this via scheduling
    if ctx.sender != ctx.identity() {
        return Err("process_grass_respawn can only be called by the scheduler.".to_string());
    }

    let data = schedule_entry.respawn_data;
    
    // Check for collision with entities and foundations before respawning
    // Check proximity to trees
    let trees = ctx.db.tree();
    for tree in trees.iter() {
        if tree.health > 0 {
            let dx = data.pos_x - tree.pos_x;
            let dy = data.pos_y - tree.pos_y;
            if dx * dx + dy * dy < MIN_GRASS_TREE_DISTANCE_SQ {
                log::info!("Grass respawn at ({}, {}) blocked by tree, skipping", data.pos_x, data.pos_y);
                return Ok(()); // Skip respawn - blocked by tree
            }
        }
    }
    
    // Check proximity to stones
    let stones = ctx.db.stone();
    for stone in stones.iter() {
        if stone.health > 0 {
            let dx = data.pos_x - stone.pos_x;
            let dy = data.pos_y - stone.pos_y;
            if dx * dx + dy * dy < MIN_GRASS_STONE_DISTANCE_SQ {
                log::info!("Grass respawn at ({}, {}) blocked by stone, skipping", data.pos_x, data.pos_y);
                return Ok(()); // Skip respawn - blocked by stone
            }
        }
    }
    
    // Check proximity to foundations (48px buffer)
    const MIN_GRASS_FOUNDATION_DISTANCE_SQ: f32 = 48.0 * 48.0;
    let foundations = ctx.db.foundation_cell();
    let grass_tile_x = (data.pos_x / crate::building::FOUNDATION_TILE_SIZE_PX as f32).floor() as i32;
    let grass_tile_y = (data.pos_y / crate::building::FOUNDATION_TILE_SIZE_PX as f32).floor() as i32;
    
    // Check nearby foundation cells (2 cell radius)
    for offset_x in -2..=2 {
        for offset_y in -2..=2 {
            let check_x = grass_tile_x + offset_x;
            let check_y = grass_tile_y + offset_y;
            
            for foundation in foundations.idx_cell_coords().filter((check_x, check_y)) {
                if !foundation.is_destroyed {
                    log::info!("Grass respawn at ({}, {}) blocked by foundation, skipping", data.pos_x, data.pos_y);
                    return Ok(()); // Skip respawn - blocked by foundation
                }
            }
        }
    }
    
    // Re-insert the grass entity into the main Grass table
    // The new grass entity will get a new `id` due to `#[auto_inc]` on Grass.id
    match ctx.db.grass().try_insert(crate::grass::Grass {
        id: 0, // Will be auto-incremented
        pos_x: data.pos_x,
        pos_y: data.pos_y,
        health: GRASS_INITIAL_HEALTH, // Respawn with full health
        appearance_type: data.appearance_type,
        chunk_index: data.chunk_index,
        last_hit_time: None,
        respawn_at: None, // Not needed for newly spawned grass
        sway_offset_seed: data.sway_offset_seed,
        sway_speed: data.sway_speed, // UPDATED: Use the direct sway_speed from respawn data
        disturbed_at: None,
        disturbance_direction_x: 0.0,
        disturbance_direction_y: 0.0,
    }) {
        Ok(new_grass) => {
            log::info!("Respawned grass entity at ({}, {}) with new ID {}", new_grass.pos_x, new_grass.pos_y, new_grass.id);
        }
        Err(e) => {
            log::error!("Failed to respawn grass at ({}, {}): {}", data.pos_x, data.pos_y, e);
            // Optionally, reschedule if it failed due to a transient issue, 
            // but for now, just log the error.
        }
    }
    Ok(())
}

/// Damage grass entity - called when player attacks grass
/// Destroys grass (1 HP), schedules respawn, and has 4% chance to drop 8-12 Plant Fiber
#[spacetimedb::reducer]
pub fn damage_grass(ctx: &ReducerContext, grass_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender;
    let grass_table = ctx.db.grass();
    let players = ctx.db.player();
    
    // 1. Validate player
    let player = players.identity().find(&sender_id)
        .ok_or_else(|| "Player not found".to_string())?;
    
    if player.is_dead {
        return Err("Cannot interact with grass while dead.".to_string());
    }
    
    if player.is_knocked_out {
        return Err("Cannot interact with grass while knocked out.".to_string());
    }
    
    // 2. Find the grass entity
    let mut grass = grass_table.id().find(grass_id)
        .ok_or_else(|| format!("Grass entity {} not found", grass_id))?;
    
    // 3. Check if grass is alive
    if grass.health == 0 {
        return Err("Grass is already destroyed.".to_string());
    }
    
    // 4. Check if grass is a bramble (indestructible)
    if grass.appearance_type.is_bramble() {
        return Err("Brambles cannot be destroyed.".to_string());
    }
    
    // NOTE: Distance check removed - combat system already validates attack range
    // with the weapon's actual attack_range (which varies by weapon type).
    // The old hardcoded 80px check was causing a mismatch with the visual attack cone
    // and preventing weapons with extended range (spears, scythes) from hitting grass.
    
    // 5. Damage the grass (1 HP = instant destroy)
    grass.health = 0;
    grass.last_hit_time = Some(ctx.timestamp);
    
    // 6. Schedule respawn
    let respawn_secs = ctx.rng().gen_range(MIN_GRASS_RESPAWN_TIME_SECS..=MAX_GRASS_RESPAWN_TIME_SECS);
    let respawn_time = ctx.timestamp + TimeDuration::from_micros(respawn_secs as i64 * 1_000_000);
    
    // Store respawn data
    let respawn_data = GrassRespawnData {
        pos_x: grass.pos_x,
        pos_y: grass.pos_y,
        appearance_type: grass.appearance_type.clone(),
        chunk_index: grass.chunk_index,
        sway_offset_seed: grass.sway_offset_seed,
        sway_speed: grass.sway_speed,
    };
    
    // Schedule the respawn
    match ctx.db.grass_respawn_schedule().try_insert(GrassRespawnSchedule {
        schedule_id: 0, // Auto-inc
        respawn_data,
        scheduled_at: spacetimedb::ScheduleAt::Time(respawn_time),
    }) {
        Ok(_) => {
            log::info!("Scheduled grass {} respawn in {} seconds", grass_id, respawn_secs);
        }
        Err(e) => {
            log::error!("Failed to schedule grass respawn: {}", e);
        }
    }
    
    // 7. Delete the grass entity (it's destroyed)
    let grass_pos_x = grass.pos_x;
    let grass_pos_y = grass.pos_y;
    grass_table.id().delete(grass_id);
    
    log::info!("Player {:?} destroyed grass {} at ({:.1}, {:.1})", sender_id, grass_id, grass_pos_x, grass_pos_y);
    
    // 7b. Play grass cutting sound
    if let Err(e) = emit_sound_at_position(ctx, SoundType::GrassCut, grass_pos_x, grass_pos_y, 0.6, sender_id) {
        log::warn!("Failed to emit grass cut sound: {}", e);
    }
    
    // 8. Roll for Plant Fiber drop (8% chance)
    let drop_roll: f32 = ctx.rng().gen();
    if drop_roll < PLANT_FIBER_DROP_CHANCE {
        // Find Plant Fiber item definition
        let item_defs = ctx.db.item_definition();
        if let Some(fiber_def) = item_defs.iter().find(|def| def.name == "Plant Fiber") {
            // Random quantity between 10-15
            let fiber_quantity = ctx.rng().gen_range(PLANT_FIBER_MIN_DROP..=PLANT_FIBER_MAX_DROP);
            
            // Drop the fiber at grass position
            match crate::dropped_item::create_dropped_item_entity(
                ctx,
                fiber_def.id,
                fiber_quantity,
                grass_pos_x,
                grass_pos_y,
            ) {
                Ok(_) => {
                    log::info!("Lucky! Dropped {} Plant Fiber from grass at ({:.1}, {:.1})", 
                             fiber_quantity, grass_pos_x, grass_pos_y);
                }
                Err(e) => {
                    log::error!("Failed to drop Plant Fiber: {}", e);
                }
            }
        } else {
            log::warn!("Plant Fiber item definition not found, cannot drop fiber");
        }
    }
    
    Ok(())
} 