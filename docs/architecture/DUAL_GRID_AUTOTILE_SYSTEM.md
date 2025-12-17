# Dual Grid Autotile System

This document explains how the dual grid autotile system works for seamless terrain transitions in the game.

## Overview

The game uses a **Dual Grid Autotile** system for rendering smooth transitions between terrain types. This system places transition tiles at the *intersections* of four logical world tiles, creating seamless blends between different terrain types (grass→dirt, beach→sea, etc.).

## How It Works

### Dual Grid Concept

Instead of placing transition tiles directly on world tiles, we sample the **four corners** of each intersection point:

```
World Tiles:          Dual Grid Overlay:
┌───┬───┬───┐         ┌───┬───┬───┐
│ A │ B │ C │         │   ╳   ╳   │
├───┼───┼───┤    →    ├───┼───┼───┤
│ D │ E │ F │         │   ╳   ╳   │
├───┼───┼───┤         ├───┼───┼───┤
│ G │ H │ I │         │   ╳   ╳   │
└───┴───┴───┘         └───┴───┴───┘

Each ╳ samples its 4 surrounding tiles to determine which transition sprite to use.
```

### 4-Bit Index System

Each dual grid position samples 4 corners and creates a 4-bit index:

```
Bit positions:     Binary weights:
┌────┬────┐       ┌────┬────┐
│ TL │ TR │       │  8 │  4 │
├────┼────┤       ├────┼────┤
│ BL │ BR │       │  2 │  1 │
└────┴────┘       └────┴────┘

- Bit is SET (1) if corner is "secondary" terrain (e.g., sea, dirt)
- Bit is CLEAR (0) if corner is "primary" terrain (e.g., grass, beach)
```

### The 16 Possible Configurations

| Index | Binary | Corners | Description |
|-------|--------|---------|-------------|
| 0 | 0000 | None | Interior (all primary) |
| 1 | 0001 | BR | Concave BR corner |
| 2 | 0010 | BL | Concave BL corner |
| 3 | 0011 | BL+BR | Bottom edge |
| 4 | 0100 | TR | Concave TR corner |
| 5 | 0101 | TR+BR | Right edge |
| 6 | 0110 | TR+BL | Diagonal ↘ (TR to BL) |
| 7 | 0111 | TR+BL+BR | Convex TL corner |
| 8 | 1000 | TL | Concave TL corner |
| 9 | 1001 | TL+BR | Diagonal ↙ (TL to BR) |
| 10 | 1010 | TL+BL | Left edge |
| 11 | 1011 | TL+BL+BR | Convex TR corner |
| 12 | 1100 | TL+TR | Top edge |
| 13 | 1101 | TL+TR+BR | Convex BL corner |
| 14 | 1110 | TL+TR+BL | Convex BR corner |
| 15 | 1111 | All | Secondary interior (all secondary) |

## Tileset Layout

The autotile tileset is arranged in a 4-column × 5-row grid (128×128 pixels per tile):

```
      Col 0    Col 1    Col 2    Col 3
Row 0 [      ] [      ] [      ] [      ]
Row 1 [      ] [      ] [  0   ] [      ]  ← Interior at (1,2)
Row 2 [      ] [      ] [      ] [      ]
Row 3 [      ] [  1   ] [  2   ] [  6   ]  ← Concave BR, BL, Diagonal
Row 4 [      ] [  4   ] [  8   ] [  9   ]  ← Concave TR, TL, Diagonal
```

The `DUAL_GRID_LOOKUP` table in `dualGridAutotile.ts` maps each index to its row/column position.

## Underwater Autotiling

When the player is snorkeling (underwater mode), a special `Underwater_Sea` autotile is used to show transitions between the dark underwater land and the visible sea.

### U9 Flip Fix

**Problem:** The tileset asset at position U9 (index 9, diagonal TL+BR) has its sprite incorrectly oriented - it matches U6's orientation instead of being its mirror image.

**Solution:** In `proceduralWorldRenderer.ts`, we apply a horizontal flip to U9 tiles at runtime:

```typescript
if (isU9) {
    ctx.save();
    ctx.scale(-1, 1);  // Mirror on vertical axis
    ctx.drawImage(
        tilesetImg,
        spriteX, spriteY, TILE_SIZE_SRC, TILE_SIZE_SRC,
        -(destX + pixelSize), destY, pixelSize, pixelSize
    );
    ctx.restore();
}
```

**Why this was needed:** 
- U6 (0110) and U9 (1001) are **geometric opposites** - horizontal mirrors of each other
- U6: TR+BL corners = diagonal going top-right → bottom-left
- U9: TL+BR corners = diagonal going top-left → bottom-right
- The tileset artist likely copy-pasted one diagonal sprite without flipping it
- The `DUAL_GRID_LOOKUP` table correctly points to different sprite positions, but the actual tileset image has the wrong sprite at U9's position

**Fix options:**
1. ✅ Runtime flip (current solution) - flip the sprite when rendering
2. Fix the tileset image itself - redraw/flip U9's sprite in the PNG file
3. Have U9 use U6's position and flip - would require changing DUAL_GRID_LOOKUP

## Key Files

| File | Purpose |
|------|---------|
| `client/src/utils/dualGridAutotile.ts` | Core dual grid logic, DUAL_GRID_LOOKUP table, terrain priority |
| `client/src/utils/renderers/proceduralWorldRenderer.ts` | Renders tiles including underwater transitions |
| `client/src/assets/tiles/new/tileset_*_autotile.png` | Autotile sprite sheets |

## Creating New Autotile Tilesets

When creating new autotile tilesets:

1. **Match the 4×5 grid layout** with 128×128 pixel tiles
2. **Position sprites according to DUAL_GRID_LOOKUP** (see table above)
3. **Ensure diagonal opposites are properly mirrored:**
   - U6 and U9 must be horizontal mirrors of each other
   - If you copy one diagonal, flip it horizontally for the other
4. **Test with debug overlay** enabled to verify correct tile selection

## Debug Mode

Enable debug overlay to see tile indices:
- Regular tiles show their dual grid index (e.g., "U9")
- Flipped tiles show "F" suffix in yellow (e.g., "U9F")
- Tile boundaries are drawn with cyan outlines
