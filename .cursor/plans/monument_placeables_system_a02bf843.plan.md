---
name: Monument Placeables System
overview: Add a system for permanent, indestructible monument placeables (campfires, furnaces, etc.) at safe zones, and implement exclusive container access in safe zones where only one player can use a container at a time.
todos:
  - id: schema-changes
    content: Add is_monument, active_user_id, active_user_since fields to Campfire, Furnace, Barbecue, RainCollector, WoodenStorageBox tables
    status: completed
  - id: monument-config
    content: Create MonumentPlaceableType enum and MonumentPlaceableConfig struct in monument.rs
    status: completed
  - id: monument-spawn
    content: Implement spawn_monument_placeables function and define configs for Central Compound, Shipwreck, Fishing Village
    status: completed
  - id: world-gen-integration
    content: Call spawn functions in world_generation.rs after monument positions are set
    status: completed
  - id: indestructible
    content: Add is_monument checks in combat.rs damage handlers to skip damage
    status: completed
  - id: access-validation
    content: Create validate_container_access helper and integrate into existing validation functions
    status: completed
  - id: open-close-reducers
    content: Add open_*_container and close_*_container reducers for each container type
    status: completed
  - id: auto-release
    content: Add distance/offline auto-release in scheduled processing reducers
    status: completed
  - id: client-integration
    content: Update client to call open/close reducers when container UI opens/closes
    status: completed
---

# Monument Placeables and Safe Zone Container Exclusivity

## Part 1: Monument Placeable System

### 1.1 Schema Changes - Add `is_monument` Flag

Add a boolean field to each container table to mark it as a permanent monument placeable:

**Files to modify:**

- [`server/src/campfire.rs`](server/src/campfire.rs) - Add `pub is_monument: bool` to `Campfire` struct
- [`server/src/furnace.rs`](server/src/furnace.rs) - Add `pub is_monument: bool` to `Furnace` struct  
- [`server/src/barbecue.rs`](server/src/barbecue.rs) - Add `pub is_monument: bool` to `Barbecue` struct
- [`server/src/rain_collector.rs`](server/src/rain_collector.rs) - Add `pub is_monument: bool` to `RainCollector` struct
- [`server/src/wooden_storage_box.rs`](server/src/wooden_storage_box.rs) - Add `pub is_monument: bool` to `WoodenStorageBox` struct (covers Compost, Repair Bench, Cooking Station)

### 1.2 Monument Placeable Configuration

Create a new configuration module in [`server/src/monument.rs`](server/src/monument.rs):

```rust
#[derive(Clone, Debug)]
pub enum MonumentPlaceableType {
    Campfire,
    Furnace,
    Barbecue,
    RainCollector,
    CookingStation,
    RepairBench,
    Compost,
}

#[derive(Clone, Debug)]
pub struct MonumentPlaceableConfig {
    pub placeable_type: MonumentPlaceableType,
    pub offset_x: f32,  // Relative to monument center
    pub offset_y: f32,
    pub initial_fuel: Option<u32>,  // For campfires/furnaces
}
```

Define configurations for each monument:

```rust
pub fn get_central_compound_placeables() -> Vec<MonumentPlaceableConfig> {
    vec![
        MonumentPlaceableConfig { placeable_type: Campfire, offset_x: -150.0, offset_y: 100.0, initial_fuel: Some(50) },
        MonumentPlaceableConfig { placeable_type: Campfire, offset_x: 150.0, offset_y: 100.0, initial_fuel: Some(50) },
        MonumentPlaceableConfig { placeable_type: Furnace, offset_x: -200.0, offset_y: -50.0, initial_fuel: Some(50) },
        // ... etc
    ]
}

pub fn get_shipwreck_placeables() -> Vec<MonumentPlaceableConfig> { ... }
pub fn get_fishing_village_placeables() -> Vec<MonumentPlaceableConfig> { ... }
```

### 1.3 Spawn Monument Placeables

Add spawn function in [`server/src/monument.rs`](server/src/monument.rs):

```rust
pub fn spawn_monument_placeables(
    ctx: &ReducerContext,
    monument_center_x: f32,
    monument_center_y: f32,
    configs: &[MonumentPlaceableConfig],
) -> Result<(), String>
```

Call from [`server/src/world_generation.rs`](server/src/world_generation.rs) after monument positions are determined.

### 1.4 Make Monument Placeables Indestructible

Modify combat damage handlers in [`server/src/combat.rs`](server/src/combat.rs) to skip damage for monument placeables:

```rust
// In damage_campfire, damage_furnace, etc.
if campfire.is_monument {
    return Err("Cannot damage monument structures.".to_string());
}
```

### 1.5 Remove Ownership Checks for Monument Placeables

Monument placeables use a sentinel identity (e.g., `Identity::__dummy()` or create a constant `MONUMENT_OWNER`) for `placed_by` to indicate they have no player owner.

---

## Part 2: Safe Zone Container Exclusivity

### 2.1 Schema Changes - Add Active User Tracking

Add fields to track who is currently using a container:

**Same files as Part 1:**

- Add `pub active_user_id: Option<Identity>` - Currently viewing player
- Add `pub active_user_since: Option<Timestamp>` - When they opened it

### 2.2 Container Access Validation

Modify validation functions to check for exclusive access in safe zones:

```rust
// In validate_campfire_interaction, validate_furnace_interaction, etc.
fn validate_container_access(
    ctx: &ReducerContext,
    container_pos_x: f32,
    container_pos_y: f32,
    active_user_id: Option<Identity>,
    active_user_since: Option<Timestamp>,
) -> Result<(), String> {
    // Only enforce in safe zones
    if !crate::active_effects::is_player_in_safe_zone(ctx, container_pos_x, container_pos_y) {
        return Ok(());
    }
    
    // Check if another player is using it (with 60s timeout)
    if let Some(user_id) = active_user_id {
        if user_id != ctx.sender {
            if let Some(since) = active_user_since {
                let elapsed = ctx.timestamp.duration_since(since);
                if elapsed.as_secs() < 60 {
                    return Err("Another player is currently using this container.".to_string());
                }
            }
        }
    }
    Ok(())
}
```

### 2.3 Open/Close Container Reducers

Add new reducers for each container type:

```rust
#[spacetimedb::reducer]
pub fn open_campfire_container(ctx: &ReducerContext, campfire_id: u32) -> Result<(), String>

#[spacetimedb::reducer]
pub fn close_campfire_container(ctx: &ReducerContext, campfire_id: u32) -> Result<(), String>
```

The open reducer:

1. Validates player proximity
2. Checks safe zone exclusivity
3. Sets `active_user_id` and `active_user_since`

The close reducer:

1. Clears `active_user_id` if it matches sender

### 2.4 Auto-Release on Distance/Disconnect

In the scheduled processing reducers (e.g., `process_campfire_logic_scheduled`):

```rust
// Auto-release if active user is too far away or offline
if let Some(user_id) = campfire.active_user_id {
    let should_release = match ctx.db.player().identity().find(&user_id) {
        Some(player) => {
            let dx = player.position_x - campfire.pos_x;
            let dy = player.position_y - campfire.pos_y;
            dx*dx + dy*dy > INTERACTION_DISTANCE_SQUARED
        }
        None => true // Player offline
    };
    if should_release {
        campfire.active_user_id = None;
        campfire.active_user_since = None;
    }
}
```

---

## Implementation Order

1. Add schema fields (requires `spacetime publish -c` to clear DB)
2. Add monument placeable config and spawn functions
3. Call spawn functions in world generation
4. Add indestructibility checks in combat
5. Add container access validation
6. Add open/close reducers
7. Regenerate TypeScript bindings
8. Update client to call open/close reducers

## Files Summary

**Server modifications:**

- `server/src/campfire.rs` - Schema + validation + open/close
- `server/src/furnace.rs` - Schema + validation + open/close  
- `server/src/barbecue.rs` - Schema + validation + open/close
- `server/src/rain_collector.rs` - Schema + validation + open/close
- `server/src/wooden_storage_box.rs` - Schema + validation + open/close
- `server/src/monument.rs` - Config structs + spawn functions
- `server/src/world_generation.rs` - Call spawn functions
- `server/src/combat.rs` - Skip damage for monuments
- `server/src/lib.rs` - Export new reducers

**Client modifications:**

- Call `open_*_container` when UI opens
- Call `close_*_container` when UI closes