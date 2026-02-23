/**
 * useGameLoop - requestAnimationFrame-based game loop with performance monitoring.
 *
 * Drives the main canvas render cycle. Used by GameCanvas to draw the game world each
 * frame. Provides deltaTime, frameCount, and FPS for smooth animations and profiling.
 *
 * Responsibilities:
 * 1. ANIMATION LOOP: Calls the provided callback via requestAnimationFrame, with
 *    real targetFPS gating. Accumulator-based dispatch ensures callback runs at most
 *    targetFPS times/sec even on high-refresh displays (120/144 Hz).
 *
 * 2. FRAME METRICS: Passes FrameInfo (deltaTime, frameCount, fps) to the callback.
 *    deltaTime is clamped for safety (0 < dt < 100ms).
 *
 * 3. PERFORMANCE: Optional profiling tracks slow frames, max frame time, and recent
 *    frame times. Caps maxFrameTime to prevent spiral of death on slow devices.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { MutableRefObject } from 'react';

interface GameLoopOptions {
  targetFPS?: number;
  maxFrameTime?: number;
  enableProfiling?: boolean;
  /** Dev-only: ref to receive periodic metrics (effective FPS, slow-frame ratio, max frame time) */
  metricsRef?: MutableRefObject<GameLoopMetrics | null>;
}

export interface FrameInfo {
  deltaTime: number;
  frameCount: number;
  fps: number;
}

/** Dev-only telemetry for acceptance gates (60/120/144 Hz, slow-frame ratio) */
export interface GameLoopMetrics {
  fps: number;
  effectiveUpdateRate: number; // callbacks/sec
  slowFrameRatio: number; // 0..1
  maxFrameTimeMs: number;
  totalFrames: number;
  slowFrames: number;
}

/** Clamp deltaTime to prevent extreme values from pause/resume or tab switching */
const DELTA_TIME_MIN_MS = 0.1;
const DELTA_TIME_MAX_MS = 100;

/** Max accumulated time before we cap to prevent spiral-of-death (4 frames worth) */
const ACCUMULATOR_CAP_MULTIPLIER = 4;

/**
 * Manages a requestAnimationFrame loop with performance monitoring and targetFPS gating.
 * @param callback - The function to call on each paced frame. Receives (frameInfo) => void
 * @param options - Configuration options for the game loop.
 */
export function useGameLoop(
  callback: (frameInfo: FrameInfo) => void,
  options: GameLoopOptions = {}
): void {
  const {
    targetFPS = 60,
    maxFrameTime = 16.67, // ~60fps target
    enableProfiling = false,
    metricsRef
  } = options;

  const requestIdRef = useRef<number>(0);
  const savedCallback = useRef(callback);
  const lastTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const fpsCounterRef = useRef({ frames: 0, lastSecond: 0 });
  const currentFpsRef = useRef<number>(60);
  const accumulatorRef = useRef<number>(0);

  const performanceMetricsRef = useRef({
    slowFrames: 0,
    totalFrames: 0,
    maxFrameTime: 0,
    recentFrameTimes: [] as number[]
  });

  // Update the saved callback function if it changes
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Performance monitoring
  const updateMetrics = useCallback((frameTime: number) => {
    const metrics = performanceMetricsRef.current;
    metrics.totalFrames++;

    if (frameTime > maxFrameTime) {
      metrics.slowFrames++;
    }

    metrics.maxFrameTime = Math.max(metrics.maxFrameTime, frameTime);

    // Keep last 60 frame times for analysis
    metrics.recentFrameTimes.push(frameTime);
    if (metrics.recentFrameTimes.length > 60) {
      metrics.recentFrameTimes.shift();
    }
  }, [maxFrameTime]);

  const logSlowFrame = useCallback((frameTime: number, frameCount: number) => {
    if (enableProfiling) {
      const metrics = performanceMetricsRef.current;
      const avgRecent = metrics.recentFrameTimes.length > 0
        ? metrics.recentFrameTimes.reduce((a, b) => a + b, 0) / metrics.recentFrameTimes.length
        : 0;

      console.warn(
        `[useGameLoop] SLOW FRAME DETECTED!\n` +
        `  Frame #${frameCount}: ${frameTime.toFixed(2)}ms (${(frameTime / maxFrameTime * 100).toFixed(0)}% over budget)\n` +
        `  Target: ${maxFrameTime.toFixed(2)}ms | Recent avg: ${avgRecent.toFixed(2)}ms\n` +
        `  Slow frames: ${metrics.slowFrames}/${metrics.totalFrames} (${(metrics.slowFrames / metrics.totalFrames * 100).toFixed(1)}%)\n` +
        `  Check your callback for expensive operations!`
      );
    }
  }, [maxFrameTime, enableProfiling]);

  // Effect to manage the animation frame loop
  useEffect(() => {
    const startTime = performance.now();
    lastTimeRef.current = startTime;
    frameCountRef.current = 0;
    accumulatorRef.current = 0;
    fpsCounterRef.current = { frames: 0, lastSecond: Math.floor(startTime / 1000) };

    const targetIntervalMs = 1000 / targetFPS;
    const accumulatorCap = targetIntervalMs * ACCUMULATOR_CAP_MULTIPLIER;

    const loop = (currentTime: number) => {
      const frameStartTime = performance.now();
      const rawDelta = currentTime - lastTimeRef.current;
      lastTimeRef.current = currentTime;

      // Accumulate time; cap to prevent spiral-of-death after long stalls
      accumulatorRef.current = Math.min(accumulatorRef.current + rawDelta, accumulatorCap);

      // Run callback only when we've accumulated enough for target interval
      while (accumulatorRef.current >= targetIntervalMs) {
        accumulatorRef.current -= targetIntervalMs;
        frameCountRef.current++;

        // Use fixed interval for deterministic behavior; clamp for consumer safety
        const deltaTime = Math.max(
          DELTA_TIME_MIN_MS,
          Math.min(targetIntervalMs, DELTA_TIME_MAX_MS)
        );

        // FPS counter
        const currentSecond = Math.floor(currentTime / 1000);
        if (currentSecond !== fpsCounterRef.current.lastSecond) {
          currentFpsRef.current = fpsCounterRef.current.frames;
          if (enableProfiling && fpsCounterRef.current.frames > 90) {
            console.log(`[useGameLoop] High FPS detected: ${fpsCounterRef.current.frames}fps (likely high refresh rate monitor)`);
          }
          fpsCounterRef.current = { frames: 0, lastSecond: currentSecond };
        }
        fpsCounterRef.current.frames++;

        const frameInfo: FrameInfo = {
          deltaTime,
          frameCount: frameCountRef.current,
          fps: currentFpsRef.current
        };

        try {
          savedCallback.current(frameInfo);
        } catch (error) {
          console.error('[useGameLoop] Error in callback:', error);
        }

        const frameEndTime = performance.now();
        const frameTime = frameEndTime - frameStartTime;
        updateMetrics(frameTime);

        if (frameTime > maxFrameTime) {
          logSlowFrame(frameTime, frameCountRef.current);
          if (frameTime > maxFrameTime * 3) {
            console.error(`[useGameLoop] SEVERE LAG SPIKE: ${frameTime.toFixed(2)}ms frame (${(frameTime / maxFrameTime).toFixed(1)}x budget) - Check for chunk system issues!`);
          }
        }

        if (enableProfiling && frameCountRef.current % 600 === 0) {
          const metrics = performanceMetricsRef.current;
          const avgRecent = metrics.recentFrameTimes.length > 0
            ? metrics.recentFrameTimes.reduce((a, b) => a + b, 0) / metrics.recentFrameTimes.length
            : 0;
          console.log(
            `[useGameLoop] Performance Summary (${frameCountRef.current} frames):\n` +
            `  FPS: ${currentFpsRef.current} | Avg frame time: ${avgRecent.toFixed(2)}ms\n` +
            `  Slow frames: ${metrics.slowFrames} (${metrics.totalFrames > 0 ? (metrics.slowFrames / metrics.totalFrames * 100).toFixed(1) : 0}%)\n` +
            `  Max frame time: ${metrics.maxFrameTime.toFixed(2)}ms`
          );
        }

        // Dev-only telemetry: update metricsRef for debug overlay / acceptance gates
        if (metricsRef) {
          const m = performanceMetricsRef.current;
          metricsRef.current = {
            fps: currentFpsRef.current,
            effectiveUpdateRate: currentFpsRef.current,
            slowFrameRatio: m.totalFrames > 0 ? m.slowFrames / m.totalFrames : 0,
            maxFrameTimeMs: m.maxFrameTime,
            totalFrames: m.totalFrames,
            slowFrames: m.slowFrames
          };
        }
      }

      requestIdRef.current = requestAnimationFrame(loop);
    };

    if (enableProfiling) {
      console.log(`[useGameLoop] Starting game loop. Target: ${targetFPS}fps (${targetIntervalMs.toFixed(2)}ms interval, ${maxFrameTime.toFixed(2)}ms budget per frame)`);
    }
    requestIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (enableProfiling) {
        const metrics = performanceMetricsRef.current;
        console.log(
          `[useGameLoop] Stopping game loop.\n` +
          `  Total frames: ${metrics.totalFrames}\n` +
          `  Slow frames: ${metrics.slowFrames} (${metrics.totalFrames > 0 ? (metrics.slowFrames / metrics.totalFrames * 100).toFixed(1) : 0}%)\n` +
          `  Max frame time: ${metrics.maxFrameTime.toFixed(2)}ms`
        );
      }
      cancelAnimationFrame(requestIdRef.current);
    };
  }, [targetFPS, maxFrameTime, enableProfiling, logSlowFrame, updateMetrics, metricsRef]);
} 