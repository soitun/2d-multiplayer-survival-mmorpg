use super::builders::{ItemBuilder};
use crate::items::{ItemDefinition, ItemCategory, CostIngredient};
use crate::models::AmmoType;

pub fn get_ammunition_definitions() -> Vec<ItemDefinition> {
    vec![
        // === ARROWS ===
        // Various arrow types with different damage modifiers and special effects
        // All arrows use AmmoType::Arrow for compatibility with bows and crossbows

        // Wooden Arrow - Standard balanced projectile
        ItemBuilder::new("Wooden Arrow", "The standard arrow with balanced damage and range. No bleeding effect.", ItemCategory::Ammunition)
            .icon("wooden_arrow.png")
            .stackable(50)
            .pvp_damage(0, 0) // Neutral modifier - adds 0 to weapon damage
            .ammo_type(AmmoType::Arrow)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 25 },
                CostIngredient { item_name: "Stone".to_string(), quantity: 10 },
            ])
            .crafting_output(2, 1) // Makes 2 arrows per craft
            .respawn_time(180)
            .build(),

        // Bone Arrow - High damage projectile  
        ItemBuilder::new("Bone Arrow", "Features a larger arrowhead with higher damage but no bleeding effect.", ItemCategory::Ammunition)
            .icon("bone_arrow.png")
            .stackable(50)
            .pvp_damage(5, 10) // Adds 5-10 extra damage to weapon base
            .ammo_type(AmmoType::Arrow)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 25 },
                CostIngredient { item_name: "Bone Fragments".to_string(), quantity: 25 },
            ])
            .crafting_output(2, 3) // Makes 2 arrows, takes 3 seconds
            .respawn_time(180)
            .build(),

        // Fire Arrow - Burn damage over time projectile
        ItemBuilder::new("Fire Arrow", "An arrow wrapped with tallow-soaked cloth that ignites on impact, causing burn damage over time. Creates fire patches that burn Twig and Wood structures. Ineffective against Stone and Metal.", ItemCategory::Ammunition)
            .icon("fire_arrow.png")
            .stackable(25)
            // Note: These positive damage values are handled specially in projectile.rs
            // where fire arrows subtract 20-30 damage instead of adding to weapon damage
            .pvp_damage(20, 30) // Special handling: actually subtracts this amount
            .ammo_type(AmmoType::Arrow)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 25 },
                CostIngredient { item_name: "Stone".to_string(), quantity: 10 },
                CostIngredient { item_name: "Tallow".to_string(), quantity: 2 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 5) // Makes 1 arrow, takes 5 seconds
            .respawn_time(240)
            .build(),

        // Hollow Reed Arrow - Fast but light projectile
        ItemBuilder::new("Hollow Reed Arrow", "A lightweight arrow with a hollow reed shaft. Flies faster but deals less damage due to its light construction.", ItemCategory::Ammunition)
            .icon("hollow_reed_arrow.png")
            .stackable(75) // Higher stack size due to lighter weight
            // Note: These values represent the REDUCTION amount in projectile.rs  
            // Hollow Reed Arrows subtract 8-12 damage from weapon total due to light construction
            // Major damage reduction balances the +25% speed advantage
            .pvp_damage(8, 12) // Special handling: actually subtracts this amount
            .ammo_type(AmmoType::Arrow)
            .crafting_cost(vec![
                CostIngredient { item_name: "Common Reed Stalk".to_string(), quantity: 2 },
                CostIngredient { item_name: "Stone".to_string(), quantity: 5 }, // Smaller stone tip
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 3 },
            ])
            .crafting_output(3, 2) // Makes 3 arrows per craft (efficient with reeds), takes 2 seconds
            .respawn_time(150) // Quick respawn due to common materials
            .build(),

        // === BULLETS ===
        // Firearm ammunition types
        // All bullets use AmmoType::Bullet for compatibility with pistols and firearms

        // 9x18mm Round - Standard pistol ammunition
        ItemBuilder::new("9x18mm Round", "Standard 9x18mm Makarov ammunition. Reliable and effective at medium range.", ItemCategory::Ammunition)
            .icon("9x18mm_round.png")
            .stackable(30)
            .pvp_damage(0, 0) // Neutral modifier - weapon base damage only
            .ammo_type(AmmoType::Bullet)
            .crafting_cost(vec![
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 10 },
                CostIngredient { item_name: "Gunpowder".to_string(), quantity: 3 },
            ])
            .crafting_output(5, 3) // Makes 5 rounds, takes 3 seconds
            .respawn_time(180)
            .build(),
    ]
}
