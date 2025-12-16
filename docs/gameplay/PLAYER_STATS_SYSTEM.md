# Player Stats System

This document describes the player survival stats system (health, hunger, thirst, warmth, insanity).

## Overview

The player stats system (`server/src/player_stats.rs`) manages survival mechanics through:
- **Health** - Damage and healing
- **Hunger** - Food consumption
- **Thirst** - Hydration
- **Warmth** - Temperature regulation
- **Insanity** - Memory shard corruption (special mechanic)

## Stat Values

### Maximum Values

```rust
pub const PLAYER_MAX_HUNGER: f32 = 250.0;
pub const PLAYER_MAX_THIRST: f32 = 250.0;
pub const PLAYER_MAX_HEALTH: f32 = 100.0;  // Defined in consumables.rs
pub const PLAYER_MAX_WARMTH: f32 = 100.0;  // Implicit
pub const PLAYER_MAX_INSANITY: f32 = 100.0;
```

### Starting Values

```rust
pub const PLAYER_STARTING_HUNGER: f32 = 100.0;  // 40% of max
pub const PLAYER_STARTING_THIRST: f32 = 100.0;  // 40% of max
// Health starts at 100% (100.0)
// Warmth starts at 100% (100.0)
// Insanity starts at 0%
```

## Stat Drain Rates

### Base Drain Rates

```rust
// Hunger drains from 250 to 0 in 3 hours
const HUNGER_DRAIN_PER_SECOND: f32 = 250.0 / (3.0 * 60.0 * 60.0);  // ~0.023/sec

// Thirst drains from 250 to 0 in 2 hours
const THIRST_DRAIN_PER_SECOND: f32 = 250.0 / (2.0 * 60.0 * 60.0);  // ~0.035/sec
```

### Warmth Drain (Time of Day)

```rust
// Base drain (always applied)
pub const BASE_WARMTH_DRAIN_PER_SECOND: f32 = 0.5;

// Time-of-day multipliers
pub const WARMTH_DRAIN_MULTIPLIER_DAWN_DUSK: f32 = 0.5;   // Half drain
pub const WARMTH_DRAIN_MULTIPLIER_NIGHT: f32 = 1.5;       // 1.5x drain
pub const WARMTH_DRAIN_MULTIPLIER_MIDNIGHT: f32 = 2.0;    // 2x drain
```

### Biome-Based Warmth

```rust
// Arctic biomes increase cold drain rate
pub const TUNDRA_WARMTH_DECAY_MULTIPLIER: f32 = 1.5;  // 50% faster cold
pub const ALPINE_WARMTH_DECAY_MULTIPLIER: f32 = 2.0;  // 100% faster cold
```

## Health Damage from Stats

### Low Stat Penalties

When stats drop below thresholds, health starts draining:

```rust
pub const DEFAULT_LOW_NEED_THRESHOLD: f32 = 20.0;  // 20% = danger zone

// Health loss rates when stats are low
pub const HEALTH_LOSS_PER_SEC_LOW_THIRST: f32 = 0.5;
pub const HEALTH_LOSS_PER_SEC_LOW_HUNGER: f32 = 0.4;
pub const HEALTH_LOSS_PER_SEC_LOW_WARMTH: f32 = 0.25;

// Penalty doubles when stat hits zero
pub const HEALTH_LOSS_MULTIPLIER_AT_ZERO: f32 = 2.0;
```

### Warmth Damage Threshold

```rust
// Health loss starts when warmth drops below this (not just low_need_threshold)
pub const WARMTH_DAMAGE_THRESHOLD: f32 = 6.67;  // ~1/3 of low_need_threshold
```

## Health Recovery

### Passive Regeneration

```rust
// Only regenerates when stats are above threshold
pub const HEALTH_RECOVERY_THRESHOLD: f32 = 51.0;  // 51% of max
pub const HEALTH_RECOVERY_PER_SEC: f32 = 1.0;

// Requirements for passive regen:
// - Hunger > 51%
// - Thirst > 51%
// - No active damaging effects (bleed, burn, poison)
```

### Cozy Effect Bonus

```rust
// When player has "cozy" effect (near fire, well-fed, etc.)
pub const COZY_HEALTH_REGEN_MULTIPLIER: f32 = 2.0;  // Double regen rate
```

## Stat Processing Loop

Stats are updated every second via scheduled reducer:

```rust
pub const PLAYER_STAT_UPDATE_INTERVAL_SECS: u64 = 1;

#[spacetimedb::reducer]
fn process_player_stats(ctx: &ReducerContext, schedule: PlayerStatSchedule) {
    // 1. Drain hunger/thirst
    player.hunger -= HUNGER_DRAIN_PER_SECOND;
    player.thirst -= THIRST_DRAIN_PER_SECOND;
    
    // 2. Calculate warmth change
    let warmth_change = calculate_warmth_change(ctx, &player);
    player.warmth += warmth_change;
    
    // 3. Apply health effects
    apply_stat_health_effects(ctx, &mut player);
    
    // 4. Check for death
    if player.health <= 0.0 {
        handle_player_death(ctx, &player);
    }
    
    // 5. Reschedule for next tick
    schedule_next_stat_update(ctx, player.identity);
}
```

## Warmth System

### Heat Sources

```rust
// Campfire warmth
pub const WARMTH_RADIUS_SQUARED: f32 = 128.0 * 128.0;  // 128 pixel radius
pub const WARMTH_PER_SECOND: f32 = 5.0;  // Warmth gain near burning campfire

// Torch warmth (when equipped)
pub const TORCH_WARMTH_PER_SECOND: f32 = 1.75;  // Neutralizes night cold
```

### Warmth Calculation

```rust
fn calculate_warmth_change(ctx: &ReducerContext, player: &Player) -> f32 {
    let mut warmth_change = 0.0;
    
    // 1. Base drain from time of day
    let time_multiplier = get_time_of_day_multiplier(ctx);
    warmth_change -= BASE_WARMTH_DRAIN_PER_SECOND * time_multiplier;
    
    // 2. Biome modifier
    let biome_multiplier = get_biome_warmth_multiplier(ctx, player.pos_x, player.pos_y);
    if warmth_change < 0.0 {
        warmth_change *= biome_multiplier;
    }
    
    // 3. Heat sources
    if is_near_campfire(ctx, player) {
        warmth_change += WARMTH_PER_SECOND;
    }
    
    // 4. Equipped items
    if has_torch_equipped(ctx, player.identity) {
        warmth_change += TORCH_WARMTH_PER_SECOND;
    }
    
    // 5. Armor warmth bonus
    let armor_warmth = get_armor_warmth_bonus(ctx, player.identity);
    warmth_change += armor_warmth;
    
    // 6. Indoor protection
    if is_inside_shelter(ctx, player) && warmth_change < 0.0 {
        warmth_change *= INDOOR_WARMTH_PROTECTION_MULTIPLIER;  // 0.65 = 35% reduction
    }
    
    warmth_change
}
```

### Cold Effects on Hunger

```rust
// Cold increases hunger drain
pub const HUNGER_DRAIN_MULTIPLIER_LOW_WARMTH: f32 = 1.5;   // 50% faster when cold
pub const HUNGER_DRAIN_MULTIPLIER_ZERO_WARMTH: f32 = 2.0;  // 100% faster when freezing
```

## Insanity System

### Overview

Insanity is a special mechanic tied to carrying Memory Shards:

```rust
pub const PLAYER_MAX_INSANITY: f32 = 100.0;
pub const INSANITY_BASE_INCREASE_PER_SECOND: f32 = 0.012;
pub const INSANITY_MINING_INCREASE: f32 = 1.5;  // Per shard mined
```

### Shard Scaling

```rust
// More shards = faster insanity gain
pub const INSANITY_SHARD_SCALING_EXPONENT: f32 = 0.35;
// 1 shard = 1x, 10 shards = 2.2x, 50 shards = 3.6x, 100 shards = 4.5x

fn calculate_shard_multiplier(shard_count: u32) -> f32 {
    (shard_count as f32).powf(INSANITY_SHARD_SCALING_EXPONENT)
}
```

### Time Multiplier

```rust
// Longer carrying time = worse
pub const INSANITY_TIME_MULTIPLIER_MAX: f32 = 8.0;
pub const INSANITY_TIME_SCALE_SECONDS: f32 = 900.0;  // 15 minutes to reach ~7x
```

### Insanity Decay

```rust
// Dropping shards allows recovery
pub const INSANITY_RAPID_DECAY_THRESHOLD: f32 = 50.0;
pub const INSANITY_RAPID_DECAY_PER_SECOND: f32 = 2.0;    // Below 50%: fast recovery
pub const INSANITY_SLOW_DECAY_PER_SECOND: f32 = 0.35;   // Above 50%: slow recovery
```

### Insanity Thresholds

```rust
// Client-side warning triggers
pub const INSANITY_THRESHOLD_25: f32 = 25.0;   // First warning
pub const INSANITY_THRESHOLD_50: f32 = 50.0;   // Moderate warning
pub const INSANITY_THRESHOLD_75: f32 = 75.0;   // Severe warning
pub const INSANITY_THRESHOLD_90: f32 = 90.0;   // Critical warning
pub const INSANITY_THRESHOLD_100: f32 = 100.0; // Entrainment (death?)
```

## Consumable Effects

### Instant Effects

```rust
// Applied immediately when consumed
pub fn apply_consumable(ctx: &ReducerContext, player: &mut Player, item: &ItemDefinition) {
    if let Some(health) = item.consumable_health_gain {
        player.health = (player.health + health).min(MAX_HEALTH_VALUE);
    }
    if let Some(hunger) = item.consumable_hunger_satiated {
        player.hunger = (player.hunger + hunger).min(PLAYER_MAX_HUNGER);
    }
    if let Some(thirst) = item.consumable_thirst_quenched {
        player.thirst = (player.thirst + thirst).min(PLAYER_MAX_THIRST);
    }
}
```

### Duration Effects

```rust
// For items with consumable_duration_secs
pub fn apply_duration_effect(ctx: &ReducerContext, player_id: Identity, item: &ItemDefinition) {
    let duration = item.consumable_duration_secs.unwrap_or(0.0);
    if duration > 0.0 {
        // Create active effect that applies over time
        create_active_effect(ctx, player_id, EffectType::HealOverTime {
            total_heal: item.consumable_health_gain.unwrap_or(0.0),
            duration_secs: duration,
        });
    }
}
```

## Environmental Modifiers

### Tree Cover (Shade)

```rust
// Being under trees reduces thirst drain (cooler in shade)
pub const TREE_COVER_HYDRATION_REDUCTION_MULTIPLIER: f32 = 0.75;  // 25% less thirst drain
```

### Rain Effect

```rust
// Rain increases warmth drain
const RAIN_WARMTH_DRAIN: f32 = 1.5;  // Additional warmth loss in rain
```

### Wetness

```rust
// Being wet increases cold damage
const WETNESS_WARMTH_DRAIN: f32 = 0.5;  // Additional warmth loss when wet
```

## Stamina System

### Dodge Roll Cost

```rust
pub const DODGE_ROLL_STAMINA_COST: f32 = 10.0;
```

### Sprint

```rust
pub const SPRINT_SPEED_MULTIPLIER: f32 = 2.0;
// Note: Sprint itself doesn't drain stamina in current implementation
// Exhaustion is handled via status effects
```

## Death and Respawn

When health reaches 0:

```rust
fn handle_player_death(ctx: &ReducerContext, player: &mut Player) {
    // 1. Create corpse with inventory
    create_player_corpse(ctx, player);
    
    // 2. Clear player's inventory
    clear_player_inventory(ctx, player.identity);
    
    // 3. Set respawn timer
    player.respawn_at = Some(ctx.timestamp + TimeDuration::from_millis(RESPAWN_TIME_MS));
    
    // 4. Reset stats on respawn
    // (handled in respawn reducer)
}

fn respawn_player(ctx: &ReducerContext, player: &mut Player) {
    player.health = MAX_HEALTH_VALUE;
    player.hunger = PLAYER_STARTING_HUNGER;
    player.thirst = PLAYER_STARTING_THIRST;
    player.warmth = 100.0;
    player.insanity = 0.0;
    player.respawn_at = None;
}
```

## Client-Side Display

### Status Bars

```typescript
// StatusBar.tsx
<StatusBar
  label="Health"
  value={player.health}
  maxValue={100}
  color="red"
  showWarning={player.health < 20}
/>
<StatusBar
  label="Hunger"
  value={player.hunger}
  maxValue={250}
  color="orange"
  showWarning={player.hunger < 50}  // Below low_need_threshold
/>
<StatusBar
  label="Thirst"
  value={player.thirst}
  maxValue={250}
  color="blue"
  showWarning={player.thirst < 50}
/>
<StatusBar
  label="Warmth"
  value={player.warmth}
  maxValue={100}
  color="yellow"
  showWarning={player.warmth < 20}
/>
```

### Warning Indicators

When stats are low:
- Bar changes color (yellow → red)
- Pulsing animation
- Audio warning cue
- Screen effects (red vignette for health)

