# Adding New Entities Guide

This guide explains how to add new placeable/world entities (like campfires, storage boxes, etc.) to the game.

## Overview

"Entities" are persistent world objects that players can interact with:
- **Campfire** - Burns fuel, cooks food, provides warmth
- **Storage Box** - Stores items
- **Rain Collector** - Collects rainwater
- **Furnace** - Smelts ores
- **Sleeping Bag** - Spawn point

Each entity requires:
1. Server-side table + reducers
2. Client-side rendering + interaction
3. Placeable item definition

## Entity Architecture Patterns

### Pattern 1: Simple Static Entity
For entities with no internal logic (decorations, markers):
- Just a table with position/owner
- Simple placement/destruction reducers

### Pattern 2: Container Entity
For entities that hold items (storage boxes, stashes):
- Implements `ItemContainer` trait
- Has slot fields for inventory items
- Transfer reducers

### Pattern 3: Fuel-Burning Entity
For entities with active processing (campfire, furnace):
- Has `is_burning` state
- Scheduled reducer for processing
- Fuel slots + cooking/smelting slots

See [CONTAINER_ARCHITECTURE_DESIGN.md](../architecture/CONTAINER_ARCHITECTURE_DESIGN.md) for detailed patterns.

## Step-by-Step: Adding a New Entity

### Example: Adding a "Torch Stand" Entity

A placeable torch that provides light and warmth.

---

### Step 1: Create Server Module

Create `server/src/torch_stand.rs`:

```rust
use spacetimedb::{Identity, ReducerContext, Table, Timestamp, TimeDuration, ScheduleAt};
use crate::Player;
use crate::environment::calculate_chunk_index;
use crate::player as PlayerTableTrait;

// --- Constants ---
pub const TORCH_STAND_COLLISION_RADIUS: f32 = 16.0;
pub const TORCH_STAND_COLLISION_Y_OFFSET: f32 = 0.0;
pub const TORCH_STAND_INTERACTION_DISTANCE: f32 = 64.0;
pub const TORCH_STAND_WARMTH_RADIUS: f32 = 100.0;
pub const TORCH_STAND_WARMTH_PER_SECOND: f32 = 2.0;
pub const TORCH_STAND_INITIAL_HEALTH: f32 = 50.0;

// Fuel constants
pub const TORCH_STAND_FUEL_DURATION_SECS: f32 = 300.0; // 5 minutes per fuel
pub const TORCH_STAND_PROCESS_INTERVAL_SECS: u64 = 5;

// --- Table Definition ---
#[spacetimedb::table(name = torch_stand, public)]
#[derive(Clone)]
pub struct TorchStand {
    #[primary_key]
    #[auto_inc]
    pub id: u32,
    
    // Position
    pub pos_x: f32,
    pub pos_y: f32,
    pub chunk_index: u32,
    
    // Ownership
    pub owner_id: Identity,
    pub placed_at: Timestamp,
    
    // State
    pub is_lit: bool,
    pub remaining_fuel_secs: f32,
    pub health: f32,
    pub is_destroyed: bool,
}

// --- Processing Schedule (for fuel consumption) ---
#[spacetimedb::table(name = torch_stand_processing_schedule, scheduled(process_torch_stand))]
pub struct TorchStandProcessingSchedule {
    #[primary_key]
    #[auto_inc]
    pub schedule_id: u64,
    pub scheduled_at: ScheduleAt,
    pub torch_stand_id: u32,
}

// --- Placement Reducer ---
#[spacetimedb::reducer]
pub fn place_torch_stand(
    ctx: &ReducerContext,
    pos_x: f32,
    pos_y: f32,
    source_item_instance_id: u64,
) -> Result<(), String> {
    let player = ctx.db.player().identity().find(&ctx.sender)
        .ok_or("Player not found")?;
    
    // Validate placement distance
    let dx = pos_x - player.pos_x;
    let dy = pos_y - player.pos_y;
    if dx * dx + dy * dy > 96.0 * 96.0 {
        return Err("Too far to place".into());
    }
    
    // TODO: Check for collisions with other entities
    // TODO: Consume the placeable item from inventory
    
    let chunk_index = calculate_chunk_index(pos_x, pos_y);
    
    let torch_stand = TorchStand {
        id: 0, // Auto-inc
        pos_x,
        pos_y,
        chunk_index,
        owner_id: ctx.sender,
        placed_at: ctx.timestamp,
        is_lit: false,
        remaining_fuel_secs: 0.0,
        health: TORCH_STAND_INITIAL_HEALTH,
        is_destroyed: false,
    };
    
    ctx.db.torch_stand().insert(torch_stand);
    log::info!("Player {} placed torch stand at ({}, {})", ctx.sender, pos_x, pos_y);
    
    Ok(())
}

// --- Light/Extinguish Reducer ---
#[spacetimedb::reducer]
pub fn toggle_torch_stand(ctx: &ReducerContext, torch_stand_id: u32) -> Result<(), String> {
    let mut torch = ctx.db.torch_stand().id().find(torch_stand_id)
        .ok_or("Torch stand not found")?;
    
    if torch.is_destroyed {
        return Err("Torch stand is destroyed".into());
    }
    
    if torch.is_lit {
        // Extinguish
        torch.is_lit = false;
        ctx.db.torch_stand().id().update(torch);
        // Cancel processing schedule
        cancel_torch_processing(ctx, torch_stand_id);
    } else {
        // Light (requires fuel)
        if torch.remaining_fuel_secs <= 0.0 {
            return Err("No fuel".into());
        }
        torch.is_lit = true;
        ctx.db.torch_stand().id().update(torch);
        // Start processing schedule
        schedule_torch_processing(ctx, torch_stand_id);
    }
    
    Ok(())
}

// --- Add Fuel Reducer ---
#[spacetimedb::reducer]
pub fn add_fuel_to_torch_stand(
    ctx: &ReducerContext,
    torch_stand_id: u32,
    fuel_item_instance_id: u64,
) -> Result<(), String> {
    let mut torch = ctx.db.torch_stand().id().find(torch_stand_id)
        .ok_or("Torch stand not found")?;
    
    // TODO: Validate fuel item, consume it, add fuel time
    torch.remaining_fuel_secs += TORCH_STAND_FUEL_DURATION_SECS;
    ctx.db.torch_stand().id().update(torch);
    
    Ok(())
}

// --- Processing Reducer (Scheduled) ---
#[spacetimedb::reducer]
fn process_torch_stand(ctx: &ReducerContext, schedule: TorchStandProcessingSchedule) -> Result<(), String> {
    // Security: Only scheduler can call this
    if ctx.sender != ctx.identity() {
        return Err("Unauthorized".into());
    }
    
    let mut torch = match ctx.db.torch_stand().id().find(schedule.torch_stand_id) {
        Some(t) => t,
        None => return Ok(()), // Torch was destroyed
    };
    
    if !torch.is_lit || torch.is_destroyed {
        return Ok(());
    }
    
    // Consume fuel
    torch.remaining_fuel_secs -= TORCH_STAND_PROCESS_INTERVAL_SECS as f32;
    
    if torch.remaining_fuel_secs <= 0.0 {
        // Out of fuel - extinguish
        torch.is_lit = false;
        torch.remaining_fuel_secs = 0.0;
        ctx.db.torch_stand().id().update(torch);
        return Ok(());
    }
    
    ctx.db.torch_stand().id().update(torch);
    
    // Reschedule
    schedule_torch_processing(ctx, schedule.torch_stand_id);
    
    Ok(())
}

// --- Helper Functions ---
fn schedule_torch_processing(ctx: &ReducerContext, torch_stand_id: u32) {
    let schedule = TorchStandProcessingSchedule {
        schedule_id: 0,
        scheduled_at: ScheduleAt::Time(ctx.timestamp + TimeDuration::from_secs(TORCH_STAND_PROCESS_INTERVAL_SECS)),
        torch_stand_id,
    };
    ctx.db.torch_stand_processing_schedule().insert(schedule);
}

fn cancel_torch_processing(ctx: &ReducerContext, torch_stand_id: u32) {
    for schedule in ctx.db.torch_stand_processing_schedule().iter() {
        if schedule.torch_stand_id == torch_stand_id {
            ctx.db.torch_stand_processing_schedule().schedule_id().delete(schedule.schedule_id);
        }
    }
}
```

---

### Step 2: Register Module in lib.rs

Add to `server/src/lib.rs`:

```rust
// Module declaration
mod torch_stand;

// Re-exports (if needed by other modules)
pub use torch_stand::{TorchStand, TORCH_STAND_WARMTH_RADIUS};
```

---

### Step 3: Create Placeable Item

In `server/src/items_database/placeables.rs`:

```rust
ItemDefinition {
    id: 0,
    name: "Torch Stand".to_string(),
    description: "A standing torch that provides light and warmth.".to_string(),
    category: ItemCategory::Placeable,
    icon_asset_name: "torch_stand.png".to_string(),
    is_stackable: true,
    stack_size: 5,
    is_equippable: false,
    equipment_slot_type: None,
    
    // Crafting
    crafting_cost: Some(vec![
        CostIngredient { item_name: "Wood".to_string(), quantity: 3 },
        CostIngredient { item_name: "Fiber".to_string(), quantity: 2 },
    ]),
    crafting_output_quantity: Some(1),
    crafting_time_secs: Some(5),
    requires_station: None,
    
    // Not fuel/consumable
    fuel_burn_duration_secs: None,
    consumable_health_gain: None,
    // ... other fields None/false
}
```

---

### Step 4: Add Client Subscription

In `client/src/hooks/useSpacetimeTables.ts`:

```typescript
// Add state
const [torchStands, setTorchStands] = useState<Map<string, TorchStand>>(() => new Map());

// Add subscription handlers
const handleTorchStandInsert = (ctx: any, entity: TorchStand) => 
  setTorchStands(prev => new Map(prev).set(entity.id.toString(), entity));

const handleTorchStandUpdate = (ctx: any, old: TorchStand, entity: TorchStand) =>
  setTorchStands(prev => new Map(prev).set(entity.id.toString(), entity));

const handleTorchStandDelete = (ctx: any, entity: TorchStand) => {
  setTorchStands(prev => { 
    const m = new Map(prev); 
    m.delete(entity.id.toString()); 
    return m; 
  });
};

// Register handlers
connection.db.torchStand.onInsert(handleTorchStandInsert);
connection.db.torchStand.onUpdate(handleTorchStandUpdate);
connection.db.torchStand.onDelete(handleTorchStandDelete);

// Return in hook
return { torchStands, /* ... */ };
```

---

### Step 5: Add Client Rendering

In `client/src/utils/renderers/renderingUtils.ts`:

```typescript
export function renderTorchStand(
  ctx: CanvasRenderingContext2D,
  torchStand: TorchStand,
  torchStandSprite: HTMLImageElement,
  screenX: number,
  screenY: number,
) {
  const spriteWidth = 48;
  const spriteHeight = 64;
  
  // Choose sprite frame based on lit state
  const frameX = torchStand.isLit ? 1 : 0;
  
  ctx.drawImage(
    torchStandSprite,
    frameX * spriteWidth, 0,  // Source
    spriteWidth, spriteHeight,
    screenX - spriteWidth / 2,
    screenY - spriteHeight,
    spriteWidth, spriteHeight
  );
}
```

---

### Step 6: Add to Entity Filtering

In `client/src/hooks/useEntityFiltering.ts`:

```typescript
// Add to props interface
torchStands: Map<string, TorchStand>;

// Add filtering
const visibleTorchStands = useMemo(() => 
  torchStands ? Array.from(torchStands.values())
    .filter(t => !t.isDestroyed && isEntityInView(t, viewBounds))
  : []
, [torchStands, isEntityInView, viewBounds]);

// Add to Y-sorted entities
const ySortedEntities = useMemo(() => [
  // ... other entities
  ...visibleTorchStands.map(t => ({ 
    type: 'torchStand' as const, 
    entity: t,
    sortY: t.posY 
  })),
], [/* deps */]);
```

---

### Step 7: Add Interaction

In `client/src/hooks/useInteractionFinder.ts`:

```typescript
// Add to props
torchStands: Map<string, TorchStand>;

// Add to interaction finding
if (torchStands) {
  torchStands.forEach((torch) => {
    if (torch.isDestroyed) return;
    const dx = playerX - torch.posX;
    const dy = playerY - torch.posY;
    const distSq = dx * dx + dy * dy;
    if (distSq < INTERACTION_DISTANCE_SQ && distSq < closestDistSq) {
      closestDistSq = distSq;
      closestTarget = { type: 'torchStand', id: torch.id };
    }
  });
}
```

---

### Step 8: Add Assets

1. Add sprite: `client/public/assets/entities/torch_stand.png`
2. Add icon: `client/public/assets/items/torch_stand.png`

---

### Step 9: Build & Test

```bash
# Build server
spacetime build --project-path ./server

# Publish (clear data to add new table)
spacetime publish -c --project-path ./server broth-bullets-local

# Regenerate bindings
spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server

# Restart client
cd client && npm run dev
```

## Checklist for New Entities

- [ ] Server table definition with `#[spacetimedb::table]`
- [ ] Primary key with `#[primary_key]` and `#[auto_inc]`
- [ ] Position fields (`pos_x`, `pos_y`)
- [ ] Chunk index field for spatial queries
- [ ] Owner identity field
- [ ] Placement reducer
- [ ] Destruction reducer
- [ ] Interaction reducers
- [ ] Module registered in `lib.rs`
- [ ] Placeable item in items_database
- [ ] Client subscription in useSpacetimeTables
- [ ] Client rendering function
- [ ] Entity filtering hook integration
- [ ] Interaction finder hook integration
- [ ] Sprite and icon assets
- [ ] Collision constants defined
- [ ] Interaction distance constants defined

## Common Patterns

### Adding Container Functionality

Implement `ItemContainer` trait:

```rust
impl inventory_management::ItemContainer for TorchStand {
    fn get_slot_instance_id(&self, slot_index: usize) -> Option<u64> {
        match slot_index {
            0 => self.fuel_slot_instance_id,
            _ => None,
        }
    }
    
    fn set_slot_instance_id(&mut self, slot_index: usize, instance_id: Option<u64>) {
        match slot_index {
            0 => self.fuel_slot_instance_id = instance_id,
            _ => {},
        }
    }
    
    fn num_slots(&self) -> usize { 1 }
}
```

### Adding Processing Schedule

For entities that need periodic updates:

```rust
#[spacetimedb::table(name = entity_processing_schedule, scheduled(process_entity))]
pub struct EntityProcessingSchedule {
    #[primary_key]
    #[auto_inc]
    pub schedule_id: u64,
    pub scheduled_at: ScheduleAt,
    pub entity_id: u32,
}
```

### Adding Warmth Contribution

Register in `player_stats.rs` warmth calculation:

```rust
// Check if near torch stand
if is_near_torch_stand(ctx, player) {
    warmth_change += TORCH_STAND_WARMTH_PER_SECOND;
}
```

