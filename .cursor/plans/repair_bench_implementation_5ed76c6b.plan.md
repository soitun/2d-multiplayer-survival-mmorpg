---
name: Repair Bench Implementation (WoodenStorageBox Variant)
overview: Implement Repair Bench as a variant of WoodenStorageBox (box_type=5), allowing players to repair damaged items at a fraction of their crafting cost, with each repair reducing the item's maximum durability by 25%.
todos:
  - id: server-constants
    content: Add BOX_TYPE_REPAIR_BENCH constant and slot count to wooden_storage_box.rs
    status: completed
  - id: server-module
    content: Create repair_bench.rs with validation and wrapper reducers
    status: completed
    dependencies:
      - server-constants
  - id: durability-extend
    content: Extend durability.rs with max_durability and repair_count tracking functions
    status: completed
  - id: item-definition
    content: Add Repair Bench item definition to placeables.rs
    status: completed
  - id: lib-module
    content: Register repair_bench module in lib.rs
    status: completed
    dependencies:
      - server-module
  - id: client-icon
    content: Add repair_bench.png icon mapping in itemIconUtils.ts
    status: completed
  - id: client-renderer
    content: Add BOX_TYPE_REPAIR_BENCH to woodenStorageBoxRenderingUtils.ts with image and dimensions
    status: completed
  - id: client-placement
    content: Add Repair Bench placement support in placementRenderingUtils.ts and usePlacementManager.ts
    status: completed
  - id: client-ui
    content: Implement Repair Bench UI in ExternalContainerUI.tsx with repair button (check boxType === 5)
    status: completed
    dependencies:
      - durability-extend
  - id: client-quickmove
    content: Update quickMoveUtils.ts to handle repair bench reducers
    status: completed
    dependencies:
      - server-module
---

# Repair Bench Implementation Plan (WoodenStorageBox Variant)

## Architecture Decision

**Repair Bench is implemented as a WoodenStorageBox variant** (like Refrigerator, Compost, Backpack), NOT a separate table.

### Benefits of Variant Approach

- ✅ **No new table** - Uses existing `WoodenStorageBox` table with `box_type = 5`
- ✅ **No subscription changes** - Client already subscribed to `WoodenStorageBox`
- ✅ **No entity filtering changes** - Already filters `WoodenStorageBox`
- ✅ **No interaction finder changes** - Already finds `WoodenStorageBox`
- ✅ **No GameScreen/App changes** - Already passes `WoodenStorageBox` data
- ✅ **No new rendering file** - Just add a case to existing switch in `woodenStorageBoxRenderingUtils.ts`
- ✅ **No collision changes** - Uses existing box collision
- ✅ **No Y-sort changes** - Already renders `WoodenStorageBox` in sort
- ✅ **Reuses ItemContainer trait** - Generic move/split handlers work automatically

---

## Design Decisions

### Repair Cost Scaling

**Decision**: Repair costs **scale down** with each repair (50% → 25% → 12.5% of original crafting cost).

- **Rationale**: Each repair gives diminishing returns (75% → 50% → 25% max durability), so costs should proportionally decrease.
- First repair: 50% of crafting cost, restores to 75% max durability
- Second repair: 25% of crafting cost, restores to 50% max durability  
- Third repair: 12.5% of crafting cost, restores to 25% max durability
- Fourth+ repair: Not allowed ("Item is too degraded to repair")

### Max Durability Tracking

Extend `item_data` JSON to include `max_durability` (default 100) and `repair_count` (default 0).

---

## Server Implementation

### 1. Update `server/src/wooden_storage_box.rs`

Add constants:

```rust
pub const BOX_TYPE_REPAIR_BENCH: u8 = 5;
pub const NUM_REPAIR_BENCH_SLOTS: usize = 1;
pub const REPAIR_BENCH_INITIAL_HEALTH: f32 = 500.0;
pub const REPAIR_BENCH_MAX_HEALTH: f32 = 500.0;
```

### 2. Create `server/src/repair_bench.rs`

Follow the pattern from `refrigerator.rs` and `compost.rs`:

```rust
use crate::wooden_storage_box::{
    WoodenStorageBox, BOX_TYPE_REPAIR_BENCH, validate_box_interaction,
    wooden_storage_box as WoodenStorageBoxTableTrait
};
```

**Validation function:**

- `is_item_repairable(item_def, item_instance)` - Check if item has durability system and repair_count < 3

**Wrapper reducers (with validation):**

- `move_item_to_repair_bench(box_id, target_slot_index, item_instance_id)` - Only allows repairable items
- `quick_move_to_repair_bench(box_id, item_instance_id)` - Only allows repairable items  
- `split_stack_into_repair_bench()` - Likely not needed (single slot, no stacking)

**Repair bench specific reducers:**

- `place_repair_bench(item_instance_id, pos_x, pos_y)` - Creates WoodenStorageBox with box_type=5
- `repair_item(box_id)` - Main repair logic:
  - Validates item can be repaired
  - Calculates repair cost
  - Checks player has materials
  - Consumes materials
  - Reduces max_durability by 25%
  - Restores current durability to new max_durability
  - Increments repair_count
- `pickup_repair_bench(box_id)` - Pick up empty bench

**Note:** `move_item_from_repair_bench` and `quick_move_from_repair_bench` can use base `move_item_from_box` and `quick_move_from_box` reducers since they don't need validation.

### 3. Update `server/src/durability.rs`

- Add `get_max_durability()` / `set_max_durability()` functions (defaults to 100.0)
- Add `get_repair_count()` / `set_repair_count()` functions (defaults to 0)
- Add `calculate_repair_cost()` function that:
  - Gets item's `crafting_cost` from definition
  - Scales cost based on repair count (50% → 25% → 12.5%)
  - Returns `Vec<CostIngredient>` or error if item can't be repaired
- Add `can_item_be_repaired()` function that checks:
  - Item has durability system (`has_durability_system()`)
  - Repair count < 3
  - Max durability > 25.0
- Add `consume_repair_materials()` function that:
  - Takes `Vec<CostIngredient>` and player ID
  - Consumes ALL materials from player inventory (not just wood/stone/metal)
  - Handles stack splitting/consumption properly

### 4. Update `server/src/lib.rs`

- Add `mod repair_bench;`
- Re-export reducers

### 5. Add Item Definition in `server/src/items_database/placeables.rs`

```rust
ItemBuilder::new("Repair Bench", "A workbench for repairing damaged items. Each repair reduces max durability.", ItemCategory::Placeable)
    .icon("repair_bench.png")
    .crafting_cost(vec![
        CostIngredient { item_name: "Wood".to_string(), quantity: 75 },
        CostIngredient { item_name: "Stone".to_string(), quantity: 25 },
    ])
    .crafting_output(1, 15)
    .build(),
```

---

## Client Implementation

### 6. Update `client/src/utils/itemIconUtils.ts`

```typescript
import repairBenchIcon from '../assets/items/repair_bench.png';
// ...
'repair_bench.png': repairBenchIcon,
```

### 7. Update `client/src/utils/renderers/woodenStorageBoxRenderingUtils.ts`

Add constants and image:

```typescript
import repairBenchImage from '../../assets/doodads/repair_bench.png';

export const BOX_TYPE_REPAIR_BENCH = 5;
export const REPAIR_BENCH_WIDTH = 64;
export const REPAIR_BENCH_HEIGHT = 64;

// Preload
imageManager.preloadImage(repairBenchImage);
```

Update `getImageSource` switch:

```typescript
case BOX_TYPE_REPAIR_BENCH:
    return repairBenchImage;
```

Update `getTargetDimensions` switch:

```typescript
case BOX_TYPE_REPAIR_BENCH:
    return { width: REPAIR_BENCH_WIDTH, height: REPAIR_BENCH_HEIGHT };
```

### 8. Update `client/src/utils/renderers/placementRenderingUtils.ts`

Add "Repair Bench" to `waterBlockedItems` array (if not already handling via wooden storage box).

### 9. Update `client/src/hooks/usePlacementManager.ts`

Add case for "Repair Bench" in `attemptPlacement` switch:

```typescript
case 'Repair Bench':
    connection.reducers.placeRepairBench(placementInfo.instanceId, worldX, worldY);
    break;
```

Add to `waterBlockedItems` if needed.

### 10. Update `client/src/components/ExternalContainerUI.tsx`

Check `boxType === 5` (or `BOX_TYPE_REPAIR_BENCH`) to show repair-specific UI:

```typescript
// Import constant
import { BOX_TYPE_REPAIR_BENCH } from '../utils/renderers/woodenStorageBoxRenderingUtils';

// Check if this is a repair bench
const isRepairBench = container.containerType === 'wooden_storage_box' && 
                      (container.containerEntity as WoodenStorageBox)?.boxType === BOX_TYPE_REPAIR_BENCH;

// Render repair UI when isRepairBench is true
{isRepairBench && (
    <div className={styles.repairSection}>
        {/* Durability display: "45/75" */}
        {/* Repair count: "2/3 repairs used" */}
        {/* Repair cost display */}
        {/* Repair button */}
    </div>
)}
```

**Repair button logic:**

- Disabled when: slot empty, item not repairable, item too degraded (repair_count ≥ 3), insufficient materials
- Show "Too degraded" message when repair count ≥ 3
- Show current/max durability (e.g., "45/75")
- Show repair count (e.g., "2/3 repairs used")
- Show repair cost with material availability

### 11. Update `client/src/utils/quickMoveUtils.ts`

Add repair bench reducer calls for quick move operations:

```typescript
// When quick moving TO repair bench
connection.reducers.quickMoveToRepairBench(boxId, itemInstanceId);

// When quick moving FROM repair bench (uses base reducer)
connection.reducers.quickMoveFromBox(boxId, itemInstanceId);
```

---

## Key Files to Modify/Create

| File | Action |

|------|--------|

| `server/src/wooden_storage_box.rs` | **MODIFY** - Add constants |

| `server/src/repair_bench.rs` | **CREATE** - Validation and wrapper reducers |

| `server/src/durability.rs` | **MODIFY** - Add max_durability tracking, repair cost calculation |

| `server/src/lib.rs` | **MODIFY** - Module declaration |

| `server/src/items_database/placeables.rs` | **MODIFY** - Add item definition |

| `client/src/utils/itemIconUtils.ts` | **MODIFY** - Add icon |

| `client/src/utils/renderers/woodenStorageBoxRenderingUtils.ts` | **MODIFY** - Add box type case |

| `client/src/utils/renderers/placementRenderingUtils.ts` | **MODIFY** - Add to waterBlockedItems |

| `client/src/hooks/usePlacementManager.ts` | **MODIFY** - Add placement case |

| `client/src/components/ExternalContainerUI.tsx` | **MODIFY** - Add repair UI |

| `client/src/utils/quickMoveUtils.ts` | **MODIFY** - Add repair bench reducers |

## Files NOT Needed (Already Handled by WoodenStorageBox)

| File | Reason |

|------|--------|

| `useSpacetimeTables.ts` | Already subscribes to WoodenStorageBox |

| `useEntityFiltering.ts` | Already filters WoodenStorageBox |

| `useInteractionFinder.ts` | Already finds WoodenStorageBox |

| `GameScreen.tsx` | Already passes WoodenStorageBox data |

| `App.tsx` | Already wires WoodenStorageBox |

| `clientCollision.ts` | Already handles WoodenStorageBox collision |

| `renderingUtils.ts` | Already renders WoodenStorageBox in Y-sort |

| `entityVisualConfig.ts` | WoodenStorageBox already has config |

| `repairBenchRenderingUtils.ts` | Not needed - use switch in woodenStorageBoxRenderingUtils |

---

## Implementation Details

### Material Consumption

- Unlike structure repair (which only uses Wood/Stone/Metal), item repair must consume **ALL** materials from the item's crafting_cost
- Use a general material consumption function that handles any `CostIngredient` list
- Check player inventory/hotbar for all required materials before consuming

### Durability Restoration Logic

- When repairing: `current_durability = new_max_durability` (restores to full at new max)
- Example: Item at 30/100 durability, after first repair → 75/75 durability

### Error Messages

- "Item cannot be repaired - it doesn't have a durability system"
- "Item is too degraded to repair (3/3 repairs used)"
- "Insufficient materials: Need 5 Wood, 2 Stone (have 3 Wood, 2 Stone)"
- "No item in repair bench slot"
- "Only damaged items can be placed in the repair bench"

### Slot Count Handling

The existing `WoodenStorageBox::num_slots()` method likely uses a match on `box_type`. Update it to return `1` for `BOX_TYPE_REPAIR_BENCH`:

```rust
pub fn num_slots(&self) -> usize {
    match self.box_type {
        BOX_TYPE_REPAIR_BENCH => NUM_REPAIR_BENCH_SLOTS, // 1
        BOX_TYPE_LARGE => NUM_LARGE_BOX_SLOTS,           // 48
        BOX_TYPE_REFRIGERATOR => NUM_REFRIGERATOR_SLOTS, // 30
        BOX_TYPE_COMPOST => NUM_COMPOST_SLOTS,           // 20
        BOX_TYPE_BACKPACK => NUM_BACKPACK_SLOTS,         // 35
        _ => NUM_BOX_SLOTS,                               // 18
    }
}
```

### Container Type in UI

The client's `ExternalContainerUI` needs to detect repair bench by checking BOTH:

1. `container.containerType === 'wooden_storage_box'`
2. `(container.containerEntity as WoodenStorageBox).boxType === 5`

This allows showing repair-specific UI (1 slot + repair button) while using the same container infrastructure.