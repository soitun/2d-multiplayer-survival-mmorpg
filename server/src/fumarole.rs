use spacetimedb::{ReducerContext, Timestamp};
use crate::PLAYER_RADIUS;

// --- Fumarole Constants ---

// Collision constants (fumaroles have NO collision - players walk over them)
pub(crate) const FUMAROLE_RADIUS: f32 = 30.0; // Visual size reference only
pub(crate) const FUMAROLE_COLLISION_Y_OFFSET: f32 = 0.0; // No collision, but for reference

// Interaction constants (for broth pot placement)
pub(crate) const PLAYER_FUMAROLE_INTERACTION_DISTANCE: f32 = 96.0;
pub(crate) const PLAYER_FUMAROLE_INTERACTION_DISTANCE_SQUARED: f32 = 
    PLAYER_FUMAROLE_INTERACTION_DISTANCE * PLAYER_FUMAROLE_INTERACTION_DISTANCE;

// Warmth constants - fumaroles provide passive warmth protection
pub(crate) const FUMAROLE_WARMTH_RADIUS: f32 = 200.0; // 200px radius warmth protection
pub(crate) const FUMAROLE_WARMTH_RADIUS_SQUARED: f32 = FUMAROLE_WARMTH_RADIUS * FUMAROLE_WARMTH_RADIUS;

// Spawning constants
pub(crate) const FUMAROLES_PER_QUARRY_MIN: u32 = 2;
pub(crate) const FUMAROLES_PER_QUARRY_MAX: u32 = 4;
pub(crate) const MIN_FUMAROLE_DISTANCE_PX: f32 = 120.0; // Minimum distance between fumaroles
pub(crate) const MIN_FUMAROLE_DISTANCE_SQ: f32 = MIN_FUMAROLE_DISTANCE_PX * MIN_FUMAROLE_DISTANCE_PX;

/// --- Fumarole Data Structure ---
/// Represents a geothermal vent in quarry areas that provides warmth and can have broth pots attached.
/// Fumaroles are permanent decorative features with no collision - players can walk over them.
#[spacetimedb::table(name = fumarole, public)]
#[derive(Clone)]
pub struct Fumarole {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    #[index(btree)]
    pub chunk_index: u32, // For spatial filtering/queries
    pub attached_broth_pot_id: Option<u32>, // Broth pot placed on this fumarole (like campfires)
}

impl Fumarole {
    /// Creates a new fumarole at the specified position
    pub fn new(pos_x: f32, pos_y: f32, chunk_index: u32) -> Self {
        Self {
            id: 0, // Auto-incremented
            pos_x,
            pos_y,
            chunk_index,
            attached_broth_pot_id: None,
        }
    }
}

// Note: Fumarole placement/interaction reducers will be added later
// when we implement broth pot attachment system

