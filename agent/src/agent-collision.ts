/**
 * Agent-side collision detection.
 *
 * Mirrors the client's clientCollision.ts but kept lightweight for the
 * server-side NPC tick (10 Hz). Checks circle-circle and circle-AABB
 * against the most common world obstacles so agents don't walk through
 * trees, stones, buildings, etc.
 *
 * The server's player_collision.rs is intentionally disabled to avoid
 * rubber-banding for human players, so each "client" (browser OR agent)
 * must enforce collision locally before calling updatePlayerPositionSimple.
 */

// ---------------------------------------------------------------------------
// Collision radii / offsets — must stay in sync with clientCollision.ts
// ---------------------------------------------------------------------------

const PLAYER_RADIUS = 32;

const COLLISION = {
  TREE:          { radius: 24, offsetX: 0, offsetY: -68 },
  STONE:         { radius: 28, offsetX: 0, offsetY: -72 },
  RUNE_STONE:    { halfW: 55, halfH: 24, offsetX: 0, offsetY: -24 },
  CAIRN:         { halfW: 48, halfH: 24, offsetX: 0, offsetY: -24 },
  PLAYER:        { radius: 32, offsetX: 0, offsetY: 0 },
  WILD_ANIMAL:   { radius: 40, offsetX: 0, offsetY: 0 },
  BARREL:        { radius: 25, offsetX: 0, offsetY: -48 },
  STORAGE_BOX:   { radius: 20, offsetX: 0, offsetY: -50 },
  FURNACE:       { radius: 20, offsetX: 0, offsetY: -50 },
  BARBECUE:      { radius: 20, offsetX: 0, offsetY: 0 },
  RAIN_COLLECTOR:{ radius: 30, offsetX: 0, offsetY: -30 },
  BASALT_COLUMN: { radius: 35, offsetX: 0, offsetY: -40 },
  HEARTH:        { radius: 55, offsetX: 0, offsetY: -72.5 },
  LIVING_CORAL:  { radius: 80, offsetX: 0, offsetY: -60 },
  // Shelters, walls, doors, fences are complex AABB/line shapes — skipped for
  // now; agents rarely walk into player-built structures.
} as const;

/** Max entities to check per category to keep the tick fast. */
const MAX_PER_CATEGORY = 20;
/** Squared distance beyond which we skip an entity entirely. */
const CULL_DIST_SQ = 300 * 300;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Given a proposed (newX, newY), resolve collisions with nearby world
 * entities and return an adjusted position the agent can safely occupy.
 *
 * @param db   SpacetimeDB `conn.db` handle (any — avoids generated type deps)
 * @param selfId  The agent's own identity hex string (to skip self-collision)
 * @param fromX   Current X
 * @param fromY   Current Y
 * @param newX    Proposed X
 * @param newY    Proposed Y
 * @returns       Corrected { x, y }
 */
export function resolveAgentCollision(
  db: any,
  selfId: string,
  fromX: number,
  fromY: number,
  newX: number,
  newY: number,
): { x: number; y: number } {
  // Collect nearby collision shapes
  const shapes = gatherNearbyShapes(db, selfId, fromX, fromY);

  if (shapes.length === 0) return { x: newX, y: newY };

  // Iterative resolution (2 passes handles most cases)
  let cx = newX;
  let cy = newY;

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];
      const result = resolveShape(cx, cy, s);
      if (result) {
        cx = result.x;
        cy = result.y;
      }
    }
  }

  return { x: cx, y: cy };
}

// ---------------------------------------------------------------------------
// Shape types
// ---------------------------------------------------------------------------

interface CircleShape {
  kind: 'circle';
  x: number;
  y: number;
  radius: number;
}

interface AABBShape {
  kind: 'aabb';
  x: number;
  y: number;
  halfW: number;
  halfH: number;
}

type Shape = CircleShape | AABBShape;

// ---------------------------------------------------------------------------
// Gather nearby collision shapes from the DB
// ---------------------------------------------------------------------------

function gatherNearbyShapes(db: any, selfId: string, px: number, py: number): Shape[] {
  const shapes: Shape[] = [];

  // --- Trees ---
  tryIter(db.tree, (t: any) => {
    if ((t.health ?? 0) <= 0) return;
    const respawn = t.respawnAt?.microsSinceUnixEpoch ?? 0n;
    if (respawn > 0n) return;
    pushCircleIfNear(shapes, px, py,
      (t.posX ?? 0) + COLLISION.TREE.offsetX,
      (t.posY ?? 0) + COLLISION.TREE.offsetY,
      COLLISION.TREE.radius);
  });

  // --- Stones ---
  tryIter(db.stone, (s: any) => {
    if ((s.health ?? 0) <= 0) return;
    const respawn = s.respawnAt?.microsSinceUnixEpoch ?? 0n;
    if (respawn > 0n) return;
    pushCircleIfNear(shapes, px, py,
      (s.posX ?? 0) + COLLISION.STONE.offsetX,
      (s.posY ?? 0) + COLLISION.STONE.offsetY,
      COLLISION.STONE.radius);
  });

  // --- Other players ---
  tryIter(db.player, (p: any) => {
    const pid = p.identity?.toHexString?.() ?? String(p.identity);
    if (pid === selfId) return;
    if (p.isDead || !p.isOnline) return;
    pushCircleIfNear(shapes, px, py,
      p.positionX ?? 0,
      p.positionY ?? 0,
      COLLISION.PLAYER.radius);
  });

  // --- Wild animals (alive, non-flying, non-bee) ---
  tryIter(db.wildAnimal, (a: any) => {
    if ((a.health ?? 0) <= 0) return;
    const species = a.species?.tag ?? '';
    if (species === 'Bee') return;
    if ((species === 'Tern' || species === 'Crow') && a.isFlying) return;
    pushCircleIfNear(shapes, px, py,
      (a.posX ?? 0) + COLLISION.WILD_ANIMAL.offsetX,
      (a.posY ?? 0) + COLLISION.WILD_ANIMAL.offsetY,
      COLLISION.WILD_ANIMAL.radius);
  });

  // --- Barrels (alive) ---
  tryIter(db.barrel, (b: any) => {
    if ((b.health ?? 0) <= 0) return;
    const respawn = b.respawnAt?.microsSinceUnixEpoch ?? 0n;
    if (respawn > 0n) return;
    pushCircleIfNear(shapes, px, py,
      (b.posX ?? 0) + COLLISION.BARREL.offsetX,
      (b.posY ?? 0) + COLLISION.BARREL.offsetY,
      COLLISION.BARREL.radius);
  });

  // --- Rune stones (AABB) ---
  tryIter(db.runeStone, (rs: any) => {
    pushAABBIfNear(shapes, px, py,
      (rs.posX ?? 0) + COLLISION.RUNE_STONE.offsetX,
      (rs.posY ?? 0) + COLLISION.RUNE_STONE.offsetY,
      COLLISION.RUNE_STONE.halfW,
      COLLISION.RUNE_STONE.halfH);
  });

  // --- Cairns (AABB) ---
  tryIter(db.cairn, (c: any) => {
    pushAABBIfNear(shapes, px, py,
      (c.posX ?? 0) + COLLISION.CAIRN.offsetX,
      (c.posY ?? 0) + COLLISION.CAIRN.offsetY,
      COLLISION.CAIRN.halfW,
      COLLISION.CAIRN.halfH);
  });

  // --- Storage boxes ---
  tryIter(db.woodenStorageBox, (box: any) => {
    if ((box.boxType ?? 0) === 4) return; // Skip backpacks
    pushCircleIfNear(shapes, px, py,
      (box.posX ?? 0) + COLLISION.STORAGE_BOX.offsetX,
      (box.posY ?? 0) + COLLISION.STORAGE_BOX.offsetY,
      COLLISION.STORAGE_BOX.radius);
  });

  // --- Furnaces ---
  tryIter(db.furnace, (f: any) => {
    if (f.isDestroyed) return;
    pushCircleIfNear(shapes, px, py,
      (f.posX ?? 0) + COLLISION.FURNACE.offsetX,
      (f.posY ?? 0) + COLLISION.FURNACE.offsetY,
      COLLISION.FURNACE.radius);
  });

  // --- Barbecues ---
  tryIter(db.barbecue, (b: any) => {
    if (b.isDestroyed) return;
    pushCircleIfNear(shapes, px, py,
      (b.posX ?? 0) + COLLISION.BARBECUE.offsetX,
      (b.posY ?? 0) + COLLISION.BARBECUE.offsetY,
      COLLISION.BARBECUE.radius);
  });

  // --- Rain collectors ---
  tryIter(db.rainCollector, (rc: any) => {
    if (rc.isDestroyed) return;
    pushCircleIfNear(shapes, px, py,
      (rc.posX ?? 0) + COLLISION.RAIN_COLLECTOR.offsetX,
      (rc.posY ?? 0) + COLLISION.RAIN_COLLECTOR.offsetY,
      COLLISION.RAIN_COLLECTOR.radius);
  });

  // --- Basalt columns ---
  tryIter(db.basaltColumn, (bc: any) => {
    pushCircleIfNear(shapes, px, py,
      (bc.posX ?? 0) + COLLISION.BASALT_COLUMN.offsetX,
      (bc.posY ?? 0) + COLLISION.BASALT_COLUMN.offsetY,
      COLLISION.BASALT_COLUMN.radius);
  });

  // --- Homestead hearths ---
  tryIter(db.homesteadHearth, (h: any) => {
    if (h.isDestroyed) return;
    pushCircleIfNear(shapes, px, py,
      (h.posX ?? 0) + COLLISION.HEARTH.offsetX,
      (h.posY ?? 0) + COLLISION.HEARTH.offsetY,
      COLLISION.HEARTH.radius);
  });

  // --- Living corals ---
  tryIter(db.livingCoral, (lc: any) => {
    const respawn = lc.respawnAt?.microsSinceUnixEpoch ?? 0n;
    if (respawn > 0n) return;
    pushCircleIfNear(shapes, px, py,
      (lc.posX ?? 0) + COLLISION.LIVING_CORAL.offsetX,
      (lc.posY ?? 0) + COLLISION.LIVING_CORAL.offsetY,
      COLLISION.LIVING_CORAL.radius);
  });

  return shapes;
}

// ---------------------------------------------------------------------------
// Collision resolution
// ---------------------------------------------------------------------------

function resolveShape(px: number, py: number, shape: Shape): { x: number; y: number } | null {
  if (shape.kind === 'circle') {
    return resolveCircle(px, py, shape);
  } else {
    return resolveAABB(px, py, shape);
  }
}

function resolveCircle(px: number, py: number, s: CircleShape): { x: number; y: number } | null {
  const dx = px - s.x;
  const dy = py - s.y;
  const distSq = dx * dx + dy * dy;
  const minDist = PLAYER_RADIUS + s.radius;

  if (distSq >= minDist * minDist) return null; // No overlap

  const dist = Math.sqrt(distSq);
  if (dist < 0.001) {
    // Exactly overlapping — push in arbitrary direction
    return { x: px + minDist, y: py };
  }

  const overlap = minDist - dist;
  const nx = dx / dist;
  const ny = dy / dist;

  return {
    x: px + nx * (overlap + 1),
    y: py + ny * (overlap + 1),
  };
}

function resolveAABB(px: number, py: number, s: AABBShape): { x: number; y: number } | null {
  const minX = s.x - s.halfW;
  const maxX = s.x + s.halfW;
  const minY = s.y - s.halfH;
  const maxY = s.y + s.halfH;

  // Expand by player radius
  const eMinX = minX - PLAYER_RADIUS;
  const eMaxX = maxX + PLAYER_RADIUS;
  const eMinY = minY - PLAYER_RADIUS;
  const eMaxY = maxY + PLAYER_RADIUS;

  if (px < eMinX || px > eMaxX || py < eMinY || py > eMaxY) return null;

  // Find closest point on original AABB
  const closestX = Math.max(minX, Math.min(px, maxX));
  const closestY = Math.max(minY, Math.min(py, maxY));
  const dx = px - closestX;
  const dy = py - closestY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist >= PLAYER_RADIUS) return null;

  if (dist < 0.001) {
    // Inside AABB — push to nearest edge
    const dLeft = px - minX;
    const dRight = maxX - px;
    const dTop = py - minY;
    const dBottom = maxY - py;
    const minD = Math.min(dLeft, dRight, dTop, dBottom);

    if (minD === dLeft)   return { x: minX - PLAYER_RADIUS - 1, y: py };
    if (minD === dRight)  return { x: maxX + PLAYER_RADIUS + 1, y: py };
    if (minD === dTop)    return { x: px, y: minY - PLAYER_RADIUS - 1 };
    return { x: px, y: maxY + PLAYER_RADIUS + 1 };
  }

  const overlap = PLAYER_RADIUS - dist;
  const nx = dx / dist;
  const ny = dy / dist;

  return {
    x: px + nx * (overlap + 1),
    y: py + ny * (overlap + 1),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _shapeCount = 0;

function pushCircleIfNear(
  shapes: Shape[], px: number, py: number,
  cx: number, cy: number, radius: number,
): void {
  if (_shapeCount >= MAX_PER_CATEGORY) return;
  const dx = px - cx;
  const dy = py - cy;
  if (dx * dx + dy * dy > CULL_DIST_SQ) return;
  shapes.push({ kind: 'circle', x: cx, y: cy, radius });
  _shapeCount++;
}

function pushAABBIfNear(
  shapes: Shape[], px: number, py: number,
  cx: number, cy: number, halfW: number, halfH: number,
): void {
  if (_shapeCount >= MAX_PER_CATEGORY) return;
  const dx = px - cx;
  const dy = py - cy;
  if (dx * dx + dy * dy > CULL_DIST_SQ) return;
  shapes.push({ kind: 'aabb', x: cx, y: cy, halfW, halfH });
  _shapeCount++;
}

/**
 * Safely iterate a SpacetimeDB table handle. Silently swallows if the
 * table isn't subscribed or the iter method doesn't exist.
 */
function tryIter(tableHandle: any, callback: (row: any) => void): void {
  _shapeCount = 0;
  try {
    if (!tableHandle?.iter) return;
    for (const row of tableHandle.iter()) {
      callback(row);
    }
  } catch {
    // Subscription data might not be ready yet — tolerate
  }
}
