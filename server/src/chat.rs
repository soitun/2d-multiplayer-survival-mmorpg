// server/src/chat.rs
//
// Module for managing chat functionality including messages and related
// operations in the multiplayer game.

use spacetimedb::{ReducerContext, Identity, Timestamp, Table};
use log;
// Import necessary table traits and structs
use crate::PlayerKillCommandCooldown;
use crate::player_kill_command_cooldown as PlayerKillCommandCooldownTableTrait;
use crate::player as PlayerTableTrait;
use crate::player_corpse; // To call create_player_corpse
use crate::active_equipment; // To call clear_active_item_reducer
use crate::PrivateMessage; // Struct for private messages
use crate::private_message as PrivateMessageTableTrait; // Trait for private messages
use crate::death_marker; // <<< ADDED for DeathMarker
use crate::death_marker::death_marker as DeathMarkerTableTrait; // <<< ADDED DeathMarker table trait
// Import matronage table traits for team chat
use crate::matronage::matronage_member as MatronageMemberTableTrait;
use crate::chat::team_message as TeamMessageTableTrait;
// Import player progression table traits
use crate::player_progression::player_stats as PlayerStatsTableTrait;

// --- Configuration Constants ---
/// Set to false to disable kill command cooldown (useful for testing)
/// Set to true to enable normal cooldown behavior
const ENABLE_KILL_COMMAND_COOLDOWN: bool = false;

// --- Table Definitions ---

#[spacetimedb::table(name = message, public)]
#[derive(Clone, Debug)]
pub struct Message {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub sender: Identity,
    pub sender_username: String, // Plain username (no title prefix)
    pub sender_title: Option<String>, // Active title from achievements (e.g., "Master Angler")
    pub text: String,
    pub sent: Timestamp, // Timestamp for sorting
}

/// Tracks the last player who whispered to each player, enabling /r (reply) command
#[spacetimedb::table(name = last_whisper_from, public)]
#[derive(Clone, Debug)]
pub struct LastWhisperFrom {
    #[primary_key]
    pub player_id: Identity,
    pub last_whisper_from_player_id: Identity,
    pub last_whisper_from_username: String,
    pub last_whisper_timestamp: Timestamp,
}

/// Team (Matronage) chat messages - visible only to matronage members
#[spacetimedb::table(
    name = team_message, 
    public,
    index(name = idx_team_message_matronage, btree(columns = [matronage_id]))
)]
#[derive(Clone, Debug)]
pub struct TeamMessage {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    /// The matronage this message belongs to
    pub matronage_id: u64,
    /// The sender's identity
    pub sender: Identity,
    /// The sender's username (plain, no title prefix)
    pub sender_username: String,
    /// The sender's active title from achievements (e.g., "Master Angler")
    pub sender_title: Option<String>,
    /// The message text
    pub text: String,
    /// When the message was sent
    pub sent: Timestamp,
}

// --- Reducers ---

/// Sends a chat message that will be visible to all players
#[spacetimedb::reducer]
pub fn send_message(ctx: &ReducerContext, text: String) -> Result<(), String> {
    if text.is_empty() {
        return Err("Message cannot be empty.".to_string());
    }
    if text.len() > 100 { // Match client-side max length
        return Err("Message too long (max 100 characters).".to_string());
    }

    let sender_id = ctx.sender;
    let current_time = ctx.timestamp;

    // --- Command Handling ---
    if text.starts_with("/") {
        let parts: Vec<&str> = text.split_whitespace().collect();
        let command = parts.get(0).unwrap_or(&"").to_lowercase();

        match command.as_str() {
            "/kill" | "/respawn" => { // Added /respawn alias
                log::info!("[Command] Player {:?} used {} command.", sender_id, command);
                let cooldown_table = ctx.db.player_kill_command_cooldown();
                
                // Only check cooldown if ENABLE_KILL_COMMAND_COOLDOWN is true
                if ENABLE_KILL_COMMAND_COOLDOWN {
                    if let Some(cooldown_record) = cooldown_table.player_id().find(&sender_id) {
                        let micros_elapsed: u64 = (current_time.to_micros_since_unix_epoch().saturating_sub(cooldown_record.last_kill_command_at.to_micros_since_unix_epoch())).try_into().unwrap();
                        let elapsed_seconds: u64 = micros_elapsed / 1_000_000u64;
                        
                        if elapsed_seconds < crate::KILL_COMMAND_COOLDOWN_SECONDS {
                            let remaining_cooldown = crate::KILL_COMMAND_COOLDOWN_SECONDS - elapsed_seconds;
                            let private_feedback = PrivateMessage {
                                id: 0, // Auto-incremented
                                recipient_identity: sender_id,
                                sender_display_name: "SYSTEM".to_string(),
                                text: format!("You can use {} again in {} seconds.", command, remaining_cooldown),
                                sent: current_time,
                            };
                            ctx.db.private_message().insert(private_feedback);
                            log::info!("Sent private cooldown message to {:?} for command {}. Remaining: {}s", sender_id, command, remaining_cooldown);
                            return Ok(()); // Command processed by sending private feedback
                        }
                    }
                }

                // Proceed with kill
                let mut players = ctx.db.player();
                if let Some(mut player) = players.identity().find(&sender_id) {
                    if player.is_dead {
                        return Err("You are already dead.".to_string());
                    }
                    // RE-FETCH the player record to get the latest position data before updating
                    if let Some(mut current_player) = players.identity().find(&sender_id) {
                        // Only update death-related fields, preserve position and other fields
                        current_player.health = 0.0;
                        current_player.is_dead = true;
                        current_player.death_timestamp = Some(current_time);
                        current_player.last_update = current_time;
                        
                        players.identity().update(current_player);
                    } else {
                        return Err("Player not found during death update.".to_string());
                    }

                    // Drop active weapon on death (before clearing equipment and creating corpse)
                    match crate::dropped_item::drop_active_weapon_on_death(ctx, sender_id, player.position_x, player.position_y) {
                        Ok(Some(item_name)) => log::info!("[PlayerDeath] Dropped active weapon '{}' for player {:?} using {} command", item_name, sender_id, command),
                        Ok(None) => log::debug!("[PlayerDeath] No active weapon to drop for player {:?}", sender_id),
                        Err(e) => log::error!("[PlayerDeath] Failed to drop active weapon for player {:?}: {}", sender_id, e),
                    }

                    // Clear active item reference
                    if let Err(e) = active_equipment::clear_active_item_reducer(ctx, sender_id) {
                        log::error!("Failed to clear active item for player {:?} after {}: {}", sender_id, command, e);
                    }

                    // Clear all active effects on death (bleed, venom, burns, healing, etc.)
                    crate::active_effects::clear_all_effects_on_death(ctx, sender_id);
                    log::info!("[PlayerDeath] Cleared all active effects for player {:?} using {} command", sender_id, command);

                    // Create corpse
                    if let Err(e) = player_corpse::create_player_corpse(ctx, sender_id, player.position_x, player.position_y, &player.username) {
                        log::error!("Failed to create corpse for player {:?} after {}: {}", sender_id, command, e);
                    }
                    
                    // --- Create/Update DeathMarker for /kill command ---
                    let death_marker_pos_x = player.position_x;
                    let death_marker_pos_y = player.position_y;
                    let new_death_marker = death_marker::DeathMarker {
                        player_id: sender_id,
                        pos_x: death_marker_pos_x,
                        pos_y: death_marker_pos_y,
                        death_timestamp: current_time, // Use current_time from the command context
                        killed_by: None, // Self-inflicted death via command
                        death_cause: "Suicide".to_string(), // Death via /kill or /respawn command is suicide
                    };
                    let death_marker_table = ctx.db.death_marker();
                    if death_marker_table.player_id().find(&sender_id).is_some() {
                        death_marker_table.player_id().update(new_death_marker);
                        log::info!("[DeathMarker] Updating death marker for player {:?} via {} command.", sender_id, command);
                    } else {
                        death_marker_table.insert(new_death_marker);
                        log::info!("[DeathMarker] Inserting new death marker for player {:?} via {} command.", sender_id, command);
                    }
                    // --- End DeathMarker ---

                    // Update cooldown record even when cooldown is disabled (for consistency)
                    let new_cooldown_record = crate::PlayerKillCommandCooldown {
                        player_id: sender_id,
                        last_kill_command_at: current_time,
                    };
                    if cooldown_table.player_id().find(&sender_id).is_some() {
                        cooldown_table.player_id().update(new_cooldown_record);
                    } else {
                        cooldown_table.insert(new_cooldown_record);
                    }

                    log::info!("Player {:?} successfully used {}. Cooldown enabled: {}", sender_id, command, ENABLE_KILL_COMMAND_COOLDOWN);
                    return Ok(()); // Command processed, don't send message to chat
                } else {
                    return Err(format!("Player not found for {} command.", command));
                }
            }
            "/players" => {
                log::info!("[Command] Player {:?} used /players command.", sender_id);
                let online_players_count = ctx.db.player().iter().filter(|p| p.is_online && !p.is_dead).count();
                
                let system_message_text = format!("Players Online: {}", online_players_count);
                let system_message = Message {
                    id: 0, // Auto-incremented
                    sender: ctx.identity(), // Module identity as sender for system messages
                    sender_username: "SYSTEM".to_string(),
                    sender_title: None, // System messages don't have titles
                    text: system_message_text,
                    sent: current_time,
                };
                ctx.db.message().insert(system_message);
                log::info!("System message sent: Players Online: {}", online_players_count);
                return Ok(()); // Command processed, don't send original message to chat
            }
            "/who" => {
                log::info!("[Command] Player {:?} used /who command.", sender_id);
                
                // Get all online players
                let online_players: Vec<String> = ctx.db.player()
                    .iter()
                    .filter(|p| p.is_online && !p.is_dead)
                    .map(|p| p.username.clone())
                    .collect();
                
                let count = online_players.len();
                let player_list = if count > 0 {
                    online_players.join(", ")
                } else {
                    "None".to_string()
                };
                
                let system_message_text = format!("Players Online ({}): {}", count, player_list);
                let system_message = Message {
                    id: 0,
                    sender: ctx.identity(), // Module identity as sender
                    sender_username: "SYSTEM".to_string(),
                    sender_title: None, // System messages don't have titles
                    text: system_message_text,
                    sent: current_time,
                };
                ctx.db.message().insert(system_message);
                log::info!("System message sent: Players Online ({})", count);
                return Ok(());
            }
            "/w" | "/whisper" => {
                if parts.len() < 3 {
                    return Err("Usage: /w <playername> <message>".to_string());
                }
                
                let target_name = parts[1];
                let message_text = parts[2..].join(" ");
                
                if message_text.is_empty() {
                    return Err("Whisper message cannot be empty.".to_string());
                }
                
                if message_text.len() > 200 {
                    return Err("Whisper message too long (max 200 characters).".to_string());
                }
                
                // Find target player (case-insensitive, partial match)
                let target_player = ctx.db.player()
                    .iter()
                    .filter(|p| p.is_online && !p.is_dead)
                    .find(|p| p.username.to_lowercase().starts_with(&target_name.to_lowercase()));
                
                match target_player {
                    Some(target) => {
                        // Get sender username
                        let sender_username = ctx.db.player()
                            .identity()
                            .find(&sender_id)
                            .map(|p| p.username.clone())
                            .unwrap_or_else(|| format!("{:?}", sender_id));
                        
                        // Send whisper to target (just their name, pink styling handled client-side)
                        let whisper = PrivateMessage {
                            id: 0,
                            recipient_identity: target.identity,
                            sender_display_name: sender_username.clone(),
                            text: message_text.clone(),
                            sent: current_time,
                        };
                        ctx.db.private_message().insert(whisper);
                        
                        // Update target's LastWhisperFrom for /r command
                        let last_whisper_record = LastWhisperFrom {
                            player_id: target.identity,
                            last_whisper_from_player_id: sender_id,
                            last_whisper_from_username: sender_username.clone(),
                            last_whisper_timestamp: current_time,
                        };
                        
                        let lwf_table = ctx.db.last_whisper_from();
                        if lwf_table.player_id().find(&target.identity).is_some() {
                            lwf_table.player_id().update(last_whisper_record);
                        } else {
                            lwf_table.insert(last_whisper_record);
                        }
                        
                        log::info!("Whisper from {:?} ({}) to {:?} ({}): {}", 
                            sender_id, sender_username, target.identity, target.username, message_text);
                        return Ok(());
                    }
                    None => {
                        return Err(format!("Player '{}' not found or offline.", target_name));
                    }
                }
            }
            "/r" | "/reply" => {
                if parts.len() < 2 {
                    return Err("Usage: /r <message>".to_string());
                }
                
                let message_text = parts[1..].join(" ");
                
                if message_text.is_empty() {
                    return Err("Reply message cannot be empty.".to_string());
                }
                
                if message_text.len() > 200 {
                    return Err("Reply message too long (max 200 characters).".to_string());
                }
                
                // Find last whisper sender
                let lwf_table = ctx.db.last_whisper_from();
                match lwf_table.player_id().find(&sender_id) {
                    Some(last_whisper) => {
                        // Check if target is still online
                        let target_player = ctx.db.player()
                            .identity()
                            .find(&last_whisper.last_whisper_from_player_id);
                        
                        match target_player {
                            Some(target) if target.is_online && !target.is_dead => {
                                // Get sender username
                                let sender_username = ctx.db.player()
                                    .identity()
                                    .find(&sender_id)
                                    .map(|p| p.username.clone())
                                    .unwrap_or_else(|| format!("{:?}", sender_id));
                                
                                // Send whisper
                                let whisper = PrivateMessage {
                                    id: 0,
                                    recipient_identity: target.identity,
                                    sender_display_name: sender_username.clone(),
                                    text: message_text.clone(),
                                    sent: current_time,
                                };
                                ctx.db.private_message().insert(whisper);
                                
                                // Update their LastWhisperFrom
                                let new_lwf = LastWhisperFrom {
                                    player_id: target.identity,
                                    last_whisper_from_player_id: sender_id,
                                    last_whisper_from_username: sender_username.clone(),
                                    last_whisper_timestamp: current_time,
                                };
                                
                                if lwf_table.player_id().find(&target.identity).is_some() {
                                    lwf_table.player_id().update(new_lwf);
                                } else {
                                    lwf_table.insert(new_lwf);
                                }
                                
                                log::info!("Reply from {:?} ({}) to {:?} ({}): {}", 
                                    sender_id, sender_username, target.identity, target.username, message_text);
                                return Ok(());
                            }
                            _ => {
                                return Err(format!("Player '{}' is no longer online.", last_whisper.last_whisper_from_username));
                            }
                        }
                    }
                    None => {
                        return Err("No one has whispered you yet. Use /w <player> <message> first.".to_string());
                    }
                }
            }
            "/t" | "/team" => {
                // Team (Matronage) chat - send message to all matronage members
                if parts.len() < 2 {
                    return Err("Usage: /t <message>".to_string());
                }
                
                let message_text = parts[1..].join(" ");
                
                if message_text.is_empty() {
                    return Err("Team message cannot be empty.".to_string());
                }
                
                if message_text.len() > 200 {
                    return Err("Team message too long (max 200 characters).".to_string());
                }
                
                // Check if sender is in a matronage
                let member = ctx.db.matronage_member().player_id().find(&sender_id);
                match member {
                    Some(membership) => {
                        // Get sender username (plain, no title)
                        let sender_username = ctx.db.player()
                            .identity()
                            .find(&sender_id)
                            .map(|p| p.username.clone())
                            .unwrap_or_else(|| format!("{:?}", sender_id));
                        
                        // Get active title from player stats (separate field)
                        let sender_title = ctx.db.player_stats()
                            .player_id()
                            .find(&sender_id)
                            .and_then(|stats| stats.active_title_id.clone());
                        
                        // Create team message
                        let team_msg = TeamMessage {
                            id: 0, // Auto-incremented
                            matronage_id: membership.matronage_id,
                            sender: sender_id,
                            sender_username: sender_username.clone(), // Clone for struct, keep original for logging
                            sender_title,
                            text: message_text.clone(),
                            sent: current_time,
                        };
                        
                        ctx.db.team_message().insert(team_msg);
                        
                        log::info!("[TeamChat] {} ({:?}) in matronage {} sent: {}", 
                            sender_username, sender_id, membership.matronage_id, message_text);
                        return Ok(());
                    }
                    None => {
                        return Err("You are not in a matronage. Join or create one first.".to_string());
                    }
                }
            }
            _ => {
                return Err(format!("Unknown command: {}", command));
            }
        }
    }
    // --- End Command Handling ---


    // Get sender username (plain, no title prefix)
    let sender_player = ctx.db.player().identity().find(&ctx.sender);
    let sender_username = sender_player.as_ref().map(|p| p.username.clone())
        .unwrap_or_else(|| format!("{:?}", ctx.sender));
    
    // Get active title from player stats (separate field)
    let sender_title = ctx.db.player_stats()
        .player_id()
        .find(&ctx.sender)
        .and_then(|stats| stats.active_title_id.clone());
    
    let new_message = Message {
        id: 0, // Auto-incremented
        sender: ctx.sender,
        sender_username,
        sender_title,
        text: text.clone(), // Clone text for logging after potential move
        sent: ctx.timestamp,
    };

    log::info!("User {} sent message: {}", ctx.sender, text); // Log the message content
    
    // Use the database context handle to insert
    ctx.db.message().insert(new_message);

    Ok(())
}

// Could add more chat-related functionality in the future:
// - Private messages
// - Chat filtering
// - Chat commands/emotes
// - Chat history management (pruning old messages)