---
name: remove-thrown-item-feature
overview: Remove the entire non-ranged item-throw path from both client and server while keeping the items themselves usable in melee. Leave ranged projectile systems such as bows, firearms, grenades, and flares intact.
todos:
  - id: remove-server-throw-reducer
    content: Remove the server-side non-ranged `throw_item` feature and thrown-only projectile branches while preserving ranged projectile behavior.
    status: completed
  - id: regenerate-client-bindings
    content: Regenerate SpacetimeDB client bindings so the removed reducer disappears cleanly from generated client APIs.
    status: completed
  - id: remove-client-throw-input
    content: Delete client throw input and throw-aim handling from `useInputHandler.ts` and related callsites.
    status: completed
  - id: remove-thrown-render-logic
    content: Delete thrown-item-specific projectile presentation/rendering/debug and local held-item suppression logic.
    status: completed
  - id: validate-post-removal
    content: Run targeted validation for melee combat, right-click interactions, and surviving ranged projectile paths.
    status: completed
isProject: false
---

# Remove Non-Ranged Throwing

## Scope

Remove the full non-ranged `throw_item` feature for all items that currently use it, while keeping the underlying item definitions and melee combat intact.

Keep intact:

- Ranged projectile systems in [server/src/projectile.rs](server/src/projectile.rs) such as `fire_projectile()`.
- Self-ammo ranged throwables like grenade/flare.
- Weapon/tool/skull/spear item definitions and normal melee behavior.

Remove entirely:

- Server reducer `throw_item()` in [server/src/projectile.rs](server/src/projectile.rs).
- Client reducer calls and throw-aim state in [client/src/hooks/useInputHandler.ts](client/src/hooks/useInputHandler.ts).
- Thrown-item-only projectile presentation, render, and held-item suppression code.

## Server Changes

- Delete `throw_item()` and any server-only throw-aim reducer state that exists only to support this feature from [server/src/projectile.rs](server/src/projectile.rs).
- Remove or simplify any shared projectile branches that identify thrown items via `ammo_def_id == item_def_id` when those branches only exist for non-ranged throws:
  - thrown-specific damage multiplier logic
  - zero-gravity thrown-item flight behavior
  - thrown-item drop/break handling that only exists because melee/tools can be thrown
- Preserve shared projectile resolution for real ranged projectiles and ranged throwables.
- Regenerate client bindings after the reducer removal instead of editing generated files by hand, per [cursor/rules/spacetimedb-workflow.mdc](.cursor/rules/spacetimedb-workflow.mdc).

Key seam:

```3649:3721:server/src/projectile.rs
#[reducer]
pub fn throw_item(
    ctx: &ReducerContext,
    target_world_x: f32,
    target_world_y: f32,
    client_player_x: f32,
    client_player_y: f32,
    client_shot_id: String,
) -> Result<(), String> {
    // ... throwable allowlist and inventory removal ...
    if !is_throwable {
        return Err(format!("Item '{}' cannot be thrown.", item_def.name));
    }
```

## Client Changes

- Remove the right-click throw flow from [client/src/hooks/useInputHandler.ts](client/src/hooks/useInputHandler.ts):
  - `isItemThrowable(...)`
  - `setThrowAim(...)` reducer calls
  - `throwItem(...)` reducer call
  - thrown-only optimistic projectile spawn path
  - `registerLocalPlayerThrownItem(...)`
- Delete local held-item suppression helpers from [client/src/utils/renderers/equippedItemRenderingUtils.ts](client/src/utils/renderers/equippedItemRenderingUtils.ts) and their callsites in [client/src/utils/renderers/renderingUtils.ts](client/src/utils/renderers/renderingUtils.ts) and [client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx).
- Remove thrown-item-specific projectile dedupe/debug logic from:
  - [client/src/hooks/useProjectilePresentationStore.ts](client/src/hooks/useProjectilePresentationStore.ts)
  - [client/src/utils/renderers/projectileRenderingUtils.ts](client/src/utils/renderers/projectileRenderingUtils.ts)
  - [client/src/utils/projectileSampling.ts](client/src/utils/projectileSampling.ts)
  - [client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx)
- Leave shared projectile rendering/presentation intact for arrows, bolts, bullets, NPC projectiles, and grenade/flare-style ranged projectiles.

Key seam:

```1997:2007:client/src/hooks/useInputHandler.ts
// ADDED: Check if equipped item is throwable - enter throw aim mode
if (localPlayerActiveEquipment?.equippedItemDefId && itemDefinitionsRef.current) {
    const equippedItemDefForThrow = itemDefinitionsRef.current.get(String(localPlayerActiveEquipment.equippedItemDefId));
    if (equippedItemDefForThrow && isItemThrowable(equippedItemDefForThrow)) {
        isAimingThrowRef.current = true;
        connectionRef.current.reducers.setThrowAim({ isAiming: true });
    }
}
```

Key seam:

```151:180:client/src/utils/renderers/equippedItemRenderingUtils.ts
export function registerLocalPlayerThrownItem(itemInstanceId?: bigint | null): void {
  if (!itemInstanceId) return;
  localPlayerThrownItemRegisteredAtByInstance.set(itemInstanceId.toString(), Date.now());
}

export function isLocalPlayerThrownItemPending(
  itemInstanceId: bigint | null | undefined,
  nowMs: number,
): boolean {
  // ... thrown-item suppression lifetime tracking ...
}
```

## Cleanup And Validation

- Remove now-dead generated reducer usages after bindings regeneration.
- Typecheck both client and server.
- Validate that right-click behavior still works for the remaining systems that share the same input surface, especially building/upgrade radial menus.
- Verify melee weapons/tools/skulls/spears still equip and attack normally, and that grenade/flare throws still work if they are meant to stay.
- Do a final search for `throwItem`, `setThrowAim`, `isItemThrowable`, `registerLocalPlayerThrownItem`, and `ammoDefId === itemDefId` to make sure no stray client/server behavior remains.

