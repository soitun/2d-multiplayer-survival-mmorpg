// ============================================================================
// ALK (Automated Logistics Kernel) MODULE
// ============================================================================
// The ALK system is a contract-based provisioning system where players can:
// - View available contracts for various resources (food, industrial)
// - Accept contracts to deliver specific items
// - Deliver items at ALK stations (central compound + 4 substations)
// - Receive shard rewards for completed deliveries
//
// Contract Types:
// - Base Food (Seasonal): Changes with seasons, food/fish/broth/pelts/medicinal
// - Base Industrial (Constant): Ore/stone/timber/fiber/sulfur - always available
// - Daily Bonus (Rotating): Special high-reward contracts that expire
// ============================================================================

use spacetimedb::{ReducerContext, Table, Timestamp, Identity, TimeDuration, ScheduleAt, SpacetimeType};
use log;
use rand::Rng;

// Import plants database for seasonal derivation
use crate::plants_database::{PLANT_CONFIGS, PlantType};
use crate::world_state::Season;
use crate::PLAYER_RADIUS;
use crate::world_tile as WorldTileTableTrait;
// Import player progression table traits
use crate::player_progression::player_stats as PlayerStatsTableTrait;

// Import table traits
use crate::alk::alk_state as AlkStateTableTrait;
use crate::alk::alk_station as AlkStationTableTrait;
use crate::alk::alk_contract as AlkContractTableTrait;
use crate::alk::alk_player_contract as AlkPlayerContractTableTrait;
use crate::dropped_item::give_item_to_player_or_drop;
use crate::alk::player_shard_balance as PlayerShardBalanceTableTrait;
use crate::alk::alk_contract_refresh_schedule as AlkContractRefreshScheduleTableTrait;
use crate::items::item_definition as ItemDefinitionTableTrait;
use crate::items::inventory_item as InventoryItemTableTrait;
use crate::player as PlayerTableTrait;
use crate::world_state::world_state as WorldStateTableTrait;
use crate::models::ItemLocation;

// ============================================================================
// CONSTANTS
// ============================================================================

// ============================================================================
// COLLISION CONSTANTS
// ============================================================================

/// ALK station sprite dimensions (matches client-side rendering)
pub const ALK_STATION_WIDTH: f32 = 480.0;
pub const ALK_STATION_HEIGHT: f32 = 480.0;
pub const ALK_STATION_Y_OFFSET: f32 = 0.0; // Anchor point offset (worldPosY is the anchor)

/// AABB collision dimensions - bottom 1/3 height for substations
/// Central compound uses 50% of building width (240px), substations use 350px
pub const ALK_STATION_COLLISION_WIDTH: f32 = ALK_STATION_WIDTH * 0.5;  // 50% of building width (central compound)
pub const ALK_SUBSTATION_COLLISION_WIDTH: f32 = 350.0;  // Substations: 350px wide collision
pub const ALK_STATION_COLLISION_HEIGHT: f32 = ALK_STATION_HEIGHT / 3.0; // Bottom 1/3 of building height (substations)
pub const ALK_STATION_AABB_HALF_WIDTH: f32 = ALK_STATION_COLLISION_WIDTH / 2.0;
pub const ALK_SUBSTATION_AABB_HALF_WIDTH: f32 = ALK_SUBSTATION_COLLISION_WIDTH / 2.0;
pub const ALK_STATION_AABB_HALF_HEIGHT: f32 = ALK_STATION_COLLISION_HEIGHT / 2.0;

/// Central compound collision dimensions - half height from top (bottom 1/6 height, 1/2 width)
pub const ALK_CENTRAL_COMPOUND_COLLISION_HEIGHT: f32 = ALK_STATION_HEIGHT / 6.0; // Bottom 1/6 of building height (half of substation height)
pub const ALK_CENTRAL_COMPOUND_AABB_HALF_HEIGHT: f32 = ALK_CENTRAL_COMPOUND_COLLISION_HEIGHT / 2.0;
/// Central compound collision Y offset - pushed up by its height to position higher on building
pub const ALK_CENTRAL_COMPOUND_COLLISION_Y_OFFSET: f32 = ALK_CENTRAL_COMPOUND_COLLISION_HEIGHT; // Push up by full height

/// Legacy circular collision constants (kept for compatibility, but AABB is used instead)
pub const ALK_STATION_COLLISION_RADIUS: f32 = 120.0;
pub const ALK_STATION_COLLISION_Y_OFFSET: f32 = 170.0;

/// Squared collision distance for player-ALK station collision checks (using AABB bounds)
/// Uses substation width (350px) as it's the larger collision area
pub const PLAYER_ALK_STATION_COLLISION_DISTANCE_SQUARED: f32 = 
    (PLAYER_RADIUS + ALK_SUBSTATION_COLLISION_WIDTH.max(ALK_STATION_COLLISION_HEIGHT)) * 
    (PLAYER_RADIUS + ALK_SUBSTATION_COLLISION_WIDTH.max(ALK_STATION_COLLISION_HEIGHT));

// ============================================================================
// GAMEPLAY CONSTANTS
// ============================================================================

/// Days per season (matches world_state)
pub const DAYS_PER_SEASON: u32 = 240; // 240 in-game days = 5 real-life days per season

/// Days per ALK cycle (bonus contracts refresh)
pub const DAYS_PER_ALK_CYCLE: u32 = 24;

/// Default contract expiry in days
pub const BONUS_CONTRACT_DEFAULT_EXPIRY_DAYS: u32 = 5;

/// Max active player contracts at once
pub const MAX_ACTIVE_PLAYER_CONTRACTS: usize = 10;

/// Contract refresh check interval in seconds
pub const CONTRACT_REFRESH_INTERVAL_SECONDS: u64 = 60; // Check every minute

// ============================================================================
// ENUMS AND TYPES
// ============================================================================

/// Contract kind - determines behavior and UI grouping
#[derive(SpacetimeType, Clone, Debug, PartialEq, Eq)]
pub enum AlkContractKind {
    // === BASE CONTRACTS (Always available, refresh seasonally or never expire) ===
    SeasonalHarvest,  // Plant-based items from plants_database (seasonal)
    Materials,        // Raw materials - stone, ore, wood, fiber, etc.
    Arms,             // Weapons and ranged weapons
    Armor,            // Armor pieces
    Tools,            // Tools and equipment
    Provisions,       // Consumables - food, medicine, bandages
    
    // === ROTATING CONTRACTS ===
    DailyBonus,       // Time-limited bonus contracts with higher rewards
    
    // Legacy aliases for backwards compatibility
    BaseFood,         // Alias for SeasonalHarvest
    BaseIndustrial,   // Alias for Materials
}

/// Contract status
#[derive(SpacetimeType, Clone, Debug, PartialEq, Eq)]
pub enum AlkContractStatus {
    Active,     // Contract is available or in progress
    Completed,  // Successfully delivered
    Failed,     // Expired without delivery
    Cancelled,  // Player cancelled
}

/// Station flags for allowed delivery locations
#[derive(SpacetimeType, Clone, Debug, PartialEq, Eq)]
pub enum AlkStationAllowance {
    CompoundOnly,   // Can only deliver at central compound
    SubstationsOnly, // Can only deliver at substations
    AllStations,    // Can deliver anywhere
}

/// Item eligibility tags for ALK contracts
/// These determine which items can appear in which contract types
#[derive(SpacetimeType, Clone, Debug, PartialEq, Eq)]
pub enum AlkItemTag {
    // === CATEGORY TAGS (derived from ItemCategory) ===
    CategoryMaterial,    // Material category items
    CategoryWeapon,      // Weapon category items
    CategoryRangedWeapon,// RangedWeapon category items
    CategoryArmor,       // Armor category items
    CategoryTool,        // Tool category items
    CategoryConsumable,  // Consumable category items
    CategoryAmmunition,  // Ammunition category items
    CategoryPlaceable,   // Placeable category items
    
    // === SPECIAL TAGS ===
    PlantBased,          // Derived from plants_database (seasonal harvest)
    HighValue,           // Eligible for bonus contracts (valuable items)
    Craftable,           // Player-craftable items (for Arms/Armor/Tools contracts)
    
    // === SEASONAL TAGS (for plant-based items) ===
    SeasonSpring,
    SeasonSummer,
    SeasonAutumn,
    SeasonWinter,
    AllSeasons,
    
    // === LEGACY TAGS (for backwards compatibility) ===
    AlkFood,
    AlkIndustrial,
    AlkBonusEligible,
}

// ============================================================================
// TABLES
// ============================================================================

/// Global ALK state singleton - tracks current cycle and balancing knobs
#[spacetimedb::table(name = alk_state, public)]
#[derive(Clone, Debug)]
pub struct AlkState {
    #[primary_key]
    pub id: u32, // Singleton (always 1)
    
    /// Snapshot of world day when ALK state was last updated
    pub world_day_snapshot: u32,
    
    /// Current season index (0-3: Spring, Summer, Autumn, Winter)
    pub season_index: u32,
    
    /// Current ALK daily cycle index (increments every DAYS_PER_ALK_CYCLE days)
    pub daily_cycle_index: u32,
    
    /// Global multiplier for food contract rewards
    pub food_reward_multiplier: f32,
    
    /// Global multiplier for industrial contract rewards
    pub industrial_reward_multiplier: f32,
    
    /// Global multiplier for bonus contract rewards
    pub bonus_reward_multiplier: f32,
    
    /// Last time contracts were refreshed
    pub last_refresh: Timestamp,
}

/// ALK delivery stations (central compound + 4 substations)
#[spacetimedb::table(name = alk_station, public)]
#[derive(Clone, Debug)]
pub struct AlkStation {
    #[primary_key]
    pub station_id: u32, // 0 = central compound, 1-4 = substations
    
    /// Human-readable station name
    pub name: String,
    
    /// World X position (center of interaction area)
    pub world_pos_x: f32,
    
    /// World Y position (center of interaction area)
    pub world_pos_y: f32,
    
    /// Interaction radius in pixels
    pub interaction_radius: f32,
    
    /// Fee rate deducted from rewards (0.0 for compound, higher for substations)
    /// e.g., 0.1 = 10% fee
    pub delivery_fee_rate: f32,
    
    /// Whether this station is currently operational
    pub is_active: bool,
}

/// ALK contract templates - defines what contracts are currently available
#[spacetimedb::table(
    name = alk_contract, 
    public,
    index(name = idx_contract_kind, btree(columns = [kind])),
    index(name = idx_contract_item, btree(columns = [item_def_id]))
)]
#[derive(Clone, Debug)]
pub struct AlkContract {
    #[primary_key]
    #[auto_inc]
    pub contract_id: u64,
    
    /// Type of contract (food, industrial, bonus)
    pub kind: AlkContractKind,
    
    /// Item definition ID from items_database
    pub item_def_id: u64,
    
    /// Item name (cached for convenience)
    pub item_name: String,
    
    /// Number of items per delivery bundle
    pub bundle_size: u32,
    
    /// Shard reward per bundle delivered
    pub shard_reward_per_bundle: u32,
    
    /// Maximum pool quantity (None/0 = infinite for base contracts)
    pub max_pool_quantity: Option<u32>,
    
    /// Remaining pool for bonus contracts (decremented on acceptance or delivery)
    pub current_pool_remaining: Option<u32>,
    
    /// World day when this contract was created
    pub created_on_day: u32,
    
    /// World day when this contract expires (None = no expiry for base contracts)
    pub expires_on_day: Option<u32>,
    
    /// Which stations can accept deliveries for this contract
    pub allowed_stations: AlkStationAllowance,
    
    /// Whether this contract is currently active
    pub is_active: bool,
    
    /// Season requirement (only show if current season matches)
    pub required_season: Option<u32>, // 0-3 for seasons, None = all seasons
}

/// Player-accepted contracts - tracks individual player progress
#[spacetimedb::table(
    name = alk_player_contract, 
    public,
    index(name = idx_player_contracts, btree(columns = [player_id])),
    index(name = idx_player_status, btree(columns = [player_id, status]))
)]
#[derive(Clone, Debug)]
pub struct AlkPlayerContract {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    
    /// Player who accepted this contract
    pub player_id: Identity,
    
    /// Reference to the contract template
    pub contract_id: u64,
    
    /// World day when accepted
    pub accepted_on_day: u32,
    
    /// World day when this acceptance expires
    pub expires_on_day: u32,
    
    /// Target quantity to deliver (in items, not bundles)
    pub target_quantity: u32,
    
    /// Quantity delivered so far
    pub delivered_quantity: u32,
    
    /// Current status
    pub status: AlkContractStatus,
    
    /// Intended delivery station (for tracking/validation)
    pub delivery_station_id: Option<u32>,
    
    /// Timestamp when accepted
    pub accepted_at: Timestamp,
    
    /// Timestamp when completed/failed (if applicable)
    pub completed_at: Option<Timestamp>,
}

/// Player shard balance - economic currency
#[spacetimedb::table(name = player_shard_balance, public)]
#[derive(Clone, Debug)]
pub struct PlayerShardBalance {
    #[primary_key]
    pub player_id: Identity,
    
    /// Current shard balance
    pub balance: u64,
    
    /// Total shards ever earned
    pub total_earned: u64,
    
    /// Total shards ever spent
    pub total_spent: u64,
    
    /// Last transaction timestamp
    pub last_transaction: Timestamp,
}

/// Item ALK tags - determines which items can appear in which contracts
#[spacetimedb::table(
    name = item_alk_tag, 
    public,
    index(name = idx_tag_item, btree(columns = [item_def_id]))
)]
#[derive(Clone, Debug)]
pub struct ItemAlkTag {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    
    /// Item definition ID
    pub item_def_id: u64,
    
    /// ALK tag for this item
    pub tag: AlkItemTag,
}

/// Schedule for ALK contract refresh checks
#[spacetimedb::table(name = alk_contract_refresh_schedule, scheduled(process_alk_contract_refresh))]
#[derive(Clone, Debug)]
pub struct AlkContractRefreshSchedule {
    #[primary_key]
    #[auto_inc]
    pub schedule_id: u64,
    pub scheduled_at: ScheduleAt,
}

// ============================================================================
// INITIALIZATION REDUCERS
// ============================================================================

/// Initialize ALK system - called once during module init
pub fn init_alk_system(ctx: &ReducerContext) -> Result<(), String> {
    log::info!("🏭 Initializing ALK (Automated Logistics Kernel) system...");
    
    // Initialize ALK state singleton
    seed_alk_state(ctx)?;
    
    // Initialize ALK stations
    seed_alk_stations(ctx)?;
    
    // Seed item ALK tags
    seed_item_alk_tags(ctx)?;
    
    // Generate initial contracts
    generate_initial_contracts(ctx)?;
    
    // Initialize contract refresh schedule
    init_alk_schedule(ctx)?;
    
    log::info!("✅ ALK system initialized successfully");
    Ok(())
}

/// Seed the ALK state singleton
fn seed_alk_state(ctx: &ReducerContext) -> Result<(), String> {
    let alk_state_table = ctx.db.alk_state();
    
    if alk_state_table.iter().count() > 0 {
        log::info!("ALK state already seeded, skipping");
        return Ok(());
    }
    
    // Get current world state for initial values
    let world_state = ctx.db.world_state().iter().next();
    let (world_day, season_index) = match world_state {
        Some(ws) => (ws.day_of_year + (ws.year - 1) * 960, (ws.day_of_year - 1) / DAYS_PER_SEASON),
        None => (1, 0),
    };
    
    let daily_cycle_index = world_day / DAYS_PER_ALK_CYCLE;
    
    let state = AlkState {
        id: 1,
        world_day_snapshot: world_day,
        season_index,
        daily_cycle_index,
        food_reward_multiplier: 1.0,
        industrial_reward_multiplier: 1.0,
        bonus_reward_multiplier: 1.5,
        last_refresh: ctx.timestamp,
    };
    
    match alk_state_table.try_insert(state) {
        Ok(_) => {
            log::info!("✅ ALK state seeded: day={}, season={}, cycle={}", 
                      world_day, season_index, daily_cycle_index);
            Ok(())
        },
        Err(e) => Err(format!("Failed to seed ALK state: {}", e)),
    }
}

/// Spawn asphalt tiles around an ALK station to create a paved compound area
fn spawn_asphalt_around_station(ctx: &ReducerContext, center_x: f32, center_y: f32, radius_tiles: i32, is_central: bool) {
    let tile_size = crate::TILE_SIZE_PX as f32;
    let center_tile_x = (center_x / tile_size).floor() as i32;
    let center_tile_y = (center_y / tile_size).floor() as i32;
    
    let mut tiles_converted = 0;
    let mut tiles_already_asphalt = 0;
    
    log::info!("🛤️ Spawning asphalt around station at pixel ({:.0}, {:.0}), tile ({}, {}), radius {} tiles", 
               center_x, center_y, center_tile_x, center_tile_y, radius_tiles);
    
    // Convert tiles in a square area around the station to asphalt
    for dy in -radius_tiles..=radius_tiles {
        for dx in -radius_tiles..=radius_tiles {
            let tile_x = center_tile_x + dx;
            let tile_y = center_tile_y + dy;
            
            // Skip tiles too far from center (make it more circular for substations)
            if !is_central {
                let dist = ((dx * dx + dy * dy) as f32).sqrt();
                if dist > radius_tiles as f32 {
                    continue;
                }
            }
            
            // Find and update the tile at this position
            let world_tiles = ctx.db.world_tile();
            for tile in world_tiles.idx_world_position().filter((tile_x, tile_y)) {
                // Skip if already asphalt
                if tile.tile_type == crate::TileType::Asphalt {
                    tiles_already_asphalt += 1;
                    continue;
                }
                
                // FORCE convert ANY tile type to asphalt (including water!)
                // ALK stations MUST have asphalt pads regardless of terrain
                let mut updated_tile = tile.clone();
                updated_tile.tile_type = crate::TileType::Asphalt;
                ctx.db.world_tile().id().update(updated_tile);
                tiles_converted += 1;
            }
        }
    }
    
    log::info!("🛤️ Asphalt spawning complete: {} tiles converted, {} already asphalt, station at ({:.0}, {:.0})", 
               tiles_converted, tiles_already_asphalt, center_x, center_y);
}

/// Seed ALK delivery stations
/// Places central compound at center, substations at the 4 corner road terminal asphalt areas
fn seed_alk_stations(ctx: &ReducerContext) -> Result<(), String> {
    let stations_table = ctx.db.alk_station();
    
    // Check if stations already exist
    let existing_stations: Vec<_> = stations_table.iter().collect();
    if !existing_stations.is_empty() {
        log::info!("ALK stations already seeded ({}), checking for missing asphalt...", existing_stations.len());
        
        // Fix asphalt for existing stations (in case they were created before world tiles existed)
        for station in existing_stations {
            let is_central = station.station_id == 0;
            let asphalt_radius = if is_central { 10 } else { 6 };
            spawn_asphalt_around_station(ctx, station.world_pos_x, station.world_pos_y, asphalt_radius, is_central);
        }
        
        return Ok(());
    }
    
    // Calculate world dimensions
    let world_width = crate::WORLD_WIDTH_PX;
    let world_height = crate::WORLD_HEIGHT_PX;
    let center_x = world_width / 2.0;
    let center_y = world_height / 2.0;
    
    // Calculate positions for substations at road terminal asphalt areas
    // Roads go from corners (tile 20, 20 etc.) to center
    // Terminal asphalt is created where roads meet the beach near the island edge
    // Island radius is approximately 35% of map size, terminals are near the edge
    // We place substations at ~90% of island radius along diagonals (near the beach terminals)
    let island_radius = world_width.min(world_height) * 0.35;
    let substation_distance = island_radius * 0.90; // 90% of island radius - near the beach edge
    let diag = substation_distance / 1.414; // Divide by sqrt(2) for diagonal positioning
    
    log::info!("🏭 ALK station positioning:");
    log::info!("  - World size: {:.0}x{:.0} px", world_width, world_height);
    log::info!("  - Center: ({:.0}, {:.0})", center_x, center_y);
    log::info!("  - Island radius: {:.0} px, substation distance: {:.0} px (diag: {:.0})", 
               island_radius, substation_distance, diag);
    
    let stations = vec![
        // Central compound at center (no fee) - on main asphalt compound
        AlkStation {
            station_id: 0,
            name: "ALK Central Compound".to_string(),
            world_pos_x: center_x,
            world_pos_y: center_y,
            interaction_radius: 250.0, // Larger radius for central compound
            delivery_fee_rate: 0.0,
            is_active: true,
        },
        // Northwest substation (top-left road terminal)
        AlkStation {
            station_id: 1,
            name: "ALK Northwest Terminal".to_string(),
            world_pos_x: center_x - diag,
            world_pos_y: center_y - diag,
            interaction_radius: 200.0,
            delivery_fee_rate: 0.10, // 10% fee for convenience
            is_active: true,
        },
        // Northeast substation (top-right road terminal)
        AlkStation {
            station_id: 2,
            name: "ALK Northeast Terminal".to_string(),
            world_pos_x: center_x + diag,
            world_pos_y: center_y - diag,
            interaction_radius: 200.0,
            delivery_fee_rate: 0.10,
            is_active: true,
        },
        // Southwest substation (bottom-left road terminal)
        AlkStation {
            station_id: 3,
            name: "ALK Southwest Terminal".to_string(),
            world_pos_x: center_x - diag,
            world_pos_y: center_y + diag,
            interaction_radius: 200.0,
            delivery_fee_rate: 0.10,
            is_active: true,
        },
        // Southeast substation (bottom-right road terminal)
        AlkStation {
            station_id: 4,
            name: "ALK Southeast Terminal".to_string(),
            world_pos_x: center_x + diag,
            world_pos_y: center_y + diag,
            interaction_radius: 200.0,
            delivery_fee_rate: 0.10,
            is_active: true,
        },
    ];
    
    for station in stations {
        let is_central = station.station_id == 0;
        let pos_x = station.world_pos_x;
        let pos_y = station.world_pos_y;
        
        match stations_table.try_insert(station.clone()) {
            Ok(_) => {
                log::info!("✅ Created ALK station: {} at ({:.0}, {:.0})", 
                          station.name, pos_x, pos_y);
                
                // Spawn asphalt around the station
                // Central compound gets larger area (10 tile radius), substations get 6 tile radius
                let asphalt_radius = if is_central { 10 } else { 6 };
                spawn_asphalt_around_station(ctx, pos_x, pos_y, asphalt_radius, is_central);
                
                // Spawn monument placeables only at the central compound
                if is_central {
                    let placeable_configs = crate::monument::get_central_compound_placeables();
                    match crate::monument::spawn_monument_placeables(ctx, "Central Compound", pos_x, pos_y, &placeable_configs) {
                        Ok(count) => log::info!("🏭 Spawned {} monument placeables at Central Compound", count),
                        Err(e) => log::warn!("Failed to spawn central compound placeables: {}", e),
                    }
                }
            },
            Err(e) => log::error!("Failed to create station {}: {}", station.name, e),
        }
    }
    
    Ok(())
}

/// Derive seasonal items from plants_database.rs
/// Returns (spring_items, summer_items, autumn_items, winter_items)
fn derive_seasonal_items_from_plants() -> (Vec<String>, Vec<String>, Vec<String>, Vec<String>) {
    let mut spring_items: Vec<String> = Vec::new();
    let mut summer_items: Vec<String> = Vec::new();
    let mut autumn_items: Vec<String> = Vec::new();
    let mut winter_items: Vec<String> = Vec::new();
    
    // Build mapping from plants_database
    for (_, config) in PLANT_CONFIGS.iter() {
        // Get the primary yield item name (this is what players collect)
        let item_name = config.primary_yield.0.clone();
        
        // Skip non-food items (Plant Fiber, Memory Shard, etc.)
        let non_food_yields = ["Plant Fiber", "Memory Shard", "Wood", "Stone", "Metal Ore", 
                               "Sulfur Ore", "Charcoal", "Arctic Lichen", "Mountain Moss",
                               "Dogbane Fiber"];
        if non_food_yields.contains(&item_name.as_str()) {
            continue;
        }
        
        // Map plant growing seasons to ALK seasonal tags
        for season in &config.growing_seasons {
            match season {
                Season::Spring => {
                    if !spring_items.contains(&item_name) {
                        spring_items.push(item_name.clone());
                    }
                },
                Season::Summer => {
                    if !summer_items.contains(&item_name) {
                        summer_items.push(item_name.clone());
                    }
                },
                Season::Autumn => {
                    if !autumn_items.contains(&item_name) {
                        autumn_items.push(item_name.clone());
                    }
                },
                Season::Winter => {
                    if !winter_items.contains(&item_name) {
                        winter_items.push(item_name.clone());
                    }
                },
            }
        }
    }
    
    // Note: Seasonal contracts are ONLY for plant-based items derived from plants_database.rs
    // Fish, cooked foods, furs, and other non-plant items belong in Industrial or Daily Bonus contracts
    
    log::info!("📅 Derived seasonal items from plants_database (plants only):");
    log::info!("   Spring: {} items", spring_items.len());
    log::info!("   Summer: {} items", summer_items.len());
    log::info!("   Autumn: {} items", autumn_items.len());
    log::info!("   Winter: {} items", winter_items.len());
    
    (spring_items, summer_items, autumn_items, winter_items)
}

/// Seed item ALK tags based on item definitions - FULLY DYNAMIC
/// All items are categorized based on their ItemCategory from the database
fn seed_item_alk_tags(ctx: &ReducerContext) -> Result<(), String> {
    use crate::items::ItemCategory;
    
    let tags_table = ctx.db.item_alk_tag();
    
    if tags_table.iter().count() > 0 {
        log::info!("Item ALK tags already seeded, skipping");
        return Ok(());
    }
    
    let item_defs: Vec<_> = ctx.db.item_definition().iter().collect();
    let mut tag_count = 0;
    
    // Helper to insert a tag for an item
    let mut insert_tag = |item_def_id: u64, tag: AlkItemTag| {
        let tag_entry = ItemAlkTag {
            id: 0,
            item_def_id,
            tag,
        };
        if tags_table.try_insert(tag_entry).is_ok() {
            tag_count += 1;
        }
    };
    
    // Build a set of plant-based item names from plants_database
    let mut plant_item_names: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (_, config) in PLANT_CONFIGS.iter() {
        plant_item_names.insert(config.primary_yield.0.clone());
        // Also add secondary yields if they exist
        if let Some((secondary_name, _, _, _)) = &config.secondary_yield {
            plant_item_names.insert(secondary_name.clone());
        }
    }
    
    // Derive seasonal items from plants_database
    let (spring_items, summer_items, autumn_items, winter_items) = derive_seasonal_items_from_plants();
    
    // Track counts for logging
    let mut material_count = 0;
    let mut weapon_count = 0;
    let mut ranged_count = 0;
    let mut armor_count = 0;
    let mut tool_count = 0;
    let mut consumable_count = 0;
    let mut ammo_count = 0;
    let mut placeable_count = 0;
    let mut plant_count = 0;
    let mut high_value_count = 0;
    let mut craftable_count = 0;
    
    // Process ALL items from the database
    for item in &item_defs {
        let item_id = item.id;
        let item_name = &item.name;
        
        // 1. Tag by ItemCategory (primary classification)
        match &item.category {
            ItemCategory::Material => {
                insert_tag(item_id, AlkItemTag::CategoryMaterial);
                insert_tag(item_id, AlkItemTag::AllSeasons); // Materials always available
                material_count += 1;
            },
            ItemCategory::Weapon => {
                insert_tag(item_id, AlkItemTag::CategoryWeapon);
                weapon_count += 1;
            },
            ItemCategory::RangedWeapon => {
                insert_tag(item_id, AlkItemTag::CategoryRangedWeapon);
                ranged_count += 1;
            },
            ItemCategory::Armor => {
                insert_tag(item_id, AlkItemTag::CategoryArmor);
                armor_count += 1;
            },
            ItemCategory::Tool => {
                insert_tag(item_id, AlkItemTag::CategoryTool);
                tool_count += 1;
            },
            ItemCategory::Consumable => {
                insert_tag(item_id, AlkItemTag::CategoryConsumable);
                consumable_count += 1;
            },
            ItemCategory::Ammunition => {
                insert_tag(item_id, AlkItemTag::CategoryAmmunition);
                ammo_count += 1;
            },
            ItemCategory::Placeable => {
                insert_tag(item_id, AlkItemTag::CategoryPlaceable);
                placeable_count += 1;
            },
        }
        
        // 2. Tag plant-based items
        if plant_item_names.contains(item_name) {
            insert_tag(item_id, AlkItemTag::PlantBased);
            plant_count += 1;
        }
        
        // 3. Tag seasonal items (for plant-based only)
        if spring_items.contains(item_name) {
            insert_tag(item_id, AlkItemTag::SeasonSpring);
        }
        if summer_items.contains(item_name) {
            insert_tag(item_id, AlkItemTag::SeasonSummer);
        }
        if autumn_items.contains(item_name) {
            insert_tag(item_id, AlkItemTag::SeasonAutumn);
        }
        if winter_items.contains(item_name) {
            insert_tag(item_id, AlkItemTag::SeasonWinter);
        }
        
        // 4. Tag craftable items (have a crafting cost)
        if item.crafting_cost.is_some() && !item.crafting_cost.as_ref().unwrap().is_empty() {
            insert_tag(item_id, AlkItemTag::Craftable);
            craftable_count += 1;
        }
        
        // 5. Tag high-value items for bonus contracts
        // High value = craftable OR rare drops OR cooked foods OR valuable resources
        let is_high_value = 
            // Craftable weapons, armor, tools, AND ammunition
            (item.crafting_cost.is_some() && matches!(item.category, 
                ItemCategory::Weapon | ItemCategory::RangedWeapon | 
                ItemCategory::Armor | ItemCategory::Tool | ItemCategory::Ammunition)) ||
            // Cooked foods (name starts with "Cooked")
            item_name.starts_with("Cooked") ||
            // Rare animal drops
            item_name.contains("Gland") || item_name.contains("Scale") ||
            item_name.contains("Venom") || item_name.contains("Fur") ||
            // Processed materials
            item_name == "Metal Fragments" || item_name == "Charcoal" ||
            item_name == "Cloth" || item_name == "Animal Leather" ||
            item_name == "Gunpowder" || item_name == "Sulfur";
        
        if is_high_value {
            insert_tag(item_id, AlkItemTag::HighValue);
            high_value_count += 1;
        }
        
        // 6. Legacy tags for backwards compatibility
        // Food = Consumable items that provide hunger
        if item.category == ItemCategory::Consumable {
            if item.consumable_hunger_satiated.unwrap_or(0.0) > 0.0 || 
               item.consumable_thirst_quenched.unwrap_or(0.0) > 0.0 {
                insert_tag(item_id, AlkItemTag::AlkFood);
            }
        }
        
        // Industrial = Materials
        if item.category == ItemCategory::Material {
            insert_tag(item_id, AlkItemTag::AlkIndustrial);
        }
        
        // Bonus eligible = high value items
        if is_high_value {
            insert_tag(item_id, AlkItemTag::AlkBonusEligible);
        }
    }
    
    log::info!("✅ Seeded {} item ALK tags from {} items:", tag_count, item_defs.len());
    log::info!("   📦 Materials: {}", material_count);
    log::info!("   ⚔️ Weapons: {}", weapon_count);
    log::info!("   🏹 Ranged: {}", ranged_count);
    log::info!("   🛡️ Armor: {}", armor_count);
    log::info!("   🔧 Tools: {}", tool_count);
    log::info!("   🍖 Consumables: {}", consumable_count);
    log::info!("   💥 Ammunition: {}", ammo_count);
    log::info!("   🏠 Placeables: {}", placeable_count);
    log::info!("   🌱 Plant-based: {}", plant_count);
    log::info!("   ⭐ High-value: {}", high_value_count);
    log::info!("   🔨 Craftable: {}", craftable_count);
    
    Ok(())
}

/// Generate initial contracts based on current season
fn generate_initial_contracts(ctx: &ReducerContext) -> Result<(), String> {
    let contracts_table = ctx.db.alk_contract();
    
    if contracts_table.iter().count() > 0 {
        log::info!("ALK contracts already exist, skipping initial generation");
        return Ok(());
    }
    
    let world_state = ctx.db.world_state().iter().next();
    let (world_day, season_index) = match world_state {
        Some(ws) => (ws.day_of_year + (ws.year - 1) * 960, (ws.day_of_year - 1) / DAYS_PER_SEASON),
        None => (1, 0),
    };
    
    // === BASE CONTRACTS (always available, never change) ===
    
    // Materials - ONLY base resources (fixed list, always available)
    generate_materials_contracts(ctx, world_day)?;
    
    // === SEASONAL CONTRACTS (random subset refreshed each season) ===
    
    // Arms - random subset of craftable weapons for this season
    generate_seasonal_arms_contracts(ctx, world_day, season_index)?;
    
    // Armor - random subset of craftable armor for this season
    generate_seasonal_armor_contracts(ctx, world_day, season_index)?;
    
    // Tools - random subset of craftable tools for this season
    generate_seasonal_tools_contracts(ctx, world_day, season_index)?;
    
    // Provisions - random subset of consumables for this season
    generate_seasonal_provisions_contracts(ctx, world_day, season_index)?;
    
    // Seasonal Harvest - plant-based items (based on actual growing seasons)
    // These pay MORE because they're time-limited!
    generate_seasonal_harvest_contracts(ctx, world_day, season_index)?;
    
    // === ROTATING BONUS CONTRACTS ===
    
    // Daily bonus - high-value rotating items (furs, rare drops, premium goods)
    generate_bonus_contracts(ctx, world_day, season_index)?;
    
    log::info!("✅ Generated initial ALK contracts for all categories");
    Ok(())
}

/// Initialize ALK schedule for periodic contract refresh
fn init_alk_schedule(ctx: &ReducerContext) -> Result<(), String> {
    let schedule_table = ctx.db.alk_contract_refresh_schedule();
    
    if schedule_table.iter().count() > 0 {
        log::info!("ALK schedule already exists, skipping");
        return Ok(());
    }
    
    let schedule = AlkContractRefreshSchedule {
        schedule_id: 0,
        scheduled_at: ScheduleAt::Interval(
            TimeDuration::from_micros((CONTRACT_REFRESH_INTERVAL_SECONDS * 1_000_000) as i64)
        ),
    };
    
    match schedule_table.try_insert(schedule) {
        Ok(_) => {
            log::info!("✅ ALK contract refresh schedule initialized ({}s interval)", 
                      CONTRACT_REFRESH_INTERVAL_SECONDS);
            Ok(())
        },
        Err(e) => Err(format!("Failed to init ALK schedule: {}", e)),
    }
}

// ============================================================================
// CONTRACT GENERATION FUNCTIONS
// ============================================================================

/// BASE MATERIALS - Fixed list, always available, never changes
/// Only fundamental crafting resources - no furs, rare drops, etc.
const BASE_MATERIALS: &[&str] = &[
    "Wood",
    "Stone", 
    "Metal Fragments",
    "Sulfur",
    "Cloth",
    "Charcoal",
    "Bone Fragments",
    "Animal Fat",
    "Animal Leather",
    "Fertilizer",
];

/// Generate materials contracts - ONLY base resources (fixed list)
fn generate_materials_contracts(ctx: &ReducerContext, world_day: u32) -> Result<(), String> {
    let contracts_table = ctx.db.alk_contract();
    let item_defs = ctx.db.item_definition();
    
    let mut created = 0;
    for material_name in BASE_MATERIALS {
        // Find item by name
        let item_def = item_defs.iter().find(|d| d.name == *material_name);
        
        if let Some(item_def) = item_def {
            // SECURITY: Never create contracts for Memory Shard (base currency)
            if item_def.name == "Memory Shard" { continue; }
            
            let (bundle_size, reward) = get_material_contract_params(&item_def.name);
            if reward == 0 { continue; }
            
            let contract = AlkContract {
                contract_id: 0,
                kind: AlkContractKind::Materials,
                item_def_id: item_def.id,
                item_name: item_def.name.clone(),
                bundle_size,
                shard_reward_per_bundle: reward,
                max_pool_quantity: None, // Infinite
                current_pool_remaining: None,
                created_on_day: world_day,
                expires_on_day: None, // Never expires
                allowed_stations: AlkStationAllowance::AllStations,
                is_active: true,
                required_season: None,
            };
            
            if contracts_table.try_insert(contract).is_ok() {
                created += 1;
            }
        } else {
            log::warn!("Base material not found: {}", material_name);
        }
    }
    
    log::info!("📦 Generated {} base materials contracts", created);
    Ok(())
}

/// How many items to select for seasonal categories (subset)
const SEASONAL_CATEGORY_SIZE: usize = 5;

/// Generate seasonal arms contracts - random subset of weapons AND ammunition for this season
fn generate_seasonal_arms_contracts(ctx: &ReducerContext, world_day: u32, season_index: u32) -> Result<(), String> {
    let contracts_table = ctx.db.alk_contract();
    let item_defs = ctx.db.item_definition();
    let tags_table = ctx.db.item_alk_tag();
    let mut rng = ctx.rng();
    
    // Find craftable weapons, ranged weapons, AND ammunition
    let weapon_ids: Vec<u64> = tags_table.iter()
        .filter(|t| t.tag == AlkItemTag::CategoryWeapon || 
                    t.tag == AlkItemTag::CategoryRangedWeapon ||
                    t.tag == AlkItemTag::CategoryAmmunition)
        .map(|t| t.item_def_id)
        .collect();
    
    let craftable_ids: std::collections::HashSet<u64> = tags_table.iter()
        .filter(|t| t.tag == AlkItemTag::Craftable)
        .map(|t| t.item_def_id)
        .collect();
    
    // Filter to craftable weapons and ammunition with valid params
    let mut valid_arms: Vec<u64> = weapon_ids.iter()
        .filter(|id| craftable_ids.contains(id))
        .filter(|id| {
            if let Some(item_def) = item_defs.id().find(*id) {
                let (_, reward) = get_arms_contract_params(&item_def.name);
                reward > 0
            } else { false }
        })
        .cloned()
        .collect();
    
    // Select random subset for this season (arms includes weapons + ammo)
    let num_to_select = SEASONAL_CATEGORY_SIZE.min(valid_arms.len());
    let mut selected: Vec<u64> = Vec::new();
    for _ in 0..num_to_select {
        if valid_arms.is_empty() { break; }
        let idx = rng.gen_range(0..valid_arms.len());
        selected.push(valid_arms.remove(idx));
    }
    
    let mut created = 0;
    for item_id in selected {
        if let Some(item_def) = item_defs.id().find(&item_id) {
            // SECURITY: Never create contracts for Memory Shard (base currency)
            if item_def.name == "Memory Shard" { continue; }
            
            let (bundle_size, reward) = get_arms_contract_params(&item_def.name);
            
            let contract = AlkContract {
                contract_id: 0,
                kind: AlkContractKind::Arms,
                item_def_id: item_id,
                item_name: item_def.name.clone(),
                bundle_size,
                shard_reward_per_bundle: reward,
                max_pool_quantity: None,
                current_pool_remaining: None,
                created_on_day: world_day,
                expires_on_day: None, // Lasts until season change
                allowed_stations: AlkStationAllowance::AllStations,
                is_active: true,
                required_season: Some(season_index),
            };
            
            if contracts_table.try_insert(contract).is_ok() {
                created += 1;
            }
        }
    }
    
    log::info!("⚔️ Generated {} seasonal arms contracts for season {}", created, season_index);
    Ok(())
}

/// Generate seasonal armor contracts - random subset of armor for this season
fn generate_seasonal_armor_contracts(ctx: &ReducerContext, world_day: u32, season_index: u32) -> Result<(), String> {
    let contracts_table = ctx.db.alk_contract();
    let item_defs = ctx.db.item_definition();
    let tags_table = ctx.db.item_alk_tag();
    let mut rng = ctx.rng();
    
    // Find craftable armor
    let armor_ids: Vec<u64> = tags_table.iter()
        .filter(|t| t.tag == AlkItemTag::CategoryArmor)
        .map(|t| t.item_def_id)
        .collect();
    
    let craftable_ids: std::collections::HashSet<u64> = tags_table.iter()
        .filter(|t| t.tag == AlkItemTag::Craftable)
        .map(|t| t.item_def_id)
        .collect();
    
    // Filter to craftable armor with valid params
    let mut valid_armor: Vec<u64> = armor_ids.iter()
        .filter(|id| craftable_ids.contains(id))
        .filter(|id| {
            if let Some(item_def) = item_defs.id().find(*id) {
                let (_, reward) = get_armor_contract_params(&item_def.name);
                reward > 0
            } else { false }
        })
        .cloned()
        .collect();
    
    // Select random subset for this season
    let num_to_select = SEASONAL_CATEGORY_SIZE.min(valid_armor.len());
    let mut selected: Vec<u64> = Vec::new();
    for _ in 0..num_to_select {
        if valid_armor.is_empty() { break; }
        let idx = rng.gen_range(0..valid_armor.len());
        selected.push(valid_armor.remove(idx));
    }
    
    let mut created = 0;
    for item_id in selected {
        if let Some(item_def) = item_defs.id().find(&item_id) {
            // SECURITY: Never create contracts for Memory Shard (base currency)
            if item_def.name == "Memory Shard" { continue; }
            
            let (bundle_size, reward) = get_armor_contract_params(&item_def.name);
            
            let contract = AlkContract {
                contract_id: 0,
                kind: AlkContractKind::Armor,
                item_def_id: item_id,
                item_name: item_def.name.clone(),
                bundle_size,
                shard_reward_per_bundle: reward,
                max_pool_quantity: None,
                current_pool_remaining: None,
                created_on_day: world_day,
                expires_on_day: None,
                allowed_stations: AlkStationAllowance::AllStations,
                is_active: true,
                required_season: Some(season_index),
            };
            
            if contracts_table.try_insert(contract).is_ok() {
                created += 1;
            }
        }
    }
    
    log::info!("🛡️ Generated {} seasonal armor contracts for season {}", created, season_index);
    Ok(())
}

/// Generate seasonal tools contracts - random subset of tools for this season
fn generate_seasonal_tools_contracts(ctx: &ReducerContext, world_day: u32, season_index: u32) -> Result<(), String> {
    let contracts_table = ctx.db.alk_contract();
    let item_defs = ctx.db.item_definition();
    let tags_table = ctx.db.item_alk_tag();
    let mut rng = ctx.rng();
    
    // Find craftable tools
    let tool_ids: Vec<u64> = tags_table.iter()
        .filter(|t| t.tag == AlkItemTag::CategoryTool)
        .map(|t| t.item_def_id)
        .collect();
    
    let craftable_ids: std::collections::HashSet<u64> = tags_table.iter()
        .filter(|t| t.tag == AlkItemTag::Craftable)
        .map(|t| t.item_def_id)
        .collect();
    
    // Filter to craftable tools with valid params
    let mut valid_tools: Vec<u64> = tool_ids.iter()
        .filter(|id| craftable_ids.contains(id))
        .filter(|id| {
            if let Some(item_def) = item_defs.id().find(*id) {
                let (_, reward) = get_tools_contract_params(&item_def.name);
                reward > 0
            } else { false }
        })
        .cloned()
        .collect();
    
    // Select random subset for this season
    let num_to_select = SEASONAL_CATEGORY_SIZE.min(valid_tools.len());
    let mut selected: Vec<u64> = Vec::new();
    for _ in 0..num_to_select {
        if valid_tools.is_empty() { break; }
        let idx = rng.gen_range(0..valid_tools.len());
        selected.push(valid_tools.remove(idx));
    }
    
    let mut created = 0;
    for item_id in selected {
        if let Some(item_def) = item_defs.id().find(&item_id) {
            // SECURITY: Never create contracts for Memory Shard (base currency)
            if item_def.name == "Memory Shard" { continue; }
            
            let (bundle_size, reward) = get_tools_contract_params(&item_def.name);
            
            let contract = AlkContract {
                contract_id: 0,
                kind: AlkContractKind::Tools,
                item_def_id: item_id,
                item_name: item_def.name.clone(),
                bundle_size,
                shard_reward_per_bundle: reward,
                max_pool_quantity: None,
                current_pool_remaining: None,
                created_on_day: world_day,
                expires_on_day: None,
                allowed_stations: AlkStationAllowance::AllStations,
                is_active: true,
                required_season: Some(season_index),
            };
            
            if contracts_table.try_insert(contract).is_ok() {
                created += 1;
            }
        }
    }
    
    log::info!("🔧 Generated {} seasonal tools contracts for season {}", created, season_index);
    Ok(())
}

/// Generate seasonal provisions contracts - random subset of consumables for this season
fn generate_seasonal_provisions_contracts(ctx: &ReducerContext, world_day: u32, season_index: u32) -> Result<(), String> {
    let contracts_table = ctx.db.alk_contract();
    let item_defs = ctx.db.item_definition();
    let tags_table = ctx.db.item_alk_tag();
    let mut rng = ctx.rng();
    
    // Find all consumable items
    let consumable_ids: Vec<u64> = tags_table.iter()
        .filter(|t| t.tag == AlkItemTag::CategoryConsumable)
        .map(|t| t.item_def_id)
        .collect();
    
    // Exclude plant-based items (they go in seasonal harvest)
    let plant_ids: std::collections::HashSet<u64> = tags_table.iter()
        .filter(|t| t.tag == AlkItemTag::PlantBased)
        .map(|t| t.item_def_id)
        .collect();
    
    // Filter to valid consumables (not plants, not currency, not burnt/raw, has value)
    let mut valid_provisions: Vec<u64> = consumable_ids.iter()
        .filter(|id| !plant_ids.contains(id))
        .filter(|id| {
            if let Some(item_def) = item_defs.id().find(*id) {
                // Exclude Memory Shard (it's the currency!)
                if item_def.name == "Memory Shard" { return false; }
                // Exclude burnt foods - only accept properly cooked variants
                if item_def.name.starts_with("Burnt") { return false; }
                // Exclude raw foods - only accept cooked variants for provisions
                if item_def.name.starts_with("Raw") { return false; }
                let (_, reward) = get_provisions_contract_params(&item_def.name, &item_def);
                reward > 0
            } else { false }
        })
        .cloned()
        .collect();
    
    // Select random subset for this season (provisions get more variety)
    let num_to_select = (SEASONAL_CATEGORY_SIZE + 3).min(valid_provisions.len());
    let mut selected: Vec<u64> = Vec::new();
    for _ in 0..num_to_select {
        if valid_provisions.is_empty() { break; }
        let idx = rng.gen_range(0..valid_provisions.len());
        selected.push(valid_provisions.remove(idx));
    }
    
    let mut created = 0;
    for item_id in selected {
        if let Some(item_def) = item_defs.id().find(&item_id) {
            // SECURITY: Never create contracts for Memory Shard (base currency)
            if item_def.name == "Memory Shard" { continue; }
            
            let (bundle_size, reward) = get_provisions_contract_params(&item_def.name, &item_def);
            
            let contract = AlkContract {
                contract_id: 0,
                kind: AlkContractKind::Provisions,
                item_def_id: item_id,
                item_name: item_def.name.clone(),
                bundle_size,
                shard_reward_per_bundle: reward,
                max_pool_quantity: None,
                current_pool_remaining: None,
                created_on_day: world_day,
                expires_on_day: None,
                allowed_stations: AlkStationAllowance::AllStations,
                is_active: true,
                required_season: Some(season_index),
            };
            
            if contracts_table.try_insert(contract).is_ok() {
                created += 1;
            }
        }
    }
    
    log::info!("🍖 Generated {} seasonal provisions contracts for season {}", created, season_index);
    Ok(())
}

/// Generate seasonal harvest contracts - plant-based items ONLY (seasonal)
/// NOTE: This is for raw foraged/farmed plants only - NOT materials like wood, stone, ore
fn generate_seasonal_harvest_contracts(ctx: &ReducerContext, world_day: u32, season_index: u32) -> Result<(), String> {
    let contracts_table = ctx.db.alk_contract();
    let item_defs = ctx.db.item_definition();
    let tags_table = ctx.db.item_alk_tag();
    
    // Items that belong in MATERIALS category, NOT harvest
    // These are already covered by Materials contracts
    const MATERIAL_EXCLUSIONS: &[&str] = &[
        "Wood", "Stone", "Metal Ore", "Metal Fragments", "Sulfur", "Sulfur Ore", 
        "Charcoal", "Coal", "Plant Fiber", "Cloth", "Rope", "Bone", "Bone Fragments",
        "Animal Leather", "Animal Fat", "Wolf Fur", "Fox Fur", "Bear Pelt",
        "Tin Can", "Scrap Batteries", "Gunpowder", "Memory Shard" // These are lichen/moss, not edible plants
    ];
    
    // Find all plant-based items
    let plant_item_ids: Vec<u64> = tags_table.iter()
        .filter(|t| t.tag == AlkItemTag::PlantBased)
        .map(|t| t.item_def_id)
        .collect();
    
    // Get season-specific items
    let season_tag = match season_index {
        0 => AlkItemTag::SeasonSpring,
        1 => AlkItemTag::SeasonSummer,
        2 => AlkItemTag::SeasonAutumn,
        _ => AlkItemTag::SeasonWinter,
    };
    
    let seasonal_item_ids: std::collections::HashSet<u64> = tags_table.iter()
        .filter(|t| t.tag == season_tag || t.tag == AlkItemTag::AllSeasons)
        .map(|t| t.item_def_id)
        .collect();
    
    let mut created = 0;
    for item_id in plant_item_ids {
        // Only create contract if item is available this season
        let is_seasonal = seasonal_item_ids.contains(&item_id);
        
        if let Some(item_def) = item_defs.id().find(&item_id) {
            // Skip items that belong in Materials category
            if MATERIAL_EXCLUSIONS.contains(&item_def.name.as_str()) {
                continue;
            }
            
            // Data-driven contract params from ItemDefinition properties
            let (bundle_size, reward) = calculate_harvest_contract_params(&item_def);
            if reward == 0 { continue; }
            
            // Non-seasonal items get reduced rewards
            let adjusted_reward = if is_seasonal { reward } else { reward / 2 };
            
            let contract = AlkContract {
                contract_id: 0,
                kind: AlkContractKind::SeasonalHarvest,
                item_def_id: item_id,
                item_name: item_def.name.clone(),
                bundle_size,
                shard_reward_per_bundle: adjusted_reward,
                max_pool_quantity: None,
                current_pool_remaining: None,
                created_on_day: world_day,
                expires_on_day: None,
                allowed_stations: AlkStationAllowance::AllStations,
                is_active: is_seasonal, // Only active if in-season
                required_season: if is_seasonal { Some(season_index) } else { None },
            };
            
            if contracts_table.try_insert(contract).is_ok() {
                created += 1;
            }
        }
    }
    
    log::info!("🌱 Generated {} seasonal harvest contracts for season {}", created, season_index);
    Ok(())
}

/// Generate bonus contracts (rotating, time-limited)
fn generate_bonus_contracts(ctx: &ReducerContext, world_day: u32, _season_index: u32) -> Result<(), String> {
    let contracts_table = ctx.db.alk_contract();
    let item_defs = ctx.db.item_definition();
    let tags_table = ctx.db.item_alk_tag();
    let mut rng = ctx.rng();
    
    // Find all high-value items eligible for bonus contracts
    let bonus_item_ids: Vec<u64> = tags_table.iter()
        .filter(|t| t.tag == AlkItemTag::HighValue)
        .map(|t| t.item_def_id)
        .collect();
    
    if bonus_item_ids.is_empty() {
        log::warn!("No bonus-eligible items found");
        return Ok(());
    }
    
    // Select 3-5 random items for bonus contracts
    let num_contracts = rng.gen_range(3..=5).min(bonus_item_ids.len());
    let mut selected_ids: Vec<u64> = Vec::new();
    let mut available_ids = bonus_item_ids.clone();
    
    for _ in 0..num_contracts {
        if available_ids.is_empty() { break; }
        let idx = rng.gen_range(0..available_ids.len());
        selected_ids.push(available_ids.remove(idx));
    }
    
    let mut created = 0;
    for item_id in selected_ids {
        if let Some(item_def) = item_defs.id().find(&item_id) {
            // SECURITY: Never create contracts for Memory Shard (base currency)
            if item_def.name == "Memory Shard" {
                continue;
            }
            
            // Bonus contracts have SIGNIFICANTLY higher rewards but limited pool
            // Pool quantity determines total items that can be delivered across ALL players
            // Data-driven contract params from ItemDefinition properties
            let (bundle_size, base_reward) = calculate_bonus_contract_params(&item_def);
            // Bonus reward is already high, no additional multiplier needed
            let bonus_reward = base_reward;
            // Pool is much larger to allow multiple players to participate
            let pool_quantity = rng.gen_range(500..=2000);
            // Expiry gives urgency but enough time to farm
            let expiry_days = rng.gen_range(5..=14);
            
            let contract = AlkContract {
                contract_id: 0,
                kind: AlkContractKind::DailyBonus,
                item_def_id: item_id,
                item_name: item_def.name.clone(),
                bundle_size,
                shard_reward_per_bundle: bonus_reward,
                max_pool_quantity: Some(pool_quantity),
                current_pool_remaining: Some(pool_quantity),
                created_on_day: world_day,
                expires_on_day: Some(world_day + expiry_days),
                allowed_stations: AlkStationAllowance::CompoundOnly, // Bonus only at main compound
                is_active: true,
                required_season: None,
            };
            
            if contracts_table.try_insert(contract).is_ok() {
                created += 1;
            }
        }
    }
    
    log::info!("⭐ Generated {} bonus contracts", created);
    Ok(())
}

// ============================================================================
// CONTRACT PARAMETER FUNCTIONS - Dynamic reward calculation
// ============================================================================
// Design Philosophy:
// - Bundle sizes reflect realistic collection effort (1 hour of focused play)
// - Rewards should be 3-5x ambient shard collection rate
// - Craftable items pay more (labor + materials)
// - Dangerous/rare items pay premium

/// Get bundle size and reward for material items
fn get_material_contract_params(item_name: &str) -> (u32, u32) {
    match item_name {
        // === MINING (travel to nodes) ===
        "Stone" => (200, 30),
        "Metal Ore" => (80, 55),
        "Metal Fragments" => (40, 75),
        "Sulfur" | "Sulfur Ore" => (60, 65),
        "Coal" => (80, 45),
        
        // === WOOD (common) ===
        "Wood" => (250, 25),
        "Charcoal" => (80, 50),
        
        // === FIBER/TEXTILES ===
        "Plant Fiber" => (300, 20),
        "Cloth" => (35, 60),
        "Rope" => (25, 45),
        
        // === BONE ===
        "Bone" => (40, 40),
        "Bone Fragments" => (60, 35),
        
        // === ANIMAL PRODUCTS ===
        "Animal Leather" => (20, 80),
        "Wolf Fur" => (12, 95),
        "Fox Fur" => (15, 70),
        
        // === SCAVENGED ===
        "Tin Can" => (40, 30),
        "Scrap Batteries" => (20, 50),
        "Gunpowder" => (30, 85),
        
        // === FARMING MATERIALS ===
        "Fertilizer" => (50, 40),
        
        // Skip items not suitable for material contracts
        "Memory Shard" => (0, 0), // Currency, not a material
        
        _ => (75, 35), // Default
    }
}

/// Get bundle size and reward for arms (weapons AND ammunition)
fn get_arms_contract_params(item_name: &str) -> (u32, u32) {
    match item_name {
        // === MELEE - BASIC ===
        "Stone Knife" => (5, 40),
        "Bone Club" => (5, 35),
        "Wooden Spear" => (3, 45),
        "Bone Dagger" => (4, 50),
        
        // === MELEE - INTERMEDIATE ===
        "Metal Knife" => (3, 80),
        "Metal Spear" => (2, 100),
        "Metal Sword" => (2, 120),
        "Metal Axe" => (2, 110), // Combat variant
        
        // === RANGED - BASIC ===
        "Wooden Bow" => (3, 60),
        "Reed Harpoon" => (5, 50),
        "Slingshot" => (4, 45),
        
        // === RANGED - ADVANCED ===
        "Compound Bow" => (1, 150),
        "Crossbow" => (1, 180),
        "Improvised Pistol" => (1, 200),
        "Hunting Rifle" => (1, 250),
        
        // === AMMUNITION - ARROWS ===
        "Wooden Arrow" => (50, 35),      // Basic arrows - common materials
        "Bone Arrow" => (40, 50),        // Higher damage arrows
        "Fire Arrow" => (30, 65),        // Special effect arrows - premium
        "Hollow Reed Arrow" => (60, 30), // Fast but light arrows
        
        // === AMMUNITION - BULLETS ===
        "9x18mm Round" => (25, 80),      // Premium ammo - requires gunpowder
        
        _ => (3, 60), // Default for unlisted weapons/ammo
    }
}

/// Get bundle size and reward for armor
fn get_armor_contract_params(item_name: &str) -> (u32, u32) {
    match item_name {
        // === CLOTH ARMOR ===
        "Cloth Hood" => (3, 35),
        "Cloth Shirt" => (3, 40),
        "Cloth Pants" => (3, 40),
        "Cloth Boots" => (4, 30),
        
        // === LEATHER ARMOR ===
        "Leather Hood" => (2, 60),
        "Leather Vest" => (2, 75),
        "Leather Pants" => (2, 70),
        "Leather Boots" => (3, 55),
        "Leather Gloves" => (3, 50),
        
        // === BONE ARMOR ===
        "Bone Helmet" => (2, 85),
        "Bone Chestplate" => (1, 120),
        "Bone Leggings" => (2, 100),
        
        // === METAL ARMOR ===
        "Metal Helmet" => (1, 150),
        "Metal Chestplate" => (1, 200),
        "Metal Leggings" => (1, 175),
        "Metal Boots" => (2, 130),
        "Metal Gauntlets" => (2, 120),
        
        // === FUR/COLD WEATHER ===
        "Fur Hood" => (2, 70),
        "Fur Coat" => (1, 110),
        "Fur Pants" => (2, 90),
        "Fur Boots" => (2, 65),
        
        _ => (2, 55), // Default
    }
}

/// Get bundle size and reward for tools
fn get_tools_contract_params(item_name: &str) -> (u32, u32) {
    match item_name {
        // === GATHERING - BASIC ===
        "Stone Pickaxe" => (4, 40),
        "Stone Hatchet" => (4, 40),
        "Wooden Fishing Rod" => (3, 35),
        
        // === GATHERING - METAL ===
        "Metal Pickaxe" => (2, 90),
        "Metal Hatchet" => (2, 90),
        "Metal Fishing Rod" => (2, 70),
        
        // === UTILITY ===
        "Torch" => (10, 20),
        "Lantern" => (2, 60),
        "Compass" => (2, 75),
        "Binoculars" => (1, 100),
        
        // === CRAFTING STATIONS ===
        "Workbench" => (1, 80),
        "Forge" => (1, 120),
        "Tanning Rack" => (1, 65),
        "Loom" => (1, 70),
        
        _ => (3, 45), // Default
    }
}

/// Get bundle size and reward for provisions (consumables, non-plant)
/// NOTE: Only COOKED foods are accepted - raw and burnt items are excluded
fn get_provisions_contract_params(item_name: &str, item_def: &crate::items::ItemDefinition) -> (u32, u32) {
    // EXCLUDE: Burnt and raw foods - ALK only accepts properly cooked variants
    if item_name.starts_with("Burnt") || item_name.starts_with("Raw") {
        return (0, 0);
    }
    
    // First check specific items
    match item_name {
        // === COOKED FISH ===
        "Cooked Salmon" => (20, 70),
        "Cooked Herring" | "Cooked Cod" | "Cooked Mackerel" => (30, 45),
        "Cooked Twigfish" => (50, 30),
        
        // === COOKED MEAT ===
        "Cooked Wolf Meat" => (15, 75),
        "Cooked Fox Meat" => (20, 60),
        "Cooked Crab Meat" => (25, 50),
        "Cooked Crow Meat" | "Cooked Tern Meat" => (35, 40),
        "Cooked Seal Meat" => (20, 65),
        "Cooked Caribou Meat" => (18, 70),
        "Cooked Moose Meat" => (15, 80),
        "Cooked Hare Meat" => (25, 55),
        
        // === COOKED VEGETABLES ===
        "Cooked Potato" => (50, 45),
        "Cooked Pumpkin" => (35, 50),
        "Cooked Corn" => (50, 45),
        "Cooked Carrot" => (60, 40),
        "Cooked Beet" => (50, 45),
        
        // === MEDICAL ===
        "Bandage" => (20, 55),
        "First Aid Kit" => (5, 100),
        "Antidote" => (10, 70),
        "Painkillers" => (15, 60),
        
        // === DRINKS ===
        "Clean Water" => (30, 25),
        "Herbal Tea" => (20, 40),
        "Berry Juice" => (25, 35),
        
        // === BROTH/SOUPS ===
        "Fish Broth" => (15, 65),
        "Meat Stew" => (10, 80),
        "Vegetable Soup" => (15, 55),
        
        _ => {
            // Dynamic fallback based on item stats
            // Note: Raw/Burnt already filtered above
            let hunger = item_def.consumable_hunger_satiated.unwrap_or(0.0) as u32;
            let thirst = item_def.consumable_thirst_quenched.unwrap_or(0.0) as u32;
            let health = item_def.consumable_health_gain.unwrap_or(0.0).max(0.0) as u32;
            
            // Calculate value based on stats
            let value = hunger + thirst + (health * 2);
            if value == 0 { return (0, 0); } // Skip items with no consumable value
            
            let bundle_size = (100 / value.max(1)).max(5).min(100);
            let reward = (value / 2).max(20).min(100);
            (bundle_size, reward)
        }
    }
}

/// Calculate bundle size and reward for seasonal harvest based on ItemDefinition properties
/// SEASONAL ITEMS PAY MORE because they're time-limited!
/// NOTE: This is for raw foraged/farmed plants only - NOT materials
/// 
/// Data-driven approach using ItemDefinition fields:
/// - respawn_time_seconds: Rarer items (longer respawn) = higher value
/// - consumable stats: Better nutrition = higher value  
/// - stack_size: Higher stack = more common = smaller per-unit value
fn calculate_harvest_contract_params(item_def: &crate::items::ItemDefinition) -> (u32, u32) {
    use crate::items::ItemCategory;
    
    let item_name = &item_def.name;
    
    // EXCLUDE: Materials category items don't belong in harvest
    if matches!(item_def.category, ItemCategory::Material) {
        return (0, 0);
    }
    
    // EXCLUDE: Burnt items (waste products)
    if item_name.starts_with("Burnt") {
        return (0, 0);
    }
    
    // EXCLUDE: Cooked items belong in provisions
    if item_name.starts_with("Cooked") || item_name.starts_with("Roasted") || item_name.starts_with("Toasted") {
        return (0, 0);
    }
    
    // === Calculate value from item properties ===
    
    // Base value from consumable stats (for edible plants)
    let hunger = item_def.consumable_hunger_satiated.unwrap_or(0.0).max(0.0);
    let thirst = item_def.consumable_thirst_quenched.unwrap_or(0.0).max(0.0);
    let health = item_def.consumable_health_gain.unwrap_or(0.0).max(0.0);
    let nutrition_value = (hunger + thirst + health * 1.5) as u32;
    
    // Rarity factor from respawn time (0-600+ seconds)
    // Longer respawn = rarer = higher value
    let respawn_secs = item_def.respawn_time_seconds.unwrap_or(300);
    let rarity_factor = match respawn_secs {
        0..=180 => 0.8,        // Very common (≤3 min)
        181..=300 => 1.0,      // Common (3-5 min)
        301..=480 => 1.2,      // Uncommon (5-8 min)
        481..=720 => 1.4,      // Rare (8-12 min)
        _ => 1.6,              // Very rare (>12 min)
    };
    
    // Stack size factor - items that stack higher are more common/less valuable
    let stack_size = item_def.stack_size.max(1);
    let stack_factor = match stack_size {
        1..=10 => 1.4,         // Low stack = valuable
        11..=25 => 1.2,        // Medium-low
        26..=50 => 1.0,        // Normal
        _ => 0.8,              // High stack = common
    };
    
    // Calculate base reward (40-100 range typically)
    let base_reward = if nutrition_value > 0 {
        // Edible items: value from nutrition
        ((nutrition_value as f32 * rarity_factor * stack_factor * 2.0) as u32).clamp(40, 100)
    } else {
        // Non-edible plants (seeds, etc): value from rarity alone
        ((rarity_factor * stack_factor * 50.0) as u32).clamp(35, 80)
    };
    
    // Calculate bundle size (inversely related to value)
    // Higher value = smaller bundles, lower value = larger bundles
    let bundle_size = match base_reward {
        0..=45 => (80.0 / stack_factor) as u32,
        46..=55 => (60.0 / stack_factor) as u32,
        56..=70 => (45.0 / stack_factor) as u32,
        71..=85 => (35.0 / stack_factor) as u32,
        _ => (25.0 / stack_factor) as u32,
    }.clamp(15, 100);
    
    (bundle_size, base_reward)
}

/// Calculate bundle size and reward for bonus items based on ItemDefinition properties
/// Bonus contracts are HIGH VALUE items - rewards are 2-3x normal rates
/// 
/// Data-driven approach using ItemDefinition fields:
/// - crafting_cost: More complex recipes = higher value
/// - category: Weapons/Armor worth more than consumables
/// - respawn_time_seconds: Rarer items = higher value
/// - pvp_damage: Combat effectiveness increases value
/// - armor_resistances: Better protection = higher value
fn calculate_bonus_contract_params(item_def: &crate::items::ItemDefinition) -> (u32, u32) {
    use crate::items::ItemCategory;
    
    let item_name = &item_def.name;
    
    // SECURITY: Never allow Memory Shard in contracts
    if item_name == "Memory Shard" {
        return (0, 0);
    }
    
    // EXCLUDE: Burnt items (waste products)
    if item_name.starts_with("Burnt") {
        return (0, 0);
    }
    
    // EXCLUDE: Raw items (should be cooked first for bonus)
    if item_name.starts_with("Raw ") && !item_name.contains("Human") {
        return (0, 0);
    }
    
    // === Calculate crafting complexity value ===
    let crafting_value: u32 = if let Some(ref cost) = item_def.crafting_cost {
        // Sum of all ingredient quantities + 10 per unique ingredient
        let ingredient_complexity: u32 = cost.iter()
            .map(|c| c.quantity + 10)
            .sum();
        (ingredient_complexity / 5).min(100)
    } else {
        // Non-craftable items: value from rarity (drops, loot)
        let respawn = item_def.respawn_time_seconds.unwrap_or(300);
        (respawn / 10).min(80)
    };
    
    // === Calculate combat effectiveness value ===
    let combat_value: u32 = {
        let pvp_min = item_def.pvp_damage_min.unwrap_or(0);
        let pvp_max = item_def.pvp_damage_max.unwrap_or(0);
        let avg_damage = (pvp_min + pvp_max) / 2;
        
        // Check armor resistances
        let armor_value = if let Some(ref resistances) = item_def.armor_resistances {
            let total_resist = (resistances.melee_resistance + 
                               resistances.projectile_resistance + 
                               resistances.fire_resistance.max(0.0) +
                               resistances.cold_resistance) * 100.0;
            total_resist as u32
        } else {
            0
        };
        
        avg_damage + armor_value
    };
    
    // === Calculate consumable value (for cooked foods, medicine) ===
    let consumable_value: u32 = {
        let hunger = item_def.consumable_hunger_satiated.unwrap_or(0.0).max(0.0);
        let thirst = item_def.consumable_thirst_quenched.unwrap_or(0.0).max(0.0);
        let health = item_def.consumable_health_gain.unwrap_or(0.0).max(0.0);
        ((hunger + thirst + health * 2.0) / 3.0) as u32
    };
    
    // === Category multiplier (bonus contracts favor rare/valuable categories) ===
    let category_multiplier: f32 = match &item_def.category {
        ItemCategory::RangedWeapon => 2.5,  // Guns/bows are premium
        ItemCategory::Weapon => 2.0,         // Melee weapons
        ItemCategory::Armor => 1.8,          // Armor pieces  
        ItemCategory::Ammunition => 1.5,     // Ammo is valuable
        ItemCategory::Tool => 1.4,           // Tools
        ItemCategory::Material => 1.2,       // Raw materials (furs, glands)
        ItemCategory::Consumable => 1.3,     // Cooked foods, medicine
        ItemCategory::Placeable => 1.0,      // Structures (less common in bonus)
    };
    
    // === Rarity multiplier from stack size ===
    let stack_size = item_def.stack_size.max(1);
    let rarity_multiplier: f32 = match stack_size {
        1 => 2.0,              // Non-stackable = unique/valuable
        2..=5 => 1.5,          // Very low stack
        6..=15 => 1.2,         // Low stack
        16..=30 => 1.0,        // Normal
        _ => 0.8,              // High stack = common
    };
    
    // === Combine all values into final reward ===
    let raw_value = crafting_value + combat_value + consumable_value;
    let adjusted_value = (raw_value as f32 * category_multiplier * rarity_multiplier) as u32;
    
    // Bonus contracts have high rewards (100-450 range)
    let base_reward = adjusted_value.clamp(100, 450);
    
    // Bundle size inversely proportional to value
    let bundle_size = match base_reward {
        100..=150 => (25.0 * rarity_multiplier) as u32,
        151..=200 => (15.0 * rarity_multiplier) as u32,
        201..=280 => (8.0 * rarity_multiplier) as u32,
        281..=350 => (4.0 * rarity_multiplier) as u32,
        _ => (2.0 * rarity_multiplier) as u32,
    }.clamp(1, 50);
    
    (bundle_size, base_reward)
}

// ============================================================================
// SCHEDULED REDUCER - Contract Refresh
// ============================================================================

/// Scheduled reducer to check and refresh contracts
#[spacetimedb::reducer]
pub fn process_alk_contract_refresh(ctx: &ReducerContext, _args: AlkContractRefreshSchedule) -> Result<(), String> {
    // Security check - only scheduler can run this
    if ctx.sender != ctx.identity() {
        return Err("ALK contract refresh can only be run by scheduler".to_string());
    }
    
    let alk_state_table = ctx.db.alk_state();
    let mut alk_state = match alk_state_table.iter().next() {
        Some(state) => state,
        None => return Ok(()), // No ALK state, skip
    };
    
    // Get current world state
    let world_state = match ctx.db.world_state().iter().next() {
        Some(ws) => ws,
        None => return Ok(()),
    };
    
    let current_world_day = world_state.day_of_year + (world_state.year - 1) * 960;
    let current_season_index = (world_state.day_of_year - 1) / DAYS_PER_SEASON;
    let current_daily_cycle = current_world_day / DAYS_PER_ALK_CYCLE;
    
    let mut did_refresh = false;
    
    // Check if season changed
    if current_season_index != alk_state.season_index {
        log::info!("🍂 Season changed from {} to {} - refreshing food contracts", 
                  alk_state.season_index, current_season_index);
        
        // Deactivate old seasonal food contracts
        deactivate_seasonal_contracts(ctx, alk_state.season_index)?;
        
        // Generate new seasonal harvest contracts
        generate_seasonal_harvest_contracts(ctx, current_world_day, current_season_index)?;
        
        alk_state.season_index = current_season_index;
        did_refresh = true;
    }
    
    // Check if ALK daily cycle changed
    if current_daily_cycle != alk_state.daily_cycle_index {
        log::info!("⏰ ALK cycle changed from {} to {} - refreshing bonus contracts",
                  alk_state.daily_cycle_index, current_daily_cycle);
        
        // Expire old bonus contracts
        expire_old_bonus_contracts(ctx, current_world_day)?;
        
        // Generate new bonus contracts
        generate_bonus_contracts(ctx, current_world_day, current_season_index)?;
        
        alk_state.daily_cycle_index = current_daily_cycle;
        did_refresh = true;
    }
    
    // Check and expire individual contracts
    expire_contracts(ctx, current_world_day)?;
    
    // Check and fail expired player contracts
    fail_expired_player_contracts(ctx, current_world_day)?;
    
    // Update state
    if did_refresh || alk_state.world_day_snapshot != current_world_day {
        alk_state.world_day_snapshot = current_world_day;
        alk_state.last_refresh = ctx.timestamp;
        alk_state_table.id().update(alk_state);
    }
    
    Ok(())
}

/// Deactivate seasonal contracts that no longer match current season
fn deactivate_seasonal_contracts(ctx: &ReducerContext, old_season_index: u32) -> Result<(), String> {
    let contracts_table = ctx.db.alk_contract();
    
    let seasonal_contracts: Vec<_> = contracts_table.iter()
        .filter(|c| c.kind == AlkContractKind::BaseFood && c.required_season == Some(old_season_index))
        .collect();
    
    for mut contract in seasonal_contracts {
        contract.is_active = false;
        contracts_table.contract_id().update(contract);
    }
    
    Ok(())
}

/// Expire old bonus contracts that have passed their expiry date
fn expire_old_bonus_contracts(ctx: &ReducerContext, current_world_day: u32) -> Result<(), String> {
    let contracts_table = ctx.db.alk_contract();
    
    let expired_contracts: Vec<_> = contracts_table.iter()
        .filter(|c| c.kind == AlkContractKind::DailyBonus && 
                c.expires_on_day.map(|d| d <= current_world_day).unwrap_or(false))
        .collect();
    
    for mut contract in expired_contracts {
        contract.is_active = false;
        contracts_table.contract_id().update(contract);
    }
    
    Ok(())
}

/// Expire contracts based on their expiry date
fn expire_contracts(ctx: &ReducerContext, current_world_day: u32) -> Result<(), String> {
    let contracts_table = ctx.db.alk_contract();
    
    let to_expire: Vec<_> = contracts_table.iter()
        .filter(|c| c.is_active && c.expires_on_day.map(|d| d <= current_world_day).unwrap_or(false))
        .collect();
    
    let expire_count = to_expire.len();
    for mut contract in to_expire {
        contract.is_active = false;
        contracts_table.contract_id().update(contract);
    }
    
    if expire_count > 0 {
        log::info!("📤 Expired {} contracts", expire_count);
    }
    
    Ok(())
}

/// Mark player contracts as failed if they've expired
fn fail_expired_player_contracts(ctx: &ReducerContext, current_world_day: u32) -> Result<(), String> {
    let player_contracts_table = ctx.db.alk_player_contract();
    
    let expired: Vec<_> = player_contracts_table.iter()
        .filter(|pc| pc.status == AlkContractStatus::Active && pc.expires_on_day <= current_world_day)
        .collect();
    
    let failed_count = expired.len();
    for mut pc in expired {
        pc.status = AlkContractStatus::Failed;
        pc.completed_at = Some(ctx.timestamp);
        player_contracts_table.id().update(pc);
    }
    
    if failed_count > 0 {
        log::info!("❌ Marked {} player contracts as failed due to expiry", failed_count);
    }
    
    Ok(())
}

// ============================================================================
// PLAYER REDUCERS - Contract Interactions
// ============================================================================

/// Get all available contracts for the current player
#[spacetimedb::reducer]
pub fn get_available_contracts(ctx: &ReducerContext) -> Result<(), String> {
    // This reducer doesn't need to do anything - clients subscribe to the contracts table
    // Just log for debugging
    let _sender = ctx.sender;
    let contracts_table = ctx.db.alk_contract();
    let active_count = contracts_table.iter().filter(|c| c.is_active).count();
    log::debug!("Available contracts query: {} active contracts", active_count);
    Ok(())
}

/// Accept a contract
#[spacetimedb::reducer]
pub fn accept_alk_contract(
    ctx: &ReducerContext, 
    contract_id: u64,
    target_quantity: u32,
    preferred_station_id: Option<u32>,
) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Validate player exists
    let _player = ctx.db.player().identity().find(&player_id)
        .ok_or("Player not found")?;
    
    // Get the contract
    let contracts_table = ctx.db.alk_contract();
    let contract = contracts_table.contract_id().find(&contract_id)
        .ok_or("Contract not found")?;
    
    // SECURITY: Memory Shard is the base currency - cannot have contracts for it
    // This prevents infinite currency exploits
    if contract.item_name.trim() == "Memory Shard" {
        log::warn!("🚫 Player {:?} attempted to accept Memory Shard contract - rejected (currency exploit prevention)", player_id);
        return Err("Memory Shard contracts are not allowed - it is the base currency".to_string());
    }
    
    // Validate contract is active
    if !contract.is_active {
        return Err("Contract is no longer active".to_string());
    }
    
    // Check if player has too many active contracts
    let player_contracts_table = ctx.db.alk_player_contract();
    let active_count = player_contracts_table.iter()
        .filter(|pc| pc.player_id == player_id && pc.status == AlkContractStatus::Active)
        .count();
    
    if active_count >= MAX_ACTIVE_PLAYER_CONTRACTS {
        return Err(format!("Cannot have more than {} active contracts", MAX_ACTIVE_PLAYER_CONTRACTS));
    }
    
    // Validate target quantity
    let bundle_size = contract.bundle_size;
    if target_quantity < bundle_size {
        return Err(format!("Minimum delivery is {} items (1 bundle)", bundle_size));
    }
    
    // Round target to bundle size
    let adjusted_quantity = (target_quantity / bundle_size) * bundle_size;
    
    // For bonus contracts, check and reserve from pool
    if contract.kind == AlkContractKind::DailyBonus {
        if let Some(remaining) = contract.current_pool_remaining {
            if remaining < adjusted_quantity {
                return Err(format!("Only {} items remaining in contract pool", remaining));
            }
            // Reserve the quantity
            let mut updated_contract = contract.clone();
            updated_contract.current_pool_remaining = Some(remaining - adjusted_quantity);
            contracts_table.contract_id().update(updated_contract);
        }
    }
    
    // Get world day for tracking
    let world_state = ctx.db.world_state().iter().next();
    let world_day = match world_state {
        Some(ws) => ws.day_of_year + (ws.year - 1) * 960,
        None => 1,
    };
    
    // Calculate expiry (longer for base contracts, shorter for bonus)
    let expiry_days = match contract.kind {
        AlkContractKind::DailyBonus => contract.expires_on_day.unwrap_or(world_day + 5) - world_day,
        _ => 30, // 30 days for base contracts
    };
    
    // Create player contract
    let player_contract = AlkPlayerContract {
        id: 0,
        player_id,
        contract_id,
        accepted_on_day: world_day,
        expires_on_day: world_day + expiry_days,
        target_quantity: adjusted_quantity,
        delivered_quantity: 0,
        status: AlkContractStatus::Active,
        delivery_station_id: preferred_station_id,
        accepted_at: ctx.timestamp,
        completed_at: None,
    };
    
    match player_contracts_table.try_insert(player_contract) {
        Ok(_) => {
            log::info!("📜 Player {:?} accepted contract {} for {} {} (expires day {})", 
                      player_id, contract_id, adjusted_quantity, contract.item_name, world_day + expiry_days);
            Ok(())
        },
        Err(e) => Err(format!("Failed to accept contract: {}", e)),
    }
}

/// Cancel a player contract
#[spacetimedb::reducer]
pub fn cancel_alk_contract(ctx: &ReducerContext, player_contract_id: u64) -> Result<(), String> {
    let player_id = ctx.sender;
    let player_contracts_table = ctx.db.alk_player_contract();
    
    let mut player_contract = player_contracts_table.id().find(&player_contract_id)
        .ok_or("Player contract not found")?;
    
    // Verify ownership
    if player_contract.player_id != player_id {
        return Err("You can only cancel your own contracts".to_string());
    }
    
    // Must be active to cancel
    if player_contract.status != AlkContractStatus::Active {
        return Err("Contract is not active".to_string());
    }
    
    // For bonus contracts, return reserved quantity to pool
    let contracts_table = ctx.db.alk_contract();
    if let Some(mut contract) = contracts_table.contract_id().find(&player_contract.contract_id) {
        if contract.kind == AlkContractKind::DailyBonus {
            let undelivered = player_contract.target_quantity - player_contract.delivered_quantity;
            if let Some(remaining) = contract.current_pool_remaining {
                contract.current_pool_remaining = Some(remaining + undelivered);
                contracts_table.contract_id().update(contract);
            }
        }
    }
    
    player_contract.status = AlkContractStatus::Cancelled;
    player_contract.completed_at = Some(ctx.timestamp);
    player_contracts_table.id().update(player_contract);
    
    log::info!("❌ Player {:?} cancelled contract {}", player_id, player_contract_id);
    Ok(())
}

/// Deliver items to fulfill a contract at a station
#[spacetimedb::reducer]
pub fn deliver_alk_contract(
    ctx: &ReducerContext, 
    player_contract_id: u64,
    station_id: u32,
) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Get player
    let player = ctx.db.player().identity().find(&player_id)
        .ok_or("Player not found")?;
    
    // Get station and validate player is in range
    let stations_table = ctx.db.alk_station();
    let station = stations_table.station_id().find(&station_id)
        .ok_or("Station not found")?;
    
    if !station.is_active {
        return Err("Station is not operational".to_string());
    }
    
    // Check player is in range
    let dx = player.position_x - station.world_pos_x;
    let dy = player.position_y - station.world_pos_y;
    let distance_sq = dx * dx + dy * dy;
    let interaction_radius_sq = station.interaction_radius * station.interaction_radius;
    
    if distance_sq > interaction_radius_sq {
        return Err("You must be at the station to deliver".to_string());
    }
    
    // Get player contract
    let player_contracts_table = ctx.db.alk_player_contract();
    let mut player_contract = player_contracts_table.id().find(&player_contract_id)
        .ok_or("Player contract not found")?;
    
    if player_contract.player_id != player_id {
        return Err("You can only deliver your own contracts".to_string());
    }
    
    if player_contract.status != AlkContractStatus::Active {
        return Err("Contract is not active".to_string());
    }
    
    // Get contract template
    let contracts_table = ctx.db.alk_contract();
    let contract = contracts_table.contract_id().find(&player_contract.contract_id)
        .ok_or("Contract template not found")?;
    
    // Validate station is allowed for this contract
    let station_allowed = match contract.allowed_stations {
        AlkStationAllowance::CompoundOnly => station_id == 0,
        AlkStationAllowance::SubstationsOnly => station_id > 0,
        AlkStationAllowance::AllStations => true,
    };
    
    if !station_allowed {
        return Err(format!("This contract cannot be delivered at {}", station.name));
    }
    
    // Check player has the required items
    let items_table = ctx.db.inventory_item();
    let remaining_to_deliver = player_contract.target_quantity - player_contract.delivered_quantity;
    
    // Find matching items in player inventory
    let player_items: Vec<_> = items_table.iter()
        .filter(|item| {
            item.item_def_id == contract.item_def_id &&
            (matches!(&item.location, ItemLocation::Inventory(loc) if loc.owner_id == player_id) ||
            matches!(&item.location, ItemLocation::Hotbar(loc) if loc.owner_id == player_id))
        })
        .collect();
    
    let total_available: u32 = player_items.iter().map(|i| i.quantity).sum();
    
    if total_available < contract.bundle_size {
        return Err(format!("You need at least {} {} to deliver (have {})", 
                          contract.bundle_size, contract.item_name, total_available));
    }
    
    // Calculate how much to deliver (up to remaining target, limited by inventory)
    let to_deliver = remaining_to_deliver.min(total_available);
    let bundles_delivered = to_deliver / contract.bundle_size;
    let items_consumed = bundles_delivered * contract.bundle_size;
    
    if bundles_delivered == 0 {
        return Err("Not enough items for even one bundle".to_string());
    }
    
    // Consume items from inventory
    let mut items_to_consume = items_consumed;
    for item in player_items {
        if items_to_consume == 0 { break; }
        
        let consume_from_stack = item.quantity.min(items_to_consume);
        items_to_consume -= consume_from_stack;
        
        if consume_from_stack >= item.quantity {
            // Delete entire stack
            items_table.instance_id().delete(item.instance_id);
        } else {
            // Reduce stack
            let mut updated_item = item.clone();
            updated_item.quantity -= consume_from_stack;
            items_table.instance_id().update(updated_item);
        }
    }
    
    // Calculate reward
    let gross_reward = bundles_delivered * contract.shard_reward_per_bundle;
    let fee = (gross_reward as f32 * station.delivery_fee_rate) as u32;
    let net_reward = gross_reward.saturating_sub(fee);
    
    // Give actual Memory Shard items to player (instead of just incrementing a balance)
    // Find Memory Shard item definition
    let memory_shard_def_id = ctx.db.item_definition().iter()
        .find(|def| def.name == "Memory Shard")
        .map(|def| def.id);
    
    if let Some(shard_def_id) = memory_shard_def_id {
        // Give shards to player (will drop at feet if inventory full)
        match give_item_to_player_or_drop(ctx, player_id, shard_def_id, net_reward) {
            Ok(added_to_inv) => {
                if added_to_inv {
                    log::info!("💎 Added {} Memory Shards to player {:?} inventory", net_reward, player_id);
                } else {
                    log::info!("💎 Dropped {} Memory Shards at player {:?} feet (inventory full)", net_reward, player_id);
                }
            }
            Err(e) => {
                log::error!("Failed to give Memory Shards to player: {}", e);
                // Don't fail the whole transaction, just log the error
            }
        }
    } else {
        log::error!("Memory Shard item definition not found! Cannot reward player.");
    }
    
    // Also update player shard balance for tracking/statistics
    let balance_table = ctx.db.player_shard_balance();
    let mut balance = balance_table.player_id().find(&player_id)
        .unwrap_or(PlayerShardBalance {
            player_id,
            balance: 0,
            total_earned: 0,
            total_spent: 0,
            last_transaction: ctx.timestamp,
        });
    
    // Note: balance no longer tracks actual shards, just statistics
    balance.total_earned += net_reward as u64;
    balance.last_transaction = ctx.timestamp;
    
    if balance_table.player_id().find(&player_id).is_some() {
        balance_table.player_id().update(balance);
    } else {
        let _ = balance_table.try_insert(balance);
    }
    
    // Update player contract
    let was_completed = player_contract.status == AlkContractStatus::Completed;
    player_contract.delivered_quantity += items_consumed;
    if player_contract.delivered_quantity >= player_contract.target_quantity {
        player_contract.status = AlkContractStatus::Completed;
        player_contract.completed_at = Some(ctx.timestamp);
    }
    player_contracts_table.id().update(player_contract.clone());
    
    log::info!("📦 Player {:?} delivered {} {} ({} bundles) at {} for {} shards (fee: {})",
              player_id, items_consumed, contract.item_name, bundles_delivered, 
              station.name, net_reward, fee);
    
    if player_contract.status == AlkContractStatus::Completed && !was_completed {
        log::info!("✅ Contract {} completed!", player_contract_id);
        
        // Award XP and update stats for contract completion
        if let Err(e) = crate::player_progression::award_xp(ctx, player_id, crate::player_progression::XP_CONTRACT_COMPLETED) {
            log::error!("Failed to award XP for contract completion: {}", e);
        }
        
        // Track contracts_completed stat and check achievements
        // Also update total_shards_earned
        {
            let mut stats = crate::player_progression::get_or_init_player_stats(ctx, player_id);
            stats.total_shards_earned += net_reward as u64;
            stats.updated_at = ctx.timestamp;
            ctx.db.player_stats().player_id().update(stats.clone());
        }
        if let Err(e) = crate::player_progression::track_stat_and_check_achievements(ctx, player_id, "contracts_completed", 1) {
            log::error!("Failed to track contract completion stat: {}", e);
        }
        
        // Track quest progress for ALK contract delivery
        if let Err(e) = crate::quests::track_quest_progress(
            ctx,
            player_id,
            crate::quests::QuestObjectiveType::DeliverAlkContract,
            None,
            1,
        ) {
            log::error!("Failed to track quest progress for contract delivery: {}", e);
        }
    }
    
    Ok(())
}

/// Deliver items to fulfill a contract, depositing rewards to matronage pool instead of player
/// This is the alternative to deliver_alk_contract that routes shards to the matronage pool
#[spacetimedb::reducer]
pub fn deliver_alk_contract_to_matronage(
    ctx: &ReducerContext, 
    player_contract_id: u64,
    station_id: u32,
) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Verify player is in a matronage first
    use crate::matronage::matronage_member as MatronageMemberTableTrait;
    let _member = ctx.db.matronage_member().player_id().find(&player_id)
        .ok_or("You must be in a matronage to assign rewards to the pool")?;
    
    // Get player
    let player = ctx.db.player().identity().find(&player_id)
        .ok_or("Player not found")?;
    
    // Get station and validate player is in range
    let stations_table = ctx.db.alk_station();
    let station = stations_table.station_id().find(&station_id)
        .ok_or("Station not found")?;
    
    if !station.is_active {
        return Err("Station is not operational".to_string());
    }
    
    // Check player is in range
    let dx = player.position_x - station.world_pos_x;
    let dy = player.position_y - station.world_pos_y;
    let distance_sq = dx * dx + dy * dy;
    let interaction_radius_sq = station.interaction_radius * station.interaction_radius;
    
    if distance_sq > interaction_radius_sq {
        return Err("You must be at the station to deliver".to_string());
    }
    
    // Get player contract
    let player_contracts_table = ctx.db.alk_player_contract();
    let mut player_contract = player_contracts_table.id().find(&player_contract_id)
        .ok_or("Player contract not found")?;
    
    if player_contract.player_id != player_id {
        return Err("You can only deliver your own contracts".to_string());
    }
    
    if player_contract.status != AlkContractStatus::Active {
        return Err("Contract is not active".to_string());
    }
    
    // Get contract template
    let contracts_table = ctx.db.alk_contract();
    let contract = contracts_table.contract_id().find(&player_contract.contract_id)
        .ok_or("Contract template not found")?;
    
    // Validate station is allowed for this contract
    let station_allowed = match contract.allowed_stations {
        AlkStationAllowance::CompoundOnly => station_id == 0,
        AlkStationAllowance::SubstationsOnly => station_id > 0,
        AlkStationAllowance::AllStations => true,
    };
    
    if !station_allowed {
        return Err(format!("This contract cannot be delivered at {}", station.name));
    }
    
    // Check player has the required items
    let items_table = ctx.db.inventory_item();
    let remaining_to_deliver = player_contract.target_quantity - player_contract.delivered_quantity;
    
    // Find matching items in player inventory
    let player_items: Vec<_> = items_table.iter()
        .filter(|item| {
            item.item_def_id == contract.item_def_id &&
            (matches!(&item.location, ItemLocation::Inventory(loc) if loc.owner_id == player_id) ||
            matches!(&item.location, ItemLocation::Hotbar(loc) if loc.owner_id == player_id))
        })
        .collect();
    
    let total_available: u32 = player_items.iter().map(|i| i.quantity).sum();
    
    if total_available < contract.bundle_size {
        return Err(format!("You need at least {} {} to deliver (have {})", 
                          contract.bundle_size, contract.item_name, total_available));
    }
    
    // Calculate how much to deliver (up to remaining target, limited by inventory)
    let to_deliver = remaining_to_deliver.min(total_available);
    let bundles_delivered = to_deliver / contract.bundle_size;
    let items_consumed = bundles_delivered * contract.bundle_size;
    
    if bundles_delivered == 0 {
        return Err("Not enough items for even one bundle".to_string());
    }
    
    // Consume items from inventory
    let mut items_to_consume = items_consumed;
    for item in player_items {
        if items_to_consume == 0 { break; }
        
        let consume_from_stack = item.quantity.min(items_to_consume);
        items_to_consume -= consume_from_stack;
        
        if consume_from_stack >= item.quantity {
            // Delete entire stack
            items_table.instance_id().delete(item.instance_id);
        } else {
            // Reduce stack
            let mut updated_item = item.clone();
            updated_item.quantity -= consume_from_stack;
            items_table.instance_id().update(updated_item);
        }
    }
    
    // Calculate reward
    let gross_reward = bundles_delivered * contract.shard_reward_per_bundle;
    let fee = (gross_reward as f32 * station.delivery_fee_rate) as u32;
    let net_reward = gross_reward.saturating_sub(fee);
    
    // Deposit to matronage pool instead of giving directly to player
    match crate::matronage::deposit_to_matronage_pool(ctx, &player_id, net_reward as u64) {
        Ok(_) => {
            log::info!("💰 Deposited {} shards to matronage pool for player {:?}", net_reward, player_id);
        }
        Err(e) => {
            log::error!("Failed to deposit to matronage pool: {}", e);
            return Err(format!("Failed to deposit to matronage pool: {}", e));
        }
    }
    
    // Update player contract
    player_contract.delivered_quantity += items_consumed;
    if player_contract.delivered_quantity >= player_contract.target_quantity {
        player_contract.status = AlkContractStatus::Completed;
        player_contract.completed_at = Some(ctx.timestamp);
    }
    player_contracts_table.id().update(player_contract.clone());
    
    log::info!("📦🏛️ Player {:?} delivered {} {} ({} bundles) at {} -> MATRONAGE POOL (+{} shards, fee: {})",
              player_id, items_consumed, contract.item_name, bundles_delivered, 
              station.name, net_reward, fee);
    
    if player_contract.status == AlkContractStatus::Completed {
        log::info!("✅ Contract {} completed!", player_contract_id);
    }
    
    Ok(())
}

/// Get player's shard balance
#[spacetimedb::reducer]
pub fn get_shard_balance(ctx: &ReducerContext) -> Result<(), String> {
    // Clients subscribe to the table - this just ensures a record exists
    let player_id = ctx.sender;
    let balance_table = ctx.db.player_shard_balance();
    
    if balance_table.player_id().find(&player_id).is_none() {
        let balance = PlayerShardBalance {
            player_id,
            balance: 0,
            total_earned: 0,
            total_spent: 0,
            last_transaction: ctx.timestamp,
        };
        let _ = balance_table.try_insert(balance);
    }
    
    Ok(())
}

/// Check if player is near any ALK station (for UI purposes)
#[spacetimedb::reducer]
pub fn check_alk_station_proximity(ctx: &ReducerContext) -> Result<(), String> {
    let player_id = ctx.sender;
    
    let player = ctx.db.player().identity().find(&player_id)
        .ok_or("Player not found")?;
    
    let stations_table = ctx.db.alk_station();
    
    for station in stations_table.iter() {
        if !station.is_active { continue; }
        
        let dx = player.position_x - station.world_pos_x;
        let dy = player.position_y - station.world_pos_y;
        let distance_sq = dx * dx + dy * dy;
        let radius_sq = station.interaction_radius * station.interaction_radius;
        
        if distance_sq <= radius_sq {
            log::debug!("Player {:?} is near station {}", player_id, station.name);
            // Client will receive this info through subscription
            return Ok(());
        }
    }
    
    Ok(())
}

// ============================================================================
// DEBUG REDUCERS
// ============================================================================

/// Debug: Force refresh all contracts
#[spacetimedb::reducer]
pub fn debug_refresh_alk_contracts(ctx: &ReducerContext) -> Result<(), String> {
    log::info!("🔄 Debug: Forcing ALK contract refresh...");
    
    let world_state = ctx.db.world_state().iter().next();
    let (world_day, season_index) = match world_state {
        Some(ws) => (ws.day_of_year + (ws.year - 1) * 960, (ws.day_of_year - 1) / DAYS_PER_SEASON),
        None => (1, 0),
    };
    
    // Clear existing contracts
    let contracts_table = ctx.db.alk_contract();
    let contract_ids: Vec<u64> = contracts_table.iter().map(|c| c.contract_id).collect();
    for id in contract_ids {
        contracts_table.contract_id().delete(id);
    }
    
    // Regenerate all contracts
    // Base materials (always available)
    generate_materials_contracts(ctx, world_day)?;
    
    // Seasonal categories (random subset per season)
    generate_seasonal_arms_contracts(ctx, world_day, season_index)?;
    generate_seasonal_armor_contracts(ctx, world_day, season_index)?;
    generate_seasonal_tools_contracts(ctx, world_day, season_index)?;
    generate_seasonal_provisions_contracts(ctx, world_day, season_index)?;
    
    // Seasonal harvest (plant-based, actual seasonality)
    generate_seasonal_harvest_contracts(ctx, world_day, season_index)?;
    
    // Bonus contracts (furs, rare drops, premium items)
    generate_bonus_contracts(ctx, world_day, season_index)?;
    
    log::info!("✅ Debug: ALK contracts refreshed");
    Ok(())
}

/// Debug: Grant shards to player
#[spacetimedb::reducer]
pub fn debug_grant_shards(ctx: &ReducerContext, amount: u64) -> Result<(), String> {
    let player_id = ctx.sender;
    let balance_table = ctx.db.player_shard_balance();
    
    let mut balance = balance_table.player_id().find(&player_id)
        .unwrap_or(PlayerShardBalance {
            player_id,
            balance: 0,
            total_earned: 0,
            total_spent: 0,
            last_transaction: ctx.timestamp,
        });
    
    balance.balance += amount;
    balance.total_earned += amount;
    balance.last_transaction = ctx.timestamp;
    
    if balance_table.player_id().find(&player_id).is_some() {
        balance_table.player_id().update(balance);
    } else {
        let _ = balance_table.try_insert(balance);
    }
    
    log::info!("💎 Debug: Granted {} shards to player {:?}", amount, player_id);
    Ok(())
}

