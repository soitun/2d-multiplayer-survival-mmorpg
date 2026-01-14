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

// Declare global window functions for checking SOVA playback state
declare global {
  interface Window {
    __SOVA_SOUNDBOX_IS_PLAYING__?: () => boolean;
    __SOVA_SOUNDBOX_AUDIO_REF__?: HTMLAudioElement | null;
    __LOADING_SCREEN_AUDIO_IS_PLAYING__?: () => boolean;
    __STOP_LOADING_SCREEN_SOVA_AUDIO__?: () => void;
  }
}

/**
 * Check if SOVA SoundBox is currently playing audio.
 * Use this to prevent achievement/level up/mission sounds from interrupting tutorials.
 */
export function isSovaSoundBoxPlaying(): boolean {
  if (typeof window !== 'undefined' && typeof window.__SOVA_SOUNDBOX_IS_PLAYING__ === 'function') {
    return window.__SOVA_SOUNDBOX_IS_PLAYING__();
  }
  return false;
}

/**
 * Check if loading screen SOVA audio is currently playing.
 * Use this to prevent achievement/level up/mission sounds from interrupting intro.
 */
export function isLoadingScreenAudioPlaying(): boolean {
  if (typeof window !== 'undefined' && typeof window.__LOADING_SCREEN_AUDIO_IS_PLAYING__ === 'function') {
    return window.__LOADING_SCREEN_AUDIO_IS_PLAYING__();
  }
  return false;
}

/**
 * Check if ANY SOVA audio is currently playing (SoundBox OR loading screen).
 * This is the main function to use when checking if short notification sounds should be skipped.
 */
export function isAnySovaAudioPlaying(): boolean {
  return isSovaSoundBoxPlaying() || isLoadingScreenAudioPlaying();
}

export interface SovaSoundState {
  audio: HTMLAudioElement | null;
  label: string;
  isVisible: boolean;
}

interface UseSovaSoundBoxReturn {
  /** Show the SOVA sound box with the given audio and label */
  showSovaSoundBox: (audio: HTMLAudioElement, label?: string) => void;
  /** Hide the current SOVA sound box and stop audio */
  hideSovaSoundBox: () => void;
  /** Current state of the SOVA sound */
  currentSovaSound: SovaSoundState | null;
  /** The SovaSoundBox component to render - render this in your component tree */
  SovaSoundBoxComponent: React.ReactNode;
}

export function useSovaSoundBox(): UseSovaSoundBoxReturn {
  const [soundState, setSoundState] = useState<SovaSoundState | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Expose global function to check if SOVA is playing
  // This allows achievement/level up/mission notifications to check before playing
  useEffect(() => {
    window.__SOVA_SOUNDBOX_AUDIO_REF__ = audioRef.current;
    window.__SOVA_SOUNDBOX_IS_PLAYING__ = () => {
      const audio = audioRef.current;
      if (!audio) return false;
      // Check if audio exists, is not paused, and hasn't ended
      return !audio.paused && !audio.ended && audio.currentTime > 0;
    };

    return () => {
      // Clean up on unmount
      delete window.__SOVA_SOUNDBOX_IS_PLAYING__;
      delete window.__SOVA_SOUNDBOX_AUDIO_REF__;
    };
  }, []);

  // Update the global ref whenever audioRef changes
  useEffect(() => {
    window.__SOVA_SOUNDBOX_AUDIO_REF__ = audioRef.current;
  }, [soundState]);

  const showSovaSoundBox = useCallback((audio: HTMLAudioElement, label: string = 'SOVA') => {
    // Stop any existing SovaSoundBox audio first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // IMPORTANT: Also stop any loading screen SOVA audio that might be playing
    // The loading screen has its own audio system with preloaded files
    // This ensures tutorial/insanity sounds don't overlap with loading screen voice lines
    // @ts-ignore
    if (typeof window.__STOP_LOADING_SCREEN_SOVA_AUDIO__ === 'function') {
      // @ts-ignore
      window.__STOP_LOADING_SCREEN_SOVA_AUDIO__();
    }

    audioRef.current = audio;
    window.__SOVA_SOUNDBOX_AUDIO_REF__ = audio;
    setSoundState({
      audio,
      label,
      isVisible: true,
    });
  }, []);

  const hideSovaSoundBox = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    audioRef.current = null;
    window.__SOVA_SOUNDBOX_AUDIO_REF__ = null;
    setSoundState(null);
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
    currentSovaSound: soundState,
    SovaSoundBoxComponent,
  };
}

export default useSovaSoundBox;
