import React from 'react';
import styles from './Tooltip.module.css';

export interface TooltipStats {
  label: string;
  value: string | number;
  color?: string; // Optional color for specific stats
}

export interface CraftingCost {
  iconPath: string;
  name: string;
  required: number;
  available: number;
  hasEnough: boolean;
}

export interface AlternativeItem {
  iconPath: string;
  name: string;
  available: number;
}

export interface TooltipContent {
  name: string;
  description?: string;
  stats?: TooltipStats[];
  category?: string;
  rarity?: string; // Example: Common, Uncommon, Rare, Epic
  craftingCosts?: CraftingCost[]; // Resource costs for crafting recipes
  alternatives?: AlternativeItem[]; // Flexible ingredient alternatives
  alternativesRequired?: number; // Total quantity required for flexible ingredient
}

interface TooltipProps {
  content: TooltipContent | null;
  visible: boolean;
  position: { x: number; y: number };
}

// Helper function to format category names (e.g., "RangedWeapon" -> "Ranged Weapon")
const formatCategoryName = (category: string): string => {
  // Add space before capital letters (except the first one)
  return category.replace(/([A-Z])/g, ' $1').trim();
};

const Tooltip: React.FC<TooltipProps> = ({ content, visible, position }) => {
  if (!visible || !content) {
    return null;
  }

  // Check if this is a simple tooltip (only name, no other content)
  const isSimple = (!content.category || content.category.trim() === '') && 
                   (!content.description || content.description.trim() === '') && 
                   (!content.stats || content.stats.length === 0);

  // Grid for alternatives - max 3 columns. Width derived from longest name (icon 18 + gap 6 + ~7px/char + count 16 + padding)
  const altCount = content.alternatives?.length ?? 0;
  const columns = altCount > 0 ? Math.min(3, Math.ceil(altCount / 2)) : 3;
  const maxNameLen = altCount > 0
    ? Math.max(...content.alternatives!.map((a) => a.name.length), 10)
    : 0;
  const pxPerChar = 8; // Approximate for 0.7rem monospace (slightly generous for long names)
  const cellWidth = 18 + 6 + maxNameLen * pxPerChar + 16 + 10; // icon + gap + name + count + padding
  const tooltipWidth = altCount > 0
    ? Math.max(300, Math.min(cellWidth * columns + 24, 700))
    : undefined;

  // Offset the tooltip slightly from the cursor
  const tooltipStyle: React.CSSProperties = {
    left: `${position.x + 5}px`,
    top: `${position.y + 5}px`,
    ...(isSimple && { width: 'auto', minWidth: 'auto' }),
    ...(tooltipWidth !== undefined && { width: tooltipWidth, minWidth: tooltipWidth }),
  };

  return (
    <div className={styles.tooltipContainer} style={tooltipStyle}>
      <div className={`${styles.tooltipName} ${content.rarity ? styles[content.rarity.toLowerCase()] : ''} ${isSimple ? styles.simple : ''}`}>
        {content.name}
      </div>
      {content.category && <div className={styles.tooltipCategory}>{formatCategoryName(content.category)}</div>}
      {content.description && <div className={styles.tooltipDescription}>{content.description}</div>}
      {content.stats && content.stats.length > 0 && (
        <div className={styles.tooltipStatsSection}>
          {content.stats.map((stat, index) => (
            <div key={index} className={styles.tooltipStat}>
              <span className={styles.statLabel}>{stat.label}:</span>
              <span className={styles.statValue} style={{ color: stat.color }}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}
      {content.craftingCosts && content.craftingCosts.length > 0 && (
        <div className={styles.tooltipCraftingCosts}>
          <div className={styles.craftingCostsHeader}>Resources Required:</div>
          {content.craftingCosts.map((cost, index) => (
            <div key={index} className={styles.craftingCostRow}>
              <img 
                src={cost.iconPath} 
                alt={cost.name}
                className={styles.craftingCostIcon}
              />
              <span className={styles.craftingCostName}>{cost.name}</span>
              <span 
                className={styles.craftingCostValue}
                style={{ color: cost.hasEnough ? '#00ff88' : '#ff3366' }}
              >
                {cost.available}/{cost.required}
              </span>
            </div>
          ))}
        </div>
      )}
      {content.alternatives && content.alternatives.length > 0 && (
        <div className={styles.tooltipAlternatives}>
          <div className={styles.alternativesHeader}>
            Accepts any of these{content.alternativesRequired ? ` (need ${content.alternativesRequired})` : ''}:
          </div>
          <div
            className={styles.alternativesGrid}
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {content.alternatives.map((alt, index) => {
              const hasEnough = content.alternativesRequired ? alt.available >= content.alternativesRequired : alt.available > 0;
              return (
                <div key={index} className={styles.alternativeRow}>
                  <img
                    src={alt.iconPath}
                    alt={alt.name}
                    className={styles.alternativeIcon}
                  />
                  <span className={styles.alternativeName}>{alt.name}</span>
                  <span
                    className={styles.alternativeCount}
                    style={{ color: hasEnough ? '#00ff88' : alt.available > 0 ? '#f0ad4e' : '#ff3366' }}
                  >
                    {alt.available}
                  </span>
                </div>
              );
            })}
          </div>
          <div className={styles.alternativesTotal}>
            <span>Combined:</span>
            <span style={{
              color: content.alternativesRequired && content.alternatives.reduce((s, a) => s + a.available, 0) >= content.alternativesRequired
                ? '#00ff88' : '#ff3366',
              fontWeight: 'bold',
            }}>
              {content.alternatives.reduce((s, a) => s + a.available, 0)}
              {content.alternativesRequired ? ` / ${content.alternativesRequired}` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tooltip; 