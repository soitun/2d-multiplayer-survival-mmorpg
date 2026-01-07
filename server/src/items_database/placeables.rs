use super::builders::{ItemBuilder};
use crate::items::{ItemDefinition, ItemCategory, CostIngredient};

pub fn get_placeable_definitions() -> Vec<ItemDefinition> {
    vec![
        // === BASIC STRUCTURES ===
        // Essential deployable structures for survival

        // Camp Fire - Basic cooking and warmth
        ItemBuilder::new("Camp Fire", "A place to cook food and stay warm.", ItemCategory::Placeable)
            .icon("campfire.png")
            .stackable(5)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 25 },
                CostIngredient { item_name: "Stone".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 15)
            .respawn_time(300)
            .build(),

        // Furnace - Metal smelting station
        ItemBuilder::new("Furnace", "A stone furnace for smelting metal ore into metal fragments. Burns wood as fuel.", ItemCategory::Placeable)
            .icon("furnace_simple.png")
            .stackable(3)
            .crafting_cost(vec![
                CostIngredient { item_name: "Stone".to_string(), quantity: 100 },
                CostIngredient { item_name: "Wood".to_string(), quantity: 50 },
                CostIngredient { item_name: "Tallow".to_string(), quantity: 25 }, // For heat-resistant lining
            ])
            .crafting_output(1, 30)
            .respawn_time(450)
            .build(),

        // Stash - Small hidden storage
        ItemBuilder::new("Stash", "A small, concealable stash for hiding items. Fewer slots than a box, but can be hidden.", ItemCategory::Placeable)
            .icon("stash.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 10)
            .respawn_time(300)
            .build(),

        // Wooden Storage Box - Storage container (18 slots)
        ItemBuilder::new("Wooden Storage Box", "A simple container for storing items. Holds 18 stacks.", ItemCategory::Placeable)
            .icon("wooden_storage_box.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 100 },
            ])
            .crafting_output(1, 15)
            .respawn_time(300)
            .build(),

        // Large Wooden Storage Box - Large storage container (48 slots)
        ItemBuilder::new("Large Wooden Storage Box", "A large container for storing many items. Holds 48 stacks.", ItemCategory::Placeable)
            .icon("large_wood_box.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 200 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 25)
            .respawn_time(450)
            .build(),

        // Repair Bench - Workbench for repairing damaged items
        ItemBuilder::new("Repair Bench", "A workbench for repairing damaged items. Each repair reduces max durability by 25%.", ItemCategory::Placeable)
            .icon("repair_bench.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 75 },
                CostIngredient { item_name: "Stone".to_string(), quantity: 25 },
            ])
            .crafting_output(1, 15)
            .respawn_time(300)
            .build(),

        // Cooking Station - Advanced food crafting station (no inventory, proximity-based)
        ItemBuilder::new("Cooking Station", "A kitchen station for preparing advanced recipes. Stand nearby to craft gourmet meals from cooked ingredients.", ItemCategory::Placeable)
            .icon("cooking_station.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 100 },
                CostIngredient { item_name: "Stone".to_string(), quantity: 50 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 25 },
            ])
            .crafting_output(1, 20)
            .respawn_time(300)
            .build(),

        // Refrigerator - Food preservation container (30 slots, stops spoilage)
        ItemBuilder::new("Refrigerator", "A refrigerated container that preserves food. Holds 30 stacks of food, seeds, and water containers.", ItemCategory::Placeable)
            .icon("refrigerator.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 150 },
                CostIngredient { item_name: "Wood".to_string(), quantity: 50 },
                CostIngredient { item_name: "Scrap Batteries".to_string(), quantity: 3 },
            ])
            .crafting_output(1, 30)
            .respawn_time(600)
            .build(),

        // Compost - Organic material storage container (24 slots)
        ItemBuilder::new("Compost", "A container that slowly converts organic material into fertilizer. Great for getting use out of raw or overcooked food.", ItemCategory::Placeable)
            .icon("compost.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 75 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 20 },
            ])
            .crafting_output(1, 20)
            .respawn_time(300)
            .build(),

        // Barbecue - Cooking appliance with 12 slots (functions like campfire)
        ItemBuilder::new("Barbecue", "A large cooking appliance with 12 slots for cooking food. Functions like a campfire but with more capacity.", ItemCategory::Placeable)
            .icon("barbecue.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 150 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 50 },
                CostIngredient { item_name: "Stone".to_string(), quantity: 75 },
            ])
            .crafting_output(1, 30)
            .respawn_time(450)
            .build(),

        // Scarecrow - Deters crows within a large radius
        ItemBuilder::new("Scarecrow", "A makeshift scarecrow cobbled together from driftwood and scraps. Deters crows from destroying crops and stealing food from campfires and barbecues!", ItemCategory::Placeable)
            .icon("scarecrow.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 150 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 15 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
                CostIngredient { item_name: "Kayak Paddle".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 45)
            .respawn_time(600)
            .build(),

        // === SHELTER & RESPAWN ===

        // Sleeping Bag - Portable respawn point
        ItemBuilder::new("Sleeping Bag", "A rolled-up bag for sleeping outdoors. Sets a respawn point.", ItemCategory::Placeable)
            .icon("sleeping_bag.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 15 }, // Reduced from 25 to 15 for easier early game
            ])
            .crafting_output(1, 15)
            .respawn_time(420)
            .build(),

        // Shelter - STARTER protection structure (cheap but weak)
        // Designed as a quick early-game base before learning the building system.
        // Much cheaper than building, but also much weaker and not upgradeable.
        // NOW CRAFTABLE FROM START - No Memory Grid unlock required!
        ItemBuilder::new("Shelter", "A quick starter shelter. Cheap to build but offers minimal protection. Upgrade to foundations and walls for real security.", ItemCategory::Placeable)
            .icon("shelter.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 100 }, // Reduced from 150 - starter base
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },   // Reduced from 3 - starter base
            ])
            .crafting_output(1, 15) // Faster to craft for early game
            .respawn_time(300)
            .build(),

        // === LIGHTING ===

        // Lantern - Deployable light source
        ItemBuilder::new("Lantern", "A deployable lamp that burns tallow to provide light. Lasts longer than campfires.", ItemCategory::Placeable)
            .icon("lantern_off.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 75 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 15 }, // Added metal for frame and mechanism
                CostIngredient { item_name: "Tallow".to_string(), quantity: 10 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 20)
            .respawn_time(420)
            .build(),

        // === UTILITY STRUCTURES ===

        // Matron's Chest - Building privilege and material storage
        ItemBuilder::new(
            "Matron's Chest",
            "A sacred chest blessed by a Pra Matron of Gred. Stores raw materials and building supplies. Hold E to gain building privilege, press E to access inventory. Must be placed on a foundation.",
            ItemCategory::Placeable
        )
            .icon("hearth.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 300 },  // Primary material - achievable after building starter base
                CostIngredient { item_name: "Stone".to_string(), quantity: 100 }, // Reduced from 200 - easier to gather
                CostIngredient { item_name: "Cloth".to_string(), quantity: 10 },  // Reduced from 20 - blessing cloth lining
            ])
            .crafting_output(1, 45)
            .respawn_time(600)
            .build(),

        // Reed Rain Collector - Water collection system
        ItemBuilder::new("Reed Rain Collector", "A small water collection device crafted from hollow reed stalks. Collects rainwater automatically during storms. Capacity: 40L.", ItemCategory::Placeable)
            .icon("reed_rain_collector.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Common Reed Stalk".to_string(), quantity: 15 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 10 }, // For collection surface
                CostIngredient { item_name: "Wood".to_string(), quantity: 200 }, // For frame structure
                CostIngredient { item_name: "Stone".to_string(), quantity: 50 }, // For anchoring and stability
            ])
            .crafting_output(1, 60)
            .respawn_time(900) // 15 minutes - valuable water infrastructure
            .build(),

        // === COOKING EQUIPMENT ===

        // Broth Pot - Advanced cooking vessel that snaps to campfires
        ItemBuilder::new("Cerametal Field Cauldron Mk. II", "A miraculous cooking vessel that survived the shipwreck intact. This military-grade cauldron combines ceramic heat distribution with a metal alloy frame, designed for field operations. Place over campfires to cook broth, desalinate water, and prepare complex recipes. Requires water and ingredients to operate. The stirring mechanism demands attention during cooking.", ItemCategory::Placeable)
            .icon("field_cauldron.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Stone".to_string(), quantity: 250 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 150 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 120)
            .respawn_time(1800)
            .build(),

        // === TROPHY DECORATIONS ===
        // Display items for showing hunting achievements

        // Wolf Pelt - Rare hunting trophy
        ItemBuilder::new("Wolf Pelt", "A magnificent wolf pelt with thick, luxurious fur. This impressive trophy can be displayed as a rare decoration, showcasing your prowess against dangerous predators.", ItemCategory::Placeable)
            .icon("wolf_pelt.png")
            .build(), // No crafting cost - dropped by wolves

        // Fox Pelt - Hunting trophy
        ItemBuilder::new("Fox Pelt", "A beautiful fox pelt with rich, vibrant fur. This rare trophy makes an excellent display piece, demonstrating your skill at hunting elusive prey.", ItemCategory::Placeable)
            .icon("fox_pelt.png")
            .build(), // No crafting cost - dropped by foxes

        // === BUILDING COMPONENTS ===

        // Wood Door - Craftable door for doorframes
        ItemBuilder::new("Wood Door", "A sturdy wooden door that can be placed into a doorframe. Provides secure entry to your structures.", ItemCategory::Placeable)
            .icon("wood_door.png")
            .stackable(5)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 50 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 20)
            .respawn_time(300)
            .build(),

        // Metal Door - Advanced door for doorframes
        ItemBuilder::new("Metal Door", "A reinforced metal door that can be placed into a doorframe. Much stronger than wooden doors, providing superior protection.", ItemCategory::Placeable)
            .icon("metal_door.png")
            .stackable(3)
            .crafting_cost(vec![
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 100 },
                CostIngredient { item_name: "Wood".to_string(), quantity: 25 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 3 },
            ])
            .crafting_output(1, 45)
            .respawn_time(600)
            .build(),

        // === EXPLOSIVES ===

        // Babushka's Surprise - Tier 1 explosive (BALANCED: 150 gunpowder = 150 sulfur + 300 charcoal)
        // Has 20% dud chance and unreliable 5-30s fuse, so lower cost is justified
        ItemBuilder::new("Babushka's Surprise", "A volatile concoction wrapped in old cloth and sealed with rendered fat. My grandmother always said: 'When the wolves come to your door, show them what a proper housewife can do.' Unreliable but effective against wooden structures.", ItemCategory::Placeable)
            .icon("babushka_surprise.png")
            .stackable(5)
            .crafting_cost(vec![
                CostIngredient { item_name: "Gunpowder".to_string(), quantity: 150 },
                CostIngredient { item_name: "Tallow".to_string(), quantity: 15 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 10 },
                CostIngredient { item_name: "Animal Fat".to_string(), quantity: 10 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 3 },
            ])
            .crafting_output(1, 45)
            .respawn_time(900)
            .build(),

        // Matriarch's Wrath - Tier 2 explosive (BALANCED: 300 gunpowder + 75 limestone)
        // Requires diving for limestone - ties endgame raiding to underwater economy
        // Reliable 10s fuse, no dud chance, 2.67x damage - premium explosive worth the grind
        ItemBuilder::new("Matriarch's Wrath", "The old matriarchs of Gred had a saying: 'A grandmother's love can move mountains - her fury can level them.' This is the recipe they never wrote down. A sophisticated demolition device using coral limestone as a stabilizer. Will tear through even the strongest fortifications.", ItemCategory::Placeable)
            .icon("matriarch_wrath.png")
            .stackable(3)
            .crafting_cost(vec![
                CostIngredient { item_name: "Gunpowder".to_string(), quantity: 300 },
                CostIngredient { item_name: "Limestone".to_string(), quantity: 75 }, // Underwater economy - requires diving!
                CostIngredient { item_name: "Tallow".to_string(), quantity: 20 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 40 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 15 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 60)
            .respawn_time(1200)
            .build(),
    ]
}
