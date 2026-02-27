/**
 * useMovementInput - Keyboard and mobile input state for player movement.
 *
 * Tracks WASD direction and sprint state. Exposes both React state (for UI that
 * needs re-renders) and a ref (for the RAF loop in usePredictedMovement to read
 * without state delay). Supports mobile tap-to-walk and sprint override.
 *
 * Responsibilities:
 * 1. KEYBOARD: Listens for keydown/keyup on WASD and Shift. Updates direction
 *    vector and sprinting flag. Ignores input when isUIFocused (chat, inventory).
 *
 * 2. REF + STATE: inputStateRef is updated immediately for usePredictedMovement's
 *    RAF loop. inputState triggers re-renders when needed (e.g., sprint indicator).
 *
 * 3. MOBILE: Tap-to-walk and mobile sprint override when on touch devices.
 *
 * Performance: Ref-based reading avoids React batching delay; movement feels
 * responsive even when other state updates are batched.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Player } from '../generated/types';
import { usePlayerActions } from '../contexts/PlayerActionsContext';

// Convert player facing direction string to normalized movement vector
const getDirectionVector = (facingDirection: string): { x: number; y: number } => {
  switch (facingDirection?.toLowerCase()) {
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
};

// Movement input state
export interface MovementInputState {
  direction: { x: number; y: number };
  sprinting: boolean;
}

interface MovementInputProps {
  isUIFocused: boolean;
  localPlayer?: Player | null;
  onToggleAutoAttack?: () => void;
  isFishing?: boolean;
}

export const useMovementInput = ({ 
  isUIFocused, 
  localPlayer,
  onToggleAutoAttack,
  isFishing = false
}: MovementInputProps) => {
  // PERFORMANCE FIX: Use ref for immediate input reading (no React state delay)
  // The RAF loop in usePredictedMovement reads this directly
  const inputStateRef = useRef<MovementInputState>({
    direction: { x: 0, y: 0 },
    sprinting: false
  });
  
  // React state is only for components that need to re-render on input changes (rare)
  const [inputState, setInputState] = useState<MovementInputState>({
    direction: { x: 0, y: 0 },
    sprinting: false
  });

  // Auto-walk state
  const [isAutoWalking, setIsAutoWalking] = useState(false);
  const autoWalkDirection = useRef<{ x: number; y: number } | null>(null);
  const autoWalkSprinting = useRef<boolean>(false);

  const keysPressed = useRef(new Set<string>());
  const lastInputTime = useRef(0);
  const isProcessingInput = useRef(false);
  const lastComputedStateRef = useRef<MovementInputState>({ direction: { x: 0, y: 0 }, sprinting: false });

  const { jump } = usePlayerActions();

  // Key processing with auto-walk support
  const processKeys = useCallback(() => {
    try {
      if (isProcessingInput.current) {
        return;
      }
      isProcessingInput.current = true;

      if (isUIFocused) {
        return;
      }

      let x = 0, y = 0;
      
      // Sprinting logic: if auto-walking, use persisted sprint state; otherwise use current shift keys
      let sprinting = keysPressed.current.has('ShiftLeft') || keysPressed.current.has('ShiftRight');
      if (isAutoWalking) {
        // Use persisted sprint state (toggled via SHIFT key press)
        sprinting = autoWalkSprinting.current;
      }

      // Check if any movement keys are pressed
      const hasMovementKeys = keysPressed.current.has('KeyW') || keysPressed.current.has('KeyS') || 
                             keysPressed.current.has('KeyA') || keysPressed.current.has('KeyD') ||
                             keysPressed.current.has('ArrowUp') || keysPressed.current.has('ArrowDown') ||
                             keysPressed.current.has('ArrowLeft') || keysPressed.current.has('ArrowRight');

      // Fast idle path: nothing pressed and no auto-walk, skip all work if already idle.
      if (!hasMovementKeys && !isAutoWalking) {
        const last = lastComputedStateRef.current;
        if (last.direction.x === 0 && last.direction.y === 0 && !last.sprinting) {
          return;
        }
      }

      if (hasMovementKeys) {
        // Manual input - calculate from keys
        if (keysPressed.current.has('KeyW') || keysPressed.current.has('ArrowUp')) y -= 1;
        if (keysPressed.current.has('KeyS') || keysPressed.current.has('ArrowDown')) y += 1;
        if (keysPressed.current.has('KeyA') || keysPressed.current.has('ArrowLeft')) x -= 1;
        if (keysPressed.current.has('KeyD') || keysPressed.current.has('ArrowRight')) x += 1;

        // Normalize diagonal movement
        if (x !== 0 && y !== 0) {
          const magnitude = Math.sqrt(x * x + y * y);
          x = x / magnitude;
          y = y / magnitude;
        }

        // Manual keys override auto-walk direction, but don't update stored direction
        // Direction updates happen in handleKeyDown when keys are first pressed
      } else if (isAutoWalking && autoWalkDirection.current) {
        // No keys pressed but auto-walk is on - use stored direction
        x = autoWalkDirection.current.x;
        y = autoWalkDirection.current.y;
      } else {
        // No keys and no auto-walk
        x = 0;
        y = 0;
      }

      // Round to prevent micro-jitter
      const roundedX = Math.abs(x) < 0.001 ? 0 : Number(x.toFixed(3));
      const roundedY = Math.abs(y) < 0.001 ? 0 : Number(y.toFixed(3));
      
      const newState = { 
        direction: { x: roundedX, y: roundedY }, 
        sprinting 
      };
      const lastState = lastComputedStateRef.current;
      
      // Check if state changed
      const hasStateChanged = Math.abs(newState.direction.x - lastState.direction.x) > 0.01 || 
                             Math.abs(newState.direction.y - lastState.direction.y) > 0.01 || 
                             newState.sprinting !== lastState.sprinting;
      
      if (hasStateChanged) {
        lastComputedStateRef.current = newState;
        
        // PERFORMANCE FIX: Update ref IMMEDIATELY (no React delay)
        // This is what usePredictedMovement's RAF loop reads from
        inputStateRef.current = newState;
        
        // React state update can be slightly delayed (for UI components that need it)
        setInputState(newState);
      } else {
      }

    } catch (error) {
      console.error(`❌ [MovementInput] Error in processKeys:`, error);
    } finally {
      isProcessingInput.current = false;
    }
  }, [isUIFocused, isAutoWalking]);

  // PERFORMANCE FIX: Removed 20ms throttle - was causing input lag
  // The RAF loop in usePredictedMovement already runs at 60fps, so throttling here is unnecessary
  // and only adds delay between key press and movement
  const throttledProcessKeys = useCallback(() => {
    processKeys();
  }, [processKeys]);

  // Key down handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    try {
      if (isUIFocused) {
        return;
      }

      const key = event.code;
      
      // Space: Jump/Dodge Roll - DISABLED in useMovementInput
      // This is now handled entirely by useInputHandler to avoid duplicate handling
      // and to properly support auto-walk dodge rolls
      if (key === 'Space') {
        event.preventDefault();
        
        if (isFishing) {
          event.stopPropagation();
          event.stopImmediatePropagation();
          return;
        }
        
        // Let useInputHandler handle spacebar for jump/dodge roll
        // Do NOT handle it here to avoid conflicts with auto-walk
        return;
      }
      
      // Q: Toggle auto-walk
      if (key === 'KeyQ') {
        event.preventDefault();

        if (isAutoWalking) {
          // Turn OFF
          setIsAutoWalking(false);
          autoWalkDirection.current = null;
          autoWalkSprinting.current = false;
          throttledProcessKeys();
        } else {
          // Turn ON - start with facing direction, user can change direction while auto-walking
          let currentX = 0, currentY = 0;

          // Use facing direction as default
          if (localPlayer?.direction) {
            const facingVec = getDirectionVector(localPlayer.direction);
            currentX = facingVec.x;
            currentY = facingVec.y;
          }

          if (currentX !== 0 || currentY !== 0) {
            setIsAutoWalking(true);
            autoWalkDirection.current = { x: currentX, y: currentY };

            // Update state
            const newState = {
              direction: { x: currentX, y: currentY },
              sprinting: keysPressed.current.has('ShiftLeft') || keysPressed.current.has('ShiftRight')
            };
            // PERFORMANCE FIX: Update ref immediately
            inputStateRef.current = newState;
            setInputState(newState);
          } else {
          }
        }
        return;
      }

      // Z: Auto-attack
      if (key === 'KeyZ') {
        event.preventDefault();
        onToggleAutoAttack?.();
        return;
      }

      // Movement keys
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(key)) {
        if (!keysPressed.current.has(key)) {
          keysPressed.current.add(key);

          // 🔥 AUTO-WALK: If auto-walk is ON and SHIFT is pressed, toggle sprint
          if (isAutoWalking && (key === 'ShiftLeft' || key === 'ShiftRight')) {
            autoWalkSprinting.current = !autoWalkSprinting.current;
            throttledProcessKeys();
            return;
          }

          // 🔥 AUTO-WALK: If auto-walk is ON and a movement key is pressed, update direction
          if (isAutoWalking && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
            // Calculate direction from all currently pressed movement keys
            let dirX = 0, dirY = 0;
            if (keysPressed.current.has('KeyW') || keysPressed.current.has('ArrowUp')) dirY -= 1;
            if (keysPressed.current.has('KeyS') || keysPressed.current.has('ArrowDown')) dirY += 1;
            if (keysPressed.current.has('KeyA') || keysPressed.current.has('ArrowLeft')) dirX -= 1;
            if (keysPressed.current.has('KeyD') || keysPressed.current.has('ArrowRight')) dirX += 1;

            // Normalize if diagonal
            if (dirX !== 0 && dirY !== 0) {
              const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
              dirX = dirX / magnitude;
              dirY = dirY / magnitude;
            }

            const roundedX = Math.abs(dirX) < 0.001 ? 0 : Number(dirX.toFixed(3));
            const roundedY = Math.abs(dirY) < 0.001 ? 0 : Number(dirY.toFixed(3));

            if (roundedX !== 0 || roundedY !== 0) {
              autoWalkDirection.current = { x: roundedX, y: roundedY };
            }
          }

          throttledProcessKeys();
        }
      }
    } catch (error) {
      console.error(`❌ [MovementInput] Error in handleKeyDown:`, error);
    }
  }, [isUIFocused, throttledProcessKeys, jump, onToggleAutoAttack, isFishing, isAutoWalking, localPlayer]);

  // Key up handler
  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    try {
      const key = event.code;
      if (keysPressed.current.has(key)) {
        keysPressed.current.delete(key);
        // Process immediately on key release
        processKeys();
      }
    } catch (error) {
      console.error(`❌ [MovementInput] Error in handleKeyUp:`, error);
    }
  }, [processKeys]);

  // Event listeners
  useEffect(() => {
    try {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('keyup', handleKeyUp);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
      };
    } catch (error) {
      console.error(`❌ [MovementInput] Error in event listener setup:`, error);
    }
  }, [handleKeyDown, handleKeyUp]);

  // Clear on UI focus
  useEffect(() => {
    if (isUIFocused) {
      keysPressed.current.clear();
      setIsAutoWalking(false);
      autoWalkDirection.current = null;
      autoWalkSprinting.current = false;
      
      const clearedState = {
        direction: { x: 0, y: 0 },
        sprinting: false
      };
      
      // PERFORMANCE FIX: Clear ref immediately too
      inputStateRef.current = clearedState;
      setInputState(clearedState);
    }
  }, [isUIFocused]);

  return { 
    inputState,
    // PERFORMANCE FIX: Export ref for immediate input reading in RAF loops
    // usePredictedMovement should read from this ref, not the React state prop
    inputStateRef,
    processMovement: processKeys,
    isAutoWalking
  };
};
