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

| Entity | File | Constants |
|--------|------|-----------|
| Barbecue | `barbecue.rs` | `BARBECUE_COLLISION_RADIUS`, `BARBECUE_COLLISION_Y_OFFSET` |
| Campfire | `campfire.rs` | `CAMPFIRE_COLLISION_RADIUS`, `CAMPFIRE_COLLISION_Y_OFFSET` |
| Furnace | `furnace.rs` | `FURNACE_COLLISION_RADIUS`, `FURNACE_COLLISION_Y_OFFSET` |
| Storage Box | `wooden_storage_box.rs` | `BOX_COLLISION_RADIUS`, `BOX_COLLISION_Y_OFFSET` |
| Rain Collector | `rain_collector.rs` | `RAIN_COLLECTOR_COLLISION_RADIUS`, `RAIN_COLLECTOR_COLLISION_Y_OFFSET` |
| Hearth | `homestead_hearth.rs` | `HEARTH_COLLISION_RADIUS`, `HEARTH_COLLISION_Y_OFFSET` |

### Example (barbecue.rs):
```rust
pub(crate) const BARBECUE_COLLISION_RADIUS: f32 = 20.0;
pub(crate) const BARBECUE_COLLISION_Y_OFFSET: f32 = 0.0;  // 0 = collision at posY
```

### Important
- **Server and client offsets should match** for consistent behavior
- Server handles: placement validation, damage targeting, interaction distance
- Client handles: visual collision prediction (rubber-banding prevention)

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

- Temporarily draw collision circles on canvas to visualize:
  ```typescript
  ctx.strokeStyle = 'red';
  ctx.beginPath();
  ctx.arc(entity.posX + offsetX, entity.posY + offsetY, radius, 0, Math.PI * 2);
  ctx.stroke();
  ```

- Server logs show actual collision checks - enable with `log::debug!` in Rust
