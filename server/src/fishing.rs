use spacetimedb::{Identity, Timestamp, table, reducer, ReducerContext, SpacetimeType, log, Table};
use crate::items::InventoryItem;
use crate::player;
use crate::active_equipment::active_equipment;
use crate::items::{inventory_item, item_definition};
use crate::dropped_item::give_item_to_player_or_drop;
use crate::world_state::{world_state as WorldStateTableTrait, TimeOfDay, WeatherType, get_weather_for_position};
use rand::Rng;

// Import player progression table traits
use crate::player_progression::player_stats as PlayerStatsTableTrait;

// Fishing state tracking
#[derive(SpacetimeType)]
pub struct FishingState {
    pub is_fishing: bool,
    pub cast_timestamp: Option<Timestamp>,
    pub target_x: f32,
    pub target_y: f32,
    pub fishing_rod_item: String, // Name of the fishing rod being used
}

// Table to track active fishing sessions
#[table(name = fishing_session, public)]
pub struct FishingSession {
    #[primary_key]
    pub player_id: Identity,
    pub is_active: bool,
    pub cast_time: Timestamp,
    pub target_x: f32,
    pub target_y: f32,
    pub fishing_rod: String,
    pub has_bite: bool,
}

// Fish tier enum for categorizing fish rarity
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FishTier {
    Common,    // Tier 1: Twigfish, Herring, Smelt
    Uncommon,  // Tier 2: Greenling, Sculpin, Pacific Cod
    Rare,      // Tier 3: Dolly Varden, Rockfish, Steelhead
    Premium,   // Tier 4: Pink Salmon, Sockeye Salmon, King Salmon, Halibut
}

// Fish spawn time preference
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FishTimePreference {
    Any,           // Can be caught any time
    Day,           // Prefer daylight hours (Morning, Noon, Afternoon)
    Night,         // Prefer night hours (Night, Midnight)
    Twilight,      // Prefer twilight hours (TwilightMorning, TwilightEvening)
    DawnDusk,      // Prefer dawn/dusk specifically
    Dawn,          // Dawn only (for extremely rare fish)
}

// Fishing loot table entry with time-of-day preferences
#[derive(SpacetimeType, Clone, Debug)]
pub struct FishingLoot {
    pub item_name: String,
    pub min_quantity: u32,
    pub max_quantity: u32,
    pub drop_chance: f32, // 0.0 to 1.0 base weight for selection
    pub is_junk: bool,
}

// Fish weather preference (matches WeatherType variants)
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FishWeatherPreference {
    Any,           // No weather preference
    Clear,         // Prefers calm, clear conditions
    LightRain,     // Prefers light rain
    ModerateRain,  // Prefers moderate rain
    HeavyRain,     // Prefers heavy rain
    HeavyStorm,    // Thrives in storms (the crazies)
}

// Fish entry with metadata for spawning logic
pub struct FishEntry {
    pub name: &'static str,
    pub tier: FishTier,
    pub time_preference: FishTimePreference,
    pub weather_preference: FishWeatherPreference, // NEW: Weather preference
    pub base_weight: f32,      // Base spawn weight within its tier
    pub deep_water_bonus: f32, // Extra weight when fishing in deep water (0.0 to 1.0)
}

// Get all available fish with their spawn parameters
fn get_fish_database() -> Vec<FishEntry> {
    vec![
        // === TIER 1: COMMON (Small Fish) ===
        FishEntry {
            name: "Raw Twigfish",
            tier: FishTier::Common,
            time_preference: FishTimePreference::Any,
            weather_preference: FishWeatherPreference::Any, // Catches anything
            base_weight: 1.0,
            deep_water_bonus: 0.0,
        },
        FishEntry {
            name: "Raw Herring",
            tier: FishTier::Common,
            time_preference: FishTimePreference::DawnDusk,
            weather_preference: FishWeatherPreference::LightRain, // Schooling fish surface during light rain
            base_weight: 0.9,
            deep_water_bonus: 0.1,
        },
        FishEntry {
            name: "Raw Smelt",
            tier: FishTier::Common,
            time_preference: FishTimePreference::Night,
            weather_preference: FishWeatherPreference::Clear, // Oily "candlefish" prefer calm nights
            base_weight: 0.8,
            deep_water_bonus: 0.2,
        },
        FishEntry {
            name: "Raw Black Katy Chiton",
            tier: FishTier::Common,
            time_preference: FishTimePreference::Any, // Found in intertidal zones at any time
            weather_preference: FishWeatherPreference::Clear, // Rocky areas prefer clear conditions
            base_weight: 0.7,
            deep_water_bonus: -0.3, // Prefers shallow/rocky areas, not deep water
        },
        FishEntry {
            name: "Raw Sea Urchin",
            tier: FishTier::Common,
            time_preference: FishTimePreference::Day, // More active during daylight
            weather_preference: FishWeatherPreference::Clear, // Rocky coastal areas prefer clear weather
            base_weight: 0.75,
            deep_water_bonus: -0.2, // Found in rocky shallow areas
        },
        FishEntry {
            name: "Raw Blue Mussel",
            tier: FishTier::Common,
            time_preference: FishTimePreference::Any, // Filter feeders, always present
            weather_preference: FishWeatherPreference::Any, // Abundant regardless of weather
            base_weight: 0.9, // Very common coastal shellfish
            deep_water_bonus: -0.4, // Strongly prefers shallow rocky areas near shore
        },
        
        // === TIER 2: UNCOMMON (Medium Fish) ===
        FishEntry {
            name: "Raw Greenling",
            tier: FishTier::Uncommon,
            time_preference: FishTimePreference::Day,
            weather_preference: FishWeatherPreference::Clear, // Rocky-bottom fish prefer clear days
            base_weight: 1.0,
            deep_water_bonus: 0.1,
        },
        FishEntry {
            name: "Raw Sculpin",
            tier: FishTier::Uncommon,
            time_preference: FishTimePreference::Night,
            weather_preference: FishWeatherPreference::HeavyStorm, // Bottom dwellers active during storms
            base_weight: 0.8,
            deep_water_bonus: 0.3,
        },
        FishEntry {
            name: "Raw Pacific Cod",
            tier: FishTier::Uncommon,
            time_preference: FishTimePreference::Any,
            weather_preference: FishWeatherPreference::ModerateRain, // Feed actively during steady rain
            base_weight: 0.7,
            deep_water_bonus: 0.4,
        },
        
        // === TIER 3: RARE (Large Fish) ===
        FishEntry {
            name: "Raw Dolly Varden",
            tier: FishTier::Rare,
            time_preference: FishTimePreference::Twilight,
            weather_preference: FishWeatherPreference::LightRain, // Char love misty conditions
            base_weight: 1.0,
            deep_water_bonus: 0.2,
        },
        FishEntry {
            name: "Raw Rockfish",
            tier: FishTier::Rare,
            time_preference: FishTimePreference::Night,
            weather_preference: FishWeatherPreference::HeavyStorm, // Deep dwellers rise during storms
            base_weight: 0.8,
            deep_water_bonus: 0.5, // Strongly prefers deep water
        },
        FishEntry {
            name: "Raw Steelhead",
            tier: FishTier::Rare,
            time_preference: FishTimePreference::DawnDusk,
            weather_preference: FishWeatherPreference::HeavyRain, // Run upstream during heavy rain
            base_weight: 0.7,
            deep_water_bonus: 0.3,
        },
        
        // === TIER 4: PREMIUM (Very Large/Rare Fish) ===
        FishEntry {
            name: "Raw Pink Salmon",
            tier: FishTier::Premium,
            time_preference: FishTimePreference::DawnDusk,
            weather_preference: FishWeatherPreference::ModerateRain, // Salmon active in steady rain
            base_weight: 1.0,
            deep_water_bonus: 0.3,
        },
        FishEntry {
            name: "Raw Sockeye Salmon",
            tier: FishTier::Premium,
            time_preference: FishTimePreference::Twilight,
            weather_preference: FishWeatherPreference::HeavyRain, // Red salmon run in heavy rain
            base_weight: 0.7,
            deep_water_bonus: 0.4,
        },
        FishEntry {
            name: "Raw King Salmon",
            tier: FishTier::Premium,
            time_preference: FishTimePreference::Dawn,
            weather_preference: FishWeatherPreference::HeavyStorm, // The legendary king appears in storms!
            base_weight: 0.4, // Very rare even at dawn
            deep_water_bonus: 0.5,
        },
        FishEntry {
            name: "Raw Halibut",
            tier: FishTier::Premium,
            time_preference: FishTimePreference::Any,
            weather_preference: FishWeatherPreference::Any, // Deep flatfish don't care about surface weather
            base_weight: 0.3, // Very rare but can be caught anytime
            deep_water_bonus: 0.8, // Strongly prefers deep water
        },
    ]
}

// Check if a fish's time preference matches the current time of day
fn fish_matches_time(time_pref: FishTimePreference, time_of_day: &TimeOfDay) -> bool {
    match time_pref {
        FishTimePreference::Any => true,
        FishTimePreference::Day => matches!(time_of_day, 
            TimeOfDay::Morning | TimeOfDay::Noon | TimeOfDay::Afternoon),
        FishTimePreference::Night => matches!(time_of_day, 
            TimeOfDay::Night | TimeOfDay::Midnight),
        FishTimePreference::Twilight => matches!(time_of_day, 
            TimeOfDay::TwilightMorning | TimeOfDay::TwilightEvening | TimeOfDay::Dawn | TimeOfDay::Dusk),
        FishTimePreference::DawnDusk => matches!(time_of_day, 
            TimeOfDay::Dawn | TimeOfDay::Dusk),
        FishTimePreference::Dawn => matches!(time_of_day, TimeOfDay::Dawn),
    }
}

// Calculate time-based multiplier for fish spawn weight
fn get_time_spawn_multiplier(time_pref: FishTimePreference, time_of_day: &TimeOfDay) -> f32 {
    if fish_matches_time(time_pref, time_of_day) {
        // Full weight during preferred time
        1.0
    } else {
        // Reduced weight outside preferred time (but still possible for most fish)
        match time_pref {
            FishTimePreference::Any => 1.0,
            FishTimePreference::Day | FishTimePreference::Night => 0.3, // 30% weight off-hours
            FishTimePreference::Twilight | FishTimePreference::DawnDusk => 0.15, // 15% weight off-hours
            FishTimePreference::Dawn => 0.05, // Only 5% chance outside dawn (extremely rare)
        }
    }
}

// Check if a fish's weather preference matches the current weather
fn fish_matches_weather(weather_pref: FishWeatherPreference, weather: &WeatherType) -> bool {
    match weather_pref {
        FishWeatherPreference::Any => true,
        FishWeatherPreference::Clear => matches!(weather, WeatherType::Clear),
        FishWeatherPreference::LightRain => matches!(weather, WeatherType::LightRain),
        FishWeatherPreference::ModerateRain => matches!(weather, WeatherType::ModerateRain),
        FishWeatherPreference::HeavyRain => matches!(weather, WeatherType::HeavyRain),
        FishWeatherPreference::HeavyStorm => matches!(weather, WeatherType::HeavyStorm),
    }
}

// Calculate weather-based multiplier for fish spawn weight
fn get_weather_spawn_multiplier(weather_pref: FishWeatherPreference, weather: &WeatherType) -> f32 {
    if fish_matches_weather(weather_pref, weather) {
        // Full bonus during exact preferred weather
        match weather_pref {
            FishWeatherPreference::Any => 1.0,
            FishWeatherPreference::Clear => 1.5,         // 50% bonus in clear weather
            FishWeatherPreference::LightRain => 1.6,     // 60% bonus in light rain
            FishWeatherPreference::ModerateRain => 1.8,  // 80% bonus in moderate rain
            FishWeatherPreference::HeavyRain => 2.0,     // 100% bonus in heavy rain
            FishWeatherPreference::HeavyStorm => 2.5,    // 150% bonus in storms (risk/reward!)
        }
    } else {
        // Partial bonus for adjacent weather conditions, reduced for non-adjacent
        match (weather_pref, weather) {
            // Any weather preference always gets 1.0
            (FishWeatherPreference::Any, _) => 1.0,
            
            // Clear fish: small penalty in light rain, bigger penalty in heavier rain
            (FishWeatherPreference::Clear, WeatherType::LightRain) => 0.7,
            (FishWeatherPreference::Clear, _) => 0.4,
            
            // Light rain fish: partial bonus in clear or moderate
            (FishWeatherPreference::LightRain, WeatherType::Clear) => 0.6,
            (FishWeatherPreference::LightRain, WeatherType::ModerateRain) => 1.2,
            (FishWeatherPreference::LightRain, _) => 0.4,
            
            // Moderate rain fish: partial bonus in light or heavy rain
            (FishWeatherPreference::ModerateRain, WeatherType::LightRain) => 1.2,
            (FishWeatherPreference::ModerateRain, WeatherType::HeavyRain) => 1.2,
            (FishWeatherPreference::ModerateRain, _) => 0.5,
            
            // Heavy rain fish: partial bonus in moderate rain or storm
            (FishWeatherPreference::HeavyRain, WeatherType::ModerateRain) => 1.2,
            (FishWeatherPreference::HeavyRain, WeatherType::HeavyStorm) => 1.4,
            (FishWeatherPreference::HeavyRain, _) => 0.3,
            
            // Storm fish: partial bonus in heavy rain, very rare otherwise
            (FishWeatherPreference::HeavyStorm, WeatherType::HeavyRain) => 1.0,
            (FishWeatherPreference::HeavyStorm, WeatherType::ModerateRain) => 0.4,
            (FishWeatherPreference::HeavyStorm, _) => 0.15,
        }
    }
}

// Get base spawn chance for each tier (modified by conditions)
fn get_tier_spawn_chance(tier: FishTier, effectiveness: f32, deep_water_factor: f32) -> f32 {
    // Base chances for each tier (these determine the probability of "upgrading" to a higher tier)
    // deep_water_factor: 0.0 = shallow/shore, 1.0 = very deep water
    let base_chance = match tier {
        FishTier::Common => 1.0,   // Always eligible
        FishTier::Uncommon => 0.35 + (effectiveness * 0.15) + (deep_water_factor * 0.15), // 35-65% base
        FishTier::Rare => 0.12 + (effectiveness * 0.12) + (deep_water_factor * 0.20),     // 12-44% base
        FishTier::Premium => 0.03 + (effectiveness * 0.07) + (deep_water_factor * 0.15),  // 3-25% base
    };
    base_chance.clamp(0.0, 1.0)
}

// Generate loot for a successful fishing attempt with time-of-day, weather, depth, and location bonuses
// Uses chunk-based weather at the fishing target location for accurate local conditions
// Includes fishing village bonus when player has the FishingVillageBonus effect (standing in Aleut village)
pub fn generate_fishing_loot(ctx: &ReducerContext, target_x: f32, target_y: f32, player_id: spacetimedb::Identity) -> Vec<String> {
    let mut loot = Vec::new();
    
    // Get current time of day (global)
    let time_of_day = get_current_time_of_day(ctx);
    
    // Get chunk-based weather at the actual fishing location (NOT global weather!)
    // This ensures fishing in a rainy chunk gives rain bonuses even if other areas are clear
    let chunk_weather = get_weather_for_position(ctx, target_x, target_y);
    let current_weather = chunk_weather.current_weather;
    
    // Check if player has the fishing village bonus effect (Aleut village expertise)
    // Effect is granted when player is standing in the fishing village zone
    let has_fishing_village_bonus = crate::active_effects::player_has_fishing_village_effect(ctx, player_id);
    let _fishing_village_multiplier = if has_fishing_village_bonus {
        log::info!("🏘️🎣 Player has Fishing Village Bonus! Applying {}x haul bonus", 
                  crate::fishing_village::FISHING_VILLAGE_HAUL_MULTIPLIER);
        crate::fishing_village::FISHING_VILLAGE_HAUL_MULTIPLIER
    } else {
        1.0
    };
    
    // Calculate effectiveness multipliers
    let time_effectiveness = get_fishing_effectiveness_multiplier(&time_of_day);
    let rain_effectiveness = get_rain_fishing_multiplier(&current_weather);
    let total_effectiveness = time_effectiveness * rain_effectiveness;
    
    // TODO: In the future, we could calculate actual depth from shore distance
    // For now, use a random depth factor (simulates different fishing spots)
    let deep_water_factor = ctx.rng().gen_range(0.0..1.0);
    
    // Get all fish and their spawn data
    let fish_database = get_fish_database();
    
    // Determine which tier of fish to catch (roll from highest to lowest)
    // Fishing village bonus effect provides a bonus to premium tier chances (Aleut fishing expertise)
    let village_premium_bonus = if has_fishing_village_bonus { 
        crate::fishing_village::FISHING_VILLAGE_PREMIUM_TIER_BONUS 
    } else { 
        0.0 
    };
    
    let selected_tier = {
        let premium_chance = get_tier_spawn_chance(FishTier::Premium, total_effectiveness, deep_water_factor) + village_premium_bonus;
        let rare_chance = get_tier_spawn_chance(FishTier::Rare, total_effectiveness, deep_water_factor);
        let uncommon_chance = get_tier_spawn_chance(FishTier::Uncommon, total_effectiveness, deep_water_factor);
        
        let roll = ctx.rng().gen_range(0.0..1.0);
        
        if roll < premium_chance {
            FishTier::Premium
        } else if roll < premium_chance + rare_chance {
            FishTier::Rare
        } else if roll < premium_chance + rare_chance + uncommon_chance {
            FishTier::Uncommon
        } else {
            FishTier::Common
        }
    };
    
    // Filter fish by selected tier and calculate weights (including weather preference!)
    let mut eligible_fish: Vec<(&FishEntry, f32)> = fish_database
        .iter()
        .filter(|fish| fish.tier == selected_tier)
        .map(|fish| {
            let time_mult = get_time_spawn_multiplier(fish.time_preference, &time_of_day);
            let weather_mult = get_weather_spawn_multiplier(fish.weather_preference, &current_weather);
            let depth_bonus = fish.deep_water_bonus * deep_water_factor;
            let weight = fish.base_weight * time_mult * weather_mult * (1.0 + depth_bonus);
            (fish, weight)
        })
        .filter(|(_, weight)| *weight > 0.001) // Filter out negligible weights
        .collect();
    
    // If no fish are eligible at this tier (very unlikely), fall back to common
    if eligible_fish.is_empty() {
        eligible_fish = fish_database
            .iter()
            .filter(|fish| fish.tier == FishTier::Common)
            .map(|fish| (fish, fish.base_weight))
            .collect();
    }
    
    // Weighted random selection from eligible fish
    let total_weight: f32 = eligible_fish.iter().map(|(_, w)| w).sum();
    let mut roll = ctx.rng().gen_range(0.0..total_weight);
    
    let selected_fish = eligible_fish
        .iter()
        .find(|(_, weight)| {
            roll -= weight;
            roll <= 0.0
        })
        .map(|(fish, _)| fish.name)
        .unwrap_or("Raw Twigfish"); // Ultimate fallback
    
    loot.push(selected_fish.to_string());
    
    // Log the catch with details (including chunk weather info)
    log::info!("🎣 Fish caught: {} (Tier: {:?}, Time: {:?}, ChunkWeather: {:?}, Effectiveness: {:.2}x, Depth: {:.2}, VillageBonus: {}, Pos: {:.0},{:.0})",
              selected_fish, selected_tier, time_of_day, current_weather, total_effectiveness, deep_water_factor, has_fishing_village_bonus, target_x, target_y);
    
    // === FISHING VILLAGE 2X HAUL BONUS ===
    // When player has fishing village bonus effect, duplicate the main catch for 2x haul
    if has_fishing_village_bonus {
        loot.push(selected_fish.to_string());
        log::info!("🏘️ Village fishing bonus! Doubled catch: +1 {}", selected_fish);
    }
    
    // Bonus fish chance during excellent conditions (enhanced by fishing village bonus)
    let village_bonus_mult = if has_fishing_village_bonus { 
        crate::fishing_village::FISHING_VILLAGE_BONUS_FISH_CHANCE_MULTIPLIER 
    } else { 
        1.0 
    };
    let bonus_fish_chance = 0.15 * total_effectiveness * village_bonus_mult; // 15% base, up to ~37% in perfect conditions, 1.5x in village
    if ctx.rng().gen_range(0.0..1.0) < bonus_fish_chance {
        // Bonus fish is always common tier (can't stack premium catches too easily)
        let common_fish: Vec<&FishEntry> = fish_database
            .iter()
            .filter(|f| f.tier == FishTier::Common)
            .collect();
        
        if let Some(bonus) = common_fish.get(ctx.rng().gen_range(0..common_fish.len())) {
            loot.push(bonus.name.to_string());
            log::info!("🐟 Bonus fish! Also caught: {}", bonus.name);
        }
    }
    
    // Junk chance (lower during good conditions)
    // Formula: 25% base chance, reduced by effectiveness (down to ~0% in perfect conditions)
    // Perfect conditions (effectiveness > 3.0): ~0% junk chance
    // Poor conditions (effectiveness < 1.0): up to 25% junk chance
    let junk_chance = 0.25 * (2.0 - total_effectiveness).max(0.0);
    if ctx.rng().gen_range(0.0..1.0) < junk_chance {
        // Randomly select from junk items (Aleutian Islands themed)
        let junk_items = vec![
            "Tin Can",
            "Old Boot",
            "Rusty Hook",
            "Seaweed",
            "Aleut Charm",      // Small carved amulet lost in the waters
            "Shell Fragment",  // Small broken shell piece
            "Sea Glass",        // Natural glass fragments
            "Whale Bone Fragment", // Small bone fragment (too small to craft with)
        ];
        let selected_junk = junk_items[ctx.rng().gen_range(0..junk_items.len())];
        loot.push(selected_junk.to_string());
        log::info!("🗑️ Junk caught: {} (effectiveness: {:.2}x, junk chance: {:.1}%)", 
                  selected_junk, total_effectiveness, junk_chance * 100.0);
    }
    
    // Very rare extra premium fish during perfect conditions (dawn/dusk + heavy rain/storm)
    if total_effectiveness > 3.0 && selected_tier == FishTier::Premium {
        if ctx.rng().gen_range(0.0..1.0) < 0.10 {
            loot.push("Raw Twigfish".to_string()); // Extra small fish as "bycatch"
            log::info!("🐟🌧️ PERFECT fishing conditions! Extra bycatch during {:?} + {:?}", 
                      time_of_day, current_weather);
        }
    }
    
    // Storm fishing bonus: Small chance for storm-preferring fish as extra catch
    if matches!(current_weather, WeatherType::HeavyStorm) && ctx.rng().gen_range(0.0..1.0) < 0.12 {
        // During storms, there's a 12% chance to get an extra storm-loving fish
        let storm_fish: Vec<&FishEntry> = fish_database
            .iter()
            .filter(|f| f.weather_preference == FishWeatherPreference::HeavyStorm)
            .collect();
        
        if let Some(storm_catch) = storm_fish.get(ctx.rng().gen_range(0..storm_fish.len().max(1))) {
            loot.push(storm_catch.name.to_string());
            log::info!("⛈️ Storm bonus! The churning waters brought up: {}", storm_catch.name);
        }
    }
    
    loot
}

// Helper function to get current time of day from world state
fn get_current_time_of_day(ctx: &ReducerContext) -> TimeOfDay {
    match ctx.db.world_state().iter().next() {
        Some(world_state) => world_state.time_of_day.clone(),
        None => {
            log::warn!("No world state found, defaulting to Noon for fishing calculations");
            TimeOfDay::Noon
        }
    }
}

// Calculate fishing effectiveness multiplier based on time of day
fn get_fishing_effectiveness_multiplier(time_of_day: &TimeOfDay) -> f32 {
    match time_of_day {
        TimeOfDay::Dawn => 1.8,           // 80% better fishing at dawn
        TimeOfDay::Dusk => 1.8,           // 80% better fishing at dusk  
        TimeOfDay::TwilightMorning => 1.4, // 40% better during morning twilight
        TimeOfDay::TwilightEvening => 1.4, // 40% better during evening twilight
        TimeOfDay::Morning => 1.1,        // 10% better in morning
        TimeOfDay::Afternoon => 1.1,      // 10% better in afternoon
        TimeOfDay::Night => 0.8,          // 20% worse at night
        TimeOfDay::Midnight => 0.6,       // 40% worse at midnight
        TimeOfDay::Noon => 1.0,           // Normal fishing at noon
    }
}

// Calculate rain-based fishing effectiveness multiplier
fn get_rain_fishing_multiplier(weather: &WeatherType) -> f32 {
    match weather {
        WeatherType::Clear => 1.0,           // Normal fishing in clear weather
        WeatherType::LightRain => 1.3,       // 30% better - light rain stirs up insects
        WeatherType::ModerateRain => 1.6,    // 60% better - fish are more active
        WeatherType::HeavyRain => 2.0,       // 100% better - fish feeding frenzy
        WeatherType::HeavyStorm => 2.5,      // 150% better - but dangerous conditions!
    }
}

// Water tile detection using the existing tile system
pub fn is_water_tile(ctx: &ReducerContext, x: f32, y: f32) -> bool {
    use crate::{world_pos_to_tile_coords, get_tile_type_at_position, TileType};
    
    // Convert world position to tile coordinates
    let (tile_x, tile_y) = world_pos_to_tile_coords(x, y);
    
    // NEW: Try compressed lookup first for better performance
    if let Some(tile_type) = get_tile_type_at_position(ctx, tile_x, tile_y) {
        return tile_type.is_water(); // Includes both Sea and HotSpringWater
    }
    
    // FALLBACK: Use original method if compressed data not available
    use crate::world_tile as WorldTileTableTrait;
    let world_tiles = ctx.db.world_tile();
    
    // Use the indexed world_position btree for fast lookup
    for tile in world_tiles.idx_world_position().filter((tile_x, tile_y)) {
        return tile.tile_type.is_water(); // Includes both Sea and HotSpringWater
    }
    
    // No tile found at this position, assume not water (safety fallback)
    false
}

// Fishing range check
pub fn is_within_fishing_range(player_x: f32, player_y: f32, target_x: f32, target_y: f32) -> bool {
    let distance = ((target_x - player_x).powi(2) + (target_y - player_y).powi(2)).sqrt();
    distance <= 800.0 // Fishing range of 800 units (matches client FISHING_CONSTANTS.RANGE)
}

#[reducer]
pub fn cast_fishing_line(ctx: &ReducerContext, target_x: f32, target_y: f32) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Get player position from player table
    let player = match ctx.db.player().identity().find(&player_id) {
        Some(p) => p,
        None => return Err("Player not found".to_string()),
    };
    
    // Check if player is alive
    if player.is_dead {
        return Err("Cannot fish while dead".to_string());
    }
    
    // Check fishing range
    if !is_within_fishing_range(player.position_x, player.position_y, target_x, target_y) {
        return Err("Target location is too far away".to_string());
    }
    
    // Check if target location is water
    if !is_water_tile(ctx, target_x, target_y) {
        return Err("Can only cast fishing line in water".to_string());
    }
    
    // Check if player has a fishing rod equipped by looking at active equipment
    let active_equipment = ctx.db.active_equipment().player_identity().find(&player_id);
    let active_item_name = match active_equipment {
        Some(eq) => {
            match eq.equipped_item_def_id {
                Some(item_def_id) => {
                    // Look up the item definition to get the name
                    match ctx.db.item_definition().id().find(&item_def_id) {
                        Some(item_def) => item_def.name.clone(),
                        None => return Err("Active item definition not found".to_string()),
                    }
                }
                None => return Err("No active item equipped".to_string()),
            }
        }
        None => return Err("No active equipment found".to_string()),
    };
    
    // Verify it's a fishing rod
    if !active_item_name.contains("Fishing Rod") {
        return Err("Must have a fishing rod equipped".to_string());
    }
    
    // Check if player is already fishing
    if let Some(_existing_session) = ctx.db.fishing_session().player_id().find(&player_id) {
        return Err("Already fishing".to_string());
    }
    
    // Create new fishing session
    let fishing_session = FishingSession {
        player_id,
        is_active: true,
        cast_time: ctx.timestamp,
        target_x,
        target_y,
        fishing_rod: active_item_name,
        has_bite: false,
    };
    
    ctx.db.fishing_session().insert(fishing_session);
    
    log::info!("Player {} cast fishing line at ({}, {})", player_id, target_x, target_y);
    Ok(())
}

#[reducer]
pub fn finish_fishing(ctx: &ReducerContext, success: bool, _caught_items: Vec<String>) -> Result<(), String> {
    let player_id = ctx.sender;
    
    log::info!("===== FINISH_FISHING CALLED =====");
    log::info!("Player: {}", player_id);
    log::info!("Success: {}", success);
    log::info!("Caught items (ignored): {:?}", _caught_items);
    
    // Find active fishing session
    let fishing_session = match ctx.db.fishing_session().player_id().find(&player_id) {
        Some(session) => {
            log::info!("Found fishing session: active={}, cast_time={:?}", session.is_active, session.cast_time);
            session
        },
        None => {
            log::error!("No active fishing session found for player {}", player_id);
            return Err("No active fishing session".to_string());
        },
    };
    
    if !fishing_session.is_active {
        log::error!("Fishing session exists but is not active for player {}", player_id);
        return Err("Fishing session is not active".to_string());
    }
    
    log::info!("Removing fishing session for player {}", player_id);
    // Remove fishing session
    ctx.db.fishing_session().player_id().delete(&player_id);
    
    if success {
        // Generate loot server-side to ensure fairness and prevent cheating
        // Pass fishing target position for accurate chunk-based weather calculations
        // Pass player_id for fishing village bonus effect check
        let generated_loot = generate_fishing_loot(ctx, fishing_session.target_x, fishing_session.target_y, player_id);
        
        if generated_loot.is_empty() {
            log::error!("Player {} successful fishing but no loot generated! This should never happen!", player_id);
            return Err("No loot generated despite successful fishing".to_string());
        }
        
        // Track successful additions
        let mut added_items = Vec::new();
        let mut dropped_items = Vec::new();
        
        log::info!("Attempting to add {} caught items to player {} inventory", generated_loot.len(), player_id);
        
        for item_name in generated_loot.iter() {
            log::info!("Looking for item definition for: '{}'", item_name);
            
            // Find the item definition by name
            let item_def = ctx.db.item_definition().iter()
                .find(|def| def.name == *item_name);
            
            match item_def {
                Some(def) => {
                    log::info!("Found item definition for '{}' with ID: {}", item_name, def.id);
                    
                    // Add to player inventory, drop near player if inventory is full
                    match give_item_to_player_or_drop(ctx, player_id, def.id, 1) {
                        Ok(added_to_inventory) => {
                            if added_to_inventory {
                                log::info!("SUCCESS: Player {} caught: {} (added to inventory)", 
                                         player_id, item_name);
                                added_items.push(item_name.clone());
                            } else {
                                log::info!("SUCCESS: Player {} caught: {} (inventory full, dropped near player)", 
                                         player_id, item_name);
                                dropped_items.push(item_name.clone());
                            }
                        }
                        Err(e) => {
                            log::error!("FAILED to give caught item '{}' to player: {}", item_name, e);
                        }
                    }
                }
                None => {
                    log::error!("FAILED to find item definition for: '{}'", item_name);
                    // Let's also log all available item names for debugging
                    let available_items: Vec<String> = ctx.db.item_definition().iter()
                        .map(|def| def.name.clone())
                        .collect();
                    log::error!("Available item names: {:?}", available_items);
                }
            }
        }
        
        if added_items.is_empty() && dropped_items.is_empty() {
            log::error!("Player {} successful fishing but no items were given!", player_id);
            return Err("Failed to give any caught items".to_string());
        }
        
        // Award XP and update stats for successful catch
        if let Err(e) = crate::player_progression::award_xp(ctx, player_id, crate::player_progression::XP_FISH_CAUGHT) {
            log::error!("Failed to award XP for fishing: {}", e);
        }
        
        // Track fish_caught stat and check achievements
        if let Err(e) = crate::player_progression::track_stat_and_check_achievements(ctx, player_id, "fish_caught", 1) {
            log::error!("Failed to track fishing stat: {}", e);
        }
        
        log::info!("Player {} fishing complete: {} items to inventory, {} items dropped: {:?}", 
                  player_id, added_items.len(), dropped_items.len(), 
                  [added_items.clone(), dropped_items.clone()].concat());
    }
    
    log::info!("Player {} finished fishing. Success: {}", player_id, success);
    Ok(())
}

#[reducer]
pub fn cancel_fishing(ctx: &ReducerContext) -> Result<(), String> {
    let player_id = ctx.sender;
    
    // Remove fishing session if exists
    if ctx.db.fishing_session().player_id().find(&player_id).is_some() {
        ctx.db.fishing_session().player_id().delete(&player_id);
        log::info!("Player {} cancelled fishing", player_id);
    }
    
    Ok(())
}

// Helper function to check if a player is currently fishing
pub fn is_player_fishing(ctx: &ReducerContext, player_id: &Identity) -> bool {
    ctx.db.fishing_session()
        .player_id()
        .find(player_id)
        .map_or(false, |session| session.is_active)
}

// Get fishing session info for a player
pub fn get_fishing_session(ctx: &ReducerContext, player_id: &Identity) -> Option<FishingSession> {
    ctx.db.fishing_session().player_id().find(player_id)
} 