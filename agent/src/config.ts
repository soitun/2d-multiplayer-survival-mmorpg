/**
 * Agent runtime configuration.
 * Loaded from environment variables with sensible defaults.
 */

export interface AgentConfig {
  /** SpacetimeDB WebSocket URI */
  spacetimedbUri: string;
  /** SpacetimeDB module (database) name */
  spacetimedbModule: string;
  /** API proxy URL for LLM calls */
  proxyUrl: string;
  /** Number of NPC agents to spawn */
  npcCount: number;
  /** Planner (slow) loop interval in ms. Each NPC runs ± 20% jitter. */
  plannerIntervalMs: number;
  /** Fast loop tick rate in Hz (ticks per second) */
  fastLoopHz: number;
  /** LLM model to use */
  llmModel: string;
  /** Max planner retries on invalid JSON */
  maxPlannerRetries: number;
  /** Directory for persisting NPC auth tokens */
  tokenDir: string;
}

export function loadConfig(): AgentConfig {
  return {
    spacetimedbUri: process.env.SPACETIMEDB_URI ?? 'ws://localhost:3000',
    spacetimedbModule: process.env.SPACETIMEDB_MODULE ?? 'broth-bullets-local',
    proxyUrl: process.env.PROXY_URL ?? 'http://localhost:8002',
    npcCount: parseInt(process.env.NPC_COUNT ?? '20', 10),
    plannerIntervalMs: parseInt(process.env.PLANNER_INTERVAL_MS ?? '30000', 10),
    fastLoopHz: parseInt(process.env.FAST_LOOP_HZ ?? '10', 10),
    llmModel: 'gpt-4o-mini',
    maxPlannerRetries: 2,
    tokenDir: process.env.TOKEN_DIR ?? './.npc-tokens',
  };
}
