---
name: Unify Monument Parts Table
overview: Consolidate ShipwreckPart, FishingVillagePart, and WhaleBoneGraveyardPart into a single MonumentPart table to reduce code duplication and simplify subscriptions.
todos:
  - id: server-enum
    content: Add MonumentType enum to lib.rs
    status: pending
  - id: server-table
    content: Replace 3 tables with unified MonumentPart table
    status: pending
  - id: server-gen
    content: Update monument.rs generation functions
    status: pending
  - id: server-worldgen
    content: Update world_generation.rs to use unified table
    status: pending
  - id: server-zones
    content: Update shipwreck.rs, fishing_village.rs, whale_bone_graveyard.rs, active_effects.rs
    status: pending
  - id: client-hooks
    content: Update useSpacetimeTables.ts - single monumentParts subscription
    status: pending
  - id: client-flow
    content: Update App.tsx, GameScreen.tsx, GameCanvas.tsx data flow
    status: pending
  - id: client-filtering
    content: Update useEntityFiltering.ts and compoundBuildings.ts
    status: pending
  - id: client-minimap
    content: Update Minimap.tsx to filter by monument type
    status: pending
---

# Unify Monument Parts Table

## Problem

Currently there are 3 separate tables with nearly identical schemas:

- `shipwreck_part` 
- `fishing_village_part`
- `whale_bone_graveyard_part`

This requires 3 separate subscriptions, 3 sets of handlers, and 3 data flows through the client.

## Solution

Create a single `monument_part` table with a `monument_type` enum to distinguish monument types.

## Server Changes

### 1. Add MonumentType enum in [server/src/lib.rs](server/src/lib.rs)

```rust
#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub enum MonumentType {
    Shipwreck,
    FishingVillage,
    WhaleBoneGraveyard,
}
```

### 2. Replace the 3 tables with unified MonumentPart in [server/src/lib.rs](server/src/lib.rs)

```rust
#[spacetimedb::table(name = monument_part, public)]
pub struct MonumentPart {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub monument_type: MonumentType,
    pub world_x: f32,
    pub world_y: f32,
    pub image_path: String,
    pub part_type: String,  // Add to shipwreck (can be empty or "hull", "bow", etc.)
    pub is_center: bool,
    pub collision_radius: f32,
}
```

### 3. Update monument generation in [server/src/monument.rs](server/src/monument.rs)

- Update `generate_shipwreck()` to return parts with `MonumentType::Shipwreck`
- Update `generate_fishing_village()` to return parts with `MonumentType::FishingVillage`
- Update `generate_whale_bone_graveyard()` to return parts with `MonumentType::WhaleBoneGraveyard`

### 4. Update world_generation.rs to insert into single table

Replace 3 separate insert loops with one that uses the unified table.

### 5. Update zone/collision checks in:

- [server/src/shipwreck.rs](server/src/shipwreck.rs) - Filter by `MonumentType::Shipwreck`
- [server/src/fishing_village.rs](server/src/fishing_village.rs) - Filter by `MonumentType::FishingVillage`
- [server/src/whale_bone_graveyard.rs](server/src/whale_bone_graveyard.rs) - Filter by `MonumentType::WhaleBoneGraveyard`
- [server/src/active_effects.rs](server/src/active_effects.rs) - Update safe zone checks

## Client Changes

### 1. Update useSpacetimeTables.ts

- Remove separate `shipwreckParts`, `fishingVillageParts`, `whaleBoneGraveyardParts` states
- Add single `monumentParts` state with single subscription

### 2. Update data flow through App.tsx, GameScreen.tsx, GameCanvas.tsx

- Pass single `monumentParts` prop instead of 3 separate props

### 3. Update useEntityFiltering.ts

- Filter by `monumentType` field when needed for rendering

### 4. Update compoundBuildings.ts

- Update `getAllCompoundBuildings()` to filter single array by `monumentType`

### 5. Update Minimap.tsx

- Filter `monumentParts` by type for labels

## Benefits

- Single subscription instead of 3
- Less client-side boilerplate (one handler set vs three)
- Easier to add new monument types (just add enum variant)
- Simpler data flow
- Reduced code duplication

## Migration Note

This is a breaking change requiring database wipe (`spacetime publish -c`) since table schema changes.