//! Spoiled food item definitions and conversion logic.
//! When perishable food fully spoils (durability hits 0), it converts to its "Spoiled X" variant
//! instead of disappearing. Spoiled items are compostable with higher fertilizer yield
//! and have a very high poisoning chance if consumed.

use crate::items::{ItemDefinition, ItemCategory};
use crate::items_database::builders::ItemBuilder;

/// Spoiled items use the base icon with a greenish tint applied client-side (like burnt items use gray).
/// We use the original item's icon - client applies "spoiled" filter via isSpoiledItem().
fn spoiled_item(name: &str, base_icon: &str, description: &str, stack_size: u32, health: f32, hunger: f32, thirst: f32) -> ItemDefinition {
    ItemBuilder::new(name, description, ItemCategory::Consumable)
        .icon(base_icon)
        .stackable(stack_size)
        .consumable(health, hunger, thirst)
        .preserved() // Spoiled items don't spoil further - they're the final state
        .build()
}

/// Returns all spoiled item definitions.
/// Spoiled items: negative nutrition, high poison chance when consumed, excellent for compost.
pub fn get_spoiled_item_definitions() -> Vec<ItemDefinition> {
    vec![
        // === VEGETABLES ===
        spoiled_item("Spoiled Pumpkin", "pumpkin.png", "Rotten pumpkin. Foul-smelling and dangerous to eat. Best used for compost.", 10, -10.0, 2.0, -15.0),
        spoiled_item("Spoiled Cooked Pumpkin", "cooked_pumpkin.png", "Spoiled cooked pumpkin. A wasted meal turned toxic.", 10, -12.0, 3.0, -18.0),
        spoiled_item("Spoiled Cooked Potato", "cooked_potato.png", "Rotten cooked potato. Smells terrible and will make you sick.", 20, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Carrot", "carrot.png", "Mushy, rotten carrot. Do not eat.", 15, -6.0, 1.0, -10.0),
        spoiled_item("Spoiled Cooked Carrot", "cooked_carrot.png", "Spoiled cooked carrot. A lost meal.", 15, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Raw Corn", "corn.png", "Rotten corn. Moldy and dangerous.", 20, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Cooked Corn", "cooked_corn.png", "Spoiled cooked corn. Waste.", 20, -10.0, 3.0, -15.0),
        spoiled_item("Spoiled Beet", "beet.png", "Rotting beet. Foul and inedible.", 12, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Cooked Beet", "cooked_beet.png", "Spoiled cooked beet.", 12, -10.0, 3.0, -15.0),
        spoiled_item("Spoiled Cabbage", "cabbage.png", "Rotten cabbage. Slimy and putrid.", 15, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Cooked Cabbage", "cooked_cabbage.png", "Spoiled cooked cabbage.", 15, -10.0, 3.0, -15.0),
        spoiled_item("Spoiled Cooked Chicory", "cooked_chicory.png", "Spoiled cooked chicory.", 12, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Cooked Nettle Leaves", "cooked_nettle_leaves.png", "Spoiled nettle leaves.", 25, -6.0, 1.0, -10.0),
        spoiled_item("Spoiled Cooked Kamchatka Lily Bulb", "cooked_kamchatka_lily_bulb.png", "Spoiled lily bulb.", 15, -12.0, 3.0, -18.0),
        spoiled_item("Spoiled Cooked Silverweed Root", "cooked_silverweed_root.png", "Spoiled silverweed root.", 20, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Cooked Bistort Bulbils", "cooked_bistort_bulbils.png", "Spoiled bistort bulbils.", 40, -6.0, 1.0, -10.0),
        spoiled_item("Spoiled Cooked Wild Celery", "cooked_wild_celery.png", "Spoiled wild celery.", 15, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Cooked Salsify Root", "cooked_salsify.png", "Spoiled salsify.", 12, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Cooked Fennel", "cooked_fennel.png", "Spoiled fennel.", 12, -10.0, 3.0, -15.0),

        // === MEATS ===
        spoiled_item("Spoiled Raw Human Flesh", "human_meat.png", "Putrid human flesh. Extremely dangerous to consume.", 10, -20.0, 2.0, -25.0),
        spoiled_item("Spoiled Cooked Human Flesh", "cooked_human_meat.png", "Spoiled cooked human flesh.", 10, -18.0, 3.0, -22.0),
        spoiled_item("Spoiled Raw Wolf Meat", "wolf_meat.png", "Rotten wolf meat. Foul and crawling with bacteria.", 12, -15.0, 2.0, -20.0),
        spoiled_item("Spoiled Cooked Wolf Meat", "cooked_wolf_meat.png", "Spoiled cooked wolf meat.", 12, -16.0, 4.0, -22.0),
        spoiled_item("Spoiled Raw Fox Meat", "fox_meat.png", "Rotten fox meat. Do not eat.", 15, -12.0, 2.0, -18.0),
        spoiled_item("Spoiled Cooked Fox Meat", "cooked_fox_meat.png", "Spoiled cooked fox meat.", 15, -14.0, 3.0, -20.0),
        spoiled_item("Spoiled Raw Viper Meat", "viper_meat.png", "Spoiled snake meat.", 20, -10.0, 1.0, -14.0),
        spoiled_item("Spoiled Cooked Viper Meat", "cooked_viper_meat.png", "Spoiled cooked viper meat.", 20, -12.0, 2.0, -16.0),
        spoiled_item("Spoiled Raw Crab Meat", "crab_meat.png", "Rotten crab meat. Seafood spoils fast.", 20, -12.0, 2.0, -16.0),
        spoiled_item("Spoiled Cooked Crab Meat", "cooked_crab_meat.png", "Spoiled cooked crab meat.", 20, -14.0, 3.0, -18.0),
        spoiled_item("Spoiled Raw Tern Meat", "raw_tern_meat.png", "Spoiled tern meat.", 20, -8.0, 1.0, -12.0),
        spoiled_item("Spoiled Cooked Tern Meat", "cooked_tern_meat.png", "Spoiled cooked tern meat.", 20, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Raw Crow Meat", "raw_crow_meat.png", "Spoiled crow meat.", 20, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Cooked Crow Meat", "cooked_crow_meat.png", "Spoiled cooked crow meat.", 20, -12.0, 3.0, -16.0),
        spoiled_item("Spoiled Raw Vole Meat", "vole_meat.png", "Spoiled vole meat.", 30, -5.0, 0.0, -8.0),
        spoiled_item("Spoiled Cooked Vole Meat", "cooked_vole_meat.png", "Spoiled cooked vole meat.", 30, -6.0, 1.0, -10.0),
        spoiled_item("Spoiled Raw Wolverine Meat", "wolverine_meat.png", "Rotten wolverine meat. Extremely foul.", 10, -18.0, 3.0, -24.0),
        spoiled_item("Spoiled Cooked Wolverine Meat", "cooked_wolverine_meat.png", "Spoiled cooked wolverine meat.", 10, -20.0, 4.0, -26.0),
        spoiled_item("Spoiled Raw Caribou Meat", "caribou_meat.png", "Rotten caribou meat. A waste of good venison.", 10, -14.0, 3.0, -20.0),
        spoiled_item("Spoiled Cooked Caribou Meat", "cooked_caribou_meat.png", "Spoiled cooked caribou meat.", 10, -16.0, 4.0, -22.0),
        spoiled_item("Spoiled Raw Walrus Meat", "walrus_meat.png", "Rotten walrus meat. The fat has turned rancid.", 10, -18.0, 4.0, -24.0),
        spoiled_item("Spoiled Cooked Walrus Meat", "cooked_walrus_meat.png", "Spoiled cooked walrus meat.", 10, -20.0, 5.0, -26.0),
        spoiled_item("Spoiled Raw Bear Meat", "bear_meat.png", "Rotten bear meat. Rank and dangerous.", 10, -20.0, 5.0, -26.0),
        spoiled_item("Spoiled Cooked Bear Meat", "cooked_bear_meat.png", "Spoiled cooked bear meat.", 10, -22.0, 6.0, -28.0),
        spoiled_item("Spoiled Raw Hare Meat", "hare_meat.png", "Spoiled hare meat.", 10, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Cooked Hare Meat", "cooked_hare_meat.png", "Spoiled cooked hare meat.", 10, -12.0, 3.0, -16.0),
        spoiled_item("Spoiled Raw Owl Meat", "owl_meat.png", "Spoiled owl meat.", 10, -12.0, 2.0, -16.0),
        spoiled_item("Spoiled Cooked Owl Meat", "cooked_owl_meat.png", "Spoiled cooked owl meat.", 10, -14.0, 3.0, -18.0),
        spoiled_item("Spoiled Raw Shark Meat", "raw_shark_meat.png", "Rotten shark meat. Seafood spoils quickly.", 10, -16.0, 4.0, -22.0),
        spoiled_item("Spoiled Cooked Shark Meat", "cooked_shark_meat.png", "Spoiled cooked shark meat.", 10, -18.0, 5.0, -24.0),

        // === FISH (sample - same pattern for all) ===
        spoiled_item("Spoiled Raw Twigfish", "raw_twigfish.png", "Spoiled twigfish.", 10, -8.0, 1.0, -12.0),
        spoiled_item("Spoiled Cooked Twigfish", "cooked_twigfish.png", "Spoiled cooked twigfish.", 10, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Raw Herring", "raw_herring.png", "Spoiled herring.", 15, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Cooked Herring", "cooked_herring.png", "Spoiled cooked herring.", 15, -12.0, 3.0, -16.0),
        spoiled_item("Spoiled Raw Halibut", "raw_halibut.png", "Spoiled halibut.", 3, -14.0, 4.0, -20.0),
        spoiled_item("Spoiled Cooked Halibut", "cooked_halibut.png", "Spoiled cooked halibut.", 3, -16.0, 5.0, -22.0),

        // === REMAINING FISH (raw + cooked) ===
        spoiled_item("Spoiled Raw Smelt", "raw_smelt.png", "Spoiled smelt.", 15, -8.0, 1.0, -12.0),
        spoiled_item("Spoiled Cooked Smelt", "cooked_smelt.png", "Spoiled cooked smelt.", 15, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Raw Greenling", "raw_greenling.png", "Spoiled greenling.", 10, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Cooked Greenling", "cooked_greenling.png", "Spoiled cooked greenling.", 10, -12.0, 3.0, -16.0),
        spoiled_item("Spoiled Raw Sculpin", "raw_sculpin.png", "Spoiled sculpin.", 10, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Cooked Sculpin", "cooked_sculpin.png", "Spoiled cooked sculpin.", 10, -12.0, 3.0, -16.0),
        spoiled_item("Spoiled Raw Pacific Cod", "raw_pacific_cod.png", "Spoiled cod.", 8, -12.0, 3.0, -18.0),
        spoiled_item("Spoiled Cooked Pacific Cod", "cooked_pacific_cod.png", "Spoiled cooked cod.", 8, -14.0, 4.0, -20.0),
        spoiled_item("Spoiled Raw Dolly Varden", "raw_dolly_varden.png", "Spoiled char.", 8, -12.0, 3.0, -18.0),
        spoiled_item("Spoiled Cooked Dolly Varden", "cooked_dolly_varden.png", "Spoiled cooked char.", 8, -14.0, 4.0, -20.0),
        spoiled_item("Spoiled Raw Rockfish", "raw_rockfish.png", "Spoiled rockfish.", 6, -14.0, 4.0, -20.0),
        spoiled_item("Spoiled Cooked Rockfish", "cooked_rockfish.png", "Spoiled cooked rockfish.", 6, -16.0, 5.0, -22.0),
        spoiled_item("Spoiled Raw Steelhead", "raw_steelhead.png", "Spoiled steelhead.", 6, -14.0, 4.0, -20.0),
        spoiled_item("Spoiled Cooked Steelhead", "cooked_steelhead.png", "Spoiled cooked steelhead.", 6, -16.0, 5.0, -22.0),
        spoiled_item("Spoiled Raw Pink Salmon", "raw_pink_salmon.png", "Spoiled salmon.", 5, -14.0, 4.0, -20.0),
        spoiled_item("Spoiled Cooked Pink Salmon", "cooked_pink_salmon.png", "Spoiled cooked salmon.", 5, -16.0, 5.0, -22.0),
        spoiled_item("Spoiled Raw Sockeye Salmon", "raw_sockeye_salmon.png", "Spoiled sockeye.", 5, -16.0, 5.0, -22.0),
        spoiled_item("Spoiled Cooked Sockeye Salmon", "cooked_sockeye_salmon.png", "Spoiled cooked sockeye.", 5, -18.0, 6.0, -24.0),
        spoiled_item("Spoiled Raw King Salmon", "raw_king_salmon.png", "Spoiled king salmon.", 3, -18.0, 6.0, -24.0),
        spoiled_item("Spoiled Cooked King Salmon", "cooked_king_salmon.png", "Spoiled cooked king salmon.", 3, -20.0, 7.0, -26.0),

        // === SEAFOOD/SHELLFISH ===
        spoiled_item("Spoiled Raw Black Katy Chiton", "raw_black_katy_chiton.png", "Spoiled chiton.", 15, -8.0, 1.0, -12.0),
        spoiled_item("Spoiled Cooked Black Katy Chiton", "cooked_black_katy_chiton.png", "Spoiled cooked chiton.", 15, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Raw Sea Urchin", "raw_sea_urchin.png", "Spoiled sea urchin.", 15, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Cooked Sea Urchin", "cooked_sea_urchin.png", "Spoiled cooked sea urchin.", 15, -12.0, 3.0, -16.0),
        spoiled_item("Spoiled Raw Blue Mussel", "raw_blue_mussel.png", "Spoiled mussel.", 20, -8.0, 1.0, -10.0),
        spoiled_item("Spoiled Cooked Blue Mussel", "cooked_blue_mussel.png", "Spoiled cooked mussel.", 20, -10.0, 2.0, -12.0),
        spoiled_item("Spoiled Seaweed", "seaweed.png", "Spoiled seaweed. Slimy and foul.", 20, -6.0, 1.0, -8.0),

        // === MUSHROOMS ===
        spoiled_item("Spoiled Chanterelle", "chanterelle.png", "Spoiled chanterelle.", 20, -8.0, 1.0, -12.0),
        spoiled_item("Spoiled Cooked Chanterelle", "cooked_chanterelle.png", "Spoiled cooked chanterelle.", 20, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Porcini", "porcini.png", "Spoiled porcini.", 15, -8.0, 1.0, -12.0),
        spoiled_item("Spoiled Cooked Porcini", "cooked_porcini.png", "Spoiled cooked porcini.", 15, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Shaggy Ink Cap", "shaggy_ink_cap.png", "Spoiled ink cap. Black and slimy.", 15, -10.0, 1.0, -14.0),
        spoiled_item("Spoiled Cooked Shaggy Ink Cap", "cooked_shaggy_ink_cap.png", "Spoiled cooked ink cap.", 15, -12.0, 2.0, -16.0),

        // === REMAINING VEGETABLES/PLANTS ===
        spoiled_item("Spoiled Potato", "potato.png", "Rotten potato. Soft and sprouting.", 20, -6.0, 1.0, -10.0),
        spoiled_item("Spoiled Cooked Horseradish", "cooked_horseradish.png", "Spoiled cooked horseradish.", 12, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Horseradish Root", "horseradish_root.png", "Rotten horseradish root.", 12, -6.0, 1.0, -10.0),
        spoiled_item("Spoiled Sunflower", "sunflower.png", "Wilted spoiled sunflower.", 12, -6.0, 1.0, -10.0),
        spoiled_item("Spoiled Cooked Sunflower", "cooked_sunflower.png", "Spoiled cooked sunflower.", 12, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Salsify Root", "salsify.png", "Spoiled salsify root.", 12, -6.0, 1.0, -10.0),
        spoiled_item("Spoiled Fennel", "fennel.png", "Spoiled raw fennel.", 12, -6.0, 1.0, -10.0),
        spoiled_item("Spoiled Fennel Fronds", "fennel_fronds.png", "Wilted spoiled fennel fronds.", 15, -4.0, 0.0, -6.0),
        spoiled_item("Spoiled Wild Celery Stalks", "wild_celery_stalks.png", "Spoiled celery stalks.", 15, -4.0, 0.0, -6.0),
        spoiled_item("Spoiled Chicory", "chicory.png", "Spoiled raw chicory.", 12, -6.0, 1.0, -10.0),
        spoiled_item("Spoiled Bear Garlic", "bear_garlic.png", "Spoiled bear garlic.", 16, -8.0, 1.0, -12.0),
        spoiled_item("Spoiled Roasted Bear Garlic", "roasted_bear_garlic.png", "Spoiled roasted garlic.", 16, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Nettle Leaves", "nettle_leaves.png", "Spoiled nettles. Still sting.", 25, -4.0, 0.0, -6.0),
        spoiled_item("Spoiled Valerian Root", "valerian.png", "Spoiled valerian root.", 15, -6.0, 1.0, -10.0),
        spoiled_item("Spoiled Siberian Ginseng", "siberian_ginseng.png", "Spoiled ginseng root.", 8, -8.0, 1.0, -12.0),
        spoiled_item("Spoiled Valerian Leaves", "valerian_leaves.png", "Spoiled valerian leaves.", 25, -4.0, 0.0, -6.0),
        spoiled_item("Spoiled Ginseng Leaves", "ginseng_leaves.png", "Spoiled ginseng leaves.", 15, -4.0, 0.0, -6.0),
        spoiled_item("Spoiled Scurvy Grass", "scurvy_grass.png", "Spoiled scurvy grass.", 15, -4.0, 0.0, -6.0),
        spoiled_item("Spoiled Crowberry", "crowberry.png", "Spoiled crowberry.", 20, -4.0, 0.0, -6.0),
        spoiled_item("Spoiled Sea Plantain", "sea_plantain.png", "Spoiled sea plantain.", 15, -4.0, 0.0, -6.0),
        spoiled_item("Spoiled Glasswort", "glasswort.png", "Spoiled glasswort.", 15, -4.0, 0.0, -6.0),
        spoiled_item("Spoiled Nagoonberries", "nagoonberries.png", "Spoiled nagoonberries.", 20, -4.0, 0.0, -8.0),
        spoiled_item("Spoiled Fireweed Shoots", "fireweed_shoots.png", "Spoiled fireweed shoots.", 15, -4.0, 0.0, -6.0),

        // === BERRIES ===
        spoiled_item("Spoiled Lingonberries", "lingonberries.png", "Spoiled lingonberries. Mushy and fermented.", 30, -5.0, 0.0, -8.0),
        spoiled_item("Spoiled Cloudberries", "cloudberries.png", "Spoiled cloudberries.", 25, -5.0, 0.0, -8.0),
        spoiled_item("Spoiled Bilberries", "bilberries.png", "Spoiled bilberries. Moldy.", 30, -5.0, 0.0, -8.0),
        spoiled_item("Spoiled Rowan Berries", "rowan_berries.png", "Spoiled rowan berries.", 25, -5.0, 0.0, -8.0),
        spoiled_item("Spoiled Cranberries", "cranberries.png", "Spoiled cranberries.", 30, -5.0, 0.0, -8.0),
        spoiled_item("Spoiled Wild Strawberries", "wild_strawberries.png", "Spoiled wild strawberries. Mushy.", 20, -5.0, 0.0, -8.0),
        spoiled_item("Spoiled Crab Apples", "crab_apples.png", "Spoiled crab apples.", 12, -6.0, 1.0, -10.0),
        spoiled_item("Spoiled Cooked Crab Apples", "cooked_crab_apples.png", "Spoiled cooked crab apples.", 12, -8.0, 2.0, -12.0),

        // === NUTS/PINECONE ===
        spoiled_item("Spoiled Hazelnuts", "hazelnuts.png", "Spoiled hazelnuts. Rancid.", 12, -4.0, 0.0, -6.0),
        spoiled_item("Spoiled Roasted Hazelnuts", "cooked_hazelnuts.png", "Spoiled roasted hazelnuts.", 12, -6.0, 1.0, -8.0),
        spoiled_item("Spoiled Olives", "olives.png", "Spoiled GMO olives. Oily, sour, and unsafe.", 20, -6.0, 0.0, -8.0),
        spoiled_item("Spoiled Pinecone", "pinecone.png", "Spoiled pinecone.", 12, -4.0, 0.0, -6.0),
        spoiled_item("Spoiled Cooked Pinecone", "cooked_pinecone.png", "Spoiled cooked pinecone.", 12, -6.0, 1.0, -8.0),

        // === DAIRY/PROCESSED ===
        spoiled_item("Spoiled Raw Milk", "milk.png", "Curdled spoiled milk.", 5, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Warm Milk", "warm_milk.png", "Spoiled warm milk.", 5, -10.0, 3.0, -14.0),
        spoiled_item("Spoiled Yogurt", "yogurt.png", "Spoiled yogurt.", 8, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Berry Mash", "berry_mash.png", "Spoiled berry mash. Fermented and foul.", 10, -8.0, 2.0, -12.0),
        spoiled_item("Spoiled Starchy Mash", "root_mash.png", "Spoiled starchy mash.", 10, -8.0, 2.0, -12.0),

        // === TOXIC PLANTS (these spoil too - they're organic) ===
        spoiled_item("Spoiled Mandrake Root", "mandrake_root.png", "Spoiled mandrake root.", 10, -18.0, 1.0, -20.0),
        spoiled_item("Spoiled Belladonna", "belladonna.png", "Spoiled belladonna.", 12, -15.0, 1.0, -18.0),
        spoiled_item("Spoiled Henbane", "henbane.png", "Spoiled henbane.", 15, -15.0, 1.0, -18.0),
        spoiled_item("Spoiled Datura", "datura.png", "Spoiled datura.", 12, -18.0, 1.0, -20.0),
        spoiled_item("Spoiled Wolfsbane", "wolfsbane.png", "Spoiled wolfsbane.", 10, -18.0, 1.0, -20.0),
        spoiled_item("Spoiled Arctic Poppy", "arctic_poppy.png", "Spoiled arctic poppy.", 15, -10.0, 1.0, -14.0),

        // === COOKED RECIPES/MEALS ===
        spoiled_item("Spoiled Vegetable Stew", "vegetable_stew.png", "Spoiled vegetable stew. Bubbling and foul.", 5, -15.0, 4.0, -20.0),
        spoiled_item("Spoiled Root Vegetable Medley", "root_medley.png", "Spoiled root medley.", 5, -15.0, 4.0, -20.0),
        spoiled_item("Spoiled Stuffed Pumpkin", "stuffed_pumpkin.png", "Spoiled stuffed pumpkin.", 3, -18.0, 5.0, -24.0),
        spoiled_item("Spoiled Fish Pie", "fish_pie.png", "Spoiled fish pie. Extremely dangerous.", 3, -20.0, 5.0, -26.0),
        spoiled_item("Spoiled Seafood Platter", "seafood_platter.png", "Spoiled seafood platter.", 3, -22.0, 6.0, -28.0),
        spoiled_item("Spoiled Salmon Bake", "salmon_bake.png", "Spoiled salmon bake.", 3, -20.0, 5.0, -26.0),
        spoiled_item("Spoiled Crab Cakes", "crab_cakes.png", "Spoiled crab cakes.", 5, -18.0, 4.0, -22.0),
        spoiled_item("Spoiled Hunter's Feast", "hunters_feast.png", "Spoiled hunter's feast.", 3, -22.0, 6.0, -28.0),
        spoiled_item("Spoiled Herb-Crusted Meat", "herb_crusted_meat.png", "Spoiled herb-crusted meat.", 5, -18.0, 5.0, -24.0),
        spoiled_item("Spoiled Bear Roast", "bear_roast.png", "Spoiled bear roast.", 3, -22.0, 6.0, -28.0),
        spoiled_item("Spoiled Mushroom Medley", "mushroom_medley.png", "Spoiled mushroom medley.", 5, -15.0, 4.0, -20.0),
        spoiled_item("Spoiled Stuffed Mushrooms", "stuffed_mushrooms.png", "Spoiled stuffed mushrooms.", 5, -15.0, 4.0, -20.0),
        spoiled_item("Spoiled Berry Tart", "berry_tart.png", "Spoiled berry tart. Moldy.", 5, -12.0, 3.0, -16.0),
        spoiled_item("Spoiled Mixed Berry Bowl", "mixed_berry_bowl.png", "Spoiled mixed berry bowl.", 5, -10.0, 2.0, -14.0),
        spoiled_item("Spoiled Aleutian Bread", "aleutian_bread.png", "Spoiled Aleutian bread. Moldy.", 5, -10.0, 3.0, -16.0),
        spoiled_item("Spoiled Berry Aleutian Bread", "berry_aleutian_bread.png", "Spoiled berry bread.", 5, -12.0, 3.0, -18.0),
    ]
}

/// Items that should NOT convert to spoiled (special handling or already at end state).
/// Returns true if the item should be excluded from spoiled conversion.
pub fn should_skip_spoiled_conversion(item_name: &str) -> bool {
    let name = item_name.to_lowercase();
    // Queen Bee - special case, she "dies" (could delete or handle differently)
    name.contains("queen bee") ||
    // Already at end state
    name.starts_with("spoiled ") ||
    name.starts_with("burnt ")
}

/// Returns the spoiled variant name for a given food item, or None if it doesn't convert.
pub fn get_spoiled_item_name(original_name: &str) -> Option<String> {
    if should_skip_spoiled_conversion(original_name) {
        return None;
    }
    Some(format!("Spoiled {}", original_name))
}
