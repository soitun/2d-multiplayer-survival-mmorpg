/**
 * NpcAgent — a single NPC's brain + connection.
 *
 * Each NpcAgent owns:
 *   - A SpacetimeDB client connection (its own Identity)
 *   - A Blackboard (fast-loop state)
 *   - A reference to the world-state builder
 *   - A planner interface (slow-loop LLM calls)
 *
 * The agent connects to SpacetimeDB exactly like a human client,
 * subscribes to nearby entity data, and drives its player via
 * the same reducers humans use.
 */

import fs from 'fs';
import path from 'path';
import { AgentConfig } from './config.js';
import {
  NpcCharacter,
  Blackboard,
  createBlackboard,
  AgentWorldState,
  Plan,
  GameEvent,
} from './types.js';
import { buildAgentWorldState } from './world-state.js';
import { runFastTick } from './fast-loop.js';
import { runPlanner, shouldRunPlanner } from './planner.js';

/**
 * Minimal interface for the SpacetimeDB connection.
 * The actual generated DbConnection from `spacetime generate` will
 * satisfy this interface. We define it here so the agent code compiles
 * before bindings are generated.
 */
export interface SpacetimeConnection {
  /** Whether the WebSocket is open (SpacetimeDB TS SDK property) */
  isActive: boolean;
  /** Disconnect from the server */
  disconnect(): void;
  /** Access to the local client cache (subscribed tables) */
  db: any;
  /** Access to reducer calls */
  reducers: any;
  /** Client identity (hex string) */
  identity?: { toHexString(): string } | null | undefined;
}

export class NpcAgent {
  readonly character: NpcCharacter;
  readonly config: AgentConfig;
  readonly agentIndex: number;

  private conn: SpacetimeConnection | null = null;
  private blackboard: Blackboard;
  private fastLoopTimer: ReturnType<typeof setInterval> | null = null;
  private plannerTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private identityHex: string | null = null;

  constructor(character: NpcCharacter, config: AgentConfig, agentIndex: number) {
    this.character = character;
    this.config = config;
    this.agentIndex = agentIndex;
    this.blackboard = createBlackboard();
  }

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  /**
   * Connect to SpacetimeDB as a client.
   * Uses saved auth token for reconnection (preserves Identity).
   *
   * NOTE: This method uses dynamic import of the generated bindings.
   * Until `spacetime generate` is run, it will fail gracefully.
   */
  async connect(): Promise<void> {
    const token = this.loadToken();

    try {
      // Dynamic import — generated bindings must exist at ./generated/
      // After running: spacetime generate --lang typescript --out-dir ./src/generated --project-path ../server
      const { DbConnection } = await import('./generated/index.js').catch((err: any) => {
        console.warn(
          `[Agent:${this.character.username}] Generated bindings not found. ` +
          `Run: npm run generate`
        );
        console.warn(`[Agent:${this.character.username}] Import error:`, err?.message ?? err);
        return { DbConnection: null };
      });

      if (!DbConnection) {
        // Stub mode — bindings not yet generated.
        // The agent will operate in dry-run mode.
        console.log(`[Agent:${this.character.username}] Running in STUB mode (no bindings).`);
        this.connected = false;
        return;
      }

      const conn = DbConnection.builder()
        .withUri(this.config.spacetimedbUri)
        .withModuleName(this.config.spacetimedbModule)
        .withToken(token ?? undefined)
        .onConnect((connection: any, identity: any, authToken: string) => {
          this.identityHex = identity.toHexString();
          this.connected = true;
          this.saveToken(authToken);
          console.log(
            `[Agent:${this.character.username}] Connected. Identity: ${this.identityHex?.slice(0, 12)}...`
          );
          this.onConnected(connection);
        })
        .onDisconnect((_conn: any, error: any) => {
          this.connected = false;
          console.warn(
            `[Agent:${this.character.username}] Disconnected.`,
            error ? `Reason: ${error}` : ''
          );
          this.scheduleReconnect();
        })
        .onConnectError((_ctx: any, error: any) => {
          this.connected = false;
          console.error(`[Agent:${this.character.username}] Connection error:`, error);
          this.scheduleReconnect();
        })
        .build();

      this.conn = conn;
    } catch (err) {
      console.error(`[Agent:${this.character.username}] Failed to connect:`, err);
    }
  }

  /**
   * Called after successful connection.
   * Registers the NPC and subscribes to game data.
   */
  private onConnected(connection: any): void {
    this.conn = connection;

    // Register as NPC player (idempotent — handles reconnection)
    try {
      connection.reducers.registerNpc(this.character.username, this.character.role);
    } catch (err) {
      console.error(`[Agent:${this.character.username}] register_npc failed:`, err);
    }

    // Subscribe to essential tables for world-state awareness
    this.subscribeToWorld(connection);
  }

  /**
   * Subscribe to game tables needed for NPC decision-making.
   * We subscribe broadly — the server handles chunk filtering.
   */
  private subscribeToWorld(connection: any): void {
    try {
      connection
        .subscriptionBuilder()
        .onApplied(() => {
          console.log(`[Agent:${this.character.username}] Subscription applied.`);
        })
        .onError((_ctx: any, err: any) => {
          console.error(`[Agent:${this.character.username}] Subscription error:`, err);
        })
        .subscribe([
          'SELECT * FROM player',
          'SELECT * FROM world_state',
          'SELECT * FROM item_definition',
          'SELECT * FROM inventory_item',
          'SELECT * FROM active_equipment',
          'SELECT * FROM harvestable_resource',
          'SELECT * FROM wild_animal',
          'SELECT * FROM message',
          'SELECT * FROM dropped_item',
          'SELECT * FROM animal_corpse',
          'SELECT * FROM barrel',
          // Collision-critical tables (agents must see obstacles to avoid them)
          'SELECT * FROM tree',
          'SELECT * FROM stone',
          'SELECT * FROM rune_stone',
          'SELECT * FROM cairn',
        ]);
    } catch (err) {
      console.error(`[Agent:${this.character.username}] Failed to subscribe:`, err);
    }
  }

  private scheduleReconnect(): void {
    // Exponential backoff: 5s, 10s, 20s... max 60s
    const delay = Math.min(5000 * Math.pow(2, this.blackboard.plannerFailures), 60000);
    console.log(`[Agent:${this.character.username}] Reconnecting in ${delay / 1000}s...`);
    setTimeout(() => {
      if (!this.connected) {
        this.connect().catch(console.error);
      }
    }, delay);
  }

  // -----------------------------------------------------------------------
  // Token persistence (preserves Identity across restarts)
  // -----------------------------------------------------------------------

  private tokenPath(): string {
    return path.join(this.config.tokenDir, `${this.character.username}.token`);
  }

  private loadToken(): string | null {
    try {
      return fs.readFileSync(this.tokenPath(), 'utf-8').trim() || null;
    } catch {
      return null;
    }
  }

  private saveToken(token: string): void {
    try {
      fs.writeFileSync(this.tokenPath(), token, 'utf-8');
    } catch (err) {
      console.error(`[Agent:${this.character.username}] Failed to save token:`, err);
    }
  }

  // -----------------------------------------------------------------------
  // Game loops
  // -----------------------------------------------------------------------

  /**
   * Start both the fast loop and planner loop.
   * @param plannerJitterMs Random delay before first planner run (desync NPCs)
   */
  startLoops(plannerJitterMs: number): void {
    const tickMs = Math.floor(1000 / this.config.fastLoopHz);

    // Fast loop — deterministic, NO LLM
    this.fastLoopTimer = setInterval(() => {
      if (!this.connected || !this.conn) return;
      try {
        runFastTick(this, this.blackboard, this.conn);
      } catch (err) {
        console.error(`[Agent:${this.character.username}] Fast tick error:`, err);
      }
    }, tickMs);

    // Planner loop — LLM, slow, event-driven
    const schedulePlanner = (delayMs: number) => {
      this.plannerTimer = setTimeout(async () => {
        if (!this.connected || !this.conn) {
          schedulePlanner(this.config.plannerIntervalMs);
          return;
        }

        try {
          const worldState = buildAgentWorldState(this, this.conn);
          if (shouldRunPlanner(this.blackboard, worldState, this.config)) {
            const plan = await runPlanner(worldState, this.character, this.config);
            if (plan) {
              this.blackboard.currentPlan = plan;
              this.blackboard.currentStepIndex = 0;
              this.blackboard.plannerFailures = 0;
              console.log(
                `[Agent:${this.character.username}] New plan: "${plan.goal}" (${plan.plan.length} steps)`
              );
            } else {
              this.blackboard.plannerFailures++;
            }
            this.blackboard.lastPlannerRunMs = Date.now();
            this.blackboard.pendingEvents = []; // Consume events
          }
        } catch (err) {
          console.error(`[Agent:${this.character.username}] Planner error:`, err);
          this.blackboard.plannerFailures++;
        }

        // Schedule next run with ±20% jitter
        const jitter = this.config.plannerIntervalMs * 0.2;
        const nextDelay =
          this.config.plannerIntervalMs + (Math.random() * 2 - 1) * jitter;
        schedulePlanner(nextDelay);
      }, delayMs);
    };

    schedulePlanner(plannerJitterMs);
  }

  stopLoops(): void {
    if (this.fastLoopTimer) {
      clearInterval(this.fastLoopTimer);
      this.fastLoopTimer = null;
    }
    if (this.plannerTimer) {
      clearTimeout(this.plannerTimer);
      this.plannerTimer = null;
    }
  }

  disconnect(): void {
    this.stopLoops();
    if (this.conn) {
      try {
        this.conn.disconnect();
      } catch {
        // Ignore disconnect errors during shutdown
      }
      this.conn = null;
    }
    this.connected = false;
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  get isConnected(): boolean {
    return this.connected;
  }

  get identity(): string | null {
    return this.identityHex;
  }

  get bb(): Blackboard {
    return this.blackboard;
  }

  /** Push an event into the blackboard for the planner to consume */
  pushEvent(event: GameEvent): void {
    this.blackboard.pendingEvents.push(event);
    // Cap event queue to prevent unbounded growth
    if (this.blackboard.pendingEvents.length > 50) {
      this.blackboard.pendingEvents = this.blackboard.pendingEvents.slice(-30);
    }
  }
}
