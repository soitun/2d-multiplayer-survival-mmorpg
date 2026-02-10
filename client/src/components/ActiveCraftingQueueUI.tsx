import React, { useEffect, useState, useCallback } from 'react';
import { CraftingQueueItem, ItemDefinition, DbConnection } from '../generated';
import { Identity } from 'spacetimedb';
import { getItemIcon } from '../utils/itemIconUtils';

interface ActiveCraftingQueueUIProps {
  craftingQueueItems: Map<string, CraftingQueueItem>;
  itemDefinitions: Map<string, ItemDefinition>;
  playerIdentity: Identity | null;
  connection: DbConnection | null;
}

const ActiveCraftingQueueUI: React.FC<ActiveCraftingQueueUIProps> = ({
  craftingQueueItems,
  itemDefinitions,
  playerIdentity,
  connection,
}) => {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isHovering, setIsHovering] = useState(false);

  // Cancel crafting handler
  const handleCancelCraft = useCallback((queueItemId: bigint) => {
    if (!connection?.reducers) return;
    try {
      connection.reducers.cancelCraftingItem(queueItemId);
    } catch (err) {
      console.error("Error calling cancelCraftingItem reducer:", err);
    }
  }, [connection]);

  // Timer to update remaining time every second
  useEffect(() => {
    const timerId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  // Get the next item to complete in the player's queue
  const getActiveItem = (): CraftingQueueItem | null => {
    if (!playerIdentity) return null;

    const playerItems = Array.from(craftingQueueItems.values())
      .filter(item => item.playerIdentity && item.playerIdentity.isEqual(playerIdentity))
      .sort((a, b) => Number(a.finishTime.microsSinceUnixEpoch - b.finishTime.microsSinceUnixEpoch));

    return playerItems.length > 0 ? playerItems[0] : null;
  };

  // Calculate remaining time in seconds
  const calculateRemainingTime = (finishTime: bigint): number => {
    const finishTimeMs = Number(finishTime / 1000n);
    return Math.max(0, Math.ceil((finishTimeMs - currentTime) / 1000));
  };

  const activeItem = getActiveItem();

  if (!activeItem) {
    return null; // Don't render anything if no active crafting
  }

  const outputDef = itemDefinitions.get(activeItem.outputItemDefId.toString());
  const remainingTime = calculateRemainingTime(activeItem.finishTime.microsSinceUnixEpoch);
  
  // Hide the notification only after it's been finished for 2+ seconds
  // This gives the server time to process (checks every 1 second) and prevents premature hiding
  if (remainingTime < -2) {
    return null;
  }
  
  const itemName = outputDef?.name || 'Unknown Item';
  const itemIcon = outputDef?.iconAssetName || 'error.png';

  // Format time display
  const formatTime = (seconds: number): string => {
    if (seconds <= 0) return 'Ready!';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = Math.max(0, Math.min(100, ((currentTime - Number(activeItem.startTime.microsSinceUnixEpoch / 1000n)) / 
    (Number(activeItem.finishTime.microsSinceUnixEpoch / 1000n) - Number(activeItem.startTime.microsSinceUnixEpoch / 1000n))) * 100));
  const isNearComplete = remainingTime <= 5;

  return (
    <div 
      style={{
        position: 'fixed',
        bottom: '15px',
        right: '285px',
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 10, 20, 0.95)',
        color: '#00ffff',
        padding: '10px 14px',
        borderRadius: '2px',
        border: isNearComplete ? '1px solid #00ff88' : '1px solid #00ffff',
        boxShadow: isNearComplete 
          ? '0 0 20px rgba(0, 255, 136, 0.7), inset 0 0 20px rgba(0, 255, 136, 0.1)' 
          : '0 0 15px rgba(0, 255, 255, 0.6), inset 0 0 20px rgba(0, 255, 255, 0.05)',
        fontFamily: "'Courier New', 'Consolas', 'Monaco', monospace",
        fontSize: '11px',
        fontWeight: 'bold',
        minWidth: '220px',
        zIndex: 75,
        backdropFilter: 'blur(4px)',
        overflow: 'hidden',
        transition: 'all 0.3s ease-out',
        cursor: 'default',
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Cancel button - appears on hover, centered over item icon */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleCancelCraft(activeItem.queueItemId);
        }}
        title="Cancel crafting"
        style={{
          position: 'absolute',
          // Position centered over the item icon (14px padding + 14px half icon width = 28px center)
          left: '14px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '28px',
          height: '28px',
          padding: 0,
          background: isHovering ? 'rgba(255, 51, 102, 0.85)' : 'transparent',
          border: isHovering ? '2px solid rgba(255, 51, 102, 0.9)' : '2px solid transparent',
          borderRadius: '4px',
          color: isHovering ? '#ffffff' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
          fontWeight: 'bold',
          zIndex: 10,
          transition: 'all 0.2s ease-out',
          textShadow: isHovering ? '0 0 6px rgba(255, 51, 102, 0.8)' : 'none',
          boxShadow: isHovering ? '0 0 15px rgba(255, 51, 102, 0.6)' : 'none',
          opacity: isHovering ? 1 : 0,
          pointerEvents: isHovering ? 'auto' : 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 51, 102, 0.95)';
          e.currentTarget.style.border = '2px solid rgba(255, 100, 130, 1)';
          e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 51, 102, 0.8)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isHovering ? 'rgba(255, 51, 102, 0.85)' : 'transparent';
          e.currentTarget.style.border = isHovering ? '2px solid rgba(255, 51, 102, 0.9)' : '2px solid transparent';
          e.currentTarget.style.boxShadow = isHovering ? '0 0 15px rgba(255, 51, 102, 0.6)' : 'none';
        }}
      >
        ✕
      </button>
      {/* Scanline effect overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 255, 0.03) 2px, rgba(0, 255, 255, 0.03) 4px)',
        pointerEvents: 'none',
        zIndex: 1,
      }} />

      {/* Animated progress background */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `linear-gradient(90deg, 
          transparent ${Math.max(0, progressPercent - 10)}%, 
          rgba(0, 255, 255, 0.1) ${progressPercent}%, 
          transparent ${Math.min(100, progressPercent + 10)}%)`,
        pointerEvents: 'none',
        zIndex: 0,
        transition: 'all 0.5s ease-out',
      }} />

      {/* Crafting Icon with enhanced glow */}
      <div style={{
        width: '28px',
        height: '28px',
        marginRight: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 255, 255, 0.15)',
        borderRadius: '2px',
        border: isNearComplete ? '1px solid #00ff88' : '1px solid rgba(0, 255, 255, 0.5)',
        boxShadow: isNearComplete 
          ? '0 0 12px rgba(0, 255, 136, 0.6), inset 0 0 8px rgba(0, 255, 136, 0.2)' 
          : '0 0 10px rgba(0, 255, 255, 0.4), inset 0 0 8px rgba(0, 255, 255, 0.1)',
        position: 'relative',
        zIndex: 2,
        transition: 'all 0.3s ease-out',
      }}>
        <img 
          src={getItemIcon(itemIcon, 'crafting')} 
          alt={itemName}
          style={{ 
            width: '22px', 
            height: '22px', 
            imageRendering: 'pixelated',
            filter: isNearComplete 
              ? 'drop-shadow(0 0 4px rgba(0, 255, 136, 0.8))' 
              : 'drop-shadow(0 0 3px rgba(0, 255, 255, 0.6))',
          }}
        />
      </div>

      {/* Progress Info */}
      <div style={{ flex: 1, position: 'relative', zIndex: 2 }}>
        <div style={{ 
          color: '#00ffff',
          fontSize: '11px',
          marginBottom: '4px',
          textShadow: '0 0 6px rgba(0, 255, 255, 0.6)',
          letterSpacing: '0.5px',
        }}>
          {itemName}
        </div>
        <div style={{ 
          color: isNearComplete ? '#00ff88' : '#00ccff',
          fontSize: '10px',
          textShadow: isNearComplete 
            ? '0 0 8px rgba(0, 255, 136, 0.8)' 
            : '0 0 6px rgba(0, 204, 255, 0.6)',
          fontWeight: 'bold',
        }}>
          {formatTime(remainingTime)}
        </div>
      </div>

      {/* Vertical progress bar with enhanced styling */}
      <div style={{
        width: '6px',
        height: '48px',
        backgroundColor: 'rgba(0, 50, 80, 0.6)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginLeft: '10px',
        border: '1px solid rgba(0, 255, 255, 0.3)',
        position: 'relative',
        zIndex: 2,
        boxShadow: 'inset 0 0 8px rgba(0, 0, 0, 0.5)',
      }}>
        {/* Progress fill from bottom */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: `${progressPercent}%`,
          background: isNearComplete 
            ? 'linear-gradient(to top, #00ff88, #00ffaa)' 
            : 'linear-gradient(to top, #0099ff, #00ffff)',
          boxShadow: isNearComplete 
            ? '0 0 12px rgba(0, 255, 136, 0.8)' 
            : '0 0 10px rgba(0, 255, 255, 0.6)',
          transition: 'height 0.5s ease-out, background 0.3s ease-out, box-shadow 0.3s ease-out',
        }}>
          {/* Animated shimmer effect */}
          <div style={{
            position: 'absolute',
            top: '-50%',
            left: 0,
            right: 0,
            height: '50%',
            background: 'linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.3), transparent)',
            animation: 'shimmer 2s infinite',
          }} />
        </div>
      </div>

      {/* Corner accents */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '8px',
        height: '8px',
        borderTop: isNearComplete ? '2px solid #00ff88' : '2px solid #00ffff',
        borderLeft: isNearComplete ? '2px solid #00ff88' : '2px solid #00ffff',
        zIndex: 2,
      }} />
      <div style={{
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: '8px',
        height: '8px',
        borderBottom: isNearComplete ? '2px solid #00ff88' : '2px solid #00ffff',
        borderRight: isNearComplete ? '2px solid #00ff88' : '2px solid #00ffff',
        zIndex: 2,
      }} />
    </div>
  );
};

// Define keyframes for shimmer animation
const styles = `
  @keyframes shimmer {
    0% { transform: translateY(100%); }
    100% { transform: translateY(-100%); }
  }
`;

// Inject styles into the document head
if (!document.getElementById('active-crafting-queue-styles')) {
  const styleSheet = document.createElement("style");
  styleSheet.id = 'active-crafting-queue-styles';
  styleSheet.type = "text/css";
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);
}

export default React.memo(ActiveCraftingQueueUI); 