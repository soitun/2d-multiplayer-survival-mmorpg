---
name: Alpine Animals Implementation
overview: "Create three new alpine biome animals: Polar Bear (aggressive predator like wolf), Hare (fleeing prey like vole), and Snowy Owl (aggressive flying bird). Each will have skull trophy items and drop standard animal resources (leather, bones, fat) when harvested."
todos:
  - id: polar-bear-behavior
    content: Create polar_bear.rs with PolarBearBehavior implementing AnimalBehavior trait (wolf-like aggression, high stats)
    status: completed
  - id: hare-behavior
    content: Create hare.rs with HareBehavior implementing AnimalBehavior trait (vole-like flee/burrow)
    status: completed
  - id: snowy-owl-behavior
    content: Create snowy_owl.rs with SnowyOwlBehavior implementing AnimalBehavior trait (flying + 200px aggression range)
    status: completed
  - id: register-species
    content: Add PolarBear, Hare, SnowyOwl to AnimalSpecies enum and AnimalBehaviorEnum in core.rs
    status: completed
  - id: register-modules
    content: Add module declarations to mod.rs
    status: completed
  - id: alpine-spawning
    content: Add alpine biome spawning rules in environment.rs and respawn weights
    status: completed
  - id: corpse-loot
    content: Configure loot drops and meat types in animal_corpse.rs
    status: completed
  - id: skull-items
    content: Add Polar Bear Skull, Hare Skull, Owl Skull items in weapons.rs
    status: completed
  - id: skull-drops
    content: Add skull drop configuration in combat.rs and bones.rs
    status: completed
  - id: client-rendering
    content: Add sprite configs, sheet mappings, and render props in wildAnimalRenderingUtils.ts
    status: completed
  - id: client-collision
    content: Add collision bounds in animalCollisionUtils.ts
    status: completed
isProject: false
---

# Alpine Animals Implementation Plan

## Overview

Add three new animals that spawn exclusively in the alpine biome:

- **Polar Bear**: Large aggressive predator (wolf-like behavior, high health/damage)
- **Hare**: Small fleeing prey (vole-like behavior, burrows/flees)
- **Snowy Owl**: Aggressive flying bird (crow/tern flight mechanics, attacks within 200px)

---

## Server-Side Implementation

### 1. Add to AnimalSpecies Enum

In `[server/src/wild_animal_npc/core.rs](server/src/wild_animal_npc/core.rs)`, add to the `AnimalSpecies` enum (around line 193):

```rust
pub enum AnimalSpecies {
    // ... existing ...
    PolarBear,   // Alpine apex predator
    Hare,        // Alpine fleeing prey  
    SnowyOwl,    // Alpine aggressive flying predator
}
```

### 2. Create Behavior Module Files

**a) Polar Bear** - Create `[server/src/wild_animal_npc/polar_bear.rs](server/src/wild_animal_npc/polar_bear.rs)`

- Based on wolf pattern but larger and more dangerous
- Stats: ~300 HP, 35 damage, 800 perception, 500 sprint speed
- No pack behavior (solitary hunter)
- Always fights (never flees)

**b) Hare** - Create `[server/src/wild_animal_npc/hare.rs](server/src/wild_animal_npc/hare.rs)`

- Based on vole pattern
- Stats: ~40 HP, fast movement (160 patrol, 320 sprint)
- Flee/burrow behavior when threatened
- 8-second burrow duration

**c) Snowy Owl** - Create `[server/src/wild_animal_npc/snowy_owl.rs](server/src/wild_animal_npc/snowy_owl.rs)`

- Based on crow/tern flying mechanics
- Stats: ~70 HP, 10 damage, 200px aggression range
- No stealing/scavenging (unlike crow/tern)
- Aggressive: attacks players within 200px, chases while flying
- Uses `is_flying = true` during chase/attack

### 3. Register Modules

In `[server/src/wild_animal_npc/mod.rs](server/src/wild_animal_npc/mod.rs)`, add:

```rust
pub mod polar_bear;
pub mod hare;
pub mod snowy_owl;
```

### 4. Add to Behavior Enum and Dispatch

In `[server/src/wild_animal_npc/core.rs](server/src/wild_animal_npc/core.rs)`:

- Add variants to `AnimalBehaviorEnum` (line ~421)
- Add match arms to `get_behavior()` (line ~702)
- Add `SnowyOwl` to `is_flying_species()` function
- Add match arms in all trait method delegations

### 5. Alpine Biome Spawning

In `[server/src/environment.rs](server/src/environment.rs)`, add to `is_wild_animal_location_suitable()` (line ~941):

```rust
AnimalSpecies::PolarBear | AnimalSpecies::Hare | AnimalSpecies::SnowyOwl => {
    // Alpine-only spawning
    matches!(tile_type, TileType::Alpine)
}
```

Add to species weights in initial seeding (line ~3451) and in `[server/src/wild_animal_npc/respawn.rs](server/src/wild_animal_npc/respawn.rs)`:

- PolarBear: 3% (rare apex predator)
- Hare: 10% (common prey)
- SnowyOwl: 5% (uncommon)

### 6. Corpse and Loot Configuration

In `[server/src/wild_animal_npc/animal_corpse.rs](server/src/wild_animal_npc/animal_corpse.rs)`:

**Loot chances** (`get_animal_loot_chances`):

- PolarBear: `(0.80, 0.0, 0.70, 0.90)` - High fat, no special fur, good bone, excellent meat
- Hare: `(0.15, 0.0, 0.20, 0.85)` - Low fat, no cloth, some bone, good meat
- SnowyOwl: `(0.10, 0.0, 0.15, 0.50)` - Low fat, no cloth, low bone, some meat

**Meat types** (`get_meat_type`):

- PolarBear: `"Raw Bear Meat"`
- Hare: `"Raw Hare Meat"`  
- SnowyOwl: `"Raw Owl Meat"`

**No cloth drops** - User specified "no special furs", so cloth_type returns `None` for all three.

### 7. Skull Trophy Items

In `[server/src/items_database/weapons.rs](server/src/items_database/weapons.rs)`, add skull weapons:

```rust
// Polar Bear Skull - Massive apex predator trophy
ItemBuilder::new("Polar Bear Skull", "A massive polar bear skull...", ItemCategory::Weapon)
    .icon("polar_bear_skull.png")
    .stackable(10)
    .weapon(42, 42, 2.5) // Very high damage, very slow
    .damage_type(DamageType::Blunt)
    .build(),

// Hare Skull - Small prey trophy
ItemBuilder::new("Hare Skull", "A small hare skull...", ItemCategory::Weapon)
    .icon("hare_skull.png")
    .stackable(20)
    .weapon(10, 12, 1.4) // Weak but fast
    .damage_type(DamageType::Blunt)
    .build(),

// Owl Skull - Silent hunter trophy
ItemBuilder::new("Owl Skull", "An owl skull...", ItemCategory::Weapon)
    .icon("owl_skull.png")
    .stackable(15)
    .weapon(22, 24, 1.7) // Moderate damage
    .damage_type(DamageType::Blunt)
    .build(),
```

### 8. Skull Drop Configuration

In `[server/src/combat.rs](server/src/combat.rs)`, add to skull_type match (line ~4691):

```rust
crate::wild_animal_npc::AnimalSpecies::PolarBear => Some("Polar Bear Skull"),
crate::wild_animal_npc::AnimalSpecies::Hare => Some("Hare Skull"),
crate::wild_animal_npc::AnimalSpecies::SnowyOwl => Some("Owl Skull"),
```

### 9. Skull Crushing Support

In `[server/src/bones.rs](server/src/bones.rs)`:

- Add skull names to `crush_bone_item()` validation
- Add fragment amounts: PolarBear=30, Hare=6, Owl=10

---

## Client-Side Implementation

### 10. Sprite Configuration

In `[client/src/utils/renderers/wildAnimalRenderingUtils.ts](client/src/utils/renderers/wildAnimalRenderingUtils.ts)`:

**Import placeholder sprites** (will use _release.png format):

```typescript
import polarBearWalkingAnimatedSheet from '../../assets/polar_bear_walking_release.png';
import hareWalkingAnimatedSheet from '../../assets/hare_walking_release.png';
import snowyOwlWalkingAnimatedSheet from '../../assets/snowy_owl_walking_release.png';
import snowyOwlFlyingAnimatedSheet from '../../assets/snowy_owl_flying_release.png';
```

**Add to `ANIMATED_SPRITE_CONFIGS**` (4x4 layout: 80x80 frames, 320x320 sheet):

```typescript
'PolarBear': { sheetWidth: 320, sheetHeight: 320, frameWidth: 80, frameHeight: 80, cols: 4, rows: 4 },
'Hare': { sheetWidth: 320, sheetHeight: 320, frameWidth: 80, frameHeight: 80, cols: 4, rows: 4 },
'SnowyOwl': { sheetWidth: 320, sheetHeight: 320, frameWidth: 80, frameHeight: 80, cols: 4, rows: 4 },
```

**Add to `speciesSpriteSheets**`:

```typescript
'PolarBear': polarBearWalkingAnimatedSheet,
'Hare': hareWalkingAnimatedSheet,
'SnowyOwl': snowyOwlWalkingAnimatedSheet,
```

**Add to `speciesFlyingSpriteSheets**` (for owl flight):

```typescript
'SnowyOwl': snowyOwlFlyingAnimatedSheet,
```

**Add to `getSpeciesRenderingProps**`:

- PolarBear: `{ width: 160, height: 160, shadowRadius: 48 }` (large)
- Hare: `{ width: 80, height: 80, shadowRadius: 20 }` (small)
- SnowyOwl: `{ width: 96, height: 96, shadowRadius: 28 }` (medium bird)

### 11. Collision Bounds

In `[client/src/utils/animalCollisionUtils.ts](client/src/utils/animalCollisionUtils.ts)`, add:

```typescript
PolarBear: { width: 72, height: 56 },
Hare: { width: 24, height: 20 },
SnowyOwl: { width: 32, height: 28 },
```

---

## Snowy Owl Aggression Logic (Key Detail)

The owl's unique behavior in `snowy_owl.rs`:

```rust
fn update_ai_state_logic(...) {
    // Detection: If player within 200px, become aggressive
    if let Some(player) = detected_player {
        let dist = calculate_distance(animal, player);
        if dist < 200.0 {
            animal.is_flying = true;
            animal.state = AnimalState::Chasing;
            animal.target_player_id = Some(player.identity);
        }
    }
    // Chase: Fly toward target, attack when in range
    // Unlike crow/tern: No stealing, no scavenging, pure combat
}

fn should_chase_player(...) -> bool {
    // Only chase if player is within 200px
    let dist = /* calculate distance */;
    dist < 200.0
}
```

---

## Files Summary


| File                                                     | Action |
| -------------------------------------------------------- | ------ |
| `server/src/wild_animal_npc/polar_bear.rs`               | Create |
| `server/src/wild_animal_npc/hare.rs`                     | Create |
| `server/src/wild_animal_npc/snowy_owl.rs`                | Create |
| `server/src/wild_animal_npc/mod.rs`                      | Modify |
| `server/src/wild_animal_npc/core.rs`                     | Modify |
| `server/src/wild_animal_npc/animal_corpse.rs`            | Modify |
| `server/src/environment.rs`                              | Modify |
| `server/src/wild_animal_npc/respawn.rs`                  | Modify |
| `server/src/items_database/weapons.rs`                   | Modify |
| `server/src/combat.rs`                                   | Modify |
| `server/src/bones.rs`                                    | Modify |
| `client/src/utils/renderers/wildAnimalRenderingUtils.ts` | Modify |
| `client/src/utils/animalCollisionUtils.ts`               | Modify |


---

## Asset Placeholders

The implementation will reference these sprite files (create placeholders or wait for artist):

- `polar_bear_walking_release.png` (320x320, 4x4 grid)
- `hare_walking_release.png` (320x320, 4x4 grid)
- `snowy_owl_walking_release.png` (320x320, 4x4 grid)
- `snowy_owl_flying_release.png` (320x320, 4x4 grid)
- `polar_bear_skull.png` (icon)
- `hare_skull.png` (icon)
- `owl_skull.png` (icon)

