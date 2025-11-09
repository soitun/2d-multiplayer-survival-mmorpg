/**
 * Building Radial Menu Component
 * 
 * Shows a radial menu when right-clicking with Blueprint equipped.
 * Allows selection of building pieces (foundations, walls, doors, etc.)
 * Shows resource requirements and greys out unavailable options.
 * 
 * Styled similar to Rust's building menu - pie slice sectors with full sector highlighting.
 */

import React, { useState, useEffect, useRef } from 'react';
import { BuildingMode, BuildingTier, FoundationShape } from '../hooks/useBuildingManager';
import { DbConnection, InventoryItem, ItemDefinition } from '../generated';

interface BuildingRadialMenuProps {
  isVisible: boolean;
  mouseX: number;
  mouseY: number;
  connection: DbConnection | null;
  inventoryItems: Map<string, InventoryItem>;
  itemDefinitions: Map<string, ItemDefinition>;
  onSelect: (mode: BuildingMode, tier: BuildingTier, initialShape?: FoundationShape) => void; // ADDED: initialShape parameter
  onCancel: () => void;
}

interface BuildingOption {
  mode: BuildingMode;
  name: string;
  icon: string; // For now, just a colored square
  requirements: {
    wood?: number;
    stone?: number;
    metal?: number;
  };
  available: boolean;
  reason?: string; // Why it's unavailable
  isTriangle?: boolean; // ADDED: Flag to indicate triangle foundation
}

const RADIUS = 144; // Outer radius of the radial menu (20% larger: 120 * 1.2)
const INNER_RADIUS = 25; // Inner radius (center cancel area) (20% larger: 50 * 1.2)
const MENU_SIZE = RADIUS * 2;

export const BuildingRadialMenu: React.FC<BuildingRadialMenuProps> = ({
  isVisible,
  mouseX,
  mouseY,
  connection,
  inventoryItems,
  itemDefinitions,
  onSelect,
  onCancel,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const isSelectingRef = useRef(false); // Prevent multiple selections

  // Calculate total wood in inventory
  const getWoodCount = (): number => {
    if (!connection || !itemDefinitions) return 0;
    
    // Find Wood item definition
    let woodDefId: bigint | null = null;
    for (const def of itemDefinitions.values()) {
      if (def.name === 'Wood') {
        woodDefId = def.id;
        break;
      }
    }
    
    if (!woodDefId) return 0;
    
    // Sum up all wood items (inventory + hotbar)
    let total = 0;
    for (const item of inventoryItems.values()) {
      if (item.itemDefId === woodDefId) {
        total += item.quantity;
      }
    }
    
    return total;
  };

  const woodCount = getWoodCount();

  // Define building options
  const buildingOptions: BuildingOption[] = [
    {
      mode: BuildingMode.Foundation,
      name: 'Foundation',
      icon: '🟫', // Brown square emoji for now
      requirements: { wood: 50 },
      available: woodCount >= 50,
      reason: woodCount < 50 ? `Need 50 wood (have ${woodCount})` : undefined,
    },
    {
      mode: BuildingMode.Foundation,
      name: 'Triangle Foundation',
      icon: '🔺', // Triangle emoji
      requirements: { wood: 25 },
      available: woodCount >= 25,
      reason: woodCount < 25 ? `Need 25 wood (have ${woodCount})` : undefined,
      isTriangle: true, // ADDED: Flag to indicate this is a triangle foundation
    },
    {
      mode: BuildingMode.Wall,
      name: 'Wall',
      icon: '⬛', // Black square
      requirements: { wood: 0 }, // Not implemented yet
      available: false,
      reason: 'Not implemented',
    },
    {
      mode: BuildingMode.DoorFrame,
      name: 'Door Frame',
      icon: '🚪', // Door emoji
      requirements: { wood: 0 },
      available: false,
      reason: 'Not implemented',
    },
    {
      mode: BuildingMode.Door,
      name: 'Door',
      icon: '🚪',
      requirements: { wood: 0 },
      available: false,
      reason: 'Not implemented',
    },
  ];

  // Calculate angle for each sector
  const getSectorAngles = (index: number, total: number) => {
    const sectorAngle = (2 * Math.PI) / total;
    const startAngle = (index * sectorAngle) - Math.PI / 2; // Start from top
    const endAngle = startAngle + sectorAngle;
    return { startAngle, endAngle, sectorAngle };
  };

  // Create SVG path for a pie slice sector
  const createSectorPath = (startAngle: number, endAngle: number, outerRadius: number, innerRadius: number): string => {
    const centerX = MENU_SIZE / 2;
    const centerY = MENU_SIZE / 2;

    // Outer arc
    const x1 = centerX + Math.cos(startAngle) * outerRadius;
    const y1 = centerY + Math.sin(startAngle) * outerRadius;
    const x2 = centerX + Math.cos(endAngle) * outerRadius;
    const y2 = centerY + Math.sin(endAngle) * outerRadius;

    // Inner arc
    const x3 = centerX + Math.cos(endAngle) * innerRadius;
    const y3 = centerY + Math.sin(endAngle) * innerRadius;
    const x4 = centerX + Math.cos(startAngle) * innerRadius;
    const y4 = centerY + Math.sin(startAngle) * innerRadius;

    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

    return [
      `M ${centerX} ${centerY}`, // Move to center
      `L ${x4} ${y4}`, // Line to inner start
      `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${x3} ${y3}`, // Inner arc
      `L ${x2} ${y2}`, // Line to outer end
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${x1} ${y1}`, // Outer arc
      `Z`, // Close path
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

    // Check if clicked on center (cancel)
    if (distance < INNER_RADIUS) {
      return -1; // Center/cancel
    }

    // Check if clicked within the radial menu area
    if (distance >= INNER_RADIUS && distance <= RADIUS) {
      // Calculate angle
      const angle = Math.atan2(clickY, clickX);
      // Normalize angle to 0-2π and adjust for top start
      let normalizedAngle = angle + Math.PI / 2;
      if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
      
      // Find which sector this angle corresponds to
      const sectorAngle = (2 * Math.PI) / buildingOptions.length;
      const index = Math.floor(normalizedAngle / sectorAngle);
      
      return index % buildingOptions.length;
    }

    return null; // Outside menu
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
        // Clicked on center (cancel) - clear building selection
        onCancel();
        isSelectingRef.current = false;
      } else if (sectorIndex !== null) {
        // Clicked on a sector
        const option = buildingOptions[sectorIndex];
        setSelectedIndex(sectorIndex);
        
        if (option.available) {
          // Small delay for visual feedback
          setTimeout(() => {
            if (option.isTriangle) {
              // Triangle foundation - pass TriNW as initial shape
              onSelect(option.mode, BuildingTier.Wood, FoundationShape.TriNW);
            } else {
              // Regular foundation or other building types
              onSelect(option.mode, BuildingTier.Wood);
            }
            isSelectingRef.current = false;
          }, 50);
        } else {
          // Option not available - clear building selection
          setTimeout(() => {
            onCancel(); // This will clear building mode
            isSelectingRef.current = false;
          }, 50);
        }
      } else {
        // Clicked outside menu - clear building selection
        onCancel();
        isSelectingRef.current = false;
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      isSelectingRef.current = false;
    };
  }, [isVisible, buildingOptions, onSelect, onCancel]);

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
      onContextMenu={(e) => e.preventDefault()} // Prevent context menu
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
        {/* Outer glow effect */}
        <defs>
          <radialGradient id="outerGlow">
            <stop offset="0%" stopColor="rgba(100, 150, 200, 0.4)" />
            <stop offset="70%" stopColor="rgba(100, 150, 200, 0.1)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background circle */}
        <circle
          cx={MENU_SIZE / 2}
          cy={MENU_SIZE / 2}
          r={RADIUS}
          fill="url(#outerGlow)"
          opacity="0.3"
        />

        {/* Render each sector */}
        {buildingOptions.map((option, index) => {
          const { startAngle, endAngle } = getSectorAngles(index, buildingOptions.length);
          const isHovered = hoveredIndex === index;
          const isSelected = selectedIndex === index;
          const isAvailable = option.available;
          
          const sectorPath = createSectorPath(startAngle, endAngle, RADIUS, INNER_RADIUS);

          return (
            <g key={index}>
              {/* Sector background */}
              <path
                d={sectorPath}
                fill={
                  isAvailable
                    ? isHovered || isSelected
                      ? 'rgba(80, 150, 100, 0.85)'
                      : 'rgba(30, 35, 40, 0.9)'
                    : 'rgba(20, 20, 25, 0.7)'
                }
                stroke={
                  isAvailable
                    ? isHovered || isSelected
                      ? 'rgba(150, 255, 180, 0.8)'
                      : 'rgba(80, 90, 100, 0.5)'
                    : 'rgba(50, 50, 50, 0.4)'
                }
                strokeWidth={isHovered || isSelected ? 3 : 2}
                style={{
                  transition: 'all 0.15s ease',
                  filter: isHovered || isSelected ? 'url(#glow)' : 'none',
                  cursor: isAvailable ? 'pointer' : 'not-allowed',
                  pointerEvents: 'auto',
                }}
                opacity={isAvailable ? 1 : 0.4}
              />
            </g>
          );
        })}

        {/* Center cancel circle */}
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
            filter: hoveredIndex === -1 ? 'url(#glow)' : 'none',
          }}
        />
      </svg>

      {/* Text and icons overlay */}
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
        {/* Center cancel X */}
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

        {/* Sector labels and icons */}
        {buildingOptions.map((option, index) => {
          const pos = getSectorCenterPosition(index, buildingOptions.length);
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
              {/* Icon */}
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

              {/* Name */}
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

              {/* Requirements tooltip on hover */}
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
                  {option.requirements.wood && (
                    <div style={{ marginBottom: '4px' }}>
                      <span style={{ color: '#8B4513', fontWeight: 'bold' }}>Wood:</span>{' '}
                      <span style={{ color: woodCount >= (option.requirements.wood || 0) ? '#90EE90' : '#FF6B6B' }}>
                        {option.requirements.wood} ({woodCount} available)
                      </span>
                    </div>
                  )}
                  {option.requirements.stone && (
                    <div style={{ marginBottom: '4px' }}>
                      <span style={{ color: '#808080', fontWeight: 'bold' }}>Stone:</span>{' '}
                      {option.requirements.stone}
                    </div>
                  )}
                  {option.requirements.metal && (
                    <div style={{ marginBottom: '4px' }}>
                      <span style={{ color: '#C0C0C0', fontWeight: 'bold' }}>Metal:</span>{' '}
                      {option.requirements.metal}
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

