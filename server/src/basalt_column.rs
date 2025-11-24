use spacetimedb::SpacetimeType;
use crate::PLAYER_RADIUS;

// --- Basalt Column Constants ---

// Collision constants - basalt columns are solid obstacles
pub(crate) const BASALT_COLUMN_RADIUS: f32 = 35.0;
pub(crate) const BASALT_COLUMN_COLLISION_Y_OFFSET: f32 = 40.0; // Offset for visual sprite positioning
pub(crate) const PLAYER_BASALT_COLUMN_COLLISION_DISTANCE_SQUARED: f32 = 
    (PLAYER_RADIUS + BASALT_COLUMN_RADIUS) * (PLAYER_RADIUS + BASALT_COLUMN_RADIUS);

// Spawning constants
pub(crate) const BASALT_COLUMNS_PER_QUARRY_MIN: u32 = 5;
pub(crate) const BASALT_COLUMNS_PER_QUARRY_MAX: u32 = 10;
pub(crate) const MIN_BASALT_COLUMN_DISTANCE_PX: f32 = 100.0; // Minimum distance between columns
pub(crate) const MIN_BASALT_COLUMN_DISTANCE_SQ: f32 = MIN_BASALT_COLUMN_DISTANCE_PX * MIN_BASALT_COLUMN_DISTANCE_PX;
pub(crate) const MIN_BASALT_COLUMN_TO_FUMAROLE_DISTANCE_PX: f32 = 80.0; // Keep columns away from fumaroles
pub(crate) const MIN_BASALT_COLUMN_TO_FUMAROLE_DISTANCE_SQ: f32 = 
    MIN_BASALT_COLUMN_TO_FUMAROLE_DISTANCE_PX * MIN_BASALT_COLUMN_TO_FUMAROLE_DISTANCE_PX;

/// --- Basalt Column Type Enum ---
/// Three visual variants of basalt columns (same functionality, different graphics)
#[derive(SpacetimeType, Clone, Copy, Debug, PartialEq)]
pub enum BasaltColumnType {
    Type1,
    Type2,
    Type3,
}

impl BasaltColumnType {
    /// Returns a random basalt column type
    pub fn random(rng: &mut impl rand::Rng) -> Self {
        match rng.gen_range(0..3) {
            0 => BasaltColumnType::Type1,
            1 => BasaltColumnType::Type2,
            _ => BasaltColumnType::Type3,
        }
    }
}

/// --- Basalt Column Data Structure ---
/// Represents a decorative basalt column formation in quarry areas.
/// Basalt columns are permanent, non-mineable obstacles with collision.
#[spacetimedb::table(name = basalt_column, public)]
#[derive(Clone)]
pub struct BasaltColumn {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    #[index(btree)]
    pub chunk_index: u32, // For spatial filtering/queries
    pub column_type: BasaltColumnType, // Visual variant (Type1, Type2, or Type3)
}

impl BasaltColumn {
    /// Creates a new basalt column at the specified position
    pub fn new(pos_x: f32, pos_y: f32, chunk_index: u32, column_type: BasaltColumnType) -> Self {
        Self {
            id: 0, // Auto-incremented
            pos_x,
            pos_y,
            chunk_index,
            column_type,
        }
    }
}

