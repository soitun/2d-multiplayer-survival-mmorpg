use super::builders::{ItemBuilder};
use crate::items::{ItemDefinition, ItemCategory, CostIngredient};
use crate::models::EquipmentSlotType;

pub fn get_armor_definitions() -> Vec<ItemDefinition> {
    vec![
        // === CLOTH ARMOR SET ===
        // Complete set of basic cloth armor providing warmth and minimal protection

        // Cloth Hood - Head protection
        ItemBuilder::new("Cloth Hood", "Basic head covering.", ItemCategory::Armor)
            .icon("cloth_hood.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor(0.01, Some(0.2))
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 20 },
            ])
            .crafting_output(1, 10)
            .respawn_time(420)
            .build(),

        // Cloth Shirt - Chest protection
        ItemBuilder::new("Cloth Shirt", "Simple protection for the torso.", ItemCategory::Armor)
            .icon("cloth_shirt.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor(0.01, Some(0.2))
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 40 },
            ])
            .crafting_output(1, 15)
            .respawn_time(420)
            .build(),

        // Cloth Pants - Leg protection
        ItemBuilder::new("Cloth Pants", "Simple protection for the legs.", ItemCategory::Armor)
            .icon("cloth_pants.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor(0.01, Some(0.2))
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 30 },
            ])
            .crafting_output(1, 15)
            .respawn_time(420)
            .build(),

        // Cloth Gloves - Hand protection
        ItemBuilder::new("Cloth Gloves", "Basic hand coverings.", ItemCategory::Armor)
            .icon("cloth_gloves.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor(0.01, Some(0.2))
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 15 },
            ])
            .crafting_output(1, 5)
            .respawn_time(420)
            .build(),

        // Cloth Boots - Foot protection
        ItemBuilder::new("Cloth Boots", "Simple footwear.", ItemCategory::Armor)
            .icon("cloth_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor(0.01, Some(0.2))
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 15 },
            ])
            .crafting_output(1, 5)
            .respawn_time(420)
            .build(),

        // Cloth Cape - Back protection with extra warmth
        ItemBuilder::new("Cloth Cape", "A simple cape made of cloth.", ItemCategory::Armor)
            .icon("burlap_cape.png")
            .equippable(Some(EquipmentSlotType::Back))
            .armor(0.01, Some(0.25))
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 30 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 20)
            .respawn_time(420)
            .build(),

        // === SPECIAL ARMOR ===

        // Headlamp - Head armor with light source functionality
        ItemBuilder::new("Headlamp", "A head-mounted lamp that provides hands-free lighting. Burns tallow or olive oil for fuel and offers basic head protection.", ItemCategory::Armor)
            .icon("tallow_head_lamp.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor(0.02, Some(0.3))
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 15 },
                CostIngredient { item_name: "Tallow".to_string(), quantity: 5 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 20 },
            ])
            .crafting_output(1, 15)
            .respawn_time(480)
            .build(),

        // === BONE ARMOR SET ===
        // High projectile resistance, moderate melee protection
        // Full set provides strong defense against ranged attacks

        ItemBuilder::new("Bone Helmet", "A helmet crafted from animal bones. Excellent projectile resistance.", ItemCategory::Armor)
            .icon("bone_helmet.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor(0.08, None) // 8% damage resistance, no warmth
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Bone".to_string(), quantity: 40 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 20)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Bone Chestplate", "A chestplate made from reinforced animal bones.", ItemCategory::Armor)
            .icon("bone_chestplate.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor(0.12, None) // 12% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Bone".to_string(), quantity: 80 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 30)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Bone Leggings", "Leg protection crafted from sturdy animal bones.", ItemCategory::Armor)
            .icon("bone_leggings.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor(0.10, None) // 10% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Bone".to_string(), quantity: 60 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 8 },
            ])
            .crafting_output(1, 25)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Bone Gauntlets", "Hand protection made from carved bone pieces.", ItemCategory::Armor)
            .icon("bone_gauntlets.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor(0.06, None) // 6% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Bone".to_string(), quantity: 30 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 4 },
            ])
            .crafting_output(1, 15)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Bone Boots", "Reinforced footwear with bone plating.", ItemCategory::Armor)
            .icon("bone_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor(0.06, None) // 6% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Bone".to_string(), quantity: 30 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 4 },
            ])
            .crafting_output(1, 15)
            .respawn_time(480)
            .build(),

        // === WOOD ARMOR SET ===
        // Strong melee protection but vulnerable to fire
        // Provides good physical defense

        ItemBuilder::new("Wooden Helmet", "A helmet carved from hardwood. Strong against melee.", ItemCategory::Armor)
            .icon("wooden_helmet.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor(0.10, None) // 10% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 100 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 20)
            .respawn_time(450)
            .build(),

        ItemBuilder::new("Wooden Chestplate", "A sturdy chestplate made from thick wooden planks.", ItemCategory::Armor)
            .icon("wooden_chestplate.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor(0.15, None) // 15% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 200 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 30)
            .respawn_time(450)
            .build(),

        ItemBuilder::new("Wooden Leggings", "Leg protection crafted from reinforced wood.", ItemCategory::Armor)
            .icon("wooden_leggings.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor(0.12, None) // 12% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 150 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 8 },
            ])
            .crafting_output(1, 25)
            .respawn_time(450)
            .build(),

        ItemBuilder::new("Wooden Gauntlets", "Hand guards made from carved hardwood.", ItemCategory::Armor)
            .icon("wooden_gauntlets.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor(0.08, None) // 8% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 80 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 4 },
            ])
            .crafting_output(1, 15)
            .respawn_time(450)
            .build(),

        ItemBuilder::new("Wooden Boots", "Sturdy footwear reinforced with wooden plates.", ItemCategory::Armor)
            .icon("wooden_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor(0.08, None) // 8% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 80 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 4 },
            ])
            .crafting_output(1, 15)
            .respawn_time(450)
            .build(),

        // === LEATHER ARMOR SET ===
        // Balanced protection with good durability
        // Moderate defense across the board

        ItemBuilder::new("Leather Helmet", "A helmet made from cured animal leather.", ItemCategory::Armor)
            .icon("leather_helmet.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor(0.07, None) // 7% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 15 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 3 },
            ])
            .crafting_output(1, 18)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Leather Chestplate", "A durable chestplate crafted from thick leather.", ItemCategory::Armor)
            .icon("leather_chestplate.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor(0.11, None) // 11% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 30 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 6 },
            ])
            .crafting_output(1, 25)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Leather Leggings", "Flexible leg protection made from leather.", ItemCategory::Armor)
            .icon("leather_leggings.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor(0.09, None) // 9% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 22 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 22)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Leather Gauntlets", "Hand protection crafted from supple leather.", ItemCategory::Armor)
            .icon("leather_gauntlets.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor(0.05, None) // 5% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 12 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 12)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Leather Boots", "Comfortable boots made from treated leather.", ItemCategory::Armor)
            .icon("leather_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor(0.05, None) // 5% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 12 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 12)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Leather Mantle", "A protective leather covering for the back.", ItemCategory::Armor)
            .icon("leather_mantle.png")
            .equippable(Some(EquipmentSlotType::Back))
            .armor(0.07, None) // 7% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 18 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 4 },
            ])
            .crafting_output(1, 18)
            .respawn_time(420)
            .build(),

        // === SCALE ARMOR SET ===
        // Heavy armor with strong slash and projectile resistance
        // Best overall protection but no warmth

        ItemBuilder::new("Scale Helmet", "A helmet covered in overlapping viper scales.", ItemCategory::Armor)
            .icon("scale_helmet.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor(0.12, None) // 12% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Viper Scale".to_string(), quantity: 60 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 8 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 30)
            .respawn_time(540)
            .build(),

        ItemBuilder::new("Scale Chestplate", "A heavy chestplate armored with layered scales.", ItemCategory::Armor)
            .icon("scale_chestplate.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor(0.18, None) // 18% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Viper Scale".to_string(), quantity: 120 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 15 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 20 },
            ])
            .crafting_output(1, 45)
            .respawn_time(540)
            .build(),

        ItemBuilder::new("Scale Leggings", "Leg armor reinforced with protective scales.", ItemCategory::Armor)
            .icon("scale_leggings.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor(0.15, None) // 15% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Viper Scale".to_string(), quantity: 90 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 12 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 15 },
            ])
            .crafting_output(1, 38)
            .respawn_time(540)
            .build(),

        ItemBuilder::new("Scale Gauntlets", "Hand guards covered in interlocking scales.", ItemCategory::Armor)
            .icon("scale_gauntlets.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor(0.10, None) // 10% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Viper Scale".to_string(), quantity: 45 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 6 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 8 },
            ])
            .crafting_output(1, 22)
            .respawn_time(540)
            .build(),

        ItemBuilder::new("Scale Boots", "Heavy boots reinforced with scale plating.", ItemCategory::Armor)
            .icon("scale_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor(0.10, None) // 10% damage resistance
            .crafting_cost(vec![
                CostIngredient { item_name: "Viper Scale".to_string(), quantity: 45 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 6 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 8 },
            ])
            .crafting_output(1, 22)
            .respawn_time(540)
            .build(),

        // === FOX FUR ARMOR SET ===
        // Light insulating armor with cold resistance
        // Low protection but excellent warmth

        ItemBuilder::new("Fox Fur Hood", "A warm hood lined with soft fox fur.", ItemCategory::Armor)
            .icon("fox_fur_hood.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor(0.03, Some(0.8)) // 3% damage resistance, 0.8 warmth/sec
            .crafting_cost(vec![
                CostIngredient { item_name: "Fox Fur".to_string(), quantity: 20 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 3 },
            ])
            .crafting_output(1, 15)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Fox Fur Coat", "A lightweight coat made from fox pelts.", ItemCategory::Armor)
            .icon("fox_fur_coat.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor(0.04, Some(1.2)) // 4% damage resistance, 1.2 warmth/sec
            .crafting_cost(vec![
                CostIngredient { item_name: "Fox Fur".to_string(), quantity: 40 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 6 },
            ])
            .crafting_output(1, 22)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Fox Fur Leggings", "Warm leg coverings made from fox fur.", ItemCategory::Armor)
            .icon("fox_fur_leggings.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor(0.03, Some(0.9)) // 3% damage resistance, 0.9 warmth/sec
            .crafting_cost(vec![
                CostIngredient { item_name: "Fox Fur".to_string(), quantity: 30 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 18)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Fox Fur Gloves", "Insulated gloves lined with fox fur.", ItemCategory::Armor)
            .icon("fox_fur_gloves.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor(0.02, Some(0.5)) // 2% damage resistance, 0.5 warmth/sec
            .crafting_cost(vec![
                CostIngredient { item_name: "Fox Fur".to_string(), quantity: 15 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 10)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Fox Fur Boots", "Warm boots lined with soft fox fur.", ItemCategory::Armor)
            .icon("fox_fur_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor(0.02, Some(0.5)) // 2% damage resistance, 0.5 warmth/sec
            .crafting_cost(vec![
                CostIngredient { item_name: "Fox Fur".to_string(), quantity: 15 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 10)
            .respawn_time(420)
            .build(),

        // === WOLF FUR ARMOR SET ===
        // Thick insulating armor with moderate protection
        // Good balance of warmth and defense

        ItemBuilder::new("Wolf Fur Hood", "A thick hood made from wolf pelts.", ItemCategory::Armor)
            .icon("wolf_fur_hood.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor(0.06, Some(1.0)) // 6% damage resistance, 1.0 warmth/sec
            .crafting_cost(vec![
                CostIngredient { item_name: "Wolf Fur".to_string(), quantity: 25 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 4 },
            ])
            .crafting_output(1, 20)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Wolf Fur Coat", "A heavy coat made from thick wolf fur.", ItemCategory::Armor)
            .icon("wolf_fur_coat.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor(0.09, Some(1.5)) // 9% damage resistance, 1.5 warmth/sec
            .crafting_cost(vec![
                CostIngredient { item_name: "Wolf Fur".to_string(), quantity: 50 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 8 },
            ])
            .crafting_output(1, 30)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Wolf Fur Leggings", "Durable leg coverings made from wolf pelts.", ItemCategory::Armor)
            .icon("wolf_fur_leggings.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor(0.07, Some(1.2)) // 7% damage resistance, 1.2 warmth/sec
            .crafting_cost(vec![
                CostIngredient { item_name: "Wolf Fur".to_string(), quantity: 38 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 6 },
            ])
            .crafting_output(1, 25)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Wolf Fur Gloves", "Thick gloves lined with wolf fur.", ItemCategory::Armor)
            .icon("wolf_fur_gloves.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor(0.04, Some(0.7)) // 4% damage resistance, 0.7 warmth/sec
            .crafting_cost(vec![
                CostIngredient { item_name: "Wolf Fur".to_string(), quantity: 18 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 3 },
            ])
            .crafting_output(1, 15)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Wolf Fur Boots", "Sturdy boots lined with warm wolf fur.", ItemCategory::Armor)
            .icon("wolf_fur_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor(0.04, Some(0.7)) // 4% damage resistance, 0.7 warmth/sec
            .crafting_cost(vec![
                CostIngredient { item_name: "Wolf Fur".to_string(), quantity: 18 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 3 },
            ])
            .crafting_output(1, 15)
            .respawn_time(480)
            .build(),

    ]
}
