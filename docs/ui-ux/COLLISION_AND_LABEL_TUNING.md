# Collision & E Label Tuning Guide

Quick reference for adjusting collision boundaries and E interaction labels for placeables.

## Understanding the Y Coordinate System

In this game, Y increases **downward** (standard screen coordinates):
- **Negative Y offset** = moves collision/label **UP** (toward top of screen)
- **Positive Y offset** = moves collision/label **DOWN** (toward bottom of screen)
- `posY` is typically the entity's anchor point (usually at base/feet)

---

## E Label Positioning

**File:** `client/src/utils/renderers/labelRenderingUtils.ts`

Each placeable has a `case` in the `renderInteractionLabels` function:

```typescript
case 'barbecue': {
    const barbecue = barbecues?.get(closestInteractableTarget.id.toString());
    if (barbecue) {
        const BARBECUE_HEIGHT = 128;
        const BARBECUE_RENDER_Y_OFFSET = 16;
        const visualCenterX = barbecue.posX;
        const visualCenterY = barbecue.posY - (BARBECUE_HEIGHT / 2) - BARBECUE_RENDER_Y_OFFSET;
        textX = visualCenterX;
        textY = visualCenterY - 50;  // ← ADJUST THIS VALUE
        renderStyledInteractionLabel(ctx, text, textX, textY);
    }
    break;
}
```

### How to Adjust
| Change | Effect |
|--------|--------|
| `textY - 50` → `textY - 70` | Label moves **UP** |
| `textY - 50` → `textY - 30` | Label moves **DOWN** |

### Blue Box Background
The blue box itself is drawn in `drawSOVAOverlayBackground()` at line ~115:
```typescript
const bgY = y - bgHeight / 2 - textHeight / 4 - 3; // Last number adjusts vertical offset
```

---

## Client-Side Collision

**File:** `client/src/utils/clientCollision.ts`

### Two Constants Per Entity

```typescript
// Collision radii (circle size)
const COLLISION_RADII = {
  BARBECUE: 20,        // Size of collision circle in pixels
  FURNACE: 20,
  TREE: 38,
  // ...
};

// Collision offsets (position relative to entity.posY)
const COLLISION_OFFSETS = {
  BARBECUE: { x: 0, y: -50 },   // Collision center is 50px ABOVE posY
  FURNACE: { x: 0, y: -50 },
  TREE: { x: 0, y: -68 },
  // ...
};
```

### How to Adjust

| Goal | Change |
|------|--------|
| Collision starts **higher** (player blocked sooner from above) | Make Y offset more negative: `-50` → `-70` |
| Collision starts **lower** (player can walk closer from above) | Make Y offset less negative: `-50` → `-30` |
| Bigger collision circle | Increase radius: `20` → `30` |
| Tighter collision circle | Decrease radius: `20` → `15` |

### Example: Barbecue
```typescript
// Current: collision at posY - 50
BARBECUE: { x: 0, y: -50 }

// To move collision UP (block player from walking through top of sprite):
BARBECUE: { x: 0, y: -80 }

// To move collision DOWN (let player get closer from above):
BARBECUE: { x: 0, y: -20 }
```

---

## Server-Side Collision

Each entity has constants at the top of its file in `server/src/`:

### Natural Resources (Trees, Stones, etc.)

| Entity | File | Radius Constant | Y Offset Constant |
|--------|------|-----------------|-------------------|
| Tree | `tree.rs` | `TREE_TRUNK_RADIUS` | `TREE_COLLISION_Y_OFFSET` |
| Stone | `stone.rs` | `STONE_TRUNK_RADIUS` | `STONE_COLLISION_Y_OFFSET` |
| Rune Stone | `rune_stone.rs` | `RUNE_STONE_RADIUS` | `RUNE_STONE_COLLISION_Y_OFFSET` |
| Cairn | `cairn.rs` | `CAIRN_COLLISION_RADIUS` | `CAIRN_COLLISION_Y_OFFSET` |
| Basalt Column | `basalt_column.rs` | `BASALT_COLUMN_COLLISION_RADIUS` | `BASALT_COLUMN_COLLISION_Y_OFFSET` |
| Sea Stack | `sea_stack.rs` | `SEA_STACK_COLLISION_RADIUS` | `SEA_STACK_COLLISION_Y_OFFSET` |

### Placeables

| Entity | File | Radius Constant | Y Offset Constant |
|--------|------|-----------------|-------------------|
| Barbecue | `barbecue.rs` | `BARBECUE_COLLISION_RADIUS` | `BARBECUE_COLLISION_Y_OFFSET` |
| Campfire | `campfire.rs` | `CAMPFIRE_COLLISION_RADIUS` | `CAMPFIRE_COLLISION_Y_OFFSET` |
| Furnace | `furnace.rs` | `FURNACE_COLLISION_RADIUS` | `FURNACE_COLLISION_Y_OFFSET` |
| Storage Box | `wooden_storage_box.rs` | `BOX_COLLISION_RADIUS` | `BOX_COLLISION_Y_OFFSET` |
| Rain Collector | `rain_collector.rs` | `RAIN_COLLECTOR_COLLISION_RADIUS` | `RAIN_COLLECTOR_COLLISION_Y_OFFSET` |
| Hearth | `homestead_hearth.rs` | `HEARTH_COLLISION_RADIUS` | `HEARTH_COLLISION_Y_OFFSET` |
| Barrel | `barrel.rs` | `BARREL_COLLISION_RADIUS` | `BARREL_COLLISION_Y_OFFSET` |

### Example (tree.rs):
```rust
pub(crate) const TREE_TRUNK_RADIUS: f32 = 24.0;
pub(crate) const TREE_COLLISION_Y_OFFSET: f32 = 60.0;
pub(crate) const PLAYER_TREE_COLLISION_DISTANCE_SQUARED: f32 = 
    (PLAYER_RADIUS + TREE_TRUNK_RADIUS) * (PLAYER_RADIUS + TREE_TRUNK_RADIUS);
```

### Example (barbecue.rs):
```rust
pub(crate) const BARBECUE_COLLISION_RADIUS: f32 = 20.0;
pub(crate) const BARBECUE_COLLISION_Y_OFFSET: f32 = 0.0;  // 0 = collision at posY
```

---

## ⚠️ CRITICAL: Client & Server Values MUST Match

> **If client and server collision values don't match, players will experience rubber-banding!**

### Why This Happens
1. **Client predicts** player can walk to position X (based on client collision radius)
2. **Server validates** and says "NO, you're too close to that tree" (based on server collision radius)
3. **Server corrects** player position → visible "snap back" / rubber-banding

### The Rule
- **Client radius should be ≥ Server radius** (client can be slightly more conservative)
- **If client radius < server radius** → guaranteed rubber-banding when player gets too close

### Quick Reference: Matching Values

| Entity | Client (`clientCollision.ts`) | Server File | Server Constant |
|--------|------------------------------|-------------|-----------------|
| Tree | `COLLISION_RADII.TREE` | `tree.rs` | `TREE_TRUNK_RADIUS` |
| Stone | `COLLISION_RADII.STONE` | `stone.rs` | `STONE_TRUNK_RADIUS` |
| Rune Stone | `COLLISION_RADII.RUNE_STONE` | `rune_stone.rs` | `RUNE_STONE_RADIUS` |
| Cairn | `COLLISION_RADII.CAIRN` | `cairn.rs` | `CAIRN_COLLISION_RADIUS` |
| Furnace | `COLLISION_RADII.FURNACE` | `furnace.rs` | `FURNACE_COLLISION_RADIUS` |
| Barbecue | `COLLISION_RADII.BARBECUE` | `barbecue.rs` | `BARBECUE_COLLISION_RADIUS` |

### How to Change Collision Size

**To make players able to walk closer to trees:**

1. **Server** (`server/src/tree.rs`):
   ```rust
   pub(crate) const TREE_TRUNK_RADIUS: f32 = 24.0;  // Changed from 30.0
   ```

2. **Client** (`client/src/utils/clientCollision.ts`):
   ```typescript
   TREE: 24,  // Must match or be >= server value
   ```

3. **Rebuild & Republish server**, then refresh client

---

## Quick Checklist for New Placeable

1. **E Label** (`labelRenderingUtils.ts`)
   - Add `case 'your_entity':` with appropriate `textY` offset

2. **Client Collision** (`clientCollision.ts`)
   - Add to `COLLISION_RADII`: `YOUR_ENTITY: 20`
   - Add to `COLLISION_OFFSETS`: `YOUR_ENTITY: { x: 0, y: -50 }`
   - Add filtering logic in `getCollisionCandidates()`

3. **Server Collision** (`your_entity.rs`)
   - Define `YOUR_ENTITY_COLLISION_RADIUS`
   - Define `YOUR_ENTITY_COLLISION_Y_OFFSET`
   - Use in placement validation and interaction checks

---

## Visual Debugging Tips

### Built-in Debug Overlays (Debug Panel)

The game has built-in debug overlays accessible from the **Debug Panel** (top-left in dev mode):

| Toggle | Description |
|--------|-------------|
| **COLLISION** | Shows collision circles/boxes for all nearby entities with radii and offsets |
| **Y-SORT** | Shows Y-sort threshold lines - helps tune when player renders in front/behind entities |

These are the best tools for tuning collision and Y-sorting values visually.

### Manual Debug Drawing

For custom visualization, temporarily draw on canvas:
```typescript
ctx.strokeStyle = 'red';
ctx.beginPath();
ctx.arc(entity.posX + offsetX, entity.posY + offsetY, radius, 0, Math.PI * 2);
ctx.stroke();
```

### Server Logs

Server logs show actual collision checks - enable with `log::debug!` in Rust:
```rust
log::debug!("Player-Tree collision: player at ({}, {}), tree at ({}, {})", 
    player_x, player_y, tree.pos_x, tree.pos_y);
```
