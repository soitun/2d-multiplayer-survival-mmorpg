use spacetimedb::{table, SpacetimeType, Identity, ReducerContext};
use crate::PLAYER_RADIUS;

// ===== SEA STACK AABB COLLISION CONSTANTS =====
// Sea stacks use AABB (Axis-Aligned Bounding Box) collision similar to cairns/runestones
// but are WIDER at the base and SCALE with the sea stack's size property
// These are BASE values for scale = 1.0, multiplied by the sea stack's actual scale

/// Base half-width of sea stack AABB (wider than cairns for chunky rock base)
pub const SEA_STACK_AABB_BASE_HALF_WIDTH: f32 = 80.0; // Full base width = 160px at scale 1.0

/// Base half-height of sea stack AABB
pub const SEA_STACK_AABB_BASE_HALF_HEIGHT: f32 = 35.0; // Full base height = 70px at scale 1.0

/// Base Y offset from pos_y to AABB center (collision positioned above anchor point)
pub const SEA_STACK_BASE_COLLISION_Y_OFFSET: f32 = 70.0; // 70px above anchor at scale 1.0 (lowered for better base positioning)

/// Base distance check for collision culling (squared) - wider than player radius + max AABB diagonal
pub const SEA_STACK_BASE_COLLISION_DISTANCE_SQ: f32 = 
    (PLAYER_RADIUS + SEA_STACK_AABB_BASE_HALF_WIDTH * 1.5) * (PLAYER_RADIUS + SEA_STACK_AABB_BASE_HALF_WIDTH * 1.5);

/// Helper to get scaled AABB dimensions for a sea stack
pub fn get_sea_stack_collision_dimensions(scale: f32) -> (f32, f32, f32) {
    let half_width = SEA_STACK_AABB_BASE_HALF_WIDTH * scale;
    let half_height = SEA_STACK_AABB_BASE_HALF_HEIGHT * scale;
    let y_offset = SEA_STACK_BASE_COLLISION_Y_OFFSET * scale;
    (half_width, half_height, y_offset)
}

#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub enum SeaStackVariant {
    Tall,
    Medium, 
    Wide,
}

#[table(accessor = sea_stack, public)]
#[derive(Clone, Debug)]
pub struct SeaStack {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    
    pub pos_x: f32,
    pub pos_y: f32,
    
    // Chunk-based spatial indexing for efficient queries
    #[index(btree)]
    pub chunk_index: u32,
    
    // Visual properties
    pub scale: f32,           // 0.8 to 1.4
    pub rotation: f32,        // 0 to 2π radians
    pub opacity: f32,         // 0.8 to 1.0
    pub variant: SeaStackVariant, // Which image to use
}

impl SeaStack {
    pub fn new(
        pos_x: f32,
        pos_y: f32,
        chunk_index: u32,
        scale: f32,
        rotation: f32,
        opacity: f32,
        variant: SeaStackVariant,
    ) -> Self {
        Self {
            id: 0, // Auto-incremented
            pos_x,
            pos_y,
            chunk_index,
            scale,
            rotation,
            opacity,
            variant,
        }
    }
}

// Helper function to determine chunk index from world position
pub fn get_chunk_index_for_position(pos_x: f32, pos_y: f32) -> u32 {
    use crate::environment::{CHUNK_SIZE_PX, WORLD_WIDTH_CHUNKS};
    
    let chunk_x = (pos_x / CHUNK_SIZE_PX).floor() as u32;
    let chunk_y = (pos_y / CHUNK_SIZE_PX).floor() as u32;
    
    // Clamp to world bounds
    let chunk_x = chunk_x.min(WORLD_WIDTH_CHUNKS - 1);
    let chunk_y = chunk_y.min(crate::environment::WORLD_HEIGHT_CHUNKS - 1); // Fixed: use height for Y coordinate
    
    chunk_y * WORLD_WIDTH_CHUNKS + chunk_x
} 