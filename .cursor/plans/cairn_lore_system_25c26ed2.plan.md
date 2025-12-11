---
name: Cairn Lore System
overview: Implement cairn monuments that players can interact with to hear audio lore and see text in SOVA chat, with per-player discovery tracking and spawning across the map in valid biomes.
todos:
  - id: server-cairn-module
    content: Create server/src/cairn.rs with Cairn and PlayerDiscoveredCairn tables, constants, and interact_with_cairn reducer
    status: completed
  - id: server-environment-seeding
    content: Add seed_cairns() function to environment.rs with biome-restricted spawning for all 26 cairns
    status: completed
  - id: server-lib-integration
    content: Update lib.rs with mod cairn, table trait imports, and init call
    status: completed
  - id: client-lore-data
    content: Create client/src/data/cairnLoreData.ts with all 26 lore entries
    status: completed
  - id: client-interactions
    content: Add cairn to interactions.ts types and config
    status: completed
  - id: client-data-flow
    content: Update useSpacetimeTables, App, GameScreen, GameCanvas with cairn data flow
    status: completed
  - id: client-interaction-finder
    content: Add cairn detection to useInteractionFinder.ts
    status: completed
  - id: client-input-handler
    content: Handle cairn tap in useInputHandler - call reducer, play audio, show text in SOVA chat
    status: completed
  - id: client-entity-filtering
    content: Add cairn to useEntityFiltering.ts for y-sorted rendering
    status: completed
  - id: client-rendering
    content: Create cairnRenderingUtils.ts with sprite rendering and interaction indicator
    status: completed
  - id: regenerate-bindings
    content: Run spacetime generate after server changes
    status: pending
---

# Cairn Lore System Implementation

Add interactive cairn monuments that play audio lore and display text in SOVA chat when players press E. All 26 cairns spawn on the map (one per lore entry) with per-player discovery tracking.

## Server-Side Changes

### 1. Create `server/src/cairn.rs`

Define cairn table and interaction reducer:

```rust
#[spacetimedb::table(name = cairn, public)]
pub struct Cairn {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub pos_x: f32,
    pub pos_y: f32,
    #[index(btree)]
    pub chunk_index: u32,
    pub lore_id: String,  // Matches CAIRN_LORE_TIDBITS id
}

#[spacetimedb::table(name = player_discovered_cairn, public)]
pub struct PlayerDiscoveredCairn {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub player_identity: Identity,
    #[index(btree)]
    pub cairn_id: u64,
    pub discovered_at: Timestamp,
}

#[reducer]
pub fn interact_with_cairn(ctx: &ReducerContext, cairn_id: u64) -> Result<(), String>
```

Constants: `CAIRN_RADIUS: 40.0`, `PLAYER_CAIRN_INTERACTION_DISTANCE_SQUARED: 100^2`

### 2. Update `server/src/environment.rs`

Add `seed_cairns()` function:

- Spawn all 26 cairns with unique `lore_id` values
- Use noise-based placement similar to rune stones
- Only spawn in biomes: Grass, Forest, Beach, Tundra, Alpine
- Minimum distance between cairns: 800px
- Avoid water, trees, stones, rune stones

### 3. Update `server/src/lib.rs`

- Add `mod cairn;`
- Add table trait imports for `cairn` and `player_discovered_cairn`
- Call `seed_cairns()` in init reducer

## Client-Side Changes

### 4. Create `client/src/data/cairnLoreData.ts`

Export lore data from the markdown spec with types:

- `CairnLoreCategory` type
- `CairnLoreEntry` interface
- `CAIRN_LORE_TIDBITS` array with all 26 entries

### 5. Update `client/src/types/interactions.ts`

```typescript
// Add to InteractionTargetType
| 'cairn'

// Add to INTERACTION_CONFIGS
cairn: {
    behavior: InteractionBehavior.TAP,
    priority: 70,
    actionType: 'interact_cairn'
}
```

### 6. Update Data Flow Chain

**`useSpacetimeTables.ts`:**

- Add `cairns` and `playerDiscoveredCairns` state
- Add subscription handlers for both tables

**`App.tsx`, `GameScreen.tsx`, `GameCanvas.tsx`:**

- Pass cairns through props chain

### 7. Update `useInteractionFinder.ts`

Add cairn detection using `PLAYER_CAIRN_INTERACTION_DISTANCE_SQUARED`

### 8. Update `useInputHandler.ts`

Handle cairn E-tap interaction:

1. Call `interact_with_cairn` reducer
2. Play audio: `/sounds/lore/sova_lore_X.mp3`
3. Add lore text to SOVA chat via `addSOVAMessage`

### 9. Update `useEntityFiltering.ts`

Add cairn filtering for y-sorted rendering

### 10. Create `client/src/utils/renderers/cairnRenderingUtils.ts`

- Render cairn sprite (stone pile/monument)
- Draw blue interaction indicator box with E label when in range
- Similar pattern to existing entity renderers

## Assets Required

- `client/public/sounds/lore/sova_lore_1.mp3` (and additional files as added)
- Cairn sprite image (stone pile/monument doodad)

## Lore IDs Mapping

26 cairns with IDs matching `CAIRN_LORE_TIDBITS`:

`cairn_volcanic_spine`, `cairn_coastline`, `cairn_weather_patterns`, etc.