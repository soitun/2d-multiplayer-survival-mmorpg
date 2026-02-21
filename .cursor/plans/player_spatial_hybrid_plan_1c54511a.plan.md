---
name: Player Spatial Hybrid Plan
overview: Design a safe hybrid approach that preserves global player state while reducing projectile collision cost with localized player queries.
todos:
  - id: add-player-chunk-index
    content: Add indexed player.chunk_index and initialize/update it across create/move/respawn paths
    status: pending
  - id: projectile-player-chunk-filter
    content: Switch projectile player-collision loop to 3x3 chunk-filtered player query
    status: pending
  - id: behavior-parity-verify
    content: Build and run focused smoke tests for PvP/NPC projectile behavior parity
    status: pending
isProject: false
---

# Hybrid Player Spatialization Plan

## Goal

Keep players globally available for gameplay/UI systems while optimizing projectile hit detection to avoid full-table scans on every projectile tick.

## Current State

- `player` is globally subscribed in the client via `SELECT * FROM player` in [C:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/client/src/hooks/useSpacetimeTables.ts](C:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/client/src/hooks/useSpacetimeTables.ts).
- `update_projectiles` still uses full scan for player collision in [C:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/server/src/projectile.rs](C:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/server/src/projectile.rs).
- Other collision-heavy entities are already chunk-filtered in `projectile.rs`.

## Plan

1. Add spatial index for players on server

- Extend `Player` with `chunk_index: u32` and `#[index(btree)]` in [C:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/server/src/lib.rs](C:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/server/src/lib.rs).
- Initialize `chunk_index` on player create/register.
- Keep `chunk_index` updated in movement reducers (and any teleport/respawn paths).

1. Keep global client subscription unchanged

- Do not remove `SELECT * FROM player` from [C:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/client/src/hooks/useSpacetimeTables.ts](C:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/client/src/hooks/useSpacetimeTables.ts).
- Treat `chunk_index` as server-side optimization field; no gameplay semantics change.

1. Replace projectile player collision full-scan with chunk-filtered query

- In [C:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/server/src/projectile.rs](C:/WebProjects/vibe-coding-starter-pack-2d-multiplayer-survival/server/src/projectile.rs), change:
  - `for player_to_check in ctx.db.player().iter()`
  - to 3x3 `chunk_indices` loop with `ctx.db.player().chunk_index().filter(*chunk_idx)`.
- Preserve all existing checks (self-skip, dead-skip, PvP gating, safe-zone logic, NPC projectile behavior).

1. Validate no-behavior-change contract

- Build server and verify generated bindings compile.
- Smoke test key flows:
  - player-vs-player projectile hits,
  - NPC projectile hits on players,
  - safe-zone immunity,
  - PvP enable/disable timing interactions.

1. Optional hardening (if needed)

- Add debug assertions/logs to detect stale `chunk_index` mismatches during movement-related reducers.
- Add a maintenance reducer to recompute/fix `player.chunk_index` for recovery/debug scenarios.

## Risk Notes

- Main risk is stale `chunk_index` during movement/teleport paths. Mitigation is comprehensive update points and a fallback repair pass.
- Global systems depending on full player visibility remain intact because client subscription strategy is unchanged.

