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

import { useEffect, useRef, useCallback } from 'react';
import type { Player } from '../generated';

interface UseInsanitySovaSoundsProps {
  localPlayer: Player | undefined;
  /** Callback to show the SOVA sound box when a sound starts playing */
  onSoundPlay?: (audio: HTMLAudioElement, label: string) => void;
}

const INSANITY_THRESHOLDS = [25.0, 50.0, 75.0, 90.0, 100.0] as const;
const SOUND_VARIATIONS_PER_THRESHOLD = 3;

/**
 * Plays a random SOVA sound for the given insanity threshold
 * Returns the audio element so we can track when it finishes
 */
function playInsanitySovaSound(threshold: number): HTMLAudioElement | null {
  // Randomly select one of the variations for this threshold
  const variation = Math.floor(Math.random() * SOUND_VARIATIONS_PER_THRESHOLD) + 1;
  const soundFilename = `sova_insanity_${threshold}_${variation}.mp3`;
  const soundPath = `/sounds/${soundFilename}`;
  
  try {
    const audio = new Audio(soundPath);
    audio.volume = 0.7; // SOVA sounds should be noticeable but not overwhelming
    
    audio.play().catch((error) => {
      console.warn(`Failed to play SOVA insanity sound ${soundFilename}:`, error);
      return null;
    });
    
    return audio; // Return audio element to track playback
  } catch (error) {
    console.warn(`Failed to create audio for SOVA insanity sound ${soundFilename}:`, error);
    return null;
  }
}

// Export a way for other hooks to check if 100% sound is playing
export const insanity100SoundRef = { current: null as HTMLAudioElement | null };

export function useInsanitySovaSounds({ localPlayer, onSoundPlay }: UseInsanitySovaSoundsProps): void {
  const lastThresholdRef = useRef<number>(0.0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingThresholdRef = useRef<number | null>(null); // Queue for sounds that couldn't play immediately
  const onSoundPlayRef = useRef(onSoundPlay);
  
  // Keep callback ref updated
  useEffect(() => {
    onSoundPlayRef.current = onSoundPlay;
  }, [onSoundPlay]);
  
  // Helper to get label for threshold
  const getInsanityLabel = useCallback((threshold: number): string => {
    switch (threshold) {
      case 25: return 'SOVA: Insanity Warning';
      case 50: return 'SOVA: Mind Fracturing';
      case 75: return 'SOVA: Critical Insanity';
      case 90: return 'SOVA: On The Edge';
      case 100: return 'SOVA: Total Insanity';
      default: return 'SOVA: Insanity Alert';
    }
  }, []);
  
  useEffect(() => {
    if (!localPlayer) {
      lastThresholdRef.current = 0.0;
      // Clean up audio on unmount
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      return;
    }
    
    // Get current threshold (will be available after TypeScript bindings are regenerated)
    const currentThreshold = (localPlayer as any).lastInsanityThreshold ?? 0.0;
    const previousThreshold = lastThresholdRef.current;
    
    // Check if a sound is currently playing
    const isSoundPlaying = currentAudioRef.current && 
                          !currentAudioRef.current.paused && 
                          currentAudioRef.current.currentTime > 0 &&
                          currentAudioRef.current.currentTime < currentAudioRef.current.duration;
    
    // Check if threshold increased (crossed a new threshold)
    if (currentThreshold > previousThreshold) {
      // Find which threshold was crossed
      for (const threshold of INSANITY_THRESHOLDS) {
        if (currentThreshold >= threshold && previousThreshold < threshold) {
          // If a sound is already playing, queue this threshold to play after current sound finishes
          if (isSoundPlaying) {
            console.log(`[SOVA] Insanity threshold ${threshold}% crossed - sound already playing, queuing...`);
            pendingThresholdRef.current = threshold;
          } else {
            console.log(`[SOVA] Insanity threshold ${threshold}% crossed - playing sound`);
            const audio = playInsanitySovaSound(threshold);
            currentAudioRef.current = audio;
            
            // Show sound box if callback is provided
            if (audio && onSoundPlayRef.current) {
              onSoundPlayRef.current(audio, getInsanityLabel(threshold));
            }
            
            // Track 100% sound specifically for Entrainment hook
            if (threshold === 100.0) {
              insanity100SoundRef.current = audio;
            }
            
            // When sound finishes, check if there's a pending threshold to play
            if (audio) {
              audio.addEventListener('ended', () => {
                currentAudioRef.current = null;
                
                // Clear 100% sound ref if this was the 100% sound
                if (threshold === 100.0) {
                  insanity100SoundRef.current = null;
                }
                
                // Play pending threshold sound if one exists
                if (pendingThresholdRef.current !== null) {
                  const pendingThreshold = pendingThresholdRef.current;
                  pendingThresholdRef.current = null;
                  console.log(`[SOVA] Playing queued insanity threshold ${pendingThreshold}% sound`);
                  const nextAudio = playInsanitySovaSound(pendingThreshold);
                  currentAudioRef.current = nextAudio;
                  
                  // Show sound box for queued sound
                  if (nextAudio && onSoundPlayRef.current) {
                    onSoundPlayRef.current(nextAudio, getInsanityLabel(pendingThreshold));
                  }
                  
                  // Track 100% sound if this is it
                  if (pendingThreshold === 100.0) {
                    insanity100SoundRef.current = nextAudio;
                  }
                  
                  // Set up listener for this sound too
                  if (nextAudio) {
                    nextAudio.addEventListener('ended', () => {
                      currentAudioRef.current = null;
                      
                      // Clear 100% sound ref if this was the 100% sound
                      if (pendingThreshold === 100.0) {
                        insanity100SoundRef.current = null;
                      }
                      
                      // Check again for any new pending sounds
                      if (pendingThresholdRef.current !== null) {
                        const nextPending = pendingThresholdRef.current;
                        pendingThresholdRef.current = null;
                        const finalAudio = playInsanitySovaSound(nextPending);
                        currentAudioRef.current = finalAudio;
                        
                        // Show sound box for final queued sound
                        if (finalAudio && onSoundPlayRef.current) {
                          onSoundPlayRef.current(finalAudio, getInsanityLabel(nextPending));
                        }
                        
                        // Track 100% sound if this is it
                        if (nextPending === 100.0) {
                          insanity100SoundRef.current = finalAudio;
                        }
                        
                        if (finalAudio) {
                          finalAudio.addEventListener('ended', () => {
                            currentAudioRef.current = null;
                            if (nextPending === 100.0) {
                              insanity100SoundRef.current = null;
                            }
                          }, { once: true });
                        }
                      }
                    }, { once: true });
                  }
                }
              }, { once: true });
            }
          }
          break; // Only play sound for the highest threshold crossed
        }
      }
    }
    
    // Update ref to track current threshold
    lastThresholdRef.current = currentThreshold;
  }, [localPlayer, getInsanityLabel]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);
}

