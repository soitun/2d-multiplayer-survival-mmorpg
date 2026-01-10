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
// Import player progression table traits
use crate::player_progression::player_stats as PlayerStatsTableTrait;

// --- Cairn Constants ---

// Collision settings - 96x48 AABB collision (wider than runestones)
pub(crate) const CAIRN_AABB_HALF_WIDTH: f32 = 48.0; // Half-width for 96x48 AABB
pub(crate) const CAIRN_AABB_HALF_HEIGHT: f32 = 24.0; // Half-height for 96x48 AABB
pub(crate) const CAIRN_COLLISION_Y_OFFSET: f32 = 24.0; // Y offset for AABB center from pos_y (same as runestones)
// Maximum collision distance squared (player radius + half diagonal of AABB)
pub(crate) const PLAYER_CAIRN_COLLISION_DISTANCE_SQUARED: f32 = 
    (PLAYER_RADIUS + CAIRN_AABB_HALF_WIDTH * 1.414) * (PLAYER_RADIUS + CAIRN_AABB_HALF_WIDTH * 1.414);

// Interaction settings
pub(crate) const PLAYER_CAIRN_INTERACTION_DISTANCE: f32 = 200.0; // Matches client-side distance for larger visual
pub(crate) const PLAYER_CAIRN_INTERACTION_DISTANCE_SQUARED: f32 = 
    PLAYER_CAIRN_INTERACTION_DISTANCE * PLAYER_CAIRN_INTERACTION_DISTANCE;

// Spawning Parameters
pub(crate) const MIN_CAIRN_DISTANCE_PX: f32 = 800.0; // Minimum distance between cairns
pub(crate) const MIN_CAIRN_DISTANCE_SQ: f32 = MIN_CAIRN_DISTANCE_PX * MIN_CAIRN_DISTANCE_PX;
pub(crate) const MIN_CAIRN_TREE_DISTANCE_SQ: f32 = 300.0 * 300.0; // Minimum distance from trees
pub(crate) const MIN_CAIRN_STONE_DISTANCE_SQ: f32 = 100.0 * 100.0; // Minimum distance from stones
pub(crate) const MIN_CAIRN_RUNE_STONE_DISTANCE_SQ: f32 = 800.0 * 800.0; // Minimum distance from rune stones

// Monument avoidance distances - keep cairns away from major monuments
pub(crate) const MIN_CAIRN_ALK_STATION_DISTANCE_SQ: f32 = 600.0 * 600.0; // Keep away from ALK stations
pub(crate) const MIN_CAIRN_SHIPWRECK_DISTANCE_SQ: f32 = 500.0 * 500.0; // Keep away from shipwreck hulls
pub(crate) const MIN_CAIRN_FISHING_VILLAGE_DISTANCE_SQ: f32 = 800.0 * 800.0; // Keep away from fishing village (larger zone)

// --- Signal Classification Reward Constants ---
// Diegetic tier system based on SOVA's data classification
// Fragment = faded/partial signal, Record = clear transmission, Archive = core system data

pub(crate) const REWARD_FRAGMENT: u32 = 25;   // Fragment: Basic geographic/descriptive info
pub(crate) const REWARD_RECORD: u32 = 75;     // Record: Historical context, mechanics, culture
pub(crate) const REWARD_ARCHIVE: u32 = 150;   // Archive: Deep secrets, SOVA's nature, foundation

/// Get the Memory Shard reward amount for a cairn based on its lore_id
/// Uses SOVA's signal classification: Fragment (faded) → Record (clear) → Archive (core)
fn get_cairn_reward_for_lore_id(lore_id: &str) -> u32 {
    match lore_id {
        // ARCHIVE (150) - Core system data: SOVA's nature, foundational secrets
        "cairn_my_adaptation" |
        "cairn_encoded_markers" |
        "cairn_shared_substrate" => REWARD_ARCHIVE,
        
        // RECORD (75) - Clear transmissions: History, mechanics, culture
        "cairn_shards_what_are_they" |
        "cairn_alk_purpose" |
        "cairn_aleuts_original_inhabitants" |
        "cairn_aleuts_under_alk" |
        "cairn_directorate_origins" |
        "cairn_the_freeze" |
        "cairn_survival_loop" |
        "cairn_the_trap" => REWARD_RECORD,
        
        // FRAGMENT (25) - Partial/faded signals: Basic info, quick context
        "cairn_volcanic_spine" |
        "cairn_compound_purpose" |
        "cairn_ghost_network" => REWARD_FRAGMENT,
        
        // Default fallback (shouldn't happen, but safety)
        _ => {
            log::warn!("Unknown cairn lore_id: {} - using default reward", lore_id);
            REWARD_FRAGMENT
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
    
    log::info!("🗿 [Cairn] interact_with_cairn called: cairn_id={}, player_id={}", cairn_id, player_id);
    
    // Find the cairn
    let cairn = ctx.db.cairn().id().find(&cairn_id)
        .ok_or_else(|| {
            log::warn!("🗿 [Cairn] Cairn {} not found!", cairn_id);
            format!("Cairn {} not found", cairn_id)
        })?;
    
    log::info!("🗿 [Cairn] Found cairn: id={}, lore_id={}, pos=({}, {})", cairn.id, cairn.lore_id, cairn.pos_x, cairn.pos_y);
    
    // Find the player
    let player = ctx.db.player().identity().find(&player_id)
        .ok_or_else(|| "Player not found".to_string())?;
    
    // Check distance
    let dx = player.position_x - cairn.pos_x;
    let dy = player.position_y - cairn.pos_y;
    let distance_sq = dx * dx + dy * dy;
    
    if distance_sq > PLAYER_CAIRN_INTERACTION_DISTANCE_SQUARED {
        log::warn!("🗿 [Cairn] Player {} too far from cairn {}. Distance: {:.1}px", player_id, cairn_id, distance_sq.sqrt());
        return Err(format!(
            "Too far from cairn. Distance: {:.1}px, required: {:.1}px",
            distance_sq.sqrt(),
            PLAYER_CAIRN_INTERACTION_DISTANCE
        ));
    }
    
    // Check if already discovered by this player
    // Count all discoveries for this player first for debugging
    let player_discoveries: Vec<_> = ctx.db.player_discovered_cairn()
        .player_identity()
        .filter(&player_id)
        .collect();
    
    log::info!("🗿 [Cairn] Player {} has {} total discoveries", player_id, player_discoveries.len());
    
    let already_discovered = player_discoveries.iter()
        .any(|discovery| discovery.cairn_id == cairn_id);
    
    log::info!("🗿 [Cairn] Already discovered check for cairn {}: {}", cairn_id, already_discovered);
    
    // If not already discovered, record the discovery and award Memory Shards
    if !already_discovered {
        log::info!("🗿 [Cairn] NEW DISCOVERY! Inserting PlayerDiscoveredCairn for player {} and cairn {}", player_id, cairn_id);
        
        let inserted_discovery = ctx.db.player_discovered_cairn().insert(PlayerDiscoveredCairn {
            id: 0,
            player_identity: player_id,
            cairn_id,
            discovered_at: ctx.timestamp,
        });
        
        log::info!("🗿 [Cairn] Inserted discovery with id={}", inserted_discovery.id);
        
        // Calculate reward based on cairn category
        let shard_reward = get_cairn_reward_for_lore_id(&cairn.lore_id);
        log::info!("🗿 [Cairn] Calculated shard reward: {} for lore_id: {}", shard_reward, cairn.lore_id);
        
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
        
        // Award XP and update stats for cairn discovery
        if let Err(e) = crate::player_progression::award_xp(ctx, player_id, crate::player_progression::XP_CAIRN_DISCOVERED) {
            log::error!("Failed to award XP for cairn discovery: {}", e);
        }
        
        // Track cairns_discovered stat and check achievements
        // Also update total_shards_earned
        {
            let mut stats = crate::player_progression::get_or_init_player_stats(ctx, player_id);
            stats.total_shards_earned += shard_reward as u64;
            stats.updated_at = ctx.timestamp;
            ctx.db.player_stats().player_id().update(stats.clone());
        }
        if let Err(e) = crate::player_progression::track_stat_and_check_achievements(ctx, player_id, "cairns_discovered", 1) {
            log::error!("Failed to track cairn discovery stat: {}", e);
        }
        
        // Track quest progress for cairn discovery
        if let Err(e) = crate::quests::track_quest_progress(
            ctx,
            player_id,
            crate::quests::QuestObjectiveType::DiscoverCairn,
            None,
            1,
        ) {
            log::error!("Failed to track quest progress for cairn discovery: {}", e);
        }
        
        // Note: cairn_unlock sound is played client-side for instant feedback
    } else {
        log::info!(
            "🗿 [Cairn] Re-interaction: Player {} already discovered cairn {} (lore_id: {})",
            player_id,
            cairn_id,
            cairn.lore_id
        );
    }
    
    Ok(())
}
