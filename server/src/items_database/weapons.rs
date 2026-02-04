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

        // Vole Skull - Tiny novelty trophy
        ItemBuilder::new("Vole Skull", "A tiny vole skull. More of a curiosity than a weapon, but proof you can kill even the smallest prey. Surprisingly fast to swing.", ItemCategory::Weapon)
            .icon("vole_skull.png")
            .stackable(20)
            .weapon(8, 10, 2.5) // Very weak but very fast - novelty weapon
            .damage_type(DamageType::Blunt) // Blunt weapon
            .build(),

        // Wolverine Skull - Fierce predator trophy with powerful jaws
        ItemBuilder::new("Wolverine Skull", "A wolverine skull with its powerful jaws intact. A trophy from one of nature's most fearless predators. The thick bone and sharp teeth make it a formidable weapon.", ItemCategory::Weapon)
            .icon("wolverine_skull.png")
            .stackable(10)
            .weapon(32, 35, 2.0) // Good damage, moderate speed - fierce predator
            .damage_type(DamageType::Pierce) // Pierce weapon (teeth)
            .build(),

        // Polar Bear Skull - Massive apex predator trophy
        ItemBuilder::new("Polar Bear Skull", "A massive polar bear skull. An apex predator trophy showing mastery over the alpine's most dangerous hunter. The sheer size and weight make it devastating.", ItemCategory::Weapon)
            .icon("polar_bear_skull.png")
            .stackable(10)
            .weapon(42, 42, 2.5) // Very high damage but very slow - largest skull
            .damage_type(DamageType::Blunt) // Blunt weapon
            .build(),

        // Hare Skull - Small prey trophy
        ItemBuilder::new("Hare Skull", "A small hare skull. A quick trophy from a fast prey. Lightweight and surprisingly fast to swing.", ItemCategory::Weapon)
            .icon("hare_skull.png")
            .stackable(20)
            .weapon(10, 12, 1.4) // Weak but very fast - novelty weapon
            .damage_type(DamageType::Blunt) // Blunt weapon
            .build(),

        // Owl Skull - Silent hunter trophy
        ItemBuilder::new("Owl Skull", "An owl skull with large eye sockets. A trophy from a silent nocturnal hunter. The hollow bones make it lighter than expected.", ItemCategory::Weapon)
            .icon("owl_skull.png")
            .stackable(15)
            .weapon(22, 24, 1.7) // Moderate damage, decent speed - bird skull
            .damage_type(DamageType::Blunt) // Blunt weapon
            .build(),

        // Tern Skull - Coastal seabird trophy
        ItemBuilder::new("Tern Skull", "A tern skull with its distinctive sharp beak. A trophy from a tireless seabird known for diving into the waves. The streamlined shape makes it fast to swing.", ItemCategory::Weapon)
            .icon("tern_skull.png")
            .stackable(15)
            .weapon(18, 20, 1.5) // Lower damage but very fast - small agile bird
            .damage_type(DamageType::Pierce) // Pierce weapon (sharp beak)
            .build(),

        // Crow Skull - Clever scavenger trophy
        ItemBuilder::new("Crow Skull", "A crow skull with intelligent eye sockets. A trophy from a cunning scavenger. The sturdy construction belies its small size.", ItemCategory::Weapon)
            .icon("crow_skull.png")
            .stackable(15)
            .weapon(16, 18, 1.6) // Weak but fast - small bird skull
            .damage_type(DamageType::Blunt) // Blunt weapon
            .build(),

        // Shark Skull - Aquatic predator trophy with serrated teeth
        ItemBuilder::new("Shark Skull", "A fearsome shark skull with rows of serrated teeth. A rare trophy from the ocean's apex predator. The cartilaginous structure is surprisingly lightweight, but those teeth are deadly.", ItemCategory::Weapon)
            .icon("shark_skull.png")
            .stackable(10)
            .weapon(38, 42, 1.9) // High damage - apex aquatic predator
            .damage_type(DamageType::Pierce) // Pierce weapon (teeth)
            .bleed_effect(3.0, 8.0, 1.0) // Serrated teeth cause serious bleeding
            .build(),

        // === CRAFTABLE CLUBS & MACES ===
        // Heavy blunt weapons - slow but powerful

        // Stone Mace - Early game heavy hitter
        // TIER 1: Cheap to craft, good damage, slow swing
        // Tradeoff: High damage per hit but slow, no bleed
        ItemBuilder::new("Stone Mace", "A heavy stone lashed to a wooden handle. Slow to swing but hits like a boulder. Excellent for stunning prey and crushing skulls.", ItemCategory::Weapon)
            .icon("stone_mace.png")
            .weapon(28, 32, 1.3) // High damage, slow swing - rewards timing
            .damage_type(DamageType::Blunt) // Blunt crushing damage
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 150 },
                CostIngredient { item_name: "Stone".to_string(), quantity: 200 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 20 },
            ])
            .crafting_output(1, 8)
            .respawn_time(300)
            .build(),

        // War Hammer - Mid-tier devastating blunt weapon
        // TIER 2: Requires metal, devastating damage, very slow
        // Tradeoff: Highest craftable blunt damage, punishes missed swings
        ItemBuilder::new("War Hammer", "A heavy metal hammerhead on a reinforced shaft. Devastating crushing power that can shatter bones and dent armor. Slow but terrifying.", ItemCategory::Weapon)
            .icon("war_hammer.png")
            .weapon(42, 48, 1.4) // Very high damage, very slow - commitment weapon
            .damage_type(DamageType::Blunt) // Blunt crushing damage
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 200 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 150 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 10 },
            ])
            .crafting_output(1, 7)
            .respawn_time(600)
            .build(),

        // === CRAFTABLE DAGGERS & SHIVS ===
        // Fast stabbing weapons - low damage but quick strikes and bleed

        // Bone Shiv - Early game assassin weapon
        // TIER 1: Cheap stealth weapon, very fast, high bleed
        // Tradeoff: Low base damage but fast attacks and vicious bleeding
        ItemBuilder::new("Bone Shiv", "A sharpened bone fragment wrapped in leather. Lightning fast strikes that leave deep, bleeding wounds. Perfect for ambushes.", ItemCategory::Weapon)
            .icon("bone_shiv.png")
            .weapon(12, 15, 0.5) // Very low damage, VERY fast - hit and run
            .damage_type(DamageType::Pierce) // Piercing stab damage
            .bleed_effect(3.0, 10.0, 1.0) // HIGH bleed - 30 total bleed damage!
            .crafting_cost(vec![
                CostIngredient { item_name: "Bone Fragments".to_string(), quantity: 75 },
                CostIngredient { item_name: "Plant Fiber".to_string(), quantity: 15 },
            ])
            .crafting_output(1, 5)
            .respawn_time(240)
            .build(),

        // Metal Dagger - Mid-tier assassin weapon
        // TIER 2: Fastest craftable weapon, excellent bleed
        // Tradeoff: Lower burst than swords but highest sustained DPS through bleed
        ItemBuilder::new("Metal Dagger", "A razor-sharp blade forged from scrap metal. Wickedly fast with deep, vicious cuts that bleed profusely. The assassin's choice.", ItemCategory::Weapon)
            .icon("metal_dagger.png")
            .weapon(22, 26, 0.45) // Low-medium damage, FASTEST weapon - DPS king
            .damage_type(DamageType::Slash) // Slashing cuts
            .bleed_effect(4.0, 12.0, 1.0) // VICIOUS bleed - 48 total bleed damage!
            .crafting_cost(vec![
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 100 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 15 },
                CostIngredient { item_name: "Bone Fragments".to_string(), quantity: 25 },
            ])
            .crafting_output(1, 5)
            .respawn_time(480)
            .build(),

        // === CRAFTABLE SWORDS & BLADES ===
        // Balanced slashing weapons - good damage and speed

        // Battle Axe - Late-tier heavy slashing weapon
        // TIER 3: Expensive, high damage slash alternative to spear
        // Tradeoff: Highest craftable slash damage, slower than sword
        ItemBuilder::new("Battle Axe", "A brutal double-headed axe forged for war. Massive cleaving strikes that can split a man in two. Heavy, slow, and absolutely devastating.", ItemCategory::Weapon)
            .icon("battle_axe.png")
            .weapon(45, 52, 1.0) // Very high damage, moderate speed - power weapon
            .damage_type(DamageType::Slash) // Cleaving slash damage
            .bleed_effect(3.5, 10.0, 1.0) // Strong bleed - 35 total
            .crafting_cost(vec![
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 200 },
                CostIngredient { item_name: "Wood".to_string(), quantity: 150 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 20 },
            ])
            .crafting_output(1, 10)
            .respawn_time(720)
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
            .crafting_output(1, 5) // Quick to craft
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
            .crafting_output(1, 10)
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
            .crafting_output(1, 10)
            .respawn_time(420)
            .build(),

        // === CRAFTABLE SCYTHES ===
        // Wide-arc melee weapons for harvesting and combat

        // Scythe - Wide sweep weapon ideal for clearing grass
        // BALANCED: Low per-hit damage but hits ALL targets in arc (cleave)
        // Tradeoff vs Spear: Lower single-target DPS, but excellent for crowds/grass
        ItemBuilder::new("Scythe", "A curved farming tool repurposed for survival. The wide sweeping arc hits multiple targets but deals less damage per strike. Excellent for clearing grass, weaker in duels.", ItemCategory::Weapon)
            .icon("scythe.png")
            .weapon(16, 20, 1.1) // LOW damage (vs Spear 25), slower swing - balanced for multi-hit
            .damage_type(DamageType::Slash) // Slashing weapon
            .attack_arc_degrees(120.0) // WIDE 120° sweep arc for efficient grass clearing
            .bleed_effect(1.0, 5.0, 1.0) // WEAK bleed (vs Spear 2.0/8.0) - shallow cuts
            .crafting_cost(vec![
                CostIngredient { item_name: "Wood".to_string(), quantity: 150 },
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 50 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 10)
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
            .crafting_output(1, 10)
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
                CostIngredient { item_name: "Cloth".to_string(), quantity: 30 },
            ])
            .crafting_output(1, 5)
            .respawn_time(600)
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
            .crafting_output(1, 10)
            .respawn_time(900)
            .build(),

        // === UNDERWATER RANGED WEAPONS ===
        // Specialized ranged weapons designed for underwater combat

        // Reed Harpoon Gun - Underwater ranged weapon with 2-dart magazine
        // BALANCED: Works both underwater and on land, slower fire rate, limited capacity
        // Tradeoff: Can be used in water unlike other ranged weapons, but lower capacity and damage
        ItemBuilder::new("Reed Harpoon Gun", "A pneumatic harpoon launcher crafted from reeds and bone. Designed for underwater hunting, it functions both above and below the surface. Uses specialized reed harpoon darts.", ItemCategory::RangedWeapon)
            .icon("reed_harpoon_gun.png")
            .stackable(1)
            .weapon(35, 42, 0.0) // Moderate damage (35-42) - balanced for underwater use
            .damage_type(DamageType::Projectile)
            .equippable(None)
            .crafting_cost(vec![
                CostIngredient { item_name: "Common Reed Stalk".to_string(), quantity: 15 },
                CostIngredient { item_name: "Bone Fragments".to_string(), quantity: 75 },
                CostIngredient { item_name: "Rope".to_string(), quantity: 3 },
                CostIngredient { item_name: "Animal Leather".to_string(), quantity: 5 },
            ])
            .crafting_output(1, 7)
            .respawn_time(900)
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
            .crafting_output(1, 10)
            .respawn_time(1800)
            .build(),

        // === TIER 4: PP-91 KEDR - Endgame Submachine Gun ===
        // Soviet compact SMG, extremely expensive to craft
        // Very high fire rate with 30-round magazine, uses 9x18mm ammunition
        // BALANCED: Lowest per-shot damage but devastating sustained fire, burns ammo fast
        ItemBuilder::new("PP-91 KEDR", "A compact Soviet submachine gun designed for rapid-fire engagements. The 30-round magazine and blistering fire rate make it devastating up close, but accuracy suffers at range. Uses 9x18mm rounds.", ItemCategory::RangedWeapon)
            .icon("pp91_kedr.png")
            .stackable(1)
            .weapon(22, 28, 0.0) // Very low per-shot (22-28) - compensated by extreme fire rate
            .damage_type(DamageType::Projectile)
            .equippable(None)
            .crafting_cost(vec![
                CostIngredient { item_name: "Metal Fragments".to_string(), quantity: 600 },
                CostIngredient { item_name: "Wood".to_string(), quantity: 75 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 25 },
                CostIngredient { item_name: "Bone Fragments".to_string(), quantity: 40 }, // For grip/internals
            ])
            .crafting_output(1, 15)
            .respawn_time(2400)
            .build(),
    ]
}
