/**
 * ErrorDisplayContext
 *
 * Global error display for in-game feedback. Shows a red rectangle with white text
 * above the XP bar when errors occur (e.g., SOVA voice failures, sound playback errors).
 * Errors fade out in 2 seconds or when clicked.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export interface ErrorDisplayState {
  message: string;
  id: number;
}

interface ErrorDisplayContextValue {
  /** Show an error message (1 sentence max). Replaces any current error. */
  showError: (message: string) => void;
  /** Current error to display, or null if none */
  currentError: ErrorDisplayState | null;
  /** Dismiss the current error */
  dismissError: () => void;
}

const ErrorDisplayContext = createContext<ErrorDisplayContextValue | null>(null);

const FADE_OUT_MS = 2000;
const MAX_MESSAGE_LENGTH = 80; // Truncate long messages

/**
 * Map raw error strings to short user-friendly explanations (1 sentence max).
 * Used when integrating with catch blocks that receive generic errors.
 */
export function getErrorMessageForError(error: unknown): string {
  const str = typeof error === 'string' ? error : (error instanceof Error ? error.message : String(error));

  // SOVA / voice errors
  if (/sova|SOVA|voice|tutorial|entrainment|insanity/i.test(str)) {
    if (/failed to play|playback error|play error/i.test(str)) return 'SOVA voice failed to play.';
    if (/failed to (load|create)|load error|create audio/i.test(str)) return 'SOVA voice file could not load.';
    if (/brew cooldown/i.test(str)) return 'Brew cooldown feedback failed.';
    if (/capability|mobile/i.test(str)) return 'Voice feedback unavailable on this device.';
    if (/memory shard|memory_shard/i.test(str)) return 'Memory shard tutorial audio failed.';
    if (/corpse protection/i.test(str)) return 'Corpse protection voice failed.';
    if (/cairn|lore/i.test(str)) return 'Cairn lore audio failed.';
    return 'SOVA voice error.';
  }

  // General sound errors
  if (/sound|audio|playback/i.test(str)) {
    if (/NotAllowedError|autoplay|user gesture/i.test(str)) return 'Audio blocked: interact with the page first.';
    if (/load|failed to load/i.test(str)) return 'Sound file could not load.';
    if (/timeout/i.test(str)) return 'Sound loading timed out.';
    return 'Audio playback failed.';
  }

  // Reducer / server errors (if we surface them)
  if (/consumeItem|BREW_COOLDOWN/i.test(str)) return 'Action not available.';
  if (/placement|placement failed/i.test(str)) return 'Cannot place here.';
  if (/resources|not enough/i.test(str)) return 'Not enough resources.';

  // Fallback: truncate to one short sentence
  const truncated = str.length > MAX_MESSAGE_LENGTH ? str.slice(0, MAX_MESSAGE_LENGTH) + '…' : str;
  return truncated || 'Something went wrong.';
}

export function ErrorDisplayProvider({ children }: { children: React.ReactNode }) {
  const [currentError, setCurrentError] = useState<ErrorDisplayState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const dismissError = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setCurrentError(null);
  }, []);

  const showError = useCallback((message: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const truncated = message.length > MAX_MESSAGE_LENGTH ? message.slice(0, MAX_MESSAGE_LENGTH) + '…' : message;
    const id = ++idRef.current;

    setCurrentError({ message: truncated, id });

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setCurrentError((prev) => (prev?.id === id ? null : prev));
    }, FADE_OUT_MS);
  }, []);

  return (
    <ErrorDisplayContext.Provider value={{ showError, currentError, dismissError }}>
      {children}
    </ErrorDisplayContext.Provider>
  );
}

export function useErrorDisplay() {
  const ctx = useContext(ErrorDisplayContext);
  if (!ctx) {
    return {
      showError: () => {},
      dismissError: () => {},
      currentError: null,
    };
  }
  return ctx;
}
