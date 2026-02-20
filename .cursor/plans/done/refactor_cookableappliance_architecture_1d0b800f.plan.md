---
name: Refactor CookableAppliance Architecture
overview: Refactor `CookableAppliance` to inherit from `ItemContainer`, eliminating duplicate method signatures that cause Rust E0034 trait ambiguity errors. This will simplify all cooking container implementations (Campfire, Furnace, Barbecue) and make adding new cooking containers straightforward.
todos:
  - id: update-cooking-trait
    content: Modify CookableAppliance trait in cooking.rs to extend ItemContainer and remove duplicate methods
    status: completed
  - id: update-cooking-functions
    content: Update process_appliance_cooking_tick and related functions to use ItemContainer method names
    status: completed
  - id: simplify-campfire
    content: Simplify Campfire's CookableAppliance impl - remove delegation methods
    status: completed
  - id: simplify-furnace
    content: Simplify Furnace's CookableAppliance impl - remove delegation methods
    status: completed
  - id: simplify-barbecue
    content: Simplify Barbecue's CookableAppliance impl - remove delegation methods
    status: completed
  - id: clean-reducers
    content: Remove fully-qualified syntax from move_item_within_* reducers in all three files
    status: completed
  - id: build-test
    content: Build, publish, regenerate bindings, and test all cooking containers
    status: completed
---

# Refactor CookableAppliance to Inherit from ItemContainer

## Problem

The `CookableAppliance` trait duplicates methods from `ItemContainer` (`get_slot_instance_id`, `get_slot_def_id`, `set_slot`), causing Rust E0034 "multiple applicable items in scope" errors when both traits are used together.

## Solution

Make `CookableAppliance` extend `ItemContainer` via trait inheritance, removing the duplicate method signatures.

---

## Server-Side Changes

### 1. Update `cooking.rs` - Remove Duplicate Methods

```rust
// BEFORE (current)
pub trait CookableAppliance {
    fn num_processing_slots(&self) -> usize;
    fn get_slot_instance_id(&self, slot_index: u8) -> Option<u64>;  // DUPLICATE
    fn get_slot_def_id(&self, slot_index: u8) -> Option<u64>;       // DUPLICATE
    fn set_slot(&mut self, ...);                                    // DUPLICATE
    fn get_slot_cooking_progress(&self, ...) -> Option<CookingProgress>;
    fn set_slot_cooking_progress(&mut self, ...);
    fn get_appliance_entity_id(&self) -> u64;
    fn get_appliance_world_position(&self) -> (f32, f32);
    fn get_appliance_container_type(&self) -> ContainerType;
}

// AFTER (refactored)
pub trait CookableAppliance: ItemContainer {
    // Cooking-specific methods ONLY:
    fn get_slot_cooking_progress(&self, slot_index: u8) -> Option<CookingProgress>;
    fn set_slot_cooking_progress(&mut self, slot_index: u8, progress: Option<CookingProgress>);
    fn get_appliance_world_position(&self) -> (f32, f32);
}
```

Key changes:

- Add `: ItemContainer` supertrait bound
- Remove `num_processing_slots` (use `num_slots()` from ItemContainer)
- Remove `get_slot_instance_id`, `get_slot_def_id`, `set_slot` (inherited)
- Remove `get_appliance_entity_id` (use `get_container_id()` from ItemContainer)
- Remove `get_appliance_container_type` (use `get_container_type()` from ItemContainer)

### 2. Update `process_appliance_cooking_tick` in `cooking.rs`

Update all method calls to use ItemContainer methods:

- `appliance.num_processing_slots()` -> `appliance.num_slots()`
- `appliance.get_appliance_entity_id()` -> `appliance.get_container_id()`
- `appliance.get_appliance_container_type()` -> `appliance.get_container_type()`

### 3. Simplify `campfire.rs` CookableAppliance Implementation

Remove the delegation methods, keep only cooking-specific:

```rust
impl CookableAppliance for Campfire {
    fn get_slot_cooking_progress(&self, slot_index: u8) -> Option<CookingProgress> {
        match slot_index {
            0 => self.slot_0_cooking_progress.clone(),
            // ... slots 1-4
            _ => None,
        }
    }
    
    fn set_slot_cooking_progress(&mut self, slot_index: u8, progress: Option<CookingProgress>) {
        match slot_index {
            0 => self.slot_0_cooking_progress = progress,
            // ... slots 1-4
            _ => {}
        }
    }
    
    fn get_appliance_world_position(&self) -> (f32, f32) {
        (self.pos_x, self.pos_y)
    }
}
```

### 4. Simplify `furnace.rs` CookableAppliance Implementation

Same pattern as campfire - remove delegation methods.

### 5. Simplify `barbecue.rs` CookableAppliance Implementation

Same pattern - remove delegation methods, keep only cooking-specific.

### 6. Update `move_item_within_*` Reducers

Remove the explicit `use crate::cooking::CookableAppliance;` and `use crate::inventory_management::ItemContainer;` imports and fully-qualified syntax since there's no longer ambiguity:

```rust
// BEFORE (current workaround)
let source_had_item = ItemContainer::get_slot_instance_id(&campfire, source_slot_index).is_some();
let progress = CookableAppliance::get_slot_cooking_progress(&campfire, slot);

// AFTER (clean)
let source_had_item = campfire.get_slot_instance_id(source_slot_index).is_some();
let progress = campfire.get_slot_cooking_progress(slot);
```

Files: `campfire.rs`, `furnace.rs`, `barbecue.rs`

---

## Client-Side Changes (Verification Only)

The client code is already well-structured:

### containerUtils.ts

- Barbecue already configured with correct slot count (12) and field prefix (`slotInstanceId`)
- Already in `isFuelContainer()` check
- No changes needed

### ExternalContainerUI.tsx  

- Already imports and passes `barbecues` prop
- Uses `useContainer` hook which handles barbecue
- No changes needed

---

## Testing

1. Build server: `spacetime build --project-path ./server`
2. Publish: `spacetime publish --project-path ./server broth-bullets-local`
3. Generate bindings: `spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server`
4. Test all three cooking containers:

   - Place items in campfire/furnace/barbecue
   - Move items within each container
   - Verify cooking progress displays and transfers correctly
   - Verify toggle burning works