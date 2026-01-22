---
name: Tallow-Steam Bolt Launcher
overview: Implement auto turrets (Tallow-Steam Bolt Launcher) as a new placeable defensive structure that automatically targets and fires bolts at hostile NPCs during night raids. Turrets can also target enemy players when BOTH the turret owner AND target have PvP enabled (per-player PvP flag system).
todos:
  - id: server-table
    content: Create server/src/bolt_launcher.rs with BoltLauncher table, constants, ItemContainer impl, and scheduled processing
    status: pending
  - id: server-targeting
    content: "Implement targeting logic: hostile NPCs always, players only if both owner and target have active PvP flags"
    status: pending
  - id: server-firing
    content: "Implement firing logic: create Projectile entities aimed at targets, consume ammo"
    status: pending
  - id: server-reducers
    content: Add placement, toggle, ammo management, pickup, and interaction reducers
    status: pending
  - id: server-item-def
    content: Add item definitions in placeables.rs for Tallow-Steam Bolt Launcher and Turret Bolt
    status: pending
  - id: server-lib
    content: Register bolt_launcher module in lib.rs
    status: pending
  - id: client-bindings
    content: Generate TypeScript bindings after server publish
    status: pending
  - id: client-subscription
    content: Add boltLaunchers state and handlers in useSpacetimeTables.ts
    status: pending
  - id: client-dataflow
    content: Thread boltLaunchers through App.tsx -> GameScreen.tsx -> GameCanvas.tsx
    status: pending
  - id: client-rendering
    content: Create boltLauncherRenderingUtils.ts with sprite rendering and target indicator
    status: pending
  - id: client-placement
    content: Add placement preview and reducer call in placementRenderingUtils.ts and usePlacementManager.ts
    status: pending
  - id: client-filtering
    content: Add to useEntityFiltering.ts and useInteractionFinder.ts
    status: pending
---

# Tallow-Steam Bolt Launcher Implementation

## Overview

A defensive auto-turret that fires steam-powered bolts at hostile NPCs (night apparitions) and optionally enemy players when both the turret owner and target have PvP enabled (see [pvp_flag_system_a127a15a.plan.md](pvp_flag_system_a127a15a.plan.md)). Uses Tallow as ammo (1 Tallow = 10 bolts).

**PvP Behavior:**
- Turrets ALWAYS target hostile NPCs regardless of PvP status
- Turrets target enemy players ONLY when:
  1. Turret owner has active PvP flag (`is_pvp_active_for_player()` returns true)
  2. Target player has active PvP flag
  3. Target player is not the turret owner
- This prevents turrets from being used to grief non-PvP players

## Architecture Decision

**Separate table** (not extending Lantern) because turrets have fundamentally different behavior:

- Active targeting AI vs passive protection zones
- Creates projectiles vs burns fuel for effects
- Needs targeting fields, fire rate, ammo tracking

## Key Design Decisions

- **Ammo**: 1 Tallow = 10 bolts (consumed per shot)
- **Targeting Priority**: Hostile NPCs first, then PvP-enabled players
- **PvP Targeting**: Only when BOTH turret owner AND target have active PvP flags (per-player system)
- **Fire Rate**: Every 2.5 seconds
- **Range**: 400px detection radius
- **Damage**: ~15 per bolt (tunable)
- **Damage Attribution**: Turret kills credit the turret owner (for achievements, PvP kill rewards)
- **Combat Timer**: Turret hits update `last_pvp_combat_time` for both owner and target
- **Raidable**: Turrets can be destroyed by PvP-enabled attackers if owner has PvP enabled

## Dependencies

- **PvP Flag System** ([pvp_flag_system_a127a15a.plan.md](pvp_flag_system_a127a15a.plan.md)) - Must be implemented first for player PvP targeting to work. The turret uses `is_pvp_active_for_player()` from combat.rs.

---

## Server Implementation

### 1. New Table: `bolt_launcher` in [`server/src/bolt_launcher.rs`](server/src/bolt_launcher.rs) (new file)

```rust
pub struct BoltLauncher {
    id: u32,                          // Primary key, auto_inc
    pos_x: f32,
    pos_y: f32,
    chunk_index: u32,                 // Spatial index
    placed_by: Identity,
    placed_at: Timestamp,
    is_active: bool,                  // On/off state
    ammo_instance_id: Option<u64>,    // Tallow item in ammo slot
    ammo_def_id: Option<u64>,
    current_ammo_count: u32,          // Bolts remaining (10 per Tallow)
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

- `BOLT_LAUNCHER_RANGE: f32 = 400.0`
- `BOLT_LAUNCHER_FIRE_INTERVAL_MS: u64 = 2500` (2.5 seconds)
- `BOLTS_PER_TALLOW: u32 = 10`
- `BOLT_DAMAGE: f32 = 15.0`
- `BOLT_SPEED: f32 = 800.0`
- `BOLT_LAUNCHER_INITIAL_HEALTH: f32 = 500.0`
- `BOLT_LAUNCHER_MAX_HEALTH: f32 = 500.0`

**PvP Raiding:**
Turrets are damageable structures. A `damage_bolt_launcher()` function is needed in `combat.rs` that:
1. Checks if attacker has active PvP AND turret owner has active PvP (same as other structures)
2. If both have PvP, allows damage; otherwise blocks it
3. On destruction, drops the turret item and any loaded Tallow

### 2. Scheduled Processing Table

```rust
pub struct BoltLauncherProcessingSchedule {
    launcher_id: u64,
    scheduled_at: ScheduleAt,
}
```

Runs every 500ms to:

1. Find nearest valid target in range
2. Fire if cooldown elapsed and has ammo
3. Create projectile entity aimed at target

### 3. Targeting Logic (in processing reducer)

```rust
fn find_target(ctx: &ReducerContext, launcher: &BoltLauncher, current_time: Timestamp) -> Option<TargetInfo> {
    let launcher_range_sq = BOLT_LAUNCHER_RANGE * BOLT_LAUNCHER_RANGE;
    
    // Priority 1: Hostile NPCs (always target regardless of PvP)
    let mut closest_npc: Option<(u64, f32)> = None;
    for animal in ctx.db.wild_animal().iter() {
        if animal.is_hostile_npc && animal.health > 0.0 {
            let dx = animal.pos_x - launcher.pos_x;
            let dy = animal.pos_y - launcher.pos_y;
            let dist_sq = dx * dx + dy * dy;
            if dist_sq < launcher_range_sq {
                if closest_npc.map(|(_, d)| dist_sq < d).unwrap_or(true) {
                    closest_npc = Some((animal.id, dist_sq));
                }
            }
        }
    }
    
    if let Some((npc_id, _)) = closest_npc {
        return Some(TargetInfo::Animal(npc_id));
    }
    
    // Priority 2: Players (only if BOTH owner AND target have active PvP)
    // Uses per-player PvP flag system from combat.rs
    let owner_player = ctx.db.player().identity().find(&launcher.placed_by);
    let owner_pvp_active = owner_player.as_ref()
        .map(|p| crate::combat::is_pvp_active_for_player(p, current_time))
        .unwrap_or(false);
    
    // Only check player targets if turret owner has PvP enabled
    if owner_pvp_active {
        let mut closest_player: Option<(Identity, f32)> = None;
        
        for player in ctx.db.player().iter() {
            // Skip owner, dead players, offline players
            if player.identity == launcher.placed_by || player.is_dead || !player.is_online {
                continue;
            }
            
            // Check if target player also has PvP enabled
            if !crate::combat::is_pvp_active_for_player(&player, current_time) {
                continue;
            }
            
            // Check range
            let dx = player.position_x - launcher.pos_x;
            let dy = player.position_y - launcher.pos_y;
            let dist_sq = dx * dx + dy * dy;
            if dist_sq < launcher_range_sq {
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
- This updates `last_pvp_combat_time` for both owner and target (extending their PvP timers if in combat)
- Turret owner gains kill credit and any PvP rewards if the turret kills a player
- Turrets can be destroyed by PvP-enabled players attacking the owner's structures (see PvP raiding in pvp_flag_system)

### 4. Projectile Creation

Reuse existing `Projectile` table - turret bolts are just projectiles with:

- `owner_id`: Set to launcher's `placed_by` (for damage attribution and PvP combat tracking)
- `item_def_id`: New "Turret Bolt" item definition
- `ammo_def_id`: Same as item_def_id
- Velocity aimed at target's predicted position

**PvP Combat Time Update:**
When a turret bolt hits a player (in `projectile.rs` collision handling), the code must:
1. Verify both owner and target still have active PvP (check can change between fire and hit)
2. If PvP is valid, call `update_pvp_combat_time()` for both owner and target
3. This ensures turret combat extends PvP timers just like direct player combat

### 5. Reducers Needed

- `place_bolt_launcher(item_instance_id, world_x, world_y)`
- `toggle_bolt_launcher(launcher_id)` - activate/deactivate
- `move_item_to_bolt_launcher(launcher_id, slot_index, item_instance_id)` - load Tallow
- `quick_move_from_bolt_launcher(launcher_id, slot_index)` - remove Tallow
- `pickup_bolt_launcher(launcher_id)` - retrieve (must be empty)
- `interact_with_bolt_launcher(launcher_id)` - open UI

### 6. Item Definition in [`server/src/items_database/placeables.rs`](server/src/items_database/placeables.rs)

```rust
ItemBuilder::new("Tallow-Steam Bolt Launcher", 
    "An automated defense turret powered by steam from burning tallow. 
    Fires bolts at hostile apparitions during night raids. 
    Load with Tallow (1 Tallow = 10 bolts).", 
    ItemCategory::Placeable)
    .icon("bolt_launcher.png")
    .stackable(2)
    .crafting_cost(vec![
        CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 200 },
        CostIngredient { item_name: "Wood".to_string(), quantity: 100 },
        CostIngredient { item_name: "Rope".to_string(), quantity: 10 },
        CostIngredient { item_name: "Tallow".to_string(), quantity: 25 },
    ])
    .crafting_output(1, 15)
    .respawn_time(900)
    .build(),
```

Also add "Turret Bolt" as a non-craftable item definition for projectile tracking.

### 7. Module Integration in [`server/src/lib.rs`](server/src/lib.rs)

- Add `mod bolt_launcher;`
- Add table trait imports
- Register in init reducer

---

## Client Implementation

### 8. Generated Bindings

After server publish: `spacetime generate --lang typescript --out-dir ./client/src/generated --project-path ./server`

### 9. Data Flow in [`client/src/hooks/useSpacetimeTables.ts`](client/src/hooks/useSpacetimeTables.ts)

```typescript
const [boltLaunchers, setBoltLaunchers] = useState<Map<string, BoltLauncher>>(() => new Map());
// Add onInsert, onUpdate, onDelete handlers
```

### 10. Props Threading

- [`client/src/App.tsx`](client/src/App.tsx) - destructure and pass boltLaunchers
- [`client/src/components/GameScreen.tsx`](client/src/components/GameScreen.tsx) - pass through
- [`client/src/components/GameCanvas.tsx`](client/src/components/GameCanvas.tsx) - pass to hooks

### 11. Rendering in [`client/src/utils/renderers/boltLauncherRenderingUtils.ts`](client/src/utils/renderers/boltLauncherRenderingUtils.ts) (new file)

- Sprite dimensions: 96x128px (similar to wards)
- Two states: active (steam animation) vs inactive
- Rotation toward current target when firing
- Muzzle flash effect on fire

### 12. Placement Preview in [`client/src/utils/renderers/placementRenderingUtils.ts`](client/src/utils/renderers/placementRenderingUtils.ts)

- Add bolt_launcher.png preview handling
- Water/wall/monument blocking checks

### 13. Placement Manager in [`client/src/hooks/usePlacementManager.ts`](client/src/hooks/usePlacementManager.ts)

- Add case for "Tallow-Steam Bolt Launcher"
- Call `placeBoltLauncher` reducer

### 14. Interaction UI

- Ammo slot display (shows Tallow and bolt count)
- Activate/deactivate toggle button
- Range indicator circle when selected

### 15. Entity Filtering in [`client/src/hooks/useEntityFiltering.ts`](client/src/hooks/useEntityFiltering.ts)

- Add boltLaunchers to visible entities
- Add to Y-sorted entities

### 16. Interaction Finder in [`client/src/hooks/useInteractionFinder.ts`](client/src/hooks/useInteractionFinder.ts)

- Add bolt launcher interaction detection

---

## Assets Needed

- `bolt_launcher_off.png` - inactive state (96x128)
- `bolt_launcher_active.png` - active/firing state with steam
- `turret_bolt.png` - projectile sprite (32x32)
- Sound effects: turret_fire.mp3, turret_activate.mp3

---

## Files to Create/Modify

**New Files:**

- `server/src/bolt_launcher.rs` - main turret logic
- `client/src/utils/renderers/boltLauncherRenderingUtils.ts` - rendering

**Server Modifications:**

- `server/src/lib.rs` - module declaration
- `server/src/items_database/placeables.rs` - item definition
- `server/src/projectile.rs` - turret bolt collision handling (must update PvP combat times for owner+target)
- `server/src/combat.rs` - turret damage function (if separate from projectile), PvP checks using `is_pvp_active_for_player()`

**Client Modifications:**

- `client/src/hooks/useSpacetimeTables.ts` - subscription
- `client/src/App.tsx` - data flow
- `client/src/components/GameScreen.tsx` - props
- `client/src/components/GameCanvas.tsx` - rendering integration
- `client/src/hooks/useEntityFiltering.ts` - visibility
- `client/src/hooks/useInteractionFinder.ts` - interaction
- `client/src/hooks/usePlacementManager.ts` - placement
- `client/src/utils/renderers/placementRenderingUtils.ts` - preview