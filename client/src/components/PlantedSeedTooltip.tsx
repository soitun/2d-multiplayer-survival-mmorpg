import React, { useMemo } from 'react';
import { PlantedSeed, Cloud, WorldState, WaterPatch, Campfire, Lantern, Furnace, Tree, RuneStone, ChunkWeather, PlantType, FertilizerPatch, WorldChunkData } from '../generated';
import styles from './PlantedSeedTooltip.module.css';
import { calculateChunkIndex } from '../utils/chunkUtils';
import { RESOURCE_IMAGE_SOURCES } from '../utils/renderers/resourceImageConfigs';

// Tile type constants (must match server TileType enum)
const TILE_TYPE_DIRT = 1;
const TILE_TYPE_BEACH = 4;
const TILE_TYPE_TILLED = 13;
const TILE_SIZE_PX = 48;
const CHUNK_SIZE_TILES = 16;

// Prepared soil bonus (matches server PREPARED_SOIL_GROWTH_MULTIPLIER)
const PREPARED_SOIL_GROWTH_MULTIPLIER = 1.5;

// Beach tile penalty for non-beach plants (matches server BEACH_TILE_GROWTH_PENALTY)
const BEACH_TILE_GROWTH_PENALTY = 0.5; // 50% growth rate

interface PlantedSeedTooltipProps {
  seed: PlantedSeed;
  visible: boolean;
  position: { x: number; y: number };
  currentTime: number; // Current timestamp in milliseconds
  // Environmental data for growth modifiers
  clouds: Map<string, Cloud>;
  worldState: WorldState | null;
  chunkWeather: Map<string, ChunkWeather>; // Added for chunk-specific weather
  waterPatches: Map<string, WaterPatch>;
  campfires: Map<string, Campfire>;
  lanterns: Map<string, Lantern>;
  furnaces: Map<string, Furnace>;
  trees: Map<string, Tree>; // Added for mushroom tree cover check
  runeStones: Map<string, RuneStone>; // Added for rune stone growth boost check
  fertilizerPatches: Map<string, FertilizerPatch>; // Added for fertilizer/compost effect
  worldChunkData?: Map<string, WorldChunkData>; // Added for checking soil type
}

const PlantedSeedTooltip: React.FC<PlantedSeedTooltipProps> = ({ 
  seed, 
  visible, 
  position, 
  currentTime,
  clouds,
  worldState,
  chunkWeather,
  waterPatches,
  campfires,
  lanterns,
  furnaces,
  trees,
  runeStones,
  fertilizerPatches,
  worldChunkData
}) => {
  if (!visible || !seed) {
    return null;
  }
  
  // Get chunk-specific weather for this seed's location
  const seedChunkWeather = useMemo(() => {
    const chunkIndex = calculateChunkIndex(seed.posX, seed.posY);
    return chunkWeather.get(chunkIndex.toString()) || null;
  }, [seed.posX, seed.posY, chunkWeather]);

  // Calculate growth percentage
  const growthPercent = Math.round(seed.growthProgress * 100);
  
  // Is the plant fully grown?
  const isFullyGrown = seed.growthProgress >= 1.0;
  
  // Calculate time already spent growing
  const timeSpentGrowingMs = currentTime - seed.plantedAt.toDate().getTime();
  
  // Note: timeUntilMatureMs will be calculated dynamically below after we compute growth multiplier
  
  // Format time duration
  const formatTimeDuration = (ms: number): string => {
    if (!isFinite(ms) || ms === Infinity) {
      return 'Stalled';
    }
    
    const seconds = Math.floor(Math.abs(ms) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    } else if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    } else if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${seconds}s`;
    }
  };
  
  // --- Environmental Condition Checks ---
  
  // Check if seed is covered by clouds
  const calculateCloudCoverage = (): number => {
    let cloudCoverage = 0;
    
    clouds.forEach(cloud => {
      const dx = seed.posX - cloud.posX;
      const dy = seed.posY - cloud.posY;
      
      const halfWidth = cloud.width / 2;
      const halfHeight = cloud.height / 2;
      
      if (halfWidth > 0 && halfHeight > 0) {
        const normalizedX = dx / halfWidth;
        const normalizedY = dy / halfHeight;
        const distanceSquared = normalizedX * normalizedX + normalizedY * normalizedY;
        
        if (distanceSquared <= 1.0) {
          const coverageIntensity = Math.max(0, 1.0 - Math.sqrt(distanceSquared));
          const effectiveCoverage = coverageIntensity * cloud.currentOpacity;
          cloudCoverage = Math.min(1.0, cloudCoverage + effectiveCoverage);
        }
      }
    });
    
    return cloudCoverage;
  };
  
  // Check if seed is near water and calculate water patch effect
  const getWaterPatchEffect = (): { hasWater: boolean; isSaltWater: boolean; multiplier: number } => {
    const WATER_PATCH_GROWTH_EFFECT_RADIUS = 60; // pixels (matching server constant)
    const WATER_PATCH_GROWTH_EFFECT_RADIUS_SQ = WATER_PATCH_GROWTH_EFFECT_RADIUS * WATER_PATCH_GROWTH_EFFECT_RADIUS;
    
    let bestMultiplier = 1.0; // Base multiplier (no effect)
    let hasWater = false;
    let isSaltWater = false;
    
    for (const waterPatch of waterPatches.values()) {
      const dx = seed.posX - waterPatch.posX;
      const dy = seed.posY - waterPatch.posY;
      const distanceSq = dx * dx + dy * dy;
      
      if (distanceSq <= WATER_PATCH_GROWTH_EFFECT_RADIUS_SQ) {
        hasWater = true;
        
        // Calculate effect strength based on distance (closer = stronger effect)
        const distance = Math.sqrt(distanceSq);
        const distanceFactor = Math.max(0, Math.min(1, (WATER_PATCH_GROWTH_EFFECT_RADIUS - distance) / WATER_PATCH_GROWTH_EFFECT_RADIUS));
        
        // Calculate effect strength based on patch opacity (fresher patches = stronger effect)
        const opacityFactor = waterPatch.currentOpacity;
        
        if ((waterPatch as any).isSaltWater) {
          // Salt water: negative effect (reduces growth)
          // Maximum penalty: -50% growth (0.5x multiplier) when very close
          // Minimum penalty: -10% growth (0.9x multiplier) at edge of radius
          const saltPenalty = 0.5 + (0.4 * (1.0 - distanceFactor * opacityFactor));
          bestMultiplier = Math.min(bestMultiplier, saltPenalty);
          isSaltWater = true;
        } else {
          // Fresh water: positive effect (boosts growth)
          // Maximum bonus: +100% growth (2.0x multiplier) when very close
          // Minimum bonus: +15% growth (1.15x multiplier) at edge of radius
          const freshBonus = 1.0 + (1.0 * distanceFactor * opacityFactor); // GROWTH_BONUS_MULTIPLIER = 2.0, so (2.0 - 1.0) = 1.0
          bestMultiplier = Math.max(bestMultiplier, freshBonus);
        }
      }
    }
    
    return { hasWater, isSaltWater, multiplier: bestMultiplier };
  };
  
  // Check if seed is near fertilizer/compost and calculate effect
  const getFertilizerPatchEffect = (): { hasFertilizer: boolean; multiplier: number } => {
    const FERTILIZER_PATCH_GROWTH_EFFECT_RADIUS = 60; // pixels (matching server constant)
    const FERTILIZER_PATCH_GROWTH_EFFECT_RADIUS_SQ = FERTILIZER_PATCH_GROWTH_EFFECT_RADIUS * FERTILIZER_PATCH_GROWTH_EFFECT_RADIUS;
    const FERTILIZER_GROWTH_BONUS_MULTIPLIER = 2.0; // 2x growth rate (matching server constant)
    
    let bestMultiplier = 1.0; // Base multiplier (no effect)
    let hasFertilizer = false;
    
    for (const fertilizerPatch of fertilizerPatches.values()) {
      const dx = seed.posX - fertilizerPatch.posX;
      const dy = seed.posY - fertilizerPatch.posY;
      const distanceSq = dx * dx + dy * dy;
      
      if (distanceSq <= FERTILIZER_PATCH_GROWTH_EFFECT_RADIUS_SQ) {
        hasFertilizer = true;
        
        // Calculate effect strength based on distance (closer = stronger effect)
        const distance = Math.sqrt(distanceSq);
        const distanceFactor = Math.max(0, Math.min(1, (FERTILIZER_PATCH_GROWTH_EFFECT_RADIUS - distance) / FERTILIZER_PATCH_GROWTH_EFFECT_RADIUS));
        
        // Calculate effect strength based on patch opacity (fresher patches = stronger effect)
        const opacityFactor = fertilizerPatch.currentOpacity;
        
        // Fertilizer: positive effect (boosts growth)
        // Maximum bonus: +100% growth (2.0x multiplier) when very close
        // Minimum bonus: +15% growth (1.15x multiplier) at edge of radius
        const fertilizerBonus = 1.0 + (FERTILIZER_GROWTH_BONUS_MULTIPLIER - 1.0) * distanceFactor * opacityFactor;
        bestMultiplier = Math.max(bestMultiplier, fertilizerBonus);
      }
    }
    
    return { hasFertilizer, multiplier: bestMultiplier };
  };
  
  // Check nearby light sources
  const calculateLightEffects = (): { nearCampfire: boolean; nearLantern: boolean; nearFurnace: boolean } => {
    let nearCampfire = false;
    let nearLantern = false;
    let nearFurnace = false;
    
    // Check campfires (negative effect)
    campfires.forEach(campfire => {
      if (campfire.isBurning && !campfire.isDestroyed) {
        const dx = seed.posX - campfire.posX;
        const dy = seed.posY - campfire.posY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 120) {
          nearCampfire = true;
        }
      }
    });
    
    // Check lanterns (positive effect)
    lanterns.forEach(lantern => {
      if (lantern.isBurning && !lantern.isDestroyed) {
        const dx = seed.posX - lantern.posX;
        const dy = seed.posY - lantern.posY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 100) {
          nearLantern = true;
        }
      }
    });
    
    // Check furnaces (moderate positive effect at night)
    furnaces.forEach(furnace => {
      if (furnace.isBurning && !furnace.isDestroyed) {
        const dx = seed.posX - furnace.posX;
        const dy = seed.posY - furnace.posY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 120) {
          nearFurnace = true;
        }
      }
    });
    
    return { nearCampfire, nearLantern, nearFurnace };
  };
  
  // Check if this is a mushroom plant type
  const isMushroom = (): boolean => {
    const plantTypeTag = seed.plantType.tag;
    return plantTypeTag === 'Chanterelle' ||
           plantTypeTag === 'Porcini' ||
           plantTypeTag === 'FlyAgaric' ||
           plantTypeTag === 'ShaggyInkCap' ||
           plantTypeTag === 'DeadlyWebcap' ||
           plantTypeTag === 'DestroyingAngel';
  };

  // Check if seed is near trees (for mushroom bonus)
  const isNearTree = (): boolean => {
    const TREE_COVER_DISTANCE = 150; // pixels (matching server-side constant)
    const TREE_COVER_DISTANCE_SQ = TREE_COVER_DISTANCE * TREE_COVER_DISTANCE;
    
    for (const tree of trees.values()) {
      const dx = seed.posX - tree.posX;
      const dy = seed.posY - tree.posY;
      const distanceSq = dx * dx + dy * dy;
      
      if (distanceSq <= TREE_COVER_DISTANCE_SQ) {
        return true;
      }
    }
    
    return false;
  };

  // Check if seed is within range of a Green (Agrarian) rune stone
  const isNearGreenRuneStone = (): boolean => {
    const RUNE_STONE_EFFECT_RADIUS = 2000; // pixels (matching server-side constant)
    const RUNE_STONE_EFFECT_RADIUS_SQ = RUNE_STONE_EFFECT_RADIUS * RUNE_STONE_EFFECT_RADIUS;
    
    for (const runeStone of runeStones.values()) {
      // Only check Green (Agrarian) rune stones
      if (runeStone.runeType?.tag !== 'Green') {
        continue;
      }
      
      const dx = seed.posX - runeStone.posX;
      const dy = seed.posY - runeStone.posY;
      const distanceSq = dx * dx + dy * dy;
      
      if (distanceSq <= RUNE_STONE_EFFECT_RADIUS_SQ) {
        return true;
      }
    }
    
    return false;
  };

  // Check if seed is on prepared soil (Dirt or Tilled) for growth bonus
  const isOnPreparedSoil = (): boolean => {
    if (!worldChunkData) return false;
    
    // Calculate tile coordinates from world position
    const tileX = Math.floor(seed.posX / TILE_SIZE_PX);
    const tileY = Math.floor(seed.posY / TILE_SIZE_PX);
    
    // Calculate chunk coordinates
    const chunkX = Math.floor(tileX / CHUNK_SIZE_TILES);
    const chunkY = Math.floor(tileY / CHUNK_SIZE_TILES);
    
    // Get the chunk
    const chunkKey = `${chunkX},${chunkY}`;
    const chunk = worldChunkData.get(chunkKey);
    if (!chunk) return false;
    
    // Calculate local tile position within the chunk
    let localTileX = tileX % CHUNK_SIZE_TILES;
    let localTileY = tileY % CHUNK_SIZE_TILES;
    
    // Handle negative tile coordinates
    if (localTileX < 0) localTileX += CHUNK_SIZE_TILES;
    if (localTileY < 0) localTileY += CHUNK_SIZE_TILES;
    
    // Get tile index and type
    const tileIndex = localTileY * CHUNK_SIZE_TILES + localTileX;
    if (tileIndex >= chunk.tileTypes.length) return false;
    
    const tileType = chunk.tileTypes[tileIndex];
    
    // Check if it's Dirt (1) or Tilled (13)
    return tileType === TILE_TYPE_DIRT || tileType === TILE_TYPE_TILLED;
  };

  // Check if seed is on beach tile
  const isOnBeachTile = (): boolean => {
    if (!worldChunkData) return false;
    
    // Calculate tile coordinates from world position
    const tileX = Math.floor(seed.posX / TILE_SIZE_PX);
    const tileY = Math.floor(seed.posY / TILE_SIZE_PX);
    
    // Calculate chunk coordinates
    const chunkX = Math.floor(tileX / CHUNK_SIZE_TILES);
    const chunkY = Math.floor(tileY / CHUNK_SIZE_TILES);
    
    // Get the chunk
    const chunkKey = `${chunkX},${chunkY}`;
    const chunk = worldChunkData.get(chunkKey);
    if (!chunk) return false;
    
    // Calculate local tile position within the chunk
    let localTileX = tileX % CHUNK_SIZE_TILES;
    let localTileY = tileY % CHUNK_SIZE_TILES;
    
    // Handle negative tile coordinates
    if (localTileX < 0) localTileX += CHUNK_SIZE_TILES;
    if (localTileY < 0) localTileY += CHUNK_SIZE_TILES;
    
    // Get tile index and type
    const tileIndex = localTileY * CHUNK_SIZE_TILES + localTileX;
    if (tileIndex >= chunk.tileTypes.length) return false;
    
    const tileType = chunk.tileTypes[tileIndex];
    
    // Check if it's Beach (4)
    return tileType === TILE_TYPE_BEACH;
  };

  // Check if plant type is beach-specific (native to sandy/coastal environments)
  // Beach-specific plants don't suffer growth penalties on beach tiles
  const isBeachSpecificPlant = (): boolean => {
    const plantTypeTag = seed.plantType.tag;
    return plantTypeTag === 'BeachLymeGrass' ||
           plantTypeTag === 'ScurvyGrass' ||
           plantTypeTag === 'SeaPlantain' ||
           plantTypeTag === 'Glasswort' ||
           plantTypeTag === 'SeaweedBed' ||
           plantTypeTag === 'Reed' ||
           plantTypeTag === 'BeachWoodPile';
  };

  const cloudCoverage = calculateCloudCoverage();
  const waterPatchEffect = getWaterPatchEffect();
  const fertilizerPatchEffect = getFertilizerPatchEffect();
  const nearTree = isNearTree();
  const nearGreenRuneStone = isNearGreenRuneStone();
  const lightEffects = calculateLightEffects();
  const onPreparedSoil = isOnPreparedSoil();
  const onBeachTile = isOnBeachTile();
  const beachSpecificPlant = isBeachSpecificPlant();
  // Beach penalty only applies to non-beach plants on beach tiles
  const hasBeachPenalty = onBeachTile && !beachSpecificPlant;
  
  // Use chunk-specific weather if available, otherwise fall back to global weather
  const currentWeather = seedChunkWeather?.currentWeather?.tag || worldState?.currentWeather.tag || 'Clear';
  const currentTimeOfDay = worldState?.timeOfDay.tag || 'Noon';
  const isMushroomPlant = isMushroom();

  // --- Growth Multiplier Calculations (matching server logic) ---

  // Time of day growth multiplier (matches server get_time_of_day_growth_multiplier)
  const getTimeOfDayMultiplier = (timeOfDay: string): number => {
    switch (timeOfDay) {
      case 'Dawn': return 0.3;
      case 'TwilightMorning': return 0.5;
      case 'Morning': return 1.0;
      case 'Noon': return 1.5;
      case 'Afternoon': return 1.2;
      case 'Dusk': return 0.4;
      case 'TwilightEvening': return 0.2;
      case 'Night': return 0.0;
      case 'Midnight': return 0.0;
      default: return 1.0;
    }
  };

  // Weather growth multiplier (matches server get_weather_growth_multiplier)
  const getWeatherMultiplier = (weather: string): number => {
    switch (weather) {
      case 'Clear': return 1.0;
      case 'LightRain': return 1.3;
      case 'ModerateRain': return 1.6;
      case 'HeavyRain': return 1.4;
      case 'HeavyStorm': return 0.8;
      default: return 1.0;
    }
  };

  // Cloud cover multiplier (matches server)
  // Normal plants: 60% reduction from heavy clouds (0.4x min)
  // Mushrooms: clouds help (+36% max)
  const getCloudMultiplier = (coverage: number, isMushroom: boolean): number => {
    if (isMushroom) {
      // Mushrooms benefit from clouds
      return 1.0 + (coverage * 0.36);
    } else {
      // Regular plants are penalized by clouds
      return Math.max(0.4, 1.0 - (coverage * 0.6));
    }
  };

  // Light source multiplier (matches server logic)
  const getLightMultiplier = (effects: { nearCampfire: boolean; nearLantern: boolean; nearFurnace: boolean }): number => {
    let totalEffect = 0;
    
    // Campfire: -40% max (negative)
    if (effects.nearCampfire) {
      totalEffect -= 0.4;
    }
    
    // Lantern: +80% max (positive)
    if (effects.nearLantern) {
      totalEffect += 0.8;
    }
    
    // Furnace: +60% max (positive, slightly less than lantern)
    if (effects.nearFurnace) {
      totalEffect += 0.6;
    }
    
    return Math.max(0.2, Math.min(2.0, 1.0 + totalEffect));
  };

  // Mushroom bonus multiplier (matches server logic)
  const getMushroomBonusMultiplier = (isMushroom: boolean, nearTree: boolean, timeOfDay: string): number => {
    if (!isMushroom) return 1.0;
    
    const bonusFactors: number[] = [];
    
    // Tree cover bonus
    if (nearTree) {
      bonusFactors.push(1.5); // +50% from tree cover
    }
    
    // Night time bonus
    switch (timeOfDay) {
      case 'Night': bonusFactors.push(1.5); break;
      case 'Midnight': bonusFactors.push(1.6); break;
      case 'TwilightEvening': bonusFactors.push(1.3); break;
      case 'TwilightMorning': bonusFactors.push(1.3); break;
      case 'Dusk': bonusFactors.push(1.2); break;
      case 'Dawn': bonusFactors.push(1.1); break;
    }
    
    if (bonusFactors.length === 0) return 1.0;
    
    // Average the bonuses and cap at 2.0x
    const avgBonus = bonusFactors.reduce((a, b) => a + b, 0) / bonusFactors.length;
    return Math.min(2.0, avgBonus);
  };

  // Calculate total growth multiplier
  const calculateTotalGrowthMultiplier = (): number => {
    const baseTimeMultiplier = getTimeOfDayMultiplier(currentTimeOfDay);
    const weatherMultiplier = getWeatherMultiplier(currentWeather);
    const cloudMultiplier = getCloudMultiplier(cloudCoverage, isMushroomPlant);
    const lightMultiplier = getLightMultiplier(lightEffects);
    const mushroomBonus = getMushroomBonusMultiplier(isMushroomPlant, nearTree, currentTimeOfDay);
    const waterMult = waterPatchEffect.multiplier;
    const fertilizerMult = fertilizerPatchEffect.multiplier;
    const soilMult = onPreparedSoil ? PREPARED_SOIL_GROWTH_MULTIPLIER : 1.0;
    const beachMult = hasBeachPenalty ? BEACH_TILE_GROWTH_PENALTY : 1.0;
    
    // Green rune stone bonus (matches server: 1.5x = +50%)
    const greenRuneMult = nearGreenRuneStone ? 1.5 : 1.0;
    
    // If green rune stone is active, apply ALL positive bonuses but ignore penalties (including beach)
    if (greenRuneMult > 1.0) {
      const positiveLightMult = Math.max(1.0, lightMultiplier);
      return greenRuneMult * waterMult * fertilizerMult * mushroomBonus * soilMult * positiveLightMult;
    }
    
    // Normal calculation with all factors (including beach penalty)
    return baseTimeMultiplier * weatherMultiplier * cloudMultiplier * lightMultiplier * mushroomBonus * waterMult * fertilizerMult * soilMult * beachMult;
  };

  const totalGrowthMultiplier = calculateTotalGrowthMultiplier();

  // Calculate dynamic time until maturity based on current conditions
  // This gives a real-time accurate estimate that updates as conditions change
  const calculateDynamicTimeRemaining = (): number => {
    if (isFullyGrown || totalGrowthMultiplier <= 0) {
      return 0;
    }
    
    const remainingProgress = 1.0 - seed.growthProgress;
    // Base growth rate: progress per second at 1x multiplier
    const baseGrowthRate = 1.0 / Number(seed.baseGrowthTimeSecs);
    // Actual growth rate with current conditions
    const actualGrowthRate = baseGrowthRate * totalGrowthMultiplier;
    
    if (actualGrowthRate <= 0) {
      // Growth is stalled (e.g., night time for non-mushroom plants)
      return Infinity;
    }
    
    // Time remaining in milliseconds
    const remainingSeconds = remainingProgress / actualGrowthRate;
    return remainingSeconds * 1000;
  };

  const timeUntilMatureMs = calculateDynamicTimeRemaining();
  
  // Get plant type name (format the tag nicely)
  const plantTypeName = seed.plantType.tag
    .split(/(?=[A-Z])/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  // Get plant image source from PlantType
  const getPlantImageSource = (plantType: PlantType): string | null => {
    const plantTypeTag = plantType.tag;
    // Check if this plant type exists in RESOURCE_IMAGE_SOURCES
    if (plantTypeTag in RESOURCE_IMAGE_SOURCES) {
      return RESOURCE_IMAGE_SOURCES[plantTypeTag as keyof typeof RESOURCE_IMAGE_SOURCES];
    }
    return null;
  };
  
  const plantImageSource = getPlantImageSource(seed.plantType);
  
  // Determine growth stage for visual indicator (must match CSS class names)
  const getGrowthStage = () => {
    if (growthPercent >= 100) return 'mature';
    if (growthPercent >= 75) return 'almostMature'; // Changed to camelCase to match CSS
    if (growthPercent >= 50) return 'growing';
    if (growthPercent >= 25) return 'sprouting';
    return 'planted';
  };
  
  const growthStage = getGrowthStage();
  
  // Position tooltip slightly offset from cursor
  const tooltipStyle = {
    left: `${position.x + 15}px`,
    top: `${position.y + 15}px`,
  };

  return (
    <div className={styles.tooltipContainer} style={tooltipStyle}>
      {/* Header with plant type */}
      <div className={`${styles.header} ${styles[growthStage]}`}>
        {plantImageSource ? (
          <img 
            src={plantImageSource} 
            alt={plantTypeName}
            className={styles.plantIcon}
          />
        ) : (
          <span className={styles.plantIcon}>🌱</span>
        )}
        <span className={styles.plantName}>{plantTypeName}</span>
      </div>
      
      {/* Growth progress bar */}
      <div className={styles.progressSection}>
        <div className={styles.progressLabel}>
          <span>Growth Progress</span>
          <span className={styles.progressPercent}>{growthPercent}%</span>
        </div>
        <div className={styles.progressBarContainer}>
          <div 
            className={`${styles.progressBarFill} ${styles[growthStage]}`}
            style={{ width: `${growthPercent}%` }}
          />
        </div>
      </div>
      
      {/* Info rows */}
      <div className={styles.infoSection}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Seed Type:</span>
          <span className={styles.infoValue}>{seed.seedType}</span>
        </div>
        
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Time Growing:</span>
          <span className={styles.infoValue}>
            {formatTimeDuration(timeSpentGrowingMs)}
          </span>
        </div>
        
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>
            {isFullyGrown ? 'Status:' : 'Time Until Mature:'}
          </span>
          <span className={`${styles.infoValue} ${styles[growthStage]}`}>
            {isFullyGrown ? '✓ Ready to Harvest!' : formatTimeDuration(timeUntilMatureMs)}
          </span>
        </div>
        
        {!isFullyGrown && (
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Growth Rate:</span>
            <span className={`${styles.infoValue} ${
              totalGrowthMultiplier >= 1.5 ? styles.positive :
              totalGrowthMultiplier <= 0.5 ? styles.negative :
              totalGrowthMultiplier === 0 ? styles.negative :
              styles.neutral
            }`}>
              {totalGrowthMultiplier === 0 
                ? '⏸️ Paused' 
                : `${Math.round(totalGrowthMultiplier * 100)}%`
              }
            </span>
          </div>
        )}
      </div>
      
      {/* Growth Conditions Section */}
      {!isFullyGrown && (
        <div className={styles.conditionsSection}>
          <div className={styles.conditionsHeader}>Growth Conditions</div>
          
          {/* Time of Day */}
          <div className={styles.conditionRow}>
            <span className={styles.conditionLabel}>Time of Day:</span>
            <span className={`${styles.conditionValue} ${
              isMushroomPlant 
                ? (currentTimeOfDay === 'Night' || currentTimeOfDay === 'Midnight' ? styles.positive : styles.neutral)
                : (currentTimeOfDay === 'Night' || currentTimeOfDay === 'Midnight' ? styles.negative : styles.neutral)
            }`}>
              {currentTimeOfDay}
              {isMushroomPlant ? (
                (currentTimeOfDay === 'Night' || currentTimeOfDay === 'Midnight') && ' 🌙 +50%'
              ) : (
                <>
                  {(currentTimeOfDay === 'Night' || currentTimeOfDay === 'Midnight') && ' ⛔'}
                  {currentTimeOfDay === 'Noon' && ' ☀️'}
                </>
              )}
            </span>
          </div>
          
          {/* Weather */}
          <div className={styles.conditionRow}>
            <span className={styles.conditionLabel}>Weather:</span>
            <span className={`${styles.conditionValue} ${
              currentWeather === 'LightRain' || currentWeather === 'ModerateRain' ? styles.positive : 
              currentWeather === 'HeavyStorm' ? styles.negative : 
              styles.neutral
            }`}>
              {currentWeather === 'LightRain' && '🌧️ Light Rain +30%'}
              {currentWeather === 'ModerateRain' && '🌧️ Moderate Rain +60%'}
              {currentWeather === 'HeavyRain' && '⛈️ Heavy Rain +40%'}
              {currentWeather === 'HeavyStorm' && '⛈️ Heavy Storm -20%'}
              {currentWeather === 'Clear' && '☀️ Clear'}
            </span>
          </div>
          
          {/* Cloud Coverage */}
          {cloudCoverage > 0.1 && (
            <div className={styles.conditionRow}>
              <span className={styles.conditionLabel}>Cloud Cover:</span>
              <span className={`${styles.conditionValue} ${isMushroomPlant ? styles.positive : styles.negative}`}>
                ☁️ {Math.round(cloudCoverage * 100)}% 
                {isMushroomPlant 
                  ? ` (+${Math.round(cloudCoverage * 36)}%)` 
                  : ` (−${Math.round(cloudCoverage * 60)}%)`
                }
              </span>
            </div>
          )}
          
          {/* Tree Proximity (mushrooms only) */}
          {isMushroomPlant && nearTree && (
            <div className={styles.conditionRow}>
              <span className={styles.conditionLabel}>Near Tree:</span>
              <span className={`${styles.conditionValue} ${styles.positive}`}>
                🌳 Yes +50%
              </span>
            </div>
          )}
          
          {/* Green Rune Stone (Agrarian) Effect */}
          {nearGreenRuneStone && (
            <div className={styles.conditionRow}>
              <span className={styles.conditionLabel}>Green Rune Stone:</span>
              <span className={`${styles.conditionValue} ${styles.positive}`}>
                💚 Active +50%
              </span>
            </div>
          )}
          
          {/* Prepared Soil (Dirt or Tilled) */}
          {onPreparedSoil && (
            <div className={styles.conditionRow}>
              <span className={styles.conditionLabel}>Prepared Soil:</span>
              <span className={`${styles.conditionValue} ${styles.positive}`}>
                🌾 Yes +50%
              </span>
            </div>
          )}
          
          {/* Beach Tile Penalty (non-beach plants on sandy soil) */}
          {hasBeachPenalty && (
            <div className={styles.conditionRow}>
              <span className={styles.conditionLabel}>Sandy Soil:</span>
              <span className={`${styles.conditionValue} ${styles.negative}`}>
                🏖️ Beach −50%
              </span>
            </div>
          )}
          
          {/* Water Proximity */}
          {waterPatchEffect.hasWater && (
            <div className={styles.conditionRow}>
              <span className={styles.conditionLabel}>
                {waterPatchEffect.isSaltWater ? 'Near Salt Water:' : 'Near Water:'}
              </span>
              <span className={`${styles.conditionValue} ${
                waterPatchEffect.isSaltWater ? styles.negative : styles.positive
              }`}>
                {waterPatchEffect.isSaltWater ? '🧂 ' : '💧 '}
                {waterPatchEffect.isSaltWater ? 'Yes ' : 'Yes '}
                {waterPatchEffect.multiplier < 1.0 
                  ? `−${Math.round((1.0 - waterPatchEffect.multiplier) * 100)}%`
                  : `+${Math.round((waterPatchEffect.multiplier - 1.0) * 100)}%`
                }
              </span>
            </div>
          )}
          
          {/* Fertilizer/Compost Proximity */}
          {fertilizerPatchEffect.hasFertilizer && (
            <div className={styles.conditionRow}>
              <span className={styles.conditionLabel}>Near Compost:</span>
              <span className={`${styles.conditionValue} ${styles.positive}`}>
                🌿 Yes +{Math.round((fertilizerPatchEffect.multiplier - 1.0) * 100)}%
              </span>
            </div>
          )}
          
          {/* Light Sources */}
          {lightEffects.nearLantern && (
            <div className={styles.conditionRow}>
              <span className={styles.conditionLabel}>Near Lantern:</span>
              <span className={`${styles.conditionValue} ${styles.positive}`}>
                🏮 Yes +80%
              </span>
            </div>
          )}
          
          {lightEffects.nearFurnace && (
            <div className={styles.conditionRow}>
              <span className={styles.conditionLabel}>Near Furnace:</span>
              <span className={`${styles.conditionValue} ${styles.positive}`}>
                🔥 Yes +60%
              </span>
            </div>
          )}
          
          {lightEffects.nearCampfire && (
            <div className={styles.conditionRow}>
              <span className={styles.conditionLabel}>Near Campfire:</span>
              <span className={`${styles.conditionValue} ${styles.negative}`}>
                🔥 Too close! −40%
              </span>
            </div>
          )}
          
          {/* Base Growth Time Note */}
          <div className={styles.baseTimeNote}>
            * Time updates in real-time based on current conditions
          </div>
        </div>
      )}
    </div>
  );
};

export default PlantedSeedTooltip;