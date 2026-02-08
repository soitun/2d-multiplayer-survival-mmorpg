/**
 * Core type definitions for the NPC agent runtime.
 * These are runtime types — SpacetimeDB generated bindings are separate.
 */

// ---------------------------------------------------------------------------
// World State (shared between NPC planner and SOVA assistant)
// ---------------------------------------------------------------------------

export interface AgentWorldState {
  self: AgentSelfState;
  nearbyPlayers: NearbyEntity[];
  nearbyNPCs: NearbyEntity[];
  nearbyMobs: NearbyMob[];
  nearbyResources: NearbyResource[];
  inventory: InventorySlot[];
  equipment: EquipmentInfo;
  recentEvents: GameEvent[];
  threats: Threat[];
  recentChat: ChatMessage[];
  environment: EnvironmentInfo;
}

export interface AgentSelfState {
  playerId: string;
  username: string;
  x: number;
  y: number;
  health: number;
  stamina: number;
  hunger: number;
  thirst: number;
  warmth: number;
  isDead: boolean;
  isOnWater: boolean;
  role: string;
}

export interface NearbyEntity {
  id: string;
  username: string;
  x: number;
  y: number;
  distance: number;
  health: number;
  isNpc: boolean;
  isOnline: boolean;
}

export interface NearbyMob {
  id: number;
  species: string;
  x: number;
  y: number;
  distance: number;
  health: number;
  isHostile: boolean;
}

export interface NearbyResource {
  id: number;
  type: string;
  x: number;
  y: number;
  distance: number;
  isAvailable: boolean;
}

export interface InventorySlot {
  slotIndex: number;
  itemName: string | null;
  itemDefId: number | null;
  instanceId: number | null;
  quantity: number;
  location: 'inventory' | 'hotbar';
}

export interface EquipmentInfo {
  activeItemName: string | null;
  activeItemInstanceId: number | null;
  headArmor: string | null;
  bodyArmor: string | null;
}

export interface GameEvent {
  type: 'attacked' | 'killed' | 'item_gathered' | 'chat_mention' | 'low_health' | 'low_hunger' | 'crafted' | 'died';
  timestamp: number;
  detail: string;
}

export interface Threat {
  entityId: string;
  type: 'player' | 'mob';
  distance: number;
  threatLevel: 'low' | 'medium' | 'high';
}

export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
}

export interface EnvironmentInfo {
  timeOfDay: string;
  weather: string;
  isNight: boolean;
  temperature: string;
}

// ---------------------------------------------------------------------------
// Planner types
// ---------------------------------------------------------------------------

export type ActionType =
  | 'MOVE_TO'
  | 'ATTACK'
  | 'GATHER'
  | 'CRAFT'
  | 'EQUIP'
  | 'SAY'
  | 'IDLE'
  | 'FLEE'
  | 'EAT'
  | 'DRINK';

export interface PlanStep {
  action: ActionType;
  args: Record<string, unknown>;
}

export interface Plan {
  goal: string;
  plan: PlanStep[];
}

// ---------------------------------------------------------------------------
// Blackboard (per-NPC fast-loop state)
// ---------------------------------------------------------------------------

export interface Blackboard {
  /** Current high-level plan from LLM */
  currentPlan: Plan | null;
  /** Index of the step we're executing */
  currentStepIndex: number;
  /** Current pathfinding waypoints */
  pathWaypoints: Array<{ x: number; y: number }>;
  /** Index into pathWaypoints */
  pathIndex: number;
  /** Cooldowns (action name -> next allowed timestamp) */
  cooldowns: Map<string, number>;
  /** Event queue consumed by planner */
  pendingEvents: GameEvent[];
  /** Last planner invocation timestamp */
  lastPlannerRunMs: number;
  /** Consecutive planner failures */
  plannerFailures: number;
  /** Movement target (null if idle) */
  moveTarget: { x: number; y: number } | null;
  /** Combat target identity */
  attackTarget: string | null;
  /** Gather target resource ID */
  gatherTarget: number | null;

  // --- Autonomous behavior state ---

  /** Long-range exploration waypoint */
  exploreTarget: { x: number; y: number } | null;
  /** Timestamp when explore target was set (prevent stale targets) */
  exploreTargetSetAt: number;
  /** Current autonomous behavior mode */
  autonomousMode: 'explore' | 'gather' | 'flee' | 'hunt' | 'idle' | 'barrel' | 'loot_corpse' | 'fill_water' | 'chop_tree' | 'mine_stone';
  /** Resource we're walking toward to gather */
  seekingResourceId: bigint | null;
  /** Dropped item we're walking toward to pick up */
  seekingDroppedItemId: bigint | null;
  /** Last time we successfully gathered */
  lastGatherTimeMs: number;
  /** Last time we said something in chat */
  lastChatTimeMs: number;
  /** Whether NPC is currently sprinting */
  isSprinting: boolean;
  /** Flee direction angle (radians) */
  fleeAngle: number;
  /** Timestamp when flee started */
  fleeStartMs: number;
  /** Mob we're actively hunting */
  huntTargetId: bigint | null;
  /** Tick counter for throttling expensive scans */
  tickCount: number;

  // --- Barrel targeting ---
  /** Barrel we're walking toward to attack */
  seekingBarrelId: bigint | null;
  /** Last time we attacked a barrel */
  lastBarrelAttackMs: number;

  // --- Corpse looting ---
  /** Animal corpse we're walking toward to loot */
  seekingCorpseId: number | null;
  /** How many slots we've looted from current corpse */
  corpseSlotIndex: number;

  // --- Tree / Stone harvesting ---
  /** Tree we're walking toward to chop */
  seekingTreeId: bigint | null;
  /** Stone node we're walking toward to mine */
  seekingStoneId: bigint | null;
  /** Last time we hit a tree/stone */
  lastHarvestHitMs: number;

  // --- Water management ---
  /** Last time we filled a water container */
  lastWaterFillMs: number;
  /** Last time we drank from natural water */
  lastNaturalDrinkMs: number;
  /** Whether we have a weapon equipped already */
  hasWeaponEquipped: boolean;
  /** Last time we tried to equip a weapon */
  lastEquipAttemptMs: number;

  // --- Stuck detection ---
  /** Position at last stuck-check sample */
  lastStuckCheckPos: { x: number; y: number } | null;
  /** Tick count at last stuck-check sample */
  lastStuckCheckTick: number;
  /** How many consecutive stuck checks found no movement */
  stuckCounter: number;
}

export function createBlackboard(): Blackboard {
  return {
    currentPlan: null,
    currentStepIndex: 0,
    pathWaypoints: [],
    pathIndex: 0,
    cooldowns: new Map(),
    pendingEvents: [],
    lastPlannerRunMs: 0,
    plannerFailures: 0,
    moveTarget: null,
    attackTarget: null,
    gatherTarget: null,
    exploreTarget: null,
    exploreTargetSetAt: 0,
    autonomousMode: 'explore',
    seekingResourceId: null,
    seekingDroppedItemId: null,
    lastGatherTimeMs: 0,
    lastChatTimeMs: 0,
    isSprinting: false,
    fleeAngle: 0,
    fleeStartMs: 0,
    huntTargetId: null,
    tickCount: 0,
    seekingBarrelId: null,
    lastBarrelAttackMs: 0,
    seekingCorpseId: null,
    corpseSlotIndex: 0,
    seekingTreeId: null,
    seekingStoneId: null,
    lastHarvestHitMs: 0,
    lastWaterFillMs: 0,
    lastNaturalDrinkMs: 0,
    hasWeaponEquipped: false,
    lastEquipAttemptMs: 0,
    lastStuckCheckPos: null,
    lastStuckCheckTick: 0,
    stuckCounter: 0,
  };
}

// ---------------------------------------------------------------------------
// NPC Character Definition
// ---------------------------------------------------------------------------

export interface NpcCharacter {
  /** Display name in game */
  username: string;
  /** Role for planner context */
  role: string;
  /** Personality seed for LLM prompt */
  personality: string;
  /** Priority behaviors (influences planner) */
  priorities: string[];
  /** Preferred items to gather */
  preferredResources: string[];
}
