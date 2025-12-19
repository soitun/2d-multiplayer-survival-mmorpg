/******************************************************************************
 *                                                                            *
 * Defines the HomesteadHearth entity, its data structure, and associated    *
 * logic. Handles building privilege management, restricted inventory        *
 * (wood, stone, metal, cloth, fiber, coal), and applies cozy effect to       *
 * players with building privilege within radius.                            *
 * Uses generic handlers from inventory_management.rs where applicable.      *
 *                                                                            *
 ******************************************************************************/

use spacetimedb::{Identity, ReducerContext, SpacetimeType, Table, Timestamp, log, TimeDuration, ScheduleAt};
use std::collections::HashSet;
use std::time::Duration;

// --- Constants --- 
// Hearth visual is 125x125 pixels, drawn with: drawY = posY - drawHeight - HEARTH_RENDER_Y_OFFSET
// Visual top: posY - 125 - 10 = posY - 135
// Visual bottom: posY - 135 + 125 = posY - 10
// Visual center Y: posY - 135 + 62.5 = posY - 72.5
// Collision should match the visual center and size
pub(crate) const HEARTH_COLLISION_RADIUS: f32 = 55.0; // Half of 110, slightly smaller than visual 125x125 for gameplay
pub(crate) const HEARTH_COLLISION_Y_OFFSET: f32 = -72.5; // Offset upward to match exact visual center
pub(crate) const PLAYER_HEARTH_COLLISION_DISTANCE_SQUARED: f32 = 
    (super::PLAYER_RADIUS + HEARTH_COLLISION_RADIUS) * (super::PLAYER_RADIUS + HEARTH_COLLISION_RADIUS);
pub(crate) const HEARTH_HEARTH_COLLISION_DISTANCE_SQUARED: f32 = 
    (HEARTH_COLLISION_RADIUS * 2.0) * (HEARTH_COLLISION_RADIUS * 2.0);

// --- Placement constants ---
// Increased from 96.0 to 200.0 to make placement easier (player collision was making it hard)
pub(crate) const HEARTH_PLACEMENT_MAX_DISTANCE: f32 = 200.0;
pub(crate) const HEARTH_PLACEMENT_MAX_DISTANCE_SQUARED: f32 = HEARTH_PLACEMENT_MAX_DISTANCE * HEARTH_PLACEMENT_MAX_DISTANCE;

// --- Interaction constants ---
pub(crate) const PLAYER_HEARTH_INTERACTION_DISTANCE: f32 = 96.0;
pub(crate) const PLAYER_HEARTH_INTERACTION_DISTANCE_SQUARED: f32 = 
    PLAYER_HEARTH_INTERACTION_DISTANCE * PLAYER_HEARTH_INTERACTION_DISTANCE;

// --- Building privilege radius ---
pub(crate) const BUILDING_PRIVILEGE_RADIUS: f32 = 1000.0; // Large radius for building area (doubled from 500px)
pub(crate) const BUILDING_PRIVILEGE_RADIUS_SQUARED: f32 = BUILDING_PRIVILEGE_RADIUS * BUILDING_PRIVILEGE_RADIUS;

// --- Cozy effect radius (for players with building privilege) ---
pub(crate) const HEARTH_COZY_RADIUS: f32 = 400.0;
pub(crate) const HEARTH_COZY_RADIUS_SQUARED: f32 = HEARTH_COZY_RADIUS * HEARTH_COZY_RADIUS;

// --- Inventory constants ---
pub const NUM_HEARTH_SLOTS: usize = 20; // Generous inventory for building materials

// --- Upkeep constants ---
pub const DEFAULT_UPKEEP_INTERVAL_SECONDS: u64 = 3600; // 1 hour default upkeep interval
pub const UPKEEP_PROCESS_INTERVAL_SECONDS: u64 = 60; // Check every minute for upkeep processing

// --- Health constants ---
pub const HEARTH_INITIAL_HEALTH: f32 = 1000.0;
pub const HEARTH_MAX_HEALTH: f32 = 1000.0;

// --- Attack/Damage constants ---
// Note: Damage is determined by weapon type through the combat system
// No fixed damage constant needed - weapons define their own damage via pvp_damage_min/max

// --- Import Table Traits and Concrete Types ---
use crate::player as PlayerTableTrait;
use crate::Player;
use crate::items::{
    InventoryItem, ItemDefinition, ItemCategory,
    inventory_item as InventoryItemTableTrait, 
    item_definition as ItemDefinitionTableTrait,
};
use crate::inventory_management::{self, ItemContainer};
use crate::homestead_hearth::homestead_hearth as HomesteadHearthTableTrait;
use crate::building::{foundation_cell, wall_cell}; // ADDED: For foundation and wall table access
use crate::environment::calculate_chunk_index;
use crate::models::{ContainerType, ItemLocation, ContainerLocationData};
use crate::player_inventory::{find_first_empty_player_slot, move_item_to_inventory, move_item_to_hotbar, get_player_item};
use crate::active_effects::{EffectType, ActiveConsumableEffect, active_consumable_effect as ActiveConsumableEffectTableTrait};
use crate::utils::get_distance_squared;
use crate::dropped_item::create_dropped_item_entity;

/// --- Homestead Hearth Data Structure ---
/// Represents a homestead hearth in the game world with position, owner,
/// inventory slots for building materials, and building privilege management.
#[spacetimedb::table(name = homestead_hearth, public)]
#[derive(Clone)]
pub struct HomesteadHearth {
    #[primary_key]
    #[auto_inc]
    pub id: u32,

    pub pos_x: f32,
    pub pos_y: f32,
    #[index(btree)]
    pub chunk_index: u32,

    pub placed_by: Identity, // Who placed this hearth
    pub placed_at: Timestamp,

    // --- Inventory Slots (0-19) for building materials only --- 
    pub slot_instance_id_0: Option<u64>,
    pub slot_def_id_0: Option<u64>,
    pub slot_instance_id_1: Option<u64>,
    pub slot_def_id_1: Option<u64>,
    pub slot_instance_id_2: Option<u64>,
    pub slot_def_id_2: Option<u64>,
    pub slot_instance_id_3: Option<u64>,
    pub slot_def_id_3: Option<u64>,
    pub slot_instance_id_4: Option<u64>,
    pub slot_def_id_4: Option<u64>,
    pub slot_instance_id_5: Option<u64>,
    pub slot_def_id_5: Option<u64>,
    pub slot_instance_id_6: Option<u64>,
    pub slot_def_id_6: Option<u64>,
    pub slot_instance_id_7: Option<u64>,
    pub slot_def_id_7: Option<u64>,
    pub slot_instance_id_8: Option<u64>,
    pub slot_def_id_8: Option<u64>,
    pub slot_instance_id_9: Option<u64>,
    pub slot_def_id_9: Option<u64>,
    pub slot_instance_id_10: Option<u64>,
    pub slot_def_id_10: Option<u64>,
    pub slot_instance_id_11: Option<u64>,
    pub slot_def_id_11: Option<u64>,
    pub slot_instance_id_12: Option<u64>,
    pub slot_def_id_12: Option<u64>,
    pub slot_instance_id_13: Option<u64>,
    pub slot_def_id_13: Option<u64>,
    pub slot_instance_id_14: Option<u64>,
    pub slot_def_id_14: Option<u64>,
    pub slot_instance_id_15: Option<u64>,
    pub slot_def_id_15: Option<u64>,
    pub slot_instance_id_16: Option<u64>,
    pub slot_def_id_16: Option<u64>,
    pub slot_instance_id_17: Option<u64>,
    pub slot_def_id_17: Option<u64>,
    pub slot_instance_id_18: Option<u64>,
    pub slot_def_id_18: Option<u64>,
    pub slot_instance_id_19: Option<u64>,
    pub slot_def_id_19: Option<u64>,

    pub health: f32,
    pub max_health: f32,
    pub is_destroyed: bool,
    pub destroyed_at: Option<Timestamp>,
    pub last_hit_time: Option<Timestamp>,
    pub last_damaged_by: Option<Identity>,
    
    // --- Upkeep tracking ---
    pub last_upkeep_time: Option<Timestamp>, // When upkeep was last processed
    pub upkeep_interval_seconds: u64, // How often upkeep is processed (default: 3600 = 1 hour)
}

/// Checks if an item is allowed in the hearth inventory
/// Only items with Material category are allowed
fn is_item_allowed(item_def: &ItemDefinition) -> bool {
    item_def.category == ItemCategory::Material
}

/// Validates that a player is within interaction distance of a hearth
fn validate_hearth_interaction(ctx: &ReducerContext, hearth_id: u32) -> Result<(Player, HomesteadHearth), String> {
    let sender_id = ctx.sender;
    let players = ctx.db.player();
    let hearths = ctx.db.homestead_hearth();

    let player = players.identity().find(&sender_id)
        .ok_or_else(|| "Player not found".to_string())?;

    if player.is_dead {
        return Err("Cannot interact with hearth while dead.".to_string());
    }

    let hearth = hearths.id().find(&hearth_id)
        .ok_or_else(|| format!("Hearth {} not found", hearth_id))?;

    if hearth.is_destroyed {
        return Err("Cannot interact with destroyed hearth.".to_string());
    }

    // Check interaction distance (accounting for visual Y offset)
    let dx = player.position_x - hearth.pos_x;
    let dy = player.position_y - (hearth.pos_y + HEARTH_COLLISION_Y_OFFSET);
    let distance_squared = dx * dx + dy * dy;

    if distance_squared > PLAYER_HEARTH_INTERACTION_DISTANCE_SQUARED {
        return Err("Too far from hearth.".to_string());
    }

    Ok((player, hearth))
}

/// Checks if a player has building privilege from any hearth
pub fn player_has_building_privilege(ctx: &ReducerContext, player_id: Identity) -> bool {
    ctx.db.active_consumable_effect().iter()
        .any(|effect| effect.player_id == player_id && effect.effect_type == EffectType::BuildingPrivilege)
}

/// Grants building privilege to a player (creates or refreshes the effect)
pub fn grant_building_privilege(ctx: &ReducerContext, player_id: Identity) -> Result<(), String> {
    let current_time = ctx.timestamp;
    // Set a very far future time (1 year from now) - effectively permanent until revoked
    let very_far_future = current_time + TimeDuration::from_micros(365 * 24 * 60 * 60 * 1_000_000i64);
    
    // Remove any existing building privilege effect first
    remove_building_privilege(ctx, player_id);
    
    let privilege_effect = ActiveConsumableEffect {
        effect_id: 0, // auto_inc
        player_id,
        target_player_id: None,
        item_def_id: 0, // Not from an item
        consuming_item_instance_id: None,
        started_at: current_time,
        ends_at: very_far_future, // Effectively permanent
        total_amount: None,
        amount_applied_so_far: None,
        effect_type: EffectType::BuildingPrivilege,
        tick_interval_micros: 1_000_000, // 1 second ticks (not really used)
        next_tick_at: current_time + TimeDuration::from_micros(1_000_000),
    };
    
    match ctx.db.active_consumable_effect().try_insert(privilege_effect) {
        Ok(inserted_effect) => {
            log::info!("Granted building privilege {} to player {:?}", inserted_effect.effect_id, player_id);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to grant building privilege to player {:?}: {:?}", player_id, e);
            Err("Failed to grant building privilege".to_string())
        }
    }
}

/// Removes building privilege from a player
pub fn remove_building_privilege(ctx: &ReducerContext, player_id: Identity) {
    let mut effects_to_remove = Vec::new();
    for effect in ctx.db.active_consumable_effect().iter() {
        if effect.player_id == player_id && effect.effect_type == EffectType::BuildingPrivilege {
            effects_to_remove.push(effect.effect_id);
        }
    }
    
    for effect_id in effects_to_remove {
        ctx.db.active_consumable_effect().effect_id().delete(&effect_id);
        log::info!("Removed building privilege {} from player {:?}", effect_id, player_id);
    }
}

/// Updates cozy effect for players with building privilege near hearths
/// Note: This is now redundant since should_player_be_cozy checks hearths,
/// but kept for explicit hearth-specific logic if needed in the future.
pub fn update_hearth_cozy_effects(ctx: &ReducerContext) -> Result<(), String> {
    use crate::active_effects::update_player_cozy_status;
    
    // For each player with building privilege, update their cozy status
    // update_player_cozy_status will check hearth proximity via should_player_be_cozy
    let players_with_privilege: Vec<(Identity, Player)> = ctx.db.active_consumable_effect()
        .iter()
        .filter(|effect| effect.effect_type == EffectType::BuildingPrivilege)
        .filter_map(|effect| {
            ctx.db.player().identity().find(&effect.player_id)
                .map(|player| (effect.player_id, player))
        })
        .collect();
    
    for (player_id, player) in players_with_privilege {
        // This will add cozy if near hearth, remove if not
        update_player_cozy_status(ctx, player_id, player.position_x, player.position_y)?;
    }
    
    Ok(())
}

// --- Upkeep Calculation ---

/// Structure to hold upkeep costs
#[derive(Clone, Debug)]
pub struct UpkeepCosts {
    pub wood: u32,
    pub stone: u32,
    pub metal: u32,
}

/// Find the foundation cell that a hearth is placed on
pub(crate) fn find_hearth_foundation(
    ctx: &ReducerContext,
    hearth: &HomesteadHearth,
) -> Option<crate::building::FoundationCell> {
    use crate::building::FOUNDATION_TILE_SIZE_PX;
    let foundations = ctx.db.foundation_cell();
    
    // Convert hearth world position to foundation cell coordinates
    let foundation_cell_x = (hearth.pos_x / FOUNDATION_TILE_SIZE_PX as f32).floor() as i32;
    let foundation_cell_y = (hearth.pos_y / FOUNDATION_TILE_SIZE_PX as f32).floor() as i32;
    
    // Find foundation at this cell
    for foundation in foundations.idx_cell_coords().filter((foundation_cell_x, foundation_cell_y)) {
        if !foundation.is_destroyed {
            return Some(foundation);
        }
    }
    
    None
}

/// Find all foundations connected to a starting foundation (flood-fill algorithm)
/// Connected means adjacent (cardinal directions) or sharing edges
pub(crate) fn find_connected_foundations(
    ctx: &ReducerContext,
    start_foundation: &crate::building::FoundationCell,
) -> Vec<crate::building::FoundationCell> {
    use crate::building::FOUNDATION_TILE_SIZE_PX;
    let foundations = ctx.db.foundation_cell();
    let mut visited = std::collections::HashSet::new();
    let mut queue = std::collections::VecDeque::new();
    let mut connected = Vec::new();
    
    queue.push_back((start_foundation.cell_x, start_foundation.cell_y));
    visited.insert((start_foundation.cell_x, start_foundation.cell_y));
    connected.push(start_foundation.clone());
    
    while let Some((cell_x, cell_y)) = queue.pop_front() {
        // Check all 4 cardinal directions
        let neighbors = [
            (cell_x, cell_y - 1), // North
            (cell_x + 1, cell_y), // East
            (cell_x, cell_y + 1), // South
            (cell_x - 1, cell_y), // West
        ];
        
        for (nx, ny) in neighbors.iter() {
            if visited.contains(&(*nx, *ny)) {
                continue;
            }
            
            // Check if there's a foundation at this neighbor
            for foundation in foundations.idx_cell_coords().filter((*nx, *ny)) {
                if !foundation.is_destroyed {
                    visited.insert((*nx, *ny));
                    queue.push_back((*nx, *ny));
                    connected.push(foundation.clone());
                    break;
                }
            }
        }
    }
    
    connected
}

/// Calculate estimated decay time in hours for connected buildings
/// Always calculates decay time based on building health, regardless of protection status
pub fn calculate_estimated_decay_time(
    ctx: &ReducerContext,
    hearth: &HomesteadHearth,
) -> Option<f32> {
    use crate::building::{FoundationCell, WallCell};
    use crate::building_decay::{get_decay_damage_per_interval, DECAY_PROCESS_INTERVAL_SECONDS};
    
    // Find the foundation the hearth is on
    let hearth_foundation = match find_hearth_foundation(ctx, hearth) {
        Some(foundation) => foundation,
        None => return None, // No foundation = no buildings to decay
    };
    
    // Find all connected foundations
    let connected_foundations = find_connected_foundations(ctx, &hearth_foundation);
    
    // Calculate decay rates per hour (convert from per-interval to per-hour)
    // Decay processes every 5 minutes (300 seconds), so multiply by 12 to get per-hour rate
    let intervals_per_hour = 3600.0 / (DECAY_PROCESS_INTERVAL_SECONDS as f32);
    
    let mut shortest_decay_time: Option<f32> = None;
    
    // Check foundations
    for foundation in &connected_foundations {
        if foundation.is_destroyed || foundation.tier == 0 {
            continue; // Twig doesn't decay
        }
        
        let decay_per_interval = get_decay_damage_per_interval(foundation.tier);
        if decay_per_interval <= 0.0 {
            continue;
        }
        
        let decay_per_hour = decay_per_interval * intervals_per_hour;
        let hours_until_decay = foundation.health / decay_per_hour;
        
        shortest_decay_time = Some(
            shortest_decay_time
                .map(|t| t.min(hours_until_decay))
                .unwrap_or(hours_until_decay)
        );
    }
    
    // Check walls
    let walls = ctx.db.wall_cell();
    let foundation_cells: std::collections::HashSet<(i32, i32)> = connected_foundations
        .iter()
        .map(|f| (f.cell_x, f.cell_y))
        .collect();
    
    for wall in walls.iter() {
        if wall.is_destroyed || wall.tier == 0 {
            continue;
        }
        
        // Check if wall is on a connected foundation
        if !foundation_cells.contains(&(wall.cell_x, wall.cell_y)) {
            continue;
        }
        
        let decay_per_interval = get_decay_damage_per_interval(wall.tier);
        if decay_per_interval <= 0.0 {
            continue;
        }
        
        let decay_per_hour = decay_per_interval * intervals_per_hour;
        let hours_until_decay = wall.health / decay_per_hour;
        
        shortest_decay_time = Some(
            shortest_decay_time
                .map(|t| t.min(hours_until_decay))
                .unwrap_or(hours_until_decay)
        );
    }
    
    shortest_decay_time
}

/// Calculate upkeep costs for all buildings connected to a hearth
pub fn calculate_upkeep_costs(
    ctx: &ReducerContext,
    hearth: &HomesteadHearth,
) -> UpkeepCosts {
    use crate::building::{FoundationCell, WallCell};
    use crate::models::BuildingTier;
    
    let mut costs = UpkeepCosts {
        wood: 0,
        stone: 0,
        metal: 0,
    };
    
    // Find the foundation the hearth is on
    let hearth_foundation = match find_hearth_foundation(ctx, hearth) {
        Some(foundation) => foundation,
        None => return costs, // No foundation = no upkeep
    };
    
    // Find all connected foundations
    let connected_foundations = find_connected_foundations(ctx, &hearth_foundation);
    
    // Calculate costs for foundations
    for foundation in &connected_foundations {
        if foundation.is_destroyed {
            continue;
        }
        
        // Only wood, stone, and metal tiers require minimal upkeep (not twig)
        // Foundation upkeep is minimal since it's purely aesthetic - main cost is walls
        match foundation.tier {
            1 => { // Wood tier
                // Full foundation = 1.0, triangle = 0.5
                let multiplier = if foundation.shape == 1 { 1.0 } else { 0.5 };
                costs.wood += (1.0 * multiplier) as u32; // 1 wood per hour for full, 0.5 for triangle (minimal)
            }
            2 => { // Stone tier
                let multiplier = if foundation.shape == 1 { 1.0 } else { 0.5 };
                costs.stone += (1.0 * multiplier) as u32; // 1 stone per hour (minimal)
            }
            3 => { // Metal tier
                let multiplier = if foundation.shape == 1 { 1.0 } else { 0.5 };
                costs.metal += (1.0 * multiplier) as u32; // 1 metal per hour (minimal)
            }
            _ => {} // Twig tier (0) has no upkeep
        }
    }
    
    // Calculate costs for walls on connected foundations
    let walls = ctx.db.wall_cell();
    let foundation_cells: std::collections::HashSet<(i32, i32)> = connected_foundations
        .iter()
        .map(|f| (f.cell_x, f.cell_y))
        .collect();
    
    for wall in walls.iter() {
        if wall.is_destroyed {
            continue;
        }
        
        // Check if wall is on a connected foundation
        if !foundation_cells.contains(&(wall.cell_x, wall.cell_y)) {
            continue;
        }
        
        match wall.tier {
            1 => { // Wood tier
                costs.wood += 5; // 5 wood per hour per wall
            }
            2 => { // Stone tier
                costs.stone += 5; // 5 stone per hour per wall
            }
            3 => { // Metal tier
                costs.metal += 3; // 3 metal per hour per wall
            }
            _ => {} // Twig tier has no upkeep
        }
    }
    
    // TODO: Add door upkeep when doors are implemented
    // Doors would have similar costs but lower (maybe 3 wood/stone, 2 metal)
    
    costs
}

/// Get resource counts from hearth inventory
pub(crate) fn get_hearth_resources(
    ctx: &ReducerContext,
    hearth: &HomesteadHearth,
) -> (u32, u32, u32) { // Returns (wood, stone, metal)
    let inventory = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    
    let mut wood = 0;
    let mut stone = 0;
    let mut metal = 0;
    
    // Find item definitions (store IDs, not the full definitions)
    let wood_def_id = item_defs.iter().find(|def| def.name == "Wood").map(|def| def.id);
    let stone_def_id = item_defs.iter().find(|def| def.name == "Stone").map(|def| def.id);
    let metal_def_id = item_defs.iter().find(|def| def.name == "Metal Fragments").map(|def| def.id);
    
    // Check all slots
    for slot_index in 0..NUM_HEARTH_SLOTS {
        if let Some(instance_id) = hearth.get_slot_instance_id(slot_index as u8) {
            if let Some(item) = inventory.instance_id().find(instance_id) {
                if let Some(wood_id) = wood_def_id {
                    if item.item_def_id == wood_id {
                        wood += item.quantity;
                    }
                }
                if let Some(stone_id) = stone_def_id {
                    if item.item_def_id == stone_id {
                        stone += item.quantity;
                    }
                }
                if let Some(metal_id) = metal_def_id {
                    if item.item_def_id == metal_id {
                        metal += item.quantity;
                    }
                }
            }
        }
    }
    
    (wood, stone, metal)
}

/// Consume upkeep resources from hearth inventory
fn consume_upkeep_resources(
    ctx: &ReducerContext,
    hearth: &mut HomesteadHearth,
    costs: &UpkeepCosts,
) -> bool { // Returns true if all resources were consumed successfully
    let inventory = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    
    // Find item definitions
    let wood_def = item_defs.iter().find(|def| def.name == "Wood")
        .ok_or_else(|| "Wood item definition not found".to_string());
    let stone_def = item_defs.iter().find(|def| def.name == "Stone")
        .ok_or_else(|| "Stone item definition not found".to_string());
    let metal_def = item_defs.iter().find(|def| def.name == "Metal Fragments")
        .ok_or_else(|| "Metal Fragments item definition not found".to_string());
    
    let wood_def_id = match wood_def {
        Ok(def) => def.id,
        Err(_) => return false,
    };
    let stone_def_id = match stone_def {
        Ok(def) => def.id,
        Err(_) => return false,
    };
    let metal_def_id = match metal_def {
        Ok(def) => def.id,
        Err(_) => return false,
    };
    
    // Helper to consume a resource type
    let mut consume_resource = |def_id: u64, mut needed: u32| -> bool {
        if needed == 0 {
            return true;
        }
        
        // Find all items of this type in hearth inventory
        let mut items_to_consume: Vec<_> = Vec::new();
        for slot_index in 0..NUM_HEARTH_SLOTS {
            if let Some(instance_id) = hearth.get_slot_instance_id(slot_index as u8) {
                if let Some(item) = inventory.instance_id().find(instance_id) {
                    if item.item_def_id == def_id {
                        items_to_consume.push((slot_index, instance_id, item.clone()));
                    }
                }
            }
        }
        
        // Consume from items
        for (slot_index, instance_id, mut item) in items_to_consume {
            if needed == 0 {
                break;
            }
            
            let consume_amount = needed.min(item.quantity);
            item.quantity -= consume_amount;
            needed -= consume_amount;
            
            if item.quantity == 0 {
                // Delete item
                inventory.instance_id().delete(instance_id);
                hearth.set_slot(slot_index as u8, None, None);
            } else {
                // Update item
                inventory.instance_id().update(item.clone());
            }
        }
        
        needed == 0 // Return true if we consumed all needed
    };
    
    // Consume each resource type
    let wood_ok = consume_resource(wood_def_id, costs.wood);
    let stone_ok = consume_resource(stone_def_id, costs.stone);
    let metal_ok = consume_resource(metal_def_id, costs.metal);
    
    wood_ok && stone_ok && metal_ok
}

// --- Building Privilege Distance Check Schedule ---
pub(crate) const BUILDING_PRIVILEGE_CHECK_INTERVAL_SECS: u64 = 2; // Check every 2 seconds

#[spacetimedb::table(name = building_privilege_check_schedule, scheduled(check_building_privilege_distance))]
#[derive(Clone)]
pub struct BuildingPrivilegeCheckSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Initialize the building privilege distance check schedule
pub fn init_building_privilege_check_schedule(ctx: &ReducerContext) -> Result<(), String> {
    let schedule_table = ctx.db.building_privilege_check_schedule();
    if schedule_table.iter().count() == 0 {
        log::info!(
            "Starting building privilege distance check schedule (every {}s).",
            BUILDING_PRIVILEGE_CHECK_INTERVAL_SECS
        );
        let interval = Duration::from_secs(BUILDING_PRIVILEGE_CHECK_INTERVAL_SECS);
        crate::try_insert_schedule!(
            schedule_table,
            BuildingPrivilegeCheckSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(TimeDuration::from(interval)),
            },
            "Building privilege check"
        );
    } else {
        log::debug!("Building privilege check schedule already exists.");
    }
    Ok(())
}

/// Scheduled reducer to check building privilege status (for visual effects only)
/// NOTE: Building privilege is now PERSISTENT - it is never removed.
/// This reducer is kept for potential future use (e.g., visual indicators),
/// but privilege removal has been disabled to prevent players from being locked out.
#[spacetimedb::reducer]
pub fn check_building_privilege_distance(ctx: &ReducerContext, _schedule: BuildingPrivilegeCheckSchedule) -> Result<(), String> {
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("check_building_privilege_distance may only be called by the scheduler.".to_string());
    }

    // Building privilege is now persistent - once granted, it stays forever.
    // The privilege check in building reducers verifies both:
    // 1. Player has building privilege (persistent flag)
    // 2. Player is within range of a hearth (for actual usage)
    // 
    // This ensures players never lose access to their buildings due to bugs
    // or temporary distance issues, while still enforcing range restrictions.
    
    // This reducer is kept for potential future use (e.g., updating visual effects
    // based on proximity), but no longer removes privilege.
    
    Ok(())
}

// --- Upkeep Processing Schedule ---

#[spacetimedb::table(name = hearth_upkeep_schedule, scheduled(process_hearth_upkeep))]
#[derive(Clone)]
pub struct HearthUpkeepSchedule {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Table to store upkeep query results for client UI
#[spacetimedb::table(name = hearth_upkeep_query_result, public)]
#[derive(Clone)]
pub struct HearthUpkeepQueryResult {
    #[primary_key]
    pub hearth_id: u32,
    pub required_wood: u32,
    pub required_stone: u32,
    pub required_metal: u32,
    pub available_wood: u32,
    pub available_stone: u32,
    pub available_metal: u32,
    pub estimated_decay_hours: Option<f32>, // Estimated hours until first building decays (None if protected)
    pub last_updated: Timestamp,
}

/// Initialize the hearth upkeep processing schedule
pub fn init_hearth_upkeep_schedule(ctx: &ReducerContext) -> Result<(), String> {
    let schedule_table = ctx.db.hearth_upkeep_schedule();
    if schedule_table.iter().count() == 0 {
        log::info!(
            "Starting hearth upkeep processing schedule (every {}s).",
            UPKEEP_PROCESS_INTERVAL_SECONDS
        );
        let interval = Duration::from_secs(UPKEEP_PROCESS_INTERVAL_SECONDS);
        crate::try_insert_schedule!(
            schedule_table,
            HearthUpkeepSchedule {
                id: 0,
                scheduled_at: ScheduleAt::Interval(TimeDuration::from(interval)),
            },
            "Hearth upkeep"
        );
    } else {
        log::debug!("Hearth upkeep schedule already exists.");
    }
    Ok(())
}

/// Scheduled reducer to process upkeep for all hearths
#[spacetimedb::reducer]
pub fn process_hearth_upkeep(ctx: &ReducerContext, _schedule: HearthUpkeepSchedule) -> Result<(), String> {
    // Security check - only allow scheduler to call this
    if ctx.sender != ctx.identity() {
        return Err("process_hearth_upkeep may only be called by the scheduler.".to_string());
    }

    let current_time = ctx.timestamp;
    let hearths = ctx.db.homestead_hearth();
    
    for mut hearth in hearths.iter() {
        if hearth.is_destroyed {
            continue;
        }
        
        // Check if it's time to process upkeep
        let last_upkeep = hearth.last_upkeep_time.unwrap_or(hearth.placed_at);
        let interval_micros = (hearth.upkeep_interval_seconds as i64) * 1_000_000;
        let next_upkeep_time = last_upkeep + TimeDuration::from_micros(interval_micros);
        
        if current_time < next_upkeep_time {
            continue; // Not time yet
        }
        
        // Calculate upkeep costs
        let costs = calculate_upkeep_costs(ctx, &hearth);
        
        // If no upkeep needed, skip
        if costs.wood == 0 && costs.stone == 0 && costs.metal == 0 {
            hearth.last_upkeep_time = Some(current_time);
            ctx.db.homestead_hearth().id().update(hearth);
            continue;
        }
        
        // Check if hearth has sufficient resources
        let (available_wood, available_stone, available_metal) = get_hearth_resources(ctx, &hearth);
        
        let has_sufficient_resources = available_wood >= costs.wood 
            && available_stone >= costs.stone 
            && available_metal >= costs.metal;
        
        if has_sufficient_resources {
            // Consume resources
            if consume_upkeep_resources(ctx, &mut hearth, &costs) {
                hearth.last_upkeep_time = Some(current_time);
                log::info!(
                    "[Upkeep] Processed upkeep for hearth {}: consumed {} wood, {} stone, {} metal",
                    hearth.id, costs.wood, costs.stone, costs.metal
                );
            } else {
                log::warn!(
                    "[Upkeep] Failed to consume upkeep resources for hearth {}",
                    hearth.id
                );
            }
        } else {
            // Insufficient resources - buildings will decay
            log::info!(
                "[Upkeep] Hearth {} has insufficient resources. Required: {} wood, {} stone, {} metal. Available: {} wood, {} stone, {} metal",
                hearth.id, costs.wood, costs.stone, costs.metal, available_wood, available_stone, available_metal
            );
            // Still update time to prevent spam, but buildings will decay
            hearth.last_upkeep_time = Some(current_time);
        }
        
        // Update hearth
        ctx.db.homestead_hearth().id().update(hearth);
    }
    
    Ok(())
}

/// Query upkeep costs for a hearth (for UI display)
/// Updates the hearth_upkeep_query_result table which clients can subscribe to
#[spacetimedb::reducer]
pub fn query_hearth_upkeep_costs(
    ctx: &ReducerContext,
    hearth_id: u32,
) -> Result<(), String> {
    let hearths = ctx.db.homestead_hearth();
    let query_results = ctx.db.hearth_upkeep_query_result();
    
    let hearth = hearths.id().find(&hearth_id)
        .ok_or_else(|| format!("Hearth {} not found", hearth_id))?;
    
    if hearth.is_destroyed {
        // Remove query result if hearth is destroyed
        if let Some(existing) = query_results.hearth_id().find(&hearth_id) {
            query_results.hearth_id().delete(&hearth_id);
        }
        return Err("Cannot query upkeep for destroyed hearth".to_string());
    }
    
    // Calculate costs
    let costs = calculate_upkeep_costs(ctx, &hearth);
    
    // Get available resources
    let (available_wood, available_stone, available_metal) = get_hearth_resources(ctx, &hearth);
    
    // Always calculate estimated decay time (based on building health)
    // This shows how long buildings would last if unprotected, or how long they'll last with current resources
    let estimated_decay_hours = calculate_estimated_decay_time(ctx, &hearth);
    
    // Update or insert query result
    let result = HearthUpkeepQueryResult {
        hearth_id,
        required_wood: costs.wood,
        required_stone: costs.stone,
        required_metal: costs.metal,
        available_wood,
        available_stone,
        available_metal,
        estimated_decay_hours,
        last_updated: ctx.timestamp,
    };
    
    if let Some(existing) = query_results.hearth_id().find(&hearth_id) {
        query_results.hearth_id().update(result);
    } else {
        query_results.insert(result);
    }
    
    Ok(())
}

// --- ItemContainer Implementation ---

impl ItemContainer for HomesteadHearth {
    fn num_slots(&self) -> usize {
        NUM_HEARTH_SLOTS
    }

    fn get_slot_instance_id(&self, slot_index: u8) -> Option<u64> {
        match slot_index {
            0 => self.slot_instance_id_0,
            1 => self.slot_instance_id_1,
            2 => self.slot_instance_id_2,
            3 => self.slot_instance_id_3,
            4 => self.slot_instance_id_4,
            5 => self.slot_instance_id_5,
            6 => self.slot_instance_id_6,
            7 => self.slot_instance_id_7,
            8 => self.slot_instance_id_8,
            9 => self.slot_instance_id_9,
            10 => self.slot_instance_id_10,
            11 => self.slot_instance_id_11,
            12 => self.slot_instance_id_12,
            13 => self.slot_instance_id_13,
            14 => self.slot_instance_id_14,
            15 => self.slot_instance_id_15,
            16 => self.slot_instance_id_16,
            17 => self.slot_instance_id_17,
            18 => self.slot_instance_id_18,
            19 => self.slot_instance_id_19,
            _ => None,
        }
    }

    fn get_slot_def_id(&self, slot_index: u8) -> Option<u64> {
        match slot_index {
            0 => self.slot_def_id_0,
            1 => self.slot_def_id_1,
            2 => self.slot_def_id_2,
            3 => self.slot_def_id_3,
            4 => self.slot_def_id_4,
            5 => self.slot_def_id_5,
            6 => self.slot_def_id_6,
            7 => self.slot_def_id_7,
            8 => self.slot_def_id_8,
            9 => self.slot_def_id_9,
            10 => self.slot_def_id_10,
            11 => self.slot_def_id_11,
            12 => self.slot_def_id_12,
            13 => self.slot_def_id_13,
            14 => self.slot_def_id_14,
            15 => self.slot_def_id_15,
            16 => self.slot_def_id_16,
            17 => self.slot_def_id_17,
            18 => self.slot_def_id_18,
            19 => self.slot_def_id_19,
            _ => None,
        }
    }

    fn set_slot(&mut self, slot_index: u8, instance_id: Option<u64>, def_id: Option<u64>) {
        match slot_index {
            0 => { self.slot_instance_id_0 = instance_id; self.slot_def_id_0 = def_id; }
            1 => { self.slot_instance_id_1 = instance_id; self.slot_def_id_1 = def_id; }
            2 => { self.slot_instance_id_2 = instance_id; self.slot_def_id_2 = def_id; }
            3 => { self.slot_instance_id_3 = instance_id; self.slot_def_id_3 = def_id; }
            4 => { self.slot_instance_id_4 = instance_id; self.slot_def_id_4 = def_id; }
            5 => { self.slot_instance_id_5 = instance_id; self.slot_def_id_5 = def_id; }
            6 => { self.slot_instance_id_6 = instance_id; self.slot_def_id_6 = def_id; }
            7 => { self.slot_instance_id_7 = instance_id; self.slot_def_id_7 = def_id; }
            8 => { self.slot_instance_id_8 = instance_id; self.slot_def_id_8 = def_id; }
            9 => { self.slot_instance_id_9 = instance_id; self.slot_def_id_9 = def_id; }
            10 => { self.slot_instance_id_10 = instance_id; self.slot_def_id_10 = def_id; }
            11 => { self.slot_instance_id_11 = instance_id; self.slot_def_id_11 = def_id; }
            12 => { self.slot_instance_id_12 = instance_id; self.slot_def_id_12 = def_id; }
            13 => { self.slot_instance_id_13 = instance_id; self.slot_def_id_13 = def_id; }
            14 => { self.slot_instance_id_14 = instance_id; self.slot_def_id_14 = def_id; }
            15 => { self.slot_instance_id_15 = instance_id; self.slot_def_id_15 = def_id; }
            16 => { self.slot_instance_id_16 = instance_id; self.slot_def_id_16 = def_id; }
            17 => { self.slot_instance_id_17 = instance_id; self.slot_def_id_17 = def_id; }
            18 => { self.slot_instance_id_18 = instance_id; self.slot_def_id_18 = def_id; }
            19 => { self.slot_instance_id_19 = instance_id; self.slot_def_id_19 = def_id; }
            _ => {} // Invalid slot index, do nothing
        }
    }

    fn get_container_type(&self) -> ContainerType {
        ContainerType::HomesteadHearth
    }

    fn get_container_id(&self) -> u64 {
        self.id as u64
    }
}

// --- Reducers ---

/// Place a homestead hearth at the specified world coordinates (consumes the item)
#[spacetimedb::reducer]
pub fn place_homestead_hearth(
    ctx: &ReducerContext,
    item_instance_id: u64,
    world_x: f32,
    world_y: f32,
) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    let players = ctx.db.player();
    let hearths = ctx.db.homestead_hearth();

    // --- Look up Item Definition ID by Name ---
    let hearth_def_id = item_defs.iter()
        .find(|def| def.name == "Matron's Chest")
        .map(|def| def.id)
        .ok_or_else(|| "Item definition for 'Matron's Chest' not found.".to_string())?;
    // --- End Look up ---

    log::info!(
        "[PlaceMatronsChest] Player {:?} attempting placement of item {} at ({:.1}, {:.1})",
        sender_id, item_instance_id, world_x, world_y
    );

    // Check if position is within monument zones (ALK stations, rune stones, hot springs, quarries)
    crate::building::check_monument_zone_placement(ctx, world_x, world_y)?;

    // 1. Validate player
    let player = players.identity().find(&sender_id)
        .ok_or_else(|| "Player not found".to_string())?;

    if player.is_dead {
        return Err("Cannot place Matron's Chest while dead.".to_string());
    }

    if player.is_knocked_out {
        return Err("Cannot place Matron's Chest while knocked out.".to_string());
    }

    // 2. Check placement distance
    let dx = player.position_x - world_x;
    let dy = player.position_y - world_y;
    let distance_squared = dx * dx + dy * dy;

    if distance_squared > HEARTH_PLACEMENT_MAX_DISTANCE_SQUARED {
        return Err("Too far away to place Matron's Chest.".to_string());
    }

    // Check if placement position is on water (including hot springs)
    if crate::environment::is_position_on_water(ctx, world_x, world_y) {
        return Err("Cannot place Matron's Chest on water.".to_string());
    }

    // 2.5. Check that hearth is being placed on a foundation (full or triangle)
    use crate::building::FOUNDATION_TILE_SIZE_PX; // Keep local import for constant
    let foundations = ctx.db.foundation_cell();
    
    // Convert world coordinates to foundation cell coordinates (96px grid)
    let foundation_cell_x = (world_x / FOUNDATION_TILE_SIZE_PX as f32).floor() as i32;
    let foundation_cell_y = (world_y / FOUNDATION_TILE_SIZE_PX as f32).floor() as i32;
    
    // Check if there's a foundation at this cell location (any shape - full or triangle)
    let mut has_foundation = false;
    for foundation in foundations.idx_cell_coords().filter((foundation_cell_x, foundation_cell_y)) {
        if !foundation.is_destroyed {
            // Foundation exists and is not destroyed - allow placement
            // Accept any shape: Full (1) or any triangle (2-5)
            has_foundation = true;
            break;
        }
    }
    
    if !has_foundation {
        return Err("Matron's Chest must be placed on a foundation (full or triangle). Build a foundation first!".to_string());
    }

    // 2.6. Check if placement position is on a wall
    if crate::building::is_position_on_wall(ctx, world_x, world_y) {
        return Err("Cannot place Matron's Chest on a wall.".to_string());
    }

    // 3. Check for collision with other hearths (prevent overlapping building privilege zones)
    for existing_hearth in hearths.iter() {
        if existing_hearth.is_destroyed {
            continue;
        }
        let dx = world_x - existing_hearth.pos_x;
        let dy = world_y - existing_hearth.pos_y;
        let distance_squared = dx * dx + dy * dy;
        // Prevent placing chests within building privilege radius of each other
        // This ensures building privilege zones don't overlap
        if distance_squared < BUILDING_PRIVILEGE_RADIUS_SQUARED {
            return Err(format!(
                "Cannot place Matron's Chest within {}px of another chest (building privilege radius).",
                BUILDING_PRIVILEGE_RADIUS
            ));
        }
    }

    // 4. Find the specific item instance and validate
    let item_to_consume = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item instance {} not found.", item_instance_id))?;

    // Validate ownership and location
    match item_to_consume.location {
        ItemLocation::Inventory(data) => {
            if data.owner_id != sender_id {
                return Err(format!("Item instance {} for hearth not owned by player {:?}.", item_instance_id, sender_id));
            }
        }
        ItemLocation::Hotbar(data) => {
            if data.owner_id != sender_id {
                return Err(format!("Item instance {} for hearth not owned by player {:?}.", item_instance_id, sender_id));
            }
        }
        _ => {
            return Err(format!("Item instance {} must be in inventory or hotbar to be placed.", item_instance_id));
        }
    }
    if item_to_consume.item_def_id != hearth_def_id {
        return Err(format!("Item instance {} is not a Matron's Chest (expected def {}, got {}).",
                        item_instance_id, hearth_def_id, item_to_consume.item_def_id));
    }

    // 5. Consume the Item (Delete from InventoryItem table)
    log::info!(
        "[PlaceHomesteadHearth] Consuming item instance {} (Def ID: {}) from player {:?}",
        item_instance_id, hearth_def_id, sender_id
    );
    inventory_items.instance_id().delete(item_instance_id);

    // 6. Calculate chunk index
    let chunk_index = calculate_chunk_index(world_x, world_y);

    // 7. Create and insert hearth
    let new_hearth = HomesteadHearth {
        id: 0, // Auto-incremented
        pos_x: world_x,
        pos_y: world_y,
        chunk_index,
        placed_by: sender_id,
        placed_at: ctx.timestamp,
        // Initialize all slots to None
        slot_instance_id_0: None, slot_def_id_0: None,
        slot_instance_id_1: None, slot_def_id_1: None,
        slot_instance_id_2: None, slot_def_id_2: None,
        slot_instance_id_3: None, slot_def_id_3: None,
        slot_instance_id_4: None, slot_def_id_4: None,
        slot_instance_id_5: None, slot_def_id_5: None,
        slot_instance_id_6: None, slot_def_id_6: None,
        slot_instance_id_7: None, slot_def_id_7: None,
        slot_instance_id_8: None, slot_def_id_8: None,
        slot_instance_id_9: None, slot_def_id_9: None,
        slot_instance_id_10: None, slot_def_id_10: None,
        slot_instance_id_11: None, slot_def_id_11: None,
        slot_instance_id_12: None, slot_def_id_12: None,
        slot_instance_id_13: None, slot_def_id_13: None,
        slot_instance_id_14: None, slot_def_id_14: None,
        slot_instance_id_15: None, slot_def_id_15: None,
        slot_instance_id_16: None, slot_def_id_16: None,
        slot_instance_id_17: None, slot_def_id_17: None,
        slot_instance_id_18: None, slot_def_id_18: None,
        slot_instance_id_19: None, slot_def_id_19: None,
        health: HEARTH_INITIAL_HEALTH,
        max_health: HEARTH_MAX_HEALTH,
        is_destroyed: false,
        destroyed_at: None,
        last_hit_time: None,
        last_damaged_by: None,
        last_upkeep_time: None,
        upkeep_interval_seconds: DEFAULT_UPKEEP_INTERVAL_SECONDS,
    };

    hearths.try_insert(new_hearth)
        .map_err(|e| format!("Failed to insert hearth: {}", e))?;

    // Note: Building privilege is NOT automatically granted when placing a hearth
    // Players must manually hold E near the hearth to gain building privilege

    log::info!(
        "[PlaceHomesteadHearth] Successfully placed hearth at ({:.1}, {:.1}) by player {:?}",
        world_x, world_y, sender_id
    );

    Ok(())
}

/// Grant building privilege to the calling player (hold E interaction)
/// Toggles privilege: removes if player already has it, grants if they don't
#[spacetimedb::reducer]
pub fn grant_building_privilege_from_hearth(
    ctx: &ReducerContext,
    hearth_id: u32,
) -> Result<(), String> {
    let sender_id = ctx.sender;
    let (_player, hearth) = validate_hearth_interaction(ctx, hearth_id)?;

    // Check if player already has building privilege
    let already_has_privilege = player_has_building_privilege(ctx, sender_id);
    
    // If granting privilege (don't have it yet), check building privilege radius
    // If revoking privilege (already have it), only need to be within interaction distance (already validated)
    if !already_has_privilege {
        // Re-fetch player position to ensure it's current (player might have moved slightly)
        let players = ctx.db.player();
        let player = players.identity().find(&sender_id)
            .ok_or_else(|| "Player not found".to_string())?;
        
        // Account for visual Y offset when checking building privilege radius
        let dx = player.position_x - hearth.pos_x;
        let dy = player.position_y - (hearth.pos_y + HEARTH_COLLISION_Y_OFFSET);
        let distance_squared = dx * dx + dy * dy;

        if distance_squared > BUILDING_PRIVILEGE_RADIUS_SQUARED {
            return Err("Too far from hearth to toggle building privilege.".to_string());
        }
        
        grant_building_privilege(ctx, sender_id)?;
        log::info!("Player {:?} granted building privilege from hearth {}", sender_id, hearth_id);
    } else {
        // Player already has privilege - can revoke from interaction distance (already validated)
        remove_building_privilege(ctx, sender_id);
        log::info!("Player {:?} revoked building privilege from hearth {}", sender_id, hearth_id);
    }

    Ok(())
}

/// Revoke building privilege from a specific player (UI button action)
/// Can be called by anyone with building privilege (team management)
#[spacetimedb::reducer]
pub fn revoke_player_building_privilege(
    ctx: &ReducerContext,
    hearth_id: u32,
    target_player_id: Identity,
) -> Result<(), String> {
    let sender_id = ctx.sender;
    let (_player, _hearth) = validate_hearth_interaction(ctx, hearth_id)?;

    // Only players with building privilege can revoke others' privileges
    if !player_has_building_privilege(ctx, sender_id) {
        return Err("You must have building privilege to revoke others' privileges.".to_string());
    }

    // Remove the target player's privilege
    remove_building_privilege(ctx, target_player_id);
    log::info!("Player {:?} revoked building privilege from player {:?} via hearth {}", sender_id, target_player_id, hearth_id);

    Ok(())
}

/// Wipe all building privileges (emergency reset)
/// Can be called by anyone with building privilege (team management)
#[spacetimedb::reducer]
pub fn wipe_all_building_privileges(
    ctx: &ReducerContext,
    hearth_id: u32,
) -> Result<(), String> {
    let sender_id = ctx.sender;
    let (_player, _hearth) = validate_hearth_interaction(ctx, hearth_id)?;

    // Only players with building privilege can wipe all privileges
    if !player_has_building_privilege(ctx, sender_id) {
        return Err("You must have building privilege to wipe all privileges.".to_string());
    }

    // Remove all building privilege effects
    let mut effects_to_remove = Vec::new();
    for effect in ctx.db.active_consumable_effect().iter() {
        if effect.effect_type == EffectType::BuildingPrivilege {
            effects_to_remove.push(effect.effect_id);
        }
    }
    
    for effect_id in effects_to_remove {
        ctx.db.active_consumable_effect().effect_id().delete(&effect_id);
    }
    
    log::info!("Player {:?} wiped all building privileges via hearth {}", sender_id, hearth_id);

    Ok(())
}

/// Move item to hearth (with item restriction check)
#[spacetimedb::reducer]
pub fn move_item_to_hearth(
    ctx: &ReducerContext,
    hearth_id: u32,
    target_slot_index: u8,
    item_instance_id: u64,
) -> Result<(), String> {
    let (_player, mut hearth) = validate_hearth_interaction(ctx, hearth_id)?;
    
    // Check if item is allowed
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();
    
    let item_to_move = inventory_table.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item instance {} not found", item_instance_id))?;
    
    let item_def = item_def_table.id().find(item_to_move.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item_to_move.item_def_id))?;
    
    if !is_item_allowed(&item_def) {
        return Err(format!("Item '{}' is not allowed in Matron's Chest. Only materials are allowed.", item_def.name));
    }
    
    // Use generic handler
    inventory_management::handle_move_to_container_slot(ctx, &mut hearth, target_slot_index, item_instance_id)?;
    ctx.db.homestead_hearth().id().update(hearth);
    
    Ok(())
}

/// Move item from hearth
#[spacetimedb::reducer]
pub fn move_item_from_hearth(
    ctx: &ReducerContext,
    hearth_id: u32,
    source_slot_index: u8,
    target_slot_type: String,
    target_slot_index: u32,
) -> Result<(), String> {
    let (_player, mut hearth) = validate_hearth_interaction(ctx, hearth_id)?;
    inventory_management::handle_move_from_container_slot(ctx, &mut hearth, source_slot_index, target_slot_type, target_slot_index)?;
    ctx.db.homestead_hearth().id().update(hearth);
    Ok(())
}

/// Move item within hearth
#[spacetimedb::reducer]
pub fn move_item_within_hearth(
    ctx: &ReducerContext,
    hearth_id: u32,
    source_slot_index: u8,
    target_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut hearth) = validate_hearth_interaction(ctx, hearth_id)?;
    inventory_management::handle_move_within_container(ctx, &mut hearth, source_slot_index, target_slot_index)?;
    ctx.db.homestead_hearth().id().update(hearth);
    Ok(())
}

/// Split stack into hearth (with item restriction check)
#[spacetimedb::reducer]
pub fn split_stack_into_hearth(
    ctx: &ReducerContext,
    source_item_instance_id: u64,
    quantity_to_split: u32,
    target_hearth_id: u32,
    target_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut hearth) = validate_hearth_interaction(ctx, target_hearth_id)?;
    
    // Check if item is allowed
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();
    
    let source_item = inventory_table.instance_id().find(source_item_instance_id)
        .ok_or_else(|| format!("Source item {} not found", source_item_instance_id))?;
    
    let item_def = item_def_table.id().find(source_item.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", source_item.item_def_id))?;
    
    if !is_item_allowed(&item_def) {
        return Err(format!("Item '{}' is not allowed in Matron's Chest. Only materials are allowed.", item_def.name));
    }
    
    let mut source_item_mut = source_item;
    let new_item_target_location = ItemLocation::Container(ContainerLocationData {
        container_type: ContainerType::HomesteadHearth,
        container_id: hearth.id as u64,
        slot_index: target_slot_index,
    });
    
    use crate::items::split_stack_helper;
    let new_item_instance_id = split_stack_helper(ctx, &mut source_item_mut, quantity_to_split, new_item_target_location)?;
    
    let mut new_item = inventory_table.instance_id().find(new_item_instance_id)
        .ok_or_else(|| "Failed to find newly split item".to_string())?;
    let new_item_def = item_def_table.id().find(new_item.item_def_id)
        .ok_or_else(|| "Failed to find item definition".to_string())?;
    
    inventory_management::merge_or_place_into_container_slot(ctx, &mut hearth, target_slot_index, &mut new_item, &new_item_def)?;
    ctx.db.homestead_hearth().id().update(hearth);
    
    Ok(())
}

/// Split stack from hearth
#[spacetimedb::reducer]
pub fn split_stack_from_hearth(
    ctx: &ReducerContext,
    hearth_id: u32,
    source_slot_index: u8,
    quantity_to_split: u32,
    target_slot_type: String,
    target_slot_index: u32,
) -> Result<(), String> {
    let (_player, mut hearth) = validate_hearth_interaction(ctx, hearth_id)?;
    inventory_management::handle_split_from_container(ctx, &mut hearth, source_slot_index, quantity_to_split, target_slot_type, target_slot_index)?;
    ctx.db.homestead_hearth().id().update(hearth);
    Ok(())
}

/// Split stack within hearth
#[spacetimedb::reducer]
pub fn split_stack_within_hearth(
    ctx: &ReducerContext,
    hearth_id: u32,
    source_slot_index: u8,
    target_slot_index: u8,
    quantity_to_split: u32,
) -> Result<(), String> {
    let (_player, mut hearth) = validate_hearth_interaction(ctx, hearth_id)?;
    inventory_management::handle_split_within_container(ctx, &mut hearth, source_slot_index, target_slot_index, quantity_to_split)?;
    ctx.db.homestead_hearth().id().update(hearth);
    Ok(())
}

/// Quick move from hearth
#[spacetimedb::reducer]
pub fn quick_move_from_hearth(
    ctx: &ReducerContext,
    hearth_id: u32,
    source_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut hearth) = validate_hearth_interaction(ctx, hearth_id)?;
    inventory_management::handle_quick_move_from_container(ctx, &mut hearth, source_slot_index)?;
    ctx.db.homestead_hearth().id().update(hearth);
    Ok(())
}

/// Quick move to hearth (with item restriction check)
#[spacetimedb::reducer]
pub fn quick_move_to_hearth(
    ctx: &ReducerContext,
    hearth_id: u32,
    item_instance_id: u64,
) -> Result<(), String> {
    let (_player, mut hearth) = validate_hearth_interaction(ctx, hearth_id)?;
    
    // Check if item is allowed
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();
    
    let item_to_move = inventory_table.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item instance {} not found", item_instance_id))?;
    
    let item_def = item_def_table.id().find(item_to_move.item_def_id)
        .ok_or_else(|| format!("Item definition {} not found", item_to_move.item_def_id))?;
    
    if !is_item_allowed(&item_def) {
        return Err(format!("Item '{}' is not allowed in Matron's Chest. Only materials are allowed.", item_def.name));
    }
    
    inventory_management::handle_quick_move_to_container(ctx, &mut hearth, item_instance_id)?;
    ctx.db.homestead_hearth().id().update(hearth);
    Ok(())
}

/// Drop item from hearth slot to world
#[spacetimedb::reducer]
pub fn drop_item_from_hearth_slot_to_world(
    ctx: &ReducerContext,
    hearth_id: u32,
    slot_index: u8,
) -> Result<(), String> {
    let sender_id = ctx.sender;
    let player_table = ctx.db.player();
    let mut hearth_table = ctx.db.homestead_hearth();

    log::info!("[DropFromHearthToWorld] Player {} attempting to drop item from hearth ID {}, slot index {}.", 
             sender_id, hearth_id, slot_index);

    // 1. Validate interaction and get hearth
    let (_player_for_validation, mut hearth) = validate_hearth_interaction(ctx, hearth_id)?;

    // 2. Get Player for drop location
    let player_for_drop_location = player_table.identity().find(sender_id)
        .ok_or_else(|| format!("Player {} not found for drop location.", sender_id))?;

    // 3. Call the generic handler from inventory_management
    crate::inventory_management::handle_drop_from_container_slot(ctx, &mut hearth, slot_index, &player_for_drop_location)?;

    // 4. Persist changes to the Hearth
    hearth_table.id().update(hearth);
    log::info!("[DropFromHearthToWorld] Successfully dropped item from hearth {}, slot {}. Hearth updated.", hearth_id, slot_index);

    Ok(())
}

/// Split and drop item from hearth slot to world
#[spacetimedb::reducer]
pub fn split_and_drop_item_from_hearth_slot_to_world(
    ctx: &ReducerContext,
    hearth_id: u32,
    slot_index: u8,
    quantity_to_split: u32,
) -> Result<(), String> {
    let sender_id = ctx.sender;
    let player_table = ctx.db.player();
    let mut hearth_table = ctx.db.homestead_hearth();

    log::info!("[SplitDropFromHearthToWorld] Player {} attempting to split {} from hearth ID {}, slot {}.", 
             sender_id, quantity_to_split, hearth_id, slot_index);

    // 1. Validate interaction and get hearth
    let (_player_for_validation, mut hearth) = validate_hearth_interaction(ctx, hearth_id)?;

    // 2. Get Player for drop location
    let player_for_drop_location = player_table.identity().find(sender_id)
        .ok_or_else(|| format!("Player {} not found for drop location.", sender_id))?;

    // 3. Call the generic handler from inventory_management
    crate::inventory_management::handle_split_and_drop_from_container_slot(ctx, &mut hearth, slot_index, quantity_to_split, &player_for_drop_location)?;

    // 4. Persist changes to the Hearth
    hearth_table.id().update(hearth);
    log::info!("[SplitDropFromHearthToWorld] Successfully split and dropped item from hearth {}, slot {}. Hearth updated.", hearth_id, slot_index);
    
    Ok(())
}

/// Applies weapon damage to a hearth (called from combat system)
/// This is separate from attack_hearth reducer which is called directly by clients
pub fn damage_hearth(
    ctx: &ReducerContext,
    attacker_id: Identity,
    hearth_id: u32,
    damage: f32,
    timestamp: Timestamp,
) -> Result<(), String> {
    let mut hearths = ctx.db.homestead_hearth();
    let inventory_items = ctx.db.inventory_item();
    
    // Find the hearth
    let mut hearth = hearths.id().find(&hearth_id)
        .ok_or_else(|| format!("Hearth with ID {} not found.", hearth_id))?;
    
    if hearth.is_destroyed {
        return Err("Hearth is already destroyed.".to_string());
    }
    
    let old_health = hearth.health;
    hearth.health = (hearth.health - damage).max(0.0);
    hearth.last_hit_time = Some(timestamp);
    hearth.last_damaged_by = Some(attacker_id);
    
    log::info!(
        "Player {:?} hit Hearth {} for {:.1} damage. Health: {:.1} -> {:.1}",
        attacker_id, hearth_id, damage, old_health, hearth.health
    );
    
    if hearth.health <= 0.0 {
        // Destroy the hearth
        hearth.health = 0.0;
        hearth.is_destroyed = true;
        hearth.destroyed_at = Some(timestamp);
        
        log::info!("[HearthDamage] Hearth {} destroyed by player {:?}", hearth_id, attacker_id);
        
        // Emit destruction sound
        crate::sound_events::emit_foundation_twig_destroyed_sound(ctx, hearth.pos_x, hearth.pos_y, attacker_id);
        
        // Drop all items from inventory to world WITHOUT triggering consolidation per-item
        let mut items_dropped = 0;
        for slot_index in 0..NUM_HEARTH_SLOTS {
            if let Some(instance_id) = hearth.get_slot_instance_id(slot_index as u8) {
                if let Some(item) = inventory_items.instance_id().find(instance_id) {
                    // Calculate drop position around the hearth
                    let angle = (items_dropped as f32) * (std::f32::consts::PI * 2.0 / 8.0); // Spread items in a circle
                    let drop_radius = 30.0 + (items_dropped as f32 * 5.0); // Increasing radius
                    let drop_x = hearth.pos_x + angle.cos() * drop_radius;
                    let drop_y = hearth.pos_y + angle.sin() * drop_radius;
                    
                    // Create dropped item without auto-consolidation
                    if let Err(e) = crate::dropped_item::create_dropped_item_entity_no_consolidation(ctx, item.item_def_id, item.quantity, drop_x, drop_y) {
                        log::error!("[HearthDamage] Failed to drop item {} from hearth {}: {}", instance_id, hearth_id, e);
                    } else {
                        items_dropped += 1;
                        log::info!("[HearthDamage] Dropped item {} (def {}, qty {}) from destroyed hearth {}",
                                 instance_id, item.item_def_id, item.quantity, hearth_id);
                    }
                    
                    // Delete the inventory item
                    inventory_items.instance_id().delete(instance_id);
                }
                
                // Clear the slot
                hearth.set_slot(slot_index as u8, None, None);
            }
        }
        
        // Trigger consolidation ONCE after all items are dropped
        crate::dropped_item::trigger_consolidation_at_position(ctx, hearth.pos_x, hearth.pos_y);
        
        log::info!("[HearthDamage] Dropped {} items from destroyed hearth {}", items_dropped, hearth_id);
    } else {
        // Hearth damaged but not destroyed - emit hit sound
        crate::sound_events::emit_melee_hit_sharp_sound(ctx, hearth.pos_x, hearth.pos_y, attacker_id);
    }
    
    // Update the hearth
    hearths.id().update(hearth);
    
    Ok(())
}

// Note: There is no attack_hearth reducer - damage is handled through the combat system
// which calls damage_hearth() with weapon-based damage calculated from pvp_damage_min/max

