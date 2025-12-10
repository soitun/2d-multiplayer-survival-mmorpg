# Adding New Monuments

This guide explains how to add new monument types to the game world. Monuments are special structures (shipwrecks, ruins, crash sites, etc.) that take precedence over natural obstacles.

## Overview

The monument system is designed to be easily extensible. Currently implemented:
- ✅ **Shipwreck Monument** (Sovereign Tide Wreck) - 6 hull parts scattered on south beach

Planned monuments (from MONUMENTS_PLAN.md):
- 🔲 Ruins monuments
- 🔲 Crash sites
- 🔲 Whalebone reef
- 🔲 Hot spring compounds
- 🔲 And 15+ more...

## Architecture

### Key Files

1. **`server/src/monument.rs`** - ⭐ **ALL monument logic lives here** (generation AND clearance)
2. **`server/src/world_generation.rs`** - Orchestrates world creation, calls monument functions
3. **`server/src/environment.rs`** - Uses monument clearance when spawning obstacles
4. **`server/src/lib.rs`** - Monument table definitions

### How It Works

1. **Monument generation happens in `monument.rs`** - centralized logic
2. **World generation calls monument functions** - `world_generation.rs` orchestrates
3. **Obstacles check clearance** before spawning in `environment.rs`
4. **Monuments take precedence** - obstacles are blocked from spawning near them

## Step-by-Step: Adding a New Monument Type

### 1. Define the Monument Table (in `server/src/lib.rs`)

First, create a table to store your monument parts in the database:

```rust
#[spacetimedb::table(name = ruins_part, public)]
pub struct RuinsPart {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub world_x: f32,
    pub world_y: f32,
    pub image_path: String,
    pub is_center: bool,
    pub collision_radius: f32,
}
```

### 2. Add Table Trait Import (in `server/src/monument.rs`)

Import the table trait at the top:

```rust
use crate::shipwreck_part as ShipwreckPartTableTrait;
use crate::ruins_part as RuinsPartTableTrait; // <<< ADD THIS
```

### 3. Add Clearance Radius (in `server/src/monument.rs`)

Define how much space your monument needs to clear:

```rust
pub mod clearance {
    pub const SHIPWRECK: f32 = 300.0;
    pub const RUINS: f32 = 400.0; // <<< ADD THIS
    // ... more monument types
}
```

### 4. Add Generation Function (in `server/src/monument.rs`)

**⭐ KEY STEP:** Add your generation logic to the monument module:

```rust
/// Generate ruins monument in north forest clearings
/// Returns (center_positions, parts) where:
/// - center_positions: Vec of (x, y) in world pixels for center piece
/// - parts: Vec of (x, y, image_path) for additional debris
pub fn generate_ruins(
    noise: &Perlin,
    forest_areas: &[Vec<bool>],
    width: usize,
    height: usize,
) -> (Vec<(f32, f32)>, Vec<(f32, f32, String)>) {
    let mut ruins_centers = Vec::new();
    let mut ruins_parts = Vec::new();
    
    log::info!("🏛️ Generating ruins monument in north forest...");
    
    // Your generation logic here:
    // 1. Find candidate positions (e.g., forest clearings in north half)
    // 2. Select best position using noise for deterministic placement
    // 3. Place center piece
    // 4. Scatter debris pieces around center
    // 5. Ensure unique images (ruins1.png through ruins6.png)
    
    (ruins_centers, ruins_parts)
}
```

### 5. Add Clearance Check Function (in `server/src/monument.rs`)

Create a function to check if a position is near your monument:

```rust
/// Checks if position is near any ruins monument
fn is_near_ruins(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    let clearance_sq = clearance::RUINS * clearance::RUINS;
    
    for ruins in ctx.db.ruins_part().iter() {
        let dx = pos_x - ruins.world_x;
        let dy = pos_y - ruins.world_y;
        let dist_sq = dx * dx + dy * dy;
        
        if dist_sq < clearance_sq {
            return true;
        }
    }
    
    false
}
```

### 6. Update Main Clearance Function (in `server/src/monument.rs`)

Add your monument check to the main function:

```rust
pub fn is_position_near_monument(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    if is_near_shipwreck(ctx, pos_x, pos_y) {
        return true;
    }
    
    if is_near_ruins(ctx, pos_x, pos_y) { // <<< ADD THIS
        return true;
    }
    
    // ... check other monument types
    
    false
}
```

### 7. Call Generation in World Creation (in `server/src/world_generation.rs`)

Add your generation call to the `generate_world` function:

```rust
pub fn generate_world(config: &WorldGenConfig) -> WorldFeatures {
    // ... existing generation code ...
    
    // Generate shipwreck monument (handled by monument module)
    let (shipwreck_centers, shipwreck_parts) = crate::monument::generate_shipwreck(
        noise, &shore_distance, &river_network, &lake_map, width, height
    );
    
    // Generate ruins monument (handled by monument module) <<< ADD THIS
    let (ruins_centers, ruins_parts) = crate::monument::generate_ruins(
        noise, &forest_areas, width, height
    );
    
    WorldFeatures {
        // ... add ruins_centers and ruins_parts to struct
    }
}
```

### 8. Store in Database (in `server/src/environment.rs`)

Add database insertion logic in the `init` reducer:

```rust
#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    // ... existing code ...
    
    // Store ruins parts
    for (center_x, center_y) in world_features.ruins_centers {
        ctx.db.ruins_part().insert(RuinsPart {
            id: 0,
            world_x: center_x,
            world_y: center_y,
            image_path: "ruins_center.png".to_string(),
            is_center: true,
            collision_radius: 200.0,
        });
    }
    
    for (part_x, part_y, image_path) in world_features.ruins_parts {
        ctx.db.ruins_part().insert(RuinsPart {
            id: 0,
            world_x: part_x,
            world_y: part_y,
            image_path,
            is_center: false,
            collision_radius: 150.0,
        });
    }
}
```

### 9. Add Client-Side Rendering (client/)

Follow the same pattern as shipwreck parts:

1. **Subscribe to data** (`useSpacetimeTables.ts`)
2. **Pass to components** (`App.tsx` → `GameScreen.tsx` → `GameCanvas.tsx`)
3. **Convert to CompoundBuilding** (`compoundBuildings.ts`)
4. **Filter for rendering** (`useEntityFiltering.ts`)
5. **Render via Y-sorting** (`renderingUtils.ts` - already handles compound buildings)
6. **Add minimap icon** (`Minimap.tsx`)

## Best Practices

### Monument Generation (in `monument.rs`)

- **Use deterministic noise** for consistent placement across server restarts
- **Ensure all parts spawn** - use retry logic with relaxed constraints
- **Assign unique images** - track used images with a HashSet
- **Check terrain constraints** - water distance, biome boundaries, etc.
- **Space parts appropriately** - minimum distance checks between parts
- **Log placement details** - helps with debugging

### Clearance Radii

- **Small monuments** (barrels, small ruins): 150-200px (3-4 tiles)
- **Medium monuments** (shipwrecks, crash sites): 250-350px (5-7 tiles)
- **Large monuments** (compounds, whale bones): 400-500px (8-10 tiles)

### Performance

- **Clearance checks are O(n)** where n = number of monument parts
- **Keep monument counts reasonable** (< 100 total parts per type)
- **Use spatial indexing** if you have many monuments (future optimization)

## Example: Complete Shipwreck Monument

See `server/src/monument.rs` function `generate_shipwreck()` for a complete working example. The ruins monument would follow the exact same pattern:

1. Find suitable locations (e.g., north forest clearings)
2. Place center piece
3. Scatter 4-8 additional parts around center
4. Ensure unique images (ruins1.png through ruins8.png)
5. Return positions to world generation
6. World generation stores in database
7. Clearance automatically handled by monument system

## Testing

After adding a new monument:

1. **Rebuild server**: `spacetime build --project-path ./server`
2. **Clear database**: `spacetime publish -c --project-path ./server broth-bullets-local`
3. **Regenerate bindings**: `spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server`
4. **Check logs**: Look for monument generation messages
5. **Verify clearance**: Trees/stones should not spawn near monuments
6. **Test rendering**: Monument parts should be visible in game
7. **Check minimap**: Monument icons should appear

## Architecture Benefits

### Why All Monument Logic Lives in `monument.rs`

1. **Single Responsibility** - Monument module owns all monument behavior
2. **Easy to Find** - All monument code in one place
3. **Reusable** - Generation and clearance logic can be reused
4. **Testable** - Isolated logic is easier to test
5. **Scalable** - Adding new monuments doesn't pollute other files

### File Responsibilities

- **`monument.rs`** - Monument generation + clearance (OWNS monuments)
- **`world_generation.rs`** - World orchestration (CALLS monument functions)
- **`environment.rs`** - Obstacle spawning (USES monument clearance)
- **`lib.rs`** - Table definitions (DEFINES monument data structures)

## Future Enhancements

- **Spatial indexing** for faster clearance checks with many monuments
- **Dynamic monuments** that can be damaged/repaired by players
- **Monument interactions** (loot containers, NPCs, quests)
- **Monument ownership** (clans can claim monuments)
- **Monument events** (periodic spawns, boss fights)
