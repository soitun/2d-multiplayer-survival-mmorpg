---
name: Military Ration Loot Crates
overview: Implement military ration loot crates that spawn on roads, monuments (shipwreck), and quarries. These containers hold 3 slots, typically spawn with 1-2 food items (up to 3, never 0), with small stacks (1-2 max per item, mostly 1). They disappear when empty and respawn only if fully looted. Also add barrel spawning in quarries.
todos:
  - id: "1"
    content: Add military ration box type constants and slot count to wooden_storage_box.rs
    status: pending
  - id: "2"
    content: Add respawn_at field to WoodenStorageBox table for respawn tracking
    status: pending
  - id: "3"
    content: Create military_ration.rs module with loot table and spawn functions
    status: pending
  - id: "4"
    content: Implement auto-deletion function for empty military rations
    status: pending
  - id: "5"
    content: Add road spawning logic for military rations in barrel clusters
    status: pending
  - id: "6"
    content: Add shipwreck monument spawning for military rations
    status: pending
  - id: "7"
    content: Add quarry spawning for military rations and barrels
    status: pending
  - id: "8"
    content: Implement respawn system with scheduled reducer
    status: pending
  - id: "9"
    content: Update client-side rendering for military ration containers
    status: pending
  - id: "10"
    content: Register module and test spawning/respawning
    status: pending
---

# Military Ration Loot Crates Implementation Plan

## Overview

Add military ration containers that spawn as loot crates in various locations. They extend the wooden storage box system with 3 slots, typically spawn with 1-2 food items (can be up to 3, never 0), with small stacks (1-2 max per item, mostly 1). They auto-delete when empty and respawn only if fully looted.

## Architecture

### Container System

- **New Box Type**: Add `BOX_TYPE_MILITARY_RATION = 8` to `wooden_storage_box.rs`
- **Slot Count**: `NUM_MILITARY_RATION_SLOTS = 3`
- **Auto-Deletion**: Similar to backpack system - check and delete when empty after item removal
- **Respawn Logic**: Track if crate was fully looted (all items removed) vs partially looted

### Spawning Locations

1. **Roads**: Spawn in same clusters as barrels (1-3 rations per cluster)
2. **Shipwreck Monument**: Spawn on ground around shipwreck parts (not fishing village)
3. **Quarries**: Spawn in small and large quarries (balance: fewer than roads)
4. **Barrels in Quarries**: Add barrel spawning to quarries (with military rations)

## Implementation Steps

### 1. Server-Side Container Type (`server/src/wooden_storage_box.rs`)

**Add Constants:**

```rust
pub const BOX_TYPE_MILITARY_RATION: u8 = 8;
pub const NUM_MILITARY_RATION_SLOTS: usize = 6;
```

**Update `num_slots()` implementation:**

- Add case for `BOX_TYPE_MILITARY_RATION` returning `NUM_MILITARY_RATION_SLOTS`

**Add Respawn Tracking Field:**

- Add `respawn_at: Timestamp` field to `WoodenStorageBox` table (indexed)
- Use `Timestamp::UNIX_EPOCH` (0) for "not respawning" or "partially looted"
- Set future timestamp when fully looted to trigger respawn

**Add Auto-Deletion Function:**

```rust
pub fn check_and_despawn_military_ration_if_empty(
    ctx: &ReducerContext, 
    ration_id: u32
) -> Result<(), String>
```

- Check if all 3 slots are empty
- If empty, delete the container
- Schedule respawn if this was a spawned crate (not player-placed)

**Update Item Removal Handlers:**

- Call `check_and_despawn_military_ration_if_empty()` after:
  - `handle_move_from_container_slot()` 
  - `handle_split_from_container_slot()`
  - `handle_quick_move_from_container()`
- Only for `BOX_TYPE_MILITARY_RATION` type

### 2. Loot Table System (`server/src/military_ration.rs` - NEW FILE)

**Create Loot Entry Structure:**

```rust
pub struct MilitaryRationLootEntry {
    pub item_def_name: String,  // Food item name
    pub min_quantity: u32,
    pub max_quantity: u32,
    pub spawn_chance: f32,      // 0.0 to 1.0
}
```

**Define Food Loot Table:**

- Common foods: Cooked Potato, Cooked Carrot, Cooked Corn (high chance)
- Uncommon: Cooked Pumpkin, Cooked Beet (medium chance)
- Rare: Canned goods or preserved foods if they exist (low chance)
- Balance: Ensure 6 slots typically filled with varied food

**Spawn Function:**

```rust
pub fn spawn_military_ration_with_loot(
    ctx: &ReducerContext,
    pos_x: f32,
    pos_y: f32,
    chunk_index: u32
) -> Result<u32, String>
```

- Create `WoodenStorageBox` with `box_type = BOX_TYPE_MILITARY_RATION`
- Fill 6 slots with food items from loot table
- Return box ID

### 3. Road Spawning (`server/src/barrel.rs`)

**Update `spawn_barrel_clusters()`:**

- After spawning barrel cluster, spawn 1-3 military rations nearby
- Use same cluster spacing logic (200px minimum between clusters)
- Spawn rations within 50-100px of barrel cluster center
- Call `military_ration::spawn_military_ration_with_loot()` for each

**Respawn Logic:**

- When barrel respawns, also respawn associated military rations
- Track cluster_id for rations to respawn with barrels

### 4. Monument Spawning (`server/src/monument.rs`)

**Add Shipwreck Ration Spawning:**

```rust
pub fn spawn_shipwreck_military_rations(
    ctx: &ReducerContext,
    monument_part_positions: &[(f32, f32)],
) -> Result<(), String>
```

- Spawn 2-4 rations per shipwreck part (similar to barrel spawning)
- 60% chance per part
- Distance: 100-250px from parts
- Only on ground (not water)
- Call `military_ration::spawn_military_ration_with_loot()` for each

**Update `world_generation.rs`:**

- Call `spawn_shipwreck_military_rations()` after spawning shipwreck barrels
- Do NOT spawn at fishing village (already excluded)

### 5. Quarry Spawning (`server/src/environment.rs`)

**Add Quarry Ration Spawning:**

- In `seed_quarry_entities()` function
- Spawn chance: 0.003 (0.3% per quarry tile) - balanced lower than roads
- Check collision with stones, fumaroles, basalt columns
- Call `military_ration::spawn_military_ration_with_loot()` for each

**Add Quarry Barrel Spawning:**

- Spawn barrels in quarries (variants 0-2 for road barrels)
- Spawn chance: 0.002 (0.2% per quarry tile)
- Same collision checks as rations
- Use `barrel::spawn_barrel_clusters_scaled()` or direct spawning

### 6. Respawn System (`server/src/military_ration.rs`)

**Scheduled Reducer:**

```rust
#[spacetimedb::table(name = military_ration_respawn_schedule, scheduled(respawn_military_rations))]
struct MilitaryRationRespawnSchedule {
    #[primary_key]
    #[auto_inc]
    scheduled_id: u64,
    scheduled_at: ScheduleAt,
    spawn_location_type: String,  // "road", "shipwreck", "quarry"
    spawn_data: SpawnData,        // Position, cluster_id, etc.
}
```

**Respawn Logic:**

- When ration becomes empty, check if it was fully looted (all items removed)
- If fully looted, schedule respawn (5-10 minutes)
- If partially looted, delete without respawn
- Respawn at original location with new loot (1-3 items, typically 1-2)

### 7. Client-Side Rendering (`client/src/utils/renderers/`)

**Update `renderingUtils.ts`:**

- Add case for `BOX_TYPE_MILITARY_RATION` in container rendering
- Use `military_ration.png` doodad sprite
- Render as container (similar to wooden storage box)

**Update `containerUtils.ts`:**

- Add `military_ration` to container type checks
- Use same interaction logic as storage boxes

**Update `entityVisualConfig.ts`:**

- Add visual config for military ration container
- Set sprite to `military_ration.png`
- Set collision radius similar to storage boxes

### 8. Module Registration (`server/src/lib.rs`)

**Add Module:**

```rust
mod military_ration;
```

**Register Reducers:**

- Import and register `respawn_military_rations` scheduled reducer

### 9. Item Definition (`server/src/items_database/placeables.rs`)

**Optional: Add Placeable Definition:**

- If players should be able to craft/place military rations (probably not needed for loot crates)
- Otherwise, skip this step

## Files to Modify

1. `server/src/wooden_storage_box.rs` - Add box type, slots, auto-deletion
2. `server/src/military_ration.rs` - NEW FILE - Loot table and spawning logic
3. `server/src/barrel.rs` - Add ration spawning to road clusters
4. `server/src/monument.rs` - Add shipwreck ration spawning
5. `server/src/environment.rs` - Add quarry ration and barrel spawning
6. `server/src/world_generation.rs` - Call shipwreck ration spawning
7. `server/src/lib.rs` - Register new module
8. `client/src/utils/renderers/renderingUtils.ts` - Add rendering support
9. `client/src/utils/containerUtils.ts` - Add container type support
10. `client/src/utils/entityVisualConfig.ts` - Add visual config

## Testing Considerations

1. **Spawn Verification:**

   - Verify rations spawn on roads with barrels
   - Verify rations spawn at shipwreck (not fishing village)
   - Verify rations spawn in quarries
   - Verify barrels spawn in quarries

2. **Loot Verification:**

   - Verify 1-3 slots are filled with food items (typically 1-2, never 0)
   - Verify item stacks are small (1-2 max per item, mostly 1)
   - Verify loot variety (not all same item)
   - Verify loot is determined at spawn time
   - Verify distribution matches expected ratios (~60% 1 item, ~35% 2 items, ~5% 3 items)

3. **Respawn Verification:**

   - Verify rations respawn only if fully looted
   - Verify rations don't respawn if partially looted
   - Verify respawn timing (5-10 minutes)

4. **Deletion Verification:**

   - Verify rations disappear when empty
   - Verify no memory leaks from deleted containers

## Balance Notes

- **Road Spawning**: 1-3 rations per barrel cluster (common loot source)
- **Shipwreck**: 2-4 rations per part (monument reward)
- **Quarries**: 0.3% spawn chance (rarer, balanced for PvP areas)
- **Barrels in Quarries**: 0.2% spawn chance (additional loot)
- **Food Variety**: Mix of common/uncommon foods, avoid all same item
- **Item Count**: Typically 1-2 items per crate, up to 3, never 0
- **Stack Sizes**: Mostly 1 item per stack, occasionally 2, never more