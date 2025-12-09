# Insanity System Timing Analysis & Strategy Guide

## Constants
- **Base Increase**: 0.05 per second (scales with shard count using square root)
- **Shard Scaling**: Square root (shard_count^0.5) - diminishing returns
- **Mining Increase**: 2.0 per mined memory shard node
- **Decay Rate**: 0.02 per second (when not holding shards)
- **Max Insanity**: 100.0 (triggers Entrainment)
- **ALK Safe Zones**: Insanity increase is **halted** while in ALK station safe zones
  - Central compound: ~1750px radius (7x interaction radius)
  - Substations: ~600px radius (3x interaction radius)
  - Allows players to rest after completing contracts before heading back to base

## Formula Analysis

The insanity increase uses square root scaling on shard count with exponential/logarithmic curve:
```
rate = base_rate * (shard_count^0.5) * (1 + insanity/50)² / (1 + ln(1 + insanity/10))
```

**Key Design**: Square root scaling prevents linear explosion with high shard counts:
- 1 shard = 1x rate
- 4 shards = 2x rate  
- 9 shards = 3x rate
- 100 shards = 10x rate
- 400 shards = 20x rate
- 1000 shards = 31.6x rate

### Rate Scaling Examples (at 0% insanity)

| Shard Count | Scaled Rate Multiplier | Rate (per second) | Time to Entrainment |
|-------------|------------------------|-------------------|---------------------|
| 1 shard     | 1.0x                   | 0.050             | ~33 minutes         |
| 4 shards    | 2.0x                   | 0.100             | ~17 minutes         |
| 9 shards    | 3.0x                   | 0.150             | ~11 minutes         |
| 25 shards   | 5.0x                   | 0.250             | ~6.7 minutes        |
| 100 shards  | 10.0x                  | 0.500             | ~3.3 minutes        |
| 400 shards  | 20.0x                  | 1.000             | ~1.7 minutes         |
| 1000 shards | 31.6x                  | 1.580             | ~1.0 minute          |

**Note**: Rates increase as insanity rises (exponential factor), so actual times are slightly faster.

## Time to Entrainment (100% Insanity)

### Scenario 1: Carrying Small Amounts (1-10 shards)
- **1 shard**: ~33 minutes (safe baseline)
- **4 shards**: ~17 minutes (exploration)
- **10 shards**: ~10 minutes (casual play)

### Scenario 2: Carrying Moderate Amounts (25-100 shards)
- **25 shards**: ~6.7 minutes (Tier 1-2 purchases)
- **50 shards**: ~4.7 minutes (Tier 2-3 purchases)
- **100 shards**: ~3.3 minutes (Tier 3-4 purchases, enough time to return to base)

### Scenario 3: Carrying Large Amounts (200-500 shards)
- **200 shards**: ~2.3 minutes (Tier 4-5 purchases, risky)
- **400 shards**: ~1.7 minutes (Faction unlock, very risky but manageable)
- **500 shards**: ~1.5 minutes (Major purchases, extreme risk)

### Scenario 4: Carrying Massive Amounts (1000+ shards)
- **1000 shards**: ~1.0 minute (Faction branches, death wish territory)
- **2500 shards**: ~0.63 minutes (Maximum faction node, instant death risk)

**Note**: Times are approximate and decrease as insanity rises. Actual time is faster due to exponential factor.

### Scenario 5: Mining Memory Shard Nodes
- Each mined node adds **2.0 insanity** instantly
- Mining **50 nodes** = instant Entrainment (if starting from 0%)
- Mining **25 nodes** = instant Entrainment (if starting from 50%)
- **Critical**: Mining while carrying shards = double risk (passive + instant)

## Decay Analysis

### Recovery Time (No Shards Held)
- **Decay Rate**: 0.02 per second
- **Time to drop 1%**: 50 seconds
- **Time to drop from 100% to 0%**: ~83 minutes (5000 seconds)
- **Time to drop from 50% to 0%**: ~42 minutes (2500 seconds)
- **Time to drop from 25% to 0%**: ~21 minutes (1250 seconds)

## Strategic Shard Management

### Strategy 1: "Safe Zone" Approach
**Goal**: Stay below 25% threshold (first SOVA warning)

- **Carry Limit**: 1-2 shards maximum
- **Time Limit**: ~10-15 minutes of continuous carrying
- **Recovery**: Drop shards in chest, wait ~10 minutes to fully recover
- **Best For**: Casual players, exploration, avoiding risk

**Math**: 
- 1 shard: ~20 min to 25% threshold
- 2 shards: ~10 min to 25% threshold
- Recovery: ~10 min to drop from 25% to 0%

### Strategy 2: "Moderate Risk" Approach
**Goal**: Stay below 50% threshold (moderate warning)

- **Carry Limit**: 2-3 shards
- **Time Limit**: ~15-20 minutes of continuous carrying
- **Recovery**: Drop shards, wait ~20 minutes to recover
- **Best For**: Active gameplay, balanced risk/reward

**Math**:
- 3 shards: ~15 min to 50% threshold
- Recovery: ~20 min to drop from 50% to 0%

### Strategy 3: "High Risk, High Reward" Approach
**Goal**: Push to 75% threshold, then recover

- **Carry Limit**: 4-5 shards
- **Time Limit**: ~5-7 minutes to reach 75%
- **Recovery**: Drop shards immediately, wait ~30 minutes to recover
- **Best For**: Quick resource gathering, experienced players

**Math**:
- 5 shards: ~5 min to 75% threshold
- Recovery: ~30 min to drop from 75% to 0%

### Strategy 4: "Mining Rush" Approach
**Goal**: Mine as many shard nodes as possible, accept Entrainment risk

- **Carry Limit**: As many as possible
- **Mining Strategy**: Mine nodes quickly, accept 2.0 insanity per node
- **Risk**: 50 nodes = instant Entrainment
- **Best For**: End-game players, willing to risk death

**Warning**: This strategy will trigger Entrainment quickly. Only viable if you have a respawn plan.

## Optimal Balance Recommendations

### For Most Players: **Strategy 2 (Moderate Risk)**

1. **Carry 2-3 shards** while actively playing
2. **Monitor your insanity** - when you hit 40-45%, drop shards in a chest
3. **Take a break** or do non-shard activities for ~15-20 minutes
4. **Repeat cycle**

**Benefits**:
- Good balance of risk/reward
- Allows active gameplay without constant worry
- Recovery time is manageable
- Avoids severe warnings

### For Risk-Averse Players: **Strategy 1 (Safe Zone)**

1. **Carry 1-2 shards maximum**
2. **Drop shards** before reaching 20% insanity
3. **Recover fully** before picking up more
4. **Never mine shard nodes** unless you're at 0% insanity

**Benefits**:
- Minimal risk of Entrainment
- No severe warnings
- Peace of mind

### For Aggressive Players: **Strategy 3 (High Risk)**

1. **Carry 4-5 shards** for short bursts
2. **Push to 70-75%** quickly
3. **Immediately drop all shards** when warning hits
4. **Take extended break** (~30 min) or do other activities
5. **Repeat when recovered**

**Benefits**:
- Maximum shard accumulation rate
- Efficient use of time
- Requires careful management

## Mining Strategy

### Safe Mining Pattern
- **Never mine shard nodes** if you're above 50% insanity
- **Each node = 2.0 insanity** instantly
- **Mine in batches**: Mine 5-10 nodes, then drop shards and recover
- **Calculate**: If at 40% insanity, you can mine ~30 nodes before Entrainment (60% remaining / 2.0 per node)

### Dangerous Mining Pattern
- Mining while carrying shards = double risk
- Example: At 50% insanity, carrying 3 shards, mining nodes
  - Passive increase: ~0.22 per second (3 shards × 0.072)
  - Mining adds: 2.0 instantly per node
  - **Very dangerous** - can hit Entrainment in minutes

## Key Takeaways

1. **Square root scaling** allows carrying 100-500 shards for Memory Grid purchases
2. **100 shards = ~3.3 minutes** - enough time to return to base (Tier 3-4 purchases)
3. **400 shards = ~1.7 minutes** - risky but manageable (Faction unlocks)
4. **1000+ shards = ~1 minute** - extreme risk (Faction branches, requires careful planning)
5. **Mining nodes = instant risk** (2.0 per node) - can spike insanity dangerously
6. **Recovery is slow** (0.02 per second = 50 seconds per 1%)
7. **Best strategy**: 
   - Small purchases (15-80 shards): Carry safely, drop when convenient
   - Medium purchases (100-200 shards): Plan route back, drop immediately upon return
   - Large purchases (400+ shards): Pre-plan exact route, have base nearby, drop immediately

## ALK Station Safe Zones

**Critical Mechanic**: Insanity increase is **completely halted** while in ALK station safe zones.

### Safe Zone Radii
- **Central Compound**: ~1750px radius (7x interaction radius)
- **Substations**: ~600px radius (3x interaction radius)

### Strategic Use
1. **After completing contracts**: Players can rest at ALK stations without insanity increasing
2. **Planning routes**: Use ALK stations as rest stops when carrying large shard amounts
3. **Emergency recovery**: If insanity gets too high, head to nearest ALK station to halt increase
4. **Decay still works**: Insanity still decays in safe zones (safe zones only halt increase, not decay)

### Example Strategy
- Complete contract → Get 400 shards → Head to ALK station → Rest (insanity halted) → Plan route → Head to base → Drop shards in chest

**Note**: Safe zones only halt **increase**. Insanity still **decays** normally in safe zones when not holding shards.

## Emergency Recovery

If you accidentally push too high:
- **Head to nearest ALK station** - insanity increase will halt immediately
- **Drop all shards** in a chest at the station (if available) or wait
- **Wait it out**: 
  - From 75%: ~30 minutes to 0%
  - From 50%: ~20 minutes to 0%
  - From 25%: ~10 minutes to 0%
- **Avoid mining** during recovery
- **Monitor SOVA warnings** - they'll decrease as you recover

