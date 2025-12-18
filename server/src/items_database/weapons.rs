use super::builders::{ItemBuilder, basic_weapon};
use crate::items::{ItemDefinition, ItemCategory, CostIngredient};
use crate::models::{TargetType, DamageType};

pub fn get_weapon_definitions() -> Vec<ItemDefinition> {
    vec![
        // === SOVIET MILITARY WEAPONS (BARREL LOOT) ===
        // High-tier weapons found only in barrels, not craftable

        // Naval Cutlass - Ceremonial sword, highest single-hit damage
        ItemBuilder::new("Naval Cutlass", "A ceremonial naval sword from the old Soviet Pacific Fleet. Tarnished but still deadly sharp. Slower strikes but devastating damage.", ItemCategory::Weapon)
            .icon("naval_cutlass.png")
            .weapon(48, 52, 1.0) // Highest melee damage, slow deliberate strikes
            .damage_type(DamageType::Slash) // Slashing weapon
            .bleed_effect(3.0, 12.0, 1.0) // Standard bleed, longer duration
            .build(),

        // AK74 Bayonet - Fast, precise military blade
        ItemBuilder::new("AK74 Bayonet", "A detached bayonet from an AK-74 rifle. Compact, balanced, and brutally effective in close combat. Lightning-fast strikes with vicious bleeding.", ItemCategory::Weapon)
            .icon("soviet_bayonet.png")
            .weapon(30, 34, 0.55) // Lower per-hit damage, FASTEST weapon
            .damage_type(DamageType::Slash) // Slashing weapon
            .bleed_effect(4.0, 12.0, 1.0) // High bleed damage, long duration
            .build(),

        // Engineers Maul - Heavy demolition hammer
        ItemBuilder::new("Engineers Maul", "A heavy demolition hammer used by Soviet military engineers. Built for breaking through concrete and steel, it's devastatingly effective in combat.", ItemCategory::Weapon)
            .icon("engineers_maul.png")
            .weapon(40, 45, 0.85) // High damage, slow but powerful
            .damage_type(DamageType::Blunt) // Blunt weapon
            .bleed_effect(2.5, 10.0, 1.0) // Moderate bleed
            .build(),

        // Military Crowbar - Ultimate blunt weapon
        ItemBuilder::new("Military Crowbar", "A heavy-duty crowbar from Soviet military engineering corps. Built for breaching and demolition, it delivers devastating blows in combat.", ItemCategory::Weapon)
            .icon("military_crowbar.png")
            .weapon(55, 60, 1.2) // HIGHEST damage in game, SLOWEST weapon
            .damage_type(DamageType::Blunt) // Blunt weapon
            .bleed_effect(1.5, 8.0, 1.0) // Lower bleed (blunt force trauma)
            .build(),

        // === IMPROVISED/GRIM WEAPONS ===
        // Makeshift weapons with unique characteristics

        // Human Skull - Grim improvised weapon
        ItemBuilder::new("Human Skull", "The surprisingly intact skull of a former human. Grim, but effective in a pinch.", ItemCategory::Weapon)
            .icon("skull.png")
            .weapon(30, 30, 2.0) // Fixed damage, very slow
            .damage_type(DamageType::Blunt) // Blunt weapon
            .build(),

        // Fox Skull - Light but cunning weapon
        ItemBuilder::new("Fox Skull", "A fox skull. A trophy from a successful hunt, and proof of your prowess against cunning prey. Lighter than other skulls.", ItemCategory::Weapon)
            .icon("fox_skull.png")
            .stackable(10)
            .weapon(25, 25, 1.8) // Lighter/faster than human skull
            .damage_type(DamageType::Blunt) // Blunt weapon
            .build(),

        // Wolf Skull - Fierce predator weapon
        ItemBuilder::new("Wolf Skull", "A wolf skull. A fearsome trophy from a dangerous hunt, showing your ability to defeat apex predators. Heavy and intimidating.", ItemCategory::Weapon)
            .icon("wolf_skull.png")
            .stackable(10)
            .weapon(35, 35, 2.2) // Stronger but slower than human skull
            .damage_type(DamageType::Blunt) // Blunt weapon
            .build(),

        // Viper Skull - Venomous weapon with bleed effect
        ItemBuilder::new("Viper Skull", "A viper skull with intact fangs. A deadly trophy that proves your survival against venomous predators. The fangs still carry traces of venom.", ItemCategory::Weapon)
            .icon("viper_skull.png")
            .stackable(10)
            .weapon(28, 28, 1.9) // Moderate damage and speed
            .damage_type(DamageType::Pierce) // Pierce weapon (fangs)
            .bleed_effect(2.0, 6.0, 1.0) // Venom effect - moderate bleed
            .build(),

        // Walrus Skull - Heavy, imposing weapon with tusks
        ItemBuilder::new("Walrus Skull", "A massive walrus skull with intact tusks. An impressive trophy from one of the arctic's most formidable marine mammals. The weight and tusks make it devastatingly effective in combat.", ItemCategory::Weapon)
            .icon("walrus_skull.png")
            .stackable(10)
            .weapon(40, 40, 2.5) // High damage but very slow due to weight
            .damage_type(DamageType::Pierce) // Pierce weapon (tusks)
            .build(),

        // === CRAFTABLE SPEARS ===
        // Ranged melee weapons with reach advantage

        // Reed Harpoon - Fragile starter spear (Tier 0.5)
        ItemBuilder::new("Reed Harpoon", "A fragile harpoon made from reeds and bone fragments. Light and buoyant, but weaker than a proper wooden spear.", ItemCategory::Weapon)
            .icon("reed_harpoon.png")
            .weapon(18, 20, 1.2) // Lower damage than Wooden Spear, slightly faster swing speed
            .damage_type(DamageType::Pierce) // Piercing weapon
            .bleed_effect(1.5, 6.0, 1.0) // Weaker bleed than Wooden Spear
            .crafting_cost(vec![
                CostIngredient { item_name: "Common Reed Stalk".to_string(), quantity: 5 },
                CostIngredient { item_name: "Bone Fragments".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 15) // Quick to craft
            .respawn_time(300)
            .build(),

        // Wooden Spear - Basic spear, longest reach
        ItemBuilder::new("Wooden Spear", "A sharpened stick. Better than throwing rocks.", ItemCategory::Weapon)
            .icon("spear.png")
            .weapon(25, 25, 1.5) // Fixed moderate damage, very slow due to reach
            .damage_type(DamageType::Pierce) // Pierce weapon
            .bleed_effect(2.0, 8.0, 1.0) // Standard bleed
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 300 },
            ])
            .crafting_output(1, 30)
            .respawn_time(300)
            .build(),

        // Stone Spear - Improved spear with stone tip
        ItemBuilder::new("Stone Spear", "A basic spear tipped with sharpened stone. Has a longer reach and causes bleeding.", ItemCategory::Weapon)
            .icon("stone_spear.png")
            .weapon(35, 35, 1.3) // Fixed higher damage, slow but faster than wooden spear
            .damage_type(DamageType::Pierce) // Pierce weapon
            .bleed_effect(3.0, 8.0, 1.0) // Better bleed
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 300 },
                CostIngredient { item_name: "Stone".to_string(), quantity: 100 },
            ])
            .crafting_output(1, 30)
            .respawn_time(420)
            .build(),

        // === CRAFTABLE SCYTHES ===
        // Wide-arc melee weapons for harvesting and combat

        // Scythe - Wide sweep weapon ideal for clearing grass
        ItemBuilder::new("Scythe", "A curved farming tool repurposed for survival. The wide sweeping arc makes it excellent for clearing grass and collecting fiber. Not designed for throwing.", ItemCategory::Weapon)
            .icon("scythe.png")
            .weapon(28, 32, 0.9) // Moderate damage, slightly fast swing
            .damage_type(DamageType::Slash) // Slashing weapon
            .attack_arc_degrees(120.0) // WIDE 120° sweep arc for efficient grass clearing
            .bleed_effect(2.5, 8.0, 1.0) // Moderate bleed effect
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 150 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 50 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 45)
            .respawn_time(360)
            .build(),

        // === CRAFTABLE PADDLES ===
        // Utility weapons that double as tools

        // Kayak Paddle - Light blunt weapon, also used for scarecrow crafting
        ItemBuilder::new("Kayak Paddle", "A sturdy paddle carved from driftwood. Light and fast, useful for both paddling and self-defense. Can be used to build a scarecrow.", ItemCategory::Weapon)
            .icon("kayak_paddle.png")
            .weapon(20, 22, 1.0) // Light melee: 20-22 damage, 1.0s cooldown - fast swings
            .damage_type(DamageType::Blunt) // Blunt weapon
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 100 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
                CostIngredient { item_name: "Tallow".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 30)
            .respawn_time(300)
            .build(),

        // === RANGED WEAPONS ===
        // Projectile-firing weapons that use ammunition

        // === TIER 1: Hunting Bow - Early Game Ranged Weapon ===
        // Easy to craft with basic materials, good for hunting animals
        // Requires skill (leading shots, arc compensation) but rewarding when mastered
        // BALANCED: Decent damage, fast fire rate, rewards getting close
        ItemBuilder::new("Hunting Bow", "A sturdy wooden bow for hunting game and self-defense. Requires skill to master the arrow arc. Fast follow-up shots reward aggressive play. Requires arrows to fire.", ItemCategory::RangedWeapon)
            .icon("bow.png")
            .stackable(1)
            .weapon(42, 52, 0.0) // Solid damage (42-52) - hits feel meaningful
            .damage_type(DamageType::Projectile)
            .equippable(None)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 200 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 30 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 45) // 45 seconds to craft
            .respawn_time(600) // 10 min respawn in world
            .build(),

        // === TIER 2: Crossbow - Mid Game Ranged Weapon ===
        // Requires metal, more powerful and accurate than bow
        // Slow reload but hits HARD - one-shot potential, punishes misses
        // BALANCED: Highest single-hit damage, slowest fire rate
        ItemBuilder::new("Crossbow", "A mechanical crossbow with devastating power. Bolts hit like a truck, but the slow reload punishes missed shots. Best for ambushes and calculated engagements.", ItemCategory::RangedWeapon)
            .icon("crossbow.png")
            .stackable(1)
            .weapon(78, 95, 0.0) // High burst damage (78-95) - rewards patience
            .damage_type(DamageType::Projectile)
            .equippable(None)
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 300 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 100 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 2 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 90) // 90 seconds to craft
            .respawn_time(900) // 15 min respawn in world
            .build(),

        // === FIREARMS ===
        // Soviet-era firearms that use bullet ammunition

        // === TIER 3: Makarov PM - Late Game Firearm ===
        // Expensive to craft, requires significant metal investment
        // Fastest fire rate, longest range, uses 9x18mm ammunition
        // BALANCED: Lower per-shot damage but highest DPS, burns expensive ammo
        ItemBuilder::new("Makarov PM", "A reliable Soviet-era semi-automatic pistol. Rapid fire and long range make it deadly, but burns through expensive ammunition quickly. Uses 9x18mm rounds.", ItemCategory::RangedWeapon)
            .icon("makarov_pm.png")
            .stackable(1)
            .weapon(38, 48, 0.0) // Lower per-shot (38-48) - compensated by fire rate and magazine
            .damage_type(DamageType::Projectile)
            .equippable(None)
            .crafting_cost(vec![
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 400 },
                CostIngredient { item_name: "Wood".to_string(), quantity: 50 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 15 },
                CostIngredient { item_name: "Bone Fragments".to_string(), quantity: 25 }, // For grip/springs
            ])
            .crafting_output(1, 120) // 2 minutes to craft
            .respawn_time(1800) // 30 min respawn in world (rare find)
            .build(),
    ]
}
