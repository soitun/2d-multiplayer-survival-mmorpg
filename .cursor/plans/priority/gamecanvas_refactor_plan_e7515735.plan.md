---
name: GameCanvas Refactor Plan
overview: Refactor the 4300-line GameCanvas.tsx component into smaller, maintainable modules following DRY principles while preserving all existing functionality. The refactor focuses on extracting rendering orchestration, consolidating asset loading, and reducing prop drilling through strategic context usage.
todos:
  - id: phase1-swimming
    content: Extract useSwimmingPlayerRenderer hook from swimming player rendering logic (lines 2380-2953)
    status: pending
  - id: phase1-overlays
    content: Extract useOverlayRenderer hook for rain, weather, health, frost, broth, insanity overlays (lines 3320-3449)
    status: pending
  - id: phase1-lights
    content: Extract useLightRenderer hook for campfire, lantern, furnace, barbecue, player lights (lines 3581-3685)
    status: pending
  - id: phase1-indicators
    content: Extract useInteractionIndicatorRenderer hook for hold interaction indicators (lines 3451-3579)
    status: pending
  - id: phase2-assets
    content: Expand useAssetLoader to load ALL images (doodads, foundations, minimap icons) - consolidate lines 1571-1782
    status: pending
  - id: phase3-reducers
    content: Extract useReducerCallbacks hook for all reducer callback registration (lines 1312-1547)
    status: pending
  - id: phase4-minimap
    content: Extract useMinimapRenderer hook for minimap rendering logic (lines 3957-4065)
    status: pending
  - id: phase5-context
    content: "Optional: Create GameEntitiesContext to reduce prop drilling for entity maps"
    status: pending
---

# GameCanvas.tsx Refactoring Plan

## Current Issues Identified

### 1. Massive renderGame Callback (~1600 lines)

The `renderGame` useCallback contains all rendering logic in a single function, making it hard to maintain, debug, and optimize.

### 2. Prop Explosion (100+ props)

The `GameCanvasProps` interface has grown to 100+ props, making the component interface unwieldy and causing excessive prop drilling.

### 3. Duplicated Patterns

- **Asset loading**: Same pattern repeated 20+ times for dynamic image imports (lines 1571-1782)
- **Reducer callbacks**: Similar error handling patterns repeated for 15+ reducers (lines 1312-1547)
- **Swimming player rendering**: Bottom/top half logic duplicated with minor variations (lines 2380-2953)
- **Indicator drawing**: Same `drawIndicatorIfNeeded` pattern for each entity type

### 4. Too Many Responsibilities

GameCanvas handles: rendering, input, subscriptions, minimap, death screen, building system, mobile interactions, and 15+ effects.

### 5. Performance Inefficiencies

- Large dependency arrays causing callback recreation
- Y-sorting with swimming players re-merged every frame
- Water tile lookup computed fresh each frame (though memoized correctly)

---

## Refactoring Strategy (Phased Approach)

### Phase 1: Extract Rendering Orchestration (Lowest Risk)

Create focused hooks that encapsulate rendering logic without changing data flow.

#### 1.1 Create `useSwimmingPlayerRenderer` Hook

Extract lines 2380-2953 - the complex swimming player split rendering.

```typescript
// hooks/useSwimmingPlayerRenderer.ts
interface SwimmingPlayerRendererParams {
  ctx: CanvasRenderingContext2D;
  players: Map<string, Player>;
  localPlayerId?: string;
  predictedPosition: { x: number; y: number } | null;
  remotePlayerInterpolation: any;
  // ... other needed params
}

export function useSwimmingPlayerRenderer(): {
  renderSwimmingBottomHalves: (params: SwimmingPlayerRendererParams) => void;
  renderSwimmingTopHalves: (params: SwimmingPlayerRendererParams) => void;
  getSwimmingPlayers: (players: Map<string, Player>) => Player[];
}
```



#### 1.2 Create `useOverlayRenderer` Hook

Extract overlay rendering (lines 3320-3449): rain, weather, health, frost, broth effects, insanity.

```typescript
// hooks/useOverlayRenderer.ts
export function useOverlayRenderer(): {
  renderAllOverlays: (ctx, params) => void;
}
```



#### 1.3 Create `useLightRenderer` Hook

Extract light rendering (lines 3581-3685): campfire, lantern, furnace, barbecue, player lights.

```typescript
// hooks/useLightRenderer.ts
export function useLightRenderer(): {
  renderAllLights: (ctx, params) => void;
}
```



#### 1.4 Create `useInteractionIndicatorRenderer` Hook

Extract indicator rendering (lines 3451-3579): the repeated `drawIndicatorIfNeeded` pattern.

```typescript
// hooks/useInteractionIndicatorRenderer.ts
export function useInteractionIndicatorRenderer(): {
  renderIndicators: (ctx, params) => void;
}
```

---

### Phase 2: Consolidate Asset Loading

#### 2.1 Expand `useAssetLoader` Hook

The existing `useAssetLoader.ts` only loads hero sprites. Expand it to load ALL images:

- Doodad images (planted_seed, doors, barbecue, etc.) - currently lines 1571-1782
- Foundation tile images
- Minimap icon images (pin marker, warmth, torch)
```typescript
// hooks/useAssetLoader.ts (expanded)
export function useAssetLoader() {
  // Existing hero sprites
  const heroImageRef = ...;
  
  // NEW: Doodad images
  const doodadImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  
  // NEW: Foundation tiles
  const foundationTileImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  
  // NEW: Minimap icons
  const minimapIconsRef = useRef<{
    pinMarker: HTMLImageElement | null;
    campfireWarmth: HTMLImageElement | null;
    torchOn: HTMLImageElement | null;
  }>({ pinMarker: null, campfireWarmth: null, torchOn: null });
  
  // Single useEffect that loads all images
  useEffect(() => {
    const loadImage = (src: string): Promise<HTMLImageElement> => {...};
    // Batch load all images
  }, []);
  
  return {
    heroImageRef, heroSprintImageRef, ...,
    doodadImagesRef,
    foundationTileImagesRef,
    minimapIconsRef,
  };
}
```


---

### Phase 3: Extract Reducer Callback Management

#### 3.1 Create `useReducerCallbacks` Hook

Extract all reducer callback registration (lines 1312-1547) into a dedicated hook:

```typescript
// hooks/useReducerCallbacks.ts
export function useReducerCallbacks(connection: DbConnection | null) {
  useEffect(() => {
    if (!connection) return;
    
    // Consume item handler
    const handleConsumeItem = (ctx, itemInstanceId) => {...};
    
    // Apply fertilizer handler  
    const handleApplyFertilizer = (ctx, fertilizerInstanceId) => {...};
    
    // Building handlers
    const handleDestroyFoundation = (ctx, foundationId) => {...};
    const handleDestroyWall = (ctx, wallId) => {...};
    const handleUpgradeFoundation = (ctx, foundationId, newTier) => {...};
    const handleUpgradeWall = (ctx, wallId, newTier) => {...};
    
    // Projectile handlers
    const handleFireProjectile = (ctx, x, y) => {...};
    const handleLoadRangedWeapon = (ctx) => {...};
    
    // Placement handlers (generic pattern)
    const handlePlacementError = (ctx, itemName) => {...};
    
    // Register all callbacks
    connection.reducers.onConsumeItem(handleConsumeItem);
    // ... register rest
    
    return () => {
      // Cleanup all callbacks
    };
  }, [connection]);
}
```

---

### Phase 4: Extract Minimap System

#### 4.1 Create `useMinimapRenderer` Hook

Extract minimap rendering logic (lines 3957-4065) into its own hook:

```typescript
// hooks/useMinimapRenderer.ts
export function useMinimapRenderer(params: MinimapRendererParams) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!isMinimapOpen || !canvasRef.current) return;
    // All minimap rendering logic
  }, [dependencies]);
  
  return { canvasRef };
}
```

---

### Phase 5: Simplify Props with Context (Higher Risk - Optional)

#### 5.1 Create `GameEntitiesContext`

Reduce prop drilling by providing entity maps via context:

```typescript
// contexts/GameEntitiesContext.tsx
interface GameEntitiesContextValue {
  players: Map<string, Player>;
  trees: Map<string, Tree>;
  stones: Map<string, Stone>;
  // ... all entity maps
}

export const GameEntitiesContext = createContext<GameEntitiesContextValue | null>(null);

export function useGameEntities() {
  const ctx = useContext(GameEntitiesContext);
  if (!ctx) throw new Error('useGameEntities must be used within GameEntitiesProvider');
  return ctx;
}
```

This would be applied at [App.tsx](client/src/App.tsx) level, wrapping GameScreen.---

## File Structure After Refactor

```javascript
client/src/
├── hooks/
│   ├── useAssetLoader.ts              # Expanded - loads ALL images
│   ├── useSwimmingPlayerRenderer.ts   # NEW
│   ├── useOverlayRenderer.ts          # NEW
│   ├── useLightRenderer.ts            # NEW
│   ├── useInteractionIndicatorRenderer.ts  # NEW
│   ├── useReducerCallbacks.ts         # NEW
│   ├── useMinimapRenderer.ts          # NEW
│   └── ... existing hooks
├── contexts/
│   ├── DebugContext.tsx               # Existing
│   └── GameEntitiesContext.tsx        # NEW (Phase 5)
└── components/
    └── GameCanvas.tsx                 # Simplified orchestrator
```

---

## Estimated Line Count Impact

| Section | Current | After Refactor |

|---------|---------|----------------|

| renderGame callback | ~1600 | ~400 |

| Asset loading effects | ~200 | ~20 (uses expanded useAssetLoader) |

| Reducer callbacks | ~250 | ~10 (uses useReducerCallbacks) |

| Minimap rendering | ~150 | ~20 (uses useMinimapRenderer) |

| Props interface | 130 | 80 (with context) or 130 (without) |

| **Total GameCanvas** | **~4300** | **~1500-2000** |---

## Performance Improvements

1. **Smaller dependency arrays**: Split callbacks mean fewer dependencies per callback
2. **Better memoization**: Isolated hooks can memoize their specific outputs
3. **Reduced callback recreation**: renderGame won't recreate when unrelated deps change
4. **Cleaner profiling**: Each hook can be profiled independently

---

## Migration Safety

1. **No behavioral changes**: Each extraction preserves exact current behavior
2. **Incremental rollout**: Each phase can be merged separately
3. **Easy rollback**: If a hook causes issues, inline it back temporarily
4. **Type safety**: TypeScript ensures interface compatibility at each step

---

## Implementation Order

1. `useAssetLoader` expansion (quick win, removes ~150 lines)
2. `useReducerCallbacks` (quick win, removes ~250 lines)
3. `useSwimmingPlayerRenderer` (complex but isolated)
4. `useLightRenderer` (straightforward extraction)
5. `useOverlayRenderer` (straightforward extraction)
6. `useInteractionIndicatorRenderer` (straightforward extraction)
7. `useMinimapRenderer` (optional, already somewhat isolated)