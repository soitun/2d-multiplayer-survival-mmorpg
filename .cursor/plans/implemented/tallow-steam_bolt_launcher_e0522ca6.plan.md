---
name: Turret System (Tallow Steam)
overview: Implement extensible turret system with Tallow Steam Turret as first type. Turrets auto-target hostile NPCs (night apparitions) and players when global PvP enabled. Tallow turrets shoot superheated tallow globs - the fuel IS the projectile.
todos:
  - id: server-table
    content: Create server/src/turret.rs with Turret table (turret_type field), constants, ItemContainer impl, scheduled processing
    status: pending
  - id: server-targeting
    content: "Implement targeting logic: hostile NPCs only (not wild animals), players only if global PvP enabled"
    status: pending
  - id: server-firing
    content: "Implement firing logic: create Projectile entities (tallow globs), consume 1 Tallow per shot"
    status: pending
  - id: server-projectile
    content: "Add source_type field to Projectile table, update fire_projectile and collision handling"
    status: pending
  - id: server-fire-patch
    content: "Update fire_patch.rs to damage hostile NPCs and PvP-enabled players, add fire patch creation on tallow hit"
    status: pending
  - id: server-reducers
    content: Add placement, ammo management, pickup, and interaction reducers (no toggle - always active when loaded)
    status: pending
  - id: server-item-def
    content: Add item definition in placeables.rs for Tallow Steam Turret
    status: pending
  - id: server-lib
    content: Register turret module in lib.rs
    status: pending
  - id: client-bindings
    content: Generate TypeScript bindings after server publish
    status: pending
  - id: client-subscription
    content: Add turrets state and handlers in useSpacetimeTables.ts
    status: pending
  - id: client-dataflow
    content: Thread turrets through App.tsx -> GameScreen.tsx -> GameCanvas.tsx
    status: pending
  - id: client-rendering
    content: Create turretRenderingUtils.ts with sprite rendering and target indicator
    status: pending
  - id: client-projectile-render
    content: Update projectileRenderingUtils.ts to render tallow globs for source_type=1 projectiles
    status: pending
  - id: client-placement
    content: Add placement preview and reducer call in placementRenderingUtils.ts and usePlacementManager.ts
    status: pending
  - id: client-filtering
    content: Add to useEntityFiltering.ts and useInteractionFinder.ts
    status: pending
  - id: client-visual-config
    content: Add turret entry to entityVisualConfig.ts for blue box and E label
    status: pending
  - id: client-icon-utils
    content: Add turret_tallow.png import and mapping in itemIconUtils.ts
    status: pending
  - id: client-container-ui
    content: Add turret support to ExternalContainerUI.tsx for loading Tallow ammo
    status: pending
---

# Turret System Implementation

## Overview

An extensible turret system for automated base defense. The first turret type is the **Tallow Steam Turret** which shoots superheated tallow globs at enemies - the fuel IS the projectile.

**Tallow Steam Turret**: Heats and launches molten tallow at hostile NPCs (night apparitions) and optionally enemy players when global PvP is enabled. Each shot consumes 1 Tallow directly from the loaded stack. Hits have a 25% chance to create a fire patch at the impact location.

**Targeting Behavior:**
- Turrets ALWAYS target hostile NPCs (Shorebound, Shardkin, DrownedWatch) - NOT regular wild animals
- Turrets target enemy players ONLY when:
  1. Global PvP is enabled (`world_state.pvp_enabled`)
  2. Target player is not the turret owner
  3. (Future: per-player PvP flag check when implemented)
- This allows turrets to be used for base defense against both PvE threats and PvP raiders

## Architecture Decision

**Separate extensible table** (not extending Lantern) because turrets have fundamentally different behavior:

- Active targeting AI vs passive protection zones
- Creates projectiles vs burns fuel for effects
- Needs targeting fields, fire rate, ammo tracking
- **Extensible via `turret_type` field** - like how Lantern uses `lantern_type` for wards

## Key Design Decisions

- **Table**: `Turret` with `turret_type` field for different turret variants
- **Ammo (Tallow Steam)**: 1 Tallow = 1 shot (fuel IS the projectile - superheated tallow glob)
- **Targeting Priority**: Hostile NPCs first (Shorebound, Shardkin, DrownedWatch), then players if PvP enabled
- **PvP Targeting**: Only when global PvP is enabled (future: per-player flags)
- **Fire Rate**: Every 4 seconds (15 Tallow/min at constant fire - economical)
- **Range**: 400px detection radius
- **Damage**: ~15 per hit (tunable)
- **Fire Patch Chance**: Tallow turret has chance (~25%) to create fire patch on hit location
- **Damage Attribution**: Turret kills credit the turret owner
- **Raidable**: Turrets can be destroyed when global PvP is enabled
- **Visual State**: Single sprite (no active/inactive states) - `turret_tallow.png`

### Turret Types (extensible)
- `TURRET_TYPE_TALLOW_STEAM = 0` - Shoots heated tallow (implemented now)
- Future: Ballista (uses bolt ammo), Rock Launcher (uses stone), etc.

## Dependencies

- **Global PvP Flag** - Uses existing `world_state.pvp_enabled` for player targeting
- **Future Enhancement**: When per-player PvP flags are implemented ([pvp_flag_system_a127a15a.plan.md](pvp_flag_system_a127a15a.plan.md)), turrets will be updated to respect individual player PvP status

---

## Server Implementation

### 1. New Table: `turret` in [`server/src/turret.rs`](server/src/turret.rs) (new file)

```rust
pub struct Turret {
    id: u32,                          // Primary key, auto_inc
    turret_type: u8,                  // Type of turret (0 = Tallow Steam, future: ballista, etc.)
    pos_x: f32,
    pos_y: f32,
    chunk_index: u32,                 // Spatial index
    placed_by: Identity,
    placed_at: Timestamp,
    // No is_active field - turret is always active when loaded with ammo
    ammo_instance_id: Option<u64>,    // Ammo item in slot (Tallow for steam turret)
    ammo_def_id: Option<u64>,
    last_fire_time: Option<Timestamp>,
    current_target_id: Option<u64>,   // WildAnimal ID being targeted
    current_target_player: Option<Identity>, // Player being targeted (PvP)
    health: f32,
    max_health: f32,
    is_destroyed: bool,
    destroyed_at: Option<Timestamp>,
    last_hit_time: Option<Timestamp>,
}
```

Key constants:

```rust
// Turret types
pub const TURRET_TYPE_TALLOW_STEAM: u8 = 0;
// Future: TURRET_TYPE_BALLISTA, TURRET_TYPE_ROCK_LAUNCHER, etc.

// Tallow Steam Turret stats
pub const TURRET_RANGE: f32 = 400.0;
pub const TURRET_FIRE_INTERVAL_MS: u64 = 4000;  // 4 seconds (15 shots/min)
pub const TALLOW_PROJECTILE_DAMAGE: f32 = 15.0;
pub const TALLOW_PROJECTILE_SPEED: f32 = 600.0; // Slower than arrows (molten glob)
pub const TURRET_INITIAL_HEALTH: f32 = 500.0;
pub const TURRET_MAX_HEALTH: f32 = 500.0;
```

**PvP Raiding:**
Turrets are damageable structures. A `damage_turret()` function is needed in `combat.rs` that:
1. Checks if global PvP is enabled
2. If PvP enabled, allows damage; otherwise blocks it
3. On destruction, drops the turret item and any loaded ammo (Tallow)

### 2. Scheduled Processing Table

```rust
pub struct TurretProcessingSchedule {
    turret_id: u64,
    scheduled_at: ScheduleAt,
}
```

Runs every 500ms to:

1. Find nearest valid target in range
2. Fire if cooldown elapsed and has ammo
3. Create projectile entity aimed at target (tallow glob for steam turret)
4. Decrement ammo stack quantity by 1

### 3. Targeting Logic (in processing reducer)

```rust
fn find_target(ctx: &ReducerContext, turret: &Turret, current_time: Timestamp) -> Option<TargetInfo> {
    let turret_range_sq = TURRET_RANGE * TURRET_RANGE;
    
    // Priority 1: Hostile NPCs (always target - NOT regular wild animals like wolves/foxes)
    let mut closest_npc: Option<(u64, f32)> = None;
    for animal in ctx.db.wild_animal().iter() {
        // ONLY target hostile NPCs (Shorebound, Shardkin, DrownedWatch)
        // Never target regular animals (wolves, foxes, etc.)
        if animal.is_hostile_npc && animal.health > 0.0 {
            let dx = animal.pos_x - turret.pos_x;
            let dy = animal.pos_y - turret.pos_y;
            let dist_sq = dx * dx + dy * dy;
            if dist_sq < turret_range_sq {
                if closest_npc.map(|(_, d)| dist_sq < d).unwrap_or(true) {
                    closest_npc = Some((animal.id, dist_sq));
                }
            }
        }
    }
    
    if let Some((npc_id, _)) = closest_npc {
        return Some(TargetInfo::Animal(npc_id));
    }
    
    // Priority 2: Players (only if global PvP is enabled)
    let world_state = ctx.db.world_state().iter().next();
    let pvp_enabled = world_state.map(|ws| ws.pvp_enabled).unwrap_or(false);
    
    if pvp_enabled {
        let mut closest_player: Option<(Identity, f32)> = None;
        
        for player in ctx.db.player().iter() {
            // Skip owner, dead players, offline players
            if player.identity == turret.placed_by || player.is_dead || !player.is_online {
                continue;
            }
            
            // TODO: Future - check per-player PvP flag when implemented
            // if !player.pvp_enabled { continue; }
            
            // Check range
            let dx = player.position_x - turret.pos_x;
            let dy = player.position_y - turret.pos_y;
            let dist_sq = dx * dx + dy * dy;
            if dist_sq < turret_range_sq {
                if closest_player.map(|(_, d)| dist_sq < d).unwrap_or(true) {
                    closest_player = Some((player.identity, dist_sq));
                }
            }
        }
        
        if let Some((player_id, _)) = closest_player {
            return Some(TargetInfo::Player(player_id));
        }
    }
    
    None
}
```

**Important PvP Notes:**
- Turret damage to players counts as PvP damage from the turret owner
- Turret owner gains kill credit and any PvP rewards if the turret kills a player
- Turrets can be destroyed by players when global PvP is enabled
- Future: When per-player PvP flags are implemented, turrets will respect those flags

### 4. Projectile Creation

Reuse existing `Projectile` table - add `source_type: u8` field:

```rust
// In projectile.rs - add to Projectile struct
pub source_type: u8,  // 0 = player weapon, 1 = turret

// Constants
pub const PROJECTILE_SOURCE_PLAYER: u8 = 0;
pub const PROJECTILE_SOURCE_TURRET: u8 = 1;
```

Tallow glob projectiles have:

- `owner_id`: Set to turret's `placed_by` (for damage attribution)
- `item_def_id`: The Tallow item def ID (the fuel IS the projectile)
- `ammo_def_id`: Same as item_def_id (Tallow)
- `source_type`: `PROJECTILE_SOURCE_TURRET` (1)
- Velocity aimed at target position (slower than arrows - molten glob physics)

**Projectile Rendering:**
Client checks `source_type == 1` + `ammo_def_id == Tallow` to render as glowing orange/yellow molten glob instead of arrow sprite.

**PvP Hit Handling:**
When a tallow projectile hits a player (in `projectile.rs` collision handling):
1. Verify global PvP is still enabled (could change between fire and hit)
2. Apply damage via standard combat system (owner gets kill credit)
3. Future: Check per-player PvP flags when implemented

### 4b. Fire Patch on Hit (Tallow Steam Turret specific)

When a tallow projectile hits its target, there's a ~25% chance to create a fire patch at the hit location:

```rust
// In projectile.rs collision handling for turret projectiles
if source_type == PROJECTILE_SOURCE_TURRET && is_tallow_ammo {
    // 25% chance to create fire patch
    let mut rng = rand::rngs::StdRng::seed_from_u64(ctx.timestamp.to_micros_since_unix_epoch() as u64);
    if rng.gen_range(0..100) < 25 {
        crate::fire_patch::create_fire_patch(ctx, hit_x, hit_y, owner_id, false, None, None)?;
    }
}
```

### 4c. Fire Patch Damage Update in [`server/src/fire_patch.rs`](server/src/fire_patch.rs)

Currently `process_fire_patch_damage` only damages players. Update to also damage:

1. **Hostile NPCs** (always damaged by fire):
```rust
// In process_fire_patch_damage
for mut animal in ctx.db.wild_animal().iter() {
    if !animal.is_hostile_npc || animal.health <= 0.0 { continue; }
    
    let dx = fire_patch.pos_x - animal.pos_x;
    let dy = fire_patch.pos_y - animal.pos_y;
    let dist_sq = dx * dx + dy * dy;
    
    if dist_sq < radius_sq {
        // Apply damage directly (hostile NPCs don't have burn effects)
        animal.health = (animal.health - FIRE_PATCH_NPC_DAMAGE).max(0.0);
        ctx.db.wild_animal().id().update(animal.clone());
    }
}
```

2. **PvP-enabled players** (only when global PvP enabled):
The existing player damage code already works, but ensure fire creator gets kill credit if fire kills a player.

### 5. Reducers Needed

- `place_turret(item_instance_id, world_x, world_y)` - places based on item's turret_type
- `move_item_to_turret(turret_id, slot_index, item_instance_id)` - load ammo (Tallow for steam turret)
- `quick_move_from_turret(turret_id, slot_index)` - remove ammo
- `pickup_turret(turret_id)` - retrieve (must be empty and not destroyed)
- `interact_with_turret(turret_id)` - open UI

Note: No toggle reducer needed - turret is always active when loaded with ammo

### 6. Item Definition in [`server/src/items_database/placeables.rs`](server/src/items_database/placeables.rs)

```rust
ItemBuilder::new("Tallow Steam Turret", 
    "A scrap turret built from warped sheet metal, splintered wood, and tallow-sealed joints, \
    with a squat boiler core and a short, reinforced nozzle. The chamber heats rendered fat to \
    a rolling boil and ejects it as a pressurized stream of scalding tallow toward targets.", 
    ItemCategory::Placeable)
    .icon("turret_tallow.png")  // Same name as doodad
    .stackable(2)
    .crafting_cost(vec![
        CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 150 },
        CostIngredient { item_name: "Wood".to_string(), quantity: 75 },
        CostIngredient { item_name: "Rope".to_string(), quantity: 8 },
        CostIngredient { item_name: "Tallow".to_string(), quantity: 20 },
    ])
    .crafting_output(1, 12)
    .respawn_time(900)
    .build(),
```

**No separate projectile item needed** - Tallow itself is the projectile. The projectile system uses `source_type` field + Tallow's `item_def_id` to identify it.

### 7. Module Integration in [`server/src/lib.rs`](server/src/lib.rs)

- Add `mod turret;`
- Add table trait imports
- Register in init reducer

---

## Client Implementation

### 8. Generated Bindings

After server publish: `spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server`

### 9. Data Flow in [`client/src/hooks/useSpacetimeTables.ts`](client/src/hooks/useSpacetimeTables.ts)

```typescript
const [turrets, setTurrets] = useState<Map<string, Turret>>(() => new Map());
// Add onInsert, onUpdate, onDelete handlers
```

### 10. Props Threading

- [`client/src/App.tsx`](client/src/App.tsx) - destructure and pass turrets
- [`client/src/components/GameScreen.tsx`](client/src/components/GameScreen.tsx) - pass through
- [`client/src/components/GameCanvas.tsx`](client/src/components/GameCanvas.tsx) - pass to hooks

### 11. Rendering in [`client/src/utils/renderers/turretRenderingUtils.ts`](client/src/utils/renderers/turretRenderingUtils.ts) (new file)

- Uses `turret_tallow.png` from doodads folder (single state, no active/inactive)
- Sprite dimensions: 256x256px
- Render different sprites per turret_type (extensible for future types)
- No rotation needed - turret fires from fixed position

### 12. Projectile Rendering Update in [`client/src/utils/renderers/projectileRenderingUtils.ts`](client/src/utils/renderers/projectileRenderingUtils.ts)

- Check `source_type == PROJECTILE_SOURCE_TURRET` (1)
- If turret projectile: render as glowing orange/yellow circle (no sprite image)
- Draw using canvas primitives: filled circle with glow effect
- Add particle trail effect (dripping molten tallow - orange particles)

### 13. Placement Preview in [`client/src/utils/renderers/placementRenderingUtils.ts`](client/src/utils/renderers/placementRenderingUtils.ts)

- Add `turret_tallow.png` preview handling (uses doodad sprite)
- Water/wall/monument blocking checks
- Use entityVisualConfig for positioning

### 14. Placement Manager in [`client/src/hooks/usePlacementManager.ts`](client/src/hooks/usePlacementManager.ts)

- Add case for "Tallow Steam Turret"
- Call `placeTurret` reducer

### 15. Interaction UI

- Ammo slot display (shows Tallow stack - each Tallow = 1 shot)
- Turret is always active when loaded with Tallow (no toggle needed)
- Range indicator circle when selected (optional)
- Label showing turret type

### 16. Entity Filtering in [`client/src/hooks/useEntityFiltering.ts`](client/src/hooks/useEntityFiltering.ts)

- Add turrets to visible entities
- Add to Y-sorted entities

### 17. Interaction Finder in [`client/src/hooks/useInteractionFinder.ts`](client/src/hooks/useInteractionFinder.ts)

- Add turret interaction detection

### 18. Entity Visual Config in [`client/src/utils/entityVisualConfig.ts`](client/src/utils/entityVisualConfig.ts)

```typescript
tallow_turret: {
  centerOffsetX: 0,
  centerOffsetY: -134,  // Visual center relative to posY (similar to wards)
  width: 200,           // Interaction box width
  height: 220,          // Interaction box height
  placementYOffset: 0,  // Cursor at center of preview
  spriteWidth: 256,
  spriteHeight: 256,
},
```

### 19. Item Icon Utils in [`client/src/utils/itemIconUtils.ts`](client/src/utils/itemIconUtils.ts)

```typescript
// Import
import turretTallowIcon from '../assets/items/turret_tallow.png';

// Add to iconMap
'turret_tallow.png': turretTallowIcon,
```

### 20. External Container UI in [`client/src/components/ExternalContainerUI.tsx`](client/src/components/ExternalContainerUI.tsx)

Add turret support for loading Tallow ammo:

```typescript
// Add to interface ExternalContainerUIProps
turrets: Map<string, SpacetimeDBTurret>;

// Add to component destructuring
turrets,

// Add turret container rendering case (similar to lantern fuel slot)
// Turret has single ammo slot for Tallow
// Display: "Ammo: X Tallow" or "Empty"
// Only accepts Tallow items
```

Features:
- Single ammo slot that only accepts Tallow
- Shows current Tallow count
- Uses existing drag/drop system for item transfer
- Calls `move_item_to_turret` reducer when loading
- Calls `quick_move_from_turret` reducer when unloading

---

## Assets

**Existing (no new assets needed):**
- `client/src/assets/doodads/turret_tallow.png` - turret doodad sprite (already exists)

**Needs to be created:**
- `client/src/assets/items/turret_tallow.png` - item icon (copy/derive from doodad)
- Sound effects: turret_fire_tallow.mp3

**Projectile rendering:** No sprite image - rendered as glowing orange circle via canvas primitives

---

## Files to Create/Modify

**New Files:**

- `server/src/turret.rs` - main turret logic (extensible for future types)
- `client/src/utils/renderers/turretRenderingUtils.ts` - turret rendering

**Server Modifications:**

- `server/src/lib.rs` - module declaration
- `server/src/items_database/placeables.rs` - item definition
- `server/src/projectile.rs` - add `source_type` field, tallow projectile collision handling, fire patch creation on hit
- `server/src/combat.rs` - add `damage_turret()` function for turret destruction
- `server/src/fire_patch.rs` - update `process_fire_patch_damage` to damage hostile NPCs and PvP-enabled players

**Client Modifications:**

- `client/src/hooks/useSpacetimeTables.ts` - subscription (follow existing conventions)
- `client/src/App.tsx` - data flow
- `client/src/components/GameScreen.tsx` - props
- `client/src/components/GameCanvas.tsx` - rendering integration
- `client/src/hooks/useEntityFiltering.ts` - visibility
- `client/src/hooks/useInteractionFinder.ts` - interaction
- `client/src/hooks/usePlacementManager.ts` - placement
- `client/src/utils/renderers/placementRenderingUtils.ts` - preview
- `client/src/utils/renderers/projectileRenderingUtils.ts` - tallow glob rendering (canvas primitives)
- `client/src/utils/entityVisualConfig.ts` - add turret config for blue box and E label
- `client/src/utils/itemIconUtils.ts` - add turret_tallow.png icon mapping
- `client/src/components/ExternalContainerUI.tsx` - add turret UI for loading Tallow ammo