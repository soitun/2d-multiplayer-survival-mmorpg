/**
 * World State Builder — shared between NPC planner and (potentially) SOVA assistant.
 *
 * Reads from the SpacetimeDB client cache (subscription data) and produces
 * a compact, deterministic AgentWorldState for LLM planning.
 *
 * Design notes:
 *   - Deterministic ordering (sorted by distance, then by ID)
 *   - Bounded arrays (max 10 nearby entities, 5 threats, 10 chat messages)
 *   - No raw dumps — everything is summarized
 *   - < 500 tokens when summarized for planner
 */

import { NpcAgent, SpacetimeConnection } from './npc-agent.js';
import {
  AgentWorldState,
  AgentSelfState,
  NearbyEntity,
  NearbyMob,
  NearbyResource,
  InventorySlot,
  EquipmentInfo,
  Threat,
  ChatMessage,
  EnvironmentInfo,
  GameEvent,
} from './types.js';

/** Perception radius in pixels — NPCs only "see" entities within this range */
const PERCEPTION_RADIUS = 800;
const PERCEPTION_RADIUS_SQ = PERCEPTION_RADIUS * PERCEPTION_RADIUS;

/** Max entries per category to keep world state compact */
const MAX_NEARBY_ENTITIES = 10;
const MAX_NEARBY_RESOURCES = 15;
const MAX_NEARBY_MOBS = 10;
const MAX_THREATS = 5;
const MAX_CHAT_MESSAGES = 10;

/**
 * Build a complete world state snapshot for a given NPC agent.
 * Reads entirely from the SpacetimeDB client cache — no async needed.
 */
export function buildAgentWorldState(
  agent: NpcAgent,
  conn: SpacetimeConnection
): AgentWorldState {
  const db = conn.db;
  const selfId = agent.identity;
  if (!selfId || !db) {
    return emptyWorldState(agent);
  }

  // Find self in the player table
  const selfPlayer = findSelfPlayer(db, selfId);
  if (!selfPlayer) {
    return emptyWorldState(agent);
  }

  const selfX = selfPlayer.positionX ?? selfPlayer.position_x ?? 0;
  const selfY = selfPlayer.positionY ?? selfPlayer.position_y ?? 0;

  const self: AgentSelfState = {
    playerId: selfId,
    username: selfPlayer.username ?? agent.character.username,
    x: selfX,
    y: selfY,
    health: selfPlayer.health ?? 100,
    stamina: selfPlayer.stamina ?? 100,
    hunger: selfPlayer.hunger ?? 50,
    thirst: selfPlayer.thirst ?? 50,
    warmth: selfPlayer.warmth ?? 100,
    isDead: selfPlayer.isDead ?? selfPlayer.is_dead ?? false,
    isOnWater: selfPlayer.isOnWater ?? selfPlayer.is_on_water ?? false,
    role: agent.character.role,
  };

  const nearbyPlayers = buildNearbyPlayers(db, selfId, selfX, selfY, false);
  const nearbyNPCs = buildNearbyPlayers(db, selfId, selfX, selfY, true);
  const nearbyMobs = buildNearbyMobs(db, selfX, selfY);
  const nearbyResources = buildNearbyResources(db, selfX, selfY);
  const inventory = buildInventory(db, selfId);
  const equipment = buildEquipment(db, selfId);
  const threats = buildThreats(nearbyPlayers, nearbyMobs);
  const recentChat = buildRecentChat(db);
  const environment = buildEnvironment(db);

  return {
    self,
    nearbyPlayers,
    nearbyNPCs,
    nearbyMobs,
    nearbyResources,
    inventory,
    equipment,
    recentEvents: agent.bb.pendingEvents.slice(-10),
    threats,
    recentChat,
    environment,
  };
}

/**
 * Produce a compact text summary for the LLM planner.
 * Target: < 500 tokens.
 */
export function summarizeForPlanner(state: AgentWorldState): string {
  const s = state.self;
  const lines: string[] = [];

  // Self
  lines.push(
    `You are "${s.username}" (${s.role}). ` +
    `Pos:(${Math.round(s.x)},${Math.round(s.y)}) ` +
    `HP:${Math.round(s.health)} Stam:${Math.round(s.stamina)} ` +
    `Hunger:${Math.round(s.hunger)} Thirst:${Math.round(s.thirst)} ` +
    `Warmth:${Math.round(s.warmth)}${s.isDead ? ' DEAD' : ''}${s.isOnWater ? ' ON_WATER' : ''}`
  );

  // Environment (weather is important for water filling)
  const env = state.environment;
  const isRaining = env.weather === 'LightRain' || env.weather === 'ModerateRain' ||
                    env.weather === 'HeavyRain' || env.weather === 'HeavyStorm';
  lines.push(`Time:${env.timeOfDay} Weather:${env.weather}${env.isNight ? ' NIGHT' : ''}${isRaining ? ' RAINING' : ''}${s.isOnWater ? ' ON_WATER' : ''}`);

  // Nearby players
  if (state.nearbyPlayers.length > 0) {
    const pList = state.nearbyPlayers
      .slice(0, 5)
      .map((p) => `${p.username}(d:${Math.round(p.distance)},hp:${Math.round(p.health)})`)
      .join(', ');
    lines.push(`NearbyPlayers: ${pList}`);
  }

  // Threats
  if (state.threats.length > 0) {
    const tList = state.threats
      .map((t) => `${t.type}:${t.entityId.slice(0, 8)}(d:${Math.round(t.distance)},${t.threatLevel})`)
      .join(', ');
    lines.push(`Threats: ${tList}`);
  }

  // Nearby mobs
  if (state.nearbyMobs.length > 0) {
    const mList = state.nearbyMobs
      .slice(0, 5)
      .map((m) => `${m.species}(d:${Math.round(m.distance)},hp:${Math.round(m.health)}${m.isHostile ? ',hostile' : ''})`)
      .join(', ');
    lines.push(`NearbyMobs: ${mList}`);
  }

  // Nearby resources
  if (state.nearbyResources.length > 0) {
    const rList = state.nearbyResources
      .slice(0, 8)
      .map((r) => `${r.type}(d:${Math.round(r.distance)}${r.isAvailable ? '' : ',unavail'})`)
      .join(', ');
    lines.push(`Resources: ${rList}`);
  }

  // Inventory summary (just counts by item name)
  const invCounts = new Map<string, number>();
  for (const slot of state.inventory) {
    if (slot.itemName) {
      invCounts.set(slot.itemName, (invCounts.get(slot.itemName) ?? 0) + slot.quantity);
    }
  }
  if (invCounts.size > 0) {
    const iList = Array.from(invCounts.entries())
      .map(([name, qty]) => `${qty}x${name}`)
      .join(', ');
    lines.push(`Inventory: ${iList}`);
  }

  // Equipment
  if (state.equipment.activeItemName) {
    lines.push(`Equipped: ${state.equipment.activeItemName}`);
  }

  // Recent events
  if (state.recentEvents.length > 0) {
    const eList = state.recentEvents
      .slice(-5)
      .map((e) => `${e.type}:${e.detail}`)
      .join('; ');
    lines.push(`Events: ${eList}`);
  }

  // Recent chat
  if (state.recentChat.length > 0) {
    const cList = state.recentChat
      .slice(-3)
      .map((c) => `${c.sender}:"${c.text.slice(0, 40)}"`)
      .join('; ');
    lines.push(`Chat: ${cList}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers — read from SpacetimeDB client cache
// ---------------------------------------------------------------------------

function findSelfPlayer(db: any, selfId: string): any | null {
  // Try multiple access patterns (generated bindings vary)
  try {
    // Pattern 1: db.player.identity.find(selfId)
    if (db.player?.identity?.find) {
      return db.player.identity.find(selfId);
    }
    // Pattern 2: Iterate
    if (db.player?.iter) {
      for (const p of db.player.iter()) {
        const pid = p.identity?.toHexString?.() ?? p.identity;
        if (pid === selfId) return p;
      }
    }
  } catch {
    // Binding mismatch — will be fixed once generate runs
  }
  return null;
}

function buildNearbyPlayers(
  db: any,
  selfId: string,
  selfX: number,
  selfY: number,
  wantNpcs: boolean
): NearbyEntity[] {
  const result: NearbyEntity[] = [];
  try {
    if (!db.player?.iter) return result;
    for (const p of db.player.iter()) {
      const pid = p.identity?.toHexString?.() ?? String(p.identity);
      if (pid === selfId) continue;

      const isNpc = p.isNpc ?? p.is_npc ?? false;
      if (wantNpcs !== isNpc) continue;

      const px = p.positionX ?? p.position_x ?? 0;
      const py = p.positionY ?? p.position_y ?? 0;
      const dx = px - selfX;
      const dy = py - selfY;
      const distSq = dx * dx + dy * dy;
      if (distSq > PERCEPTION_RADIUS_SQ) continue;

      result.push({
        id: pid,
        username: p.username ?? 'Unknown',
        x: px,
        y: py,
        distance: Math.sqrt(distSq),
        health: p.health ?? 0,
        isNpc,
        isOnline: p.isOnline ?? p.is_online ?? false,
      });
    }
  } catch {
    // Tolerate missing bindings
  }

  result.sort((a, b) => a.distance - b.distance);
  return result.slice(0, MAX_NEARBY_ENTITIES);
}

function buildNearbyMobs(db: any, selfX: number, selfY: number): NearbyMob[] {
  const result: NearbyMob[] = [];
  try {
    if (!db.wildAnimal?.iter && !db.wild_animal?.iter) return result;
    const iter = db.wildAnimal?.iter?.() ?? db.wild_animal?.iter?.() ?? [];
    for (const mob of iter) {
      const mx = mob.positionX ?? mob.position_x ?? mob.posX ?? mob.pos_x ?? 0;
      const my = mob.positionY ?? mob.position_y ?? mob.posY ?? mob.pos_y ?? 0;
      const dx = mx - selfX;
      const dy = my - selfY;
      const distSq = dx * dx + dy * dy;
      if (distSq > PERCEPTION_RADIUS_SQ) continue;

      const species = mob.species?.tag ?? mob.species ?? 'Unknown';
      // Must match AnimalSpecies enum variant names from server
      const isHostile =
        species === 'TundraWolf' ||
        species === 'CableViper' ||
        species === 'Wolverine' ||
        species === 'SalmonShark' ||
        species === 'PolarBear' ||
        species === 'SnowyOwl' ||
        species === 'Shorebound' ||
        species === 'Shardkin' ||
        species === 'DrownedWatch' ||
        species === 'Bee';

      result.push({
        id: mob.id ?? 0,
        species,
        x: mx,
        y: my,
        distance: Math.sqrt(distSq),
        health: mob.health ?? 0,
        isHostile,
      });
    }
  } catch {
    // Tolerate
  }

  result.sort((a, b) => a.distance - b.distance);
  return result.slice(0, MAX_NEARBY_MOBS);
}

function buildNearbyResources(db: any, selfX: number, selfY: number): NearbyResource[] {
  const result: NearbyResource[] = [];
  try {
    const iter =
      db.harvestableResource?.iter?.() ??
      db.harvestablResource?.iter?.() ??
      db.harvestable_resource?.iter?.() ??
      [];
    for (const r of iter) {
      const rx = r.posX ?? r.pos_x ?? r.positionX ?? r.position_x ?? 0;
      const ry = r.posY ?? r.pos_y ?? r.positionY ?? r.position_y ?? 0;
      const dx = rx - selfX;
      const dy = ry - selfY;
      const distSq = dx * dx + dy * dy;
      if (distSq > PERCEPTION_RADIUS_SQ) continue;

      const respawnAt = r.respawnAt ?? r.respawn_at ?? null;
      result.push({
        id: r.id ?? 0,
        type: r.plantType?.tag ?? r.plant_type?.tag ?? r.plantType ?? r.plant_type ?? 'Unknown',
        x: rx,
        y: ry,
        distance: Math.sqrt(distSq),
        isAvailable: respawnAt === null || respawnAt === undefined,
      });
    }
  } catch {
    // Tolerate
  }

  result.sort((a, b) => a.distance - b.distance);
  return result.slice(0, MAX_NEARBY_RESOURCES);
}

function buildInventory(db: any, selfId: string): InventorySlot[] {
  const slots: InventorySlot[] = [];
  try {
    const itemDefs = new Map<string, any>();
    const defIter = db.itemDefinition?.iter?.() ?? db.item_definition?.iter?.() ?? [];
    for (const def of defIter) {
      itemDefs.set(String(def.id), def);
    }

    const itemIter = db.inventoryItem?.iter?.() ?? db.inventory_item?.iter?.() ?? db.itemInstance?.iter?.() ?? db.item_instance?.iter?.() ?? [];
    for (const item of itemIter) {
      // Check ownership
      const ownerId =
        item.location?.value?.ownerId?.toHexString?.() ??
        item.location?.value?.owner_id?.toHexString?.() ??
        item.ownerId?.toHexString?.() ??
        null;
      if (ownerId !== selfId) continue;

      const locTag = item.location?.tag ?? '';
      if (locTag !== 'Inventory' && locTag !== 'Hotbar') continue;

      const slotIdx = item.location?.value?.slotIndex ?? item.location?.value?.slot_index ?? 0;
      const defId = item.itemDefId ?? item.item_def_id ?? 0;
      const def = itemDefs.get(String(defId));

      slots.push({
        slotIndex: slotIdx,
        itemName: def?.name ?? null,
        itemDefId: Number(defId),
        instanceId: Number(item.instanceId ?? item.instance_id ?? 0),
        quantity: item.quantity ?? 1,
        location: locTag === 'Hotbar' ? 'hotbar' : 'inventory',
      });
    }
  } catch {
    // Tolerate
  }
  return slots;
}

function buildEquipment(db: any, selfId: string): EquipmentInfo {
  const info: EquipmentInfo = {
    activeItemName: null,
    activeItemInstanceId: null,
    headArmor: null,
    bodyArmor: null,
  };

  try {
    const eqIter = db.activeEquipment?.iter?.() ?? db.active_equipment?.iter?.() ?? [];
    for (const eq of eqIter) {
      const eqId = eq.playerId?.toHexString?.() ?? eq.player_id?.toHexString?.() ?? null;
      if (eqId !== selfId) continue;

      const defId = eq.itemDefId ?? eq.item_def_id ?? eq.equippedItemDefId ?? null;
      if (defId) {
        // Look up name
        const defIter = db.itemDefinition?.iter?.() ?? db.item_definition?.iter?.() ?? [];
        for (const def of defIter) {
          if (String(def.id) === String(defId)) {
            info.activeItemName = def.name;
            break;
          }
        }
      }
      info.activeItemInstanceId = Number(
        eq.equippedItemInstanceId ?? eq.equipped_item_instance_id ?? 0
      );
      break; // Only one active equipment per player
    }
  } catch {
    // Tolerate
  }

  return info;
}

function buildThreats(
  nearbyPlayers: NearbyEntity[],
  nearbyMobs: NearbyMob[]
): Threat[] {
  const threats: Threat[] = [];

  // Hostile mobs within perception
  for (const mob of nearbyMobs) {
    if (!mob.isHostile) continue;
    const level =
      mob.distance < 200 ? 'high' : mob.distance < 400 ? 'medium' : 'low';
    threats.push({
      entityId: String(mob.id),
      type: 'mob',
      distance: mob.distance,
      threatLevel: level,
    });
  }

  // Nearby players with PvP potential (simplified — just proximity)
  for (const p of nearbyPlayers) {
    if (p.distance < 300) {
      threats.push({
        entityId: p.id,
        type: 'player',
        distance: p.distance,
        threatLevel: p.distance < 150 ? 'medium' : 'low',
      });
    }
  }

  threats.sort((a, b) => a.distance - b.distance);
  return threats.slice(0, MAX_THREATS);
}

function buildRecentChat(db: any): ChatMessage[] {
  const messages: ChatMessage[] = [];
  try {
    const iter = db.message?.iter?.() ?? db.chatMessage?.iter?.() ?? db.chat_message?.iter?.() ?? [];
    for (const msg of iter) {
      messages.push({
        sender: msg.senderName ?? msg.sender_name ?? 'Unknown',
        text: msg.text ?? msg.message ?? '',
        timestamp: Number(msg.sentAt ?? msg.sent_at ?? msg.timestamp ?? 0),
      });
    }
  } catch {
    // Tolerate
  }

  messages.sort((a, b) => b.timestamp - a.timestamp);
  return messages.slice(0, MAX_CHAT_MESSAGES);
}

function buildEnvironment(db: any): EnvironmentInfo {
  try {
    const iter = db.worldState?.iter?.() ?? db.world_state?.iter?.() ?? [];
    for (const ws of iter) {
      const tod = ws.timeOfDay?.tag ?? ws.time_of_day?.tag ?? ws.timeOfDay ?? ws.time_of_day ?? 'Unknown';
      const weather = ws.currentWeather?.tag ?? ws.current_weather?.tag ?? ws.currentWeather ?? ws.current_weather ?? 'Clear';
      const isNight = tod === 'Night' || tod === 'Midnight';
      return { timeOfDay: tod, weather, isNight, temperature: isNight ? 'Cold' : 'Moderate' };
    }
  } catch {
    // Tolerate
  }
  return { timeOfDay: 'Unknown', weather: 'Clear', isNight: false, temperature: 'Moderate' };
}

function emptyWorldState(agent: NpcAgent): AgentWorldState {
  return {
    self: {
      playerId: agent.identity ?? '',
      username: agent.character.username,
      x: 0,
      y: 0,
      health: 100,
      stamina: 100,
      hunger: 50,
      thirst: 50,
      warmth: 100,
      isDead: false,
      isOnWater: false,
      role: agent.character.role,
    },
    nearbyPlayers: [],
    nearbyNPCs: [],
    nearbyMobs: [],
    nearbyResources: [],
    inventory: [],
    equipment: {
      activeItemName: null,
      activeItemInstanceId: null,
      headArmor: null,
      bodyArmor: null,
    },
    recentEvents: [],
    threats: [],
    recentChat: [],
    environment: { timeOfDay: 'Unknown', weather: 'Clear', isNight: false, temperature: 'Moderate' },
  };
}
