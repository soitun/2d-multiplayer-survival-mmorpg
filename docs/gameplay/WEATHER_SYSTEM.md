# Weather System

This document describes the day/night cycle, weather, and seasonal systems.

## Overview

The weather system (`server/src/world_state.rs`) manages:
- **Day/Night Cycle** - 25-minute full cycle
- **Chunk-Based Weather** - Localized rain/storms
- **Seasons** - Affecting weather patterns and plant growth
- **Temperature Effects** - Warmth drain modifiers

## Day/Night Cycle

### Cycle Duration

```rust
const DAY_DURATION_SECONDS: f32 = 1200.0;    // 20 minutes
const NIGHT_DURATION_SECONDS: f32 = 300.0;   // 5 minutes
const FULL_CYCLE_DURATION_SECONDS: f32 = 1500.0;  // 25 minutes total
```

### Time of Day Phases

```rust
pub enum TimeOfDay {
    Dawn,       // 0.0 - 0.1 of cycle (early morning)
    Morning,    // 0.1 - 0.3 of cycle
    Midday,     // 0.3 - 0.5 of cycle (brightest)
    Afternoon,  // 0.5 - 0.7 of cycle
    Dusk,       // 0.7 - 0.8 of cycle (sunset)
    Night,      // 0.8 - 0.95 of cycle
    Midnight,   // 0.95 - 1.0 of cycle (darkest)
}

impl TimeOfDay {
    pub fn from_progress(progress: f32) -> Self {
        match progress {
            p if p < 0.1 => TimeOfDay::Dawn,
            p if p < 0.3 => TimeOfDay::Morning,
            p if p < 0.5 => TimeOfDay::Midday,
            p if p < 0.7 => TimeOfDay::Afternoon,
            p if p < 0.8 => TimeOfDay::Dusk,
            p if p < 0.95 => TimeOfDay::Night,
            _ => TimeOfDay::Midnight,
        }
    }
}
```

### WorldState Table

```rust
#[spacetimedb::table(name = world_state, public)]
pub struct WorldState {
    #[primary_key]
    pub id: u8,  // Singleton (always 0)
    
    // Time tracking
    pub cycle_start_timestamp: Timestamp,
    pub current_day: u32,
    
    // Seasonal data
    pub current_season: Season,
    pub season_start_timestamp: Timestamp,
    
    // Global weather state
    pub is_full_moon: bool,
}
```

### Calculating Current Time

```rust
pub fn get_time_of_day_progress(ctx: &ReducerContext) -> f32 {
    let world_state = ctx.db.world_state().iter().next().unwrap();
    
    let elapsed = (ctx.timestamp - world_state.cycle_start_timestamp).as_secs_f32();
    let progress = (elapsed % FULL_CYCLE_DURATION_SECONDS) / FULL_CYCLE_DURATION_SECONDS;
    
    progress
}

pub fn get_current_time_of_day(ctx: &ReducerContext) -> TimeOfDay {
    TimeOfDay::from_progress(get_time_of_day_progress(ctx))
}
```

## Warmth System

### Base Warmth Drain

```rust
pub const BASE_WARMTH_DRAIN_PER_SECOND: f32 = 0.5;

// Time-of-day multipliers
pub const WARMTH_DRAIN_MULTIPLIER_DAWN_DUSK: f32 = 1.5;  // 1.5x at dawn/dusk
pub const WARMTH_DRAIN_MULTIPLIER_NIGHT: f32 = 2.0;      // 2x at night
pub const WARMTH_DRAIN_MULTIPLIER_MIDNIGHT: f32 = 3.0;   // 3x at midnight
```

### Warmth Calculation

```rust
fn calculate_warmth_drain_multiplier(time_of_day: &TimeOfDay) -> f32 {
    match time_of_day {
        TimeOfDay::Dawn | TimeOfDay::Dusk => WARMTH_DRAIN_MULTIPLIER_DAWN_DUSK,
        TimeOfDay::Night => WARMTH_DRAIN_MULTIPLIER_NIGHT,
        TimeOfDay::Midnight => WARMTH_DRAIN_MULTIPLIER_MIDNIGHT,
        _ => 1.0,  // Daytime: normal drain
    }
}
```

## Chunk-Based Weather

Weather is localized per chunk, allowing for regional variation.

### ChunkWeather Table

```rust
#[spacetimedb::table(name = chunk_weather, public)]
pub struct ChunkWeather {
    #[primary_key]
    pub chunk_index: u32,
    
    pub weather_type: WeatherType,
    pub weather_started_at: Timestamp,
    pub weather_duration_secs: f32,
}

pub enum WeatherType {
    Clear,
    Cloudy,
    LightRain,
    ModerateRain,
    HeavyRain,
    Storm,
}
```

### Weather Propagation

Weather spreads between adjacent chunks like real weather fronts:

```rust
const CHUNKS_PER_UPDATE: usize = 25;  // Process 25 chunks per tick
const WEATHER_PROPAGATION_DISTANCE: u32 = 3;  // Spread 3 chunks away
const WEATHER_PROPAGATION_DECAY: f32 = 0.8;   // 20% decay per distance

fn propagate_weather(ctx: &ReducerContext) {
    // Select random chunks to update
    let chunks_to_update: Vec<u32> = select_random_chunks(CHUNKS_PER_UPDATE);
    
    for chunk_idx in chunks_to_update {
        let neighbors = get_neighboring_chunks(chunk_idx, WEATHER_PROPAGATION_DISTANCE);
        
        // Check if neighbors have rain
        let rainy_neighbors = neighbors.iter()
            .filter(|n| is_chunk_rainy(ctx, **n))
            .count();
        
        // Probability of rain spreading
        if rainy_neighbors > 0 && ctx.rng().gen::<f32>() < propagation_chance(rainy_neighbors) {
            start_rain_in_chunk(ctx, chunk_idx);
        }
    }
}
```

### Rain Effects on Warmth

```rust
pub const WARMTH_DRAIN_RAIN_LIGHT: f32 = 0.2;     // -0.2/sec
pub const WARMTH_DRAIN_RAIN_MODERATE: f32 = 0.4;  // -0.4/sec
pub const WARMTH_DRAIN_RAIN_HEAVY: f32 = 0.7;     // -0.7/sec
pub const WARMTH_DRAIN_RAIN_STORM: f32 = 1.0;     // -1.0/sec

fn get_rain_warmth_drain(weather: &WeatherType) -> f32 {
    match weather {
        WeatherType::LightRain => WARMTH_DRAIN_RAIN_LIGHT,
        WeatherType::ModerateRain => WARMTH_DRAIN_RAIN_MODERATE,
        WeatherType::HeavyRain => WARMTH_DRAIN_RAIN_HEAVY,
        WeatherType::Storm => WARMTH_DRAIN_RAIN_STORM,
        _ => 0.0,
    }
}
```

### Rain Duration

```rust
const MIN_RAIN_DURATION_SECONDS: f32 = 180.0;  // 3 minutes
const MAX_RAIN_DURATION_SECONDS: f32 = 480.0;  // 8 minutes
const MIN_TIME_BETWEEN_RAIN_CYCLES: f32 = 600.0;  // 10 minute cooldown
```

## Seasonal System

### Season Types

```rust
pub enum Season {
    Spring,  // Frequent light showers
    Summer,  // Dry, rare storms
    Autumn,  // Wettest, long storms
    Winter,  // Cold intense storms
}

pub const SEASON_DURATION_HOURS: f32 = 90.0 * 24.0;  // 90 days per season
```

### Seasonal Weather Modifiers

```rust
pub struct SeasonalWeatherConfig {
    pub rain_probability_multiplier: f32,
    pub duration_multiplier: f32,
    pub propagation_multiplier: f32,
    pub rain_type_distribution: [f32; 4],  // [light, moderate, heavy, storm]
    pub decay_multiplier: f32,
    pub rain_cooldown_multiplier: f32,
}

impl SeasonalWeatherConfig {
    pub fn for_season(season: &Season) -> Self {
        match season {
            Season::Spring => Self {
                rain_probability_multiplier: 1.2,   // 20% more likely
                duration_multiplier: 0.9,            // Slightly shorter
                propagation_multiplier: 1.0,
                rain_type_distribution: [0.55, 0.30, 0.12, 0.03],
                decay_multiplier: 1.1,
                rain_cooldown_multiplier: 0.8,
            },
            Season::Summer => Self {
                rain_probability_multiplier: 0.5,   // 50% less likely
                duration_multiplier: 0.7,            // Much shorter
                propagation_multiplier: 0.8,
                rain_type_distribution: [0.40, 0.35, 0.20, 0.05],
                decay_multiplier: 1.5,               // Clears faster
                rain_cooldown_multiplier: 1.5,
            },
            Season::Autumn => Self {
                rain_probability_multiplier: 1.8,   // 80% more likely
                duration_multiplier: 1.5,            // Much longer
                propagation_multiplier: 1.3,
                rain_type_distribution: [0.25, 0.35, 0.30, 0.10],
                decay_multiplier: 0.6,               // Persists
                rain_cooldown_multiplier: 0.5,
            },
            Season::Winter => Self {
                rain_probability_multiplier: 1.3,
                duration_multiplier: 1.8,            // Very long
                propagation_multiplier: 1.2,
                rain_type_distribution: [0.20, 0.30, 0.35, 0.15],
                decay_multiplier: 0.4,
                rain_cooldown_multiplier: 0.7,
            },
        }
    }
}
```

## Thunder Events

Storms can trigger thunder events:

```rust
#[spacetimedb::table(name = thunder_event, public)]
pub struct ThunderEvent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub chunk_index: u32,
    pub pos_x: f32,
    pub pos_y: f32,
    pub created_at: Timestamp,
    pub intensity: f32,  // 0.0 - 1.0
}
```

Client plays thunder/lightning effects based on these events.

## Rain Collectors

Rain collectors fill when in rainy chunks:

```rust
fn update_rain_collectors_in_chunk(ctx: &ReducerContext, chunk_index: u32) {
    let weather = ctx.db.chunk_weather().chunk_index().find(chunk_index);
    
    if let Some(w) = weather {
        if is_raining(&w.weather_type) {
            let collection_rate = get_rain_collection_rate(&w.weather_type);
            
            for collector in ctx.db.rain_collector().chunk_index().filter(chunk_index) {
                let mut c = collector.clone();
                c.total_water_collected += collection_rate;
                c.total_water_collected = c.total_water_collected.min(MAX_WATER);
                ctx.db.rain_collector().id().update(c);
            }
        }
    }
}
```

## Full Moon

Every 3 cycles is a full moon, affecting certain mechanics:

```rust
const FULL_MOON_CYCLE_INTERVAL: u32 = 3;

fn check_full_moon(ctx: &ReducerContext, day_number: u32) -> bool {
    day_number % FULL_MOON_CYCLE_INTERVAL == 0
}
```

Full moon effects:
- Increased wolf aggression
- Certain plants only harvestable during full moon
- Special visual effects on client

## Client-Side Weather Rendering

### Day/Night Lighting

```typescript
function applyDayNightLighting(ctx: CanvasRenderingContext2D, timeProgress: number) {
  // Calculate darkness level
  const timeOfDay = getTimeOfDay(timeProgress);
  let darkness = 0;
  
  switch (timeOfDay) {
    case 'dawn':
    case 'dusk':
      darkness = 0.3;
      break;
    case 'night':
      darkness = 0.5;
      break;
    case 'midnight':
      darkness = 0.7;
      break;
  }
  
  // Apply darkness overlay
  ctx.fillStyle = `rgba(0, 0, 30, ${darkness})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
```

### Rain Particles

```typescript
function renderRainInChunk(ctx: CanvasRenderingContext2D, chunk: ChunkWeather) {
  if (chunk.weatherType === 'Clear') return;
  
  const intensity = getRainIntensity(chunk.weatherType);
  const particleCount = Math.floor(intensity * 100);
  
  for (let i = 0; i < particleCount; i++) {
    const x = Math.random() * chunkWidth + chunkScreenX;
    const y = (Date.now() * 0.5 + i * 20) % chunkHeight + chunkScreenY;
    
    ctx.strokeStyle = `rgba(150, 180, 255, ${intensity * 0.5})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y + 10);
    ctx.stroke();
  }
}
```

## Weather Processing Schedule

Weather updates periodically via scheduled reducer:

```rust
#[spacetimedb::table(name = weather_update_schedule, scheduled(process_weather))]
pub struct WeatherUpdateSchedule {
    #[primary_key]
    pub id: u8,  // Singleton
    pub scheduled_at: ScheduleAt,
}

const WEATHER_UPDATE_INTERVAL_SECS: u64 = 5;

#[spacetimedb::reducer]
fn process_weather(ctx: &ReducerContext, schedule: WeatherUpdateSchedule) {
    // Update day/night cycle
    update_time_of_day(ctx);
    
    // Propagate weather between chunks
    propagate_weather(ctx);
    
    // Decay existing rain
    decay_rain_in_chunks(ctx);
    
    // Possibly start new rain
    maybe_start_new_rain(ctx);
    
    // Update rain collectors
    update_all_rain_collectors(ctx);
    
    // Reschedule
    schedule_next_weather_update(ctx);
}
```

## Summary: Weather Effects on Gameplay

| Condition | Effect |
|-----------|--------|
| **Daytime** | Normal warmth drain |
| **Dawn/Dusk** | 1.5x warmth drain |
| **Night** | 2x warmth drain |
| **Midnight** | 3x warmth drain |
| **Light Rain** | +0.2/sec warmth drain |
| **Heavy Rain** | +0.7/sec warmth drain |
| **Storm** | +1.0/sec warmth drain, thunder events |
| **Full Moon** | Special events, wolf aggression |
| **Spring** | Frequent light showers |
| **Summer** | Dry, short rain |
| **Autumn** | Long persistent storms |
| **Winter** | Cold intense storms |

