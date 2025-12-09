/**
 * Hook to play SOVA Entrainment quotes
 * 
 * Entrainment occurs when player reaches 100 insanity and gets the Entrainment effect.
 * This hook plays random Entrainment quotes every 10-30 seconds (won't interrupt if one is playing).
 * 
 * Note: Ambient background sound is handled by useAmbientSounds hook (entrainment_ambient).
 * 
 * SOVA Entrainment Sound File Naming Convention:
 * - sova_entrainment_1.mp3 through sova_entrainment_7.mp3 (7 quotes total)
 * 
 * Sound files should be placed in: public/sounds/
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import type { ActiveConsumableEffect } from '../generated';
import { insanity100SoundRef } from './useInsanitySovaSounds';

interface UseEntrainmentSovaSoundsProps {
  activeConsumableEffects: Map<string, ActiveConsumableEffect> | undefined;
  localPlayerId: string | undefined;
}

const ENTRAINMENT_QUOTE_COUNT = 7;
const MIN_QUOTE_INTERVAL_MS = 5000; // 5 seconds minimum
const MAX_QUOTE_INTERVAL_MS = 15000; // 15 seconds maximum

/**
 * Checks if the local player has the Entrainment effect active
 */
function hasEntrainmentEffect(
  activeConsumableEffects: Map<string, ActiveConsumableEffect> | undefined,
  localPlayerId: string | undefined
): boolean {
  if (!localPlayerId || !activeConsumableEffects) {
    console.log(`[SOVA Entrainment] No localPlayerId or activeConsumableEffects - localPlayerId: ${localPlayerId}, effects: ${activeConsumableEffects?.size || 0}`);
    return false;
  }
  
  const effects = Array.from(activeConsumableEffects.values());
  const hasEntrainment = effects.some(
    effect => {
      const matchesPlayer = effect.playerId.toHexString() === localPlayerId;
      const isEntrainment = effect.effectType.tag === 'Entrainment';
      return matchesPlayer && isEntrainment;
    }
  );
  
  if (hasEntrainment) {
    console.log(`[SOVA Entrainment] Entrainment effect detected for player ${localPlayerId}`);
  }
  
  return hasEntrainment;
}

/**
 * Plays a random Entrainment quote
 */
function playEntrainmentQuote(): HTMLAudioElement | null {
  const quoteNumber = Math.floor(Math.random() * ENTRAINMENT_QUOTE_COUNT) + 1;
  const soundFilename = `sova_entrainment_${quoteNumber}.mp3`;
  const soundPath = `/sounds/${soundFilename}`;
  
  console.log(`[SOVA Entrainment] Attempting to play quote ${quoteNumber}: ${soundPath}`);
  
  try {
    const audio = new Audio(soundPath);
    audio.volume = 0.8; // Slightly louder than normal SOVA quotes (more urgent)
    
    // Add error handlers for debugging
    audio.addEventListener('error', (e) => {
      console.error(`[SOVA Entrainment] Audio error for ${soundFilename}:`, e);
      const error = (audio as any).error;
      if (error) {
        console.error(`[SOVA Entrainment] Audio error details:`, {
          code: error.code,
          message: error.message
        });
      }
    });
    
    audio.addEventListener('loadstart', () => {
      console.log(`[SOVA Entrainment] Loading quote ${quoteNumber}...`);
    });
    
    audio.addEventListener('canplay', () => {
      console.log(`[SOVA Entrainment] Quote ${quoteNumber} ready to play`);
    });
    
    // Apply slight pitch variation for glitchy effect (simple approach)
    // Note: Full Web Audio API distortion would require more complex setup
    // For now, we'll rely on the audio files themselves having distortion baked in
    
    audio.play().then(() => {
      console.log(`[SOVA Entrainment] Successfully started playing quote ${quoteNumber}`);
    }).catch((error) => {
      console.error(`[SOVA Entrainment] Failed to play quote ${soundFilename}:`, error);
      const audioError = (audio as any).error;
      if (audioError) {
        console.error(`[SOVA Entrainment] Error details:`, {
          code: audioError.code,
          message: audioError.message,
          path: soundPath
        });
      }
    });
    
    return audio; // Return audio element to track playback
  } catch (error) {
    console.error(`[SOVA Entrainment] Failed to create audio for quote ${soundFilename}:`, error);
    return null;
  }
}

export function useEntrainmentSovaSounds({ 
  activeConsumableEffects, 
  localPlayerId 
}: UseEntrainmentSovaSoundsProps): void {
  const quoteTimerRef = useRef<number | null>(null);
  const currentQuoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasEntrainmentRef = useRef<boolean>(false);
  const activeConsumableEffectsRef = useRef<Map<string, ActiveConsumableEffect> | undefined>(activeConsumableEffects);
  const localPlayerIdRef = useRef<string | undefined>(localPlayerId);
  
  // Keep refs updated
  useEffect(() => {
    activeConsumableEffectsRef.current = activeConsumableEffects;
    localPlayerIdRef.current = localPlayerId;
  }, [activeConsumableEffects, localPlayerId]);
  
  /**
   * Schedules the next Entrainment quote
   * Only schedules if no quote is currently playing
   */
  const scheduleNextQuote = useCallback(() => {
    console.log('[SOVA Entrainment] scheduleNextQuote called');
    
    // Clear any existing timer
    if (quoteTimerRef.current !== null) {
      clearTimeout(quoteTimerRef.current);
      quoteTimerRef.current = null;
    }
    
    // Check if Entrainment is still active
    const stillHasEntrainment = hasEntrainmentEffect(activeConsumableEffectsRef.current, localPlayerIdRef.current);
    if (!stillHasEntrainment) {
      console.log('[SOVA Entrainment] Entrainment ended, stopping quote scheduling');
      return; // Entrainment ended, stop scheduling
    }
    
    // Check if a quote is currently playing
    const isQuotePlaying = currentQuoteAudioRef.current && 
                          !currentQuoteAudioRef.current.paused && 
                          currentQuoteAudioRef.current.currentTime > 0 &&
                          currentQuoteAudioRef.current.currentTime < currentQuoteAudioRef.current.duration;
    
    if (isQuotePlaying) {
      console.log('[SOVA Entrainment] Quote is currently playing, will check again in 2 seconds');
      // Quote is playing, check again in 2 seconds
      quoteTimerRef.current = window.setTimeout(() => {
        scheduleNextQuote();
      }, 2000);
      return;
    }
    
    // No quote playing, schedule next one
    const delay = MIN_QUOTE_INTERVAL_MS + Math.random() * (MAX_QUOTE_INTERVAL_MS - MIN_QUOTE_INTERVAL_MS);
    console.log(`[SOVA Entrainment] Scheduling next quote in ${(delay / 1000).toFixed(1)} seconds`);
    
    quoteTimerRef.current = window.setTimeout(() => {
      console.log('[SOVA Entrainment] Quote timer fired');
      // Double-check Entrainment is still active
      const stillActive = hasEntrainmentEffect(activeConsumableEffectsRef.current, localPlayerIdRef.current);
      if (!stillActive) {
        console.log('[SOVA Entrainment] Entrainment ended before quote could play');
        return;
      }
      
      const audio = playEntrainmentQuote();
      currentQuoteAudioRef.current = audio;
      
      // When quote finishes, schedule next one
      if (audio) {
        audio.addEventListener('ended', () => {
          console.log('[SOVA Entrainment] Quote ended, scheduling next');
          currentQuoteAudioRef.current = null;
          scheduleNextQuote();
        }, { once: true });
      } else {
        console.warn('[SOVA Entrainment] Audio failed to create, scheduling next anyway');
        // If audio failed to create, schedule next quote anyway
        scheduleNextQuote();
      }
    }, delay);
  }, []); // Empty deps - uses refs for current values
  
  // Track Entrainment status separately to avoid unnecessary re-renders
  useEffect(() => {
    activeConsumableEffectsRef.current = activeConsumableEffects;
    localPlayerIdRef.current = localPlayerId;
  }, [activeConsumableEffects, localPlayerId]);

  // Compute Entrainment status - use useMemo to avoid recalculating unnecessarily
  const hasEntrainment = useMemo(() => {
    return hasEntrainmentEffect(activeConsumableEffects, localPlayerId);
  }, [activeConsumableEffects, localPlayerId]);

  // Helper function to play the first Entrainment quote
  const playFirstEntrainmentQuote = useCallback(() => {
    const stillHasEntrainment = hasEntrainmentEffect(activeConsumableEffectsRef.current, localPlayerIdRef.current);
    console.log(`[SOVA Entrainment] Still has Entrainment: ${stillHasEntrainment}`);
    
    if (stillHasEntrainment) {
      const audio = playEntrainmentQuote();
      currentQuoteAudioRef.current = audio;
      
      // When first quote finishes, start the scheduling loop
      if (audio) {
        audio.addEventListener('ended', () => {
          console.log('[SOVA Entrainment] First quote ended, starting scheduling loop');
          currentQuoteAudioRef.current = null;
          scheduleNextQuote();
        }, { once: true });
      } else {
        console.warn('[SOVA Entrainment] Audio failed to create, starting scheduling anyway');
        // If audio failed, start scheduling anyway
        scheduleNextQuote();
      }
    } else {
      console.warn('[SOVA Entrainment] Entrainment effect ended before first quote could play');
    }
  }, [scheduleNextQuote]);

  // Only run effect when Entrainment status actually changes
  useEffect(() => {
    const hadEntrainment = hasEntrainmentRef.current;
    
    console.log(`[SOVA Entrainment] Effect check - hasEntrainment: ${hasEntrainment}, hadEntrainment: ${hadEntrainment}, localPlayerId: ${localPlayerId}, effects count: ${activeConsumableEffects?.size || 0}`);
    
    // Entrainment effect started
    if (hasEntrainment && !hadEntrainment) {
      console.log('[SOVA Entrainment] Effect detected - checking if 100% insanity sound is playing');
      
      // Check if 100% insanity sound is currently playing
      const is100PercentSoundPlaying = insanity100SoundRef.current && 
                                       !insanity100SoundRef.current.paused && 
                                       insanity100SoundRef.current.currentTime > 0 &&
                                       insanity100SoundRef.current.currentTime < insanity100SoundRef.current.duration;
      
      if (is100PercentSoundPlaying) {
        console.log('[SOVA Entrainment] 100% insanity sound is playing - waiting for it to finish');
        
        // Wait for the 100% sound to finish
        const checkFor100PercentFinish = () => {
          const stillPlaying = insanity100SoundRef.current && 
                              !insanity100SoundRef.current.paused && 
                              insanity100SoundRef.current.currentTime > 0 &&
                              insanity100SoundRef.current.currentTime < insanity100SoundRef.current.duration;
          
          if (stillPlaying) {
            // Check again in 100ms
            quoteTimerRef.current = window.setTimeout(checkFor100PercentFinish, 100);
          } else {
            // 100% sound finished, play first Entrainment quote
            console.log('[SOVA Entrainment] 100% insanity sound finished - playing first Entrainment quote');
            playFirstEntrainmentQuote();
          }
        };
        
        // Start checking
        quoteTimerRef.current = window.setTimeout(checkFor100PercentFinish, 100);
      } else {
        // No 100% sound playing, play first quote immediately
        console.log('[SOVA Entrainment] No 100% sound playing - playing first quote immediately');
        playFirstEntrainmentQuote();
      }
    }
    
    // Entrainment effect ended
    if (!hasEntrainment && hadEntrainment) {
      console.log('[SOVA Entrainment] Effect cleared - stopping quotes');
      
      // Stop current quote if playing
      if (currentQuoteAudioRef.current) {
        currentQuoteAudioRef.current.pause();
        currentQuoteAudioRef.current = null;
      }
      
      // Clear quote timer
      if (quoteTimerRef.current !== null) {
        clearTimeout(quoteTimerRef.current);
        quoteTimerRef.current = null;
      }
    }
    
    hasEntrainmentRef.current = hasEntrainment;
    
    // No cleanup function - timers are managed by the effect logic above
    // Cleanup on unmount is handled separately
  }, [hasEntrainment, localPlayerId, scheduleNextQuote, playFirstEntrainmentQuote]);
  
  // Separate cleanup effect for unmount only
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (quoteTimerRef.current !== null) {
        clearTimeout(quoteTimerRef.current);
        quoteTimerRef.current = null;
      }
      
      if (currentQuoteAudioRef.current) {
        currentQuoteAudioRef.current.pause();
        currentQuoteAudioRef.current = null;
      }
    };
  }, []); // Empty deps - only runs on mount/unmount
}

