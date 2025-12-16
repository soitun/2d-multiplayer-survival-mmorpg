# Server Module Architecture

This document describes the organization and patterns used in the SpacetimeDB Rust server module.

## Module Organization

The server is organized into focused modules, each handling a specific game system. All modules are declared in `server/src/lib.rs`.

### Core Systems

```rust
// lib.rs - Module declarations
mod environment;        // World generation, chunk management
mod world_state;       // Time of day, weather, global state
mod world_generation;  // Terrain and biome generation
mod spatial_grid;      // Optimized collision detection
```

### Player Systems

```rust
mod player_movement;   // Position updates, sprinting, crouching
mod player_stats;      // Health, hunger, thirst, warmth
mod player_inventory;  // Inventory management
mod active_equipment;  // Equipped items
mod combat;           // Melee and ranged combat
mod knocked_out;      // Downed state and recovery
mod respawn;          // Death and respawn logic
```

### Resource Systems

```rust
mod tree;             // Tree entities and harvesting
mod stone;            // Stone nodes and mining
mod harvestable_resource; // Unified resource collection
mod collectible_resources; // Mushrooms, fiber, etc.
```

### Container Systems (See CONTAINER_ARCHITECTURE_DESIGN.md for details)

```rust
// Fuel-burning containers (active processing)
mod campfire;
mod furnace;
mod barbecue;
mod lantern;

// Storage containers (passive storage with optional processing)
mod wooden_storage_box;
mod refrigerator;
mod compost;
mod stash;
mod player_corpse;
mod homestead_hearth;

// Hybrid containers
mod broth_pot;        // Cooking attachment
mod rain_collector;   // Passive water collection
```

### Building Systems

```rust
mod building;         // Foundations and structures
mod building_enclosure; // Interior detection
mod building_decay;   // Upkeep and decay
mod door;            // Door interactions
mod shelter;         // Basic shelter placement
```

### Crafting & Items

```rust
mod items;           // Item instance management
mod items_database;  // Item definitions (tools, weapons, etc.)
mod crafting;        // Recipe definitions
mod crafting_queue;  // Queued crafting jobs
mod cooking;         // Food cooking logic
mod recipes;         // Broth pot recipes
mod repair;          // Item and structure repair
```

### World Features

```rust
mod wild_animal_npc;  // Animals with AI
mod planted_seeds;    // Farming system
mod fishing;         // Fishing minigame
mod monument;        // Clearance zones
mod shipwreck;       // Shipwreck monument
mod fishing_village; // Village monument
mod barrel;          // Loot barrels
mod rune_stone;      // Memory shard sources
mod cairn;           // Lore discovery
```

### Economy & Progression

```rust
mod alk;             // ALK contract delivery system
mod matronage;       // Clan-like organizations
mod memory_grid;     // Tech tree unlocks
```

## Reducer Patterns

### Basic Reducer Structure

```rust
#[spacetimedb::reducer]
pub fn place_campfire(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> Result<(), String> {
    // 1. Validate caller
    let player = ctx.db.player().identity().find(&ctx.sender)
        .ok_or("Player not found")?;
    
    // 2. Validate state
    if player.is_dead { return Err("Cannot place while dead".into()); }
    
    // 3. Validate position
    if !is_valid_placement(ctx, pos_x, pos_y) {
        return Err("Invalid placement location".into());
    }
    
    // 4. Perform action
    ctx.db.campfire().insert(Campfire {
        id: 0, // auto_inc
        pos_x,
        pos_y,
        is_burning: false,
        // ...other fields
    });
    
    // 5. Return success
    Ok(())
}
```

### Scheduled Reducers

For time-based processing (game loops, cooking, decay):

```rust
// 1. Define schedule table
#[spacetimedb::table(name = campfire_processing_schedule, scheduled(process_campfire_logic_scheduled))]
pub struct CampfireProcessingSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

// 2. Define scheduled reducer
#[spacetimedb::reducer]
pub fn process_campfire_logic_scheduled(ctx: &ReducerContext, args: CampfireProcessingSchedule) -> Result<(), String> {
    // Security check - only scheduler can call
    if ctx.sender != ctx.identity() {
        return Err("Unauthorized".into());
    }
    
    // Process all campfires
    for mut campfire in ctx.db.campfire().iter().filter(|c| c.is_burning) {
        // Update fuel, cooking progress, etc.
    }
    
    // Reschedule
    schedule_next_campfire_processing(ctx)?;
    Ok(())
}

// 3. Schedule initialization
pub fn init_campfire_system(ctx: &ReducerContext) -> Result<(), String> {
    ctx.db.campfire_processing_schedule().insert(CampfireProcessingSchedule {
        scheduled_id: 0,
        scheduled_at: ScheduleAt::Interval(Duration::from_secs(1).into()),
    });
    Ok(())
}
```

### Container Reducer Pattern

Container types follow a consistent pattern for inventory operations:

```rust
// Move item into container
#[spacetimedb::reducer]
pub fn move_item_to_campfire(ctx: &ReducerContext, campfire_id: u64, slot_index: u32, item_id: u64) -> Result<(), String>

// Move item out of container
#[spacetimedb::reducer]
pub fn move_item_from_campfire(ctx: &ReducerContext, campfire_id: u64, slot_index: u32, target_slot: u32) -> Result<(), String>

// Quick move (auto-stack)
#[spacetimedb::reducer]
pub fn quick_move_to_campfire(ctx: &ReducerContext, campfire_id: u64, item_id: u64) -> Result<(), String>

// Split stack
#[spacetimedb::reducer]
pub fn split_stack_into_campfire(ctx: &ReducerContext, campfire_id: u64, slot_index: u32, source_id: u64, quantity: u32) -> Result<(), String>
```

## Table Patterns

### Basic Entity Table

```rust
#[spacetimedb::table(
    name = campfire,
    public,
    index(name = idx_campfire_pos, btree(columns = [pos_x, pos_y]))
)]
#[derive(Clone)]
pub struct Campfire {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    pub is_burning: bool,
    pub current_fuel_def_id: Option<u64>,
    pub remaining_fuel_burn_time_secs: f32,
    // Slot fields for container functionality
    pub slot_0_item_instance_id: Option<u64>,
    pub slot_0_cooking_progress_secs: f32,
    // ...
}
```

### Spatial Indexing

For entities that need position-based queries:

```rust
#[spacetimedb::table(
    name = player,
    public,
    index(name = idx_player_pos, btree(columns = [position_x, position_y]))
)]
```

### Schedule Tables

For timed events:

```rust
#[spacetimedb::table(name = schedule_name, scheduled(reducer_name))]
pub struct ScheduleTable {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
    // Optional: Additional data for the scheduled reducer
}
```

## Lifecycle Reducers

### Module Initialization

```rust
#[spacetimedb::reducer(init)]
pub fn init_module(ctx: &ReducerContext) -> Result<(), String> {
    // Seed static data (items, recipes)
    crate::items::seed_items(ctx)?;
    crate::crafting::seed_recipes(ctx)?;
    
    // Initialize scheduled systems
    crate::player_stats::init_player_stat_schedule(ctx)?;
    crate::global_tick::init_global_tick_schedule(ctx)?;
    
    // Generate world if needed
    if ctx.db.world_tile().iter().count() == 0 {
        crate::world_generation::generate_world(ctx, config)?;
        crate::environment::seed_environment(ctx)?;
    }
    
    Ok(())
}
```

### Client Connection

```rust
#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(ctx: &ReducerContext) -> Result<(), String> {
    // Track connection
    ctx.db.active_connection().insert(ActiveConnection {
        identity: ctx.sender,
        connection_id: ctx.connection_id.unwrap(),
        timestamp: ctx.timestamp,
    });
    
    // Update player online status
    if let Some(mut player) = ctx.db.player().identity().find(&ctx.sender) {
        player.is_online = true;
        ctx.db.player().identity().update(player);
    }
    
    Ok(())
}
```

### Client Disconnection

```rust
#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(ctx: &ReducerContext) {
    // Only process if this is still the active connection
    if let Some(active_conn) = ctx.db.active_connection().identity().find(&ctx.sender) {
        if active_conn.connection_id == ctx.connection_id.unwrap() {
            // Clean up connection record
            ctx.db.active_connection().identity().delete(&ctx.sender);
            
            // Set player offline and create offline corpse
            if let Some(mut player) = ctx.db.player().identity().find(&ctx.sender) {
                player.is_online = false;
                if !player.is_dead {
                    // Create corpse to hold player's items while offline
                }
                ctx.db.player().identity().update(player);
            }
        }
    }
}
```

## Error Handling

### Result-Based Errors

Preferred for expected failures:

```rust
#[spacetimedb::reducer]
pub fn action(ctx: &ReducerContext) -> Result<(), String> {
    if !valid_condition {
        return Err("Human-readable error message".into());
    }
    // Action succeeds
    Ok(())
}
```

### Panics

Reserved for truly unexpected states:

```rust
// Only panic for invariant violations
let item = items.get(&id).expect("Item must exist if referenced");
```

## Macro Utilities

### Schedule Initialization with Retry

```rust
#[macro_export]
macro_rules! try_insert_schedule {
    ($table:expr, $schedule:expr, $system_name:expr) => {{
        match $table.try_insert($schedule) {
            Ok(_) => log::info!("{} schedule initialized", $system_name),
            Err(e) => {
                log::error!("⚠️ Failed to initialize {} schedule: {}", $system_name, e);
                log::error!("⚠️ {} system will be DISABLED", $system_name);
            }
        }
    }};
}
```

## Best Practices

1. **Validate Early:** Check permissions and state at the start of reducers
2. **Atomic Operations:** Each reducer is a single transaction
3. **Consistent Naming:** Follow the established patterns for reducer names
4. **Log Important Events:** Use `log::info!`, `log::warn!`, `log::error!`
5. **Re-export Reducers:** In `lib.rs`, re-export reducers needed by clients
6. **Security Checks:** For scheduled reducers, always verify `ctx.sender == ctx.identity()`

