<!-- 17791199-7973-4fca-b032-50cc94e1e2b4 24752a74-0c40-4e74-9e1d-d42dc67a9ee0 -->
# Static Compound Buildings

## Architecture

Since buildings are always at fixed positions relative to the world center and are visual-only:

1. **Client-side config** defines building positions (relative to center), image paths, dimensions, and collision radiuses
2. **Client renders** buildings directly from config in Y-sorted system - no subscription needed
3. **Server-side constants** mirror the collision data for movement validation
4. **Both use world center** as the reference point, calculated from world dimensions

## Implementation

### 1. Create shared building configuration (Client)

Create `client/src/config/compoundBuildings.ts`:

```typescript
export interface CompoundBuilding {
  id: string;
  // Position relative to world center (pixels)
  offsetX: number;
  offsetY: number;
  // Visual
  imagePath: string;
  width: number;
  height: number;
  // Y-offset for anchor point (how far up from bottom the "feet" are)
  anchorYOffset: number;
  // Collision (circular)
  collisionRadius: number;
  collisionYOffset: number; // Y offset for collision center
}

export const COMPOUND_BUILDINGS: CompoundBuilding[] = [
  {
    id: 'warehouse_1',
    offsetX: -200,
    offsetY: -150,
    imagePath: 'warehouse.png',
    width: 192,
    height: 256,
    anchorYOffset: 48,
    collisionRadius: 60,
    collisionYOffset: 30,
  },
  // Add more buildings...
];
```

### 2. Add server-side collision constants

Add to `server/src/environment.rs` or a new `server/src/compound_buildings.rs`:

```rust
pub struct CompoundBuildingCollision {
    pub offset_x: f32,
    pub offset_y: f32,
    pub collision_radius: f32,
    pub collision_y_offset: f32,
}

pub const COMPOUND_BUILDING_COLLISIONS: &[CompoundBuildingCollision] = &[
    CompoundBuildingCollision {
        offset_x: -200.0,
        offset_y: -150.0,
        collision_radius: 60.0,
        collision_y_offset: 30.0,
    },
    // Mirror client config...
];

pub fn check_compound_building_collision(pos_x: f32, pos_y: f32, player_radius: f32) -> bool {
    let center_x = (WORLD_WIDTH_TILES as f32 * TILE_SIZE_PX as f32) / 2.0;
    let center_y = (WORLD_HEIGHT_TILES as f32 * TILE_SIZE_PX as f32) / 2.0;
    
    for building in COMPOUND_BUILDING_COLLISIONS {
        let bx = center_x + building.offset_x;
        let by = center_y + building.offset_y - building.collision_y_offset;
        let dx = pos_x - bx;
        let dy = pos_y - by;
        let dist_sq = dx * dx + dy * dy;
        let min_dist = building.collision_radius + player_radius;
        if dist_sq < min_dist * min_dist {
            return true;
        }
    }
    false
}
```

### 3. Integrate collision into player movement

In [server/src/player_collision.rs](server/src/player_collision.rs), add compound building checks to `calculate_slide_collision_with_grid()` and `resolve_push_out_collision_with_grid()`.

### 4. Add client-side rendering

Create `client/src/utils/renderers/compoundBuildingRenderingUtils.ts`:

- Preload building images on startup
- Render function that draws buildings at calculated world positions
- Apply transparency when player is behind (similar to trees/ALK stations)

### 5. Integrate into Y-sorted rendering

In [client/src/hooks/useEntityFiltering.ts](client/src/hooks/useEntityFiltering.ts):

- Add compound buildings to `ySortedEntities` based on their Y position
- They render in correct depth order with players/other entities

In [client/src/utils/renderers/renderingUtils.ts](client/src/utils/renderers/renderingUtils.ts):

- Handle `compound_building` entity type in `renderYSortedEntities`

## Key Benefits

- **Zero network overhead** - no subscriptions or database queries for building positions
- **Easy configuration** - swap images/positions by editing the config arrays
- **Proper Y-sorting** - buildings integrate with existing depth system
- **Server authoritative collision** - prevents cheating while keeping rendering efficient

## File Changes Summary

| File | Change |

|------|--------|

| `client/src/config/compoundBuildings.ts` | New - building config |

| `server/src/compound_buildings.rs` | New - collision constants |

| `server/src/lib.rs` | Add `mod compound_buildings` |

| `server/src/player_collision.rs` | Add collision checks |

| `client/src/utils/renderers/compoundBuildingRenderingUtils.ts` | New - rendering |

| `client/src/hooks/useEntityFiltering.ts` | Add buildings to Y-sort |

| `client/src/utils/renderers/renderingUtils.ts` | Handle building render |

| `client/src/assets/doodads/` | Building images (you provide) |

### To-dos

- [ ] Create compoundBuildings.ts config with building definitions
- [ ] Create compound_buildings.rs with collision constants and check function
- [ ] Add compound building collision checks to player_collision.rs
- [ ] Create compoundBuildingRenderingUtils.ts for rendering
- [ ] Add compound buildings to Y-sorted entity system