# Client Architecture Overview

This document describes the high-level architecture of the React/TypeScript client for the 2D multiplayer survival game.

## Component Hierarchy

```
App.tsx (Root Application)
├── AuthProvider (Authentication Context)
│   └── GameContextsProvider (Game-specific Contexts)
│       └── DebugProvider (Development Debugging)
│           └── Router (React Router)
│               ├── AppContent (Main Game Logic)
│               │   ├── CyberpunkLoadingScreen
│               │   ├── LoginScreen
│               │   └── GameScreen
│               │       ├── GameCanvas (Core Rendering)
│               │       ├── PlayerUI (Inventory, Hotbar, Status)
│               │       ├── DayNightCycleTracker
│               │       ├── Chat
│               │       ├── SpeechBubbleManager
│               │       └── [Various Menus and Panels]
│               ├── BlogPage
│               ├── PrivacyPage / TermsPage / CookiesPage
```

## Core Application Files

### `App.tsx`
The main orchestrator that:
- Initializes all core hooks (connection, tables, placement, drag/drop, interaction)
- Manages top-level state (connection status, registration, viewport)
- Conditionally renders LoginScreen or GameScreen
- Handles global error display
- Coordinates movement input and prediction

### `GameScreen.tsx`
The main game view coordinator that:
- Receives all game state as props from App.tsx
- Composes GameCanvas, PlayerUI, and other UI components
- Manages menu state (main menu, settings, controls)
- Handles voice interface and SOVA integration
- Coordinates fishing, music, and ALK delivery systems

### `GameCanvas.tsx`
The rendering engine (~4000 lines) that:
- Manages the HTML5 Canvas rendering loop
- Performs Y-sorted entity rendering for isometric feel
- Handles viewport calculations and camera offsets
- Processes player input and interactions
- Renders all game entities (players, trees, buildings, etc.)

### `LoginScreen.tsx`
The entry point handling:
- OpenAuth OIDC authentication flow
- Username input for new players
- Connection status and error display
- Social media links and legal pages

## Key Architectural Patterns

### 1. Context-Based State Management

```typescript
// Contexts wrap the app to provide global state:
<AuthProvider>           // OpenAuth authentication state
  <GameContextsProvider> // SpacetimeDB connection + player actions
    <DebugProvider>      // Development debugging toggles
      <App />
    </DebugProvider>
  </GameContextsProvider>
</AuthProvider>
```

### 2. Hook-Based Logic Separation

The client heavily uses custom hooks to separate concerns:

- **Connection Hooks:** `useGameConnection`, `useSpacetimeTables`
- **Movement Hooks:** `useMovementInput`, `usePredictedMovement`
- **Rendering Hooks:** `useGameViewport`, `useDayNightCycle`, `useAssetLoader`
- **Interaction Hooks:** `useInteractionManager`, `useInteractionFinder`
- **Specialized Hooks:** `usePlacementManager`, `useDragDropManager`, `useBuildingManager`

### 3. Data Flow Pattern

```
SpacetimeDB Server
        ↓
Generated Bindings (client/src/generated/)
        ↓
useSpacetimeTables (subscriptions & state)
        ↓
App.tsx (main coordinator)
        ↓
GameScreen.tsx (game-specific data)
        ↓
GameCanvas.tsx (rendering)
```

### 4. Prop Drilling with Purpose

Rather than using global state for everything, game state is explicitly passed as props:
- Makes data dependencies explicit
- Enables component isolation for testing
- Prevents unnecessary re-renders via React.memo patterns

## Folder Structure

```
client/src/
├── components/          # React components
│   ├── GameCanvas.tsx   # Main rendering component
│   ├── GameScreen.tsx   # Game view coordinator
│   ├── LoginScreen.tsx  # Authentication screen
│   ├── PlayerUI.tsx     # Inventory and status UI
│   └── ...              # Other UI components
├── contexts/            # React contexts
│   ├── AuthContext.tsx           # OpenAuth integration
│   ├── GameConnectionContext.tsx # SpacetimeDB connection
│   ├── PlayerActionsContext.tsx  # Game actions
│   └── ...
├── hooks/               # Custom React hooks
│   ├── useSpacetimeTables.ts    # Data subscriptions
│   ├── usePredictedMovement.ts  # Client prediction
│   ├── useEntityFiltering.ts    # Viewport culling
│   └── ...
├── utils/               # Utility functions
│   ├── renderers/       # Rendering utilities per entity type
│   ├── clientCollision.ts       # Client-side collision
│   └── ...
├── generated/           # SpacetimeDB generated bindings
├── config/              # Configuration files
│   └── gameConfig.ts    # Game constants
└── assets/              # Images, sounds, etc.
```

## Performance Considerations

### 1. Entity Filtering
Entities are filtered to only include those in the viewport before rendering:
```typescript
const { visibleTrees, visibleStones, ySortedEntities } = useEntityFiltering(
    trees, stones, players, /* etc. */,
    viewBounds, currentTime
);
```

### 2. Memoization
Heavy computations use `useMemo`:
```typescript
const processedData = useMemo(() => {
    return expensiveCalculation(rawData);
}, [rawData]);
```

### 3. Ref-Based Values
High-frequency values use refs to avoid re-renders:
```typescript
const frameTimeRef = useRef<number>(0);
// Updated in game loop without triggering React renders
```

### 4. Canvas Double Buffering
The rendering uses direct canvas manipulation for 60fps performance rather than React DOM updates.

## Error Handling

### Error Boundary
```typescript
class AppErrorBoundary extends React.Component {
    // Catches errors but logs them without crashing
    // Allows the app to continue functioning
}
```

### Connection Error Recovery
The `GameConnectionContext` handles:
- Connection timeouts with retry logic
- Authentication token invalidation
- Graceful degradation on network issues

## Mobile Support

The client detects mobile devices via `useMobileDetection()` and adapts:
- Touch-based tap-to-walk navigation
- Simplified UI with `MobileControlBar`
- Hidden desktop-only features (voice interface, fishing minigame)

