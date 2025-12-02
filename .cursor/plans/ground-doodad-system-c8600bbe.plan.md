<!-- c8600bbe-1000-425d-b525-d1d7531f209c a0a9bcbe-ca2d-4539-a12d-d2028ff231d5 -->
# Ground Doodad System Implementation

## Overview

Add a client-side, deterministic ground doodad system that renders decorative transparent PNGs at the center of world tiles. Doodads are generated deterministically using tile position as seed, ensuring consistency without server storage.

## Architecture

### 1. Configuration System

**File:** `client/src/config/doodadConfig.ts`

- Define doodad sets per tile type (Beach, Grass, Tundra, Sea, etc.)
- Each doodad entry includes:
  - Image path (relative to assets/doodads/ground/)
  - Spawn probability (0.0 to 1.0)
  - Optional animation config (frame count, duration)
  - Optional size override (defaults to tile-appropriate size)
- Example structure:
```typescript
type DoodadConfig = {
  image: string;
  probability: number;
  animation?: { frames: number; durationMs: number };
  size?: { width: number; height: number };
};

type TileTypeDoodads = {
  [tileType: string]: DoodadConfig[];
};
```


### 2. Deterministic Generation

**File:** `client/src/utils/doodadGenerator.ts`

- Seeded PRNG using tile position (tileX, tileY) as seed
- Simple hash-based seed function: `seed = hash(tileX, tileY, tileType)`
- For each tile, iterate through doodad configs and roll probability
- Return array of doodads to render for that tile (can be 0, 1, or multiple)
- Cache results in Map<tileKey, DoodadInstance[]> to avoid recalculation

### 3. Rendering Integration

**File:** `client/src/utils/renderers/doodadRenderer.ts`

- Render function that takes canvas context, tile position, and doodad instances
- Handles both static and animated doodads
- Renders at tile center with optional slight random offset for organic feel
- Uses existing image loading pattern (preload in GameCanvas, pass ref)

### 4. Integration into Tile Renderer

**File:** `client/src/utils/renderers/proceduralWorldRenderer.ts`

- Modify `renderTileAt()` to:

  1. Render tile as normal
  2. Generate/cache doodads for this tile
  3. Render doodads after tile (before players)

- Use existing viewport culling (already in place)

### 5. Asset Loading

**File:** `client/src/components/GameCanvas.tsx`

- Add `groundDoodadImagesRef` similar to existing `doodadImagesRef`
- Preload all ground doodad images during component mount
- Pass ref to `ProceduralWorldRenderer` for rendering

## Implementation Details

### Performance Optimizations

1. **Viewport Culling**: Only process tiles visible in viewport (already handled)
2. **Caching**: Cache doodad decisions per tile to avoid recalculation on every frame
3. **Batch Loading**: Preload all doodad images upfront, not on-demand
4. **Minimal Calculations**: Use simple hash-based PRNG, not complex random
5. **Early Exit**: Skip doodad generation if tile has no doodad config

### Rendering Order

- Render after base tile texture
- Render before players/entities (so players walk over them)
- Use existing canvas context translation (already in place)

### Deterministic Seed Function

```typescript
function getTileSeed(tileX: number, tileY: number, tileType: string): number {
  // Simple hash combining position and type
  const hash = ((tileX * 73856093) ^ (tileY * 19349663) ^ (tileType.charCodeAt(0) * 83492791)) >>> 0;
  return hash;
}
```

### Doodad Instance Structure

```typescript
type DoodadInstance = {
  config: DoodadConfig;
  offsetX: number; // Small random offset from tile center
  offsetY: number;
  animationFrame?: number; // For animated doodads
};
```

## File Changes

1. **New Files:**

   - `client/src/config/doodadConfig.ts` - Doodad configuration per tile type
   - `client/src/utils/doodadGenerator.ts` - Deterministic generation logic
   - `client/src/utils/renderers/doodadRenderer.ts` - Rendering functions

2. **Modified Files:**

   - `client/src/utils/renderers/proceduralWorldRenderer.ts` - Integrate doodad rendering
   - `client/src/components/GameCanvas.tsx` - Add asset loading for ground doodads

3. **Asset Structure:**

   - `client/src/assets/doodads/ground/` - New folder for ground doodad images
   - Organize by tile type: `beach/`, `grass/`, `tundra/`, etc.

## Configuration Example

```typescript
export const groundDoodadConfig: TileTypeDoodads = {
  Beach: [
    { image: 'beach/crab_shell.png', probability: 0.05 },
    { image: 'beach/pebble.png', probability: 0.10 },
    { image: 'beach/bone.png', probability: 0.02 },
  ],
  Grass: [
    { image: 'grass/flower_red.png', probability: 0.08 },
    { image: 'grass/grass_tuft.png', probability: 0.15 },
    { image: 'grass/pebble.png', probability: 0.05 },
  ],
  Tundra: [
    { image: 'tundra/small_rock.png', probability: 0.12 },
    { image: 'tundra/tundra_grass.png', probability: 0.10 },
  ],
  // ... other tile types
};
```

### Fallback Image Handling

- Import error icon similar to `itemIconUtils.ts`: `import errorIcon from '../assets/items/error.png'`
- Use fallback when doodad image fails to load or is missing
- Log warnings for missing images (similar to itemIconUtils pattern)

## Testing Considerations

1. Verify deterministic behavior: same tile position always shows same doodad
2. Performance profiling: ensure no frame drops with doodads enabled
3. Visual testing: ensure organic feel, not overdone
4. Edge cases: tiles at world boundaries, different tile types

## Future Enhancements (Not in Initial Implementation)

- Animated doodads (swaying grass, flickering embers)
- Seasonal variations
- Player interaction (stepping on flowers, collecting shells)
- LOD system for distant doodads (lower probability)

### To-dos

- [ ] Create doodadConfig.ts with tile type configurations and spawn probabilities
- [ ] Implement deterministic doodad generator using tile position as seed
- [ ] Create doodadRenderer.ts with rendering functions for static and animated doodads
- [ ] Integrate doodad rendering into ProceduralWorldRenderer.renderTileAt()
- [ ] Add ground doodad image loading in GameCanvas.tsx component
- [ ] Create assets/doodads/ground/ folder structure with placeholder images