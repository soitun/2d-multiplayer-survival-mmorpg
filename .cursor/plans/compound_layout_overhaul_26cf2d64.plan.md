---
name: Compound Layout Overhaul
overview: Overhaul the ALK central compound with new buildings (garage, shed repositioned), monument campfires, indestructible barrels, military rations, and dirt road paths carved through the asphalt to create a lived-in military outpost feel.
todos:
  - id: copy-assets
    content: Copy shed.png and garage.png to client/src/assets/doodads/
    status: completed
  - id: buildings-config
    content: Add garage, reposition shed in compoundBuildings.ts and compound_buildings.rs, update monumentRenderingUtils.ts
    status: completed
  - id: monument-campfires
    content: Add 4 campfire entries to get_central_compound_placeables() in monument.rs
    status: completed
  - id: monument-barrels
    content: Add is_monument to Barrel struct, add barrel variant to MonumentPlaceableType, add barrel spawning to monument.rs, add damage check in combat
    status: completed
  - id: monument-rations
    content: Add MilitaryRation to MonumentPlaceableType, spawn 3 monument rations in compound
    status: completed
  - id: dirt-roads
    content: Create carve_dirt_paths_in_compound() in alk.rs, convert asphalt to DirtRoad in cross pattern with building stubs
    status: completed
  - id: build-test
    content: Build server, publish, regenerate client bindings, verify
    status: in_progress
isProject: false
---

# ALK Central Compound Layout Overhaul

## Context

The compound is now ~~41x41 tiles (~~1968x1968 px, +/-960px from center). Current buildings are sparse: ALK building (center), Barracks (450,-300), Fuel Depot (450,400), Shed (0,500), Large Furnace (-450,-300), Rain Collector (-450,400). We have room for a much richer layout.

## Proposed Layout

Offsets from compound center (x: east+, y: south+):

```
           N (-960px)
           |
    Garage(-350,-680)   Shed(350,-680)
           |
  LrgFurnace(-450,-300)   Barracks(450,-300)
     Campfire(-250,-50)   Campfire(300,-50)
  Barrel(-650,50)   [ALK CENTER]   Barrel(650,50)
  MilRation(-250,150)     MilRation(250,200)
     Campfire(-100,350)
  RainCollector(-450,400)  FuelDepot(450,400)
     Campfire(200,600)
  Barrel(-350,750)   MilRation(0,650)   Barrel(350,750)
           |
           S (960px)
```

Dirt road paths (DirtRoad tiles) carve a **cross/plus pattern** through the asphalt:

- **N-S path**: 3 tiles wide, spanning most of the compound vertically
- **E-W path**: 3 tiles wide, spanning most of the compound horizontally
- **Short connector paths**: 2-tile stubs branching toward each building

## Changes Required

### 1. Copy Image Assets

- Copy the user-provided `shed.png` to `client/src/assets/doodads/shed.png`
- Copy the user-provided `garage.png` to `client/src/assets/doodads/garage.png`

### 2. Add Garage Back + Reposition Buildings

**File: [client/src/config/compoundBuildings.ts**](client/src/config/compoundBuildings.ts)

- Add garage building entry back into `COMPOUND_BUILDINGS` array at offset (-350, -680) -- northern area, west side
- Move shed from (0, 500) to (350, -680) -- northern area, east side (symmetric with garage)
- Update coordinate system comment to note compound is now +/-960px (was +/-768px)
- Spread out eerie lights to fill the larger area

**File: [server/src/compound_buildings.rs**](server/src/compound_buildings.rs)

- Add garage collision entry: `{ offset_x: -350.0, offset_y: -680.0, collision_radius: 120.0, ... }`
- Update shed collision to match new position: `{ offset_x: 350.0, offset_y: -680.0, ... }`

**File: [client/src/utils/renderers/monumentRenderingUtils.ts**](client/src/utils/renderers/monumentRenderingUtils.ts)

- Re-add `garage.png` image preloading (currently commented out)
- Ensure both shed and garage images load via the fallback map

### 3. Add Monument Campfires (4x)

**File: [server/src/monument.rs**](server/src/monument.rs) -- `get_central_compound_placeables()`

- Add 4 campfire configs using existing `MonumentPlaceableConfig::campfire()`:
  - (-250, -50) -- between furnace and center
  - (300, -50) -- near barracks entrance
  - (-100, 350) -- southwest courtyard
  - (200, 600) -- south area near fuel depot

These use the existing `is_monument: true` campfire spawning -- indestructible, public access, provide warmth and light.

### 4. Add Monument Barrels (indestructible)

**File: [server/src/barrel.rs**](server/src/barrel.rs) -- Barrel struct

- Add `pub is_monument: bool` field to the `Barrel` struct

**File: [server/src/barrel.rs**](server/src/barrel.rs) -- all barrel creation sites

- Set `is_monument: false` on all existing barrel spawns (environment, respawn)

**File: [server/src/combat.rs**](server/src/combat.rs) (or wherever barrel damage is handled)

- Add `is_monument` check: if barrel.is_monument, return error "Cannot damage monument barrels"

**File: [server/src/monument.rs**](server/src/monument.rs)

- Add `MonumentPlaceableType::Barrel` variant
- Add `MonumentPlaceableConfig::barrel(offset_x, offset_y, variant)` constructor
- Implement barrel spawning in `spawn_monument_placeables()` with `is_monument: true`

**File: [server/src/monument.rs**](server/src/monument.rs) -- `get_central_compound_placeables()`

- Add ~6 monument barrel configs in clusters:
  - (-650, 50), (-620, 80) -- west wall cluster
  - (650, 50), (620, 80) -- east wall cluster  
  - (-350, 750), (-320, 720) -- south-west cluster
  - (350, 750) -- south-east single

### 5. Add Monument Military Rations (lootable, indestructible crate)

**File: [server/src/monument.rs**](server/src/monument.rs)

- Add `MonumentPlaceableType::MilitaryRation` variant
- Implement spawning in `spawn_monument_placeables()` using existing `military_ration::spawn_military_ration_with_loot()` but with `is_monument: true`

**File: [server/src/monument.rs**](server/src/monument.rs) -- `get_central_compound_placeables()`

- Add 3 military ration configs:
  - (-250, 150) -- near furnace/west side
  - (250, 200) -- near barracks/east side
  - (0, 650) -- south center near shed area

### 6. Dirt Road Paths Through Asphalt

**File: [server/src/alk.rs**](server/src/alk.rs)

- Add new function `carve_dirt_paths_in_compound()` called after `spawn_asphalt_around_station()` for the central compound
- Converts selected asphalt tiles to `TileType::DirtRoad` in a cross pattern:
  - **N-S path**: 3 tiles wide (center_tile_x-1 to center_tile_x+1), spanning from center_tile_y-16 to center_tile_y+16
  - **E-W path**: 3 tiles wide (center_tile_y-1 to center_tile_y+1), spanning from center_tile_x-16 to center_tile_x+16
  - **Building stubs**: Short 2-tile paths branching from the cross toward building locations
- Uses the same `idx_world_position().filter()` pattern as `spawn_asphalt_around_station()`
- Skip tiles that are directly under buildings (use building collision positions to exclude)

### 7. Regenerate Client Bindings

After all server changes, run:

```
spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server
```

The `Barrel` struct change adds a new `isMonument` field to the generated TypeScript bindings.