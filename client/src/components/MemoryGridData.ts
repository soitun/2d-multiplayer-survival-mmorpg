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
    unlockCost: 1600,
    totalCost: 24800 // 1600 unlock + 23200 branch (1600+2400+3600+5600+10000)
  },
  'hive': {
    id: 'hive',
    name: 'Hive',
    description: 'Chem-Industrial Branch',
    color: '#f59e0b',
    philosophy: 'Evolution through chemical mastery',
    unlockCost: 1600,
    totalCost: 24800
  },
  'university': {
    id: 'university',
    name: 'University',
    description: 'Robotics & Fabrication Branch',
    color: '#3b82f6',
    philosophy: 'Knowledge is the ultimate weapon',
    unlockCost: 1600,
    totalCost: 24800
  },
  'data-angels': {
    id: 'data-angels',
    name: 'DATA ANGELS',
    description: 'Cyber & Stealth Branch',
    color: '#8b5cf6',
    philosophy: 'Information warfare in the digital age',
    unlockCost: 1600,
    totalCost: 24800
  },
  'battalion': {
    id: 'battalion',
    name: 'Battalion',
    description: 'Conventional Military Branch',
    color: '#22c55e',
    philosophy: 'Disciplined force multipliers',
    unlockCost: 1600,
    totalCost: 24800
  },
  'admiralty': {
    id: 'admiralty',
    name: 'Admiralty',
    description: 'Weather & Coastal Mastery Branch',
    color: '#06b6d4',
    philosophy: 'Masters of sea and storm',
    unlockCost: 1600,
    totalCost: 24800
  }
};

const getRadialPosition = (angle: number, radius: number): { x: number; y: number } => ({
  x: Math.cos(angle) * radius,
  y: Math.sin(angle) * radius
});

// Branch angle constants for clean radial layout
const BRANCH_ANGLES = {
  BRANCH_1: 0,                    // 0° - Ranged Combat
  BRANCH_2: Math.PI / 3,          // 60° - Building
  BRANCH_3: 2 * Math.PI / 3,      // 120° - Water (splits)
  BRANCH_4: Math.PI,              // 180° - Food (splits)
  BRANCH_5: 4 * Math.PI / 3,      // 240° - Crafting (splits)
  BRANCH_6: 5 * Math.PI / 3,      // 300° - Melee
};

// Split offset for sub-branches - INCREASED for better visual separation
// 0.25 radians ≈ 14.3° - provides clean spacing between split paths
const SPLIT_OFFSET = 0.25;

// Melee branch - Single linear path (Stone Spear → Stone Mace → Battle Axe → War Hammer)
// No offset needed - all nodes along BRANCH_6 at 300°
const MELEE_PATH_OFFSET = 0;  // Unused - kept for compatibility
const MELEE_BRANCH_OFFSET = 0;  // Unused - kept for compatibility

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
      nodeId.includes('flashlight') || nodeId.includes('headlamp') || nodeId.includes('bellows') || nodeId.includes('snorkel') ||
      nodeId.includes('fishing') || nodeId.includes('bottle')) {
    return 'tool';
  }
  
  // Crafting/Structures
  if (nodeId.includes('door') || nodeId.includes('shelter') || nodeId.includes('cauldron') ||
      nodeId.includes('furnace') || nodeId.includes('barbecue') || nodeId.includes('collector') || nodeId.includes('vat') ||
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
  // TIER 1 - Basic Improvements (60-100 shards)
  // Day 1-3 - 6 branches at 60° intervals
  // Radius: 120
  // ============================================
  { 
    id: 'crossbow', 
    name: 'Crossbow', 
    description: 'Unlocks crafting the Crossbow - a mechanical crossbow with superior accuracy and power. Longer range than the bow.', 
    cost: 100, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_1, 120), // 0° - BRANCH 1: Ranged Combat (linear)
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
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_2, 120), // 60° - BRANCH 2: Building (linear)
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Metal Hatchet']
  },
  { 
    id: 'reed-harpoon', 
    name: 'Reed Harpoon', 
    description: 'Unlocks crafting the Reed Harpoon - a fragile harpoon made from reeds and bone fragments. Light and buoyant, good for water combat.', 
    cost: 75, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_3, 120), // 120° - BRANCH 3: Water (splits at T2)
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Reed Harpoon']
  },
  { 
    id: 'lantern', 
    name: 'Lantern', 
    description: 'Unlocks crafting Lanterns - deployable light sources that burn longer than torches.', 
    cost: 80, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_4, 120), // 180° - BRANCH 4: Food (splits at T2)
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Lantern']
  },
  { 
    id: 'metal-pickaxe', 
    name: 'Metal Pickaxe', 
    description: 'Unlocks crafting the Metal Pickaxe - gathers significantly more stone than stone tools.', 
    cost: 60, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_5, 120), // 240° - BRANCH 5: Crafting (splits at T2)
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Metal Pickaxe']
  },
  // ============================================
  // MELEE BRANCH (300°) - Single Linear Path
  // Stone Spear → Stone Mace → Battle Axe → War Hammer
  // ============================================
  { 
    id: 'stone-spear', 
    name: 'Stone Spear', 
    description: 'Unlocks crafting the Stone Spear - a basic spear tipped with sharpened stone. Has longer reach and causes bleeding.', 
    cost: 80, 
    tier: 1, 
    prerequisites: ['center'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_6, 120), // MELEE T1
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Stone Spear']
  },
  { 
    id: 'stone-mace', 
    name: 'Stone Mace', 
    description: 'Unlocks crafting the Stone Mace - a heavy stone lashed to a wooden handle. Slow but hits hard. Excellent for crushing. Can stun enemies!', 
    cost: 200, 
    tier: 2, 
    prerequisites: ['stone-spear'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_6, 220), // MELEE T2
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Stone Mace']
  },
  { 
    id: 'battle-axe', 
    name: 'Battle Axe', 
    description: 'Unlocks crafting the Battle Axe - a brutal double-headed axe. Massive cleaving strikes with strong bleeding.', 
    cost: 500, 
    tier: 3, 
    prerequisites: ['stone-mace'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_6, 320), // MELEE T3
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Battle Axe']
  },
  { 
    id: 'war-hammer', 
    name: 'War Hammer', 
    description: 'Unlocks crafting the War Hammer - a devastating heavy blunt weapon. Slow but terrifying crushing power. Highest stun chance!', 
    cost: 1000, 
    tier: 4, 
    prerequisites: ['battle-axe'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_6, 420), // MELEE T4
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['War Hammer']
  },
  // OTHER MELEE WEAPONS - Relocated to appropriate branches
  // Bone Shiv & Metal Dagger → Ranged/Hunting branch (stealth theme)
  // Scythe → Crafting branch (farming tool)
  // Kayak Paddle → Water branch (navigation)

  // ============================================
  // TIER 2 - Specialization (200-280 shards)
  // Day 3-7 - SPLIT POINTS for branches 3, 4, 5
  // Radius: 220
  // ============================================
  { 
    id: 'bone-arrow', 
    name: 'Bone Arrow', 
    description: 'Unlocks crafting Bone Arrows - larger arrowhead with higher damage.', 
    cost: 200, 
    tier: 2, 
    prerequisites: ['crossbow'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_1 - SPLIT_OFFSET, 220), // Upper ranged path
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Bone Arrow']
  },
  { 
    id: 'bone-shiv', 
    name: 'Bone Shiv', 
    description: 'Unlocks crafting the Bone Shiv - a sharpened bone fragment. Lightning fast strikes with vicious bleeding. Perfect for ambushes.', 
    cost: 180, 
    tier: 2, 
    prerequisites: ['crossbow'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_1 + SPLIT_OFFSET, 220), // Lower hunting/stealth path
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Bone Shiv']
  },
  { 
    id: 'bush-knife', 
    name: 'Bush Knife', 
    description: 'Unlocks crafting the Bush Knife - a heavy-duty clearing blade for woodcutting and combat.', 
    cost: 220, 
    tier: 2, 
    prerequisites: ['metal-hatchet'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_2, 220), // Branch 2: linear
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Bush Knife']
  },
  { 
    id: 'reed-harpoon-gun', 
    name: 'Reed Harpoon Gun', 
    description: 'Unlocks crafting the Reed Harpoon Gun - a pneumatic underwater ranged weapon. Works both above and below water. Requires Reed Harpoon Darts as ammunition.', 
    cost: 300, 
    tier: 2, 
    prerequisites: ['reed-harpoon'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_3 - SPLIT_OFFSET, 220), // Branch 3: Upper water combat path
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Reed Harpoon Gun']
  },
  { 
    id: 'reed-harpoon-dart', 
    name: 'Reed Harpoon Dart', 
    description: 'Unlocks crafting Reed Harpoon Darts - specialized ammunition for the Reed Harpoon Gun. The bone tip is weighted for stability underwater.',
    cost: 200, 
    tier: 2, 
    prerequisites: ['reed-harpoon-gun'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_3 - SPLIT_OFFSET * 2.5, 320), // Branch 3: Continues from gun, moved right to avoid overlap
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Reed Harpoon Dart']
  },
  { 
    id: 'reed-snorkel', 
    name: 'Reed Diver\'s Helm',
    description: 'Unlocks crafting the Reed Diver\'s Helm - allows limited underwater exploration.',
    cost: 260, 
    tier: 2, 
    prerequisites: ['reed-harpoon'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_3 + SPLIT_OFFSET, 220), // Branch 3: Lower utility path (SPLIT POINT)
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Reed Diver\'s Helm']
  },
  { 
    id: 'flashlight', 
    name: 'Flashlight', 
    description: 'Unlocks crafting Flashlights - bright, focused electric illumination.', 
    cost: 220, 
    tier: 2, 
    prerequisites: ['lantern'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_4 - SPLIT_OFFSET, 220), // Branch 4: Upper split (electric)
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Flashlight']
  },
  { 
    id: 'headlamp', 
    name: 'Headlamp', 
    description: 'Unlocks crafting the Headlamp - a tallow-burning head-mounted light source. Hands-free illumination and warmth.', 
    cost: 300, 
    tier: 2, 
    prerequisites: ['lantern'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_4 + SPLIT_OFFSET, 220), // Branch 4: Lower split (tallow)
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Headlamp']
  },
  { 
    id: 'reed-bellows', 
    name: 'Reed Bellows', 
    description: 'Unlocks crafting Reed Bellows - fuel burns 50% slower, cooking/smelting 20% faster.',
    cost: 280, 
    tier: 2, 
    prerequisites: ['metal-pickaxe'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_5, 220), // Branch 5: SPLIT POINT
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Reed Bellows']
  },

  // ============================================
  // TIER 3 - Advanced Gear (480-720 shards)
  // Day 7-14 - SPLITS happen here
  // Radius: 320
  // ============================================
  // Branch 1 UPPER - Ranged arrows path
  { 
    id: 'fire-arrow', 
    name: 'Fire Arrow', 
    description: 'Unlocks crafting Fire Arrows - ignites on impact, causing burn damage over time.', 
    cost: 480, 
    tier: 3, 
    prerequisites: ['bone-arrow'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_1 - SPLIT_OFFSET, 320),
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Fire Arrow']
  },
  // Branch 1 LOWER - Stealth/hunting path
  { 
    id: 'metal-dagger', 
    name: 'Metal Dagger', 
    description: 'Unlocks crafting the Metal Dagger - the fastest craftable weapon. Razor-sharp with vicious bleeding. The assassin\'s choice.', 
    cost: 400, 
    tier: 3, 
    prerequisites: ['bone-shiv'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_1 + SPLIT_OFFSET, 320),
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Metal Dagger']
  },
  // Branch 2 (linear)
  { 
    id: 'large-wooden-storage-box', 
    name: 'Large Wooden Storage Box', 
    description: 'Unlocks crafting Large Wooden Storage Boxes - large containers for storing many items. Holds 48 stacks.', 
    cost: 600, 
    tier: 3, 
    prerequisites: ['bush-knife'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_2, 320),
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Large Wooden Storage Box']
  },
  // Branch 3 UPPER (Diving path)
  { 
    id: 'diving-pick', 
    name: 'Diving Pick', 
    description: 'Unlocks crafting the Diving Pick - a specialized underwater tool required to harvest living coral. Yields Limestone, Coral Fragments, and rare Pearls.', 
    cost: 520, 
    tier: 3, 
    prerequisites: ['reed-snorkel'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_3 - SPLIT_OFFSET, 320),
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Diving Pick']
  },
  // Branch 3 CENTER (Water navigation)
  { 
    id: 'kayak-paddle', 
    name: 'Kayak Paddle', 
    description: 'Unlocks crafting the Kayak Paddle - a sturdy double-bladed paddle for water navigation. Can also be used as an improvised weapon.', 
    cost: 480, 
    tier: 3, 
    prerequisites: ['reed-snorkel'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_3, 320),
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Kayak Paddle']
  },
  // Branch 3 LOWER (Water Collection path)
  { 
    id: 'reed-rain-collector', 
    name: 'Reed Rain Collector', 
    description: 'Unlocks crafting Reed Rain Collectors - automatically gather fresh water during storms (40L).', 
    cost: 560, 
    tier: 3, 
    prerequisites: ['reed-snorkel'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_3 + SPLIT_OFFSET, 320),
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Reed Rain Collector']
  },
  // Branch 4 UPPER (Cooking path @ 172°)
  { 
    id: 'barbecue', 
    name: 'Barbecue', 
    description: 'Unlocks crafting Barbecues - a large cooking appliance with 12 slots for cooking food.', 
    cost: 600, 
    tier: 3, 
    prerequisites: ['flashlight'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_4 - SPLIT_OFFSET, 320), // Upper path
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Barbecue']
  },
  // Branch 4 LOWER (Food Storage path @ 188°)
  { 
    id: 'refrigerator', 
    name: 'Pantry', 
    description: 'Unlocks crafting Pantries - sealed larders that preserve food from spoiling. Holds 30 stacks.', 
    cost: 680, 
    tier: 3, 
    prerequisites: ['flashlight'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_4 + SPLIT_OFFSET, 320), // Lower path
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Pantry']
  },
  // Branch 5 CENTER (Farming tools)
  { 
    id: 'scythe', 
    name: 'Scythe', 
    description: 'Unlocks crafting the Scythe - a curved blade that hits ALL targets in a wide arc. Excellent for clearing grass and crowd control.', 
    cost: 500, 
    tier: 3, 
    prerequisites: ['reed-bellows'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_5, 320),
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Scythe']
  },
  // Branch 5 LOWER (Maintenance path)
  { 
    id: 'repair-bench', 
    name: 'Repair Bench', 
    description: 'Unlocks crafting the Repair Bench - a specialized workbench for repairing damaged tools, weapons, and armor.', 
    cost: 560, 
    tier: 3, 
    prerequisites: ['reed-bellows'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_5 + SPLIT_OFFSET, 320),
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Repair Bench']
  },
  // Branch 5 LOWER-LOWER (Demolition path) - Raiding explosives
  { 
    id: 'babushka-surprise', 
    name: 'Babushka\'s Surprise', 
    description: 'Unlocks crafting Babushka\'s Surprise - a volatile improvised explosive wrapped in old cloth. Unreliable 5-30s fuse with 20% dud chance, but effective for raiding wooden structures.', 
    cost: 1200, 
    tier: 4, 
    prerequisites: ['repair-bench'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_5 + SPLIT_OFFSET, 420),
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Babushka\'s Surprise']
  },

  // ============================================
  // TIER 4 - Late Early-Game (1000-1600 shards)
  // Day 14-21 - Split paths continue outward
  // Radius: 420
  // ============================================
  // Branch 1 (linear)
  { 
    id: 'hollow-reed-arrow', 
    name: 'Hollow Reed Arrow', 
    description: 'Unlocks crafting Hollow Reed Arrows - lightweight, flies faster but deals less damage.', 
    cost: 1200, 
    tier: 4, 
    prerequisites: ['fire-arrow'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_1, 420),
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Hollow Reed Arrow']
  },
  // Branch 2 (linear)
  { 
    id: 'metal-door', 
    name: 'Metal Door', 
    description: 'Unlocks crafting Metal Doors - reinforced security for your most valuable areas.', 
    cost: 1280, 
    tier: 4, 
    prerequisites: ['large-wooden-storage-box'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_2, 420),
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Metal Door']
  },
  // Branch 3 CENTER (Water Mobility path)
  { 
    id: 'reed-flippers', 
    name: 'Reed Flippers',
    description: 'Unlocks crafting Reed Flippers - woven flippers that double your swimming speed. Essential for underwater exploration.',
    cost: 1000, 
    tier: 4, 
    prerequisites: ['kayak-paddle'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_3, 420), // Center path
    category: 'armor' as const, 
    status: 'locked' as const,
    unlocksItems: ['Reed Flippers']
  },
  // Branch 3 LOWER (Water Collection)
  { 
    id: 'plastic-water-jug', 
    name: 'Plastic Water Jug', 
    description: 'Unlocks crafting Plastic Water Jugs - large 5L water containers with better hydration efficiency than reed bottles.', 
    cost: 1200, 
    tier: 4, 
    prerequisites: ['reed-rain-collector'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_3 + SPLIT_OFFSET, 420), // Lower path
    category: 'tool' as const, 
    status: 'locked' as const,
    unlocksItems: ['Plastic Water Jug']
  },
  // Branch 4 UPPER (Cooking)
  { 
    id: 'cooking-station', 
    name: 'Cooking Station', 
    description: 'Unlocks crafting the Cooking Station - a kitchen station for preparing advanced gourmet recipes.', 
    cost: 1400, 
    tier: 4, 
    prerequisites: ['barbecue'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_4 - SPLIT_OFFSET, 420), // Upper path
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Cooking Station']
  },
  // Branch 4 LOWER (Food Storage)
  { 
    id: 'compost', 
    name: 'Compost', 
    description: 'Unlocks crafting Compost containers - converts organic materials into fertilizer over time.', 
    cost: 1200, 
    tier: 4, 
    prerequisites: ['refrigerator'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_4 + SPLIT_OFFSET, 420), // Lower path
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Compost']
  },
  // Branch 4 LOWER (Food Storage / Farming) - capstone
  { 
    id: 'scarecrow', 
    name: 'Scarecrow', 
    description: 'Unlocks crafting Scarecrows - deters crows from nearby crops, protecting your harvest.', 
    cost: 2400, 
    tier: 5, 
    prerequisites: ['compost'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_4 + SPLIT_OFFSET, 520), // Lower path capstone
    category: 'crafting' as const, 
    status: 'locked' as const,
    unlocksItems: ['Scarecrow']
  },
  // Branch 5 LOWER-LOWER (Demolition path) - Tier 2 explosive
  { 
    id: 'matriarch-wrath', 
    name: 'Matriarch\'s Wrath', 
    description: 'Unlocks crafting Matriarch\'s Wrath - a sophisticated demolition device that tears through even the strongest fortifications. Reliable 10s fuse, massive damage.', 
    cost: 2400, 
    tier: 5, 
    prerequisites: ['babushka-surprise'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_5 + SPLIT_OFFSET, 520),
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Matriarch\'s Wrath']
  },

  // ============================================
  // TIER 5 - Mid-Late Game (2400-3000 shards)
  // Day 21-35 - Major milestones
  // Radius: 520
  // ============================================
  // Branch 1 (linear)
  { 
    id: '9x18mm-round', 
    name: '9x18mm Ammunition', 
    description: 'Unlocks crafting 9x18mm Rounds - ammunition for the Makarov PM pistol.', 
    cost: 2400, 
    tier: 5, 
    prerequisites: ['hollow-reed-arrow'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_1, 520),
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['9x18mm Round']
  },
  // NOTE: Shelter removed from Memory Grid - now always craftable as a starter base

  // ============================================
  // TIER 6 - Late Game (3200 shards)
  // Day 35-45 - Final upgrades before factions
  // Radius: 620
  // ============================================
  { 
    id: 'makarov-pm', 
    name: 'Makarov PM', 
    description: 'Unlocks crafting the Makarov PM - a reliable Soviet-era semi-automatic pistol. Longest range, fastest fire rate.', 
    cost: 3200, 
    tier: 6, 
    prerequisites: ['9x18mm-round'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_1, 620),
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['Makarov PM']
  },
  
  // ============================================
  // TIER 7 - Endgame (4000+ shards)
  // Ultimate weapons
  // Radius: 720
  // ============================================
  { 
    id: 'pp91-kedr', 
    name: 'PP-91 KEDR', 
    description: 'Unlocks crafting the PP-91 KEDR - a devastating Soviet submachine gun with 30-round magazine and extreme fire rate.', 
    cost: 4000, 
    tier: 7, 
    prerequisites: ['makarov-pm'], 
    position: getRadialPosition(BRANCH_ANGLES.BRANCH_1, 720),
    category: 'weapon' as const, 
    status: 'locked' as const,
    unlocksItems: ['PP-91 KEDR']
  },

  // ============================================
  // FACTION UNLOCK NODES (1600 shards each)
  // Major milestone - requires 8000 total shards spent
  // Player commits to ONE faction (reset costs 5000 shards)
  // Radius: 900 (increased spacing from core nodes)
  // ============================================
  { id: 'unlock-black-wolves', name: 'Unlock Black Wolves', description: `Unlock access to the ${FACTIONS['black-wolves'].name} specialization branch. ${FACTIONS['black-wolves'].philosophy}`, cost: 1600, tier: 8, faction: 'black-wolves', prerequisites: [], position: getRadialPosition(0, 900), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-hive', name: 'Unlock Hive', description: `Unlock access to the ${FACTIONS['hive'].name} specialization branch. ${FACTIONS['hive'].philosophy}`, cost: 1600, tier: 8, faction: 'hive', prerequisites: [], position: getRadialPosition(Math.PI / 3, 900), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-university', name: 'Unlock University', description: `Unlock access to the ${FACTIONS['university'].name} specialization branch. ${FACTIONS['university'].philosophy}`, cost: 1600, tier: 8, faction: 'university', prerequisites: [], position: getRadialPosition(2 * Math.PI / 3, 900), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-data-angels', name: 'Unlock DATA ANGELS', description: `Unlock access to the ${FACTIONS['data-angels'].name} specialization branch. ${FACTIONS['data-angels'].philosophy}`, cost: 1600, tier: 8, faction: 'data-angels', prerequisites: [], position: getRadialPosition(Math.PI, 900), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-battalion', name: 'Unlock Battalion', description: `Unlock access to the ${FACTIONS['battalion'].name} specialization branch. ${FACTIONS['battalion'].philosophy}`, cost: 1600, tier: 8, faction: 'battalion', prerequisites: [], position: getRadialPosition(4 * Math.PI / 3, 900), category: 'technology' as const, status: 'locked' as const },
  { id: 'unlock-admiralty', name: 'Unlock Admiralty', description: `Unlock access to the ${FACTIONS['admiralty'].name} specialization branch. ${FACTIONS['admiralty'].philosophy}`, cost: 1600, tier: 8, faction: 'admiralty', prerequisites: [], position: getRadialPosition(5 * Math.PI / 3, 900), category: 'technology' as const, status: 'locked' as const },

  // ============================================
  // FACTION BRANCHES (1600-10000 shards per node)
  // Long-term progression over many weeks
  // ============================================

  // BLACK WOLVES - Berserker Path (Total: 23200 shards)
  ...(() => {
    const baseAngle = 0;
    const path = [
      { id: 'riot-vest', name: 'Riot Vest', description: 'Light assault armor with high mobility', cost: 1600 },
      { id: 'shock-pike', name: 'Shock Pike', description: 'Electrified melee weapon, stuns targets', cost: 2400 },
      { id: 'slab-shield', name: 'Slab Shield', description: 'Heavy riot shield, blocks projectiles', cost: 3600 },
      { id: 'flash-hammer', name: 'Flash Hammer', description: 'Stun grenade launcher attachment', cost: 5600 },
      { id: 'adrenal-surge', name: 'Adrenal Surge', description: '5s sprint + 30% melee damage, 60s cooldown (Ultimate)', cost: 10000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'black-wolves',
      prerequisites: i === 0 ? ['unlock-black-wolves'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // BLACK WOLVES - Assassin Path (Total: 23200 shards)
  ...(() => {
    const baseAngle = 0;
    const path = [
      { id: 'combat-stims', name: 'Combat Stims', description: 'Enhanced movement and reaction time (Passive +10% Speed)', cost: 1600 },
      { id: 'suppressor-rig', name: 'Suppressor Rig', description: 'Stealth gear for silent takedowns', cost: 2400 },
      { id: 'grav-boots', name: 'Grav Boots', description: 'Dodge rolls become jumps with extended range', cost: 3600 },
      { id: 'field-interrogator', name: 'Field Interrogator', description: 'Portable information extraction station', cost: 5600 },
      { id: 'armor-durability', name: 'Armor Durability', description: 'All equipped armor lasts longer (Passive +25% Durability)', cost: 10000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'black-wolves',
      prerequisites: i === 0 ? ['unlock-black-wolves'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // HIVE - Industrialist Path (Total: 23200 shards)
  ...(() => {
    const baseAngle = Math.PI / 3;
    const path = [
      { id: 'spore-grain-vat', name: 'Spore Grain Vat', description: 'Produces specialized bio-materials', cost: 1600 },
      { id: 'slime-furnace', name: 'Slime Furnace', description: 'Process organic materials into fuel', cost: 2400 },
      { id: 'chameleon-harness', name: 'Chameleon Harness', description: 'Adaptive camouflage system', cost: 3600 },
      { id: 'mealworm-factory', name: 'Mealworm Factory', description: 'Compact bio-farm producing efficient protein', cost: 5600 },
      { id: 'crafting-speed-hive', name: 'Crafting Speed', description: 'All crafting operations faster (Passive +20% Speed)', cost: 10000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'hive',
      prerequisites: i === 0 ? ['unlock-hive'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // HIVE - Toxicologist Path (Total: 23200 shards)
  ...(() => {
    const baseAngle = Math.PI / 3;
    const path = [
      { id: 'venom-knife', name: 'Venom Knife', description: 'Poison-coated blade, DoT damage', cost: 1600 },
      { id: 'poison-resistance', name: 'Poison Resistance', description: 'Reduced toxin damage (Passive +15% Resistance)', cost: 2400 },
      { id: 'acid-sprayer', name: 'Acid Sprayer', description: 'Chemical weapon that melts through armor', cost: 3600 },
      { id: 'toxic-coating', name: 'Toxic Coating', description: 'Apply poison coating to any projectiles', cost: 5600 },
      { id: 'toxic-bloom', name: 'Toxic Bloom', description: 'AoE slowing mist for 8s, 60s cooldown (Ultimate)', cost: 10000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'hive',
      prerequisites: i === 0 ? ['unlock-hive'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // UNIVERSITY - Engineer Path (Total: 23200 shards)
  ...(() => {
    const baseAngle = 2 * Math.PI / 3;
    const path = [
      { id: 'auto-turret', name: 'Auto-Turret', description: 'Automated defense system', cost: 1600 },
      { id: 'scanner-drone', name: 'Scanner Drone', description: 'Autonomous resource detection', cost: 2400 },
      { id: 'repair-swarm', name: 'Repair Swarm', description: 'Deployable structure maintenance bots', cost: 3600 },
      { id: 'stabilizer-field', name: 'Stabilizer Field', description: 'Area protection from environmental damage', cost: 5600 },
      { id: 'fabricator-burst', name: 'Fabricator Burst', description: 'Complete next craft instantly, 60s cooldown (Ultimate)', cost: 10000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'university',
      prerequisites: i === 0 ? ['unlock-university'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // UNIVERSITY - Scholar Path (Total: 23200 shards)
  ...(() => {
    const baseAngle = 2 * Math.PI / 3;
    const path = [
      { id: 'logic-furnace', name: 'Logic Furnace', description: 'AI-assisted material processing', cost: 1600 },
      { id: 'bioprinter-table', name: 'Bioprinter Table', description: '3D print organic materials and food', cost: 2400 },
      { id: 'geneforge-vat', name: 'GeneForge Vat', description: 'Advanced biological material synthesis', cost: 3600 },
      { id: 'mining-efficiency-ii', name: 'Mining Efficiency II', description: 'Extract more resources (Passive +35% Yield)', cost: 5600 },
      { id: 'crafting-speed-uni', name: 'Crafting Speed', description: 'Enhanced manufacturing (Passive +25% Speed)', cost: 10000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'university',
      prerequisites: i === 0 ? ['unlock-university'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // DATA ANGELS - Netrunner Path (Total: 23200 shards)
  ...(() => {
    const baseAngle = Math.PI;
    const path = [
      { id: 'jammer-tower', name: 'Jammer Tower', description: 'Disable electronic devices in area', cost: 1600 },
      { id: 'ghost-uplink', name: 'Ghost Uplink', description: 'Remote access to electronic systems', cost: 2400 },
      { id: 'neurochef-decryptor', name: 'Neurochef Decryptor', description: 'Crack advanced security systems', cost: 3600 },
      { id: 'drone-hijack', name: 'Hijack Pulse', description: 'Take control of enemy drones and turrets', cost: 5600 },
      { id: 'hacking-speed', name: 'Hacking Speed', description: 'Faster infiltration (Passive +25% Speed)', cost: 10000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'data-angels',
      prerequisites: i === 0 ? ['unlock-data-angels'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // DATA ANGELS - Phantom Path (Total: 23200 shards)
  ...(() => {
    const baseAngle = Math.PI;
    const path = [
      { id: 'backdoor-cloak', name: 'Backdoor Cloak', description: '5-second invisibility device', cost: 1600 },
      { id: 'signal-scrubber', name: 'Signal Scrubber', description: 'Mobile electronic countermeasures', cost: 2400 },
      { id: 'memory-leech', name: 'Memory Leech', description: 'Extract info from defeated enemies', cost: 3600 },
      { id: 'movement-speed-da', name: 'Movement Speed', description: 'Enhanced mobility (Passive +18% Speed)', cost: 5600 },
      { id: 'overclock', name: 'Overclock', description: '10s invisibility to turrets & drones, 60s cooldown (Ultimate)', cost: 10000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'data-angels',
      prerequisites: i === 0 ? ['unlock-data-angels'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // BATTALION - Colonel Path (Total: 23200 shards)
  ...(() => {
    const baseAngle = 4 * Math.PI / 3;
    const path = [
      { id: 'battalion-smg', name: 'Battalion SMG', description: 'Military-grade submachine gun', cost: 1600 },
      { id: 'mortar-nest', name: 'Mortar Nest', description: 'Indirect fire support weapon', cost: 2400 },
      { id: 'fragment-armor', name: 'Fragment Armor', description: 'Heavy armor with explosive resistance', cost: 3600 },
      { id: 'ammo-press', name: 'Military Ammo Press', description: 'High-grade ammunition production', cost: 5600 },
      { id: 'ranged-damage', name: 'Ranged Damage', description: 'All projectiles deal more (Passive +25% Damage)', cost: 10000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'battalion',
      prerequisites: i === 0 ? ['unlock-battalion'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // BATTALION - Tactician Path (Total: 23200 shards)
  ...(() => {
    const baseAngle = 4 * Math.PI / 3;
    const path = [
      { id: 'tactical-optics', name: 'Tactical Optics', description: 'Extended range and accuracy (Passive +25% Range)', cost: 1600 },
      { id: 'supply-cache', name: 'Supply Cache', description: 'Deployable ammo and medical depot', cost: 2400 },
      { id: 'field-ration-kit', name: 'Field Ration Kit', description: 'Efficient nutrition for operations', cost: 3600 },
      { id: 'max-hp', name: 'Max HP', description: 'Enhanced conditioning (Passive +20% Health)', cost: 5600 },
      { id: 'rally-cry', name: 'Rally Cry', description: 'Allies gain +25% reload, -20% recoil for 20s, 60s cooldown (Ultimate)', cost: 10000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'battalion',
      prerequisites: i === 0 ? ['unlock-battalion'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle + 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // ADMIRALTY - Captain Path (Total: 23200 shards)
  ...(() => {
    const baseAngle = 5 * Math.PI / 3;
    const path = [
      { id: 'tide-beacon', name: 'Tide Beacon', description: 'Maritime spawn point and navigation aid', cost: 1600 },
      { id: 'storm-sail-raft', name: 'Storm Sail Raft', description: 'Fast water transportation', cost: 2400 },
      { id: 'net-cannon', name: 'Net Cannon', description: 'Fishing and entanglement weapon', cost: 3600 },
      { id: 'luminous-buoy', name: 'Luminous Buoy', description: 'Mini-lighthouse for navigation', cost: 5600 },
      { id: 'naval-command', name: 'Naval Command', description: 'Allied vessels gain speed, cold immunity (Passive)', cost: 10000 }
    ];
    return path.map((node, i) => ({
      id: node.id, name: node.name, description: node.description, cost: node.cost,
      tier: 7 + i, faction: 'admiralty',
      prerequisites: i === 0 ? ['unlock-admiralty'] : [path[i - 1].id],
      position: getRadialPosition(baseAngle - 0.3, 900 + (i * 120)),
      category: getCategoryFromId(node.id), status: 'locked' as const
    }));
  })(),

  // ADMIRALTY - Storm Caller Path (Total: 23200 shards)
  ...(() => {
    const baseAngle = 5 * Math.PI / 3;
    const path = [
      { id: 'saltwater-desal', name: 'Saltwater Desal', description: 'Convert seawater to drinking water', cost: 1600 },
      { id: 'weathercock-tower', name: 'Weathercock Tower', description: 'Force moderate rain in area, boost crop yield', cost: 2400 },
      { id: 'weather-resistance', name: 'Weather Resistance', description: 'Reduced environmental damage (Passive +15%)', cost: 3600 },
      { id: 'tide-gauge', name: 'Tide Gauge', description: 'Positive crop growth during any weather condition', cost: 5600 },
      { id: 'tempest-call', name: 'Tempest Call', description: 'Summon heavy storm, damages enemies and crops, 90s cooldown (Ultimate)', cost: 10000 }
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

export const isNodeAvailable = (nodeId: string, purchasedNodes: Set<string>, totalShardsSpent: number = 0): boolean => {
  const node = MEMORY_GRID_NODES.find(n => n.id === nodeId);
  if (!node) return false;
  
  if (nodeId.includes('unlock-')) {
    // TEMPORARILY DISABLED FOR v1.0 - Coming soon after early access ends
    // TODO: Uncomment this code when enabling faction unlocks
    /*
    // First check: Has the player already unlocked a DIFFERENT faction?
    // If so, this faction unlock is NOT available (must reset first)
    for (const factionId of FACTION_UNLOCK_NODES) {
      if (purchasedNodes.has(factionId)) {
        // Player already has a faction unlocked - other factions are NOT available
        return false;
      }
    }
    
    // Second check: Requires spending 8000 total shards on core grid
    // Note: This check is handled server-side, but we check here for UI display
    // The server will enforce the actual requirement
    const MIN_TOTAL_SHARDS = 8000;
    if (totalShardsSpent < MIN_TOTAL_SHARDS) {
      return false; // Not enough total shards spent
    }
    
    return true; // No faction unlocked yet and enough shards spent
    */
    return false; // Disabled - coming soon in v1.0
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
  'Stone Mace': 'stone-mace',
  'Bone Shiv': 'bone-shiv',
  'Kayak Paddle': 'kayak-paddle',
  'Scythe': 'scythe',
  'Metal Dagger': 'metal-dagger',
  'War Hammer': 'war-hammer',
  'Battle Axe': 'battle-axe',
  'Reed Harpoon': 'reed-harpoon',
  'Lantern': 'lantern',
  
  // Tier 2 items
  'Reed Harpoon Gun': 'reed-harpoon-gun',
  'Reed Harpoon Dart': 'reed-harpoon-dart', // Separate unlock after the gun
  'Bone Arrow': 'bone-arrow',
  'Bush Knife': 'bush-knife',
  'Reed Diver\'s Helm': 'reed-snorkel',
  'Flashlight': 'flashlight',
  'Headlamp': 'headlamp',
  'Reed Bellows': 'reed-bellows',
  
  // Tier 3 items
  'Fire Arrow': 'fire-arrow',
  'Large Wooden Storage Box': 'large-wooden-storage-box',
  'Diving Pick': 'diving-pick',
  'Reed Rain Collector': 'reed-rain-collector',
  'Barbecue': 'barbecue',
  'Pantry': 'refrigerator',
  'Repair Bench': 'repair-bench',
  
  // Tier 4 items
  'Hollow Reed Arrow': 'hollow-reed-arrow',
  'Metal Door': 'metal-door',
  'Reed Flippers': 'reed-flippers',
  'Plastic Water Jug': 'plastic-water-jug',
  'Cooking Station': 'cooking-station',
  'Compost': 'compost',
  'Scarecrow': 'scarecrow',
  'Babushka\'s Surprise': 'babushka-surprise',
  
  // Tier 5 items (Demolition)
  'Matriarch\'s Wrath': 'matriarch-wrath',
  
  // Tier 5 items
  '9x18mm Round': '9x18mm-round',
  // NOTE: Shelter removed - now always craftable as a starter base
  // NOTE: Bone Gaff Hook and Primitive Reed Fishing Rod removed - now always craftable to not gate fishing
  
  // Tier 6 items
  'Makarov PM': 'makarov-pm',
  
  // Tier 7 items
  'PP-91 KEDR': 'pp91-kedr',
};

// ALWAYS CRAFTABLE (not in ITEM_TO_NODE_MAP):
// Camp Fire, Furnace, Sleeping Bag, Wooden Storage Box, Stash, Matron's Chest
// Cerametal Field Cauldron Mk. II (Broth Pot), Wood Door, Reed Water Bottle
// Hunting Bow, Wooden Arrow, Wooden Spear
// Stone Hatchet, Stone Pickaxe, Torch, Rock, Blueprint
// Bandage, Bone Club, Bone Knife, Combat Ladle, Repair Hammer
// Rope, Cloth
// Bone Gaff Hook, Primitive Reed Fishing Rod (fishing not gated)

export const canCraftItem = (itemName: string, purchasedNodes: Set<string>): boolean => {
  const requiredNode = ITEM_TO_NODE_MAP[itemName];
  if (!requiredNode) return true; // Always craftable
  return purchasedNodes.has(requiredNode);
};

export const getRequiredNodeForItem = (itemName: string): string | null => {
  return ITEM_TO_NODE_MAP[itemName] || null;
};
