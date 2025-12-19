---
name: Underwater Snorkeling Mode
overview: "Implement immersive underwater rendering when player is snorkeling: disable surface water effects, apply full dark tint to player, render sea stacks as underwater collision silhouettes, add underwater atmosphere overlay, and add ambient bubble/caustic effects."
todos:
  - id: pass-snorkeling-flag
    content: Pass isSnorkeling flag through rendering pipeline (GameCanvas -> playerRenderingUtils)
    status: completed
  - id: disable-water-overlay
    content: Conditionally skip renderWaterOverlay() in GameCanvas.tsx when snorkeling
    status: completed
  - id: disable-player-water-effects
    content: Skip drawSwimmingEffectsUnder/Over in playerRenderingUtils.ts when snorkeling
    status: completed
  - id: full-player-tint
    content: Apply dark teal underwater tint to entire player sprite (not just bottom half) when snorkeling
    status: completed
  - id: sea-stack-silhouette
    content: Create renderSeaStackUnderwaterSilhouette() that draws feathered dark blue circles instead of sprites
    status: completed
  - id: underwater-effects-util
    content: Create underwaterEffectsUtils.ts with bubble particles and caustic light effects
    status: completed
  - id: integrate-underwater-effects
    content: Render underwater effects in GameCanvas both below and above player
    status: completed
---

# Underwater Snorkeling Rendering Mode

## Overview

When `player.isSnorkeling` is true, switch to an immersive underwater view that:

- Removes all surface water effects (waves, sparkles, water line on player)
- Shows the player fully submerged with dark teal tinting
- Replaces sea stack sprites with feathered dark blue collision circles
- Adds atmospheric underwater effects (bubbles, caustics)

## Files to Modify

### 1. GameCanvas.tsx - Disable Water Overlay

Skip `renderWaterOverlay()` when snorkeling to remove shoreline waves/sparkles.

```typescript:2523:2531
// Around line 2523 - wrap in condition
const isSnorkeling = localPlayer?.isSnorkeling ?? false;
if (!isSnorkeling) {
  renderWaterOverlay(ctx, ...);
}
```

### 2. playerRenderingUtils.ts - Full Underwater Player Rendering

- Skip `drawSwimmingEffectsUnder()` and `drawSwimmingEffectsOver()` when `isSnorkeling`
- Apply dark teal tint to **entire** sprite (not just bottom half)
- Pass `isSnorkeling` as new parameter to `renderPlayer()`

Key changes around lines 902-947 and 976-1054.

### 3. seaStackRenderingUtils.ts - Underwater Sea Stack View

Add new rendering function `renderSeaStackUnderwaterSilhouette()`:

- Draw feathered dark blue circle at sea stack position
- Circle radius based on sea stack variant (Tall/Medium/Wide)
- Soft radial gradient from dark center to transparent edge
- Skip normal sprite rendering when snorkeling

### 4. proceduralWorldRenderer.ts - Enhanced Sea Tile Darkening

The existing `isSnorkeling` handling already darkens land tiles. May need to add slight blue tint overlay on sea tiles too for consistency.

### 5. New: underwaterEffectsUtils.ts - Ambient Underwater Effects

Create new utility for immersive underwater atmosphere:

- **Bubbles**: Small rising particles that drift upward
- **Caustics**: Subtle light ray patterns that shimmer
- **Depth fog**: Gradual blue-teal vignette at screen edges

## Implementation Order

1. Pass `isSnorkeling` through rendering pipeline
2. Disable water overlay conditionally
3. Modify player rendering for full underwater tint
4. Add sea stack underwater silhouette rendering
5. Create and integrate underwater ambient effects

## Technical Notes

- `isSnorkeling` is already available on `Player` type from server
- Sea stack collision radius is ~100-150px based on variant (check server `sea_stack.rs`)
- Use `globalCompositeOperation` for proper blending of underwater effects
- Bubble particles should use object pooling for performance