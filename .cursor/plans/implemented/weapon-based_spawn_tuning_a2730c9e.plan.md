---
name: Weapon-Based Spawn Tuning
overview: Implement a "Combat Readiness" system that scales nighttime hostile spawn rates based on weapon power in player inventory/hotbar, with anti-gaming mechanisms to prevent players from dropping items before night.
todos:
  - id: table
    content: Add PlayerCombatReadiness table to hostile_spawning.rs
    status: pending
  - id: weapon-power
    content: Implement weapon power calculation function based on pvp_damage_max
    status: pending
  - id: scan-weapons
    content: Implement function to scan player inventory/hotbar/equipped for weapons
    status: pending
  - id: readiness-calc
    content: Implement combat readiness score calculation with peak tracking and decay
    status: pending
  - id: spawn-modifier
    content: Integrate combat_multiplier into try_spawn_hostiles_for_player spawn chances
    status: pending
  - id: regenerate
    content: Regenerate client bindings after server changes
    status: pending
---

# Weapon-Based Nighttime Hostile Spawn Tuning

## Problem Statement

New players with only a Combat Ladle (10 PvP damage) are overwhelmed when night hits after ~20 minutes. The current settlement intensity system doesn't account for player combat capability, only structures.

**Gaming Concerns:**

- Players could drop weapons on ground before night
- Players could store weapons in boxes before night
- Need a system that cannot be easily circumvented

## Solution: Combat Readiness Tracking

### Core Design

Track a **persistent "Combat Readiness Score"** per player that:

1. **Increases immediately** when weapons are picked up, crafted, or equipped
2. **Decays slowly** over real time (2-4 hours from max to baseline)
3. **Tracks weapon history** - cannot be instantly reset by dropping items

### Anti-Gaming Mechanisms

1. **Peak Power Memory**: Store the highest weapon power ever seen - persists until decay
2. **Slow Decay Rate**: Even if you drop everything, score takes hours to decay significantly
3. **Comprehensive Scanning**: Check inventory + hotbar + equipped items every spawn tick
4. **Weighted Average**: Current weapons matter, but history prevents instant gaming

## Implementation

### 1. New Table: `PlayerCombatReadiness` ([server/src/wild_animal_npc/hostile_spawning.rs](server/src/wild_animal_npc/hostile_spawning.rs))

```rust
#[table(name = player_combat_readiness, public)]
pub struct PlayerCombatReadiness {
    #[primary_key]
    pub player_identity: Identity,
    pub peak_weapon_power: f32,      // Highest weapon power ever held (decays slowly)
    pub current_weapon_power: f32,   // Current weapons in possession
    pub combat_readiness_score: f32, // Final calculated score (0.0-100.0)
    pub last_update: Timestamp,
}
```

### 2. Weapon Power Calculation

**Power tiers based on `pvp_damage_max`:**

- **Tier 0 (Unarmed/Basic)**: 0-10 damage → Power: 0-5 (Combat Ladle, Rock, Torch)
- **Tier 1 (Early Tools)**: 11-25 damage → Power: 10-25 (Stone tools, Bone weapons)
- **Tier 2 (Mid Weapons)**: 26-40 damage → Power: 30-50 (Spears, Bush Knife, Skulls)
- **Tier 3 (High Weapons)**: 41-60 damage → Power: 55-75 (Battle Axe, War Hammer, Military weapons)
- **Tier 4 (Ranged)**: Bows/Crossbow/Firearms → Power: 60-100 (based on damage + magazine)

### 3. Combat Readiness Score Formula

```rust
// Calculate from inventory/hotbar weapons
fn calculate_combat_readiness(ctx, player_id, current_time) -> f32 {
    let current_power = scan_player_weapons(ctx, player_id); // Sum top 2-3 weapons
    
    // Get or create readiness state
    let mut state = get_or_create_readiness(ctx, player_id);
    
    // Update peak (only goes up, decays separately)
    if current_power > state.peak_weapon_power {
        state.peak_weapon_power = current_power;
    }
    
    // Apply time-based decay to peak (halves every 2 hours)
    let hours_elapsed = (current_time - state.last_update).hours();
    state.peak_weapon_power *= 0.5_f32.powf(hours_elapsed / 2.0);
    
    // Final score = max(current_power, peak_weapon_power * 0.7)
    // This means dropping items still leaves you at ~70% of your peak
    let score = current_power.max(state.peak_weapon_power * 0.7);
    
    return score.clamp(0.0, 100.0);
}
```

### 4. Spawn Rate Modifier

In `try_spawn_hostiles_for_player()`:

```rust
// Combat readiness modifier (0.4x to 1.2x)
// Score 0-20: New player protection (0.4x - 0.6x)
// Score 20-50: Normal gameplay (0.6x - 1.0x)  
// Score 50-100: Experienced player (1.0x - 1.2x)
let combat_multiplier = if combat_score < 20.0 {
    0.4 + (combat_score / 20.0) * 0.2  // 0.4x to 0.6x
} else if combat_score < 50.0 {
    0.6 + ((combat_score - 20.0) / 30.0) * 0.4  // 0.6x to 1.0x
} else {
    1.0 + ((combat_score - 50.0) / 50.0) * 0.2  // 1.0x to 1.2x
};

// Apply to spawn chances
let final_chance = base_chance * settlement_multiplier * combat_multiplier;
```

### 5. Integration Points

**Update readiness when:**

- Player picks up weapon (pickup reducer)
- Player crafts weapon (crafting_queue completion)
- Player spawns/respawns (grant_starting_items)
- Every hostile spawn tick (periodic scan)

**Key files to modify:**

- [server/src/wild_animal_npc/hostile_spawning.rs](server/src/wild_animal_npc/hostile_spawning.rs) - Main spawn logic + new table
- [server/src/items.rs](server/src/items.rs) - Add weapon power calculation helper
- [server/src/dropped_item.rs](server/src/dropped_item.rs) - Optional: Update on pickup

## Expected Behavior

**New player (Combat Ladle only):**

- Combat score: ~5
- Spawn modifier: ~0.45x
- Night feels manageable, can learn mechanics

**Player with Stone Spear + Bow:**

- Combat score: ~45
- Spawn modifier: ~0.9x
- Normal night experience

**Player with Military Crowbar + Crossbow:**

- Combat score: ~90
- Spawn modifier: ~1.15x
- Challenging night, appropriate for gear level

**Player who drops all weapons before night:**

- Peak power still remembered
- Score remains at ~70% of peak for hours
- Cannot game the system effectively

## Constants

```rust
const COMBAT_READINESS_DECAY_HALF_LIFE_HOURS: f32 = 2.0;
const PEAK_RETENTION_FACTOR: f32 = 0.7;  // Dropped items still count at 70%
const MIN_COMBAT_MULTIPLIER: f32 = 0.4;  // New players get 60% fewer spawns
const MAX_COMBAT_MULTIPLIER: f32 = 1.2;  // Geared players get 20% more spawns
const BASELINE_COMBAT_SCORE: f32 = 35.0; // Score for 1.0x multiplier
```