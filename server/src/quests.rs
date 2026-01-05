/******************************************************************************
 *                                                                            *
 * Quest System - Tutorial & Daily Quests                                      *
 *                                                                            *
 * Handles:                                                                   *
 * - Tutorial quests (sequential, one-time, teaches game basics)              *
 * - Daily quests (random pool, resets daily, rewards XP + shards)            *
 * - Quest progress tracking                                                  *
 * - SOVA announcements for quest events                                      *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{Identity, Timestamp, ReducerContext, Table, SpacetimeType};
use log;
use rand::Rng;

// Import table traits
use crate::quests::tutorial_quest_definition as TutorialQuestDefinitionTableTrait;
use crate::quests::daily_quest_definition as DailyQuestDefinitionTableTrait;
use crate::quests::player_tutorial_progress as PlayerTutorialProgressTableTrait;
use crate::quests::player_daily_quest as PlayerDailyQuestTableTrait;
use crate::quests::quest_completion_notification as QuestCompletionNotificationTableTrait;
use crate::quests::quest_progress_notification as QuestProgressNotificationTableTrait;
use crate::quests::sova_quest_message as SovaQuestMessageTableTrait;
use crate::player_progression::player_stats as PlayerStatsTableTrait;
use crate::player_progression::{award_xp, get_or_init_player_stats};
use crate::alk::player_shard_balance as PlayerShardBalanceTableTrait;
use crate::world_state::world_state as WorldStateTableTrait;
use crate::player as PlayerTableTrait;

// ============================================================================
// CONSTANTS
// ============================================================================

/// Number of daily quests to assign to each player
pub const DAILY_QUESTS_PER_PLAYER: usize = 5;

/// XP multiplier for daily quests (base * difficulty)
pub const DAILY_QUEST_XP_BASE: u64 = 25;

/// Shard multiplier for daily quests (base * difficulty)
pub const DAILY_QUEST_SHARD_BASE: u64 = 15;

// ============================================================================
// ENUMS
// ============================================================================

/// Quest objective types - what action completes the quest
#[derive(SpacetimeType, Clone, Debug, PartialEq, Eq)]
pub enum QuestObjectiveType {
    // Resource gathering
    GatherWood,           // Chop trees
    GatherStone,          // Mine stone
    GatherFiber,          // Pick fiber from ground
    HarvestPlant,         // Pick any harvestable plant
    HarvestSpecificPlant, // Pick a specific plant type (uses target_id)
    MineCoral,            // Mine coral underwater
    
    // Crafting
    CraftAnyItem,         // Craft any item
    CraftSpecificItem,    // Craft a specific item (uses target_id = item_def_name)
    
    // Building
    PlaceStructure,       // Place any structure
    PlaceSpecificStructure, // Place specific structure type (uses target_id)
    
    // Combat
    KillAnyAnimal,        // Kill any animal
    KillSpecificAnimal,   // Kill specific animal type (uses target_id)
    KillWithWeaponType,   // Kill with specific weapon category (uses target_id = "bow", "melee", etc.)
    
    // Fishing
    CatchAnyFish,         // Catch any fish
    CatchSpecificFish,    // Catch specific fish type (uses target_id)
    
    // Survival
    SurviveMinutes,       // Survive for X minutes
    EatFood,              // Consume food items
    DrinkWater,           // Consume drink items
    
    // Exploration
    DiscoverCairn,        // Discover a cairn
    TravelDistance,       // Travel X distance (in tiles/units)
    
    // Economy
    DeliverAlkContract,   // Complete an ALK contract
    EarnShards,           // Earn memory shards (from any source)
    
    // Farming
    PlantSeed,            // Plant any seed
    HarvestCrop,          // Harvest a planted crop
    
    // Brewing
    CompleteBrew,         // Complete any brew
    
    // Special tutorial objectives
    OpenInventory,        // Open inventory (client-side tracked)
    UseHotbar,            // Use an item from hotbar
    EquipArmor,           // Equip any armor piece
    EquipWeapon,          // Equip any weapon
    
    // Specific building placements (for tutorial)
    PlaceShelter,         // Place a shelter specifically
    PlaceCampfire,        // Place a campfire specifically
    PlaceSleepingBag,     // Place a sleeping bag specifically
    PlaceStorageBox,      // Place any storage box
    PlaceFurnace,         // Place a furnace specifically
}

/// Quest difficulty - affects rewards
#[derive(SpacetimeType, Clone, Debug, PartialEq, Eq)]
pub enum QuestDifficulty {
    Tutorial,   // No difficulty scaling (fixed rewards)
    Easy,       // 1x multiplier
    Medium,     // 1.5x multiplier
    Hard,       // 2x multiplier
    Expert,     // 3x multiplier
}

/// Quest status
#[derive(SpacetimeType, Clone, Debug, PartialEq, Eq)]
pub enum QuestStatus {
    Locked,       // Prerequisites not met (tutorial only)
    Available,    // Can be started
    InProgress,   // Currently tracking
    Completed,    // Finished, rewards claimed
    Expired,      // Daily quest expired without completion
}

// ============================================================================
// TABLES - DEFINITIONS (Seeded at init)
// ============================================================================

/// Tutorial Quest Definition - sequential quests that teach gameplay
#[spacetimedb::table(name = tutorial_quest_definition, public)]
#[derive(Clone, Debug)]
pub struct TutorialQuestDefinition {
    #[primary_key]
    pub id: String,               // e.g., "tutorial_01_gather_sticks"
    pub order_index: u32,         // Sequential order (0, 1, 2, ...)
    pub name: String,             // Display name
    pub description: String,      // What to do
    pub objective_type: QuestObjectiveType,
    pub target_id: Option<String>, // For specific item/animal/etc.
    pub target_amount: u32,       // How many to complete
    pub xp_reward: u64,
    pub shard_reward: u64,
    pub unlock_recipe: Option<String>, // Recipe ID to unlock on completion
    
    // SOVA dialogue
    pub sova_start_message: String,    // Message when quest becomes available
    pub sova_complete_message: String, // Message when quest is completed
    pub sova_hint_message: String,     // Hint if player is stuck
}

/// Daily Quest Definition - pool of possible daily quests
#[spacetimedb::table(name = daily_quest_definition, public)]
#[derive(Clone, Debug)]
pub struct DailyQuestDefinition {
    #[primary_key]
    pub id: String,               // e.g., "daily_catch_5_fish"
    pub name: String,
    pub description: String,
    pub objective_type: QuestObjectiveType,
    pub target_id: Option<String>,
    pub target_amount: u32,
    pub difficulty: QuestDifficulty,
    pub base_xp_reward: u64,      // Multiplied by difficulty
    pub base_shard_reward: u64,   // Multiplied by difficulty
}

// ============================================================================
// TABLES - PLAYER PROGRESS
// ============================================================================

/// Player Tutorial Progress - tracks tutorial quest completion
#[spacetimedb::table(
    name = player_tutorial_progress,
    public,
    index(name = idx_tutorial_player, btree(columns = [player_id]))
)]
#[derive(Clone, Debug)]
pub struct PlayerTutorialProgress {
    #[primary_key]
    pub player_id: Identity,
    pub current_quest_index: u32,      // Which tutorial quest they're on
    pub current_quest_progress: u32,   // Progress toward current quest
    pub completed_quest_ids: String,   // Comma-separated list of completed quest IDs
    pub tutorial_completed: bool,      // All tutorial quests done
    pub last_hint_shown: Option<Timestamp>, // Rate limit hints
    pub updated_at: Timestamp,
}

/// Player Daily Quest - assigned daily quests for a player
#[spacetimedb::table(
    name = player_daily_quest,
    public,
    index(name = idx_daily_player, btree(columns = [player_id])),
    index(name = idx_daily_day, btree(columns = [assigned_day]))
)]
#[derive(Clone, Debug)]
pub struct PlayerDailyQuest {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub player_id: Identity,
    pub quest_def_id: String,         // Reference to DailyQuestDefinition
    pub assigned_day: u32,            // World day when assigned
    pub current_progress: u32,        // Progress toward completion
    pub target_amount: u32,           // Copied from definition
    pub status: QuestStatus,
    pub xp_reward: u64,               // Calculated reward
    pub shard_reward: u64,            // Calculated reward
    pub completed_at: Option<Timestamp>,
}

// ============================================================================
// TABLES - NOTIFICATIONS
// ============================================================================

/// Quest Completion Notification - sent to client for celebration UI
#[spacetimedb::table(name = quest_completion_notification, public)]
#[derive(Clone, Debug)]
pub struct QuestCompletionNotification {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub player_id: Identity,
    pub quest_name: String,
    pub quest_type: String,           // "tutorial" or "daily"
    pub xp_awarded: u64,
    pub shards_awarded: u64,
    pub unlocked_recipe: Option<String>,
    pub completed_at: Timestamp,
}

/// Quest Progress Notification - milestone updates
#[spacetimedb::table(name = quest_progress_notification, public)]
#[derive(Clone, Debug)]
pub struct QuestProgressNotification {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub player_id: Identity,
    pub quest_name: String,
    pub current_progress: u32,
    pub target_amount: u32,
    pub milestone_percent: u32,       // 25, 50, 75, etc.
    pub notified_at: Timestamp,
}

/// SOVA Quest Message - special messages from SOVA about quests
/// These get routed to the SOVA chat tab on the client
#[spacetimedb::table(name = sova_quest_message, public)]
#[derive(Clone, Debug)]
pub struct SovaQuestMessage {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub player_id: Identity,
    pub message: String,
    pub message_type: String,         // "quest_start", "quest_complete", "quest_hint", "quest_unlock"
    pub audio_file: Option<String>,   // Path to SOVA voice file (e.g., "sova_tutorial_01_start.mp3")
    pub sent_at: Timestamp,
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Calculate reward multiplier based on difficulty
fn get_difficulty_multiplier(difficulty: &QuestDifficulty) -> f32 {
    match difficulty {
        QuestDifficulty::Tutorial => 1.0,
        QuestDifficulty::Easy => 1.0,
        QuestDifficulty::Medium => 1.5,
        QuestDifficulty::Hard => 2.0,
        QuestDifficulty::Expert => 3.0,
    }
}

/// Get or initialize player tutorial progress
pub fn get_or_init_tutorial_progress(ctx: &ReducerContext, player_id: Identity) -> PlayerTutorialProgress {
    let table = ctx.db.player_tutorial_progress();
    
    if let Some(progress) = table.player_id().find(&player_id) {
        return progress;
    }
    
    // Initialize new progress
    let new_progress = PlayerTutorialProgress {
        player_id,
        current_quest_index: 0,
        current_quest_progress: 0,
        completed_quest_ids: String::new(),
        tutorial_completed: false,
        last_hint_shown: None,
        updated_at: ctx.timestamp,
    };
    
    table.insert(new_progress.clone());
    log::info!("[Quests] Initialized tutorial progress for player {:?}", player_id);
    
    new_progress
}

/// Send a SOVA quest message to a player
pub fn send_sova_quest_message(
    ctx: &ReducerContext,
    player_id: Identity,
    message: &str,
    message_type: &str,
    audio_file: Option<&str>,
) {
    let msg = SovaQuestMessage {
        id: 0,
        player_id,
        message: message.to_string(),
        message_type: message_type.to_string(),
        audio_file: audio_file.map(|s| s.to_string()),
        sent_at: ctx.timestamp,
    };
    ctx.db.sova_quest_message().insert(msg);
    log::info!("[SOVA Quest] Sent '{}' message to {:?}: {}", message_type, player_id, message);
}

/// Award quest rewards (XP + shards)
fn award_quest_rewards(
    ctx: &ReducerContext,
    player_id: Identity,
    xp: u64,
    shards: u64,
) -> Result<(), String> {
    // Award XP
    if xp > 0 {
        award_xp(ctx, player_id, xp)?;
    }
    
    // Award shards
    if shards > 0 {
        let shard_table = ctx.db.player_shard_balance();
        if let Some(mut balance) = shard_table.player_id().find(&player_id) {
            balance.balance += shards;
            balance.total_earned += shards;
            balance.last_transaction = ctx.timestamp;
            shard_table.player_id().update(balance);
        } else {
            // Create new balance
            let new_balance = crate::alk::PlayerShardBalance {
                player_id,
                balance: shards,
                total_earned: shards,
                total_spent: 0,
                last_transaction: ctx.timestamp,
            };
            shard_table.insert(new_balance);
        }
    }
    
    Ok(())
}

// ============================================================================
// QUEST TRACKING FUNCTIONS (Called from other modules)
// ============================================================================

/// Track progress for a quest objective
/// This is the main entry point called from other modules (crafting, combat, etc.)
pub fn track_quest_progress(
    ctx: &ReducerContext,
    player_id: Identity,
    objective_type: QuestObjectiveType,
    target_id: Option<&str>,
    amount: u32,
) -> Result<(), String> {
    // Track tutorial quest progress
    track_tutorial_progress(ctx, player_id, &objective_type, target_id, amount)?;
    
    // Track daily quest progress
    track_daily_progress(ctx, player_id, &objective_type, target_id, amount)?;
    
    Ok(())
}

/// Track tutorial quest progress
fn track_tutorial_progress(
    ctx: &ReducerContext,
    player_id: Identity,
    objective_type: &QuestObjectiveType,
    target_id: Option<&str>,
    amount: u32,
) -> Result<(), String> {
    let progress_table = ctx.db.player_tutorial_progress();
    let mut progress = get_or_init_tutorial_progress(ctx, player_id);
    
    // Already completed tutorial?
    if progress.tutorial_completed {
        return Ok(());
    }
    
    // Get current tutorial quest
    let quest_defs: Vec<TutorialQuestDefinition> = ctx.db.tutorial_quest_definition().iter().collect();
    let current_quest = quest_defs.iter()
        .find(|q| q.order_index == progress.current_quest_index);
    
    let quest = match current_quest {
        Some(q) => q,
        None => {
            // No more quests - tutorial complete!
            progress.tutorial_completed = true;
            progress.updated_at = ctx.timestamp;
            progress_table.player_id().update(progress);
            
            send_sova_quest_message(
                ctx,
                player_id,
                "Tutorial complete, agent. You're ready for the real challenges ahead. Good luck out there.",
                "tutorial_complete",
                Some("sova_tutorial_complete.mp3"),
            );
            return Ok(());
        }
    };
    
    // Check if this action matches the current quest objective
    if &quest.objective_type != objective_type {
        return Ok(());
    }
    
    // Check target_id if required
    if let Some(quest_target) = &quest.target_id {
        if let Some(action_target) = target_id {
            if quest_target != action_target {
                return Ok(());
            }
        } else {
            return Ok(()); // Quest requires specific target but action has none
        }
    }
    
    // Update progress
    progress.current_quest_progress += amount;
    progress.updated_at = ctx.timestamp;
    
    // Check for milestone notifications (50%)
    let prev_percent = ((progress.current_quest_progress - amount) as f32 / quest.target_amount as f32 * 100.0) as u32;
    let curr_percent = (progress.current_quest_progress as f32 / quest.target_amount as f32 * 100.0) as u32;
    
    if prev_percent < 50 && curr_percent >= 50 && curr_percent < 100 {
        let notif = QuestProgressNotification {
            id: 0,
            player_id,
            quest_name: quest.name.clone(),
            current_progress: progress.current_quest_progress,
            target_amount: quest.target_amount,
            milestone_percent: 50,
            notified_at: ctx.timestamp,
        };
        ctx.db.quest_progress_notification().insert(notif);
    }
    
    // Check for completion
    if progress.current_quest_progress >= quest.target_amount {
        complete_tutorial_quest(ctx, player_id, &mut progress, quest)?;
    } else {
        progress_table.player_id().update(progress);
    }
    
    Ok(())
}

/// Complete a tutorial quest and move to next
fn complete_tutorial_quest(
    ctx: &ReducerContext,
    player_id: Identity,
    progress: &mut PlayerTutorialProgress,
    quest: &TutorialQuestDefinition,
) -> Result<(), String> {
    let progress_table = ctx.db.player_tutorial_progress();
    
    // Award rewards
    award_quest_rewards(ctx, player_id, quest.xp_reward, quest.shard_reward)?;
    
    // Record completion
    if !progress.completed_quest_ids.is_empty() {
        progress.completed_quest_ids.push(',');
    }
    progress.completed_quest_ids.push_str(&quest.id);
    
    // Send completion notification
    let completion_notif = QuestCompletionNotification {
        id: 0,
        player_id,
        quest_name: quest.name.clone(),
        quest_type: "tutorial".to_string(),
        xp_awarded: quest.xp_reward,
        shards_awarded: quest.shard_reward,
        unlocked_recipe: quest.unlock_recipe.clone(),
        completed_at: ctx.timestamp,
    };
    ctx.db.quest_completion_notification().insert(completion_notif);
    
    // Send SOVA completion message
    let audio_file = format!("sova_tutorial_{:02}_complete.mp3", quest.order_index + 1);
    send_sova_quest_message(
        ctx,
        player_id,
        &quest.sova_complete_message,
        "quest_complete",
        Some(&audio_file),
    );
    
    // Move to next quest
    progress.current_quest_index += 1;
    progress.current_quest_progress = 0;
    progress.updated_at = ctx.timestamp;
    
    // Check if there's a next quest and announce it
    let quest_defs: Vec<TutorialQuestDefinition> = ctx.db.tutorial_quest_definition().iter().collect();
    if let Some(next_quest) = quest_defs.iter().find(|q| q.order_index == progress.current_quest_index) {
        let audio_file = format!("sova_tutorial_{:02}_start.mp3", next_quest.order_index + 1);
        send_sova_quest_message(
            ctx,
            player_id,
            &next_quest.sova_start_message,
            "quest_start",
            Some(&audio_file),
        );
    } else {
        // Tutorial complete!
        progress.tutorial_completed = true;
        send_sova_quest_message(
            ctx,
            player_id,
            "Outstanding work, agent. Tutorial complete. You're ready for the real challenges ahead.",
            "tutorial_complete",
            Some("sova_tutorial_complete.mp3"),
        );
    }
    
    progress_table.player_id().update(progress.clone());
    
    log::info!("[Quests] Player {:?} completed tutorial quest: {}", player_id, quest.name);
    
    Ok(())
}

/// Track daily quest progress
fn track_daily_progress(
    ctx: &ReducerContext,
    player_id: Identity,
    objective_type: &QuestObjectiveType,
    target_id: Option<&str>,
    amount: u32,
) -> Result<(), String> {
    let daily_table = ctx.db.player_daily_quest();
    
    // Get current world day (cycle_count = number of full day cycles)
    let world_day = ctx.db.world_state().iter().next()
        .map(|ws| ws.cycle_count)
        .unwrap_or(0);
    
    // Find matching active daily quests for this player
    let daily_quests: Vec<PlayerDailyQuest> = daily_table.iter()
        .filter(|q| q.player_id == player_id)
        .collect();
    
    for mut quest in daily_quests {
        // Skip if not today's quest or already completed/expired
        if quest.assigned_day != world_day {
            continue;
        }
        if quest.status != QuestStatus::InProgress && quest.status != QuestStatus::Available {
            continue;
        }
        
        // Get the quest definition
        let quest_def = ctx.db.daily_quest_definition().id().find(&quest.quest_def_id);
        let def = match quest_def {
            Some(d) => d,
            None => continue,
        };
        
        // Check if this action matches the quest objective
        if def.objective_type != *objective_type {
            continue;
        }
        
        // Check target_id if required
        if let Some(quest_target) = &def.target_id {
            if let Some(action_target) = target_id {
                if quest_target != action_target {
                    continue;
                }
            } else {
                continue;
            }
        }
        
        // Update status to in progress if just starting
        if quest.status == QuestStatus::Available {
            quest.status = QuestStatus::InProgress;
        }
        
        // Update progress
        quest.current_progress += amount;
        
        // Check for completion
        if quest.current_progress >= quest.target_amount {
            quest.status = QuestStatus::Completed;
            quest.completed_at = Some(ctx.timestamp);
            
            // Award rewards
            award_quest_rewards(ctx, player_id, quest.xp_reward, quest.shard_reward)?;
            
            // Send completion notification
            let completion_notif = QuestCompletionNotification {
                id: 0,
                player_id,
                quest_name: def.name.clone(),
                quest_type: "daily".to_string(),
                xp_awarded: quest.xp_reward,
                shards_awarded: quest.shard_reward,
                unlocked_recipe: None,
                completed_at: ctx.timestamp,
            };
            ctx.db.quest_completion_notification().insert(completion_notif);
            
            log::info!("[Quests] Player {:?} completed daily quest: {}", player_id, def.name);
        }
        
        // Update the quest record
        daily_table.id().update(quest);
    }
    
    Ok(())
}

// ============================================================================
// DAILY QUEST ASSIGNMENT
// ============================================================================

/// Assign daily quests to a player (called on login or day change)
pub fn assign_daily_quests(ctx: &ReducerContext, player_id: Identity) -> Result<(), String> {
    let daily_table = ctx.db.player_daily_quest();
    let def_table = ctx.db.daily_quest_definition();
    
    // Get current world day (cycle_count = number of full day cycles)
    let world_day = ctx.db.world_state().iter().next()
        .map(|ws| ws.cycle_count)
        .unwrap_or(0);
    
    // Check if player already has quests for today
    let existing_today: Vec<PlayerDailyQuest> = daily_table.iter()
        .filter(|q| q.player_id == player_id && q.assigned_day == world_day)
        .collect();
    
    if !existing_today.is_empty() {
        return Ok(()); // Already has today's quests
    }
    
    // Expire old quests
    let old_quests: Vec<PlayerDailyQuest> = daily_table.iter()
        .filter(|q| q.player_id == player_id && q.assigned_day < world_day && q.status == QuestStatus::InProgress)
        .collect();
    
    for mut old_quest in old_quests {
        old_quest.status = QuestStatus::Expired;
        daily_table.id().update(old_quest);
    }
    
    // Get all available daily quest definitions
    let all_defs: Vec<DailyQuestDefinition> = def_table.iter().collect();
    
    if all_defs.is_empty() {
        log::warn!("[Quests] No daily quest definitions found!");
        return Ok(());
    }
    
    // Randomly select quests (without replacement)
    let mut selected_indices: Vec<usize> = Vec::new();
    let count = std::cmp::min(DAILY_QUESTS_PER_PLAYER, all_defs.len());
    
    while selected_indices.len() < count {
        let idx = ctx.rng().gen_range(0..all_defs.len());
        if !selected_indices.contains(&idx) {
            selected_indices.push(idx);
        }
    }
    
    // Create player daily quests
    for idx in selected_indices {
        let def = &all_defs[idx];
        let multiplier = get_difficulty_multiplier(&def.difficulty);
        
        let quest = PlayerDailyQuest {
            id: 0,
            player_id,
            quest_def_id: def.id.clone(),
            assigned_day: world_day,
            current_progress: 0,
            target_amount: def.target_amount,
            status: QuestStatus::Available,
            xp_reward: (def.base_xp_reward as f32 * multiplier) as u64,
            shard_reward: (def.base_shard_reward as f32 * multiplier) as u64,
            completed_at: None,
        };
        
        daily_table.insert(quest);
    }
    
    log::info!("[Quests] Assigned {} daily quests to player {:?}", count, player_id);
    
    // Send SOVA message about new daily quests
    send_sova_quest_message(
        ctx,
        player_id,
        "New daily objectives available. Check your quest log for today's challenges.",
        "daily_quests_assigned",
        Some("sova_daily_quests_available.mp3"),
    );
    
    Ok(())
}

// ============================================================================
// REDUCERS
// ============================================================================

/// Initialize quest system - call from init_module
#[spacetimedb::reducer]
pub fn init_quest_system(ctx: &ReducerContext) -> Result<(), String> {
    // Note: This is called from init_module during first publish/republish
    // During init, ctx.sender == ctx.identity() (the module itself)
    
    seed_tutorial_quests(ctx)?;
    seed_daily_quests(ctx)?;
    
    log::info!("[Quests] Quest system initialized");
    Ok(())
}

/// Request a hint for current tutorial quest
#[spacetimedb::reducer]
pub fn request_tutorial_hint(ctx: &ReducerContext) -> Result<(), String> {
    let player_id = ctx.sender;
    let progress_table = ctx.db.player_tutorial_progress();
    let mut progress = get_or_init_tutorial_progress(ctx, player_id);
    
    if progress.tutorial_completed {
        return Err("Tutorial already completed".to_string());
    }
    
    // Rate limit hints (1 per minute)
    if let Some(last_hint) = progress.last_hint_shown {
        let elapsed = ctx.timestamp.to_micros_since_unix_epoch() - last_hint.to_micros_since_unix_epoch();
        if elapsed < 60_000_000 { // 60 seconds in microseconds
            return Err("Please wait before requesting another hint".to_string());
        }
    }
    
    // Get current quest
    let quest = ctx.db.tutorial_quest_definition().iter()
        .find(|q| q.order_index == progress.current_quest_index);
    
    match quest {
        Some(q) => {
            progress.last_hint_shown = Some(ctx.timestamp);
            progress.updated_at = ctx.timestamp;
            progress_table.player_id().update(progress);
            
            send_sova_quest_message(
                ctx,
                player_id,
                &q.sova_hint_message,
                "quest_hint",
                Some(&format!("sova_tutorial_{:02}_hint.mp3", q.order_index + 1)),
            );
            
            Ok(())
        }
        None => Err("No active tutorial quest".to_string()),
    }
}

/// Manually refresh daily quests (admin/debug)
#[spacetimedb::reducer]
pub fn refresh_my_daily_quests(ctx: &ReducerContext) -> Result<(), String> {
    let player_id = ctx.sender;
    let daily_table = ctx.db.player_daily_quest();
    
    // Get current world day (cycle_count = number of full day cycles)
    let world_day = ctx.db.world_state().iter().next()
        .map(|ws| ws.cycle_count)
        .unwrap_or(0);
    
    // Delete today's quests to force reassignment
    let todays_quests: Vec<PlayerDailyQuest> = daily_table.iter()
        .filter(|q| q.player_id == player_id && q.assigned_day == world_day)
        .collect();
    
    for quest in todays_quests {
        daily_table.id().delete(quest.id);
    }
    
    // Reassign
    assign_daily_quests(ctx, player_id)?;
    
    Ok(())
}

/// Initialize/repair quest data for the calling player
/// Call this if quests are not showing up properly
#[spacetimedb::reducer]
pub fn initialize_my_quests(ctx: &ReducerContext) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Verify player exists
    if ctx.db.player().identity().find(&player_id).is_none() {
        return Err("Player not found. You need to register first.".to_string());
    }
    
    // Initialize tutorial progress (idempotent - won't overwrite if exists)
    let progress = get_or_init_tutorial_progress(ctx, player_id);
    log::info!("[InitMyQuests] Tutorial progress for {:?}: index={}, completed={}", 
               player_id, progress.current_quest_index, progress.tutorial_completed);
    
    // Check if daily quests exist for today
    let world_day = ctx.db.world_state().iter().next()
        .map(|ws| ws.cycle_count)
        .unwrap_or(0);
    
    let existing_daily = ctx.db.player_daily_quest().iter()
        .filter(|q| q.player_id == player_id && q.assigned_day == world_day)
        .count();
    
    if existing_daily == 0 {
        // Assign daily quests
        assign_daily_quests(ctx, player_id)?;
        log::info!("[InitMyQuests] Assigned daily quests for {:?} (day {})", player_id, world_day);
    } else {
        log::info!("[InitMyQuests] Player {:?} already has {} daily quests for day {}", 
                   player_id, existing_daily, world_day);
    }
    
    // Send welcome message for new quest system users
    if progress.current_quest_index == 0 && !progress.tutorial_completed {
        send_sova_quest_message(
            ctx,
            player_id,
            "Quest system initialized. Press J to view your missions. I have directives for you, agent.",
            "system",
            Some("sova_directives_intro.mp3"),
        );
    }
    
    Ok(())
}

// ============================================================================
// SEEDING FUNCTIONS
// ============================================================================

/// Seed tutorial quests
fn seed_tutorial_quests(ctx: &ReducerContext) -> Result<(), String> {
    let table = ctx.db.tutorial_quest_definition();
    
    // Skip if already seeded
    if table.iter().count() > 0 {
        log::info!("[Quests] Tutorial quests already seeded");
        return Ok(());
    }
    
    let quests = vec![
        // ===========================================
        // PHASE 1: GATHERING BASICS (No tools needed)
        // ===========================================
        
        // Quest 1: Harvest Plants (introduces foraging - no tools required)
        TutorialQuestDefinition {
            id: "tutorial_01_harvest_plants".to_string(),
            order_index: 0,
            name: "Foraging Basics".to_string(),
            description: "Harvest 5 wild plants by pressing E near bushes and fiber plants.".to_string(),
            objective_type: QuestObjectiveType::HarvestPlant,
            target_id: None,
            target_amount: 5,
            xp_reward: 15,
            shard_reward: 5,
            unlock_recipe: None,
            sova_start_message: "Agent, welcome to the island. First, let's gather some basic materials. Look for plants on the ground - fiber, berries, herbs. Press E to harvest them.".to_string(),
            sova_complete_message: "Good instincts. Plant fiber is essential for rope and cloth. Keep foraging.".to_string(),
            sova_hint_message: "Walk around and look for plants. Press E when you see the interaction prompt.".to_string(),
        },
        
        // ===========================================
        // PHASE 2: BASIC TOOLS (Unlocks resource gathering)
        // ===========================================
        
        // Quest 2: Craft Stone Hatchet (first tool - enables wood gathering)
        TutorialQuestDefinition {
            id: "tutorial_02_craft_hatchet".to_string(),
            order_index: 1,
            name: "First Tool".to_string(),
            description: "Craft a Stone Hatchet from the crafting menu.".to_string(),
            objective_type: QuestObjectiveType::CraftSpecificItem,
            target_id: Some("Stone Hatchet".to_string()),
            target_amount: 1,
            xp_reward: 25,
            shard_reward: 10,
            unlock_recipe: None,
            sova_start_message: "Now you need tools. Press B to open crafting and make a Stone Hatchet. You'll need wood and stone - chop trees for wood and mine stone from formations with your combat ladle.".to_string(),
            sova_complete_message: "Excellent. A hatchet is your best friend for gathering wood. Equip it to your hotbar.".to_string(),
            sova_hint_message: "Press C to open crafting. Stone Hatchet needs 200 wood and 100 stone. Look for loose wood and stones on the ground first.".to_string(),
        },
        
        // Quest 3: Chop Trees (introduces wood gathering with tools)
        TutorialQuestDefinition {
            id: "tutorial_03_chop_trees".to_string(),
            order_index: 2,
            name: "Timber!".to_string(),
            description: "Chop down 5 trees for wood.".to_string(),
            objective_type: QuestObjectiveType::GatherWood,
            target_id: None,
            target_amount: 5,
            xp_reward: 30,
            shard_reward: 10,
            unlock_recipe: None,
            sova_start_message: "Time to put that hatchet to work. Find trees and attack them to gather wood. You'll need lots of it for building.".to_string(),
            sova_complete_message: "Well done. Trees are your primary source of wood. Keep your hatchet handy.".to_string(),
            sova_hint_message: "Equip your Stone Hatchet and left-click on trees. Each tree gives multiple logs when destroyed.".to_string(),
        },
        
        // Quest 4: Craft Stone Pickaxe (enables stone/ore gathering)
        TutorialQuestDefinition {
            id: "tutorial_04_craft_pickaxe".to_string(),
            order_index: 3,
            name: "Mining Equipment".to_string(),
            description: "Craft a Stone Pickaxe for mining.".to_string(),
            objective_type: QuestObjectiveType::CraftSpecificItem,
            target_id: Some("Stone Pickaxe".to_string()),
            target_amount: 1,
            xp_reward: 25,
            shard_reward: 10,
            unlock_recipe: None,
            sova_start_message: "A pickaxe will let you mine stone and ore. Craft one now - the recipe is similar to the hatchet.".to_string(),
            sova_complete_message: "Now you can mine. Stone formations and ore veins await.".to_string(),
            sova_hint_message: "Press C to open crafting. Stone Pickaxe needs 200 wood and 100 stone. You should have enough from chopping trees.".to_string(),
        },
        
        // Quest 5: Mine Stone (introduces mining)
        TutorialQuestDefinition {
            id: "tutorial_05_mine_stone".to_string(),
            order_index: 4,
            name: "Breaking Ground".to_string(),
            description: "Mine 30 stone from rock formations.".to_string(),
            objective_type: QuestObjectiveType::GatherStone,
            target_id: None,
            target_amount: 30,
            xp_reward: 35,
            shard_reward: 15,
            unlock_recipe: None,
            sova_start_message: "Stone is the foundation of progress. Find gray rock formations and mine them with your pickaxe.".to_string(),
            sova_complete_message: "Stone secured. You're building a solid foundation, agent.".to_string(),
            sova_hint_message: "Look for large gray rocks. Equip your pickaxe and attack them to gather stone.".to_string(),
        },
        
        // ===========================================
        // PHASE 3: SHELTER & BASE BUILDING
        // ===========================================
        
        // Quest 6: Build Shelter (introduces building)
        TutorialQuestDefinition {
            id: "tutorial_06_build_shelter".to_string(),
            order_index: 5,
            name: "Home Base".to_string(),
            description: "Craft and place a Shelter to establish your base.".to_string(),
            objective_type: QuestObjectiveType::PlaceShelter,
            target_id: None,
            target_amount: 1,
            xp_reward: 50,
            shard_reward: 20,
            unlock_recipe: None,
            sova_start_message: "Shelter is survival. Craft a Shelter and place it somewhere safe. This will be your home base. It requires 100 wood and 2 rope.".to_string(),
            sova_complete_message: "Your base is established. It's basic, but it's yours. Defend it well.".to_string(),
            sova_hint_message: "You'll need rope - craft it from plant fiber first. Then craft the Shelter and place it with right-click.".to_string(),
        },
        
        // Quest 7: Build Campfire (introduces fire/cooking)
        TutorialQuestDefinition {
            id: "tutorial_07_build_campfire".to_string(),
            order_index: 6,
            name: "Light in the Dark".to_string(),
            description: "Craft and place a Camp Fire near your shelter.".to_string(),
            objective_type: QuestObjectiveType::PlaceCampfire,
            target_id: None,
            target_amount: 1,
            xp_reward: 35,
            shard_reward: 15,
            unlock_recipe: None,
            sova_start_message: "Fire means warmth, light, and cooked food. Craft a Camp Fire and place it near your shelter. It only needs 25 wood and 10 stone.".to_string(),
            sova_complete_message: "Fire established. Cook raw meat to avoid food poisoning, and stay warm through the cold nights.".to_string(),
            sova_hint_message: "Open crafting with C, find Camp Fire. Place it near your shelter - you can cook food by putting it inside.".to_string(),
        },
        
        // Quest 8: Build Storage Box (introduces storage)
        TutorialQuestDefinition {
            id: "tutorial_08_storage_box".to_string(),
            order_index: 7,
            name: "Secure Your Loot".to_string(),
            description: "Craft and place a Wooden Storage Box.".to_string(),
            objective_type: QuestObjectiveType::PlaceStorageBox,
            target_id: None,
            target_amount: 1,
            xp_reward: 25,
            shard_reward: 10,
            unlock_recipe: None,
            sova_start_message: "You can't carry everything. Craft a Wooden Storage Box to stash your surplus materials safely. Just 100 wood.".to_string(),
            sova_complete_message: "Storage secured. Your base is taking shape.".to_string(),
            sova_hint_message: "Craft the Wooden Storage Box and place it. Press E to open it and transfer items.".to_string(),
        },
        
        // Quest 9: Build Sleeping Bag (introduces respawn)
        TutorialQuestDefinition {
            id: "tutorial_09_sleeping_bag".to_string(),
            order_index: 8,
            name: "Rest Point".to_string(),
            description: "Craft and place a Sleeping Bag for respawning.".to_string(),
            objective_type: QuestObjectiveType::PlaceSleepingBag,
            target_id: None,
            target_amount: 1,
            xp_reward: 30,
            shard_reward: 15,
            unlock_recipe: None,
            sova_start_message: "Death comes for all, but you choose where to return. Place a Sleeping Bag - it sets your respawn point. You'll need 15 cloth.".to_string(),
            sova_complete_message: "Respawn point set. Now death is just a minor setback.".to_string(),
            sova_hint_message: "Craft Cloth from Plant Fiber first. Then craft the Sleeping Bag and place it inside your shelter.".to_string(),
        },
        
        // ===========================================
        // PHASE 4: SURVIVAL SKILLS
        // ===========================================
        
        // Quest 10: Eat Food (introduces hunger)
        TutorialQuestDefinition {
            id: "tutorial_10_eat_food".to_string(),
            order_index: 9,
            name: "Fuel for Survival".to_string(),
            description: "Eat 3 food items to restore hunger.".to_string(),
            objective_type: QuestObjectiveType::EatFood,
            target_id: None,
            target_amount: 3,
            xp_reward: 20,
            shard_reward: 5,
            unlock_recipe: None,
            sova_start_message: "Your body needs fuel. Eat some food - berries, cooked meat, anything edible. Watch your hunger bar.".to_string(),
            sova_complete_message: "Good. Keep your hunger above critical levels or you'll start losing health.".to_string(),
            sova_hint_message: "Place food on your hotbar and press the number key to consume it. Cooked food is safer and more nutritious.".to_string(),
        },
        
        // Quest 11: Kill an Animal (introduces combat and animal resources)
        TutorialQuestDefinition {
            id: "tutorial_11_kill_animal".to_string(),
            order_index: 10,
            name: "The Hunt".to_string(),
            description: "Kill 3 wild animals for meat and resources.".to_string(),
            objective_type: QuestObjectiveType::KillAnyAnimal,
            target_id: None,
            target_amount: 3,
            xp_reward: 45,
            shard_reward: 15,
            unlock_recipe: None,
            sova_start_message: "Time for combat training. Hunt 3 wild animals. Rabbits and deer are easy prey. Watch out for wolves - they bite back.".to_string(),
            sova_complete_message: "Clean kills. Animals provide meat, hide, bone, and animal fat. All useful resources.".to_string(),
            sova_hint_message: "Equip a weapon or your hatchet. Approach animals and attack. Don't forget to harvest the corpse with E!".to_string(),
        },
        
        // Quest 12: Hunt more animals (need animal fat for furnace)
        TutorialQuestDefinition {
            id: "tutorial_12_hunt_more".to_string(),
            order_index: 11,
            name: "Fat of the Land".to_string(),
            description: "Kill 5 more animals to gather Animal Fat for a Furnace.".to_string(),
            objective_type: QuestObjectiveType::KillAnyAnimal,
            target_id: None,
            target_amount: 5,
            xp_reward: 40,
            shard_reward: 20,
            unlock_recipe: None,
            sova_start_message: "Animal Fat is crucial for building a Furnace. Keep hunting and harvesting corpses. You'll need at least 50 fat - larger animals drop more.".to_string(),
            sova_complete_message: "Good hunting. Check your inventory for Animal Fat - you'll need it for the furnace.".to_string(),
            sova_hint_message: "Kill animals and press E on their corpses to harvest. Deer, wolves, and boars drop more fat than rabbits.".to_string(),
        },
        
        // ===========================================
        // PHASE 5: METAL PROGRESSION
        // ===========================================
        
        // Quest 13: Build Furnace (enables metal smelting - requires 50 Animal Fat!)
        TutorialQuestDefinition {
            id: "tutorial_13_build_furnace".to_string(),
            order_index: 12,
            name: "Industrial Revolution".to_string(),
            description: "Craft and place a Furnace for smelting metal.".to_string(),
            objective_type: QuestObjectiveType::PlaceFurnace,
            target_id: None,
            target_amount: 1,
            xp_reward: 60,
            shard_reward: 25,
            unlock_recipe: None,
            sova_start_message: "Metal tools are stronger. To make them, you need a Furnace. It requires 100 stone, 50 wood, and 50 animal fat. Time to put that fat to use.".to_string(),
            sova_complete_message: "Furnace placed. Put metal ore and wood inside, light it, and watch the fragments pour out.".to_string(),
            sova_hint_message: "Make sure you have 50 Animal Fat. Craft the Furnace and place it. It needs fuel (wood) to smelt ore.".to_string(),
        },
        
        // Quest 14: Craft Metal Tool (introduces metal progression)
        TutorialQuestDefinition {
            id: "tutorial_14_craft_metal_tool".to_string(),
            order_index: 13,
            name: "Forged in Fire".to_string(),
            description: "Craft a Metal Hatchet or Metal Pickaxe.".to_string(),
            objective_type: QuestObjectiveType::CraftAnyItem,
            target_id: None,  // We track any crafting, quest completes when they have metal tools
            target_amount: 1,
            xp_reward: 50,
            shard_reward: 20,
            unlock_recipe: None,
            sova_start_message: "Mine metal ore from rock formations - look for darker rocks with orange veins. Put the ore in your furnace with wood and light it. Then craft a metal tool.".to_string(),
            sova_complete_message: "Metal tool acquired. Now you can gather resources faster. The island is yours to conquer.".to_string(),
            sova_hint_message: "Find metal ore nodes (darker rocks). Mine them, smelt them in the furnace, then craft a Metal Hatchet or Metal Pickaxe.".to_string(),
        },
        
        // ===========================================
        // PHASE 6: ECONOMY & MEMORY SYSTEM
        // ===========================================
        
        // Quest 15: Catch Fish (introduces fishing)
        TutorialQuestDefinition {
            id: "tutorial_15_catch_fish".to_string(),
            order_index: 14,
            name: "Gone Fishing".to_string(),
            description: "Catch 3 fish from the water.".to_string(),
            objective_type: QuestObjectiveType::CatchAnyFish,
            target_id: None,
            target_amount: 3,
            xp_reward: 35,
            shard_reward: 15,
            unlock_recipe: None,
            sova_start_message: "Fish are an excellent food source. Craft a fishing rod and catch 3 fish from any body of water.".to_string(),
            sova_complete_message: "Nice catch. Fishing is a reliable way to keep yourself fed.".to_string(),
            sova_hint_message: "Craft a Basic Fishing Rod. Stand near water, equip it, and cast with left click. Watch for the bobber to dip.".to_string(),
        },
        
        // Quest 16: Discover first Cairn (introduces exploration & memory shards)
        TutorialQuestDefinition {
            id: "tutorial_16_discover_cairn".to_string(),
            order_index: 15,
            name: "Ancient Memories".to_string(),
            description: "Discover and interact with a stone cairn.".to_string(),
            objective_type: QuestObjectiveType::DiscoverCairn,
            target_id: None,
            target_amount: 1,
            xp_reward: 50,
            shard_reward: 30,
            unlock_recipe: None,
            sova_start_message: "Stone cairns are scattered across the island. Each contains a fragment of this world's history - and a reward of Memory Shards. Find one.".to_string(),
            sova_complete_message: "You've touched the past. These memories... they're not from this time. Keep exploring.".to_string(),
            sova_hint_message: "Cairns are small stone stacks. Press E to interact when nearby. They reward Memory Shards and tell stories of the island.".to_string(),
        },
        
        // Quest 17: Discover more cairns (main source of shards)
        TutorialQuestDefinition {
            id: "tutorial_17_discover_more_cairns".to_string(),
            order_index: 16,
            name: "Fragments of Memory".to_string(),
            description: "Discover 3 more stone cairns across the island.".to_string(),
            objective_type: QuestObjectiveType::DiscoverCairn,
            target_id: None,
            target_amount: 3,
            xp_reward: 60,
            shard_reward: 0, // Cairns give shards directly
            unlock_recipe: None,
            sova_start_message: "Memory Shards are the currency of this world. Cairns are your best early source - each one rewards 25-200 shards depending on its secrets. Find 3 more.".to_string(),
            sova_complete_message: "Shards acquired. You may notice... changes. The whispers are normal. Mostly.".to_string(),
            sova_hint_message: "Explore the island. Stone cairns are scattered everywhere - small piles of stacked rocks. Press E to interact and claim your reward.".to_string(),
        },
        
        // Quest 18: Deliver ALK Contract (introduces the economy)
        TutorialQuestDefinition {
            id: "tutorial_18_alk_contract".to_string(),
            order_index: 17,
            name: "Enter the Economy".to_string(),
            description: "Accept and complete 1 ALK contract delivery.".to_string(),
            objective_type: QuestObjectiveType::DeliverAlkContract,
            target_id: None,
            target_amount: 1,
            xp_reward: 100,
            shard_reward: 50,
            unlock_recipe: None,
            sova_start_message: "The ALK stations trade resources for Memory Shards. Press G to open the map, find an ALK station, travel there, and complete a contract.".to_string(),
            sova_complete_message: "Contract complete. The ALK system is your main source of shards - and progression. Well done, agent. You're ready for the real challenges.".to_string(),
            sova_hint_message: "Press G for the map. ALK stations are marked. Interact, accept a contract for items you can gather, collect them, and return to deliver.".to_string(),
        },
    ];
    
    for quest in quests {
        table.insert(quest);
    }
    
    let quest_count = 18; // Updated count
    log::info!("[Quests] Seeded {} tutorial quests", quest_count);
    Ok(())
}

/// Seed daily quest pool
fn seed_daily_quests(ctx: &ReducerContext) -> Result<(), String> {
    let table = ctx.db.daily_quest_definition();
    
    // Skip if already seeded
    if table.iter().count() > 0 {
        log::info!("[Quests] Daily quests already seeded");
        return Ok(());
    }
    
    let quests = vec![
        // ===== GATHERING QUESTS =====
        DailyQuestDefinition {
            id: "daily_chop_wood_easy".to_string(),
            name: "Lumber Run".to_string(),
            description: "Chop down 10 trees.".to_string(),
            objective_type: QuestObjectiveType::GatherWood,
            target_id: None,
            target_amount: 10,
            difficulty: QuestDifficulty::Easy,
            base_xp_reward: 30,
            base_shard_reward: 15,
        },
        DailyQuestDefinition {
            id: "daily_chop_wood_medium".to_string(),
            name: "Deforestation".to_string(),
            description: "Chop down 30 trees.".to_string(),
            objective_type: QuestObjectiveType::GatherWood,
            target_id: None,
            target_amount: 30,
            difficulty: QuestDifficulty::Medium,
            base_xp_reward: 40,
            base_shard_reward: 25,
        },
        DailyQuestDefinition {
            id: "daily_mine_stone_easy".to_string(),
            name: "Stone Collector".to_string(),
            description: "Mine 50 stone.".to_string(),
            objective_type: QuestObjectiveType::GatherStone,
            target_id: None,
            target_amount: 50,
            difficulty: QuestDifficulty::Easy,
            base_xp_reward: 30,
            base_shard_reward: 15,
        },
        DailyQuestDefinition {
            id: "daily_mine_stone_hard".to_string(),
            name: "Quarry Master".to_string(),
            description: "Mine 200 stone.".to_string(),
            objective_type: QuestObjectiveType::GatherStone,
            target_id: None,
            target_amount: 200,
            difficulty: QuestDifficulty::Hard,
            base_xp_reward: 50,
            base_shard_reward: 40,
        },
        DailyQuestDefinition {
            id: "daily_harvest_plants".to_string(),
            name: "Forager".to_string(),
            description: "Harvest 15 wild plants.".to_string(),
            objective_type: QuestObjectiveType::HarvestPlant,
            target_id: None,
            target_amount: 15,
            difficulty: QuestDifficulty::Easy,
            base_xp_reward: 25,
            base_shard_reward: 12,
        },
        DailyQuestDefinition {
            id: "daily_harvest_plants_hard".to_string(),
            name: "Master Forager".to_string(),
            description: "Harvest 50 wild plants.".to_string(),
            objective_type: QuestObjectiveType::HarvestPlant,
            target_id: None,
            target_amount: 50,
            difficulty: QuestDifficulty::Hard,
            base_xp_reward: 45,
            base_shard_reward: 35,
        },
        
        // ===== FISHING QUESTS =====
        DailyQuestDefinition {
            id: "daily_catch_fish_easy".to_string(),
            name: "Gone Fishing".to_string(),
            description: "Catch 5 fish.".to_string(),
            objective_type: QuestObjectiveType::CatchAnyFish,
            target_id: None,
            target_amount: 5,
            difficulty: QuestDifficulty::Easy,
            base_xp_reward: 35,
            base_shard_reward: 20,
        },
        DailyQuestDefinition {
            id: "daily_catch_fish_medium".to_string(),
            name: "Fisher's Bounty".to_string(),
            description: "Catch 15 fish.".to_string(),
            objective_type: QuestObjectiveType::CatchAnyFish,
            target_id: None,
            target_amount: 15,
            difficulty: QuestDifficulty::Medium,
            base_xp_reward: 50,
            base_shard_reward: 35,
        },
        DailyQuestDefinition {
            id: "daily_catch_fish_hard".to_string(),
            name: "Master Angler".to_string(),
            description: "Catch 30 fish.".to_string(),
            objective_type: QuestObjectiveType::CatchAnyFish,
            target_id: None,
            target_amount: 30,
            difficulty: QuestDifficulty::Hard,
            base_xp_reward: 75,
            base_shard_reward: 60,
        },
        
        // ===== COMBAT QUESTS =====
        DailyQuestDefinition {
            id: "daily_kill_animals_easy".to_string(),
            name: "Hunter".to_string(),
            description: "Kill 3 wild animals.".to_string(),
            objective_type: QuestObjectiveType::KillAnyAnimal,
            target_id: None,
            target_amount: 3,
            difficulty: QuestDifficulty::Easy,
            base_xp_reward: 40,
            base_shard_reward: 25,
        },
        DailyQuestDefinition {
            id: "daily_kill_animals_medium".to_string(),
            name: "Big Game Hunter".to_string(),
            description: "Kill 10 wild animals.".to_string(),
            objective_type: QuestObjectiveType::KillAnyAnimal,
            target_id: None,
            target_amount: 10,
            difficulty: QuestDifficulty::Medium,
            base_xp_reward: 60,
            base_shard_reward: 45,
        },
        DailyQuestDefinition {
            id: "daily_kill_wolves".to_string(),
            name: "Wolf Slayer".to_string(),
            description: "Kill 5 wolves.".to_string(),
            objective_type: QuestObjectiveType::KillSpecificAnimal,
            target_id: Some("Wolf".to_string()),
            target_amount: 5,
            difficulty: QuestDifficulty::Hard,
            base_xp_reward: 80,
            base_shard_reward: 60,
        },
        DailyQuestDefinition {
            id: "daily_kill_bears".to_string(),
            name: "Bear Bane".to_string(),
            description: "Kill 3 bears.".to_string(),
            objective_type: QuestObjectiveType::KillSpecificAnimal,
            target_id: Some("Bear".to_string()),
            target_amount: 3,
            difficulty: QuestDifficulty::Expert,
            base_xp_reward: 100,
            base_shard_reward: 80,
        },
        
        // ===== CRAFTING QUESTS =====
        DailyQuestDefinition {
            id: "daily_craft_items_easy".to_string(),
            name: "Busy Hands".to_string(),
            description: "Craft 5 items.".to_string(),
            objective_type: QuestObjectiveType::CraftAnyItem,
            target_id: None,
            target_amount: 5,
            difficulty: QuestDifficulty::Easy,
            base_xp_reward: 25,
            base_shard_reward: 15,
        },
        DailyQuestDefinition {
            id: "daily_craft_items_medium".to_string(),
            name: "Workshop".to_string(),
            description: "Craft 15 items.".to_string(),
            objective_type: QuestObjectiveType::CraftAnyItem,
            target_id: None,
            target_amount: 15,
            difficulty: QuestDifficulty::Medium,
            base_xp_reward: 45,
            base_shard_reward: 30,
        },
        
        // ===== BREWING QUESTS =====
        DailyQuestDefinition {
            id: "daily_brew".to_string(),
            name: "Brewmaster".to_string(),
            description: "Complete 2 brews.".to_string(),
            objective_type: QuestObjectiveType::CompleteBrew,
            target_id: None,
            target_amount: 2,
            difficulty: QuestDifficulty::Medium,
            base_xp_reward: 50,
            base_shard_reward: 35,
        },
        DailyQuestDefinition {
            id: "daily_brew_hard".to_string(),
            name: "Master Brewer".to_string(),
            description: "Complete 5 brews.".to_string(),
            objective_type: QuestObjectiveType::CompleteBrew,
            target_id: None,
            target_amount: 5,
            difficulty: QuestDifficulty::Hard,
            base_xp_reward: 75,
            base_shard_reward: 55,
        },
        
        // ===== FARMING QUESTS =====
        DailyQuestDefinition {
            id: "daily_plant_seeds".to_string(),
            name: "Farmer".to_string(),
            description: "Plant 10 seeds.".to_string(),
            objective_type: QuestObjectiveType::PlantSeed,
            target_id: None,
            target_amount: 10,
            difficulty: QuestDifficulty::Easy,
            base_xp_reward: 30,
            base_shard_reward: 18,
        },
        DailyQuestDefinition {
            id: "daily_harvest_crops".to_string(),
            name: "Harvest Time".to_string(),
            description: "Harvest 10 planted crops.".to_string(),
            objective_type: QuestObjectiveType::HarvestCrop,
            target_id: None,
            target_amount: 10,
            difficulty: QuestDifficulty::Medium,
            base_xp_reward: 40,
            base_shard_reward: 28,
        },
        
        // ===== ECONOMY QUESTS =====
        DailyQuestDefinition {
            id: "daily_alk_contract".to_string(),
            name: "Contractor".to_string(),
            description: "Complete 1 ALK contract.".to_string(),
            objective_type: QuestObjectiveType::DeliverAlkContract,
            target_id: None,
            target_amount: 1,
            difficulty: QuestDifficulty::Medium,
            base_xp_reward: 50,
            base_shard_reward: 30,
        },
        DailyQuestDefinition {
            id: "daily_alk_contracts_hard".to_string(),
            name: "Delivery Expert".to_string(),
            description: "Complete 3 ALK contracts.".to_string(),
            objective_type: QuestObjectiveType::DeliverAlkContract,
            target_id: None,
            target_amount: 3,
            difficulty: QuestDifficulty::Hard,
            base_xp_reward: 80,
            base_shard_reward: 60,
        },
        
        // ===== EXPLORATION QUESTS =====
        DailyQuestDefinition {
            id: "daily_discover_cairn".to_string(),
            name: "Cairn Seeker".to_string(),
            description: "Discover a cairn.".to_string(),
            objective_type: QuestObjectiveType::DiscoverCairn,
            target_id: None,
            target_amount: 1,
            difficulty: QuestDifficulty::Medium,
            base_xp_reward: 60,
            base_shard_reward: 40,
        },
        
        // ===== SURVIVAL QUESTS =====
        DailyQuestDefinition {
            id: "daily_survive_30min".to_string(),
            name: "Survivor".to_string(),
            description: "Survive for 30 minutes.".to_string(),
            objective_type: QuestObjectiveType::SurviveMinutes,
            target_id: None,
            target_amount: 30,
            difficulty: QuestDifficulty::Medium,
            base_xp_reward: 45,
            base_shard_reward: 30,
        },
        DailyQuestDefinition {
            id: "daily_eat_food".to_string(),
            name: "Well Fed".to_string(),
            description: "Eat 10 food items.".to_string(),
            objective_type: QuestObjectiveType::EatFood,
            target_id: None,
            target_amount: 10,
            difficulty: QuestDifficulty::Easy,
            base_xp_reward: 25,
            base_shard_reward: 12,
        },
        
        // ===== UNDERWATER QUESTS =====
        DailyQuestDefinition {
            id: "daily_mine_coral".to_string(),
            name: "Reef Raider".to_string(),
            description: "Mine 20 coral.".to_string(),
            objective_type: QuestObjectiveType::MineCoral,
            target_id: None,
            target_amount: 20,
            difficulty: QuestDifficulty::Medium,
            base_xp_reward: 45,
            base_shard_reward: 30,
        },
    ];
    
    let quest_count = quests.len();
    for quest in quests {
        table.insert(quest);
    }
    
    log::info!("[Quests] Seeded {} daily quests", quest_count);
    Ok(())
}
