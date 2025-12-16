# World Generation System

This document describes how the game world is generated, including terrain, biomes, resources, and the chunk system.

## Overview

The world generation system (`server/src/environment.rs`, `server/src/world_generation.rs`) creates:
- **Terrain tiles** - Ground types (grass, sand, water, etc.)
- **Biomes** - Regional climate zones affecting gameplay
- **Resources** - Trees, stones, plants, animals
- **Monuments** - Special POI structures

## World Dimensions

```rust
// Defined in lib.rs
pub const WORLD_WIDTH_TILES: u32 = 600;   // Configurable
pub const WORLD_HEIGHT_TILES: u32 = 600;  // Configurable
pub const TILE_SIZE_PX: u32 = 48;

pub const WORLD_WIDTH_PX: f32 = WORLD_WIDTH_TILES * TILE_SIZE_PX;   // 28,800px
pub const WORLD_HEIGHT_PX: f32 = WORLD_HEIGHT_TILES * TILE_SIZE_PX; // 28,800px
```

## Chunk System

The world is divided into chunks for efficient spatial queries and subscriptions.

### Chunk Configuration

```rust
// environment.rs
pub const CHUNK_SIZE_TILES: u32 = 16;  // 16x16 tiles per chunk
pub const CHUNK_SIZE_PX: f32 = CHUNK_SIZE_TILES * TILE_SIZE_PX;  // 768px

// Calculated values
pub const WORLD_WIDTH_CHUNKS: u32 = (WORLD_WIDTH_TILES + CHUNK_SIZE_TILES - 1) / CHUNK_SIZE_TILES;
pub const WORLD_HEIGHT_CHUNKS: u32 = (WORLD_HEIGHT_TILES + CHUNK_SIZE_TILES - 1) / CHUNK_SIZE_TILES;
```

### Chunk Index Calculation

```rust
pub fn calculate_chunk_index(pos_x: f32, pos_y: f32) -> u32 {
    // Convert position to tile coordinates
    let tile_x = (pos_x / TILE_SIZE_PX as f32).floor() as u32;
    let tile_y = (pos_y / TILE_SIZE_PX as f32).floor() as u32;
    
    // Calculate chunk coordinates
    let chunk_x = (tile_x / CHUNK_SIZE_TILES).min(WORLD_WIDTH_CHUNKS - 1);
    let chunk_y = (tile_y / CHUNK_SIZE_TILES).min(WORLD_HEIGHT_CHUNKS - 1);
    
    // Row-major 1D index
    chunk_y * WORLD_WIDTH_CHUNKS + chunk_x
}
```

### Why Chunks?

1. **Subscription Efficiency**: Clients only subscribe to nearby chunks
2. **Spatial Queries**: Quickly find entities near a position
3. **Weather Localization**: Different weather per chunk
4. **Entity Culling**: Render only entities in visible chunks

## Terrain Generation

### Tile Types

```rust
pub enum TileType {
    // Land tiles
    Grass,
    Sand,
    Dirt,
    Stone,
    Snow,
    
    // Water tiles
    ShallowWater,
    DeepWater,
    Ocean,
    
    // Special tiles
    Mud,
    Gravel,
    Ice,
    Volcanic,
}
```

### WorldTile Table

```rust
#[spacetimedb::table(name = world_tile, public)]
pub struct WorldTile {
    #[primary_key]
    pub tile_id: u64,  // Computed from x,y
    pub tile_x: u32,
    pub tile_y: u32,
    pub tile_type: TileType,
    pub chunk_index: u32,
}
```

### Procedural Generation

Uses Perlin noise for natural-looking terrain:

```rust
use noise::{NoiseFn, Perlin, Fbm};

fn generate_terrain(ctx: &ReducerContext, seed: u64) {
    let elevation_noise = Fbm::<Perlin>::new(seed as u32);
    let moisture_noise = Fbm::<Perlin>::new((seed + 1) as u32);
    
    for tile_y in 0..WORLD_HEIGHT_TILES {
        for tile_x in 0..WORLD_WIDTH_TILES {
            // Sample noise at this position
            let nx = tile_x as f64 * NOISE_SCALE;
            let ny = tile_y as f64 * NOISE_SCALE;
            
            let elevation = elevation_noise.get([nx, ny]);
            let moisture = moisture_noise.get([nx, ny]);
            
            // Determine tile type from elevation + moisture
            let tile_type = determine_tile_type(elevation, moisture, tile_x, tile_y);
            
            // Insert tile
            ctx.db.world_tile().insert(WorldTile {
                tile_id: compute_tile_id(tile_x, tile_y),
                tile_x,
                tile_y,
                tile_type,
                chunk_index: calculate_chunk_index(
                    tile_x as f32 * TILE_SIZE_PX as f32,
                    tile_y as f32 * TILE_SIZE_PX as f32
                ),
            });
        }
    }
}
```

### Elevation → Tile Type Mapping

```rust
fn determine_tile_type(elevation: f64, moisture: f64, x: u32, y: u32) -> TileType {
    // Deep water
    if elevation < -0.3 {
        return TileType::Ocean;
    }
    
    // Shallow water
    if elevation < -0.1 {
        return TileType::ShallowWater;
    }
    
    // Beach/sand
    if elevation < 0.0 {
        return TileType::Sand;
    }
    
    // Lowlands
    if elevation < 0.3 {
        if moisture > 0.5 {
            return TileType::Grass;
        } else {
            return TileType::Dirt;
        }
    }
    
    // Highlands
    if elevation < 0.6 {
        return TileType::Stone;
    }
    
    // Mountains
    TileType::Snow
}
```

## Biome System

Biomes affect gameplay (temperature, resources, enemy types).

### Biome Types

```rust
impl TileType {
    pub fn is_alpine(&self) -> bool {
        matches!(self, TileType::Snow | TileType::Ice)
    }
    
    pub fn is_tundra(&self) -> bool {
        // Cold but not frozen
        matches!(self, TileType::Stone) && /* temperature check */
    }
    
    pub fn is_coastal(&self) -> bool {
        matches!(self, TileType::Sand)
    }
    
    pub fn is_volcanic(&self) -> bool {
        matches!(self, TileType::Volcanic)
    }
}
```

### Biome Effects

| Biome | Temperature | Resources | Special |
|-------|-------------|-----------|---------|
| Temperate | Normal | Trees, stones | Standard |
| Coastal | Warm | Palm trees, shells | Fish, seaweed |
| Tundra | Cold (1.5x drain) | Pine trees, ore | Fur animals |
| Alpine | Very cold (2x drain) | Rare ore | Dangerous |
| Volcanic | Hot | Obsidian, sulfur | Fumaroles |

## Resource Spawning

### Scaling Formula

Resources scale with map size using sublinear scaling:

```rust
const BASE_AREA_TILES: f32 = 360_000.0;  // 600x600 reference

fn scale_resource_count(base_count: u32, current_tiles: u32) -> u32 {
    let scale_factor = (current_tiles as f32 / BASE_AREA_TILES).powf(0.85);
    (base_count as f32 * scale_factor).round().max(1.0) as u32
}
```

This ensures:
- Smaller maps have proportionally MORE resources
- Larger maps have proportionally FEWER resources
- Gameplay feels balanced at any map size

### Tree Spawning

```rust
const BASE_TREE_COUNT_600X600: u32 = 900;  // ~0.25% density

fn seed_trees(ctx: &ReducerContext) {
    let total_tiles = WORLD_WIDTH_TILES * WORLD_HEIGHT_TILES;
    let tree_count = scale_resource_count(BASE_TREE_COUNT_600X600, total_tiles);
    
    // Use noise for clustering (dense forests)
    let forest_noise = Perlin::new(ctx.rng().gen());
    
    for _ in 0..tree_count {
        let (x, y) = find_valid_spawn_position(ctx, TileType::Grass);
        
        // Increase density in forest regions
        let noise_val = forest_noise.get([x * FOREST_NOISE_SCALE, y * FOREST_NOISE_SCALE]);
        if noise_val > DENSE_FOREST_THRESHOLD {
            // Spawn extra trees in dense forest areas
        }
        
        ctx.db.tree().insert(Tree {
            id: 0,
            pos_x: x,
            pos_y: y,
            chunk_index: calculate_chunk_index(x, y),
            health: TREE_INITIAL_HEALTH,
            respawn_at: None,
            // ...
        });
    }
}
```

### Stone Spawning

```rust
const BASE_STONE_COUNT_600X600: u32 = 180;

fn seed_stones(ctx: &ReducerContext) {
    let stone_count = scale_resource_count(BASE_STONE_COUNT_600X600, total_tiles);
    
    // Stones prefer rocky/elevated terrain
    for _ in 0..stone_count {
        let (x, y) = find_valid_spawn_position(ctx, |tile| {
            matches!(tile, TileType::Stone | TileType::Dirt | TileType::Grass)
        });
        
        ctx.db.stone().insert(Stone { /* ... */ });
    }
}
```

### Minimum Distance Enforcement

Prevent resources from spawning too close together:

```rust
const MIN_TREE_DISTANCE_SQ: f32 = 80.0 * 80.0;  // 80px apart

fn is_valid_spawn_position(ctx: &ReducerContext, x: f32, y: f32) -> bool {
    // Check distance from existing trees
    for tree in ctx.db.tree().iter() {
        let dx = x - tree.pos_x;
        let dy = y - tree.pos_y;
        if dx * dx + dy * dy < MIN_TREE_DISTANCE_SQ {
            return false;
        }
    }
    
    // Check distance from monuments
    if is_near_monument(ctx, x, y) {
        return false;
    }
    
    true
}
```

## Monument Generation

Special structures placed at specific locations:

```rust
fn seed_monuments(ctx: &ReducerContext) {
    // Place shipwreck on coastal area
    let shipwreck_pos = find_coastal_position(ctx);
    spawn_shipwreck(ctx, shipwreck_pos);
    
    // Place ruined village in forest
    let village_pos = find_forest_position(ctx);
    spawn_fishing_village(ctx, village_pos);
    
    // Place ancient altar on mountain
    let altar_pos = find_elevated_position(ctx);
    spawn_altar(ctx, altar_pos);
}
```

### Monument Clearance

Monuments clear nearby resources to create open spaces:

```rust
const MONUMENT_CLEARANCE_RADIUS: f32 = 200.0;

fn clear_monument_area(ctx: &ReducerContext, center_x: f32, center_y: f32) {
    // Remove trees
    for tree in ctx.db.tree().iter() {
        if distance(tree.pos_x, tree.pos_y, center_x, center_y) < MONUMENT_CLEARANCE_RADIUS {
            ctx.db.tree().id().delete(tree.id);
        }
    }
    
    // Remove stones
    // ...
}
```

## Resource Respawning

Depleted resources respawn after a timer:

```rust
#[spacetimedb::reducer]
fn check_resource_respawns(ctx: &ReducerContext) {
    let now = ctx.timestamp;
    
    // Check trees
    for tree in ctx.db.tree().iter() {
        if let Some(respawn_at) = tree.respawn_at {
            if now >= respawn_at {
                // Respawn the tree
                let mut tree = tree.clone();
                tree.health = TREE_INITIAL_HEALTH;
                tree.respawn_at = None;
                ctx.db.tree().id().update(tree);
            }
        }
    }
    
    // Check stones, plants, etc.
}
```

### Respawn Timers

```rust
pub const MIN_TREE_RESPAWN_TIME_SECS: u64 = 300;   // 5 minutes
pub const MAX_TREE_RESPAWN_TIME_SECS: u64 = 600;   // 10 minutes

pub const MIN_STONE_RESPAWN_TIME_SECS: u64 = 600;  // 10 minutes
pub const MAX_STONE_RESPAWN_TIME_SECS: u64 = 900;  // 15 minutes
```

## Animal Spawning

Wild animals spawn in appropriate biomes:

```rust
fn seed_animals(ctx: &ReducerContext) {
    let species_configs = [
        (AnimalSpecies::Deer, TileType::Grass, 20),
        (AnimalSpecies::Wolf, TileType::Stone, 10),
        (AnimalSpecies::Rabbit, TileType::Grass, 30),
        (AnimalSpecies::Bear, TileType::Snow, 5),
    ];
    
    for (species, preferred_tile, count) in species_configs {
        for _ in 0..count {
            let (x, y) = find_valid_spawn_position(ctx, preferred_tile);
            
            ctx.db.wild_animal().insert(WildAnimal {
                species,
                pos_x: x,
                pos_y: y,
                state: AnimalState::Idle,
                // ...
            });
        }
    }
}
```

## Client-Side Tile Rendering

The client renders tiles based on received WorldTile data:

```typescript
function renderTile(ctx: CanvasRenderingContext2D, tile: WorldTile) {
  const screenX = (tile.tileX * TILE_SIZE) - cameraX;
  const screenY = (tile.tileY * TILE_SIZE) - cameraY;
  
  // Get sprite coordinates from tileset
  const [spriteX, spriteY] = getTileSpriteCoords(tile.tileType);
  
  ctx.drawImage(
    tileset,
    spriteX, spriteY, TILE_SIZE, TILE_SIZE,  // Source
    screenX, screenY, TILE_SIZE, TILE_SIZE   // Dest
  );
}
```

## Changing World Size

To change the map dimensions, update constants in `lib.rs`:

```rust
pub const WORLD_WIDTH_TILES: u32 = 800;   // Was 600
pub const WORLD_HEIGHT_TILES: u32 = 800;  // Was 600
```

Then republish with data clear:
```bash
spacetime publish -c --project-path ./server broth-bullets-local
```

See `.cursor/rules/change-map-size.mdc` for the complete procedure.

