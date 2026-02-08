/**
 * Fast Loop — deterministic NPC tick at 10 Hz.
 *
 * This loop NEVER calls the LLM. It reads the current plan from
 * the blackboard and executes the next action step-by-step.
 * When no plan is active, NPCs behave autonomously based on role:
 *
 *   Priority (highest first):
 *   0. Dead → auto-respawn
 *   0.5. Stuck detection → reset targets and pick new explore waypoint
 *   1. Hostile mob nearby → FLEE (sprint)
 *   2. Critical hunger/thirst → consume food/water + natural water drinking
 *   2.5. Rain awareness → fill water containers when raining
 *   3. Proactive weapon equip → keep a weapon equipped at all times
 *   4. Active LLM plan → execute plan steps
 *   5. Role-specific behavior (gather / hunt / explore)
 *   5.3. Tree chopping → find trees, equip hatchet/tool, swing to harvest wood
 *   5.4. Stone mining → find stone nodes, equip pickaxe/tool, swing to harvest stone
 *   5.5. Barrel hunting → find and attack barrels for loot
 *   5.6. Corpse looting → pick up items from animal corpses
 *   5.7. Opportunistic water drinking/filling near water sources
 *   6. Opportunistic: gather nearby resources, pick up dropped items
 *   7. Explore the world — walk to distant waypoints
 *
 * All actions go through the same SpacetimeDB reducers as human players.
 */

import { NpcAgent, SpacetimeConnection } from './npc-agent.js';
import { Blackboard, PlanStep, ActionType } from './types.js';
import { buildAgentWorldState } from './world-state.js';
import {
  executeMoveTo,
  executeAttack,
  executeGather,
  executePickup,
  executeCraft,
  executeEquip,
  executeSay,
  executeFlee,
  executeEat,
  executeDrink,
  findNearestHostile,
  findNearestHuntable,
  findNearestResource,
  findNearestDroppedItem,
  findWeaponInInventory,
  hasActiveWeaponEquipped,
  isEquippedWeaponRanged,
  executeFireProjectile,
  findNearestTree,
  findNearestStone,
  findToolForTarget,
  isTreeAlive,
  isStoneAlive,
  randomExploreTarget,
  distance,
  clampToWorld,
  // New imports for barrel, corpse, water, stuck detection
  findNearestBarrel,
  executeBarrelAttack,
  findNearestCorpse,
  executeLootCorpse,
  executeDrinkNaturalWater,
  executeFillWaterContainer,
  findWaterContainerInInventory,
  isRaining,
  checkStuck,
  FLEE_TRIGGER_RANGE,
  FLEE_DURATION_MS,
  RESOURCE_SEEK_RANGE,
  DROPPED_ITEM_SEEK_RANGE,
  EXPLORE_TIMEOUT_MS,
  GATHER_RANGE,
  PICKUP_RANGE,
  WALK_PER_TICK,
  SPRINT_PER_TICK,
  BARREL_SEEK_RANGE,
  BARREL_ATTACK_COOLDOWN_MS,
  CORPSE_SEEK_RANGE,
  WATER_ACTION_COOLDOWN_MS,
  STUCK_CHECK_INTERVAL_TICKS,
} from './actions/index.js';

// ---------------------------------------------------------------------------
// Throttled logging — one message per NPC per label every N seconds
// ---------------------------------------------------------------------------

const LOG_INTERVAL_MS = 15_000;
const lastLog = new Map<string, number>();

function throttledLog(label: string, msg: string): void {
  const now = Date.now();
  if (now - (lastLog.get(label) ?? 0) >= LOG_INTERVAL_MS) {
    console.log(msg);
    lastLog.set(label, now);
  }
}

// No role-specific resource preferences — all NPCs gather whatever is closest.
// This keeps behavior simple and ensures NPCs actually collect useful resources
// instead of walking past nearby nodes to find their "preferred" type.

// Chat lines NPCs can say (by role)
const ROLE_CHAT_LINES: Record<string, string[]> = {
  gatherer: [
    'Found some good resources here.',
    'This area has plenty of wood.',
    'Watch out for wolves nearby.',
    'Need more fiber for crafting.',
  ],
  warrior: [
    'Stay alert, hostiles spotted.',
    'Heading out on patrol.',
    'This area is clear.',
    'I can hear wolves.',
  ],
  builder: [
    'Going to gather building materials.',
    'Lot of good stone around here.',
    'Need more wood for the walls.',
  ],
  crafter: [
    'Working on some new gear.',
    'Gathering materials for crafting.',
    'Anyone need tools?',
  ],
  scout: [
    'Scouting the area ahead.',
    'All clear this way.',
    'Spotted some resources to the north.',
    'Be careful, I saw hostiles.',
  ],
  explorer: [
    'What a view from here!',
    'This area looks unexplored.',
    'Heading into unknown territory.',
  ],
};

// ---------------------------------------------------------------------------
// Main tick function
// ---------------------------------------------------------------------------

/**
 * Run a single fast-loop tick for one NPC.
 * Called at ~10 Hz by the NpcAgent interval.
 */
export function runFastTick(
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection
): void {
  // Guard: SpacetimeDB TS SDK uses `isActive`, not `isConnected`
  if (!conn.isActive) return;

  bb.tickCount++;

  // Find self in the player table
  const selfPlayer = findSelf(conn.db, agent.identity);
  if (!selfPlayer) {
    throttledLog(
      `noself:${agent.character.username}`,
      `[FastLoop:${agent.character.username}] Waiting for subscription data...`
    );
    return;
  }

  const selfX: number = selfPlayer.positionX ?? 0;
  const selfY: number = selfPlayer.positionY ?? 0;
  const isDead: boolean = selfPlayer.isDead ?? false;
  const health: number = selfPlayer.health ?? 100;
  const hunger: number = selfPlayer.hunger ?? 50;
  const thirst: number = selfPlayer.thirst ?? 50;
  const stamina: number = selfPlayer.stamina ?? 100;
  const isOnWater: boolean = selfPlayer.isOnWater ?? false;

  // =========================================================================
  // PRIORITY 0: Dead → auto-respawn
  // =========================================================================
  if (isDead) {
    handleDeath(agent, bb, conn);
    return;
  }

  // =========================================================================
  // STUCK DETECTION — every 3 seconds, check if NPC hasn't moved
  // =========================================================================
  if (bb.tickCount % STUCK_CHECK_INTERVAL_TICKS === 0 && bb.tickCount > 0) {
    if (checkStuck(bb, selfX, selfY)) {
      throttledLog(
        `stuck:${agent.character.username}`,
        `[FastLoop:${agent.character.username}] STUCK detected — resetting targets, picking new explore waypoint`
      );
      // Clear all pursuit targets so we don't keep walking into walls
      bb.seekingResourceId = null;
      bb.seekingDroppedItemId = null;
      bb.seekingBarrelId = null;
      bb.seekingCorpseId = null;
      bb.seekingTreeId = null;
      bb.seekingStoneId = null;
      bb.huntTargetId = null;
      bb.exploreTarget = null;
      bb.autonomousMode = 'explore';
      bb.stuckCounter = 0;
      // Pick a completely new direction
      bb.exploreTarget = randomExploreTarget(selfX, selfY);
      bb.exploreTargetSetAt = Date.now();
    }
  }

  // =========================================================================
  // PRIORITY 1: Flee from hostile mobs (sprint!)
  // =========================================================================
  // Only scan for hostiles every 5 ticks (0.5s) to save CPU
  if (bb.tickCount % 5 === 0 || bb.autonomousMode === 'flee') {
    const hostile = findNearestHostile(conn.db, selfX, selfY, FLEE_TRIGGER_RANGE);

    if (hostile && agent.character.role !== 'warrior') {
      // Non-warriors flee from hostiles
      bb.autonomousMode = 'flee';
      bb.fleeStartMs = bb.fleeStartMs || Date.now();

      executeFlee(conn, selfX, selfY, hostile.x, hostile.y, bb);

      throttledLog(
        `flee:${agent.character.username}`,
        `[FastLoop:${agent.character.username}] FLEEING from ${hostile.species} (d:${Math.round(hostile.dist)}px) SPRINTING!`
      );
      return;
    }

    // If we were fleeing but the threat is gone (or enough time passed), stop
    if (bb.autonomousMode === 'flee') {
      if (!hostile || Date.now() - bb.fleeStartMs > FLEE_DURATION_MS) {
        bb.autonomousMode = 'explore';
        bb.fleeStartMs = 0;
        bb.isSprinting = false;
      } else {
        executeFlee(conn, selfX, selfY, hostile.x, hostile.y, bb);
        return;
      }
    }
  }

  // =========================================================================
  // PRIORITY 2: Critical survival — eat/drink (including natural water)
  // =========================================================================
  if (hunger < 20) {
    if (executeEat(conn, agent.identity!)) {
      throttledLog(
        `eat:${agent.character.username}`,
        `[FastLoop:${agent.character.username}] Eating food (hunger: ${Math.round(hunger)})`
      );
      return;
    }
  }

  if (thirst < 20) {
    // Try inventory water first
    if (executeDrink(conn, agent.identity!)) {
      throttledLog(
        `drink:${agent.character.username}`,
        `[FastLoop:${agent.character.username}] Drinking water from inventory (thirst: ${Math.round(thirst)})`
      );
      return;
    }
    // Fallback: drink from natural water source if we're near water
    const now = Date.now();
    if (isOnWater && now - bb.lastNaturalDrinkMs > WATER_ACTION_COOLDOWN_MS) {
      if (executeDrinkNaturalWater(conn)) {
        bb.lastNaturalDrinkMs = now;
        throttledLog(
          `drink_natural:${agent.character.username}`,
          `[FastLoop:${agent.character.username}] Drinking from natural water source (thirst: ${Math.round(thirst)})`
        );
        return;
      }
    }
  }

  // Also eat/drink at moderate levels occasionally (every 30 ticks = 3s)
  if (bb.tickCount % 30 === 0) {
    if (hunger < 40 && executeEat(conn, agent.identity!)) return;
    if (thirst < 40) {
      if (executeDrink(conn, agent.identity!)) return;
      // Natural water drinking at moderate thirst
      if (isOnWater && Date.now() - bb.lastNaturalDrinkMs > WATER_ACTION_COOLDOWN_MS) {
        if (executeDrinkNaturalWater(conn)) {
          bb.lastNaturalDrinkMs = Date.now();
          return;
        }
      }
    }
  }

  // =========================================================================
  // PRIORITY 2.5: Rain awareness — fill water containers when raining
  // =========================================================================
  if (bb.tickCount % 50 === 0) { // Check every 5s
    const now = Date.now();
    if (isRaining(conn.db) && now - bb.lastWaterFillMs > WATER_ACTION_COOLDOWN_MS) {
      // Try to fill a water container while it's raining (standing in rain)
      if (executeFillWaterContainer(conn, agent.identity!, 250)) {
        bb.lastWaterFillMs = now;
        throttledLog(
          `fill_rain:${agent.character.username}`,
          `[FastLoop:${agent.character.username}] Filling water container in the rain`
        );
        // Don't return — this is a passive bonus action, continue with other priorities
      }
    }
  }

  // =========================================================================
  // PRIORITY 3: Proactive weapon equipping
  // =========================================================================
  if (bb.tickCount % 50 === 0) { // Check every 5s
    const now = Date.now();
    // Check actual active_equipment cache — not a stale boolean
    const actuallyHasWeapon = hasActiveWeaponEquipped(conn.db, agent.identity!);
    bb.hasWeaponEquipped = actuallyHasWeapon;

    if (!actuallyHasWeapon && now - bb.lastEquipAttemptMs > 10_000) {
      const weapon = findWeaponInInventory(conn.db, agent.identity!);
      if (weapon) {
        executeEquip(conn, Number(weapon.instanceId));
        bb.hasWeaponEquipped = true;
        bb.lastEquipAttemptMs = now;
        throttledLog(
          `equip:${agent.character.username}`,
          `[FastLoop:${agent.character.username}] Proactively equipped ${weapon.name}`
        );
      }
    }
  }

  // =========================================================================
  // PRIORITY 4: Execute active LLM plan (if one exists)
  // =========================================================================
  const plan = bb.currentPlan;
  if (plan && bb.currentStepIndex < plan.plan.length) {
    const step = plan.plan[bb.currentStepIndex];
    const completed = executePlanStep(step, agent, bb, conn, selfX, selfY);
    if (completed) {
      bb.currentStepIndex++;
      bb.moveTarget = null;
      bb.seekingResourceId = null;
    }
    return;
  }

  // =========================================================================
  // PRIORITY 5+: Autonomous role-based behavior (no LLM plan active)
  // =========================================================================
  runAutonomousBehavior(agent, bb, conn, selfX, selfY, health, hunger, thirst, stamina, isOnWater);
}

// ---------------------------------------------------------------------------
// Autonomous behavior — what NPCs do when there's no LLM plan
// ---------------------------------------------------------------------------

function runAutonomousBehavior(
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  health: number,
  hunger: number,
  thirst: number,
  stamina: number,
  isOnWater: boolean
): void {
  const role = agent.character.role;
  const now = Date.now();

  // --- Role-specific behaviors (run every 10 ticks = 1s to save CPU) ---
  if (bb.tickCount % 10 === 0) {
    // Warriors: hunt passive animals or patrol aggressively
    if (role === 'warrior') {
      if (tryWarriorBehavior(agent, bb, conn, selfX, selfY, health)) return;
    }

    // Gatherers/builders/crafters: seek harvestable resources
    if (role === 'gatherer' || role === 'builder' || role === 'crafter') {
      if (tryGatherBehavior(agent, bb, conn, selfX, selfY, now)) return;
    }

    // Everyone: chop trees and mine stone when idle
    // (Only start new tree/stone if not already pursuing one)
    if (bb.seekingTreeId === null && bb.seekingStoneId === null && bb.autonomousMode === 'explore') {
      // Alternate between trees and stones (50/50 random)
      if (Math.random() < 0.5) {
        if (tryChopTreeBehavior(agent, bb, conn, selfX, selfY)) return;
        if (tryMineStoneBehavior(agent, bb, conn, selfX, selfY)) return;
      } else {
        if (tryMineStoneBehavior(agent, bb, conn, selfX, selfY)) return;
        if (tryChopTreeBehavior(agent, bb, conn, selfX, selfY)) return;
      }
    }

    // Scouts/explorers: longer exploration range, faster
    if (role === 'scout' || role === 'explorer') {
      // Scouts sprint sometimes for variety
      bb.isSprinting = stamina > 40 && Math.random() < 0.3;
    }

    // Everyone: barrel hunting for loot (great resource source)
    if (bb.autonomousMode !== 'barrel' && bb.seekingBarrelId === null) {
      if (tryBarrelBehavior(agent, bb, conn, selfX, selfY, now)) return;
    }

    // Everyone: loot nearby animal corpses
    if (bb.autonomousMode !== 'loot_corpse' && bb.seekingCorpseId === null) {
      if (tryCorpseLootBehavior(agent, bb, conn, selfX, selfY)) return;
    }

    // Everyone: fill water near water sources when thirst is moderate
    if (isOnWater && thirst < 60 && now - bb.lastNaturalDrinkMs > WATER_ACTION_COOLDOWN_MS) {
      if (executeDrinkNaturalWater(conn)) {
        bb.lastNaturalDrinkMs = now;
        throttledLog(
          `opportunistic_drink:${agent.character.username}`,
          `[FastLoop:${agent.character.username}] Opportunistically drinking from water (thirst: ${Math.round(thirst)})`
        );
        return;
      }
    }

    // Everyone: fill water containers when near water
    if (isOnWater && now - bb.lastWaterFillMs > WATER_ACTION_COOLDOWN_MS * 2) {
      if (executeFillWaterContainer(conn, agent.identity!, 250)) {
        bb.lastWaterFillMs = now;
        throttledLog(
          `fill_water:${agent.character.username}`,
          `[FastLoop:${agent.character.username}] Filling water container at water source`
        );
        // Don't return — passive bonus
      }
    }

    // Everyone: opportunistic gathering (if nearby resource and not busy)
    if (bb.autonomousMode === 'explore') {
      if (tryOpportunisticGather(bb, conn, selfX, selfY, role, now)) return;
    }

    // Everyone: pick up nearby dropped items
    if (tryPickupNearby(bb, conn, selfX, selfY)) return;

    // Occasional chat (every ~60s per NPC)
    if (now - bb.lastChatTimeMs > 60_000 + Math.random() * 30_000) {
      if (Math.random() < 0.15) {
        sayRoleLine(conn, role);
        bb.lastChatTimeMs = now;
      }
    }
  }

  // --- Continue pursuing active seek targets ---
  if (bb.seekingBarrelId !== null) {
    if (tryBarrelTick(agent, bb, conn, selfX, selfY)) return;
  }

  if (bb.seekingCorpseId !== null) {
    if (tryCorpseLootTick(agent, bb, conn, selfX, selfY)) return;
  }

  if (bb.seekingTreeId !== null) {
    if (tryChopTreeTick(bb, conn, selfX, selfY, now)) return;
  }

  if (bb.seekingStoneId !== null) {
    if (tryMineStoneTick(bb, conn, selfX, selfY, now)) return;
  }

  if (bb.seekingResourceId !== null) {
    const done = executeGather(conn, selfX, selfY, bb.seekingResourceId);
    if (done) {
      bb.seekingResourceId = null;
      bb.lastGatherTimeMs = now;
    }
    return;
  }

  if (bb.seekingDroppedItemId !== null) {
    const done = executePickup(conn, selfX, selfY, bb.seekingDroppedItemId);
    if (done) bb.seekingDroppedItemId = null;
    return;
  }

  if (bb.huntTargetId !== null) {
    if (tryHuntTick(agent, bb, conn, selfX, selfY)) return;
  }

  // --- Default: EXPLORE ---
  runExplore(agent, bb, conn, selfX, selfY, stamina);
}

// ---------------------------------------------------------------------------
// Role-specific behavior: WARRIOR
// ---------------------------------------------------------------------------

function tryWarriorBehavior(
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  health: number
): boolean {
  // If low health, flee instead
  if (health < 30) return false;

  // Look for hostile mobs to fight (warriors don't flee, they fight)
  const hostile = findNearestHostile(conn.db, selfX, selfY, FLEE_TRIGGER_RANGE * 1.5);
  if (hostile && health > 40) {
    bb.autonomousMode = 'hunt';
    bb.huntTargetId = hostile.id;
    throttledLog(
      `hunt:${agent.character.username}`,
      `[FastLoop:${agent.character.username}] HUNTING hostile ${hostile.species} (d:${Math.round(hostile.dist)}px)`
    );

    // Equip a weapon if we have one
    if (bb.tickCount % 30 === 0) {
      const weapon = findWeaponInInventory(conn.db, agent.identity!);
      if (weapon) {
        executeEquip(conn, Number(weapon.instanceId));
      }
    }
    return true;
  }

  // Hunt passive animals
  const prey = findNearestHuntable(conn.db, selfX, selfY, RESOURCE_SEEK_RANGE);
  if (prey) {
    bb.autonomousMode = 'hunt';
    bb.huntTargetId = prey.id;
    throttledLog(
      `hunt:${agent.character.username}`,
      `[FastLoop:${agent.character.username}] Hunting ${prey.species} (d:${Math.round(prey.dist)}px)`
    );
    return true;
  }

  return false;
}

function tryHuntTick(
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number
): boolean {
  if (bb.huntTargetId === null) return false;

  // Find the mob
  let target: { x: number; y: number; health: number } | null = null;
  try {
    for (const mob of conn.db.wildAnimal.iter()) {
      if (mob.id === bb.huntTargetId) {
        target = { x: mob.posX ?? 0, y: mob.posY ?? 0, health: mob.health ?? 0 };
        break;
      }
    }
  } catch { /* tolerate */ }

  if (!target || target.health <= 0) {
    bb.huntTargetId = null;
    bb.autonomousMode = 'explore';
    return false;
  }

  const dist = distance(selfX, selfY, target.x, target.y);
  const hasRanged = isEquippedWeaponRanged(conn.db, agent.identity!);

  // Ranged weapon: fire from distance, close in if too far
  if (hasRanged) {
    if (dist > 500) {
      // Too far even for ranged — sprint closer
      executeMoveTo(conn, selfX, selfY, target.x, target.y, true, 200);
      return true;
    }
    // In ranged firing range — shoot at the target
    executeFireProjectile(conn, selfX, selfY, target.x, target.y);
    return true;
  }

  // Melee weapon: close to 60px then swing
  if (dist > 60) {
    executeMoveTo(conn, selfX, selfY, target.x, target.y, true, 50);
    return true;
  }

  executeAttack(conn);
  return true;
}

// ---------------------------------------------------------------------------
// Role-specific behavior: GATHERER
// ---------------------------------------------------------------------------

function tryGatherBehavior(
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  now: number
): boolean {
  // Don't spam gather — wait 2s between gathering
  if (now - bb.lastGatherTimeMs < 2000) return false;

  const resource = findNearestResource(conn.db, selfX, selfY, RESOURCE_SEEK_RANGE);

  if (resource) {
    bb.autonomousMode = 'gather';
    bb.seekingResourceId = resource.id;
    throttledLog(
      `gather:${agent.character.username}`,
      `[FastLoop:${agent.character.username}] Seeking ${resource.type} (d:${Math.round(resource.dist)}px)`
    );
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Barrel targeting — find and attack barrels for loot
// ---------------------------------------------------------------------------

function tryBarrelBehavior(
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  now: number
): boolean {
  // Cooldown: don't seek new barrels too frequently
  if (now - bb.lastBarrelAttackMs < 5000) return false;

  const barrel = findNearestBarrel(conn.db, selfX, selfY, BARREL_SEEK_RANGE);
  if (barrel) {
    bb.autonomousMode = 'barrel';
    bb.seekingBarrelId = barrel.id;
    throttledLog(
      `barrel:${agent.character.username}`,
      `[FastLoop:${agent.character.username}] Targeting barrel (d:${Math.round(barrel.dist)}px, hp:${Math.round(barrel.health)})`
    );
    return true;
  }
  return false;
}

function tryBarrelTick(
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number
): boolean {
  if (bb.seekingBarrelId === null) return false;

  const now = Date.now();
  // Respect attack cooldown between swings
  if (now - bb.lastBarrelAttackMs < BARREL_ATTACK_COOLDOWN_MS) {
    // Still in cooldown — walk toward barrel but don't attack
    let barrel: { x: number; y: number; health: number } | null = null;
    try {
      if (conn.db.barrel?.iter) {
        for (const b of conn.db.barrel.iter()) {
          if (b.id === bb.seekingBarrelId) {
            barrel = { x: b.posX ?? 0, y: b.posY ?? 0, health: b.health ?? 0 };
            break;
          }
        }
      }
    } catch { /* tolerate */ }
    if (barrel && barrel.health > 0) {
      executeMoveTo(conn, selfX, selfY, barrel.x, barrel.y, false, 50);
      return true;
    }
    // Barrel gone
    bb.seekingBarrelId = null;
    bb.autonomousMode = 'explore';
    return false;
  }

  const destroyed = executeBarrelAttack(conn, selfX, selfY, bb.seekingBarrelId);
  bb.lastBarrelAttackMs = now;

  if (destroyed) {
    throttledLog(
      `barrel_done:${agent.character.username}`,
      `[FastLoop:${agent.character.username}] Barrel destroyed or gone — looking for drops`
    );
    bb.seekingBarrelId = null;
    bb.autonomousMode = 'explore';
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Corpse looting — pick up items from animal corpses
// ---------------------------------------------------------------------------

function tryCorpseLootBehavior(
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number
): boolean {
  const corpse = findNearestCorpse(conn.db, selfX, selfY, CORPSE_SEEK_RANGE);
  if (corpse) {
    bb.autonomousMode = 'loot_corpse';
    bb.seekingCorpseId = corpse.id;
    bb.corpseSlotIndex = 0;
    throttledLog(
      `corpse:${agent.character.username}`,
      `[FastLoop:${agent.character.username}] Looting ${corpse.species} corpse (d:${Math.round(corpse.dist)}px)`
    );
    return true;
  }
  return false;
}

function tryCorpseLootTick(
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number
): boolean {
  if (bb.seekingCorpseId === null) return false;

  const result = executeLootCorpse(conn, selfX, selfY, bb.seekingCorpseId, bb.corpseSlotIndex);
  bb.corpseSlotIndex = result.nextSlot;

  if (result.done) {
    throttledLog(
      `corpse_done:${agent.character.username}`,
      `[FastLoop:${agent.character.username}] Finished looting corpse`
    );
    bb.seekingCorpseId = null;
    bb.corpseSlotIndex = 0;
    bb.autonomousMode = 'explore';
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Opportunistic behaviors (any role)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tree chopping / Stone mining
// ---------------------------------------------------------------------------

const TREE_SEEK_RANGE = 500;
const STONE_SEEK_RANGE = 500;
/** Melee range to be within to hit a tree/stone (server cone detection) */
const HARVEST_HIT_RANGE = 70;
/** Minimum ms between tree/stone hits (matches typical tool attack_interval) */
const HARVEST_HIT_COOLDOWN_MS = 900;

/**
 * Try to find and start chopping a tree.
 * Returns true if we set up a tree target (so main loop can return).
 */
function tryChopTreeBehavior(
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number
): boolean {
  if (bb.seekingTreeId !== null) return false; // Already pursuing one

  const tree = findNearestTree(conn.db, selfX, selfY, TREE_SEEK_RANGE);
  if (!tree) return false;

  // Equip best tree-chopping tool (hatchet > bush knife > combat ladle > rock > any)
  const tool = findToolForTarget(conn.db, agent.identity!, 'Tree');
  if (tool) {
    executeEquip(conn, Number(tool.instanceId));
  }

  bb.seekingTreeId = tree.id;
  bb.autonomousMode = 'chop_tree';
  throttledLog(
    `chop:${agent.character.username}`,
    `[FastLoop:${agent.character.username}] Chopping tree (d:${Math.round(tree.dist)}px)`
  );
  return true;
}

/**
 * Try to find and start mining a stone node.
 * Returns true if we set up a stone target (so main loop can return).
 */
function tryMineStoneBehavior(
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number
): boolean {
  if (bb.seekingStoneId !== null) return false; // Already pursuing one

  const stone = findNearestStone(conn.db, selfX, selfY, STONE_SEEK_RANGE);
  if (!stone) return false;

  // Equip best stone-mining tool (pickaxe > combat ladle > rock > any)
  const tool = findToolForTarget(conn.db, agent.identity!, 'Stone');
  if (tool) {
    executeEquip(conn, Number(tool.instanceId));
  }

  bb.seekingStoneId = stone.id;
  bb.autonomousMode = 'mine_stone';
  throttledLog(
    `mine:${agent.character.username}`,
    `[FastLoop:${agent.character.username}] Mining stone (d:${Math.round(stone.dist)}px)`
  );
  return true;
}

/**
 * Continue chopping a tree we're already pursuing.
 * Move toward it, then swing when in range (server cone-detection handles the hit).
 */
function tryChopTreeTick(
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  now: number
): boolean {
  if (bb.seekingTreeId === null) return false;

  // Check if tree is still alive
  if (!isTreeAlive(conn.db, bb.seekingTreeId)) {
    bb.seekingTreeId = null;
    bb.autonomousMode = 'explore';
    return false;
  }

  // Find the tree's position
  let tx = 0, ty = 0;
  try {
    for (const tree of conn.db.tree.iter()) {
      if (tree.id === bb.seekingTreeId) {
        tx = tree.posX ?? 0;
        ty = tree.posY ?? 0;
        break;
      }
    }
  } catch { /* tolerate */ }

  const dist = distance(selfX, selfY, tx, ty);

  if (dist > HARVEST_HIT_RANGE) {
    // Walk toward tree
    executeMoveTo(conn, selfX, selfY, tx, ty, false, 40);
    return true;
  }

  // In range — swing at the tree (respecting cooldown)
  if (now - bb.lastHarvestHitMs >= HARVEST_HIT_COOLDOWN_MS) {
    executeAttack(conn);
    bb.lastHarvestHitMs = now;
  }
  return true;
}

/**
 * Continue mining a stone node we're already pursuing.
 * Move toward it, then swing when in range (server cone-detection handles the hit).
 */
function tryMineStoneTick(
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  now: number
): boolean {
  if (bb.seekingStoneId === null) return false;

  // Check if stone is still alive
  if (!isStoneAlive(conn.db, bb.seekingStoneId)) {
    bb.seekingStoneId = null;
    bb.autonomousMode = 'explore';
    return false;
  }

  // Find the stone's position
  let sx = 0, sy = 0;
  try {
    for (const stone of conn.db.stone.iter()) {
      if (stone.id === bb.seekingStoneId) {
        sx = stone.posX ?? 0;
        sy = stone.posY ?? 0;
        break;
      }
    }
  } catch { /* tolerate */ }

  const dist = distance(selfX, selfY, sx, sy);

  if (dist > HARVEST_HIT_RANGE) {
    // Walk toward stone
    executeMoveTo(conn, selfX, selfY, sx, sy, false, 40);
    return true;
  }

  // In range — swing at the stone (respecting cooldown)
  if (now - bb.lastHarvestHitMs >= HARVEST_HIT_COOLDOWN_MS) {
    executeAttack(conn);
    bb.lastHarvestHitMs = now;
  }
  return true;
}

// ---------------------------------------------------------------------------

function tryOpportunisticGather(
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  _role: string,
  now: number
): boolean {
  // Only if not recently gathered
  if (now - bb.lastGatherTimeMs < 3000) return false;

  // Closer range for opportunistic (stumble upon)
  const resource = findNearestResource(conn.db, selfX, selfY, 300);
  if (resource) {
    bb.seekingResourceId = resource.id;
    return true;
  }
  return false;
}

function tryPickupNearby(
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number
): boolean {
  if (bb.seekingDroppedItemId !== null) return false;

  const item = findNearestDroppedItem(conn.db, selfX, selfY, DROPPED_ITEM_SEEK_RANGE);
  if (item) {
    bb.seekingDroppedItemId = item.id;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Exploration — walk to distant random waypoints
// ---------------------------------------------------------------------------

function runExplore(
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number,
  stamina: number
): void {
  const now = Date.now();

  // Pick a new waypoint if we don't have one, arrived, or timeout
  const needsNewTarget =
    !bb.exploreTarget ||
    distance(selfX, selfY, bb.exploreTarget.x, bb.exploreTarget.y) < 60 ||
    now - bb.exploreTargetSetAt > EXPLORE_TIMEOUT_MS;

  if (needsNewTarget) {
    bb.exploreTarget = randomExploreTarget(selfX, selfY);
    bb.exploreTargetSetAt = now;
    // Sprint to new waypoints sometimes (if we have stamina)
    bb.isSprinting = stamina > 50 && Math.random() < 0.25;
    bb.autonomousMode = 'explore';

    throttledLog(
      `explore:${agent.character.username}`,
      `[FastLoop:${agent.character.username}] Exploring toward (${Math.round(bb.exploreTarget.x)},${Math.round(bb.exploreTarget.y)}) ` +
      `d:${Math.round(distance(selfX, selfY, bb.exploreTarget.x, bb.exploreTarget.y))}px` +
      `${bb.isSprinting ? ' SPRINTING' : ''}`
    );
  }

  // Walk (or sprint) toward the explore target
  const sprint = bb.isSprinting && stamina > 20;

  // Stop sprinting if stamina is low
  if (stamina <= 20) {
    bb.isSprinting = false;
  }

  executeMoveTo(conn, selfX, selfY, bb.exploreTarget!.x, bb.exploreTarget!.y, sprint, 50);
}

// ---------------------------------------------------------------------------
// Death handling
// ---------------------------------------------------------------------------

function handleDeath(agent: NpcAgent, bb: Blackboard, conn: SpacetimeConnection): void {
  const now = Date.now();
  const cooldownExpiry = bb.cooldowns.get('respawn') ?? 0;
  if (now < cooldownExpiry) return;

  // 5-second respawn cooldown
  bb.cooldowns.set('respawn', now + 5000);

  try {
    conn.reducers.respawnRandomly();
    console.log(`[FastLoop:${agent.character.username}] Auto-respawning after death.`);

    // Reset behavior state on respawn
    bb.exploreTarget = null;
    bb.seekingResourceId = null;
    bb.seekingDroppedItemId = null;
    bb.seekingBarrelId = null;
    bb.seekingCorpseId = null;
    bb.seekingTreeId = null;
    bb.seekingStoneId = null;
    bb.corpseSlotIndex = 0;
    bb.huntTargetId = null;
    bb.autonomousMode = 'explore';
    bb.isSprinting = false;
    bb.fleeStartMs = 0;
    bb.hasWeaponEquipped = false;
    bb.stuckCounter = 0;
    bb.lastStuckCheckPos = null;

    agent.pushEvent({
      type: 'died',
      timestamp: now,
      detail: 'Died and auto-respawned',
    });
  } catch (err) {
    console.debug(`[FastLoop] Respawn reducer failed:`, err);
  }
}

// ---------------------------------------------------------------------------
// Plan step execution (for LLM plans)
// ---------------------------------------------------------------------------

function executePlanStep(
  step: PlanStep,
  agent: NpcAgent,
  bb: Blackboard,
  conn: SpacetimeConnection,
  selfX: number,
  selfY: number
): boolean {
  switch (step.action) {
    case 'MOVE_TO': {
      const tx = Number(step.args.x ?? 0);
      const ty = Number(step.args.y ?? 0);
      const sprint = Boolean(step.args.sprint ?? false);
      return executeMoveTo(conn, selfX, selfY, tx, ty, sprint);
    }

    case 'ATTACK': {
      // If equipped weapon is ranged, fire a projectile toward the target coords
      if (isEquippedWeaponRanged(conn.db, agent.identity!)) {
        const tx = Number(step.args.targetX ?? step.args.target_x ?? selfX);
        const ty = Number(step.args.targetY ?? step.args.target_y ?? selfY);
        return executeFireProjectile(conn, selfX, selfY, tx, ty);
      }
      return executeAttack(conn);
    }

    case 'GATHER': {
      const rawNodeId = step.args.nodeId ?? step.args.node_id ?? 0;
      const nodeId = BigInt(rawNodeId as string | number | bigint);
      return executeGather(conn, selfX, selfY, nodeId);
    }

    case 'CRAFT': {
      const recipeId = Number(step.args.recipeId ?? step.args.recipe_id ?? 0);
      return executeCraft(conn, recipeId);
    }

    case 'EQUIP': {
      const itemId = Number(step.args.itemId ?? step.args.item_id ?? 0);
      return executeEquip(conn, itemId);
    }

    case 'SAY': {
      const message = String(step.args.message ?? step.args.text ?? '');
      return executeSay(conn, message);
    }

    case 'FLEE': {
      const hostile = findNearestHostile(conn.db, selfX, selfY, 500);
      if (hostile) {
        executeFlee(conn, selfX, selfY, hostile.x, hostile.y, bb);
      }
      return true;
    }

    case 'EAT':
      executeEat(conn, agent.identity!);
      return true;

    case 'DRINK':
      executeDrink(conn, agent.identity!);
      return true;

    case 'IDLE': {
      // Even "idle" from planner should explore, not stand still
      runExplore(agent, bb, conn, selfX, selfY, 100);
      return true;
    }

    default:
      console.warn(`[FastLoop] Unknown plan action: ${step.action}`);
      return true;
  }
}

// ---------------------------------------------------------------------------
// Chat helper
// ---------------------------------------------------------------------------

function sayRoleLine(conn: SpacetimeConnection, role: string): void {
  const lines = ROLE_CHAT_LINES[role] ?? ROLE_CHAT_LINES['gatherer']!;
  const line = lines[Math.floor(Math.random() * lines.length)];
  executeSay(conn, line);
}

// ---------------------------------------------------------------------------
// Find self in player table
// ---------------------------------------------------------------------------

function findSelf(db: any, selfId: string | null): any | null {
  if (!selfId || !db?.player?.iter) return null;
  try {
    for (const p of db.player.iter()) {
      const pid = p.identity?.toHexString?.() ?? String(p.identity);
      if (pid === selfId) return p;
    }
  } catch {
    // Tolerate missing bindings
  }
  return null;
}
