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
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import React from 'react';
import SovaSoundBox from '../components/SovaSoundBox';

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
