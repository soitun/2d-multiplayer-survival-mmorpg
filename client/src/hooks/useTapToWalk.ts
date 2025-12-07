import { useState, useEffect, useRef, useCallback } from 'react';

// Distance threshold to consider "arrived" at destination (in world pixels)
const ARRIVAL_THRESHOLD = 16;

// Animation duration in milliseconds
const TAP_ANIMATION_DURATION = 500;

export interface TapToWalkState {
  // Target position in world coordinates
  targetPosition: { x: number; y: number } | null;
  // Whether to show the tap animation
  showAnimation: boolean;
  // Animation progress from 0 to 1
  animationProgress: number;
  // Current movement direction (normalized)
  direction: { x: number; y: number };
  // Whether we're actively moving to a target
  isMovingToTarget: boolean;
}

export interface TapToWalkProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  playerPosition: { x: number; y: number } | null;
  cameraOffset: { x: number; y: number };
  isMobile: boolean;
  isEnabled: boolean; // Can be disabled during UI interactions
}

/**
 * Hook for tap-to-walk mobile controls
 * Handles touch input on canvas and calculates movement direction to destination
 */
export const useTapToWalk = ({
  canvasRef,
  playerPosition,
  cameraOffset,
  isMobile,
  isEnabled,
}: TapToWalkProps): TapToWalkState => {
  // Target position in world coordinates
  const [targetPosition, setTargetPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Animation state
  const [showAnimation, setShowAnimation] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0);
  
  // Movement direction
  const [direction, setDirection] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Track if we're actively moving
  const [isMovingToTarget, setIsMovingToTarget] = useState(false);
  
  // Animation timing refs
  const animationStartTime = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Convert screen position to world position
  const screenToWorld = useCallback((screenX: number, screenY: number): { x: number; y: number } => {
    // Screen position + camera offset = world position
    return {
      x: screenX + cameraOffset.x,
      y: screenY + cameraOffset.y,
    };
  }, [cameraOffset]);

  // Handle tap/touch on canvas
  const handleTap = useCallback((screenX: number, screenY: number) => {
    if (!isEnabled || !playerPosition) return;

    const worldPos = screenToWorld(screenX, screenY);
    
    // Set the new target
    setTargetPosition(worldPos);
    setIsMovingToTarget(true);
    
    // Start tap animation
    setShowAnimation(true);
    setAnimationProgress(0);
    animationStartTime.current = performance.now();
  }, [isEnabled, playerPosition, screenToWorld]);

  // Cancel movement (e.g., when player taps elsewhere or UI opens)
  const cancelMovement = useCallback(() => {
    setTargetPosition(null);
    setDirection({ x: 0, y: 0 });
    setIsMovingToTarget(false);
  }, []);

  // Update direction based on current player position and target
  useEffect(() => {
    if (!targetPosition || !playerPosition || !isMovingToTarget) {
      return;
    }

    // Calculate vector from player to target
    const dx = targetPosition.x - playerPosition.x;
    const dy = targetPosition.y - playerPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check if we've arrived
    if (distance <= ARRIVAL_THRESHOLD) {
      setTargetPosition(null);
      setDirection({ x: 0, y: 0 });
      setIsMovingToTarget(false);
      return;
    }

    // Normalize direction
    const normalizedDirection = {
      x: dx / distance,
      y: dy / distance,
    };

    setDirection(normalizedDirection);
  }, [targetPosition, playerPosition, isMovingToTarget]);

  // Animation loop for tap indicator
  useEffect(() => {
    if (!showAnimation) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const animate = () => {
      const elapsed = performance.now() - animationStartTime.current;
      const progress = Math.min(elapsed / TAP_ANIMATION_DURATION, 1);
      
      setAnimationProgress(progress);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setShowAnimation(false);
        setAnimationProgress(0);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [showAnimation]);

  // Touch event handlers
  useEffect(() => {
    if (!isMobile || !canvasRef.current) return;

    const canvas = canvasRef.current;

    const handleTouchStart = (e: TouchEvent) => {
      if (!isEnabled) return;
      
      // Only handle single touch for movement
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      
      // Get position relative to canvas
      const screenX = touch.clientX - rect.left;
      const screenY = touch.clientY - rect.top;

      handleTap(screenX, screenY);
      
      // Prevent default to avoid scrolling
      e.preventDefault();
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent scrolling while touching canvas
      if (isEnabled) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = (_e: TouchEvent) => {
      // Movement continues until arrival - don't cancel on touch end
    };

    // Add touch event listeners with passive: false to allow preventDefault
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, canvasRef, isEnabled, handleTap]);

  // Cancel movement when disabled
  useEffect(() => {
    if (!isEnabled) {
      cancelMovement();
    }
  }, [isEnabled, cancelMovement]);

  return {
    targetPosition,
    showAnimation,
    animationProgress,
    direction,
    isMovingToTarget,
  };
};

export default useTapToWalk;

