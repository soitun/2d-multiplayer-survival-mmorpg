import { useEffect } from 'react';
import type { DbConnection } from '../../generated';
import { uiSubscriptionsRuntime } from '../runtime/uiSubscriptionsRuntime';
import { worldChunkDataRuntime } from '../runtime/worldChunkDataRuntime';

export function useRuntimeBootstrap(connection: DbConnection | null): void {
  useEffect(() => {
    uiSubscriptionsRuntime.start(connection);
    worldChunkDataRuntime.start(connection);

    return () => {
      uiSubscriptionsRuntime.stop();
      worldChunkDataRuntime.stop();
    };
  }, [connection]);
}
