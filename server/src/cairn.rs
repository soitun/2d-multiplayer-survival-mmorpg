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
use crate::dropped_item::give_item_to_player_or_drop;
use crate::items::item_definition as ItemDefinitionTableTrait;

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

// --- Rarity Reward Constants ---

// Rarity tiers for variable rewards (dopamine engagement)
pub(crate) const REWARD_COMMON: u32 = 25;      // Common categories: island, infrastructure
pub(crate) const REWARD_UNCOMMON: u32 = 50;   // Uncommon: shards, alk, survival
pub(crate) const REWARD_RARE: u32 = 100;      // Rare: aleuts, admiralty, compound
pub(crate) const REWARD_EPIC: u32 = 150;      // Epic: philosophy
pub(crate) const REWARD_LEGENDARY: u32 = 200; // Legendary: meta (SOVA/system lore)

/// Get the Memory Shard reward amount for a cairn based on its lore_id
/// Uses explicit mapping since lore_id naming isn't consistent with categories
fn get_cairn_reward_for_lore_id(lore_id: &str) -> u32 {
    match lore_id {
        // LEGENDARY (200) - meta: SOVA/system lore
        "cairn_my_adaptation" |
        "cairn_encoded_markers" |
        "cairn_shared_substrate" => REWARD_LEGENDARY,
        
        // EPIC (150) - philosophy: deep thematic content
        "cairn_unplanned_system" => REWARD_EPIC,
        
        // RARE (100) - aleuts, admiralty, compound: cultural/historical/location lore
        "cairn_aleuts_original_inhabitants" |
        "cairn_aleuts_under_alk" |
        "cairn_cultural_erosion" |
        "cairn_directorate_origins" |
        "cairn_the_freeze" |
        "cairn_compound_purpose" |
        "cairn_intake_scanner" => REWARD_RARE,
        
        // UNCOMMON (50) - shards, alk, survival: important game mechanics
        "cairn_shards_what_are_they" |
        "cairn_shard_consumption" |
        "cairn_alk_purpose" |
        "cairn_alk_blindness" |
        "cairn_ghost_network" |  // ALK category - The Ghost Network
        "cairn_survival_loop" |
        "cairn_the_trap" => REWARD_UNCOMMON,
        
        // COMMON (25) - island, infrastructure: geographic/technical info
        "cairn_volcanic_spine" |
        "cairn_coastline" |
        "cairn_weather_patterns" |
        "cairn_islands_memory" |
        "cairn_bering_sea_revenge" |
        "cairn_dropoff_stations" |
        "cairn_radio_towers" |
        "cairn_geothermal_taps" => REWARD_COMMON,
        
        // Default fallback (shouldn't happen, but safety)
        _ => {
            log::warn!("Unknown cairn lore_id: {} - using default reward", lore_id);
            REWARD_COMMON
        }
    }
}

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
    
    // If not already discovered, record the discovery and award Memory Shards
    if !already_discovered {
        ctx.db.player_discovered_cairn().insert(PlayerDiscoveredCairn {
            id: 0,
            player_identity: player_id,
            cairn_id,
            discovered_at: ctx.timestamp,
        });
        
        // Calculate reward based on cairn category
        let shard_reward = get_cairn_reward_for_lore_id(&cairn.lore_id);
        
        // Find Memory Shard item definition
        let memory_shard_def_id = ctx.db.item_definition()
            .iter()
            .find(|def| def.name == "Memory Shard")
            .map(|def| def.id);
        
        if let Some(shard_def_id) = memory_shard_def_id {
            // Award Memory Shards to player (will drop at feet if inventory full)
            match give_item_to_player_or_drop(ctx, player_id, shard_def_id, shard_reward) {
                Ok(added_to_inv) => {
                    if added_to_inv {
                        log::info!(
                            "🎉 Player {} discovered NEW cairn {} (lore_id: {}) - Awarded {} Memory Shards",
                            player_id,
                            cairn_id,
                            cairn.lore_id,
                            shard_reward
                        );
                    } else {
                        log::info!(
                            "🎉 Player {} discovered NEW cairn {} (lore_id: {}) - Dropped {} Memory Shards (inventory full)",
                            player_id,
                            cairn_id,
                            cairn.lore_id,
                            shard_reward
                        );
                    }
                }
                Err(e) => {
                    log::error!(
                        "❌ Failed to award {} Memory Shards to player {} for discovering cairn {}: {}",
                        shard_reward,
                        player_id,
                        cairn_id,
                        e
                    );
                }
            }
        } else {
            log::error!(
                "❌ Memory Shard item definition not found! Cannot reward player {} for discovering cairn {}",
                player_id,
                cairn_id
            );
        }
        // Note: cairn_unlock sound is played client-side for instant feedback
    } else {
        log::debug!(
            "Player {} re-interacted with already discovered cairn {} (lore_id: {})",
            player_id,
            cairn_id,
            cairn.lore_id
        );
    }
    
    Ok(())
}
