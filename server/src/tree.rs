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
/// Default health for trees (used when tree type is unknown). Most trees use type-specific values.
pub(crate) const TREE_INITIAL_HEALTH: u32 = 800;

// Legacy constants - kept for compatibility. Prefer tree_type_stats() for type-specific values.
pub(crate) const TREE_MIN_RESOURCES: u32 = 150;
pub(crate) const TREE_MAX_RESOURCES: u32 = 500;

// NEW Respawn Time Constants for Trees
pub(crate) const MIN_TREE_RESPAWN_TIME_SECS: u64 = 600;  // 10 minutes
pub(crate) const MAX_TREE_RESPAWN_TIME_SECS: u64 = 1200; // 20 minutes

// Player-Planted Tree Constants
/// Player-planted trees yield this percentage of resources compared to wild trees
pub(crate) const PLAYER_PLANTED_YIELD_PERCENT: f32 = 0.60; // 60% of normal yield
/// Player-planted trees have this percentage of resources compared to wild trees
pub(crate) const PLAYER_PLANTED_RESOURCES_MIN: u32 = 90;  // 60% of 150
pub(crate) const PLAYER_PLANTED_RESOURCES_MAX: u32 = 300; // 60% of 500

// --- Tree Enums and Structs ---

// Define the different types of trees (names match actual sprite files)
#[derive(Clone, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, SpacetimeType)]
pub enum TreeType {
    // Deciduous trees (Birch Bark + Birch Catkin)
    SiberianBirch,      // siberian_birch_c.png - white bark birch
    SitkaAlder,         // sitka_alder_c.png - variant A for beach tiles
    SitkaAlder2,        // sitka_alder_d.png - variant B for beach tiles
    ArcticWillow,       // arctic_willow.png - short tundra shrub-tree
    
    // Conifer trees (Pine Bark + Pinecone)
    SitkaSpruce,        // sitka_spruce_c.png - classic tall spruce
    MountainHemlock,    // mountain_hemlock_c.png - variant A, less common
    MountainHemlock2,   // mountain_hemlock_d.png - variant B, more common
    DwarfPine,          // dwarf_pine.png - stunted alpine tree
    MountainHemlockSnow, // mountain_hemlock_snow.png - snow-covered alpine
    KrummholzSpruce,    // krummholz_spruce.png - twisted wind-sculpted spruce
    
    // Fruit/Nut trees (Wood + special drops) - RARE, temperate biome only
    CrabAppleTree,      // crab_apple_tree.png - small fruit tree, drops Crab Apples
    HazelnutTree,       // hazelnut_tree.png - nut-bearing shrub-tree, drops Hazelnuts
    RowanberryTree,     // rowanberry_tree.png - mountain ash tree, drops Rowan Berries
    OliveTree,          // olive_tree.png - GMO cultivar, drops Olives (plantable-only)
}

/// Per-tree-type stats: health and wood yield range.
/// Small trees (alpine, beach, shrub) give less wood; some are tougher (more health).
pub fn tree_type_stats(tree_type: &TreeType) -> (u32, u32, u32) {
    // (health, min_wood, max_wood)
    match tree_type {
        // --- SMALL: Shrubs, stunted alpine, beach trees ---
        // Less wood, often tougher (gnarled/dense) or quicker (thin) to chop
        TreeType::DwarfPine => (900, 80, 160),           // Stunted alpine - tough, little wood
        TreeType::ArcticWillow => (600, 60, 120),        // Short tundra shrub - quick chop, minimal wood
        TreeType::MountainHemlockSnow => (850, 90, 170), // Snow-covered alpine - hardy
        TreeType::KrummholzSpruce => (950, 85, 165),     // Twisted wind-sculpted - very tough, sparse wood
        TreeType::SitkaAlder => (550, 70, 140),          // Beach alder variant A - smaller coastal
        TreeType::SitkaAlder2 => (550, 70, 140),         // Beach alder variant B
        TreeType::CrabAppleTree => (500, 80, 150),       // Small fruit tree
        TreeType::HazelnutTree => (450, 50, 100),        // Nut-bearing shrub-tree - smallest
        TreeType::RowanberryTree => (550, 70, 130),      // Mountain ash - small ornamental
        TreeType::OliveTree => (620, 90, 160),           // Hardy GMO olive cultivar - compact but dense

        // --- MEDIUM: Mountain hemlock, birch ---
        TreeType::MountainHemlock => (800, 200, 350),
        TreeType::MountainHemlock2 => (800, 200, 350),
        TreeType::SiberianBirch => (750, 220, 380),     // White bark birch

        // --- LARGE: Tall conifers ---
        TreeType::SitkaSpruce => (900, 300, 500),       // Classic tall spruce - most wood
    }
}

#[spacetimedb::table(accessor = tree, public)]
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
    /// Whether this tree was planted by a player (from Pinecone/Birch Catkin).
    /// Player-planted trees: don't respawn, yield less wood (60% of normal).
    pub is_player_planted: bool,
}