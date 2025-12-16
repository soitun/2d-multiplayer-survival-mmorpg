# Rendering Pipeline

This document describes the canvas rendering pipeline used in the game client.

## Overview

The game uses HTML5 Canvas 2D rendering with a custom game loop and Y-sorting for isometric-style depth ordering.

## Core Components

### GameCanvas.tsx

The main rendering component (~4000 lines) that orchestrates:
- Canvas setup and sizing
- Game loop execution
- Viewport calculations
- Entity rendering
- Input handling
- Interaction detection

### useGameLoop Hook

Manages the requestAnimationFrame loop:

```typescript
export function useGameLoop(
    renderCallback: (frameInfo: FrameInfo) => void,
    deps: any[]
) {
    const frameRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);
    
    useEffect(() => {
        const loop = (timestamp: number) => {
            const deltaTime = timestamp - lastTimeRef.current;
            lastTimeRef.current = timestamp;
            
            renderCallback({
                timestamp,
                deltaTime,
                frameNumber: frameRef.current++
            });
            
            requestAnimationFrame(loop);
        };
        
        requestAnimationFrame(loop);
        
        return () => cancelAnimationFrame(frameRef.current);
    }, deps);
}
```

## Rendering Order

The render loop executes in this order:

### 1. Clear and Background
```typescript
ctx.clearRect(0, 0, canvas.width, canvas.height);
renderWorldBackground(ctx, worldTileCache, cameraOffsetX, cameraOffsetY, viewport);
```

### 2. Pre-Sorted Elements
Elements rendered before Y-sorting:
- Water patches
- Fertilizer patches
- Fire patches
- Underwater shadows (for swimming players)
- Shore wave particles

### 3. Y-Sorted Entities
The core rendering phase using depth sorting:

```typescript
// From useEntityFiltering hook
const ySortedEntities = useMemo(() => {
    const entities: YSortedEntity[] = [];
    
    // Add all entity types with their Y positions
    visibleTrees.forEach(tree => 
        entities.push({ type: 'tree', entity: tree, y: tree.posY }));
    visiblePlayers.forEach(player => 
        entities.push({ type: 'player', entity: player, y: player.positionY }));
    // ... more entity types
    
    // Sort by Y position (lower Y = further back = rendered first)
    return entities.sort((a, b) => a.y - b.y);
}, [visibleTrees, visiblePlayers, /* ... */]);

// In render loop
ySortedEntities.forEach(item => {
    switch (item.type) {
        case 'tree': renderTree(ctx, item.entity, assets, ...); break;
        case 'player': renderPlayer(ctx, item.entity, ...); break;
        // ... handle all entity types
    }
});
```

### 4. Post-Sorted Elements
Elements rendered after Y-sorting:
- Projectiles
- Particles (campfire, torch, furnace, etc.)
- Clouds
- Rain effects

### 5. Overlays
Final overlays:
- Day/night tint
- Weather overlay
- Health/stamina overlays
- Broth effects overlay
- Insanity overlay
- Water overlay (when swimming)

### 6. UI Elements
Canvas-based UI elements:
- Interaction labels
- Placement preview
- Minimap (when open)
- Debug overlays

## Entity Filtering

### useEntityFiltering Hook

Filters entities to only those visible in the viewport:

```typescript
const { 
    visibleTrees,
    visibleStones,
    visiblePlayers,
    ySortedEntities,
    visibleTreesMap  // For quick lookup
} = useEntityFiltering(
    trees, stones, players, /* all entity maps */,
    viewBounds,
    currentTime
);
```

### Filtering Logic

```typescript
const visibleTrees = useMemo(() => {
    return Array.from(trees.values()).filter(tree => {
        // Check if within viewport bounds
        if (tree.posX < viewMinX - BUFFER || tree.posX > viewMaxX + BUFFER) return false;
        if (tree.posY < viewMinY - BUFFER || tree.posY > viewMaxY + BUFFER) return false;
        
        // Check if not dead/respawning
        if (tree.health === 0 && !tree.respawnAt) return false;
        
        return true;
    });
}, [trees, viewMinX, viewMaxX, viewMinY, viewMaxY, currentTime]);
```

## Viewport Management

### useGameViewport Hook

Calculates camera position based on local player:

```typescript
const { cameraOffsetX, cameraOffsetY, viewBounds } = useGameViewport(
    localPlayer,
    predictedPosition,
    canvasWidth,
    canvasHeight
);

// Camera offset centers the player on screen
const cameraOffsetX = canvasWidth / 2 - playerX;
const cameraOffsetY = canvasHeight / 2 - playerY;

// View bounds for entity filtering
const viewBounds = {
    minX: playerX - canvasWidth / 2 - BUFFER,
    maxX: playerX + canvasWidth / 2 + BUFFER,
    minY: playerY - canvasHeight / 2 - BUFFER,
    maxY: playerY + canvasHeight / 2 + BUFFER
};
```

### Coordinate Transformation

World coordinates to screen coordinates:
```typescript
const screenX = worldX + cameraOffsetX;
const screenY = worldY + cameraOffsetY;
```

Screen coordinates to world coordinates (for mouse input):
```typescript
const worldX = mouseX - cameraOffsetX;
const worldY = mouseY - cameraOffsetY;
```

## Asset Loading

### useAssetLoader Hook

Pre-loads all sprite images:

```typescript
const { assets, isLoading, loadingProgress } = useAssetLoader();

// assets object contains loaded Image elements:
assets.playerSprite
assets.treeSprites[treeType]
assets.stoneSprites[stoneType]
// etc.
```

### Image Preloading Pattern

```typescript
const preloadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};
```

## Animation Systems

### Walking Animation
```typescript
const { walkingFrame } = useWalkingAnimationCycle(isMoving);
// Returns 0-3 cycling every ~150ms when moving
```

### Idle Animation
```typescript
const { idleFrame } = useIdleAnimationCycle(!isMoving);
// Returns 0-15 for idle animation frames
```

### Day/Night Cycle
```typescript
const { ambientLightColor, ambientLightIntensity } = useDayNightCycle(worldState);
// Returns color tint based on time of day
```

## Particle Systems

Multiple hooks manage particle effects:

```typescript
// Campfire particles (fire + smoke)
const campfireParticles = useCampfireParticles(campfires, cameraOffset);

// Torch particles (for players with lit torches)
const torchParticles = useTorchParticles(playersWithTorches, cameraOffset);

// Resource sparkle (harvestable resources)
const sparkleParticles = useResourceSparkleParticles(harvestables, cameraOffset);

// Fire arrow particles
const fireArrowParticles = useFireArrowParticles(projectiles);
```

## Specialized Renderers

Each entity type has a dedicated renderer in `client/src/utils/renderers/`:

```
renderers/
├── playerRenderingUtils.ts      # Player sprites and animations
├── treeRenderingUtils.ts        # Trees with shadows and falling animation
├── campfireRenderingUtils.ts    # Campfires with cooking slots
├── stoneRenderingUtils.ts       # Stone nodes
├── droppedItemRenderingUtils.ts # Ground items
├── lightRenderingUtils.ts       # Dynamic lighting
├── cloudRenderingUtils.ts       # Cloud shadows
├── rainRenderingUtils.ts        # Rain particles
├── waterOverlayUtils.ts         # Swimming effects
└── ...
```

### Renderer Pattern

```typescript
export function renderEntity(
    ctx: CanvasRenderingContext2D,
    entity: EntityType,
    assets: GameAssets,
    cameraOffsetX: number,
    cameraOffsetY: number,
    // ... additional params
) {
    // Calculate screen position
    const screenX = entity.posX + cameraOffsetX;
    const screenY = entity.posY + cameraOffsetY;
    
    // Early exit if off-screen
    if (!isOnScreen(screenX, screenY, ctx.canvas)) return;
    
    // Render the entity
    ctx.drawImage(
        assets.entitySprite,
        spriteX, spriteY, spriteWidth, spriteHeight,  // Source rect
        screenX - width/2, screenY - height, width, height  // Dest rect
    );
}
```

## Performance Optimizations

### 1. Entity Culling
Only render entities within the viewport plus buffer.

### 2. Memoized Filtering
Use `useMemo` for filtered entity lists to avoid recalculation.

### 3. Image Caching
Pre-load all images at startup to avoid loading during render.

### 4. Ref-Based Updates
Use refs for high-frequency values that don't need React re-renders.

### 5. Canvas Layering
Consider separate canvases for static vs dynamic content (not currently implemented but planned).

### 6. Particle Pooling
Reuse particle objects instead of creating new ones each frame.

## Debug Overlays

Toggle debug visualizations via DebugContext:

```typescript
const { 
    showChunkBoundaries, 
    showCollisionDebug,
    showInteriorDebug,
    showAttackRangeDebug 
} = useDebug();

// In render loop
if (showChunkBoundaries) {
    renderChunkBoundaries(ctx, viewBounds, cameraOffset);
}
if (showCollisionDebug) {
    renderCollisionDebug(ctx, collisionShapes, cameraOffset);
}
```

