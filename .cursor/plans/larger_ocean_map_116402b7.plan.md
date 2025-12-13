---
name: Larger Ocean Map
overview: Expand the world to 1500x1500 tiles with ~30% ocean surrounding the island by reducing the island radius factor, and restrict sea stack spawning to near-shore areas only.
todos:
  - id: update-server-size
    content: Update WORLD_WIDTH_TILES and WORLD_HEIGHT_TILES to 1500 in server/src/lib.rs
    status: completed
  - id: update-client-size
    content: Update SERVER_WORLD_WIDTH_TILES and SERVER_WORLD_HEIGHT_TILES to 1500 in client/src/config/gameConfig.ts
    status: completed
  - id: reduce-island-radius
    content: Change base_island_radius factor from 0.35 to 0.25 in world_generation.rs for smaller island (more ocean)
    status: completed
  - id: shallow-ocean-helper
    content: Create is_position_in_shallow_ocean helper in environment.rs to detect near-shore ocean
    status: completed
  - id: restrict-sea-stacks
    content: Update sea stack spawning to use is_position_in_shallow_ocean instead of is_position_on_ocean_water
    status: completed
  - id: build-deploy
    content: Build server, publish with -c flag, regenerate bindings, restart client
    status: completed
---

# Larger Ocean Map (1500x1500 with 30% Ocean)

## Current State

- **World size**: 1000x1000 tiles (48,000x48,000 pixels)
- **Island radius factor**: 0.35 (island diameter ~70% of map width)
- **Sea stacks**: Spawn anywhere on ocean water, no depth restriction

## Changes Required

### 1. Server World Size Constants

**File:** [server/src/lib.rs](server/src/lib.rs)

Update world dimensions (lines ~453-454):

```rust
pub const WORLD_WIDTH_TILES: u32 = 1500;  // was 1000
pub const WORLD_HEIGHT_TILES: u32 = 1500; // was 1000
```

### 2. Client World Size Constants

**File:** [client/src/config/gameConfig.ts](client/src/config/gameConfig.ts)

Update client dimensions (lines ~18-19):

```typescript
const SERVER_WORLD_WIDTH_TILES = 1500;  // was 1000
const SERVER_WORLD_HEIGHT_TILES = 1500; // was 1000
```

### 3. Island Size Reduction for More Ocean

**File:** [server/src/world_generation.rs](server/src/world_generation.rs)

In `generate_wavy_shore_distance_with_islands` (line ~415), reduce the island radius factor:

```rust
// Change from 0.35 to ~0.25 for smaller island (more ocean)
let base_island_radius = (width.min(height) as f64 * 0.25).min(center_x.min(center_y) - 20.0);
```

**Math rationale:**

- Current: 0.35 factor = island diameter ~70% of map = ~30% ocean
- New: 0.25 factor = island diameter ~50% of map = ~50% ocean perimeter coverage

With 1500x1500 tiles and 0.25 factor:

- Island radius: ~375 tiles (750 diameter)
- Ocean ring: ~375 tiles wide on each side
- This gives substantial ocean space for monuments and fishing boats

### 4. Restrict Sea Stack Spawning to Near-Shore Areas

**File:** [server/src/environment.rs](server/src/environment.rs)

Add a shore distance check to `is_position_on_ocean_water` usage for sea stacks. Create a new helper function:

```rust
/// Checks if position is in shallow ocean (near shore, suitable for sea stacks)
/// Sea stacks should only spawn in the transition zone between beach and deep ocean
pub fn is_position_in_shallow_ocean(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    // Must be on ocean water first
    if !is_position_on_ocean_water(ctx, pos_x, pos_y) {
        return false;
    }
    
    // Check distance from nearest land - sea stacks should be near shore
    // Search for beach/land within reasonable distance
    const MAX_SHORE_DISTANCE_TILES: i32 = 15; // ~720 pixels - near shore only
    
    let tile_x = (pos_x / TILE_SIZE_PX as f32).floor() as i32;
    let tile_y = (pos_y / TILE_SIZE_PX as f32).floor() as i32;
    
    for dy in -MAX_SHORE_DISTANCE_TILES..=MAX_SHORE_DISTANCE_TILES {
        for dx in -MAX_SHORE_DISTANCE_TILES..=MAX_SHORE_DISTANCE_TILES {
            let check_x = tile_x + dx;
            let check_y = tile_y + dy;
            // ... check if nearby tile is beach or land
        }
    }
    false // Too far from shore
}
```

Then update sea stack spawning rejection condition (around line ~1775):

```rust
// Change from: !is_position_on_ocean_water(ctx, pos_x, pos_y)
// To: !is_position_in_shallow_ocean(ctx, pos_x, pos_y)
```

## Visualization of Changes

```
Current (1000x1000, 0.35 factor):        New (1500x1500, 0.25 factor):
+------------------+                     +------------------------+
|   ~~~ ocean ~~~  |                     |     ~~~ ocean ~~~      |
|  +------------+  |                     |   +---------------+    |
|  |   island   |  |                     |   |    island     |    |
|  |  (70% dia) |  |                     |   |   (50% dia)   |    |
|  +------------+  |                     |   +---------------+    |
|   ~~~ ocean ~~~  |                     |     ~~~ ocean ~~~      |
+------------------+                     +------------------------+
     ~15% ocean                               ~30%+ ocean space
```

## Build and Deploy Sequence

```bash
# 1. Build server
spacetime build --project-path ./server

# 2. Clear and republish (destroys existing world - required for size change)
spacetime publish -c --project-path ./server broth-bullets-local

# 3. Regenerate client bindings
spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server

# 4. Restart client
npm run dev
```

## Notes

- The scattered corner islands and small islands will still generate but be positioned relative to the new larger map
- Resource scaling is already handled proportionally in `environment.rs`
- Sea barrels around sea stacks will also be limited to near-shore since they spawn around stacks