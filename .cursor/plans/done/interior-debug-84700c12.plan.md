<!-- 84700c12-51dc-471b-8060-fc99bb8b193b d3865c40-323a-4d07-afc9-0e95a00fc490 -->
# Interior Debug Overlay Implementation

## Overview

Add a "INTERIOR" debug toggle button that renders a transparent colored overlay on foundation cells that are part of enclosed buildings. This allows visual inspection of what the game considers "interior" space.

## Key Files

- [client/src/contexts/DebugContext.tsx](client/src/contexts/DebugContext.tsx) - Add new toggle state
- [client/src/components/DebugPanel.tsx](client/src/components/DebugPanel.tsx) - Add toggle button UI
- [client/src/components/GameScreen.tsx](client/src/components/GameScreen.tsx) - Pass toggle to GameCanvas
- [client/src/components/GameCanvas.tsx](client/src/components/GameCanvas.tsx) - Render overlay

## Implementation

### 1. DebugContext - Add state and toggle

Add `showInteriorDebug` state and `toggleInteriorDebug` function following the existing pattern for `showChunkBoundaries`.

### 2. DebugPanel - Add toggle button

Add an "INTERIOR" toggle button styled consistently with existing toggles (CHUNKS, TILESET). Will show green when active, red when inactive.

### 3. GameScreen - Pass prop to GameCanvas

Destructure `showInteriorDebug` from `useDebug()` and pass it as a prop to GameCanvas.

### 4. GameCanvas - Render interior overlay

Add rendering logic after the chunk boundaries debug section (around line 2366). The overlay will:

- Loop through all `buildingClusters` (already computed by `useEntityFiltering`)
- For each cluster where `isEnclosed === true`:
- Parse `cellCoords` (format: "cellX,cellY")
- Draw a semi-transparent colored rectangle (96x96px per cell)
- Use different colors to indicate player position:
- Green overlay = player is INSIDE this enclosed building
- Cyan overlay = enclosed building that player is OUTSIDE of

This leverages existing data: `buildingClusters` and `playerBuildingClusterId` are already computed by `useEntityFiltering` hook.

### To-dos

- [x] Add showInteriorDebug state and toggleInteriorDebug to DebugContext
- [x] Add INTERIOR toggle button to DebugPanel UI
- [x] Pass showInteriorDebug from GameScreen to GameCanvas
- [x] Add interior overlay rendering in GameCanvas render loop