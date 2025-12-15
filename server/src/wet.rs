use spacetimedb::{ReducerContext, Table, Identity, Timestamp, TimeDuration};
use log;
use crate::active_effects::{ActiveConsumableEffect, EffectType, active_consumable_effect as ActiveConsumableEffectTableTrait};
use crate::Player;
use crate::player;
use crate::shelter::shelter;
// Import armor module for immunity checks
use crate::armor;
use crate::models::ImmunityType;
// Import chunk calculation for chunk-based weather
use crate::environment::calculate_chunk_index;

// Constants for wet effect
pub const WET_COLD_DAMAGE_MULTIPLIER: f32 = 2.0; // Double cold damage when wet
pub const WET_WARMTH_DRAIN_PER_SECOND: f32 = 0.15; // Additional warmth loss per second when wet (further reduced for balance)
pub const WET_LINGER_DURATION_SECONDS: u32 = 60; // How long wet effect lasts after leaving water/rain
pub const WET_EFFECT_CHECK_INTERVAL_SECONDS: u32 = 2; // Check wet conditions every 2 seconds
pub const WET_NORMAL_DECAY_RATE_SECONDS: u32 = 1; // How many seconds to remove from wet timer normally (1 second per 1-second interval)
pub const WET_FAST_DECAY_RATE_SECONDS: u32 = 6; // How many seconds to remove from wet timer when near warmth (6 seconds per 1-second interval - very fast!)
pub const WET_TREE_DECAY_RATE_SECONDS: u32 = 3; // How many seconds to remove from wet timer when near trees (3 seconds per 1-second interval - moderate drying)

/// Applies a wet effect to a player
/// This creates a long-duration effect that will be removed by environmental conditions
pub fn apply_wet_effect(ctx: &ReducerContext, player_id: Identity, reason: &str) -> Result<(), String> {
    // <<< CHECK WETNESS IMMUNITY FROM ARMOR >>>
    if armor::has_armor_immunity(ctx, player_id, ImmunityType::Wetness) {
        log::info!("Player {:?} is immune to wetness effects (armor immunity)", player_id);
        return Ok(()); // Silently ignore wet effect application
    }
    // <<< END WETNESS IMMUNITY CHECK >>>
    
    // Check if player already has wet effect - if so, just refresh the duration
    let existing_wet_effects: Vec<_> = ctx.db.active_consumable_effect().iter()
        .filter(|e| e.player_id == player_id && e.effect_type == EffectType::Wet)
        .collect();

    let current_time = ctx.timestamp;
    let linger_duration = TimeDuration::from_micros((WET_LINGER_DURATION_SECONDS as i64) * 1_000_000);
    let new_end_time = current_time + linger_duration;

    if !existing_wet_effects.is_empty() {
        // Refresh existing wet effect duration
        for existing_effect in existing_wet_effects {
            let mut updated_effect = existing_effect.clone();
            updated_effect.ends_at = new_end_time; // Reset the timer
            
            ctx.db.active_consumable_effect().effect_id().update(updated_effect);
            log::info!("Refreshed wet effect {} for player {:?} due to {} (duration reset to {}s)", 
                existing_effect.effect_id, player_id, reason, WET_LINGER_DURATION_SECONDS);
        }
        return Ok(());
    }

    // Create new wet effect
    let wet_effect = ActiveConsumableEffect {
        effect_id: 0, // auto_inc
        player_id,
        target_player_id: None,
        item_def_id: 0, // Not from an item
        consuming_item_instance_id: None,
        started_at: current_time,
        ends_at: new_end_time,
        total_amount: None, // No accumulation for wet effect
        amount_applied_so_far: None,
        effect_type: EffectType::Wet,
        tick_interval_micros: 1_000_000, // 1 second ticks (not really used)
        next_tick_at: current_time + TimeDuration::from_micros(1_000_000),
    };
    
    match ctx.db.active_consumable_effect().try_insert(wet_effect) {
        Ok(inserted_effect) => {
            log::info!("Applied wet effect {} to player {:?} due to {} (duration: {}s)", 
                inserted_effect.effect_id, player_id, reason, WET_LINGER_DURATION_SECONDS);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to apply wet effect to player {:?}: {:?}", player_id, e);
            Err("Failed to apply wet effect".to_string())
        }
    }
}

/// Removes wet effect from a player
pub fn remove_wet_effect(ctx: &ReducerContext, player_id: Identity, reason: &str) -> u32 {
    let mut effects_to_remove = Vec::new();
    for effect in ctx.db.active_consumable_effect().iter() {
        if effect.player_id == player_id && effect.effect_type == EffectType::Wet {
            effects_to_remove.push(effect.effect_id);
        }
    }
    
    let removed_count = effects_to_remove.len() as u32;
    for effect_id in effects_to_remove {
        ctx.db.active_consumable_effect().effect_id().delete(&effect_id);
        log::info!("Removed wet effect {} from player {:?} due to {}", effect_id, player_id, reason);
    }
    
    removed_count
}

/// Checks if a player currently has the wet effect active
pub fn player_has_wet_effect(ctx: &ReducerContext, player_id: Identity) -> bool {
    ctx.db.active_consumable_effect().iter()
        .any(|effect| effect.player_id == player_id && effect.effect_type == EffectType::Wet)
}

/// Checks if it's currently raining at a specific position (any intensity > 0)
fn is_raining_at_position(ctx: &ReducerContext, pos_x: f32, pos_y: f32) -> bool {
    use crate::world_state::chunk_weather as ChunkWeatherTableTrait;
    
    // Calculate chunk index for the player's position
    let chunk_index = calculate_chunk_index(pos_x, pos_y);
    
    // Check chunk-based weather first
    if let Some(chunk_weather) = ctx.db.chunk_weather().chunk_index().find(&chunk_index) {
        return chunk_weather.rain_intensity > 0.0;
    }
    
    // Fallback to global weather if chunk weather not found (backward compatibility)
    use crate::world_state::world_state as WorldStateTableTrait;
    if let Some(world_state) = ctx.db.world_state().iter().next() {
        world_state.rain_intensity > 0.0
    } else {
        false
    }
}

/// Checks if a player should get wet due to environmental conditions
/// Returns (should_be_wet, reason)
pub fn should_player_be_wet(ctx: &ReducerContext, player_id: Identity, player: &Player) -> (bool, String) {
    // Check if player is standing on water
    if crate::is_player_on_water(ctx, player.position_x, player.position_y) {
        return (true, "standing in water".to_string());
    }
    
    // Check if it's raining at player's position and player is not protected
    if is_raining_at_position(ctx, player.position_x, player.position_y) && !is_player_protected_from_rain(ctx, player) {
        return (true, "exposed to rain".to_string());
    }
    
    (false, String::new())
}


/// Checks if a player is protected from rain (inside shelter, building, near campfire, or has tree cover)
fn is_player_protected_from_rain(ctx: &ReducerContext, player: &Player) -> bool {
    use crate::shelter::shelter as ShelterTableTrait;
    use crate::campfire::campfire as CampfireTableTrait;
    use crate::fishing_village_part as FishingVillagePartTableTrait;
    
    // Fishing village campfire warmth radius for rain protection (same as cozy radius)
    const FISHING_VILLAGE_WARMTH_RADIUS: f32 = 450.0;
    const FISHING_VILLAGE_WARMTH_RADIUS_SQ: f32 = FISHING_VILLAGE_WARMTH_RADIUS * FISHING_VILLAGE_WARMTH_RADIUS;
    
    // Check if player is inside any shelter
    for shelter in ctx.db.shelter().iter() {
        if shelter.is_destroyed {
            continue;
        }
        
        if crate::shelter::is_player_inside_shelter(player.position_x, player.position_y, &shelter) {
            return true;
        }
    }
    
    // NEW: Check if player is inside an enclosed building (foundation + walls)
    if crate::building_enclosure::is_player_inside_building(ctx, player.position_x, player.position_y) {
        return true;
    }
    
    // Check if player is near any burning campfire (warmth radius provides rain protection)
    for campfire in ctx.db.campfire().iter() {
        if !campfire.is_burning {
            continue;
        }
        
        let dx = player.position_x - campfire.pos_x;
        let dy = player.position_y - campfire.pos_y;
        let distance_squared = dx * dx + dy * dy;
        
        if distance_squared <= crate::campfire::WARMTH_RADIUS_SQUARED {
            return true;
        }
    }
    
    // Check if player is near the fishing village communal campfire (always burning, provides rain protection)
    for part in ctx.db.fishing_village_part().iter() {
        if part.part_type == "campfire" {
            let dx = player.position_x - part.world_x;
            let dy = player.position_y - part.world_y;
            let distance_squared = dx * dx + dy * dy;
            
            if distance_squared <= FISHING_VILLAGE_WARMTH_RADIUS_SQ {
                log::debug!("Player {:?} is protected from rain by fishing village campfire", player.identity);
                return true;
            }
        }
    }
    
    // Check if player has tree cover effect (natural shelter)
    if crate::active_effects::player_has_tree_cover_effect(ctx, player.identity) {
        return true;
    }
    
    false
}

/// Updates player wet status based on current environmental conditions
/// This should be called periodically for all players
pub fn update_player_wet_status(ctx: &ReducerContext, player_id: Identity, player: &Player) -> Result<(), String> {
    let (should_be_wet, reason) = should_player_be_wet(ctx, player_id, player);
    let has_wet_effect = player_has_wet_effect(ctx, player_id);
    let has_cozy_effect = crate::active_effects::player_has_cozy_effect(ctx, player_id);
    
    log::debug!("Wet status check for player {:?}: should_be_wet={} ({}), has_wet_effect={}, has_cozy_effect={}", 
        player_id, should_be_wet, reason, has_wet_effect, has_cozy_effect);
    
    if should_be_wet && !has_wet_effect {
        // Apply wet effect
        log::info!("Applying wet effect to player {:?} due to {}", player_id, reason);
        apply_wet_effect(ctx, player_id, &reason)?;
    } else if should_be_wet && has_wet_effect {
        // Player is still wet and should be - refresh the effect duration
        apply_wet_effect(ctx, player_id, &reason)?;
    }
    // Note: Removed immediate cozy effect removal - let the decay system handle it naturally
    // If player is not wet and doesn't have wet effect, or if they have wet effect but it should naturally expire, do nothing
    
    Ok(())
}

/// Checks for environmental conditions that should apply wet effects or accelerate decay
/// Normal time-based expiration is now handled by the standard effect system
pub fn check_and_remove_wet_from_environment(ctx: &ReducerContext) -> Result<(), String> {
    use crate::player;
    
    // First, check all players to see if they should get wet effects
    for player in ctx.db.player().iter() {
        if !player.is_online || player.is_dead {
            continue;
        }
        
        let player_id = player.identity;
        let has_wet_effect = player_has_wet_effect(ctx, player_id);
        let (should_be_wet, reason) = should_player_be_wet(ctx, player_id, &player);
        
        if should_be_wet && !has_wet_effect {
            // Apply wet effect
            log::info!("Applying wet effect to player {:?} due to {}", player_id, reason);
            apply_wet_effect(ctx, player_id, &reason)?;
        } else if should_be_wet && has_wet_effect {
            // Player is still wet and should be - refresh the effect duration
            apply_wet_effect(ctx, player_id, &reason)?;
        }
        
        // NEW: Update indoor/protected state for status effect display
        // Check BOTH shelters (fast AABB) and buildings (slower perimeter check)
        let mut is_inside_shelter = false;
        for shelter in ctx.db.shelter().iter() {
            if shelter.is_destroyed {
                continue;
            }
            if crate::shelter::is_player_inside_shelter(player.position_x, player.position_y, &shelter) {
                is_inside_shelter = true;
                break;
            }
        }
        
        // Only check building perimeter if NOT already in shelter (optimization)
        let is_inside_building = if is_inside_shelter {
            false // Skip expensive check
        } else {
            crate::building_enclosure::is_player_inside_building(
                ctx, 
                player.position_x, 
                player.position_y
            )
        };
        
        let is_indoors = is_inside_shelter || is_inside_building;
        
        // Only update if state changed to avoid unnecessary DB writes
        if player.is_inside_building != is_indoors {
            let mut updated_player = player.clone();
            updated_player.is_inside_building = is_indoors;
            ctx.db.player().identity().update(updated_player);
            log::debug!(
                "Player {:?} indoor state changed: {} -> {} (shelter={}, building={})",
                player_id, player.is_inside_building, is_indoors, is_inside_shelter, is_inside_building
            );
        }
    }
    
    // Then, check for accelerated decay when near warmth (cozy effect)
    // Normal time-based decay is now handled by the standard effect processing system
    let wet_effects: Vec<ActiveConsumableEffect> = ctx.db.active_consumable_effect().iter()
        .filter(|effect| effect.effect_type == EffectType::Wet)
        .collect();

    for effect in wet_effects {
        let player_id = effect.player_id;
        
        if let Some(player) = ctx.db.player().identity().find(&player_id) {
            let is_raining_now = is_raining_at_position(ctx, player.position_x, player.position_y);
            let is_protected_from_rain = is_player_protected_from_rain(ctx, &player);
            let is_in_water = crate::is_player_on_water(ctx, player.position_x, player.position_y);
            let has_cozy_effect = crate::active_effects::player_has_cozy_effect(ctx, player_id);
            
            // Check if player is still actively getting wet
            let still_getting_wet = is_in_water || (is_raining_now && !is_protected_from_rain);
            
            if still_getting_wet {
                // Player is still getting wet - don't decay, just continue
                continue;
            }
            
            let has_tree_cover_effect = crate::active_effects::player_has_tree_cover_effect(ctx, player_id);
            
            // Apply accelerated decay based on environment - effects can stack!
            let mut accelerated_decay_amount = 0;
            let mut decay_reasons = Vec::new();
            
            if has_cozy_effect {
                // Cozy effect (campfire/shelter) provides fastest drying
                accelerated_decay_amount += WET_FAST_DECAY_RATE_SECONDS - WET_NORMAL_DECAY_RATE_SECONDS;
                decay_reasons.push("cozy effect (warmth)");
            }
            
            if has_tree_cover_effect {
                // Tree cover provides moderate drying (can stack with cozy!)
                accelerated_decay_amount += WET_TREE_DECAY_RATE_SECONDS - WET_NORMAL_DECAY_RATE_SECONDS;
                decay_reasons.push("tree cover");
            }
            
            // 👕 ARMOR-BASED DRYING: Cloth armor dries faster
            let armor_drying_multiplier = armor::calculate_drying_speed_multiplier(ctx, player_id);
            if armor_drying_multiplier > 1.0 {
                // Apply cloth armor bonus to the base decay rate
                let armor_bonus = ((WET_NORMAL_DECAY_RATE_SECONDS as f32) * (armor_drying_multiplier - 1.0)) as u32;
                if armor_bonus > 0 {
                    accelerated_decay_amount += armor_bonus;
                    decay_reasons.push("cloth armor (fast drying)");
                }
            }
            
            let decay_reason = if decay_reasons.len() > 1 {
                format!("{} (stacked effects)", decay_reasons.join(" + "))
            } else if decay_reasons.len() == 1 {
                decay_reasons[0].to_string()
            } else {
                String::new()
            };
            
            if accelerated_decay_amount > 0 {
                let current_time = ctx.timestamp;
                let decay_duration = TimeDuration::from_micros((accelerated_decay_amount as i64) * 1_000_000);
                let new_end_time = effect.ends_at - decay_duration;
                
                log::info!("WET ACCELERATED DECAY: player={:?}, extra_decay={}s due to {}", 
                    player_id, accelerated_decay_amount, decay_reason);
                
                // If the new end time is in the past, remove the effect entirely
                if new_end_time <= current_time {
                    remove_wet_effect(ctx, player_id, &format!("accelerated drying from {}", decay_reason));
                    log::info!("WET EFFECT REMOVED: player={:?}, reason={}", player_id, decay_reason);
                } else {
                    // Update the effect with reduced duration
                    let mut updated_effect = effect.clone();
                    updated_effect.ends_at = new_end_time;
                    ctx.db.active_consumable_effect().effect_id().update(updated_effect);
                    log::info!("WET EFFECT ACCELERATED: player={:?}, new_end_time={:?}, reason={}", 
                        player_id, new_end_time, decay_reason);
                }
            }
        }
    }

    Ok(())
} 