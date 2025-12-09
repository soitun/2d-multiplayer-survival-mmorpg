/**
 * Hook to detect insanity threshold crossings and trigger SOVA client-side sounds
 * 
 * SOVA Sound File Naming Convention:
 * - sova_insanity_25_1.mp3, sova_insanity_25_2.mp3, sova_insanity_25_3.mp3 (25% threshold - 3 variations)
 * - sova_insanity_50_1.mp3, sova_insanity_50_2.mp3, sova_insanity_50_3.mp3 (50% threshold - 3 variations)
 * - sova_insanity_75_1.mp3, sova_insanity_75_2.mp3, sova_insanity_75_3.mp3 (75% threshold - 3 variations)
 * - sova_insanity_90_1.mp3, sova_insanity_90_2.mp3, sova_insanity_90_3.mp3 (90% threshold - 3 variations)
 * - sova_insanity_100_1.mp3, sova_insanity_100_2.mp3, sova_insanity_100_3.mp3 (100% threshold - 3 variations)
 * 
 * Total: 15 sound files (5 thresholds × 3 variations each)
 * 
 * Sound files should be placed in: public/sounds/
 */

import { useEffect, useRef } from 'react';
import type { Player } from '../generated';

interface UseInsanitySovaSoundsProps {
  localPlayer: Player | undefined;
}

const INSANITY_THRESHOLDS = [25.0, 50.0, 75.0, 90.0, 100.0] as const;
const SOUND_VARIATIONS_PER_THRESHOLD = 3;

/**
 * Plays a random SOVA sound for the given insanity threshold
 */
function playInsanitySovaSound(threshold: number): void {
  // Randomly select one of the variations for this threshold
  const variation = Math.floor(Math.random() * SOUND_VARIATIONS_PER_THRESHOLD) + 1;
  const soundFilename = `sova_insanity_${threshold}_${variation}.mp3`;
  const soundPath = `/sounds/${soundFilename}`;
  
  try {
    const audio = new Audio(soundPath);
    audio.volume = 0.7; // SOVA sounds should be noticeable but not overwhelming
    audio.play().catch((error) => {
      console.warn(`Failed to play SOVA insanity sound ${soundFilename}:`, error);
    });
  } catch (error) {
    console.warn(`Failed to create audio for SOVA insanity sound ${soundFilename}:`, error);
  }
}

export function useInsanitySovaSounds({ localPlayer }: UseInsanitySovaSoundsProps): void {
  const lastThresholdRef = useRef<number>(0.0);
  
  useEffect(() => {
    if (!localPlayer) {
      lastThresholdRef.current = 0.0;
      return;
    }
    
    // Get current threshold (will be available after TypeScript bindings are regenerated)
    const currentThreshold = (localPlayer as any).lastInsanityThreshold ?? 0.0;
    const previousThreshold = lastThresholdRef.current;
    
    // Check if threshold increased (crossed a new threshold)
    if (currentThreshold > previousThreshold) {
      // Find which threshold was crossed
      for (const threshold of INSANITY_THRESHOLDS) {
        if (currentThreshold >= threshold && previousThreshold < threshold) {
          console.log(`[SOVA] Insanity threshold ${threshold}% crossed - playing sound`);
          playInsanitySovaSound(threshold);
          break; // Only play sound for the highest threshold crossed
        }
      }
    }
    
    // Update ref to track current threshold
    lastThresholdRef.current = currentThreshold;
  }, [localPlayer]);
}

