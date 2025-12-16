# Combat System

This document describes the combat mechanics in the game.

## Overview

The combat system (`server/src/combat.rs`) handles:
- Melee attacks (tools, weapons)
- Ranged attacks (bows, crossbows)
- Resource gathering (harvesting)
- Player vs Player (PvP) damage
- Player vs Environment (PvE) damage
- Damage types and resistances

## Core Components

### Target Types

```rust
pub enum TargetType {
    Tree,
    Stone,
    Player,
    Animal,
    Structure,    // Campfire, storage box, etc.
    Grass,
    RuneStone,
    // ... more
}

pub enum TargetId {
    Tree(u64),
    Stone(u64),
    Player(Identity),
    Campfire(u32),
    WildAnimal(u64),
    // ... etc.
}
```

### Damage Types

```rust
pub enum DamageType {
    Slash,      // Swords, axes
    Blunt,      // Hammers, clubs
    Pierce,     // Spears, arrows
    Fire,       // Torches, fire arrows
    Cold,       // Ice weapons (future)
    Poison,     // Poisoned weapons
}
```

### Attack Result

```rust
pub struct AttackResult {
    pub hit: bool,
    pub target_type: Option<TargetType>,
    pub resource_granted: Option<(String, u32)>,  // (resource_name, amount)
}
```

## Attack Flow

### 1. Player Initiates Attack

Client sends attack reducer call:
```rust
#[spacetimedb::reducer]
pub fn attack(ctx: &ReducerContext, target_x: f32, target_y: f32)
```

### 2. Target Detection

```rust
// Calculate player's forward vector from facing direction
let forward = get_player_forward_vector(&player.direction);

// Find potential targets in attack range
let targets = find_targets_in_range(
    ctx,
    player.pos_x,
    player.pos_y,
    forward,
    weapon_range,
    weapon_arc,  // Attack cone width
);
```

### 3. Target Prioritization

Targets are sorted by:
1. Distance (closest first)
2. Type priority (players > animals > resources)

```rust
fn prioritize_targets(targets: &mut Vec<Target>) {
    targets.sort_by(|a, b| {
        // Primary: type priority
        let type_priority_a = get_type_priority(a.target_type);
        let type_priority_b = get_type_priority(b.target_type);
        
        if type_priority_a != type_priority_b {
            return type_priority_a.cmp(&type_priority_b);
        }
        
        // Secondary: distance
        a.distance_sq.partial_cmp(&b.distance_sq).unwrap()
    });
}
```

### 4. Damage Calculation

```rust
fn calculate_damage(
    weapon: &ItemDefinition,
    target_type: TargetType,
    attacker_buffs: &[ActiveEffect],
    target_armor: Option<&ArmorStats>,
) -> u32 {
    // Base damage from weapon
    let base_damage = rand_range(
        weapon.pvp_damage_min.unwrap_or(1),
        weapon.pvp_damage_max.unwrap_or(5)
    );
    
    // Apply attacker buffs
    let buffed_damage = apply_attack_buffs(base_damage, attacker_buffs);
    
    // Apply target resistances
    let final_damage = if let Some(armor) = target_armor {
        apply_resistance(buffed_damage, weapon.damage_type, armor)
    } else {
        buffed_damage
    };
    
    final_damage
}
```

### 5. Damage Application

```rust
fn apply_damage_to_player(
    ctx: &ReducerContext,
    target: &mut Player,
    damage: u32,
    damage_type: DamageType,
    attacker_id: Identity,
) {
    // Apply damage
    target.health = (target.health - damage as f32).max(0.0);
    
    // Apply knockback for PvP
    if damage_type != DamageType::Pierce {
        apply_knockback(target, attacker_id, PVP_KNOCKBACK_DISTANCE);
    }
    
    // Apply status effects (bleed, burn, etc.)
    if let Some(bleed) = get_bleed_effect(damage_type) {
        apply_bleed_effect(ctx, target.identity, bleed);
    }
    
    // Check for death
    if target.health <= 0.0 {
        handle_player_death(ctx, target, Some(attacker_id));
    }
}
```

## Resource Gathering

When attacking resources (trees, stones), the system grants materials:

```rust
fn harvest_resource(
    ctx: &ReducerContext,
    tool: &ItemDefinition,
    resource: &mut Tree,  // or Stone, etc.
) -> AttackResult {
    // Check tool effectiveness
    if tool.primary_target_type != Some(TargetType::Tree) {
        return AttackResult { hit: true, resource_granted: None, .. };
    }
    
    // Calculate damage to resource
    let damage = rand_range(
        tool.primary_target_damage_min.unwrap_or(5),
        tool.primary_target_damage_max.unwrap_or(10),
    );
    
    resource.health -= damage as i32;
    
    // Grant resources
    let yield_amount = rand_range(
        tool.primary_target_yield_min.unwrap_or(1),
        tool.primary_target_yield_max.unwrap_or(2),
    );
    
    let resource_name = tool.primary_yield_resource_name
        .clone()
        .unwrap_or("Wood".to_string());
    
    // Add to player inventory
    add_item_to_player_inventory(ctx, player_id, &resource_name, yield_amount);
    
    AttackResult {
        hit: true,
        target_type: Some(TargetType::Tree),
        resource_granted: Some((resource_name, yield_amount)),
    }
}
```

## Armor and Resistances

### ArmorResistances Structure

```rust
pub struct ArmorResistances {
    pub slash_resistance: f32,   // 0.0 - 1.0 (0% - 100%)
    pub blunt_resistance: f32,
    pub pierce_resistance: f32,
    pub fire_resistance: f32,
    pub cold_resistance: f32,
}
```

### Resistance Calculation

```rust
fn apply_resistance(
    damage: u32,
    damage_type: DamageType,
    armor: &ArmorResistances,
) -> u32 {
    let resistance = match damage_type {
        DamageType::Slash => armor.slash_resistance,
        DamageType::Blunt => armor.blunt_resistance,
        DamageType::Pierce => armor.pierce_resistance,
        DamageType::Fire => armor.fire_resistance,
        DamageType::Cold => armor.cold_resistance,
        _ => 0.0,
    };
    
    // Reduce damage by resistance percentage
    let reduced = damage as f32 * (1.0 - resistance);
    reduced.max(1.0) as u32  // Minimum 1 damage
}
```

### Total Armor Calculation

Players can wear multiple armor pieces. Total resistance is calculated:

```rust
fn calculate_total_armor(
    ctx: &ReducerContext,
    player_id: Identity,
) -> ArmorResistances {
    let equipped = get_equipped_armor(ctx, player_id);
    
    let mut total = ArmorResistances::default();
    
    for armor_piece in equipped {
        if let Some(res) = &armor_piece.armor_resistances {
            // Additive stacking with diminishing returns
            total.slash_resistance = diminish(total.slash_resistance + res.slash_resistance);
            total.blunt_resistance = diminish(total.blunt_resistance + res.blunt_resistance);
            // ... etc.
        }
    }
    
    total
}

fn diminish(value: f32) -> f32 {
    // Cap at 80% maximum resistance
    value.min(0.8)
}
```

## Status Effects from Combat

### Bleed Effect

```rust
pub struct BleedEffect {
    pub damage_per_tick: f32,
    pub duration_seconds: f32,
    pub tick_interval_seconds: f32,
}

// Applied when hit by slashing weapons
if weapon.bleed_damage_per_tick.is_some() {
    apply_effect(ctx, target_id, EffectType::Bleed {
        damage_per_tick: weapon.bleed_damage_per_tick.unwrap(),
        duration: weapon.bleed_duration_seconds.unwrap(),
        interval: weapon.bleed_tick_interval_seconds.unwrap(),
    });
}
```

### Burn Effect

Applied by fire damage:
```rust
EffectType::Burn {
    damage_per_tick: 3.0,
    duration: 5.0,
    interval: 1.0,
}
```

## PvP Specific Rules

### Knockback

```rust
const PVP_KNOCKBACK_DISTANCE: f32 = 32.0;

fn apply_knockback(
    target: &mut Player,
    attacker_pos: (f32, f32),
    distance: f32,
) {
    // Calculate direction away from attacker
    let dx = target.pos_x - attacker_pos.0;
    let dy = target.pos_y - attacker_pos.1;
    let len = (dx * dx + dy * dy).sqrt();
    
    if len > 0.0 {
        target.pos_x += (dx / len) * distance;
        target.pos_y += (dy / len) * distance;
    }
}
```

### Respawn Time

```rust
const RESPAWN_TIME_MS: u64 = 5000;  // 5 seconds

fn handle_player_death(ctx: &ReducerContext, player: &mut Player, killer: Option<Identity>) {
    player.health = 0.0;
    player.respawn_at = Some(ctx.timestamp + TimeDuration::from_millis(RESPAWN_TIME_MS));
    
    // Create corpse with inventory
    create_player_corpse(ctx, player);
    
    // Clear inventory
    clear_player_inventory(ctx, player.identity);
}
```

## Attack Cooldowns

Each weapon has an `attack_interval_secs`:

```rust
// In perform_attack
let now = ctx.timestamp;
let last_attack = player.last_attack_time;
let cooldown = weapon.attack_interval_secs.unwrap_or(0.5);

if (now - last_attack).as_secs_f32() < cooldown {
    return Err("Attack on cooldown".into());
}

player.last_attack_time = now;
```

## Sound Events

Combat triggers sound events for client feedback:

```rust
fn emit_combat_sound(ctx: &ReducerContext, sound_type: &str, position: (f32, f32)) {
    sound_events::create_sound_event(
        ctx,
        sound_type,  // "hit_wood", "hit_stone", "hit_player", etc.
        position.0,
        position.1,
    );
}
```

## Combat Constants

```rust
// Attack ranges
const MELEE_RANGE: f32 = 48.0;
const MELEE_ARC: f32 = PI / 3.0;  // 60 degrees

// Respawn
const RESPAWN_TIME_MS: u64 = 5000;
const PVP_KNOCKBACK_DISTANCE: f32 = 32.0;

// Resource health
const TREE_INITIAL_HEALTH: i32 = 100;
const STONE_INITIAL_HEALTH: i32 = 150;
```

## Client-Side Combat

### Attack Animation

```typescript
// In input handler
if (isAttacking && !attackCooldown) {
    // Play swing animation
    setPlayerAnimation('attack');
    
    // Send attack to server
    connection.reducers.attack(targetX, targetY);
    
    // Start cooldown timer
    setAttackCooldown(true);
    setTimeout(() => setAttackCooldown(false), attackIntervalMs);
}
```

### Hit Feedback

```typescript
// On receiving damage event
useEffect(() => {
    if (localPlayer.health < prevHealth) {
        // Screen shake
        triggerScreenShake(5);
        
        // Flash red
        setDamageFlash(true);
        
        // Play hit sound
        playSound('player_hit');
    }
}, [localPlayer.health]);
```

