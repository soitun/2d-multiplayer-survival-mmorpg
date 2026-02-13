# Reducer Transaction Optimization Plan

## Executive Summary

The server is generating **~5M+ reducer transactions per 24 hours** from four systems alone, even when **no players are online**. This is wasteful and costly. The root causes are:

1. **Per-entity scheduling** (fumaroles) — each fumarole has its own schedule = N transactions/sec
2. **Always-on intervals** — projectiles, wild animals, dodge rolls run continuously regardless of player presence
3. **No idle detection** — systems never pause when the server is empty

---

## Transaction Breakdown (24h)

| Reducer | Transactions | Est./sec | Root Cause |
|---------|-------------|---------|------------|
| `process_fumarole_logic_scheduler` | 3,135,352 | ~36 | **Per-fumarole schedule** — each fumarole = 1 tx/sec |
| `update_projectiles` | 1,291,204 | ~15 | **50ms interval** (20 Hz) — runs even with 0 projectiles |
| `process_wild_animal_ai` | 531,938 | ~6 | **125ms interval** (8 Hz) — early-exits when no players but **still counts as tx** |
| `cleanup_expired_dodge_rolls` | 136,196 | ~2 | **500ms interval** (2 Hz) — runs even with 0 dodge rolls |

**Critical insight**: In SpacetimeDB, **every scheduled reducer invocation is a transaction** — even if the reducer returns immediately. Early-exit optimizations save CPU but **not transaction count**.

---

## Investigation Findings

### 1. Fumarole Logic (3.1M tx/day) — HIGHEST IMPACT

**File**: `server/src/fumarole.rs`

**Architecture**:
- Each fumarole gets its own row in `fumarole_processing_schedule`
- Each row fires every **1 second** (`FUMAROLE_PROCESS_INTERVAL_SECS`)
- World has ~36 fumaroles (quarry + coral) → 36 × 86,400 = **3,110,400 tx/day**

**Problems**:
- No player presence check — runs when server is empty
- Per-entity scheduling is inherently O(N) on transactions
- Fumaroles with no items and no nearby players still process (burn damage, cooking progress)

**Current flow**:
```
World gen spawns fumarole → schedule_next_fumarole_processing() → insert schedule row
Each second: scheduler fires per fumarole → process_fumarole_logic_scheduled
```

### 2. Projectile Updates (1.3M tx/day)

**File**: `server/src/projectile.rs`

**Architecture**:
- Single global schedule, **50ms interval** (20 Hz)
- Early exit when `ctx.db.projectile().iter().next().is_none()` — but **transaction still counts**

**Problems**:
- 20 transactions/sec even when no projectiles exist
- No player check — if no players, there can be no projectiles (players/turrets create them)
- 50ms may be overkill for arrow physics

### 3. Wild Animal AI (532K tx/day)

**File**: `server/src/wild_animal_npc/core.rs`

**Architecture**:
- Single schedule, **125ms interval** (8 Hz)
- **Already has** `if online_player_count == 0 { return Ok(()) }` — good!

**Problem**:
- Early exit saves CPU but **not transactions** — still 8 invocations/sec when idle

### 4. Dodge Roll Cleanup (136K tx/day)

**File**: `server/src/player_movement.rs`

**Architecture**:
- Single schedule, **500ms interval** (2 Hz)
- No player check

**Problem**:
- When no players, there are no dodge rolls — pointless to run

---

## Proposed Optimization Plan

### Phase 1: Player-Presence Gating (Stop Idle Transactions)

**Goal**: Pause scheduled systems when no players are online; resume when first player connects.

**Mechanism**: In SpacetimeDB, **deleting a schedule row stops the scheduler**. Re-inserting resumes it.

**Implementation**:

1. **Create `game_systems_coordinator`** (new module or in `lib.rs`):
   - `pause_game_systems(ctx)` — delete schedule rows for: projectiles, wild animal AI, dodge roll cleanup
   - `resume_game_systems(ctx)` — re-insert schedule rows (call existing init functions)

2. **In `identity_disconnected`**:
   - After setting player offline, check: `active_connections.iter().count() == 0` (we just deleted ours, so 0 = we were last)
   - If last player: call `pause_game_systems(ctx)`

3. **In `identity_connected`**:
   - Before inserting new connection, check: `active_connections.iter().count() == 0`
   - If was empty (we're first): call `resume_game_systems(ctx)`

**Expected savings when idle**: ~23 tx/sec → **0 tx/sec** for these three systems.

---

### Phase 2: Fumarole Batching (Collapse N Schedules → 1)

**Goal**: Replace per-fumarole schedules with a **single global schedule** that processes all fumaroles in one reducer call.

**Current**: N fumaroles × 1 tx/sec = N tx/sec (e.g. 36 tx/sec)  
**Target**: 1 tx/sec total

**Implementation**:

1. **New table**: `FumaroleGlobalSchedule` (single row, `ScheduleAt::Interval(1 sec)`)
2. **New reducer**: `process_all_fumaroles_scheduled(ctx, args)`:
   - Loop over `ctx.db.fumarole().iter()`
   - For each: run current fumarole logic (burn damage, consumption, cooking)
   - No need to call `schedule_next_fumarole_processing` — global schedule handles it
3. **Remove** per-fumarole `fumarole_processing_schedule` table and `schedule_next_fumarole_processing` calls
4. **Init**: Insert single row in init (or in world gen after first fumarole)
5. **Player check**: Early exit if `online_player_count == 0` — no players means no burn damage, no item consumption by players

**Caveat**: Fumaroles consume items and produce charcoal even without players. If we want that to continue when idle (e.g. offline base automation), we could:
- **Option A**: Still run fumaroles when idle (they're passive) — but batch them to 1 tx/sec
- **Option B**: Pause fumarole processing when no players — items stay in fumarole until someone logs in

Recommendation: **Option A** — batch to 1 tx/sec. Fumarole item consumption is a gameplay mechanic; pausing could feel wrong. The main win is batching, not pausing.

---

### Phase 3: Interval Adjustments (When Systems Are Active)

**Projectiles**:
- Consider **100ms** instead of 50ms — arrows/bullets don't need 20 Hz collision checks for most gameplay
- Or: **adaptive interval** — 50ms when projectiles > 0, 500ms when 0 (reduces idle tx when paused)

**Wild Animal AI**:
- 125ms (8 Hz) is reasonable for smooth movement
- With Phase 1, we avoid 8 tx/sec when idle

**Dodge Roll Cleanup**:
- 500ms is already reasonable (matches dodge duration)
- With Phase 1, we avoid 2 tx/sec when idle

---

### Phase 4: Reduce Logging (Secondary)

**Observed**: `log::info!` in hot paths (e.g. `[ProcessFumarole]`, `[ScheduleFumarole]`, `update_projectiles` DEBUG) adds overhead.

**Action**: Change to `log::trace!` or remove in production paths. Logging can be expensive at scale.

---

## Implementation Order

| Phase | Effort | Impact | Priority |
|-------|--------|--------|----------|
| Phase 1: Player-presence gating | Medium | ~2M tx/day saved when idle | **P0** |
| Phase 2: Fumarole batching | High | ~3M tx/day saved always | **P0** |
| Phase 3: Interval adjustments | Low | ~0.5M tx/day when active | P1 |
| Phase 4: Logging reduction | Low | CPU/memory, not tx count | P2 |

---

## Files to Modify

### Phase 1
- `server/src/lib.rs` — `identity_connected`, `identity_disconnected`; add `pause_game_systems`, `resume_game_systems`
- `server/src/projectile.rs` — extract init to be callable from coordinator
- `server/src/wild_animal_npc/core.rs` — extract init
- `server/src/player_movement.rs` — extract init

### Phase 2
- `server/src/fumarole.rs` — new global schedule, new reducer, remove per-fumarole schedule
- `server/src/environment.rs` — remove `schedule_next_fumarole_processing` calls from world gen

---

## Risk Assessment

| Change | Risk | Mitigation |
|-------|------|------------|
| Pause/resume schedules | Schedule might not restart correctly | Test connect/disconnect cycles; ensure init is idempotent |
| Fumarole batching | One slow fumarole could delay others | Process in single loop; fumarole logic is lightweight |
| Deleting schedule rows | Could lose schedule if bug | `resume` is called on connect; init also runs on module publish |

---

## Testing Checklist

- [ ] Connect as single player → all systems resume
- [ ] Disconnect (last player) → systems pause, tx count drops
- [ ] Reconnect → systems resume, gameplay works
- [ ] Multiple players → one disconnects, systems stay active
- [ ] Fumarole batching → item consumption, burn damage, charcoal production unchanged
- [ ] SpacetimeDB dashboard → tx count drops significantly when idle
