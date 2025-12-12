/******************************************************************************
 *                                                                            *
 * Defines the cairn system - interactive monuments that provide lore        *
 * when players interact with them. Each cairn contains a unique lore entry *
 * that plays audio and displays text in SOVA chat.                          *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{SpacetimeType, Timestamp, Table, Identity, ReducerContext};
use crate::PLAYER_RADIUS;
use crate::player; // Import Player table trait for ctx.db.player()
use crate::sound_events;

// --- Cairn Constants ---

// Collision and interaction settings - reduced for better gameplay feel
pub(crate) const CAIRN_RADIUS: f32 = 30.0; // Reduced from 40.0 for smaller collision
pub(crate) const PLAYER_CAIRN_INTERACTION_DISTANCE: f32 = 80.0; // Reduced from 100.0
pub(crate) const PLAYER_CAIRN_INTERACTION_DISTANCE_SQUARED: f32 = 
    PLAYER_CAIRN_INTERACTION_DISTANCE * PLAYER_CAIRN_INTERACTION_DISTANCE;

// Spawning Parameters
pub(crate) const MIN_CAIRN_DISTANCE_PX: f32 = 800.0; // Minimum distance between cairns
pub(crate) const MIN_CAIRN_DISTANCE_SQ: f32 = MIN_CAIRN_DISTANCE_PX * MIN_CAIRN_DISTANCE_PX;
pub(crate) const MIN_CAIRN_TREE_DISTANCE_SQ: f32 = 300.0 * 300.0; // Minimum distance from trees
pub(crate) const MIN_CAIRN_STONE_DISTANCE_SQ: f32 = 100.0 * 100.0; // Minimum distance from stones
pub(crate) const MIN_CAIRN_RUNE_STONE_DISTANCE_SQ: f32 = 800.0 * 800.0; // Minimum distance from rune stones

// --- Cairn Table ---

#[spacetimedb::table(name = cairn, public)]
#[derive(Clone, Debug)]
pub struct Cairn {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    #[index(btree)]
    pub chunk_index: u32,
    pub lore_id: String,  // Matches CAIRN_LORE_TIDBITS id
}

// --- Player Discovery Tracking ---

#[spacetimedb::table(name = player_discovered_cairn, public)]
#[derive(Clone, Debug)]
pub struct PlayerDiscoveredCairn {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub player_identity: Identity,
    #[index(btree)]
    pub cairn_id: u64,
    pub discovered_at: Timestamp,
}

// --- Interaction Reducer ---

/// Player interacts with a cairn to discover its lore
#[spacetimedb::reducer]
pub fn interact_with_cairn(ctx: &ReducerContext, cairn_id: u64) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Find the cairn
    let cairn = ctx.db.cairn().id().find(&cairn_id)
        .ok_or_else(|| format!("Cairn {} not found", cairn_id))?;
    
    // Find the player
    let player = ctx.db.player().identity().find(&player_id)
        .ok_or_else(|| "Player not found".to_string())?;
    
    // Check distance
    let dx = player.position_x - cairn.pos_x;
    let dy = player.position_y - cairn.pos_y;
    let distance_sq = dx * dx + dy * dy;
    
    if distance_sq > PLAYER_CAIRN_INTERACTION_DISTANCE_SQUARED {
        return Err(format!(
            "Too far from cairn. Distance: {:.1}px, required: {:.1}px",
            distance_sq.sqrt(),
            PLAYER_CAIRN_INTERACTION_DISTANCE
        ));
    }
    
    // Check if already discovered by this player
    // Iterate through all discoveries for this player and check if any match this cairn
    let already_discovered = ctx.db.player_discovered_cairn()
        .player_identity()
        .filter(&player_id)
        .find(|discovery| discovery.cairn_id == cairn_id)
        .is_some();
    
    // If not already discovered, record the discovery
    if !already_discovered {
        ctx.db.player_discovered_cairn().insert(PlayerDiscoveredCairn {
            id: 0,
            player_identity: player_id,
            cairn_id,
            discovered_at: ctx.timestamp,
        });
        
        // Play cairn unlock sound for new discovery
        sound_events::emit_cairn_unlock_sound(ctx, cairn.pos_x, cairn.pos_y, player_id);
        
        log::info!(
            "Player {} discovered cairn {} (lore_id: {})",
            player_id,
            cairn_id,
            cairn.lore_id
        );
    }
    
    Ok(())
}
