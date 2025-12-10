import React, { useState, useMemo } from 'react';
import { MemoryGridNode, FACTIONS } from './MemoryGridData';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faWrench, faCrosshairs, faShield, faIndustry, faCar, 
  faBrain, faBolt, faCircleDot
} from '@fortawesome/free-solid-svg-icons';
import './MemoryGridNode.css';

// Import faction emblem images
import factionBlackWolves from '../assets/ui/faction_black_wolves.png';
import factionHive from '../assets/ui/faction_hive.png';
import factionUniversity from '../assets/ui/faction_university.png';
import factionDataAngels from '../assets/ui/faction_data_angels.png';
import factionBattalion from '../assets/ui/faction_battalion.png';
import factionAdmiralty from '../assets/ui/faction_admiralty.png';

interface MemoryGridNodeProps {
  node: MemoryGridNode;
  scale: number; // Zoom scale for the grid
  playerShards: number; // Current player shards for affordability check
  isSelected?: boolean;
  onNodeClick?: (node: MemoryGridNode, event?: React.MouseEvent) => void;
  onNodeHover?: (node: MemoryGridNode | null) => void;
}

const MemoryGridNodeComponent: React.FC<MemoryGridNodeProps> = ({
  node,
  scale,
  playerShards,
  isSelected = false,
  onNodeClick,
  onNodeHover,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Memoize expensive calculations
  const isUnlockNode = useMemo(() => node.id.startsWith('unlock-'), [node.id]);
  const baseSize = useMemo(() => node.id === 'center' ? 40 : isUnlockNode ? 50 : 30, [node.id, isUnlockNode]);
  const nodeSize = useMemo(() => baseSize * scale, [baseSize, scale]);
  const scaledX = useMemo(() => node.position.x * scale, [node.position.x, scale]);
  const scaledY = useMemo(() => node.position.y * scale, [node.position.y, scale]);
  
  // Memoize node colors calculation
  const colors = useMemo(() => {
    const faction = node.faction ? FACTIONS[node.faction] : null;
    
    // Special styling for unlock nodes - TEMPORARILY DISABLED (grayed out for "coming soon")
    if (isUnlockNode) {
      // TEMPORARILY DISABLED FOR v1.0 - Coming soon after early access ends
      // TODO: Uncomment this code when enabling faction unlocks
      /*
      const unlockColor = faction ? faction.color : '#f59e0b'; // Golden amber if no faction color
      switch (node.status) {
        case 'purchased':
          return {
            fill: unlockColor,
            stroke: '#ffffff',
            glowColor: unlockColor
          };
        case 'available':
          return {
            fill: `${unlockColor}CC`, // More opaque for unlock nodes
            stroke: '#ffffff', 
            glowColor: unlockColor
          };
        case 'locked':
        default:
          return {
            fill: `${unlockColor}60`, // Semi-transparent for locked unlock nodes
            stroke: unlockColor,
            glowColor: unlockColor
          };
      }
      */
      // Grayed out styling for "coming soon"
      return {
        fill: '#4b5563', // Dark gray for disabled/coming soon
        stroke: '#6b7280', // Lighter gray border
        glowColor: '#6b7280' // Subtle glow
      };
    }
    
    switch (node.status) {
      case 'purchased':
        return {
          fill: faction ? faction.color : '#22c55e', // Green for purchased, or faction color
          stroke: '#ffffff',
          glowColor: faction ? faction.color : '#22c55e'
        };
      case 'available':
        return {
          fill: faction ? `${faction.color}80` : '#3b82f6', // Blue for available, semi-transparent faction color
          stroke: '#ffffff',
          glowColor: faction ? faction.color : '#3b82f6'
        };
      case 'locked':
      default:
        return {
          fill: '#374151', // Gray for locked
          stroke: '#6b7280',
          glowColor: '#374151'
        };
    }
  }, [node.status, node.faction, isUnlockNode]);

  // Memoize faction emblem image path for unlock nodes
  const factionEmblem = useMemo(() => {
    if (!isUnlockNode || !node.faction) return null;
    
    switch (node.faction) {
      case 'black-wolves': return factionBlackWolves;
      case 'hive': return factionHive;
      case 'university': return factionUniversity;
      case 'data-angels': return factionDataAngels;
      case 'battalion': return factionBattalion;
      case 'admiralty': return factionAdmiralty;
      default: return null;
    }
  }, [isUnlockNode, node.faction]);

  // Memoize icon lookup for regular nodes
  const nodeIcon = useMemo(() => {
    // Standard category icons for regular nodes
    switch (node.category) {
      case 'tool': return faWrench;
      case 'weapon': return faCrosshairs;
      case 'armor': return faShield;
      case 'crafting': return faIndustry;
      case 'vehicle': return faCar;
      case 'technology': return faBrain;
      case 'passive': return faBolt;
      default: return faCircleDot;
    }
  }, [node.category]);

  const isInteractable = node.status === 'available' || node.status === 'purchased';
  const isPurchaseable = node.status === 'available' && playerShards >= node.cost;
  const canAfford = playerShards >= node.cost;
  
  const handleClick = (event: React.MouseEvent) => {
    // Allow clicking on any node to see info, but only purchaseable nodes can be bought
    if (onNodeClick) {
      onNodeClick(node, event);
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (onNodeHover) {
      onNodeHover(node);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    // Clear hover - parent will handle delay to prevent flicker
    if (onNodeHover) {
      onNodeHover(null);
    }
  };

  return (
    <>
      {/* Main node group */}
      <g
        transform={`translate(${scaledX}, ${scaledY})`}
        className={`memory-grid-node-group ${ 
          isUnlockNode ? 'unlock-node' : ''
        } ${ 
          node.status === 'locked' ? 'locked' :
          isPurchaseable ? '' : 'disabled'
        }`}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Special cyberpunk effects for unlock nodes */}
        {isUnlockNode && (
          <>
            {/* Outer rotating ring */}
            <circle
              r={nodeSize * 1.8}
              fill="none"
              stroke={colors.glowColor}
              strokeWidth={1}
              strokeOpacity={0.4}
              strokeDasharray="8,4"
              className="cyberpunk-outer-ring"
            />
            {/* Inner pulsing ring */}
            <circle
              r={nodeSize * 1.4}
              fill="none"
              stroke={colors.glowColor}
              strokeWidth={2}
              strokeOpacity={0.6}
              className="cyberpunk-inner-ring"
            />
          </>
        )}
        
        {/* Enhanced glow effect for unlock nodes */}
        {(isHovered || isSelected) && (
          <circle
            r={nodeSize * (isUnlockNode ? 2.2 : 1.5)}
            fill={colors.glowColor}
            opacity={node.status === 'locked' ? (isUnlockNode ? 0.3 : 0.2) : (isUnlockNode ? 0.5 : 0.3)}
            className={`node-glow ${isHovered ? 'hover-glow' : ''}`}
          />
        )}
        
        {/* Main node circle */}
        <circle
          r={nodeSize}
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth={isUnlockNode ? 3 : 2}
          className={`node-circle ${isHovered ? 'hovered' : ''} ${node.status === 'locked' ? 'locked' : ''}`}
        />
        
        {/* Enhanced node border for unlock nodes */}
        {isUnlockNode && (
          <circle
            r={nodeSize + 4}
            fill="none"
            stroke={colors.glowColor}
            strokeWidth={2}
            strokeDasharray="6,6"
            className={`faction-border unlock-border ${isHovered ? 'hovered' : ''}`}
          />
        )}
        
        {/* Regular faction border for non-unlock faction nodes */}
        {node.faction && !isUnlockNode && (
          <circle
            r={nodeSize + 2}
            fill="none"
            stroke={FACTIONS[node.faction].color}
            strokeWidth={1}
            strokeDasharray="4,4"
            className={`faction-border ${isHovered ? 'hovered' : ''}`}
          />
        )}
        
        {/* Category icon (but NOT for unlock nodes - we'll render those separately) */}
        {!isUnlockNode && (
          <foreignObject
            x={-nodeSize * 0.3}
            y={-nodeSize * 0.3}
            width={nodeSize * 0.6}
            height={nodeSize * 0.6}
            className={`node-icon ${node.status === 'locked' ? 'locked' : ''}`}
          >
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              width: '100%', 
              height: '100%',
              color: node.status === 'locked' ? '#9ca3af' : '#ffffff'
            }}>
              <FontAwesomeIcon 
                icon={nodeIcon} 
                style={{ fontSize: nodeSize * 0.5 }}
              />
            </div>
          </foreignObject>
        )}
        
        {/* Selection indicator */}
        {isSelected && (
          <circle
            r={nodeSize + (isUnlockNode ? 10 : 6)}
            className="selection-indicator"
          />
        )}
        
        {/* Locked indicator for selected locked nodes */}
        {isSelected && node.status === 'locked' && (
          <circle
            r={nodeSize + (isUnlockNode ? 12 : 8)}
            className="locked-indicator"
          />
        )}
      </g>
      
      {/* Separate icon rendering for unlock nodes - use faction emblem images */}
      {isUnlockNode && factionEmblem && (
        <g transform={`translate(${scaledX}, ${scaledY})`}>
          <image
            x={-nodeSize * 0.4}
            y={-nodeSize * 0.4}
            width={nodeSize * 0.8}
            height={nodeSize * 0.8}
            href={factionEmblem}
            className="unlock-node-icon"
            style={{
              filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))',
              pointerEvents: 'none'
            }}
          />
        </g>
      )}
    </>
  );
};

// Memoize component to prevent unnecessary re-renders
// Return true if props are equal (skip re-render), false if different (re-render)
export default React.memo(MemoryGridNodeComponent, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.node.id === nextProps.node.id &&
    prevProps.node.status === nextProps.node.status &&
    prevProps.scale === nextProps.scale &&
    prevProps.playerShards === nextProps.playerShards &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onNodeClick === nextProps.onNodeClick &&
    prevProps.onNodeHover === nextProps.onNodeHover
  );
}); 