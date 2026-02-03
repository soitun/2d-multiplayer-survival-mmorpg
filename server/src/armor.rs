use spacetimedb::{Identity, ReducerContext, Table};
use crate::active_equipment::{ActiveEquipment, active_equipment as ActiveEquipmentTableTrait};
use crate::items::{ItemDefinition, item_definition as ItemDefinitionTableTrait, InventoryItem, inventory_item as InventoryItemTableTrait};
use crate::models::{EquipmentSlotType, DamageType, ImmunityType, ArmorResistances}; // For matching slot types and new armor system
use log;

/// Calculates the total damage resistance from all equipped armor pieces.
/// Resistance is a float (e.g., 0.1 for 10%), and they stack additively for now.
pub fn calculate_total_damage_resistance(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let active_equipments = ctx.db.active_equipment();
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    let mut total_resistance = 0.0;

    if let Some(equipment) = active_equipments.player_identity().find(player_id) {
        let armor_instance_ids = [
            equipment.head_item_instance_id,
            equipment.chest_item_instance_id,
            equipment.legs_item_instance_id,
            equipment.feet_item_instance_id,
            equipment.hands_item_instance_id,
            equipment.back_item_instance_id,
        ];

        for maybe_instance_id in armor_instance_ids.iter().flatten() {
            if let Some(item_instance) = inventory_items.instance_id().find(*maybe_instance_id) {
                if let Some(item_def) = item_defs.id().find(item_instance.item_def_id) {
                    if let Some(resistance) = item_def.damage_resistance {
                        total_resistance += resistance;
                        // log::trace!("[Armor] Player {:?} adding resistance {:.2}% from {} (Instance ID: {})", 
                        //            player_id, resistance * 100.0, item_def.name, *maybe_instance_id);
                    }
                }
            }
        }
    }
    // Clamp resistance to a max (e.g., 90%) to prevent invulnerability
    total_resistance.min(0.9) 
}

/// Calculates the total warmth bonus from all equipped armor pieces.
/// Warmth bonus is a float value added to the player's warmth regeneration or subtracted from warmth loss.
pub fn calculate_total_warmth_bonus(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let active_equipments = ctx.db.active_equipment();
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    let mut total_warmth_bonus = 0.0;

    if let Some(equipment) = active_equipments.player_identity().find(player_id) {
        let armor_instance_ids = [
            equipment.head_item_instance_id,
            equipment.chest_item_instance_id,
            equipment.legs_item_instance_id,
            equipment.feet_item_instance_id,
            equipment.hands_item_instance_id,
            equipment.back_item_instance_id,
        ];

        for maybe_instance_id in armor_instance_ids.iter().flatten() {
            if let Some(item_instance) = inventory_items.instance_id().find(*maybe_instance_id) {
                if let Some(item_def) = item_defs.id().find(item_instance.item_def_id) {
                    if let Some(warmth) = item_def.warmth_bonus {
                        total_warmth_bonus += warmth;
                         // log::trace!("[Armor] Player {:?} adding warmth bonus {:.2} from {} (Instance ID: {})", 
                         //           player_id, warmth, item_def.name, *maybe_instance_id);
                    }
                }
            }
        }
    }
    total_warmth_bonus
}

/// Helper function to get all equipped armor pieces for a player
pub fn get_equipped_armor_pieces(ctx: &ReducerContext, player_id: Identity) -> Vec<ItemDefinition> {
    let active_equipments = ctx.db.active_equipment();
    let inventory_items = ctx.db.inventory_item();
    let item_defs = ctx.db.item_definition();
    let mut armor_pieces = Vec::new();

    if let Some(equipment) = active_equipments.player_identity().find(&player_id) {
        let armor_instance_ids = [
            equipment.head_item_instance_id,
            equipment.chest_item_instance_id,
            equipment.legs_item_instance_id,
            equipment.feet_item_instance_id,
            equipment.hands_item_instance_id,
            equipment.back_item_instance_id,
        ];

        for maybe_instance_id in armor_instance_ids.iter().flatten() {
            if let Some(item_instance) = inventory_items.instance_id().find(maybe_instance_id) {
                if let Some(item_def) = item_defs.id().find(&item_instance.item_def_id) {
                    armor_pieces.push(item_def);
                }
            }
        }
    }
    armor_pieces
}

/// Calculates total resistance for a specific damage type from all equipped armor
pub fn calculate_resistance_for_damage_type(
    ctx: &ReducerContext,
    player_id: Identity,
    damage_type: DamageType,
) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut total_resistance = 0.0;

    for armor_piece in armor_pieces {
        if let Some(resistances) = &armor_piece.armor_resistances {
            let resistance = match damage_type {
                DamageType::Melee => resistances.melee_resistance,
                DamageType::Projectile => resistances.projectile_resistance,
                DamageType::Fire => resistances.fire_resistance,
                DamageType::Blunt => resistances.blunt_resistance,
                DamageType::Slash => resistances.slash_resistance,
                DamageType::Pierce => resistances.pierce_resistance,
                DamageType::Environmental => 0.0, // Environmental damage not affected by armor
            };
            total_resistance += resistance;
        }
    }

    // Cap resistance at 90% (0.9) to prevent invulnerability
    total_resistance.min(0.9)
}

/// Checks if player has a specific immunity based on equipped armor
pub fn has_armor_immunity(
    ctx: &ReducerContext,
    player_id: Identity,
    immunity_type: ImmunityType,
) -> bool {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    
    // Count pieces that grant the immunity
    let mut immunity_count = 0;
    
    // Different immunities require different numbers of pieces
    let required_pieces = match immunity_type {
        ImmunityType::Burn => 5,      // Need 5 bone pieces for burn immunity
        ImmunityType::Cold => 5,      // Need 5 fur pieces for cold immunity
        ImmunityType::Wetness => 5,   // Need 5 scale pieces for wetness immunity
        ImmunityType::Knockback => 5, // Need 5 scale pieces for knockback immunity
        ImmunityType::Bleed => 3,     // Need 3 leather pieces for bleed immunity
    };
    
    for armor_piece in armor_pieces {
        match immunity_type {
            ImmunityType::Burn if armor_piece.grants_burn_immunity => immunity_count += 1,
            ImmunityType::Cold if armor_piece.grants_cold_immunity => immunity_count += 1,
            ImmunityType::Wetness if armor_piece.grants_wetness_immunity => immunity_count += 1,
            ImmunityType::Knockback if armor_piece.grants_knockback_immunity => immunity_count += 1,
            ImmunityType::Bleed if armor_piece.grants_bleed_immunity => immunity_count += 1,
            _ => {}
        }
    }
    
    immunity_count >= required_pieces
}

/// Calculates fire damage multiplier from equipped armor (for wooden armor vulnerability)
pub fn calculate_fire_damage_multiplier(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut multiplier = 1.0;
    
    for armor_piece in armor_pieces {
        if let Some(fire_mult) = armor_piece.fire_damage_multiplier {
            multiplier *= fire_mult;
        }
    }
    
    multiplier
}

/// Calculates total movement speed modifier from equipped armor
pub fn calculate_movement_speed_modifier(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut speed_modifier = 0.0; // Additive modifier
    
    for armor_piece in armor_pieces {
        if let Some(modifier) = armor_piece.movement_speed_modifier {
            speed_modifier += modifier;
        }
    }
    
    speed_modifier
}

/// Calculates total stamina regeneration modifier from equipped armor
pub fn calculate_stamina_regen_modifier(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut stamina_modifier = 0.0; // Additive modifier
    
    for armor_piece in armor_pieces {
        if let Some(modifier) = armor_piece.stamina_regen_modifier {
            stamina_modifier += modifier;
        }
    }
    
    stamina_modifier
}

/// Calculates total melee damage reflection from equipped armor (wooden armor)
pub fn calculate_melee_damage_reflection(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut reflection = 0.0;
    
    for armor_piece in armor_pieces {
        if let Some(reflect) = armor_piece.reflects_melee_damage {
            reflection += reflect;
        }
    }
    
    // Cap at 50% reflection to prevent abuse
    reflection.min(0.5)
}

/// Calculates detection radius bonus from equipped armor (fox fur)
pub fn calculate_detection_radius_bonus(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut bonus = 0.0;
    
    for armor_piece in armor_pieces {
        if let Some(detection_bonus) = armor_piece.detection_radius_bonus {
            bonus += detection_bonus;
        }
    }
    
    bonus
}

/// Calculates low health damage bonus from equipped armor (wolf fur)
pub fn calculate_low_health_damage_bonus(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut bonus = 0.0;
    
    for armor_piece in armor_pieces {
        if let Some(dmg_bonus) = armor_piece.low_health_damage_bonus {
            bonus += dmg_bonus;
        }
    }
    
    bonus
}

/// Checks if player makes noise when sprinting (bone armor)
pub fn makes_noise_on_sprint(ctx: &ReducerContext, player_id: Identity) -> bool {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    
    for armor_piece in armor_pieces {
        if armor_piece.noise_on_sprint {
            return true;
        }
    }
    
    false
}

/// Checks if player has silent movement (fox fur boots)
/// Note: This only affects land walking/sprinting sounds, NOT swimming sounds.
/// Swimming sounds are always emitted regardless of fox fur boots.
pub fn has_silent_movement(ctx: &ReducerContext, player_id: Identity) -> bool {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    
    for armor_piece in armor_pieces {
        if armor_piece.silences_movement {
            return true;
        }
    }
    
    false
}

/// Calculates total cold resistance from all equipped armor (graduated, not immunity)
/// Each piece of Fox/Wolf Fur provides 20% cold resistance (up to 100%)
pub fn calculate_cold_resistance(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut total_resistance = 0.0;

    for armor_piece in armor_pieces {
        if let Some(resistances) = &armor_piece.armor_resistances {
            total_resistance += resistances.cold_resistance;
        }
    }

    // Cap resistance at 100% (1.0) 
    total_resistance.min(1.0)
}

/// Calculates drying speed multiplier based on armor type
/// Cloth armor dries faster (1.5x) because it's lightweight and breathable
pub fn calculate_drying_speed_multiplier(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    
    if armor_pieces.is_empty() {
        return 1.0; // No armor = normal drying
    }
    
    // Count cloth armor pieces
    let mut cloth_count = 0;
    let mut total_count = 0;
    
    for armor_piece in armor_pieces {
        total_count += 1;
        if armor_piece.name.contains("Cloth") {
            cloth_count += 1;
        }
    }
    
    // Cloth armor dries faster (majority cloth = 1.5x speed)
    if cloth_count > total_count / 2 {
        1.5 // Cloth dries 50% faster
    } else {
        1.0 // All other armor = normal drying
    }
}

/// Checks if player intimidates animals (wolf fur)
pub fn intimidates_animals(ctx: &ReducerContext, player_id: Identity) -> bool {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    
    for armor_piece in armor_pieces {
        if armor_piece.intimidates_animals {
            return true;
        }
    }
    
    false
}

/// Calculates the total water speed bonus from all equipped armor pieces.
/// Water speed bonus is additive - 1.0 = +100% speed (2x normal), 0.5 = +50% speed
/// Primarily used by Reed Flippers but could apply to other aquatic gear.
pub fn calculate_water_speed_bonus(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut total_bonus = 0.0;

    for armor_piece in armor_pieces {
        if let Some(bonus) = armor_piece.water_speed_bonus {
            total_bonus += bonus;
            log::trace!(
                "[Armor] Player {:?} adding water speed bonus {:.2}% from {}", 
                player_id, bonus * 100.0, armor_piece.name
            );
        }
    }

    // Cap at 200% bonus (3x speed) to prevent absurd speeds
    total_bonus.min(2.0)
}

// === BONE TOTEM PASSIVE BONUS FUNCTIONS ===

/// Calculates melee damage bonus from equipped armor (Tanuux Totem - Polar Bear)
pub fn calculate_melee_damage_bonus(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut bonus = 0.0;
    
    for armor_piece in armor_pieces {
        if let Some(dmg_bonus) = armor_piece.melee_damage_bonus {
            bonus += dmg_bonus;
        }
    }
    
    bonus
}

/// Calculates ally damage bonus from equipped armor (Sabaakax Totem - Wolf)
pub fn calculate_ally_damage_bonus(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut bonus = 0.0;
    
    for armor_piece in armor_pieces {
        if let Some(ally_bonus) = armor_piece.ally_damage_bonus {
            bonus += ally_bonus;
        }
    }
    
    bonus
}

/// Gets poison damage on hit from equipped armor (Qax'aadax Totem - Viper)
pub fn get_poison_damage_on_hit(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut total_poison = 0.0;
    
    for armor_piece in armor_pieces {
        if let Some(poison) = armor_piece.poison_damage_on_hit {
            total_poison += poison;
        }
    }
    
    total_poison
}

/// Gets bleed chance on melee hit from equipped armor (Alax Totem - Shark)
pub fn get_bleed_chance_on_melee(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut total_chance = 0.0;
    
    for armor_piece in armor_pieces {
        if let Some(chance) = armor_piece.bleed_chance_on_melee {
            total_chance += chance;
        }
    }
    
    // Cap at 100% chance
    total_chance.min(1.0)
}

/// Calculates harvest yield bonus from equipped armor (Tunux Charm - Vole)
pub fn calculate_harvest_bonus(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut bonus = 0.0;
    
    for armor_piece in armor_pieces {
        if let Some(harvest_bonus) = armor_piece.harvest_bonus {
            bonus += harvest_bonus;
        }
    }
    
    bonus
}

/// Gets max health bonus from equipped armor (Tugix Totem - Walrus)
pub fn get_max_health_bonus(ctx: &ReducerContext, player_id: Identity) -> i32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut bonus = 0;
    
    for armor_piece in armor_pieces {
        if let Some(health_bonus) = armor_piece.max_health_bonus {
            bonus += health_bonus;
        }
    }
    
    bonus
}

/// Gets animal detection reduction from equipped armor (Kayux Amulet - Fox)
/// Returns a value between 0.0 and 1.0 representing the % reduction in animal detection radius
pub fn get_reduces_animal_detection(ctx: &ReducerContext, player_id: Identity) -> f32 {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    let mut reduction = 0.0;
    
    for armor_piece in armor_pieces {
        if let Some(detect_reduction) = armor_piece.reduces_animal_detection {
            reduction += detect_reduction;
        }
    }
    
    // Cap at 80% reduction to always allow some detection
    reduction.min(0.8)
}

/// Checks if player has night vision from equipped armor (Angunax Totem - Owl)
pub fn has_night_vision(ctx: &ReducerContext, player_id: Identity) -> bool {
    let armor_pieces = get_equipped_armor_pieces(ctx, player_id);
    
    for armor_piece in armor_pieces {
        if armor_piece.grants_night_vision {
            return true;
        }
    }
    
    false
}