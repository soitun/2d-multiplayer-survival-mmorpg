import React, { useMemo, useState, useCallback } from 'react';
import { PlantConfigDefinition, PlantCategory } from '../generated';
import { getItemIcon } from '../utils/itemIconUtils';
import './PlantEncyclopedia.css';

// Special mappings for items where icon filename doesn't match item name exactly
const ITEM_ICON_MAPPINGS: Record<string, string> = {
  'Bush Knife': 'machete.png', // Uses machete icon
  'Large Wooden Storage Box': 'large_wood_box.png',
  'Primitive Reed Fishing Rod': 'reed_fishing_rod.png',
  'Reed Diver\'s Helm': 'reed_snorkel.png',
  'Bone Gaff Hook': 'fishing_gaff_hook.png',
  'Plastic Water Jug': 'water_jug.png',
  'Headlamp': 'tallow_head_lamp.png',
  'Lantern': 'lantern_off.png',
  // Plant items with compound names
  'Rowan Berries': 'rowanberries.png',
  'Rowan Seeds': 'rowanberry_seeds.png',
  'Corn': 'corn.png',
  'Corn Seeds': 'corn_seeds.png',
  'Salsify Root': 'salsify.png',
  'Salsify Seeds': 'salsify_seeds.png',
  'Beet Seeds': 'beet_seeds.png',
  'Beet': 'beets.png', // Singular form
  'Common Reed Stalk': 'reed_stalk.png',
  // Dogbane items
  'Dogbane Fiber': 'dogbane.png', // Use plant icon for fiber
  'Dogbane Seeds': 'dogbane_seeds.png', // Use generic seeds icon (no specific dogbane_seeds.png exists)
  // Mandrake items
  'Mandrake Root': 'mandrake.png', // Use plant icon for root
  // Horseradish items
  'Horseradish Root': 'horseradish.png', // Use plant icon for root
  'Wild Strawberries': 'wild_strawberries.png',
  'Wild Strawberry Seeds': 'wild_strawberry_seeds.png',
  'Mint Leaves': 'mint.png',
  'Valerian Root': 'valerian.png',
  'Bog Cotton Seeds': 'bog_cotton_seeds.png',
};

// Helper to get item icon from item name
const getItemIconFromName = (itemName: string): string | null => {
  // First check special mappings
  if (ITEM_ICON_MAPPINGS[itemName]) {
    return getItemIcon(ITEM_ICON_MAPPINGS[itemName]);
  }
  
  // Convert item name to icon filename (e.g., "Raw Meat" -> "raw_meat.png")
  // Handle possessives like "Babushka's" -> "babushka" (remove 's entirely)
  // Handle compound words like "Rowan Berries" -> "rowanberries" (remove space for berries/seeds)
  // Handle adjectives like "Common" that should be dropped
  let iconName = itemName
    .toLowerCase()
    .replace(/^(common|wild|raw|cooked|burnt|dried)\s+/i, '') // Remove common adjectives at start
    .replace(/['']s\b/g, '')  // Remove possessive 's (e.g., "babushka's" -> "babushka")
    .replace(/['']/g, '')     // Remove any remaining apostrophes
    .trim();
  
  // Handle common compound patterns (berries, seeds, etc.)
  iconName = iconName
    .replace(/\s+berry\s+seeds?/gi, 'berry_seeds')  // "Rowan Berry Seeds" -> "rowanberry_seeds"
    .replace(/\s+berries/gi, 'berries')             // "Rowan Berries" -> "rowanberries"
    .replace(/\s+seeds?/gi, '_seeds')                // "Corn Seeds" -> "corn_seeds"
    .replace(/\s+/g, '_')                           // Replace remaining spaces with underscores
    + '.png';
  
  return getItemIcon(iconName);
};

interface PlantEncyclopediaProps {
  plantConfigs: Map<string, PlantConfigDefinition>;
  discoveredPlants: Map<string, any>; // Plants discovered by current player
}

// Category display configuration
const CATEGORY_CONFIG: Record<string, { name: string; color: string; icon: string; order: number }> = {
  'Vegetable': { name: 'Vegetables & Root Crops', color: '#4CAF50', icon: '🥕', order: 1 },
  'Berry': { name: 'Berries', color: '#E91E63', icon: '🫐', order: 2 },
  'Mushroom': { name: 'Mushrooms', color: '#795548', icon: '🍄', order: 3 },
  'Herb': { name: 'Herbs & Medicinal', color: '#8BC34A', icon: '🌿', order: 4 },
  'Fiber': { name: 'Fiber Plants', color: '#9E9E9E', icon: '🧵', order: 5 },
  'Arctic': { name: 'Arctic & Alpine Plants', color: '#03A9F4', icon: '❄️', order: 6 },
  'Toxic': { name: 'Toxic Plants', color: '#9C27B0', icon: '☠️', order: 7 },
  'ResourcePile': { name: 'Resource Piles', color: '#FF9800', icon: '📦', order: 8 },
  'Special': { name: 'Special Resources', color: '#00BCD4', icon: '✨', order: 9 },
};

// Helper to get category key from PlantCategory enum
function getCategoryKey(category: PlantCategory): string {
  if ('tag' in category) {
    return category.tag;
  }
  return String(category);
}

// Helper to get PlantType key
function getPlantTypeKey(plantType: any): string {
  if (plantType && 'tag' in plantType) {
    return plantType.tag;
  }
  return String(plantType);
}

// Helper to format percentage
function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// Helper to format yield range
function formatYieldRange(min: number, max: number): string {
  if (min === max) return String(min);
  return `${min}-${max}`;
}

// Helper to parse seasons string
function parseSeasons(seasonsStr: string): string[] {
  if (!seasonsStr) return [];
  return seasonsStr.split(',').filter(s => s.trim());
}

// Season badge colors
const SEASON_COLORS: Record<string, string> = {
  'Spring': '#4CAF50',
  'Summer': '#FF9800',
  'Autumn': '#F44336',
  'Winter': '#2196F3',
};

// Individual plant card component
const PlantCard: React.FC<{ plant: PlantConfigDefinition; isExpanded: boolean; onToggle: () => void }> = ({ 
  plant, 
  isExpanded, 
  onToggle 
}) => {
  const categoryKey = getCategoryKey(plant.category);
  const categoryConfig = CATEGORY_CONFIG[categoryKey] || { name: 'Unknown', color: '#666', icon: '❓', order: 99 };
  const seasons = parseSeasons(plant.growingSeasons);
  
  const hasSecondaryYield = plant.secondaryYieldItem && plant.secondaryYieldChance > 0;
  const hasSeedDrop = plant.seedType && plant.seedDropChance > 0;

  return (
    <div 
      className={`plant-card ${isExpanded ? 'expanded' : ''}`}
      onClick={onToggle}
      style={{ '--accent-color': categoryConfig.color } as React.CSSProperties}
    >
      <div className="plant-card-header">
        <span className="plant-icon">{categoryConfig.icon}</span>
        <span className="plant-name">{plant.entityName}</span>
        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
      </div>
      
      {isExpanded && (
        <div className="plant-card-details">
          {/* Primary Yield */}
          <div className="yield-section primary-yield">
            <div className="yield-header">Primary Yield</div>
            <div className="yield-content">
              {(() => {
                const icon = getItemIconFromName(plant.primaryYieldItem);
                return icon ? (
                  <img 
                    src={icon} 
                    alt={plant.primaryYieldItem}
                    className="yield-icon"
                    style={{ 
                      width: '20px', 
                      height: '20px', 
                      imageRendering: 'pixelated',
                      marginRight: '4px',
                      verticalAlign: 'middle'
                    }}
                  />
                ) : null;
              })()}
              <span className="yield-item">{plant.primaryYieldItem}</span>
              <span className="yield-amount">
                ×{formatYieldRange(plant.primaryYieldMin, plant.primaryYieldMax)}
              </span>
            </div>
          </div>
          
          {/* Secondary Yield (if any) */}
          {hasSecondaryYield && (
            <div className="yield-section secondary-yield">
              <div className="yield-header">Secondary Yield</div>
              <div className="yield-content">
                {(() => {
                  const icon = getItemIconFromName(plant.secondaryYieldItem || '');
                  return icon ? (
                    <img 
                      src={icon} 
                      alt={plant.secondaryYieldItem || ''}
                      className="yield-icon"
                      style={{ 
                        width: '20px', 
                        height: '20px', 
                        imageRendering: 'pixelated',
                        marginRight: '4px',
                        verticalAlign: 'middle'
                      }}
                    />
                  ) : null;
                })()}
                <span className="yield-item">{plant.secondaryYieldItem}</span>
                <span className="yield-amount">
                  ×{formatYieldRange(plant.secondaryYieldMin, plant.secondaryYieldMax)}
                </span>
                <span className="yield-chance">({formatPercent(plant.secondaryYieldChance)} chance)</span>
              </div>
            </div>
          )}
          
          {/* Seed Drop */}
          {hasSeedDrop && (
            <div className="yield-section seed-drop">
              <div className="yield-header">Seed Drop</div>
              <div className="yield-content">
                {(() => {
                  const icon = getItemIconFromName(plant.seedType || '');
                  return icon ? (
                    <img 
                      src={icon} 
                      alt={plant.seedType || ''}
                      className="yield-icon"
                      style={{ 
                        width: '20px', 
                        height: '20px', 
                        imageRendering: 'pixelated',
                        marginRight: '4px',
                        verticalAlign: 'middle'
                      }}
                    />
                  ) : null;
                })()}
                <span className="yield-item">{plant.seedType}</span>
                <span className="yield-chance">({formatPercent(plant.seedDropChance)} chance)</span>
              </div>
            </div>
          )}
          
          {/* Location */}
          <div className="info-section">
            <div className="info-label">📍 Location:</div>
            <div className="info-value">{plant.spawnLocation}</div>
          </div>
          
          {/* Growing Seasons */}
          <div className="info-section seasons-section">
            <div className="info-label">🌱 Grows in:</div>
            <div className="seasons-badges">
              {seasons.length > 0 ? (
                seasons.map(season => (
                  <span 
                    key={season} 
                    className="season-badge"
                    style={{ backgroundColor: SEASON_COLORS[season] || '#666' }}
                  >
                    {season}
                  </span>
                ))
              ) : (
                <span className="season-badge year-round">Year-round</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PlantEncyclopedia: React.FC<PlantEncyclopediaProps> = ({ plantConfigs, discoveredPlants }) => {
  const [expandedPlants, setExpandedPlants] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

  // Filter to only show discovered plants
  const discoveredPlantConfigs = useMemo(() => {
    const discovered = new Map<string, PlantConfigDefinition>();
    plantConfigs.forEach((plant, key) => {
      const plantTypeKey = getPlantTypeKey(plant.plantType);
      // Only include plants the player has discovered
      if (discoveredPlants.has(plantTypeKey)) {
        discovered.set(key, plant);
      }
    });
    return discovered;
  }, [plantConfigs, discoveredPlants]);

  // Group plants by category (only discovered ones)
  const groupedPlants = useMemo(() => {
    const groups: Record<string, PlantConfigDefinition[]> = {};
    
    discoveredPlantConfigs.forEach((plant) => {
      const categoryKey = getCategoryKey(plant.category);
      if (!groups[categoryKey]) {
        groups[categoryKey] = [];
      }
      groups[categoryKey].push(plant);
    });
    
    // Sort plants within each category alphabetically
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.entityName.localeCompare(b.entityName));
    });
    
    return groups;
  }, [discoveredPlantConfigs]);

  // Get sorted categories
  const sortedCategories = useMemo(() => {
    return Object.keys(groupedPlants).sort((a, b) => {
      const orderA = CATEGORY_CONFIG[a]?.order ?? 99;
      const orderB = CATEGORY_CONFIG[b]?.order ?? 99;
      return orderA - orderB;
    });
  }, [groupedPlants]);

  // Filter plants based on search and category
  const filteredPlants = useMemo(() => {
    let plants: PlantConfigDefinition[] = [];
    
    if (selectedCategory) {
      plants = groupedPlants[selectedCategory] || [];
    } else {
      // Show all plants
      sortedCategories.forEach(cat => {
        plants = plants.concat(groupedPlants[cat] || []);
      });
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      plants = plants.filter(p => 
        p.entityName.toLowerCase().includes(query) ||
        p.primaryYieldItem.toLowerCase().includes(query) ||
        (p.secondaryYieldItem && p.secondaryYieldItem.toLowerCase().includes(query)) ||
        (p.seedType && p.seedType.toLowerCase().includes(query))
      );
    }
    
    return plants;
  }, [groupedPlants, selectedCategory, searchQuery, sortedCategories]);

  // Toggle plant expansion
  const togglePlant = useCallback((plantKey: string) => {
    setExpandedPlants(prev => {
      const next = new Set(prev);
      if (next.has(plantKey)) {
        next.delete(plantKey);
      } else {
        next.add(plantKey);
      }
      return next;
    });
  }, []);

  // Stats
  const totalPlants = plantConfigs.size;
  const discoveredCount = discoveredPlantConfigs.size;
  const displayedPlants = filteredPlants.length;
  const hasDiscoveredAny = discoveredCount > 0;

  return (
    <div className="plant-encyclopedia">
      {/* Header */}
      <div className="encyclopedia-header">
        <h2>🌿 Plant Encyclopedia</h2>
        <div className="plant-count">
          {hasDiscoveredAny 
            ? `Discovered: ${discoveredCount} / ${totalPlants}` 
            : 'No plants discovered yet'}
        </div>
      </div>

      {/* Search - only show if player has discovered plants */}
      {hasDiscoveredAny && (
        <div className="search-container">
          <input
            type="text"
            placeholder="Search plants, yields, or seeds..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              // Prevent ALL game control keys from bubbling up to the game
              const gameControlKeys = ['f', 'g', ' ', 'e', 'w', 'a', 's', 'd', 'z', 'c', 'm'];
              const key = e.key.toLowerCase();
              
              if (gameControlKeys.includes(key)) {
                // Prevent game actions but allow typing in the input
                e.stopPropagation();
              }
              
              // Handle Escape key to blur the input and ensure game controls are restored
              if (e.key === 'Escape') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            onFocus={() => {
              console.log('[PlantEncyclopedia] Search input focused - should block game controls');
            }}
            onBlur={() => {
              console.log('[PlantEncyclopedia] Search input blurred - should unblock game controls');
            }}
            className="search-input"
            data-is-chat-input="true"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          {searchQuery && (
            <button 
              className="clear-search" 
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Category Filters - only show if player has discovered plants */}
      {hasDiscoveredAny && (
        <div className="category-filters">
        <button
          className={`category-btn ${selectedCategory === null ? 'active' : ''}`}
          onClick={() => setSelectedCategory(null)}
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setHoveredCategory('All');
            setTooltipPosition({
              x: rect.left,
              y: rect.top + rect.height / 2
            });
          }}
          onMouseLeave={() => {
            setHoveredCategory(null);
            setTooltipPosition(null);
          }}
        >
          All
        </button>
        {sortedCategories.map(cat => {
          const config = CATEGORY_CONFIG[cat];
          const count = groupedPlants[cat]?.length || 0;
          return (
            <button
              key={cat}
              className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              style={{ '--cat-color': config?.color || '#666' } as React.CSSProperties}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoveredCategory(cat);
                setTooltipPosition({
                  x: rect.left,
                  y: rect.top + rect.height / 2
                });
              }}
              onMouseLeave={() => {
                setHoveredCategory(null);
                setTooltipPosition(null);
              }}
            >
              <span className="cat-icon">{config?.icon || '❓'}</span>
              <span className="cat-count">{count}</span>
            </button>
          );
        })}
        </div>
      )}

      {/* Custom Styled Tooltip */}
      {hasDiscoveredAny && hoveredCategory && tooltipPosition && (
        <div
          className="category-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            transform: 'translate(-100%, -50%)',
            marginLeft: '-8px',
            pointerEvents: 'none',
            zIndex: 10000
          }}
        >
          <span className="tooltip-content">
            {hoveredCategory === 'All' 
              ? 'All Categories' 
              : CATEGORY_CONFIG[hoveredCategory]?.name || hoveredCategory}
          </span>
        </div>
      )}

      {/* Plant List */}
      <div className="plants-list">
        {!hasDiscoveredAny ? (
          <div className="no-plants discovery-message">
            <div className="discovery-icon">🌱</div>
            <div className="discovery-title">No Plants Discovered Yet</div>
            <div className="discovery-hint">
              Harvest wild plants and crops to add them to your encyclopedia.
              Each new plant you collect will be recorded here!
            </div>
          </div>
        ) : filteredPlants.length === 0 ? (
          <div className="no-plants">
            {searchQuery.trim() 
              ? 'No discovered plants match your search.' 
              : 'No plants in this category yet.'}
          </div>
        ) : (
          filteredPlants.map(plant => {
            const plantKey = getPlantTypeKey(plant.plantType);
            return (
              <PlantCard
                key={plantKey}
                plant={plant}
                isExpanded={expandedPlants.has(plantKey)}
                onToggle={() => togglePlant(plantKey)}
              />
            );
          })
        )}
      </div>

      {/* Legend - only show if player has discovered plants */}
      {hasDiscoveredAny && (
        <div className="encyclopedia-legend">
          <div className="legend-title">Yield Guide</div>
          <div className="legend-items">
            <div className="legend-item">
              <span className="legend-dot primary"></span>
              <span>Primary Yield - Always drops</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot secondary"></span>
              <span>Secondary Yield - Chance-based bonus</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot seed"></span>
              <span>Seed Drop - For farming</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlantEncyclopedia;

