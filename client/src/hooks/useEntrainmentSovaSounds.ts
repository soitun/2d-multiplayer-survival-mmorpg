/**
 * Hook to play SOVA Entrainment quotes
 * 
 * Entrainment occurs when player reaches 100 insanity and gets the Entrainment effect.
 * This hook plays random Entrainment quotes every 10-30 seconds (won't interrupt if one is playing).
 * 
 * Note: Ambient background sound is handled by useAmbientSounds hook (entrainment_ambient).
 * 
 * SOVA Entrainment Sound File Naming Convention:
 * - sova_entrainment_1.mp3 through sova_entrainment_60.mp3 (60 quotes total)
 * 
 * Sound files should be placed in: public/sounds/
 */

import { useEffect, useRef, useCallback } from 'react';
import type { ActiveConsumableEffect } from '../generated';

interface UseEntrainmentSovaSoundsProps {
  activeConsumableEffects: Map<string, ActiveConsumableEffect> | undefined;
  localPlayerId: string | undefined;
}

const ENTRAINMENT_QUOTE_COUNT = 7;
const MIN_QUOTE_INTERVAL_MS = 10000; // 10 seconds minimum
const MAX_QUOTE_INTERVAL_MS = 30000; // 30 seconds maximum

/**
 * Checks if the local player has the Entrainment effect active
 */
function hasEntrainmentEffect(
  activeConsumableEffects: Map<string, ActiveConsumableEffect> | undefined,
  localPlayerId: string | undefined
): boolean {
  if (!localPlayerId || !activeConsumableEffects) return false;
  
  return Array.from(activeConsumableEffects.values()).some(
    effect => effect.playerId.toHexString() === localPlayerId && 
              effect.effectType.tag === 'Entrainment'
  );
}

/**
 * Plays a random Entrainment quote
 */
function playEntrainmentQuote(): HTMLAudioElement | null {
  const quoteNumber = Math.floor(Math.random() * ENTRAINMENT_QUOTE_COUNT) + 1;
  const soundFilename = `sova_entrainment_${quoteNumber}.mp3`;
  const soundPath = `/sounds/${soundFilename}`;
  
  try {
    const audio = new Audio(soundPath);
    audio.volume = 0.8; // Slightly louder than normal SOVA quotes (more urgent)
    
    // Apply slight pitch variation for glitchy effect (simple approach)
    // Note: Full Web Audio API distortion would require more complex setup
    // For now, we'll rely on the audio files themselves having distortion baked in
    
    audio.play().catch((error) => {
      console.warn(`Failed to play SOVA Entrainment quote ${soundFilename}:`, error);
    });
    
    return audio; // Return audio element to track playback
  } catch (error) {
    console.warn(`Failed to create audio for SOVA Entrainment quote ${soundFilename}:`, error);
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
    // Clear any existing timer
    if (quoteTimerRef.current !== null) {
      clearTimeout(quoteTimerRef.current);
      quoteTimerRef.current = null;
    }
    
    // Check if Entrainment is still active
    if (!hasEntrainmentEffect(activeConsumableEffectsRef.current, localPlayerIdRef.current)) {
      return; // Entrainment ended, stop scheduling
    }
    
    // Check if a quote is currently playing
    const isQuotePlaying = currentQuoteAudioRef.current && 
                          !currentQuoteAudioRef.current.paused && 
                          currentQuoteAudioRef.current.currentTime > 0 &&
                          currentQuoteAudioRef.current.currentTime < currentQuoteAudioRef.current.duration;
    
    if (isQuotePlaying) {
      // Quote is playing, check again in 2 seconds
      quoteTimerRef.current = window.setTimeout(() => {
        scheduleNextQuote();
      }, 2000);
      return;
    }
    
    // No quote playing, schedule next one
    const delay = MIN_QUOTE_INTERVAL_MS + Math.random() * (MAX_QUOTE_INTERVAL_MS - MIN_QUOTE_INTERVAL_MS);
    
    quoteTimerRef.current = window.setTimeout(() => {
      // Double-check Entrainment is still active
      if (!hasEntrainmentEffect(activeConsumableEffectsRef.current, localPlayerIdRef.current)) {
        return;
      }
      
      const audio = playEntrainmentQuote();
      currentQuoteAudioRef.current = audio;
      
      // When quote finishes, schedule next one
      if (audio) {
        audio.addEventListener('ended', () => {
          currentQuoteAudioRef.current = null;
          scheduleNextQuote();
        }, { once: true });
      } else {
        // If audio failed to create, schedule next quote anyway
        scheduleNextQuote();
      }
    }, delay);
  }, []); // Empty deps - uses refs for current values
  
  useEffect(() => {
    const hasEntrainment = hasEntrainmentEffect(activeConsumableEffects, localPlayerId);
    const hadEntrainment = hasEntrainmentRef.current;
    
    // Entrainment effect started
    if (hasEntrainment && !hadEntrainment) {
      console.log('[SOVA Entrainment] Effect detected - starting quote system');
      
      // Schedule first quote after a short delay (5-15 seconds)
      const firstQuoteDelay = 5000 + Math.random() * 10000;
      quoteTimerRef.current = window.setTimeout(() => {
        if (hasEntrainmentEffect(activeConsumableEffectsRef.current, localPlayerIdRef.current)) {
          const audio = playEntrainmentQuote();
          currentQuoteAudioRef.current = audio;
          
          // When first quote finishes, start the scheduling loop
          if (audio) {
            audio.addEventListener('ended', () => {
              currentQuoteAudioRef.current = null;
              scheduleNextQuote();
            }, { once: true });
          } else {
            // If audio failed, start scheduling anyway
            scheduleNextQuote();
          }
        }
      }, firstQuoteDelay);
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
    
    // Cleanup on unmount or when effect ends
    return () => {
      if (quoteTimerRef.current !== null) {
        clearTimeout(quoteTimerRef.current);
        quoteTimerRef.current = null;
      }
      
      if (currentQuoteAudioRef.current) {
        currentQuoteAudioRef.current.pause();
        currentQuoteAudioRef.current = null;
      }
    };
  }, [activeConsumableEffects, localPlayerId, scheduleNextQuote]);
}

