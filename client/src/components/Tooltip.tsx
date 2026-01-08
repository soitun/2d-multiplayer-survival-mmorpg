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

export interface TooltipContent {
  name: string;
  description?: string;
  stats?: TooltipStats[];
  category?: string;
  rarity?: string; // Example: Common, Uncommon, Rare, Epic
  craftingCosts?: CraftingCost[]; // Resource costs for crafting recipes
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

  // Offset the tooltip slightly from the cursor
  const tooltipStyle = {
    left: `${position.x + 5}px`,
    top: `${position.y + 5}px`,
    ...(isSimple && { width: 'auto', minWidth: 'auto' }), // Use auto width for simple tooltips
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
    </div>
  );
};

export default Tooltip; 