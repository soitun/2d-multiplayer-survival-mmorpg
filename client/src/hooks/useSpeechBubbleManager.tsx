import { useGameViewport } from './useGameViewport';
import { Player as SpacetimeDBPlayer } from '../generated/types';

interface SpeechBubbleManagerHookResult {
  cameraOffsetX: number;
  cameraOffsetY: number;
}

/**
 * Custom hook that manages the speech bubble system and provides camera offsets.
 * This centralizes both the camera offset logic and bubble management.
 * 
 * IMPORTANT: Must receive the same predictedPosition that GameCanvas uses
 * to ensure the speech bubble camera offset matches the canvas camera offset exactly.
 * Without this, speech bubbles would be offset from their players when the local
 * player is moving (because the camera would track different positions).
 */
export function useSpeechBubbleManager(
  localPlayer: SpacetimeDBPlayer | null | undefined,
  predictedPosition?: { x: number; y: number } | null
): SpeechBubbleManagerHookResult {
  // Reuse the existing viewport hook for camera offsets
  // Pass predictedPosition to match GameCanvas camera offset calculation exactly
  const { cameraOffsetX, cameraOffsetY } = useGameViewport(localPlayer, predictedPosition);

  return {
    cameraOffsetX,
    cameraOffsetY
  };
}
