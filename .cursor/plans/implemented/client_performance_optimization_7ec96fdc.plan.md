---
name: Client Performance Optimization
overview: Reduce client-side lag during walking, sprinting, and combat by eliminating unnecessary React re-renders, throttling expensive per-frame computations, and optimizing canvas rendering for dense entity scenes.
todos:
  - id: phase1a
    content: Throttle useInteractionFinder RAF loop to every 3rd frame (~20Hz)
    status: completed
  - id: phase1b
    content: Consolidate useInteractionFinder 20+ useState into single ref + one setState trigger
    status: completed
  - id: phase1c
    content: Move minimapDroneFrame from useState to useRef in GameCanvas
    status: completed
  - id: phase1d
    content: Remove forceUpdate from dodge-roll path in usePredictedMovement
    status: completed
  - id: phase2a
    content: Stabilize viewBounds with 16px movement threshold in useEntityFiltering
    status: completed
  - id: phase2b
    content: Replace Array.from().filter() with direct iteration for remaining entity useMemo hooks
    status: completed
  - id: phase2c
    content: Replace isEntityInView type-detection chain with typed isInView(x,y,w,h) helper
    status: completed
  - id: phase3a
    content: Cache gradient objects in lightRenderingUtils and playerRenderingUtils
    status: completed
  - id: phase3b
    content: Cache ctx.measureText results for player name labels
    status: completed
  - id: phase3c
    content: Move swimming-player re-sort from renderGame to useEntityFiltering
    status: completed
  - id: phase3d
    content: Replace spread-operator object creation in render hot path with reusable scratch objects
    status: completed
  - id: phase4a
    content: Add queueMicrotask batching for non-ref-batched entity inserts in useSpacetimeTables
    status: completed
  - id: phase4b
    content: Move frequently-changing renderGame dependencies to refs to reduce callback recreation
    status: completed
isProject: false
---

# Client Performance Optimization Plan

## Root Causes Identified

Profiling the rendering pipeline reveals four categories of bottleneck, ordered by expected impact:

1. **Per-frame React re-render triggers** -- hooks that call `setState` on every animation frame, causing React reconciliation to compete with the game loop for main-thread time.
2. **Expensive recomputation on camera movement** -- `useEntityFiltering` has ~50 `useMemo` hooks that cascade-recompute whenever `viewBounds` changes (i.e. every frame the player walks).
3. **O(N) interaction scanning every frame** -- `useInteractionFinder` iterates every entity of 20+ types every RAF tick.
4. **Canvas rendering overhead** -- per-entity gradient creation, text measurement, and array allocation in the draw loop.

Production is worse than localhost because more concurrent players, buildings, and animals increase entity counts (scaling all four categories) and network bursts of entity updates each trigger individual `setState` calls.

---

## Phase 1: Stop Unnecessary React Re-renders

These changes alone should produce the most noticeable improvement because they eliminate main-thread stalls during movement and combat.

### 1a. Throttle `useInteractionFinder` to every 3rd frame

Currently runs its full O(N) scan every RAF tick (~60/sec). Walking past entities causes its 20+ `useState` setters to fire, each triggering a React re-render of GameCanvas's parent.

**File:** [client/src/hooks/useInteractionFinder.ts](client/src/hooks/useInteractionFinder.ts)

- Add a frame counter inside the RAF loop. Only call `updateCallbackRef.current()` every 3rd frame (~20Hz is still instant-feeling for interaction prompts).
- This alone cuts the interaction scan cost by ~66%.

```typescript
// Line ~1374
let frameSkip = 0;
const updateLoop = () => {
    if (++frameSkip % 3 === 0) {
        updateCallbackRef.current();
    }
    animationFrameId = requestAnimationFrame(updateLoop);
};
```

### 1b. Consolidate `useInteractionFinder` state into a single ref + one setState

The hook currently has ~20 individual `useState` hooks (lines 270-291). When multiple closest-entity IDs change in the same scan, each `setState` is a separate React update.

- Replace all 20 `useState` hooks with a single `useRef<InteractionState>` object.
- Keep one `useState` counter that increments only when the ref actually changes (debounced to at most 1 update per 3 frames via the throttle above).
- Consumers read from the ref or the single state update.

### 1c. Move `minimapDroneFrame` to a ref

**File:** [client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx), line 551

`setMinimapDroneFrame` is called every frame when drones are active, triggering a full React re-render of GameCanvas. The minimap rendering already happens inside the canvas draw loop, so it can read from a ref.

```typescript
// Replace:
const [minimapDroneFrame, setMinimapDroneFrame] = useState(0);
// With:
const minimapDroneFrameRef = useRef(0);
```

Update the drone animation tick and minimap rendering code to use the ref.

### 1d. Remove `forceUpdate` from dodge-roll path in `usePredictedMovement`

**File:** [client/src/hooks/usePredictedMovement.ts](client/src/hooks/usePredictedMovement.ts), line 356

During dodge rolls, `forceUpdate({})` fires every frame (~30 re-renders in 500ms). The canvas already reads position from `clientPositionRef` and `predictedPositionRef` directly. The comment says "for smooth camera tracking" but the camera offset is computed from `predictedPositionRef` in GameCanvas, not from React state.

- Remove the `forceUpdate({})` call on line 356.
- Verify the camera offset calculation in GameCanvas reads from `predictedPositionRef` (it does -- line 2563).

---

## Phase 2: Reduce Entity Filtering Cost

### 2a. Stabilize `viewBounds` with a movement threshold

**File:** [client/src/hooks/useEntityFiltering.ts](client/src/hooks/useEntityFiltering.ts), lines 779-787, 967

Currently `getViewportBounds` is a `useCallback` depending on `cameraOffsetX/Y`, and `viewBounds` is a `useMemo(() => getViewportBounds(), [getViewportBounds])`. Every pixel of camera movement recreates viewBounds, which is a dependency for ~40 visible-entity `useMemo` hooks.

- Add a threshold: only update `viewBounds` when the camera has moved more than half a tile (~16px). Store the last-committed bounds in a ref. This means ~40 `useMemo` hooks skip recomputation for small camera changes.

```typescript
const viewBoundsRef = useRef<ViewportBounds | null>(null);
const viewBounds = useMemo(() => {
    const fresh = getViewportBounds();
    const prev = viewBoundsRef.current;
    if (prev &&
        Math.abs(fresh.viewMinX - prev.viewMinX) < 16 &&
        Math.abs(fresh.viewMinY - prev.viewMinY) < 16) {
        return prev; // same reference = downstream useMemo skips
    }
    viewBoundsRef.current = fresh;
    return fresh;
}, [cameraOffsetX, cameraOffsetY, canvasWidth, canvasHeight]);
```

### 2b. Replace `Array.from(map.values()).filter()` with direct iteration

**File:** [client/src/hooks/useEntityFiltering.ts](client/src/hooks/useEntityFiltering.ts), lines 1032-1180

Many entity types use this pattern:

```typescript
const visibleDroppedItems = useMemo(() =>
    droppedItems ? Array.from(droppedItems.values()).filter(e => isEntityInView(e, viewBounds, stableTimestamp)) : [],
    [droppedItems, isEntityInView, viewBounds, stableTimestamp]
);
```

`Array.from()` allocates a full intermediate array before filtering. For smaller entity types this is fine, but it adds up across ~30 entity types.

- For entity types already using `getCachedFilteredEntities` (trees, stones, resources): no change needed, they already cache.
- For the remaining ~25 entity types: replace `Array.from(map.values()).filter(...)` with a push-to-preallocated-array loop. This avoids the intermediate array.

### 2c. Batch `isEntityInView` type detection

**File:** [client/src/hooks/useEntityFiltering.ts](client/src/hooks/useEntityFiltering.ts), lines 789-963

The `isEntityInView` function uses a long `if/else if` chain with runtime type checks (`isPlayer(entity)`, `isTree(entity)`, duck-typing with `(entity as any).fuelInventoryId`, etc.) for every entity. Since each `useMemo` already knows the entity type (it operates on a typed Map), pass the entity dimensions directly instead of re-detecting the type.

- Add a helper: `isInView(x, y, w, h, bounds)` that takes coordinates and dimensions.
- Each `useMemo` calls it with the known dimensions for that entity type.

---

## Phase 3: Canvas Rendering Optimizations

### 3a. Cache gradient objects across frames

**Key files:** [client/src/utils/renderers/lightRenderingUtils.ts](client/src/utils/renderers/lightRenderingUtils.ts), [client/src/utils/renderers/playerRenderingUtils.ts](client/src/utils/renderers/playerRenderingUtils.ts)

Light rendering creates 50+ `createRadialGradient()` calls per frame. Gradients with identical parameters can be cached in a module-level `Map<string, CanvasGradient>` keyed by `${x},${y},${r0},${r1}`. Invalidate the cache when the canvas context changes (e.g., resize).

### 3b. Cache text measurements

**Key file:** [client/src/utils/renderers/playerRenderingUtils.ts](client/src/utils/renderers/playerRenderingUtils.ts)

`ctx.measureText(playerName)` is called per player per frame. Player names don't change often. Cache measurements in a `Map<string, TextMetrics>` and invalidate when font changes.

### 3c. Move swimming-player re-sort out of the render loop

**File:** [client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx), lines 3351-3743

When swimming players exist, the render function creates new arrays with `.filter()`, `.map()`, and spreads objects with `{ ...e, _ySort }` every frame. Move this logic to `useEntityFiltering` so it is computed alongside the Y-sort (which already runs at ~7.5Hz), not at 60Hz in the draw call.

### 3d. Eliminate object allocation in the render hot path

**File:** [client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx), lines 3376-3396

Replace spread-operator object creation (`{ ...player, positionX: interp.x }`) with a reusable object pool or by mutating a scratch object that is reset each frame.

---

## Phase 4: Production-Specific Improvements

### 4a. Batch SpacetimeDB entity inserts per subscription event

**File:** [client/src/hooks/useSpacetimeTables.ts](client/src/hooks/useSpacetimeTables.ts)

When a chunk subscription resolves, multiple `onInsert` callbacks fire in rapid succession. Each calls `setTrees(prev => new Map(prev).set(...))`, creating a new Map per entity. React 18 batches these within the same microtask, but SpacetimeDB callbacks may span multiple microtasks.

- For non-ref-batched entity types (trees, stones, campfires, etc.), add a microtask-batching layer: accumulate inserts in a buffer and flush once per `queueMicrotask`. This collapses N individual Map copies into 1.

```typescript
const treeBatchRef = useRef<SpacetimeDB.Tree[]>([]);
const treeFlushScheduled = useRef(false);

const handleTreeInsert = (ctx: any, tree: SpacetimeDB.Tree) => {
    treeBatchRef.current.push(tree);
    if (!treeFlushScheduled.current) {
        treeFlushScheduled.current = true;
        queueMicrotask(() => {
            const batch = treeBatchRef.current;
            treeBatchRef.current = [];
            treeFlushScheduled.current = false;
            setTrees(prev => {
                const next = new Map(prev);
                for (const t of batch) next.set(t.id.toString(), t);
                return next;
            });
        });
    }
};
```

### 4b. Reduce `renderGame` dependency array churn

**File:** [client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx), lines 5040-5072

The `renderGame` `useCallback` has ~30 dependencies. Several are state values that change often (e.g., `messages`, `projectiles`, `closestInteractableHarvestableResourceId`). Each recreation of `renderGame` recreates `gameLoopCallback`, which restarts `useGameLoop`.

- Move remaining frequently-changing values into refs (similar to the existing pattern for `cameraOffsetRef`, `ySortedEntitiesRef`, etc.).
- Target: reduce the dependency array to only truly stable values (image refs, canvas size, feature flags).

---

## Expected Impact


| Phase                         | Effort     | Impact on Walking/Sprinting Lag                                |
| ----------------------------- | ---------- | -------------------------------------------------------------- |
| Phase 1 (re-renders)          | Medium     | High -- eliminates the main source of main-thread stalls       |
| Phase 2 (entity filtering)    | Medium     | Medium -- reduces per-frame computation during camera movement |
| Phase 3 (canvas rendering)    | Medium     | Medium -- reduces draw-call overhead in dense areas            |
| Phase 4 (production batching) | Low-Medium | Medium -- reduces burst re-render storms from network updates  |


## Implementation Order

Phases 1 and 2 should be done first (highest impact for the described lag). Phases 3 and 4 can follow incrementally. Each phase is independently testable.