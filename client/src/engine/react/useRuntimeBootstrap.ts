import { useEffect } from 'react';
import type { DbConnection } from '../../generated';
import { uiSubscriptionsRuntime } from '../runtime/uiSubscriptionsRuntime';
import { worldChunkDataRuntime } from '../runtime/worldChunkDataRuntime';
import { gameplayEventEffectsRuntime } from '../runtime/gameplayEventEffectsRuntime';

export function useRuntimeBootstrap(
  connection: DbConnection | null,
  localPlayerId: string | null,
): void {
  useEffect(() => {
    uiSubscriptionsRuntime.start(connection);
    worldChunkDataRuntime.start(connection);

    return () => {
      uiSubscriptionsRuntime.stop();
      worldChunkDataRuntime.stop();
    };
  }, [connection]);

  useEffect(() => {
    gameplayEventEffectsRuntime.start(connection, localPlayerId);

    return () => {
      gameplayEventEffectsRuntime.stop();
    };
  }, [connection, localPlayerId]);
}
