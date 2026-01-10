use spacetimedb::{Timestamp, SpacetimeType};
use rand::Rng;

// Import necessary constants
use crate::{PLAYER_RADIUS}; // Removed unused TILE_SIZE_PX

// --- Ore Type Enum ---
#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub enum OreType {
    Stone,
    Metal,
    Sulfur,
    Memory,
}

impl OreType {
    /// Returns the item name string for this ore type
    pub fn get_resource_name(&self) -> &'static str {
        match self {
            OreType::Stone => "Stone",
            OreType::Metal => "Metal Ore",
            OreType::Sulfur => "Sulfur Ore",
            OreType::Memory => "Memory Shard",
        }
    }

    /// Determines ore type based on location with weighted probabilities
    /// South = MORE STONE (beginner-friendly), North = more Metal/Sulfur (risky, rewarding)
    pub fn random_for_location(pos_x: f32, pos_y: f32, is_in_quarry: bool, rng: &mut impl Rng) -> OreType {
        Self::random_for_location_with_biome(pos_x, pos_y, is_in_quarry, false, false, rng)
    }
    
    /// Determines ore type based on location with biome-specific adjustments
    /// Alpine/Tundra = Higher Metal probability (exposed rock faces, permafrost)
    pub fn random_for_location_with_biome(pos_x: f32, pos_y: f32, is_in_quarry: bool, is_alpine: bool, is_tundra: bool, rng: &mut impl Rng) -> OreType {
        let center_y = crate::WORLD_HEIGHT_PX / 2.0;
        let is_north = pos_y < center_y;
        
        // Memory ore check (12% chance everywhere) - BOOSTED for early progression
        // Memory shards are critical for tech tree - make them more accessible
        let memory_roll = rng.gen::<f32>();
        if memory_roll < 0.12 {
            return OreType::Memory;
        }
        
        if is_in_quarry {
            // Generic quarries (not typed): 45% Metal, 35% Sulfur, 17% Stone (after Memory check)
            // Use random_for_quarry_type for typed quarries instead
            let roll = rng.gen::<f32>();
            if roll < 0.45 {
                OreType::Metal
            } else if roll < 0.80 {
                OreType::Sulfur
            } else {
                OreType::Stone
            }
        } else if is_alpine {
            // Alpine biome: 50% Metal, 25% Sulfur, 22% Stone (after Memory check)
            // Exposed rock faces = more Metal ore
            let roll = rng.gen::<f32>();
            if roll < 0.50 {
                OreType::Metal
            } else if roll < 0.75 {
                OreType::Sulfur
            } else {
                OreType::Stone
            }
        } else if is_tundra {
            // Tundra biome: 40% Metal, 25% Sulfur, 32% Stone (after Memory check)
            // Permafrost exposure = moderate Metal ore
            let roll = rng.gen::<f32>();
            if roll < 0.40 {
                OreType::Metal
            } else if roll < 0.65 {
                OreType::Sulfur
            } else {
                OreType::Stone
            }
        } else if is_north {
            // North terrain (temperate): 35% Metal, 30% Sulfur, 32% Stone (after Memory check)
            // Risky north with more advanced ores
            let roll = rng.gen::<f32>();
            if roll < 0.35 {
                OreType::Metal
            } else if roll < 0.65 {
                OreType::Sulfur
            } else {
                OreType::Stone
            }
        } else {
            // South terrain (temperate): 82% Stone, 12% Metal, 3% Sulfur (after Memory check)
            // MUCH MORE STONE in south - beginner-friendly, abundant basic resources
            let roll = rng.gen::<f32>();
            if roll < 0.82 {
                OreType::Stone
            } else if roll < 0.94 {
                OreType::Metal
            } else {
                OreType::Sulfur
            }
        }
    }
    
    /// Determines ore type for a TYPED large quarry
    /// Each quarry type heavily favors its designated ore:
    /// - Stone Quarry: 75% Stone, 12% Metal, 10% Sulfur (after Memory check)
    /// - Sulfur Quarry: 75% Sulfur, 12% Metal, 10% Stone (after Memory check)
    /// - Metal Quarry: 75% Metal, 12% Sulfur, 10% Stone (after Memory check)
    pub fn random_for_quarry_type(quarry_type: &crate::LargeQuarryType, rng: &mut impl Rng) -> OreType {
        // Memory ore check (3% chance in typed quarries) - lower than normal since these are specialized
        let memory_roll = rng.gen::<f32>();
        if memory_roll < 0.03 {
            return OreType::Memory;
        }
        
        let roll = rng.gen::<f32>();
        match quarry_type {
            crate::LargeQuarryType::Stone => {
                // Stone Quarry: 75% Stone, 12% Metal, 10% Sulfur
                if roll < 0.75 {
                    OreType::Stone
                } else if roll < 0.87 {
                    OreType::Metal
                } else {
                    OreType::Sulfur
                }
            }
            crate::LargeQuarryType::Sulfur => {
                // Sulfur Quarry: 75% Sulfur, 12% Metal, 10% Stone
                if roll < 0.75 {
                    OreType::Sulfur
                } else if roll < 0.87 {
                    OreType::Metal
                } else {
                    OreType::Stone
                }
            }
            crate::LargeQuarryType::Metal => {
                // Metal Quarry: 75% Metal, 12% Sulfur, 10% Stone
                if roll < 0.75 {
                    OreType::Metal
                } else if roll < 0.87 {
                    OreType::Sulfur
                } else {
                    OreType::Stone
                }
            }
        }
    }
}

// --- Stone-Specific Constants ---
pub(crate) const STONE_RADIUS: f32 = 40.0;
pub(crate) const PLAYER_STONE_COLLISION_DISTANCE_SQUARED: f32 = (PLAYER_RADIUS + STONE_RADIUS) * (PLAYER_RADIUS + STONE_RADIUS);
pub(crate) const STONE_COLLISION_Y_OFFSET: f32 = 50.0;
pub(crate) const STONE_DENSITY_PERCENT: f32 = 0.000278; // ~100 stones on 600x600 map (3x previous)
pub(crate) const MIN_STONE_DISTANCE_PX: f32 = 150.0;
pub(crate) const MIN_STONE_DISTANCE_SQ: f32 = MIN_STONE_DISTANCE_PX * MIN_STONE_DISTANCE_PX;
pub(crate) const MIN_STONE_TREE_DISTANCE_PX: f32 = 100.0;
pub(crate) const MIN_STONE_TREE_DISTANCE_SQ: f32 = MIN_STONE_TREE_DISTANCE_PX * MIN_STONE_TREE_DISTANCE_PX;
pub(crate) const STONE_INITIAL_HEALTH: u32 = 400; // Reduced from 1000 - faster mining

// NEW: Resource depletion system - each stone has a random amount of resources
// Stone ore: Basic building material (upgrade from wood)
pub(crate) const STONE_MIN_RESOURCES: u32 = 200; // Minimum stone ore per stone node (reduced from 500)
pub(crate) const STONE_MAX_RESOURCES: u32 = 400; // Maximum stone ore per stone node (reduced from 1000)

// Metal ore: Rarer material for metal construction and bullets (~50% of stone yield)
pub(crate) const METAL_ORE_MIN_RESOURCES: u32 = 100; // Minimum metal ore per metal node (reduced from 250)
pub(crate) const METAL_ORE_MAX_RESOURCES: u32 = 200; // Maximum metal ore per metal node (reduced from 500)

// Sulfur ore: Rarer material for bullets and other uses (~50% of stone yield)
pub(crate) const SULFUR_ORE_MIN_RESOURCES: u32 = 100; // Minimum sulfur ore per sulfur node (reduced from 250)
pub(crate) const SULFUR_ORE_MAX_RESOURCES: u32 = 200; // Maximum sulfur ore per sulfur node (reduced from 500)

// Memory shard resource constants - for tech tree upgrades
// Players need ~15-30 shards for first unlock, one memory node should enable that
pub(crate) const MEMORY_SHARD_MIN_RESOURCES: u32 = 50; // Minimum memory shards per memory node (reduced from 80)
pub(crate) const MEMORY_SHARD_MAX_RESOURCES: u32 = 100; // Maximum memory shards per memory node (reduced from 150)

// NEW Respawn Time Constants for Stones (adjusted for balanced survival gameplay)
pub(crate) const MIN_STONE_RESPAWN_TIME_SECS: u64 = 240; // 4 minutes
pub(crate) const MAX_STONE_RESPAWN_TIME_SECS: u64 = 480; // 8 minutes

// --- Stone Struct and Table ---
#[spacetimedb::table(name = stone, public)]
#[derive(Clone)]
pub struct Stone {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    pub health: u32, // Stones just disappear when health is 0
    pub resource_remaining: u32, // NEW: How much stone ore is left to collect
    pub ore_type: OreType, // Type of ore this stone node contains
    #[index(btree)]
    pub chunk_index: u32, // Added for spatial filtering/queries
    pub last_hit_time: Option<Timestamp>, // Added for shake effect
    /// When this stone should respawn. Use Timestamp::UNIX_EPOCH (0) for "not respawning".
    /// This allows efficient btree index range queries: .respawn_at().filter(1..=now)
    #[index(btree)]
    pub respawn_at: Timestamp,
}
