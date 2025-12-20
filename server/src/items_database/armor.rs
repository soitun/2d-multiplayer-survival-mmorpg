use super::builders::{ItemBuilder};
use crate::items::{ItemDefinition, ItemCategory, CostIngredient};
use crate::models::{EquipmentSlotType, ArmorResistances};

pub fn get_armor_definitions() -> Vec<ItemDefinition> {
    vec![
        // === CLOTH ARMOR SET ===
        // Complete set of basic cloth armor providing warmth and minimal protection

        // Cloth Hood - Head protection
        ItemBuilder::new("Cloth Hood", "Basic head covering. Light and fast-drying.", ItemCategory::Armor)
            .icon("cloth_hood.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.01,
                projectile_resistance: 0.01,
                fire_resistance: 0.0,
                blunt_resistance: 0.01,
                slash_resistance: 0.01,
                pierce_resistance: 0.01,
                cold_resistance: 0.0,
            })
            .warmth_bonus(0.2)
            .movement_speed_modifier(0.02) // +2% speed per piece
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 20 },
            ])
            .crafting_output(1, 10)
            .respawn_time(420)
            .build(),

        // Cloth Shirt - Chest protection
        ItemBuilder::new("Cloth Shirt", "Simple protection for the torso. Light and breathable.", ItemCategory::Armor)
            .icon("cloth_shirt.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.01,
                projectile_resistance: 0.01,
                fire_resistance: 0.0,
                blunt_resistance: 0.01,
                slash_resistance: 0.01,
                pierce_resistance: 0.01,
                cold_resistance: 0.0,
            })
            .warmth_bonus(0.2)
            .movement_speed_modifier(0.02)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 40 },
            ])
            .crafting_output(1, 15)
            .respawn_time(420)
            .build(),

        // Cloth Pants - Leg protection
        ItemBuilder::new("Cloth Pants", "Simple protection for the legs. Allows quick movement.", ItemCategory::Armor)
            .icon("cloth_pants.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.01,
                projectile_resistance: 0.01,
                fire_resistance: 0.0,
                blunt_resistance: 0.01,
                slash_resistance: 0.01,
                pierce_resistance: 0.01,
                cold_resistance: 0.0,
            })
            .warmth_bonus(0.2)
            .movement_speed_modifier(0.02)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 30 },
            ])
            .crafting_output(1, 15)
            .respawn_time(420)
            .build(),

        // Cloth Gloves - Hand protection
        ItemBuilder::new("Cloth Gloves", "Basic hand coverings. Lightweight and flexible.", ItemCategory::Armor)
            .icon("cloth_gloves.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.01,
                projectile_resistance: 0.01,
                fire_resistance: 0.0,
                blunt_resistance: 0.01,
                slash_resistance: 0.01,
                pierce_resistance: 0.01,
                cold_resistance: 0.0,
            })
            .warmth_bonus(0.2)
            .movement_speed_modifier(0.02)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 15 },
            ])
            .crafting_output(1, 5)
            .respawn_time(420)
            .build(),

        // Cloth Boots - Foot protection
        ItemBuilder::new("Cloth Boots", "Simple footwear. Easy to move in.", ItemCategory::Armor)
            .icon("cloth_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.01,
                projectile_resistance: 0.01,
                fire_resistance: 0.0,
                blunt_resistance: 0.01,
                slash_resistance: 0.01,
                pierce_resistance: 0.01,
                cold_resistance: 0.0,
            })
            .warmth_bonus(0.2)
            .movement_speed_modifier(0.02)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 15 },
            ])
            .crafting_output(1, 5)
            .respawn_time(420)
            .build(),

        // Cloth Cape - Back protection with extra warmth
        ItemBuilder::new("Cloth Cape", "A simple cape made of cloth. Provides extra warmth.", ItemCategory::Armor)
            .icon("burlap_cape.png")
            .equippable(Some(EquipmentSlotType::Back))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.01,
                projectile_resistance: 0.01,
                fire_resistance: 0.0,
                blunt_resistance: 0.01,
                slash_resistance: 0.01,
                pierce_resistance: 0.01,
                cold_resistance: 0.0,
            })
            .warmth_bonus(0.25)
            .movement_speed_modifier(0.02)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cloth".to_string(), quantity: 30 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 20)
            .respawn_time(420)
            .build(),

        // === SPECIAL ARMOR ===

        // Headlamp - Head armor with light source functionality
        // Burns tallow for 30 minutes of hands-free lighting (longer than torch)
        // Durability degrades only while lit and equipped
        ItemBuilder::new("Headlamp", "A head-mounted tallow lamp that provides hands-free lighting for 30 minutes. Toggle with F key when equipped. Offers basic head protection and warmth.", ItemCategory::Armor)
            .icon("tallow_head_lamp.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.02,
                projectile_resistance: 0.02,
                fire_resistance: 0.0,
                blunt_resistance: 0.02,
                slash_resistance: 0.02,
                pierce_resistance: 0.02,
                cold_resistance: 0.0,
            })
            .warmth_bonus(0.5) // Provides slight warmth when lit
            .crafting_cost(vec![
                CostIngredient { item_name: "Tallow".to_string(), quantity: 20 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 10 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 5 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 30 },
            ])
            .crafting_output(1, 20)
            .respawn_time(600)
            .build(),

        // Reed Snorkel - Head armor with underwater stealth functionality
        // Allows player to submerge in water, becoming invisible to animals
        // Durability degrades only while submerged, lasts 45 minutes
        // Frees hands for underwater weapons like reed harpoons
        ItemBuilder::new("Reed Diver's Helm", "A breathing helmet made from hollow reeds sealed with tallow. Equip and press F while in water to submerge. Lasts 45 minutes underwater. Frees hands for underwater combat.", ItemCategory::Armor)
            .icon("reed_snorkel.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.0,
                projectile_resistance: 0.0,
                fire_resistance: 0.0,
                blunt_resistance: 0.0,
                slash_resistance: 0.0,
                pierce_resistance: 0.0,
                cold_resistance: 0.0, // No protection - it's just a breathing tube
            })
            .crafting_cost(vec![
                CostIngredient { item_name: "Common Reed Stalk".to_string(), quantity: 3 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
                CostIngredient { item_name: "Tallow".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 25)
            .respawn_time(480)
            .build(),

        // === BONE ARMOR SET ===
        // High projectile resistance, moderate melee protection, good fire resistance
        // Full set provides strong defense against ranged attacks and fire

        ItemBuilder::new("Bone Helmet", "A helmet crafted from animal bones. Lightweight yet surprisingly durable against arrows and bolts. Bones don't burn easily.", ItemCategory::Armor)
            .icon("bone_helmet.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.08,
                projectile_resistance: 0.15, // High projectile resist
                fire_resistance: 0.10,       // Good fire resistance - bones don't burn
                blunt_resistance: 0.05,      // Weak to blunt
                slash_resistance: 0.08,
                pierce_resistance: 0.12,     // Good vs pierce
                cold_resistance: 0.0,
            })
            .noise_on_sprint(true)
            .grants_burn_immunity(true) // Each piece contributes to full set immunity
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Bone".to_string(), quantity: 40 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 20)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Bone Chestplate", "A chestplate made from reinforced animal bones. Plates overlap to deflect incoming projectiles.", ItemCategory::Armor)
            .icon("bone_chestplate.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.12,
                projectile_resistance: 0.20, // Very high projectile resist
                fire_resistance: 0.15,       // Good fire resistance - bones don't burn
                blunt_resistance: 0.08,
                slash_resistance: 0.12,
                pierce_resistance: 0.16,
                cold_resistance: 0.0,
            })
            .noise_on_sprint(true)
            .grants_burn_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Bone".to_string(), quantity: 80 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 30)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Bone Leggings", "Leg protection crafted from sturdy animal bones. Hard plating guards vital areas.", ItemCategory::Armor)
            .icon("bone_leggings.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.10,
                projectile_resistance: 0.18,
                fire_resistance: 0.12,       // Good fire resistance - bones don't burn
                blunt_resistance: 0.06,
                slash_resistance: 0.10,
                pierce_resistance: 0.14,
                cold_resistance: 0.0,
            })
            .noise_on_sprint(true)
            .grants_burn_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Bone".to_string(), quantity: 60 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 8 },
            ])
            .crafting_output(1, 25)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Bone Gauntlets", "Hand protection made from carved bone pieces. Surprisingly light and mobile.", ItemCategory::Armor)
            .icon("bone_gauntlets.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.06,
                projectile_resistance: 0.12,
                fire_resistance: 0.08,       // Good fire resistance - bones don't burn
                blunt_resistance: 0.04,
                slash_resistance: 0.06,
                pierce_resistance: 0.10,
                cold_resistance: 0.0,
            })
            .noise_on_sprint(true)
            .grants_burn_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Bone".to_string(), quantity: 30 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 4 },
            ])
            .crafting_output(1, 15)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Bone Boots", "Reinforced footwear with bone plating. Clacks and rattles with each step.", ItemCategory::Armor)
            .icon("bone_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.06,
                projectile_resistance: 0.12,
                fire_resistance: 0.08,       // Good fire resistance - bones don't burn
                blunt_resistance: 0.04,
                slash_resistance: 0.06,
                pierce_resistance: 0.10,
                cold_resistance: 0.0,
            })
            .noise_on_sprint(true)
            .grants_burn_immunity(true)
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

        ItemBuilder::new("Wooden Helmet", "A helmet carved from hardwood. Solid protection but highly flammable.", ItemCategory::Armor)
            .icon("wooden_helmet.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.10,
                projectile_resistance: 0.08,
                fire_resistance: -1.0,      // Double fire damage
                blunt_resistance: 0.18,     // Very strong vs blunt
                slash_resistance: 0.10,
                pierce_resistance: 0.08,
                cold_resistance: 0.0,
            })
            .reflects_melee_damage(0.03) // 3% reflection per piece
            .fire_damage_multiplier(2.0) // Takes double fire damage
            .movement_speed_modifier(-0.04) // -4% speed per piece
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 100 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 20)
            .respawn_time(450)
            .build(),

        ItemBuilder::new("Wooden Chestplate", "A sturdy chestplate made from thick wooden planks. Heavy and rigid construction.", ItemCategory::Armor)
            .icon("wooden_chestplate.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.15,
                projectile_resistance: 0.12,
                fire_resistance: -1.0,
                blunt_resistance: 0.22,
                slash_resistance: 0.15,
                pierce_resistance: 0.12,
                cold_resistance: 0.0,
            })
            .reflects_melee_damage(0.03)
            .fire_damage_multiplier(2.0)
            .movement_speed_modifier(-0.04)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 200 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 30)
            .respawn_time(450)
            .build(),

        ItemBuilder::new("Wooden Leggings", "Leg protection crafted from reinforced wood. Restricts movement but absorbs impacts.", ItemCategory::Armor)
            .icon("wooden_leggings.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.12,
                projectile_resistance: 0.10,
                fire_resistance: -1.0,
                blunt_resistance: 0.20,
                slash_resistance: 0.12,
                pierce_resistance: 0.10,
                cold_resistance: 0.0,
            })
            .reflects_melee_damage(0.03)
            .fire_damage_multiplier(2.0)
            .movement_speed_modifier(-0.04)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 150 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 8 },
            ])
            .crafting_output(1, 25)
            .respawn_time(450)
            .build(),

        ItemBuilder::new("Wooden Gauntlets", "Hand guards made from carved hardwood. Rough and splintered surface.", ItemCategory::Armor)
            .icon("wooden_gauntlets.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.08,
                projectile_resistance: 0.06,
                fire_resistance: -1.0,
                blunt_resistance: 0.16,
                slash_resistance: 0.08,
                pierce_resistance: 0.06,
                cold_resistance: 0.0,
            })
            .reflects_melee_damage(0.03)
            .fire_damage_multiplier(2.0)
            .movement_speed_modifier(-0.04)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 80 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 4 },
            ])
            .crafting_output(1, 15)
            .respawn_time(450)
            .build(),

        ItemBuilder::new("Wooden Boots", "Sturdy footwear reinforced with wooden plates. Heavy and cumbersome.", ItemCategory::Armor)
            .icon("wooden_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.08,
                projectile_resistance: 0.06,
                fire_resistance: -1.0,
                blunt_resistance: 0.16,
                slash_resistance: 0.08,
                pierce_resistance: 0.06,
                cold_resistance: 0.0,
            })
            .reflects_melee_damage(0.03)
            .fire_damage_multiplier(2.0)
            .movement_speed_modifier(-0.04)
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

        ItemBuilder::new("Leather Helmet", "A helmet made from cured animal leather. Balanced and durable.", ItemCategory::Armor)
            .icon("leather_helmet.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.07,
                projectile_resistance: 0.05,
                fire_resistance: 0.0,
                blunt_resistance: 0.06,
                slash_resistance: 0.08,
                pierce_resistance: 0.06,
                cold_resistance: 0.0,
            })
            .stamina_regen_modifier(0.02) // +2% stamina regen per piece
            .grants_bleed_immunity(true) // 3 pieces needed for full immunity
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 15 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 3 },
            ])
            .crafting_output(1, 18)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Leather Chestplate", "A durable chestplate crafted from thick leather. Flexible yet protective.", ItemCategory::Armor)
            .icon("leather_chestplate.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.11,
                projectile_resistance: 0.08,
                fire_resistance: 0.0,
                blunt_resistance: 0.10,
                slash_resistance: 0.12,
                pierce_resistance: 0.09,
                cold_resistance: 0.0,
            })
            .stamina_regen_modifier(0.02)
            .grants_bleed_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 30 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 6 },
            ])
            .crafting_output(1, 25)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Leather Leggings", "Flexible leg protection made from leather. Allows natural range of motion.", ItemCategory::Armor)
            .icon("leather_leggings.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.09,
                projectile_resistance: 0.07,
                fire_resistance: 0.0,
                blunt_resistance: 0.08,
                slash_resistance: 0.10,
                pierce_resistance: 0.08,
                cold_resistance: 0.0,
            })
            .stamina_regen_modifier(0.02)
            .grants_bleed_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 22 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 22)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Leather Gauntlets", "Hand protection crafted from supple leather. Comfortable and durable.", ItemCategory::Armor)
            .icon("leather_gauntlets.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.05,
                projectile_resistance: 0.04,
                fire_resistance: 0.0,
                blunt_resistance: 0.05,
                slash_resistance: 0.06,
                pierce_resistance: 0.05,
                cold_resistance: 0.0,
            })
            .stamina_regen_modifier(0.02)
            .grants_bleed_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 12 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 12)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Leather Boots", "Comfortable boots made from treated leather. Well-worn and reliable.", ItemCategory::Armor)
            .icon("leather_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.05,
                projectile_resistance: 0.04,
                fire_resistance: 0.0,
                blunt_resistance: 0.05,
                slash_resistance: 0.06,
                pierce_resistance: 0.05,
                cold_resistance: 0.0,
            })
            .stamina_regen_modifier(0.02)
            .grants_bleed_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 12 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 12)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Leather Cape", "A protective leather covering for the back. Distributes weight evenly.", ItemCategory::Armor)
            .icon("leather_mantle.png")
            .equippable(Some(EquipmentSlotType::Back))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.07,
                projectile_resistance: 0.05,
                fire_resistance: 0.0,
                blunt_resistance: 0.06,
                slash_resistance: 0.08,
                pierce_resistance: 0.06,
                cold_resistance: 0.0,
            })
            .stamina_regen_modifier(0.02)
            .grants_bleed_immunity(true)
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

        ItemBuilder::new("Scale Helmet", "A helmet covered in overlapping viper scales. Dense plating sheds water and blows.", ItemCategory::Armor)
            .icon("scale_helmet.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.12,
                projectile_resistance: 0.14,
                fire_resistance: 0.0,
                blunt_resistance: 0.08,      // Weak to blunt
                slash_resistance: 0.18,      // Very strong vs slash
                pierce_resistance: 0.14,
                cold_resistance: 0.0,
            })
            .movement_speed_modifier(-0.03) // -3% speed per piece
            .grants_wetness_immunity(true) // 5 pieces for full immunity
            .grants_knockback_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Viper Scale".to_string(), quantity: 2 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 30)
            .respawn_time(540)
            .build(),

        ItemBuilder::new("Scale Chestplate", "A heavy chestplate armored with layered scales. Interlocking plates provide maximum coverage.", ItemCategory::Armor)
            .icon("scale_chestplate.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.18,
                projectile_resistance: 0.20,
                fire_resistance: 0.0,
                blunt_resistance: 0.12,
                slash_resistance: 0.24,
                pierce_resistance: 0.20,
                cold_resistance: 0.0,
            })
            .movement_speed_modifier(-0.03)
            .grants_wetness_immunity(true)
            .grants_knockback_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Viper Scale".to_string(), quantity: 2 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 45)
            .respawn_time(540)
            .build(),

        ItemBuilder::new("Scale Leggings", "Leg armor reinforced with protective scales. Substantial weight anchors your stance.", ItemCategory::Armor)
            .icon("scale_leggings.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.15,
                projectile_resistance: 0.17,
                fire_resistance: 0.0,
                blunt_resistance: 0.10,
                slash_resistance: 0.21,
                pierce_resistance: 0.17,
                cold_resistance: 0.0,
            })
            .movement_speed_modifier(-0.03)
            .grants_wetness_immunity(true)
            .grants_knockback_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Viper Scale".to_string(), quantity: 2 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 38)
            .respawn_time(540)
            .build(),

        ItemBuilder::new("Scale Gauntlets", "Hand guards covered in interlocking scales. Rigid plating protects knuckles and fingers.", ItemCategory::Armor)
            .icon("scale_gauntlets.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.10,
                projectile_resistance: 0.12,
                fire_resistance: 0.0,
                blunt_resistance: 0.07,
                slash_resistance: 0.16,
                pierce_resistance: 0.12,
                cold_resistance: 0.0,
            })
            .movement_speed_modifier(-0.03)
            .grants_wetness_immunity(true)
            .grants_knockback_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Viper Scale".to_string(), quantity: 1 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 22)
            .respawn_time(540)
            .build(),

        ItemBuilder::new("Scale Boots", "Heavy boots reinforced with scale plating. Weighty construction limits mobility.", ItemCategory::Armor)
            .icon("scale_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.10,
                projectile_resistance: 0.12,
                fire_resistance: 0.0,
                blunt_resistance: 0.07,
                slash_resistance: 0.16,
                pierce_resistance: 0.12,
                cold_resistance: 0.0,
            })
            .movement_speed_modifier(-0.03)
            .grants_wetness_immunity(true)
            .grants_knockback_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Viper Scale".to_string(), quantity: 1 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 22)
            .respawn_time(540)
            .build(),

        // === FOX FUR ARMOR SET ===
        // Light insulating armor with cold resistance
        // Low protection but excellent warmth

        ItemBuilder::new("Fox Fur Hood", "A warm hood lined with soft fox fur. Light and insulating.", ItemCategory::Armor)
            .icon("fox_fur_hood.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.03,
                projectile_resistance: 0.02,
                fire_resistance: 0.0,
                blunt_resistance: 0.02,
                slash_resistance: 0.03,
                pierce_resistance: 0.02,
                cold_resistance: 0.20, // 20% cold resist per piece
            })
            .warmth_bonus(0.8)
            .detection_radius_bonus(0.10) // +10% detection per piece
            .grants_cold_immunity(true) // 5 pieces for full immunity
            .crafting_cost(vec![
                CostIngredient { item_name: "Fox Fur".to_string(), quantity: 2 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 15)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Fox Fur Coat", "A lightweight coat made from fox pelts. Soft fur traps body heat effectively.", ItemCategory::Armor)
            .icon("fox_fur_coat.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.04,
                projectile_resistance: 0.03,
                fire_resistance: 0.0,
                blunt_resistance: 0.03,
                slash_resistance: 0.04,
                pierce_resistance: 0.03,
                cold_resistance: 0.20,
            })
            .warmth_bonus(1.2)
            .detection_radius_bonus(0.10)
            .grants_cold_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Fox Fur".to_string(), quantity: 2 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 22)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Fox Fur Leggings", "Warm leg coverings made from fox fur. Light and quiet.", ItemCategory::Armor)
            .icon("fox_fur_leggings.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.03,
                projectile_resistance: 0.02,
                fire_resistance: 0.0,
                blunt_resistance: 0.02,
                slash_resistance: 0.03,
                pierce_resistance: 0.02,
                cold_resistance: 0.20,
            })
            .warmth_bonus(0.9)
            .detection_radius_bonus(0.10)
            .grants_cold_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Fox Fur".to_string(), quantity: 2 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 18)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Fox Fur Gloves", "Insulated gloves lined with fox fur. Maintains dexterity in cold weather.", ItemCategory::Armor)
            .icon("fox_fur_gloves.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.02,
                projectile_resistance: 0.01,
                fire_resistance: 0.0,
                blunt_resistance: 0.01,
                slash_resistance: 0.02,
                pierce_resistance: 0.01,
                cold_resistance: 0.20,
            })
            .warmth_bonus(0.5)
            .detection_radius_bonus(0.10)
            .grants_cold_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Fox Fur".to_string(), quantity: 1 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 10)
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Fox Fur Boots", "Warm boots lined with soft fox fur. Padded soles muffle sound.", ItemCategory::Armor)
            .icon("fox_fur_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.02,
                projectile_resistance: 0.01,
                fire_resistance: 0.0,
                blunt_resistance: 0.01,
                slash_resistance: 0.02,
                pierce_resistance: 0.01,
                cold_resistance: 0.20,
            })
            .warmth_bonus(0.5)
            .detection_radius_bonus(0.10)
            .silences_movement(true) // Fox fur boots silence footsteps
            .grants_cold_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Fox Fur".to_string(), quantity: 1 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 10)
            .respawn_time(420)
            .build(),

        // === WOLF FUR ARMOR SET ===
        // Thick insulating armor with moderate protection
        // Good balance of warmth and defense

        ItemBuilder::new("Wolf Fur Hood", "A thick hood made from wolf pelts. Dense fur provides excellent insulation.", ItemCategory::Armor)
            .icon("wolf_fur_hood.png")
            .equippable(Some(EquipmentSlotType::Head))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.06,
                projectile_resistance: 0.04,
                fire_resistance: 0.0,
                blunt_resistance: 0.05,
                slash_resistance: 0.07,
                pierce_resistance: 0.05,
                cold_resistance: 0.20, // 20% cold resist per piece
            })
            .warmth_bonus(1.0)
            .low_health_damage_bonus(0.04) // +4% damage per piece when low health
            .intimidates_animals(true)
            .grants_cold_immunity(true) // 5 pieces for full immunity
            .crafting_cost(vec![
                CostIngredient { item_name: "Wolf Fur".to_string(), quantity: 2 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 20)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Wolf Fur Coat", "A heavy coat made from thick wolf fur. Rugged and battle-worn appearance.", ItemCategory::Armor)
            .icon("wolf_fur_coat.png")
            .equippable(Some(EquipmentSlotType::Chest))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.09,
                projectile_resistance: 0.06,
                fire_resistance: 0.0,
                blunt_resistance: 0.08,
                slash_resistance: 0.10,
                pierce_resistance: 0.07,
                cold_resistance: 0.20,
            })
            .warmth_bonus(1.5)
            .low_health_damage_bonus(0.04)
            .intimidates_animals(true)
            .grants_cold_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wolf Fur".to_string(), quantity: 2 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 30)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Wolf Fur Leggings", "Durable leg coverings made from wolf pelts. Thick hide reinforces vulnerable areas.", ItemCategory::Armor)
            .icon("wolf_fur_leggings.png")
            .equippable(Some(EquipmentSlotType::Legs))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.07,
                projectile_resistance: 0.05,
                fire_resistance: 0.0,
                blunt_resistance: 0.06,
                slash_resistance: 0.08,
                pierce_resistance: 0.06,
                cold_resistance: 0.20,
            })
            .warmth_bonus(1.2)
            .low_health_damage_bonus(0.04)
            .intimidates_animals(true)
            .grants_cold_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wolf Fur".to_string(), quantity: 2 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 25)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Wolf Fur Gloves", "Thick gloves lined with wolf fur. Reinforced palms and knuckles.", ItemCategory::Armor)
            .icon("wolf_fur_gloves.png")
            .equippable(Some(EquipmentSlotType::Hands))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.04,
                projectile_resistance: 0.03,
                fire_resistance: 0.0,
                blunt_resistance: 0.03,
                slash_resistance: 0.05,
                pierce_resistance: 0.04,
                cold_resistance: 0.20,
            })
            .warmth_bonus(0.7)
            .low_health_damage_bonus(0.04)
            .intimidates_animals(true)
            .grants_cold_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wolf Fur".to_string(), quantity: 1 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 15)
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Wolf Fur Boots", "Sturdy boots lined with warm wolf fur. Heavy-duty construction for harsh terrain.", ItemCategory::Armor)
            .icon("wolf_fur_boots.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.04,
                projectile_resistance: 0.03,
                fire_resistance: 0.0,
                blunt_resistance: 0.03,
                slash_resistance: 0.05,
                pierce_resistance: 0.04,
                cold_resistance: 0.20,
            })
            .warmth_bonus(0.7)
            .low_health_damage_bonus(0.04)
            .intimidates_animals(true)
            .grants_cold_immunity(true)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wolf Fur".to_string(), quantity: 1 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 15)
            .respawn_time(480)
            .build(),

        // === AQUATIC GEAR ===
        // Specialized gear for improved water mobility

        // Reed Flippers - Feet armor with significant water speed bonus
        // Allows players to swim 100% faster (2x normal water speed)
        // Crafted from common reed materials, making them accessible early-game
        ItemBuilder::new("Reed Flippers", "Woven flippers made from buoyant reed stalks sealed with tallow. Significantly increases swimming speed but offers no protection.", ItemCategory::Armor)
            .icon("reed_flippers.png")
            .equippable(Some(EquipmentSlotType::Feet))
            .armor_resistances(ArmorResistances {
                melee_resistance: 0.0,
                projectile_resistance: 0.0,
                fire_resistance: 0.0,
                blunt_resistance: 0.0,
                slash_resistance: 0.0,
                pierce_resistance: 0.0,
                cold_resistance: 0.0, // No protection - purely functional
            })
            .water_speed_bonus(1.0) // +100% water speed (2x normal speed)
            .crafting_cost(vec![
                CostIngredient { item_name: "Common Reed Stalk".to_string(), quantity: 8 },
                CostIngredient { item_name: "Tallow".to_string(), quantity: 3 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 20)
            .respawn_time(360)
            .build(),

    ]
}
