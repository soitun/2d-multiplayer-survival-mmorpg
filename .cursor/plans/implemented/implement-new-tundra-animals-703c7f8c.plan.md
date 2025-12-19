<!-- 703c7f8c-26ca-42a2-accd-75f803153985 07cc446e-8d0d-4006-b312-c30ffc053165 -->
# Implement New Tundra Animals

## Overview

Add four new animal species to the tundra island biome with unique behaviors:

- **Orca Whale**: Offshore water predator with pod behavior and breaching attacks
- **Tern**: Scavenger bird that picks up dropped items and alerts other animals
- **Crow**: Thief bird that steals items and follows players with food
- **Wolverine**: Extremely persistent predator that caches food items

## Implementation Steps

### 1. Core System Updates

#### 1.1 Add New Species to Enum

- Update `AnimalSpecies` enum in `server/src/wild_animal_npc/core.rs`:
- Add `OrcaWhale`, `Tern`, `Crow`, `Wolverine`
- Update `AnimalBehaviorEnum` to include new behavior types
- Update `get_behavior()` method to return new behaviors

#### 1.2 Add Flying System in Core (Reusable for All Birds)

- Add `Flying` state to `AnimalState` enum in `core.rs`
- **CRITICAL**: Implement reusable flying movement system in `core.rs`:
- `execute_flying_patrol()`: Birds patrol by flying vast distances around island
- `execute_ground_idle()`: When on ground, birds either stay still OR walk in very small circles
- `execute_flying_chase()`: Aggressively fly-chase players for food/items
- Flying allows movement over water tiles and obstacles
- System designed to be reusable for future bird types (not species-specific)

#### 1.3 Water Spawning System for Orcas

- Modify `is_wild_animal_location_suitable()` in `server/src/environment.rs`:
- Add special case for `OrcaWhale` to spawn on `TileType::Sea` tiles
- Ensure orcas spawn far from shore (offshore only)
- Update `validate_animal_spawn_position()` in `server/src/animal_collision.rs`:
- Allow orcas to spawn on water tiles
- Modify collision system to allow orcas to move freely in water

### 2. Orca Whale Implementation

#### 2.1 Create Behavior File

- Create `server/src/wild_animal_npc/orca.rs`
- Implement `OrcaWhaleBehavior` struct with:
- High health (500-600), strong attacks (40-50 damage)
- Water-only movement (can't leave water)
- Pod behavior (similar to wolf packs, but in water)
- Breaching attacks: periodic jumps out of water for dramatic attacks

#### 2.2 Pod Behavior

- Reuse pack system from wolves but adapt for water:
- Orcas form pods when near each other
- Alpha orca leads pod movement
- Pod members coordinate attacks

#### 2.3 Breaching Attack System

- Add `breach_cooldown` field to `WildAnimal` table
- Implement breaching logic:
- Periodic chance to breach (jump out of water)
- Breaching increases attack range temporarily
- Visual effect for breaching animation

#### 2.4 Water-Only Combat

- Modify `should_chase_player()` to only return true if:
- Player is in water tile OR
- Player is within 2 tiles of water (near shore)
- Update attack logic to prevent orcas from attacking players far from water

### 3. Tern Implementation

#### 3.1 Create Behavior File

- Create `server/src/wild_animal_npc/tern.rs`
- Implement `TernBehavior` struct with:
- Low health (80-100), weak attacks (5-8 damage)
- Scavenger behavior (picks up dropped items)
- Alert system (warns other animals of player presence)
- **Patrol**: Uses core flying system to patrol vast distances around island
- **Aggressive**: Aggressively flies to chase players for food

#### 3.2 Scavenging System (Dropped Items Only)

- Add `scavenging_item_id` field to `WildAnimal` table (optional)
- **TERN BEHAVIOR**: Terns ONLY scavenge dropped items from the world (not from player inventory)
- Implement scavenging logic:
- Check for nearby dropped items periodically
- Move toward and "pick up" dropped items (store item ID)
- Can take at least 1 item of any type (not food-specific)
- Drop item when tern is killed (add to loot table)
- Create helper function `find_nearby_dropped_items()` to scan for items
- Terns do NOT steal from player inventory - only pick up items already dropped in world

#### 3.3 Alert System

- When tern detects player, emit alert sound
- Other animals within range become more alert/aggressive
- Add `alert_other_animals()` helper function

#### 3.4 Flying Mechanics (Uses Core System)

- Use core flying system from `core.rs`:
- **Patrolling**: Fly vast distances around island (use `execute_flying_patrol()`)
- **Ground**: Stay still or walk in very small circles when on ground (use `execute_ground_idle()`)
- **Chasing**: Aggressively fly-chase players for food (use `execute_flying_chase()`)
- **Alerting**: Fly to alert other animals, then return to patrol

### 4. Crow Implementation

#### 4.1 Create Behavior File

- Create `server/src/wild_animal_npc/crow.rs`
- Implement `CrowBehavior` struct with:
- Low health (60-80), very weak attacks (3-5 damage)
- Item stealing behavior
- Food following behavior
- **Patrol**: Uses core flying system to patrol vast distances around island
- **Aggressive**: Aggressively flies to chase players for food/items

#### 4.2 Item Stealing System (Player Inventory)

- Add `stolen_item_id` field to `WildAnimal` table (optional)
- **CROW BEHAVIOR**: Crows steal directly from player inventory (not dropped items)
- Implement stealing logic:
- Detect players with items in inventory
- When close to player, can steal at least 1 item of any type
- Small chance to steal random item when close to player
- Stolen item removed from player inventory and stored in crow's data
- Drop stolen items when crow is killed
- Create `attempt_steal_from_player()` helper function
- Crows can steal any item type (not just food) - they're opportunistic thieves

#### 4.3 Food Following Behavior

- Detect players carrying food items (check inventory for food category)
- Follow players with food at safe distance
- Increase follow distance if player attacks

#### 4.4 Flying Mechanics (Uses Core System)

- Use core flying system from `core.rs`:
- **Patrolling**: Fly vast distances around island (use `execute_flying_patrol()`)
- **Ground**: Stay still or walk in very small circles when on ground (use `execute_ground_idle()`)
- **Chasing**: Aggressively fly-chase players for food/items (use `execute_flying_chase()`)
- **Stealing**: Fly close to player, steal item, then fly away

### 5. Wolverine Implementation

#### 5.1 Create Behavior File

- Create `server/src/wild_animal_npc/wolverine.rs`
- Implement `WolverineBehavior` struct with:
- High health (250-300), strong attacks (30-35 damage)
- Extreme persistence (chase abandonment multiplier: 5.0-6.0)
- Food caching behavior

#### 5.2 Food Caching System (Player Inventory Theft)

- Add `cached_food_items` field to `WildAnimal` table (store as JSON/string or separate table)
- **WOLVERINE BEHAVIOR**: Wolverines steal directly from player inventory (not dropped items)
- Implement caching logic:
- Detect players with items in inventory
- When close to player, can steal multiple items (2-3 items, more than crows)
- Can steal any item type (not just food) - opportunistic hoarders
- Stolen items removed from player inventory and stored in wolverine's cache
- Store up to 3-5 items total
- When wolverine is killed, drop all cached items
- Create `attempt_steal_from_player()` and `drop_cached_food()` helper functions
- Wolverines are more aggressive thieves than crows - can take multiple items at once

#### 5.3 Extreme Persistence

- Set `chase_abandonment_multiplier` to 5.0-6.0 (vs default 2.5)
- Wolverines chase much longer than other animals
- Add visual indicator when wolverine is in persistent chase mode

### 6. Spawn System Updates

#### 6.1 Update Spawn Weights

- Modify species weights in `server/src/environment.rs`:
- Add new species to weighted distribution
- Orcas: 5% (rare, water-only)
- Terns: 15% (common birds)
- Crows: 10% (common birds)
- Wolverines: 3% (rare predators)

#### 6.2 Update Location Suitability

- Add spawn location checks for each new species:
- Orcas: Sea tiles only, far from shore
- Terns: Beach/Grass tiles (coastal areas)
- Crows: Grass/Dirt tiles (anywhere)
- Wolverines: Grass/Dirt tiles (prefer forested areas)

### 7. Loot System Updates

#### 7.1 Update Loot Tables

- Modify `get_animal_loot_chances()` in `server/src/wild_animal_npc/animal_corpse.rs`:
- Orca: High fat (blubber), good meat, rare orca tooth trophy
- Tern: Low fat, some meat, feathers
- Crow: Low fat, some meat, crow feathers
- Wolverine: Good fat, excellent fur, good meat, cached food items

#### 7.2 Add Cached Food Drops

- When wolverine dies, check `cached_food_items` and drop all items
- When tern/crow dies, drop any scavenged/stolen items

### 8. Client-Side Updates

#### 8.1 Rendering Updates

- Update `client/src/utils/renderers/wildAnimalRenderingUtils.ts`:
- Add sprite mappings for new species
- Add flying animation states for birds
- Add breaching animation for orcas

#### 8.2 Asset Loading

- Update `client/src/hooks/useAssetLoader.ts`:
- Add sprite sheet paths for new animals
- Add sound effect paths

### 9. Sound System Updates

#### 9.1 Add Species Sounds

- Add sound event types for each new species:
- Orca: Breaching sound, pod communication
- Tern: Screech (alert sound), scavenging sound
- Crow: Caw (stealing sound), following sound
- Wolverine: Aggressive growl, caching sound

### 10. Testing & Balancing

#### 10.1 Test Each Species

- Verify spawn locations are correct
- Test unique abilities work as intended
- Balance stats (health, damage, speed)

#### 10.2 Test Interactions

- Test orca water-only combat
- Test bird flying mechanics (patrol vast distances, ground idle, aggressive chase)
- Test item stealing/scavenging
- Test wolverine food caching

## Files to Create

- `server/src/wild_animal_npc/orca.rs`
- `server/src/wild_animal_npc/tern.rs`
- `server/src/wild_animal_npc/crow.rs`
- `server/src/wild_animal_npc/wolverine.rs`

## Files to Modify

- `server/src/wild_animal_npc/core.rs` (add species, states, reusable flying system)
- `server/src/wild_animal_npc/mod.rs` (export new modules)
- `server/src/environment.rs` (spawn logic, location suitability)
- `server/src/animal_collision.rs` (water spawning, flying collision)
- `server/src/wild_animal_npc/animal_corpse.rs` (loot tables)
- `client/src/utils/renderers/wildAnimalRenderingUtils.ts` (rendering)
- `client/src/hooks/useAssetLoader.ts` (assets)

## Technical Considerations

### Water Spawning

- Orcas need special handling to spawn on water tiles
- May need to modify `is_position_on_water()` check for orcas
- Ensure orcas can't spawn too close to shore

### Flying Mechanics (Core System)

- **CRITICAL**: Flying system must be defined in `core.rs` for reusability
- Birds patrol by **flying vast distances** around the island (not ground-based)
- When birds land on ground, they either:
- Stay completely still, OR
- Walk in very small circles (minimal movement)
- Aggressive behavior: Birds aggressively **fly-chase** players for food/items
- Flying allows movement over water tiles and obstacles
- System must be generic enough for future bird types (tern, crow, and others)
- Core functions: `execute_flying_patrol()`, `execute_ground_idle()`, `execute_flying_chase()`

### Item Storage

- Consider using separate table for cached/stolen items vs adding fields to WildAnimal
- Current approach: add optional fields to WildAnimal for simplicity
- Alternative: create `animal_inventory` table for more complex storage

### Pod Behavior

- Reuse existing pack system from wolves
- Adapt for water-based movement
- Ensure pod members stay in water together

### To-dos

- [ ] Add OrcaWhale, Tern, Crow, Wolverine to AnimalSpecies enum and update behavior system
- [ ] Add Flying state and implement reusable flying system in core.rs: execute_flying_patrol(), execute_ground_idle(), execute_flying_chase()
- [ ] Implement water tile spawning system for orcas (offshore sea tiles only)
- [ ] Create orca.rs with pod behavior, breaching attacks, and water-only combat
- [ ] Create tern.rs with scavenging system, alert system, using core flying system for patrol/chase
- [ ] Create crow.rs with item stealing, food following, using core flying system for patrol/chase
- [ ] Create wolverine.rs with food caching system and extreme persistence
- [ ] Update spawn weights and location suitability checks for all new species
- [ ] Add loot chances and cached food drop logic for new species
- [ ] Update client rendering and asset loading for new animal sprites and animations