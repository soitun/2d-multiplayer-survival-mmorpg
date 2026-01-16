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
  /** Callback to add a message to the SOVA chat tab (switches tab and flashes it) */
  onAddMessage?: (message: { id: string; text: string; isUser: boolean; timestamp: Date; flashTab?: boolean }) => void;
}

const INSANITY_THRESHOLDS = [25.0, 50.0, 75.0, 90.0, 100.0] as const;
const SOUND_VARIATIONS_PER_THRESHOLD = 3;

/**
 * Plays a random SOVA sound for the given insanity threshold
 * Returns the audio element so we can track when it finishes
 * @param threshold The insanity threshold (25, 50, 75, 90, or 100)
 * @param onBeforePlay Optional callback to call BEFORE audio.play() - used to set up SovaSoundBox
 *                     to prevent race conditions with notification sounds
 */
function playInsanitySovaSound(
  threshold: number,
  onBeforePlay?: (audio: HTMLAudioElement) => void
): HTMLAudioElement | null {
  // Randomly select one of the variations for this threshold
  const variation = Math.floor(Math.random() * SOUND_VARIATIONS_PER_THRESHOLD) + 1;
  const soundFilename = `sova_insanity_${threshold}_${variation}.mp3`;
  const soundPath = `/sounds/${soundFilename}`;
  
  try {
    const audio = new Audio(soundPath);
    audio.volume = 0.7; // SOVA sounds should be noticeable but not overwhelming
    
    // CRITICAL: Call onBeforePlay BEFORE audio.play() to set __SOVA_SOUNDBOX_IS_ACTIVE__ flag
    // This prevents notification sounds from sneaking in during the async play() window
    if (onBeforePlay) {
      onBeforePlay(audio);
    }
    
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

export function useInsanitySovaSounds({ localPlayer, onSoundPlay, onAddMessage }: UseInsanitySovaSoundsProps): void {
  const lastThresholdRef = useRef<number>(0.0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingThresholdRef = useRef<number | null>(null); // Queue for sounds that couldn't play immediately
  const onSoundPlayRef = useRef(onSoundPlay);
  const onAddMessageRef = useRef(onAddMessage);
  
  // Keep callback refs updated
  useEffect(() => {
    onSoundPlayRef.current = onSoundPlay;
    onAddMessageRef.current = onAddMessage;
  }, [onSoundPlay, onAddMessage]);
  
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
  
  // Helper to get message text for threshold (shown in SOVA chat)
  const getInsanityMessage = useCallback((threshold: number): string => {
    switch (threshold) {
      case 25: return '⚠️ Warning: Your mind is beginning to fray. Insanity at 25%.';
      case 50: return '⚠️ Alert: Reality is slipping. Insanity at 50%.';
      case 75: return '⚠️ Critical: The whispers grow louder. Insanity at 75%.';
      case 90: return '⚠️ Danger: You are on the edge of madness. Insanity at 90%.';
      case 100: return '⚠️ ENTRAINMENT: Total insanity reached. The island has claimed your mind.';
      default: return '⚠️ Insanity level increasing...';
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
            // Pass callback to set up SovaSoundBox BEFORE audio.play() to prevent race conditions
            const audio = playInsanitySovaSound(threshold, (audioElement) => {
              if (onSoundPlayRef.current) {
                onSoundPlayRef.current(audioElement, getInsanityLabel(threshold));
              }
            });
            currentAudioRef.current = audio;
            
            // Add message to SOVA chat tab (switches to tab and flashes it)
            if (onAddMessageRef.current) {
              onAddMessageRef.current({
                id: `sova-insanity-${threshold}-${Date.now()}`,
                text: getInsanityMessage(threshold),
                isUser: false,
                timestamp: new Date(),
                flashTab: true,
              });
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
                  // Pass callback to set up SovaSoundBox BEFORE audio.play() to prevent race conditions
                  const nextAudio = playInsanitySovaSound(pendingThreshold, (audioElement) => {
                    if (onSoundPlayRef.current) {
                      onSoundPlayRef.current(audioElement, getInsanityLabel(pendingThreshold));
                    }
                  });
                  currentAudioRef.current = nextAudio;
                  
                  // Add message to SOVA chat tab for queued sound
                  if (onAddMessageRef.current) {
                    onAddMessageRef.current({
                      id: `sova-insanity-${pendingThreshold}-${Date.now()}`,
                      text: getInsanityMessage(pendingThreshold),
                      isUser: false,
                      timestamp: new Date(),
                      flashTab: true,
                    });
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
                        // Pass callback to set up SovaSoundBox BEFORE audio.play() to prevent race conditions
                        const finalAudio = playInsanitySovaSound(nextPending, (audioElement) => {
                          if (onSoundPlayRef.current) {
                            onSoundPlayRef.current(audioElement, getInsanityLabel(nextPending));
                          }
                        });
                        currentAudioRef.current = finalAudio;
                        
                        // Add message to SOVA chat tab for final queued sound
                        if (onAddMessageRef.current) {
                          onAddMessageRef.current({
                            id: `sova-insanity-${nextPending}-${Date.now()}`,
                            text: getInsanityMessage(nextPending),
                            isUser: false,
                            timestamp: new Date(),
                            flashTab: true,
                          });
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
  }, [localPlayer, getInsanityLabel, getInsanityMessage]);
  
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

