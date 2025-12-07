import { useState, useEffect, useRef, useCallback } from 'react';
import { Player, DbConnection, ActiveConsumableEffect, EffectType } from '../generated';
import { usePlayerActions } from '../contexts/PlayerActionsContext';
import { resolveClientCollision, GameEntities } from '../utils/clientCollision';

// Simple client-authoritative movement constants
const POSITION_UPDATE_INTERVAL_MS = 25; // 40fps for better prediction accuracy with high latency
const PLAYER_SPEED = 400; // pixels per second - balanced for 60s world traversal
const SPRINT_MULTIPLIER = 2.0; // 2x speed for sprinting (800 px/s)
// Note: Dodge roll now uses server-authoritative interpolation instead of speed multipliers
const WATER_SPEED_PENALTY = 0.5; // Half speed in water (matches server WATER_SPEED_PENALTY)
const EXHAUSTED_SPEED_PENALTY = 0.75; // 25% speed reduction when exhausted (matches server EXHAUSTED_SPEED_PENALTY)
// REMOVED: Rubber banding constants - proper prediction shouldn't need them

// Helper function to check if a player has the exhausted effect
const hasExhaustedEffect = (connection: DbConnection | null, playerId: string): boolean => {
  if (!connection) return false;
  
  for (const effect of connection.db.activeConsumableEffect.iter()) {
    if (effect.playerId.toHexString() === playerId && effect.effectType.tag === 'Exhausted') {
      return true;
    }
  }
  return false;
};

// Performance monitoring constants
const PERFORMANCE_LOG_INTERVAL = 10000; // Log every 10 seconds
const LAG_SPIKE_THRESHOLD = 20; // More than 20ms is a lag spike for simple operations

// Simple movement input state
interface MovementInputState {
  direction: { x: number; y: number };
  sprinting: boolean;
}

// Simple position sender props
interface SimpleMovementProps {
  connection: DbConnection | null;
  localPlayer: Player | undefined | null;
  inputState: MovementInputState;
  isUIFocused: boolean; // Added for key handling
  entities: GameEntities;
  playerDodgeRollStates?: Map<string, any>; // Add dodge roll states
  mobileSprintOverride?: boolean; // Mobile sprint toggle override (immediate, bypasses server round-trip)
}

// Performance monitoring for simple movement
class SimpleMovementMonitor {
  private updateTimings: number[] = [];
  private lastLogTime = 0;
  private lagSpikes = 0;
  private totalUpdates = 0;
  private sentUpdates = 0;
  private rejectedUpdates = 0;

  logUpdate(updateTime: number, wasSent: boolean, wasRejected = false) {
    this.totalUpdates++;
    if (wasSent) this.sentUpdates++;
    if (wasRejected) this.rejectedUpdates++;
    
    this.updateTimings.push(updateTime);
    
    if (updateTime > LAG_SPIKE_THRESHOLD) {
      this.lagSpikes++;
    }

    const now = Date.now();
    if (now - this.lastLogTime > PERFORMANCE_LOG_INTERVAL) {
      this.reportPerformance();
      this.reset();
      this.lastLogTime = now;
    }
  }

  private reportPerformance() {
    if (this.updateTimings.length === 0) return;

    const avg = this.updateTimings.reduce((a, b) => a + b, 0) / this.updateTimings.length;
    const max = Math.max(...this.updateTimings);
  }

  private reset() {
    this.updateTimings = [];
    this.lagSpikes = 0;
    this.totalUpdates = 0;
    this.sentUpdates = 0;
    this.rejectedUpdates = 0;
  }
}

const movementMonitor = new SimpleMovementMonitor();

// REMOVED: Rubber band logging - proper prediction shouldn't need it

// Simple client-authoritative movement hook with optimized rendering
export const usePredictedMovement = ({ connection, localPlayer, inputState, isUIFocused, entities, playerDodgeRollStates, mobileSprintOverride }: SimpleMovementProps) => {
  // Use refs instead of state to avoid re-renders during movement
  const clientPositionRef = useRef<{ x: number; y: number } | null>(null);
  const serverPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastSentTime = useRef<number>(0);
  const isMoving = useRef(false);
  const lastUpdateTime = useRef<number>(0);
  const pendingPosition = useRef<{ x: number; y: number } | null>(null);
  const lastFacingDirection = useRef<string>('down');
  const wasDeadRef = useRef(localPlayer?.isDead ?? true);
  
  // PERFORMANCE FIX: Removed forceUpdate pattern that caused React render cascades
  // The game canvas has its own RAF loop that reads refs directly
  // We only need to update refs, not trigger React re-renders every frame
  const lastForceUpdateTime = useRef<number>(0);
  const FORCE_UPDATE_INTERVAL_MS = 500; // Only trigger React re-render every 500ms for sound system updates
  const [, forceUpdate] = useState({});
  
  // Track dodge roll collision for smooth stopping
  const dodgeRollCollisionRef = useRef<{ hitAt: number; stopPosition: { x: number; y: number } } | null>(null);

  // Get player actions from context
  const { 
    isAutoWalking, 
    toggleAutoWalk, 
    stopAutoWalk,
    isAutoAttacking,
    toggleAutoAttack,
    jump
  } = usePlayerActions();

  // Add sequence tracking
  const clientSequenceRef = useRef(0n);
  const lastAckedSequenceRef = useRef(0n);

  // Initialize position from server
  useEffect(() => {
    if (localPlayer && !clientPositionRef.current) {
      const serverPos = { x: localPlayer.positionX, y: localPlayer.positionY };
      clientPositionRef.current = serverPos;
      serverPositionRef.current = serverPos;
      pendingPosition.current = serverPos;
      lastFacingDirection.current = localPlayer.direction || 'down';
      wasDeadRef.current = localPlayer.isDead;
      
      // Mark that we need to update components (but don't force React re-render frequently)
      lastForceUpdateTime.current = 0; // Reset to trigger update on next interval check
    }
  }, [localPlayer?.identity]);

  // Listen for server position updates - PROPER CLIENT-SIDE PREDICTION
  useEffect(() => {
    if (!localPlayer || !clientPositionRef.current || !serverPositionRef.current) return;

    const hasRespawned = wasDeadRef.current && !localPlayer.isDead;
    const receivedSequence = localPlayer.clientMovementSequence ?? 0n;
    
    // CRITICAL FIX: Detect sequence reset (respawn) - server resets to 0 when player respawns
    const sequenceReset = receivedSequence === 0n && lastAckedSequenceRef.current > 0n;
    
    if (hasRespawned || sequenceReset) {
      // Player has respawned. The server is now authoritative. Reset client state.
      console.log('[usePredictedMovement] Player respawn detected (hasRespawned:', hasRespawned, 'sequenceReset:', sequenceReset, '). Resetting client position to server position:', localPlayer.positionX, localPlayer.positionY);
      const newServerPos = { x: localPlayer.positionX, y: localPlayer.positionY };

      clientPositionRef.current = { ...newServerPos };
      serverPositionRef.current = { ...newServerPos };
      pendingPosition.current = { ...newServerPos };
      lastFacingDirection.current = localPlayer.direction || 'down';
      
      // Reset sequence numbers to prevent server from ignoring updates
      clientSequenceRef.current = 0n;
      lastAckedSequenceRef.current = 0n;

      // PERFORMANCE: Only trigger occasional React re-renders for non-canvas consumers (sound system)
      const now = performance.now();
      if (now - lastForceUpdateTime.current > FORCE_UPDATE_INTERVAL_MS) {
        lastForceUpdateTime.current = now;
        forceUpdate({});
      }
    } else {
      if (receivedSequence > lastAckedSequenceRef.current) {
        lastAckedSequenceRef.current = receivedSequence;
        const newServerPos = { x: localPlayer.positionX, y: localPlayer.positionY };
        
        // PROPER PREDICTION: Server update is an acknowledgment, not a correction
        // Only update our server reference for future comparisons
        serverPositionRef.current = newServerPos;
        
        // CLIENT STAYS AUTHORITATIVE: No position correction unless there's actual desync
        // The client prediction continues uninterrupted
        
      }
    }
    
    // Update wasDeadRef for the next render cycle
    wasDeadRef.current = localPlayer.isDead;

  }, [localPlayer?.positionX, localPlayer?.positionY, localPlayer?.direction, localPlayer?.isDead]);

  // Optimized position update function
  const updatePosition = useCallback(() => {
    const updateStartTime = performance.now();
    
    try {
      if (!connection || !localPlayer || !clientPositionRef.current) {
        movementMonitor.logUpdate(performance.now() - updateStartTime, false);
        return;
      }

      const now = performance.now();
      const deltaTime = Math.min((now - lastUpdateTime.current) / 1000, 0.1); // Cap delta time
      lastUpdateTime.current = now;

      let { direction, sprinting } = inputState;
      
      // MOBILE FIX: Use mobileSprintOverride when set (immediate, no server round-trip)
      // This allows mobile sprint toggle button to work correctly
      // Falls back to player's database state, then to input state (desktop Shift key)
      if (mobileSprintOverride !== undefined) {
        sprinting = mobileSprintOverride; // Mobile toggle overrides all
      } else if (localPlayer?.isSprinting === true) {
        sprinting = true; // Database sprint state
      }
      // If neither override is set, use inputState.sprinting (already set above)
      
      // Check for active dodge roll and use server-authoritative interpolation
      const playerId = localPlayer.identity.toHexString();
      const dodgeRollState = playerDodgeRollStates?.get(playerId) as any; // Cast to any for clientReceptionTimeMs access
      // CRITICAL FIX: Use clientReceptionTimeMs (when CLIENT received the state) instead of startTimeMs (SERVER timestamp)
      // This fixes production time drift issues where server time != client time
      const dodgeRollStartTime = dodgeRollState?.clientReceptionTimeMs ?? (dodgeRollState ? Number(dodgeRollState.startTimeMs) : 0);
      const dodgeRollElapsedMs = dodgeRollState ? (Date.now() - dodgeRollStartTime) : 0;
      const isDodgeRolling = dodgeRollState && dodgeRollElapsedMs >= 0 && dodgeRollElapsedMs < 500; // 500ms dodge roll duration
      
      if (isDodgeRolling && dodgeRollState) {
        // SERVER-AUTHORITATIVE DODGE ROLL with SMOOTH COLLISION
        const dodgeProgress = Math.min(dodgeRollElapsedMs / 500, 1.0); // 0.0 to 1.0
        
        // Apply easing for more natural dodge roll feel (ease-out quad for quick start, slow end)
        const easedProgress = 1 - Math.pow(1 - dodgeProgress, 2);
        
        // Interpolate between server's start and target positions
        const interpolatedX = dodgeRollState.startX + (dodgeRollState.targetX - dodgeRollState.startX) * easedProgress;
        const interpolatedY = dodgeRollState.startY + (dodgeRollState.targetY - dodgeRollState.startY) * easedProgress;
        
        // Check if we already hit something during this dodge roll
        if (dodgeRollCollisionRef.current && dodgeRollCollisionRef.current.hitAt === dodgeRollStartTime) {
          // We already collided - smoothly decelerate to stop position
          const timeSinceCollision = dodgeRollElapsedMs - (dodgeRollCollisionRef.current.hitAt - dodgeRollStartTime);
          const decelerationDuration = 150; // 150ms smooth stop
          const decelerationProgress = Math.min(timeSinceCollision / decelerationDuration, 1.0);
          
          // Ease-out deceleration (quick at first, slow at end)
          const easedDecel = 1 - Math.pow(1 - decelerationProgress, 3);
          
          // Interpolate from current position to stop position
          const stopPos = dodgeRollCollisionRef.current.stopPosition;
          clientPositionRef.current = {
            x: clientPositionRef.current.x + (stopPos.x - clientPositionRef.current.x) * easedDecel,
            y: clientPositionRef.current.y + (stopPos.y - clientPositionRef.current.y) * easedDecel
          };
          pendingPosition.current = { ...clientPositionRef.current };
        } else {
          // Normal dodge roll - check collision
          const playerId = localPlayer.identity.toHexString();
          const collisionResult = resolveClientCollision(
            clientPositionRef.current.x,
            clientPositionRef.current.y,
            interpolatedX,
            interpolatedY,
            playerId,
            entities
          );
          
          // Check if we hit something
          if (collisionResult.collided) {
            // First collision - record it and start smooth deceleration
            dodgeRollCollisionRef.current = {
              hitAt: dodgeRollStartTime,
              stopPosition: { x: collisionResult.x, y: collisionResult.y }
            };
            // Use collision position for this frame
            clientPositionRef.current = { x: collisionResult.x, y: collisionResult.y };
            pendingPosition.current = { x: collisionResult.x, y: collisionResult.y };
          } else {
            // No collision - continue normal interpolation
            clientPositionRef.current = { x: collisionResult.x, y: collisionResult.y };
            pendingPosition.current = { x: collisionResult.x, y: collisionResult.y };
          }
        }
        
        // Calculate direction for animation purposes (still use server's dodge direction)
        const dodgeRollDx = dodgeRollState.targetX - dodgeRollState.startX;
        const dodgeRollDy = dodgeRollState.targetY - dodgeRollState.startY;
        const dodgeRollMagnitude = Math.sqrt(dodgeRollDx * dodgeRollDx + dodgeRollDy * dodgeRollDy);
        
        if (dodgeRollMagnitude > 0) {
          direction = { 
            x: dodgeRollDx / dodgeRollMagnitude, 
            y: dodgeRollDy / dodgeRollMagnitude 
          };
          
          // Update facing direction for animation
          const movementThreshold = 0.1;
          if (Math.abs(direction.x) > movementThreshold || Math.abs(direction.y) > movementThreshold) {
            lastFacingDirection.current = Math.abs(direction.x) > movementThreshold
              ? (direction.x > 0 ? 'right' : 'left')
              : (direction.y > 0 ? 'down' : 'up');
          }
        }
        
        // PERFORMANCE FIX: Removed per-frame forceUpdate during dodge roll
        // The game canvas reads position from refs directly, no React re-render needed
        // Only update React state occasionally for non-canvas consumers
        const now = performance.now();
        if (now - lastForceUpdateTime.current > FORCE_UPDATE_INTERVAL_MS) {
          lastForceUpdateTime.current = now;
        forceUpdate({});
        }
        
        // Skip normal movement processing during dodge roll
        movementMonitor.logUpdate(now - updateStartTime, true);
        return;
      } else {
        // Dodge roll ended - clear collision tracking
        if (dodgeRollCollisionRef.current) {
          dodgeRollCollisionRef.current = null;
        }
      }
      
      isMoving.current = Math.abs(direction.x) > 0.01 || Math.abs(direction.y) > 0.01;

      // Cancel auto-walk if manual movement detected
      if (isMoving.current && isAutoWalking && !isUIFocused) {
        stopAutoWalk();
      }

      // For knocked out players, also check for facing direction updates even with minimal movement
      const hasDirectionalInput = Math.abs(direction.x) > 0.01 || Math.abs(direction.y) > 0.01;
      
              // Calculate new position with more stable movement
        if (isMoving.current) {
        // Calculate speed multipliers (must match server logic)
        let speedMultiplier = 1.0;
        
        // Apply knocked out movement restriction (must match server)
        if (localPlayer.isKnockedOut) {
          speedMultiplier *= 0.05; // Extremely slow crawling movement (5% of normal speed)
        } else if (sprinting) {
          speedMultiplier *= SPRINT_MULTIPLIER; // 2x speed for sprinting
        }
        // Note: Dodge roll is now handled separately with server-authoritative interpolation above
        
        // Apply crouch speed reduction (must match server)
        if (localPlayer.isCrouching) {
          speedMultiplier *= 0.5; // Half speed when crouching
        }
        
        // Apply exhausted effect speed penalty (must match server)
        if (hasExhaustedEffect(connection, localPlayer.identity.toHexString())) {
          speedMultiplier *= EXHAUSTED_SPEED_PENALTY; // 25% speed reduction when exhausted
        }
        
        // Apply water speed penalty (must match server) - but not while jumping
        const isJumping = localPlayer.jumpStartTimeMs > 0 && 
          (Date.now() - Number(localPlayer.jumpStartTimeMs)) < 500; // 500ms jump duration
        if (localPlayer.isOnWater && !isJumping) {
          speedMultiplier *= WATER_SPEED_PENALTY;
        }
        
        const speed = PLAYER_SPEED * speedMultiplier;
        const moveDistance = speed * deltaTime;
        
        const targetPos = {
          x: clientPositionRef.current.x + direction.x * moveDistance,
          y: clientPositionRef.current.y + direction.y * moveDistance
        };
        
        // Apply client-side collision detection with smooth sliding
        const collisionResult = resolveClientCollision(
          clientPositionRef.current.x,
          clientPositionRef.current.y,
          targetPos.x,
          targetPos.y,
          localPlayer.identity.toHexString(),
          entities
        );
        
        // Update facing direction based on movement
        // For knocked out players, use a lower threshold since they move much slower
        const movementThreshold = localPlayer.isKnockedOut ? 0.01 : 0.1;
        if (Math.abs(direction.x) > movementThreshold || Math.abs(direction.y) > movementThreshold) {
          // Prioritize horizontal movement (left/right) over vertical movement (up/down)
          // This ensures that diagonal movement shows as left/right instead of up/down
          const newFacingDirection = Math.abs(direction.x) > movementThreshold
            ? (direction.x > 0 ? 'right' : 'left')
            : (direction.y > 0 ? 'down' : 'up');
          
          lastFacingDirection.current = newFacingDirection;
        }
        
        // Use collision-resolved position
        clientPositionRef.current = { x: collisionResult.x, y: collisionResult.y };
        pendingPosition.current = { x: collisionResult.x, y: collisionResult.y };
        
        // PERFORMANCE FIX: Only trigger React re-render every 500ms for non-canvas consumers
        // The game canvas reads position from refs directly at 60fps
        if (now - lastForceUpdateTime.current > FORCE_UPDATE_INTERVAL_MS) {
          lastForceUpdateTime.current = now;
          forceUpdate({});
        }
      } else if (localPlayer.isKnockedOut && hasDirectionalInput) {
        // Special case: knocked out players can still update facing direction without significant movement
        // Prioritize horizontal movement (left/right) over vertical movement (up/down)
        const movementThreshold = 0.01; // Lower threshold for knocked out players
        const newFacingDirection = Math.abs(direction.x) > movementThreshold
          ? (direction.x > 0 ? 'right' : 'left')
          : (direction.y > 0 ? 'down' : 'up');
        
        // Only update if facing direction actually changed
        if (newFacingDirection !== lastFacingDirection.current) {
          lastFacingDirection.current = newFacingDirection;
          
          // Force immediate position update for knocked out players when facing direction changes
          const clientTimestamp = BigInt(Date.now());
          try {
            if (connection.reducers.updatePlayerPositionSimple && pendingPosition.current) {
              clientSequenceRef.current += 1n;
              console.log(`[KnockedOut] Facing direction updated to: ${newFacingDirection}`);
              connection.reducers.updatePlayerPositionSimple(
                pendingPosition.current.x,
                pendingPosition.current.y,
                clientTimestamp,
                false, // Never sprinting when knocked out
                lastFacingDirection.current,
                clientSequenceRef.current
              );
              lastSentTime.current = now;
            }
          } catch (error) {
            console.error(`❌ [KnockedOut] Failed to send facing direction update:`, error);
          }
        }
      }
      
      // GUARD: Don't update facing direction when completely idle to prevent cycling
      // Only allow direction updates when there's actual movement input above the threshold
      // This prevents floating-point noise from causing direction cycling when idle

      // Send position update to server at controlled intervals
      const shouldSendUpdate = now - lastSentTime.current >= POSITION_UPDATE_INTERVAL_MS;
      
      if (shouldSendUpdate && pendingPosition.current) {
        const clientTimestamp = BigInt(Date.now());
         
        try {
          if (!connection.reducers.updatePlayerPositionSimple) {
            movementMonitor.logUpdate(performance.now() - updateStartTime, false);
            return;
          }
          
          clientSequenceRef.current += 1n;
          // console.log(`[PREDICT] Sending update with sequence: ${clientSequenceRef.current}`);
          connection.reducers.updatePlayerPositionSimple(
            pendingPosition.current.x,
            pendingPosition.current.y,
            clientTimestamp,
            sprinting && isMoving.current && !localPlayer.isKnockedOut, // Can't sprint when knocked out
            lastFacingDirection.current,
            clientSequenceRef.current
          );
          
          lastSentTime.current = now;
          movementMonitor.logUpdate(performance.now() - updateStartTime, true);
        } catch (error) {
          console.error(`❌ [SimpleMovement] Failed to send position update:`, error);
          movementMonitor.logUpdate(performance.now() - updateStartTime, false);
        }
      } else {
        movementMonitor.logUpdate(performance.now() - updateStartTime, false);
      }

    } catch (error) {
      console.error(`❌ [SimpleMovement] Error in updatePosition:`, error);
      movementMonitor.logUpdate(performance.now() - updateStartTime, false);
    }
  }, [connection, localPlayer, inputState, isAutoWalking, stopAutoWalk, isUIFocused]);

  // Run position updates with optimized timing
  useEffect(() => {
    let animationId: number;
    let lastFrameTime = 0;
    
    const loop = (currentTime: number) => {
      // Throttle to ~60fps to prevent excessive updates
      if (currentTime - lastFrameTime >= 16) {
        updatePosition();
        lastFrameTime = currentTime;
      }
      animationId = requestAnimationFrame(loop);
    };
    
    lastUpdateTime.current = performance.now();
    animationId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [updatePosition]);

  // ADDED: Function to get the EXACT position at this moment (not cached from last frame)
  // This is critical for accurate projectile spawning during fast movement
  const getCurrentPositionNow = useCallback((): { x: number; y: number } | null => {
    if (!clientPositionRef.current || !localPlayer) {
      return clientPositionRef.current;
    }

    const now = performance.now();
    const deltaTime = (now - lastUpdateTime.current) / 1000; // seconds since last frame
    
    // Check if we're in a dodge roll
    const playerId = localPlayer.identity.toHexString();
    const dodgeRollState = playerDodgeRollStates?.get(playerId) as any;
    const dodgeRollStartTime = dodgeRollState?.clientReceptionTimeMs ?? (dodgeRollState ? Number(dodgeRollState.startTimeMs) : 0);
    const dodgeRollElapsedMs = dodgeRollState ? (Date.now() - dodgeRollStartTime) : 0;
    const isDodgeRolling = dodgeRollState && dodgeRollElapsedMs >= 0 && dodgeRollElapsedMs < 500;
    
    if (isDodgeRolling && dodgeRollState) {
      // Calculate exact dodge roll position at this moment
      const dodgeProgress = Math.min(dodgeRollElapsedMs / 500, 1.0);
      const easedProgress = 1 - Math.pow(1 - dodgeProgress, 2); // ease-out quad
      
      return {
        x: dodgeRollState.startX + (dodgeRollState.targetX - dodgeRollState.startX) * easedProgress,
        y: dodgeRollState.startY + (dodgeRollState.targetY - dodgeRollState.startY) * easedProgress
      };
    }
    
    // For normal movement, extrapolate from last known position
    const { direction, sprinting } = inputState;
    const isActuallyMoving = direction.x !== 0 || direction.y !== 0;
    
    if (!isActuallyMoving || deltaTime <= 0 || deltaTime > 0.1) {
      // Not moving or stale data - return cached position
      return clientPositionRef.current;
    }
    
    // Calculate speed (same logic as updatePosition)
    let speed = PLAYER_SPEED;
    if (sprinting) speed *= SPRINT_MULTIPLIER;
    if (localPlayer.isOnWater) speed *= WATER_SPEED_PENALTY;
    if (hasExhaustedEffect(connection, playerId)) speed *= EXHAUSTED_SPEED_PENALTY;
    
    // Extrapolate position based on time since last frame
    const moveDistance = speed * deltaTime;
    
    return {
      x: clientPositionRef.current.x + direction.x * moveDistance,
      y: clientPositionRef.current.y + direction.y * moveDistance
    };
  }, [localPlayer, inputState, playerDodgeRollStates, connection]);

  // Return the current position and state
  return { 
    predictedPosition: clientPositionRef.current,
    getCurrentPositionNow, // ADDED: Function for exact position at firing time
    isAutoWalking,
    isAutoAttacking,
    facingDirection: lastFacingDirection.current
  };
}; 