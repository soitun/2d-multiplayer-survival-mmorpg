---
name: client-performance-hardening
overview: Optimize the current React/canvas client runtime for measurable FPS and GC improvements without changing gameplay semantics or touching server logic.
todos:
  - id: phase1-hotpath
    content: Apply hot-path allocation/loop optimizations in GameCanvas, useEntityFiltering, renderingUtils with no behavior changes
    status: pending
  - id: phase2-react
    content: Contain rerenders in GameScreen/InterfaceContainer via prop identity stabilization and memo boundaries
    status: pending
  - id: phase3-input-state
    content: Optimize input idle paths and table/interpolation update churn in hooks
    status: pending
  - id: phase4-validate
    content: Profile before/after each phase and run gameplay parity checks
    status: pending
isProject: false
---

# Client Performance Optimization Plan (No Server Changes)

## Scope

- Client-only optimization across these engine files:
  - [c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\components\GameCanvas.tsx](c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\components\GameCanvas.tsx)
  - [c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\useGameLoop.ts](c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\useGameLoop.ts)
  - [c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\useEntityFiltering.ts](c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\useEntityFiltering.ts)
  - [c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\useInputHandler.ts](c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\useInputHandler.ts)
  - [c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\useMovementInput.ts](c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\useMovementInput.ts)
  - [c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\usePredictedMovement.ts](c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\usePredictedMovement.ts)
  - [c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\useRemotePlayerInterpolation.ts](c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\useRemotePlayerInterpolation.ts)
  - [c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\useSpacetimeTables.ts](c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\hooks\useSpacetimeTables.ts)
  - [c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\utils\renderers\renderingUtils.ts](c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\utils\renderers\renderingUtils.ts)
  - [c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\components\GameScreen.tsx](c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\components\GameScreen.tsx)
  - [c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\components\InterfaceContainer.tsx](c:\WebProjects\vibe-coding-starter-pack-2d-multiplayer-survival\client\src\components\InterfaceContainer.tsx)

## Optimization Principles

- Preserve gameplay behavior and visuals.
- Prefer low-risk, measurable hot-path wins first.
- Roll out in phases with profiling checkpoints and quick rollback boundaries.

## Execution Phases

### Phase 1: Hot-path allocation and loop pressure (highest ROI, lowest risk)

- `GameCanvas.tsx`
  - Remove per-frame temporary array churn in particle/render subpasses by reusing ref-backed scratch arrays.
  - Eliminate avoidable `Array.from(...).filter(...)` in frame loops; iterate Maps directly.
  - Remove remaining object spreads in per-player frame code and use existing scratch objects consistently.
  - Batch canvas state changes (`save/restore`, smoothing/shadow toggles) per pass rather than per entity.
- `useEntityFiltering.ts`
  - Replace repeated `Array.from` + post-conversion Map builds with single-pass filtering that emits both list + map together.
- `renderingUtils.ts`
  - Collapse repeated multi-pass scans over `ySortedEntities` where possible into grouped single-pass categorization.

### Phase 2: React rerender containment and identity stability

- `GameScreen.tsx` + `InterfaceContainer.tsx`
  - Reduce prop churn by memoizing/stabilizing high-frequency object/function props passed to heavy children.
  - Apply `React.memo` to expensive children where prop stability can be guaranteed.
  - Split broad effects into narrower ones with minimal dependency surfaces.
- `usePredictedMovement.ts`
  - Remove/update forced rerender patterns that are not required for canvas-driven rendering paths.

### Phase 3: Input + state ingestion efficiency

- `useInputHandler.ts` + `useMovementInput.ts`
  - Add fast idle-path exits in per-frame input processing when no actionable input exists.
- `useSpacetimeTables.ts`
  - Guard map updates to avoid replacing state/maps when incoming row data is semantically unchanged.
- `useRemotePlayerInterpolation.ts`
  - Ensure interpolation state cleanup/update paths are allocation-light and batched where safe.

### Phase 4: Validation and guardrails

- Add perf checkpoints (frame time, GC pressure, rerender counts) before/after each phase.
- Validate no regressions in:
  - movement prediction/smoothing
  - y-sorting and depth layering
  - interaction prompts and hit/collision behavior
  - minimap and UI updates

## Measurement Targets

- Lower average frame time under stress scenes (many players/entities).
- Reduce GC spikes from per-frame allocations.
- Reduce React rerender frequency in GameScreen/UI coordination layer.
- Maintain visual parity and gameplay semantics.

## Rollout Safety

- Land changes in small, isolated commits per phase.
- Keep each optimization independently revertible.
- Prefer feature-flagged paths for any medium-risk refactors in `renderingUtils.ts`.

