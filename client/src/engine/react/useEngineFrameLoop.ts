import { useEffect, useRef } from 'react';
import type { FrameInfo } from '../../hooks/useGameLoop';
import type { RuntimeEngineConfig } from '../types';
import { runtimeEngine } from '../runtimeEngine';

export function useEngineFrameLoop(
  callback: (frameInfo: FrameInfo) => void,
  config: RuntimeEngineConfig
): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    runtimeEngine.setFrameCallback((frameInfo) => {
      callbackRef.current(frameInfo);
    });
    runtimeEngine.start(config);

    return () => {
      runtimeEngine.setFrameCallback(null);
      runtimeEngine.stop();
    };
  }, [config.enableProfiling, config.maxFrameTime, config.targetFPS]);
}

