use spacetimedb::{table, reducer, ReducerContext, Table, Identity, Timestamp, ScheduleAt, TimeDuration};
use log;
use crate::items::{InventoryItem, ItemDefinition, add_item_to_player_inventory, split_stack_helper};
use crate::items::{inventory_item as InventoryItemTableTrait, item_definition as ItemDefinitionTableTrait};
use crate::models::{ItemLocation, ContainerType, ContainerLocationData, InventoryLocationData, HotbarLocationData, EquippedLocationData, DroppedLocationData};
use crate::inventory_management::{self, ItemContainer, ContainerItemClearer, handle_move_to_container_slot, handle_quick_move_from_container, handle_move_from_container_slot, handle_move_within_container, handle_split_within_container, handle_quick_move_to_container, handle_split_from_container, handle_drop_from_container_slot, handle_split_and_drop_from_container_slot, merge_or_place_into_container_slot};
use crate::{Player, player as PlayerTableTrait};
use crate::campfire::{campfire as CampfireTableTrait};
use crate::wooden_storage_box::{wooden_storage_box as WoodenStorageBoxTableTrait};
use crate::environment::calculate_chunk_index;
use crate::player_inventory::{get_player_item, find_first_empty_player_slot, move_item_to_inventory, move_item_to_hotbar};
use crate::dropped_item::create_dropped_item_entity_with_data;

// --- ADDED: Import for sound events ---
use crate::sound_events::{start_lantern_sound, stop_lantern_sound};

// --- Constants ---
pub const FUEL_BURN_DURATION_MICROSECONDS: i64 = 120_000_000; // 120 seconds (double campfire duration)
pub const LANTERN_WARMTH_RADIUS_SQUARED: f32 = 3600.0; // 60 pixel radius (same as campfire)
pub const WARMTH_PER_SECOND: f32 = 0.5; // Same warmth as campfire
pub const LANTERN_PLACEMENT_MAX_DISTANCE: f32 = 150.0;
pub const LANTERN_PLACEMENT_MAX_DISTANCE_SQUARED: f32 = LANTERN_PLACEMENT_MAX_DISTANCE * LANTERN_PLACEMENT_MAX_DISTANCE;
// Wards need larger placement distance to avoid collision overlap with player (collision radius 40)
pub const WARD_PLACEMENT_MAX_DISTANCE: f32 = 160.0;
pub const WARD_PLACEMENT_MAX_DISTANCE_SQUARED: f32 = WARD_PLACEMENT_MAX_DISTANCE * WARD_PLACEMENT_MAX_DISTANCE;
pub const LANTERN_LANTERN_COLLISION_DISTANCE: f32 = 100.0;
pub const LANTERN_LANTERN_COLLISION_DISTANCE_SQUARED: f32 = LANTERN_LANTERN_COLLISION_DISTANCE * LANTERN_LANTERN_COLLISION_DISTANCE;
pub const LANTERN_INITIAL_HEALTH: f32 = 80.0;
pub const LANTERN_MAX_HEALTH: f32 = 80.0;
pub const NUM_FUEL_SLOTS: usize = 1;
pub const LANTERN_PROCESS_INTERVAL_SECS: u64 = 1; // How often to run the main logic when burning
pub const PLAYER_LANTERN_INTERACTION_DISTANCE: f32 = 200.0;
pub const PLAYER_LANTERN_INTERACTION_DISTANCE_SQUARED: f32 = PLAYER_LANTERN_INTERACTION_DISTANCE * PLAYER_LANTERN_INTERACTION_DISTANCE;
pub const INITIAL_LANTERN_FUEL_AMOUNT: u32 = 25; // UNUSED: Lanterns now start empty when placed

// === LANTERN TYPE CONSTANTS ===
// lantern_type: 0 = Lantern, 1 = Ancestral Ward, 2 = Signal Disruptor, 3 = Memory Beacon
pub const LANTERN_TYPE_LANTERN: u8 = 0;
pub const LANTERN_TYPE_ANCESTRAL_WARD: u8 = 1;
pub const LANTERN_TYPE_SIGNAL_DISRUPTOR: u8 = 2;
pub const LANTERN_TYPE_MEMORY_BEACON: u8 = 3;

// === WARD BURN DURATIONS (seconds per fuel unit) ===
// Rebalanced to make fuel a meaningful ongoing cost for complete immunity protection
// Option A (Moderate): Creates a "tax" on safety that scales with benefit
pub const LANTERN_BURN_DURATION_SECS: f32 = 120.0;           // Lantern: 2 min per Tallow (unchanged)
pub const ANCESTRAL_WARD_BURN_DURATION_SECS: f32 = 150.0;    // Ancestral Ward: 2.5 min per Tallow (4/night)
pub const SIGNAL_DISRUPTOR_BURN_DURATION_SECS: f32 = 120.0;  // Signal Disruptor: 2 min per Battery (5/night)
pub const MEMORY_BEACON_BURN_DURATION_SECS: f32 = 120.0;     // Memory Beacon: 2 min per Battery (same as Signal Disruptor)

// === WARD DETERRENCE CONSTANTS ===
// Wards create active deterrence zones where hostile apparitions WILL NOT ENTER.
// Unlike spawn reduction, this is a hard barrier - apparitions actively avoid these areas.
// This allows players to "civilize" their bases and not contend with enemies at night.
// Higher tier wards provide larger protection zones for bigger bases/multiplayer compounds.
//
// Scale reference:
//   - Single shelter: ~384px footprint
//   - Foundation cell: 96px
//   - Viewport: ~1920x1080px
//   - World size: 500x500 tiles = 16000x16000px

// Tier 1: Ancestral Ward - Solo camp protection
// 550px radius = 1100px diameter = ~34 tiles across
// Covers: 1 shelter + campfire + storage with some breathing room
pub const ANCESTRAL_WARD_RADIUS_PX: f32 = 550.0;
pub const ANCESTRAL_WARD_RADIUS_SQ: f32 = ANCESTRAL_WARD_RADIUS_PX * ANCESTRAL_WARD_RADIUS_PX;

// Tier 2: Signal Disruptor - Homestead protection (duo/small group)
// 1100px radius = 2200px diameter = ~69 tiles across
// Covers: Multiple shelters, crafting areas, small garden
pub const SIGNAL_DISRUPTOR_RADIUS_PX: f32 = 1100.0;
pub const SIGNAL_DISRUPTOR_RADIUS_SQ: f32 = SIGNAL_DISRUPTOR_RADIUS_PX * SIGNAL_DISRUPTOR_RADIUS_PX;

// Tier 3: Memory Resonance Beacon - MONSTER ATTRACTOR (completely different from protective wards!)
// Unlike Ancestral Ward and Signal Disruptor which REPEL hostiles, the Memory Beacon ATTRACTS them.
// This creates a high-risk/high-reward farming tool for players who want to hunt apparitions.
//
// How it works:
// - Places a beacon that INCREASES hostile spawn rates in a large radius (2000px)
// - Players inside a smaller "sanity haven" zone (600px) have insanity cleared
// - The beacon auto-destructs after 10 minutes (cannot be picked up - prevents griefing)
// - Spend 250+ shards + batteries to build, gamble on farming more shards from kills
//
// Edge case: If placed inside a protected ward zone, the spawn boost won't matter
// because hostiles still can't spawn/enter protective ward zones.
pub const MEMORY_BEACON_SANITY_RADIUS_PX: f32 = 600.0;  // Small sanity clearing zone (stay close!)
pub const MEMORY_BEACON_SANITY_RADIUS_SQ: f32 = MEMORY_BEACON_SANITY_RADIUS_PX * MEMORY_BEACON_SANITY_RADIUS_PX;
pub const MEMORY_BEACON_ATTRACTION_RADIUS_PX: f32 = 2000.0;  // Large spawn attraction zone
pub const MEMORY_BEACON_ATTRACTION_RADIUS_SQ: f32 = MEMORY_BEACON_ATTRACTION_RADIUS_PX * MEMORY_BEACON_ATTRACTION_RADIUS_PX;
pub const MEMORY_BEACON_SPAWN_MULTIPLIER: f32 = 10.0;  // 10.0x spawn rate within attraction radius (significant boost)
pub const MEMORY_BEACON_LIFETIME_SECS: u64 = 300;  // Auto-destructs after 5 minutes (nerfed from 10 min)

// Legacy constant for backward compatibility (use MEMORY_BEACON_SANITY_RADIUS_SQ instead)
pub const MEMORY_BEACON_RADIUS_PX: f32 = MEMORY_BEACON_SANITY_RADIUS_PX;
pub const MEMORY_BEACON_RADIUS_SQ: f32 = MEMORY_BEACON_SANITY_RADIUS_SQ;

// === WARD HEALTH VALUES ===
pub const ANCESTRAL_WARD_HEALTH: f32 = 150.0;
pub const SIGNAL_DISRUPTOR_HEALTH: f32 = 200.0;
pub const MEMORY_BEACON_HEALTH: f32 = 300.0;

// --- Lantern Table ---
// Also used for Wards (lantern_type > 0)
// lantern_type: 0 = Lantern, 1 = Ancestral Ward, 2 = Signal Disruptor, 3 = Memory Beacon
#[spacetimedb::table(name = lantern, public)]
#[derive(Clone, Debug)]
pub struct Lantern {
    #[primary_key]
    #[auto_inc]
    pub id: u32,
    pub pos_x: f32,
    pub pos_y: f32,
    #[index(btree)]
    pub chunk_index: u32,
    pub placed_by: Identity,
    pub placed_at: Timestamp,
    pub is_burning: bool,
    // Fuel slot (Tallow for lantern/ancestral ward, Scrap Batteries for signal disruptor/memory beacon)
    pub fuel_instance_id_0: Option<u64>,
    pub fuel_def_id_0: Option<u64>,
    pub current_fuel_def_id: Option<u64>,
    pub remaining_fuel_burn_time_secs: Option<f32>,
    pub health: f32,
    pub max_health: f32,
    pub is_destroyed: bool,
    pub destroyed_at: Option<Timestamp>,
    pub last_hit_time: Option<Timestamp>,
    pub last_damaged_by: Option<Identity>,
    // Mark as monument placeable (indestructible, public access)
    pub is_monument: bool,
    // Lantern type: 0 = Lantern, 1 = Ancestral Ward, 2 = Signal Disruptor, 3 = Memory Beacon
    pub lantern_type: u8,
}

// --- Scheduled Processing Table ---
#[spacetimedb::table(name = lantern_processing_schedule, scheduled(process_lantern_logic_scheduled), public)]
pub struct LanternProcessingSchedule {
    #[primary_key]
    pub lantern_id: u64,
    pub scheduled_at: ScheduleAt,
}

// --- ItemContainer Implementation ---
impl ItemContainer for Lantern {
    fn num_slots(&self) -> usize {
        NUM_FUEL_SLOTS
    }

    fn get_slot_instance_id(&self, slot_index: u8) -> Option<u64> {
        match slot_index {
            0 => self.fuel_instance_id_0,
            _ => None,
        }
    }

    fn get_slot_def_id(&self, slot_index: u8) -> Option<u64> {
        match slot_index {
            0 => self.fuel_def_id_0,
            _ => None,
        }
    }

    fn set_slot(&mut self, slot_index: u8, instance_id: Option<u64>, def_id: Option<u64>) {
        match slot_index {
            0 => {
                self.fuel_instance_id_0 = instance_id;
                self.fuel_def_id_0 = def_id;
            }
            _ => {}
        }
    }

    fn get_container_type(&self) -> ContainerType {
        ContainerType::Lantern
    }

    fn get_container_id(&self) -> u64 {
        self.id as u64
    }
}

/******************************************************************************
 *                           REDUCERS (Generic Handlers)                        *
 ******************************************************************************/

/// --- Move Item to Lantern ---
/// Validates fuel type based on lantern_type:
/// - Lantern (0) and Ancestral Ward (1): Accept Tallow only
/// - Signal Disruptor (2) and Memory Beacon (3): Accept Scrap Batteries only
#[spacetimedb::reducer]
pub fn move_item_to_lantern(ctx: &ReducerContext, lantern_id: u32, target_slot_index: u8, item_instance_id: u64) -> Result<(), String> {
    let (_player, mut lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    
    // Validate fuel type based on lantern_type
    let item = ctx.db.inventory_item().instance_id().find(&item_instance_id)
        .ok_or_else(|| "Item not found.".to_string())?;
    let item_def = ctx.db.item_definition().id().find(&item.item_def_id)
        .ok_or_else(|| "Item definition not found.".to_string())?;
    
    let is_valid_fuel = match lantern.lantern_type {
        LANTERN_TYPE_LANTERN | LANTERN_TYPE_ANCESTRAL_WARD => {
            // Lanterns and Ancestral Wards accept Tallow
            item_def.name == "Tallow"
        }
        LANTERN_TYPE_SIGNAL_DISRUPTOR | LANTERN_TYPE_MEMORY_BEACON => {
            // Signal Disruptors and Memory Beacons accept Scrap Batteries
            item_def.name == "Scrap Batteries"
        }
        _ => false,
    };
    
    if !is_valid_fuel {
        let expected_fuel = match lantern.lantern_type {
            LANTERN_TYPE_LANTERN => "Tallow",
            LANTERN_TYPE_ANCESTRAL_WARD => "Tallow",
            LANTERN_TYPE_SIGNAL_DISRUPTOR => "Scrap Batteries",
            LANTERN_TYPE_MEMORY_BEACON => "Scrap Batteries",
            _ => "valid fuel",
        };
        let structure_name = get_lantern_type_name(lantern.lantern_type);
        return Err(format!("{} requires {} as fuel, not {}.", structure_name, expected_fuel, item_def.name));
    }
    
    handle_move_to_container_slot(ctx, &mut lantern, target_slot_index, item_instance_id)?;
    ctx.db.lantern().id().update(lantern.clone());
    schedule_next_lantern_processing(ctx, lantern_id);
    Ok(())
}

/// Helper function to get the display name for a lantern type
fn get_lantern_type_name(lantern_type: u8) -> &'static str {
    match lantern_type {
        LANTERN_TYPE_LANTERN => "Lantern",
        LANTERN_TYPE_ANCESTRAL_WARD => "Ancestral Ward",
        LANTERN_TYPE_SIGNAL_DISRUPTOR => "Signal Disruptor",
        LANTERN_TYPE_MEMORY_BEACON => "Memory Resonance Beacon",
        _ => "Unknown Structure",
    }
}

/// --- Light Lantern / Activate Ward ---
#[spacetimedb::reducer]
pub fn light_lantern(ctx: &ReducerContext, lantern_id: u32) -> Result<(), String> {
    let (_player, mut lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    let structure_name = get_lantern_type_name(lantern.lantern_type);
    let required_fuel = get_required_fuel_name(lantern.lantern_type);
    
    if lantern.is_burning {
        return Err(format!("{} is already active.", structure_name));
    }
    
    if !check_if_lantern_has_fuel(ctx, &lantern) {
        return Err(format!("Cannot activate {}, requires {} as fuel.", structure_name, required_fuel));
    }
    
    lantern.is_burning = true;
    
    // Start burning from fuel - this sets burn time but DOESN'T consume the fuel yet
    // The fuel item remains visible in the slot until its burn time is exhausted
    if !start_burning_from_fuel(ctx, &mut lantern) {
        lantern.is_burning = false;
        return Err(format!("Failed to start burning {} - no valid fuel found.", structure_name));
    }
    
    log::info!("{} {} activated by player {:?}.", structure_name, lantern.id, ctx.sender);
    
    // Start lantern sound (only for actual lanterns)
    if lantern.lantern_type == LANTERN_TYPE_LANTERN {
        start_lantern_sound(ctx, lantern.id as u64, lantern.pos_x, lantern.pos_y);
    }
    
    ctx.db.lantern().id().update(lantern.clone());
    schedule_next_lantern_processing(ctx, lantern_id);
    Ok(())
}

/// --- Extinguish Lantern / Deactivate Ward ---
#[spacetimedb::reducer]
pub fn extinguish_lantern(ctx: &ReducerContext, lantern_id: u32) -> Result<(), String> {
    let (_player, mut lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    let structure_name = get_lantern_type_name(lantern.lantern_type);
    
    if !lantern.is_burning {
        return Err(format!("{} is already inactive.", structure_name));
    }
    
    lantern.is_burning = false;
    lantern.current_fuel_def_id = None;
    lantern.remaining_fuel_burn_time_secs = None;
    log::info!("{} {} deactivated by player {:?}.", structure_name, lantern.id, ctx.sender);
    
    // Stop lantern sound (only for actual lanterns)
    if lantern.lantern_type == LANTERN_TYPE_LANTERN {
        stop_lantern_sound(ctx, lantern.id as u64);
    }
    
    ctx.db.lantern().id().update(lantern.clone());
    schedule_next_lantern_processing(ctx, lantern_id);
    Ok(())
}

/// --- Toggle Lantern / Ward ---
/// Toggles the burning/active state of the lantern or ward.
/// Similar to toggle_campfire_burning but without rain protection since lanterns are typically protected.
#[spacetimedb::reducer]
pub fn toggle_lantern(ctx: &ReducerContext, lantern_id: u32) -> Result<(), String> {
    let (_player, mut lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    let structure_name = get_lantern_type_name(lantern.lantern_type);
    let required_fuel = get_required_fuel_name(lantern.lantern_type);
    
    if lantern.is_burning {
        // Deactivate the structure
        lantern.is_burning = false;
        lantern.current_fuel_def_id = None;
        lantern.remaining_fuel_burn_time_secs = None;
        log::info!("{} {} deactivated by player {:?}.", structure_name, lantern.id, ctx.sender);
        
        // Stop lantern sound (only for actual lanterns)
        if lantern.lantern_type == LANTERN_TYPE_LANTERN {
            stop_lantern_sound(ctx, lantern.id as u64);
        }
    } else {
        // Activate the structure
        if !check_if_lantern_has_fuel(ctx, &lantern) {
            return Err(format!("Cannot activate {}, requires {} as fuel.", structure_name, required_fuel));
        }
        
        lantern.is_burning = true;
        
        // Start burning from fuel - this sets burn time but DOESN'T consume the fuel yet
        // The fuel item remains visible in the slot until its burn time is exhausted
        if !start_burning_from_fuel(ctx, &mut lantern) {
            lantern.is_burning = false;
            return Err(format!("Failed to start burning {} - no valid fuel found.", structure_name));
        }
        
        log::info!("{} {} activated by player {:?}.", structure_name, lantern.id, ctx.sender);
        
        // Start lantern sound (only for actual lanterns)
        if lantern.lantern_type == LANTERN_TYPE_LANTERN {
            start_lantern_sound(ctx, lantern.id as u64, lantern.pos_x, lantern.pos_y);
        }
    }
    
    ctx.db.lantern().id().update(lantern.clone());
    schedule_next_lantern_processing(ctx, lantern_id);
    Ok(())
}

/// --- Pickup Lantern or Ward ---
/// Note: Memory Resonance Beacons CANNOT be picked up - they auto-destruct after 10 minutes.
/// This prevents griefing (placing one near someone else's base to attract monsters).
#[spacetimedb::reducer]
pub fn pickup_lantern(ctx: &ReducerContext, lantern_id: u32) -> Result<(), String> {
    let (player, lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    let structure_name = get_lantern_type_name(lantern.lantern_type);
    let expected_item_name = get_item_name_for_lantern_type(lantern.lantern_type);
    
    // Memory Resonance Beacons cannot be picked up - they auto-destruct
    // This prevents griefing by placing them near other players' bases
    if lantern.lantern_type == LANTERN_TYPE_MEMORY_BEACON {
        return Err("Memory Resonance Beacons cannot be picked up. They will auto-destruct after 10 minutes.".to_string());
    }
    
    // Check if there's fuel inside - cannot pickup if fuel is present
    let has_fuel = (0..NUM_FUEL_SLOTS as u8).any(|slot_index| {
        lantern.get_slot_instance_id(slot_index).is_some()
    });
    
    if has_fuel {
        return Err(format!("Cannot pick up {} while it contains fuel. Remove fuel first.", structure_name));
    }
    
    // Get the correct item definition based on lantern_type
    let item_defs = ctx.db.item_definition();
    let item_def = item_defs.iter()
        .find(|def| def.name == expected_item_name)
        .ok_or_else(|| format!("{} item definition not found.", expected_item_name))?;
    
    // Add item to player inventory
    let new_location = find_first_empty_player_slot(ctx, ctx.sender)
        .ok_or_else(|| format!("Player inventory is full, cannot pickup {}.", structure_name))?;
    
    let new_item = InventoryItem {
        instance_id: 0, // Auto-inc
        item_def_id: item_def.id,
        quantity: 1,
        location: new_location,
        item_data: None, // Initialize as empty
    };
    
    ctx.db.inventory_item().try_insert(new_item)
        .map_err(|e| format!("Failed to insert {} item: {}", structure_name, e))?;
    
    // 🔊 Stop lantern sound if it was burning when picked up (only for actual lanterns)
    if lantern.is_burning && lantern.lantern_type == LANTERN_TYPE_LANTERN {
        stop_lantern_sound(ctx, lantern.id as u64);
    }
    
    // Delete the lantern/ward entity
    ctx.db.lantern().id().delete(lantern_id);
    
    log::info!("Player {:?} picked up {} {}", ctx.sender, structure_name, lantern_id);
    Ok(())
}

/// Helper to get the expected item name for a lantern type
fn get_item_name_for_lantern_type(lantern_type: u8) -> &'static str {
    match lantern_type {
        LANTERN_TYPE_LANTERN => "Lantern",
        LANTERN_TYPE_ANCESTRAL_WARD => "Ancestral Ward",
        LANTERN_TYPE_SIGNAL_DISRUPTOR => "Signal Disruptor",
        LANTERN_TYPE_MEMORY_BEACON => "Memory Resonance Beacon",
        _ => "Lantern",
    }
}

/// Helper to get health values for a lantern type
fn get_health_for_lantern_type(lantern_type: u8) -> (f32, f32) {
    match lantern_type {
        LANTERN_TYPE_LANTERN => (LANTERN_INITIAL_HEALTH, LANTERN_MAX_HEALTH),
        LANTERN_TYPE_ANCESTRAL_WARD => (ANCESTRAL_WARD_HEALTH, ANCESTRAL_WARD_HEALTH),
        LANTERN_TYPE_SIGNAL_DISRUPTOR => (SIGNAL_DISRUPTOR_HEALTH, SIGNAL_DISRUPTOR_HEALTH),
        LANTERN_TYPE_MEMORY_BEACON => (MEMORY_BEACON_HEALTH, MEMORY_BEACON_HEALTH),
        _ => (LANTERN_INITIAL_HEALTH, LANTERN_MAX_HEALTH),
    }
}

/// --- Place Lantern or Ward ---
/// lantern_type: 0 = Lantern, 1 = Ancestral Ward, 2 = Signal Disruptor, 3 = Memory Beacon
#[spacetimedb::reducer]
pub fn place_lantern(ctx: &ReducerContext, item_instance_id: u64, world_x: f32, world_y: f32, lantern_type: u8) -> Result<(), String> {
    let sender_id = ctx.sender;
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    let players = ctx.db.player();
    let lanterns = ctx.db.lantern();

    // Validate lantern_type
    if lantern_type > LANTERN_TYPE_MEMORY_BEACON {
        return Err(format!("Invalid lantern type: {}", lantern_type));
    }

    let structure_name = get_lantern_type_name(lantern_type);
    let expected_item_name = get_item_name_for_lantern_type(lantern_type);

    // Look up item definition for the expected type
    let expected_def_id = item_defs.iter()
        .find(|def| def.name == expected_item_name)
        .map(|def| def.id)
        .ok_or_else(|| format!("Item definition for '{}' not found.", expected_item_name))?;

    log::info!(
        "[Place{}] Player {:?} attempting placement of item {} at ({:.1}, {:.1})",
        structure_name, sender_id, item_instance_id, world_x, world_y
    );

    // Check if position is within monument zones (ALK stations, rune stones, hot springs, quarries)
    crate::building::check_monument_zone_placement(ctx, world_x, world_y)?;

    // Validate player and placement rules
    let player = players.identity().find(sender_id)
        .ok_or_else(|| "Player not found".to_string())?;

    if player.is_dead {
        return Err(format!("Cannot place {} while dead.", structure_name));
    }
    if player.is_knocked_out {
        return Err(format!("Cannot place {} while knocked out.", structure_name));
    }

    let dx_place = world_x - player.position_x;
    let dy_place = world_y - player.position_y;
    let dist_sq_place = dx_place * dx_place + dy_place * dy_place;
    // Wards (type > 0) have larger placement distance to avoid collision overlap with player
    let (max_dist_sq, max_dist) = if lantern_type > LANTERN_TYPE_LANTERN {
        (WARD_PLACEMENT_MAX_DISTANCE_SQUARED, WARD_PLACEMENT_MAX_DISTANCE)
    } else {
        (LANTERN_PLACEMENT_MAX_DISTANCE_SQUARED, LANTERN_PLACEMENT_MAX_DISTANCE)
    };
    if dist_sq_place > max_dist_sq {
        return Err(format!("Cannot place {} too far away ({} > {}).",
                structure_name, dist_sq_place.sqrt(), max_dist));
    }

    // Check if placement position is on a wall
    if crate::building::is_position_on_wall(ctx, world_x, world_y) {
        return Err(format!("Cannot place {} on a wall.", structure_name));
    }

    // Check if placement position is on water (including hot springs)
    if crate::environment::is_position_on_water(ctx, world_x, world_y) {
        return Err(format!("Cannot place {} on water.", structure_name));
    }

    // Check for collision with other lanterns/wards
    for other_lantern in lanterns.iter() {
        let dx_lantern = world_x - other_lantern.pos_x;
        let dy_lantern = world_y - other_lantern.pos_y;
        let dist_sq_lantern = dx_lantern * dx_lantern + dy_lantern * dy_lantern;
        if dist_sq_lantern < LANTERN_LANTERN_COLLISION_DISTANCE_SQUARED {
            let other_name = get_lantern_type_name(other_lantern.lantern_type);
            return Err(format!("Cannot place {} too close to another {}.", structure_name, other_name));
        }
    }

    // Find and validate the item instance
    let item_to_consume = inventory_items.instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item instance {} not found.", item_instance_id))?;

    // Validate ownership and location
    match item_to_consume.location {
        ItemLocation::Inventory(ref data) => {
            if data.owner_id != sender_id {
                return Err(format!("Item instance {} not owned by player.", item_instance_id));
            }
        }
        ItemLocation::Hotbar(ref data) => {
            if data.owner_id != sender_id {
                return Err(format!("Item instance {} not owned by player.", item_instance_id));
            }
        }
        _ => {
            return Err(format!("Item instance {} must be in inventory or hotbar to be placed.", item_instance_id));
        }
    }

    if item_to_consume.item_def_id != expected_def_id {
        return Err(format!("Item instance {} is not a {}.", item_instance_id, expected_item_name));
    }

    // Consume the item
    log::info!(
        "[Place{}] Consuming item instance {} from player {:?}",
        structure_name, item_instance_id, sender_id
    );
    inventory_items.instance_id().delete(item_instance_id);

    // Create entity (without fuel)
    let current_time = ctx.timestamp;
    let chunk_idx = calculate_chunk_index(world_x, world_y);
    let (initial_health, max_health) = get_health_for_lantern_type(lantern_type);
    let required_fuel = get_required_fuel_name(lantern_type);

    // No Y offset - client sends the exact position where the item should be placed
    // The client's placement preview accounts for sprite rendering offsets
    let new_lantern = Lantern {
        id: 0, // Auto-incremented
        pos_x: world_x,
        pos_y: world_y, // Store exactly what client sends
        chunk_index: chunk_idx,
        placed_by: sender_id,
        placed_at: current_time,
        is_burning: false,
        fuel_instance_id_0: None,
        fuel_def_id_0: None,
        current_fuel_def_id: None,
        remaining_fuel_burn_time_secs: None,
        health: initial_health,
        max_health,
        is_destroyed: false,
        destroyed_at: None,
        last_hit_time: None,
        last_damaged_by: None,
        is_monument: false, // Player-placed structures are not monuments
        lantern_type,
    };

    let inserted_lantern = lanterns.try_insert(new_lantern.clone())
        .map_err(|e| format!("Failed to insert {} entity: {}", structure_name, e))?;
    let new_lantern_id = inserted_lantern.id;

    log::info!("Player {} placed an empty {} {} at ({:.1}, {:.1}). Add {} to use.",
             player.username, structure_name, new_lantern_id, world_x, world_y, required_fuel);

    // Schedule initial processing
    schedule_next_lantern_processing(ctx, new_lantern_id);

    Ok(())
}

/******************************************************************************
 *                       SCHEDULED PROCESSING                                   *
 ******************************************************************************/

/// --- Scheduled Lantern Processing ---
#[spacetimedb::reducer]
pub fn process_lantern_logic_scheduled(ctx: &ReducerContext, schedule_args: LanternProcessingSchedule) -> Result<(), String> {
    // Security check
    if ctx.sender != ctx.identity() {
        return Err("Reducer process_lantern_logic_scheduled may not be invoked by clients, only via scheduling.".into());
    }

    let lantern_id = schedule_args.lantern_id as u32;
    let mut lanterns = ctx.db.lantern();
    let current_time = ctx.timestamp;

    let mut lantern = match lanterns.id().find(lantern_id) {
        Some(lantern) => lantern,
        None => {
            log::warn!("[LanternScheduled] Lantern {} not found, canceling schedule.", lantern_id);
            return Ok(());
        }
    };

    if lantern.is_destroyed {
        log::info!("[LanternScheduled] Lantern {} is destroyed, canceling schedule.", lantern_id);
        return Ok(());
    }
    
    // MEMORY BEACON AUTO-DESTRUCT: Check if this is a Memory Beacon that has exceeded its lifetime
    // Server event beacons (is_monument=true) last 30 minutes, player-placed ones last 5 minutes
    if lantern.lantern_type == LANTERN_TYPE_MEMORY_BEACON {
        let elapsed_us = current_time.to_micros_since_unix_epoch() - lantern.placed_at.to_micros_since_unix_epoch();
        let elapsed_secs = elapsed_us / 1_000_000;
        
        // Use longer lifetime for server event beacons (is_monument = true)
        let lifetime_secs = if lantern.is_monument {
            crate::beacon_event::BEACON_EVENT_LIFETIME_SECS as i64
        } else {
            MEMORY_BEACON_LIFETIME_SECS as i64
        };
        
        if elapsed_secs >= lifetime_secs {
            // Auto-destruct the Memory Beacon
            log::info!("🔮 [MemoryBeacon] Beacon {} auto-destructing after {} seconds (lifetime: {} secs)", 
                      lantern_id, elapsed_secs, lifetime_secs);
            
            // Drop any remaining fuel as world items at the beacon's position
            for slot_index in 0..NUM_FUEL_SLOTS as u8 {
                if let Some(item_instance_id) = lantern.get_slot_instance_id(slot_index) {
                    if let Some(item) = ctx.db.inventory_item().instance_id().find(item_instance_id) {
                        // Create dropped item in world
                        let _ = create_dropped_item_entity_with_data(
                            ctx,
                            item.item_def_id,
                            item.quantity,
                            lantern.pos_x,
                            lantern.pos_y,
                            item.item_data.clone()
                        );
                        // Delete the item from inventory
                        ctx.db.inventory_item().instance_id().delete(item_instance_id);
                    }
                }
            }
            
            // Delete the beacon entity
            ctx.db.lantern().id().delete(lantern_id);
            
            // TODO: Consider adding a visual/sound effect for the destruction
            return Ok(());
        }
    }

    if !lantern.is_burning {
        log::debug!("[LanternScheduled] Lantern {} is not burning, no processing needed.", lantern_id);
        schedule_next_lantern_processing(ctx, lantern_id);
        return Ok(());
    }

    // Process fuel consumption
    let mut needs_update = false;
    let mut should_extinguish = false;

    // Check if we have current fuel burning
    if let Some(remaining_time) = lantern.remaining_fuel_burn_time_secs {
        let time_elapsed = LANTERN_PROCESS_INTERVAL_SECS as f32;
        let new_remaining_time = remaining_time - time_elapsed;

        if new_remaining_time <= 0.0 {
            // Current fuel unit's burn time is exhausted - NOW we consume it
            log::info!("[LanternScheduled] Burn time exhausted for one fuel unit in lantern {}.", lantern_id);
            
            // Actually consume (decrement) one unit of fuel from the slot
            consume_one_fuel_unit(ctx, &mut lantern);
            
            // Clear current burn tracking
            lantern.remaining_fuel_burn_time_secs = None;
            lantern.current_fuel_def_id = None;
            needs_update = true;

            // Try to start burning from remaining fuel (if any)
            if !start_burning_from_fuel(ctx, &mut lantern) {
                // No more fuel available
                should_extinguish = true;
            } else {
                needs_update = true;
            }
        } else {
            // Update remaining time
            lantern.remaining_fuel_burn_time_secs = Some(new_remaining_time);
            needs_update = true;
        }
    } else {
        // No current fuel burn time set, try to start burning from available fuel
        if !start_burning_from_fuel(ctx, &mut lantern) {
            should_extinguish = true;
        } else {
            needs_update = true;
        }
    }

    if should_extinguish {
        lantern.is_burning = false;
        lantern.current_fuel_def_id = None;
        lantern.remaining_fuel_burn_time_secs = None;
        needs_update = true;
        log::info!("[LanternScheduled] Lantern {} extinguished due to lack of fuel.", lantern_id);
        
        // 🔊 Stop lantern looping sound when extinguished due to fuel exhaustion
        crate::sound_events::stop_lantern_sound(ctx, lantern_id as u64);
    }

    if needs_update {
        lanterns.id().update(lantern);
    }

    schedule_next_lantern_processing(ctx, lantern_id);
    Ok(())
}

/******************************************************************************
 *                       HELPER FUNCTIONS                                       *
 ******************************************************************************/

fn validate_lantern_interaction(ctx: &ReducerContext, lantern_id: u32) -> Result<(Player, Lantern), String> {
    let sender_id = ctx.sender;
    let players = ctx.db.player();
    let lanterns = ctx.db.lantern();

    let player = players.identity().find(sender_id)
        .ok_or_else(|| "Player not found".to_string())?;

    let lantern = lanterns.id().find(lantern_id)
        .ok_or_else(|| format!("Lantern {} not found", lantern_id))?;

    if player.is_dead {
        return Err("Cannot interact with lantern while dead.".to_string());
    }

    if player.is_knocked_out {
        return Err("Cannot interact with lantern while knocked out.".to_string());
    }

    if lantern.is_destroyed {
        return Err("Cannot interact with destroyed lantern.".to_string());
    }

    let dx = player.position_x - lantern.pos_x;
    let dy = player.position_y - lantern.pos_y;
    let dist_sq = dx * dx + dy * dy;

    if dist_sq > PLAYER_LANTERN_INTERACTION_DISTANCE_SQUARED {
        return Err("Player is too far away from the lantern.".to_string());
    }

    Ok((player, lantern))
}

/// Get the required fuel name for a given lantern type
fn get_required_fuel_name(lantern_type: u8) -> &'static str {
    match lantern_type {
        LANTERN_TYPE_LANTERN | LANTERN_TYPE_ANCESTRAL_WARD => "Tallow",
        LANTERN_TYPE_SIGNAL_DISRUPTOR | LANTERN_TYPE_MEMORY_BEACON => "Scrap Batteries",
        _ => "Tallow", // Default to Tallow
    }
}

/// Get the burn duration in seconds for a given lantern type
fn get_burn_duration_secs(lantern_type: u8) -> f32 {
    match lantern_type {
        LANTERN_TYPE_LANTERN => LANTERN_BURN_DURATION_SECS,
        LANTERN_TYPE_ANCESTRAL_WARD => ANCESTRAL_WARD_BURN_DURATION_SECS,
        LANTERN_TYPE_SIGNAL_DISRUPTOR => SIGNAL_DISRUPTOR_BURN_DURATION_SECS,
        LANTERN_TYPE_MEMORY_BEACON => MEMORY_BEACON_BURN_DURATION_SECS,
        _ => LANTERN_BURN_DURATION_SECS,
    }
}

pub(crate) fn check_if_lantern_has_fuel(ctx: &ReducerContext, lantern: &Lantern) -> bool {
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();
    let required_fuel = get_required_fuel_name(lantern.lantern_type);

    // Check each fuel slot
    for slot_index in 0..NUM_FUEL_SLOTS as u8 {
        if let Some(item_instance_id) = lantern.get_slot_instance_id(slot_index) {
            if let Some(item) = inventory_table.instance_id().find(item_instance_id) {
                if let Some(item_def) = item_def_table.id().find(item.item_def_id) {
                    if item_def.name == required_fuel && item.quantity > 0 {
                        return true;
                    }
                }
            }
        }
    }
    false
}

/// Start burning from available fuel WITHOUT consuming it yet.
/// The fuel item remains visible in the slot - it will only be consumed when burn time expires.
fn start_burning_from_fuel(ctx: &ReducerContext, lantern: &mut Lantern) -> bool {
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();
    let required_fuel = get_required_fuel_name(lantern.lantern_type);
    let burn_duration = get_burn_duration_secs(lantern.lantern_type);
    let structure_name = get_lantern_type_name(lantern.lantern_type);

    // Look for valid fuel in fuel slots
    for slot_index in 0..NUM_FUEL_SLOTS as u8 {
        if let Some(item_instance_id) = lantern.get_slot_instance_id(slot_index) {
            if let Some(item) = inventory_table.instance_id().find(item_instance_id) {
                if let Some(item_def) = item_def_table.id().find(item.item_def_id) {
                    if item_def.name == required_fuel && item.quantity > 0 {
                        // Set burn time based on lantern type - DON'T consume yet
                        // The fuel item stays in the slot, visible to the player
                        lantern.current_fuel_def_id = Some(item_def.id);
                        lantern.remaining_fuel_burn_time_secs = Some(burn_duration);
                        
                        log::info!("[{}] Started burning {} in {} {}, {:.0} seconds per unit, {} units available.", 
                            structure_name, required_fuel, structure_name, lantern.id, burn_duration, item.quantity);
                        return true;
                    }
                }
            }
        }
    }
    false
}

/// Actually consume one unit of fuel from the slot.
/// Called when burn time for one unit has fully expired.
/// Returns true if fuel was consumed (and more may be available), false if no fuel to consume.
fn consume_one_fuel_unit(ctx: &ReducerContext, lantern: &mut Lantern) -> bool {
    let inventory_table = ctx.db.inventory_item();
    let item_def_table = ctx.db.item_definition();
    let required_fuel = get_required_fuel_name(lantern.lantern_type);
    let structure_name = get_lantern_type_name(lantern.lantern_type);

    // Look for valid fuel in fuel slots
    for slot_index in 0..NUM_FUEL_SLOTS as u8 {
        if let Some(item_instance_id) = lantern.get_slot_instance_id(slot_index) {
            if let Some(mut item) = inventory_table.instance_id().find(item_instance_id) {
                if let Some(item_def) = item_def_table.id().find(item.item_def_id) {
                    if item_def.name == required_fuel && item.quantity > 0 {
                        // Consume one unit of fuel
                        item.quantity -= 1;
                        let remaining_quantity = item.quantity; // Capture before potential move
                        
                        if item.quantity == 0 {
                            // Remove empty item - this is when the last unit is exhausted
                            inventory_table.instance_id().delete(item_instance_id);
                            lantern.set_slot(slot_index, None, None);
                            log::info!("[{}] Last {} unit consumed in {} {}.", 
                                structure_name, required_fuel, structure_name, lantern.id);
                        } else {
                            // Update item quantity
                            inventory_table.instance_id().update(item);
                            log::info!("[{}] Consumed 1 {} in {} {}, {} units remaining.", 
                                structure_name, required_fuel, structure_name, lantern.id, remaining_quantity);
                        }
                        return true;
                    }
                }
            }
        }
    }
    false
}

pub fn schedule_next_lantern_processing(ctx: &ReducerContext, lantern_id: u32) -> Result<(), String> {
    // Cancel existing schedule
    let existing_schedules = ctx.db.lantern_processing_schedule();
    if let Some(_existing) = existing_schedules.lantern_id().find(lantern_id as u64) {
        existing_schedules.lantern_id().delete(lantern_id as u64);
    }

    // Check if lantern still exists and needs processing
    let lanterns = ctx.db.lantern();
    let lantern = match lanterns.id().find(lantern_id) {
        Some(lantern) => lantern,
        None => return Ok(()), // Lantern doesn't exist anymore
    };

    if lantern.is_destroyed {
        return Ok(()); // Don't schedule destroyed lanterns
    }

    // Schedule next processing
    let next_schedule = LanternProcessingSchedule {
        lantern_id: lantern_id as u64,
        scheduled_at: ScheduleAt::Interval(TimeDuration::from_micros(LANTERN_PROCESS_INTERVAL_SECS as i64 * 1_000_000)),
    };

    existing_schedules.try_insert(next_schedule)
        .map_err(|e| format!("Failed to schedule lantern processing: {}", e))?;

    Ok(())
}

/// --- Drop Item from Lantern Slot to World ---
#[spacetimedb::reducer]
pub fn drop_item_from_lantern_slot_to_world(
    ctx: &ReducerContext,
    lantern_id: u32,
    slot_index: u8,
) -> Result<(), String> {
    let (player, mut lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    
    handle_drop_from_container_slot(
        ctx,
        &mut lantern,
        slot_index,
        &player,
    )?;
    
    ctx.db.lantern().id().update(lantern);
    Ok(())
}

// --- ContainerItemClearer Implementation ---
pub struct LanternClearer;

impl ContainerItemClearer for LanternClearer {
    fn clear_item(ctx: &ReducerContext, item_instance_id: u64) -> bool {
        let lanterns = ctx.db.lantern();
        
        for mut lantern in lanterns.iter() {
            let mut found_and_cleared = false;
            
            // Check each fuel slot
            for slot_index in 0..NUM_FUEL_SLOTS as u8 {
                if let Some(stored_instance_id) = lantern.get_slot_instance_id(slot_index) {
                    if stored_instance_id == item_instance_id {
                        lantern.set_slot(slot_index, None, None);
                        found_and_cleared = true;
                        break;
                    }
                }
            }
            
            if found_and_cleared {
                let lantern_id = lantern.id;
                lanterns.id().update(lantern);
                log::info!("[Lantern] Cleared item {} from lantern {}", item_instance_id, lantern_id);
                return true;
            }
        }
        false
    }
}

/******************************************************************************
 *                           INVENTORY MANAGEMENT REDUCERS                     *
 ******************************************************************************/

/// --- Remove Fuel from Lantern ---
/// Removes the fuel item from a specific lantern slot and returns it to the player inventory/hotbar.
/// Uses the quick move logic (attempts merge, then finds first empty slot).
/// Note: If the lantern is burning with remaining burn time, it will continue until that time runs out.
#[spacetimedb::reducer]
pub fn quick_move_from_lantern(ctx: &ReducerContext, lantern_id: u32, source_slot_index: u8) -> Result<(), String> {
    let (_player, mut lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    inventory_management::handle_quick_move_from_container(ctx, &mut lantern, source_slot_index)?;
    
    // Only extinguish immediately if there's no fuel in slots AND no remaining burn time
    // (already-consumed fuel should continue burning until it runs out)
    let still_has_fuel = check_if_lantern_has_fuel(ctx, &lantern);
    let has_remaining_burn_time = lantern.remaining_fuel_burn_time_secs.map_or(false, |t| t > 0.0);
    
    if !still_has_fuel && !has_remaining_burn_time && lantern.is_burning {
        lantern.is_burning = false;
        lantern.current_fuel_def_id = None;
        lantern.remaining_fuel_burn_time_secs = None;
        log::info!("Lantern {} extinguished as last valid fuel was removed and no burn time remaining.", lantern_id);
    }
    ctx.db.lantern().id().update(lantern.clone());
    schedule_next_lantern_processing(ctx, lantern_id);
    Ok(())
}

/// --- Split Stack Into Lantern ---
/// Splits a stack from player inventory into a lantern slot.
#[spacetimedb::reducer]
pub fn split_stack_into_lantern(
    ctx: &ReducerContext,
    source_item_instance_id: u64,
    quantity_to_split: u32,
    target_lantern_id: u32,
    target_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut lantern) = validate_lantern_interaction(ctx, target_lantern_id)?;
    let mut source_item = get_player_item(ctx, source_item_instance_id)?;
    let new_item_target_location = ItemLocation::Container(crate::models::ContainerLocationData {
        container_type: ContainerType::Lantern,
        container_id: lantern.id as u64,
        slot_index: target_slot_index,
    });
    let new_item_instance_id = split_stack_helper(ctx, &mut source_item, quantity_to_split, new_item_target_location)?;
    
    // Fetch the newly created item and its definition to pass to merge_or_place
    let mut new_item = ctx.db.inventory_item().instance_id().find(new_item_instance_id)
        .ok_or_else(|| format!("Failed to find newly split item instance {}", new_item_instance_id))?;
    let new_item_def = ctx.db.item_definition().id().find(new_item.item_def_id)
        .ok_or_else(|| format!("Failed to find definition for new item {}", new_item.item_def_id))?;

    merge_or_place_into_container_slot(ctx, &mut lantern, target_slot_index, &mut new_item, &new_item_def)?;
    
    // Update the source item (quantity changed by split_stack_helper)
    ctx.db.inventory_item().instance_id().update(source_item); 
    ctx.db.lantern().id().update(lantern.clone());
    schedule_next_lantern_processing(ctx, target_lantern_id);
    Ok(())
}

/// --- Lantern Internal Item Movement ---
/// Moves/merges/swaps an item BETWEEN two slots within the same lantern.
#[spacetimedb::reducer]
pub fn move_item_within_lantern(
    ctx: &ReducerContext,
    lantern_id: u32,
    source_slot_index: u8,
    target_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    inventory_management::handle_move_within_container(ctx, &mut lantern, source_slot_index, target_slot_index)?;
    ctx.db.lantern().id().update(lantern.clone());
    schedule_next_lantern_processing(ctx, lantern_id);
    Ok(())
}

/// --- Lantern Internal Stack Splitting ---
/// Splits a stack FROM one lantern slot TO another within the same lantern.
#[spacetimedb::reducer]
pub fn split_stack_within_lantern(
    ctx: &ReducerContext,
    lantern_id: u32,
    source_slot_index: u8,
    quantity_to_split: u32,
    target_slot_index: u8,
) -> Result<(), String> {
    let (_player, mut lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    inventory_management::handle_split_within_container(ctx, &mut lantern, source_slot_index, target_slot_index, quantity_to_split)?;
    ctx.db.lantern().id().update(lantern.clone());
    schedule_next_lantern_processing(ctx, lantern_id);
    Ok(())
}

/// --- Quick Move to Lantern ---
/// Quickly moves an item from player inventory/hotbar to the first available/mergeable slot in the lantern.
#[spacetimedb::reducer]
pub fn quick_move_to_lantern(
    ctx: &ReducerContext,
    lantern_id: u32,
    item_instance_id: u64,
) -> Result<(), String> {
    let (_player, mut lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    inventory_management::handle_quick_move_to_container(ctx, &mut lantern, item_instance_id)?;
    ctx.db.lantern().id().update(lantern.clone());
    schedule_next_lantern_processing(ctx, lantern_id);
    Ok(())
}

/// --- Move From Lantern to Player ---
/// Moves a specific item FROM a lantern slot TO a specific player inventory/hotbar slot.
/// Note: If the lantern is burning with remaining burn time, it will continue until that time runs out.
#[spacetimedb::reducer]
pub fn move_item_from_lantern_to_player_slot(
    ctx: &ReducerContext,
    lantern_id: u32,
    source_slot_index: u8,
    target_slot_type: String,
    target_slot_index: u32, // u32 to match client flexibility
) -> Result<(), String> {
    let (_player, mut lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    inventory_management::handle_move_from_container_slot(ctx, &mut lantern, source_slot_index, target_slot_type, target_slot_index)?;
    
    // Only extinguish immediately if there's no fuel in slots AND no remaining burn time
    let still_has_fuel = check_if_lantern_has_fuel(ctx, &lantern);
    let has_remaining_burn_time = lantern.remaining_fuel_burn_time_secs.map_or(false, |t| t > 0.0);
    
    if !still_has_fuel && !has_remaining_burn_time && lantern.is_burning {
        lantern.is_burning = false;
        lantern.current_fuel_def_id = None;
        lantern.remaining_fuel_burn_time_secs = None;
        log::info!("Lantern {} extinguished - no fuel remaining.", lantern_id);
    }
    ctx.db.lantern().id().update(lantern.clone());
    schedule_next_lantern_processing(ctx, lantern_id);
    Ok(())
}

/// --- Split From Lantern to Player ---
/// Splits a stack FROM a lantern slot TO a specific player inventory/hotbar slot.
#[spacetimedb::reducer]
pub fn split_stack_from_lantern(
    ctx: &ReducerContext,
    source_lantern_id: u32,
    source_slot_index: u8,
    quantity_to_split: u32,
    target_slot_type: String,    // "inventory" or "hotbar"
    target_slot_index: u32,     // Numeric index for inventory/hotbar
) -> Result<(), String> {
    let (_player, mut lantern) = validate_lantern_interaction(ctx, source_lantern_id)?;

    log::info!(
        "[SplitFromLantern] Player {:?} delegating split {} from lantern {} slot {} to {} slot {}",
        ctx.sender, quantity_to_split, source_lantern_id, source_slot_index, target_slot_type, target_slot_index
    );

    // Call GENERIC Handler
    inventory_management::handle_split_from_container(
        ctx, 
        &mut lantern, 
        source_slot_index, 
        quantity_to_split,
        target_slot_type, 
        target_slot_index
    )?;

    // Check if lantern should be extinguished after fuel removal
    // Only extinguish immediately if there's no fuel in slots AND no remaining burn time
    let still_has_fuel = check_if_lantern_has_fuel(ctx, &lantern);
    let has_remaining_burn_time = lantern.remaining_fuel_burn_time_secs.map_or(false, |t| t > 0.0);
    
    if !still_has_fuel && !has_remaining_burn_time && lantern.is_burning {
        lantern.is_burning = false;
        lantern.current_fuel_def_id = None;
        lantern.remaining_fuel_burn_time_secs = None;
        log::info!("Lantern {} extinguished - no fuel remaining.", source_lantern_id);
    }

    ctx.db.lantern().id().update(lantern.clone());
    schedule_next_lantern_processing(ctx, source_lantern_id);
    Ok(())
}

/// --- Split and Drop Item from Lantern Slot to World ---
/// Splits a specified quantity from a lantern slot and drops it as a world item.
#[spacetimedb::reducer]
pub fn split_and_drop_item_from_lantern_slot_to_world(
    ctx: &ReducerContext,
    lantern_id: u32,
    slot_index: u8,
    quantity_to_split: u32,
) -> Result<(), String> {
    let (_player, mut lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    
    // Get the item in the slot
    let item_instance_id = lantern.get_slot_instance_id(slot_index)
        .ok_or_else(|| format!("No item in lantern {} slot {}", lantern_id, slot_index))?;
    
    let mut source_item = ctx.db.inventory_item().instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item instance {} not found", item_instance_id))?;
    
    if source_item.quantity < quantity_to_split {
        return Err(format!("Cannot split {} items, only {} available", quantity_to_split, source_item.quantity));
    }
    
    // Create the dropped item entity directly in the world
    create_dropped_item_entity_with_data(
        ctx,
        source_item.item_def_id,
        quantity_to_split,
        lantern.pos_x,
        lantern.pos_y,
        source_item.item_data.clone()
    )?;
    
    // Update source item quantity
    source_item.quantity -= quantity_to_split;
    
    if source_item.quantity == 0 {
        // Remove empty item and clear slot
        ctx.db.inventory_item().instance_id().delete(item_instance_id);
        lantern.set_slot(slot_index, None, None);
    } else {
        ctx.db.inventory_item().instance_id().update(source_item);
    }
    
    // Check if lantern should be extinguished after fuel removal
    let still_has_fuel = check_if_lantern_has_fuel(ctx, &lantern);
    if !still_has_fuel && lantern.is_burning {
        lantern.is_burning = false;
        lantern.current_fuel_def_id = None;
        lantern.remaining_fuel_burn_time_secs = None;
        log::info!("Lantern {} extinguished as last valid fuel was removed.", lantern_id);
    }
    
    ctx.db.lantern().id().update(lantern.clone());
    schedule_next_lantern_processing(ctx, lantern_id);
    Ok(())
}

/// --- Interact with Lantern ---
/// Basic interaction reducer for opening the lantern interface.
#[spacetimedb::reducer]
pub fn interact_with_lantern(ctx: &ReducerContext, lantern_id: u32) -> Result<(), String> {
    let (_player, _lantern) = validate_lantern_interaction(ctx, lantern_id)?;
    log::info!("Player {:?} interacted with lantern {}", ctx.sender, lantern_id);
    Ok(())
} 