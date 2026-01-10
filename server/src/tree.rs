use spacetimedb::{SpacetimeType, Timestamp};

// Import necessary constants from the main crate or environment
use crate::{PLAYER_RADIUS}; // Removed unused TILE_SIZE_PX

// --- Tree-Specific Constants ---

// Tree Collision settings
pub(crate) const TREE_TRUNK_RADIUS: f32 = 24.0;
pub(crate) const TREE_COLLISION_Y_OFFSET: f32 = 60.0; // Increased from 40.0 to move collision hitbox up
pub(crate) const PLAYER_TREE_COLLISION_DISTANCE_SQUARED: f32 = (PLAYER_RADIUS + TREE_TRUNK_RADIUS) * (PLAYER_RADIUS + TREE_TRUNK_RADIUS);

// Tree Spawning Parameters
pub(crate) const TREE_DENSITY_PERCENT: f32 = 0.0025; // 0.25% of map tiles - ~900 trees on 600x600
pub(crate) const TREE_SPAWN_NOISE_FREQUENCY: f64 = 8.0;
pub(crate) const TREE_SPAWN_NOISE_THRESHOLD: f64 = 0.7;
pub(crate) const TREE_SPAWN_WORLD_MARGIN_TILES: u32 = 3;
pub(crate) const MAX_TREE_SEEDING_ATTEMPTS_FACTOR: u32 = 5;
pub(crate) const MIN_TREE_DISTANCE_PX: f32 = 200.0;
pub(crate) const MIN_TREE_DISTANCE_SQ: f32 = MIN_TREE_DISTANCE_PX * MIN_TREE_DISTANCE_PX;
pub(crate) const TREE_INITIAL_HEALTH: u32 = 800; // Reduced from 2000 - faster chopping

// NEW: Resource depletion system - each tree has a random amount of resources
pub(crate) const TREE_MIN_RESOURCES: u32 = 150; // Minimum wood per tree (reduced from 300)
pub(crate) const TREE_MAX_RESOURCES: u32 = 500; // Maximum wood per tree (reduced from 1000)

// NEW Respawn Time Constants for Trees
pub(crate) const MIN_TREE_RESPAWN_TIME_SECS: u64 = 600;  // 10 minutes
pub(crate) const MAX_TREE_RESPAWN_TIME_SECS: u64 = 1200; // 20 minutes

// --- Tree Enums and Structs ---

// Define the different types of trees
#[derive(Clone, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, SpacetimeType)]
pub enum TreeType {
    AleppoPine,
    MannaAsh,   // Variant A (mountain_hemlock_c) - less common
    MannaAsh2,  // Variant B (mountain_hemlock_d) - more common
    DownyOak,
    StonePine,  // Variant A for trees that spawn on beach tiles
    StonePine2, // Variant B for trees that spawn on beach tiles
    DwarfPine,  // Stunted, wind-bent tree for Alpine biome (sparse)
    MountainHemlockSnow, // Rare snow-covered hemlock for Alpine biome
    ArcticWillow, // Short, hardy shrub-tree for Tundra biome (common)
    KrummholzSpruce, // Wind-sculpted twisted spruce for Tundra biome (rare)
}

#[spacetimedb::table(name = tree, public)]
#[derive(Clone)]
pub struct Tree {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    pub health: u32,
    pub resource_remaining: u32, // NEW: How much wood is left to collect
    pub tree_type: TreeType,
    #[index(btree)]
    pub chunk_index: u32,
    pub last_hit_time: Option<Timestamp>,
    /// When this tree should respawn. Use Timestamp::UNIX_EPOCH (0) for "not respawning".
    /// This allows efficient btree index range queries: .respawn_at().filter(1..=now)
    #[index(btree)]
    pub respawn_at: Timestamp,
}