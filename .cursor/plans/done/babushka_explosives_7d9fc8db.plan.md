---
name: Babushka Explosives
overview: Add two tiers of thematic "Babushka ingenuity" explosives for raiding bases, with costs balanced for 4-6 hours of farming per significant raid.
todos:
  - id: fix-ore-smelting
    content: Add cook_time/cooked_item to Metal Ore and Sulfur Ore definitions
    status: pending
  - id: explosive-items
    content: Create Babushka's Surprise and Matriarch's Wrath item definitions
    status: pending
  - id: placement-system
    content: Create explosive placement reducer with 3-second arming delay
    status: pending
  - id: explosion-damage
    content: Create apply_explosion_damage() for structures AND players (friendly fire)
    status: pending
  - id: detonation-scheduler
    content: Create scheduled reducer for fuse countdown and detonation
    status: pending
  - id: sound-effects
    content: Add explosion sound events and screen shake
    status: pending
  - id: player-damage
    content: Implement friendly fire - explosions damage all players in blast radius
    status: pending
---

# Babushka-Style Raiding Explosives

## Design Philosophy

Improvised explosives that evoke the resourceful, crafty nature of a survival grandmother - using cooking ingredients, animal products, and homemade concoctions. The names and descriptions should feel like "recipes passed down through generations."---

## Resource Economy Analysis

**Current Resource Yields:**

- Sulfur nodes: 250-500 ore per node (~375 avg)
- Metal nodes: 250-500 ore per node (~375 avg)
- Gunpowder recipe: 10 Charcoal + 5 Sulfur = 5 Gunpowder

**Target Farming Time:** 4-6 hours (two 2-hour sessions) for a meaningful raid**Assumption:** ~15-25 sulfur nodes farmable in 4-6 hours = ~5,600-9,400 sulfur oreNote: Currently Sulfur Ore does not have smelting recipe set up in [`materials.rs`](server/src/items_database/materials.rs). May need to add: `.cook_time(15.0).cooked_item("Sulfur")` to Metal Ore and Sulfur Ore definitions.---

## Tier 1: "Babushka's Surprise"

*"A volatile concoction wrapped in old cloth and sealed with rendered fat. My grandmother always said: 'When the wolves come to your door, show them what a proper housewife can do.'"*

**Stats:**
| Property | Value |
|----------|-------|
| Structure Damage | 300 |
| Player Damage | 80 (friendly fire!) |
| Blast Radius | 150 pixels |
| Fuse Time | 8-15 seconds (random - unreliable!) |
| Arming Time | 3 seconds |
| Dud Chance | 20% (must re-light) |

**Recipe (expensive mid-game):**

| Material | Quantity | Source |

|----------|----------|--------|

| Gunpowder | 750 | 750 Charcoal + 375 Sulfur |

| Tallow | 30 | Rendered animal fat |

| Cloth | 25 | Plant fiber processing |

| Animal Fat | 20 | Hunting |

| Rope | 5 | Plant fiber crafting |**Raid Analysis (per wall):**

| Target | HP | Explosives Needed | Gunpowder Cost |

|--------|----|--------------------|----------------|

| Wood Wall | 500 | 2 | 1,500 |

| Stone Wall | 1,500 | 5 | 3,750 |

| Metal Wall | 4,000 | 14 | 10,500 |

| Wood Door | 1,500 | 5 | 3,750 |

| Metal Door | 4,000 | 14 | 10,500 |---

## Tier 2: "Matriarch's Wrath"

*"The old matriarchs of the Aleutian settlements had a saying: 'A grandmother's love can move mountains - her fury can level them.' This is the recipe they never wrote down."*

**Stats:**
| Property | Value |
|----------|-------|
| Structure Damage | 1,000 |
| Player Damage | 150 (friendly fire!) |
| Blast Radius | 200 pixels |
| Fuse Time | 10 seconds (reliable) |
| Arming Time | 3 seconds |
| Dud Chance | 0% |

**Recipe (expensive end-game):**

| Material | Quantity | Source |

|----------|----------|--------|

| Gunpowder | 2,500 | 2,500 Charcoal + 1,250 Sulfur |

| Tallow | 50 | Rendered animal fat (binder) |

| Metal Fragments | 75 | Metal casing |

| Animal Bone | 40 | Structural support/shrapnel |

| Cloth | 40 | Wrapping |

| Rope | 10 | Binding |**Raid Analysis (per wall):**

| Target | HP | Explosives Needed | Gunpowder Cost |

|--------|----|--------------------|----------------|

| Wood Wall | 500 | 1 | 2,500 |

| Stone Wall | 1,500 | 2 | 5,000 |

| Metal Wall | 4,000 | 4 | 10,000 |

| Wood Door | 1,500 | 2 | 5,000 |

| Metal Door | 4,000 | 4 | 10,000 |---

## Farming Time Estimates

**For a Stone Wall Raid (breach 1-2 walls):**

- Via Tier 1: 5-10 explosives = 3,750-7,500 gunpowder = ~10-20 sulfur nodes = **3-6 hours**
- Via Tier 2: 2-4 explosives = 5,000-10,000 gunpowder = ~14-27 sulfur nodes = **4-8 hours**

**For a Metal Wall Raid (end-game):**

- Via Tier 1: 14 explosives = 10,500 gunpowder = ~28 sulfur nodes = **8-10 hours**
- Via Tier 2: 4 explosives = 10,000 gunpowder = ~27 sulfur nodes = **8-10 hours**

---

## Gameplay Mechanics

### Placement & Arming Delay
When a player places an explosive:
1. Player initiates placement (like campfire)
2. **3-second arming animation** - player is vulnerable, cannot cancel
3. Explosive entity spawns with `armed_at` timestamp
4. Fuse countdown begins after arming completes

This creates risk for the raider - defenders can interrupt during the arming phase.

### Friendly Fire (Confirmed)
Explosions damage ALL players within blast radius:
- **Blast Radius:** 150 pixels (Tier 1), 200 pixels (Tier 2)
- **Player Damage:** 80 damage (Tier 1), 150 damage (Tier 2)
- Includes the player who placed the explosive!
- Creates tactical decisions about timing and positioning

### Dud Mechanic (Tier 1 Only)
- 20% chance Babushka's Surprise is a dud
- Dud explosives remain as entities that can be re-lit (interact with E)
- Each re-light attempt has another 20% dud chance
- Duds cannot be picked back up (committed resource)

---

## Implementation Tasks

### 1. Add Missing Smelting Recipes
Add `cook_time` and `cooked_item` to Metal Ore and Sulfur Ore in [`materials.rs`](server/src/items_database/materials.rs):
- Metal Ore: `.cook_time(20.0).cooked_item("Metal Fragments")`
- Sulfur Ore: `.cook_time(15.0).cooked_item("Sulfur")`

### 2. Create Explosive Item Definitions
Add new explosive items in [`placeables.rs`](server/src/items_database/placeables.rs) with crafting recipes.

### 3. Create Placed Explosive Entity & Table
New `PlacedExplosive` table in `server/src/explosive.rs`:
- `id`, `pos_x`, `pos_y`, `explosive_type`
- `placed_by`, `placed_at`
- `armed_at` (timestamp when arming completes)
- `fuse_duration_secs`, `is_dud`
- `blast_radius`, `structure_damage`, `player_damage`

### 4. Create Placement Reducer
`place_explosive(ctx, explosive_item_def_id, pos_x, pos_y)`:
- Validates player has item in inventory
- Consumes item
- Creates PlacedExplosive entity with 3-second arming delay
- Schedules detonation check

### 5. Create Explosion Damage System
New function `apply_explosion_damage()` that:
- Bypasses melee damage reduction (explosive damage type)
- Damages walls, doors, foundations in blast radius
- Damages placeables (furnaces, boxes, etc.)
- Damages ALL players in blast radius (friendly fire!)
- Handles dud chance for Tier 1

### 6. Add Sound/Visual Effects
- Explosion sound event (loud, audible from far away)
- Screen shake for nearby players
- Arming sound (ticking/hissing during 3-second delay)
- Dud sound (fizzle) for failed detonations