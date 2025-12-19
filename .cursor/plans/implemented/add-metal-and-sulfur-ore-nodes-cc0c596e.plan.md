<!-- cc0c596e-5f0f-4382-a899-05e2d34e9239 62f18c3b-0d9d-4baa-b75b-b7c399d41719 -->
# Add Metal and Sulfur Ore Nodes

## Overview

Refactor the stone ore node system to support multiple ore types (Stone, Metal, Sulfur) with location-based spawning. Metal and Sulfur nodes will spawn more frequently in northern terrain and quarries, while Stone nodes will be more common in southern areas.

## Implementation Steps

### 1. Add Ore Type Enum to Stone Module

**File:** `server/src/stone.rs`

- Add `OreType` enum with variants: `Stone`, `Metal`, `Sulfur`
- Derive `SpacetimeType`, `Clone`, `Debug`, `PartialEq`
- Add `ore_type` field to `Stone` struct
- Add helper method `OreType::get_resource_name()` that returns the item name string ("Stone", "Metal Ore", "Sulfur Ore")
- Add helper method `OreType::random_for_location()` that takes position and quarry status, returns weighted random ore type based on location

### 2. Add Metal and Sulfur Items to Items Database

**File:** `server/src/items_database/materials.rs`

- Add "Metal Ore" item definition (similar to existing "Metal Ore" but ensure it matches the name used in stone.rs)
- Add "Sulfur Ore" item definition
- Both should use `basic_material()` builder with:
  - Stack size: 1000
  - Respawn time: 300 (same as Stone)
  - Icons: "metal.png" and "sulfur.png" (from doodads folder)

### 3. Refactor Stone Seeding Logic

**File:** `server/src/environment.rs`

- Update regular stone seeding (around line 1154):
  - Determine ore type using `OreType::random_for_location(pos_x, pos_y, is_in_quarry)`
  - Pass ore type when creating stone instances
  - Adjust probabilities: North = 40% Metal, 30% Sulfur, 30% Stone; South = 70% Stone, 20% Metal, 10% Sulfur

- Update quarry stone seeding (around line 1504):
  - Check if position is in quarry using `is_position_on_monument()` or tile type check
  - Use same `OreType::random_for_location()` with quarry flag
  - Quarry probabilities: 50% Metal, 30% Sulfur, 20% Stone

### 4. Update Stone Mining Logic

**File:** `server/src/combat.rs`

- Modify `damage_stone()` function (around line 1304):
  - Get ore type from stone entity
  - Use `ore_type.get_resource_name()` instead of hardcoded "Stone" string
  - Pass the correct resource name to `grant_resource()`

- Update `calculate_damage_and_yield()` fallback (around line 1139):
  - For `TargetType::Stone`, determine resource name from stone's ore type
  - This requires passing stone entity or ore type to the function, or handling it in the caller

### 5. Update Client-Side Rendering

**File:** `client/src/utils/renderers/stoneRenderingUtils.ts`

- Import metal and sulfur images from `doodads/metal.png` and `doodads/sulfur.png`
- Update `stoneConfig.getImageSource()` to check `stone.oreType` and return appropriate image
- Preload all three images (stone, metal, sulfur) in `imageManager`
- Update fallback color logic if needed

### 6. Update Client Data Flow

**Files:**

- `client/src/hooks/useSpacetimeTables.ts`
- `client/src/App.tsx`
- `client/src/components/GameScreen.tsx`
- `client/src/components/GameCanvas.tsx`

- Ensure `oreType` field is properly subscribed and passed through the data flow
- No changes needed if the field is automatically included in the generated types

### 7. Update Generated Types (Automatic)

- After server changes, regenerate client bindings: `spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server`
- The `Stone` type will automatically include the new `oreType` field

### 8. Update Respawn Logic

**File:** `server/src/respawn.rs`

- Update stone respawn logic (if any) to preserve ore type when respawning
- Ensure respawned stones maintain their original ore type

## Location-Based Spawning Logic

### Helper Function: `OreType::random_for_location()`

```rust
pub fn random_for_location(pos_x: f32, pos_y: f32, is_in_quarry: bool, rng: &mut impl Rng) -> OreType {
    let center_y = crate::WORLD_HEIGHT_PX / 2.0;
    let is_north = pos_y < center_y;
    
    if is_in_quarry {
        // Quarries: 50% Metal, 30% Sulfur, 20% Stone
        let roll = rng.gen::<f32>();
        if roll < 0.5 { OreType::Metal }
        else if roll < 0.8 { OreType::Sulfur }
        else { OreType::Stone }
    } else if is_north {
        // North terrain: 40% Metal, 30% Sulfur, 30% Stone
        let roll = rng.gen::<f32>();
        if roll < 0.4 { OreType::Metal }
        else if roll < 0.7 { OreType::Sulfur }
        else { OreType::Stone }
    } else {
        // South terrain: 70% Stone, 20% Metal, 10% Sulfur
        let roll = rng.gen::<f32>();
        if roll < 0.7 { OreType::Stone }
        else if roll < 0.9 { OreType::Metal }
        else { OreType::Sulfur }
    }
}
```

## Testing Considerations

- Verify ore types spawn correctly in different regions
- Test mining grants correct resources based on ore type
- Ensure client renders correct sprites for each ore type
- Verify respawn maintains ore type
- Check that existing stones (if any) get migrated or handled gracefully

## Migration Notes

- Existing stones in the database will need an `ore_type` field
- Consider adding a migration reducer or defaulting existing stones to `OreType::Stone`
- Or clear and reseed the world after deployment

### To-dos

- [ ] Add OreType enum to stone.rs with Stone, Metal, Sulfur variants and helper methods
- [ ] Add Metal Ore and Sulfur Ore item definitions to materials.rs
- [ ] Update stone seeding logic in environment.rs to use location-based ore type selection
- [ ] Modify damage_stone() in combat.rs to grant correct resource based on ore type
- [ ] Update stoneRenderingUtils.ts to render different sprites based on ore type
- [ ] Regenerate TypeScript bindings after server changes
- [ ] Test that ore types spawn correctly in north/south/quarry areas
- [ ] Verify mining grants correct resources (Stone/Metal Ore/Sulfur Ore)