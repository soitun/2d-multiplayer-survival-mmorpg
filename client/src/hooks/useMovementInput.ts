import { useState, useEffect, useRef, useCallback } from 'react';
import { Player } from '../generated';
import { usePlayerActions } from '../contexts/PlayerActionsContext';

// Performance monitoring constants
const INPUT_LAG_THRESHOLD = 10; // More than 10ms for input processing is concerning
const INPUT_LOG_INTERVAL = 10000; // Log every 10 seconds

// Performance monitoring for input system
class InputPerformanceMonitor {
  private inputTimings: number[] = [];
  private lastLogTime = 0;
  private lagSpikes = 0;
  private totalInputs = 0;
  private skippedInputs = 0;

  logInputTime(inputTime: number, inputType: string) {
    this.totalInputs++;
    this.inputTimings.push(inputTime);
    
    if (inputTime > INPUT_LAG_THRESHOLD) {
      this.lagSpikes++;
    }

    const now = Date.now();
    if (now - this.lastLogTime > INPUT_LOG_INTERVAL) {
      this.reportPerformance();
      this.reset();
      this.lastLogTime = now;
    }
  }

  logSkippedInput(reason: string) {
    this.skippedInputs++;
  }

  private reportPerformance() {
    if (this.inputTimings.length === 0) return;
    const avg = this.inputTimings.reduce((a, b) => a + b, 0) / this.inputTimings.length;
    const max = Math.max(...this.inputTimings);
  }

  private reset() {
    this.inputTimings = [];
    this.lagSpikes = 0;
    this.totalInputs = 0;
    this.skippedInputs = 0;
  }
}

const inputMonitor = new InputPerformanceMonitor();

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
  const [inputState, setInputState] = useState<MovementInputState>({
    direction: { x: 0, y: 0 },
    sprinting: false
  });

  // Auto-walk state
  const [isAutoWalking, setIsAutoWalking] = useState(false);
  const autoWalkDirection = useRef<{ x: number; y: number } | null>(null);
  const autoWalkSprinting = useRef<boolean>(false);

  // Performance monitoring references
  const keysPressed = useRef(new Set<string>());
  const lastInputTime = useRef(0);
  const isProcessingInput = useRef(false);
  const lastComputedStateRef = useRef<MovementInputState>({ direction: { x: 0, y: 0 }, sprinting: false });

  const { jump } = usePlayerActions();

  // Key processing with auto-walk support
  const processKeys = useCallback(() => {
    const processStartTime = performance.now();
    
    try {
      if (isProcessingInput.current) {
        inputMonitor.logSkippedInput('Already processing input');
        return;
      }
      isProcessingInput.current = true;

      if (isUIFocused) {
        inputMonitor.logSkippedInput('UI focused');
        return;
      }

      let x = 0, y = 0;
      
      // Sprinting logic: if auto-walking, persist sprint state; otherwise use current shift keys
      let sprinting = keysPressed.current.has('ShiftLeft') || keysPressed.current.has('ShiftRight');
      if (isAutoWalking) {
        if (sprinting) {
          // Shift is pressed - update persisted sprint state
          autoWalkSprinting.current = true;
        } else {
          // Shift not pressed - use persisted sprint state
          sprinting = autoWalkSprinting.current;
        }
      }

      // Check if any movement keys are pressed
      const hasMovementKeys = keysPressed.current.has('KeyW') || keysPressed.current.has('KeyS') || 
                             keysPressed.current.has('KeyA') || keysPressed.current.has('KeyD') ||
                             keysPressed.current.has('ArrowUp') || keysPressed.current.has('ArrowDown') ||
                             keysPressed.current.has('ArrowLeft') || keysPressed.current.has('ArrowRight');

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
        console.log(`🚶 [AUTO-WALK ACTIVE] Using direction: (${x.toFixed(3)}, ${y.toFixed(3)})`);
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
        setInputState(newState);
      } else {
        inputMonitor.logSkippedInput('No state change');
      }

    } catch (error) {
      console.error(`❌ [MovementInput] Error in processKeys:`, error);
    } finally {
      isProcessingInput.current = false;
      const processTime = performance.now() - processStartTime;
      inputMonitor.logInputTime(processTime, 'processKeys');
    }
  }, [isUIFocused, isAutoWalking]);

  // Throttled version
  const throttledProcessKeys = useCallback(() => {
    const now = performance.now();
    if (now - lastInputTime.current < 20) {
      inputMonitor.logSkippedInput('Throttled input');
      return;
    }
    lastInputTime.current = now;
    processKeys();
  }, [processKeys]);

  // Key down handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const keyStartTime = performance.now();
    
    try {
      if (isUIFocused) {
        inputMonitor.logSkippedInput('KeyDown - UI focused');
        return;
      }

      const key = event.code;
      
      // Space: Jump
      if (key === 'Space') {
        event.preventDefault();
        
        if (isFishing) {
          console.log('[MovementInput] Jump blocked - player is fishing');
          event.stopPropagation();
          event.stopImmediatePropagation();
          return;
        }
        
        const isMoving = keysPressed.current.has('KeyW') || keysPressed.current.has('KeyS') || 
                        keysPressed.current.has('KeyA') || keysPressed.current.has('KeyD');
        
        if (isMoving) {
          let dodgeX = 0, dodgeY = 0;
          if (keysPressed.current.has('KeyW')) dodgeY -= 1;
          if (keysPressed.current.has('KeyS')) dodgeY += 1;
          if (keysPressed.current.has('KeyA')) dodgeX -= 1;
          if (keysPressed.current.has('KeyD')) dodgeX += 1;
          
          if (dodgeX !== 0 || dodgeY !== 0) {
            const magnitude = Math.sqrt(dodgeX * dodgeX + dodgeY * dodgeY);
            dodgeX /= magnitude;
            dodgeY /= magnitude;
          }
        } else {
          jump();
        }
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
          console.log(`🚶 [AUTO-WALK OFF]`);
          throttledProcessKeys();
        } else {
          // Turn ON - start with facing direction, user can change direction while auto-walking
          let currentX = 0, currentY = 0;

          // Use facing direction as default
          if (localPlayer?.direction) {
            const facingVec = getDirectionVector(localPlayer.direction);
            currentX = facingVec.x;
            currentY = facingVec.y;
            console.log(`🔍 [Q PRESSED] Starting with facing direction: (${currentX}, ${currentY})`);
          }

          if (currentX !== 0 || currentY !== 0) {
            setIsAutoWalking(true);
            autoWalkDirection.current = { x: currentX, y: currentY };
            console.log(`🚶 [AUTO-WALK ON] Stored direction: (${currentX}, ${currentY}), isDiagonal: ${currentX !== 0 && currentY !== 0}`);

            // Update state
            setInputState({
              direction: { x: currentX, y: currentY },
              sprinting: keysPressed.current.has('ShiftLeft') || keysPressed.current.has('ShiftRight')
            });
          } else {
            console.log(`🚶 [AUTO-WALK] Cannot enable - no direction`);
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
              console.log(`🔄 [AUTO-WALK UPDATED] Direction changed to: (${roundedX.toFixed(3)}, ${roundedY.toFixed(3)}), isDiagonal: ${roundedX !== 0 && roundedY !== 0}`);
            }
          }

          throttledProcessKeys();
        }
      }
    } catch (error) {
      console.error(`❌ [MovementInput] Error in handleKeyDown:`, error);
    } finally {
      const keyTime = performance.now() - keyStartTime;
      inputMonitor.logInputTime(keyTime, `KeyDown-${event.code}`);
    }
  }, [isUIFocused, throttledProcessKeys, jump, onToggleAutoAttack, isFishing, isAutoWalking, localPlayer]);

  // Key up handler
  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    const keyStartTime = performance.now();
    
    try {
      const key = event.code;
      if (keysPressed.current.has(key)) {
        keysPressed.current.delete(key);
        // Process immediately on key release
        processKeys();
      }
    } catch (error) {
      console.error(`❌ [MovementInput] Error in handleKeyUp:`, error);
    } finally {
      const keyTime = performance.now() - keyStartTime;
      inputMonitor.logInputTime(keyTime, `KeyUp-${event.code}`);
    }
  }, [processKeys]);

  // Event listeners
  useEffect(() => {
    const setupStartTime = performance.now();
    
    try {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('keyup', handleKeyUp);

      const setupTime = performance.now() - setupStartTime;
      if (setupTime > 5) {
        // console.warn(`🐌 [MovementInput] Slow event listener setup: ${setupTime.toFixed(2)}ms`);
      }

      return () => {
        const cleanupStartTime = performance.now();
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
        const cleanupTime = performance.now() - cleanupStartTime;
        
        if (cleanupTime > 5) {
          // console.warn(`🐌 [MovementInput] Slow event listener cleanup: ${cleanupTime.toFixed(2)}ms`);
        }
      };
    } catch (error) {
      console.error(`❌ [MovementInput] Error in event listener setup:`, error);
    }
  }, [handleKeyDown, handleKeyUp]);

  // Clear on UI focus
  useEffect(() => {
    if (isUIFocused) {
      const clearStartTime = performance.now();
      
      keysPressed.current.clear();
      setIsAutoWalking(false);
      autoWalkDirection.current = null;
      autoWalkSprinting.current = false;
      setInputState({
        direction: { x: 0, y: 0 },
        sprinting: false
      });
      
      const clearTime = performance.now() - clearStartTime;
      if (clearTime > 5) {
        // console.warn(`🐌 [MovementInput] Slow input clear: ${clearTime.toFixed(2)}ms`);
      }
    }
  }, [isUIFocused]);

  return { 
    inputState, 
    processMovement: processKeys,
    isAutoWalking
  };
};
