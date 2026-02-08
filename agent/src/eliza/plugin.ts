/**
 * ElizaOS Plugin: broth-bullets-agent
 *
 * This plugin bundles all NPC intelligence for Broth & Bullets.
 * It follows the ElizaOS plugin architecture:
 *   - Providers: supply structured world data to the agent context
 *   - Actions: map to SpacetimeDB reducers
 *   - Evaluators: track plan success/failure and build episodic memory
 *
 * The plugin is designed to work with @elizaos/core AgentRuntime.
 * Each NPC maps 1:1 to an Eliza agent instance.
 *
 * NOTE: Full ElizaOS integration requires @elizaos/core to be installed.
 * The core agent loop (fast-loop + planner) works independently.
 * ElizaOS adds memory persistence, evaluation, and the character system.
 */

// ---------------------------------------------------------------------------
// Plugin definition (ElizaOS-compatible interface)
// ---------------------------------------------------------------------------

export interface ElizaPlugin {
  name: string;
  description: string;
  providers: ElizaProvider[];
  actions: ElizaAction[];
  evaluators: ElizaEvaluator[];
}

export interface ElizaProvider {
  name: string;
  description: string;
  /** Returns structured data for the agent context */
  get(context: any): Promise<any>;
}

export interface ElizaAction {
  name: string;
  description: string;
  /** Validate whether this action can be performed */
  validate(context: any, params: any): Promise<boolean>;
  /** Execute the action */
  execute(context: any, params: any): Promise<any>;
}

export interface ElizaEvaluator {
  name: string;
  description: string;
  /** Evaluate agent state and optionally update memory */
  evaluate(context: any): Promise<any>;
}

// ---------------------------------------------------------------------------
// Provider implementations
// ---------------------------------------------------------------------------

import { buildAgentWorldState, summarizeForPlanner } from '../world-state.js';

export const selfStateProvider: ElizaProvider = {
  name: 'SELF_STATE',
  description: 'Current NPC health, position, stats, and equipment',
  async get(context: any) {
    const { agent, conn } = context;
    if (!agent || !conn) return null;
    const ws = buildAgentWorldState(agent, conn);
    return ws.self;
  },
};

export const worldStateProvider: ElizaProvider = {
  name: 'WORLD_STATE',
  description: 'Nearby players, mobs, resources, and environment conditions',
  async get(context: any) {
    const { agent, conn } = context;
    if (!agent || !conn) return null;
    const ws = buildAgentWorldState(agent, conn);
    return {
      nearbyPlayers: ws.nearbyPlayers,
      nearbyNPCs: ws.nearbyNPCs,
      nearbyMobs: ws.nearbyMobs,
      nearbyResources: ws.nearbyResources,
      environment: ws.environment,
    };
  },
};

export const threatsProvider: ElizaProvider = {
  name: 'THREATS',
  description: 'Current threat assessment (hostile mobs, nearby players)',
  async get(context: any) {
    const { agent, conn } = context;
    if (!agent || !conn) return null;
    const ws = buildAgentWorldState(agent, conn);
    return ws.threats;
  },
};

export const tasksProvider: ElizaProvider = {
  name: 'TASKS',
  description: 'Current plan and pending events',
  async get(context: any) {
    const { agent } = context;
    if (!agent) return null;
    return {
      currentPlan: agent.bb.currentPlan,
      currentStep: agent.bb.currentStepIndex,
      pendingEvents: agent.bb.pendingEvents,
    };
  },
};

export const chatContextProvider: ElizaProvider = {
  name: 'CHAT_CONTEXT',
  description: 'Recent chat messages near the NPC',
  async get(context: any) {
    const { agent, conn } = context;
    if (!agent || !conn) return null;
    const ws = buildAgentWorldState(agent, conn);
    return ws.recentChat;
  },
};

// ---------------------------------------------------------------------------
// Action implementations (thin wrappers around reducer-backed actions)
// ---------------------------------------------------------------------------

import {
  executeMoveTo,
  executeAttack,
  executeGather,
  executeCraft,
  executeEquip,
  executeSay,
} from '../actions/index.js';

export const moveToAction: ElizaAction = {
  name: 'MOVE_TO',
  description: 'Move to a world position',
  async validate(context: any, params: any) {
    return typeof params?.x === 'number' && typeof params?.y === 'number';
  },
  async execute(context: any, params: any) {
    const { conn, selfX, selfY } = context;
    return executeMoveTo(conn, selfX, selfY, params.x, params.y, 3.0, 20.0);
  },
};

export const attackAction: ElizaAction = {
  name: 'ATTACK',
  description: 'Attack a target entity',
  async validate(context: any, params: any) {
    return typeof params?.targetId === 'string' && params.targetId.length > 0;
  },
  async execute(context: any, params: any) {
    return executeAttack(context.conn, params.targetId);
  },
};

export const gatherAction: ElizaAction = {
  name: 'GATHER',
  description: 'Gather from a harvestable resource',
  async validate(context: any, params: any) {
    return typeof params?.nodeId === 'number' && params.nodeId > 0;
  },
  async execute(context: any, params: any) {
    const { conn, selfX, selfY } = context;
    return executeGather(conn, selfX, selfY, params.nodeId, 60.0);
  },
};

export const craftAction: ElizaAction = {
  name: 'CRAFT',
  description: 'Start crafting a recipe',
  async validate(context: any, params: any) {
    return typeof params?.recipeId === 'number' && params.recipeId > 0;
  },
  async execute(context: any, params: any) {
    return executeCraft(context.conn, params.recipeId);
  },
};

export const equipAction: ElizaAction = {
  name: 'EQUIP',
  description: 'Equip an item from inventory',
  async validate(context: any, params: any) {
    return typeof params?.itemId === 'number' && params.itemId > 0;
  },
  async execute(context: any, params: any) {
    return executeEquip(context.conn, params.itemId);
  },
};

export const sayAction: ElizaAction = {
  name: 'SAY',
  description: 'Send a chat message',
  async validate(context: any, params: any) {
    return typeof params?.message === 'string' && params.message.length > 0;
  },
  async execute(context: any, params: any) {
    return executeSay(context.conn, params.message);
  },
};

// ---------------------------------------------------------------------------
// Evaluators
// ---------------------------------------------------------------------------

export const episodeEvaluator: ElizaEvaluator = {
  name: 'EPISODE_TRACKER',
  description: 'Tracks plan success/failure and builds episodic memory',
  async evaluate(context: any) {
    const { agent } = context;
    if (!agent) return null;

    const bb = agent.bb;
    const plan = bb.currentPlan;
    if (!plan) return { status: 'no_plan' };

    const totalSteps = plan.plan.length;
    const completedSteps = bb.currentStepIndex;
    const success = completedSteps >= totalSteps;

    return {
      goal: plan.goal,
      totalSteps,
      completedSteps,
      success,
      failures: bb.plannerFailures,
      // Compact episodic summary for long-term memory
      summary: success
        ? `Completed: "${plan.goal}" (${totalSteps} steps)`
        : `Partial: "${plan.goal}" (${completedSteps}/${totalSteps} steps)`,
    };
  },
};

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

export const brothBulletsPlugin: ElizaPlugin = {
  name: 'broth-bullets-agent',
  description: 'NPC agent intelligence for Broth & Bullets survival game',
  providers: [
    selfStateProvider,
    worldStateProvider,
    threatsProvider,
    tasksProvider,
    chatContextProvider,
  ],
  actions: [
    moveToAction,
    attackAction,
    gatherAction,
    craftAction,
    equipAction,
    sayAction,
  ],
  evaluators: [episodeEvaluator],
};

export default brothBulletsPlugin;
