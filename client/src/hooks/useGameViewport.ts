/**
 * useGameViewport - Canvas size and camera offset for game rendering.
 *
 * Manages the game canvas dimensions (full window) and computes camera offset so
 * the camera follows the local player. Used by GameCanvas for rendering and
 * viewport calculations.
 *
 * Responsibilities:
 * 1. CANVAS SIZE: Tracks window innerWidth/innerHeight. Updates on resize.
 *
 * 2. CAMERA OFFSET: Centers camera on smoothedPosition (from usePredictedMovement)
 *    or fallback to localPlayer position. cameraOffsetX/Y = canvasCenter - playerPos.
 *
 * 3. SMOOTH FOLLOWING: When smoothedPosition is provided, camera follows predicted
 *    movement for smooth panning without server round-trip delay.
 */

import { useState, useEffect, useMemo } from 'react';
import { Player as SpacetimeDBPlayer } from '../generated'; // Import Player type

interface GameViewportResult {
  canvasSize: { width: number; height: number };
  cameraOffsetX: number;
  cameraOffsetY: number;
}

/**
 * Manages canvas size based on window dimensions and calculates camera offset.
 * @param localPlayer - The current local player data, or null/undefined if not available.
 * @param smoothedPosition - The smoothed/predicted position to center the camera on.
 */
export function useGameViewport(
    localPlayer: SpacetimeDBPlayer | null | undefined,
    smoothedPosition?: { x: number; y: number } | null
): GameViewportResult {
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Effect to handle window resizing
  useEffect(() => {
    const handleResize = () => {
      setCanvasSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    // Call handler once initially to set size
    // handleResize(); // Removed, useState initial value handles this

    // Cleanup listener on component unmount
    return () => window.removeEventListener('resize', handleResize);
  }, []); // Empty dependency array means this effect runs once on mount and cleanup on unmount

  // Calculate camera offset based on smoothed position (if available) or fallback to player position
  const cameraOffsetX = useMemo(() => {
    if (!localPlayer) return 0;
    const targetX = smoothedPosition ? smoothedPosition.x : localPlayer.positionX;
    return canvasSize.width / 2 - targetX;
  }, [localPlayer, smoothedPosition, canvasSize.width]);

  const cameraOffsetY = useMemo(() => {
    if (!localPlayer) return 0;
    const targetY = smoothedPosition ? smoothedPosition.y : localPlayer.positionY;
    return canvasSize.height / 2 - targetY;
  }, [localPlayer, smoothedPosition, canvasSize.height]);

  return {
    canvasSize,
    cameraOffsetX,
    cameraOffsetY,
  };
} 