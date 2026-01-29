use crate::items::ItemDefinition;
use crate::items::{ItemCategory, CostIngredient};
use super::builders::*;

/// All consumable items in the game - food, medicine, and survival items
pub fn get_consumable_definitions() -> Vec<ItemDefinition> {
    vec![
        ItemBuilder::new("Pumpkin", "A large, raw pumpkin. Can be cooked.", ItemCategory::Consumable)
            .icon("pumpkin.png")
            .stackable(5)
            .consumable(8.0, 20.0, 10.0)
            .cookable(40.0, "Cooked Pumpkin")
            .respawn_time(300)
            .build(),

        ItemBuilder::new("Cooked Pumpkin", "Soft, sweet, and nutritious cooked pumpkin chunks.", ItemCategory::Consumable)
            .icon("cooked_pumpkin.png")
            .stackable(10)
            .consumable(35.0, 55.0, 35.0) // Increased health/hunger/thirst to compensate for removed stamina
            .cookable(45.0, "Burnt Pumpkin")
            .respawn_time(360)
            .build(),

        ItemBuilder::new("Burnt Pumpkin", "A blackened, mushy mess. Not recommended for eating, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_pumpkin.png")
            .stackable(10)
            .consumable(-8.0, 8.0, -10.0)
            .crafting_output(18, 0)
            .cookable(60.0, "Charcoal")
            .respawn_time(30)
            .build(),

        // NOTE: Raw Potato moved to seeds.rs - it's now Placeable + Consumable (plant potatoes to grow potatoes)

        ItemBuilder::new("Cooked Potato", "Fluffy and satisfying. A hearty source of energy.", ItemCategory::Consumable)
            .icon("cooked_potato.png")
            .stackable(20)
            .consumable(25.0, 70.0, 15.0) // Increased values to compensate for removed stamina
            .cookable(40.0, "Burnt Potato")
            .respawn_time(260)
            .build(),

        ItemBuilder::new("Burnt Potato", "Charred and bitter. Barely edible, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_potato.png")
            .stackable(20)
            .consumable(-4.0, 10.0, -12.0)
            .crafting_output(13, 0)
            .cookable(40.0, "Charcoal")
            .respawn_time(80)
            .build(),

        ItemBuilder::new("Carrot", "A fresh, white carrot. Crunchy and nutritious when eaten raw or cooked.", ItemCategory::Consumable)
            .icon("carrot.png")
            .stackable(15)
            .consumable(8.0, 12.0, 5.0)
            .cookable(35.0, "Cooked Carrot")
            .respawn_time(180)
            .build(),

        ItemBuilder::new("Cooked Carrot", "Tender and sweet cooked carrots. A healthy and delicious side dish.", ItemCategory::Consumable)
            .icon("cooked_carrot.png")
            .stackable(15)
            .consumable(25.0, 35.0, 15.0)
            .cookable(45.0, "Burnt Carrot")
            .respawn_time(240)
            .build(),

        ItemBuilder::new("Burnt Carrot", "Overcooked carrots that have turned black and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_carrot.png")
            .stackable(15)
            .consumable(-2.0, 8.0, -8.0)
            .crafting_output(12, 0)
            .cookable(50.0, "Charcoal")
            .respawn_time(60)
            .build(),

        ItemBuilder::new("Raw Corn", "Fresh corn kernels. Sweet and crunchy when raw, but better when cooked.", ItemCategory::Consumable)
            .icon("corn.png")
            .stackable(20)
            .consumable(7.0, 18.0, 8.0)
            .cookable(35.0, "Cooked Corn")
            .respawn_time(200)
            .build(),

        ItemBuilder::new("Cooked Corn", "Tender, sweet cooked corn. A delicious and nutritious staple food.", ItemCategory::Consumable)
            .icon("cooked_corn.png")
            .stackable(20)
            .consumable(28.0, 65.0, 20.0) // Good nutrition - comparable to cooked potato
            .cookable(45.0, "Burnt Corn")
            .respawn_time(260)
            .build(),

        ItemBuilder::new("Burnt Corn", "Charred and blackened corn. Bitter and unpleasant, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_corn.png")
            .stackable(20)
            .consumable(-3.0, 12.0, -10.0)
            .crafting_output(14, 0)
            .cookable(50.0, "Charcoal")
            .respawn_time(80)
            .build(),

        // === NEW ARCTIC/SUBARCTIC PLANTS ===
        // These simple survival plants burn directly to charcoal (no cooked stage)
        ItemBuilder::new("Scurvy Grass", "Arctic plant rich in vitamin C. Essential for preventing scurvy. Best eaten raw - cooking destroys the vitamin C.", ItemCategory::Consumable)
            .icon("scurvy_grass.png")
            .stackable(20)
            .consumable(15.0, 8.0, 5.0) // High health (vitamin C), low hunger/thirst
            .cookable(25.0, "Charcoal") // Burns directly - cooking destroys vitamin C anyway
            .respawn_time(150)
            .build(),

        ItemBuilder::new("Crowberry", "Small, dark berries from low-growing subarctic shrubs. Tart flavor with good nutrition.", ItemCategory::Consumable)
            .icon("crowberry.png")
            .stackable(25)
            .consumable(8.0, 12.0, 10.0)
            .cookable(22.0, "Charcoal") // Burns directly - small berries just char
            .respawn_time(180)
            .build(),

        ItemBuilder::new("Sea Plantain", "Maritime plant with year-round edible leaves. Salty flavor from growing near the ocean.", ItemCategory::Consumable)
            .icon("sea_plantain.png")
            .stackable(18)
            .consumable(12.0, 10.0, -5.0) // Negative thirst due to salt content
            .cookable(20.0, "Charcoal") // Burns directly - salty leaves just char
            .respawn_time(140)
            .build(),

        ItemBuilder::new("Glasswort", "Salt-tolerant succulent with crunchy texture. Natural source of salt and minerals.", ItemCategory::Consumable)
            .icon("glasswort.png")
            .stackable(15)
            .consumable(4.0, 8.0, -8.0) // Good hunger, very negative thirst (salty)
            .cookable(30.0, "Charcoal") // Burns directly - succulent just chars
            .respawn_time(160)
            .build(),

        ItemBuilder::new("Beet", "A deep red root vegetable with a sweet, earthy flavor. Nutritious and can be eaten raw or cooked.", ItemCategory::Consumable)
            .icon("beet.png")
            .stackable(12)
            .consumable(12.0, 18.0, 10.0)
            .cookable(40.0, "Cooked Beet")
            .respawn_time(240)
            .build(),

        ItemBuilder::new("Cooked Beet", "Tender and sweet cooked beet. A healthy side dish that provides excellent nutrition.", ItemCategory::Consumable)
            .icon("cooked_beet.png")
            .stackable(12)
            .consumable(38.0, 55.0, 30.0) // Increased to compensate for removed 20 stamina
            .cookable(50.0, "Burnt Beet")
            .respawn_time(300)
            .build(),

        ItemBuilder::new("Burnt Beet", "Overcooked beet that has turned black and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_beet.png")
            .stackable(12)
            .consumable(-2.0, 8.0, -8.0)
            .crafting_output(12, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(100)
            .build(),


        // NOTE: Raw Horseradish Root moved to seeds.rs - it's now Placeable + Consumable (plant roots to grow more)

        ItemBuilder::new("Cooked Horseradish", "Tender and flavorful cooked horseradish. A flavorful addition to meals that provides decent nutrition.", ItemCategory::Consumable)
            .icon("cooked_horseradish.png")
            .stackable(12)
            .consumable(15.0, 25.0, 12.0)
            .cookable(50.0, "Burnt Horseradish")
            .respawn_time(280)
            .build(),

        ItemBuilder::new("Burnt Horseradish", "Overcooked horseradish that has turned black and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_horseradish.png")
            .stackable(12)
            .consumable(-2.0, 5.0, -8.0)
            .crafting_output(12, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(90)
            .build(),

        ItemBuilder::new("Sunflower", "A bright yellow sunflower with edible seeds. Can be eaten raw or cooked for better nutrition.", ItemCategory::Consumable)
            .icon("sunflower.png")
            .stackable(12)
            .consumable(5.0, 8.0, 3.0)
            .cookable(40.0, "Cooked Sunflower")
            .respawn_time(220)
            .build(),

        ItemBuilder::new("Cooked Sunflower", "A tender and flavorful cooked sunflower. A nutritious addition to meals that provides decent nutrition.", ItemCategory::Consumable)
            .icon("cooked_sunflower.png")
            .stackable(12)
            .consumable(15.0, 25.0, 12.0)
            .cookable(50.0, "Burnt Sunflower")
            .respawn_time(280)
            .build(),

        ItemBuilder::new("Burnt Sunflower", "An overcooked sunflower that has turned black and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_sunflower.png")
            .stackable(12)
            .consumable(-2.0, 5.0, -8.0)
            .crafting_output(12, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(90)
            .build(),

        ItemBuilder::new("Salsify Root", "A root vegetable with a mild, oyster-like flavor. Can be eaten raw or cooked for better nutrition.", ItemCategory::Consumable)
            .icon("salsify.png")
            .stackable(12)
            .consumable(5.0, 8.0, 3.0)
            .cookable(40.0, "Cooked Salsify Root")
            .respawn_time(220)
            .build(),

        ItemBuilder::new("Cooked Salsify Root", "Tender and flavorful cooked salsify. A nutritious addition to meals that provides decent nutrition.", ItemCategory::Consumable)
            .icon("cooked_salsify.png")
            .stackable(12)
            .consumable(15.0, 25.0, 12.0)
            .cookable(50.0, "Burnt Salsify Root")
            .respawn_time(280)
            .build(),

        ItemBuilder::new("Burnt Salsify Root", "Overcooked salsify that has turned black and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_salsify.png")
            .stackable(12)
            .consumable(-2.0, 5.0, -8.0)
            .crafting_output(12, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(90)
            .build(),

        // Cabbage - Cold-hardy leafy vegetable
        ItemBuilder::new("Cabbage", "A fresh, crisp cabbage head. Nutritious and filling when eaten raw or cooked.", ItemCategory::Consumable)
            .icon("cabbage.png")
            .stackable(10)
            .consumable(8.0, 15.0, 5.0) // health, hunger, thirst - fresh and nutritious
            .cookable(35.0, "Cooked Cabbage")
            .respawn_time(200)
            .build(),

        ItemBuilder::new("Cooked Cabbage", "Tender cooked cabbage. A nutritious and filling vegetable dish.", ItemCategory::Consumable)
            .icon("cooked_cabbage.png")
            .stackable(10)
            .consumable(22.0, 40.0, 12.0) // health, hunger, thirst - good nutrition when cooked
            .cookable(45.0, "Burnt Cabbage")
            .respawn_time(260)
            .build(),

        ItemBuilder::new("Burnt Cabbage", "Overcooked cabbage that has turned black and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_cabbage.png")
            .stackable(10)
            .consumable(-2.0, 8.0, -8.0) // health, hunger, thirst
            .crafting_output(12, 0)
            .cookable(50.0, "Charcoal")
            .respawn_time(60)
            .build(),

        // Fennel - Cool-season vegetable with edible bulb, fronds, and seeds
        ItemBuilder::new("Fennel", "A crisp fennel bulb with a mild anise flavor. All parts are edible - the bulb, fronds, and seeds.", ItemCategory::Consumable)
            .icon("fennel.png")
            .stackable(12)
            .consumable(10.0, 18.0, 8.0) // health, hunger, thirst - refreshing and nutritious
            .cookable(35.0, "Cooked Fennel")
            .respawn_time(220)
            .build(),

        ItemBuilder::new("Cooked Fennel", "Tender caramelized fennel with a sweet, delicate flavor. Excellent nutrition.", ItemCategory::Consumable)
            .icon("cooked_fennel.png")
            .stackable(12)
            .consumable(28.0, 50.0, 18.0) // health, hunger, thirst - good nutrition when cooked
            .cookable(48.0, "Burnt Fennel")
            .respawn_time(280)
            .build(),

        ItemBuilder::new("Burnt Fennel", "Overcooked fennel that has turned black and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_fennel.png")
            .stackable(12)
            .consumable(-2.0, 8.0, -8.0) // health, hunger, thirst
            .crafting_output(12, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(70)
            .build(),

        ItemBuilder::new("Fennel Fronds", "Feathery fennel leaves with a delicate anise flavor. Excellent as a garnish or tea.", ItemCategory::Consumable)
            .icon("fennel_fronds.png")
            .stackable(25)
            .consumable(8.0, 6.0, 4.0) // health, hunger, thirst - light but flavorful
            .cookable(20.0, "Charcoal") // Burns directly - delicate leaves
            .respawn_time(100)
            .build(),

        // === COOKED STARCHY PLANTS (raw versions in seeds.rs as they're plantable) ===
        
        // Kamchatka Lily Bulb - cooked and burnt versions
        ItemBuilder::new("Cooked Kamchatka Lily Bulb", "A tender, sweet cooked lily bulb. Highly nutritious traditional food.", ItemCategory::Consumable)
            .icon("cooked_kamchatka_lily_bulb.png")
            .stackable(15)
            .consumable(45.0, 70.0, 15.0) // Excellent nutrition when cooked
            .cookable(50.0, "Burnt Kamchatka Lily Bulb")
            .respawn_time(300)
            .build(),

        ItemBuilder::new("Burnt Kamchatka Lily Bulb", "Overcooked lily bulb that has turned black and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_kamchatka_lily_bulb.png")
            .stackable(15)
            .consumable(-3.0, 10.0, -10.0)
            .crafting_output(12, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(80)
            .build(),

        // Silverweed Root - cooked and burnt versions
        ItemBuilder::new("Cooked Silverweed Root", "Tender cooked silverweed root. Sweet and starchy - excellent traditional food.", ItemCategory::Consumable)
            .icon("cooked_silverweed_root.png")
            .stackable(20)
            .consumable(35.0, 55.0, 12.0) // Good nutrition when cooked
            .cookable(45.0, "Burnt Silverweed Root")
            .respawn_time(280)
            .build(),

        ItemBuilder::new("Burnt Silverweed Root", "Overcooked silverweed root that has charred. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_silverweed_root.png")
            .stackable(20)
            .consumable(-2.0, 8.0, -8.0)
            .crafting_output(10, 0)
            .cookable(50.0, "Charcoal")
            .respawn_time(70)
            .build(),

        // Bistort Bulbils - cooked and burnt versions
        ItemBuilder::new("Cooked Bistort Bulbils", "Tender cooked bistort bulbils. Nutty and satisfying - a unique alpine delicacy.", ItemCategory::Consumable)
            .icon("cooked_bistort_bulbils.png")
            .stackable(40)
            .consumable(28.0, 45.0, 10.0) // Good nutrition when cooked
            .cookable(40.0, "Burnt Bistort Bulbils")
            .respawn_time(260)
            .build(),

        ItemBuilder::new("Burnt Bistort Bulbils", "Overcooked bistort bulbils that have charred. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_bistort_bulbils.png")
            .stackable(40)
            .consumable(-2.0, 6.0, -6.0)
            .crafting_output(8, 0)
            .cookable(45.0, "Charcoal")
            .respawn_time(60)
            .build(),

        // === NEW ALEUTIAN PLANTS ===
        
        // Wild Celery (Angelica) - Important traditional Aleut food
        ItemBuilder::new("Wild Celery Stalks", "Fresh stalks of wild celery (Angelica lucida). Crisp and aromatic with a distinctive flavor. A prized traditional Aleut vegetable eaten raw.", ItemCategory::Consumable)
            .icon("wild_celery_stalks.png")
            .stackable(15)
            .consumable(12.0, 20.0, 8.0) // Good nutrition - important traditional food
            .cookable(30.0, "Cooked Wild Celery")
            .respawn_time(200)
            .build(),

        ItemBuilder::new("Cooked Wild Celery", "Tender cooked wild celery with a milder flavor. Nutritious and satisfying.", ItemCategory::Consumable)
            .icon("cooked_wild_celery.png")
            .stackable(15)
            .consumable(25.0, 38.0, 15.0) // Excellent nutrition
            .cookable(40.0, "Burnt Wild Celery")
            .respawn_time(260)
            .build(),

        ItemBuilder::new("Burnt Wild Celery", "Overcooked wild celery that has lost its appeal. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_wild_celery.png")
            .stackable(15)
            .consumable(-2.0, 8.0, -6.0)
            .crafting_output(10, 0)
            .cookable(50.0, "Charcoal")
            .respawn_time(70)
            .build(),

        // Nagoonberries - Prized Arctic raspberry
        ItemBuilder::new("Nagoonberries", "Prized Arctic raspberries with an exquisite sweet-tart flavor. Considered one of the finest wild berries in the north.", ItemCategory::Consumable)
            .icon("nagoonberries.png")
            .stackable(25)
            .consumable(15.0, 18.0, 15.0) // Excellent berry - high value
            .cookable(20.0, "Burnt Nagoonberries")
            .respawn_time(300)
            .build(),

        ItemBuilder::new("Burnt Nagoonberries", "Overcooked nagoonberries. A tragic waste of such prized berries.", ItemCategory::Consumable)
            .icon("burnt_nagoonberries.png")
            .stackable(25)
            .consumable(-3.0, 3.0, -5.0)
            .crafting_output(7, 0)
            .cookable(25.0, "Charcoal")
            .respawn_time(50)
            .build(),

        // Fireweed Shoots - Edible tundra plant shoots
        ItemBuilder::new("Fireweed Shoots", "Tender young fireweed shoots. A common tundra plant that provides a fresh, slightly sweet taste when eaten raw.", ItemCategory::Consumable)
            .icon("fireweed_shoots.png")
            .stackable(15)
            .consumable(6.0, 10.0, 3.0) // health, hunger, thirst - fresh and nutritious
            .cookable(30.0, "Charcoal") // Burns directly to charcoal - simple plant shoots just char
            .respawn_time(180)
            .build(),

        ItemBuilder::new("Chicory", "A bitter leafy green with a distinctive flavor. Can be eaten raw or cooked to reduce bitterness.", ItemCategory::Consumable)
            .icon("chicory.png")
            .stackable(12)
            .consumable(3.0, 6.0, 2.0)
            .cookable(40.0, "Cooked Chicory")
            .respawn_time(200)
            .build(),

        ItemBuilder::new("Cooked Chicory", "Cooked chicory with reduced bitterness. A nutritious green vegetable that provides decent nutrition.", ItemCategory::Consumable)
            .icon("cooked_chicory.png")
            .stackable(12)
            .consumable(12.0, 18.0, 8.0)
            .cookable(50.0, "Burnt Chicory")
            .respawn_time(260)
            .build(),

        ItemBuilder::new("Burnt Chicory", "Overcooked chicory that has turned black and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_chicory.png")
            .stackable(12)
            .consumable(-2.0, 3.0, -5.0)
            .crafting_output(12, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(90)
            .build(),

        ItemBuilder::new("Yarrow", "A flowering herb with feathery leaves and white flower clusters. Known for its medicinal properties and bitter taste.", ItemCategory::Consumable)
            .icon("yarrow.png")
            .stackable(12)
            .consumable(2.0, 4.0, 1.0)
            .cookable(40.0, "Cooked Yarrow")
            .respawn_time(180)
            .build(),

        ItemBuilder::new("Cooked Yarrow", "Cooked yarrow with reduced bitterness. A medicinal herb that provides some nutrition and healing properties.", ItemCategory::Consumable)
            .icon("cooked_yarrow.png")
            .stackable(12)
            .consumable(8.0, 12.0, 6.0)
            .cookable(50.0, "Burnt Yarrow")
            .respawn_time(240)
            .build(),

        ItemBuilder::new("Burnt Yarrow", "Overcooked yarrow that has lost its medicinal properties. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_yarrow.png")
            .stackable(12)
            .consumable(-1.0, 2.0, -3.0)
            .crafting_output(12, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(90)
            .build(),

        ItemBuilder::new("Chamomile", "A delicate herb with small white flowers and a sweet, apple-like fragrance. Known for its calming properties.", ItemCategory::Consumable)
            .icon("chamomile.png")
            .stackable(12)
            .consumable(1.0, 3.0, 2.0)
            .cookable(40.0, "Cooked Chamomile")
            .respawn_time(200)
            .build(),

        ItemBuilder::new("Cooked Chamomile", "Cooked chamomile that releases its calming properties. A soothing herb that provides gentle nutrition.", ItemCategory::Consumable)
            .icon("cooked_chamomile.png")
            .stackable(12)
            .consumable(6.0, 10.0, 8.0)
            .cookable(50.0, "Burnt Chamomile")
            .respawn_time(260)
            .build(),

        ItemBuilder::new("Burnt Chamomile", "Overcooked chamomile that has lost its beneficial properties. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_chamomile.png")
            .stackable(12)
            .consumable(-1.0, 2.0, -2.0)
            .crafting_output(12, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(90)
            .build(),

        ItemBuilder::new("Mint Leaves", "A refreshing herb with bright green leaves and a cool, menthol-like flavor. Known for its digestive properties.", ItemCategory::Consumable)
            .icon("mint.png")
            .stackable(12)
            .consumable(1.0, 3.0, 2.0)
            .cookable(40.0, "Cooked Mint Leaves")
            .respawn_time(200)
            .build(),

        ItemBuilder::new("Cooked Mint Leaves", "Cooked mint that enhances its refreshing properties. A soothing herb that provides gentle nutrition and cooling effects.", ItemCategory::Consumable)
            .icon("cooked_mint.png")
            .stackable(12)
            .consumable(6.0, 10.0, 8.0)
            .cookable(50.0, "Burnt Mint Leaves")
            .respawn_time(260)
            .build(),

        ItemBuilder::new("Burnt Mint Leaves", "Overcooked mint that has lost its refreshing properties. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_mint.png")
            .stackable(12)
            .consumable(-1.0, 2.0, -2.0)
            .crafting_output(12, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(90)
            .build(),

        // === MEDICINAL HERBS ===
        ItemBuilder::new("Valerian Root", "A calming herb known for its sedative properties. Helps restore stamina and provides a mild health boost.", ItemCategory::Consumable)
            .icon("valerian.png")
            .stackable(15)
            .consumable(8.0, 5.0, 3.0)
            .cookable(40.0, "Burnt Valerian Root")
            .respawn_time(240)
            .build(),

        ItemBuilder::new("Burnt Valerian Root", "Overheated valerian root. Has lost most of its calming properties but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_valerian.png")
            .stackable(15)
            .consumable(-2.0, 1.0, -3.0)
            .crafting_output(8, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(60)
            .build(),

        ItemBuilder::new("Mugwort", "A bitter aromatic herb with digestive properties. Provides moderate hunger satisfaction and mild health benefits.", ItemCategory::Consumable)
            .icon("mugwort.png")
            .stackable(12)
            .consumable(6.0, 12.0, 2.0)
            .cookable(35.0, "Cooked Mugwort")
            .respawn_time(200)
            .build(),

        ItemBuilder::new("Cooked Mugwort", "Sautéed mugwort with mellowed bitterness. The cooking process enhances its digestive properties.", ItemCategory::Consumable)
            .icon("cooked_mugwort.png")
            .stackable(12)
            .consumable(20.0, 28.0, 8.0) // Increased to compensate for removed 15 stamina
            .cookable(25.0, "Burnt Mugwort")
            .build(),

        ItemBuilder::new("Burnt Mugwort", "Charred mugwort leaves. Bitter and unpalatable, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_mugwort.png")
            .stackable(12)
            .consumable(-3.0, 2.0, -4.0)
            .crafting_output(6, 0)
            .cookable(50.0, "Charcoal")
            .respawn_time(40)
            .build(),

        ItemBuilder::new("Bear Garlic", "Wild garlic with a strong, pungent flavor. Provides good nutrition and natural antimicrobial properties.", ItemCategory::Consumable)
            .icon("bear_garlic.png")
            .stackable(16)
            .consumable(7.0, 10.0, 3.0)
            .cookable(38.0, "Roasted Bear Garlic")
            .respawn_time(280)
            .build(),

        ItemBuilder::new("Roasted Bear Garlic", "Caramelized wild garlic with a sweet, mellow flavor. Roasting reduces the pungency and enhances the nutrition.", ItemCategory::Consumable)
            .icon("roasted_bear_garlic.png")
            .stackable(16)
            .consumable(25.0, 28.0, 12.0) // Increased to compensate for removed 20 stamina
            .cookable(28.0, "Burnt Bear Garlic")
            .build(),

        ItemBuilder::new("Burnt Bear Garlic", "Blackened wild garlic. The pungent aroma is replaced by the smell of char. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_bear_garlic.png")
            .stackable(16)
            .consumable(-3.0, 2.0, -5.0)
            .crafting_output(9, 0)
            .cookable(52.0, "Charcoal")
            .respawn_time(50)
            .build(),

        ItemBuilder::new("Siberian Ginseng", "Adaptogenic root known for boosting energy and resilience. Provides excellent stamina restoration.", ItemCategory::Consumable)
            .icon("siberian_ginseng.png")
            .stackable(8)
            .consumable(25.0, 15.0, 10.0) // Increased to compensate for removed 25 stamina (medicinal bias)
            .cookable(45.0, "Burnt Siberian Ginseng")
            .respawn_time(360)
            .build(),

        ItemBuilder::new("Burnt Siberian Ginseng", "Charred ginseng root. All adaptogenic properties destroyed by excessive heat. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_siberian_ginseng.png")
            .stackable(8)
            .consumable(-5.0, 1.0, -8.0)
            .crafting_output(12, 0)
            .cookable(60.0, "Charcoal")
            .respawn_time(80)
            .build(),

        ItemBuilder::new("Nettle Leaves", "Raw stinging nettle leaves. Highly nutritious but painful to eat raw due to formic acid in the stinging hairs.", ItemCategory::Consumable)
            .icon("nettle_leaves.png")
            .stackable(25)
            .consumable(-8.0, 12.0, -15.0) // Damage and dehydration from stinging
            .cookable(25.0, "Cooked Nettle Leaves")
            .respawn_time(180)
            .build(),

        ItemBuilder::new("Cooked Nettle Leaves", "Properly cooked nettle leaves. Cooking destroys the stinging hairs, revealing excellent nutrition and iron content.", ItemCategory::Consumable)
            .icon("cooked_nettle_leaves.png")
            .stackable(25)
            .consumable(25.0, 32.0, 12.0) // Increased to compensate for removed 18 stamina
            .cookable(20.0, "Burnt Nettle Leaves")
            .build(),

        ItemBuilder::new("Burnt Nettle Leaves", "Overcooked nettle leaves. Blackened and bitter, all the valuable nutrients destroyed by excess heat.", ItemCategory::Consumable)
            .icon("burnt_nettle_leaves.png")
            .stackable(25)
            .consumable(-3.0, 3.0, -5.0)
            .crafting_output(6, 0)
            .cookable(35.0, "Charcoal")
            .respawn_time(40)
            .build(),

        // === TEA HERBS (Raw → Burnt for future tea system) ===

        ItemBuilder::new("Chamomile", "Delicate chamomile flowers and leaves. Traditional calming tea herb.", ItemCategory::Consumable)
            .icon("chamomile.png")
            .stackable(30)
            .consumable(2.0, 4.0, 3.0)
            .cookable(20.0, "Burnt Chamomile")
            .respawn_time(140)
            .build(),

        ItemBuilder::new("Burnt Chamomile", "Overcooked chamomile. Calming properties destroyed by excess heat.", ItemCategory::Consumable)
            .icon("burnt_chamomile.png")
            .stackable(30)
            .consumable(-1.0, 2.0, -2.0)
            .crafting_output(3, 0)
            .cookable(25.0, "Charcoal")
            .respawn_time(30)
            .build(),

        ItemBuilder::new("Valerian Leaves", "Leaves from valerian plants. Traditional tea herb with mild sedative properties.", ItemCategory::Consumable)
            .icon("valerian_leaves.png")
            .stackable(25)
            .consumable(3.0, 6.0, 2.0)
            .cookable(25.0, "Burnt Valerian Leaves")
            .respawn_time(180)
            .build(),

        ItemBuilder::new("Burnt Valerian Leaves", "Charred valerian leaves. Sedative properties destroyed, leaving only bitter char.", ItemCategory::Consumable)
            .icon("burnt_valerian_leaves.png")
            .stackable(25)
            .consumable(-2.0, 2.0, -3.0)
            .crafting_output(5, 0)
            .cookable(30.0, "Charcoal")
            .respawn_time(35)
            .build(),

        ItemBuilder::new("Ginseng Leaves", "Leaves from rare Siberian ginseng plants. Traditional tea herb with mild adaptogenic properties.", ItemCategory::Consumable)
            .icon("ginseng_leaves.png")
            .stackable(15)
            .consumable(5.0, 6.0, 3.0)
            .cookable(30.0, "Burnt Ginseng Leaves")
            .respawn_time(240)
            .build(),

        ItemBuilder::new("Burnt Ginseng Leaves", "Charred ginseng leaves. Valuable adaptogenic compounds destroyed by overcooking.", ItemCategory::Consumable)
            .icon("burnt_ginseng_leaves.png")
            .stackable(15)
            .consumable(-3.0, 2.0, -4.0)
            .crafting_output(6, 0)
            .cookable(35.0, "Charcoal")
            .respawn_time(40)
            .build(),

        // === HUMAN FLESH ===
        ItemBuilder::new("Raw Human Flesh", "A chunk of human flesh. Edible but not very appetizing raw. Better when cooked.", ItemCategory::Consumable)
            .icon("human_meat.png")
            .stackable(10)
            .consumable(3.0, 15.0, -10.0)
            .cookable(45.0, "Cooked Human Flesh")
            .respawn_time(180)
            .build(),

        ItemBuilder::new("Cooked Human Flesh", "Cooked human flesh. Still morally questionable, but at least it won't make you sick.", ItemCategory::Consumable)
            .icon("cooked_human_meat.png")
            .stackable(10)
            .consumable(10.0, 40.0, -5.0)
            .cookable(30.0, "Burnt Human Flesh")
            .respawn_time(240)
            .build(),

        ItemBuilder::new("Burnt Human Flesh", "Overcooked human flesh. Charred and inedible, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_human_meat.png")
            .stackable(10)
            .consumable(-5.0, 5.0, -15.0)
            .crafting_output(14, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(30)
            .build(),

        // === FISH ===
        ItemBuilder::new("Raw Twigfish", "A small, bony fish that can be cooked for food. Not very filling on its own.", ItemCategory::Consumable)
            .icon("raw_twigfish.png")
            .stackable(10)
            .consumable(5.0, 5.0, 0.0)
            .cookable(45.0, "Cooked Twigfish")
            .respawn_time(180)
            .build(),

        ItemBuilder::new("Cooked Twigfish", "A cooked twigfish. Provides better nutrition than the raw version.", ItemCategory::Consumable)
            .icon("cooked_twigfish.png")
            .stackable(10)
            .consumable(15.0, 20.0, 5.0)
            .cookable(30.0, "Burnt Twigfish")
            .build(),

        ItemBuilder::new("Burnt Twigfish", "A badly overcooked twigfish. Not very appetizing, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_twigfish.png")
            .stackable(10)
            .consumable(2.0, 5.0, 0.0)
            .crafting_output(8, 0)
            .cookable(35.0, "Charcoal")
            .build(),

        // --- TIER 1: SMALL FISH (Common) ---
        
        ItemBuilder::new("Raw Herring", "A small, silvery schooling fish common in cold northern waters. Oily flesh makes it best when cooked.", ItemCategory::Consumable)
            .icon("raw_herring.png")
            .stackable(15)
            .consumable(6.0, 8.0, -2.0)
            .cookable(35.0, "Cooked Herring")
            .respawn_time(160)
            .build(),

        ItemBuilder::new("Cooked Herring", "Properly cooked herring with crispy skin. The oily flesh provides good energy.", ItemCategory::Consumable)
            .icon("cooked_herring.png")
            .stackable(15)
            .consumable(18.0, 25.0, 6.0)
            .cookable(25.0, "Burnt Herring")
            .build(),

        ItemBuilder::new("Burnt Herring", "Overcooked herring. The oils have turned rancid and bitter.", ItemCategory::Consumable)
            .icon("burnt_herring.png")
            .stackable(15)
            .consumable(3.0, 6.0, -3.0)
            .crafting_output(6, 0)
            .cookable(30.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw Smelt", "A small, oily fish also known as 'candlefish' because it's so fatty it can be lit like a candle. Best caught at night.", ItemCategory::Consumable)
            .icon("raw_smelt.png")
            .stackable(15)
            .consumable(5.0, 10.0, -3.0)
            .cookable(30.0, "Cooked Smelt")
            .respawn_time(150)
            .build(),

        ItemBuilder::new("Cooked Smelt", "Perfectly fried smelt. The high oil content makes it very satisfying and energy-rich.", ItemCategory::Consumable)
            .icon("cooked_smelt.png")
            .stackable(15)
            .consumable(16.0, 28.0, 4.0)
            .cookable(22.0, "Burnt Smelt")
            .build(),

        ItemBuilder::new("Burnt Smelt", "Overcooked smelt. The excessive oil has caused it to char badly.", ItemCategory::Consumable)
            .icon("burnt_smelt.png")
            .stackable(15)
            .consumable(2.0, 8.0, -4.0)
            .crafting_output(5, 0)
            .cookable(28.0, "Charcoal")
            .build(),

        // --- TIER 2: MEDIUM FISH (Uncommon) ---

        ItemBuilder::new("Raw Greenling", "A medium-sized fish with mottled green-brown coloring. Common in rocky coastal waters during daylight hours.", ItemCategory::Consumable)
            .icon("raw_greenling.png")
            .stackable(10)
            .consumable(8.0, 12.0, -2.0)
            .cookable(40.0, "Cooked Greenling")
            .respawn_time(200)
            .build(),

        ItemBuilder::new("Cooked Greenling", "Well-prepared greenling with firm, white flesh. A reliable and nutritious catch.", ItemCategory::Consumable)
            .icon("cooked_greenling.png")
            .stackable(10)
            .consumable(25.0, 38.0, 10.0)
            .cookable(28.0, "Burnt Greenling")
            .build(),

        ItemBuilder::new("Burnt Greenling", "Overcooked greenling. Dry and tough, but still edible in a pinch.", ItemCategory::Consumable)
            .icon("burnt_greenling.png")
            .stackable(10)
            .consumable(4.0, 10.0, -6.0)
            .crafting_output(9, 0)
            .cookable(35.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw Sculpin", "An ugly, spiny bottom-dweller found in deeper waters at night. Careful preparation required to avoid the venomous spines.", ItemCategory::Consumable)
            .icon("raw_sculpin.png")
            .stackable(10)
            .consumable(6.0, 10.0, -4.0)
            .cookable(45.0, "Cooked Sculpin")
            .respawn_time(220)
            .build(),

        ItemBuilder::new("Cooked Sculpin", "Properly prepared sculpin. Despite its ugly appearance, the meat is surprisingly sweet and delicate.", ItemCategory::Consumable)
            .icon("cooked_sculpin.png")
            .stackable(10)
            .consumable(22.0, 35.0, 8.0)
            .cookable(30.0, "Burnt Sculpin")
            .build(),

        ItemBuilder::new("Burnt Sculpin", "Overcooked sculpin. The delicate flavor has been destroyed by excessive heat.", ItemCategory::Consumable)
            .icon("burnt_sculpin.png")
            .stackable(10)
            .consumable(3.0, 8.0, -8.0)
            .crafting_output(8, 0)
            .cookable(38.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw Pacific Cod", "A large, flaky white fish and staple of northern fishing communities. Excellent nutrition when properly cooked.", ItemCategory::Consumable)
            .icon("raw_pacific_cod.png")
            .stackable(8)
            .consumable(10.0, 15.0, -2.0)
            .cookable(50.0, "Cooked Pacific Cod")
            .respawn_time(240)
            .build(),

        ItemBuilder::new("Cooked Pacific Cod", "Perfectly cooked cod with tender, flaky white flesh. A hearty and satisfying meal.", ItemCategory::Consumable)
            .icon("cooked_pacific_cod.png")
            .stackable(8)
            .consumable(30.0, 45.0, 12.0)
            .cookable(32.0, "Burnt Pacific Cod")
            .build(),

        ItemBuilder::new("Burnt Pacific Cod", "Overcooked cod. Dried out and tough, losing most of its appeal.", ItemCategory::Consumable)
            .icon("burnt_pacific_cod.png")
            .stackable(8)
            .consumable(5.0, 12.0, -5.0)
            .crafting_output(12, 0)
            .cookable(40.0, "Charcoal")
            .build(),

        // --- TIER 3: LARGE FISH (Rare) ---

        ItemBuilder::new("Raw Dolly Varden", "A beautiful Arctic char with pink-spotted sides. Most active during twilight hours in cold streams and coastal waters.", ItemCategory::Consumable)
            .icon("raw_dolly_varden.png")
            .stackable(8)
            .consumable(12.0, 18.0, -1.0)
            .cookable(45.0, "Cooked Dolly Varden")
            .respawn_time(280)
            .build(),

        ItemBuilder::new("Cooked Dolly Varden", "Exquisitely prepared char with delicate pink flesh. A prized catch among northern anglers.", ItemCategory::Consumable)
            .icon("cooked_dolly_varden.png")
            .stackable(8)
            .consumable(35.0, 50.0, 15.0)
            .cookable(30.0, "Burnt Dolly Varden")
            .build(),

        ItemBuilder::new("Burnt Dolly Varden", "Overcooked char. What a waste of such a beautiful fish.", ItemCategory::Consumable)
            .icon("burnt_dolly_varden.png")
            .stackable(8)
            .consumable(6.0, 14.0, -4.0)
            .crafting_output(11, 0)
            .cookable(38.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw Rockfish", "A large, deep-water fish with striking red and orange coloring. Best caught at night when they rise from the depths.", ItemCategory::Consumable)
            .icon("raw_rockfish.png")
            .stackable(6)
            .consumable(14.0, 20.0, -3.0)
            .cookable(50.0, "Cooked Rockfish")
            .respawn_time(300)
            .build(),

        ItemBuilder::new("Cooked Rockfish", "Beautifully prepared rockfish with firm, succulent flesh. A premium catch from the deep.", ItemCategory::Consumable)
            .icon("cooked_rockfish.png")
            .stackable(6)
            .consumable(38.0, 55.0, 14.0)
            .cookable(32.0, "Burnt Rockfish")
            .build(),

        ItemBuilder::new("Burnt Rockfish", "Overcooked rockfish. The firm flesh has become rubbery and unappetizing.", ItemCategory::Consumable)
            .icon("burnt_rockfish.png")
            .stackable(6)
            .consumable(6.0, 15.0, -6.0)
            .crafting_output(14, 0)
            .cookable(42.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw Steelhead", "A magnificent sea-run rainbow trout, prized for its fighting spirit. Most active at dawn and dusk.", ItemCategory::Consumable)
            .icon("raw_steelhead.png")
            .stackable(6)
            .consumable(15.0, 22.0, 0.0)
            .cookable(48.0, "Cooked Steelhead")
            .respawn_time(320)
            .build(),

        ItemBuilder::new("Cooked Steelhead", "Perfectly grilled steelhead with rich, pink flesh. One of the finest fish in northern waters.", ItemCategory::Consumable)
            .icon("cooked_steelhead.png")
            .stackable(6)
            .consumable(42.0, 60.0, 18.0)
            .cookable(30.0, "Burnt Steelhead")
            .build(),

        ItemBuilder::new("Burnt Steelhead", "Overcooked steelhead. A tragic waste of such a magnificent fish.", ItemCategory::Consumable)
            .icon("burnt_steelhead.png")
            .stackable(6)
            .consumable(7.0, 16.0, -5.0)
            .crafting_output(13, 0)
            .cookable(40.0, "Charcoal")
            .build(),

        // --- TIER 4: PREMIUM FISH (Very Rare) ---

        ItemBuilder::new("Raw Pink Salmon", "A robust Pacific salmon with distinctive humped back. Returns to coastal waters to spawn, most active at dawn and dusk.", ItemCategory::Consumable)
            .icon("raw_pink_salmon.png")
            .stackable(5)
            .consumable(16.0, 25.0, 2.0)
            .cookable(52.0, "Cooked Pink Salmon")
            .respawn_time(360)
            .build(),

        ItemBuilder::new("Cooked Pink Salmon", "Deliciously prepared pink salmon. The light pink flesh is tender and flavorful.", ItemCategory::Consumable)
            .icon("cooked_pink_salmon.png")
            .stackable(5)
            .consumable(45.0, 65.0, 20.0)
            .cookable(32.0, "Burnt Pink Salmon")
            .build(),

        ItemBuilder::new("Burnt Pink Salmon", "Overcooked salmon. Dry and lacking the delicate flavor it once had.", ItemCategory::Consumable)
            .icon("burnt_pink_salmon.png")
            .stackable(5)
            .consumable(8.0, 18.0, -4.0)
            .crafting_output(15, 0)
            .cookable(42.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw Sockeye Salmon", "A prized Pacific salmon with brilliant red flesh, rich in oils and nutrients. Caught during twilight hours.", ItemCategory::Consumable)
            .icon("raw_sockeye_salmon.png")
            .stackable(5)
            .consumable(18.0, 28.0, 3.0)
            .cookable(55.0, "Cooked Sockeye Salmon")
            .respawn_time(400)
            .build(),

        ItemBuilder::new("Cooked Sockeye Salmon", "Expertly prepared sockeye with deep red, flavorful flesh. A true delicacy of the north.", ItemCategory::Consumable)
            .icon("cooked_sockeye_salmon.png")
            .stackable(5)
            .consumable(50.0, 72.0, 22.0)
            .cookable(35.0, "Burnt Sockeye Salmon")
            .build(),

        ItemBuilder::new("Burnt Sockeye Salmon", "Overcooked sockeye. The beautiful red color has turned grey and the flesh is dry.", ItemCategory::Consumable)
            .icon("burnt_sockeye_salmon.png")
            .stackable(5)
            .consumable(9.0, 20.0, -3.0)
            .crafting_output(16, 0)
            .cookable(45.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw King Salmon", "The legendary Chinook salmon, largest of all Pacific salmon. An extremely rare and prized catch, best found at dawn.", ItemCategory::Consumable)
            .icon("raw_king_salmon.png")
            .stackable(3)
            .consumable(22.0, 35.0, 5.0)
            .cookable(60.0, "Cooked King Salmon")
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Cooked King Salmon", "Magnificently prepared king salmon. The rich, buttery flesh practically melts in your mouth. The finest fish in these waters.", ItemCategory::Consumable)
            .icon("cooked_king_salmon.png")
            .stackable(3)
            .consumable(60.0, 85.0, 28.0)
            .cookable(38.0, "Burnt King Salmon")
            .build(),

        ItemBuilder::new("Burnt King Salmon", "Overcooked king salmon. Even burnt, remnants of its exceptional quality remain.", ItemCategory::Consumable)
            .icon("burnt_king_salmon.png")
            .stackable(3)
            .consumable(12.0, 25.0, -2.0)
            .crafting_output(18, 0)
            .cookable(48.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw Halibut", "A massive flatfish from the deep ocean floor. Can grow to enormous sizes. Requires deep water fishing.", ItemCategory::Consumable)
            .icon("raw_halibut.png")
            .stackable(3)
            .consumable(20.0, 32.0, 2.0)
            .cookable(58.0, "Cooked Halibut")
            .respawn_time(450)
            .build(),

        ItemBuilder::new("Cooked Halibut", "Perfectly prepared halibut with dense, meaty white flesh. A substantial and satisfying meal.", ItemCategory::Consumable)
            .icon("cooked_halibut.png")
            .stackable(3)
            .consumable(55.0, 80.0, 25.0)
            .cookable(36.0, "Burnt Halibut")
            .build(),

        ItemBuilder::new("Burnt Halibut", "Overcooked halibut. The thick flesh has dried out completely.", ItemCategory::Consumable)
            .icon("burnt_halibut.png")
            .stackable(3)
            .consumable(10.0, 22.0, -4.0)
            .crafting_output(17, 0)
            .cookable(46.0, "Charcoal")
            .build(),

        // === SHELLFISH & INVERTEBRATES ===

        ItemBuilder::new("Raw Black Katy Chiton", "A leathery marine mollusk found clinging to rocky intertidal zones. The tough foot meat requires careful preparation.", ItemCategory::Consumable)
            .icon("raw_black_katy_chiton.png")
            .stackable(15)
            .consumable(4.0, 6.0, -1.0)
            .cookable(40.0, "Cooked Black Katy Chiton")
            .respawn_time(140)
            .build(),

        ItemBuilder::new("Cooked Black Katy Chiton", "Properly prepared chiton. The tough meat becomes tender and flavorful when cooked correctly.", ItemCategory::Consumable)
            .icon("cooked_black_katy_chiton.png")
            .stackable(15)
            .consumable(14.0, 22.0, 4.0)
            .cookable(28.0, "Burnt Black Katy Chiton")
            .build(),

        ItemBuilder::new("Burnt Black Katy Chiton", "Overcooked chiton. The tough meat has become rubbery and unappetizing.", ItemCategory::Consumable)
            .icon("burnt_black_katy_chiton.png")
            .stackable(15)
            .consumable(2.0, 5.0, -2.0)
            .crafting_output(4, 0)
            .cookable(32.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw Sea Urchin", "A spiny echinoderm found in rocky coastal areas. The orange roe inside is considered a delicacy, but requires careful handling.", ItemCategory::Consumable)
            .icon("raw_sea_urchin.png")
            .stackable(15)
            .consumable(5.0, 8.0, -2.0)
            .cookable(35.0, "Cooked Sea Urchin")
            .respawn_time(150)
            .build(),

        ItemBuilder::new("Cooked Sea Urchin", "Carefully prepared sea urchin. The rich, briny roe is creamy and delicious when properly cooked.", ItemCategory::Consumable)
            .icon("cooked_sea_urchin.png")
            .stackable(15)
            .consumable(16.0, 26.0, 5.0)
            .cookable(25.0, "Burnt Sea Urchin")
            .build(),

        ItemBuilder::new("Burnt Sea Urchin", "Overcooked sea urchin. The delicate roe has been destroyed by excessive heat.", ItemCategory::Consumable)
            .icon("burnt_sea_urchin.png")
            .stackable(15)
            .consumable(2.0, 6.0, -3.0)
            .crafting_output(5, 0)
            .cookable(30.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw Blue Mussel", "A common bivalve mollusk found attached to rocks and pilings. Filter-feeding mussels are abundant in coastal waters.", ItemCategory::Consumable)
            .icon("raw_blue_mussel.png")
            .stackable(20)
            .consumable(3.0, 5.0, 0.0)
            .cookable(30.0, "Cooked Blue Mussel")
            .respawn_time(120)
            .build(),

        ItemBuilder::new("Cooked Blue Mussel", "Steamed mussel with tender, sweet meat. A simple but satisfying coastal delicacy.", ItemCategory::Consumable)
            .icon("cooked_blue_mussel.png")
            .stackable(20)
            .consumable(12.0, 18.0, 3.0)
            .cookable(22.0, "Burnt Blue Mussel")
            .build(),

        ItemBuilder::new("Burnt Blue Mussel", "Overcooked mussel. The tender meat has shriveled and become tough.", ItemCategory::Consumable)
            .icon("burnt_blue_mussel.png")
            .stackable(20)
            .consumable(1.0, 3.0, -1.0)
            .crafting_output(3, 0)
            .cookable(28.0, "Charcoal")
            .build(),

        // === ANIMAL MEAT ===
        ItemBuilder::new("Raw Fox Meat", "Lean meat from a fox. Light and gamey, provides some nutrition even when raw.", ItemCategory::Consumable)
            .icon("fox_meat.png")
            .stackable(15)
            .consumable(8.0, 12.0, -3.0)
            .cookable(35.0, "Cooked Fox Meat")
            .build(),

        ItemBuilder::new("Cooked Fox Meat", "Properly cooked fox meat. Lean and flavorful with good nutritional value.", ItemCategory::Consumable)
            .icon("cooked_fox_meat.png")
            .stackable(15)
            .consumable(30.0, 40.0, 12.0) // Increased to compensate for removed 15 stamina
            .cookable(25.0, "Burnt Fox Meat")
            .build(),

        ItemBuilder::new("Burnt Fox Meat", "Overcooked fox meat. Tough and charred, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_fox_meat.png")
            .stackable(15)
            .consumable(-4.0, 8.0, -12.0)
            .crafting_output(10, 0)
            .cookable(35.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw Wolf Meat", "Dense, dark meat from a wolf. Tough and gamy, but provides substantial nutrition even when raw.", ItemCategory::Consumable)
            .icon("wolf_meat.png")
            .stackable(12)
            .consumable(10.0, 18.0, -5.0)
            .cookable(45.0, "Cooked Wolf Meat")
            .build(),

        ItemBuilder::new("Cooked Wolf Meat", "Well-cooked wolf meat. Dense and protein-rich, providing substantial nutrition.", ItemCategory::Consumable)
            .icon("cooked_wolf_meat.png")
            .stackable(12)
            .consumable(38.0, 55.0, 10.0) // Increased to compensate for removed 22 stamina
            .cookable(30.0, "Burnt Wolf Meat")
            .build(),

        ItemBuilder::new("Burnt Wolf Meat", "Charred wolf meat. Ruined by overcooking, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_wolf_meat.png")
            .stackable(12)
            .consumable(-6.0, 12.0, -18.0)
            .crafting_output(16, 0)
            .cookable(45.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw Viper Meat", "Stringy snake meat. Lean and nutritious, though it's much better when cooked.", ItemCategory::Consumable)
            .icon("viper_meat.png")
            .stackable(20)
            .consumable(6.0, 8.0, -8.0)
            .cookable(25.0, "Cooked Viper Meat")
            .build(),

        ItemBuilder::new("Cooked Viper Meat", "Tender snake meat, properly cooked to neutralize toxins. Surprisingly delicious and nutritious.", ItemCategory::Consumable)
            .icon("cooked_viper_meat.png")
            .stackable(20)
            .consumable(35.0, 30.0, 16.0) // Increased to compensate for removed 18 stamina
            .cookable(20.0, "Burnt Viper Meat")
            .build(),

        ItemBuilder::new("Burnt Viper Meat", "Overcooked snake meat. Tough and unappetizing, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_viper_meat.png")
            .stackable(20)
            .consumable(-3.0, 5.0, -10.0)
            .crafting_output(8, 0)
            .cookable(30.0, "Charcoal")
            .build(),

        // === CRAB MEAT ===
        ItemBuilder::new("Raw Crab Meat", "Fresh, sweet meat from a beach crab. Best enjoyed cooked but edible raw in a pinch.", ItemCategory::Consumable)
            .icon("crab_meat.png")
            .stackable(20)
            .consumable(5.0, 10.0, -4.0)
            .cookable(30.0, "Cooked Crab Meat")
            .build(),

        ItemBuilder::new("Cooked Crab Meat", "Tender, flaky crab meat with a delicate sweet flavor. A coastal delicacy that provides excellent nutrition.", ItemCategory::Consumable)
            .icon("cooked_crab_meat.png")
            .stackable(20)
            .consumable(25.0, 35.0, 15.0)
            .cookable(25.0, "Burnt Crab Meat")
            .build(),

        ItemBuilder::new("Burnt Crab Meat", "Overcooked crab meat. Rubbery and unappetizing, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_crab_meat.png")
            .stackable(20)
            .consumable(-3.0, 8.0, -8.0)
            .crafting_output(8, 0)
            .cookable(30.0, "Charcoal")
            .build(),

        // === BIRD MEAT ===
        ItemBuilder::new("Raw Tern Meat", "Lean meat from a coastal tern. Slightly fishy flavor from its diet, but nutritious when cooked.", ItemCategory::Consumable)
            .icon("raw_tern_meat.png")
            .stackable(20)
            .consumable(4.0, 8.0, -3.0)
            .cookable(25.0, "Cooked Tern Meat")
            .build(),

        ItemBuilder::new("Cooked Tern Meat", "Well-cooked tern meat. Light and lean with a mild coastal flavor.", ItemCategory::Consumable)
            .icon("cooked_tern_meat.png")
            .stackable(20)
            .consumable(20.0, 28.0, 10.0)
            .cookable(25.0, "Burnt Tern Meat")
            .build(),

        ItemBuilder::new("Burnt Tern Meat", "Overcooked tern meat. Dry and tasteless, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_tern_meat.png")
            .stackable(20)
            .consumable(-2.0, 6.0, -6.0)
            .crafting_output(6, 0)
            .cookable(25.0, "Charcoal")
            .build(),

        ItemBuilder::new("Raw Crow Meat", "Dark, gamey meat from a crow. Has a strong, earthy flavor that cooking helps mellow.", ItemCategory::Consumable)
            .icon("raw_crow_meat.png")
            .stackable(20)
            .consumable(3.0, 7.0, -4.0)
            .cookable(25.0, "Cooked Crow Meat")
            .build(),

        ItemBuilder::new("Cooked Crow Meat", "Well-cooked crow meat. Dark and rich with a distinctive gamey taste.", ItemCategory::Consumable)
            .icon("cooked_crow_meat.png")
            .stackable(20)
            .consumable(18.0, 25.0, 8.0)
            .cookable(25.0, "Burnt Crow Meat")
            .build(),

        ItemBuilder::new("Burnt Crow Meat", "Charred crow meat. Nearly inedible but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_crow_meat.png")
            .stackable(20)
            .consumable(-3.0, 5.0, -7.0)
            .crafting_output(5, 0)
            .cookable(25.0, "Charcoal")
            .build(),

        // === VOLE MEAT ===
        ItemBuilder::new("Raw Vole Meat", "Tiny morsel of lean rodent meat. Not much to eat, but easy to catch and cook.", ItemCategory::Consumable)
            .icon("vole_meat.png")
            .stackable(30)
            .consumable(2.0, 4.0, -2.0) // Very small nutritional value
            .cookable(15.0, "Cooked Vole Meat") // Quick to cook
            .build(),

        ItemBuilder::new("Cooked Vole Meat", "A bite-sized morsel of cooked vole. Light and lean, best consumed in multiples.", ItemCategory::Consumable)
            .icon("cooked_vole_meat.png")
            .stackable(30)
            .consumable(8.0, 12.0, 4.0) // Small but decent for its size
            .cookable(15.0, "Burnt Vole Meat")
            .build(),

        ItemBuilder::new("Burnt Vole Meat", "Charred vole scraps. Barely recognizable and not worth eating.", ItemCategory::Consumable)
            .icon("burnt_vole_meat.png")
            .stackable(30)
            .consumable(-1.0, 2.0, -4.0)
            .crafting_output(3, 0)
            .cookable(20.0, "Charcoal")
            .build(),

        // === WOLVERINE MEAT ===
        ItemBuilder::new("Raw Wolverine Meat", "Dense, dark meat from a wolverine. Tough and extremely gamey, this predator's flesh requires thorough cooking.", ItemCategory::Consumable)
            .icon("wolverine_meat.png")
            .stackable(10)
            .consumable(12.0, 20.0, -8.0) // Good raw nutrition but very tough
            .cookable(50.0, "Cooked Wolverine Meat") // Takes longer to cook properly
            .build(),

        ItemBuilder::new("Cooked Wolverine Meat", "Well-cooked wolverine meat. Dense and protein-rich with an intense, wild flavor. A hunter's reward.", ItemCategory::Consumable)
            .icon("cooked_wolverine_meat.png")
            .stackable(10)
            .consumable(45.0, 65.0, 15.0) // Excellent nutrition - better than wolf due to difficulty
            .cookable(35.0, "Burnt Wolverine Meat")
            .build(),

        ItemBuilder::new("Burnt Wolverine Meat", "Overcooked wolverine meat. The tough flesh has become even more leathery and unpleasant.", ItemCategory::Consumable)
            .icon("burnt_wolverine_meat.png")
            .stackable(10)
            .consumable(-8.0, 15.0, -20.0) // Harsh penalty for burning such valuable meat
            .crafting_output(18, 0)
            .cookable(50.0, "Charcoal")
            .build(),

        // === CARIBOU MEAT ===
        ItemBuilder::new("Raw Caribou Meat", "Fresh, lean venison from a caribou. A prized meat of the northern hunters, tender and nutritious when properly cooked.", ItemCategory::Consumable)
            .icon("caribou_meat.png")
            .stackable(10)
            .consumable(15.0, 25.0, -5.0) // Good raw nutrition - lean and tender
            .cookable(35.0, "Cooked Caribou Meat")
            .build(),

        ItemBuilder::new("Cooked Caribou Meat", "Expertly prepared caribou venison. Tender, lean, and richly flavored - a true delicacy of the north.", ItemCategory::Consumable)
            .icon("cooked_caribou_meat.png")
            .stackable(10)
            .consumable(50.0, 70.0, 20.0) // Excellent nutrition - large animal, hard to hunt
            .cookable(30.0, "Burnt Caribou Meat")
            .build(),

        ItemBuilder::new("Burnt Caribou Meat", "Overcooked caribou meat. The once-tender venison has become dry and charred.", ItemCategory::Consumable)
            .icon("burnt_caribou_meat.png")
            .stackable(10)
            .consumable(-6.0, 18.0, -18.0) // Penalty for burning good meat
            .crafting_output(15, 0)
            .cookable(40.0, "Charcoal")
            .build(),

        // === SPECIALTY FOODS & MISC ===
        ItemBuilder::new("Tallow", "Rendered animal fat. High in calories and can be used as a slow-burning fuel source for lanterns and Ancestral Wards. Can be eaten in a pinch to stave off hunger, but it's not very appetizing and will make you thirsty.", ItemCategory::Consumable)
            .icon("tallow.png")
            .stackable(1000)
            .consumable(0.0, 20.0, -7.0)
            .preserved() // Rendered fat is shelf-stable
            .fuel(300.0) // 5 minutes burn time - 2 tallow lasts a full night (10 min)
            .crafting_cost(vec![
                CostIngredient { item_name: "Animal Fat".to_string(), quantity: 3 },
                CostIngredient { item_name: "Cloth".to_string(), quantity: 2 },
            ])
            .crafting_output(5, 4) // Makes 5 tallow, takes 4 seconds
            .respawn_time(300)
            .build(),

        // === ANIMAL MILK ===
        ItemBuilder::new("Raw Milk", "Fresh milk from a tamed caribou or walrus. Rich and creamy, providing excellent nutrition and hydration. Can be used to make cheese with yeast. Can also be warmed up to make Warm Milk.", ItemCategory::Consumable)
            .icon("milk.png")
            .stackable(10)
            .consumable(15.0, 25.0, 35.0) // health, hunger, thirst - good nutrition and very hydrating
            .cookable(40.0, "Warm Milk") // Overcooking ruins it
            .respawn_time(300)
            .build(),

        ItemBuilder::new("Warm Milk", "Gently heated milk. Comforting and soothing, perfect for cold nights. More nutritious and easier to digest than cold milk.", ItemCategory::Consumable)
            .icon("warm_milk.png")
            .stackable(10)
            .consumable(30.0, 50.0, 70.0) // health, hunger, thirst - better than raw milk
            .respawn_time(60)
            .build(),

        // === DAIRY PRODUCTS ===
        ItemBuilder::new("Cheese", "Aged cheese made from raw milk and yeast. Rich, savory, and highly nutritious. A valuable food source.", ItemCategory::Consumable)
            .icon("cheese.png")
            .stackable(10)
            .consumable(40.0, 60.0, -10.0) // Very filling but makes you thirsty
            .preserved() // Aged cheese lasts a very long time
            .crafting_cost(vec![
                CostIngredient { item_name: "Raw Milk".to_string(), quantity: 3 },
                CostIngredient { item_name: "Yeast".to_string(), quantity: 1 },
            ])
            .crafting_output(2, 10) // Makes 2 cheese, takes 10 seconds
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Yogurt", "Thick, tangy fermented milk. Refreshing and probiotic-rich. Good for digestion and provides balanced nutrition.", ItemCategory::Consumable)
            .icon("yogurt.png")
            .stackable(10)
            .consumable(25.0, 40.0, 45.0) // Balanced nutrition
            .crafting_cost(vec![
                CostIngredient { item_name: "Raw Milk".to_string(), quantity: 2 },
                CostIngredient { item_name: "Yeast".to_string(), quantity: 1 },
            ])
            .crafting_output(2, 8) // Makes 2 yogurt, takes 8 seconds
            .requires_station("Cooking Station")
            .build(),

        // === FERMENTATION BASE INGREDIENTS ===
        // NOTE: These items are created via ItemInteractionPanel commands (mash_berries, mash_starch,
        // extract_yeast in bones.rs), NOT through the crafting menu.
        // The flexible_ingredient definitions are preserved for reference/future use.
        
        ItemBuilder::new("Yeast", "Active yeast culture for fermentation. Essential for making bread, beer, and wine. Extract from berry mash, grain mash, root mash, or raw milk.", ItemCategory::Consumable)
            .icon("yeast.png")
            .stackable(20)
            .consumable(2.0, 2.0, 2.0) // Barely edible on its own
            .preserved() // Dried yeast lasts indefinitely
            // Created via extract_yeast reducer - no crafting recipe
            .build(),

        ItemBuilder::new("Berry Mash", "Crushed and mashed berries ready for fermentation. The base for berry wine and yeast production.", ItemCategory::Consumable)
            .icon("berry_mash.png")
            .stackable(10)
            .consumable(10.0, 15.0, 25.0) // Sweet and hydrating
            // Created via mash_berries reducer - no crafting recipe
            .build(),

        // NOTE: "Grain Mash" removed - flour is for baking bread, not brewing.
        // Cooked starchy items are mashed directly into Starchy Mash via mash_starch reducer.

        ItemBuilder::new("Starchy Mash", "Mashed cooked starchy roots and bulbs ready for fermentation. The base for beer and other brews.", ItemCategory::Consumable)
            .icon("root_mash.png") // Reuse root_mash icon
            .stackable(10)
            .consumable(15.0, 25.0, 10.0) // Starchy and filling
            // Created via mash_starch reducer - no crafting recipe
            .build(),

        // === ALCOHOLIC BEVERAGES ===
        ItemBuilder::new("Beer", "Hearty beer brewed from starchy mash and yeast. Provides warmth and courage, but may impair judgment.", ItemCategory::Consumable)
            .icon("grain_beer.png") // Reuse existing icon
            .stackable(10)
            .consumable(20.0, 30.0, 40.0) // Hydrating and filling
            .preserved() // Alcohol is a preservative
            .crafting_cost(vec![
                CostIngredient { item_name: "Starchy Mash".to_string(), quantity: 2 },
                CostIngredient { item_name: "Yeast".to_string(), quantity: 1 },
            ])
            .crafting_output(2, 8)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Berry Wine", "Sweet and fruity wine made from fermented berry mash. A civilized drink for harsh times.", ItemCategory::Consumable)
            .icon("berry_wine.png")
            .stackable(10)
            .consumable(25.0, 20.0, 50.0) // More hydrating, less filling
            .preserved() // Alcohol is a preservative
            .crafting_cost(vec![
                CostIngredient { item_name: "Berry Mash".to_string(), quantity: 2 },
                CostIngredient { item_name: "Yeast".to_string(), quantity: 1 },
            ])
            .crafting_output(2, 8)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Root Wine", "Earthy wine made from fermented starchy roots and bulbs. An acquired taste with surprising depth.", ItemCategory::Consumable)
            .icon("root_wine.png")
            .stackable(10)
            .consumable(20.0, 25.0, 45.0) // Balanced
            .preserved() // Alcohol is a preservative
            .crafting_cost(vec![
                CostIngredient { item_name: "Starchy Mash".to_string(), quantity: 2 },
                CostIngredient { item_name: "Yeast".to_string(), quantity: 1 },
            ])
            .crafting_output(2, 8)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Mead", "Golden honey wine fermented with yeast. A traditional drink that warms the body and lifts the spirits. Never spoils.", ItemCategory::Consumable)
            .icon("mead.png")
            .stackable(10)
            .consumable(30.0, 15.0, 55.0) // Very hydrating, warming, less filling than beer
            .preserved() // Never spoils - fermented with honey
            .crafting_cost(vec![
                CostIngredient { item_name: "Honey".to_string(), quantity: 2 },
                CostIngredient { item_name: "Yeast".to_string(), quantity: 1 },
            ])
            .crafting_output(2, 10) // Takes longer to ferment
            .requires_station("Cooking Station")
            .build(),

        // === VINEGAR ===
        ItemBuilder::new("Vinegar", "Sharp, acidic liquid from further fermentation. Essential for pickling and preserving foods.", ItemCategory::Consumable)
            .icon("vinegar.png")
            .stackable(10)
            .consumable(-5.0, 5.0, 10.0) // Not great to drink straight
            .preserved() // Never spoils - it's a preservative itself
            .crafting_cost(vec![
                CostIngredient { item_name: "Berry Mash".to_string(), quantity: 1 },
                CostIngredient { item_name: "Yeast".to_string(), quantity: 1 },
            ])
            .alternative_recipe(vec![
                CostIngredient { item_name: "Berry Wine".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 5)
            .requires_station("Cooking Station")
            .build(),

        // === PRESERVES ===
        // Long-lasting preserved foods - perfect for winter survival without a pantry
        ItemBuilder::new("Berry Jam", "Sweet preserved berries cooked with honey. Never spoils and provides excellent nutrition. A taste of summer in the darkest winter.", ItemCategory::Consumable)
            .icon("berry_jam.png")
            .stackable(15)
            .consumable(20.0, 30.0, 15.0) // Good nutrition, slightly sweet
            .preserved() // Never spoils - honey acts as preservative
            .flexible_ingredient("Any Berry", 3, vec![
                "Lingonberries",
                "Cloudberries",
                "Crowberries",
                "Bilberries",
                "Wild Strawberries",
                "Rowan Berries",
                "Cranberries",
                "Nagoonberries",
            ])
            .crafting_cost(vec![
                CostIngredient { item_name: "Honey".to_string(), quantity: 1 },
            ])
            .crafting_output(2, 8)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Pickled Vegetables", "Vegetables preserved in vinegar. Tangy, crunchy, and will never spoil. Essential for surviving long winters without refrigeration.", ItemCategory::Consumable)
            .icon("pickled_vegetables.png")
            .stackable(20)
            .consumable(10.0, 25.0, -10.0) // Filling but salty, makes you thirsty
            .preserved() // Never spoils - vinegar acts as preservative
            .flexible_ingredient("Any Vegetable", 2, vec![
                "Carrot",
                "Beet",
                "Cabbage",
                "Potato",
                "Pumpkin",
                "Corn",
                "Fennel",
                "Horseradish",
                "Salsify",
                "Chicory",
            ])
            .crafting_cost(vec![
                CostIngredient { item_name: "Vinegar".to_string(), quantity: 1 },
            ])
            .crafting_output(2, 6)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Pickled Fish", "Fish preserved in vinegar. Tangy and acidic, but will last indefinitely. A traditional way to store the catch.", ItemCategory::Consumable)
            .icon("pickled_fish.png")
            .stackable(15)
            .consumable(15.0, 35.0, -15.0) // Good protein, but sour and salty
            .preserved() // Never spoils - vinegar preservation
            .flexible_ingredient("Any Raw Fish", 2, vec![
                "Raw Herring",
                "Raw Smelt",
                "Raw Greenling",
                "Raw Sculpin",
                "Raw Pacific Cod",
                "Raw Dolly Varden",
                "Raw Rockfish",
                "Raw Steelhead",
                "Raw Pink Salmon",
                "Raw Sockeye Salmon",
                "Raw King Salmon",
                "Raw Halibut",
            ])
            .crafting_cost(vec![
                CostIngredient { item_name: "Vinegar".to_string(), quantity: 1 },
            ])
            .crafting_output(2, 8)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Meat Jerky", "Dried and cured meat strips. Lightweight, protein-rich, and never spoils. Perfect for long expeditions.", ItemCategory::Consumable)
            .icon("meat_jerky.png")
            .stackable(30)
            .consumable(25.0, 45.0, -20.0) // High protein, very dry
            .preserved() // Never spoils - dried and cured
            .flexible_ingredient("Any Cooked Meat", 2, vec![
                "Cooked Wolf Meat",
                "Cooked Fox Meat",
                "Cooked Viper Meat",
                "Cooked Crow Meat",
                "Cooked Tern Meat",
                "Cooked Vole Meat",
                "Cooked Wolverine Meat",
                "Cooked Caribou Meat",
            ])
            .crafting_output(3, 10) // Takes time to dry, yields 3
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Dried Fish", "Sun-dried fish fillets. A staple of Aleutian survival, light to carry and lasts forever. The backbone of winter food stores.", ItemCategory::Consumable)
            .icon("dried_fish.png")
            .stackable(30)
            .consumable(20.0, 40.0, -15.0) // Good protein, dry
            .preserved() // Never spoils - traditional drying
            .flexible_ingredient("Any Raw Fish", 2, vec![
                "Raw Herring",
                "Raw Smelt",
                "Raw Greenling",
                "Raw Sculpin",
                "Raw Pacific Cod",
                "Raw Dolly Varden",
                "Raw Rockfish",
                "Raw Steelhead",
                "Raw Pink Salmon",
                "Raw Sockeye Salmon",
                "Raw King Salmon",
                "Raw Halibut",
            ])
            .crafting_output(3, 10) // Takes time to dry, yields 3
            .requires_station("Cooking Station")
            .build(),

        // === BEE PRODUCTS ===
        // Honeycomb is found in the wild or from beekeeping. Cook it to get honey, or extract the queen bee.
        ItemBuilder::new("Honeycomb", "A waxy structure filled with golden honey. Can be cooked to extract pure honey, or carefully searched for a queen bee.", ItemCategory::Consumable)
            .icon("honeycomb.png")
            .stackable(10)
            .consumable(10.0, 15.0, 5.0) // Edible raw but messy
            .cookable(8.0, "Honey") // Cook in campfire/furnace to get honey
            .respawn_time(600) // Found in wild
            .build(),

        ItemBuilder::new("Honey", "Pure golden honey extracted from honeycomb. A natural sweetener with medicinal properties that never spoils.", ItemCategory::Consumable)
            .icon("honey.png")
            .stackable(20)
            .consumable(15.0, 25.0, 10.0) // Nutritious and slightly medicinal
            .preserved() // Never spoils - honey is naturally antibacterial
            // Created by cooking honeycomb - no direct crafting recipe
            .build(),

        ItemBuilder::new("Queen Bee", "A rare queen bee carefully extracted from honeycomb. Essential for starting new bee colonies. Keep her alive - she won't survive long without a hive!", ItemCategory::Material)
            .icon("queen_bee.png")
            .stackable(1) // Very rare, don't stack much
            .spoils_after_hours(18.0) // Queen bee dies after 18 hours without proper hive - use quickly!
            // Created via extract_queen_bee reducer from Honeycomb
            .build(),

        ItemBuilder::new("Tin of Sprats in Oil", "Small oily fish preserved in a tin. Provides good nutrition and a slight health boost from the omega oils.", ItemCategory::Consumable)
            .icon("tin_of_sprats.png")
            .stackable(10)
            .consumable(25.0, 35.0, -15.0)
            .preserved() // Canned food never spoils
            .respawn_time(900)
            .build(),

        ItemBuilder::new("Fermented Cabbage Jar", "Sour, salty fermented cabbage. High in salt content - will make you very thirsty but provides some nutrition.", ItemCategory::Consumable)
            .icon("fermented_cabbage_jar.png")
            .stackable(5)
            .consumable(25.0, 20.0, -25.0)
            .preserved() // Fermentation is preservation
            .respawn_time(720)
            .build(),

        ItemBuilder::new("Old Hardtack Biscuits", "Rock-hard military biscuits that could break a tooth. Barely edible but they last forever and provide sustenance.", ItemCategory::Consumable)
            .icon("old_hardtack_biscuits.png")
            .stackable(15)
            .consumable(25.0, 45.0, -10.0)
            .preserved() // Hardtack literally lasts decades
            .respawn_time(600)
            .build(),

        ItemBuilder::new("Expired Soviet Chocolate", "Old chocolate bar with Cyrillic text. Provides a morale boost but shows signs of age - consume at your own risk.", ItemCategory::Consumable)
            .icon("expired_soviet_chocolate.png")
            .stackable(8)
            .consumable(25.0, 15.0, 5.0)
            .preserved() // Chocolate lasts years even "expired"
            .respawn_time(1200)
            .build(),

        ItemBuilder::new("Mystery Can (Label Missing)", "A dented can with no readable label. Could be delicious stew, could be pet food. Only one way to find out...", ItemCategory::Consumable)
            .icon("mystery_can.png")
            .stackable(5)
            .consumable(0.0, 50.0, 0.0)
            .preserved() // Canned food never spoils
            .respawn_time(800)
            .build(),

        // === MEDICINE ===
        ItemBuilder::new("Anti-Venom", "A specialized medical serum that neutralizes Cable Viper venom. Instantly cures all venom effects. Essential for surviving in viper territory.", ItemCategory::Consumable)
            .icon("anti_venom.png")
            .stackable(5)
            .crafting_cost(vec![CostIngredient { item_name: "Cable Viper Gland".to_string(), quantity: 1 }])
            .crafting_output(1, 5)
            .build(),

        // === MUSHROOMS ===
        ItemBuilder::new("Chanterelle", "Golden trumpet-shaped mushrooms with a fruity aroma. Safe and delicious when cooked properly.", ItemCategory::Consumable)
            .icon("chanterelle.png")
            .stackable(20)
            .consumable(6.0, 8.0, 2.0)
            .cookable(25.0, "Cooked Chanterelle")
            .respawn_time(220)
            .build(),

        ItemBuilder::new("Cooked Chanterelle", "Perfectly sautéed chanterelles with enhanced flavor and nutrition. Golden and aromatic.", ItemCategory::Consumable)
            .icon("cooked_chanterelle.png")
            .stackable(20)
            .consumable(22.0, 25.0, 12.0) // Increased to compensate for removed 12 stamina
            .cookable(20.0, "Burnt Chanterelle")
            .build(),

        ItemBuilder::new("Burnt Chanterelle", "Overcooked chanterelles, blackened and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_chanterelle.png")
            .stackable(20)
            .consumable(-4.0, 3.0, -6.0)
            .crafting_output(8, 0)
            .cookable(30.0, "Charcoal")
            .respawn_time(40)
            .build(),

        ItemBuilder::new("Porcini", "Prized mushrooms with a meaty texture and rich flavor. Excellent nutrition when prepared properly.", ItemCategory::Consumable)
            .icon("porcini.png")
            .stackable(15)
            .consumable(8.0, 12.0, 3.0)
            .cookable(30.0, "Cooked Porcini")
            .respawn_time(280)
            .build(),

        ItemBuilder::new("Cooked Porcini", "Expertly cooked porcini mushrooms. Rich, meaty texture with exceptional nutritional value.", ItemCategory::Consumable)
            .icon("cooked_porcini.png")
            .stackable(15)
            .consumable(30.0, 35.0, 16.0) // Increased to compensate for removed 18 stamina
            .cookable(25.0, "Burnt Porcini")
            .build(),

        ItemBuilder::new("Burnt Porcini", "Charred porcini mushrooms. All the delicate flavors destroyed by excessive heat.", ItemCategory::Consumable)
            .icon("burnt_porcini.png")
            .stackable(15)
            .consumable(-5.0, 5.0, -8.0)
            .crafting_output(10, 0)
            .cookable(35.0, "Charcoal")
            .respawn_time(50)
            .build(),

        ItemBuilder::new("Shaggy Ink Cap", "Delicate mushrooms that must be cooked immediately after harvest. Edible when fresh but deteriorates quickly.", ItemCategory::Consumable)
            .icon("shaggy_ink_cap.png")
            .stackable(25)
            .consumable(4.0, 6.0, 1.0)
            .cookable(20.0, "Cooked Shaggy Ink Cap")
            .respawn_time(180)
            .build(),

        ItemBuilder::new("Cooked Shaggy Ink Cap", "Quickly cooked ink cap mushrooms. Light and nutritious with a delicate flavor.", ItemCategory::Consumable)
            .icon("cooked_shaggy_ink_cap.png")
            .stackable(25)
            .consumable(12.0, 15.0, 6.0)
            .cookable(15.0, "Burnt Shaggy Ink Cap")
            .build(),

        ItemBuilder::new("Burnt Shaggy Ink Cap", "Overcooked ink cap mushrooms. Turned to black mush, barely edible.", ItemCategory::Consumable)
            .icon("burnt_shaggy_ink_cap.png")
            .stackable(25)
            .consumable(-3.0, 2.0, -5.0)
            .crafting_output(6, 0)
            .cookable(25.0, "Charcoal")
            .respawn_time(30)
            .build(),

        ItemBuilder::new("Fly Agaric", "Iconic red mushroom with white spots. Highly toxic and psychoactive. Cooking does not remove the toxins.", ItemCategory::Consumable)
            .icon("fly_agaric.png")
            .stackable(10)
            .consumable(-15.0, 2.0, -20.0)
            .cookable(30.0, "Burnt Fly Agaric")
            .respawn_time(400)
            .build(),

        ItemBuilder::new("Burnt Fly Agaric", "Charred toxic mushroom. Still dangerous even when burnt, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_fly_agaric.png")
            .stackable(10)
            .consumable(-8.0, 1.0, -12.0)
            .crafting_output(12, 0)
            .cookable(40.0, "Charcoal")
            .respawn_time(70)
            .build(),

        ItemBuilder::new("Deadly Webcap", "Extremely dangerous mushroom containing deadly toxins. Even small amounts can be lethal. Avoid at all costs.", ItemCategory::Consumable)
            .icon("deadly_webcap.png")
            .stackable(8)
            .consumable(-25.0, 1.0, -30.0)
            .cookable(35.0, "Burnt Deadly Webcap")
            .respawn_time(500)
            .build(),

        ItemBuilder::new("Burnt Deadly Webcap", "Charred deadly mushroom. Toxicity reduced but still harmful. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_deadly_webcap.png")
            .stackable(8)
            .consumable(-12.0, 1.0, -15.0)
            .crafting_output(15, 0)
            .cookable(45.0, "Charcoal")
            .respawn_time(90)
            .build(),

        ItemBuilder::new("Destroying Angel", "Pure white mushroom of death. Contains lethal toxins that cause delayed but fatal poisoning. Extremely dangerous.", ItemCategory::Consumable)
            .icon("destroying_angel.png")
            .stackable(6)
            .consumable(-30.0, 1.0, -40.0)
            .cookable(40.0, "Burnt Destroying Angel")
            .respawn_time(600)
            .build(),

        ItemBuilder::new("Burnt Destroying Angel", "Charred death cap. Even burnt, it retains dangerous toxins. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_destroying_angel.png")
            .stackable(6)
            .consumable(-15.0, 1.0, -20.0)
            .crafting_output(18, 0)
            .cookable(50.0, "Charcoal")
            .respawn_time(110)
            .build(),

        // === BERRIES & NUTS ===
        ItemBuilder::new("Lingonberries", "Tart red berries with a slightly bitter taste. Rich in vitamins and antioxidants. Common in northern regions.", ItemCategory::Consumable)
            .icon("lingonberries.png")
            .stackable(25)
            .consumable(8.0, 12.0, 8.0)
            .cookable(20.0, "Burnt Lingonberries")
            .respawn_time(240)
            .build(),

        ItemBuilder::new("Burnt Lingonberries", "Overcooked lingonberries. Vitamins destroyed and taste ruined, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_lingonberries.png")
            .stackable(25)
            .consumable(-2.0, 2.0, -4.0)
            .crafting_output(6, 0)
            .cookable(25.0, "Charcoal")
            .respawn_time(45)
            .build(),

        ItemBuilder::new("Cloudberries", "Rare orange berries with a complex sweet-tart flavor. Highly prized for their exceptional nutritional value.", ItemCategory::Consumable)
            .icon("cloudberries.png")
            .stackable(20)
            .consumable(12.0, 15.0, 12.0)
            .cookable(22.0, "Burnt Cloudberries")
            .respawn_time(360)
            .build(),

        ItemBuilder::new("Burnt Cloudberries", "Charred cloudberries. The exceptional nutrition is lost to overcooking, but can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_cloudberries.png")
            .stackable(20)
            .consumable(-3.0, 3.0, -5.0)
            .crafting_output(8, 0)
            .cookable(28.0, "Charcoal")
            .respawn_time(50)
            .build(),

        ItemBuilder::new("Bilberries", "Small dark blue berries with intense flavor. Excellent source of antioxidants and natural sugars.", ItemCategory::Consumable)
            .icon("bilberries.png")
            .stackable(30)
            .consumable(6.0, 10.0, 6.0)
            .cookable(18.0, "Burnt Bilberries")
            .respawn_time(200)
            .build(),

        ItemBuilder::new("Burnt Bilberries", "Overcooked bilberries. Dark and bitter, antioxidants destroyed by heat.", ItemCategory::Consumable)
            .icon("burnt_bilberries.png")
            .stackable(30)
            .consumable(-2.0, 2.0, -3.0)
            .crafting_output(5, 0)
            .cookable(22.0, "Charcoal")
            .respawn_time(40)
            .build(),

        ItemBuilder::new("Wild Strawberries", "Tiny but intensely flavored wild strawberries. Much more aromatic than cultivated varieties.", ItemCategory::Consumable)
            .icon("wild_strawberries.png")
            .stackable(35)
            .consumable(5.0, 8.0, 5.0)
            .cookable(15.0, "Burnt Wild Strawberries")
            .respawn_time(180)
            .build(),

        ItemBuilder::new("Burnt Wild Strawberries", "Charred wild strawberries. The delicate flavor is completely destroyed by overcooking.", ItemCategory::Consumable)
            .icon("burnt_wild_strawberries.png")
            .stackable(35)
            .consumable(-1.0, 1.0, -2.0)
            .crafting_output(4, 0)
            .cookable(20.0, "Charcoal")
            .respawn_time(35)
            .build(),

        ItemBuilder::new("Rowan Berries", "Bright red berries with a bitter, astringent taste. Traditionally used for jellies and preserves.", ItemCategory::Consumable)
            .icon("rowan_berries.png")
            .stackable(25)
            .consumable(4.0, 6.0, 3.0)
            .cookable(18.0, "Burnt Rowan Berries")
            .respawn_time(220)
            .build(),

        ItemBuilder::new("Burnt Rowan Berries", "Charred rowan berries. Already bitter when raw, they're nearly inedible when burnt.", ItemCategory::Consumable)
            .icon("burnt_rowan_berries.png")
            .stackable(25)
            .consumable(-2.0, 1.0, -4.0)
            .crafting_output(5, 0)
            .cookable(22.0, "Charcoal")
            .respawn_time(40)
            .build(),

        ItemBuilder::new("Cranberries", "Tart, sour red berries. Rich in vitamin C and natural preservatives. Excellent for long-term storage.", ItemCategory::Consumable)
            .icon("cranberries.png")
            .stackable(25)
            .consumable(6.0, 8.0, 6.0)
            .cookable(20.0, "Burnt Cranberries")
            .respawn_time(250)
            .build(),

        ItemBuilder::new("Burnt Cranberries", "Overcooked cranberries. The natural preservatives can't save them from being ruined by excess heat.", ItemCategory::Consumable)
            .icon("burnt_cranberries.png")
            .stackable(25)
            .consumable(-2.0, 2.0, -3.0)
            .crafting_output(6, 0)
            .cookable(25.0, "Charcoal")
            .respawn_time(45)
            .build(),



        // === TOXIC/MEDICINAL ===
        ItemBuilder::new("Mandrake Root", "Mystical root with powerful but dangerous properties. Used in traditional medicine but highly toxic if misused.", ItemCategory::Consumable)
            .icon("mandrake_root.png")
            .stackable(5)
            .consumable(-5.0, 8.0, -10.0) // Rebalanced to compensate for removed 20 stamina (still toxic but less harsh)
            .cookable(50.0, "Burnt Mandrake Root")
            .respawn_time(480)
            .build(),

        ItemBuilder::new("Burnt Mandrake Root", "Charred mandrake root. Medicinal properties destroyed, toxicity reduced but still harmful.", ItemCategory::Consumable)
            .icon("burnt_mandrake_root.png")
            .stackable(5)
            .consumable(-5.0, 1.0, -8.0)
            .crafting_output(15, 0)
            .cookable(55.0, "Charcoal")
            .respawn_time(85)
            .build(),

        ItemBuilder::new("Belladonna", "Beautiful but deadly nightshade berries. Extremely toxic. Even small amounts can be lethal.", ItemCategory::Consumable)
            .icon("belladonna.png")
            .stackable(8)
            .consumable(-20.0, 2.0, -25.0)
            .cookable(35.0, "Burnt Belladonna")
            .respawn_time(520)
            .build(),

        ItemBuilder::new("Burnt Belladonna", "Charred nightshade berries. Still toxic even when burnt. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_belladonna.png")
            .stackable(8)
            .consumable(-10.0, 1.0, -12.0)
            .crafting_output(12, 0)
            .cookable(45.0, "Charcoal")
            .respawn_time(95)
            .build(),

        ItemBuilder::new("Henbane", "Toxic plant with powerful psychoactive properties. Historically used in small doses for medicine, but dangerous.", ItemCategory::Consumable)
            .icon("henbane.png")
            .stackable(10)
            .consumable(-12.0, 3.0, -18.0)
            .cookable(40.0, "Burnt Henbane")
            .respawn_time(420)
            .build(),

        ItemBuilder::new("Burnt Henbane", "Charred henbane. Psychoactive compounds mostly destroyed but still mildly toxic.", ItemCategory::Consumable)
            .icon("burnt_henbane.png")
            .stackable(10)
            .consumable(-6.0, 1.0, -9.0)
            .crafting_output(10, 0)
            .cookable(42.0, "Charcoal")
            .respawn_time(75)
            .build(),

        ItemBuilder::new("Datura", "Trumpet-shaped flowers and seeds containing powerful alkaloids. Extremely dangerous hallucinogen.", ItemCategory::Consumable)
            .icon("datura.png")
            .stackable(6)
            .consumable(-18.0, 2.0, -30.0)
            .cookable(45.0, "Burnt Datura")
            .respawn_time(560)
            .build(),

        ItemBuilder::new("Burnt Datura", "Charred datura seeds and flowers. Hallucinogenic properties reduced but still dangerous.", ItemCategory::Consumable)
            .icon("burnt_datura.png")
            .stackable(6)
            .consumable(-9.0, 1.0, -15.0)
            .crafting_output(14, 0)
            .cookable(48.0, "Charcoal")
            .respawn_time(100)
            .build(),

        ItemBuilder::new("Wolfsbane", "Highly toxic plant also known as aconite. Beautiful purple flowers hide deadly poison. Avoid consumption.", ItemCategory::Consumable)
            .icon("wolfsbane.png")
            .stackable(8)
            .consumable(-22.0, 1.0, -35.0)
            .cookable(50.0, "Burnt Wolfsbane")
            .respawn_time(600)
            .build(),

        ItemBuilder::new("Burnt Wolfsbane", "Charred wolfsbane flowers. Still contains dangerous toxins even when burnt.", ItemCategory::Consumable)
            .icon("burnt_wolfsbane.png")
            .stackable(8)
            .consumable(-11.0, 1.0, -18.0)
            .crafting_output(16, 0)
            .cookable(52.0, "Charcoal")
            .respawn_time(105)
            .build(),

        // NOTE: Stone Soup variants removed - brewing system now uses AI-generated recipes
        // AI-generated brew recipes create ItemDefinitions dynamically via ai_brewing.rs

        // === NEW: ALPINE-SPECIFIC PLANTS ===
        // Survival food: Edible raw, burns directly to charcoal (no burnt stage)
        // Lichen and moss also provide plant fiber (fibrous materials)
        ItemBuilder::new("Arctic Lichen", "A slow-growing alpine lichen. Extremely hardy, grows year-round. Edible raw.", ItemCategory::Consumable)
            .icon("arctic_lichen.png")
            .stackable(10)
            .consumable(3.0, 8.0, 5.0) // Low nutrition but edible raw
            .cookable(50.0, "Charcoal") // Burns directly to charcoal (no intermediate stage)
            .respawn_time(1800)
            .build(),

        ItemBuilder::new("Mountain Moss", "Moss. Can be eaten raw or burned directly to charcoal. Provides plant fiber.", ItemCategory::Consumable)
            .icon("mountain_moss.png")
            .stackable(15)
            .consumable(4.0, 10.0, 6.0) // Slightly better than lichen
            .cookable(50.0, "Charcoal") // Burns directly to charcoal (no intermediate stage)
            .respawn_time(1500)
            .build(),

        ItemBuilder::new("Arctic Poppy", "A rare alpine flower. Beautiful and hardy, grows year-round in harsh conditions. Edible raw.", ItemCategory::Consumable)
            .icon("arctic_poppy.png")
            .stackable(10)
            .consumable(5.0, 12.0, 8.0) // Decent nutrition for alpine plant
            .cookable(50.0, "Charcoal") // Burns directly to charcoal (no intermediate stage)
            .respawn_time(2000)
            .build(),

        // === FISHING JUNK FOOD ===
        // Seaweed - Edible fishing junk, can be dried for better nutrition
        ItemBuilder::new("Seaweed", "Slimy, waterlogged seaweed pulled from the ocean. Edible but not very appetizing. Can be dried for better taste.", ItemCategory::Consumable)
            .icon("seaweed.png")
            .stackable(20)
            .consumable(2.0, 5.0, 8.0) // Low health/hunger, decent thirst (it's wet)
            .cookable(25.0, "Dried Seaweed") // Dries into better food
            .respawn_time(120)
            .build(),

        ItemBuilder::new("Dried Seaweed", "Crispy dried seaweed. A salty, crunchy snack rich in minerals.", ItemCategory::Consumable)
            .icon("dried_seaweed.png")
            .stackable(20)
            .consumable(8.0, 18.0, -5.0) // Better nutrition, but salty so reduces thirst
            .preserved() // Dried foods are shelf-stable
            .cookable(40.0, "Charcoal") // Burns to charcoal if overcooked
            .respawn_time(180)
            .build(),

        // ========================================================================
        // COOKING STATION RECIPES - Advanced gourmet meals
        // ========================================================================
        // These items require standing near a Cooking Station to craft.
        // They provide significantly better nutrition than basic cooked foods.
        // Most recipes require pre-cooked ingredients from campfires/barbecues.

        // === VEGETABLE DISHES ===
        ItemBuilder::new("Vegetable Stew", "A hearty stew of mixed cooked vegetables. Warming and nutritious.", ItemCategory::Consumable)
            .icon("vegetable_stew.png")
            .stackable(5)
            .consumable(60.0, 90.0, 40.0) // High nutrition for veggie dish
            .crafting_cost(vec![
                CostIngredient { item_name: "Cooked Potato".to_string(), quantity: 2 },
                CostIngredient { item_name: "Cooked Carrot".to_string(), quantity: 1 },
                CostIngredient { item_name: "Cooked Beet".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 0) // Instant crafting
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Root Vegetable Medley", "A comforting medley of root vegetables with roasted garlic. Filling and delicious.", ItemCategory::Consumable)
            .icon("root_medley.png")
            .stackable(5)
            .consumable(50.0, 85.0, 30.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cooked Potato".to_string(), quantity: 2 },
                CostIngredient { item_name: "Cooked Beet".to_string(), quantity: 2 },
                CostIngredient { item_name: "Roasted Bear Garlic".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 0)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Stuffed Pumpkin", "A cooked pumpkin stuffed with corn and herbs. A festive autumn dish.", ItemCategory::Consumable)
            .icon("stuffed_pumpkin.png")
            .stackable(3)
            .consumable(65.0, 95.0, 35.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cooked Pumpkin".to_string(), quantity: 1 },
                CostIngredient { item_name: "Cooked Corn".to_string(), quantity: 2 },
                CostIngredient { item_name: "Chamomile".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 0)
            .requires_station("Cooking Station")
            .build(),

        // === SEAFOOD DISHES ===
        ItemBuilder::new("Fish Pie", "A savory pie filled with flaky cod and potato. Hearty and satisfying.", ItemCategory::Consumable)
            .icon("fish_pie.png")
            .stackable(5)
            .consumable(70.0, 100.0, 30.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cooked Pacific Cod".to_string(), quantity: 2 },
                CostIngredient { item_name: "Cooked Potato".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 0)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Seafood Platter", "A luxurious arrangement of cooked crab, mussels, and sea urchin. A coastal delicacy.", ItemCategory::Consumable)
            .icon("seafood_platter.png")
            .stackable(3)
            .consumable(65.0, 85.0, 25.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cooked Crab Meat".to_string(), quantity: 1 },
                CostIngredient { item_name: "Cooked Blue Mussel".to_string(), quantity: 1 },
                CostIngredient { item_name: "Cooked Sea Urchin".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 0)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Salmon Bake", "Fresh salmon baked with potatoes and mint. A refreshing and nutritious meal.", ItemCategory::Consumable)
            .icon("salmon_bake.png")
            .stackable(5)
            .consumable(75.0, 95.0, 35.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cooked Sockeye Salmon".to_string(), quantity: 1 },
                CostIngredient { item_name: "Cooked Potato".to_string(), quantity: 1 },
                CostIngredient { item_name: "Mint Leaves".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 0)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Crab Cakes", "Crispy crab cakes with corn and seaweed. A savory coastal treat.", ItemCategory::Consumable)
            .icon("crab_cakes.png")
            .stackable(8)
            .consumable(55.0, 70.0, 20.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cooked Crab Meat".to_string(), quantity: 2 },
                CostIngredient { item_name: "Cooked Corn".to_string(), quantity: 1 },
                CostIngredient { item_name: "Dried Seaweed".to_string(), quantity: 1 },
            ])
            .crafting_output(2, 0) // Makes 2 crab cakes
            .requires_station("Cooking Station")
            .build(),

        // === MEAT DISHES ===
        ItemBuilder::new("Hunter's Feast", "A massive platter of mixed game meats with corn. A meal fit for a hunter.", ItemCategory::Consumable)
            .icon("hunters_feast.png")
            .stackable(3)
            .consumable(80.0, 110.0, 20.0) // Very filling
            .crafting_cost(vec![
                CostIngredient { item_name: "Cooked Wolf Meat".to_string(), quantity: 1 },
                CostIngredient { item_name: "Cooked Fox Meat".to_string(), quantity: 1 },
                CostIngredient { item_name: "Cooked Tern Meat".to_string(), quantity: 1 },
                CostIngredient { item_name: "Cooked Corn".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 0)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Herb-Crusted Meat", "Tender game meat crusted with a mix of aromatic herbs. A gourmet preparation.", ItemCategory::Consumable)
            .icon("herb_crusted_meat.png")
            .stackable(5)
            .consumable(70.0, 80.0, 25.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cooked Wolf Meat".to_string(), quantity: 1 },
                CostIngredient { item_name: "Chamomile".to_string(), quantity: 1 },
                CostIngredient { item_name: "Mugwort".to_string(), quantity: 1 },
                CostIngredient { item_name: "Yarrow".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 0)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Bear Roast", "A massive roast of bear meat with vegetables. Enough to feed a small party.", ItemCategory::Consumable)
            .icon("bear_roast.png")
            .stackable(2)
            .consumable(90.0, 120.0, 15.0) // Most filling dish
            .crafting_cost(vec![
                CostIngredient { item_name: "Cooked Bear Meat".to_string(), quantity: 2 },
                CostIngredient { item_name: "Cooked Potato".to_string(), quantity: 2 },
                CostIngredient { item_name: "Cooked Carrot".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 0)
            .requires_station("Cooking Station")
            .build(),

        // === MUSHROOM DISHES ===
        ItemBuilder::new("Mushroom Medley", "A fragrant mix of premium forest mushrooms with garlic. An earthy delight.", ItemCategory::Consumable)
            .icon("mushroom_medley.png")
            .stackable(5)
            .consumable(55.0, 75.0, 35.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cooked Porcini".to_string(), quantity: 2 },
                CostIngredient { item_name: "Cooked Chanterelle".to_string(), quantity: 2 },
                CostIngredient { item_name: "Roasted Bear Garlic".to_string(), quantity: 1 },
            ])
            .crafting_output(1, 0)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Stuffed Mushrooms", "Large mushroom caps stuffed with herbs and smaller mushrooms. A savory appetizer.", ItemCategory::Consumable)
            .icon("stuffed_mushrooms.png")
            .stackable(8)
            .consumable(45.0, 55.0, 30.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Cooked Porcini".to_string(), quantity: 2 },
                CostIngredient { item_name: "Chamomile".to_string(), quantity: 1 },
                CostIngredient { item_name: "Mugwort".to_string(), quantity: 1 },
            ])
            .crafting_output(2, 0) // Makes 2 servings
            .requires_station("Cooking Station")
            .build(),

        // === BERRY DISHES ===
        ItemBuilder::new("Berry Tart", "A sweet tart filled with mixed forest berries. A delightful dessert.", ItemCategory::Consumable)
            .icon("berry_tart.png")
            .stackable(8)
            .consumable(40.0, 50.0, 60.0) // High thirst quench due to juicy berries
            .crafting_cost(vec![
                CostIngredient { item_name: "Lingonberries".to_string(), quantity: 3 },
                CostIngredient { item_name: "Cloudberries".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 0)
            .requires_station("Cooking Station")
            .build(),

        ItemBuilder::new("Mixed Berry Bowl", "A refreshing bowl of seasonal berries. Light but energizing.", ItemCategory::Consumable)
            .icon("mixed_berry_bowl.png")
            .stackable(10)
            .consumable(35.0, 40.0, 55.0)
            .crafting_cost(vec![
                CostIngredient { item_name: "Lingonberries".to_string(), quantity: 2 },
                CostIngredient { item_name: "Cloudberries".to_string(), quantity: 2 },
                CostIngredient { item_name: "Crowberries".to_string(), quantity: 2 },
            ])
            .crafting_output(1, 0)
            .requires_station("Cooking Station")
            .build(),

        // === ALEUTIAN BREAD - Premium Traditional Food ===
        // One of the best consumables in the game - requires traditional flour sources and yeast
        ItemBuilder::new("Aleutian Bread", "Traditional leavened bread made from Aleut flour sources. Dense, nutritious, and incredibly satisfying. A testament to the ingenuity of island survival.", ItemCategory::Consumable)
            .icon("aleutian_bread.png")
            .stackable(10)
            .consumable(80.0, 100.0, 25.0) // One of the best - high health and hunger restoration
            .crafting_cost(vec![
                CostIngredient { item_name: "Flour".to_string(), quantity: 4 },
                CostIngredient { item_name: "Yeast".to_string(), quantity: 1 },
            ])
            .crafting_output(2, 0) // Makes 2 loaves
            .requires_station("Cooking Station")
            .build(),

        // Premium version with berries
        ItemBuilder::new("Berry Aleutian Bread", "Traditional Aleutian bread enriched with cloudberries. The perfect balance of savory and sweet - the finest food in the islands.", ItemCategory::Consumable)
            .icon("berry_aleutian_bread.png")
            .stackable(8)
            .consumable(95.0, 110.0, 40.0) // THE BEST consumable - excellent across all stats
            .crafting_cost(vec![
                CostIngredient { item_name: "Flour".to_string(), quantity: 4 },
                CostIngredient { item_name: "Yeast".to_string(), quantity: 1 },
                CostIngredient { item_name: "Cloudberries".to_string(), quantity: 3 },
            ])
            .crafting_output(2, 0) // Makes 2 loaves
            .requires_station("Cooking Station")
            .build(),

        // === PINE NUTS & PINECONE PRODUCTS ===
        // Raw Pinecone is in seeds.rs (Placeable + Consumable)
        
        ItemBuilder::new("Cooked Pinecone", "Roasted pinecone with exposed pine nuts. The heat releases the nutritious, oily pine nuts - a valuable source of fat and protein in the subarctic wilderness.", ItemCategory::Consumable)
            .icon("cooked_pinecone.png")
            .stackable(20)
            .consumable(35.0, 50.0, 5.0) // Excellent nutrition - pine nuts are protein and fat rich
            .cookable(45.0, "Burnt Pinecone")
            .respawn_time(300)
            .build(),

        ItemBuilder::new("Burnt Pinecone", "Overcooked pinecone - the pine nuts are charred and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_pinecone.png")
            .stackable(20)
            .consumable(-3.0, 8.0, -5.0)
            .crafting_output(10, 0)
            .cookable(50.0, "Charcoal")
            .respawn_time(60)
            .build(),

        // === CRAB APPLES ===
        // Small, tart wild apples found in coastal areas - you get a handful at a time
        
        ItemBuilder::new("Crab Apples", "A handful of small, tart wild apples. Quite sour when raw but become sweeter when cooked. Common in coastal thickets.", ItemCategory::Consumable)
            .icon("crab_apples.png")
            .stackable(20)
            .consumable(5.0, 10.0, 12.0) // Low hunger, decent thirst due to tartness
            .cookable(30.0, "Cooked Crab Apples")
            .respawn_time(200)
            .build(),

        ItemBuilder::new("Cooked Crab Apples", "Baked crab apples - the heat caramelizes the sugars and mellows the tartness. Sweet and tender.", ItemCategory::Consumable)
            .icon("cooked_crab_apples.png")
            .stackable(20)
            .consumable(25.0, 35.0, 20.0) // Good nutrition when cooked
            .cookable(40.0, "Burnt Crab Apples")
            .respawn_time(260)
            .build(),

        ItemBuilder::new("Burnt Crab Apples", "Overcooked crab apples - blackened and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_crab_apples.png")
            .stackable(20)
            .consumable(-2.0, 6.0, -8.0)
            .crafting_output(10, 0)
            .cookable(50.0, "Charcoal")
            .respawn_time(60)
            .build(),

        // === HAZELNUTS ===
        // NOTE: Raw Hazelnut moved to seeds.rs - it's now Placeable + Consumable (plant hazelnuts to grow hazelnut trees)
        
        ItemBuilder::new("Cooked Hazelnuts", "Roasted hazelnuts with an irresistible aroma. The heat enhances the nutty flavor and makes them easier to digest.", ItemCategory::Consumable)
            .icon("cooked_hazelnuts.png")
            .stackable(30)
            .consumable(30.0, 45.0, 2.0) // Excellent nutrition - nuts are calorie-dense
            .cookable(45.0, "Burnt Hazelnut")
            .respawn_time(280)
            .build(),

        ItemBuilder::new("Burnt Hazelnuts", "Overcooked hazelnuts - charred and bitter. Can be processed into charcoal.", ItemCategory::Consumable)
            .icon("burnt_hazelnuts.png")
            .stackable(30)
            .consumable(-2.0, 8.0, -5.0)
            .crafting_output(8, 0)
            .cookable(50.0, "Charcoal")
            .respawn_time(60)
            .build(),

    ]
}
