// Memory Grid Tech Tree Data Structure
// 
// DESIGN PHILOSOPHY:
// - Basic survival items (campfire, furnace, sleeping bag, etc.) are ALWAYS CRAFTABLE
// - Memory Grid gates MID to LATE game upgrades and PASSIVE BONUSES
// - Rescaled for fast, fun gameplay loop

export interface MemoryGridNode {
  id: string;
  name: string;
  description: string;
  cost: number;
  tier: number;
  faction?: string;
  prerequisites: string[];
  position: { x: number; y: number };
  category: 'tool' | 'weapon' | 'armor' | 'crafting' | 'vehicle' | 'technology' | 'passive';
  icon?: string;
  status: 'locked' | 'available' | 'purchased';
  unlocksItems?: string[]; // Items that this node unlocks for crafting
}

export interface MemoryGridFaction {
  id: string;
  name: string;
  description: string;
  color: string;
  philosophy: string;
  unlockCost: number;
  totalCost: number;
}

export const FACTIONS: Record<string, MemoryGridFaction> = {
  'black-wolves': {
    id: 'black-wolves',
    name: 'Black Wolves',
    description: 'Enforcer Branch',
    color: '#ef4444',
    philosophy: 'Brutal efficiency through superior firepower',
    unlockCost: 600,
    totalCost: 5600
  },
  'hive': {
    id: 'hive',
    name: 'Hive',
    description: 'Chem-Industrial Branch',
    color: '#f59e0b',
    philosophy: 'Evolution through chemical mastery',
    unlockCost: 600,
    totalCost: 5600
  },
  'university': {
    id: 'university',
    name: 'University',
    description: 'Robotics & Fabrication Branch',
    color: '#3b82f6',
    philosophy: 'Knowledge is the ultimate weapon',
    unlockCost: 600,
    totalCost: 5600
  },
  'data-angels': {
    id: 'data-angels',
    name: 'DATA ANGELS',
    description: 'Cyber & Stealth Branch',
    color: '#8b5cf6',
    philosophy: 'Information warfare in the digital age',
    unlockCost: 600,
    totalCost: 5600
  },
  'battalion': {
    id: 'battalion',
    name: 'Battalion',
    description: 'Conventional Military Branch',
    color: '#22c55e',
    philosophy: 'Disciplined force multipliers',
    unlockCost: 600,
    totalCost: 5600
  },
  'admiralty': {
    id: 'admiralty',
    name: 'Admiralty',
    description: 'Weather & Coastal Mastery Branch',
    color: '#06b6d4',
    philosophy: 'Masters of sea and storm',
    unlockCost: 600,
    totalCost: 5600
  }
};

const getRadialPosition = (angle: number, radius: number): { x: number; y: number } => ({
  x: Math.cos(angle) * radius,
  y: Math.sin(angle) * radius
});

const getCategoryFromId = (nodeId: string): 'tool' | 'weapon' | 'armor' | 'crafting' | 'vehicle' | 'technology' | 'passive' => {
  // Passive abilities
  if (nodeId.includes('speed') || nodeId.includes('efficiency') || nodeId.includes('mastery') ||
      nodeId.includes('resistance') || nodeId.includes('durability') || nodeId.includes('hp') ||
      nodeId.includes('damage') || nodeId.includes('yield') || nodeId.includes('surge') ||
      nodeId.includes('bloom') || nodeId.includes('cry') || nodeId.includes('command') ||
      nodeId.includes('overclock') || nodeId.includes('burst')) {
    return 'passive';
  }
  
  // Armor
  if (nodeId.includes('armor') || nodeId.includes('vest') || nodeId.includes('shield') ||
      nodeId.includes('harness') || nodeId.includes('boots')) {
    return 'armor';
  }
  
  // Weapons
  if (nodeId.includes('arrow') || nodeId.includes('crossbow') || nodeId.includes('knife') ||
      nodeId.includes('makarov') || nodeId.includes('pike') || nodeId.includes('hammer') ||
      nodeId.includes('cannon') || nodeId.includes('sprayer') || nodeId.includes('smg') ||
      nodeId.includes('mortar') || nodeId.includes('turret') || nodeId.includes('drone') ||
      nodeId.includes('round')) {
    return 'weapon';
  }
  
  // Tools
  if (nodeId.includes('hatchet') || nodeId.includes('pickaxe') || nodeId.includes('lantern') ||
      nodeId.includes('flashlight') || nodeId.includes('bellows') || nodeId.includes('snorkel') ||
      nodeId.includes('fishing') || nodeId.includes('bottle')) {
    return 'tool';
  }
  
  // Crafting/Structures
  if (nodeId.includes('door') || nodeId.includes('shelter') || nodeId.includes('cauldron') ||
      nodeId.includes('furnace') || nodeId.includes('collector') || nodeId.includes('vat') ||
      nodeId.includes('factory') || nodeId.includes('table') || nodeId.includes('beacon') ||
      nodeId.includes('tower') || nodeId.includes('cache')) {
    return 'crafting';
  }
  
  // Vehicles
  if (nodeId.includes('raft')) {
    return 'vehicle';
  }
  
  return 'technology';
};

// Complete Memory Grid nodes - ONLY REAL ITEMS
export const MEMORY_GRID_NODES = [
  // ============================================
  // CENTER NODE (FREE)
  // ============================================
  {
    id: 'center',
    name: 'Neuroveil™ Ocular Interface',
    description: 'OOO "Rozhkov Neuroscience" neural interface. Protects against hostile AI intrusion, processes Memory Shards for technological advancement.',
    cost: 0,
    tier: 0,
    prerequisites: [],
    position: { x: 0, y: 0 },
    category: 'technology' as const,
    status: 'purchased' as const
  },

  // ============================================
  // TIER 1 - First Upgrades (50-100 shards)
  // Mid-game weapon/tool upgrades
  // ============================================
  { 
    id: 'crossbow', 
    name: 'Crossbow', 
    description: 'Unlocks crafting the Crossbow - a mechanical crossbow with superior accuracy and power. Longer range than the bow.', 
    cost: 80, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(0, 100), 
    category: 'weapon' as const, 
    status: 'available' as const,
    unlocksItems: ['Crossbow']
  },
  { 
    id: 'metal-hatchet', 
    name: 'Metal Hatchet', 
    description: 'Unlocks crafting the Metal Hatchet - gathers significantly more wood than stone tools.', 
    cost: 60, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(Math.PI / 3, 100), 
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Metal Hatchet']
  },
  { 
    id: 'metal-pickaxe', 
    name: 'Metal Pickaxe', 
    description: 'Unlocks crafting the Metal Pickaxe - gathers significantly more stone than stone tools.', 
    cost: 60, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(2 * Math.PI / 3, 100), 
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Metal Pickaxe']
  },
  { 
    id: 'lantern', 
    name: 'Lantern', 
    description: 'Unlocks crafting Lanterns - deployable light sources that burn longer than torches.', 
    cost: 50, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(Math.PI, 100), 
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Lantern']
  },
  { 
    id: 'bush-knife', 
    name: 'Bush Knife', 
    description: 'Unlocks crafting the Bush Knife - a heavy-duty clearing blade for woodcutting and combat.', 
    cost: 80, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(4 * Math.PI / 3, 100), 
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Bush Knife']
  },
  { 
    id: 'mining-efficiency', 
    name: 'Mining Efficiency', 
    description: 'Advanced mining techniques grant +30% resource yield from all gathering activities.', 
    cost: 100, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(5 * Math.PI / 3, 100), 
    category: 'passive' as const, 
    status: 'locked' as const
  },

  // ============================================
  // TIER 2 - Mid-Game Items (100-200 shards)
  // ============================================
  { 
    id: 'bone-arrow', 
    name: 'Bone Arrow', 
    description: 'Unlocks crafting Bone Arrows - larger arrowhead with higher damage.', 
    cost: 120, 
    tier: 2, 
    prerequisites: ['crossbow', 'bush-knife', 'metal-hatchet'], 
    position: getRadialPosition(0, 180), 
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Bone Arrow']
  },
  { 
    id: 'fire-arrow', 
    name: 'Fire Arrow', 
    description: 'Unlocks crafting Fire Arrows - ignites on impact, causing burn damage over time.', 
    cost: 150, 
    tier: 2, 
    prerequisites: ['crossbow', 'lantern', 'metal-hatchet'], 
    position: getRadialPosition(Math.PI / 3, 180), 
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Fire Arrow']
  },
  { 
    id: 'flashlight', 
    name: 'Flashlight', 
    description: 'Unlocks crafting Flashlights - bright, focused electric illumination.', 
    cost: 140, 
    tier: 2, 
    prerequisites: ['lantern', 'crossbow', 'metal-pickaxe'], 
    position: getRadialPosition(2 * Math.PI / 3, 180), 
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Flashlight']
  },
  { 
    id: 'reed-bellows', 
    name: 'Reed Bellows', 
    description: 'Unlocks crafting Reed Bellows - fuel burns 50% slower, cooking/smelting 20% faster.', 
    cost: 180, 
    tier: 2, 
    prerequisites: ['metal-pickaxe', 'lantern', 'mining-efficiency'], 
    position: getRadialPosition(Math.PI, 180), 
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Reed Bellows']
  },
  { 
    id: 'crafting-speed-1', 
    name: 'Crafting Speed I', 
    description: 'Improved crafting techniques. All crafting operations are 15% faster.', 
    cost: 200, 
    tier: 2, 
    prerequisites: ['bush-knife', 'mining-efficiency', 'crossbow'], 
    position: getRadialPosition(5 * Math.PI / 3, 180), 
    category: 'passive' as const, 
    status: 'locked' as const
  },

  // ============================================
  // TIER 3 - Advanced Items (250-400 shards)
  // ============================================
  { 
    id: 'hollow-reed-arrow', 
    name: 'Hollow Reed Arrow', 
    description: 'Unlocks crafting Hollow Reed Arrows - lightweight, flies faster but deals less damage.', 
    cost: 250, 
    tier: 3, 
    prerequisites: ['bone-arrow', 'crafting-speed-1', 'fire-arrow'], 
    position: getRadialPosition(0, 270), 
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Hollow Reed Arrow']
  },
  { 
    id: 'reed-snorkel', 
    name: 'Reed Snorkel', 
    description: 'Unlocks crafting the Primitive Reed Snorkel - allows limited underwater exploration.', 
    cost: 280, 
    tier: 3, 
    prerequisites: ['fire-arrow', 'bone-arrow', 'flashlight'], 
    position: getRadialPosition(Math.PI / 3, 270), 
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Primitive Reed Snorkel']
  },
  { 
    id: 'reed-fishing-rod', 
    name: 'Reed Fishing Rod', 
    description: 'Unlocks crafting the Primitive Reed Fishing Rod - catch fish and aquatic resources.', 
    cost: 260, 
    tier: 3, 
    prerequisites: ['flashlight', 'fire-arrow', 'reed-bellows'], 
    position: getRadialPosition(2 * Math.PI / 3, 270), 
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Primitive Reed Fishing Rod']
  },
  { 
    id: 'reed-rain-collector', 
    name: 'Rain Collector', 
    description: 'Unlocks crafting Reed Rain Collectors - automatically gather fresh water during storms (40L).', 
    cost: 350, 
    tier: 3, 
    prerequisites: ['reed-bellows', 'flashlight', 'crafting-speed-1'], 
    position: getRadialPosition(4 * Math.PI / 3, 270), 
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Reed Rain Collector']
  },
  { 
    id: 'movement-speed-1', 
    name: 'Movement Speed I', 
    description: 'Enhanced mobility training. Move 10% faster.', 
    cost: 400, 
    tier: 3, 
    prerequisites: ['crafting-speed-1', 'reed-bellows', 'bone-arrow'], 
    position: getRadialPosition(5 * Math.PI / 3, 270), 
    category: 'passive' as const, 
    status: 'locked' as const
  },

  // ============================================
  // TIER 4 - Late-Game Items (450-700 shards)
  // ============================================
  { 
    id: 'metal-door', 
    name: 'Metal Door', 
    description: 'Unlocks crafting Metal Doors - reinforced security for your most valuable areas.', 
    cost: 500, 
    tier: 4, 
    prerequisites: ['hollow-reed-arrow', 'movement-speed-1', 'reed-snorkel'], 
    position: getRadialPosition(0, 370), 
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Metal Door']
  },
  { 
    id: 'shelter', 
    name: 'Shelter', 
    description: 'Unlocks crafting Shelters - sturdy structures that provide significant protection.', 
    cost: 600, 
    tier: 4, 
    prerequisites: ['reed-snorkel', 'hollow-reed-arrow', 'reed-fishing-rod'], 
    position: getRadialPosition(Math.PI / 3, 370), 
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Shelter']
  },
  { 
    id: '9x18mm-round', 
    name: '9x18mm Ammunition', 
    description: 'Unlocks crafting 9x18mm Rounds - ammunition for the Makarov PM pistol.', 
    cost: 550, 
    tier: 4, 
    prerequisites: ['reed-fishing-rod', 'reed-snorkel', 'hollow-reed-arrow'], 
    position: getRadialPosition(2 * Math.PI / 3, 370), 
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['9x18mm Round']
  },
  { 
    id: 'metal-armor', 
    name: 'Metal Armor', 
    description: 'Unlocks crafting Metal Armor - superior protection for serious combat.', 
    cost: 700, 
    tier: 4, 
    prerequisites: ['reed-rain-collector', 'hollow-reed-arrow', 'movement-speed-1'], 
    position: getRadialPosition(Math.PI, 370), 
    category: 'armor' as const, 
    status: 'locked' as const
  },
  { 
    id: 'crafting-speed-2', 
    name: 'Crafting Speed II', 
    description: 'Master crafting techniques. All crafting operations are 25% faster.', 
    cost: 600, 
    tier: 4, 
    prerequisites: ['movement-speed-1', 'reed-rain-collector', 'hollow-reed-arrow'], 
    position: getRadialPosition(5 * Math.PI / 3, 370), 
    category: 'passive' as const, 
    status: 'locked' as const
  },

  // ============================================
  // TIER 5 - End-Game Items (800-1000 shards)
  // ============================================
  { 
    id: 'makarov-pm', 
    name: 'Makarov PM', 
    description: 'Unlocks crafting the Makarov PM - a reliable Soviet-era semi-automatic pistol. Longest range, fastest fire rate.', 
    cost: 900, 
    tier: 5, 
    prerequisites: ['metal-door', 'crafting-speed-2', 'shelter'], 
    position: getRadialPosition(0, 480), 
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Makarov PM']
  },
  { 
    id: 'combat-drone', 
    name: 'Combat Drone', 
    description: 'Unlocks autonomous combat drone technology - a robotic ally that assists in combat.', 
    cost: 950, 
    tier: 5, 
    prerequisites: ['shelter', 'metal-door', '9x18mm-round'], 
    position: getRadialPosition(Math.PI / 3, 480), 
    category: 'technology' as const, 
    status: 'locked' as const
  },
  { 
    id: 'rain-collector', 
    name: 'Advanced Rain Collector', 
    description: 'Upgrade: Rain collectors have 2x capacity and collect water faster.', 
    cost: 800, 
    tier: 5, 
    prerequisites: ['9x18mm-round', 'shelter', 'metal-armor'], 
    position: getRadialPosition(2 * Math.PI / 3, 480), 
    category: 'passive' as const, 
    status: 'locked' as const
  },
  { 
    id: 'broth-mastery', 
    name: 'Broth Mastery', 
    description: 'Master broth recipes. All broth effects last 50% longer.', 
    cost: 850, 
    tier: 5, 
    prerequisites: ['metal-armor', '9x18mm-round', 'shelter'], 
    position: getRadialPosition(Math.PI, 480), 
    category: 'passive' as const, 
    status: 'locked' as const
  },
  { 
    id: 'armor-mastery', 
    name: 'Armor Mastery', 
    description: 'Master armor maintenance. All armor durability increased by 30%.', 
    cost: 900, 
    tier: 5, 
    prerequisites: ['metal-armor', 'shelter', 'crafting-speed-2'], 
    position: getRadialPosition(4 * Math.PI / 3, 480), 
    category: 'passive' as const, 
    status: 'locked' as const
  },
  { 
    id: 'movement-speed-2', 
    name: 'Movement Speed II', 
    description: 'Advanced mobility training. Move 20% faster.', 
    cost: 1000, 
    tier: 5, 
    prerequisites: ['crafting-speed-2', 'metal-armor', 'metal-door'], 
    position: getRadialPosition(5 * Math.PI / 3, 480), 
    category: 'passive' as const, 
    status: 'locked' as const
  },

  // ============================================
  // FACTION UNLOCK NODES (600 shards each)
  // ============================================
  { id: 'unlock-black-wolves', name: 'Unlock Black Wolves', description: `Unlock access to the ${FACTIONS['black-wolves'].name} specialization branch. ${FACTIONS['black-wolves'].philosophy}`, cost: 600, tier: 6, faction: 'black-wolves', prerequisites: ['makarov-pm', 'combat-drone', 'rain-collector', 'broth-mastery', 'armor-mastery', 'movement-speed-2'], position: getRadialPosition(0, 680), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-hive', name: 'Unlock Hive', description: `Unlock access to the ${FACTIONS['hive'].name} specialization branch. ${FACTIONS['hive'].philosophy}`, cost: 600, tier: 6, faction: 'hive', prerequisites: ['makarov-pm', 'combat-drone', 'rain-collector', 'broth-mastery', 'armor-mastery', 'movement-speed-2'], position: getRadialPosition(Math.PI / 3, 680), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-university', name: 'Unlock University', description: `Unlock access to the ${FACTIONS['university'].name} specialization branch. ${FACTIONS['university'].philosophy}`, cost: 600, tier: 6, faction: 'university', prerequisites: ['makarov-pm', 'combat-drone', 'rain-collector', 'broth-mastery', 'armor-mastery', 'movement-speed-2'], position: getRadialPosition(2 * Math.PI / 3, 680), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-data-angels', name: 'Unlock DATA ANGELS', description: `Unlock access to the ${FACTIONS['data-angels'].name} specialization branch. ${FACTIONS['data-angels'].philosophy}`, cost: 600, tier: 6, faction: 'data-angels', prerequisites: ['makarov-pm', 'combat-drone', 'rain-collector', 'broth-mastery', 'armor-mastery', 'movement-speed-2'], position: getRadialPosition(Math.PI, 680), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-battalion', name: 'Unlock Battalion', description: `Unlock access to the ${FACTIONS['battalion'].name} specialization branch. ${FACTIONS['battalion'].philosophy}`, cost: 600, tier: 6, faction: 'battalion', prerequisites: ['makarov-pm', 'combat-drone', 'rain-collector', 'broth-mastery', 'armor-mastery', 'movement-speed-2'], position: getRadialPosition(4 * Math.PI / 3, 680), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-admiralty', name: 'Unlock Admiralty', description: `Unlock access to the ${FACTIONS['admiralty'].name} specialization branch. ${FACTIONS['admiralty'].philosophy}`, cost: 600, tier: 6, faction: 'admiralty', prerequisites: ['makarov-pm', 'combat-drone', 'rain-collector', 'broth-mastery', 'armor-mastery', 'movement-speed-2'], position: getRadialPosition(5 * Math.PI / 3, 680), category: 'technology' as const, status: 'locked' as const },

  // ============================================
  // FACTION BRANCHES (400-2000 shards per node)
  // ============================================

  // BLACK WOLVES - Berserker Path
  ...(() => {
    const baseAngle = 0;
    const path = [
      { id: 'riot-vest', name: 'Riot Vest', description: 'Light assault armor with high mobility', cost: 400 },
      { id: 'shock-pike', name: 'Shock Pike', description: 'Electrified melee weapon, stuns targets', cost: 600 },
      { id: 'slab-shield', name: 'Slab Shield', description: 'Heavy riot shield, blocks projectiles', cost: 800 },
      { id: 'flash-hammer', name: 'Flash Hammer', description: 'Stun grenade launcher attachment', cost: 1200 },
      { id: 'adrenal-surge', name: 'Adrenal Surge', description: '5s sprint + 30% melee damage, 60s cooldown (Ultimate)', cost: 2000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'black-wolves',
      prerequisites: i === 0 ? ['unlock-black-wolves'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 780 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // BLACK WOLVES - Assassin Path
  ...(() => {
    const baseAngle = 0;
    const path = [
      { id: 'combat-stims', name: 'Combat Stims', description: 'Enhanced movement and reaction time (Passive +10% Speed)', cost: 400 },
      { id: 'suppressor-rig', name: 'Suppressor Rig', description: 'Stealth gear for silent takedowns', cost: 600 },
      { id: 'grav-boots', name: 'Grav Boots', description: 'Dodge rolls become jumps with extended range', cost: 800 },
      { id: 'field-interrogator', name: 'Field Interrogator', description: 'Portable information extraction station', cost: 1200 },
      { id: 'armor-durability', name: 'Armor Durability', description: 'All equipped armor lasts longer (Passive +25% Durability)', cost: 2000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'black-wolves',
      prerequisites: i === 0 ? ['unlock-black-wolves'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 780 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // HIVE - Industrialist Path
  ...(() => {
    const baseAngle = Math.PI / 3;
    const path = [
      { id: 'spore-grain-vat', name: 'Spore Grain Vat', description: 'Produces specialized bio-materials', cost: 400 },
      { id: 'slime-furnace', name: 'Slime Furnace', description: 'Process organic materials into fuel', cost: 600 },
      { id: 'chameleon-harness', name: 'Chameleon Harness', description: 'Adaptive camouflage system', cost: 800 },
      { id: 'mealworm-factory', name: 'Mealworm Factory', description: 'Compact bio-farm producing efficient protein', cost: 1200 },
      { id: 'crafting-speed-hive', name: 'Crafting Speed', description: 'All crafting operations faster (Passive +20% Speed)', cost: 2000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'hive',
      prerequisites: i === 0 ? ['unlock-hive'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 780 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // HIVE - Toxicologist Path
  ...(() => {
    const baseAngle = Math.PI / 3;
    const path = [
      { id: 'venom-knife', name: 'Venom Knife', description: 'Poison-coated blade, DoT damage', cost: 400 },
      { id: 'poison-resistance', name: 'Poison Resistance', description: 'Reduced toxin damage (Passive +15% Resistance)', cost: 600 },
      { id: 'acid-sprayer', name: 'Acid Sprayer', description: 'Chemical weapon that melts through armor', cost: 800 },
      { id: 'toxic-coating', name: 'Toxic Coating', description: 'Apply poison coating to any projectiles', cost: 1200 },
      { id: 'toxic-bloom', name: 'Toxic Bloom', description: 'AoE slowing mist for 8s, 60s cooldown (Ultimate)', cost: 2000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'hive',
      prerequisites: i === 0 ? ['unlock-hive'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 780 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // UNIVERSITY - Engineer Path
  ...(() => {
    const baseAngle = 2 * Math.PI / 3;
    const path = [
      { id: 'auto-turret', name: 'Auto-Turret', description: 'Automated defense system', cost: 400 },
      { id: 'scanner-drone', name: 'Scanner Drone', description: 'Autonomous resource detection', cost: 600 },
      { id: 'repair-swarm', name: 'Repair Swarm', description: 'Deployable structure maintenance bots', cost: 800 },
      { id: 'stabilizer-field', name: 'Stabilizer Field', description: 'Area protection from environmental damage', cost: 1200 },
      { id: 'fabricator-burst', name: 'Fabricator Burst', description: 'Complete next craft instantly, 60s cooldown (Ultimate)', cost: 2000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'university',
      prerequisites: i === 0 ? ['unlock-university'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 780 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // UNIVERSITY - Scholar Path
  ...(() => {
    const baseAngle = 2 * Math.PI / 3;
    const path = [
      { id: 'logic-furnace', name: 'Logic Furnace', description: 'AI-assisted material processing', cost: 400 },
      { id: 'bioprinter-table', name: 'Bioprinter Table', description: '3D print organic materials and food', cost: 600 },
      { id: 'geneforge-vat', name: 'GeneForge Vat', description: 'Advanced biological material synthesis', cost: 800 },
      { id: 'mining-yield-ii', name: 'Mining Yield II', description: 'Extract more resources (Passive +35% Yield)', cost: 1200 },
      { id: 'crafting-speed-uni', name: 'Crafting Speed', description: 'Enhanced manufacturing (Passive +25% Speed)', cost: 2000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'university',
      prerequisites: i === 0 ? ['unlock-university'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 780 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // DATA ANGELS - Netrunner Path
  ...(() => {
    const baseAngle = Math.PI;
    const path = [
      { id: 'jammer-tower', name: 'Jammer Tower', description: 'Disable electronic devices in area', cost: 400 },
      { id: 'ghost-uplink', name: 'Ghost Uplink', description: 'Remote access to electronic systems', cost: 600 },
      { id: 'neurochef-decryptor', name: 'Neurochef Decryptor', description: 'Crack advanced security systems', cost: 800 },
      { id: 'drone-hijack', name: 'Drone Hijack Pulse', description: 'Take control of enemy systems', cost: 1200 },
      { id: 'hacking-speed', name: 'Hacking Speed', description: 'Faster infiltration (Passive +25% Speed)', cost: 2000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'data-angels',
      prerequisites: i === 0 ? ['unlock-data-angels'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 780 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // DATA ANGELS - Phantom Path
  ...(() => {
    const baseAngle = Math.PI;
    const path = [
      { id: 'backdoor-cloak', name: 'Backdoor Cloak', description: '5-second invisibility device', cost: 400 },
      { id: 'signal-scrubber', name: 'Signal Scrubber', description: 'Mobile electronic countermeasures', cost: 600 },
      { id: 'memory-leech', name: 'Memory Leech', description: 'Extract info from defeated enemies', cost: 800 },
      { id: 'movement-speed-da', name: 'Movement Speed', description: 'Enhanced mobility (Passive +18% Speed)', cost: 1200 },
      { id: 'overclock', name: 'Overclock', description: '10s invisibility to turrets & drones, 60s cooldown (Ultimate)', cost: 2000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'data-angels',
      prerequisites: i === 0 ? ['unlock-data-angels'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 780 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // BATTALION - Colonel Path
  ...(() => {
    const baseAngle = 4 * Math.PI / 3;
    const path = [
      { id: 'battalion-smg', name: 'Battalion SMG', description: 'Military-grade submachine gun', cost: 400 },
      { id: 'mortar-nest', name: 'Mortar Nest', description: 'Indirect fire support weapon', cost: 600 },
      { id: 'fragment-armor', name: 'Fragment Armor', description: 'Heavy armor with explosive resistance', cost: 800 },
      { id: 'ammo-press', name: 'Military Ammo Press', description: 'High-grade ammunition production', cost: 1200 },
      { id: 'ranged-damage', name: 'Ranged Damage', description: 'All projectiles deal more (Passive +25% Damage)', cost: 2000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'battalion',
      prerequisites: i === 0 ? ['unlock-battalion'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 780 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // BATTALION - Tactician Path
  ...(() => {
    const baseAngle = 4 * Math.PI / 3;
    const path = [
      { id: 'tactical-optics', name: 'Tactical Optics', description: 'Extended range and accuracy (Passive +25% Range)', cost: 400 },
      { id: 'supply-cache', name: 'Supply Cache', description: 'Deployable ammo and medical depot', cost: 600 },
      { id: 'field-ration-kit', name: 'Field Ration Kit', description: 'Efficient nutrition for operations', cost: 800 },
      { id: 'max-hp', name: 'Max HP', description: 'Enhanced conditioning (Passive +20% Health)', cost: 1200 },
      { id: 'rally-cry', name: 'Rally Cry', description: 'Allies gain +25% reload, -20% recoil for 20s, 60s cooldown (Ultimate)', cost: 2000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'battalion',
      prerequisites: i === 0 ? ['unlock-battalion'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 780 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // ADMIRALTY - Captain Path
  ...(() => {
    const baseAngle = 5 * Math.PI / 3;
    const path = [
      { id: 'tide-beacon', name: 'Tide Beacon', description: 'Maritime spawn point and navigation aid', cost: 400 },
      { id: 'storm-sail-raft', name: 'Storm Sail Raft', description: 'Fast water transportation', cost: 600 },
      { id: 'net-cannon', name: 'Net Cannon', description: 'Fishing and entanglement weapon', cost: 800 },
      { id: 'luminous-buoy', name: 'Luminous Buoy', description: 'Mini-lighthouse for navigation', cost: 1200 },
      { id: 'naval-command', name: 'Naval Command', description: 'Allied vessels gain speed, cold immunity (Passive)', cost: 2000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'admiralty',
      prerequisites: i === 0 ? ['unlock-admiralty'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 780 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // ADMIRALTY - Storm Caller Path
  ...(() => {
    const baseAngle = 5 * Math.PI / 3;
    const path = [
      { id: 'saltwater-desal', name: 'Saltwater Desal', description: 'Convert seawater to drinking water', cost: 400 },
      { id: 'weathercock-tower', name: 'Weathercock Tower', description: 'Force rain, boost crop yield', cost: 600 },
      { id: 'weather-resistance', name: 'Weather Resistance', description: 'Reduced environmental damage (Passive +15%)', cost: 800 },
      { id: 'tide-gauge', name: 'Tide Gauge', description: 'Boosts crop growth after rain', cost: 1200 },
      { id: 'tempest-call', name: 'Tempest Call', description: 'Summon heavy storm, damages enemies, 90s cooldown (Ultimate)', cost: 2000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'admiralty',
      prerequisites: i === 0 ? ['unlock-admiralty'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 780 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })()
];

export const getNodesByTier = (tier: number): MemoryGridNode[] => {
  return MEMORY_GRID_NODES.filter(node => node.tier === tier) as MemoryGridNode[];
};

export const getNodesByFaction = (factionId?: string): MemoryGridNode[] => {
  return MEMORY_GRID_NODES.filter(node => (node as any).faction === factionId) as MemoryGridNode[];
};

export const isNodeAvailable = (nodeId: string, purchasedNodes: Set<string>): boolean => {
  const node = MEMORY_GRID_NODES.find(n => n.id === nodeId);
  if (!node) return false;
  
  if (nodeId.includes('unlock-')) {
    const tier5Nodes = ['makarov-pm', 'combat-drone', 'rain-collector', 'broth-mastery', 'armor-mastery', 'movement-speed-2'];
    return tier5Nodes.some((tier5Id: string) => purchasedNodes.has(tier5Id));
  }
  
  return node.prerequisites.some((prereqId: string) => purchasedNodes.has(prereqId));
};

// Map of item names to their required Memory Grid node IDs
// Items NOT in this map are ALWAYS CRAFTABLE
export const ITEM_TO_NODE_MAP: Record<string, string> = {
  // Tier 1 items
  'Crossbow': 'crossbow',
  'Metal Hatchet': 'metal-hatchet',
  'Metal Pickaxe': 'metal-pickaxe',
  'Lantern': 'lantern',
  'Bush Knife': 'bush-knife',
  
  // Tier 2 items
  'Bone Arrow': 'bone-arrow',
  'Fire Arrow': 'fire-arrow',
  'Flashlight': 'flashlight',
  'Reed Bellows': 'reed-bellows',
  
  // Tier 3 items
  'Hollow Reed Arrow': 'hollow-reed-arrow',
  'Primitive Reed Snorkel': 'reed-snorkel',
  'Primitive Reed Fishing Rod': 'reed-fishing-rod',
  'Reed Rain Collector': 'reed-rain-collector',
  
  // Tier 4 items
  'Metal Door': 'metal-door',
  'Shelter': 'shelter',
  '9x18mm Round': '9x18mm-round',
  
  // Tier 5 items
  'Makarov PM': 'makarov-pm',
};

// ALWAYS CRAFTABLE (not in ITEM_TO_NODE_MAP):
// Camp Fire, Furnace, Sleeping Bag, Wooden Storage Box, Stash, Matron's Chest
// Cerametal Field Cauldron Mk. II (Broth Pot), Wood Door, Reed Water Bottle
// Hunting Bow, Wooden Arrow, Wooden Spear, Stone Spear
// Stone Hatchet, Stone Pickaxe, Torch, Rock, Blueprint
// Bandage, Bone Club, Bone Knife, Bone Gaff Hook, Combat Ladle, Repair Hammer
// Rope, Cloth

export const canCraftItem = (itemName: string, purchasedNodes: Set<string>): boolean => {
  const requiredNode = ITEM_TO_NODE_MAP[itemName];
  if (!requiredNode) return true; // Always craftable
  return purchasedNodes.has(requiredNode);
};

export const getRequiredNodeForItem = (itemName: string): string | null => {
  return ITEM_TO_NODE_MAP[itemName] || null;
};
