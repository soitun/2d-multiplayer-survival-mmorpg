use super::builders::{ItemBuilder, basic_seed};
use crate::items::{ItemDefinition, ItemCategory};

pub fn get_seed_definitions() -> Vec<ItemDefinition> {
    vec![
        // === ALL SEEDS AND PLANTING MATERIALS ===
        // All seeds are Placeable (plantable) and also edible with varying nutritional values
        // Raw seeds provide better nutrition, cooked/toasted seeds are enhanced, burnt seeds are harmful

        // === LARGE NUTRITIOUS SEEDS ===
        
        // Pumpkin Seeds - Large, nutritious seeds (CAN BE TOASTED - popular snack)
        ItemBuilder::new("Pumpkin Seeds", "Large edible seeds from pumpkins. Can be planted to grow pumpkin plants or toasted for enhanced nutrition.", ItemCategory::Placeable)
            .icon("pumpkin_seeds.png")
            .stackable(50)
            .respawn_time(720) // 12 minutes
            .consumable(2.0, 8.0, -2.0) // health, hunger, thirst
            .cookable(30.0, "Toasted Pumpkin Seeds") // Toasts into enhanced snack
            .build(),

        // Toasted Pumpkin Seeds - Enhanced nutrition when toasted
        ItemBuilder::new("Toasted Pumpkin Seeds", "Toasted pumpkin seeds with enhanced flavor and nutrition. Cannot be planted.", ItemCategory::Consumable)
            .icon("toasted_pumpkin_seeds.png")
            .stackable(50)
            .respawn_time(0) // Made by cooking
            .consumable(5.0, 15.0, -1.0) // health, hunger, thirst
            .cookable(25.0, "Charcoal") // Overcooking burns them to charcoal
            .build(),

        // Sunflower Seeds - Popular edible seeds (CAN BE TOASTED - popular snack)
        ItemBuilder::new("Sunflower Seeds", "Nutritious edible seeds from sunflowers. Can be planted to grow sunflower plants or toasted for enhanced nutrition.", ItemCategory::Placeable)
            .icon("sunflower_seeds.png")
            .stackable(50)
            .respawn_time(600) // 10 minutes
            .consumable(3.0, 6.0, -3.0) // health, hunger, thirst
            .cookable(28.0, "Toasted Sunflower Seeds") // Toasts into enhanced snack
            .build(),

        // Toasted Sunflower Seeds - Enhanced when toasted
        ItemBuilder::new("Toasted Sunflower Seeds", "Toasted sunflower seeds with rich, nutty flavor. Cannot be planted.", ItemCategory::Consumable)
            .icon("toasted_sunflower_seeds.png")
            .stackable(50)
            .respawn_time(0)
            .consumable(6.0, 12.0, -2.0) // health, hunger, thirst
            .cookable(25.0, "Charcoal") // Overcooking burns them to charcoal
            .build(),

        // Flax Seeds - High in omega fatty acids (CAN BE TOASTED - improves digestibility)
        ItemBuilder::new("Flax Seeds", "Tiny seeds rich in healthy oils. Can be planted to grow flax plants or toasted for better digestibility.", ItemCategory::Placeable)
            .icon("flax_seeds.png")
            .stackable(60)
            .respawn_time(480) // 8 minutes
            .consumable(2.0, 4.0, -1.0) // health, hunger, thirst
            .cookable(25.0, "Toasted Flax Seeds") // Toasts into enhanced version
            .build(),

        // Toasted Flax Seeds - Enhanced digestibility
        ItemBuilder::new("Toasted Flax Seeds", "Lightly toasted flax seeds that are easier to digest. Cannot be planted.", ItemCategory::Consumable)
            .icon("toasted_flax_seeds.png")
            .stackable(60)
            .respawn_time(0)
            .consumable(5.0, 8.0, 0.0) // health, hunger, thirst
            .cookable(22.0, "Charcoal") // Overcooking burns them to charcoal
            .build(),

        // === GRAIN SEEDS ===

        // === VEGETABLE SEEDS ===

        // Carrot Seeds - Minimal nutrition
        ItemBuilder::new("Carrot Seeds", "Tiny carrot seeds. Can be planted to grow carrots or eaten for minimal nutrition.", ItemCategory::Placeable)
            .icon("carrot_seeds.png")
            .stackable(80)
            .respawn_time(420) // 7 minutes
            .consumable(0.0, 0.5, -0.5) // health, hunger, thirst
            .cookable(20.0, "Charcoal") // Burns directly to charcoal - tiny seeds just char
            .build(),

        // Beet Seeds - Emergency food
        ItemBuilder::new("Beet Seeds", "Small beet seeds. Can be planted to grow beets or eaten in emergencies.", ItemCategory::Placeable)
            .icon("beet_seeds.png")
            .stackable(80)
            .respawn_time(420)
            .consumable(0.0, 0.5, 0.0) // health, hunger, thirst
            .cookable(20.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Cabbage Seeds - Cold-hardy vegetable seeds
        ItemBuilder::new("Cabbage Seeds", "Seeds for growing cabbage. Can be eaten but provide minimal nutrition.", ItemCategory::Placeable)
            .icon("cabbage_seeds.png")
            .stackable(80)
            .respawn_time(420) // 7 minutes
            .consumable(0.0, 0.5, 0.0) // health, hunger, thirst - minimal nutrition
            .cookable(20.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // === ADDITIONAL VEGETABLE SEEDS ===



        // Chicory Seeds - Bitter herb seeds
        ItemBuilder::new("Chicory Seeds", "Seeds for growing chicory. Can be eaten but are quite bitter.", ItemCategory::Placeable)
            .icon("chicory_seeds.png")
            .stackable(70)
            .respawn_time(360) // 6 minutes
            .consumable(0.5, 1.0, -0.5) // health, hunger, thirst
            .cookable(22.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Salsify Seeds - Root vegetable seeds
        ItemBuilder::new("Salsify Seeds", "Seeds for growing salsify root. Can be eaten for minimal nutrition.", ItemCategory::Placeable)
            .icon("salsify_seeds.png")
            .stackable(70)
            .respawn_time(480) // 8 minutes
            .consumable(0.0, 1.0, 0.0) // health, hunger, thirst
            .cookable(22.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // === HERB & MEDICINAL SEEDS ===

        // Yarrow Seeds - Medicinal herb seeds
        ItemBuilder::new("Yarrow Seeds", "Seeds for growing yarrow. Can be eaten but have a bitter, medicinal taste.", ItemCategory::Placeable)
            .icon("yarrow_seeds.png")
            .stackable(60)
            .respawn_time(480) // 8 minutes
            .consumable(1.0, 0.5, -0.5) // health, hunger, thirst - medicinal properties
            .cookable(22.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Chamomile Seeds - Calming herb seeds
        ItemBuilder::new("Chamomile Seeds", "Seeds for growing chamomile. Can be eaten but are very small and provide little nutrition.", ItemCategory::Placeable)
            .icon("chamomile_seeds.png")
            .stackable(80)
            .respawn_time(360) // 6 minutes
            .consumable(0.5, 0.5, 0.5) // health, hunger, thirst - mild calming effect
            .cookable(20.0, "Charcoal") // Burns directly to charcoal - tiny seeds just char
            .build(),

        // Valerian Seeds - Sedative herb seeds
        ItemBuilder::new("Valerian Seeds", "Seeds for growing valerian. Can be eaten but have a very strong, unpleasant taste.", ItemCategory::Placeable)
            .icon("valerian_seeds.png")
            .stackable(50)
            .respawn_time(600) // 10 minutes
            .consumable(1.0, -0.5, -1.0) // health, hunger, thirst - medicinal but unpalatable
            .cookable(22.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Mugwort Seeds - Bitter herb seeds
        ItemBuilder::new("Mugwort Seeds", "Seeds for growing mugwort. Can be eaten but are quite bitter and aromatic.", ItemCategory::Placeable)
            .icon("mugwort_seeds.png")
            .stackable(60)
            .respawn_time(420) // 7 minutes
            .consumable(0.5, 0.5, -0.5) // health, hunger, thirst
            .cookable(22.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Ginseng Seeds - Rare medicinal seeds
        ItemBuilder::new("Ginseng Seeds", "Rare seeds for growing Siberian ginseng. Can be eaten but provide minimal nutrition.", ItemCategory::Placeable)
            .icon("ginseng_seeds.png")
            .stackable(20)
            .respawn_time(1800) // 30 minutes - very rare
            .consumable(2.0, 0.5, 0.0) // health, hunger, thirst - medicinal properties
            .cookable(25.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // === SPECIAL PLANTING MATERIALS ===

        // Bear Garlic Bulbs - Wild garlic bulbs
        ItemBuilder::new("Bear Garlic Bulbs", "Wild garlic bulbs for planting. Can be eaten raw but have a very strong flavor.", ItemCategory::Placeable)
            .icon("bear_garlic_bulbs.png")
            .stackable(30)
            .respawn_time(720) // 12 minutes
            .consumable(1.5, 1.0, -1.5) // health, hunger, thirst - strong medicinal
            .cookable(30.0, "Charcoal") // Burns directly to charcoal - bulbs just char
            .build(),

        // Mint Cuttings - Mint propagation material
        ItemBuilder::new("Mint Cuttings", "Fresh mint cuttings for planting. Can be eaten for a refreshing taste.", ItemCategory::Placeable)
            .icon("mint_cuttings.png")
            .stackable(40)
            .respawn_time(300) // 5 minutes - spreads fast
            .consumable(0.5, 0.5, 2.0) // health, hunger, thirst - refreshing
            .cookable(20.0, "Charcoal") // Burns directly to charcoal - cuttings just char
            .build(),

        // Horseradish Root - Root cutting for planting
        ItemBuilder::new("Horseradish Root", "Root cutting for growing horseradish. Can be eaten but is extremely pungent and hot.", ItemCategory::Placeable)
            .icon("horseradish_root.png")
            .stackable(15)
            .respawn_time(1200) // 20 minutes
            .consumable(1.0, -1.0, -3.0) // health, hunger, thirst - very strong, reduces appetite
            .cookable(35.0, "Charcoal") // Burns directly to charcoal - root just chars
            .build(),



        // === FIBER PLANT SEEDS ===

        // Dogbane Seeds - Fiber plant seeds
        ItemBuilder::new("Dogbane Seeds", "Seeds for growing dogbane fiber plants. Can be eaten but provide minimal nutrition.", ItemCategory::Placeable)
            .icon("dogbane_seeds.png")
            .stackable(50)
            .respawn_time(600) // 10 minutes
            .consumable(0.0, 1.0, -0.5) // health, hunger, thirst
            .cookable(22.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Bog Cotton Seeds - Water fiber plant seeds
        ItemBuilder::new("Bog Cotton Seeds", "Seeds for growing bog cotton. Can be eaten but are quite fibrous and hard to digest.", ItemCategory::Placeable)
            .icon("bog_cotton_seeds.png")
            .stackable(60)
            .respawn_time(480) // 8 minutes
            .consumable(0.0, 0.5, -1.0) // health, hunger, thirst
            .cookable(22.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Arctic Hairgrass Seeds - Arctic fiber plant seeds
        ItemBuilder::new("Arctic Hairgrass Seeds", "Seeds for growing arctic hairgrass. A hardy arctic grass that provides fiber. Can be eaten but provides minimal nutrition.", ItemCategory::Placeable)
            .icon("arctic_hairgrass_seeds.png")
            .stackable(50)
            .respawn_time(600) // 10 minutes
            .consumable(0.0, 1.0, -0.5) // health, hunger, thirst
            .cookable(25.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // === MUSHROOM SPORES ===

        // Chanterelle Spores - Edible mushroom spores
        ItemBuilder::new("Chanterelle Spores", "Spores for growing chanterelle mushrooms. Can be eaten but provide minimal nutrition.", ItemCategory::Placeable)
            .icon("mushroom_spore.png")
            .stackable(20)
            .respawn_time(900) // 15 minutes
            .consumable(0.5, 1.0, 0.0) // health, hunger, thirst
            .cookable(15.0, "Charcoal") // Burns directly to charcoal - spores just char instantly
            .build(),

        // Porcini Spores - Premium mushroom spores
        ItemBuilder::new("Porcini Spores", "Spores for growing porcini mushrooms. Can be eaten but are very small.", ItemCategory::Placeable)
            .icon("mushroom_spore.png")
            .stackable(15)
            .respawn_time(1200) // 20 minutes
            .consumable(1.0, 1.0, 0.0) // health, hunger, thirst
            .cookable(15.0, "Charcoal") // Burns directly to charcoal - spores just char instantly
            .build(),

        // Shaggy Ink Cap Spores - Common mushroom spores
        ItemBuilder::new("Shaggy Ink Cap Spores", "Spores for growing shaggy ink cap mushrooms. Can be eaten but are very small.", ItemCategory::Placeable)
            .icon("mushroom_spore.png")
            .stackable(30)
            .respawn_time(600) // 10 minutes
            .consumable(0.5, 0.5, 0.0) // health, hunger, thirst
            .cookable(15.0, "Charcoal") // Burns directly to charcoal - spores just char instantly
            .build(),

        // Fly Agaric Spores - Toxic mushroom spores
        ItemBuilder::new("Fly Agaric Spores", "Spores for growing fly agaric mushrooms. Toxic if eaten.", ItemCategory::Placeable)
            .icon("mushroom_spore.png")
            .stackable(20)
            .respawn_time(800) // 13 minutes
            .consumable(-3.0, -1.0, -2.0) // health, hunger, thirst - toxic
            .cookable(15.0, "Charcoal") // Burns directly to charcoal - spores just char instantly
            .build(),

        // Deadly Webcap Spores - Extremely toxic spores
        ItemBuilder::new("Deadly Webcap Spores", "Spores for growing deadly webcap mushrooms. Extremely toxic if eaten.", ItemCategory::Placeable)
            .icon("mushroom_spore.png")
            .stackable(10)
            .respawn_time(1800) // 30 minutes - very rare
            .consumable(-8.0, -3.0, -5.0) // health, hunger, thirst - extremely toxic
            .cookable(15.0, "Charcoal") // Burns directly to charcoal - spores just char instantly
            .build(),

        // Destroying Angel Spores - Lethal mushroom spores
        ItemBuilder::new("Destroying Angel Spores", "Spores for growing destroying angel mushrooms. Lethal if eaten.", ItemCategory::Placeable)
            .icon("mushroom_spore.png")
            .stackable(5)
            .respawn_time(2400) // 40 minutes - extremely rare
            .consumable(-15.0, -5.0, -10.0) // health, hunger, thirst - lethal
            .cookable(15.0, "Charcoal") // Burns directly to charcoal - spores just char instantly
            .build(),

        // === BERRY SEEDS ===

        // Lingonberry Seeds - Tart berry seeds
        ItemBuilder::new("Lingonberry Seeds", "Seeds for growing lingonberry bushes. Can be eaten but are very small and tart.", ItemCategory::Placeable)
            .icon("lingonberry_seeds.png")
            .stackable(80)
            .respawn_time(900) // 15 minutes
            .consumable(0.5, 1.0, 1.0) // health, hunger, thirst - small but refreshing
            .cookable(18.0, "Charcoal") // Burns directly to charcoal - tiny seeds just char
            .build(),

        // Cloudberry Seeds - Rare arctic berry seeds
        ItemBuilder::new("Cloudberry Seeds", "Seeds for growing cloudberry plants. Can be eaten but are very small.", ItemCategory::Placeable)
            .icon("cloudberry_seeds.png")
            .stackable(60)
            .respawn_time(1200) // 20 minutes
            .consumable(1.0, 1.0, 1.0) // health, hunger, thirst - nutritious but small
            .cookable(18.0, "Charcoal") // Burns directly to charcoal - tiny seeds just char
            .build(),

        // Bilberry Seeds - Wild blueberry seeds
        ItemBuilder::new("Bilberry Seeds", "Seeds for growing bilberry bushes. Can be eaten but are very tiny.", ItemCategory::Placeable)
            .icon("bilberry_seeds.png")
            .stackable(100)
            .respawn_time(600) // 10 minutes
            .consumable(0.5, 0.5, 1.0) // health, hunger, thirst - sweet but tiny
            .cookable(18.0, "Charcoal") // Burns directly to charcoal - tiny seeds just char
            .build(),

        // Wild Strawberry Seeds - Small strawberry seeds
        ItemBuilder::new("Wild Strawberry Seeds", "Seeds for growing wild strawberry plants. Can be eaten but are extremely small.", ItemCategory::Placeable)
            .icon("wild_strawberry_seeds.png")
            .stackable(120)
            .respawn_time(480) // 8 minutes
            .consumable(0.5, 0.5, 0.5) // health, hunger, thirst - very small
            .cookable(18.0, "Charcoal") // Burns directly to charcoal - tiny seeds just char
            .build(),

        // Rowan Seeds - Mountain ash seeds
        ItemBuilder::new("Rowan Seeds", "Seeds for growing rowan trees. Can be eaten but are quite bitter.", ItemCategory::Placeable)
            .icon("rowan_seeds.png")
            .stackable(50)
            .respawn_time(1800) // 30 minutes
            .consumable(0.5, 1.0, -1.0) // health, hunger, thirst - bitter
            .cookable(20.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Cranberry Seeds - Bog berry seeds
        ItemBuilder::new("Cranberry Seeds", "Seeds for growing cranberry plants. Can be eaten but are very tart and small.", ItemCategory::Placeable)
            .icon("cranberry_seeds.png")
            .stackable(80)
            .respawn_time(900) // 15 minutes
            .consumable(1.0, 1.0, 0.5) // health, hunger, thirst - tart but healthy
            .cookable(18.0, "Charcoal") // Burns directly to charcoal - tiny seeds just char
            .build(),

        // === TOXIC PLANT SEEDS ===

        // Mandrake Seeds - Extremely rare and dangerous
        ItemBuilder::new("Mandrake Seeds", "Rare seeds for growing mandrake plants. Highly toxic if eaten.", ItemCategory::Placeable)
            .icon("mandrake_seeds.png")
            .stackable(5)
            .respawn_time(3600) // 60 minutes - extremely rare
            .consumable(-10.0, -2.0, -5.0) // health, hunger, thirst - very toxic
            .cookable(25.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Belladonna Seeds - Deadly nightshade seeds
        ItemBuilder::new("Belladonna Seeds", "Seeds for growing belladonna plants. Deadly if eaten.", ItemCategory::Placeable)
            .icon("belladonna_seeds.png")
            .stackable(10)
            .respawn_time(2400) // 40 minutes
            .consumable(-12.0, -3.0, -6.0) // health, hunger, thirst - deadly
            .cookable(25.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Henbane Seeds - Toxic herb seeds
        ItemBuilder::new("Henbane Seeds", "Seeds for growing henbane plants. Toxic if eaten.", ItemCategory::Placeable)
            .icon("henbane_seeds.png")
            .stackable(15)
            .respawn_time(1800) // 30 minutes
            .consumable(-8.0, -2.0, -4.0) // health, hunger, thirst - toxic
            .cookable(25.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Datura Seeds - Hallucinogenic plant seeds
        ItemBuilder::new("Datura Seeds", "Seeds for growing datura plants. Highly toxic and hallucinogenic if eaten.", ItemCategory::Placeable)
            .icon("datura_seeds.png")
            .stackable(10)
            .respawn_time(2100) // 35 minutes
            .consumable(-10.0, -3.0, -5.0) // health, hunger, thirst - toxic and hallucinogenic
            .cookable(25.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Wolfsbane Seeds - Extremely toxic flower seeds
        ItemBuilder::new("Wolfsbane Seeds", "Seeds for growing wolfsbane plants. Extremely toxic if eaten.", ItemCategory::Placeable)
            .icon("wolfsbane_seeds.png")
            .stackable(8)
            .respawn_time(2700) // 45 minutes
            .consumable(-15.0, -4.0, -8.0) // health, hunger, thirst - extremely toxic
            .cookable(25.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // === NON-EDIBLE PLANTING MATERIALS ===

        // Seed Potato - Not technically a seed, but plantable
        ItemBuilder::new("Seed Potato", "Potato tuber for planting. Not recommended for eating raw.", ItemCategory::Placeable)
            .icon("seed_potato.png")
            .stackable(20)
            .respawn_time(900) // 15 minutes - rare
            .consumable(-1.0, -2.0, -2.0) // health, hunger, thirst
            .cookable(40.0, "Charcoal") // Burns directly to charcoal - raw potato chars
            .build(),

        // Corn Seeds - Large seeds
        ItemBuilder::new("Corn Seeds", "Large seeds for planting corn. Can be eaten but are quite hard.", ItemCategory::Placeable)
            .icon("corn_seeds.png")
            .stackable(20)
            .respawn_time(1200) // 20 minutes - valuable crop
            .consumable(0.0, 1.0, -2.0) // health, hunger, thirst
            .cookable(30.0, "Charcoal") // Burns directly to charcoal - hard kernels just char
            .build(),

        // Nettle Seeds - Fiber crop seeds
        ItemBuilder::new("Nettle Seeds", "Seeds for growing nettle plants. Edible but can cause mouth irritation.", ItemCategory::Placeable)
            .icon("nettle_seeds.png")
            .stackable(30)
            .respawn_time(600) // 10 minutes
            .consumable(-0.5, 1.0, -1.0) // health, hunger, thirst
            .cookable(22.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Reed Rhizome - Water plant propagation (NOT a seed, but plantable)
        ItemBuilder::new("Reed Rhizome", "Root cutting from reed plants. Can be deployed to grow reed stalks near water. Not edible.", ItemCategory::Placeable)
            .icon("reed_rhizome.png")
            .stackable(15)
            .respawn_time(720) // 12 minutes
            .consumable(-3.0, -5.0, -5.0) // health, hunger, thirst
            .cookable(35.0, "Charcoal") // Burns directly to charcoal - rhizome just chars
            .build(),

        // Seaweed Frond - Underwater plant propagation (vegetative reproduction via frond cutting)
        ItemBuilder::new("Seaweed Frond", "A segment of seaweed thallus that can regrow into a full plant. Plant on any water tile.", ItemCategory::Placeable)
            .icon("seaweed_frond.png")
            .stackable(20)
            .respawn_time(600) // 10 minutes
            .consumable(-1.0, 2.0, 2.0) // health, hunger, thirst - slightly edible but slimy
            .cookable(25.0, "Dried Seaweed") // Drying improves it
            .build(),

        // === ARCTIC/SUBARCTIC PLANT SEEDS (Botanically accurate for Aleutian Islands) ===

        // Scurvy Grass Seeds - Arctic vitamin C source
        ItemBuilder::new("Scurvy Grass Seeds", "Seeds for growing scurvy grass. Can be eaten but have a peppery, bitter taste. Rich in vitamin C.", ItemCategory::Placeable)
            .icon("scurvy_grass_seeds.png")
            .stackable(60)
            .respawn_time(300) // 5 minutes - hardy, fast-growing
            .consumable(1.0, 0.5, 0.5) // health, hunger, thirst - vitamin C boost
            .cookable(20.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Crowberry Seeds - Hardy subarctic berries
        ItemBuilder::new("Crowberry Seeds", "Seeds for growing crowberry plants. Can be eaten but are very small and tart.", ItemCategory::Placeable)
            .icon("crowberry_seeds.png")
            .stackable(80)
            .respawn_time(1200) // 20 minutes - slow-growing perennial
            .consumable(0.5, 0.5, 1.0) // health, hunger, thirst - small but refreshing
            .cookable(18.0, "Charcoal") // Burns directly to charcoal - tiny seeds just char
            .build(),

        // Fireweed Seeds - Common tundra plant seeds
        ItemBuilder::new("Fireweed Seeds", "Seeds for growing fireweed. A common tundra plant with edible shoots. Can be eaten but provide minimal nutrition.", ItemCategory::Placeable)
            .icon("fireweed_seeds.png")
            .stackable(70)
            .respawn_time(900) // 15 minutes - common tundra plant
            .consumable(0.5, 1.0, 0.0) // health, hunger, thirst - minimal nutrition
            .cookable(20.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Sea Plantain Seeds - Maritime plant seeds
        ItemBuilder::new("Sea Plantain Seeds", "Seeds for growing sea plantain. Can be eaten but have a salty, slightly bitter taste.", ItemCategory::Placeable)
            .icon("sea_plantain_seeds.png")
            .stackable(70)
            .respawn_time(600) // 10 minutes - salt-tolerant
            .consumable(0.5, 1.0, -1.0) // health, hunger, thirst - salty
            .cookable(20.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Glasswort Seeds - Salt-tolerant succulent seeds
        ItemBuilder::new("Glasswort Seeds", "Seeds for growing glasswort. Can be eaten but are very salty and crunchy.", ItemCategory::Placeable)
            .icon("glasswort_seeds.png")
            .stackable(50)
            .respawn_time(720) // 12 minutes - specialized coastal plant
            .consumable(1.0, 1.0, -2.0) // health, hunger, thirst - very salty
            .cookable(22.0, "Charcoal") // Burns directly to charcoal - small seeds just char
            .build(),

        // Beach Lyme Grass Seeds - Coastal grass seeds (beach-only planting)
        ItemBuilder::new("Beach Lyme Grass Seeds", "Seeds for growing beach lyme grass. Can only be planted on beach tiles. Can be eaten but are fibrous and not very nutritious.", ItemCategory::Placeable)
            .icon("beach_lyme_grass_seeds.png")
            .stackable(60)
            .respawn_time(480) // 8 minutes - fast-growing coastal grass
            .consumable(0.5, 0.5, 0.0) // health, hunger, thirst - minimal nutrition
            .cookable(22.0, "Charcoal") // Burns directly to charcoal - grass seeds just char
            .build(),

        // === ALPINE PLANT SPORES/SEEDS ===

        // Arctic Poppy Seeds - Rare alpine flower seeds
        ItemBuilder::new("Arctic Poppy Seeds", "Seeds for growing arctic poppies. These hardy alpine flowers grow year-round in harsh conditions. Can be eaten but are very small.", ItemCategory::Placeable)
            .icon("arctic_poppy_seeds.png")
            .stackable(40)
            .respawn_time(1800) // 30 minutes - rare alpine flower
            .consumable(0.5, 0.5, 0.5) // health, hunger, thirst - minimal nutrition
            .cookable(18.0, "Charcoal") // Burns directly to charcoal - tiny seeds just char
            .build(),

        // Lichen Spores - Slow-growing alpine lichen
        ItemBuilder::new("Lichen Spores", "Spores for growing arctic lichen. Extremely slow-growing but hardy in alpine conditions. Can be eaten but provide minimal nutrition.", ItemCategory::Placeable)
            .icon("lichen_spores.png")
            .stackable(30)
            .respawn_time(2400) // 40 minutes - very slow growing
            .consumable(0.5, 1.0, 0.0) // health, hunger, thirst - minimal nutrition
            .cookable(15.0, "Charcoal") // Burns directly to charcoal - spores just char instantly
            .build(),

        // Moss Spores - Alpine moss propagation
        ItemBuilder::new("Moss Spores", "Spores for growing mountain moss. Grows on rocks in alpine conditions. Can be eaten but are very fibrous.", ItemCategory::Placeable)
            .icon("moss_spores.png")
            .stackable(40)
            .respawn_time(1500) // 25 minutes - moderate growth
            .consumable(0.5, 1.0, 0.5) // health, hunger, thirst - fibrous
            .cookable(15.0, "Charcoal") // Burns directly to charcoal - spores just char instantly
            .build(),
    ]
}
