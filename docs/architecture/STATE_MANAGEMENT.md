# State Management Patterns

This document describes how state is managed and flows through the client application.

## State Categories

### 1. Server-Authoritative State
Data owned by the SpacetimeDB server:
- Player positions, health, inventory
- World entities (trees, stones, campfires)
- Game state (time of day, weather)

### 2. Client-Derived State
State computed from server data:
- Visible entities (filtered by viewport)
- Y-sorted render order
- Interpolated positions

### 3. Client-Only State
State that exists only on the client:
- UI state (menus, panels open/closed)
- Input state (keys pressed)
- Predicted movement position
- Animation frames

## State Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SpacetimeDB Server                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│  │ Players │ │  Trees  │ │Campfires│ │  Items  │  ...           │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘                │
└───────┼───────────┼───────────┼───────────┼─────────────────────┘
        │           │           │           │
        └───────────┴───────────┴───────────┘
                          │
                    WebSocket Sync
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              useSpacetimeTables Hook                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │ players: Map │ │  trees: Map  │ │campfires: Map│  ...        │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘             │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
                     Props Passed
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      App.tsx                                     │
│  Orchestrates all state, passes to GameScreen                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │predictedPos  │ │placementInfo │ │interactingWith│ ...        │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘             │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
                     Props Passed
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GameScreen.tsx                                │
│  Distributes state to UI components                             │
│                          │                                       │
│     ┌────────────────────┼────────────────────┐                 │
│     ▼                    ▼                    ▼                 │
│ ┌──────────┐       ┌──────────┐        ┌──────────┐             │
│ │GameCanvas│       │ PlayerUI │        │   Chat   │             │
│ └──────────┘       └──────────┘        └──────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Context Providers

### AuthContext
Manages OpenAuth authentication:
```typescript
const { 
    isAuthenticated,
    userProfile,
    spacetimeToken,
    loginRedirect,
    logout,
    invalidateCurrentToken
} = useAuth();
```

### GameConnectionContext
Manages SpacetimeDB connection:
```typescript
const {
    connection,
    dbIdentity,
    isConnected,
    isLoading,
    error,
    registerPlayer,
    retryConnection
} = useGameConnection();
```

### PlayerActionsContext
Provides game action reducers:
```typescript
const {
    updatePlayerPosition,
    setSprinting,
    toggleCrouch,
    updateViewport,
    // ... more actions
} = usePlayerActions();
```

### DebugContext
Development debugging toggles:
```typescript
const {
    showChunkBoundaries,
    showCollisionDebug,
    toggleCollisionDebug
} = useDebug();
```

## Map-Based Entity Storage

Entities are stored in Maps for O(1) lookup:

```typescript
// In useSpacetimeTables
const [players, setPlayers] = useState<Map<string, Player>>(() => new Map());

// Insert/Update handler
const handlePlayerInsert = (ctx, player) => {
    setPlayers(prev => {
        const newMap = new Map(prev);
        newMap.set(player.identity.toHexString(), player);
        return newMap;
    });
};

// Lookup
const localPlayer = players.get(localPlayerId);
```

## Client Prediction

### Movement Prediction
The `usePredictedMovement` hook provides smooth movement:

```typescript
const { predictedPosition, facingDirection } = usePredictedMovement({
    localPlayer,          // Server-authoritative position
    inputState,           // Current input (WASD keys)
    connection,
    entities              // For collision detection
});

// predictedPosition is updated every frame based on input
// Server position is reconciled when updates arrive
```

### Prediction Pattern
```
1. User presses movement key
2. Client immediately updates predictedPosition
3. Client sends position update to server
4. Server validates and broadcasts
5. Client receives server position
6. Client reconciles predicted vs actual position
```

## Specialized State Managers

### usePlacementManager
Manages item/structure placement state:
```typescript
const [placementState, placementActions] = usePlacementManager(connection);
const { placementInfo, placementError } = placementState;
const { startPlacement, cancelPlacement, confirmPlacement } = placementActions;
```

### useDragDropManager
Manages inventory drag and drop:
```typescript
const { draggedItemInfo, dropError, handleItemDragStart, handleItemDrop } = 
    useDragDropManager({ connection, interactingWith, playerIdentity });
```

### useInteractionManager
Manages interaction target state:
```typescript
const { interactingWith, handleSetInteractingWith } = useInteractionManager();
// interactingWith: { type: 'campfire', id: 123 } | null
```

### useBuildingManager
Manages building system state:
```typescript
const {
    buildingMode,
    selectedTier,
    selectedShape,
    startBuilding,
    cancelBuilding
} = useBuildingManager();
```

## State Update Patterns

### 1. Immutable Updates
Always create new objects/maps:
```typescript
// Bad - mutating existing map
players.set(id, newPlayer);
setPlayers(players);

// Good - creating new map
setPlayers(prev => {
    const newMap = new Map(prev);
    newMap.set(id, newPlayer);
    return newMap;
});
```

### 2. Optimistic Updates
For responsive UI during server round-trips:
```typescript
// Update UI immediately
setPredictedPosition({ x, y });

// Send to server
connection.reducers.updatePosition(x, y);

// Server will confirm or correct
```

### 3. Debounced Updates
For high-frequency changes:
```typescript
const debouncedViewportUpdate = useDebouncedCallback(
    (viewport) => updateViewport(viewport),
    250 // 250ms debounce
);
```

### 4. Ref-Based Values
For values that change frequently but don't need re-renders:
```typescript
const frameTimeRef = useRef<number>(0);
const lastPositionRef = useRef<{x: number, y: number} | null>(null);

// Update without triggering render
frameTimeRef.current = deltaTime;
```

## Derived State with useMemo

Compute derived state efficiently:

```typescript
// Filter visible entities
const visibleTrees = useMemo(() => {
    return Array.from(trees.values()).filter(tree => 
        isInViewport(tree, viewBounds)
    );
}, [trees, viewBounds]);

// Y-sort for rendering
const ySortedEntities = useMemo(() => {
    return [...visibleTrees, ...visiblePlayers].sort((a, b) => a.y - b.y);
}, [visibleTrees, visiblePlayers]);
```

## State Persistence

### Local Storage
For user preferences:
```typescript
const [musicVolume, setMusicVolume] = useState(() => {
    const saved = localStorage.getItem('musicVolume');
    return saved ? parseFloat(saved) : 0.5;
});

useEffect(() => {
    localStorage.setItem('musicVolume', musicVolume.toString());
}, [musicVolume]);
```

### Session Storage
For temporary session data:
```typescript
// Store last known player info for reconnection
useEffect(() => {
    if (loggedInPlayer) {
        localStorage.setItem('lastKnownPlayerInfo', JSON.stringify({
            identity: dbIdentity.toHexString(),
            username: loggedInPlayer.username
        }));
    }
}, [loggedInPlayer]);
```

## Error State Management

### Connection Errors
```typescript
const [connectionError, setConnectionError] = useState<string | null>(null);

// Display combined errors
const displayError = connectionError || uiError || placementError;
{displayError && <ErrorBar message={displayError} />}
```

### UI Error Clearing
Auto-clear errors after timeout:
```typescript
useEffect(() => {
    if (uiError) {
        const timer = setTimeout(() => setUiError(null), 5000);
        return () => clearTimeout(timer);
    }
}, [uiError]);
```

## Best Practices

1. **Single Source of Truth:** Server data is authoritative
2. **Minimize Global State:** Use local state where possible
3. **Explicit Dependencies:** Use prop drilling rather than hidden globals
4. **Memoize Expensive Computations:** Use `useMemo` for filtering/sorting
5. **Debounce High-Frequency Updates:** Avoid excessive network calls
6. **Use Refs for Non-Rendering Updates:** Animation frames, timers
7. **Immutable Updates:** Always create new objects for state updates

