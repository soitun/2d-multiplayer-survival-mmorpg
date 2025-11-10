/**
 * Upgrade Radial Menu Component
 * 
 * Shows a radial menu when right-clicking with Repair Hammer equipped on a foundation.
 * Allows selection of upgrade tiers (Wood, Stone, Metal) based on available resources.
 * Shows resource requirements and greys out unavailable options.
 * 
 * Styled similar to BuildingRadialMenu - pie slice sectors with full sector highlighting.
 */

import React, { useState, useEffect, useRef } from 'react';
import { BuildingTier } from '../hooks/useBuildingManager';
import { DbConnection, InventoryItem, ItemDefinition, FoundationCell } from '../generated';

interface UpgradeRadialMenuProps {
  isVisible: boolean;
  mouseX: number;
  mouseY: number;
  connection: DbConnection | null;
  inventoryItems: Map<string, InventoryItem>;
  itemDefinitions: Map<string, ItemDefinition>;
  foundation: FoundationCell | null; // The foundation being upgraded
  onSelect: (tier: BuildingTier) => void;
  onCancel: () => void;
  onDestroy?: () => void; // ADDED: Destroy callback
}

interface UpgradeOption {
  tier: BuildingTier;
  name: string;
  icon: string;
  requirements: {
    wood?: number;
    stone?: number;
    metal?: number;
  };
  available: boolean;
  reason?: string;
}

const RADIUS = 144;
const INNER_RADIUS = 25;
const MENU_SIZE = RADIUS * 2;

export const UpgradeRadialMenu: React.FC<UpgradeRadialMenuProps> = ({
  isVisible,
  mouseX,
  mouseY,
  connection,
  inventoryItems,
  itemDefinitions,
  foundation,
  onSelect,
  onCancel,
  onDestroy, // ADDED: Destroy callback
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const isSelectingRef = useRef(false);

  // Get resource counts
  const getResourceCount = (resourceName: string): number => {
    if (!connection || !itemDefinitions) return 0;
    
    let resourceDefId: bigint | null = null;
    for (const def of itemDefinitions.values()) {
      if (def.name === resourceName) {
        resourceDefId = def.id;
        break;
      }
    }
    
    if (!resourceDefId) return 0;
    
    let total = 0;
    for (const item of inventoryItems.values()) {
      if (item.itemDefId === resourceDefId) {
        total += item.quantity;
      }
    }
    
    return total;
  };

  const woodCount = getResourceCount('Wood');
  const stoneCount = getResourceCount('Stone');
  const metalCount = getResourceCount('Metal Fragments');

  // Determine current tier
  const currentTier = foundation ? (foundation.tier as BuildingTier) : BuildingTier.Twig;
  
  // Determine shape multiplier (full = 1.0, triangle = 0.5)
  const isTriangle = foundation && foundation.shape >= 2 && foundation.shape <= 5;
  const shapeMultiplier = isTriangle ? 0.5 : 1.0;

  // Define upgrade options (always show all 3 tiers, grey out unavailable ones)
  const upgradeOptions: UpgradeOption[] = [];

  // Wood upgrade (Twig -> Wood)
  const requiredWood = Math.ceil(50 * shapeMultiplier);
  const canUpgradeToWood = currentTier < BuildingTier.Wood && woodCount >= requiredWood;
  upgradeOptions.push({
    tier: BuildingTier.Wood,
    name: 'Upgrade to Wood',
    icon: '🪵',
    requirements: { wood: requiredWood },
    available: canUpgradeToWood,
    reason: currentTier >= BuildingTier.Wood 
      ? 'Already at or above this tier' 
      : woodCount < requiredWood 
        ? `Need ${requiredWood} wood (have ${woodCount})` 
        : undefined,
  });

  // Stone upgrade (-> Stone)
  const requiredStone = Math.ceil(100 * shapeMultiplier);
  const canUpgradeToStone = currentTier < BuildingTier.Stone && stoneCount >= requiredStone;
  upgradeOptions.push({
    tier: BuildingTier.Stone,
    name: 'Upgrade to Stone',
    icon: '🪨',
    requirements: { stone: requiredStone },
    available: canUpgradeToStone,
    reason: currentTier >= BuildingTier.Stone 
      ? 'Already at or above this tier' 
      : stoneCount < requiredStone 
        ? `Need ${requiredStone} stone (have ${stoneCount})` 
        : undefined,
  });

  // Metal upgrade (-> Metal)
  const requiredMetal = Math.ceil(50 * shapeMultiplier);
  const canUpgradeToMetal = currentTier < BuildingTier.Metal && metalCount >= requiredMetal;
  upgradeOptions.push({
    tier: BuildingTier.Metal,
    name: 'Upgrade to Metal',
    icon: '⚙️',
    requirements: { metal: requiredMetal },
    available: canUpgradeToMetal,
    reason: currentTier >= BuildingTier.Metal 
      ? 'Already at or above this tier' 
      : metalCount < requiredMetal 
        ? `Need ${requiredMetal} metal fragments (have ${metalCount})` 
        : undefined,
  });

  // Destroy option (only for Twig foundations)
  if (currentTier === BuildingTier.Twig) {
    upgradeOptions.push({
      tier: BuildingTier.Twig, // Use Twig as placeholder, but name indicates destroy
      name: 'Destroy Foundation',
      icon: '🗑️',
      requirements: {},
      available: true, // Always available for twig foundations
      reason: undefined,
    });
  }

  // Calculate total number of options for sector calculations
  const totalOptions = upgradeOptions.length;

  // Calculate angle for each sector
  const getSectorAngles = (index: number, total: number) => {
    const sectorAngle = (2 * Math.PI) / total;
    const startAngle = (index * sectorAngle) - Math.PI / 2;
    const endAngle = startAngle + sectorAngle;
    return { startAngle, endAngle, sectorAngle };
  };

  // Create SVG path for a pie slice sector
  const createSectorPath = (startAngle: number, endAngle: number, outerRadius: number, innerRadius: number): string => {
    const centerX = MENU_SIZE / 2;
    const centerY = MENU_SIZE / 2;

    const x1 = centerX + Math.cos(startAngle) * outerRadius;
    const y1 = centerY + Math.sin(startAngle) * outerRadius;
    const x2 = centerX + Math.cos(endAngle) * outerRadius;
    const y2 = centerY + Math.sin(endAngle) * outerRadius;

    const x3 = centerX + Math.cos(endAngle) * innerRadius;
    const y3 = centerY + Math.sin(endAngle) * innerRadius;
    const x4 = centerX + Math.cos(startAngle) * innerRadius;
    const y4 = centerY + Math.sin(startAngle) * innerRadius;

    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

    return [
      `M ${centerX} ${centerY}`,
      `L ${x4} ${y4}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${x3} ${y3}`,
      `L ${x2} ${y2}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${x1} ${y1}`,
      `Z`,
    ].join(' ');
  };

  // Get the sector index from mouse position
  const getSectorFromMousePosition = (clientX: number, clientY: number): number | null => {
    if (!menuRef.current) return null;

    const rect = menuRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const clickX = clientX - centerX;
    const clickY = clientY - centerY;
    const distance = Math.sqrt(clickX * clickX + clickY * clickY);

    if (distance < INNER_RADIUS) {
      return -1; // Center/cancel
    }

    if (distance >= INNER_RADIUS && distance <= RADIUS) {
      const angle = Math.atan2(clickY, clickX);
      let normalizedAngle = angle + Math.PI / 2;
      if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
      
      // Use dynamic number of sectors based on options (3 or 4)
      const sectorAngle = (2 * Math.PI) / upgradeOptions.length;
      const index = Math.floor(normalizedAngle / sectorAngle);
      
      return index % upgradeOptions.length;
    }

    return null;
  };

  // Get position for text/icon in the middle of a sector
  const getSectorCenterPosition = (index: number, total: number) => {
    const { startAngle, endAngle } = getSectorAngles(index, total);
    const midAngle = (startAngle + endAngle) / 2;
    const midRadius = (INNER_RADIUS + RADIUS) / 2;
    const centerX = MENU_SIZE / 2;
    const centerY = MENU_SIZE / 2;
    
    return {
      x: centerX + Math.cos(midAngle) * midRadius,
      y: centerY + Math.sin(midAngle) * midRadius,
      angle: midAngle,
    };
  };

  // Handle mouse release to select
  useEffect(() => {
    if (!isVisible) return;

    const handleMouseUp = (e: MouseEvent) => {
      if (!menuRef.current || isSelectingRef.current) return;
      
      // Only handle right mouse button release
      if (e.button !== 2) return;

      isSelectingRef.current = true;

      const sectorIndex = getSectorFromMousePosition(e.clientX, e.clientY);

      if (sectorIndex === -1) {
        // Clicked on center (cancel)
        onCancel();
        isSelectingRef.current = false;
      } else if (sectorIndex !== null && sectorIndex < upgradeOptions.length) { // Use dynamic total
        const option = upgradeOptions[sectorIndex];
        setSelectedIndex(sectorIndex);
        
        if (option.available) {
          setTimeout(() => {
            // Check if this is the destroy option (Twig tier with destroy name)
            if (option.name === 'Destroy Foundation' && onDestroy) {
              onDestroy();
            } else {
              onSelect(option.tier);
            }
            isSelectingRef.current = false;
          }, 50);
        } else {
          setTimeout(() => {
            onCancel();
            isSelectingRef.current = false;
          }, 50);
        }
      } else {
        // Clicked outside menu - close it
        onCancel();
        isSelectingRef.current = false;
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      isSelectingRef.current = false;
    };
  }, [isVisible, upgradeOptions, onSelect, onCancel, onDestroy]); // ADDED: onDestroy to deps

  // Update hovered index based on mouse position
  useEffect(() => {
    if (!isVisible) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!menuRef.current) return;
      
      const sectorIndex = getSectorFromMousePosition(e.clientX, e.clientY);
      setHoveredIndex(sectorIndex);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: mouseX - MENU_SIZE / 2,
        top: mouseY - MENU_SIZE / 2,
        width: MENU_SIZE,
        height: MENU_SIZE,
        pointerEvents: 'auto',
        zIndex: 10000,
        userSelect: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        ref={svgRef}
        width={MENU_SIZE}
        height={MENU_SIZE}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
        }}
      >
        <defs>
          <radialGradient id="upgradeOuterGlow">
            <stop offset="0%" stopColor="rgba(150, 100, 200, 0.4)" />
            <stop offset="70%" stopColor="rgba(150, 100, 200, 0.1)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="upgradeGlow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx={MENU_SIZE / 2}
          cy={MENU_SIZE / 2}
          r={RADIUS}
          fill="url(#upgradeOuterGlow)"
          opacity="0.3"
        />

        {upgradeOptions.map((option, index) => {
          const { startAngle, endAngle } = getSectorAngles(index, upgradeOptions.length); // Use dynamic total
          const isHovered = hoveredIndex === index;
          const isSelected = selectedIndex === index;
          const isAvailable = option.available;
          
          const sectorPath = createSectorPath(startAngle, endAngle, RADIUS, INNER_RADIUS);

          return (
            <g key={index}>
              <path
                d={sectorPath}
                fill={
                  isAvailable
                    ? isHovered || isSelected
                      ? 'rgba(100, 150, 200, 0.85)'
                      : 'rgba(30, 35, 40, 0.9)'
                    : 'rgba(20, 20, 25, 0.7)'
                }
                stroke={
                  isAvailable
                    ? isHovered || isSelected
                      ? 'rgba(150, 200, 255, 0.8)'
                      : 'rgba(80, 90, 100, 0.5)'
                    : 'rgba(50, 50, 50, 0.4)'
                }
                strokeWidth={isHovered || isSelected ? 3 : 2}
                style={{
                  transition: 'all 0.15s ease',
                  filter: isHovered || isSelected ? 'url(#upgradeGlow)' : 'none',
                  cursor: isAvailable ? 'pointer' : 'not-allowed',
                  pointerEvents: 'auto',
                }}
                opacity={isAvailable ? 1 : 0.4}
              />
            </g>
          );
        })}

        <circle
          cx={MENU_SIZE / 2}
          cy={MENU_SIZE / 2}
          r={INNER_RADIUS}
          fill={
            hoveredIndex === -1
              ? 'rgba(200, 80, 80, 0.9)'
              : 'rgba(60, 65, 70, 0.9)'
          }
          stroke={
            hoveredIndex === -1
              ? 'rgba(255, 150, 150, 0.8)'
              : 'rgba(120, 130, 140, 0.6)'
          }
          strokeWidth={hoveredIndex === -1 ? 3 : 2}
          style={{
            transition: 'all 0.15s ease',
            cursor: 'pointer',
            pointerEvents: 'auto',
            filter: hoveredIndex === -1 ? 'url(#upgradeGlow)' : 'none',
          }}
        />
      </svg>

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: MENU_SIZE,
          height: MENU_SIZE,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '28px',
            color: hoveredIndex === -1 ? '#fff' : '#aaa',
            fontWeight: 'bold',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
            transition: 'all 0.15s ease',
          }}
        >
          ✕
        </div>

        {upgradeOptions.map((option, index) => {
          const pos = getSectorCenterPosition(index, upgradeOptions.length); // Use dynamic total
          const isHovered = hoveredIndex === index;
          const isAvailable = option.available;

          return (
            <div
              key={index}
              style={{
                position: 'absolute',
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                transform: `translate(-50%, -50%) ${isHovered ? 'scale(1.1)' : 'scale(1)'}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  fontSize: '36px',
                  marginBottom: '4px',
                  filter: isAvailable ? 'none' : 'grayscale(100%) brightness(0.4)',
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
                }}
              >
                {option.icon}
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: isAvailable ? (isHovered ? '#fff' : '#ccc') : '#666',
                  textAlign: 'center',
                  fontWeight: 'bold',
                  textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)',
                  whiteSpace: 'nowrap',
                }}
              >
                {option.name}
              </div>

              {isHovered && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    marginBottom: '12px',
                    padding: '10px 14px',
                    background: 'linear-gradient(135deg, rgba(10, 10, 15, 0.98) 0%, rgba(20, 20, 25, 0.95) 100%)',
                    color: '#fff',
                    borderRadius: '8px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 10001,
                    border: '2px solid rgba(150, 150, 150, 0.5)',
                    boxShadow: '0 0 20px rgba(0, 0, 0, 0.9)',
                    minWidth: '150px',
                  }}
                >
                  {option.requirements.wood !== undefined && (
                    <div style={{ marginBottom: '4px' }}>
                      <span style={{ color: '#8B4513', fontWeight: 'bold' }}>Wood:</span>{' '}
                      <span style={{ color: woodCount >= option.requirements.wood ? '#90EE90' : '#FF6B6B' }}>
                        {option.requirements.wood} ({woodCount} available)
                      </span>
                    </div>
                  )}
                  {option.requirements.stone !== undefined && (
                    <div style={{ marginBottom: '4px' }}>
                      <span style={{ color: '#808080', fontWeight: 'bold' }}>Stone:</span>{' '}
                      <span style={{ color: stoneCount >= option.requirements.stone ? '#90EE90' : '#FF6B6B' }}>
                        {option.requirements.stone} ({stoneCount} available)
                      </span>
                    </div>
                  )}
                  {option.requirements.metal !== undefined && (
                    <div style={{ marginBottom: '4px' }}>
                      <span style={{ color: '#C0C0C0', fontWeight: 'bold' }}>Metal:</span>{' '}
                      <span style={{ color: metalCount >= option.requirements.metal ? '#90EE90' : '#FF6B6B' }}>
                        {option.requirements.metal} ({metalCount} available)
                      </span>
                    </div>
                  )}
                  {option.reason && (
                    <div style={{ color: '#ff6666', marginTop: '6px', fontWeight: 'bold', borderTop: '1px solid rgba(255, 255, 255, 0.2)', paddingTop: '6px' }}>
                      {option.reason}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

