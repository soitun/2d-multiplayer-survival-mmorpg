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
    unlockCost: 400,
    totalCost: 6200 // 400 unlock + 5800 branch (400+600+900+1400+2500)
  },
  'hive': {
    id: 'hive',
    name: 'Hive',
    description: 'Chem-Industrial Branch',
    color: '#f59e0b',
    philosophy: 'Evolution through chemical mastery',
    unlockCost: 400,
    totalCost: 6200
  },
  'university': {
    id: 'university',
    name: 'University',
    description: 'Robotics & Fabrication Branch',
    color: '#3b82f6',
    philosophy: 'Knowledge is the ultimate weapon',
    unlockCost: 400,
    totalCost: 6200
  },
  'data-angels': {
    id: 'data-angels',
    name: 'DATA ANGELS',
    description: 'Cyber & Stealth Branch',
    color: '#8b5cf6',
    philosophy: 'Information warfare in the digital age',
    unlockCost: 400,
    totalCost: 6200
  },
  'battalion': {
    id: 'battalion',
    name: 'Battalion',
    description: 'Conventional Military Branch',
    color: '#22c55e',
    philosophy: 'Disciplined force multipliers',
    unlockCost: 400,
    totalCost: 6200
  },
  'admiralty': {
    id: 'admiralty',
    name: 'Admiralty',
    description: 'Weather & Coastal Mastery Branch',
    color: '#06b6d4',
    philosophy: 'Masters of sea and storm',
    unlockCost: 400,
    totalCost: 6200
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
  // TIER 1 - Basic Improvements (15-30 shards)
  // First 15 minutes - immediate power upgrades
  // 6 nodes - each starts a distinct progression branch
  // Radius: 120
  // BRANCH SECTORS: Each T1 node "owns" a 60° sector (2π/6)
  // ============================================
  { 
    id: 'crossbow', 
    name: 'Crossbow', 
    description: 'Unlocks crafting the Crossbow - a mechanical crossbow with superior accuracy and power. Longer range than the bow.', 
    cost: 25, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(0, 120), // 0° - BRANCH 1: Arrows → Ammo → Gun → Drone
    category: 'weapon' as const, 
    status: 'available' as const,
    unlocksItems: ['Crossbow']
  },
  { 
    id: 'metal-hatchet', 
    name: 'Metal Hatchet', 
    description: 'Unlocks crafting the Metal Hatchet - gathers significantly more wood than stone tools.', 
    cost: 15, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(1 * 2 * Math.PI / 6, 120), // 60° - BRANCH 2: Building → Storage → Shelter → Harvester
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Metal Hatchet']
  },
  { 
    id: 'reed-harpoon', 
    name: 'Reed Harpoon', 
    description: 'Unlocks crafting the Reed Harpoon - a fragile harpoon made from reeds and bone fragments. Light and buoyant, good for water combat.', 
    cost: 18, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(2 * 2 * Math.PI / 6, 120), // 120° - BRANCH 3: Fishing/Water
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Reed Harpoon']
  },
  { 
    id: 'lantern', 
    name: 'Lantern', 
    description: 'Unlocks crafting Lanterns - deployable light sources that burn longer than torches.', 
    cost: 20, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(3 * 2 * Math.PI / 6, 120), // 180° - BRANCH 4: Food/Survival → Broth
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Lantern']
  },
  { 
    id: 'metal-pickaxe', 
    name: 'Metal Pickaxe', 
    description: 'Unlocks crafting the Metal Pickaxe - gathers significantly more stone than stone tools.', 
    cost: 15, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(4 * 2 * Math.PI / 6, 120), // 240° - BRANCH 5: Mining/Crafting
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Metal Pickaxe']
  },
  { 
    id: 'stone-spear', 
    name: 'Stone Spear', 
    description: 'Unlocks crafting the Stone Spear - a basic spear tipped with sharpened stone. Has longer reach and causes bleeding.', 
    cost: 20, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(5 * 2 * Math.PI / 6, 120), // 300° - BRANCH 6: Movement/Armor
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Stone Spear']
  },

  // ============================================
  // TIER 2 - Specialization (50-80 shards)
  // LINEAR CHAINS - single prerequisite, NO overlapping lines
  // Each T1 node spawns its own progression branch
  // Radius: 220
  // ============================================
  { 
    id: 'bone-arrow', 
    name: 'Bone Arrow', 
    description: 'Unlocks crafting Bone Arrows - larger arrowhead with higher damage.', 
    cost: 50, 
    tier: 2, 
    prerequisites: ['crossbow'], 
    position: getRadialPosition(0, 220), // Branch 1: Straight from crossbow
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Bone Arrow']
  },
  { 
    id: 'bush-knife', 
    name: 'Bush Knife', 
    description: 'Unlocks crafting the Bush Knife - a heavy-duty clearing blade for woodcutting and combat.', 
    cost: 55, 
    tier: 2, 
    prerequisites: ['metal-hatchet'], 
    position: getRadialPosition(1 * 2 * Math.PI / 6, 220), // Branch 2: Straight from metal-hatchet
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Bush Knife']
  },
  { 
    id: 'bone-gaff-hook', 
    name: 'Bone Gaff Hook', 
    description: 'Unlocks crafting Bone Gaff Hooks - a sharp, curved bone hook for fishing and combat. Component for crafting fishing rods.', 
    cost: 65, 
    tier: 2, 
    prerequisites: ['reed-harpoon'], 
    position: getRadialPosition(2 * 2 * Math.PI / 6, 220), // Branch 3: Straight from reed-harpoon
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Bone Gaff Hook']
  },
  { 
    id: 'flashlight', 
    name: 'Flashlight', 
    description: 'Unlocks crafting Flashlights - bright, focused electric illumination.', 
    cost: 55, 
    tier: 2, 
    prerequisites: ['lantern'], 
    position: getRadialPosition(3 * 2 * Math.PI / 6, 220), // Branch 4: Straight from lantern
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Flashlight']
  },
  { 
    id: 'reed-bellows', 
    name: 'Reed Bellows', 
    description: 'Unlocks crafting Reed Bellows - fuel burns 50% slower, cooking/smelting 20% faster.', 
    cost: 70, 
    tier: 2, 
    prerequisites: ['metal-pickaxe'], 
    position: getRadialPosition(4 * 2 * Math.PI / 6, 220), // Branch 5: Straight from metal-pickaxe
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Reed Bellows']
  },
  { 
    id: 'movement-speed-1', 
    name: 'Movement Speed I', 
    description: 'Enhanced mobility training. Move 10% faster.', 
    cost: 80, 
    tier: 2, 
    prerequisites: ['stone-spear'], 
    position: getRadialPosition(5 * 2 * Math.PI / 6, 220), // Branch 6: Straight from stone-spear
    category: 'passive' as const, 
    status: 'locked' as const
  },

  // ============================================
  // TIER 3 - Advanced Gear (120-200 shards)
  // LINEAR CHAINS continue - single prerequisite each
  // Each branch extends independently
  // Radius: 320
  // ============================================
  { 
    id: 'fire-arrow', 
    name: 'Fire Arrow', 
    description: 'Unlocks crafting Fire Arrows - ignites on impact, causing burn damage over time.', 
    cost: 120, 
    tier: 3, 
    prerequisites: ['bone-arrow'], 
    position: getRadialPosition(0, 320), // Branch 1: Continues from bone-arrow
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Fire Arrow']
  },
  { 
    id: 'large-wooden-storage-box', 
    name: 'Large Wooden Storage Box', 
    description: 'Unlocks crafting Large Wooden Storage Boxes - large containers for storing many items. Holds 48 stacks.', 
    cost: 150, 
    tier: 3, 
    prerequisites: ['bush-knife'], 
    position: getRadialPosition(1 * 2 * Math.PI / 6, 320), // Branch 2: Continues from bush-knife
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Large Wooden Storage Box']
  },
  { 
    id: 'reed-fishing-rod', 
    name: 'Reed Fishing Rod', 
    description: 'Unlocks crafting the Primitive Reed Fishing Rod - catch fish and aquatic resources.', 
    cost: 130, 
    tier: 3, 
    prerequisites: ['bone-gaff-hook'], 
    position: getRadialPosition(2 * 2 * Math.PI / 6, 320), // Branch 3: Continues from bone-gaff-hook
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Primitive Reed Fishing Rod']
  },
  { 
    id: 'reed-rain-collector', 
    name: 'Reed Rain Collector', 
    description: 'Unlocks crafting Reed Rain Collectors - automatically gather fresh water during storms (40L).', 
    cost: 140, 
    tier: 3, 
    prerequisites: ['flashlight'], 
    position: getRadialPosition(3 * 2 * Math.PI / 6, 320), // Branch 4: Continues from flashlight
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Reed Rain Collector']
  },
  { 
    id: 'mining-efficiency', 
    name: 'Mining Efficiency', 
    description: 'Advanced mining techniques grant +30% resource yield from all gathering activities.', 
    cost: 180, 
    tier: 3, 
    prerequisites: ['reed-bellows'], 
    position: getRadialPosition(4 * 2 * Math.PI / 6, 320), // Branch 5: Continues from reed-bellows
    category: 'passive' as const, 
    status: 'locked' as const
  },
  { 
    id: 'movement-speed-2', 
    name: 'Movement Speed II', 
    description: 'Advanced mobility training. Move 20% faster total.', 
    cost: 200, 
    tier: 3, 
    prerequisites: ['movement-speed-1'], 
    position: getRadialPosition(5 * 2 * Math.PI / 6, 320), // Branch 6: Continues from movement-speed-1
    category: 'passive' as const, 
    status: 'locked' as const
  },

  // ============================================
  // TIER 4 - Late Game (300-450 shards)
  // LINEAR CHAINS continue - single prerequisite each
  // Each branch extends independently
  // Radius: 420
  // ============================================
  { 
    id: 'hollow-reed-arrow', 
    name: 'Hollow Reed Arrow', 
    description: 'Unlocks crafting Hollow Reed Arrows - lightweight, flies faster but deals less damage.', 
    cost: 300, 
    tier: 4, 
    prerequisites: ['fire-arrow'], 
    position: getRadialPosition(0, 420), // Branch 1: Continues from fire-arrow
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Hollow Reed Arrow']
  },
  { 
    id: 'metal-door', 
    name: 'Metal Door', 
    description: 'Unlocks crafting Metal Doors - reinforced security for your most valuable areas.', 
    cost: 320, 
    tier: 4, 
    prerequisites: ['large-wooden-storage-box'], 
    position: getRadialPosition(1 * 2 * Math.PI / 6, 420), // Branch 2: Continues from large-wooden-storage-box
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Metal Door']
  },
  { 
    id: 'reed-snorkel', 
    name: 'Reed Snorkel', 
    description: 'Unlocks crafting the Primitive Reed Snorkel - allows limited underwater exploration.', 
    cost: 350, 
    tier: 4, 
    prerequisites: ['reed-fishing-rod'], 
    position: getRadialPosition(2 * 2 * Math.PI / 6, 420), // Branch 3: Continues from reed-fishing-rod
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Primitive Reed Snorkel']
  },
  { 
    id: 'refrigerator', 
    name: 'Refrigerator', 
    description: 'Unlocks crafting Refrigerators - refrigerated containers that preserve food. Holds 30 stacks of food, seeds, and water containers.', 
    cost: 380, 
    tier: 4, 
    prerequisites: ['reed-rain-collector'], 
    position: getRadialPosition(3 * 2 * Math.PI / 6, 420), // Branch 4: Continues from reed-rain-collector
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Refrigerator']
  },
  { 
    id: 'crafting-speed-1', 
    name: 'Crafting Speed I', 
    description: 'Improved crafting techniques. All crafting operations are 15% faster.', 
    cost: 400, 
    tier: 4, 
    prerequisites: ['mining-efficiency'], 
    position: getRadialPosition(4 * 2 * Math.PI / 6, 420), // Branch 5: Continues from mining-efficiency
    category: 'passive' as const, 
    status: 'locked' as const
  },
  { 
    id: 'armor-mastery', 
    name: 'Armor Mastery', 
    description: 'Master armor maintenance. All armor durability increased by 30%.', 
    cost: 420, 
    tier: 4, 
    prerequisites: ['movement-speed-2'], 
    position: getRadialPosition(5 * 2 * Math.PI / 6, 420), // Branch 6: Continues from movement-speed-2
    category: 'passive' as const, 
    status: 'locked' as const
  },

  // ============================================
  // TIER 5 - End Game (600-900 shards)
  // Week 1 - Major milestones
  // Radius: 520
  // ============================================
  { 
    id: '9x18mm-round', 
    name: '9x18mm Ammunition', 
    description: 'Unlocks crafting 9x18mm Rounds - ammunition for the Makarov PM pistol.', 
    cost: 600, 
    tier: 5, 
    prerequisites: ['hollow-reed-arrow'], 
    position: getRadialPosition(0, 520), // Branch 1: Continues from hollow-reed-arrow
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['9x18mm Round']
  },
  { 
    id: 'shelter', 
    name: 'Shelter', 
    description: 'Unlocks crafting Shelters - sturdy structures that provide significant protection.', 
    cost: 650, 
    tier: 5, 
    prerequisites: ['metal-door'], 
    position: getRadialPosition(1 * 2 * Math.PI / 6, 520), // Branch 2: Continues from metal-door
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Shelter']
  },
  { 
    id: 'broth-mastery', 
    name: 'Broth Mastery', 
    description: 'Master broth recipes. All broth effects last 50% longer.', 
    cost: 700, 
    tier: 5, 
    prerequisites: ['refrigerator'], 
    position: getRadialPosition(3 * 2 * Math.PI / 6, 520), // Branch 4: Continues from refrigerator
    category: 'passive' as const, 
    status: 'locked' as const
  },
  { 
    id: 'crafting-speed-2', 
    name: 'Crafting Speed II', 
    description: 'Master crafting techniques. All crafting operations are 25% faster.', 
    cost: 750, 
    tier: 5, 
    prerequisites: ['crafting-speed-1'], 
    position: getRadialPosition(4 * 2 * Math.PI / 6, 520), // Branch 5: Continues from crafting-speed-1
    category: 'passive' as const, 
    status: 'locked' as const
  },

  // ============================================
  // TIER 6 - Ultimate (800-1000 shards)
  // Week 1-2 - Final upgrades before factions
  // Radius: 620
  // ============================================
  { 
    id: 'makarov-pm', 
    name: 'Makarov PM', 
    description: 'Unlocks crafting the Makarov PM - a reliable Soviet-era semi-automatic pistol. Longest range, fastest fire rate.', 
    cost: 800, 
    tier: 6, 
    prerequisites: ['9x18mm-round'], 
    position: getRadialPosition(0, 620), // Branch 1: Continues from 9x18mm-round
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Makarov PM']
  },
  { 
    id: 'harvester-drone', 
    name: 'Harvester Drone', 
    description: 'Unlocks autonomous harvesting drone technology - automatically gathers nearby resources.', 
    cost: 850, 
    tier: 6, 
    prerequisites: ['shelter'], 
    position: getRadialPosition(1 * 2 * Math.PI / 6, 620), // Branch 2: Continues from shelter
    category: 'technology' as const, 
    status: 'locked' as const
  },

  // ============================================
  // TIER 7 - Capstone (1000 shards)
  // Week 2-3 - Final node before factions
  // Radius: 720
  // ============================================
  { 
    id: 'combat-drone', 
    name: 'Combat Drone', 
    description: 'Unlocks autonomous combat drone technology - a robotic ally that assists in combat.', 
    cost: 1000, 
    tier: 7, 
    prerequisites: ['makarov-pm'], 
    position: getRadialPosition(0, 720), // Branch 1: Continues from makarov-pm
    category: 'technology' as const, 
    status: 'locked' as const
  },

  // ============================================
  // FACTION UNLOCK NODES (400 shards each)
  // Major milestone - requires ANY Tier 5+ node
  // Player commits to ONE faction (reset costs 2000 shards)
  // Radius: 900 (increased spacing from core nodes)
  // ============================================
  { id: 'unlock-black-wolves', name: 'Unlock Black Wolves', description: `Unlock access to the ${FACTIONS['black-wolves'].name} specialization branch. ${FACTIONS['black-wolves'].philosophy}`, cost: 400, tier: 8, faction: 'black-wolves', prerequisites: ['9x18mm-round', 'shelter', 'crafting-speed-2', 'makarov-pm', 'harvester-drone', 'broth-mastery', 'combat-drone'], position: getRadialPosition(0, 900), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-hive', name: 'Unlock Hive', description: `Unlock access to the ${FACTIONS['hive'].name} specialization branch. ${FACTIONS['hive'].philosophy}`, cost: 400, tier: 8, faction: 'hive', prerequisites: ['9x18mm-round', 'shelter', 'crafting-speed-2', 'makarov-pm', 'harvester-drone', 'broth-mastery', 'combat-drone'], position: getRadialPosition(Math.PI / 3, 900), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-university', name: 'Unlock University', description: `Unlock access to the ${FACTIONS['university'].name} specialization branch. ${FACTIONS['university'].philosophy}`, cost: 400, tier: 8, faction: 'university', prerequisites: ['9x18mm-round', 'shelter', 'crafting-speed-2', 'makarov-pm', 'harvester-drone', 'broth-mastery', 'combat-drone'], position: getRadialPosition(2 * Math.PI / 3, 900), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-data-angels', name: 'Unlock DATA ANGELS', description: `Unlock access to the ${FACTIONS['data-angels'].name} specialization branch. ${FACTIONS['data-angels'].philosophy}`, cost: 400, tier: 8, faction: 'data-angels', prerequisites: ['9x18mm-round', 'shelter', 'crafting-speed-2', 'makarov-pm', 'harvester-drone', 'broth-mastery', 'combat-drone'], position: getRadialPosition(Math.PI, 900), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-battalion', name: 'Unlock Battalion', description: `Unlock access to the ${FACTIONS['battalion'].name} specialization branch. ${FACTIONS['battalion'].philosophy}`, cost: 400, tier: 8, faction: 'battalion', prerequisites: ['9x18mm-round', 'shelter', 'crafting-speed-2', 'makarov-pm', 'harvester-drone', 'broth-mastery', 'combat-drone'], position: getRadialPosition(4 * Math.PI / 3, 900), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-admiralty', name: 'Unlock Admiralty', description: `Unlock access to the ${FACTIONS['admiralty'].name} specialization branch. ${FACTIONS['admiralty'].philosophy}`, cost: 400, tier: 8, faction: 'admiralty', prerequisites: ['9x18mm-round', 'shelter', 'crafting-speed-2', 'makarov-pm', 'harvester-drone', 'broth-mastery', 'combat-drone'], position: getRadialPosition(5 * Math.PI / 3, 900), category: 'technology' as const, status: 'locked' as const },

  // ============================================
  // FACTION BRANCHES (400-2500 shards per node)
  // Long-term progression over weeks
  // ============================================

  // BLACK WOLVES - Berserker Path (Total: 5800 shards)
  ...(() => {
    const baseAngle = 0;
    const path = [
      { id: 'riot-vest', name: 'Riot Vest', description: 'Light assault armor with high mobility', cost: 400 },
      { id: 'shock-pike', name: 'Shock Pike', description: 'Electrified melee weapon, stuns targets', cost: 600 },
      { id: 'slab-shield', name: 'Slab Shield', description: 'Heavy riot shield, blocks projectiles', cost: 900 },
      { id: 'flash-hammer', name: 'Flash Hammer', description: 'Stun grenade launcher attachment', cost: 1400 },
      { id: 'adrenal-surge', name: 'Adrenal Surge', description: '5s sprint + 30% melee damage, 60s cooldown (Ultimate)', cost: 2500 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'black-wolves',
      prerequisites: i === 0 ? ['unlock-black-wolves'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // BLACK WOLVES - Assassin Path (Total: 5800 shards)
  ...(() => {
    const baseAngle = 0;
    const path = [
      { id: 'combat-stims', name: 'Combat Stims', description: 'Enhanced movement and reaction time (Passive +10% Speed)', cost: 400 },
      { id: 'suppressor-rig', name: 'Suppressor Rig', description: 'Stealth gear for silent takedowns', cost: 600 },
      { id: 'grav-boots', name: 'Grav Boots', description: 'Dodge rolls become jumps with extended range', cost: 900 },
      { id: 'field-interrogator', name: 'Field Interrogator', description: 'Portable information extraction station', cost: 1400 },
      { id: 'armor-durability', name: 'Armor Durability', description: 'All equipped armor lasts longer (Passive +25% Durability)', cost: 2500 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'black-wolves',
      prerequisites: i === 0 ? ['unlock-black-wolves'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // HIVE - Industrialist Path (Total: 5800 shards)
  ...(() => {
    const baseAngle = Math.PI / 3;
    const path = [
      { id: 'spore-grain-vat', name: 'Spore Grain Vat', description: 'Produces specialized bio-materials', cost: 400 },
      { id: 'slime-furnace', name: 'Slime Furnace', description: 'Process organic materials into fuel', cost: 600 },
      { id: 'chameleon-harness', name: 'Chameleon Harness', description: 'Adaptive camouflage system', cost: 900 },
      { id: 'mealworm-factory', name: 'Mealworm Factory', description: 'Compact bio-farm producing efficient protein', cost: 1400 },
      { id: 'crafting-speed-hive', name: 'Crafting Speed', description: 'All crafting operations faster (Passive +20% Speed)', cost: 2500 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'hive',
      prerequisites: i === 0 ? ['unlock-hive'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // HIVE - Toxicologist Path (Total: 5800 shards)
  ...(() => {
    const baseAngle = Math.PI / 3;
    const path = [
      { id: 'venom-knife', name: 'Venom Knife', description: 'Poison-coated blade, DoT damage', cost: 400 },
      { id: 'poison-resistance', name: 'Poison Resistance', description: 'Reduced toxin damage (Passive +15% Resistance)', cost: 600 },
      { id: 'acid-sprayer', name: 'Acid Sprayer', description: 'Chemical weapon that melts through armor', cost: 900 },
      { id: 'toxic-coating', name: 'Toxic Coating', description: 'Apply poison coating to any projectiles', cost: 1400 },
      { id: 'toxic-bloom', name: 'Toxic Bloom', description: 'AoE slowing mist for 8s, 60s cooldown (Ultimate)', cost: 2500 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'hive',
      prerequisites: i === 0 ? ['unlock-hive'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // UNIVERSITY - Engineer Path (Total: 5800 shards)
  ...(() => {
    const baseAngle = 2 * Math.PI / 3;
    const path = [
      { id: 'auto-turret', name: 'Auto-Turret', description: 'Automated defense system', cost: 400 },
      { id: 'scanner-drone', name: 'Scanner Drone', description: 'Autonomous resource detection', cost: 600 },
      { id: 'repair-swarm', name: 'Repair Swarm', description: 'Deployable structure maintenance bots', cost: 900 },
      { id: 'stabilizer-field', name: 'Stabilizer Field', description: 'Area protection from environmental damage', cost: 1400 },
      { id: 'fabricator-burst', name: 'Fabricator Burst', description: 'Complete next craft instantly, 60s cooldown (Ultimate)', cost: 2500 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'university',
      prerequisites: i === 0 ? ['unlock-university'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // UNIVERSITY - Scholar Path (Total: 5800 shards)
  ...(() => {
    const baseAngle = 2 * Math.PI / 3;
    const path = [
      { id: 'logic-furnace', name: 'Logic Furnace', description: 'AI-assisted material processing', cost: 400 },
      { id: 'bioprinter-table', name: 'Bioprinter Table', description: '3D print organic materials and food', cost: 600 },
      { id: 'geneforge-vat', name: 'GeneForge Vat', description: 'Advanced biological material synthesis', cost: 900 },
      { id: 'mining-yield-ii', name: 'Mining Yield II', description: 'Extract more resources (Passive +35% Yield)', cost: 1400 },
      { id: 'crafting-speed-uni', name: 'Crafting Speed', description: 'Enhanced manufacturing (Passive +25% Speed)', cost: 2500 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'university',
      prerequisites: i === 0 ? ['unlock-university'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // DATA ANGELS - Netrunner Path (Total: 5800 shards)
  ...(() => {
    const baseAngle = Math.PI;
    const path = [
      { id: 'jammer-tower', name: 'Jammer Tower', description: 'Disable electronic devices in area', cost: 400 },
      { id: 'ghost-uplink', name: 'Ghost Uplink', description: 'Remote access to electronic systems', cost: 600 },
      { id: 'neurochef-decryptor', name: 'Neurochef Decryptor', description: 'Crack advanced security systems', cost: 900 },
      { id: 'drone-hijack', name: 'Hijack Pulse', description: 'Take control of enemy drones and turrets', cost: 1400 },
      { id: 'hacking-speed', name: 'Hacking Speed', description: 'Faster infiltration (Passive +25% Speed)', cost: 2500 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'data-angels',
      prerequisites: i === 0 ? ['unlock-data-angels'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // DATA ANGELS - Phantom Path (Total: 5800 shards)
  ...(() => {
    const baseAngle = Math.PI;
    const path = [
      { id: 'backdoor-cloak', name: 'Backdoor Cloak', description: '5-second invisibility device', cost: 400 },
      { id: 'signal-scrubber', name: 'Signal Scrubber', description: 'Mobile electronic countermeasures', cost: 600 },
      { id: 'memory-leech', name: 'Memory Leech', description: 'Extract info from defeated enemies', cost: 900 },
      { id: 'movement-speed-da', name: 'Movement Speed', description: 'Enhanced mobility (Passive +18% Speed)', cost: 1400 },
      { id: 'overclock', name: 'Overclock', description: '10s invisibility to turrets & drones, 60s cooldown (Ultimate)', cost: 2500 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'data-angels',
      prerequisites: i === 0 ? ['unlock-data-angels'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // BATTALION - Colonel Path (Total: 5800 shards)
  ...(() => {
    const baseAngle = 4 * Math.PI / 3;
    const path = [
      { id: 'battalion-smg', name: 'Battalion SMG', description: 'Military-grade submachine gun', cost: 400 },
      { id: 'mortar-nest', name: 'Mortar Nest', description: 'Indirect fire support weapon', cost: 600 },
      { id: 'fragment-armor', name: 'Fragment Armor', description: 'Heavy armor with explosive resistance', cost: 900 },
      { id: 'ammo-press', name: 'Military Ammo Press', description: 'High-grade ammunition production', cost: 1400 },
      { id: 'ranged-damage', name: 'Ranged Damage', description: 'All projectiles deal more (Passive +25% Damage)', cost: 2500 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'battalion',
      prerequisites: i === 0 ? ['unlock-battalion'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // BATTALION - Tactician Path (Total: 5800 shards)
  ...(() => {
    const baseAngle = 4 * Math.PI / 3;
    const path = [
      { id: 'tactical-optics', name: 'Tactical Optics', description: 'Extended range and accuracy (Passive +25% Range)', cost: 400 },
      { id: 'supply-cache', name: 'Supply Cache', description: 'Deployable ammo and medical depot', cost: 600 },
      { id: 'field-ration-kit', name: 'Field Ration Kit', description: 'Efficient nutrition for operations', cost: 900 },
      { id: 'max-hp', name: 'Max HP', description: 'Enhanced conditioning (Passive +20% Health)', cost: 1400 },
      { id: 'rally-cry', name: 'Rally Cry', description: 'Allies gain +25% reload, -20% recoil for 20s, 60s cooldown (Ultimate)', cost: 2500 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'battalion',
      prerequisites: i === 0 ? ['unlock-battalion'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // ADMIRALTY - Captain Path (Total: 5800 shards)
  ...(() => {
    const baseAngle = 5 * Math.PI / 3;
    const path = [
      { id: 'tide-beacon', name: 'Tide Beacon', description: 'Maritime spawn point and navigation aid', cost: 400 },
      { id: 'storm-sail-raft', name: 'Storm Sail Raft', description: 'Fast water transportation', cost: 600 },
      { id: 'net-cannon', name: 'Net Cannon', description: 'Fishing and entanglement weapon', cost: 900 },
      { id: 'luminous-buoy', name: 'Luminous Buoy', description: 'Mini-lighthouse for navigation', cost: 1400 },
      { id: 'naval-command', name: 'Naval Command', description: 'Allied vessels gain speed, cold immunity (Passive)', cost: 2500 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'admiralty',
      prerequisites: i === 0 ? ['unlock-admiralty'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // ADMIRALTY - Storm Caller Path (Total: 5800 shards)
  ...(() => {
    const baseAngle = 5 * Math.PI / 3;
    const path = [
      { id: 'saltwater-desal', name: 'Saltwater Desal', description: 'Convert seawater to drinking water', cost: 400 },
      { id: 'weathercock-tower', name: 'Weathercock Tower', description: 'Force moderate rain in area, boost crop yield', cost: 600 },
      { id: 'weather-resistance', name: 'Weather Resistance', description: 'Reduced environmental damage (Passive +15%)', cost: 900 },
      { id: 'tide-gauge', name: 'Tide Gauge', description: 'Positive crop growth during any weather condition', cost: 1400 },
      { id: 'tempest-call', name: 'Tempest Call', description: 'Summon heavy storm, damages enemies and crops, 90s cooldown (Ultimate)', cost: 2500 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'admiralty',
      prerequisites: i === 0 ? ['unlock-admiralty'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 900 + (i * 120)),
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

// All faction unlock node IDs
const FACTION_UNLOCK_NODES = [
  'unlock-black-wolves',
  'unlock-hive',
  'unlock-university',
  'unlock-data-angels',
  'unlock-battalion',
  'unlock-admiralty'
];

export const isNodeAvailable = (nodeId: string, purchasedNodes: Set<string>): boolean => {
  const node = MEMORY_GRID_NODES.find(n => n.id === nodeId);
  if (!node) return false;
  
  if (nodeId.includes('unlock-')) {
    // First check: Has any tier 5 node been purchased?
    const tier5Nodes = ['9x18mm-round', 'shelter', 'crafting-speed-2', 'makarov-pm', 'harvester-drone', 'broth-mastery', 'combat-drone'];
    const hasTier5 = tier5Nodes.some((tier5Id: string) => purchasedNodes.has(tier5Id));
    
    if (!hasTier5) {
      return false; // No tier 5 node yet
    }
    
    // Second check: Has the player already unlocked a DIFFERENT faction?
    // If so, this faction unlock is NOT available (must reset first)
    for (const factionId of FACTION_UNLOCK_NODES) {
      if (purchasedNodes.has(factionId)) {
        // Player already has a faction unlocked - other factions are NOT available
        return false;
      }
    }
    
    return true; // Has tier 5 and no faction unlocked yet
  }
  
  return node.prerequisites.some((prereqId: string) => purchasedNodes.has(prereqId));
};

// Map of item names to their required Memory Grid node IDs
// Items NOT in this map are ALWAYS CRAFTABLE
export const ITEM_TO_NODE_MAP: Record<string, string> = {
  // Tier 1 items
  'Metal Hatchet': 'metal-hatchet',
  'Metal Pickaxe': 'metal-pickaxe',
  'Crossbow': 'crossbow',
  'Stone Spear': 'stone-spear',
  'Reed Harpoon': 'reed-harpoon',
  'Lantern': 'lantern',
  
  // Tier 2 items
  'Bone Arrow': 'bone-arrow',
  'Fire Arrow': 'fire-arrow',
  'Bush Knife': 'bush-knife',
  'Flashlight': 'flashlight',
  'Reed Bellows': 'reed-bellows',
  'Bone Gaff Hook': 'bone-gaff-hook',
  
  // Tier 3 items
  'Hollow Reed Arrow': 'hollow-reed-arrow',
  'Primitive Reed Snorkel': 'reed-snorkel',
  'Primitive Reed Fishing Rod': 'reed-fishing-rod',
  'Reed Rain Collector': 'reed-rain-collector',
  'Large Wooden Storage Box': 'large-wooden-storage-box',
  
  // Tier 4 items
  'Metal Door': 'metal-door',
  'Shelter': 'shelter',
  '9x18mm Round': '9x18mm-round',
  'Refrigerator': 'refrigerator',
  
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
