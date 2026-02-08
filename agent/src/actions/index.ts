/**
 * NPC Actions — each maps 1:1 to an existing SpacetimeDB reducer.
 *
 * Actions:
 *   - Validate preconditions locally (distance checks, cooldowns)
 *   - Call the reducer through the SpacetimeDB connection
 *   - Fail safely if state is stale
 *   - NEVER bypass collision or server rules
 *
 * The server remains authoritative — these are just requests.
 */

import { SpacetimeConnection } from '../npc-agent.js';
import { Blackboard } from '../types.js';
import { resolveAgentCollision } from '../agent-collision.js';

// ---------------------------------------------------------------------------
// Constants matching server physics
// ---------------------------------------------------------------------------

/** Server walk speed: 320 px/s */
export const WALK_SPEED = 320;
/** Server sprint speed: 320 * 1.75 = 560 px/s */
export const SPRINT_SPEED = 560;
/** Fast loop tick rate */
export const TICK_HZ = 10;
/** Walk distance per tick */
export const WALK_PER_TICK = WALK_SPEED / TICK_HZ; // 32
/** Sprint distance per tick */
export const SPRINT_PER_TICK = SPRINT_SPEED / TICK_HZ; // 56

/** World size in pixels (600 tiles * 48px) */
export const WORLD_SIZE = 28800;
/** Stay this far from world edges */
export const WORLD_MARGIN = 400;

/** Distance to interact with resources */
export const GATHER_RANGE = 80;
/** Distance to pick up dropped items */
export const PICKUP_RANGE = 80;

/** Hostile mob this close triggers flee */
export const FLEE_TRIGGER_RANGE = 350;
/** How long to keep fleeing (ms) */
export const FLEE_DURATION_MS = 4000;

/** How far to search for resources to walk toward */
export const RESOURCE_SEEK_RANGE = 800;
/** How far to search for dropped items */
export const DROPPED_ITEM_SEEK_RANGE = 400;

/** Exploration waypoint distance range */
export const EXPLORE_MIN_DIST = 800;
export const EXPLORE_MAX_DIST = 3000;
/** Max time to pursue one explore waypoint before picking a new one */
export const EXPLORE_TIMEOUT_MS = 60_000;

/** Hostile species that NPCs should flee from (or warriors hunt).
 *  Must match AnimalSpecies enum variant names from server/src/wild_animal_npc/core.rs */
export const HOSTILE_SPECIES = new Set([
  'TundraWolf',     // regular hostile predator
  'CableViper',     // regular hostile predator
  'Wolverine',      // fearless aggressive predator, attacks on sight
  'SalmonShark',    // aquatic predator (water only)
  'PolarBear',      // alpine apex predator, massive damage
  'SnowyOwl',       // alpine flying predator, aggressive within 200px
  'Shorebound',     // night-only hostile NPC — stalker
  'Shardkin',       // night-only hostile NPC — swarmer
  'DrownedWatch',   // night-only hostile NPC — brute
  'Bee',            // hive defenders, tiny fast attackers
]);

/** Passive/neutral species that warriors can hunt for loot.
 *  Must match AnimalSpecies enum variant names from server/src/wild_animal_npc/core.rs */
export const HUNTABLE_SPECIES = new Set([
  'CinderFox',      // regular wildlife, drops Fox Fur
  'Caribou',        // large herbivore, drops leather/bone
  'ArcticWalrus',   // large animal
  'Hare',           // alpine prey, fast fleeing
  'Vole',           // tiny skittish rodent
  'BeachCrab',      // drops Crab Carapace, Crab Claw
  'Tern',           // scavenger bird, drops Tern Feathers
  'Crow',           // thief bird, drops Crow Feathers
  'Jellyfish',      // aquatic passive, drops Jellyfish Membrane/Stinger
]);

/** Food item categories/names we can consume (partial matches) */
const FOOD_KEYWORDS = [
  'berry', 'blueberry', 'cloudberry', 'mushroom', 'chanterelle',
  'meat', 'cooked', 'fish', 'stew', 'broth', 'soup', 'bread',
  'jerky', 'sausage', 'egg', 'porridge', 'pie', 'cake', 'fruit',
];

/** Water item names */
const WATER_KEYWORDS = ['water', 'flask', 'canteen', 'bottle'];

/** Water container item names (for filling, not consuming) */
const WATER_CONTAINER_KEYWORDS = ['water bottle', 'canteen', 'flask', 'jug', 'waterskin', 'reed water bottle', 'plastic water jug'];

/** How far to seek barrels */
export const BARREL_SEEK_RANGE = 600;
/** Melee range to attack barrel (must be in use_equipped_item range) */
export const BARREL_ATTACK_RANGE = 60;
/** Minimum time between barrel attacks (ms) */
export const BARREL_ATTACK_COOLDOWN_MS = 1200;

/** How far to seek animal corpses to loot */
export const CORPSE_SEEK_RANGE = 500;
/** Interaction range with corpse */
export const CORPSE_INTERACT_RANGE = 80;

/** Cooldown between natural water drinks/fills (ms) */
export const WATER_ACTION_COOLDOWN_MS = 2000;

/** Number of ticks between stuck checks */
export const STUCK_CHECK_INTERVAL_TICKS = 30; // every 3s
/** Minimum movement (px) expected between stuck checks to NOT be stuck */
export const STUCK_MOVEMENT_THRESHOLD = 40;
/** How many consecutive stuck checks before we consider truly stuck */
export const STUCK_COUNT_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// MOVE_TO — calls update_player_position_simple
// ---------------------------------------------------------------------------

/**
 * Move toward (tx, ty) by one tick's worth of movement.
 * Returns true when the NPC has arrived (within threshold).
 */
export function executeMoveTo(
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  tx: number,
  ty: number,
  sprint: boolean,
  arrivalThreshold: number = 20
): boolean {
  const dx = tx - selfX;
  const dy = ty - selfY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist <= arrivalThreshold) {
    return true; // Arrived
  }

  const speed = sprint ? SPRINT_PER_TICK : WALK_PER_TICK;
  const step = Math.min(speed, dist);
  const nx = dx / dist;
  const ny = dy / dist;
  let newX = selfX + nx * step;
  let newY = selfY + ny * step;

  // Clamp to world bounds
  newX = clampToWorld(newX);
  newY = clampToWorld(newY);

  // Resolve collisions with world entities (trees, stones, etc.)
  const selfId = conn.identity?.toHexString?.() ?? '';
  const resolved = resolveAgentCollision(conn.db, selfId, selfX, selfY, newX, newY);
  newX = resolved.x;
  newY = resolved.y;

  const direction = getFacingDirection(nx, ny);

  try {
    conn.reducers.updatePlayerPositionSimple(
      newX,
      newY,
      BigInt(Date.now()),
      sprint,
      direction,
      BigInt(0)
    );
  } catch (err) {
    console.debug(`[Action:MOVE_TO] Reducer failed:`, err);
  }

  return false;
}

// ---------------------------------------------------------------------------
// ATTACK — calls use_equipped_item
// ---------------------------------------------------------------------------

/**
 * Attack using equipped item. Returns true (instant action).
 */
export function executeAttack(conn: SpacetimeConnection): boolean {
  try {
    conn.reducers.useEquippedItem();
  } catch (err) {
    console.debug(`[Action:ATTACK] Reducer failed:`, err);
  }
  return true;
}

// ---------------------------------------------------------------------------
// FIRE RANGED — calls fire_projectile (for bows, crossbows, guns)
// ---------------------------------------------------------------------------

/**
 * Fire the equipped ranged weapon at a target position.
 * Uses the same fire_projectile reducer as human players.
 * Returns true (instant action).
 */
export function executeFireProjectile(
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  targetX: number,
  targetY: number
): boolean {
  try {
    conn.reducers.fireProjectile(targetX, targetY, selfX, selfY);
  } catch (err) {
    console.debug(`[Action:FIRE_PROJECTILE] Reducer failed:`, err);
  }
  return true;
}

/**
 * Check if the currently equipped weapon is ranged (bow, crossbow, gun).
 * If so, the NPC should use fire_projectile instead of use_equipped_item.
 */
export function isEquippedWeaponRanged(db: any, selfId: string): boolean {
  try {
    if (!db.activeEquipment?.iter) return false;
    for (const ae of db.activeEquipment.iter()) {
      const ownerId = ae.playerIdentity?.toHexString?.() ?? String(ae.playerIdentity);
      if (ownerId !== selfId) continue;

      const defId = ae.equippedItemDefId;
      if (!defId) return false;

      // Look up the item definition to check category
      for (const def of db.itemDefinition.iter()) {
        if (def.id === defId) {
          return (def.category?.tag ?? '') === 'RangedWeapon';
        }
      }
      return false;
    }
  } catch { /* tolerate */ }
  return false;
}

// ---------------------------------------------------------------------------
// GATHER — calls interact_with_harvestable_resource
// ---------------------------------------------------------------------------

/**
 * Gather from a harvestable resource node.
 * Returns true when the gather action is dispatched.
 * Precondition: must be within interaction range.
 */
export function executeGather(
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  resourceId: bigint
): boolean {
  const resource = findResource(conn.db, resourceId);
  if (!resource) return true; // Not found, skip

  // Check if resource is depleted
  if (isResourceDepleted(resource)) return true;

  const rx = resource.posX ?? 0;
  const ry = resource.posY ?? 0;
  const dist = distance(selfX, selfY, rx, ry);

  if (dist > GATHER_RANGE) {
    // Not close enough — walk toward it
    executeMoveTo(conn, selfX, selfY, rx, ry, false, GATHER_RANGE * 0.8);
    return false;
  }

  try {
    conn.reducers.interactWithHarvestableResource(resourceId);
  } catch (err) {
    console.debug(`[Action:GATHER] Reducer failed:`, err);
  }
  return true;
}

// ---------------------------------------------------------------------------
// PICKUP — calls pickup_dropped_item
// ---------------------------------------------------------------------------

/**
 * Pick up a dropped item. Walks toward it if needed.
 * Returns true when done or item is gone.
 */
export function executePickup(
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  droppedItemId: bigint
): boolean {
  const item = findDroppedItem(conn.db, droppedItemId);
  if (!item) return true; // Gone

  const ix = item.posX ?? 0;
  const iy = item.posY ?? 0;
  const dist = distance(selfX, selfY, ix, iy);

  if (dist > PICKUP_RANGE) {
    executeMoveTo(conn, selfX, selfY, ix, iy, false, PICKUP_RANGE * 0.7);
    return false;
  }

  try {
    conn.reducers.pickupDroppedItem(droppedItemId);
  } catch (err) {
    console.debug(`[Action:PICKUP] Reducer failed:`, err);
  }
  return true;
}

// ---------------------------------------------------------------------------
// EAT — consume food from inventory
// ---------------------------------------------------------------------------

/**
 * Find and consume a food item from inventory.
 * Returns true if an item was consumed or no food available.
 */
export function executeEat(
  conn: SpacetimeConnection,
  selfId: string
): boolean {
  const food = findConsumableInInventory(conn.db, selfId, FOOD_KEYWORDS);
  if (!food) return false; // No food found

  try {
    conn.reducers.consumeItem(food.instanceId);
    return true;
  } catch (err) {
    console.debug(`[Action:EAT] Reducer failed:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// DRINK — consume water from inventory
// ---------------------------------------------------------------------------

/**
 * Find and consume a water item from inventory.
 * Returns true if an item was consumed or no water available.
 */
export function executeDrink(
  conn: SpacetimeConnection,
  selfId: string
): boolean {
  // First try filled water containers
  const water = findConsumableInInventory(conn.db, selfId, WATER_KEYWORDS);
  if (!water) return false;

  try {
    // Try the water-specific reducer first, fallback to generic consume
    conn.reducers.consumeFilledWaterContainer(water.instanceId);
    return true;
  } catch {
    try {
      conn.reducers.consumeItem(water.instanceId);
      return true;
    } catch (err) {
      console.debug(`[Action:DRINK] Reducer failed:`, err);
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// CRAFT — calls start_crafting
// ---------------------------------------------------------------------------

export function executeCraft(
  conn: SpacetimeConnection,
  recipeId: number
): boolean {
  try {
    conn.reducers.startCrafting(BigInt(recipeId));
  } catch (err) {
    console.debug(`[Action:CRAFT] Reducer failed:`, err);
  }
  return true;
}

// ---------------------------------------------------------------------------
// EQUIP — calls set_active_item_reducer
// ---------------------------------------------------------------------------

export function executeEquip(
  conn: SpacetimeConnection,
  itemInstanceId: number
): boolean {
  try {
    conn.reducers.setActiveItemReducer(BigInt(itemInstanceId));
  } catch (err) {
    console.debug(`[Action:EQUIP] Reducer failed:`, err);
  }
  return true;
}

// ---------------------------------------------------------------------------
// SAY — calls send_message
// ---------------------------------------------------------------------------

export function executeSay(
  conn: SpacetimeConnection,
  message: string
): boolean {
  if (!message || message.length === 0) return true;
  try {
    conn.reducers.sendMessage(message.slice(0, 200));
  } catch (err) {
    console.debug(`[Action:SAY] Reducer failed:`, err);
  }
  return true;
}

// ---------------------------------------------------------------------------
// FLEE — sprint away from threats
// ---------------------------------------------------------------------------

/**
 * Flee from the nearest hostile mob by sprinting in opposite direction.
 * Sets the flee angle on the blackboard.
 */
export function executeFlee(
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  threatX: number,
  threatY: number,
  bb: Blackboard
): void {
  // Calculate direction away from threat
  const dx = selfX - threatX;
  const dy = selfY - threatY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  let fleeAngle: number;
  if (dist < 1) {
    // On top of threat — pick random direction
    fleeAngle = Math.random() * Math.PI * 2;
  } else {
    // Away from threat with ±30° randomness to avoid predictable lines
    fleeAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
  }

  bb.fleeAngle = fleeAngle;
  bb.isSprinting = true;

  let fleeX = clampToWorld(selfX + Math.cos(fleeAngle) * SPRINT_PER_TICK);
  let fleeY = clampToWorld(selfY + Math.sin(fleeAngle) * SPRINT_PER_TICK);

  // Resolve collisions with world entities while fleeing
  const selfId = conn.identity?.toHexString?.() ?? '';
  const resolved = resolveAgentCollision(conn.db, selfId, selfX, selfY, fleeX, fleeY);
  fleeX = resolved.x;
  fleeY = resolved.y;

  const direction = getFacingDirection(Math.cos(fleeAngle), Math.sin(fleeAngle));

  try {
    conn.reducers.updatePlayerPositionSimple(
      fleeX,
      fleeY,
      BigInt(Date.now()),
      true, // Sprint while fleeing!
      direction,
      BigInt(0)
    );
  } catch (err) {
    console.debug(`[Action:FLEE] Reducer failed:`, err);
  }
}

// ---------------------------------------------------------------------------
// World scanning helpers (read from SpacetimeDB client cache)
// ---------------------------------------------------------------------------

/** Find the nearest hostile mob within range */
export function findNearestHostile(
  db: any,
  selfX: number,
  selfY: number,
  maxRange: number
): { id: bigint; x: number; y: number; dist: number; species: string } | null {
  let closest: { id: bigint; x: number; y: number; dist: number; species: string } | null = null;
  try {
    for (const mob of db.wildAnimal.iter()) {
      const species = mob.species?.tag ?? '';
      if (!HOSTILE_SPECIES.has(species)) continue;
      if ((mob.health ?? 0) <= 0) continue;

      const mx = mob.posX ?? 0;
      const my = mob.posY ?? 0;
      const d = distance(selfX, selfY, mx, my);
      if (d < maxRange && (!closest || d < closest.dist)) {
        closest = { id: mob.id, x: mx, y: my, dist: d, species };
      }
    }
  } catch { /* tolerate */ }
  return closest;
}

/** Find the nearest huntable (passive) mob within range */
export function findNearestHuntable(
  db: any,
  selfX: number,
  selfY: number,
  maxRange: number
): { id: bigint; x: number; y: number; dist: number; species: string } | null {
  let closest: { id: bigint; x: number; y: number; dist: number; species: string } | null = null;
  try {
    for (const mob of db.wildAnimal.iter()) {
      const species = mob.species?.tag ?? '';
      if (!HUNTABLE_SPECIES.has(species)) continue;
      if ((mob.health ?? 0) <= 0) continue;

      const mx = mob.posX ?? 0;
      const my = mob.posY ?? 0;
      const d = distance(selfX, selfY, mx, my);
      if (d < maxRange && (!closest || d < closest.dist)) {
        closest = { id: mob.id, x: mx, y: my, dist: d, species };
      }
    }
  } catch { /* tolerate */ }
  return closest;
}

/** Find the nearest available (not depleted) harvestable resource */
/** Find the nearest harvestable resource within range. No role preferences — grab whatever's closest. */
export function findNearestResource(
  db: any,
  selfX: number,
  selfY: number,
  maxRange: number
): { id: bigint; x: number; y: number; dist: number; type: string } | null {
  let closest: { id: bigint; x: number; y: number; dist: number; type: string } | null = null;

  try {
    for (const r of db.harvestableResource.iter()) {
      if (isResourceDepleted(r)) continue;

      const rx = r.posX ?? 0;
      const ry = r.posY ?? 0;
      const d = distance(selfX, selfY, rx, ry);
      if (d > maxRange) continue;

      if (!closest || d < closest.dist) {
        closest = { id: r.id, x: rx, y: ry, dist: d, type: r.plantType?.tag ?? 'Unknown' };
      }
    }
  } catch { /* tolerate */ }

  return closest;
}

/** Find the nearest dropped item */
export function findNearestDroppedItem(
  db: any,
  selfX: number,
  selfY: number,
  maxRange: number
): { id: bigint; x: number; y: number; dist: number } | null {
  let closest: { id: bigint; x: number; y: number; dist: number } | null = null;
  try {
    for (const item of db.droppedItem.iter()) {
      const ix = item.posX ?? 0;
      const iy = item.posY ?? 0;
      const d = distance(selfX, selfY, ix, iy);
      if (d < maxRange && (!closest || d < closest.dist)) {
        closest = { id: item.id, x: ix, y: iy, dist: d };
      }
    }
  } catch { /* tolerate */ }
  return closest;
}

// ---------------------------------------------------------------------------
// TREE / STONE finding
// ---------------------------------------------------------------------------

const UNIX_EPOCH_MICROS = 0n; // Timestamp.UNIX_EPOCH is 0 microseconds

/** Find the nearest alive tree within range. */
export function findNearestTree(
  db: any,
  selfX: number,
  selfY: number,
  maxRange: number
): { id: bigint; x: number; y: number; dist: number } | null {
  let closest: { id: bigint; x: number; y: number; dist: number } | null = null;
  try {
    for (const tree of db.tree.iter()) {
      // Skip destroyed/respawning trees (respawnAt > UNIX_EPOCH)
      const respawnMicros = tree.respawnAt?.microsSinceUnixEpoch ?? 0n;
      if (respawnMicros > UNIX_EPOCH_MICROS) continue;
      if ((tree.health ?? 0) <= 0) continue;

      const tx = tree.posX ?? 0;
      const ty = tree.posY ?? 0;
      const d = distance(selfX, selfY, tx, ty);
      if (d < maxRange && (!closest || d < closest.dist)) {
        closest = { id: tree.id, x: tx, y: ty, dist: d };
      }
    }
  } catch { /* tolerate */ }
  return closest;
}

/** Find the nearest alive stone node within range. */
export function findNearestStone(
  db: any,
  selfX: number,
  selfY: number,
  maxRange: number
): { id: bigint; x: number; y: number; dist: number } | null {
  let closest: { id: bigint; x: number; y: number; dist: number } | null = null;
  try {
    for (const stone of db.stone.iter()) {
      // Skip destroyed/respawning stones (respawnAt > UNIX_EPOCH)
      const respawnMicros = stone.respawnAt?.microsSinceUnixEpoch ?? 0n;
      if (respawnMicros > UNIX_EPOCH_MICROS) continue;
      if ((stone.health ?? 0) <= 0) continue;

      const sx = stone.posX ?? 0;
      const sy = stone.posY ?? 0;
      const d = distance(selfX, selfY, sx, sy);
      if (d < maxRange && (!closest || d < closest.dist)) {
        closest = { id: stone.id, x: sx, y: sy, dist: d };
      }
    }
  } catch { /* tolerate */ }
  return closest;
}

/**
 * Find the best tool in inventory for a specific target type.
 *
 * For 'Tree': prefers Metal Hatchet > Stone Hatchet > Bush Knife > (any tool)
 * For 'Stone': prefers Metal Pickaxe > Stone Pickaxe > (any tool)
 * Falls back to Combat Ladle or Rock which deal minimal damage but work.
 */
export function findToolForTarget(
  db: any,
  selfId: string,
  targetType: 'Tree' | 'Stone'
): FoundItem | null {
  try {
    // Build item def lookup
    const defNames = new Map<string, string>();
    const defTargetTypes = new Map<string, string>();
    const defCategories = new Map<string, string>();
    for (const def of db.itemDefinition.iter()) {
      const did = String(def.id);
      defNames.set(did, def.name ?? '');
      defTargetTypes.set(did, def.primaryTargetType?.tag ?? '');
      defCategories.set(did, def.category?.tag ?? '');
    }

    // Priority tiers for each target type
    const tierMap: Record<string, string[]> =
      targetType === 'Tree'
        ? {
            tier1: ['Metal Hatchet'],
            tier2: ['Stone Hatchet', 'Bush Knife'],
          }
        : {
            tier1: ['Metal Pickaxe'],
            tier2: ['Stone Pickaxe'],
          };

    let tier1: FoundItem | null = null;
    let tier2: FoundItem | null = null;
    let anyToolOrWeapon: FoundItem | null = null;

    for (const item of db.inventoryItem.iter()) {
      const locTag = item.location?.tag ?? '';
      if (locTag !== 'Inventory' && locTag !== 'Hotbar') continue;
      const ownerId = item.location?.value?.ownerId?.toHexString?.() ?? '';
      if (ownerId !== selfId) continue;

      const defIdStr = String(item.itemDefId ?? 0);
      const name = defNames.get(defIdStr) ?? '';
      const category = defCategories.get(defIdStr) ?? '';
      const entry: FoundItem = { instanceId: item.instanceId, defId: item.itemDefId, name };

      if (tierMap.tier1.includes(name)) { tier1 = entry; continue; }
      if (tierMap.tier2.includes(name)) { tier2 = entry; continue; }
      // Any tool or weapon works as fallback (Combat Ladle, Rock, any melee weapon)
      if ((category === 'Tool' || category === 'Weapon') && !anyToolOrWeapon) {
        anyToolOrWeapon = entry;
      }
    }

    return tier1 ?? tier2 ?? anyToolOrWeapon;
  } catch { /* tolerate */ }
  return null;
}

/** Check if a tree is still alive (not destroyed/respawning). */
export function isTreeAlive(db: any, treeId: bigint): boolean {
  try {
    for (const tree of db.tree.iter()) {
      if (tree.id === treeId) {
        const respawnMicros = tree.respawnAt?.microsSinceUnixEpoch ?? 0n;
        return respawnMicros <= UNIX_EPOCH_MICROS && (tree.health ?? 0) > 0;
      }
    }
  } catch { /* tolerate */ }
  return false;
}

/** Check if a stone node is still alive (not destroyed/respawning). */
export function isStoneAlive(db: any, stoneId: bigint): boolean {
  try {
    for (const stone of db.stone.iter()) {
      if (stone.id === stoneId) {
        const respawnMicros = stone.respawnAt?.microsSinceUnixEpoch ?? 0n;
        return respawnMicros <= UNIX_EPOCH_MICROS && (stone.health ?? 0) > 0;
      }
    }
  } catch { /* tolerate */ }
  return false;
}

/** Find nearest online player (non-self) */
export function findNearestPlayer(
  db: any,
  selfId: string,
  selfX: number,
  selfY: number,
  maxRange: number,
  excludeNpcs: boolean = false
): { id: string; x: number; y: number; dist: number; name: string } | null {
  let closest: { id: string; x: number; y: number; dist: number; name: string } | null = null;
  try {
    for (const p of db.player.iter()) {
      const pid = p.identity?.toHexString?.() ?? String(p.identity);
      if (pid === selfId) continue;
      if (!(p.isOnline ?? false)) continue;
      if (p.isDead ?? false) continue;
      if (excludeNpcs && (p.isNpc ?? false)) continue;

      const px = p.positionX ?? 0;
      const py = p.positionY ?? 0;
      const d = distance(selfX, selfY, px, py);
      if (d < maxRange && (!closest || d < closest.dist)) {
        closest = { id: pid, x: px, y: py, dist: d, name: p.username ?? 'Unknown' };
      }
    }
  } catch { /* tolerate */ }
  return closest;
}

// ---------------------------------------------------------------------------
// Inventory helpers
// ---------------------------------------------------------------------------

export interface FoundItem {
  instanceId: bigint;
  defId: bigint;
  name: string;
}

/**
 * Find a consumable item in the player's inventory matching keywords.
 */
function findConsumableInInventory(
  db: any,
  selfId: string,
  keywords: string[]
): FoundItem | null {
  try {
    // Build item def name lookup
    const defNames = new Map<string, string>();
    const defCategories = new Map<string, string>();
    for (const def of db.itemDefinition.iter()) {
      defNames.set(String(def.id), def.name ?? '');
      defCategories.set(String(def.id), def.category?.tag ?? '');
    }

    for (const item of db.inventoryItem.iter()) {
      // Check ownership — item must be in our Inventory or Hotbar
      const locTag = item.location?.tag ?? '';
      if (locTag !== 'Inventory' && locTag !== 'Hotbar') continue;

      const ownerId = item.location?.value?.ownerId?.toHexString?.() ?? '';
      if (ownerId !== selfId) continue;

      const defIdStr = String(item.itemDefId ?? 0);
      const category = defCategories.get(defIdStr) ?? '';
      const name = (defNames.get(defIdStr) ?? '').toLowerCase();

      // Must be consumable category or match food/water keywords
      const isConsumable = category === 'Consumable';
      const matchesKeyword = keywords.some((kw) => name.includes(kw));

      if (isConsumable || matchesKeyword) {
        return {
          instanceId: item.instanceId,
          defId: item.itemDefId,
          name: defNames.get(defIdStr) ?? 'Unknown',
        };
      }
    }
  } catch { /* tolerate */ }
  return null;
}

/**
 * Check if the NPC actually has a weapon/tool equipped via the active_equipment cache.
 * This reads the server-authoritative state instead of relying on a stale boolean.
 */
export function hasActiveWeaponEquipped(db: any, selfId: string): boolean {
  try {
    if (!db.activeEquipment?.iter) return false;
    for (const ae of db.activeEquipment.iter()) {
      const ownerId = ae.playerIdentity?.toHexString?.() ?? String(ae.playerIdentity);
      if (ownerId !== selfId) continue;
      // Check if there's an actual item instance equipped
      const instanceId = ae.equippedItemInstanceId;
      if (instanceId !== null && instanceId !== undefined && instanceId !== 0n) {
        return true;
      }
      return false;
    }
  } catch { /* tolerate */ }
  return false;
}

/**
 * Find the best weapon in inventory to equip.
 * Priority: Melee Weapon > RangedWeapon (only if ammo available) > Tool
 * This prevents NPCs from equipping a bow with no arrows (which would
 * make use_equipped_item fail since ranged weapons require fire_projectile).
 */
export function findWeaponInInventory(
  db: any,
  selfId: string
): FoundItem | null {
  try {
    const defCategories = new Map<string, string>();
    const defNames = new Map<string, string>();
    const defAmmoTypes = new Map<string, string>(); // ammoType tag per def
    for (const def of db.itemDefinition.iter()) {
      const defIdStr = String(def.id);
      defCategories.set(defIdStr, def.category?.tag ?? '');
      defNames.set(defIdStr, def.name ?? '');
      if (def.ammoType) {
        defAmmoTypes.set(defIdStr, def.ammoType.tag ?? '');
      }
    }

    // Collect owned items from inventory/hotbar
    const ownedItems: Array<{ instanceId: bigint; defId: bigint; category: string; name: string }> = [];
    for (const item of db.inventoryItem.iter()) {
      const locTag = item.location?.tag ?? '';
      if (locTag !== 'Inventory' && locTag !== 'Hotbar') continue;
      const ownerId = item.location?.value?.ownerId?.toHexString?.() ?? '';
      if (ownerId !== selfId) continue;
      const defIdStr = String(item.itemDefId ?? 0);
      ownedItems.push({
        instanceId: item.instanceId,
        defId: item.itemDefId,
        category: defCategories.get(defIdStr) ?? '',
        name: defNames.get(defIdStr) ?? 'Unknown',
      });
    }

    // Pass 1: Find best melee weapon (always preferred — works with use_equipped_item)
    for (const item of ownedItems) {
      if (item.category === 'Weapon') {
        return { instanceId: item.instanceId, defId: item.defId, name: item.name };
      }
    }

    // Pass 2: Find ranged weapon — but ONLY if we have matching ammo
    for (const item of ownedItems) {
      if (item.category === 'RangedWeapon') {
        if (hasAmmoForWeapon(db, selfId, item.defId)) {
          return { instanceId: item.instanceId, defId: item.defId, name: item.name };
        }
      }
    }

    // Pass 3: Fallback to tool
    for (const item of ownedItems) {
      if (item.category === 'Tool') {
        return { instanceId: item.instanceId, defId: item.defId, name: item.name };
      }
    }
  } catch { /* tolerate */ }
  return null;
}

/**
 * Determine the required AmmoType tag for a ranged weapon.
 * Mirrors the server's `load_ranged_weapon` logic in active_equipment.rs:
 *   - Firearms (damageType Projectile + name match) → 'Bullet'
 *   - Harpoon-class weapons → 'HarpoonDart'
 *   - Everything else (bows, crossbows) → 'Arrow'
 *
 * Reads weapon names from the DB's item_definition table, so new weapons
 * that follow the server's naming convention work automatically.
 */
function getRequiredAmmoTag(db: any, weaponDefId: bigint): string {
  try {
    for (const def of db.itemDefinition.iter()) {
      if (def.id !== weaponDefId) continue;
      const name: string = def.name ?? '';
      // Server: is_firearm = name == "Makarov PM" || name == "PP-91 KEDR"
      // Server: is_harpoon_gun = name == "Reed Harpoon Gun"
      // Default: Arrow for all other ranged weapons
      if (name === 'Makarov PM' || name === 'PP-91 KEDR') return 'Bullet';
      if (name.includes('Harpoon Gun')) return 'HarpoonDart';
      return 'Arrow'; // Bows, crossbows, and any future bow-like weapons
    }
  } catch { /* tolerate */ }
  return 'Arrow'; // Safe default — most ranged weapons use arrows
}

/**
 * Check if the player has ammunition compatible with a ranged weapon.
 * Reads ammo type tags directly from the item_definition table —
 * no hardcoded ammo item names, so new arrow/bullet types added in
 * ammunition.rs are picked up automatically.
 */
function hasAmmoForWeapon(db: any, selfId: string, weaponDefId: bigint): boolean {
  const requiredTag = getRequiredAmmoTag(db, weaponDefId);

  try {
    // Build lookup: defId → ammoType tag (only for Ammunition items)
    const ammoTagByDefId = new Map<string, string>();
    for (const def of db.itemDefinition.iter()) {
      if ((def.category?.tag ?? '') === 'Ammunition' && def.ammoType) {
        ammoTagByDefId.set(String(def.id), def.ammoType.tag ?? '');
      }
    }

    // Scan inventory for any compatible ammo with quantity > 0
    for (const item of db.inventoryItem.iter()) {
      const locTag = item.location?.tag ?? '';
      if (locTag !== 'Inventory' && locTag !== 'Hotbar') continue;
      const ownerId = item.location?.value?.ownerId?.toHexString?.() ?? '';
      if (ownerId !== selfId) continue;

      const defIdStr = String(item.itemDefId ?? 0);
      const tag = ammoTagByDefId.get(defIdStr);
      if (tag === requiredTag && (item.quantity ?? 0) > 0) {
        return true;
      }
    }
  } catch { /* tolerate */ }
  return false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findResource(db: any, resourceId: bigint): any | null {
  try {
    for (const r of db.harvestableResource.iter()) {
      if (r.id === resourceId) return r;
    }
  } catch { /* tolerate */ }
  return null;
}

function findDroppedItem(db: any, itemId: bigint): any | null {
  try {
    for (const item of db.droppedItem.iter()) {
      if (item.id === itemId) return item;
    }
  } catch { /* tolerate */ }
  return null;
}

function isResourceDepleted(r: any): boolean {
  // respawnAt is a Timestamp; if it's set and non-zero, the resource is depleted
  const respawnAt = r.respawnAt;
  if (!respawnAt) return false;
  // SpacetimeDB Timestamps are objects — check if microsSinceEpoch > 0
  if (typeof respawnAt === 'object' && respawnAt.microsSinceEpoch !== undefined) {
    return respawnAt.microsSinceEpoch > 0n;
  }
  return false;
}

export function getFacingDirection(nx: number, ny: number): string {
  if (Math.abs(nx) > Math.abs(ny)) {
    return nx > 0 ? 'right' : 'left';
  }
  return ny > 0 ? 'down' : 'up';
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function clampToWorld(v: number): number {
  return Math.max(WORLD_MARGIN, Math.min(WORLD_SIZE - WORLD_MARGIN, v));
}

/**
 * Generate a random exploration waypoint within the world.
 * Biased toward being far from the current position to encourage real exploration.
 */
export function randomExploreTarget(selfX: number, selfY: number): { x: number; y: number } {
  // Pick a random angle and distance
  const angle = Math.random() * Math.PI * 2;
  const dist = EXPLORE_MIN_DIST + Math.random() * (EXPLORE_MAX_DIST - EXPLORE_MIN_DIST);
  let x = selfX + Math.cos(angle) * dist;
  let y = selfY + Math.sin(angle) * dist;

  // Clamp to world
  x = clampToWorld(x);
  y = clampToWorld(y);

  // If too close after clamping (near world edge), try opposite direction
  if (distance(selfX, selfY, x, y) < EXPLORE_MIN_DIST * 0.5) {
    x = clampToWorld(selfX - Math.cos(angle) * dist);
    y = clampToWorld(selfY - Math.sin(angle) * dist);
  }

  return { x, y };
}

// ---------------------------------------------------------------------------
// BARREL — find and attack destructible barrels for loot
// ---------------------------------------------------------------------------

/** Find the nearest barrel that is alive (health > 0) within range */
export function findNearestBarrel(
  db: any,
  selfX: number,
  selfY: number,
  maxRange: number
): { id: bigint; x: number; y: number; dist: number; health: number } | null {
  let closest: { id: bigint; x: number; y: number; dist: number; health: number } | null = null;
  try {
    if (!db.barrel?.iter) return null;
    for (const b of db.barrel.iter()) {
      const health = b.health ?? 0;
      if (health <= 0) continue;

      const bx = b.posX ?? 0;
      const by = b.posY ?? 0;
      const d = distance(selfX, selfY, bx, by);
      if (d < maxRange && (!closest || d < closest.dist)) {
        closest = { id: b.id, x: bx, y: by, dist: d, health };
      }
    }
  } catch { /* tolerate */ }
  return closest;
}

/**
 * Walk toward a barrel and attack it when in range.
 * Returns true when the barrel is destroyed or gone.
 */
export function executeBarrelAttack(
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  barrelId: bigint
): boolean {
  // Find the barrel
  let barrel: { x: number; y: number; health: number } | null = null;
  try {
    if (conn.db.barrel?.iter) {
      for (const b of conn.db.barrel.iter()) {
        if (b.id === barrelId) {
          barrel = { x: b.posX ?? 0, y: b.posY ?? 0, health: b.health ?? 0 };
          break;
        }
      }
    }
  } catch { /* tolerate */ }

  if (!barrel || barrel.health <= 0) return true; // Gone or destroyed

  const dist = distance(selfX, selfY, barrel.x, barrel.y);

  if (dist > BARREL_ATTACK_RANGE) {
    // Walk toward barrel
    executeMoveTo(conn, selfX, selfY, barrel.x, barrel.y, false, BARREL_ATTACK_RANGE * 0.8);
    return false;
  }

  // In range — swing equipped item (server handles barrel damage detection)
  executeAttack(conn);
  return false; // Keep attacking until barrel is gone
}

// ---------------------------------------------------------------------------
// ANIMAL CORPSE — loot items from nearby corpses
// ---------------------------------------------------------------------------

/** Find the nearest animal corpse within range */
export function findNearestCorpse(
  db: any,
  selfX: number,
  selfY: number,
  maxRange: number
): { id: number; x: number; y: number; dist: number; species: string } | null {
  let closest: { id: number; x: number; y: number; dist: number; species: string } | null = null;
  try {
    if (!db.animalCorpse?.iter) return null;
    for (const c of db.animalCorpse.iter()) {
      const cx = c.posX ?? 0;
      const cy = c.posY ?? 0;
      const d = distance(selfX, selfY, cx, cy);
      if (d < maxRange && (!closest || d < closest.dist)) {
        const species = c.animalSpecies?.tag ?? 'Unknown';
        closest = { id: c.id, x: cx, y: cy, dist: d, species };
      }
    }
  } catch { /* tolerate */ }
  return closest;
}

/**
 * Walk toward corpse and loot items from it.
 * Returns true when looting is complete or corpse is gone.
 */
export function executeLootCorpse(
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  corpseId: number,
  slotIndex: number
): { done: boolean; nextSlot: number } {
  // Find the corpse
  let corpse: { x: number; y: number } | null = null;
  try {
    if (conn.db.animalCorpse?.iter) {
      for (const c of conn.db.animalCorpse.iter()) {
        if (c.id === corpseId) {
          corpse = { x: c.posX ?? 0, y: c.posY ?? 0 };
          break;
        }
      }
    }
  } catch { /* tolerate */ }

  if (!corpse) return { done: true, nextSlot: 0 }; // Gone

  const dist = distance(selfX, selfY, corpse.x, corpse.y);
  if (dist > CORPSE_INTERACT_RANGE) {
    executeMoveTo(conn, selfX, selfY, corpse.x, corpse.y, false, CORPSE_INTERACT_RANGE * 0.7);
    return { done: false, nextSlot: slotIndex };
  }

  // In range — quick-move items from corpse slots (try slots 0-5)
  if (slotIndex > 5) return { done: true, nextSlot: 0 };

  try {
    conn.reducers.quickMoveFromCorpse(corpseId, slotIndex);
  } catch {
    // Slot might be empty — that's fine, move to next
  }

  return { done: false, nextSlot: slotIndex + 1 };
}

// ---------------------------------------------------------------------------
// WATER MANAGEMENT — drink from natural sources, fill containers
// ---------------------------------------------------------------------------

/**
 * Drink directly from a natural water source (river/lake).
 * Requires standing on or near water tiles.
 * Returns true if the action was dispatched.
 */
export function executeDrinkNaturalWater(conn: SpacetimeConnection): boolean {
  try {
    conn.reducers.drinkWater();
    return true;
  } catch (err) {
    console.debug(`[Action:DRINK_WATER] Reducer failed:`, err);
    return false;
  }
}

/**
 * Fill a water container from a natural water source.
 * Requires standing on or near water tiles.
 * Returns true if the action was dispatched.
 */
export function executeFillWaterContainer(
  conn: SpacetimeConnection,
  selfId: string,
  fillAmountMl: number = 250
): boolean {
  const container = findWaterContainerInInventory(conn.db, selfId);
  if (!container) return false;

  try {
    conn.reducers.fillWaterContainerFromNaturalSource(container.instanceId, fillAmountMl);
    return true;
  } catch (err) {
    console.debug(`[Action:FILL_WATER] Reducer failed:`, err);
    return false;
  }
}

/** Find a water container (bottle/flask/jug) in inventory that can be filled */
export function findWaterContainerInInventory(
  db: any,
  selfId: string
): FoundItem | null {
  try {
    const defNames = new Map<string, string>();
    const defCategories = new Map<string, string>();
    for (const def of db.itemDefinition.iter()) {
      defNames.set(String(def.id), (def.name ?? '').toLowerCase());
      defCategories.set(String(def.id), def.category?.tag ?? '');
    }

    for (const item of db.inventoryItem.iter()) {
      const locTag = item.location?.tag ?? '';
      if (locTag !== 'Inventory' && locTag !== 'Hotbar' && locTag !== 'Equipped') continue;

      const ownerId = item.location?.value?.ownerId?.toHexString?.() ?? '';
      if (ownerId !== selfId) continue;

      const defIdStr = String(item.itemDefId ?? 0);
      const name = defNames.get(defIdStr) ?? '';

      // Match water container keywords
      const isWaterContainer = WATER_CONTAINER_KEYWORDS.some((kw) => name.includes(kw));
      if (isWaterContainer) {
        return {
          instanceId: item.instanceId,
          defId: item.itemDefId,
          name: defNames.get(defIdStr) ?? 'Unknown',
        };
      }
    }
  } catch { /* tolerate */ }
  return null;
}

// ---------------------------------------------------------------------------
// WEATHER — read current weather from world_state table
// ---------------------------------------------------------------------------

/** Get the current weather string from world_state */
export function getCurrentWeather(db: any): string {
  try {
    const iter = db.worldState?.iter?.() ?? db.world_state?.iter?.() ?? [];
    for (const ws of iter) {
      return ws.currentWeather?.tag ?? ws.current_weather?.tag ?? 'Clear';
    }
  } catch { /* tolerate */ }
  return 'Clear';
}

/** Check if it's currently raining */
export function isRaining(db: any): boolean {
  const weather = getCurrentWeather(db);
  return weather === 'LightRain' || weather === 'ModerateRain' ||
         weather === 'HeavyRain' || weather === 'HeavyStorm';
}

// ---------------------------------------------------------------------------
// STUCK DETECTION
// ---------------------------------------------------------------------------

/**
 * Check if an NPC appears stuck (hasn't moved significantly).
 * Call every STUCK_CHECK_INTERVAL_TICKS. Returns true if stuck.
 */
export function checkStuck(
  bb: import('../types.js').Blackboard,
  selfX: number,
  selfY: number
): boolean {
  if (!bb.lastStuckCheckPos) {
    bb.lastStuckCheckPos = { x: selfX, y: selfY };
    bb.lastStuckCheckTick = bb.tickCount;
    bb.stuckCounter = 0;
    return false;
  }

  const moved = distance(selfX, selfY, bb.lastStuckCheckPos.x, bb.lastStuckCheckPos.y);
  bb.lastStuckCheckPos = { x: selfX, y: selfY };
  bb.lastStuckCheckTick = bb.tickCount;

  if (moved < STUCK_MOVEMENT_THRESHOLD) {
    bb.stuckCounter++;
  } else {
    bb.stuckCounter = 0;
  }

  return bb.stuckCounter >= STUCK_COUNT_THRESHOLD;
}
