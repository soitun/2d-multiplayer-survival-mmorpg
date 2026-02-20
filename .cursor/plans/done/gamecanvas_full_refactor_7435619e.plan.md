---
name: GameCanvas Full Refactor
overview: Perform a full-behavior-preserving refactor of GameCanvas with extraction into focused hooks/utilities, DRY consolidation, and targeted render/perf stability improvements while keeping the public API unchanged.
todos:
  - id: baseline-checks
    content: Create behavior checkpoints for interaction/render/reducer parity before each refactor phase
    status: completed
  - id: dry-indicators-constants
    content: Consolidate indicator sizing and remove remaining magic-number duplication in GameCanvas
    status: completed
  - id: reducer-sideeffects
    content: Complete and verify reducer feedback extraction via useGameReducerFeedbackHandlers
    status: completed
  - id: render-pass-helpers
    content: Refactor renderGame into pass-oriented helper sections while preserving ordering
    status: completed
  - id: react-perf-hygiene
    content: Apply dependency-array and memo/ref hygiene fixes with no behavior changes
    status: completed
  - id: debug-cleanup
    content: Finalize debug/log gating and remove stale commented debug blocks
    status: completed
  - id: validate-parity
    content: Run lint/type/build checks and manual parity verification checklist
    status: completed
isProject: false
---

# GameCanvas Full Refactor Plan

## Scope Lock

- Preserve 100% runtime behavior and the `GameCanvas` public props API.
- Allow internal extraction to new hooks/utils/files.
- Keep existing styling/rendering approach and renderer ordering intact.

## Baseline + Safety Checks

- Capture current behavior baselines before each phase: interaction indicators, placement/upgrade error feedback, rendering order, minimap behavior, and lighting overlays.
- Keep changes incremental and compile-safe after each phase (`ReadLints`, typecheck/build step used as checkpoints).

## Phase 1: High-Confidence DRY + Constant Consolidation

- Finalize central indicator sizing and remove magic numbers by standardizing on `[client/src/utils/entityVisualConfig.ts](client/src/utils/entityVisualConfig.ts)` helpers (`getIndicatorHeight`, config-derived fallbacks).
- Complete interaction-indicator loop normalization in `[client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx)` so entity-specific branches are config-driven where possible.
- Normalize repeated small rendering constants (`TOTAL_SWIMMING_FRAMES`, tile-size derivation strategy) with single-source definitions.

## Phase 2: Extract Reducer Feedback Side Effects

- Keep reducer callback registrations and cleanup centralized in `[client/src/hooks/useGameReducerFeedbackHandlers.ts](client/src/hooks/useGameReducerFeedbackHandlers.ts)`.
- Ensure parity for all handled reducers (consume/fertilizer/destroy/place/fishing/door/cairn/milk/upgrade/load/fire).
- Keep user-facing error text and sound behavior unchanged.

## Phase 3: Render-Loop Structure Without Behavioral Drift

- Refactor `renderGame` into internal pass-oriented helpers inside `[client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx)` (not full renderer re-architecture yet), e.g.:
  - scene prep/background
  - world/tiles/water
  - y-sorted entities
  - interaction indicators
  - lights/overlays/profiler
- Preserve exact pass order and blend modes.

## Phase 4: Targeted React Perf Hygiene

- Fix dependency hygiene and avoid unstable dep references (e.g. `.current` in dependency arrays).
- Consolidate ref-sync effects where safe and remove obviously unnecessary memo deps.
- Retain ref-based hot-path reads to minimize render-loop callback churn.

## Phase 5: Debug/Diagnostics Cleanup

- Use `[client/src/utils/gameDebugUtils.ts](client/src/utils/gameDebugUtils.ts)` for gated diagnostics/log wrappers.
- Remove stale commented debug blocks and dead comments from `[client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx)`.
- Keep diagnostics functionality available when explicitly enabled.

## Validation Matrix

- Interaction parity: hold-progress circles for campfire/furnace/barbecue/lantern/box/stash/door/hearth/water/knocked-out-player.
- Reducer parity: all prior error/success pathways still emit same UI/sound results.
- Visual parity: day/night lighting, underwater shadows, shipwreck/compound lights, minimap overlays.
- Performance sanity: no new callback churn regressions; profiler/diagnostic paths still functional.

## Planned File Touches

- `[client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx)`
- `[client/src/hooks/useGameReducerFeedbackHandlers.ts](client/src/hooks/useGameReducerFeedbackHandlers.ts)`
- `[client/src/utils/entityVisualConfig.ts](client/src/utils/entityVisualConfig.ts)`
- `[client/src/utils/gameDebugUtils.ts](client/src/utils/gameDebugUtils.ts)`
- Optional small helper file if needed for render-pass utility extraction (only if it meaningfully reduces complexity).

