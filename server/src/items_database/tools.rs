use crate::items::{ItemDefinition, ItemCategory, CostIngredient};
use crate::models::{EquipmentSlotType, TargetType};
use crate::items_database::builders::{ItemBuilder, basic_tool, basic_material};

pub fn get_tool_definitions() -> Vec<ItemDefinition> {
    vec![
        // GATHERING TOOLS - Migrated from original items_database.rs

        // Bush Knife - Versatile tool for wood cutting
        ItemBuilder::new("Bush Knife", "A heavy-duty clearing blade used for cutting brush and light timber around military installations. Versatile in combat and useful for woodcutting, though less efficient than a proper hatchet.", ItemCategory::Tool)
            .icon("machete.png")
            .equippable(None)

            .primary_target_damage(30, 40)
            .primary_target_yield(9, 14)
            .primary_target_type(TargetType::Tree)
            .primary_yield_resource("Wood")
            .pvp_damage(35, 35)
            .bleed_effect(3.5, 10.0, 1.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 200 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 30 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 10)
            .respawn_time(900)
            .attack_interval(0.6)
            .build(),

        // Corpse Processing Tools 
        ItemBuilder::new("Bone Club", "A heavy club made from a large bone and bindings. Good for crushing corpses and extracting resources.", ItemCategory::Tool)
            .icon("bone_club.png")
            .equippable(None)
            
            .primary_target_damage(20, 20)
            .primary_target_yield(3, 3)
            .primary_target_type(TargetType::PlayerCorpse)
            .primary_yield_resource("Corpse Parts")
            .pvp_damage(25, 25)
            .crafting_cost(vec![
                CostIngredient { item_name: "Bone Fragments".to_string(), quantity: 125 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 5)
            .attack_interval(0.8)
            .build(),

        ItemBuilder::new("Bone Knife", "A sharp knife crafted from bone. Quick but not very durable. Excellent for harvesting corpses.", ItemCategory::Tool)
            .icon("bone_knife.png")
            .equippable(None)
            
            .primary_target_damage(25, 25)
            .primary_target_yield(5, 5)
            .primary_target_type(TargetType::PlayerCorpse)
            .primary_yield_resource("Corpse Parts")
            .pvp_damage(15, 20)
            .bleed_effect(1.0, 5.0, 1.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Bone Fragments".to_string(), quantity: 50 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 2)
            .attack_interval(0.5)
            .build(),

        // Tidebreaker Blade - Underwater harvesting knife that works while snorkeling
        ItemBuilder::new("Tidebreaker Blade", "A specialized diving knife with a serrated edge designed for underwater work. The corrugated grip prevents slipping when wet, and the blade geometry is optimized for cutting through tough marine life. Essential for harvesting sharks and jellyfish.", ItemCategory::Tool)
            .icon("tidebreaker_blade.png")
            .equippable(None)
            
            .primary_target_damage(30, 30)
            .primary_target_yield(4, 6)
            .primary_target_type(TargetType::AnimalCorpse)
            .primary_yield_resource("Animal Parts")
            .pvp_damage(22, 28)
            .bleed_effect(2.0, 6.0, 1.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 80 },
                CostIngredient { item_name: "Coral Fragments".to_string(), quantity: 15 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 8)
            .attack_interval(0.55)
            .build(),

        // Repair Tool
        ItemBuilder::new("Repair Hammer", "A simple hammer for repairing structures and maintaining equipment.", ItemCategory::Tool)
            .icon("repair_hammer.png")
            .equippable(None)
            
            .pvp_damage(5, 5)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 150 },
            ])
            .crafting_output(1, 5)
            .respawn_time(420)
            .attack_interval(1.0)
            .build(),

        // Primary Gathering Tools
        // Yield formula: For 100% resource extraction, yield = resources * damage / health
        // Trees: 800 HP, 150-500 resources (avg 325). Stone Hatchet should get ~90%, Metal ~100%
        basic_tool("Stone Hatchet", "A simple hatchet for chopping wood.", 
                  TargetType::Tree, 35, 50, 16, 22, "Wood") // Increased yield from 12-18 to 16-22 for ~90% extraction
            .icon("stone_hatchet.png")
            .pvp_damage(15, 20)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 200 },
                CostIngredient { item_name: "Stone".to_string(), quantity: 100 },
            ])
            .crafting_output(1, 7)
            .respawn_time(600)
            .attack_interval(0.8)
            .build(),

        basic_tool("Metal Hatchet", "A robust metal hatchet that cuts through wood efficiently. Gathers significantly more wood than its stone counterpart.",
                  TargetType::Tree, 60, 80, 30, 40, "Wood") // Increased yield from 25-35 to 30-40 for ~100% extraction
            .icon("metal_hatchet.png")
            .pvp_damage(22, 30)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 200 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 150 },
            ])
            .crafting_output(1, 10)
            .respawn_time(900)
            .attack_interval(0.7)
            .build(),

        ItemBuilder::new("Combat Ladle", "A surprisingly sturdy ladle, ready for a culinary confrontation. Also works as a basic gathering tool.", ItemCategory::Tool)
            .icon("combat_ladle.png")
            .equippable(None)
            
            .primary_target_damage(3, 7)
            .pvp_damage(10, 10)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 50 },
            ])
            .crafting_output(1, 2)
            .respawn_time(300)
            .attack_interval(0.7)
            .build(),

        // Stones: 400 HP, 200-400 resources (avg 300). Yields need to be MUCH higher to extract before HP depletes.
        // Stone Pickaxe: ~7 hits to kill (400/55), needs ~43 yield/hit for 300 resources
        // Metal Pickaxe: ~4 hits to kill (400/90), needs ~75 yield/hit for 300 resources
        basic_tool("Stone Pickaxe", "A simple pickaxe for breaking rocks.",
                  TargetType::Stone, 40, 70, 35, 50, "Stone") // Massively increased yield from 8-14 to 35-50 for ~90% extraction
            .icon("stone_pickaxe.png")
            .equippable(None)
            .pvp_damage(18, 25)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 200 },
                CostIngredient { item_name: "Stone".to_string(), quantity: 100 },
            ])
            .crafting_output(1, 7)
            .respawn_time(600)
            .attack_interval(1.2)
            .build(),

        basic_tool("Metal Pickaxe", "A sturdy metal pickaxe that breaks rocks efficiently. Gathers significantly more stone than its stone counterpart.",
                  TargetType::Stone, 60, 120, 60, 85, "Stone") // Massively increased yield from 13-22 to 60-85 for ~100% extraction
            .icon("metal_pickaxe.png")
            .equippable(None)
            .pvp_damage(25, 35)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 200 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 150 },
            ])
            .crafting_output(1, 10)
            .respawn_time(900)
            .attack_interval(1.0)
            .build(),

        ItemBuilder::new("Rock", "A basic tool for gathering.", ItemCategory::Tool)
            .icon("rock_item.png")
            .equippable(None)
            
            .primary_target_damage(3, 7)
            .pvp_damage(5, 5)
            .crafting_cost(vec![
                CostIngredient { item_name: "Stone".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 1)
            .respawn_time(30)
            .attack_interval(1.2)
            .build(),

        // Light Sources
        ItemBuilder::new("Torch", "Provides light and some warmth when lit. Can be used as a makeshift weapon.", ItemCategory::Tool)
            .icon("torch.png")
            .equippable(None)
            
            .pvp_damage(5, 5)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 20 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 1)
            .respawn_time(30)
            .attack_interval(0.5)
            .build(),
        ItemBuilder::new("Flashlight", "A handheld electric light source. Provides bright, focused illumination and slows down nighttime apparitions.", ItemCategory::Tool)
            .icon("flashlight.png")
            .equippable(None)
            
            .crafting_cost(vec![
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 50 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 10 },
                CostIngredient { item_name: "Scrap Batteries".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 7)
            .respawn_time(600)
            .build(),

        // Medical Tools
        ItemBuilder::new("Bandage", "A simple bandage to patch up wounds. Stops bleeding and restores health.", ItemCategory::Tool)
            .icon("bandage.png")
            .stackable(10)
            .equippable(None)
            
            .consumable(25.0, 0.0, 0.0)
            .consumable_duration(5.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 1)
            .respawn_time(300)
            .build(),

        // Med Kit - Military-grade first aid kit, better than bandage
        ItemBuilder::new("Med Kit", "A compact military first aid kit containing sterile dressings, antiseptic, and compression bandages. Standard issue for Soviet troops.", ItemCategory::Tool)
            .icon("med_kit.png")
            .stackable(5)
            .equippable(None)
            .consumable(35.0, 0.0, 0.0) // Better than bandage (25), worse than jellyfish compress (45)
            .consumable_duration(4.0) // Faster than bandage (5s), slower than jellyfish (3.5s)
            .respawn_time(600) // Not craftable - loot only
            .build(),

        // Jellyfish Compress - Advanced bandage with burn healing properties
        ItemBuilder::new("Jellyfish Compress", "A medical dressing infused with jellyfish gel and wrapped in translucent membrane. The cooling properties soothe burns while the collagen promotes rapid wound healing. More effective than a standard bandage.", ItemCategory::Tool)
            .icon("jellyfish_compress.png")
            .stackable(10)
            .equippable(None)
            
            .consumable(45.0, 0.0, 0.0) // +80% more healing than standard bandage
            .consumable_duration(3.5) // Faster application than bandage
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 1 },
                CostIngredient { item_name: "Jellyfish Membrane".to_string(), quantity: 1 },
                CostIngredient { item_name: "Jellyfish Gel".to_string(), quantity: 2 },
            ])
            .crafting_output(2, 4) // Makes 2 compresses
            .respawn_time(400)
            .build(),

        ItemBuilder::new("Selo Olive Oil", "Premium olive oil with miraculous healing properties. Restores health, stamina, warmth, hunger, and thirst.", ItemCategory::Tool)
            .icon("selo_olive_oil.png")
            .stackable(5)
            .equippable(None)
            
            .consumable(100.0, 100.0, 100.0)
            .consumable_duration(2.0)
            .warmth_bonus(100.0)
            .respawn_time(1800)
            .build(),

        // Utility Tools
        ItemBuilder::new("Blueprint", "A blueprint that allows you to build structures.", ItemCategory::Tool)
            .icon("blueprint.png")
            .equippable(None)
            .pvp_damage(0, 0) // Blueprint does no damage - it's only for building structures
            
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 50 },
            ])
            .crafting_output(1, 2)
            .respawn_time(300)
            .build(),

        // Reed-based Tools (Note: Reed Snorkel moved to armor.rs as head slot item)
        ItemBuilder::new("Primitive Reed Fishing Rod", "A basic fishing rod crafted from a sturdy reed stalk and simple line. Allows for catching small fish and other aquatic resources.", ItemCategory::Tool)
            .icon("reed_fishing_rod.png")
            .equippable(None)
            
            .primary_target_damage(5, 8)
            .pvp_damage(8, 12)
            .crafting_cost(vec![
                CostIngredient { item_name: "Common Reed Stalk".to_string(), quantity: 3 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 15 },
                CostIngredient { item_name: "Bone Gaff Hook".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 5)
            .respawn_time(360)
            .attack_interval(1.2)
            .build(),

        ItemBuilder::new("Bone Gaff Hook", "A sharp, curved bone hook that can be used as a fishing gaff or improvised weapon. A component for crafting fishing rods.", ItemCategory::Tool)
            .icon("fishing_gaff_hook.png")
            .equippable(None)

            .primary_target_damage(10, 15)
            .pvp_damage(18, 22)
            .bleed_effect(2.0, 6.0, 1.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Bone Fragments".to_string(), quantity: 35 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 8 },
            ])
            .crafting_output(1, 3)
            .respawn_time(300)
            .attack_interval(0.6)
            .build(),

        // Diving Pick - Specialized underwater harvesting tool for living coral
        // Living Coral: 500 HP, 150-300 resources (avg 225). For 100% extraction: yield = 225 * 50 / 500 = 22.5
        ItemBuilder::new("Diving Pick", "A specialized pick designed for underwater harvesting. Required to harvest living coral reefs. Crafted from coral fragments, wood, and reed stalks.", ItemCategory::Tool)
            .icon("diving_pick.png")
            .equippable(None)
            // Primary target: Living Coral - yields Limestone
            .primary_target_type(TargetType::LivingCoral)
            .primary_target_damage(40, 60)  // Damage per hit to coral
            .primary_target_yield(20, 28)   // Increased from 8-15 to 20-28 Limestone per hit for ~100% extraction
            .primary_yield_resource("Limestone")
            .pvp_damage(15, 20)
            .crafting_cost(vec![
                CostIngredient { item_name: "Coral Fragments".to_string(), quantity: 10 },
                CostIngredient { item_name: "Wood".to_string(), quantity: 3 },
                CostIngredient { item_name: "Common Reed Stalk".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 7)
            .respawn_time(600)
            .attack_interval(1.0)
            .build(),

        ItemBuilder::new("Reed Bellows", "A primitive bellows crafted from reed stalks and animal leather. When placed in campfires: makes fuel burn 50% slower and cooking 20% faster. When placed in furnaces: makes fuel burn 50% slower and smelting 20% faster.", ItemCategory::Tool)
            .icon("reed_bellows.png")
            .crafting_cost(vec![
                CostIngredient { item_name: "Common Reed Stalk".to_string(), quantity: 12 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 8 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 4 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 75 },
            ])
            .crafting_output(1, 5)
            .respawn_time(900)
            .build(),

        // Water Storage Tools
        ItemBuilder::new("Reed Water Bottle", "A portable water container crafted from hollow reed segments sealed with tallow. Can be filled from water sources by pressing F. Capacity: 2L.", ItemCategory::Tool)
            .icon("reed_water_bottle.png")
            .equippable(None)
            .crafting_cost(vec![
                CostIngredient { item_name: "Common Reed Stalk".to_string(), quantity: 4 },
                CostIngredient { item_name: "Tallow".to_string(), quantity: 3 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 5)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Plastic Water Jug", "A large plastic container for storing water. Durable and lightweight with excellent capacity. Can be filled from water sources by pressing F. Capacity: 5L.", ItemCategory::Tool)
            .icon("water_jug.png")
            .equippable(None)
            .crafting_cost(vec![
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 25 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
                CostIngredient { item_name: "Tallow".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 7)
            .respawn_time(720)
            .build(),

        // Fertilizer - Organic nutrient tool for farming (equippable, consumable)
        ItemBuilder::new("Fertilizer", "Rich organic fertilizer made from decomposed organic matter. Equip and left-click to apply to crops for significant growth boost. Right-click to consume directly.", ItemCategory::Tool)
            .icon("fertilizer.png")
            .equippable(None)
            .stackable(500)
            .consumable(0.0, 0.0, 0.0) // No nutritional value, but consumable via right-click
            .respawn_time(300)
            .build(),

        // Tiller - Farming tool for preparing soil
        ItemBuilder::new("Stone Tiller", "A primitive farming tool with a sturdy stone head. Used to till soil, converting terrain into prepared dirt for farming. Tilled soil provides a +50% growth bonus to planted seeds. Tilled tiles revert after 48 hours.", ItemCategory::Tool)
            .icon("stone_tiller.png")
            .equippable(None)
            .pvp_damage(12, 18)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 150 },
                CostIngredient { item_name: "Stone".to_string(), quantity: 80 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 20 },
            ])
            .crafting_output(1, 5)
            .respawn_time(600)
            .attack_interval(0.9)
            .build(),

        // Bone Carving Kit - Unique tool found at Whale Bone Graveyard for crafting bone totems
        ItemBuilder::new("Bone Carving Kit", "An ancient Unangan carving kit containing traditional bone-working tools: a curved adze, serrated scrapers, and polishing stones. Used by Aleut artisans to craft powerful bone totems imbued with animal spirits.", ItemCategory::Tool)
            .icon("bone_carving_kit.png")
            .respawn_time(1800) // 30 minute respawn
            .build(),
    ]
}
