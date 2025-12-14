// ============================================================================
// MATRONAGE POOLED REWARDS SYSTEM
// ============================================================================
// A voluntary player pact system that pools work order rewards and distributes
// them evenly over time. Players can:
// - Create a Matronage using a Matron's Mark at the central ALK compound
// - Invite other players by username
// - Pool work order rewards for periodic equal distribution
// - Withdraw accumulated shards at the central ALK compound
//
// Key Design Principles:
// - Completely optional (normal work order delivery always available)
// - One matronage per player
// - Equal splits regardless of contribution
// - Owed balances persist after leaving/dissolution
// ============================================================================

use spacetimedb::{ReducerContext, Table, Timestamp, Identity, TimeDuration, ScheduleAt, SpacetimeType};
use log;
use std::time::Duration;

// Import table traits
use crate::player as PlayerTableTrait;
use crate::items::inventory_item as InventoryItemTableTrait;
use crate::items::item_definition as ItemDefinitionTableTrait;
use crate::alk::alk_station as AlkStationTableTrait;
use crate::models::ItemLocation;

// Table trait imports for generated accessor methods
use crate::matronage::matronage as MatronageTableTrait;
use crate::matronage::matronage_member as MatronageMemberTableTrait;
use crate::matronage::matronage_invitation as MatronageInvitationTableTrait;
use crate::matronage::matronage_owed_shards as MatronageOwedShardsTableTrait;
use crate::matronage::matronage_payout_schedule as MatronagePayoutScheduleTableTrait;

// ============================================================================
// CONSTANTS
// ============================================================================

/// Payout interval in seconds (60 real minutes = 1 in-game day)
pub const MATRONAGE_PAYOUT_INTERVAL_SECS: u64 = 3600; // 60 minutes

/// Central compound station ID (from alk.rs)
pub const CENTRAL_COMPOUND_STATION_ID: u32 = 0;

/// Interaction radius for matronage operations at central compound
pub const MATRONAGE_INTERACTION_RADIUS: f32 = 250.0;

// ============================================================================
// ENUMS
// ============================================================================

/// Role within a Matronage
#[derive(SpacetimeType, Clone, Debug, PartialEq, Eq)]
pub enum MatronageRole {
    PraMatron,  // Leader (founder or promoted)
    Member,     // Regular member
}

// ============================================================================
// TABLES
// ============================================================================

/// Main Matronage entity - represents a pooling organization
#[spacetimedb::table(name = matronage, public)]
#[derive(Clone, Debug)]
pub struct Matronage {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    
    /// Display name chosen at creation
    pub name: String,
    
    /// FontAwesome icon identifier (e.g., "fa-shield", "fa-hammer")
    pub icon: String,
    
    /// Description of the matronage (max 200 chars)
    pub description: String,
    
    /// Current shard pool awaiting distribution
    pub pool_balance: u64,
    
    /// When the matronage was created
    pub created_at: Timestamp,
    
    /// Identity of the founder
    pub created_by: Identity,
    
    /// When last payout occurred
    pub last_payout_at: Timestamp,
}

/// Membership tracking - links players to matronages
#[spacetimedb::table(
    name = matronage_member, 
    public,
    index(name = idx_matronage_members, btree(columns = [matronage_id]))
)]
#[derive(Clone, Debug)]
pub struct MatronageMember {
    #[primary_key]
    pub player_id: Identity,     // One matronage per player
    
    /// Which matronage this player belongs to
    pub matronage_id: u64,
    
    /// Role in the matronage
    pub role: MatronageRole,
    
    /// When the player joined
    pub joined_at: Timestamp,
}

/// Pending invitations - invite by username (works for offline players)
#[spacetimedb::table(
    name = matronage_invitation, 
    public,
    index(name = idx_invitation_target, btree(columns = [target_username])),
    index(name = idx_invitation_matronage, btree(columns = [matronage_id]))
)]
#[derive(Clone, Debug)]
pub struct MatronageInvitation {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    
    /// Username of the invited player (case-insensitive lookup)
    pub target_username: String,
    
    /// Which matronage sent the invitation
    pub matronage_id: u64,
    
    /// Who sent the invitation
    pub invited_by: Identity,
    
    /// When the invitation was sent
    pub invited_at: Timestamp,
}

/// Owed shard balances - persists after leaving/dissolution
#[spacetimedb::table(name = matronage_owed_shards, public)]
#[derive(Clone, Debug)]
pub struct MatronageOwedShards {
    #[primary_key]
    pub player_id: Identity,
    
    /// Shards owed from payout distributions
    pub owed_balance: u64,
}

/// Scheduled payout (interval-based)
#[spacetimedb::table(name = matronage_payout_schedule, scheduled(process_matronage_payout))]
#[derive(Clone, Debug)]
pub struct MatronagePayoutSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/// Initialize the matronage system (called from lib.rs init)
pub fn init_matronage_system(ctx: &ReducerContext) -> Result<(), String> {
    let schedule_table = ctx.db.matronage_payout_schedule();
    
    if schedule_table.iter().count() == 0 {
        log::info!("🏛️ Starting matronage payout schedule (every {}s).", MATRONAGE_PAYOUT_INTERVAL_SECS);
        let interval = Duration::from_secs(MATRONAGE_PAYOUT_INTERVAL_SECS);
        crate::try_insert_schedule!(
            schedule_table,
            MatronagePayoutSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(TimeDuration::from(interval)),
            },
            "Matronage payout"
        );
    } else {
        log::debug!("Matronage payout schedule already exists.");
    }
    
    log::info!("✅ Matronage system initialized");
    Ok(())
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/// Check if player is near the central ALK compound
fn is_player_at_central_compound(ctx: &ReducerContext, player_id: &Identity) -> Result<bool, String> {
    let player = ctx.db.player().identity().find(player_id)
        .ok_or("Player not found")?;
    
    let station = ctx.db.alk_station().station_id().find(&CENTRAL_COMPOUND_STATION_ID)
        .ok_or("Central compound not found")?;
    
    let dx = player.position_x - station.world_pos_x;
    let dy = player.position_y - station.world_pos_y;
    let distance_sq = dx * dx + dy * dy;
    let radius_sq = MATRONAGE_INTERACTION_RADIUS * MATRONAGE_INTERACTION_RADIUS;
    
    Ok(distance_sq <= radius_sq)
}

/// Get player's current username
fn get_player_username(ctx: &ReducerContext, player_id: &Identity) -> Option<String> {
    ctx.db.player().identity().find(player_id).map(|p| p.username.clone())
}

/// Find player by username (case-insensitive)
fn find_player_by_username(ctx: &ReducerContext, username: &str) -> Option<crate::Player> {
    let username_lower = username.to_lowercase();
    ctx.db.player().iter()
        .find(|p| p.username.to_lowercase() == username_lower)
}

/// Verify player is Pra Matron of the given matronage
fn verify_pra_matron(ctx: &ReducerContext, player_id: &Identity, matronage_id: u64) -> Result<(), String> {
    let member = ctx.db.matronage_member().player_id().find(player_id)
        .ok_or("You are not in a matronage")?;
    
    if member.matronage_id != matronage_id {
        return Err("You are not in this matronage".to_string());
    }
    
    if member.role != MatronageRole::PraMatron {
        return Err("Only the Pra Matron can perform this action".to_string());
    }
    
    Ok(())
}

// ============================================================================
// REDUCERS - Matronage Creation
// ============================================================================

/// Use a Matron's Mark to create a new Matronage at the central compound
#[spacetimedb::reducer]
pub fn use_matrons_mark(ctx: &ReducerContext, matronage_name: String) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Validate player is at central compound
    if !is_player_at_central_compound(ctx, &player_id)? {
        return Err("You must be at the ALK Central Compound to create a Matronage".to_string());
    }
    
    // Check player doesn't already belong to a matronage
    if ctx.db.matronage_member().player_id().find(&player_id).is_some() {
        return Err("You already belong to a matronage. Leave your current one first.".to_string());
    }
    
    // Validate name
    let name = matronage_name.trim().to_string();
    if name.is_empty() || name.len() > 32 {
        return Err("Matronage name must be 1-32 characters".to_string());
    }
    
    // Check name uniqueness
    if ctx.db.matronage().iter().any(|m| m.name.to_lowercase() == name.to_lowercase()) {
        return Err("A matronage with this name already exists".to_string());
    }
    
    // Find Matron's Mark in player's inventory
    let items_table = ctx.db.inventory_item();
    let defs_table = ctx.db.item_definition();
    
    let matrons_mark_def = defs_table.iter()
        .find(|d| d.name == "Matron's Mark")
        .ok_or("Matron's Mark item definition not found")?;
    
    // Find the item in player's inventory or hotbar
    let mark_item = items_table.iter()
        .filter(|item| item.item_def_id == matrons_mark_def.id)
        .find(|item| {
            matches!(&item.location, ItemLocation::Inventory(loc) if loc.owner_id == player_id) ||
            matches!(&item.location, ItemLocation::Hotbar(loc) if loc.owner_id == player_id)
        })
        .ok_or("You don't have a Matron's Mark")?;
    
    // Consume one Matron's Mark
    if mark_item.quantity > 1 {
        let mut updated = mark_item.clone();
        updated.quantity -= 1;
        items_table.instance_id().update(updated);
    } else {
        items_table.instance_id().delete(mark_item.instance_id);
    }
    
    // Create the Matronage
    let matronage = Matronage {
        id: 0, // auto_inc
        name: name.clone(),
        icon: "fa-users".to_string(), // Default icon
        description: String::new(), // Empty description by default
        pool_balance: 0,
        created_at: ctx.timestamp,
        created_by: player_id,
        last_payout_at: ctx.timestamp,
    };
    
    let inserted_matronage = ctx.db.matronage().try_insert(matronage)
        .map_err(|e| format!("Failed to create matronage: {}", e))?;
    
    // Make the creator the Pra Matron
    let member = MatronageMember {
        player_id,
        matronage_id: inserted_matronage.id,
        role: MatronageRole::PraMatron,
        joined_at: ctx.timestamp,
    };
    
    ctx.db.matronage_member().try_insert(member)
        .map_err(|e| format!("Failed to add founder as member: {}", e))?;
    
    log::info!("🏛️ Player {:?} created Matronage '{}' (id: {})", 
              player_id, inserted_matronage.name, inserted_matronage.id);
    
    Ok(())
}

// ============================================================================
// REDUCERS - Invitation Management
// ============================================================================

/// Pra Matron invites a player by username
#[spacetimedb::reducer]
pub fn invite_to_matronage(ctx: &ReducerContext, target_username: String) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Get sender's matronage
    let member = ctx.db.matronage_member().player_id().find(&player_id)
        .ok_or("You are not in a matronage")?;
    
    // Verify Pra Matron
    if member.role != MatronageRole::PraMatron {
        return Err("Only the Pra Matron can invite players".to_string());
    }
    
    let matronage_id = member.matronage_id;
    let username = target_username.trim().to_string();
    
    if username.is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    
    // Check if target player exists
    let target_player = find_player_by_username(ctx, &username)
        .ok_or("Player not found")?;
    
    // Can't invite yourself
    if target_player.identity == player_id {
        return Err("You cannot invite yourself".to_string());
    }
    
    // Check target isn't already in a matronage
    if ctx.db.matronage_member().player_id().find(&target_player.identity).is_some() {
        return Err("This player already belongs to a matronage".to_string());
    }
    
    // Check for existing pending invitation
    let has_pending = ctx.db.matronage_invitation().idx_invitation_target()
        .filter(&target_player.username.to_lowercase())
        .any(|inv| inv.matronage_id == matronage_id);
    
    if has_pending {
        return Err("This player already has a pending invitation from your matronage".to_string());
    }
    
    // Create invitation
    let invitation = MatronageInvitation {
        id: 0, // auto_inc
        target_username: target_player.username.clone(),
        matronage_id,
        invited_by: player_id,
        invited_at: ctx.timestamp,
    };
    
    ctx.db.matronage_invitation().try_insert(invitation)
        .map_err(|e| format!("Failed to create invitation: {}", e))?;
    
    let matronage = ctx.db.matronage().id().find(&matronage_id);
    log::info!("📨 Invitation sent to '{}' for matronage '{}'", 
              target_player.username, 
              matronage.map(|m| m.name).unwrap_or_default());
    
    Ok(())
}

/// Accept a pending invitation
#[spacetimedb::reducer]
pub fn accept_matronage_invitation(ctx: &ReducerContext, invitation_id: u64) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Get the invitation
    let invitation = ctx.db.matronage_invitation().id().find(&invitation_id)
        .ok_or("Invitation not found")?;
    
    // Verify this invitation is for the calling player
    let player_username = get_player_username(ctx, &player_id)
        .ok_or("Player not found")?;
    
    if invitation.target_username.to_lowercase() != player_username.to_lowercase() {
        return Err("This invitation is not for you".to_string());
    }
    
    // Check player isn't already in a matronage
    if ctx.db.matronage_member().player_id().find(&player_id).is_some() {
        return Err("You already belong to a matronage".to_string());
    }
    
    // Verify the matronage still exists
    let matronage = ctx.db.matronage().id().find(&invitation.matronage_id)
        .ok_or("This matronage no longer exists")?;
    
    // Add player as member
    let member = MatronageMember {
        player_id,
        matronage_id: invitation.matronage_id,
        role: MatronageRole::Member,
        joined_at: ctx.timestamp,
    };
    
    ctx.db.matronage_member().try_insert(member)
        .map_err(|e| format!("Failed to join matronage: {}", e))?;
    
    // Delete the invitation
    ctx.db.matronage_invitation().id().delete(invitation_id);
    
    // Also delete any other pending invitations for this player
    let other_invitations: Vec<u64> = ctx.db.matronage_invitation()
        .idx_invitation_target()
        .filter(&player_username.to_lowercase())
        .map(|inv| inv.id)
        .collect();
    
    for inv_id in other_invitations {
        ctx.db.matronage_invitation().id().delete(inv_id);
    }
    
    log::info!("✅ Player '{}' joined matronage '{}'", player_username, matronage.name);
    
    Ok(())
}

/// Decline a pending invitation
#[spacetimedb::reducer]
pub fn decline_matronage_invitation(ctx: &ReducerContext, invitation_id: u64) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Get the invitation
    let invitation = ctx.db.matronage_invitation().id().find(&invitation_id)
        .ok_or("Invitation not found")?;
    
    // Verify this invitation is for the calling player
    let player_username = get_player_username(ctx, &player_id)
        .ok_or("Player not found")?;
    
    if invitation.target_username.to_lowercase() != player_username.to_lowercase() {
        return Err("This invitation is not for you".to_string());
    }
    
    // Delete the invitation
    ctx.db.matronage_invitation().id().delete(invitation_id);
    
    log::info!("❌ Player '{}' declined matronage invitation", player_username);
    
    Ok(())
}

// ============================================================================
// REDUCERS - Membership Management
// ============================================================================

/// Leave the matronage voluntarily
#[spacetimedb::reducer]
pub fn leave_matronage(ctx: &ReducerContext) -> Result<(), String> {
    let player_id = ctx.sender;
    
    let member = ctx.db.matronage_member().player_id().find(&player_id)
        .ok_or("You are not in a matronage")?;
    
    let matronage_id = member.matronage_id;
    
    // If Pra Matron, must promote someone else first
    if member.role == MatronageRole::PraMatron {
        let other_members: Vec<_> = ctx.db.matronage_member()
            .idx_matronage_members()
            .filter(&matronage_id)
            .filter(|m| m.player_id != player_id)
            .collect();
        
        if !other_members.is_empty() {
            return Err("As Pra Matron, you must promote another member to Pra Matron before leaving, or dissolve the matronage".to_string());
        }
        
        // Last member leaving - dissolve the matronage
        return dissolve_matronage_internal(ctx, &player_id, matronage_id);
    }
    
    // Remove membership
    ctx.db.matronage_member().player_id().delete(player_id);
    
    let matronage = ctx.db.matronage().id().find(&matronage_id);
    log::info!("👋 Player {:?} left matronage '{}'", 
              player_id, 
              matronage.map(|m| m.name).unwrap_or_default());
    
    Ok(())
}

/// Pra Matron removes a member from the matronage
#[spacetimedb::reducer]
pub fn remove_from_matronage(ctx: &ReducerContext, target_player_id: Identity) -> Result<(), String> {
    let player_id = ctx.sender;
    
    let member = ctx.db.matronage_member().player_id().find(&player_id)
        .ok_or("You are not in a matronage")?;
    
    verify_pra_matron(ctx, &player_id, member.matronage_id)?;
    
    // Can't remove yourself
    if target_player_id == player_id {
        return Err("Cannot remove yourself. Use leave_matronage instead.".to_string());
    }
    
    // Find target member
    let target_member = ctx.db.matronage_member().player_id().find(&target_player_id)
        .ok_or("Target player is not in your matronage")?;
    
    if target_member.matronage_id != member.matronage_id {
        return Err("Target player is not in your matronage".to_string());
    }
    
    // Remove membership
    ctx.db.matronage_member().player_id().delete(target_player_id);
    
    log::info!("🚫 Pra Matron {:?} removed {:?} from matronage", player_id, target_player_id);
    
    Ok(())
}

/// Pra Matron promotes another member to Pra Matron (transfers leadership)
#[spacetimedb::reducer]
pub fn promote_to_pra_matron(ctx: &ReducerContext, target_player_id: Identity) -> Result<(), String> {
    let player_id = ctx.sender;
    
    let mut member = ctx.db.matronage_member().player_id().find(&player_id)
        .ok_or("You are not in a matronage")?;
    
    verify_pra_matron(ctx, &player_id, member.matronage_id)?;
    
    // Can't promote yourself
    if target_player_id == player_id {
        return Err("You are already the Pra Matron".to_string());
    }
    
    // Find target member
    let mut target_member = ctx.db.matronage_member().player_id().find(&target_player_id)
        .ok_or("Target player is not in your matronage")?;
    
    if target_member.matronage_id != member.matronage_id {
        return Err("Target player is not in your matronage".to_string());
    }
    
    // Demote current Pra Matron to Member
    member.role = MatronageRole::Member;
    ctx.db.matronage_member().player_id().update(member);
    
    // Promote target to Pra Matron
    target_member.role = MatronageRole::PraMatron;
    ctx.db.matronage_member().player_id().update(target_member);
    
    log::info!("👑 Leadership transferred from {:?} to {:?}", player_id, target_player_id);
    
    Ok(())
}

/// Pra Matron renames the matronage
#[spacetimedb::reducer]
pub fn rename_matronage(ctx: &ReducerContext, new_name: String) -> Result<(), String> {
    let player_id = ctx.sender;
    
    let member = ctx.db.matronage_member().player_id().find(&player_id)
        .ok_or("You are not in a matronage")?;
    
    verify_pra_matron(ctx, &player_id, member.matronage_id)?;
    
    let name = new_name.trim().to_string();
    if name.is_empty() || name.len() > 32 {
        return Err("Matronage name must be 1-32 characters".to_string());
    }
    
    // Check name uniqueness (excluding current matronage)
    if ctx.db.matronage().iter()
        .any(|m| m.id != member.matronage_id && m.name.to_lowercase() == name.to_lowercase()) 
    {
        return Err("A matronage with this name already exists".to_string());
    }
    
    let mut matronage = ctx.db.matronage().id().find(&member.matronage_id)
        .ok_or("Matronage not found")?;
    
    let old_name = matronage.name.clone();
    matronage.name = name.clone();
    ctx.db.matronage().id().update(matronage);
    
    log::info!("📝 Matronage renamed from '{}' to '{}'", old_name, name);

    Ok(())
}

/// Allowed FontAwesome icons for matronages
const ALLOWED_ICONS: &[&str] = &[
    "fa-users", "fa-shield", "fa-hammer", "fa-gem", "fa-crown",
    "fa-fire", "fa-bolt", "fa-star", "fa-skull", "fa-dragon",
    "fa-sword", "fa-axe", "fa-bow-arrow", "fa-helmet-battle", "fa-castle",
    "fa-coins", "fa-flask", "fa-hand-fist", "fa-mountain", "fa-tree",
    "fa-wolf", "fa-raven", "fa-compass", "fa-anchor", "fa-scroll",
];

/// Pra Matron updates the matronage icon
#[spacetimedb::reducer]
pub fn update_matronage_icon(ctx: &ReducerContext, new_icon: String) -> Result<(), String> {
    let player_id = ctx.sender;

    let member = ctx.db.matronage_member().player_id().find(&player_id)
        .ok_or("You are not in a matronage")?;

    verify_pra_matron(ctx, &player_id, member.matronage_id)?;

    let icon = new_icon.trim().to_string();
    
    // Validate icon is in allowed list
    if !ALLOWED_ICONS.contains(&icon.as_str()) {
        return Err("Invalid icon selection".to_string());
    }

    let mut matronage = ctx.db.matronage().id().find(&member.matronage_id)
        .ok_or("Matronage not found")?;

    matronage.icon = icon.clone();
    ctx.db.matronage().id().update(matronage);

    log::info!("🎨 Matronage {} icon updated to '{}'", member.matronage_id, icon);

    Ok(())
}

/// Pra Matron updates the matronage description
#[spacetimedb::reducer]
pub fn update_matronage_description(ctx: &ReducerContext, new_description: String) -> Result<(), String> {
    let player_id = ctx.sender;

    let member = ctx.db.matronage_member().player_id().find(&player_id)
        .ok_or("You are not in a matronage")?;

    verify_pra_matron(ctx, &player_id, member.matronage_id)?;

    let description = new_description.trim().to_string();
    
    // Limit description length
    if description.len() > 200 {
        return Err("Description must be 200 characters or less".to_string());
    }

    let mut matronage = ctx.db.matronage().id().find(&member.matronage_id)
        .ok_or("Matronage not found")?;

    matronage.description = description.clone();
    ctx.db.matronage().id().update(matronage);

    log::info!("📝 Matronage {} description updated", member.matronage_id);

    Ok(())
}

/// Pra Matron dissolves the matronage (at central compound)
#[spacetimedb::reducer]
pub fn dissolve_matronage(ctx: &ReducerContext) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Must be at central compound
    if !is_player_at_central_compound(ctx, &player_id)? {
        return Err("You must be at the ALK Central Compound to dissolve the matronage".to_string());
    }
    
    let member = ctx.db.matronage_member().player_id().find(&player_id)
        .ok_or("You are not in a matronage")?;
    
    verify_pra_matron(ctx, &player_id, member.matronage_id)?;
    
    dissolve_matronage_internal(ctx, &player_id, member.matronage_id)
}

/// Internal function to dissolve a matronage
fn dissolve_matronage_internal(ctx: &ReducerContext, _initiator: &Identity, matronage_id: u64) -> Result<(), String> {
    let matronage = ctx.db.matronage().id().find(&matronage_id)
        .ok_or("Matronage not found")?;
    
    // Collect all members
    let members: Vec<MatronageMember> = ctx.db.matronage_member()
        .idx_matronage_members()
        .filter(&matronage_id)
        .collect();
    
    // Final payout of remaining pool
    if matronage.pool_balance > 0 && !members.is_empty() {
        let payout_per_member = matronage.pool_balance / members.len() as u64;
        
        for member in &members {
            let mut owed = ctx.db.matronage_owed_shards().player_id().find(&member.player_id)
                .unwrap_or(MatronageOwedShards {
                    player_id: member.player_id,
                    owed_balance: 0,
                });
            
            owed.owed_balance += payout_per_member;
            
            if ctx.db.matronage_owed_shards().player_id().find(&member.player_id).is_some() {
                ctx.db.matronage_owed_shards().player_id().update(owed);
            } else {
                let _ = ctx.db.matronage_owed_shards().try_insert(owed);
            }
        }
        
        log::info!("💰 Final payout of {} shards ({} each) to {} members", 
                  matronage.pool_balance, payout_per_member, members.len());
    }
    
    // Remove all members
    for member in members {
        ctx.db.matronage_member().player_id().delete(member.player_id);
    }
    
    // Delete all pending invitations for this matronage
    let invitations: Vec<u64> = ctx.db.matronage_invitation()
        .idx_invitation_matronage()
        .filter(&matronage_id)
        .map(|inv| inv.id)
        .collect();
    
    for inv_id in invitations {
        ctx.db.matronage_invitation().id().delete(inv_id);
    }
    
    // Delete the matronage
    let name = matronage.name.clone();
    ctx.db.matronage().id().delete(matronage_id);
    
    log::info!("🏚️ Matronage '{}' (id: {}) has been dissolved", name, matronage_id);
    
    Ok(())
}

// ============================================================================
// REDUCERS - Shard Operations
// ============================================================================

/// Deposit shards to the matronage pool (called from ALK delivery)
pub fn deposit_to_matronage_pool(ctx: &ReducerContext, player_id: &Identity, amount: u64) -> Result<(), String> {
    let member = ctx.db.matronage_member().player_id().find(player_id)
        .ok_or("Player is not in a matronage")?;
    
    let mut matronage = ctx.db.matronage().id().find(&member.matronage_id)
        .ok_or("Matronage not found")?;
    
    matronage.pool_balance += amount;
    ctx.db.matronage().id().update(matronage);
    
    log::debug!("💵 {} shards deposited to matronage pool by {:?}", amount, player_id);
    
    Ok(())
}

/// Withdraw owed shards at the central compound
#[spacetimedb::reducer]
pub fn withdraw_matronage_shards(ctx: &ReducerContext) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Must be at central compound
    if !is_player_at_central_compound(ctx, &player_id)? {
        return Err("You must be at the ALK Central Compound to withdraw shards".to_string());
    }
    
    let owed = ctx.db.matronage_owed_shards().player_id().find(&player_id)
        .ok_or("You have no shards to withdraw")?;
    
    if owed.owed_balance == 0 {
        return Err("You have no shards to withdraw".to_string());
    }
    
    let amount_to_withdraw = owed.owed_balance;
    
    // Find Memory Shard definition
    let shard_def = ctx.db.item_definition().iter()
        .find(|d| d.name == "Memory Shard")
        .ok_or("Memory Shard item definition not found")?;
    
    // Give shards to player
    match crate::dropped_item::give_item_to_player_or_drop(ctx, player_id, shard_def.id, amount_to_withdraw as u32) {
        Ok(added_to_inv) => {
            if added_to_inv {
                log::info!("💎 Added {} Memory Shards from matronage owed balance to player {:?} inventory", 
                          amount_to_withdraw, player_id);
            } else {
                log::info!("💎 Dropped {} Memory Shards from matronage owed balance at player {:?} feet", 
                          amount_to_withdraw, player_id);
            }
        }
        Err(e) => {
            log::error!("Failed to give Memory Shards to player: {}", e);
            return Err(format!("Failed to withdraw shards: {}", e));
        }
    }
    
    // Clear owed balance
    let mut updated_owed = owed;
    updated_owed.owed_balance = 0;
    ctx.db.matronage_owed_shards().player_id().update(updated_owed);
    
    Ok(())
}

// ============================================================================
// SCHEDULED REDUCER - Payout Processing
// ============================================================================

/// Scheduled reducer that processes matronage payouts
#[spacetimedb::reducer]
pub fn process_matronage_payout(ctx: &ReducerContext, _args: MatronagePayoutSchedule) -> Result<(), String> {
    // Security check - only scheduler can run this
    if ctx.sender != ctx.identity() {
        return Err("Matronage payout can only be run by scheduler".to_string());
    }
    
    // Get all matronages with non-zero pools
    let matronages_to_process: Vec<Matronage> = ctx.db.matronage()
        .iter()
        .filter(|m| m.pool_balance > 0)
        .collect();
    
    for matronage in matronages_to_process {
        let _ = process_single_matronage_payout(ctx, &matronage);
    }
    
    Ok(())
}

/// Process payout for a single matronage
fn process_single_matronage_payout(ctx: &ReducerContext, matronage: &Matronage) -> Result<(), String> {
    // Get all members
    let members: Vec<MatronageMember> = ctx.db.matronage_member()
        .idx_matronage_members()
        .filter(&matronage.id)
        .collect();
    
    if members.is_empty() {
        return Ok(()); // No members to pay
    }
    
    let pool = matronage.pool_balance;
    let member_count = members.len() as u64;
    let payout_per_member = pool / member_count;
    
    if payout_per_member == 0 {
        return Ok(()); // Pool too small to distribute
    }
    
    // Calculate actual distributed amount (fractional remainder stays in pool)
    let distributed = payout_per_member * member_count;
    
    // Update each member's owed balance
    for member in &members {
        let mut owed = ctx.db.matronage_owed_shards().player_id().find(&member.player_id)
            .unwrap_or(MatronageOwedShards {
                player_id: member.player_id,
                owed_balance: 0,
            });
        
        owed.owed_balance += payout_per_member;
        
        if ctx.db.matronage_owed_shards().player_id().find(&member.player_id).is_some() {
            ctx.db.matronage_owed_shards().player_id().update(owed);
        } else {
            let _ = ctx.db.matronage_owed_shards().try_insert(owed);
        }
    }
    
    // Update matronage pool (remainder stays)
    let mut updated_matronage = matronage.clone();
    updated_matronage.pool_balance = pool - distributed;
    updated_matronage.last_payout_at = ctx.timestamp;
    ctx.db.matronage().id().update(updated_matronage);
    
    log::info!("💰 Matronage '{}' payout: {} total, {} per member ({} members), {} remainder",
              matronage.name, distributed, payout_per_member, member_count, pool - distributed);
    
    Ok(())
}
