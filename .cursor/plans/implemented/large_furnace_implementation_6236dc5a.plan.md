---
name: Large Furnace Implementation
overview: Add a Large Furnace placeable (18 slots, 256x256 rendering, ~50px collision) by extending the existing Furnace system with a `furnace_type` field, following the same pattern used for WoodenStorageBox variants.
todos:
  - id: server-furnace
    content: Extend Furnace struct with furnace_type, 18 slots, and collision helpers
    status: completed
  - id: server-placeables
    content: Add Large Furnace item definition to placeables.rs
    status: completed
  - id: server-collision
    content: Update player collision to use dynamic furnace collision radius
    status: completed
  - id: client-icons
    content: Add large furnace icon import and mapping
    status: completed
  - id: client-rendering
    content: Add large furnace rendering config with 256x256 dimensions
    status: completed
  - id: client-container
    content: Update containerUtils for large furnace slot count and display name
    status: completed
  - id: client-placement
    content: Add large furnace placement preview rendering
    status: completed
  - id: client-manager
    content: Update placement manager for Large Furnace item
    status: completed
  - id: regenerate-bindings
    content: Regenerate TypeScript client bindings
    status: completed
isProject: false
---

# Large Furnace Implementation

This plan adds a Large Furnace (18 slots) by extending the existing Furnace system with a `furnace_type` field, similar to how `WoodenStorageBox` uses `box_type` for variants.

## Server-Side Changes

### 1. Extend Furnace Struct ([server/src/furnace.rs](server/src/furnace.rs))

- Add `furnace_type: u8` field to `Furnace` struct
- Add constants: `FURNACE_TYPE_NORMAL = 0`, `FURNACE_TYPE_LARGE = 1`
- Add 13 more slot fields (slots 5-17) to support 18 total slots
- Add corresponding `slot_X_cooking_progress` fields for new slots
- Add Large Furnace-specific collision constants:
  - `LARGE_FURNACE_COLLISION_RADIUS: f32 = 50.0`
  - `LARGE_FURNACE_COLLISION_Y_OFFSET: f32 = 0.0`
- Update `ItemContainer::num_slots()` to return 5 or 18 based on `furnace_type`
- Update `get_slot_instance_id`, `get_slot_def_id`, `set_slot` to handle slots 5-17
- Update `CookableAppliance` impl to handle cooking progress for slots 5-17
- Add helper function `get_furnace_collision_radius(furnace_type: u8) -> f32`
- Update `place_furnace` reducer to:
  - Accept both "Furnace" and "Large Furnace" item names
  - Set `furnace_type` based on placed item
  - Apply appropriate Y offset for large furnace (larger sprite)

### 2. Add Item Definition ([server/src/items_database/placeables.rs](server/src/items_database/placeables.rs))

Add "Large Furnace" item definition after regular Furnace:

```rust
ItemBuilder::new("Large Furnace", "A massive industrial furnace with 18 slots for high-volume smelting. Burns wood as fuel.", ItemCategory::Placeable)
    .icon("large_furnance.png")
    .stackable(2)
    .crafting_cost(vec![
        CostIngredient { item_name: "Stone".to_string(), quantity: 200 },
        CostIngredient { item_name: "Wood".to_string(), quantity: 100 },
        CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 50 },
        CostIngredient { item_name: "Tallow".to_string(), quantity: 50 },
    ])
    .crafting_output(1, 15)
    .respawn_time(600)
    .build(),
```

### 3. Update Player Collision ([server/src/player_collision.rs](server/src/player_collision.rs))

- Import large furnace collision constant
- Update furnace collision checks to use `get_furnace_collision_radius(furnace.furnace_type)`

## Client-Side Changes

### 4. Add Asset Imports

**[client/src/utils/itemIconUtils.ts](client/src/utils/itemIconUtils.ts)**

- Import `large_furnance.png` from items folder
- Add mapping: `'large_furnance.png': largeFurnaceIcon`

### 5. Update Furnace Rendering ([client/src/utils/renderers/furnaceRenderingUtils.ts](client/src/utils/renderers/furnaceRenderingUtils.ts))

- Import large furnace doodad images (`large_furnance.png`, `large_furnance_on.png` if it exists)
- Add constants:
  - `LARGE_FURNACE_WIDTH = 256`
  - `LARGE_FURNACE_HEIGHT = 256`
  - `LARGE_FURNACE_RENDER_Y_OFFSET` (appropriate for 256px height)
- Add `FURNACE_TYPE_NORMAL = 0`, `FURNACE_TYPE_LARGE = 1`
- Create `largeFurnaceConfig` (similar to `furnaceConfig` but with large dimensions)
- Update `renderFurnace` to check `furnace.furnaceType` and use appropriate config
- Add helper `getFurnaceDimensions(furnaceType: number)` for external use

### 6. Update Container Utils ([client/src/utils/containerUtils.ts](client/src/utils/containerUtils.ts))

- Add `FURNACE_TYPE_NORMAL = 0`, `FURNACE_TYPE_LARGE = 1` constants
- Add `NUM_LARGE_FURNACE_SLOTS = 18`
- Update `getContainerConfig()` to check `entity.furnaceType` for furnace containers
- Update `getContainerDisplayName()` to return "LARGE FURNACE" when appropriate

### 7. Update Placement Rendering ([client/src/utils/renderers/placementRenderingUtils.ts](client/src/utils/renderers/placementRenderingUtils.ts))

- Import large furnace dimensions from furnaceRenderingUtils
- Add case for `large_furnance.png` placement preview:
  - Load doodad image `large_furnance.png`
  - Use 256x256 dimensions
- Add "Large Furnace" to `waterBlockedItems` list

### 8. Update Placement Manager ([client/src/hooks/usePlacementManager.ts](client/src/hooks/usePlacementManager.ts))

- Add case for "Large Furnace" to call `placeFurnace` reducer (same reducer handles both types)

### 9. Update ExternalContainerUI ([client/src/components/ExternalContainerUI.tsx](client/src/components/ExternalContainerUI.tsx))

- The existing furnace UI should work with dynamic slot counts via `getContainerConfig()`
- May need to update grid columns for 18-slot display (suggest 6 columns like storage box)

## File Changes Summary


| File                                                    | Changes                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `server/src/furnace.rs`                                 | Add furnace_type field, 13 new slots, update ItemContainer impl |
| `server/src/items_database/placeables.rs`               | Add Large Furnace item definition                               |
| `server/src/player_collision.rs`                        | Update collision checks for furnace type                        |
| `client/src/utils/itemIconUtils.ts`                     | Add large furnace icon mapping                                  |
| `client/src/utils/renderers/furnaceRenderingUtils.ts`   | Add large furnace rendering config                              |
| `client/src/utils/containerUtils.ts`                    | Add furnace type constants and config logic                     |
| `client/src/utils/renderers/placementRenderingUtils.ts` | Add large furnace placement preview                             |
| `client/src/hooks/usePlacementManager.ts`               | Add Large Furnace placement handling                            |


## Notes

- The existing furnace reducers (move, split, toggle, etc.) should work without changes since they use the `ItemContainer` trait
- Client bindings will need to be regenerated after server changes
- The provided images use filename `large_furnance.png` (with typo) - keeping this for consistency

