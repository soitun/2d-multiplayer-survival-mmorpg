// server/src/consumables.rs
use spacetimedb::{ReducerContext, Identity, Table, Timestamp, TimeDuration};
use log;
use rand::Rng;

// Import table traits needed for ctx.db access
// use crate::player::{player as PlayerTableTrait, Player}; // Old import
use crate::Player; // For the struct
use crate::player; // For the table trait
use crate::items::{InventoryItem, inventory_item as InventoryItemTableTrait};
use crate::items::{ItemDefinition, item_definition as ItemDefinitionTableTrait};
use crate::items::ItemCategory; // Import the enum itself
use crate::models::ItemLocation; // Added import

// Import active effects related items
use crate::active_effects::{ActiveConsumableEffect, EffectType, active_consumable_effect as ActiveConsumableEffectTableTrait, cancel_bleed_effects, cancel_health_regen_effects, player_has_cozy_effect, COZY_FOOD_HEALING_MULTIPLIER, apply_broth_effect_from_type, apply_broth_effect_from_category};

// Import AI brewing cache for poison brew detection and effect application
use crate::ai_brewing::{brew_recipe_cache as BrewRecipeCacheTableTrait, parse_effect_type, map_category_to_effect};

// Import sound system for eating food sound and drinking water sound
use crate::sound_events::{emit_eating_food_sound, emit_drinking_water_sound, emit_throwing_up_sound};

// Import plants database for seed granting on consumption
use crate::plants_database::{PlantType, PLANT_CONFIGS, has_seed_drops, get_seed_type_for_plant};

// --- Max Stat Value ---
pub const MAX_HEALTH_VALUE: f32 = 100.0; // Max value for health
pub const MAX_HUNGER_VALUE: f32 = 250.0; // Max value for hunger
pub const MAX_THIRST_VALUE: f32 = 250.0; // Max value for thirst
pub const MAX_STAMINA_VALUE: f32 = 100.0; // Max value for stamina
pub const MAX_WARMTH_VALUE: f32 = 100.0; // Max value for warmth
pub const MIN_STAT_VALUE: f32 = 0.0;   // Min value for stats like health
const CONSUMPTION_COOLDOWN_MICROS: u64 = 1_000_000; // 1 second cooldown

// --- Water container thirst values ---
// Import from rain collector module for consistency
use crate::rain_collector::{REED_WATER_BOTTLE_CAPACITY, PLASTIC_WATER_JUG_CAPACITY};

#[spacetimedb::reducer]
pub fn consume_item(ctx: &ReducerContext, item_instance_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender;
    let players_table = ctx.db.player();
    let item_defs = ctx.db.item_definition();

    log::info!("[ConsumeItem] Player {:?} attempting to consume item instance {}", sender_id, item_instance_id);

    let mut player_to_update = players_table.identity().find(&sender_id)
        .ok_or_else(|| "Player not found.".to_string())?;

    // --- Check player state first ---
    if player_to_update.is_dead {
        return Err("Cannot consume items while dead.".to_string());
    }
    if player_to_update.is_knocked_out {
        return Err("Cannot consume items while knocked out.".to_string());
    }

    if let Some(last_consumed_ts) = player_to_update.last_consumed_at {
        let cooldown_duration = TimeDuration::from_micros(CONSUMPTION_COOLDOWN_MICROS as i64);
        if ctx.timestamp < last_consumed_ts + cooldown_duration {
            return Err("You are consuming items too quickly.".to_string());
        }
    }

    let item_to_consume = ctx.db.inventory_item().instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Item instance {} not found.", item_instance_id))?;

    let is_in_possession = match &item_to_consume.location {
        ItemLocation::Inventory(data) => data.owner_id == sender_id,
        ItemLocation::Hotbar(data) => data.owner_id == sender_id,
        _ => false,
    };

    if !is_in_possession {
        return Err("Cannot consume an item not in your inventory or hotbar.".to_string());
    }

    let item_def = item_defs.id().find(item_to_consume.item_def_id)
        .ok_or_else(|| format!("Definition for item ID {} not found.", item_to_consume.item_def_id))?;

    log::info!("[ConsumeItem] Item definition found: '{}' (ID: {}, Category: {:?})", 
               item_def.name, item_def.id, item_def.category);
    log::info!("[ConsumeItem] Item stats - Health: {:?}, Hunger: {:?}, Thirst: {:?}, Warmth: {:?}, Duration: {:?}",
               item_def.consumable_health_gain, item_def.consumable_hunger_satiated, 
               item_def.consumable_thirst_quenched, item_def.warmth_bonus, item_def.consumable_duration_secs);

    // Allow consumption of items that are either Consumable category OR have consumable stats (e.g., seeds)
    // Seeds are Placeable but can be eaten for emergency nutrition
    let has_consumable_stats = item_def.consumable_health_gain.is_some() ||
                              item_def.consumable_hunger_satiated.is_some() ||
                              item_def.consumable_thirst_quenched.is_some() ||
                              item_def.warmth_bonus.is_some();
    
    log::info!("[ConsumeItem] Category check - Category: {:?}, Has consumable stats: {}", 
               item_def.category, has_consumable_stats);
    
    if item_def.category != ItemCategory::Consumable && !has_consumable_stats {
        log::error!("[ConsumeItem] Item '{}' cannot be consumed - not Consumable category and no consumable stats", item_def.name);
        return Err(format!("Item '{}' cannot be consumed.", item_def.name));
    }
    
    log::info!("[ConsumeItem] Item '{}' passed consumption validation", item_def.name);

    // Check if food is spoiled (durability <= 0)
    if crate::durability::is_food_item(&item_def) {
        if crate::durability::is_item_broken(&item_to_consume) {
            return Err(format!("This {} has spoiled and cannot be consumed.", item_def.name));
        }
    }

    // Note: Poison brews are now consumable - they apply Poisoned DOT + PoisonCoating effect
    // The PoisonCoating effect makes all weapon attacks inflict poison on targets
    log::info!("[ConsumeItem] Item '{}' is consumable - proceeding with consumption", item_def.name);

    // Call the centralized helper function
    log::info!("[ConsumeItem] Calling apply_item_effects_and_consume for item '{}'", item_def.name);
    match apply_item_effects_and_consume(ctx, sender_id, &item_def, item_instance_id, &mut player_to_update) {
        Ok(_) => {
            log::info!("[ConsumeItem] Successfully applied effects for item '{}'", item_def.name);
        }
        Err(e) => {
            log::error!("[ConsumeItem] Failed to apply effects for item '{}': {}", item_def.name, e);
            return Err(e);
        }
    }

    // Emit appropriate sound based on item type
    // Check if this is an AI-generated brew (liquid) - should use drinking sound
    let is_ai_brew = ctx.db.brew_recipe_cache().iter()
        .any(|recipe| recipe.output_item_def_id == item_def.id);
    
    if item_def.name == "Anti-Venom" || is_ai_brew {
        // Anti-Venom and all AI-generated brews are liquids, use drinking sound
        emit_drinking_water_sound(ctx, player_to_update.position_x, player_to_update.position_y, sender_id);
    } else {
        // Default to eating sound for solid consumables
        emit_eating_food_sound(ctx, player_to_update.position_x, player_to_update.position_y, sender_id);
    }

    // Update player table after effects are applied and item consumed
    players_table.identity().update(player_to_update);
    
    // For instant-effect items (no duration), handle consumption immediately.
    // Check if this item has no duration or a duration <= 0
    let has_instant_effect = item_def.consumable_duration_secs.map_or(true, |d| d <= 0.0);
    
    log::info!("[ConsumeItem] Item '{}' has instant effect: {} (duration: {:?})", 
               item_def.name, has_instant_effect, item_def.consumable_duration_secs);
    
    if has_instant_effect {
        // Consume the item directly here since no timed effect will handle it
        let mut item_to_consume = ctx.db.inventory_item().instance_id().find(item_instance_id)
            .ok_or_else(|| format!("Item instance {} suddenly disappeared.", item_instance_id))?;
        
        log::info!("[ConsumeItem] Consuming instant-effect item - current quantity: {}", item_to_consume.quantity);
            
        // Decrease quantity
        if item_to_consume.quantity > 0 {
            item_to_consume.quantity -= 1;
        } else {
            log::warn!("[ConsumeItem] Item quantity is already 0, cannot consume");
        }
        
        // Remove item if quantity is 0
        if item_to_consume.quantity == 0 {
            ctx.db.inventory_item().instance_id().delete(&item_instance_id);
            log::info!("[ConsumeItem] ✅ Instantly consumed and deleted item_instance_id: {} for player {:?}.", 
                item_instance_id, sender_id);
        } else {
            // Update with decreased quantity
            ctx.db.inventory_item().instance_id().update(item_to_consume.clone());
            log::info!("[ConsumeItem] ✅ Instantly consumed item_instance_id: {}, new quantity: {} for player {:?}.", 
                item_instance_id, item_to_consume.quantity, sender_id);
        }
    } else {
        log::info!("[ConsumeItem] Item '{}' has timed effect (duration: {:?}), consumption handled by timed effect system", 
                   item_def.name, item_def.consumable_duration_secs);
    }
    
    // Track quest progress for food/drink consumption
    // Determine if this is primarily food (hunger) or drink (thirst)
    let is_primarily_drink = item_def.consumable_thirst_quenched
        .map(|t| t > item_def.consumable_hunger_satiated.unwrap_or(0.0))
        .unwrap_or(false);
    
    if is_primarily_drink {
        if let Err(e) = crate::quests::track_quest_progress(
            ctx,
            sender_id,
            crate::quests::QuestObjectiveType::DrinkWater,
            None,
            1,
        ) {
            log::warn!("Failed to track quest progress for drinking: {}", e);
        }
    } else if item_def.consumable_hunger_satiated.is_some() {
        if let Err(e) = crate::quests::track_quest_progress(
            ctx,
            sender_id,
            crate::quests::QuestObjectiveType::EatFood,
            None,
            1,
        ) {
            log::warn!("Failed to track quest progress for eating: {}", e);
        }
    }

    Ok(())
}

// NEW PUBLIC HELPER FUNCTION
pub fn apply_item_effects_and_consume(
    ctx: &ReducerContext,
    player_id: Identity,
    item_def: &ItemDefinition,
    item_instance_id: u64,
    player_to_update: &mut Player, // Pass mutable player to update directly
) -> Result<(), String> {
    let mut stat_changed_instantly = false;
    let old_health = player_to_update.health;
    let old_hunger = player_to_update.hunger;
    let old_thirst = player_to_update.thirst;
    let old_warmth = player_to_update.warmth;

    // === BROTH POT BREW SPECIAL HANDLING ===
    // Brews from the broth pot restore ALL stats to MAX and have a 60-second cooldown
    let brew_cache = ctx.db.brew_recipe_cache();
    let is_broth_pot_brew = brew_cache.iter()
        .any(|recipe| recipe.output_item_def_id == item_def.id);
    
    if is_broth_pot_brew {
        log::info!("[EffectsHelper] 🍲 Detected broth pot brew: '{}' (def_id: {})", item_def.name, item_def.id);
        
        // Check for brew cooldown - reject if still on cooldown
        if crate::active_effects::player_has_brew_cooldown(ctx, player_id) {
            let remaining = crate::active_effects::get_brew_cooldown_remaining(ctx, player_id)
                .unwrap_or(0.0);
            log::warn!("[EffectsHelper] 🍲 Player {:?} tried to consume brew '{}' but is on cooldown ({:.1}s remaining)", 
                player_id, item_def.name, remaining);
            // Return a recognizable error code - client will play SOVA voice feedback
            return Err("BREW_COOLDOWN".to_string());
        }
        
        // Brews restore ALL stats to MAX (this is what justifies the long brew time)
        log::info!("[EffectsHelper] 🍲 Applying MAX stat restoration from brew '{}'", item_def.name);
        player_to_update.health = MAX_HEALTH_VALUE;
        player_to_update.hunger = MAX_HUNGER_VALUE;
        player_to_update.thirst = MAX_THIRST_VALUE;
        // Don't max warmth - let the player still need fire/shelter for warmth
        stat_changed_instantly = true;
        
        log::info!(
            "[EffectsHelper] 🍲 Brew '{}' restored player {:?} to MAX stats: Health {:.1}->{:.1}, Hunger {:.1}->{:.1}, Thirst {:.1}->{:.1}",
            item_def.name, player_id,
            old_health, player_to_update.health,
            old_hunger, player_to_update.hunger,
            old_thirst, player_to_update.thirst
        );
        
        player_to_update.last_consumed_at = Some(ctx.timestamp);
        
        // Apply the brew's special effect (SpeedBoost, NightVision, etc.)
        if let Err(e) = apply_brewing_recipe_effect(ctx, player_id, item_def, item_instance_id) {
            log::warn!("[EffectsHelper] 🍲 Brew '{}' special effect failed (but stats were restored): {}", item_def.name, e);
            // Don't fail - stats were still restored
        }
        
        // Apply 60-second brew cooldown
        if let Err(e) = crate::active_effects::apply_brew_cooldown(ctx, player_id, item_def.id) {
            log::error!("[EffectsHelper] 🍲 Failed to apply brew cooldown for '{}': {}", item_def.name, e);
            // Don't fail the consumption - the brew was consumed
        }
        
        return Ok(());
    }
    // === END BROTH POT BREW HANDLING ===

    // SPECIAL HANDLING: Anti-Venom instantly cures all venom effects (regardless of duration setting)
    if item_def.name == "Anti-Venom" {
        log::info!("[EffectsHelper] Player {:?} using Anti-Venom. Curing all venom effects.", player_id);
        
        // Count how many venom effects are being cured (for achievement tracking)
        let venom_effects_cured = ctx.db.active_consumable_effect().iter()
            .filter(|e| e.player_id == player_id && e.effect_type == crate::active_effects::EffectType::Venom)
            .count() as u64;
        
        // Cancel all active venom effects
        crate::active_effects::cancel_venom_effects(ctx, player_id);
        
        // Track venom survival for achievements (only if there were venom effects to cure)
        if venom_effects_cured > 0 {
            if let Err(e) = crate::player_progression::track_stat_and_check_achievements(ctx, player_id, "venom_bites", venom_effects_cured) {
                log::warn!("Failed to track venom survival stat: {}", e);
            }
            log::info!("[EffectsHelper] Player {:?} survived {} venom effects! Achievement tracking updated.", player_id, venom_effects_cured);
        }
        
        // Apply instant effects (health boost and stamina boost)
        apply_instant_effects_for_helper(ctx, item_def, player_id, player_to_update, &mut stat_changed_instantly);
        
        log::info!("[EffectsHelper] Player {:?} has been cured of all venom effects by Anti-Venom!", player_id);
    } 
    // SPECIAL HANDLING: Validol Tablets - insanity countermeasure (like RAD pills in Rust)
    // If player has Entrainment: pauses damage for 2-5 minutes
    // If player doesn't have Entrainment: reduces insanity by 25%
    else if item_def.name == "Validol Tablets" {
        log::info!("[EffectsHelper] Player {:?} using Validol Tablets. Checking insanity state...", player_id);
        
        // Check if player has the Entrainment effect (max insanity reached)
        if crate::active_effects::player_has_entrainment_effect(ctx, player_id) {
            // Player is at max insanity with Entrainment - apply ValidolProtection to pause damage
            match crate::active_effects::apply_validol_protection(ctx, player_id) {
                Ok(duration_secs) => {
                    log::info!("[EffectsHelper] Player {:?} has Entrainment - Validol applied protection for {} seconds!", 
                        player_id, duration_secs);
                }
                Err(e) => {
                    log::error!("[EffectsHelper] Failed to apply ValidolProtection to player {:?}: {}", player_id, e);
                }
            }
        } else {
            // Player doesn't have Entrainment - reduce insanity by 25% of max
            match crate::active_effects::reduce_player_insanity(ctx, player_id, 0.25) {
                Ok(reduction) => {
                    log::info!("[EffectsHelper] Player {:?} - Validol reduced insanity by {:.1}!", 
                        player_id, reduction);
                }
                Err(e) => {
                    log::error!("[EffectsHelper] Failed to reduce insanity for player {:?}: {}", player_id, e);
                }
            }
        }
        
        // Apply the small instant health effect as well
        apply_instant_effects_for_helper(ctx, item_def, player_id, player_to_update, &mut stat_changed_instantly);
        
        log::info!("[EffectsHelper] Player {:?} consumed Validol Tablets!", player_id);
    } else if let Some(duration_secs) = item_def.consumable_duration_secs {
        if duration_secs > 0.0 { // This branch handles timed effects
            if item_def.name == "Bandage" {
                if let Some(total_bandage_heal) = item_def.consumable_health_gain {
                    if total_bandage_heal != 0.0 {
                        // Cancel any existing HealthRegen OR BandageBurst effects for this player to prevent stacking similar effects.
                        // We might need a more nuanced approach if different types of healing shouldn't cancel each other.
                        cancel_health_regen_effects(ctx, player_id); 
                        // It might be wise to also explicitly cancel any existing BandageBurst here if a player tries to use another bandage while one is active.
                        // For now, let's assume one bandage at a time. A dedicated cancel_bandage_burst_effects could be called too.
                        // crate::active_effects::cancel_bleed_effects(ctx, player_id); // Bandages still cancel bleed - REMOVED, handled by BandageBurst effect completion
                        
                        log::info!("[EffectsHelper] Player {:?} using Bandage. Creating BandageBurst effect.", player_id);
                        apply_timed_effect_for_helper(ctx, player_id, item_def, item_instance_id, EffectType::BandageBurst, total_bandage_heal, duration_secs, 1.0)?;
                    }
                }
            } else if item_def.name == "Selo Olive Oil" {
                // SECURITY CHECK: Selo Olive Oil can only heal the consuming player (yourself)
                if player_id != ctx.sender {
                    return Err("Selo Olive Oil can only be used on yourself.".to_string());
                }
                
                // Handle Selo Olive Oil with instant effects for all stats
                if let Some(health_gain) = item_def.consumable_health_gain {
                    if health_gain != 0.0 {
                        cancel_health_regen_effects(ctx, player_id);
                        log::info!("[EffectsHelper] Player {:?} using Selo Olive Oil. Creating HealthRegen effect.", player_id);
                        apply_timed_effect_for_helper(ctx, player_id, item_def, item_instance_id, EffectType::HealthRegen, health_gain, duration_secs, 1.0)?;
                    }
                }
                
                // Apply instant effects for other stats during timed effect
                if let Some(hunger_satiated) = item_def.consumable_hunger_satiated {
                    let old_val = player_to_update.hunger;
                    player_to_update.hunger = (player_to_update.hunger + hunger_satiated).clamp(MIN_STAT_VALUE, MAX_HUNGER_VALUE);
                    if player_to_update.hunger != old_val { stat_changed_instantly = true; }
                }
                if let Some(thirst_quenched) = item_def.consumable_thirst_quenched {
                    let old_val = player_to_update.thirst;
                    player_to_update.thirst = (player_to_update.thirst + thirst_quenched).clamp(MIN_STAT_VALUE, MAX_THIRST_VALUE);
                    if player_to_update.thirst != old_val { stat_changed_instantly = true; }
                }

                if let Some(warmth_gain) = item_def.warmth_bonus {
                    let old_val = player_to_update.warmth;
                    player_to_update.warmth = (player_to_update.warmth + warmth_gain).clamp(MIN_STAT_VALUE, MAX_WARMTH_VALUE);
                    if player_to_update.warmth != old_val { stat_changed_instantly = true; }
                }
            } else {
                // Logic for other timed consumable effects (non-bandage)
                if let Some(total_health_regen) = item_def.consumable_health_gain {
                    if total_health_regen != 0.0 {
                        cancel_health_regen_effects(ctx, player_id); // Cancel existing HoTs
                        apply_timed_effect_for_helper(ctx, player_id, item_def, item_instance_id, EffectType::HealthRegen, total_health_regen, duration_secs, 1.0)?;
                    }
                }
            }

            // Instant effects that can accompany timed effects (e.g., food gives instant hunger + HoT)
            if let Some(hunger_satiated) = item_def.consumable_hunger_satiated {
                let old_val = player_to_update.hunger;
                player_to_update.hunger = (player_to_update.hunger + hunger_satiated).clamp(MIN_STAT_VALUE, MAX_HUNGER_VALUE);
                if player_to_update.hunger != old_val { stat_changed_instantly = true; }
            }
            if let Some(thirst_quenched) = item_def.consumable_thirst_quenched {
                let old_val = player_to_update.thirst;
                player_to_update.thirst = (player_to_update.thirst + thirst_quenched).clamp(MIN_STAT_VALUE, MAX_THIRST_VALUE);
                if player_to_update.thirst != old_val { stat_changed_instantly = true; }
            }

        } else {
            apply_instant_effects_for_helper(ctx, item_def, player_id, player_to_update, &mut stat_changed_instantly);
        }
    } else {
        apply_instant_effects_for_helper(ctx, item_def, player_id, player_to_update, &mut stat_changed_instantly);
    }

    if stat_changed_instantly {
        log::info!(
            "[EffectsHelper] Player {:?} instantly changed stats with {}. Stats: H {:.1}->{:.1}, Hu {:.1}->{:.1}, T {:.1}->{:.1}, W {:.1}->{:.1}",
            player_id, item_def.name,
            old_health, player_to_update.health,
            old_hunger, player_to_update.hunger,
            old_thirst, player_to_update.thirst,
            old_warmth, player_to_update.warmth
        );
    }

    player_to_update.last_consumed_at = Some(ctx.timestamp);
    
    // Check for brewing recipe effects (Intoxicated, Poisoned, SpeedBoost, etc.)
    // These effects are stored in the brew_recipe_cache and need to be applied
    log::info!("[EffectsHelper] Attempting to apply brewing recipe effect for item '{}' (def_id: {})", 
               item_def.name, item_def.id);
    match apply_brewing_recipe_effect(ctx, player_id, item_def, item_instance_id) {
        Ok(_) => {
            log::info!("[EffectsHelper] Successfully applied brewing recipe effect for item '{}'", item_def.name);
        }
        Err(brew_effect_error) => {
            log::warn!("[EffectsHelper] Failed to apply brewing recipe effect for player {:?}, item '{}': {}", 
                player_id, item_def.name, brew_effect_error);
            // Don't fail the entire consumption - brewing effects are optional
        }
    }
    
    // Check for food poisoning after consuming the item
    if let Err(poisoning_error) = crate::active_effects::apply_food_poisoning_effect(ctx, player_id, item_def.id) {
        log::error!("[EffectsHelper] Failed to apply food poisoning effect for player {:?}, item '{}': {}", 
            player_id, item_def.name, poisoning_error);
        // Don't fail the entire consumption - food poisoning is a "side effect"
    }
    
    // Check for seed drop from consuming plant-based food (25% chance)
    // Works for raw, cooked, and burnt versions of food items
    if let Err(seed_error) = try_grant_seed_from_consumption(ctx, player_id, &item_def.name) {
        log::warn!("[EffectsHelper] Failed to grant seed from consumption for player {:?}, item '{}': {}", 
            player_id, item_def.name, seed_error);
        // Don't fail the entire consumption - seed drop is optional
    }
    
    // The caller of this helper will be responsible for updating the player table.

    Ok(())
}

// Renamed and adapted apply_instant_effects to be used by the helper
fn apply_instant_effects_for_helper(ctx: &ReducerContext, item_def: &ItemDefinition, player_id: Identity, player: &mut Player, stat_changed: &mut bool) {
    if let Some(mut health_gain) = item_def.consumable_health_gain {
        if item_def.consumable_duration_secs.map_or(true, |d| d <= 0.0) {
            // Apply cozy bonus to food healing (only for positive healing)
            if health_gain > 0.0 && player_has_cozy_effect(ctx, player_id) {
                health_gain *= COZY_FOOD_HEALING_MULTIPLIER;
                log::info!("Player {:?} has cozy effect! Food healing boosted from {:.1} to {:.1}", 
                    player_id, item_def.consumable_health_gain.unwrap_or(0.0), health_gain);
            }
            
            let old_val = player.health;
            player.health = (player.health + health_gain).clamp(MIN_STAT_VALUE, MAX_HEALTH_VALUE);
            if player.health != old_val { *stat_changed = true; }
        }
    }
    if let Some(hunger_satiated) = item_def.consumable_hunger_satiated {
        let old_val = player.hunger;
        player.hunger = (player.hunger + hunger_satiated).clamp(MIN_STAT_VALUE, MAX_HUNGER_VALUE);
        if player.hunger != old_val { *stat_changed = true; }
    }
    if let Some(thirst_quenched) = item_def.consumable_thirst_quenched {
        let old_val = player.thirst;
        player.thirst = (player.thirst + thirst_quenched).clamp(MIN_STAT_VALUE, MAX_THIRST_VALUE);
        if player.thirst != old_val { *stat_changed = true; }
    }

    if let Some(warmth_gain) = item_def.warmth_bonus {
        let old_val = player.warmth;
        player.warmth = (player.warmth + warmth_gain).clamp(MIN_STAT_VALUE, MAX_WARMTH_VALUE);
        if player.warmth != old_val { *stat_changed = true; }
    }
}

fn apply_timed_effect_for_helper(
    ctx: &ReducerContext,
    player_id: Identity,
    item_def: &ItemDefinition,
    item_instance_id: u64,
    effect_type: EffectType,
    total_amount: f32,
    duration_secs: f32,
    tick_interval_secs: f32,
) -> Result<(), String> {
    if duration_secs <= 0.0 {
        return Err("Timed effect duration must be positive.".to_string());
    }
    if tick_interval_secs <= 0.0 {
        return Err("Timed effect tick interval must be positive.".to_string());
    }
    if total_amount == 0.0 { // No point in a zero-amount timed effect
        log::info!("[TimedEffectHelper] Total amount for {:?} on player {:?} with item '{}' is 0. Skipping effect creation.", 
            effect_type, player_id, item_def.name);
        return Ok(());
    }

    let now = ctx.timestamp;
    let duration_micros = (duration_secs * 1_000_000.0) as u64;
    let tick_interval_micros = (tick_interval_secs * 1_000_000.0) as u64;

    if tick_interval_micros == 0 {
        return Err("Tick interval micros calculated to zero, too small.".to_string());
    }

    let effect_to_insert = ActiveConsumableEffect {
        effect_id: 0,
        player_id: player_id,
        target_player_id: None,
        item_def_id: item_def.id,
        consuming_item_instance_id: Some(item_instance_id),
        started_at: now,
        ends_at: now + TimeDuration::from_micros(duration_micros as i64),
        total_amount: Some(total_amount),
        amount_applied_so_far: Some(0.0),
        effect_type: effect_type.clone(),
        tick_interval_micros,
        next_tick_at: now + TimeDuration::from_micros(tick_interval_micros as i64),
    };

    match ctx.db.active_consumable_effect().try_insert(effect_to_insert) {
        Ok(_) => {
            log::info!(
                "[TimedEffectHelper] Applied timed effect {:?} to player {:?} from item '{}' (instance {}). Duration: {}s, Total: {}, Tick: {}s.",
                effect_type, player_id, item_def.name, item_instance_id, duration_secs, total_amount, tick_interval_secs
            );
            Ok(())
        }
        Err(e) => {
            log::error!(
                "[TimedEffectHelper] Failed to insert timed effect {:?} for player {:?} from item '{}': {:?}",
                effect_type, player_id, item_def.name, e
            );
            Err(format!("Failed to apply timed effect: {:?}", e))
        }
    }
}

/// Applies brewing recipe effects (Intoxicated, Poisoned, SpeedBoost, etc.) from AI-generated brews
/// Checks the brew_recipe_cache to see if this item has a special effect type
/// IMPORTANT: Broth effects provide powerful 1-hour buffs but DO NOT persist through death!
fn apply_brewing_recipe_effect(
    ctx: &ReducerContext,
    player_id: Identity,
    item_def: &ItemDefinition,
    _item_instance_id: u64, // Unused now - effects use item_def_id
) -> Result<(), String> {
    log::info!("[BrewingEffect] Looking up brew recipe for item '{}' (def_id: {})", item_def.name, item_def.id);
    
    // Check if this item is a generated brew by looking it up in the brew_recipe_cache
    let brew_cache = ctx.db.brew_recipe_cache();
    let cache_size = brew_cache.iter().count();
    log::info!("[BrewingEffect] Brew cache contains {} entries", cache_size);
    
    let cached_recipe = brew_cache.iter()
        .find(|recipe| recipe.output_item_def_id == item_def.id);
    
    if let Some(recipe) = cached_recipe {
        log::info!(
            "[BrewingEffect] ✅ Found brew recipe! Processing brew '{}' (category: {}, effect: {:?}) for player {:?}",
            item_def.name, recipe.category, recipe.effect_type, player_id
        );
        
        // First try explicit effect_type if specified in the recipe
        if let Some(ref effect_type_str) = recipe.effect_type {
            log::info!("[BrewingEffect] Applying explicit effect type: '{}'", effect_type_str);
            match apply_broth_effect_from_type(ctx, player_id, effect_type_str, item_def.id) {
                Ok(_) => {
                    log::info!("[BrewingEffect] ✅ Successfully applied effect type '{}'", effect_type_str);
                    return Ok(());
                }
                Err(e) => {
                    log::error!("[BrewingEffect] ❌ Failed to apply effect type '{}': {}", effect_type_str, e);
                    return Err(e);
                }
            }
        }
        
        // Fall back to category-based effect mapping
        log::info!("[BrewingEffect] No explicit effect_type, applying category-based effect for category: '{}'", recipe.category);
        match apply_broth_effect_from_category(ctx, player_id, &recipe.category, item_def.id) {
            Ok(_) => {
                log::info!("[BrewingEffect] ✅ Successfully applied category-based effect for '{}'", recipe.category);
                return Ok(());
            }
            Err(e) => {
                log::error!("[BrewingEffect] ❌ Failed to apply category-based effect for '{}': {}", recipe.category, e);
                return Err(e);
            }
        }
    }
    
    // Not a generated brew - no special effects to apply
    log::info!("[BrewingEffect] Item '{}' not found in brew cache - not an AI-generated brew (or cache miss)", item_def.name);
    Ok(())
}

/// Helper function to normalize item name for plant matching
/// Strips "Cooked " and "Burnt " prefixes, handles "Raw " prefix for matching
fn normalize_item_name_for_plant_match(item_name: &str) -> String {
    // Strip cooking prefixes
    let normalized = if item_name.starts_with("Cooked ") {
        item_name.strip_prefix("Cooked ").unwrap_or(item_name)
    } else if item_name.starts_with("Burnt ") {
        item_name.strip_prefix("Burnt ").unwrap_or(item_name)
    } else {
        item_name
    };
    normalized.to_string()
}

/// Helper function to find plant type from item name (by checking primary yield)
/// Returns Some(PlantType) if the item is produced by a plant, None otherwise
/// Checks both primary and secondary yields (e.g., Nettle Leaves is a secondary yield from Boreal Nettle)
/// Also matches cooked/burnt versions of food items (e.g., "Cooked Carrot" -> PlantType::Carrot)
/// Special handling for tree products (Crab Apples) that come from chopping trees, not harvesting plants
fn get_plant_type_from_item_name(item_name: &str) -> Option<PlantType> {
    // Special handling for tree products - these items come from chopping trees, not harvesting plants
    // Map them to their respective sapling plant types for seed drop purposes
    // NOTE: Hazelnuts are NOT included here because the nut IS the seed - eating it shouldn't give more
    let normalized = normalize_item_name_for_plant_match(item_name);
    match normalized.as_str() {
        "Crab Apples" => return Some(PlantType::CrabAppleSapling),
        _ => {}
    }
    
    // First try exact match
    let exact_match = PLANT_CONFIGS.iter()
        .find(|(_, config)| {
            // Check primary yield
            if config.primary_yield.0 == item_name {
                return true;
            }
            // Check secondary yield (e.g., Nettle Leaves from Boreal Nettle)
            if let Some(ref secondary) = config.secondary_yield {
                if secondary.0 == item_name {
                    return true;
                }
            }
            false
        })
        .map(|(plant_type, _)| *plant_type);
    
    if exact_match.is_some() {
        return exact_match;
    }
    
    // Try matching with normalized name (strips Cooked/Burnt prefix)
    let normalized = normalize_item_name_for_plant_match(item_name);
    if normalized == item_name {
        // No normalization happened, no point in trying again
        return None;
    }
    
    // Try matching the normalized name against primary/secondary yields
    PLANT_CONFIGS.iter()
        .find(|(_, config)| {
            // Check primary yield - need to handle "Raw Corn" -> "Corn" case
            let primary_normalized = normalize_item_name_for_plant_match(&config.primary_yield.0);
            if primary_normalized == normalized || config.primary_yield.0 == normalized {
                return true;
            }
            // Also check if raw item name without "Raw " prefix matches
            if config.primary_yield.0.starts_with("Raw ") {
                let without_raw = config.primary_yield.0.strip_prefix("Raw ").unwrap_or(&config.primary_yield.0);
                if without_raw == normalized {
                    return true;
                }
            }
            // Check secondary yield
            if let Some(ref secondary) = config.secondary_yield {
                let secondary_normalized = normalize_item_name_for_plant_match(&secondary.0);
                if secondary_normalized == normalized || secondary.0 == normalized {
                    return true;
                }
            }
            false
        })
        .map(|(plant_type, _)| *plant_type)
}

/// Seed drop chance when consuming plant-based food items
/// 25% is a low but meaningful chance - rewards eating raw/cooked veggies with occasional seeds
const SEED_DROP_CHANCE_ON_CONSUMPTION: f32 = 0.25;

/// Attempts to grant a seed when consuming a plant-based food item
/// Low chance (25%) to grant exactly 1 seed of the plant that produces this item
/// Works for raw, cooked, and burnt versions of food
fn try_grant_seed_from_consumption(
    ctx: &ReducerContext,
    player_id: Identity,
    item_name: &str,
) -> Result<(), String> {
    // Find which plant type produces this item (works for raw, cooked, burnt versions)
    let plant_type = match get_plant_type_from_item_name(item_name) {
        Some(pt) => pt,
        None => {
            // Not a plant-based item, that's fine
            return Ok(());
        }
    };
    
    // Check if this plant has seeds configured
    if !has_seed_drops(&plant_type) {
        // This plant doesn't have seeds, that's fine
        return Ok(());
    }
    
    // Get the seed type for this plant
    let seed_type = match get_seed_type_for_plant(&plant_type) {
        Some(st) => st,
        None => {
            // No seed type configured, that's fine
            return Ok(());
        }
    };
    
    // Low chance to grant one seed (configurable via constant)
    if ctx.rng().gen::<f32>() < SEED_DROP_CHANCE_ON_CONSUMPTION {
        let item_defs = ctx.db.item_definition();
        
        // Find the seed item definition
        let seed_item_def = item_defs.iter()
            .find(|def| def.name == seed_type)
            .ok_or_else(|| format!("Seed item definition '{}' not found", seed_type))?;
        
        // Grant exactly 1 seed
        match crate::dropped_item::try_give_item_to_player(ctx, player_id, seed_item_def.id, 1) {
            Ok(added_to_inventory) => {
                if added_to_inventory {
                    log::info!("Player {:?} received 1 seed: {} (added to inventory) from consuming {}.", 
                              player_id, seed_type, item_name);
                } else {
                    log::info!("Player {:?} received 1 seed: {} (dropped near player - inventory full) from consuming {}.", 
                              player_id, seed_type, item_name);
                }
            }
            Err(e) => {
                log::error!("Failed to give seed {} to player {:?}: {}", seed_type, player_id, e);
                return Err(format!("Failed to give seed: {}", e));
            }
        }
    }
    
    Ok(())
}

/// Consume a filled water container (bottles/jugs) to replenish thirst
#[spacetimedb::reducer]
pub fn consume_filled_water_container(ctx: &ReducerContext, item_instance_id: u64) -> Result<(), String> {
    let sender_id = ctx.sender;
    let players_table = ctx.db.player();
    let item_defs = ctx.db.item_definition();

    log::info!("[ConsumeWater] Player {:?} attempting to drink from container instance {}", sender_id, item_instance_id);

    let mut player_to_update = players_table.identity().find(&sender_id)
        .ok_or_else(|| "Player not found.".to_string())?;

    // --- Check player state first ---
    if player_to_update.is_dead {
        return Err("Cannot drink while dead.".to_string());
    }
    if player_to_update.is_knocked_out {
        return Err("Cannot drink while knocked out.".to_string());
    }

    // --- Check consumption cooldown ---
    if let Some(last_consumed_ts) = player_to_update.last_consumed_at {
        let cooldown_duration = TimeDuration::from_micros(CONSUMPTION_COOLDOWN_MICROS as i64);
        if ctx.timestamp < last_consumed_ts + cooldown_duration {
            return Err("You are consuming items too quickly.".to_string());
        }
    }

    let water_container = ctx.db.inventory_item().instance_id().find(item_instance_id)
        .ok_or_else(|| format!("Water container instance {} not found.", item_instance_id))?;

    // --- Check if the item is in player's possession ---
    let is_in_possession = match &water_container.location {
        ItemLocation::Inventory(data) => data.owner_id == sender_id,
        ItemLocation::Hotbar(data) => data.owner_id == sender_id,
        _ => false,
    };

    if !is_in_possession {
        return Err("Cannot consume a water container not in your inventory or hotbar.".to_string());
    }

    // --- Get item definition ---
    let item_def = item_defs.id().find(&water_container.item_def_id)
        .ok_or_else(|| "Water container definition not found.".to_string())?;

    // --- Check if container has water ---
    let water_content = crate::items::get_water_content(&water_container)
        .ok_or_else(|| "Water container is empty.".to_string())?;

    // --- Verify it's a valid water container type ---
    if !matches!(item_def.name.as_str(), "Reed Water Bottle" | "Plastic Water Jug") {
        return Err("Item is not a water container.".to_string());
    }

    // --- Check if water is salt water ---
    let is_salt_water = crate::items::is_salt_water(&water_container);

    // --- Calculate consumption amount (250mL per sip) ---
    const CONSUMPTION_AMOUNT_LITERS: f32 = 0.25; // 250mL per right-click
    let actual_consumption = water_content.min(CONSUMPTION_AMOUNT_LITERS);
    
    // --- Calculate thirst value based on container type ---
    // Different containers have different efficiency (rewards preparation!)
    // Reed Water Bottle: 50 thirst/L (12.5 per 250mL) - portable convenience
    // Plastic Water Jug: 60 thirst/L (15.0 per 250mL) - best efficiency for prepared players
    let thirst_per_liter = match item_def.name.as_str() {
        "Reed Water Bottle" => 50.0,  // 2L bottle = 100 thirst when full (40% of max 250)
        "Plastic Water Jug" => 60.0,  // 5L jug = 300 thirst when full (fully restores)
        _ => 50.0, // Default fallback
    };
    
    // Salt water: NO immediate thirst change (dehydration happens over time via SeawaterPoisoning effect)
    // Fresh water: immediate hydration based on container efficiency
    let thirst_value = if is_salt_water {
        // Salt water causes NO immediate thirst change - the SeawaterPoisoning effect will drain thirst over time
        0.0
    } else {
        // Fresh water hydrates - rate depends on container type
        actual_consumption * thirst_per_liter
    };

    // --- Apply thirst restoration ---
    let old_thirst = player_to_update.thirst;
    let new_thirst = (player_to_update.thirst + thirst_value).clamp(MIN_STAT_VALUE, MAX_THIRST_VALUE);
    player_to_update.thirst = new_thirst;
    player_to_update.last_consumed_at = Some(ctx.timestamp);

    // --- Update water content (reduce by consumption amount) ---
    let mut container_to_update = water_container.clone();
    let remaining_water = water_content - actual_consumption;
    if remaining_water <= 0.001 { // Account for floating point precision
        crate::items::clear_water_content(&mut container_to_update); // Empty the container
    } else {
        // Preserve salt water status when updating remaining water
        crate::items::set_water_content_with_salt(&mut container_to_update, remaining_water, is_salt_water)?;
    }
    ctx.db.inventory_item().instance_id().update(container_to_update);

    // --- Update player ---
    players_table.identity().update(player_to_update.clone());

    // --- Handle salt water effects ---
    if is_salt_water {
        // Salt water - unpleasant throwing up sound
        crate::sound_events::emit_throwing_up_sound(ctx, player_to_update.position_x, player_to_update.position_y, sender_id);
        
        // Apply seawater poisoning effect (drains 2.5 thirst per second = 25 total thirst drain over 10 seconds)
        const SEAWATER_POISONING_DURATION: u32 = 10; // 10 seconds
        match crate::active_effects::apply_seawater_poisoning_effect(ctx, sender_id, SEAWATER_POISONING_DURATION) {
            Ok(_) => {
                log::info!("Applied seawater poisoning effect to player {:?} for {} seconds", 
                          sender_id, SEAWATER_POISONING_DURATION);
            }
            Err(e) => {
                log::error!("Failed to apply seawater poisoning effect to player {:?}: {}", sender_id, e);
            }
        }
    } else {
        // Fresh water - normal drinking sound
        crate::sound_events::emit_drinking_water_sound(ctx, player_to_update.position_x, player_to_update.position_y, sender_id);
    }

    // --- Apply visual drinking effect ---
    const WATER_DRINKING_DURATION: f32 = 2.0; // 2 seconds of shake animation
    if let Err(e) = crate::active_effects::apply_water_drinking_effect(ctx, sender_id, item_def.id, WATER_DRINKING_DURATION) {
        log::error!("Failed to apply water drinking visual effect for player {:?}: {}", sender_id, e);
        // Don't fail the consumption - visual effect is optional
    }

    log::info!("Player {:?} drank {:.3}L from {} and restored {:.1} thirst ({:.1} -> {:.1}). Remaining water: {:.3}L", 
               sender_id, actual_consumption, item_def.name, thirst_value, old_thirst, new_thirst, remaining_water);

    Ok(())
}