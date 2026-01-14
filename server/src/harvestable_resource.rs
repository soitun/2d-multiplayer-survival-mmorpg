use spacetimedb::{Table, ReducerContext, Identity, Timestamp};
use log;
use rand::Rng;

// Module imports
use crate::collectible_resources::{
    BASE_RESOURCE_RADIUS, PLAYER_RESOURCE_INTERACTION_DISTANCE_SQUARED,
    validate_player_resource_interaction,
    collect_resource_and_schedule_respawn,
    RespawnableResource
};

// Import plant types and configurations from the dedicated database
use crate::plants_database::{PlantType, PlantConfig, SpawnCondition, PLANT_CONFIGS};

// Table trait imports for database access
use crate::items::{inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait};
use crate::player as PlayerTableTrait;
use crate::player_progression::player_stats as PlayerStatsTableTrait;

// --- Unified Harvestable Resource Table ---

#[spacetimedb::table(name = harvestable_resource, public)]
#[derive(Clone, Debug)]
pub struct HarvestableResource {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub plant_type: PlantType,
    pub pos_x: f32,
    pub pos_y: f32,
    #[index(btree)]
    pub chunk_index: u32,
    /// When this resource should respawn. Use Timestamp::UNIX_EPOCH (0) for "not respawning".
    /// This allows efficient btree index range queries: .respawn_at().filter(1..=now)
    #[index(btree)]
    pub respawn_at: Timestamp,
    pub is_player_planted: bool, // NEW: Track if this is a farmed crop vs wild plant
}

// Implement RespawnableResource trait for HarvestableResource
impl RespawnableResource for HarvestableResource {
    fn id(&self) -> u64 {
        self.id
    }
    
    fn pos_x(&self) -> f32 {
        self.pos_x
    }
    
    fn pos_y(&self) -> f32 {
        self.pos_y
    }
    
    fn respawn_at(&self) -> Timestamp {
        self.respawn_at
    }
    
    fn set_respawn_at(&mut self, time: Timestamp) {
        self.respawn_at = time;
    }
}

// --- Player Discovery Tracking ---

/// Tracks which plant types each player has discovered (harvested at least once)
#[spacetimedb::table(name = player_discovered_plant, public)]
#[derive(Clone, Debug)]
pub struct PlayerDiscoveredPlant {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub player_id: Identity,
    pub plant_type: PlantType,
    pub discovered_at: Timestamp,
}

// Table trait for database access
use crate::harvestable_resource::player_discovered_plant as PlayerDiscoveredPlantTableTrait;

/// Helper function to check if a player has discovered a plant type
pub fn has_player_discovered_plant(ctx: &ReducerContext, player_id: Identity, plant_type: &PlantType) -> bool {
    ctx.db.player_discovered_plant()
        .player_id()
        .filter(&player_id)
        .any(|discovery| &discovery.plant_type == plant_type)
}

/// Helper function to record a plant discovery for a player
pub fn record_plant_discovery(ctx: &ReducerContext, player_id: Identity, plant_type: PlantType) {
    // Check if already discovered
    if !has_player_discovered_plant(ctx, player_id, &plant_type) {
        ctx.db.player_discovered_plant().insert(PlayerDiscoveredPlant {
            id: 0, // auto_inc
            player_id,
            plant_type: plant_type.clone(),
            discovered_at: ctx.timestamp,
        });
        log::info!("🌿 Player {:?} discovered new plant type: {:?}", player_id, plant_type);
        
        // Update unique_plant_bitmask in PlayerStats for achievement tracking
        if let Some(bit_index) = crate::plants_database::get_plant_bit_index(&plant_type) {
            let stats_table = ctx.db.player_stats();
            if let Some(mut stats) = stats_table.player_id().find(&player_id) {
                let old_mask = stats.unique_plant_bitmask;
                stats.unique_plant_bitmask |= 1u64 << bit_index;
                
                // Only update and check achievements if we actually discovered a new plant type
                if stats.unique_plant_bitmask != old_mask {
                    stats.updated_at = ctx.timestamp;
                    stats_table.player_id().update(stats);
                    
                    // Check plant variety achievements
                    if let Err(e) = crate::player_progression::check_achievements(ctx, player_id) {
                        log::warn!("Failed to check plant variety achievements: {}", e);
                    }
                }
            }
        }
    }
}

// --- Unified Generic Reducer ---

/// Handles player interactions with any harvestable resource type
#[spacetimedb::reducer]
pub fn interact_with_harvestable_resource(ctx: &ReducerContext, resource_id: u64) -> Result<(), String> {
    use crate::plants_database::SpawnCondition;
    
    let player_id = ctx.sender;
    
    // Find the resource
    let resource = ctx.db.harvestable_resource().id().find(resource_id)
        .ok_or_else(|| format!("Harvestable resource {} not found", resource_id))?;

    // Check if already harvested and waiting for respawn (respawn_at > UNIX_EPOCH)
    if resource.respawn_at > Timestamp::UNIX_EPOCH {
        return Err("This resource has already been harvested and is respawning.".to_string());
    }
    
    // Validate player can interact with this resource (distance check)
    let player = validate_player_resource_interaction(ctx, player_id, resource.pos_x, resource.pos_y)?;

    // Get configuration for this plant type
    let config = PLANT_CONFIGS.get(&resource.plant_type)
        .ok_or_else(|| format!("No configuration found for plant type: {:?}", resource.plant_type))?;
    
    // Check if underwater harvesting requires snorkeling
    if matches!(config.spawn_condition, SpawnCondition::Underwater) {
        if !player.is_snorkeling {
            // Emit error sound for trying to harvest seaweed while above water
            crate::sound_events::emit_error_seaweed_above_water_sound(ctx, resource.pos_x, resource.pos_y, player_id);
            return Err("You must be underwater (snorkeling) to harvest seaweed beds.".to_string());
        }
    }

    // Get configuration for this plant type (for yield calculation)
    let config = PLANT_CONFIGS.get(&resource.plant_type)
        .ok_or_else(|| format!("No configuration found for plant type: {:?}", resource.plant_type))?;

    // Calculate primary yield amount
    // Player-planted crops (farming) yield 2-5 items to make farming rewarding
    // Wild plants use their normal config-based yield
    let primary_yield_amount = if resource.is_player_planted {
        // Farming bonus: 2-5 items per harvest (avg 3.2x wild yield)
        // Weighted to feel generous while not being overpowered
        // This makes farming significantly more profitable than wild foraging
        let roll: f32 = ctx.rng().gen_range(0.0..1.0);
        if roll < 0.30 {
            2 // 30% chance: 2 items
        } else if roll < 0.65 {
            3 // 35% chance: 3 items  
        } else if roll < 0.90 {
            4 // 25% chance: 4 items
        } else {
            5 // 10% chance: 5 items (jackpot!)
        }
    } else if config.primary_yield.1 == config.primary_yield.2 {
        config.primary_yield.1 // Fixed amount for wild plants
    } else {
        ctx.rng().gen_range(config.primary_yield.1..=config.primary_yield.2) // Random range for wild plants
    };

    // Log farming bonus yields
    if resource.is_player_planted {
        log::info!("🌾 FARM HARVEST: Player {:?} harvesting {:?} - yield: {} items (farming bonus!)", 
                   player_id, resource.plant_type, primary_yield_amount);
    }

    // Collect resource and schedule respawn
    // NOTE: Seasonal respawn multiplier is automatically applied to wild plants in collect_resource_and_schedule_respawn
    // This creates increasing scarcity as the season progresses, encouraging early collection and farming
    collect_resource_and_schedule_respawn(
        ctx,
        player_id,
        &config.primary_yield.0, // primary item name
        primary_yield_amount,
        config.secondary_yield.as_ref().map(|(name, _, _, _)| name.as_str()), // secondary item name
        config.secondary_yield.as_ref().map(|(_, min, _, _)| *min).unwrap_or(0), // secondary min
        config.secondary_yield.as_ref().map(|(_, _, max, _)| *max).unwrap_or(0), // secondary max
        config.secondary_yield.as_ref().map(|(_, _, _, chance)| *chance).unwrap_or(0.0), // secondary chance
        &mut ctx.rng().clone(),
        resource.id,
        resource.pos_x,
        resource.pos_y,
        // update_resource_fn (closure)
        |respawn_time| -> Result<(), String> {
            if let Some(mut resource_to_update) = ctx.db.harvestable_resource().id().find(resource.id) {
                resource_to_update.respawn_at = respawn_time;
                ctx.db.harvestable_resource().id().update(resource_to_update);
                Ok(())
            } else {
                Err(format!("Harvestable resource {} disappeared before respawn scheduling.", resource.id))
            }
        },
        config.min_respawn_time_secs,
        config.max_respawn_time_secs,
        resource.is_player_planted // Pass whether this is a player-planted crop
    )?;

    // Try to grant seed drops after successful harvest
    // Pass the plant entity name (not the yield item name) for proper seed mapping
    let plant_entity_name = crate::plants_database::plant_type_to_entity_name(&resource.plant_type);
    crate::collectible_resources::try_grant_seed_drops(
        ctx,
        player_id,
        plant_entity_name,
        &mut ctx.rng().clone(),
    )?;
    
    // === PLANT DISCOVERY: Track which plants this player has harvested ===
    record_plant_discovery(ctx, player_id, resource.plant_type.clone());
    
    // === PLAYER PROGRESSION: Award XP for harvesting ===
    // Different XP for wild plants vs player-planted crops
    let xp_amount = if resource.is_player_planted {
        crate::player_progression::XP_CROP_HARVESTED
    } else {
        crate::player_progression::XP_PLANT_HARVESTED
    };
    if let Err(e) = crate::player_progression::award_xp(ctx, player_id, xp_amount) {
        log::warn!("Failed to award XP for harvesting: {}", e);
    }
    // Check if this is an actual plant (not debris/piles)
    // Debris and piles should NOT count toward plant harvesting quests
    let is_actual_plant = !matches!(
        resource.plant_type,
        PlantType::MemoryShard |
        PlantType::WoodPile |
        PlantType::BeachWoodPile |
        PlantType::StonePile |
        PlantType::LeavesPile |
        PlantType::MetalOrePile |
        PlantType::SulfurPile |
        PlantType::CharcoalPile
    );
    
    // Track plants harvested for achievements (count items received)
    // Only track for actual plants, not debris/piles
    if is_actual_plant {
        let harvest_count = primary_yield_amount as u64;
        if let Err(e) = crate::player_progression::track_stat_and_check_achievements(ctx, player_id, "plants_harvested", harvest_count) {
            log::warn!("Failed to check harvest achievements: {}", e);
        }
        
        // Track quest progress for plant harvesting (generic - any plant)
        // NOTE: Track 1 per harvest action, NOT the number of items received
        // This prevents "harvest 5 plants" from completing after picking 2 plants that yield 3 items each
        if let Err(e) = crate::quests::track_quest_progress(
            ctx,
            player_id,
            crate::quests::QuestObjectiveType::HarvestPlant,
            None,
            1, // Count harvest actions, not items
        ) {
            log::warn!("Failed to track quest progress for harvesting: {}", e);
        }
        
        // Track quest progress for specific plant harvesting (e.g., "Harvest 3 Beach Lyme Grass")
        // Uses the plant's entity name as the target_id for matching specific plant quests
        let plant_name = crate::plants_database::plant_type_to_entity_name(&resource.plant_type);
        if let Err(e) = crate::quests::track_quest_progress(
            ctx,
            player_id,
            crate::quests::QuestObjectiveType::HarvestSpecificPlant,
            Some(plant_name),
            1, // Count harvest actions, not items
        ) {
            log::warn!("Failed to track quest progress for specific plant harvesting: {}", e);
        }
        
        // Track HarvestCrop quest if this is a player-planted crop (for farming quests)
        // NOTE: Track 1 per harvest action, NOT the number of items received
        if resource.is_player_planted {
            if let Err(e) = crate::quests::track_quest_progress(
                ctx,
                player_id,
                crate::quests::QuestObjectiveType::HarvestCrop,
                None,
                1, // Count harvest actions, not items
            ) {
                log::warn!("Failed to track quest progress for crop harvest: {}", e);
            }
        }
    }

    // === SEAWEED-SPECIFIC BONUS DROPS ===
    // SeaweedBed grants bonus drops that make underwater farming worthwhile
    if matches!(resource.plant_type, crate::plants_database::PlantType::SeaweedBed) {
        let item_defs = ctx.db.item_definition();
        
        // Helper to grant item by name
        let grant_item = |item_name: &str, amount: u32| -> Result<(), String> {
            let item_def = item_defs.iter()
                .find(|def| def.name == item_name)
                .ok_or_else(|| format!("Item definition '{}' not found", item_name))?;
            let _ = crate::dropped_item::try_give_item_to_player(ctx, player_id, item_def.id, amount);
            Ok(())
        };
        
        // 1. Plant Fiber bonus (underwater fiber source)
        // Balanced to NOT compete with land-based mega producers:
        // - BorealNettle: 40-50 (mega producer)
        // - Beach Lyme Grass: 15 (dedicated coastal fiber)
        // - Arctic Hairgrass: 3-5 (alpine fiber)
        // SeaweedBed bonus: 2-4 at 40% chance (modest underwater bonus)
        let fiber_chance: f32 = ctx.rng().gen_range(0.0..1.0);
        if fiber_chance < 0.40 {
            let fiber_amount = ctx.rng().gen_range(2..=4);
            if grant_item("Plant Fiber", fiber_amount).is_ok() {
                log::info!("SeaweedBed bonus: Player {:?} received {} Plant Fiber", player_id, fiber_amount);
            }
        }
        
        // 2. Pearl bonus (rare valuable drop - makes farming worthwhile)
        // Similar rarity to coral pearl drops (2-3% chance)
        let pearl_chance: f32 = ctx.rng().gen_range(0.0..1.0);
        if pearl_chance < 0.03 {
            if grant_item("Pearl", 1).is_ok() {
                log::info!("🦪 SeaweedBed RARE DROP: Player {:?} found a Pearl!", player_id);
            }
        }
        
        // 3. Shell bonus (common underwater drop)
        // 15% chance for 1-2 shells
        let shell_chance: f32 = ctx.rng().gen_range(0.0..1.0);
        if shell_chance < 0.15 {
            let shell_amount = ctx.rng().gen_range(1..=2);
            if grant_item("Shell", shell_amount).is_ok() {
                log::info!("SeaweedBed bonus: Player {:?} received {} Shell", player_id, shell_amount);
            }
        }
    }

    Ok(())
}

// --- Helper Functions for Environment Seeding ---

pub fn create_harvestable_resource(
    plant_type: PlantType,
    pos_x: f32,
    pos_y: f32,
    chunk_index: u32,
    is_player_planted: bool
) -> HarvestableResource {
    HarvestableResource {
        id: 0, // auto_inc
        plant_type,
        pos_x,
        pos_y,
        chunk_index,
        respawn_at: Timestamp::UNIX_EPOCH, // 0 = not respawning
        is_player_planted, // Track whether this is a farmed crop or wild plant
    }
}

/// Check if a spawn location is suitable for a specific plant type
pub fn is_spawn_location_suitable(
    ctx: &ReducerContext,
    pos_x: f32,
    pos_y: f32,
    plant_type: &PlantType,
    tree_positions: &[(f32, f32)],
    stone_positions: &[(f32, f32)]
) -> bool {
    let config = PLANT_CONFIGS.get(plant_type);
    if let Some(config) = config {
        crate::environment::validate_spawn_location(
            ctx, pos_x, pos_y, &config.spawn_condition, tree_positions, stone_positions
        )
    } else {
        false
    }
}