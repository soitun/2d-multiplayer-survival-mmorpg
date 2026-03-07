import { useMemo } from 'react';
import { remotePlayerInterpolator } from '../engine/runtime/remotePlayerInterpolator';

export const useRemotePlayerInterpolation = () => {
  return useMemo(
    () => ({
      updateAndGetSmoothedPosition: remotePlayerInterpolator.updateAndGetSmoothedPosition.bind(remotePlayerInterpolator),
      cleanupPlayer: remotePlayerInterpolator.cleanupPlayer.bind(remotePlayerInterpolator),
    }),
    []
  );
};