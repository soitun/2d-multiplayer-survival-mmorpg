import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Player, ItemDefinition, DbConnection, FishingSession, WorldState } from '../generated';
import { Identity } from 'spacetimedb';
import FishingReticle from './FishingReticle';
import { FishingState, FISHING_CONSTANTS } from '../types/fishing';
import bobberImage from '../assets/doodads/primitive_reed_bobble.png';
import styles from './FishingUI.module.css';

interface FishingManagerProps {
  localPlayer: Player | null;
  playerIdentity: Identity | null;
  activeItemDef: ItemDefinition | null;
  gameCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraOffsetX: number;
  cameraOffsetY: number;
  isWaterTile: (worldX: number, worldY: number) => boolean;
  connection: DbConnection | null;
  onFishingStateChange?: (isActive: boolean) => void;
  // Add new props for rendering other players' fishing
  fishingSessions: Map<string, FishingSession>;
  players: Map<string, Player>;
  // Add worldState for weather information
  worldState: WorldState | null;
}

const FishingManager: React.FC<FishingManagerProps> = ({
  localPlayer,
  playerIdentity,
  activeItemDef,
  gameCanvasRef,
  cameraOffsetX,
  cameraOffsetY,
  isWaterTile,
  connection,
  onFishingStateChange,
  fishingSessions,
  players,
  worldState,
}) => {
  const [fishingState, setFishingState] = useState<FishingState>({
    isActive: false,
    isCasting: false,
    isMinigameActive: false,
    castTarget: null,
    fishingRod: null,
  });

  // Check if player has a valid fishing rod equipped
  const isValidFishingRod = useCallback(() => {
    return activeItemDef && FISHING_CONSTANTS.VALID_FISHING_RODS.some(rod => rod === activeItemDef.name);
  }, [activeItemDef]);

  // Handle casting the fishing line
  const handleCast = useCallback((worldX: number, worldY: number) => {
    if (!localPlayer || !playerIdentity || !isValidFishingRod()) {
      console.warn('[FishingManager] Invalid state for casting');
      return;
    }

    console.log('[FishingManager] Casting at:', { worldX, worldY });
    
    // 🎣 FISHING EXPLOIT FIX: Distance-based bonuses are now calculated from bobber position to shore,
    // not from player position to cast target. This prevents players from standing far away and 
    // casting near shore to exploit deep water bonuses while actually fishing in shallow water.
    
    // Set fishing state to active with cast target
    setFishingState({
      isActive: true,
      isCasting: false,
      isMinigameActive: false,
      castTarget: { x: worldX, y: worldY },
      fishingRod: activeItemDef?.name || null,
    });

    // Call the server reducer to create fishing session
    if (connection) {
      connection.reducers.castFishingLine(worldX, worldY);
    }
  }, [localPlayer, playerIdentity, activeItemDef, isValidFishingRod, connection]);

  // Handle successful fishing
  const handleFishingSuccess = useCallback(async (loot: string[]) => {
    if (connection) {
      await connection.reducers.finishFishing(true, loot);
    }
    
    setFishingState({
      isActive: false,
      isCasting: false,
      isMinigameActive: false,
      castTarget: null,
      fishingRod: null,
    });
  }, [connection]);

  // Handle fishing failure
  const handleFishingFailure = useCallback(() => {
    if (connection) {
      connection.reducers.finishFishing(false, []);
    }
    
    setFishingState({
      isActive: false,
      isCasting: false,
      isMinigameActive: false,
      castTarget: null,
      fishingRod: null,
    });
  }, [connection]);

  // Handle canceling fishing (ESC key)
  const handleCancel = useCallback(() => {
    if (connection) {
      connection.reducers.cancelFishing();
    }
    
    setFishingState({
      isActive: false,
      isCasting: false,
      isMinigameActive: false,
      castTarget: null,
      fishingRod: null,
    });
  }, [connection]);

  // Check if fishing rod is unequipped during active fishing session
  React.useEffect(() => {
    if (fishingState.isActive && !isValidFishingRod()) {
      handleCancel();
    }
  }, [fishingState.isActive, isValidFishingRod, handleCancel]);

  // Handle ESC key to cancel fishing
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && fishingState.isActive) {
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fishingState.isActive, handleCancel]);

  // 🎣 FISHING INPUT FIX: Notify parent when fishing state changes
  React.useEffect(() => {
    if (onFishingStateChange) {
      onFishingStateChange(fishingState.isActive);
    }
  }, [fishingState.isActive, onFishingStateChange]);



  // TODO: Add reducer callback to show success notification when server confirms
  // For now, items will just appear as dropped items at player's feet

  return (
    <>
      {/* Show fishing reticle when not actively fishing and player has a fishing rod */}
      {!fishingState.isActive && isValidFishingRod() && (
        <FishingReticle
          localPlayer={localPlayer}
          playerIdentity={playerIdentity}
          activeItemDef={activeItemDef}
          gameCanvasRef={gameCanvasRef}
          cameraOffsetX={cameraOffsetX}
          cameraOffsetY={cameraOffsetY}
          onCast={handleCast}
          isWaterTile={isWaterTile}
        />
      )}
      
      {/* Show fishing system when actively fishing */}
      {fishingState.isActive && fishingState.castTarget && localPlayer && (
        <FishingSystem
          playerX={localPlayer.positionX}
          playerY={localPlayer.positionY}
          playerDirection={localPlayer.direction || 'down'}
          castTargetX={fishingState.castTarget.x}
          castTargetY={fishingState.castTarget.y}
          cameraOffsetX={cameraOffsetX}
          cameraOffsetY={cameraOffsetY}
          gameCanvasRef={gameCanvasRef}
          onSuccess={handleFishingSuccess}
          onFailure={handleFishingFailure}
          onCancel={handleCancel}
          isWaterTile={isWaterTile}
          worldState={worldState}
        />
      )}

      {/* Render other players' fishing lines - always visible */}
      {Array.from(fishingSessions.entries()).map(([playerId, session]) => {
        // Skip local player (handled above)
        if (playerIdentity && playerId === playerIdentity.toHexString()) return null;
        
        // Skip inactive sessions
        if (!session.isActive) return null;
        
        // Get player data
        const player = players.get(playerId);
        if (!player) return null;
        
        return (
          <FishingSystem
            key={`fishing-${playerId}`}
            playerX={player.positionX}
            playerY={player.positionY}
            playerDirection={player.direction || 'down'}
            castTargetX={session.targetX}
            castTargetY={session.targetY}
            cameraOffsetX={cameraOffsetX}
            cameraOffsetY={cameraOffsetY}
            gameCanvasRef={gameCanvasRef}
            onSuccess={() => {}} // No-op for other players
            onFailure={() => {}} // No-op for other players
            onCancel={() => {}} // No-op for other players
            isWaterTile={isWaterTile}
            worldState={worldState}
            isRemotePlayer={true}
          />
        );
      })}


    </>
  );
};

// Enhanced fishing system with tension balance mini-game
interface FishingSystemProps {
  playerX: number;
  playerY: number;
  playerDirection: string; // Add player direction for rod alignment
  castTargetX: number;
  castTargetY: number;
  cameraOffsetX: number;
  cameraOffsetY: number;
  gameCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onSuccess: (loot: string[]) => void;
  onFailure: () => void;
  onCancel: () => void;
  isWaterTile: (worldX: number, worldY: number) => boolean;
  // Add worldState for weather information
  worldState: WorldState | null;
  // NEW: Whether this is a remote player's fishing (readonly view)
  isRemotePlayer?: boolean;
}

interface BobberState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  isMoving: boolean;
}

// NEW: Tension Balance Mini-Game State
interface TensionState {
  currentTension: number; // 0-100, player's current line tension
  sweetSpotCenter: number; // 0-100, where the sweet spot is centered
  sweetSpotWidth: number; // Width of the sweet spot (gets smaller as fish tires)
  fishPullStrength: number; // How hard the fish is currently pulling
  fishPullDirection: number; // 1 = pulling away (increase tension), -1 = swimming toward (decrease)
  catchProgress: number; // 0-100, progress toward catching the fish
  escapeProgress: number; // 0-100, progress toward fish escaping
  isReeling: boolean; // Is player holding right-click
}

const FishingSystem: React.FC<FishingSystemProps> = ({
  playerX,
  playerY,
  playerDirection,
  castTargetX,
  castTargetY,
  cameraOffsetX,
  cameraOffsetY,
  gameCanvasRef,
  onSuccess,
  onFailure,
  onCancel,
  isWaterTile,
  worldState,
  isRemotePlayer = false,
}) => {
  const [phase, setPhase] = useState<'waiting' | 'caught' | 'reeling'>('waiting');
  const [timer, setTimer] = useState(100); // 100% -> 0%
  const [bobber, setBobber] = useState<BobberState>({
    x: castTargetX,
    y: castTargetY,
    targetX: castTargetX,
    targetY: castTargetY,
    isMoving: false,
  });
  const [showResult, setShowResult] = useState<{ type: 'success' | 'failure', message: string, loot?: string[] } | null>(null);
  
  // NEW: Tension Balance Mini-Game State
  const [tension, setTension] = useState<TensionState>({
    currentTension: 50, // Start in middle
    sweetSpotCenter: 50, // Sweet spot starts in middle
    sweetSpotWidth: 30, // Initial sweet spot width (percentage)
    fishPullStrength: 0,
    fishPullDirection: 1,
    catchProgress: 0,
    escapeProgress: 0,
    isReeling: false,
  });

  // Tension Balance Mini-Game Constants
  const TENSION_MIN = 5; // Minimum tension before fish escapes
  const TENSION_MAX = 95; // Maximum tension before line breaks
  const SWEET_SPOT_MIN_WIDTH = 15; // Minimum sweet spot width (harder as fish tires)
  const REEL_TENSION_RATE = 45; // How fast tension increases when reeling (per second)
  const SLACK_TENSION_RATE = 35; // How fast tension decreases when giving slack (per second)
  const FISH_PULL_BASE = 20; // Base fish pull strength (per second)
  const FISH_PULL_VARIANCE = 25; // Random variance in fish pull
  const SWEET_SPOT_MOVE_SPEED = 30; // How fast sweet spot can move (per second)
  const CATCH_PROGRESS_RATE = 12; // Progress gain when in sweet spot (per second)
  const ESCAPE_PROGRESS_RATE = 8; // Progress toward escape when out of sweet spot (per second)
  const ESCAPE_THRESHOLD = 100; // Fish escapes at this progress
  const CATCH_THRESHOLD = 100; // Fish caught at this progress

  // 🚀 PERFORMANCE: Cache shore distance calculation
  const shoreDistanceCacheRef = useRef<{ 
    bobberX: number; 
    bobberY: number; 
    distance: number; 
    lastCalculated: number;
  } | null>(null);

  // 🎣 FISHING EXPLOIT FIX: Calculate distance from bobber to nearest shore
  const calculateBobberToShoreDistance = useCallback((bobberX: number, bobberY: number, isWaterTile: (x: number, y: number) => boolean): number => {
    // 🚀 PERFORMANCE: Check cache first - only recalculate if bobber moved significantly
    const cache = shoreDistanceCacheRef.current;
    const now = performance.now();
    const CACHE_THRESHOLD = 20; // Only recalculate if bobber moved 20+ pixels
    const CACHE_TIMEOUT = 500; // Recalculate every 500ms regardless
    
    if (cache) {
      const distanceMoved = Math.sqrt(
        Math.pow(bobberX - cache.bobberX, 2) + Math.pow(bobberY - cache.bobberY, 2)
      );
      const timeSinceLastCalc = now - cache.lastCalculated;
      
      // Use cached value if bobber hasn't moved much and cache isn't too old
      if (distanceMoved < CACHE_THRESHOLD && timeSinceLastCalc < CACHE_TIMEOUT) {
        return cache.distance;
      }
    }
    
    // 🚀 PERFORMANCE FIX: Use efficient radial search instead of grid search
    // This reduces checks from ~1,000 to ~50-100 and stops early when shore is found
    
    const maxRadius = 200; // Maximum search distance
    const radiusStep = 16; // Check every 16 pixels radially
    const angleStep = Math.PI / 8; // Check 16 directions (22.5° apart)
    
    let minDistance = maxRadius;
    
    // Search outward in concentric circles
    for (let radius = radiusStep; radius <= maxRadius; radius += radiusStep) {
      let foundShoreAtThisRadius = false;
      
      // Check points around the circle at this radius
      for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
        const checkX = bobberX + Math.cos(angle) * radius;
        const checkY = bobberY + Math.sin(angle) * radius;
        
        // If this position is not water (i.e., it's shore/land)
        if (!isWaterTile(checkX, checkY)) {
          minDistance = Math.min(minDistance, radius);
          foundShoreAtThisRadius = true;
        }
      }
      
      // Early exit: if we found shore at this radius, we don't need to search further
      // (since we're searching outward, this is likely the minimum distance)
      if (foundShoreAtThisRadius) {
        break;
      }
    }
    
    // 🚀 PERFORMANCE: Cache the result
    shoreDistanceCacheRef.current = {
      bobberX,
      bobberY,
      distance: minDistance,
      lastCalculated: now
    };
    
    return minDistance;
  }, []);

  // Calculate distance-based bite probability multiplier
  const getDistanceBasedBiteMultiplier = (distance: number): number => {
    // 🎣 FISHING EXPLOIT FIX: Calculate distance from bobber to nearest shore, not player to cast target
    // This prevents players from standing far away and casting near shore to get deep water bonuses
    
    // Find the nearest shore tile to the bobber position
    const bobberToShoreDistance = calculateBobberToShoreDistance(bobber.x, bobber.y, isWaterTile);
    
    // Normalize distance to 0-1 range (0 = shore, 1 = max range)
    // Use a reasonable max distance for shore detection (200 pixels = deep water)
    const maxShoreDistance = 200;
    const normalizedDistance = Math.min(bobberToShoreDistance / maxShoreDistance, 1);
    
    // Create a curve where:
    // - Distance 0 (shore): 0.2x bite chance (very low)
    // - Distance 100 (medium depth): 1.0x bite chance (normal)
    // - Distance 200+ (deep water): 2.5x bite chance (high reward for risk)
    
    // Quadratic curve for smooth progression
    const baseMultiplier = 0.2; // Minimum at shore
    const maxMultiplier = 2.5;   // Maximum at deep water
    const curveExponent = 1.8;   // Curve steepness (higher = more dramatic)
    
    const multiplier = baseMultiplier + (maxMultiplier - baseMultiplier) * Math.pow(normalizedDistance, curveExponent);
    
    // console.log(`[FishingSystem] Bobber to shore distance: ${bobberToShoreDistance.toFixed(1)}, Normalized: ${normalizedDistance.toFixed(2)}, Bite multiplier: ${multiplier.toFixed(2)}x`);
    return multiplier;
  };

  const distanceBiteMultiplier = getDistanceBasedBiteMultiplier(calculateBobberToShoreDistance(bobber.x, bobber.y, isWaterTile));

  // Calculate rain-based fishing effectiveness multiplier (client-side for UI display)
  const getRainFishingMultiplier = (worldState: WorldState | null): number => {
    if (!worldState?.currentWeather) return 1.0;
    
    switch (worldState.currentWeather.tag) {
      case 'Clear': return 1.0;           // Normal fishing in clear weather
      case 'LightRain': return 1.3;       // 30% better - light rain stirs up insects
      case 'ModerateRain': return 1.6;    // 60% better - fish are more active
      case 'HeavyRain': return 2.0;       // 100% better - fish feeding frenzy
      case 'HeavyStorm': return 2.5;      // 150% better - but dangerous conditions!
      default: return 1.0;
    }
  };

  const rainBiteMultiplier = getRainFishingMultiplier(worldState);
  const totalBiteMultiplier = distanceBiteMultiplier * rainBiteMultiplier;

  // Check if player moved too far from bobber and break line
  React.useEffect(() => {
    const distance = Math.sqrt(
      Math.pow(playerX - bobber.x, 2) + Math.pow(playerY - bobber.y, 2)
    );
    
    if (distance > FISHING_CONSTANTS.BREAK_DISTANCE) {
      // console.log('[FishingSystem] Line broke! Player moved too far from bobber:', distance);
      setShowResult({ type: 'failure', message: 'Line broke! You moved too far away.' });
      setTimeout(() => onCancel(), 2000);
    }
  }, [playerX, playerY, bobber.x, bobber.y, onCancel]);

  // Handle bite timer and phase transitions
  React.useEffect(() => {
    if (phase !== 'waiting' || isRemotePlayer) return;

    // Random bite chance - fish can bite at any time during waiting period
    // Higher chance as time progresses (more likely to bite later)
    const biteCheckInterval = setInterval(() => {
      const elapsed = Date.now() - timerStartRef.current;
      const timeProgress = elapsed / FISHING_CONSTANTS.BITE_TIMER_DURATION; // 0 to 1
      
      // Base 1% chance per check, increasing to 5% chance as time progresses
      const baseBiteChance = 0.01;
      const progressMultiplier = 1 + timeProgress * 4; // 1x to 5x multiplier
      
      // Apply distance-based multiplier (deeper water = better fishing)
      const finalBiteChance = baseBiteChance * progressMultiplier * totalBiteMultiplier;
      
      if (Math.random() < finalBiteChance) {
        setPhase('caught');
        
        // Initialize fish fighting mechanics - start bobber moving
        setBobber(prev => ({
          ...prev,
          isMoving: true,
        }));
        
        // Initialize tension mini-game state
        setTension({
          currentTension: 50,
          sweetSpotCenter: 50,
          sweetSpotWidth: 30,
          fishPullStrength: FISH_PULL_BASE,
          fishPullDirection: 1,
          catchProgress: 0,
          escapeProgress: 0,
          isReeling: false,
        });
        
        setTimer(0);
        clearInterval(biteCheckInterval);
      }
    }, 200); // Check every 200ms

    // Automatic failure if timer fully expires
    const failureTimer = setTimeout(() => {
      setShowResult({ type: 'failure', message: 'No fish bit the bait. Try again!' });
      setTimeout(() => onFailure(), 2000);
      clearInterval(biteCheckInterval);
    }, FISHING_CONSTANTS.BITE_TIMER_DURATION);

    // Update timer display countdown
    const timerInterval = setInterval(() => {
      setTimer(prev => {
        const elapsed = Date.now() - timerStartRef.current;
        const remaining = Math.max(0, FISHING_CONSTANTS.BITE_TIMER_DURATION - elapsed);
        return (remaining / FISHING_CONSTANTS.BITE_TIMER_DURATION) * 100;
      });
    }, 100);

    return () => {
      clearTimeout(failureTimer);
      clearInterval(biteCheckInterval);
      clearInterval(timerInterval);
    };
  }, [phase, onFailure, isRemotePlayer, totalBiteMultiplier]);

  // Track timer start for countdown
  const timerStartRef = React.useRef(Date.now());
  React.useEffect(() => {
    if (phase === 'waiting') {
      timerStartRef.current = Date.now();
    }
  }, [phase]);

  // NEW: Tension Balance Mini-Game - Main game loop during 'caught' phase
  React.useEffect(() => {
    if (phase !== 'caught' || isRemotePlayer) return;

    const gameLoopInterval = setInterval(() => {
      const deltaTime = 16 / 1000; // 60fps = 16ms
      
      setTension(prev => {
        let newTension = { ...prev };
        
        // 1. Fish pulls on the line (random pull strength and occasional direction changes)
        if (Math.random() < 0.02) { // 2% chance per frame to change behavior
          newTension.fishPullStrength = FISH_PULL_BASE + Math.random() * FISH_PULL_VARIANCE;
          // Occasionally fish swims toward player (reduces tension)
          if (Math.random() < 0.15) {
            newTension.fishPullDirection = -1;
          } else {
            newTension.fishPullDirection = 1;
          }
        }
        
        // Apply fish pull to tension
        const fishPullEffect = newTension.fishPullStrength * newTension.fishPullDirection * deltaTime;
        newTension.currentTension += fishPullEffect;
        
        // 2. Player reeling increases tension, releasing decreases it
        if (newTension.isReeling) {
          newTension.currentTension += REEL_TENSION_RATE * deltaTime;
        } else {
          newTension.currentTension -= SLACK_TENSION_RATE * deltaTime;
        }
        
        // Clamp tension to valid range
        newTension.currentTension = Math.max(0, Math.min(100, newTension.currentTension));
        
        // 3. Move the sweet spot (fish fighting - makes it harder)
        if (Math.random() < 0.03) { // 3% chance per frame to adjust sweet spot
          const moveDirection = Math.random() > 0.5 ? 1 : -1;
          const moveAmount = (Math.random() * SWEET_SPOT_MOVE_SPEED + 10) * moveDirection;
          newTension.sweetSpotCenter = Math.max(
            TENSION_MIN + newTension.sweetSpotWidth / 2,
            Math.min(TENSION_MAX - newTension.sweetSpotWidth / 2, newTension.sweetSpotCenter + moveAmount)
          );
        }
        
        // 4. Sweet spot shrinks as catch progress increases (fish tires but becomes desperate)
        const progressRatio = newTension.catchProgress / CATCH_THRESHOLD;
        newTension.sweetSpotWidth = Math.max(
          SWEET_SPOT_MIN_WIDTH,
          30 - (progressRatio * 15) // Shrinks from 30 to 15 as progress increases
        );
        
        // 5. Check if tension is in sweet spot
        const sweetSpotMin = newTension.sweetSpotCenter - newTension.sweetSpotWidth / 2;
        const sweetSpotMax = newTension.sweetSpotCenter + newTension.sweetSpotWidth / 2;
        const inSweetSpot = newTension.currentTension >= sweetSpotMin && newTension.currentTension <= sweetSpotMax;
        
        // 6. Update progress based on sweet spot status
        if (inSweetSpot) {
          // In sweet spot = gaining catch progress, resetting escape progress
          newTension.catchProgress += CATCH_PROGRESS_RATE * deltaTime;
          newTension.escapeProgress = Math.max(0, newTension.escapeProgress - (ESCAPE_PROGRESS_RATE * 0.5 * deltaTime));
        } else {
          // Out of sweet spot = fish is escaping
          newTension.escapeProgress += ESCAPE_PROGRESS_RATE * deltaTime;
        }
        
        // 7. Check for line break (tension too high)
        if (newTension.currentTension >= TENSION_MAX) {
          setShowResult({ type: 'failure', message: 'Line snapped! Too much tension!' });
          setTimeout(() => onFailure(), 2000);
          return prev; // Don't update, we're done
        }
        
        // 8. Check for fish escape (tension too low for too long, or escape progress full)
        if (newTension.escapeProgress >= ESCAPE_THRESHOLD) {
          setShowResult({ type: 'failure', message: 'Fish got away! Keep tension balanced!' });
          setTimeout(() => onFailure(), 2000);
          return prev;
        }
        
        // 9. Check for successful catch
        if (newTension.catchProgress >= CATCH_THRESHOLD) {
          onSuccess([]);
          return prev;
        }
        
        return newTension;
      });
      
      // Update bobber position based on tension (visual feedback)
      setBobber(prev => {
        const dx = playerX - prev.x;
        const dy = playerY - prev.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
          // Bobber moves toward player when reeling, away when giving slack
          const moveSpeed = tension.isReeling ? 15 : -8;
          const moveX = (dx / distance) * moveSpeed * (16 / 1000);
          const moveY = (dy / distance) * moveSpeed * (16 / 1000);
          
          const newX = prev.x + moveX;
          const newY = prev.y + moveY;
          
          // Check if new position is water
          if (isWaterTile(newX, newY)) {
            return { ...prev, x: newX, y: newY };
          }
        }
        return prev;
      });
    }, 16); // 60fps

    return () => clearInterval(gameLoopInterval);
  }, [phase, playerX, playerY, isWaterTile, onFailure, onSuccess, isRemotePlayer, tension.isReeling]);

  // Handle right-click HOLD for reeling (tension balance system)
  React.useEffect(() => {
    if (phase !== 'caught' || isRemotePlayer) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
        // Start reeling - increase tension
        setTension(prev => ({ ...prev, isReeling: true }));
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 2) {
        event.preventDefault();
        // Stop reeling - decrease tension (give slack)
        setTension(prev => ({ ...prev, isReeling: false }));
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [phase, isRemotePlayer]);

  // Calculate screen positions
  const canvas = gameCanvasRef.current;
  if (!canvas) return null;

  const canvasRect = canvas.getBoundingClientRect();
  
  // Get player direction from the fishing manager props to access localPlayer
  // We'll need to pass localPlayer to FishingSystem to get direction
  const FishingManagerComponent = (props: any) => props.children; // Temporary approach - we need player direction
  
  // Rod offset adjustments to align with fishing rod visually
  const ROD_OFFSET_X = 24; // Base offset to the right
  const ROD_OFFSET_Y = -18; // Offset up to align with rod tip
  
  // Calculate rod tip position based on player direction (from localPlayer prop that we need to add)
  // For now, assume default direction - we'll need to pass player direction through props
  let rodOffsetX = ROD_OFFSET_X;
  let rodOffsetY = ROD_OFFSET_Y;
  
  // Apply direction-based offset mirroring
  switch (playerDirection) {
    case 'left':
      rodOffsetX = -ROD_OFFSET_X; // Mirror horizontally when facing left
      break;
    case 'up':
      rodOffsetX = -ROD_OFFSET_X + 64; // Additional offset to the left when facing up
      rodOffsetY = -ROD_OFFSET_Y - 40; // Additional offset upward when facing up
      break;
    case 'down':
      rodOffsetX = -ROD_OFFSET_X - 18; // Additional offset to the left when facing up
      rodOffsetY = ROD_OFFSET_Y - 2; // Additional offset downward when facing down
      break;
    case 'right':
    default:
      // Use default offsets for right direction
      break;
  }
  
  const playerScreenX = playerX + cameraOffsetX + canvasRect.left + rodOffsetX;
  const playerScreenY = playerY + cameraOffsetY + canvasRect.top + rodOffsetY;
  const bobberScreenX = bobber.x + cameraOffsetX + canvasRect.left;
  const bobberScreenY = bobber.y + cameraOffsetY + canvasRect.top;

  // Calculate line stress based on tension (new system) or distance (fallback)
  const currentDistance = Math.sqrt(
    Math.pow(playerX - bobber.x, 2) + Math.pow(playerY - bobber.y, 2)
  );
  // Use tension for stress visualization in caught phase, distance for waiting phase
  const stressRatio = phase === 'caught' ? tension.currentTension / 100 : currentDistance / FISHING_CONSTANTS.BREAK_DISTANCE;
  
  // Keep fishing line always white as requested
  const lineColor = 'rgba(255, 255, 255, 0.9)';

  // Calculate arc for fishing line when fish is pulling
  const calculateArcPath = () => {
    const dx = bobberScreenX - playerScreenX;
    const dy = bobberScreenY - playerScreenY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Line gets straighter as tension increases (more taut under tension)
    // Base arc when caught, but reduces dramatically as tension increases
    const tensionNormalized = tension.currentTension / 100;
    let arcIntensity = phase === 'caught' ? 0.4 : 0.1;
    if (phase === 'caught') {
      // Reduce arc intensity as tension increases (0.4 at 0% tension → 0.05 at 100% tension)
      arcIntensity = 0.4 * (1 - tensionNormalized * 0.9); // Line gets very straight under high tension
    }
    
    const midX = playerScreenX + dx * 0.5;
    const midY = playerScreenY + dy * 0.5;
    
    // Add perpendicular offset for arc
    const perpX = -dy / distance;
    const perpY = dx / distance;
    let arcOffset = distance * arcIntensity;
    
    // Add line vibration when tension is high (line stress)
    if (phase === 'caught' && tensionNormalized > 0.7) {
      const vibrationIntensity = (tensionNormalized - 0.7) * 20; // Stronger vibration at higher tension
      const vibrationX = (Math.random() - 0.5) * vibrationIntensity;
      const vibrationY = (Math.random() - 0.5) * vibrationIntensity;
      arcOffset += Math.sqrt(vibrationX * vibrationX + vibrationY * vibrationY);
    }
    
    const controlX = midX + perpX * arcOffset;
    const controlY = midY + perpY * arcOffset;
    
    return `M ${playerScreenX} ${playerScreenY} Q ${controlX} ${controlY} ${bobberScreenX} ${bobberScreenY}`;
  };

  return (
    <>
      {/* Fishing line with arc */}
      <svg
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 40,
        }}
      >
        <path
          d={calculateArcPath()}
          stroke={lineColor}
          strokeWidth={stressRatio > 0.7 ? "3" : "2"}
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      
      {/* Bobber */}
      <img
        src={bobberImage}
        alt="Fishing Bobber"
        style={{
          position: 'fixed',
          left: bobberScreenX - 24,
          top: bobberScreenY - 24,
          width: '48px',
          height: '48px',
          pointerEvents: 'none',
          zIndex: 45,
          transform: phase === 'caught' ? 
            `rotate(${15 + (tension.currentTension / 100) * 30}deg)` : 
            'none',
          transition: phase === 'caught' ? 'transform 0.05s ease-out' : 'transform 0.2s ease-out',
          filter: phase === 'caught' ? 
            `drop-shadow(0 0 12px rgba(255, 100, 100, ${0.8 + (tension.currentTension / 100) * 0.2})) drop-shadow(0 0 6px rgba(100, 200, 255, 0.6))` : 
            'drop-shadow(0 0 8px rgba(100, 200, 255, 0.8))',
          animation: phase === 'caught' && tension.currentTension > 60 ? 
            `bobberShake ${0.2 - (tension.currentTension / 100) * 0.1}s infinite` : 'none',
        }}
      />
      
      {/* Result notification */}
      {showResult && (
        <div className={`${styles.resultNotification} ${showResult.type === 'success' ? styles.resultSuccess : styles.resultFailure}`}>
          <span className={styles.resultIcon}>
            {showResult.type === 'success' ? '🎣' : '😞'}
          </span>
          <div>{showResult.type === 'success' ? 'Success!' : 'Fish Lost!'}</div>
          <div className={styles.resultMessage}>{showResult.message}</div>
        </div>
      )}
      
      {/* Fishing UI - SOVA Diegetic Style */}
      {!isRemotePlayer && (
        <div className={styles.fishingPanel}>
          <div className={styles.panelTitle}>
            🎣 {phase === 'waiting' ? 'Waiting for bite...' : 'FISH ON!'}
          </div>
          
          {phase === 'waiting' && (
            <>
              {/* Fishing depth and conditions */}
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>📏 Depth:</span>
                <span className={`${styles.infoValue} ${distanceBiteMultiplier > 1.5 ? styles.infoValueGood : distanceBiteMultiplier > 1.0 ? styles.infoValueMedium : styles.infoValueBad}`}>
                  {Math.round(calculateBobberToShoreDistance(bobber.x, bobber.y, isWaterTile) / 10)}m ({distanceBiteMultiplier.toFixed(1)}x)
                </span>
              </div>
              
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>
                  {worldState?.currentWeather?.tag === 'Clear' && '☀️ Weather:'}
                  {worldState?.currentWeather?.tag === 'LightRain' && '🌦️ Weather:'}
                  {worldState?.currentWeather?.tag === 'ModerateRain' && '🌧️ Weather:'}
                  {worldState?.currentWeather?.tag === 'HeavyRain' && '⛈️ Weather:'}
                  {worldState?.currentWeather?.tag === 'HeavyStorm' && '🌩️ Weather:'}
                  {!worldState?.currentWeather && '☀️ Weather:'}
                </span>
                <span className={`${styles.infoValue} ${rainBiteMultiplier > 2.0 ? styles.infoValueGood : rainBiteMultiplier > 1.0 ? styles.infoValueMedium : ''}`}>
                  {rainBiteMultiplier.toFixed(1)}x
                </span>
              </div>
              
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>🎣 Bite Chance:</span>
                <span className={`${styles.infoValue} ${totalBiteMultiplier > 3.0 ? styles.infoValueGood : totalBiteMultiplier > 1.5 ? styles.infoValueMedium : styles.infoValueBad}`}>
                  {totalBiteMultiplier.toFixed(1)}x
                </span>
              </div>
              
              {/* Timer bar */}
              <div className={styles.meterContainer}>
                <div className={styles.meterLabel}>
                  <span>Bite Timer</span>
                  <span className={styles.meterLabelValue}>{Math.round(timer)}%</span>
                </div>
                <div className={styles.meterTrack}>
                  <div 
                    className={`${styles.meterFill} ${timer > 30 ? styles.meterFillGood : styles.meterFillBad}`}
                    style={{ width: `${timer}%` }}
                  />
                </div>
              </div>
              
              <div className={styles.instructionText}>
                Wait for a bite...
              </div>
            </>
          )}
          
          {phase === 'caught' && (
            <>
              {/* Status text */}
              <div className={`${styles.statusText} ${
                tension.currentTension > 85 ? styles.statusTextDanger : 
                tension.escapeProgress > 50 ? styles.statusTextWarning : ''
              }`}>
                {tension.currentTension > 90 ? '💀 LINE BREAKING!' : 
                 tension.currentTension > 80 ? '⚠️ Too much tension!' :
                 tension.currentTension < 20 ? '⚠️ Give less slack!' :
                 tension.escapeProgress > 70 ? '🐟 Fish escaping!' :
                 '🎣 Keep it in the zone!'}
              </div>
              
              {/* TENSION BALANCE METER - The main mini-game! */}
              <div className={styles.tensionMeterContainer}>
                <div className={styles.meterLabel}>
                  <span>Line Tension</span>
                  <span className={styles.meterLabelValue}>
                    {tension.isReeling ? '🔄 REELING' : '〰️ SLACK'}
                  </span>
                </div>
                <div className={styles.tensionMeterTrack}>
                  {/* Break zone markers */}
                  <div className={`${styles.breakZoneMarker} ${styles.breakZoneMarkerLeft}`} />
                  <div className={`${styles.breakZoneMarker} ${styles.breakZoneMarkerRight}`} />
                  
                  {/* Sweet spot zone */}
                  <div 
                    className={styles.sweetSpotZone}
                    style={{
                      left: `${tension.sweetSpotCenter - tension.sweetSpotWidth / 2}%`,
                      width: `${tension.sweetSpotWidth}%`,
                    }}
                  />
                  
                  {/* Tension indicator (player's current tension) */}
                  <div 
                    className={`${styles.tensionIndicator} ${
                      tension.currentTension > 85 || tension.currentTension < 15 ? styles.tensionIndicatorDanger : ''
                    }`}
                    style={{
                      left: `calc(${tension.currentTension}% - 3px)`,
                    }}
                  />
                </div>
              </div>
              
              {/* Catch Progress */}
              <div className={styles.meterContainer}>
                <div className={styles.meterLabel}>
                  <span>🐟 Catch Progress</span>
                  <span className={styles.meterLabelValue}>{Math.round(tension.catchProgress)}%</span>
                </div>
                <div className={styles.meterTrack}>
                  <div 
                    className={`${styles.meterFill} ${styles.meterFillGood}`}
                    style={{ width: `${tension.catchProgress}%` }}
                  />
                </div>
              </div>
              
              {/* Escape Progress (danger meter) */}
              {tension.escapeProgress > 0 && (
                <div className={styles.meterContainer}>
                  <div className={styles.meterLabel}>
                    <span>⚠️ Escape Risk</span>
                    <span className={styles.meterLabelValue}>{Math.round(tension.escapeProgress)}%</span>
                  </div>
                  <div className={styles.meterTrack}>
                    <div 
                      className={`${styles.meterFill} ${tension.escapeProgress > 70 ? styles.meterFillBad : styles.meterFillMedium}`}
                      style={{ width: `${tension.escapeProgress}%` }}
                    />
                  </div>
                </div>
              )}
              
              <div className={styles.instructionText}>
                <span className={styles.instructionHighlight}>HOLD Right-Click</span> to reel, 
                <span className={styles.instructionHighlight}> RELEASE</span> for slack
              </div>
            </>
          )}
        </div>
      )}

      {/* Add CSS animation for result popup */}
      <style>{`
        @keyframes fadeInScale {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.8);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `}</style>

      {/* Custom shake animation that only translates, no scaling */}
      <style>{`
        @keyframes bobberShake {
          0% { transform: translate(0, 0) rotate(${phase === 'caught' ? 15 + (tension.currentTension / 100) * 30 : 0}deg); }
          25% { transform: translate(2px, -1px) rotate(${phase === 'caught' ? 15 + (tension.currentTension / 100) * 30 : 0}deg); }
          50% { transform: translate(-1px, 2px) rotate(${phase === 'caught' ? 15 + (tension.currentTension / 100) * 30 : 0}deg); }
          75% { transform: translate(-2px, -1px) rotate(${phase === 'caught' ? 15 + (tension.currentTension / 100) * 30 : 0}deg); }
          100% { transform: translate(0, 0) rotate(${phase === 'caught' ? 15 + (tension.currentTension / 100) * 30 : 0}deg); }
        }
      `}</style>

      {/* Add pulse animation for stress indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </>
  );
};



export default FishingManager; 