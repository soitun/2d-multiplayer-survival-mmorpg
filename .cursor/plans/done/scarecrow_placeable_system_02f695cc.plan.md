---
name: Scarecrow Placeable System
overview: Add a craftable Scarecrow placeable that deters crows within a 750px radius, along with a new Kayak Paddle melee weapon as a crafting ingredient. The Scarecrow will use the existing WoodenStorageBox entity with 0 inventory slots and be non-interactable.
todos:
  - id: kayak-paddle
    content: Add Kayak Paddle weapon to weapons.rs with light melee stats (20-22 dmg, 1.0s)
    status: completed
  - id: scarecrow-item
    content: Add Scarecrow placeable to placeables.rs with crafting recipe
    status: completed
  - id: box-type-scarecrow
    content: Add BOX_TYPE_SCARECROW constant and handling in wooden_storage_box.rs
    status: completed
  - id: crow-deterrence
    content: Add scarecrow detection and deterrence logic to crow.rs
    status: completed
  - id: client-icons
    content: Add icon mappings for Scarecrow and Kayak Paddle in itemIconUtils.ts
    status: completed
  - id: client-render
    content: Add scarecrow doodad rendering for box_type=7 in client components
    status: completed
---

# Scarecrow Placeable System

## Overview

Add a Scarecrow that players can build to protect their campfires and barbecues from crow thieves. The scarecrow will deter crows within a 750px radius. Implementation reuses the existing `WoodenStorageBox` entity system with a new box type.

## Implementation

### 1. Add Kayak Paddle Weapon

**File:** [server/src/items_database/weapons.rs](server/src/items_database/weapons.rs)

Add a new craftable melee weapon:

```rust
// Kayak Paddle - Light blunt weapon
ItemBuilder::new("Kayak Paddle", "A sturdy paddle carved from driftwood. Light and fast, useful for both paddling and self-defense.", ItemCategory::Weapon)
    .icon("kayak_paddle.png")
    .weapon(20, 22, 1.0) // Light melee: 20-22 damage, 1.0s cooldown
    .damage_type(DamageType::Blunt)
    .crafting_cost(vec![
        CostIngredient { item_name: "Wood".to_string(), quantity: 100 },
        CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
        CostIngredient { item_name: "Tallow".to_string(), quantity: 5 },
    ])
    .crafting_output(1, 30)
    .respawn_time(300)
    .build(),
```

### 2. Add Scarecrow Placeable

**File:** [server/src/items_database/placeables.rs](server/src/items_database/placeables.rs)

Add the Scarecrow item definition:

```rust
// Scarecrow - Deters crows within a large radius
ItemBuilder::new("Scarecrow", "A makeshift scarecrow cobbled together from driftwood and scraps. Deters crows from stealing food within a 750px radius.", ItemCategory::Placeable)
    .icon("scarecrow.png")
    .crafting_cost(vec![
        CostIngredient { item_name: "Wood".to_string(), quantity: 150 },
        CostIngredient { item_name: "Cloth".to_string(), quantity: 15 },
        CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
        CostIngredient { item_name: "Kayak Paddle".to_string(), quantity: 1 },
    ])
    .crafting_output(1, 45)
    .respawn_time(600)
    .build(),
```

### 3. Add Scarecrow Box Type

**File:** [server/src/wooden_storage_box.rs](server/src/wooden_storage_box.rs)

Add new constants and update placement logic:

- Add `BOX_TYPE_SCARECROW: u8 = 7`
- Add `NUM_SCARECROW_SLOTS: usize = 0`
- Add health constants: `SCARECROW_INITIAL_HEALTH: f32 = 200.0`, `SCARECROW_MAX_HEALTH: f32 = 200.0`
- Update `place_wooden_storage_box` to recognize "Scarecrow" and set `BOX_TYPE_SCARECROW`
- Update `num_slots()` to return 0 for scarecrow type
- Update item name resolution functions to handle scarecrow type

### 4. Add Crow Deterrence Logic

**File:** [server/src/wild_animal_npc/crow.rs](server/src/wild_animal_npc/crow.rs)

Add scarecrow detection and deterrence:

- Add constant: `SCARECROW_DETERRENCE_RADIUS_SQUARED: f32 = 750.0 * 750.0`
- Add helper function `is_near_scarecrow(ctx, x, y) -> bool` that checks if position is within deterrence radius of any scarecrow
- Modify `update_ai_state_logic`:
  - In Patrolling state, before attempting campfire/barbecue food stealing, check if target cooking container is protected by a scarecrow
  - If scarecrow is nearby, skip the steal attempt and potentially flee in opposite direction
- Modify player food detection to also check for scarecrow presence (crows avoid players near scarecrows)

### 5. Add Client Icon Mappings

**File:** [client/src/utils/itemIconUtils.ts](client/src/utils/itemIconUtils.ts)

Add icon imports and mappings:

```typescript
// In imports section
import scarecrowIcon from '../assets/items/scarecrow.png';
import kayakPaddleIcon from '../assets/items/kayak_paddle.png';

// In ITEM_ICONS map
'Scarecrow': scarecrowIcon,
'Kayak Paddle': kayakPaddleIcon,
```

### 6. Add Scarecrow Doodad Sprite

The client will need to render the scarecrow using the doodad sprite at `client/src/assets/doodads/scarecrow.png`. This requires adding the scarecrow to the rendering system similarly to other WoodenStorageBox types.

**File:** Update the client rendering component to handle `box_type = 7` (scarecrow) and render the doodad sprite.

## Key Design Decisions

- Scarecrow uses `WoodenStorageBox` entity with `box_type = 7` and 0 slots
- Non-interactable (pressing E does nothing useful since no inventory)
- 750px deterrence radius (larger than campfire warmth, covers a good base area)
- Destroyable with standard building damage mechanics
- Kayak Paddle serves dual purpose: weapon + scarecrow ingredient