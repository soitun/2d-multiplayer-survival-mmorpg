import { useRef, useCallback } from 'react';
import { Player } from '../generated';

// Tuned for smooth movement at typical server tick rates (10-20Hz)
// Higher = snappier response but more jitter; Lower = smoother but more latency
const INTERPOLATION_SPEED = 14.0;

// Snap threshold: if display position is within this distance of target, snap directly
// Prevents infinitely chasing sub-pixel differences that cause permanent micro-drift
const SNAP_THRESHOLD = 0.1;

// Teleport threshold: if position jumps more than this, snap instantly (death/respawn/teleport)
const TELEPORT_THRESHOLD = 200;

interface RemotePlayerState {
  lastServerPosition: { x: number; y: number };
  currentDisplayPosition: { x: number; y: number };
  targetPosition: { x: number; y: number };
  lastUpdateTime: number;
}

export const useRemotePlayerInterpolation = () => {
  const remotePlayerStates = useRef<Map<string, RemotePlayerState>>(new Map());
  const lastFrameTime = useRef<number>(performance.now());

  const updateAndGetSmoothedPosition = useCallback((player: Player, localPlayerId?: string): { x: number; y: number } => {
    const playerId = player.identity.toHexString();
    
    // Don't interpolate the local player - they use the prediction system
    if (localPlayerId && playerId === localPlayerId) {
      return { x: player.positionX, y: player.positionY };
    }

    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - lastFrameTime.current) / 1000, 0.1); // Cap at 100ms to prevent huge jumps after tab-away
    lastFrameTime.current = currentTime;

    const serverPosition = { x: player.positionX, y: player.positionY };
    let state = remotePlayerStates.current.get(playerId);

    if (!state) {
      // First time seeing this player - initialize at their server position
      state = {
        lastServerPosition: { ...serverPosition },
        currentDisplayPosition: { ...serverPosition },
        targetPosition: { ...serverPosition },
        lastUpdateTime: currentTime,
      };
      remotePlayerStates.current.set(playerId, state);
      return serverPosition;
    }

    // Check if server position changed (new update received)
    const dx = serverPosition.x - state.lastServerPosition.x;
    const dy = serverPosition.y - state.lastServerPosition.y;
    const positionChanged = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;

    if (positionChanged) {
      // Check for teleport (large instant position change)
      const teleportDist = Math.abs(dx) + Math.abs(dy);
      if (teleportDist > TELEPORT_THRESHOLD) {
        // Snap instantly for teleports/respawns
        state.currentDisplayPosition.x = serverPosition.x;
        state.currentDisplayPosition.y = serverPosition.y;
      }

      // New server update received - start interpolating to new position
      state.lastServerPosition.x = serverPosition.x;
      state.lastServerPosition.y = serverPosition.y;
      state.targetPosition.x = serverPosition.x;
      state.targetPosition.y = serverPosition.y;
      state.lastUpdateTime = currentTime;
    }

    // Smoothly interpolate towards target position using exponential decay
    const interpolationFactor = 1 - Math.exp(-INTERPOLATION_SPEED * deltaTime);
    
    const remainingX = state.targetPosition.x - state.currentDisplayPosition.x;
    const remainingY = state.targetPosition.y - state.currentDisplayPosition.y;

    // Snap to target if close enough (prevents infinite sub-pixel drift)
    if (Math.abs(remainingX) < SNAP_THRESHOLD && Math.abs(remainingY) < SNAP_THRESHOLD) {
      state.currentDisplayPosition.x = state.targetPosition.x;
      state.currentDisplayPosition.y = state.targetPosition.y;
    } else {
      state.currentDisplayPosition.x += remainingX * interpolationFactor;
      state.currentDisplayPosition.y += remainingY * interpolationFactor;
    }

    // Return sub-pixel positions for smooth rendering
    // Canvas handles sub-pixel rendering natively - rounding causes visible stutter
    return {
      x: state.currentDisplayPosition.x,
      y: state.currentDisplayPosition.y
    };
  }, []);

  const cleanupPlayer = useCallback((playerId: string) => {
    remotePlayerStates.current.delete(playerId);
  }, []);

  return {
    updateAndGetSmoothedPosition,
    cleanupPlayer
  };
}; 