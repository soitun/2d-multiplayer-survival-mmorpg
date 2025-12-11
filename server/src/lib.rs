use spacetimedb::{Identity, Timestamp, ReducerContext, Table, ConnectionId};
use rand::Rng; // Add Rng trait for ctx.rng().gen()
use log;
use std::time::Duration;
use crate::environment::calculate_chunk_index; // Make sure this helper is available
use crate::environment::WORLD_WIDTH_CHUNKS; // Import chunk constant for optimization
use crate::models::{ContainerType, ItemLocation}; // Ensure ItemLocation and ContainerType are in scope

// ============================================================================
// SCHEDULE INITIALIZATION MACRO WITH RETRY LOGIC
// ============================================================================
// Macro to safely insert schedules with proper error handling and retries
// This prevents silent failures that can break game systems
// Retries up to 3 times before giving up
// NOTE: On failure, logs error but DOES NOT crash the server - the system
// will just be disabled until the next server restart or manual fix
#[macro_export]
macro_rules! try_insert_schedule {
    ($table:expr, $schedule:expr, $system_name:expr) => {{
        let mut last_error = String::new();
        let mut success = false;
        
        // Try up to 3 times
        for attempt in 1..=3 {
            // We can't clone the schedule, so we only get one real attempt
            // The retry logic is here for future enhancement if needed
            if attempt > 1 {
                // Can't retry without clone - just log and break
                log::error!("Cannot retry schedule insertion without Clone trait");
                break;
            }
            
            match $table.try_insert($schedule) {
                Ok(_) => {
                    log::info!("{} schedule initialized successfully", $system_name);
                    success = true;
                    break;
                }
                Err(e) => {
                    last_error = format!("{}", e);
                    log::error!("⚠️ CRITICAL: Failed to initialize {} schedule: {}", $system_name, e);
                    log::error!("⚠️ {} system will be DISABLED until server restart or manual fix!", $system_name);
                    log::error!("⚠️ This is likely due to database corruption or a constraint violation.");
                }
            }
        }
        
        // Don't crash the server - just log the error and continue
        // The specific system will be disabled but other systems will work
        if !success {
            log::error!("⚠️ Continuing server startup with {} system DISABLED", $system_name);
        }
    }};
}

// Declare the module
mod environment;
mod tree; // Add tree module
mod stone; // Add stone module
// Declare the items module
mod items;
// Declare the world_state module
mod world_state;
// Declare the campfire module
mod campfire;
// Declare the furnace module
mod furnace;
// Declare the lantern module
mod lantern;
// Declare the active_equipment module
mod active_equipment;
// Declare the player_inventory module
mod player_inventory;
// Declare the consumables module
mod consumables;
mod utils; // Declare utils module
mod dropped_item; // Declare dropped_item module
mod wooden_storage_box; // Add the new module
mod refrigerator; // Refrigerator-specific container logic
mod compost; // Compost-specific container logic
mod backpack; // Backpack auto-consolidation system

mod items_database; // <<< NEW: Modular items database
mod starting_items; // <<< ADDED module declaration
mod inventory_management; // <<< ADDED new module
mod spatial_grid; // ADD: Spatial grid module for optimized collision detection
mod crafting; // ADD: Crafting recipe definitions
mod crafting_queue; // ADD: Crafting queue logic
mod player_stats; // ADD: Player stat scheduling logic
mod global_tick; // ADD: Global tick scheduling logic
mod chat; // ADD: Chat module for message handling
mod player_pin; // ADD: Player pin module for minimap
pub mod combat; // Add the new combat module
mod repair; // ADD: Repair module for structure repair functionality
mod collectible_resources; // Add the new collectible resources system
mod plants_database; // NEW: Plant configuration database
mod harvestable_resource; // NEW: Unified harvestable resource system
mod sleeping_bag; // ADD Sleeping Bag module
mod player_corpse; // <<< ADDED: Declare Player Corpse module
mod models; // <<< ADDED
mod cooking; // <<< ADDED: For generic cooking logic
mod stash; // Added Stash module
mod planted_seeds; // Added for farming system with planted seeds
pub mod active_effects; // Added for timed consumable effects
mod cloud; // Add the new cloud module
mod armor; // <<< ADDED armor module
mod grass; // <<< ADDED grass module
mod player_movement; // <<< ADDED player movement module
mod knocked_out; // <<< ADDED knocked out recovery module
mod bones; // <<< ADDED bones module
mod ranged_weapon_stats; // Add this line
mod projectile; // Add this line
mod death_marker; // <<< ADDED death marker module
mod torch; // <<< ADDED torch module
mod flashlight; // <<< ADDED flashlight module
mod headlamp; // <<< ADDED headlamp module
mod respawn; // <<< ADDED respawn module
mod player_collision; // <<< ADDED player_collision module
mod shelter; // <<< ADDED shelter module
mod world_generation; // <<< ADDED world generation module
mod fishing; // <<< ADDED fishing module
mod drinking; // <<< ADDED drinking module
mod wet; // <<< ADDED wet status effect module
mod sound_events; // <<< ADDED sound events module
mod rain_collector; // <<< ADDED rain collector module
mod water_patch; // <<< ADDED water patch module for crop watering
mod fertilizer_patch; // <<< ADDED fertilizer patch module for visual fertilizer application
pub mod wild_animal_npc; // <<< ADDED wild animal NPC system (now modular)
mod animal_collision; // <<< ADDED animal collision system
mod barrel; // <<< ADDED roadside barrel loot system
mod metadata_providers; // <<< ADDED: Provides plant/seed metadata to client
mod sea_stack; // <<< ADDED: Sea stack decorative entities
mod memory_grid; // <<< ADDED: Memory Grid tech tree system
mod building; // <<< ADDED: Building system (foundations, walls, doors)
mod building_enclosure; // <<< ADDED: Building enclosure detection (rain protection, "inside" logic)
mod door; // <<< ADDED: Door system for building entrances
mod fumarole; // <<< ADDED: Fumarole module for quarry geothermal vents
mod basalt_column; // <<< ADDED: Basalt column module for quarry decorative obstacles
mod homestead_hearth; // <<< ADDED: Homestead Hearth for building privilege system
mod building_decay; // <<< ADDED: Building decay system
mod rune_stone; // <<< ADDED: Rune stone system
mod cairn; // <<< ADDED: Cairn lore system
mod broth_pot; // <<< ADDED: Broth pot cooking system
mod recipes; // <<< ADDED: Recipe system for broth pot cooking
mod barbecue; // <<< ADDED: Barbecue cooking appliance system
mod fire_patch; // <<< ADDED: Fire patch system for fire arrows
mod ai_brewing; // <<< ADDED: AI-generated brew recipes system
mod alk; // <<< ADDED: ALK (Automated Logistics Kompound) provisioning system
pub mod compound_buildings; // <<< ADDED: Static compound building collision system
mod shipwreck; // <<< ADDED: Shipwreck monument collision system
pub mod monument; // <<< ADDED: Generic monument system for clearance zones (shipwrecks, ruins, crash sites, etc.)
mod durability; // <<< ADDED: Item durability system for weapons, tools, and torches

// ADD: Re-export respawn reducer
pub use respawn::respawn_randomly;

// ADD: Re-export player movement reducers
pub use player_movement::{set_sprinting, toggle_crouch, jump, dodge_roll};

// ADD: Re-export shelter placement reducer
pub use shelter::place_shelter;

// ADD: Re-export sleeping bag respawn reducer
pub use sleeping_bag::respawn_at_sleeping_bag;

// ADD: Re-export world generation reducer
pub use world_generation::generate_world;

// ADD: Re-export fishing reducers
pub use fishing::{cast_fishing_line, finish_fishing, cancel_fishing};

// ADD: Re-export drinking reducers
pub use drinking::{drink_water, fill_water_container_from_natural_source};

// ADD: Re-export planted seeds reducer
pub use planted_seeds::plant_seed;

// ADD: Re-export rain collector reducers
pub use rain_collector::{place_rain_collector, move_item_to_rain_collector, move_item_from_rain_collector, quick_move_from_rain_collector, fill_water_container};

// ADD: Re-export water container consumption reducer
pub use consumables::consume_filled_water_container;

// ADD: Re-export water patch reducer
pub use water_patch::water_crops;

// ADD: Re-export wild animal NPC reducers
pub use wild_animal_npc::{spawn_wild_animal, damage_wild_animal, damage_wild_animal_by_animal, process_wild_animal_ai};

// ADD: Re-export unified harvestable resource reducer
pub use harvestable_resource::interact_with_harvestable_resource;

// ADD: Re-export metadata provider helper functions
pub use metadata_providers::{is_plantable_seed, get_plant_type_from_seed_name};

// ADD: Re-export memory grid reducers
pub use memory_grid::{purchase_memory_grid_node, initialize_player_memory_grid};

// ADD: Re-export building reducers
pub use building::place_foundation;

// ADD: Re-export door reducers
pub use door::{place_door, interact_door, pickup_door};

// ADD: Re-export homestead hearth reducers for client bindings
pub use homestead_hearth::{
    place_homestead_hearth, grant_building_privilege_from_hearth,
    move_item_to_hearth, move_item_from_hearth, move_item_within_hearth,
    split_stack_into_hearth, split_stack_from_hearth, split_stack_within_hearth,
    quick_move_from_hearth, quick_move_to_hearth,
    drop_item_from_hearth_slot_to_world, split_and_drop_item_from_hearth_slot_to_world
};

// Define a constant for the /kill command cooldown (e.g., 5 minutes)
pub const KILL_COMMAND_COOLDOWN_SECONDS: u64 = 300;

// Table to store the last time a player used the /kill command
#[spacetimedb::table(name = player_kill_command_cooldown)]
#[derive(Clone, Debug)]
pub struct PlayerKillCommandCooldown {
    #[primary_key]
    player_id: Identity,
    last_kill_command_at: Timestamp,
}

// Table for private system messages to individual players
#[spacetimedb::table(name = private_message, public)] // Public so client can subscribe with filter
#[derive(Clone, Debug)]
pub struct PrivateMessage {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub recipient_identity: Identity, // The player who should see this message
    pub sender_display_name: String,  // e.g., "SYSTEM"
    pub text: String,
    pub sent: Timestamp,
}

// Re-export chat types and reducers for use in other modules
pub use chat::{Message, LastWhisperFrom};

// Re-export player movement reducer for client bindings
pub use player_movement::update_player_position_simple;

// Re-export campfire reducers for client bindings  
pub use campfire::{
    place_campfire, move_item_to_campfire, quick_move_from_campfire,
    split_stack_into_campfire, move_item_within_campfire, split_stack_within_campfire,
    quick_move_to_campfire, move_item_from_campfire_to_player_slot,
    split_stack_from_campfire, split_and_move_from_campfire,
    drop_item_from_campfire_slot_to_world, split_and_drop_item_from_campfire_slot_to_world,
    interact_with_campfire, toggle_campfire_burning
};

// Re-export barbecue reducers for client bindings
pub use barbecue::{
    place_barbecue, move_item_to_barbecue, quick_move_from_barbecue,
    split_stack_into_barbecue, quick_move_to_barbecue,
    move_item_from_barbecue, drop_item_from_barbecue,
    interact_with_barbecue, toggle_barbecue_burning, pickup_barbecue
};

// Re-export furnace reducers for client bindings
pub use furnace::{
    place_furnace, move_item_to_furnace, quick_move_from_furnace, 
    split_stack_into_furnace, move_item_within_furnace, split_stack_within_furnace,
    quick_move_to_furnace, move_item_from_furnace_to_player_slot,
    split_stack_from_furnace, split_and_move_from_furnace,
    drop_item_from_furnace_slot_to_world, split_and_drop_item_from_furnace_slot_to_world,
    interact_with_furnace, toggle_furnace_burning, process_furnace_logic_scheduled
};

// Re-export fumarole reducers for client bindings
pub use fumarole::{
    move_item_to_fumarole, quick_move_from_fumarole,
    split_stack_into_fumarole, move_item_within_fumarole, split_stack_within_fumarole,
    quick_move_to_fumarole, move_item_from_fumarole_to_player_slot,
    split_stack_from_fumarole, split_and_move_from_fumarole,
    drop_item_from_fumarole_slot_to_world, split_and_drop_item_from_fumarole_slot_to_world,
    interact_with_fumarole
};

// Re-export lantern reducers for client bindings
pub use lantern::{
    place_lantern, move_item_to_lantern, quick_move_from_lantern,
    split_stack_into_lantern, move_item_within_lantern, split_stack_within_lantern,
    quick_move_to_lantern, move_item_from_lantern_to_player_slot,
    split_stack_from_lantern, split_and_drop_item_from_lantern_slot_to_world,
    drop_item_from_lantern_slot_to_world, light_lantern, extinguish_lantern, 
    toggle_lantern, pickup_lantern, interact_with_lantern
};

// Re-export wooden storage box reducers for client bindings
pub use wooden_storage_box::{
    place_wooden_storage_box, move_item_to_box, quick_move_from_box,
    split_stack_into_box, move_item_within_box, split_stack_within_box,
    quick_move_to_box, move_item_from_box, split_stack_from_box,
    drop_item_from_box_slot_to_world, split_and_drop_item_from_box_slot_to_world,
    interact_with_storage_box, pickup_storage_box
};

// Re-export stash reducers for client bindings  
pub use stash::{
    place_stash, move_item_to_stash, quick_move_from_stash,
    split_stack_into_stash, move_item_within_stash, split_stack_within_stash,
    quick_move_to_stash, move_item_from_stash, split_stack_from_stash,
    drop_item_from_stash_slot_to_world, split_and_drop_item_from_stash_slot_to_world,
    toggle_stash_visibility
};

// Re-export player corpse reducers for client bindings
pub use player_corpse::{
    create_player_corpse, move_item_to_corpse, quick_move_from_corpse,
    split_stack_into_corpse, move_item_within_corpse, split_stack_within_corpse,
    quick_move_to_corpse, move_item_from_corpse, split_stack_from_corpse,
    drop_item_from_corpse_slot_to_world, split_and_drop_item_from_corpse_slot_to_world
};

// Re-export broth pot reducers for client bindings
pub use broth_pot::{
    place_broth_pot_on_campfire, place_broth_pot_on_fumarole, pickup_broth_pot,
    interact_with_broth_pot,
    move_item_to_broth_pot, move_item_from_broth_pot, move_item_within_broth_pot,
    split_stack_into_broth_pot, split_stack_from_broth_pot, split_stack_within_broth_pot,
    quick_move_to_broth_pot, quick_move_from_broth_pot,
    move_item_to_broth_pot_water_container, move_item_from_broth_pot_water_container,
    quick_move_to_broth_pot_water_container, quick_move_from_broth_pot_water_container,
    move_item_from_broth_pot_output, quick_move_from_broth_pot_output,
    transfer_water_from_container_to_pot,
    schedule_next_broth_pot_processing, process_broth_pot_logic_scheduled
};

// Re-export AI brewing reducers for client bindings
pub use ai_brewing::{check_brew_cache, create_generated_brew};  

// Re-export ALK (Automated Logistics Kompound) reducers for client bindings
pub use alk::{
    get_available_contracts, accept_alk_contract, cancel_alk_contract,
    deliver_alk_contract, get_shard_balance, check_alk_station_proximity,
    debug_refresh_alk_contracts, debug_grant_shards, process_alk_contract_refresh,
    // Types
    AlkState, AlkStation, AlkContract, AlkPlayerContract, PlayerShardBalance,
    AlkContractKind, AlkContractStatus, AlkStationAllowance, ItemAlkTag,
};

// Re-export knocked out functions and types for other modules
pub use knocked_out::{schedule_knocked_out_recovery, KnockedOutRecoverySchedule, KnockedOutStatus};
pub use knocked_out::process_knocked_out_recovery; // For scheduler
pub use knocked_out::revive_knocked_out_player; // For client bindings  
pub use knocked_out::get_knocked_out_status; // For client bindings

// Re-export bones reducer for client bindings
pub use bones::crush_bone_item;

// ADD: Re-export torch reducer for client bindings
pub use torch::toggle_torch;

// ADD: Re-export flashlight reducer for client bindings
pub use flashlight::toggle_flashlight;

// ADD: Re-export headlamp reducer for client bindings
pub use headlamp::toggle_headlamp;

// Import Table Traits needed in this module
use crate::tree::tree as TreeTableTrait;
use crate::stone::stone as StoneTableTrait;
use crate::rune_stone::rune_stone as RuneStoneTableTrait;
use crate::cairn::cairn as CairnTableTrait;
use crate::cairn::player_discovered_cairn as PlayerDiscoveredCairnTableTrait;
use crate::campfire::campfire as CampfireTableTrait;
use crate::furnace::furnace as FurnaceTableTrait;
use crate::lantern::lantern as LanternTableTrait;
use crate::harvestable_resource::harvestable_resource as HarvestableResourceTableTrait;
use crate::world_state::world_state as WorldStateTableTrait;
use crate::world_state::thunder_event_cleanup_schedule as ThunderEventCleanupScheduleTableTrait; // <<< ADDED: Import ThunderEventCleanupSchedule table trait
use crate::items::inventory_item as InventoryItemTableTrait;
use crate::items::item_definition as ItemDefinitionTableTrait;
use crate::active_equipment::active_equipment as ActiveEquipmentTableTrait;
use crate::dropped_item::dropped_item_despawn_schedule as DroppedItemDespawnScheduleTableTrait;
use crate::wooden_storage_box::wooden_storage_box as WoodenStorageBoxTableTrait;
use crate::chat::message as MessageTableTrait; // Import the trait for Message table
use crate::sleeping_bag::sleeping_bag as SleepingBagTableTrait; // ADD Sleeping Bag trait import
use crate::player_stats::stat_thresholds_config as StatThresholdsConfigTableTrait; // <<< UPDATED: Import StatThresholdsConfig table trait
use crate::grass::grass as GrassTableTrait; // <<< ADDED: Import Grass table trait
use crate::knocked_out::knocked_out_status as KnockedOutStatusTableTrait; // <<< ADDED: Import KnockedOutStatus table trait
use crate::world_tile as WorldTileTableTrait; // <<< ADDED: Import WorldTile table trait
use crate::minimap_cache as MinimapCacheTableTrait; // <<< ADDED: Import MinimapCache table trait
use crate::player_movement::player_dodge_roll_state as PlayerDodgeRollStateTableTrait; // <<< ADDED: Import PlayerDodgeRollState table trait
use crate::player_movement::dodge_roll_cleanup_schedule as DodgeRollCleanupScheduleTableTrait; // <<< ADDED: Import DodgeRollCleanupSchedule table trait
use crate::world_chunk_data as WorldChunkDataTableTrait; // <<< ADDED: Import WorldChunkData table trait
use crate::fishing::fishing_session as FishingSessionTableTrait; // <<< ADDED: Import FishingSession table trait
use crate::drinking::player_drinking_cooldown as PlayerDrinkingCooldownTableTrait; // <<< ADDED: Import PlayerDrinkingCooldown table trait
use crate::planted_seeds::planted_seed as PlantedSeedTableTrait; // <<< ADDED: Import PlantedSeed table trait
use crate::sound_events::sound_event as SoundEventTableTrait; // <<< ADDED: Import SoundEvent table trait
use crate::sound_events::sound_event_cleanup_schedule as SoundEventCleanupScheduleTableTrait; // <<< ADDED: Import SoundEventCleanupSchedule table trait
// Thunder sound schedule removed - system disabled for now
use crate::rain_collector::rain_collector as RainCollectorTableTrait; // <<< ADDED: Import RainCollector table trait
use crate::water_patch::water_patch as WaterPatchTableTrait; // <<< ADDED: Import WaterPatch table trait
use crate::fertilizer_patch::fertilizer_patch as FertilizerPatchTableTrait; // <<< ADDED: Import FertilizerPatch table trait
use crate::compost::compost_process_schedule as CompostProcessScheduleTableTrait; // <<< ADDED: Import CompostProcessSchedule table trait
use crate::wild_animal_npc::wild_animal as WildAnimalTableTrait; // <<< ADDED: Import WildAnimal table trait
use crate::wild_animal_npc::wild_animal_ai_schedule as WildAnimalAiScheduleTableTrait; // <<< ADDED: Import WildAnimalAiSchedule table trait
use crate::wild_animal_npc::animal_corpse as AnimalCorpseTableTrait; // <<< ADDED: Import AnimalCorpse table trait
use crate::barrel::barrel as BarrelTableTrait; // <<< ADDED: Import Barrel table trait
use crate::barrel::barrel_respawn_schedule as BarrelRespawnScheduleTableTrait; // <<< ADDED: Import BarrelRespawnSchedule table trait
use crate::sea_stack::sea_stack as SeaStackTableTrait; // <<< ADDED: Import SeaStack table trait

// Use struct names directly for trait aliases
use crate::crafting::Recipe as RecipeTableTrait;
use crate::crafting_queue::CraftingQueueItem as CraftingQueueItemTableTrait;
use crate::crafting_queue::CraftingFinishSchedule as CraftingFinishScheduleTableTrait;
use crate::global_tick::GlobalTickSchedule as GlobalTickScheduleTableTrait;
use crate::PlayerLastAttackTimestamp as PlayerLastAttackTimestampTableTrait; // Import for the new table

// Import constants needed from player_stats
use crate::player_stats::{
    SPRINT_SPEED_MULTIPLIER,
    JUMP_COOLDOWN_MS,
    PLAYER_STARTING_HUNGER,
    PLAYER_STARTING_THIRST
};

// Use specific items needed globally (or use qualified paths)
use crate::world_state::TimeOfDay; // Keep TimeOfDay if needed elsewhere, otherwise remove
use crate::campfire::{Campfire, WARMTH_RADIUS_SQUARED, WARMTH_PER_SECOND, CAMPFIRE_COLLISION_RADIUS, CAMPFIRE_CAMPFIRE_COLLISION_DISTANCE_SQUARED, CAMPFIRE_COLLISION_Y_OFFSET, PLAYER_CAMPFIRE_COLLISION_DISTANCE_SQUARED, PLAYER_CAMPFIRE_INTERACTION_DISTANCE_SQUARED };

// Initial Amounts

// --- Global Constants ---
pub const TILE_SIZE_PX: u32 = 48;
pub const PLAYER_RADIUS: f32 = 32.0; // Player collision radius
pub const PLAYER_SPEED: f32 = 200.0; // Speed in pixels per second - reduced 50% for slower gameplay
pub const PLAYER_SPRINT_MULTIPLIER: f32 = 2.0; // 2x speed for sprinting (800 px/s) - MATCHES CLIENT

// ADD: Crouching reduces collision radius by half  
pub const CROUCHING_RADIUS_MULTIPLIER: f32 = 0.5;

// ADD: Helper function to get effective player radius based on crouching state
pub fn get_effective_player_radius(is_crouching: bool) -> f32 {
    if is_crouching {
        PLAYER_RADIUS * CROUCHING_RADIUS_MULTIPLIER
    } else {
        PLAYER_RADIUS
    }
}

// ADD: Water movement constants
pub const WATER_SPEED_PENALTY: f32 = 0.5; // 50% speed reduction (50% of normal speed)

// World Dimensions
pub const WORLD_WIDTH_TILES: u32 = 1000;
pub const WORLD_HEIGHT_TILES: u32 = 1000;
// Change back to f32 as they are used in float calculations
pub const WORLD_WIDTH_PX: f32 = (WORLD_WIDTH_TILES * TILE_SIZE_PX) as f32;
pub const WORLD_HEIGHT_PX: f32 = (WORLD_HEIGHT_TILES * TILE_SIZE_PX) as f32;

// ADD: Helper functions for water detection
/// Converts world pixel coordinates to tile coordinates
pub fn world_pos_to_tile_coords(world_x: f32, world_y: f32) -> (i32, i32) {
    let tile_x = (world_x / TILE_SIZE_PX as f32).floor() as i32;
    let tile_y = (world_y / TILE_SIZE_PX as f32).floor() as i32;
    (tile_x, tile_y)
}

/// Checks if a player is standing on a water tile (Sea type)
/// This is highly optimized using direct tile coordinate lookup
/// NEW: Uses compressed chunk data for much better performance
pub fn is_player_on_water(ctx: &ReducerContext, player_x: f32, player_y: f32) -> bool {
    // Convert player position to tile coordinates
    let (tile_x, tile_y) = world_pos_to_tile_coords(player_x, player_y);
    
    // NEW: Try compressed lookup first for much better performance
    if let Some(tile_type) = get_tile_type_at_position(ctx, tile_x, tile_y) {
        return tile_type.is_water(); // Includes both Sea and HotSpringWater
    }
    
    // FALLBACK: Use original method if compressed data not available
    let world_tiles = ctx.db.world_tile();
    
    // Use the indexed world_position btree for fast lookup
    for tile in world_tiles.idx_world_position().filter((tile_x, tile_y)) {
        match tile.tile_type {
            TileType::Sea => return true,
            _ => return false,
        }
    }
    
    // No tile found at this position, assume land (safety fallback)
    false
}

/// Checks if a player is currently jumping (in the air)
/// Returns true if the player started a jump and is still within the jump duration
pub fn is_player_jumping(jump_start_time_ms: u64, current_time_ms: u64) -> bool {
    if jump_start_time_ms == 0 {
        return false; // Player has never jumped or jump has been reset
    }
    
    let elapsed_ms = current_time_ms.saturating_sub(jump_start_time_ms);
    elapsed_ms < JUMP_COOLDOWN_MS // Player is still within the jump duration
}

/// NEW: Efficient tile lookup using compressed chunk data
/// This is much faster than individual WorldTile lookups for water detection
pub fn is_player_on_water_compressed(ctx: &ReducerContext, player_x: f32, player_y: f32) -> bool {
    // Convert player position to tile coordinates
    let (tile_x, tile_y) = world_pos_to_tile_coords(player_x, player_y);
    
    // Calculate which chunk this tile belongs to
    let chunk_x = tile_x / environment::CHUNK_SIZE_TILES as i32;
    let chunk_y = tile_y / environment::CHUNK_SIZE_TILES as i32;
    
    // Look up the compressed chunk data
    let world_chunk_data = ctx.db.world_chunk_data();
    for chunk in world_chunk_data.idx_chunk_coords().filter((chunk_x, chunk_y)) {
        // Calculate local tile position within the chunk
        let local_tile_x = (tile_x % environment::CHUNK_SIZE_TILES as i32) as usize;
        let local_tile_y = (tile_y % environment::CHUNK_SIZE_TILES as i32) as usize;
        let tile_index = local_tile_y * environment::CHUNK_SIZE_TILES as usize + local_tile_x;
        
        // Check bounds and extract tile type
        if tile_index < chunk.tile_types.len() {
            if let Some(tile_type) = TileType::from_u8(chunk.tile_types[tile_index]) {
                return tile_type.is_water(); // Includes both Sea and HotSpringWater
            }
        }
        break; // Found the chunk, no need to continue
    }
    
    // Fallback to original method if compressed data not available
    // Log a warning (once per few seconds/calls ideally, but simple log for now)
    // Only log if we are actually in bounds, to avoid spam for out-of-bounds checks
    if player_x >= 0.0 && player_y >= 0.0 && player_x < WORLD_WIDTH_PX && player_y < WORLD_HEIGHT_PX {
        log::warn!("PERFORMANCE WARNING: Compressed chunk data missing for player at ({}, {}). Fallback to slow WorldTile lookup.", player_x, player_y);
    }
    is_player_on_water(ctx, player_x, player_y)
}

/// NEW: Get tile type at specific world coordinates using compressed data
pub fn get_tile_type_at_position(ctx: &ReducerContext, world_x: i32, world_y: i32) -> Option<TileType> {
    // Calculate which chunk this tile belongs to
    let chunk_x = world_x / environment::CHUNK_SIZE_TILES as i32;
    let chunk_y = world_y / environment::CHUNK_SIZE_TILES as i32;
    
    // Look up the compressed chunk data
    let world_chunk_data = ctx.db.world_chunk_data();
    for chunk in world_chunk_data.idx_chunk_coords().filter((chunk_x, chunk_y)) {
        // Calculate local tile position within the chunk
        let local_tile_x = (world_x % environment::CHUNK_SIZE_TILES as i32) as usize;
        let local_tile_y = (world_y % environment::CHUNK_SIZE_TILES as i32) as usize;
        let tile_index = local_tile_y * environment::CHUNK_SIZE_TILES as usize + local_tile_x;
        
        // Check bounds and extract tile type
        if tile_index < chunk.tile_types.len() {
            return TileType::from_u8(chunk.tile_types[tile_index]);
        }
        break; // Found the chunk, no need to continue
    }
    
    None // No compressed data found for this position
}

// Player table to store position
#[spacetimedb::table(
    name = player,
    public,
    // Add spatial index
    index(name = idx_player_pos, btree(columns = [position_x, position_y]))
)]
#[derive(Clone)]
pub struct Player {
    #[primary_key]
    pub identity: Identity,
    pub username: String,
    pub position_x: f32,
    pub position_y: f32,
    pub direction: String,
    pub last_update: Timestamp, // Timestamp of the last update (movement or stats)
    pub last_stat_update: Timestamp, // Timestamp of the last stat processing tick
    pub jump_start_time_ms: u64,
    pub health: f32,
    pub stamina: f32,
    pub thirst: f32,
    pub hunger: f32,
    pub warmth: f32,
    pub is_sprinting: bool,
    pub is_dead: bool,
    pub death_timestamp: Option<Timestamp>,
    pub last_hit_time: Option<Timestamp>,
    pub is_online: bool, // <<< ADDED
    pub is_torch_lit: bool, // <<< ADDED: Tracks if the player's torch is currently lit
    pub is_flashlight_on: bool, // <<< ADDED: Tracks if the player's flashlight is currently on
    pub is_headlamp_lit: bool, // <<< ADDED: Tracks if the player's headlamp is currently lit (head armor)
    pub flashlight_aim_angle: f32, // Angle in radians for flashlight direction (synced for all players)
    pub last_consumed_at: Option<Timestamp>, // <<< ADDED: Tracks when a player last consumed an item
    pub is_crouching: bool, // RENAMED: For crouching speed control
    pub is_knocked_out: bool, // NEW: Tracks if the player is in knocked out state
    pub knocked_out_at: Option<Timestamp>, // NEW: When the player was knocked out
    pub is_on_water: bool, // NEW: Tracks if the player is currently standing on water
    pub client_movement_sequence: u64,
    pub is_inside_building: bool, // NEW: Tracks if player is inside an enclosed building (≥70% wall coverage)
    pub last_respawn_time: Timestamp, // NEW: When the player last spawned/respawned (for fat accumulation calculation)
    pub insanity: f32, // NEW: Hidden stat that increases when carrying memory shards or mining them (0.0-100.0)
    pub last_insanity_threshold: f32, // NEW: Last insanity threshold crossed (for SOVA sound triggers: 0.0, 25.0, 50.0, 75.0, 90.0, 100.0)
}

// Table to store the last attack timestamp for each player
#[spacetimedb::table(name = player_last_attack_timestamp)]
#[derive(Clone, Debug)]
pub struct PlayerLastAttackTimestamp {
    #[primary_key]
    player_id: Identity,
    last_attack_timestamp: Timestamp,
}

// --- NEW: Define ActiveConnection Table --- 
#[spacetimedb::table(name = active_connection, public)]
#[derive(Clone, Debug)]
pub struct ActiveConnection {
    #[primary_key]
    identity: Identity,
    // Store the ID of the current WebSocket connection for this identity
    connection_id: ConnectionId,
    timestamp: Timestamp, // Add timestamp field
}

// --- NEW: Define ClientViewport Table ---
#[spacetimedb::table(name = client_viewport)]
#[derive(Clone, Debug)]
pub struct ClientViewport {
    #[primary_key]
    client_identity: Identity,
    min_x: f32,
    min_y: f32,
    max_x: f32,
    max_y: f32,
    last_update: Timestamp,
}

// --- Lifecycle Reducers ---

// Called once when the module is published or updated
#[spacetimedb::reducer(init)]
pub fn init_module(ctx: &ReducerContext) -> Result<(), String> {
    log::info!("Initializing module...");

    // Seed all static game data first (items, recipes, etc.)
    crate::items::seed_items(ctx)?;
    crate::items::seed_food_poisoning_risks(ctx)?;
    crate::items::seed_ranged_weapon_stats(ctx)?;
    crate::crafting::seed_recipes(ctx)?;
    // NOTE: seed_environment is now called AFTER world generation (see below)

    // Initialize the dropped item despawn schedule
    crate::dropped_item::init_dropped_item_schedule(ctx)?;
    // Initialize the crafting finish check schedules
    crate::crafting_queue::init_crafting_schedule(ctx)?;
    // Re-enable the player stat update schedule for TreeCover effects
    crate::player_stats::init_player_stat_schedule(ctx)?;
    // Initialize the global tick schedule - enables time progression and resource respawns
    crate::global_tick::init_global_tick_schedule(ctx)?;
    // <<< UPDATED: Initialize StatThresholdsConfig table >>>
    crate::player_stats::init_stat_thresholds_config(ctx)?;
    // Re-enable active effects processing - needed for health regen, bleeding, poisoning, etc.
    crate::active_effects::schedule_effect_processing(ctx)?;
    crate::projectile::init_projectile_system(ctx)?;
    // ADD: Initialize plant growth system
    crate::planted_seeds::init_plant_growth_system(ctx)?;
    
    // ADD: Initialize water patch cleanup system
    crate::water_patch::init_water_patch_system(ctx)?;
    
    // ADD: Initialize fertilizer patch cleanup system
    crate::fertilizer_patch::init_fertilizer_patch_system(ctx)?;
    
    // ADD: Initialize compost processing system
    crate::compost::init_compost_system(ctx)?;
    
    // ADD: Initialize fire patch cleanup system
    crate::fire_patch::init_fire_patch_system(ctx)?;
    
    // ADD: Initialize backpack consolidation system
    crate::backpack::init_backpack_consolidation_schedule(ctx)?;
    
    // ADD: Initialize sound event cleanup system
    crate::sound_events::init_sound_cleanup_system(ctx)?;
    
    // ADD: Initialize wild animal AI system
    crate::wild_animal_npc::init_wild_animal_ai_schedule(ctx)?;
    
    
    // ADD: Initialize building privilege distance check system
    crate::homestead_hearth::init_building_privilege_check_schedule(ctx)?;
    
    // ADD: Initialize hearth upkeep processing system
    crate::homestead_hearth::init_hearth_upkeep_schedule(ctx)?;
    
    // ADD: Initialize building decay processing system
    crate::building_decay::init_building_decay_schedule(ctx)?;
    
    // ADD: Initialize barrel respawn system
    crate::barrel::init_barrel_system(ctx)?;
    
    // ADD: Initialize rune stone spawning systems
    crate::rune_stone::init_rune_stone_shard_spawning(ctx)?;
    crate::rune_stone::init_rune_stone_item_spawning(ctx)?;
    crate::rune_stone::init_rune_stone_seed_spawning(ctx)?;
    
    // ADD: Initialize WorldState for scheduled systems
    crate::world_state::seed_world_state(ctx)?;
    
    // NOTE: ALK system initialization moved to AFTER world generation (needs tiles to exist for asphalt spawning)
    
    // ADD: Initialize dodge roll cleanup system
    crate::player_movement::init_dodge_roll_cleanup_system(ctx)?;
    
    // ADD: Initialize water container fill system for rain collection
    crate::active_equipment::init_water_container_fill_schedule(ctx)?;
    
    // ADD: Initialize torch durability system
    crate::durability::init_torch_durability_schedule(ctx)?;
    
    // ADD: Initialize food spoilage system
    crate::durability::init_food_spoilage_schedule(ctx)?;

    // ADD: Generate world automatically on first startup
    let existing_tiles_count = ctx.db.world_tile().iter().count();
    if existing_tiles_count == 0 {
        log::info!("No world tiles found, generating initial world...");
        // Generate world with smaller size for better performance
        let world_config = crate::WorldGenConfig {
            seed: ctx.rng().gen::<u64>(), // Random seed each time using ctx.rng()
            world_width_tiles: WORLD_WIDTH_TILES,  // Reduced from 250 for performance
            world_height_tiles: WORLD_HEIGHT_TILES, // Reduced from 250 for performance  
            chunk_size: environment::CHUNK_SIZE_TILES, // Use the same chunk size as runtime lookups
            island_border_width: 5,  // Adjusted for smaller world
            beach_width: 3,          // Adjusted for smaller world
            river_frequency: 0.3,
            dirt_patch_frequency: 0.2,
            road_density: 0.1,
        };
        
        match crate::world_generation::generate_world(ctx, world_config) {
            Ok(_) => {
                log::info!("Initial world generation completed successfully");
                
                // CRITICAL: Initialize ALK system FIRST (spawns asphalt pads around stations)
                // This MUST happen before compressed chunk data generation so asphalt is included
                log::info!("Initializing ALK system (substations with asphalt pads)...");
                match crate::alk::init_alk_system(ctx) {
                    Ok(_) => log::info!("ALK system initialized successfully"),
                    Err(e) => log::error!("Failed to initialize ALK system: {}", e),
                }
                
                // CRITICAL: Seed environment AFTER world tiles exist
                log::info!("Seeding environment (trees, stones, plants) now that world tiles exist...");
                match crate::environment::seed_environment(ctx) {
                    Ok(_) => log::info!("Environment seeding completed successfully"),
                    Err(e) => log::error!("Failed to seed environment: {}", e),
                }
                
                // Generate compressed chunk data AFTER all tile modifications (ALK asphalt, etc.)
                log::info!("Generating compressed chunk data for efficient network transmission...");
                match crate::world_generation::generate_compressed_chunk_data(ctx) {
                    Ok(_) => log::info!("Compressed chunk data generated successfully"),
                    Err(e) => log::error!("Failed to generate compressed chunk data: {}", e),
                }
                
                // Generate minimap cache LAST (after all tile modifications)
                log::info!("Generating minimap cache...");
                match crate::world_generation::generate_minimap_data(ctx, 300, 300) {
                    Ok(_) => log::info!("Minimap cache generated successfully"),
                    Err(e) => log::error!("Failed to generate minimap cache: {}", e),
                }
            },
            Err(e) => log::error!("Failed to generate initial world: {}", e),
        }
    } else {
        log::info!("World tiles already exist ({}), skipping world generation", existing_tiles_count);
        
        // Initialize ALK system FIRST (may fix missing asphalt around stations)
        // This needs to happen BEFORE compressed chunk data generation
        log::info!("Initializing ALK system (checking for missing asphalt)...");
        match crate::alk::init_alk_system(ctx) {
            Ok(_) => log::info!("ALK system initialized successfully"),
            Err(e) => log::error!("Failed to initialize ALK system: {}", e),
        }
        
        // Check if minimap cache exists, generate if missing
        let existing_minimap_count = ctx.db.minimap_cache().iter().count();
        if existing_minimap_count == 0 {
            log::info!("No minimap cache found, generating...");
            match crate::world_generation::generate_minimap_data(ctx, 300, 300) {
                Ok(_) => log::info!("Minimap cache generated successfully"),
                Err(e) => log::error!("Failed to generate minimap cache: {}", e),
            }
        } else {
            log::info!("Minimap cache already exists ({}), skipping generation", existing_minimap_count);
        }
        
        // Check if compressed chunk data exists, generate if missing
        let existing_chunk_data_count = ctx.db.world_chunk_data().iter().count();
        if existing_chunk_data_count == 0 {
            log::info!("No compressed chunk data found, generating...");
            match crate::world_generation::generate_compressed_chunk_data(ctx) {
                Ok(_) => log::info!("Compressed chunk data generated successfully"),
                Err(e) => log::error!("Failed to generate compressed chunk data: {}", e),
            }
        } else {
            log::info!("Compressed chunk data already exists ({}), skipping generation", existing_chunk_data_count);
        }
    }

    log::info!("Module initialization complete.");
    Ok(())
}

/// Reducer that handles client connection events.
/// 
/// This reducer is called automatically when a new client connects to the server.
/// It initializes the game world if needed, tracks the client's connection,
/// and updates the player's online status. The world seeding functions are
/// idempotent, so they can be safely called on every connection.
#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(ctx: &ReducerContext) -> Result<(), String> {
    // NOTE: All seeders are now called in init_module only, not here
    // This prevents duplicate inserts when clients reconnect to an existing database
    // The seeders are idempotent but calling them on every client connection is wasteful

    // --- Track Active Connection ---
    let client_identity = ctx.sender;
    let connection_id = ctx.connection_id.ok_or_else(|| {
        log::error!("[Connect] Missing ConnectionId in client_connected context for {:?}", client_identity);
        "Internal error: Missing connection ID on connect".to_string()
    })?;

    log::info!("[Connect] Tracking active connection for identity {:?} with connection ID {:?}", 
        client_identity, connection_id);

    let active_connections = ctx.db.active_connection();
    let new_active_conn = ActiveConnection {
        identity: client_identity,
        connection_id,
        timestamp: ctx.timestamp, // Add timestamp
    };

    // Insert or update the active connection record
    if active_connections.identity().find(&client_identity).is_some() {
        active_connections.identity().update(new_active_conn);
        log::info!("[Connect] Updated existing active connection record for {:?}.", client_identity);
    } else {
        match active_connections.try_insert(new_active_conn) {
            Ok(_) => {
                log::info!("[Connect] Inserted new active connection record for {:?}.", client_identity);
            }
            Err(e) => {
                log::error!("[Connect] Failed to insert active connection for {:?}: {}", client_identity, e);
                return Err(format!("Failed to track connection: {}", e));
            }
        }
    }
    // --- End Track Active Connection ---

    // --- Set Player Online Status ---
    let mut players = ctx.db.player();
    if let Some(mut player) = players.identity().find(&client_identity) {
        if !player.is_online {
            player.is_online = true;
            players.identity().update(player);
            log::info!("[Connect] Set player {:?} to online.", client_identity);
        }
    } else {
        // Player might not be registered yet, which is fine. is_online will be set during registration.
        log::debug!("[Connect] Player {:?} not found in Player table yet (likely needs registration).", client_identity);
    }
    // --- End Set Player Online Status ---

    // Note: Initial scheduling for player stats happens in register_player
    // Note: Initial scheduling for global ticks happens in init_module
    Ok(())
}

/// Reducer that handles client disconnection events.
/// 
/// This reducer is called automatically when a client disconnects from the server.
/// It performs necessary cleanup including:
/// - Removing the active connection record if it matches the disconnecting connection
/// - Setting the player's online status to false
/// - Preserving state if the player has already reconnected
#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(ctx: &ReducerContext) {
    let sender_id = ctx.sender;
    let disconnecting_connection_id = match ctx.connection_id {
        Some(id) => id,
        None => {
            return;
        }
    };

    let active_connections = ctx.db.active_connection();
    let players = ctx.db.player(); // <<< Need players table handle

    // --- Check 1: Does the active connection record match the disconnecting one? ---
    if let Some(initial_active_conn) = active_connections.identity().find(&sender_id) {
        if initial_active_conn.connection_id == disconnecting_connection_id {

            // --- Clean Up Connection --- 
            active_connections.identity().delete(&sender_id);
            // --- END Clean Up Connection --- 

            // --- Set Player Offline Status --- 
            if let Some(mut player) = players.identity().find(&sender_id) {
                 if player.is_online { // Only update if they were marked online
                    player.is_online = false;
                    players.identity().update(player);
                    log::info!("[Disconnect] Set player {:?} to offline.", sender_id);
                 }
            } else {
                 log::warn!("[Disconnect] Player {:?} not found in Player table during disconnect cleanup.", sender_id);
            }
            // --- END Set Player Offline Status --- 

        } else {
            // The connection ID doesn't match the current active one. 
            // This means the player reconnected quickly before the old disconnect processed fully.
            // In this case, DO NOTHING. The new connection is already active, 
            // and we don't want to mark them offline or mess with their new state.
                        }
                    } else {
        // No active connection found for this identity, maybe they disconnected before fully registering?
        // Or maybe the disconnect arrived *very* late after a new connection replaced the record.
    }
}

/// Reducer that handles player registration and reconnection.
/// 
/// This reducer is called when a player first joins the game or reconnects after disconnecting.
/// For new players, it creates their initial game state and grants starting items.
/// For existing players, it updates their connection status and timestamps.
#[spacetimedb::reducer]
pub fn register_player(ctx: &ReducerContext, username: String) -> Result<(), String> {
    let sender_id = ctx.sender;
    let players = ctx.db.player();
    log::info!("Attempting registration/login for identity: {:?}, username: {}", sender_id, username);

    // --- Check if player already exists for this authenticated identity ---
    if let Some(mut existing_player) = players.identity().find(&sender_id) { 
        log::info!("[RegisterPlayer] Found existing player {} ({:?}).",
                 existing_player.username, sender_id);
        
        // --- MODIFIED: Only update timestamp on reconnect ---
        let update_timestamp = ctx.timestamp; // Capture timestamp for consistency
        existing_player.last_update = update_timestamp; // Always update player timestamp

        players.identity().update(existing_player.clone()); // Perform the player update

        // --- ALSO Update ActiveConnection record --- 
        let connection_id = ctx.connection_id.ok_or_else(|| {
            log::error!("[RegisterPlayer] Missing ConnectionId in context for existing player {:?}", sender_id);
            "Internal error: Missing connection ID on reconnect".to_string()
        })?;
        
        let active_connections = ctx.db.active_connection();
        let updated_active_conn = ActiveConnection {
            identity: sender_id,
            connection_id,
            timestamp: update_timestamp, // Use the SAME timestamp as player update
        };

        if active_connections.identity().find(&sender_id).is_some() {
            active_connections.identity().update(updated_active_conn);
            log::info!("[RegisterPlayer] Updated active connection record for {:?} with timestamp {:?}.", sender_id, update_timestamp);
        } else {
            match active_connections.try_insert(updated_active_conn) {
                Ok(_) => {
                    log::info!("[RegisterPlayer] Inserted missing active connection record for {:?} with timestamp {:?}.", sender_id, update_timestamp);
                }
                Err(e) => {
                    log::error!("[RegisterPlayer] Failed to insert missing active connection for {:?}: {}", sender_id, e);
                }
            }
        }

        return Ok(());
    }

    // --- Player does not exist, proceed with registration ---
    log::info!("New player registration for identity: {:?}. Finding spawn...", sender_id);

    // Check if desired username is taken by *another* player
    // Note: We check this *after* checking if the current identity is already registered
    let username_taken_by_other = players.iter().any(|p| p.username == username && p.identity != sender_id);
    if username_taken_by_other {
        log::warn!("Username '{}' already taken by another player. Registration failed for {:?}.", username, sender_id);
        return Err(format!("Username '{}' is already taken.", username));
    }

    // Get tables needed for spawn check only if registering new player
    let trees = ctx.db.tree();
    let stones = ctx.db.stone();
    let rune_stones = ctx.db.rune_stone();
    let campfires = ctx.db.campfire();
    let wooden_storage_boxes = ctx.db.wooden_storage_box();

    // --- Find a valid spawn position - Robust multi-strategy beach spawn ---
    
    // Strategy 1: Random sampling (fast, works most of the time)
    // Strategy 2: Perimeter scan (guaranteed to find beaches around island edge)
    // Strategy 3: Emergency fallback (find ANY non-water tile)
    
    let mut coastal_beach_tiles: Vec<(i32, i32)> = Vec::new(); // Store just (x, y) coordinates
    let max_search_attempts = 500; // Increased from 100 for better hit rate
    let map_height_half = (WORLD_HEIGHT_TILES / 2) as i32;
    
    log::info!("Searching for coastal beach tiles via random sampling (up to {} attempts)...", max_search_attempts);
    
    // --- STRATEGY 1: Random sampling in southern half ---
    for attempt in 0..max_search_attempts {
        let tile_x = ctx.rng().gen_range(0..WORLD_WIDTH_TILES as i32);
        let tile_y = ctx.rng().gen_range(map_height_half..WORLD_HEIGHT_TILES as i32);
        
        if let Some(tile_type) = get_tile_type_at_position(ctx, tile_x, tile_y) {
            if tile_type == TileType::Beach {
                // Check if coastal (adjacent to water)
                let mut is_coastal = false;
                for dx in -1..=1i32 {
                    for dy in -1..=1i32 {
                        if dx == 0 && dy == 0 { continue; }
                        if let Some(adj_type) = get_tile_type_at_position(ctx, tile_x + dx, tile_y + dy) {
                            if adj_type.is_water() {
                                is_coastal = true;
                                break;
                            }
                        }
                    }
                    if is_coastal { break; }
                }

                if is_coastal {
                    coastal_beach_tiles.push((tile_x, tile_y));
                    if coastal_beach_tiles.len() >= 10 {
                        log::info!("Found {} coastal beach tiles after {} random samples", coastal_beach_tiles.len(), attempt + 1);
                        break;
                    }
                }
            }
        }
    }
    
    // --- STRATEGY 2: Perimeter scan if random sampling failed ---
    // Beaches are guaranteed around the island perimeter, so scan edges
    if coastal_beach_tiles.is_empty() {
        log::warn!("Random sampling found no beach tiles. Scanning island perimeter...");
        
        // Scan the bottom edge (y = near max) - most likely to have beaches
        let perimeter_scan_depth = 30; // Scan 30 tiles inward from edges
        let scan_step = 5; // Check every 5th tile for efficiency
        
        // Bottom edge (high Y values in southern half)
        for y_offset in 0..perimeter_scan_depth {
            let tile_y = (WORLD_HEIGHT_TILES as i32) - 10 - y_offset; // Start 10 tiles from edge
            if tile_y < map_height_half { break; } // Stay in southern half
            
            for tile_x in (0..WORLD_WIDTH_TILES as i32).step_by(scan_step as usize) {
                if let Some(tile_type) = get_tile_type_at_position(ctx, tile_x, tile_y) {
                    if tile_type == TileType::Beach {
                        // Quick coastal check - just need one adjacent water tile
                        for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                            if let Some(adj_type) = get_tile_type_at_position(ctx, tile_x + dx, tile_y + dy) {
                                if adj_type.is_water() {
                                    coastal_beach_tiles.push((tile_x, tile_y));
                                    break;
                                }
                            }
                        }
                    }
                }
                if coastal_beach_tiles.len() >= 10 { break; }
            }
            if coastal_beach_tiles.len() >= 10 { break; }
        }
        
        // Also scan left and right edges if still need more
        if coastal_beach_tiles.len() < 5 {
            for x_offset in 0..perimeter_scan_depth {
                // Left edge
                let tile_x = 10 + x_offset;
                for tile_y in (map_height_half..WORLD_HEIGHT_TILES as i32).step_by(scan_step as usize) {
                    if let Some(tile_type) = get_tile_type_at_position(ctx, tile_x, tile_y) {
                        if tile_type == TileType::Beach {
                            for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                                if let Some(adj_type) = get_tile_type_at_position(ctx, tile_x + dx, tile_y + dy) {
                                    if adj_type.is_water() {
                                        coastal_beach_tiles.push((tile_x, tile_y));
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if coastal_beach_tiles.len() >= 10 { break; }
                }
                
                // Right edge
                let tile_x = (WORLD_WIDTH_TILES as i32) - 10 - x_offset;
                for tile_y in (map_height_half..WORLD_HEIGHT_TILES as i32).step_by(scan_step as usize) {
                    if let Some(tile_type) = get_tile_type_at_position(ctx, tile_x, tile_y) {
                        if tile_type == TileType::Beach {
                            for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                                if let Some(adj_type) = get_tile_type_at_position(ctx, tile_x + dx, tile_y + dy) {
                                    if adj_type.is_water() {
                                        coastal_beach_tiles.push((tile_x, tile_y));
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if coastal_beach_tiles.len() >= 10 { break; }
                }
                if coastal_beach_tiles.len() >= 10 { break; }
            }
        }
        
        if !coastal_beach_tiles.is_empty() {
            log::info!("Perimeter scan found {} coastal beach tiles", coastal_beach_tiles.len());
        }
    }
    
    // --- STRATEGY 3: Emergency fallback - find ANY beach tile (not necessarily coastal) ---
    if coastal_beach_tiles.is_empty() {
        log::warn!("Perimeter scan found no coastal beaches. Searching for ANY beach tile...");
        
        // Scan with larger steps to find any beach
        for tile_y in (map_height_half..WORLD_HEIGHT_TILES as i32).step_by(10) {
            for tile_x in (0..WORLD_WIDTH_TILES as i32).step_by(10) {
                if let Some(tile_type) = get_tile_type_at_position(ctx, tile_x, tile_y) {
                    if tile_type == TileType::Beach {
                        coastal_beach_tiles.push((tile_x, tile_y));
                        if coastal_beach_tiles.len() >= 5 { break; }
                    }
                }
            }
            if coastal_beach_tiles.len() >= 5 { break; }
        }
        
        if !coastal_beach_tiles.is_empty() {
            log::info!("Emergency scan found {} beach tiles", coastal_beach_tiles.len());
        }
    }
    
    // --- STRATEGY 4: Last resort - find ANY walkable land tile ---
    if coastal_beach_tiles.is_empty() {
        log::error!("No beach tiles found anywhere! Finding ANY land tile as last resort...");
        
        // Find any grass or dirt tile in the center-ish area
        let center_x = (WORLD_WIDTH_TILES / 2) as i32;
        let center_y = (WORLD_HEIGHT_TILES * 3 / 4) as i32; // 3/4 down (southern half center)
        
        // Spiral outward from center
        for radius in (0..200).step_by(5) {
            for angle in (0..360).step_by(45) {
                let rad = (angle as f32).to_radians();
                let tile_x = center_x + (rad.cos() * radius as f32) as i32;
                let tile_y = center_y + (rad.sin() * radius as f32) as i32;
                
                // Bounds check
                if tile_x < 0 || tile_x >= WORLD_WIDTH_TILES as i32 { continue; }
                if tile_y < 0 || tile_y >= WORLD_HEIGHT_TILES as i32 { continue; }
                
                if let Some(tile_type) = get_tile_type_at_position(ctx, tile_x, tile_y) {
                    if tile_type.is_walkable() {
                        coastal_beach_tiles.push((tile_x, tile_y));
                        log::warn!("Last resort: Found walkable tile at ({}, {}) - type: {:?}", tile_x, tile_y, tile_type);
                        break;
                    }
                }
            }
            if !coastal_beach_tiles.is_empty() { break; }
        }
    }
    
    // --- ABSOLUTE FINAL FALLBACK: Hardcoded safe position ---
    if coastal_beach_tiles.is_empty() {
        // This should NEVER happen, but if it does, spawn at center of map
        let emergency_x = (WORLD_WIDTH_TILES / 2) as i32;
        let emergency_y = (WORLD_HEIGHT_TILES * 3 / 4) as i32;
        log::error!("CRITICAL: All spawn strategies failed! Using hardcoded fallback position ({}, {})", emergency_x, emergency_y);
        coastal_beach_tiles.push((emergency_x, emergency_y));
    }
    
    // Step 2: Find a valid spawn point from candidate tiles (OPTIMIZED with spatial queries)
    let mut spawn_x: f32;
    let mut spawn_y: f32;
    let max_spawn_attempts = 50;
    let mut spawn_attempt = 0;
    let mut last_collision_reason = String::new();
    let mut selected_tile_x: i32 = 0;
    let mut selected_tile_y: i32 = 0;
    
    // Try to find a valid spawn on a random candidate tile
    loop {
        // Pick a random candidate tile
        let random_index = ctx.rng().gen_range(0..coastal_beach_tiles.len());
        let (tile_x, tile_y) = coastal_beach_tiles[random_index];
        selected_tile_x = tile_x;
        selected_tile_y = tile_y;
        
        // Convert tile coordinates to world pixel coordinates (center of tile)
        spawn_x = (tile_x as f32 * TILE_SIZE_PX as f32) + (TILE_SIZE_PX as f32 / 2.0);
        spawn_y = (tile_y as f32 * TILE_SIZE_PX as f32) + (TILE_SIZE_PX as f32 / 2.0);
        
        log::debug!("Attempt {}: Testing spawn at tile ({}, {}) -> world pos ({:.1}, {:.1})", 
                   spawn_attempt + 1, tile_x, tile_y, spawn_x, spawn_y);
        
        // Step 3: Check for collisions at this beach tile position (OPTIMIZED spatial queries)
        let mut collision = false;
        last_collision_reason.clear();
        
        // OPTIMIZATION: Use spatial grid for ALL collision checks (players, trees, stones, etc.)
        // This avoids scanning entire tables and only checks nearby entities
        let spatial_grid = crate::spatial_grid::get_cached_spatial_grid(&ctx.db, ctx.timestamp);
        let nearby_entities = spatial_grid.get_entities_in_range(spawn_x, spawn_y);
        
        for entity in nearby_entities {
            match entity {
                crate::spatial_grid::EntityType::Player(other_player_id) => {
                    // Check collision with other players (more lenient spacing)
                    if other_player_id == sender_id { continue; } // Skip self
                    if let Some(other_player) = players.identity().find(&other_player_id) {
                        if other_player.is_dead { continue; }
                        let dx = spawn_x - other_player.position_x;
                        let dy = spawn_y - other_player.position_y;
                        let distance_sq = dx * dx + dy * dy;
                        let min_distance_sq = PLAYER_RADIUS * PLAYER_RADIUS * 2.0; // Reduced spacing requirement
                        if distance_sq < min_distance_sq {
                            collision = true;
                            last_collision_reason = format!("Player collision (distance: {:.1})", distance_sq.sqrt());
                            break;
                        }
                    }
                },
                crate::spatial_grid::EntityType::Tree(tree_id) => {
                    if let Some(tree) = trees.id().find(&tree_id) {
                        if tree.health == 0 { continue; }
                        let dx = spawn_x - tree.pos_x;
                        let dy = spawn_y - (tree.pos_y - crate::tree::TREE_COLLISION_Y_OFFSET);
                        let distance_sq = dx * dx + dy * dy;
                        if distance_sq < (crate::tree::PLAYER_TREE_COLLISION_DISTANCE_SQUARED * 0.8) {
                            collision = true;
                            last_collision_reason = format!("Tree collision at ({:.1}, {:.1})", tree.pos_x, tree.pos_y);
                            break;
                        }
                    }
                },
                crate::spatial_grid::EntityType::Stone(stone_id) => {
                    if let Some(stone) = stones.id().find(&stone_id) {
                        if stone.health == 0 { continue; }
                        let dx = spawn_x - stone.pos_x;
                        let dy = spawn_y - (stone.pos_y - crate::stone::STONE_COLLISION_Y_OFFSET);
                        let distance_sq = dx * dx + dy * dy;
                        if distance_sq < (crate::stone::PLAYER_STONE_COLLISION_DISTANCE_SQUARED * 0.8) {
                            collision = true;
                            last_collision_reason = format!("Stone collision at ({:.1}, {:.1})", stone.pos_x, stone.pos_y);
                            break;
                        }
                    }
                },
                crate::spatial_grid::EntityType::RuneStone(rune_stone_id) => {
                    if let Some(rune_stone) = rune_stones.id().find(&rune_stone_id) {
                        let dx = spawn_x - rune_stone.pos_x;
                        let dy = spawn_y - (rune_stone.pos_y - crate::rune_stone::RUNE_STONE_COLLISION_Y_OFFSET);
                        let distance_sq = dx * dx + dy * dy;
                        if distance_sq < (crate::rune_stone::PLAYER_RUNE_STONE_COLLISION_DISTANCE_SQUARED * 0.8) {
                            collision = true;
                            last_collision_reason = format!("RuneStone collision at ({:.1}, {:.1})", rune_stone.pos_x, rune_stone.pos_y);
                            break;
                        }
                    }
                },
                crate::spatial_grid::EntityType::Campfire(campfire_id) => {
                    if let Some(campfire) = campfires.id().find(&campfire_id) {
                        let dx = spawn_x - campfire.pos_x;
                        let dy = spawn_y - (campfire.pos_y - CAMPFIRE_COLLISION_Y_OFFSET);
                        let distance_sq = dx * dx + dy * dy;
                        if distance_sq < (PLAYER_CAMPFIRE_COLLISION_DISTANCE_SQUARED * 0.8) {
                            collision = true;
                            last_collision_reason = format!("Campfire collision at ({:.1}, {:.1})", campfire.pos_x, campfire.pos_y);
                            break;
                        }
                    }
                },
                crate::spatial_grid::EntityType::WoodenStorageBox(box_id) => {
                    if let Some(box_instance) = wooden_storage_boxes.id().find(&box_id) {
                        let dx = spawn_x - box_instance.pos_x;
                        let dy = spawn_y - (box_instance.pos_y - crate::wooden_storage_box::BOX_COLLISION_Y_OFFSET);
                        let distance_sq = dx * dx + dy * dy;
                        if distance_sq < (crate::wooden_storage_box::PLAYER_BOX_COLLISION_DISTANCE_SQUARED * 0.8) {
                            collision = true;
                            last_collision_reason = format!("Storage box collision at ({:.1}, {:.1})", box_instance.pos_x, box_instance.pos_y);
                            break;
                        }
                    }
                },
                _ => {} // Ignore other entity types for spawn collision
            }
            
            if collision { break; }
        }
        
        // If no collision found, we have a valid spawn point!
        if !collision {
            log::info!("SUCCESS: Spawn found at ({:.1}, {:.1}) on tile ({}, {}) after {} attempts", 
                      spawn_x, spawn_y, selected_tile_x, selected_tile_y, spawn_attempt + 1);
            break;
        }
        
        // Log collision reason for debugging
        if spawn_attempt < 10 { // Only log first 10 attempts to avoid spam
            log::debug!("Attempt {} failed: {} at tile ({}, {})", 
                       spawn_attempt + 1, last_collision_reason, selected_tile_x, selected_tile_y);
        }
        
        spawn_attempt += 1;
        if spawn_attempt >= max_spawn_attempts {
            // FORCE spawn on the last attempted beach tile - NO FALLBACK TO ORIGINAL LOCATION
            log::warn!("Could not find collision-free coastal beach spawn after {} attempts. FORCING spawn at last coastal beach tile ({:.1}, {:.1}) - {}", 
                      max_spawn_attempts, spawn_x, spawn_y, last_collision_reason);
            break;
        }
    }
    
    // Final validation - ensure we're spawning on a beach tile
    let final_tile_x = (spawn_x / TILE_SIZE_PX as f32).floor() as i32;
    let final_tile_y = (spawn_y / TILE_SIZE_PX as f32).floor() as i32;
    log::info!("FINAL SPAWN: Player {} will spawn at world coords ({:.1}, {:.1}) which is tile ({}, {})", 
               username, spawn_x, spawn_y, final_tile_x, final_tile_y);
    
    // --- End spawn position logic ---

    // --- Create and Insert New Player ---
    let player = Player {
        identity: sender_id, // Use the authenticated identity
        username: username.clone(),
        position_x: spawn_x, // Use calculated spawn position
        position_y: spawn_y, // Use calculated spawn position
        direction: "down".to_string(),
        last_update: ctx.timestamp,
        last_stat_update: ctx.timestamp,
        jump_start_time_ms: 0,
        health: 100.0,
        stamina: 100.0,
        thirst: PLAYER_STARTING_THIRST,
        hunger: PLAYER_STARTING_HUNGER,
        warmth: 100.0,
        is_sprinting: false,
        is_dead: false,
        death_timestamp: None,
        last_hit_time: None,
        is_online: true, // <<< Keep this for BRAND NEW players
        is_torch_lit: false, // Initialize to false
        is_flashlight_on: false, // Initialize to false
        is_headlamp_lit: false, // Initialize to false
        flashlight_aim_angle: 0.0, // Initialize to 0 radians (pointing right)
        last_consumed_at: None, // Initialize last_consumed_at
        is_crouching: false, // Initialize is_crouching
        is_knocked_out: false, // NEW: Initialize knocked out state
        knocked_out_at: None, // NEW: Initialize knocked out time
        is_on_water: false, // NEW: Initialize is_on_water
        client_movement_sequence: 0,
        is_inside_building: false, // NEW: Players spawn outside (not inside buildings)
        last_respawn_time: ctx.timestamp, // NEW: Track initial spawn time
        insanity: 0.0, // NEW: Start with no insanity
        last_insanity_threshold: 0.0, // NEW: No threshold crossed initially
    };

    // Insert the new player
    match players.try_insert(player) {
        Ok(inserted_player) => {
            log::info!("Player registered: {}. Granting starting items...", username);

            // --- ADD ActiveConnection record for NEW player ---
             let connection_id = ctx.connection_id.ok_or_else(|| {
                 log::error!("[RegisterPlayer] Missing ConnectionId in context for NEW player {:?}", sender_id);
                 "Internal error: Missing connection ID on initial registration".to_string()
             })?;
             let active_connections = ctx.db.active_connection();
             let new_active_conn = ActiveConnection {
                 identity: sender_id,
                 connection_id,
                 timestamp: ctx.timestamp,
             };
             match active_connections.try_insert(new_active_conn) {
                 Ok(_) => {
                     log::info!("[RegisterPlayer] Inserted active connection record for new player {:?}.", sender_id);
                 }
                 Err(e) => {
                     // Log error but don't fail registration
                     log::error!("[RegisterPlayer] Failed to insert active connection for new player {:?}: {}", sender_id, e);
                 }
             }
            // --- END ADD ActiveConnection ---

            // --- Grant Starting Items (Keep existing logic) ---
            match crate::starting_items::grant_starting_items(ctx, sender_id, &username) {
                Ok(_) => { /* Logged inside function */ },
                Err(e) => {
                    log::error!("Unexpected error during grant_starting_items for player {}: {}", username, e);
                }
            }
            // --- End Grant Starting Items ---
            Ok(())
        },
        Err(e) => {
            log::error!("Failed to insert new player {} ({:?}): {}", username, sender_id, e);
            Err(format!("Failed to register player: Database error."))
        }
    }
}

/// Reducer that handles client viewport updates.
/// 
/// This reducer is called by the client to update their visible game area boundaries.
/// It stores the viewport coordinates for each client, which can be used for
/// optimizing game state updates and rendering.
#[spacetimedb::reducer]
pub fn update_viewport(ctx: &ReducerContext, min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> Result<(), String> {
    let client_id = ctx.sender;
    let viewports = ctx.db.client_viewport();
    log::trace!("Reducer update_viewport called by {:?} with bounds: ({}, {}), ({}, {})",
             client_id, min_x, min_y, max_x, max_y);

    let viewport_data = ClientViewport {
        client_identity: client_id,
        min_x,
        min_y,
        max_x,
        max_y,
        last_update: ctx.timestamp,
    };

    // Use insert_or_update logic
    if viewports.client_identity().find(&client_id).is_some() {
        viewports.client_identity().update(viewport_data);
        log::trace!("Updated viewport for client {:?}", client_id);
    } else {
        match viewports.try_insert(viewport_data) {
            Ok(_) => {
                log::trace!("Inserted new viewport for client {:?}", client_id);
            },
            Err(e) => {
                 log::error!("Failed to insert viewport for client {:?}: {}", client_id, e);
                 return Err(format!("Failed to insert viewport: {}", e));
            }
        }
    }
    Ok(())
}

// ADD: Tile types and world generation structures
#[derive(spacetimedb::SpacetimeType, Clone, Debug, PartialEq)]
pub enum TileType {
    Grass,       // Temperate meadows (south/middle of island)
    Dirt, 
    DirtRoad,
    Sea,
    Beach,
    Sand,
    HotSpringWater, // Distinct type for hot spring water pools (teal/turquoise)
    Quarry,      // Quarry tiles (rocky gray-brown texture for mining areas)
    Asphalt,     // Paved compound areas (dark gray, for central compound and mini-compounds)
    Forest,      // Dense forested areas (dark green, higher tree density)
    Tundra,      // Arctic tundra (northern regions - mossy, low vegetation)
    Alpine,      // High-altitude rocky terrain (far north - sparse, rocky)
    TundraGrass, // Grassy patches within tundra biome (lighter green tundra grass)
}

impl TileType {
    /// Returns true if this tile type is any form of water (Sea or HotSpringWater)
    /// Use this instead of checking `== TileType::Sea` to include hot springs
    pub fn is_water(&self) -> bool {
        matches!(self, TileType::Sea | TileType::HotSpringWater)
    }
    
    /// Returns true if this tile type is specifically ocean/sea water (not hot springs)
    pub fn is_sea_water(&self) -> bool {
        matches!(self, TileType::Sea)
    }
    
    /// Returns true if this tile type is hot spring water
    pub fn is_hot_spring_water(&self) -> bool {
        matches!(self, TileType::HotSpringWater)
    }
    
    /// Returns true if this tile is walkable (not water)
    pub fn is_walkable(&self) -> bool {
        !self.is_water()
    }
    
    /// Returns true if this tile can be fished in
    pub fn is_fishable(&self) -> bool {
        // Both sea and hot springs can be fished
        self.is_water()
    }
    
    /// Returns true if drinking is allowed from this tile
    pub fn is_drinkable(&self) -> bool {
        // Both sea and hot springs can be drunk from
        self.is_water()
    }
    
    /// Returns true if this tile should block building placement
    pub fn blocks_building(&self) -> bool {
        // Water tiles and asphalt (compounds) block building
        matches!(self, TileType::Sea | TileType::HotSpringWater | TileType::Asphalt)
    }
    
    /// Returns true if this tile should have water visual effects (waves, etc.)
    pub fn has_water_visuals(&self) -> bool {
        self.is_water()
    }
    
    /// Returns true if this tile is a forest tile (dense vegetation)
    pub fn is_forest(&self) -> bool {
        matches!(self, TileType::Forest)
    }
    
    /// Returns true if this tile is a paved/developed area (asphalt compound)
    pub fn is_paved(&self) -> bool {
        matches!(self, TileType::Asphalt)
    }
    
    /// Returns true if this tile is a road or paved area
    pub fn is_road_or_paved(&self) -> bool {
        matches!(self, TileType::DirtRoad | TileType::Asphalt)
    }
}

#[derive(spacetimedb::SpacetimeType, Clone, Debug)]
pub struct WorldGenConfig {
    pub seed: u64,
    pub world_width_tiles: u32,   // 250
    pub world_height_tiles: u32,  // 250
    pub chunk_size: u32,          // 8
    pub island_border_width: u32, // Sea border thickness
    pub beach_width: u32,         // Beach border thickness
    pub river_frequency: f32,     // 0.0-1.0
    pub dirt_patch_frequency: f32,
    pub road_density: f32,
}

// ADD: Compressed chunk data table for efficient tile transmission
#[spacetimedb::table(
    name = world_chunk_data, 
    public,
    index(name = idx_chunk_coords, btree(columns = [chunk_x, chunk_y]))
)]
#[derive(Clone, Debug)]
pub struct WorldChunkData {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub chunk_x: i32,
    pub chunk_y: i32,
    pub chunk_size: u32, // How many tiles per side (5x5 = 25 tiles)
    pub tile_types: Vec<u8>, // Compressed tile types (25 bytes instead of 25 objects)
    pub variants: Vec<u8>,   // Compressed variants (25 bytes)
    pub generated_at: Timestamp,
}

#[spacetimedb::table(
    name = world_tile, 
    public,
    index(name = idx_chunk_position, btree(columns = [chunk_x, chunk_y])),
    index(name = idx_world_position, btree(columns = [world_x, world_y]))
)]
#[derive(Clone, Debug)]
pub struct WorldTile {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub chunk_x: i32,
    pub chunk_y: i32,
    pub tile_x: i32,  // Local tile position within chunk
    pub tile_y: i32,  // Local tile position within chunk
    pub world_x: i32, // Global world position for easier queries
    pub world_y: i32, // Global world position for easier queries
    pub tile_type: TileType,
    pub variant: u8,  // For tile variations (0-255)
    pub biome_data: Option<String>, // JSON for future biome properties
}

#[spacetimedb::table(name = minimap_cache, public)]
#[derive(Clone, Debug)]
pub struct MinimapCache {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>, // Compressed minimap data as color values
    pub generated_at: Timestamp,
}

/// Shipwreck monument positions (dynamically placed during world generation)
#[spacetimedb::table(name = shipwreck_part, public)]
#[derive(Clone, Debug)]
pub struct ShipwreckPart {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    /// World X position in pixels
    pub world_x: f32,
    /// World Y position in pixels
    pub world_y: f32,
    /// Image filename (e.g., "hull1.png")
    pub image_path: String,
    /// Whether this is the center piece (hull1.png)
    pub is_center: bool,
    /// Collision radius in pixels
    pub collision_radius: f32,
}

// ADD: Utility functions for tile compression
impl TileType {
    /// Convert TileType to u8 for compression
    pub fn to_u8(&self) -> u8 {
        match self {
            TileType::Grass => 0,
            TileType::Dirt => 1,
            TileType::DirtRoad => 2,
            TileType::Sea => 3,
            TileType::Beach => 4,
            TileType::Sand => 5,
            TileType::HotSpringWater => 6,
            TileType::Quarry => 7,
            TileType::Asphalt => 8,
            TileType::Forest => 9,
            TileType::Tundra => 10,
            TileType::Alpine => 11,
            TileType::TundraGrass => 12,
        }
    }
    
    /// Convert u8 back to TileType for decompression
    pub fn from_u8(value: u8) -> Option<TileType> {
        match value {
            0 => Some(TileType::Grass),
            1 => Some(TileType::Dirt),
            2 => Some(TileType::DirtRoad),
            3 => Some(TileType::Sea),
            4 => Some(TileType::Beach),
            5 => Some(TileType::Sand),
            6 => Some(TileType::HotSpringWater),
            7 => Some(TileType::Quarry),
            8 => Some(TileType::Asphalt),
            9 => Some(TileType::Forest),
            10 => Some(TileType::Tundra),
            11 => Some(TileType::Alpine),
            12 => Some(TileType::TundraGrass),
            _ => None,
        }
    }
    
    /// Returns true if this is a cold/arctic biome tile (Tundra, TundraGrass, or Alpine)
    pub fn is_arctic(&self) -> bool {
        matches!(self, TileType::Tundra | TileType::TundraGrass | TileType::Alpine)
    }
    
    /// Returns true if this is tundra (including TundraGrass)
    pub fn is_tundra(&self) -> bool {
        matches!(self, TileType::Tundra | TileType::TundraGrass)
    }
    
    /// Returns true if this is alpine terrain
    pub fn is_alpine(&self) -> bool {
        matches!(self, TileType::Alpine)
    }
    
    /// Returns true if this tile can support trees (not water, alpine, or paved)
    pub fn can_have_trees(&self) -> bool {
        !matches!(self, TileType::Sea | TileType::HotSpringWater | TileType::Asphalt | TileType::Alpine | TileType::Beach | TileType::Sand)
    }
}

/// NEW: Manual reducer to generate compressed chunk data for testing/debugging
/// This can be called by clients to force regeneration of compressed chunk data
#[spacetimedb::reducer]
pub fn regenerate_compressed_chunks(ctx: &ReducerContext) -> Result<(), String> {
    log::info!("Manual regeneration of compressed chunk data requested by {:?}", ctx.sender);
    
    // Clear existing compressed chunk data
    let world_chunk_data = ctx.db.world_chunk_data();
    let chunks_to_delete: Vec<_> = world_chunk_data.iter().collect();
    for chunk in chunks_to_delete {
        world_chunk_data.id().delete(chunk.id);
    }
    
    // Regenerate compressed chunk data
    match crate::world_generation::generate_compressed_chunk_data(ctx) {
        Ok(_) => {
            let new_chunk_count = world_chunk_data.iter().count();
            log::info!("Successfully regenerated {} compressed chunks", new_chunk_count);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to regenerate compressed chunk data: {}", e);
            Err(format!("Failed to regenerate compressed chunks: {}", e))
        }
    }
}