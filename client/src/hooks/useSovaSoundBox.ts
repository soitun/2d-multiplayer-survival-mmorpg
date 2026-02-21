/**
 * useSovaSoundBox Hook
 * 
 * Global state manager for the SOVA Sound Box component.
 * This hook allows any component to trigger a SOVA sound box notification
 * with audio playback and dismissible UI.
 * 
 * Usage:
 * ```tsx
 * const { showSovaSoundBox, hideSovaSoundBox, currentSovaSound, SovaSoundBoxComponent } = useSovaSoundBox();
 * 
 * // To show a sound box:
 * const audio = new Audio('/sounds/sova_tutorial_hint.mp3');
 * audio.play();
 * showSovaSoundBox(audio, 'Tutorial Hint');
 * 
 * // Render the component in your JSX:
 * return <>{SovaSoundBoxComponent}</>
 * ```
 * 
 * Other components can check if SOVA is speaking using:
 * - window.__SOVA_SOUNDBOX_IS_PLAYING__() - returns true if SovaSoundBox audio is playing
 * - isSovaSoundBoxPlaying() - exported function for type-safe access
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import React from 'react';
import SovaSoundBox from '../components/SovaSoundBox';
import { isCairnAudioPlaying } from '../utils/cairnAudioUtils';
import { stopNotificationSound } from '../utils/notificationSoundQueue';

// Declare global window functions for checking SOVA playback state
declare global {
  interface Window {
    __SOVA_SOUNDBOX_IS_PLAYING__?: () => boolean;
    __SOVA_SOUNDBOX_AUDIO_REF__?: HTMLAudioElement | null;
    __SOVA_SOUNDBOX_IS_ACTIVE__?: boolean; // Flag set immediately when showSovaSoundBox is called
  }
}

/**
 * Check if SOVA SoundBox is currently playing audio or is active (about to play).
 * Use this to prevent achievement/level up/mission sounds from interrupting tutorials.
 * 
 * IMPORTANT: This check includes an "is active" flag that's set immediately when
 * showSovaSoundBox is called, BEFORE audio.play() completes. This prevents race
 * conditions where notification sounds could sneak in during the async play() call.
 */
export function isSovaSoundBoxPlaying(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check the "is active" flag first - this is set immediately when showSovaSoundBox is called
  // and prevents race conditions where audio hasn't started playing yet
  if (window.__SOVA_SOUNDBOX_IS_ACTIVE__ === true) {
    return true;
  }
  
  // Also check the actual playback state as a fallback
  if (typeof window.__SOVA_SOUNDBOX_IS_PLAYING__ === 'function') {
    return window.__SOVA_SOUNDBOX_IS_PLAYING__();
  }
  
  return false;
}

/**
 * Check if loading screen SOVA audio is currently playing.
 * Loading screen now uses SovaSoundBox, so isSovaSoundBoxPlaying covers this case.
 */
export function isLoadingScreenAudioPlaying(): boolean {
  return false; // Loading screen uses SovaSoundBox; isSovaSoundBoxPlaying covers it
}

/**
 * Check if ANY SOVA audio is currently playing (SoundBox, loading screen, OR cairn lore).
 * This is the main function to use when checking if short notification sounds should be skipped.
 * 
 * Checks multiple sources:
 * 1. SovaSoundBox component (tutorials, insanity whispers, etc.)
 * 2. Loading screen intro audio
 * 3. Cairn lore audio (belt-and-suspenders check in case cairn audio bypasses SovaSoundBox)
 */
export function isAnySovaAudioPlaying(): boolean {
  // Check SovaSoundBox (includes the "is active" flag for race condition prevention)
  if (isSovaSoundBoxPlaying()) {
    return true;
  }
  
  // Check loading screen audio
  if (isLoadingScreenAudioPlaying()) {
    return true;
  }
  
  // Belt-and-suspenders: Also check cairn audio directly
  // This catches cases where cairn audio might not go through SovaSoundBox
  if (isCairnAudioPlaying()) {
    return true;
  }
  
  return false;
}

export interface SovaSoundState {
  audio: HTMLAudioElement | null;
  label: string;
  isVisible: boolean;
}

/** Options for showSovaSoundBox - intro cannot be interrupted by other SOVA audio */
export interface SovaSoundBoxOptions {
  /** When 'intro', this audio cannot be interrupted - other tutorials will be skipped until it ends */
  priority?: 'intro';
  /** Called when this audio finishes playing */
  onEnded?: () => void;
  /** When true, play audio without showing the SovaSoundBox UI (e.g. loading screen sequence) */
  hideUI?: boolean;
}

interface UseSovaSoundBoxReturn {
  /** Show the SOVA sound box with the given audio and label */
  showSovaSoundBox: (audio: HTMLAudioElement, label?: string, options?: SovaSoundBoxOptions) => void;
  /** Hide the current SOVA sound box and stop audio */
  hideSovaSoundBox: () => void;
  /** Reveal the SOVA sound box UI (e.g. when entering game with loading-screen audio still playing) */
  revealSovaSoundBoxUI: () => void;
  /** Current state of the SOVA sound */
  currentSovaSound: SovaSoundState | null;
  /** The SovaSoundBox component to render - render this in your component tree */
  SovaSoundBoxComponent: React.ReactNode;
}

export function useSovaSoundBox(): UseSovaSoundBoxReturn {
  const [soundState, setSoundState] = useState<SovaSoundState | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const introPlayingRef = useRef(false);
  const introOnEndedRef = useRef<(() => void) | null>(null);
  const genericOnEndedRef = useRef<(() => void) | null>(null);

  // Expose global function to check if SOVA is playing
  // This allows achievement/level up/mission notifications to check before playing
  useEffect(() => {
    window.__SOVA_SOUNDBOX_AUDIO_REF__ = audioRef.current;
    window.__SOVA_SOUNDBOX_IS_ACTIVE__ = false; // Initialize active flag
    
    window.__SOVA_SOUNDBOX_IS_PLAYING__ = () => {
      const audio = audioRef.current;
      if (!audio) return false;
      // Check if audio exists, is not paused, and hasn't ended
      // NOTE: Removed audio.currentTime > 0 check - it caused race conditions
      // where notification sounds could play during the brief moment after play()
      // is called but before the first frame is rendered
      return !audio.paused && !audio.ended;
    };

    return () => {
      // Clean up on unmount
      delete window.__SOVA_SOUNDBOX_IS_PLAYING__;
      delete window.__SOVA_SOUNDBOX_AUDIO_REF__;
      window.__SOVA_SOUNDBOX_IS_ACTIVE__ = false;
    };
  }, []);

  // Update the global ref whenever audioRef changes
  useEffect(() => {
    window.__SOVA_SOUNDBOX_AUDIO_REF__ = audioRef.current;
  }, [soundState]);

  const showSovaSoundBox = useCallback((audio: HTMLAudioElement, label: string = 'SOVA', options?: SovaSoundBoxOptions) => {
    const hideUI = options?.hideUI === true;
    // SOVA INTRO IS NON-INTERRUPTABLE: If intro is playing, skip any other SOVA audio
    // This prevents quest complete, memory shard tutorial, etc. from cutting off the crash intro
    if (introPlayingRef.current && options?.priority !== 'intro') {
      console.log('[SovaSoundBox] ⏸️ Skipping - SOVA intro is playing and cannot be interrupted');
      return;
    }

    // If SOVA is already playing (non-intro), skip - don't queue. The tutorial will trigger again
    // when the player returns to that event/location and no other tutorial is playing.
    const isCurrentlyPlaying = audioRef.current && !audioRef.current.paused && !audioRef.current.ended;
    if (isCurrentlyPlaying && options?.priority !== 'intro') {
      console.log(`[SovaSoundBox] ⏸️ Skipping ${label} - another tutorial is playing`);
      return;
    }

    // CRITICAL: Set active flag IMMEDIATELY before any async operations
    // This prevents race conditions where notification sounds could sneak in
    // during the time between showSovaSoundBox being called and audio.play() completing
    window.__SOVA_SOUNDBOX_IS_ACTIVE__ = true;
    
    // CRITICAL: Stop any notification sounds that might be playing
    // SOVA always takes priority over achievement/level-up/mission sounds
    stopNotificationSound();
    
    // Stop any existing SovaSoundBox audio first (unless we're the intro replacing something - shouldn't happen)
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Track intro state for non-interruptable behavior
    if (options?.priority === 'intro') {
      introPlayingRef.current = true;
      introOnEndedRef.current = options.onEnded ?? null;
      genericOnEndedRef.current = null;
    } else {
      introOnEndedRef.current = null;
      genericOnEndedRef.current = options?.onEnded ?? null;
    }

    // Loading screen now uses SovaSoundBox - showSovaSoundBox replaces current audio,
    // so no separate stop call needed

    audioRef.current = audio;
    window.__SOVA_SOUNDBOX_AUDIO_REF__ = audio;
    
    // Set up event listener to clear the active flag when audio ends
    const clearActiveFlag = () => {
      window.__SOVA_SOUNDBOX_IS_ACTIVE__ = false;
      audio.removeEventListener('ended', clearActiveFlag);
      audio.removeEventListener('error', clearActiveFlag);
      // If this was the intro, clear intro state and call onEnded (e.g. mark intro as seen on server)
      if (introPlayingRef.current) {
        introPlayingRef.current = false;
        introOnEndedRef.current?.();
        introOnEndedRef.current = null;
      }
      // Call generic onEnded (e.g. loading screen sequence: play next clip)
      genericOnEndedRef.current?.();
      genericOnEndedRef.current = null;
    };
    audio.addEventListener('ended', clearActiveFlag);
    audio.addEventListener('error', clearActiveFlag);
    
    setSoundState({
      audio,
      label,
      isVisible: !hideUI,
    });
  }, []);

  const hideSovaSoundBox = useCallback(() => {
    // Clear the active flag when hiding
    window.__SOVA_SOUNDBOX_IS_ACTIVE__ = false;
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    audioRef.current = null;
    window.__SOVA_SOUNDBOX_AUDIO_REF__ = null;
    setSoundState(null);
  }, []);

  /** Reveal the SOVA sound box UI when it was shown with hideUI (e.g. loading screen → game) */
  const revealSovaSoundBoxUI = useCallback(() => {
    setSoundState(prev => prev && !prev.isVisible ? { ...prev, isVisible: true } : prev);
  }, []);

  const handleClose = useCallback(() => {
    hideSovaSoundBox();
  }, [hideSovaSoundBox]);

  // Memoize the component to prevent unnecessary re-renders
  const SovaSoundBoxComponent = useMemo(() => {
    if (!soundState || !soundState.isVisible) return null;

    return React.createElement(SovaSoundBox, {
      audio: soundState.audio,
      label: soundState.label,
      onClose: handleClose,
      autoCloseOnEnd: true,
    });
  }, [soundState, handleClose]);

  return {
    showSovaSoundBox,
    hideSovaSoundBox,
    revealSovaSoundBoxUI,
    currentSovaSound: soundState,
    SovaSoundBoxComponent,
  };
}

export default useSovaSoundBox;
