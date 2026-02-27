---
name: engine-first-runtime-migration
overview: Refactor runtime ownership from React components/hooks into a pure JavaScript engine core while keeping UI behavior intact. The plan is phased to reduce risk, preserve current gameplay, and improve performance by narrowing React to snapshot rendering and intent dispatch.
todos:
  - id: phase1-engine-shell
    content: Create engine scaffold and useSyncExternalStore snapshot adapter with no behavior change.
    status: completed
  - id: phase2-sim-loop-migration
    content: Move fixed-step simulation and movement stepping ownership from GameCanvas into engine runtime.
    status: completed
  - id: phase3-subscriptions-migration
    content: Extract non-spatial, spatial, and UI SpacetimeDB subscriptions into engine adapters and remove direct component subscriptions.
    status: completed
  - id: phase4-snapshot-selectors
    content: Replace large runtime prop-drilling with engine snapshot selectors and intent dispatch.
    status: completed
  - id: phase5-legacy-removal
    content: Remove legacy runtime orchestration hooks, finalize boundary cleanup, and document architecture.
    status: completed
  - id: phase6-validation
    content: Run parity and performance validation gates after each phase and adjust snapshot emission granularity.
    status: completed
isProject: false
---

# Engine-First Runtime Migration Plan

## Goals

- Move simulation timing, networking subscriptions, prediction/reconciliation, and world mutation behind an engine boundary.
- Keep React as a thin UI layer that consumes snapshots and dispatches intents.
- Preserve gameplay behavior while reducing render churn, prop-drilling, and orchestration complexity.

## Current Gaps To Close

- Runtime orchestration is spread across React layers:
  - [client/src/App.tsx](client/src/App.tsx)
  - [client/src/components/GameScreen.tsx](client/src/components/GameScreen.tsx)
  - [client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx)
- Data subscriptions and high-frequency state updates are React-hook managed:
  - [client/src/hooks/useSpacetimeTables.ts](client/src/hooks/useSpacetimeTables.ts)
  - [client/src/hooks/useUISubscriptions.ts](client/src/hooks/useUISubscriptions.ts)
- Canvas runtime includes loop + direct subscription concerns that should belong to engine.

## Target Architecture

```mermaid
flowchart LR
  uiReact[ReactUI] -->|dispatch(intent)| runtimeEngine[RuntimeEngine]
  runtimeEngine -->|subscribe(listener)| uiStore[UiSnapshotStore]
  runtimeEngine --> simLoop[SimulationLoop]
  runtimeEngine --> netAdapter[SpacetimeAdapter]
  runtimeEngine --> worldState[WorldStateInternal]
  simLoop --> worldState
  netAdapter --> worldState
  uiStore --> gameScreen[GameScreen]
  uiStore --> gameCanvas[GameCanvasRenderAdapter]
```



## Phase 1: Establish Engine Shell (No Behavior Change)

- Add engine module scaffold in `client/src/engine/**`:
  - [client/src/engine/runtimeEngine.ts](client/src/engine/runtimeEngine.ts)
  - [client/src/engine/types.ts](client/src/engine/types.ts)
  - [client/src/engine/store/uiSnapshotStore.ts](client/src/engine/store/uiSnapshotStore.ts)
- Define minimal public API:
  - `start(config)`
  - `stop()`
  - `dispatch(intent)`
  - `getSnapshot()`
  - `subscribe(listener)`
- Add a React adapter hook with `useSyncExternalStore`:
  - [client/src/engine/react/useEngineSnapshot.ts](client/src/engine/react/useEngineSnapshot.ts)
- Keep old hooks active; engine runs in shadow mode for observability only.

## Phase 2: Move Simulation Ownership Into Engine

- Relocate frame loop ownership from `GameCanvas` into engine:
  - Extract fixed-step + accumulator logic currently in [client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx).
- Engine becomes the only owner of `stepPredictedMovement` cadence and simulation clock.
- `GameCanvas` becomes render adapter:
  - receives render-state snapshot and pointer/canvas events
  - no simulation scheduling decisions.
- Add parity checks (dev-only counters) comparing old/new predicted position for a short transition window.

## Phase 3: Move Subscription Ownership Into Engine Adapters

- Split subscription concerns into engine adapters:
  - [client/src/engine/adapters/spacetime/spatialSubscriptions.ts](client/src/engine/adapters/spacetime/spatialSubscriptions.ts)
  - [client/src/engine/adapters/spacetime/nonSpatialSubscriptions.ts](client/src/engine/adapters/spacetime/nonSpatialSubscriptions.ts)
  - [client/src/engine/adapters/spacetime/uiSubscriptions.ts](client/src/engine/adapters/spacetime/uiSubscriptions.ts)
- Reuse existing query strategy from [client/src/hooks/useSpacetimeTables.ts](client/src/hooks/useSpacetimeTables.ts) and [client/src/hooks/useUISubscriptions.ts](client/src/hooks/useUISubscriptions.ts), but write into engine state (not React state maps).
- Remove direct DB subscription side effects from [client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx).

## Phase 4: Replace Prop-Drilled Runtime Surface With Snapshot Selectors

- Replace giant runtime props from [client/src/App.tsx](client/src/App.tsx) -> [client/src/components/GameScreen.tsx](client/src/components/GameScreen.tsx) -> [client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx) with narrow selectors:
  - `useEngineSnapshot(selectRenderSlice)` for canvas
  - `useEngineSnapshot(selectUiSlice)` for menus/chat/quests/notifications
- Move intent entry points to engine dispatchers (`movement`, `interaction`, `placement`, `menu intents`, etc.).
- Keep component-local presentation state local (menu open/close UI only), but remove authoritative runtime data from React state.

## Phase 5: Remove Legacy Runtime Hooks and Finalize Boundaries

- Deprecate old runtime orchestration paths in:
  - [client/src/App.tsx](client/src/App.tsx)
  - [client/src/hooks/useSpacetimeTables.ts](client/src/hooks/useSpacetimeTables.ts)
  - [client/src/hooks/useUISubscriptions.ts](client/src/hooks/useUISubscriptions.ts)
- Retain or adapt reusable pure helpers/utilities where they reduce risk.
- Document ownership rules and migration notes in [README.md](README.md) runtime section.

## Performance Guardrails and Acceptance Criteria

- Functional parity:
  - Player movement, interaction, combat, placement, and UI notifications match current behavior.
- Runtime metrics (before/after capture in dev):
  - Fewer React renders in `App`/`GameScreen` during movement/combat.
  - Stable frame pacing during chunk boundary transitions.
  - No increase in subscription churn or memory growth during 15+ minute play session.
- Boundary checks:
  - No direct gameplay SpacetimeDB subscriptions in React UI components.
  - No React-driven gameplay RAF loop.

## Risks and Mitigations

- Risk: Behavior regressions from ownership migration.
  - Mitigation: shadow mode + parity logging in Phases 1-2 before cutover.
- Risk: Large diff blast radius.
  - Mitigation: move by concern (loop, then subscriptions, then props) with compile-safe adapters.
- Risk: Snapshot over-notification.
  - Mitigation: selector-based snapshots + change-based emission in engine store.

## Delivery Strategy

- Ship as incremental PRs aligned to phases (1 PR per phase, optionally split Phase 3/4).
- Validate each phase with manual gameplay smoke tests and lightweight render/subscription telemetry before advancing.

