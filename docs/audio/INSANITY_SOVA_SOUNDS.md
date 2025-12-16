# Insanity SOVA Sound System

## Overview
When players reach certain insanity thresholds, client-side SOVA sounds are triggered to provide audio feedback. These sounds are played directly by the client (not server-side sound events).

## Insanity Thresholds
- **25%** - First warning threshold
- **50%** - Moderate warning threshold  
- **75%** - Severe warning threshold
- **90%** - Critical warning threshold
- **100%** - Maximum threshold (Entrainment effect)

## Sound File Naming Convention

All sound files should be placed in: `public/sounds/`

### File Format
```
sova_insanity_{threshold}_{variation}.mp3
```

### Complete File List (15 files total)

#### 25% Threshold (3 variations)
- `sova_insanity_25_1.mp3`
- `sova_insanity_25_2.mp3`
- `sova_insanity_25_3.mp3`

#### 50% Threshold (3 variations)
- `sova_insanity_50_1.mp3`
- `sova_insanity_50_2.mp3`
- `sova_insanity_50_3.mp3`

#### 75% Threshold (3 variations)
- `sova_insanity_75_1.mp3`
- `sova_insanity_75_2.mp3`
- `sova_insanity_75_3.mp3`

#### 90% Threshold (3 variations)
- `sova_insanity_90_1.mp3`
- `sova_insanity_90_2.mp3`
- `sova_insanity_90_3.mp3`

#### 100% Threshold (3 variations)
- `sova_insanity_100_1.mp3`
- `sova_insanity_100_2.mp3`
- `sova_insanity_100_3.mp3`

## Implementation Details

### Server-Side
- Threshold detection happens in `server/src/player_stats.rs`
- The `last_insanity_threshold` field on the `Player` struct tracks which threshold was last crossed
- Thresholds reset when insanity drops below them (allows re-triggering if player recovers)

### Client-Side
- Hook: `client/src/hooks/useInsanitySovaSounds.ts`
- Automatically detects threshold changes via player updates
- Randomly selects one of the 3 variations for each threshold
- Plays sound at 70% volume

### Sound Selection
When a threshold is crossed, the system randomly selects one of the 3 variations for that threshold to provide variety and prevent repetition.

## Notes
- Sounds are client-side only (not synced across players)
- Each player hears their own threshold sounds
- Sounds play once per threshold crossing (won't spam)
- If insanity drops and rises again, sounds can re-trigger

