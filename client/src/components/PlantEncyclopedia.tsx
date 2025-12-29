import React, { useMemo, useState, useCallback } from 'react';
import { PlantConfigDefinition, PlantCategory } from '../generated';
import './PlantEncyclopedia.css';

interface PlantEncyclopediaProps {
  plantConfigs: Map<string, PlantConfigDefinition>;
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

const PlantEncyclopedia: React.FC<PlantEncyclopediaProps> = ({ plantConfigs }) => {
  const [expandedPlants, setExpandedPlants] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Group plants by category
  const groupedPlants = useMemo(() => {
    const groups: Record<string, PlantConfigDefinition[]> = {};
    
    plantConfigs.forEach((plant) => {
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
  }, [plantConfigs]);

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
  const displayedPlants = filteredPlants.length;

  return (
    <div className="plant-encyclopedia">
      {/* Header */}
      <div className="encyclopedia-header">
        <h2>🌿 Plant Encyclopedia</h2>
        <div className="plant-count">
          {displayedPlants === totalPlants 
            ? `${totalPlants} harvestable resources` 
            : `Showing ${displayedPlants} of ${totalPlants}`}
        </div>
      </div>

      {/* Search */}
      <div className="search-container">
        <input
          type="text"
          placeholder="Search plants, yields, or seeds..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
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

      {/* Category Filters */}
      <div className="category-filters">
        <button
          className={`category-btn ${selectedCategory === null ? 'active' : ''}`}
          onClick={() => setSelectedCategory(null)}
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
            >
              <span className="cat-icon">{config?.icon || '❓'}</span>
              <span className="cat-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Plant List */}
      <div className="plants-list">
        {filteredPlants.length === 0 ? (
          <div className="no-plants">
            {plantConfigs.size === 0 
              ? 'Loading plant data...' 
              : 'No plants match your search.'}
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

      {/* Legend */}
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
    </div>
  );
};

export default PlantEncyclopedia;

