# Container Architecture Design Philosophy

This document explains the architectural design decisions behind the different container types in the game's server-side code.

## Overview

The game has several types of "containers" - entities that hold items and may process them in various ways. These containers follow different design patterns based on their gameplay requirements:

| Category | Examples | Key Characteristic |
|----------|----------|-------------------|
| **Fuel-Burning Containers** | Campfire, Barbecue, Furnace, Lantern | Self-contained with internal fuel + scheduled processing |
| **Storage Containers** | Wooden Storage Box, Refrigerator, Compost Bin, Bakery | Passive storage with optional time-based transformations |
| **Processing Attachments** | Broth Pot | Depends on external heat source + scheduled processing |
| **External-Update Containers** | Rain Collector | Updated by external systems (weather) |

---

## 1. Fuel-Burning Containers

**Files:** `campfire.rs`, `barbecue.rs`, `furnace.rs`, `lantern.rs`

### Core Design

These containers share a common pattern centered around **active, real-time processing with internal fuel management**:

```
┌────────────────────────────────────────┐
│         FUEL-BURNING CONTAINER         │
├────────────────────────────────────────┤
│  State:                                │
│  • is_burning: bool                    │
│  • current_fuel_def_id: Option<u64>    │
│  • remaining_fuel_burn_time_secs: f32  │
│  • slot_X_cooking_progress: f32        │
├────────────────────────────────────────┤
│  Scheduled Table:                      │
│  • XxxProcessingSchedule               │
│  • Ticks every 1 second                │
├────────────────────────────────────────┤
│  Processing Logic:                     │
│  1. Check if burning                   │
│  2. Consume fuel over time             │
│  3. Update cooking progress per slot   │
│  4. Transform items when complete      │
│  5. Reschedule next tick               │
└────────────────────────────────────────┘
```

### State Management

```rust
// Typical fuel container state fields
pub struct Campfire {
    // Toggle state
    pub is_burning: bool,
    
    // Fuel tracking
    pub current_fuel_def_id: Option<u64>,
    pub remaining_fuel_burn_time_secs: f32,
    
    // Per-slot cooking progress
    pub slot_0_cooking_progress: f32,
    pub slot_1_cooking_progress: f32,
    // ... etc
}
```

### Scheduled Processing

Each fuel container has its own scheduled reducer table that ticks every second when active:

```rust
#[spacetimedb::table(name = campfire_processing_schedule, scheduled(process_campfire_logic_scheduled))]
pub struct CampfireProcessingSchedule {
    #[primary_key]
    pub campfire_id: u64,
    pub scheduled_at: ScheduleAt,
}
```

### Processing Flow

```
Player Lights Fire
        │
        ▼
┌───────────────────┐
│ Schedule 1s Tick  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ process_X_logic   │◄──────────────────┐
│   _scheduled()    │                   │
└─────────┬─────────┘                   │
          │                             │
          ▼                             │
┌───────────────────┐                   │
│ 1. Burn fuel      │                   │
│    (reduce time)  │                   │
└─────────┬─────────┘                   │
          │                             │
          ▼                             │
┌───────────────────┐                   │
│ 2. Update cooking │                   │
│    progress/slot  │                   │
└─────────┬─────────┘                   │
          │                             │
          ▼                             │
┌───────────────────┐                   │
│ 3. Transform if   │                   │
│    complete       │                   │
└─────────┬─────────┘                   │
          │                             │
          ▼                             │
┌───────────────────┐     Still         │
│ Still burning?    │────burning────────┘
└─────────┬─────────┘
          │ No fuel
          ▼
┌───────────────────┐
│ Stop scheduling   │
│ Set is_burning=F  │
└───────────────────┘
```

### Why This Design?

1. **Independence**: Each container manages its own state without external dependencies
2. **Precise Timing**: Per-slot progress tracking enables exact cooking times
3. **Atomicity**: Each tick is a transaction - no partial state corruption
4. **Visual Feedback**: `is_burning` enables client-side fire animations
5. **Resource Management**: Players must actively supply fuel

---

## 2. Storage Containers (Wooden Storage Box Variants)

**File:** `wooden_storage_box.rs`

### Core Design

Storage containers use a **simpler, passive approach** with optional time-based transformations:

```
┌────────────────────────────────────────┐
│         STORAGE CONTAINER              │
├────────────────────────────────────────┤
│  State:                                │
│  • variant: ContainerVariant           │
│  • slot_X_instance_id: Option<u64>     │
│  • slot_X_def_id: Option<u64>          │
│  (NO cooking progress fields)          │
├────────────────────────────────────────┤
│  NO Scheduled Table                    │
│  (Updated via item spoilage system     │
│   or on-access checks)                 │
├────────────────────────────────────────┤
│  Variant-Specific Behavior:            │
│  • Default: Pure storage               │
│  • Refrigerator: Slows spoilage        │
│  • Compost: Transforms waste to soil   │
│  • Bakery: Provides recipes display    │
└────────────────────────────────────────┘
```

### Variant System

```rust
pub enum ContainerVariant {
    Default,        // Pure storage
    Refrigerator,   // Preserves food (slower spoilage)
    CompostBin,     // Converts waste to compost
    Bakery,         // Crafting station UI
    Toolbox,        // Tool storage
    AmmoCrate,      // Ammo storage
    // ... etc
}
```

### Time-Based Processing (Without Scheduled Reducers)

Instead of scheduled reducers, storage containers use **item-level timestamps** checked during:
- Item access (when player opens container)
- Global spoilage update passes
- Periodic world state updates

```rust
// Example: Compost processing (conceptual)
// Checked when player accesses or during periodic updates
fn check_compost_progress(item: &InventoryItem, container: &WoodenStorageBox) {
    if container.variant == ContainerVariant::CompostBin {
        let time_in_container = current_time - item.placed_at;
        if time_in_container > COMPOST_TIME {
            transform_to_fertilizer(item);
        }
    }
}
```

### Why This Design?

1. **Scalability**: Players can have many storage boxes without scheduler overhead
2. **Simplicity**: No complex state machine needed for basic storage
3. **Lazy Evaluation**: Only process when accessed = fewer server ticks
4. **Variant Flexibility**: Same core code, different behaviors via variant enum
5. **Item-Level Tracking**: Spoilage/transformation tracked per-item, not per-container

---

## 3. Processing Attachments (Broth Pot)

**File:** `broth_pot.rs`

### Core Design

The broth pot is a **hybrid design** that attaches to heat sources rather than managing its own fuel:

```
┌────────────────────────────────────────┐
│            BROTH POT                   │
│       (Processing Attachment)          │
├────────────────────────────────────────┤
│  State:                                │
│  • attached_to_campfire_id: Option<u32>│
│  • attached_to_fumarole_id: Option<u32>│
│  • water_level_ml: u32                 │
│  • is_seawater: bool                   │
│  • is_cooking: bool                    │
│  • cooking_progress_secs: f32          │
│  • stir_quality: f32                   │
├────────────────────────────────────────┤
│  Scheduled Table:                      │
│  • BrothPotProcessingSchedule          │
│  • Ticks every 1 second                │
├────────────────────────────────────────┤
│  Heat Check (each tick):               │
│  IF attached_to_campfire:              │
│    → Check campfire.is_burning         │
│  IF attached_to_fumarole:              │
│    → Always has heat (natural source)  │
└────────────────────────────────────────┘
```

### Attachment Relationship

```
┌─────────────────────┐
│     BROTH POT       │
│                     │
│ attached_to_        │
│ campfire_id: 42     │────────────┐
└─────────────────────┘            │
                                   │
                                   ▼
                        ┌─────────────────────┐
                        │    CAMPFIRE #42     │
                        │                     │
                        │ attached_broth_     │
                        │ pot_id: 7           │──► Bidirectional link
                        │                     │
                        │ is_burning: true    │──► Provides heat
                        │ remaining_fuel: 45s │
                        └─────────────────────┘
```

### Multiple Processing Modes

The broth pot handles several independent concerns in each tick:

```rust
// Simplified processing flow
fn process_broth_pot_logic_scheduled(ctx, schedule_args) {
    // 1. Rain Collection (passive, if raining and not inside building)
    if is_raining && !is_inside_building {
        broth_pot.water_level_ml += rain_rate;
    }
    
    // 2. Desalination (active, requires heat + seawater)
    if broth_pot.is_seawater && has_heat {
        desalinate_water(&mut broth_pot);
    }
    
    // 3. Brewing (active, requires heat + fresh water + ingredients)
    if has_heat && !broth_pot.is_seawater && has_ingredients {
        advance_brewing(&mut broth_pot);
    }
    
    // 4. Reschedule
    schedule_next_tick();
}
```

### Why This Design?

1. **Avoids Duplicate Fuel Logic**: Campfire already handles fuel - pot "piggybacks"
2. **Emergent Gameplay**: Must manage TWO systems together (fuel + brewing)
3. **Fumarole Reward**: Natural heat source = no fuel cost = PvP hotspot incentive
4. **Realistic**: Pots sit on fires, they don't have their own burners
5. **Multiple Functions**: One entity handles rain collection, desalination, AND brewing

---

## 4. External-Update Containers (Rain Collector)

**File:** `rain_collector.rs`

### Core Design

Rain collectors are **updated by external systems** rather than self-scheduling:

```
┌────────────────────────────────────────┐
│         RAIN COLLECTOR                 │
├────────────────────────────────────────┤
│  State:                                │
│  • total_water_collected: f32          │
│  • is_salt_water: bool                 │
│  • slot_0_instance_id: Option<u64>     │
│  (Single slot for water container)     │
├────────────────────────────────────────┤
│  NO Scheduled Table                    │
│  Updated by: Weather System            │
│  (world_state::update_rain_collectors_ │
│   in_chunk)                            │
└────────────────────────────────────────┘
```

### External Update Flow

```
┌─────────────────────┐
│   WEATHER SYSTEM    │
│  (Ticks per chunk)  │
└─────────┬───────────┘
          │
          │ For each chunk with rain:
          ▼
┌─────────────────────┐
│ update_rain_        │
│ collectors_in_chunk │
└─────────┬───────────┘
          │
          │ For each collector in chunk:
          ▼
┌─────────────────────┐
│ Add water based on  │
│ rain intensity      │
│ • Light: 0.02/sec   │
│ • Heavy: 0.08/sec   │
│ • Storm: 0.12/sec   │
└─────────────────────┘
```

### Why This Design?

1. **Performance**: One weather tick updates ALL collectors in chunk vs. N schedulers
2. **Simplicity**: No complex state machine - just a reservoir and slot
3. **Weather Coupling**: Collection rate directly tied to weather intensity
4. **Consistency**: All collectors in chunk update atomically with weather
5. **Natural Fit**: Rain collection IS a weather event, so weather system owns it

---

## Comparison Matrix

| Aspect | Fuel Containers | Storage Containers | Broth Pot | Rain Collector |
|--------|-----------------|-------------------|-----------|----------------|
| **Scheduled Reducer** | ✅ Own table | ❌ None | ✅ Own table | ❌ None |
| **Internal Fuel** | ✅ Manages own | ❌ N/A | ❌ External heat | ❌ N/A |
| **Processing State** | ✅ Per-slot progress | ❌ Item timestamps | ✅ Brewing progress | ❌ Just reservoir |
| **Update Trigger** | Self-scheduled | On-access/periodic | Self-scheduled | Weather system |
| **Slot Purpose** | Cooking items | Storage | Ingredients + I/O | Water container |
| **Complexity** | High | Low | High | Low |
| **Scalability Concern** | Medium (scheduler per entity) | Low (lazy eval) | Medium | Low (batched updates) |

---

## Visual Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       CONTAINER ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  SELF-SCHEDULED PROCESSING              EXTERNALLY-UPDATED              │
│  ═══════════════════════════            ════════════════════            │
│                                                                         │
│  ┌─────────────────┐                    ┌─────────────────┐             │
│  │   CAMPFIRE      │◄──────────────────►│   BROTH POT     │             │
│  │   BARBECUE      │    (heat link)     │  (attachment)   │             │
│  │   FURNACE       │                    └─────────────────┘             │
│  │   LANTERN       │                                                    │
│  └─────────────────┘                    ┌─────────────────┐             │
│   • Own fuel system                     │  RAIN COLLECTOR │◄── Weather  │
│   • Own scheduler                       └─────────────────┘    System   │
│   • Per-slot progress                    • No scheduler                 │
│                                          • Batched updates              │
│                                                                         │
│  PASSIVE STORAGE (Item-Level Timestamps)                                │
│  ═══════════════════════════════════════                                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────┐       │
│  │                    WOODEN STORAGE BOX                        │       │
│  │  ┌───────────┬─────────────┬─────────────┬──────────────┐   │       │
│  │  │  Default  │ Refrigerator│ Compost Bin │    Bakery    │   │       │
│  │  │           │             │             │              │   │       │
│  │  │  Pure     │  Slower     │  Time-based │   Recipe     │   │       │
│  │  │  Storage  │  Spoilage   │  Transform  │   Display    │   │       │
│  │  └───────────┴─────────────┴─────────────┴──────────────┘   │       │
│  └─────────────────────────────────────────────────────────────┘       │
│   • No scheduler (lazy evaluation)                                      │
│   • Variant-specific behaviors                                          │
│   • Item timestamps for transformations                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Design Decision Guidelines

### When to Use Fuel-Container Pattern
- Entity needs to burn fuel over time
- Precise per-slot timing matters
- Visual state (burning/not) is important
- Processing rate depends on internal state

### When to Use Storage-Container Pattern
- Primary purpose is holding items
- Transformations are simple (time-based)
- Many instances expected (scalability)
- Lazy evaluation is acceptable

### When to Use Attachment Pattern
- Entity depends on another entity's state
- Avoids duplicating complex logic (fuel management)
- Creates interesting gameplay dependencies
- Multiple functions sharing one heat source

### When to Use External-Update Pattern
- Updates naturally couple to another system (weather, day/night)
- Batch processing is more efficient
- Simple state (just accumulator + flag)
- No complex internal state machine needed

---

## Implementation Checklist

### Adding a New Fuel Container
1. Define table with `is_burning`, fuel tracking, and per-slot progress fields
2. Create scheduled table `XxxProcessingSchedule`
3. Implement `process_xxx_logic_scheduled` reducer
4. Implement `ItemContainer` trait
5. Add toggle reducers (light/extinguish)
6. Handle fuel consumption and slot transformations

### Adding a New Storage Variant
1. Add variant to `ContainerVariant` enum
2. Add variant-specific behavior in relevant functions
3. Update client UI to recognize new variant
4. (Optional) Add item-level timestamp checks for transformations

### Adding a New Attachment
1. Define table with `attached_to_xxx_id` field
2. Add `attached_xxx_id` field to host entity
3. Create scheduled table for attachment processing
4. Implement heat/power check in processing reducer
5. Handle attach/detach reducers with bidirectional linking

### Adding a New External-Update Container
1. Define table with simple state (accumulator, flags)
2. Identify the external system that will update it
3. Add update logic to external system's tick function
4. Implement container slot management (ItemContainer trait)

