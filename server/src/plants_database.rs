use spacetimedb::SpacetimeType;
use std::collections::HashMap;
use lazy_static::lazy_static;
use crate::world_state::Season;

// --- Plant Type Enum ---

#[derive(SpacetimeType, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum PlantType {
    // === BASIC CROPS (Cold-hardy varieties that could survive short Aleutian growing season) ===
    BorealNettle, // Fiber plant - cold hardy
    Potato,       // Cold-hardy variety - historically grown in northern climates
    Pumpkin,      // Some cold-hardy varieties exist
    Reed,         // Wetland grass
    BeachLymeGrass, // Native coastal grass
    
    // === VEGETABLES & ROOT CROPS (Cold-hardy varieties) ===
    Carrot,       // Cold-hardy root crop
    Beets,        // Cold-hardy root crop
    Horseradish,  // Extremely cold-hardy perennial - single best root crop for Aleutian Islands
    Corn,         // Cold-hardy variety - grows near water sources
    Cabbage,      // Cold-hardy leafy vegetable - excellent for northern climates
    Fennel,       // Cool-season crop - bulb, seeds, and fronds all edible (NOT perennial in Aleutians)
    KamchatkaLily, // Native bulb plant - the bulb is both food and seed (like Horseradish Root)
    WildCelery,    // Angelica lucida - important traditional Aleut food, stems and seeds edible
    Silverweed,    // Argentina anserina - starchy coastal root, can be ground to flour
    Nagoonberry,   // Rubus arcticus - Arctic raspberry, prized berry
    AlpineBistort, // Bistorta vivipara - starchy bulbils, alpine plant
    
    // === HERBS & MEDICINAL PLANTS (Arctic/Subarctic species) ===
    Chicory,      // Cold-hardy perennial herb
    Yarrow,       // Native to cold climates, medicinal
    Chamomile,    // Some cold-hardy varieties
    Mint,         // Cold-hardy perennial
    Valerian,     // Cold-climate medicinal plant
    Mugwort,      // Hardy perennial, grows in harsh conditions
    BearGarlic,   // Wild cold-climate relative of garlic
    SiberianGinseng, // Cold-climate adaptogen
    Dogbane,      // Fiber plant, cold-hardy
    BogCotton,    // Native wetland plant
    Flax,         // Cold-hardy fiber crop
    Salsify,      // Cold-hardy root vegetable
    
    // === NEW: ARCTIC/SUBARCTIC PLANTS (Botanically accurate for Aleutian Islands) ===
    ScurvyGrass,  // Cochlearia - Arctic vitamin C source, grows year-round
    Crowberry,    // Empetrum - Low-growing subarctic berry, persists in winter (TUNDRA)
    SeaPlantain,  // Plantago maritima - Maritime plant, leaves available year-round
    Glasswort,    // Salicornia - Salt-tolerant maritime succulent
    Fireweed,        // Chamerion angustifolium - Common tundra plant with edible shoots
    // === NEW: ALPINE-SPECIFIC PLANTS ===
    ArcticPoppy,  // Papaver - Alpine flower, year-round in harsh conditions
    
    // === MUSHROOMS (Can grow in cold, humid maritime conditions) ===
    Chanterelle,
    Porcini,
    FlyAgaric,
    ShaggyInkCap,
    DeadlyWebcap,
    DestroyingAngel,
    
    // === BERRIES (Native to subarctic/boreal regions) ===
    Lingonberries,    // Native to subarctic
    Cloudberries,     // Native to subarctic bogs
    Bilberries,       // Cold-climate blueberry relative
    WildStrawberries, // Cold-hardy wild variety
    RowanBerries,     // Mountain ash - cold-hardy tree berries
    Cranberries,      // Bog plant, cold-hardy
    
    // === TOXIC/MEDICINAL (Some grow in harsh northern climates) ===
    Mandrake,
    Belladonna,
    Henbane,
    Datura,
    Wolfsbane,
    
    // === OTHER ===
    Sunflowers, // Some cold-hardy varieties exist
    
    // === TECHNOLOGICAL DEBRIS ===
    MemoryShard, // Crashed ship cognitive archive debris
    
    // === UNDERWATER PLANTS (Require snorkeling to harvest) ===
    SeaweedBed, // Underwater seaweed - requires diving to harvest
    
    // === RESOURCE PILES (Small bonus resources scattered in world) ===
    WoodPile,       // Small pile of wood - general terrain
    BeachWoodPile,  // Driftwood pile - beaches only
    StonePile,      // Small pile of stones - general terrain
    LeavesPile,     // Pile of fallen leaves - forest only, gives plant fiber
    MetalOrePile,   // Pile of metal ore - alpine/quarry areas only, rare
    SulfurPile,     // Pile of sulfur deposits - alpine/volcanic areas only, rare
    CharcoalPile,   // Pile of charcoal - forest areas (old burn sites), rare
    SoggyPlantFiberPile, // Storm debris - spawns when plants are destroyed by heavy storms
    BonePile,           // Pile of bone fragments - whale bone graveyard monument only
    
    // === TREE SAPLINGS (Planted trees that grow into actual Tree entities) ===
    ConiferSapling,     // Planted from Pinecone - grows into a conifer tree
    DeciduousSapling,   // Planted from Birch Catkin - grows into a deciduous tree
    CrabAppleSapling,   // Planted from Crab Apple Seeds - grows into a crab apple tree
    HazelnutSapling,    // Planted from Hazelnut - grows into a hazelnut tree
    RowanberrySapling,  // Planted from Rowan Seeds - grows into a rowanberry tree
    OliveSapling,       // Planted from Olive Seed - grows into an olive tree
}

// --- Plant Configuration System ---

#[derive(Clone, Debug)]
pub struct PlantConfig {
    // Identity
    pub entity_name: String, // The actual entity/resource name used in game
    
    // Spawning
    pub density_percent: f32,
    pub min_distance_sq: f32,
    pub min_tree_distance_sq: f32,
    pub min_stone_distance_sq: f32,
    pub noise_threshold: f32,
    
    // Yields
    pub primary_yield: (String, u32, u32), // (item_name, min_amount, max_amount)
    pub secondary_yield: Option<(String, u32, u32, f32)>, // (item_name, min, max, chance)
    
    // Seeds
    pub seed_type: String,
    pub seed_drop_chance: f32,
    
    // Respawn timing (base values - modified by seasonal multiplier for wild plants)
    pub min_respawn_time_secs: u64,
    pub max_respawn_time_secs: u64,
    
    // Spawn conditions
    pub spawn_condition: SpawnCondition,
    
    // Seasonal growth
    pub growing_seasons: Vec<Season>, // Which seasons this plant can grow in
}

#[derive(Clone, Debug)]
pub enum SpawnCondition {
    Forest,      // Near trees (mushrooms)
    Plains,      // Away from trees/stones (hemp)
    NearWater,   // Close to water/sand (corn)
    Clearings,   // Dirt roads, clearings (potato)
    Coastal,     // Beach, riverside (pumpkin)
    InlandWater, // Along inland water (reed)
    Tundra,      // Tundra biome only (arctic plants)
    Alpine,      // Alpine biome only (mountain plants)
    Underwater,  // Underwater only - requires snorkeling to harvest (seaweed)
}

// --- Plant Configuration Database ---

lazy_static! {
    pub static ref PLANT_CONFIGS: HashMap<PlantType, PlantConfig> = {
        let mut configs = HashMap::new();
        
        // === NEW ARCTIC/SUBARCTIC PLANTS ===
        configs.insert(PlantType::ScurvyGrass, PlantConfig {
            entity_name: "Scurvy Grass".to_string(),
            density_percent: 0.00009375, // REDUCED 16x: was 0.0015 (375 plants) → now ~23 plants
            min_distance_sq: 25.0 * 25.0,
            min_tree_distance_sq: 15.0 * 15.0,
            min_stone_distance_sq: 20.0 * 20.0,
            noise_threshold: 0.60,
            primary_yield: ("Scurvy Grass".to_string(), 1, 3),
            secondary_yield: None,
            seed_type: "Scurvy Grass Seeds".to_string(),
            seed_drop_chance: 0.80, // Standardized 80% - farming sustainability ensured
            min_respawn_time_secs: 480,  // 8 minutes
            max_respawn_time_secs: 720,  // 12 minutes
            spawn_condition: SpawnCondition::Coastal, // Grows near shores
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Year-round Arctic plant
        });
        
        configs.insert(PlantType::BorealNettle, PlantConfig {
            entity_name: "Boreal Nettle".to_string(),
            density_percent: 0.0020, // INCREASED further for plains visibility: ~500 plants (PRIMARY FIBER SOURCE)
            min_distance_sq: 30.0 * 30.0, // Reduced spacing for better coverage
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 20.0 * 20.0,
            noise_threshold: 0.60, // LOWERED for easier spawning in plains
            primary_yield: ("Plant Fiber".to_string(), 40, 50),
            secondary_yield: Some(("Nettle Leaves".to_string(), 1, 3, 0.80)),
            seed_type: "Nettle Seeds".to_string(),
            seed_drop_chance: 0.80, // Standardized 80% - farming sustainability ensured
            min_respawn_time_secs: 600,  // 10 minutes
            max_respawn_time_secs: 900,  // 15 minutes
            spawn_condition: SpawnCondition::Plains,
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Extremely hardy - dried stalks and roots available year-round
        });
        

        configs.insert(PlantType::Potato, PlantConfig {
            entity_name: "Potato".to_string(),
            density_percent: 0.0006,
            min_distance_sq: 35.0 * 35.0,
            min_tree_distance_sq: 18.0 * 18.0,
            min_stone_distance_sq: 22.0 * 22.0,
            noise_threshold: 0.65,
            primary_yield: ("Potato".to_string(), 1, 2),
            secondary_yield: Some(("Plant Fiber".to_string(), 1, 3, 0.80)),
            seed_type: "Potato".to_string(), // Plant potatoes to grow potatoes (realistic)
            seed_drop_chance: 0.0, // No seed drops - the food IS the seed (you don't get seeds from eating potatoes)
            min_respawn_time_secs: 900,  // 15 minutes
            max_respawn_time_secs: 1800, // 30 minutes
            spawn_condition: SpawnCondition::Clearings,
            growing_seasons: vec![Season::Spring, Season::Autumn], // Cool weather crop
        });
        
        configs.insert(PlantType::Pumpkin, PlantConfig {
            entity_name: "Pumpkin".to_string(),
            density_percent: 0.0004,
            min_distance_sq: 40.0 * 40.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.67,
            primary_yield: ("Pumpkin".to_string(), 1, 1),
            secondary_yield: Some(("Plant Fiber".to_string(), 3, 5, 0.85)),
            seed_type: "Pumpkin Seeds".to_string(),
            seed_drop_chance: 0.80, // Standardized 80% - farming sustainability ensured
            min_respawn_time_secs: 1200, // 20 minutes
            max_respawn_time_secs: 1800, // 30 minutes
            spawn_condition: SpawnCondition::Coastal,
            growing_seasons: vec![Season::Summer, Season::Autumn], // Long growing season
        });
        
        configs.insert(PlantType::Reed, PlantConfig {
            entity_name: "Common Reed Stalk".to_string(),
            density_percent: 0.0018, // INCREASED 1.5x: was 0.0012 (~300 plants) → now ~450 plants (MORE RIVER REEDS)
            min_distance_sq: 25.0 * 25.0,
            min_tree_distance_sq: 15.0 * 15.0,
            min_stone_distance_sq: 20.0 * 20.0,
            noise_threshold: 0.58,
            primary_yield: ("Common Reed Stalk".to_string(), 2, 4),
            secondary_yield: Some(("Plant Fiber".to_string(), 1, 3, 0.75)),
            seed_type: "Reed Rhizome".to_string(),
            seed_drop_chance: 0.80, // Standardized 80% - farming sustainability ensured
            min_respawn_time_secs: 600,  // 10 minutes
            max_respawn_time_secs: 900,  // 15 minutes
            spawn_condition: SpawnCondition::InlandWater,
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn], // Hardy water plant
        });
        
        configs.insert(PlantType::BeachLymeGrass, PlantConfig {
            entity_name: "Beach Lyme Grass".to_string(),
            density_percent: 0.00375, // TRIPLED for tutorial: was 0.00125 (~313 plants) → now ~939 plants (essential for tutorial quest fiber)
            min_distance_sq: 30.0 * 30.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.65,
            primary_yield: ("Plant Fiber".to_string(), 15, 15), // Fixed 15 fiber
            secondary_yield: None,
            seed_type: "Beach Lyme Grass Seeds".to_string(), // Can be planted from seeds
            seed_drop_chance: 0.80, // Standardized 80% - farming sustainability ensured
            min_respawn_time_secs: 480,  // 8 minutes
            max_respawn_time_secs: 720,  // 12 minutes
            spawn_condition: SpawnCondition::Coastal, // Spawns on beach tiles
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Extremely hardy coastal grass
        });
        
        configs.insert(PlantType::Crowberry, PlantConfig {
            entity_name: "Crowberry".to_string(),
            density_percent: 0.002, // INCREASED 27x: was 0.000075 (~19 plants) → now ~500 plants
            min_distance_sq: 30.0 * 30.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.62,
            primary_yield: ("Crowberry".to_string(), 3, 6),
            secondary_yield: None,
            seed_type: "Crowberry Seeds".to_string(),
            seed_drop_chance: 0.80, // Standardized 80% - farming sustainability ensured
            min_respawn_time_secs: 1200, // 20 minutes
            max_respawn_time_secs: 1800, // 30 minutes
            spawn_condition: SpawnCondition::Tundra, // Low-growing arctic shrub - TUNDRA ONLY
            growing_seasons: vec![Season::Summer, Season::Autumn, Season::Winter], // Berries persist into winter
        });
        
        configs.insert(PlantType::Fireweed, PlantConfig {
            entity_name: "Fireweed".to_string(),
            density_percent: 0.0015, // Moderate density (~375 plants across tundra)
            min_distance_sq: 35.0 * 35.0,
            min_tree_distance_sq: 25.0 * 25.0,
            min_stone_distance_sq: 20.0 * 20.0,
            noise_threshold: 0.60,
            primary_yield: ("Plant Fiber".to_string(), 2, 4), // Fireweed stalks provide fiber
            secondary_yield: Some(("Fireweed Shoots".to_string(), 1, 3, 0.70)), // 70% chance for edible shoots
            seed_type: "Fireweed Seeds".to_string(),
            seed_drop_chance: 0.80, // Standardized 80% - farming sustainability ensured
            min_respawn_time_secs: 900, // 15 minutes
            max_respawn_time_secs: 1500, // 25 minutes
            spawn_condition: SpawnCondition::Tundra, // Tundra and TundraGrass only
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn], // Grows in warmer seasons
        });
        
        // === NEW: ALPINE-SPECIFIC PLANTS ===
        configs.insert(PlantType::ArcticPoppy, PlantConfig {
            entity_name: "Arctic Poppy".to_string(),
            density_percent: 0.0006, // Rare alpine flower (~150 plants across Alpine)
            min_distance_sq: 50.0 * 50.0,
            min_tree_distance_sq: 40.0 * 40.0,
            min_stone_distance_sq: 30.0 * 30.0,
            noise_threshold: 0.70,
            primary_yield: ("Arctic Poppy".to_string(), 1, 2),
            secondary_yield: None,
            seed_type: "Arctic Poppy Seeds".to_string(),
            seed_drop_chance: 0.80, // 50% chance - alpine flower
            min_respawn_time_secs: 2000, // 33 minutes
            max_respawn_time_secs: 3000, // 50 minutes
            spawn_condition: SpawnCondition::Alpine, // Alpine biome only
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Year-round - extremely hardy alpine flower
        });
        
        // === VEGETABLES ===
        
        configs.insert(PlantType::Carrot, PlantConfig {
            entity_name: "Carrot".to_string(),
            density_percent: 0.0006,
            min_distance_sq: 30.0 * 30.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.66,
            primary_yield: ("Carrot".to_string(), 1, 3),
            secondary_yield: None,
            seed_type: "Carrot Seeds".to_string(),
            seed_drop_chance: 0.80, // 75% chance - common food crop must be sustainable
            min_respawn_time_secs: 900,  // 15 minutes
            max_respawn_time_secs: 1500, // 25 minutes
            spawn_condition: SpawnCondition::Clearings,
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn],
        });
        
        configs.insert(PlantType::SeaPlantain, PlantConfig {
            entity_name: "Sea Plantain".to_string(),
            density_percent: 0.0001125, // REDUCED 16x: was 0.0018 (450 plants) → now ~28 plants
            min_distance_sq: 20.0 * 20.0,
            min_tree_distance_sq: 15.0 * 15.0,
            min_stone_distance_sq: 18.0 * 18.0,
            noise_threshold: 0.58,
            primary_yield: ("Sea Plantain".to_string(), 2, 4),
            secondary_yield: None,
            seed_type: "Sea Plantain Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - maritime plant must be sustainable
            min_respawn_time_secs: 600,  // 10 minutes
            max_respawn_time_secs: 900,  // 15 minutes
            spawn_condition: SpawnCondition::Coastal, // Maritime plant grows near shores
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Year-round leaves
        });
        
        configs.insert(PlantType::Glasswort, PlantConfig {
            entity_name: "Glasswort".to_string(),
            density_percent: 0.0000875, // REDUCED 16x: was 0.0014 (350 plants) → now ~22 plants
            min_distance_sq: 25.0 * 25.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 15.0 * 15.0,
            noise_threshold: 0.62,
            primary_yield: ("Glasswort".to_string(), 2, 5),
            secondary_yield: None,
            seed_type: "Glasswort Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - salt-tolerant succulent must be sustainable
            min_respawn_time_secs: 800,  // 13 minutes
            max_respawn_time_secs: 1200, // 20 minutes
            spawn_condition: SpawnCondition::Coastal, // Salt-tolerant, grows in maritime areas
            growing_seasons: vec![Season::Summer, Season::Autumn], // Warm season succulent
        });
        
        configs.insert(PlantType::Beets, PlantConfig {
            entity_name: "Beets".to_string(),
            density_percent: 0.0007,
            min_distance_sq: 32.0 * 32.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.66,
            primary_yield: ("Beet".to_string(), 1, 2),
            secondary_yield: None,
            seed_type: "Beet Seeds".to_string(),
            seed_drop_chance: 0.80, // 70% chance - important food crop must be sustainable
            min_respawn_time_secs: 1000, // 16 minutes
            max_respawn_time_secs: 1400, // 23 minutes
            spawn_condition: SpawnCondition::Clearings,
            growing_seasons: vec![Season::Summer, Season::Autumn],
        });
        
        configs.insert(PlantType::Horseradish, PlantConfig {
            entity_name: "Horseradish".to_string(),
            density_percent: 0.0003,
            min_distance_sq: 40.0 * 40.0,
            min_tree_distance_sq: 25.0 * 25.0,
            min_stone_distance_sq: 30.0 * 30.0,
            noise_threshold: 0.70,
            primary_yield: ("Horseradish Root".to_string(), 1, 1),
            secondary_yield: None,
            seed_type: "Horseradish Root".to_string(), // The root IS the seed
            seed_drop_chance: 0.0, // No seed drops - the food IS the seed (you don't get seeds from eating roots)
            min_respawn_time_secs: 2000, // 33 minutes
            max_respawn_time_secs: 3000, // 50 minutes
            spawn_condition: SpawnCondition::NearWater,
            growing_seasons: vec![Season::Autumn],
        });
        
        configs.insert(PlantType::Corn, PlantConfig {
            entity_name: "Corn".to_string(),
            density_percent: 0.0005, // ~125 plants - moderate density
            min_distance_sq: 35.0 * 35.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.65,
            primary_yield: ("Raw Corn".to_string(), 1, 3), // 1-3 corn per harvest
            secondary_yield: Some(("Plant Fiber".to_string(), 2, 4, 0.70)), // 70% chance for fiber from stalks
            seed_type: "Corn Seeds".to_string(),
            seed_drop_chance: 0.80, // 70% chance - important food crop must be sustainable
            min_respawn_time_secs: 1200, // 20 minutes
            max_respawn_time_secs: 1800, // 30 minutes
            spawn_condition: SpawnCondition::NearWater, // Corn needs water nearby
            growing_seasons: vec![Season::Summer, Season::Autumn], // Warm season crop
        });
        
        configs.insert(PlantType::Cabbage, PlantConfig {
            entity_name: "Cabbage".to_string(),
            density_percent: 0.0007, // Moderate density (~175 plants)
            min_distance_sq: 35.0 * 35.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.65,
            primary_yield: ("Cabbage".to_string(), 1, 2), // 1-2 cabbages per harvest
            secondary_yield: Some(("Plant Fiber".to_string(), 1, 2, 0.60)), // 60% chance for outer leaves as fiber
            seed_type: "Cabbage Seeds".to_string(),
            seed_drop_chance: 0.80, // Standardized 80% - farming sustainability ensured
            min_respawn_time_secs: 900, // 15 minutes
            max_respawn_time_secs: 1500, // 25 minutes
            spawn_condition: SpawnCondition::Clearings, // Similar to potatoes - needs open areas
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn], // Cool to warm season crop
        });
        
        configs.insert(PlantType::Fennel, PlantConfig {
            entity_name: "Fennel".to_string(),
            density_percent: 0.0005, // Moderate density (~125 plants)
            min_distance_sq: 35.0 * 35.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.66,
            primary_yield: ("Fennel".to_string(), 1, 2), // 1-2 fennel bulbs per harvest
            secondary_yield: Some(("Fennel Fronds".to_string(), 2, 4, 0.75)), // 75% chance for feathery leaves
            seed_type: "Fennel Seeds".to_string(),
            seed_drop_chance: 0.80, // Standardized 80% - farming sustainability ensured
            min_respawn_time_secs: 1000, // ~17 minutes
            max_respawn_time_secs: 1600, // ~27 minutes
            spawn_condition: SpawnCondition::Clearings, // Similar to other vegetables - needs open areas
            growing_seasons: vec![Season::Spring, Season::Summer], // Cool-season crop - NOT perennial in Aleutians, frost-sensitive
        });
        
        configs.insert(PlantType::KamchatkaLily, PlantConfig {
            entity_name: "Kamchatka Lily".to_string(),
            density_percent: 0.0004, // Moderate-rare density (~100 plants)
            min_distance_sq: 40.0 * 40.0,
            min_tree_distance_sq: 25.0 * 25.0,
            min_stone_distance_sq: 30.0 * 30.0,
            noise_threshold: 0.68,
            primary_yield: ("Kamchatka Lily Bulb".to_string(), 1, 2), // 1-2 bulbs per harvest
            secondary_yield: None,
            seed_type: "Kamchatka Lily Bulb".to_string(), // The bulb IS the seed (like Horseradish Root)
            seed_drop_chance: 0.0, // No seed drops - the food IS the seed (you don't get seeds from eating bulbs)
            min_respawn_time_secs: 1200, // 20 minutes
            max_respawn_time_secs: 1800, // 30 minutes
            spawn_condition: SpawnCondition::Forest, // Native to forest edges and meadows
            growing_seasons: vec![Season::Spring, Season::Summer], // Spring bloomer, goes dormant in cold
        });
        
        configs.insert(PlantType::WildCelery, PlantConfig {
            entity_name: "Wild Celery".to_string(),
            density_percent: 0.0005, // Moderate density (~125 plants)
            min_distance_sq: 35.0 * 35.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.65,
            primary_yield: ("Wild Celery Stalks".to_string(), 2, 4), // Edible stems
            secondary_yield: Some(("Angelica Seeds".to_string(), 1, 3, 0.60)), // Seeds can be ground to flour
            seed_type: "Angelica Seeds".to_string(),
            seed_drop_chance: 0.80,
            min_respawn_time_secs: 1000, // ~17 minutes
            max_respawn_time_secs: 1500, // ~25 minutes
            spawn_condition: SpawnCondition::NearWater, // Grows along streams and coastal meadows
            growing_seasons: vec![Season::Spring, Season::Summer],
        });
        
        configs.insert(PlantType::Silverweed, PlantConfig {
            entity_name: "Silverweed".to_string(),
            density_percent: 0.0005, // Moderate density (~125 plants)
            min_distance_sq: 30.0 * 30.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.64,
            primary_yield: ("Silverweed Root".to_string(), 1, 2), // Starchy root - can be ground to flour
            secondary_yield: None,
            seed_type: "Silverweed Root".to_string(), // Spreads by stolons - root IS the seed
            seed_drop_chance: 0.0, // No seed drops - the food IS the seed
            min_respawn_time_secs: 1100, // ~18 minutes
            max_respawn_time_secs: 1700, // ~28 minutes
            spawn_condition: SpawnCondition::Alpine, // Alpine tundra plant
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Year-round hardy alpine plant
        });
        
        configs.insert(PlantType::Nagoonberry, PlantConfig {
            entity_name: "Nagoonberry".to_string(),
            density_percent: 0.0004, // Moderate-rare density (~100 plants)
            min_distance_sq: 35.0 * 35.0,
            min_tree_distance_sq: 25.0 * 25.0,
            min_stone_distance_sq: 30.0 * 30.0,
            noise_threshold: 0.68,
            primary_yield: ("Nagoonberries".to_string(), 2, 4), // Prized Arctic berries
            secondary_yield: None,
            seed_type: "Nagoonberry Seeds".to_string(),
            seed_drop_chance: 0.80,
            min_respawn_time_secs: 1200, // 20 minutes
            max_respawn_time_secs: 1800, // 30 minutes
            spawn_condition: SpawnCondition::Forest, // Wet meadows and forest edges
            growing_seasons: vec![Season::Spring, Season::Summer],
        });
        
        configs.insert(PlantType::AlpineBistort, PlantConfig {
            entity_name: "Alpine Bistort".to_string(),
            density_percent: 0.0004, // Moderate-rare density (~100 plants)
            min_distance_sq: 35.0 * 35.0,
            min_tree_distance_sq: 30.0 * 30.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.70,
            primary_yield: ("Bistort Bulbils".to_string(), 2, 5), // Tiny starchy bulbils - unique propagation
            secondary_yield: None,
            seed_type: "Bistort Bulbils".to_string(), // Bulbils ARE the seed (viviparous plant)
            seed_drop_chance: 0.0, // No seed drops - the food IS the seed
            min_respawn_time_secs: 1300, // ~22 minutes
            max_respawn_time_secs: 1900, // ~32 minutes
            spawn_condition: SpawnCondition::Alpine, // Alpine tundra
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Year-round hardy alpine plant
        });
        
        // === HERBS & MEDICINAL PLANTS ===
        configs.insert(PlantType::Chicory, PlantConfig {
            entity_name: "Chicory".to_string(),
            density_percent: 0.0004, // INCREASED for plains visibility: ~100 plants (visible medicinal herb)
            min_distance_sq: 22.0 * 22.0, // Reduced spacing
            min_tree_distance_sq: 15.0 * 15.0,
            min_stone_distance_sq: 20.0 * 20.0,
            noise_threshold: 0.58, // LOWERED for easier spawning
            primary_yield: ("Chicory".to_string(), 2, 4),
            secondary_yield: None,
            seed_type: "Chicory Seeds".to_string(),
            seed_drop_chance: 0.80, // 55% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 600,  // 10 minutes
            max_respawn_time_secs: 1000, // 16 minutes
            spawn_condition: SpawnCondition::Plains,
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Deep taproot survives year-round - roots sweeter after frost
        });
        
        configs.insert(PlantType::Yarrow, PlantConfig {
            entity_name: "Yarrow".to_string(),
            density_percent: 0.0006, // INCREASED for plains visibility: ~150 plants (visible medicinal herb)
            min_distance_sq: 18.0 * 18.0, // Reduced spacing
            min_tree_distance_sq: 15.0 * 15.0,
            min_stone_distance_sq: 18.0 * 18.0,
            noise_threshold: 0.56, // LOWERED for easier spawning
            primary_yield: ("Yarrow".to_string(), 1, 3),
            secondary_yield: None,
            seed_type: "Yarrow Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 800,  // 13 minutes
            max_respawn_time_secs: 1200, // 20 minutes
            spawn_condition: SpawnCondition::Plains,
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Persistent dried stalks and roots year-round
        });
        
        configs.insert(PlantType::Chamomile, PlantConfig {
            entity_name: "Chamomile".to_string(),
            density_percent: 0.0005, // INCREASED for plains visibility: ~125 plants (visible medicinal herb)
            min_distance_sq: 20.0 * 20.0, // Reduced spacing
            min_tree_distance_sq: 18.0 * 18.0,
            min_stone_distance_sq: 20.0 * 20.0,
            noise_threshold: 0.58, // LOWERED for easier spawning
            primary_yield: ("Chamomile".to_string(), 2, 4),
            secondary_yield: None,
            seed_type: "Chamomile Seeds".to_string(),
            seed_drop_chance: 0.80, // 60% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 600,  // 10 minutes
            max_respawn_time_secs: 900,  // 15 minutes
            spawn_condition: SpawnCondition::Plains,
            growing_seasons: vec![Season::Spring, Season::Summer],
        });
        
        configs.insert(PlantType::Mint, PlantConfig {
            entity_name: "Mint".to_string(),
            density_percent: 0.000125, // REDUCED 16x: was 0.0020 (500 plants) → now ~31 plants
            min_distance_sq: 18.0 * 18.0,
            min_tree_distance_sq: 12.0 * 12.0,
            min_stone_distance_sq: 15.0 * 15.0,
            noise_threshold: 0.58,
            primary_yield: ("Mint Leaves".to_string(), 3, 5),
            secondary_yield: None,
            seed_type: "Mint Cuttings".to_string(),
            seed_drop_chance: 0.80, // 75% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 400,  // 6 minutes (fast spreading)
            max_respawn_time_secs: 700,  // 11 minutes
            spawn_condition: SpawnCondition::NearWater,
            growing_seasons: vec![Season::Spring, Season::Summer],
        });
        
        configs.insert(PlantType::Valerian, PlantConfig {
            entity_name: "Valerian".to_string(),
            density_percent: 0.0002, // REDUCED 4x: was 0.0008 (200 plants) → now ~50 plants (MEDICINAL - less clutter)
            min_distance_sq: 30.0 * 30.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.66,
            primary_yield: ("Valerian Root".to_string(), 1, 2),
            secondary_yield: Some(("Valerian Leaves".to_string(), 2, 3, 0.75)),
            seed_type: "Valerian Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 1200, // 20 minutes
            max_respawn_time_secs: 1800, // 30 minutes
            spawn_condition: SpawnCondition::NearWater,
            growing_seasons: vec![Season::Spring, Season::Summer],
        });
        
        configs.insert(PlantType::Mugwort, PlantConfig {
            entity_name: "Mugwort".to_string(),
            density_percent: 0.0005, // INCREASED for plains visibility: ~125 plants (visible medicinal herb)
            min_distance_sq: 22.0 * 22.0, // Reduced spacing
            min_tree_distance_sq: 18.0 * 18.0,
            min_stone_distance_sq: 22.0 * 22.0,
            noise_threshold: 0.57, // LOWERED for easier spawning
            primary_yield: ("Mugwort".to_string(), 2, 4),
            secondary_yield: None,
            seed_type: "Mugwort Seeds".to_string(),
            seed_drop_chance: 0.80, // 55% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 700,  // 11 minutes
            max_respawn_time_secs: 1100, // 18 minutes
            spawn_condition: SpawnCondition::Plains,
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Extremely invasive - dried stalks persist year-round
        });
        
        configs.insert(PlantType::Flax, PlantConfig {
            entity_name: "Flax Plant".to_string(),
            density_percent: 0.0015, // INCREASED further for plains visibility: ~375 plants (DEDICATED FIBER CROP)
            min_distance_sq: 32.0 * 32.0, // Reduced spacing
            min_tree_distance_sq: 25.0 * 25.0,
            min_stone_distance_sq: 30.0 * 30.0,
            noise_threshold: 0.62, // LOWERED for easier spawning in plains
            primary_yield: ("Plant Fiber".to_string(), 25, 30), // Balanced between Nettle (40-50) and Beach Lyme (15)
            secondary_yield: None,
            seed_type: "Flax Seeds".to_string(),
            seed_drop_chance: 0.80, // 65% chance - important fiber crop must be sustainable
            min_respawn_time_secs: 800,  // 13 minutes - between Nettle (10-15) and Beach Lyme (8-12)
            max_respawn_time_secs: 1200, // 20 minutes
            spawn_condition: SpawnCondition::Plains,
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn],
        });
        
        configs.insert(PlantType::BearGarlic, PlantConfig {
            entity_name: "Bear Garlic".to_string(),
            density_percent: 0.0001, // REDUCED 16x: was 0.0016 (400 plants) → now ~25 plants
            min_distance_sq: 20.0 * 20.0,
            min_tree_distance_sq: 10.0 * 10.0,
            min_stone_distance_sq: 15.0 * 15.0,
            noise_threshold: 0.58,
            primary_yield: ("Bear Garlic".to_string(), 2, 4),
            secondary_yield: None,
            seed_type: "Bear Garlic".to_string(), // Same item as yield - plant garlic to grow garlic (like potatoes)
            seed_drop_chance: 0.80, // 60% chance - important food crop must be sustainable
            min_respawn_time_secs: 600,  // 10 minutes
            max_respawn_time_secs: 900,  // 15 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Underground bulbs survive winter - dried leaves too
        });
        
        configs.insert(PlantType::SiberianGinseng, PlantConfig {
            entity_name: "Siberian Ginseng".to_string(),
            density_percent: 0.0002,
            min_distance_sq: 50.0 * 50.0,
            min_tree_distance_sq: 40.0 * 40.0,
            min_stone_distance_sq: 35.0 * 35.0,
            noise_threshold: 0.75,
            primary_yield: ("Siberian Ginseng".to_string(), 1, 1),
            secondary_yield: Some(("Ginseng Leaves".to_string(), 1, 2, 0.60)),
            seed_type: "Ginseng Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important food crop must be sustainable
            min_respawn_time_secs: 3600, // 60 minutes (very rare)
            max_respawn_time_secs: 5400, // 90 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Siberian hardiness - roots harvestable year-round
        });
        
        // === TREES/BARK/FIBER ===
        configs.insert(PlantType::Dogbane, PlantConfig {
            entity_name: "Dogbane".to_string(),
            density_percent: 0.0008,
            min_distance_sq: 30.0 * 30.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.66,
            primary_yield: ("Dogbane Fiber".to_string(), 2, 4),
            secondary_yield: None,
            seed_type: "Dogbane Seeds".to_string(),
            seed_drop_chance: 0.80, // 60% chance - important fiber crop must be sustainable
            min_respawn_time_secs: 1000, // 16 minutes
            max_respawn_time_secs: 1500, // 25 minutes
            spawn_condition: SpawnCondition::Plains,
            growing_seasons: vec![Season::Summer],
        });
        
        configs.insert(PlantType::BogCotton, PlantConfig {
            entity_name: "Bog Cotton".to_string(),
            density_percent: 0.00045, // INCREASED 6x: was 0.000075 (~19 plants) → now ~113 plants (COTTON SPECIALTY FIBER)
            min_distance_sq: 25.0 * 25.0,
            min_tree_distance_sq: 15.0 * 15.0,
            min_stone_distance_sq: 20.0 * 20.0,
            noise_threshold: 0.60,
            primary_yield: ("Plant Fiber".to_string(), 3, 5),
            secondary_yield: None,
            seed_type: "Bog Cotton Seeds".to_string(),
            seed_drop_chance: 0.80, // 55% chance - important fiber crop must be sustainable
            min_respawn_time_secs: 800,  // 13 minutes
            max_respawn_time_secs: 1200, // 20 minutes
            spawn_condition: SpawnCondition::NearWater, // Bog Cotton grows in wet meadows NEAR water, not IN water
            growing_seasons: vec![Season::Summer],
        });
        
        // === MUSHROOMS ===
        configs.insert(PlantType::Chanterelle, PlantConfig {
            entity_name: "Chanterelle".to_string(),
            density_percent: 0.0006,
            min_distance_sq: 40.0 * 40.0,
            min_tree_distance_sq: 30.0 * 30.0,
            min_stone_distance_sq: 35.0 * 35.0,
            noise_threshold: 0.72,
            primary_yield: ("Chanterelle".to_string(), 1, 2),
            secondary_yield: None,
            seed_type: "Chanterelle Spores".to_string(),
            seed_drop_chance: 0.80, // 50% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 1200, // 20 minutes
            max_respawn_time_secs: 1800, // 30 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Summer, Season::Autumn],
        });
        
        configs.insert(PlantType::Porcini, PlantConfig {
            entity_name: "Porcini".to_string(),
            density_percent: 0.0004,
            min_distance_sq: 45.0 * 45.0,
            min_tree_distance_sq: 35.0 * 35.0,
            min_stone_distance_sq: 40.0 * 40.0,
            noise_threshold: 0.74,
            primary_yield: ("Porcini".to_string(), 1, 1),
            secondary_yield: None,
            seed_type: "Porcini Spores".to_string(),
            seed_drop_chance: 0.80, // 55% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 1500, // 25 minutes
            max_respawn_time_secs: 2200, // 36 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Summer, Season::Autumn],
        });
        
        configs.insert(PlantType::FlyAgaric, PlantConfig {
            entity_name: "Fly Agaric".to_string(),
            density_percent: 0.0008,
            min_distance_sq: 35.0 * 35.0,
            min_tree_distance_sq: 25.0 * 25.0,
            min_stone_distance_sq: 30.0 * 30.0,
            noise_threshold: 0.70,
            primary_yield: ("Fly Agaric".to_string(), 1, 1),
            secondary_yield: None,
            seed_type: "Fly Agaric Spores".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 1000, // 16 minutes
            max_respawn_time_secs: 1600, // 26 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Autumn],
        });
        
        configs.insert(PlantType::ShaggyInkCap, PlantConfig {
            entity_name: "Shaggy Ink Cap".to_string(),
            density_percent: 0.0010,
            min_distance_sq: 25.0 * 25.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.65,
            primary_yield: ("Shaggy Ink Cap".to_string(), 1, 2),
            secondary_yield: None,
            seed_type: "Shaggy Ink Cap Spores".to_string(),
            seed_drop_chance: 0.80, // 55% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 600,  // 10 minutes
            max_respawn_time_secs: 1000, // 16 minutes
            spawn_condition: SpawnCondition::Clearings,
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn],
        });
        
        configs.insert(PlantType::DeadlyWebcap, PlantConfig {
            entity_name: "Deadly Webcap".to_string(),
            density_percent: 0.0002,
            min_distance_sq: 60.0 * 60.0,
            min_tree_distance_sq: 50.0 * 50.0,
            min_stone_distance_sq: 45.0 * 45.0,
            noise_threshold: 0.78,
            primary_yield: ("Deadly Webcap".to_string(), 1, 1),
            secondary_yield: None,
            seed_type: "Deadly Webcap Spores".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 2400, // 40 minutes
            max_respawn_time_secs: 3600, // 60 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Autumn],
        });
        
        configs.insert(PlantType::DestroyingAngel, PlantConfig {
            entity_name: "Destroying Angel".to_string(),
            density_percent: 0.0001,
            min_distance_sq: 70.0 * 70.0,
            min_tree_distance_sq: 60.0 * 60.0,
            min_stone_distance_sq: 50.0 * 50.0,
            noise_threshold: 0.80,
            primary_yield: ("Destroying Angel".to_string(), 1, 1),
            secondary_yield: None,
            seed_type: "Destroying Angel Spores".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 3600, // 60 minutes
            max_respawn_time_secs: 5400, // 90 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Autumn],
        });
        
        // === BERRIES & NUTS ===
        configs.insert(PlantType::Lingonberries, PlantConfig {
            entity_name: "Lingonberries".to_string(),
            density_percent: 0.0012,
            min_distance_sq: 30.0 * 30.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.64,
            primary_yield: ("Lingonberries".to_string(), 3, 6),
            secondary_yield: None,
            seed_type: "Lingonberry Seeds".to_string(),
            seed_drop_chance: 0.80, // 55% chance - important food crop must be sustainable
            min_respawn_time_secs: 1800, // 30 minutes
            max_respawn_time_secs: 2600, // 43 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Summer, Season::Autumn],
        });
        
        configs.insert(PlantType::Cloudberries, PlantConfig {
            entity_name: "Cloudberries".to_string(),
            density_percent: 0.0008,
            min_distance_sq: 40.0 * 40.0,
            min_tree_distance_sq: 30.0 * 30.0,
            min_stone_distance_sq: 35.0 * 35.0,
            noise_threshold: 0.70,
            primary_yield: ("Cloudberries".to_string(), 2, 4),
            secondary_yield: None,
            seed_type: "Cloudberry Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important food crop must be sustainable
            min_respawn_time_secs: 2000, // 33 minutes
            max_respawn_time_secs: 3000, // 50 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Autumn],
        });
        
        configs.insert(PlantType::Bilberries, PlantConfig {
            entity_name: "Bilberries".to_string(),
            density_percent: 0.0015,
            min_distance_sq: 25.0 * 25.0,
            min_tree_distance_sq: 15.0 * 15.0,
            min_stone_distance_sq: 20.0 * 20.0,
            noise_threshold: 0.62,
            primary_yield: ("Bilberries".to_string(), 4, 8),
            secondary_yield: None,
            seed_type: "Bilberry Seeds".to_string(),
            seed_drop_chance: 0.80, // 60% chance - important food crop must be sustainable
            min_respawn_time_secs: 1200, // 20 minutes
            max_respawn_time_secs: 1800, // 30 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Summer],
        });
        
        configs.insert(PlantType::WildStrawberries, PlantConfig {
            entity_name: "Wild Strawberries".to_string(),
            density_percent: 0.0018,
            min_distance_sq: 20.0 * 20.0,
            min_tree_distance_sq: 12.0 * 12.0,
            min_stone_distance_sq: 15.0 * 15.0,
            noise_threshold: 0.58,
            primary_yield: ("Wild Strawberries".to_string(), 2, 5),
            secondary_yield: None,
            seed_type: "Wild Strawberries".to_string(), // Same item as yield - plant strawberries to grow strawberries (like potatoes)
            seed_drop_chance: 0.80, // 65% chance - important food crop must be sustainable
            min_respawn_time_secs: 800,  // 13 minutes
            max_respawn_time_secs: 1300, // 21 minutes
            spawn_condition: SpawnCondition::Clearings,
            growing_seasons: vec![Season::Summer],
        });
        
        // NOTE: RowanBerries removed - Rowan berries now come from RowanberryTree (like CrabAppleTree/HazelnutTree)
        // Use RowanberrySapling to plant rowan trees from Rowan Seeds
        
        configs.insert(PlantType::Cranberries, PlantConfig {
            entity_name: "Cranberries".to_string(),
            density_percent: 0.0010,
            min_distance_sq: 35.0 * 35.0,
            min_tree_distance_sq: 25.0 * 25.0,
            min_stone_distance_sq: 20.0 * 20.0,
            noise_threshold: 0.67,
            primary_yield: ("Cranberries".to_string(), 3, 7),
            secondary_yield: None,
            seed_type: "Cranberry Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important food crop must be sustainable
            min_respawn_time_secs: 1600, // 26 minutes
            max_respawn_time_secs: 2400, // 40 minutes
            spawn_condition: SpawnCondition::InlandWater,
            growing_seasons: vec![Season::Autumn, Season::Winter],
        });
        
        // === TOXIC/MEDICINAL ===
        configs.insert(PlantType::Mandrake, PlantConfig {
            entity_name: "Mandrake".to_string(),
            density_percent: 0.0001,
            min_distance_sq: 80.0 * 80.0,
            min_tree_distance_sq: 70.0 * 70.0,
            min_stone_distance_sq: 60.0 * 60.0,
            noise_threshold: 0.82,
            primary_yield: ("Mandrake Root".to_string(), 1, 1),
            secondary_yield: None,
            seed_type: "Mandrake Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 5400, // 90 minutes
            max_respawn_time_secs: 7200, // 120 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Autumn],
        });
        
        configs.insert(PlantType::Belladonna, PlantConfig {
            entity_name: "Belladonna".to_string(),
            density_percent: 0.0002,
            min_distance_sq: 60.0 * 60.0,
            min_tree_distance_sq: 50.0 * 50.0,
            min_stone_distance_sq: 45.0 * 45.0,
            noise_threshold: 0.78,
            primary_yield: ("Belladonna".to_string(), 1, 3),
            secondary_yield: None,
            seed_type: "Belladonna Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 3000, // 50 minutes
            max_respawn_time_secs: 4500, // 75 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Autumn],
        });
        
        configs.insert(PlantType::Henbane, PlantConfig {
            entity_name: "Henbane".to_string(),
            density_percent: 0.0003,
            min_distance_sq: 50.0 * 50.0,
            min_tree_distance_sq: 40.0 * 40.0,
            min_stone_distance_sq: 35.0 * 35.0,
            noise_threshold: 0.76,
            primary_yield: ("Henbane".to_string(), 2, 4),
            secondary_yield: None,
            seed_type: "Henbane Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 2400, // 40 minutes
            max_respawn_time_secs: 3600, // 60 minutes
            spawn_condition: SpawnCondition::Clearings,
            growing_seasons: vec![Season::Autumn],
        });
        
        configs.insert(PlantType::Datura, PlantConfig {
            entity_name: "Datura".to_string(),
            density_percent: 0.0002,
            min_distance_sq: 55.0 * 55.0,
            min_tree_distance_sq: 45.0 * 45.0,
            min_stone_distance_sq: 40.0 * 40.0,
            noise_threshold: 0.77,
            primary_yield: ("Datura".to_string(), 3, 6),
            secondary_yield: None,
            seed_type: "Datura Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 2700, // 45 minutes
            max_respawn_time_secs: 4000, // 66 minutes
            spawn_condition: SpawnCondition::Plains,
            growing_seasons: vec![Season::Autumn],
        });
        
        configs.insert(PlantType::Wolfsbane, PlantConfig {
            entity_name: "Wolfsbane".to_string(),
            density_percent: 0.0001,
            min_distance_sq: 70.0 * 70.0,
            min_tree_distance_sq: 60.0 * 60.0,
            min_stone_distance_sq: 50.0 * 50.0,
            noise_threshold: 0.80,
            primary_yield: ("Wolfsbane".to_string(), 1, 1),
            secondary_yield: None,
            seed_type: "Wolfsbane Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important medicinal herb must be sustainable
            min_respawn_time_secs: 4500, // 75 minutes
            max_respawn_time_secs: 6300, // 105 minutes
            spawn_condition: SpawnCondition::Forest,
            growing_seasons: vec![Season::Autumn],
        });
        
        // === OTHER ===
        configs.insert(PlantType::Sunflowers, PlantConfig {
            entity_name: "Sunflowers".to_string(),
            density_percent: 0.0008,
            min_distance_sq: 35.0 * 35.0, // Reduced spacing
            min_tree_distance_sq: 30.0 * 30.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.63,
            primary_yield: ("Sunflower".to_string(), 1, 2),
            secondary_yield: None, // Seeds come from seed drop system
            seed_type: "Sunflower Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance - important food crop must be sustainable
            min_respawn_time_secs: 2000, // 33 minutes
            max_respawn_time_secs: 3000, // 50 minutes
            spawn_condition: SpawnCondition::Plains,
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Tall dried stalks persist all winter
        });
        
        configs.insert(PlantType::Salsify, PlantConfig {
            entity_name: "Salsify".to_string(),
            density_percent: 0.0006,
            min_distance_sq: 30.0 * 30.0,
            min_tree_distance_sq: 20.0 * 20.0,
            min_stone_distance_sq: 25.0 * 25.0,
            noise_threshold: 0.65,
            primary_yield: ("Salsify Root".to_string(), 1, 2),
            secondary_yield: None,
            seed_type: "Salsify Seeds".to_string(),
            seed_drop_chance: 0.80, // 60% chance - important food crop must be sustainable
            min_respawn_time_secs: 1400, // 23 minutes
            max_respawn_time_secs: 2000, // 33 minutes
            spawn_condition: SpawnCondition::Plains,
            growing_seasons: vec![Season::Autumn],
        });
        
        // === TECHNOLOGICAL DEBRIS ===
        configs.insert(PlantType::MemoryShard, PlantConfig {
            entity_name: "Memory Shard".to_string(),
            density_percent: 0.0015,
            min_distance_sq: 80.0 * 80.0,
            min_tree_distance_sq: 60.0 * 60.0,
            min_stone_distance_sq: 70.0 * 70.0,
            noise_threshold: 0.75,
            primary_yield: ("Memory Shard".to_string(), 3, 8), // BOOSTED: 3-8 shards per pickup = 1 Tier 1 unlock per 2-5 finds
            secondary_yield: None,
            seed_type: "".to_string(), // No seeds - technological debris
            seed_drop_chance: 0.0, // No seed drops
            min_respawn_time_secs: 900, // 15 minutes - very fast respawn
            max_respawn_time_secs: 1500, // 25 minutes
            spawn_condition: SpawnCondition::Coastal, // Debris washed up on beaches and coastline from the crash
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Always findable - not biological
        });
        
        // === UNDERWATER PLANTS ===
        
        configs.insert(PlantType::SeaweedBed, PlantConfig {
            entity_name: "Seaweed Bed".to_string(),
            density_percent: 0.0012, // ~300 seaweed beds spread across underwater areas
            min_distance_sq: 50.0 * 50.0, // Cluster reasonably close
            min_tree_distance_sq: 0.0 * 0.0, // No tree distance check underwater
            min_stone_distance_sq: 30.0 * 30.0, // Some distance from rocks
            noise_threshold: 0.55, // Lower threshold for more coverage
            primary_yield: ("Seaweed".to_string(), 5, 9), // 5-9 seaweed per harvest (better than fishing junk)
            secondary_yield: Some(("Sea Glass".to_string(), 1, 3, 0.25)), // 25% chance for 1-3 sea glass (improved)
            seed_type: "Seaweed Frond".to_string(), // Vegetative reproduction via frond cuttings
            seed_drop_chance: 0.70, // 70% chance - sustainable farming (increased)
            min_respawn_time_secs: 480, // 8 minutes - grows quickly
            max_respawn_time_secs: 720, // 12 minutes
            spawn_condition: SpawnCondition::Underwater, // MUST be underwater, requires snorkeling
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Year-round underwater plant
        });
        
        // === RESOURCE PILES (Small bonus resources) ===
        
        configs.insert(PlantType::WoodPile, PlantConfig {
            entity_name: "Wood Pile".to_string(),
            density_percent: 0.0008, // Scattered throughout world (~200 across map)
            min_distance_sq: 100.0 * 100.0,
            min_tree_distance_sq: 60.0 * 60.0, // Can be near trees (fallen branches)
            min_stone_distance_sq: 80.0 * 80.0,
            noise_threshold: 0.75,
            primary_yield: ("Wood".to_string(), 40, 60), // ~50 wood average - small bonus
            secondary_yield: None,
            seed_type: "".to_string(), // No seeds
            seed_drop_chance: 0.0,
            min_respawn_time_secs: 1200, // 20 minutes
            max_respawn_time_secs: 1800, // 30 minutes
            spawn_condition: SpawnCondition::Plains, // Open areas, clearings
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Always available
        });
        
        configs.insert(PlantType::BeachWoodPile, PlantConfig {
            entity_name: "Beach Wood Pile".to_string(),
            density_percent: 0.0005, // Less common (~125 across map)
            min_distance_sq: 110.0 * 110.0,
            min_tree_distance_sq: 50.0 * 50.0, // Can be near beach trees
            min_stone_distance_sq: 70.0 * 70.0,
            noise_threshold: 0.78,
            primary_yield: ("Wood".to_string(), 20, 30), // ~25 wood average - driftwood gives less
            secondary_yield: None,
            seed_type: "".to_string(), // No seeds
            seed_drop_chance: 0.0,
            min_respawn_time_secs: 1200, // 20 minutes
            max_respawn_time_secs: 1800, // 30 minutes
            spawn_condition: SpawnCondition::Coastal, // Beaches only - driftwood
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Always available
        });
        
        configs.insert(PlantType::StonePile, PlantConfig {
            entity_name: "Stone Pile".to_string(),
            density_percent: 0.0007, // Scattered throughout world (~175 across map)
            min_distance_sq: 110.0 * 110.0,
            min_tree_distance_sq: 80.0 * 80.0,
            min_stone_distance_sq: 60.0 * 60.0, // Can be near stone nodes
            noise_threshold: 0.76,
            primary_yield: ("Stone".to_string(), 40, 60), // ~50 stone average - small bonus
            secondary_yield: None,
            seed_type: "".to_string(), // No seeds
            seed_drop_chance: 0.0,
            min_respawn_time_secs: 1200, // 20 minutes
            max_respawn_time_secs: 1800, // 30 minutes
            spawn_condition: SpawnCondition::Plains, // Open areas
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Always available
        });
        
        configs.insert(PlantType::LeavesPile, PlantConfig {
            entity_name: "Leaves Pile".to_string(),
            density_percent: 0.0009, // Common in forests (~225 across map)
            min_distance_sq: 90.0 * 90.0,
            min_tree_distance_sq: 30.0 * 30.0, // Close to trees (fallen leaves)
            min_stone_distance_sq: 60.0 * 60.0,
            noise_threshold: 0.72,
            primary_yield: ("Plant Fiber".to_string(), 30, 50), // ~40 plant fiber average
            secondary_yield: None,
            seed_type: "".to_string(), // No seeds
            seed_drop_chance: 0.0,
            min_respawn_time_secs: 900,  // 15 minutes
            max_respawn_time_secs: 1500, // 25 minutes
            spawn_condition: SpawnCondition::Forest, // Forest only - near trees
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Always available
        });
        
        configs.insert(PlantType::MetalOrePile, PlantConfig {
            entity_name: "Metal Ore Pile".to_string(),
            density_percent: 0.00025, // Very rare (~60 across map) - valuable resource
            min_distance_sq: 150.0 * 150.0, // Far apart
            min_tree_distance_sq: 100.0 * 100.0, // Away from trees (rocky areas)
            min_stone_distance_sq: 40.0 * 40.0, // Can be near stone nodes
            noise_threshold: 0.82, // High threshold = rare spawns
            primary_yield: ("Metal Ore".to_string(), 15, 25), // ~20 metal ore average - small bonus
            secondary_yield: None,
            seed_type: "".to_string(), // No seeds
            seed_drop_chance: 0.0,
            min_respawn_time_secs: 2400, // 40 minutes - slow respawn
            max_respawn_time_secs: 3600, // 60 minutes
            spawn_condition: SpawnCondition::Alpine, // Alpine/quarry areas only
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Always available
        });
        
        configs.insert(PlantType::SulfurPile, PlantConfig {
            entity_name: "Sulfur Pile".to_string(),
            density_percent: 0.0002, // Very rare (~50 across map) - valuable explosive material
            min_distance_sq: 160.0 * 160.0, // Far apart
            min_tree_distance_sq: 120.0 * 120.0, // Away from trees (volcanic/rocky areas)
            min_stone_distance_sq: 50.0 * 50.0,
            noise_threshold: 0.85, // Very high threshold = very rare spawns
            primary_yield: ("Sulfur Ore".to_string(), 10, 20), // ~15 sulfur ore average - valuable
            secondary_yield: None,
            seed_type: "".to_string(), // No seeds
            seed_drop_chance: 0.0,
            min_respawn_time_secs: 3000, // 50 minutes - very slow respawn
            max_respawn_time_secs: 4200, // 70 minutes
            spawn_condition: SpawnCondition::Alpine, // Alpine/volcanic areas only
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Always available
        });
        
        configs.insert(PlantType::CharcoalPile, PlantConfig {
            entity_name: "Charcoal Pile".to_string(),
            density_percent: 0.0003, // Rare (~75 across map) - old burn sites in forests
            min_distance_sq: 130.0 * 130.0,
            min_tree_distance_sq: 50.0 * 50.0, // Near trees but not too close (burned clearings)
            min_stone_distance_sq: 70.0 * 70.0,
            noise_threshold: 0.80, // High threshold = rare spawns
            primary_yield: ("Charcoal".to_string(), 20, 35), // ~27 charcoal average
            secondary_yield: None,
            seed_type: "".to_string(), // No seeds
            seed_drop_chance: 0.0,
            min_respawn_time_secs: 1800, // 30 minutes
            max_respawn_time_secs: 2700, // 45 minutes
            spawn_condition: SpawnCondition::Forest, // Forest areas - old burn sites
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Always available
        });
        
        // === STORM DEBRIS ===
        // Spawns when plants are destroyed by heavy storms (35% chance per plant death)
        // Yields Soggy Plant Fiber which can be dried into regular Plant Fiber
        configs.insert(PlantType::SoggyPlantFiberPile, PlantConfig {
            entity_name: "Soggy Plant Fiber Pile".to_string(),
            density_percent: 0.0, // Never spawns naturally - only from storm destruction
            min_distance_sq: 30.0 * 30.0, // Can spawn close together (storm debris)
            min_tree_distance_sq: 0.0, // No tree distance requirement
            min_stone_distance_sq: 0.0, // No stone distance requirement
            noise_threshold: 1.0, // Never spawns naturally
            primary_yield: ("Soggy Plant Fiber".to_string(), 2, 4), // 2-4 soggy fiber per pile
            secondary_yield: None,
            seed_type: "".to_string(), // No seeds
            seed_drop_chance: 0.0,
            min_respawn_time_secs: 0, // No respawn - one-time storm debris
            max_respawn_time_secs: 0,
            spawn_condition: SpawnCondition::Plains, // Doesn't matter - spawns at plant death location
            growing_seasons: vec![], // Never grows naturally
        });
        
        // === MONUMENT-SPECIFIC PILES ===
        
        configs.insert(PlantType::BonePile, PlantConfig {
            entity_name: "Bone Pile".to_string(),
            density_percent: 0.0, // Never spawns naturally - only at whale bone graveyard monument
            min_distance_sq: 60.0 * 60.0,
            min_tree_distance_sq: 0.0, // No tree distance requirement (monument-placed)
            min_stone_distance_sq: 0.0, // No stone distance requirement (monument-placed)
            noise_threshold: 1.0, // Never spawns naturally
            primary_yield: ("Bone Fragments".to_string(), 8, 15), // 8-15 bone fragments per pile
            secondary_yield: Some(("Animal Bone".to_string(), 1, 2, 0.25)), // 25% chance for 1-2 whole bones
            seed_type: "".to_string(), // No seeds
            seed_drop_chance: 0.0,
            min_respawn_time_secs: 1800, // 30 minutes - bones don't regenerate quickly
            max_respawn_time_secs: 2700, // 45 minutes
            spawn_condition: SpawnCondition::Coastal, // Monument placement only (beach/coastal area)
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // Always available
        });
        
        // === TREE SAPLINGS ===
        // These are special plants that grow into Tree entities when mature.
        // Growth time: 5-8 minutes - FASTER than wild tree respawn (10-20 min) to incentivize farming
        // Player-planted trees yield less wood than wild trees (60% yield).
        
        configs.insert(PlantType::ConiferSapling, PlantConfig {
            entity_name: "Conifer Sapling".to_string(),
            density_percent: 0.0, // Never spawns naturally - planted only
            min_distance_sq: 200.0 * 200.0, // Trees need lots of space
            min_tree_distance_sq: 150.0 * 150.0, // Keep away from existing trees
            min_stone_distance_sq: 100.0 * 100.0,
            noise_threshold: 1.0, // Never spawns naturally
            primary_yield: ("Wood".to_string(), 0, 0), // No direct yield - becomes a Tree
            secondary_yield: None,
            seed_type: "Pinecone".to_string(),
            seed_drop_chance: 0.0, // No seed drops - harvesting mature tree gives seeds
            // Growth time: 5-8 minutes - faster than wild tree respawn (10-20 min)
            min_respawn_time_secs: 300,  // 5 minutes to grow
            max_respawn_time_secs: 480,  // 8 minutes to grow
            spawn_condition: SpawnCondition::Plains, // Can plant anywhere (not water)
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn], // No winter growth
        });
        
        configs.insert(PlantType::DeciduousSapling, PlantConfig {
            entity_name: "Deciduous Sapling".to_string(),
            density_percent: 0.0, // Never spawns naturally - planted only
            min_distance_sq: 200.0 * 200.0, // Trees need lots of space
            min_tree_distance_sq: 150.0 * 150.0, // Keep away from existing trees
            min_stone_distance_sq: 100.0 * 100.0,
            noise_threshold: 1.0, // Never spawns naturally
            primary_yield: ("Wood".to_string(), 0, 0), // No direct yield - becomes a Tree
            secondary_yield: None,
            seed_type: "Birch Catkin".to_string(),
            seed_drop_chance: 0.0, // No seed drops - harvesting mature tree gives seeds
            // Growth time: 5-8 minutes - faster than wild tree respawn (10-20 min)
            min_respawn_time_secs: 300,  // 5 minutes to grow
            max_respawn_time_secs: 480,  // 8 minutes to grow
            spawn_condition: SpawnCondition::Plains, // Can plant anywhere (not water)
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn], // No winter growth
        });
        
        // Crab Apple Sapling - Fruit tree from Crab Apple Seeds
        // Temperate climate only. Drops valuable fruit when chopped.
        configs.insert(PlantType::CrabAppleSapling, PlantConfig {
            entity_name: "Crab Apple Sapling".to_string(),
            density_percent: 0.0, // Never spawns naturally - planted only
            min_distance_sq: 200.0 * 200.0, // Trees need lots of space
            min_tree_distance_sq: 150.0 * 150.0, // Keep away from existing trees
            min_stone_distance_sq: 100.0 * 100.0,
            noise_threshold: 1.0, // Never spawns naturally
            primary_yield: ("Wood".to_string(), 0, 0), // No direct yield - becomes a Tree
            secondary_yield: None,
            seed_type: "Crab Apple Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance when EATING crab apples to get seeds
            // Growth time: 5-8 minutes - faster than wild tree respawn (10-20 min)
            min_respawn_time_secs: 300,  // 5 minutes to grow
            max_respawn_time_secs: 480,  // 8 minutes to grow
            spawn_condition: SpawnCondition::Plains, // Temperate only (restrictions in planted_seeds.rs)
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn], // No winter growth
        });
        
        // Hazelnut Sapling - Nut tree from Hazelnuts
        // Temperate climate only. The nut itself is the seed.
        configs.insert(PlantType::HazelnutSapling, PlantConfig {
            entity_name: "Hazelnut Sapling".to_string(),
            density_percent: 0.0, // Never spawns naturally - planted only
            min_distance_sq: 200.0 * 200.0, // Trees need lots of space
            min_tree_distance_sq: 150.0 * 150.0, // Keep away from existing trees
            min_stone_distance_sq: 100.0 * 100.0,
            noise_threshold: 1.0, // Never spawns naturally
            primary_yield: ("Wood".to_string(), 0, 0), // No direct yield - becomes a Tree
            secondary_yield: None,
            seed_type: "Hazelnuts".to_string(),
            seed_drop_chance: 0.0, // Hazelnuts ARE the seeds - eating them doesn't give more (would be infinite item exploit)
            // Growth time: 5-8 minutes - faster than wild tree respawn (10-20 min)
            min_respawn_time_secs: 300,  // 5 minutes to grow
            max_respawn_time_secs: 480,  // 8 minutes to grow
            spawn_condition: SpawnCondition::Plains, // Temperate only (restrictions in planted_seeds.rs)
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn], // No winter growth
        });
        
        // Rowanberry Sapling - Fruit tree from Rowan Seeds
        // Temperate climate only. Mountain ash tree that drops rowan berries when chopped.
        configs.insert(PlantType::RowanberrySapling, PlantConfig {
            entity_name: "Rowanberry Sapling".to_string(),
            density_percent: 0.0, // Never spawns naturally - planted only
            min_distance_sq: 200.0 * 200.0, // Trees need lots of space
            min_tree_distance_sq: 150.0 * 150.0, // Keep away from existing trees
            min_stone_distance_sq: 100.0 * 100.0,
            noise_threshold: 1.0, // Never spawns naturally
            primary_yield: ("Wood".to_string(), 0, 0), // No direct yield - becomes a Tree
            secondary_yield: None,
            seed_type: "Rowan Seeds".to_string(),
            seed_drop_chance: 0.80, // 80% chance when EATING rowan berries to get seeds
            // Growth time: 5-8 minutes - faster than wild tree respawn (10-20 min)
            min_respawn_time_secs: 300,  // 5 minutes to grow
            max_respawn_time_secs: 480,  // 8 minutes to grow
            spawn_condition: SpawnCondition::Plains, // Temperate only (restrictions in planted_seeds.rs)
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn], // No winter growth
        });

        // Olive Sapling - GMO olive cultivar from rare Olive Seeds
        // Plantable-only tree type; never spawned by world generation.
        configs.insert(PlantType::OliveSapling, PlantConfig {
            entity_name: "Olive Sapling".to_string(),
            density_percent: 0.0, // Never spawns naturally - planted only
            min_distance_sq: 200.0 * 200.0, // Trees need lots of space
            min_tree_distance_sq: 150.0 * 150.0, // Keep away from existing trees
            min_stone_distance_sq: 100.0 * 100.0,
            noise_threshold: 1.0, // Never spawns naturally
            primary_yield: ("Wood".to_string(), 0, 0), // No direct yield - becomes a Tree
            secondary_yield: None,
            seed_type: "Olive Seed".to_string(),
            seed_drop_chance: 0.5, // Allows occasional seed return when consuming olives
            min_respawn_time_secs: 300, // 5 minutes to grow
            max_respawn_time_secs: 480, // 8 minutes to grow
            spawn_condition: SpawnCondition::Plains, // Broadly plantable; explicit checks live in planted_seeds.rs
            growing_seasons: vec![Season::Spring, Season::Summer, Season::Autumn, Season::Winter], // GMO cultivar grows year-round
        });
        
        configs
    };
}

// --- Public SpacetimeDB Table for Client Access ---
// This table exposes plant configuration data to clients for the Encyclopedia

/// Category for organizing plants in the encyclopedia
#[derive(spacetimedb::SpacetimeType, Clone, Debug, PartialEq)]
pub enum PlantCategory {
    Vegetable,      // Root crops, greens
    Berry,          // Berry bushes
    Mushroom,       // All fungi
    Herb,           // Medicinal and culinary herbs
    Fiber,          // Fiber-producing plants
    Toxic,          // Poisonous plants
    Arctic,         // Arctic/alpine specialty plants
    ResourcePile,   // Resource piles (wood, stone, etc.)
    Special,        // Memory shards, seaweed, etc.
}

/// Public table exposing plant yield configurations to clients
#[spacetimedb::table(name = plant_config_definition, public)]
#[derive(Clone, Debug)]
pub struct PlantConfigDefinition {
    #[primary_key]
    pub plant_type: PlantType,
    
    /// Display name for the plant
    pub entity_name: String,
    
    /// Category for filtering/sorting in encyclopedia
    pub category: PlantCategory,
    
    /// Primary yield item name
    pub primary_yield_item: String,
    /// Minimum primary yield amount
    pub primary_yield_min: u32,
    /// Maximum primary yield amount  
    pub primary_yield_max: u32,
    
    /// Secondary yield item name (empty string if none)
    pub secondary_yield_item: String,
    /// Minimum secondary yield amount
    pub secondary_yield_min: u32,
    /// Maximum secondary yield amount
    pub secondary_yield_max: u32,
    /// Chance (0.0-1.0) of getting secondary yield
    pub secondary_yield_chance: f32,
    
    /// Seed item name needed to plant this (empty if non-plantable)
    pub seed_type: String,
    /// Chance (0.0-1.0) of getting seeds when harvesting
    pub seed_drop_chance: f32,
    
    /// Where this plant spawns (for encyclopedia info)
    pub spawn_location: String,
    
    /// Which seasons this plant grows in (comma-separated: "Spring,Summer,Autumn,Winter")
    pub growing_seasons: String,
}

/// Helper to determine plant category from PlantType
fn get_plant_category(plant_type: &PlantType) -> PlantCategory {
    match plant_type {
        // Vegetables
        PlantType::Potato | PlantType::Pumpkin | PlantType::Carrot | PlantType::Beets |
        PlantType::Horseradish | PlantType::Corn | PlantType::Salsify | PlantType::Cabbage |
        PlantType::Fennel | PlantType::KamchatkaLily | PlantType::WildCelery | 
        
        // Nagoonberry is a berry
        PlantType::Nagoonberry => PlantCategory::Berry,
        
        // Berries (RowanBerries can still exist as a plant type, though typically comes from RowanberryTree)
        PlantType::Lingonberries | PlantType::Cloudberries | PlantType::Bilberries |
        PlantType::WildStrawberries | PlantType::Cranberries | PlantType::RowanBerries |
        PlantType::Crowberry => PlantCategory::Berry,
        
        // Mushrooms
        PlantType::Chanterelle | PlantType::Porcini | PlantType::FlyAgaric |
        PlantType::ShaggyInkCap | PlantType::DeadlyWebcap | PlantType::DestroyingAngel => PlantCategory::Mushroom,
        
        // Herbs
        PlantType::Chicory | PlantType::Yarrow | PlantType::Chamomile | PlantType::Mint |
        PlantType::Valerian | PlantType::Mugwort | PlantType::BearGarlic | 
        PlantType::SiberianGinseng | PlantType::Sunflowers => PlantCategory::Herb,
        
        // Fiber plants
        PlantType::BorealNettle | PlantType::Reed | PlantType::BeachLymeGrass |
        PlantType::Dogbane | PlantType::BogCotton | PlantType::Flax |
        PlantType::Fireweed => PlantCategory::Fiber,
        
        // Toxic plants
        PlantType::Mandrake | PlantType::Belladonna | PlantType::Henbane |
        PlantType::Datura | PlantType::Wolfsbane => PlantCategory::Toxic,
        
        // Arctic/Alpine plants
        PlantType::ScurvyGrass | PlantType::SeaPlantain | PlantType::Glasswort |
        PlantType::ArcticPoppy | PlantType::Silverweed | PlantType::AlpineBistort => PlantCategory::Arctic,
        
        // Resource piles
        PlantType::WoodPile | PlantType::BeachWoodPile | PlantType::StonePile |
        PlantType::LeavesPile | PlantType::MetalOrePile | PlantType::SulfurPile |
        PlantType::CharcoalPile | PlantType::SoggyPlantFiberPile | PlantType::BonePile => PlantCategory::ResourcePile,
        
        // Special (includes tree saplings which become Tree entities when mature)
        PlantType::MemoryShard | PlantType::SeaweedBed |
        PlantType::ConiferSapling | PlantType::DeciduousSapling |
        PlantType::CrabAppleSapling | PlantType::HazelnutSapling |
        PlantType::RowanberrySapling | PlantType::OliveSapling => PlantCategory::Special,
    }
}

/// Helper to convert SpawnCondition to human-readable string
fn spawn_condition_to_string(condition: &SpawnCondition) -> String {
    match condition {
        SpawnCondition::Forest => "Forest areas".to_string(),
        SpawnCondition::Plains => "Open plains".to_string(),
        SpawnCondition::NearWater => "Near water sources".to_string(),
        SpawnCondition::Clearings => "Clearings & dirt roads".to_string(),
        SpawnCondition::Coastal => "Coastal & beaches".to_string(),
        SpawnCondition::InlandWater => "Along rivers & lakes".to_string(),
        SpawnCondition::Tundra => "Tundra biome".to_string(),
        SpawnCondition::Alpine => "Alpine mountains".to_string(),
        SpawnCondition::Underwater => "Underwater (requires snorkeling)".to_string(),
    }
}

/// Helper to convert seasons vec to comma-separated string
fn seasons_to_string(seasons: &[Season]) -> String {
    seasons.iter()
        .map(|s| match s {
            Season::Spring => "Spring",
            Season::Summer => "Summer",
            Season::Autumn => "Autumn",
            Season::Winter => "Winter",
        })
        .collect::<Vec<_>>()
        .join(",")
}

/// Populates the plant_config_definition table from PLANT_CONFIGS
/// Should be called during server initialization
pub fn populate_plant_config_definitions(ctx: &spacetimedb::ReducerContext) {
    use spacetimedb::Table;
    
    // Clear existing entries first (in case of re-init)
    let existing: Vec<_> = ctx.db.plant_config_definition().iter().collect();
    for entry in existing {
        ctx.db.plant_config_definition().plant_type().delete(&entry.plant_type);
    }
    
    // Populate from PLANT_CONFIGS
    for (plant_type, config) in PLANT_CONFIGS.iter() {
        let definition = PlantConfigDefinition {
            plant_type: *plant_type,
            entity_name: config.entity_name.clone(),
            category: get_plant_category(plant_type),
            primary_yield_item: config.primary_yield.0.clone(),
            primary_yield_min: config.primary_yield.1,
            primary_yield_max: config.primary_yield.2,
            secondary_yield_item: config.secondary_yield.as_ref()
                .map(|(name, _, _, _)| name.clone())
                .unwrap_or_default(),
            secondary_yield_min: config.secondary_yield.as_ref()
                .map(|(_, min, _, _)| *min)
                .unwrap_or(0),
            secondary_yield_max: config.secondary_yield.as_ref()
                .map(|(_, _, max, _)| *max)
                .unwrap_or(0),
            secondary_yield_chance: config.secondary_yield.as_ref()
                .map(|(_, _, _, chance)| *chance)
                .unwrap_or(0.0),
            seed_type: config.seed_type.clone(),
            seed_drop_chance: config.seed_drop_chance,
            spawn_location: spawn_condition_to_string(&config.spawn_condition),
            growing_seasons: seasons_to_string(&config.growing_seasons),
        };
        
        ctx.db.plant_config_definition().insert(definition);
    }
    
    log::info!("Populated {} plant config definitions for encyclopedia", PLANT_CONFIGS.len());
}

// --- Helper Functions ---

pub fn get_plant_config(plant_type: &PlantType) -> Option<&PlantConfig> {
    PLANT_CONFIGS.get(plant_type)
}

/// Get all available seed types that can be planted
pub fn get_all_seed_types() -> Vec<String> {
    PLANT_CONFIGS.values()
        .filter(|config| !config.seed_type.is_empty()) // Exclude plants with no seeds
        .map(|config| config.seed_type.clone())
        .collect()
}

/// Get all plant entity names for seed drop mapping
pub fn get_all_plant_entity_names() -> Vec<String> {
    PLANT_CONFIGS.values()
        .map(|config| config.entity_name.clone())
        .collect()
}

/// Get seed type for a given plant type
pub fn get_seed_type_for_plant(plant_type: &PlantType) -> Option<&str> {
    PLANT_CONFIGS.get(plant_type)
        .map(|config| config.seed_type.as_str())
        .filter(|seed| !seed.is_empty())
}

/// Convert PlantType enum to entity name (for seed drops) - uses centralized config
pub fn plant_type_to_entity_name(plant_type: &PlantType) -> &str {
    PLANT_CONFIGS.get(plant_type)
        .map(|config| config.entity_name.as_str())
        .unwrap_or("Unknown Plant") // Fallback for missing configs
}

/// Get plant type by seed name
pub fn get_plant_type_by_seed(seed_name: &str) -> Option<PlantType> {
    PLANT_CONFIGS.iter()
        .find(|(_, config)| config.seed_type == seed_name)
        .map(|(plant_type, _)| *plant_type)
}

/// Get plant type by entity name  
pub fn get_plant_type_by_entity_name(entity_name: &str) -> Option<PlantType> {
    PLANT_CONFIGS.iter()
        .find(|(_, config)| config.entity_name == entity_name)
        .map(|(plant_type, _)| *plant_type)
}

/// Check if a seed has drops configured (non-zero drop chance)
pub fn has_seed_drops(plant_type: &PlantType) -> bool {
    PLANT_CONFIGS.get(plant_type)
        .map(|config| config.seed_drop_chance > 0.0 && !config.seed_type.is_empty())
        .unwrap_or(false)
}

/// Check if a plant can grow in the given season
pub fn can_grow_in_season(plant_type: &PlantType, season: &Season) -> bool {
    PLANT_CONFIGS.get(plant_type)
        .map(|config| config.growing_seasons.contains(season))
        .unwrap_or(false)
}

// Helper function to get plants that can grow in a specific season
pub fn get_seasonal_plants(season: &Season) -> Vec<(PlantType, &PlantConfig)> {
    PLANT_CONFIGS.iter()
        .filter(|(plant_type, _)| can_grow_in_season(plant_type, season))
        .map(|(plant_type, config)| (*plant_type, config))
        .collect()
}

/// Map plant types to bit positions for unique plant tracking (0-48 for 49 trackable plants)
/// This bitmask is stored in PlayerStats.unique_plant_bitmask (u64)
/// 
/// Category ranges for achievement tracking:
/// - Bits 0-6:   Berries (7 types)
/// - Bits 7-12:  Mushrooms (6 types)
/// - Bits 13-21: Herbs (9 types)
/// - Bits 22-26: Toxic (5 types)
/// - Bits 27-32: Arctic (6 types)
/// - Bits 33-40: Vegetables (8 types)
/// - Bits 41-48: Fiber (8 types)
/// 
/// Not tracked: Resource piles (WoodPile, etc.), MemoryShard, SeaweedBed
pub fn get_plant_bit_index(plant_type: &PlantType) -> Option<u32> {
    match plant_type {
        // ===== BERRIES (Bits 0-5) - RowanBerries removed (now from tree) =====
        PlantType::Lingonberries => Some(0),
        PlantType::Cloudberries => Some(1),
        PlantType::Bilberries => Some(2),
        PlantType::WildStrawberries => Some(3),
        // Bit 4 unused (was RowanBerries - now comes from RowanberryTree)
        PlantType::Cranberries => Some(5),
        PlantType::Crowberry => Some(6),
        
        // ===== MUSHROOMS (Bits 7-12) =====
        PlantType::Chanterelle => Some(7),
        PlantType::Porcini => Some(8),
        PlantType::FlyAgaric => Some(9),
        PlantType::ShaggyInkCap => Some(10),
        PlantType::DeadlyWebcap => Some(11),
        PlantType::DestroyingAngel => Some(12),
        
        // ===== HERBS (Bits 13-21) =====
        PlantType::Chicory => Some(13),
        PlantType::Yarrow => Some(14),
        PlantType::Chamomile => Some(15),
        PlantType::Mint => Some(16),
        PlantType::Valerian => Some(17),
        PlantType::Mugwort => Some(18),
        PlantType::BearGarlic => Some(19),
        PlantType::SiberianGinseng => Some(20),
        PlantType::Sunflowers => Some(21),
        
        // ===== TOXIC (Bits 22-26) =====
        PlantType::Mandrake => Some(22),
        PlantType::Belladonna => Some(23),
        PlantType::Henbane => Some(24),
        PlantType::Datura => Some(25),
        PlantType::Wolfsbane => Some(26),
        
        // ===== ARCTIC/ALPINE (Bits 27-32) =====
        PlantType::ScurvyGrass => Some(27),
        PlantType::SeaPlantain => Some(28),
        PlantType::Glasswort => Some(29),
        PlantType::ArcticPoppy => Some(30),
        PlantType::Silverweed => Some(31),
        PlantType::AlpineBistort => Some(32),
        
        // ===== VEGETABLES (Bits 33-40, 49) =====
        PlantType::Potato => Some(33),
        PlantType::Pumpkin => Some(34),
        PlantType::Carrot => Some(35),
        PlantType::Beets => Some(36),
        PlantType::Horseradish => Some(37),
        PlantType::Corn => Some(38),
        PlantType::Salsify => Some(39),
        PlantType::Cabbage => Some(40),
        PlantType::Fennel => Some(49), // Added after fiber plants (bits 41-48)
        PlantType::KamchatkaLily => Some(50),
        PlantType::WildCelery => Some(51),
        PlantType::Nagoonberry => Some(52),
        
        // ===== FIBER PLANTS (Bits 41-47) =====
        PlantType::BorealNettle => Some(41),
        PlantType::Reed => Some(42),
        PlantType::BeachLymeGrass => Some(43),
        PlantType::Dogbane => Some(44),
        PlantType::BogCotton => Some(45),
        PlantType::Flax => Some(46),
        PlantType::Fireweed => Some(47),
        
        // ===== NOT TRACKED (Resource piles, special items, tree saplings) =====
        PlantType::WoodPile | PlantType::BeachWoodPile | PlantType::StonePile |
        PlantType::LeavesPile | PlantType::MetalOrePile | PlantType::SulfurPile |
        PlantType::CharcoalPile | PlantType::SoggyPlantFiberPile | PlantType::BonePile |
        PlantType::MemoryShard | PlantType::SeaweedBed | 
        PlantType::ConiferSapling | PlantType::DeciduousSapling |
        PlantType::CrabAppleSapling | PlantType::HazelnutSapling |
        PlantType::RowanberrySapling | PlantType::OliveSapling |
        PlantType::RowanBerries => None,
    }
} 