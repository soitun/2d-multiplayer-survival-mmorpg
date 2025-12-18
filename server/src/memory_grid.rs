use spacetimedb::{reducer, table, Identity, SpacetimeType, Timestamp, Table};
use crate::items::{InventoryItem, inventory_item, item_definition};

/// Represents a player's progress in the Memory Grid tech tree
#[table(name = memory_grid_progress, public)]
#[derive(Clone, Debug)]
pub struct MemoryGridProgress {
    #[primary_key]
    pub player_id: Identity,
    /// Comma-separated list of purchased node IDs
    pub purchased_nodes: String,
    /// Total memory shards spent (for statistics/achievements)
    pub total_shards_spent: u64,
    /// Last updated timestamp
    pub last_updated: Timestamp,
}

/// Individual memory grid node purchase record for detailed tracking
#[table(name = memory_grid_purchases, public)]
#[derive(Clone, Debug)]
pub struct MemoryGridPurchase {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub player_id: Identity,
    pub node_id: String,
    pub node_name: String,
    pub cost: u64,
    pub purchased_at: Timestamp,
}

/// Helper function to check if a node is in the purchased list
/// Uses proper splitting to avoid substring matching bugs
fn has_node(purchased_nodes: &str, node: &str) -> bool {
    purchased_nodes
        .split(',')
        .any(|n| n.trim() == node)
}

/// Get a player's current memory grid progress
pub fn get_player_memory_progress(ctx: &spacetimedb::ReducerContext, player_id: Identity) -> Option<MemoryGridProgress> {
    ctx.db.memory_grid_progress().player_id().find(&player_id).map(|p| p.clone())
}

/// Initialize memory grid progress for a new player
pub fn initialize_memory_grid_progress(ctx: &spacetimedb::ReducerContext, player_id: Identity) {
    // Check if player already has progress
    if ctx.db.memory_grid_progress().player_id().find(&player_id).is_some() {
        return; // Already initialized
    }
    
    // Create new progress with just the center node unlocked
    let progress = MemoryGridProgress {
        player_id,
        purchased_nodes: "center".to_string(),
        total_shards_spent: 0,
        last_updated: ctx.timestamp,
    };
    
    ctx.db.memory_grid_progress().insert(progress);
    spacetimedb::log::info!("Initialized memory grid progress for player {}", player_id);
}

/// Count memory shards in player's inventory
fn count_memory_shards_in_inventory(ctx: &spacetimedb::ReducerContext, player_id: Identity) -> u64 {
    let mut total_shards = 0u64;
    
    let memory_shard_name = "Memory Shard";
    
    let memory_shard_def_id = ctx.db.item_definition().iter()
        .find(|def| def.name == memory_shard_name)
        .map(|def| def.id);
    
    if let Some(def_id) = memory_shard_def_id {
        for inventory_item in ctx.db.inventory_item().iter() {
            if let Some(owner) = inventory_item.location.is_player_bound() {
                if owner == player_id && inventory_item.item_def_id == def_id {
                    total_shards += inventory_item.quantity as u64;
                }
            }
        }
    }
    
    total_shards
}

/// Remove memory shards from player's inventory
fn consume_memory_shards(ctx: &spacetimedb::ReducerContext, player_id: Identity, amount: u64) -> Result<(), String> {
    let mut remaining_to_consume = amount;
    let mut items_to_update = Vec::new();
    let mut items_to_delete = Vec::new();
    
    let memory_shard_name = "Memory Shard";
    
    let memory_shard_def_id = ctx.db.item_definition().iter()
        .find(|def| def.name == memory_shard_name)
        .map(|def| def.id);
    
    if let Some(def_id) = memory_shard_def_id {
        for inventory_item in ctx.db.inventory_item().iter() {
            if let Some(owner) = inventory_item.location.is_player_bound() {
                if owner == player_id && 
                   inventory_item.item_def_id == def_id && 
                   remaining_to_consume > 0 {
                    
                    if inventory_item.quantity as u64 >= remaining_to_consume {
                        let new_quantity = inventory_item.quantity as u64 - remaining_to_consume;
                        if new_quantity == 0 {
                            items_to_delete.push(inventory_item.instance_id);
                        } else {
                            let mut updated_item = inventory_item.clone();
                            updated_item.quantity = new_quantity as u32;
                            items_to_update.push(updated_item);
                        }
                        remaining_to_consume = 0;
                        break;
                    } else {
                        remaining_to_consume -= inventory_item.quantity as u64;
                        items_to_delete.push(inventory_item.instance_id);
                    }
                }
            }
        }
    }
    
    if remaining_to_consume > 0 {
        return Err(format!("Insufficient memory shards. Need {} more.", remaining_to_consume));
    }
    
    for item in items_to_update {
        ctx.db.inventory_item().instance_id().update(item);
    }
    
    for item_id in items_to_delete {
        ctx.db.inventory_item().instance_id().delete(&item_id);
    }
    
    Ok(())
}

/// Check if a node is available for purchase based on prerequisites
fn is_node_available(purchased_nodes: &str, node_id: &str, prerequisites: &[&str], total_shards_spent: u64) -> bool {
    if has_node(purchased_nodes, node_id) {
        return false; // Already purchased
    }
    
    // Special case: Faction unlock nodes have strict requirements
    // This ensures faction unlock is a meaningful milestone, not something you can rush
    if node_id.starts_with("unlock-") {
        // First check: Has the player already unlocked a DIFFERENT faction?
        // If so, this faction unlock is NOT available (must reset first)
        for faction in &FACTION_UNLOCK_NODES {
            if has_node(purchased_nodes, faction) {
                // Player already has a faction unlocked
                // Only return true if they're checking the SAME faction (but that's caught above as "already purchased")
                return false;
            }
        }
        
        // REQUIREMENT: Minimum total shard investment (8000 shards)
        // Simple requirement: Just need to have spent 8000 shards total
        // This ensures players have meaningful progression before committing to a faction
        const MIN_TOTAL_SHARDS: u64 = 8000;
        if total_shards_spent < MIN_TOTAL_SHARDS {
            return false; // Not enough total investment
        }
        
        return true; // Requirement met
    }
    
    // FFX-style logic: Need ANY ONE prerequisite (OR logic)
    prerequisites.iter().any(|prereq| has_node(purchased_nodes, prereq))
}

/// Get the cost and prerequisites for a specific node ID
/// 
/// DESIGN PHILOSOPHY (v3 - Rust-like Long Progression):
/// Costs are ~4x higher than v2 to create meaningful multi-day/week progression
/// For 60-day wipe cycles, full core grid mastery should take 20-30 days of active play
/// 
/// - TIER 1: Day 1-3 (60-100 shards) - first unlocks require real effort
/// - TIER 2: Day 3-7 (200-280 shards) - early specialization
/// - TIER 3: Day 7-14 (480-720 shards) - mid-game progression (SPLITS happen here)
/// - TIER 4: Day 14-21 (1000-1600 shards) - late early-game
/// - TIER 5: Day 21-35 (2400-3000 shards) - mid-late game
/// - TIER 6: Day 35-45 (3200-3400 shards) - late game
/// - TIER 7: Day 45+ (4000 shards) - end game
/// - FACTION UNLOCK: Major milestone (1600 shards) - requires 8000 total shards spent
/// - FACTION BRANCHES: Long-term goals (1600-10000 shards) - many weeks to complete
/// 
/// BRANCH STRUCTURE (v4 - Clean Radial Splits):
/// - Branch 1 (0°): Ranged Combat - linear
/// - Branch 2 (60°): Building - linear  
/// - Branch 3 (120°): Water - SPLITS at bone-gaff-hook into Fishing (upper) / Water Collection (lower)
/// - Branch 4 (180°): Food - SPLITS at flashlight into Cooking (upper) / Storage (lower)
/// - Branch 5 (240°): Crafting - SPLITS at reed-bellows into Passives (upper) / Maintenance (lower)
/// - Branch 6 (300°): Melee - linear (short for now)
/// 
/// Players are locked into ONE faction after unlock - reset costs 5000 shards
fn get_node_info(node_id: &str) -> Option<(u64, Vec<&'static str>)> {
    match node_id {
        // Center node (free)
        "center" => Some((0, vec![])),
        
        // ============================================
        // TIER 1 - Basic Improvements (60-100 shards)
        // Day 1-3 - first unlocks require real commitment
        // 6 nodes evenly distributed at 60° intervals
        // ============================================
        "crossbow" => Some((100, vec!["center"])),          // Branch 1 (0°): Ranged combat
        "metal-hatchet" => Some((60, vec!["center"])),      // Branch 2 (60°): Building
        "reed-harpoon" => Some((75, vec!["center"])),       // Branch 3 (120°): Water (splits later)
        "lantern" => Some((80, vec!["center"])),            // Branch 4 (180°): Food (splits later)
        "metal-pickaxe" => Some((60, vec!["center"])),      // Branch 5 (240°): Crafting (splits later)
        // MELEE BRANCH (300°) - TWO LINEAR PATHS
        // Left: Blade Path - Stone Spear → Machete → Battle Axe
        // Right: Blunt Path - Stone Mace → War Hammer
        "stone-spear" => Some((80, vec!["center"])),        // BLADE PATH T1
        "stone-mace" => Some((70, vec!["center"])),         // BLUNT PATH T1
        "machete" => Some((240, vec!["stone-spear"])),      // BLADE PATH T2
        "war-hammer" => Some((280, vec!["stone-mace"])),    // BLUNT PATH T2
        "battle-axe" => Some((600, vec!["machete"])),       // BLADE PATH T3
        
        // RELOCATED WEAPONS (no longer on melee branch)
        "bone-shiv" => Some((180, vec!["crossbow"])),       // Hunting branch - stealth weapon
        "metal-dagger" => Some((400, vec!["bone-shiv"])),   // Hunting branch - assassin upgrade
        "scythe" => Some((500, vec!["reed-bellows"])),      // Crafting branch - farming tool
        "kayak-paddle" => Some((480, vec!["bone-gaff-hook"])), // Water branch - navigation
        
        // ============================================
        // TIER 2 - Specialization (200-280 shards)
        // Day 3-7 - Split points for branches 3, 4, 5
        // ============================================
        "bone-arrow" => Some((200, vec!["crossbow"])),          // Branch 1: Crossbow → bone-arrow
        "bush-knife" => Some((220, vec!["metal-hatchet"])),     // Branch 2: Metal-hatchet → bush-knife
        "bone-gaff-hook" => Some((260, vec!["reed-harpoon"])),  // Branch 3: Reed-harpoon → bone-gaff-hook (SPLIT POINT)
        "flashlight" => Some((220, vec!["lantern"])),           // Branch 4: Lantern → flashlight (SPLIT POINT)
        "headlamp" => Some((300, vec!["lantern"])),             // Branch 4: Lantern → headlamp (tallow hands-free light)
        "reed-bellows" => Some((280, vec!["metal-pickaxe"])),   // Branch 5: Metal-pickaxe → reed-bellows (SPLIT POINT)
        
        // ============================================
        // TIER 3 - Advanced Gear (480-720 shards)
        // Day 7-14 - Branches split into upper/lower paths
        // ============================================
        // Branch 1 (linear)
        "fire-arrow" => Some((480, vec!["bone-arrow"])),
        // Branch 2 (linear)
        "large-wooden-storage-box" => Some((600, vec!["bush-knife"])),
        // Branch 3 UPPER (Fishing path @ 112°)
        "reed-fishing-rod" => Some((520, vec!["bone-gaff-hook"])),
        // Branch 3 LOWER (Water Collection path @ 128°)
        "reed-rain-collector" => Some((560, vec!["bone-gaff-hook"])),
        // Branch 4 UPPER (Cooking path @ 172°)
        "barbecue" => Some((600, vec!["flashlight"])),
        // Branch 4 LOWER (Food Storage path @ 188°)
        "refrigerator" => Some((680, vec!["flashlight"])),
        // Branch 5 UPPER (Passive Bonuses path @ 232°)
        "mining-efficiency" => Some((720, vec!["reed-bellows"])),
        // Branch 5 LOWER (Maintenance path @ 248°)
        "repair-bench" => Some((560, vec!["reed-bellows"])),
        
        // ============================================
        // TIER 4 - Late Early-Game (1000-1600 shards)
        // Day 14-21 - Split paths continue outward
        // ============================================
        // Branch 1 (linear)
        "hollow-reed-arrow" => Some((1200, vec!["fire-arrow"])),
        // Branch 2 (linear)
        "metal-door" => Some((1280, vec!["large-wooden-storage-box"])),
        // Branch 3 UPPER (Fishing)
        "reed-snorkel" => Some((1400, vec!["reed-fishing-rod"])),
        // Branch 3 LOWER (Water Collection)
        "plastic-water-jug" => Some((1200, vec!["reed-rain-collector"])),
        // Branch 4 LOWER (Food Storage)
        "compost" => Some((1200, vec!["refrigerator"])),
        
        // ============================================
        // TIER 5 - Mid-Late Game (2400-3000 shards)
        // Day 21-35 - Split paths conclude
        // ============================================
        // Branch 4 LOWER (Food Storage / Farming) - capstone
        "scarecrow" => Some((2400, vec!["compost"])),
        // Branch 5 UPPER (Passive Bonuses)
        "crafting-speed-1" => Some((1600, vec!["mining-efficiency"])),
        
        // ============================================
        // TIER 5 - Mid-Late Game (2400-3000 shards)
        // Day 21-35 - Split paths conclude
        // ============================================
        // Branch 1 (linear)
        "9x18mm-round" => Some((2400, vec!["hollow-reed-arrow"])),
        // Branch 2 (linear)
        "shelter" => Some((2600, vec!["metal-door"])),
        // Branch 4 UPPER (Cooking)
        "cooking-station" => Some((1400, vec!["barbecue"])),
        // Branch 5 UPPER (Passive Bonuses)
        "crafting-speed-2" => Some((3000, vec!["crafting-speed-1"])),
        
        // ============================================
        // TIER 6 - Late Game (3200 shards)
        // Day 35-45 - Final upgrades before factions
        // ============================================
        "makarov-pm" => Some((3200, vec!["9x18mm-round"])),
        
        // ============================================
        // FACTION UNLOCK NODES (1600 shards each)
        // Major milestone - requires spending 8000 total shards on core grid
        // Player commits to ONE faction (reset costs 5000 shards)
        // ============================================
        "unlock-black-wolves" => Some((1600, vec![])), // No node prerequisites - only requires 8000 total shards spent
        "unlock-hive" => Some((1600, vec![])),
        "unlock-university" => Some((1600, vec![])),
        "unlock-data-angels" => Some((1600, vec![])),
        "unlock-battalion" => Some((1600, vec![])),
        "unlock-admiralty" => Some((1600, vec![])),
        
        // ============================================
        // FACTION BRANCHES (1600-10000 shards per node)
        // Long-term progression over many weeks
        // 5 nodes per path = 23200 shards to complete one path
        // ============================================
        
        // BLACK WOLVES - Berserker Path (Total: 23200 shards)
        "riot-vest" => Some((1600, vec!["unlock-black-wolves"])),
        "shock-pike" => Some((2400, vec!["riot-vest"])),
        "slab-shield" => Some((3600, vec!["shock-pike"])),
        "flash-hammer" => Some((5600, vec!["slab-shield"])),
        "adrenal-surge" => Some((10000, vec!["flash-hammer"])), // Capstone
        
        // BLACK WOLVES - Assassin Path (Total: 23200 shards)
        "combat-stims" => Some((1600, vec!["unlock-black-wolves"])),
        "suppressor-rig" => Some((2400, vec!["combat-stims"])),
        "grav-boots" => Some((3600, vec!["suppressor-rig"])),
        "field-interrogator" => Some((5600, vec!["grav-boots"])),
        "armor-durability" => Some((10000, vec!["field-interrogator"])), // Capstone
        
        // HIVE - Industrialist Path (Total: 23200 shards)
        "spore-grain-vat" => Some((1600, vec!["unlock-hive"])),
        "slime-furnace" => Some((2400, vec!["spore-grain-vat"])),
        "chameleon-harness" => Some((3600, vec!["slime-furnace"])),
        "mealworm-factory" => Some((5600, vec!["chameleon-harness"])),
        "crafting-speed-hive" => Some((10000, vec!["mealworm-factory"])), // Capstone
        
        // HIVE - Toxicologist Path (Total: 23200 shards)
        "venom-knife" => Some((1600, vec!["unlock-hive"])),
        "poison-resistance" => Some((2400, vec!["venom-knife"])),
        "acid-sprayer" => Some((3600, vec!["poison-resistance"])),
        "toxic-coating" => Some((5600, vec!["acid-sprayer"])),
        "toxic-bloom" => Some((10000, vec!["toxic-coating"])), // Capstone
        
        // UNIVERSITY - Engineer Path (Total: 23200 shards)
        "auto-turret" => Some((1600, vec!["unlock-university"])),
        "scanner-drone" => Some((2400, vec!["auto-turret"])),
        "repair-swarm" => Some((3600, vec!["scanner-drone"])),
        "stabilizer-field" => Some((5600, vec!["repair-swarm"])),
        "fabricator-burst" => Some((10000, vec!["stabilizer-field"])), // Capstone
        
        // UNIVERSITY - Scholar Path (Total: 23200 shards)
        "logic-furnace" => Some((1600, vec!["unlock-university"])),
        "bioprinter-table" => Some((2400, vec!["logic-furnace"])),
        "geneforge-vat" => Some((3600, vec!["bioprinter-table"])),
        "mining-yield-ii" => Some((5600, vec!["geneforge-vat"])),
        "crafting-speed-uni" => Some((10000, vec!["mining-yield-ii"])), // Capstone
        
        // DATA ANGELS - Netrunner Path (Total: 23200 shards)
        "jammer-tower" => Some((1600, vec!["unlock-data-angels"])),
        "ghost-uplink" => Some((2400, vec!["jammer-tower"])),
        "neurochef-decryptor" => Some((3600, vec!["ghost-uplink"])),
        "drone-hijack" => Some((5600, vec!["neurochef-decryptor"])),
        "hacking-speed" => Some((10000, vec!["drone-hijack"])), // Capstone
        
        // DATA ANGELS - Phantom Path (Total: 23200 shards)
        "backdoor-cloak" => Some((1600, vec!["unlock-data-angels"])),
        "signal-scrubber" => Some((2400, vec!["backdoor-cloak"])),
        "memory-leech" => Some((3600, vec!["signal-scrubber"])),
        "movement-speed-da" => Some((5600, vec!["memory-leech"])),
        "overclock" => Some((10000, vec!["movement-speed-da"])), // Capstone
        
        // BATTALION - Colonel Path (Total: 23200 shards)
        "battalion-smg" => Some((1600, vec!["unlock-battalion"])),
        "mortar-nest" => Some((2400, vec!["battalion-smg"])),
        "fragment-armor" => Some((3600, vec!["mortar-nest"])),
        "ammo-press" => Some((5600, vec!["fragment-armor"])),
        "ranged-damage" => Some((10000, vec!["ammo-press"])), // Capstone
        
        // BATTALION - Tactician Path (Total: 23200 shards)
        "tactical-optics" => Some((1600, vec!["unlock-battalion"])),
        "supply-cache" => Some((2400, vec!["tactical-optics"])),
        "field-ration-kit" => Some((3600, vec!["supply-cache"])),
        "max-hp" => Some((5600, vec!["field-ration-kit"])),
        "rally-cry" => Some((10000, vec!["max-hp"])), // Capstone
        
        // ADMIRALTY - Captain Path (Total: 23200 shards)
        "tide-beacon" => Some((1600, vec!["unlock-admiralty"])),
        "storm-sail-raft" => Some((2400, vec!["tide-beacon"])),
        "net-cannon" => Some((3600, vec!["storm-sail-raft"])),
        "luminous-buoy" => Some((5600, vec!["net-cannon"])),
        "naval-command" => Some((10000, vec!["luminous-buoy"])), // Capstone
        
        // ADMIRALTY - Storm Caller Path (Total: 23200 shards)
        "saltwater-desal" => Some((1600, vec!["unlock-admiralty"])),
        "weathercock-tower" => Some((2400, vec!["saltwater-desal"])),
        "weather-resistance" => Some((3600, vec!["weathercock-tower"])),
        "tide-gauge" => Some((5600, vec!["weather-resistance"])),
        "tempest-call" => Some((10000, vec!["tide-gauge"])), // Capstone
        
        _ => None, // Unknown node
    }
}

/// Reducer: Purchase a memory grid node
#[reducer]
pub fn purchase_memory_grid_node(ctx: &spacetimedb::ReducerContext, node_id: String) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Get node info (cost and prerequisites)
    let (cost, prerequisites) = get_node_info(&node_id)
        .ok_or_else(|| format!("Unknown memory grid node: {}", node_id))?;
    
    // Get or create player's progress
    let existing = ctx.db.memory_grid_progress().player_id().find(&player_id);
    let mut progress = if let Some(p) = existing {
        p.clone()
    } else {
        // Create and INSERT the initial progress
        let new_progress = MemoryGridProgress {
            player_id,
            purchased_nodes: "center".to_string(),
            total_shards_spent: 0,
            last_updated: ctx.timestamp,
        };
        ctx.db.memory_grid_progress().insert(new_progress.clone());
        new_progress
    };
    
    // Check if node is available for purchase
    if !is_node_available(&progress.purchased_nodes, &node_id, &prerequisites, progress.total_shards_spent) {
        // Provide helpful error message for faction unlocks
        if node_id.starts_with("unlock-") {
            if progress.total_shards_spent < 8000 {
                return Err(format!(
                    "Faction unlock requires spending at least 8000 total shards. Currently spent: {}",
                    progress.total_shards_spent
                ));
            }
        }
        return Err("Node is not available for purchase. Check prerequisites.".to_string());
    }
    
    // Check if player has enough memory shards
    let available_shards = count_memory_shards_in_inventory(ctx, player_id);
    if available_shards < cost {
        return Err(format!("Insufficient memory shards. Need {} but only have {}.", cost, available_shards));
    }
    
    // Consume memory shards from inventory
    consume_memory_shards(ctx, player_id, cost)?;
    
    // Add node to purchased list
    if progress.purchased_nodes.is_empty() {
        progress.purchased_nodes = node_id.clone();
    } else {
        progress.purchased_nodes = format!("{},{}", progress.purchased_nodes, node_id);
    }
    progress.total_shards_spent += cost;
    progress.last_updated = ctx.timestamp;
    
    // Update progress in database
    ctx.db.memory_grid_progress().player_id().update(progress);
    
    // Record individual purchase
    let purchase_record = MemoryGridPurchase {
        id: 0,
        player_id,
        node_id: node_id.clone(),
        node_name: get_node_display_name(&node_id),
        cost,
        purchased_at: ctx.timestamp,
    };
    ctx.db.memory_grid_purchases().insert(purchase_record);
    
    spacetimedb::log::info!("Player {} purchased memory grid node '{}' for {} shards", player_id, node_id, cost);
    Ok(())
}

/// Reducer: Initialize memory grid progress for current player (called from client)
#[reducer]
pub fn initialize_player_memory_grid(ctx: &spacetimedb::ReducerContext) {
    initialize_memory_grid_progress(ctx, ctx.sender);
}

/// Helper function to get display name for a node ID
fn get_node_display_name(node_id: &str) -> String {
    match node_id {
        // Center
        "center" => "Neural Interface".to_string(),
        
        // Tier 1
        "metal-hatchet" => "Metal Hatchet".to_string(),
        "metal-pickaxe" => "Metal Pickaxe".to_string(),
        "crossbow" => "Crossbow".to_string(),
        "stone-spear" => "Stone Spear".to_string(),
        "stone-mace" => "Stone Mace".to_string(),
        "bone-shiv" => "Bone Shiv".to_string(),
        "kayak-paddle" => "Kayak Paddle".to_string(),
        "scythe" => "Scythe".to_string(),
        "machete" => "Machete".to_string(),
        "metal-dagger" => "Metal Dagger".to_string(),
        "war-hammer" => "War Hammer".to_string(),
        "battle-axe" => "Battle Axe".to_string(),
        "reed-harpoon" => "Reed Harpoon".to_string(),
        "lantern" => "Lantern".to_string(),
        
        // Tier 2
        "bone-arrow" => "Bone Arrow".to_string(),
        "bush-knife" => "Bush Knife".to_string(),
        "bone-gaff-hook" => "Bone Gaff Hook".to_string(),
        "flashlight" => "Flashlight".to_string(),
        "headlamp" => "Headlamp".to_string(),
        "reed-bellows" => "Reed Bellows".to_string(),
        
        // Tier 3
        "fire-arrow" => "Fire Arrow".to_string(),
        "large-wooden-storage-box" => "Large Wooden Storage Box".to_string(),
        "reed-fishing-rod" => "Primitive Reed Fishing Rod".to_string(),
        "reed-rain-collector" => "Reed Rain Collector".to_string(),
        "barbecue" => "Barbecue".to_string(),
        "refrigerator" => "Refrigerator".to_string(),
        "mining-efficiency" => "Mining Efficiency".to_string(),
        "repair-bench" => "Repair Bench".to_string(),
        
        // Tier 4
        "hollow-reed-arrow" => "Hollow Reed Arrow".to_string(),
        "metal-door" => "Metal Door".to_string(),
        "reed-snorkel" => "Reed Diver's Helm".to_string(),
        "plastic-water-jug" => "Plastic Water Jug".to_string(),
        "cooking-station" => "Cooking Station".to_string(),
        "compost" => "Compost".to_string(),
        "scarecrow" => "Scarecrow".to_string(),
        "crafting-speed-1" => "Crafting Speed I".to_string(),
        
        // Tier 5
        "9x18mm-round" => "9x18mm Round".to_string(),
        "shelter" => "Shelter".to_string(),
        "crafting-speed-2" => "Crafting Speed II".to_string(),
        
        // Tier 6
        "makarov-pm" => "Makarov PM".to_string(),
        
        // Faction unlocks
        "unlock-black-wolves" => "Unlock Black Wolves".to_string(),
        "unlock-hive" => "Unlock Hive".to_string(),
        "unlock-university" => "Unlock University".to_string(),
        "unlock-data-angels" => "Unlock DATA ANGELS".to_string(),
        "unlock-battalion" => "Unlock Battalion".to_string(),
        "unlock-admiralty" => "Unlock Admiralty".to_string(),
        
        // Default: convert kebab-case to Title Case
        _ => node_id.replace('-', " ").split(' ').map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            }
        }).collect::<Vec<_>>().join(" "),
    }
}

/// Check if a player has unlocked a specific memory grid node
pub fn player_has_node(ctx: &spacetimedb::ReducerContext, player_id: Identity, node_id: &str) -> bool {
    if let Some(progress) = ctx.db.memory_grid_progress().player_id().find(&player_id) {
        has_node(&progress.purchased_nodes, node_id)
    } else {
        node_id == "center"
    }
}

// ============================================
// PASSIVE BUFF CONSTANTS & HELPERS
// ============================================

/// Mining Efficiency bonus from memory grid node (+30% yield)
pub const MINING_EFFICIENCY_MULTIPLIER: f32 = 1.30;

/// Crafting Speed I bonus from memory grid node (15% faster = 0.85x time)
pub const CRAFTING_SPEED_1_MULTIPLIER: f32 = 0.85;

/// Crafting Speed II bonus from memory grid node (25% faster = 0.75x time)
pub const CRAFTING_SPEED_2_MULTIPLIER: f32 = 0.75;

/// Check if a player has the Mining Efficiency memory grid node unlocked
/// This grants +30% resource yield from all gathering activities (mining, chopping)
pub fn player_has_mining_efficiency(ctx: &spacetimedb::ReducerContext, player_id: Identity) -> bool {
    player_has_node(ctx, player_id, "mining-efficiency")
}

/// Get the crafting speed multiplier for a player based on their memory grid nodes
/// Returns a multiplier < 1.0 for faster crafting (e.g., 0.85 = 15% faster)
/// 
/// - No nodes: 1.0 (normal speed)
/// - Crafting Speed I: 0.85 (15% faster)
/// - Crafting Speed II: 0.75 (25% faster) - stacks additively with I
pub fn get_crafting_speed_multiplier(ctx: &spacetimedb::ReducerContext, player_id: Identity) -> f32 {
    // Check for Crafting Speed II first (better bonus)
    if player_has_node(ctx, player_id, "crafting-speed-2") {
        return CRAFTING_SPEED_2_MULTIPLIER;
    }
    
    // Check for Crafting Speed I
    if player_has_node(ctx, player_id, "crafting-speed-1") {
        return CRAFTING_SPEED_1_MULTIPLIER;
    }
    
    // No crafting speed nodes
    1.0
}

/// Get the memory grid node ID required to craft a specific item
/// Returns None if the item doesn't require any memory grid unlock (always craftable)
/// 
/// ITEMS THAT ARE ALWAYS CRAFTABLE (no Memory Grid required):
/// - Camp Fire, Furnace, Sleeping Bag, Wooden Storage Box, Stash
/// - Hunting Bow, Wooden Arrow, Wooden Spear
/// - Stone Hatchet, Stone Pickaxe, Torch, Rock, Blueprint
/// - Bandage, Bone Club, Bone Knife, Reed Water Bottle
/// - Rope, Cloth, Combat Ladle, Matron's Chest
pub fn get_required_node_for_item(item_name: &str) -> Option<&'static str> {
    match item_name {
        // Tier 1 items
        "Metal Hatchet" => Some("metal-hatchet"),
        "Metal Pickaxe" => Some("metal-pickaxe"),
        "Crossbow" => Some("crossbow"),
        "Stone Spear" => Some("stone-spear"),
        "Stone Mace" => Some("stone-mace"),
        "Bone Shiv" => Some("bone-shiv"),
        "Kayak Paddle" => Some("kayak-paddle"),
        "Scythe" => Some("scythe"),
        "Machete" => Some("machete"),
        "Metal Dagger" => Some("metal-dagger"),
        "War Hammer" => Some("war-hammer"),
        "Battle Axe" => Some("battle-axe"),
        "Reed Harpoon" => Some("reed-harpoon"),
        "Lantern" => Some("lantern"),
        
        // Tier 2 items
        "Bone Arrow" => Some("bone-arrow"),
        "Bush Knife" => Some("bush-knife"),
        "Bone Gaff Hook" => Some("bone-gaff-hook"),
        "Flashlight" => Some("flashlight"),
        "Headlamp" => Some("headlamp"),
        "Reed Bellows" => Some("reed-bellows"),
        
        // Tier 3 items
        "Fire Arrow" => Some("fire-arrow"),
        "Large Wooden Storage Box" => Some("large-wooden-storage-box"),
        "Primitive Reed Fishing Rod" => Some("reed-fishing-rod"),
        "Reed Rain Collector" => Some("reed-rain-collector"),
        "Barbecue" => Some("barbecue"),
        "Refrigerator" => Some("refrigerator"),
        "Repair Bench" => Some("repair-bench"),
        
        // Tier 4 items
        "Hollow Reed Arrow" => Some("hollow-reed-arrow"),
        "Metal Door" => Some("metal-door"),
        "Reed Diver's Helm" => Some("reed-snorkel"),
        "Plastic Water Jug" => Some("plastic-water-jug"),
        "Cooking Station" => Some("cooking-station"),
        "Compost" => Some("compost"),
        "Scarecrow" => Some("scarecrow"),
        
        // Tier 5 items
        "9x18mm Round" => Some("9x18mm-round"),
        "Shelter" => Some("shelter"),
        
        // Tier 6 items
        "Makarov PM" => Some("makarov-pm"),
        
        // ALWAYS CRAFTABLE - No Memory Grid requirement
        // Basic structures
        "Camp Fire" | "Furnace" | "Sleeping Bag" | "Wooden Storage Box" |
        "Stash" | "Matron's Chest" | "Cerametal Field Cauldron Mk. II" | "Wood Door" | "Reed Water Bottle" => None,
        
        // Basic weapons
        "Hunting Bow" | "Wooden Arrow" | "Wooden Spear" => None,
        
        // Basic tools
        "Stone Hatchet" | "Stone Pickaxe" | "Torch" | "Rock" | "Blueprint" |
        "Bandage" | "Bone Club" | "Bone Knife" | 
        "Combat Ladle" | "Repair Hammer" => None,
        
        // Basic materials/crafting
        "Rope" | "Cloth" => None,
        
        // Default: no requirement
        _ => None,
    }
}

/// Cost in shards to reset faction choice
pub const FACTION_RESET_COST: u64 = 5000;

/// List of all faction unlock node IDs
const FACTION_UNLOCK_NODES: [&str; 6] = [
    "unlock-black-wolves",
    "unlock-hive", 
    "unlock-university",
    "unlock-data-angels",
    "unlock-battalion",
    "unlock-admiralty",
];

/// List of all faction branch node IDs (to be removed on reset)
const FACTION_BRANCH_NODES: [&str; 60] = [
    // Black Wolves
    "riot-vest", "shock-pike", "slab-shield", "flash-hammer", "adrenal-surge",
    "combat-stims", "suppressor-rig", "grav-boots", "field-interrogator", "armor-durability",
    // Hive
    "spore-grain-vat", "slime-furnace", "chameleon-harness", "mealworm-factory", "crafting-speed-hive",
    "venom-knife", "poison-resistance", "acid-sprayer", "toxic-coating", "toxic-bloom",
    // University
    "auto-turret", "scanner-drone", "repair-swarm", "stabilizer-field", "fabricator-burst",
    "logic-furnace", "bioprinter-table", "geneforge-vat", "mining-yield-ii", "crafting-speed-uni",
    // Data Angels
    "jammer-tower", "ghost-uplink", "neurochef-decryptor", "drone-hijack", "hacking-speed",
    "backdoor-cloak", "signal-scrubber", "memory-leech", "movement-speed-da", "overclock",
    // Battalion
    "battalion-smg", "mortar-nest", "fragment-armor", "ammo-press", "ranged-damage",
    "tactical-optics", "supply-cache", "field-ration-kit", "max-hp", "rally-cry",
    // Admiralty
    "tide-beacon", "storm-sail-raft", "net-cannon", "luminous-buoy", "naval-command",
    "saltwater-desal", "weathercock-tower", "weather-resistance", "tide-gauge", "tempest-call",
];

/// Get which faction a player has unlocked (if any)
pub fn get_player_faction(ctx: &spacetimedb::ReducerContext, player_id: Identity) -> Option<String> {
    if let Some(progress) = ctx.db.memory_grid_progress().player_id().find(&player_id) {
        for faction in &FACTION_UNLOCK_NODES {
            if has_node(&progress.purchased_nodes, faction) {
                return Some(faction.to_string());
            }
        }
    }
    None
}

/// Check if a player has already unlocked a faction
pub fn player_has_faction(ctx: &spacetimedb::ReducerContext, player_id: Identity) -> bool {
    get_player_faction(ctx, player_id).is_some()
}

/// Reducer: Reset faction choice - removes faction unlock and all faction branch nodes
/// Costs FACTION_RESET_COST shards (2000)
#[reducer]
pub fn reset_faction(ctx: &spacetimedb::ReducerContext) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Get player's progress
    let progress = ctx.db.memory_grid_progress().player_id().find(&player_id)
        .ok_or("No memory grid progress found")?;
    
    // Check if player has a faction to reset
    if !player_has_faction(ctx, player_id) {
        return Err("You have not unlocked any faction yet.".to_string());
    }
    
    // Check if player has enough shards
    let available_shards = count_memory_shards_in_inventory(ctx, player_id);
    if available_shards < FACTION_RESET_COST {
        return Err(format!(
            "Insufficient memory shards for faction reset. Need {} but only have {}.",
            FACTION_RESET_COST, available_shards
        ));
    }
    
    // Consume shards
    consume_memory_shards(ctx, player_id, FACTION_RESET_COST)?;
    
    // Remove all faction-related nodes from purchased list
    let mut nodes: Vec<&str> = progress.purchased_nodes
        .split(',')
        .map(|s| s.trim())
        .collect();
    
    // Filter out faction unlocks and branches
    nodes.retain(|node| {
        !FACTION_UNLOCK_NODES.contains(node) && !FACTION_BRANCH_NODES.contains(node)
    });
    
    // Update progress
    let mut updated_progress = progress.clone();
    updated_progress.purchased_nodes = nodes.join(",");
    updated_progress.total_shards_spent += FACTION_RESET_COST;
    updated_progress.last_updated = ctx.timestamp;
    
    ctx.db.memory_grid_progress().player_id().update(updated_progress);
    
    // Record the reset as a special "purchase"
    let reset_record = MemoryGridPurchase {
        id: 0,
        player_id,
        node_id: "faction-reset".to_string(),
        node_name: "Faction Reset".to_string(),
        cost: FACTION_RESET_COST,
        purchased_at: ctx.timestamp,
    };
    ctx.db.memory_grid_purchases().insert(reset_record);
    
    spacetimedb::log::info!(
        "Player {} reset their faction for {} shards",
        player_id, FACTION_RESET_COST
    );
    
    Ok(())
}
