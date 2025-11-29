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
    if node_id.starts_with("unlock-") {
        let tier5_nodes = ["makarov-pm", "broth-cauldron", "shelter", "metal-armor", "combat-drone", "rain-collector"];
        return tier5_nodes.iter().any(|tier5_node| has_node(purchased_nodes, tier5_node));
    }
    
    // FFX-style logic: Need ANY ONE prerequisite (OR logic)
    prerequisites.iter().any(|prereq| has_node(purchased_nodes, prereq))
}

/// Get the cost and prerequisites for a specific node ID
/// 
/// DESIGN PHILOSOPHY:
/// - Basic survival items (campfire, furnace, sleeping bag, storage box, etc.) are FREE
/// - Memory Grid gates MID to LATE game items and PASSIVE BONUSES
/// - Rescaled for fast, fun gameplay loop
fn get_node_info(node_id: &str) -> Option<(u64, Vec<&'static str>)> {
    match node_id {
        // Center node (free)
        "center" => Some((0, vec![])),
        
        // ============================================
        // TIER 1 - First Upgrades (60-100 shards)
        // Mid-game weapon/tool upgrades
        // ============================================
        "crossbow" => Some((80, vec!["center"])),           // Better ranged weapon
        "metal-hatchet" => Some((60, vec!["center"])),      // Better wood gathering
        "metal-pickaxe" => Some((60, vec!["center"])),      // Better stone gathering
        "lantern" => Some((50, vec!["center"])),            // Better lighting than torch
        "bush-knife" => Some((80, vec!["center"])),         // Combat/wood hybrid
        "mining-efficiency" => Some((100, vec!["center"])), // Passive: +30% yield
        
        // ============================================
        // TIER 2 - Mid-Game Items (120-200 shards)
        // ============================================
        "bone-arrow" => Some((120, vec!["crossbow", "bush-knife", "metal-hatchet"])),
        "fire-arrow" => Some((150, vec!["crossbow", "lantern", "metal-hatchet"])),
        "flashlight" => Some((140, vec!["lantern", "crossbow", "metal-pickaxe"])),
        "reed-bellows" => Some((180, vec!["metal-pickaxe", "lantern", "mining-efficiency"])),
        "crafting-speed-1" => Some((200, vec!["bush-knife", "mining-efficiency", "crossbow"])), // Passive: +15% craft speed
        
        // ============================================
        // TIER 3 - Advanced Items (250-400 shards)
        // ============================================
        "hollow-reed-arrow" => Some((250, vec!["bone-arrow", "crafting-speed-1", "fire-arrow"])),
        "reed-snorkel" => Some((280, vec!["fire-arrow", "bone-arrow", "flashlight"])),
        "reed-fishing-rod" => Some((260, vec!["flashlight", "fire-arrow", "reed-bellows"])),
        "reed-rain-collector" => Some((350, vec!["reed-bellows", "flashlight", "crafting-speed-1"])),
        "movement-speed-1" => Some((400, vec!["crafting-speed-1", "reed-bellows", "bone-arrow"])), // Passive: +10% move speed
        
        // ============================================
        // TIER 4 - Late-Game Items (450-700 shards)
        // ============================================
        "metal-door" => Some((500, vec!["hollow-reed-arrow", "movement-speed-1", "reed-snorkel"])),
        "shelter" => Some((600, vec!["reed-snorkel", "hollow-reed-arrow", "reed-fishing-rod"])),
        "9x18mm-round" => Some((550, vec!["reed-fishing-rod", "reed-snorkel", "hollow-reed-arrow"])),
        "metal-armor" => Some((700, vec!["reed-rain-collector", "hollow-reed-arrow", "movement-speed-1"])),
        "crafting-speed-2" => Some((600, vec!["movement-speed-1", "reed-rain-collector", "hollow-reed-arrow"])), // Passive: +25% craft speed
        
        // ============================================
        // TIER 5 - End-Game Items (800-1000 shards)
        // ============================================
        "makarov-pm" => Some((900, vec!["metal-door", "crafting-speed-2", "shelter"])),
        "combat-drone" => Some((950, vec!["shelter", "metal-door", "9x18mm-round"])),
        "rain-collector" => Some((800, vec!["9x18mm-round", "shelter", "metal-armor"])), // Advanced rain collector upgrade
        "broth-mastery" => Some((850, vec!["metal-armor", "9x18mm-round", "shelter"])), // Passive: broths last 50% longer
        "armor-mastery" => Some((900, vec!["metal-armor", "shelter", "crafting-speed-2"])), // Passive: armor durability +30%
        "movement-speed-2" => Some((1000, vec!["crafting-speed-2", "metal-armor", "metal-door"])), // Passive: +20% move speed
        
        // ============================================
        // FACTION UNLOCK NODES (600 shards each)
        // Requires ANY Tier 5 node
        // ============================================
        "unlock-black-wolves" => Some((600, vec!["makarov-pm", "combat-drone", "rain-collector", "broth-mastery", "armor-mastery", "movement-speed-2"])),
        "unlock-hive" => Some((600, vec!["makarov-pm", "combat-drone", "rain-collector", "broth-mastery", "armor-mastery", "movement-speed-2"])),
        "unlock-university" => Some((600, vec!["makarov-pm", "combat-drone", "rain-collector", "broth-mastery", "armor-mastery", "movement-speed-2"])),
        "unlock-data-angels" => Some((600, vec!["makarov-pm", "combat-drone", "rain-collector", "broth-mastery", "armor-mastery", "movement-speed-2"])),
        "unlock-battalion" => Some((600, vec!["makarov-pm", "combat-drone", "rain-collector", "broth-mastery", "armor-mastery", "movement-speed-2"])),
        "unlock-admiralty" => Some((600, vec!["makarov-pm", "combat-drone", "rain-collector", "broth-mastery", "armor-mastery", "movement-speed-2"])),
        
        // ============================================
        // FACTION BRANCHES (400-2000 shards per node)
        // ============================================
        
        // BLACK WOLVES - Berserker Path
        "riot-vest" => Some((400, vec!["unlock-black-wolves"])),
        "shock-pike" => Some((600, vec!["riot-vest"])),
        "slab-shield" => Some((800, vec!["shock-pike"])),
        "flash-hammer" => Some((1200, vec!["slab-shield"])),
        "adrenal-surge" => Some((2000, vec!["flash-hammer"])),
        
        // BLACK WOLVES - Assassin Path
        "combat-stims" => Some((400, vec!["unlock-black-wolves"])),
        "suppressor-rig" => Some((600, vec!["combat-stims"])),
        "grav-boots" => Some((800, vec!["suppressor-rig"])),
        "field-interrogator" => Some((1200, vec!["grav-boots"])),
        "armor-durability" => Some((2000, vec!["field-interrogator"])),
        
        // HIVE - Industrialist Path
        "spore-grain-vat" => Some((400, vec!["unlock-hive"])),
        "slime-furnace" => Some((600, vec!["spore-grain-vat"])),
        "chameleon-harness" => Some((800, vec!["slime-furnace"])),
        "mealworm-factory" => Some((1200, vec!["chameleon-harness"])),
        "crafting-speed-hive" => Some((2000, vec!["mealworm-factory"])),
        
        // HIVE - Toxicologist Path
        "venom-knife" => Some((400, vec!["unlock-hive"])),
        "poison-resistance" => Some((600, vec!["venom-knife"])),
        "acid-sprayer" => Some((800, vec!["poison-resistance"])),
        "toxic-coating" => Some((1200, vec!["acid-sprayer"])),
        "toxic-bloom" => Some((2000, vec!["toxic-coating"])),
        
        // UNIVERSITY - Engineer Path
        "auto-turret" => Some((400, vec!["unlock-university"])),
        "scanner-drone" => Some((600, vec!["auto-turret"])),
        "repair-swarm" => Some((800, vec!["scanner-drone"])),
        "stabilizer-field" => Some((1200, vec!["repair-swarm"])),
        "fabricator-burst" => Some((2000, vec!["stabilizer-field"])),
        
        // UNIVERSITY - Scholar Path
        "logic-furnace" => Some((400, vec!["unlock-university"])),
        "bioprinter-table" => Some((600, vec!["logic-furnace"])),
        "geneforge-vat" => Some((800, vec!["bioprinter-table"])),
        "mining-yield-ii" => Some((1200, vec!["geneforge-vat"])),
        "crafting-speed-uni" => Some((2000, vec!["mining-yield-ii"])),
        
        // DATA ANGELS - Netrunner Path
        "jammer-tower" => Some((400, vec!["unlock-data-angels"])),
        "ghost-uplink" => Some((600, vec!["jammer-tower"])),
        "neurochef-decryptor" => Some((800, vec!["ghost-uplink"])),
        "drone-hijack" => Some((1200, vec!["neurochef-decryptor"])),
        "hacking-speed" => Some((2000, vec!["drone-hijack"])),
        
        // DATA ANGELS - Phantom Path
        "backdoor-cloak" => Some((400, vec!["unlock-data-angels"])),
        "signal-scrubber" => Some((600, vec!["backdoor-cloak"])),
        "memory-leech" => Some((800, vec!["signal-scrubber"])),
        "movement-speed-da" => Some((1200, vec!["memory-leech"])),
        "overclock" => Some((2000, vec!["movement-speed-da"])),
        
        // BATTALION - Colonel Path
        "battalion-smg" => Some((400, vec!["unlock-battalion"])),
        "mortar-nest" => Some((600, vec!["battalion-smg"])),
        "fragment-armor" => Some((800, vec!["mortar-nest"])),
        "ammo-press" => Some((1200, vec!["fragment-armor"])),
        "ranged-damage" => Some((2000, vec!["ammo-press"])),
        
        // BATTALION - Tactician Path
        "tactical-optics" => Some((400, vec!["unlock-battalion"])),
        "supply-cache" => Some((600, vec!["tactical-optics"])),
        "field-ration-kit" => Some((800, vec!["supply-cache"])),
        "max-hp" => Some((1200, vec!["field-ration-kit"])),
        "rally-cry" => Some((2000, vec!["max-hp"])),
        
        // ADMIRALTY - Captain Path
        "tide-beacon" => Some((400, vec!["unlock-admiralty"])),
        "storm-sail-raft" => Some((600, vec!["tide-beacon"])),
        "net-cannon" => Some((800, vec!["storm-sail-raft"])),
        "luminous-buoy" => Some((1200, vec!["net-cannon"])),
        "naval-command" => Some((2000, vec!["luminous-buoy"])),
        
        // ADMIRALTY - Storm Caller Path
        "saltwater-desal" => Some((400, vec!["unlock-admiralty"])),
        "weathercock-tower" => Some((600, vec!["saltwater-desal"])),
        "weather-resistance" => Some((800, vec!["weathercock-tower"])),
        "tide-gauge" => Some((1200, vec!["weather-resistance"])),
        "tempest-call" => Some((2000, vec!["tide-gauge"])),
        
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
