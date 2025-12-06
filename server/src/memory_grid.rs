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
fn is_node_available(purchased_nodes: &str, node_id: &str, prerequisites: &[&str]) -> bool {
    if has_node(purchased_nodes, node_id) {
        return false; // Already purchased
    }
    
    // Special case: Faction unlock nodes need ANY ONE tier 5 node
    // AND the player must NOT have already unlocked a different faction
    if node_id.starts_with("unlock-") {
        // First check: Has any tier 5 node been purchased?
        let tier5_nodes = ["makarov-pm", "broth-mastery", "shelter", "metal-armor", "combat-drone", "rain-collector", "armor-mastery", "movement-speed-2"];
        let has_tier5 = tier5_nodes.iter().any(|tier5_node| has_node(purchased_nodes, tier5_node));
        
        if !has_tier5 {
            return false; // No tier 5 node yet
        }
        
        // Second check: Has the player already unlocked a DIFFERENT faction?
        // If so, this faction unlock is NOT available (must reset first)
        for faction in &FACTION_UNLOCK_NODES {
            if has_node(purchased_nodes, faction) {
                // Player already has a faction unlocked
                // Only return true if they're checking the SAME faction (but that's caught above as "already purchased")
                return false;
            }
        }
        
        return true; // Has tier 5 and no faction unlocked yet
    }
    
    // FFX-style logic: Need ANY ONE prerequisite (OR logic)
    prerequisites.iter().any(|prereq| has_node(purchased_nodes, prereq))
}

/// Get the cost and prerequisites for a specific node ID
/// 
/// DESIGN PHILOSOPHY (v2 - Fast Early Progression):
/// - TIER 1: Very cheap (15-30 shards) - unlock 2-3 nodes in first 15 minutes
/// - TIER 2: Affordable (50-80 shards) - complete in first hour
/// - TIER 3: Moderate (120-200 shards) - first few hours
/// - TIER 4: Expensive (300-450 shards) - end of first session / next day  
/// - TIER 5: Very expensive (600-900 shards) - first week of play
/// - FACTION UNLOCK: Major milestone (400 shards) - after first Tier 5
/// - FACTION BRANCHES: Long-term goals (400-2500 shards) - weeks to complete
/// 
/// For 60-120 day wipe cycles, full faction mastery should take 30-60 days
/// Players are locked into ONE faction after unlock - reset costs 2000 shards
fn get_node_info(node_id: &str) -> Option<(u64, Vec<&'static str>)> {
    match node_id {
        // Center node (free)
        "center" => Some((0, vec![])),
        
        // ============================================
        // TIER 1 - First Upgrades (15-30 shards)
        // "WOW! Power unlocked!" in first 15 minutes
        // ============================================
        "crossbow" => Some((25, vec!["center"])),           // Better ranged weapon
        "metal-hatchet" => Some((15, vec!["center"])),      // Better wood gathering - CHEAPEST
        "metal-pickaxe" => Some((15, vec!["center"])),      // Better stone gathering - CHEAPEST
        "lantern" => Some((20, vec!["center"])),            // Better lighting than torch
        "bush-knife" => Some((25, vec!["center"])),         // Combat/wood hybrid
        "mining-efficiency" => Some((30, vec!["center"])),  // Passive: +30% yield
        
        // ============================================
        // TIER 2 - Early-Mid Game (50-80 shards)
        // Complete within first hour
        // ============================================
        "bone-arrow" => Some((50, vec!["crossbow", "bush-knife", "metal-hatchet"])),
        "fire-arrow" => Some((60, vec!["crossbow", "lantern", "metal-hatchet"])),
        "flashlight" => Some((55, vec!["lantern", "crossbow", "metal-pickaxe"])),
        "reed-bellows" => Some((70, vec!["metal-pickaxe", "lantern", "mining-efficiency"])),
        "crafting-speed-1" => Some((80, vec!["bush-knife", "mining-efficiency", "crossbow"])), // Passive: +15% craft speed
        
        // ============================================
        // TIER 3 - Mid Game (120-200 shards)
        // First few hours of play
        // ============================================
        "hollow-reed-arrow" => Some((120, vec!["bone-arrow", "crafting-speed-1", "fire-arrow"])),
        "reed-snorkel" => Some((140, vec!["fire-arrow", "bone-arrow", "flashlight"])),
        "reed-fishing-rod" => Some((130, vec!["flashlight", "fire-arrow", "reed-bellows"])),
        "reed-rain-collector" => Some((180, vec!["reed-bellows", "flashlight", "crafting-speed-1"])),
        "movement-speed-1" => Some((200, vec!["crafting-speed-1", "reed-bellows", "bone-arrow"])), // Passive: +10% move speed
        
        // ============================================
        // TIER 4 - Late Session (300-450 shards)
        // End of first long session or second day
        // ============================================
        "metal-door" => Some((300, vec!["hollow-reed-arrow", "movement-speed-1", "reed-snorkel"])),
        "shelter" => Some((380, vec!["reed-snorkel", "hollow-reed-arrow", "reed-fishing-rod"])),
        "9x18mm-round" => Some((350, vec!["reed-fishing-rod", "reed-snorkel", "hollow-reed-arrow"])),
        "metal-armor" => Some((450, vec!["reed-rain-collector", "hollow-reed-arrow", "movement-speed-1"])),
        "crafting-speed-2" => Some((400, vec!["movement-speed-1", "reed-rain-collector", "hollow-reed-arrow"])), // Passive: +25% craft speed
        
        // ============================================
        // TIER 5 - End-Game Items (600-900 shards)
        // First week of play - major achievement
        // ============================================
        "makarov-pm" => Some((750, vec!["metal-door", "crafting-speed-2", "shelter"])),
        "combat-drone" => Some((800, vec!["shelter", "metal-door", "9x18mm-round"])),
        "rain-collector" => Some((600, vec!["9x18mm-round", "shelter", "metal-armor"])), // Advanced rain collector upgrade
        "broth-mastery" => Some((700, vec!["metal-armor", "9x18mm-round", "shelter"])), // Passive: broths last 50% longer
        "armor-mastery" => Some((750, vec!["metal-armor", "shelter", "crafting-speed-2"])), // Passive: armor durability +30%
        "movement-speed-2" => Some((900, vec!["crafting-speed-2", "metal-armor", "metal-door"])), // Passive: +20% move speed
        
        // ============================================
        // FACTION UNLOCK NODES (400 shards each)
        // Major milestone - requires ANY Tier 5 node
        // Player commits to ONE faction (reset costs 2000 shards)
        // ============================================
        "unlock-black-wolves" => Some((400, vec!["makarov-pm", "combat-drone", "rain-collector", "broth-mastery", "armor-mastery", "movement-speed-2"])),
        "unlock-hive" => Some((400, vec!["makarov-pm", "combat-drone", "rain-collector", "broth-mastery", "armor-mastery", "movement-speed-2"])),
        "unlock-university" => Some((400, vec!["makarov-pm", "combat-drone", "rain-collector", "broth-mastery", "armor-mastery", "movement-speed-2"])),
        "unlock-data-angels" => Some((400, vec!["makarov-pm", "combat-drone", "rain-collector", "broth-mastery", "armor-mastery", "movement-speed-2"])),
        "unlock-battalion" => Some((400, vec!["makarov-pm", "combat-drone", "rain-collector", "broth-mastery", "armor-mastery", "movement-speed-2"])),
        "unlock-admiralty" => Some((400, vec!["makarov-pm", "combat-drone", "rain-collector", "broth-mastery", "armor-mastery", "movement-speed-2"])),
        
        // ============================================
        // FACTION BRANCHES (400-2500 shards per node)
        // Long-term progression over weeks
        // 5 nodes per path = 5800 shards to complete one path
        // ============================================
        
        // BLACK WOLVES - Berserker Path (Total: 5800 shards)
        "riot-vest" => Some((400, vec!["unlock-black-wolves"])),
        "shock-pike" => Some((600, vec!["riot-vest"])),
        "slab-shield" => Some((900, vec!["shock-pike"])),
        "flash-hammer" => Some((1400, vec!["slab-shield"])),
        "adrenal-surge" => Some((2500, vec!["flash-hammer"])), // Capstone
        
        // BLACK WOLVES - Assassin Path (Total: 5800 shards)
        "combat-stims" => Some((400, vec!["unlock-black-wolves"])),
        "suppressor-rig" => Some((600, vec!["combat-stims"])),
        "grav-boots" => Some((900, vec!["suppressor-rig"])),
        "field-interrogator" => Some((1400, vec!["grav-boots"])),
        "armor-durability" => Some((2500, vec!["field-interrogator"])), // Capstone
        
        // HIVE - Industrialist Path (Total: 5800 shards)
        "spore-grain-vat" => Some((400, vec!["unlock-hive"])),
        "slime-furnace" => Some((600, vec!["spore-grain-vat"])),
        "chameleon-harness" => Some((900, vec!["slime-furnace"])),
        "mealworm-factory" => Some((1400, vec!["chameleon-harness"])),
        "crafting-speed-hive" => Some((2500, vec!["mealworm-factory"])), // Capstone
        
        // HIVE - Toxicologist Path (Total: 5800 shards)
        "venom-knife" => Some((400, vec!["unlock-hive"])),
        "poison-resistance" => Some((600, vec!["venom-knife"])),
        "acid-sprayer" => Some((900, vec!["poison-resistance"])),
        "toxic-coating" => Some((1400, vec!["acid-sprayer"])),
        "toxic-bloom" => Some((2500, vec!["toxic-coating"])), // Capstone
        
        // UNIVERSITY - Engineer Path (Total: 5800 shards)
        "auto-turret" => Some((400, vec!["unlock-university"])),
        "scanner-drone" => Some((600, vec!["auto-turret"])),
        "repair-swarm" => Some((900, vec!["scanner-drone"])),
        "stabilizer-field" => Some((1400, vec!["repair-swarm"])),
        "fabricator-burst" => Some((2500, vec!["stabilizer-field"])), // Capstone
        
        // UNIVERSITY - Scholar Path (Total: 5800 shards)
        "logic-furnace" => Some((400, vec!["unlock-university"])),
        "bioprinter-table" => Some((600, vec!["logic-furnace"])),
        "geneforge-vat" => Some((900, vec!["bioprinter-table"])),
        "mining-yield-ii" => Some((1400, vec!["geneforge-vat"])),
        "crafting-speed-uni" => Some((2500, vec!["mining-yield-ii"])), // Capstone
        
        // DATA ANGELS - Netrunner Path (Total: 5800 shards)
        "jammer-tower" => Some((400, vec!["unlock-data-angels"])),
        "ghost-uplink" => Some((600, vec!["jammer-tower"])),
        "neurochef-decryptor" => Some((900, vec!["ghost-uplink"])),
        "drone-hijack" => Some((1400, vec!["neurochef-decryptor"])),
        "hacking-speed" => Some((2500, vec!["drone-hijack"])), // Capstone
        
        // DATA ANGELS - Phantom Path (Total: 5800 shards)
        "backdoor-cloak" => Some((400, vec!["unlock-data-angels"])),
        "signal-scrubber" => Some((600, vec!["backdoor-cloak"])),
        "memory-leech" => Some((900, vec!["signal-scrubber"])),
        "movement-speed-da" => Some((1400, vec!["memory-leech"])),
        "overclock" => Some((2500, vec!["movement-speed-da"])), // Capstone
        
        // BATTALION - Colonel Path (Total: 5800 shards)
        "battalion-smg" => Some((400, vec!["unlock-battalion"])),
        "mortar-nest" => Some((600, vec!["battalion-smg"])),
        "fragment-armor" => Some((900, vec!["mortar-nest"])),
        "ammo-press" => Some((1400, vec!["fragment-armor"])),
        "ranged-damage" => Some((2500, vec!["ammo-press"])), // Capstone
        
        // BATTALION - Tactician Path (Total: 5800 shards)
        "tactical-optics" => Some((400, vec!["unlock-battalion"])),
        "supply-cache" => Some((600, vec!["tactical-optics"])),
        "field-ration-kit" => Some((900, vec!["supply-cache"])),
        "max-hp" => Some((1400, vec!["field-ration-kit"])),
        "rally-cry" => Some((2500, vec!["max-hp"])), // Capstone
        
        // ADMIRALTY - Captain Path (Total: 5800 shards)
        "tide-beacon" => Some((400, vec!["unlock-admiralty"])),
        "storm-sail-raft" => Some((600, vec!["tide-beacon"])),
        "net-cannon" => Some((900, vec!["storm-sail-raft"])),
        "luminous-buoy" => Some((1400, vec!["net-cannon"])),
        "naval-command" => Some((2500, vec!["luminous-buoy"])), // Capstone
        
        // ADMIRALTY - Storm Caller Path (Total: 5800 shards)
        "saltwater-desal" => Some((400, vec!["unlock-admiralty"])),
        "weathercock-tower" => Some((600, vec!["saltwater-desal"])),
        "weather-resistance" => Some((900, vec!["weathercock-tower"])),
        "tide-gauge" => Some((1400, vec!["weather-resistance"])),
        "tempest-call" => Some((2500, vec!["tide-gauge"])), // Capstone
        
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
    if !is_node_available(&progress.purchased_nodes, &node_id, &prerequisites) {
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
        "crossbow" => "Crossbow".to_string(),
        "metal-hatchet" => "Metal Hatchet".to_string(),
        "metal-pickaxe" => "Metal Pickaxe".to_string(),
        "lantern" => "Lantern".to_string(),
        "bush-knife" => "Bush Knife".to_string(),
        "mining-efficiency" => "Mining Efficiency".to_string(),
        
        // Tier 2
        "bone-arrow" => "Bone Arrow".to_string(),
        "fire-arrow" => "Fire Arrow".to_string(),
        "flashlight" => "Flashlight".to_string(),
        "reed-bellows" => "Reed Bellows".to_string(),
        "crafting-speed-1" => "Crafting Speed I".to_string(),
        
        // Tier 3
        "hollow-reed-arrow" => "Hollow Reed Arrow".to_string(),
        "reed-snorkel" => "Primitive Reed Snorkel".to_string(),
        "reed-fishing-rod" => "Primitive Reed Fishing Rod".to_string(),
        "reed-rain-collector" => "Reed Rain Collector".to_string(),
        "movement-speed-1" => "Movement Speed I".to_string(),
        
        // Tier 4
        "metal-door" => "Metal Door".to_string(),
        "shelter" => "Shelter".to_string(),
        "9x18mm-round" => "9x18mm Round".to_string(),
        "metal-armor" => "Metal Armor".to_string(),
        "crafting-speed-2" => "Crafting Speed II".to_string(),
        
        // Tier 5
        "makarov-pm" => "Makarov PM".to_string(),
        "combat-drone" => "Combat Drone".to_string(),
        "rain-collector" => "Advanced Rain Collector".to_string(),
        "broth-mastery" => "Broth Mastery".to_string(),
        "armor-mastery" => "Armor Mastery".to_string(),
        "movement-speed-2" => "Movement Speed II".to_string(),
        
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

/// Get the memory grid node ID required to craft a specific item
/// Returns None if the item doesn't require any memory grid unlock (always craftable)
/// 
/// ITEMS THAT ARE ALWAYS CRAFTABLE (no Memory Grid required):
/// - Camp Fire, Furnace, Sleeping Bag, Wooden Storage Box, Stash
/// - Hunting Bow, Wooden Arrow, Wooden Spear, Stone Spear
/// - Stone Hatchet, Stone Pickaxe, Torch, Rock, Blueprint
/// - Bandage, Bone Club, Bone Knife, Bone Gaff Hook
/// - Rope, Cloth, Combat Ladle, Matron's Chest
pub fn get_required_node_for_item(item_name: &str) -> Option<&'static str> {
    match item_name {
        // Tier 1 items
        "Crossbow" => Some("crossbow"),
        "Metal Hatchet" => Some("metal-hatchet"),
        "Metal Pickaxe" => Some("metal-pickaxe"),
        "Lantern" => Some("lantern"),
        "Bush Knife" => Some("bush-knife"),
        
        // Tier 2 items
        "Bone Arrow" => Some("bone-arrow"),
        "Fire Arrow" => Some("fire-arrow"),
        "Flashlight" => Some("flashlight"),
        "Reed Bellows" => Some("reed-bellows"),
        
        // Tier 3 items
        "Hollow Reed Arrow" => Some("hollow-reed-arrow"),
        "Primitive Reed Snorkel" => Some("reed-snorkel"),
        "Primitive Reed Fishing Rod" => Some("reed-fishing-rod"),
        "Reed Rain Collector" => Some("reed-rain-collector"),
        
        // Tier 4 items
        "Metal Door" => Some("metal-door"),
        "Shelter" => Some("shelter"),
        "9x18mm Round" => Some("9x18mm-round"),
        
        // Tier 5 items
        "Makarov PM" => Some("makarov-pm"),
        
        // ALWAYS CRAFTABLE - No Memory Grid requirement
        // Basic structures
        "Camp Fire" | "Furnace" | "Sleeping Bag" | "Wooden Storage Box" | 
        "Stash" | "Matron's Chest" | "Cerametal Field Cauldron Mk. II" | "Wood Door" | "Reed Water Bottle" => None,
        
        // Basic weapons
        "Hunting Bow" | "Wooden Arrow" | "Wooden Spear" | "Stone Spear" => None,
        
        // Basic tools
        "Stone Hatchet" | "Stone Pickaxe" | "Torch" | "Rock" | "Blueprint" |
        "Bandage" | "Bone Club" | "Bone Knife" | "Bone Gaff Hook" | 
        "Combat Ladle" | "Repair Hammer" => None,
        
        // Basic materials/crafting
        "Rope" | "Cloth" => None,
        
        // Default: no requirement
        _ => None,
    }
}

/// Cost in shards to reset faction choice
pub const FACTION_RESET_COST: u64 = 2000;

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
