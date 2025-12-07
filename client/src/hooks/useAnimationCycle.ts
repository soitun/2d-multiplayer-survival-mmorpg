// PERFORMANCE FIX: Use refs instead of state to avoid React re-render cascades
// The animation frame value is read via refs in the game loop, not via React state
// This eliminates ~60 React re-renders per second per animation hook

import { useEffect, useRef } from 'react';

// Shared animation frame refs - accessible from outside the hooks
// These are updated by RAF without triggering React re-renders
const walkingFrameRef = { current: 0 };
const sprintFrameRef = { current: 0 };
const idleFrameRef = { current: 0 };

// Track if animation loops are already running (singleton pattern)
let walkingLoopRunning = false;
let sprintLoopRunning = false;
let idleLoopRunning = false;

// Start a single shared animation loop for a given animation type
function startAnimationLoop(
  frameRef: { current: number },
  frameDuration: number,
  numFrames: number,
  runningFlagSetter: (v: boolean) => void
): () => void {
  let rafId: number | null = null;
  let lastFrameTime = 0;

  const animate = (time: number) => {
    if (lastFrameTime === 0) {
      lastFrameTime = time;
    }

    const deltaTime = time - lastFrameTime;
    if (deltaTime >= frameDuration) {
      frameRef.current = (frameRef.current + 1) % numFrames;
      lastFrameTime = time;
    }

    rafId = requestAnimationFrame(animate);
  };

  rafId = requestAnimationFrame(animate);

  return () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    runningFlagSetter(false);
  };
}

// Walking animation: 150ms per frame, 4 frames
export function useWalkingAnimationCycle(): number {
  const frameRef = useRef(walkingFrameRef);

  useEffect(() => {
    if (walkingLoopRunning) {
      // Loop already running, just return current value
      return;
    }
    walkingLoopRunning = true;
    
    const cleanup = startAnimationLoop(
      walkingFrameRef,
      150, // 150ms per frame
      4,   // 4 frames
      (v) => { walkingLoopRunning = v; }
    );

    return cleanup;
  }, []);

  // Return current frame value (read from shared ref)
  // Note: This won't cause re-renders - the game loop reads frameRef.current directly
  return frameRef.current.current;
}

// Sprint animation: 100ms per frame, 4 frames (faster)
export function useSprintAnimationCycle(): number {
  const frameRef = useRef(sprintFrameRef);

  useEffect(() => {
    if (sprintLoopRunning) {
      return;
    }
    sprintLoopRunning = true;
    
    const cleanup = startAnimationLoop(
      sprintFrameRef,
      100, // 100ms per frame
      4,   // 4 frames
      (v) => { sprintLoopRunning = v; }
    );

    return cleanup;
  }, []);

  return frameRef.current.current;
}

// Idle animation: 500ms per frame, 4 frames (slower)
export function useIdleAnimationCycle(): number {
  const frameRef = useRef(idleFrameRef);

  useEffect(() => {
    if (idleLoopRunning) {
      return;
    }
    idleLoopRunning = true;
    
    const cleanup = startAnimationLoop(
      idleFrameRef,
      500, // 500ms per frame
      4,   // 4 frames
      (v) => { idleLoopRunning = v; }
    );

    return cleanup;
  }, []);

  return frameRef.current.current;
}

// Legacy base hook (kept for compatibility but NOT recommended)
// Uses the same ref-based pattern
export function useAnimationCycle(frameDuration: number, numFrames: number): number {
  const frameRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  useEffect(() => {
    const animate = (time: number) => {
    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = time;
    }

    const deltaTime = time - lastFrameTimeRef.current;
    if (deltaTime >= frameDuration) {
        frameRef.current = (frameRef.current + 1) % numFrames;
      lastFrameTimeRef.current = time;
    }

    rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [frameDuration, numFrames]);

  return frameRef.current;
}
