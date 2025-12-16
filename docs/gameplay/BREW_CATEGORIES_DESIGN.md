# Brew Categories & Recipe Types Design Document

## Overview
This document defines the comprehensive categories of brewed items that can be created in the Broth Pot system. These categories will guide AI recipe generation and ensure diverse, balanced gameplay.

---

## 1. Healing Broths & Soups
**Primary Purpose:** Health restoration and sustained recovery

### Subcategories:
- **Meat Broths** - Rich, protein-based healing
  - Animal meats + bones for depth
  - High health restoration, moderate hunger
  - Examples: Bone Broth, Venison Stew, Fox Meat Soup

- **Vegetable Soups** - Lighter healing, nutritious
  - Root vegetables (Carrot, Beet, Potato, Salsify, Horseradish)
  - Moderate health, high hunger satisfaction
  - Examples: Root Vegetable Medley, Harvest Soup

- **Mushroom Stews** - Varied effects based on mushroom type
  - Edible mushrooms (Chanterelle, Porcini, Shaggy Ink Cap)
  - Unique stat combinations
  - Examples: Forest Mushroom Stew, Earthy Porcini Broth

- **Fish Chowders** - Maritime protein source
  - Fish meats + vegetables
  - Balanced health and hunger
  - Examples: Coastal Chowder, Fisherman's Stew

- **Survival Stews** - Mixed ingredients, "whatever you have"
  - Combination of meats, vegetables, and foraged items
  - Variable stats based on ingredients
  - Examples: Survivor's Pot Luck, Scavenger's Stew

- **Pure Bone Broths** - Concentrated healing
  - Animal Bone + water (minimal ingredients)
  - Maximum health restoration, minimal hunger
  - Examples: Concentrated Bone Broth, Marrow Extract

---

## 2. Medicinal Teas & Infusions
**Primary Purpose:** Stat buffs, healing over time, status effect removal

### Subcategories:
- **Single-Herb Teas** - Focused effects
  - Chamomile (calming, minor healing)
  - Mint (refreshing, thirst restoration)
  - Yarrow (wound healing, health regeneration)
  - Valerian (sedative, stamina recovery)
  - Mugwort (aromatic, minor buffs)

- **Blended Medicinal Teas** - Synergistic effects
  - Multiple herbs for enhanced benefits
  - Complex stat combinations
  - Examples: Healer's Blend, Wilderness Remedy Tea

- **Root Infusions** - Powerful, long-lasting effects
  - Ginseng (energy, stamina boost)
  - Horseradish (warming, cold resistance)
  - Salsify (nutritious, sustained energy)
  - Examples: Siberian Vitality Infusion, Root Power Tonic

- **Vitamin C Teas** - Critical for survival theme
  - Scurvy Grass (anti-scurvy, health boost)
  - Sea Plantain (maritime nutrition)
  - Examples: Sailor's Remedy, Scurvy Prevention Tea

- **Detox/Antidote Teas** - Counter poisons and toxins
  - Specific herbs that neutralize negative effects
  - Removes poison status, restores health
  - Examples: Purifying Brew, Toxin Neutralizer Tea

---

## 3. Alcoholic Beverages
**Primary Purpose:** Buffs, debuffs, social/trade value, cold resistance

### Subcategories:
- **Berry Wines** - Fermented fruit beverages
  - Lingonberry Wine (tart, warming)
  - Cloudberry Wine (rare, valuable)
  - Cranberry Wine (medicinal, tart)
  - Bilberry Wine (sweet, common)
  - Crowberry Wine (subarctic specialty)
  - Stats: Minor health, warmth buff, slight perception debuff

- **Potato Spirits** - Distilled from root vegetables
  - Potato Vodka (strong, warming)
  - Beet Spirit (earthy, unique)
  - Stats: Cold resistance, courage buff, accuracy debuff

- **Grain Ales** - (Future: if grains added)
  - Barley Ale, Wheat Beer
  - Stats: Hunger satisfaction, morale boost

- **Meads** - (Future: if honey/beehives added)
  - Honey Mead (sweet, valuable)
  - Stats: Energy boost, health regeneration

- **Moonshine/Spirits** - High-proof distilled alcohol
  - Made from berries, potatoes, or beets
  - Stats: Strong buffs/debuffs, trade value, fuel alternative

- **Fermented Drinks** - Lower alcohol content
  - Kvass (from beets or bread)
  - Berry Cider
  - Stats: Thirst quenching, minor buffs

---

## 4. Poisons & Toxins
**Primary Purpose:** Offensive combat, weapon coating, trap bait

### Subcategories:
- **Pure Plant Toxins** - Concentrated deadly extracts
  - Belladonna Extract (deadly nightshade)
  - Wolfsbane Poison (extremely toxic)
  - Mandrake Toxin (rare, powerful)
  - Henbane Concentrate (toxic, hallucinogenic)
  - Datura Poison (hallucinogenic, dangerous)
  - Stats: Massive negative health, damage over time

- **Venom Extracts** - Animal-based toxins
  - Cable Viper Gland Concentrate
  - Stats: Poison damage, paralysis effect

- **Mushroom Poisons** - Fungal toxins
  - Fly Agaric Extract (hallucinogenic)
  - Deadly Webcap Poison (organ damage)
  - Destroying Angel Toxin (lethal)
  - Stats: Various negative effects, some delayed

- **Mixed Poisons** - Combining multiple toxic plants
  - Synergistic toxicity
  - Unpredictable effects
  - Examples: Witch's Bane, Death's Brew

- **Weapon Coating Oils** - Sticky poison application
  - Poison + Animal Fat = coating
  - Applied to weapons for damage over time
  - Examples: Venom-Coated Oil, Toxic Blade Coating

---

## 5. Performance Enhancers & Buff Potions
**Primary Purpose:** Temporary stat boosts, combat advantages, survival benefits

### Subcategories:
- **Stamina Drinks** - Energy and endurance
  - Ginseng-based tonics
  - Mint energy blends
  - Stats: Increased stamina, faster movement, reduced fatigue
  - Examples: Siberian Endurance Tonic, Runner's Elixir

- **Cold Resistance Tonics** - Survive harsh weather
  - Bear Garlic + warming herbs
  - Horseradish + alcohol
  - Stats: Cold resistance buff, warmth generation
  - Examples: Winter Warmer, Arctic Survivor's Brew

- **Night Vision Elixirs** - Enhanced perception in darkness
  - Specific mushrooms + herbs
  - Stats: Improved night vision, perception boost
  - Examples: Owl's Eye Potion, Nocturnal Hunter's Brew

- **Strength Tonics** - Temporary damage/carry weight buffs
  - Rare roots + protein sources
  - Stats: Increased damage, carry capacity
  - Examples: Bear's Strength Elixir, Warrior's Draught

- **Speed Potions** - Movement enhancement
  - Stimulating herbs + light ingredients
  - Stats: Movement speed increase, agility boost
  - Examples: Swift Runner's Brew, Hare's Haste Potion

- **Focus Draughts** - Crafting and accuracy buffs
  - Ginseng + calming herbs
  - Stats: Crafting speed, accuracy, reduced tremor
  - Examples: Artisan's Focus, Marksman's Clarity

---

## 6. Utility Brews
**Primary Purpose:** Non-consumable uses, crafting materials, tools

### Subcategories:
- **Dyes** - Coloring agents
  - Berry-based dyes (Lingonberry, Bilberry, Crowberry)
  - Flower dyes (if flowers added)
  - Use: Clothing customization, marking territory
  - Examples: Crimson Berry Dye, Forest Green Extract

- **Preservatives** - Food preservation
  - Salt brines (Glasswort-based)
  - Vinegars (fermented from fruits/alcohol)
  - Use: Extend food shelf life, crafting ingredient
  - Examples: Sea Salt Brine, Berry Vinegar

- **Cleaning Solutions** - Antiseptics and cleaners
  - Strong herb extracts
  - Alcohol-based solutions
  - Use: Wound cleaning, equipment maintenance
  - Examples: Antiseptic Wash, Herbal Cleanser

- **Fuel Additives** - Enhance burning efficiency
  - Alcohol-based concentrates
  - Use: Increase campfire burn time, lamp fuel
  - Examples: Lamp Oil Additive, Fire Accelerant

- **Bait Liquids** - Attractants for hunting/fishing
  - Fish oils + herbs
  - Berry concentrates
  - Use: Improve trap effectiveness, fishing success
  - Examples: Fish Attractant, Berry Lure Concentrate

---

## 7. Psychoactive & Ritual Brews
**Primary Purpose:** Special effects, vision quests, high-risk/high-reward

### Subcategories:
- **Hallucinogenic Teas** - Controlled psychoactive effects
  - Fly Agaric Tea (mild hallucinations)
  - Datura Vision Brew (strong, dangerous)
  - Stats: Visual effects, perception changes, risk of negative effects
  - Examples: Shaman's Vision Tea, Spirit Walker's Brew

- **Sedatives** - Sleep and calming effects
  - Valerian Sleep Draught
  - Henbane Sedative (dangerous)
  - Stats: Forced sleep state, health regeneration during sleep
  - Examples: Dreamless Sleep Potion, Tranquil Rest Brew

- **Stimulants** - Alertness and wakefulness
  - Strong herb blends
  - Ginseng + mint combinations
  - Stats: Prevent sleep, increased alertness, stamina drain
  - Examples: All-Night Vigil Brew, Watchman's Tonic

- **Vision Quest Brews** - Rare, special effects
  - Multiple rare ingredients
  - Unpredictable, powerful effects
  - Stats: Unique buffs, temporary abilities, high risk
  - Examples: Ancestor's Vision, Spirit Realm Gateway

---

## 8. Nutritional Drinks
**Primary Purpose:** Hunger/thirst satisfaction, sustained energy

### Subcategories:
- **Seed Milks** - Plant-based nutrition
  - Sunflower Seed Milk
  - Pumpkin Seed Milk
  - Flax Seed Milk
  - Stats: Moderate hunger, high thirst, light health
  - Examples: Toasted Seed Milk, Nutty Blend

- **Vegetable Juices** - Concentrated nutrition
  - Beet Juice (earthy, nutritious)
  - Carrot Juice (sweet, vitamin-rich)
  - Stats: High hunger satisfaction, vitamins
  - Examples: Root Vegetable Juice, Garden Blend

- **Berry Juices/Nectars** - Sweet, refreshing
  - Lingonberry Nectar
  - Cloudberry Juice (rare)
  - Bilberry Concentrate
  - Stats: Thirst quenching, energy boost, antioxidants
  - Examples: Wild Berry Nectar, Arctic Berry Blend

- **Protein Shakes** - Survival nutrition
  - Bone broth + seeds + fat
  - Stats: High hunger, health, sustained energy
  - Examples: Survivor's Protein Mix, Wilderness Meal Shake

---

## 9. Specialty Maritime Brews
**Primary Purpose:** Unique to coastal/island setting

### Subcategories:
- **Seawater Reductions** - Salt extraction
  - Concentrated seawater → salt
  - Mineral-rich brines
  - Use: Crafting ingredient, preservative
  - Examples: Sea Salt Concentrate, Mineral Brine

- **Kelp/Seaweed Teas** - (Future: ocean foraging)
  - Nutrient-rich ocean plants
  - Stats: Unique minerals, iodine, health benefits
  - Examples: Ocean Harvest Tea, Kelp Vitality Brew

- **Fish Oils** - Rendered from fish
  - Health benefits, omega fatty acids
  - Stats: Health regeneration, cold resistance
  - Examples: Cod Liver Oil, Omega-Rich Extract

- **Sailor's Grog** - Traditional maritime drink
  - Watered alcohol + citrus (scurvy prevention)
  - Stats: Morale boost, vitamin C, mild intoxication
  - Examples: Captain's Grog, Seafarer's Ration

---

## 10. Cooking Bases & Intermediate Ingredients
**Primary Purpose:** Used in other recipes, crafting components

### Subcategories:
- **Stocks** - Flavor bases
  - Animal Stock (from bones + meat)
  - Vegetable Stock (from vegetables)
  - Mushroom Stock (from mushrooms)
  - Use: Ingredient in complex recipes
  - Examples: Rich Bone Stock, Garden Vegetable Base

- **Rendered Fats** - Cooking oils
  - Tallow (from Animal Fat - already in game!)
  - Seed oils (Flax, Sunflower)
  - Use: Cooking ingredient, lamp fuel, weapon coating base
  - Examples: Pure Tallow, Golden Seed Oil

- **Syrups** - Sweet concentrates
  - Berry reductions (concentrated sugars)
  - Use: Sweetener, energy boost, trade item
  - Examples: Lingonberry Syrup, Wild Berry Reduction

- **Vinegars** - Fermented acids
  - Made from fruits or alcohol
  - Use: Preservative, cleaning agent, flavor enhancer
  - Examples: Berry Vinegar, Strong Grain Vinegar

- **Oils** - Extracted liquids
  - Flax Seed Oil
  - Sunflower Seed Oil
  - Use: Cooking, lamp fuel, crafting
  - Examples: Cold-Pressed Flax Oil, Toasted Seed Oil

---

## 11. Technological/Chemical Brews
**Primary Purpose:** Unique to crashed ship setting, sci-fi twist

### Subcategories:
- **Battery Acid Extracts** - Dangerous chemicals
  - From Scrap Batteries
  - Use: Weapon damage, corrosive agent, crafting component
  - Stats: Highly toxic if consumed, utility item
  - Examples: Corrosive Extract, Battery Acid Concentrate

- **Metal Cleaners** - Maintenance fluids
  - Acids + plant extracts
  - Use: Equipment repair, rust removal
  - Examples: Rust Remover Solution, Metal Polish

- **Improvised Fuels** - Alternative energy sources
  - Alcohol + chemicals
  - Use: Campfire fuel, lamp oil, emergency power
  - Examples: High-Octane Brew, Emergency Fuel Mix

- **Electrolyte Solutions** - Sci-fi recovery drinks
  - Using Memory Shard components (technological twist)
  - Stats: Rapid stamina recovery, unique buffs
  - Examples: Nano-Enhanced Electrolyte, Tech-Infused Recovery Drink

---

## Advanced Recipe Mechanics

### Multi-Stage Brewing
Recipes that require previous brews as ingredients:

1. **Base → Intermediate → Final**
   - Berries → Berry Wine → Berry Vinegar
   - Vegetables → Vegetable Stock → Complex Soup
   - Herbs → Herb Extract → Medicinal Tincture

2. **Distillation Process**
   - Alcohol → Spirits (higher potency)
   - Poison → Concentrated Toxin (more dangerous)
   - Tea → Extract (more powerful)

3. **Aging System** (Future)
   - Time-based improvements
   - Aged Wine (better stats)
   - Aged Cheese (if dairy added)
   - Cured Meats (preserved foods)

### Synergy Effects
Combinations that create unique results:

- **Herb + Alcohol = Tincture**
  - Medicinal extracts with longer shelf life
  - Enhanced healing properties
  - Examples: Yarrow Tincture, Valerian Extract

- **Poison + Fat = Weapon Coating**
  - Sticky poison application
  - Damage over time for weapons
  - Examples: Venom Oil, Toxic Blade Coating

- **Tea + Honey = Enhanced Healing** (Future)
  - Sweetened medicinal drinks
  - Better stats than plain tea
  - Examples: Honey Chamomile Tea, Sweet Healing Brew

- **Meat + Vegetables + Herbs = Complex Soup**
  - Multiple stat buffs
  - Synergistic effects
  - Examples: Hunter's Feast Stew, Wilderness Banquet

### Risk/Reward Brews
High-risk, high-reward concoctions:

- **Toxic Tonics**
  - Small poison damage but huge temporary buffs
  - Examples: Berserker's Bane, Warrior's Sacrifice

- **Berserker Brews**
  - High damage output but health drain
  - Examples: Rage Elixir, Blood Fury Potion

- **Experimental Mixtures**
  - Random effects (could be amazing or deadly)
  - Examples: Alchemist's Gamble, Mystery Concoction

### Environmental/Seasonal Brews
Recipes tied to game conditions:

- **Winter Warmers**
  - Cold resistance, using winter-available plants
  - Examples: Frost Survivor's Brew, Arctic Warmer

- **Summer Coolers**
  - Heat resistance, refreshing (Mint, berries)
  - Examples: Icy Mint Cooler, Summer Berry Refresher

- **Storm Brews**
  - Temporary buffs for harsh weather survival
  - Examples: Tempest Tonic, Storm Survivor's Draught

---

## AI Generation Guidelines

### Stat Balance by Category

**Healing Broths:**
- Health: 30-80 (based on rarity)
- Hunger: 40-100 (primary purpose)
- Thirst: 15-30 (water-based)

**Medicinal Teas:**
- Health: 20-50 (healing over time)
- Hunger: 5-20 (minimal)
- Thirst: 30-60 (liquid-based)
- Buffs: Status effect removal, regeneration

**Alcoholic Beverages:**
- Health: -5 to 10 (slight negative or neutral)
- Hunger: 10-30 (some nutrition)
- Thirst: -10 to 0 (dehydrating)
- Buffs: Cold resistance, courage
- Debuffs: Accuracy penalty, perception penalty

**Poisons:**
- Health: -50 to -200 (deadly)
- Hunger: -20 to -50 (nausea)
- Thirst: -10 to -30 (toxic)
- Effects: Damage over time, paralysis

**Performance Enhancers:**
- Health: 10-30 (minor)
- Hunger: 20-40 (energy)
- Thirst: 10-30 (hydration)
- Buffs: Stamina, speed, strength, focus (30-120 seconds)

**Utility Brews:**
- Not consumable (or minimal stats)
- Crafting ingredients
- Tool uses

**Nutritional Drinks:**
- Health: 10-30 (moderate)
- Hunger: 50-90 (primary purpose)
- Thirst: 40-80 (liquid-based)

### Naming Conventions

**Prefix Patterns:**
- "Glass Jar of [Name]" - Standard brews
- "Vial of [Name]" - Concentrated/potent
- "Flask of [Name]" - Alcoholic beverages
- "Bottle of [Name]" - Utility liquids
- "Draught of [Name]" - Medicinal/magical
- "Elixir of [Name]" - Powerful/rare
- "Tonic of [Name]" - Health-focused
- "Brew of [Name]" - General purpose
- "Potion of [Name]" - Buff-focused
- "Extract of [Name]" - Concentrated

**Suffix Patterns:**
- "Soup/Stew/Broth" - Food-based
- "Tea/Infusion" - Herb-based
- "Wine/Spirit/Ale" - Alcoholic
- "Poison/Toxin/Venom" - Deadly
- "Tonic/Elixir/Draught" - Medicinal
- "Oil/Extract/Concentrate" - Utility

### Description Tone
- Survival-themed
- Practical and grounded
- Hint at effects without being mechanical
- 1-2 sentences maximum
- Match game's atmospheric tone

**Examples:**
- ✅ "A hearty stew made from foraged roots and wild herbs. Warms the body and fills the belly."
- ✅ "Concentrated venom extracted from Cable Viper glands. Handle with extreme caution."
- ❌ "This soup is very good and will make you healthy!" (too casual)
- ❌ "Restores 50 HP and 80 Hunger over 10 seconds." (too mechanical)

---

## Rarity-Based Recipe Tiers

### Common (Power 0.0-0.3)
- **Ingredients:** Common plants, basic materials
- **Examples:** Stone Soup, Nettle Tea, Simple Vegetable Stew
- **Stats:** Basic healing, hunger satisfaction
- **Brew Time:** 60-120 seconds

### Uncommon (Power 0.3-0.6)
- **Ingredients:** Mix of common and uncommon
- **Examples:** Hearty Root Stew, Berry Wine, Medicinal Herb Blend
- **Stats:** Good healing, moderate buffs
- **Brew Time:** 120-180 seconds

### Rare (Power 0.6-0.8)
- **Ingredients:** Rare plants, special materials
- **Examples:** Ginseng Vitality Tonic, Porcini Feast, Cloudberry Elixir
- **Stats:** Strong healing, significant buffs
- **Brew Time:** 180-240 seconds

### Very Rare (Power 0.8-1.0)
- **Ingredients:** Very rare plants, multiple rare ingredients
- **Examples:** Mandrake Poison, Destroying Angel Toxin, Legendary Elixir
- **Stats:** Extreme effects (healing or damage)
- **Brew Time:** 240-300 seconds

---

## Future Expansion Categories

### Potential Future Additions:
1. **Dairy-Based Brews** (if cows/goats added)
   - Milk-based soups
   - Cheese broths
   - Butter-infused stews

2. **Grain-Based Brews** (if farming expanded)
   - Porridges
   - Grain alcohols
   - Bread-based soups

3. **Honey-Based Brews** (if beehives added)
   - Meads
   - Honey teas
   - Sweet elixirs

4. **Ocean Foraging Brews** (if ocean expanded)
   - Seaweed soups
   - Kelp teas
   - Shellfish chowders

5. **Spice-Based Brews** (if trade system added)
   - Exotic spiced drinks
   - Warming chai-like teas
   - Spice-enhanced soups

---

## Summary

This comprehensive category system provides:

✅ **Diverse Gameplay** - 11+ major categories, 50+ subcategories
✅ **Clear Purpose** - Each category has distinct gameplay function
✅ **Balanced Progression** - Common to legendary tiers
✅ **Emergent Discovery** - Infinite combinations within categories
✅ **Thematic Consistency** - Fits survival/maritime/crashed ship setting
✅ **AI-Friendly** - Clear guidelines for generation
✅ **Scalable** - Easy to add new categories/subcategories
✅ **Depth** - Multi-stage brewing, synergies, risk/reward

The AI will use these categories to generate consistent, balanced, and thematically appropriate recipes for any ingredient combination players discover!

