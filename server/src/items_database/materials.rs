use super::builders::{ItemBuilder, basic_material};
use crate::items::{ItemDefinition, ItemCategory, CostIngredient};

pub fn get_material_definitions() -> Vec<ItemDefinition> {
    vec![
        // === BASIC CRAFTING MATERIALS === 

        // Wood - Primary fuel and building material
        basic_material("Wood", "A sturdy piece of wood. Good for fuel.", 1000)
            .icon("wood.png")
            .fuel(5.0)
            .respawn_time(300)
            .build(),

        // Stone - Basic building material
        basic_material("Stone", "A chunk of stone ore.", 1000)
            .icon("stone.png")
            .respawn_time(300)
            .build(),

        // Plant Fiber - Basic textile material and fuel
        basic_material("Plant Fiber", "Fibrous material from plants, used for making cloth or as a quick, inefficient fuel.", 1000)
            .icon("plant_fiber.png")
            .fuel(2.5)
            .respawn_time(300)
            .build(),

        // Cloth - Crafted textile
        ItemBuilder::new("Cloth", "Woven fabric, used for basic clothing.", ItemCategory::Material)
            .icon("cloth.png")
            .stackable(1000)
            .crafting_cost(vec![
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 1)
            .respawn_time(300)
            .build(),

        // Charcoal - Essential for ammunition and advanced crafting
        basic_material("Charcoal", "Carbon residue from burnt organic matter. Essential crafting material for ammunition and advanced items.", 1000)
            .icon("charcoal.png")
            .respawn_time(300)
            .build(),

        // === BONE MATERIALS ===

        // Bone Fragments - From processing bones
        basic_material("Bone Fragments", "Sharp fragments of bone. Useful for crafting arrowheads.", 2000)
            .icon("bone_fragments.png")
            .build(),

        // Animal Bone - Whole bones
        basic_material("Animal Bone", "A sturdy animal bone. Useful for crafting basic tools and weapons.", 250)
            .icon("bone.png")
            .build(),

        // Animal Fat - Used for crafting tallow and other items
        basic_material("Animal Fat", "A slippery piece of animal fat. Can be combined with cloth to make tallow.", 100)
            .icon("animal_fat.png")
            .respawn_time(300)
            .build(),

        // === METAL MATERIALS ===

        // Scrap Batteries - Scavenged electronics
        basic_material("Scrap Batteries", "Damaged and partially depleted batteries. Can be used to craft basic electronics or as a power source in a pinch.", 10)
            .icon("scrap_batteries.png")
            .respawn_time(300)
            .build(),

        // Metal Ore - Raw metal resource
        basic_material("Metal Ore", "Raw metallic ore extracted from the ground. Can be smelted into metal fragments.", 1000)
            .icon("metal.png")
            .respawn_time(300)
            .build(),

        // Metal Fragments - Processed metal
        basic_material("Metal Fragments", "Processed metal fragments smelted from metal ore. Used for crafting advanced tools and equipment.", 1000)
            .icon("metal_fragments.png")
            .respawn_time(300)
            .build(),

        // Sulfur Ore - Raw sulfur resource
        basic_material("Sulfur Ore", "Raw sulfur ore extracted from mineral deposits. Useful for crafting explosives and advanced materials.", 1000)
            .icon("sulfur_ore.png")
            .respawn_time(300)
            .build(),

        // Sulfur - Refined material
        basic_material("Sulfur", "Refined sulfur obtained by processing sulfur ore. Essential for crafting gunpowder and explosives.", 1000)
            .icon("sulfur.png")
            .respawn_time(300)
            .stackable(1000)
            .build(),

        // Tin Can - Can be smelted into metal fragments
        ItemBuilder::new("Tin Can", "An empty tin can. Could be useful for crafting or as a container.", ItemCategory::Material)
            .icon("tin_can.png")
            .stackable(5)
            .cook_time(15.0)
            .cooked_item("Metal Fragments")
            .crafting_output(4, 15) // 4 metal fragments per tin can
            .respawn_time(600)
            .build(),

        // === FISHING JUNK ITEMS ===
        // Items that can be caught while fishing (junk catches)
        
        // Old Boot - Worthless junk from fishing
        basic_material("Old Boot", "A waterlogged, tattered boot pulled from the depths. Completely useless.", 10)
            .icon("old_boot.png")
            .build(),

        // Rusty Hook - Can be smelted into metal fragments (like tin can)
        ItemBuilder::new("Rusty Hook", "An old, rusted fishing hook. Could be smelted down for metal fragments.", ItemCategory::Material)
            .icon("rusty_hook.png")
            .stackable(10)
            .cook_time(12.0)
            .cooked_item("Metal Fragments")
            .crafting_output(2, 10) // 2 metal fragments per hook
            .build(),

        // NOTE: Seaweed moved to consumables.rs - it's an edible item, not a material

        // Aleut Charm - Small carved amulet lost in the waters
        basic_material("Aleut Charm", "A small, weathered charm carved from bone or stone. Once held significance to Aleut peoples, now just a lost trinket.", 4)
            .icon("aleut_charm.png")
            .build(),

        // Shell Fragment - Small broken shell piece
        basic_material("Shell Fragment", "A small fragment of shell worn smooth by the Aleutian tides. Too broken to be of any use.", 3)
            .icon("shell_fragment.png")
            .build(),

        // Sea Glass - Natural glass fragments smoothed by the ocean
        basic_material("Sea Glass", "Smooth, frosted glass fragments worn by the Aleutian tides. Beautiful but useless.", 5)
            .icon("sea_glass.png")
            .build(),

        // Whale Bone Fragment - Small bone piece from Aleutian waters, can be crushed into bone fragments
        basic_material("Whale Bone Fragment", "A small fragment of whale bone pulled from the Aleutian depths. Can be crushed into bone fragments.", 20)
            .icon("whale_bone_fragment.png")
            .build(),

        // === ADVANCED CRAFTING MATERIALS ===

        // Gunpowder - Made from charcoal and sulfur (essential for ammunition)
        ItemBuilder::new("Gunpowder", "A volatile black powder made from charcoal and sulfur. Essential for crafting ammunition and explosives.", ItemCategory::Material)
            .icon("gunpowder.png")
            .stackable(500)
            .crafting_cost(vec![
                CostIngredient { item_name: "Charcoal".to_string(), quantity: 10 },
                CostIngredient { item_name: "Sulfur".to_string(), quantity: 5 },
            ])
            .crafting_output(5, 3) // Makes 5 gunpowder, takes 3 seconds
            .respawn_time(300)
            .build(),

        // Rope - Made from plant fiber
        ItemBuilder::new("Rope", "Strong rope made from twisted plant fibers. Essential for advanced crafting.", ItemCategory::Material)
            .icon("rope.png")
            .stackable(50)
            .crafting_cost(vec![
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 20 },
            ])
            .crafting_output(1, 8)
            .respawn_time(360)
            .build(),

        // Common Reed Stalk - Water plant material
        basic_material("Common Reed Stalk", "A hollow reed stalk found near water sources. The natural tube makes it useful for crafting breathing apparatus.", 100)
            .icon("reed_stalk.png")
            .respawn_time(240)
            .build(),

        // Memory Shard - Common technological foundational resource
        basic_material("Memory Shard", "A rugged cognitive archive from the crashed Sovereign Tide flagship. These modular data chips stored tactical memory blocks and were designed to survive extreme conditions.", 5000)
            .icon("memory_shard.png")
            .respawn_time(600) // 10 minutes - common foundational resource
            .build(),

        // === ANIMAL MATERIALS ===

        // Cable Viper Gland - Poison gland
        basic_material("Cable Viper Gland", "A venomous gland extracted from a Cable Viper. Contains potent toxins that could be used for crafting specialized items or weapons.", 50)
            .icon("cable_viper_gland.png")
            .build(),

        // Fox Fur - Warm clothing material
        basic_material("Fox Fur", "Soft, warm fur from a fox. Valuable for crafting warm clothing and insulation.", 20)
            .icon("fox_fur.png")
            .build(),

        // Wolf Fur - Heavy-duty clothing material
        basic_material("Wolf Fur", "Dense, warm fur from a wolf. Excellent for crafting heavy-duty winter clothing and insulation.", 20)
            .icon("wolf_fur.png")
            .build(),

        // Viper Scale - Armor material
        basic_material("Viper Scale", "Tough, flexible scales from a viper. Useful for lightweight armor and water-resistant materials.", 20)
            .icon("viper_scale.png")
            .build(),

        // Animal Leather - Universal leather resource
        basic_material("Animal Leather", "Processed leather from various animal hides. A versatile material for crafting clothing, armor, and equipment.", 50)
            .icon("animal_leather.png")
            .build(),

        // Crab Carapace - Armor component from crabs
        basic_material("Crab Carapace", "A hard, protective shell from a beach crab. Lightweight yet sturdy, useful for crafting protective gear.", 10)
            .icon("crab_carapace.png")
            .build(),

        // Crab Claw - Weapon/tool component from crabs
        basic_material("Crab Claw", "A sharp pincer claw from a beach crab. Can be fashioned into improvised weapons or tools.", 20)
            .icon("crab_claw.png")
            .build(),

        // === BIRD MATERIALS ===

        // Tern Feathers - Lightweight feathers from coastal terns
        basic_material("Tern Feathers", "Soft, waterproof feathers from a coastal tern. Useful for crafting fletching and lightweight insulation.", 50)
            .icon("tern_feathers.png")
            .build(),

        // Crow Feathers - Dark feathers from inland crows
        basic_material("Crow Feathers", "Sleek black feathers from a crow. Valued for crafting arrow fletching and decorative items.", 50)
            .icon("crow_feathers.png")
            .build(),

        // NOTE: Animal skulls (Fox, Wolf, Viper) moved to weapons.rs as they are weapons like Human Skull

        // === CEREMONIAL MATERIALS ===

        // Matron's Mark - Founding token for creating a Matronage
        ItemBuilder::new("Matron's Mark", "A ceremonial token used to found a Matronage at the ALK Central Compound. Consumed upon use.", ItemCategory::Material)
            .icon("matrons_mark.png")
            .stackable(10)
            .crafting_cost(vec![
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 100 },
            ])
            .crafting_output(1, 1)
            .build(),

    ]
}
