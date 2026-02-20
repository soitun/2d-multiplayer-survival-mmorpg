import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import InterfaceTabs from './InterfaceTabs';
import MemoryGrid from './MemoryGrid';
import AlkPanel from './AlkPanel';
import CairnsPanel from './CairnsPanel';
import MatronagePanel from './MatronagePanel';
import LeaderboardPanel from './LeaderboardPanel';
import AchievementsPanel from './AchievementsPanel';
import PlantEncyclopedia from './PlantEncyclopedia';
import { MemoryGridNode } from './MemoryGridData';
import { MINIMAP_DIMENSIONS } from './Minimap';
import { useGameConnection } from '../contexts/GameConnectionContext';
import { playImmediateSound } from '../hooks/useSoundSystem';
import {
  AlkState,
  AlkStation,
  AlkContract,
  AlkPlayerContract,
  PlayerShardBalance,
  WorldState,
  ItemDefinition,
  Cairn,
  PlayerDiscoveredCairn,
  AchievementDefinition,
  PlayerAchievement,
  PlantConfigDefinition,
} from '../generated';
import { Identity } from 'spacetimedb';
import './InterfaceContainer.css';

type InterfaceView = 'minimap' | 'encyclopedia' | 'memory-grid' | 'alk' | 'cairns' | 'matronage' | 'leaderboard' | 'achievements';

interface InterfaceContainerProps {
  children: React.ReactNode;
  canvasWidth: number;
  canvasHeight: number;
  style?: React.CSSProperties;
  onClose: () => void;
  showWeatherOverlay?: boolean;
  onToggleWeatherOverlay?: (checked: boolean) => void;
  showNames?: boolean;
  onToggleShowNames?: (checked: boolean) => void;
  // Initial view to open to (defaults to 'minimap')
  initialView?: InterfaceView;
  // ALK Panel data props
  alkContracts?: Map<string, AlkContract>;
  alkPlayerContracts?: Map<string, AlkPlayerContract>;
  alkStations?: Map<string, AlkStation>;
  alkState?: AlkState | null;
  playerShardBalance?: PlayerShardBalance | null;
  worldState?: WorldState | null;
  itemDefinitions?: Map<string, ItemDefinition>;
  inventoryItems?: Map<string, any>; // For counting Memory Shards
  // Player position for ALK station proximity checking
  playerPosition?: { x: number; y: number } | null;
  // Initial tab for ALK Panel (e.g., 'buy-orders' when coming from delivery panel)
  alkInitialTab?: 'seasonal' | 'materials' | 'arms' | 'armor' | 'tools' | 'provisions' | 'bonus' | 'buy-orders' | 'my-contracts';
  // Cairns Panel data props
  cairns?: Map<string, Cairn>;
  playerDiscoveredCairns?: Map<string, PlayerDiscoveredCairn>;
  // Matronage Panel data props
  matronages?: Map<string, any>;
  matronageMembers?: Map<string, any>;
  matronageInvitations?: Map<string, any>;
  matronageOwedShards?: Map<string, any>;
  players?: Map<string, any>;
  playerUsername?: string;
  // Leaderboard Panel data props
  leaderboardEntries?: Map<string, any>;
  // Achievements Panel data props
  achievementDefinitions?: Map<string, AchievementDefinition>;
  playerAchievements?: Map<string, PlayerAchievement>;
  // Plant Encyclopedia data props
  plantConfigs?: Map<string, PlantConfigDefinition>;
  // Plants discovered by current player (for encyclopedia filtering)
  discoveredPlants?: Map<string, any>;
  // Callback for when search inputs gain/lose focus (blocks player movement)
  onSearchFocusChange?: (isFocused: boolean) => void;
}

const InterfaceContainer: React.FC<InterfaceContainerProps> = ({
  children,
  canvasWidth,
  canvasHeight,
  style,
  onClose,
  showWeatherOverlay: externalShowWeatherOverlay,
  onToggleWeatherOverlay: externalToggleWeatherOverlay,
  showNames: externalShowNames,
  onToggleShowNames: externalToggleShowNames,
  initialView,
  // ALK Panel data props
  alkContracts,
  alkPlayerContracts,
  alkStations,
  alkState,
  playerShardBalance,
  worldState,
  itemDefinitions,
  inventoryItems,
  playerPosition,
  alkInitialTab,
  // Cairns Panel data props
  cairns,
  playerDiscoveredCairns,
  // Matronage Panel data props
  matronages,
  matronageMembers,
  matronageInvitations,
  matronageOwedShards,
  players,
  playerUsername = '',
  leaderboardEntries,
  // Achievements Panel data props
  achievementDefinitions,
  playerAchievements,
  // Plant Encyclopedia data props
  plantConfigs,
  // Plants discovered by current player (for encyclopedia filtering)
  discoveredPlants,
  // Callback for when search inputs gain/lose focus (blocks player movement)
  onSearchFocusChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentView, setCurrentView] = useState<InterfaceView>(initialView || 'minimap');
  const [isMinimapLoading, setIsMinimapLoading] = useState(false);
  
  // Update currentView when initialView changes (e.g., reopening to a specific tab)
  useEffect(() => {
    // If initialView is set, use it; if undefined/null, default to 'minimap'
    setCurrentView(initialView || 'minimap');
  }, [initialView]);
  
  // Grid coordinates visibility preference (stored in localStorage)
  const [showGridCoordinates, setShowGridCoordinates] = useState<boolean>(() => {
    const saved = localStorage.getItem('minimap_show_grid_coordinates');
    return saved !== null ? saved === 'true' : true; // Default to true (show by default)
  });
  
  // Save preference to localStorage when it changes
  const handleToggleGridCoordinates = useCallback((checked: boolean) => {
    setShowGridCoordinates(checked);
    localStorage.setItem('minimap_show_grid_coordinates', checked.toString());
  }, []);
  
  // Show names visibility preference (use external if provided, otherwise manage internally)
  const [internalShowNames, setInternalShowNames] = useState<boolean>(() => {
    const saved = localStorage.getItem('minimap_show_names');
    return saved !== null ? saved === 'true' : true; // Default to true (show by default)
  });
  
  // Use external prop if provided, otherwise use internal state
  const showNames = externalShowNames !== undefined ? externalShowNames : internalShowNames;
  
  // Save preference to localStorage when it changes
  const handleToggleShowNames = useCallback((checked: boolean) => {
    if (externalToggleShowNames) {
      externalToggleShowNames(checked);
    } else {
      setInternalShowNames(checked);
      localStorage.setItem('minimap_show_names', checked.toString());
    }
  }, [externalToggleShowNames]);
  
  // Weather overlay visibility preference (use external if provided, otherwise manage internally)
  const [internalShowWeatherOverlay, setInternalShowWeatherOverlay] = useState<boolean>(() => {
    const saved = localStorage.getItem('minimap_show_weather_overlay');
    return saved !== null ? saved === 'true' : false; // Default to false (hidden by default)
  });
  
  const showWeatherOverlay = externalShowWeatherOverlay !== undefined ? externalShowWeatherOverlay : internalShowWeatherOverlay;
  
  // Save weather overlay preference to localStorage when it changes
  const handleToggleWeatherOverlay = useCallback((checked: boolean) => {
    if (externalToggleWeatherOverlay) {
      externalToggleWeatherOverlay(checked);
    } else {
      setInternalShowWeatherOverlay(checked);
      localStorage.setItem('minimap_show_weather_overlay', checked.toString());
    }
  }, [externalToggleWeatherOverlay]);
  
  // Get SpacetimeDB connection
  const connection = useGameConnection();
  
  // Memory Grid server state
  const [playerShards, setPlayerShards] = useState(0);
  const [purchasedNodes, setPurchasedNodes] = useState<Set<string>>(new Set(['center']));
  const [isLoadingMemoryData, setIsLoadingMemoryData] = useState(false);

  // Update memory grid data from SpacetimeDB subscriptions
  const updateMemoryGridData = useCallback(() => {
    if (!connection.connection || !connection.isConnected || !connection.dbIdentity) return;
    
    setIsLoadingMemoryData(true);
    
    try {
      // Calculate memory shards from inventory using server-side pattern (like projectile.rs)
      let totalShards = 0;
      
      // First, find the Memory Shard item definition ID
      let memoryShardDefId: bigint | null = null;
      for (const itemDef of connection.connection.db.itemDefinition.iter()) {
        if (itemDef.name === 'Memory Shard') {
          memoryShardDefId = itemDef.id;
          // console.log(`🔍 [Memory Grid Debug] Found Memory Shard definition ID: ${memoryShardDefId}`);
          break;
        }
      }
      
      if (!memoryShardDefId) {
        console.error(`❌ [Memory Grid Debug] Memory Shard item definition not found!`);
        setPlayerShards(0);
        setIsLoadingMemoryData(false);
        return;
      }
      
      // console.log(`🔍 [Memory Grid Debug] Scanning inventory for Memory Shards (def_id: ${memoryShardDefId})`);
      // console.log(`🔍 [Memory Grid Debug] Current player identity: ${connection.dbIdentity}`);
      
      // Use the exact same pattern as projectile.rs line 171-187
      for (const item of connection.connection.db.inventoryItem.iter()) {
        if (item.itemDefId === memoryShardDefId && item.quantity > 0) {
          // console.log(`🔍 [Memory Grid Debug] Found Memory Shard item instance:`, {
          //   instanceId: item.instanceId,
          //   quantity: item.quantity,
          //   location: item.location,
          //   locationValue: item.location && 'value' in item.location ? item.location.value : null
          // });
          
          // Match the exact pattern from projectile.rs
          const location = item.location;
          
          // Debug the identity comparison issue
          // console.log(`🔍 [Memory Grid Debug] Identity comparison:`, {
          //   currentPlayer: connection.dbIdentity,
          //   currentPlayerString: connection.dbIdentity?.toString(),
          //   locationOwnerId: location && 'value' in location ? (location.value as any).ownerId : null,
          //   locationOwnerIdString: location && 'value' in location ? (location.value as any).ownerId?.toString() : null,
          //   areEqual: location && 'value' in location ? (location.value as any).ownerId === connection.dbIdentity : false,
          //   areEqualString: location && 'value' in location ? (location.value as any).ownerId?.toString() === connection.dbIdentity?.toString() : false
          // });
          
          // Try both direct comparison and string comparison
          let isOwnedByPlayer = false;
          if (location && 'value' in location) {
            const locationOwnerId = (location.value as any).ownerId;
            // Try direct Identity comparison first
            isOwnedByPlayer = locationOwnerId === connection.dbIdentity;
            // If that fails, try string comparison as fallback
            if (!isOwnedByPlayer && locationOwnerId && connection.dbIdentity) {
              isOwnedByPlayer = locationOwnerId.toString() === connection.dbIdentity.toString();
            }
          }
          
          if ((location?.tag === 'Inventory' || location?.tag === 'Hotbar') && isOwnedByPlayer) {
            totalShards += item.quantity;
            // console.log(`✅ [Memory Grid Debug] Added ${item.quantity} shards from ${location.tag} (total: ${totalShards})`);
          } else {
            let ownerId = 'N/A';
            if (location && 'value' in location) {
              ownerId = (location.value as any).ownerId?.toString() || 'N/A';
            }
            // console.log(`❌ [Memory Grid Debug] Memory Shard not in player's inventory/hotbar:`, {
            //   locationTag: location?.tag,
            //   ownerId,
            //   expectedOwner: connection.dbIdentity?.toString(),
            //   isOwnedByPlayer
            // });
          }
        }
      }
      setPlayerShards(totalShards);
      
      // Get purchased nodes from memory grid progress
      //  console.log(`🔍 [Memory Grid Debug] Looking for progress for player: ${connection.dbIdentity?.toString()}`);
      
      let progress = null;
      for (const p of connection.connection.db.memoryGridProgress.iter()) {
        // console.log(`🔍 [Memory Grid Debug] Found progress entry:`, {
        //   playerId: p.playerId?.toString(),
        //   purchasedNodes: p.purchasedNodes,
        //   matches: p.playerId?.toString() === connection.dbIdentity?.toString()
        // });
        
        if (p.playerId?.toString() === connection.dbIdentity?.toString()) {
          progress = p;
          break;
        }
      }
      
      if (progress) {
        const nodeIds = progress.purchasedNodes.split(',').filter((id: string) => id.trim() !== '');
        setPurchasedNodes(new Set(nodeIds));
        // console.log(`✅ [Memory Grid Debug] Loaded ${nodeIds.length} purchased nodes:`, nodeIds);
        // console.log(`📊 Memory Grid: ${totalShards} shards, ${nodeIds.length} nodes purchased`);
      } else {
        // Initialize if no progress found
        setPurchasedNodes(new Set(['center']));
        connection.connection.reducers.initializePlayerMemoryGrid();
        //  console.log(`📊 Memory Grid: ${totalShards} shards, initializing progress`);
      }
      
    } catch (error) {
      console.error('Failed to update memory grid data:', error);
      // Fallback to default values
      setPlayerShards(0);
      setPurchasedNodes(new Set(['center']));
    } finally {
      setIsLoadingMemoryData(false);
    }
  }, [connection]);

  // Handle node purchases through server
  const handleNodePurchase = useCallback(async (node: MemoryGridNode) => {
    if (!connection.connection) {
      console.error('❌ No connection to server');
      return;
    }
    
    try {
      // Call server reducer to purchase node
      connection.connection.reducers.purchaseMemoryGridNode(node.id);
      // console.log(`✅ Attempting to purchase ${node.name} on server`);
      
      // The state will be updated automatically through SpacetimeDB subscriptions
      // We'll trigger an update manually for immediate feedback
      setTimeout(() => updateMemoryGridData(), 100);
    } catch (error) {
      console.error(`❌ Failed to purchase ${node.name}:`, error);
    }
  }, [connection, updateMemoryGridData]);

  // Handle faction reset through server
  const handleFactionReset = useCallback(async () => {
    if (!connection.connection) {
      console.error('❌ No connection to server');
      return;
    }
    
    try {
      // Call server reducer to reset faction
      connection.connection.reducers.resetFaction();
      console.log('✅ Attempting to reset faction on server');
      
      // The state will be updated automatically through SpacetimeDB subscriptions
      // Trigger an update manually for immediate feedback
      setTimeout(() => updateMemoryGridData(), 100);
    } catch (error) {
      console.error('❌ Failed to reset faction:', error);
    }
  }, [connection, updateMemoryGridData]);

  // Register reducer callback for successful memory grid node purchases
  useEffect(() => {
    if (!connection.connection) return;

    const handlePurchaseResult = (ctx: any, nodeId: string) => {
      // Only play sound on successful purchase (Committed status)
      if (ctx.event?.status?.tag === 'Committed') {
        // Play unlock sound when purchase succeeds (for both skill unlocks and faction unlocks)
        playImmediateSound('unlock_sound', 1.0);
        console.log(`✅ Successfully purchased memory grid node: ${nodeId}`);
      } else if (ctx.event?.status?.tag === 'Failed') {
        const errorMsg = ctx.event.status.value || 'Unknown error';
        console.error(`❌ Failed to purchase memory grid node ${nodeId}:`, errorMsg);
      }
    };

    connection.connection.reducers.onPurchaseMemoryGridNode(handlePurchaseResult);

    return () => {
      connection.connection?.reducers.removeOnPurchaseMemoryGridNode(handlePurchaseResult);
    };
  }, [connection]);

  // Update memory grid data when connection changes or data updates
  useEffect(() => {
    updateMemoryGridData();
  }, [updateMemoryGridData]);
  
  // Update when SpacetimeDB data changes (event-driven instead of polling)
  useEffect(() => {
    if (!connection.connection || !connection.isConnected) return;

    const conn = connection.connection;
    const scheduleUpdate = () => {
      // Run on next tick to batch bursts of table events
      queueMicrotask(() => updateMemoryGridData());
    };

    conn.db.inventoryItem.onInsert(scheduleUpdate);
    conn.db.inventoryItem.onUpdate(scheduleUpdate);
    conn.db.inventoryItem.onDelete(scheduleUpdate);
    conn.db.memoryGridProgress.onInsert(scheduleUpdate);
    conn.db.memoryGridProgress.onUpdate(scheduleUpdate);
    conn.db.memoryGridProgress.onDelete(scheduleUpdate);

    return () => {
      conn.db.inventoryItem.removeOnInsert(scheduleUpdate);
      conn.db.inventoryItem.removeOnUpdate(scheduleUpdate);
      conn.db.inventoryItem.removeOnDelete(scheduleUpdate);
      conn.db.memoryGridProgress.removeOnInsert(scheduleUpdate);
      conn.db.memoryGridProgress.removeOnUpdate(scheduleUpdate);
      conn.db.memoryGridProgress.removeOnDelete(scheduleUpdate);
    };
  }, [connection.connection, connection.isConnected, updateMemoryGridData]);

  // Handle view changes with loading state for minimap
  const handleViewChange = (view: InterfaceView) => {
    if (view === 'minimap' && currentView !== 'minimap') {
      // Show loading when switching TO minimap from another tab
      setIsMinimapLoading(true);
      setCurrentView(view);
      
      // Hide loading after a short delay to allow minimap to render
      setTimeout(() => {
        setIsMinimapLoading(false);
      }, 800); // Adjust timing as needed
    } else {
      // No loading needed for other tabs
      setCurrentView(view);
    }
  };

  // Add global CSS for smooth animations - uses GPU-accelerated transforms
  useEffect(() => {
    // Check if style already exists to prevent duplicates
    const existingStyle = document.getElementById('cyberpunk-spinner-styles');
    if (existingStyle) return;
    
    const style = document.createElement('style');
    style.id = 'cyberpunk-spinner-styles';
    style.textContent = `
      @keyframes cyberpunk-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      @keyframes cyberpunk-spin-reverse {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(-360deg); }
      }
      
      @keyframes cyberpunk-pulse {
        0%, 100% { 
          opacity: 1; 
          transform: scale(1);
        }
        50% { 
          opacity: 0.6; 
          transform: scale(1.15);
        }
      }
      
      @keyframes cyberpunk-text-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      @keyframes cyberpunk-glow-pulse {
        0%, 100% { 
          box-shadow: 0 0 8px #00d4ff, 0 0 16px rgba(0, 212, 255, 0.5);
        }
        50% { 
          box-shadow: 0 0 16px #00d4ff, 0 0 32px rgba(0, 212, 255, 0.8);
        }
      }
      
      .cyberpunk-spinner-outer {
        animation: cyberpunk-spin 1.5s linear infinite;
        transform-origin: center center;
        will-change: transform;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }
      
      .cyberpunk-spinner-inner {
        animation: cyberpunk-spin-reverse 1s linear infinite;
        transform-origin: center center;
        will-change: transform;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }
      
      .cyberpunk-pulse-dot {
        animation: cyberpunk-pulse 1s ease-in-out infinite, cyberpunk-glow-pulse 1s ease-in-out infinite;
        will-change: transform, opacity;
      }
      
      .cyberpunk-text-pulse {
        animation: cyberpunk-text-pulse 1.5s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
    
    // Don't remove on unmount - keep styles persistent to prevent animation restart
    return () => {
      // Only cleanup if this was the last InterfaceContainer instance
      // For now, keep styles to prevent stuttering on remount
    };
  }, []);

  // Click outside to close (but exclude MobileControlBar buttons)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      
      // Don't close if clicking on MobileControlBar or its buttons
      const mobileControlBar = (target as Element).closest('[data-mobile-control-bar]');
      if (mobileControlBar) {
        return; // Don't close when clicking mobile control bar buttons
      }
      
      if (containerRef.current && !containerRef.current.contains(target)) {
        onClose();
      }
    };

    // Support both mouse and touch events for mobile compatibility
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [onClose]);

  // Block specific mouse events from reaching the game, but allow input interactions
  const handleMouseEvent = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Don't block events on input elements
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }
    
    // Don't block events on canvas elements (let the minimap handle them)
    if (target.tagName === 'CANVAS') {
      return;
    }
    
    e.stopPropagation();
    // Don't call preventDefault on all events - causes issues with passive listeners
  };

  // Separate handler for wheel events to avoid passive listener issues
  const handleWheelEvent = (e: React.WheelEvent) => {
    const target = e.target as HTMLElement;
    
    // Don't block wheel events on input elements
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }
    
    // Don't block wheel events on canvas elements
    if (target.tagName === 'CANVAS') {
      return;
    }
    
    e.stopPropagation();
    // Don't call preventDefault - causes passive listener issues
  };

  // Separate handler for context menu events
  const handleContextMenuEvent = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Don't block context menu on input elements
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }
    
    e.stopPropagation();
    e.preventDefault(); // Safe to call preventDefault on context menu events
  };

  // Detect mobile screen size - update on resize for rotation/resize
  const [isMobileScreen, setIsMobileScreen] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 768
  );
  useEffect(() => {
    const check = () => setIsMobileScreen(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Calculate container width to match tab bar width (8 tabs)
  // GRU MAPS(110) + ENCYCLOPEDIA(130) + MEMORY GRID(130) + ALK(110) + CAIRNS(~85) + MATRONAGE(~105) + LEADERBOARD(~115) + ACHIEVEMENTS(~125) + margins(2px*7=14)
  const INTERFACE_CONTAINER_WIDTH = 924; // Matches total tab width

  // Base content container style to maintain consistent dimensions
  // On mobile, use full available space; on desktop, use width that matches all tabs combined
  const contentContainerStyle: React.CSSProperties = {
    width: isMobileScreen ? '100%' : `${INTERFACE_CONTAINER_WIDTH}px`,
    height: isMobileScreen ? '100%' : `${MINIMAP_DIMENSIONS.height}px`,
    maxWidth: '100%',
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden', // Prevent content from breaking the fixed dimensions
  };

  // Loading overlay spinner component - memoized to prevent animation restart on re-render
  const LoadingOverlay = useMemo(() => (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 35, 0.9)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10,
      backdropFilter: 'blur(3px)',
    }}>
      {/* Spinner container - centers the nested rings */}
      <div style={{
        position: 'relative',
        width: '90px',
        height: '90px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        {/* Outer rotating ring */}
        <div 
          className="cyberpunk-spinner-outer"
          style={{
            position: 'absolute',
            width: '90px',
            height: '90px',
            border: '3px solid transparent',
            borderTop: '3px solid #00d4ff',
            borderRight: '3px solid #7c3aed',
            borderRadius: '50%',
            boxSizing: 'border-box',
          }}
        />
        {/* Inner rotating ring (counter-clockwise) */}
        <div 
          className="cyberpunk-spinner-inner"
          style={{
            position: 'absolute',
            width: '66px',
            height: '66px',
            border: '2px solid transparent',
            borderTop: '2px solid #7c3aed',
            borderLeft: '2px solid #00d4ff',
            borderRadius: '50%',
            boxSizing: 'border-box',
          }}
        />
        {/* Center pulsing dot */}
        <div 
          className="cyberpunk-pulse-dot"
          style={{
            position: 'absolute',
            width: '12px',
            height: '12px',
            background: '#00d4ff',
            borderRadius: '50%',
          }} 
        />
      </div>
      
      {/* Loading text */}
      <div style={{
        marginTop: '24px',
        color: '#00d4ff',
        fontSize: '14px',
        fontWeight: 'bold',
        textAlign: 'center',
        fontFamily: 'monospace',
        letterSpacing: '2px',
      }}>
        <div className="cyberpunk-text-pulse">
          INITIALIZING GRU MAPS
        </div>
        <div style={{ 
          marginTop: '10px', 
          fontSize: '11px', 
          color: '#7c3aed',
          letterSpacing: '1px',
        }}>
          Scanning neural pathways...
        </div>
      </div>
    </div>
  ), []);

  // Render content based on current view
  const renderContent = () => {
    // Always render the minimap canvas to prevent remounting issues when switching tabs
    // This keeps the canvas in the DOM so it maintains its size and state
    const minimapContent = (
      <div 
        key="minimap-content"
        style={{ 
          ...contentContainerStyle,
          padding: '0',
          background: 'transparent',
          border: 'none',
          position: currentView === 'minimap' ? 'relative' : 'absolute',
          // Override alignItems to stretch so canvas fills the container
          // This is critical for accurate minimap click coordinate conversion
          alignItems: 'stretch',
          // Hide when not on minimap tab, but keep in DOM to preserve canvas state
          display: currentView === 'minimap' ? 'flex' : 'none',
        }}
      >
        {children}
        {/* Toggle Controls Container */}
        <div style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          zIndex: 1002,
          pointerEvents: 'auto', // Ensure controls receive mouse events
        }}>
          {/* Grid Coordinates Toggle Checkbox */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: '"Courier New", monospace',
              color: '#00d4ff',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(0, 212, 255, 0.3)',
              userSelect: 'none',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
              e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
              e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)';
            }}
          >
            <input
              type="checkbox"
              checked={showGridCoordinates}
              onChange={(e) => handleToggleGridCoordinates(e.target.checked)}
              style={{
                cursor: 'pointer',
                width: '14px',
                height: '14px',
                accentColor: '#00d4ff',
              }}
            />
            <span style={{ textShadow: '0 0 4px rgba(0, 212, 255, 0.8)' }}>
              Show Grid
            </span>
          </label>
            
          {/* Weather Overlay Toggle Checkbox */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: '"Courier New", monospace',
              color: '#4682B4',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(70, 130, 180, 0.3)',
              userSelect: 'none',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
              e.currentTarget.style.borderColor = 'rgba(70, 130, 180, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
              e.currentTarget.style.borderColor = 'rgba(70, 130, 180, 0.3)';
            }}
          >
            <input
              type="checkbox"
              checked={showWeatherOverlay}
              onChange={(e) => handleToggleWeatherOverlay(e.target.checked)}
              style={{
                cursor: 'pointer',
                width: '14px',
                height: '14px',
                accentColor: '#4682B4',
              }}
            />
            <span style={{ textShadow: '0 0 4px rgba(70, 130, 180, 0.8)' }}>
              Weather
            </span>
          </label>
            
          {/* Show Names Toggle Checkbox */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: '"Courier New", monospace',
              color: '#D2691E',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(210, 105, 30, 0.3)',
              userSelect: 'none',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
              e.currentTarget.style.borderColor = 'rgba(210, 105, 30, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
              e.currentTarget.style.borderColor = 'rgba(210, 105, 30, 0.3)';
            }}
          >
            <input
              type="checkbox"
              checked={showNames}
              onChange={(e) => handleToggleShowNames(e.target.checked)}
              style={{
                cursor: 'pointer',
                width: '14px',
                height: '14px',
                accentColor: '#D2691E',
              }}
            />
            <span style={{ textShadow: '0 0 4px rgba(210, 105, 30, 0.8)' }}>
              Show Names
            </span>
          </label>
        </div>
        {/* Show loading overlay on top of minimap content */}
        {isMinimapLoading && LoadingOverlay}
      </div>
    );

    // Render other content based on current view
    const otherContent = (() => {
      switch (currentView) {
        case 'minimap':
          return null; // Minimap is always rendered above
        case 'encyclopedia':
        return (
          <div className="encyclopedia-content" style={{
            ...contentContainerStyle,
            padding: '0',
            background: 'transparent',
            border: 'none',
            position: 'relative',
          }}>
            <PlantEncyclopedia
              plantConfigs={plantConfigs || new Map()}
              discoveredPlants={discoveredPlants || new Map()}
            />
          </div>
        );
      case 'memory-grid':
        return (
          <div className="memory-grid-content" style={{ 
            ...contentContainerStyle,
            padding: '0', // Remove padding to let MemoryGrid use full space
            background: 'transparent', // MemoryGrid has its own background
            border: 'none', // MemoryGrid has its own border
            position: 'relative',
          }}>
            <MemoryGrid
              playerShards={playerShards}
              purchasedNodes={purchasedNodes}
              totalShardsSpent={(() => {
                // Get total shards spent from memory grid progress
                if (!connection.connection || !connection.dbIdentity) return 0;
                const progress = connection.connection.db.memoryGridProgress.playerId.find(connection.dbIdentity);
                return progress ? Number(progress.totalShardsSpent) : 0;
              })()}
              onNodePurchase={handleNodePurchase}
              onFactionReset={handleFactionReset}
            />
            {/* Show loading overlay when fetching memory data */}
            {isLoadingMemoryData && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(15, 23, 35, 0.85)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 10,
                backdropFilter: 'blur(2px)',
              }}>
                <div style={{
                  color: '#7c3aed',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  letterSpacing: '1px',
                }}>
                  <div className="cyberpunk-text-pulse">
                    SYNCING NEURAL GRID
                  </div>
                  <div style={{ 
                    marginTop: '8px', 
                    fontSize: '12px', 
                    color: '#00d4ff',
                    opacity: '0.8'
                  }}>
                    Validating memory shards...
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case 'alk':
        return (
          <div className="alk-content" style={{ 
            ...contentContainerStyle,
            padding: '0',
            background: 'transparent',
            border: 'none',
            position: 'relative',
          }}>
            <AlkPanel
              playerIdentity={connection.dbIdentity || null}
              onClose={onClose}
              alkState={alkState || null}
              alkStations={alkStations || new Map()}
              alkContracts={alkContracts || new Map()}
              alkPlayerContracts={alkPlayerContracts || new Map()}
              playerShardBalance={playerShardBalance || null}
              worldState={worldState || null}
              itemDefinitions={itemDefinitions || new Map()}
              inventoryItems={inventoryItems || new Map()}
              playerPosition={playerPosition}
              initialTab={alkInitialTab}
            />
          </div>
        );
      case 'cairns':
        return (
          <div className="cairns-content" style={{
            ...contentContainerStyle,
            padding: '0',
            background: 'transparent',
            border: 'none',
            position: 'relative',
          }}>
            <CairnsPanel
              cairns={cairns || new Map()}
              playerDiscoveredCairns={playerDiscoveredCairns || new Map()}
              currentPlayerIdentity={connection.dbIdentity || null}
            />
          </div>
        );
      case 'matronage':
        return (
          <div className="matronage-content" style={{
            ...contentContainerStyle,
            padding: '0',
            background: 'transparent',
            border: 'none',
            position: 'relative',
          }}>
            <MatronagePanel
              playerIdentity={connection.dbIdentity || null}
              playerUsername={playerUsername}
              onClose={onClose}
              matronages={matronages || new Map()}
              matronageMembers={matronageMembers || new Map()}
              matronageInvitations={matronageInvitations || new Map()}
              matronageOwedShards={matronageOwedShards || new Map()}
              players={players || new Map()}
            />
          </div>
        );
      case 'leaderboard':
        return (
          <div className="leaderboard-content" style={{
            ...contentContainerStyle,
            padding: '0',
            background: 'transparent',
            border: 'none',
            position: 'relative',
          }}>
            <LeaderboardPanel
              playerIdentity={connection.dbIdentity || null}
              leaderboardEntries={leaderboardEntries || new Map()}
              onClose={onClose}
            />
          </div>
        );
      case 'achievements':
        return (
          <div className="achievements-content" style={{
            ...contentContainerStyle,
            padding: '0',
            background: 'transparent',
            border: 'none',
            position: 'relative',
          }}>
            <AchievementsPanel
              playerIdentity={connection.dbIdentity || null}
              achievementDefinitions={achievementDefinitions || new Map()}
              playerAchievements={playerAchievements || new Map()}
              onClose={onClose}
              onSearchFocusChange={onSearchFocusChange}
            />
          </div>
        );
      default:
        return null;
      }
    })();

    // Return both minimap (always in DOM) and other content
    return (
      <>
        {minimapContent}
        {otherContent}
      </>
    );
  };

  return (
    <div
      ref={containerRef}
      className="interface-container"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
        ...style,
      }}
      onMouseDown={handleMouseEvent}
      onMouseUp={handleMouseEvent}
      onClick={handleMouseEvent}
      onWheel={handleWheelEvent}
      onContextMenu={handleContextMenuEvent}
    >
      {/* Mobile-only close button - 44px min touch target */}
      {isMobileScreen && (
        <button
          className="interface-container-close-mobile"
          onClick={onClose}
          aria-label="Close"
          type="button"
        >
          ×
        </button>
      )}
      <InterfaceTabs
        currentView={currentView}
        onViewChange={handleViewChange}
        className="interface-tabs"
        hideEncyclopedia={false}
        hideCairns={false}
      />
      
      <div className="interface-content">
        {renderContent()}
      </div>
    </div>
  );
};

export default React.memo(InterfaceContainer);