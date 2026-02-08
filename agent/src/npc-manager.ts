/**
 * NPC Manager — lifecycle orchestrator for all NPC agents.
 *
 * Responsibilities:
 *   1. Create one SpacetimeDB connection per NPC
 *   2. Register NPCs via the register_npc reducer
 *   3. Start/stop fast loops and planner loops
 *   4. Handle reconnection on disconnect
 *
 * Design decision: each NPC is a real SpacetimeDB client with its own
 * Identity. This means zero changes to existing reducers — NPCs call
 * the same move/attack/gather/craft reducers as human players, and
 * ctx.sender correctly identifies each NPC.
 */

import fs from 'fs';
import path from 'path';
import { AgentConfig } from './config.js';
import { NpcCharacter } from './types.js';
import { NpcAgent } from './npc-agent.js';
import { NPC_ROSTER } from './eliza/characters/roster.js';

export class NpcManager {
  private agents: Map<string, NpcAgent> = new Map();
  private config: AgentConfig;
  private shutdownRequested = false;

  constructor(config: AgentConfig) {
    this.config = config;
    // Ensure token directory exists
    if (!fs.existsSync(config.tokenDir)) {
      fs.mkdirSync(config.tokenDir, { recursive: true });
    }
  }

  /**
   * Boot all NPC agents.
   * Each NPC connects independently with staggered timing to avoid
   * thundering-herd on the SpacetimeDB server.
   */
  async bootAll(): Promise<void> {
    const roster = NPC_ROSTER.slice(0, this.config.npcCount);
    console.log(`[NpcManager] Booting ${roster.length} NPC agents...`);

    for (let i = 0; i < roster.length; i++) {
      if (this.shutdownRequested) break;

      const character = roster[i];
      const agent = new NpcAgent(character, this.config, i);
      this.agents.set(character.username, agent);

      // Stagger connections by 500ms to avoid hammering the server
      try {
        await agent.connect();
        console.log(`[NpcManager] Agent ${i + 1}/${roster.length} "${character.username}" connected.`);
      } catch (err) {
        console.error(`[NpcManager] Failed to connect "${character.username}":`, err);
      }

      if (i < roster.length - 1) {
        await sleep(500);
      }
    }

    console.log(`[NpcManager] All agents booted. Active: ${this.agents.size}`);
  }

  /**
   * Start all agent loops (fast + planner).
   * Each agent's planner loop starts with random jitter to desync LLM calls.
   */
  startAll(): void {
    let idx = 0;
    for (const agent of this.agents.values()) {
      const jitterMs = Math.floor(Math.random() * this.config.plannerIntervalMs);
      agent.startLoops(jitterMs);
      idx++;
    }
    console.log(`[NpcManager] Started loops for ${this.agents.size} agents.`);
  }

  /**
   * Graceful shutdown — stops all loops and disconnects.
   */
  async shutdown(): Promise<void> {
    this.shutdownRequested = true;
    console.log('[NpcManager] Shutting down all agents...');
    for (const agent of this.agents.values()) {
      agent.stopLoops();
    }
    // Give reducers a moment to flush
    await sleep(1000);
    for (const agent of this.agents.values()) {
      agent.disconnect();
    }
    this.agents.clear();
    console.log('[NpcManager] Shutdown complete.');
  }

  getAgent(username: string): NpcAgent | undefined {
    return this.agents.get(username);
  }

  get agentCount(): number {
    return this.agents.size;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
