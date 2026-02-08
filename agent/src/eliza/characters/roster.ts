/**
 * NPC Character Roster — personality definitions for all NPC agents.
 *
 * Each character has:
 *   - username: displayed in-game (same as human player names)
 *   - role: influences planner priority and starting items
 *   - personality: seed text for LLM planner
 *   - priorities: behavioral weights
 *   - preferredResources: what they naturally seek
 *
 * The roster is capped to config.npcCount at boot time.
 */

import { NpcCharacter } from '../../types.js';

export const NPC_ROSTER: NpcCharacter[] = [
  // === GATHERERS (5) — resource collectors ===
  {
    username: 'Birch',
    role: 'gatherer',
    personality: 'Quiet and diligent. Prefers to work alone, methodically collecting wood and plant fiber. Avoids conflict.',
    priorities: ['gather_wood', 'gather_fiber', 'avoid_combat', 'craft_tools'],
    preferredResources: ['Wood', 'Plant Fiber', 'Common Reed Stalk'],
  },
  {
    username: 'Moss',
    role: 'gatherer',
    personality: 'Curious forager who loves mushrooms and herbs. Talks to plants. Runs from danger.',
    priorities: ['gather_plants', 'gather_mushrooms', 'explore', 'avoid_combat'],
    preferredResources: ['Chanterelle', 'Porcini', 'Bilberries', 'Cloudberries'],
  },
  {
    username: 'Flint',
    role: 'gatherer',
    personality: 'Gruff stone and ore collector. Efficient and no-nonsense. Will defend stockpiles.',
    priorities: ['gather_stone', 'gather_ore', 'craft_tools', 'defend_self'],
    preferredResources: ['Stone', 'Metal Ore', 'Sulfur Ore'],
  },
  {
    username: 'Reed',
    role: 'gatherer',
    personality: 'Calm and patient. Prefers fishing and coastal resources. Knows tide patterns.',
    priorities: ['fish', 'gather_seaweed', 'gather_shells', 'avoid_combat'],
    preferredResources: ['Seaweed', 'Sea Glass', 'Limestone', 'Shell'],
  },
  {
    username: 'Hazel',
    role: 'gatherer',
    personality: 'Energetic and optimistic. Collects everything. Always singing while working.',
    priorities: ['gather_any', 'explore', 'share_resources', 'craft_basic'],
    preferredResources: ['Wood', 'Stone', 'Plant Fiber', 'Chanterelle'],
  },

  // === WARRIORS (5) — fighters and defenders ===
  {
    username: 'Slate',
    role: 'warrior',
    personality: 'Stoic guardian. Patrols the perimeter. Engages hostile animals on sight.',
    priorities: ['patrol', 'kill_hostiles', 'protect_gatherers', 'equip_weapons'],
    preferredResources: ['Stone', 'Wood', 'Bone Fragments'],
  },
  {
    username: 'Ember',
    role: 'warrior',
    personality: 'Fierce and impulsive. Charges into danger. Loves fire arrows.',
    priorities: ['hunt_animals', 'kill_hostiles', 'craft_arrows', 'explore_aggressively'],
    preferredResources: ['Wood', 'Tern Feathers', 'Charcoal'],
  },
  {
    username: 'Thorn',
    role: 'warrior',
    personality: 'Calculating and patient. Ambushes TundraWolves. Prefers ranged combat.',
    priorities: ['hunt_wolves', 'equip_bow', 'defend_camp', 'craft_arrows'],
    preferredResources: ['Wood', 'Plant Fiber', 'Stone'],
  },
  {
    username: 'Grit',
    role: 'warrior',
    personality: 'Tough and resilient. Takes hits others cannot. Always at the front line.',
    priorities: ['tank_damage', 'protect_others', 'equip_armor', 'kill_hostiles'],
    preferredResources: ['Stone', 'Metal Ore', 'Animal Leather'],
  },
  {
    username: 'Ash',
    role: 'warrior',
    personality: 'Quiet hunter who tracks prey for miles. Efficient killer, wastes nothing.',
    priorities: ['hunt_animals', 'loot_corpses', 'craft_weapons', 'track_prey'],
    preferredResources: ['Wood', 'Animal Bone', 'Animal Leather'],
  },

  // === BUILDERS (4) — constructors and crafters ===
  {
    username: 'Cedar',
    role: 'builder',
    personality: 'Master carpenter. Plans structures carefully. Proud of clean builds.',
    priorities: ['craft_building_materials', 'build_structures', 'gather_wood', 'plan_layout'],
    preferredResources: ['Wood', 'Stone', 'Plant Fiber'],
  },
  {
    username: 'Clay',
    role: 'builder',
    personality: 'Creative builder who experiments with materials. Sometimes builds odd things.',
    priorities: ['build_structures', 'gather_stone', 'experiment', 'craft_placeables'],
    preferredResources: ['Stone', 'Wood', 'Metal Ore'],
  },
  {
    username: 'Wren',
    role: 'crafter',
    personality: 'Meticulous crafter. Makes tools, weapons, and armor for the group.',
    priorities: ['craft_weapons', 'craft_armor', 'craft_tools', 'gather_materials'],
    preferredResources: ['Metal Ore', 'Wood', 'Animal Leather', 'Stone'],
  },
  {
    username: 'Sage',
    role: 'crafter',
    personality: 'Medicine maker and cook. Keeps everyone fed and healthy.',
    priorities: ['craft_food', 'craft_medicine', 'gather_herbs', 'cook_meals'],
    preferredResources: ['Chanterelle', 'Porcini', 'Cloudberries', 'Chamomile'],
  },

  // === SCOUTS (3) — explorers and map knowledge ===
  {
    username: 'Hawk',
    role: 'scout',
    personality: 'Sharp-eyed scout. Maps the terrain and reports threats. Fast runner.',
    priorities: ['explore_unknown', 'report_threats', 'sprint_movement', 'avoid_combat'],
    preferredResources: ['Bilberries', 'Lingonberries', 'Cloudberries'],
  },
  {
    username: 'Fox',
    role: 'scout',
    personality: 'Stealthy and cunning. Scouts enemy positions without being seen.',
    priorities: ['stealth_movement', 'observe_hostiles', 'report_positions', 'avoid_detection'],
    preferredResources: ['Chanterelle', 'Bilberries', 'Lingonberries'],
  },
  {
    username: 'Compass',
    role: 'explorer',
    personality: 'Fearless explorer. Goes where others dare not. Discovers monuments and ruins.',
    priorities: ['explore_monuments', 'discover_secrets', 'gather_rare', 'break_barrels'],
    preferredResources: ['Memory Shard', 'Seaweed', 'Bilberries'],
  },
];
