use spacetimedb::{table, Identity, Timestamp, ReducerContext, Table, reducer, SpacetimeType, ScheduleAt, TimeDuration};
use rand::Rng;

// --- Sound Event Types ---

/// Types of sound events that can be triggered
#[derive(SpacetimeType, Clone, Debug, PartialEq)]
pub enum SoundType {
    TreeChop,     // tree_chop.mp3 (1 variation)
    TreeCreaking, // tree_creaking.mp3 (1 variation - plays when tree is about to fall)
    TreeFalling,  // tree_falling.mp3 (1 variation - plays when tree reaches 0 health)
    BirdsFlapping, // birds_flapping.mp3 (1 variation - plays on first tree hit to indicate virgin tree)
    StoneHit,     // stone_hit.mp3 (1 variation)
    StoneDestroyed, // stone_destroyed.mp3 (1 variation - plays when stone reaches 0 health)
    HarvestPlant, // harvest_plant.mp3 (1 variation - for picking up resource nodes)
    PlantSeed,    // plant_seed.mp3 (1 variation - for planting seeds)
    PickupItem,   // item_pickup.mp3 (1 variation - for item pickup)
    CampfireLooping, // campfire_looping.mp3 (1 variation - continuous looping sound)
    LanternLooping,  // lantern_looping.mp3 (1 variation - continuous looping sound)
    BeehiveLooping,  // bees_buzzing.mp3 (1 variation - continuous looping sound when Queen Bee is present)
    Repair,       // repair.mp3 (1 variation - for successful repairs)
    RepairFail,   // repair_fail.mp3 (1 variation - for failed repair attempts)
    HeavyStormRain, // rain_heavy_storm.mp3 (1 variation - continuous heavy rain sound during storms)
    NormalRain,     // rain_normal.mp3 (1 variation - continuous normal rain sound during light/moderate rain)
    DrinkingWater,  // drinking_water.mp3 (1 variation - for drinking water from sources)
    ThrowingUp,     // throwing_up.mp3 (1 variation - for drinking salt water or eating poisonous food)
    EatingFood,     // eating_food.mp3 (1 variation - for eating food items)
    WateringCrops,  // watering_crops.mp3 (1 variation - for watering plants with water containers)
    FillingContainer, // filling_container.mp3 (1 variation - for filling water containers)
    MeleeHitSharp,  // melee_hit_sharp.mp3 (1 variation - for sharp melee weapon hits on players/corpses)
    SpearHit,       // spear_hit.mp3 (1 variation - for wooden/stone spear hits on players/corpses)
    TorchHit,       // torch_hit.mp3 (1 variation - for torch hits on players/corpses)
    TorchHitLit,    // torch_hit_lit.mp3 (1 variation - for lit torch hits on players/corpses, plays with TorchHit)
    LightTorch,     // light_torch.mp3 (1 variation - when lighting a torch)
    ExtinguishTorch, // extinguish_torch.mp3 (1 variation - when extinguishing a torch)
    FlashlightOn,   // flashlight_on.mp3 (1 variation - when turning on a flashlight)
    FlashlightOff,  // flashlight_off.mp3 (1 variation - when turning off a flashlight)
    MeleeHitBlunt,  // melee_hit_blunt.mp3 (1 variation - for blunt weapon hits on players/corpses)
    WeaponSwing,    // weapon_swing.mp3 (1 variation - for all weapon swings)
    ArrowHit,       // arrow_hit.mp3 (1 variation - when arrows hit players/corpses)
    ShootBow,       // shoot_bow.mp3 (1 variation - when hunting bow is fired)
    ShootCrossbow,  // shoot_crossbow.mp3 (1 variation - when crossbow is fired)
    ShootPistol,    // shoot_pistol.mp3 (1 variation - when pistol is fired)
    ShootTurret,    // shoot_turret.mp3 (1 variation - when turret fires a bullet)
    ReloadBow,      // reload_bow.mp3 (1 variation - when hunting bow is nocked with an arrow)
    ReloadCrossbow, // reload_crossbow.mp3 (1 variation - when crossbow is loaded with a bolt)
    ReloadPistol,   // reload_pistol.mp3 (1 variation - when pistol magazine is loaded)
    Bandaging,      // bandaging.mp3 (1 variation - when player starts bandaging, stops if interrupted)
    StopBandaging,  // Special signal to stop bandaging sound
    BarrelHit,      // barrel_hit.mp3 (1 variation - when barrels are hit but not destroyed)
    BarrelDestroyed, // barrel_destroyed.mp3 (1 variation - when barrels are destroyed)
    HitTrash,       // hit_trash.mp3 (1 variation - when barrel5.png (variant 4) is hit)
    HitWood,        // hit_wood.mp3 (1 variation - when barrel4.png (variant 3) or wooden storage boxes are hit)
    BoxDestroyed,   // box_destroyed.mp3 (1 variation - when large/small wooden storage boxes or barrel4.png/barrel5.png are destroyed)
    // Animal growl sounds - when animals detect and approach players
    GrowlWolf,      // growl_wolf.mp3 (1 variation - when wolves start chasing)
    GrowlFox,       // growl_fox.mp3 (1 variation - when foxes start attacking)
    GrowlSnake,     // growl_snake.mp3 (1 variation - when vipers start approaching)
    GrowlWalrus,    // growl_walrus.mp3 (3 variations - when walruses are disturbed)
    GrowlCrab,      // growl_crab.mp3 (1 variation - when crabs detect and attack)
    GrowlCrow,      // growl_crow.mp3 (1 variation - when crows caw at players)
    GrowlTern,      // growl_tern.mp3 (1 variation - when terns screech at players)
    GrowlVole,      // growl_vole.mp3 (1 variation - tiny squeak when voles flee)
    GrowlWolverine, // growl_wolverine.mp3 (1 variation - fierce snarl when wolverines attack)
    GrowlCaribou,   // growl_caribou.mp3 (1 variation - snort/bellow when caribou are spooked or attack)
    GrowlPolarBear, // growl_polar_bear.mp3 (1 variation - deep roar when polar bears attack)
    GrowlHare,      // growl_hare.mp3 (1 variation - tiny squeak when hares are startled)
    GrowlOwl,       // growl_owl.mp3 (1 variation - hoot/screech when snowy owls attack)
    // Night hostile NPC sounds
    GrowlShorebound,   // growl_shorebound.mp3 (7 variations - stalker growls)
    GrowlShardkin,     // growl_shardkin.mp3 (4 variations - swarmer chittering)
    GrowlDrownedWatch, // growl_drowned_watch.mp3 (5 variations - brute roars)
    Walking,        // walking.mp3 (4 variations - footstep sounds when player moves)
    Swimming,       // swimming.mp3 (4 variations - swimming sounds when player moves in water)
    FoundationWoodConstructed, // foundation_wood_constructed.mp3 (1 variation - when foundation is placed)
    FoundationWoodUpgraded,    // foundation_wood_upgraded.mp3 (1 variation - when foundation upgraded to wood)
    FoundationStoneUpgraded,   // foundation_stone_upgraded.mp3 (1 variation - when foundation upgraded to stone)
    FoundationMetalUpgraded,   // foundation_metal_upgraded.mp3 (1 variation - when foundation upgraded to metal)
    FoundationTwigDestroyed,   // twig_foundation_destroyed.mp3 (1 variation - when twig foundation is destroyed)
    ItemThrown,                // item_thrown.mp3 (1 variation - when a weapon/item is thrown)
    ErrorResources,           // error_resources.mp3 (1 variation - when player doesn't have enough resources)
    ErrorCantPickUpCauldron,  // error_cant_pick_up_cauldron.mp3 (1 variation - when trying to pick up cauldron with contents)
    DoneCooking,              // done_cooking.mp3 (1 variation - when items finish cooking in campfire)
    DoneBurning,              // done_burning.mp3 (1 variation - when cooked food becomes burnt)
    SoupBoiling,              // soup_boiling.mp3 (1 variation - looping sound while soup is brewing)
    ErrorJarPlacement,       // error_jar_placement.mp3 (1 variation - when trying to place jar back in output slot)
    ErrorBrothNotCompatible, // error_broth_not_compatible.mp3 (1 variation - when trying to place incompatible item in broth pot)
    DoorOpening,             // door_opening.mp3 (1 variation - when a door is opened)
    BarbecueOn,              // barbecue_on.mp3 (1 variation - when barbecue is turned on)
    BarbecueOff,             // barbecue_off.mp3 (1 variation - when barbecue is turned off)
    CrowStealing,            // crow_stealing.mp3 (1 variation - when crow successfully steals from player)
    CairnUnlock,             // cairn_unlock.mp3 (1 variation - when player discovers a new cairn)
    GrassCut,                // grass_cut.mp3 (1 variation - when grass is chopped by player)
    SnorkelSubmerge,         // snorkel_submerge.mp3 (1 variation - when player submerges with snorkel)
    SnorkelEmerge,           // snorkel_emerge.mp3 (1 variation - when player emerges from water)
    ErrorSeaweedAboveWater,  // error_seaweed_above_water.mp3 (1 variation - when trying to harvest seaweed while above water)
    Stun,                    // stun.mp3 (1 variation - when player is stunned by blunt weapon)
    ExplosiveFuseBabushka,  // explosive_fuse_babushka.mp3 (looping ticking sound for Babushka's Surprise fuse)
    ExplosiveFuseMatriarch, // explosive_fuse_matriarch.mp3 (looping ticking sound for Matriarch's Wrath fuse)
    Explosion,               // explosion.mp3 (1 variation - loud explosion sound, audible from far away)
    ExplosiveDud,            // explosive_dud.mp3 (1 variation - fizzle sound when explosive fails to detonate)
    DoorDestroyed,           // door_destroyed.mp3 (1 variation - when door is destroyed)
    SovaMemoryShardTutorial, // sova_tutorial_memory_shard.mp3 (SOVA explains memory shards on first pickup)
    SovaMemoryShard200Tutorial, // sova_tutorial_memory_shard_200.mp3 (SOVA warns about 200 shards, mind instability, Memory Grid)
    TillDirt,                // till_dirt.mp3 (1 variation - when player tills soil with Stone Tiller)
    ErrorTillingFailed,      // error_tilling_failed.mp3 (SOVA: "This ground cannot be tilled")
    ErrorTillingDirt,        // error_tilling_dirt.mp3 (SOVA: "This soil has already been prepared")
    ErrorMobileCapability,   // sova_error_mobile_capability.mp3 (SOVA: "Perhaps you could put me on more capable hardware...")
    HostileDeath,            // death_hostile.mp3 (2 variations - when hostile NPCs are killed)
    // Animal/creature death sounds
    DeathWolf,               // death_wolf.mp3 (1 variation - when wolves die)
    DeathFox,                // death_fox.mp3 (1 variation - when foxes die)
    DeathCrab,               // death_crab.mp3 (1 variation - when crabs die)
    DeathWalrus,             // death_walrus.mp3 (1 variation - when walruses die)
    DeathTern,               // death_tern.mp3 (1 variation - when terns die)
    DeathCrow,               // death_crow.mp3 (1 variation - when crows die)
    DeathViper,              // death_viper.mp3 (1 variation - when vipers die)
    DeathVole,               // death_vole.mp3 (1 variation - when voles die)
    DeathWolverine,          // death_wolverine.mp3 (1 variation - when wolverines die)
    DeathCaribou,            // death_caribou.mp3 (1 variation - when caribou die)
    DeathPolarBear,          // death_polar_bear.mp3 (1 variation - when polar bears die)
    DeathHare,               // death_hare.mp3 (1 variation - when hares die)
    DeathOwl,                // death_owl.mp3 (1 variation - when snowy owls die)
    DeathBee,                // death_bee.mp3 (1 variation - when bees die from fire)
    DeathPlayer,             // death_player.mp3 (2 variations - when players die/get knocked out)
    AnimalBurrow,            // animal_burrow.mp3 (1 variation - when animals burrow underground)
    // Player feedback sounds
    PlayerHurt,              // player_hurt.mp3 (3 variations - player grunts when taking damage)
    Heartbeat,            // heartbeat.mp3 (looping - plays when player health is critically low)
    StopHeartbeat,           // Special signal to stop heartbeat sound
    Thunder,                 // thunder.mp3 (4 variations - thunder, thunder1, thunder2, thunder3)
    MashBerries,             // mash_berries.mp3 (1 variation - for mashing berries into Berry Mash)
    PulverizeFlour,          // pulverize_flour.mp3 (1 variation - for grinding items into flour)
    ExtractQueenBee,         // extract_queen_bee.mp3 (1 variation - for extracting queen bee from honeycomb)
    UnravelRope,             // unravel_rope.mp3 (1 variation - for unraveling rope into plant fiber)
    DroneFlying,             // plane_flying.mp3 (3 variations - eerie drone flyover across the island)
    ChewingGum,             // chewing_gum.mp3 (1 variation - continuous looping sound when player chews gum)
    // Add more as needed - extensible system
}

impl SoundType {
    /// Get the base sound file name (without variation number and extension)
    pub fn get_base_filename(&self) -> &'static str {
        match self {
            SoundType::TreeChop => "tree_chop",
            SoundType::TreeCreaking => "tree_creaking",
            SoundType::TreeFalling => "tree_falling",
            SoundType::BirdsFlapping => "birds_flapping",
            SoundType::StoneHit => "stone_hit",
            SoundType::StoneDestroyed => "stone_destroyed",
            SoundType::HarvestPlant => "harvest_plant", 
            SoundType::PlantSeed => "plant_seed",
            SoundType::PickupItem => "item_pickup",
            SoundType::CampfireLooping => "campfire_looping",
            SoundType::LanternLooping => "lantern_looping",
            SoundType::BeehiveLooping => "bees_buzzing",
            SoundType::Repair => "repair",
            SoundType::RepairFail => "repair_fail",
            SoundType::HeavyStormRain => "rain_heavy_storm",
            SoundType::NormalRain => "rain_normal",
            SoundType::DrinkingWater => "drinking_water",
            SoundType::ThrowingUp => "throwing_up",
            SoundType::EatingFood => "eating_food",
            SoundType::WateringCrops => "watering_crops",
            SoundType::FillingContainer => "filling_container",
            SoundType::MeleeHitSharp => "melee_hit_sharp",
            SoundType::SpearHit => "spear_hit",
            SoundType::TorchHit => "torch_hit",
            SoundType::TorchHitLit => "torch_hit_lit",
            SoundType::LightTorch => "light_torch",
            SoundType::ExtinguishTorch => "extinguish_torch",
            SoundType::FlashlightOn => "flashlight_on",
            SoundType::FlashlightOff => "flashlight_off",
            SoundType::MeleeHitBlunt => "melee_hit_blunt",
            SoundType::WeaponSwing => "weapon_swing",
            SoundType::ArrowHit => "arrow_hit",
            SoundType::ShootBow => "shoot_bow",
            SoundType::ShootCrossbow => "shoot_crossbow",
            SoundType::ShootPistol => "shoot_pistol",
            SoundType::ShootTurret => "shoot_turret",
            SoundType::ReloadBow => "reload_bow",
            SoundType::ReloadCrossbow => "reload_crossbow",
            SoundType::ReloadPistol => "reload_pistol",
            SoundType::Bandaging => "bandaging",
            SoundType::StopBandaging => "stop_bandaging",
            SoundType::BarrelHit => "barrel_hit",
            SoundType::BarrelDestroyed => "barrel_destroyed",
            SoundType::HitTrash => "hit_trash",
            SoundType::HitWood => "hit_wood",
            SoundType::BoxDestroyed => "box_destroyed",
            SoundType::GrowlWolf => "growl_wolf",
            SoundType::GrowlFox => "growl_fox",
            SoundType::GrowlSnake => "growl_snake",
            SoundType::GrowlWalrus => "growl_walrus",
            SoundType::GrowlCrab => "growl_crab",
            SoundType::GrowlCrow => "growl_crow",
            SoundType::GrowlTern => "growl_tern",
            SoundType::GrowlVole => "growl_vole",
            SoundType::GrowlWolverine => "growl_wolverine",
            SoundType::GrowlCaribou => "growl_caribou",
            SoundType::GrowlPolarBear => "growl_polar_bear",
            SoundType::GrowlHare => "growl_hare",
            SoundType::GrowlOwl => "growl_owl",
            SoundType::GrowlShorebound => "growl_shorebound",
            SoundType::GrowlShardkin => "growl_shardkin",
            SoundType::GrowlDrownedWatch => "growl_drowned_watch",
            SoundType::Walking => "walking",
            SoundType::Swimming => "swimming",
            SoundType::FoundationWoodConstructed => "foundation_wood_constructed",
            SoundType::FoundationWoodUpgraded => "foundation_wood_upgraded",
            SoundType::FoundationStoneUpgraded => "foundation_stone_upgraded",
            SoundType::FoundationMetalUpgraded => "foundation_metal_upgraded",
            SoundType::FoundationTwigDestroyed => "twig_foundation_destroyed",
            SoundType::ItemThrown => "item_thrown",
            SoundType::ErrorResources => "error_resources",
            SoundType::ErrorCantPickUpCauldron => "error_cant_pick_up_cauldron",
            SoundType::DoneCooking => "done_cooking",
            SoundType::DoneBurning => "done_burning",
            SoundType::SoupBoiling => "soup_boiling",
            SoundType::ErrorJarPlacement => "error_jar_placement",
            SoundType::ErrorBrothNotCompatible => "error_broth_not_compatible",
            SoundType::DoorOpening => "door_opening",
            SoundType::BarbecueOn => "barbecue_on",
            SoundType::BarbecueOff => "barbecue_off",
            SoundType::CrowStealing => "crow_stealing",
            SoundType::CairnUnlock => "cairn_unlock",
            SoundType::GrassCut => "grass_cut",
            SoundType::SnorkelSubmerge => "snorkel_submerge",
            SoundType::SnorkelEmerge => "snorkel_emerge",
            SoundType::ErrorSeaweedAboveWater => "error_seaweed_above_water",
            SoundType::Stun => "stun",
            SoundType::ExplosiveFuseBabushka => "explosive_fuse_babushka",
            SoundType::ExplosiveFuseMatriarch => "explosive_fuse_matriarch",
            SoundType::Explosion => "explosion",
            SoundType::ExplosiveDud => "explosive_dud",
            SoundType::DoorDestroyed => "door_destroyed",
            SoundType::SovaMemoryShardTutorial => "sova_tutorial_memory_shard",
            SoundType::SovaMemoryShard200Tutorial => "sova_tutorial_memory_shard_200",
            SoundType::TillDirt => "till_dirt",
            SoundType::ErrorTillingFailed => "error_tilling_failed",
            SoundType::ErrorTillingDirt => "error_tilling_dirt",
            SoundType::ErrorMobileCapability => "sova_error_mobile_capability",
            SoundType::HostileDeath => "death_hostile",
            // Animal/creature death sounds
            SoundType::DeathWolf => "death_wolf",
            SoundType::DeathFox => "death_fox",
            SoundType::DeathCrab => "death_crab",
            SoundType::DeathWalrus => "death_walrus",
            SoundType::DeathTern => "death_tern",
            SoundType::DeathCrow => "death_crow",
            SoundType::DeathViper => "death_viper",
            SoundType::DeathVole => "death_vole",
            SoundType::DeathWolverine => "death_wolverine",
            SoundType::DeathCaribou => "death_caribou",
            SoundType::DeathPolarBear => "death_polar_bear",
            SoundType::DeathHare => "death_hare",
            SoundType::DeathOwl => "death_owl",
            SoundType::DeathBee => "death_bee",
            SoundType::DeathPlayer => "death_player",
            SoundType::AnimalBurrow => "animal_burrow",
            // Player feedback sounds
            SoundType::PlayerHurt => "player_hurt",
            SoundType::Heartbeat => "heartbeat",
            SoundType::StopHeartbeat => "stop_heartbeat",
            SoundType::Thunder => "thunder",
            SoundType::MashBerries => "mash_berries",
            SoundType::PulverizeFlour => "pulverize_flour",
            SoundType::ExtractQueenBee => "extract_queen_bee",
            SoundType::UnravelRope => "unravel_rope",
            SoundType::DroneFlying => "plane_flying",
            SoundType::ChewingGum => "chewing_gum",
        }
    }

    /// Get the number of sound variations available for this sound type
    pub fn get_variation_count(&self) -> u8 {
        match self {
            SoundType::TreeChop => 1,    // tree_chop.ogg
            SoundType::TreeCreaking => 1, // tree_creaking.ogg
            SoundType::TreeFalling => 1,  // tree_falling.ogg
            SoundType::BirdsFlapping => 1, // birds_flapping.mp3
            SoundType::StoneHit => 1,    // stone_hit.ogg
            SoundType::StoneDestroyed => 1, // stone_destroyed.ogg
            SoundType::HarvestPlant => 1, // harvest_plant.ogg (single variation)
            SoundType::PlantSeed => 1, // plant_seed.ogg (single variation)
            SoundType::PickupItem => 1, // item_pickup.ogg (single variation)
            SoundType::CampfireLooping => 1, // campfire_looping.ogg (single variation)
            SoundType::LanternLooping => 1, // lantern_looping.ogg (single variation)
            SoundType::BeehiveLooping => 1, // bees_buzzing.mp3 (single variation)
            SoundType::Repair => 1, // repair.ogg (single variation)
            SoundType::RepairFail => 1, // repair_fail.ogg (single variation)
            SoundType::HeavyStormRain => 1,
            SoundType::NormalRain => 1, // rain_heavy_storm.ogg (single variation)
            SoundType::DrinkingWater => 1,
            SoundType::ThrowingUp => 1,
            SoundType::EatingFood => 1,
            SoundType::WateringCrops => 1,
            SoundType::FillingContainer => 1,
            SoundType::MeleeHitSharp => 1,
            SoundType::SpearHit => 1,
            SoundType::TorchHit => 1,
            SoundType::TorchHitLit => 1,
            SoundType::LightTorch => 1,
            SoundType::ExtinguishTorch => 1,
            SoundType::FlashlightOn => 1,
            SoundType::FlashlightOff => 1,
            SoundType::MeleeHitBlunt => 1,
            SoundType::WeaponSwing => 1,
            SoundType::ArrowHit => 1,
            SoundType::ShootBow => 1,
            SoundType::ShootCrossbow => 1,
            SoundType::ShootPistol => 1,
            SoundType::ShootTurret => 1,
            SoundType::Bandaging => 1,
            SoundType::StopBandaging => 1,
            SoundType::BarrelHit => 1,
            SoundType::BarrelDestroyed => 1,
            SoundType::HitTrash => 1,
            SoundType::HitWood => 1,
            SoundType::BoxDestroyed => 1,
            SoundType::GrowlWolf => 1,
            SoundType::GrowlFox => 1,
            SoundType::GrowlSnake => 1,
            SoundType::GrowlWalrus => 3,
            SoundType::GrowlCrab => 1, // growl_crab.mp3 (single variation)
            SoundType::GrowlCrow => 4, // growl_crow.mp3, growl_crow1.mp3, growl_crow2.mp3, growl_crow3.mp3
            SoundType::GrowlTern => 4, // growl_tern.mp3, growl_tern1.mp3, growl_tern2.mp3, growl_tern3.mp3
            SoundType::GrowlVole => 1, // growl_vole.mp3 (tiny squeak)
            SoundType::GrowlWolverine => 1, // growl_wolverine.mp3 (fierce snarl)
            SoundType::GrowlCaribou => 1, // growl_caribou.mp3 (snort/bellow when spooked or attacking)
            SoundType::GrowlPolarBear => 1, // growl_polar_bear.mp3 (deep roar when polar bears attack)
            SoundType::GrowlHare => 1, // growl_hare.mp3 (tiny squeak when hares are startled)
            SoundType::GrowlOwl => 1, // growl_owl.mp3 (hoot/screech when snowy owls attack)
            SoundType::GrowlShorebound => 7, // growl_shorebound.mp3, growl_shorebound1-6.mp3
            SoundType::GrowlShardkin => 4, // growl_shardkin.mp3, growl_shardkin1-3.mp3
            SoundType::GrowlDrownedWatch => 5, // growl_drowned_watch.mp3, growl_drowned_watch1-4.mp3
            SoundType::Walking => 4,
            SoundType::Swimming => 4,
            SoundType::FoundationWoodConstructed => 1,
            SoundType::FoundationWoodUpgraded => 1,
            SoundType::FoundationStoneUpgraded => 1,
            SoundType::FoundationMetalUpgraded => 1,
            SoundType::FoundationTwigDestroyed => 1,
            SoundType::ItemThrown => 1,
            SoundType::ErrorResources => 3, // error_resources.mp3, error_resources2.mp3, error_resources3.mp3
            SoundType::ErrorCantPickUpCauldron => 1, // error_cant_pick_up_cauldron.mp3 (single variation)
            SoundType::DoneCooking => 1,
            SoundType::DoneBurning => 1, // done_burning.mp3 (single variation)
            SoundType::SoupBoiling => 1, // soup_boiling.mp3 (single variation - looping sound)
            SoundType::ErrorJarPlacement => 1, // error_jar_placement.mp3 (single variation)
            SoundType::ErrorBrothNotCompatible => 1, // error_broth_not_compatible.mp3 (single variation)
            SoundType::DoorOpening => 1, // door_opening.mp3 (single variation)
            SoundType::BarbecueOn => 1, // barbecue_on.mp3 (single variation)
            SoundType::BarbecueOff => 1, // barbecue_off.mp3 (single variation)
            SoundType::ReloadBow => 1, // reload_bow.mp3 (single variation)
            SoundType::ReloadCrossbow => 1, // reload_crossbow.mp3 (single variation)
            SoundType::ReloadPistol => 1, // reload_pistol.mp3 (single variation)
            SoundType::CrowStealing => 1, // crow_stealing.mp3 (single variation)
            SoundType::CairnUnlock => 1, // cairn_unlock.mp3 (single variation)
            SoundType::GrassCut => 1, // grass_cut.mp3 (single variation)
            SoundType::SnorkelSubmerge => 1, // snorkel_submerge.mp3 (single variation)
            SoundType::SnorkelEmerge => 1, // snorkel_emerge.mp3 (single variation)
            SoundType::ErrorSeaweedAboveWater => 1, // error_seaweed_above_water.mp3 (single variation)
            SoundType::Stun => 1, // stun.mp3 (single variation)
            SoundType::ExplosiveFuseBabushka => 1, // explosive_fuse_babushka.mp3 (looping sound)
            SoundType::ExplosiveFuseMatriarch => 1, // explosive_fuse_matriarch.mp3 (looping sound)
            SoundType::Explosion => 1, // explosion.mp3 (single variation)
            SoundType::ExplosiveDud => 1, // explosive_dud.mp3 (single variation)
            SoundType::DoorDestroyed => 1, // door_destroyed.mp3 (single variation)
            SoundType::SovaMemoryShardTutorial => 1, // sova_memory_shard_tutorial.mp3 (SOVA tutorial - single)
            SoundType::SovaMemoryShard200Tutorial => 1, // sova_tutorial_memory_shard_200.mp3 (SOVA 200 shards warning - single)
            SoundType::TillDirt => 1, // till_dirt.mp3 (tilling soil with Stone Tiller)
            SoundType::ErrorTillingFailed => 1, // error_tilling_failed.mp3 (SOVA error for non-tillable ground)
            SoundType::ErrorTillingDirt => 1, // error_tilling_dirt.mp3 (SOVA error for already-tilled ground)
            SoundType::ErrorMobileCapability => 1, // sova_error_mobile_capability.mp3 (SOVA: mobile capability error - no pitch variation)
            SoundType::HostileDeath => 2, // death_hostile.mp3, death_hostile1.mp3 (2 variations for hostile NPC death)
            // Animal/creature death sounds
            SoundType::DeathWolf => 1, // death_wolf.mp3 (single variation)
            SoundType::DeathFox => 1, // death_fox.mp3 (single variation)
            SoundType::DeathCrab => 1, // death_crab.mp3 (single variation)
            SoundType::DeathWalrus => 1, // death_walrus.mp3 (single variation)
            SoundType::DeathTern => 1, // death_tern.mp3 (single variation)
            SoundType::DeathCrow => 1, // death_crow.mp3 (single variation)
            SoundType::DeathViper => 1, // death_viper.mp3 (single variation)
            SoundType::DeathVole => 1, // death_vole.mp3 (tiny squeak)
            SoundType::DeathWolverine => 1, // death_wolverine.mp3 (fierce snarl)
            SoundType::DeathCaribou => 1, // death_caribou.mp3 (caribou death bellow)
            SoundType::DeathPolarBear => 1, // death_polar_bear.mp3 (polar bear death roar)
            SoundType::DeathHare => 1, // death_hare.mp3 (tiny squeak when hares die)
            SoundType::DeathOwl => 1, // death_owl.mp3 (owl death screech)
            SoundType::DeathBee => 1, // death_bee.mp3 (small sizzle/poof when bee dies from fire)
            SoundType::DeathPlayer => 2, // death_player.mp3, death_player1.mp3 (2 variations)
            SoundType::AnimalBurrow => 1, // animal_burrow.mp3 (digging/burrowing sound)
            // Player feedback sounds
            SoundType::PlayerHurt => 3, // player_hurt.mp3, player_hurt1.mp3, player_hurt2.mp3 (grunts when hit)
            SoundType::Heartbeat=> 1, // heartbeat.mp3 (looping sound)
            SoundType::StopHeartbeat => 1, // Signal to stop heartbeat
            SoundType::Thunder => 4, // thunder.mp3, thunder1.mp3, thunder2.mp3, thunder3.mp3 (4 variations)
            SoundType::MashBerries => 1, // mash_berries.mp3 (single variation)
            SoundType::PulverizeFlour => 1, // pulverize_flour.mp3 (single variation)
            SoundType::ExtractQueenBee => 1, // extract_queen_bee.mp3 (single variation)
            SoundType::UnravelRope => 1, // unravel_rope.mp3 (single variation)
            SoundType::DroneFlying => 3, // plane_flying.mp3, plane_flying1.mp3, plane_flying2.mp3 (3 variations)
            SoundType::ChewingGum => 1, // chewing_gum.mp3 (single variation - continuous looping)
        }
    }

    /// Generate the full filename with random variation
    pub fn get_random_filename(&self, rng: &mut impl Rng) -> String {
        let base = self.get_base_filename();
        let variation_count = self.get_variation_count();
        
        if variation_count <= 1 {
            format!("{}.mp3", base)
        } else {
            let variation = rng.gen_range(0..variation_count);
            if variation == 0 {
                format!("{}.mp3", base)
            } else {
                format!("{}{}.mp3", base, variation)
            }
        }
    }
}

/// Sound event table - stores sound events for clients to process
#[table(accessor = sound_event, public)]
#[derive(Clone, Debug)]
pub struct SoundEvent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub sound_type: SoundType,
    pub filename: String,        // e.g., "tree_chop2.mp3"
    pub pos_x: f32,             // Position where sound occurs
    pub pos_y: f32,
    pub volume: f32,            // 0.0 to 1.0
    pub max_distance: f32,      // Maximum distance to hear sound
    pub triggered_by: Identity, // Player who triggered the sound
    pub timestamp: Timestamp,
    pub pitch_multiplier: f32,  // Pitch multiplier for sound variation (default 1.0)
    /// Velocity of sound source (px/sec) for Doppler effect. (0,0) = no Doppler.
    pub velocity_x: f32,
    pub velocity_y: f32,
}

/// Continuous sound table - tracks active looping sounds (campfires, lanterns, etc.)
#[table(accessor = continuous_sound, public)]
#[derive(Clone, Debug)]
pub struct ContinuousSound {
    #[primary_key]
    pub object_id: u64,         // ID of the object making the sound (campfire ID, lantern ID, etc.)
    pub sound_type: SoundType,  // Type of looping sound
    pub filename: String,       // e.g., "campfire_looping.mp3"
    pub pos_x: f32,            // Position where sound occurs
    pub pos_y: f32,
    pub volume: f32,           // Volume level
    pub max_distance: f32,     // Maximum distance to hear sound
    pub is_active: bool,       // Whether the sound should be playing
    pub created_at: Timestamp, // When this continuous sound was created
    pub updated_at: Timestamp, // Last time this sound was updated
}

// --- Sound Event Cleanup System ---

/// Schedule table for cleaning up old sound events
#[table(accessor = sound_event_cleanup_schedule, scheduled(cleanup_old_sound_events))]
#[derive(Clone, Debug)]
pub struct SoundEventCleanupSchedule {
    #[primary_key]
    #[auto_inc]
    pub schedule_id: u64,
    pub scheduled_at: ScheduleAt,
}

/// Schedule table for delayed thunder sound (0.5-2.5s after lightning flash)
/// chunk_index is used to emit positional sound so only players within range hear it
#[table(accessor = thunder_sound_schedule, scheduled(emit_delayed_thunder_sound))]
#[derive(Clone, Debug)]
pub struct ThunderSoundSchedule {
    #[primary_key]
    #[auto_inc]
    pub schedule_id: u64,
    pub scheduled_at: ScheduleAt,
    pub chunk_index: u32,
}

/// Clean up sound events older than 5 seconds to prevent table bloat
#[reducer]
pub fn cleanup_old_sound_events(ctx: &ReducerContext, _args: SoundEventCleanupSchedule) -> Result<(), String> {
    // Security check - only allow scheduler to run this
    if ctx.sender() != ctx.identity() {
        return Err("Sound event cleanup can only be run by scheduler".to_string());
    }

    let sound_events_table = ctx.db.sound_event();
    
    // PERFORMANCE: Early exit if no sound events exist
    if sound_events_table.iter().next().is_none() {
        return Ok(());
    }

    let cutoff_time = ctx.timestamp - TimeDuration::from_micros(10_000_000); // 10 seconds - ensures clients have time to process SOVA/tutorial sounds
    let old_events: Vec<u64> = sound_events_table.iter()
        .filter(|event| event.timestamp < cutoff_time)
        .map(|event| event.id)
        .collect();

    let removed_count = old_events.len();
    for event_id in old_events {
        sound_events_table.id().delete(event_id);
    }

    if removed_count > 0 {
        log::info!("Cleaned up {} old sound events", removed_count);
    }

    Ok(())
}

/// Emit thunder sound when scheduled (called 0.5-2.5s after lightning flash).
/// Uses positional sound at chunk center so only players within THUNDER_HEARING_CHUNKS hear it.
#[reducer]
pub fn emit_delayed_thunder_sound(ctx: &ReducerContext, args: ThunderSoundSchedule) -> Result<(), String> {
    if ctx.sender() != ctx.identity() {
        return Err("Delayed thunder sound can only be run by scheduler".to_string());
    }
    emit_thunder_sound_at_chunk(ctx, args.chunk_index, 1.2);
    Ok(())
}

/// Schedule thunder sound to play 0.5-2.5 seconds from now (simulates sound travel delay).
/// chunk_index is used to emit positional sound so only players within range hear it.
pub fn schedule_delayed_thunder_sound(ctx: &ReducerContext, chunk_index: u32, rng: &mut impl Rng) -> Result<(), String> {
    // Random delay 0.5-2.5 seconds (sound travels ~343 m/s, lightning is visible instantly)
    let delay_secs = 0.5 + rng.gen::<f32>() * 2.0;
    let delay_micros = (delay_secs * 1_000_000.0) as i64;
    let scheduled_time = ctx.timestamp + TimeDuration::from_micros(delay_micros);

    let schedule = ThunderSoundSchedule {
        schedule_id: 0,
        scheduled_at: ScheduleAt::Time(scheduled_time),
        chunk_index,
    };

    match ctx.db.thunder_sound_schedule().try_insert(schedule) {
        Ok(_) => Ok(()),
        Err(e) => {
            log::error!("Failed to schedule delayed thunder sound: {:?}", e);
            Err("Failed to schedule delayed thunder sound".to_string())
        }
    }
}

// --- Public API Functions ---

/// Emit a sound event at a specific position
/// This is the main function other modules should use
pub fn emit_sound_at_position(
    ctx: &ReducerContext,
    sound_type: SoundType,
    pos_x: f32,
    pos_y: f32,
    volume: f32,
    triggered_by: Identity,
) -> Result<(), String> {
    emit_sound_at_position_with_distance(ctx, sound_type, pos_x, pos_y, volume, 500.0, triggered_by)
}

/// Emit a sound event with custom max hearing distance
pub fn emit_sound_at_position_with_distance(
    ctx: &ReducerContext,
    sound_type: SoundType,
    pos_x: f32,
    pos_y: f32,
    volume: f32,
    max_distance: f32,
    triggered_by: Identity,
) -> Result<(), String> {
    emit_sound_at_position_with_distance_and_velocity(
        ctx, sound_type, pos_x, pos_y, volume, max_distance, triggered_by, 0.0, 0.0,
    )
}

/// Emit a sound event with velocity for Doppler effect (e.g. flying drone)
pub fn emit_sound_at_position_with_distance_and_velocity(
    ctx: &ReducerContext,
    sound_type: SoundType,
    pos_x: f32,
    pos_y: f32,
    volume: f32,
    max_distance: f32,
    triggered_by: Identity,
    velocity_x: f32,
    velocity_y: f32,
) -> Result<(), String> {
    let mut rng = ctx.rng();
    let filename = sound_type.get_random_filename(&mut rng);
    
    let sound_event = SoundEvent {
        id: 0, // Auto-incremented
        sound_type,
        filename,
        pos_x,
        pos_y,
        volume: volume.max(0.0), // Only clamp minimum to 0, no maximum limit
        max_distance,
        triggered_by,
        timestamp: ctx.timestamp,
        pitch_multiplier: 1.0, // Default pitch multiplier
        velocity_x,
        velocity_y,
    };

    match ctx.db.sound_event().try_insert(sound_event) {
        Ok(inserted) => {
            log::debug!("Sound event {} emitted: {} at ({:.1}, {:.1}) by {:?}", 
                       inserted.id, inserted.filename, pos_x, pos_y, triggered_by);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to emit sound event: {:?}", e);
            Err("Failed to emit sound event".to_string())
        }
    }
}

/// Emit a sound at a player's position
pub fn emit_sound_at_player(
    ctx: &ReducerContext,
    sound_type: SoundType,
    player_id: Identity,
    volume: f32,
) -> Result<(), String> {
    use crate::player as PlayerTableTrait;
    
    let player = ctx.db.player().identity().find(player_id)
        .ok_or_else(|| "Player not found for sound emission".to_string())?;
    
    emit_sound_at_position(ctx, sound_type, player.position_x, player.position_y, volume, player_id)
}

/// Initialize the sound event cleanup system
pub fn init_sound_cleanup_system(ctx: &ReducerContext) -> Result<(), String> {
    let cleanup_interval = TimeDuration::from_micros(10_000_000); // Clean up every 10 seconds
    
    let cleanup_schedule = SoundEventCleanupSchedule {
        schedule_id: 0,
        scheduled_at: ScheduleAt::Interval(cleanup_interval), // Periodic cleanup
    };

    match ctx.db.sound_event_cleanup_schedule().try_insert(cleanup_schedule) {
        Ok(_) => {
            log::info!("Sound event cleanup system initialized");
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to initialize sound cleanup system: {:?}", e);
            Err("Failed to initialize sound cleanup system".to_string())
        }
    }
}

// --- Convenience Functions for Common Sound Events ---

/// Single line function to emit tree chopping sound
pub fn emit_tree_chop_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    // log::info!("🔊 EMITTING TREE CHOP SOUND at ({:.1}, {:.1}) by player {:?}", pos_x, pos_y, player_id);
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::TreeChop, pos_x, pos_y, 0.8, 1050.0, player_id) {
        log::error!("Failed to emit tree chop sound: {}", e);
    }
}

/// Single line function to emit tree creaking sound (when about to fall)
pub fn emit_tree_creaking_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    // log::info!("🔊 EMITTING TREE CREAKING SOUND at ({:.1}, {:.1}) by player {:?}", pos_x, pos_y, player_id);
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::TreeCreaking, pos_x, pos_y, 3.0, 1050.0, player_id) {
        log::error!("Failed to emit tree creaking sound: {}", e);
    }
}

/// Single line function to emit tree falling sound (when tree dies)
pub fn emit_tree_falling_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    // log::info!("🔊 EMITTING TREE FALLING SOUND at ({:.1}, {:.1}) by player {:?}", pos_x, pos_y, player_id);
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::TreeFalling, pos_x, pos_y, 0.75, 1050.0, player_id) {
        log::error!("Failed to emit tree falling sound: {}", e);
    }
}

/// Single line function to emit birds flapping sound (when tree is hit for the first time)
/// This sound indicates to the player that this is a "virgin" tree that hasn't been chopped before
pub fn emit_birds_flapping_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::BirdsFlapping, pos_x, pos_y, 1.0, 800.0, player_id) {
        log::error!("Failed to emit birds flapping sound: {}", e);
    }
}

/// Single line function to emit stone hit sound  
pub fn emit_stone_hit_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    // log::info!("🔊 EMITTING STONE HIT SOUND at ({:.1}, {:.1}) by player {:?}", pos_x, pos_y, player_id);
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::StoneHit, pos_x, pos_y, 0.8, 1050.0, player_id) {
        log::error!("Failed to emit stone hit sound: {}", e);
    }
}

/// Single line function to emit stone destroyed sound (when stone dies)
pub fn emit_stone_destroyed_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    // log::info!("🔊 EMITTING STONE DESTROYED SOUND at ({:.1}, {:.1}) by player {:?}", pos_x, pos_y, player_id);
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::StoneDestroyed, pos_x, pos_y, 1.3, 1050.0, player_id) {
        log::error!("Failed to emit stone destroyed sound: {}", e);
    }
}

/// Single line function to emit plant harvest sound (for picking up resource nodes)
pub fn emit_harvest_plant_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    // log::info!("🔊 EMITTING HARVEST PLANT SOUND at ({:.1}, {:.1}) by player {:?}", pos_x, pos_y, player_id);
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::HarvestPlant, pos_x, pos_y, 1.5, 525.0, player_id) {
        log::error!("Failed to emit harvest plant sound: {}", e);
    }
}

/// Single line function to emit plant seed sound (for planting seeds)
pub fn emit_plant_seed_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    // log::info!("🔊 EMITTING PLANT SEED SOUND at ({:.1}, {:.1}) by player {:?}", pos_x, pos_y, player_id);
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::PlantSeed, pos_x, pos_y, 5.4, 525.0, player_id) {
        log::error!("Failed to emit plant seed sound: {}", e);
    }
}

/// Single line function to emit pickup item sound (for picking up dropped items)
pub fn emit_pickup_item_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position(ctx, SoundType::PickupItem, pos_x, pos_y, 0.8, player_id) {
        log::warn!("Failed to emit pickup item sound: {}", e);
    }
}

/// Helper function to emit drinking water sound
pub fn emit_drinking_water_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position(ctx, SoundType::DrinkingWater, pos_x, pos_y, 0.7, player_id) {
        log::warn!("Failed to emit drinking water sound: {}", e);
    }
}

/// Helper function to emit throwing up sound (for salt water drinking or food poisoning)
pub fn emit_throwing_up_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position(ctx, SoundType::ThrowingUp, pos_x, pos_y, 0.8, player_id) {
        log::warn!("Failed to emit throwing up sound: {}", e);
    }
}

/// Helper function to emit eating food sound
pub fn emit_eating_food_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position(ctx, SoundType::EatingFood, pos_x, pos_y, 0.7, player_id) {
        log::warn!("Failed to emit eating food sound: {}", e);
    }
}

/// Helper function to emit watering crops sound
pub fn emit_watering_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position(ctx, SoundType::WateringCrops, pos_x, pos_y, 0.8, player_id) {
        log::warn!("Failed to emit watering sound: {}", e);
    }
}

/// Helper function to emit filling container sound
pub fn emit_filling_container_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position(ctx, SoundType::FillingContainer, pos_x, pos_y, 1.3, player_id) {
        log::warn!("Failed to emit filling container sound: {}", e);
    }
}

/// Emit successful repair sound
pub fn emit_repair_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    // log::info!("🔧 EMITTING REPAIR SOUND at ({:.1}, {:.1}) by player {:?}", pos_x, pos_y, player_id);
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::Repair, pos_x, pos_y, 1.2, 525.0, player_id) {
        log::error!("Failed to emit repair sound: {}", e);
    }
}

/// Emit repair failure sound (when repair fails due to insufficient resources, etc.)
pub fn emit_repair_fail_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::RepairFail, pos_x, pos_y, 1.0, 525.0, player_id);
}

/// Emit resource error sound (when player doesn't have enough resources for building/upgrading)
pub fn emit_error_resources_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ErrorResources, pos_x, pos_y, 1.0, 525.0, player_id);
}

/// Emit error sound when trying to pick up cauldron with contents
pub fn emit_error_cant_pick_up_cauldron_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ErrorCantPickUpCauldron, pos_x, pos_y, 1.0, 525.0, player_id);
}

/// Emit a melee hit sharp sound (for stone hatchet, stone pickaxe hitting players/corpses)
pub fn emit_melee_hit_sharp_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::MeleeHitSharp, pos_x, pos_y, 1.4, 700.0, player_id);
}

/// Emit a spear hit sound (for wooden/stone spear hitting players/corpses)
pub fn emit_spear_hit_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::SpearHit, pos_x, pos_y, 1.3, 650.0, player_id);
}

/// Emit a torch hit sound (for torch hitting players/corpses)
pub fn emit_torch_hit_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::TorchHit, pos_x, pos_y, 1.1, 600.0, player_id);
}

/// Emit a lit torch hit sound (for lit torch hitting players/corpses)
pub fn emit_torch_hit_lit_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::TorchHitLit, pos_x, pos_y, 1.2, 650.0, player_id);
}

/// Emit a torch hit sound combination (torch_hit + torch_hit_lit if lit)
pub fn emit_torch_hit_combined_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity, is_lit: bool) {
    // Always play the base torch hit sound
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::TorchHit, pos_x, pos_y, 1.1, 600.0, player_id);
    
    // If torch is lit, also play the lit version
    if is_lit {
        let _ = emit_sound_at_position_with_distance(ctx, SoundType::TorchHitLit, pos_x, pos_y, 1.2, 650.0, player_id);
    }
}

/// Emit a torch lighting sound
pub fn emit_light_torch_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::LightTorch, pos_x, pos_y, 1.0, 500.0, player_id);
}

/// Emit a torch extinguishing sound
pub fn emit_extinguish_torch_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ExtinguishTorch, pos_x, pos_y, 0.9, 450.0, player_id);
}

/// Emit a flashlight turning on sound
pub fn emit_flashlight_on_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::FlashlightOn, pos_x, pos_y, 1.0, 500.0, player_id);
}

/// Emit a flashlight turning off sound
pub fn emit_flashlight_off_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::FlashlightOff, pos_x, pos_y, 0.9, 450.0, player_id);
}

/// Emit a blunt melee hit sound (for blunt weapons hitting players/corpses)
pub fn emit_melee_hit_blunt_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::MeleeHitBlunt, pos_x, pos_y, 1.2, 600.0, player_id);
}

/// Emit a weapon swing sound (for all weapon swings)
pub fn emit_weapon_swing_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::WeaponSwing, pos_x, pos_y, 0.8, 400.0, player_id);
}

/// Emit an arrow hit sound (when arrows hit players/corpses)
pub fn emit_arrow_hit_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ArrowHit, pos_x, pos_y, 1.1, 550.0, player_id);
}

/// Emit a bow shooting sound (when hunting bow is fired)
pub fn emit_shoot_bow_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ShootBow, pos_x, pos_y, 1.0, 800.0, player_id);
}

/// Emit a crossbow shooting sound (when crossbow is fired)
pub fn emit_shoot_crossbow_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ShootCrossbow, pos_x, pos_y, 1.1, 850.0, player_id);
}

/// Emit a pistol shooting sound (when pistol is fired)
pub fn emit_shoot_pistol_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ShootPistol, pos_x, pos_y, 1.2, 900.0, player_id);
}

/// Emit a turret shooting sound (when turret fires a bullet)
pub fn emit_shoot_turret_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32) {
    // Turrets are triggered by the server/module, not a player
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ShootTurret, pos_x, pos_y, 1.3, 1000.0, ctx.identity());
}

/// Emit a bow reload sound (when hunting bow is nocked with an arrow)
pub fn emit_reload_bow_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ReloadBow, pos_x, pos_y, 0.8, 400.0, player_id);
}

/// Emit a crossbow reload sound (when crossbow is loaded with a bolt)
pub fn emit_reload_crossbow_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ReloadCrossbow, pos_x, pos_y, 0.9, 450.0, player_id);
}

/// Emit a pistol reload sound (when pistol magazine is loaded)
pub fn emit_reload_pistol_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ReloadPistol, pos_x, pos_y, 0.85, 400.0, player_id);
}

/// Emit a bandaging sound (when player starts bandaging)
pub fn emit_bandaging_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::Bandaging, pos_x, pos_y, 0.8, 300.0, player_id);
}

/// Stop bandaging sound (when bandaging is interrupted)
pub fn stop_bandaging_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::StopBandaging, pos_x, pos_y, 0.0, 300.0, player_id);
}

/// Emit a barrel hit sound (when barrels are hit but not destroyed)
pub fn emit_barrel_hit_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::BarrelHit, pos_x, pos_y, 1.0, 600.0, player_id);
}

/// Emit a barrel destroyed sound (when barrels are completely destroyed)
pub fn emit_barrel_destroyed_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::BarrelDestroyed, pos_x, pos_y, 1.3, 700.0, player_id);
}

/// Emit a trash hit sound (when barrel5.png variant 4 is hit)
pub fn emit_trash_hit_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::HitTrash, pos_x, pos_y, 1.0, 600.0, player_id);
}

/// Emit a wood hit sound (when barrel4.png variant 3 or wooden storage boxes are hit)
pub fn emit_wood_hit_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::HitWood, pos_x, pos_y, 1.0, 600.0, player_id);
}

/// Emit a box destroyed sound (when large/small wooden storage boxes or barrel4.png/barrel5.png are destroyed)
pub fn emit_box_destroyed_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::BoxDestroyed, pos_x, pos_y, 1.3, 700.0, player_id);
}

/// Emit a wolf growl sound (when wolves detect and start chasing players)
pub fn emit_wolf_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlWolf, pos_x, pos_y, 1.2, 800.0, player_id);
}

/// Emit a fox growl sound (when foxes detect and start attacking players)
pub fn emit_fox_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlFox, pos_x, pos_y, 1.0, 650.0, player_id);
}

/// Emit a snake/viper growl sound (when vipers detect and start approaching players)
pub fn emit_snake_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlSnake, pos_x, pos_y, 1.1, 700.0, player_id);
}

/// Emit a walrus growl sound (when walruses are disturbed or patrolling)
pub fn emit_walrus_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlWalrus, pos_x, pos_y, 1.3, 1000.0, player_id);
}

/// Emit a crab growl sound (when crabs detect and attack players)
pub fn emit_crab_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlCrab, pos_x, pos_y, 1.0, 400.0, player_id);
}

/// Emit a crow caw sound (when crows caw at players)
pub fn emit_crow_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlCrow, pos_x, pos_y, 1.0, 500.0, player_id);
}

/// Emit a tern screech sound (when terns screech at players)
pub fn emit_tern_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlTern, pos_x, pos_y, 1.0, 500.0, player_id);
}

/// Emit a vole squeak sound (tiny, high-pitched squeak when fleeing)
pub fn emit_vole_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlVole, pos_x, pos_y, 0.6, 200.0, player_id);
}

/// Emit a wolverine snarl sound (fierce, aggressive growl when attacking)
pub fn emit_wolverine_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlWolverine, pos_x, pos_y, 1.2, 600.0, player_id);
}

/// Emit a caribou snort/bellow sound (when spooked or attacking)
pub fn emit_caribou_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlCaribou, pos_x, pos_y, 1.0, 500.0, player_id);
}

/// Emit a polar bear roar sound (deep, powerful roar when attacking)
pub fn emit_polar_bear_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlPolarBear, pos_x, pos_y, 1.5, 800.0, player_id);
}

/// Emit a hare squeak sound (tiny squeak when startled)
pub fn emit_hare_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlHare, pos_x, pos_y, 0.5, 200.0, player_id);
}

/// Emit a snowy owl hoot/screech sound (when attacking)
pub fn emit_owl_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlOwl, pos_x, pos_y, 1.0, 500.0, player_id);
}

/// Emit a shorebound growl sound (night stalker hostile NPC)
pub fn emit_shorebound_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlShorebound, pos_x, pos_y, 1.3, 900.0, player_id);
}

/// Emit a shardkin chittering sound (night swarmer hostile NPC)
pub fn emit_shardkin_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlShardkin, pos_x, pos_y, 1.1, 700.0, player_id);
}

/// Emit a drowned watch roar sound (night brute hostile NPC)
pub fn emit_drowned_watch_growl_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::GrowlDrownedWatch, pos_x, pos_y, 1.5, 1200.0, player_id);
}

/// Emit animal burrow sound (when animals like voles dig underground)
pub fn emit_animal_burrow_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::AnimalBurrow, pos_x, pos_y, 0.8, 300.0, player_id);
}

/// Emit walking/footstep sound (when player moves)
pub fn emit_walking_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::Walking, pos_x, pos_y, 0.7, 400.0, player_id);
}

/// Emit walking/footstep sound for animals (with species-specific pitch variation)
pub fn emit_animal_walking_sound(
    ctx: &ReducerContext,
    pos_x: f32,
    pos_y: f32,
    species: crate::wild_animal_npc::AnimalSpecies,
) -> Result<(), String> {
    use crate::wild_animal_npc::AnimalSpecies;
    
    // Species-specific pitch multipliers (lower = deeper sound)
    let pitch_multiplier = match species {
        AnimalSpecies::ArcticWalrus => 0.7,  // Deep, heavy footsteps
        AnimalSpecies::TundraWolf => 0.9,    // Slightly lower than normal
        AnimalSpecies::CinderFox => 1.1,     // Slightly higher, lighter footsteps
        AnimalSpecies::CableViper => 1.0,    // Normal pitch
        AnimalSpecies::BeachCrab => 1.2,     // Higher pitch - small, scuttling footsteps
        AnimalSpecies::Tern => 1.3,          // High pitch - light bird
        AnimalSpecies::Crow => 1.2,          // Slightly high pitch - medium bird
        AnimalSpecies::Vole => 1.5,          // Very high pitch - tiny scurrying
        AnimalSpecies::Wolverine => 0.85,    // Medium-low pitch - aggressive predator
        AnimalSpecies::Caribou => 0.75,      // Low pitch - large heavy herbivore
        AnimalSpecies::SalmonShark => 0.8,   // Low pitch - large aquatic predator (underwater movement sounds)
        AnimalSpecies::Jellyfish => 1.0,     // Normal pitch - silent creature (no walking sounds)
        // Night hostile NPCs (use wolf sounds as placeholder)
        AnimalSpecies::Shorebound => 0.95,   // Fast stalker - slightly deeper
        AnimalSpecies::Shardkin => 1.15,     // Small swarmer - higher pitch
        AnimalSpecies::DrownedWatch => 0.6,  // Heavy brute - very deep
        // Bees - tiny insects, very high pitch
        AnimalSpecies::Bee => 1.6,           // Very high pitch - tiny buzzing insect
        // Alpine animals
        AnimalSpecies::PolarBear => 0.65,    // Very low pitch - massive apex predator
        AnimalSpecies::Hare => 1.4,          // High pitch - small prey animal
        AnimalSpecies::SnowyOwl => 1.25,     // Medium-high pitch - medium bird
    };
    
    let mut rng = ctx.rng();
    let filename = SoundType::Walking.get_random_filename(&mut rng);
    
    let sound_event = SoundEvent {
        id: 0, // Auto-incremented
        sound_type: SoundType::Walking,
        filename,
        pos_x,
        pos_y,
        volume: 0.7,
        max_distance: 400.0,
        triggered_by: ctx.identity(), // Animals triggered by server/module
        timestamp: ctx.timestamp,
        pitch_multiplier,
        velocity_x: 0.0,
        velocity_y: 0.0,
    };

    match ctx.db.sound_event().try_insert(sound_event) {
        Ok(inserted) => {
            log::debug!("Animal walking sound {} emitted: {} at ({:.1}, {:.1}) for {:?} (pitch: {:.2})", 
                       inserted.id, inserted.filename, pos_x, pos_y, species, pitch_multiplier);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to emit animal walking sound: {:?}", e);
            Err("Failed to emit animal walking sound".to_string())
        }
    }
}

/// Emit swimming sound (when player moves in water)
pub fn emit_swimming_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::Swimming, pos_x, pos_y, 0.8, 450.0, player_id);
}

/// Emit snorkel submerge sound (when player goes underwater with snorkel)
pub fn emit_snorkel_submerge_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::SnorkelSubmerge, pos_x, pos_y, 0.9, 400.0, player_id);
}

/// Emit snorkel emerge sound (when player surfaces from snorkeling)
pub fn emit_snorkel_emerge_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::SnorkelEmerge, pos_x, pos_y, 0.9, 400.0, player_id);
}

/// Emit error sound when trying to harvest seaweed while above water
pub fn emit_error_seaweed_above_water_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ErrorSeaweedAboveWater, pos_x, pos_y, 1.0, 525.0, player_id);
}

/// Emit a foundation wood constructed sound (when foundation is placed)
pub fn emit_foundation_wood_constructed_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::FoundationWoodConstructed, pos_x, pos_y, 1.0, 700.0, player_id);
}

/// Emit a foundation wood upgraded sound (when foundation upgraded to wood)
pub fn emit_foundation_wood_upgraded_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::FoundationWoodUpgraded, pos_x, pos_y, 1.0, 700.0, player_id);
}

/// Emit a foundation stone upgraded sound (when foundation upgraded to stone)
pub fn emit_foundation_stone_upgraded_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::FoundationStoneUpgraded, pos_x, pos_y, 1.0, 700.0, player_id);
}

/// Emit a foundation metal upgraded sound (when foundation upgraded to metal)
pub fn emit_foundation_metal_upgraded_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::FoundationMetalUpgraded, pos_x, pos_y, 1.0, 700.0, player_id);
}

/// Emit a twig foundation destroyed sound (when twig foundation is destroyed)
pub fn emit_foundation_twig_destroyed_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::FoundationTwigDestroyed, pos_x, pos_y, 1.0, 700.0, player_id);
}

/// Emit an item thrown sound (when a weapon/item is thrown)
pub fn emit_item_thrown_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    let _ = emit_sound_at_position_with_distance(ctx, SoundType::ItemThrown, pos_x, pos_y, 0.9, 500.0, player_id);
}

/// Emit a global sound that plays to all clients at full volume regardless of position
/// This is used for weather effects like lightning/thunder that should be heard everywhere
pub fn emit_global_sound(
    ctx: &ReducerContext,
    sound_type: SoundType,
    volume: f32,
) -> Result<(), String> {
    let mut rng = ctx.rng();
    let filename = sound_type.get_random_filename(&mut rng);
    
    let sound_event = SoundEvent {
        id: 0, // Auto-incremented
        sound_type,
        filename,
        pos_x: 0.0, // Position doesn't matter for global sounds
        pos_y: 0.0,
        volume: volume.max(0.0),
        max_distance: f32::MAX, // Infinite distance - heard everywhere
        triggered_by: ctx.identity(), // Triggered by the server/module itself
        timestamp: ctx.timestamp,
        pitch_multiplier: 1.0, // Default pitch multiplier
        velocity_x: 0.0,
        velocity_y: 0.0,
    };

    match ctx.db.sound_event().try_insert(sound_event) {
        Ok(inserted) => {
            log::info!("Global sound event {} emitted: {} at volume {:.1}", 
                       inserted.id, inserted.filename, volume);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to emit global sound event: {:?}", e);
            Err("Failed to emit global sound event".to_string())
        }
    }
}

/// Start heavy storm rain continuous sound globally
pub fn start_heavy_storm_rain_sound(ctx: &ReducerContext) -> Result<(), String> {
    const STORM_RAIN_OBJECT_ID: u64 = u64::MAX; // Use max value as a unique ID for global storm rain
    
    // Check if heavy storm rain sound is already active
    if ctx.db.continuous_sound().object_id().find(STORM_RAIN_OBJECT_ID).is_some() {
        log::debug!("Heavy storm rain sound already active");
        return Ok(());
    }
    
    let continuous_sound = ContinuousSound {
        object_id: STORM_RAIN_OBJECT_ID,
        sound_type: SoundType::HeavyStormRain,
        filename: "rain_heavy_storm.mp3".to_string(),
        pos_x: 0.0, // Global sound, position doesn't matter
        pos_y: 0.0,
        volume: 1.2, // Loud enough to be atmospheric
        max_distance: f32::MAX, // Infinite distance - heard everywhere
        is_active: true,
        created_at: ctx.timestamp,
        updated_at: ctx.timestamp,
    };
    
    match ctx.db.continuous_sound().try_insert(continuous_sound) {
        Ok(_) => {
            log::info!("🌧️ Started heavy storm rain sound globally");
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to start heavy storm rain sound: {:?}", e);
            Err("Failed to start heavy storm rain sound".to_string())
        }
    }
}

/// Stop heavy storm rain continuous sound
pub fn stop_heavy_storm_rain_sound(ctx: &ReducerContext) {
    const STORM_RAIN_OBJECT_ID: u64 = u64::MAX;
    
    if ctx.db.continuous_sound().object_id().delete(STORM_RAIN_OBJECT_ID) {
        log::info!("🌧️ Stopped heavy storm rain sound");
    } else {
        log::debug!("Heavy storm rain sound was not active");
    }
}

/// Start normal rain continuous sound globally (for light and moderate rain)
pub fn start_normal_rain_sound(ctx: &ReducerContext) -> Result<(), String> {
    const NORMAL_RAIN_OBJECT_ID: u64 = u64::MAX - 1; // Use max-1 value as a unique ID for global normal rain
    
    // Check if normal rain sound is already active
    if ctx.db.continuous_sound().object_id().find(NORMAL_RAIN_OBJECT_ID).is_some() {
        log::debug!("Normal rain sound already active");
        return Ok(());
    }
    
    let continuous_sound = ContinuousSound {
        object_id: NORMAL_RAIN_OBJECT_ID,
        sound_type: SoundType::NormalRain,
        filename: "rain_normal.mp3".to_string(),
        pos_x: 0.0, // Global sound, position doesn't matter
        pos_y: 0.0,
        volume: 0.8, // Quieter than heavy storm rain
        max_distance: f32::MAX, // Infinite distance - heard everywhere
        is_active: true,
        created_at: ctx.timestamp,
        updated_at: ctx.timestamp,
    };
    
    match ctx.db.continuous_sound().try_insert(continuous_sound) {
        Ok(_) => {
            log::info!("🌦️ Started normal rain sound globally");
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to start normal rain sound: {:?}", e);
            Err("Failed to start normal rain sound".to_string())
        }
    }
}

/// Stop normal rain continuous sound
pub fn stop_normal_rain_sound(ctx: &ReducerContext) {
    const NORMAL_RAIN_OBJECT_ID: u64 = u64::MAX - 1;
    
    if ctx.db.continuous_sound().object_id().delete(NORMAL_RAIN_OBJECT_ID) {
        log::info!("🌦️ Stopped normal rain sound");
    } else {
        log::debug!("Normal rain sound was not active");
    }
}

// --- Continuous/Looping Sound Management ---

/// Start a continuous looping sound for an object
pub fn start_continuous_sound(
    ctx: &ReducerContext,
    object_id: u64,
    sound_type: SoundType,
    pos_x: f32,
    pos_y: f32,
    volume: f32,
    max_distance: f32,
) -> Result<(), String> {
    let mut rng = ctx.rng();
    let filename = sound_type.get_random_filename(&mut rng);
    let continuous_sounds_table = ctx.db.continuous_sound();
    
    // Check if a continuous sound already exists for this object
    if let Some(mut existing_sound) = continuous_sounds_table.object_id().find(object_id) {
        // Update the existing sound instead of inserting a new one
        existing_sound.sound_type = sound_type;
        existing_sound.filename = filename.clone();
        existing_sound.pos_x = pos_x;
        existing_sound.pos_y = pos_y;
        existing_sound.volume = volume.max(0.0);
        existing_sound.max_distance = max_distance;
        existing_sound.is_active = true;
        existing_sound.updated_at = ctx.timestamp;
        
        continuous_sounds_table.object_id().update(existing_sound);
        // log::info!("🔊 RESTARTED CONTINUOUS SOUND: {} for object {} at ({:.1}, {:.1})", 
        //           filename, object_id, pos_x, pos_y);
        Ok(())
    } else {
        // Create a new continuous sound entry
        let continuous_sound = ContinuousSound {
            object_id,
            sound_type, 
            filename: filename.clone(),
            pos_x,
            pos_y,
            volume: volume.max(0.0),
            max_distance,
            is_active: true,
            created_at: ctx.timestamp,
            updated_at: ctx.timestamp,
        };

        match continuous_sounds_table.try_insert(continuous_sound) {
            Ok(_) => {
                // log::info!("🔊 STARTED NEW CONTINUOUS SOUND: {} for object {} at ({:.1}, {:.1})", 
                //           filename, object_id, pos_x, pos_y);
                Ok(())
            }
            Err(e) => {
                log::error!("Failed to start continuous sound for object {}: {:?}", object_id, e);
                Err("Failed to start continuous sound".to_string())
            }
        }
    }
}

/// Stop a continuous looping sound for an object
pub fn stop_continuous_sound(ctx: &ReducerContext, object_id: u64) -> Result<(), String> {
    let continuous_sounds_table = ctx.db.continuous_sound();
    
    if let Some(mut sound) = continuous_sounds_table.object_id().find(object_id) {
        sound.is_active = false;
        sound.updated_at = ctx.timestamp;
        continuous_sounds_table.object_id().update(sound);
        // log::info!("🔊 STOPPED CONTINUOUS SOUND for object {}", object_id);
        Ok(())
    } else {
        log::warn!("Attempted to stop continuous sound for object {} but it wasn't found", object_id);
        Ok(()) // Don't error if sound doesn't exist
    }
}

/// Update the position of a continuous sound (for moving objects)
pub fn update_continuous_sound_position(
    ctx: &ReducerContext,
    object_id: u64,
    pos_x: f32,
    pos_y: f32,
) -> Result<(), String> {
    let continuous_sounds_table = ctx.db.continuous_sound();
    
    if let Some(mut sound) = continuous_sounds_table.object_id().find(object_id) {
        if sound.pos_x != pos_x || sound.pos_y != pos_y {
            sound.pos_x = pos_x;
            sound.pos_y = pos_y;
            sound.updated_at = ctx.timestamp;
            continuous_sounds_table.object_id().update(sound);
            log::debug!("Updated continuous sound position for object {} to ({:.1}, {:.1})", object_id, pos_x, pos_y);
        }
        Ok(())
    } else {
        log::warn!("Attempted to update position for continuous sound object {} but it wasn't found", object_id);
        Ok(()) // Don't error if sound doesn't exist
    }
}

/// Remove a continuous sound completely (when object is deleted)
pub fn remove_continuous_sound(ctx: &ReducerContext, object_id: u64) -> Result<(), String> {
    let continuous_sounds_table = ctx.db.continuous_sound();
    
    if continuous_sounds_table.object_id().delete(object_id) {
        // log::info!("🔊 REMOVED CONTINUOUS SOUND for object {}", object_id);
    } else {
        log::debug!("Attempted to remove continuous sound for object {} but it wasn't found", object_id);
    }
    Ok(())
}

// --- Convenience Functions for Campfire and Lantern Sounds ---

// Helper function to create unique object IDs to prevent conflicts between different object types
fn create_unique_object_id(object_type: &str, object_id: u64) -> u64 {
    // Use a simple hash-based approach to create unique IDs
    // This ensures campfire ID 1 and lantern ID 1 don't conflict
    let type_hash = match object_type {
        "campfire" => 1_000_000_000_u64, // Campfires start at 1 billion
        "lantern" => 2_000_000_000_u64,  // Lanterns start at 2 billion
        "broth_pot" => 3_000_000_000_u64, // Broth pots start at 3 billion
        "barbecue" => 4_000_000_000_u64, // Barbecues start at 4 billion
        "beehive" => 5_000_000_000_u64,  // Beehives start at 5 billion
        "explosive" => 6_000_000_000_u64, // Explosives start at 6 billion
        "chewing_gum" => 8_000_000_000_u64, // Chewing gum effects start at 8 billion (effect_id as object_id)
        _ => 0_u64, // Default for unknown types
    };
    type_hash + object_id
}

/// Start campfire looping sound
pub fn start_campfire_sound(ctx: &ReducerContext, campfire_id: u64, pos_x: f32, pos_y: f32) {
    let unique_id = create_unique_object_id("campfire", campfire_id);
    log::info!("🔥 STARTING CAMPFIRE SOUND for campfire {} (unique_id: {}) at ({:.1}, {:.1})", 
              campfire_id, unique_id, pos_x, pos_y);
    if let Err(e) = start_continuous_sound(ctx, unique_id, SoundType::CampfireLooping, pos_x, pos_y, 1.0, 525.0) {
        log::error!("Failed to start campfire sound: {}", e);
    }
}

/// Stop campfire looping sound
pub fn stop_campfire_sound(ctx: &ReducerContext, campfire_id: u64) {
    let unique_id = create_unique_object_id("campfire", campfire_id);
    log::info!("🔥 STOPPING CAMPFIRE SOUND for campfire {} (unique_id: {})", campfire_id, unique_id);
    if let Err(e) = stop_continuous_sound(ctx, unique_id) {
        log::error!("Failed to stop campfire sound: {}", e);
    }
}

/// Start barbecue looping sound
pub fn start_barbecue_sound(ctx: &ReducerContext, barbecue_id: u64, pos_x: f32, pos_y: f32) {
    let unique_id = create_unique_object_id("barbecue", barbecue_id);
    log::info!("🔥 STARTING BARBECUE SOUND for barbecue {} (unique_id: {}) at ({:.1}, {:.1})", 
              barbecue_id, unique_id, pos_x, pos_y);
    if let Err(e) = start_continuous_sound(ctx, unique_id, SoundType::CampfireLooping, pos_x, pos_y, 1.0, 525.0) {
        log::error!("Failed to start barbecue sound: {}", e);
    }
}

/// Stop barbecue looping sound
pub fn stop_barbecue_sound(ctx: &ReducerContext, barbecue_id: u64) {
    let unique_id = create_unique_object_id("barbecue", barbecue_id);
    log::info!("🔥 STOPPING BARBECUE SOUND for barbecue {} (unique_id: {})", barbecue_id, unique_id);
    if let Err(e) = stop_continuous_sound(ctx, unique_id) {
        log::error!("Failed to stop barbecue sound: {}", e);
    }
}

/// Start lantern looping sound
pub fn start_lantern_sound(ctx: &ReducerContext, lantern_id: u64, pos_x: f32, pos_y: f32) {
    let unique_id = create_unique_object_id("lantern", lantern_id);
    log::info!("🏮 STARTING LANTERN SOUND for lantern {} (unique_id: {}) at ({:.1}, {:.1})", 
              lantern_id, unique_id, pos_x, pos_y);
    if let Err(e) = start_continuous_sound(ctx, unique_id, SoundType::LanternLooping, pos_x, pos_y, 1.0, 525.0) {
        log::error!("Failed to start lantern sound: {}", e);
    }
}

/// Stop lantern looping sound
pub fn stop_lantern_sound(ctx: &ReducerContext, lantern_id: u64) {
    let unique_id = create_unique_object_id("lantern", lantern_id);
    log::info!("🏮 STOPPING LANTERN SOUND for lantern {} (unique_id: {})", lantern_id, unique_id);
    if let Err(e) = stop_continuous_sound(ctx, unique_id) {
        log::error!("Failed to stop lantern sound: {}", e);
    }
}

/// Volume for beehive container sounds (wild + player-placed). Bees inside hives are muffled.
/// Actual bee NPCs emit stronger buzzing when flying - client handles that.
const BEEHIVE_CONTAINER_VOLUME: f32 = 0.5;
const BEEHIVE_CONTAINER_MAX_DISTANCE: f32 = 525.0;

/// Start beehive buzzing sound (when Queen Bee is present or bees guard a wild hive).
/// Uses attenuated volume (50%) since bees are inside the hive structure - actual bee NPCs
/// emit the stronger sound when flying.
pub fn start_beehive_sound(ctx: &ReducerContext, beehive_id: u64, pos_x: f32, pos_y: f32) {
    let unique_id = create_unique_object_id("beehive", beehive_id);
    log::info!("🐝 STARTING BEEHIVE SOUND for beehive {} (unique_id: {}) at ({:.1}, {:.1})", 
              beehive_id, unique_id, pos_x, pos_y);
    if let Err(e) = start_continuous_sound(
        ctx,
        unique_id,
        SoundType::BeehiveLooping,
        pos_x,
        pos_y,
        BEEHIVE_CONTAINER_VOLUME,
        BEEHIVE_CONTAINER_MAX_DISTANCE,
    ) {
        log::error!("Failed to start beehive sound: {}", e);
    }
}

/// Stop beehive buzzing sound (when Queen Bee is removed)
pub fn stop_beehive_sound(ctx: &ReducerContext, beehive_id: u64) {
    let unique_id = create_unique_object_id("beehive", beehive_id);
    log::info!("🐝 STOPPING BEEHIVE SOUND for beehive {} (unique_id: {})", beehive_id, unique_id);
    if let Err(e) = stop_continuous_sound(ctx, unique_id) {
        log::error!("Failed to stop beehive sound: {}", e);
    }
}

/// Unique object IDs for village campfires (always burning, emit continuous crackling)
const FISHING_VILLAGE_CAMPFIRE_OBJECT_ID: u64 = 7_000_000_001;
const HUNTING_VILLAGE_CAMPFIRE_OBJECT_ID: u64 = 7_000_000_002;

/// Start continuous campfire sound for fishing/hunting village communal campfires (fv_campfire doodad)
/// These are always burning and emit the same crackling sound as player-placed campfires
pub fn start_village_campfire_sound(
    ctx: &ReducerContext,
    village_type: VillageCampfireType,
    pos_x: f32,
    pos_y: f32,
) {
    let object_id = match village_type {
        VillageCampfireType::FishingVillage => FISHING_VILLAGE_CAMPFIRE_OBJECT_ID,
        VillageCampfireType::HuntingVillage => HUNTING_VILLAGE_CAMPFIRE_OBJECT_ID,
    };
    let village_name = match village_type {
        VillageCampfireType::FishingVillage => "Fishing Village",
        VillageCampfireType::HuntingVillage => "Hunting Village",
    };
    log::info!("🔥 Starting campfire sound for {} at ({:.1}, {:.1})", village_name, pos_x, pos_y);
    if let Err(e) = start_continuous_sound(ctx, object_id, SoundType::CampfireLooping, pos_x, pos_y, 1.0, 525.0) {
        log::error!("Failed to start {} campfire sound: {}", village_name, e);
    }
}

/// Village campfire type for sound registration
pub enum VillageCampfireType {
    FishingVillage,
    HuntingVillage,
}

/// Start soup boiling looping sound for a broth pot
pub fn start_soup_boiling_sound(ctx: &ReducerContext, broth_pot_id: u32, pos_x: f32, pos_y: f32) {
    let unique_id = create_unique_object_id("broth_pot", broth_pot_id as u64);
    if let Err(e) = start_continuous_sound(ctx, unique_id, SoundType::SoupBoiling, pos_x, pos_y, 1.0, 525.0) {
        log::error!("Failed to start soup boiling sound: {}", e);
    }
}

/// Stop soup boiling looping sound for a broth pot
pub fn stop_soup_boiling_sound(ctx: &ReducerContext, broth_pot_id: u32) {
    let unique_id = create_unique_object_id("broth_pot", broth_pot_id as u64);
    if let Err(e) = stop_continuous_sound(ctx, unique_id) {
        log::error!("Failed to stop soup boiling sound: {}", e);
    }
}

/// Emit error jar placement sound (when trying to place jar back in output slot)
pub fn emit_error_jar_placement_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position(ctx, SoundType::ErrorJarPlacement, pos_x, pos_y, 1.0, player_id) {
        log::warn!("Failed to emit error jar placement sound: {}", e);
    }
}

/// Emit error broth not compatible sound (when trying to place incompatible item in broth pot)
pub fn emit_error_broth_not_compatible_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position(ctx, SoundType::ErrorBrothNotCompatible, pos_x, pos_y, 1.0, player_id) {
        log::warn!("Failed to emit error broth not compatible sound: {}", e);
    }
}

/// Emit done cooking sound (when items finish cooking in campfire/furnace)
pub fn emit_done_cooking_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::DoneCooking, pos_x, pos_y, 1.2, 700.0, player_id) {
        log::warn!("Failed to emit done cooking sound: {}", e);
    }
}

/// Emit done burning sound (when cooked food becomes burnt in campfire/barbecue)
pub fn emit_done_burning_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::DoneBurning, pos_x, pos_y, 1.2, 700.0, player_id) {
        log::warn!("Failed to emit done burning sound: {}", e);
    }
}

/// Emit door opening sound (when a door is opened)
pub fn emit_door_opening_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::DoorOpening, pos_x, pos_y, 1.0, 600.0, player_id) {
        log::warn!("Failed to emit door opening sound: {}", e);
    }
}

/// Emit barbecue turning on sound
pub fn emit_barbecue_on_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::BarbecueOn, pos_x, pos_y, 1.0, 600.0, player_id) {
        log::warn!("Failed to emit barbecue on sound: {}", e);
    }
}

/// Emit barbecue turning off sound
pub fn emit_barbecue_off_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::BarbecueOff, pos_x, pos_y, 1.0, 600.0, player_id) {
        log::warn!("Failed to emit barbecue off sound: {}", e);
    }
}

/// Emit crow stealing sound (when a crow successfully steals from a player)
pub fn emit_crow_stealing_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, victim_player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::CrowStealing, pos_x, pos_y, 1.2, 700.0, victim_player_id) {
        log::warn!("Failed to emit crow stealing sound: {}", e);
    }
}

/// Emit cairn unlock sound (when a player discovers a new cairn for the first time)
/// Note: Currently the cairn_unlock sound is handled client-side for instant feedback.
/// This function is kept for potential future server-side use.
#[allow(dead_code)]
pub fn emit_cairn_unlock_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::CairnUnlock, pos_x, pos_y, 1.5, 500.0, player_id) {
        log::warn!("Failed to emit cairn unlock sound: {}", e);
    }
}

/// Emit stun sound (when a player is stunned by a blunt weapon)
pub fn emit_stun_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::Stun, pos_x, pos_y, 1.0, 800.0, player_id) {
        log::warn!("Failed to emit stun sound: {}", e);
    }
}

/// Start explosive fuse looping sound (same sound for all explosive types)
pub fn start_explosive_fuse_sound(ctx: &ReducerContext, explosive_id: u64, pos_x: f32, pos_y: f32) {
    let unique_id = create_unique_object_id("explosive", explosive_id);
    log::info!("💣 STARTING EXPLOSIVE FUSE SOUND for explosive {} (unique_id: {}) at ({:.1}, {:.1})", 
              explosive_id, unique_id, pos_x, pos_y);
    if let Err(e) = start_continuous_sound(ctx, unique_id, SoundType::ExplosiveFuseBabushka, pos_x, pos_y, 1.0, 500.0) {
        log::error!("Failed to start explosive fuse sound: {}", e);
    }
}

/// Stop explosive fuse looping sound
pub fn stop_explosive_fuse_sound(ctx: &ReducerContext, explosive_id: u64) {
    let unique_id = create_unique_object_id("explosive", explosive_id);
    log::info!("💣 STOPPING EXPLOSIVE FUSE SOUND for explosive {} (unique_id: {})", explosive_id, unique_id);
    if let Err(e) = remove_continuous_sound(ctx, unique_id) {
        log::error!("Failed to stop explosive fuse sound: {}", e);
    }
}

/// Volume and max distance for chewing gum sound (audible to nearby players)
const CHEWING_GUM_VOLUME: f32 = 1.0;
const CHEWING_GUM_MAX_DISTANCE: f32 = 400.0;

/// Start chewing gum looping sound (continuous from player position)
pub fn start_chewing_gum_sound(ctx: &ReducerContext, effect_id: u64, pos_x: f32, pos_y: f32) {
    let unique_id = create_unique_object_id("chewing_gum", effect_id);
    log::info!("🫧 STARTING CHEWING GUM SOUND for effect {} (unique_id: {}) at ({:.1}, {:.1})", effect_id, unique_id, pos_x, pos_y);
    if let Err(e) = start_continuous_sound(ctx, unique_id, SoundType::ChewingGum, pos_x, pos_y, CHEWING_GUM_VOLUME, CHEWING_GUM_MAX_DISTANCE) {
        log::error!("Failed to start chewing gum sound: {}", e);
    }
}

/// Stop chewing gum looping sound
pub fn stop_chewing_gum_sound(ctx: &ReducerContext, effect_id: u64) {
    let unique_id = create_unique_object_id("chewing_gum", effect_id);
    log::info!("🫧 STOPPING CHEWING GUM SOUND for effect {} (unique_id: {})", effect_id, unique_id);
    if let Err(e) = stop_continuous_sound(ctx, unique_id) {
        log::error!("Failed to stop chewing gum sound: {}", e);
    }
}

/// Update chewing gum sound position (call each tick while effect is active)
pub fn update_chewing_gum_sound_position(ctx: &ReducerContext, effect_id: u64, pos_x: f32, pos_y: f32) {
    let unique_id = create_unique_object_id("chewing_gum", effect_id);
    if let Err(e) = update_continuous_sound_position(ctx, unique_id, pos_x, pos_y) {
        log::error!("Failed to update chewing gum sound position: {}", e);
    }
}

/// Emit explosion sound (loud, audible from far away)
pub fn emit_explosion_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::Explosion, pos_x, pos_y, 2.0, 2000.0, player_id) {
        log::warn!("Failed to emit explosion sound: {}", e);
    }
}

/// Emit explosive dud sound (fizzle when explosive fails to detonate)
pub fn emit_explosive_dud_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::ExplosiveDud, pos_x, pos_y, 1.0, 200.0, player_id) {
        log::warn!("Failed to emit explosive dud sound: {}", e);
    }
}

/// Emit door destroyed sound (when door is destroyed)
pub fn emit_door_destroyed_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::DoorDestroyed, pos_x, pos_y, 1.0, 400.0, player_id) {
        log::warn!("Failed to emit door destroyed sound: {}", e);
    }
}

/// Emit SOVA memory shard tutorial sound (first time player picks up a memory shard)
/// This triggers a full SOVA voice explanation about memory shards and the insanity system
pub fn emit_sova_memory_shard_tutorial_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    // This sound is played at the player's location but with large distance so they always hear it
    // The client will also add a SOVA chat message when this sound is received
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::SovaMemoryShardTutorial, pos_x, pos_y, 1.0, 10000.0, player_id) {
        log::warn!("Failed to emit SOVA memory shard tutorial sound: {}", e);
    }
    log::info!("[SOVA Tutorial] Memory shard tutorial triggered for player {:?}", player_id);
}

/// Emit SOVA 200 memory shards tutorial sound (first time player holds 200+ shards)
/// Warns about mind instability, purple vision, dropping/storing shards, and using Memory Grid (G key)
pub fn emit_sova_memory_shard_200_tutorial_sound(ctx: &ReducerContext, pos_x: f32, pos_y: f32, player_id: Identity) {
    if let Err(e) = emit_sound_at_position_with_distance(ctx, SoundType::SovaMemoryShard200Tutorial, pos_x, pos_y, 1.0, 10000.0, player_id) {
        log::warn!("Failed to emit SOVA memory shard 200 tutorial sound: {}", e);
    }
    log::info!("[SOVA Tutorial] Memory shard 200 tutorial triggered for player {:?}", player_id);
}

// --- Client-Callable Rain Sound Reducers ---

/// Client-callable reducer to start heavy storm rain sound
#[spacetimedb::reducer]
pub fn start_heavy_storm_rain_sound_reducer(ctx: &ReducerContext) -> Result<(), String> {
    log::info!("🌧️ Client {} requesting heavy storm rain sound", ctx.sender());
    start_heavy_storm_rain_sound(ctx)
}

/// Client-callable reducer to stop heavy storm rain sound
#[spacetimedb::reducer]
pub fn stop_heavy_storm_rain_sound_reducer(ctx: &ReducerContext) -> Result<(), String> {
    log::info!("🌧️ Client {} stopping heavy storm rain sound", ctx.sender());
    stop_heavy_storm_rain_sound(ctx);
    Ok(())
}

/// Client-callable reducer to start normal rain sound
#[spacetimedb::reducer]
pub fn start_normal_rain_sound_reducer(ctx: &ReducerContext) -> Result<(), String> {
    log::info!("🌦️ Client {} requesting normal rain sound", ctx.sender());
    start_normal_rain_sound(ctx)
}

/// Client-callable reducer to stop normal rain sound
#[spacetimedb::reducer]
pub fn stop_normal_rain_sound_reducer(ctx: &ReducerContext) -> Result<(), String> {
    log::info!("🌦️ Client {} stopping normal rain sound", ctx.sender());
    stop_normal_rain_sound(ctx);
    Ok(())
}

// ============================================================================
// THUNDER SOUND
// ============================================================================

/// Emit thunder sound globally (audible to all players regardless of position)
/// This uses the 11 thunder variations (thunder.mp3, thunder1.mp3 through thunder10.mp3)
pub fn emit_thunder_sound(ctx: &ReducerContext, volume: f32) {
    if let Err(e) = emit_global_sound(ctx, SoundType::Thunder, volume) {
        log::warn!("Failed to emit thunder sound: {}", e);
    }
}

/// Thunder hearing range in chunks - players beyond this don't hear the rumble
const THUNDER_HEARING_CHUNKS: f32 = 4.0;

/// Emit thunder sound at chunk position (only players within THUNDER_HEARING_CHUNKS hear it)
pub fn emit_thunder_sound_at_chunk(ctx: &ReducerContext, chunk_index: u32, volume: f32) {
    use crate::environment::{CHUNK_SIZE_PX, WORLD_WIDTH_CHUNKS};
    let chunk_x = (chunk_index % WORLD_WIDTH_CHUNKS) as f32;
    let chunk_y = (chunk_index / WORLD_WIDTH_CHUNKS) as f32;
    let pos_x = (chunk_x + 0.5) * CHUNK_SIZE_PX;
    let pos_y = (chunk_y + 0.5) * CHUNK_SIZE_PX;
    let max_distance = THUNDER_HEARING_CHUNKS * CHUNK_SIZE_PX;
    if let Err(e) = emit_sound_at_position_with_distance(
        ctx,
        SoundType::Thunder,
        pos_x,
        pos_y,
        volume,
        max_distance,
        ctx.identity(),
    ) {
        log::warn!("Failed to emit positional thunder sound: {}", e);
    }
}