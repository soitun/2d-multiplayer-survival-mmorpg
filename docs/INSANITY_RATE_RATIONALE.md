# Insanity Rate Design Rationale

## Problem Statement

Players need to carry significant amounts of memory shards for Memory Grid purchases:
- **Tier 1-2**: 15-80 shards (manageable)
- **Tier 3-4**: 120-450 shards (significant)
- **Tier 5+**: 600-1000+ shards (major purchases)
- **Faction unlocks**: 400 shards
- **Faction branches**: 400-2500 shards per node

Players go on "runs" to collect shards, then need time to return to base and make purchases. The original linear scaling (0.05 per second per shard) made this unplayable:

### Original Linear Scaling (BROKEN)
- **100 shards**: 5.0/sec → **20 seconds** to Entrainment ❌
- **400 shards**: 20.0/sec → **5 seconds** to Entrainment ❌
- **1000 shards**: 50.0/sec → **2 seconds** to Entrainment ❌

This was completely unplayable - players couldn't even walk back to base before hitting Entrainment.

## Solution: Square Root Scaling (Diminishing Returns)

Changed from linear scaling to **square root scaling** (`shard_count^0.5`):

### New Scaling Behavior
- **1 shard**: 1x rate (baseline)
- **4 shards**: 2x rate (4^0.5 = 2)
- **9 shards**: 3x rate (9^0.5 = 3)
- **100 shards**: 10x rate (100^0.5 = 10)
- **400 shards**: 20x rate (400^0.5 = 20)
- **1000 shards**: 31.6x rate (1000^0.5 ≈ 31.6)

### Time to Entrainment (at 0% starting insanity)
- **1 shard**: ~33 minutes (safe baseline)
- **10 shards**: ~10 minutes (reasonable for exploration)
- **100 shards**: ~3.3 minutes (enough time to get back to base)
- **400 shards**: ~1.7 minutes (risky but manageable with planning)
- **1000 shards**: ~1.0 minute (very risky, requires careful route planning)

## Design Goals Achieved

1. ✅ **Allows carrying hundreds of shards** - Players can carry 100-500 shards for purchases
2. ✅ **Provides reasonable time windows** - 1-3 minutes gives enough time to return to base
3. ✅ **Maintains risk/reward tension** - Still dangerous, but not instant death
4. ✅ **Scales appropriately** - More shards = more risk, but not linearly explosive
5. ✅ **Preserves gameplay flow** - Players can complete runs and return to base

## Risk Assessment

### Low Risk (Safe Zone)
- **1-10 shards**: 10-33 minutes to Entrainment
- **Use case**: Exploration, casual play
- **Strategy**: Can carry indefinitely, drop when convenient

### Moderate Risk (Balanced)
- **10-50 shards**: 3-10 minutes to Entrainment
- **Use case**: Active gameplay, collecting for Tier 1-2 purchases
- **Strategy**: Monitor insanity, drop shards before reaching 50%

### High Risk (Dangerous)
- **50-200 shards**: 1.7-3.3 minutes to Entrainment
- **Use case**: Collecting for Tier 3-4 purchases
- **Strategy**: Plan route back to base, drop shards immediately upon return

### Very High Risk (Extreme)
- **200-500 shards**: 1.0-1.7 minutes to Entrainment
- **Use case**: Collecting for Tier 5+ or faction unlocks
- **Strategy**: Pre-plan exact route, have base nearby, drop shards immediately

### Maximum Risk (Death Wish)
- **500+ shards**: <1 minute to Entrainment
- **Use case**: Collecting for faction branches (2500 shard nodes)
- **Strategy**: Only viable with respawn plan, or very close to base

## Mining Strategy Impact

Mining still adds **2.0 insanity per node** instantly. This remains a significant risk:
- **50 nodes** = 100 insanity (instant Entrainment from 0%)
- **25 nodes** = 50 insanity (halfway there)

Players must balance:
- Carrying shards (gradual increase)
- Mining nodes (instant spikes)
- Getting back to base (time pressure)

## ALK Station Safe Zones

**New Mechanic**: Insanity increase is **completely halted** while players are in ALK station safe zones.

### Design Rationale
After completing ALK contracts, players receive shards and need time to:
1. Rest and recover from the contract run
2. Plan their route back to base
3. Safely deposit shards without risk of Entrainment

### Safe Zone Radii
- **Central Compound**: ~1750px radius (7x interaction radius)
- **Substations**: ~600px radius (3x interaction radius)

These match the existing safe zone radii used for PvP protection, creating a consistent mechanic.

### Strategic Impact
- **Contract completion**: Players can rest at ALK stations after completing contracts
- **Route planning**: ALK stations become strategic rest stops
- **Emergency recovery**: If insanity gets too high, players can head to nearest ALK station
- **Decay still works**: Insanity decays normally in safe zones (only increase is halted)

### Example Workflow
1. Complete contract → Receive 400 shards
2. Head to ALK station → Insanity increase halts
3. Rest and plan route → No risk of Entrainment
4. Head to base → Insanity resumes increasing
5. Drop shards in chest → Safe!

## Conclusion

The square root scaling makes the insanity system playable while maintaining tension. Players can carry the shards needed for Memory Grid purchases, but must plan carefully and manage risk. The ALK station safe zones provide crucial rest points after contract completion, allowing players to recover before heading back to base. The system rewards strategic thinking and punishes carelessness without being completely unforgiving.

