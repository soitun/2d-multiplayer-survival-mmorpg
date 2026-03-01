# Combat/Placement Smoothness - Regression Test Matrix

Run after implementing the Combat/Placement Smoothness Plan to verify parity and catch regressions.

## Prerequisites

- Server running: `spacetime publish -p ./server broth-bullets-local`
- Client running: `npm run dev`
- Single player + optional second client for PvP

## Combat Regression Matrix

### Melee

| Target | Tool/Weapon | Expected | Notes |
|--------|-------------|----------|-------|
| Tree | Hatchet/Axe | Chop sound + shake immediately; no pass-through | Resource feedback |
| Stone | Pickaxe | Hit sound + shake immediately | Resource feedback |
| Barrel | Any melee | Barrel hit sound + shake | |
| Living Coral | Spear (snorkeling) | Coral shake + stone_hit sound | Underwater |
| Animal corpse | Any | Shake feedback | |
| Player corpse | Any | Shake feedback | |
| Other player | Any | Shake; server auth damage | PvP |
| Wild animal | Any | Shake; server auth damage | |
| Placeable (campfire, furnace) | Any | Impact feedback | |

### Ranged

| Weapon | Scenario | Expected | Notes |
|--------|----------|----------|-------|
| Hunting Bow | Click fire | Projectile stops at hit; no pass-through | Semi-auto |
| Hunting Bow | Hold (no auto) | Single shot per click | |
| Crossbow | Click | Bolt stops at hit | |
| Pistol | Click | Bullet stops at hit | |
| Pistol | Hold (auto) | Continuous fire; shared cooldown | Auto-fire |
| Thrown item | Throw | Stops at impact; drops item | |

### Projectile Visuals

- [ ] No visible pass-through after damage (200-shot stress)
- [ ] No projectile ghosting after collision/range expiry
- [ ] Break/drop behavior unchanged
- [ ] Fire patch behavior unchanged

## Placement Regression Matrix

### Seeds

| Seed Type | Biome | Expected | Notes |
|-----------|-------|----------|-------|
| Potato/Corn | Grass | Plant succeeds | Normal |
| Pinecone | Grass/Forest | Plant succeeds | Tree seed |
| Pinecone | Beach | Rejected | Biome restriction |
| Birch Catkin | Alpine | Rejected | Biome restriction |
| Reed Rhizome | Water | Plant on water | Special |
| Beach Lyme Grass | Beach | Plant on beach | Special |
| Any | Monument zone | Rejected | ALK, rune stone, etc. |
| Any | Foundation tile | Rejected | No plant on foundations |
| Tree seed | Within 120px of other seed | Rejected | Spacing |

### Placeables

- [ ] Campfire: valid grass, reject water/monument
- [ ] Furnace: same rules
- [ ] Foundation: monument exclusion
- [ ] Chest: placement rules unchanged

## Soak Tests

1. **Combat soak (10+ min)**: Sustained melee on trees/stones + ranged on targets; no duplicate attacks, no stuck cooldowns.
2. **Planting soak (10+ min)**: Rapid seed planting in busy area; P95 latency improved; no desync between preview and server.

## Rollback Hooks

If regressions occur:

1. **Projectile reconciliation**: Revert `projectileRenderingUtils.ts` PROJECTILE_TRACKING_DELETE_GRACE_MS to 750; revert `useInputHandler.ts` matching window to 1200ms, position tolerance to 48px.
2. **Input path**: Revert `useInputHandler.ts` to restore `lastServerSwingTimestampRef` and duplicated canvas-click melee block.
3. **Combat feedback**: Remove `playImmediateSound` calls from resource-tool triggers in `attemptSwing`.
4. **Seed optimization**: Revert `planted_seeds.rs` to full-table iterators and `log::info!` for plant_seed.

## Instrumentation (Optional)

Temporary debug counters to add for diagnostics:

- Projectile match success/fail rates (client)
- Optimistic projectile lifetime until authoritative retire (client)
- Attack dispatch count per click/hold (client)
- Plant reducer timing buckets (server)
