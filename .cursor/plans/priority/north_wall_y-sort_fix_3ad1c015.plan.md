---
name: North Wall Y-Sort Fix
overview: Fix the multi-pass rendering system so north walls respect the Y-sort order, allowing players and placeables on the tile south of a foundation to correctly render in front of the north wall.
todos:
  - id: modify-pass1-skip
    content: Modify Pass 1 to not skip wall_cell with edge !== 2 (keep only south wall skip)
    status: pending
  - id: add-wall-render-pass1
    content: Add north/east/west/diagonal wall rendering logic to Pass 1 entity loop
    status: pending
  - id: remove-pass2-pass3
    content: Remove or comment out Pass 2 (north walls) and Pass 3 (east/west walls) since now in Pass 1
    status: pending
  - id: test-player-north-wall
    content: Test player approaching north wall from south - head should not be clipped
    status: pending
  - id: test-placeable-north-wall
    content: Test placeables (campfire, storage box) on tile south of foundation with north wall
    status: pending
---

# Fix North Wall Rendering Order

## Problem

The Y-sort comparator correctly determines that players/placeables at Y positions greater than the north wall's foundation top (Y >= foundationTopY) should render IN FRONT of north walls. However, the multi-pass rendering system ignores this by:

1. Pass 1: Rendering all players, placeables, trees, etc.
2. Pass 2: Rendering ALL north walls (always on top)

This causes north walls to visually clip over players and placeables that should be in front.

## Solution

Move north wall rendering from the separate Pass 2 into the main Y-sorted Pass 1, so walls render at their correct Y-sorted position relative to other entities.

## File to Modify

[client/src/utils/renderers/renderingUtils.ts](client/src/utils/renderers/renderingUtils.ts)

## Changes

### 1. Modify Pass 1 (around line 541-545)

Current code skips all wall_cell entities:

```typescript
if (type === 'fog_overlay' || type === 'wall_cell' || type === 'door') {
    return;
}
```

Change to only skip fog, doors, and SOUTH walls:

```typescript
if (type === 'fog_overlay' || type === 'door') {
    return;
}
if (type === 'wall_cell') {
    const wall = entity as SpacetimeDBWallCell;
    // Only skip south walls (edge 2) - they render in Pass 6 after ceiling tiles
    if (wall.edge === 2) {
        return;
    }
    // North/east/west/diagonal walls render here in Y-sorted order
    // (render logic moved from Pass 2/3 to here)
}
```



### 2. Add North/East/West Wall Rendering to Pass 1

After the wall skip check, add the wall rendering logic (adapted from current Pass 2/3):

```typescript
if (type === 'wall_cell') {
    const wall = entity as SpacetimeDBWallCell;
    if (wall.edge === 2) return; // South walls in Pass 6
    
    const wallCellKey = `${wall.cellX},${wall.cellY}`;
    const wallClusterId = cellCoordToClusterId.get(wallCellKey);
    const playerInsideThisCluster = wallClusterId !== undefined && 
        wallClusterId === playerBuildingClusterId;
    const isEnclosed = wallClusterId ? 
        clusterEnclosureStatus.get(wallClusterId) || false : false;

    renderWall({
        ctx,
        wall: wall as any,
        worldScale: 1.0,
        viewOffsetX: -cameraOffsetX,
        viewOffsetY: -cameraOffsetY,
        foundationTileImagesRef,
        allWalls,
        cycleProgress,
        localPlayerPosition,
        playerInsideCluster: playerInsideThisCluster,
        isClusterEnclosed: isEnclosed,
    });
    return;
}
```



### 3. Remove Pass 2 (North Walls) and Pass 3 (East/West Walls)

Comment out or remove the separate passes for north/east/west walls (lines 1338-1439) since they're now rendered in Pass 1.

### 4. Keep Pass 4, 5, 6, 7

- Pass 4: Wall shadows remain (or move to Pass 1 alongside walls)
- Pass 5: Ceiling tiles - still renders AFTER walls since Pass 1 comes before Pass 5
- Pass 6: South walls - remain separate (must render after ceiling tiles)
- Pass 7: South doors - remain separate

## Why This Works

- Ceiling tiles still render after north/east/west walls because Pass 5 comes after the modified Pass 1
- South walls still render after ceiling tiles (Pass 6)