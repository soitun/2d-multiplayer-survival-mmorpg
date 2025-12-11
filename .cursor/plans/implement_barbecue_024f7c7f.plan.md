---
name: Implement Barbecue
overview: Implement a Barbecue entity with campfire-like cooking functionality (12 slots), including full server-side logic, client-side rendering/interaction, and memory grid placement before Refrigerator.
todos:
  - id: server-constants
    content: Add BOX_TYPE_BARBECUE and NUM_BARBECUE_SLOTS constants to wooden_storage_box.rs
    status: completed
  - id: server-container-type
    content: Add Barbecue variant to ContainerType enum in models.rs
    status: completed
  - id: server-barbecue-module
    content: Create barbecue.rs with table, traits, and all reducers
    status: completed
  - id: server-lib-registration
    content: Add mod barbecue and pub use to lib.rs
    status: completed
  - id: server-item-definition
    content: Add Barbecue item definition to placeables.rs
    status: completed
  - id: server-memory-grid
    content: Add barbecue node and update refrigerator prereq in memory_grid.rs
    status: completed
  - id: client-rendering-utils
    content: Create barbecueRenderingUtils.ts with dimensions and render function
    status: completed
  - id: client-asset
    content: Add barbecue.png asset to doodads folder
    status: completed
  - id: client-data-subscription
    content: Add Barbecue subscription to useSpacetimeTables.ts
    status: completed
  - id: client-data-flow
    content: Pass barbecues through App.tsx → GameScreen.tsx → GameCanvas.tsx
    status: completed
  - id: client-entity-filtering
    content: Add barbecue filtering to useEntityFiltering.ts
    status: completed
  - id: client-interaction-finder
    content: Add barbecue detection to useInteractionFinder.ts
    status: completed
  - id: client-interaction-types
    content: Add barbecue to interactions.ts types and configs
    status: completed
  - id: client-interaction-manager
    content: Handle barbecue in useInteractionManager.ts
    status: completed
  - id: client-input-handler
    content: Handle barbecue interaction in useInputHandler.ts
    status: completed
  - id: client-collision
    content: Add barbecue collision to clientCollision.ts
    status: completed
  - id: client-container-utils
    content: Add barbecue handling to containerUtils.ts
    status: completed
  - id: client-memory-grid-data
    content: Add barbecue to MemoryGridData.ts and update refrigerator prereq
    status: completed
  - id: client-ui-components
    content: Update UI components for barbecue container display
    status: completed
---

# Implement Barbecue

A cooking appliance with 12 slots that functions like a campfire (burning state, fuel management, per-slot cooking progress). Placed in memory grid before Refrigerator.

## Server-Side Changes

### 1. Constants in `server/src/wooden_storage_box.rs`
Add constants (even though Barbecue is its own table, these help with consistency):
```rust
pub const BOX_TYPE_BARBECUE: u8 = 5;
pub const NUM_BARBECUE_SLOTS: usize = 12;
```

### 2. ContainerType in `server/src/models.rs`
Add `Barbecue` variant to the enum.

### 3. Create `server/src/barbecue.rs`
New module with:
- `Barbecue` table (12 slot pairs, `is_burning`, fuel fields, 12 `CookingProgress` fields)
- `BarbecueProcessingSchedule` table for scheduled cooking/fuel ticks
- `ItemContainer` trait implementation
- `CookableAppliance` trait implementation
- Reducers: `place_barbecue`, `interact_barbecue`, `toggle_barbecue_burning`, `pickup_barbecue`
- Item movement reducers: `move_item_to_barbecue`, `split_stack_into_barbecue`, `quick_move_to_barbecue`, `move_item_from_barbecue`, `drop_item_from_barbecue`
- Scheduled reducer: `process_barbecue_logic_scheduled`

### 4. Module registration in `server/src/lib.rs`
Add `mod barbecue;` and `pub use barbecue::*;`

### 5. Item definition in `server/src/items_database/placeables.rs`
Add Barbecue item with crafting recipe.

### 6. Memory Grid in `server/src/memory_grid.rs`
Add `"barbecue"` node (cost ~250, prereq: reed-rain-collector).
Update `"refrigerator"` prerequisite from `reed-rain-collector` to `barbecue`.

## Client-Side Changes

### 7. Rendering Utils: `client/src/utils/renderers/barbecueRenderingUtils.ts`
Create new file with:
- Dimensions: `BARBECUE_WIDTH`, `BARBECUE_HEIGHT`
- Interaction distance: `PLAYER_BARBECUE_INTERACTION_DISTANCE_SQUARED`
- Render function using `renderConfiguredGroundEntity`
- Shake animation tracking

### 8. Asset
Add barbecue image to `client/src/assets/doodads/barbecue.png`

### 9. Data Flow - `useSpacetimeTables.ts`
Add subscription for `Barbecue` table with insert/update/delete handlers.

### 10. Data Flow - `App.tsx`
Destructure `barbecues` from `useSpacetimeTables` and pass to `GameScreen`.

### 11. Data Flow - `GameScreen.tsx`
Add `barbecues` prop and pass to `GameCanvas`.

### 12. Data Flow - `GameCanvas.tsx`
Add `barbecues` prop and pass to relevant hooks.

### 13. Entity Filtering - `useEntityFiltering.ts`
Add `visibleBarbecues` filtering and include in y-sorted entities.

### 14. Interaction Finding - `useInteractionFinder.ts`
- Import `Barbecue` from generated
- Add `barbecues` prop
- Add `closestInteractableBarbecueId` state
- Add barbecue distance calculation and tracking
- Add to candidates list and return

### 15. Interaction Types - `client/src/types/interactions.ts`
- Add `'barbecue'` to `InteractionTargetType`
- Add barbecue config to `INTERACTION_CONFIGS` (INTERFACE behavior, priority 80)
- Add barbecue cases to helper functions (`hasSecondaryHoldAction`, `getSecondaryHoldDuration`, etc.)

### 16. Interaction Manager - `useInteractionManager.ts`
Add barbecue case for tap (open UI) and secondary hold (toggle burning).

### 17. Input Handler - `useInputHandler.ts`
Handle barbecue interaction similar to campfire (open UI, toggle burning on hold).

### 18. Collision - `clientCollision.ts`
Add barbecue collision shape (similar to campfire).

### 19. Container Utils - `containerUtils.ts`
Add barbecue container type handling for slot counts and UI display.

### 20. Memory Grid Data - `MemoryGridData.ts`
- Add barbecue node (tier 4, prereq: reed-rain-collector, position ~370 radius)
- Update refrigerator prerequisites to `['barbecue']`
- Add to `ITEM_TO_NODE_MAP`: `'Barbecue': 'barbecue'`

### 21. UI Components
Update container/inventory UI to handle barbecue container type (similar to campfire UI with cooking progress display).