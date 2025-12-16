# Farming Profitability Analysis

## Seed Drop Mechanics

### 1. Harvesting Plants
- **Drop Chance**: Varies by crop (40%-80% based on plant config)
- **Seed Amount**: 1-2 seeds per successful drop (random)
- **Expected Seeds per Harvest**: `drop_chance × 1.5` (average of 1-2 seeds)

### 2. Consuming Food
- **Drop Chance**: Fixed **60%** for all plant-based foods
- **Seed Amount**: Exactly **1 seed** per successful drop
- **Expected Seeds per Consumption**: `0.60 × 1 = 0.60 seeds`

## Crop-by-Crop Analysis

### High-Profitability Crops (70%+ harvest drop rate)

| Crop | Harvest Drop % | Expected Seeds/Harvest | Consume Drop | Expected Seeds/Consume | **Total Expected Seeds** |
|------|----------------|------------------------|--------------|------------------------|--------------------------|
| **Potato** | 80% | 1.20 | 60% | 0.60 | **1.80 seeds** |
| **Carrot** | 75% | 1.125 | 60% | 0.60 | **1.725 seeds** |
| **Corn** | 70% | 1.05 | 60% | 0.60 | **1.65 seeds** |
| **Pumpkin** | 70% | 1.05 | 60% | 0.60 | **1.65 seeds** |
| **Beets** | 70% | 1.05 | 60% | 0.60 | **1.65 seeds** |
| **Valerian** | 70% | 1.05 | 60% | 0.60 | **1.65 seeds** |
| **Mint** | 75% | 1.125 | 60% | 0.60 | **1.725 seeds** |

### Medium-Profitability Crops (55-65% harvest drop rate)

| Crop | Harvest Drop % | Expected Seeds/Harvest | Consume Drop | Expected Seeds/Consume | **Total Expected Seeds** |
|------|----------------|------------------------|--------------|------------------------|--------------------------|
| **Nettle** | 65% | 0.975 | 60% | 0.60 | **1.575 seeds** |
| **Reed** | 65% | 0.975 | 60% | 0.60 | **1.575 seeds** |
| **Scurvy Grass** | 60% | 0.90 | 60% | 0.60 | **1.50 seeds** |
| **Crowberry** | 60% | 0.90 | 60% | 0.60 | **1.50 seeds** |
| **Chamomile** | 60% | 0.90 | 60% | 0.60 | **1.50 seeds** |
| **Arctic Hairgrass** | 60% | 0.90 | 60% | 0.60 | **1.50 seeds** |
| **Chicory** | 55% | 0.825 | 60% | 0.60 | **1.425 seeds** |
| **Yarrow** | 55% | 0.825 | 60% | 0.60 | **1.425 seeds** |
| **Mugwort** | 55% | 0.825 | 60% | 0.60 | **1.425 seeds** |
| **Sea Plantain** | 55% | 0.825 | 60% | 0.60 | **1.425 seeds** |
| **Horseradish** | 55% | 0.825 | 60% | 0.60 | **1.425 seeds** |

### Low-Profitability Crops (40-50% harvest drop rate)

| Crop | Harvest Drop % | Expected Seeds/Harvest | Consume Drop | Expected Seeds/Consume | **Total Expected Seeds** |
|------|----------------|------------------------|--------------|------------------------|--------------------------|
| **Arctic Lichen** | 40% | 0.60 | 60% | 0.60 | **1.20 seeds** |
| **Mountain Moss** | 45% | 0.675 | 60% | 0.60 | **1.275 seeds** |
| **Arctic Poppy** | 50% | 0.75 | 60% | 0.60 | **1.35 seeds** |
| **Glasswort** | 53% | 0.795 | 60% | 0.60 | **1.395 seeds** |
| **Beach Lyme Grass** | 53% | 0.795 | 60% | 0.60 | **1.395 seeds** |

## Farming Sustainability Analysis

### Scenario: Starting a Farm

**Initial Setup:**
1. Player harvests 1 wild plant → gets 1-2 seeds (expected: 1.2-1.8 depending on crop)
2. Player plants 1 seed → waits for growth → harvests 1 crop
3. Player can either:
   - **Option A**: Harvest only (no consumption)
   - **Option B**: Harvest + Consume (optimal strategy)

### Expected Seed Returns per Cycle

**Best Crops (Potato, Carrot, Mint):**
- **Harvest + Consume**: Expected **1.7-1.8 seeds** per crop
- **Harvest Only**: Expected **1.125-1.2 seeds** per crop
- **Verdict**: ✅ **SUSTAINABLE** - Can reliably expand farm

**Good Crops (Corn, Pumpkin, Beets, Valerian):**
- **Harvest + Consume**: Expected **1.65 seeds** per crop
- **Harvest Only**: Expected **1.05 seeds** per crop
- **Verdict**: ✅ **SUSTAINABLE** - Can expand farm, but slower

**Medium Crops (Nettle, Reed, Scurvy Grass, etc.):**
- **Harvest + Consume**: Expected **1.4-1.5 seeds** per crop
- **Harvest Only**: Expected **0.825-0.975 seeds** per crop
- **Verdict**: ⚠️ **MARGINAL** - Harvest-only is unsustainable, but harvest+consume works

**Poor Crops (Arctic Lichen, Mountain Moss):**
- **Harvest + Consume**: Expected **1.2-1.275 seeds** per crop
- **Harvest Only**: Expected **0.60-0.675 seeds** per crop
- **Verdict**: ❌ **UNSUSTAINABLE** - Even with consumption, barely breaks even

## Key Findings

### ✅ **Farming IS Reliable** for Most Crops

1. **High-value crops** (Potato, Carrot, Corn, Pumpkin) are **highly sustainable**:
   - Expected **1.65-1.8 seeds** per crop when harvesting + consuming
   - Can reliably expand farm size over time
   - Even harvest-only yields **1.05-1.2 seeds** (sustainable but slower growth)

2. **Optimal Strategy**: 
   - **Harvest + Consume** gives best seed returns
   - Players get both food value AND seed expansion
   - Only exception: If player needs food immediately, harvest-only still works for top crops

3. **Risk Analysis**:
   - Worst case: 40% drop rate × 1 seed = 0.40 seeds (harvest only)
   - Best case: 80% drop rate × 2 seeds = 1.60 seeds (harvest only)
   - With consumption bonus: Always adds +0.60 seeds expected

### ⚠️ **Potential Issues**

1. **Alpine Plants** (Lichen, Moss) are **barely sustainable**:
   - Even with consumption, only **1.2-1.275 seeds** expected
   - High risk of seed loss over time
   - Consider increasing drop rates to 50-55% minimum

2. **Harvest-Only Strategy** is risky for medium crops:
   - Crops with <60% drop rate may lose seeds over time
   - Players should be encouraged to consume some crops for seed returns

3. **RNG Variance**:
   - Low drop rates + low seed amounts = high variance
   - A player could get unlucky and lose seeds even on "sustainable" crops
   - Consider minimum seed guarantee or higher drop rates

## Recommendations

### Current System Assessment: **GOOD** ✅

The farming system is **generally sustainable** for most crops. Players can reliably start and expand farms, especially with high-value crops.

### Suggested Improvements (Optional)

1. **Increase Alpine Plant Drop Rates**:
   - Arctic Lichen: 40% → **50%**
   - Mountain Moss: 45% → **55%**
   - Ensures all crops are sustainable

2. **Consider Minimum Seed Guarantee**:
   - For crops with <60% drop rate, guarantee at least 1 seed on harvest
   - Prevents unlucky streaks from destroying farms

3. **Balance Note**:
   - Current system encourages **consumption** for seed returns
   - This is good game design - players must balance food vs. seed expansion
   - No changes needed unless players report farming is too difficult

## Conclusion

**Farming is profitable and sustainable** for the majority of crops. Players can reliably:
- Start farms with initial seed drops
- Expand farms by harvesting + consuming crops
- Maintain farms even with harvest-only strategy (for top crops)

The system encourages strategic decision-making: consume crops for seed expansion, or save them for food. This creates engaging gameplay without making farming impossible.

